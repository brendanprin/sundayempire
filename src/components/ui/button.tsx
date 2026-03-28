"use client";

import { ButtonHTMLAttributes, forwardRef } from "react";
import { BRAND_CLASSES } from "../brand";

export type ButtonVariant = "primary" | "secondary" | "subtle" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: BRAND_CLASSES.BUTTON_PRIMARY,
  secondary: BRAND_CLASSES.BUTTON_SECONDARY, 
  subtle: BRAND_CLASSES.BUTTON_SUBTLE,
  destructive: BRAND_CLASSES.BUTTON_DESTRUCTIVE,
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "px-2 py-1 text-xs",
  md: "px-3 py-2 text-sm", 
  lg: "px-4 py-2.5 text-sm",
};

function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Unified button component for SundayEmpire interaction consistency.
 * 
 * Variant hierarchy (by visual weight):
 * - destructive: Strongest visual impact (preserves operational trust)
 * - primary: SundayEmpire brand accent for main CTAs (deliberate, restrained)
 * - secondary: Structure outline for supporting actions
 * - subtle: Minimal for tertiary/ghost actions
 * 
 * Loading state supplements (not replaces) button text for clarity.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant = "secondary", 
    size = "md", 
    loading = false,
    disabled,
    children, 
    ...props 
  }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          buttonVariants[variant],
          buttonSizes[size],
          "rounded-md inline-flex items-center justify-center gap-2",
          loading && "cursor-wait",
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";