/**
 * FLOW: the recipe box — browsing it, adding to it, and the import mailbox.
 *
 * The mailbox is the part worth crossing screens for. An import row can outlive
 * the staged recipe it points at (cleanup prunes stage_recipes without touching
 * the job row), and the old behaviour was a row that failed on every tap with an
 * error that replaced the whole list, taking the only way to delete it with it.
 * That is a two-screen, two-request bug; no single-screen test reaches it.
 */
import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import RecipesNavigator from '../../src/navigation/RecipesNavigator';
import {
  apiRecipe,
  callsTo,
  httpError,
  lastByText,
  lastCallTo,
  renderInApp,
  resetApi,
  route,
} from './harness';

jest.mock('../../src/api/recipesApi', () => require('./fakeApi').recipesApiMock());
jest.mock('../../src/api/authApi', () => require('./fakeApi').authApiMock());

const job = (over: Partial<any> = {}) => ({
  id: 'job-1',
  url: 'https://example.com/stroganoff',
  status: 'COMPLETE',
  completed_at: new Date().toISOString(),
  preview: { title: 'Beef Stroganoff', source_host: 'example.com' },
  ...over,
});

beforeEach(() => {
  resetApi();
  jest.restoreAllMocks();
  route('GET', '/recipes/parse-url/jobs', { jobs: [] });
  route('GET', /^\/recipes$/, [apiRecipe({ id: 1, title: 'Beef Stroganoff' })]);
  route('GET', '/tags', []);
});

/** Answer the Alert with the button carrying this label. */
const autoConfirm = (label: string) =>
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    (buttons ?? []).find((b) => b.text === label)?.onPress?.();
  });

test('the list shows the box and opens a recipe', async () => {
  route('GET', '/recipes/1', apiRecipe({ id: 1, title: 'Beef Stroganoff' }));

  renderInApp(<RecipesNavigator />);

  fireEvent.press(await screen.findByText('Beef Stroganoff'));

  // The detail screen fetches by integer id and renders the body.
  await waitFor(() => expect(screen.getByText('Ingredients')).toBeTruthy());
  expect(screen.getByText('1 1/2 lb beef sirloin')).toBeTruthy();
  expect(screen.getByText('Sear the beef.')).toBeTruthy();
});

test('an empty box says so rather than showing nothing', async () => {
  route('GET', /^\/recipes$/, []);

  renderInApp(<RecipesNavigator />);

  await waitFor(() => expect(screen.getByText('No recipes available yet.')).toBeTruthy());
});

test('a failed list offers the way to retry', async () => {
  route('GET', /^\/recipes$/, httpError(500));

  renderInApp(<RecipesNavigator />);

  await waitFor(() =>
    expect(screen.getByText('Unable to load recipes. Pull to refresh to retry.')).toBeTruthy(),
  );
});

test('adding from a URL enqueues the import and moves to extraction', async () => {
  route('POST', '/recipes/parse-url/async', {
    id: 'job-9',
    status: 'PENDING',
    next_action: 'webview_extract',
  });

  renderInApp(<RecipesNavigator />);
  await screen.findByText('Beef Stroganoff');

  fireEvent.press(screen.getByLabelText('Add recipe'));
  fireEvent.press(await screen.findByText('From URL'));
  fireEvent.changeText(
    await screen.findByLabelText('Recipe URL Input'),
    'https://example.com/stroganoff',
  );
  fireEvent.press(screen.getByTestId('import-recipe-button'));

  await waitFor(() => expect(lastCallTo('POST', '/recipes/parse-url/async')).toBeDefined());
  expect(lastCallTo('POST', '/recipes/parse-url/async')!.data).toEqual({
    url: 'https://example.com/stroganoff',
    use_llm_fallback: true,
  });
});

test('a malformed URL is rejected without troubling the server', async () => {
  renderInApp(<RecipesNavigator />);
  await screen.findByText('Beef Stroganoff');

  fireEvent.press(screen.getByLabelText('Add recipe'));
  fireEvent.press(await screen.findByText('From URL'));
  fireEvent.changeText(await screen.findByLabelText('Recipe URL Input'), 'example.com/stroganoff');
  fireEvent.press(screen.getByTestId('import-recipe-button'));

  await waitFor(() => expect(screen.getByText('Enter a valid URL (https://...)')).toBeTruthy());
  expect(callsTo('POST', '/recipes/parse-url/async')).toHaveLength(0);
});

test("a site the server cannot fetch reports the server's own reason", async () => {
  route(
    'POST',
    '/recipes/parse-url/async',
    () => {
      const err: any = new Error('bad');
      err.response = {
        status: 422,
        data: { detail: { error_code: 'fetch_failed', message: 'That site blocked the request.' } },
      };
      return err;
    },
  );

  renderInApp(<RecipesNavigator />);
  await screen.findByText('Beef Stroganoff');
  fireEvent.press(screen.getByLabelText('Add recipe'));
  fireEvent.press(await screen.findByText('From URL'));
  fireEvent.changeText(
    await screen.findByLabelText('Recipe URL Input'),
    'https://example.com/blocked',
  );
  fireEvent.press(screen.getByTestId('import-recipe-button'));

  await waitFor(() => expect(screen.getByText('That site blocked the request.')).toBeTruthy());
});

