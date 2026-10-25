/* ============================================================
   dcoop.js — MODALITÀ COOPERATIVA di DawnlorD ("coop")
   ============================================================
   Tutti i giocatori umani sono alleati contro un unico giocatore-computer, i "Mostri" (una sola fazione,
   scelta a caso, con più basi). La modalità "war" (quella di prima) non cambia: quando COOP è null il
   gioco si comporta esattamente come prima.

   CARICAMENTO: subito dopo drules.js (prima di dai.js).

   COSA C'È QUI DENTRO
     - configurazione (costanti in cima: cambiale a piacere)
     - generazione della mappa cooperativa (6 tessere già pronte, basi, base finale, sopravvissuto, drone)
     - nebbia di guerra (visibilità condivisa tra alleati, caselle esplorate)
     - boss e scorta (appaiono quando la base finale viene scoperta)
     - quest (6 per partita: 1 di fazione per ogni fazione presente + generiche; le quest di fazione sono in dquests.js) e scudo infinito
       della base finale (cade con i boss abbattuti E con 4 quest su 6 completate)
     - "ganci" (wrapper) che si installano da soli alla prima partita (vedi coopInstallHooks): servono alle quest nuove e
       permettono di NON toccare drules.js, dai.js e gli altri file
     - interfaccia: selettore modalità nella lobby, pannello quest, segni sulla mappa
   Le regole di base (danni, turni...) restano in drules.js, che chiama le funzioni "coopXxx" di questo file
   solo quando COOP non è null.

   STATO: la variabile COOP (definita in drules.js, salvata in snapshot()/restore()):
     {mon, lairs, built, W, H, corner, expl[], nExpl, finalId, bossSpawned, finalDead, center[], quests[], st{}, survivor, drone,
      mono[], sos, hostage, traps[]}   (gli ultimi 4 solo per le quest nuove)
   ============================================================ */

// ================== CONFIGURAZIONE ==================
const COOP_CFG = {mode:'war', lairs:2};   // scelta della lobby: mode 'war' | 'coop'; lairs = basi di mostri (il selettore "Bot")
const COOP_W = 3*TILE, COOP_H = 2*TILE;   // la mappa cooperativa è sempre 3x2 tessere (36x24 esagoni): quella a 6 giocatori
const COOP_MAX_LAIRS = 9;                 // massimo di basi di mostri (oltre alla base finale)
const COOP_LAIR_MIN_DIST = 10;            // distanza minima delle basi di mostri dalle basi dei giocatori
const COOP_LAIR_SPACING = 6;              // distanza minima tra due basi nemiche (anche dalla base finale)
const COOP_BOSS_STATS = {vita:25, passi:4, gittata:8, attacco:6};   // le unità "boss"
const COOP_BOSS_ESCORT = 3;               // unità di scorta per ogni boss (stesse abilità iniziali dei bot in modalità war)
const COOP_BOSS_RING = 5;                 // raggio massimo intorno alla base finale dove si piazzano boss e scorta
const COOP_BASE_MINES = 3;                // miniere con cui parte ogni base nemica (anche la finale), sulle risorse più vicine (come BOT_START_MINES in war)
const COOP_QUESTS_COUNT = 6;              // quest estratte a inizio partita (come il massimo di giocatori)
const COOP_QUESTS_NEEDED = 4;             // quest da risolvere (su COOP_QUESTS_COUNT) perché lo scudo infinito della base finale possa cadere (serve anche aver abbattuto i boss)
const COOP_FACTION_PLAYERS_MAX = 6;       // con più giocatori umani di così, le quest di fazione si pescano solo per questo numero di giocatori scelti a caso (con 6 giocatori ogni fazione ha la sua quest)
const COOP_EXPLORE_TARGET = 300;          // quest "Esplora 300 celle"
const COOP_MINES_TARGET = 8;              // quest "Controlla 8 miniere" (il testo originale diceva anche "3 Punti di Controllo": cambia qui il numero)
const COOP_KILLS_TARGET = 15, COOP_BIG_TARGET = 5, COOP_BIG_HP = 4, COOP_FORTS_TARGET = 3, COOP_ONE_TURN_KILLS = 4, COOP_TOWER_KILLS = 3, COOP_DRONE_TURNS = 2;
const COOP_VISION_MIN = 1;                // raggio minimo di visuale di un'unità o base (la visuale è la sua gittata)
const COOP_LAIR_MAX_UNITS = 4;            // unità vive create da ciascuna base di mostri (compresa la base finale)
const COOP_AI_AGGRO = Infinity;           // i mostri inseguono solo chi è entro questa distanza (Infinity = inseguono sempre da tutta la mappa)
const COOP_SHOW_REMEMBERED_BASES = true;  // true = le basi nemiche già scoperte restano visibili anche sotto il velo (le unità mai)
const COOP_FOG_VEIL = 'rgba(0,0,0,0.5)';  // velo sulle caselle già esplorate ma ora fuori visuale
const COOP_FOG_DELAY_MS = 1200;           // dopo la distruzione di un'unità o base del giocatore, la sua visuale resta ancora per questi ms (si vedono sparo, esplosione, sfx)
const COOP_SURVIVOR_EMOJI = '🧍', COOP_DRONE_EMOJI = '🛸';

// ---------- costanti delle quest nuove (cambiale a piacere) ----------
const COOP_DEBUG_QUESTS = null;           // PER PROVARE: lista di quest da usare al posto del sorteggio, es. ['golem','sos','hostage','trap'] (null = sorteggio normale)
const COOP_MAX_RISKY = 2;                 // quest che possono FALLIRE (sopravvissuto, SOS, ostaggio): al massimo tante per partita, così 4 su 6 restano sempre possibili (il massimo sicuro sarebbe COOP_QUESTS_COUNT - COOP_QUESTS_NEEDED = 2)
const COOP_GOLEM_STATS = {vita:12, passi:1, gittata:3, attacco:3};   // il Golem di pietra (non si muove mai); immune a tutto tranne Demolizione, colpo Esplosivo e nucleare
const COOP_GOLEM_MIN_DIST = 10;           // distanza minima del golem dalle basi dei giocatori
const COOP_MONO_COUNT = 3, COOP_MONO_MIN_DIST = 8, COOP_MONO_SPACING = 8;   // monoliti: quanti, distanza minima dalle basi dei giocatori e tra di loro
const COOP_SOS_TURNS = 8;                 // turni (giri completi) per rispondere all'SOS
const COOP_SOS_MIN_DIST = 10, COOP_SOS_MAX_DIST = 20;   // l'SOS compare a questa distanza dalla base giocatori più vicina
const COOP_HOSTAGE_TURNS = 9;             // turni per distruggere la base con l'ostaggio, contati da quando la base viene scoperta
const COOP_VETERAN = {vita:5, passi:3, gittata:4, attacco:3};   // il veterano che si libera (SOS, ostaggio)
const COOP_HANGARS_TARGET = 3, COOP_HANGAR_DIST = 12;           // quest "Trasporti aerei"
const COOP_MUD_TARGET = 9;                // quest "Terraforming": caselle di fango da demolire
const COOP_SNIPE_DIST = 8;                // quest "Cecchinaggio estremo": distanza minima del colpo
const COOP_CROSSFIRE_UNITS = 3;           // quest "Fuoco incrociato": unità diverse nello stesso round
const COOP_REACT_TARGET = 4;              // quest "Impenetrabile": mostri uccisi dal fuoco di Difesa o dei Bunker
const COOP_MONO_EMOJI = '🔮', COOP_SOS_EMOJI = '🚨', COOP_GOLEM_EMOJI = '🗿', COOP_TRAP_EMOJI = '🕳️', COOP_HOSTAGE_EMOJI = '🔒', COOP_VETERAN_EMOJI = '🎖️';

