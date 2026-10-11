const COOKIE = "closetia_session";
const encoder = new TextEncoder();
const MAX_SNAPSHOT_BYTES = 2_000_000;
const COLLECTION = "preferences";
const LEGACY_LOCAL_ID = "main";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(normalized.length ? binary : "", char => char.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

async function authenticatedUser(request, env) {
  const cookie = (request.headers.get("Cookie") || "")
    .split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(COOKIE + "="));
  if (!cookie) return null;

  const pieces = cookie.slice(COOKIE.length + 1).split(".");
  if (pieces.length !== 2) return null;

  try {
    const expected = await hmac(pieces[0], env.AUTH_SECRET);
    const supplied = decodeBase64Url(pieces[1]);
    if (expected.length !== supplied.length) return null;
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ supplied[i];
    if (difference !== 0) return null;

    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(pieces[0])));
    if (!payload.sub || !Number.isFinite(payload.exp) || payload.exp < Math.floor(Date.now() / 1000)) return null;

    return await env.CLOSETIA_DB
      .prepare("SELECT id, username FROM closetia_accounts WHERE id = ?")
      .bind(payload.sub)
      .first();
  } catch (_) {
    return null;
  }
}

export async function onRequest({ request, env }) {
  // The existing D1 database is intentional: snapshots live in closetia_records,
  // isolated by account ID. The legacy "main" snapshot is never overwritten here.
  if (!env.CLOSETIA_DB || !env.AUTH_SECRET || String(env.AUTH_SECRET).length < 32) {
    return json({ ok: false, error: "La synchronisation Cloud est indisponible : configuration serveur incomplète." }, 503);
  }

  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== url.origin) return json({ ok: false, error: "Origine refusée." }, 403);
    } catch (_) {
      return json({ ok: false, error: "Origine invalide." }, 403);
    }
  }

  if (request.method !== "GET" && request.method !== "PUT") {
    return json({ ok: false, error: "Méthode non autorisée." }, 405);
  }

  const user = await authenticatedUser(request, env);
  if (!user) return json({ ok: false, error: "Connecte-toi à ton compte CLOSETIA pour synchroniser." }, 401);

  // Protect the pre-existing local snapshot even if an account ID ever equals "main".
  if (user.id === LEGACY_LOCAL_ID) {
    return json({ ok: false, error: "Identifiant de compte réservé pour protéger la sauvegarde existante." }, 409);
  }

  try {
    if (request.method === "GET") {
      const row = await env.CLOSETIA_DB
        .prepare("SELECT data, updated_at FROM closetia_records WHERE collection = ? AND id = ?")
        .bind(COLLECTION, user.id)
        .first();

      if (!row) return json({ ok: true, record: null });

      let data;
      try {
        data = JSON.parse(row.data);
      } catch (_) {
        return json({ ok: false, error: "Les données Cloud enregistrées sont illisibles. Elles n’ont pas été modifiées." }, 500);
      }
      if (!data || typeof data !== "object" || Array.isArray(data) ||
          !Array.isArray(data.items) || !Array.isArray(data.outfits)) {
        return json({ ok: false, error: "Le format des données Cloud enregistrées est invalide. Elles n’ont pas été modifiées." }, 500);
      }
      return json({ ok: true, record: { data, updated_at: row.updated_at } });
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_SNAPSHOT_BYTES) {
      return json({ ok: false, error: "Sauvegarde trop volumineuse (maximum 2 Mo)." }, 413);
    }

    let body;
    try {
      body = await request.json();
    } catch (_) {
      return json({ ok: false, error: "Corps JSON invalide." }, 400);
    }

    if (!body || !body.data || typeof body.data !== "object" || Array.isArray(body.data) ||
        !Array.isArray(body.data.items) || !Array.isArray(body.data.outfits)) {
      return json({ ok: false, error: "Format de sauvegarde CLOSETIA invalide." }, 400);
    }

    const serialized = JSON.stringify(body.data);
    if (encoder.encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) {
      return json({ ok: false, error: "Sauvegarde trop volumineuse (maximum 2 Mo)." }, 413);
    }

    const now = new Date().toISOString();
    await env.CLOSETIA_DB.prepare(`
      INSERT INTO closetia_records (collection, id, data, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(collection, id)
      DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).bind(COLLECTION, user.id, serialized, now).run();

    return json({ ok: true, record: { data: body.data, updated_at: now } });
  } catch (error) {
    console.error("[CLOSETIA cloud-sync] request failed", error instanceof Error ? error.name : "UnknownError");
    return json({ ok: false, error: "Erreur serveur temporaire pendant la synchronisation." }, 500);
  }
}
