/**
 * Harness for flow tests.
 *
 * These render REAL screens inside the REAL navigators, wrapped in the same
 * providers App.tsx uses, and drive them by tapping what a person would tap and
 * asserting on what they would see. Only HTTP is faked (see ./fakeApi). That is
 * the line worth drawing: everything above it — navigation wiring, state that
 * survives a screen change, the shape of the body sent to the API — is exactly
 * where this session's bugs lived.
 *
 * The difference from the tests in __tests__/screens: those mount one screen and
 * mock the service beneath it. These cross screen boundaries, which is the only
 * way to catch a parameter dropped in a `navigate()` or state that fails to
 * survive a push.
 *
 * What they deliberately do NOT cover: anything that needs pixels. A chip whose
 * selected state is invisible, a label truncated by a sibling button, a spinner
 * that never appears — all real bugs found this session, none of them expressible
 * here. Those still need a device. See docs/testing.md.
 */
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, RenderOptions } from '@testing-library/react-native';
import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { resetApi as fakeApiReset } from './fakeApi';

import { AuthProvider } from '../../src/auth/AuthContext';
import { resetRecipeCache } from '../../src/services/mealPlans';
import { ThemeProvider, useThemePreference } from '../../src/theme/ThemeProvider';

export { callsTo, calls, httpError, lastCallTo, route } from './fakeApi';

/**
 * Clear everything that outlives a single test.
 *
 * The route table and the recorded calls, plus the process-lifetime recipe cache
 * in services/mealPlans -- without that last one a title cached by an earlier
 * test satisfies a later test's assertion with no request made at all, which is
 * a green test proving nothing.
 */
export const resetApi = () => {
  fakeApiReset();
  resetRecipeCache();
};

/** react-native-safe-area-context needs real insets in a test renderer. */
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Mirrors App.tsx's AppContent: Paper theme and nav theme come from ThemeProvider. */
const Themed = ({ children }: { children: React.ReactNode }) => {
  const { paperTheme, navTheme } = useThemePreference();
  return (
    <PaperProvider theme={paperTheme}>
      <NavigationContainer theme={navTheme}>{children}</NavigationContainer>
    </PaperProvider>
  );
};

type Options = RenderOptions & {
  /**
   * Wrap in the real AuthProvider. Needed for anything that reads the session
   * or crosses the authenticated/unauthenticated boundary; off by default so a
   * planner test doesn't have to stub a login.
   */
  withAuth?: boolean;
};

export const renderInApp = (ui: React.ReactElement, options: Options = {}) => {
  const { withAuth = false, ...renderOptions } = options;

  // A fresh client per test: a shared cache lets one test's fetched recipe
  // satisfy the next one's assertion, which hides broken loading paths.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  const tree = <Themed>{ui}</Themed>;

  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          {withAuth ? <AuthProvider>{tree}</AuthProvider> : tree}
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
    renderOptions,
  );
};

/**
 * The last element rendering `text`.
 *
 * Paper renders a TextInput's `label` as a Text node inside the input, and
 * headers repeat their screen's action label ("Log In" appears twice), so an
 * exact getByText is ambiguous on most screens. Last wins: the field and the
 * button both come after their header.
 */
export const lastByText = (text: string | RegExp) => {
  const { screen } = require('@testing-library/react-native');
  const matches = screen.getAllByText(text);
  return matches[matches.length - 1];
};

/** A recipe as GET /recipes/{id} returns it. */
export const apiRecipe = (over: Partial<any> = {}) => ({
  id: 1,
  user_id: '1',
  title: 'Beef Stroganoff',
  description: 'Sunday sort of dinner.',
  image_url: null,
  source_type: 'manual',
  source_url: null,
  servings: 4,
  total_time_minutes: 45,
  prep_time_minutes: 15,
  cook_time_minutes: 30,
  ingredients: [
    { id: 1, text: '1 1/2 lb beef sirloin', quantity_display: '1 1/2', unit: 'lb' },
    { id: 2, text: '8 oz egg noodles', quantity_display: '8', unit: 'oz' },
  ],
  steps: [{ id: 1, step_number: 1, text: 'Sear the beef.' }],
  tags: [{ id: 1, name: 'dinner' }],
  ...over,
});

/** One slot of a random plan, as POST /meal-plans/random returns it. */
export const randomSlot = (over: Partial<any> = {}) => ({
  date: '2026-09-07',
  meal_type: 'dinner',
  recipe_id: 1,
  title: 'Beef Stroganoff',
  image_url: null,
  total_time_minutes: 45,
  servings: 4,
  ...over,
});

/** A jarvis-auth token pair as /auth/login returns it. */
export const authResponse = (over: Partial<any> = {}) => ({
  access_token: 'access-token-1',
  refresh_token: 'refresh-token-1',
  token_type: 'bearer' as const,
  user: { id: 7, email: 'cook@example.com', username: 'cook' },
  ...over,
});

/** The next `count` days from today, as the planner computes them. */
export const upcomingDates = (count = 7): string[] => {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
};