// ================== QUEST ==================
// val() = [valore attuale, obiettivo]; reward = crediti a testa per ogni giocatore umano. Il progresso è condiviso tra alleati.
const COOP_QUESTS = {
  kill_monsters:   {e:'👹', name:()=>`Elimina ${COOP_KILLS_TARGET} mostri`,                reward:10, val:()=>[COOP.st.killMon, COOP_KILLS_TARGET]},
  explore_cells:   {e:'🧭', name:()=>`Esplora ${COOP_EXPLORE_TARGET} celle`,               reward:8,  val:()=>[COOP.nExpl, COOP_EXPLORE_TARGET]},
  reach_center:    {e:'🎯', name:()=>'Raggiungi il centro della mappa',                    reward:8,  val:()=>[COOP.st.center ? 1 : 0, 1]},
  kill_lair:       {e:'🏚️', name:()=>`Distruggi ${COOP.lairs} base/i di mostri`,           reward:20, val:()=>[COOP.st.killLair, COOP.lairs]},
  kill_big:        {e:'💀', name:()=>`Elimina ${COOP_BIG_TARGET} mostri elite (${COOP_BIG_HP}+ HP)`, reward:15, val:()=>[COOP.st.killBig, COOP_BIG_TARGET]},
  build_forts:     {e:'🏰', name:()=>`Crea ${COOP_FORTS_TARGET} fortezze`,                  reward:10, val:()=>[COOP.st.forts, COOP_FORTS_TARGET]},
  kill_4_one_turn: {e:'⚡', name:()=>`Uccidi ${COOP_ONE_TURN_KILLS} mostri in un turno con un solo agente`, reward:20, val:()=>[COOP.st.maxKillsTurn, COOP_ONE_TURN_KILLS]},
  bunker_tower:    {e:'🌑', name:()=>`Torre difensiva: un bunker uccide ${COOP_TOWER_KILLS} nemici`, reward:12, val:()=>[COOP.st.bunkerKills, COOP_TOWER_KILLS]},
  hold_mines:      {e:'⛏️', name:()=>`Controlla ${COOP_MINES_TARGET} miniere insieme`,       reward:15, val:()=>[coopMinesNow(), COOP_MINES_TARGET]},
  explore_corners: {e:'🗺️', name:()=>'Esplora i 4 angoli della mappa',                    reward:15, val:()=>[coopCornersSeen(), 4]},
  rescue_survivor: {e:'🆘', name:()=>'Salva il sopravvissuto (scortalo a una base)',       reward:25, val:()=>[COOP.st.rescued ? 1 : 0, 1], risk:true,
                    txt:()=>COOP.st.rescued ? '1/1' : (COOP.survivor && COOP.survivor.taken ? 'in scorta' : 'da trovare'),
                    setup:(C,x)=>{ const s = x.freeSpot(10,4); if(!s) return false; C.survivor = {c:s.c,r:s.r,taken:false}; return true; }},
  recover_data:    {e:'🛸', name:()=>`Analizza il drone (${COOP_DRONE_TURNS} turni accanto, senza danni)`, reward:15, val:()=>[COOP.st.droneBest, COOP_DRONE_TURNS],
                    setup:(C,x)=>{ const d = x.freeSpot(10,4,C.survivor ? [C.survivor] : null); if(!d) return false; C.drone = {c:d.c,r:d.r}; return true; }},
  infect_lair:     {e:'🦠', name:()=>'Inietta il virus in una base nemica',               reward:10, val:()=>[COOP.st.infected ? 1 : 0, 1]},
  tame_monster:    {e:'🐾', name:()=>'Addomestica un mostro (curandolo)',                 reward:10, val:()=>[COOP.st.tamed ? 1 : 0, 1]},

  // ---------- QUEST NUOVE ----------
  // setup(C,x) = prepara oggetti o mostri sulla mappa (false = impossibile: la quest viene scartata e se ne pesca un'altra) · avail(C) = la quest ha senso in questa partita
  // risk:true = può FALLIRE (al massimo COOP_MAX_RISKY a partita)
  golem:           {e:'🗿', name:()=>'Abbatti il Golem di pietra (solo Demolizione, colpo Esplosivo o nucleare)', reward:25, val:()=>[COOP.st.golemDead ? 1 : 0, 1],
                    txt:()=>COOP.st.golemDead ? '1/1' : (coopGolemSeen() ? 'avvistato' : 'da trovare'),
                    setup:(C,x)=>coopSetupGolem(C,x)},
  monoliths:       {e:'🔮', name:()=>`Attiva i ${COOP_MONO_COUNT} monoliti insieme (un'unità accanto a ciascuno)`, reward:20, val:()=>[Math.max(COOP.st.monoBest||0, coopMonoActive()), COOP_MONO_COUNT],
                    txt:()=>`${coopMonoActive()}/${COOP_MONO_COUNT} attivi ora`,
                    setup:(C,x)=>coopSetupMonoliths(C,x)},
  sos:             {e:'🚨', name:()=>`Rispondi all'SOS entro ${COOP_SOS_TURNS} turni (un veterano si unisce a te)`, reward:20, val:()=>[COOP.st.sosDone ? 1 : 0, 1], risk:true,
                    txt:()=>COOP.st.sosDone ? '1/1' : `${coopSosLeft()} turni`,
                    setup:(C,x)=>{ const f = x.freeSpot(COOP_SOS_MIN_DIST,5,null,5,COOP_SOS_MAX_DIST); if(!f) return false; C.sos = {c:f.c,r:f.r,until:COOP_SOS_TURNS,gone:false}; return true; }},
  hostage:         {e:'🔒', name:()=>`Libera l'ostaggio: distruggi la base 🔒 entro ${COOP_HOSTAGE_TURNS} turni dalla scoperta`, reward:25, val:()=>[COOP.st.hostageFreed ? 1 : 0, 1], risk:true,
                    txt:()=>COOP.st.hostageFreed ? '1/1' : (COOP.hostage && COOP.hostage.found!=null ? `${coopHostageLeft()} turni` : 'base da trovare'),
                    avail:C=>players[C.mon].bases.some(b=>!b.finalBase),
                    setup:(C,x)=>{ const l = players[C.mon].bases.filter(b=>!b.finalBase); if(!l.length) return false; const b = l[coopRnd(l.length)]; b.hostage = true; C.hostage = {id:b.id,found:null,until:null}; return true; }},
  knight:          {e:'🗡️', name:()=>`Cavaliere solitario: un'unità mai usata con carte o cure uccide da sola un mostro elite (${COOP_BIG_HP}+ HP) mai ferito da altri`, reward:20, val:()=>[COOP.st.knight ? 1 : 0, 1]},
  hangars:         {e:'🛩️', name:()=>`Trasporti aerei: ${COOP_HANGARS_TARGET} Hangar ad almeno ${COOP_HANGAR_DIST} caselle l'uno dall'altro`, reward:15, val:()=>[coopHangarBest(), COOP_HANGARS_TARGET]},
  terraform:       {e:'🟤', name:()=>`Terraforming: demolisci ${COOP_MUD_TARGET} caselle di fango`, reward:10, val:()=>[COOP.st.mud||0, COOP_MUD_TARGET],
                    avail:C=>coopCountTerr('fango')>=COOP_MUD_TARGET+6},
  snipe:           {e:'🎯', name:()=>`Cecchinaggio estremo: elimina un mostro sparando da ${COOP_SNIPE_DIST}+ caselle`, reward:12, val:()=>[COOP.st.snipe ? 1 : 0, 1]},
  crossfire:       {e:'🔀', name:()=>`Fuoco incrociato: ${COOP_CROSSFIRE_UNITS} unità diverse feriscono lo stesso mostro nello stesso round`, reward:15, val:()=>[COOP.st.crossfire ? 1 : 0, 1]},
  impenetrable:    {e:'👁️', name:()=>`Impenetrabile: ${COOP_REACT_TARGET} mostri abbattuti dal fuoco di Difesa o dei Bunker`, reward:15, val:()=>[COOP.st.reactKills||0, COOP_REACT_TARGET]},
  super_soldier:   {e:'🧠', name:()=>'Super soldato: crea un\'unità con un\'abilità al massimo dei 3 laboratori', reward:18, val:()=>[COOP.st.superSoldier ? 1 : 0, 1]},
  adamantium:      {e:'🔰', name:()=>`Corazza d'adamantio: un'unità con armatura top-tech al massimo (${TECH_ARMOR_MAX})`, reward:25, val:()=>[coopMaxArmor(), TECH_ARMOR_MAX]},
  trap:            {e:'🕳️', name:()=>'Trappola: costruisci del fango e cattura un mostro che ci entra', reward:15, val:()=>[COOP.st.trapped ? 1 : 0, 1],
                    txt:()=>COOP.st.trapped ? '1/1' : `${(COOP.traps||[]).length} trappole armate`}
};
const coopQuestsDone = () => COOP ? COOP.quests.filter(q=>q.done).length : 0;
const coopHumans = () => players.map((p,i)=>i).filter(i=>!players[i].monster);
const coopHasQuest = id => !!COOP && COOP.quests.some(q=>q.id===id);

// ================== MODALITÀ E PARTITA ==================
function coopLobbyPrep(n,bots){                      // chiamata da dnet.js e dall'HTML all'avvio di una partita: coop = n umani + 1 giocatore "Mostri"; war = come prima
  if(COOP_CFG.mode!=='coop') return {n, bots:Math.min(bots,n-1)};
  COOP_CFG.lairs = Math.max(1,Math.min(COOP_MAX_LAIRS,bots||1));
  return {n:n+1, bots:1};
}
let coopFocused = false;
function coopInit(){                                 // chiamata da newGame(): prepara COOP (la mappa si costruisce dopo la scelta delle fazioni)
  coopInstallHooks();                                // una volta sola: tutti gli script sono già caricati
  COOP = null; coopFocused = false; coopVisSig = ''; coopPrevSrc = new Map(); coopGhosts = [];
  if(COOP_CFG.mode==='coop' && players.length>=2){
    const mon = players.length-1;
    players[mon].monster = true; players[mon].bot = true; players[mon].name = 'Mostri';
    COOP = {mon, lairs:COOP_CFG.lairs, built:false, W:COOP_W, H:COOP_H, expl:[], nExpl:0, bossSpawned:false, finalDead:false, quests:[], st:{}, survivor:null, drone:null, mono:[], sos:null, hostage:null, traps:[]};
  }
  coopSync();
}
const COOP_INFECT = {id:'infetta', e:'🦠', label:'Infetta base', mode:'infect',
  rule:'Solo in cooperativa. Costo 1 azione. Con un\'unità adiacente a una base di mostri (non la base finale) la infetti: da quel momento non crea più mostri.'};
