/**
 * A recipe step must render in full.
 *
 * Steps were passed as a Paper `List.Item` `description`, which clamps to
 * `descriptionNumberOfLines` -- default 2. More than half of every recipe's
 * steps were therefore ellipsized on screen: 143 of 264 in the dev database,
 * the worst showing 76 of its 282 characters. A recipe step is the content of
 * the screen, not a list subtitle.
 *
 * The trap, and the reason this file asserts a PROP rather than text: react
 * native's `numberOfLines` truncates at RENDER, so the text node still holds
 * the whole string. `getByText(longStep)` passes with the bug fully present --
 * a test written that way would have watched this ship. So the assertion is
 * that no clamp applies to the step's own Text.
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

// A real step from the seeded data, the one that lost 206 characters.
const LONG_STEP =
  'Add remaining ingredients into the slow cooker: rinsed and drained beans, ' +
  'diced tomatoes with their juice, corn, tomato paste, chicken broth, chili ' +
  'powder, cumin, smoked paprika, oregano, salt and pepper, then stir until ' +
  'everything is evenly combined and the paste has dissolved.';

const recipe = {
  id: 7,
  user_id: '1',
  title: 'Slow Cooker Chili',
  servings: 4,
  total_time_minutes: 240,
  ingredients: [{ id: 1, text: 'black beans, rinsed', quantity_display: '1', unit: 'can' }],
  steps: [
    { id: 1, step_number: 1, text: LONG_STEP },
    { id: 2, step_number: 2, text: 'Serve.' },
  ],
  tags: [],
};

// useFocusEffect needs a real NavigationContainer, not a mocked prop.
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

test('a long step is not clamped to a line count', () => {
  renderScreen();

  const step = screen.getByTestId('step-text-1');

  // undefined or 0 both mean "as many lines as it takes" in react native.
  const clamp = (step.props as { numberOfLines?: number }).numberOfLines;
  expect(clamp === undefined || clamp === 0).toBe(true);
});

test('every step gets its own text node', () => {
  renderScreen();

  // Rendering steps through List.Item's description removes these handles, so
  // this fails if the old shape comes back.
  expect(screen.getByTestId('step-text-1')).toBeTruthy();
  expect(screen.getByTestId('step-text-2')).toBeTruthy();
});

test('the step text and its number are both on screen', () => {
  renderScreen();

  expect(screen.getByText(LONG_STEP)).toBeTruthy();
  expect(screen.getByText('1')).toBeTruthy();
  expect(screen.getByText('2')).toBeTruthy();
});

test('a step reads as one unit to a screen reader', () => {
  // Number and body are separate Texts for layout; without grouping they are
  // announced as two unrelated fragments.
  renderScreen();

  expect(screen.getByLabelText(`Step 1. ${LONG_STEP}`)).toBeTruthy();
});
