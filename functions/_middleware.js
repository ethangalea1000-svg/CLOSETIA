const ADMIN_PATHS = new Set(["/admin.html", "/admin", "/admin/"]);

function safeEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] || 0) ^ (right[i] || 0);
  }
  return diff === 0;
}

function privateHeaders(extra = {}) {
  return {
    "Cache-Control": "no-store, private",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    ...extra
  };
}

function challenge(message = "Authentification requise.") {
  return new Response(message, {
    status: 401,
    headers: privateHeaders({
      "WWW-Authenticate": 'Basic realm="CLOSETIA Admin", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8"
    })
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const pathname = url.pathname.toLowerCase();
  if (!ADMIN_PATHS.has(pathname)) return context.next();

  const expectedUser = context.env.ADMIN_USER;
  const expectedPassword = context.env.ADMIN_PASSWORD;

  // Fail closed: never expose the admin page until both Cloudflare secrets exist.
  if (!expectedUser || !expectedPassword) {
    return new Response("Administration indisponible : configurez ADMIN_USER et ADMIN_PASSWORD dans les variables d’environnement Cloudflare Pages.", {
      status: 503,
      headers: privateHeaders({ "Content-Type": "text/plain; charset=utf-8" })
    });
  }

  const header = context.request.headers.get("Authorization") || "";
  if (!header.startsWith("Basic ")) return challenge();

  let supplied;
  try {
    const binary = atob(header.slice(6).trim());
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    supplied = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return challenge();
  }

  const colon = supplied.indexOf(":");
  if (colon < 0) return challenge();
  const user = supplied.slice(0, colon);
  const password = supplied.slice(colon + 1);
  if (!safeEqual(user, expectedUser) || !safeEqual(password, expectedPassword)) {
    return challenge("Identifiants incorrects.");
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(privateHeaders())) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
