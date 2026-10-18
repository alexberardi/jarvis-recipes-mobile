import { NavigationContainer } from '@react-navigation/native';
import { render, screen, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RecipesListScreen from '../src/screens/Recipes/RecipesListScreen';

// The screen polls the import mailbox on focus; that should not reach the
// network from a render test. The resume-on-mount record is real (AsyncStorage
// is mocked globally), so the stale-job tests below exercise it end to end.
jest.mock('../src/services/parseRecipe', () => ({
  getParseJobs: jest.fn().mockResolvedValue({ jobs: [] }),
}));

jest.mock('../src/hooks/useRecipes', () => {
  const sampleRecipes = [
    {
      id: 1,
      title: 'Mediterranean Quinoa Salad',
      description: 'Herby quinoa with vegetables',
      tags: [{ id: 1, name: 'Vegetarian' }],
      image: { uri: 'test://mediterranean' },
    },
    {
      id: 2,
      title: 'Weeknight Chicken Tacos',
      description: 'Citrus-marinated chicken with slaw',
      tags: [{ id: 2, name: 'Family' }],
      image: { uri: 'test://tacos' },
    },
  ];

  return {
    useRecipes: () => ({
      data: sampleRecipes,
      isLoading: false,
      isRefetching: false,
      refetch: jest.fn(),
      error: null,
    }),
  };
});

jest.mock('../src/components/RecipeCard', () => {
  const { Text } = require('react-native');
  return ({ recipe }: any) => <Text>{recipe.title}</Text>;
});

const ACTIVE_JOB_KEY = '@jarvis_recipes/active_job';

const renderScreen = (navigation: any) => {
  const queryClient = new QueryClient();
  const initialMetrics = {
    frame: { x: 0, y: 0, width: 320, height: 640 },
    insets: { top: 0, left: 0, right: 0, bottom: 0 },
  };

  // useFocusEffect needs a real navigation context, not just the navigation
  // prop, so the screen has to render inside a NavigationContainer.
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <PaperProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationContainer>
            <RecipesListScreen navigation={navigation} route={{} as any} />
          </NavigationContainer>
        </QueryClientProvider>
      </PaperProvider>
    </SafeAreaProvider>,
  );
};

describe('RecipesListScreen', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('renders recipe titles from mock data', async () => {
    renderScreen({ navigate: jest.fn() });

    expect(await screen.findByText('Mediterranean Quinoa Salad')).toBeTruthy();
    expect(await screen.findByText('Weeknight Chicken Tacos')).toBeTruthy();
  });

  it('resumes a saved import job that is still running', async () => {
    const job = { jobId: 'job-1', jobType: 'url', sourceUrl: null, startedAt: Date.now() };
    await AsyncStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(job));
    const navigation = { navigate: jest.fn() };

    renderScreen(navigation);

    await waitFor(() =>
      expect(navigation.navigate).toHaveBeenCalledWith('ImportJobStatus', {
        jobId: 'job-1',
        jobType: 'url',
        sourceUrl: undefined,
        startedAt: job.startedAt,
      }),
    );
  });

  it('drops a stale saved job instead of reopening "Importing recipe"', async () => {
    // A job saved long ago (e.g. on a server since replaced) would 404 forever.
    const job = { jobId: 'old', jobType: 'url', startedAt: Date.now() - 24 * 60 * 60 * 1000 };
    await AsyncStorage.setItem(ACTIVE_JOB_KEY, JSON.stringify(job));
    const navigation = { navigate: jest.fn() };

    renderScreen(navigation);

    await screen.findByText('Mediterranean Quinoa Salad');
    await waitFor(async () => expect(await AsyncStorage.getItem(ACTIVE_JOB_KEY)).toBeNull());
    expect(navigation.navigate).not.toHaveBeenCalledWith('ImportJobStatus', expect.anything());
  });
});

