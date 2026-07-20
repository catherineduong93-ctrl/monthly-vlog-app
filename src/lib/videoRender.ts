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
}

function rendersDir(): string {
  return path.join(path.dirname(config.db.path()), "renders");
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
  const frames = PHOTO_DURATION_SECONDS * FPS;
  const vf =
    `scale=${VIDEO_WIDTH * 2}:${VIDEO_HEIGHT * 2}:force_original_aspect_ratio=increase,` +
    `crop=${VIDEO_WIDTH * 2}:${VIDEO_HEIGHT * 2},` +
    `zoompan=z='min(zoom+0.0012,1.2)':d=${frames}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=${FPS}:` +
    `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',format=yuv420p${captionFilter(caption)}`;

  await runFfmpeg([
    "-loop",
    "1",
    "-i",
    sourcePath,
    "-t",
    String(PHOTO_DURATION_SECONDS),
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
  caption: string | null
): Promise<string> {
  const outputPath = path.join(workDir, `seg-${index}.mp4`);
  const vf =
    `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,` +
    `pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `fps=${FPS},format=yuv420p${captionFilter(caption)}`;

  await runFfmpeg([
    "-i",
    sourcePath,
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
 * Loops the music track under the (already muted) video, fading it out
 * over the last MUSIC_FADE_SECONDS and trimming it to the video's exact
 * length via -shortest. The video stream is copied, not re-encoded.
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
 * (Ken Burns pan/zoom for photos, muted full-length clip for videos, both
 * with a burned-in bottom-bar caption), crossfades them together, optionally
 * loops a Dropbox-hosted music track under the result with a fade-out, and
 * writes the final mp4 under <dataDir>/renders. Updates the render_jobs row
 * as it progresses so the UI can poll for status.
 */
export async function runRenderJob(
  jobId: number,
  userId: number,
  month: string,
  musicPath: string | null
) {
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

      updateRenderJob(jobId, {
        status: "rendering",
        progress: `Rendering ${i + 1}/${items.length}: ${item.name}`,
      });

      const segmentPath =
        item.kind === "photo"
          ? await buildPhotoSegment(workDir, i, sourcePath, item.caption)
          : await buildVideoSegment(workDir, i, sourcePath, item.caption);
      segmentPaths.push(segmentPath);

      // Free disk space as we go; the source file isn't needed once its
      // segment is rendered.
      await fs.unlink(sourcePath).catch(() => {});
    }

    updateRenderJob(jobId, {
      status: "rendering",
      progress: "Combining clips…",
    });

    await fs.mkdir(rendersDir(), { recursive: true });
    const outputPath = path.join(rendersDir(), `${userId}-${month}-${jobId}.mp4`);

    if (musicPath) {
      const silentPath = path.join(workDir, "silent.mp4");
      await concatWithCrossfade(segmentPaths, silentPath);

      updateRenderJob(jobId, { status: "rendering", progress: "Adding music…" });
      const musicExt = path.extname(musicPath) || ".mp3";
      const musicSourcePath = path.join(workDir, `music${musicExt}`);
      const musicData = await downloadFile(userId, musicPath);
      await fs.writeFile(musicSourcePath, musicData);

      await muxBackgroundMusic(silentPath, musicSourcePath, outputPath);
    } else {
      await concatWithCrossfade(segmentPaths, outputPath);
    }

    updateRenderJob(jobId, {
      status: "done",
      progress: "Done.",
      output_path: outputPath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    updateRenderJob(jobId, { status: "error", error: message });
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
