/**
 * The step fields on the recipe editor.
 *
 * They used to carry an explicit `height`, recomputed on every content-size
 * change and clamped to 80-160. Two things went wrong with that, both visible in
 * the same screenshot: a one-line step reserved 80pt of empty box, and a two-line
 * step had its text clipped top and bottom.
 *
 * The clipping is the instructive half. Setting `height` on a Paper TextInput
 * sizes the OUTER component, while the inner native input keeps its own padding
 * — so the text is laid out outside the region the height allows. The Description
 * field on the same screen has always been `multiline` with no height and grows
 * correctly; this makes the steps match it.
 *
 * A test renderer has no layout, so it cannot tell whether text is clipped. It
 * can tell whether a height was pinned, and that is the cause rather than the
 * symptom.
 */
import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet } from 'react-native';
import { PaperProvider } from 'react-native-paper';

import CreateRecipeScreen from '../../src/screens/Recipes/CreateRecipeScreen';

jest.mock('../../src/services/recipes', () => ({
  createRecipe: jest.fn(),
  uploadRecipeImage: jest.fn(),
}));
jest.mock('../../src/hooks/useTags', () => ({ useTags: () => ({ data: [] }) }));
jest.mock('../../src/services/parseRecipe', () => ({
  submitParsePayload: jest.fn(),
  getParseJobStatus: jest.fn(),
  cancelJob: jest.fn(),
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() } as any;

const renderEditor = (steps: string[]) =>
  render(
    <PaperProvider>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <NavigationContainer>
          <CreateRecipeScreen
            navigation={navigation}
            route={{ params: { initialRecipe: { steps } }, key: 'k', name: 'CreateRecipe' } as any}
          />
        </NavigationContainer>
      </QueryClientProvider>
    </PaperProvider>,
  );

/** Every step field on screen, by its placeholder. */
const stepFields = () => screen.getAllByPlaceholderText(/^Step \d+$/);

/**
 * Render with `count` steps and assert they are actually on screen.
 *
 * The count check is not ceremony. An earlier draft passed the prefill under the
 * wrong route param, so every case rendered ONE empty field and three assertions
 * about "each step field" passed while examining nothing.
 */
const renderSteps = (steps: string[]) => {
  renderEditor(steps);
  expect(stepFields()).toHaveLength(steps.length);
};

describe('step fields', () => {
  test('none of them pins a height', () => {
    // The defect itself. A fixed height on a Paper TextInput both wastes space
    // on a short step and clips a long one.
    renderSteps(['Heat pan with oiled paper, cook until golden.', 'Flip to cook other side.']);

    for (const field of stepFields()) {
      const style = StyleSheet.flatten(field.props.style) || {};
      expect(style.height).toBeUndefined();
      expect(style.minHeight).toBeUndefined();
      expect(style.maxHeight).toBeUndefined();
    }
  });

  test('they are multiline, so they can grow with the text', () => {
    // Without this the field is one line and a long step scrolls sideways —
    // removing the fixed height would have made that worse, not better.
    renderSteps(['A step long enough to wrap onto a second line when rendered.', 'Flip.']);

    for (const field of stepFields()) {
      expect(field.props.multiline).toBe(true);
    }
  });

  test('a long step and a short step are styled identically', () => {
    // They differed only through the removed height bookkeeping; if a difference
    // reappears, something is sizing them by content again.
    renderSteps([
      'Flip.',
      'Heat pan with oiled paper, cook until golden, then flip and cook the other side.',
    ]);

    const [short, long] = stepFields().map((f) => StyleSheet.flatten(f.props.style) || {});
    expect(short).toEqual(long);
  });

  test('the row lets the delete button sit beside the first line', () => {
    // alignItems 'center' floated it to the vertical middle of a tall field,
    // away from the step it deletes.
    renderSteps(['One.', 'Two.']);

    // Walk up to the actual row rather than guessing a depth: Paper wraps its
    // TextInput in several views, and a fixed `.parent.parent` landed on one of
    // those, so this assertion examined a style object that never had
    // alignItems at all and passed regardless.
    const [field] = stepFields();
    let node: any = field.parent;
    let row: any = null;
    while (node) {
      const style = StyleSheet.flatten(node.props?.style) || {};
      if (style.flexDirection === 'row') {
        row = style;
        break;
      }
      node = node.parent;
    }

    expect(row).not.toBeNull();
    expect(row.alignItems).not.toBe('center');
  });
});
