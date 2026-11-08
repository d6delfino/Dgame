'use strict';
/* AIRGRUNT · AGbake.js — lo SFONDO della mappa è un'unica immagine "appiattita", fatta di blocchi da 512 px del mondo.
   - Creazione (una volta all'inizio, con barra di avanzamento): ogni blocco viene disegnato da AGdecor.js e compresso (WebP, altrimenti JPEG).
     Il tempo di creazione non pesa sul gioco; i blocchi compressi occupano pochi MB.
   - In gioco: a ogni fotogramma si copiano (drawImage) solo i blocchi visibili. Quelli vicini alla camera vengono decompressi in anticipo
     (createImageBitmap, fuori dal thread principale) e tenuti in una piccola cache LRU, così la RAM resta bassa e nessun blocco "salta fuori".
   - Nitidezza: BK.S pixel per pixel di mondo (1 su tablet, 1,25 media qualità, 1,5 alta). Si sceglie a inizio partita in base alla qualità.
   Rete: nulla. Ogni client rigenera lo stesso sfondo dal seed. */
const CH=512,BK={tok:0,S:1,tiles:new Map(),bm:new Map(),pend:new Set(),fr:0,wl:null,cv:null,type:'image/webp',nx:Math.ceil(WW/CH),ny:Math.ceil(WH/CH)};
const BAKE_S=[1,1.25,1.5];
const bmax=()=>G.q>=2?44:34;
const mkCanvas=n=>{const c=document.createElement('canvas');c.width=c.height=n;return c};
let _webp=null;const webpOK=()=>_webp===null?(_webp=(()=>{try{return mkCanvas(2).toDataURL('image/webp').indexOf('data:image/webp')==0}catch(e){return false}})()):_webp;
const tick=()=>new Promise(r=>setTimeout(r,0));
const toBlobP=(cv,type,q)=>new Promise(res=>{try{if(cv.toBlob)cv.toBlob(b=>res(b),type,q);else res(null)}catch(e){res(null)}});
function chunkReset(){BK.tok++;for(const v of BK.bm.values())try{v.img&&v.img.close&&v.img.close()}catch(e){}BK.bm=new Map();BK.tiles=new Map();BK.pend=new Set();G.baking=0}
// usato dal disegno: restituisce l'immagine del blocco (o null se non è ancora decompresso: si disegna un colore di riserva)
function chunkGet(cx,cy){const k=cx*64+cy,b=BK.bm.get(k);if(b){b.t=BK.fr;return b.img}dec(k);return null}
function evict(){const mx=bmax();while(BK.bm.size>mx){let o=null,ot=1e18;for(const[k,v]of BK.bm)if(v.t<ot){ot=v.t;o=k}if(o==null||ot>=BK.fr-1)break;const v=BK.bm.get(o);try{v.img.close&&v.img.close()}catch(e){}BK.bm.delete(o)}}
function decodeBlob(b){if(typeof createImageBitmap=='function')return createImageBitmap(b);
 return new Promise((res,rej)=>{const im=new Image(),u=URL.createObjectURL(b);im.onload=()=>{URL.revokeObjectURL(u);res(im)};im.onerror=rej;im.src=u})}
function dec(k){if(BK.pend.has(k)||BK.pend.size>=4)return;const b=BK.tiles.get(k);if(!b)return;
 if(b.getContext){BK.bm.set(k,{img:b,t:BK.fr});evict();return}            // riserva senza compressione
 BK.pend.add(k);const tok=BK.tok;
 decodeBlob(b).then(im=>{BK.pend.delete(k);if(tok!==BK.tok){im.close&&im.close();return}BK.bm.set(k,{img:im,t:BK.fr});evict()}).catch(()=>BK.pend.delete(k))}
// chiamata a ogni fotogramma con il rettangolo visibile: prepara in anticipo i blocchi intorno alla camera
function bakePrefetch(x0,y0,x1,y1){BK.fr++;const m=CH*.6;
 for(let cx=Math.max(0,Math.floor((x0-m)/CH));cx<=Math.min(BK.nx-1,Math.floor((x1+m)/CH));cx++)for(let cy=Math.max(0,Math.floor((y0-m)/CH));cy<=Math.min(BK.ny-1,Math.floor((y1+m)/CH));cy++){const k=cx*64+cy,b=BK.bm.get(k);if(b)b.t=BK.fr;else dec(k)}}
