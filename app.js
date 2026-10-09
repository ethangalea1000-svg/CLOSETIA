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

function fresh(){ return {items:[],outfits:[],calendar:{},palette:[],settings:{profile:{name:"",city:"",styles:[],models:[],brands:[],budget:50,weather:true,colors:[]},colorimetry:{palette:[],status:"Non définie"},friends:[],shared:[]}}; }

function makeId(){
  if(window.crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
}

function normalize(x){
  x = x || {};
  return {
    id:x.id || makeId(),
    name:(x.name && !/^\d[\d _-]*$/.test(String(x.name).trim())) ? String(x.name).trim() : "Vêtement sans nom",
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
      settings:{...fresh().settings,...(x.settings||{}),profile:{...fresh().settings.profile,...((x.settings&&x.settings.profile)||{})},colorimetry:{...fresh().settings.colorimetry,...((x.settings&&x.settings.colorimetry)||{}),palette:Array.isArray(x.settings&&x.settings.colorimetry&&x.settings.colorimetry.palette)?x.settings.colorimetry.palette:[],selectedColors:Array.isArray(x.settings&&x.settings.colorimetry&&x.settings.colorimetry.selectedColors)?x.settings.colorimetry.selectedColors:[]},friends:Array.isArray(x.settings&&x.settings.friends)?x.settings.friends:[],shared:Array.isArray(x.settings&&x.settings.shared)?x.settings.shared:[]}
    };
  }catch(e){
    console.error("CLOSETIA load error",e);
    return fresh();
  }
}

const CLOUD_API = "https://cloud-manager-gateway.ethan-galea1000.workers.dev";
const CLOUD_TOKEN_KEY = "closetia.cloud.session";
let cloudSyncTimer = null;
let cloudSyncRunning = false;
let cloudSyncAgain = false;
let cloudReady = false;
let cloudStatusText = cloudToken() ? "Vérification de la connexion Cloudflare…" : cloudTokenStatusInitial();
let cloudStatusIsError = false;
function cloudTokenStatusInitial(){ return "Non connecté. Les données restent locales."; }

function cloudToken(){
  try{
    const saved=localStorage.getItem(CLOUD_TOKEN_KEY);
    if(saved) return saved;
    const legacy=sessionStorage.getItem(CLOUD_TOKEN_KEY);
    if(legacy){localStorage.setItem(CLOUD_TOKEN_KEY,legacy);return legacy;}
    return "";
  }catch(e){
    try{return sessionStorage.getItem(CLOUD_TOKEN_KEY)||"";}catch(ignore){return "";}
  }
}

async function cloudRequest(path, options={}){
  const headers={"Content-Type":"application/json",...(options.headers||{})};
  const token=cloudToken();
  if(token) headers.Authorization="Bearer "+token;
  const response=await fetch(CLOUD_API+path,{...options,headers});
  let body={};
  try{body=await response.json();}catch(e){}
  if(!response.ok || body.ok===false) throw new Error(body.erreur||body.error||("Erreur Cloudflare HTTP "+response.status));
  return body;
}

function queueCloudSync(){
  if(!cloudToken() || !cloudReady) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer=setTimeout(()=>syncCloudNow().catch(e=>{
    console.warn("CLOSETIA Cloud sync:",e);
    showCloudStatus("Synchronisation en attente : "+e.message,true);
  }),900);
}

async function syncCloudNow(){
  if(!cloudToken() || !cloudReady) return;
  if(cloudSyncRunning){ cloudSyncAgain=true; return; }
  cloudSyncRunning=true;
  try{
    do{
      cloudSyncAgain=false;
      const snapshot=JSON.stringify(db);
      await cloudRequest("/api/closetia/preferences/main",{method:"PUT",body:JSON.stringify({data:JSON.parse(snapshot)})});
      if(snapshot!==JSON.stringify(db)) cloudSyncAgain=true;
      else showCloudStatus("Synchronisé avec Cloudflare D1.",false);
    }while(cloudSyncAgain && cloudToken() && cloudReady);
  }finally{
    cloudSyncRunning=false;
    if(cloudSyncAgain && cloudToken() && cloudReady){
      cloudSyncAgain=false;
      queueCloudSync();
    }
  }
}

function setCloudIndicator(state,label,title){
  const el=$("cloudIndicator");
  if(!el) return;
  el.className="cloud-indicator "+state;
  el.innerHTML='<span class="cloud-dot" aria-hidden="true"></span><span>'+label+'</span>';
  el.title=title||label;
  el.setAttribute("aria-label",title||label);
}
function showCloudStatus(message,isError){
  cloudStatusText=message;
  cloudStatusIsError=Boolean(isError);
  const el=$("cloudStatus");
  if(el){el.textContent=message;el.style.color=isError?"#b45309":"";}
  if(isError || /indisponible|en attente|reconnect/i.test(message)){
    setCloudIndicator("warning","Cloud à vérifier",message);
  }else if(/^Déconnecté/i.test(message) || /Non connecté/i.test(message)){
    setCloudIndicator("local","Mode local","Cloudflare déconnecté. Les données restent sur cet appareil.");
  }else if(/vérification|vérifie/i.test(message)){
    setCloudIndicator("checking","Vérification…",message);
  }else if(/Synchronisé|Données Cloudflare chargées|Connecté à Cloudflare/i.test(message)){
    setCloudIndicator("connected","Cloud connecté",message);
  }
}
async function checkCloudSession(){
  if(!cloudToken()){
    cloudReady=false;
    setCloudIndicator("local","Mode local","Cloudflare non connecté sur cet appareil.");
    return;
  }
  setCloudIndicator("checking","Vérification…","Vérification de la session Cloudflare.");
  try{
    const result=await cloudRequest("/api/closetia/preferences/main",{method:"GET"});
    const candidate=result.record||result.item||result.data;
    const remote=candidate&&candidate.data&&typeof candidate.data==="object"?candidate.data:
      candidate&&Array.isArray(candidate.items)?candidate:null;
    if(remote&&Array.isArray(remote.items)){
      db={
        ...fresh(),
        ...remote,
        items:remote.items.map(normalize),
        outfits:Array.isArray(remote.outfits)?remote.outfits:[],
        calendar:remote.calendar&&typeof remote.calendar==="object"?remote.calendar:{},
        palette:Array.isArray(remote.palette)?remote.palette:[],
        settings:{
          ...fresh().settings,
          ...(remote.settings||{}),
          profile:{...fresh().settings.profile,...((remote.settings&&remote.settings.profile)||{})},
          colorimetry:{...fresh().settings.colorimetry,...((remote.settings&&remote.settings.colorimetry)||{}),palette:Array.isArray(remote.settings&&remote.settings.colorimetry&&remote.settings.colorimetry.palette)?remote.settings.colorimetry.palette:[],selectedColors:Array.isArray(remote.settings&&remote.settings.colorimetry&&remote.settings.colorimetry.selectedColors)?remote.settings.colorimetry.selectedColors:[]},
          friends:Array.isArray(remote.settings&&remote.settings.friends)?remote.settings.friends:[],
          shared:Array.isArray(remote.settings&&remote.settings.shared)?remote.settings.shared:[]
        }
      };
      localStorage.setItem(KEY,JSON.stringify(db));
      render();
      showCloudStatus("Données Cloudflare chargées et synchronisées.",false);
    }else{
      showCloudStatus("Connecté à Cloudflare D1.",false);
    }
    cloudReady=true;
  }catch(e){
    cloudReady=false;
    if(/401|403|connexion requise|jeton|token|authentification/i.test(e.message)){
      try{localStorage.removeItem(CLOUD_TOKEN_KEY);sessionStorage.removeItem(CLOUD_TOKEN_KEY);}catch(ignore){}
      showCloudStatus("Session expirée. Reconnecte-toi à Cloudflare.",true);
    }else{
      showCloudStatus("Cloudflare temporairement injoignable. Vérifie la connexion.",true);
    }
  }
}

