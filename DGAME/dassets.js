/* ============================================================
   dassets.js — IMMAGINI E SUONI (sistema ripreso dal vecchio gioco: constants.js)
   ============================================================
   Tutto è FACOLTATIVO: se un file in img/ o sfx/ manca, il gioco usa le emoji e resta in silenzio,
   esattamente come prima. Nessuna regola di gioco passa di qui: sono solo grafica e audio.

   CARTELLE (accanto al file html):  img/  e  sfx/   (stessi nomi file del vecchio gioco)
   CARICAMENTO: dopo dcardsui2.js e prima dello script principale.
   Per cambiare nomi file, dimensioni o abbinamenti di suoni basta modificare le tabelle qui sotto.
   ============================================================ */

// ============================================================
// SUONI  (stessi file e stessa funzione playSFX del vecchio gioco)
// ============================================================
const SFX_DIR = 'sfx/';
const SFX_FILES = {
  intro:'sfx-intro.mp3', laser:'sfx-laser.mp3', melee:'sfx-melee.mp3', move:'sfx-move.mp3', build:'sfx-build.mp3',
  heal:'sfx-heal.wav', click:'sfx-click.mp3', airdrop:'sfx-airdrop.mp3', shield:'sfx-shield.mp3', cards4:'sfx-cards4.mp3',
  emp:'sfx-emp.mp3', explosion:'sfx-explosion.mp3', crollo:'sfx-crollo.mp3', uzi:'sfx-uzi.mp3', boom:'sfx-boom.mp3',
  bgMusic:'sfx-bg_music.mp3',
  fMusic1:'sfx-verde.mp3', fMusic2:'sfx-viola.mp3', fMusic3:'sfx-blu.mp3', fMusic4:'sfx-oro.mp3', fMusic5:'sfx-rosso.mp3',
  fMusic6:'sfx-bianco.mp3', fMusic7:'sfx-grigio.mp3', fMusic8:'sfx-rosa.mp3'   // tracce di fazione (numero = slot della fazione, vedi FACTION_IMG)
};
const isMusicKey = k => k==='bgMusic' || k.startsWith('fMusic');
const MUSIC_VOLUME = 0.10;
const SFX = {};
Object.entries(SFX_FILES).forEach(([k,f])=>{
  try{
    const a = new Audio(SFX_DIR+f);
    a.preload = isMusicKey(k) ? 'none' : 'auto';
    a.addEventListener('error',()=>{ a._broken = true; });   // file mancante: quel suono resta muto
    SFX[k] = a;
  }catch(e){}
});
if(SFX.bgMusic){ SFX.bgMusic.loop = true; SFX.bgMusic.volume = MUSIC_VOLUME; }

let sfxOn = true, musicOn = true;                                // la musica parte da sola all'avvio (se non l'hai spenta tu)
let sfxVol = 1.0;                                                 // volume degli effetti (0-1)
let musicVol = MUSIC_VOLUME, curTrack = 'bgMusic';                // volume scelto e traccia corrente (come nel vecchio gioco)
try{ sfxOn = localStorage.getItem('dw_sfx') !== '0'; musicOn = localStorage.getItem('dw_music') !== '0'; const v = parseFloat(localStorage.getItem('dw_sfxvol')); if(v >= 0 && v <= 1) sfxVol = v; }catch(e){}

let lastClickSfx = 0;
function playSFX(effect){
  if(!sfxOn || sfxVol <= 0) return;
  if(effect==='click'){ const n = Date.now(); if(n-lastClickSfx<150) return; lastClickSfx = n; }   // niente doppio click se l'azione ha già il suo click
  const audio = SFX[effect];
  if(!audio || audio._broken) return;
  try{
    audio.pause(); audio.currentTime = 0;
    const baseRate = 0.95 + Math.random()*0.1;           // leggera variazione di velocità: spari e passi meno meccanici
    audio.playbackRate = baseRate; audio.volume = sfxVol;
    const pr = audio.play(); if(pr !== undefined) pr.catch(()=>{});
    if(['laser','melee','move','uzi','boom'].includes(effect) && Math.random() < 0.5){   // a volte un secondo suono quasi sovrapposto: più "corposo"
      setTimeout(()=>{
        try{
          const clone = audio.cloneNode();
          clone.playbackRate = baseRate + (Math.random()*0.08 - 0.04); clone.volume = 0.6 * sfxVol;
          const cp = clone.play(); if(cp !== undefined) cp.catch(()=>{});
          clone.onended = () => { clone.src = ''; };
        }catch(e){}
      }, 25 + Math.floor(Math.random()*35));
    }
  }catch(e){}
}

