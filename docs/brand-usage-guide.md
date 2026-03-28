# SundayEmpire Brand Usage Guide

**Version**: 1.0  
**Last Updated**: March 23, 2026  
**For**: Dynasty League Tool Implementation  

## Brand Foundation

### Brand Character
SundayEmpire represents a **premium sports control center** for dynasty contract football. The brand embodies trustworthiness, operational clarity, and restrained sophistication—NOT a marketing site or novelty skin.

**Core Principle**: Brand elements enhance operational clarity rather than competing with functional requirements.

## Brand Components

### 1. BrandWordmark
**Usage**: Primary brand identity for auth experiences and hero moments
**Implementation**: `<BrandWordmark variant="primary|secondary" size="sm|md|lg" />`

**✅ Appropriate Contexts:**
- Login pages and auth flows
- Welcome screens and onboarding
- Primary product headers
- Marketing/landing contexts

**❌ Forbidden Contexts:**
- Dense operational tables
- Inline navigation elements  
- Form labels or functional UI
- Anywhere it competes with workflow clarity

**Technical Requirements:**
```tsx
import { BrandWordmark } from "@/components/brand";

<BrandWordmark 
  variant="primary"     // primary | secondary
  size="lg"            // sm | md | lg  
  className="optional"
/>
```

### 2. BrandBadge
**Usage**: Compact brand recognition for navigation and icon contexts
**Implementation**: `<BrandBadge variant="default|monochrome" size="sm|md|lg" />`

**✅ Appropriate Contexts:**
- Shell navigation headers
- Favicon and app icons
- Compact brand reinforcement
- Touch icons and PWA contexts

**❌ Forbidden Contexts:**  
- As dominant shell identity (use sparingly)
- Dense data contexts
- Within operational tables
- Form controls or input areas

**Technical Requirements:**
```tsx
import { BrandBadge } from "@/components/brand";

<BrandBadge 
  variant="default"     // default | monochrome
  size="sm"            // sm | md | lg
  className="optional"
/>
```

### 3. BrandMascot  
**Usage**: HIGHLY RESTRICTED to supportive illustration contexts
**Implementation**: `<BrandMascot variant="default|monochrome" size="sm|md|lg|xl" context="required" />`

**✅ APPROVED Contexts ONLY:**
- Empty states and no-data cards
- Not-found pages and error boundaries (non-critical)
- Onboarding flows and welcome screens
- Optional supportive illustrations

**❌ STRICTLY FORBIDDEN:**
- Trade validation or review panels
- Compliance panels and cap management  
- Commissioner audit and trust-critical workflows
- Dense tables or operational data surfaces
- Any context where it undermines seriousness

**Technical Requirements:**
```tsx
import { BrandMascot } from "@/components/brand";

<BrandMascot 
  variant="default"           // default | monochrome
  size="md"                  // sm | md | lg | xl
  context="empty-state"      // REQUIRED: empty-state | onboarding | support | illustration
/>
```

## Brand Tokens

### Color Usage Hierarchy

**Primary Tokens:**
```css
--brand-midnight-navy: #0F172A    /* Primary anchor */
--brand-empire-gold: #C9A227      /* Restrained accent */
--brand-bone: #F5F1E8             /* Light surfaces */
--brand-slate-steel: #475569      /* Structure */
--brand-crimson-accent: #8B1E2D   /* Critical only */
```

**Semantic Application:**
```css
/* Surface hierarchy */
--brand-surface-elevated: rgba(15, 23, 42, 0.95)   /* Main panels */
--brand-surface-card: rgba(15, 23, 42, 0.88)       /* Nested cards */
--brand-surface-muted: rgba(15, 23, 42, 0.6)       /* Backgrounds */

/* Accent usage (RESTRAINED) */
--brand-accent-primary: var(--brand-empire-gold)    /* Primary actions only */
--brand-accent-soft: rgba(201, 162, 39, 0.16)      /* Subtle highlights */
--brand-accent-hover: rgba(201, 162, 39, 0.24)     /* Interactive states */

/* Structure and typography */  
--brand-structure: var(--brand-slate-steel)         /* Borders */
--brand-structure-muted: rgba(71, 85, 105, 0.6)    /* Subtle borders */
--brand-auth-surface: var(--brand-bone)             /* Auth contexts */
--brand-auth-text: var(--brand-midnight-navy)       /* Auth text */
```

### Token Usage Rules

**✅ Use Brand Tokens For:**
- Panel backgrounds (`--brand-surface-*`)
- Border styling (`--brand-structure-*`)  
- Primary action buttons (`--brand-accent-primary`)
- Auth surface styling (`--brand-auth-*`)