// ===== creazione =====
const airdropSnd = new Audio('sfx/sfx-airdrop.mp3');
const playRandomAirdrop = () => {
 airdropSnd.playbackRate = 0.3 + Math.random() * 1.5; // Variazione estrema del tono (da 0.3 a 1.8)
 airdropSnd.volume = 0.3 + Math.random() * 0.7;         
 airdropSnd.currentTime = 0;
 airdropSnd.play().catch(e => {});
};

function bakeStart(){
 chunkReset();
 const tok=BK.tok;
 BK.S=BAKE_S[clamp(G.q,0,2)];
 G.baking=1;
 G.bakeP=0;
 G.bakeMsg='Preparo la mappa…';

 playRandomAirdrop();
 const dropInterval = setInterval(() => {
  if(!G.baking || tok !== BK.tok) {
   clearInterval(dropInterval);
   return;
  }
  playRandomAirdrop();
 }, 600);

 setTimeout(()=>bakeRun(tok),40);
}
async function bakeRun(tok){
 try{
  if(!M.decorDone){M.decorDone=1;G.bakeMsg='Studio il terreno…';await tick();decorPrep()}
  const S=BK.S,px=Math.round(CH*S);BK.cv=mkCanvas(px);BK.wl=mkCanvas(px);const g=BK.cv.getContext('2d');BK.type=webpOK()?'image/webp':'image/jpeg';
  const N=BK.nx*BK.ny;let n=0,bad=0;G.bakeMsg='IN VIAGGIO VERSO LA ZONA DI MISSIONE…';
  for(let cy=0;cy<BK.ny;cy++)for(let cx=0;cx<BK.nx;cx++){await tick();if(tok!==BK.tok)return;
   try{g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-over';g.setLineDash([]);paintTile(g,cx*CH,cy*CH,S);
    g.setTransform(1,0,0,1,0,0);let b=await toBlobP(BK.cv,BK.type,.84);if(!b){const c2=mkCanvas(px);c2.getContext('2d').drawImage(BK.cv,0,0);b=c2}BK.tiles.set(cx*64+cy,b)}
   catch(e){if(!bad++)console.warn('Blocco di sfondo',cx,cy,e)}
   G.bakeP=++n/N}
  // decomprime subito i blocchi intorno alla partenza: la prima schermata è già completa
  G.bakeMsg='Quasi pronto…';const pl=typeof P!=='undefined'&&P?P:{x:START[0],y:START[1]};
  for(let cx=Math.max(0,Math.floor((pl.x-900)/CH));cx<=Math.min(BK.nx-1,Math.floor((pl.x+900)/CH));cx++)for(let cy=Math.max(0,Math.floor((pl.y-700)/CH));cy<=Math.min(BK.ny-1,Math.floor((pl.y+700)/CH));cy++){
   const b=BK.tiles.get(cx*64+cy);if(!b)continue;if(b.getContext)BK.bm.set(cx*64+cy,{img:b,t:BK.fr});else try{BK.bm.set(cx*64+cy,{img:await decodeBlob(b),t:BK.fr})}catch(e){}}
 }catch(e){console.error('Creazione sfondo',e)}
 if(tok===BK.tok){G.baking=0}}
