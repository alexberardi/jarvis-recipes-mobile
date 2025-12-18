# Recipe Parse via URL — Client Integration PRD

Scope: define how clients (e.g., React Native app) submit a recipe URL for parsing, handle async job status, and consume the parsed recipe payload for preview and optional save.

Server already implemented; this PRD specifies expected requests/responses, models, and UX/error handling guidance.

## Endpoints

### 1) Enqueue parse (async)
- **POST** `/recipes/parse-url/async`
- **Auth**: Bearer JWT (same as other protected routes)
- **Body**
  ```json
  {
    "url": "https://example.com/recipe",
    "use_llm_fallback": true
  }
  ```
- **Success 200**
  ```json
  {
    "id": "uuid-job-id",
    "status": "PENDING"
  }
  ```
  - `status`: `PENDING` or `RUNNING` initially.
- **Error**
  - 401/403 on auth failure
  - 422 on invalid body
  - 500 unexpected (rare)

### 2) Poll job status
- **GET** `/recipes/parse-url/status/{job_id}`
- **Auth**: Bearer JWT
- **Success 200**
  ```json
  {
    "id": "uuid-job-id",
    "status": "PENDING" | "RUNNING" | "COMPLETE" | "ERROR",
    "result": {
      "success": true,
      "recipe": { ...ParsedRecipe... },
      "used_llm": false,
      "parser_strategy": "schema_org_json_ld",
      "warnings": []
    },
    "error_code": null,
    "error_message": null
  }
  ```
  - `result` is present only on `COMPLETE`.
  - On `ERROR`, `error_code`/`error_message` populated; `result` is null.
- **Error**
  - 404 if job_id not found (e.g., expired/typo)

### 3) Existing synchronous preview (optional)
- **POST** `/recipes/parse-url`
- Blocks until parse completes; same `ParseUrlResponse` shape.
- Prefer async flow for mobile to avoid timeouts; keep sync only for internal tools or if UI wants immediate fallback.

## Models

### ParsedRecipe (from server)
```json
{
  "title": "string",
  "description": "string|null",
  "source_url": "string|null",
  "image_url": "string|null",
  "tags": ["string"],
  "servings": number|null,
  "estimated_time_minutes": number|null,
  "ingredients": [
    {
      "text": "ingredient name only",
      "quantity_display": "string|null",   // normalized fractions: e.g., "1/2"
      "unit": "string|null"                // only recognized units (cup, tsp, g, etc.)
    }
  ],
  "steps": ["string"],
  "notes": ["string"]
}
```

### ParseResult (inside `result`)
```json
{
  "success": true|false,
  "recipe": ParsedRecipe|null,
  "used_llm": boolean,
  "parser_strategy": "schema_org_json_ld" | "microdata" | "heuristic" | "llm_fallback",
  "warnings": ["string"],
  "error_code": "string|null",
  "error_message": "string|null"
}
```

### Job status
```json
{
  "id": "uuid",
  "status": "PENDING" | "RUNNING" | "COMPLETE" | "ERROR",
  "result": ParseResult|null,
  "error_code": "string|null",
  "error_message": "string|null"
}
```

## Client flow (recommended)
1. POST `/recipes/parse-url/async` with URL and `use_llm_fallback:true`.
2. Start polling `/recipes/parse-url/status/{job_id}` every 2–3s.
3. While `status` in {PENDING, RUNNING}: show loading.
4. On `COMPLETE`:
   - Use `result.recipe` to render preview.
   - Surface `warnings` (e.g., “LLM fallback used; please verify ingredients.”).
   - Optionally show `parser_strategy`.
   - Provide “Save” action that calls existing `POST /recipes` with mapped payload if desired.
5. On `ERROR`:
   - Display `error_code`/`error_message`.
   - Offer retry (re-enqueue) and/or manual edit.

## Error codes (common)
- `invalid_url` — URL format/blocked host
- `fetch_failed` — network/HTTP issues fetching the page
- `parse_failed` — all deterministic strategies failed and LLM disabled
- `llm_failed` — LLM call failed or invalid JSON
- `llm_timeout` — LLM call exceeded timeout
- `save_failed` — (sync path only) DB save failed

## Timeouts & retries (server)
- LLM call timeout ~90s in worker; retries up to `LLM_RECIPE_QUEUE_MAX_RETRIES` for transient errors (`llm_timeout`, `llm_failed`, `fetch_failed`).
- Queue worker polls every ~5s; jobs are processed in background.

