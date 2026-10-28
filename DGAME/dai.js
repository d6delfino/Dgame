/* ============================================================
   dai.js — INTELLIGENZA ARTIFICIALE DEI BOT (DawnlorD)
   ============================================================
   Semplice ma efficace. Il bot gioca con le STESSE azioni di un giocatore umano (applyAction),
   quindi non può barare sulle regole: l'unico vantaggio è quello iniziale (vedi sotto).

   CARICAMENTO: dopo drules.js e prima di dnet.js (come già nell'HTML).
   Dipende solo dalle funzioni di drules.js (targets, reachable, canShoot, unitCost...) e,
   per aggiornare lo schermo, da handleResult() (HTML) / hostAfter() (dnet.js, solo online).
   Online i bot girano SOLO sul dispositivo dell'host.

   COSA FA IL BOT
   - Prima della partita (colore, tessera, base, 3 carte): scelte semplici, in parte casuali.
   - VANTAGGIO INIZIALE: parte con BOT_START_UNITS unità (drules.js) le cui abilità sono tirate
     a caso tra il minimo e il massimo, senza pagare crediti (vedi giveBotStart in fondo).

   TURNO DI GIOCO, in quest'ordine
     1. ACQUISTO CARTE: sostituisce le carte già usate (costo NEW_CARD_COST), ma solo con i
        crediti che avanzano dopo la prossima unità (AI_CARD_KEEPS_UNIT_BUDGET).
     2. Carte permanenti (Spettro, Scudo, Upgrade, MediBuff) e combo Airdrop (+ Blitz).
     3. AGENTI in ordine di VITA decrescente (la base, 30 di vita, è la prima).
        Per ognuno, a ogni azione, una LISTA LINEARE di priorità (come nel vecchio gioco):
          1) SPARARE: bersaglio migliore a tiro (uccisione > danno; unità > base > edifici)
          2) (solo la base) CREARE UNA UNITÀ: servono AI_UNIT_MIN_CREDITS crediti, più
             AI_UNIT_CREDITS_PER_UNIT per ogni unità già in campo; spende tutto per abilità alte
          3) ULTIMA AZIONE: o spara (punto 1) oppure si mette al sicuro su un terreno che dà
             vantaggio (copertura, nebbia, montagna) lontano dalle minacce
          4) POSIZIONAMENTO: se ha gittata > 1, va nella casella da cui può sparare più lontana
             dal bersaglio
          5) AVANZARE verso il nemico più vicino per la strada libera
          6) SFONDARE le rocce solo se la strada libera non esiste
     4. Fortino (barricate attorno al nemico più vicino) e fine turno.
   DIFESA NEMICA (vedi sezione omonima): chi è in difesa (o un bunker) risponde per primo; l'AI ne calcola la risposta prima di
   muoversi o sparare, cerca i colpi a cui non può rispondere (fuori gittata o fuori linea) e usa le carte per aggirarlo.

   PRESTAZIONI: il calcolo è spezzato in fette di AI_SLICE_MS e fra un'azione e l'altra c'è una
   pausa (AI_STEP_MS): il browser resta fluido anche su tablet poco potenti.
   ============================================================ */

// ================== CONFIGURAZIONE ==================
const AI_UNIT_MIN_CREDITS = 12;       // crediti minimi per produrre una nuova unità
const AI_UNIT_CREDITS_PER_UNIT = 3;   // crediti in più richiesti per ogni unità già presente
const AI_STAT_ORDER = ['attacco','gittata','vita','passi'];   // ordine con cui spende i crediti sulle abilità (un punto alla volta, a rotazione)
const AI_START_STAT_MAX = 4;          // massimo delle abilità delle unità iniziali dei bot (war): tiro da STAT_MIN a questo valore
const AI_START_RANDOM_STATS = true;   // unità iniziali dei bot con abilità a caso tra minimo e massimo
const AI_BASE_FAR_WEIGHT = 1000;      // peso della distanza dalle altre basi nella scelta dell'angolo (vince sempre sul resto)
const AI_THREAT_MOVES = 1;            // un nemico "minaccia" una casella se è entro (passi × questo numero + gittata)
const AI_CARD_FIRST_CHANCE = 0.5;     // probabilità che in un turno l'AI compri le carte senza badare al budget della prossima unità (altrimenti compra solo coi crediti che avanzano)
const AI_DEF_KEEP_HP = 0.5;           // contro un difensore: dopo le sue risposte deve restarle almeno questa frazione della vita (se il colpo lo uccide basta restare vivi)
const AI_DEF_PATIENCE = 2;            // turni di fila in cui un difensore le impedisce di avanzare o sparare, prima che l'unità diventi "audace" (basta restare vive): niente stalli
const AI_DEF_BLUNDER_CHANCE = 0.3;    // probabilità che, in un turno, l'unità "sbagli" e ignori la paura dei difensori (si getta all'attacco senza calcolarne la risposta): 0 = mai, 1 = sempre
const AI_AIRDROP_MIN_ROUND = 2;       // Airdrop usabile dal round indicato in poi
const AI_FORTINO_MAX_DIST = 8;        // Fortino solo se un nemico è entro questa distanza da una mia unità o dalla base
const AI_ROCK_COST = 3;               // "costo" di una roccia nel calcolo della strada (le rocce si possono sfondare)
const AI_ROCK_SHOT_SCORE = 50000;     // valore di un colpo contro un'unità (Spettro) dentro una roccia: il danno va alla roccia (meno di un colpo vero, più di basi ed edifici)
const AI_BASE_MIN_RANGE = 3;          // gittata minima delle unità che attaccano le basi: la base spara fino a 2, quindi si tira da 3 o più (se non ne ho nessuna, attaccano tutte)
const AI_STUCK_TURNS = 4;              // se un'unità, all'inizio di questo numero di turni di fila, sta nelle stesse 2 caselle (o 3 caselle in 6 turni) è "bloccata": niente più prudenza all'ultimo passo, avanza
const AI_MINE_DETOUR = 2;             // deviazione massima dalla strada (in caselle di distanza dall'obiettivo) per fermarsi accanto a una miniera da conquistare
const AI_CARD_WEIGHTS = {C01:2,C02:2,C03:2,C04:2,C05:2,C06:2,C07:3,C08:1,C09:2,C10:1};   // probabilità relative di scelta delle carte
const AI_MEDIKIT_BASE_HP = 9;         // MediBuff: la base è un bersaglio possibile solo se ha meno di tanta vita
// tempi in ms (let: si possono cambiare, per esempio a 0 nei test)
let AI_STEP_MS = 450;     // pausa dopo ogni movimento o sparo (così si vede cosa fa il bot)
let AI_CARD_MS = 700;     // pausa dopo una carta (il banner dura circa 1,4 s)
let AI_FAST_MS = 120;     // pausa dopo le altre azioni
let AI_PHASE_MS = 700;    // pausa prima di scegliere colore / tessera / base / carte
let AI_SLICE_MS = 8;      // tempo massimo di calcolo continuo prima di cedere il controllo al browser
let AI_POLL_MS = 250;     // ogni quanto controlla se tocca a un bot
let AI_FOG_MS = 10;       // coop: pausa dopo un'azione che si svolge tutta nella nebbia di guerra (non si vede)

// ================== STATO E UTILITÀ ==================
let aiCurId = -1, aiMemPlayers = null;                      // unità che sta giocando adesso
const aiDefWait = new Map();          // id unità → turni di fila in cui un difensore nemico le ha impedito di avanzare o sparare
let aiDefBlocked = false, aiDidShoot = false;   // nel turno dell'unità che sta giocando: un difensore l'ha bloccata · ha sparato
let aiBlunder = false;                          // nel turno dell'unità che sta giocando: ha "sbagliato" (ignora la risposta dei difensori)
const aiTrail = new Map(), aiBold = new Set(), aiDone = new Set();   // memoria dell'AI: caselle di inizio turno di ogni unità · unità bloccate (modalità "avanza") · unità che hanno già giocato in questo turno
const AI_ABORT = {aiAbort:true};      // lanciato quando la partita cambia sotto i piedi del bot (nuova partita, uscita dalla stanza...)
let aiRun = null, aiBusy = false, aiFailStreak = 0, aiNextTry = 0, aiLastYield = 0;
const aiMe = () => step % NUM_PLAYERS;
const aiValid = () => !!aiRun && players === aiRun.players && step === aiRun.step && phase === aiRun.phase && isBotTurn();
const aiSleep = ms => new Promise(r => setTimeout(r, ms));
const aiNow = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
async function aiCheck(){             // pausa nei calcoli: cede il controllo se si calcola da troppo tempo
  if(aiNow() - aiLastYield > AI_SLICE_MS){ await aiSleep(0); aiLastYield = aiNow(); }
  if(!aiValid()) throw AI_ABORT;
}
let aiFogAct = false;                 // l'ultima azione del bot si è svolta tutta nella nebbia di guerra (coop)
async function aiPause(ms){ if(aiFogAct && ms > AI_FOG_MS) ms = AI_FOG_MS; if(ms > 0) await aiSleep(ms); aiLastYield = aiNow(); await aiCheck(); }
const aiOverBudget = () => Date.now() - aiRun.t0 > Math.max(10000, (TURN_SECONDS - 15) * 1000) || aiRun.actions > 300;

