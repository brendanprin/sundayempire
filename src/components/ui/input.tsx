"use client";

import { InputHTMLAttributes, forwardRef } from "react";
import { BRAND_CLASSES } from "../brand";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Unified input field component for SundayEmpire form consistency.
 * 
 * Features:
 * - Brand-consistent field styling using semantic tokens
 * - Error states visually stronger than decorative accents
 * - Focus states use brand accent without competing with validation
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          BRAND_CLASSES.FIELD_INPUT,
          "rounded-md px-3 py-2",
          error && "border-[var(--brand-error-strong)] focus:border-[var(--brand-error-strong)]",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";