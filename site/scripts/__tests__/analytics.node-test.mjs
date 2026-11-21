import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const wallet = "0xe2Eea174e91611Ee38705365C2Fa11f9C31029b1";
const origin = "https://chain.bitsocial.net";

// Stands in for @vercel/analytics and forwards every call to the current test's mocks.
const sdkStub = {
  name: "vercel-analytics-stub",
  setup(builder) {
    builder.onResolve({ filter: /^@vercel\/analytics$/ }, () => ({
      path: "vercel-analytics",
      namespace: "sdk-stub",
    }));
    builder.onLoad({ filter: /.*/, namespace: "sdk-stub" }, () => ({
      contents: `
        export const inject = (...args) => globalThis.__analyticsSdk.inject(...args);
        export const pageview = (...args) => globalThis.__analyticsSdk.pageview(...args);
        export const track = (...args) => globalThis.__analyticsSdk.track(...args);
      `,
      loader: "js",
    }));
  },
};

const bundles = new Map();
let instances = 0;

/**
 * Bundles the site's analytics module with `import.meta.env.PROD` fixed as a production or
 * development build would have it. The lazy `import("./client")` lands in the same bundle, so the
 * lazy wrapper and the client share one module instance, as they do in the browser.
 */
async function bundle(production) {
  if (!bundles.has(production)) {
    const exports = [
      'export * as lazy from "./index.ts";',
      'export * as client from "./client.ts";',
    ].join("\n");
    const { outputFiles } = await build({
      stdin: {
        contents: exports,
        loader: "ts",
        resolveDir: path.join(repoRoot, "src/lib/analytics"),
      },
      alias: { "@": path.join(repoRoot, "src") },
      bundle: true,
      define: { "import.meta.env.PROD": String(production) },
      format: "esm",
      platform: "neutral",
      plugins: [sdkStub],
      write: false,
    });
    bundles.set(production, outputFiles[0].text);
  }
  return bundles.get(production);
}

