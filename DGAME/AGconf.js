'use strict';
/* AIRGRUNT · AGconf.js
   Unica fonte dei valori di gioco: mondo, armi, nemici, upgrade, difficoltà, densità delle mappe, colori.
   Le armi sono definite UNA volta sola: giocatori e AI usano queste stesse armi, senza modifiche. */
const EXTRA_ICE=[   // stesso TURN usato da DawnlorD (dnet.js)
 {urls:'turn:global.relay.metered.ca:80',username:'0a099e5d0bdc770566e1b8be',credential:'/7ZvcHP2v8O7nit7'},
 {urls:'turn:global.relay.metered.ca:80?transport=tcp',username:'0a099e5d0bdc770566e1b8be',credential:'/7ZvcHP2v8O7nit7'},
 {urls:'turn:global.relay.metered.ca:443',username:'0a099e5d0bdc770566e1b8be',credential:'/7ZvcHP2v8O7nit7'},
 {urls:'turns:global.relay.metered.ca:443',username:'0a099e5d0bdc770566e1b8be',credential:'/7ZvcHP2v8O7nit7'}];
const VERSION='AIRGRUNT 1.2',PROTO=3,PEER_PREFIX='airgrunt-',
 PEER_OPTS={debug:1,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'},{urls:'stun:global.stun.twilio.com:3478'},...EXTRA_ICE],iceCandidatePoolSize:10,iceTransportPolicy:'all'}};
const NET_LOAD_GRACE=99000;   // ms di tolleranza dopo un 'init' remoto prima di considerare un client "fuori sync"
// ---- mondo ----
const WW=6400,WH=6400,SEA=WW-440;       // area di gioco quadrata · SEA = distanza media della costa dal lato opposto al mare (il lato lo sceglie il seed: SIDE in AGworld.js)
const START=[200,200],EXT=[260,260];    // partenza dei giocatori e punto di estrazione (genMap li sposta nell'angolo scelto dal seed)
// ---- base di partenza: uno dei 4 angoli (k: 0 alto-sx, 1 alto-dx, 2 basso-dx, 3 basso-sx) ----
// coordinate locali (u,v): l'angolo è (0,0), l'interno della mappa è verso u,v positivi
const BASE={k:0,xr:WW};                // k: angolo di partenza (mai sul lato del mare) · xr: ascissa del lato destro
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
 {n:'Lanciarazzi  ',dmg:90,cd:0.2,spread:.01,speed:400,range:600,mag:4,reload:12,pellets:1,camZ:.8,ex:90,sfx:'sfx/sfx-airdrop.mp3',vol:.5},
 {n:'Shotgun  ',dmg:16,cd:.1,spread:.175,speed:1140,range:389,mag:2,reload:2,pellets:8,camZ:1,sfx:'sfx/shotgun.mp3',vol:.6},
 {n:'Disarmato  ',dmg:0,cd:1,spread:0,speed:0,range:540,mag:0,reload:0,pellets:0,camZ:1}];
// armi montate sui VEICOLI dei giocatori (indici dopo W_NONE: non compaiono fra le armi del mech; veh:1 = solo a bordo del mezzo giusto)
const W_VMG=6,W_VCAN=7,W_VJMG=8,W_VJMS=9,W_VROT=10,W_VSWM=11;
WEAPONS.push(
 {n:'Mitragliera pesante  ',dmg:20,cd:.09,spread:.06,speed:900,range:640,mag:120,reload:3.5,pellets:1,camZ:.9,sfx:'sfx/sfx-laser.mp3',vol:.5,veh:1},          // APC
 {n:'Cannone del carro  ',dmg:150,cd:1.6,spread:.005,speed:1500,range:1150,mag:1,reload:2.2,pellets:1,camZ:.75,ex:75,sfx:'sfx/shotgun.mp3',vol:1,veh:1},     // carro armato: granata esplosiva
 {n:'Cannoncino del jet  ',dmg:16,cd:.05,spread:.07,speed:1100,range:700,mag:150,reload:3,pellets:1,camZ:1,sfx:'sfx/sfx-laser.mp3',vol:.45,veh:1},          // jet
 {n:'Missili aria-terra  ',dmg:110,cd:.3,spread:.02,speed:720,range:900,mag:6,reload:7,pellets:1,camZ:1,ex:85,sfx:'sfx/sfx-airdrop.mp3',vol:.5,veh:1},       // jet
 {n:'Cannone rotante  ',dmg:24,cd:.055,spread:.1,speed:950,range:660,mag:240,reload:5,pellets:1,camZ:.9,sfx:'sfx/sfx-laser.mp3',vol:.5,veh:1},              // Colosso
 {n:'Missili a sciame  ',dmg:80,cd:.14,spread:.12,speed:560,range:820,mag:12,reload:9,pellets:1,camZ:.85,ex:70,sfx:'sfx/sfx-airdrop.mp3',vol:.45,veh:1});    // Colosso
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
const GND_SPD=.7;   // moltiplicatore della velocità di TUTTE le unità di terra non giocanti (1 = velocità originale): nemici (spd/fast di UT qui sotto e velocità fisse in AGsim.js: pattuglia, schivata)
                    // e alleati: VIP e wingman (VIP_V), convoglio (CONV_V), furgone (SEC_VAN_V). Il Grunt del giocatore ha la sua: GRUNT_V
