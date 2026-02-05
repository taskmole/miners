# How I Work
I'm not technical - I don't read or understand code.

# Planning Rules
- Plain English only, NO code snippets
- Simple language, numbered steps

# Permissions
- Just run commands without asking

# Code Style
- Clean, well-commented, simple

# Tech Stack
- This is a Next.js / TypeScript project
- Always use TypeScript (not JavaScript) for new files
- Check existing components before choosing a styling method

# UI & Styling Rules
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
- **`.c`** → Run git status and diff, stage the changed files, write a fitting commit message, commit, and push. Confirm success.
- **`.ui`** → Activate the UI fix workflow: read ALL component + style files first, trace the full style cascade, explain the root cause, then apply ONE targeted fix. Verify at mobile widths (375px, 390px, 428px). Run type check and lint.
- **`.audit`** → Run a parallel codebase audit: spawn multiple agents simultaneously — one for dead code, one for type safety, one for component complexity, one for CSS issues. Combine findings into a single prioritized summary.
- **`.test`** → Run Playwright mobile viewport tests against localhost:3000 to verify no layout issues at 375px, 390px, and 428px widths.
- **`.s`** → Run the code simplifier agent on recently modified code to make sure it's as efficient as it can be.
- **`.sim`** → Re-explain the last thing you said in plain, simple English. Short sentences. No jargon. Like you're talking to a smart 15-year-old. Be concise — if it can be said in 3 sentences, don't use 10.
- **`.kill`** → Kill the dev server running on port 3000. Confirm it's stopped.

# Available Tools
- Code simplifier plugin
- Feature development plugin
- Frontend design plugin
