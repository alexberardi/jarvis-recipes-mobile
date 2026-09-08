/**
 * Jest config, moved out of package.json so the coverage ratchet below can
 * carry an explanation.
 */
// Pin the suite east of UTC.
//
// Set here, in the parent process, because jest's sandbox ignores a runtime
// `process.env.TZ =` -- a test that sets it and then asserts is testing nothing.
//
// Europe/Berlin rather than UTC on purpose. This app has produced three
// timezone bugs already (a plan date rendered a day early, a calendar cell
// carrying the previous day, today greyed out as past), and every one of them
// is invisible in a UTC or US-local run: `new Date(y, m, d).toISOString()` only
// shifts the date EAST of UTC. Running there makes the date surface as hostile
// as it is for half the world.
process.env.TZ = 'Europe/Berlin';

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: [
    '@testing-library/jest-native/extend-expect',
    '<rootDir>/jest.setup.js',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native|@react-navigation|@react-native-community|expo(nent)?|@expo(nent)?|@expo-google-fonts|@unimodules|unimodules|sentry-expo|native-base)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  moduleNameMapper: {
    // See __mocks__/expoVectorIcons.js -- expo-asset is unresolvable here, and
    // the pattern has to cover subpaths because react-native-paper probes
    // '@expo/vector-icons/MaterialCommunityIcons' for every icon prop.
    '^@expo/vector-icons(/.*)?$': '<rootDir>/__mocks__/expoVectorIcons.js',
  },
  // Explicit, so helper/fixture files can live under __tests__ without jest's
  // default "everything in __tests__ is a test" rule picking them up.
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  // Measure the whole app, not just the files a test happened to import —
  // otherwise the headline number moves for reasons unrelated to test quality
  // and the threshold below means nothing.
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/mocks/**'],
  // RATCHET, NOT A TARGET. Measured here as statements 62.02 / branches 41.01 /
  // functions 58.54 / lines 63.75, then set a WHOLE POINT below that.
  //
  // Not floored to the next integer: CI measured 61.98% for statements against
  // a local 62.02% and failed a threshold of 62. The number differs slightly
  // between environments, so a threshold sitting on top of it is a coin flip on
  // every run. A point of headroom still catches a real slide -- which is the
  // job -- without failing a build for four hundredths of a percent. They exist to stop coverage SLIDING, and are meant to be
  // raised — never lowered — as tests land.
  //
  // The jump from ~21% came from __tests__/flows: those mount real navigators
  // and fake only HTTP, so one flow test walks a whole stack of screens. See
  // docs/testing.md.
  //
  // RULES.md sets the house target at 80%. What is left is mostly
  // screens/Recipes (the capture and extraction screens, ~32%) and
  // screens/Account. Raise these each time a screen gains coverage.
  coverageThreshold: {
    global: {
      statements: 61,
      branches: 40,
      functions: 57,
      lines: 62,
    },
  },
};
