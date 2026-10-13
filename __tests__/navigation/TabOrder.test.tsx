/**
 * The order of the bottom tabs.
 *
 * The first tab is also the landing screen, so this decides what you see on
 * launch -- and "what are we eating" is the question the app gets opened to
 * answer. Recipes and groceries are things you do BECAUSE of the plan, so they
 * follow it.
 *
 * Pinned because the order is a handful of lines in AppNavigator with nothing
 * else depending on it: a reorder during unrelated work would be silent, and
 * the flow tests only fail confusingly -- they report a missing recipe title
 * rather than a changed landing screen, which is how this change surfaced.
 */
import { screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import AppNavigator from '../../src/navigation/AppNavigator';
import { renderInApp, resetApi, route } from '../flows/harness';

jest.mock('../../src/api/recipesApi', () => require('../flows/fakeApi').recipesApiMock());
jest.mock('../../src/api/authApi', () => require('../flows/fakeApi').authApiMock());

const LABELS = ['Planner', 'Recipes', 'Groceries', 'Account'];

beforeEach(() => {
  resetApi();
  route('GET', '/planner/current', {});
  route('GET', /^\/recipes$/, []);
  route('GET', '/recipes/parse-url/jobs', { jobs: [] });
  route('GET', '/tags', []);
});

test('planner, then recipes, then groceries', async () => {
  renderInApp(<AppNavigator />);
  await screen.findByText('Planner');

  // Rendered sequence, not just presence: findByText passes in any order, and
  // the order is the whole point.
  const rendered = screen.root.findAllByType(Text as never) as any[];
  const order = rendered
    .map((node) => (typeof node.props.children === 'string' ? node.props.children : null))
    .filter((text): text is string => Boolean(text) && LABELS.includes(text as string));

  expect(order.slice(0, LABELS.length)).toEqual(LABELS);
});

test('the planner is what you land on', async () => {
  renderInApp(<AppNavigator />);

  // The planner's own header rather than the tab label: the label is present
  // whichever tab has focus.
  expect(await screen.findByText('Plan the week')).toBeTruthy();
});