const UT=[
 {n:'Torretta',hp:240,w:W_MG,r:26,pr:26,fixed:1,rm:3,rate:.5,inf:1,lead:.5,err:1,arm:.3},
 {n:'Mech',hp:90,w:W_MG,r:22*MECH_SCALE,pr:18,spd:120,fast:150,hold:320,burst:[3,5],pause:[1,1.8],lead:.5,err:1,arm:.3},
 {n:'Jet',hp:80,w:W_MG,r:20,pr:20,fly:1,spd:110,hold:380,burst:[3,4],pause:[1.2,2.2],lead:.5,err:1,arm:.25},
 {n:'Kamikaze',hp:40,w:-1,r:18,pr:18,fly:1,spd:230,arm:.25,boom:{r:90,dmg:45,trig:40}},
 {n:'Cecchino',hp:90,w:W_CAN,r:20,pr:20,spd:70,hold:600,burst:[1,1],pause:[.3,.8],lead:1,err:.3,arm:.3,bsp:.7,rlm:.7,dmg:50},
 {n:'Carro pesante',hp:360,w:W_RKT,r:30,pr:26,spd:50,hold:420,burst:[2,3],pause:[1.5,2.5],lead:.5,err:1,arm:1},
 {n:'Bersaglio d\u2019\u00e9lite',hp:900,w:W_MG,w2:W_SHG,r:20,pr:15,spd:130,hold:360,burst:[4,6],pause:[.5,1],lead:.5,err:1.5,arm:1},
 {n:'Dirigibile',hp:360,w:W_SHG,w2:W_MG,w3:W_RKT,r:36,pr:26,fly:1,spd:50,hold:320,burst:[4,6],pause:[.8,1.4],lead:.5,err:1,arm:1},
 {n:'Swordman',hp:90,w:-1,r:22*MECH_SCALE,pr:18,spd:140,hold:45,arm:.5},   // mischia; fuori portata della spada spara colpi singoli di mitraglia (swordGun, SWD_GUN_CD); hold = distanza a cui si ferma (dentro la portata della spada)
 {n:'APC',hp:240,w:W_MG,r:20,pr:18,spd:170,hold:320,burst:[3,5],pause:[1,1.8],lead:.5,err:1,arm:.3},   // veicolo leggero armato: vita da torretta, mitraglia da mech, più grande e più veloce del mech
 {n:'Nave da guerra',hp:720,w:W_MG,w3:W_RKT,r:40,pr:40,fixed:1,ship:1,hold:9999,burst:[4,6],pause:[.8,1.4],lead:.5,err:1,arm:1,arF:12},   // immobile, è una nave della mappa: corazza fissa 12, vita doppia del carro, torrette del dirigibile (mitraglia + razzi)
 {n:'Infiltrato civile',hp:20,w:W_MG,r:14,pr:10,spd:90,hold:320,burst:[3,5],pause:[1,1.8],lead:.5,err:1,arm:0},
 {n:'Guardia',hp:20,w:W_MG,r:14,pr:10,spd:90,hold:320,burst:[3,5],pause:[1,1.8],lead:.5,err:1,arm:0},
 {n:'Poliziotto',hp:30,w:W_MG,r:14,pr:10,spd:100,hold:300,burst:[3,5],pause:[1,1.8],lead:.5,err:1,arm:0}];   // esce dalla centrale di polizia danneggiata: attacca tutti
for(const T of UT)if(!T.fly){if(T.spd)T.spd*=GND_SPD;if(T.fast)T.fast*=GND_SPD}   // nemici di terra più lenti (Jet, Kamikaze e Dirigibile volano: restano com'erano)
const UK_SWD=8;                          // Swordman: mech da mischia (spada)
const UK_APC=9;                          // APC: veicolo leggero armato (torretta che ruota separata dallo scafo)
const UK_SHIP=10;                        // nave da guerra: il corpo è l'ostacolo 'ship' della mappa, l'unità ne comanda solo le torrette
const UK_HUM=11;                         // da questo indice in poi: unità "omino" (infiltrati k=11, guardie k=12, poliziotti k=13)
const UK_GRD=12;                         // guardia (omino travestito, classe militare)
const UK_POL=13;                         // poliziotto: omino armato (come i militari, testa blu) che attacca nemici E giocatori
const UK_BLIMP=7;                        // Dirigibile: nemico volante con torretta indipendente dallo scafo (come il carro pesante, k=5)
const hasTur=k=>k===5||k===UK_BLIMP||k===UK_APC;     // tipi con la torretta che ruota separata dallo scafo (u.thr)
const has3=k=>k===UK_BLIMP||k===UK_SHIP;             // tipi con 3 torrette indipendenti (thr, thr2, thr3): dirigibile e nave da guerra
UT.forEach(u=>{u.sight=u.w>=0?WEAPONS[u.w].range*(u.rm||1)*1.2:900});
const WING={burst:[15,30],pause:[.15,.4],lead:1,err:.3};   // wingman: raffiche lunghe, pause brevi, lead sempre attivo, errore di mira ridotto (gradi)
const ARM_MIN=4,ARM_MAX=12;             // corazza dei nemici: ogni danno subito cala di tanti punti (minimo 1)
const KAMI_ER=UT[3].boom.r;
// quantità di nemici (fisse: la difficoltà NON le cambia)
const N_TUR=16,N_SQUAD=9,N_FLY=2,N_RUSH=6,N_SNIP=4,N_TANK=3,N_SWD=5,N_APC=4;
const blimpProb=d=>Math.min(1,0.25+(clamp(d|0,1,10)-1)*0.75/8);   // probabilità di comparsa del dirigibile: 25% a diff 1 → 100% da diff 9 in su
const N_INF=10,N_GRD=8;                  // infiltrati civili e guardie (travestiti da omini)
const N_CIV_P=70,N_CIV_V=22,CIV_PEN=1;   // civili: omini sulle strade, veicoli, kill tolte per ogni civile ucciso
const N_CIV_B=90,N_CIV_W=110,CIV_GRP=[2,5];   // omini intorno agli edifici; omini sparsi ovunque sulla mappa, a gruppetti di 2-5
const CIV_SITE={c:1,n:1,a:1,i:2,k:2,y:2,p:2},CIV_SITE_N={1:[6,10],2:[8,14]};   // tipo di sito → classe di omini: 1 militari (caserme, silos, aeroporto), 2 operai (industrie, centrale, cantiere, porto); [min,max] omini fissi per sito
const N_ARM=2,ARM_R=80;                  // armerie: quante, distanza massima dal muro per usarle
// ---- edifici speciali FACOLTATIVI (oltre alle armerie): da 0 a SB_MAX per mappa, al massimo uno per tipo, scelti dal seed ----
// c = colore del tratteggio · n = nome · t = durata del potenziamento (s) · up = upgrade di cui danno l'effetto e l'icona · e = testo dell'effetto
const SB_TYPES={
 pol:{n:'Centrale di polizia',c:'#3b82f6'},
 pri:{n:'Prigione',c:'#8b5a2b'},
 hos:{n:'Ospedale',c:'#ff8c1a',t:60,up:'regen',e:'Rigenerazione'},
 off:{n:'Officina',c:'#9aa3ab',t:60,up:'gdr',e:'Corazza Grunt'},
 rad:{n:'Radar',c:'#a855f7',t:30,up:'radar',e:'Nemici visibili nella nebbia'},
 gen:{n:'Generatore',c:'#ffffff',t:60,up:'dash',e:'Scatto potenziato'}};
