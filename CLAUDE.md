# How I Work
I'm not technical - I don't read or understand code.

# Planning Rules
- Plain English only, NO code snippets
- Simple language, numbered steps
- When you are in 'Plan mode', always stress test your plan and triple check its robustness, and always evaluate to ensure the implementation won't break anything else (includes interfaces - desktop vs. mobile)

# Permissions
- Just run commands without asking
- Always ask if you can switch to the 'dangerously skip permissions' mode

# Code Style
- Clean, well-commented, simple

# Tech Stack
- This is a Next.js / TypeScript project
- Always use TypeScript (not JavaScript) for new files
- Check existing components before choosing a styling method

# UI & Styling Rules
- Always follow the current design system and refer to `docs/design-system.md` for correct values
- When fixing UI/layout issues, ALWAYS read the FULL component file and ALL related CSS/style files BEFORE making any edits
- Trace the full style cascade including parent containers, media queries, and conditional classes
- Explain the root cause of any layout issue before proposing a fix
- Never apply small incremental CSS patches — understand the full picture first
- After making UI changes, verify the layout works at mobile widths: 375px, 390px, and 428px
- Check that no elements overflow, get cut off, or overlap at any viewport size
- Test the fix by describing the expected visual result for ALL screen sizes (mobile, tablet, desktop)
- If a user reports a layout bug persists, re-read the full component from scratch rather than patching

# Debugging Rules
- If a bug report is vague (e.g. "the button is broken"), ask WHAT is wrong and WHERE before touching code
- Keep track of what you've already tried in the current session — never repeat the same failed approach
- If a fix fails twice, stop and rethink the approach from scratch instead of making more small tweaks
- When the user says something "still doesn't work", re-read the full component from scratch — don't just tweak your last edit

# Workflow Rules
- Always create a git branch before fixing bugs or adding features
- For multi-file changes, create a TodoWrite checklist first
- Complete each item and mark it done immediately
- Do NOT report a task as done until every single todo item is checked off
- After completing all items, re-read the todo list and confirm each one is actually done
- Keep tasks small and focused — one component or one feature per session, not full codebase audits

# When Done
- Run build and fix any errors

# Quick Commands
When the user types any of these, immediately execute the action — no questions asked:
- **`.help`** → List all available quick commands with descriptions. Just print the table below, nothing else.
- **`.3`** → Kill anything on port 3000, then run `npm run dev` in the background. Confirm it started.
- **`.c`** → Full ship-to-production flow. Run git status and diff, stage the changed files, write a fitting commit message, commit, and push the current branch. Then switch to `main`, pull latest, merge the current branch into main (using `--no-ff`), and push main to trigger the Vercel production deploy. Finally, check the Vercel deployment status and confirm the production build succeeded (or report any errors). If already on `main`, skip the merge step and just commit + push main directly. Always run the code simplifier agent on the changed files BEFORE committing.
- **`.ui`** → Activate the UI fix workflow: First read `docs/design-system.md` for the correct values. Then read ALL component + style files, trace the full style cascade, explain the root cause, then apply ONE targeted fix following the design system rules. Verify at mobile widths (375px, 390px, 428px). Run the checklist at the end of the design system doc. Run type check and lint.
- **`.audit`** → Run a parallel codebase audit: spawn multiple agents simultaneously — one for dead code, one for type safety, one for component complexity, one for CSS issues. Combine findings into a single prioritized summary.
- **`.test`** → Run Playwright mobile viewport tests against localhost:3000 to verify no layout issues at 375px, 390px, and 428px widths.
- **`.s`** → Run the code simplifier agent on recently modified code to make sure it's as efficient as it can be.
- **`.sim`** → Re-explain the last thing you said in plain, simple English. Short sentences. No jargon. Like you're talking to a smart 15-year-old. Be concise — if it can be said in 3 sentences, don't use 10.
- **`.kill`** → Kill the local dev server. If port numbers are given (e.g. `.kill 3000 3001`), only kill those. If no port is given, kill all ports used by this project (3000, 3001, etc.). Confirm what was stopped.

# Available Tools & Skills
- Code simplifier plugin
- Feature development plugin
- Frontend design plugin

**REQUIRED: Use these skills EVERY time they apply — no exceptions:**
- `react-best-practices` — MUST use when writing, editing, or reviewing any React/Next.js code
- `web-design-guidelines` — MUST use when creating, editing, or reviewing any UI component
- `vercel-deploy-claimable` — MUST use when deploying the app
- Code simplifier plugin