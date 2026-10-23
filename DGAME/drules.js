/* ============================================================
   drules.js — NUCLEO DEL GIOCO: stato + regole + canale delle azioni
   ============================================================
   Qui dentro NON c'è nulla di grafico: niente document, niente canvas, niente
   finestre. Si può quindi caricare identico nel browser (come ora) e in Node
   (fase 2: il server). Il disegno e i menu stanno in DawnlorD-MP1.html e dcardsui.js.

   COME SI USA
     applyAction(azione, giocatore)   unico punto d'ingresso per ogni mossa:
         ritorna {ok:true, log, events}  oppure  {ok:false, err}
         - controlla che sia il turno di "giocatore" e che l'azione sia legale
         - poi modifica lo stato
     snapshot() / restore(s)           stato di gioco <-> oggetto JSON semplice
     newGame()                         prepara una partita (usa NUM_PLAYERS)

   AZIONI (campo t) — ent = id dell'entità (base, unità o edificio) del giocatore di turno
     fase tessere : {t:'placeTile', cand, rot}          cand = posizione scelta, rot = quarti di giro (0..3)
     fase colori  : {t:'chooseColor', color}
     fase basi    : {t:'placeBase', c, r}
     fase carte   : {t:'confirmCards', cards:[id,...]}
     fase di gioco: {t:'endTurn'}
                    {t:'move'|'attack'|'demolish'|'collect'|'heal', ent, c, r}
                    {t:'construct', ent, c, r, build:{type:'building'|'terrain', id}}
                    {t:'createUnit', ent, c, r, stats:{vita,passi,gittata,attacco}}
                    {t:'defend', ent}
                    {t:'structFire', ent, c, r, nuke, smoke}   (smoke = fumogeno dell'artiglieria)
                    {t:'domeShield', ent}                 (ricompra lo scudo di uno shield dome)
                    {t:'useCard', ent, slot} · {t:'airdrop', ent, slot, c, r}
                    {t:'fortino', ent, c, r, slot}  (slot solo al primo piazzamento) · {t:'cancelFortino', ent}
                    {t:'upgrade', ent, slot, alloc:{vita,passi,gittata,attacco}}
                    {t:'newCard', slot, card}
                    {t:'surrender'}                       (resa: vale anche fuori turno)

   STATO DI GIOCO (le variabili globali qui sotto): tiles, players, phase, step, curTile,
   corners, takenCorners, objHp, mineOwner, barOwner, empCells, smokeCells, nukeMarks, winner, nextId (+ NUM_PLAYERS).
   Tutto il resto (selezione, menu, zoom, anteprima della tessera...) è solo interfaccia.
   ============================================================ */

// ================== CONFIGURAZIONE ==================
const TILE = 12;            // lato di una tessera (esagoni): una tessera per giocatore
const ROCKS_PCT = 0.2;      // percentuale di esagoni con rocce (terreno a parte)
const TERRAIN_PCT = 0.4;    // percentuale di esagoni con tutti gli altri terreni
const RESOURCE_WEIGHT = 0.4; // peso delle risorse rispetto agli altri terreni (1 = come gli altri, 0.3 = circa il 66% in meno, 0 = nessuna)
const RES_MIN_PER_TILE = 3;   // risorse minime in ogni tessera
const RES_MAX_PER_TILE = 6;   // risorse massime in ogni tessera
const BASE_ZONE = 3;        // lato della zona base negli angoli (3x3)
const BASE_MIN_FREE = 1;    // esagoni adiacenti liberi richiesti per piazzare la base
const ACTIONS_PER_TURN = 3; // azioni di ogni base/unità a ogni turno
const TURN_SECONDS = 99;    // durata di ogni turno: scaduto il tempo il turno passa in automatico
const START_CREDITS = 9;    // crediti iniziali di ogni giocatore
const MAX_CREDITS = 99;     // massimo di crediti accumulabili: ciò che supera il tetto va perso
const addCredits = (pi,n) => { const p = players[pi], got = Math.max(0, Math.min(n, MAX_CREDITS - p.credits)); p.credits += got; return got; };   // aggiunge fino al tetto e ritorna quanto è stato davvero aggiunto
const NEW_UNIT_ACTIONS = 0; // azioni disponibili nel turno in cui l'unità (o la base) viene creata
const BASE_HP = 30;         // vita delle basi
const BASE_ATTACK = 2;      // attacco (danno) della base
const BASE_RANGE = 2;       // gittata della base
const DEMOLISH_COST = 3;      // azioni per ogni demolizione (sempre, qualunque bersaglio)
const DEMOLISH_DAMAGE = 7;    // danno fisso di ogni demolizione: terreni, edifici, basi e unità (anche alleate)
const RESOURCE_VALUE = 1;   // crediti guadagnati raccogliendo una risorsa
const TREASURE_VALUE = 30;  // crediti del tesoro nascosto sotto una roccia scelta a caso: distruggendo la roccia appare un 💰 da raccogliere con "Raccogli risorse"
const COLLECT_COST = 2;     // azioni richieste da "Raccogli risorse"
const BASE_INCOME = 1;      // risorse che ogni base produce a ogni fine turno del suo proprietario
const HEAL_AMOUNT = 1;      // vita restituita da una cura
const HEAL_COST = 1;        // azioni per ogni cura
const MAX_UNITS = 6;        // massimo di unità (basi escluse) per fazione
const KILL_REWARD = 4;      // risorse che la fazione di chi uccide ottiene per ogni unità nemica uccisa
const BASE_KILL_REWARD = 12; // crediti ottenuti distruggendo una base nemica
const MINE_INCOME = 1;      // risorse che ogni miniera produce a fine turno (solo la sua casella)
const SPOTTER_MULT = 2;     // moltiplicatore del danno di artiglieria e silo se una tua unità può DAVVERO colpire il bersaglio (linea retta, gittata, ostacoli, nebbia)
const SPOTTER_NEEDS_ACTIONS = false;   // true = lo spotter deve avere ancora almeno 1 azione per sparare
let NUM_PLAYERS = 2;        // 2..6 = numero di giocatori = numero di tessere
const BOT_BONUS = true;       // vantaggio iniziale dei bot (i giocatori umani non lo ricevono): unità già in campo e miniere già costruite
const BOT_START_UNITS = 4;    // unità con cui parte ogni bot, intorno alla sua base (gratis)
const BOT_START_STATS = {vita:2,passi:1,gittata:3,attacco:2};   // abilità di quelle unità
const BOT_START_MINES = 3;    // miniere già sue, sulle caselle risorse più vicine alla sua base
let NUM_BOTS = 0;           // quanti giocatori sono controllati dal computer (gli ultimi NUM_BOTS; il primo è sempre umano)

// Proprietà dei terreni: le regole si leggono da qui, non dal testo della legenda.
//  solid: invalicabile (salvo unità con Spettro)      moveCost: passi richiesti per entrare (default 1)
//  blocksShot: blocca il tiro che lo attraversa (a 2+ caselle; da adiacente si può sempre attaccare)
//  hitOnlyAdjacent: chi vi sta sopra si può colpire solo da caselle adiacenti
//  shootOnlyAdjacent: chi vi sta sopra può colpire solo caselle adiacenti
//  rangeBonus: gittata extra per chi vi sta sopra     damageReduction: danno subìto in meno
//  hp: vita dell'oggetto (default DEMOLISH_HP)
//  fog: nebbia (la carta EMP annulla la sua copertura)
//  noAttack: il terreno non subisce danno dagli attacchi normali (ma si può mirare lì: colpo a vuoto; chi vi sta sopra si colpisce con le regole di tiro)
//  oneStepOnly: chi vi sta sopra, al prossimo movimento, avanza di 1 sola casella (anche con più passi)
//  stopsMove: entrandoci il movimento si interrompe: ci si può fermare qui, ma non proseguire oltre (nello stesso movimento)
const EMPTY_BG = 'rgba(0,0,0,0.3)'; // sfondo neutro degli esagoni senza terreno: nero semi-trasparente (30%) sopra l'immagine di sfondo (dassets.js); senza immagine si usa EMPTY_BG_NOIMG
const TERRAINS = {
  acqua:    {e:'🌊', tint:'#1e3a5f', name:'Acqua',    rule:'è invalicabile, salvo con spettro', solid:true, noAttack:true},
  montagne: {e:'⛰️', tint:EMPTY_BG, name:'Montagne', rule:'Blocca il tiro, richiede 2 passi per entrare e interrompe il movimento, gittata +1', blocksShot:true, noAttack:true, moveCost:2, rangeBonus:1, stopsMove:true},
  copertura:{e:'🌲', tint:EMPTY_BG, name:'Copertura',rule:'Offre copertura, ricevi -1 danno, entrandoci il movimento si interrompe', damageReduction:1, stopsMove:true},
  nebbia:   {e:'☁️', tint:EMPTY_BG, name:'Nebbia',   rule:'Nella nebbia si può colpire ed essere colpiti solo dalle caselle adiacenti (vale anche per il fumogeno, che la crea per un turno su qualunque casella)', hitOnlyAdjacent:true, shootOnlyAdjacent:true, fog:true, noAttack:true},
  fango:    {e:'🟤', tint:EMPTY_BG, name:'Fango',    rule:'Entrandoci il movimento si interrompe; chi si trova nel fango, al prossimo movimento avanza di 1 sola casella (anche con più passi)', oneStepOnly:true, stopsMove:true, noAttack:true},
  rocce:    {e:'', tint:'#777', name:'Rocce',    rule:'Blocca il tiro ed è invalicabile, salvo con spettro', solid:true, blocksShot:true},
  risorse:  {e:'💎', tint:EMPTY_BG, name:'Risorse',  rule:'Si raccoglie 1 risorsa adiacente per azione (+1 credito); entrandoci il movimento si interrompe. Sopra si può costruire una miniera', stopsMove:true, noAttack:true},
  miniera:  {e:'⛏️', tint:EMPTY_BG, name:'Miniera',  rule:`Costruita sopra una risorsa: a fine turno dà ${MINE_INCOME} risorsa (solo la sua casella). Le unità ci possono passare (il movimento si interrompe). Passa al nemico se ha un'unità o una base nella casella o accanto e tu non hai accanto unità, basi o bunker`, stopsMove:true}
};
const PALETTE = [   // le 8 fazioni del vecchio gioco (constants.js: COLORS p1..p8, stessi colori); ogni giocatore sceglie la sua dopo aver creato la mappa (si gioca al massimo in 6)
  {name:'Verde',  color:'#00ff88'},
  {name:'Viola',  color:'#cc00ff'},
  {name:'Blu',    color:'#00aaff'},
  {name:'Giallo', color:'#ffd700'},   // nel vecchio gioco "Oro"
  {name:'Rosso',  color:'#ff3333'},
  {name:'Bianco', color:'#ffffff'},
  {name:'Grigio', color:'#999999'},
  {name:'Rosa',   color:'#ff69b4'}
];
const NO_COLOR = '#9ca3af';    // colore provvisorio finché il giocatore non ha scelto
// Abilità delle unità: il giocatore distribuisce i punti alla creazione; ogni punto si paga in crediti
const STATS = [   // color: colore del numero della caratteristica (sulla mappa, nel menu e nella creazione)
  {id:'vita',    label:'Vita',    e:'💚', color:'#22c55e', max:4, cost:2},   // verde
  {id:'passi',   label:'Passi',   e:'👣', color:'#ef4444', max:3, cost:3},   // rosso
  {id:'gittata', label:'Gittata', e:'🎯', color:'#3b82f6', max:6, cost:1},   // blu
  {id:'attacco', label:'Attacco', e:'⚔️', color:'#ffd700', max:3, cost:2}    // oro
];
const STAT_MIN = 1, STAT_MAX = 6;   // valore minimo e massimo di ogni abilità (il campo max di STATS ha la precedenza)
const statBaseMax = id => STATS.find(s=>s.id===id).max ?? STAT_MAX;   // massimo base della singola abilità (senza laboratori)
const statMax = (id,pi) => statBaseMax(id) + (pi>=0 && players[pi] ? labBonus(pi,id) : 0);   // massimo acquistabile dal giocatore pi: base + bonus dei suoi laboratori in piedi
const UNIT_BASE_COST = 1;           // costo di un'unità con tutte le abilità al minimo
const POINT_COST = 2;               // costo di un punto abilità se nella tabella STATS manca il campo cost
const statCost = id => STATS.find(s=>s.id===id).cost ?? POINT_COST;   // crediti per ogni punto oltre il minimo di quella abilità
const MIN_DAMAGE = 0;               // danno minimo di un attacco (dopo le riduzioni del terreno)
const UNITS_BLOCK_SHOT = false;     // true = la prima unità (amica o nemica) lungo la linea ferma il tiro
const DEMOLISH_HP = 7;              // vita di ogni oggetto del terreno demolibile (si può ridefinire per terreno con la proprietà hp)
const BUILD_TERRAIN_COST = 3;                         // azioni per costruire un terreno
const BUILD_FOG_COST = 2;                             // la nebbia costa meno degli altri terreni
const terrainBuildCost = id => id==='nebbia' ? BUILD_FOG_COST : BUILD_TERRAIN_COST;   // azioni per costruire quel terreno
// Costruzioni: terreni (tutti tranne quelli esclusi) ed edifici

