/**
 * Search and filtering on the recipe list.
 *
 * The filter logic is unit-tested in __tests__/utils/filterRecipes.test.ts.
 * What that cannot see is whether the SCREEN uses it -- the ingredient-amount
 * bug was exactly that shape: a correct helper the screen never called. So
 * these drive the real controls.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import RecipesListScreen from '../../src/screens/Recipes/RecipesListScreen';
import { renderInApp, resetApi, route } from '../flows/harness';

jest.mock('../../src/api/recipesApi', () => require('../flows/fakeApi').recipesApiMock());
jest.mock('../../src/api/authApi', () => require('../flows/fakeApi').authApiMock());

const BOX = [
  {
    id: 1,
    user_id: '1',
    title: 'Korean BBQ Chicken Tenders',
    tags: [{ id: 1, name: 'dinner' }, { id: 2, name: 'Alex' }],
    ingredients: [{ id: 1, text: 'boneless chicken tenders' }],
    steps: [],
  },
  {
    id: 2,
    user_id: '1',
    title: 'Steak and Fries',
    tags: [{ id: 1, name: 'dinner' }, { id: 3, name: 'steak' }],
    ingredients: [{ id: 2, text: 'russet potatoes' }, { id: 3, text: 'steaks' }],
    steps: [],
  },
  {
    id: 3,
    user_id: '1',
    title: 'Bean and Cheese Quesadillas',
    tags: [{ id: 4, name: 'quick' }],
    ingredients: [{ id: 4, text: 'refried beans' }],
    steps: [],
  },
];

const navigation = { navigate: jest.fn(), setOptions: jest.fn() } as never;

beforeEach(() => {
  resetApi();
  route('GET', /^\/recipes$/, BOX);
  route('GET', '/recipes/parse-url/jobs', { jobs: [] });
  route('GET', '/tags', []);
});

const render = () =>
  renderInApp(<RecipesListScreen navigation={navigation} route={{} as never} />);

test('searching the title narrows the list', async () => {
  render();
  await screen.findByText('Steak and Fries');

  fireEvent.changeText(screen.getByPlaceholderText('Search recipes'), 'steak');

  await waitFor(() => expect(screen.queryByText('Korean BBQ Chicken Tenders')).toBeNull());
  expect(screen.getByText('Steak and Fries')).toBeTruthy();
});

test('a tag chip filters, and tapping it again clears it', async () => {
  render();
  await screen.findByText('Steak and Fries');

  fireEvent.press(screen.getByLabelText('Filter by steak'));
  await waitFor(() => expect(screen.queryByText('Bean and Cheese Quesadillas')).toBeNull());

  fireEvent.press(screen.getByLabelText('Filter by steak'));
  await waitFor(() => expect(screen.getByText('Bean and Cheese Quesadillas')).toBeTruthy());
});

test('two tags means both, not either', async () => {
  render();
  await screen.findByText('Steak and Fries');

  fireEvent.press(screen.getByLabelText('Filter by dinner'));
  fireEvent.press(screen.getByLabelText('Filter by steak'));

  await waitFor(() => expect(screen.queryByText('Korean BBQ Chicken Tenders')).toBeNull());
  expect(screen.getByText('Steak and Fries')).toBeTruthy();
});

test('the ingredient filter is behind Advanced and finds what the title does not say', async () => {
  render();
  await screen.findByText('Steak and Fries');

  // Hidden until asked for.
  expect(screen.queryByLabelText('Has ingredient')).toBeNull();
  fireEvent.press(screen.getByText('Advanced'));

  fireEvent.changeText(await screen.findByLabelText('Has ingredient'), 'potato');

  // "potatoes" appears in no title in the box.
  await waitFor(() => expect(screen.queryByText('Korean BBQ Chicken Tenders')).toBeNull());
  expect(screen.getByText('Steak and Fries')).toBeTruthy();
});

test('Clear resets every filter at once', async () => {
  render();
  await screen.findByText('Steak and Fries');

  fireEvent.changeText(screen.getByPlaceholderText('Search recipes'), 'steak');
  fireEvent.press(screen.getByLabelText('Filter by dinner'));
  await waitFor(() => expect(screen.queryByText('Bean and Cheese Quesadillas')).toBeNull());

  fireEvent.press(screen.getByText('Clear'));

  await waitFor(() => expect(screen.getByText('Bean and Cheese Quesadillas')).toBeTruthy());
  expect(screen.getByText('Korean BBQ Chicken Tenders')).toBeTruthy();
});

test('filtering to nothing says so, rather than looking like an empty box', async () => {
  // "No recipes available yet" to someone with a full box reads as data loss.
  render();
  await screen.findByText('Steak and Fries');

  fireEvent.changeText(screen.getByPlaceholderText('Search recipes'), 'zzzz');

  await waitFor(() => expect(screen.getByText('No recipes match those filters.')).toBeTruthy());
  expect(screen.queryByText('No recipes available yet.')).toBeNull();
});

test('Clear only appears once something is filtered', async () => {
  render();
  await screen.findByText('Steak and Fries');

  expect(screen.queryByText('Clear')).toBeNull();
  fireEvent.changeText(screen.getByPlaceholderText('Search recipes'), 'steak');
  await waitFor(() => expect(screen.getByText('Clear')).toBeTruthy());
});
