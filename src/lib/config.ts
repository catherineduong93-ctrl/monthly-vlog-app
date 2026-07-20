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
  },
  db: {
    path: () => process.env.DATABASE_PATH ?? "./data/app.db",
  },
  music: {
    // Optional: one local royalty-free track to use as background music.
    // Unset disables music entirely.
    trackPath: (): string | null => process.env.MUSIC_TRACK_PATH || null,
  },
  // Single-user for now; every table keeps a user_id column so a second
  // person can be added later without a schema change.
  defaultUserId: 1,
};