// schermata di caricamento (disegnata al posto del gioco finché lo sfondo non è pronto)
function bakeDraw(){
 const c=ctx,w=W,h=H;
 c.setTransform(1,0,0,1,0,0);
 c.fillStyle='#0b0f0b';
 c.fillRect(0,0,cv.width,cv.height);
 const d=cv.width/(w||1);
 c.setTransform(d,0,0,d,0,0);

 if (G.bakeMsg && G.bakeMsg.includes("VIAGGIO")) {
  const t = performance.now();

  // 1. TERRENO A SCORRIMENTO ESTESO A TUTTO LO SCHERMO
  const groundY = 0; 
  c.fillStyle = '#0d140d';
  c.fillRect(0, groundY, w, h);

  c.fillStyle = '#162216';
  for (let i = 0; i < 8; i++) {
   const speed = ((t * (0.5 + i * 0.15)) % (w + 300));
   const yPos = groundY + 20 + (i * 55) % h;
   c.fillRect(w - speed, yPos, 120 + i * 30, 8 + (i % 3) * 2);
  }

// 1.3 PICCOLI INSEDIAMENTI E LUCINE SPARSE SUL TERRENO
  const numSpots = 10, spotLoop = w + 1600;
  for (let s = 0; s < numSpots; s++) {
   const rawPos = t * 0.7 + s * (spotLoop / numSpots);
   const cycle = Math.floor(rawPos / spotLoop);
   const sx = w + 800 - (rawPos % spotLoop);
   const rndS = (seed) => { const x = Math.sin(seed * 91.345 + cycle * 43.12) * 43758.5453; return x - Math.floor(x); };
   const sy = h * (0.05 + rndS(s * 7 + 1) * 0.90);
   const kind = Math.floor(rndS(s * 7 + 2) * 3); // 0: antenna lampeggiante, 1: casolare/coppia di luci, 2: piccolo borgo

   c.save();
   c.translate(sx, sy);
   if (kind === 0) {
    const blink = Math.sin(t / 180 + s * 2) > 0.4 ? 1 : 0.12;
    c.fillStyle = rndS(s) < 0.5 ? '#ff3b3b' : '#ffffff';
    c.globalAlpha = blink;
    c.fillRect(-1.5, -1.5, 3, 3);
   } else if (kind === 1) {
    for (let li = 0; li < 3; li++) {
     const lx = (rndS(s * 13 + li) - 0.5) * 26, ly = (rndS(s * 17 + li) - 0.5) * 20;
     const glow = 0.4 + 0.6 * Math.sin(t / 220 + s + li * 2);
     c.fillStyle = li % 2 === 0 ? '#ffea75' : '#ffb443';
     c.globalAlpha = 0.4 + 0.5 * glow;
     c.fillRect(lx - 1, ly - 1, 2.5, 2.5);
    }
   } else {
    c.fillStyle = 'rgba(255, 180, 70, 0.08)';
    c.beginPath(); c.arc(0, 0, 22, 0, TAU); c.fill();
    for (let li = 0; li < 6; li++) {
     const lx = (rndS(s * 23 + li) - 0.5) * 36, ly = (rndS(s * 29 + li) - 0.5) * 30;
     const glow = 0.4 + 0.6 * Math.sin(t / 200 + s * 2 + li);
     c.fillStyle = li % 3 === 0 ? '#ffffff' : li % 3 === 1 ? '#ffea75' : '#ff9933';
     c.globalAlpha = 0.45 + 0.55 * glow;
     c.fillRect(lx - 1, ly - 1, 2, 2);
    }
   }
   c.restore();
  }

// 1.4 CITTÀ E BORGHI IN MINIATURA (~15% delle dimensioni standard)
  const numMiniTowns = 6, miniLoop = w + 2000;
  for (let m = 0; m < numMiniTowns; m++) {
   const mRawPos = t * 0.7 + m * (miniLoop / numMiniTowns) + 500;
   const mCycle = Math.floor(mRawPos / miniLoop);
   const mx = w + 1000 - (mRawPos % miniLoop);
   const rndM = (salt) => { const x = Math.sin(m * 123.45 + mCycle * 54.32 + salt) * 43758.5453; return x - Math.floor(x); };
   const my = h * (0.08 + rndM(1.3) * 0.84);    // Sparpagliate su tutta l'altezza dello schermo (8% - 92%)
   const mSize = 24 + rndM(2.1) * 8;             // Dimensione al 15% (24 - 32px)
   const mRot = rndM(3.7) * TAU;                 // Rotazione casuale

   c.save();
   c.translate(mx, my);
   c.rotate(mRot);

   // A. Piccola chiazza di terreno suburbano scuro
   c.fillStyle = '#141e14';
   c.globalAlpha = 0.35;
   c.beginPath();
   c.arc(0, 0, mSize * 0.85, 0, TAU);
   c.arc((rndM(4.1) - 0.5) * 12, (rndM(5.2) - 0.5) * 12, mSize * 0.65, 0, TAU);
   c.fill();

   // B. Micro inquinamento luminoso ambrato
   c.globalAlpha = 0.16;
   const mGrad = c.createRadialGradient(0, 0, 2, 0, 0, mSize * 1.35);
   mGrad.addColorStop(0, '#ffb443');
   mGrad.addColorStop(1, 'rgba(8, 12, 16, 0)');
   c.fillStyle = mGrad;
   c.beginPath();
   c.arc(0, 0, mSize * 1.35, 0, TAU);
   c.fill();

   // C. Snodi stradali (4-5 piccoli assi scuri che irradiano verso l'esterno)
   c.strokeStyle = '#05080c';
   c.lineWidth = 2.2;
   c.globalAlpha = 0.85;
   c.lineCap = 'round';
   c.beginPath();
   for (let r = 0; r < 5; r++) {
    const rAng = (r / 5) * TAU + (rndM(r * 2 + 6) - 0.5) * 0.5;
    const rLen = mSize * (0.6 + rndM(r * 3 + 7) * 0.5);
    c.moveTo(0, 0);
    c.lineTo(Math.cos(rAng) * rLen, Math.sin(rAng) * rLen);
   }
   c.stroke();

   // D. Centro abitato (Downtown compatto: 10 lucine dense)
   for (let cl = 0; cl < 10; cl++) {
    const cDist = rndM(cl * 4 + 8) * (mSize * 0.32);
    const cAng = rndM(cl * 5 + 9) * TAU;
    const glow = 0.5 + 0.5 * Math.sin(t / 160 + cl + m);
    c.fillStyle = cl % 2 === 0 ? '#ffea75' : '#ffb443';
    c.globalAlpha = 0.6 + 0.4 * glow;
    c.fillRect(Math.cos(cAng) * cDist - 1, Math.sin(cAng) * cDist - 1, 2.2, 2.2);
   }

   // E. Lucine periferiche sparse (14 lucine più sfumate)
   for (let pl = 0; pl < 14; pl++) {
    const pDist = (0.35 + rndM(pl * 6 + 10) * 0.65) * mSize;
    const pAng = rndM(pl * 7 + 11) * TAU;
    const glow = 0.4 + 0.6 * Math.sin(t / 200 + pl * 2 + m);
    c.fillStyle = pl % 3 === 0 ? '#ffffff' : pl % 3 === 1 ? '#ffea75' : '#ff7a33';
    c.globalAlpha = 0.45 + 0.55 * glow;
    c.fillRect(Math.cos(pAng) * pDist - 1, Math.sin(pAng) * pDist - 1, 1.8, 1.8);
   }

   c.restore();
  }

// 1.5. CITTÀ NOTTURNE VISTE DALL'ALTO (Posizione, rotazione e dimensione casuali)
  const cityData = [
   { offset: 0, speed: 0.7 },
   { offset: 1800, speed: 0.7 }
  ];
  const cityLoopDist = w + 2400;

  for(let i = 0; i < cityData.length; i++) {
   const cEntry = cityData[i];
   const rawPos = t * cEntry.speed + cEntry.offset;
   const cycle = Math.floor(rawPos / cityLoopDist);
   const speed = rawPos % cityLoopDist;
   const cx = w + 1200 - speed;

   // Calcolo casuale ma coerente per ciascun passaggio
   const rndC = (salt) => {
    const x = Math.sin(cycle * 67.89 + i * 149.23 + salt) * 43758.5453;
    return x - Math.floor(x);
   };

   const cy = h * (0.16 + rndC(1.1) * 0.68);
   const cd = { size: 140 + rndC(2.2) * 110 }; // Unico 'cd', con la dimensione casuale
   const cityRot = rndC(3.3) * TAU;

   c.save();
   c.translate(cx, cy);
   c.rotate(cityRot);

   // Macchie di terreno naturali vincolate alla città ma ampiamente disperse nello spazio
   const seedBlob = i * 888;
   const numBlobs = 10;
   const patchTones = ['#131d13', '#182417', '#152015', '#1a261a', '#111b11', '#162218', '#141e14', '#192518'];
   //const patchTones = ['#1d2d1e', '#292e1d', '#28211b', '#202f23', '#1f272a', '#2c271b', '#233423', '#2b231d'];

   for (let b = 0; b < numBlobs; b++) {
    const rnd = (s) => { const x = Math.sin(s * 19.898) * 43758.5453; return x - Math.floor(x); };
    c.fillStyle = patchTones[b % patchTones.length];
    c.globalAlpha = 0.32;
    
    c.beginPath();
    // Angolo aureo (137.5°) + rotazione base città: impossibile avere punti allineati sugli stessi assi
    const goldenAngle = 2.3999632;
    const angle = rnd(seedBlob + 17.5) * TAU + b * goldenAngle;
    
    // Raggio proporzionale all'area (distribuzione uniforme dal centro verso i bordi)
    const spreadArea = Math.sqrt((b + 0.5) / numBlobs);
    const dist = cd.size * (0.6 + spreadArea * 3.8 + (rnd(seedBlob + b * 53.1) - 0.5) * 1.2);
    
    // Proporzionato all'aspect ratio panoramico dello schermo (più esteso su X, controllato su Y)
    const bx = Math.cos(angle) * (dist * 1.35) + (rnd(seedBlob + b * 19.3) - 0.5) * (cd.size * 0.8);
    const by = Math.sin(angle) * (dist * 0.85) + (rnd(seedBlob + b * 29.7) - 0.5) * (cd.size * 0.6);
    
    // Dimensioni base (-35%) ed eccentricità (alcune allungate, altre a ventaglio)
    const bSize = cd.size * 1.65;
    const stretchX = 0.65 + rnd(seedBlob + b * 81.3) * 0.85;
    const stretchY = 0.65 + rnd(seedBlob + b * 93.7) * 0.85;
    const rot = rnd(seedBlob + b * 11.2) * TAU;

    // Poligono a 7 lobi asimmetrici con insenature e protuberanze naturali
    const numPts = 7;
    const pts = [];
    for (let p = 0; p < numPts; p++) {
     const pAng = (p / numPts) * TAU + (rnd(seedBlob + b * 15 + p * 3.7) - 0.5) * 0.45;
     // Ampia escursione: raggi corti (rientranze/fenditure) e raggi lunghi (lingue di terra)
     const pRad = bSize * (0.28 + Math.pow(rnd(seedBlob + b * 27 + p * 5.1), 1.6) * 1.25);
     const lx = Math.cos(pAng) * pRad * stretchX;
     const ly = Math.sin(pAng) * pRad * stretchY;
     // Rotazione dell'intera macchia
     pts.push({
      x: bx + lx * Math.cos(rot) - ly * Math.sin(rot),
      y: by + lx * Math.sin(rot) + ly * Math.cos(rot)
     });
    }

    // Curvatura fluida continua attraverso i punti mediani
    c.beginPath();
    const lastPt = pts[numPts - 1];
    let midX = (lastPt.x + pts[0].x) * 0.5;
    let midY = (lastPt.y + pts[0].y) * 0.5;
    c.moveTo(midX, midY);

    for (let p = 0; p < numPts; p++) {
     const nextPt = pts[(p + 1) % numPts];
     const nextMidX = (pts[p].x + nextPt.x) * 0.5;
     const nextMidY = (pts[p].y + nextPt.y) * 0.5;
     c.quadraticCurveTo(pts[p].x, pts[p].y, nextMidX, nextMidY);
    }
    c.closePath();
    c.fill();
   }

   // 1. Alone luminoso notturno (Light pollution)
   c.globalAlpha = 0.14;
   const grad = c.createRadialGradient(0, 0, 10, 0, 0, cd.size * 1.3);
   grad.addColorStop(0, '#ffb443');
   grad.addColorStop(1, 'rgba(8, 12, 16, 0)');
   c.fillStyle = grad;
   c.beginPath();
   c.arc(0, 0, cd.size * 1.3, 0, TAU);
   c.fill();

   // 2. RAGGI PRINCIPALI con lucine posizionate direttamente lungo il loro percorso
   const numRays = 20;
   const seed = i * 999;
   c.lineCap = 'round';

   const rndRayAngle = (idx) => {
    const x = Math.sin(idx * 89.123 + seed * 1.2) * 43758.5453;
    return (x - Math.floor(x)) * TAU;
   };

   const rndRayLen = (min, max, idx) => {
    const x = Math.sin(idx * 12.9898 + seed) * 43758.5453;
    return min + (x - Math.floor(x)) * (max - min);
   };

   for (let j = 0; j < numRays; j++) {
    const angle = rndRayAngle(j);
    const len = rndRayLen(cd.size * 0.25, cd.size * 1.1, j);
    
    // Disegna il raggio scuro
    c.strokeStyle = '#05080c';
    c.lineWidth = 10 + (j % 4) * 5;
    c.globalAlpha = 0.9;

    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
    c.stroke();

    // Aggiungi 3 lucine scintillanti distribuite lungo questo raggio
    const lightsPerRay = 3;
    for (let rl = 0; rl < lightsPerRay; rl++) {
     const frac = 0.2 + (rl * 0.28) + (rndRayLen(-0.05, 0.05, j + rl));
     if (frac > 0.95 || frac < 0.1) continue;
     const lx = Math.cos(angle) * (len * frac);
     const ly = Math.sin(angle) * (len * frac);

     const glow = 0.4 + 0.6 * Math.sin(t / 200 + rl * 1.5 + j + i);
     c.fillStyle = rl % 2 === 0 ? '#ffea75' : '#ffb443';
     c.globalAlpha = 0.5 + 0.5 * glow;
     c.fillRect(lx - 1, ly - 1, 2.5, 2.5);
    }
   }

   // 3. SOPRA LA RAGGIERA: Griglia ortogonale con linee di lunghezze CASUALI
   const halfLen = cd.size * 0.5 * 0.7; 
   c.strokeStyle = '#05080c'; 
   c.lineWidth = 3; 
   c.globalAlpha = 0.9;

   const rndGridLen = (min, max, idx) => {
    const x = Math.sin(idx * 73.123 + seed * 1.5) * 43758.5453;
    return min + (x - Math.floor(x)) * (max - min);
   };

   const minGridLen = cd.size * 0.08;
   const maxGridLen = cd.size * 0.90;
   
   c.beginPath();
   const numSteps = 9; 
   for (let g = -numSteps; g <= numSteps; g++) {
    const pos = g * (halfLen / numSteps);
    
    const lenV1 = rndGridLen(minGridLen, maxGridLen, g + 111);
    const lenV2 = rndGridLen(minGridLen, maxGridLen, g + 222);
    c.moveTo(pos, -lenV1);
    c.lineTo(pos, lenV2);

    const lenH1 = rndGridLen(minGridLen, maxGridLen, g + 333);
    const lenH2 = rndGridLen(minGridLen, maxGridLen, g + 444);
    c.moveTo(-lenH1, pos);
    c.lineTo(lenH2, pos);
   }
   c.stroke();

   // 4. LUCINE SPARSE E NUCLEO CENTRALE (Downtown ad altissima concentrazione)
   
   // A. Nucleo centrale (Downtown): concentrazione elevata di luci calde e bianche al centro
   const coreLights = 50;
   const rndCore = (idx, salt) => {
    const x = Math.sin(idx * 37.123 + salt) * 43758.5453;
    return x - Math.floor(x);
   };

   for (let cl = 0; cl < coreLights; cl++) {
    const dist = rndCore(cl, seed + 50) * (cd.size * 0.25); // Raggio stretto al centro (25%)
    const angle = rndCore(cl, seed + 60) * TAU;
    const lx = Math.cos(angle) * dist;
    const ly = Math.sin(angle) * dist;

    const glow = 0.5 + 0.5 * Math.sin(t / 150 + cl);
    c.fillStyle = cl % 3 === 0 ? '#ffffff' : cl % 3 === 1 ? '#ffea75' : '#ffb443';
    c.globalAlpha = 0.6 + 0.4 * glow;
    c.fillRect(lx - 1, ly - 1, 3, 3);
   }

   // B. Lucine periferiche sparse (150 lucine, più fitte verso il centro)
   const numLights = 150;
   const rndLight = (idx, salt) => {
    const x = Math.sin(idx * 51.123 + salt) * 43758.5453;
    return x - Math.floor(x);
   };

   for (let l = 0; l < numLights; l++) {
    // Usando esponente > 1, le luci si concentrano naturalmente di più verso il centro
    const dist = Math.pow(rndLight(l, seed + 10), 1.4) * (cd.size * 0.75);
    const angle = rndLight(l, seed + 20) * TAU;
    const lx = Math.cos(angle) * dist;
    const ly = Math.sin(angle) * dist;

    const glow = 0.4 + 0.6 * Math.sin(t / 200 + rndLight(l, seed + 30) * 10 + i);
    c.fillStyle = l % 5 === 0 ? '#ffea75' : l % 5 === 1 ? '#ffb443' : l % 5 === 2 ? '#ffffff' : l % 5 === 3 ? '#ff7a33' : '#aad4ff';
    c.globalAlpha = 0.45 + 0.55 * glow;

    c.fillRect(lx - 1, ly - 1, 2.5, 2.5);
   }

   c.restore();
  }

// 2. STRATO DI NUVOLE (Velocità rapida, pari a quella del terreno)
  //c.fillStyle = 'rgba(160, 210, 225, 0.07)'; // Azzurro nebbioso / atmosferico
  c.fillStyle = 'rgba(160, 210, 225, 0.21)'; // Azzurro nebbioso / atmosferico
  
  const CLOUD_SCALE = 3.0; // <-- MODIFICA QUI: es. 0.7 (-30%), 0.5 (-50%), 1.4 (+40%)

  const cloudData = [
   { y: 0.15, speed: 0.5, scale: 0.8, type: 0 },
   { y: 0.58, speed: 0.8, scale: 1.4, type: 1 },
   { y: 0.24, speed: 0.6, scale: 0.9, type: 2 },
   { y: 0.70, speed: 1.1, scale: 1.2, type: 3 },
   { y: 0.35, speed: 0.9, scale: 1.0, type: 0 },
   { y: 0.50, speed: 0.55, scale: 1.3, type: 2 }
  ];

  for(let i = 0; i < cloudData.length; i++) {
   const cd = cloudData[i];
   const drift = (t * cd.speed + i * 200) % (w + 500);
   const cx = w + 300 - drift; // Scorrimento rapido verso sinistra
   const cy = h * cd.y + Math.sin(t/800 + i * 1.5) * 15;
   
   c.beginPath();
   c.save();
   c.translate(cx, cy);
   c.scale(cd.scale * CLOUD_SCALE, cd.scale * CLOUD_SCALE);
   
   // Funzione helper: isola ogni lobo con moveTo per evitare tagli geometrici interni
   const addCircle = (x, y, r) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); };
   const addEllipse = (x, y, rx, ry, rot) => { c.moveTo(x + rx, y); c.ellipse(x, y, rx, ry, rot, 0, TAU); };

   if (cd.type === 0) {
    addCircle(0, 0, 45);
    addCircle(35, -12, 38);
    addCircle(-30, 8, 32);
   } else if (cd.type === 1) {
    addEllipse(0, 0, 70, 22, 0.15);
    addEllipse(45, -4, 50, 18, 0);
    addCircle(20, -2, 28); // Sigilla il nucleo centrale
   } else if (cd.type === 2) {
    addCircle(0, 0, 50);
    addCircle(-25, -22, 35);
    addCircle(30, -18, 40);
    addCircle(5, -38, 25);
    addCircle(0, -15, 30); // Sigilla il nucleo centrale
   } else {
    addCircle(-35, 0, 32);
    addCircle(0, 6, 42);
    addCircle(38, -4, 28);
    addCircle(65, 4, 22);
   }
   c.fill();
   c.restore();
  }

  // Posizione della Dropship (movimento sinuoso)
          const dsX = w / 2 - 80 + Math.sin(t / 250) * 20; 
          const dsY = h / 2 - 10 + Math.cos(t / 350) * 12 + Math.sin(t / 80) * 2; 

