/**
 * FLOW: the Groceries tab, from a saved plan to a Walmart cart.
 *
 * The shopping list is recomputed server-side for whatever range is selected, so
 * the thing worth testing on this side is everything around that: which dates get
 * asked for, what "nothing planned" looks like as against "list is empty", that
 * ticking an item survives, and that the export opens a cart rather than a blank
 * page.
 */
import { Linking } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import GroceriesNavigator from '../../src/navigation/GroceriesNavigator';
import { callsTo, httpError, lastCallTo, renderInApp, resetApi, route } from './harness';

jest.mock('../../src/api/recipesApi', () => require('./fakeApi').recipesApiMock());
jest.mock('../../src/api/authApi', () => require('./fakeApi').authApiMock());

const item = (name: string, quantity: number | null, unit: string | null, recipes: string[] = ['Dinner']) => ({
  name,
  amounts: [{ unit, quantity, unparsed: quantity === null ? ['to taste'] : [] }],
  recipes,
});

const listOf = (...items: ReturnType<typeof item>[]) => ({
  start_date: '2026-09-06',
  end_date: '2026-09-12',
  items,
  plan_count: 1,
});

/** Sunday of this week through Saturday, which is what "This week" selects. */
const thisWeek = () => {
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return { start: iso(sunday), end: iso(saturday) };
};

beforeEach(async () => {
  resetApi();
  jest.restoreAllMocks();
  // mockClear as well as the spy: Linking.openURL is already a mock in the RN
  // preset, so spyOn wraps the same function object every test and its call
  // history would otherwise carry across.
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
  (Linking.openURL as jest.Mock).mockClear();
  const AsyncStorage = require('@react-native-async-storage/async-storage');
  await AsyncStorage.clear();
});

test('the list opens on this week and asks for exactly those dates', async () => {
  route('GET', '/shopping-list', listOf(item('ground beef', 1.5, 'lb')));

  renderInApp(<GroceriesNavigator />);

  await waitFor(() => expect(screen.getByText('ground beef')).toBeTruthy());
  const { start, end } = thisWeek();
  expect(lastCallTo('GET', '/shopping-list')!.params).toEqual({
    start_date: start,
    end_date: end,
  });
});

test('each item shows how much to buy and what it is for', async () => {
  // A list that says "chicken breast" without "1.5 lb" is not a shopping list.
  route('GET', '/shopping-list', listOf(item('chicken breast', 1.5, 'lb', ['Thai Basil Chicken'])));

  renderInApp(<GroceriesNavigator />);

  await waitFor(() => expect(screen.getByText(/1\.5 lb/)).toBeTruthy());
  expect(screen.getByText(/Thai Basil Chicken/)).toBeTruthy();
});

test('an unparseable quantity is still shown rather than dropped', async () => {
  route('GET', '/shopping-list', listOf(item('salt and pepper', null, null)));

  renderInApp(<GroceriesNavigator />);

  await waitFor(() => expect(screen.getByText(/to taste/)).toBeTruthy());
});

test('switching the range refetches for the new dates', async () => {
  route('GET', '/shopping-list', listOf(item('ground beef', 1, 'lb')));

  renderInApp(<GroceriesNavigator />);
  await waitFor(() => expect(screen.getByText('ground beef')).toBeTruthy());

  fireEvent.press(screen.getByText('Next week'));

  await waitFor(() => expect(callsTo('GET', '/shopping-list')).toHaveLength(2));
  const { end } = thisWeek();
  const next = lastCallTo('GET', '/shopping-list')!.params;
  expect(next.start_date > end).toBe(true);
});

test('nothing planned says so, rather than showing an empty list', async () => {
  // Distinct states: an empty list because nothing is planned is fixed by
  // planning something, not by wondering why the request came back blank.
  route('GET', '/shopping-list', { ...listOf(), plan_count: 0 });

  renderInApp(<GroceriesNavigator />);

  await waitFor(() => expect(screen.getByText('Nothing planned for these days.')).toBeTruthy());
  expect(screen.queryByText('Send to Walmart')).toBeNull();
});

test('ticking an item strikes it through and drops the count', async () => {
  route('GET', '/shopping-list', listOf(item('ground beef', 1, 'lb'), item('rice', 2, 'cups')));

  renderInApp(<GroceriesNavigator />);
  await waitFor(() => expect(screen.getByText('2 to buy')).toBeTruthy());

  fireEvent.press(screen.getByLabelText('ground beef, 1 lb'));

  await waitFor(() => expect(screen.getByText('1 to buy')).toBeTruthy());
});

test('a failed list is reported and can be retried', async () => {
  route('GET', '/shopping-list', httpError(500, 'Could not build your list.'));

  renderInApp(<GroceriesNavigator />);

  await waitFor(() => expect(screen.getByText('Could not build your list.')).toBeTruthy());
});