function coopSync(){                                 // allinea l'interfaccia alla modalità (dopo newGame e restore): azione speciale "Infetta" solo in coop
  coopVisSig = '';
  if(typeof SPECIALS==='undefined') return;
  const i = SPECIALS.unit.indexOf(COOP_INFECT);
  if(COOP && i<0) SPECIALS.unit.push(COOP_INFECT);
  else if(!COOP && i>=0) SPECIALS.unit.splice(i,1);
}
const coopIdx = (c,r) => r*COOP_W+c;
const coopExpl = (c,r) => !COOP || !COOP.built || !!COOP.expl[coopIdx(c,r)];     // casella già esplorata (o niente nebbia)
function coopObjAt(c,r){                             // sopravvissuto (finché non è stato preso), drone, monoliti e segnale SOS (finché è acceso) occupano la casella
  if(!COOP) return false;
  const s = COOP.survivor, d = COOP.drone, so = COOP.sos;
  return !!((s && !s.taken && s.c===c && s.r===r) || (d && d.c===c && d.r===r)
    || (COOP.mono && COOP.mono.some(m=>m.c===c && m.r===r))
    || (so && !so.gone && so.c===c && so.r===r));
}
const coopLairUnits = (p,b) => p.units.filter(u=>u.home===b.id).length;
const coopLairFull = (p,b) => !!(b.infected || coopLairUnits(p,b)>=COOP_LAIR_MAX_UNITS);
const coopFinalBase = () => COOP && COOP.built ? players[COOP.mon].bases.find(b=>b.id===COOP.finalId) : null;
const coopFinalShield = () => !!COOP && COOP.built && (!COOP.bossSpawned || players[COOP.mon].units.some(u=>u.boss) || coopQuestsDone()<COOP_QUESTS_NEEDED);   // scudo infinito finché i boss non sono apparsi, finché ne vive uno, e finché non sono completate COOP_QUESTS_NEEDED quest
const coopOverTitle = () => !COOP ? null : (players[winner.i].monster ? '💀 Sconfitta: i mostri hanno vinto' : '🎉 Vittoria cooperativa!');
const coopRnd = n => Math.floor(Math.random()*n);
const coopShuf = a => { for(let i=a.length-1;i>0;i--){ const j = coopRnd(i+1); [a[i],a[j]] = [a[j],a[i]]; } return a; };

// ================== PESCA DELLE QUEST ==================
// Regola: 1 quest a caso per ogni FAZIONE presente (le voci di COOP_QUESTS con campo fac, vedi dquests.js), sempre PRIMA delle generiche; con più di
// COOP_FACTION_PLAYERS_MAX giocatori umani se ne scelgono a caso tanti quanti il massimo. Poi si completa fino a COOP_QUESTS_COUNT con quest generiche (senza fac).
function coopFactionPlan(){                           // [{fac, pi}]: una fazione (gruppo di FACTION_GROUP: EC, ME, GU, HE, AL, RO, ZE) per ogni giocatore scelto; due colori dello stesso gruppo valgono una volta
  if(typeof FACTION_GROUP==='undefined') return [];
  let hum = coopHumans().filter(i=>FACTION_GROUP[players[i].color]);
  if(hum.length>COOP_FACTION_PLAYERS_MAX) hum = coopShuf(hum.slice());     // più giocatori del massimo: si scorrono in ordine casuale e se ne prendono COOP_FACTION_PLAYERS_MAX
  const seen = new Set(), out = [];
  hum.forEach(i=>{ if(out.length>=COOP_FACTION_PLAYERS_MAX) return; const f = FACTION_GROUP[players[i].color]; if(seen.has(f)) return; seen.add(f); out.push({fac:f,pi:i}); });   // (blu e rosa sono lo stesso gruppo: valgono una volta sola)
  return out;
}
function coopFactionOwner(fac){ const pl = coopFactionPlan(); const hit = pl.find(x=>x.fac===fac); if(hit) return hit.pi; const h = coopHumans().find(i=>typeof FACTION_GROUP!=='undefined' && FACTION_GROUP[players[i].color]===fac); return h===undefined ? coopHumans()[0] : h; }
function coopPickQuests(C,ctx){
  const dbg = Array.isArray(COOP_DEBUG_QUESTS);        // modalità prova: si usano esattamente le quest indicate
  let risky = 0;
  const add = (id,owner) => {                          // una quest che non si può preparare (setup false), non ha senso (avail), è troppo rischiosa o doppione (uses) si scarta
    const d = COOP_QUESTS[id]; if(!d || C.quests.some(q=>q.id===id)) return false;
    if(!dbg){
      if(d.risk && risky>=COOP_MAX_RISKY) return false;
      if(d.avail && !d.avail(C)) return false;
      if(d.uses && C.quests.some(q=>COOP_QUESTS[q.id].uses===d.uses)) return false;   // stesso meccanismo di una quest già estratta
    }
    if(d.setup && d.setup(C,ctx,owner)===false) return false;
    const q = {id,done:false,failed:false}; if(d.fac) q.owner = owner;
    C.quests.push(q); if(d.risk) risky++;
    return true;
  };
  if(dbg){ COOP_DEBUG_QUESTS.forEach(id=>{ const d = COOP_QUESTS[id]; if(d) add(id, d.fac ? coopFactionOwner(d.fac) : undefined); }); return; }
  coopShuf(coopFactionPlan()).forEach(sl=>{            // 1) una quest per fazione presente
    if(C.quests.length>=COOP_QUESTS_COUNT) return;
    for(const id of coopShuf(Object.keys(COOP_QUESTS).filter(k=>COOP_QUESTS[k].fac===sl.fac))) if(add(id,sl.pi)) break;
  });
  for(const id of coopShuf(Object.keys(COOP_QUESTS).filter(k=>!COOP_QUESTS[k].fac))){   // 2) si completa con quelle generiche
    if(C.quests.length>=COOP_QUESTS_COUNT) break;
    add(id);
  }
}

// ================== COSTRUZIONE DELLA MAPPA ==================
function coopBuildMap(){                              // chiamata da actChooseColor quando tutti hanno scelto la fazione: mappa, basi, quest, poi fase "carte"
  const C = COOP, W = COOP_W, H = COOP_H, mon = C.mon, mp = players[mon], nHum = mon;
  tiles = new Map(); objHp = new Map(); mineOwner = new Map(); barOwner = new Map();
  for(let ty=0;ty<2;ty++) for(let tx=0;tx<3;tx++) tiles.set(key(tx,ty),{tx,ty,data:genTile(),owner:0});
  C.W = W; C.H = H;
  // --- angolo dei giocatori: si liberano le 9 caselle e si mettono le basi una accanto all'altra ---
  const sx = coopRnd(2), sy = coopRnd(2); C.corner = {sx,sy};
  const at = (dc,dr) => [sx ? W-1-dc : dc, sy ? H-1-dr : dr];
  const zone = []; for(let dr=0;dr<3;dr++) for(let dc=0;dc<3;dc++){ const [c,r] = at(dc,dr); setTerr(c,r,null); zone.push({c,r,w:dc+dr}); }
  const zk = new Set(zone.map(z=>key(z.c,z.r)));
  let best = null, bestScore = Infinity;
  for(let m=0;m<512;m++){                              // sceglie nHum caselle della zona, vicine all'angolo, in modo che ogni base abbia ancora una casella libera accanto
    const pick = zone.filter((_,i)=>m>>i&1); if(pick.length!==nHum) continue;
    const pk = new Set(pick.map(z=>key(z.c,z.r)));
    const ok = pick.every(z=>neighbors(z.c,z.r).some(([a,b])=>!pk.has(key(a,b)) && !isSolid(a,b)));
    const score = pick.reduce((s,z)=>s+z.w,0) + (ok ? 0 : 1000) + Math.random()*0.5;
    if(score<bestScore){ bestScore = score; best = pick; }
  }
  best.sort((a,b)=>a.w-b.w || a.r-b.r).forEach((z,i)=>players[i].bases.push(newBase(z.c,z.r)));
  const pbases = players.filter(p=>!p.monster).flatMap(p=>p.bases);
  const clearAround = (c,r) => neighbors(c,r).forEach(([a,b])=>{ if(isSolid(a,b)) setTerr(a,b,null); });   // la base nemica deve avere caselle libere intorno
  const putBase = (c,r,extra) => { setTerr(c,r,null); objHp.delete(key(c,r)); clearAround(c,r); const b = newBase(c,r); Object.assign(b,extra); mp.bases.push(b); return b; };
  // --- base finale: in una delle prime 2 caselle del lato opposto (l'angolo opposto e la casella accanto lungo il bordo) ---
  const ox = sx ? 0 : W-1, dx = sx ? 1 : -1;            // lato corto opposto ai giocatori: la colonna di bordo e quella accanto
  const fc = [Math.random()<0.5 ? ox : ox+dx, coopRnd(H)];   // una qualsiasi delle 24 caselle di una delle prime 2 colonne
  const fin = putBase(fc[0],fc[1],{finalBase:true}); C.finalId = fin.id;
  // --- basi di mostri: a distanza >= 10 dai giocatori e >= 6 tra loro (se la mappa è sfortunata la regola si allenta di poco) ---
  const placed = [fin], cells = allHexes(), lairs = [];
  for(let k=0;k<C.lairs;k++){
    let cand = [];
    for(let relax=0; relax<=6 && !cand.length; relax++){
      const dp = Math.max(4,COOP_LAIR_MIN_DIST-relax), ds = Math.max(2,COOP_LAIR_SPACING-relax);
      cand = cells.filter(([c,r])=>!isSolid(c,r) && terr(c,r)!=='risorse'
        && pbases.every(b=>hexDist([c,r],[b.c,b.r])>=dp) && placed.every(b=>hexDist([c,r],[b.c,b.r])>=ds));
    }
    if(!cand.length) break;
    const [c,r] = cand[coopRnd(cand.length)];
    placed.push(putBase(c,r,{lair:true}));
  }
  C.lairs = placed.length-1;                           // basi di mostri davvero create (di norma tutte quelle chieste)
  // --- miniere dei mostri: ogni base nemica (finale compresa) parte con le miniere sulle risorse più vicine, come i bot in war ---
  mp.bases.forEach(b=>{
    hexesWithin(b.c,b.r,TILE).filter(([c,r])=>terr(c,r)==='risorse' && !occupied(c,r))
      .sort((x,y)=>hexDist([b.c,b.r],x)-hexDist([b.c,b.r],y)).slice(0,COOP_BASE_MINES)
      .forEach(([c,r])=>{ setTerr(c,r,'miniera'); objHp.delete(key(c,r)); mineOwner.set(key(c,r),mon); });
  });
  // --- centro: le 6 caselle più vicine al centro geometrico della mappa ---
  const px = (c,r) => c+0.5*(r&1), py = r => r*0.866, cx = (W-1)/2+0.25, cy = (H-1)/2*0.866;
  C.center = cells.map(([c,r])=>({c,r,d:Math.hypot(px(c,r)-cx,py(r)-cy)})).sort((a,b)=>a.d-b.d).slice(0,6).map(o=>[o.c,o.r]);
  // --- quest e oggetti neutrali ---
  C.quests = []; C.mono = []; C.sos = null; C.hostage = null; C.traps = []; C.survivor = null; C.drone = null;
  C.st = {killMon:0,killBig:0,killLair:0,forts:0,bunkerKills:0,infected:0,tamed:0,maxKillsTurn:0,center:false,droneBest:0,rescued:false,
          golemDead:false,monoBest:0,sosDone:false,hostageFreed:false,hostageDead:false,knight:false,mud:0,snipe:false,crossfire:false,reactKills:0,superSoldier:false,trapped:0};
  const freeSpot = (minP,minM,avoid,avoidD=5,maxP) => {   // casella libera lontana dalle basi (minP giocatori, minM mostri; maxP = entro questa distanza da una base giocatori), con almeno una casella libera accanto
    const list = coopShuf(cells.slice());
    for(const [c,r] of list){
      if(isSolid(c,r) || terr(c,r)!==null || occupied(c,r)) continue;
      if(pbases.some(b=>hexDist([c,r],[b.c,b.r])<minP) || mp.bases.some(b=>hexDist([c,r],[b.c,b.r])<minM)) continue;
      if(maxP && !pbases.some(b=>hexDist([c,r],[b.c,b.r])<=maxP)) continue;
      if(avoid && avoid.some(o=>hexDist([c,r],[o.c,o.r])<avoidD)) continue;
      if(!neighbors(c,r).some(([a,b])=>!isSolid(a,b))) continue;
      return {c,r};
    }
    return null;
  };
  const ctx = {freeSpot, cells, pbases};
  coopPickQuests(C,ctx);                               // 1 quest di fazione per ogni fazione presente + generiche (vedi sopra)
  // --- visuale iniziale ---
  C.expl = Array(W*H).fill(0); C.nExpl = 0; C.built = true; coopVisSig = '';
  coopMarkExplored();
  phase = 'cards'; step = 0;
}