// ---------- MUSICA: pulsante on/off + menu con volume e tracce (stesso sistema del vecchio gioco) ----------
const MUSIC_MENU_MS = 4000;                                      // il menu si richiude da solo dopo questi ms senza toccarlo
const musicTracks = () => [{id:'bgMusic', name:'🎵 Battle Theme', color:'#00ff88'},
  ...Object.entries(FACTION_IMG).map(([col,f])=>({id:'fMusic'+f.slot, name:'Fazione '+((PALETTE.find(p=>p.color===col)||{}).name || f.prefix), color:col}))];   // una traccia per ogni fazione che ha il suo gruppo di immagini
function stopAllMusic(){ Object.keys(SFX).filter(isMusicKey).forEach(k=>{ try{ SFX[k].pause(); SFX[k].currentTime = 0; }catch(e){} }); }
function playTrack(){                                            // fa partire la traccia corrente (solo se la musica è accesa)
  const m = SFX[curTrack]; if(!m || m._broken) return;
  m.loop = true; m.volume = musicVol;
  if(musicOn){ const pr = m.play(); if(pr !== undefined) pr.catch(()=>{}); }
}
function selectTrack(id){
  if(!SFX[id]) return;
  if(id===curTrack && musicOn && !SFX[id].paused){ refreshMusicMenu(); return; }   // è già quella in riproduzione: non ripartire da capo
  stopAllMusic(); curTrack = id; playTrack(); refreshMusicMenu();
}
function playFactionMusic(color){                                // scegliendo il colore di fazione parte la sua traccia (come nel vecchio gioco)
  const f = FACTION_IMG[color]; if(f) selectTrack('fMusic'+f.slot);
}
function setMusic(on){
  musicOn = on; try{ localStorage.setItem('dw_music', on ? '1' : '0'); }catch(e){}
  stopAllMusic(); if(on) playTrack();
  refreshAudioButtons();
  if(on) showMusicMenu(); else hideMusicMenu();                  // acceso: appare il menu; spento: sparisce
}
let musicMenu = null, musicMenuTimer = 0;
function resetMusicMenuTimer(){ clearTimeout(musicMenuTimer); musicMenuTimer = setTimeout(hideMusicMenu,MUSIC_MENU_MS); }
function hideMusicMenu(){ clearTimeout(musicMenuTimer); if(musicMenu) musicMenu.style.display = 'none'; }
function refreshMusicMenu(){
  if(!musicMenu) return;
  musicMenu.querySelectorAll('.jbtn').forEach(b=>{
    const on = b.dataset.track===curTrack;
    b.style.color = on ? '#00ff88' : '#aaa'; b.style.borderColor = on ? '#00ff88' : '#333'; b.style.background = on ? 'rgba(0,255,136,.1)' : 'transparent';
  });
}
function showMusicMenu(anchorId='musicBtn'){
  if(!musicMenu){
    musicMenu = document.createElement('div'); musicMenu.id = 'musicMenu';
    musicMenu.style.cssText = 'position:fixed;z-index:200001;display:none;flex-direction:column;gap:8px;padding:10px;background:rgba(5,5,15,.95);border:2px solid #00ff88;border-radius:6px;box-shadow:0 0 15px #00ff8866;font-family:"Courier New",monospace';
    musicMenu.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px;padding-bottom:6px;border-bottom:1px solid #333">`
      + `<div style="display:flex;align-items:center;gap:8px"><span title="Musica" style="color:#00ff88;font-size:16px;line-height:1">🎵</span>`
      + `<input type="range" id="musicVol" min="0" max="1" step="0.05" value="${musicVol}" style="width:140px;accent-color:#00ff88;cursor:pointer"></div>`
      + `<div style="display:flex;align-items:center;gap:8px"><span title="Effetti" style="color:#00ff88;font-size:16px;line-height:1">🔊</span>`
      + `<input type="range" id="sfxVol" min="0" max="1" step="0.05" value="${sfxVol}" style="width:140px;accent-color:#00ff88;cursor:pointer"></div></div>`
      + `<div style="display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;padding-right:4px">`
      + musicTracks().map(t=>`<button class="jbtn" data-track="${t.id}" style="margin:0;padding:6px 8px;background:transparent;border:1px solid #333;color:#aaa;text-align:left;cursor:pointer;border-radius:4px;white-space:nowrap;font:12px 'Courier New',monospace"><span style="color:${t.color}">■</span> ${t.name}</button>`).join('') + '</div>';
    document.body.appendChild(musicMenu);
    musicMenu.querySelector('#musicVol').addEventListener('input',e=>{ musicVol = parseFloat(e.target.value); const m = SFX[curTrack]; if(m) m.volume = musicVol; resetMusicMenuTimer(); });
    const sv = musicMenu.querySelector('#sfxVol');
    sv.addEventListener('input',e=>{ sfxVol = parseFloat(e.target.value); try{ localStorage.setItem('dw_sfxvol', String(sfxVol)); }catch(err){} resetMusicMenuTimer(); });
    sv.addEventListener('change',()=>playSFX('laser'));            // al rilascio: un suono di prova al nuovo volume
    musicMenu.addEventListener('click',e=>{ const b = e.target.closest('.jbtn'); if(b) selectTrack(b.dataset.track); resetMusicMenuTimer(); });
    musicMenu.addEventListener('pointerdown',resetMusicMenuTimer);
    musicMenu.addEventListener('mouseenter',()=>clearTimeout(musicMenuTimer));      // col mouse sopra il menu non si chiude
    musicMenu.addEventListener('mouseleave',resetMusicMenuTimer);
  }
  musicMenu.style.display = 'flex';
  const mb = document.getElementById(anchorId);                  // accanto al pulsante, dentro lo schermo
  if(mb){
    const r = mb.getBoundingClientRect(), w = musicMenu.offsetWidth, h = musicMenu.offsetHeight;
    musicMenu.style.left = Math.max(4,Math.min(r.right+8,innerWidth-w-4))+'px';
    musicMenu.style.top  = Math.max(4,Math.min(r.top,innerHeight-h-4))+'px';
  }
  refreshMusicMenu(); resetMusicMenuTimer();
}
function refreshAudioButtons(){
  const sb = document.getElementById('sfxBtn'), mb = document.getElementById('musicBtn');
  if(sb){ sb.textContent = sfxOn ? '🔊 Suoni' : '🔇 Suoni'; sb.style.color = sfxOn ? '#00ff88' : '#ff4444'; }
  if(mb){ mb.textContent = musicOn ? '🎵 ON' : '🎵 OFF'; mb.style.color = musicOn ? '#00ff88' : '#ff4444'; }
}
(function(){                                                   // due pulsanti nella barra laterale, creati qui (il modulo è autonomo)
  const fit = document.getElementById('fitBtn'); if(!fit) return;
  const sb = document.createElement('button'), mb = document.createElement('button');
  sb.id = 'sfxBtn'; mb.id = 'musicBtn';
  sb.onclick = () => { sfxOn = !sfxOn; try{ localStorage.setItem('dw_sfx', sfxOn ? '1' : '0'); }catch(e){} refreshAudioButtons(); if(sfxOn) showMusicMenu('sfxBtn'); else hideMusicMenu(); };
  mb.onclick = () => setMusic(!musicOn);
  fit.after(sb, mb); refreshAudioButtons();
})();
// Avvio automatico della musica di sottofondo (sfx-bg_music.mp3). Il browser può bloccarla finché non si tocca lo schermo:
// in quel caso riparte da sola al primo tocco o tasto.
function armMusicUnlock(){
  const evs = ['pointerup','click','touchend','keydown'];
  const go = () => { evs.forEach(n=>document.removeEventListener(n,go,true)); const m = SFX[curTrack]; if(musicOn && m && m.paused) playTrack(); };
  evs.forEach(n=>document.addEventListener(n,go,true));
}
(function autoStartMusic(){
  const m = SFX[curTrack]; if(!musicOn || !m) return;
  m.loop = true; m.volume = musicVol;
  const pr = m.play();
  if(pr !== undefined) pr.catch(armMusicUnlock);                // bloccata dal browser: aspetta il primo tocco
})();
document.addEventListener('click',e=>{ if(e.target.closest('button')) playSFX('click'); });   // click su qualsiasi pulsante (anche quelli del menu, creati al volo)

