/**
 * SundayEmpire Brand Token Utilities
 * 
 * Provides utilities for consistent brand token usage across components.
 * These utilities ensure brand tokens are used appropriately and maintain
 * the design system's semantic token contract.
 */

/**
 * Brand token names for CSS custom property access
 */
export const BRAND_TOKENS = {
  // Raw brand palette
  MIDNIGHT_NAVY: "--brand-midnight-navy",
  EMPIRE_GOLD: "--brand-empire-gold", 
  BONE: "--brand-bone",
  SLATE_STEEL: "--brand-slate-steel",
  CRIMSON_ACCENT: "--brand-crimson-accent",

  // Brand-derived semantic tokens
  SURFACE_ELEVATED: "--brand-surface-elevated",
  SURFACE_CARD: "--brand-surface-card", 
  SURFACE_MUTED: "--brand-surface-muted",
  ACCENT_PRIMARY: "--brand-accent-primary",
  ACCENT_SOFT: "--brand-accent-soft",
  ACCENT_HOVER: "--brand-accent-hover",
  AUTH_SURFACE: "--brand-auth-surface",
  AUTH_TEXT: "--brand-auth-text",
  STRUCTURE: "--brand-structure",
  STRUCTURE_MUTED: "--brand-structure-muted",

  // Interactive state tokens
  INTERACTIVE_PRIMARY: "--brand-interactive-primary",
  INTERACTIVE_PRIMARY_HOVER: "--brand-interactive-primary-hover",
  INTERACTIVE_SECONDARY: "--brand-interactive-secondary",
  INTERACTIVE_SECONDARY_HOVER: "--brand-interactive-secondary-hover",
  INTERACTIVE_SUBTLE: "--brand-interactive-subtle",
  INTERACTIVE_SUBTLE_HOVER: "--brand-interactive-subtle-hover",
  INTERACTIVE_DESTRUCTIVE: "--brand-interactive-destructive",
  INTERACTIVE_DESTRUCTIVE_HOVER: "--brand-interactive-destructive-hover",
  INTERACTIVE_DISABLED: "--brand-interactive-disabled",

  // Form field tokens
  FIELD_SURFACE: "--brand-field-surface",
  FIELD_BORDER: "--brand-field-border",
  FIELD_BORDER_FOCUS: "--brand-field-border-focus",
  FIELD_TEXT: "--brand-field-text",
  FIELD_PLACEHOLDER: "--brand-field-placeholder",

  // State feedback tokens (preserve strength hierarchy)
  SUCCESS_SOFT: "--brand-success-soft",
  WARNING_STRONG: "--brand-warning-strong",
  ERROR_STRONG: "--brand-error-strong",
  INFO_SOFT: "--brand-info-soft",
} as const;

/**
 * Type-safe brand token access
 */
export type BrandToken = keyof typeof BRAND_TOKENS;

/**
 * Get a CSS custom property value for a brand token
 */
export function getBrandToken(token: BrandToken): string {
  return `var(${BRAND_TOKENS[token]})`;
}

/**
 * Brand-safe CSS class utilities for common patterns
 */
export const BRAND_CLASSES = {
  // Surface patterns
  SURFACE_CARD: "bg-[var(--brand-surface-card)] border border-[var(--brand-structure-muted)]",
  SURFACE_ELEVATED: "bg-[var(--brand-surface-elevated)] border border-[var(--brand-structure)]",
  
  // Accent patterns  
  ACCENT_BUTTON: "bg-[var(--brand-accent-soft)] hover:bg-[var(--brand-accent-hover)] text-slate-100 border border-[var(--brand-accent-primary)]",
  ACCENT_CHIP: "bg-[var(--brand-accent-soft)] text-[var(--brand-accent-primary)] border border-[var(--brand-accent-primary)]",
  
  // Auth patterns
  AUTH_SURFACE: "bg-[var(--brand-auth-surface)] text-[var(--brand-auth-text)]",
  
  // Structure patterns
  BORDER_DEFAULT: "border-[var(--brand-structure-muted)]",
  BORDER_STRONG: "border-[var(--brand-structure)]",

  // Interactive button patterns
  BUTTON_PRIMARY: "bg-[var(--brand-interactive-primary)] hover:bg-[var(--brand-interactive-primary-hover)] border border-[var(--brand-interactive-primary)] text-[var(--brand-midnight-navy)] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
  BUTTON_SECONDARY: "border border-[var(--brand-interactive-secondary)] hover:border-[var(--brand-interactive-secondary-hover)] bg-transparent text-[var(--brand-interactive-secondary)] hover:text-[var(--brand-interactive-secondary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
  BUTTON_SUBTLE: "border border-[var(--brand-interactive-subtle)] hover:border-[var(--brand-interactive-subtle-hover)] bg-[var(--brand-interactive-subtle)] hover:bg-[var(--brand-interactive-subtle-hover)] text-[var(--foreground)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
  BUTTON_DESTRUCTIVE: "bg-[var(--brand-interactive-destructive)] hover:bg-[var(--brand-interactive-destructive-hover)] border border-[var(--brand-interactive-destructive)] text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",

  // Form field patterns
  FIELD_INPUT: "bg-[var(--brand-field-surface)] border border-[var(--brand-field-border)] focus:border-[var(--brand-field-border-focus)] text-[var(--brand-field-text)] placeholder:text-[var(--brand-field-placeholder)] transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed",
} as const;

/**
 * Validation helper: Ensures Empire Gold isn't used as primary text color
 */
export function validateBrandTokenUsage(token: BrandToken, usage: "background" | "text" | "border"): boolean {
  // Empire Gold should not be used as primary text (insufficient contrast)
  if (token === "EMPIRE_GOLD" && usage === "text") {
    console.warn("Brand validation: Empire Gold should not be used as primary text color. Use accent patterns instead.");
    return false;
  }
  
  // Crimson accent should only be used for destructive contexts  
  if (token === "CRIMSON_ACCENT" && usage !== "border") {
    console.warn("Brand validation: Crimson accent should be used sparingly, primarily for destructive emphasis.");  
  }
  
  return true;
}

/**
 * Brand context helpers for component theming
 */
export const BRAND_CONTEXTS = {
  AUTH: "auth",
  SHELL: "shell", 
  CONTENT: "content",
  ACCENT: "accent",
  CRITICAL: "critical",
} as const;

export type BrandContext = typeof BRAND_CONTEXTS[keyof typeof BRAND_CONTEXTS];