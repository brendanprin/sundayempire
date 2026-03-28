"use client";

import { SelectHTMLAttributes, forwardRef, ReactNode } from "react";
import { BRAND_CLASSES } from "../brand";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  children: ReactNode;
}

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Unified select dropdown component for SundayEmpire form consistency.
 * 
 * Features:
 * - Brand-consistent field styling using semantic tokens
 * - Error states visually stronger than decorative accents
 * - Focus states use brand accent without competing with validation
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          BRAND_CLASSES.FIELD_INPUT,
          "rounded-md px-3 py-2",
          error && "border-[var(--brand-error-strong)] focus:border-[var(--brand-error-strong)]",
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);

Select.displayName = "Select";