const SB_MAX=3,SB_BUFF=['hos','off','rad','gen'];   // SB_BUFF: edifici che si usano col tasto R (danno un potenziamento a tempo)
const POL_N=12,POL_CD=30,POL_MAX=24,POL_LEASH=1500;  // poliziotti per ondata · secondi minimi fra due ondate · poliziotti vivi massimi · distanza massima dalla centrale dei loro bersagli
const PRI_N=3;                                     // wingman liberati dalla prigione distrutta
const SAFE_R=1700,ALERT_R=500,LOST_T=10,SEARCH_N=3,SEARCH_LEAD=1.5,RECALL_T=15,RECALL_MUL=.3; // distanza minima dalla partenza, raggio di allarme, secondi di ricerca; punti da ispezionare e anticipo (s) lungo la direzione del bersaglio; finestra di "allerta ancora viva" (s) e moltiplicatore del tempo di reazione
// ---- giocatore ----
// ---- veicoli guidabili (AGveh.js: logica · AGart.js: disegno) ----
// n nome · art disegno · civ tipo di CIV_VEH (veicoli civili: stesso disegno delle auto in strada) · hp vita del mezzo · ar corazza (toglie tanti punti a ogni colpo)
// r raggio d'impatto (colpi, investimenti) · pr ingombro contro edifici e alberi · v velocità massima (px/s) · acc / brk accelerazione e frenata · turn sterzata (rad/s)
// w armi montate (indici di WEAPONS; vuoto = mezzo disarmato: il pilota usa le armi del suo Grunt dal finestrino) · mz distanza della bocca da fuoco dal centro · cz zoom della telecamera
// comandi (tutti come il jet): W accelera · A/D ruotano · S frena (a terra, da fermi, S fa retromarcia lenta)
// heavy: mezzo pesante (non si investe, blocca chi lo urta) · track: cingolato, ruota sul posto · walk: cammina (ruota sul posto, guada l'acqua) · fly: vola · crush: abbatte gli alberi
// dove compaiono e quanto sono rari (vehInit in AGveh.js; tutto dal seed, uguale per tutti i client):
//   civili: wt = peso nella scelta del tipo (più alto = più comune); stanno sugli slab degli edifici di città e sulle strade dentro le città
//   militari: at = siti ammessi {tipo di sito: raggio minimo del sito, 0 = qualunque} · p = probabilità di comparire in ogni sito ammesso · n = [min,max] esemplari se compare
//   (tipi di sito: c base militare · n silos missilistici · a aeroporto · y cantiere spaziale)
const VEH_T=[
 {n:'Berlina',art:'civ',civ:'berlina',hp:140,ar:0,r:12,pr:10,v:330,acc:1.6,brk:3.2,turn:2.6,w:[],mz:10,cz:.9,wt:40},
 {n:'Sportiva',art:'civ',civ:'sportiva',hp:110,ar:0,r:12,pr:10,v:430,acc:1.9,brk:3.5,turn:2.8,w:[],mz:10,cz:.85,wt:12},
 {n:'Pickup',art:'civ',civ:'pickup',hp:200,ar:2,r:14,pr:11,v:300,acc:1.4,brk:3,turn:2.3,w:[],mz:10,cz:.9,wt:25},
 {n:'Furgone',art:'civ',civ:'furgone',hp:250,ar:2,r:14,pr:12,v:260,acc:1.2,brk:2.8,turn:2.1,w:[],mz:10,cz:.9,wt:20},
 {n:'APC',art:'apc',hp:520,ar:8,r:20,pr:16,v:184,acc:1.2,brk:2.8,turn:2,heavy:1,w:[W_VMG],mz:24,cz:.9,at:{c:0,n:0},p:.45,cnt:[1,2]},
 {n:'Carro armato',art:'tank',hp:900,ar:12,r:30,pr:24,v:112,acc:.9,brk:2.5,turn:1.3,heavy:1,track:1,crush:1,w:[W_VCAN,W_VMG],mz:51,cz:.8,at:{c:0,n:0},p:.28,cnt:[1,1]},
 {n:'Jet',art:'jet',hp:400,ar:4,r:20,pr:16,v:760,acc:1.1,brk:2.2,turn:1.5,fly:1,w:[W_VJMG,W_VJMS],mz:22,cz:1,at:{a:0,y:0,c:600},p:.35,cnt:[1,2]},   // aeroporti, cantieri spaziali, grandi basi
 {n:'Colosso',art:'walker',hp:1100,ar:12,r:32,pr:24,v:95,acc:1.4,brk:3,turn:1.6,heavy:1,walk:1,crush:1,w:[W_VROT,W_VSWM],mz:50,cz:.8,at:{c:0,n:0,y:600},p:.06,cnt:[1,1]}];   // rarissimo: siti militari o cantiere spaziale grande