## UX notes
- Expect some jobs to take ~20–90s when LLM fallback is needed; keep polling UI responsive.
- Show parser strategy and warnings for user trust.
- Keep URL input validated client-side; still rely on server validation.
- If no image is returned, allow user to attach one before saving.

## Env (for reference)
- `LLM_BASE_URL`, `LLM_RECIPE_MODEL`, `LLM_API_KEY` (server side)
- `LLM_RECIPE_QUEUE_MAX_RETRIES` controls background retries


## UI flows & screens

These flows describe how the mobile client should integrate URL-based parsing into the existing “Add Recipe” experience.

### 1. Add Recipe entry point

When the user taps **“Add Recipe”**, the app should show a simple **mode selection** (Option A, to keep things extensible):

- Navigate to a new **“Add Recipe”** screen (or modal) with options such as:
  - **Add manually**
  - **Add from URL**
- The layout should leave obvious room for future methods, e.g.:
  - `Add from photo`
  - `Add from social video`

For now, only **Add manually** and **Add from URL** need to be wired up.

### 2. Add from URL screen

When the user taps **“Add from URL”**:

- Navigate to a dedicated **“Add from URL”** screen.
- UI elements:
  - Single text input for the recipe URL.
  - Primary button: **“Import recipe”**.
- Behavior:
  - On first press:
    - Validate the URL format client-side (basic `https?://` check).
    - **Disable the button** immediately to prevent duplicate submissions while the request is in flight.
  - Call `POST /recipes/parse-url/async` with:
    - `url`: the entered URL.
    - `use_llm_fallback: true`.
  - If the request succeeds and returns a job:
    - Store `job_id` and transition to the **Parsing status** screen/state.
  - If the request fails (network/422/etc.):
    - Re-enable the button.
    - Show an inline error (and keep the user on this screen so they can correct the URL or retry).

### 3. Parsing status screen/state

This screen is driven by polling `GET /recipes/parse-url/status/{job_id}` every 2–3 seconds.

UI elements:

- A spinner/pinwheel.
- A status message that changes based on `status`:
  - When `status === "PENDING"`:
    - Show spinner and a message like:  
      **“Your recipe is in the queue and waiting to be processed…”**
  - When `status === "RUNNING"`:
    - Show spinner and a message like:  
      **“Your recipe is actively being processed…”**
- A visible **“Cancel”** / **“Back”** action:
  - Tapping this:
    - Stops polling.
    - Navigates the user back (e.g. to the Add Recipe selection screen or recipe list).
    - The underlying job remains on the server; it is **not** automatically deleted.

### 4. Handling COMPLETE and ERROR

When polling returns `status === "COMPLETE"`:

- If `result.success === false`:
  - Show an error view with:
    - A friendly, generic failure message.
    - Optionally, `result.error_code` / `result.error_message` for more detail.
  - Provide actions:
    - **“Try again”**: allows re-enqueueing with the same or edited URL.
    - **“Add manually instead”**: navigates to the manual Create Recipe screen with an empty form (or prefilled title/URL if available).

- If `result.success === true` and `result.recipe` is present:
  - Immediately navigate to the existing **manual Create Recipe screen**, but:
    - Pre-populate all fields from `result.recipe`:
      - Title, description, source_url, tags, servings, estimated time, ingredients, steps, notes, etc.
    - Display any `warnings` (e.g. **“LLM fallback used; please verify ingredients.”**) as a small banner or inline notice at the top of the screen.
  - From this point on, the user is in the normal manual-edit flow and can review/edit and then save using the existing `POST /recipes` flow.

### 5. Client-side state model

The URL-import flow on the client can be modeled as a simple state machine:

- `IDLE` — User is on the URL input screen, no job yet.
- `QUEUED` — Client successfully called `POST /recipes/parse-url/async` and has a `job_id`.
- `PENDING` — Server status is `PENDING`; show spinner + “in queue” message.
- `RUNNING` — Server status is `RUNNING`; show spinner + “actively being processed” message.
- `COMPLETE_SUCCESS` — Server status is `COMPLETE` and `result.success === true`; navigate to pre-populated manual entry screen.
- `COMPLETE_ERROR` — Server status is `COMPLETE` and `result.success === false`; show error view with retry/manual options.
- `CANCELLED` — User tapped Cancel/Back on the status screen; stop polling and navigate away.

