import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { RUNTIME_ACTIVE_STABLECOINS } from "../shared/lib/stablecoins/runtime-registry";
import { escapeHtml, onRequest, socialCardForSelection } from "./index";

const SHELL_HTML = readFileSync(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

/**
 * Stand-in for the workerd `HTMLRewriter`.
 *
 * It is not an HTML parser and does not try to be one: it matches the handful
 * of `<title>` and `<meta>` selectors this route registers and applies the
 * handlers to them. That is enough to check which tags the route touches, what
 * it writes into them, and that it leaves everything else alone — the parts
 * this repo owns. Workerd owns the parsing.
 */
class FakeHtmlRewriter {
  readonly handlers: { handler: { element(element: FakeElement): void }; selector: string }[] = [];

  on(selector: string, handler: { element(element: FakeElement): void }): this {
    this.handlers.push({ handler, selector });
    return this;
  }

  transform(response: Response): Response {
    const rewrite = async (): Promise<string> => {
      let html = await response.text();
      for (const { handler, selector } of this.handlers) {
        html = applySelector(html, selector, handler);
      }
      return html;
    };
    return new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue(new TextEncoder().encode(await rewrite()));
          controller.close();
        },
      }),
      { headers: response.headers, status: response.status, statusText: response.statusText },
    );
  }
}

interface FakeElement {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  setInnerContent(content: string, options?: { html?: boolean }): void;
}

function applySelector(
  html: string,
  selector: string,
  handler: { element(element: FakeElement): void },
): string {
  if (selector === "title") {
    return html.replace(/<title>([\s\S]*?)<\/title>/, (_match, inner: string) => {
      let content = inner;
      handler.element(makeElement(new Map(), (next) => { content = next; }));
      return `<title>${content}</title>`;
    });
  }

  const attributeMatch = /^meta\[(name|property)="([^"]+)"\]$/.exec(selector);
  if (!attributeMatch) throw new Error(`unsupported selector: ${selector}`);
  const [, keyName, keyValue] = attributeMatch;

  return html.replace(/<meta\b[^>]*>/g, (tag) => {
    const attributes = parseAttributes(tag);
    if (attributes.get(keyName!) !== keyValue) return tag;
    handler.element(makeElement(attributes, () => {
      throw new Error("setInnerContent on a meta tag");
    }));
    const serialized = [...attributes].map(([name, value]) => `${name}="${value}"`).join(" ");
    return `<meta ${serialized} />`;
  });
}

function parseAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) {
    attributes.set(match[1]!, match[2]!);
  }
  return attributes;
}

/**
 * lol-html escapes what it writes, and the route is built around that: it hands
 * `setAttribute` raw text and `setInnerContent` pre-escaped text under
 * `html: true`. A stub that stored either verbatim would agree with a route that
 * escaped twice, so it models both escaping rules.
 */