// ================== NEBBIA DI GUERRA ==================
// Visibile = entro la gittata di una unità o base di QUALSIASI giocatore umano (la visuale è condivisa). Esplorata = vista almeno una volta.
let coopVisSig = '', coopVisSet = null;
let coopPrevSrc = new Map(), coopGhosts = [];         // sorgenti di visuale all'ultimo calcolo (id → {c,r,rad}) e visuale residua di quelle appena distrutte
const coopRadius = e => Math.max(COOP_VISION_MIN, rangeOf(e));
function coopVis(){                                   // insieme delle caselle visibili adesso (chiavi "c,r"), in cache finché non si muove nulla
  const src = [], now = Date.now();
  players.forEach(p=>{ if(!p.monster && !p.surrendered) src.push(...p.bases, ...p.units, ...p.structs); });   // anche gli edifici danno visuale (raggio = la loro gittata, minimo COOP_VISION_MIN: bunker 2, gli altri 1)
  const cur = new Map(src.map(e=>[e.id,{c:e.c,r:e.r,rad:coopRadius(e)}]));
  coopPrevSrc.forEach((o,id)=>{ if(!cur.has(id)){      // un'unità o base c'era e ora non c'è più (distrutta): la sua visuale resta ancora un po'
    coopGhosts.push({c:o.c,r:o.r,rad:o.rad,until:now+COOP_FOG_DELAY_MS});
    setTimeout(()=>redraw(), COOP_FOG_DELAY_MS+30);    // allo scadere si ridisegna: compare la nebbia
  } });
  coopPrevSrc = cur;
  coopGhosts = coopGhosts.filter(gh=>gh.until>now);
  const sig = src.map(e=>e.c+','+e.r+','+coopRadius(e)).join(';') + '|' + coopGhosts.map(gh=>gh.c+','+gh.r+','+gh.rad+','+gh.until).join(';');
  if(sig===coopVisSig && coopVisSet) return coopVisSet;
  const s = new Set();
  src.forEach(e=>hexesWithin(e.c,e.r,coopRadius(e)).forEach(([c,r])=>s.add(key(c,r))));
  coopGhosts.forEach(gh=>hexesWithin(gh.c,gh.r,gh.rad).forEach(([c,r])=>s.add(key(c,r))));
  coopVisSig = sig; coopVisSet = s; return s;
}
const coopSeen = (c,r) => !COOP || !COOP.built || coopVis().has(key(c,r));
function coopFogOn(){ return !!COOP && COOP.built && (phase==='cards' || phase==='play'); }
//function coopFogOn(){ return false; }   // TEMPORANEO: nebbia disattivata per prova (rimetti la riga originale dopo)

