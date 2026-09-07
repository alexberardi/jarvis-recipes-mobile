/**
 * FLOW: getting in, and staying in.
 *
 * Crosses the one boundary no single-screen test can: RootNavigator swapping the
 * whole navigator tree when `isAuthenticated` flips. A login that stores tokens
 * but leaves the user staring at the landing screen passes every LoginScreen
 * test and is completely broken.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { USER_KEY } from '../../src/config/storageKeys';
import RootNavigator from '../../src/navigation/RootNavigator';
import {
  apiRecipe,
  authResponse,
  httpError,
  lastByText,
  lastCallTo,
  renderInApp,
  resetApi,
  route,
} from './harness';

jest.mock('../../src/api/recipesApi', () => require('./fakeApi').recipesApiMock());
jest.mock('../../src/api/authApi', () => require('./fakeApi').authApiMock());

/** The recipes tab lands first, so its fetches have to be answered. */
const stubRecipesTab = () => {
  route('GET', '/recipes/parse-url/jobs', { jobs: [] });
  route('GET', /^\/recipes$/, [apiRecipe()]);
  route('GET', '/tags', []);
};

beforeEach(async () => {
  resetApi();
  jest.clearAllMocks();
  await AsyncStorage.clear();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
});

const signIn = async () => {
  fireEvent.press(await screen.findByText('Log In'));
  await screen.findByText('Need an account? Create one');
  fireEvent.changeText(lastByText('Email'), '  Cook@Example.com  ');
  fireEvent.changeText(lastByText('Password'), 'hunter2');
  fireEvent.press(lastByText('Log In'));
};

test('a signed-out visitor lands on the pitch, not the app', async () => {
  stubRecipesTab();
  renderInApp(<RootNavigator />, { withAuth: true });

  await waitFor(() =>
    expect(screen.getByText('Family recipes, meal planning, and shopping in one place.')).toBeTruthy(),
  );
  expect(screen.queryByText('Recipes')).toBeNull();
});

test('logging in replaces the auth stack with the app', async () => {
  stubRecipesTab();
  route('POST', '/auth/login', authResponse());

  renderInApp(<RootNavigator />, { withAuth: true });
  await signIn();

  // The tab bar only exists on the authenticated side of RootNavigator.
  await waitFor(() => expect(screen.getByText('Planner')).toBeTruthy());
  // Waited for, not asserted synchronously: the tab bar appears the moment
  // `isAuthenticated` flips, while the recipe list is still fetching. Locally it
  // had usually resolved by now; under CI's slower, coverage-instrumented run it
  // had not, and this failed there while passing here.
  await waitFor(() => expect(screen.getByText('Beef Stroganoff')).toBeTruthy());
});

test('the email is trimmed but the password is sent untouched', async () => {
  // A password may legitimately begin or end with a space; an email may not.
  stubRecipesTab();
  route('POST', '/auth/login', authResponse());

  renderInApp(<RootNavigator />, { withAuth: true });
  await signIn();
  await waitFor(() => expect(lastCallTo('POST', '/auth/login')).toBeDefined());

  expect(lastCallTo('POST', '/auth/login')!.data).toEqual({
    email: 'Cook@Example.com',
    password: 'hunter2',
  });
});

/**
 * KNOWN BUG, deliberately left red-but-expected.
 *
 * jarvis-auth looks users up with `User.email == email` (user_service.py:11), an
 * exact match, and LoginScreen only trims. So someone who registered
 * cook@example.com and types Cook@Example.com is told their password is wrong.
 * autoCapitalize="none" makes it uncommon rather than impossible — a paste or a
 * password manager can still supply mixed case.
 *
 * `test.failing` passes while the bug exists and FAILS the moment the fix lands,
 * which is the prompt to delete this block and fold the assertion into the test
 * above. Fix belongs in LoginScreen/RegisterScreen (lowercase before send) or in
 * jarvis-auth (func.lower comparison) — not here.
 */
test.failing('the email is lowercased so case cannot lock you out', async () => {
  stubRecipesTab();
  route('POST', '/auth/login', authResponse());

  renderInApp(<RootNavigator />, { withAuth: true });
  await signIn();
  await waitFor(() => expect(lastCallTo('POST', '/auth/login')).toBeDefined());

  expect(lastCallTo('POST', '/auth/login')!.data.email).toBe('cook@example.com');
});

test('the token pair goes to the keychain and only the user blob to AsyncStorage', async () => {
  // The security property worth a test: an access/refresh pair in AsyncStorage
  // is readable by anything with filesystem access on a rooted device.
  stubRecipesTab();
  route('POST', '/auth/login', authResponse());

  renderInApp(<RootNavigator />, { withAuth: true });
  await signIn();
  await waitFor(() => expect(screen.getByText('Planner')).toBeTruthy());

  const keychainWrites = (SecureStore.setItemAsync as jest.Mock).mock.calls;
  expect(keychainWrites.map((c) => c[1])).toEqual(
    expect.arrayContaining(['access-token-1', 'refresh-token-1']),
  );

  const stored = await AsyncStorage.getItem(USER_KEY);
  expect(JSON.parse(stored!)).toEqual({ id: 7, email: 'cook@example.com', username: 'cook' });
  const asyncKeys = await AsyncStorage.getAllKeys();
  const asyncValues = await AsyncStorage.multiGet(asyncKeys);
  expect(JSON.stringify(asyncValues)).not.toContain('refresh-token-1');
});

test('a rejected login says why and keeps you on the form', async () => {
  stubRecipesTab();
  route('POST', '/auth/login', httpError(401, 'Incorrect email or password'));

  renderInApp(<RootNavigator />, { withAuth: true });
  await signIn();

  await waitFor(() => expect(screen.getByText('Incorrect email or password')).toBeTruthy());
  expect(screen.queryByText('Planner')).toBeNull();
});

test('a stored session opens straight into the app', async () => {
  stubRecipesTab();
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key: string) =>
    key.includes('refresh') ? 'stored-refresh' : 'stored-access',
  );
  await AsyncStorage.setItem(USER_KEY, JSON.stringify({ id: 7, email: 'cook@example.com' }));

  renderInApp(<RootNavigator />, { withAuth: true });

  await waitFor(() => expect(screen.getByText('Planner')).toBeTruthy());
  expect(screen.queryByText('Family recipes, meal planning, and shopping in one place.')).toBeNull();
});

test('a stored token with no stored user is not a session', async () => {
  // Half-written state from an interrupted login: treat it as signed out rather
  // than rendering the app with `user` null.
  stubRecipesTab();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('stored-access');

  renderInApp(<RootNavigator />, { withAuth: true });

  await waitFor(() =>
    expect(screen.getByText('Family recipes, meal planning, and shopping in one place.')).toBeTruthy(),
  );
});

test('signing out from the account tab returns to the landing screen', async () => {
  stubRecipesTab();
  route('POST', '/auth/login', authResponse());

  renderInApp(<RootNavigator />, { withAuth: true });
  await signIn();
  await waitFor(() => expect(screen.getByText('Planner')).toBeTruthy());

  fireEvent.press(screen.getByText('Account'));
  fireEvent.press(await screen.findByText('Logout'));

  await waitFor(() =>
    expect(screen.getByText('Family recipes, meal planning, and shopping in one place.')).toBeTruthy(),
  );
  expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  expect(await AsyncStorage.getItem(USER_KEY)).toBeNull();
});
