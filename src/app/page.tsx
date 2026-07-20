"use client";

import { useEffect, useState } from "react";

interface StatusResponse {
  connected: boolean;
  folderPath: string;
}

interface FileEntry {
  id: string;
  name: string;
  pathDisplay: string;
  kind: "file" | "folder";
  clientModified: string | null;
  size: number | null;
}

export default function Home() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [files, setFiles] = useState<FileEntry[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/dropbox/status")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => setError("Could not reach the status endpoint."));
  }, []);

  async function handleListFiles() {
    setLoadingFiles(true);
    setError(null);
    setFiles(null);
    try {
      const res = await fetch("/api/dropbox/files");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to list files.");
      setFiles(data.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to list files.");
    } finally {
      setLoadingFiles(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl w-full p-8 flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Monthly Vlog</h1>

      <section className="rounded-lg border border-black/10 dark:border-white/15 p-4 flex flex-col gap-3">
        <h2 className="font-medium">Dropbox connection</h2>

        {status === null ? (
          <p className="text-sm opacity-70">Checking connection…</p>
        ) : status.connected ? (
          <div className="text-sm flex flex-col gap-2">
            <p className="text-green-600 dark:text-green-400">✓ Connected</p>
            <p className="opacity-70">Configured folder: {status.folderPath}</p>
            <a
              href="/review"
              className="inline-block w-fit rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
            >
              Go to Monthly Review
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-2 text-sm">
            <p className="opacity-70">Not connected yet.</p>
            <a
              href="/api/auth/dropbox/login"
              className="inline-block w-fit rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700"
            >
              Connect Dropbox
            </a>
          </div>
        )}
      </section>

      {status?.connected && (
        <section className="rounded-lg border border-black/10 dark:border-white/15 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Files in configured folder</h2>
            <button
              onClick={handleListFiles}
              disabled={loadingFiles}
              className="rounded-md border border-black/15 dark:border-white/20 px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
            >
              {loadingFiles ? "Loading…" : "List files"}
            </button>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          {files && (
            <ul className="text-sm divide-y divide-black/10 dark:divide-white/10">
              {files.length === 0 && (
                <li className="py-2 opacity-70">No files found in this folder.</li>
              )}
              {files.map((f) => (
                <li key={f.id} className="py-2 flex justify-between gap-4">
                  <span className="truncate">{f.name}</span>
                  <span className="opacity-60 shrink-0">
                    {f.clientModified
                      ? new Date(f.clientModified).toLocaleString()
                      : f.kind}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