async function connectCloudflare(){
  let token=cloudToken();
  try{
    if(!token){
      const password=prompt("Mot de passe CLOSETIA Cloud. Il ne sera pas enregistré en clair.");
      if(password===null) return;
      if(!password){alert("Saisis le mot de passe pour te connecter.");return;}
      const response=await fetch(CLOUD_API+"/api/closetia/login",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})
      });
      let login={};try{login=await response.json();}catch(e){}
      if(!response.ok||login.ok===false||!login.token) throw new Error(login.erreur||login.error||"Connexion refusée. Vérifie le mot de passe.");
      token=login.token;
      localStorage.setItem(CLOUD_TOKEN_KEY,token);
    }else{
      showCloudStatus("Session enregistrée trouvée. Vérification de la connexion…",false);
    }
    showCloudStatus("Connexion établie. Vérification des données…",false);
    let remote=null;
    try{
      const result=await cloudRequest("/api/closetia/preferences/main",{method:"GET"});
      const candidate=result.record||result.item||result.data;
      remote=candidate&&candidate.data&&typeof candidate.data==="object"?candidate.data:
        candidate&&Array.isArray(candidate.items)?candidate:null;
    }catch(e){
      if(!/404|introuvable|not found|aucun|absent/i.test(e.message)) throw e;
    }
    if(remote&&Array.isArray(remote.items)){
      db=remote;
      db.settings={...fresh().settings,...(db.settings||{}),profile:{...fresh().settings.profile,...((db.settings&&db.settings.profile)||{})},colorimetry:{...fresh().settings.colorimetry,...((db.settings&&db.settings.colorimetry)||{})},friends:Array.isArray(db.settings?.friends)?db.settings.friends:[],shared:Array.isArray(db.settings?.shared)?db.settings.shared:[]};
      localStorage.setItem(KEY,JSON.stringify(db));
      render();
      cloudReady=true;
      showCloudStatus("Données Cloudflare chargées et synchronisées.",false);
    }else{
      cloudReady=true;
      await syncCloudNow();
    }
    closeModal();
    openSettings();
  }catch(e){
    if(/401|403|connexion requise|jeton|token|authentification/i.test(e.message)){
      try{localStorage.removeItem(CLOUD_TOKEN_KEY);sessionStorage.removeItem(CLOUD_TOKEN_KEY);}catch(ignore){}
    }
    showCloudStatus("Cloudflare indisponible : "+e.message,true);
    alert("Connexion/synchronisation impossible : "+e.message);
  }
}

function disconnectCloudflare(){
  cloudReady=false;
  clearTimeout(cloudSyncTimer);
  try{localStorage.removeItem(CLOUD_TOKEN_KEY);sessionStorage.removeItem(CLOUD_TOKEN_KEY);}catch(e){}
  showCloudStatus("Déconnecté. Les données restent enregistrées sur cet appareil.",false);
}

