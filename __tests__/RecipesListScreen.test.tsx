import { NavigationContainer } from '@react-navigation/native';
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import RecipesListScreen from '../src/screens/Recipes/RecipesListScreen';

// The screen polls the import mailbox on focus and resumes a stored job on
// mount; neither should reach the network from a render test.
jest.mock('../src/services/parseRecipe', () => ({
  getParseJobs: jest.fn().mockResolvedValue({ jobs: [] }),
}));

jest.mock('../src/services/jobPolling', () => ({
  loadActiveJob: jest.fn().mockResolvedValue(null),
  clearActiveJob: jest.fn().mockResolvedValue(undefined),
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

describe('RecipesListScreen', () => {
  it('renders recipe titles from mock data', async () => {
    const queryClient = new QueryClient();
    const navigation = { navigate: jest.fn() } as any;
    const initialMetrics = {
      frame: { x: 0, y: 0, width: 320, height: 640 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    };

    // useFocusEffect needs a real navigation context, not just the navigation
    // prop, so the screen has to render inside a NavigationContainer.
    render(
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

    expect(await screen.findByText('Mediterranean Quinoa Salad')).toBeTruthy();
    expect(await screen.findByText('Weeknight Chicken Tacos')).toBeTruthy();
  });
});

