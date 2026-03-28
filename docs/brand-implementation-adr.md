# ADR: SundayEmpire Brand Implementation

**Status**: Active  
**Date**: March 23, 2026  
**Context**: Dynasty Football App UI Refresh Sprint  

## Decision

Implement the SundayEmpire brand identity across the dynasty football application while preserving operational trust and maintaining the existing semantic design token architecture.

## Problem Statement

The application currently lacks cohesive brand identity, presenting as a "generic dark admin shell." The SundayEmpire brand assets provide an opportunity to create a polished, professional control center experience that maintains trustworthiness in rules-heavy, compliance, and financial workflows.

## Brand Identity Contract

### Core Brand Elements

**SundayEmpire Brand Position**: Premium sports control center for dynasty contract football  
**Product Character**: Trustworthy, readable, operationally clear control center (NOT marketing site, NOT novelty skin)

### Raw Brand Tokens

```css
/* Official SundayEmpire Brand Palette */
--brand-midnight-navy: #0F172A    /* Primary anchor color */
--brand-empire-gold: #C9A227      /* Restrained accent, not flood color */
--brand-bone: #F5F1E8             /* Lighter auth/hero moments */
--brand-slate-steel: #475569      /* Borders, scaffolding, neutral structure */
--brand-crimson-accent: #8B1E2D   /* ONLY destructive/critical emphasis */
```

### Semantic Token Mapping Strategy

Extend existing `--shell-*` and `--semantic-*` token system:
- **Preserve** all existing semantic meanings
- **Enhance** with brand-appropriate values  
- **Maintain** trust-critical state hierarchy

```css
/* Enhanced Semantic Tokens (backwards compatible) */
--shell-canvas: var(--brand-midnight-navy)           /* Primary background */
--brand-surface-elevated: rgba(15, 23, 42, 0.95)    /* Cards, panels */
--brand-accent-primary: var(--brand-empire-gold)     /* Restrained highlights */
--brand-accent-soft: rgba(201, 162, 39, 0.16)       /* Subtle backgrounds */
--brand-auth-surface: var(--brand-bone)             /* Login, hero surfaces */
--brand-structure: var(--brand-slate-steel)         /* Borders, dividers */
```

## Logo Usage Contract

### Asset Roles

1. **Primary Wordmark** (`sundayempire-logo-primary-wordmark.png`)
   - **Use**: Login/auth branding, major shell branding, canonical page headers
   - **Context**: When space allows and prominence is appropriate

2. **Badge Mark** (`sundayempire-logo-badge.png`)  
   - **Use**: Favicon, app icon, compact nav/header, metadata icons, tight spaces
   - **Context**: Prefer over wordmark when space is limited

3. **Mascot** (`sundayempire-logo-mascot.png`)
   - **Use**: Empty states, onboarding, no-data states, support contexts ONLY
   - **Forbidden**: Dense tables, trade validation, compliance panels, destructive flows, trust-critical operational contexts
   - **Rule**: Never as main shell identity

### Asset Organization

```
public/brand/
├── wordmark/
│   ├── sundayempire-logo-primary-wordmark.png
│   └── sundayempire-logo-primary-with-badge.png
├── badge/
│   ├── sundayempire-logo-badge.png
│   └── sundayempire-logo-badge-monochrome.png  
├── mascot/
│   ├── sundayempire-logo-mascot.png
│   └── sundayempire-logo-mascot-monochrome.png
├── icons/
│   ├── favicon.ico
│   ├── apple-touch-icon.png
│   └── android-chrome-192x192.png
└── reference/
    ├── sundayempire-color-palette.png
    └── sundayempire-brand-board.png
```

## Centralized Brand Components

```typescript
// Centralized asset management
<BrandWordmark variant="primary" className="..." />
<BrandBadge variant="default" size="sm" />  
<BrandMascot context="empty-state" />
```

**Benefits**:
- Asset usage remains centralized and auditable
- Consistent sizing and responsive behavior
- Future SVG migration path is clean
- Logo placement rules enforced at component level

## Trust and Readability Guardrails

### Critical State Hierarchy

1. **Trust-critical states MUST visually outrank brand accents**
   - Error/warning colors stronger than Empire Gold
   - Compliance issues more prominent than decorative surfaces
   - Cap/contract validation clearly visible

2. **Operational clarity preserved**
   - No over-designed tables on data-dense surfaces  
   - No flashy gradients competing with functional content
   - Warning/error semantics unchanged

3. **Accessibility maintained**
   - All brand color combinations meet WCAG AA contrast requirements
   - Critical information remains readable
   - Brand accents support, never compete with, operational content

### Forbidden Combinations

- Empire Gold as primary text color (insufficient contrast)
- Brand accents in destructive/error contexts (use Crimson Accent sparingly)
- Mascot in forms, validation panels, or approval workflows
- Gold floods on operational surfaces

## Implementation Architecture

### Token Extension Strategy

1. **Phase 1** (This ADR): Establish raw brand tokens and semantic mappings
2. **Phase 2**: Apply to shell components (AppShell, TopBar, SideNav)  
3. **Phase 3**: Roll out to canonical screens with careful state preservation
4. **Phase 4**: Asset integration and visual testing updates

### Backwards Compatibility

- All existing `--shell-*` tokens remain functional
- Existing semantic categories preserved (`--semantic-success-*`, etc.)
- Component APIs unchanged
- Migration is additive, not replacement

## Success Metrics

- [ ] Brand identity recognizable in login and main shell
- [ ] Trust-critical workflows remain clearly readable  
- [ ] No degradation in operational clarity
- [ ] Logo placement follows defined rules consistently
- [ ] Token system remains maintainable and semantic

## Risks and Mitigations

**Risk**: Brand accents compete with warning/error states  
**Mitigation**: Explicit hierarchy testing and contrast validation

**Risk**: Over-branding in operational contexts  
**Mitigation**: Strict mascot usage rules and component-level enforcement

**Risk**: Asset management becomes scattered  
**Mitigation**: Centralized brand components and organized asset structure

**Risk**: Performance impact from new assets  
**Mitigation**: Optimized images, lazy loading, and essential-first loading

## Future Considerations

- **SVG Migration**: All raster assets treated as temporary, ready for vector replacement
- **Theme Extensions**: Foundation supports future light mode or custom themes
- **Mobile Optimization**: Responsive logo behavior and touch-friendly brand elements
- **Progressive Enhancement**: Core functionality works with brand assets disabled

---

**Implementation Team**: Frontend Engineering  
**Review Required**: Design System, Product, Engineering Lead
**Rollback Plan**: Token values are easily reverted; component changes are isolated