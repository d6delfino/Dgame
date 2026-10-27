/* ============================================================
   dfx.js — Effetti grafici: SOLO INTERFACCIA
   ============================================================
   Spari (6 proiettili con scia), fendenti del corpo a corpo, scintille d'impatto, esplosioni di distruzione, movimento delle unità
   e colpi di artiglieria / silo / nucleare (volo + anello d'impatto + lampo bianco). Spari e fendenti: stessa matematica
   e stessi colori del vecchio gioco (core.js: drawLaserBeam, drawMeleeSlash, createParticles; gamelogic.js: handleEntityDeath).
   Qui non si tocca mai lo stato di gioco: si leggono gli eventi che drules.js manda (shot, slash, hit, destroy, move, flash)
   e si disegna su un canvas trasparente sopra la mappa. Online funziona senza messaggi in più,
   perché gli eventi arrivano già ai client insieme allo stato.

   PRESTAZIONI
   - la mappa NON viene ridisegnata: si cancella e si ridisegna solo questo piccolo canvas;
   - il ciclo parte solo quando c'è un effetto attivo e si ferma da solo quando finisce (a riposo costo zero);
   - 15 passi al secondo come nel vecchio gioco (stessa velocità e stesso aspetto), 30 solo mentre vola un colpo d'artiglieria o un missile;
   - tetto alle particelle, niente ombre/bagliori (shadowBlur), canvas a risoluzione limitata.

   CARICAMENTO: dopo dcardsui2.js e prima dello script principale (usa ctr, S, players, definiti da lui al momento dell'uso).
   ============================================================ */

const FX_FPS = 15, FX_STEP = 1000 / FX_FPS;   // come il vecchio gioco (TARGET_FPS = 15)
const FX_MAX_PARTICLES = 150;                  // tetto: oltre non se ne creano altre (tablet lenti)
const FX_DPR_MAX = 1.5;                        // risoluzione massima del canvas degli effetti (1 = più leggero)

const FX_MOVE_MS = 300;                        // durata dello scorrimento di un'unità (come il vecchio gioco)
const FX_STEP_FAST = 1000 / 30;                // fluidità del volo di artiglieria e missili
// Artiglieria/silo e nucleare: tempi in ms. Il vecchio gioco (campagna) usava 900+1400 e 2200+3800: qui sono accorciati per non rallentare le partite.
const FX_SHELL_FLIGHT = 600,  FX_SHELL_BLAST = 700;
const FX_NUKE_FLIGHT  = 1100, FX_NUKE_BLAST  = 1600;

const fxParticles = [], fxBullets = [], fxSlashes = [];
const fxMoves = new Map();                     // id unità → {from:[c,r], t0}: spostamenti in corso
const fxAir = [];                              // colpi in volo: {from:[c,r], to:[c,r], nuke, t0, hit}
const fxAmbient = [];                          // immagini ambientali che attraversano lo schermo: {file, dir, x0, y0, vx, vy, t0}
let fxFlashEl = null, fxAcc = 0;
let fxCv, fxG, fxW = 0, fxH = 0, fxRaf = 0, fxLast = 0;

// ---------- CANVAS SOVRAPPOSTO ----------
(function(){
  const board = document.getElementById('board'), main = document.querySelector('main');
  fxCv = document.createElement('canvas');
  fxCv.id = 'fxlayer';
  fxCv.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';   // i clic passano alla mappa sotto
  board.insertAdjacentElement('afterend', fxCv);                               // sopra la mappa, sotto menu e pannelli
  fxG = fxCv.getContext('2d');
  const size = () => {
    fxW = main.clientWidth; fxH = main.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, FX_DPR_MAX);
    fxCv.style.width = fxW + 'px'; fxCv.style.height = fxH + 'px';
    fxCv.width = Math.round(fxW * dpr); fxCv.height = Math.round(fxH * dpr);
    fxG.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  if(window.ResizeObserver) new ResizeObserver(size).observe(main);
  window.addEventListener('resize', size);
  size();
})();

// ---------- CREAZIONE EFFETTI ----------
const fxColor = by => (by >= 0 && players[by]) ? players[by].color : '#ffffff';
const fxPx = cell => { const [x, y] = ctr(cell[0], cell[1]); return {x, y}; };