function coopMarkExplored(){                          // le caselle visibili diventano esplorate; ritorna quante sono nuove
  let n = 0;
  coopVis().forEach(k=>{ const [c,r] = k.split(',').map(Number), i = coopIdx(c,r); if(!COOP.expl[i]){ COOP.expl[i] = 1; COOP.nExpl++; n++; } });
  return n;
}
function coopHide(p,e,isBase){                        // true = questo nemico non si disegna (nebbia)
  if(!coopFogOn() || !p.monster) return false;
  if(isBase && COOP_SHOW_REMEMBERED_BASES) return !coopExpl(e.c,e.r);
  return !coopSeen(e.c,e.r);
}
function coopFilterEvents(evs){                       // niente lampi, spari o esplosioni in caselle che non si vedono
  if(!coopFogOn()) return evs;
  const seen = p => !!p && coopSeen(p[0],p[1]);
  return evs.filter(ev=>{
    if(ev.t==='shot' || ev.t==='move') return seen(ev.from) || seen(ev.to);
    if(ev.t==='flash') return (ev.cells||[]).some(cc=>seen(cc)) || seen(ev.at) || seen(ev.from);
    if(ev.at) return seen(ev.at);
    return true;
  });
}
function coopDrawFog(){                               // sopra le caselle: nero totale se mai viste, velo leggero se solo già visitate
  if(!coopFogOn()) return;
  const vis = coopVis(), W = COOP_W, H = COOP_H;
  g.save(); g.globalAlpha = 1;
  for(let r=0;r<H;r++) for(let c=0;c<W;c++){
    const k = key(c,r); if(vis.has(k) || !exists(c,r)) continue;
    const [x,y] = ctr(c,r);
    if(x<-S*2||y<-S*2||x>CW+S*2||y>CH+S*2) continue;
    const dark = !COOP.expl[coopIdx(c,r)];
    hexPath(g,x,y,dark ? S*1.04 : S); g.fillStyle = dark ? '#000' : COOP_FOG_VEIL; g.fill();
  }
  g.restore();
}
function coopDrawObjects(){                           // sopravvissuto, drone, monoliti, trappole (solo se la casella è già stata esplorata) e segnale SOS (si vede sempre)
  if(!COOP || !COOP.built) return;
  const s = COOP.survivor, d = COOP.drone;
  const one = (o,em,always,size) => { if(!o || (!always && !coopExpl(o.c,o.r))) return; const [x,y] = ctr(o.c,o.r); if(x<-S*2||y<-S*2||x>CW+S*2||y>CH+S*2) return;
    g.save(); g.globalAlpha = 1; g.font = Math.round(S*(size||0.95))+'px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(em,x,y+S*0.05); g.restore(); };
  if(s && !s.taken) one(s,COOP_SURVIVOR_EMOJI);
  one(d,COOP_DRONE_EMOJI);
  (COOP.mono||[]).forEach(m=>{                         // monolito: un anello azzurro se c'è un'unità accanto
    const im = (m.img && typeof loadImg==='function') ? loadImg(m.img) : null;   // santuari dei Blu: immagine (se manca resta l'emoji)
    if(im && coopExpl(m.c,m.r)){ const [x0,y0] = ctr(m.c,m.r); if(!(x0<-S*2||y0<-S*2||x0>CW+S*2||y0>CH+S*2)){ const w = S*1.7; g.save(); g.globalAlpha = 1; g.drawImage(im,x0-w/2,y0-w/2,w,w); g.restore(); } }
    else one(m,COOP_MONO_EMOJI);
    if(!coopExpl(m.c,m.r) || !coopHumans().some(i=>players[i].units.some(u=>!u.survivor && hexDist([u.c,u.r],[m.c,m.r])<=1))) return;
    const [x,y] = ctr(m.c,m.r); g.save(); g.beginPath(); g.arc(x,y,S*0.95,0,Math.PI*2); g.strokeStyle = '#22d3ee'; g.lineWidth = 3; g.stroke(); g.restore();
  });
  const so = COOP.sos;
  if(so && !so.gone){                                  // SOS: si vede anche nella nebbia, con i turni rimasti
    one(so,COOP_SOS_EMOJI,true);
    const [x,y] = ctr(so.c,so.r); g.save(); g.font = `bold ${Math.round(S*0.42)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3;
    g.strokeText('⏱'+coopSosLeft(),x,y+S*0.85); g.fillText('⏱'+coopSosLeft(),x,y+S*0.85); g.restore();
  }
  (COOP.traps||[]).forEach(t=>one(t,COOP_TRAP_EMOJI,true,0.55));   // le trappole le vedono solo i giocatori (i mostri non le vedono)
}
function coopMarks(e,x,y){                            // segni sulle entità (chiamata da cardMarks in dcardsui2.js)
  if(!COOP) return;
  g.save(); g.textAlign = 'center'; g.textBaseline = 'middle';
  if(e.boss){ g.font = `bold ${Math.round(S*0.5)}px Arial`; g.fillText('💀',x,y-S*0.8); }
  if(e.golem){ g.font = `bold ${Math.round(S*0.5)}px Arial`; g.fillText(COOP_GOLEM_EMOJI,x,y-S*0.8); }
  if(e.veteran){ g.font = `bold ${Math.round(S*0.38)}px Arial`; g.fillText(COOP_VETERAN_EMOJI,x-S*0.45,y-S*0.1); }
  if(e.hostage){                                        // base con l'ostaggio: lucchetto e, dopo la scoperta, i turni rimasti
    g.font = `bold ${Math.round(S*0.5)}px Arial`; g.fillText(COOP_HOSTAGE_EMOJI,x,y-S*0.85);
    if(COOP.hostage && COOP.hostage.found!=null){ g.font = `bold ${Math.round(S*0.4)}px Arial`; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3;
      g.strokeText('⏱'+coopHostageLeft(),x+S*0.7,y-S*0.85); g.fillText('⏱'+coopHostageLeft(),x+S*0.7,y-S*0.85); }
  }
  if(e.survivor){ g.font = `bold ${Math.round(S*0.38)}px Arial`; g.fillText('🆘',x-S*0.45,y-S*0.1); }
  if(e.tamed){ g.font = `bold ${Math.round(S*0.38)}px Arial`; g.fillText('🐾',x-S*0.45,y-S*0.1); }
  if(e.infected){ g.font = `bold ${Math.round(S*0.45)}px Arial`; g.fillText('🦠',x-S*0.5,y+S*0.35); }
  if(e.finalBase){
    if(coopFinalShield()){                              // scudo infinito ingrandito per contenere la base gigante
      g.beginPath(); g.arc(x,y,S*1.62,0,Math.PI*2); g.strokeStyle = '#facc15'; g.lineWidth = 3; g.setLineDash([8,6]); g.stroke(); g.setLineDash([]);
      g.font = `bold ${Math.round(S*0.6)}px Arial`; g.fillStyle = '#facc15'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText('∞',x+S*1.15,y-S*1.15); g.fillText('∞',x+S*1.15,y-S*1.15);
    }
  }
  g.restore();
}

// ================== EVENTI DI GIOCO (chiamati da drules.js) ==================
function coopOnHit(e,d){                              // quest del drone: l'agente accanto al drone ha subito danni
  if(COOP && COOP.drone && d>0 && hexDist([e.c,e.r],[COOP.drone.c,COOP.drone.r])<=1) e.hurt = true;
}
function coopOnDeath(e,victim,killer,att,wasUnit){    // una entità è morta (e è già stata tolta dal suo giocatore)
  const C = COOP; if(!C || !C.built) return;
  const killerHuman = killer>=0 && !players[killer].monster;
  if(victim===C.mon){
    if(e.finalBase){ C.finalDead = true; return; }
    if(e.isBase){ if(killerHuman) C.st.killLair++; if(e.hostage) coopFreeHostage(e,killer); return; }
    if(wasUnit && killerHuman){
      C.st.killMon++; if(maxHp(e)>=COOP_BIG_HP) C.st.killBig++;
      if(e.boss && !players[C.mon].units.some(u=>u.boss)) C.say = (C.say||'') + (coopQuestsDone()>=COOP_QUESTS_NEEDED ? ' 🛡️ Ultimo boss caduto: lo scudo della base obiettivo è sparito!' : ` 💀 Tutti i boss sono caduti: servono ancora ${COOP_QUESTS_NEEDED-coopQuestsDone()} quest per far cadere lo scudo della base obiettivo.`);   // C.say: messaggi in coda, mostrati da coopCheckQuests (l'outLog dell'azione li sovrascriverebbe)
      if(e.golem) C.st.golemDead = true;
      if(players[step%NUM_PLAYERS].monster) C.st.reactKills = (C.st.reactKills||0)+1;   // ucciso nel turno dei mostri = per forza fuoco di Difesa o di un Bunker
      if(att && att.isStruct && att.type==='bunker') C.st.bunkerKills++;
      if(att && !att.isBase && !att.isStruct && killer===step%NUM_PLAYERS){ att.killsTurn = (att.killsTurn||0)+1; C.st.maxKillsTurn = Math.max(C.st.maxKillsTurn, att.killsTurn); }
    }
  } else if(e.survivor && wasUnit) C.survivorDead = true;
}
function coopTame(ent,u){                             // cura su un mostro ferito (non boss): diventa un alleato per sempre
  const C = COOP; if(!C || !C.built) return;
  const mp = players[C.mon], i = mp.units.indexOf(ent), owner = ownerOf(u);
  if(i<0 || ent.boss || owner<0 || players[owner].monster) return;
  mp.units.splice(i,1); players[owner].units.push(ent);
  ent.tamed = true; ent.actions = 0; ent.defending = false; ent.empDebuff = 0; delete ent.home;
  C.st.tamed++; outLog += ` 🐾 Mostro addomesticato: ora è un alleato di ${players[owner].name}!`;
}
const coopInfectTargets = u => (!COOP || !COOP.built || u.actions<1) ? [] : neighbors(u.c,u.r).filter(([c,r])=>players[COOP.mon].bases.some(b=>b.c===c && b.r===r && !b.finalBase && !b.infected));
function coopInfect(e,kind,hex,a){                    // azione {t:'infect', ent, c, r}: ritorna il motivo del rifiuto ('' = ok, poi runAction fa afterAction)
  if(!COOP || !COOP.built || kind!=='unit' || !hex || !inList(coopInfectTargets(e),a.c,a.r)) return 'Infezione non valida.';
  const b = players[COOP.mon].bases.find(b=>b.c===a.c && b.r===a.r);
  e.actions--; b.infected = true; COOP.st.infected++;
  outLog = '🦠 Virus iniettato: la base non creerà più mostri.';
  return '';
}

function coopSpawnBosses(){                           // la base finale è stata scoperta: appaiono i boss e la scorta
  const C = COOP, fb = coopFinalBase(); if(!fb) return;
  C.bossSpawned = true;
  const mp = players[C.mon], nHum = C.mon, nBoss = nHum, nEsc = nHum*COOP_BOSS_ESCORT;
  const keepFree = coopHasQuest('gu_rinforzi');       // quest "Rinforzi dal cielo": le caselle adiacenti alla base finale restano libere (altrimenti boss e scorta le riempirebbero e non si potrebbe atterrare)
  const spots = hexesWithin(fb.c,fb.r,COOP_BOSS_RING).filter(([c,r])=>walkable(c,r) && terr(c,r)!=='miniera' && !(keepFree && hexDist([c,r],[fb.c,fb.r])<=1))
    .map(([c,r])=>({c,r,d:hexDist([c,r],[fb.c,fb.r])+Math.random()*0.9})).sort((a,b)=>a.d-b.d);
  const rndStats = () => { const st = {}; STATS.forEach(s=>{ st[s.id] = STAT_MIN + coopRnd(statMax(s.id,C.mon)-STAT_MIN+1); }); return st; };
  const useRnd = typeof AI_START_RANDOM_STATS!=='undefined' && AI_START_RANDOM_STATS;
  let nb = 0, ne = 0;
  spots.forEach(s=>{
    if(nb<nBoss){ mp.units.push({id:nextId++,c:s.c,r:s.r,actions:NEW_UNIT_ACTIONS,st:{...COOP_BOSS_STATS},hp:COOP_BOSS_STATS.vita,boss:true}); nb++; }
    else if(ne<nEsc){ const st = useRnd ? rndStats() : {...BOT_START_STATS}; mp.units.push({id:nextId++,c:s.c,r:s.r,actions:NEW_UNIT_ACTIONS,st,hp:st.vita,escort:true}); ne++; }
  });
  mp.hadUnits = true;
  if(typeof playSFX === 'function') playSFX('cards4'); // Suono massiccio
  outLog += ` 🎯 Base obiettivo scoperta! Appaiono ${nb} boss e ${ne} guardie. Finché un boss è vivo, o finché non sono completate ${COOP_QUESTS_NEEDED} quest, la base ha scudi infiniti.`;
}
function coopMinesNow(){ let n = 0; mineOwner.forEach((o,cp)=>{ const [c,r] = cp.split(',').map(Number); if(players[o] && !players[o].monster && terr(c,r)==='miniera') n++; }); return n; }
function coopCornersSeen(){ const W = COOP_W, H = COOP_H; return [[0,0],[W-1,0],[0,H-1],[W-1,H-1]].filter(([c,r])=>COOP.expl[coopIdx(c,r)]).length; }
function coopSurvivor(){                              // sopravvissuto: lo prende chi gli va accanto; la quest finisce quando lo scorti accanto a una base alleata
  const C = COOP, s = C.survivor; if(!s) return;
  if(!s.taken){
    for(const i of coopHumans()){
      const u = players[i].units.find(u=>hexDist([u.c,u.r],[s.c,s.r])<=1);
      if(!u) continue;
      players[i].units.push({id:nextId++,c:s.c,r:s.r,actions:0,st:{vita:1,passi:1,gittata:1,attacco:1},hp:1,survivor:true});
      players[i].hadUnits = true; s.taken = true;
      outLog += ` 🆘 Sopravvissuto salvato da ${players[i].name}: scortalo accanto a una base alleata!`; break;
    }
    return;
  }
  const sv = coopHumans().flatMap(i=>players[i].units).find(u=>u.survivor);
  if(!sv){ C.survivorDead = true; return; }
  if(coopHumans().some(i=>players[i].bases.some(b=>hexDist([b.c,b.r],[sv.c,sv.r])<=1))) C.st.rescued = true;
}
// ================== QUEST NUOVE: FUNZIONI DI SUPPORTO ==================
const coopRound = () => Math.floor(step/NUM_PLAYERS);          // giro corrente: un giro = il turno di ogni giocatore, mostri compresi (i "turni" delle quest sono giri)
const coopCountTerr = k => allHexes().filter(([c,r])=>terr(c,r)===k).length;
const coopGolem = () => (COOP && COOP.built) ? players[COOP.mon].units.find(u=>u.golem) : null;
const coopGolemSeen = () => { const g0 = coopGolem(); return !!g0 && coopExpl(g0.c,g0.r); };
const coopSosLeft = () => (COOP && COOP.sos) ? Math.max(0,COOP.sos.until-coopRound()) : 0;
const coopHostageLeft = () => (COOP && COOP.hostage && COOP.hostage.until!=null) ? Math.max(0,COOP.hostage.until-coopRound()) : COOP_HOSTAGE_TURNS;
const coopTrapAt = (c,r) => !!COOP && !!COOP.traps && COOP.traps.some(t=>t.c===c && t.r===r);
const coopMonoActive = () => (!COOP || !COOP.mono) ? 0 : COOP.mono.filter(m=>coopHumans().some(i=>players[i].units.some(u=>!u.survivor && hexDist([u.c,u.r],[m.c,m.r])<=1))).length;   // monoliti con un'unità accanto, adesso
const coopMaxArmor = () => Math.max(0,...coopHumans().flatMap(i=>players[i].units.filter(u=>!u.survivor).map(u=>u.techArmor||0)));
const coopFarSet = (L,d) => { let best = 0; const rec = (from,ch) => { best = Math.max(best,ch.length); for(let i=from;i<L.length;i++) if(ch.every(p=>hexDist(p,L[i])>=d)) rec(i+1,[...ch,L[i]]); }; rec(0,[]); return best; };   // quanti punti di L si possono scegliere a distanza >= d uno dall'altro
function coopHangarBest(){                            // hangar dei giocatori: il massimo numero scelto a distanza >= COOP_HANGAR_DIST uno dall'altro
  const L = []; coopHumans().forEach(i=>players[i].structs.forEach(s=>{ if(s.type==='hangar') L.push([s.c,s.r]); }));
  return coopFarSet(L,COOP_HANGAR_DIST);
}

function coopSetupGolem(C,x){                         // il Golem sta su una montagna lontana dalle basi dei giocatori (se non ce n'è una adatta se ne crea una)
  const mp = players[C.mon];
  const cand = x.cells.filter(([c,r])=>terr(c,r)==='montagne' && !occupied(c,r)
    && x.pbases.every(b=>hexDist([c,r],[b.c,b.r])>=COOP_GOLEM_MIN_DIST) && mp.bases.every(b=>hexDist([c,r],[b.c,b.r])>=3)
    && neighbors(c,r).some(([a,b])=>!isSolid(a,b)));
  let pos = cand.length ? cand[coopRnd(cand.length)] : null;
  if(!pos){ const f = x.freeSpot(COOP_GOLEM_MIN_DIST,3); if(!f) return false; setTerr(f.c,f.r,'montagne'); objHp.delete(key(f.c,f.r)); pos = [f.c,f.r]; }
  mp.units.push({id:nextId++,c:pos[0],r:pos[1],actions:NEW_UNIT_ACTIONS,st:{...COOP_GOLEM_STATS},hp:COOP_GOLEM_STATS.vita,golem:true});
  mp.hadUnits = true;
  return true;
}
function coopSetupMonoliths(C,x){                     // monoliti lontani dalle basi e tra loro: ci vuole coordinamento per attivarli insieme
  C.mono = [];
  for(let i=0;i<COOP_MONO_COUNT;i++){
    const f = x.freeSpot(COOP_MONO_MIN_DIST,5,C.mono,COOP_MONO_SPACING);
    if(!f){ C.mono = []; return false; }
    C.mono.push({c:f.c,r:f.r});
  }
  return true;
}
function coopSpawnVet(pi,c,r){                        // un veterano (SOS, ostaggio) compare per il giocatore pi, sulla casella libera più vicina a (c,r)
  const spots = hexesWithin(c,r,2).filter(([x,y])=>walkable(x,y) && terr(x,y)!=='miniera' && terr(x,y)!=='risorse')
    .sort((a,b)=>hexDist([c,r],a)-hexDist([c,r],b));
  if(!spots.length) return null;
  const u = {id:nextId++,c:spots[0][0],r:spots[0][1],actions:0,st:{...COOP_VETERAN},hp:COOP_VETERAN.vita,veteran:true};
  players[pi].units.push(u); players[pi].hadUnits = true;
  return u;
}
function coopFreeHostage(b,killer){                   // la base con l'ostaggio è stata distrutta (b è già stata tolta): il veterano si unisce a chi l'ha distrutta
  const C = COOP; if(C.st.hostageFreed || C.st.hostageDead) return;
  C.st.hostageFreed = true; b.hostage = false;
  const pi = (killer>=0 && !players[killer].monster) ? killer : coopHumans().find(i=>!players[i].surrendered);
  const u = pi===undefined ? null : coopSpawnVet(pi,b.c,b.r);
  outLog += u ? ` 🔓 Ostaggio liberato! Un veterano si unisce a ${players[pi].name}.` : ' 🔓 Ostaggio liberato!';
}
function coopTick(){                                  // timer e controlli delle quest nuove (dopo ogni azione e a ogni cambio di turno)
  const C = COOP, rd = coopRound(), mp = players[C.mon];
  const H = C.hostage;                                // --- ostaggio: i turni partono quando la base viene scoperta
  if(H && !C.st.hostageFreed && !C.st.hostageDead){
    const b = mp.bases.find(x=>x.id===H.id);
    if(!b) C.st.hostageDead = true;
    else if(H.found==null){
      if(coopExpl(b.c,b.r)){ H.found = rd; H.until = rd+COOP_HOSTAGE_TURNS; outLog += ` 🔒 Base con l'ostaggio trovata! Avete ${COOP_HOSTAGE_TURNS} turni per distruggerla.`; }
    } else if(rd>=H.until){ C.st.hostageDead = true; b.hostage = false; outLog += ' 💀 Troppo tardi: l\'ostaggio è perduto.'; }
  }
  const S0 = C.sos;                                   // --- SOS: la prima unità accanto al segnale riceve un veterano; allo scadere il segnale si spegne
  if(S0 && !S0.gone && !C.st.sosDone){
    const near = coopHumans().find(i=>players[i].units.some(u=>!u.survivor && hexDist([u.c,u.r],[S0.c,S0.r])<=1));
    if(near!==undefined){
      S0.gone = true; C.st.sosDone = true;
      const v = coopSpawnVet(near,S0.c,S0.r);
      outLog += v ? ` 🚨 SOS raccolto! Un veterano si unisce a ${players[near].name}.` : ' 🚨 SOS raccolto!';
    } else if(rd>=S0.until){ S0.gone = true; outLog += ' 🚨 Il segnale SOS si è spento: troppo tardi.'; }
  }
  if(C.mono && C.mono.length) C.st.monoBest = Math.max(C.st.monoBest||0, coopMonoActive());   // --- monoliti: massimo raggiunto (solo per mostrarlo)
}
function coopCheckTraps(){                            // un mostro fermo su una trappola è catturato (sparisce); ogni trappola si usa una volta
  const C = COOP; if(!C.traps || !C.traps.length) return;
  C.traps = C.traps.filter(t=>terr(t.c,t.r)==='fango');               // il fango demolito o ricostruito non è più una trappola
  const mp = players[C.mon];
  [...C.traps].forEach(t=>{
    const m = mp.units.find(u=>u.c===t.c && u.r===t.r && !u.boss && !u.golem);
    if(!m) return;
    removeEntity(m); C.traps.splice(C.traps.indexOf(t),1); C.st.trapped = (C.st.trapped||0)+1;
    events.push({t:'destroy',kind:'entity',at:[t.c,t.r]});
    outLog += ' 🕳️ TRAPPOLA! Un mostro è stato catturato.';
  });
}