// Quale suono per quale azione. Per i colpi d'area e le carte si legge l'evento che il nucleo già manda (stesso canale di lampo e banner), così suona uguale anche online.
const SFX_ACTION = {move:'move', collect:'shield', heal:'heal', construct:'build', createUnit:'build', endTurn:'airdrop',   // collect: raccolta risorse · endTurn: come nel vecchio gioco
  defend:'shield', domeShield:'shield', airdrop:'airdrop', fortino:'build', placeTile:'click', chooseColor:'click', placeBase:'build', confirmCards:'cards4',
  techArmor:'cards4'};                                  // top-tech: armatura data a un'unità o base
const SFX_FLASH  = {shell:'boom', nuke:'boom', smoke:'click'};   // il colpo di artiglieria/silo/nucleare fa sfx-boom; la distruzione fa il suo suono (vedi sfxFor)
// Attivazione delle carte, come nel vecchio gioco (cards.js): Blitz heal · Airdrop nessun suono all'attivazione (airdrop all'atterraggio) · Cecchino cards4 · EMP emp · Esplosivo cards4 ·
// Spettro airdrop · Scudo shield · Fortino cards4 (poi build a ogni barricata) · MediBuff heal · Upgrade heal
const SFX_CARD   = {C01:'heal', C02:'airdrop', C03:'cards4', C04:'emp', C05:'cards4', C06:'airdrop', C07:'shield', C08:'cards4', C09:'heal', C10:'heal'};
function sfxFor(a,res){                                        // chiamata da handleResult a ogni azione riuscita
  if(!res || !res.ok) return;
  const k = SFX_ACTION[a.t]; if(k) playSFX(k);
  const evs = res.events||[], done = new Set();
  const lagMs = fxLag(evs);                                                                 // ms di volo di artiglieria/silo/nucleare: le distruzioni suonano all'arrivo del colpo (0 = subito)
  const once = (id,fn) => { if(!done.has(id)){ done.add(id); fn(); } };                     // un solo suono per tipo a ogni azione (es. 3 unità distrutte = 1 esplosione)
  evs.forEach(ev=>{
    if(ev.t==='shot') once('shot',()=>playSFX(ev.dist===1 ? 'melee' : (Math.random() < 0.30 ? 'uzi' : 'laser')));   // come nel vecchio gioco: corpo a corpo, oppure 30% uzi e 70% laser
    else if(ev.t==='flash' && SFX_FLASH[ev.kind]) once('flash'+ev.kind,()=>{
      const wait = fxStrikeWait(ev);
      if(!wait){ playSFX(SFX_FLASH[ev.kind]); return; }               // fumogeno: subito
      playSFX('airdrop');                                             // partenza del colpo, come nella campagna del vecchio gioco
      setTimeout(()=>playSFX(SFX_FLASH[ev.kind]),wait);               // botto all'arrivo
      if(ev.kind==='nuke' && !evs.some(e=>e.t==='destroy')) setTimeout(()=>playSFX('crollo'),wait+1000);   // seconda esplosione dopo 1 s, come nella campagna (se qualcosa è stato distrutto suona già il suo crollo/esplosione)
    });
    else if(ev.t==='banner' && SFX_CARD[ev.card]) once('card',()=>playSFX(SFX_CARD[ev.card]));
    else if(ev.t==='destroy'){                                                                // roccia/terreno o edificio distrutto = crollo · unità o base = esplosione (sempre, anche con artiglieria, silo e nucleare)
      const snd = (ev.kind==='terrain' || ev.kind==='struct') ? 'crollo' : 'explosion';
      once('destroy'+snd,()=>{ if(lagMs) setTimeout(()=>playSFX(snd),lagMs); else playSFX(snd); });
    }
    else if(ev.t==='boom') once('boom',()=>playSFX('boom'));                                // colpo con la carta Esplosivo: dopo lo sparo parte il boom (come carduse.js)
    else if(ev.t==='medikit') once('medikit'+(ev.late?'L':''),()=>{ if(ev.late) setTimeout(()=>playSFX('heal'),800); else playSFX('heal'); });   // auto-cura del Medikit (late = 800 ms dopo l'attivazione della carta, come nel vecchio gioco)
  });
  if(a.t==='demolish' && !evs.some(ev=>ev.t==='destroy')) playSFX('melee');                 // demolizione che non distrugge ancora: solo il colpo
}