function isBotTurn(){                 // usata da dnet.js: nel turno di un bot l'umano non può muovere
  try{ const p = players && players[step % NUM_PLAYERS]; return !!(p && p.bot); }catch(e){ return false; }
}
function aiHidden(a){                 // coop: l'azione si svolge solo in caselle che nessun giocatore vede? (da chiamare PRIMA di applicarla)
  try{
    if(typeof COOP === 'undefined' || !COOP || typeof coopFogOn !== 'function' || !coopFogOn()) return false;
    const e = a.ent != null ? findEnt(a.ent) : null;
    if(!e || coopSeen(e.c,e.r)) return false;                          // senza unità, o chi agisce si vede
    if(a.t === 'move' || a.t === 'attack') return !coopSeen(a.c,a.r);   // arrivo / bersaglio anch'essi nella nebbia
    return true;
  }catch(err){ return false; }
}
function aiSend(a){                   // invia un'azione per conto del bot e aggiorna lo schermo
  const pi = aiMe(), prev = phase;
  aiFogAct = aiHidden(a);
  const res = applyAction(a, pi);
  if(!res.ok){ console.warn('[AI] azione rifiutata:', a.t, res.err); return res; }
  if(aiRun) aiRun.actions++;
  if(typeof online !== 'undefined' && online && typeof hostAfter === 'function') hostAfter(a, pi, res, undefined, prev, false);   // host online: stato ai client
  else handleResult(a, res, prev, false);                                                                                        // partita locale
  return res;
}
const aiRnd = n => Math.floor(Math.random() * n);
const aiSlots = id => { const p = curPlayer(), out = []; p.cards.forEach((c,i)=>{ if(c === id && !p.usedCards[i]) out.push(i); }); return out; };   // slot non ancora usati di quella carta
function aiPickCard(){                // carta a caso, pesata
  const ids = Object.keys(CARDS), w = ids.map(id => AI_CARD_WEIGHTS[id] ?? 1);
  let x = Math.random() * w.reduce((a,b)=>a+b,0);
  for(let i=0;i<ids.length;i++){ x -= w[i]; if(x < 0) return ids[i]; }
  return ids[ids.length-1];
}