const VEH_CIV_PER=18,VEH_CIV_MAX=16;      // veicoli civili: uno ogni tanti slab di città (più città = più auto), al massimo tanti per mappa
const VEH_USE_R=55;                       // distanza (dal bordo del mezzo) entro cui si può salire
const VEH_RAM_DMG=50,VEH_RAM_V=60,VEH_RAM_CD=.7,VEH_RAM_PUSH=55;   // investimento: danno (ignora la corazza) · velocità minima · secondi prima di colpire di nuovo la stessa unità · spinta (px)
const VEH_EJECT_DMG=25;                   // danno al pilota quando il suo mezzo esplode
const VEH_REPAIR=4;                       // riparazione all'armeria: punti vita del mezzo al secondo (R a bordo, finché il mezzo resta vicino)
const VEH_HUM=new Set([1,4,6,8,11,12,13]);   // unità umanoidi che si possono investire: mech, cecchino, élite, swordman, infiltrati, guardie, poliziotti
const VEH_HEAVY=new Set([0,5,9]);            // unità pesanti: torretta, carro pesante, APC (non si investono, bloccano il mezzo)
const VEH_MIL_COL='#59633c';               // colore dei mezzi militari parcheggiati (guidati prendono il colore del pilota)
const AIR_V=570,AIR_TURN=1.6,GRUNT_V=105;   // GRUNT_V = velocità del mech a terra (px/s; era 150, -30%). Lo scatto ha la sua: DASH_V
const DASH_CD=2,DASH_T=.14,DASH_V=700;
const MELEE_DMG=80,MELEE_R=70,MELEE_ARC=1.6,MELEE_CD=.2,MELEE_COST=.70;
const SWD_DMG=.5,SWD_CD=.75;   // swordman: 50% del danno di mischia dei giocatori, un fendente ogni 0,75 s
const SWD_GUN_CD=1;            // swordman fuori portata della spada: un colpo singolo di mitraglia ogni SWD_GUN_CD s
const REGEN=1,WATER_SLOW=.25,HILL_SLOW=.75,ARC_DEG=61;
const WX_SLOW=HILL_SLOW;   // chiazze di neve e pozzanghere (meteo): rallentano come la collina, giocatori e AI
const ENEMY_AIM_ERR=1;                   // errore casuale di mira dell'AI (± gradi)
// ---- difficoltà 1-10: cambia caserme, reazione e tempo di mira dell'AI ----
const diffReact=d=>2*(1.4+(.2-1.4)*(d-1)/9);        // secondi di reazione medi (2.8 → 0.4)
const diffAimTime=d=>1.8+(0.8-1.8)*(d-1)/9;         // secondi di mira visiva continua (1.8 → 0.8)
const diffBars=d=>Math.round((d-1)*6/9);          // caserme nemiche (0 → 6)
// ---- caserme e missioni ----
const BAR_MAX=6,BAR_T=120,BAR_SPAWN=9,BAR_HP=2;
const MIS_NAMES=['Sterminio','Scorta convoglio','Estrazione VIP','Sabotaggio','Caccia al VIP','Conquista avamposto','Sabotaggio nucleare','Ruba la nave spaziale','Guardia di sicurezza','Difesa della base','Ricerca e recupero','Affonda la flotta'];
const MIS_N=MIS_NAMES.length-1;   // missioni estraibili a caso (1..MIS_N): la 0 (Sterminio) si sceglie solo esplicitamente

// Trama mostrata nella schermata di caricamento, una per ciascun valore di G.mt (indice = missione).
// G.mt = 0 → "Classica" (sterminio) — la stessa trama vale come fallback se la missione scelta
// non è realizzabile sulla mappa generata e il gioco ripiega sulla 0.
const MISSION_STORY=[
 // 0 — Classica / Sterminio
 "Le caserme nemiche rimpiazzano le perdite subite ad un ritmo per noi insostenibile... sembrano beffarsi dei nostri sforzi, e noi non facciamo progressi. Il comando ha ordinato lo sterminio totale: distruggi ogni caserma e annienta tutte le forze ostili in un colpo solo. Eliminarli ci fa comodo, ma il punto è mandare un chiaro messaggio: dateci più nemici che noi ci divertiamo a sterminarli!",
 // 1 — Scorta convoglio
 "Un convoglio di rifornimenti deve attraversare il territorio ostile via terra per raggiungere la base avanzata. L'antiaerea nemica domina il cielo, ma anche le strade sono pattugliate dal nemico. Scorta il convoglio fino alla meta e difendilo dagli agguati, il nostro avamposto non può resistere senza munizioni e donne da compagnia!",
 // 2 — Estrazione VIP
 "Un prezioso informatore è rimasto intrappolato in un edificio sorvegliato. Raggiungilo, convincilo a seguirti (con le buone questa volta!) e scortalo fino al punto di estrazione. Le informazioni che ha memorizzato valgono ben più della sua vita, ma se non è vivo non può riferircele, quindi questa volta non riportare solo i pezzi!",
 // 3 — Sabotaggio
 "Tre strutture alimentano la macchina da guerra nemica: una centrale elettrica, un radar e un serbatoio di carburante. Distruggile tutte per paralizzare le operazioni nel settore. Spoiler: la centrale alimenta le torrette difensive nei dintorni ed anche le ricariche degli smartphone nemici! Ci rimarranno malissimo!",
 // 4 — Caccia al VIP
 "Un comandante d'élite nemico sta seminando caos e distruzione nelle nostre difese. Corazzato, armato pesantemente, scortato. Le ultime informazioni lo collocano nella zona indicata. Trovalo, affrontalo e neutralizzalo: fagli vedere chi è il più grosso e cattivo nella valle!",
 // 5 — Conquista avamposto
 "Due avamposti strategici controllano facilmente il settore e il comando li vuole entrambi. Occupa le zone designate con il Grunt, respingi i contrattacchi nemici e mantieni il controllo fino al completamento della conquista. Come dice sempre il comandante: quel che è tuo... è mio, quel che è mio... è mio!",
 // 6 — Sabotaggio nucleare
 "Bombardando dall'orbita non riusciamo a penetrare le difese nemiche, ma il nemico in zona ha un sito nucleare attivo... hehehe... Il comando ordina la distruzione, sarà più devastande di un bombardamento! Conquista la zona, piazza l'ordigno e allontanati. Hai 60 secondi prima della detonazione. Chi resta indietro non torna... o torna come cenere se il vento tira in questa direzione.",
 // 7 — Ruba la nave spaziale
 "Una nave spaziale nemica è in fase di rifornimento al cantiere... a noi piace davvero tanto... deve essere nostra. Una nave in più per noi ed una in meno per loro in un colpo solo. Conquista la centrale energetica per alimentare i sistemi di bordo, poi raggiungi la nave e prendi il volo. Se ti avanza tempo al posto della nave lasciagli un post-it: grazie del regalo, poi vi renderemo i missili nucleari... accesi.",
 // 8 — Guardia di sicurezza
 "Devi proteggere un edificio strategico sede di un meeting vitale. Dieci VIP verranno di persona per l'occasione con furgoni blindati. I nemici arriveranno sicuramente, attirati come mosche sullo sterco. Le guardie alleate ti copriranno, ma non ce la faranno da sole. Lo so... lo so... qui nessuno vuole fare il babysitter... ma vediamo il lato positivo: ci saranno molti nemici da massacrare e non dovremo nemmeno cercarli, verrano loro da noi! Ah...non perdere più di tre VIP o la missione fallirà.",
 // 9 — Difesa della base
 "La nostra base è sotto assedio, e il supporto aereo arriverà fra 15 minuti: devi resistere fino ad allora! Se l'edificio centrale crolla, la base è perduta. Le ondate nemiche non si fermeranno, ma puoi ripristinare le torrette quando vengono distrutte.",
 // 10 — Ricerca e recupero
 "L'antiaerea nemica non ci da tregua, ed una nostra navicella è stata abbattuta. A bordo c'erano tre VIP. Il segnale di soccorso parla di feriti in capsule di salvataggio sparse nella zona. Se il comando ha autorizzato la missione è perchè questi VIP hanno tecnologie preziose o sono parenti di qualche dirigente... ad ogni modo trova il sito, recupera almeno due VIP e portali al punto di estrazione.",
 // 11 — Affonda la flotta
 "Tre navi da guerra nemiche sono ancorate al largo della costa: cannoneggiano le nostre posizioni e coprono gli sbarchi nemici. Il comando vuole che quelle navi vadano a parcheggiarsi sul fondo del mare. Attraversa il settore, raggiungi la costa e affonda tutte e tre le navi: quando lo scafo sarà pieno di buchi vedremo quanto bene nuotano i marinai nemici... o se respirano sott'acqua."
];

