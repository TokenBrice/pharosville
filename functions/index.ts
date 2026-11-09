import { RUNTIME_TRACKED_STABLECOINS, RUNTIME_ACTIVE_META_BY_ID } from "../shared/lib/stablecoins/runtime-registry";
import { CHAIN_META } from "../shared/lib/chains";
import { canonicalSubjectUrl, parseSubject } from "../shared/lib/selection-link";
import { nightShell, wantsNightPoster } from "./_poster";

/**
 * Per-selection social cards for the app shell at `/`.
 *
 * A link shared to one ship used to unfurl exactly like the homepage: every
 * OG/Twitter tag in `index.html` is static, so Slack, Discord and X all showed
 * "PharosVille — live Pharos stablecoin signals…" whether the sender meant the
 * harbour or meant USDC. This route rewrites the text tags for a recognised
 * `?sel=` so the preview names the thing that was actually shared.
 *
 * Deliberately text-only. `og:image` keeps pointing at the one static
 * `og-card.png` for every variant; per-coin card images are a separate and much
 * larger job.
 *
 * Route: `functions/index.ts` serves exactly `/`, and nothing else. The
 * canonical app URL is `https://pharosville.pharos.watch/`, deep links are that
 * same path plus params, and every other path (`/assets/*`, `/logos/*`, the
 * models and textures) stays on the plain static-asset path with no Function in
 * front of it. A `_middleware.ts` would have intercepted all of them to serve
 * one route's needs.
 */

interface PagesContext {
  next: (input?: Request) => Promise<Response>;
  /** Pages adds `cf` (request metadata from Cloudflare's edge); only its `timezone` is read, for the night key art. */
  request: Request & { cf?: { timezone?: unknown } };
}

/**
 * The slice of workerd's `HTMLRewriter` this route uses. Declared locally
 * because the repo does not depend on `@cloudflare/workers-types`, and one
 * route's two method calls are not worth adding it for.
 */
interface HtmlRewriterElement {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  setInnerContent(content: string, options?: { html?: boolean }): void;
}

interface HtmlRewriterInstance {
  on(selector: string, handlers: { element(element: HtmlRewriterElement): void }): HtmlRewriterInstance;
  transform(response: Response): Response;
}

declare const HTMLRewriter: new () => HtmlRewriterInstance;

export interface SocialCardCopy {
  description: string;
  title: string;
  url: string;
  subjectLine: string;
}

/** Fixed identities only; keep in step with the client's PANEL_LANDMARKS (tested below). */
const PLACE_NAMES: Record<string, string> = {
  pharos: "The Pharos lighthouse", shoals: "The Shoals", "customs-house": "Customs House", "tide-board": "Customs House",
  "storm-mast": "Storm-signal Station", "wreck-cove": "Wreck Cove", "far-ports": "The Far Ports", registry: "The Registry",
  harbourmaster: "Harbourmaster’s Office", slipway: "The Shipyard", "tide-gauge": "Tide Gauge", mint: "The Mint", burn: "The Burn",
  chartroom: "The Chart Room", keeperslog: "The Keeper’s Log", "the-roads": "The Roads",
};

/**
 * Escapes text for an HTML text node.
 *
 * Used only on the `<title>` path, which writes with `html: true` and so does
 * its own escaping or none at all. Attribute values are NOT escaped here:
 * `setAttribute` escapes what it is given, and escaping first turns `fleet's`
 * into a literal `fleet&#39;s` in the unfurl. What keeps markup out of the page
 * is upstream of both — every value written is a literal in this file or a name
 * from the checked-in fleet registry, reached only through an id that matched
 * the shared codec and resolved to a known entity.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The edge resolves static identity only; live-only subjects keep the generic shell. */
export function socialCardForSelection(rawSelection: string | null): SocialCardCopy | null {
  const subject = parseSubject(rawSelection);
  if (!subject) return null;
  let name: string, title: string, description: string;
  if (subject.kind === "ship") {
    const meta = RUNTIME_ACTIVE_META_BY_ID.get(subject.id);
    if (!meta) return null;
    name = meta.symbol === meta.name ? meta.symbol : `${meta.name} (${meta.symbol})`;
    title = `${meta.symbol} — ${meta.name} in PharosVille`;
    description = `Watch ${name} in PharosVille: the water under its hull is peg risk, the harbour it docks in is its chain, and the lighthouse beam reads the fleet's stability.`;
  } else if (subject.kind === "place") {
    if (!Object.hasOwn(PLACE_NAMES, subject.id)) return null;
    name = PLACE_NAMES[subject.id];
    title = `${name} — PharosVille`;
    description = `Explore ${name} in PharosVille, where Pharos stablecoin signals are drawn as a working port.`;
  } else if (subject.kind === "chain") {
    if (!Object.hasOwn(CHAIN_META, subject.id)) return null;
    name = CHAIN_META[subject.id].name;
    title = `${name} — PharosVille`;
    description = `Explore ${name} in PharosVille: harbours show stablecoin supply by chain.`;
  } else if (subject.kind === "yard") {
    // Reuse the registry already bundled here; the larger launch book stays out of the shell Function.
    const meta = RUNTIME_TRACKED_STABLECOINS.find((coin) => coin.id === subject.id && coin.status === "pre-launch");
    if (!meta) return null;
    name = meta.symbol === meta.name ? meta.symbol : `${meta.name} (${meta.symbol})`;
    title = `${meta.symbol} — ${meta.name} in the PharosVille Shipyard`;
    description = `Explore the Shipyard record for ${name} in PharosVille.`;
  } else return null; // Wreck narratives stay in the deferred detail chunk.
  return { title, description, url: canonicalSubjectUrl(subject), subjectLine: `Shared subject: ${name}.` };
}