// ================== BERSAGLI E DANNO ==================
const aiEnemies = () => { const me = aiMe(), out = []; players.forEach((p,i)=>{ if(i !== me && !p.surrendered) out.push(...p.units, ...p.bases, ...p.structs); }); return out; };
const aiDomeShield = (c,r) => players.some(p => p.structs.some(s => s.type === 'domo' && s.cs && s.cs[key(c,r)] > 0));
const aiInRock = (att,t) => !att.sniperBuff && t && (rockAt(t.c,t.r) || !!structCover(t)); // FIX: assicura che 't' non sia null prima di leggerne le coordinate
function aiDmg(att,t){                // danno netto stimato di att su t (0 = colpo inutile o assorbito da uno scudo)
  if(aiInRock(att,t)) return 0;                                    // l'unità dentro una roccia: il colpo lo assorbe la roccia
  if(t.shielded || aiDomeShield(t.c,t.r)) return 0;
  return Math.max(MIN_DAMAGE, attackOf(att) - reductionOf(t));     // copertura e armatura riducono il danno
}
const aiKills = (d,t) => d > 0 && d >= t.hp + (t.medikitBuff ? MEDIKIT_HEAL : 0);
function aiScoreTarget(att,t,d){      // come il vecchio gioco: uccisione > danno; unità > base > edifici. -1 = non vale la pena
  if(aiInRock(att,t)) return AI_ROCK_SHOT_SCORE + attackOf(att)*10;   // si spara comunque: il danno sgretola la roccia e prepara i colpi successivi
  let s = t.isBase ? 5000 : t.isStruct ? 3000 : 100000;
  if(d <= 0) return (t.shielded || aiDomeShield(t.c,t.r)) ? s/4 : -1;   // contro uno scudo: si spara solo per toglierlo
  if(aiKills(d,t)) s += 100000;
  return s + d*10 + (10 - Math.min(10, t.hp));
}
// ================== DIFESA NEMICA ==================
// Chi è in difesa (azione "Difesa"; i bunker lo sono sempre) risponde PER PRIMO a chi gli si ferma a tiro e a chi lo attacca: la risposta toglie vita e,
// se l'aggressore muore, il suo colpo non arriva. Una risposta è possibile solo se l'aggressore è nella gittata E sulle linee di tiro del difensore.
// Come ragiona l'AI:
//   1) CALCOLA la risposta prima di muoversi o sparare (aiReact): si incassa solo se resta almeno metà vita (AI_DEF_KEEP_HP), o se il colpo uccide il difensore e si sopravvive.
//   2) CERCA i colpi senza risposta: fuori dalla gittata del difensore (MediBuff/Upgrade +1, Cecchino x2) o fuori dalle sue linee (Esplosivo accanto a lui).
//   3) Gli SCUDI assorbono una risposta ciascuno: un'unità con scudo entra senza paura.
//   4) NIENTE STALLI: dopo AI_DEF_PATIENCE turni bloccata l'unità diventa "audace" (aiBold): accetta ogni risposta che non la uccide.
const aiDefenders = () => aiEnemies().filter(d => d.defending);        // nemici in difesa: unità, basi e bunker
function aiReact(e,c,r,victims){      // danno totale che e subirebbe fermandosi o sparando in (c,r): una risposta per ogni difensore di "victims" che lo ha a tiro (uno scudo ne annulla una)
  if(aiBlunder && e.id === aiCurId) return 0;                                              // "svista" (AI_DEF_BLUNDER_CHANCE): l'unità non calcola la risposta e si getta sul difensore
  if(!victims.length || (rockAt(c,r) && !e.isBase) || structCover(e,c,r)) return 0;        // Spettro dentro una roccia o su un proprio edificio: la risposta la prende la roccia
  const me = {...e, c, r, revealed:!!e.revealed};
  let sh = e.shielded || 0, dmg = 0;
  for(const d of victims){
    if(!d.defending || !canReact(d,me)) continue;
    if(sh > 0){ sh--; continue; }
    dmg += Math.max(MIN_DAMAGE, attackOf(d) - reductionOf(me));
  }
  return dmg;
}
const aiAfford = (e,dmg,kills) => dmg <= 0 || e.hp - dmg >= ((kills || aiBold.has(e.id)) ? 1 : Math.ceil(maxHp(e) * AI_DEF_KEEP_HP));   // la risposta si può incassare?
function aiReactPlan(e,c,r,t,stay,defs){   // risposta che e incasserebbe sparando a t da (c,r); stay = è già lì (niente fermata: altrimenti rispondono anche i difensori "defs" a tiro). -1 = troppo rischioso
  const victims = stay ? [] : defs.slice();
  if(t && t.defending) victims.push(t);                               // poi risponde anche il bersaglio
  const dm = aiReact(e,c,r,victims);
  if(dm > 0 && !aiAfford(e,dm,!!t && aiKills(aiDmg(e,t),t))){ aiDefBlocked = true; return -1; }
  return dm;
}
function aiApproachCost(e,c,r,defs){  // costo di fermarsi in (c,r) per poi sparare al difensore più vicino: le risposte alla fermata + quella del bersaglio
  if(!defs.length) return 0;
  let near = defs[0], nd = Infinity;
  defs.forEach(d => { const x = hexDist([c,r],[d.c,d.r]); if(x < nd){ nd = x; near = d; } });
  return aiReact(e,c,r,[...defs, near]);
}
const aiSiege = () => curPlayer().units.some(u => rangeOf(u) >= AI_BASE_MIN_RANGE);   // ho almeno un'unità che può colpire una base da fuori dalla sua gittata
const aiNoSiege = new Set();          // id delle unità che non hanno nessuna casella di tiro sicura contro la base: attaccano da qualunque distanza
function aiBaseTooClose(e,t,dist,dm,c,r,stay){
  // Le unità si tengono fuori dalla gittata della base nemica (gittata 2), tranne se possono distruggerla col colpo.
  // Se nessuna mia unità può tirare da 3 o più (o questa non ha un punto di tiro) la regola non vale: altrimenti resterebbero ferme davanti alla base senza mai sparare
  if(!aiSiege() || aiNoSiege.has(e.id)) return false;
  if(!(t.isBase && !e.isBase && dist <= 2 && !aiKills(dm,t))) return false;
  return !aiHitAndRun(e,t,c === undefined ? e.c : c, r === undefined ? e.r : r, stay !== false);   // base NON in difesa: da vicino si può sparare se resta un'azione per ritirarsi
}
const aiBaseSafeAt = (b,x,y) => hexDist([x,y],[b.c,b.r]) > (T(x,y).hitOnlyAdjacent ? 1 : rangeOf(b));   // la base non può colpire (x,y): stessa regola di aiThreat
function aiHitAndRun(e,t,c,r,stay){    // colpo e fuga contro una base NON in difesa: [spostarsi in (c,r)] + sparare + ritirarsi fuori dalla gittata delle basi nemiche
  if(t.defending || e.actions < (stay ? 2 : 3)) return false;
  const bases = aiEnemies().filter(b => b.isBase), ox = e.c, oy = e.r; let ok = false;
  e.c = c; e.r = r;                    // reachable() parte dalla posizione dell'unità: la si sposta solo per questo calcolo (sincrono) e la si rimette subito
  try{ for(const k of reachable(e).keys()){ const [x,y] = k.split(',').map(Number); if(bases.every(b => aiBaseSafeAt(b,x,y))){ ok = true; break; } } }
  finally{ e.c = ox; e.r = oy; }
  return ok;
}
function aiRaidCells(e,base){          // base NON in difesa e unità a gittata corta: caselle in linea da cui può colpirla e poi ritirarsi (solo con 3 azioni e se ne raggiunge una con 1 movimento)
  if(base.defending || e.actions < 3) return [];
  const reach = reachable(e), out = [], [q0,r0] = toCube(base.c,base.r), tb = T(base.c,base.r);
  DIRS.forEach(([dq,dr])=>{
    for(let i=1; i<=e.st.gittata+1; i++){
      const r = r0+dr*i, c = (q0+dq*i)+(r-(r&1))/2;
      if(!exists(c,r) || (tb.hitOnlyAdjacent && i > 1)) break;
      const t = T(c,r), R = t.shootOnlyAdjacent ? 1 : e.st.gittata + (t.rangeBonus || 0);
      if(i <= R && reach.has(key(c,r)) && aiHitAndRun(e,base,c,r,false)) out.push([c,r]);
      if(t.blocksShot || occupied(c,r) || terr(c,r) === 'rocce') break;   // il tiro non passa
    }
  });
  return out;
}
function aiBestShot(e){               // miglior colpo possibile ADESSO (se il bersaglio è in difesa, solo se si può incassare la sua risposta)
  let best = null; const seen = new Set();
  
  // 1. Cerca se c'è una roccia che ostacola il tiro VERSO UNA BASE NEMICA
  let blockingRock = null;
  const R = T(e.c,e.r).shootOnlyAdjacent ? 1 : rangeOf(e);
  const enemyBases = players.flatMap((p,i) => (i !== aiMe() && !p.surrendered) ? p.bases : []);

  for (const b of enemyBases) {
    const dist = hexDist([e.c,e.r], [b.c,b.r]);
    if (dist > 1 && dist <= R) {
      const A = toCube(e.c,e.r), B = toCube(b.c,b.r);
      if (A[0] === B[0] || A[1] === B[1] || A[2] === B[2]) { // Sono in linea retta
        const line = hexLine([e.c,e.r], [b.c,b.r]);
        let rockFound = null;
        let blocked = false;
        // Scansiona la linea dalla mia unità fino a poco prima della base nemica
        for (let i = 1; i < line.length - 1; i++) {
          const [cx, cy] = line[i];
          if (terr(cx, cy) === 'rocce') {
            if (!rockFound) rockFound = {c: cx, r: cy}; // Memorizza la prima roccia incontrata
          } else if (T(cx, cy).blocksShot || occupied(cx, cy)) {
            blocked = true; break; // C'è una montagna o un'altra unità a bloccare la visuale
          }
        }
        if (rockFound && !blocked) blockingRock = rockFound;
      }
    }
  }

  // 2. Valuta tutti i bersagli standard in vista
  for(const h of targets(e)){
    const k = key(h.c,h.r); if(seen.has(k)) continue; seen.add(k);
    const t = enemyAt(h.c,h.r); 
    
    if(!t) {
      // Attacca la roccia SOLO SE abbiamo verificato che nasconde la base del giocatore
      if (blockingRock && h.c === blockingRock.c && h.r === blockingRock.r) {
        const s = 4000; // Ottima priorità (libera la strada), ma inferiore a un bersaglio già esposto
        if(!best || s > best.s) best = {c:h.c, r:h.r, t:null, d:attackOf(e), s, kill:false, rock:true};
      }
      continue; 
    }
    
    const d = aiDmg(e,t), s = aiScoreTarget(e,t,d); if(s < 0) continue;
    // Preferisce sempre attaccare dalla massima gittata
    const distBonus = hexDist([e.c,e.r],[t.c,t.r]) * 50; 
    if(aiBaseTooClose(e,t,hexDist([e.c,e.r],[t.c,t.r]),d)) continue;
    const rc = aiReactPlan(e,e.c,e.r,t,true,[]); if(rc < 0) continue;                       // risposta del difensore troppo pesante: non si spara da qui
    if(!best || (s + distBonus - rc*40) > best.s) best = {c:h.c, r:h.r, t, d, s: s + distBonus - rc*40, kill:aiKills(d,t), rock:aiInRock(e,t)};
  }
  return best;
}
function aiShotFrom(e,c,r,foes,stay){ // come aiBestShot, ma standando in (c,r) (controllo veloce: linee rette, gittata, ostacoli, nebbia); stay = e è già lì, altrimenti conta anche la fermata
  const tt = T(c,r), R = tt.shootOnlyAdjacent ? 1 : e.st.gittata + (tt.rangeBonus || 0), A = toCube(c,r), defs = stay ? [] : foes.filter(d => d.defending);
  let best = null;
  for(const t of foes){
    const d = hexDist([c,r],[t.c,t.r]); if(d < 1 || d > R) continue;
    const B = toCube(t.c,t.r);
    if(A[0] !== B[0] && A[1] !== B[1] && A[2] !== B[2]) continue;   // si spara solo lungo le 6 rette
    if(!canShoot([c,r],[t.c,t.r],t.revealed)) continue;
    const dm = aiDmg(e,t), s = aiScoreTarget(e,t,dm); if(s < 0) continue;
    if(aiBaseTooClose(e,t,d,dm,c,r,!!stay)) continue;
    const rc = aiReactPlan(e,c,r,t,!!stay,defs); if(rc < 0) continue;                       // le risposte dei difensori (alla fermata e del bersaglio) sono troppo pesanti
    if(!best || s - rc*40 > best.s) best = {t, d:dm, s:s - rc*40, kill:aiKills(dm,t), rc};
  }
  return best;
}
function aiGlobalTarget(e){           // obiettivo: l'unità nemica più vicina; se non ce ne sono, la base nemica più vicina
  let best = null, bd = Infinity; const me = aiMe();
  for(const list of ['units','bases']){
    players.forEach((p,i)=>{ if(i === me || p.surrendered) return; p[list].forEach(t=>{ const d = hexDist([e.c,e.r],[t.c,t.r]); if(d < bd && d <= aiAggro()){ bd = d; best = t; } }); });   // coop: i mostri inseguono solo chi è vicino
    if(best) return best;
  }
  return null;
}

// ================== SICUREZZA E TERRENO ==================
function aiThreat(c,r){               // quanti nemici potrebbero colpire una mia unità ferma in (c,r) al loro prossimo turno
  const fog = !!T(c,r).hitOnlyAdjacent, me = aiMe(); let n = 0;      // nella nebbia si viene colpiti solo da adiacenti
  players.forEach((p,i)=>{
    if(i === me || p.surrendered) return;
    p.units.forEach(u => { if(hexDist([c,r],[u.c,u.r]) <= (fog ? AI_THREAT_MOVES*moveOf(u) + 1 : AI_THREAT_MOVES*moveOf(u) + rangeOf(u))) n++; });
    p.bases.forEach(b => { if(hexDist([c,r],[b.c,b.r]) <= (fog ? 1 : rangeOf(b))) n++; });
    p.structs.forEach(s => { if(BUILDINGS[s.type].autoDefend && hexDist([c,r],[s.c,s.r]) <= (fog ? 1 : BUNKER_RANGE)) n++; });   // i bunker sparano a chi si ferma a tiro
  });
  return n;
}
function aiTerrainBonus(c,r){         // vantaggio del terreno: copertura (-danno), nebbia (colpibile solo da adiacenti), montagna (gittata +1); il fango rallenta
  const t = T(c,r); let b = 0;
  if(t.hitOnlyAdjacent) b += 800;
  if(t.damageReduction) b += 1000 * t.damageReduction;
  if(t.rangeBonus) b += 600;
  if(t.oneStepOnly) b -= 800;
  return b;
}
function aiCellScore(e,c,r,goal,defs){     // quanto è buona una casella per FINIRE il turno: sicurezza prima, poi terreno, poi vicinanza al nemico
  const th = aiThreat(c,r);
  let s = th === 0 ? 5000 : -1500 * th;
  s += aiTerrainBonus(c,r);
  if(defs && defs.length && (c !== e.c || r !== e.r)){                    // spostandosi a tiro di un difensore si prende subito la sua risposta
    const dm = aiReact(e,c,r,defs); if(dm > 0) s -= aiAfford(e,dm) ? 800 * dm : 1000000;
  }
  if(goal) s += 30 * (hexDist([e.c,e.r],[goal.c,goal.r]) - hexDist([c,r],[goal.c,goal.r]));
  return s;
}

