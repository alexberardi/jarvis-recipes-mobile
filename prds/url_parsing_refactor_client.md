# PRD: Unified Recipe Import (Client)

## Summary
The mobile app will support a unified recipe import experience across three inputs:
1) URL paste/import
2) WebView-assisted extraction (for sites that block server fetch)
3) Image-based import (camera/gallery/screenshots)

The client’s responsibility is to collect user input, present a consistent UX, and submit ingestion jobs to the server. Parsing, normalization, and validation live on the server.

**Backwards compatibility is not required.** The client will target the new server contract defined in the server PRD.

## Implementation Decisions
This section locks in the client-side decisions needed to implement the refactor.

### 1) Endpoints
#### URL async
- **Submit:** `POST /recipes/parse-url/async` with body `{ "url": "..." }`
- **Poll:** `GET /recipes/jobs/{job_id}`

> Note: The server PRD allows refactoring, but the client PRD assumes these endpoints remain stable for the first implementation. If the server renames them, we will update the client accordingly.

#### WebView payload
- **Submit:** `POST /recipes/parse-payload/async`
- **Body (canonical):**
```json
{
  "source": { "type": "url", "source_url": "https://..." },
  "extraction": {
    "jsonld": ["<raw ld+json>", "..."],
    "html_snippet": "<optional>",
    "extracted_at": "<iso>",
    "client": { "platform": "ios|android", "app_version": "x.y.z" }
  }
}
```

Rules:
- Always send `source.type="url"` and `source.source_url`.
- Always send `extraction.jsonld` as an **array** (empty array allowed).
- Include `client` metadata when available.

#### Images
For v1, keep the existing image ingestion endpoint to avoid unnecessary churn:
- **Current (retain for v1):** `POST /recipes/from-image/jobs`

The unified import UI should still treat this as an “Image Import” path, but the networking layer may call the legacy image job endpoint until the server ships a unified `parse-images/async` or image support via `parse-payload/async`.

> Migration plan: once the server supports either `POST /recipes/parse-images/async` (multipart) or `parse-payload/async` with `source_type=image_upload`, we will switch the client implementation to match.


### 2) Feature Flag
- Flag name: `enableUnifiedImport`
- Type: boolean
- Default: **false** for the first release (internal testing), then flipped to true once validated.
- Scope:
  - Gate **all entry points** (Add Recipe button + Share sheet) behind the flag.
  - When disabled, the app uses the current URL/image flows unchanged.

### 2a) Implementation clarifications
#### 1) Feature flag location / default
- Store `enableUnifiedImport` in `src/config/env.ts`.
- Default behavior when missing/undefined: **false** (treat missing as disabled).
- v1: **static/local** toggle only (no remote config). If a remote toggle is introduced later, it should override the local default.

#### 2) Share sheet entry & routing
- If share-intent handlers already exist, route them into the unified import flow rather than duplicating logic.
- If they do not exist, add handlers for:
  - shared text/URL
  - shared images (one or many)
- Unified flow should accept a single normalized navigation payload:
```ts
type ImportEntryPayload =
  | { importType: 'url'; url: string; source: 'share' | 'in_app' }
  | { importType: 'images'; imageUris: string[]; source: 'share' | 'in_app' };
```
- Share handlers should construct `ImportEntryPayload` and navigate to the unified import screen with it.

#### 3) HTML snippet cap
- Enforce a client-side cap of **300 KB** for `html_snippet` (bytes, UTF-8).
- If extraction produces larger content:
  - trim further, or
  - omit `html_snippet` and rely on JSON-LD/Retry.
- This is intentionally below the server cap to avoid request failures.

#### 4) Polling timeout / backoff
- Use backoff: 1s → 2s → 3s (cap at 3s).
- Total timeout: **90 seconds**.
- 90s is acceptable for slower LLM/OCR paths while still feeling bounded.

#### 5) Telemetry sink
- If an analytics provider already exists in the app, wire events into it.
- Otherwise, implement a lightweight `telemetry` module:
  - dev: `console.log` events
  - prod: no-op by default
- Keep the event names/fields exactly as specified in `### 5) Analytics / telemetry`.

#### 6) Image preprocessing details
- Downscale to max edge **2048px** and strip EXIF client-side.
- Library choice:
  - If the app uses Expo: `expo-image-manipulator` is acceptable.
  - If non-Expo: use an equivalent RN-native image resize library.
- Output format:
  - Default to **JPEG** (quality ~0.85) for photos/scans to reduce size.
  - Preserve PNG only if the source is PNG and transparency is required (rare for recipe photos).
- Preserve image order after preprocessing.

### 3) WebView extraction specifics
- Implement an in-app WebView with minimal chrome:
  - Back, Close, Refresh
  - **Import** button (manual re-run)
- Extraction behavior:
  - Attempt auto-extract on `onLoadEnd`.
  - If JSON-LD is empty, wait 300–800ms and retry once.
  - If still empty, rely on the user to accept consent/scroll and tap **Import**.