// ============================================================
// IMMAGINI  (cartella img/, con le emoji come riserva)
// ============================================================
const IMG_DIR = 'img/';
const SPRITE_SCALE = {terrain:1.9, base:1.9, unit:1.8, struct:1.9};  // grandezza dell'immagine in multipli di S (1 = come l'emoji), erano: terrain:1.9, base:1.5, unit:1.35, struct:1.9

// Unità: colore di fazione (stessi colori e stesse 8 fazioni del vecchio gioco, vedi PALETTE in drules.js) → prefisso dei file (EUR1.png ... EUR16.png) e numero di file.
// slot = numero di fazione del vecchio gioco (serve per l'immagine della base HQ<slot>.png e per la traccia musicale fMusic<slot>).
const FACTION_IMG = {
  '#00ff88': {prefix:'EUR', count:16, slot:1},   // Verde
  '#cc00ff': {prefix:'ZER', count:16, slot:2},   // Viola
  '#00aaff': {prefix:'MED', count:16, slot:3},   // Blu
  '#ffd700': {prefix:'GUA', count:16, slot:4},   // Giallo (nel vecchio gioco Oro)
  '#ff3333': {prefix:'DEM', count:16, slot:5},   // Rosso
  '#ffffff': {prefix:'ALI', count:16, slot:6},   // Bianco
  '#999999': {prefix:'ROB', count:16, slot:7},   // Grigio
  '#ff69b4': {prefix:'UNI', count:9,  slot:8}    // Rosa
};
// Rocce: come nel vecchio gioco, ogni partita ha un tema (prefisso + numero di file: HE1.png ... HE20.png).
// Il tema si sceglie dal seme di partita (themeSeed in drules.js), quindi è uguale per tutti anche online.
const WALL_THEMES = [
  {prefix:'HE', count:20}, {prefix:'ZE', count:20}, {prefix:'EC', count:22}, {prefix:'GU', count:20},
  {prefix:'ME', count:18}, {prefix:'RO', count:20}, {prefix:'AL', count:19}
];
const wallTheme = () => WALL_THEMES[(typeof themeSeed==='number' ? themeSeed : 0) % WALL_THEMES.length];
// Gruppo di immagini di ogni fazione per barricate ed edifici (prefisso dei file): EC verde, ZE viola, ME blu, GU giallo, HE rosso, AL bianco, RO grigio.
// La Rosa non ha un gruppo suo e COPIA SEMPRE i Blu (stessi edifici e stessa barricata).
const FACTION_GROUP = {'#00ff88':'EC', '#cc00ff':'ZE', '#00aaff':'ME', '#ffd700':'GU', '#ff3333':'HE', '#ffffff':'AL', '#999999':'RO', '#ff69b4':'ME'};
// Barricate: ogni fazione usa la PRIMA immagine del suo gruppo di rocce (come nel vecchio gioco: getFactionBarricadeId)
const BARRICADE_PREFIX = FACTION_GROUP;
function rockFile(c,r){                                        // variante della roccia scelta dalla casella; salta i file che sappiamo mancare
  const bo = barOwner.get(key(c,r)), bp = bo!==undefined && players[bo] ? BARRICADE_PREFIX[players[bo].color] : null;
  if(bp){ const bf = bp+'1.png', brc = IMG_CACHE.get(bf); if(!(brc && brc.failed)) return bf; }   // barricata: sempre la prima immagine della fazione
  const t = wallTheme(), h = spriteHash(c,r);
  for(let i=0;i<t.count;i++){ const f = `${t.prefix}${((h+i)%t.count)+1}.png`, rc = IMG_CACHE.get(f); if(!(rc && rc.failed)) return f; }
  return null;
}
const TERRAIN_IMG = { rocce:rockFile };                        // chiave = id del terreno (TERRAINS); valore = file, lista di varianti o funzione (c,r)=>file
const BASE_IMG    = f => `HQ${f.slot}.png`;                    // immagine della base (come nel vecchio gioco: HQ1.png ... HQ8.png)
const STRUCT_IMG  = {};                                        // eccezioni valide per tutte le fazioni: chiave = tipo edificio (BUILDINGS), es. {bunker:'bunker.png'}; ha la precedenza sulla tabella qui sotto
// Immagini degli edifici: gruppo di fazione (FACTION_GROUP) → tipo di edificio (chiave di BUILDINGS) → file in img/.
// I laboratori non hanno un file loro: usano un edificio a caso della fazione (sempre lo stesso per lo stesso laboratorio, anche online).
const BUILDING_IMG = {
  AL: {fabbrica:'AL15.png', hangar:'AL4.png',  bunker:'AL1.png',  forgia:'AL18.png', artiglieria:'AL13.png', silo:'AL6.png',  topTech:'AL10.png', nucleare:'AL5.png',  domo:'AL3.png'},    // bianco
  EC: {fabbrica:'EC4.png',  hangar:'EC17.png', bunker:'EC5.png',  forgia:'EC18.png', artiglieria:'EC5.png',  silo:'EC5.png',  topTech:'EC21.png', nucleare:'EC11.png', domo:'EC16.png'},   // verde
  GU: {fabbrica:'GU10.png', hangar:'GU18.png', bunker:'GU9.png',  forgia:'GU20.png', artiglieria:'GU19.png', silo:'GU20.png', topTech:'GU11.png', nucleare:'GU16.png', domo:'GU8.png'},    // giallo
  HE: {fabbrica:'HE12.png', hangar:'HE14.png', bunker:'HE20.png', forgia:'HE6.png',  artiglieria:'HE7.png',  silo:'HE16.png', topTech:'HE15.png', nucleare:'HE8.png',  domo:'HE3.png'},    // rosso
  ME: {fabbrica:'ME15.png', hangar:'ME8.png',  bunker:'ME2.png',  forgia:'ME14.png', artiglieria:'ME5.png',  silo:'ME9.png',  topTech:'ME16.png', nucleare:'ME3.png',  domo:'ME6.png'},    // blu (anche la rosa)
  RO: {fabbrica:'RO19.png', hangar:'RO7.png',  bunker:'RO18.png', forgia:'RO20.png', artiglieria:'RO8.png',  silo:'RO16.png', topTech:'RO4.png',  nucleare:'RO10.png', domo:'RO11.png'},   // grigio
  ZE: {fabbrica:'ZE2.png',  hangar:'ZE3.png',  bunker:'ZE18.png', forgia:'ZE11.png', artiglieria:'ZE6.png',  silo:'ZE7.png',  topTech:'ZE15.png', nucleare:'ZE9.png',  domo:'ZE16.png'}    // viola
};
function structFile(p,s){                                      // file dell'edificio s del giocatore p (null = nessuna immagine: si usa l'emoji)
  if(STRUCT_IMG[s.type]) return STRUCT_IMG[s.type];
  const set = BUILDING_IMG[FACTION_GROUP[p.color]]; if(!set) return null;
  if(set[s.type]) return set[s.type];
  if(BUILDINGS[s.type] && BUILDINGS[s.type].lab){              // laboratorio: un edificio della fazione scelto dall'id (uguale su tutti gli schermi)
    return pickFile(Object.values(set),spriteHash(s.id,7));   // salta i file che sappiamo mancare
  }
  return null;
}