Implementation detail:

- The client does **not** need to tell the server that the user cancelled viewing the status; it simply stops polling. (Extended status handling is covered below.)

### 6. Copy and UX tone

- The exact wording for the messages can be adjusted later for tone, but the semantic meaning should remain:
  - `PENDING` = waiting in queue.
  - `RUNNING` = actively being processed.
- The flow should feel lightweight:
  - One URL input.
  - One primary “Import recipe” button.
  - Clear feedback while waiting.
  - Smooth handoff into manual editing once parsing succeeds.


## Long-running jobs, mailbox, and extended statuses (COMMITTED / ABANDONED / CANCELED)

To better handle long-running jobs and the case where users navigate away while a parse is still in progress, the client can integrate with extended job statuses exposed by the server.

> Note: This section describes **desired behavior**; the server must support these statuses and a way to query outstanding jobs for the current user.

### 1. Extended status values

In addition to the core statuses (`PENDING`, `RUNNING`, `COMPLETE`, `ERROR`), the server may expose:

- `CANCELED` — The parse job was explicitly canceled at the server level.
- `COMMITTED` — The user has used the parsed recipe to create/save a recipe in the system.
- `ABANDONED` — The job completed, but the user chose to discard the result (or explicitly marked it as abandoned from the UI).

From the client’s perspective:

- `COMPLETE` + `result.success === true` = “ready to review and possibly commit.”
- Transition to `COMMITTED` or `ABANDONED` happens after some explicit user action (e.g. Save or “Never mind”).

### 2. Mailbox / notifications affordance

To avoid losing results when the user navigates away from the status screen:

- Add a small **“inbox”/“mailbox” icon** in the top-right of the main recipes screen (or in a global app bar).
- This mailbox represents **parse jobs and other background tasks** that have finished and are awaiting user action.

Expected behavior:

- If a user leaves the status screen while a job is `PENDING` or `RUNNING`, the job continues server-side.
- When the user later opens the app or visits the recipes list, the client can:
  - Query an endpoint such as `/recipes/parse-url/jobs` (or reuse existing status endpoints) to find outstanding `COMPLETE` jobs that have not yet been marked `COMMITTED` or `ABANDONED`.
  - Surface a small badge on the mailbox icon (e.g. “1”) when there are pending results to review.

### 3. Mailbox UI flow

When the user taps the mailbox icon:

- Show a list of pending parse jobs (e.g. those in `COMPLETE` state with `result.success === true` and not yet committed/abandoned):
  - For each job, display:
    - Recipe title (from `result.recipe.title`, if available).
    - Source URL (shortened/host-only).
    - Parser strategy / warnings if useful (optional).

- Tapping a job entry:
  - Takes the user to the same **pre-populated manual Create Recipe screen** used in the normal COMPLETE_SUCCESS flow.
  - From there, the user can:
    - Edit and **Save** — which should mark the job as `COMMITTED` server-side (if supported).
    - Tap a **“Never mind”** / “Discard” action — which should mark the job as `ABANDONED` server-side.

### 4. Client behavior for extended statuses

Assuming the server exposes extended statuses on the job status endpoint:

- `CANCELED`:
  - If the client explicitly sends a cancel request in the future, it should expect `status: "CANCELED"` and treat it similarly to an error (no result to consume).
- `COMMITTED`:
  - Jobs marked COMMITTED should typically **not** show in the mailbox/inbox UI (they are done and already represented by real recipes).
- `ABANDONED`:
  - Jobs marked ABANDONED are intentionally discarded; the client should not surface them again unless there is a specific “history” view.

For now, the client does not need to implement the server calls to flip a job into `COMMITTED`/`ABANDONED`—but the UI and PRD are written to anticipate those actions so they can be wired up later without redesigning the flow.

### 5. Button disabling and duplicate submissions

- The `Import recipe` button should be disabled:
  - Immediately on press, before firing any async calls.
  - While the async request to enqueue the job is in flight.
- It should be re-enabled if:
  - The enqueue call fails (so the user can correct the URL or retry).
- Once a job is successfully enqueued and the app transitions into the status/polling flow, the user should **not** be able to enqueue another job for the same URL from that same screen instance (they can always navigate back and start fresh).

This prevents accidental duplicate jobs and makes the UX feel more deliberate and predictable.