// ================== GANCI (WRAPPER): si installano una volta sola, da coopInit ==================
// Le funzioni di drules.js e dai.js sono dichiarazioni globali: qui le si avvolge (come fa già dai.js con giveBotStart) senza modificare quei file.
// Fuori dalla modalità coop (COOP nullo o mappa non ancora costruita) ogni ganci passa subito alla funzione originale.
const coopGolemBlocks = (e,raw,att,opts) => !!(e && e.golem && raw>0 && !(att && att.demoBuff)     // il golem subisce solo: colpo Esplosivo (anche l'area), Demolizione (cover:false), nucleare
  && !(opts && opts.cover===false) && !(att && att.isStruct && raw>=NUKE_DAMAGE));
function coopTrackHit(e,att,res){                     // e = mostro (unità) colpito da att (con danno): fuoco incrociato, cavaliere solitario, cecchinaggio
  const C = COOP, ai = att ? ownerOf(att) : -1;
  if(!res || res.shield || !(res.dmg>0) || ai<0 || players[ai].monster) return;
  e.atk = e.atk || []; if(!e.atk.includes(att.id)) e.atk.push(att.id);   // chi lo ha ferito (qualsiasi entità dei giocatori)
  if(!att.isBase && !att.isStruct){                   // fuoco incrociato: unità diverse nello stesso giro
    const rd = coopRound();
    if(!e.xf || e.xf.rd!==rd) e.xf = {rd,ids:[]};
    if(!e.xf.ids.includes(att.id)) e.xf.ids.push(att.id);
    if(e.xf.ids.length>=COOP_CROSSFIRE_UNITS) C.st.crossfire = true;
  }
  if(res.dead){
    if(!att.isStruct && hexDist([att.c,att.r],[e.c,e.r])>=COOP_SNIPE_DIST) C.st.snipe = true;   // cecchinaggio: unità o base da lontano (non artiglieria né silo)
    if(!att.isBase && !att.isStruct && !att.impure && maxHp(e)>=COOP_BIG_HP && e.atk.every(id=>id===att.id)) C.st.knight = true;   // duello: unità "pura", nessun altro lo ha mai ferito
  }
}
let coopHooked = false;
function coopInstallHooks(){
  if(coopHooked) return; coopHooked = true;
  const on = () => !!COOP && !!COOP.built;
  const impure = e => { if(e && !e.isBase && !e.isStruct) e.impure = true; };       // carta usata o cura ricevuta: l'unità non può più essere il cavaliere solitario

  if(typeof dealDamage==='function'){
    const orig = dealDamage;
    dealDamage = function(e,raw,att,opts){
      if(!on()) return orig(e,raw,att,opts);
      if(coopGolemBlocks(e,raw,att,opts)) return {dmg:0,shield:true,dead:false,healed:0};   // golem: colpo annullato
      const mon = !e.isBase && !e.isStruct && players[COOP.mon].units.includes(e);
      const res = orig(e,raw,att,opts);
      if(mon) coopTrackHit(e,att,res);
      return res;
    };
  }
  if(typeof demolish==='function'){                   // Terraforming: una demolizione che toglie del fango
    const orig = demolish;
    demolish = function(u,c,r){
      const ui = on() ? ownerOf(u) : -1, mud = ui>=0 && !players[ui].monster && terr(c,r)==='fango' && !entitiesHere(c,r).length;
      const res = orig(u,c,r);
      if(mud && terr(c,r)!=='fango') COOP.st.mud = (COOP.st.mud||0)+1;
      return res;
    };
  }
  if(typeof construct==='function'){                  // Trappola: il fango costruito da un giocatore diventa una trappola (finché c'è la quest)
    const orig = construct;
    construct = function(u,c,r,build){
      const res = orig(u,c,r,build);
      if(on() && build && build.type==='terrain' && build.id==='fango' && coopHasQuest('trap')){ (COOP.traps = COOP.traps || []).push({c,r,by:step%NUM_PLAYERS}); }
      return res;
    };
  }
  if(typeof createUnit==='function'){                 // Super soldato: abilità al massimo con i 3 laboratori
    const orig = createUnit;
    createUnit = function(b,c,r,st,img){
      const res = orig(b,c,r,st,img);
      if(on() && !curPlayer().monster){
        const u = curPlayer().units[curPlayer().units.length-1];
        if(u && STATS.some(s=>LAB_BONUS[s.id]>0 && u.st[s.id]>=statBaseMax(s.id)+MAX_LABS_PER_TYPE*LAB_BONUS[s.id])) COOP.st.superSoldier = true;
      }
      return res;
    };
  }
  if(typeof heal==='function'){                       // cura ricevuta = unità non più "pura"
    const orig = heal;
    heal = function(u,c,r){ const ent = on() ? entityHere(c,r) : null; const res = orig(u,c,r); impure(ent); return res; };
  }
  if(typeof playCard==='function'){ const orig = playCard; playCard = function(e,slot){ if(on()) impure(e); return orig(e,slot); }; }
  if(typeof upgradeCard==='function'){ const orig = upgradeCard; upgradeCard = function(e,slot,alloc){ if(on()) impure(e); return orig(e,slot,alloc); }; }
  if(typeof airdrop==='function'){ const orig = airdrop; airdrop = function(e,c,r,slot){ if(on()) impure(e); return orig(e,c,r,slot); }; }
  if(typeof fortinoBuild==='function'){ const orig = fortinoBuild; fortinoBuild = function(e,c,r,slot){ if(on()) impure(e); return orig(e,c,r,slot); }; }
  if(typeof runAction==='function'){                  // il golem non si sposta, nemmeno con l'Airdrop dei mostri
    const orig = runAction;
    runAction = function(a,actor){
      if(on() && a && (a.t==='airdrop' || a.t==='move') && players[actor]){
        const e = players[actor].units.find(u=>u.id===a.ent);
        if(e && e.golem) return 'Il golem è di pietra: non si sposta.';
      }
      return orig(a,actor);
    };
  }
  if(typeof giveBotStart==='function'){               // dai.js tira a caso le abilità di tutte le unità dei bot a inizio partita: il golem deve restare com'è
    const orig = giveBotStart;
    giveBotStart = function(pi){
      orig(pi);
      const g0 = on() ? coopGolem() : null;
      if(g0 && pi===COOP.mon){ g0.st = {...COOP_GOLEM_STATS}; g0.hp = COOP_GOLEM_STATS.vita; }
    };
  }
  // ---- AI dei mostri (dai.js) ----
  if(typeof aiChooseAction==='function'){             // il golem sta fermo: spara se ha un bersaglio a tiro, altrimenti niente
    const orig = aiChooseAction;
    aiChooseAction = async function(e,st){
      if(on() && e && e.golem){ const shot = aiBestShot(e); return shot ? {t:'attack',ent:e.id,c:shot.c,r:shot.r} : null; }
      return orig(e,st);
    };
  }
  if(typeof aiTerrainBonus==='function'){ const orig = aiTerrainBonus; aiTerrainBonus = function(c,r){ return coopTrapAt(c,r) ? 0 : orig(c,r); }; }                // i mostri non "vedono" le trappole:
  if(typeof aiEntryCost==='function'){ const orig = aiEntryCost; aiEntryCost = function(c,r,sp,ar){ return coopTrapAt(c,r) ? 1 : orig(c,r,sp,ar); }; }       // per loro quel fango è una casella qualunque
  if(typeof quInstallHooks==='function') quInstallHooks();   // dquests.js: ganci delle quest di fazione (dopo tutti i ganci di questo file)
}

