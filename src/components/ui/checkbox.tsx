"use client";

import { InputHTMLAttributes, forwardRef } from "react";

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  error?: boolean;
}

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Unified checkbox component for SundayEmpire form consistency.
 * 
 * Features:
 * - Brand-consistent styling using semantic tokens
 * - Error states visually stronger than decorative accents
 * - Focus states use brand accent without competing with validation
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          "h-4 w-4 rounded border border-[var(--brand-field-border)] bg-[var(--brand-field-surface)]",
          "text-[var(--brand-interactive-primary)] focus:ring-[var(--brand-field-border-focus)] focus:ring-2 focus:ring-offset-0",
          "checked:bg-[var(--brand-interactive-primary)] checked:border-[var(--brand-interactive-primary)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          error && "border-[var(--brand-error-strong)] focus:ring-[var(--brand-error-strong)]",
          className
        )}
        {...props}
      />
    );
  }
);

Checkbox.displayName = "Checkbox";