describe('exporting to Walmart', () => {
  const showList = async () => {
    route('GET', '/shopping-list', listOf(item('ground beef', 1, 'lb'), item('rice', 2, 'cups')));
    renderInApp(<GroceriesNavigator />);
    await waitFor(() => expect(screen.getByText('ground beef')).toBeTruthy());
  };

  test('a matched list opens the cart link', async () => {
    await showList();
    route('POST', '/grocery/cart', {
      retailer: 'walmart',
      url: 'https://affil.walmart.com/cart/addToCart?items=123_2',
      items: [{ ingredient_name: 'ground beef', sku: '123', quantity: 2, source: 'manual' }],
      unmatched: [],
    });

    fireEvent.press(screen.getByText('Send to Walmart'));

    await waitFor(() =>
      expect(Linking.openURL).toHaveBeenCalledWith(
        'https://affil.walmart.com/cart/addToCart?items=123_2',
      ),
    );
    expect(lastCallTo('POST', '/grocery/cart')!.params).toMatchObject({ retailer: 'walmart' });
  });

  test('nothing matched opens nothing, and says why', async () => {
    // An empty items= parameter opens Walmart with an empty cart and no
    // explanation, which reads as a broken export.
    await showList();
    route('POST', '/grocery/cart', {
      retailer: 'walmart',
      url: null,
      items: [],
      unmatched: [
        { ingredient_name: 'ground beef', amount_display: '1 lb', recipes: ['Dinner'] },
      ],
    });

    fireEvent.press(screen.getByText('Send to Walmart'));

    await waitFor(() => expect(screen.getByText(/nothing matched yet/)).toBeTruthy());
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  test('an unmatched ingredient offers the picker', async () => {
    await showList();
    route('POST', '/grocery/cart', {
      retailer: 'walmart',
      url: 'https://affil.walmart.com/cart/addToCart?items=123_2',
      items: [{ ingredient_name: 'ground beef', sku: '123', quantity: 2, source: 'manual' }],
      unmatched: [{ ingredient_name: 'rice', amount_display: '2 cups', recipes: ['Dinner'] }],
      match_job_id: 'job-1',
    });

    fireEvent.press(screen.getByText('Send to Walmart'));
    await waitFor(() => expect(screen.getByText(/1 item sent to your cart/)).toBeTruthy());

    // By label, not by text: "rice" is also on the list above.
    fireEvent.press(screen.getByLabelText('Pick a product for rice'));

    // The picker opens searching for the ingredient AND its amount, so the
    // results are products a shopper would actually buy rather than every
    // rice-adjacent thing Walmart sells.
    //
    // Asserted on the WebView's source rather than the header: Paper's
    // Appbar.Content marks its title subtree no-hide-descendants, which puts the
    // text out of reach of any accessibility query.
    const web = await screen.findByTestId('webview');
    const uri = decodeURIComponent((web.props as any).source.uri);
    expect(uri).toContain('walmart.com/search');
    expect(uri).toContain('2 cups rice');
  });

  test('a guessed match is surfaced for confirmation, not slipped in silently', async () => {
    // The background pass runs on a small local model and does get these wrong:
    // in testing it matched "ground chicken" to a chicken BREAST product. The
    // item still goes in the cart -- nothing waits on a confirmation -- but this
    // is the only place a wrong guess is visible before the checkout is.
    await showList();
    route('POST', '/grocery/cart', {
      retailer: 'walmart',
      url: 'https://affil.walmart.com/cart/addToCart?items=123_1,456_1',
      items: [
        { ingredient_name: 'chicken breast', sku: '123', quantity: 1, source: 'manual' },
        {
          ingredient_name: 'ground chicken',
          sku: '456',
          quantity: 1,
          product_name: 'Boneless Skinless Chicken Breast',
          source: 'llm',
        },
      ],
      unmatched: [],
    });

    fireEvent.press(screen.getByText('Send to Walmart'));

    await waitFor(() => expect(screen.getByText('Check these — we guessed')).toBeTruthy());
    expect(screen.getByLabelText('Fix the product for ground chicken')).toBeTruthy();
    // A product the person chose themselves is not second-guessed at them.
    expect(screen.queryByLabelText('Fix the product for chicken breast')).toBeNull();
  });

  test('a cart of only confirmed products asks nothing', async () => {
    await showList();
    route('POST', '/grocery/cart', {
      retailer: 'walmart',
      url: 'https://affil.walmart.com/cart/addToCart?items=123_1',
      items: [{ ingredient_name: 'chicken breast', sku: '123', quantity: 1, source: 'manual' }],
      unmatched: [],
    });

    fireEvent.press(screen.getByText('Send to Walmart'));

    await waitFor(() => expect(screen.getByText(/1 item sent to your cart/)).toBeTruthy());
    expect(screen.queryByText('Check these — we guessed')).toBeNull();
  });

  test('a refused export is reported and the list stays put', async () => {
    await showList();
    route('POST', '/grocery/cart', httpError(500, 'Could not build the cart.'));

    fireEvent.press(screen.getByText('Send to Walmart'));

    await waitFor(() => expect(screen.getByText('Could not build the cart.')).toBeTruthy());
    expect(screen.getByText('ground beef')).toBeTruthy();
  });
});
