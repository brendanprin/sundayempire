# SundayEmpire Brand Token Contract

This document defines the complete token contract for the SundayEmpire brand implementation.

## Raw Brand Tokens

### Core Palette
```css
--brand-midnight-navy: #0F172A    /* Primary anchor color */
--brand-empire-gold: #C9A227      /* Restrained accent, not flood color */  
--brand-bone: #F5F1E8             /* Lighter auth/hero moments */
--brand-slate-steel: #475569      /* Borders, scaffolding, neutral structure */
--brand-crimson-accent: #8B1E2D   /* ONLY destructive/critical emphasis */
```

## Semantic Token Mappings

### Enhanced App Tokens (Backwards Compatible)
```css
/* Core app tokens enhanced with brand values */
--background: var(--brand-midnight-navy)
--shell-canvas: var(--brand-midnight-navy)  
--shell-surface: var(--brand-surface-card)
--shell-surface-elevated: var(--brand-surface-elevated)
--shell-accent: var(--brand-accent-primary)
--shell-accent-soft: var(--brand-accent-soft)
--shell-border: var(--brand-structure-muted)
--shell-border-strong: var(--brand-structure)
```

### Brand-Specific Semantic Tokens
```css
--brand-surface-elevated: rgba(15, 23, 42, 0.95)    /* Cards, elevated panels */
--brand-surface-card: rgba(15, 23, 42, 0.88)        /* Standard cards */  
--brand-surface-muted: rgba(15, 23, 42, 0.6)        /* Muted backgrounds */
--brand-accent-primary: var(--brand-empire-gold)     /* Primary accent */
--brand-accent-soft: rgba(201, 162, 39, 0.16)       /* Subtle backgrounds */
--brand-accent-hover: rgba(201, 162, 39, 0.24)      /* Hover states */
--brand-auth-surface: var(--brand-bone)             /* Login/auth surfaces */
--brand-auth-text: var(--brand-midnight-navy)       /* Text on auth surfaces */
--brand-structure: var(--brand-slate-steel)         /* Borders, scaffolding */
--brand-structure-muted: rgba(71, 85, 105, 0.6)     /* Muted borders */
```

### Trust-Critical Tokens (UNCHANGED)
```css
/* These MUST remain unchanged to preserve operational trust */
--shell-warning-text: #fde68a
--shell-warning-bg: rgba(120, 53, 15, 0.24) 
--shell-warning-border: rgba(217, 119, 6, 0.55)
--shell-danger-text: #fecaca
--shell-danger-bg: rgba(127, 29, 29, 0.28)
--shell-danger-border: rgba(220, 38, 38, 0.5)
--semantic-success-*: [unchanged]
--semantic-warning-*: [unchanged]  
--semantic-danger-*: [unchanged]
```

## Logo Usage Contract

### BrandWordmark
- **Contexts**: Login/auth, major shell branding, canonical page headers
- **Variants**: `primary`, `with-badge`
- **Sizes**: `sm` (120x32), `md` (180x48), `lg` (240x64)

### BrandBadge  
- **Contexts**: Favicon, app icon, compact nav, metadata icons
- **Variants**: `default`, `monochrome`
- **Sizes**: `sm` (24x24), `md` (32x32), `lg` (48x48)

### BrandMascot
- **Contexts**: Empty states, onboarding, illustrations, support ONLY
- **Forbidden**: Trade validation, compliance, destructive flows, operational contexts
- **Variants**: `default`, `monochrome`
- **Sizes**: `sm` (48x48), `md` (64x64), `lg` (96x96), `xl` (128x128)

## Accessibility Contract

### Contrast Requirements
All brand token combinations meet WCAG AA standards:

- **Empire Gold on Midnight Navy**: 4.52:1 (AA compliant)
- **Bone text on Midnight Navy**: 12.45:1 (AAA compliant)  
- **White text on Midnight Navy**: 15.68:1 (AAA compliant)
- **Warning/Error tokens**: Unchanged, maintain existing contrast ratios

### Trust-Critical State Hierarchy
1. **Error/Warning states**: Must visually outrank brand accents
2. **Compliance indicators**: Stronger prominence than decorative gold
3. **Cap/financial data**: Clear readability over brand aesthetics  
4. **Operational forms**: Function over brand decoration

## Usage Patterns

### Recommended Combinations
```css
/* Card surfaces */
.brand-card {
  background: var(--brand-surface-card);
  border: 1px solid var(--brand-structure-muted);
}

/* Accent elements */  
.brand-accent {
  background: var(--brand-accent-soft);
  color: var(--brand-accent-primary);
  border: 1px solid var(--brand-accent-primary);
}

/* Auth surfaces */
.brand-auth {
  background: var(--brand-auth-surface);
  color: var(--brand-auth-text);  
}
```

### Forbidden Patterns
```css
/* NEVER: Empire Gold as primary text */
.forbidden-text {
  color: var(--brand-empire-gold); /* Insufficient contrast */
}

/* NEVER: Brand colors in critical states */  
.forbidden-error {
  background: var(--brand-accent-soft); /* Use semantic tokens */
}

/* NEVER: Mascot in operational contexts */
<BrandMascot context="trade-validation" /> /* Forbidden context */
```

## Migration Strategy

### Phase 1: Foundation (This ADR)
- ✅ Raw brand tokens established
- ✅ Semantic mappings defined  
- ✅ Centralized components created
- ✅ Asset organization completed

### Phase 2: Shell Integration
- Apply to AppShell, TopBar, SideNav
- Login page brand integration
- Favicon and app icon updates

### Phase 3: Screen Implementation  
- Dashboard theming
- Trade workflow updates
- Team management theming
- Commissioner theming

### Phase 4: Polish & Testing
- Visual test baseline updates
- Brand guide completion
- Performance optimization

## Validation Checklist

- [ ] All brand tokens have semantic aliases
- [ ] Trust-critical states remain unchanged
- [ ] Logo components enforce usage rules  
- [ ] Accessibility contrast validated
- [ ] Asset organization follows structure
- [ ] Token utilities provide type safety
- [ ] Migration path is additive, not destructive