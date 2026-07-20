const PHOTO_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "heic",
  "heif",
  "tif",
  "tiff",
  "gif",
  "webp",
]);

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "mov",
  "m4v",
  "avi",
  "mkv",
  "webm",
]);

export type MediaKind = "photo" | "video";

export function classifyByName(name: string): MediaKind | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  if (PHOTO_EXTENSIONS.has(ext)) return "photo";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return null;
}
