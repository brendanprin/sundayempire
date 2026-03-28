"use client";

import Image from "next/image";
import { type ComponentProps } from "react";

type BrandWordmarkVariant = "primary" | "with-badge";
type BrandWordmarkSize = "sm" | "md" | "lg";

interface BrandWordmarkProps extends Omit<ComponentProps<typeof Image>, "src" | "alt"> {
  variant?: BrandWordmarkVariant;
  size?: BrandWordmarkSize;
}

const WORDMARK_CONFIG = {
  primary: {
    src: "/brand/wordmark/sundayempire-logo-primary-wordmark.png",
    alt: "SundayEmpire",
  },
  "with-badge": {
    src: "/brand/wordmark/sundayempire-logo-primary-with-badge.png", 
    alt: "SundayEmpire",
  },
} as const;

const SIZE_CONFIG = {
  sm: { width: 120, height: 32 },
  md: { width: 180, height: 48 },
  lg: { width: 240, height: 64 },
} as const;

/**
 * SundayEmpire primary brand wordmark component.
 * 
 * Use for:
 * - Login and auth branding
 * - Major shell branding
 * - Canonical page headers where space allows
 * 
 * Do not use:
 * - In compact navigation (use BrandBadge instead)
 * - In mobile contexts where space is limited
 * - As a generic logo replacement without considering context
 */
export function BrandWordmark({
  variant = "primary",
  size = "md", 
  className,
  ...props
}: BrandWordmarkProps) {
  const config = WORDMARK_CONFIG[variant];
  const dimensions = SIZE_CONFIG[size];

  return (
    <Image
      src={config.src}
      alt={config.alt}
      width={dimensions.width}
      height={dimensions.height}
      className={className}
      priority
      {...props}
    />
  );
}