// Sfondo della mappa: stesso abbinamento sfondo ↔ rocce del vecchio gioco (sfondo1.jpg con le rocce HE, sfondo2 con ZE, ... stesso ordine di WALL_THEMES)
const BG_FILES = ['sfondo1.jpg','sfondo2.jpg','sfondo3.jpg','sfondo4.jpg','sfondo5.jpg','sfondo6.jpg','sfondo7.jpg'];
const MAP_BG_VEIL = 0.75;   // velo nero sopra l'immagine di sfondo (0 = nessuno, 1 = tutto nero)
const MAP_BG_REF_TILES = 2;   // scala di riferimento (1-4 giocatori): quella di una mappa quadrata di 2×2 tessere
const MAP_BG_MID = 1.25;       // 1-4 giocatori: sfondo ingrandito di questo fattore rispetto alla scala di riferimento (1 = invariato)
const MAP_BG_BIG = 1.75;      // 5-6 giocatori: sfondo ingrandito di questo fattore (1.75 = +75%)
const EMPTY_BG_NOIMG = '#102619';                               // colore delle caselle vuote quando l'immagine di sfondo manca (come prima)
const mapBgFile = () => BG_FILES[(typeof themeSeed==='number' ? themeSeed : 0) % WALL_THEMES.length];
const MAP_BG_BLUR = 0.0000;   // intensità del blur, come frazione della larghezza dell'immagine (0 = spento; 0.002 appena percettibile, 0.008 evidente)
const BG_BLUR_CACHE = new WeakMap();   // immagine originale -> canvas sfocato (calcolato una volta sola)
function blurredBg(img){
  if(!(MAP_BG_BLUR>0) || !('filter' in g)) return img;      // blur spento o non supportato dal browser: si usa l'immagine originale
  let c = BG_BLUR_CACHE.get(img);
  if(!c){
    const w = img.naturalWidth, h = img.naturalHeight, r = Math.max(1,w*MAP_BG_BLUR), pad = Math.ceil(r*3);
    c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d'); cx.filter = `blur(${r}px)`;
    cx.drawImage(img,-pad,-pad,w+pad*2,h+pad*2);           // leggermente ingrandita: i bordi non diventano trasparenti
    BG_BLUR_CACHE.set(img,c);
  }
  return c;
}
function drawMapBg(list){                                      // list = tessere da coprire; true = sfondo disegnato (le caselle vuote sono 30% nere sopra), false = manca il file
  const img = loadImg(mapBgFile()); if(!img || !img.naturalWidth) return false;
  const w = S*SQ3*(V.cols+0.5), h = S*(1.5*V.rows+0.5);
  const RC = MAP_BG_REF_TILES*TILE;
  const kRef = S*Math.max(SQ3*(RC+0.5)/img.naturalWidth, (1.5*RC+0.5)/img.naturalHeight);   // scala che l'immagine ha oggi con una mappa 2×2 tessere (3-4 giocatori)
  const kWant = kRef * (NUM_PLAYERS>=5 ? MAP_BG_BIG : MAP_BG_MID);                           // 1-4 giocatori: +25%; 5-6: +75%
  const k = Math.max(kWant, w/img.naturalWidth, h/img.naturalHeight);                         // mai più piccola della mappa: nessun buco
  const iw = img.naturalWidth*k, ih = img.naturalHeight*k;                                    // l'immagine copre tutta la mappa, centrata
  
  g.save(); 
  // Disegna l'immagine e il velo nero estesi su tutta l'area della mappa
  g.drawImage(blurredBg(img),PX+(w-iw)/2,PY+(h-ih)/2,iw,ih);
  g.fillStyle = `rgba(0,0,0,${MAP_BG_VEIL})`; 
  g.fillRect(PX+(w-iw)/2,PY+(h-ih)/2,iw,ih);   // velo nero grande esattamente quanto l'immagine
  g.restore();
  
  return true;
}

