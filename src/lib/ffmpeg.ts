import { spawn } from "node:child_process";

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const FPS = 30;
export const PHOTO_DURATION_SECONDS = 4;
export const CROSSFADE_SECONDS = 0.6;
export const MUSIC_FADE_SECONDS = 2;
// Longest a single video clip is allowed to run. Insta360 clips can be
// several minutes long; without a cap one clip could dominate the whole
// edit. Trims from the start, since we have no way to pick a "best" moment.
export const MAX_VIDEO_CLIP_SECONDS = 12;
export const TITLE_CARD_SECONDS = 2.5;
export const OUTRO_FADE_SECONDS = 1;

/**
 * Runs ffmpeg (or ffprobe) and rejects with stderr on a non-zero exit, since
 * that's almost always the useful error message for these commands.
 */
export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      reject(new Error(`Failed to start ffmpeg: ${err.message}`));
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

export function ffprobeDuration(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("error", (err) => reject(new Error(`Failed to start ffprobe: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve(parseFloat(stdout.trim()));
      else reject(new Error(`ffprobe exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

/**
 * Escapes caption text for safe interpolation into an ffmpeg filtergraph
 * drawtext `text=` argument (single-quoted within a filter that is itself
 * comma/colon-separated).
 */
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "’")
    .replace(/:/g, "\\:");
}

/**
 * Bottom-third translucent bar + centered white caption text, appended to a
 * filter chain that has already been scaled/padded to VIDEO_WIDTH x
 * VIDEO_HEIGHT.
 */
export function captionFilter(caption: string | null | undefined): string {
  if (!caption || !caption.trim()) return "";
  const barHeight = Math.round(VIDEO_HEIGHT / 3);
  const text = escapeDrawtext(caption.trim());
  return (
    `,drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black@0.45:t=fill` +
    `,drawtext=text='${text}':expansion=none:fontcolor=white:fontsize=54:` +
    `x=(w-text_w)/2:y=h-${barHeight}+(${barHeight}-text_h)/2`
  );
}