// ---- profili di densità della mappa (slider "Mappa" della lobby: 0 = Casuale, scelto dal seed; 1..N = PROFILES[n-1]) ----
// sites = [min,max] siti principali · roads = strade principali · city = quota di siti che sono città a griglia · cd = grandezza delle città
// ports = porti massimi · minor = piccoli siti lungo le strade · fill = tessuto urbano di riempimento (0..1)
// forest / rock = quota di terreno a bosco e a roccia · hill = colline · nat = alberi e rocce sparsi · lakes / rivers = [min,max]
// dec = decorazioni artificiali (scene, barche, relitti: 0 = solo natura) · mix = peso di ogni tipo di sito
//   c base militare · i industria · k centrale nucleare · y cantiere spaziale · n silos · a aeroporto · t città · p porto · f fattoria · v villa · q cava · s arena (al massimo una per mappa)
const PROFILES=[
 {n:'Metropoli',sites:[26,32],roads:[8,10],city:.6,cd:1.5,ports:2,minor:150,fill:1,forest:.05,rock:.04,hill:.5,nat:.3,lakes:[1,3],rivers:[1,3],dec:1.5,mix:{i:4,c:2,t:4,p:2,k:1,y:1,n:1,a:1,v:1,s:1.5}},
 {n:'Urbana',sites:[14,18],roads:[5,6],city:.45,cd:1.2,ports:2,minor:70,fill:.5,forest:.12,rock:.07,hill:.7,nat:.6,lakes:[2,4],rivers:[2,3],dec:1.2,mix:{i:3,c:2,t:3,p:2,k:1,y:1,n:1,a:1,f:2,v:2,q:1,s:1.2}},
 {n:'Media',sites:[8,11],roads:[3,4],city:.32,cd:1,ports:1,minor:36,fill:.2,forest:.2,rock:.1,hill:.85,nat:.9,lakes:[2,5],rivers:[2,4],dec:1,mix:{i:2,c:2,t:1,p:2,k:1,y:1,n:1,a:1,f:3,v:2,q:1,s:1}},
 {n:'Rurale',sites:[5,7],roads:[2,2],city:.2,cd:.8,ports:1,minor:16,fill:0,forest:.28,rock:.13,hill:1,nat:1.2,lakes:[3,6],rivers:[2,4],dec:.6,mix:{c:1,i:1,p:1,k:1,y:1,n:1,a:1,f:5,v:3,q:2,s:.5}},
 {n:'Selvaggia',sites:[4,4],roads:[1,1],city:0,cd:1.3,ports:1,minor:0,fill:0,forest:.4,rock:.17,hill:1,nat:1.6,lakes:[3,6],rivers:[3,5],dec:0,mix:{c:2,i:1,p:1,k:1,y:1,n:1,a:1,q:2}}];