function fxSpawn(x, y, color, amount, explosion){       // = createParticles del vecchio gioco (HEX_SIZE = S)
  const cap = explosion ? FX_MAX_PARTICLES * 2 : FX_MAX_PARTICLES;   // le esplosioni di distruzione hanno un tetto più alto: con un nucleare nessuna deve restare senza grafica
  for(let i = 0; i < amount && fxParticles.length < cap; i++){
    const a = Math.random() * Math.PI * 2, sp = Math.random() * (S * (explosion ? 0.4 : 0.2));
    fxParticles.push({
      x, y, px: x, py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 1, decay: Math.random() * 0.04 + 0.03, color,
      size: S * (Math.random() * 0.25 + 0.15)
    });
  }
}
function fxShot(from, to, by, sniper){                  // = drawLaserBeam: 6 proiettili in fila; giallo, rosso se Cecchino
  const color = sniper ? '#ff3333' : '#ffcc00', fc = fxColor(by);
  for(let i = 0; i < 6; i++)
    fxBullets.push({from, to, progress: -(i * 0.18), speed: 0.15 + Math.random() * 0.06, color, fc});
  fxKick();
}
function fxSlash(at, by){                               // = drawMeleeSlash: un fendente con angolo casuale, colore di fazione
  fxSlashes.push({at, angle: Math.random() * Math.PI * 2, progress: 0, color: fxColor(by), spawned: false});
  fxKick();
}
function fxHit(at, by){                                 // scintille sul bersaglio colpito (8, colore dell'attaccante, un po' sopra il centro)
  const p = fxPx(at);
  fxSpawn(p.x, p.y - S * 0.5, fxColor(by), 8, false);
  fxKick();
}

function fxBoom(at, kind){                              // distruzione: esplosione arancione+rossa (unità, basi, edifici) o macerie grigie (terreno), come nel vecchio gioco
  const p = fxPx(at);
  if(kind === 'terrain') fxSpawn(p.x, p.y, '#777777', 10, true);
  else {
    fxSpawn(p.x, p.y, '#ff8800', 15, true); fxSpawn(p.x, p.y, '#ff3333', 10, true);
    if(kind === 'struct') fxSpawn(p.x, p.y, '#777777', 10, true);   // edificio: all'esplosione si aggiungono le macerie grigie (crollo)
  }
  fxKick();
}

// ---------- ARTIGLIERIA, SILO, NUCLEARE ----------
// Il proiettile (💣 / 🚀) vola dall'edificio alla casella d'impatto, poi anello d'impatto; per il nucleare anche il lampo bianco.
const fxStrikeWait = ev => (ev && ev.from && (ev.kind === 'shell' || ev.kind === 'nuke')) ? (ev.kind === 'nuke' ? FX_NUKE_FLIGHT : FX_SHELL_FLIGHT) : 0;   // ms di volo (0 = niente volo, es. fumogeno)
function fxLag(evs){ let w = 0; evs.forEach(ev => { if(ev.t === 'flash') w = Math.max(w, fxStrikeWait(ev)); }); return w; }   // ritardo per gli effetti di danno della stessa azione
function fxStrike(from, to, nuke, by){ fxAir.push({from, to, nuke, color: fxColor(by), t0: Date.now(), hit: false}); fxKick(); }
function fxFlash(ms){                                   // lampo bianco a tutto schermo: elemento HTML con animazione sulla GPU (non pesa sul canvas)
  if(!fxFlashEl){
    fxFlashEl = document.createElement('div');
    fxFlashEl.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;background:#fff;opacity:0;pointer-events:none';
    fxCv.insertAdjacentElement('afterend', fxFlashEl);
  }
  if(fxFlashEl.animate) fxFlashEl.animate([{opacity: 0}, {opacity: 1, offset: 0.28}, {opacity: 0}], {duration: ms});   // sale a 1 al 28% poi scende, come nel vecchio gioco
}

