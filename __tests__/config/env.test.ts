import { readFileSync } from 'fs';
import { join } from 'path';

import { fromEnv } from '../../src/config/env';

// EAS does NOT interpolate `${VAR}` inside eas.json's `env` block -- those are
// literal strings. A profile written as
//
//   "env": { "EXPO_PUBLIC_RECIPES_API_BASE_URL": "${EXPO_PUBLIC_RECIPES_API_BASE_URL}" }
//
// ships a build whose variable VALUE is the placeholder text. It flowed through
// DEFAULT_URLS to LandingScreen's `shortAddress`, so the first screen of a store
// build displayed "${EXPO_PUBLIC_RECIPES_API_BASE_URL}" where the server address
// belongs.

describe('fromEnv', () => {
  const FALLBACK = 'http://localhost:7030';

  it('uses a real value', () => {
    expect(fromEnv('https://recipes.example.io', FALLBACK)).toBe(
      'https://recipes.example.io',
    );
  });

  it('falls back when unset', () => {
    expect(fromEnv(undefined, FALLBACK)).toBe(FALLBACK);
  });

  it('falls back when empty or whitespace', () => {
    expect(fromEnv('', FALLBACK)).toBe(FALLBACK);
    expect(fromEnv('   ', FALLBACK)).toBe(FALLBACK);
  });

  it('falls back on an unexpanded placeholder rather than showing it', () => {
    expect(fromEnv('${EXPO_PUBLIC_RECIPES_API_BASE_URL}', FALLBACK)).toBe(FALLBACK);
    expect(fromEnv('  ${ANYTHING}  ', FALLBACK)).toBe(FALLBACK);
  });

  it('does not mistake a real URL containing braces for a placeholder', () => {
    const url = 'https://example.io/${weird}/path';
    expect(fromEnv(url, FALLBACK)).toBe(url);
  });

  it('trims surrounding whitespace', () => {
    expect(fromEnv('  https://recipes.example.io  ', FALLBACK)).toBe(
      'https://recipes.example.io',
    );
  });
});

describe('eas.json', () => {
  const eas = JSON.parse(
    readFileSync(join(__dirname, '../../eas.json'), 'utf-8'),
  ) as { build: Record<string, { env?: Record<string, string>; environment?: string }> };

  it('never declares an unexpanded ${...} placeholder', () => {
    const offenders: string[] = [];
    for (const [profile, config] of Object.entries(eas.build)) {
      for (const [key, value] of Object.entries(config.env ?? {})) {
        if (typeof value === 'string' && /^\$\{[^}]*\}$/.test(value.trim())) {
          offenders.push(`${profile}.${key}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('binds every store-bound profile to an EAS environment', () => {
    // That is how real values arrive; the `env` block cannot reference them.
    for (const profile of ['preview_internal', 'preview', 'production']) {
      expect(eas.build[profile].environment).toBeTruthy();
    }
  });
});
