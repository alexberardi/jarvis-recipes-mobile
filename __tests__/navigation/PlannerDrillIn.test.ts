/**
 * Opening a planned meal's recipe must stay inside the PLANNER stack.
 *
 * It used to be `getParent().navigate('RecipesTab', { screen: 'RecipeDetail' })`,
 * which switches tabs: Back then popped the RECIPES stack and left you on the
 * recipe list, having lost the plan you were reading.
 *
 * This is a source guard rather than a flow test on purpose. In the test
 * harness both versions render RecipeDetail -- bottom tabs keep their screens
 * mounted, so "which tab is in front" is not observable through queries, and a
 * flow test that looks like it covers this would pass either way. (It did: the
 * first version of this guard was a flow test, and the tab-jump mutation sailed
 * through it.) So pin the two things that actually constitute the fix.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');
const PLANNER_SCREENS = join(SRC, 'screens', 'Planner');

const plannerSources = () =>
  readdirSync(PLANNER_SCREENS)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ({ file: f, text: readFileSync(join(PLANNER_SCREENS, f), 'utf-8') }));

test('the planner stack can show a recipe itself', () => {
  const nav = readFileSync(join(SRC, 'navigation', 'PlannerNavigator.tsx'), 'utf-8');
  expect(nav).toMatch(/name="RecipeDetail"/);
  // And somewhere to edit from there, or the Edit button in that screen is dead
  // in this stack.
  expect(nav).toMatch(/name="CreateRecipe"/);
});

test('no planner screen opens a recipe by jumping to the Recipes tab', () => {
  const offenders = plannerSources()
    .filter(({ text }) => /getParent\(\)[\s\S]{0,80}RecipesTab[\s\S]{0,200}RecipeDetail/.test(text))
    .map(({ file }) => file);

  expect(offenders).toEqual([]);
});

test('the drill-in navigates within the stack', () => {
  // At least one screen must actually do it the right way, so this file fails
  // if the drill-in is removed rather than silently guarding nothing.
  const inStack = plannerSources().filter(({ text }) =>
    /navigation\.navigate\(\s*'RecipeDetail'/.test(text),
  );
  expect(inStack.length).toBeGreaterThan(0);
});