const BUILD_EXCLUDED = ['risorse','miniera','rocce'];  // non costruibili come terreno (le rocce si ottengono solo con le barricate)
const BUILDABLE_TERRAINS = Object.keys(TERRAINS).filter(k=>!BUILD_EXCLUDED.includes(k));
// ---------- NUOVI EDIFICI: tutti i valori sono qui, cambiali a piacere ----------
// Bunker: si ferma e spara da solo (come la Difesa) a chi gli si ferma a tiro o lo attacca
const BUNKER_COST = 5;              // risorse
const BUNKER_ACTIONS = 2;           // azioni di chi lo costruisce
const BUNKER_HP = 7;                // vita (non si conquista; a inizio turno spara 1 volta a chi ha già a tiro)
const BUNKER_ATTACK = 2;            // danno del colpo automatico
const BUNKER_RANGE = 2;             // gittata (in linea retta, come le basi)
const BASE_EXTRA_TERRAINS = ['acqua'];   // terreni (oltre alla casella vuota) su cui si può costruire una base (fortezza)
const BUNKER_BLOCKED_TERRAINS = ['rocce','miniera'];   // terreni su cui il bunker NON si può costruire (su tutti gli altri sì: nebbia, montagne, acqua, fango, copertura, risorse)
// Laboratori: alzano il MASSIMO acquistabile di un'abilità quando crei un'unità (non cambiano le unità già create); ogni laboratorio in piedi somma il suo bonus
const LAB_HP = 7;                   // vita di ogni laboratorio
const LAB_ACTIONS = 3;              // azioni di chi lo costruisce
const LAB_ARMOR_COST   = 8, LAB_ARMOR_BONUS   = 1;   // lab armature: + massimo di vita
const LAB_WEAPONS_COST = 8, LAB_WEAPONS_BONUS = 1;   // lab armi:     + massimo di attacco
const LAB_ARMS_COST    = 8, LAB_ARMS_BONUS    = 1;   // lab braccia:  + massimo di gittata
const LAB_GAMBE_COST    = 8, LAB_GAMBE_BONUS    = 1;   // lab gambe:    + massimo di passi
const MAX_LABS_PER_TYPE = 3;        // quanti laboratori dello stesso tipo si possono costruire (i bonus si sommano)
const LAB_BONUS = {vita:LAB_ARMOR_BONUS, attacco:LAB_WEAPONS_BONUS, gittata:LAB_ARMS_BONUS, passi:LAB_GAMBE_BONUS};
// Artiglieria e silo missili: tiro indiretto su qualsiasi esagono nella fascia di gittata (ignora linee rette e ostacoli)
const ARTILLERY_COST = 12, ARTILLERY_ACTIONS = 3, ARTILLERY_HP = 2;
const ARTILLERY_MIN_RANGE = 4, ARTILLERY_MAX_RANGE = 8, ARTILLERY_DAMAGE = 1, ARTILLERY_SHOT_ACTIONS = 1;
const ARTILLERY_SHOT_CREDITS = 1;   // risorse per ogni colpo normale
const ARTILLERY_SMOKE_CREDITS = 1;  // risorse per ogni fumogeno (1 azione, come un colpo)
const SILO_COST = 24, SILO_ACTIONS = 3, SILO_HP = 7;
const SILO_MIN_RANGE = 1, SILO_MAX_RANGE = Infinity, SILO_DAMAGE = 2, SILO_SHOT_ACTIONS = 1;   // Infinity = ovunque sulla mappa
const SILO_SHOT_CREDITS = 4;        // risorse per ogni colpo
// Armi nucleari: sblocca il colpo nucleare per artiglieria e silo
const NUKE_BUILD_COST = 24, NUKE_ACTIONS = 3, NUKE_HP = 7;
const NUKE_SHOT_COST = 9;           // risorse per ogni colpo nucleare
const NUKE_DAMAGE = 9;              // danno nel punto d'impatto e nelle caselle intorno (anche alleati)
const NUKE_RADIUS = 2;              // 2 = punto d'impatto + tutte le caselle entro distanza 2
// Nuovi edifici: hangar, catena Forgia → Fabbrica → Top-tech, Shield dome
const HANGAR_COST = 6, HANGAR_ACTIONS = 3, HANGAR_HP = 7;
const HANGAR_JUMP_STEPS = 1;        // passi per andare da un hangar alleato a un altro hangar alleato (sempre 1 azione)
const FACTORY_COST = 15, FACTORY_ACTIONS = 3, FACTORY_HP = 7;   // sblocca artiglieria, bunker, laboratori, forgia
const FORGE_COST   = 20, FORGE_ACTIONS   = 3, FORGE_HP   = 7;   // (serve forgia) sblocca silo, fortezza, top-tech
const TOPTECH_COST = 25, TOPTECH_ACTIONS = 3, TOPTECH_HP = 7;   // (serve fabbrica) sblocca armi nucleari e shield dome
const DOME_COST = 8, DOME_ACTIONS = 3, DOME_HP = 7;             // shield dome
const DOME_SHIELD_COST = 4;         // crediti per creare uno scudo
const DOME_SHIELD_ACTIONS = 1;      // azioni per ogni scudo creato
const DOME_MAX_SHIELD = 3;          // scudi massimi PER OGNI CASELLA protetta: ogni scudo è monouso e uguale a quello della carta Scudo (l'EMP lo disattiva)
const DOME_RADIUS = 1;              // protegge sé stesso e le caselle entro questa distanza
const TECH_ARMOR_COST = 10;         // crediti per ogni armatura data dal top-tech
const TECH_ARMOR_ACTIONS = 1;       // azioni del top-tech per ogni armatura
const TECH_ARMOR_BONUS = 1;         // danno ricevuto in meno per ogni armatura (come la copertura)
const TECH_ARMOR_MAX = 3;           // armatura massima sullo stesso bersaglio (si somma al terreno)
const rangeText = (a,b) => b===Infinity ? 'ovunque sulla mappa' : (a===b ? `${a}` : `da ${a} a ${b}`);
const BUILDINGS = {
  barricata: {e:'🚧', label:'Barricata', actions:2, credits:0,  hp:2, rule:'Crea una roccia con 2 di vita.'},   // crea una roccia con 2 di vita
  miniera:   {e:'⛏️', label:'Miniera',   actions:2, credits:4, rule:`Si costruisce SOPRA una casella risorse adiacente. A fine turno dà ${MINE_INCOME} risorsa (solo quella della sua casella). Le unità ci possono passare. Passa al nemico se ha un'unità o una base nella casella o accanto e tu non hai accanto unità, basi o bunker.`},
  // edifici con vita propria (struct:true): vivono in players[i].structs. req = edificio che serve già avere per costruirlo
  hangar:      {e:'🛩️', label:'Hangar', struct:true, actions:HANGAR_ACTIONS, credits:HANGAR_COST, hp:HANGAR_HP,
                rule:`Vita ${HANGAR_HP}. Le tue unità ci possono entrare. Da un hangar alleato a un altro hangar alleato libero ci si muove con ${HANGAR_JUMP_STEPS} solo passo e 1 sola azione, a qualsiasi distanza.`},
  fabbrica:    {e:'🪔', label:'Forgia', struct:true, actions:FACTORY_ACTIONS, credits:FACTORY_COST, hp:FACTORY_HP,
                rule:`Vita ${FACTORY_HP}. Sblocca: artiglieria, bunker, i 4 laboratori e la fabbrica.`},
  bunker:      {e:'🌑', label:'Bunker', struct:true, req:'fabbrica', actions:BUNKER_ACTIONS, credits:BUNKER_COST, hp:BUNKER_HP, attack:BUNKER_ATTACK, range:BUNKER_RANGE, autoDefend:true, fires:true, anyTerrain:true, capturable:false,
                rule:`Vita ${BUNKER_HP}. Spara da solo (danno ${BUNKER_ATTACK}, gittata ${BUNKER_RANGE}) a chi gli si ferma a tiro o lo attacca, come la Difesa, e a inizio del tuo turno spara 1 volta a chi ha già a tiro. Con le azioni che gli restano si può selezionare e far sparare a mano (⚔️ Attacca, 1 azione, senza muoversi). Si costruisce su qualunque terreno (anche nebbia, montagne, acqua, fango). Non si può conquistare.`},
  labArmature: {e:'🔰', label:'Lab armature', struct:true, req:'fabbrica', actions:LAB_ACTIONS, credits:LAB_ARMOR_COST, hp:LAB_HP, lab:'vita', maxCount:MAX_LABS_PER_TYPE,
                rule:`Alza di ${LAB_ARMOR_BONUS} il massimo di vita acquistabile quando crei un'unità (si somma a ogni laboratorio uguale in piedi; le unità già create non cambiano). Vita ${LAB_HP}.`},
  labArmi:     {e:'⚔️', label:'Lab armi', struct:true, req:'fabbrica', actions:LAB_ACTIONS, credits:LAB_WEAPONS_COST, hp:LAB_HP, lab:'attacco', maxCount:MAX_LABS_PER_TYPE,
                rule:`Alza di ${LAB_WEAPONS_BONUS} il massimo di attacco acquistabile quando crei un'unità (si somma a ogni laboratorio uguale in piedi; le unità già create non cambiano). Vita ${LAB_HP}.`},
  labBraccia:  {e:'🦾', label:'Lab braccia', struct:true, req:'fabbrica', actions:LAB_ACTIONS, credits:LAB_ARMS_COST, hp:LAB_HP, lab:'gittata', maxCount:MAX_LABS_PER_TYPE,
                rule:`Alza di ${LAB_ARMS_BONUS} il massimo di gittata acquistabile quando crei un'unità (si somma a ogni laboratorio uguale in piedi; le unità già create non cambiano). Vita ${LAB_HP}.`},
  labGambe:    {e:'🦿', label:'Lab gambe', struct:true, req:'fabbrica', actions:LAB_ACTIONS, credits:LAB_GAMBE_COST, hp:LAB_HP, lab:'passi', maxCount:MAX_LABS_PER_TYPE,
                rule:`Alza di ${LAB_GAMBE_BONUS} il massimo di passi acquistabile quando crei un'unità (si somma a ogni laboratorio uguale in piedi; le unità già create non cambiano). Vita ${LAB_HP}.`},
  artiglieria: {e:'☄', label:'Artiglieria', struct:true, req:'fabbrica', actions:ARTILLERY_ACTIONS, credits:ARTILLERY_COST, hp:ARTILLERY_HP, shoots:true, smoke:true,
                minRange:ARTILLERY_MIN_RANGE, maxRange:ARTILLERY_MAX_RANGE, damage:ARTILLERY_DAMAGE, shotActions:ARTILLERY_SHOT_ACTIONS, shotCredits:ARTILLERY_SHOT_CREDITS, smokeCredits:ARTILLERY_SMOKE_CREDITS,
                rule:`Vita ${ARTILLERY_HP}. Tiro ${rangeText(ARTILLERY_MIN_RANGE,ARTILLERY_MAX_RANGE)} (indiretto), danno ${ARTILLERY_DAMAGE} (×${SPOTTER_MULT} se una tua unità può davvero colpire il bersaglio), ${ARTILLERY_SHOT_ACTIONS} azione e 💰${ARTILLERY_SHOT_CREDITS} per colpo. Può sparare anche un fumogeno (💰${ARTILLERY_SMOKE_CREDITS}): nebbia su qualunque casella fino al tuo prossimo turno. Si conquista come la miniera. Spara dal turno dopo la costruzione.`},
  forgia:      {e:'⚒️', label:'Fabbrica', struct:true, req:'fabbrica', actions:FORGE_ACTIONS, credits:FORGE_COST, hp:FORGE_HP,
                rule:`Vita ${FORGE_HP}. Sblocca: silo missili, fortezza e top-tech.`},
  silo:        {e:'🚀', label:'Silo missili', struct:true, req:'forgia', actions:SILO_ACTIONS, credits:SILO_COST, hp:SILO_HP, shoots:true,
                minRange:SILO_MIN_RANGE, maxRange:SILO_MAX_RANGE, damage:SILO_DAMAGE, shotActions:SILO_SHOT_ACTIONS, shotCredits:SILO_SHOT_CREDITS,
                rule:`Vita ${SILO_HP}. Tiro ${rangeText(SILO_MIN_RANGE,SILO_MAX_RANGE)}, danno ${SILO_DAMAGE} (×${SPOTTER_MULT} se una tua unità può davvero colpire il bersaglio), ${SILO_SHOT_ACTIONS} azione e 💰${SILO_SHOT_CREDITS} per colpo. Spara dal turno dopo la costruzione.`},
  fortezza:    {e:'🏰', label:'Fortezza',  req:'forgia', actions:3, credits:20, rule:'Crea una nuova base.'},         // crea una nuova base
  topTech:     {e:'🔬', label:'Top-tech', struct:true, req:'forgia', actions:TOPTECH_ACTIONS, credits:TOPTECH_COST, hp:TOPTECH_HP, techArmor:true,
                rule:`Vita ${TOPTECH_HP}. Sblocca: armi nucleari e shield dome. Selezionandolo puoi dare, per 💰${TECH_ARMOR_COST} (${TECH_ARMOR_ACTIONS} azione), a un'unità o base adiacente (anche nemica) +${TECH_ARMOR_BONUS} armatura permanente: −${TECH_ARMOR_BONUS} danno ricevuto, come la copertura, fino a ${TECH_ARMOR_MAX} (si somma al terreno).`},
  nucleare:    {e:'☢️', label:'Armi nucleari', struct:true, req:'topTech', actions:NUKE_ACTIONS, credits:NUKE_BUILD_COST, hp:NUKE_HP,
                rule:`Vita ${NUKE_HP}. Ogni colpo di artiglieria o silo può diventare nucleare (+💰${NUKE_SHOT_COST}): danno ${NUKE_DAMAGE} nel punto d'impatto e nelle caselle entro ${NUKE_RADIUS} (anche alleate). Lascia le sorgenti termali ♨️ nel punto d'impatto.`},
  domo:        {e:'🛡️', label:'Shield dome', struct:true, req:'topTech', dome:true, actions:DOME_ACTIONS, credits:DOME_COST, hp:DOME_HP,
                rule:`Vita ${DOME_HP}. Selezionandolo crei per 💰${DOME_SHIELD_COST} (${DOME_SHIELD_ACTIONS} azione) +1 scudo su ogni casella del dome e su quelle entro ${DOME_RADIUS} (fino a ${DOME_MAX_SHIELD} per casella). Ogni scudo è come quello della carta Scudo: annulla UN colpo qualunque (anche nucleare, anche amico) e si disattiva con l'EMP. Ogni casella ha i suoi scudi: colpendone una si scarica solo quello. Si può ricomprare.`}
};

// ================== CARTE: configurazione ==================
const CARDS_PER_PLAYER = 3;   // carte scelte da ogni giocatore
const EMP_DEBUFF_AP = 1;      // azioni tolte dall'EMP (valore provvisorio: nel progetto originale è GAME.EMP_DEBUFF_AP)
const EMP_RANGE = 3;          // distanza massima dell'EMP
const FORTINO_BUILDS = 4;     // barricate costruibili con il Fortino
const MEDIKIT_HEAL = 3;       // vita curata dal Medikit
const AIRDROP_COST = 3;       // azioni consumate dall'Airdrop
const DEFENSE_COST = 2;      // azioni richieste dall'azione speciale Difesa
const DEFENSE_EMOJI = '👁️';   // icona dell'azione speciale Difesa e del segnale sulla mappa
const NEW_CARD_COST = 10;     // risorse (crediti) per sostituire una carta già usata con una nuova scelta al momento