function save(shouldRender=true){
  try{ localStorage.setItem(KEY,JSON.stringify(db)); }
  catch(e){ alert("Impossible d'enregistrer les données locales. Vérifie l'espace disponible."); console.error(e); return; }
  queueCloudSync();
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
    const baseName=file.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").trim();
    const g=guess(baseName);
    const reader=new FileReader();
    reader.onload=()=>{
      const img=new Image();
      img.onload=()=>{
        try{
          const scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));
          const canvas=document.createElement("canvas");
          canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
          canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
          canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
          const data=canvas.toDataURL("image/jpeg",0.78);
          db.items.push(normalize({name:(baseName && !/^\d[\d _-]*$/.test(baseName))?baseName:"Vêtement",category:g.category,color:g.color,image:data}));
          save();
        }catch(e){alert("Photo trop lourde pour être enregistrée. Essaie une image plus petite.");console.error(e)}
      };
      img.onerror=()=>alert("Impossible de traiter la photo "+file.name);
      img.src=reader.result;
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
      const defaults=fresh();
      const incoming=x.settings && typeof x.settings==="object"?x.settings:{};
      db={
        items:x.items.map(normalize),
        outfits:Array.isArray(x.outfits)?x.outfits:[],
        calendar:x.calendar && typeof x.calendar==="object"?x.calendar:{},
        palette:Array.isArray(x.palette)?x.palette:[],
        settings:{...defaults.settings,...incoming,profile:{...defaults.settings.profile,...(incoming.profile||{})},colorimetry:{...defaults.settings.colorimetry,...(incoming.colorimetry||{})},friends:Array.isArray(incoming.friends)?incoming.friends:[],shared:Array.isArray(incoming.shared)?incoming.shared:[]}
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
      <label>✏️ Nom du vêtement<input id="mName" value="${esc(item ? item.name : "")}" placeholder="Ex. T-shirt bleu"></label>
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
  const profile=db.settings.profile||{};
  const month=new Date().getMonth();
  const season=month>=2&&month<=4?"Printemps":month>=5&&month<=7?"Été":month>=8&&month<=10?"Automne":"Hiver";
  const pool=db.items.filter(x=>occasion==="Tous les jours"||x.occasion===occasion||x.occasion==="Tous les jours");
  if(pool.length<2){alert("Ajoute au moins deux vêtements compatibles.");return}
  function score(item){
    let n=Math.random()*2;
    if(item.favorite)n+=2;
    if(profile.colors&&profile.colors.includes(item.color))n+=3;
    if(item.season===season||item.season==="Toute l'année")n+=2;
    if(item.occasion===occasion)n+=2;
    if(profile.models&&profile.models.some(m=>String(item.name||"").toLowerCase().includes(m.toLowerCase())))n+=1;
    if(item.wears>0)n+=Math.min(item.wears,5)*.15;
    return n;
  }
  function choose(list){return list.slice().sort((a,b)=>score(b)-score(a))[0]}
  const chosen=[];
  ["Haut","Bas","Chaussures"].forEach(category=>{const candidates=pool.filter(x=>x.category===category);if(candidates.length)chosen.push(choose(candidates))});
  if(chosen.length<2){
    pool.slice().sort((a,b)=>score(b)-score(a)).forEach(x=>{if(chosen.length<Math.min(3,pool.length)&&!chosen.some(y=>y.id===x.id))chosen.push(x)});
  }
  const unique=[...new Map(chosen.map(x=>[x.id,x])).values()];
  db.outfits.push({id:makeId(),name:"Tenue "+(db.outfits.length+1),occasion,items:unique.map(x=>x.id),date:new Date().toISOString(),season});
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
      <p class="muted">Les données sont conservées sur cet appareil. Tu peux aussi activer la synchronisation Cloudflare D1.</p>
      <div class="card" style="margin:12px 0;padding:14px">
        <h3>Synchronisation Cloudflare</h3>
        <p id="cloudStatus" class="muted" style="color:${cloudStatusIsError?"#b45309":""}">${esc(cloudStatusText)}</p>
        <div class="actions">
          <button class="primary" id="connectCloud">Connecter / synchroniser</button>
          <button class="ghost" id="disconnectCloud">Déconnecter</button>
        </div>
      </div>
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
  $("connectCloud").onclick=connectCloudflare;
  $("disconnectCloud").onclick=disconnectCloudflare;
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
  alert("La démo est désactivée : CLOSETIA ne crée pas de faux vêtements.");
}

function itemCard(item){
  const image=item.image ? `<img src="${esc(item.image)}" alt="${esc(item.name)}">` : '<div class="empty">Pas de photo</div>';
  return `
    <article class="card item">
      <div class="photo">${image}<button class="heart ${item.favorite?"on":""}" data-action="favorite" data-id="${item.id}">${item.favorite?"♥":"♡"}</button></div>
      <div class="itembody">
        <h3>${esc(item.name)}</h3>
        <span class="tag">${esc(item.category)}</span>
        <span class="tag">${esc(item.color)}</span>
        <span class="tag">${esc(item.occasion)}</span>
        <p class="muted">${item.wears} porté${item.wears>1?"s":""}</p>
        <div class="actions">
          <button class="ghost" data-action="edit" data-id="${item.id}">Modifier</button>
          <button class="ghost" data-action="wear" data-id="${item.id}">Porté aujourd'hui</button>
          <button class="danger" data-action="delete" data-id="${item.id}">Supprimer</button>
        </div>
      </div>
    </article>`;
}