const coopShieldNote = () => coopQuestsDone()!==COOP_QUESTS_NEEDED ? '' :
  ((!COOP.bossSpawned || players[COOP.mon].units.some(u=>u.boss)) ? ' · 🛡️ Quest sufficienti! Lo scudo infinito della base obiettivo cadrà appena i boss saranno abbattuti.' : ' · 🛡️ Lo scudo infinito della base obiettivo è caduto!');
function coopCheckQuests(){
  const C = COOP;
  if(C.say){ outLog += C.say; C.say = ''; }            // messaggi messi in coda durante l'azione (ultimo boss, quest di fazione)
  if(!C.st.center) C.st.center = coopHumans().some(i=>players[i].units.some(u=>C.center.some(([c,r])=>u.c===c && u.r===r)));
  coopSurvivor();
  coopTick();                                          // quest nuove: ostaggio, SOS, monoliti
  C.quests.forEach(q=>{
    if(q.done || q.failed) return;
    if(q.id==='rescue_survivor' && C.survivorDead && !C.st.rescued){ q.failed = true; return; }
    if(q.id==='hostage' && C.st.hostageDead && !C.st.hostageFreed){ q.failed = true; return; }
    if(q.id==='sos' && C.sos && C.sos.gone && !C.st.sosDone){ q.failed = true; return; }
    const d = COOP_QUESTS[q.id];
    if(d.fails && d.fails(q)){ q.failed = true; outLog += ` ❌ Quest fallita: ${d.name()}.`; return; }   // quest di fazione che possono fallire (dquests.js)
    const [cur,tgt] = d.val();
    if(cur<tgt) return;
    q.done = true;
    const rw = d.reward;
    coopHumans().forEach(i=>{ if(!players[i].surrendered) addCredits(i,rw); });
    outLog += ` 🎯 QUEST COMPLETATA: ${d.name()} (+${rw}💰 a testa)` + (d.epilogo ? ` — 📜 ${d.epilogo}` : '.') + coopShieldNote();
  });
}
function coopAfterAction(){                           // dopo ogni azione: visuale, base finale scoperta, quest
  const C = COOP; if(!C || !C.built) return;
  coopMarkExplored();
  const fb = coopFinalBase();
  if(!C.bossSpawned && fb && C.expl[coopIdx(fb.c,fb.r)]) coopSpawnBosses();
  coopCheckTraps();
  coopCheckQuests();
}
function coopEndTurn(me){                             // a ogni fine turno: quest del drone, conteggi del turno
  const C = COOP; if(!C || !C.built) return;
  if(C.drone && !players[me].monster){
    players[me].units.forEach(u=>{
      const adj = hexDist([u.c,u.r],[C.drone.c,C.drone.r])<=1;
      u.droneT = (adj && !u.hurt) ? (u.droneT||0)+1 : 0;
      u.hurt = false;
      if(u.droneT>C.st.droneBest) C.st.droneBest = u.droneT;
    });
  }
  players.forEach(p=>p.units.forEach(u=>{ u.killsTurn = 0; }));
  coopAfterAction();
}
function coopCheckWin(){                              // sostituisce la vittoria della modalità war
  const C = COOP; if(!C || !C.built || phase!=='play') return;
  const hum = coopHumans();
  if(C.finalDead || !coopFinalBase()){
    phase = 'over'; winner = {i:hum.find(i=>!players[i].surrendered) ?? hum[0], why:'base nemica obiettivo distrutta', coop:'win'};
  } else if(hum.every(i=>players[i].bases.length===0)){
    phase = 'over'; winner = {i:C.mon, why:'tutte le basi dei giocatori sono state distrutte', coop:'lose'};
  }
}