// ---------- MOVIMENTO ----------
// Niente overlay qui: l'unità è già nella casella di arrivo (lo stato è aggiornato), quindi per 300 ms la mappa
// viene ridisegnata ~5 volte (15 FPS) con l'unità in posizione interpolata e una scia sfumata, come nel vecchio gioco.
function fxMove(id, from, to){
  if(from[0] === to[0] && from[1] === to[1]) return;
  if(typeof slowMode !== 'undefined' && slowMode) return;   // modalità lenta: niente scorrimento, l'unità compare subito nella casella di arrivo
  fxMoves.set(id, {from, t0: Date.now()});
  fxKick();
}
function fxUnitPos(u){                                  // dove disegnare l'entità: la sua casella, o un punto lungo lo spostamento
  const [x, y] = ctr(u.c, u.r), m = fxMoves.get(u.id);
  if(!m) return [x, y];
  const k = (Date.now() - m.t0) / FX_MOVE_MS;
  if(k >= 1) return [x, y];
  const [ox, oy] = ctr(m.from[0], m.from[1]);
  return [ox + (x - ox) * k, oy + (y - oy) * k];
}

// Punto d'ingresso: lo chiama handleResult per ogni evento della risposta.
// lag = ms di ritardo per scintille ed esplosioni di danno (se nella stessa azione c'è un colpo in volo: compaiono all'arrivo).
function fxEvent(ev, lag = 0){
  const later = fn => lag ? setTimeout(fn, lag) : fn();
  if(ev.t === 'shot' && ev.from && ev.to){ if(ev.dist === 1) fxSlash(ev.to, ev.by); else fxShot(ev.from, ev.to, ev.by, ev.sniper); }
  else if(ev.t === 'slash') later(() => fxSlash(ev.at, ev.by));      // Esplosivo: fendente su ogni casella intorno all'impatto
  else if(ev.t === 'hit') later(() => fxHit(ev.at, ev.by));
  else if(ev.t === 'destroy' && ev.at) later(() => fxBoom(ev.at, ev.kind));
  else if(ev.t === 'move') fxMove(ev.id, ev.from, ev.to);
  else if(ev.t === 'flash' && fxStrikeWait(ev) && ev.at) fxStrike(ev.from, ev.at, ev.kind === 'nuke', ev.by);
}

// ---------- AGGIORNAMENTO (un passo = un fotogramma a 15 FPS del vecchio gioco) ----------
function fxStep(){
  for(let i = fxParticles.length - 1; i >= 0; i--){      // particelle: movimento, attrito, dissolvenza (come nel vecchio gioco)
    const p = fxParticles[i];
    p.px = p.x; p.py = p.y;
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.85; p.vy *= 0.85;
    p.life -= p.decay;
    if(p.life <= 0) fxParticles.splice(i, 1);
  }
  const now = Date.now();
  fxMoves.forEach((m, id) => { if(now - m.t0 >= FX_MOVE_MS) fxMoves.delete(id); });
  for(let i = fxBullets.length - 1; i >= 0; i--){
    const b = fxBullets[i];
    b.progress += b.speed * 1.6;
    if(b.progress >= 1){ const p = fxPx(b.to); fxSpawn(p.x, p.y, b.fc, 4, false); fxBullets.splice(i, 1); }
  }
  for(let i = fxSlashes.length - 1; i >= 0; i--){
    const s = fxSlashes[i];
    s.progress += 0.14;
    if(s.progress >= 1) fxSlashes.splice(i, 1);
    else if(s.progress > 0.3 && !s.spawned){ const p = fxPx(s.at); fxSpawn(p.x, p.y, s.color, 4, false); s.spawned = true; }
  }
}

