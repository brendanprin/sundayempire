# Smoke Test Quick Start Guide

## What are Smoke Tests?

The Dynasty Football App smoke tests are end-to-end tests that exercise the most critical user workflows to ensure the MVP is release-ready. They capture screenshots, videos, and traces for UI/UX review.

## Quick Commands

```bash
# Run all smoke tests
npm run test:smoke

# Run smoke tests with visible browser
npm run test:smoke:headed  

# Debug smoke tests step-by-step
npm run test:smoke:debug
```

## Prerequisites 

1. **Database must be seeded**:
   ```bash
   npm run db:reset
   npm run db:seed
   ```

2. **Development server running**:
   ```bash
   npm run dev
   ```

## What Gets Tested

✅ Manager login and league entry  
✅ Dashboard → My Roster → Player details  
✅ Rules and deadlines display  
✅ Commissioner lifecycle controls  
✅ Trade workflows (happy path and blocked)  
✅ Draft setup and player selection  
✅ Activity feed and audit visibility  

## Evidence Captured

- **Screenshots**: Full-page captures at each workflow stage
- **Videos**: Complete workflow recordings  
- **Traces**: Network requests, DOM interactions, console logs
- **Summaries**: Machine-readable JSON reports

Evidence saved to: `artifacts/smoke/`

## If Tests Fail

1. **Check database**: Are teams, players, and picks seeded?
2. **Verify server**: Is the dev server running on port 3000?
3. **Review evidence**: Look at screenshots/videos in artifacts
4. **Debug mode**: Use `npm run test:smoke:debug` for step-by-step

## Key Product Rules

These smoke tests validate that:
- Backend state is authoritative (no client-only assumptions)
- Blocked workflows show truthful states  
- Preview flows are truly read-only
- Regular season maintains mirror-only posture
- Manager feeds exclude commissioner-only data
- Commissioner audit shows proper rationale

## Full Documentation

See `/tests/smoke/README.md` for complete documentation.