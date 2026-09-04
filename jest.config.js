/**
 * Jest config, moved out of package.json so the coverage ratchet below can
 * carry an explanation.
 */
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
  // Explicit, so helper/fixture files can live under __tests__ without jest's
  // default "everything in __tests__ is a test" rule picking them up.
  testMatch: ['**/__tests__/**/*.test.ts?(x)'],
  // Measure the whole app, not just the files a test happened to import —
  // otherwise the headline number moves for reasons unrelated to test quality
  // and the threshold below means nothing.
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/mocks/**'],
  // RATCHET, NOT A TARGET. These are the numbers actually measured on the
  // suite as it stands (statements 20.80 / branches 10.55 / functions 16.72 /
  // lines 21.63), floored to the next integer down so a rounding wobble can't
  // red the build. They exist to stop coverage SLIDING, and are meant to be
  // raised — never lowered — as tests land.
  //
  // RULES.md sets the house target at 80%. The gap is almost entirely the
  // screen layer: src/api, src/auth and the token/job services are already
  // 90%+, while most of src/screens has no test at all. Raise these each time
  // a screen gains coverage.
  coverageThreshold: {
    global: {
      statements: 20,
      branches: 10,
      functions: 16,
      lines: 21,
    },
  },
};