const CONV_V=70*GND_SPD,CONV_HP=500,VIP_HP=150,VIP_V=140*GND_SPD,VIP_T=3,EXT_R=220;
// ---- missione 8: guardia di sicurezza ----
const SEC_VIP_N=10,SEC_FAIL=3,SEC_SAFE=7;        // VIP totali · VIP morti tollerati (più di così: sconfitta) · VIP in salvo oltre i quali non escono più ondate
const SEC_WAVES=2,SEC_WAVES_LATE=3,SEC_VIP_LATE=3,SEC_WAVE_N=9,SEC_WAVE_GAP=8;   // ondate per i primi 2 VIP · ondate dal VIP SEC_VIP_LATE in poi · da quale VIP scatta il numero maggiorato · nemici per ondata · secondi tra un'ondata e l'altra
const SEC_LEAD=20,SEC_GAP=50,SEC_FIRST=10;       // secondi dalla prima ondata alla partenza del furgone · tra un VIP e il successivo · tra la cattura della zona e il primo ciclo
const SEC_SPAWN_D=1200,SEC_ALLY_D=500,SEC_ALLY_N=7,SEC_LEASH=900,SEC_CAP_T=12;   // distanza dei nemici dal meeting · raggio delle guardie alleate · quante · quanto lontano dal meeting inseguono · secondi di cattura
const SEC_VAN_HP=450,SEC_VAN_V=140*GND_SPD,SEC_VAN_D=1500,SEC_BHP=4;   // furgone: vita, velocità, distanza di partenza · edificio: moltiplicatore della sua vita
// ---- missione 9: difesa della base (tower defence) ----
const TD_TIME=900,TD_START_R=400,TD_FIRST=10;     // durata della difesa (s) · distanza a cui un giocatore fa partire il tempo · secondi alla prima ondata
const TD_BHP=6,TD_TUR_HP=2,TD_TUR_AR=4;            // edificio: moltiplicatore vita · torrette: moltiplicatore vita e corazza minima
const TD_TUR_D=170,TD_ZONE_R=95,TD_CAP_T=10;        // distanza torretta dal bordo dell'edificio · raggio della zona · secondi per ripristinare la torretta
const TD_SPAWN_D=1300,TD_MAX=40;                   // distanza di nascita delle ondate · nemici vivi massimi (protegge le prestazioni)
const TD_GAP=[30,15],TD_WN=[9,12];                  // [inizio, fine]: secondi tra ondate · nemici per ondata (crescono linearmente nei 15 minuti)
const TD_NUKE_N=7,TD_NUKE_T=9,TD_NUKE_KILL=1.5;    // esplosioni finali · durata della sequenza (s) · istante in cui i nemici muoiono
const OBJ_MIN=Math.max(WW,WH)/2;        // l'obiettivo principale di ogni missione sta PIÙ lontano di così dalla partenza (metà del lato più lungo)
const PLANT_R=1000,PLANT_T=45,KOTH_R=170,KOTH_T=45,KOTH_WAVE=22,KOTH_N=9;
const FLEET_N=3,FLEET_GAP=800;            // missione 11: navi della flotta nemica · distanza minima preferita fra due navi (px)
const NK_T=60,NK_GROW=2.5,NK_HOLD=1.5,NK_FADE=8,NK_WIN=10,SHIP_R=280;   // nucleare: timer, crescita lampo, bianco pieno, dissolvenza sul velo, secondi prima della vittoria; SHIP_R: raggio di imbarco alla nave
// ---- deathmatch ----
const DM_BOTS=8,DM_LIMIT=15,DM_RESPAWN=3;
// ---- upgrade e caselle del mech ----
// PER AGGIUNGERNE UNO basta una riga: id (unico), g (gruppo: 'a' tutti, 'g' Grunt, 'x' Air), n (nome), d (descrizione),
// le proprietà numeriche che poi leggono upMul/upSum in applyLoadout (AGgame.js) e ic (disegno SVG, viewBox -10..10, colore = currentColor).
// L'ordine in questa lista NON conta: nella selezione compaiono prima le armi (rosso), poi UP_GROUPS nell'ordine indicato.
const UP_GROUPS=['a','g','x'];                                    // tutti → Grunt → Air
const UP_COL={a:'#ffffff',g:'#ffd23f',x:'#4aa3ff'},WP_COL='#ff3b3b';   // tutti = bianco, Grunt = giallo, Air = blu, armi = rosso
const SHIELD_T=20,SHIELD_GRACE=.5,REVIVE_CD=90;    // ricarica di uno scudo (s); grazia anti-multi-hit (s); ricarica della Rianimazione (s)
const SLOW_W=.25,SLOW_P=.75,SLOW_T=6,SLOW_CD=120;
// slow motion (riga sopra): velocità del mondo · di chi l'ha attivato · durata (s reali) · ricarica (s reali)
const STL_A=.3,STL_AIM=4,STL_T=15,STL_CD=60;   // stealth (attivazione manuale): opacità del mech 30% · tempo di mira dell'AI ×4 · durata (s reali) · ricarica (s reali, parte quando l'effetto finisce)
const UPGRADES=[
 // ---- per tutti (bianco) ----
 {id:'regen',g:'a',n:'Rigenerazione',rgA:1,rgG:2,
  get d(){return `   Vita: rigenera +${Math.round((this.rgG-1)*100)}% ed anche in Air`},
  ic:'<rect x="-2.5" y="-8" width="5" height="16" fill="currentColor"/><rect x="-8" y="-2.5" width="16" height="5" fill="currentColor"/>'},
 {id:'dash',g:'a',n:'Scatto potenziato',dcm:1,
  get d(){return `   Barra dello scatto +${Math.round(this.dcm*100)}%`},
  ic:'<path d="M-7,-5 L-1,0 L-7,5 M0,-5 L6,0 L0,5" stroke="currentColor" stroke-width="2" fill="none"/>'},
 {id:'dmx',g:'a',n:'Danno per caricatore',dmx:30,
  get d(){return `   Grunt e Air: +${this.dmx} danni per caricatore (spalmati sui colpi)`},
  ic:'<rect x="-3" y="-3" width="6" height="11" rx="1" fill="currentColor"/><path d="M-3,-3 Q0,-10 3,-3 Z" fill="currentColor"/>'},
 {id:'shield',g:'a',n:'Scudo',sh:1,
  get d(){return `   Grunt e Air: assorbe il primo colpo subito, si ricarica in ${SHIELD_T} s (con più scudi entra il prossimo carico)`},
  ic:'<circle cx="0" cy="0" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="0" cy="0" r="3.5" fill="currentColor"/>'},
 {id:'plasma',g:'a',n:'Plasmablade',mel:2,
  get d(){return `   Grunt e Air: danno della mischia +${Math.round((this.mel-1)*100)}%`},
  ic:'<path d="M-7,7 L5,-5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M5,-5 L8,-8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M-9,3 L-3,9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'},
 {id:'revive',g:'a',n:'Rianimazione',rv:1,
  get d(){return `   Sei tornato in piedi al 50% di vita invece di morire. Ricarica ${REVIVE_CD}s (${this.rv} caric${this.rv>1?'he':'a'} per copia)`},
  ic:'<path d="M0,-8 L0,8 M-8,0 L8,0" stroke="currentColor" stroke-width="3"/><circle cx="0" cy="0" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>'},
 {id:'pierce',g:'a',n:'Proiettili perforanti',prc:1,
  get d(){return `   Ogni tua arma perfora i nemici (+${this.prc} per copia)`},
  ic:'<path d="M-8,-6 L6,0 L-8,6 Z" fill="currentColor"/><path d="M-8,-3 L6,0 L-8,3" stroke="currentColor" stroke-width="0.5" fill="none"/>'},
 {id:'radar',g:'a',n:'Radar wallhack',rad:2,
  get d(){return `   I nemici restano visibili per ${this.rad}s dopo aver perso la visuale (più copie = più secondi)`},
  ic:'<circle cx="0" cy="0" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="0" cy="0" r="3" fill="currentColor"/><path d="M0,0 L6,-4" stroke="currentColor" stroke-width="1.5"/>'},
 {id:'turret',g:'g',n:'Torretta',tur:1,
  get d(){return `   Piazza una torretta davanti al mech (${this.tur} per copia). Ricarica ${ABIL_CD.turret}s`},
  ic:'<circle cx="0" cy="0" r="5" fill="currentColor"/><path d="M-6,-6 L6,-6 L6,6 L-6,6 Z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M0,-2 L0,8" stroke="currentColor" stroke-width="2"/>'},
 {id:'wingman',g:'a',n:'Wingman',wmg:1,
  get d(){return `   Schiera un mech alleato che ti segue e combatte al tuo fianco. Max 1 attivo per copia. Ricarica ${ABIL_CD.wingman}s`},
  ic:'<circle cx="3" cy="-3" r="2" fill="currentColor"/><rect x="1" y="0" width="4" height="5" rx="1" fill="currentColor"/><circle cx="-4" cy="-2" r="1.5" fill="currentColor"/><rect x="-5.5" y="0" width="3" height="4" rx="1" fill="currentColor"/>'},
 {id:'grenade',g:'a',n:'Esplosivo',grn:1,
  get d(){return `   Lancia un esplosivo entro ${GRN_RANGE}px: 4× il danno di un missile. Esplode dopo 10s o 0,5s dopo che un nemico è nel raggio. Ricarica ${ABIL_CD.grenade}s (${this.grn} per copia)`},
  ic:'<circle cx="0" cy="0" r="6" fill="currentColor"/><path d="M-3,-6 L-3,-9 M3,-6 L3,-9" stroke="currentColor" stroke-width="1.5"/>'},
 {id:'smoke',g:'a',n:'Fumogeni',smk:1,
  get d(){return `   Lancia un fumogeno (raggio ${SMK_R}px, ${SMK_LIFE}s). Le unità dentro sono visibili solo entro ${SMK_HIDE}px. Ricarica ${ABIL_CD.smoke}s (${this.smk} per copia)`},
  ic:'<circle cx="0" cy="2" r="6" fill="currentColor" opacity="0.7"/><circle cx="0" cy="-4" r="3" fill="currentColor" opacity="0.5"/><circle cx="4" cy="4" r="2" fill="currentColor" opacity="0.5"/>'},
 {id:'nuke',g:'a',n:'Attacco nucleare',nuk:1,
  get d(){return `   Marca un punto a gittata dell'arma: dopo ${NUKE_DELAY}s arriva una bomba con raggio ${NUKE_RADIUS}px. Ricarica ${ABIL_CD.nuke}s (${this.nuk} per copia)`},
  ic:'<path d="M-8,6 Q0,-10 8,6" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="0" cy="6" r="3" fill="currentColor"/><path d="M-2,2 L0,-6 L2,2" fill="currentColor"/>'},
 {id:'slowmo',g:'a',n:'Slow motion',d:`   Per ${SLOW_T} s tutto il gioco scende al ${Math.round(SLOW_W*100)}% della velocità, tu solo al ${Math.round(SLOW_P*100)}%. Ricarica ${SLOW_CD}s`,slw:1,
  ic:'<circle cx=\"0\" cy=\"0\" r=\"7\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.5\"/><path d=\"M0,-4 L0,0 L4,2\" stroke=\"currentColor\" stroke-width=\"1.5\" fill=\"none\"/>'},
 {id:'stealth',g:'a',n:'Stealth',stn:1,
  get d(){return `   Si attiva col tasto della casella: per ${STL_T}s il mech è opaco al ${Math.round(STL_A*100)}%, l'AI impiega ${STL_AIM}× il tempo per mirarti e in deathmatch il tuo nome sparisce. Ricarica ${STL_CD}s dopo l'effetto (${this.stn} per copia)`},
  ic:'<path d="M-9,0 Q0,-8 9,0 Q0,8 -9,0 Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="0" cy="0" r="2.5" fill="currentColor"/><path d="M-8,7 L8,-7" stroke="currentColor" stroke-width="2"/>'},
 // ---- Grunt (giallo) ----
 {id:'gspd',g:'g',n:'Agilità Grunt',spd:1.30,
  get d(){return `   Grunt: velocità +${Math.round((this.spd-1)*100)}%`},
  ic:'<path d="M0,-9 L8,7 L0,3 L-8,7 Z" fill="currentColor"/>'},
 {id:'gfrm',g:'g',n:'Cadenza di fuoco',frm:1.2,
  get d(){return `   Grunt: cadenza di fuoco +${Math.round((this.frm-1)*100)}%`},
  ic:'<rect x="-6" y="-7" width="5" height="4" rx="1.5" fill="currentColor"/><rect x="1" y="-7" width="5" height="4" rx="1.5" fill="currentColor"/><rect x="-6" y="2" width="5" height="4" rx="1.5" fill="currentColor"/><rect x="1" y="2" width="5" height="4" rx="1.5" fill="currentColor"/>'},
 {id:'grlm',g:'g',n:'Ricarica rapida',rlm:.75,
  get d(){return `   Grunt: tempo di ricarica −${Math.round((1-this.rlm)*100)}%`},
  ic:'<rect x="-4" y="-6" width="8" height="11" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M0,-8 A8,8 0 1,0 8,0" fill="none" stroke="currentColor" stroke-width="1.5"/><polygon points="-2,-10 1,-8 -2,-6" fill="currentColor"/>'},
 {id:'gdr',g:'g',n:'Corazza Grunt',drG:6,
  get d(){return `   Grunt: −${this.drG} a ogni danno subito`},
  ic:'<path d="M0,-8 L7,-5 L6,3 L0,9 L-6,3 L-7,-5 Z" fill="currentColor"/>'},
 // ---- Air (blu) ----
 {id:'xarc',g:'x',n:'Angolo di tiro',arc:1.7,
  get d(){return `   Air: angolo di tiro +${Math.round((this.arc-1)*100)}%`},
  ic:'<path d="M0,5 L-8,-6 A12,12 0 0,1 8,-6 Z" fill="currentColor"/>'},
 {id:'xdr',g:'x',n:'Corazza Air',drA:6,
  get d(){return `   Air: −${this.drA} a ogni danno subito`},
  ic:'<path d="M0,-8 L7,-5 L6,3 L0,9 L-6,3 L-7,-5 Z" fill="currentColor"/>'},
{id:'xagi',g:'x',n:'Agilità Air',agi:1.25,
  get d(){return `   Air: velocità di virata e velocità massima +${Math.round((this.agi-1)*100)}%`},
  ic:'<path d="M0,-9 L8,7 L0,3 L-8,7 Z" fill="currentColor"/>'}];
