import { Dropbox, DropboxAuth, files } from "dropbox";
import { config } from "./config";
import { getTokens, saveTokens, updateAccessToken } from "./dropboxTokens";

const SCOPES = ["files.metadata.read", "files.content.read"];

function newAuth(): DropboxAuth {
  return new DropboxAuth({
    clientId: config.dropbox.appKey(),
    clientSecret: config.dropbox.appSecret(),
  });
}

export async function getDropboxAuthUrl(state: string): Promise<string> {
  const auth = newAuth();
  const url = await auth.getAuthenticationUrl(
    config.dropbox.redirectUri(),
    state,
    "code",
    "offline", // request a refresh token, not just a short-lived access token
    SCOPES,
    "none",
    false
  );
  return url.toString();
}

export async function exchangeCodeForTokens(code: string, userId: number) {
  const auth = newAuth();
  const response = await auth.getAccessTokenFromCode(
    config.dropbox.redirectUri(),
    code
  );

  const result = response.result as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    account_id?: string;
  };

  saveTokens(userId, {
    accessToken: result.access_token,
    refreshToken: result.refresh_token,
    expiresAt: Date.now() + result.expires_in * 1000,
    accountId: result.account_id ?? null,
  });
}

export function isDropboxConnected(userId: number): boolean {
  return !!getTokens(userId);
}

/**
 * Builds a Dropbox client for the given user, refreshing the access token
 * first if it's expired (or about to expire).
 */
export async function getClientForUser(userId: number): Promise<Dropbox> {
  const tokens = getTokens(userId);
  if (!tokens) {
    throw new Error(
      "Dropbox is not connected yet. Visit /api/auth/dropbox/login first."
    );
  }

  const auth = newAuth();
  auth.setRefreshToken(tokens.refresh_token);
  auth.setAccessToken(tokens.access_token);
  auth.setAccessTokenExpiresAt(new Date(tokens.expires_at));

  // Refreshes in place if within 5 minutes of expiring; no-op otherwise.
  await auth.checkAndRefreshAccessToken();

  const refreshedAccessToken = auth.getAccessToken();
  if (refreshedAccessToken !== tokens.access_token) {
    updateAccessToken(
      userId,
      refreshedAccessToken,
      auth.getAccessTokenExpiresAt().getTime()
    );
  }

  return new Dropbox({ auth });
}

export interface DropboxFileEntry {
  id: string;
  name: string;
  pathDisplay: string;
  pathLower: string | null;
  kind: "file" | "folder";
  clientModified: string | null;
  size: number | null;
}

/**
 * Lists every file directly inside the configured folder, following
 * pagination. Used for now just to prove the OAuth + folder config works;
 * the Monthly Review screen (step 2) will filter/sort this by month.
 */
export async function listConfiguredFolder(
  userId: number
): Promise<DropboxFileEntry[]> {
  const dbx = await getClientForUser(userId);
  const folderPath = config.dropbox.folderPath();

  type Entry =
    | files.FileMetadataReference
    | files.FolderMetadataReference
    | files.DeletedMetadataReference;

  const entries: Entry[] = [];
  let response = await dbx.filesListFolder({ path: folderPath });
  entries.push(...response.result.entries);

  while (response.result.has_more) {
    response = await dbx.filesListFolderContinue({
      cursor: response.result.cursor,
    });
    entries.push(...response.result.entries);
  }

  return entries
    .filter((entry): entry is Exclude<Entry, files.DeletedMetadataReference> => entry[".tag"] !== "deleted")
    .map((entry) => ({
      id: entry.id ?? entry.path_lower ?? entry.name,
      name: entry.name,
      pathDisplay: entry.path_display ?? entry.name,
      pathLower: entry.path_lower ?? null,
      kind: entry[".tag"],
      clientModified:
        entry[".tag"] === "file" ? entry.client_modified : null,
      size: entry[".tag"] === "file" ? entry.size : null,
    }));
}

/**
 * Fetches a small preview image for a photo or video from Dropbox, so the
 * Monthly Review grid doesn't need to download full-resolution files.
 */
export async function getThumbnail(
  userId: number,
  path: string
): Promise<{ data: Buffer; contentType: string }> {
  const dbx = await getClientForUser(userId);
  const response = await dbx.filesGetThumbnailV2({
    resource: { ".tag": "path", path },
    format: { ".tag": "jpeg" },
    size: { ".tag": "w480h320" },
  });

  // The SDK picks Buffer (fileBinary) vs. Blob (fileBlob) based on a browser
  // detection heuristic that misfires under Next.js's ESM server bundle, so
  // handle whichever one it actually decided to hand back.
  const result = response.result as unknown as {
    fileBinary?: Buffer;
    fileBlob?: Blob;
  };
  const data = result.fileBinary ?? Buffer.from(await result.fileBlob!.arrayBuffer());

  return { data, contentType: "image/jpeg" };
}

/**
 * Downloads the full content of a file (photo or video) for rendering.
 */
export async function downloadFile(userId: number, path: string): Promise<Buffer> {
  const dbx = await getClientForUser(userId);
  const response = await dbx.filesDownload({ path });

  // Same fileBinary vs. fileBlob quirk as getThumbnail above.
  const result = response.result as unknown as {
    fileBinary?: Buffer;
    fileBlob?: Blob;
  };
  return result.fileBinary ?? Buffer.from(await result.fileBlob!.arrayBuffer());
}