// ---------- DISEGNO ----------
function fxDraw(){
  const g2 = fxG;
  g2.clearRect(0, 0, fxW, fxH);
  fxDrawAmbient();                                       // immagini ambientali: sotto spari ed esplosioni
  fxDrawAir();

  g2.lineCap = 'round';                                  // particelle (sotto proiettili e fendenti, come nel vecchio gioco)
  for(let i = 0; i < fxParticles.length; i++){
    const p = fxParticles[i];
    g2.globalAlpha = p.life;
    g2.strokeStyle = p.color; g2.lineWidth = p.size;
    g2.beginPath(); g2.moveTo(p.px, p.py); g2.lineTo(p.x, p.y); g2.stroke();
  }
  g2.globalAlpha = 1;

  for(let i = 0; i < fxBullets.length; i++){             // proiettili: scia colorata con anima bianca
    const b = fxBullets[i];
    if(b.progress <= 0) continue;
    const p1 = fxPx(b.from), p2 = fxPx(b.to), t = Math.max(0, b.progress - 0.2);
    g2.beginPath();
    g2.moveTo(p1.x + (p2.x - p1.x) * t, p1.y + (p2.y - p1.y) * t);
    g2.lineTo(p1.x + (p2.x - p1.x) * b.progress, p1.y + (p2.y - p1.y) * b.progress);
    g2.strokeStyle = b.color; g2.lineWidth = 4; g2.stroke();
    g2.strokeStyle = '#ffffff'; g2.lineWidth = 2; g2.stroke();
  }

  for(let i = 0; i < fxSlashes.length; i++){             // fendenti: linea colorata + anima luminosa + lampo centrale
    const s = fxSlashes[i];
    if(s.progress <= 0) continue;
    const p = fxPx(s.at);
    g2.save();
    g2.translate(p.x, p.y); g2.rotate(s.angle);
    const full = S * 2.2;
    const head = -full + (full * 2 * Math.min(1, s.progress * 1.5));
    const tail = -full + (full * 2 * Math.max(0, (s.progress - 0.25) * 1.5));
    const alpha = Math.max(0, Math.sin(s.progress * Math.PI));
    g2.globalAlpha = alpha;
    g2.strokeStyle = s.color; g2.lineWidth = 14 * alpha;
    g2.beginPath(); g2.moveTo(tail, 0); g2.lineTo(head, 0); g2.stroke();
    g2.globalCompositeOperation = 'lighter';
    g2.strokeStyle = 'rgba(255,255,255,0.7)'; g2.lineWidth = 5 * alpha;
    g2.beginPath(); g2.moveTo(tail, 0); g2.lineTo(head, 0); g2.stroke();
    g2.globalCompositeOperation = 'source-over';
    if(s.progress > 0.2 && s.progress < 0.5){
      g2.beginPath(); g2.arc(0, 0, S * 0.8 * alpha, 0, Math.PI * 2);
      g2.fillStyle = '#ffffff'; g2.globalAlpha = alpha * 0.4; g2.fill();
    }
    g2.restore();
  }
}

function fxDrawAir(){                                   // colpi in volo e anelli d'impatto (tempo reale: la fluidità non cambia la durata)
  const g2 = fxG, now = Date.now();
  for(let i = fxAir.length - 1; i >= 0; i--){
    const a = fxAir[i], fl = a.nuke ? FX_NUKE_FLIGHT : FX_SHELL_FLIGHT, bl = a.nuke ? FX_NUKE_BLAST : FX_SHELL_BLAST, el = now - a.t0;
    if(el >= fl + bl){ fxAir.splice(i, 1); continue; }
    const p1 = fxPx(a.from), p2 = fxPx(a.to);
    if(el < fl){                                         // volo: raggio singolo, colore di fazione + anima bianca. Normale: accelera (ease-in), lungo e sottile. Nucleare: parte piano e frena (ease-in-out), corto, largo e lampeggiante
      const t = el / fl;
      const e = a.nuke ? (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t) : t * t;
      const head = e, tail = Math.max(0, e - (a.nuke ? 0.25 : 0.4));    // lunghezza della scia: 0.25 del percorso (nucleare) o 0.4 (normale)
      let outer = a.color, core = '#ffffff', w = a.nuke ? 16 : 8, alpha = 1;   // spessore: 16 (nucleare) o 8 (normale)
      if(a.nuke && Math.floor(el / 100) % 2){ outer = '#ffffff'; core = a.color; alpha = 0.65; }   // lampeggio: ogni 100 ms scambia i colori e si attenua un po'
      g2.save();
      g2.globalAlpha = alpha; g2.lineCap = 'round';
      g2.beginPath();
      g2.moveTo(p1.x + (p2.x - p1.x) * tail, p1.y + (p2.y - p1.y) * tail);
      g2.lineTo(p1.x + (p2.x - p1.x) * head, p1.y + (p2.y - p1.y) * head);
      g2.strokeStyle = outer; g2.lineWidth = w; g2.stroke();
      g2.strokeStyle = core; g2.lineWidth = w / 2; g2.stroke();
      g2.restore();
    } else {                                             // impatto
      if(!a.hit){ a.hit = true; if(a.nuke) fxFlash(bl); }
      const t = (el - fl) / bl;
      g2.beginPath();
      if(a.nuke){                                        // alone bianco che si espande fino a coprire l'area d'esplosione
        g2.arc(p2.x, p2.y, S * (0.2 + 4.8 * t), 0, Math.PI * 2);
        g2.globalAlpha = 1 - t; g2.strokeStyle = '#ffffff'; g2.lineWidth = 6 * (1 - t * 0.8); g2.stroke();
      } else {                                           // cerchio arancione che si espande e sfuma
        g2.arc(p2.x, p2.y, S * (0.2 + 1.6 * t), 0, Math.PI * 2);
        g2.fillStyle = 'rgba(255,140,0,' + (0.4 * (1 - t)) + ')'; g2.fill();
        g2.globalAlpha = 1 - t; g2.strokeStyle = '#ff8800'; g2.lineWidth = 4 * (1 - t); g2.stroke();
      }
      g2.globalAlpha = 1;
    }
  }
}

