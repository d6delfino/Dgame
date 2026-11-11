'use strict';
/* AIRGRUNT · AGconf.js
   Unica fonte dei valori di gioco: mondo, armi, nemici, upgrade, difficoltà.
   Le armi sono definite UNA volta sola: giocatori e AI usano queste stesse armi, senza modifiche. */
const EXTRA_ICE=[   // stesso TURN usato da DawnlorD (dnet.js)
 {urls:'turn:global.relay.metered.ca:80',username:'0a099e5d0bdc770566e1b8be',credential:'/7ZvcHP2v8O7nit7'},
 {urls:'turn:global.relay.metered.ca:80?transport=tcp',username:'0a099e5d0bdc770566e1b8be',credential:'/7ZvcHP2v8O7nit7'},
 {urls:'turn:global.relay.metered.ca:443',username:'0a099e5d0bdc770566e1b8be',credential:'/7ZvcHP2v8O7nit7'},
 {urls:'turns:global.relay.metered.ca:443',username:'0a099e5d0bdc770566e1b8be',credential:'/7ZvcHP2v8O7nit7'}];
const VERSION='AIRGRUNT 1.1',PROTO=2,PEER_PREFIX='airgrunt-',
 PEER_OPTS={debug:1,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'},...EXTRA_ICE],iceCandidatePoolSize:10,iceTransportPolicy:'all'}};
// ---- mondo ----
const WW=6400,WH=6400,SEA=WW-440;       // area di gioco quadrata e linea media della costa
const START=[200,200],EXT=[260,260];    // partenza dei giocatori e punto di estrazione (genMap li sposta nell'angolo scelto dal seed)
// ---- base di partenza: uno dei 4 angoli (k: 0 alto-sx, 1 alto-dx, 2 basso-dx, 3 basso-sx) ----
// coordinate locali (u,v): l'angolo è (0,0), l'interno della mappa è verso u,v positivi
const BASE={k:0,xr:5700};              // xr: ascissa di riferimento sul lato destro (lascia ~140 px alla costa)
const BASE_W=640,BASE_H=620;           // piazzale u × v, centrato in (330,330)
const baseAng=a=>a+BASE.k*Math.PI/2;
function baseXY(u,v){switch(BASE.k){case 1:return[BASE.xr-v,u];case 2:return[BASE.xr-u,WH-v];case 3:return[v,WH-u];default:return[u,v]}}
function baseLoc(x,y){switch(BASE.k){case 1:return[y,BASE.xr-x];case 2:return[BASE.xr-x,WH-y];case 3:return[WH-y,x];default:return[x,y]}}
const inBase=(x,y,mg)=>{const l=baseLoc(x,y);return l[0]>-mg&&l[0]<BASE_W+20+mg&&l[1]>-mg&&l[1]<BASE_H+20+mg};
const TC=40;                            // cella della griglia di terreno (quota, acqua)
const GW=WW/TC,GH=WH/TC;
// ---- telecamera ----
const CAM={zoom:1.3,ref:1195.48,far:.65,edge:20,pan:400,margin:70};
const HUD_SCALE=.75;
// ---- armi: dmg per colpo (per tick per il lanciafiamme), cd = secondi tra due colpi, range in px, mag = caricatore, reload in s ----
const W_MG=0,W_CAN=1,W_FLM=2,W_RKT=3,W_SHG=4,W_NONE=5;
const WEAPONS=[
 {n:'Mitraglia  ',dmg:12,cd:.06,spread:.09,speed:760,range:540,mag:50,reload:2,pellets:1,camZ:1,sfx:'sfx/sfx-laser.mp3',vol:.5},
 {n:'Cannone  ',dmg:80,cd:1,spread:.01,speed:1800,range:1620,mag:1,reload:4,pellets:1,camZ:CAM.far,pierce:1,sfx:'sfx/shotgun.mp3',vol:1},
 {n:'Lanciafiamme  ',dmg:8,cd:.04,spread:0,speed:1,range:240,mag:150,reload:12,pellets:0,camZ:1,flame:1,arc:.5,sfx:'sfx/sfx-airdrop.mp3',vol:.25,sg:120},
 {n:'Lanciarazzi  ',dmg:120,cd:1,spread:.01,speed:400,range:600,mag:4,reload:12,pellets:1,camZ:.8,ex:90,sfx:'sfx/sfx-airdrop.mp3',vol:.5},
 {n:'Shotgun  ',dmg:16,cd:.1,spread:.175,speed:1140,range:389,mag:2,reload:2,pellets:8,camZ:1,sfx:'sfx/shotgun.mp3',vol:.6},
 {n:'Disarmato  ',dmg:0,cd:1,spread:0,speed:0,range:540,mag:0,reload:0,pellets:0,camZ:1}];
const EX_MIN=20/90;                      // danno ai bordi di un'esplosione, in frazione del danno al centro// --- scala e raggi di collisione ---
// MECH_SCALE: scala visiva e di hitbox del mech Grunt (giocatori) e del Mech nemico (k=1).
// PR_GRUNT / PR_AIR: raggio di HITBOX del giocatore a terra / in Air (colpi, mischia, esplosioni).
// ER_MECH: raggio di collisione del Mech nemico (k=1), coerente col disegno ridotto.
// PR_PUSH: ingombro FISICO del Grunt contro edifici/muri (push() in AGworld.js).
// PR_PUSH_DASH: ingombro durante lo scatto (dash → si passa nei vicoli stretti).
// NOTA: le costanti vanno PRIMA di UT perché la riga del Mech (r:22*MECH_SCALE) le legge.
const MECH_SCALE=0.75, PR_GRUNT=18*MECH_SCALE, PR_AIR=16, ER_MECH=22*MECH_SCALE;
const PR_PUSH=12, PR_PUSH_DASH=PR_PUSH*0.5;   // 12 px a riposo → 6 px durante il dash
// ---- tipi di nemico (k): hp, arma, raggio d'impatto, velocità, distanza di tiro, raffica (colpi) e pausa (s) ----
const UT=[
 {n:'Torretta',hp:240,w:W_MG,r:26,pr:26,fixed:1,rm:3,rate:.5,inf:1,lead:.5,err:1,arm:.3},
 {n:'Mech',hp:110,w:W_MG,r:22*MECH_SCALE,pr:18,spd:120,fast:150,hold:320,burst:[3,5],pause:[1,1.8],lead:.5,err:1,arm:.3},
 {n:'Jet',hp:80,w:W_MG,r:20,pr:20,fly:1,spd:110,hold:380,burst:[3,4],pause:[1.2,2.2],lead:.5,err:1,arm:.25},
 {n:'Kamikaze',hp:40,w:-1,r:18,pr:18,fly:1,spd:230,arm:.25,boom:{r:90,dmg:45,trig:40}},
 {n:'Cecchino',hp:90,w:W_CAN,r:20,pr:20,spd:70,hold:600,burst:[1,1],pause:[.3,.8],lead:1,err:.3,arm:.3,bsp:.7,rlm:.7,dmg:50},
 {n:'Carro pesante',hp:360,w:W_RKT,r:30,pr:26,spd:50,hold:420,burst:[2,3],pause:[1.5,2.5],lead:.5,err:1,arm:1},
 {n:'Bersaglio d\u2019\u00e9lite',hp:900,w:W_MG,w2:W_SHG,r:40,pr:30,spd:130,hold:360,burst:[4,6],pause:[.5,1],lead:.5,err:1.5,arm:1},
 {n:'Infiltrato civile',hp:20,w:W_MG,r:14,pr:10,spd:90,hold:320,burst:[3,5],pause:[1,1.8],lead:.5,err:1,arm:0},
 {n:'Guardia',hp:20,w:W_MG,r:14,pr:10,spd:90,hold:320,burst:[3,5],pause:[1,1.8],lead:.5,err:1,arm:0}];
const UK_HUM=7;                          // da questo indice in poi: unità "omino" (infiltrati k=7 e guardie k=8)
UT.forEach(u=>{u.sight=u.w>=0?WEAPONS[u.w].range*(u.rm||1)*1.2:900});
const ARM_MIN=4,ARM_MAX=12;             // corazza dei nemici: ogni danno subito cala di tanti punti (minimo 1)
const KAMI_ER=UT[3].boom.r;
// quantità di nemici (fisse: la difficoltà NON le cambia)
const N_TUR=16,N_SQUAD=9,N_FLY=2,N_RUSH=6,N_SNIP=4,N_TANK=3;
const N_INF=10,N_GRD=8;                  // infiltrati civili e guardie (travestiti da omini)
const N_CIV_P=70,N_CIV_V=22,CIV_PEN=1;   // civili: omini sulle strade, veicoli, kill tolte per ogni civile ucciso
const N_CIV_B=90,N_CIV_W=110,CIV_GRP=[2,5];   // omini intorno agli edifici; omini sparsi ovunque sulla mappa, a gruppetti di 2-5
const CIV_SITE={c:1,n:1,a:1,i:2,k:2,y:2,p:2},CIV_SITE_N={1:[6,10],2:[8,14]};   // tipo di sito → classe di omini: 1 militari (caserme, silos, aeroporto), 2 operai (industrie, centrale, cantiere, porto); [min,max] omini fissi per sito
const N_ARM=2,ARM_R=80;                  // armerie: quante, distanza massima dal muro per usarle
const SAFE_R=1700,ALERT_R=500,LOST_T=10,SEARCH_N=3,SEARCH_LEAD=1.5,RECALL_T=15,RECALL_MUL=.3; // distanza minima dalla partenza, raggio di allarme, secondi di ricerca; punti da ispezionare e anticipo (s) lungo la direzione del bersaglio; finestra di "allerta ancora viva" (s) e moltiplicatore del tempo di reazione
// ---- giocatore ----
const AIR_V=570,AIR_TURN=1.6,GRUNT_V=150;
const DASH_CD=2,DASH_T=.14,DASH_V=700;
const MELEE_DMG=80,MELEE_R=70,MELEE_ARC=1.6,MELEE_CD=.2,MELEE_COST=.70;
const REGEN=1,WATER_SLOW=.25,HILL_SLOW=.75,ARC_DEG=61;
const ENEMY_AIM_ERR=1;                   // errore casuale di mira dell'AI (± gradi)
// ---- difficoltà 1-10: cambia caserme, reazione e tempo di mira dell'AI ----
const diffReact=d=>2*(1.4+(.2-1.4)*(d-1)/9);        // secondi di reazione medi (2.8 → 0.4)
const diffAimTime=d=>1.8+(0.8-1.8)*(d-1)/9;         // secondi di mira visiva continua (1.8 → 0.8)
const diffBars=d=>1+Math.round((d-1)*5/9);        // caserme nemiche (1 → 6)
// ---- caserme e missioni ----
const BAR_MAX=6,BAR_T=120,BAR_SPAWN=9,BAR_HP=2;
const MIS_NAMES=['Classica','Scorta convoglio','Estrazione VIP','Sabotaggio','Caccia al bersaglio','Conquista avamposto','Sabotaggio nucleare','Ruba la nave spaziale','Guardia di sicurezza','Difesa della base','Ricerca e recupero'];
// ---- profili di densità mappa (scelti in lobby con lo slider "Mappa") ----
// Ogni profilo definisce QUANTE regioni (su ~25 della griglia Voronoi) ricevono ciascun tipo.
// Le regioni non-base non-costiere sono ~19-22: le eccedenti restano 'nature' (default della griglia).
// Convenzione dello slider: value 0 = "Casuale" (profilo scelto dal seed in genMap),
// value 1..N = PROFILES[value-1] (N = PROFILES.length).
// `d` = moltiplicatore di densità FUORI dai siti (case sparse, muri, container, edifici lungo
// strade/fiumi/laghi). 1.0 = massima densità, 0.05 = quasi deserto. Le città/fattorie/industrie
// sono già governate da `w` (numero di regioni); `d` controlla il "riempimento" del resto.
// `w`   = distribuzione tipi di regione (quante città/industrie/fattorie/militari)
// `d`   = densità "fuori-città" (case sparse, muri, container, edifici su strade/fiumi/laghi).
//         1.0 = massima, 0.01 = quasi deserto.
// `cs`  = city scale: moltiplica gli isolati per quartiere (nx, ny in PLAN.mkCity)
// `cd`  = city districts: moltiplica i quartieri per città (nd in PLAN.mkCity)
// `mf`  = max forced sites: quanti dei mega-siti forzati (y/n/a/k) possono essere aggiunti
// `mp`  = max ports: quanti porti sulla costa
const PROFILES=[
 {n:'Metropoli',   w:{urban:16, indus:2, rural:0, mil:0, nature:2},  d:1.40, cs:1.25, cd:1.80, mf:4, mp:2},
 {n:'Città fitta', w:{urban:11, indus:2, rural:1, mil:1, nature:3},  d:0.80, cs:1.15, cd:1.25, mf:4, mp:2},
 {n:'Urbana',      w:{urban:7,  indus:2, rural:3, mil:2, nature:2},  d:0.50, cs:1.00, cd:1.00, mf:4, mp:2},
 {n:'Mista',       w:{urban:4,  indus:2, rural:4, mil:1, nature:4},  d:0.28, cs:0.85, cd:0.90, mf:4, mp:2},
 {n:'Periferia',   w:{urban:3,  indus:1, rural:5, mil:1, nature:6},  d:0.12, cs:0.70, cd:0.70, mf:3, mp:2},
 {n:'Rurale',      w:{urban:2,  indus:1, rural:4, mil:0, nature:10}, d:0.040, cs:0.60, cd:0.50, mf:2, mp:1},
 {n:'Selvaggia',   w:{urban:1,  indus:1, rural:1, mil:0, nature:17}, d:0.004, cs:0.50, cd:0.20, mf:1, mp:1},
];
const CONV_V=70,CONV_HP=500,VIP_HP=150,VIP_V=140,VIP_T=3,EXT_R=220;
// ---- missione 8: guardia di sicurezza ----
const SEC_VIP_N=10,SEC_FAIL=3,SEC_SAFE=7;        // VIP totali · VIP morti tollerati (più di così: sconfitta) · VIP in salvo oltre i quali non escono più ondate
const SEC_WAVES=2,SEC_WAVES_LATE=3,SEC_VIP_LATE=3,SEC_WAVE_N=9,SEC_WAVE_GAP=8;   // ondate per i primi 2 VIP · ondate dal VIP SEC_VIP_LATE in poi · da quale VIP scatta il numero maggiorato · nemici per ondata · secondi tra un'ondata e l'altra
const SEC_LEAD=20,SEC_GAP=50,SEC_FIRST=10;       // secondi dalla prima ondata alla partenza del furgone · tra un VIP e il successivo · tra la cattura della zona e il primo ciclo
const SEC_SPAWN_D=1200,SEC_ALLY_D=500,SEC_ALLY_N=7,SEC_LEASH=900,SEC_CAP_T=25;   // distanza dei nemici dal meeting · raggio delle guardie alleate · quante · quanto lontano dal meeting inseguono · secondi di cattura
const SEC_VAN_HP=450,SEC_VAN_V=140,SEC_VAN_D=1500,SEC_BHP=4;   // furgone: vita, velocità, distanza di partenza · edificio: moltiplicatore della sua vita
// ---- missione 9: difesa della base (tower defence) ----
const TD_TIME=900,TD_START_R=1100,TD_FIRST=10;     // durata della difesa (s) · distanza a cui un giocatore fa partire il tempo · secondi alla prima ondata
const TD_BHP=6,TD_TUR_HP=2,TD_TUR_AR=4;            // edificio: moltiplicatore vita · torrette: moltiplicatore vita e corazza minima
const TD_TUR_D=170,TD_ZONE_R=95,TD_CAP_T=15;        // distanza torretta dal bordo dell'edificio · raggio della zona · secondi per ripristinare la torretta
const TD_SPAWN_D=1300,TD_MAX=40;                   // distanza di nascita delle ondate · nemici vivi massimi (protegge le prestazioni)
const TD_GAP=[14,5],TD_WN=[9,12];                  // [inizio, fine]: secondi tra ondate · nemici per ondata (crescono linearmente nei 15 minuti)
const TD_NUKE_N=7,TD_NUKE_T=9,TD_NUKE_KILL=1.5;    // esplosioni finali · durata della sequenza (s) · istante in cui i nemici muoiono
const OBJ_MIN=Math.max(WW,WH)/2;        // l'obiettivo principale di ogni missione sta PIÙ lontano di così dalla partenza (metà del lato più lungo)
const PLANT_R=1000,PLANT_T=45,KOTH_R=170,KOTH_T=45,KOTH_WAVE=22,KOTH_N=9;
const NK_T=60,NK_GROW=2.5,NK_HOLD=1.5,NK_FADE=8,NK_WIN=10,SHIP_R=280;   // nucleare: timer, crescita lampo, bianco pieno, dissolvenza sul velo, secondi prima della vittoria; SHIP_R: raggio di imbarco alla nave
// ---- deathmatch ----
const DM_BOTS=8,DM_LIMIT=15,DM_RESPAWN=3;
// ---- upgrade e caselle del mech ----
// PER AGGIUNGERNE UNO basta una riga: id (unico), g (gruppo: 'a' tutti, 'g' Grunt, 'x' Air), n (nome), d (descrizione),
// le proprietà numeriche che poi leggono upMul/upSum in applyLoadout (AGgame.js) e ic (disegno SVG, viewBox -10..10, colore = currentColor).
// L'ordine in questa lista NON conta: nella selezione compaiono prima le armi (rosso), poi UP_GROUPS nell'ordine indicato.
const UP_GROUPS=['a','g','x'];                                    // tutti → Grunt → Air
const UP_COL={a:'#ffffff',g:'#ffd23f',x:'#4aa3ff'},WP_COL='#ff3b3b';   // tutti = bianco, Grunt = giallo, Air = blu, armi = rosso
const SHIELD_T=30,SHIELD_GRACE=.2;    // ricarica di uno scudo (s); finestra in cui lo stesso "colpo" (pallini, fiamma) non consuma un altro scudo
const UPGRADES=[
 // ---- per tutti (bianco) ----
 {id:'regen',g:'a',n:'Rigenerazione',d:'   Vita: rigenera +100% ed anche in Air',rgA:1,rgG:2,
  ic:'<rect x="-2.5" y="-8" width="5" height="16" fill="currentColor"/><rect x="-8" y="-2.5" width="16" height="5" fill="currentColor"/>'},
 {id:'dash',g:'a',n:'Scatto potenziato',d:'   Barra dello scatto +100%',dcm:1,
  ic:'<path d="M-7,-5 L-1,0 L-7,5 M0,-5 L6,0 L0,5" stroke="currentColor" stroke-width="2" fill="none"/>'},
 {id:'dmx',g:'a',n:'Danno per caricatore',d:'   Grunt e Air: +30 danni per caricatore (spalmati sui colpi)',dmx:30,
  ic:'<rect x="-3" y="-3" width="6" height="11" rx="1" fill="currentColor"/><path d="M-3,-3 Q0,-10 3,-3 Z" fill="currentColor"/>'},
 {id:'shield',g:'a',n:'Scudo',d:'   Grunt e Air: assorbe il primo colpo subito, si ricarica in 30 s (con più scudi entra il prossimo carico)',sh:1,
  ic:'<circle cx="0" cy="0" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="0" cy="0" r="3.5" fill="currentColor"/>'},
 {id:'plasma',g:'a',n:'Plasmablade',d:'   Grunt e Air: danno della mischia +100%',mel:2,
  ic:'<path d="M-7,7 L5,-5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M5,-5 L8,-8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M-9,3 L-3,9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'},
 // ---- Grunt (giallo) ----
 {id:'gspd',g:'g',n:'Agilità Grunt',d:'   Grunt: velocità +25%',spd:1.25,
  ic:'<path d="M0,-9 L8,7 L0,3 L-8,7 Z" fill="currentColor"/>'},
 {id:'gfrm',g:'g',n:'Cadenza di fuoco',d:'   Grunt: cadenza di fuoco +20%',frm:1.2,
  ic:'<rect x="-6" y="-7" width="5" height="4" rx="1.5" fill="currentColor"/><rect x="1" y="-7" width="5" height="4" rx="1.5" fill="currentColor"/><rect x="-6" y="2" width="5" height="4" rx="1.5" fill="currentColor"/><rect x="1" y="2" width="5" height="4" rx="1.5" fill="currentColor"/>'},
 {id:'grlm',g:'g',n:'Ricarica rapida',d:'   Grunt: tempo di ricarica −25%',rlm:.75,
  ic:'<rect x="-4" y="-6" width="8" height="11" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M0,-8 A8,8 0 1,0 8,0" fill="none" stroke="currentColor" stroke-width="1.5"/><polygon points="-2,-10 1,-8 -2,-6" fill="currentColor"/>'},
 {id:'gdr',g:'g',n:'Corazza Grunt',d:'   Grunt: −5 a ogni danno subito',drG:5,
  ic:'<path d="M0,-8 L7,-5 L6,3 L0,9 L-6,3 L-7,-5 Z" fill="currentColor"/>'},
 // ---- Air (blu) ----
 {id:'xarc',g:'x',n:'Angolo di tiro',d:'   Air: angolo di tiro +70%',arc:1.7,
  ic:'<path d="M0,5 L-8,-6 A12,12 0 0,1 8,-6 Z" fill="currentColor"/>'},
 {id:'xdr',g:'x',n:'Corazza Air',d:'   Air: −5 a ogni danno subito',drA:5,
  ic:'<path d="M0,-8 L7,-5 L6,3 L0,9 L-6,3 L-7,-5 Z" fill="currentColor"/>'},
 {id:'xagi',g:'x',n:'Agilità Air',d:'   Air: velocità di virata e velocità massima +25%',agi:1.25,
  ic:'<path d="M0,-9 L8,7 L0,3 L-8,7 Z" fill="currentColor"/>'}];
// ---- colori ----
const COLS=[['#d98b2b','#f3c67a'],['#3b82f6','#9cc2ff'],['#65944d','#92bd75'],['#cc0000','#f28b8b'],['#a855f7','#d8b4fe'],['#5a6b7c','#93a5b8'],['#f4f1e8','#e8e2d2']];
// palette edifici [bordo, tetto]; dal 6 in poi sono speciali (caserma, centrale, radar, serbatoio, edificio VIP, blocco stradale, muro)
const BPAL=[['#4a544b','#5c695e'],['#5a4a40','#74604f'],['#4b5468','#617089'],['#55503a','#716b4c'],['#3f4f4f','#587070'],['#5b4b56','#7a6475'],
 ['#5a2323','#8a3a3a'],['#5b5b2a','#8d8d3f'],['#3d5566','#5f86a0'],['#2f5a52','#4f8f82'],['#2f5a52','#5aa595'],['#6b4a12','#c28a1c'],['#3f3d38','#77736a']];
const PAL_BAR=6,PAL_PLANT=7,PAL_RADAR=8,PAL_TANK=9,PAL_VIP=10,PAL_BLK=11,PAL_WALL=12;
// colore del terreno per quota: bassa, media, alta
const LVL_COL=['#58814a','#6b8f4e','#93a560'];
const SFX_LIST={melee:'sfx/sfx-melee.mp3',hit:'sfx/tennis_ball_2.wav',hurt:'sfx/snap.wav',toAir:'sfx/sfx-airdrop.mp3',toGrunt:'sfx/sfx-cards4.mp3',move:'sfx/foley_creak_1.wav',
 boom:'sfx/sfx-explosion.mp3',crash:'sfx/sfx-crollo.mp3',enemy:'sfx/sfx-uzi.mp3',reload:'sfx/sword_drop.wav',nuke:'sfx/sfx-boom.mp3'};