const IMG_CACHE = new Map();                                   // file -> {img, ok, failed}
function loadImg(file){                                        // immagine pronta, oppure null (si sta caricando, o non esiste)
  let r = IMG_CACHE.get(file);
  if(!r){
    const img = new Image(); r = {img, ok:false, failed:false}; IMG_CACHE.set(file,r);
    img.onload  = () => { r.ok = true; try{ redraw(); }catch(e){} };    // a caricamento finito si ridisegna da sé
    img.onerror = () => { r.failed = true; try{ redraw(); }catch(e){} };   // file mancante: mai più riprovato; si ridisegna subito (es. le rocce passano alla variante successiva)
    img.src = IMG_DIR + file;
  }
  return r.ok ? r.img : null;
}
function drawSprite(file, x, y, size, forceSquare = false){    // true = disegnata; false = il chiamante usa l'emoji
  const img = loadImg(file); if(!img || !img.naturalWidth) return false;
  
  if (forceSquare) {
    // Come nel vecchio gioco: forza l'immagine a un quadrato (per terreni ed edifici)
    g.drawImage(img, x - size/2, y - size/2, size, size);
  } else {
    // Come nel nuovo gioco: mantiene le proporzioni (per unità e basi)
    const k = size/Math.max(img.naturalWidth,img.naturalHeight);
    const w = img.naturalWidth*k, h = img.naturalHeight*k;
    g.drawImage(img, x - w/2, y - h/2, w, h);
  }
  return true;
}
const spriteHash = (a,b) => Math.abs(((a*73856093) ^ (b*19349663)) | 0);
function pickFile(list,h){                                     // sceglie una variante, saltando quelle che sappiamo mancare
  for(let i=0;i<list.length;i++){ const f = list[(h+i)%list.length], r = IMG_CACHE.get(f); if(!(r && r.failed)) return f; }
  return null;
}
function terrainSprite(t,c,r,x,y){
  const spec = TERRAIN_IMG[t]; if(!spec) return false;
  const file = typeof spec==='function' ? spec(c,r) : Array.isArray(spec) ? pickFile(spec,spriteHash(c,r)) : spec;
  // Aggiunto 'true' per forzare il quadrato sulle rocce/terreni
  return !!file && drawSprite(file, x, y, S*SPRITE_SCALE.terrain, true);
}
function baseSprite(p,b,x,y){
  const f = FACTION_IMG[p.color]; if(!f) return false;
  const sizeMult = b.finalBase ? 1.5 : 1;  // Se è la base finale, scala al 150%
  return drawSprite(BASE_IMG(f), x, y, S*SPRITE_SCALE.base * sizeMult);
}
const unitImgNum = (f,u) => u.img ? ((u.img-1) % f.count)+1 : (Math.abs(+u.id||0) % f.count)+1;   
const unitImgFile = (f,u) => `${f.prefix}${unitImgNum(f,u)}.png`;
function unitSprite(p,u,x,y){                                  
  const f = FACTION_IMG[p.color]; if(!f) return false;
  // Nessun 'true': le unità mantengono le proporzioni
  return drawSprite(unitImgFile(f,u), x, y, S*SPRITE_SCALE.unit);
}
function structSprite(p,s,x,y){                                
  const file = structFile(p,s); if(!file) return false;
  // Aggiunto 'true' per forzare il quadrato sugli edifici (es. miniera)
  return drawSprite(file, x, y, S*SPRITE_SCALE.struct, true);
}