// ================== STRADA (distanza dall'obiettivo) ==================
function aiEntryCost(c,r,spectre,allowRocks){
  const t = T(c,r);
  let cost = spectre ? 1 : (t.moveCost || 1);
  if(t.stopsMove) cost += 1;                                       // fango, montagne, copertura, risorse: occorre un'azione in più per ripartire
  if(allowRocks && !spectre && t.solid && terr(c,r) === 'rocce') cost += AI_ROCK_COST;
  return cost;
}
const aiParked = v => { if(v.id === aiCurId) return false; const h = aiTrail.get(v.id); return !!h && h[h.length-1] === key(v.c,v.r); };   // unità ferma da un turno intero (aspetta, o è bloccata): per gli altri è un ostacolo, non una casella che si libererà
function aiDistMap(goals,spectre,allowRocks,from,maxStep){   // distanza di ogni casella dalle caselle "goals" (visita a partire dall'obiettivo, ogni casella una sola volta; si ferma oltre la distanza di "from", la casella dell'unità)
  const occ = new Set(), mine = new Set(), me = aiMe();
  players.forEach((p,i)=>{ [...p.units,...p.bases,...p.structs].forEach(v=>occ.add(key(v.c,v.r))); if(i === me) p.units.forEach(v=>{ if(v.actions > 0 && !aiDone.has(v.id) && !aiParked(v)) mine.add(key(v.c,v.r)); }); });   // le mie unità che devono ancora muoversi si spostano; quelle che hanno finito il turno (o non hanno azioni) sono ostacoli
  const tooSteep = (c,r) => !spectre && maxStep !== undefined && moveCost(c,r) > maxStep;   // es. montagna (2 passi) per un'unità con 1 solo passo: non ci entrerà mai
  const solid = (c,r) => !spectre && (tooSteep(c,r) || (isSolid(c,r) && !(allowRocks && terr(c,r) === 'rocce')));
  let src = goals.filter(([c,r]) => !solid(c,r) && !(occ.has(key(c,r)) && !mine.has(key(c,r))));   // caselle su cui ci si può fermare
  if(!src.length) src = goals;
  const dist = new Map(), done = new Set(), buckets = [], gs = new Set(src.map(([c,r])=>key(c,r))), fk = from ? key(from[0],from[1]) : null;
  src.forEach(([c,r]) => { dist.set(key(c,r),0); (buckets[0] = buckets[0] || []).push([c,r]); });
  for(let d=0; d<buckets.length; d++){            // coda a "secchi": i costi sono numeri interi piccoli
    if(fk && done.has(fk) && d > dist.get(fk)) break;   // servono solo le caselle più vicine all'obiettivo dell'unità
    const list = buckets[d]; if(!list) continue;
    for(let i=0; i<list.length; i++){
      const [c,r] = list[i], k = key(c,r);
      if(done.has(k) || dist.get(k) !== d) continue;
      done.add(k);
      if(!gs.has(k) && (solid(c,r) || (occ.has(k) && !mine.has(k)))) continue;   // non si passa da roccia/acqua né da unità ed edifici (le mie unità si spostano)
      const nd = d + aiEntryCost(c,r,spectre,allowRocks);
      neighbors(c,r).forEach(([x,y])=>{ const nk = key(x,y), od = dist.get(nk); if(od === undefined || nd < od){ dist.set(nk,nd); (buckets[nd] = buckets[nd] || []).push([x,y]); } });
    }
  }
  return dist;
}
function aiPickProgress(e,dist,reach,visited){   // tra le caselle raggiungibili con 1 movimento, quella più vicina all'obiettivo (deve migliorare)
  const cur = dist.has(key(e.c,e.r)) ? dist.get(key(e.c,e.r)) : Infinity, defs = aiDefenders();
  let best = null, bd = Infinity, bt = -Infinity;
  reach.forEach((cost,k)=>{
    if(visited.has(k)) return;
    const d = dist.get(k); if(d === undefined || d >= cur) return;
    const [c,r] = k.split(',').map(Number);
    const dc = aiApproachCost(e,c,r,defs);                                  // fermarsi qui e poi sparare al difensore più vicino: l'unità sopravvive?
    if(dc > 0 && !aiAfford(e,dc)){ aiDefBlocked = true; return; }
    const tb = aiTerrainBonus(c,r) - dc * 1000;
    if(d < bd || (d === bd && tb > bt)){ bd = d; bt = tb; best = {c,r}; }
  });
  return best ? {t:'move', ent:e.id, c:best.c, r:best.r} : null;
}
function aiSiegeCells(e,base){        // caselle IN LINEA con la base (le 6 rette: solo così si spara), da AI_BASE_MIN_RANGE fino alla gittata dell'unità, con tiro libero (una sola roccia in mezzo si sfonda)
  const out = [], [q0,r0] = toCube(base.c,base.r), tb = T(base.c,base.r);
  if(tb.hitOnlyAdjacent && !(tb.fog && base.revealed)) return out;      // base nella nebbia: si colpisce solo da adiacente, nessun punto di tiro da lontano
  DIRS.forEach(([dq,dr])=>{
    let rocks = 0;
    for(let i=1; i<=e.st.gittata+1; i++){
      const r = r0+dr*i, c = (q0+dq*i)+(r-(r&1))/2;
      if(!exists(c,r)) break;
      const t = T(c,r), isRock = terr(c,r) === 'rocce';
      if(i >= AI_BASE_MIN_RANGE && i <= e.st.gittata + (t.rangeBonus||0) && !t.shootOnlyAdjacent && !isSolid(c,r) && !(enemyAt(c,r) || (occupied(c,r) && !allyAt(c,r)))) out.push([c,r]);
      if(isRock){ if(++rocks > 1) break; }                               // dietro due rocce non si arriva
      else if(t.blocksShot || occupied(c,r)) break;                       // montagna o qualcuno in mezzo: il tiro non passa
    }
  });
  return out;
}
function aiStagingCells(base){        // gittata corta: aspetta a distanza 3-4 dalla base (fuori dal suo tiro) e FUORI dalle rette di tiro, che servono a chi spara da lontano
  const [q0,r0,s0] = toCube(base.c,base.r);
  return hexesWithin(base.c,base.r,AI_BASE_MIN_RANGE+1).filter(([c,r]) => {
    if(hexDist([c,r],[base.c,base.r]) < AI_BASE_MIN_RANGE || isSolid(c,r)) return false;
    const [q,rr,s] = toCube(c,r); return q !== q0 && rr !== r0 && s !== s0;
  });
}
function aiSafeCells(e,goal){          // contro un difensore: caselle in linea da cui lo si colpisce e lui non può rispondere (serve più gittata della sua)
  const out = [], [q0,r0] = toCube(goal.c,goal.r);
  DIRS.forEach(([dq,dr])=>{
    for(let i=1; i<=e.st.gittata+1; i++){
      const r = r0+dr*i, c = (q0+dq*i)+(r-(r&1))/2;
      if(!exists(c,r)) break;
      if(!isSolid(c,r) && !occupied(c,r) && aiShotFrom(e,c,r,[goal],true) && aiReact(e,c,r,[goal]) === 0) out.push([c,r]);
      if(T(c,r).blocksShot) break;
    }
  });
  return out;
}
function aiGoalCells(e,goal){         // caselle d'arrivo: accanto al bersaglio; per una base, in linea di tiro e fuori dalla sua gittata se ho unità a lungo raggio
  if(goal.isBase && !e.isBase && aiSiege()){
    if(rangeOf(e) < AI_BASE_MIN_RANGE){                                    // gittata corta: non può assediare...
      if(!goal.defending){ const raid = aiRaidCells(e,goal); if(raid.length) return raid; }   // ...ma se la base non è in difesa fa colpo e fuga (muovi, spara, ritirati)
      return aiStagingCells(goal);                                          // altrimenti aspetta fuori tiro (non blocca le rette né la strada)
    }
    const cells = aiSiegeCells(e,goal);
    if(cells.length){ aiNoSiege.delete(e.id); return cells; }
    aiNoSiege.add(e.id);                                                  // nessun punto di tiro libero: si attacca da vicino, meglio che restare fermi
  }
  if(goal.defending && !e.isBase){ const safe = aiSafeCells(e,goal); if(safe.length) return safe; }   // difensore: ci si porta dove lo si colpisce senza risposta (se non esiste, ci si avvicina e basta)
  return neighbors(goal.c,goal.r);
}
function aiProgressMove(e,goal,reach,st){        // 5) avanzare per la strada libera; 6) se non c'è, sfondare le rocce
  const spectre = !!e.spectreBuff, goals = aiGoalCells(e,goal);
  const mv = aiPickProgress(e, aiDistMap(goals,spectre,false,[e.c,e.r],moveOf(e)), reach, st.visited);
  if(mv) return mv;
  if(spectre) return null;                        // lo Spettro passa ovunque: se non può avanzare, è bloccato da unità
  const dist2 = aiDistMap(goals,false,true,[e.c,e.r],moveOf(e)), cur = dist2.get(key(e.c,e.r));
  if(cur === undefined) return null;
  const mv2 = aiPickProgress(e, dist2, reach, st.visited);   // ci si avvicina alla roccia
  if(mv2) return mv2;
  let best = null, bd = Infinity;                 // già accanto: si spara alla roccia che sta sulla strada
  for(const h of targets(e)){
    if(terr(h.c,h.r) !== 'rocce' || enemyAt(h.c,h.r)) continue;
    const d = dist2.get(key(h.c,h.r));
    if(d !== undefined && d + 1 + AI_ROCK_COST <= cur && d < bd){ bd = d; best = h; }
  }
  return best ? {t:'attack', ent:e.id, c:best.c, r:best.r} : null;
}