// ---------- IMMAGINI AMBIENTALI ----------
// Movimento a tempo (pixel al secondo): stessa velocità a 60 e 120 Hz. Si disegnano qui: la mappa non viene ridisegnata.
function fxAmbientAdd(file, dir){
  const pad = 150, speed = 36 + Math.random() * 36;          // 36-72 px/s (come prima a 60 Hz)
  fxAmbient.push({file, dir, x0: dir === 1 ? -pad : fxW + pad, y0: Math.random() * fxH, vx: dir * speed, vy: (Math.random() - 0.5) * 18, t0: Date.now()});
  fxKick();
}
function fxDrawAmbient(){
  const now = Date.now(), pad = 250;
  for(let i = fxAmbient.length - 1; i >= 0; i--){
    const a = fxAmbient[i], t = (now - a.t0) / 1000, x = a.x0 + a.vx * t, y = a.y0 + a.vy * t;
    if((a.dir === 1 && x > fxW + pad) || (a.dir === -1 && x < -pad) || y < -pad || y > fxH + pad){ fxAmbient.splice(i, 1); continue; }   // uscita dallo schermo
    const img = loadImg(a.file); if(!img || !img.naturalWidth) continue;      // non ancora caricata, o file mancante
    const size = S * ((typeof SPRITE_SCALE !== 'undefined' && SPRITE_SCALE.unit) ? SPRITE_SCALE.unit : 0.8) * 2, k = size / Math.max(img.naturalWidth, img.naturalHeight);
    fxG.globalAlpha = 1;
    fxG.drawImage(img, x - img.naturalWidth * k / 2, y - img.naturalHeight * k / 2, img.naturalWidth * k, img.naturalHeight * k);
  }
}

// ---------- CICLO: parte con il primo effetto, si ferma quando non c'è più nulla ----------
function fxKick(){ if(!fxRaf){ fxLast = 0; fxAcc = 0; fxRaf = requestAnimationFrame(fxLoop); } }
function fxLoop(ts){
  fxRaf = requestAnimationFrame(fxLoop);
  const need = (fxAir.length || fxAmbient.length) ? FX_STEP_FAST : FX_STEP;    // 30 FPS solo con un colpo in volo, altrimenti 15
  const dt = fxLast ? ts - fxLast : FX_STEP;
  if(fxLast && dt < need) return;                        // salta i fotogrammi in eccesso
  fxLast = fxLast ? ts - (dt % need) : ts;
  const moving = fxMoves.size > 0;                       // se qualcuno si sta muovendo (o ha appena finito) si ridisegna anche la mappa
  fxAcc += dt;
  if(fxAcc >= FX_STEP * 0.9){ fxAcc = Math.max(0, fxAcc - FX_STEP); fxStep(); }   // la simulazione resta a 15 passi al secondo
  fxDraw();
  if(moving) redraw();
  if(!fxBullets.length && !fxSlashes.length && !fxParticles.length && !fxMoves.size && !fxAir.length && !fxAmbient.length){
    cancelAnimationFrame(fxRaf); fxRaf = 0;              // finito: a riposo non gira nulla
    fxG.clearRect(0, 0, fxW, fxH);
  }
}