// ---------- DEFINIZIONE CARTE ----------
// apply(e) agisce sull'entità selezionata e restituisce il messaggio per il pannello.
// deferred = la carta si consuma solo quando l'effetto viene davvero eseguito (Airdrop, Fortino).
// async = apre un menu di scelta (Upgrade). noBase = non utilizzabile dalla base.
const CARDS = {
  C01: {id:'C01', name:'Blitz', icon:'⚡', color:'#FFD700',
    description:'La base o l\'unità selezionata ottiene subito +1 azione.',
    apply(e){ e.actions += 1; return '⚡ +1 azione!'; }},

  C02: {id:'C02', name:'Airdrop', icon:'🪂', color:'#a0ff00', noBase:true, deferred:true, apCost:AIRDROP_COST,
    description:`Trasporta la tua unità in qualsiasi esagono libero (consuma ${AIRDROP_COST} azioni). Non utilizzabile dalla base.`,
    apply(e){ return null; }},

  C03: {id:'C03', name:'Cecchino', icon:'🎯', color:'#ff3333',
    description:'+100% gittata base ed aggiunge +1 perforazione del bersaglio, colpendo anche quello successivo. Cumulabile, dura fino a fine turno.',
    apply(e){
      if(!e.sniperBuff){ e.originalRng = e.st.gittata; e.sniperBuff = true; e.pierceCount = 0; }
      e.pierceCount += 1;
      e.st.gittata += e.originalRng;
      return `🎯 PERFORAZIONE x${1+e.pierceCount}!`;
    }},

  C04: {id:'C04', name:'EMP', icon:'📡', color:'#ff00cc',
    description:`Tutte le unità, basi ed edifici nemici a distanza ${EMP_RANGE} perdono ${EMP_DEBUFF_AP} azioni (al loro prossimo turno), gli scudi (anche quelli degli Shield dome nemici entro la portata) e il buff Spettro. Inoltre annulla ogni nebbia (anche i fumogeni) entro distanza ${EMP_RANGE} fino alla fine del tuo turno: lì si spara oltre 1 casella anche da dentro la nebbia e si colpisce chi ci sta dentro.`,
    apply(e){
      const me = step%NUM_PLAYERS; let n = 0;
      players.forEach((p,i)=>{ if(isAlly(i,me)) return; [...p.units,...p.bases,...p.structs].forEach(u=>{   // unità, basi ed edifici (bunker compresi)
        if(hexDist([e.c,e.r],[u.c,u.r])>EMP_RANGE) return;
        u.empDebuff = (u.empDebuff||0) + EMP_DEBUFF_AP;
        u.revealed = true;                       // la nebbia non lo protegge più
        u.shielded = 0; u.spectreBuff = false;
        n++;
      }); });
      allHexes().forEach(([c,r])=>{ if(hexDist([e.c,e.r],[c,r])<=EMP_RANGE) empCells.set(key(c,r),me); });   // zona senza nebbia fino alla fine del tuo turno
      let ns = 0;                                                      // scudi dei dome nemici: ogni casella entro la portata perde i suoi scudi
      players.forEach((p,i)=>{ if(isAlly(i,me)) return; p.structs.forEach(s=>{ if(s.type!=='domo' || !s.cs) return;
        Object.keys(s.cs).forEach(k=>{ const [c,r] = k.split(',').map(Number); if(hexDist([e.c,e.r],[c,r])<=EMP_RANGE){ delete s.cs[k]; ns++; } });
      }); });
      return (n || ns) ? `📡 EMP: ${n} bersagli colpiti${ns ? ` · ${ns} scudi dei dome disattivati` : ''}!` : '📡 EMP: nebbia annullata (nessun bersaglio)';
    }},

  C05: {id:'C05', name:'Esplosivo', icon:'💥', color:'#ff8800',
    description:'+100% del tuo Danno base e 50% del danno totale alle caselle adiacenti (anche alleate). Cumulabile, dura fino a fine turno.',
    apply(e){
      if(!e.demoBuff){ e.originalDmg = e.st.attacco; e.demoBuff = true; e.demoCount = 0; }
      e.demoCount += 1;
      e.st.attacco += e.originalDmg;
      return `💥 DANNO x${e.demoCount+1}!`;
    }},

  C06: {id:'C06', name:'Spettro', icon:'👤', color:'#cc00ff', noBase:true,
    description:'Buff permanente: l\'unità può sempre muoversi dentro gli ostacoli e ignora le coperture nemiche. Resta finché l\'unità è viva (o viene rimosso da un EMP). Non utilizzabile dalla base.',
    apply(e){ e.spectreBuff = true; return '👻 SPETTRO PERMANENTE!'; }},

  C07: {id:'C07', name:'Scudo', icon:'🛡️', color:'#00ffff',
    description:'Annulla il prossimo attacco subito, resta anche nei turni successivi ed è cumulabile.',
    apply(e){ e.shielded = (e.shielded||0) + 1; return '🛡️ SCUDO POTENZIATO!'; }},

  C08: {id:'C08', name:'Fortino', icon:'🏰', color:'#00aaff', deferred:true,
    description:`Costruisci ${FORTINO_BUILDS} barricate ovunque sulla mappa (costo 0 azioni); su una barricata o roccia già presente ne rinforza la vita.`,
    apply(e){ e.fortinoBuilds = FORTINO_BUILDS; return `🏰 FORTINO x${FORTINO_BUILDS}!`; }},

  C09: {id:'C09', name:'MediBuff', icon:'💉', color:'#00ff88',
    description:`Medikit permanente: al primo danno subito (o subito, se già ferito) cura automaticamente fino a ${MEDIKIT_HEAL} vita, poi si esaurisce. Nel turno di attivazione: +1 a tutte le statistiche. Non cumulabile.`,
    apply(e){
      e.medikitBuff = true;
      if(!e.medTemp){                                  // bonus temporaneo, una sola volta
        e.medTemp = true;
        if(!e.isBase && !e.isStruct) e.st.passi += 1;   // base e bunker non ottengono passi (a fine turno il bonus si toglie solo alle unità)
        e.st.gittata += 1; e.st.attacco += 1; e.st.vita += 1; e.hp += 1;
      }
      const healed = e.hp < maxHp(e) ? medikit(e) : 0;
      if(healed) events.push({t:'medikit',late:true});   // solo per i suoni: seconda cura dopo 800 ms, come nel vecchio gioco
      return `💉 Medikit +1 a tutto${healed ? ` · curata ${healed} vita` : ''}`;
    }},

  C10: {id:'C10', name:'Upgrade', icon:'🧬', color:'#ffaa00', async:true,
    description:'Assegna permanentemente 1 punto statistica a base, unità o bunker. Permette di superare i limiti base!',
    apply(e,alloc){
      e.st.vita += alloc.vita; e.hp += alloc.vita;
      if(!e.isBase && !e.isStruct) e.st.passi += alloc.passi;  // basi e bunker non ottengono passi
      e.st.gittata += alloc.gittata; e.st.attacco += alloc.attacco;
      return '🧬 UPGRADE COMPLETATO!';
    }}
};

// ================== STATO DEL GIOCO ==================
let tiles, players, phase, step, curTile, cands, corners, takenCorners, winner = null, nextId = 1, themeSeed = 0;   // themeSeed: solo grafica (tema delle rocce), uguale per tutti i giocatori
let COOP = null;   // stato della modalità cooperativa (vedi dcoop.js); null = modalità war, tutto come prima
const teamOf = i => (!COOP || i<0 || !players[i]) ? i : (players[i].monster ? -2 : -3);   // in coop tutti gli umani sono una squadra sola, i mostri l'altra
const isAlly = (i,j) => teamOf(i)===teamOf(j);   // in war: solo se stesso
const unitCapReached = (p,b) => (COOP && p.monster) ? coopLairFull(p,b) : p.units.length>=MAX_UNITS;   // limite di unità: in coop i mostri hanno un limite per ogni base
let objHp = new Map(), mineOwner = new Map();
let treasureRock = null, treasures = new Map();   // tesoro: "c,r" della roccia che lo nasconde (lo sa solo il gioco) | caselle con il 💰 già apparso → crediti
let barOwner = new Map();   // barricate: "c,r" → giocatore che l'ha costruita (solo grafica: ogni fazione ha la sua immagine di barricata)
let empCells = new Map();   // caselle dove l'EMP annulla la nebbia: "c,r" → giocatore che l'ha lanciato (svanisce alla fine del suo turno)
let smokeCells = new Map(), nukeMarks = new Set(), rewardLog = [];   // smokeCells: "c,r" → giocatore che ha lanciato il fumogeno · nukeMarks: caselle con le sorgenti termali · rewardLog: premi per le uccisioni dell'azione in corso
let outLog = '';           // testo dell'ultima azione: canale di uscita, lo legge applyAction
let events = [];           // eventi per l'interfaccia (lampi, banner): li legge applyAction

const key = (a,b) => a+','+b;
const mod = (a,n) => ((a%n)+n)%n;
const curPlayer = () => players[step % NUM_PLAYERS];
const tileAt = (c,r) => tiles.get(key(Math.floor(c/TILE),Math.floor(r/TILE)));
const exists = (c,r) => !!tileAt(c,r);
const terr = (c,r) => { const t = tileAt(c,r); return t ? t.data[mod(r,TILE)][mod(c,TILE)] : undefined; };
// ---------- regole dei terreni (pronte per la fase di gioco) ----------
const FOG_PROPS = {hitOnlyAdjacent:true, shootOnlyAdjacent:true, fog:true};   // un fumogeno dà a una casella le proprietà della nebbia
const NO_FOG_PROPS = {hitOnlyAdjacent:false, shootOnlyAdjacent:false, fog:false};   // dentro la zona EMP la nebbia (terreno o fumogeno) non ha più effetto
const T = (c,r) => {
  const k = key(c,r), t = TERRAINS[terr(c,r)] || {};
  if(empCells.size && empCells.has(k)) return (t.fog || smokeCells.has(k)) ? {...t,...NO_FOG_PROPS} : t;   // l'EMP vince sulla nebbia
  return smokeCells.has(k) ? {...t,...FOG_PROPS} : t;
};   // proprietà del terreno di un esagono (fumogeno incluso)
const isSolid  = (c,r) => !!T(c,r).solid;                // invalicabile (salvo Spettro): qui non si piazza nulla
const moveCost = (c,r) => T(c,r).moveCost || 1;          // passi richiesti per entrare
const toCube = (c,r) => { const q = c-(r-(r&1))/2; return [q,r,-q-r]; };
const hexDist = ([c1,r1],[c2,r2]) => {
  const a = toCube(c1,r1), b = toCube(c2,r2);
  return Math.max(Math.abs(a[0]-b[0]),Math.abs(a[1]-b[1]),Math.abs(a[2]-b[2]));
};
function hexLine(a,b){                                   // esagoni attraversati dal segmento a→b (estremi inclusi)
  const n = hexDist(a,b), A = toCube(...a), B = toCube(...b), out = [];
  for(let i=0;i<=n;i++){
    const t = n ? i/n : 0;
    const x = A[0]+(B[0]-A[0])*t+1e-6, y = A[1]+(B[1]-A[1])*t+1e-6, z = A[2]+(B[2]-A[2])*t-2e-6;
    let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
    const dx = Math.abs(rx-x), dy = Math.abs(ry-y), dz = Math.abs(rz-z);
    if(dx>dy && dx>dz) rx = -ry-rz; else if(dy>dz) ry = -rx-rz; else rz = -rx-ry;
    out.push([rx+(ry-(ry&1))/2, ry]);
  }
  return out;
}
// a può attaccare b? Da adiacente sempre. A distanza no se chi spara (shootOnlyAdjacent) o chi è colpito
// (hitOnlyAdjacent) si trova in un terreno che lo vieta, o se un esagono intermedio blocca il tiro.
function canShoot(a,b,revealed=false){
  if(hexDist(a,b)<=1) return true;
  const tb = T(...b);
  if(T(...a).shootOnlyAdjacent || (tb.hitOnlyAdjacent && !(tb.fog && revealed))) return false;   // l'EMP rivela chi è nella nebbia
  return hexLine(a,b).slice(1,-1).every(([c,r])=>!T(c,r).blocksShot);
}
// fine regole dei terreni

function newGame(){                                  // prepara lo stato di una nuova partita (NUM_PLAYERS giocatori)
  tiles = new Map(); takenCorners = []; corners = [];
  players = Array.from({length:NUM_PLAYERS},(_,i)=>({color:NO_COLOR,name:`Giocatore ${i+1}`,bases:[],units:[],structs:[],credits:START_CREDITS,hadUnits:false,surrendered:false,bot:i>=NUM_PLAYERS-NUM_BOTS,cards:[],usedCards:{}}));
  phase = 'colors'; step = 0; outLog = ''; events = []; objHp = new Map(); mineOwner = new Map(); barOwner = new Map(); treasureRock = null; treasures = new Map(); empCells = new Map(); smokeCells = new Map(); nukeMarks = new Set(); rewardLog = []; winner = null; nextId = 1; themeSeed = Math.floor(Math.random()*1000000);
  COOP = null; coopInit();                           // modalità cooperativa (dcoop.js): se non è scelta lascia COOP = null
  startTurn();
}

// ---------- tessere ----------
function genTile(){
  const keys = Object.keys(TERRAINS).filter(k=>!['rocce','miniera'].includes(k)), cells = [...Array(TILE*TILE).keys()]; // le rocce hanno una quota a parte
  const pickTerrain = () => { let k; do k = keys[Math.random()*keys.length|0]; while(k==='risorse' && Math.random()>RESOURCE_WEIGHT); return k; };   // le risorse vengono tenute solo con probabilità RESOURCE_WEIGHT
  const shuffle = a => { for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];} return a; };
  shuffle(cells);
  const t = Array.from({length:TILE},()=>Array(TILE).fill(null));
  const nR = Math.round(cells.length*ROCKS_PCT), nO = Math.round(cells.length*TERRAIN_PCT);
  cells.forEach((k,i)=>{
    if(i<nR) t[k/TILE|0][k%TILE] = 'rocce';
    else if(i<nR+nO) t[k/TILE|0][k%TILE] = pickTerrain();
  });
  // ogni tessera ha da RES_MIN_PER_TILE a RES_MAX_PER_TILE caselle di risorse: si tolgono le eccedenze e si aggiungono le mancanti
  const res = [], others = [], empties = [];
  for(let i=0;i<TILE;i++) for(let j=0;j<TILE;j++){
    const k = t[i][j];
    if(k==='risorse') res.push([i,j]); else if(k===null) empties.push([i,j]); else if(k!=='rocce') others.push([i,j]);
  }
  shuffle(res); shuffle(others); shuffle(empties);
  const noRes = keys.filter(k=>k!=='risorse');
  while(res.length>RES_MAX_PER_TILE){ const [i,j] = res.pop(); t[i][j] = noRes[Math.random()*noRes.length|0]; }   // troppe: diventano un altro terreno
  while(res.length<RES_MIN_PER_TILE){ const c = others.length ? others.pop() : empties.pop(); if(!c) break; t[c[0]][c[1]] = 'risorse'; res.push(c); }   // poche: si prendono da altri terreni (poi da caselle vuote)
  return t;
}
// Ordine di costruzione: da un quadrato si aggiunge una colonna (orizzontale),
// poi una riga (verticale) fino a tornare quadrato, e così via.
// Una riga/colonna iniziata va completata prima di passare alla successiva.
function candidates(){
  if(!tiles.size) return [[0,0]];
  const ts = [...tiles.values()], xs = ts.map(t=>t.tx), ys = ts.map(t=>t.ty);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const W = x1-x0+1, H = y1-y0+1, out = [];
  if(tiles.size < W*H){            // linea in corso: restano solo le posizioni mancanti
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) if(!tiles.has(key(x,y))) out.push([x,y]);
  } else if(W<=H){                 // quadrato completo: nuova colonna a destra o a sinistra
    for(const x of [x1+1,x0-1]) for(let y=y0;y<=y1;y++) out.push([x,y]);
  } else {                         // rettangolo k x (k+1): nuova riga sotto o sopra
    for(const y of [y1+1,y0-1]) for(let x=x0;x<=x1;x++) out.push([x,y]);
  }
  return out;
}
function startTurn(){ curTile = genTile(); cands = candidates(); }     // la tessera generata resta com'è: la rotazione è una scelta del giocatore
function rotateTile(data,n){                         // n quarti di giro in senso orario (restituisce una copia)
  let t = data.map(row=>row.slice());
  for(let k=0;k<(n|0);k++){ const o = t; t = o.map((_,i)=>o.map((_,j)=>o[TILE-1-j][i])); }
  return t;
}
function cornerOptions(){
  const out = [], extra = [], hasOuter = new Set();
  tiles.forEach(t=>[[0,0],[1,0],[0,1],[1,1]].forEach(([cx,cy],i)=>{
    const dx = cx?1:-1, dy = cy?1:-1, nx = tiles.has(key(t.tx+dx,t.ty)), ny = tiles.has(key(t.tx,t.ty+dy));
    if(nx && ny) return;                                   // angolo interno: mai
    const c0 = t.tx*TILE+(cx?TILE-BASE_ZONE:0), r0 = t.ty*TILE+(cy?TILE-BASE_ZONE:0), hexes = [];
    for(let dr=0;dr<BASE_ZONE;dr++) for(let dc=0;dc<BASE_ZONE;dc++) hexes.push([c0+dc,r0+dr]);
    const o = {id:t.tx+','+t.ty+','+i, hexes, tile:t.tx+','+t.ty};
    if(!nx && !ny){ out.push(o); hasOuter.add(o.tile); } else extra.push(o);
  }));
  if(out.length>=NUM_PLAYERS) return out;
  extra.filter(o=>!hasOuter.has(o.tile)).forEach(o=>out.push(o));
  if(out.length<NUM_PLAYERS) extra.filter(o=>!out.includes(o)).forEach(o=>out.push(o));
  return out;
}
function neighbors(c,r){
  const d = (r&1) ? [[1,0],[-1,0],[1,-1],[0,-1],[1,1],[0,1]] : [[1,0],[-1,0],[0,-1],[-1,-1],[0,1],[-1,1]];
  return d.map(([dc,dr])=>[c+dc,r+dr]).filter(([a,b])=>exists(a,b));
}
function occupied(c,r){
  return !!(COOP && coopObjAt(c,r)) || players.some(p=>p.bases.some(b=>b.c===c&&b.r===r)||p.units.some(u=>u.c===c&&u.r===r)||p.structs.some(s=>s.c===c&&s.r===r));
}
const walkable = (c,r) => exists(c,r) && !isSolid(c,r) && !occupied(c,r);
const freeNeighbors = (c,r) => neighbors(c,r).filter(([a,b])=>walkable(a,b));
const validBase = (c,r) => exists(c,r) && !occupied(c,r) && (!isSolid(c,r) || BASE_EXTRA_TERRAINS.includes(terr(c,r))) && freeNeighbors(c,r).length >= BASE_MIN_FREE;   // la base si può piazzare anche sull'acqua (BASE_EXTRA_TERRAINS), ma con almeno un esagono libero accanto

