import { spawn } from "node:child_process";

export const VIDEO_WIDTH = 1920;
export const VIDEO_HEIGHT = 1080;
export const FPS = 30;
export const PHOTO_DURATION_SECONDS = 3;
export const CROSSFADE_SECONDS = 0.6;
export const MUSIC_FADE_SECONDS = 2;
// Default trim for a video clip unless it's flagged "keep full length".
export const DEFAULT_VIDEO_CLIP_SECONDS = 4;

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

let drawtextSupport: Promise<boolean> | null = null;

/**
 * ffmpeg builds without libfreetype (e.g. Homebrew's plain `ffmpeg` formula,
 * as opposed to `ffmpeg-full`) have no `drawtext` filter at all, which would
 * otherwise crash every render. Checked once and cached for the process.
 */
function hasDrawtextFilter(): Promise<boolean> {
  if (!drawtextSupport) {
    drawtextSupport = new Promise((resolve) => {
      const proc = spawn("ffmpeg", ["-hide_banner", "-filters"]);
      let stdout = "";
      proc.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      proc.on("error", () => resolve(false));
      proc.on("close", () => resolve(/\bdrawtext\b/.test(stdout)));
    });
  }
  return drawtextSupport;
}

/**
 * Bottom-third translucent bar + centered white caption text, appended to a
 * filter chain that has already been scaled/padded to VIDEO_WIDTH x
 * VIDEO_HEIGHT. Resolves to an empty string (skipping the caption rather
 * than failing the whole render) if this ffmpeg build has no drawtext
 * filter — see hasDrawtextFilter.
 */
export async function captionFilter(caption: string | null | undefined): Promise<string> {
  if (!caption || !caption.trim()) return "";

  if (!(await hasDrawtextFilter())) {
    console.warn(
      "This ffmpeg build has no drawtext filter, so captions can't be burned in. " +
        "Install a build with libfreetype (e.g. `brew install ffmpeg-full` on macOS) to enable captions."
    );
    return "";
  }

  const barHeight = Math.round(VIDEO_HEIGHT / 3);
  const text = escapeDrawtext(caption.trim());
  return (
    `,drawbox=x=0:y=ih-${barHeight}:w=iw:h=${barHeight}:color=black@0.45:t=fill` +
    `,drawtext=text='${text}':expansion=none:fontcolor=white:fontsize=54:` +
    `x=(w-text_w)/2:y=h-${barHeight}+(${barHeight}-text_h)/2`
  );
}
