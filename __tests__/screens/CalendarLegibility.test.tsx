/**
 * The date picker, checked for the two things a flow test cannot see: whether
 * you can READ it, and whether a cell's number matches the date it actually
 * carries.
 *
 * Both were real. The grid was styled with literals written for a dark theme --
 * `rgba(255,255,255,0.9)` text on `rgba(255,255,255,0.04)` -- so under the light
 * theme the whole month rendered white-on-white: every date present, every date
 * tappable, none of them visible. A test renderer has no pixels, but it does have
 * the resolved colours, and a contrast ratio is a number.
 *
 * The date keys were built with `toISOString()`, which converts a local-midnight
 * Date to UTC first. East of UTC that is the previous day, so the cell printed
 * "15" and carried 2026-09-14.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { PaperProvider, MD3Theme } from 'react-native-paper';

import MealPlanDateRangeScreen from '../../src/screens/Planner/MealPlanDateRangeScreen';
import { darkTheme, lightTheme } from '../../src/theme';

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as any;

const renderCalendar = (theme: MD3Theme) =>
  render(
    <PaperProvider theme={theme}>
      <MealPlanDateRangeScreen navigation={navigation} route={{} as any} />
    </PaperProvider>,
  );

/** sRGB relative luminance, per WCAG 2.1. */
const luminance = (rgb: [number, number, number]) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const parseColor = (color: string): [number, number, number] => {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = color.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const [r, g, b] = rgb[1].split(',').map((p) => Number(p.trim()));
    return [r, g, b];
  }
  throw new Error(`Cannot parse colour: ${color}`);
};

const contrastRatio = (fg: string, bg: string) => {
  const a = luminance(parseColor(fg));
  const b = luminance(parseColor(bg));
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
};

/**
 * Every day cell, as { number, key, textColour, backgroundColour }.
 *
 * The accessibility label carries the ISO date the cell will actually send, and
 * the Text child carries the number a person reads — which is precisely the pair
 * the UTC bug pulled apart.
 */
const dayCells = () =>
  screen
    .getAllByRole('button')
    .filter((el) => /^\d{4}-\d{2}-\d{2}$/.test(el.props.accessibilityLabel ?? ''))
    .map((cell) => {
      const text = within(cell);
      return {
        key: cell.props.accessibilityLabel as string,
        number: text.number,
        color: text.color,
        backgroundColor: StyleSheet.flatten(cell.props.style)?.backgroundColor as string,
        disabled: Boolean(cell.props.accessibilityState?.disabled),
      };
    });

/** Pull the single Text out of a cell. */
const within = (cell: any) => {
  const texts = cell.findAllByType(
    require('react-native').Text as any,
  );
  const node = texts[texts.length - 1];
  return {
    number: Number(node.props.children),
    color: StyleSheet.flatten(node.props.style)?.color as string,
  };
};

describe.each([
  ['light', lightTheme],
  ['dark', darkTheme],
])('under the %s theme', (_name, theme) => {
  test('every date is legible against the cell it sits in', () => {
    renderCalendar(theme);

    const illegible = dayCells()
      .map((cell) => ({ ...cell, ratio: contrastRatio(cell.color, cell.backgroundColor) }))
      // 3:1 is the WCAG AA floor for large text and UI components. A disabled
      // date is deliberately muted, but "muted" still has to mean readable.
      .filter((cell) => cell.ratio < 3);

    expect(
      illegible.map((c) => `${c.key}: ${c.color} on ${c.backgroundColor} = ${c.ratio.toFixed(2)}:1`),
    ).toEqual([]);
  });

  test('no cell paints itself with a literal instead of a theme colour', () => {
    renderCalendar(theme);
    const themeColours = new Set(
      Object.values(theme.colors).filter((v) => typeof v === 'string') as string[],
    );

    for (const cell of dayCells()) {
      expect(themeColours).toContain(cell.backgroundColor);
      expect(themeColours).toContain(cell.color);
    }
  });
});

describe('the date a cell actually carries', () => {
  // The suite runs pinned to Europe/Berlin (see jest.config.js). That matters
  // here: `new Date(y, m, d).toISOString()` only shifts the date EAST of UTC, so
  // in a US-local or UTC run this whole block passes no matter how `fmt` is
  // written. Setting process.env.TZ inside a test does NOT work -- jest's sandbox
  // ignores it, and an earlier version of this file looped over four zones while
  // silently running all four in the machine's own.
  test('is pinned east of UTC, or the next test proves nothing', () => {
    expect(new Date().getTimezoneOffset()).toBeLessThan(0);
  });

  test('matches the number printed on it', () => {
    renderCalendar(lightTheme);

    const cells = dayCells();
    expect(cells.length).toBeGreaterThan(27);
    for (const cell of cells) {
      expect(Number(cell.key.slice(8))).toBe(cell.number);
    }
  });

  test('yesterday stays unselectable just after midnight', () => {
    // `todayKey` used the same UTC conversion. Just after local midnight east of
    // UTC that reads as YESTERDAY, which quietly re-opened past dates for
    // selection; west of UTC the same bug greys out the current day all evening.
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const justAfterMidnight = new Date(2026, 9, 15, 0, 30, 0);
      jest.setSystemTime(justAfterMidnight);
      renderCalendar(lightTheme);

      const cells = dayCells();
      const yesterday = cells.find((c) => c.key === '2026-10-14');
      const today = cells.find((c) => c.key === '2026-10-15');

      expect(yesterday?.disabled).toBe(true);
      expect(today?.disabled).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
