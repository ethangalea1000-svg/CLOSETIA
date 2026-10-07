(() => {
"use strict";

const KEY = "closetia.v2";
const CATS = ["Haut","Bas","Chaussures","Veste","Robe","Accessoire","Autre"];
const COLORS = ["Noir","Blanc","Gris","Bleu","Vert","Rouge","Rose","Violet","Jaune","Orange","Marron","Beige","Autre"];
const OCC = ["Tous les jours","Cours","Sport","Sortie","Élégant"];
const SEAS = ["Printemps","Été","Automne","Hiver","Toute l'année"];
const HEX = {Noir:"#111827",Blanc:"#f8fafc",Gris:"#94a3b8",Bleu:"#2563eb",Vert:"#16a34a",Rouge:"#dc2626",Rose:"#ec4899",Violet:"#7c3aed",Jaune:"#eab308",Orange:"#f97316",Marron:"#92400e",Beige:"#d6b98c",Autre:"#cbd5e1"};

const $ = id => document.getElementById(id);
const photos = $("photos");
const importFile = $("importFile");

let db = load();

function fresh(){ return {items:[],outfits:[],calendar:{},palette:[],settings:{}}; }

function makeId(){
  if(window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
}

function normalize(x){
  x = x || {};
  return {
    id:x.id || makeId(),
    name:x.name || "Vêtement",
    category:CATS.includes(x.category) ? x.category : "Autre",
    color:COLORS.includes(x.color) ? x.color : "Autre",
    occasion:OCC.includes(x.occasion) ? x.occasion : "Tous les jours",
    season:SEAS.includes(x.season) ? x.season : "Toute l'année",
    notes:x.notes || "",
    image:x.image || "",
    favorite:Boolean(x.favorite),
    wears:Number(x.wears || 0),
    createdAt:x.createdAt || new Date().toISOString()
  };
}

function load(){
  try{
    const raw=localStorage.getItem(KEY);
    if(!raw) return fresh();
    const x=JSON.parse(raw);
    return {
      items:Array.isArray(x.items)?x.items.map(normalize):[],
      outfits:Array.isArray(x.outfits)?x.outfits:[],
      calendar:x.calendar && typeof x.calendar==="object"?x.calendar:{},
      palette:Array.isArray(x.palette)?x.palette:[],
      settings:x.settings && typeof x.settings==="object"?x.settings:{}
    };
  }catch(e){
    console.error("CLOSETIA load error",e);
    return fresh();
  }
}

function save(shouldRender=true){
  try{ localStorage.setItem(KEY,JSON.stringify(db)); }
  catch(e){ alert("Impossible d'enregistrer les données locales. Vérifie l'espace disponible."); console.error(e); return; }
  if(shouldRender) render();
}

function esc(value){
  return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
}

function guess(name){
  const s=(name||"").toLowerCase();
  let category="Haut";
  if(/pantalon|jean|short|jupe/.test(s)) category="Bas";
  else if(/chauss|basket|sneaker|nike|adidas/.test(s)) category="Chaussures";
  else if(/veste|manteau|blouson|gilet/.test(s)) category="Veste";
  else if(/robe/.test(s)) category="Robe";
  else if(/sac|ceinture|casquette|chapeau|lunette|écharpe|foulard/.test(s)) category="Accessoire";
  const color = COLORS.find(c=>s.includes(c.toLowerCase())) || "Autre";
  return {category,color};
}

function addFiles(files){
  Array.from(files || []).forEach(file=>{
    if(!file.type || !file.type.startsWith("image/")) return;
    const reader=new FileReader();
    reader.onload=()=>{
      const baseName=file.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").trim();
      const g=guess(baseName);
      db.items.push(normalize({
        name:baseName || "Vêtement",
        category:g.category,
        color:g.color,
        image:reader.result
      }));
      save();
    };
    reader.onerror=()=>alert("Impossible de lire "+file.name);
    reader.readAsDataURL(file);
  });
}

function download(name,data,type){
  const blob=new Blob([data],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function exportJSON(){
  download("closetia-export.json",JSON.stringify({
    format:"CLOSETIA",version:2,exportedAt:new Date().toISOString(),...db
  },null,2),"application/json");
}

function exportCSV(){
  const rows=[
    ["id","nom","categorie","couleur","occasion","saison","favori","portees","notes"],
    ...db.items.map(x=>[x.id,x.name,x.category,x.color,x.occasion,x.season,x.favorite,x.wears,x.notes])
  ];
  const csv="\ufeff"+rows.map(row=>row.map(v=>'"'+String(v==null?"":v).replace(/"/g,'""')+'"').join(";")).join("\n");
  download("closetia-dressing.csv",csv,"text/csv;charset=utf-8");
}

function importJSON(file){
  if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const x=JSON.parse(reader.result);
      if(!Array.isArray(x.items)) throw new Error("items manquants");
      db={
        items:x.items.map(normalize),
        outfits:Array.isArray(x.outfits)?x.outfits:[],
        calendar:x.calendar && typeof x.calendar==="object"?x.calendar:{},
        palette:Array.isArray(x.palette)?x.palette:[],
        settings:x.settings && typeof x.settings==="object"?x.settings:{}
      };
      save();
      alert("Dressing importé avec succès.");
    }catch(e){
      console.error(e);
      alert("Fichier CLOSETIA invalide.");
    }
  };
  reader.readAsText(file);
}

function closeModal(){
  const m=$("modal");
  if(m) m.remove();
}

function openItem(itemId){
  const item=itemId ? db.items.find(x=>x.id===itemId) : null;
  const modal=document.createElement("div");
  modal.className="modalback";
  modal.id="modal";
  modal.innerHTML=`
    <div class="modal">
      <div class="modalhead"><h2>${item?"Modifier":"Ajouter"} un vêtement</h2><button class="ghost" id="closeModal">✕</button></div>
      <label>Nom<input id="mName" value="${esc(item ? item.name : "")}" placeholder="Ex. T-shirt bleu"></label>
      <label>Catégorie<select id="mCat">${CATS.map(c=>`<option value="${esc(c)}" ${item && item.category===c?"selected":""}>${esc(c)}</option>`).join("")}</select></label>
      <label>Couleur<select id="mColor">${COLORS.map(c=>`<option value="${esc(c)}" ${item && item.color===c?"selected":""}>${esc(c)}</option>`).join("")}</select></label>
      <label>Occasion<select id="mOcc">${OCC.map(c=>`<option value="${esc(c)}" ${item && item.occasion===c?"selected":""}>${esc(c)}</option>`).join("")}</select></label>
      <label>Saison<select id="mSeason">${SEAS.map(c=>`<option value="${esc(c)}" ${item && item.season===c?"selected":""}>${esc(c)}</option>`).join("")}</select></label>
      <label>Notes<textarea id="mNotes" placeholder="Matière, coupe, remarques…">${esc(item ? item.notes : "")}</textarea></label>
      <div class="actions"><button class="primary" id="saveItem">Enregistrer</button><button class="ghost" id="cancelModal">Annuler</button></div>
    </div>`;
  document.body.appendChild(modal);
  $("closeModal").onclick=closeModal;
  $("cancelModal").onclick=closeModal;
  $("saveItem").onclick=()=>saveItem(itemId);
}

function saveItem(itemId){
  let item=itemId ? db.items.find(x=>x.id===itemId) : null;
  if(!item){
    item=normalize({});
    db.items.push(item);
  }
  item.name=$("mName").value.trim() || "Vêtement";
  item.category=$("mCat").value;
  item.color=$("mColor").value;
  item.occasion=$("mOcc").value;
  item.season=$("mSeason").value;
  item.notes=$("mNotes").value.trim();
  closeModal();
  save();
}

function deleteItem(itemId){
  if(!confirm("Supprimer ce vêtement ?")) return;
  db.items=db.items.filter(x=>x.id!==itemId);
  db.outfits=db.outfits.map(o=>({...o,items:(o.items||[]).filter(id=>id!==itemId)}));
  save();
}

function toggleFavorite(itemId){
  const item=db.items.find(x=>x.id===itemId);
  if(!item) return;
  item.favorite=!item.favorite;
  save();
}

function markWorn(itemId){
  const item=db.items.find(x=>x.id===itemId);
  if(!item) return;
  item.wears++;
  save();
}

function generateOutfit(){
  const occasion=$("genOcc") ? $("genOcc").value : "Tous les jours";
  const pool=db.items.filter(x=>occasion==="Tous les jours" || x.occasion===occasion || x.occasion==="Tous les jours");
  if(pool.length<2){
    alert("Ajoute au moins deux vêtements compatibles.");
    return;
  }
  const pick=list=>list[Math.floor(Math.random()*list.length)];
  const chosen=[];
  ["Haut","Bas","Chaussures"].forEach(category=>{
    const candidates=pool.filter(x=>x.category===category);
    if(candidates.length) chosen.push(pick(candidates));
  });
  if(chosen.length<2){
    pool.slice().sort(()=>Math.random()-0.5).slice(0,Math.min(3,pool.length)).forEach(x=>chosen.push(x));
  }
  const unique=[...new Map(chosen.map(x=>[x.id,x])).values()];
  db.outfits.push({
    id:makeId(),
    name:"Tenue "+(db.outfits.length+1),
    occasion,
    items:unique.map(x=>x.id),
    date:new Date().toISOString()
  });
  save();
}

function deleteOutfit(id){
  db.outfits=db.outfits.filter(x=>x.id!==id);
  save();
}

function togglePalette(color){
  if(db.palette.includes(color)) db.palette=db.palette.filter(x=>x!==color);
  else db.palette.push(color);
  save();
}

function setCalendarDay(key){
  const current=db.calendar[key] || "";
  const value=prompt("Nom de la tenue pour "+key+" (vide pour supprimer) :",current);
  if(value===null) return;
  if(value.trim()) db.calendar[key]=value.trim();
  else delete db.calendar[key];
  save();
}

function openSettings(){
  const modal=document.createElement("div");
  modal.className="modalback";
  modal.id="modal";
  modal.innerHTML=`
    <div class="modal">
      <div class="modalhead"><h2>Réglages & données</h2><button class="ghost" id="closeModal">✕</button></div>
      <p class="muted">Les données de CLOSETIA restent sur cet appareil tant que tu ne les exportes pas.</p>
      <div class="actions">
        <button class="ghost" id="exportJSON">Exporter JSON</button>
        <button class="ghost" id="exportCSV">Exporter CSV</button>
        <button class="ghost" id="importJSON">Importer JSON</button>
      </div>
      <hr>
      <button class="danger" id="reset">Réinitialiser CLOSETIA</button>
    </div>`;
  document.body.appendChild(modal);
  $("closeModal").onclick=closeModal;
  $("exportJSON").onclick=exportJSON;
  $("exportCSV").onclick=exportCSV;
  $("importJSON").onclick=()=>{closeModal(); importFile.value=""; importFile.click();};
  $("reset").onclick=()=>{
    if(confirm("Effacer tout le dressing local ?")){
      localStorage.removeItem(KEY);
      location.reload();
    }
  };
}

function demo(){
  const data=[
    ["T-shirt bleu","Haut","Bleu"],
    ["Jean noir","Bas","Noir"],
    ["Baskets blanches","Chaussures","Blanc"],
    ["Veste beige","Veste","Beige"],
    ["Pull gris","Haut","Gris"]
  ];
  db.items=data.map(([name,category,color])=>normalize({
    name,category,color,notes:"Article de démonstration",
    image:"data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="100%" height="100%" fill="${HEX[color]}"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="32" fill="${color==="Blanc"?"#111827":"white"}">${name}</text></svg>`
    )
  }));
  save();
}

function itemCard(item){
  const image=item.image ? `<img src="${item.image}" alt="${esc(item.name)}">` : '<div class="empty">Pas de photo</div>';
  return `
    <article class="card item">
      <div class="photo">${image}<button class="heart ${item.favorite?"on":""}" data-action="favorite" data-id="${item.id}">${item.favorite?"♥":"♡"}</button></div>
      <div class="itembody">
        <h3>${esc(item.name)}</h3>
        <span class="tag">${esc(item.category)}</span>
        <span class="tag">${esc(item.color)}</span>
        <span class="tag">${esc(item.occasion)}</span>
        <p class="muted">${item.wears} port${item.wears>1?"s":""}é${item.wears>1?"s":""}</p>
        <div class="actions">
          <button class="ghost" data-action="edit" data-id="${item.id}">Modifier</button>
          <button class="ghost" data-action="wear" data-id="${item.id}">Porté aujourd'hui</button>
          <button class="danger" data-action="delete" data-id="${item.id}">Supprimer</button>
        </div>
      </div>
    </article>`;
}

function home(){
  return `
    <div class="hero">
      <span class="eyebrow">DRESSING INTELLIGENT · V2</span>
      <h1>Ton style.<br><span>Ton dressing.</span></h1>
      <p>Organise tes vêtements, crée des tenues, suis tes usages et explore les couleurs de ton dressing — sans analyse corporelle.</p>
      <div class="actions">
        <button class="primary" data-action="addPhotos">+ Ajouter des photos</button>
        <a class="ghost" href="#/dressing">Ouvrir mon dressing</a>
        <button class="ghost" data-action="demo">Charger une démo</button>
      </div>
    </div>
    <div class="dashboard">
      <a class="card feature" href="#/dressing"><b>👕 Dressing</b><span>${db.items.length} vêtement${db.items.length>1?"s":""} · recherche · filtres · favoris</span></a>
      <a class="card feature" href="#/tenues"><b>✨ Tenues</b><span>${db.outfits.length} tenue${db.outfits.length>1?"s":""} · générateur</span></a>
      <a class="card feature" href="#/palette"><b>🎨 Couleurs</b><span>Répartition et préférences</span></a>
      <a class="card feature" href="#/calendrier"><b>📅 Calendrier</b><span>Planifier les tenues</span></a>
    </div>`;
}

function dressing(){
  const q=$("q") ? $("q").value.toLowerCase() : "";
  const cat=$("cat") ? $("cat").value : "";
  const col=$("col") ? $("col").value : "";
  const sort=$("sort") ? $("sort").value : "recent";
  let list=db.items.filter(x=>
    (!q || [x.name,x.category,x.color,x.notes].join(" ").toLowerCase().includes(q)) &&
    (!cat || x.category===cat) &&
    (!col || x.color===col)
  );
  if(sort==="name") list.sort((a,b)=>a.name.localeCompare(b.name));
  else if(sort==="wears") list.sort((a,b)=>b.wears-a.wears);
  else list.sort((a,b)=>Number(b.favorite)-Number(a.favorite) || String(b.createdAt).localeCompare(String(a.createdAt)));

  return `
    <div class="section">
      <div class="sectionhead">
        <div><span class="eyebrow">MON DRESSING</span><h1>Vêtements</h1><p class="muted">${list.length} résultat${list.length>1?"s":""}</p></div>
        <button class="primary" data-action="addPhotos">+ Ajouter</button>
      </div>
      <div class="filters">
        <input id="q" placeholder="Rechercher…" value="${esc(q)}">
        <select id="cat"><option value="">Toutes catégories</option>${CATS.map(c=>`<option value="${esc(c)}" ${cat===c?"selected":""}>${esc(c)}</option>`).join("")}</select>
        <select id="col"><option value="">Toutes couleurs</option>${COLORS.map(c=>`<option value="${esc(c)}" ${col===c?"selected":""}>${esc(c)}</option>`).join("")}</select>
        <select id="sort"><option value="recent" ${sort==="recent"?"selected":""}>Favoris d'abord</option><option value="name" ${sort==="name"?"selected":""}>Nom</option><option value="wears" ${sort==="wears"?"selected":""}>Plus portés</option></select>
        <button class="ghost" data-action="newItem">+ Sans photo</button>
      </div>
      <div class="grid">${list.length ? list.map(itemCard).join("") : '<div class="empty">Aucun vêtement. Ajoute une photo ou crée un article.</div>'}</div>
    </div>`;
}

function outfits(){
  const cards=db.outfits.slice().reverse().map(o=>{
    const items=(o.items||[]).map(id=>db.items.find(x=>x.id===id)).filter(Boolean);
    return `
      <article class="card outfit">
        <div class="sectionhead"><div><h3>${esc(o.name)}</h3><span class="tag">${esc(o.occasion)}</span></div><button class="danger" data-action="deleteOutfit" data-id="${o.id}">Supprimer</button></div>
        <div class="mini">${items.map(x=>`<div>${x.image?`<img src="${x.image}" alt="">`:""}<small>${esc(x.name)}</small></div>`).join("")}</div>
      </article>`;
  }).join("");
  return `
    <div class="section">
      <div class="sectionhead"><div><span class="eyebrow">STUDIO</span><h1>Tenues</h1></div></div>
      <div class="card"><div class="toolbar"><select id="genOcc">${OCC.map(x=>`<option>${esc(x)}</option>`).join("")}</select><button class="primary" data-action="generate">✨ Générer une tenue</button></div></div>
      <div class="grid">${cards || '<div class="empty">Aucune tenue enregistrée. Génère ta première tenue.</div>'}</div>
    </div>`;
}

function palette(){
  const total=db.items.length;
  return `
    <div class="section">
      <span class="eyebrow">ANALYSE DU DRESSING</span><h1>Couleurs</h1>
      <p class="muted">Analyse des vêtements présents, pas de ton corps.</p>
      <div class="card">${COLORS.map(c=>{
        const n=db.items.filter(x=>x.color===c).length;
        const p=total ? n/total*100 : 0;
        return `<div class="colorline"><i class="swatch" style="background:${HEX[c]}"></i><b>${c}</b><span>${n}</span><div class="bar"><i style="width:${p}%"></i></div></div>`;
      }).join("")}</div>
      <div class="card" style="margin-top:15px"><h2>Mes couleurs préférées</h2><p class="muted">Clique pour les enregistrer.</p><div class="actions">${COLORS.filter(c=>c!=="Autre").map(c=>`<button class="swatch" title="${c}" style="background:${HEX[c]};outline:${db.palette.includes(c)?"3px solid var(--purple)":"none"}" data-action="palette" data-color="${c}"></button>`).join("")}</div></div>
    </div>`;
}

function calendar(){
  const now=new Date();
  const y=now.getFullYear(), m=now.getMonth();
  const first=new Date(y,m,1).getDay();
  const days=new Date(y,m+1,0).getDate();
  const labels=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
  let html=`<div class="section"><span class="eyebrow">PLANIFICATION</span><h1>Calendrier</h1><div class="card"><div class="monthhead"><h2>${now.toLocaleDateString("fr-FR",{month:"long",year:"numeric"})}</h2><span class="muted">Clique sur un jour</span></div><div class="calendar">${labels.map(x=>`<b>${x}</b>`).join("")}`;
  for(let i=0;i<first;i++) html+="<div></div>";
  for(let d=1;d<=days;d++){
    const key=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const value=db.calendar[key] || "";
    const today=d===now.getDate();
    html+=`<button class="day${today?" today":""}${value?" has":""}" data-action="day" data-day="${key}"><b>${d}</b><small>${esc(value)}</small></button>`;
  }
  return html+"</div></div></div>";
}

function stats(){
  const worn=db.items.slice().sort((a,b)=>b.wears-a.wears).slice(0,5);
  return `
    <div class="section"><span class="eyebrow">TABLEAU DE BORD</span><h1>Statistiques</h1>
      <div class="grid">
        <div class="card stat"><b>${db.items.length}</b><span>vêtements</span></div>
        <div class="card stat"><b>${db.items.filter(x=>x.favorite).length}</b><span>favoris</span></div>
        <div class="card stat"><b>${db.outfits.length}</b><span>tenues créées</span></div>
        <div class="card stat"><b>${db.items.reduce((sum,x)=>sum+x.wears,0)}</b><span>ports enregistrés</span></div>
      </div>
      <div class="card" style="margin-top:20px"><h2>Les plus portés</h2>${worn.length ? worn.map((x,i)=>`<div class="rank"><span>${i+1}. ${esc(x.name)}</span><b>${x.wears}</b></div>`).join("") : '<p class="muted">Enregistre des ports pour voir ton classement.</p>'}</div>
    </div>`;
}

function render(){
  const hash=location.hash || "#/";
  const page=hash.startsWith("#/") ? hash.slice(2) : "";
  const app=$("app");
  if(!app) return;
  document.querySelectorAll("nav a").forEach(a=>a.classList.toggle("active",a.getAttribute("href")==="#/"+page));
  try{
    app.innerHTML=page==="dressing"?dressing():page==="tenues"?outfits():page==="palette"?palette():page==="calendrier"?calendar():page==="stats"?stats():home();
    bindPage();
  }catch(e){
    console.error("CLOSETIA render error",e);
    app.innerHTML='<div class="section"><div class="card"><h1>Erreur de chargement</h1><p>Une erreur JavaScript a empêché cette page de se charger.</p><button class="primary" id="safeReload">Recharger</button></div></div>';
    const b=$("safeReload"); if(b) b.onclick=()=>location.reload();
  }
}

function bindPage(){
  const q=$("q"),cat=$("cat"),col=$("col"),sort=$("sort");
  if(q) q.addEventListener("input",render);
  if(cat) cat.addEventListener("change",render);
  if(col) col.addEventListener("change",render);
  if(sort) sort.addEventListener("change",render);
  document.querySelectorAll("[data-action]").forEach(el=>{
    el.addEventListener("click",()=>{
      const action=el.dataset.action, itemId=el.dataset.id;
      if(action==="addPhotos") photos.click();
      else if(action==="newItem") openItem();
      else if(action==="edit") openItem(itemId);
      else if(action==="delete") deleteItem(itemId);
      else if(action==="favorite") toggleFavorite(itemId);
      else if(action==="wear") markWorn(itemId);
      else if(action==="generate") generateOutfit();
      else if(action==="deleteOutfit") deleteOutfit(itemId);
      else if(action==="palette") togglePalette(el.dataset.color);
      else if(action==="day") setCalendarDay(el.dataset.day);
      else if(action==="demo") demo();
    });
  });
}

if(photos) photos.addEventListener("change",e=>{ addFiles(e.target.files); e.target.value=""; });
if(importFile) importFile.addEventListener("change",e=>{ importJSON(e.target.files[0]); e.target.value=""; });
window.addEventListener("hashchange",render);
window.openSettings=openSettings;
window.openItem=openItem;
window.closeModal=closeModal;
window.render=render;
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
render();
})();