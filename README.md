# Monthly Vlog

Turns a month of photos/videos (shot on an Insta360 Go Ultra + regular
photos, exported into a Dropbox folder) into an auto-edited monthly vlog
with burned-in captions. Runs entirely locally — no cloud services, no
hosting costs.

## Status

**Step 1:** Next.js scaffold + Dropbox OAuth, proven by listing the files
in your configured Dropbox folder.

**Step 2:** Monthly Review screen at `/review` — grid of thumbnails for
the selected month, inline captions, include/exclude checkboxes, and
drag-to-reorder, all persisted to the local SQLite `media_items` table.

**Step 3 (this commit):** "Generate Video" on the Review screen actually
renders. Requires `ffmpeg`/`ffprobe` on your `PATH`. Clicking it downloads
every included item from Dropbox, turns each photo into a slow Ken Burns
pan/zoom clip and each video into a muted full-length clip, burns in a
bottom-bar caption where one is set, crossfades everything together, and
writes an mp4 under `./data/renders/`. The screen polls for progress and
shows a preview + download link when it's done. No background music or
trimming yet — that's a later step if wanted.

## One-time setup: create a Dropbox app

1. Go to the [Dropbox App Console](https://www.dropbox.com/developers/apps)
   and click **Create app**.
2. Choose:
   - **Scoped access**
   - **App folder** or **Full Dropbox** access (Full Dropbox is simplest if
     your export folder already exists elsewhere in your Dropbox; App
     folder is more locked-down but Dropbox will create a dedicated
     `Apps/<your-app-name>` folder for it).
3. Name the app anything, e.g. `monthly-vlog-app`.
4. On the app's **Settings** tab:
   - Under **OAuth 2** → **Redirect URIs**, add:
     `http://localhost:3000/api/auth/dropbox/callback`
   - Note the **App key** and **App secret**.
5. On the app's **Permissions** tab, enable:
   - `files.metadata.read`
   - `files.content.read`
   - Click **Submit** to save permissions.

## Local setup

Requires `ffmpeg` and `ffprobe` on your `PATH` (used to render the video —
`brew install ffmpeg` on macOS, `apt install ffmpeg` on Debian/Ubuntu).

```bash
npm install
cp .env.local.example .env.local
```

Edit `.env.local`:

- `DROPBOX_APP_KEY` / `DROPBOX_APP_SECRET` — from the app you just created.
- `DROPBOX_REDIRECT_URI` — leave as the default unless you changed the port.
- `DROPBOX_FOLDER_PATH` — the Dropbox path your Insta360 exports + photos
  land in (e.g. `/Camera Uploads/Vlog`). Leave blank to use the whole
  Dropbox / app folder root.
- `DATABASE_PATH` — leave as default; the SQLite file is created
  automatically under `./data/`.

Then run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000):

1. Click **Connect Dropbox** and authorize the app.
2. You'll be redirected back and shown a **✓ Connected** status.
3. Click **List files** to confirm the app can see files in your
   configured folder, then click **Go to Monthly Review**.

Tokens (including the refresh token) are stored in the local SQLite DB, so
you only need to re-connect if you revoke access in Dropbox.

## Monthly Review (`/review`)

- Pick a month with the month picker at the top.
- Every photo/video in your configured folder whose Dropbox timestamp
  falls in that month shows up as a card, sorted chronologically.
- Type a caption under any item — it saves when you click away from the
  field.
- Uncheck "Include in video" to leave an item out of the render.
- Drag a card onto another to reorder — the new order saves immediately.
- "Generate Video" downloads the included items, renders, and shows a
  preview + download link when done (see Step 3 above).

Only image/video files with a recognized extension are shown (jpg, jpeg,
png, heic, heif, tif, tiff, gif, webp, mp4, mov, m4v, avi, mkv, webm).

## Data model

`dropbox_tokens` — one row per user, holds the OAuth access/refresh token
pair (`user_id` is included now so a second person can be added later
without a schema change).

`media_items` — one row per Dropbox file the review screen has seen
(`dropbox_file_id`, `user_id`, `month`, `caption`, `sort_order`,
`include`, `created_at`). Captions/order/include are edited here; name,
thumbnail, and timestamp are always read fresh from Dropbox so renames
show up automatically.

`render_jobs` — one row per "Generate Video" click (`user_id`, `month`,
`status`, `progress`, `output_path`, `error`). The Review screen polls
`GET /api/render/[id]` while a job is `queued`/`downloading`/`rendering`.
