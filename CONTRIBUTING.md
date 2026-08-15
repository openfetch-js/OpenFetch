# Contributing on GitHub

This document describes how to participate in **@hamdymohamedak/openfetch** through GitHub: issues, discussions, and pull requests.

## What we look for in changes

These rules keep reviews predictable and the library safe across runtimes:

1. **Stay on `fetch`.** Do not add XMLHttpRequest, alternate fetch shims as required dependencies, or polyfills that assume a browser.
2. **Avoid browser-only globals.** Do not reference `window`, `document`, `localStorage`, `sessionStorage`, `WebSocket`, or `EventSource` in library code.
3. **Keep the public API small.** Prefer new behavior as optional middleware or clearly documented config rather than breaking existing callers.
4. **TypeScript source of truth.** Implementation lives under `src/`; `dist/` is build output from `npm run build`.

## Reporting issues

[Open an issue](https://github.com/openfetch-js/OpenFetch/issues) on this repository with:

- Runtime and version (Node, Bun, Deno, worker, browser).
- Minimal code sample and expected vs actual behavior.
- If relevant, the target URL shape (without secrets).

## Suggesting features

Open an issue first. Describe the use case and whether it can live in userland (middleware) vs core. Large features should be agreed in an issue before a large pull request.

## Pull requests

### Branch naming

Use **one branch per concern**: one feature **or** one bug fix, not unrelated changes together.

- **Features:** `features/<short-description>` — e.g. `features/add-retry`, `features/cache-key-override`.
- **Bug fixes:** `bugs/<short-description>` — e.g. `bugs/timeout-signal`, `bugs/cache-key-collision`.

Use **kebab-case** after the prefix. Keep the slug short but specific enough that reviewers can tell what the branch is for.

### Workflow

1. **Fork** this repository and create a branch from `main` using the [branch naming](#branch-naming) rules above.
2. **Implement** in `src/`. Match existing formatting and naming.
3. **Build** locally: `npm run build` (no TypeScript errors).
4. **Document** user-visible behavior in `README.md` and, if structural, in `docs/PROJECT_FLOW.md`. Copy-paste usage belongs in `examples/`; agent skill templates belong in `skills/`.
5. **Open a pull request** into `main` with:
   - A clear title and description.
   - What changed and why.
   - Any breaking changes called out explicitly.

### Before you push

From a clone of your fork:

```bash
npm install
npm run build
npm run test:unit
npm run test:security
```

CI on GitHub Actions runs unit/conformance/security across Node versions, plus Playwright browser tests (Chromium, Firefox, WebKit) on Ubuntu. Locally, `npm run test:browser` needs Playwright browsers installed once via `npx playwright install` (or `npx playwright install --with-deps` on Linux).

### Commit messages

Use short, imperative subjects (e.g. `Add cache key override option`). Add a body when extra context helps reviewers reading the PR on GitHub.

### Code review

Maintainers may ask for tests, naming tweaks, or doc updates on the PR. Smaller, single-concern PRs are easier to review and merge.

## Code of conduct

Be respectful and professional in issues and pull requests. Focus feedback on the work, not the person.
