import { PilotEventType } from "@/types/pilot";

type UiEventInput = {
  eventType: PilotEventType;
  pagePath: string;
  eventStep?: string;
  status?: string;
  entityType?: string;
  entityId?: string;
  context?: Record<string, unknown>;
};

export function trackUiEvent(input: UiEventInput) {
  if (typeof window === "undefined") {
    return;
  }

  const payload = JSON.stringify(input);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const blob = new Blob([payload], { type: "application/json" });
    const sent = navigator.sendBeacon("/api/analytics/ui-event", blob);
    if (sent) {
      return;
    }
  }

  void fetch("/api/analytics/ui-event", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}
