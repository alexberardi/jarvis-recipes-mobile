/**
 * AddRecipeFromUrlScreen: the blocked-by-site fallback.
 *
 * jarvis-recipes-server answers a bot-blocked site (401/403 on its preflight
 * fetch) with HTTP 400 whose *detail* carries next_action="webview_extract" —
 * see html_fetcher.preflight_validate_url. Because it arrives as a rejection,
 * the success-path next_action check never sees it, so the screen must look
 * for it in the catch as well, ahead of the generic fetch_failed branch.
 * Otherwise the user gets "Site returned status 403." and a dead end.
 *
 * The alert-then-continue shape mirrors ImportJobStatusScreen, which already
 * handles the same signal on the polling path.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import AddRecipeFromUrlScreen from '../../src/screens/Recipes/AddRecipeFromUrlScreen';

// `mock`-prefixed so babel-plugin-jest-hoist allows the factory to close over it.
const mockEnqueueParseUrl = jest.fn();
const mockTrackFallbackShown = jest.fn();

jest.mock('../../src/services/parseRecipe', () => ({
  enqueueParseUrl: (...args: unknown[]) => mockEnqueueParseUrl(...args),
}));

jest.mock('../../src/services/telemetry', () => ({
  trackImportFallbackWebviewShown: (...args: unknown[]) => mockTrackFallbackShown(...args),
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() } as any;

const BLOCKED_URL = 'https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/';

/** The exact 400 jarvis-recipes-server returns for a 403-blocking site. */
const blockedBySiteError = () =>
  Object.assign(new Error('Request failed with status code 400'), {
    response: {
      status: 400,
      data: {
        detail: {
          error_code: 'fetch_failed',
          message: 'Site returned status 403.',
          status_code: 403,
          job_id: 'job-1',
          next_action: 'webview_extract',
          next_action_reason: 'blocked_by_site',
        },
      },
    },
  });

const renderScreen = () =>
  render(
    <PaperProvider>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <AddRecipeFromUrlScreen navigation={navigation} route={{ params: {} } as any} />
      </QueryClientProvider>
    </PaperProvider>,
  );

const typeUrlAndImport = (url: string) => {
  fireEvent.changeText(screen.getByTestId('recipe-url-input'), url);
  fireEvent.press(screen.getByTestId('import-recipe-button'));
};

describe('AddRecipeFromUrlScreen — blocked-by-site fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  it('offers the webview fallback instead of dead-ending on a site 403', async () => {
    mockEnqueueParseUrl.mockRejectedValue(blockedBySiteError());
    renderScreen();

    typeUrlAndImport(BLOCKED_URL);

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());

    // The raw upstream status must not be the end of the road.
    expect(screen.queryByText('Site returned status 403.')).toBeNull();

    const [title, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(title).toBe('This site blocks automated import');

    // Continuing must land on the webview extractor with the domain attached.
    const continueButton = buttons.find((b: any) => b.text === 'Continue');
    continueButton.onPress();
    expect(navigation.replace).toHaveBeenCalledWith('WebViewExtract', {
      url: BLOCKED_URL,
      domain: 'www.allrecipes.com',
    });

    expect(mockTrackFallbackShown).toHaveBeenCalledWith('www.allrecipes.com', 'blocked_by_site');
  });

  it('still surfaces a plain fetch failure that offers no fallback', async () => {
    mockEnqueueParseUrl.mockRejectedValue(
      Object.assign(new Error('Request failed with status code 400'), {
        response: {
          status: 400,
          data: {
            detail: {
              error_code: 'fetch_failed',
              message: 'Site returned status 500.',
              status_code: 500,
            },
          },
        },
      }),
    );
    renderScreen();

    typeUrlAndImport('https://example.com/recipe');

    await waitFor(() => expect(screen.getByText('Site returned status 500.')).toBeTruthy());
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