/** A fresh module instance per call, so `initialized` and the lazy client start over. */
async function load({ production = true } = {}) {
  instances += 1;
  const source = `${await bundle(production)}\n// instance ${instances}\n`;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

function replaceGlobal(t, name, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
  t.after(() => {
    if (original) {
      Object.defineProperty(globalThis, name, original);
    } else {
      delete globalThis[name];
    }
  });
}

/** Puts the test in a browser at `url` (or on a server when `url` is null) with fresh SDK mocks. */
function browserAt(t, url, { webdriver = false } = {}) {
  const sdk = { inject: t.mock.fn(), pageview: t.mock.fn(), track: t.mock.fn() };
  replaceGlobal(t, "__analyticsSdk", sdk);
  replaceGlobal(t, "window", url === null ? undefined : { location: new URL(url) });
  replaceGlobal(t, "navigator", { webdriver });
  return sdk;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const calls = (mockFn) => mockFn.mock.calls.map((call) => call.arguments);

test("chain maps its three pages and nothing else", async (t) => {
  browserAt(t, "https://chain.bitsocial.net/");
  const { client } = await load();
  const cases = [
    ["/", "/"],
    ["/index.html", "/"],
    ["/chart", "/chart"],
    ["/chart/", "/chart"],
    ["/chart/index.html", "/chart"],
    ["/rich-list", "/rich-list"],
    ["/rich-list/", "/rich-list"],
    ["/rich-list/index.html", "/rich-list"],
    ["/domains", "/domains"],
    ["/domains/", "/domains"],
    ["/domains/index.html", "/domains"],
    ["/domains/?utm_source=x#faq", "/domains"],
    [`/rich-list/?address=${wallet}#holders`, "/rich-list"],
    [`/rich-list/${wallet}`, "/not-found"],
    [`/chart/${wallet}`, "/not-found"],
    ["/projects", "/not-found"],
  ];
  for (const [pathname, sentPath] of cases) {
    assert.equal(client.getAnalyticsPath(pathname), sentPath, pathname);
    assert.equal(client.getAnalyticsPath(sentPath), sentPath, sentPath);
  }
});

test("sent URLs drop the fragment and every query parameter but non-identifying utm_ tags", async (t) => {
  browserAt(t, "https://chain.bitsocial.net/");
  const { client } = await load();
  assert.equal(
    client.getAnalyticsUrl(
      `https://chain.bitsocial.net/rich-list/?wallet=${wallet}&utm_source=x#history`,
    ),
    "https://chain.bitsocial.net/rich-list?utm_source=x",
  );
  assert.equal(
    client.getAnalyticsUrl("https://chain.bitsocial.net/chart/?theme=dark&lang=de"),
    "https://chain.bitsocial.net/chart",
  );
  assert.equal(
    client.getAnalyticsUrl(
      `https://chain.bitsocial.net/?utm_source=${wallet}&utm_medium=a%40b.co&utm_campaign=bso`,
    ),
    "https://chain.bitsocial.net/?utm_campaign=bso",
  );
  // An identifier can sit in the parameter name, so only the standard campaign tag names are kept.
  const identifyingKeys = `utm_alice%40example.com=campaign&utm_${wallet}=x&utm_id=1&utm_source=x`;
  assert.equal(
    client.getAnalyticsUrl(`https://chain.bitsocial.net/?${identifyingKeys}`),
    "https://chain.bitsocial.net/?utm_source=x",
  );
});

// The SDK clears the query when the sent path differs from location.pathname, so utm_ tags on a
// trailing-slash URL would be lost without reading them from the live location.
test("utm_ tags survive the SDK's query reset when the live location is the same page", async (t) => {
  browserAt(t, `https://chain.bitsocial.net/rich-list/?address=${wallet}&utm_source=x#history`);
  const { client } = await load();
  assert.deepEqual(
    client.sanitizeAnalyticsEvent({
      type: "pageview",
      url: "https://chain.bitsocial.net/rich-list",
    }),
    { type: "pageview", url: "https://chain.bitsocial.net/rich-list?utm_source=x" },
  );
});

// Campaign tags are free text, and the privacy page says event records never carry identifiers.
test("custom events keep only the page, without campaign tags", async (t) => {
  const url = "https://chain.bitsocial.net/rich-list/?utm_source=x";
  browserAt(t, url);
  const { client } = await load();
  const payload = { name: "newsletter_signup", data: { outcome: "success" } };
  assert.deepEqual(client.sanitizeAnalyticsEvent({ type: "event", url, payload }), {
    type: "event",
    url: "https://chain.bitsocial.net/rich-list",
    payload,
  });
});

test("beforeSend drops everything from a browser driven by automation", async (t) => {
  browserAt(t, `${origin}/`, { webdriver: true });
  const { client } = await load();
  assert.equal(client.sanitizeAnalyticsEvent({ type: "pageview", url: `${origin}/` }), null);
  assert.equal(client.sanitizeAnalyticsEvent({ type: "event", url: `${origin}/` }), null);
});

test("beforeSend lets an ordinary browser through", async (t) => {
  browserAt(t, `${origin}/`, { webdriver: false });
  const { client } = await load();
  assert.deepEqual(client.sanitizeAnalyticsEvent({ type: "pageview", url: `${origin}/` }), {
    type: "pageview",
    url: `${origin}/`,
  });
});

const excludedEnvironments = [
  ["http://localhost:5173/", true],
  ["https://chain.bitsocial.localhost/", true],
  ["https://bitsocial-chain.vercel.app/", true],
  ["https://bitsocial.net/", true],
  ["https://www.chain.bitsocial.net/", true],
  ["http://chain.bitsocial.net/", true],
  ["https://chain.bitsocial.net/", false],
  [null, true],
];

for (const [url, production] of excludedEnvironments) {
  const label = url === null ? "server rendering" : `${url} (production build: ${production})`;

  test(`sends nothing from ${label}`, async (t) => {
    const sdk = browserAt(t, url);
    const { lazy, client } = await load({ production });
    lazy.trackPageView("/");
    lazy.trackNewsletterSignup("success");
    await settle();
    assert.equal(sdk.inject.mock.callCount(), 0);
    assert.equal(sdk.pageview.mock.callCount(), 0);
    assert.equal(sdk.track.mock.callCount(), 0);
    if (url !== null) {
      assert.equal(client.sanitizeAnalyticsEvent({ type: "pageview", url }), null);
    }
  });
}

test("one page view per page with the page as its route", async (t) => {
  const sdk = browserAt(t, "https://chain.bitsocial.net/rich-list/");
  const { lazy, client } = await load();
  lazy.trackPageView("/rich-list/");
  await settle();
  assert.deepEqual(calls(sdk.inject), [
    [{ disableAutoTrack: true, beforeSend: client.sanitizeAnalyticsEvent, mode: "production" }],
  ]);
  assert.deepEqual(calls(sdk.pageview), [[{ path: "/rich-list", route: "/rich-list" }]]);
});

test("newsletter events carry only the outcome", async (t) => {
  const sdk = browserAt(t, `${origin}/`);
  const { lazy } = await load();
  lazy.trackNewsletterSignup("success");
  lazy.trackNewsletterSignup("failure");
  await settle();
  assert.deepEqual(calls(sdk.track), [
    ["newsletter_signup", { outcome: "success" }],
    ["newsletter_signup", { outcome: "failure" }],
  ]);
});

test("a failing SDK never throws or rejects into the page", async (t) => {
  const sdk = browserAt(t, `${origin}/`);
  sdk.inject.mock.mockImplementation(() => {
    throw new Error("blocked");
  });
  const first = await load();
  assert.doesNotThrow(() => first.lazy.trackPageView("/"));
  assert.doesNotThrow(() => first.lazy.trackNewsletterSignup("failure"));
  await settle();
  assert.equal(sdk.pageview.mock.callCount(), 0);
  assert.equal(sdk.track.mock.callCount(), 0);

  sdk.inject.mock.mockImplementation(() => {});
  sdk.pageview.mock.mockImplementation(() => {
    throw new Error("blocked");
  });
  sdk.track.mock.mockImplementation(() => {
    throw new Error("blocked");
  });
  const second = await load();
  assert.doesNotThrow(() => second.lazy.trackPageView("/"));
  assert.doesNotThrow(() => second.lazy.trackNewsletterSignup("success"));
  await settle();
  assert.equal(sdk.pageview.mock.callCount(), 1);
  assert.equal(sdk.track.mock.callCount(), 1);
});
