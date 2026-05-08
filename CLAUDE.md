# How I Work
I'm not technical - I don't read or understand code.

# Product Spec
- The master product spec is `docs/product-spec-v1.md`. Read it before making any product decisions (features, scoring, pricing, scope, priorities).
- When running `.ceo` or `/plan-ceo-review`, ALWAYS read `docs/product-spec-v1.md` first. Challenge ideas against the spec's goals, non-goals, and build sequence.
- Companion technical docs (schema, migration, email, integration) live in `docs/`. The growth/sales playbook lives in `docs/miners-growth-sprint/`.
- Archived docs (superseded by the product spec) live in `docs/archive/`.

# Planning Rules
- Plain English only, NO code snippets
- Simple language, numbered steps
- When you are in 'Plan mode', always stress test your plan and triple check its robustness, and always evaluate to ensure the implementation won't break anything else (includes interfaces - desktop vs. mobile)
- Always explain plans and answers in plain, simple English. Short sentences. No jargon. Like talking to a smart 15-year-old. Be concise.

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
When the user types any of these, immediately execute the action - no questions asked:
- **`.help`** → List all available quick commands with descriptions. Just print the table below, nothing else.
- **`.3`** → Start the dev server on the first available port. Steps:
  1. Check ports 3000-3009 and pick the first one not in use
  2. If this is the main repo (not a worktree), prefer port 3000: kill anything on 3000 first, then use it
  3. Run `PORT={port} npm run dev` in the background
  4. Confirm it started and print the URL with the actual port number
- **`.p`** → Prep for shipping. Run in this exact order:
  1. Run `/simplify` on all changed files to clean up the code
  2. Run `npm run build` to verify nothing broke
  3. Run `/review` on the branch diff to catch logic errors or security issues
  4. Check for sensitive files (`.env`, API keys, secrets, credentials) not in `.gitignore` and add them
  5. List what changed and tell me what to test in the browser
  6. Run `/fewer-permission-prompts` and suggest new permissions to add to my config
- **`.c`** → Ship to production. Assumes `.p` already ran:
  1. Delete any plan files or temporary MD files created during this feature that are no longer needed
  2. Stage changed files, write a fitting commit message, commit, and push the current branch
  3. Switch to `main`, pull latest, merge the feature branch into main (using `--no-ff`), and push main
  4. Switch back to the previous branch and merge main into it so the working branch stays up to date
  5. Check the Vercel deployment status and confirm the production build succeeded (or report any errors)
  6. If this folder is a git worktree (not the main repo), clean it up: switch back to the main repo folder, run `git worktree remove` on this folder, and confirm cleanup
  7. After pushing main, check for other active worktrees (`git worktree list`). For each one, run `git -C {worktree_path} merge origin/main` to bring them up to date. Report which worktrees were synced and any merge conflicts.
  If already on `main`, skip steps 3-4 and just commit + push main directly.
- **`.t`** → Deep testing. Run `/qa` (full QA with headless browser) and a parallel codebase audit (dead code, type safety, component complexity, CSS issues). Combine everything into one prioritized summary with a health score.
- **`.ceo`** → First read `docs/product-spec-v1.md` to ground yourself in the product goals, non-goals, and build sequence. Then run `/plan-ceo-review` on the current plan. Challenge assumptions against the spec, push for a better product, ask if this is the best version of the idea.
- **`.ui`** → Activate the UI fix workflow: First read `docs/design-system.md` for the correct values. Then read ALL component + style files, trace the full style cascade, explain the root cause, then apply ONE targeted fix following the design system rules. Verify at mobile widths (375px, 390px, 428px). Run the checklist at the end of the design system doc. Run type check and lint.
- **`.s`** → Run the code simplifier agent on recently modified code to make sure it's as efficient as it can be.
- **`.sim`** → Re-explain the last thing you said in plain, simple English. Short sentences. No jargon. Like you're talking to a smart 15-year-old. Be concise - if it can be said in 3 sentences, don't use 10.
- **`.w feature-name`** → Create a git worktree for parallel work. Run in this exact order:
  1. Create a new branch `feat/feature-name` from the current `main`
  2. Run `git worktree add "../Miners Location Scout NEW-feature-name" feat/feature-name`
  3. Print the full path to the new folder so the user can open a new conversation there
  4. Remind the user: "Open a new Claude Code conversation in that folder to start working. Run `.3` there to start the dev server (it auto-picks a free port)."
- **`.kill`** → Kill the local dev server. If port numbers are given (e.g. `.kill 3000 3001`), only kill those. If no port is given, scan ports 3000-3009, kill all that have a process, and confirm what was stopped.

# Available Tools & Skills
- Code simplifier plugin
- Feature development plugin
- Frontend design plugin

**REQUIRED: Use these skills EVERY time they apply, no exceptions:**
- `react-best-practices` - when writing, editing, or reviewing any React/Next.js code
- `web-design-guidelines` - when creating, editing, or reviewing any UI component
- `vercel-deploy-claimable` - when deploying the app
- `feature-dev` - when building a new feature or doing guided feature development
- `frontend-design` - when creating new frontend interfaces or pages
- `supabase` - when doing anything involving Supabase (database, auth, edge functions, RLS)
- `security-review` - when reviewing code changes for security issues
- Code simplifier plugin - when cleaning up or refactoring code
## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. The
skill has multi-step workflows, checklists, and quality gates that produce better
results than an ad-hoc answer. When in doubt, invoke the skill. A false positive is
cheaper than a false negative.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke /office-hours
- Strategy, scope, "think bigger", "what should we build" → invoke /plan-ceo-review
- Architecture, "does this design make sense" → invoke /plan-eng-review
- Design system, brand, "how should this look" → invoke /design-consultation
- Design review of a plan → invoke /plan-design-review
- Developer experience of a plan → invoke /plan-devex-review
- "Review everything", full review pipeline → invoke /autoplan
- Bugs, errors, "why is this broken", "wtf", "this doesn't work" → invoke /investigate
- Test the site, find bugs, "does this work" → invoke /qa (or /qa-only for report only)
- Code review, check the diff, "look at my changes" → invoke /review
- Visual polish, design audit, "this looks off" → invoke /design-review
- Developer experience audit, try onboarding → invoke /devex-review
- Ship, deploy, create a PR, "send it" → invoke /ship
- Merge + deploy + verify → invoke /land-and-deploy
- Configure deployment → invoke /setup-deploy
- Post-deploy monitoring → invoke /canary
- Update docs after shipping → invoke /document-release
- Weekly retro, "how'd we do" → invoke /retro
- Second opinion, codex review → invoke /codex
- Safety mode, careful mode, lock it down → invoke /careful or /guard
- Restrict edits to a directory → invoke /freeze or /unfreeze
- Upgrade gstack → invoke /gstack-upgrade
- Save progress, "save my work" → invoke /context-save
- Resume, restore, "where was I" → invoke /context-restore
- Security audit, OWASP, "is this secure" → invoke /cso
- Make a PDF, document, publication → invoke /make-pdf
- Launch real browser for QA → invoke /open-gstack-browser
- Import cookies for authenticated testing → invoke /setup-browser-cookies
- Performance regression, page speed, benchmarks → invoke /benchmark
- Review what gstack has learned → invoke /learn
- Tune question sensitivity → invoke /plan-tune
- Code quality dashboard → invoke /health
