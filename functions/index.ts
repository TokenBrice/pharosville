import { RUNTIME_ACTIVE_META_BY_ID } from "../shared/lib/stablecoins/runtime-registry";

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
  next: () => Promise<Response>;
  request: Request;
}

/**
 * The slice of workerd's `HTMLRewriter` this route uses. Declared locally
 * because the repo does not depend on `@cloudflare/workers-types`, and one
 * route's two method calls are not worth adding it for.
 */
interface HtmlRewriterElement {
  setAttribute(name: string, value: string): void;
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
}

const CANONICAL_ORIGIN = "https://pharosville.pharos.watch";

/**
 * The shape a PharosVille detail id may take, checked before the id is looked
 * up and before any of it is used to build a URL. Membership in a known-entity
 * set is the real gate below; this is the cheap structural reject that keeps
 * anything markup-shaped, spaced or protocol-relative from reaching that far.
 */
const SELECTION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

const SHIP_ID_PREFIX = "ship.";

/**
 * Landmarks carry fixed copy because they are fixed places. Ships are looked up
 * in the checked-in fleet registry instead — see `shipCardCopy`.
 */
const LANDMARK_CARD_COPY: Record<string, Omit<SocialCardCopy, "url">> = {
  lighthouse: {
    description: "The Pharos lighthouse reads the whole fleet at once: its beam and its band carry the Pharos Stability Index, and it sweeps faster the less steady the seas are.",
    title: "The Pharos lighthouse — PharosVille",
  },
  pigeonnier: {
    description: "The pigeonnier carries word in and out of PharosVille, where live Pharos stablecoin signals are drawn as a working port.",
    title: "The pigeonnier — PharosVille",
  },
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
 * `SELECTION_ID_PATTERN` and resolved to a known entity.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function permalinkFor(selectionId: string): string {
  return `${CANONICAL_ORIGIN}/?sel=${encodeURIComponent(selectionId)}`;
}

function shipCardCopy(selectionId: string): Omit<SocialCardCopy, "url"> | null {
  const assetId = selectionId.slice(SHIP_ID_PREFIX.length);
  const meta = RUNTIME_ACTIVE_META_BY_ID.get(assetId);
  if (!meta) return null;

  const named = meta.symbol === meta.name ? meta.symbol : `${meta.name} (${meta.symbol})`;
  return {
    description: `Watch ${named} in PharosVille: the water under its hull is peg risk, the harbour it docks in is its chain, and the lighthouse beam reads the fleet's stability.`,
    title: `${meta.symbol} — ${meta.name} in PharosVille`,
  };
}

/**
 * The card for a `sel=` value, or `null` to leave the static tags alone.
 *
 * `null` is the answer for every input that is not a selection this world can
 * actually show — absent, wrongly shaped, or well-shaped but naming no known
 * entity. Chain docks fall in that last group on purpose: their ids come from
 * live `/api/chains` data, so there is no fixed set to check them against, and
 * a card is not worth a fetch on the shell route.
 *
 * The raw parameter is never echoed. Everything that reaches the page is either
 * a literal from this file or a name from the checked-in fleet registry, and
 * both are escaped anyway.
 */
export function socialCardForSelection(rawSelection: string | null): SocialCardCopy | null {
  if (!rawSelection || !SELECTION_ID_PATTERN.test(rawSelection)) return null;

  const copy = rawSelection.startsWith(SHIP_ID_PREFIX)
    ? shipCardCopy(rawSelection)
    : LANDMARK_CARD_COPY[rawSelection] ?? null;
  if (!copy) return null;

  return { ...copy, url: permalinkFor(rawSelection) };
}

/**
 * Reads `sel=` from the query string the same way `parseInitialWorldUrlState`
 * does when the search string owns the world params, so a `?sel=` link resolves
 * to the same entity on both sides of the request.
 *
 * The app's own Copy link button currently emits the HASH form
 * (`/#sel=ship.usdc`), and a fragment is never sent to a server — no Function
 * can see it. This route therefore only fires for the query form. See
 * `docs/pharosville/OPERATIONS.md`.
 */
function selectionFromUrl(url: URL): string | null {
  return url.searchParams.get("sel");
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

  return rewriter.transform(response);
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
 * The rewrite is a pure function of the `sel` query param. It reads no
 * User-Agent, no cookie, no request header at all: a crawler and a visitor on
 * the same URL get byte-identical HTML. That is what makes the route safe to
 * cache anywhere — there is no bot variant that could be stored and then served
 * to a person, so no `Vary` is needed and none is claimed. Variants cannot
 * collide either, since the query string is part of the cache key in every
 * layer that holds this (browser, Cloudflare edge, and the unfurl caches at
 * Slack and X): `?sel=ship.usdc` and `?sel=ship.usdt` are different keys.
 *
 * The shell is not delayed. A request with no `sel=`, or one naming something
 * unknown, returns the asset response object as it arrived — no HTMLRewriter is
 * constructed and no body is buffered. There is no upstream fetch on this path
 * at any point, for any request.
 */
export async function onRequest(context: PagesContext): Promise<Response> {
  const response = await context.next();
  if (context.request.method !== "GET" || !isHtmlResponse(response)) return response;

  const card = socialCardForSelection(selectionFromUrl(new URL(context.request.url)));
  if (!card) return response;

  return rewriteSocialCard(response, card);
}
