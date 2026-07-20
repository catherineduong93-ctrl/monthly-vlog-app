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

const AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "aac", "wav", "flac", "ogg"]);

export type MediaKind = "photo" | "video";

export function classifyByName(name: string): MediaKind | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (!ext) return null;
  if (PHOTO_EXTENSIONS.has(ext)) return "photo";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  return null;
}

export function isAudioFile(name: string): boolean {
  const ext = name.split(".").pop()?.toLowerCase();
  return !!ext && AUDIO_EXTENSIONS.has(ext);
}
