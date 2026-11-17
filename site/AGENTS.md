# AGENTS.md

Instructions for agents working on the Bitsocial Chain landing site in `site/`. Explicit user instructions take precedence. Read [README.md](README.md) for how the site works.

## Boundaries

- `site/` is a standalone Yarn 4 project, licensed AGPL-3.0-only. The rest of the repository is an npm-workspaces proof of concept under GPL-3.0-or-later. Do not add `site` to the root workspaces, run npm inside `site/`, or run Yarn at the repository root.
- Preserve static deployment and the three existing pages (`/`, `/rich-list/`, `/chart/`). Vercel builds this folder as the root directory; see [vercel.json](vercel.json).
- BSO is live; Bitsocial Chain is a proposal. Do not build authentication, governance, token dashboards, or backend services here.

## Packages and dependencies

- Use Yarn 4 via Corepack (`corepack yarn ...` from `site/`), never `npm` or `bun`.
- Use exact versions in `dependencies`, `devDependencies`, and `optionalDependencies`. No `^`, `~`, ranges, or tags.
- Keep the registry hardening in `.yarnrc.yml`: exact-version defaults, checksum verification, and the 3-day `npmMinimalAgeGate`. Document the reason before adding a preapproval exception.
- After changing `package.json`, run `corepack yarn install` and keep `yarn.lock` in sync. Keep `corepack yarn deps:check-pinned` and `corepack yarn deps:check-hardened` passing.

## Code

- Use `@/` imports for `src/**`.
- Do not use `useEffect` to synchronize state that can be derived during render.
- Preserve `prefers-reduced-motion` fallbacks when adding or changing animation.
- All copy goes through i18next in `public/translations/{lang}/default.json`; English is the source.
- Add comments only for non-obvious reasoning, constraints, or tradeoffs.

## Verification

Run from `site/`, choosing by impact: `corepack yarn typecheck`, `corepack yarn lint`, `corepack yarn format:check`, `corepack yarn knip`, `corepack yarn test`, `corepack yarn build`. For React changes, `corepack yarn doctor:check` and `corepack yarn perf:check`. Run browsers one at a time through `./scripts/pw-session.sh`; the slot is machine-wide.

## Git

- Conventional Commits titles (`feat(site): ...`, `fix(site): ...`); use `perf` for performance work.
- Never commit secrets. Never push unless the user asks.