// ================== INTERFACCIA ==================
let coopCollapsed = typeof window!=='undefined' && window.innerWidth<760;
let coopOpenQ = null;                                // quest di cui si sta leggendo la storia (tocca la riga per aprirla)
function coopFocus(){                                 // a inizio partita la vista si porta sulla propria base (poi si può zoomare e spostare come sempre)
  try{
    const mine = (typeof online!=='undefined' && online && players[seat]) ? players[seat] : players.find(p=>!p.monster && p.bases.length);
    const b = mine && mine.bases[0]; if(!b) return;
    Z = 2.4; S = fitS*Z;
    PX = CW/2 - (S*SQ3*((b.c-V.minC)+0.5*(b.r&1))+S*SQ3/2);
    PY = CH/2 - (S*1.5*(b.r-V.minR)+S);
    redraw();
  }catch(e){}
}
function coopRenderUI(){                              // pannello delle quest (in alto a sinistra sulla mappa)
  if(typeof document==='undefined') return;
  let el = document.getElementById('coopbox');
  if(!el){
    const st = document.createElement('style');
    st.textContent = `#coopbox{display:none;position:absolute;left:10px;top:52px;z-index:5;width:min(270px,70vw);padding:8px 10px;background:rgba(0,0,0,.74);border:1px solid #475569;border-radius:10px;font-size:12px;line-height:1.35}
    #coopbox .ch{font-weight:bold;cursor:pointer;user-select:none}
    #coopbox .cq{margin:4px 0;cursor:pointer}#coopbox .cs{color:#cbd5e1;font-size:11px;font-style:italic;margin:2px 0 4px 16px}#coopbox .cd{color:#4ade80}#coopbox .cf{color:#f87171;text-decoration:line-through}#coopbox .cm{color:#94a3b8;font-size:11px}`;
    document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'coopbox'; document.querySelector('main').appendChild(el);
    el.addEventListener('click',e=>{
      if(e.target.closest('.ch')){ coopCollapsed = !coopCollapsed; coopRenderUI(); return; }
      const q = e.target.closest('.cq'); if(q){ coopOpenQ = coopOpenQ===q.dataset.q ? null : q.dataset.q; coopRenderUI(); }   // tocca una quest: legge/chiude la sua storia
    });
  }
  if(!COOP || !COOP.built || !(phase==='cards' || phase==='play' || phase==='over')){ el.style.display = 'none'; if(phase==='colors') coopFocused = false; return; }
  const done = coopQuestsDone(), mp = players[COOP.mon];
  let h = `<div class="ch">🎯 Quest ${done}/${COOP.quests.length} · ne servono ${COOP_QUESTS_NEEDED} per far cadere lo 🛡️ scudo della base obiettivo ${coopCollapsed ? '▸' : '▾'}</div>`;
  if(!coopCollapsed){
    COOP.quests.forEach(q=>{
      const d = COOP_QUESTS[q.id], [cur,tgt] = d.val(), tx = d.txt ? d.txt() : `${Math.min(cur,tgt)}/${tgt}`;
      const dot = (d.fac && q.owner!==undefined && players[q.owner]) ? `<span style="color:${players[q.owner].color}">■</span> ` : '';   // quest di fazione: quadratino nel colore del giocatore
      h += `<div class="cq ${q.done?'cd':q.failed?'cf':''}" data-q="${q.id}">${q.done?'✅':q.failed?'❌':'⬜'} ${dot}${d.e} ${d.name()} <span class="cm">${q.done||q.failed?'':'('+tx+') '}+${d.reward}💰</span></div>`;
      if(coopOpenQ===q.id && d.story) h += `<div class="cs">${d.story}</div>`;
    });
    const boss = mp.units.filter(u=>u.boss).length, need = Math.max(0,COOP_QUESTS_NEEDED-done);
    const shield = !COOP.bossSpawned ? 'non ancora scoperta' : ((boss || need) ? `scudo infinito (${boss ? `boss vivi: ${boss}` : ''}${boss && need ? ' · ' : ''}${need ? `quest mancanti: ${need}` : ''})` : 'scoperta, scudo caduto!');
    h += `<div class="cm">🏚️ Basi mostri rimaste: ${mp.bases.filter(b=>!b.finalBase).length}/${COOP.lairs} · 🎯 Base obiettivo: ${shield}</div>`;
  }
  el.innerHTML = h; el.style.display = 'block';
  if(phase==='play' && !coopFocused){ coopFocused = true; coopFocus(); }
}

(function lobbyUI(){                                  // selettore "war / coop" di fianco a "Bot" nella prima schermata
  if(typeof document==='undefined') return;
  const bots = document.getElementById('lobBots'); if(!bots) return;
  if(!document.getElementById('lobMode')){
    bots.parentElement.insertAdjacentHTML('afterend',
      `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;"><label for="lobMode" style="font-size:14px;font-weight:bold;color:#e5e7eb;display:flex;align-items:center;gap:6px;"><span style="font-size:24px;line-height:1;display:inline-block;transform:scale(1.5);margin-right:4px;margin-bottom:4px;">⚙</span> Modalità</label>`
      + `<select id="lobMode" autocomplete="off" style="margin:0;padding:6px 16px;font-weight:bold;color:#00ff88;"><option value="war" selected style="color:#00ff88">WAR</option><option value="coop" style="color:#00aaff">COOP</option></select></div>`);
    bots.parentElement.parentElement.style.gap = '16px';
  }
  const mode = document.getElementById('lobMode'), lblBots = document.querySelector('label[for="lobBots"]');
  const setOpts = (sel,vals) => { const cur = sel.value; sel.innerHTML = vals.map(v=>`<option>${v}</option>`).join(''); sel.value = vals.map(String).includes(cur) ? cur : String(vals[0]); };
  function sync(){
    const coop = mode.value==='coop'; COOP_CFG.mode = coop ? 'coop' : 'war';
    const tone = coop ? '#00aaff' : '#00ff88';          // COOP blu, WAR verde
    mode.style.color = tone;
    ['lobN','lobBots','lobMode'].forEach(id=>{ const s = document.getElementById(id); if(s) s.style.borderColor = tone; });   // bordo di Giocatori, Basi nemiche/Bot e Modalità
    ['lobN','nPl'].forEach(id=>{ const s = document.getElementById(id); if(s) setOpts(s, coop ? [1,2,3,4,5,6] : [2,3,4,5,6]); });   // in coop si può giocare anche da soli contro i mostri
    const sb = document.getElementById('lobBots'); setOpts(sb, coop ? [1,2,3,4,5,6,7,8,9] : [0,1,2,3,4,5]);
    const nb = document.getElementById('nBot'); if(nb) setOpts(nb, coop ? [1,2,3,4,5,6,7,8,9] : [0,1,2,3,4,5]);
    if(lblBots) lblBots.innerHTML = `<span style="font-size:24px;line-height:1;display:inline-block;transform:scale(1.3);margin-right:2px;margin-bottom:2px;">🤖</span> ${coop ? 'Basi nemiche' : 'Bot'}`;
    const lbn = document.querySelector('label[for="lobN"]'); if(lbn) lbn.title = coop ? 'Giocatori umani (alleati)' : '';
  }
  mode.addEventListener('change',sync); sync();
})();