function baseHexes(){                                // esagoni dove si può piazzare la base: zone d'angolo libere
  const s = new Set();
  corners.forEach(o=>{
    if(takenCorners.includes(o.id)) return;
    o.hexes.forEach(([c,r])=>{ if(validBase(c,r)) s.add(key(c,r)); });
  });
  if(s.size) return s;
  allHexes().forEach(([c,r])=>{ if(validBase(c,r)) s.add(key(c,r)); });   // mappa sfortunata: nessuna zona valida rimasta, vale qualsiasi esagono adatto
  return s;
}

const entities = p => [...p.bases, ...p.units];
const newBase = (c,r,actions=ACTIONS_PER_TURN) => ({id:nextId++,c,r,actions,isBase:true,hp:BASE_HP,st:{vita:BASE_HP,passi:0,gittata:BASE_RANGE,attacco:BASE_ATTACK}});
function resetActions(p){ entities(p).forEach(e=>{ e.actions = ACTIONS_PER_TURN; e.defending = false; }); p.structs.forEach(s=>{ s.actions = ACTIONS_PER_TURN; }); }   // il bunker resta sempre in difesa   // la difesa dura fino all'inizio del prossimo turno del proprietario
function zonePlayers(c,r){                          // chi ha qualcosa nella casella o accanto: pres = unità o basi, guard = unità, basi o bunker
  const pres = new Set(), guard = new Set();
  [[c,r],...neighbors(c,r)].forEach(([a,b])=>players.forEach((p,i)=>{
    if(p.units.some(u=>u.c===a&&u.r===b) || p.bases.some(x=>x.c===a&&x.r===b)){ pres.add(i); guard.add(i); }
    if(p.structs.some(s=>s.type==='bunker' && s.c===a && s.r===b)) guard.add(i);
  }));
  return {pres,guard};
}
function conqueror(c,r,owner){                       // chi conquista l'edificio in (c,r) di "owner" (-1 = nessuno): serve un nemico con unità o basi adiacenti e nessun altro (proprietario incluso) con unità, basi o bunker adiacenti
  const {pres,guard} = zonePlayers(c,r), tg = new Set([...guard].map(teamOf));   // si ragiona per squadre (in war ogni giocatore è una squadra)
  if(tg.has(teamOf(owner)) || tg.size!==1) return -1;  // contestato dal proprietario (o da un suo alleato) o da più nemici: non cambia
  const ft = [...tg][0], f = [...pres].find(i=>teamOf(i)===ft);
  return f===undefined ? -1 : f;
}
function updateMines(){                              // miniere e tutti gli edifici (tranne bunker e basi/fortezza) passano al nemico che li conquista
  let n = 0;
  mineOwner.forEach((o,cp)=>{
    const [c,r] = cp.split(',').map(Number), f = conqueror(c,r,o);
    if(f>=0){ mineOwner.set(cp,f); n++; }
  });
  players.forEach((p,o)=>[...p.structs].forEach(s=>{
    if(BUILDINGS[s.type].capturable===false) return;           // il bunker non si conquista
    const f = conqueror(s.c,s.r,o); if(f<0) return;
    p.structs.splice(p.structs.indexOf(s),1); players[f].structs.push(s);   // passa al conquistatore
    s.actions = 0; s.cs = {}; n++;                   // senza azioni fino al suo prossimo turno, scudi del dome azzerati (un laboratorio conquistato alza il massimale del nuovo proprietario)
  }));
  return n;
}
function checkWin(){                                 // vince chi ha distrutto tutte le unità nemiche o tutte le basi nemiche (controllo per ogni giocatore: il vincitore può non essere di turno, es. fuoco di reazione di un bunker)
  if(phase!=='play') return;
  if(COOP){ coopCheckWin(); return; }                // coop: si vince distruggendo la base obiettivo, si perde senza più basi
  const cur = step%NUM_PLAYERS;
  for(let k=0; k<NUM_PLAYERS; k++){                  // prima chi è di turno, poi gli altri
    const me = (cur+k)%NUM_PLAYERS;
    if(players[me].surrendered) continue;
    const foes = players.filter((p,i)=>i!==me);
    const noBases = foes.every(p=>p.bases.length===0);
    const noUnits = foes.every(p=>p.surrendered || (p.hadUnits && p.units.length===0));   // le unità contano solo se il nemico ne aveva create; chi si è arreso non ha più nulla
    if(noBases || noUnits){
      phase = 'over';
      winner = {i:me, why: noBases ? 'tutte le basi nemiche distrutte' : 'tutte le unità nemiche distrutte'};
      return;
    }
  }
}
function collectMines(pi){                           // a fine turno ogni miniera del giocatore dà MINE_INCOME risorse (solo la sua casella)
  let n = 0;
  mineOwner.forEach((o,cp)=>{
    if(o!==pi) return;
    const [c,r] = cp.split(',').map(Number);
    if(terr(c,r)==='miniera') n += MINE_INCOME;
  });
  return addCredits(pi,n);
}
function collectBases(pi){                           // a fine turno ogni base del giocatore produce BASE_INCOME risorse
  return addCredits(pi, players[pi].bases.length*BASE_INCOME);
}
function endTurn(){
  const me = step%NUM_PLAYERS, flips = updateMines(), got = players[me].surrendered ? 0 : collectMines(me), inc = collectBases(me);   // chi si è arreso non incassa dalle miniere
  cardsClearBuffs();                                 // bonus temporanei delle carte: scadono per tutti
  clearEmp(me);                                      // la zona EMP di chi finisce il turno svanisce adesso...
  players.forEach(p=>[...p.units,...p.bases,...p.structs].forEach(u=>{ u.revealed = false; }));   // ...e le unità non sono più "rivelate" (ogni EMP finisce col turno di chi l'ha lanciato: nessun altro EMP è attivo qui)
  step++;
  for(let g=NUM_PLAYERS; g>0 && players[step%NUM_PLAYERS].surrendered; g--){ clearSmoke(step%NUM_PLAYERS); step++; }   // chi si è arreso salta il turno: passa subito al prossimo
  const now = step%NUM_PLAYERS;
  resetActions(curPlayer());
  clearSmoke(now);                                   // i fumogeni del giocatore che inizia il turno svaniscono
  const volley = bunkerVolley(now);                  // i suoi bunker sparano 1 volta a chi hanno già a tiro
  outLog = [flips ? `⛏️ ${flips} edificio/i cambia proprietario.` : '', got ? `⛏️ Le miniere di ${players[me].name} raccolgono +${got}.` : '', inc ? `🏰 Le basi di ${players[me].name} producono +${inc}.` : '', cardsApplyEmp(curPlayer()), ...volley].filter(Boolean).join(' ');
  if(volley.length) checkWin();                      // un bunker può eliminare l'ultimo nemico
  if(COOP) coopEndTurn(me);                          // coop: quest del drone, conteggi del turno, visuale
}
const unitCost = d => UNIT_BASE_COST + STATS.reduce((a,s)=>a+statCost(s.id)*(d[s.id]-STAT_MIN),0);
// Bonus dei laboratori: alzano solo il massimo acquistabile (statMax); le abilità delle unità sono quelle scelte alla creazione
const countStructs = (p,type) => p.structs.filter(s=>s.type===type).length;
const labBonus = (pi,stat) => players[pi].structs.filter(s=>BUILDINGS[s.type].lab===stat).length * LAB_BONUS[stat];
const maxHp    = e => e.st.vita;                                     // vita massima
const moveOf   = u => u.st.passi;                                    // passi effettivi
const attackOf = e => e.st.attacco;                                  // attacco effettivo
const rangeOf = u => u.st.gittata + (T(u.c,u.r).rangeBonus||0);      // la montagna dà gittata extra
const entLabel = e => e.isBase ? 'Base' : e.isStruct ? BUILDINGS[e.type].label : 'Unità';
const hangarAt = (c,r,pi) => pi>=0 && players[pi].structs.some(s=>s.type==='hangar' && s.c===c && s.r===r);
const mobileAt = (c,r) => !!(COOP && coopObjAt(c,r)) || players.some(p=>p.units.some(v=>v.c===c&&v.r===r) || p.bases.some(b=>b.c===c&&b.r===r));
const blockedFor = (c,r,pi,spectre) => mobileAt(c,r) || players.some((p,i)=>p.structs.some(s=>s.c===c&&s.r===r && !(i===pi && (spectre || s.type==='hangar'))));   // l'unità non entra dove c'è qualcuno o un edificio nemico
function reachable(u){                               // esagoni raggiungibili con 1 azione: costo di ingresso totale <= passi; i terreni stopsMove (fango, montagne, copertura, risorse, miniera) si possono raggiungere ma non attraversare; partendo dal fango: 1 sola casella; da un hangar alleato si va a un altro hangar alleato libero con HANGAR_JUMP_STEPS passo
  const pi = ownerOf(u), oneStep = !!T(u.c,u.r).oneStepOnly;   // partendo dal fango non si prosegue oltre la prima casella
  const best = new Map([[key(u.c,u.r),0]]), q = [[u.c,u.r]];
  while(q.length){
    const [c,r] = q.shift(), d = best.get(key(c,r));
    neighbors(c,r).forEach(([a,b])=>{
      if(u.spectreBuff ? blockedFor(a,b,pi,true) : (isSolid(a,b) || blockedFor(a,b,pi))) return;   // lo Spettro attraversa gli ostacoli; gli altri no (né caselle occupate)
      const nd = d+(u.spectreBuff ? 1 : moveCost(a,b)), k = key(a,b);
      if(nd<=moveOf(u) && (!best.has(k) || nd<best.get(k))){ best.set(k,nd); if(!oneStep && !T(a,b).stopsMove) q.push([a,b]); }   // sui terreni stopsMove il percorso si ferma
    });
  }
  if(hangarAt(u.c,u.r,pi))                           // sono su un hangar alleato: posso andare in qualsiasi altro hangar alleato libero
    players[pi].structs.forEach(s=>{
      if(s.type!=='hangar' || (s.c===u.c && s.r===u.r) || mobileAt(s.c,s.r)) return;
      const k = key(s.c,s.r); if(!best.has(k) || best.get(k)>HANGAR_JUMP_STEPS) best.set(k,HANGAR_JUMP_STEPS);
    });
  best.delete(key(u.c,u.r)); return best;
}
// Si spara solo in linea retta: le 6 direzioni dei lati in comune (niente angoli né curve)
const DIRS = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];   // (dq,dr) in coordinate assiali
const enemyAt = (c,r) => {                           // unità o base nemica in (c,r)
  for(let i=0;i<players.length;i++){
    if(isAlly(i,step%NUM_PLAYERS)) continue;
    const v = players[i].units.find(v=>v.c===c&&v.r===r) || players[i].bases.find(v=>v.c===c&&v.r===r) || players[i].structs.find(v=>v.c===c&&v.r===r); if(v) return v;
  }
  return null;
};
const structCover = (v,c=v.c,r=v.r) => {              // edificio proprio che ripara un'unità con Spettro che ci sta sopra (come la roccia): ne prende i colpi normali; solo il Cecchino colpisce l'unità
  if(!v.spectreBuff || v.isBase || v.isStruct) return null;
  const p = players[ownerOf(v)]; return p ? (p.structs.find(s=>s.c===c&&s.r===r) || null) : null;
};
const rockAt = (c,r) => terr(c,r)==='rocce';          // casella di roccia: un'unità con Spettro al suo interno è protetta dai colpi normali (assorbe la roccia); solo il Cecchino la colpisce direttamente
const hitsTerrain = (c,r) => { const k = terr(c,r); return k!=null && !TERRAINS[k].noAttack; };   // oggetto del terreno attaccabile (roccia, copertura, miniera...)
// (c,r) è un bersaglio per chi spara da "from"? Unità o base nemica, oppure qualsiasi casella senza alleati (vuota, roccia, fango, acqua, montagna, risorse...):
// il tiro su un terreno "noAttack" si può fare (è un colpo a vuoto, il terreno non subisce danno). Solo la nebbia (terreno o fumogeno) impedisce il tiro da lontano,
// con o senza un'unità nemica nella casella (canShoot: l'EMP la annulla). Mai gli alleati.
function attackable(from,c,r){
  const v = enemyAt(c,r);
  if(v) return canShoot(from,[c,r],v.revealed);
  if(allyAt(c,r)) return false;
  return canShoot(from,[c,r]);
}
function firingLines(u){                             // esagoni lungo le 6 rette fino alla gittata + caselle attaccabili
  const [q0,r0] = toCube(u.c,u.r), cells = [], hits = [];
  const R = T(u.c,u.r).shootOnlyAdjacent ? 1 : rangeOf(u);   // nella nebbia si spara solo da adiacente
  DIRS.forEach(([dq,dr])=>{
    for(let i=1;i<=R;i++){
      const r = r0+dr*i, c = (q0+dq*i)+(r-(r&1))/2;
      if(!exists(c,r)) break;
      cells.push([c,r]);
      if(attackable([u.c,u.r],c,r)) hits.push({c,r});
      if(T(c,r).blocksShot || (UNITS_BLOCK_SHOT && occupied(c,r))) break;   // il tiro non va oltre
    }
  });
  return {cells,hits};
}
const targets = u => u.sniperBuff ? sniperLines(u).hits : firingLines(u).hits;   // il Cecchino ha linee proprie (cards.js)
function createUnit(b,c,r,st,img){                       // la base b spende 1 azione; l'unità costa unitCost(st) crediti
  const p = curPlayer(), cost = unitCost(st);
  p.units.push({id:nextId++,c,r,actions:NEW_UNIT_ACTIONS,st:{...st},img,hp:st.vita}); p.hadUnits = true;   // img: numero dell'immagine scelta (solo grafica)
  if(COOP && b.isBase) p.units[p.units.length-1].home = b.id;   // coop: serve per il limite di mostri di ogni base
  p.credits -= cost; b.actions--; outLog = `🏗️ Unità creata (costo ${cost}).`;
}
const objMaxHp = k => TERRAINS[k].hp || DEMOLISH_HP;
const setTerr = (c,r,k) => { tileAt(c,r).data[mod(r,TILE)][mod(c,TILE)] = k; };
function baseAt(c,r){                                // {pi,b} se in (c,r) c'è una base
  for(let pi=0;pi<players.length;pi++){
    const b = players[pi].bases.find(b=>b.c===c&&b.r===r); if(b) return {pi,b};
  }
  return null;
}
function demolishTargets(u){                         // qualsiasi casella adiacente con qualcosa: unità (anche alleate), basi, edifici o terreno
  if(u.actions < DEMOLISH_COST) return [];
  return neighbors(u.c,u.r).filter(([c,r])=>entitiesHere(c,r).length>0 || terr(c,r)!=null);
}
const demolishDamage = () => DEMOLISH_DAMAGE;        // danno fisso di una demolizione
function destroyTerrain(c,r){                        // l'oggetto del terreno sparisce; una miniera lascia la risorsa su cui era stata costruita
  const cp = key(c,r), wasRock = terr(c,r)==='rocce';
  setTerr(c,r,terr(c,r)==='miniera' ? 'risorse' : null); objHp.delete(cp); mineOwner.delete(cp); barOwner.delete(cp);
  if(wasRock && cp===treasureRock){ treasureRock = null; treasures.set(cp,TREASURE_VALUE); }   // la roccia col tesoro è crollata: appare il 💰
  events.push({t:'destroy',kind:'terrain',at:[c,r]});   // suoni (dassets.js) e grafica (dfx.js): crollo
}
function demolish(u,c,r){                            // DEMOLISH_COST azioni: toglie DEMOLISH_DAMAGE punti vita all'entità (se c'è) o al terreno; a 0 sparisce
  u.actions -= DEMOLISH_COST;
  const ent = entitiesHere(c,r)[0];
  if(ent){
    const pi = ownerOf(ent), nm = players[pi].name, lb = entLabel(ent), res = domeHit(c,r) ? {shield:true} : dealDamage(ent,DEMOLISH_DAMAGE,u,{cover:false});   // lo Scudo (carta o dome) vale, la copertura no
    if(res.shield) outLog = `🛡️ Scudo: demolizione annullata (${lb} di ${nm}).`;
    else if(res.dead) outLog = `🔨 ${lb} di ${nm} demolito/a!` + (ent.isBase && !players[pi].bases.length ? ' Non ha più basi.' : '');
    else outLog = `🔨 ${lb} di ${nm}: vita rimasta ${ent.hp}/${maxHp(ent)}.`;
    return;
  }
  if(domeHit(c,r)){ outLog = '🛡️ Scudo del dome: demolizione annullata.'; return; }
  const k = terr(c,r), t = TERRAINS[k], cp = key(c,r), hp = (objHp.get(cp) ?? objMaxHp(k)) - DEMOLISH_DAMAGE;
  if(hp<=0){ destroyTerrain(c,r); outLog = `🔨 Demolito: ${t.name}.`; }
  else { objHp.set(cp,hp); outLog = `🔨 ${t.name}: vita rimasta ${hp}/${objMaxHp(k)}.`; }
}
// Cura: +HEAL_AMOUNT vita (entro il massimo) a un'unità o base (anche nemica, o chi cura stesso) o a qualsiasi oggetto del terreno danneggiato (muri, miniere, ecc.), adiacenti
function healTargets(u){
  if(u.actions < HEAL_COST) return [];
  return [[u.c,u.r], ...neighbors(u.c,u.r)].filter(([c,r])=>{          // la propria casella e le 6 adiacenti
    const ent = entityHere(c,r);                                         // unità o base di qualsiasi giocatore
    if(ent) return ent.hp < maxHp(ent);
    const k = terr(c,r);
    return !!k && (objHp.get(key(c,r)) ?? Infinity) < objMaxHp(k);       // qualsiasi oggetto danneggiato (con un numerino)
  });
}
function heal(u,c,r){
  const ent = entityHere(c,r);
  u.actions -= HEAL_COST;
  if(ent){
    ent.hp = Math.min(maxHp(ent), ent.hp+HEAL_AMOUNT);
    outLog = `💚 ${ent===u ? 'Auto-cura' : entLabel(ent)+' di '+players[ownerOf(ent)].name+' curata'}: vita ${ent.hp}/${maxHp(ent)}.`;
    if(COOP) coopTame(ent,u);                        // coop: un mostro curato diventa alleato
    return;
  }
  const k = terr(c,r), cp = key(c,r), max = objMaxHp(k), hp = Math.min(max, objHp.get(cp)+HEAL_AMOUNT);
  if(hp>=max) objHp.delete(cp); else objHp.set(cp,hp);                          // a vita piena il numerino sparisce
  outLog = `💚 ${TERRAINS[k].name} riparato: vita ${hp}/${max}.`;
}
const collectTargets = u => u.actions>=COLLECT_COST ? neighbors(u.c,u.r).filter(([c,r])=>(terr(c,r)==='risorse' || treasures.has(key(c,r))) && !occupied(c,r)) : [];
function collect(u,c,r){                             // COLLECT_COST azioni = +RESOURCE_VALUE crediti; la risorsa resta disponibile. Il 💰 del tesoro invece sparisce
  u.actions -= COLLECT_COST;
  const cp = key(c,r), tv = treasures.get(cp);
  if(tv){ treasures.delete(cp); const g = addCredits(step%NUM_PLAYERS, tv); outLog = g ? `💰 Tesoro trovato: +${g} crediti!` : `💰 Tesoro trovato, ma i crediti sono già al massimo (${MAX_CREDITS}).`; return; }
  const got = addCredits(step%NUM_PLAYERS, RESOURCE_VALUE); outLog = got ? `💎 Raccolta: +${got} crediti.` : `💎 Raccolta: crediti già al massimo (${MAX_CREDITS}).`;
}
const constructTargets = (u,build) => neighbors(u.c,u.r).filter(([c,r])=>{   // build = {type,id}: la miniera va SOPRA una risorsa adiacente, il bunker su qualunque terreno (tranne BUNKER_BLOCKED_TERRAINS), tutto il resto su una casella vuota
  if(occupied(c,r)) return false;
  const b = build && build.type==='building' && own(BUILDINGS,build.id) ? BUILDINGS[build.id] : null;
  if(b && build.id==='miniera') return terr(c,r)==='risorse';
  if(b && build.id==='barricata') return terr(c,r)===null || ['fango','montagne','copertura','nebbia'].includes(terr(c,r))
    || (terr(c,r)==='rocce' && (objHp.get(key(c,r)) ?? Infinity) < objMaxHp('rocce'));   // barricata/roccia già presente: si rinforza solo se danneggiata (a vita piena non serve, eviti di sprecare azioni)
  if(b && b.anyTerrain) return !BUNKER_BLOCKED_TERRAINS.includes(terr(c,r));
  if(b && build.id==='fortezza') return terr(c,r)===null || BASE_EXTRA_TERRAINS.includes(terr(c,r));   // la base si può costruire anche sull'acqua
  return terr(c,r)===null;
});
function buildBlock(u,p,id){                         // motivo per cui un edificio non si può costruire ('' = si può)
  const b = BUILDINGS[id];
  if(b.req && !countStructs(p,b.req)) return 'req';   // serve già avere l'edificio richiesto (Forgia → Fabbrica → Top-tech)
  if(u.actions < b.actions) return 'azioni';
  if(p.credits < b.credits) return 'crediti';
  if(b.maxCount!==undefined && countStructs(p,id) >= b.maxCount) return 'max';
  return '';
}
function newStruct(type,c,r){                        // edificio con vita propria; per avere azioni (artiglieria, silo, dome) aspetta il turno dopo
  const b = BUILDINGS[type];
  return {id:nextId++,type,c,r,isStruct:true,actions:NEW_UNIT_ACTIONS,hp:b.hp,defending:!!b.autoDefend,...(b.dome ? {cs:{}} : {}),st:{vita:b.hp,passi:0,gittata:b.range||0,attacco:b.attack||0}};
}
// ---------- ARTIGLIERIA / SILO: tiro indiretto (qualsiasi esagono nella fascia di gittata) con colpo nucleare opzionale ----------
const hasNuclear = p => p.structs.some(s=>s.type==='nucleare');
const shotCredits = (s,nuke,smokeShot) => { const b = BUILDINGS[s.type]; return smokeShot ? (b.smokeCredits||0) : (b.shotCredits||0) + (nuke ? NUKE_SHOT_COST : 0); };   // risorse per un colpo (il nucleare si aggiunge al costo del colpo)
function shellTargets(s,nuke,smokeShot){
  const b = BUILDINGS[s.type], p = curPlayer();
  if(!b.shoots || s.actions < b.shotActions) return [];
  if(smokeShot && (!b.smoke || nuke)) return [];            // il fumogeno lo spara solo l'artiglieria
  if(nuke && !hasNuclear(p)) return [];
  if(p.credits < shotCredits(s,nuke,smokeShot)) return [];
  return allHexes().filter(([c,r])=>{ const d = hexDist([s.c,s.r],[c,r]); return d>=b.minRange && d<=b.maxRange; });   // qualunque casella nella fascia di gittata
}
const blastCells = (c,r) => allHexes().filter(([x,y])=>hexDist([c,r],[x,y])<=NUKE_RADIUS);
// Spotter: una unità di p può DAVVERO colpire (c,r) in questo momento? Si usano le stesse caselle del suo "Attacca" (targets):
// linea retta, gittata, ostacoli che bloccano il tiro, nebbia, Cecchino. Niente calcolo teorico sulla sola distanza.
const isSpotted = (p,c,r) => p.units.some(u=>(!SPOTTER_NEEDS_ACTIONS || u.actions>=1) && targets(u).some(h=>h.c===c && h.r===r));
function flash(cells,kind,from,at){ events.push({t:'flash',cells,kind,from,at}); }   // lampo sulle caselle colpite (kind = 'shell' | 'nuke'): colori e durata li decide l'interfaccia; from/at = edificio e casella d'impatto (volo, dfx.js)
function structFire(s,c,r,nuke,smokeShot){          // s spara su (c,r): normale, nucleare (colpisce anche intorno, fuoco amico incluso) o fumogeno (solo artiglieria)
  const p = curPlayer(), b = BUILDINGS[s.type], me = step%NUM_PLAYERS;
  if(!b.shoots || s.actions < b.shotActions) return;
  if(smokeShot && (!b.smoke || nuke)) return;
  if(nuke && !hasNuclear(p)) return;
  const cost = shotCredits(s,nuke,smokeShot);
  if(p.credits < cost) return;
  p.credits -= cost; s.actions -= b.shotActions;
  if(smokeShot){                                              // fumogeno: nebbia su qualunque casella fino al prossimo turno di chi lo spara
    smokeCells.set(key(c,r),me); flash([[c,r]],'smoke');
    outLog = `💨 Fumogeno: nebbia fino al prossimo turno di ${p.name}.`; return;
  }
  const spotted = !nuke && isSpotted(p,c,r);   // spotter: una tua unità può davvero colpire il bersaglio
  const dmg = nuke ? NUKE_DAMAGE : b.damage*(spotted ? SPOTTER_MULT : 1), area = nuke ? blastCells(c,r) : [[c,r]], acc = new Map(), gate = makeDomeGate();   // gate: lo scudo del dome di ogni casella colpita si scarica una volta sola
  const add = (k,v) => acc.set(k,(acc.get(k)||0)+v);          // chiave: entità oppure "c,r" per un oggetto del terreno
  area.forEach(([x,y])=>{
    const ents = entitiesHere(x,y), tk = terr(x,y);
    if(!ents.length && tk==null) return;                      // niente da colpire
    ents.forEach(ent=>add(ent,dmg)); if(tk!=null) add(key(x,y),dmg);   // colpisce tutto: unità, basi, edifici e terreno (anche montagne, acqua, nebbia, fango, risorse)
  });
  if(nuke) {
    // Lascia il cratere vulcanico solo nel punto esatto dell'impatto
    nukeMarks.add(key(c,r));
  }
  if(nuke) area.forEach(([x,y])=>gate(x,y));                   // il nucleare colpisce TUTTE le caselle dell'area: anche quelle vuote scaricano il loro scudo del dome (come quelle con unità o terreno)
  const tag = k => k.isBase ? ' (base)' : k.isStruct ? ' ('+BUILDINGS[k.type].label+')' : '';
  const parts = [];
  acc.forEach((raw,k)=>{
    if(typeof k==='string'){                                  // oggetto del terreno
      const [x,y] = k.split(',').map(Number), tk = terr(x,y);
      if(gate(x,y)){ parts.push(`${TERRAINS[tk].name}: 🛡️ annullato (dome)`); return; }   // scudo del dome su quella casella
      const left = hurtObject(x,y,raw,true);
      parts.push(`${TERRAINS[tk].name}: ` + (left>0 ? `vita ${left}/${objMaxHp(tk)}` : '☠ distrutto')); return;
    }
    const nm = players[ownerOf(k)].name + tag(k);
    if(gate(k.c,k.r)){ parts.push(`${nm}: 🛡️ annullato (dome)`); return; }
    const res = dealDamage(k,raw,s);
    parts.push(res.shield ? `${nm}: 🛡️ annullato` : `${nm}: −${res.dmg}` + (res.dead ? ' ☠ distrutta' : ` (vita ${k.hp}/${maxHp(k)})`) + (res.healed ? ` ✚+${res.healed}` : ''));
  });
  flash(area,nuke ? 'nuke' : 'shell',[s.c,s.r],[c,r]);
  outLog = (nuke ? '☢️ NUCLEARE! ' : b.e+' ') + (spotted ? `🔭 spotter ×${SPOTTER_MULT} · ` : '') + (parts.length ? parts.join(' · ') : 'Colpo a vuoto.');
}
function construct(u,c,r,build){                  // costruisce il terreno o l'edificio scelto (build = {type,id})
  const p = curPlayer(), cp = key(c,r);
  nukeMarks.delete(cp);                           // Rimuove il cratere nucleare se si costruisce qui
  if(build.type==='terrain'){ setTerr(c,r,build.id); u.actions -= terrainBuildCost(build.id); outLog = `🏗️ Costruito: ${TERRAINS[build.id].name}.`; }
  else {
    const b = BUILDINGS[build.id];
    u.actions -= b.actions; p.credits -= b.credits;
    if(build.id==='barricata'){
      if(terr(c,r)==='rocce'){                                   // già presente: rinforza sommando la vita (massimo objMaxHp)
        const max = objMaxHp('rocce'), hp = Math.min(max, (objHp.get(cp) ?? max) + b.hp);
        if(hp>=max) objHp.delete(cp); else objHp.set(cp,hp);     // a vita piena il numerino sparisce (come con la cura)
      } else { setTerr(c,r,'rocce'); objHp.set(cp,b.hp); barOwner.set(cp,step%NUM_PLAYERS); }
    }
    else if(build.id==='miniera'){ setTerr(c,r,'miniera'); objHp.delete(cp); mineOwner.set(cp,step%NUM_PLAYERS); }   // sopra la risorsa: la sostituisce, vita piena
    else if(build.id==='fortezza'){ p.bases.push(newBase(c,r,NEW_UNIT_ACTIONS)); if(COOP) COOP.st.forts++; }
    else if(b.struct){ p.structs.push(newStruct(build.id,c,r)); }
    outLog = `🏗️ Costruito: ${b.label}.`;
  }
}

