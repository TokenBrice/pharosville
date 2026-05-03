interface PagesContext {
  request: Request;
}

const MAX_BODY_BYTES = 4 * 1024;

function noContent(): Response {
  return new Response(null, { status: 204 });
}

function rejected(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const { request } = context;
  if (request.method !== "POST") {
    return rejected("Method not allowed", 405);
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return rejected("Unsupported media type", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return rejected("Payload too large", 413);
  }

  let payload: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return rejected("Payload too large", 413);
    payload = JSON.parse(text);
  } catch {
    return rejected("Bad request", 400);
  }

  const ray = request.headers.get("cf-ray") ?? "";
  const country = request.headers.get("cf-ipcountry") ?? "";
  const ua = request.headers.get("user-agent") ?? "";
  console.error(JSON.stringify({ source: "pharosville-client", ray, country, ua, payload }));

  return noContent();
}
