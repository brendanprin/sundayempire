# Smoke Test Suite Documentation

## Overview

The Smoke Test Suite is a comprehensive Playwright end-to-end testing framework designed specifically for the SundayEmpire Dynasty League App MVP. It exercises the highest-value end-to-end workflows while capturing screenshots, videos, and traces for UI/UX review.

## Purpose

This is not a generic UI smoke suite. It reflects the app's documented MVP workflows and trust boundaries:
- Manager dashboard → team detail → previews
- Trade build/submit/review workflows
- Rookie draft setup/room/select/pass
- Veteran auction setup/room/bid/award  
- Commissioner lifecycle management
- League activity feed and audit visibility
- Regular-season mirror-only posture validation

## Test Specifications

### Core Smoke Tests

1. **auth.manager-login-and-league-entry.spec.ts**
   - Manager login flow
   - League directory navigation
   - Dashboard entry verification

2. **dashboard-to-roster-to-player-previews.spec.ts**
   - Navigation from dashboard to roster
   - Player detail access
   - Cut/tag/option previews (read-only)

3. **rules-and-deadlines-read-model.spec.ts**
   - Backend state rendering
   - Phase and deadline display
   - Non-placeholder content validation

4. **commissioner-lifecycle-control.spec.ts**
   - Commissioner access verification
   - Phase transition capabilities
   - Readiness/blocker messaging

5. **trade-happy-path-build-submit-review.spec.ts**
   - Legal trade construction
   - Validation and impact analysis
   - Submission and review flow

6. **trade-blocked-path.spec.ts**
   - Blocked trade scenarios
   - Remediation guidance
   - Proper UI state handling

7. **rookie-draft-setup-and-selection.spec.ts**
   - Draft setup interface
   - Player selection workflow
   - Board persistence validation

8. **activity-feed-and-audit-visibility.spec.ts**
   - Manager-safe activity feeds
   - Commissioner audit access
   - Proper role separation

## Getting Started

### Prerequisites

1. **Database Seeding**: Ensure the database is properly seeded
   ```bash
   npm run db:reset
   npm run db:seed
   ```

2. **Development Server**: Start the application
   ```bash
   npm run dev -- --port 3000
   ```

### Running Smoke Tests

```bash
# Run all smoke tests
npm run test:smoke

# Run smoke tests with browser UI visible
npm run test:smoke:headed

# Debug smoke tests step by step
npm run test:smoke:debug

# Update visual snapshots
npm run test:smoke:update
```

### Environment Variables

- `PLAYWRIGHT_BASE_URL`: Override base URL (default: http://127.0.0.1:3000)
- `PHASE6_APPLY_RESTORE`: Enable snapshot restore operations

## Artifacts and Evidence

### Screenshot Capture
- Full-page screenshots captured at key workflow stages
- Consistent naming: `{test-title}-{stage}-{timestamp}.png`
- Stored in: `artifacts/smoke/{project}/`

### Video Recording  
- Automatically captured for all smoke test runs
- Full workflow coverage from start to finish
- Maintained in Playwright's standard output directory

### Traces
- Always enabled for smoke tests
- Network requests, DOM interactions, console logs
- Essential for debugging workflow failures

### Machine-Readable Summaries
- JSON summaries generated for each test spec
- Include execution status, duration, evidence paths
- Format: `{test-title}-summary.json`

Example summary:
```json
{
  "specName": "auth.manager-login-and-league-entry",
  "status": "passed",
  "duration": 15420,
  "evidence": {
    "screenshots": ["path1.png", "path2.png"],
    "videoPath": "video.webm",
    "tracePath": "trace.zip"
  },
  "timestamp": "2026-03-24T10:30:00.000Z"
}
```

## Architecture

### Shared Helpers

- **smoke-auth.ts**: Authentication, login workflows, role management
- **smoke-fixtures.ts**: Test data setup, trade creation, league state management  
- **smoke-evidence.ts**: Screenshot capture, video management, summary generation

### Test Structure

Each smoke test follows this pattern:
1. **Setup**: Page configuration, authentication
2. **Navigation**: Route to target workflow
3. **Interaction**: Exercise core functionality
4. **Validation**: Verify expected outcomes
5. **Evidence**: Capture screenshots and state
6. **Cleanup**: Save summaries and dispose resources

### Selectors Strategy

Tests prefer semantic, stable selectors:
- `getByRole()` for interactive elements
- `getByLabel()` for form controls
- `getByText()` with precise expectations
- `getByTestId()` for custom test hooks
- Avoid brittle CSS selectors

## Product Rules Preserved

### Backend State Authority
- No assumptions about client-only state
- Database/read-model is authoritative
- UI reflects backend state accurately

### Blocked Workflow Integrity
- Blocked states show truthful conditions
- No misleading positive CTAs in blocked states
- Clear remediation guidance provided

### Preview Flow Safety
- Cut/tag/option previews are read-only
- Non-mutating operations verified
- State persistence after refresh validated

### Regular Season Mirroring
- App mirrors host-platform roster state
- No direct roster editing behavior
- Clear phase/deadline context maintained

### Role-Based Visibility
- Manager activity feed excludes commissioner-only events
- Commissioner audit shows richer rationale
- Proper access control enforcement

## Troubleshooting

### Common Issues

**Database State**: If tests fail due to missing data:
```bash
npm run db:reset
npm run fixtures:demo
```

**Network Timeouts**: Increase timeout in `playwright.config.ts`:
```typescript
use: {
  timeout: 30000,
  actionTimeout: 10000
}
```

**Visual Differences**: Update snapshots after intentional UI changes:
```bash
npm run test:smoke:update
```

### Debug Mode

Use debug mode for step-by-step inspection:
```bash
npm run test:smoke:debug
```

This opens the Playwright inspector with:
- Step-by-step execution
- DOM inspection capabilities
- Network tab monitoring
- Console log access

## Best Practices

### Test Maintenance
- Keep selectors semantic and stable
- Avoid overfitting to specific layouts
- Test business logic, not implementation details
- Maintain helper abstractions for common workflows

### Evidence Collection
- Capture screenshots at meaningful stages
- Use descriptive names for evidence files
- Include error context in summaries
- Preserve artifacts for UI/UX review

### Performance
- Run smoke tests sequentially for stability
- Use API helpers for complex setup when possible
- Keep test independence (no shared state)
- Clean up resources properly

## Integration with CI/CD

Configure smoke tests to run on:
- Pre-release validation
- Nightly builds
- Post-deployment verification
- UI/UX review preparation

Example GitHub Actions integration:
```yaml
- name: Run Smoke Tests
  run: npm run test:smoke
  
- name: Upload Smoke Evidence
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: smoke-test-evidence
    path: artifacts/smoke/
```

## Future Enhancements

Potential additions to the smoke suite:
- Deep-link validation
- Mobile workflow testing
- Performance benchmarking
- Accessibility compliance
- Cross-browser compatibility

The smoke test suite is designed to grow with the application while maintaining focus on the core MVP workflows and business-critical user journeys.