"use client";

import Image from "next/image";
import { type ComponentProps } from "react";

type BrandBadgeVariant = "default" | "monochrome";
type BrandBadgeSize = "sm" | "md" | "lg";

interface BrandBadgeProps extends Omit<ComponentProps<typeof Image>, "src" | "alt"> {
  variant?: BrandBadgeVariant;
  size?: BrandBadgeSize;
}

const BADGE_CONFIG = {
  default: {
    src: "/brand/badge/sundayempire-logo-badge.png",
    alt: "SundayEmpire",
  },
  monochrome: {
    src: "/brand/badge/sundayempire-logo-badge-monochrome.png",
    alt: "SundayEmpire",
  },
} as const;

const SIZE_CONFIG = {
  sm: { width: 24, height: 24 },
  md: { width: 32, height: 32 },
  lg: { width: 48, height: 48 },
} as const;

/**
 * SundayEmpire compact badge logo component.
 * 
 * Use for:
 * - Favicon and app icons
 * - Compact navigation contexts
 * - Mobile header spaces
 * - Metadata icons
 * - When space is limited but branding is needed
 * 
 * Prefer this over BrandWordmark when:
 * - Space constraints exist
 * - Mobile/responsive contexts
 * - Small UI elements need brand presence
 */
export function BrandBadge({
  variant = "default",
  size = "md",
  className,
  ...props
}: BrandBadgeProps) {
  const config = BADGE_CONFIG[variant];
  const dimensions = SIZE_CONFIG[size];

  return (
    <Image
      src={config.src}
      alt={config.alt}
      width={dimensions.width}
      height={dimensions.height}
      className={className}
      {...props}
    />
  );
}