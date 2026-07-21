import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { config } from "./config";
import { downloadFile, listConfiguredFolder } from "./dropboxClient";
import { classifyByName } from "./mediaKind";
import { getMediaItems } from "./mediaItems";
import { updateRenderJob } from "./renderJobs";
import {
  CROSSFADE_SECONDS,
  DEFAULT_VIDEO_CLIP_SECONDS,
  FPS,
  MUSIC_FADE_SECONDS,
  PHOTO_DURATION_SECONDS,
  VIDEO_HEIGHT,
  VIDEO_WIDTH,
  captionFilter,
  ffprobeDuration,
  runFfmpeg,
} from "./ffmpeg";

interface RenderableItem {
  dropboxFileId: string;
  pathLower: string;
  name: string;
  kind: "photo" | "video";
  caption: string | null;
  keepFull: boolean;
}

function rendersDir(): string {
  return path.join(path.dirname(config.db.path()), "renders");
}

const HEIC_EXTENSIONS = new Set([".heic", ".heif"]);

/**
 * Converts a HEIC/HEIF photo to JPEG via macOS's built-in `sips` tool.
 * ffmpeg has no HEIF demuxer in typical builds (including Homebrew's), so
 * without this step every HEIC photo — the default format for iPhone
 * camera shots — would fail to decode entirely.
 */
