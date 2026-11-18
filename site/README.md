# Chain Site

This folder contains the Bitsocial Chain landing site served from `https://chain.bitsocial.net/`: the public page for BSO, the immutable ERC-20 already live on Ethereum, and Bitsocial Chain, the proposed Ethereum L2 appchain. The chain itself is not built here; its proof of concept is the rest of this repository (see the root [`README.md`](../README.md)). The site moved here from `chain/` in [`bitsocialnet/bitsocial-web`](https://github.com/bitsocialnet/bitsocial-web) with its history.

## What Lives Here

- React application source in [`src`](./src), with one component per page section in [`src/sections`](./src/sections)
- Static assets, translations, and the generated `llms.txt` / `llms-full.txt` in [`public`](./public)
- Vite and Tailwind config for the site

## Development

The site is a standalone Yarn 4 project with its own `package.json`, `yarn.lock` and `.yarnrc.yml`. It is not part of the npm workspaces at the repository root, so run every command from this folder with Corepack, never npm:

```bash
cd site
corepack yarn install
corepack yarn start
corepack yarn build
```

`start` serves the Vite dev server behind Portless at `https://chain.bitsocial.localhost` (`PORTLESS=0` falls back to a plain `127.0.0.1` port, `CHAIN_PORT` or 5173 by default). `build` typechecks [`tsconfig.json`](./tsconfig.json) and writes the static build to `dist/`; `corepack yarn typecheck` runs the typecheck alone.

## Important Notes

- The site is static, with no router, SSR, or backend. It has four HTML entries: the landing page ([`index.html`](./index.html)), whose sections are addressed by hash anchors, the rich list ([`rich-list/index.html`](./rich-list/index.html)) at `/rich-list/`, the price chart ([`chart/index.html`](./chart/index.html)) at `/chart/`, and the .bso domains page ([`domains/index.html`](./domains/index.html)) at `/domains/`.
- The domains page registers `.bso` names in the [BSIP-13](https://bsips.bitsocial.net/bsip-13) registry from the visitor's own wallet (EIP-6963, or `window.ethereum`), with no backend: lookups, the activity feed and the fee Safe's threshold are read from Ethereum through public RPCs, and the commit-reveal secret is kept in localStorage until the claim is revealed. Labels are ENS-normalized before anything is committed, as BSIP-13 requires. The registry's address and deployment block are `DEPLOYED_REGISTRY` in [`src/lib/names/registry.ts`](./src/lib/names/registry.ts); until it is set, the page checks spelling and prices and says registration opens soon. `?name=` and `?for=profile` prefill the page, so apps can link to a name.
- The rich list renders from the committed snapshot in [`src/data/bso-holders.json`](./src/data/bso-holders.json), then refreshes balances and the price from Blockscout's public API in the browser every five minutes. Refresh the fallback snapshot with `corepack yarn rich-list:snapshot`. Which wallets are linked, and the evidence for each link, is curated research in [`src/lib/rich-list/data.ts`](./src/lib/rich-list/data.ts) and never updates on its own.
- The holders table's History column draws each major wallet's daily balance since 2022 from [`src/data/bso-holder-history.json`](./src/data/bso-holder-history.json). That file is a separate chunk, downloaded only when the table nears the viewport, then topped up from Blockscout's public API with every BSO transfer after its snapshot block. `corepack yarn rich-list:history` rebuilds it by replaying every Transfer of all three contracts, from Routescan (Avalanche) and Blockscout (Ethereum); the two retired contracts' logs are cached under `node_modules/.cache/bso-holder-history`.
- The price chart draws BSO's daily price and market cap across all three contracts with [Lightweight Charts](https://github.com/tradingview/lightweight-charts) from [`src/data/bso-price-history.json`](./src/data/bso-price-history.json), then adds the current pool's newer days from GeckoTerminal's public API every five minutes. `corepack yarn chart:snapshot` rebuilds that file from every DEX swap and every mint and burn on Routescan (Avalanche) and Blockscout (Ethereum), priced with Coinbase's hourly AVAX and ETH rates. Free price APIs only serve a pool's last 180 days, so refresh the snapshot at least that often. The first run takes a few minutes; logs of the two retired contracts are cached under `node_modules/.cache/bso-price-history`.
- Until live data arrives, views it changes are drawn hidden under a [boneyard](https://github.com/0xGF/boneyard) skeleton, so they first appear already up to date: the price chart for at most five seconds while GeckoTerminal answers, and the rich list's supply strip and holders table for at most ten while Blockscout pages through every holder. Each page's bones, in [`src/chart/bones`](./src/chart/bones) and [`src/rich-list/bones`](./src/rich-list/bones), are captured from the rendered views in English at the widths where their layout changes, listed in [`scripts/capture-bones.mjs`](./scripts/capture-bones.mjs). After changing one of those views' layout, run `corepack yarn chart:bones <url>` or `corepack yarn rich-list:bones <url>` with `start` running, passing the page's URL on the host `start` printed (worktrees get their own), and commit the result. It captures in English, in the repository's one browser slot.
- BSO is live; Bitsocial Chain is a proposal. Copy should describe the chain as a design rather than a running system unless that changes.
- The official BSO contract address, along with the token, project, and social links, is defined once in [`src/lib/site.ts`](./src/lib/site.ts). The Verify section asks readers to match the address character by character, so never hardcode it elsewhere.
- Page order comes from `SECTION_IDS` in [`src/lib/faq.ts`](./src/lib/faq.ts). Each section answers one reader question: its headline is the answer, and the question itself only appears in the FAQ index at the bottom. [`src/sections/index.tsx`](./src/sections/index.tsx) keys its components by those ids, so a section without a question, or a question without a section, fails to typecheck.
- The polygon mesh behind the hero is a 2D canvas that falls back to static SVGs without WebGL support, on constrained mobile hardware or connections, under reduced motion, or when the canvas fails to start; see [`src/lib/graphics-mode.tsx`](./src/lib/graphics-mode.tsx).

## Testing the Names Page Against a Local Chain

In development only, these variables point the names page at another chain and registry instead of mainnet (they are ignored by production builds):

```bash
VITE_NAMES_RPC_URL=http://127.0.0.1:8545   # JSON-RPC of a local node, such as Hardhat or Anvil
VITE_NAMES_CHAIN_ID=31337
VITE_NAMES_REGISTRY=0x…                     # a registry deployed to that node
VITE_NAMES_FROM_BLOCK=1                     # where the activity feed starts reading
```

A wallet in the browser has to be on the same chain; the page asks it to add and switch to the local chain.

## Translations

All copy, including the sections and FAQ, is read through i18next from `public/translations/{lang}/default.json`. English (`en`) is the source for the other 35 locales. The language resolves from `?lang=`, then localStorage, then the browser locale, and RTL locales flip the document direction. For workflow details, see [`docs/agent-playbooks/translations.md`](https://github.com/bitsocialnet/bitsocial-web/blob/master/docs/agent-playbooks/translations.md) in bitsocial-web. To change one key in every locale, use [`scripts/update-translations.js`](./scripts/update-translations.js).

## LLM Indexes

[`scripts/generate-llms-files.mjs`](https://github.com/bitsocialnet/bitsocial-web/blob/master/scripts/generate-llms-files.mjs) in bitsocial-web builds `public/llms.txt` and `public/llms-full.txt` from the English translations plus the structure of `index.html`, `src/App.tsx`, `src/sections/`, and `src/lib/faq.ts`. The FAQ's Ask ChatGPT row points assistants at those files. The generator parses source text, so it fails when:

- the `<title>` or meta description in `index.html` drifts from `meta.title` / `meta.description` in the English copy
- `SECTION_IDS` stops using double-quoted ids, or a `useSectionCopy` entry stops being shaped as `{ eyebrow: t("key"), question: t("key") }`
- a FAQ entry has no rendered section, or a section has no FAQ entry

The generator also reads the other Bitsocial sites, so it has not moved here and does not run from this repository. After changing English copy or section structure, regenerate both files with it and commit the result here.

## Newsletter Env Vars

The mailing list form stays disabled unless the build includes (see [`.env.example`](./.env.example)):

```bash
VITE_NEWSLETTER_SUBSCRIBE_URL=https://newsletter.bitsocial.net/api/bso/subscribe
VITE_NEWSLETTER_LIST_UUIDS=<list-uuid>
```

`VITE_NEWSLETTER_LIST_UUIDS` accepts a comma-separated list. Set `VITE_NEWSLETTER_CONFIRMATION_REQUIRED=true` only when the backend really uses a double opt-in flow.

## Verification

From this folder: `corepack yarn typecheck`, `corepack yarn lint`, `corepack yarn format:check`, `corepack yarn knip`, `corepack yarn test` and `corepack yarn build`, which the Site checks workflow also runs for every change under `site/`. `corepack yarn doctor` covers `src`. For React profiling, use `corepack yarn perf:record --target chain` against the dev server or `corepack yarn build:profile` for a production profiling build in `dist-profile/`. Dependency changes keep `corepack yarn deps:check-pinned` and `corepack yarn deps:check-hardened` passing.

## License

The site is licensed under [AGPL-3.0-only](./LICENSE), as it was in bitsocial-web. The rest of this repository is GPL-3.0-or-later.
