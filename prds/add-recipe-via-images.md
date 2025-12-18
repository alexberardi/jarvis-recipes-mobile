# PRD: Mobile — Add Recipe via Images (React Native)

## Overview

Add a mobile feature that lets a user create a recipe by uploading **1–8 images** (camera photos or photo library selections).

Image extraction is performed asynchronously using the existing **mailbox / job polling** system. The mobile app submits an ingestion job, polls the mailbox for completion, and opens the existing recipe create/edit screen pre-filled with the parsed recipe draft.

---

## Goals

1. Allow users to select or capture **multiple images** (up to 8).
2. Upload images reliably with a clear progress + cancel affordance.
3. Show a "Review Recipe" form pre-filled from the server’s extracted result.
4. Allow users to edit before saving.
5. Handle slow vision processing (timeouts can be long; show a friendly processing UI).

---

## Non-goals

- Implementing OCR/vision on-device.
- Complex queueing/background upload on iOS/Android for v1.
- Multi-user/household sharing flows (handled in separate PRD).

---

## User Stories

1. As a user, I can take multiple photos of a recipe (front/back/pages) and import it.
2. As a user, I can watch upload + processing progress, and cancel if needed.
3. As a user, I can correct ingredients/steps before saving.

---

## UX Flow

### Entry points

- Primary: “Add Recipe” screen
  - Buttons shown together:
    - Add Manually
    - Add by URL
    - Add from Images

The "Add from Images" button should appear alongside the existing add-manual and add-by-URL options on the same screen (no separate entry surface).

### Screens

1) **Select Images**
- Options:
  - **Take Photo** (camera)
  - **Choose from Library** (multi-select)
- Shows a grid preview of selected images
- Actions:
  - Remove image
  - Reorder images (drag handle)
  - Add more (until limit)
- Validation:
  - Max 8 images
  - Show inline error if user tries to add 9+
- Primary CTA: **Extract Recipe**

2) **Uploading / Processing**
- Phase 1: Upload
  - Show upload progress bar (0–100%)
- Phase 2: Processing
  - Show “Processing images…” state (indeterminate spinner)
  - App polls mailbox for job completion

Copy example:
- “Uploading 3 images…”
- “Extracting recipe (this may take a few minutes)…”

Cancel:
- “Cancel” returns to Select Images
- If cancel during upload, abort request
- If cancel during processing, stop polling (job continues server-side)

3) **Review Recipe**
- Pre-filled fields from server response:
  - Title
  - Description (optional)
  - Servings (optional)
  - Times (optional)
  - Ingredients list
  - Steps list
- Editable:
  - Title text input
  - Ingredients: editable rows + add/remove
  - Steps: editable rows + add/remove
- Primary CTA: **Save Recipe**
- Secondary: **Back** (returns to Select Images with chosen images retained)

4) **Result**
- On success:
  - Navigate to Recipe Detail
- On failure:
  - Show error state + retry

---

## API Integration

### Submit image ingestion job

- `POST /recipes/from-image/jobs`
- `multipart/form-data`
  - `images`: repeated file field (1–8)
  - optional: `title_hint`
  - optional: `tier_max` (default 3)

Response:
- `202 Accepted`
- No recipe data is returned synchronously

### Mailbox polling

- Client polls existing mailbox endpoint
- On success message (`recipe_image_ingestion_completed`):
  - Open existing recipe create/edit screen
  - Pre-fill fields from `recipe_draft`

- On failure message (`recipe_image_ingestion_failed`):
  - Show error UI with retry option

---

## Timeouts

- Upload requests should use standard network timeouts.
- Processing time is decoupled from HTTP via mailbox polling.
- UI must tolerate long-running background processing without timing out.

---

## Data Handling

### Image preparation

- Preserve original images; do not resize for v1 unless upload sizes become problematic.
- Ensure correct file metadata (name + MIME type).
- Maintain **upload order** as the page order.

### Draft storage

- Store `recipe_draft` in screen state while editing.
- Do not persist draft locally for v1.

---

## Error UX

- If user exceeds 8 images: inline validation (“Max 8 images”).
- If upload fails (network): show retry.
- If extraction fails (422):
  - Show message: “Couldn’t read enough text from these images.”
  - Suggest: retake clearer photos, better lighting, closer crop.
- If llm-proxy unavailable (502):
  - Suggest retry later.

---

## Component / Module Plan

### New screens

- `AddRecipeImagesScreen` (select + reorder + preview)
- `RecipeExtractionProgressScreen` (uploading/processing)
- `ReviewExtractedRecipeScreen` (edit draft)

### Shared components

- `ImageGridPicker`
- `IngredientListEditor`
- `StepsListEditor`

### Services

- `recipeIngestionApi.ts`
  - `extractRecipeFromImages(files, { titleHint, tierMax })`
  - Implements multipart upload + long timeout

---

## Acceptance Criteria

1. User can upload 1–8 images.
2. User can reorder images prior to extraction.
3. Extraction job is submitted and processed asynchronously via mailbox.
4. On mailbox success, the recipe create/edit screen opens pre-filled.
5. Upload progress and processing UI are shown.
6. Errors map to clear user-friendly messages.

---

## Open Questions

1. Do we want to expose pipeline metadata in the UI (selected tier, etc.)?
   - Default: no (developer-only logs).
2. Image resizing/compression policy:
   - v1: upload originals; revisit if upload sizes are too large.