function convertHeicToJpeg(sourcePath: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("sips", ["-s", "format", "jpeg", sourcePath, "--out", destPath]);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "HEIC photos need macOS's `sips` tool to convert to JPEG, but it wasn't found. This step only works on macOS."
          )
        );
      } else {
        reject(err);
      }
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`sips exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

async function collectRenderableItems(
  userId: number,
  month: string
): Promise<RenderableItem[]> {
  const entries = await listConfiguredFolder(userId);
  const entryById = new Map(entries.map((e) => [e.id, e]));

  const rows = getMediaItems(userId, month).filter((r) => r.include);

  const items: RenderableItem[] = [];
  for (const row of rows) {
    const entry = entryById.get(row.dropbox_file_id);
    if (!entry || !entry.pathLower) continue;
    const kind = classifyByName(entry.name);
    if (!kind) continue;
    items.push({
      dropboxFileId: row.dropbox_file_id,
      pathLower: entry.pathLower,
      name: entry.name,
      kind,
      caption: row.caption,
      keepFull: !!row.keep_full,
    });
  }
  return items;
}

async function buildPhotoSegment(
  workDir: string,
  index: number,
  sourcePath: string,
  caption: string | null
): Promise<string> {
  const outputPath = path.join(workDir, `seg-${index}.mp4`);
  const vf =
    `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,` +
    `pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `format=yuv420p${await captionFilter(caption)}`;

  await runFfmpeg([
    "-loop",
    "1",
    "-i",
    sourcePath,
    "-t",
    String(PHOTO_DURATION_SECONDS),
    "-r",
    String(FPS),
    "-vf",
    vf,
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
  return outputPath;
}

async function buildVideoSegment(
  workDir: string,
  index: number,
  sourcePath: string,
  caption: string | null,
  keepFull: boolean
): Promise<string> {
  const outputPath = path.join(workDir, `seg-${index}.mp4`);
  const vf =
    `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,` +
    `pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `fps=${FPS},format=yuv420p${await captionFilter(caption)}`;

  const args = ["-i", sourcePath];
  if (!keepFull) {
    args.push("-t", String(DEFAULT_VIDEO_CLIP_SECONDS));
  }
  args.push(
    "-vf",
    vf,
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    outputPath
  );

  await runFfmpeg(args);
  return outputPath;
}

/**
 * Concatenates segments with a short crossfade between each consecutive
 * pair, chaining xfade filters left to right. With one segment, just
 * re-encodes it as-is (no fade to chain).
 */
async function concatWithCrossfade(
  segmentPaths: string[],
  outputPath: string
): Promise<void> {
  if (segmentPaths.length === 1) {
    await runFfmpeg([
      "-i",
      segmentPaths[0],
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      outputPath,
    ]);
    return;
  }

  const durations = await Promise.all(segmentPaths.map(ffprobeDuration));

  const inputArgs = segmentPaths.flatMap((p) => ["-i", p]);
  const filters: string[] = [];
  let cumulative = durations[0];
  let lastLabel = "0:v";

  for (let i = 1; i < segmentPaths.length; i++) {
    const offset = Math.max(cumulative - CROSSFADE_SECONDS, 0);
    const outLabel = i === segmentPaths.length - 1 ? "vout" : `v${i}`;
    filters.push(
      `[${lastLabel}][${i}:v]xfade=transition=fade:duration=${CROSSFADE_SECONDS}:offset=${offset.toFixed(3)}[${outLabel}]`
    );
    cumulative = offset + durations[i];
    lastLabel = outLabel;
  }

  await runFfmpeg([
    ...inputArgs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[vout]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    outputPath,
  ]);
}

/**
 * Loops the music track under the (muted) video, fading it out over the
 * last MUSIC_FADE_SECONDS and trimming it to the video's exact length via
 * -shortest. The video stream is copied, not re-encoded.
 */
async function muxBackgroundMusic(
  videoPath: string,
  musicPath: string,
  outputPath: string
): Promise<void> {
  const duration = await ffprobeDuration(videoPath);
  const fadeStart = Math.max(duration - MUSIC_FADE_SECONDS, 0);

  await runFfmpeg([
    "-i",
    videoPath,
    "-stream_loop",
    "-1",
    "-i",
    musicPath,
    "-filter_complex",
    `[1:a]afade=t=out:st=${fadeStart.toFixed(3)}:d=${MUSIC_FADE_SECONDS}[aout]`,
    "-map",
    "0:v",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-shortest",
    outputPath,
  ]);
}

/**
 * Runs the full render for a month in the background: downloads every
 * included media item from Dropbox, turns each into a normalized segment
 * (photos held for PHOTO_DURATION_SECONDS, video clips trimmed to
 * DEFAULT_VIDEO_CLIP_SECONDS unless flagged "keep full length"), both with
 * a burned-in bottom-bar caption, crossfades them together, optionally
 * loops the configured local music track under the result, and writes the
 * final mp4 under <dataDir>/renders. Updates the render_jobs row as it
 * progresses so the UI can poll for status.
 */
export async function runRenderJob(jobId: number, userId: number, month: string) {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "vlog-render-"));

  try {
    updateRenderJob(jobId, { status: "downloading", progress: "Finding media…" });
    const items = await collectRenderableItems(userId, month);

    if (items.length === 0) {
      updateRenderJob(jobId, {
        status: "error",
        error: "No included photos or videos for this month.",
      });
      return;
    }

    const segmentPaths: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      updateRenderJob(jobId, {
        status: "downloading",
        progress: `Downloading ${i + 1}/${items.length}: ${item.name}`,
      });

      const sourcePath = path.join(workDir, `src-${i}${path.extname(item.name)}`);
      const data = await downloadFile(userId, item.pathLower);
      await fs.writeFile(sourcePath, data);

      let mediaPath = sourcePath;
      if (item.kind === "photo" && HEIC_EXTENSIONS.has(path.extname(item.name).toLowerCase())) {
        mediaPath = path.join(workDir, `src-${i}.jpg`);
        await convertHeicToJpeg(sourcePath, mediaPath);
      }

      updateRenderJob(jobId, {
        status: "rendering",
        progress: `Rendering ${i + 1}/${items.length}: ${item.name}`,
      });

      const segmentPath =
        item.kind === "photo"
          ? await buildPhotoSegment(workDir, i, mediaPath, item.caption)
          : await buildVideoSegment(workDir, i, mediaPath, item.caption, item.keepFull);
      segmentPaths.push(segmentPath);

      // Free disk space as we go; the source file isn't needed once its
      // segment is rendered.
      await fs.unlink(sourcePath).catch(() => {});
      if (mediaPath !== sourcePath) await fs.unlink(mediaPath).catch(() => {});
    }

    updateRenderJob(jobId, {
      status: "rendering",
      progress: "Combining clips…",
    });

    await fs.mkdir(rendersDir(), { recursive: true });
    const outputPath = path.join(rendersDir(), `${userId}-${month}-${jobId}.mp4`);

    const musicPath = config.music.trackPath();
    if (musicPath) {
      const silentPath = path.join(workDir, "silent.mp4");
      await concatWithCrossfade(segmentPaths, silentPath);

      updateRenderJob(jobId, { status: "rendering", progress: "Adding music…" });
      await muxBackgroundMusic(silentPath, musicPath, outputPath);
    } else {
      await concatWithCrossfade(segmentPaths, outputPath);
    }

    updateRenderJob(jobId, {
      status: "done",
      progress: "Done.",
      output_path: outputPath,
      music_path: musicPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    updateRenderJob(jobId, { status: "error", error: message });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
