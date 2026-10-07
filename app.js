const KEY="closetia.v2";
const CATS=["Haut","Bas","Chaussures","Veste","Robe","Accessoire","Autre"];
const COLORS=["Noir","Blanc","Gris","Bleu","Vert","Rouge","Rose","Violet","Jaune","Orange","Marron","Beige","Autre"];
const OCC=["Tous les jours","Cours","Sport","Sortie","Élégant"];
const SEAS=["Printemps","Été","Automne","Hiver","Toute l'année"];
const HEX={Noir:"#111827",Blanc:"#f8fafc",Gris:"#94a3b8",Bleu:"#2563eb",Vert:"#16a34a",Rouge:"#dc2626",Rose:"#ec4899",Violet:"#7c3aed",Jaune:"#eab308",Orange:"#f97316",Marron:"#92400e",Beige:"#d6b98c",Autre:"#cbd5e1"};

const $=id=>document.getElementById(id);
const photos=$("photos");
const importFile=$("importFile");
let db=load();

function load(){
  try{
    const x=JSON.parse(localStorage.getItem(KEY)||"null");
    if(x) return {...x,items:Array.isArray(x.items)?x.items.map(normalize):[],outfits:Array.isArray(x.outfits)?x.outfits:[],calendar:x.calendar||{},palette:Array.isArray(x.palette)?x.palette:[],settings:x.settings||{}};
  }catch(e){console.warn("CLOSETIA data load:",e)}
  return {items:[],outfits:[],calendar:{},palette:[],settings:{}};
}
function save(){localStorage.setItem(KEY,JSON.stringify(db));render();}
function esc(x){return String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));}
function id(){return crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random();}
function normalize(x){return{id:x.id||id(),name:x.name||"Vêtement",category:CATS.includes(x.category)?x.category:"Autre",color:COLORS.includes(x.color)?x.color:"Autre",occasion:OCC.includes(x.occasion)?x.occasion:"Tous les jours",season:SEAS.includes(x.season)?x.season:"Toute l'année",notes:x.notes||"",image:x.image||"",favorite:!!x.favorite,wears:Number(x.wears||0),createdAt:x.createdAt||new Date().toISOString()};}
function guess(n){
  const s=n.toLowerCase();
  return {
    category:/pantalon|jean|short|jupe/i.test(s)?"Bas":/chauss|basket|nike|adidas/i.test(s)?"Chaussures":/veste|manteau|blouson/i.test(s)?"Veste":/robe/i.test(s)?"Robe":"Haut",
    color:COLORS.find(c=>s.includes(c.toLowerCase()))||"Autre"
  };
}
function add(files){
  [...(files||[])].forEach(f=>{
    if(!f.type.startsWith("image/"))return;
    const r=new FileReader();
    r.onload=()=>{
      const n=f.name.replace(/\.[^.]+$/,"").replace(/[_-]/g," ");
      db.items.push(normalize({id:id(),name:n||"Vêtement",...guess(n),occasion:"Tous les jours",season:"Toute l'année",notes:"",image:r.result,favorite:false,wears:0}));
      save();
    };
    r.readAsDataURL(f);
  });
}
function download(name,text,type){
  const a=document.createElement("a");
  const u=URL.createObjectURL(new Blob([text],{type}));
  a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),1000);
}
function exportJSON(){download("closetia-export.json",JSON.stringify({format:"CLOSETIA",version:2,exportedAt:new Date().toISOString(),...db},null,2),"application/json");}
function exportCSV(){
  const rows=[["id","nom","categorie","couleur","occasion","saison","favori","portees","notes"],...db.items.map(x=>[x.id,x.name,x.category,x.color,x.occasion,x.season,x.favorite,x.wears,x.notes])];
  const csv="\ufeff"+rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(";")).join("\n");
  download("closetia-dressing.csv",csv,"text/csv;charset=utf-8");
}
function importJSON(f){
  if(!f)return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const x=JSON.parse(r.result);
      if(!Array.isArray(x.items))throw new Error("items");
      db={items:x.items.map(normalize),outfits:Array.isArray(x.outfits)?x.outfits:[],calendar:x.calendar||{},palette:Array.isArray(x.palette)?x.palette:[],settings:x.settings||{}};
      save();alert("Dressing importé avec succès.");
    }catch(e){alert("Fichier CLOSETIA invalide.");}
  };
  r.readAsText(f);
}
function openItem(itemId=null){
  const x=itemId?db.items.find(a=>a.id===itemId):null;
  const modal=document.createElement("div");
  modal.className="modalback";modal.id="modal";
  modal.innerHTML='<div class="modal"><div class="modalhead"><h2>'+(x?"Modifier":"Ajouter")+' un vêtement</h2><button class="ghost" id="closeModal">✕</button></div>'+
    '<label>Nom<input id="mName" value="'+esc(x?.name||"")+'" placeholder="Ex. T-shirt bleu"></label>'+
    '<label>Catégorie<select id="mCat">'+CATS.map(c=>'<option '+(c===(x?.category||"Haut")?"selected":"")+'>'+c+'</option>').join("")+'</select></label>'+
    '<label>Couleur<select id="mColor">'+COLORS.map(c=>'<option '+(c===(x?.color||"Autre")?"selected":"")+'>'+c+'</option>').join("")+'</select></label>'+
    '<label>Occasion<select id="mOcc">'+OCC.map(c=>'<option '+(c===(x?.occasion||"Tous les jours")?"selected":"")+'>'+c+'</option>').join("")+'</select></label>'+
    '<label>Saison<select id="mSeason">'+SEAS.map(c=>'<option '+(c===(x?.season||"Toute l\'année")?"selected":"")+'>'+c+'</option>').join("")+'</select></label>'+
    '<label>Notes<textarea id="mNotes" placeholder="Matière, coupe, remarques…">'+esc(x?.notes||"")+'</textarea></label>'+
    '<div class="actions"><button class="primary" id="saveItem">Enregistrer</button><button class="ghost" id="cancelModal">Annuler</button></div></div>';
  document.body.appendChild(modal);
  $("closeModal").onclick=closeModal;$("cancelModal").onclick=closeModal;$("saveItem").onclick=()=>saveItem(itemId);
}
function saveItem(itemId){
  let x=itemId?db.items.find(a=>a.id===itemId):null;
  if(!x){x={id:id(),image:"",favorite:false,wears:0,createdAt:new Date().toISOString()};db.items.push(x);}
  Object.assign(x,{name:$("mName").value||"Vêtement",category:$("mCat").value,color:$("mColor").value,occasion:$("mOcc").value,season:$("mSeason").value,notes:$("mNotes").value});
  closeModal();save();
}
function closeModal(){$("modal")?.remove();}
function del(i){if(confirm("Supprimer ce vêtement ?")){db.items=db.items.filter(x=>x.id!==i);db.outfits.forEach(o=>o.items=(o.items||[]).filter(id=>id!==i));save();}}
function fav(i){const x=db.items.find(a=>a.id===i);if(x){x.favorite=!x.favorite;save();}}
function wear(i){const x=db.items.find(a=>a.id===i);if(x){x.wears++;save();}}
function generate(){
  const occ=$("genOcc")?.value||"Tous les jours";
  const pool=db.items.filter(x=>occ==="Tous les jours"||x.occasion===occ||x.occasion==="Tous les jours");
  if(pool.length<2)return alert("Ajoute au moins deux vêtements compatibles.");
  const pick=a=>a[Math.floor(Math.random()*a.length)];
  const chosen=[];
  ["Haut","Bas","Chaussures"].forEach(c=>{const a=pool.filter(x=>x.category===c);if(a.length)chosen.push(pick(a));});
  if(!chosen.length)chosen.push(...pool.slice(0,3));
  const unique=[...new Map(chosen.map(x=>[x.id,x])).values()];
  db.outfits.push({id:id(),name:"Tenue "+(db.outfits.length+1),occasion:occ,items:unique.map(x=>x.id),date:new Date().toISOString()});
  save();
}
function deleteOutfit(i){db.outfits=db.outfits.filter(x=>x.id!==i);save();}
function toggleColor(c){db.palette.includes(c)?db.palette=db.palette.filter(x=>x!==c):db.palette.push(c);save();}
function setDay(d){
  const val=prompt("Nom de la tenue pour "+d+" (vide pour supprimer) :",db.calendar[d]||"");
  if(val===null)return;
  if(val.trim())db.calendar[d]=val.trim();else delete db.calendar[d];
  save();
}
function openSettings(){
  const modal=document.createElement("div");modal.className="modalback";modal.id="modal";
  modal.innerHTML='<div class="modal"><div class="modalhead"><h2>Réglages & données</h2><button class="ghost" id="closeModal">✕</button></div><p class="muted">CLOSETIA fonctionne localement sur cet appareil.</p><div class="actions"><button class="ghost" id="exportJSON">Exporter JSON</button><button class="ghost" id="exportCSV">Exporter CSV</button><button class="ghost" id="importJSON">Importer JSON</button></div><hr><button class="danger" id="reset">Réinitialiser CLOSETIA</button></div>';
  document.body.appendChild(modal);
  $("closeModal").onclick=closeModal;$("exportJSON").onclick=exportJSON;$("exportCSV").onclick=exportCSV;
  $("importJSON").onclick=()=>{closeModal();importFile.value="";importFile.click();};
  $("reset").onclick=()=>{if(confirm("Effacer tout le dressing local ?")){localStorage.removeItem(KEY);location.reload();}};
}
function demo(){
  db.items=[["T-shirt bleu","Haut","Bleu"],["Jean noir","Bas","Noir"],["Baskets blanches","Chaussures","Blanc"],["Veste beige","Veste","Beige"],["Pull gris","Haut","Gris"]].map(([name,category,color])=>normalize({id:id(),name,category,color,occasion:"Tous les jours",season:"Toute l'année",notes:"Article de démonstration",image:"data:image/svg+xml;charset=UTF-8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="100%" height="100%" fill="'+HEX[color]+'"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="32" fill="'+(color==="Blanc"?"#111827":"white")+'">'+name+"</text></svg>"),favorite:false,wears:0}));
  save();
}
function itemCard(x){
  return '<article class="card item"><div class="photo">'+(x.image?'<img src="'+x.image+'" alt="'+esc(x.name)+'">':'<div class="empty">Pas de photo</div>')+'<button class="heart '+(x.favorite?"on":"")+'" onclick="fav(\''+x.id+'\')">'+(x.favorite?"♥":"♡")+'</button></div><div class="itembody"><h3>'+esc(x.name)+'</h3><span class="tag">'+esc(x.category)+'</span><span class="tag">'+esc(x.color)+'</span><span class="tag">'+esc(x.occasion)+'</span><p class="muted">'+x.wears+" port"+(x.wears>1?"s":"")+"é"+(x.wears>1?"s":"")+'</p><div class="actions"><button class="ghost" onclick="openItem(\''+x.id+'\')">Modifier</button><button class="ghost" onclick="wear(\''+x.id+'\')">Porté aujourd'hui</button><button class="danger" onclick="del(\''+x.id+'\')">Supprimer</button></div></div></article>';
}
function home(){
  return '<div class="hero"><span class="eyebrow">DRESSING INTELLIGENT · V2</span><h1>Ton style.<br><span>Ton dressing.</span></h1><p>Une application pour organiser tes vêtements, créer des tenues, suivre tes usages et comprendre les couleurs de ton dressing — sans analyse corporelle.</p><div class="actions"><button class="primary" onclick="photos.click()">+ Ajouter des photos</button><a class="ghost" style="padding:11px 14px;border-radius:12px;text-decoration:none" href="#/dressing">Ouvrir mon dressing</a><button class="ghost" onclick="demo()">Charger une démo</button></div></div><div class="dashboard"><a class="card feature" href="#/dressing"><b>👕 Dressing</b><span>'+db.items.length+' vêtement'+(db.items.length>1?"s":"")+' · recherche · filtres · favoris</span></a><a class="card feature" href="#/tenues"><b>✨ Tenues</b><span>'+db.outfits.length+' tenue'+(db.outfits.length>1?"s":"")+' · générateur</span></a><a class="card feature" href="#/palette"><b>🎨 Couleurs</b><span>Répartition et préférences</span></a><a class="card feature" href="#/calendrier"><b>📅 Calendrier</b><span>Planifier les tenues</span></a></div>';
}
function dressing(){
  const q=($("q")?.value||"").toLowerCase(),cat=$("cat")?.value||"",col=$("col")?.value||"",sort=$("sort")?.value||"recent";
  let a=db.items.filter(x=>(!q||[x.name,x.category,x.color,x.notes].join(" ").toLowerCase().includes(q))&&(!cat||x.category===cat)&&(!col||x.color===col));
  a.sort((x,y)=>sort==="name"?x.name.localeCompare(y.name):sort==="wears"?y.wears-x.wears:Number(y.favorite)-Number(x.favorite));
  return '<div class="section"><div class="sectionhead"><div><span class="eyebrow">MON DRESSING</span><h1>Vêtements</h1><p class="muted">'+a.length+" résultat"+(a.length>1?"s":"")+'</p></div><button class="primary" onclick="photos.click()">+ Ajouter</button></div><div class="filters"><input id="q" placeholder="Rechercher…" value="'+esc(q)+'" oninput="render()"><select id="cat" onchange="render()"><option value="">Toutes catégories</option>'+CATS.map(c=>'<option '+(c===cat?"selected":"")+'>'+c+"</option>").join("")+'</select><select id="col" onchange="render()"><option value="">Toutes couleurs</option>'+COLORS.map(c=>'<option '+(c===col?"selected":"")+'>'+c+"</option>").join("")+'</select><select id="sort" onchange="render()"><option value="recent">Favoris d'abord</option><option value="name" '+(sort==="name"?"selected":"")+">Nom</option><option value="wears" "+(sort==="wears"?"selected":"")+">Plus portés</option></select><button class="ghost" onclick="openItem()">+ Sans photo</button></div><div class="grid">'+(a.length?a.map(itemCard).join(""):'<div class="empty">Aucun vêtement. Ajoute une photo ou crée un article.</div>')+"</div></div>";
}
function outfits(){
  return '<div class="section"><div class="sectionhead"><div><span class="eyebrow">STUDIO</span><h1>Tenues</h1></div></div><div class="card"><div class="toolbar"><select id="genOcc">'+OCC.map(x=>"<option>"+x+"</option>").join("")+'</select><button class="primary" onclick="generate()">✨ Générer une tenue</button></div></div><div class="grid">'+(db.outfits.slice().reverse().map(o=>'<article class="card outfit"><div class="sectionhead"><div><h3>'+esc(o.name)+'</h3><span class="tag">'+esc(o.occasion)+'</span></div><button class="danger" onclick="deleteOutfit(\''+o.id+'\')">Supprimer</button></div><div class="mini">'+(o.items||[]).map(i=>db.items.find(x=>x.id===i)).filter(Boolean).map(x=>'<div><img src="'+x.image+'" alt=""><small>'+esc(x.name)+"</small></div>").join("")+"</div></article>").join("")||'<div class="empty">Aucune tenue enregistrée.</div>')+"</div></div>";
}
function palette(){
  const total=db.items.length;
  return '<div class="section"><span class="eyebrow">ANALYSE DU DRESSING</span><h1>Couleurs</h1><p class="muted">Analyse des vêtements présents, pas de ton corps.</p><div class="card">'+COLORS.map(c=>{const n=db.items.filter(x=>x.color===c).length,p=total?n/total*100:0;return '<div class="colorline"><i class="swatch" style="background:'+HEX[c]+'"></i><b>'+c+"</b><span>"+n+'</span><div class="bar"><i style="width:'+p+'%"></i></div></div>';}).join("")+'</div><div class="card" style="margin-top:15px"><h2>Mes couleurs préférées</h2><p class="muted">Clique pour les enregistrer.</p><div class="actions">'+COLORS.filter(x=>x!=="Autre").map(c=>'<button class="swatch" title="'+c+'" style="background:'+HEX[c]+';outline:'+(db.palette.includes(c)?"3px solid var(--purple)":"none")+'" onclick="toggleColor(\''+c+'\')"></button>').join("")+"</div></div></div>";
}
function calendar(){
  const now=new Date(),y=now.getFullYear(),m=now.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),labels=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
  let h='<div class="section"><span class="eyebrow">PLANIFICATION</span><h1>Calendrier</h1><div class="card"><div class="monthhead"><h2>'+now.toLocaleDateString("fr-FR",{month:"long",year:"numeric"})+'</h2><span class="muted">Clique sur un jour</span></div><div class="calendar">'+labels.map(x=>"<b>"+x+"</b>").join("");
  for(let i=0;i<first;i++)h+="<div></div>";
  for(let d=1;d<=days;d++){const key=y+"-"+String(m+1).padStart(2,"0")+"-"+String(d).padStart(2,"0"),today=d===now.getDate()?" today":"",val=db.calendar[key]||"";h+='<button class="day'+today+(val?" has":"")+'" onclick="setDay(\''+key+'\')"><b>'+d+"</b><small>"+esc(val)+"</small></button>";}
  return h+"</div></div></div>";
}
function stats(){
  const worn=[...db.items].sort((a,b)=>b.wears-a.wears).slice(0,5);
  return '<div class="section"><span class="eyebrow">TABLEAU DE BORD</span><h1>Statistiques</h1><div class="grid"><div class="card stat"><b>'+db.items.length+'</b><span>vêtements</span></div><div class="card stat"><b>'+db.items.filter(x=>x.favorite).length+'</b><span>favoris</span></div><div class="card stat"><b>'+db.outfits.length+'</b><span>tenues créées</span></div><div class="card stat"><b>'+db.items.reduce((s,x)=>s+x.wears,0)+'</b><span>port(s) enregistré(s)</span></div></div><div class="card" style="margin-top:20px"><h2>Les plus portés</h2>'+(worn.length?worn.map((x,i)=>'<div class="rank"><span>'+(i+1)+". "+esc(x.name)+"</span><b>"+x.wears+"</b></div>").join(""):'<p class="muted">Enregistre des ports pour voir ton classement.</p>')+"</div></div>";
}
function render(){
  const p=(location.hash||"#/").slice(2)||"";
  const app=$("app");
  if(!app)return;
  document.querySelectorAll("nav a").forEach(a=>a.classList.toggle("active",a.getAttribute("href")==="#/"+p));
  app.innerHTML=p==="dressing"?dressing():p==="tenues"?outfits():p==="palette"?palette():p==="calendrier"?calendar():p==="stats"?stats():home();
}
photos.addEventListener("change",e=>{add(e.target.files);photos.value="";});
importFile.addEventListener("change",e=>{importJSON(e.target.files[0]);importFile.value="";});
window.addEventListener("hashchange",render);
window.openSettings=openSettings;window.openItem=openItem;window.closeModal=closeModal;window.fav=fav;window.wear=wear;window.del=del;window.generate=generate;window.deleteOutfit=deleteOutfit;window.toggleColor=toggleColor;window.setDay=setDay;window.demo=demo;window.render=render;
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
render();