/*
          // 3. OMBRA PROIETTATA A TERRA (Ancora più indietro)
  c.fillStyle = 'rgba(0, 0, 0, 0.45)';
  c.beginPath();
  c.ellipse(dsX - 120, dsY + 120, 40, 20, 0, 0, Math.PI * 2);
  c.fill();
*/
          // 4. LA DROPSHIP E LE FIAMME
          if (typeof drawDropship === 'function') {
           const pCi = (typeof P !== 'undefined' && P && P.ci != null) ? P.ci : 0;
           let baseCol = '#4aa3ff';
           if (typeof COLS !== 'undefined' && COLS) {
            const raw = COLS[pCi] != null ? COLS[pCi] : COLS[0];
            if (typeof raw === 'string') baseCol = raw;
            else if (Array.isArray(raw)) baseCol = typeof raw[0] === 'number' ? `rgb(${raw[0]},${raw[1]},${raw[2]})` : raw[0];
            else if (raw && typeof raw === 'object') {
             baseCol = raw.turret || raw.c || raw.col || raw.color || raw.hex || raw.main ||
                       Object.values(raw).find(v => typeof v === 'string' && (v[0] === '#' || v.startsWith('rgb'))) || baseCol;
            } else if (typeof raw === 'number') baseCol = '#' + raw.toString(16).padStart(6, '0');
           }
           const alpha = 0.65 + 0.25 * Math.sin(t * Math.PI / 125);
           let flameCol = `rgba(74, 163, 255, ${alpha})`;
           if (typeof baseCol === 'string' && baseCol[0] === '#') {
            const hex = baseCol.slice(1);
            const n = parseInt(hex.length === 3 ? hex.split('').map(x => x + x).join('') : hex, 16);
            if (!isNaN(n)) flameCol = `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
           } else if (typeof baseCol === 'string' && baseCol.startsWith('rgb')) {
            flameCol = baseCol.replace(/rgba?\(([^)]+)\)/, (_, m) => `rgba(${m.split(',').slice(0, 3).join(',')}, ${alpha})`);
           }

           // 4 scie ovali allungate all'indietro per i 4 motori
           c.save();
           c.translate(dsX, dsY);
           c.scale(2.0, 2.0);
           c.rotate(Math.PI / 2);
           c.fillStyle = flameCol;
           
           c.beginPath(); c.ellipse(-29.5, 18, 4, 25, 0, 0, TAU); c.fill();
           c.beginPath(); c.ellipse(29.5, 18, 4, 25, 0, 0, TAU); c.fill();
           c.beginPath(); c.ellipse(-6, 75, 5.5, 30, 0, 0, TAU); c.fill();
           c.beginPath(); c.ellipse(6, 75, 5.5, 30, 0, 0, TAU); c.fill();
           c.restore();

           drawDropship(dsX, dsY, 0, pCi);
          }

  // 5. SCIE ATMOSFERICHE (Coprono tutto lo schermo e variano in modo organico)
  for (let i = 0; i < 18; i++) {
   const rnd1 = Math.abs(Math.sin(i * 12.9898 + 1.2));
   const rnd2 = Math.abs(Math.sin(i * 78.233 + 4.5));
   const rnd3 = Math.abs(Math.sin(i * 45.123 + 7.8));

   const spd = 3.2 + rnd1 * 3.8;                    // Velocità asimmetriche
   const loopLen = w + 800;
   const speed = ((t * spd + rnd2 * loopLen) % loopLen);
   const xPos = w + 400 - speed;
   const yPos = rnd3 * h;                           // Copre tutta l'altezza da 0 ad H
   const len = 70 + rnd1 * 260;                     // Lunghezze variegate (70 - 330px)
   const th = 1.0 + rnd2 * 2.2;                     // Spessori sottili diversi (1 - 3.2px)

   c.fillStyle = `rgba(223, 233, 220, ${0.07 + rnd3 * 0.15})`;
   c.fillRect(xPos, yPos, len, th);
  }
 }

/*
 // Testo Titolo in alto
 c.textAlign='center';
 c.fillStyle='#dfe9dc';
 c.font='600 22px system-ui,sans-serif';
 c.fillText('AIRGRUNT', w/2, Math.max(60, h * 0.15));

*/

// Barra di progresso in basso
 const barY = h - 290;
 c.textAlign = 'center';
 c.font = '14px system-ui,sans-serif';
 c.fillStyle = '#9bd3a1';
 c.fillText((G.bakeMsg || '') + '  ' + Math.round((G.bakeP || 0) * 100) + '%', w / 2, barY - 10);

 const bw = Math.min(320, w * .7);
 c.fillStyle = '#1b2a1b';
 c.fillRect(w / 2 - bw / 2, barY, bw, 10);
 c.fillStyle = '#3fae4a';
 c.fillRect(w / 2 - bw / 2, barY, bw * (G.bakeP || 0), 10);
 c.textAlign = 'left';
}
