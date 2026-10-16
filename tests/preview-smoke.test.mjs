import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
assert.doesNotThrow(() => new Function(source), "app.js must parse as JavaScript");
assert.ok(source.includes("function authGatePage()"), "a dedicated mandatory sign-in screen must exist");
assert.ok(source.includes("if(!accountGateChecked || !accountSessionUser)"), "app routes must stay gated until session validation");
assert.ok(source.includes("initializeAccountGate();"), "session must be checked on every fresh page load");

const accountApiSource = readFileSync(new URL("../functions/api/accounts/[[path]].js", import.meta.url), "utf8");
assert.ok(accountApiSource.includes("function rateLimit("), "account API must throttle request bursts");
assert.ok(accountApiSource.includes("Retry-After"), "rate-limit responses must tell clients when to retry");
assert.ok(accountApiSource.includes("Origine de requête refusée."), "account API must reject cross-origin POST requests");

const start = source.indexOf("function mergeRecords(");
const end = source.indexOf("function esc(value)", start);
assert.ok(start >= 0 && end > start, "snapshot helpers must exist");

const fresh = () => ({
  items: [], outfits: [], calendar: {}, palette: [],
  settings: {
    profile: { name: "", city: "", styles: [], models: [], brands: [], budget: 50, weather: true, colors: [] },
    colorimetry: { palette: [], status: "Non définie" },
    friends: [], shared: [], lookTracker: [], wishlist: []
  }
});
const normalize = item => ({ ...item, id: item.id || "generated", name: item.name || "Vêtement" });
const helpers = new Function("fresh", "normalize", source.slice(start, end) +
  "; return { mergeSnapshots, hasLocalData, hasRemoteData };")(fresh, normalize);

const local = {
  items: [{ id: "same", name: "local version" }, { id: "local", name: "local only" }],
  outfits: [{ id: "local-outfit", name: "Local outfit" }],
  calendar: { "2026-10-11": "Local event" },
  settings: {
    profile: { name: "Local profile" },
    wishlist: [{ id: "wish-local", name: "Local wish" }],
    friends: ["Local friend"]
  }
};
const remote = {
  items: [{ id: "same", name: "older cloud version" }, { id: "cloud", name: "cloud only" }],
  outfits: [{ id: "cloud-outfit", name: "Cloud outfit" }],
  calendar: { "2026-10-11": "Cloud event", "2026-10-12": "Cloud only event" },
  settings: {
    profile: { city: "Test city" },
    wishlist: [{ id: "wish-cloud", name: "Cloud wish" }],
    friends: ["Cloud friend"]
  }
};

const merged = helpers.mergeSnapshots(local, remote);
assert.equal(merged.items.length, 3, "keep unique local and cloud items");
assert.equal(merged.items.find(item => item.id === "same").name, "local version", "local version wins id conflicts");
assert.equal(merged.outfits.length, 2, "keep outfits from both snapshots");
assert.equal(merged.calendar["2026-10-11"], "Local event", "local calendar value wins conflicts");
assert.equal(merged.calendar["2026-10-12"], "Cloud only event", "keep cloud-only calendar entries");
assert.equal(merged.settings.wishlist.length, 2, "merge wishlist entries");
assert.equal(merged.settings.friends.length, 2, "merge friends");
assert.equal(merged.settings.profile.name, "Local profile", "keep local profile values");
assert.equal(merged.settings.profile.city, "Test city", "keep cloud profile values when local is empty");
assert.equal(helpers.hasLocalData(local), true, "detect local data");
assert.equal(helpers.hasRemoteData(remote), true, "detect remote data");
assert.equal(helpers.hasRemoteData(fresh()), false, "detect empty remote snapshot");
assert.equal(helpers.hasLocalData({ settings: { wishlist: [{ id: "w", name: "wish" }] } }), true,
  "wishlist-only snapshot counts as data");


const htmlSource = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.ok(htmlSource.includes('id="primaryNav" aria-label="Navigation principale"'), "navigation must have an accessible landmark label");
assert.ok(htmlSource.includes('style.css?v=13') && htmlSource.includes('app.js?v=56'), "HTML asset versions must match the current release");
assert.ok(source.includes('function updatePrimaryNav(page)'), "navigation must update the active route");
assert.ok(source.includes('setAttribute("aria-current","page")'), "current navigation link must be announced to assistive technology");
const workerSource = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
assert.ok(workerSource.includes('closetia-v56'), "service worker cache must be versioned with the release");
assert.ok(workerSource.includes('if (url.pathname.startsWith("/api/")) return;'), "private API responses must never be cached");
const cssSource = readFileSync(new URL("../style.css", import.meta.url), "utf8");
assert.ok(cssSource.includes('prefers-reduced-motion:reduce'), "reduced-motion preferences must be respected");

console.log("CLOSETIA Preview checks passed.");

assert.ok(source.includes("function colorimetryPage()"), "colorimetry page must render the local harmony lab");
assert.ok(source.includes("harmonyBase") && source.includes("harmonyCustom"), "colorimetry must allow a named or custom base color");
assert.ok(source.includes('function getColorHarmony(scheme)'), "harmony calculations must remain client-side");
assert.ok(source.includes("À essayer avec ton dressing"), "harmony suggestions must match wardrobe items");
assert.ok(source.includes("targetHues.some"), "wardrobe matching must use hue proximity");
assert.ok(htmlSource.includes('style.css?v=13') && htmlSource.includes('app.js?v=56'), "HTML asset versions must match the colorimetry release");
assert.ok(workerSource.includes('closetia-v56'), "service worker cache must be bumped with the colorimetry release");