// ================== CARTE: regole ==================
function cardBlock(e,p,slot){                         // motivo per cui la carta non è usabile ('' = usabile)
  const c = CARDS[p.cards[slot]];
  if(p.usedCards[slot]) return 'Già usata';
  if(c.noBase && e.isBase) return 'Non utilizzabile dalla base';
  if(e.isStruct && (c.noBase || c.deferred)) return 'Non utilizzabile dal bunker';   // il bunker non si muove né costruisce: Airdrop, Spettro e Fortino sarebbero carte sprecate (o rifiutate dal nucleo)
  if(c.apCost && e.actions < c.apCost) return `Servono ${c.apCost} azioni`;
  return '';
}
// ---------- AZIONI CON SCELTA DELL'ESAGONO ----------
function pickTreasureRock(){                         // a inizio partita: una roccia generata (non una barricata) nasconde il tesoro; nessun segno visibile
  const rocks = allHexes().filter(([c,r])=>terr(c,r)==='rocce' && !barOwner.has(key(c,r)));
  treasureRock = rocks.length ? key(...rocks[Math.random()*rocks.length|0]) : null;
}
function allHexes(){
  const out = [];
  tiles.forEach(t=>{ for(let i=0;i<TILE;i++) for(let j=0;j<TILE;j++) out.push([t.tx*TILE+j,t.ty*TILE+i]); });
  return out;
}
const airdropTargets = () => allHexes().filter(([c,r])=>walkable(c,r) && (!COOP || curPlayer().monster || coopExpl(c,r)));                                   // qualsiasi esagono libero
const fortinoTargets = () => allHexes().filter(([c,r])=>(!COOP || curPlayer().monster || coopExpl(c,r)) && !occupied(c,r) && (terr(c,r)===null || terr(c,r)==='rocce' || ['fango','montagne','copertura','nebbia'].includes(terr(c,r))));   // vuoto, barricata da rinforzare, o terreni sostituibili
function airdrop(e,c,r,slot){                       // slot = la carta Airdrop da consumare
  e.c = c; e.r = r; e.actions -= AIRDROP_COST; curPlayer().usedCards[slot] = true; outLog = '🪂 Atterrato!';
}
function fortinoBuild(e,c,r,slot){                 // slot = la carta Fortino, solo al primo piazzamento (consumata lì)
                          // gratis; sulla roccia/barricata esistente somma la vita
  const cp = key(c,r), hp = BUILDINGS.barricata.hp;
  nukeMarks.delete(cp);                            // Rimuove il cratere nucleare se si costruisce qui
  if(terr(c,r)==='rocce') objHp.set(cp,(objHp.get(cp) ?? objMaxHp('rocce')) + hp);
  else { setTerr(c,r,'rocce'); objHp.set(cp,hp); barOwner.set(cp,step%NUM_PLAYERS); }
  e.fortinoBuilds--; if(slot!==undefined) curPlayer().usedCards[slot] = true;
  outLog = `🏰 Fortino: ${e.fortinoBuilds} barricate rimaste.`;
}

