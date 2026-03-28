"use client";

import { FormEvent, useState } from "react";
import { usePathname } from "next/navigation";
import { requestJson } from "@/lib/client-request";
import {
  PilotFeedbackCategory,
  PilotFeedbackSeverity,
  PILOT_FEEDBACK_CATEGORIES,
  PILOT_FEEDBACK_SEVERITIES,
} from "@/types/pilot";

const FEEDBACK_CATEGORY_LABELS: Record<PilotFeedbackCategory, string> = {
  UX_FRICTION: "UX Friction",
  BUG: "Bug",
  SUGGESTION: "Suggestion",
  QUESTION: "Question",
};

const FEEDBACK_SEVERITY_LABELS: Record<PilotFeedbackSeverity, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

type FeedbackSubmitPayload = {
  feedback: {
    id: string;
    category: string;
    severity: string;
    pagePath: string;
    status: string;
    createdAt: string;
  };
};

export function PilotFeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState<PilotFeedbackCategory>("UX_FRICTION");
  const [severity, setSeverity] = useState<PilotFeedbackSeverity>("MEDIUM");
  const [message, setMessage] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await requestJson<FeedbackSubmitPayload>(
        "/api/feedback",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            category,
            severity,
            message,
            stepsToReproduce: stepsToReproduce.trim() || null,
            pagePath: pathname,
            pageTitle: typeof document !== "undefined" ? document.title : null,
          }),
        },
        "Failed to submit feedback.",
      );
      setSuccess(`Feedback submitted (${response.feedback.id.slice(-6)}).`);
      setMessage("");
      setStepsToReproduce("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to submit feedback.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50">
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setError(null);
            setSuccess(null);
          }}
          className="pointer-events-auto rounded-full border border-sky-600 bg-sky-950/90 px-4 py-2 text-xs font-medium text-sky-100 shadow-lg hover:border-sky-500"
          data-testid="feedback-open-button"
        >
          Pilot Feedback
        </button>
      ) : (
        <section
          className="pointer-events-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"
          data-testid="feedback-panel"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Submit Pilot Feedback</h3>
              <p className="mt-1 text-xs text-slate-400" data-testid="feedback-page-context">
                Page context: {pathname}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-slate-500"
            >
              Close
            </button>
          </div>

          <form onSubmit={submitFeedback} className="mt-3 space-y-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="space-y-1 text-xs text-slate-400">
                <span>Category</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as PilotFeedbackCategory)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
                  data-testid="feedback-category-select"
                >
                  {PILOT_FEEDBACK_CATEGORIES.map((option) => (
                    <option key={option} value={option}>
                      {FEEDBACK_CATEGORY_LABELS[option]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs text-slate-400">
                <span>Severity</span>
                <select
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value as PilotFeedbackSeverity)}
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
                  data-testid="feedback-severity-select"
                >
                  {PILOT_FEEDBACK_SEVERITIES.map((option) => (
                    <option key={option} value={option}>
                      {FEEDBACK_SEVERITY_LABELS[option]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1 text-xs text-slate-400">
              <span>What happened?</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="min-h-24 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                placeholder="Describe the issue, confusion, or improvement idea."
                required
                minLength={10}
                data-testid="feedback-message-input"
              />
            </label>

            <label className="block space-y-1 text-xs text-slate-400">
              <span>Steps to reproduce (optional)</span>
              <textarea
                value={stepsToReproduce}
                onChange={(event) => setStepsToReproduce(event.target.value)}
                className="min-h-16 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                placeholder="List steps if this is repeatable."
                data-testid="feedback-steps-input"
              />
            </label>

            {error ? (
              <p className="rounded border border-red-700/60 bg-red-950/30 px-3 py-2 text-xs text-red-200">
                {error}
              </p>
            ) : null}
            {success ? (
              <p
                className="rounded border border-emerald-700/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200"
                data-testid="feedback-success-message"
              >
                {success}
              </p>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md border border-sky-600 px-3 py-1.5 text-xs text-sky-100 disabled:opacity-50"
                data-testid="feedback-submit-button"
              >
                {submitting ? "Sending..." : "Send Feedback"}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
