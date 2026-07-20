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
            <button
              disabled
              title="Video rendering lands in step 3"
              className="w-fit rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium opacity-50 cursor-not-allowed"
            >
              Generate Video
            </button>
            <p className="text-xs opacity-60">
              Video rendering isn&apos;t built yet — captions, ordering, and
              include/exclude are already saved as you go.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
