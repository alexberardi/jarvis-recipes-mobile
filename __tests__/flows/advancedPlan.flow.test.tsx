/**
 * FLOW: the advanced (LLM) planner, all five screens of it.
 *
 * QuickPlan -> Select dates -> Day configuration -> Generating plan -> Meal plan
 * -> saved. Four navigations, one of them a `replace`, and a payload assembled on
 * screen two from state entered on screen three. Every bug this chain produced
 * this session lived in a gap between two screens: a date that arrived off by a
 * day, a job id that never made it to the results screen, an id turned to NaN on
 * the way out. None of that is visible from inside one screen.
 */
import { Alert } from 'react-native';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text as RNText } from 'react-native';

import PlannerNavigator from '../../src/navigation/PlannerNavigator';
import {
  apiRecipe,
  httpError,
  lastByText,
  lastCallTo,
  callsTo,
  renderInApp,
  resetApi,
  route,
} from './harness';

jest.mock('../../src/api/recipesApi', () => require('./fakeApi').recipesApiMock());
jest.mock('../../src/api/authApi', () => require('./fakeApi').authApiMock());

const JOB_ID = 'job-abc';

/** A completed LLM plan: two days of dinner, one pick each. */
const completedJob = (dates: string[]) => ({
  status: 'COMPLETE',
  result: {
    days: dates.map((date, i) => ({
      date,
      meals: {
        dinner: {
          // Deliberately different per day, so a swap that dragged the slot's own
          // settings along with the recipe would be visible.
          servings: 4 + i,
          tags: [i === 0 ? 'main course' : 'quick'],
          selection: {
            source: 'user',
            recipe_id: String(i + 1),
            confidence: 0.9,
            matched_tags: ['main course'],
            warnings: [],
            alternatives: [],
          },
        },
      },
    })),
  },
});

beforeEach(() => {
  resetApi();
  jest.restoreAllMocks();
  route('GET', '/tags', [
    { id: 1, name: 'main course' },
    { id: 2, name: 'quick' },
  ]);
});

/**
 * Pick `count` consecutive dates on the calendar and continue.
 *
 * Past dates are disabled, so selection always runs forward from today. When
 * fewer than `count` days remain in this month the test steps to the next month
 * and takes its first days instead — otherwise the suite would break for anyone
 * running it in the last week of a month.
 */
const chooseDates = (count: number): string[] => {
  const today = new Date();
  const daysLeft =
    new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1;

  let dates: string[];
  if (daysLeft >= count) {
    dates = Array.from({ length: count }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return iso(d);
    });
  } else {
    fireEvent.press(screen.getByLabelText('chevron-right'));
    dates = Array.from({ length: count }, (_, i) =>
      iso(new Date(today.getFullYear(), today.getMonth() + 1, i + 1)),
    );
  }

  // Cells are labelled by day-of-month, which is unique within a month.
  dates.forEach((d) => fireEvent.press(screen.getByText(String(Number(d.slice(8))))));
  fireEvent.press(screen.getByText('Continue'));
  return dates;
};

const iso = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * The nearest ancestor of `node` that paints a background — the modal card.
 *
 * Walking up rather than reaching for a testID: the card is a plain View, and
 * what matters is which surface the text is actually drawn on.
 */
const cardBehind = (node: any) => {
  for (let el = node.parent; el; el = el.parent) {
    if (StyleSheet.flatten(el.props?.style)?.backgroundColor) return el;
  }
  throw new Error('No ancestor paints a background');
};

