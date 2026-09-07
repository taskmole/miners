# AI Location Scoring - Handoff

Branch: `jaro-z/ai-location-scoring`
Last updated: 2026-08-17

## What was built

### 1. AI Scoring Pipeline
- `scripts/data-pipeline/score-listings.ts` - scores each scraped listing 0-100 with a one-line reason using Claude (currently set to Haiku 4.5, should switch to Sonnet 5)
- Runs automatically after each scrape via `.github/workflows/scraper-pipeline.yml`
- Stores results in the existing `image_analysis.text` JSONB column on the `places` table
- `continue-on-error: true` so scoring failures never block the digest email
- Requires `ANTHROPIC_API_KEY` GitHub secret (not yet added)

### 2. Revenue Model
- `scripts/data-pipeline/lib/revenue-model.ts` (pipeline copy)
- `src/lib/revenue-model.ts` (client copy, used by the UI)
- 4-block financial model: Traffic to Orders to Revenue to EBITDA
- Predicts monthly EBITDA and payback months from daily traffic, capture rate, avg ticket, and rent
- CZK and EUR market defaults from the Miners franchise spreadsheet
- These two files must stay in sync (cross-package import not possible due to tsconfig rootDir)

### 3. Backend Changes
- `src/app/api/db/inbox/route.ts` - added `aiScore` and `aiReason` to the inbox API response (extracted from `image_analysis.text`)
- `src/lib/digest-queries.ts` - AI score fallback for Prague (no gravity data), re-sort by score
- `src/emails/miners-digest.tsx` - revenue callout styling (currently hidden, renders when data exists)
- `scripts/data-pipeline/generate-gravity-scores.ts` - city-aware data loading, weight redistribution for missing sources

### 4. NewListingsModal (production, partially updated)
- `src/components/NewListingsModal.tsx` (935 lines) - the existing list-view modal
- Has score badges, sort by score, collapse low scorers, revenue simulator, assign/reject actions
- This is the OLD design. It has NOT been updated to the new focus triage design yet.

### 5. Focus Triage Prototype (design only, not wired to production)
- `src/app/dev-test-modal/page.tsx` - temporary QA page with mock data
- DELETE THIS FILE before merging to main
- This is the new card-by-card triage design with:
  - Photo carousel with glass score badge and district overlay
  - Rent and Est. payback stats row with Google Maps button
  - AI SUMMARY callout (green box with sparkles icon)
  - Features list (Storefront, AC, Bathroom)
  - Revenue simulator behind "Simulate revenue" toggle (traffic x capture x ticket equation)
  - Tinder-style card swipe animation on assign (card exits left with rotation)
  - Overlay bottom sheet for team/person assignment picker
  - Green toast confirmation after assignment
  - Next (skip) and Assign (primary) buttons
  - Payback color coding: green (<=24mo), amber (25-36mo), red (>36mo)
  - Works at 390px (mobile PWA) and 512px (desktop)

## What's NOT done (blockers to deploy)

### Must do:
1. **Add ANTHROPIC_API_KEY** as a GitHub secret (get from console.anthropic.com)
2. **Wire focus triage into the real NewListingsModal** - replace the 935-line list view with the card-by-card design from dev-test-modal
3. **Verify Resend email domain** - digest emails can't reach real customers without a verified sender domain in Resend
4. **Delete `src/app/dev-test-modal/`** before merging to main

### Nice to have:
5. Deep link from digest email into the app's triage modal (currently links to the portal)
6. Switch AI scorer model from Haiku 4.5 to Sonnet 5 (better reasoning, ~$2-3/month for 1000 listings)
7. Run the scorer once manually to populate existing Prague listings with scores

## Key design decisions (settled)

- Focus triage (one card at a time) over list view for the New Listings modal
- District as the headline (not the generic "Pronajem komercniho prostoru" title)
- Payback period as the primary financial signal (color-coded by tier)
- AI summary in a green callout box with sparkles icon
- Overlay bottom sheet for assignment (not inline dropdown)
- Card swipe animation on assign (Tinder-style left exit with rotation)
- Revenue simulator hidden behind toggle (it's a study tool, not a triage tool)
- Google Maps button in the stats row (right-aligned, with bg-zinc-100 container)
- Sonnet 5 for AI scoring (best value for rubric-based scoring with reasoning)

## Architecture notes

- Prague has no gravity model data. AI scoring fills the gap.
- The `image_analysis` JSONB column stores AI text scores under `.text` (vision scoring planned for `.vision` later)
- The revenue model's payback calculation divides total investment (buildout + equipment) by monthly EBITDA
- At high rents (~55k Kc) with low traffic (~3k/day), EBITDA is negative, so payback shows ">99mo"
- Small changes in capture rate near the breakeven point produce large payback swings (this is mathematically correct, not a bug)

## Files changed on this branch

### New files:
- `scripts/data-pipeline/score-listings.ts`
- `scripts/data-pipeline/lib/revenue-model.ts`
- `src/lib/revenue-model.ts`
- `src/app/dev-test-modal/page.tsx` (temporary, delete before merge)
- `docs/handoff-ai-scoring.md` (this file)

### Modified files:
- `.github/workflows/scraper-pipeline.yml`
- `package.json` / `package-lock.json`
- `scripts/data-pipeline/generate-gravity-scores.ts`
- `src/app/api/db/inbox/route.ts`
- `src/components/NewListingsModal.tsx`
- `src/emails/miners-digest.tsx`
- `src/lib/digest-queries.ts`

## GitHub secrets required

| Secret | Status | Purpose |
|--------|--------|---------|
| ANTHROPIC_API_KEY | NOT SET | AI scoring via Claude API |
| SUPABASE_PROD_URL | Already set | Database access |
| SUPABASE_SERVICE_ROLE_KEY | Already set | Database admin access |
| RESEND_API_KEY | Already set | Email sending |
| APP_URL | Already set | Deep links in emails |
| DIGEST_SECRET | Already set | Digest trigger auth |
