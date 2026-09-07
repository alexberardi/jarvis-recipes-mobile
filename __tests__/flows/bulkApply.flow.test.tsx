/**
 * FLOW: bulk-apply on the day configuration screen.
 *
 * "Dinner is for four" is a household fact, not a per-day decision, and typing
 * it seven times is exactly the busywork this screen should remove.
 *
 * This replaces a test that re-implemented `applyServingsToAllDays` in its own
 * file under the heading "Mirrors applyServingsToAllDays". It stayed green while
 * the screen's behaviour changed underneath it, which is worse than having no
 * test: it reported on a copy nobody ships. Everything here goes through the real
 * screen and is asserted on the payload that actually leaves the app.
 */
import { Alert } from 'react-native';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import PlannerNavigator from '../../src/navigation/PlannerNavigator';
import { lastByText, lastCallTo, renderInApp, resetApi, route } from './harness';

jest.mock('../../src/api/recipesApi', () => require('./fakeApi').recipesApiMock());
jest.mock('../../src/api/authApi', () => require('./fakeApi').authApiMock());

const JOB_ID = 'job-bulk';

beforeEach(() => {
  resetApi();
  jest.restoreAllMocks();
  route('GET', '/tags', [{ id: 1, name: 'quick' }]);
  route('GET', '/planner/current', {});
  route('POST', '/meal-plans/generate/jobs', { job_id: JOB_ID });
  route('GET', `/meal-plans/generate/jobs/${JOB_ID}`, { status: 'PENDING' });
});

const iso = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Pick `count` consecutive selectable dates and continue to day config. */
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
  dates.forEach((d) => fireEvent.press(screen.getByLabelText(d)));
  fireEvent.press(screen.getByText('Continue'));
  return dates;
};

const openDayConfig = async (count: number) => {
  renderInApp(<PlannerNavigator />);
  fireEvent.press(await screen.findByLabelText('Advanced planning'));
  await screen.findByText('Continue');
  const dates = chooseDates(count);
  await screen.findByText('Day configuration');
  return dates;
};

/** Paper's Checkbox.Item hides its label from text queries; use the role. */
const enableMeal = (meal: string, dayIndex = 0) =>
  fireEvent.press(screen.getAllByRole('checkbox', { name: meal })[dayIndex]);

/**
 * Type into the nth Servings field on screen.
 *
 * Paper renders a TextInput's label TWICE -- the floating one and the resting
 * one -- both belonging to the same input, so the nth input is at index n*2.
 */
const setServings = (value: string, index = 0) =>
  fireEvent.changeText(screen.getAllByText('Servings')[index * 2], value);

const confirm = (label: string) =>
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    (buttons ?? []).find((b) => b.text === label)?.onPress?.();
  });

/** Generate, and hand back the request body the server would have received. */
const generatedPayload = async () => {
  confirm('Generate');
  fireEvent.press(lastByText('Generate plan'));
  await waitFor(() => expect(lastCallTo('POST', '/meal-plans/generate/jobs')).toBeDefined());
  return lastCallTo('POST', '/meal-plans/generate/jobs')!.data;
};

describe('apply servings to every day', () => {
  test('turns the meal on for days where it was off', async () => {
    // The behaviour that matters: on a fresh plan every day but the one being
    // edited is switched off, which is exactly when someone reaches for this
    // button. Writing only to already-enabled slots made it do nothing.
    const dates = await openDayConfig(3);
    enableMeal('dinner', 0);
    setServings('4');

    confirm('Apply');
    fireEvent.press(screen.getByLabelText('Apply 4 servings to every dinner'));

    const payload = await generatedPayload();
    expect(payload.days).toEqual(
      dates.map((date) => ({ date, meals: { dinner: { servings: 4 } } })),
    );
  });

  test('it overwrites servings already set on another day', async () => {
    const dates = await openDayConfig(2);
    enableMeal('dinner', 0);
    enableMeal('dinner', 1);
    setServings('4', 0);
    setServings('2', 1);

    confirm('Apply');
    fireEvent.press(screen.getAllByLabelText('Apply 4 servings to every dinner')[0]);

    const payload = await generatedPayload();
    expect(payload.days.map((d: any) => d.meals.dinner.servings)).toEqual([4, 4]);
    expect(payload.days.map((d: any) => d.date)).toEqual(dates);
  });

  test('it leaves a different meal type alone', async () => {
    // Lunch for one and dinner for four is normal, so the apply is scoped to the
    // meal it was pressed on.
    const dates = await openDayConfig(2);
    enableMeal('lunch', 0);
    setServings('1');
    enableMeal('dinner', 0);
    setServings('4', 1);

    confirm('Apply');
    fireEvent.press(screen.getByLabelText('Apply 4 servings to every dinner'));

    const payload = await generatedPayload();
    expect(payload.days[0].meals).toEqual({
      lunch: { servings: 1 },
      dinner: { servings: 4 },
    });
    // Day two got dinner from the apply, and no lunch.
    expect(payload.days[1].meals).toEqual({ dinner: { servings: 4 } });
    expect(payload.days.map((d: any) => d.date)).toEqual(dates);
  });

  test('cancelling changes nothing', async () => {
    await openDayConfig(2);
    enableMeal('dinner', 0);
    setServings('4');

    confirm('Cancel');
    fireEvent.press(screen.getByLabelText('Apply 4 servings to every dinner'));

    const payload = await generatedPayload();
    expect(payload.days[1].meals).toEqual({});
  });

  test('a day can still be switched back off afterwards', async () => {
    // The apply is a shortcut, not a lock. This is what makes enabling every day
    // an acceptable default rather than something to undo by hand.
    const dates = await openDayConfig(3);
    enableMeal('dinner', 0);
    setServings('4');

    confirm('Apply');
    fireEvent.press(screen.getByLabelText('Apply 4 servings to every dinner'));
    enableMeal('dinner', 2);

    const payload = await generatedPayload();
    expect(payload.days.map((d: any) => Object.keys(d.meals))).toEqual([
      ['dinner'],
      ['dinner'],
      [],
    ]);
    expect(payload.days.map((d: any) => d.date)).toEqual(dates);
  });
});

describe('apply one day to every day', () => {
  test('it copies the whole configuration across', async () => {
    const dates = await openDayConfig(3);
    enableMeal('dinner', 0);
    setServings('4');
    fireEvent.press(screen.getByText('quick'));

    fireEvent.press(screen.getByLabelText(`Copy settings into ${dates[0]}`));
    fireEvent.press(
      await screen.findByText(`Apply to all ${dates.length - 1} other days`),
    );

    const payload = await generatedPayload();
    expect(payload.days).toEqual(
      dates.map((date) => ({ date, meals: { dinner: { servings: 4, tags: ['quick'] } } })),
    );
  });

  test('each day gets its own copy, not a shared reference', async () => {
    // Sharing the object would make a later edit to one day silently change the
    // others -- invisible on screen until the payload comes out wrong.
    const dates = await openDayConfig(3);
    enableMeal('dinner', 0);
    setServings('4');

    fireEvent.press(screen.getByLabelText(`Copy settings into ${dates[0]}`));
    fireEvent.press(
      await screen.findByText(`Apply to all ${dates.length - 1} other days`),
    );

    // Change day two only.
    setServings('8', 1);

    const payload = await generatedPayload();
    expect(payload.days.map((d: any) => d.meals.dinner.servings)).toEqual([4, 8, 4]);
  });
});
