/**
 * The detail screen must show ingredient amounts.
 *
 * It rendered `item.text` alone, and `text` holds only the item -- the amount
 * lives in quantity_display/unit. The API had always returned them
 * (IngredientRead) and the database had them stored, but the app's read type
 * omitted the fields, so every quantity was invisible: a recipe read
 * "russet potatoes / olive oil / garlic powder" with nothing to cook by.
 *
 * A unit test on the formatter would not have caught it -- the formatter is new,
 * and the bug was that the screen never called one. So this asserts through the
 * rendered screen.
 */
import { NavigationContainer } from '@react-navigation/native';
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';

import RecipeDetailScreen from '../../src/screens/Recipes/RecipeDetailScreen';

const mockUseRecipe = jest.fn();
jest.mock('../../src/hooks/useRecipes', () => ({
  useRecipe: (...args: unknown[]) => mockUseRecipe(...args),
}));

const recipe = {
  id: 7,
  user_id: '1',
  title: 'Fiesta Beef & Potato Bowl',
  servings: 4,
  total_time_minutes: 30,
  ingredients: [
    { id: 1, text: 'russet potatoes, cubed', quantity_display: '600', unit: 'g' },
    { id: 2, text: 'lean ground beef', quantity_display: '1 1/2', unit: 'lb' },
    { id: 3, text: 'oat flour', quantity_display: '1/4', unit: 'cup' },
    { id: 4, text: 'onion, diced', quantity_display: '1', unit: 'small' },
    { id: 5, text: 'Salt & pepper, to taste' },
  ],
  steps: [{ id: 1, step_number: 1, text: 'Roast the potatoes.' }],
  tags: [],
};

// The screen calls useFocusEffect, which needs a real NavigationContainer --
// a mocked navigation prop alone throws "Couldn't find a navigation object".
const renderScreen = () =>
  render(
    <NavigationContainer>
      <PaperProvider>
        <RecipeDetailScreen
          route={{ params: { id: 7 }, key: 'k', name: 'RecipeDetail' } as never}
          navigation={{ goBack: jest.fn(), navigate: jest.fn() } as never}
        />
      </PaperProvider>
    </NavigationContainer>,
  );

beforeEach(() => {
  mockUseRecipe.mockReturnValue({ data: recipe, isLoading: false, refetch: jest.fn() });
});

describe('RecipeDetailScreen ingredient amounts', () => {
  it('shows the amount and unit alongside the ingredient', () => {
    renderScreen();

    expect(screen.getByText('600 g russet potatoes, cubed')).toBeTruthy();
    expect(screen.getByText('1 1/2 lb lean ground beef')).toBeTruthy();
    expect(screen.getByText('1 small onion, diced')).toBeTruthy();
  });

  it('keeps fractions readable rather than showing decimals', () => {
    renderScreen();

    expect(screen.getByText('1/4 cup oat flour')).toBeTruthy();
    expect(screen.queryByText(/0\.25/)).toBeNull();
  });

  it('renders an amount-less ingredient unchanged', () => {
    renderScreen();

    expect(screen.getByText('Salt & pepper, to taste')).toBeTruthy();
  });

  it('never shows an ingredient stripped of its amount', () => {
    renderScreen();

    // The exact symptom: the item alone, with the quantity dropped.
    expect(screen.queryByText('russet potatoes, cubed')).toBeNull();
    expect(screen.queryByText('lean ground beef')).toBeNull();
  });
});
