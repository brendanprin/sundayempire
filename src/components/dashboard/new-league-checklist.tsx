"use client";

import Link from "next/link";
import type { LeagueSetupChecklistProjection } from "@/lib/read-models/dashboard/types";

export type NewLeagueChecklistProps = {
  checklist: LeagueSetupChecklistProjection;
  prominence?: "primary" | "secondary";
  testId?: string;
};

function StatusIcon({ status }: { status: "COMPLETE" | "INCOMPLETE" | "INCOMPLETE_POSTPONED" }) {
  if (status === "COMPLETE") {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
  
  if (status === "INCOMPLETE_POSTPONED") {
    return (
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/20 text-sky-400">
        <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zM7 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
  
  return (
    <div className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-600/50 bg-slate-800/50">
      <div className="h-2 w-2 rounded-full bg-slate-500" />
    </div>
  );
}

function ProgressIndicator({ 
  completionPercent, 
  completedCount, 
  totalCount 
}: { 
  completionPercent: number; 
  completedCount: number; 
  totalCount: number;
}) {
  return (
    <div className="flex items-center space-x-4">
      <div className="flex-1">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-slate-400">Setup Progress</span>
          <span className="font-medium text-slate-200">{completedCount}/{totalCount} Complete</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div 
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-300"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
      </div>
      <div className="text-right">
        <span className="text-lg font-semibold text-slate-200">{completionPercent}%</span>
      </div>
    </div>
  );
}

function NextActionCallout({ action }: { action: LeagueSetupChecklistProjection["primaryAction"] }) {
  if (!action) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-4 py-3">
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <div>
            <h4 className="font-medium text-emerald-200">League setup complete!</h4>
            <p className="text-sm text-emerald-300">Your league is ready for operations.</p>
          </div>
        </div>
      </div>
    );
  }

  const actionTone = action.tone === "critical" ? "border-red-500/30 bg-red-950/30 text-red" 
    : action.tone === "warning" ? "border-amber-400/30 bg-amber-950/30 text-amber" 
    : "border-blue-400/30 bg-blue-950/30 text-blue";
    
  const iconColor = action.tone === "critical" ? "text-red-400 bg-red-500/20"
    : action.tone === "warning" ? "text-amber-400 bg-amber-500/20"
    : "text-blue-400 bg-blue-500/20";

  return (
    <div className={`rounded-lg border px-4 py-3 ${actionTone}`}>
      <div className="flex items-start space-x-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${iconColor}`}>
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="flex-1">
          <h4 className={`font-medium ${action.tone === "critical" ? "text-red-200" : action.tone === "warning" ? "text-amber-200" : "text-blue-200"}`}>
            {action.title}
          </h4>
          <p className={`mt-1 text-sm ${action.tone === "critical" ? "text-red-300" : action.tone === "warning" ? "text-amber-300" : "text-blue-300"}`}>
            {action.description}
          </p>
          {action.href && (
            <div className="mt-3">
              <Link 
                href={action.href}
                className={`inline-flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  action.tone === "critical" 
                    ? "bg-red-600 text-red-50 hover:bg-red-500" 
                    : action.tone === "warning" 
                    ? "bg-amber-600 text-amber-50 hover:bg-amber-500"
                    : "bg-blue-600 text-blue-50 hover:bg-blue-500"
                }`}
              >
                {action.ctaLabel}
                <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChecklistItem({ 
  item, 
  isPrimary 
}: { 
  item: LeagueSetupChecklistProjection["items"][number]; 
  isPrimary: boolean;
}) {
  const isIncomplete = item.status !== "COMPLETE";
  const isPostponed = item.status === "INCOMPLETE_POSTPONED";

  return (
    <div className={`flex items-start space-x-3 py-3 ${isPrimary && isIncomplete ? "rounded-lg bg-blue-950/30 px-3 -mx-3" : ""}`}>
      <StatusIcon status={item.status} />
      <div className="flex-1">
        <div className="flex items-start justify-between">
          <div>
            <h4 className={`font-medium ${item.status === "COMPLETE" ? "text-emerald-200" : isPostponed ? "text-sky-200" : "text-slate-200"}`}>
              {item.title}
              {isPrimary && isIncomplete && (
                <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                  Start here
                </span>
              )}
            </h4>
            <p className={`mt-1 text-sm ${item.status === "COMPLETE" ? "text-emerald-300" : isPostponed ? "text-sky-300" : "text-slate-400"}`}>
              {item.description}
            </p>
          </div>
          {item.href && isIncomplete && (
            <Link 
              href={item.href}
              className="ml-4 inline-flex items-center rounded-md bg-slate-700 px-3 py-1 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600"
            >
              {item.ctaLabel}
              <svg className="ml-1 h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2M7 7l10 10M17 7v10" />
              </svg>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export function NewLeagueChecklist({ 
  checklist, 
  prominence = "secondary", 
  testId 
}: NewLeagueChecklistProps) {
  if (!checklist.available) {
    return null;
  }

  const isPrimary = prominence === "primary";
  const headerSize = isPrimary ? "text-xl" : "text-lg";
  const cardPadding = isPrimary ? "p-6" : "p-5";

  return (
    <div 
      className={`rounded-xl border shadow-[0_18px_60px_rgba(15,23,42,0.25)] ${cardPadding} ${isPrimary ? "border-blue-500/30 bg-gradient-to-br from-blue-950/40 via-slate-950/90 to-slate-950" : "border-slate-700/50 bg-slate-900/50"}`}
      data-testid={testId}
    >
      <div className="space-y-5">
        {/* Header with Progress */}
        <div>
          <h3 className={`font-bold text-slate-200 ${headerSize} mb-4`}>
            New League Setup
            {isPrimary && !checklist.isComplete && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-medium text-amber-800">
                {checklist.completedItemCount}/{checklist.totalItemCount} Complete
              </span>
            )}
          </h3>
          
          <ProgressIndicator 
            completionPercent={checklist.completionPercent}
            completedCount={checklist.completedItemCount}
            totalCount={checklist.totalItemCount}
          />
        </div>

        {/* Next Action Callout */}
        <NextActionCallout action={checklist.primaryAction} />

        {/* Checklist Items */}
        <div className="space-y-1">
          <h4 className="text-sm font-medium text-slate-400 mb-2">Setup Tasks</h4>
          {checklist.items.map((item, index) => {
            const isPrimaryItem = checklist.primaryIncompleteItemId === item.id;
            return (
              <ChecklistItem 
                key={item.id} 
                item={item} 
                isPrimary={isPrimaryItem}
              />
            );
          })}
        </div>

        {/* Footer for completed state */}
        {checklist.isComplete && (
          <div className="border-t border-slate-700 pt-4">
            <p className="text-sm text-slate-400">
              League setup complete! You can now focus on{" "}
              <Link href="/rules" className="text-blue-400 hover:text-blue-300">
                rules configuration
              </Link>{" "}
              and{" "}
              <Link href="/draft" className="text-blue-400 hover:text-blue-300">
                draft preparation
              </Link>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}