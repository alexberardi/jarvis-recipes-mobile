# Auth Flow PRD — Jarvis Recipes Mobile App

This document defines the **mobile authentication flow** for the Jarvis Recipes React Native app and how it integrates with **jarvis-auth** and **jarvis-recipes** APIs.

The goals are:
- Allow the user to **log in** and **create an account** via jarvis-auth.
- Store and manage **JWT access tokens** and **refresh tokens** on the device.
- Automatically attach the access token to **jarvis-recipes** API requests.
- Protect all main app screens so that unauthenticated users see only the **landing/login** flow.
- Handle expired tokens by using the **refresh token** (MVP behavior: refresh on 401 from recipes server).

This PRD focuses on mobile app behavior only. Server-side behavior is defined in the backend PRDs.

---

## Tech & Structure Assumptions

- React Native app (Expo-based) using TypeScript.
- React Navigation for screen/navigation handling (stack + tabs).
- HTTP client: `axios` for convenience and interceptors.
- Token storage: `@react-native-async-storage/async-storage` (can be swapped to `expo-secure-store` later without changing the public API).

File/folder conventions (approximate):

- `src/navigation/` — navigators (Auth stack, App stack, root navigator)
- `src/screens/` — all screens (Login, Register, Landing, existing recipe/planner screens)
- `src/auth/` — auth context, hooks, and service helpers
- `src/api/` — axios clients for auth and recipes APIs


---

## API Contracts (Client Perspective)

### 1. Auth Server (jarvis-auth)

Base URL example (to be configured via env):

- `AUTH_API_BASE_URL` (e.g. `http://localhost:8000` or tunnel URL)

Endpoints used by the mobile app:

#### POST /auth/register

- **Request body** (JSON):
  ```json
  {
    "email": "user@example.com",
    "password": "plain-text-or-hashed-client-side",
    "username": "optional_display_name"
  }
  ```

- **Response body** (JSON):
  ```json
  {
    "access_token": "<jwt>",
    "refresh_token": "<opaque_or_jwt>",
    "token_type": "bearer",
    "user": {
      "id": 1,
      "email": "user@example.com",
      "username": "User Name"
    }
  }
  ```

#### POST /auth/login

- **Request body**:
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```

- **Response body**: same shape as `/auth/register`.

#### POST /auth/refresh

- **Request body**:
  ```json
  {
    "refresh_token": "<stored_refresh_token>"
  }
  ```

- **Response body**:
  ```json
  {
    "access_token": "<new_jwt>",
    "refresh_token": "<new_or_same_refresh_token>",
    "token_type": "bearer"
  }
  ```

The mobile app **never** sends the refresh token to jarvis-recipes.


### 2. Recipes Server (jarvis-recipes)

Base URL example:

- `RECIPES_API_BASE_URL` (e.g. `http://localhost:8001`)

All protected endpoints (e.g. `/recipes`, `/planner`, `/tags`) require:

```http
Authorization: Bearer <access_token>
```

On invalid or expired tokens, server returns:

```json
{
  "detail": "Invalid or expired token"
}
```

Status code: `401`.

This is the signal for the mobile app to attempt a **token refresh**.

---

## Screens & Navigation

### 1. Screens

The app will include the following auth-related screens:

1. **Landing / Auth Gate Screen** (e.g. `LandingScreen`)
   - Shown on app start while checking stored tokens.
   - If user is authenticated → navigate to main app.
   - If not authenticated → show a simple landing view with:
     - App name / logo / short description.
     - Buttons: **"Log In"** and **"Create Account"**.

2. **Login Screen** (e.g. `LoginScreen`)
   - Inputs:
     - Email (text input)
     - Password (password input)
   - Buttons:
     - **Log In** (primary)
     - **Back** (returns to Landing)
   - Behavior:
     - On submit:
       - Call `POST /auth/login` on jarvis-auth via `authApi`.
       - On success: store `access_token`, `refresh_token`, and basic user info; set app auth state to logged-in; navigate to main app stack.
       - On error: show error message (invalid credentials, network error, etc.).

3. **Register Screen** (e.g. `RegisterScreen`)
   - Inputs:
     - Email
     - Username (optional)
     - Password
     - Confirm Password (client-side equality check only)
   - Buttons:
     - **Create Account**
     - **Back to Login** / **Back**
   - Behavior:
     - On submit:
       - Call `POST /auth/register` on jarvis-auth.
       - On success: treat same as login (store tokens, set auth state, navigate to main app stack).
       - On error: show validation or server messages.

4. **Account / Settings Screen** (existing or new)
   - Shows basic user info (email, username).
   - Contains **Logout** button.
   - On logout: clears tokens from storage and resets auth state, then navigates back to the Landing/Login flow.

All **existing recipe/planner-related screens** (e.g., home, recipe list, detail, planner, add recipe wizard) are considered **protected** and must only be reachable when authenticated.


### 2. Navigation Structure

Implement a basic navigation structure using React Navigation:

- **Auth Stack** (unauthenticated):
  - LandingScreen
  - LoginScreen
  - RegisterScreen

- **App Stack / Tabs** (authenticated):
  - Existing main tabs / stacks (e.g. Recipes, Planner, Add Recipe, Account)

- **Root Navigator**:
  - Renders **Auth Stack** if `authState.isAuthenticated === false`.
  - Renders **App Stack** if `authState.isAuthenticated === true`.
  - Shows a loading indicator while checking stored tokens on app startup (`authState.isLoading === true`).


---

## Auth State Management

