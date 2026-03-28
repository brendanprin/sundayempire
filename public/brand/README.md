# SundayEmpire Brand Assets

This directory contains the official SundayEmpire brand assets organized for implementation in the dynasty football application.

## Directory Structure

```
public/brand/
├── wordmark/           # Primary brand wordmarks
├── badge/              # Compact badge marks  
├── mascot/             # Secondary mascot marks
├── icons/              # App icons and favicons
└── reference/          # Brand reference materials
```

## Asset Usage

### Wordmark (`/wordmark/`)
- **Primary Wordmark**: Login, auth pages, major shell branding  
- **Wordmark with Badge**: Alternate primary mark with badge included

### Badge (`/badge/`)
- **Default Badge**: Favicon, app icon, compact navigation
- **Monochrome Badge**: Single-color contexts, overlays

### Mascot (`/mascot/`)  
- **Color Mascot**: Empty states, onboarding, supportive illustrations ONLY
- **Monochrome Mascot**: Single-color empty states
- **FORBIDDEN**: Trade validation, compliance panels, destructive flows

### Icons (`/icons/`)
- **App Icons**: Optimized for various platforms and sizes
- **Touch Icons**: Mobile app icon references

### Reference (`/reference/`)
- **Color Palette**: Visual reference for brand colors
- **Brand Board**: Complete brand system overview  
- **Usage References**: Logo and mascot usage guidelines

## Implementation Notes

- All assets are temporary raster implementations  
- Final production marks may be recreated as clean SVG assets
- Use centralized brand components (BrandWordmark, BrandBadge, BrandMascot) rather than direct asset imports
- Follow brand usage rules defined in brand-implementation-adr.md

## Asset Optimization

Current assets are reference quality. Before production deployment:
- [ ] Optimize image sizes for web delivery
- [ ] Generate responsive image variants  
- [ ] Create favicon package with multiple formats
- [ ] Consider SVG conversion for scalable marks