// ---- colori ----
const COLS=[['#d98b2b','#f3c67a'],['#3b82f6','#9cc2ff'],['#65944d','#92bd75'],['#cc0000','#f28b8b'],['#a855f7','#d8b4fe'],['#5a6b7c','#93a5b8'],['#f4f1e8','#e8e2d2'],
 ['#2a2a2a','#5a5a5a'],   // 7  nero antracite
 ['#6b4423','#a67c52'],   // 8  marrone
 ['#ff69b4','#ffc4e1']];  // 9  rosa unicorno
// palette edifici [bordo, tetto]; dal 6 in poi sono speciali (caserma, centrale, radar, serbatoio, edificio VIP, blocco stradale, muro)
const BPAL=[['#3f4a55','#566473'],['#4a4440','#655c55'],['#3b4a63','#52698a'],['#4b4a3c','#66654f'],['#34494d','#4b676c'],['#4a4254','#655a73'],
 ['#5a2323','#8a3a3a'],['#5b5b2a','#8d8d3f'],['#3d5566','#5f86a0'],['#2f5a52','#4f8f82'],['#2f5a52','#5aa595'],['#6b4a12','#c28a1c'],['#3f3d38','#77736a']];
const PAL_BAR=6,PAL_PLANT=7,PAL_RADAR=8,PAL_TANK=9,PAL_VIP=10,PAL_BLK=11,PAL_WALL=12;
const BLD_MIN=64;   // lato minore minimo (px) di un edificio normale: più piccolo di così non viene costruito (muri, container, silos ecc. esclusi)
const ALLEY=PR_PUSH*2;   // vicolo minimo (px) fra due edifici separati della stessa formazione: esattamente la larghezza del Grunt (2×PR_PUSH), che ci passa senza toccare i muri
// tonalità di ogni tipo di sito: [tinta min, max, saturazione min, max, luminosità del tetto min, max]; il piazzale ne prende una versione spenta e scura
//   c base militare · n silos missilistici · a aeroporto · i industria · k centrale nucleare · y cantiere spaziale · t centro direzionale · p porto · f fattoria · v villa · q cava · s arena
const SITE_TONE={c:[74,90,22,32,24,32],n:[56,72,20,30,30,38],a:[200,215,10,18,38,48],i:[16,30,30,42,30,40],k:[158,176,12,22,46,58],y:[212,232,26,38,30,42],
 t:[258,284,14,24,36,48],p:[188,204,22,32,32,42],f:[4,16,40,52,32,42],v:[36,46,30,42,60,70],q:[32,44,26,36,38,48],s:[30,46,8,18,52,64]};
