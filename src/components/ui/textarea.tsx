"use client";

import { TextareaHTMLAttributes, forwardRef } from "react";
import { BRAND_CLASSES } from "../brand";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Unified textarea component for SundayEmpire form consistency.
 * 
 * Features:
 * - Brand-consistent field styling using semantic tokens
 * - Error states visually stronger than decorative accents  
 * - Focus states use brand accent without competing with validation
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          BRAND_CLASSES.FIELD_INPUT,
          "rounded-md px-3 py-2 resize-y min-h-[80px]",
          error && "border-[var(--brand-error-strong)] focus:border-[var(--brand-error-strong)]",
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";