Create a dedicated **AuthContext** and hook to manage token and user state.

### Auth State Shape

Define an `AuthState` TypeScript type similar to:

```ts
interface AuthUser {
  id: number;
  email: string;
  username?: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean; // true while bootstrapping from storage
}
```

### AuthContext API

Expose these functions from an `AuthProvider` via `useAuth()` hook:

- `login(email: string, password: string): Promise<void>`
- `register(email: string, password: string, username?: string): Promise<void>`
- `logout(): Promise<void>`
- `refreshAccessToken(): Promise<string | null>` (used internally by API client)
- `bootstrapAuth(): Promise<void>` (called once on app start to load tokens from storage)


### Token & User Storage

Use AsyncStorage to persist tokens and user info (keys can be constants in a single module):

```ts
const ACCESS_TOKEN_KEY = "@jarvis_recipes/access_token";
const REFRESH_TOKEN_KEY = "@jarvis_recipes/refresh_token";
const USER_KEY = "@jarvis_recipes/user";
```

On successful login/register:

1. Save `access_token`, `refresh_token`, and `user` to AsyncStorage.
2. Update in-memory `AuthState`.

On app startup:

1. `AuthProvider` calls `bootstrapAuth()` in a `useEffect`.
2. `bootstrapAuth()`:
   - Reads stored values from AsyncStorage.
   - If tokens are present:
     - Set `authState.isAuthenticated = true` and populate `user`, `accessToken`, `refreshToken`.
   - If not present or invalid JSON:
     - Set `authState.isAuthenticated = false` and `user = null`.
   - Set `isLoading = false` when done.

On logout:

- Clear tokens and user from AsyncStorage.
- Reset `AuthState` to initial (unauthenticated) and navigate to Landing/Login.


---

## API Clients & Token Attachment

Implement two axios instances in `src/api/`:

1. `authApi` — points to jarvis-auth base URL
2. `recipesApi` — points to jarvis-recipes base URL

### authApi

- No default Authorization header needed.
- Used by `login`, `register`, and `refreshAccessToken` functions.

### recipesApi

- Must attach the current access token to every request.
- Use an axios **request interceptor** that reads `accessToken` from `AuthContext`.

Pseudo-implementation behavior:

- On every request:
  - If `accessToken` exists → set `Authorization: Bearer <accessToken>` header.

### Handling Expired Tokens (401 from recipes server)

Use an axios **response interceptor** on `recipesApi` to handle 401s from jarvis-recipes:

1. If a response returns `401` and the request has not been retried yet:
   - Call `refreshAccessToken()` from AuthContext.
   - If refresh succeeds and returns a new access token:
     - Update Authorization header with the new access token.
     - Retry the original request once.
   - If refresh fails (no refresh token, refresh endpoint error, etc.):
     - Call `logout()` and navigate the user back to the Landing/Login flow.

2. If the request was already retried and still fails with 401:
   - Do **not** retry again.
   - Propagate the error and ensure the user is logged out.


---

## Guarding Screens

- The **root navigator** must never render the main app stack when `authState.isAuthenticated === false`.
- All main recipe/planner screens live in the authenticated stack only.
- There is no need for per-screen guards if navigation is structured cleanly:
  - Authenticated stack ↔ only for logged-in users.
  - Auth stack ↔ only for logged-out users.

If the access token becomes invalid mid-session and refresh fails, `logout()` must:
- Clear storage.
- Reset auth state.
- Navigate the user back to the Landing/Login flow.


---

## Error & UX Requirements

- **Login/Register Errors**:
  - Show inline, human-readable error messages for:
    - Invalid credentials
    - Email already in use
    - Network/server errors
- **Loading States**:
  - Show a spinner or disabled button state while requests are in flight.
  - Root-level loading (during `bootstrapAuth`) should show a simple loading screen rather than flashing the login screen.
- **Password Handling**:
  - No client-side password complexity rules for MVP (backend may enforce if desired).
  - No forgot-password flow for now; UI should not expose that option until backend supports it.


---

## Testing Requirements (High-Level)

At minimum, the following behaviors should be manually verifiable or unit-tested where possible:

1. **Initial Load**
   - With no stored tokens → app shows Landing/Login.
   - With valid stored tokens → app navigates directly to the main app stack.

2. **Login**
   - Valid credentials → transitions to authenticated state, stores tokens, main screens accessible.
   - Invalid credentials → stay on login, show error.

3. **Register**
   - Successful registration → behaves like login (authenticated immediately).

4. **Logout**
   - Clears tokens and user data, returns to Landing/Login.

5. **Token Attachment**
   - Requests to jarvis-recipes include `Authorization: Bearer <access_token>` header when authenticated.

6. **Token Expiry Handling**
   - On 401 from jarvis-recipes, app attempts `/auth/refresh`.
   - If refresh succeeds → request is retried and succeeds.
   - If refresh fails → user is logged out and sent to Landing/Login.


---

## Summary

- The mobile app authenticates users by calling **jarvis-auth** for login and registration.
- It stores and manages `access_token`, `refresh_token`, and basic user info via an AuthContext and AsyncStorage.
- All main recipe/planner screens are **protected** behind the authenticated navigation stack.
- All requests to **jarvis-recipes** include `Authorization: Bearer <access_token>` and handle token expiry via `/auth/refresh`.
- Logout and token-clearing return the user cleanly to the Landing/Login experience.

This PRD should be used by the codegen/assistant in Cursor to implement the full auth experience for the Jarvis Recipes mobile app.
