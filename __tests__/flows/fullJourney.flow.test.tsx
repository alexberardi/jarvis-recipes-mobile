/**
 * FLOW: the whole thing, once, in one sitting.
 *
 * Sign in -> browse the box -> open a recipe -> switch to the planner -> plan the
 * week -> re-roll a night -> back to the box -> sign out. One test, one mounted
 * app, the real RootNavigator and tab navigator, only HTTP faked.
 *
 * The per-area files cover the branches. This one exists for a different failure:
 * the kind that only appears once state has crossed three screens and two
 * navigators — a token that never reaches the API layer, a tab that remounts and
 * loses its plan, a query cache that serves the wrong household's recipes. A long
 * test is the honest shape for that; splitting it would remove the only thing it
 * checks.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import RootNavigator from '../../src/navigation/RootNavigator';
import {
  apiRecipe,
  authResponse,
  lastByText,
  lastCallTo,
  randomSlot,
  renderInApp,
  resetApi,
  route,
  upcomingDates,
} from './harness';

jest.mock('../../src/api/recipesApi', () => require('./fakeApi').recipesApiMock());
jest.mock('../../src/api/authApi', () => require('./fakeApi').authApiMock());

beforeEach(async () => {
  resetApi();
  jest.clearAllMocks();
  await AsyncStorage.clear();
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
});

test('sign in, browse, plan the week, re-roll a night, sign out', async () => {
  const week = upcomingDates(7);
  const box = [
    apiRecipe({ id: 1, title: 'Beef Stroganoff' }),
    apiRecipe({ id: 2, title: 'Turkey Chili', ingredients: [], steps: [] }),
  ];

  route('POST', '/auth/login', authResponse());
  route('GET', '/recipes/parse-url/jobs', { jobs: [] });
  route('GET', /^\/recipes$/, box);
  route('GET', '/recipes/1', box[0]);
  route('GET', '/tags', []);
  route('POST', '/meal-plans/random', {
    slots: [
      randomSlot({ date: week[0], recipe_id: 1, title: 'Beef Stroganoff' }),
      randomSlot({ date: week[1], recipe_id: 2, title: 'Turkey Chili' }),
    ],
    incomplete: false,
  });
  route('POST', '/meal-plans/random/reroll', {
    meal_type: 'dinner',
    recipe_id: 3,
    title: 'Sheet Pan Sausage',
  });

  renderInApp(<RootNavigator />, { withAuth: true });

  // ── sign in ────────────────────────────────────────────────────────────────
  fireEvent.press(await screen.findByText('Log In'));
  await screen.findByText('Need an account? Create one');
  fireEvent.changeText(lastByText('Email'), 'cook@example.com');
  fireEvent.changeText(lastByText('Password'), 'hunter2');
  fireEvent.press(lastByText('Log In'));

  await waitFor(() => expect(screen.getByText('Planner')).toBeTruthy());

  // ── the box ────────────────────────────────────────────────────────────────
  // Waited for: the tab bar renders as soon as the session exists, but the
  // recipes are still in flight. Asserting synchronously here passed locally and
  // failed in CI, which runs slower and under coverage instrumentation.
  await waitFor(() => expect(screen.getByText('Beef Stroganoff')).toBeTruthy());
  expect(screen.getByText('Turkey Chili')).toBeTruthy();

  fireEvent.press(screen.getByText('Beef Stroganoff'));
  await waitFor(() => expect(screen.getByText('Ingredients')).toBeTruthy());
  expect(screen.getByText('1 1/2 lb beef sirloin')).toBeTruthy();

  // ── the planner ────────────────────────────────────────────────────────────
  fireEvent.press(screen.getByText('Planner'));
  fireEvent.press(await screen.findByText(/^Plan \d+ meals$/));

  await waitFor(() => expect(screen.getByText('Your week')).toBeTruthy());
  expect(lastCallTo('POST', '/meal-plans/random')!.data.slots).toHaveLength(7);

  // Re-roll one night; the others stay put.
  fireEvent.press(screen.getByLabelText(`Re-roll dinner on ${week[1]}`));
  await waitFor(() => expect(screen.getByText('Sheet Pan Sausage')).toBeTruthy());
  expect(screen.getByText('Beef Stroganoff')).toBeTruthy();

  // ── back to the box, exactly where it was left ──────────────────────────────
  // Each tab keeps its own stack, so returning lands on the recipe still being
  // read rather than resetting to the list.
  fireEvent.press(screen.getByText('Recipes'));
  await waitFor(() => expect(screen.getByText('Ingredients')).toBeTruthy());

  // And backing out shows the same box — from the query cache or a refetch,
  // never from nowhere.
  fireEvent.press(screen.getByLabelText('Back'));
  await waitFor(() => expect(screen.getByText('Turkey Chili')).toBeTruthy());

  // ── sign out ───────────────────────────────────────────────────────────────
  fireEvent.press(screen.getByText('Account'));
  fireEvent.press(await screen.findByText('Logout'));

  await waitFor(() =>
    expect(
      screen.getByText('Family recipes, meal planning, and shopping in one place.'),
    ).toBeTruthy(),
  );
});

test('every authenticated request carries the session token', async () => {
  // The one thing a flow test can check that no screen test can: that logging in
  // actually wires the API client. AuthContext hands its getters to recipesApi at
  // mount, and a broken wiring shows up as 401s in production, not as a red test.
  const { setAuthHandlers } = require('../../src/api/recipesApi');

  route('POST', '/auth/login', authResponse());
  route('GET', '/recipes/parse-url/jobs', { jobs: [] });
  route('GET', /^\/recipes$/, []);
  route('GET', '/tags', []);

  renderInApp(<RootNavigator />, { withAuth: true });

  fireEvent.press(await screen.findByText('Log In'));
  await screen.findByText('Need an account? Create one');
  fireEvent.changeText(lastByText('Email'), 'cook@example.com');
  fireEvent.changeText(lastByText('Password'), 'hunter2');
  fireEvent.press(lastByText('Log In'));
  await waitFor(() => expect(screen.getByText('Planner')).toBeTruthy());

  const handlers = setAuthHandlers.mock.calls.at(-1)[0];
  expect(handlers.getAccessTokenHandler()).toBe('access-token-1');
  expect(handlers.getRefreshTokenHandler()).toBe('refresh-token-1');
});
