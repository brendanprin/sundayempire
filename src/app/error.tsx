"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="mx-auto max-w-2xl space-y-4 rounded-lg border border-red-800/80 bg-red-950/30 p-6 text-red-100"
      role="alert"
    >
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-sm text-red-200">
        The page failed to load. You can retry the action below.
      </p>
      <p className="rounded border border-red-800/70 bg-red-950/40 px-3 py-2 text-xs text-red-300">
        {error.digest
          ? `Reference: ${error.digest}`
          : "An unexpected error occurred. If this continues, contact your commissioner."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-red-700 px-3 py-1.5 text-sm text-red-100 transition hover:border-red-500"
      >
        Try again
      </button>
    </div>
  );
}