function isHtmlResponse(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").toLowerCase().includes("text/html");
}

/**
 * Which tags carry the shared text. `og:image`, `og:image:alt` and the width
 * and height are all absent on purpose: the image does not change per
 * selection, so neither should anything describing it.
 */
function metaContentBySelector(card: SocialCardCopy): Record<string, string> {
  return {
    'meta[name="description"]': card.description,
    'meta[property="og:title"]': card.title,
    'meta[property="og:description"]': card.description,
    'meta[property="og:url"]': card.url,
    'meta[name="twitter:title"]': card.title,
    'meta[name="twitter:description"]': card.description,
  };
}

export function rewriteSocialCard(response: Response, card: SocialCardCopy): Response {
  // `html: true` with already-escaped text rather than the escaping text mode,
  // so this path escapes exactly once. The attribute path below escapes exactly
  // once too, in `setAttribute` — hence the raw string there.
  let rewriter = new HTMLRewriter().on("title", {
    element(element) {
      element.setInnerContent(escapeHtml(card.title), { html: true });
    },
  });

  for (const [selector, content] of Object.entries(metaContentBySelector(card))) {
    rewriter = rewriter.on(selector, {
      element(element) {
        element.setAttribute("content", content);
      },
    });
  }

  // Template contents are inert until admission chooses the welcome; no runtime or data is needed.
  rewriter = rewriter.on("#pv-shared-subject", {
    element(element) {
      element.removeAttribute("hidden");
      element.setInnerContent(escapeHtml(card.subjectLine), { html: true });
    },
  });
  return rewriter.transform(response);
}

/** The night shell's validator: the asset's own ETag marked as the night variant (weak or strong alike). */
export function nightEtag(etag: string | null): string | null {
  return etag && /"$/.test(etag) ? `${etag.slice(0, -1)}-night"` : null;
}

function ifNoneMatch(request: Request, etag: string): boolean {
  const header = request.headers.get("if-none-match");
  if (!header) return false;
  const bare = (tag: string) => tag.trim().replace(/^W\//, "");
  return header.split(",").some((tag) => tag.trim() === "*" || bare(tag) === bare(etag));
}

/**
 * E28 night key art. Before first paint the shell names the poster for the visitor's own hour (`request.cf.timezone`,
 * or a pinned `?t=`; functions/_poster.ts), so a night visit opens on the night harbour with no swap, no flash and no
 * second image request; an unknown zone keeps the day key art. The night body is a different representation of the
 * same URL, so it carries its own validator (`<asset etag>-night`, no Last-Modified) and is always built from a whole
 * asset response: a conditional request is answered here, never by replaying a body cached at another hour. The
 * security headers pass through unchanged, and nothing from the request is written into the page.
 */
async function nightResponse(context: PagesContext): Promise<Response> {
  const asset = new Request(context.request.url, { headers: context.request.headers, method: "GET" });
  for (const name of ["if-none-match", "if-modified-since", "if-match", "if-unmodified-since", "if-range"]) asset.headers.delete(name);
  const response = await context.next(asset);
  if (response.status !== 200 || !isHtmlResponse(response)) return response;
  const headers = new Headers(response.headers);
  const etag = nightEtag(headers.get("etag"));
  headers.delete("content-length");
  headers.delete("last-modified");
  if (etag) headers.set("etag", etag); else headers.delete("etag");
  if (etag && ifNoneMatch(context.request, etag)) return new Response(null, { headers, status: 304, statusText: "Not Modified" });
  return new Response(nightShell(await response.text()), { headers, status: response.status, statusText: response.statusText });
}

/**
 * Cache correctness.
 *
 * This route adds no cache entry of its own — no `caches.default` write — so it
 * introduces no HTML lifetime that could outlive a deploy and pin a stale shell
 * against fresh hashed assets. The response headers come through from the asset
 * untouched, which keeps `/`'s existing revalidation profile and the `_headers`
 * security policy exactly as they are.
 *
 * The social-card rewrite is a pure function of the `sel` query param. It
 * reads no User-Agent, no cookie, no request header at all: a crawler and a
 * visitor on the same URL get byte-identical HTML, so there is no bot variant
 * that could be stored and then served to a person. Variants cannot collide
 * either, since the query string is part of the cache key in every layer that
 * holds this (browser, Cloudflare edge, and the unfurl caches at Slack and X):
 * `?sel=ship.usdc` and `?sel=ship.usdt` are different keys.
 *
 * The night key art (E28, `nightResponse`) is the one input beyond the URL: the
 * edge's `cf.timezone` and the hour. Its body differs only in which poster
 * image the page names, never in a reading, and it carries its own ETag, so
 * the `max-age=0, must-revalidate` profile every layer applies to `/` keeps
 * each revalidation honest: a validator from the other hour never matches.
 *
 * The shell is not delayed. A day request with no `sel=`, or one naming
 * something unknown, returns the asset response object as it arrived — no
 * HTMLRewriter is constructed and no body is buffered; a night request buffers
 * the ~10 KB shell once. There is no upstream fetch on this path at any point,
 * for any request.
 */
export async function onRequest(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  const night = context.request.method === "GET"
    && wantsNightPoster({ timeZone: context.request.cf?.timezone, nowMs: Date.now(), search: url.searchParams });
  const response = night ? await nightResponse(context) : await context.next();
  if (context.request.method !== "GET" || !isHtmlResponse(response)) return response;

  const card = socialCardForSelection(url.searchParams.get("sel"));
  if (!card) return response;

  return rewriteSocialCard(response, card);
}