describe('the import mailbox', () => {
  test('a waiting import shows an unseen badge and lists in the mailbox', async () => {
    route('GET', '/recipes/parse-url/jobs', { jobs: [job()] });

    renderInApp(<RecipesNavigator />);
    // The badge counts unseen imports on the list screen.
    await waitFor(() => expect(screen.getByText('1')).toBeTruthy());

    fireEvent.press(screen.getByLabelText('Import mailbox'));

    await waitFor(() => expect(screen.getByText('Mailbox')).toBeTruthy());
    expect(lastByText('Beef Stroganoff')).toBeTruthy();
  });

  test('an empty mailbox explains how to fill it', async () => {
    renderInApp(<RecipesNavigator />);
    await screen.findByText('Beef Stroganoff');

    fireEvent.press(screen.getByLabelText('Import mailbox'));

    await waitFor(() =>
      expect(screen.getByText(/No imported recipes are waiting right now/)).toBeTruthy(),
    );
  });

  test('opening a live import goes through to the editor', async () => {
    route('GET', '/recipes/parse-url/jobs', { jobs: [job()] });
    route('GET', '/recipes/jobs/job-1', {
      id: 'job-1',
      status: 'COMPLETE',
      result: {
        success: true,
        recipe: {
          title: 'Beef Stroganoff',
          ingredients: [{ text: '1 1/2 lb beef sirloin' }],
          steps: [{ step_number: 1, text: 'Sear the beef.' }],
        },
      },
    });

    renderInApp(<RecipesNavigator />);
    await screen.findByText('Beef Stroganoff');
    fireEvent.press(screen.getByLabelText('Import mailbox'));
    await screen.findByText('Mailbox');

    fireEvent.press(lastByText('Beef Stroganoff'));

    // CreateRecipe, pre-filled from the staged parse.
    await waitFor(() => expect(callsTo('GET', '/recipes/jobs/job-1')).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('Mailbox')).toBeNull());
  });

  test('an import whose staged recipe is gone offers removal instead of failing', async () => {
    // The row outlives what it points at: the list only returns COMPLETE jobs,
    // but cleanup prunes stage_recipes without touching the job row.
    route('GET', '/recipes/parse-url/jobs', { jobs: [job()] });
    route('GET', '/recipes/jobs/job-1', { id: 'job-1', status: 'COMPLETE', result: null });
    route('POST', '/recipes/jobs/job-1/cancel', undefined);

    renderInApp(<RecipesNavigator />);
    await screen.findByText('Beef Stroganoff');
    fireEvent.press(screen.getByLabelText('Import mailbox'));
    await screen.findByText('Mailbox');

    const confirm = autoConfirm('Remove');
    fireEvent.press(lastByText('Beef Stroganoff'));

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    await waitFor(() => expect(callsTo('POST', '/recipes/jobs/job-1/cancel')).toHaveLength(1));
    // Still on the mailbox, with the list intact — the error must not replace it.
    expect(screen.getByText('Mailbox')).toBeTruthy();
  });

  test('the delete button removes a row without needing a hidden swipe', async () => {
    route('GET', '/recipes/parse-url/jobs', ({ url }) => ({
      jobs: callsTo('POST', '/recipes/jobs/job-1/cancel').length ? [] : [job()],
      url,
    }));
    route('POST', '/recipes/jobs/job-1/cancel', undefined);

    renderInApp(<RecipesNavigator />);
    await screen.findByText('Beef Stroganoff');
    fireEvent.press(screen.getByLabelText('Import mailbox'));
    await screen.findByText('Mailbox');

    autoConfirm('Remove');
    fireEvent.press(screen.getByLabelText('Remove Beef Stroganoff'));

    await waitFor(() => expect(callsTo('POST', '/recipes/jobs/job-1/cancel')).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByText(/No imported recipes are waiting right now/)).toBeTruthy(),
    );
  });

  test('a refused removal keeps the row so it can be tried again', async () => {
    route('GET', '/recipes/parse-url/jobs', { jobs: [job()] });
    route('POST', '/recipes/jobs/job-1/cancel', httpError(500, 'Could not remove that import.'));

    renderInApp(<RecipesNavigator />);
    await screen.findByText('Beef Stroganoff');
    fireEvent.press(screen.getByLabelText('Import mailbox'));
    await screen.findByText('Mailbox');

    autoConfirm('Remove');
    fireEvent.press(screen.getByLabelText('Remove Beef Stroganoff'));

    await waitFor(() => expect(screen.getByText('Could not remove that import.')).toBeTruthy());
    expect(screen.getByLabelText('Remove Beef Stroganoff')).toBeTruthy();
  });
});