// ============================================================
// SFONDO E BORDO DELLE UNITÀ (come nel vecchio gioco: esagono spesso nel colore di fazione, sfondo semi-trasparente)
// ============================================================
const UNIT_BG_ALPHA = 0.15;     // opacità dello sfondo di unità e basi (0 = trasparente, 1 = pieno): più basso = più trasparente
const UNIT_HEX_R    = 0.87;     // raggio dell'esagono, in multipli di S (1 = bordo della casella)
const UNIT_HEX_W    = 0.14;     // spessore del bordo, in multipli di S (vale anche per la base)
const BASE_CIRCLE_R = 0.82;     // raggio del cerchio della base, in multipli di S
function hexRgba(hex,a){ const n = parseInt(String(hex).slice(1),16) || 0; return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }
function unitBack(color,x,y){
  hexPath(g,x,y,S*UNIT_HEX_R); g.fillStyle = hexRgba(color,UNIT_BG_ALPHA); g.fill();
  g.lineWidth = S*UNIT_HEX_W; g.strokeStyle = color; g.stroke();
}

function baseBack(color,x,y,b){                                   // Aggiunto parametro 'b'
  const sizeMult = (b && b.finalBase) ? 1.5 : 1;                  // Scala al 150% se è la base finale
  g.beginPath(); g.arc(x,y,S*BASE_CIRCLE_R * sizeMult,0,Math.PI*2); g.fillStyle = hexRgba(color,UNIT_BG_ALPHA); g.fill();
  g.lineWidth = S*UNIT_HEX_W; g.strokeStyle = color; g.stroke();
}