// ---------- DANNO: scudo, copertura, Spettro, Medikit ----------
const ownerOf = e => players.findIndex(p=>p.units.includes(e) || p.bases.includes(e) || p.structs.includes(e));
function removeEntity(e){
  const pi = ownerOf(e), p = players[pi]; if(!p) return;
  const i = p.units.indexOf(e);
  if(i>=0) p.units.splice(i,1);
  else {
    const j = p.bases.indexOf(e);
    if(j>=0) p.bases.splice(j,1);
    else { const k = p.structs.indexOf(e); if(k>=0) p.structs.splice(k,1); }   // un laboratorio distrutto abbassa il massimale acquistabile (le unità già create restano com'erano)
  }
}
function medikit(e){                                  // cura fino a MEDIKIT_HEAL e si esaurisce
  const heal = Math.max(0, Math.min(MEDIKIT_HEAL, maxHp(e) - e.hp));
  e.hp += heal; e.medikitBuff = false; return heal;
}
// raw = danno grezzo. L'attaccante con Spettro ignora la copertura; lo Scudo annulla tutto e perde una carica.
function dealDamage(e,raw,att,opts={}){
  if(raw>0 && COOP && e.finalBase && coopFinalShield()) return {dmg:0,shield:true,dead:false,healed:0};   // coop: base obiettivo con scudi infiniti finché vive un boss
  if(raw>0 && e.shielded){ e.shielded--; return {dmg:0,shield:true,dead:false,healed:0}; }
  let d = raw;
  if(opts.cover!==false) d -= reductionOf(e);   // copertura del terreno + armatura del top-tech (come nel vecchio gioco lo Spettro NON le ignora; le salta solo la demolizione)
  d = Math.max(MIN_DAMAGE,d);
  e.hp -= d; if(COOP) coopOnHit(e,d);
  if(d>0) events.push({t:'hit',at:[e.c,e.r],by:att?ownerOf(att):-1});   // solo grafica (dfx.js)
  let healed = 0;
  if(d>0 && e.medikitBuff){ healed = medikit(e); events.push({t:'medikit'}); }   // auto-cura PRIMA del controllo di morte, come nel vecchio gioco: può salvare da un colpo letale
  const res = {dmg:d, shield:false, dead:e.hp<=0, healed};
  if(res.dead){
    const victim = ownerOf(e), wasUnit = !e.isBase && !e.isStruct, killer = att ? ownerOf(att) : -1;
    removeEntity(e);
    events.push({t:'destroy',kind:e.isStruct ? 'struct' : 'entity',at:[e.c,e.r]});   // suoni (dassets.js) e grafica (dfx.js): edificio = crollo, unità o base = esplosione
    if(COOP) coopOnDeath(e,victim,killer,att,wasUnit);   // coop: conteggi delle quest e fine della base finale
    if(wasUnit && killer>=0 && !isAlly(killer,victim)){     // ogni unità nemica uccisa: +KILL_REWARD risorse alla fazione dell'uccisore
      rewardLog.push(`${players[killer].name} +${addCredits(killer,KILL_REWARD)}`);
    }
    if(e.isBase && killer>=0 && !isAlly(killer,victim)){    // ogni base nemica distrutta: +BASE_KILL_REWARD risorse
      rewardLog.push(`${players[killer].name} +${addCredits(killer,BASE_KILL_REWARD)}`);
    }
  }
  return res;
}
function hurtObject(x,y,raw,force){                         // danno a un oggetto del terreno (roccia, copertura, miniera...); ritorna la vita rimasta
  const k = terr(x,y), t = TERRAINS[k]; if(!t || (t.noAttack && !force)) return 0;   // force: artiglieria, silo e nucleare danneggiano qualsiasi terreno
  const cp = key(x,y), hp = (objHp.get(cp) ?? objMaxHp(k)) - raw;
  if(hp<=0) destroyTerrain(x,y); else objHp.set(cp,hp);
  return hp;
}

// ---------- TIRO: normale, Cecchino (perforazione), Esplosivo (area) ----------
const entityHere = (x,y) => { for(const p of players){ const u = p.units.find(u=>u.c===x&&u.r===y) || p.bases.find(b=>b.c===x&&b.r===y) || p.structs.find(s=>s.c===x&&s.r===y); if(u) return u; } return null; };
const allyAt = (x,y) => { for(let i=0;i<players.length;i++){ if(!isAlly(i,step%NUM_PLAYERS)) continue; const p = players[i], v = p.units.find(u=>u.c===x&&u.r===y) || p.bases.find(b=>b.c===x&&b.r===y) || p.structs.find(s=>s.c===x&&s.r===y); if(v) return v; } return null; };
// Linee del Cecchino: ostacoli (roccia, montagna) e nemici visibili contano come bersagli (fino a 1+perforazioni);
// le caselle vuote sono bersagli per l'esplosione a mezz'aria. Come nel tiro normale, alleati e nemici nascosti
// nella nebbia NON fermano la linea: si scavalcano (i nascosti non sono bersagli; l'EMP li rivela).
const hiddenFrom = (u,c,r,d) => { const t = T(c,r); return t.hitOnlyAdjacent && d>1 && !(t.fog && u.revealed); };   // nemico u in (c,r) a distanza d: la nebbia lo protegge?
function sniperLines(a){
  const maxT = 1 + (a.pierceCount||0), cells = [], hits = [], [q0,r0] = toCube(a.c,a.r);
  const R = T(a.c,a.r).shootOnlyAdjacent ? 1 : rangeOf(a);
  DIRS.forEach(([dq,dr])=>{
    let n = 0;
    for(let d=1; d<=R; d++){
      const r = r0+dr*d, c = (q0+dq*d)+(r-(r&1))/2;
      if(!exists(c,r)) break;
      cells.push([c,r]);
      const t = T(c,r), u = enemyAt(c,r), obstacle = !!t.blocksShot;
      if(u && hiddenFrom(u,c,r,d)) continue;        // nemico nascosto nella nebbia: non è un bersaglio, ma la linea lo scavalca (come nel tiro normale)
      if(u){ hits.push({c,r}); if(++n>=maxT) break; }                      // unità o base nemica
      else if(obstacle){ hits.push({c,r}); if(++n>=maxT) break; }   // roccia, montagna...: il Cecchino le perfora (ognuna conta come un bersaglio)
      else if(allyAt(c,r)) continue;                // alleato: non si può colpire, ma non ferma la linea (come nel tiro normale)
      else if(!(t.hitOnlyAdjacent && d>1)) hits.push({c,r});               // qualsiasi altra casella (copertura, miniera, fango, acqua, vuota...: esplosione a mezz'aria); solo la nebbia da lontano no
    }
  });
  return {cells,hits};
}
function fire(a,c,r){                                 // a spara verso (c,r): costa 1 azione
  const dmg = attackOf(a), splash = Math.ceil(dmg/2), impacts = [], acc = new Map(), sheltered = new Set();   // sheltered: unità al riparo in una roccia colpita (il danno va alla roccia, ma la difesa risponde)
  const add = (k,v) => acc.set(k,(acc.get(k)||0)+v);          // chiave: entità oppure "c,r" per un ostacolo
  if(a.sniperBuff){
    const maxT = 1 + (a.pierceCount||0); let hits = 0;
    for(const [x,y] of hexLine([a.c,a.r],[c,r]).slice(1)){
      const u = enemyAt(x,y);
      if(u && hiddenFrom(u,x,y,hexDist([a.c,a.r],[x,y]))) continue;   // nemico nascosto nella nebbia: il colpo lo scavalca, senza danno e senza consumare perforazioni
      if(u){ add(u,dmg); impacts.push([x,y]); hits++; }
      else if(T(x,y).blocksShot){
        if(!T(x,y).noAttack) add(key(x,y),dmg);                       // roccia: subisce il danno; montagna: viene perforata senza subire danno
        impacts.push([x,y]); hits++;
      }
      if(hits>=maxT) break;
    }
    if(!impacts.some(([x,y])=>x===c&&y===r)){
      impacts.push([c,r]);                                            // esplosione a mezz'aria
      if(hitsTerrain(c,r)) add(key(c,r),dmg);                         // copertura, miniera... colpite nel punto d'impatto
    }
  } else {
    const u = enemyAt(c,r), cs = u && structCover(u);
    if(cs){ sheltered.add(u); add(cs,dmg); }                         // Spettro su un proprio edificio: il colpo lo prende l'edificio
    else if(u && !rockAt(c,r)) add(u,dmg);
    else { if(u) sheltered.add(u); if(hitsTerrain(c,r)) add(key(c,r),dmg); }
    impacts.push([c,r]);
  }
  if(a.demoBuff) impacts.forEach(([x,y])=>neighbors(x,y).forEach(([nx,ny])=>{      // 50% del danno intorno (fuoco amico incluso)
    events.push({t:'slash',at:[nx,ny],by:ownerOf(a)});                              // solo grafica (dfx.js)
    const ent = entityHere(nx,ny);
    const cs = ent && structCover(ent);
    if(cs){ sheltered.add(ent); add(cs,splash); }
    else if(ent && !rockAt(nx,ny)) add(ent,splash);
    else { if(ent) sheltered.add(ent); if(hitsTerrain(nx,ny)) add(key(nx,ny),splash); }
  }));
  a.actions--;
  const react = [];                                   // DIFESA: chi è in difesa risponde per primo; se l'aggressore muore il colpo non arriva
  const reactors = new Set([...acc.keys()].filter(k=>typeof k!=='string'));
  sheltered.forEach(v=>reactors.add(v));
  for(const k of reactors){
    const m = defenseShot(k,a); if(m) react.push(m);
    if(ownerOf(a)<0){ outLog = react.join(' · ') + ' · il colpo non arriva.'; return; }
  }
  const parts = [], gate = makeDomeGate();            // gate: lo scudo del dome di ogni casella colpita si scarica una volta sola
  acc.forEach((raw,k)=>{
    if(typeof k==='string'){                           // oggetto del terreno
      const [x,y] = k.split(',').map(Number), tk = terr(x,y);
      if(gate(x,y)){ parts.push(`${TERRAINS[tk].name}: 🛡️ annullato (dome)`); return; }   // scudo del dome su quella casella
      const left = hurtObject(x,y,raw);
      parts.push(`${TERRAINS[tk].name}: ` + (left>0 ? `vita ${left}/${objMaxHp(tk)}` : '☠ distrutto')); return;
    }
    const nm = players[ownerOf(k)].name + (k.isBase ? ' (base)' : k.isStruct ? ' ('+BUILDINGS[k.type].label+')' : '');
    if(gate(k.c,k.r)){ parts.push(`${nm}: 🛡️ annullato (dome)`); return; }
    const res = dealDamage(k,raw,a);
    parts.push(res.shield ? `${nm}: 🛡️ annullato` : `${nm}: −${res.dmg}` + (res.dead ? ' ☠ distrutta' : ` (vita ${k.hp}/${maxHp(k)})`) + (res.healed ? ` ✚+${res.healed}` : ''));
  });
  outLog = (react.length ? react.join(' · ')+' → ' : '') + (a.demoBuff ? '💥 ' : '⚔️ ') + (parts.length ? parts.join(' · ') : 'Colpo a vuoto.');
}