**❌ Never Override:**
- Trust-critical warning/error states  
- Compliance status indicators
- Financial data text colors
- Validation message styling

## Implementation Guardrails

### Operational Trust Hierarchy

**CRITICAL**: Trust-critical states must ALWAYS visually dominate brand accents.

**Trust-Critical Elements:**
- Compliance error/warning indicators
- Trade validation blocking states  
- Cap space violations and financial warnings
- Commissioner ruling requirements
- Deadline and phase transition alerts

**Brand Subordination Rule**: If any brand element competes with operational clarity, remove or reduce the brand element.

### Accessibility Requirements

**Color Contrast**: All brand implementations must maintain WCAG AA contrast ratios
- Foreground text: 4.5:1 minimum  
- Large text (18px+): 3:1 minimum
- UI elements: 3:1 minimum

**Focus States**: Brand styling cannot interfere with focus indicators
**Screen Readers**: Brand decorative elements must not create noise

### Responsive Considerations

**Mobile Brand Strategy:**
- Prioritize functional clarity over brand presence
- BrandBadge over BrandWordmark in constrained spaces
- Never use BrandMascot in mobile dense contexts
- Maintain touch target requirements (44px minimum)

## Anti-Patterns and Warnings

### ❌ Common Misuse Examples

**Over-Branding:**
```tsx
// WRONG: Brand mascot in operational table
<table>
  <tr>
    <td><BrandMascot context="illustration" /></td>
    <td>Cap Space: $2.3M</td> 
  </tr>
</table>
```

**Brand Competing with Function:**  
```tsx
// WRONG: Empire gold competing with error state
<div style={{ color: "var(--brand-empire-gold)", backgroundColor: "red" }}>
  Compliance Error: Roster exceeds limit
</div>
```

**Inappropriate Mascot Context:**
```tsx
// WRONG: Mascot in trade validation
<BrandMascot context="support" />
<p>Trade blocked: Cap violation</p>
```

### ✅ Correct Implementation Examples

**Appropriate Badge Usage:**
```tsx
<div className="flex items-center gap-2">
  <BrandBadge variant="default" size="sm" />
  <p className="shell-kicker">Dynasty League App</p>
</div>
```

**Brand Surface with Operational Content:**
```tsx
<section style={{
  backgroundColor: "var(--brand-surface-elevated)",
  borderColor: "var(--brand-structure-muted)"
}}>
  <h2 style={{ color: "var(--foreground)" }}>Teams</h2>
  <StatusPill status="error" />
</section>
```

**Appropriate Empty State:**
```tsx
<div className="empty-state-container">
  <BrandMascot variant="default" size="lg" context="empty-state" />
  <p>No trade proposals found</p>
  <button>Create New Trade</button>
</div>
```

## Future Implementation Patterns

### New Component Integration

When adding brand integration to new components:

1. **Assess Function vs Brand**: Will brand elements interfere with operational clarity?
2. **Choose Component Tier**: Wordmark (hero), Badge (navigation), Mascot (empty), or None (functional)  
3. **Apply Token Strategy**: Use semantic tokens, never raw brand colors
4. **Validate Accessibility**: Test contrast, focus states, screen reader experience
5. **Test Trust Hierarchy**: Ensure warning/error states visually dominate

### Legacy Component Updates

When adding brand integration to existing components:

1. **Preserve Behavioral Contracts**: All existing props and functionality unchanged
2. **Additive Token Strategy**: Extend rather than replace existing styling  
3. **Backward Compatibility**: Maintain existing CSS classes for compatibility
4. **Progressive Enhancement**: Brand should enhance, not require

### Brand Extension Guidelines

**For New Features:**
- Default to conservative brand integration
- Over-communicate with trust-critical elements  
- Test with real-world operational scenarios
- Get explicit approval for mascot usage

**For Marketing/Landing:**  
- BrandWordmark as primary identity
- Empire Gold as primary accent
- Bone for light/contrast moments
- Mascot allowable for supportive illustration

## Testing and Validation

### Visual Regression Requirements

All brand implementations must pass:
- Contrast accessibility validation
- Visual regression baseline approval  
- Trust-critical state dominance testing
- Cross-device responsive validation

### Brand Consistency Audit

Regular audits should verify:
- Component usage follows approved contexts
- Token usage matches semantic intentions  
- No hardcoded brand colors outside token system
- Mascot usage remains within approved boundaries

---

**Implementation Support**: For technical questions about implementation, reference the [Brand Implementation ADR](./brand-implementation-adr.md).

**Component Library**: All brand components are centralized in `/src/components/brand/` with TypeScript interfaces and usage validation.