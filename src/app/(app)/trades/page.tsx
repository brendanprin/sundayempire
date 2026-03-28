"use client";

import { useCallback, useEffect, useState } from "react";
import { CanonicalRouteState } from "@/components/layout/canonical-route-state";
import { TradesHomeView } from "@/components/trades/trades-home-view";
import { requestJson } from "@/lib/client-request";
import type { TradeHomeResponse } from "@/types/trade-workflow";

export default function TradesHomePage() {
  const [data, setData] = useState<TradeHomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const payload = await requestJson<TradeHomeResponse>(
      "/api/trades/home",
      undefined,
      "Failed to load trade proposals.",
    );
    setData(payload);
  }, []);

  useEffect(() => {
    let mounted = true;
    load()
      .then(() => {
        if (mounted) {
          setError(null);
        }
      })
      .catch((requestError) => {
        if (!mounted) {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Failed to load trade proposals.",
        );
      });

    return () => {
      mounted = false;
    };
  }, [load]);

  if (error) {
    return (
      <CanonicalRouteState
        eyebrow="Trades"
        title="Trades"
        description="Review pending actions, open proposals, and recent trade history."
        tone="error"
        message="Trades could not load."
        safetyCopy={`${error} Existing trade proposals are unchanged. Refresh to retry, or return to the dashboard.`}
        testId="trades-route-state"
      />
    );
  }

  if (!data) {
    return (
      <CanonicalRouteState
        eyebrow="Trades"
        title="Trades"
        description="Review pending actions, open proposals, and recent trade history."
        tone="loading"
        message="Loading trade proposals, action queues, and recent history."
        safetyCopy="Existing trade records stay unchanged while the page loads."
        testId="trades-route-state"
      />
    );
  }

  return <TradesHomeView data={data} />;
}