// ================== MINIERE ==================
function aiMineSpots(){               // caselle (chiavi) in cui, restando fermi a fine turno, si conquista una miniera non mia (come conqueror() in drules.js)
  const me = aiMe(), out = new Set();
  mineOwner.forEach((o,cp) => {
    const [c,r] = cp.split(',').map(Number);
    if(terr(c,r) !== 'miniera' || teamOf(o) === teamOf(me)) return;
    if([...zonePlayers(c,r).guard].some(i => teamOf(i) !== teamOf(me))) return;   // il proprietario (o un altro nemico) ha qualcosa accanto: non si conquista
    [[c,r],...neighbors(c,r)].forEach(([x,y]) => out.add(key(x,y)));
  });
  return out;
}
function aiMineMove(e,goal,reach,st,spots){      // una mossa verso una casella da cui si conquista una miniera, solo se è sicura e la deviazione dalla strada è minima
  let any = false; reach.forEach((cost,k) => { if(spots.has(k) && !st.visited.has(k)) any = true; });
  if(!any) return null;
  const dist = aiDistMap(neighbors(goal.c,goal.r),!!e.spectreBuff,false,[e.c,e.r],moveOf(e));
  let bd = dist.has(key(e.c,e.r)) ? dist.get(key(e.c,e.r)) : Infinity;
  reach.forEach((cost,k) => { const d = dist.get(k); if(d !== undefined && d < bd) bd = d; });   // distanza che si otterrebbe avanzando normalmente
  let best = null, bs = -Infinity; const defs = aiDefenders();
  reach.forEach((cost,k) => {
    if(!spots.has(k) || st.visited.has(k)) return;
    const d = dist.get(k); if(d === undefined || d > bd + AI_MINE_DETOUR) return;
    const [c,r] = k.split(',').map(Number); if(aiThreat(c,r) > 0 || aiReact(e,c,r,defs) > 0) return;   // né sotto minaccia né a tiro di un difensore
    const s = -d + aiTerrainBonus(c,r) / 1000;
    if(s > bs){ bs = s; best = {c,r}; }
  });
  return best ? {t:'move', ent:e.id, c:best.c, r:best.r} : null;
}

// ================== MOSSE DELLE UNITÀ ==================
async function aiTactical(e,goal,reach,st){      // 4) gittata > 1: casella da cui può sparare, la più lontana dal bersaglio
  const foes = aiEnemies(); let best = null, bs = -Infinity, i = 0;
  for(const [k] of reach){
    if(++i % 8 === 0) await aiCheck();
    if(st.visited.has(k)) continue;
    const [c,r] = k.split(',').map(Number);
    const sh = aiShotFrom(e,c,r,foes); if(!sh) continue;
    const s = hexDist([c,r],[goal.c,goal.r]) * 10 + (aiThreat(c,r) === 0 ? 5 : 0) + aiTerrainBonus(c,r) / 200 - sh.rc * 30;   // meglio una casella di tiro a cui nessuno può rispondere
    if(s > bs){ bs = s; best = {c,r}; }
  }
  return best ? {t:'move', ent:e.id, c:best.c, r:best.r} : null;
}
async function aiBoldStep(e,goal,reach,foes){     // unità bloccata da troppi turni (avanti-e-indietro o ferma): fa un passo verso il punto di tiro anche se non è al sicuro
  const dm = aiDistMap(aiGoalCells(e,goal),!!e.spectreBuff,false,[e.c,e.r],moveOf(e));
  const cur = dm.has(key(e.c,e.r)) ? dm.get(key(e.c,e.r)) : Infinity;
  let best = null, bs = -Infinity, i = 0; const defs = aiDefenders();
  for(const [k] of reach){
    if(++i % 8 === 0) await aiCheck();
    const d = dm.get(k); if(d === undefined || d >= cur) continue;       // solo caselle più vicine al punto di tiro
    const [c,r] = k.split(',').map(Number);
    if(aiApproachCost(e,c,r,defs) >= e.hp) continue;                     // audace sì, suicida no: fermata + colpo ai difensori la ucciderebbero
    const s = -100 * d + aiTerrainBonus(c,r) / 50 + (foes && aiShotFrom(e,c,r,foes) ? 20000 : 0);
    if(s > bs){ bs = s; best = {c,r}; }
  }
  return best ? {t:'move', ent:e.id, c:best.c, r:best.r} : null;
}
async function aiLastStep(e,goal,reach,st,hasBlitz){   // 3) ULTIMA AZIONE (senza bersagli a tiro): al sicuro su terreno vantaggioso
  if(aiBold.has(e.id)){ const b = await aiBoldStep(e,goal,reach,aiEnemies()); if(b) return b; }   // bloccata da troppi turni: si avanza comunque
  const foes = hasBlitz ? aiEnemies() : null, defs = aiDefenders();
  let best = {k:null, s:aiCellScore(e,e.c,e.r,goal,defs)}, i = 0;   // la casella attuale è l'alternativa "restare fermo" (nessuna risposta: non ci si muove)
  for(const [k] of reach){                       // qui anche le caselle già visitate: è l'ultimo passo, si può tornare al sicuro
    if(++i % 8 === 0) await aiCheck();
    const [c,r] = k.split(',').map(Number);
    let s = aiCellScore(e,c,r,goal,defs);
    if(hasBlitz){ const sh = aiShotFrom(e,c,r,foes); if(sh) s += 20000 + sh.s/10; }   // con un Blitz in mano: ci si sposta dove poi si può sparare
    if(s > best.s) best = {k, s, c, r};
  }
  return best.k ? {t:'move', ent:e.id, c:best.c, r:best.r} : null;   // null = la casella attuale è già la migliore
}
async function aiChooseAction(e,st){             // LISTA LINEARE DI PRIORITÀ (vedi intestazione)
  const shot = aiBestShot(e);                                       // 1) sparare
  if(shot) return {t:'attack', ent:e.id, c:shot.c, r:shot.r};
  if(e.isBase) return aiCreateAction(e);                            // 2) la base crea unità
  const goal = aiGlobalTarget(e); if(!goal) return null;
  const reach = reachable(e), hasBlitz = aiSlots('C01').length > 0;
  const spots = aiMineSpots();                                      // 2b) miniera da conquistare lungo la strada (deviazione minima)
  if(spots.size){
    if(spots.has(key(e.c,e.r)) && aiThreat(e.c,e.r) === 0) return null;   // già accanto: resta qui, a fine turno la miniera passa a me
    const mm = aiMineMove(e,goal,reach,st,spots); if(mm) return mm;
  }
  if(e.actions === 1) return await aiLastStep(e,goal,reach,st,hasBlitz);   // 3) ultima azione
  if(rangeOf(e) > 1){ const t = await aiTactical(e,goal,reach,st); if(t) return t; }   // 4)
  const mv = aiProgressMove(e,goal,reach,st);                       // 5) e 6)
  return mv || await aiLastStep(e,goal,reach,st,hasBlitz);          // niente da fare (es. bloccato): l'ultimo passo vale comunque, al sicuro
}