// palette in più (13..28): 13..16 cupe da città cyberpunk, poi terracotta, blu, oliva, ocra, prugna, grafite, cemento, verde, ruggine, petrolio, crema, viola
BPAL.push(['#2b2f3a','#3d4454'],['#2a2538','#41395a'],['#1f3a3f','#2f5c63'],['#3a2a2f','#5a3f48'],
 // nuove, indici 17..28: terracotta, blu, oliva, ocra, prugna, grafite, cemento, verde, ruggine, petrolio, crema, viola
 ['#6b3f2a','#9a5b3c'],['#2e4a6b','#4a79a8'],['#5a6b2e','#86a047'],['#7a6a3a','#b39d55'],['#6b2e4a','#a14d79'],['#3a3a3a','#5c5c5c'],
 ['#8a8f96','#b4b9c0'],['#2f5a3a','#4f8f63'],['#7a3a2a','#c0583a'],['#2a4a52','#3f7f8c'],['#a8a08a','#d2c9ae'],['#5a4a7a','#8a77b8']);
const CONT_COL=['#c0392b','#2e86c1','#d4ac0d','#27ae60','#7f8c8d','#e67e22','#8e44ad','#16a085','#d9dde0','#34495e'];   // colori dei container
// colore del terreno per quota: bassa, media, alta
const LVL_COL=['#4c6b40','#5d7a45','#7c8c55'];
// colore del terreno per natura (M.bio): prato, bosco, roccia, sabbia, cemento, campi
const GROUND_COL=['#4f6a3f','#2b4529','#6e685c','#a8956a','#474b54','#6c7a3c'];
const SFX_LIST={melee:'sfx/sfx-melee.mp3',hit:'sfx/tennis_ball_2.wav',hurt:'sfx/snap.wav',toAir:'sfx/sfx-airdrop.mp3',toGrunt:'sfx/sfx-cards4.mp3',move:'sfx/foley_creak_1.wav',
 boom:'sfx/sfx-explosion.mp3',crash:'sfx/sfx-crollo.mp3',enemy:'sfx/sfx-uzi.mp3',reload:'sfx/sword_drop.wav',nuke:'sfx/sfx-boom.mp3',
 mvWalker:'sfx/foley_creak_1.wav',mvJet:'sfx/sfx-airdrop.mp3',mvTank:'sfx/tracks.mp3',mvVeh:'sfx/vehicle.mp3',crunch:'sfx/crunch_splat.wav'};   // veicoli: movimento del Colosso (passi del mech), del jet, del carro, degli altri mezzi · albero abbattuto da un mezzo
const VEH_WALK_VOL=3;   // Colosso: volume dei passi rispetto a quelli del Grunt (stesso file)

