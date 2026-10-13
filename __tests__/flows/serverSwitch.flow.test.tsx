/**
 * FLOW: pointing the app at your own Jarvis.
 *
 * Self-hosted, so the endpoint cannot be compiled in — and the failure mode if
 * it is wrong is the worst kind: login fails against an address the person never
 * chose, with a network error that looks like their server being down.
 *
 * One address, not two. jarvis-config-service already holds every service's
 * externally-reachable coordinates, so the app asks it rather than making
 * someone type each one. The per-service fields survive behind "Advanced" for a
 * service nobody has registered yet.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import * as discovery from '../../src/config/configDiscovery';
import RootNavigator from '../../src/navigation/RootNavigator';
import {
  DEFAULT_URLS,
  getServerUrls,
  resetServerUrls,
} from '../../src/config/serverConfig';
import { SERVER_URLS_KEY } from '../../src/config/storageKeys';
import { apiRecipe, authResponse, lastByText, renderInApp, resetApi, route } from './harness';

jest.mock('../../src/api/recipesApi', () => require('./fakeApi').recipesApiMock());
jest.mock('../../src/api/authApi', () => require('./fakeApi').authApiMock());

const CONFIG = 'http://10.0.0.107:7700';
const FOUND = { auth: 'http://10.0.0.107:7701', recipes: 'http://10.0.0.107:7030' };

let discover: jest.SpyInstance;

beforeEach(async () => {
  resetApi();
  await AsyncStorage.clear();
  await resetServerUrls();
  discover = jest.spyOn(discovery, 'discoverServices').mockResolvedValue({ ...FOUND });
  route('GET', '/recipes/parse-url/jobs', { jobs: [] });
  route('GET', /^\/recipes$/, [apiRecipe()]);
  route('GET', '/tags', []);
  route('POST', '/auth/login', authResponse());
});

afterEach(() => discover.mockRestore());

const openDialog = async () => {
  // On the landing screen, before sign-in: an account exists on one server, so
  // "which server?" has to be answerable before logging in.
  fireEvent.press(await screen.findByLabelText(/^Server address: /));
  await screen.findByText('Server address');
};

test('the current address is shown before you sign in', async () => {
  renderInApp(<RootNavigator />, { withAuth: true });

  const button = await screen.findByLabelText(/^Server address: /);
  expect(button.props.accessibilityLabel).toContain(
    DEFAULT_URLS.recipes.replace(/^https?:\/\//, ''),
  );
});

test('one address resolves the services behind it', async () => {
  // The whole point of asking config-service instead of asking the person.
  renderInApp(<RootNavigator />, { withAuth: true });
  await openDialog();

  fireEvent.changeText(lastByText('Jarvis address'), '10.0.0.107:7700');
  fireEvent.press(screen.getByText('Save'));

  await waitFor(() => expect(discover).toHaveBeenCalledWith(CONFIG));
  await waitFor(() => expect(getServerUrls()).toEqual(FOUND));
});

test('the resolved addresses are shown, not just accepted', async () => {
  // A wrong address and a right one look identical until a request fails.
  await AsyncStorage.setItem(
    SERVER_URLS_KEY,
    JSON.stringify({ configUrl: CONFIG, overrides: {}, discovered: FOUND }),
  );

  renderInApp(<RootNavigator />, { withAuth: true });
  await openDialog();

  expect(screen.getByText(/recipes · 10\.0\.0\.107:7030/)).toBeTruthy();
  expect(screen.getByText(/auth · 10\.0\.0\.107:7701/)).toBeTruthy();
});

test('a service config-service does not list can be pinned by hand', async () => {
  // The normal state until someone adds the recipes row on the admin Services
  // page: auth resolves, recipes does not.
  discover.mockResolvedValue({ auth: FOUND.auth });

  renderInApp(<RootNavigator />, { withAuth: true });
  await openDialog();
  fireEvent.changeText(lastByText('Jarvis address'), CONFIG);
  fireEvent.press(screen.getByText('Advanced'));
  fireEvent.changeText(lastByText('Recipes server (optional)'), '10.0.0.50:7030');
  fireEvent.press(screen.getByText('Save'));

  await waitFor(() => expect(getServerUrls().recipes).toBe('http://10.0.0.50:7030'));
  // Auth still comes from discovery.
  expect(getServerUrls().auth).toBe(FOUND.auth);
});

test('an address that is not one cannot be saved', async () => {
  renderInApp(<RootNavigator />, { withAuth: true });
  await openDialog();

  fireEvent.changeText(lastByText('Jarvis address'), 'http://');

  await waitFor(() => expect(screen.getByText(/does not look like an address/)).toBeTruthy());
  fireEvent.press(screen.getByText('Save'));
  expect(screen.getByText('Server address')).toBeTruthy();
  expect(getServerUrls()).toEqual(DEFAULT_URLS);
});

test('resetting goes back to the build defaults', async () => {
  await AsyncStorage.setItem(
    SERVER_URLS_KEY,
    JSON.stringify({ configUrl: CONFIG, overrides: {}, discovered: FOUND }),
  );

  renderInApp(<RootNavigator />, { withAuth: true });
  await openDialog();
  fireEvent.press(screen.getByText('Reset'));

  await waitFor(() => expect(getServerUrls()).toEqual(DEFAULT_URLS));
});

test('a stored address is in force before anything requests', async () => {
  // AuthContext resolves it at the top of bootstrap, ahead of reading the
  // tokens, so a cold start's refresh goes to the right host rather than to
  // the build's localhost default.
  await AsyncStorage.setItem(
    SERVER_URLS_KEY,
    JSON.stringify({ configUrl: CONFIG, overrides: {}, discovered: FOUND }),
  );

  renderInApp(<RootNavigator />, { withAuth: true });

  await waitFor(() => expect(getServerUrls().recipes).toBe(FOUND.recipes));
});