// ================== CREAZIONE DELLE UNITÀ ==================
function aiAllocStats(budget,pi){                // spende fino a "budget" crediti: un punto alla volta, a rotazione, fino ai massimi
  const st = {}; STATS.forEach(s => { st[s.id] = STAT_MIN; });
  const order = AI_STAT_ORDER.filter(id => id in st).concat(STATS.map(s=>s.id).filter(id => !AI_STAT_ORDER.includes(id)));
  let spent = unitCost(st), moved = true;
  while(moved){
    moved = false;
    for(const id of order){
      if(st[id] >= statMax(id,pi) || spent + statCost(id) > budget) continue;
      st[id]++; spent += statCost(id); moved = true;
    }
  }
  return st;
}
const aiAggro = () => (COOP && players[aiMe()].monster) ? COOP_AI_AGGRO : Infinity;      // coop: distanza massima di inseguimento dei mostri
const aiUnitNeed = (p,base) => AI_UNIT_MIN_CREDITS + AI_UNIT_CREDITS_PER_UNIT * ((COOP && p.monster && base) ? coopLairUnits(p,base) : p.units.length);   // crediti richiesti per la prossima unità
function aiCreateAction(base){
  const p = curPlayer(), pi = aiMe();
  if(base.actions < 1 || unitCapReached(p,base) || p.credits < aiUnitNeed(p,base)) return null;
  const free = freeNeighbors(base.c,base.r); if(!free.length) return null;
  const st = aiAllocStats(p.credits,pi);
  if(unitCost(st) > p.credits) return null;
  const goal = aiGlobalTarget(base);                              // si sistema verso il nemico, meglio se su un terreno vantaggioso
  let best = free[0], bs = -Infinity;
  free.forEach(([c,r])=>{ const s = (goal ? -10 * hexDist([c,r],[goal.c,goal.r]) : 0) + aiTerrainBonus(c,r) / 100; if(s > bs){ bs = s; best = [c,r]; } });
  return {t:'createUnit', ent:base.id, c:best[0], r:best[1], stats:st};
}

