/**
 * ImportJobStatusScreen: a job the server no longer has.
 *
 * The screen saves the job it is watching so an import survives a relaunch,
 * and RecipesListScreen reopens it on mount. If the server has no such job
 * (it came from another server, or has been purged) every poll and the cancel
 * itself 404. Keeping the job saved then reopened this screen on every visit
 * to the recipe list, and only a reinstall got out. A 404 means "gone": clear
 * the saved job and go home.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ImportJobStatusScreen from '../../src/screens/Recipes/ImportJobStatusScreen';

const mockGetParseJobStatus = jest.fn();
const mockCancelJob = jest.fn();

jest.mock('../../src/services/parseRecipe', () => ({
  getParseJobStatus: (...args: unknown[]) => mockGetParseJobStatus(...args),
  cancelJob: (...args: unknown[]) => mockCancelJob(...args),
}));

jest.mock('../../src/services/telemetry', () => ({
  trackImportCompleted: jest.fn(),
  trackImportFailed: jest.fn(),
  trackImportFallbackWebviewShown: jest.fn(),
  trackImportStarted: jest.fn(),
}));

const ACTIVE_JOB_KEY = '@jarvis_recipes/active_job';
const HOME = { index: 0, routes: [{ name: 'RecipesList' }] };

const httpError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    response: { status, data: { detail: 'nope' } },
  });

const initialMetrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderScreen = (navigation: any) =>
  render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <PaperProvider>
        <ImportJobStatusScreen
          navigation={navigation}
          route={{ params: { jobId: 'job-1', jobType: 'url', startedAt: Date.now() } } as any}
        />
      </PaperProvider>
    </SafeAreaProvider>,
  );

/** Press "Cancel", then the alert's destructive "Cancel" button. */
const confirmCancel = async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  fireEvent.press(screen.getByText('Cancel'));
  const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
  await buttons.find((b) => b.text === 'Cancel')!.onPress!();
};

describe('ImportJobStatusScreen — job gone on the server', () => {
  let navigation: { reset: jest.Mock; replace: jest.Mock; navigate: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    navigation = { reset: jest.fn(), replace: jest.fn(), navigate: jest.fn() };
  });

  it('a 404 on the status poll clears the saved job and goes home', async () => {
    mockGetParseJobStatus.mockRejectedValue(httpError(404));

    renderScreen(navigation);

    await waitFor(() => expect(navigation.reset).toHaveBeenCalledWith(HOME));
    expect(await AsyncStorage.getItem(ACTIVE_JOB_KEY)).toBeNull();
  });

  it('a 404 on cancel still clears the saved job and goes home', async () => {
    // Polling never settles, so the screen sits in its loading state.
    mockGetParseJobStatus.mockReturnValue(new Promise(() => {}));
    mockCancelJob.mockRejectedValue(httpError(404));

    renderScreen(navigation);
    await waitFor(async () => expect(await AsyncStorage.getItem(ACTIVE_JOB_KEY)).not.toBeNull());

    await confirmCancel();

    expect(mockCancelJob).toHaveBeenCalledWith('job-1');
    expect(navigation.reset).toHaveBeenCalledWith(HOME);
    expect(await AsyncStorage.getItem(ACTIVE_JOB_KEY)).toBeNull();
  });

  it('a 500 on cancel keeps the job and stays put', async () => {
    mockGetParseJobStatus.mockReturnValue(new Promise(() => {}));
    mockCancelJob.mockRejectedValue(httpError(500));

    renderScreen(navigation);
    await waitFor(async () => expect(await AsyncStorage.getItem(ACTIVE_JOB_KEY)).not.toBeNull());

    await confirmCancel();

    expect(navigation.reset).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(ACTIVE_JOB_KEY)).not.toBeNull();
  });

  it('a 500 on the status poll keeps the job (it may still be running)', async () => {
    mockGetParseJobStatus.mockRejectedValue(httpError(500));

    renderScreen(navigation);

    await waitFor(() => expect(mockGetParseJobStatus).toHaveBeenCalled());
    await waitFor(async () => expect(await AsyncStorage.getItem(ACTIVE_JOB_KEY)).not.toBeNull());
    expect(navigation.reset).not.toHaveBeenCalled();
  });
});
