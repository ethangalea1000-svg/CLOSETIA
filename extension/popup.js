"use strict";

const CATS = ["Haut","Bas","Chaussures","Veste","Robe","Accessoire","Autre"];
const COLORS = ["Noir","Blanc","Gris","Bleu","Vert","Rouge","Rose","Violet","Jaune","Orange","Marron","Beige","Autre"];

const statusEl = document.getElementById("status");
const button = document.getElementById("extract");

function guessCategory(text) {
  const s = String(text || "").toLowerCase();
  const rules = [
    [/chauss|sneaker|basket|botte|escarpin|sandale/, "Chaussures"],
    [/robe|jupe/, "Robe"],
    [/veste|manteau|blouson|parka/, "Veste"],
    [/pantalon|jean|short|jogging|legging/, "Bas"],
    [/t[- ]?shirt|tee|haut|chemise|pull|sweat|hoodie|débardeur|top|polo|cardigan/, "Haut"],
    [/sac|ceinture|casquette|bonnet|écharpe|foulard|bijou|montre|lunettes/, "Accessoire"]
  ];
  for (const [re, cat] of rules) if (re.test(s)) return cat;
  return "Autre";
}

function guessColor(text) {
  const s = String(text || "").toLowerCase();
  return COLORS.find((c) => c !== "Autre" && s.includes(c.toLowerCase())) || "Autre";
}

// Exécuté dans l'onglet actif : lit uniquement le balisage public de la page.
function readProductFromPage() {
  const meta = (p) => document.querySelector(`meta[property="${p}"], meta[name="${p}"]`)?.content || "";
  const out = { name: "", image: "", extra: "" };
  out.name = meta("og:title") || document.title || "";
  out.image = meta("og:image") || "";
  let ldName = "";
  let ldImage = "";
  for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(node.textContent);
      const items = Array.isArray(data) ? data : [data];
      const product = items.find((x) => x && (x["@type"] === "Product" || (Array.isArray(x["@type"]) && x["@type"].includes("Product"))));
      if (product) {
        ldName = product.name || "";
        ldImage = Array.isArray(product.image) ? product.image[0] : (product.image || "");
        if (product.offers) {
          const offer = Array.isArray(product.offers) ? product.offers[0] : product.offers;
          if (offer && offer.price) out.extra = `Prix affiché : ${offer.price} ${offer.priceCurrency || ""}`.trim();
        }
        break;
      }
    } catch { /* balisage JSON-LD illisible : on ignore */ }
  }
  if (ldName) out.name = ldName;
  if (ldImage) out.image = ldImage;
  out.pageUrl = location.href;
  return out;
}

button.addEventListener("click", async () => {
  button.disabled = true;
  statusEl.textContent = "Lecture de la page…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readProductFromPage });
    if (!result || !result.name) {
      statusEl.textContent = "Aucun nom de produit lisible sur cette page.";
      button.disabled = false;
      return;
    }
    const item = {
      name: result.name.slice(0, 120),
      category: guessCategory(result.name),
      color: guessColor(result.name),
      notes: [`Importé depuis : ${result.pageUrl}`, result.extra].filter(Boolean).join("\n"),
      image: /^https:\/\//i.test(result.image) ? result.image : ""
    };
    const payload = { format: "CLOSETIA-ITEMS", version: 1, exportedAt: new Date().toISOString(), entries: [item] };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({ url, filename: "closetia-import.json", saveAs: true });
    statusEl.textContent = `Fichier prêt : « ${item.name} » (${item.category}, ${item.color}). Ouvre Closetia puis « Importer JSON ».`;
  } catch (err) {
    statusEl.textContent = "Lecture impossible sur cette page : " + (err && err.message ? err.message : err);
  }
  button.disabled = false;
});