function escapeAttributeValue(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeTextContent(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function makeElement(attributes: Map<string, string>, setContent: (value: string) => void): FakeElement {
  return {
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => { attributes.set(name, escapeAttributeValue(value)); },
    setInnerContent: (content, options) => {
      setContent(options?.html ? content : escapeTextContent(content));
    },
  };
}

function makeContext(url: string, init?: { html?: string; method?: string; status?: number }) {
  const assetResponse = new Response(init?.html ?? SHELL_HTML, {
    headers: {
      "cache-control": "public, max-age=0, must-revalidate",
      "content-type": "text/html; charset=utf-8",
      "x-frame-options": "DENY",
    },
    status: init?.status ?? 200,
  });
  return {
    assetResponse,
    context: {
      next: async () => assetResponse,
      request: new Request(url, { method: init?.method ?? "GET" }),
    },
  };
}

function metaContent(html: string, selector: string): string | null {
  const attributeMatch = /^meta\[(name|property)="([^"]+)"\]$/.exec(selector)!;
  for (const tag of html.matchAll(/<meta\b[^>]*>/g)) {
    const attributes = parseAttributes(tag[0]);
    if (attributes.get(attributeMatch[1]!) === attributeMatch[2]) return attributes.get("content") ?? null;
  }
  return null;
}

function titleText(html: string): string | null {
  return /<title>([\s\S]*?)<\/title>/.exec(html)?.[1] ?? null;
}

const A_KNOWN_SHIP = RUNTIME_ACTIVE_STABLECOINS[0]!;

describe("PharosVille social card route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("socialCardForSelection", () => {
    it("builds a card naming the ship and its permalink", () => {
      const card = socialCardForSelection(`ship.${A_KNOWN_SHIP.id}`);
      expect(card).not.toBeNull();
      expect(card!.title).toContain(A_KNOWN_SHIP.symbol);
      expect(card!.title).toContain(A_KNOWN_SHIP.name);
      expect(card!.description).toContain("peg risk");
      expect(card!.url).toBe(`https://pharosville.pharos.watch/?sel=ship.${A_KNOWN_SHIP.id}`);
    });

    // Fleet ids are `usdc-circle`, not `usdc`. The runbook's verification curl
    // names this one, so it has to keep resolving for that command to mean
    // anything.
    it("resolves the hyphenated registry id form the runbook documents", () => {
      const card = socialCardForSelection("ship.usdc-circle");
      expect(card?.title).toBe("USDC — USD Coin in PharosVille");
    });

    it("builds cards for the fixed landmarks", () => {
      expect(socialCardForSelection("lighthouse")?.title).toContain("lighthouse");
      expect(socialCardForSelection("pigeonnier")?.title).toContain("pigeonnier");
    });

    it("names every active ship without ever repeating a symbol twice", () => {
      const sameNameAndSymbol = RUNTIME_ACTIVE_STABLECOINS.find((coin) => coin.name === coin.symbol);
      if (sameNameAndSymbol) {
        const card = socialCardForSelection(`ship.${sameNameAndSymbol.id}`)!;
        expect(card.description).not.toContain(`${sameNameAndSymbol.symbol} (${sameNameAndSymbol.symbol})`);
      }
      for (const coin of RUNTIME_ACTIVE_STABLECOINS) {
        expect(socialCardForSelection(`ship.${coin.id}`), coin.id).not.toBeNull();
      }
    });

    it("falls through for a missing, unknown or unresolvable selection", () => {
      expect(socialCardForSelection(null)).toBeNull();
      expect(socialCardForSelection("")).toBeNull();
      expect(socialCardForSelection("ship.not-a-real-coin")).toBeNull();
      // Chain docks are well-shaped but have no fixed id set to check against.
      expect(socialCardForSelection("dock.ethereum")).toBeNull();
      expect(socialCardForSelection("area.dews.crisis")).toBeNull();
    });

    it("rejects every markup-shaped or otherwise malformed selection", () => {
      const malformed = [
        '"><script>alert(1)</script>',
        `ship.${A_KNOWN_SHIP.id}"><script>alert(1)</script>`,
        `ship.${A_KNOWN_SHIP.id}" data-x="`,
        "<img src=x onerror=alert(1)>",
        "javascript:alert(1)",
        "//evil.example.com",
        "ship.usdc&amp;",
        "SHIP.USDC",
        "ship usdc",
        "ship.usdc\n",
        "../../etc/passwd",
        `ship.${"a".repeat(200)}`,
      ];
      for (const selection of malformed) {
        expect(socialCardForSelection(selection), selection).toBeNull();
      }
    });
  });

  describe("escapeHtml", () => {
    it("neutralises every character that could break out of a tag", () => {
      expect(escapeHtml(`<script>"&'`)).toBe("&lt;script&gt;&quot;&amp;&#39;");
    });
  });

  describe("onRequest", () => {
    it("rewrites the text tags for a known selection and leaves the image alone", async () => {
      vi.stubGlobal("HTMLRewriter", FakeHtmlRewriter);
      const { context } = makeContext(`https://pharosville.pharos.watch/?sel=ship.${A_KNOWN_SHIP.id}`);
      const html = await (await onRequest(context)).text();

      expect(titleText(html)).toContain(A_KNOWN_SHIP.symbol);
      expect(metaContent(html, 'meta[property="og:title"]')).toContain(A_KNOWN_SHIP.symbol);
      expect(metaContent(html, 'meta[name="twitter:title"]')).toContain(A_KNOWN_SHIP.symbol);
      expect(metaContent(html, 'meta[property="og:description"]')).toContain("peg risk");
      expect(metaContent(html, 'meta[name="twitter:description"]')).toContain("peg risk");
      expect(metaContent(html, 'meta[name="description"]')).toContain(A_KNOWN_SHIP.name);
      expect(metaContent(html, 'meta[property="og:url"]'))
        .toBe(`https://pharosville.pharos.watch/?sel=ship.${A_KNOWN_SHIP.id}`);

      // Text-only: the one static card image serves every variant.
      expect(metaContent(html, 'meta[property="og:image"]'))
        .toBe("https://pharosville.pharos.watch/og-card.png");
      expect(metaContent(html, 'meta[property="og:image:alt"]')).toContain("lighthouse beacon");
      expect(metaContent(html, 'meta[name="twitter:image"]'))
        .toBe("https://pharosville.pharos.watch/og-card.png");
    });

    // The rewriter escapes attribute values itself, so escaping before handing
    // them over unfurled "the fleet's stability" as "the fleet&#39;s stability".
    it("escapes an attribute exactly once, so punctuation unfurls as punctuation", async () => {
      vi.stubGlobal("HTMLRewriter", FakeHtmlRewriter);
      const { context } = makeContext(`https://pharosville.pharos.watch/?sel=ship.${A_KNOWN_SHIP.id}`);
      const html = await (await onRequest(context)).text();

      const description = metaContent(html, 'meta[property="og:description"]');
      expect(description).toContain("fleet's");
      expect(description).not.toContain("&amp;");
      expect(description).not.toContain("&#39;");
    });

    it("returns the asset response untouched when there is no selection", async () => {
      vi.stubGlobal("HTMLRewriter", FakeHtmlRewriter);
      const { assetResponse, context } = makeContext("https://pharosville.pharos.watch/");
      expect(await onRequest(context)).toBe(assetResponse);
    });

    it("returns the asset response untouched for an unknown or malformed selection", async () => {
      vi.stubGlobal("HTMLRewriter", FakeHtmlRewriter);
      for (const selection of ["ship.not-a-real-coin", '"><script>alert(1)</script>', "dock.ethereum"]) {
        const { assetResponse, context } = makeContext(
          `https://pharosville.pharos.watch/?sel=${encodeURIComponent(selection)}`,
        );
        expect(await onRequest(context), selection).toBe(assetResponse);
      }
    });

    it("never lets a raw selection reach the page, escaped or otherwise", async () => {
      vi.stubGlobal("HTMLRewriter", FakeHtmlRewriter);
      // A well-shaped id that resolves, carrying a suffix that does not.
      const { context } = makeContext(
        `https://pharosville.pharos.watch/?sel=${encodeURIComponent(`ship.${A_KNOWN_SHIP.id}"><script>alert(1)</script>`)}`,
      );
      const html = await (await onRequest(context)).text();
      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).not.toContain("alert(1)");
      expect(html).toBe(SHELL_HTML);
    });

    it("carries no credential or environment value into the page", async () => {
      vi.stubGlobal("HTMLRewriter", FakeHtmlRewriter);
      const { context } = makeContext(`https://pharosville.pharos.watch/?sel=ship.${A_KNOWN_SHIP.id}`);
      const html = await (await onRequest(context)).text();
      for (const secret of ["PHAROS_API_KEY", "X-API-Key", "api.pharos.watch"]) {
        expect(html, secret).not.toContain(secret);
      }
    });

    it("does not read request headers, so a crawler and a visitor get identical bytes", async () => {
      vi.stubGlobal("HTMLRewriter", FakeHtmlRewriter);
      const url = `https://pharosville.pharos.watch/?sel=ship.${A_KNOWN_SHIP.id}`;
      const asCrawler = new Request(url, { headers: { "user-agent": "Twitterbot/1.0" } });
      const asVisitor = new Request(url, { headers: { "user-agent": "Mozilla/5.0" } });
      const render = async (request: Request) => {
        const response = new Response(SHELL_HTML, { headers: { "content-type": "text/html" } });
        return (await onRequest({ next: async () => response, request })).text();
      };
      expect(await render(asCrawler)).toBe(await render(asVisitor));
    });

    it("leaves non-GET and non-HTML responses alone", async () => {
      vi.stubGlobal("HTMLRewriter", FakeHtmlRewriter);
      const head = makeContext(`https://pharosville.pharos.watch/?sel=ship.${A_KNOWN_SHIP.id}`, { method: "HEAD" });
      expect(await onRequest(head.context)).toBe(head.assetResponse);

      const notHtml = new Response("{}", { headers: { "content-type": "application/json" } });
      const request = new Request(`https://pharosville.pharos.watch/?sel=ship.${A_KNOWN_SHIP.id}`);
      expect(await onRequest({ next: async () => notHtml, request })).toBe(notHtml);
    });

    it("preserves the asset response headers, including the security policy", async () => {
      vi.stubGlobal("HTMLRewriter", FakeHtmlRewriter);
      const { context } = makeContext(`https://pharosville.pharos.watch/?sel=ship.${A_KNOWN_SHIP.id}`);
      const response = await onRequest(context);
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("cache-control")).toBe("public, max-age=0, must-revalidate");
      expect(response.status).toBe(200);
    });
  });
});
