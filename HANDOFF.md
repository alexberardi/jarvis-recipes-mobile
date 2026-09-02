# Handoff — `feat/keychain-tokens-and-tests`

**Date:** 2026-09-02
**Branch:** `feat/keychain-tokens-and-tests` (pushed, no PR opened)
**Base:** `main`, which was exactly level with `origin/main` — no divergence to untangle.
**Commit:** `b405896` — 38 files, +541 / −219

Written for whoever picks this up next. It was a working tree full of
uncommitted changes; the commit is a rescue of that work, not a finished,
reviewed unit.

---

## ⚠️ Status: UNVERIFIED

**The test suite has never been run against this branch.** The commit *adds*
eight test files plus `jest.config.js`, and I have no evidence any of them pass.
Nothing here has been run on a simulator or a device either.

```bash
npm ci        # see the lockfile warning below
npm test
```

**Lockfile caveat:** this branch adds `expo-secure-store` as a dependency.
`package.json` changed but `package-lock.json` only moved 10 lines, so the lock
may not fully describe the new tree. If `npm ci` fails or the module resolves
oddly, run `npm install` to reconcile and commit the resulting lockfile.

---

## Goal of the branch

A security hardening pass on auth token handling, plus the test suite that
should have accompanied it.

### 1. JWTs move to the OS keychain (`src/services/tokenStorage.ts`, new)

Access and refresh tokens were in AsyncStorage, which is **unencrypted on disk**
and readable from device backups or on a compromised device. These are
`jarvis-auth` tokens, so a leak out of this app is a credential valid against
the **whole Jarvis stack**, not just the recipes service.

- Tokens now live in the OS keychain (iOS Keychain / Android Keystore) via
  `expo-secure-store`.
- Written `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: never carried into an iCloud/iTunes
  backup or a device migration, unreadable while the device is locked.
  (`keychainAccessible` is iOS-only; on Android the Keystore key is inherently
  non-exportable, giving the same "this device only" property.)
- No biometric gate — this app has no biometric opt-in.
- SecureStore keys are restricted to `[A-Za-z0-9._-]`, so the legacy
  `@jarvis_recipes/...` AsyncStorage keys **cannot be reused**. Tokens written
  by older builds are migrated into the keychain on first read and the plaintext
  copies deleted, so an existing session survives the upgrade without a
  re-login. **Worth testing explicitly on an upgrade install, not just a fresh
  one** — this is the path most likely to regress silently.
- The non-secret user blob stays in AsyncStorage.

### 2. Single-flight token refresh (`src/auth/AuthContext.tsx`, `src/api/recipesApi.ts`)

The refresh token **rotates on every use**, so it must never be double-spent.

- Refresh now lives in `recipesApi` (`refreshAuthToken`) behind one single-flight
  request, shared by both callers: the 401 retry path and the periodic timer.
  Previously these could race.
- `AuthContext` keeps a synchronous `stateRef` mirror of its state. The refresh
  in `recipesApi` is module-level and can read the token pair in the window
  between a `setState` and its re-render; a stale read there would replay an
  already-rotated refresh token. **Don't route those getters back through React
  state.**

### 3. Incidental

- `src/components/ErrorBoundary.tsx` (new) — a render crash no longer blanks
  the app.
- Storage keys centralised in `src/config/storageKeys.ts`.
- Dev fallback URLs corrected to the documented ports — auth **7701**, recipes
  **7030**. They were pointing at 8000/8001.
- `app.json` folded into `app.config.js`; EAS / deploy workflow updated;
  `dependabot.yml` added.

---

## Suggested next steps

1. Reconcile the lockfile if needed, then `npm test` — get it green.
2. Run on a simulator and confirm login → token persistence → app restart →
   still logged in.
3. Test the **legacy-token migration path**: install a build from `main`, log
   in, then upgrade to this branch and confirm the session survives and the
   AsyncStorage plaintext copies are gone.
4. Exercise refresh under contention — trigger a 401 retry while the periodic
   timer is due — and confirm only one refresh request goes out.
5. Then open a PR.

## Related

`jarvis-recipes-server` has a companion branch,
`feat/rs256-verify-and-settings-db`, covering the server half (RS256/HS256
dual-accept verification, runtime knobs to the settings DB). The two are
independent — neither blocks the other.