// ---------- DIFESA ----------
// Azione speciale "Difesa" (1 azione): l'entità resta in allerta (e.defending) fino all'inizio del prossimo turno del suo proprietario.
// Nei turni altrui spara per prima (gratis, senza limiti di volte): 1) a chi si ferma a tiro dopo uno spostamento o un Airdrop,
// 2) a chi la attacca, prima di subire il danno. Se il bersaglio muore, il suo movimento o il suo colpo non prosegue.
function defend(e){
  if(e.actions<DEFENSE_COST || e.defending) return;
  e.actions -= DEFENSE_COST; e.defending = true;
  outLog = `${DEFENSE_EMOJI} In difesa fino al tuo prossimo turno.`;
}
function canReact(d,t){                               // d può colpire t con le stesse regole del tiro normale (linee rette, gittata, ostacoli, nebbia)
  const [q0,r0] = toCube(d.c,d.r), R = T(d.c,d.r).shootOnlyAdjacent ? 1 : rangeOf(d);
  for(const [dq,dr] of DIRS){
    for(let i=1;i<=R;i++){
      const r = r0+dr*i, c = (q0+dq*i)+(r-(r&1))/2;
      if(!exists(c,r)) break;
      if(c===t.c && r===t.r) return canShoot([d.c,d.r],[c,r],t.revealed);
      if(T(c,r).blocksShot || (UNITS_BLOCK_SHOT && occupied(c,r))) break;
    }
  }
  return false;
}
function defenseShot(d,t){                            // d spara a t se è in difesa, nemico e a tiro: ritorna il testo per il log ('' = nessuno sparo)
  if(!d.defending || isAlly(ownerOf(d),ownerOf(t)) || (players[ownerOf(d)] && players[ownerOf(d)].surrendered) || !canReact(d,t)) return '';   // un bunker di chi si è arreso resta in mappa ma non spara più
  events.push({t:'shot',dist:hexDist([d.c,d.r],[t.c,t.r]),from:[d.c,d.r],to:[t.c,t.r],by:ownerOf(d),sniper:!!d.sniperBuff});   // suoni (dassets.js) e grafica (dfx.js)
  
  if(domeHit(t.c,t.r)) return `${DEFENSE_EMOJI} Difesa di ${players[ownerOf(d)].name}: 🛡️ annullato (dome)`;
  
  if(!d.sniperBuff && rockAt(t.c,t.r)){
    const left = hurtObject(t.c,t.r,attackOf(d));
    return `${DEFENSE_EMOJI} Difesa di ${players[ownerOf(d)].name}: Rocce colpite ` + (left>0 ? `(vita ${left}/${objMaxHp('rocce')})` : '☠ distrutte');
  }

  const cs = !d.sniperBuff && structCover(t);          // Spettro su un proprio edificio: lo colpisce al suo posto
  if(cs){
    const r2 = dealDamage(cs,attackOf(d),d);
    return `${DEFENSE_EMOJI} Difesa di ${players[ownerOf(d)].name}: ${BUILDINGS[cs.type].label} colpito ` + (r2.shield ? '🛡️ annullato' : `−${r2.dmg}` + (r2.dead ? ' ☠ distrutto' : ` (vita ${cs.hp}/${maxHp(cs)})`));
  }
  const res = dealDamage(t,attackOf(d),d);
  return `${DEFENSE_EMOJI} Difesa di ${players[ownerOf(d)].name}: ` + (res.shield ? '🛡️ annullato' : `−${res.dmg}` + (res.dead ? ' ☠ eliminato' : ` (vita ${t.hp}/${maxHp(t)})`) + (res.healed ? ` ✚+${res.healed}` : ''));
}
function defenseOnStop(m){                            // m si è fermato (spostamento o Airdrop): ogni nemico in difesa a tiro gli spara per primo
  const mi = ownerOf(m), out = [];
  for(let i=0;i<players.length && ownerOf(m)>=0;i++){
    if(isAlly(i,mi)) continue;
    for(const d of [...players[i].units,...players[i].bases,...players[i].structs]){   // anche i bunker (sempre in difesa)
      const s = defenseShot(d,m); if(s) out.push(s);
      if(ownerOf(m)<0) break;
    }
  }
  if(out.length) outLog += ' ' + out.join(' · ');
}

// ---------- NUOVE REGOLE: più entità per casella, fumogeni, shield dome, bunker a inizio turno ----------
const entitiesHere = (x,y) => { const out = []; ['units','bases','structs'].forEach(k=>players.forEach(p=>p[k].forEach(v=>{ if(v.c===x && v.r===y) out.push(v); }))); return out; };   // tutte le entità della casella (un'unità può stare su un hangar): prima unità, poi basi, poi edifici
function clearSmoke(pi){ [...smokeCells].forEach(([k,o])=>{ if(o===pi) smokeCells.delete(k); }); }
function clearEmp(pi){ [...empCells].forEach(([k,o])=>{ if(o===pi) empCells.delete(k); }); }   // la zona EMP di pi dura fino alla fine del suo turno (la chiama endTurn)
// i fumogeni di pi durano fino al suo prossimo turno
// ---------- SHIELD DOME: ogni casella protetta ha i suoi scudi (stessi della carta Scudo) ----------
// Lo stato sta nell'edificio: e.cs = {"c,r": numero di scudi}. Comprarne uno aggiunge +1 su OGNI casella del dome (fino a DOME_MAX_SHIELD per casella).
// Un colpo (di chiunque, anche amico, nucleare compreso) su una casella con scudi ne scarica UNO solo, di quella casella: le altre restano intatte.
function hexesWithin(c,r,R){                         // la casella e tutte quelle entro distanza R che esistono nella mappa
  const seen = new Map([[key(c,r),[c,r]]]); let ring = [[c,r]];
  for(let i=0;i<R;i++){ const nx = []; ring.forEach(([a,b])=>neighbors(a,b).forEach(([x,y])=>{ const k = key(x,y); if(!seen.has(k)){ seen.set(k,[x,y]); nx.push([x,y]); } })); ring = nx; }
  return [...seen.values()];
}
const domeZone = s => hexesWithin(s.c,s.r,DOME_RADIUS);                         // caselle protette dal dome s
const domeCs = s => s.cs || (s.cs = {});                                         // scudi per casella (crea l'oggetto se manca, es. vecchi salvataggi)
const domeLayers = s => Math.max(0,...Object.values(domeCs(s)));                // scudi della casella più carica
const domeFull = s => domeZone(s).every(([c,r])=>(domeCs(s)[key(c,r)]||0)>=DOME_MAX_SHIELD);   // tutte le caselle al massimo: non si può comprare altro
function domeHit(x,y){                               // true = uno scudo di dome su (x,y) ha annullato il danno (e si è scaricato)
  const k = key(x,y);
  for(const p of players) for(const s of p.structs){
    if(s.type!=='domo' || !s.cs || !(s.cs[k]>0)) continue;
    if(--s.cs[k]<=0) delete s.cs[k];
    return true;
  }
  return false;
}
function makeDomeGate(){                             // per un'azione sola: ogni casella colpita consuma al massimo UNO scudo, anche se ci sono più bersagli (unità + terreno)
  const seen = new Map(), gate = (x,y) => { const k = key(x,y); if(!seen.has(k)) seen.set(k,domeHit(x,y)); return seen.get(k); };
  return gate;
}
const reductionOf = e => (e.isStruct ? 0 : (T(e.c,e.r).damageReduction||0)) + (e.techArmor||0);   // danno in meno: copertura del terreno (unità e basi; gli edifici no) + armatura del top-tech
const techArmorTargets = s => (s.actions < TECH_ARMOR_ACTIONS || curPlayer().credits < TECH_ARMOR_COST) ? []
  : neighbors(s.c,s.r).filter(([c,r])=>{ const ent = entityHere(c,r); return ent && !ent.isStruct && (ent.techArmor||0) < TECH_ARMOR_MAX; });   // unità o basi adiacenti (di chiunque) non ancora al massimo
function techArmor(s,c,r){                           // il top-tech dà +TECH_ARMOR_BONUS armatura permanente al bersaglio
  const ent = entityHere(c,r);
  s.actions -= TECH_ARMOR_ACTIONS; curPlayer().credits -= TECH_ARMOR_COST;
  ent.techArmor = Math.min(TECH_ARMOR_MAX,(ent.techArmor||0)+TECH_ARMOR_BONUS);
  outLog = `🔰 ${entLabel(ent)} di ${players[ownerOf(ent)].name}: armatura ${ent.techArmor}/${TECH_ARMOR_MAX} (−💰${TECH_ARMOR_COST}).`;
}
function domeShield(e){                              // compra uno scudo (DOME_SHIELD_ACTIONS azioni, DOME_SHIELD_COST crediti): +1 su ogni casella della zona, fino al massimo
  e.actions -= DOME_SHIELD_ACTIONS; curPlayer().credits -= DOME_SHIELD_COST;
  const cs = domeCs(e), zone = domeZone(e); let n = 0;
  zone.forEach(([c,r])=>{ const k = key(c,r); if((cs[k]||0)<DOME_MAX_SHIELD){ cs[k] = (cs[k]||0)+1; n++; } });
  outLog = `🛡️ Shield dome: +1 scudo su ${n} caselle (−💰${DOME_SHIELD_COST}).`;
}
function bunkerVolley(pi){                           // a inizio turno ogni bunker di pi spara 1 volta a un nemico già a tiro (prima le unità, poi il più ferito)
  const out = [];
  [...players[pi].structs].forEach(s=>{
    const b = BUILDINGS[s.type]; if(!b.autoDefend || !players[pi].structs.includes(s)) return;
    const foes = [];
    players.forEach((p,i)=>{ if(!isAlly(i,pi)) [...p.units,...p.bases,...p.structs].forEach(t=>{ if(canReact(s,t)) foes.push(t); }); });
    if(!foes.length) return;
    const isU = t => (t.isBase||t.isStruct) ? 1 : 0;
    foes.sort((x,y)=>isU(x)-isU(y) || x.hp-y.hp || x.id-y.id);
    const t = foes[0]; events.push({t:'shot',dist:hexDist([s.c,s.r],[t.c,t.r]),from:[s.c,s.r],to:[t.c,t.r],by:pi,sniper:false});   // suoni (dassets.js) e grafica (dfx.js)
    const nm = players[ownerOf(t)].name + (t.isBase ? ' (base)' : t.isStruct ? ' ('+BUILDINGS[t.type].label+')' : '');
    
    if(domeHit(t.c,t.r)) {
      out.push(`${b.e} Bunker di ${players[pi].name} → ${nm}: 🛡️ annullato (dome)`);
    } else if(structCover(t)) {                      // Spettro su un proprio edificio: lo colpisce al suo posto
      const cs = structCover(t), r2 = dealDamage(cs,attackOf(s),s);
      out.push(`${b.e} Bunker di ${players[pi].name} → ${BUILDINGS[cs.type].label} colpito: ` + (r2.shield ? '🛡️ annullato' : `−${r2.dmg}` + (r2.dead ? ' ☠ distrutto' : ` (vita ${cs.hp}/${maxHp(cs)})`)));
    } else if(rockAt(t.c,t.r)) {
      const left = hurtObject(t.c,t.r,attackOf(s));
      out.push(`${b.e} Bunker di ${players[pi].name} → Rocce colpite: ` + (left>0 ? `vita ${left}/${objMaxHp('rocce')}` : '☠ distrutte'));
    } else {
      const res = dealDamage(t,attackOf(s),s);
      out.push(`${b.e} Bunker di ${players[pi].name} → ${nm}: ` + (res.shield ? '🛡️ annullato' : `−${res.dmg}` + (res.dead ? ' ☠ eliminato' : ` (vita ${t.hp}/${maxHp(t)})`)));
    }
  });
  return out;
}

// ---------- FINE TURNO ----------
function cardsClearBuffs(){                           // i bonus temporanei di TUTTI scadono al cambio turno (scudo ed EMP restano)
  // AGGIUNTO: ...p.structs per pulire anche il bunker
  players.forEach(p=>[...p.bases,...p.units,...p.structs].forEach(a=>{
    if(a.medTemp){
      // AGGIUNTO: !a.isStruct per evitare di togliere/dare passi al bunker
      if(!a.isBase && !a.isStruct) a.st.passi = Math.max(1,a.st.passi-1);
      a.st.gittata = Math.max(1,a.st.gittata-1); a.st.attacco = Math.max(1,a.st.attacco-1);
      a.st.vita = Math.max(1,a.st.vita-1); a.hp = Math.min(a.hp,maxHp(a));
      a.medTemp = false;
    }
    if(a.sniperBuff){ a.st.gittata = Math.max(1,a.st.gittata - a.originalRng*(a.pierceCount||1)); a.sniperBuff = false; }
    if(a.demoBuff){ a.st.attacco = Math.max(1,a.st.attacco - a.originalDmg*(a.demoCount||1)); a.demoBuff = false; a.demoCount = 0; }
    a.fortinoBuilds = 0; a.pierceCount = 0;
  }));
}
function cardsApplyEmp(p){                            // all'inizio del turno le entità colpite dall'EMP (unità, basi, edifici) perdono azioni
  let lost = 0;
  [...p.units,...p.bases,...p.structs].forEach(u=>{
    if(u.empDebuff>0){ u.actions = Math.max(0,u.actions-u.empDebuff); lost += u.empDebuff; u.empDebuff = 0; u.revealed = false; }
  });
  return lost ? `📡 EMP: ${p.name} perde ${lost} azioni.` : '';
}

function playCard(e,slot){                           // carte immediate (non Airdrop, Fortino, Upgrade)
  const p = curPlayer(), c = CARDS[p.cards[slot]];
  p.usedCards[slot] = true; outLog = c.apply(e)||''; events.push({t:'banner',card:c.id});
}
function upgradeCard(e,slot,alloc){
  outLog = CARDS.C10.apply(e,alloc); events.push({t:'banner',card:'C10'});
  curPlayer().usedCards[slot] = true;
}
function swapCard(slot,cardId){                    // sostituisce la carta già usata "slot" con "cardId"
  const p = curPlayer(), old = CARDS[p.cards[slot]], nw = CARDS[cardId];
  p.cards[slot] = cardId; delete p.usedCards[slot]; p.credits -= NEW_CARD_COST;
  outLog = `🃏 Nuova carta tattica: ${nw.icon} ${nw.name} al posto di ${old.name} (−${NEW_CARD_COST} 💰).`;
}

// ================== CANALE DELLE AZIONI ==================
// Ogni mossa di un giocatore arriva qui come oggetto {t:'...', ...}. Tutti i controlli di legalità
// stanno in questo punto: l'interfaccia può proporre solo mosse valide, ma chi decide è il nucleo.
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const findEnt = id => { const p = curPlayer(); return p.bases.find(e=>e.id===id) || p.units.find(e=>e.id===id) || p.structs.find(e=>e.id===id) || null; };   // entità del giocatore di turno
const entKind = e => e.isBase ? 'base' : e.isStruct ? 'struct' : 'unit';
const canFireStruct = e => !!e.isStruct && !!(BUILDINGS[e.type] && BUILDINGS[e.type].fires);   // edificio che spara a mano come una base (il bunker)
const inList = (list,c,r) => list.some(v => Array.isArray(v) ? v[0]===c && v[1]===r : v.c===c && v.r===r);

