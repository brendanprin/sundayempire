"use client";

import Image from "next/image";
import { type ComponentProps } from "react";

type BrandMascotVariant = "default" | "monochrome";
type BrandMascotSize = "sm" | "md" | "lg" | "xl";
type BrandMascotContext = "empty-state" | "onboarding" | "support" | "illustration";

interface BrandMascotProps extends Omit<ComponentProps<typeof Image>, "src" | "alt"> {
  variant?: BrandMascotVariant;
  size?: BrandMascotSize;
  context: BrandMascotContext;
}

const MASCOT_CONFIG = {
  default: {
    src: "/brand/mascot/sundayempire-logo-mascot.png",
    alt: "SundayEmpire mascot",
  },
  monochrome: {
    src: "/brand/mascot/sundayempire-logo-mascot-monochrome.png", 
    alt: "SundayEmpire mascot",
  },
} as const;

const SIZE_CONFIG = {
  sm: { width: 48, height: 48 },
  md: { width: 64, height: 64 },
  lg: { width: 96, height: 96 },
  xl: { width: 128, height: 128 },
} as const;

/**
 * SundayEmpire mascot logo component.
 * 
 * APPROVED USE ONLY:
 * - Empty states and no-data cards
 * - Onboarding flows and welcome screens  
 * - Error boundaries and not-found pages
 * - Supportive illustrations (non-operational contexts)
 * - Optional splash moments
 * 
 * FORBIDDEN CONTEXTS:
 * - Dense tables or operational data surfaces
 * - Trade validation or review panels
 * - Compliance panels or cap management
 * - Destructive/critical error flows
 * - Trust-critical operational workflows
 * - As the dominant shell identity (use BrandWordmark/BrandBadge)
 * 
 * This component enforces appropriate usage through the required `context` prop
 * and should never appear in serious operational contexts.
 */
export function BrandMascot({
  variant = "default",
  size = "md",
  context,
  className,
  ...props
}: BrandMascotProps) {
  const config = MASCOT_CONFIG[variant];
  const dimensions = SIZE_CONFIG[size];

  // Validate appropriate context usage
  const validContexts: BrandMascotContext[] = ["empty-state", "onboarding", "support", "illustration"];
  if (!validContexts.includes(context)) {
    console.warn(`BrandMascot: Invalid context "${context}". Use only for approved secondary contexts.`);
  }

  return (
    <Image
      src={config.src}
      alt={config.alt}
      width={dimensions.width}
      height={dimensions.height}
      className={className}
      {...props}
      data-brand-context={context}
    />
  );
}