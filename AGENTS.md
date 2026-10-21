<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Web and native parity

- Customer-facing changes must be checked in both the Next.js website and Expo native app. Treat desktop web, responsive web and native as distinct surfaces; updating the native browser preview does not update the website.
- For shared behavior, inventory all entry points (headers, home sections, directories and filter drawers), reuse shared contracts/components where appropriate, and test both consumer paths before reporting completion. State any untested paths explicitly.
- Keep GitHub and the existing Netlify preview current for delivered changes. Do not treat a local-only change or an unfinished deployment as published.
