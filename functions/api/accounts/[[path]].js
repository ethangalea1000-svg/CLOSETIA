const COOKIE = "closetia_session";
const SESSION_SECONDS = 60 * 60 * 24 * 14;
const encoder = new TextEncoder();

// Best-effort per-isolate throttling. Cloudflare edge DDoS/WAF rules are still required.
const rateBuckets = new Map();
function rateLimit(request, path) {
  const now = Date.now();
  const policy = ["register","email-register"].includes(path) ? [5, 15 * 60 * 1000] :
    ["login","email-login","magic-request","magic-verify"].includes(path) ? [10, 10 * 60 * 1000] :
    path === "search" ? [40, 60 * 1000] :
    (path === "request" || path === "accept") ? [20, 60 * 1000] : [90, 60 * 1000];
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const group = ["register","email-register","login","email-login","magic-request","magic-verify","search","request","accept"].includes(path) ? path : "general";
  const key = ip + ":" + group;
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= policy[1]) {
    bucket = { startedAt: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count++;
  if (rateBuckets.size > 5000) {
    for (const [k, value] of rateBuckets) {
      if (now - value.startedAt > 15 * 60 * 1000) rateBuckets.delete(k);
    }
  }
  if (bucket.count > policy[0]) {
    const retry = Math.max(1, Math.ceil((policy[1] - (now - bucket.startedAt)) / 1000));
    return json({ ok: false, error: "Trop de requêtes. Attends un peu avant de réessayer." }, 429, { "Retry-After": String(retry) });
  }
  return null;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
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
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS closetia_magic_links (
      token_hash TEXT PRIMARY KEY, email_norm TEXT NOT NULL, expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`)
  ]);
  const columns = await db.prepare("PRAGMA table_info(closetia_accounts)").all();
  const names = new Set((columns.results || []).map(row => row.name));
  if (!names.has("email")) await db.prepare("ALTER TABLE closetia_accounts ADD COLUMN email TEXT").run();
  if (!names.has("email_norm")) await db.prepare("ALTER TABLE closetia_accounts ADD COLUMN email_norm TEXT").run();
  await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS closetia_accounts_email_norm_uq ON closetia_accounts(email_norm) WHERE email_norm IS NOT NULL").run();
}
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  return b64u(new Uint8Array(await crypto.subtle.deriveBits({ name:"PBKDF2", salt: unb64u(salt), iterations: 180000, hash:"SHA-256" }, key, 256)));
}
function validEmail(value) {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
async function sha256(value) {
  return b64u(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
async function sendMagicLink(env, email, link) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [email],
      subject: "Ton lien de connexion CLOSETIA",
      text: "Pour te connecter à CLOSETIA, ouvre ce lien valable 15 minutes :\n\n" + link + "\n\nSi tu n’as pas demandé ce lien, ignore cet e-mail.",
      html: "<p>Pour te connecter à CLOSETIA, clique sur le lien ci-dessous. Il expire dans 15 minutes.</p><p><a href=\"" + link + "\">Se connecter à CLOSETIA</a></p><p>Si tu n’as pas demandé ce lien, ignore cet e-mail.</p>"
    })
  });
  return response.ok;
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
  if (request.method === "POST") {
    const origin = request.headers.get("Origin");
    if (origin) {
      try { if (new URL(origin).origin !== url.origin) return fail("Origine de requête refusée.", 403); }
      catch (_) { return fail("Origine de requête invalide.", 403); }
    }
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().startsWith("application/json")) return fail("Format de requête refusé.", 415);
    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > 8192) return fail("Requête trop volumineuse.", 413);
  }
  const limited = rateLimit(request, path);
  if (limited) return limited;
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
    if (path === "email-register" && request.method === "POST") {
      const body = await request.json();
      const username = String(body.username || "").trim();
      const email = String(body.email || "").trim();
      const emailNorm = email.toLocaleLowerCase("en-US");
      const password = String(body.password || "");
      if (!validUsername(username)) return fail("Le pseudo doit contenir 3 à 24 caractères : lettres, chiffres, point, tiret ou soulignement.");
      if (!validEmail(email)) return fail("Saisis une adresse e-mail valide.");
      if (password.length < 10 || password.length > 128) return fail("Le mot de passe doit contenir entre 10 et 128 caractères.");
      const id = crypto.randomUUID(), salt = b64u(crypto.getRandomValues(new Uint8Array(16)));
      const hash = await passwordHash(password, salt);
      try {
        await env.CLOSETIA_DB.prepare("INSERT INTO closetia_accounts (id,username,username_norm,salt,password_hash,created_at,email,email_norm) VALUES (?,?,?,?,?,?,?,?)")
          .bind(id, username, username.toLocaleLowerCase("en-US"), salt, hash, new Date().toISOString(), email, emailNorm).run();
      } catch (_) { return fail("Ce pseudo ou cette adresse e-mail est déjà utilisé.", 409); }
      return json({ok:true,user:{id,username}},201,{"Set-Cookie":await issueCookie(id,env.AUTH_SECRET)});
    }
    if (path === "email-login" && request.method === "POST") {
      const body = await request.json();
      const usernameNorm = String(body.username || "").trim().toLocaleLowerCase("en-US");
      const emailNorm = String(body.email || "").trim().toLocaleLowerCase("en-US");
      if (!validUsername(String(body.username || "").trim()) || !validEmail(emailNorm)) return fail("Vérifie ton pseudo et ton adresse e-mail.");
      const row = await env.CLOSETIA_DB.prepare("SELECT id,username,salt,password_hash FROM closetia_accounts WHERE email_norm = ? AND username_norm = ?").bind(emailNorm, usernameNorm).first();
      if (!row) return fail("Pseudo, e-mail ou mot de passe incorrect.",401);
      const candidate = await passwordHash(String(body.password || ""), row.salt);
      const left=encoder.encode(candidate),right=encoder.encode(row.password_hash);
      let diff=left.length^right.length;
      for(let i=0;i<Math.max(left.length,right.length);i++)diff|=(left[i]||0)^(right[i]||0);
      if(diff!==0)return fail("Pseudo, e-mail ou mot de passe incorrect.",401);
      return json({ok:true,user:{id:row.id,username:row.username}},200,{"Set-Cookie":await issueCookie(row.id,env.AUTH_SECRET)});
    }
    if (path === "magic-request" && request.method === "POST") {
      const body = await request.json(), email = String(body.email || "").trim(), emailNorm = email.toLocaleLowerCase("en-US");
      if (!validEmail(email)) return fail("Saisis une adresse e-mail valide.");
      if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return fail("L’envoi d’e-mails n’est pas configuré. Il faut ajouter RESEND_API_KEY et EMAIL_FROM dans les secrets Preview.",503);
      const row = await env.CLOSETIA_DB.prepare("SELECT id FROM closetia_accounts WHERE email_norm = ?").bind(emailNorm).first();
      // Always return the same public response so the endpoint does not reveal whether an account exists.
      if (row) {
        const rawToken = b64u(crypto.getRandomValues(new Uint8Array(32)));
        const expires = Math.floor(Date.now()/1000)+900;
        await env.CLOSETIA_DB.prepare("DELETE FROM closetia_magic_links WHERE email_norm = ? OR expires_at < ?").bind(emailNorm,Math.floor(Date.now()/1000)).run();
        await env.CLOSETIA_DB.prepare("INSERT INTO closetia_magic_links (token_hash,email_norm,expires_at,created_at) VALUES (?,?,?,?)")
          .bind(await sha256(rawToken),emailNorm,expires,new Date().toISOString()).run();
        const link = new URL("/?magic_token="+encodeURIComponent(rawToken),url.origin).toString();
        if (!await sendMagicLink(env,email,link)) return fail("L’e-mail n’a pas pu être envoyé. Vérifie le fournisseur d’envoi et son domaine.",502);
      }
      return json({ok:true,message:"Si cette adresse correspond à un compte CLOSETIA, un lien de connexion vient d’être envoyé."});
    }
    if (path === "magic-verify" && request.method === "POST") {
      const body = await request.json(), token = String(body.token || "");
      if (token.length < 20 || token.length > 200) return fail("Lien de connexion invalide ou expiré.",400);
      const tokenHash = await sha256(token);
      const row = await env.CLOSETIA_DB.prepare("SELECT email_norm,expires_at FROM closetia_magic_links WHERE token_hash = ?").bind(tokenHash).first();
      await env.CLOSETIA_DB.prepare("DELETE FROM closetia_magic_links WHERE token_hash = ?").bind(tokenHash).run();
      if (!row || row.expires_at < Math.floor(Date.now()/1000)) return fail("Lien de connexion invalide ou expiré. Demande-en un nouveau.",401);
      const account = await env.CLOSETIA_DB.prepare("SELECT id,username FROM closetia_accounts WHERE email_norm = ?").bind(row.email_norm).first();
      if (!account) return fail("Lien de connexion invalide ou expiré.",401);
      return json({ok:true,user:account},200,{"Set-Cookie":await issueCookie(account.id,env.AUTH_SECRET)});
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
