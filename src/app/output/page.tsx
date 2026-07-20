"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

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

const ACTIVE_RENDER_STATUSES: RenderStatus[] = ["queued", "downloading", "rendering"];

function OutputContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get("job");
  const [job, setJob] = useState<RenderJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/render/${jobId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load render status.");
        if (!cancelled) setJob(data.job);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load render status.");
      }
    }

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId]);

  if (!jobId) {
    return <p className="text-sm opacity-70">No render job specified.</p>;
  }

  return (
    <main className="mx-auto max-w-2xl w-full p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Output</h1>
        <a
          href="/review"
          className="text-sm text-blue-600 dark:text-blue-400 underline"
        >
          Back to Review
        </a>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {job && ACTIVE_RENDER_STATUSES.includes(job.status) && (
        <p className="text-sm opacity-70">{job.progress ?? "Working…"}</p>
      )}

      {job?.status === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">
          {job.error ?? "Render failed."}
        </p>
      )}

      {job?.status === "done" && (
        <div className="flex flex-col gap-3">
          <video
            controls
            className="w-full rounded-md border border-black/10 dark:border-white/15"
            src={`/api/render/${job.id}/file`}
          />
          <div className="flex items-center gap-4">
            <a
              href={`/api/render/${job.id}/file`}
              download={`monthly-vlog-${job.month}.mp4`}
              className="w-fit rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium"
            >
              Download video
            </a>
            <a
              href="/review"
              className="text-sm text-blue-600 dark:text-blue-400 underline"
            >
              Tweak and regenerate
            </a>
          </div>
        </div>
      )}
    </main>
  );
}

export default function OutputPage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-2xl w-full p-8">Loading…</main>}>
      <OutputContent />
    </Suspense>
  );
}
