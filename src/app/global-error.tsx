"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body 
        className="min-h-screen"
        style={{
          backgroundColor: "var(--brand-midnight-navy)",
          color: "var(--foreground)",
        }}
      >
        <main className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-10">
          <div 
            className="w-full space-y-4 rounded-lg p-6 text-red-100"
            style={{
              border: "1px solid rgba(185, 28, 28, 0.8)",
              backgroundColor: "rgba(69, 10, 10, 0.3)",
            }}
          >
            <h2 className="text-xl font-semibold">Application error</h2>
            <p className="text-sm text-red-200">
              A global error occurred. Retry below to reload the app.
            </p>
            <p 
              className="rounded px-3 py-2 text-xs"
              style={{
                border: "1px solid rgba(185, 28, 28, 0.7)",
                backgroundColor: "rgba(69, 10, 10, 0.4)",
              }}
            >
              {error.message || "Unexpected global error."}
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
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