#### Extraction failure messaging
- If extraction runs (auto or manual) and no usable JSON-LD or HTML snippet can be produced, the client should surface a simple, user-facing error:
  - Message: **“Unable to parse this page.”**
  - Subtext: “This site doesn’t expose recipe data in a readable format.”
- Provide actions:
  - Retry extraction
  - Open in external browser
  - Cancel import

HTML snippet fallback:
- Yes, include `html_snippet` **only when** `jsonld` is empty or clearly not a Recipe.
- The snippet must be trimmed and capped client-side (size cap aligned with server limits).

### 4) Backgrounding / persistence
- v1 requirement: persist the active `job_id` and minimal context to `AsyncStorage` so polling can resume after app background/kill.
- Persist:
  - `job_id`
  - `job_type` (url | webview | image)
  - `source_url` (if present)
  - `started_at`
- On app resume:
  - If an active job exists and is not terminal, resume polling.
  - If the job is terminal, clear stored state.

### 5) Analytics / telemetry
- v1 requirement: add a lightweight client logger abstraction if one does not already exist.
- Events to record (no raw HTML/JSON-LD/images):
  - `recipe_import_started` (import_type, domain)
  - `recipe_import_fallback_webview_shown` (domain, reason)
  - `recipe_import_completed` (import_type, domain, used_webview, time_to_draft)
  - `recipe_import_failed` (import_type, domain, error_code, next_action_reason)

Implementation notes:
- If the app already has an analytics provider, wire into it.
- Otherwise, create a stub that logs to console in dev and can be wired later.

---

## Goals
- Single, consistent “Add Recipe” import workflow.
- URL imports work when server fetch is allowed.
- When blocked (e.g., 403 / `blocked_by_site`), seamlessly switch to WebView-assisted import.
- Image import supports multi-image capture/selection and preserves order.
- Deterministic automated tests that do not depend on live third-party sites.

## Non-Goals
- Guaranteeing imports for every website.
- Reverse-engineering anti-bot protections.
- Client-side LLM parsing or client-side normalization rules.

---

## User Stories
- As a user, I can paste a recipe URL and get a populated draft.
- As a user, if a site blocks automated access, I can import via an in-app browser.
- As a user, I can take pictures of a recipe (or screenshots) and import them into a draft.
- As a user, I can review/edit the draft before saving.

---

## UX: Entry Points
### Add Recipe
Entry points (must all land on the same workflow):
- “Add Recipe” button
- “Share → Jarvis Recipes” (URL share)
- “Share → Jarvis Recipes” (images)

### Step 1: Choose Import Type
Modal or screen:
- **From URL**
- **From Photos** (camera/gallery)

> If the user arrives via share sheet, skip this step and preselect type.

---

## URL Import Flow
### Happy path (server fetch works)
1) User submits URL.
2) Client calls `POST /recipes/parse-url/async` with `{ url }`.
3) Client polls `GET /recipes/jobs/{job_id}`.
4) On `COMPLETE`, open the recipe draft editor.

### Blocked path (WebView fallback)
If the job returns `status=ERROR` and includes:
- `error_code=fetch_failed`
- `next_action="webview_extract"`
- `next_action_reason="blocked_by_site"`

Then:
1) Show a friendly prompt:
   - Title: **“This site blocks automated import”**
   - Body: “Open the recipe in the in-app browser so we can import it.”
   - Buttons: **Continue**, Cancel
2) On Continue, open WebView to the URL.
3) After WebView load, run extraction JS to capture:
   - JSON-LD blocks (preferred)
   - Optional minimal HTML snippet (fallback)
4) Submit extracted payload to `POST /recipes/parse-payload/async`.
5) Poll job status.
6) On `COMPLETE`, open the draft editor.

### Error UX
- If URL validation fails: inline validation (“That URL doesn’t look valid”).
- If WebView extraction fails: show retry + “Open in external browser” option.
- If server returns `invalid_payload`: show “Import failed, please try again.” and capture diagnostics.

---

## WebView Extraction
### WebView requirements
- Must support user interaction (consent banners, scroll) — this is a first-class fallback, not hidden.
- Show minimal chrome:
  - back
  - close
  - refresh
  - optionally “Import” button (manual trigger) if auto-extraction is unreliable.

### Extraction timing
Preferred approach:
- Attempt extraction on `onLoadEnd`.
- If JSON-LD not found, wait a short delay (e.g., 300–800ms) and retry once.
- Provide a visible “Import” CTA to re-run extraction after user accepts consent.

### What to extract
1) **JSON-LD**
- Collect all `<script type="application/ld+json">` blocks.
- Store raw string content in an array.

2) **HTML snippet (optional, fallback)**
- Only if JSON-LD is absent or clearly incomplete.
- Extract a trimmed subtree:
  - Prefer `main`, `article`, or the largest text block container.
  - Hard cap size (client-side) before sending.