function actPlaceTile(a){                            // fase tessere: posizione scelta (cand) e rotazione (rot quarti di giro)
  if(phase!=='tiles') return 'Fase non valida.';
  if(!Number.isInteger(a.cand) || a.cand<0 || a.cand>=cands.length) return 'Posizione non valida.';
  if(!Number.isInteger(a.rot) || a.rot<0 || a.rot>3) return 'Rotazione non valida.';
  const [tx,ty] = cands[a.cand];
  tiles.set(key(tx,ty),{tx,ty,data:rotateTile(curTile,a.rot),owner:step%NUM_PLAYERS});
  step++;
  if(tiles.size>=NUM_PLAYERS){ phase='base'; step=Math.floor(Math.random()*NUM_PLAYERS); corners = cornerOptions(); }       // mappa completa: ogni giocatore sceglie la posizione della base, partendo da uno a caso
  else startTurn();
  return '';
}
function actChooseColor(a){                          // fase colori (è la PRIMA fase: fazione, poi mappa, poi basi)
  const c = PALETTE.find(x=>x.color===a.color);
  if(phase!=='colors' || !c || players.some(p=>p.color===a.color)) return 'Colore non disponibile.';
  const p = curPlayer(); p.color = c.color; p.name = (COOP && p.monster) ? 'Mostri' : c.name;       // da qui il giocatore si chiama come il suo colore (i mostri restano "Mostri")
  step++;
  if(step>=NUM_PLAYERS){ if(COOP) coopBuildMap(); else { phase = 'tiles'; step = 0; startTurn(); } }   // coop: mappa e basi generate subito, si passa alle carte       // tutti hanno scelto la fazione: si costruisce la mappa
  return '';
}
function actPlaceBase(a){                            // fase basi
  if(phase!=='base') return 'Fase non valida.';
  if(!Number.isInteger(a.c) || !Number.isInteger(a.r) || !baseHexes().has(key(a.c,a.r))) return 'Posizione non valida per la base.';
  const o = corners.find(o=>!takenCorners.includes(o.id) && o.hexes.some(([x,y])=>x===a.c&&y===a.r));
  curPlayer().bases.push(newBase(a.c,a.r)); if(o) takenCorners.push(o.id); step++;
  if(players.every(q=>q.bases.length>0)){ phase='cards'; step=0; }      // tutti hanno la base (step non parte più da 0, quindi si contano le basi)
  return '';
}
function giveBotStart(pi){
  if(COOP) return;                                   // coop: i mostri non partono con unità né miniere, se le creano                           // vantaggio dei bot: BOT_START_MINES miniere sulle risorse più vicine alla base e BOT_START_UNITS unità intorno alla base
  const p = players[pi]; if(!BOT_BONUS || !p.bot || !p.bases.length) return;
  const b = p.bases[0], near = hexesWithin(b.c,b.r,TILE).sort((x,y)=>hexDist([b.c,b.r],x)-hexDist([b.c,b.r],y));
  near.filter(([c,r])=>terr(c,r)==='risorse' && !occupied(c,r)).slice(0,BOT_START_MINES).forEach(([c,r])=>{
    setTerr(c,r,'miniera'); objHp.delete(key(c,r)); mineOwner.set(key(c,r),pi);
  });
  near.filter(([c,r])=>walkable(c,r) && !['risorse','miniera'].includes(terr(c,r))).slice(0,Math.min(BOT_START_UNITS,MAX_UNITS)).forEach(([c,r])=>{
    p.units.push({id:nextId++,c,r,actions:NEW_UNIT_ACTIONS,st:{...BOT_START_STATS},hp:BOT_START_STATS.vita}); p.hadUnits = true;
  });
}
function actConfirmCards(a){                         // fase carte: con meno di 3 carte si riempie con Blitz, come nell'originale
  if(phase!=='cards') return 'Fase non valida.';
  if(!Array.isArray(a.cards) || a.cards.length>CARDS_PER_PLAYER || !a.cards.every(id=>typeof id==='string' && own(CARDS,id))) return 'Carte non valide.';
  const p = curPlayer(), chosen = [...a.cards];
  while(chosen.length < CARDS_PER_PLAYER) chosen.push('C01');
  p.cards = chosen; p.usedCards = {};
  step++;
  if(step >= NUM_PLAYERS){ phase = 'play'; step = 0; pickTreasureRock(); players.forEach((_,i)=>giveBotStart(i)); resetActions(curPlayer()); if(COOP) coopAfterAction(); }
  return '';
}
// ---------- RESA ----------
// Chi si arrende perde subito tutte le unità e tutte le basi; miniere, edifici e terreni restano in mappa (i suoi edifici si possono conquistare, il bunker non spara più).
// Si può fare in qualsiasi momento della fase di gioco; quando tocca a lui il turno passa subito al prossimo (vedi endTurn). Se resta un solo giocatore, vince.
function surrender(pi){
  const p = players[pi], gone = [...p.units,...p.bases].map(e=>[e.c,e.r]);   // posizioni per le esplosioni (dfx.js)
  p.units.length = 0; p.bases.length = 0; p.surrendered = true;
  clearSmoke(pi); clearEmp(pi);                       // niente nebbia o EMP rimasti a metà: il suo turno non arriverà più
  gone.forEach(at=>events.push({t:'destroy',kind:'entity',at}));   // suoni (dassets.js: un solo suono) e grafica (dfx.js: un'esplosione per ciascuna)
}
function actSurrender(actor){
  if(phase!=='play') return 'Non puoi arrenderti adesso.';
  const p = players[actor]; if(!Number.isInteger(actor) || !p) return 'Giocatore non valido.';
  if(p.surrendered) return 'Ti sei già arreso.';
  const mine = actor === step%NUM_PLAYERS, msg = `🏳️ ${p.name} si arrende: unità e basi distrutte.`;
  surrender(actor);
  const left = players.map((q,i)=>i).filter(i=>!players[i].surrendered);
  if(left.length<=1){ phase = 'over'; winner = {i:left[0] ?? actor, why:'tutti gli avversari si sono arresi'}; outLog = msg; return ''; }
  if(mine){ endTurn(); outLog = msg + (outLog ? ' '+outLog : ''); }   // era il suo turno: passa subito al prossimo
  else outLog = msg;
  return '';
}
function afterAction(){                              // dopo ogni azione sulla mappa: miniere che cambiano mano e controllo vittoria
  const f = updateMines(); if(f) outLog += ` ⛏️ ${f} edificio/i cambia proprietario.`;
  if(COOP) coopAfterAction();                        // coop: visuale, boss della base finale, quest
  checkWin();
}
function runAction(a,actor){                         // ritorna '' se l'azione è stata eseguita, altrimenti il motivo del rifiuto
  if(!a || typeof a.t!=='string') return 'Azione non valida.';
  if(phase==='over') return 'La partita è finita.';
  if(a.t==='surrender') return actSurrender(actor);          // la resa si può fare anche fuori turno
  if(actor !== step%NUM_PLAYERS) return 'Non è il tuo turno.';
  switch(a.t){
    case 'placeTile':    return actPlaceTile(a);
    case 'chooseColor':  return actChooseColor(a);
    case 'placeBase':    return actPlaceBase(a);
    case 'confirmCards': return actConfirmCards(a);
  }
  if(phase!=='play') return 'Azione non valida in questa fase.';
  const p = curPlayer();
  if(a.t==='endTurn'){ endTurn(); return ''; }
  if(a.t==='newCard'){                               // sostituisce una carta già usata
    const used = p.cards.map((_,i)=>i).filter(i=>p.usedCards[i]);
    if(!Number.isInteger(a.slot) || !used.includes(a.slot) || typeof a.card!=='string' || !own(CARDS,a.card) || p.credits<NEW_CARD_COST) return 'Nuova carta non valida.';
    swapCard(a.slot,a.card); return '';
  }
  const e = findEnt(a.ent);
  if(!e) return 'Entità non valida.';
  const kind = entKind(e), mobile = kind!=='struct';           // mobile = base o unità (gli edifici hanno solo il tiro)
  const hex = Number.isInteger(a.c) && Number.isInteger(a.r) && exists(a.c,a.r);
  const slotOk = Number.isInteger(a.slot) && a.slot>=0 && a.slot<p.cards.length;
  switch(a.t){
    case 'move':
      if(kind!=='unit' || !hex || e.actions<1 || !reachable(e).has(key(a.c,a.r))) return 'Movimento non valido.';
      events.push({t:'move',id:e.id,from:[e.c,e.r],to:[a.c,a.r]});   // solo grafica (dfx.js)
      e.c = a.c; e.r = a.r; e.actions--; outLog = '🥾 Unità spostata.';
      defenseOnStop(e); afterAction(); return '';
    case 'attack':
      if(!(mobile || canFireStruct(e)) || !hex || e.actions<1 || !targets(e).some(v=>v.c===a.c&&v.r===a.r)) return 'Attacco non valido.';   // base, unità e bunker (edificio con fires) possono attaccare
      events.push({t:'shot',dist:hexDist([e.c,e.r],[a.c,a.r]),from:[e.c,e.r],to:[a.c,a.r],by:ownerOf(e),sniper:!!e.sniperBuff});   // suoni (dassets.js) e grafica (dfx.js)
      if(e.demoBuff) events.push({t:'boom'});                     // carta Esplosivo attiva: dopo lo sparo suona anche il boom (come nel vecchio gioco)
      fire(e,a.c,a.r); afterAction(); return '';
    case 'demolish':
      if(!mobile || !hex || !inList(demolishTargets(e),a.c,a.r)) return 'Demolizione non valida.';
      demolish(e,a.c,a.r); afterAction(); return '';
    case 'collect':
      if(!mobile || !hex || !inList(collectTargets(e),a.c,a.r)) return 'Raccolta non valida.';
      collect(e,a.c,a.r); afterAction(); return '';
    case 'heal':
      if(!mobile || !hex || !inList(healTargets(e),a.c,a.r)) return 'Cura non valida.';
      heal(e,a.c,a.r); afterAction(); return '';
    case 'construct': {
      const b = a.build;
      if(!mobile || !hex || !b || !inList(constructTargets(e,b),a.c,a.r)) return 'Costruzione non valida.';
      if(b.type==='terrain'){ if(typeof b.id!=='string' || !BUILDABLE_TERRAINS.includes(b.id) || e.actions<terrainBuildCost(b.id)) return 'Costruzione non possibile.'; }
      else if(b.type==='building'){ if(typeof b.id!=='string' || !own(BUILDINGS,b.id) || buildBlock(e,p,b.id)) return 'Costruzione non possibile.'; }
      else return 'Costruzione non valida.';
      construct(e,a.c,a.r,{type:b.type,id:b.id}); afterAction(); return '';
    }
    case 'createUnit': {
      if(kind!=='base' || !hex || e.actions<1 || !a.stats) return 'Creazione non valida.';
      const st = {};
      for(const s of STATS){ const v = a.stats[s.id]; if(!Number.isInteger(v) || v<STAT_MIN || v>statMax(s.id,actor)) return 'Abilità non valide.'; st[s.id] = v; }
      if(unitCapReached(p,e)) return 'Limite di unità raggiunto.';
      if(unitCost(st)>p.credits) return 'Crediti insufficienti.';
      if(!freeNeighbors(e.c,e.r).some(([x,y])=>x===a.c&&y===a.r)) return 'Esagono non valido.';
      const img = Number.isInteger(a.img) && a.img>=1 && a.img<=99 ? a.img : undefined;   // immagine scelta: solo grafica, non influenza le regole
      createUnit(e,a.c,a.r,st,img); afterAction(); return '';
    }
    case 'defend':
      if(!mobile || e.actions<DEFENSE_COST || e.defending) return 'Difesa non possibile.';
      defend(e); return '';
    case 'structFire': {
      const b = kind==='struct' ? BUILDINGS[e.type] : null, nuke = !!a.nuke, smk = !!a.smoke;
      if(!b || !b.shoots || (nuke && smk) || !hex || !inList(shellTargets(e,nuke,smk),a.c,a.r)) return 'Tiro non valido.';
      structFire(e,a.c,a.r,nuke,smk); afterAction(); return '';
    }
    case 'domeShield':
      if(kind!=='struct' || e.type!=='domo' || e.actions<DOME_SHIELD_ACTIONS || p.credits<DOME_SHIELD_COST || domeFull(e)) return 'Scudo non acquistabile.';
      domeShield(e); return '';
    case 'infect': {                                 // coop: infetta una base di mostri adiacente
      const m = coopInfect(e,kind,hex,a); if(m) return m;
      afterAction(); return '';
    }
    case 'techArmor':
      if(kind!=='struct' || e.type!=='topTech' || !hex || !inList(techArmorTargets(e),a.c,a.r)) return 'Armatura non applicabile.';
      techArmor(e,a.c,a.r); afterAction(); return '';
    case 'useCard': {                                // carte immediate
      // Permette l'uso su unità, basi OPPURE bunker
      if(!(mobile || (kind==='struct' && e.type==='bunker')) || !slotOk || cardBlock(e,p,a.slot)) return 'Carta non utilizzabile.';
      const c = CARDS[p.cards[a.slot]];
      if(c.async || c.deferred) return 'Carta non utilizzabile così.';
      playCard(e,a.slot); return '';
    }
    case 'airdrop':
      if(!mobile || !slotOk || p.cards[a.slot]!=='C02' || cardBlock(e,p,a.slot)) return 'Carta non utilizzabile.';
      if(!hex || !inList(airdropTargets(),a.c,a.r)) return 'Esagono non valido.';
      airdrop(e,a.c,a.r,a.slot); defenseOnStop(e); afterAction(); return '';
    case 'fortino': {
      if(!mobile || !hex || !inList(fortinoTargets(),a.c,a.r)) return 'Esagono non valido.';
      let slot;
      if(!(e.fortinoBuilds>0)){                      // primo piazzamento: serve la carta, che si consuma qui
        if(!slotOk || p.cards[a.slot]!=='C08' || cardBlock(e,p,a.slot)) return 'Carta non utilizzabile.';
        slot = a.slot; CARDS.C08.apply(e);
      }
      fortinoBuild(e,a.c,a.r,slot); afterAction(); return '';
    }
    case 'cancelFortino':                            // si rinuncia alle barricate rimaste (la carta resta consumata)
      if(!mobile) return 'Entità non valida.';
      e.fortinoBuilds = 0; return '';
    case 'upgrade': {
      // Consente l'uso su 'mobile' (unità/basi) OPPURE se il bersaglio è un bunker
      if(!(mobile || (kind==='struct' && e.type==='bunker')) || !slotOk || p.cards[a.slot]!=='C10' || cardBlock(e,p,a.slot) || !a.alloc) return 'Carta non utilizzabile.';
      const al = {}; let sum = 0;
      for(const s of STATS){ const v = a.alloc[s.id]; if(!Number.isInteger(v) || v<0) return 'Punti non validi.'; al[s.id] = v; sum += v; }
      if(sum!==1 || ((e.isBase || e.isStruct) && al.passi>0)) return 'Punti non validi.'; // blocca i passi per basi ed edifici
      upgradeCard(e,a.slot,al); return '';
    }
  }
  return 'Azione sconosciuta.';
}
function applyAction(a,actor){                       // actor = indice del giocatore che la invia
  outLog = ''; events = []; rewardLog = [];
  const err = runAction(a,actor);
  if(!err && rewardLog.length) outLog += (outLog ? ' ' : '') + '💰 ' + rewardLog.join(' · ');   // premi per le unità nemiche uccise
  return err ? {ok:false, err} : {ok:true, log:outLog, events};
}

// ================== SALVATAGGIO E RIPRISTINO DELLO STATO ==================
// snapshot() = tutto lo stato di gioco in un oggetto JSON semplice (è ciò che il server manderà ai client)
// restore(s) = rimette lo stato com'era. cands (posizioni possibili della tessera) si ricalcola da solo.
function snapshot(){
  return JSON.parse(JSON.stringify({NUM_PLAYERS, tiles:[...tiles.values()], players, phase, step, curTile, corners, takenCorners, objHp:[...objHp], mineOwner:[...mineOwner], barOwner:[...barOwner], treasureRock, treasures:[...treasures], empCells:[...empCells], smokeCells:[...smokeCells], nukeMarks:[...nukeMarks], winner, nextId, themeSeed, COOP}));
}
function restore(snap){
  const s = JSON.parse(JSON.stringify(snap));
  NUM_PLAYERS = s.NUM_PLAYERS; tiles = new Map(s.tiles.map(t=>[key(t.tx,t.ty),t])); players = s.players; phase = s.phase; step = s.step;
  curTile = s.curTile; corners = s.corners; takenCorners = s.takenCorners; objHp = new Map(s.objHp); mineOwner = new Map(s.mineOwner); barOwner = new Map(s.barOwner||[]); treasureRock = s.treasureRock||null; treasures = new Map(s.treasures||[]); empCells = new Map(s.empCells||[]); smokeCells = new Map(s.smokeCells||[]); nukeMarks = new Set(s.nukeMarks||[]); winner = s.winner; nextId = s.nextId; themeSeed = s.themeSeed||0; COOP = s.COOP||null; coopSync();
  cands = phase==='tiles' ? candidates() : [];
  outLog = ''; events = [];
}

