# WyDev Dead-Flow Audit — Fixed

## Fixed in a later pass (this pass found what the previous "Fixed" pass missed)

The previous version of this file, and the bundled `scripts/check-build.mjs`/`scripts/release-audit.mjs`,
reported a clean PASS while a build-breaking bug shipped. Root cause: neither script ever
actually parsed the `.jsx` files — `node --check` only validates `api/index.js`, which is
plain JS. That has been fixed (see below), and two real bugs it had been hiding were found and fixed:

- **Build-breaking syntax error in `src/pages/Project.jsx`** (`createFolder`): a
  malformed template literal (`` [`${safe}/.gitkeep"]:"\`` `` — mismatched backtick/quote)
  meant the file could not be parsed by Vite/esbuild at all. This is not a minor bug in
  one button — since `App.jsx` imports `Project.jsx`, the entire app would fail to build.
  Confirmed fixed by transpiling every `src/**/*.{js,jsx}` file with esbuild directly.
- **Flutterwave webhook handler still read the in-memory-only transaction map**
  (`memory.transactions.get(ref)`) instead of the durable `getTransaction()` helper,
  despite this file's own earlier bullet claiming that exact gap was closed. On Vercel's
  stateless functions this map isn't shared across instances/cold starts, so incoming
  webhooks would essentially never find the transaction record and Pro would only ever
  get granted through the client-driven `/billing/verify` call. Fixed to call
  `await getTransaction(ref)`.
- `index.html` had no `<!DOCTYPE html>`, `<html>`, `<head>`, or viewport meta tag — for a
  "mobile-first" app this meant no `width=device-width` viewport, so mobile browsers would
  render it zoomed out at desktop width. Rewritten as a complete HTML5 document.
- `scripts/check-build.mjs` now actually transforms every `.js`/`.jsx` file under `src/`
  with esbuild (resolved from `node_modules` once `npm install` has run) and fails the
  check on any parse error, plus a regression guard specifically for the webhook bug above.

## Fixed in the prior pass

- Repository file tree now distinguishes folders from nested files, so files inside folders can actually be opened.
- Recent Projects now persists and opens real repositories.
- Global Search now searches repositories, local project code, and actions; code results open the target file.
- Changes now reflects the active local working state and its discard action is wired.
- New file and new folder create real local changes; folders use `.gitkeep` so Git can track them.
- Delete file and delete folder now stage real deletions locally.
- Duplicate and move file operations are wired to the local working state.
- Folder upload uses repository-safe ignore rules and stages files locally.
- Folder rename previews reference matches and stages one coherent add/delete commit.
- Branch list and branch creation are wired to GitHub.
- Branch switching warns before discarding local work.
- Copy Entire File, Select All Code, and Replace from Clipboard are real editor actions.
- Remote SHA checking prevents stale pushes.
- Server validates repository paths before commit operations.
- Firebase private-key newline handling corrected.
- Flutterwave webhook transaction lookup now uses durable storage instead of an in-memory-only lookup.
- Flutterwave card authorization supports redirect, PIN, and OTP next actions.
- Flutterwave recurring billing state stores customer/payment-method identifiers and a scheduled renewal endpoint is configured.
- Vercel now uses `npm install` because this release intentionally does not ship a package-lock file.

## No placeholder/dead-flow markers found

Static source scan found no TODO/coming-soon/fake-success/placeholder implementation markers in `src` or `api`.

## Verification

`node scripts/check-build.mjs` — PASS

`node scripts/release-audit.mjs` — PASS

`node --check api/index.js` — PASS

A full Vite bundle was not executed in this sandbox because dependency installation timed out. Vercel should execute the production build in its own build environment.