// ================== CARTE ==================
async function aiBuyCards(){                     // inizio round: sostituisce le carte già usate
  const p = curPlayer();
  // AI_CARD_FIRST_CHANCE: probabilità di ignorare il budget della prossima unità e comprare subito le carte; altrimenti compra solo coi crediti che avanzano
  const keepBudget = Math.random() >= AI_CARD_FIRST_CHANCE, lair = p.bases[0];
  for(let g=0; g<CARDS_PER_PLAYER; g++){
    const used = p.cards.map((_,i)=>i).filter(i => p.usedCards[i]);
    if(!used.length) break;
    const reserve = (keepBudget && lair && !unitCapReached(p,lair)) ? aiUnitNeed(p,lair) : 0;   // (coop: tetto e costo della tana, come in aiCreateAction)
    if(p.credits - NEW_CARD_COST < reserve) break;
    if(!aiSend({t:'newCard', slot:used[0], card:aiPickCard()}).ok) break;
    await aiPause(AI_FAST_MS);
  }
}
// ---- carte contro la difesa nemica: un colpo a cui il difensore non può rispondere ----
async function aiShotAnywhere(v,reach,foes){     // v (anche virtuale, con carta) ha un colpo accettabile da qui o da una casella raggiungibile?
  if(aiShotFrom(v,v.c,v.r,foes,true)) return true;
  let i = 0;
  for(const [k] of reach){
    if(++i % 8 === 0) await aiCheck();
    const [c,r] = k.split(',').map(Number);
    if(aiShotFrom(v,c,r,foes)) return true;
  }
  return false;
}
async function aiRangeBreaker(extra,ok,perm){    // unità che con +extra di gittata (MediBuff, Upgrade) ottiene un colpo che ora non ha: fuori dalla gittata del difensore (perm = bonus permanente: basta che renda possibile superare il difensore più vicino)
  const foes = aiEnemies(); if(!foes.some(d => d.defending)) return null;
  for(const u of [...curPlayer().units].filter(u => u.actions > 0 && (!ok || ok(u))).sort((a,b) => aiPower(b) - aiPower(a))){
    const reach = reachable(u);
    if(await aiShotAnywhere(u,reach,foes)) continue;                       // ha già un colpo: la carta non serve a questo
    if(await aiShotAnywhere({...u, st:{...u.st, gittata:u.st.gittata + extra}},reach,foes)) return u;
    const g = perm ? aiGlobalTarget(u) : null;                              // Upgrade: il difensore più vicino ha la nostra stessa gittata e con +extra lo si supera
    if(g && g.defending && rangeOf(u) <= rangeOf(g) && rangeOf(u) + extra > rangeOf(g)) return u;
  }
  return null;
}
async function aiSplashDefender(e){              // Esplosivo: si spara a una casella ACCANTO al difensore da una casella fuori dalle sue linee: l'esplosione lo colpisce (colpo ×2, intorno la metà = il tuo attacco) e lui non può rispondere
  const slot = aiSlots('C05')[0]; if(slot === undefined || e.demoBuff || e.actions < 1) return false;
  const all = aiEnemies(), defs = all.filter(d => d.defending); if(!defs.length) return false;
  const atk = attackOf(e);
  const answers = (d,c,r) => canReact(d,{c,r,revealed:!!e.revealed});         // d potrebbe rispondere a chi sta in (c,r)?
  const dmgTo = (v,mult) => v.shielded ? 0 : Math.max(MIN_DAMAGE, atk * mult - reductionOf(v));
  const cells = [[e.c,e.r], ...(e.actions >= 2 ? [...reachable(e).keys()].map(k => k.split(',').map(Number)) : [])];   // da dove sparare: qui, o dopo uno spostamento
  let best = null, n = 0;
  for(const [c,r] of cells){
    if(++n % 6 === 0) await aiCheck();
    const stay = c === e.c && r === e.r;
    if(!stay && aiReact(e,c,r,defs) > 0) continue;                           // spostandosi non deve finire a tiro di nessun difensore
    for(const h of firingLines({...e, c, r}).hits){
      const ring = neighbors(h.c,h.r);
      if(ring.some(([x,y]) => (x === c && y === r) || allyAt(x,y))) continue;   // fuoco amico (o su se stessi): no
      const direct = enemyAt(h.c,h.r);
      const hit = [...(direct && !rockAt(h.c,h.r) && !structCover(direct) ? [[direct,2]] : []), ...ring.map(([x,y]) => [entityHere(x,y),1]).filter(([v]) => v && all.includes(v) && !rockAt(v.c,v.r) && !structCover(v))];   // chi viene colpito e con che moltiplicatore
      const guards = hit.filter(([v]) => v.defending);
      if(!guards.length || guards.some(([v]) => answers(v,c,r))) continue;    // serve almeno un difensore colpito, e nessuno che possa rispondere
      let gain = 0, kill = false, top = 0;
      hit.forEach(([v,m]) => { const d = dmgTo(v,m); gain += v.isStruct ? d : d * 2; if(d >= v.hp) kill = true; if(v.defending) top = Math.max(top,d); });
      if(!(top >= 2 || kill)) continue;                                      // non vale una carta
      const sc = gain + (kill ? 1000 : 0) - (stay ? 0 : 1);
      if(!best || sc > best.sc) best = {sc, c, r, x:h.c, y:h.r, stay};
    }
  }
  if(!best) return false;
  if(!best.stay){ if(!aiSend({t:'move', ent:e.id, c:best.c, r:best.r}).ok) return false; await aiPause(AI_STEP_MS); }
  const u = findEnt(e.id); if(!u) return false;
  if(!aiSend({t:'useCard', ent:u.id, slot}).ok) return true;
  await aiPause(AI_CARD_MS);
  if(aiSend({t:'attack', ent:u.id, c:best.x, r:best.y}).ok){ aiDidShoot = true; await aiPause(800); }
  return true;
}
const aiPower = e => attackOf(e)*50 + rangeOf(e)*20 + maxHp(e)*10;
async function aiPlayBuffs(){                    // carte permanenti, usate subito sull'agente migliore
  const p = curPlayer();
  const use = async (slot,e) => { if(e && aiSend({t:'useCard', ent:e.id, slot}).ok) await aiPause(AI_CARD_MS); };
  for(const slot of aiSlots('C06')) await use(slot, [...p.units].filter(u=>!u.spectreBuff).sort((a,b)=>aiPower(b)-aiPower(a))[0]);   // Spettro: non per la base
  for(const slot of aiSlots('C07')) await use(slot, [...(p.units.length ? p.units : p.bases)].sort((a,b)=>(a.shielded||0)-(b.shielded||0) || aiPower(b)-aiPower(a))[0]);   // Scudo
  for(const slot of aiSlots('C10')){                                                          // Upgrade: +1 vita se è quasi morto, altrimenti +1 attacco
    const pool = p.units.length ? p.units : p.bases;
    let e = [...pool].sort((a,b)=> (b.hp/maxHp(b))*(attackOf(b)*30+rangeOf(b)*10+moveOf(b)*5) - (a.hp/maxHp(a))*(attackOf(a)*30+rangeOf(a)*10+moveOf(a)*5))[0];
    const br = await aiRangeBreaker(1,null,true);                                       // un difensore nemico ci blocca? +1 gittata a chi così ottiene un colpo senza risposta
    if(br) e = br;
    if(!e) continue;
    const alloc = {vita:0, passi:0, gittata:0, attacco:0}; alloc[br ? 'gittata' : (e.hp <= 2 ? 'vita' : 'attacco')] = 1;
    if(aiSend({t:'upgrade', ent:e.id, slot, alloc}).ok) await aiPause(AI_CARD_MS);
  }
  for(const slot of aiSlots('C09')){                                                          // MediBuff: il più ferito, altrimenti il più forte (la base solo se sotto AI_MEDIKIT_BASE_HP vita)
    const e = (await aiRangeBreaker(1, a => !a.medikitBuff)) || [...p.units, ...p.bases.filter(b => b.hp < AI_MEDIKIT_BASE_HP)].filter(a=>!a.medikitBuff).sort((a,b)=> a.hp/maxHp(a) - b.hp/maxHp(b) || aiPower(b)-aiPower(a))[0];   // prima chi con +1 gittata aggira un difensore
    await use(slot,e);
  }
}
function aiEmpOpensShot(e){           // l'EMP (toglie la nebbia entro EMP_RANGE da e e rivela chi vi sta dentro) renderebbe possibile da qui un colpo oggi impedito dalla nebbia?
  const foes = aiEnemies().filter(u => hexDist([e.c,e.r],[u.c,u.r]) <= EMP_RANGE).map(u => ({...u, revealed:true}));   // copie "rivelate": gli originali non si toccano
  if(!foes.length) return false;
  const added = [];
  try{
    allHexes().forEach(([c,r]) => { const k = key(c,r); if(hexDist([e.c,e.r],[c,r]) <= EMP_RANGE && !empCells.has(k)){ empCells.set(k,aiMe()); added.push(k); } });   // zona EMP simulata...
    return !!aiShotFrom(e,e.c,e.r,foes,true);
  } finally { added.forEach(k => empCells.delete(k)); }                  // ...e subito tolta: lo stato di gioco resta identico
}
async function aiContextCards(e){                // carte che dipendono dalla situazione dell'agente che sta per agire; true = ne ha giocata una
  if(e.actions < 1) return false;
  const emp = aiSlots('C04')[0];                                    
  if(emp !== undefined){
    let targets = 0, hasShield = false;
    players.forEach((p,i)=>{ 
      if(i === aiMe() || p.surrendered) return; 
      p.units.forEach(u=>{ 
        if(hexDist([e.c,e.r],[u.c,u.r]) <= EMP_RANGE){
          targets++;
          if(u.shielded) hasShield = true;
        } 
      }); 
    });
    // Lancia l'EMP se c'è almeno un'unità con scudo, OPPURE se ci sono almeno 2 unità normali, OPPURE se (senza colpi disponibili) toglie la nebbia che oggi impedisce un tiro
    if((hasShield || targets >= 2 || (!aiBestShot(e) && aiEmpOpensShot(e))) && aiSend({t:'useCard', ent:e.id, slot:emp}).ok){ 
      await aiPause(AI_CARD_MS); 
      return true; 
    }
  }
  if(await aiSplashDefender(e)) return true;                         // Esplosivo accanto a un difensore, fuori dalle sue linee di tiro
  const shot = aiBestShot(e);
  const snp = aiSlots('C03')[0];                                    
  if(snp !== undefined && !shot && !e.sniperBuff){
    const v = {...e, st:{...e.st, gittata:e.st.gittata*2}, sniperBuff:true, pierceCount:1};
    if(sniperLines(v).hits.some(h => { const t = enemyAt(h.c,h.r); return t && aiScoreTarget(e,t,aiDmg(e,t)) >= 0 && aiReactPlan(v,e.c,e.r,t,true,[]) >= 0; })   // il Cecchino (gittata doppia) può colpire da fuori della gittata di un difensore
       && aiSend({t:'useCard', ent:e.id, slot:snp}).ok){ await aiPause(AI_CARD_MS); return true; }
  }
  const exp = aiSlots('C05')[0];                                    
  // FIX: Verifichiamo che shot.t esista. Se il bersaglio è una roccia, t è null, quindi evitiamo il crash di sistema!
  if(exp !== undefined && shot && shot.t && !e.demoBuff && hexDist([e.c,e.r],[shot.c,shot.r]) > 1){
    const near = neighbors(shot.c,shot.r);
    if(!near.some(([x,y]) => allyAt(x,y))){
      const dbl = Math.max(MIN_DAMAGE, attackOf(e)*2 - reductionOf(shot.t));
      if(((!shot.kill && aiKills(dbl,shot.t)) || near.some(([x,y]) => enemyAt(x,y))) && aiSend({t:'useCard', ent:e.id, slot:exp}).ok){ await aiPause(AI_CARD_MS); return true; }
    }
  }
  return false;
}
async function aiTryBlitz(e){                    // a 0 azioni, ma con un bersaglio a tiro: Blitz = +1 azione per sparare
  const s = aiSlots('C01'); if(!s.length || !aiBestShot(e)) return false;
  const res = aiSend({t:'useCard', ent:e.id, slot:s[0]});
  if(res.ok) await aiPause(AI_CARD_MS);
  return res.ok;
}
async function aiAirdropPhase(){                 // combo Airdrop + Blitz (uccisione sicura) oppure avvicinamento sicuro
  const p = curPlayer();
  if(Math.floor(step / NUM_PLAYERS) + 1 < AI_AIRDROP_MIN_ROUND) return;
  const drop = aiSlots('C02'), blitz = aiSlots('C01');
  const units = p.units.filter(u => u.actions >= AIRDROP_COST);
  if(!drop.length || !units.length) return;
  const cells = airdropTargets(), foes = aiEnemies();
  const defended = (c,r) => foes.some(d => d.defending && canReact(d,{c,r,revealed:false}));   // difensori e bunker sparerebbero per primi
  const nearFoes = (c,r,R) => foes.filter(t => !t.isBase && !t.isStruct && hexDist([c,r],[t.c,t.r]) <= R).length;
  let best = null, n = 0;
  for(const u of units){
    const goal = aiGlobalTarget(u), cur = goal ? hexDist([u.c,u.r],[goal.c,goal.r]) : 0, minGain = 3*moveOf(u) + 2;
    for(const [c,r] of cells){
      if(++n % 40 === 0) await aiCheck();
      if(nearFoes(c,r,rangeOf(u)) > 1) continue;                                           // non farsi circondare
      let s = null;
      if(blitz.length){                                                                    // combo: atterra, Blitz, spara e uccide
        const sh = aiShotFrom(u,c,r,foes);
        if(sh && sh.kill && !defended(c,r)) s = (sh.t.isBase ? 1000 : 5000) + hexDist([c,r],[sh.t.c,sh.t.r]) * 10;
      } else if(goal){                                                                     // senza Blitz: solo avvicinamento in una casella sicura
        const gain = cur - hexDist([c,r],[goal.c,goal.r]);
        if(gain >= minGain && aiThreat(c,r) === 0 && !defended(c,r)) s = gain * 100 + aiTerrainBonus(c,r);
      }
      if(s !== null && (!best || s > best.s)) best = {s, u, c, r};
    }
  }
  if(!best) return;
  if(!aiSend({t:'airdrop', ent:best.u.id, slot:drop[0], c:best.c, r:best.r}).ok) return;
  await aiPause(AI_CARD_MS);
  if(blitz.length){
    const u = findEnt(best.u.id);
    if(u && aiSend({t:'useCard', ent:u.id, slot:blitz[0]}).ok){
      await aiPause(AI_FAST_MS);
      const sh = aiBestShot(u);
      if(sh){ aiSend({t:'attack', ent:u.id, c:sh.c, r:sh.r}); await aiPause(AI_STEP_MS); }
    }
  }
}
async function aiFortino(){                      // a fine turno: barricate attorno al nemico più vicino (fino a FORTINO_BUILDS)
  const slot = aiSlots('C08')[0]; if(slot === undefined) return;
  const p = curPlayer(), mine = [...p.bases, ...p.units], actor = mine[0]; if(!actor) return;
  let tgt = null, bd = Infinity;
  players.forEach((q,i)=>{ if(i === aiMe() || q.surrendered) return; q.units.forEach(u=>{ const d = Math.min(...mine.map(m=>hexDist([m.c,m.r],[u.c,u.r]))); if(d < bd){ bd = d; tgt = u; } }); });
  if(!tgt || bd > AI_FORTINO_MAX_DIST) return;
  const ok = new Set(fortinoTargets().map(([c,r])=>key(c,r)));
  const cells = neighbors(tgt.c,tgt.r).filter(([c,r])=>ok.has(key(c,r))).slice(0,FORTINO_BUILDS);
  if(cells.length < 2) return;
  for(let i=0;i<cells.length;i++){
    await aiCheck();
    const a = {t:'fortino', ent:actor.id, c:cells[i][0], r:cells[i][1]}; if(i === 0) a.slot = slot;
    if(!aiSend(a).ok) break;
    await aiPause(AI_FAST_MS);
  }
  aiSend({t:'cancelFortino', ent:actor.id});     // se restano barricate non costruite
}