function saveProfileData(){
  var p=db.settings.profile||{}; p.name=($("profileName")||{}).value||""; p.city=($("profileCity")||{}).value||"";
  p.budget=Number(($("profileBudget")||{}).value||0); p.weather=Boolean(($("profileWeather")||{}).checked);
  p.styles=Array.from(document.querySelectorAll("[data-pref=style]:checked")).map(function(x){return x.value});
  p.models=Array.from(document.querySelectorAll("[data-pref=model]:checked")).map(function(x){return x.value});
  p.impressions=Array.from(document.querySelectorAll("[data-pref=impression]:checked")).map(function(x){return x.value});
  p.patterns=Array.from(document.querySelectorAll("[data-pref=pattern]:checked")).map(function(x){return x.value});
  p.brands=Array.isArray(p.brands)?p.brands:[];
  db.settings.profile=p; save(); alert("Profil enregistré.");
}
function togglePrefColor(c){ db.settings=db.settings||fresh().settings; db.settings.profile=db.settings.profile||fresh().settings.profile; var p=db.settings.profile; p.colors=p.colors||[]; p.colors=p.colors.includes(c)?p.colors.filter(function(x){return x!==c}):p.colors.concat(c); save(); }
function brandCatalog(){
  var p=db.settings.profile||{};
  return "<div class=\"card brand-catalog\"><div class=\"brand-head\"><div><h2>Marques</h2><p class=\"muted\">Recherche dans un catalogue mondial de marques. Les résultats sont chargés à la demande pour ne pas ralentir CLOSETIA.</p></div><span class=\"badge\">Catalogue massif</span></div><div class=\"brand-search\"><input id=\"brandSearch\" placeholder=\"Rechercher une marque…\" autocomplete=\"off\"><button class=\"primary\" data-action=\"searchBrands\">Rechercher</button></div><div id=\"brandResults\" class=\"brand-results\"><p class=\"muted\">Tape au moins 2 caractères.</p></div><div class=\"brand-manual\"><input id=\"manualBrand\" placeholder=\"Marque absente ? Ajouter manuellement\"><button data-action=\"addManualBrand\">Ajouter</button></div></div>";
}
function renderBrandResults(results){
  var box=$("brandResults"); if(!box)return;
  var p=db.settings.profile||{}, fav=p.brands||[];
  if(!results.length){box.innerHTML="<p class=\"muted\">Aucune marque trouvée.</p>";return}
  box.innerHTML=results.slice(0,50).map(function(x){
    var name=typeof x==="string"?x:(x.name||x);
    var selected=fav.includes(name);
    return "<button class=\"brand-result "+(selected?"selected":"")+"\" data-action=\"toggleBrand\" data-brand=\""+esc(name)+"\"><span>"+esc(name)+"</span><b>"+(selected?"✓":"+")+"</b></button>";
  }).join("");
}
async function searchBrands(){
  var input=$("brandSearch"),q=(input&&input.value||"").trim(),box=$("brandResults");
  if(!box)return;
  if(q.length<2){box.innerHTML='<p class="muted">Saisis au moins 2 caractères.</p>';return}
  box.innerHTML='<p class="muted">Recherche de marques dans plusieurs langues…</p>';
  try{
    var queries=[
      "https://www.wikidata.org/w/api.php?action=wbsearchentities&search="+encodeURIComponent(q)+"&language=fr&uselang=fr&type=item&limit=50&format=json&origin=*",
      "https://www.wikidata.org/w/api.php?action=wbsearchentities&search="+encodeURIComponent(q)+"&language=en&uselang=en&type=item&limit=50&format=json&origin=*"
    ];
    var responses=await Promise.all(queries.map(function(url){return fetch(url).then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json()})}));
    var seen={},out=[];
    responses.forEach(function(data){(data.search||[]).forEach(function(x){
      var n=(x.label||"").trim(),d=(x.description||"").toLowerCase();
      var label=n.toLowerCase(),term=q.toLowerCase();
      if(n&&!seen[label]&&(label.includes(term)||/brand|fashion|clothing|apparel|garment|marque|vêtement|mode|sportswear|luxury|designer|footwear|retail|cosmetic|manufacturer|fashion house|fashion brand|entreprise de vêtements/.test(d))){
        seen[label]=1;out.push({name:n,description:x.description||""});
      }
    })});
    out.sort(function(a,b){return (a.name.toLowerCase().startsWith(q.toLowerCase())?-1:0)-(b.name.toLowerCase().startsWith(q.toLowerCase())?-1:0)||a.name.localeCompare(b.name)});
    renderBrandResults(out);
    if(!out.length)box.innerHTML='<p class="muted">Aucun résultat assez fiable. Essaie le nom en anglais ou ajoute la marque manuellement.</p>';
  }catch(e){box.innerHTML='<p class="muted">La recherche en ligne est indisponible. Tu peux ajouter la marque manuellement.</p>'}
}
function toggleBrand(name){
  var p=db.settings.profile||{}; p.brands=p.brands||[];
  p.brands=p.brands.includes(name)?p.brands.filter(function(x){return x!==name}):p.brands.concat(name);
  db.settings.profile=p;save(false);
  var q=(($("brandSearch")||{}).value||"").trim();
  if(q.length>=2) searchBrands();
  else {var box=$("brandResults");if(box)box.innerHTML='<p class="muted">Favori enregistré. Recherche une autre marque ou ajoute-la manuellement.</p>';}
}
function addManualBrand(){
  var el=$("manualBrand"), n=(el&&el.value||"").trim(); if(!n)return;
  toggleBrand(n); if(el)el.value="";
}
function profilePage(){
  var p=db.settings.profile||fresh().settings.profile, styles=["Minimaliste","Streetwear","Casual","Sport","Élégant","Vintage","Créatif","Classique"], models=["T-shirt","Chemise","Pull","Sweat","Jean","Pantalon","Short","Veste","Manteau","Robe","Sneakers","Accessoire"];
  var impressions=["Discret","Élégant","Sportif","Créatif","Décontracté","Sérieux","Confiant","Original","Classique","Streetwear"];
  var patterns=["Uni","Rayures","Carreaux","Fleurs","Léopard / animalier","Camouflage","Logo","Dessin / illustration","Message / slogan","Géométrique","Tie-dye","Imprimé abstrait"];
  function checks(a,k,selected){return a.map(function(x){return "<label class=\"choice\"><input type=\"checkbox\" data-pref=\""+k+"\" value=\""+esc(x)+"\" "+(selected.includes(x)?"checked":"")+"><span>"+esc(x)+"</span></label>"}).join("")}
  return "<div class=\"section\"><span class=\"eyebrow\">PROFIL DE STYLE</span><h1>Mes goûts</h1><p class=\"muted\">Personnalise tes tenues selon l’image que tu souhaites exprimer et les imprimés que tu aimes. Aucune analyse corporelle.</p><div class=\"card profile-card\"><label>Nom affiché<input id=\"profileName\" value=\""+esc(p.name)+"\" placeholder=\"Nom affiché\"></label><label>Ville pour la météo<input id=\"profileCity\" value=\""+esc(p.city)+"\" placeholder=\"Ex. Saint-Rémy-de-Provence\"></label><label>Budget maximum (€)<input id=\"profileBudget\" type=\"number\" min=\"0\" value=\""+Number(p.budget||0)+"\"></label><label class=\"check\"><input id=\"profileWeather\" type=\"checkbox\" "+(p.weather!==false?"checked":"")+"> Adapter les recommandations à la météo</label><h2>Quelle impression veux-tu donner ?</h2><p class=\"muted\">Choisis une ou plusieurs intentions pour guider les idées de tenues.</p><div class=\"choices\">"+checks(impressions,"impression",Array.isArray(p.impressions)?p.impressions:[])+"</div><h2>Quels motifs / imprimés préfères-tu ?</h2><p class=\"muted\">Tu peux sélectionner plusieurs motifs.</p><div class=\"choices\">"+checks(patterns,"pattern",Array.isArray(p.patterns)?p.patterns:[])+"</div><h2>Styles</h2><div class=\"choices\">"+checks(styles,"style",Array.isArray(p.styles)?p.styles:[])+"</div><h2>Modèles préférés</h2><div class=\"choices\">"+checks(models,"model",Array.isArray(p.models)?p.models:[])+"</div>"+brandCatalog()+"<h2>Couleurs favorites</h2><div class=\"actions\">"+COLORS.filter(function(c){return c!=="Autre"}).map(function(c){return "<button class=\"colorchoice "+(p.colors&&p.colors.includes(c)?"selected":"")+"\" data-action=\"prefColor\" data-color=\""+c+"\"><i class=\"swatch\" style=\"background:"+HEX[c]+"\"></i>"+c+"</button>"}).join("")+"</div><button class=\"primary\" id=\"saveProfile\">Enregistrer mon profil</button></div></div>";
}
function colorimetryPage(){
  var c=db.settings.colorimetry||{palette:[],status:"Non définie",selectedColors:[]};
  var palette=Array.isArray(c.palette)?c.palette:[];
  var selected=Array.isArray(c.selectedColors)?c.selectedColors:[];
  return "<div class=\"section\"><span class=\"eyebrow\">COULEURS PERSONNALISÉES</span><h1>Colorimétrie</h1><p class=\"muted\">Cette page aide à explorer les couleurs. Une photo seule ne permet pas de déterminer de façon fiable une saison de colorimétrie personnelle.</p><div class=\"card\"><h2>Extraction de palette depuis une photo</h2><p class=\"muted\">Les échantillons représentent les couleurs dominantes détectées dans l’image, pas un diagnostic personnel. Les couleurs peuvent varier selon la lumière et l’écran.</p><label for=\"colorPhoto\">Choisir une photo</label><input id=\"colorPhoto\" type=\"file\" accept=\"image/*\"><div class=\"photoPalette\">"+palette.map(function(x){var hex=paletteHex(x);return "<div class=\"palette-sample\"><i style=\"background:"+esc(hex)+"\"></i><code>"+esc(hex)+"</code><button class=\"ghost\" type=\"button\" data-action=\"copyHex\" data-hex=\""+esc(hex)+"\">Copier HEX</button></div>"}).join("")+"</div><p class=\"muted\">"+esc(c.status||"Aucune palette extraite pour le moment.")+"</p><button class=\"ghost\" type=\"button\" data-action=\"clearPhotoPalette\">Effacer la palette extraite</button></div><div class=\"card\" style=\"margin-top:15px\"><h2>Mes couleurs appréciées</h2><p class=\"muted\">Sélectionne les couleurs que tu aimes porter. Ce questionnaire mémorise tes préférences, sans prétendre analyser ton sous-ton ou ta saison.</p><div class=\"actions\">"+COLORS.filter(function(x){return x!=="Autre"}).map(function(x){return "<button type=\"button\" class=\"colorchoice "+(selected.includes(x)?"selected":"")+"\" aria-pressed=\""+selected.includes(x)+"\" data-action=\"colorimetryColor\" data-color=\""+x+"\"><i class=\"swatch\" style=\"background:"+HEX[x]+"\"></i>"+x+"</button>"}).join("")+"</div><p class=\"muted\">"+selected.length+" couleur"+(selected.length>1?"s":"")+" sélectionnée"+(selected.length>1?"s":"")+".</p></div></div>";
}
function paletteHex(value){
  var s=String(value||"").trim();
  if(/^#[0-9a-f]{6}$/i.test(s))return s.toUpperCase();
  var match=s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if(match)return "#"+match.slice(1).map(function(n){return Math.max(0,Math.min(255,Number(n))).toString(16).padStart(2,"0")}).join("").toUpperCase();
  return "#808080";
}
function toggleColorimetryColor(color){
  db.settings.colorimetry=db.settings.colorimetry||{palette:[],status:"Non définie",selectedColors:[]};
  var c=db.settings.colorimetry;
  c.selectedColors=Array.isArray(c.selectedColors)?c.selectedColors:[];
  c.selectedColors=c.selectedColors.includes(color)?c.selectedColors.filter(function(x){return x!==color}):c.selectedColors.concat(color);
  save();
}
function copyHex(hex){
  var value=String(hex||"").toUpperCase();
  if(!/^#[0-9A-F]{6}$/.test(value))return;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(value).then(function(){alert(value+" copié.")}).catch(function(){prompt("Copie ce code HEX :",value)});
  }else prompt("Copie ce code HEX :",value);
}
function analyzeColorPhoto(file){
  if(!file)return;
  if(!file.type||!file.type.startsWith("image/")){alert("Choisis un fichier image.");return}
  var img=new Image(),url=URL.createObjectURL(file);
  img.onload=function(){
    try{
      var cv=document.createElement("canvas"),cx=cv.getContext("2d",{willReadFrequently:true});
      var scale=Math.min(1,100/Math.max(img.naturalWidth,img.naturalHeight));
      cv.width=Math.max(1,Math.round(img.naturalWidth*scale));cv.height=Math.max(1,Math.round(img.naturalHeight*scale));
      cx.drawImage(img,0,0,cv.width,cv.height);
      var d=cx.getImageData(0,0,cv.width,cv.height).data,b={};
      for(var i=0;i<d.length;i+=4){
        var r=Math.min(255,Math.round(d[i]/32)*32),g=Math.min(255,Math.round(d[i+1]/32)*32),bl=Math.min(255,Math.round(d[i+2]/32)*32);
        var hex="#"+[r,g,bl].map(function(n){return n.toString(16).padStart(2,"0")}).join("").toUpperCase();
        b[hex]=(b[hex]||0)+1;
      }
      db.settings.colorimetry=db.settings.colorimetry||{palette:[],status:"Non définie",selectedColors:[]};
      db.settings.colorimetry.palette=Object.keys(b).sort(function(a,z){return b[z]-b[a]}).slice(0,6);
      db.settings.colorimetry.status="Palette extraite de la photo";
      save();
    }catch(e){alert("Impossible d’extraire la palette de cette image.");console.error(e)}
    finally{URL.revokeObjectURL(url)}
  };
  img.onerror=function(){URL.revokeObjectURL(url);alert("Impossible de lire cette image.")};
  img.src=url;
}
function shoppingSuggestions(){
  var p=db.settings.profile||{};
  var models=Array.isArray(p.models)&&p.models.length?p.models:["T-shirt","Sweat","Jean","Veste","Sneakers"];
  var brands=Array.isArray(p.brands)?p.brands:[];
  var budget=Number(p.budget||0);
  var stores=[{name:"Zalando",domain:"zalando.fr"},{name:"Kiabi",domain:"kiabi.com"},{name:"H&M",domain:"hm.com"},{name:"Decathlon",domain:"decathlon.fr"}];
  return "<div class=\"card shopping-card\"><span class=\"eyebrow\">IDÉES D’ACHAT</span><h2>Modèles à découvrir</h2><p class=\"muted\">Suggestions basées sur les modèles et marques que tu as choisis. Les liens ouvrent une recherche en magasin : vérifie le prix, la disponibilité, la taille et les conditions avant d’acheter.</p><div class=\"grid\">"+models.slice(0,8).map(function(model){
    var query=[model,brands[0]||"",budget>0?"moins de "+budget+" euros":""].filter(Boolean).join(" ");
    return "<article class=\"card\"><h3>"+esc(model)+"</h3><p class=\"muted\">"+(brands.length?"Marque préférée : "+esc(brands[0]):"Style : "+esc((p.styles||[]).join(", ")||"à personnaliser"))+(budget>0?" · budget indicatif : "+budget+" €":"")+"</p><div class=\"store-links\">"+stores.map(function(store){var q="site:"+store.domain+" "+query;return "<a class=\"store-link\" href=\"https://www.google.com/search?q="+encodeURIComponent(q)+"\" target=\"_blank\" rel=\"noopener noreferrer\">Voir sur "+esc(store.name)+" ↗</a>"}).join("")+"<a class=\"store-link store-link-all\" href=\"https://www.google.com/search?tbm=shop&q="+encodeURIComponent(query)+"\" target=\"_blank\" rel=\"noopener noreferrer\">Comparer les magasins ↗</a></div></article>";
  }).join("")+"</div></div>";
}
function starPage(){
  var p=db.settings.profile||{}, list=db.items.slice().sort(function(a,b){var sa=(b.favorite?5:0)+(p.colors&&p.colors.includes(b.color)?5:0)+b.wears+(p.patterns&&p.patterns.some(function(v){return String(b.notes||"").toLowerCase().includes(v.toLowerCase())})?2:0);var sb=(a.favorite?5:0)+(p.colors&&p.colors.includes(a.color)?5:0)+a.wears+(p.patterns&&p.patterns.some(function(v){return String(a.notes||"").toLowerCase().includes(v.toLowerCase())})?2:0);return sa-sb}).slice(0,8);
  return "<div class=\"section\"><span class=\"eyebrow\">RECOMMANDATIONS</span><h1>⭐ Outfit Star</h1><div id=\"weatherBox\" class=\"card weatherbox\">Chargement de la météo…</div><p class=\"muted\">Pièces favorisées selon tes goûts, tes couleurs, tes favoris et ton historique.</p><div class=\"grid\">"+(list.length?list.map(itemCard).join(""):"<div class=\"empty\">Ajoute des vêtements pour obtenir des recommandations.</div>")+"</div><div style=\"margin-top:24px\">"+shoppingSuggestions()+"</div></div>";
}
function celebrityLooksPage(){
  var celebs=[
    {name:"Zendaya",source:"Vogue"},
    {name:"Timothée Chalamet",source:"GQ"},
    {name:"Jenna Ortega",source:"Vogue"},
    {name:"Dua Lipa",source:"Vogue"},
    {name:"Sabrina Carpenter",source:"People"},
    {name:"A$AP Rocky",source:"GQ"},
    {name:"Bella Hadid",source:"Vogue"},
    {name:"Ryan Gosling",source:"GQ"},
    {name:"Taylor Swift",source:"Vogue"},
    {name:"Pedro Pascal",source:"GQ"},
    {name:"Anya Taylor-Joy",source:"Vogue"},
    {name:"Bad Bunny",source:"GQ"}
  ];
  return "<div class=\"section\"><span class=\"eyebrow\">INSPIRATION MODE</span><h1>Looks récents des stars</h1><p class=\"muted\">Retrouve les dernières apparitions publiques de plusieurs célébrités. Les liens ouvrent des recherches actualisées : la date et la tenue dépendent des articles disponibles, ce n’est pas un flux garanti en temps réel.</p><div class=\"celebrity-grid\">"+celebs.map(function(c){
    var q=c.name+" latest outfit fashion street style red carpet";
    return "<article class=\"card celebrity-card\"><div class=\"celebrity-avatar\" aria-hidden=\"true\">"+esc(c.name.split(" ").map(function(x){return x.charAt(0)}).join("").slice(0,2))+"</div><h2>"+esc(c.name)+"</h2><p class=\"muted\">Tenues récentes · "+esc(c.source)+" et autres médias</p><div class=\"store-links\"><a class=\"store-link\" href=\"https://www.google.com/search?tbm=isch&q="+encodeURIComponent(q)+"\" target=\"_blank\" rel=\"noopener noreferrer\">Voir les photos ↗</a><a class=\"store-link store-link-all\" href=\"https://news.google.com/search?q="+encodeURIComponent(q)+"&hl=fr&gl=FR&ceid=FR%3Afr\" target=\"_blank\" rel=\"noopener noreferrer\">Dernières actualités ↗</a></div></article>";
  }).join("")+"</div><p class=\"muted\">Vérifie la date et le contexte des articles : une recherche d’images peut aussi afficher des looks plus anciens.</p></div>";
}
function friendsPage(){
  var fs=db.settings.friends||[]; return "<div class=\"section\"><span class=\"eyebrow\">SOCIAL</span><h1>Amis</h1><div class=\"card\"><p class=\"muted\">Les amis sont préparés localement. Le partage en ligne sera branché sur D1/R2 ensuite.</p><div class=\"toolbar\"><input id=\"friendName\" placeholder=\"Nom de l’ami\"><button class=\"primary\" data-action=\"addFriend\">Ajouter</button></div></div><div class=\"grid\">"+(fs.length?fs.map(function(x,i){return "<div class=\"card\"><h3>👤 "+esc(x)+"</h3><button class=\"danger\" data-action=\"removeFriend\" data-id=\""+i+"\">Supprimer</button></div>"}).join(""):"<div class=\"empty\">Aucun ami.</div>")+"</div></div>";
}
function addFriend(){var n=(($("friendName")||{}).value||"").trim();if(!n)return;var fs=db.settings.friends||[];if(fs.some(function(x){return String(x).toLowerCase()===n.toLowerCase()})){alert("Cet ami est déjà dans la liste.");return}db.settings.friends=fs.concat(n);save()}
function removeFriend(i){db.settings.friends.splice(Number(i),1);save()}
function smartWeather(){
  var p=db.settings.profile||{}, box=$("weatherBox");
  if(!box)return;
  var city=(p.city||"Saint-Rémy-de-Provence").trim();
  box.textContent="Chargement de la météo pour "+city+"…";
  fetch("https://geocoding-api.open-meteo.com/v1/search?name="+encodeURIComponent(city)+"&count=1&language=fr&format=json")
    .then(function(r){if(!r.ok)throw new Error("Géocodage indisponible");return r.json()})
    .then(function(g){
      var x=g.results&&g.results[0];if(!x)throw new Error("Ville introuvable");
      var url="https://api.open-meteo.com/v1/forecast?latitude="+x.latitude+"&longitude="+x.longitude+"&current=temperature_2m,rain,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=auto";
      return fetch(url).then(function(r){if(!r.ok)throw new Error("Météo indisponible");return r.json()}).then(function(w){
        var current=w.current||{}, daily=w.daily||{};
        var advice=Number(current.rain)>0||Number(daily.precipitation_probability_max&&daily.precipitation_probability_max[0])>=50?"Prévois une veste imperméable ou un parapluie.":Number(current.temperature_2m)<12?"Une couche chaude peut être utile.":Number(current.temperature_2m)>25?"Privilégie une tenue légère et confortable.":"Conditions plutôt modérées : choisis selon ton confort.";
        var days=(daily.time||[]).map(function(day,i){var date=new Date(day+"T12:00:00");return "<span class=\"weather-day\"><b>"+date.toLocaleDateString("fr-FR",{weekday:"short"})+"</b> "+daily.temperature_2m_min[i]+"–"+daily.temperature_2m_max[i]+"°C · pluie "+(daily.precipitation_probability_max[i]??0)+"%</span>"}).join("");
        box.innerHTML="<b>🌤️ "+esc(x.name)+"</b><span>Maintenant : "+current.temperature_2m+"°C · pluie "+current.rain+" mm · vent "+current.wind_speed_10m+" km/h</span><p>"+esc(advice)+"</p><div class=\"weather-days\">"+days+"</div><small>Données : <a href=\"https://open-meteo.com/\" target=\"_blank\" rel=\"noopener\">Open-Meteo</a></small>";
      });
    }).catch(function(){box.textContent="Météo indisponible. Vérifie la ville et ta connexion."});
}
function getColorHarmony(){
  var box=$("harmonyResults");if(!box)return;
  var chosen=db.palette[0]||((db.items.find(function(x){return x.color&&x.color!=="Autre"})||{}).color)||"Bleu";
  var hex=(HEX[chosen]||HEX.Bleu).replace("#","");
  box.innerHTML="<p class=\"muted\">Recherche de couleurs coordonnées…</p>";
  fetch("https://www.thecolorapi.com/scheme?hex="+encodeURIComponent(hex)+"&mode=analogic&count=6&format=json")
    .then(function(r){if(!r.ok)throw new Error("API couleurs indisponible");return r.json()})
    .then(function(data){
      var colors=data.colors||[];
      if(!colors.length)throw new Error("Aucune couleur reçue");
      box.innerHTML="<p>Harmonie basée sur <b>"+esc(chosen)+"</b> — palette analogique suggérée par The Color API.</p><div class=\"harmony-swatches\">"+colors.map(function(c){return "<div title=\""+esc(c.name&&c.name.value||c.hex.value)+"\"><i style=\"background:"+esc(c.hex.value)+"\"></i><b>"+esc(c.hex.value)+"</b><small>"+esc(c.name&&c.name.value||"Couleur")+"</small></div>"}).join("")+"</div><small>Les harmonies sont des suggestions de couleurs, pas une analyse de colorimétrie personnelle.</small>";
    }).catch(function(){box.textContent="Service de couleurs indisponible. Tu peux toujours utiliser tes couleurs enregistrées."});
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
        
      </div>
    </div>
    <div class="card weatherbox home-weather" id="weatherBox" style="margin-top:18px">Chargement de la météo…</div>
    <div class="dashboard">
      <a class="card feature" href="#/dressing"><b>👕 Dressing</b><span>${db.items.length} vêtement${db.items.length>1?"s":""} · recherche · filtres · favoris</span></a>
      <a class="card feature" href="#/tenues"><b>✨ Tenues</b><span>${db.outfits.length} tenue${db.outfits.length>1?"s":""} · générateur</span></a>
      <a class="card feature" href="#/palette"><b>🎨 Couleurs</b><span>Répartition et préférences</span></a>
      <a class="card feature" href="#/calendrier"><b>📅 Calendrier</b><span>Planifier les tenues</span></a><a class="card feature" href="#/profil"><b>🧭 Mon style</b><span>Questionnaire · marques · budget</span></a><a class="card feature" href="#/colorimetrie"><b>🎨 Colorimétrie</b><span>Photo + préférences couleurs</span></a><a class="card feature" href="#/star"><b>⭐ Outfit Star</b><span>Recommandations personnalisées</span></a><a class="card feature" href="#/amis"><b>👥 Amis</b><span>Préparer le partage de tenues</span></a>
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
        <div class="mini">${items.map(x=>`<div>${x.image?`<img src="${esc(x.image)}" alt="">`:""}<small>${esc(x.name)}</small></div>`).join("")}</div>
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
      <div class="card" style="margin-top:15px"><h2>Harmonies de couleurs</h2><p class="muted">Génère une palette coordonnée depuis ta première couleur favorite ou une couleur de ton dressing.</p><button class="primary" data-action="colorHarmony">Trouver une harmonie</button><div id="harmonyResults" style="margin-top:12px"></div></div><div class="card" style="margin-top:15px"><h2>Mes couleurs préférées</h2><p class="muted">Clique pour les enregistrer.</p><div class="actions">${COLORS.filter(c=>c!=="Autre").map(c=>`<button class="swatch" title="${c}" style="background:${HEX[c]};outline:${db.palette.includes(c)?"3px solid var(--purple)":"none"}" data-action="palette" data-color="${c}"></button>`).join("")}</div></div>
    </div>`;
}

let calendarOffset=0;
let holidayCache={};
function calendar(){
  const now=new Date();
  const monthDate=new Date(now.getFullYear(),now.getMonth()+calendarOffset,1);
  const y=monthDate.getFullYear(),m=monthDate.getMonth();
  const first=(new Date(y,m,1).getDay()+6)%7;
  const days=new Date(y,m+1,0).getDate();
  const labels=["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];
  const holidays=holidayCache[y]||{};
  let html=`<div class="section"><span class="eyebrow">PLANIFICATION</span><h1>Calendrier</h1><div class="card"><div class="monthhead"><button data-action="calendarPrev" aria-label="Mois précédent">←</button><h2>${monthDate.toLocaleDateString("fr-FR",{month:"long",year:"numeric"})}</h2><button data-action="calendarNext" aria-label="Mois suivant">→</button></div><p class="muted">Clique sur un jour pour noter une tenue. Les jours fériés français sont signalés lorsqu’ils sont disponibles.</p><div class="calendar">${labels.map(x=>`<b>${x}</b>`).join("")}`;
  for(let i=0;i<first;i++)html+="<div></div>";
  for(let d=1;d<=days;d++){
    const key=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const value=db.calendar[key]||"";
    const holiday=holidays[key];
    const today=y===now.getFullYear()&&m===now.getMonth()&&d===now.getDate();
    html+=`<button class="day${today?" today":""}${value?" has":""}${holiday?" holiday":""}" data-action="day" data-day="${key}" title="${esc(holiday||value||key)}"><b>${d}</b><small>${esc(value||holiday||"")}</small></button>`;
  }
  html+="</div></div></div>";
  if(!holidayCache[y])loadHolidays(y);
  return html;
}
function loadHolidays(year){
  fetch("https://date.nager.at/api/v3/PublicHolidays/"+year+"/FR")
    .then(function(r){if(!r.ok)throw new Error("jours fériés indisponibles");return r.json()})
    .then(function(rows){
      var map={};rows.forEach(function(h){map[h.date]=h.localName||h.name});
      holidayCache[year]=map;
      var shown=new Date(new Date().getFullYear(),new Date().getMonth()+calendarOffset,1);if(location.hash==="#/calendrier"&&shown.getFullYear()===year)render();
    }).catch(function(){holidayCache[year]={};});
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
  const active=document.activeElement;
  const activeId=active&&active.id;
  const selectionStart=active&&typeof active.selectionStart==="number"?active.selectionStart:null;
  const selectionEnd=active&&typeof active.selectionEnd==="number"?active.selectionEnd:null;
  document.querySelectorAll("nav a").forEach(a=>a.classList.toggle("active",a.getAttribute("href")==="#/"+page));
  try{
    app.innerHTML=page==="dressing"?dressing():page==="tenues"?outfits():page==="palette"?palette():page==="profil"?profilePage():page==="colorimetrie"?colorimetryPage():page==="star"?starPage():page==="stars"?celebrityLooksPage():page==="amis"?friendsPage():page==="calendrier"?calendar():page==="stats"?stats():home();
    bindPage();
    if(activeId){
      const replacement=$(activeId);
      if(replacement){
        replacement.focus({preventScroll:true});
        if(selectionStart!==null && typeof replacement.setSelectionRange==="function"){
          try{replacement.setSelectionRange(selectionStart,selectionEnd);}catch(ignore){}
        }
      }
    }
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
      else if(action==="palette") togglePalette(el.dataset.color); else if(action==="colorHarmony") getColorHarmony();
      else if(action==="colorimetryColor") toggleColorimetryColor(el.dataset.color);
      else if(action==="copyHex") copyHex(el.dataset.hex);
      else if(action==="clearPhotoPalette"){db.settings.colorimetry=db.settings.colorimetry||{};db.settings.colorimetry.palette=[];db.settings.colorimetry.status="Palette effacée";save();}
      else if(action==="day") setCalendarDay(el.dataset.day); else if(action==="calendarPrev"){calendarOffset--;render()} else if(action==="calendarNext"){calendarOffset++;render()}
      else if(action==="demo") demo(); else if(action==="prefColor") togglePrefColor(el.dataset.color); else if(action==="searchBrands") searchBrands(); else if(action==="toggleBrand") toggleBrand(el.dataset.brand); else if(action==="addManualBrand") addManualBrand(); else if(action==="addFriend") addFriend(); else if(action==="removeFriend") removeFriend(el.dataset.id);
    });
  });
  if($("saveProfile")) $("saveProfile").onclick=saveProfileData;
  if($("colorPhoto")) $("colorPhoto").onchange=function(e){analyzeColorPhoto(e.target.files[0])};
  if(location.hash==="#/star"||location.hash==="#/"||location.hash==="#") setTimeout(smartWeather,50);
}

if(photos) photos.addEventListener("change",e=>{ addFiles(e.target.files); e.target.value=""; });
if(importFile) importFile.addEventListener("change",e=>{ importJSON(e.target.files[0]); e.target.value=""; });
window.addEventListener("hashchange",render);
window.openSettings=openSettings;
window.openItem=openItem;
window.closeModal=closeModal;
window.render=render;
db.settings={...fresh().settings,...(db.settings||{}),profile:{...fresh().settings.profile,...((db.settings&&db.settings.profile)||{})},colorimetry:{...fresh().settings.colorimetry,...((db.settings&&db.settings.colorimetry)||{})},friends:Array.isArray(db.settings?.friends)?db.settings.friends:[],shared:Array.isArray(db.settings?.shared)?db.settings.shared:[]};
db.items.forEach(item => {
  if(/^\d[\d _-]*$/.test(String(item.name || "").trim())){
    item.name = "Vêtement sans nom";
  }
});
save(false);
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
render();
checkCloudSession();
})();