/** WCAG 2.1 contrast ratio between two resolved colours. */
const contrastRatio = (fg: string, bg: string) => {
  const parse = (color: string): [number, number, number] => {
    const hex = color.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
      const n = parseInt(hex[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const rgb = color.match(/rgba?\(([^)]+)\)/);
    if (!rgb) throw new Error(`Cannot parse colour: ${color}`);
    const [r, g, b] = rgb[1].split(',').map((p) => Number(p.trim()));
    return [r, g, b];
  };
  const luminance = (c: string) => {
    const [r, g, b] = parse(c).map((v) => {
      const n = v / 255;
      return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

/** Auto-confirm the "Generate plan?" Alert by pressing its Generate button. */
const autoConfirmGenerate = () =>
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
    const generate = (buttons ?? []).find((b) => b.text === 'Generate');
    generate?.onPress?.();
  });

const openAdvanced = async () => {
  fireEvent.press(await screen.findByLabelText('Advanced planning'));
  await screen.findByText('Continue');
};

/**
 * Enable one meal on the nth configured day.
 *
 * Paper's Checkbox.Item marks its label container
 * `importantForAccessibility="no-hide-descendants"`, so the meal name is NOT
 * findable by text — the checkbox role with its accessible name is the only
 * handle on it.
 */
const enableMeal = (meal: string, dayIndex = 0) =>
  fireEvent.press(screen.getAllByRole('checkbox', { name: meal })[dayIndex]);

/** Enable dinner on the first day and give it servings. */
const configureFirstDinner = (servings = '4') => {
  enableMeal('dinner');
  // Paper renders a TextInput's label twice (floating + resting), both belonging
  // to the same input, so index 0 is the only enabled meal's servings field.
  fireEvent.changeText(screen.getAllByText('Servings')[0], servings);
};

/** Add a tag by pressing its suggestion chip, the way a person would. */
const addTag = (tag: string) => fireEvent.press(screen.getByText(tag));

test('date selection carries the chosen days through to day configuration', async () => {
  renderInApp(<PlannerNavigator />);
  await openAdvanced();
  const dates = chooseDates(2);

  await screen.findByText('Day configuration');

  // The header renders each date in local time. The bug this replaces showed
  // 2026-09-07 as "Sunday - 9/6/2026" because `new Date("2026-09-07")` is UTC
  // midnight, which is the previous evening anywhere behind UTC.
  for (const date of dates) {
    const expected = new Date(`${date}T00:00:00`);
    const label = `${expected.toLocaleDateString(undefined, {
      weekday: 'long',
    })} - ${expected.toLocaleDateString()}`;
    expect(screen.getByText(label)).toBeTruthy();
  }
});

test('the copy-settings modal is readable, not black text on a black card', async () => {
  // Same defect as the calendar, one screen later: the card was a hardcoded
  // #1c1c1e written for a dark theme, so the light theme's near-black body text
  // landed on a near-black background. Invisible, not absent — which is why it
  // survived every behavioural test in this file.
  renderInApp(<PlannerNavigator />);
  await openAdvanced();
  const dates = chooseDates(2);
  await screen.findByText('Day configuration');

  fireEvent.press(screen.getByLabelText(`Copy settings into ${dates[0]}`));

  const heading = await screen.findByText('Apply this day to all days');
  const card = cardBehind(heading);
  const background = StyleSheet.flatten(card.props.style)?.backgroundColor as string;
  const foreground = StyleSheet.flatten(heading.props.style)?.color as string;

  expect(background).toBeDefined();
  expect(foreground).toBeDefined();
  expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
});

test('a plan generates, polls, and lands on the results screen', async () => {
  renderInApp(<PlannerNavigator />);
  await openAdvanced();
  const dates = chooseDates(2);
  await screen.findByText('Day configuration');

  route('POST', '/meal-plans/generate/jobs', { job_id: JOB_ID, request_id: 'req-1' });
  route('GET', `/meal-plans/generate/jobs/${JOB_ID}`, completedJob(dates));
  route('GET', '/recipes/user/1', apiRecipe({ id: 1, title: 'Beef Stroganoff' }));
  route('GET', '/recipes/user/2', apiRecipe({ id: 2, title: 'Turkey Chili' }));

  autoConfirmGenerate();
  configureFirstDinner();
  fireEvent.press(lastByText('Generate plan'));

  await waitFor(() => expect(screen.getByText('Meal plan')).toBeTruthy());
  expect(screen.getByText('Beef Stroganoff')).toBeTruthy();
  expect(screen.getByText('Turkey Chili')).toBeTruthy();
});

test('the generate payload is per-day, with numeric servings and split tags', async () => {
  renderInApp(<PlannerNavigator />);
  await openAdvanced();
  const dates = chooseDates(2);
  await screen.findByText('Day configuration');

  route('POST', '/meal-plans/generate/jobs', { job_id: JOB_ID });
  route('GET', `/meal-plans/generate/jobs/${JOB_ID}`, { status: 'PENDING' });

  autoConfirmGenerate();
  configureFirstDinner('6');
  // Tags are held as one comma-separated string on screen and must reach the
  // server as an array.
  addTag('main course');
  addTag('quick');
  fireEvent.press(lastByText('Generate plan'));

  await waitFor(() => expect(lastCallTo('POST', '/meal-plans/generate/jobs')).toBeDefined());
  expect(lastCallTo('POST', '/meal-plans/generate/jobs')!.data).toEqual({
    days: [
      { date: dates[0], meals: { dinner: { servings: 6, tags: ['main course', 'quick'] } } },
      // The second day was left alone, so it carries no meals rather than
      // an empty dinner the planner would have to fill.
      { date: dates[1], meals: {} },
    ],
  });
});

test('an enabled meal with no servings is refused before any request', async () => {
  renderInApp(<PlannerNavigator />);
  await openAdvanced();
  chooseDates(1);
  await screen.findByText('Day configuration');

  autoConfirmGenerate();
  enableMeal('dinner');
  fireEvent.press(lastByText('Generate plan'));

  await waitFor(() => expect(screen.getByText(/Enter servings for dinner/)).toBeTruthy());
  expect(callsTo('POST', '/meal-plans/generate/jobs')).toHaveLength(0);
});

test('no meals selected at all is refused too', async () => {
  renderInApp(<PlannerNavigator />);
  await openAdvanced();
  chooseDates(1);
  await screen.findByText('Day configuration');

  autoConfirmGenerate();
  fireEvent.press(lastByText('Generate plan'));

  await waitFor(() =>
    expect(screen.getByText('Select at least one meal and servings.')).toBeTruthy(),
  );
  expect(callsTo('POST', '/meal-plans/generate/jobs')).toHaveLength(0);
});

test('a job that fails server-side reports why instead of spinning forever', async () => {
  renderInApp(<PlannerNavigator />);
  await openAdvanced();
  chooseDates(1);
  await screen.findByText('Day configuration');

  route('POST', '/meal-plans/generate/jobs', { job_id: JOB_ID });
  route('GET', `/meal-plans/generate/jobs/${JOB_ID}`, {
    status: 'ERROR',
    error_message: 'The planner model is unavailable.',
  });

  autoConfirmGenerate();
  configureFirstDinner();
  fireEvent.press(lastByText('Generate plan'));

  await waitFor(() => expect(screen.getByText('The planner model is unavailable.')).toBeTruthy());
});

test('a refused generate keeps the configuration on screen', async () => {
  renderInApp(<PlannerNavigator />);
  await openAdvanced();
  chooseDates(1);
  await screen.findByText('Day configuration');

  route('POST', '/meal-plans/generate/jobs', httpError(503, 'No LLM provider configured'));

  autoConfirmGenerate();
  configureFirstDinner();
  fireEvent.press(lastByText('Generate plan'));

  await waitFor(() => expect(screen.getByText('No LLM provider configured')).toBeTruthy());
  // Still on the config screen, servings intact — retyping a week of settings
  // after a transient server error would be unforgivable.
  expect(screen.getByText('Day configuration')).toBeTruthy();
  expect(screen.getAllByText('Servings').length).toBeGreaterThan(0);
});

describe('on the results screen', () => {
  /**
   * Drive the whole chain and stop on the results screen. `makeJob` receives the
   * dates that were actually picked, so a test can shape the plan it needs.
   */
  const reachResults = async (makeJob?: (dates: string[]) => any) => {
    renderInApp(<PlannerNavigator />);
    await openAdvanced();
    const dates = chooseDates(2);
    await screen.findByText('Day configuration');

    route('POST', '/meal-plans/generate/jobs', { job_id: JOB_ID, request_id: 'req-1' });
    route('GET', `/meal-plans/generate/jobs/${JOB_ID}`, (makeJob ?? completedJob)(dates));
    route('GET', /^\/recipes\/(user|stage)\/(.+)$/, ({ match }) =>
      apiRecipe({ id: match[2], title: `Recipe ${match[2]}` }),
    );

    autoConfirmGenerate();
    configureFirstDinner();
    fireEvent.press(lastByText('Generate plan'));
    await waitFor(() => expect(screen.getByText('Meal plan')).toBeTruthy());
    return dates;
  };

  test('re-rolling a slot swaps that recipe and leaves the other day alone', async () => {
    const dates = await reachResults();
    route('POST', '/meal-plans/random/reroll', {
      meal_type: 'dinner',
      recipe_id: 99,
      title: 'Sheet Pan Sausage',
    });

    fireEvent.press(screen.getByLabelText(`Re-roll dinner on ${dates[0]}`));

    await waitFor(() => expect(screen.getByText('Sheet Pan Sausage')).toBeTruthy());
    expect(screen.getByText('Recipe 2')).toBeTruthy();
  });

  test('a re-roll excludes every recipe already on the plan', async () => {
    const dates = await reachResults();
    route('POST', '/meal-plans/random/reroll', {
      meal_type: 'dinner',
      recipe_id: 99,
      title: 'Sheet Pan Sausage',
    });

    fireEvent.press(screen.getByLabelText(`Re-roll dinner on ${dates[0]}`));

    await waitFor(() => expect(lastCallTo('POST', '/meal-plans/random/reroll')).toBeDefined());
    expect(lastCallTo('POST', '/meal-plans/random/reroll')!.data).toEqual({
      meal_type: 'dinner',
      exclude_recipe_ids: [1, 2],
      // The slot's own tags travel with the re-roll, so a swap respects how the
      // slot was configured rather than picking from the whole box.
      tags: ['main course'],
    });
  });

  test('a staged pick does not send a null id and 422 the re-roll', async () => {
    // The regression that took an hour to find: a stage_recipes UUID went through
    // Number() to NaN, JSON.stringify turned NaN into null, and the server's
    // exclude_recipe_ids: List[int] rejected the whole request — so ONE staged
    // pick broke re-roll for every other slot in the plan.
    const dates = await reachResults((picked) => {
      const staged = completedJob(picked);
      (staged.result.days[1].meals.dinner.selection as any) = {
        source: 'stage',
        recipe_id: 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6',
        confidence: null,
        matched_tags: [],
        warnings: [],
        alternatives: [],
      };
      return staged;
    });
    route('POST', '/meal-plans/random/reroll', {
      meal_type: 'dinner',
      recipe_id: 99,
      title: 'Sheet Pan Sausage',
    });

    fireEvent.press(screen.getByLabelText(`Re-roll dinner on ${dates[0]}`));

    await waitFor(() => expect(lastCallTo('POST', '/meal-plans/random/reroll')).toBeDefined());
    const sent = lastCallTo('POST', '/meal-plans/random/reroll')!.data;
    // The integer id is excluded, the UUID is simply dropped — there is nothing
    // to exclude, since a staged recipe is not in the recipes table and the
    // random picker could never have returned it.
    expect(sent.exclude_recipe_ids).toEqual([1]);
    expect(JSON.stringify(sent)).not.toContain('null');
    // And it worked, rather than 422ing.
    await waitFor(() => expect(screen.getByText('Sheet Pan Sausage')).toBeTruthy());
  });

  test('saving the plan posts every slot and then says so', async () => {
    const dates = await reachResults();
    route('POST', '/planner/commit', { id: 12, start_date: dates[0] });

    fireEvent.press(screen.getByText('Save this plan'));

    await waitFor(() => expect(screen.getByText('Plan saved')).toBeTruthy());
    expect(lastCallTo('POST', '/planner/commit')!.data).toEqual({
      start_date: dates[0],
      name: undefined,
      items: [
        { date: dates[0], meal_type: 'dinner', recipe_id: 1, source: 'user' },
        { date: dates[1], meal_type: 'dinner', recipe_id: 2, source: 'user' },
      ],
    });
  });

  test('a rejected save keeps the button live so it can be retried', async () => {
    await reachResults();
    route('POST', '/planner/commit', httpError(500, 'Could not save the plan.'));

    fireEvent.press(screen.getByText('Save this plan'));

    await waitFor(() => expect(screen.getByText('Could not save the plan.')).toBeTruthy());
    expect(screen.getByText('Save this plan')).toBeTruthy();
  });

  test('swapping two days exchanges only the recipes', async () => {
    const dates = await reachResults();

    fireEvent.press(screen.getByLabelText(`Swap dinner on ${dates[0]} with another day`));
    // The dialog lists candidate days as "<date> · <recipe>"; the day cards above
    // render the bare date, so match the composed label to stay unambiguous.
    fireEvent.press(await screen.findByText(`${dates[1]} · Recipe 2`));

    // Recipe 2 is now on the first day. Servings and tags describe the slot, not
    // the recipe, so nothing else should have moved — which the committed
    // payload below is the honest way to check.
    // Servings and tags describe the slot — "Tuesday dinner, for four" — so they
    // stay with the day while only the recipe moves. Scoped per card, because
    // both values are still SOMEWHERE on screen if the swap dragged them along.
    const cards = screen.getAllByTestId('card');
    const first = within(cards[0]);
    const second = within(cards[1]);
    expect(first.getByText(dates[0])).toBeTruthy();
    expect(first.getByText('Servings: 4')).toBeTruthy();
    expect(first.getByText('Tags: main course')).toBeTruthy();
    expect(first.getByText('Recipe 2')).toBeTruthy();
    expect(second.getByText('Servings: 5')).toBeTruthy();
    expect(second.getByText('Tags: quick')).toBeTruthy();
    expect(second.getByText('Recipe 1')).toBeTruthy();

    route('POST', '/planner/commit', { id: 12, start_date: dates[0] });
    fireEvent.press(screen.getByText('Save this plan'));

    await waitFor(() => expect(lastCallTo('POST', '/planner/commit')).toBeDefined());
    expect(lastCallTo('POST', '/planner/commit')!.data.items).toEqual([
      { date: dates[0], meal_type: 'dinner', recipe_id: 2, source: 'user' },
      { date: dates[1], meal_type: 'dinner', recipe_id: 1, source: 'user' },
    ]);
  });
});
