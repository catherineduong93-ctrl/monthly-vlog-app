# Monthly Vlog

Turns a month of photos/videos (shot on an Insta360 Go Ultra + regular
photos, exported into a Dropbox folder) into an auto-edited monthly vlog
with burned-in captions. Runs entirely locally — no cloud services, no
hosting costs.

## Status

**Step 1 (this commit):** Next.js scaffold + Dropbox OAuth, proven by
listing the files in your configured Dropbox folder. No SQLite-backed
review UI or video rendering yet — that's steps 2-5.

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
   configured folder.

Tokens (including the refresh token) are stored in the local SQLite DB, so
you only need to re-connect if you revoke access in Dropbox.

## Data model

`dropbox_tokens` — one row per user, holds the OAuth access/refresh token
pair (`user_id` is included now so a second person can be added later
without a schema change).

The `media_items` table (`dropbox_file_id`, `user_id`, `month`, `caption`,
`sort_order`, `include`, `created_at`) lands in step 2 with the Monthly
Review screen.
