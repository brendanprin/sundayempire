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
      className="mx-auto max-w-2xl space-y-4 rounded-lg p-6 text-red-100"
      style={{
        border: "1px solid rgba(185, 28, 28, 0.8)",
        backgroundColor: "rgba(69, 10, 10, 0.3)",
      }}
    >
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-sm text-red-200">
        The page failed to load. You can retry the action below.
      </p>
      <p 
        className="rounded px-3 py-2 text-xs"
        style={{
          border: "1px solid rgba(185, 28, 28, 0.7)",
          backgroundColor: "rgba(69, 10, 10, 0.4)",
        }}
      >
        {error.message || "Unexpected application error."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md px-3 py-1.5 text-sm text-red-100 transition"
        style={{
          border: "1px solid rgb(185, 28, 28)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "rgb(239, 68, 68)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "rgb(185, 28, 28)";
        }}
      >
        Try again
      </button>
    </div>
  );
}
