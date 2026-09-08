/**
 * FLOW: pointing the app at your own server.
 *
 * Jarvis is self-hosted, so the endpoint cannot be compiled in — and the failure
 * mode if this is wrong is the worst kind: login fails against an address the
 * person never chose, with a network error that looks like their server is down.
 *
 * The mechanism worth pinning is that the axios clients resolve the address on
 * every REQUEST. Reading it once, at `axios.create` time, would capture whatever
 * was known before AsyncStorage had been read — which is exactly when a cold
 * start's token refresh goes out.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import RootNavigator from '../../src/navigation/RootNavigator';
import {
  DEFAULT_URLS,
  getServerUrls,
  loadServerUrls,
  resetServerUrls,
} from '../../src/config/serverConfig';
import { SERVER_URLS_KEY } from '../../src/config/storageKeys';
import { apiRecipe, authResponse, lastByText, renderInApp, resetApi, route } from './harness';

jest.mock('../../src/api/recipesApi', () => require('./fakeApi').recipesApiMock());
jest.mock('../../src/api/authApi', () => require('./fakeApi').authApiMock());

beforeEach(async () => {
  resetApi();
  await AsyncStorage.clear();
  await resetServerUrls();
  route('GET', '/recipes/parse-url/jobs', { jobs: [] });
  route('GET', /^\/recipes$/, [apiRecipe()]);
  route('GET', '/tags', []);
  route('POST', '/auth/login', authResponse());
});

const openDialog = async () => {
  // The address is on the landing screen, before sign-in: an account exists on
  // one server, so "which server?" has to be answerable before logging in.
  fireEvent.press(await screen.findByLabelText(/^Server address: /));
  await screen.findByText('Server address');
};

test('the current address is shown before you sign in', async () => {
  renderInApp(<RootNavigator />, { withAuth: true });

  const button = await screen.findByLabelText(/^Server address: /);
  // Host and port, no scheme: the line answers "which server?" and the scheme
  // is noise that makes it wrap.
  expect(button.props.accessibilityLabel).toContain(
    DEFAULT_URLS.recipes.replace(/^https?:\/\//, ''),
  );
});

test('setting an address stores it and shows it', async () => {
  renderInApp(<RootNavigator />, { withAuth: true });
  await openDialog();

  fireEvent.changeText(lastByText('Recipes server'), '10.0.0.122:7030');
  fireEvent.press(screen.getByText('Save'));

  await waitFor(() => expect(getServerUrls().recipes).toBe('http://10.0.0.122:7030'));
  expect(await screen.findByLabelText(/10\.0\.0\.122:7030/)).toBeTruthy();
});

test('the auth address is filled in from the recipes one', async () => {
  // Both services on one host at their documented ports is the common install;
  // the guess is shown in the field so a proxied setup can correct it.
  renderInApp(<RootNavigator />, { withAuth: true });
  await openDialog();

  fireEvent.changeText(lastByText('Recipes server'), 'http://10.0.0.122:7030');
  fireEvent.press(screen.getByText('Save'));

  await waitFor(() => expect(getServerUrls().auth).toBe('http://10.0.0.122:7701'));
});

test('an auth address typed by hand is not overwritten', async () => {
  renderInApp(<RootNavigator />, { withAuth: true });
  await openDialog();

  fireEvent.changeText(lastByText('Auth server'), 'https://auth.example.com');
  fireEvent.changeText(lastByText('Recipes server'), 'http://10.0.0.122:7030');
  fireEvent.press(screen.getByText('Save'));

  await waitFor(() => expect(getServerUrls().auth).toBe('https://auth.example.com'));
});

test('an address that is not one cannot be saved', async () => {
  renderInApp(<RootNavigator />, { withAuth: true });
  await openDialog();

  fireEvent.changeText(lastByText('Recipes server'), 'http://');

  await waitFor(() => expect(screen.getByText(/does not look like an address/)).toBeTruthy());
  fireEvent.press(screen.getByText('Save'));
  // Still open, nothing stored.
  expect(screen.getByText('Server address')).toBeTruthy();
  expect(getServerUrls()).toEqual(DEFAULT_URLS);
});

test('resetting goes back to the build defaults', async () => {
  await AsyncStorage.setItem(
    SERVER_URLS_KEY,
    JSON.stringify({ auth: 'http://10.0.0.9:7701', recipes: 'http://10.0.0.9:7030' }),
  );
  await loadServerUrls();

  renderInApp(<RootNavigator />, { withAuth: true });
  await openDialog();
  fireEvent.press(screen.getByText('Reset'));

  await waitFor(() => expect(getServerUrls()).toEqual(DEFAULT_URLS));
});

test('a saved address is in force before anything requests', async () => {
  // The ordering that matters. AuthContext loads it at the top of bootstrap,
  // ahead of reading the tokens, so the first calls of a cold start -- including
  // a token refresh -- go to the right host rather than to localhost.
  await AsyncStorage.setItem(
    SERVER_URLS_KEY,
    JSON.stringify({ auth: 'http://10.0.0.122:7701', recipes: 'http://10.0.0.122:7030' }),
  );

  renderInApp(<RootNavigator />, { withAuth: true });

  await waitFor(() => expect(getServerUrls().recipes).toBe('http://10.0.0.122:7030'));
});