// ================== TURNO DI GIOCO ==================
function aiNoteTurn(e){                          // memoria tra un turno e l'altro: se l'unità sta girando a vuoto passa alla modalità "avanza"
  if(e.isBase) return;
  const h = aiTrail.get(e.id) || []; h.push(key(e.c,e.r)); if(h.length > 6) h.shift(); aiTrail.set(e.id,h);
  const n = k => new Set(h.slice(-k)).size;
  if((h.length >= AI_STUCK_TURNS && n(AI_STUCK_TURNS) <= 2) || (h.length >= 6 && n(6) <= 3)) aiBold.add(e.id);
  if((aiDefWait.get(e.id) || 0) >= AI_DEF_PATIENCE) aiBold.add(e.id);     // bloccata da un difensore per troppi turni: ora accetta le risposte che non la uccidono
}
async function aiPlayAgent(id){                  // tutte le azioni di un agente
  const st = {visited:new Set(), fails:0};
  aiDefBlocked = false; aiDidShoot = false;
  try{ await aiPlayAgentInner(id,st); } finally {
    aiBlunder = false;
    aiDone.add(id);
    if(aiDefBlocked && !aiDidShoot) aiDefWait.set(id,(aiDefWait.get(id) || 0) + 1); else aiDefWait.delete(id);   // un difensore l'ha bloccata e non ha sparato: un altro turno di attesa
  }
}
async function aiPlayAgentInner(id,st){
  aiCurId = id;
  aiBlunder = curPlayer().units.some(u => u.id !== id) && Math.random() < AI_DEF_BLUNDER_CHANCE;   // una volta per unità e per turno; sbaglia solo se l'AI ha ALTRE unità in gioco (l'ultima non sbaglia mai)
  { const e0 = findEnt(id); if(e0) aiNoteTurn(e0); }
  for(let g=0; g<40; g++){
    await aiCheck();
    let e = findEnt(id); if(!e || aiOverBudget()) return;
    if(e.actions <= 0){ if(await aiTryBlitz(e)) continue; return; }
    if(await aiContextCards(e)){ e = findEnt(id); if(!e) return; if(e.actions <= 0) continue; }   // la carta (es. Esplosivo contro un difensore) può aver speso le azioni: si torna all'inizio del ciclo
    const act = await aiChooseAction(e,st);
    if(!act) return;
    const from = key(e.c,e.r);
    const res = aiSend(act);
    if(!res.ok){ if(++st.fails >= 2) return; continue; }
    if(act.t === 'move') st.visited.add(from);
    if(act.t === 'attack'){ aiBold.delete(id); aiDefWait.delete(id); aiDidShoot = true; }      // ha sparato: non è più bloccata
    
    // Delay maggiore (800ms) se l'AI attacca o distrugge qualcosa, per far vedere al giocatore l'animazione
    const delay = act.t === 'attack' ? 800 : (act.t === 'move' ? AI_STEP_MS : AI_FAST_MS);
    await aiPause(delay);
  }
}
async function aiPlayTurn(){
  aiDone.clear(); aiNoSiege.clear();              // nuovo turno: nessuno ha ancora giocato
  await aiBuyCards();                            // 1) acquisto carte
  await aiPlayBuffs();                           // 2) carte permanenti e combo Airdrop
  await aiAirdropPhase();
  const p = curPlayer();
  const order = [...p.bases, ...p.units].map(e => ({id:e.id, hp:e.hp, shoot:aiBestShot(e) ? 1 : 0}))
    .sort((a,b) => b.hp - a.hp || b.shoot - a.shoot || a.id - b.id);        // 3) prima l'agente con più vita
  for(const o of order){ await aiPlayAgent(o.id); await aiPause(0); }
  await aiFortino();                             // 4) Fortino e fine turno
  await aiPause(AI_FAST_MS);
  aiSend({t:'endTurn'});
}

// ================== PRIMA DELLA PARTITA ==================
function aiSetupMove(){                          // un'unica scelta del bot nelle fasi colore / tessera / base / carte
  const p = curPlayer();
  if(phase === 'colors'){
    const free = PALETTE.filter(c => !players.some(q => q.color === c.color));
    return {t:'chooseColor', color:free[aiRnd(free.length)].color};
  }
  if(phase === 'tiles') return {t:'placeTile', cand:aiRnd(cands.length), rot:aiRnd(4)};
  if(phase === 'base'){                          // angolo più lontano dalle basi già piazzate; dentro l'angolo, molti esagoni liberi e risorse vicine
    const others = players.flatMap(q => q.bases), cornerMid = new Map();
    corners.forEach(o => { if(takenCorners.includes(o.id)) return; const m = o.hexes[o.hexes.length >> 1]; o.hexes.forEach(([c,r]) => cornerMid.set(key(c,r), m)); });
    let best = null, bs = -Infinity;
    [...baseHexes()].map(k=>k.split(',').map(Number)).forEach(([c,r])=>{
      const m = cornerMid.get(key(c,r)) || [c,r], far = others.length ? Math.min(...others.map(b => hexDist([b.c,b.r], m))) : 0;
      const s = far * AI_BASE_FAR_WEIGHT + freeNeighbors(c,r).length * 2 + hexesWithin(c,r,4).filter(([x,y])=>terr(x,y) === 'risorse').length * 3 + Math.random();
      if(s > bs){ bs = s; best = {t:'placeBase', c, r}; }
    });
    return best;
  }
  if(phase === 'cards'){                         // 3 carte diverse, a caso con i pesi
    const cards = []; let guard = 0;
    while(cards.length < CARDS_PER_PLAYER && guard++ < 200){ const c = aiPickCard(); if(!cards.includes(c)) cards.push(c); }
    return {t:'confirmCards', cards};
  }
  return null;
}
async function aiSetup(){
  await aiPause(AI_PHASE_MS);
  const a = aiSetupMove(); if(a) aiSend(a);
}

// ================== MOTORE: controlla se tocca a un bot e lo fa giocare ==================
function aiRecover(){                            // dopo un errore imprevisto: non bloccare la partita
  if(!aiValid()) return;
  try{
    if(phase === 'play') aiSend({t:'endTurn'});
    else if(phase === 'colors') aiSend({t:'chooseColor', color:PALETTE.find(c => !players.some(q => q.color === c.color)).color});
    else if(phase === 'tiles') aiSend({t:'placeTile', cand:0, rot:0});
    else if(phase === 'base') aiSend({t:'placeBase', c:[...baseHexes()][0].split(',').map(Number)[0], r:[...baseHexes()][0].split(',').map(Number)[1]});
    else if(phase === 'cards') aiSend({t:'confirmCards', cards:[]});
  }catch(e){ console.error('[AI] recupero fallito:', e); }
}
async function aiStep(){                         // un passo di lavoro: una scelta di setup oppure un intero turno di gioco
  if(!players || phase === 'over' || !isBotTurn()) return false;
  if(aiMemPlayers !== players){ aiMemPlayers = players; aiTrail.clear(); aiBold.clear(); aiDone.clear(); aiNoSiege.clear(); aiDefWait.clear(); }   // nuova partita: la memoria dell'AI riparte da zero (gli id delle unità ricominciano da 1)
  aiRun = {players, step, phase, t0:Date.now(), actions:0}; aiFogAct = false;
  try{
    if(phase === 'play') await aiPlayTurn(); else await aiSetup();
    aiFailStreak = 0;
  }catch(err){
    if(err !== AI_ABORT){
      console.error('[AI] errore:', err);
      aiFailStreak++; aiNextTry = Date.now() + Math.min(5000, 400 * aiFailStreak);
      aiRecover();
    }
  }
  return true;
}
function aiPoll(){
  if(aiBusy || Date.now() < aiNextTry) return;
  if(typeof online !== 'undefined' && online && (!isHost || !(room && room.started))) return;   // online: i bot girano solo sull'host, a partita iniziata
  if(typeof lobbyOpen === 'function' && lobbyOpen()) return;
  if(!players || phase === 'over' || !isBotTurn()) return;
  aiBusy = true;
  aiStep().catch(e => console.error('[AI]', e)).then(() => { aiBusy = false; });
}
setInterval(aiPoll, AI_POLL_MS);

// ================== VANTAGGIO INIZIALE: abilità a caso ==================
// drules.js (giveBotStart) mette le unità e le miniere iniziali dei bot (BOT_START_UNITS, BOT_START_MINES) con abilità fisse.
// Qui si lascia fare tutto a lui e poi si tirano a caso le abilità di ogni unità tra il minimo e il massimo, gratis.
if(typeof giveBotStart === 'function'){
  const aiOrigGiveBotStart = giveBotStart;
  giveBotStart = function(pi){
    aiOrigGiveBotStart(pi);
    const p = players[pi];
    if(!AI_START_RANDOM_STATS || !BOT_BONUS || !p || !p.bot) return;
    p.units.forEach(u => {
      const st = {}; STATS.forEach(s => { const mx = Math.min(AI_START_STAT_MAX, statMax(s.id,pi)); st[s.id] = STAT_MIN + aiRnd(mx - STAT_MIN + 1); });
      u.st = st; u.hp = st.vita;
    });
  };
}