### Payload shape (client → server)
Send:
```json
{
  "source": { "type": "url", "source_url": "..." },
  "extraction": {
    "jsonld": ["..."],
    "html_snippet": "...",
    "extracted_at": "<iso>",
    "client": { "platform": "ios|android", "app_version": "x.y.z" }
  },
  "payload_hash": "<sha256 of jsonld + html_snippet>"
}
```

The client must enforce the `html_snippet` cap (300 KB UTF-8) before sending to avoid server rejection.

**Payload hashing**
- The client may include `payload_hash`, computed as a hash of the extracted JSON-LD and HTML snippet.
- This enables server-side deduplication and reuse of previously parsed recipes (e.g., instant parse if another user has imported the same content).
- The client does not need to know whether the server uses this optimization.

### Privacy
- Do not store extracted HTML/JSON-LD locally beyond the import session.
- Do not log raw HTML/JSON-LD in client logs.

---

## Image Import Flow
### Capture/Select
- Allow multiple images.
- Provide:
  - **Camera** (multi-shot)
  - **Photo library** (multi-select)

### Image preprocessing
- Downscale images client-side before upload:
  - Max longest edge: **2048px**
- Strip EXIF metadata prior to upload.
- Preserve original image order after preprocessing.

### Ordering
- Preserve order as selected/captured.
- Provide reorder UI (drag) before upload.

### Upload + parse
Two acceptable approaches:

**A) Direct upload to API (simplest)**
- Client submits `POST /recipes/parse-images/async` (if server supports) with multipart images + metadata.

**B) Upload to object storage then submit refs (preferred at scale)**
- Client requests upload URLs (presigned).
- Uploads images.
- Calls `POST /recipes/parse-payload/async` with `source_type=image_upload` and `images=[{object_url, content_type}]`.

> For v1, the client keeps using the existing legacy image ingestion endpoint `POST /recipes/from-image/jobs` to avoid churn. The unified import UI treats this as the “Image Import” path, but the networking layer calls the legacy endpoint until the server supports either `parse-images/async` or image support via `parse-payload/async`. Switching to these newer endpoints will be a later migration.

### UX states
- Show progress bar during upload.
- Show “Processing…” while polling job.
- On completion, open draft editor.

### Failure handling
- If image parsing fails:
  - If a partial draft is returned, open it with a warning banner.
  - Otherwise show:
    - Message: **“We couldn’t read this recipe clearly.”**
    - Subtext: “Try retaking photos or adding another image.”
- Never silently return the user to the Add Recipe screen.

---

## Draft Editor Entry
Once `recipe_draft` exists, client navigates to the same editor used by manual creation.
- Pre-fill fields.
- Show non-blocking warnings (e.g., “Some fields may be missing”).

---

## Networking & Job Polling
### Polling
- Poll interval: 1s → 2s → 3s (cap), with max overall timeout (e.g., 60–90s).
- Allow user to cancel.

### Resilience
The client will persist active job information (including `job_id`, `job_type`, `source_url`, and `started_at`) in AsyncStorage to support resuming polling after the app is backgrounded or killed. On app resume, if a job is still active and not terminal, polling will resume automatically; otherwise, stored job state will be cleared. See Implementation Decisions for details.

---

## Analytics & Telemetry
Track (no PII / no raw content):
- import_type: url | webview | image
- domain (for URL/webview)
- outcome: success | error
- error_code / next_action_reason
- time_to_draft

---

## Client Guardrails
The client must not:
- Attempt to parse, normalize, or infer recipe structure locally.
- Attempt to infer ingredient quantities, units, or timings.
- Retry server-side HTML fetches after `blocked_by_site` is returned.
- Persist or log raw HTML, JSON-LD, or image bytes beyond the active import session.

The client’s role is limited to:
- Collecting user input
- Extracting structured data when explicitly required (WebView fallback)
- Submitting ingestion jobs and rendering server results

---

## Test Plan
### Unit tests
- URL validator
- WebView extractor parser (pure functions where possible)
  - parse JSON-LD blocks from HTML strings

### Integration tests (deterministic)
- Use local fixture pages packaged with the app:
  - `fixtures/webview/recipe_with_jsonld.html`
  - `fixtures/webview/recipe_without_jsonld.html`
- WebView loads `file://` or local packager URL.
- Validate:
  - extraction returns expected JSON-LD array
  - payload submission called with correct shape

### E2E tests (Detox/Appium)
- Scenario: URL blocked → WebView fallback → extract fixture page → submit payload → open draft screen.
- Scenario: image import with 2 images (fixtures) → submit → open draft.

> Live-site tests are explicitly non-gating.

---

## Rollout
- Ship client changes behind a feature flag:
  - `enableUnifiedImport`
- Enable for internal testers first.
- Expand gradually.

---

## Open Questions
- Final server endpoints for image import (multipart vs presigned refs).
- Whether WebView extraction should auto-run or require user tap “Import” on first try.
- Whether to allow “Open in external browser” as a fallback step.