// ============================================================
// ANTEPRIMA NELLA CREAZIONE UNITÀ (clic a sinistra / destra dell'immagine = precedente / successiva)
// ============================================================
let draftImg = 1;                                              // immagine scelta per l'unità che si sta creando
function resetUnitImg(p){                                      // all'apertura del menu: prima immagine non ancora usata dalle tue unità
  const f = FACTION_IMG[p.color]; draftImg = 1; if(!f) return;
  const used = new Set(p.units.map(u=>unitImgNum(f,u)));
  for(let i=1;i<=f.count;i++) if(!used.has(i)){ draftImg = i; break; }
}
function unitImgStep(d,p){ const f = FACTION_IMG[p.color]; if(f) draftImg = ((draftImg-1+d+f.count) % f.count)+1; }
function unitPreviewHtml(p){                                   // vuoto se la fazione non ha immagini; se il file manca l'anteprima si nasconde da sola
  const f = FACTION_IMG[p.color]; if(!f) return '';
  const arrow = d => `<button data-id="uimg:${d}" style="position:absolute;top:0;${d<0?'left':'right'}:0;width:50%;height:100%;margin:0;padding:0 4px;background:none;border:none;color:${p.color};font-size:26px;line-height:1;text-align:${d<0?'left':'right'}">${d<0?'&#8249;':'&#8250;'}</button>`;
  return `<div class="upv"><div style="position:relative;height:130px;margin:6px 0">`
    + `<img src="${IMG_DIR}${f.prefix}${draftImg}.png" alt="" style="display:block;margin:0 auto;width:130px;height:130px;object-fit:contain;pointer-events:none" onerror="this.closest('.upv').style.display='none'">`
    + arrow(-1) + arrow(1) + `</div><div class="leg" style="text-align:center">${draftImg}/${f.count}</div></div>`;
}
