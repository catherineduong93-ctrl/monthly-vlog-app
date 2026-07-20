"use client";

import { useEffect, useState } from "react";

interface MediaItem {
  id: number;
  dropboxFileId: string;
  name: string;
  pathLower: string | null;
  kind: "photo" | "video" | null;
  clientModified: string | null;
  caption: string | null;
  sortOrder: number;
  include: boolean;
}

type RenderStatus = "queued" | "downloading" | "rendering" | "done" | "error";

interface RenderJob {
  id: number;
  month: string;
  status: RenderStatus;
  progress: string | null;
  error: string | null;
  outputPath: string | null;
  musicPath: string | null;
}

interface MusicTrack {
  path: string;
  name: string;
}

const ACTIVE_RENDER_STATUSES: RenderStatus[] = ["queued", "downloading", "rendering"];

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function ReviewPage() {
  const [month, setMonth] = useState(currentMonth());
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [musicTracks, setMusicTracks] = useState<MusicTrack[]>([]);
  const [selectedMusicPath, setSelectedMusicPath] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/media?month=${month}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load media.");
        if (!cancelled) setItems(data.items);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load media.");
          setItems(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => {
    let cancelled = false;

    async function loadLatest() {
      try {
        const res = await fetch(`/api/render?month=${month}`);
        const data = await res.json();
        if (!cancelled && res.ok) {
          setRenderJob(data.job);
          setRenderError(null);
        }
      } catch {
        // No existing job for this month yet; leave renderJob as-is.
      }
    }

    loadLatest();
    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => {
    let cancelled = false;

    async function loadTracks() {
      try {
        const res = await fetch("/api/music");
        const data = await res.json();
        if (!cancelled && res.ok) setMusicTracks(data.tracks);
      } catch {
        // Music folder not configured or unreachable; picker stays empty.
      }
    }

    loadTracks();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeJobId =
    renderJob && ACTIVE_RENDER_STATUSES.includes(renderJob.status) ? renderJob.id : null;

  useEffect(() => {
    if (activeJobId === null) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/render/${activeJobId}`);
        const data = await res.json();
        if (!cancelled && res.ok) setRenderJob(data.job);
      } catch {
        // Transient fetch error; the next poll tick will retry.
      }
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeJobId]);

  async function startRender() {
    setRenderError(null);
    try {
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, musicPath: selectedMusicPath || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to start render.");
      setRenderJob(data.job);
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : "Failed to start render.");
    }
  }

  async function saveCaption(id: number, caption: string) {
    setItems((prev) =>
      prev
        ? prev.map((item) => (item.id === id ? { ...item, caption } : item))
        : prev
    );
    await fetch(`/api/media/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption }),
    });
  }

  async function toggleInclude(id: number, include: boolean) {
    setItems((prev) =>
      prev
        ? prev.map((item) => (item.id === id ? { ...item, include } : item))
        : prev
    );
    await fetch(`/api/media/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ include }),
    });
  }

  async function persistOrder(ordered: MediaItem[]) {
    await fetch("/api/media/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ordered.map((i) => i.id) }),
    });
  }

  function handleDrop(targetId: number) {
    if (draggedId === null || draggedId === targetId || !items) {
      setDraggedId(null);
      return;
    }
    const fromIndex = items.findIndex((i) => i.id === draggedId);
    const toIndex = items.findIndex((i) => i.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...items];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    setItems(reordered);
    setDraggedId(null);
    persistOrder(reordered);
  }

  const includedCount = items?.filter((i) => i.include).length ?? 0;

  return (
    <main className="mx-auto max-w-5xl w-full p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Monthly Review</h1>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border border-black/15 dark:border-white/20 px-3 py-1.5 text-sm bg-transparent"
        />
      </div>

      {loading && <p className="text-sm opacity-70">Loading…</p>}
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {items && items.length === 0 && !loading && (
        <p className="text-sm opacity-70">
          No photos or videos found in your configured Dropbox folder for
          this month.
        </p>
      )}

      {items && items.length > 0 && (
        <>
          <p className="text-sm opacity-70">
            {items.length} item{items.length === 1 ? "" : "s"} · {includedCount} included ·
            drag to reorder
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDraggedId(item.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(item.id)}
                className={`flex flex-col gap-2 rounded-lg border p-2 cursor-move ${
                  draggedId === item.id
                    ? "opacity-40 border-blue-400"
                    : "border-black/10 dark:border-white/15"
                } ${!item.include ? "opacity-50" : ""}`}
              >
                <div className="relative aspect-[4/3] rounded-md overflow-hidden bg-black/5 dark:bg-white/5">
                  {item.pathLower ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/dropbox/thumbnail?path=${encodeURIComponent(item.pathLower)}`}
                      alt={item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs opacity-60">
                      No preview
                    </div>
                  )}
                  {item.kind === "video" && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/70 text-white text-[10px] px-1.5 py-0.5">
                      VIDEO
                    </span>
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Caption…"
                  defaultValue={item.caption ?? ""}
                  onBlur={(e) => saveCaption(item.id, e.target.value)}
                  className="text-sm rounded-md border border-black/15 dark:border-white/20 px-2 py-1 bg-transparent"
                />

                <label className="flex items-center gap-2 text-xs opacity-80">
                  <input
                    type="checkbox"
                    checked={item.include}
                    onChange={(e) => toggleInclude(item.id, e.target.checked)}
                  />
                  Include in video
                </label>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 pt-2">
            {musicTracks.length > 0 && (
              <label className="flex items-center gap-2 text-sm w-fit">
                Background music
                <select
                  value={selectedMusicPath}
                  onChange={(e) => setSelectedMusicPath(e.target.value)}
                  disabled={activeJobId !== null}
                  className="rounded-md border border-black/15 dark:border-white/20 px-2 py-1 bg-transparent"
                >
                  <option value="">None</option>
                  {musicTracks.map((track) => (
                    <option key={track.path} value={track.path}>
                      {track.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              onClick={startRender}
              disabled={activeJobId !== null || includedCount === 0}
              className="w-fit rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {activeJobId !== null ? "Generating…" : "Generate Video"}
            </button>

            {renderError && (
              <p className="text-sm text-red-600 dark:text-red-400">{renderError}</p>
            )}

            {renderJob && ACTIVE_RENDER_STATUSES.includes(renderJob.status) && (
              <p className="text-xs opacity-70">
                {renderJob.progress ?? "Working…"}
              </p>
            )}

            {renderJob?.status === "error" && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {renderJob.error ?? "Render failed."}
              </p>
            )}

            {renderJob?.status === "done" && (
              <div className="flex flex-col gap-2 pt-1">
                <video
                  controls
                  className="w-full max-w-md rounded-md border border-black/10 dark:border-white/15"
                  src={`/api/render/${renderJob.id}/file`}
                />
                {renderJob.musicPath && (
                  <p className="text-xs opacity-60">
                    Music: {musicTracks.find((t) => t.path === renderJob.musicPath)?.name ?? renderJob.musicPath}
                  </p>
                )}
                <a
                  href={`/api/render/${renderJob.id}/file`}
                  download={`monthly-vlog-${renderJob.month}.mp4`}
                  className="text-sm text-blue-600 dark:text-blue-400 underline w-fit"
                >
                  Download video
                </a>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
