// Manual browser flow test (not run in CI: needs Chrome). Usage: node tests/import-flow.chrome.mjs
// Uses a throwaway Chrome profile and a LOCAL copy of the app. The account session is simulated
// in the page (only /api/accounts/me) so the dressing screen is visible; no real sign-in is bypassed.
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (!p.startsWith(root) || !existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = "http://127.0.0.1:" + server.address().port;
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(process.env.CHROME || "google-chrome", ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=" + port, "--user-data-dir=" + mkdtempSync(path.join(tmpdir(), "closetia-")), "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(3000);
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(tabs.find(t => t.type === "page").webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = {};
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) pending[m.id](m); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async s => (await send("Runtime.evaluate", { expression: s, awaitPromise: true, returnByValue: true })).result.result?.value;
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__al=[];window.__cf=[];window.__dl=0;window.__ans=true;window.alert=m=>window.__al.push(m);window.confirm=m=>{window.__cf.push(m);return window.__ans};const oc=URL.createObjectURL;URL.createObjectURL=b=>{window.__dl++;return oc.call(URL,b)};const of=window.fetch;window.fetch=function(u){if(String(u).includes('/api/accounts/me'))return Promise.resolve(new Response(JSON.stringify({ok:true,user:{username:'testeur-local'}}),{status:200,headers:{'Content-Type':'application/json'}}));if(String(u).includes('/api/'))return Promise.resolve(new Response('{"ok":false}',{status:503}));return of.apply(this,arguments)}` });

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
const pre = { items: [{ id: "pre1", name: "Existant", category: "Haut", color: "Noir", notes: "", image: png }], outfits: [{ id: "o1", name: "Tenue test" }], calendar: {}, palette: [], settings: {} };
const state = () => ev(`(()=>{const d=JSON.parse(localStorage.getItem("closetia.v2"));return {items:d.items.map(i=>[i.name,i.image?i.image.slice(0,14):""]),outfits:d.outfits.length,al:__al,cf:__cf.length,dl:__dl}})()`);
async function fresh() {
  await send("Page.navigate", { url: base + "/index.html" }); await sleep(2500);
  await ev(`localStorage.setItem("closetia.v2",${JSON.stringify(JSON.stringify(pre))})`);
  await ev('location.hash="#/dressing";location.reload()'); await sleep(3000);
}
async function doImport(payload, answer, button, shot) {
  await ev(`window.__al=[];window.__cf=[];window.__dl=0;window.__ans=${answer}`);
  await ev(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(payload)}],"i.json"));const i=document.querySelector("#importFile");i.files=dt.files;i.dispatchEvent(new Event("change",{bubbles:true}))})()`);
  await sleep(1200);
  if (shot) { const s = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(shot, Buffer.from(s.result.data, "base64")); }
  await ev(`[...document.querySelectorAll("dialog button")].find(b=>b.textContent===${JSON.stringify(button)})?.click()`);
  await sleep(2500);
  return state();
}
const bad = [{ name: "bad-b64", image: "data:image/png;base64,@@@@" }, { name: "trunc", image: png.slice(0, 60) }, { name: "svg", image: "data:image/svg+xml;base64,PHN2Zy8+" }, { name: "ok", image: png }];
const items = JSON.stringify({ format: "CLOSETIA-ITEMS", version: 1, entries: bad });
const legacy = JSON.stringify({ format: "CLOSETIA", version: 2, items: [{ id: "n1", name: "Ancien svg", category: "Haut", color: "Rouge", image: "data:image/svg+xml;base64,PHN2Zy8+" }, { id: "n2", name: "Ancien ok", category: "Bas", color: "Bleu", image: png }], outfits: [], calendar: {}, palette: [], settings: {} });
let s;
try {
  await fresh(); s = await doImport(items, false, "Ajouter les articles", process.env.SHOT);
  assert.equal(s.cf, 1, "refused images must ask for confirmation"); assert.deepEqual(s.items.map(i => i[0]), ["Existant"], "cancel must not mutate"); assert.equal(s.outfits, 1); assert.equal(s.dl, 0);
  await fresh(); s = await doImport(items, true, "Ajouter les articles");
  assert.deepEqual(s.items.map(i => i[0]), ["Existant", "bad-b64", "trunc", "svg", "ok"], "add must keep existing items"); assert.equal(s.outfits, 1);
  assert.equal(s.items.filter(i => i[1]).length, 2, "only the pre-existing and valid image keep a photo");
  await fresh(); s = await doImport(legacy, false, "Restaurer cette sauvegarde");
  assert.deepEqual(s.items.map(i => i[0]), ["Existant"], "cancelled restore must not mutate"); assert.equal(s.outfits, 1); assert.equal(s.dl, 0);
  await fresh(); s = await doImport(legacy, true, "Restaurer cette sauvegarde");
  assert.equal(s.dl, 1, "restore must download the previous backup first"); assert.deepEqual(s.items.map(i => i[0]), ["Ancien svg", "Ancien ok"]);
  await fresh(); s = await doImport(JSON.stringify({ format: "CLOSETIA-ITEMS", version: 1, entries: [{ name: "propre", image: png }, { name: "sans image" }] }), true, "Ajouter les articles");
  assert.equal(s.cf, 0, "clean import must not ask"); assert.deepEqual(s.items.map(i => i[0]), ["Existant", "propre", "sans image"]);
  assert.equal(await ev("document.documentElement.scrollWidth<=innerWidth"), true, "no horizontal scroll at 390px");
  console.log("CLOSETIA import flow tests passed.");
} finally { chrome.kill(); server.close(); }
process.exit(0);
