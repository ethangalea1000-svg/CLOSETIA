const COOKIE = "closetia_session";
const SESSION_SECONDS = 60 * 60 * 24 * 14;
const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    ...headers
  }});
}
function fail(message, status = 400) { return json({ ok: false, error: message }, status); }
function b64u(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function unb64u(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function hmac(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}
async function issueCookie(userId, secret) {
  const payload = b64u(encoder.encode(JSON.stringify({ sub: userId, exp: Math.floor(Date.now()/1000) + SESSION_SECONDS })));
  const signature = b64u(await hmac(payload, secret));
  return `${COOKIE}=${payload}.${signature}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}
async function currentUser(request, env) {
  const raw = (request.headers.get("Cookie") || "").split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  if (!raw) return null;
  const token = raw.slice(COOKIE.length + 1).split(".");
  if (token.length !== 2) return null;
  try {
    const expected = await hmac(token[0], env.AUTH_SECRET);
    const got = unb64u(token[1]);
    if (expected.length !== got.length || !expected.every((v,i) => v === got[i])) return null;
    const payload = JSON.parse(new TextDecoder().decode(unb64u(token[0])));
    if (!payload.sub || payload.exp < Math.floor(Date.now()/1000)) return null;
    return await env.CLOSETIA_DB.prepare("SELECT id, username FROM closetia_accounts WHERE id = ?").bind(payload.sub).first();
  } catch (_) { return null; }
}
async function init(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS closetia_accounts (
      id TEXT PRIMARY KEY, username TEXT NOT NULL, username_norm TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS closetia_friend_requests (
      id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL,
      UNIQUE(from_id, to_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS closetia_friendships (
      user_id TEXT NOT NULL, friend_id TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(user_id, friend_id)
    )`)
  ]);
}
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return b64u(new Uint8Array(await crypto.subtle.deriveBits({ name:"PBKDF2", salt: unb64u(salt), iterations: 180000, hash:"SHA-256" }, key, 256)));
}
function cookieClear() { return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`; }
function validUsername(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_.-]{3,24}$/.test(value);
}
export async function onRequest({ request, env }) {
  if (!env.CLOSETIA_DB || !env.AUTH_SECRET || String(env.AUTH_SECRET).length < 32) {
    return fail("Annuaire non configuré : la base D1 CLOSETIA_DB et le secret AUTH_SECRET doivent être configurés dans l’environnement Preview.", 503);
  }
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/accounts\/?/, "").replace(/\/$/, "");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": url.origin, "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  try { await init(env.CLOSETIA_DB); } catch (_) { return fail("La base de comptes n’est pas accessible. Vérifie la liaison D1 de la Preview.", 503); }
  const user = await currentUser(request, env);
  try {
    if (path === "register" && request.method === "POST") {
      const body = await request.json();
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!validUsername(username)) return fail("Le pseudo doit contenir 3 à 24 caractères : lettres, chiffres, point, tiret ou soulignement.");
      if (password.length < 10 || password.length > 128) return fail("Le mot de passe doit contenir entre 10 et 128 caractères.");
      const id = crypto.randomUUID(), salt = b64u(crypto.getRandomValues(new Uint8Array(16)));
      const hash = await passwordHash(password, salt);
      try {
        await env.CLOSETIA_DB.prepare("INSERT INTO closetia_accounts (id,username,username_norm,salt,password_hash,created_at) VALUES (?,?,?,?,?,?)")
          .bind(id, username, username.toLocaleLowerCase("en-US"), salt, hash, new Date().toISOString()).run();
      } catch (_) { return fail("Ce pseudo est déjà utilisé. Choisis-en un autre.", 409); }
      return json({ ok:true, user:{id,username} }, 201, { "Set-Cookie": await issueCookie(id, env.AUTH_SECRET) });
    }
    if (path === "login" && request.method === "POST") {
      const body = await request.json(), username = String(body.username || "").trim();
      const row = await env.CLOSETIA_DB.prepare("SELECT id,username,salt,password_hash FROM closetia_accounts WHERE username_norm = ?")
        .bind(username.toLocaleLowerCase("en-US")).first();
      if (!row) return fail("Pseudo ou mot de passe incorrect.", 401);
      const candidate = await passwordHash(String(body.password || ""), row.salt);
      const left = encoder.encode(candidate), right = encoder.encode(row.password_hash);
      let diff = left.length ^ right.length;
      for (let i=0; i<Math.max(left.length,right.length); i++) diff |= (left[i]||0) ^ (right[i]||0);
      if (diff !== 0) return fail("Pseudo ou mot de passe incorrect.", 401);
      return json({ok:true,user:{id:row.id,username:row.username}},200,{"Set-Cookie":await issueCookie(row.id,env.AUTH_SECRET)});
    }
    if (path === "logout" && request.method === "POST") return json({ok:true},200,{"Set-Cookie":cookieClear()});
    if (!user) return fail("Connecte-toi à ton compte CLOSETIA pour continuer.", 401);
    if (path === "me" && request.method === "GET") return json({ok:true,user});
    if (path === "search" && request.method === "GET") {
      const q = String(url.searchParams.get("q") || "").trim().toLocaleLowerCase("en-US");
      if (q.length < 2) return json({ok:true,users:[]});
      const rows = await env.CLOSETIA_DB.prepare("SELECT username FROM closetia_accounts WHERE username_norm LIKE ? AND id <> ? ORDER BY username_norm LIMIT 10")
        .bind(q.replace(/[\\%_]/g, "\\$&") + "%", user.id).all();
      return json({ok:true,users:rows.results || []});
    }
    if (path === "request" && request.method === "POST") {
      const body = await request.json(), username = String(body.username || "").trim().toLocaleLowerCase("en-US");
      const target = await env.CLOSETIA_DB.prepare("SELECT id,username FROM closetia_accounts WHERE username_norm = ?").bind(username).first();
      if (!target) return fail("Aucun compte ne correspond à ce pseudo.",404);
      if (target.id === user.id) return fail("Tu ne peux pas t’ajouter toi-même.");
      const existing = await env.CLOSETIA_DB.prepare("SELECT 1 AS yes FROM closetia_friendships WHERE user_id=? AND friend_id=?").bind(user.id,target.id).first();
      if (existing) return fail("Vous êtes déjà amis.");
      const reverse = await env.CLOSETIA_DB.prepare("SELECT id FROM closetia_friend_requests WHERE from_id=? AND to_id=? AND status='pending'").bind(target.id,user.id).first();
      if (reverse) return fail("Cette personne t’a déjà envoyé une demande : consulte tes demandes reçues.");
      try {
        await env.CLOSETIA_DB.prepare("INSERT INTO closetia_friend_requests (id,from_id,to_id,status,created_at) VALUES (?,?,?,'pending',?)")
          .bind(crypto.randomUUID(),user.id,target.id,new Date().toISOString()).run();
      } catch (_) { return fail("Une demande existe déjà.",409); }
      return json({ok:true,message:"Demande envoyée."},201);
    }
    if (path === "requests" && request.method === "GET") {
      const rows = await env.CLOSETIA_DB.prepare("SELECT r.id,a.username,r.created_at FROM closetia_friend_requests r JOIN closetia_accounts a ON a.id=r.from_id WHERE r.to_id=? AND r.status='pending' ORDER BY r.created_at DESC LIMIT 50").bind(user.id).all();
      return json({ok:true,requests:rows.results||[]});
    }
    if (path === "accept" && request.method === "POST") {
      const body=await request.json(), id=String(body.id||"");
      const req=await env.CLOSETIA_DB.prepare("SELECT id,from_id,to_id,status FROM closetia_friend_requests WHERE id=? AND to_id=?").bind(id,user.id).first();
      if(!req||req.status!=="pending")return fail("Cette demande n’est plus disponible.",404);
      const now=new Date().toISOString();
      await env.CLOSETIA_DB.batch([
        env.CLOSETIA_DB.prepare("UPDATE closetia_friend_requests SET status='accepted' WHERE id=?").bind(id),
        env.CLOSETIA_DB.prepare("INSERT OR IGNORE INTO closetia_friendships (user_id,friend_id,created_at) VALUES (?,?,?)").bind(req.to_id,req.from_id,now),
        env.CLOSETIA_DB.prepare("INSERT OR IGNORE INTO closetia_friendships (user_id,friend_id,created_at) VALUES (?,?,?)").bind(req.from_id,req.to_id,now)
      ]);
      return json({ok:true,message:"Amitié confirmée."});
    }
    if (path === "friends" && request.method === "GET") {
      const rows=await env.CLOSETIA_DB.prepare("SELECT a.username FROM closetia_friendships f JOIN closetia_accounts a ON a.id=f.friend_id WHERE f.user_id=? ORDER BY a.username_norm").bind(user.id).all();
      return json({ok:true,friends:rows.results||[]});
    }
    return fail("Route inconnue.",404);
  } catch (_) { return fail("Erreur serveur temporaire. Réessaie plus tard.",500); }
}
