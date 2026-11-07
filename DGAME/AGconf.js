'use strict';
/* AIRGRUNT · AGconf.js
   Unica fonte dei valori di gioco: mondo, armi, nemici, upgrade, difficoltà.
   Le armi sono definite UNA volta sola: giocatori e AI usano queste stesse armi, senza modifiche. */
const VERSION='AIRGRUNT 1.1',PROTO=2,PEER_PREFIX='airgrunt-',PEER_OPTS={};
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
 {n:'Mitraglia  ',dmg:10,cd:.06,spread:.09,speed:760,range:540,mag:30,reload:3,pellets:1,camZ:1,sfx:'sfx/sfx-laser.mp3',vol:.5},
 {n:'Cannone  ',dmg:72,cd:1,spread:.01,speed:1800,range:1620,mag:1,reload:4,pellets:1,camZ:CAM.far,pierce:1,sfx:'sfx/shotgun.mp3',vol:1},
 {n:'Lanciafiamme  ',dmg:8,cd:.04,spread:0,speed:1,range:300,mag:150,reload:12,pellets:0,camZ:1,flame:1,arc:.5,sfx:'sfx/sfx-airdrop.mp3',vol:.25,sg:120},
 {n:'Lanciarazzi  ',dmg:90,cd:1,spread:.01,speed:400,range:600,mag:4,reload:12,pellets:1,camZ:.8,ex:90,sfx:'sfx/sfx-airdrop.mp3',vol:.5},
 {n:'Shotgun  ',dmg:16,cd:.1,spread:.175,speed:1140,range:486,mag:2,reload:2,pellets:8,camZ:1,sfx:'sfx/shotgun.mp3',vol:.6},
 {n:'Disarmato  ',dmg:0,cd:1,spread:0,speed:0,range:540,mag:0,reload:0,pellets:0,camZ:1}];
const EX_MIN=20/90;                      // danno ai bordi di un'esplosione, in frazione del danno al centro
// ---- tipi di nemico (k): hp, arma, raggio d'impatto, velocità, distanza di tiro, raffica (colpi) e pausa (s) ----
const UT=[
 {n:'Torretta',hp:240,w:W_MG,r:26,pr:26,fixed:1,rm:3,rate:.5,inf:1,lead:.5,err:1,arm:.3},
 {n:'Mech',hp:120,w:W_MG,r:22,pr:18,spd:120,fast:150,hold:320,burst:[3,5],pause:[1,1.8],lead:.5,err:1,arm:.3},
 {n:'Jet',hp:80,w:W_MG,r:20,pr:20,fly:1,spd:110,hold:380,burst:[3,4],pause:[1.2,2.2],lead:.5,err:1,arm:.25},
 {n:'Kamikaze',hp:40,w:-1,r:18,pr:18,fly:1,spd:230,arm:.25,boom:{r:90,dmg:45,trig:40}},
 {n:'Cecchino',hp:90,w:W_CAN,r:20,pr:20,spd:70,hold:600,burst:[1,1],pause:[.3,.8],lead:1,err:.3,arm:.3,bsp:.7,rlm:.7},
 {n:'Carro pesante',hp:360,w:W_RKT,r:30,pr:26,spd:50,hold:420,burst:[2,3],pause:[1.5,2.5],lead:.5,err:1,arm:1},
 {n:'Bersaglio d\u2019\u00e9lite',hp:900,w:W_MG,w2:W_SHG,r:40,pr:30,spd:130,hold:360,burst:[4,6],pause:[.5,1],lead:.5,err:1.5,arm:1}];
UT.forEach(u=>{u.sight=u.w>=0?WEAPONS[u.w].range*(u.rm||1)*1.2:900});
const ARM_MIN=4,ARM_MAX=12;             // corazza dei nemici: ogni danno subito cala di tanti punti (minimo 1)
const KAMI_ER=UT[3].boom.r;
// quantità di nemici (fisse: la difficoltà NON le cambia)
const N_TUR=16,N_SQUAD=9,N_FLY=2,N_RUSH=6,N_SNIP=4,N_TANK=3;
const SAFE_R=1700,ALERT_R=500,LOST_T=10,SEARCH_N=3,SEARCH_LEAD=1.5,RECALL_T=15,RECALL_MUL=.3; // distanza minima dalla partenza, raggio di allarme, secondi di ricerca; punti da ispezionare e anticipo (s) lungo la direzione del bersaglio; finestra di "allerta ancora viva" (s) e moltiplicatore del tempo di reazione
// ---- giocatore ----
const AIR_V=570,AIR_TURN=1.6,GRUNT_V=150;
const DASH_CD=2,DASH_T=.14,DASH_V=700;
const MELEE_DMG=80,MELEE_R=70,MELEE_ARC=1.6,MELEE_CD=.2,MELEE_COST=.70;
const REGEN=1,WATER_SLOW=.25,HILL_SLOW=.75,ARC_DEG=61,ARMOR_MAX=10;
const ENEMY_AIM_ERR=1;                   // errore casuale di mira dell'AI (± gradi)
// ---- difficoltà 1-10: cambia caserme, reazione e tempo di mira dell'AI ----
const diffReact=d=>2*(1.4+(.2-1.4)*(d-1)/9);        // secondi di reazione medi (2.8 → 0.4)
const diffAimTime=d=>1.8+(0.8-1.8)*(d-1)/9;         // secondi di mira visiva continua (1.8 → 0.8)
const diffBars=d=>1+Math.round((d-1)*5/9);        // caserme nemiche (1 → 6)
// ---- caserme e missioni ----
const BAR_MAX=6,BAR_T=120,BAR_SPAWN=4,BAR_HP=2;
const MIS_NAMES=['Classica','Scorta convoglio','Estrazione VIP','Sabotaggio','Caccia al bersaglio','Conquista avamposto','Sabotaggio nucleare','Ruba la nave spaziale'];
const CONV_V=70,CONV_HP=500,VIP_HP=150,VIP_V=140,VIP_T=3,EXT_R=220;
const OBJ_MIN=Math.max(WW,WH)/2;        // l'obiettivo principale di ogni missione sta PIÙ lontano di così dalla partenza (metà del lato più lungo)
const PLANT_R=1000,PLANT_T=45,KOTH_R=170,KOTH_T=45,KOTH_WAVE=22,KOTH_N=5;
const NK_T=90,NK_GROW=2.5,NK_HOLD=1.5,NK_FADE=8,NK_WIN=10,SHIP_R=280;   // nucleare: timer, crescita lampo, bianco pieno, dissolvenza sul velo, secondi prima della vittoria; SHIP_R: raggio di imbarco alla nave
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
