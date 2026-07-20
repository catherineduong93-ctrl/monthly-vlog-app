function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". Copy .env.local.example to .env.local and fill it in.`
    );
  }
  return value;
}

export const config = {
  dropbox: {
    appKey: () => requireEnv("DROPBOX_APP_KEY"),
    appSecret: () => requireEnv("DROPBOX_APP_SECRET"),
    redirectUri: () =>
      process.env.DROPBOX_REDIRECT_URI ??
      "http://localhost:3000/api/auth/dropbox/callback",
    folderPath: () => {
      // Dropbox API wants "" for the root, or a path starting with "/" (no trailing slash).
      const raw = process.env.DROPBOX_FOLDER_PATH ?? "";
      if (raw === "" || raw === "/") return "";
      return raw.replace(/\/+$/, "");
    },
    // Optional: a separate Dropbox folder to pick background music tracks
    // from. Unset/blank disables the music picker entirely (returns null,
    // unlike folderPath where blank means "the whole Dropbox root").
    musicFolderPath: (): string | null => {
      const raw = process.env.DROPBOX_MUSIC_FOLDER_PATH ?? "";
      if (raw === "") return null;
      if (raw === "/") return "";
      return raw.replace(/\/+$/, "");
    },
  },
  db: {
    path: () => process.env.DATABASE_PATH ?? "./data/app.db",
  },
  // Single-user for now; every table keeps a user_id column so a second
  // person can be added later without a schema change.
  defaultUserId: 1,
};
