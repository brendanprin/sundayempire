"use client";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const spinnerSizes = {
  sm: "h-3 w-3",
  md: "h-4 w-4", 
  lg: "h-6 w-6",
} as const;

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Unified loading spinner component for SundayEmpire consistency.
 * 
 * Design principles:
 * - Subtle and non-intrusive
 * - Supplements (not replaces) clear textual feedback
 * - Uses current text color for context awareness
 * 
 * Usage:
 * - Standalone loading states
 * - Progress indicators
 * - Async action feedback
 * 
 * Note: Button component has built-in loading spinner.
 */
export function LoadingSpinner({ size = "md", className }: LoadingSpinnerProps) {
  return (
    <div
      className={cn(
        "animate-spin rounded-full border border-current border-t-transparent",
        spinnerSizes[size],
        className
      )}
      role="status"
      aria-label="Loading"
    />
  );
}