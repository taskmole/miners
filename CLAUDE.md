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

# Workflow Rules
- For multi-file changes, create a TodoWrite checklist first
- Complete each item and mark it done immediately
- Do NOT report a task as done until every single todo item is checked off
- After completing all items, re-read the todo list and confirm each one is actually done

# When Done
- Run build and fix any errors

# Available Tools
- Code simplifier plugin
- Feature development plugin
- Frontend design plugin
