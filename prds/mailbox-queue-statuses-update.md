# Mailbox & Queue Statuses — Client Integration PRD

This PRD describes how the `jarvis-recipes-mobile` app should integrate with the extended recipe-parse queue behavior introduced on the server:

- Mailbox-style listing of completed parse jobs
- Local "seen" tracking
- Badge count on a bell/mailbox icon
- Deep-linking from mailbox items into the manual Create Recipe screen
- Including `parse_job_id` when saving a recipe derived from a parsed job

The server behavior and endpoints are defined in `jarvis-recipes-server/PRDs/recipe-queue-new-statuses.md`.

---

## 1. Goals

1. Give users a way to **recover completed parse jobs** when they navigated away from the status screen (e.g., app closed, phone died, etc.).
2. Provide a simple **mailbox UI** for "recipe import notifications" that are ready for review.
3. Visually indicate that there are unseen items via a **badge** on a bell/mailbox icon.
4. Ensure that when a parsed result is actually used to create a recipe, the client includes the associated `parse_job_id` so the server can mark it `COMMITTED`.

---

## 2. Mailbox entry point (bell icon)

### 2.1 Placement

- On the main **home/recipes list screen**, add a bell or mailbox icon in the top-right of the header/app bar.
- This icon is always visible whenever the user is on the home screen (and authenticated).

### 2.2 Badge behavior

- The icon should show a small badge with an integer count when there are **unseen** mailbox items.
  - Example: a small circle or pill in the top-right of the icon with the number of unseen items ("1", "2", etc.).
  - If there are zero unseen items, no badge is displayed.
- "Unseen" is a **client-only concept**, not persisted server-side:
  - The app keeps a local set/map of `seen_job_ids` in storage (e.g., AsyncStorage or similar) keyed by job ID.
  - When new jobs are fetched from the server, any job whose `id` is not in `seen_job_ids` is considered unseen.
  - The badge count is `(# of jobs) - (# of jobs whose id is in seen_job_ids)`.

### 2.3 Tapping the icon

- Tapping the bell/mailbox icon navigates to a **Mailbox screen** (see below) that lists the user's completed parse jobs.

---

## 3. Mailbox screen (job listing)

### 3.1 Data source

- On screen focus/enter, the client should call:
  - `GET /recipes/parse-url/jobs`
- This endpoint returns **recent completed jobs** for the current user, as defined in the server PRD:
  - By default, these are jobs with `status == COMPLETE` and `completed_at` within the configured "abandon timeout" window.

### 3.2 Response shape (reference)

For reference, the response will look roughly like:

```jsonc
{
  "jobs": [
    {
      "id": "uuid-job-id",
      "job_type": "url",
      "url": "https://example.com/recipe",
      "status": "COMPLETE",
      "completed_at": "2025-12-09T12:34:56Z",
      "warnings": ["LLM fallback used; please verify ingredients."],
      "preview": {
        "title": "Short Title from result_json.recipe.title",
        "source_host": "example.com"
      }
    }
  ]
}
```

### 3.3 UI layout

- The Mailbox screen should present the jobs in a simple **list view** (FlatList or equivalent):
  - Each row shows at least:
    - `preview.title` (or a fallback like the URL host if title is missing).
    - `preview.source_host`.
    - Completed timestamp (human-friendly, e.g. `"Completed 2h ago"`).
    - An indicator if the item is unseen (e.g., bold title or a small dot icon).
- If there are **no jobs**:
  - Show a friendly empty state, e.g.:
    - "No imported recipes are waiting right now. Try adding a recipe from a URL to see it here."
- The list should support **pull-to-refresh**:
  - Dragging down on the list triggers a fresh `GET /recipes/parse-url/jobs` call.
  - While refreshing, show a standard loading indicator in the list header.

### 3.4 Local "seen" tracking

- The client tracks which job IDs have been "seen" by the user in a local store, e.g.:

  ```ts
  type SeenJobMap = { [jobId: string]: true };
  ```

- A job is considered **seen** when either:
  1. The user taps on that job row (to open manual entry), or
  2. The user taps a **"Mark all as seen"** button (see below).

- When a job becomes seen:
  - Add its `id` to `seen_job_ids` in memory and persist to local storage.
  - Update the Mailbox list UI and the badge count on the bell icon accordingly.

### 3.5 "Mark all as seen" button

- The Mailbox screen should include a small button (e.g. top-right or at the top of the list) labeled **"Mark all as seen"**.
- Behavior:
  - When tapped:
    - Add all currently loaded `job.id`s to `seen_job_ids`.
    - Persist the updated map to local storage.
    - Clear the badge on the bell icon (until new unseen jobs appear).
- This action is entirely **client-side** and does not call any server endpoint.

---

## 4. Navigating from mailbox → manual entry

When the user taps a mailbox list item:

1. Mark that job as **seen** locally:
   - Immediately update `seen_job_ids` and persist it.
   - Update list UI (e.g., remove unseen dot / bold) and badge count.

2. Fetch full job result if needed:
   - The mailbox listing returns only a preview; we still need the full parsed recipe payload.
   - Call `GET /recipes/parse-url/status/{job_id}` to retrieve the full `result` object.
   - Verify that:
     - `status === "COMPLETE"` and
     - `result.success === true` and
     - `result.recipe` is present.
   - If not, show an error state (e.g., "This job is no longer available") and keep the user on the mailbox screen.

3. Navigate to the **manual Create Recipe screen**:
   - Pre-populate all the relevant fields from `result.recipe` (same as the existing "URL import" flow):
     - Title, description, source URL, tags, servings, estimated time, ingredients, steps, notes, etc.
   - Pass along the `job_id` (e.g. via navigation params or state) so the Create Recipe screen knows that this recipe originates from a parse job.

4. Show warnings, if any:
   - If `warnings` from the status response are non-empty, display a small banner at the top of the Create Recipe screen, e.g.:
     - "Imported from URL. LLM fallback was used; please verify ingredients and steps before saving."

From this point onward, the flow is identical to editing a manually created recipe draft, except we also want to propagate the `parse_job_id` on save (see next section).

---

## 5. Including parse_job_id when saving

To support the server marking jobs as `COMMITTED`, the mobile app needs to include `parse_job_id` when a user saves a recipe derived from a parsed job.

### 5.1 Client behavior

- Extend the client-side **Create Recipe** form logic to accept an optional `parse_job_id`.
- When the user enters the Create Recipe screen via:
  - URL import status completion, or
  - Mailbox item tap

  the navigation should provide:

  ```ts
  {
    parse_job_id: string | undefined,
    // ... other params
  }
  ```

- When the user taps **Save**:
  - If `parse_job_id` is present, include it in the POST body:
    
    ```jsonc
    {
      "title": "...",
      "description": "...",
      // other existing fields
      "parse_job_id": "uuid-job-id"
    }
    ```

  - If `parse_job_id` is not present, omit the field entirely (behaves as a normal manual recipe creation).

### 5.2 Post-save behavior

- On successful save, the server will mark the job as `COMMITTED`.
- The client should **optimistically** treat that job as "no longer pending" in the mailbox context:
  - You may:
    - Remove it from any in-memory mailbox list (if present), or
    - Allow it to naturally disappear the next time the Mailbox screen fetches jobs (because the server will not return COMMITTED jobs in the default `/jobs` listing).

- The "seen" map can still contain the job ID; there is no harm in keeping it there.

---

## 6. Sync behavior and refresh strategy

### 6.1 When to fetch mailbox jobs

- Fetch mailbox jobs when:
  - The Mailbox screen gains focus (e.g., using React Navigation focus events), and
  - Optionally, when the app is resumed from background and the home screen is visible.

- For now, a simple strategy is enough:
  - When the user taps the bell icon → navigate to Mailbox screen → fetch jobs.
  - The user can also pull to refresh the list manually at any time.

### 6.2 Handling stale items

- The server’s cleanup job will eventually mark old COMPLETE jobs as ABANDONED and stop returning them in `/recipes/parse-url/jobs`.
- The client does not need special handling for this beyond:
  - If a previously visible job disappears on refresh, just accept that it has expired.
  - If the user tries to open a job via status endpoint and it is no longer COMPLETE/successful, show an error and send them back to the mailbox list.

---

## 7. Error states & edge cases

- **Mailbox fetch fails (network/server error):**
  - Show a simple error message on the Mailbox screen and an option to retry.
- **Status fetch for a job fails or returns non-COMPLETE / non-success:**
  - Show an error like: "This imported recipe is no longer available."
  - Do not navigate to the Create Recipe screen in this case.
- **User not authenticated / token expired:**
  - Follow whatever global auth logic the app already uses (e.g., redirect to login, token refresh, etc.).

---

## 8. Implementation order

Suggested implementation steps:

1. **Add bell/mailbox icon** to the home screen header and wire up navigation to a new Mailbox screen.
2. **Implement Mailbox screen** with:
   - Fetch of `GET /recipes/parse-url/jobs` on focus.
   - List view rendering based on the response.
   - Empty state.
3. **Add local seen tracking**:
   - Maintain `seen_job_ids` in memory + persisted storage.
   - Compute badge count from unseen jobs.
   - Add "Mark all as seen" button.
4. **Implement navigation from Mailbox item → Create Recipe**:
   - Fetch full status/result via `/status/{job_id}`.
   - Pre-populate Create Recipe form.
   - Pass `parse_job_id` through navigation params.
5. **Update Save behavior** to include `parse_job_id` when present.
6. Polish error handling and loading states.

This keeps the changes incremental while aligning strictly with the server-side behavior described in `recipe-queue-new-statuses.md` and the URL import client PRD.
