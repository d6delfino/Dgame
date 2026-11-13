'use strict';
/* AIRGRUNT · AGgame.js — avvio partita, input, mech del giocatore, telecamera, ciclo principale e schermata iniziale.
   Il ciclo è limitato a 30 fps sui dispositivi touch (60 sugli altri) e, se i fotogrammi calano, abbassa da solo la qualità grafica. */
const K={};let md=false,mIn=false,sfxFl=0;G.laser=true;

// ===== Rimappatura tasti/mouse =====
// Ogni azione ha un binding {k:'KeyW'} (tastiera) oppure {m:0} (mouse button) oppure {} (vuoto).
// KEYBIND_DEF è il default; KEYBIND è la copia modificabile; KB è lo stato "premuto" derivato.
const KEYBIND_DEF={
 up:{k:'KeyW'}, down:{k:'KeyS'}, left:{k:'KeyA'}, right:{k:'KeyD'},
 dash:{k:'ShiftLeft'}, fire:{m:0}, melee:{m:2},
 mode:{k:'Space'}, reload:{k:'KeyR'},
 w1:{k:'Digit1'}, w2:{k:'Digit2'}, w3:{k:'Digit3'}, w4:{k:'Digit4'},
 w5:{k:'Digit5'}, w6:{k:'Digit6'},
 cam:{k:'KeyF'}, thermal:{k:'KeyB'}, fullscreen:{k:'KeyO'}
};
const KEYBIND={};for(const a in KEYBIND_DEF)KEYBIND[a]=JSON.parse(JSON.stringify(KEYBIND_DEF[a]));
const KB={};for(const a in KEYBIND_DEF)KB[a]=0;
// Modalità movimento Grunt: 0 = assoluto (WASD = direzioni mondo), 1 = relativo a p.aim (mouse)
let MOVE_MODE=0;
try{const m=localStorage.getItem('airgrunt_move_mode');if(m!=null)MOVE_MODE=clamp(+m||0,0,1)}catch(_){}
function setMoveMode(m){MOVE_MODE=clamp(+m||0,0,1);try{localStorage.setItem('airgrunt_move_mode',String(MOVE_MODE))}catch(_){}renderMoveMode()}
function renderMoveMode(){const b=document.getElementById('ctrlModeToggle');if(b)b.textContent='Movimento Grunt: '+(MOVE_MODE?'Relativo al mouse':'Assoluto')}
// Schema dei binding: incrementare quando cambiano i default di KEYBIND_DEF, ...
const KB_SCHEMA=4;
try{
 const s=localStorage.getItem('airgrunt_keybind');
 const v=+localStorage.getItem('airgrunt_keybind_schema')||0;
 if(s && v===KB_SCHEMA){const o=JSON.parse(s);for(const a in KEYBIND_DEF)if(o&&o[a])KEYBIND[a]=o[a]}
}catch(_){}
function saveKeybind(){try{localStorage.setItem('airgrunt_keybind',JSON.stringify(KEYBIND));localStorage.setItem('airgrunt_keybind_schema',String(KB_SCHEMA))}catch(_){}}
function kbDown(code){for(const a in KEYBIND)if(KEYBIND[a].k===code)KB[a]=1}
function kbUp(code){for(const a in KEYBIND)if(KEYBIND[a].k===code)KB[a]=0}
function kbMouseDown(btn){for(const a in KEYBIND)if(KEYBIND[a].m===btn)KB[a]=1}
function kbMouseUp(btn){for(const a in KEYBIND)if(KEYBIND[a].m===btn)KB[a]=0}
function kbLabel(b){if(!b||(b.k==null&&b.m==null))return'—';
 if(b.k){const c=b.k;
  if(c.startsWith('Key'))return c.slice(3);
  if(c.startsWith('Digit'))return c.slice(5);
  if(c.startsWith('Arrow'))return({ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→'})[c]||c;
  if(c==='Space')return'Spazio';
  if(c==='ShiftLeft')return'Shift Sx';if(c==='ShiftRight')return'Shift Dx';
  if(c==='ControlLeft')return'Ctrl Sx';if(c==='ControlRight')return'Ctrl Dx';
  if(c==='AltLeft')return'Alt Sx';if(c==='AltRight')return'Alt Dx';
  if(c==='Escape')return'Esc';if(c==='Tab')return'Tab';if(c==='Enter')return'Invio';
  if(c==='Backspace')return'Back';if(c==='CapsLock')return'Caps';
  return c.replace(/^Numpad/,'Num')}
 if(b.m!=null)return['Click Sx','Click Centrale','Click Dx','Mouse 4','Mouse 5'][b.m]||('Mouse '+b.m);
 return'—'}
 
const MOBILE=typeof matchMedia=='function'&&matchMedia('(pointer:coarse)').matches,TARGET_FPS=MOBILE?30:60;
let myCi=0,myName='Pilota',loadout=['w0','w1',null,null,null,null];
let myMi=0;
try{const v=localStorage.getItem('airgrunt_model');if(v!=null)myMi=clamp(+v|0,0,7)}catch(_){}

// ===== GESTORE CONTROLLI TOUCH MOBILE =====
const TOUCH = {
  active: MOBILE,
  left: { id: null, x0: 0, y0: 0, x: 0, y: 0, active: false, vx: 0, vy: 0 },
  aim: { id: null, x: 0, y: 0, active: false },   // tap-to-aim (sostituisce il vecchio joystick destro)
  pinch: null,   // { ids:[id1,id2], d0, zoom0 } — zoom con due dita
  btns: [],
  auto: MOBILE&&(()=>{try{return localStorage.getItem('agAuto')!=='0'}catch(_){return true}})(),   // AUTO: mira e spara da solo al nemico visibile più vicino (se nessun dito sulla mira)
  lock: null,    // bersaglio agganciato (coordinate schermo), per il disegno
  af: false      // il fuoco è acceso dalla modalità AUTO
};

function cycleWeapon(){
  if(G.over || !P.eq || P.eq.length <= 1) return;
  const idx = P.eq.indexOf(P.w);
  P.w = P.eq[(idx + 1) % P.eq.length];
}

function updateTouchButtons(){
  const bw = W, bh = H, s = clamp(Math.min(W,H)/430, .8, 1.25);   // scala sui pixel dello schermo
  const X = o => bw - o*s, Y = o => bh - o*s;                     // posizioni relative all'angolo in basso a destra
  const B = (id,x,y,r,label,col,action,on) => ({ id, x, y, r: r*s, label, col, action, on });
  TOUCH.btns = [
    B('dash',   X(70),  Y(70),  34, 'DASH', '#8b5cf6', dash),
    B('melee',  X(150), Y(62),  30, 'LAMA', '#e2e8f0', melee),
    B('mode',   X(70),  Y(155), 30, P&&P.air?'GRUNT':'AIR', '#4aa3ff', toggleMode),
    B('reload', X(150), Y(138), 28, 'RIC',  '#ffd23f', reload),
    B('weapon', X(150), Y(210), 28, 'ARMA', '#ff3b3b', cycleWeapon),
    ...(ARM.near ? [B('arm', X(70), Y(228), 30, 'ARM', '#3fd05a', armOpen)] : []),   // solo vicino a un'armeria
    // riga in alto, a sinistra dei pulsanti HTML (schermo intero e volume)
    B('cam',  X(92),  30*s, 22, camLocked?'🔒':'F', camLocked?'#ffd23f':'#3fae4a',
      ()=>{ camResetT=0.2; camResetX0=camOffX; camResetY0=camOffY; camLocked=camLocked?0:1; say(camLocked?'Telecamera bloccata sul mech':'Telecamera libera'); }, !!camLocked),
    B('zoom', X(146), 30*s, 22, 'x'+(Math.round(zoomUserMul*100)/100), '#9bd3a1',
      ()=>{ const L=[.75,1,1.35,1.8], i=L.findIndex(v=>v>zoomUserMul+.02); zoomUserMul=L[i<0?0:i]; say('Zoom x'+zoomUserMul); }),
    B('auto', X(200), 30*s, 22, 'AUTO', TOUCH.auto?'#3fd05a':'#888',
      ()=>{ TOUCH.auto=!TOUCH.auto; try{localStorage.setItem('agAuto',TOUCH.auto?'1':'0')}catch(_){} say(TOUCH.auto?'Mira automatica attiva':'Mira automatica disattivata'); }, TOUCH.auto)
  ];
}
// ===== intro dropship (solo grafica: arrivo → giro → partenza) =====
const DS={on:false,ships:[]};
const DS_T={delay:.25,hover:.6,turn:.9,depart:2.6};
function dsStart(){
 DS.on=true;DS.out=false;DS.ships=[];
 const list=[{id:NET.id,x:P.x,y:P.y,ci:P.ci}];
 for(const k in others){const q=others[k];if(q)list.push({id:q.id,x:q.x||q.tx||P.x,y:q.y||q.ty||P.y,ci:q.ci|0})}
 list.forEach((p,i)=>{
  const ang=-2.2+i*.18+BASE.k*Math.PI/2,lx=p.x,ly=p.y;
  // già sullo spawn, orientata come in atterraggio (prua verso il punto di arrivo)
  DS.ships.push({id:p.id,ci:p.ci|0,t:-i*DS_T.delay,x:lx,y:ly,
   h:ang+Math.PI,landX:lx,landY:ly,departAng:ang,turnSfx:false,done:false});
 });
}
function dsUpdate(dt){
 if(!DS.on)return;
 let allDone=true;
 for(const s of DS.ships){
  if(s.done)continue;allDone=false;s.t+=dt;
  const ta=s.arr||0,th=DS_T.hover+(s.hv||0),tt=DS_T.turn,td=DS_T.depart;   // arr/hv: solo nell'estrazione (arrivo e carico)
  if(s.t<0)continue;
  const t=s.t-ta;
  if(t<0){
   // arrivo: dal bordo verso il punto di prelievo, frenando
   if(!s.arrSfx){s.arrSfx=true;sfxAt(SFX_LIST.toAir,.6,s.landX,s.landY,0)}
   const u=s.t/ta,e=(1-u)*(1-u);
   s.x=s.landX+Math.cos(s.departAng)*e*1400;
   s.y=s.landY+Math.sin(s.departAng)*e*1400;
   s.h=s.departAng+Math.PI;
  }else if(t<th){
   // breve sosta (nasconde il player)
   s.x=s.landX;s.y=s.landY;s.h=s.departAng+Math.PI;
  }else if(t<th+tt){
   // giro 180°
   if(!s.turnSfx){s.turnSfx=true;sfxAt(SFX_LIST.toAir,.55,s.x,s.y,80)}
   const u=(t-th)/tt,e=u*u*(3-2*u);
   s.x=s.landX;s.y=s.landY;s.h=s.departAng+Math.PI+e*Math.PI;
  }else if(t<th+tt+td){
   // partenza
   const u=(t-th-tt)/td,e=u*u;
   s.x=s.landX+Math.cos(s.departAng)*e*1400;
   s.y=s.landY+Math.sin(s.departAng)*e*1400;
   s.h=s.departAng;
  }else{s.done=true}
 }
 if(allDone)DS.on=false;
}
// ===== estrazione finale (solo grafica): una dropship per giocatore arriva, lo carica e riparte =====
function dsExtract(){
 DS.on=true;DS.out=true;DS.ships=[];
 // missione 2: il VIP sale PER PRIMO (i=0), poi l'host e gli altri
 const list=[];
 if(G.mode!=1&&G.mt==2&&MS.al&&MS.al.st&&MS.al.hp>0)list.push({id:'vip',x:MS.al.x,y:MS.al.y,ci:2});
 if(G.mode!=1&&G.mt==10)for(const v of MS.vips||[])if((v.on||v.saved)&&!v.dead&&v.hp>0)list.push({id:'vip'+v.n,x:v.x,y:v.y,ci:2});   // missione 10: ogni VIP recuperato o in salvo sale su una dropship, prima dei giocatori
 list.push({id:NET.id,x:P.x,y:P.y,ci:P.ci});
 for(const k in others){const q=others[k];if(q&&q.hp>0)list.push({id:q.id,x:q.x,y:q.y,ci:q.ci|0})}
 list.forEach((p,i)=>{const ang=-2.2+i*.18+BASE.k*Math.PI/2;
  DS.ships.push({id:p.id,ci:p.ci|0,t:-i*.35,x:p.x,y:p.y,h:ang+Math.PI,landX:p.x,landY:p.y,departAng:ang,arr:2.4,hv:.8,turnSfx:false,done:false})})}
const dsHides=id=>(SH.on&&SH.t>=SH_BOARD)||(DS.out&&DS.ships.some(s=>s.id===id&&s.t>=(s.arr||0)+.5));   // il mech è "a bordo": non si disegna più
// ===== mech: caselle intercambiabili (armi e upgrade) =====
const eqW=()=>{const a=loadout.filter(s=>s&&s[0]=='w').map(s=>+s.slice(1));return a.length?a:[W_NONE]};
const upOf=s=>s&&s[0]=='u'?UPGRADES.find(u=>u.id==s.slice(2)):null;   // id degli upgrade nella casella: 'u:<id>'
const upMul=k=>loadout.reduce((m,s)=>{const u=upOf(s);return u&&u[k]?m+(u[k]-1):m},1);  // i bonus si sommano: 1 + 0,2 + 0,2 = 1,4
const upSum=k=>loadout.reduce((m,s)=>{const u=upOf(s);return u&&u[k]?m+u[k]:m},0);
function applyLoadout(p){p.eq=eqW();p.w=p.eq[0];p.spd=upMul('spd');p.frm=upMul('frm');p.rlm=upMul('rlm');p.qa=ARC_DEG*Math.PI/180*upMul('arc');p.dcm=1+upSum('dcm');p.drG=upSum('drG');p.drA=upSum('drA');p.rgA=upSum('rgA')>0;p.rgG=upMul('rgG');p.agi=upMul('agi');p.dmx=upSum('dmx');p.shn=upSum('sh');p.mlm=upMul('mel');
 // nuove abilità
 p.rvn=upSum('rv');
 p.prc=upSum('prc');
 p.radar=upSum('rad');
 p.turn=upSum('tur');
 p.grn=upSum('grn');
 p.smk=upSum('smk');
 p.nuk=upSum('nuk');
 SLOW.cds=Array.from({length:upSum('slw')|0},(_,i)=>SLOW.cds[i]||0);   // slow motion: una ricarica per copia, mantenendo quelle in corso
 p.ws=WEAPONS.map((w,i)=>newWS(i))}
function resetPlayer(p){Object.assign(p,{vx:0,vy:0,h:0,mh:0,fa:0,aim:0,air:false,z:0,hp:100,hpMax:100,sp:0,dt:0,da:0,dc:0,mc:0,sw:0,fl:0,dd:0,rs:null,unseen:5,hid:true,lh:null,shs:Array(p.shn|0).fill(0),sg:0,
 revive:Array(Math.max(0,parseInt(p.rvn)||0)).fill(0),
 turs:Array(p.turn|0).fill(0),
 grns:Array(p.grn|0).fill(0),
 smks:Array(p.smk|0).fill(0),
 nuks:Array(p.nuk|0).fill(0)});p.ws=WEAPONS.map((w,i)=>newWS(i));p.w=p.eq[0]}
P=newPlayer(0,0,'Pilota');P.eq=[W_MG];applyLoadout(P);resetPlayer(P);
// ===== nuova partita (stesso codice per singolo, host e client: la mappa deriva dal seed) =====
function startGame(seed,isClient){
 G.seed=seed;G.over=0;G.ot=0;G.overMsg='';G.msg='';G.msgT=0;G.fog=1;G.t=0;G.ext=0;NK.on=0;SH.on=0;G.deathT=0;SLOW.t=0;SLOW.own=-1;SLOW.f=0;SLOW.cds.fill(0);
 playBgm(); // <-- Avvia la musica di sottofondo
 // METEO: se il giocatore ha scelto "Casuale" (-1), viene derivato dal seed in modo deterministico
 // (host e client calcolerebbero lo stesso valore; il client, in realtà, lo riceve già dall'host via welcome).
 // Con isClient=true non tocchiamo WX: è già stato impostato da Handlers.welcome (0 sereno / 1 pioggia / 2 neve).
 if(!isClient){
  const wm=(G.weatherMode==null?-1:G.weatherMode);
  if(wm===-1){
   const R=rng((seed^0xC0FFEE)>>>0),v=R();
   WX.rain=v<.30?1:0;                                 // <30%  → pioggia
   WX.snow=(!WX.rain&&v<.50)?1:0;                     // 30–50% → neve
   WX.sand=(!WX.rain&&!WX.snow&&v<.65)?1:0;           // 50–65% → tempesta di sabbia, ≥65% → sereno
  }else{
   WX.rain=wm===1?1:0;WX.snow=wm===2?1:0;WX.sand=wm===3?1:0;
  }
 }
 // Audio meteo: pioggia e tempesta di sabbia partono se attive, si fermano altrimenti (host e client)
 if(WX.rain)rainLoopStart();else rainLoopStop();
 if(WX.sand)windLoopStart();else windLoopStop();
 if(!isClient && G.mode!=1){const taken=new Set([P.ci]);const avail=COLS.map((_,i)=>i).filter(i=>i!==1&&!taken.has(i));G.aiCi=avail.length?avail[Math.floor(Math.random()*avail.length)]:null}
 
 // LOOP: se la mappa creata non può ospitare la missione scelta, cambia seme e riprova all'istante (fino a 50 volte)
 let attempt = 0, currentSeed = seed;
 while (attempt < 50) {
  genMap(currentSeed);
  missionStatic();
  if (G.mode == 1 || G.sel <= 0 || G.mt === G.sel) break;
  attempt++;
  currentSeed = (seed + attempt * 12345) >>> 0;
 }
 
 civInit();armInit();chunkReset();wetReset();
 units=[];bullets=[];slashes=[];fxP.length=0;smokes=[];NUKES=[];
 dirtyObs.clear();NET.rm=[];NET.sq=[];NET.cq=[];NET.cv=[];NET.lastN=-1;NET.fk=0;PQ.length=0;MS={t:0,st:0,al:null};
 campClampLoadout();applyLoadout(P);   // garantisce che P.rvn/P.revive/P.shs siano coerenti con loadout, qualunque sia il percorso d'avvio
 resetPlayer(P);P.kills=0;const[x,y]=G.mode==1&&!isClient?dmPoint():spawnAt(NET.id);P.x=x;P.y=y;P.id=NET.id;
 for(const k in others){const q=others[k];q.hp=100;q.kills=0;q.dd=0;q.rs=null;q.unseen=5;q.hid=true;if(!isClient){const s=G.mode==1?dmPoint():spawnAt(q.id);q.x=q.tx=s[0];q.y=q.ty=s[1];send(NET.conns[q.id],{t:'rs',x:s[0],y:s[1]})}}
 if(!isClient){if(G.mode==1){dmInit();for(const k in others)dmEnsure('p'+k,others[k].name)}else{populate();missionSpawn()}}
 else if(G.mode!=1)missionClientInit();else DM.sc={};
 camReset();mx=W/2;my=H/2;dsStart();bakeStart();campOnStart()}
const newSeed=()=>Math.floor(Math.random()*1e5);
function restartGame(){if(NET.on&&!NET.host)return;const s=CAMP.on?campNext():newSeed();if(NET.on)bcast({t:'ld'});startGame(s,false);if(NET.on){bcast({t:'init',seed:s,mis:G.sel,diff:G.diff,mode:G.mode,prof:G.profile,wx:WX.rain?1:WX.snow?2:WX.sand?3:0,camp:campPack()});const gr=performance.now()+NET_LOAD_GRACE;for(const k in others)others[k].ld=gr}}

// ===== Abilità del giocatore (upgrade attivi) =====
const ABIL_CD={turret:30,grenade:60,smoke:45,nuke:90};
const GRN_RANGE=200,SMK_RANGE=400,SMK_R=200,SMK_LIFE=30,SMK_HIDE=40;
const NUKE_DELAY=5,NUKE_RADIUS=300,NUKE_DMG=500;

function throwTurret(){
 if(G.over||G.ext||P.hp<=0||P.air)return;
 if(!P.turn){say('Nessuna torretta equipaggiata');return}
 const myTurrets=units.filter(u=>u.plTurret&&u.owner===P.id&&!u.dead);
 if(myTurrets.length>=P.turn){say('Hai già tutte le torrette in campo');return}
 const i=P.turs.findIndex(t=>t<=0);
 if(i<0){say('Torretta non carica');return}
 const tx=P.x+Math.cos(P.fa)*80,ty=P.y+Math.sin(P.fa)*80;
 if(inWater(tx,ty,20)||!clearAt(tx,ty,20)){say('Posizione non valida');return}
 P.turs[i]=ABIL_CD.turret;
 if(NET.on&&!NET.host){send(NET.hostConn,{t:'ptur',x:tx,y:ty,a:P.fa});return}
 spawnPlayerTurret(P.id,tx,ty,P.fa);
 if(NET.on)bcast({t:'ptur',id:P.id,x:tx,y:ty,a:P.fa});
}
function spawnPlayerTurret(owner,x,y,a){
 const u=mkUnit(0,x,y,-1);
 u.sec=1;u.plTurret=1;u.owner=owner;
 u.hp=u.mhp=200;u.ar=2;u.th=u.h=a;
 if(u.bw!=null){u.bw=null;u.ws=newWS(W_MG)}
 fxSpawn(x,y,'#3fd05a',16,true,40);sfxAt(SFX_LIST.toGrunt,.6,x,y,60);
 return u;
}

function throwGrenade(){
 if(G.over||G.ext||P.hp<=0)return;
 if(!P.grn){say('Nessun esplosivo equipaggiato');return}
 const i=P.grns.findIndex(t=>t<=0);
 if(i<0){say('Esplosivo non carico');return}
 const tx=mx/zoom+camX,ty=my/zoom+camY;
 const d=Math.hypot(tx-P.x,ty-P.y);
 if(d>GRN_RANGE){say('Troppo lontano (max '+GRN_RANGE+'px)');return}
 P.grns[i]=ABIL_CD.grenade;
 if(NET.on&&!NET.host){send(NET.hostConn,{t:'grn',x:tx,y:ty});return}
 spawnGrenade(P.id,P.x,P.y,tx,ty);
}
function spawnGrenade(owner,sx,sy,tx,ty){
 const dx=tx-sx,dy=ty-sy,d=Math.hypot(dx,dy)||1,a=Math.atan2(dy,dx),speed=450;
 // life = tempo di volo fino al punto target. Una volta arrivato, il proiettile si ferma
 // (vedi bulletsStep) e resta in attesa dell'innesco.
 const life=Math.min(10,d/speed+.02);
 // stessa arma del lanciarazzi: raggio di esplosione e cratere identici a un missile,
 // ma con 4× il danno (90 × 4 = 360).
 const MW=WEAPONS[W_RKT];
 const b={x:sx,y:sy,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed,
  life,w:W_RKT,o:owner,fly:0,tz:-1,sm:1,
  dmg:MW.dmg*4, ex:MW.ex, pierce:0,
  fuse:10,       // innesco di sicurezza: esplode comunque dopo 10 s
  detect:0};     // accumulo di "nemico nel raggio" (esplode a 0.5 s)
 addBullet(b,true);
}

function throwSmoke(){
 if(G.over||G.ext||P.hp<=0)return;
 if(!P.smk){say('Nessun fumogeno equipaggiato');return}
 const i=P.smks.findIndex(t=>t<=0);
 if(i<0){say('Fumogeno non carico');return}
 const tx=mx/zoom+camX,ty=my/zoom+camY;
 const d=Math.hypot(tx-P.x,ty-P.y);
 if(d>SMK_RANGE){say('Troppo lontano (max '+SMK_RANGE+'px)');return}
 P.smks[i]=ABIL_CD.smoke;
 if(NET.on&&!NET.host){send(NET.hostConn,{t:'smk',x:tx,y:ty});return}
 spawnSmoke(tx,ty);
 if(NET.on)bcast({t:'smk',id:P.id,x:tx,y:ty});
}
function spawnSmoke(x,y){
 smokes.push({x,y,r:SMK_R,t:0,life:SMK_LIFE});
 fxSpawn(x,y,'#b8b8b8',20,true,50);sfxAt(SFX_LIST.crash,.5,x,y,60);
}

function throwNuke(){
 if(G.over||G.ext||P.hp<=0)return;
 if(!P.nuk){say('Nessun attacco nucleare equipaggiato');return}
 const i=P.nuks.findIndex(t=>t<=0);
 if(i<0){say('Attacco nucleare non carico');return}
 const tx=mx/zoom+camX,ty=my/zoom+camY;
 const d=Math.hypot(tx-P.x,ty-P.y);
 if(d>WEAPONS[P.w].range){say('Fuori gittata dell\'arma');return}
 P.nuks[i]=ABIL_CD.nuke;
 if(NET.on&&!NET.host){send(NET.hostConn,{t:'nuk',x:tx,y:ty});return}
 NUKES.push({x:tx,y:ty,t:0,owner:P.id,flash:-1});
 sfxAt(SFX_LIST.toAir,.5,tx,ty,80);say('Attacco nucleare in arrivo!');
 if(NET.on)bcast({t:'nuk',id:P.id,x:tx,y:ty});
}
function throwSlow(){
 if(G.over||G.ext||P.hp<=0)return;
 const i=SLOW.cds.findIndex(t=>t<=0);
 if(i<0){say('Slow motion non carico ('+Math.ceil(Math.min(...SLOW.cds))+' s)');return}   // mostra il tempo della copia più vicina a ricaricarsi
 SLOW.cds[i]=SLOW_CD;
 if(NET.on&&!NET.host){send(NET.hostConn,{t:'slw'});return}   // client: attende l'eco dell'host
 slowStart(NET.id);
 if(NET.on)bcast({t:'slw',id:NET.id});
}

// tick dei cooldown (chiamato in playerUpdate dentro if(A))
function tickAbilCD(q,dt){
 if(q.revive)for(let i=0;i<q.revive.length;i++)if(q.revive[i]>0)q.revive[i]=Math.max(0,q.revive[i]-dt);
 if(q.turs)for(let i=0;i<q.turs.length;i++)if(q.turs[i]>0)q.turs[i]=Math.max(0,q.turs[i]-dt);
 if(q.grns)for(let i=0;i<q.grns.length;i++)if(q.grns[i]>0)q.grns[i]=Math.max(0,q.grns[i]-dt);
 if(q.smks)for(let i=0;i<q.smks.length;i++)if(q.smks[i]>0)q.smks[i]=Math.max(0,q.smks[i]-dt);
 if(q.nuks)for(let i=0;i<q.nuks.length;i++)if(q.nuks[i]>0)q.nuks[i]=Math.max(0,q.nuks[i]-dt);
}

// ===== azioni del giocatore =====
function toggleMode(){const p=P;if(G.over||G.ext||p.sw>0||p.hp<=0)return;
 if(p.dc>DASH_CD*(p.dcm-1)){say('Barra scatto non carica');return}
 if(p.air){p.air=false;p.z=0;p.mh=p.h;sfx(SFX_LIST.toGrunt,.7)}else{p.air=true;p.z=1;p.dt=0;p.h=p.mh;p.sp=Math.max(Math.hypot(p.vx,p.vy),120);sfx(SFX_LIST.toAir,.7)}
 p.dc+=DASH_CD;p.sw=.6}
function dash(){const p=P,x=(KB.right?1:0)-(KB.left?1:0),y=(KB.down?1:0)-(KB.up?1:0);if(G.over||G.ext||p.air||p.hp<=0||p.dc>DASH_CD*(p.dcm-1))return;
 let ax=x,ay=y;
 if(MOVE_MODE===1 && (ax||ay)){const ca=Math.cos(p.aim),sa=Math.sin(p.aim),fwd=-ay,rt=ax;ax=fwd*ca-rt*sa;ay=fwd*sa+rt*ca}
 p.da=(ax||ay)?Math.atan2(ay,ax):p.mh;p.dt=DASH_T;p.dc+=DASH_CD}
function melee(){const p=P;if(G.over||G.ext||G.baking||!G.started||p.mc>0||p.hp<=0)return;
 if(p.dc>DASH_CD*(p.dcm-MELEE_COST)){say('Barra scatto troppo scarica');return}
 const a=p.air?(p.it>0?p.ia:p.h):p.mh;
 const sc=p.air?1:MECH_SCALE;   // mech Grunt al 75% → fendente al 75% (in Air resta pieno)
 p.mc=MELEE_CD;p.dc=Math.min(DASH_CD*p.dcm,p.dc+DASH_CD*MELEE_COST);
 slashes.push({id:NET.id,a,t:0,life:.22,hit:new Set(),n:0,sc});sfx(SFX_LIST.melee,.8);
 if(authority()){if(NET.on)bcast({t:'sl',id:NET.id,a,sc})}
 else send(NET.hostConn,{t:'melee',x:p.x,y:p.y,a,z:p.z,sc})}
function reload(){const p=P,w=WEAPONS[p.w],ws=p.ws[p.w];if(!G.over&&ws.rl<=0&&ws.a<w.mag){ws.rl=w.reload*(p.air?1:p.rlm);sfx(SFX_LIST.reload,.7)}}
function flameShot(p,a,w,A){flameFx(p.x,p.y,a,w);
 if(A){flameHit(p.x,p.y,a,p.z,{...w,dmg:w.dmg+dmxB(p.dmx,w)},p.id);if(NET.on)bcast({t:'fl',id:NET.id,x:p.x,y:p.y,a})}
 else{send(NET.hostConn,{t:'fl',x:p.x,y:p.y,a});flameHit(p.x,p.y,a,p.z,w,p.id,true)}}   // dry: il client tiratore marca il burn localmente
function playerFire(p,a,A){const w=WEAPONS[p.w],ws=p.ws[p.w];if(!readyWS(ws))return;
 const rl=spendWS(ws,p.w,p.air?1:p.frm,p.air?1:p.rlm);p.fl=.04;
 if(w.flame)flameShot(p,a,w,A);
 else{const dEnd=Math.min(w.range,Math.hypot(mx/zoom+camX-p.x,my/zoom+camY-p.y));
  for(const b of fireWeapon(p,p.w,a,dEnd,-1,20)){addBullet(b,A);if(!A)NET.cq.push(b)}}      // client: il colpo locale è solo grafica, l'host crea quello vero
 if(w.sfx&&(!w.sg||performance.now()>sfxFl)){sfx(w.sfx,w.vol);sfxFl=performance.now()+(w.sg||0)}
 if(rl)sfx(SFX_LIST.reload,.7)}
// ===== telecamera: segue il mech; col cursore sul bordo la visuale scorre =====
let camPx=0,camPy=0,camOffX=0,camOffY=0,camResetT=0,camResetX0=0,camResetY0=0;
let camLocked=1;   // 1 = camera bloccata sul mech (DEFAULT); 0 = libera, il puntatore ai bordi sposta la visuale
const camZoomTarget=p=>{
  const r=Math.min(W,H)/CAM.ref,base=MOBILE?Math.pow(Math.max(.05,r),.55):r;   // touch: schermi piccoli meno rimpiccioliti (mech leggibile)
  const z=CAM.zoom*Math.min(1,Math.max(0.05,base))*Math.min(p.air?CAM.far:1,WEAPONS[p.w].camZ||1)*zoomUserMul;
  return isFinite(z)&&z>0.05?z:1;   // valore di sicurezza
};
function camRange(p,V,WORLD,mw){const top=Math.max(0,WORLD-V);let lo=clamp(p-V+mw,0,top),hi=clamp(p-mw,0,top);if(lo>hi)lo=hi=(lo+hi)/2;return[lo,hi]}
function camReset(){camOffX=camOffY=0;camResetT=0;camPx=P.x;camPy=P.y;zoom=camZoomTarget(P);camUpdate(0)}
function camUpdate(dt){
  if(!P || W<2 || H<2 || !isFinite(zoom) || zoom<0.05){ zoom=1; return; }
  mx = clamp(mx, 0, W); my = clamp(my, 0, H);
  
  const targetZoom = camZoomTarget(P);
  if(isFinite(targetZoom) && targetZoom > 0.05) {
    zoom += (targetZoom - zoom) * Math.min(1, 3*dt);
  }
  
  const VW = W/zoom, VH = H/zoom, mw = CAM.margin/zoom;
  if(!isFinite(VW) || !isFinite(VH)) return;

  if(Math.hypot(P.x - camPx, P.y - camPy) > 400) { camOffX = camOffY = 0; camResetT = 0; }
  camPx = P.x; camPy = P.y;

  // Transizione fluida di 0.2 secondi verso il centro
  if(camResetT > 0 && dt > 0){
    camResetT = Math.max(0, camResetT - dt);
    const f = camResetT / 0.2, e = f * f * (3 - 2 * f); // Curva smoothstep
    camOffX = camResetX0 * e;
    camOffY = camResetY0 * e;
  }
  
  const Lx = Math.max(0, VW/2 - mw), Ly = Math.max(0, VH/2 - mw);
  camOffX = clamp(camOffX, -Lx, Lx); camOffY = clamp(camOffY, -Ly, Ly);
  
  const [lx, hx] = camRange(P.x, VW, WW, mw), [ly, hy] = camRange(P.y, VH, WH, mw);
  let x = clamp(P.x - VW/2 + camOffX, lx, hx), y = clamp(P.y - VH/2 + camOffY, ly, hy);
  
  if(dt > 0 && mIn && camResetT <= 0 && !camLocked){
    const E = CAM.edge, dx = (mx<=E?-1:0) + (mx>=W-E?1:0), dy = (my<=E?-1:0) + (my>=H-E?1:0), n = Math.hypot(dx,dy);
    if(n){
      const s = CAM.pan * dt / zoom / n, nx = clamp(x + dx*s, lx, hx), ny = clamp(y + dy*s, ly, hy);
      if(nx !== x){ camOffX = nx + VW/2 - P.x; x = nx; }
      if(ny !== y){ camOffY = ny + VH/2 - P.y; y = ny; }
    }
  }
  camX = isFinite(x) ? x : P.x;
  camY = isFinite(y) ? y : P.y;
}// ===== AIUTO ALLA MIRA (touch): aggancia il nemico più vicino al dito; con AUTO mira e spara da solo =====
const ASSIST_R=95;   // px schermo: raggio di aggancio attorno al dito
function touchTargets(p){const rg=WEAPONS[p.w].range*.95,out=[];
 for(const u of units){if(u.dead||!(u.hp>0)||u.sec)continue;const d=Math.hypot(u.x-p.x,u.y-p.y);if(d<=rg)out.push({e:u,d})}
 if(G.mode==1)for(const k in others){const q=others[k];if(q&&q.hp>0){const d=Math.hypot(q.x-p.x,q.y-p.y);if(d<=rg)out.push({e:q,d})}}
 return out}
function touchAssist(p,live){
 if(!MOBILE){TOUCH.lock=null;return}
 let best=null;
 // lead: velocità del proiettile dell'arma attuale. Se l'arma non spara proiettili "reali"
 // (lanciafiamme, disarmato) oppure è troppo lenta per avere un tempo di volo utile, il lead è 0.
 const w0=WEAPONS[p.w],spd=(w0&&w0.speed>100)?w0.speed:0;
 // posizione prevista del bersaglio al tempo di volo (3 iterazioni convergono in pratica sempre)
 const leadPos=e=>{
  if(!spd)return[e.x,e.y];
  let ex=e.x,ey=e.y;
  for(let i=0;i<3;i++){
   const d=Math.hypot(ex-p.x,ey-p.y),t=d/spd;
   ex=e.x+(e.vx||0)*t;ey=e.y+(e.vy||0)*t;
  }
  return[ex,ey];
 };
 if(TOUCH.aim.active){   // dito sulla mira: aggancia il nemico visibile più vicino al DITO (distanza del punto previsto)
  let bd=ASSIST_R;
  for(const t of touchTargets(p)){const e=t.e;
   const[lx,ly]=leadPos(e);
   const d=Math.hypot((lx-camX)*zoom-TOUCH.aim.x,(ly-camY)*zoom-TOUCH.aim.y);
   if(d<bd&&seen(e.x,e.y,!!e.z)){bd=d;best=e}}
 }else if(TOUCH.auto&&live){   // AUTO: nemico visibile più vicino per distanza PREVISTA (con lead)
  const ts=touchTargets(p);
  for(const t of ts){const[lx,ly]=leadPos(t.e);t.ld=Math.hypot(lx-p.x,ly-p.y)}
  ts.sort((a,b)=>a.ld-b.ld);
  for(let i=0;i<ts.length&&i<8;i++){const e=ts[i].e;if(e.slp)continue;
   if(p.air&&Math.abs(ad(Math.atan2(e.y-p.y,e.x-p.x),p.h))>p.qa)continue;
   if(seen(e.x,e.y,!!e.z)){best=e;break}}
  if(best){md=true;TOUCH.af=true}
 }
 if(!best&&TOUCH.af&&!TOUCH.aim.active){md=false;TOUCH.af=false}   // niente più bersagli (o AUTO spento): smette di sparare
 if(best){
  const[lx,ly]=leadPos(best);                                    // il mirino va sul punto di impatto previsto, non sulla posizione attuale
  mx=clamp((lx-camX)*zoom,0,W);
  my=clamp((ly-camY)*zoom,0,H);
  TOUCH.lock={x:mx,y:my};
 }else{TOUCH.lock=null;
  if(!TOUCH.aim.active){const dir=p.air?p.h:(p.it>0?p.ia:null);   // senza bersaglio né dito: il mech guarda dove cammina
   if(dir!=null){mx=clamp((p.x-camX)*zoom+Math.cos(dir)*220,0,W);my=clamp((p.y-camY)*zoom+Math.sin(dir)*220,0,H)}}}}
// ===== giocatore locale =====
function playerUpdate(dt,A){const p=P,rd=dt,live=p.hp>0&&!G.over&&!G.ext&&!G.menu,KK=live?KB:{};dt*=tsOf(NET.id);if(!live&&p.air&&p.hp<=0){p.air=false;p.z=0}
 p.sw=Math.max(0,p.sw-dt);p.mc=Math.max(0,p.mc-dt);p.fl=Math.max(0,p.fl-dt);p.dc=Math.max(0,p.dc-dt);
 for(let i=0;i<p.ws.length;i++)tickWS(p.ws[i],i,dt);
 let fw=KK.up?1:0, bk=KK.down?1:0, tr=(KK.right?1:0)-(KK.left?1:0);
 if(TOUCH.left.active){
   if(p.air){
     tr = clamp(TOUCH.left.vx * 1.5, -1, 1);
     if(TOUCH.left.vy < -0.2) fw = 1;
     else if(TOUCH.left.vy > 0.3) bk = 1;
   } else {
     tr = TOUCH.left.vx;
     bk = TOUCH.left.vy > 0 ? TOUCH.left.vy : 0;
     fw = TOUCH.left.vy < 0 ? -TOUCH.left.vy : 0;
   }
 }
 // direzione grezza in coordinate schermo (x=destra, y=giù): tr = orizzontale, bk-fw = verticale (W = -1)
 let dxs=tr, dys=bk-fw;
 // modalità relativa: solo tastiera (il joystick touch è già relativo al dito) e solo Grunt (in Air il volo è già relativo a p.h)
 if(MOVE_MODE===1 && !p.air && !TOUCH.left.active && (dxs||dys)){
  const ca=Math.cos(p.aim),sa=Math.sin(p.aim),fwd=-dys,rt=dxs;
  dxs=fwd*ca - rt*sa;
  dys=fwd*sa + rt*ca;
 }
 const il=Math.hypot(dxs,dys),ix=il?dxs/il:0,iy=il?dys/il:0;G.fog+=((p.air?0:1)-G.fog)*Math.min(1,6*rd);
 if(il){p.ia=Math.atan2(iy,ix);p.it=.4}else p.it=Math.max(0,(p.it||0)-dt);   // ultima direzione WASD (assoluta, come lo scatto) e per quanto è ancora valida
 if(live){
  if(p.air){
   const boost=(!G.over&&!G.ext&&p.hp>0&&KB.dash&&p.dc<DASH_CD*p.dcm);
   if(boost)p.dc=Math.min(DASH_CD*p.dcm,p.dc+DASH_CD*p.dcm*1*dt);   // netto ~50%/s (compensa la ricarica)
   p.h+=tr*AIR_TURN*p.agi*(boost?1.7:1)*dt;                           // +70% virata mentre Shift è premuto
   p.sp+=((fw?AIR_V*p.agi:0)-p.sp)*Math.min(1,(fw?1.1:bk?2.5:.35)*dt);
   p.vx=Math.cos(p.h)*p.sp;p.vy=Math.sin(p.h)*p.sp;
  }else{const hill=inHill(p.x,p.y)?HILL_SLOW:1,wat=!onBridge(p.x,p.y)&&inWater(p.x,p.y,0)?WATER_SLOW:1;
   if(p.dt>0){p.dt-=dt;p.vx=Math.cos(p.da)*DASH_V*wat;p.vy=Math.sin(p.da)*DASH_V*wat}else{p.vx=ix*GRUNT_V*p.spd*hill*wat;p.vy=iy*GRUNT_V*p.spd*hill*wat}
   if(Math.hypot(p.vx,p.vy)>10)p.mh=Math.atan2(p.vy,p.vx)}
  const ox=p.x,oy=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;
  if(p.air){p.x=clamp(p.x,16,WW-16);p.y=clamp(p.y,16,WH-16)}else{
    push(p,p.dt>0?PR_PUSH_DASH:PR_PUSH,1); // durante il dash l'ingombro si dimezza: si passa nei vicoli stretti
   // Nuova collisione con nemici e altri giocatori (repulsione)
   for(const e of units.concat(Object.values(others)))if(e.hp>0&&!e.z&&!e.air){const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy);if(d<34&&d>.1){p.x+=dx/d*(34-d)*12*dt;p.y+=dy/d*(34-d)*12*dt}}
  }
  walkSnd(!p.air&&Math.hypot(p.x-ox,p.y-oy)>15*dt)}
 else walkSnd(false);
 camUpdate(rd);
 touchAssist(p,live);
 p.aim=Math.atan2(my/zoom+camY-p.y,mx/zoom+camX-p.x);let a=p.aim;if(p.air)a=p.h+clamp(ad(a,p.h),-p.qa,p.qa);p.fa=a;
 if(md&&live)playerFire(p,a,A);
 ear.x=p.x;ear.y=p.y;if(A)for(const q of plist()){const qd=rd*tsOf(q.id),rt=q.z?(q.rgA?REGEN*(q.rgG||1):0):REGEN*(q.rgG||1);if(rt&&q.hp<q.hpMax)q.hp=Math.min(q.hpMax,q.hp+rt*qd);
 if(q.shs){q.sg=Math.max(0,(q.sg||0)-qd);for(let i=0;i<q.shs.length;i++)if(q.shs[i]>0)q.shs[i]=Math.max(0,q.shs[i]-qd)}
 tickAbilCD(q,qd)}}
// ===== fendenti: effetto subito, a 0,1 s e a 0,2 s; ogni oggetto è colpito una sola volta per fendente =====
function slashHits(){if(G.over)return;const A=authority();
 for(const sl of slashes){if(!sl.hit||(!A&&sl.id!==NET.id))continue;const q=sl.id===NET.id?P:others[sl.id];if(!q||q.hp<=0)continue;
  while(sl.n<3&&sl.t>=sl.n*.1){sl.n++;meleeHit(sl.x!=null?sl.x:q.x,sl.y!=null?sl.y:q.y,sl.a,q.z?1:0,sl.id,!A,sl.hit,sl.sc||1)}}}   // il client fa solo scintille (dry)

// ===== tick abilità: fumogeni + attacchi nucleari =====
function abilTick(dt){
 // fumogeni
 for(let i=smokes.length-1;i>=0;i--){smokes[i].t+=dt;if(smokes[i].t>=smokes[i].life)smokes.splice(i,1)}
 // nuke in arrivo
 for(let i=NUKES.length-1;i>=0;i--){
  const n=NUKES[i];n.t+=dt;
  if(n.flash<0&&n.t>=NUKE_DELAY){
   n.flash=0;
   if(authority()){
    for(const u of units)if(Math.hypot(u.x-n.x,u.y-n.y)<NUKE_RADIUS)damage(u,NUKE_DMG,n.owner);
    for(const q of plist())if(Math.hypot(q.x-n.x,q.y-n.y)<NUKE_RADIUS)damage(q,NUKE_DMG,n.owner);
    for(const q of allyList())if(q.hp>0&&Math.hypot(q.x-n.x,q.y-n.y)<NUKE_RADIUS)damage(q,NUKE_DMG,n.owner);
    // edifici e alberi: danno di 99999 (uccide qualsiasi tipo di ostacolo in un colpo)
    // owner=null: nessuna penalità "-10 kill" per gli edifici distrutti, perché è un attacco autorizzato
    for(const o of M.obs)if(!o.dead&&!o.ind&&Math.hypot(o.x-n.x,o.y-n.y)<NUKE_RADIUS+o.r)damageObs(o,99999,null);
    // civili nell'area (se la funzione è disponibile)
    if(typeof civArea==='function')civArea(n.x,n.y,NUKE_RADIUS,n.owner);
   }
   sfx(SFX_LIST.nuke,1);
   fxSpawn(n.x,n.y,'#ffd23f',40,true,50);fxSpawn(n.x,n.y,'#ff3333',30,true,40);
  }
  if(n.flash>=0){n.flash+=dt;if(n.flash>=2.5)NUKES.splice(i,1)}
 }
}

// ===== ciclo di simulazione =====
function update(rd){const dt=slowTick(rd);   // rd = tempo reale · dt = tempo del mondo (25% con lo slow motion attivo)
 G.t+=dt;G.msgT=Math.max(0,G.msgT-rd);for(const sl of slashes)sl.t+=rd*tsOf(sl.id);slashHits();slashes=slashes.filter(sl=>sl.t<sl.life);fxStep(dt);fallSpray(dt);burnTick(dt);foamTick(dt);rainUpdate(dt);snowUpdate(dt);sandstormUpdate(dt);
 abilTick(dt);
 dsUpdate(dt);nukeTick(dt);tdNukeTick(dt);shipTick(dt);civTick(dt);armTick();
 const A=authority();
 if(G.over){G.ot=(G.ot||0)+rd;walkSnd(false);camUpdate(rd);return}   // G.ot: secondi dalla fine partita
 playerUpdate(rd,A);   // il giocatore applica da solo il proprio fattore di tempo
 const k=Math.min(1,15*rd);
 for(const id in others){const q=others[id];q.fl=Math.max(0,q.fl-dt);q.z=q.air?1:0;q.x+=(q.tx-q.x)*k;q.y+=(q.ty-q.y)*k}
 if(A){
 aiUpdate(dt);bulletsStep(rd,true);
 if(units.some(u=>u.dead)){for(const u of units)if(u.dead){onUnitDead(u);if(NET.on)NET.rm.push(u.id)}units=units.filter(u=>!u.dead)}
 if(G.mode==1)dmTick(dt);else missionTick(dt);
 lifeTick(dt);
 // RITARDO DI 3 SECONDI PRIMA DELLA SCONFITTA
 // - se almeno un giocatore è vivo, il timer riparte da 0
 // - se tutti sono morti, il timer avanza di dt; solo dopo 3 secondi interi la partita termina
 // (in quei 3 s la rianimazione ha tutto il tempo di scattare: damage() la applica già in modo sincrono;
 //  in cooperativa un compagno può riportare in piedi il mech con reviveTick → plist() torna >0 e il timer si azzera)
 if(G.mode!=1&&G.started){
  if(plist().length>0)G.deathT=0;
  else{
   G.deathT=(G.deathT||0)+dt;
   if(G.deathT>=3){
    if(!NET.on)finish(1,'Mech distrutto');
    else finish(1,'Tutti i giocatori sono incapacitati: missione fallita');
   }
  }
 }
}
 else{for(const u of units){
  u.x+=(u.tx-u.x)*k;u.y+=(u.ty-u.y)*k;
  u.h+=ad(u.th,u.h)*Math.min(1,12*rd);
  if(u.k===5){if(u.thr==null)u.thr=u.h;const tT=u.thrT!=null?u.thrT:u.th;u.thr+=ad(tT,u.thr)*Math.min(1,12*rd)}   // torretta tank: interpola verso il target
  u.fl=Math.max(0,u.fl-dt)}
  bulletsStep(rd,false);if(MS.al&&MS.al.tx!=null){if(Math.hypot(MS.al.tx-MS.al.x,MS.al.ty-MS.al.y)>350){MS.al.x=MS.al.tx;MS.al.y=MS.al.ty}else{MS.al.x+=(MS.al.tx-MS.al.x)*k;MS.al.y+=(MS.al.ty-MS.al.y)*k}}
  for(const v of MS.vans||[])if(v.tx!=null){v.x+=(v.tx-v.x)*k;v.y+=(v.ty-v.y)*k}
  for(const v of MS.vips||[])if(v.tx!=null){if(Math.hypot(v.tx-v.x,v.ty-v.y)>350){v.x=v.tx;v.y=v.ty}else{v.x+=(v.tx-v.x)*k;v.y+=(v.ty-v.y)*k}}}
 netTick(rd)}
// ===== ciclo di disegno: limite fps, contatore, qualità automatica =====
let last=performance.now(),fAcc=0,fN=0,slow=0;
function loop(now){requestAnimationFrame(loop);
 const el=(now-last)/1000;if(el<1/TARGET_FPS-.003)return;last=now;const dt=Math.min(.05,el);
 fAcc+=el;fN++;if(fAcc>=.5){G.fps=fN/fAcc;fAcc=fN=0;
  if(G.started&&!G.baking&&G.fps<TARGET_FPS*.85&&G.q>0){if(++slow>=3){slow=0;G.q--;resize();fxP.length=0}}else slow=0}   // sotto l'85% dell'obiettivo per 1,5 s: grafica più leggera (non durante la creazione dello sfondo)
 if(G.started){if(G.baking){netTick(dt);bakeDraw()}else{update(dt);draw(dt)}}}
addEventListener('keydown',e=>{K[e.code]=1;kbDown(e.code);if((!G.started||G.menu)&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;
 if(G.menu){if(!e.repeat&&KEYBIND.reload.k===e.code)saveConfig();return}
 if(KEYBIND.thermal.k===e.code&&!e.repeat){G.noBg=!G.noBg;say(G.noBg?'Visuale termica attiva':'Visuale termica disattivata')}
 if(KEYBIND.cam.k===e.code&&!e.repeat){
  camResetT=0.2;camResetX0=camOffX;camResetY0=camOffY;
  camLocked=camLocked?0:1;
  zoomUserMul=1;                     // reset dello zoom manuale
  say(camLocked?'Telecamera bloccata sul mech':'Telecamera libera');
 }
 if(KEYBIND.mode.k===e.code){e.preventDefault();if(!e.repeat)toggleMode()}
 if(KEYBIND.reload.k===e.code&&!e.repeat){
  if(G.baking)cfgOpen(false);
  else if(campIsBriefing())campHide();   // R chiude il briefing di campagna
  else if(G.over)restartGame();
  else{reload();armOpen();}   // R ricarica e, se vicino a un'armeria, la apre
 }
 if(KEYBIND.dash.k===e.code&&!e.repeat)dash();
if(KEYBIND.melee.k===e.code&&!e.repeat)melee();
if(KEYBIND.fire.k===e.code&&!e.repeat)md=true;   // fuoco bindato su tastiera
 // Slot 1-6: arma (switch) oppure abilità (attivazione)
 for(let i=0;i<6;i++){
  if(KEYBIND['w'+(i+1)].k===e.code&&!e.repeat&&!G.over){
   const slot=loadout[i];
   if(!slot)continue;
   if(slot[0]==='w')P.w=+slot.slice(1);
   else if(slot==='u:turret')throwTurret();
   else if(slot==='u:grenade')throwGrenade();
   else if(slot==='u:smoke')throwSmoke();
   else if(slot==='u:nuke')throwNuke();
   else if(slot==='u:slowmo')throwSlow();
  }
 }});
addEventListener('keyup',e=>{K[e.code]=0;kbUp(e.code);if(KEYBIND.fire.k===e.code)md=false});
// ===== durante la partita il browser non deve reagire a scorciatoie, tasto Alt, pulsanti laterali del mouse e zoom =====
addEventListener('keydown',e=>{
 if(!G.started||(G.menu&&/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)))return;
 if(e.code=='Escape'||e.code=='F5'||e.code=='F11'||e.code=='F12')return;   // restano attivi
 e.preventDefault()},{capture:true});
addEventListener('keyup',e=>{if(G.started&&(e.code=='AltLeft'||e.code=='AltRight'))e.preventDefault()},{capture:true});   // Alt da solo apre il menu del browser
// Blocca i comportamenti del browser durante la partita:
//   - contextmenu a livello documento (non solo sulla canvas): niente menu su nessun elemento
//   - pointerdown/mousedown con tasto diverso dal sinistro: blocca i mouse gesture di Opera
//     (che partono in capture-phase prima del contextmenu) e i pulsanti avanti/indietro
//   - dragstart/selectstart: niente selezione/drag se trascini per sbaglio su pulsanti HUD
// ATTENZIONE: per la spec Pointer Events, preventDefault() su pointerdown SOPPRIME gli eventi
// mouse compatibili (mousedown/mouseup/click). Per questo fuoco e melee del canvas sono legati
// a pointerdown/pointerup (non a mousedown/mouseup): così il tasto destro rimappato a melee/fire
// riceve il click anche se il mousedown compatibile viene cancellato.
// Blocca i comportamenti del browser in partita E in qualunque menu (config tasti, armeria, caricamento).
// In lobby "pura" (G.started=0, G.menu=0) è permesso: si può ancora incollare testo negli input con tasto destro.
// Blocca tasto destro, gesti mouse (Opera/Edge/Vivaldi) e drag-drop SEMPRE, in ogni fase.
// Eccezione: campi di testo (input/textarea/select) per permettere il paste con tasto destro.
const _isEditable = el => el && el.nodeType === 1 && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
const _blockCtx   = e => { if (!_isEditable(e.target)) e.preventDefault() };
const _blockMouse = e => { if (e.button !== 0 && !_isEditable(e.target)) e.preventDefault() };
addEventListener('contextmenu', _blockCtx,   {capture:true});
addEventListener('pointerdown', _blockMouse, {capture:true});
addEventListener('pointerup',   _blockMouse, {capture:true});   // Opera può triggerare gesture sul pointerup
addEventListener('mousedown',   _blockMouse, {capture:true});
addEventListener('mouseup',     _blockMouse, {capture:true});
addEventListener('auxclick',    _blockCtx,   {capture:true});
addEventListener('click',       _blockMouse, {capture:true});   // Firefox scatena click anche col destro
addEventListener('dragstart',   _blockCtx,   {capture:true});
addEventListener('dragover',    _blockCtx,   {capture:true});   // blocca drop di file/URL
addEventListener('dragenter',   _blockCtx,   {capture:true});
addEventListener('dragleave',   _blockCtx,   {capture:true});
addEventListener('drop',        _blockCtx,   {capture:true});   // evita apertura di file droppati
addEventListener('selectstart', _blockCtx,   {capture:true});
// Rotella del mouse:
// - Ctrl/Meta + rotella → bloccato (evita lo zoom pagina del browser durante la partita)
// - rotella semplice in partita → zoom manuale (0.5×…2×), il lerp di camUpdate() lo rende fluido
addEventListener('wheel',e=>{
 // Ctrl/Meta + rotella = zoom pagina del browser: SEMPRE bloccato (anche in lobby e caricamento)
 if(e.ctrlKey||e.metaKey){e.preventDefault();return}
 // rotella semplice in partita = zoom manuale (0.5×…2×)
 if(!G.started||G.menu||G.baking)return;
 e.preventDefault();
 const d=Math.sign(e.deltaY);
 if(d)zoomUserMul=clamp(zoomUserMul*(1-d*0.12),0.5,2.0);
},{passive:false,capture:true});
const PLR=cv.requestPointerLock||cv.webkitRequestPointerLock,locked=()=>document.pointerLockElement===cv||document.webkitPointerLockElement===cv;
function plock(){try{if(PLR&&!locked()){const r=PLR.call(cv);if(r&&r.catch)r.catch(()=>{})}}catch(_){}}
function unlock(){try{const f=document.exitPointerLock||document.webkitExitPointerLock;if(f&&locked())f.call(document)}catch(_){}}
addEventListener('mousemove',e=>{if(locked()){mx+=e.movementX||0;my+=e.movementY||0}else{const r=cv.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top}mx=clamp(mx,0,W);my=clamp(my,0,H);mIn=true});
document.documentElement.addEventListener('mouseleave',e=>{if(locked())return;const r=cv.getBoundingClientRect(),x=clamp(e.clientX-r.left,0,W),y=clamp(e.clientY-r.top,0,H),d=[x,W-x,y,H-y],k=d.indexOf(Math.min(...d));mx=k==0?0:k==1?W:x;my=k==2?0:k==3?H:y;mIn=true});
for(const ev of['pointerlockchange','webkitpointerlockchange'])document.addEventListener(ev,()=>{if(locked())say('Mouse agganciato (Esc per rilasciarlo)');else mIn=false});
cv.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;plock();kbMouseDown(e.button);
 if(KEYBIND.fire.m===e.button)md=true;
 else if(KEYBIND.melee.m===e.button)melee()});
cv.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('pointerup',e=>{if(e.pointerType==='touch')return;kbMouseUp(e.button);if(KEYBIND.fire.m===e.button)md=false});
addEventListener('blur',()=>{for(const k in K)K[k]=0;for(const a in KB)KB[a]=0;md=false;mIn=false;walkSnd(false)});
// ===== schermo intero =====
const FSE=document.documentElement,FSR=FSE.requestFullscreen||FSE.webkitRequestFullscreen,FSX=document.exitFullscreen||document.webkitExitFullscreen,fsCan=!!FSR&&document.fullscreenEnabled!==false;
const fsOn=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
function fsSet(go){if(!fsCan)return;try{const on=fsOn();if(go==null)go=!on;if(go===on)return;const r=go?FSR.call(FSE):(FSX&&FSX.call(document));if(r&&r.catch)r.catch(()=>{})}catch(_){}}
const $=i=>document.getElementById(i);   // ← questa riga era stata eliminata per sbaglio
addEventListener('keydown',e=>{if(KEYBIND.fullscreen.k===e.code&&!e.repeat&&!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))fsSet()});
addEventListener('click',()=>{fsSet(true); playBgm();},{once:true});
// ===== schermata iniziale =====
function showLobby(s){walkSnd(false);unlock();rainLoopStop();windLoopStop();G.menu=0;$('cfg').classList.remove('arm');$('cfg').style.display='none';$('lobby').style.display='flex';$('lobSt').textContent=s||''}
function hideLobby(){if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();$('lobby').style.display='none'}
const updateTitleColor = () => {
  const el = $('titleLogo');
  if(el) {
    const c = COLS[myCi] || COLS[0];
    el.style.background = `linear-gradient(135deg, ${c[0]} 25%, ${c[1]} 100%)`;
    el.style.webkitBackgroundClip = 'text';
    el.style.webkitTextFillColor = 'transparent';
    el.style.filter = `drop-shadow(0 0 14px ${c[0]}) drop-shadow(3px 3px 0px #000)`;
  }
};
COLS.forEach((c,i)=>{const d=document.createElement('div');d.className='sw'+(i?'':' on');d.style.background=c[0];d.onclick=()=>{myCi=i;document.querySelectorAll('.sw').forEach((e,j)=>e.classList.toggle('on',j==i));updateTitleColor();updateMechImage();cfgMechDraw();renderModelPicker();};$('lobCols').appendChild(d)});
updateTitleColor();
const prep=()=>{G.diff=clamp(+$('lobDiff').value||1,1,10);G.sel=+$('lobMis').value||0;G.mode=+$('lobMode').value==1?1:0;CAMP.want=+$('lobMode').value==2;G.profile=clamp(+$('lobProfile').value||0,0,PROFILES.length);
{const wv=$('lobWeather')?+$('lobWeather').value:-1;
 // -1 = Casuale (verrà risolto dal seed in startGame: stesso meteo per host e client)
 //  0 = Sereno, 1 = Pioggia, 2 = Neve, 3 = Tempesta di sabbia. Se si è client, il valore dell'host arriva comunque via welcome e sovrascrive.
 G.weatherMode=(wv===-1||wv===0||wv===1||wv===2||wv===3)?wv:-1}
 myName=($('lobName').value||'Pilota').slice(0,12);P.ci=myCi;P.name=myName;P.mi=myMi;applyLoadout(P);resetPlayer(P);preloadSfx();resize()};
const noPeer=()=>{if(typeof Peer=='undefined'){$('lobSt').textContent='peerjs.min.js non trovato: multiplayer non disponibile';return true}};
const later=f=>{$('lobSt').textContent='Genero la mappa…';setTimeout(f,40)};   // lascia il tempo di mostrare il messaggio prima della generazione
$('lobDiff').oninput=()=>{$('lobDiffV').textContent=$('lobDiff').value};
$('lobProfile').oninput=()=>{const v=+$('lobProfile').value;$('lobProfileV').textContent=v===0?'Casuale':PROFILES[v-1].n};
$('lobMode').onchange=campLobby;campLobby();
$('bSolo').onclick=()=>{prep();later(()=>{NET.id=0;startGame(firstSeed(),false);G.started=true;hideLobby()})};
$('bHost').onclick=()=>{prep();if(noPeer())return;$('lobSt').textContent='Creo la partita…';hostGame(e=>{if(e){$('lobSt').textContent='Errore: '+e;return}later(()=>{startGame(firstSeed(),false);G.started=true;hideLobby();say('Codice partita: '+NET.code)})})};
$('bJoin').onclick=()=>{prep();if(noPeer())return;const c=$('lobCode').value.trim();if(c.length<4){$('lobSt').textContent='Inserisci il codice';return}$('lobSt').textContent='Mi collego…';joinGame(c,e=>{if(e)$('lobSt').textContent='Errore: '+e},s=>{$('lobSt').textContent=s})};
// ===== configurazione del mech: 4 caselle (2 a sinistra, 2 a destra), ognuna con un'arma o un upgrade =====
const ITEMS=[...WEAPONS.slice(0,5).map((w,i)=>({id:'w'+i,kind:'Arma',name:w.n,info:'Danno '+w.dmg+' · 1 colpo ogni '+w.cd+' s · gittata '+w.range+' · caricatore '+w.mag,col:WP_COL})),
 ...UP_GROUPS.flatMap(g=>UPGRADES.filter(u=>u.g==g).map(u=>({id:'u:'+u.id,kind:'Upgrade',name:u.n,info:u.d,col:UP_COL[g],ic:u.ic})))];   // ordine: armi → tutti → Grunt → Air
// icona di un upgrade: un solo disegno (campo ic) per selezione e HUD
const upSvg=(it,sz)=>'<svg xmlns="http://www.w3.org/2000/svg" width="'+sz+'" height="'+sz+'" viewBox="-10 -10 20 20">'+it.ic.replace(/currentColor/g,it.col)+'</svg>';
const upImgs={};
function upImg(it){let im=upImgs[it.id];if(!im){im=upImgs[it.id]=new Image();im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(upSvg(it,64))}return im}
const itemOf=id=>ITEMS.find(x=>x.id===id);let pickSlot=-1;
// Anteprima mech nella configurazione: usa la stessa drawGruntBody del gioco (fonte unica).
// Il corpo del Grunt va da x=-13 a x=+30 (canna) e da y=-16 a y=+16 in coordinate locali, scalato di MECH_SCALE.
// Centro geometrico del mech (inclusa la canna): (6.375, 0) in coord. locali × MECH_SCALE.
// La scala 7 riempie bene il canvas 260×260 lasciando margine.
function cfgMechDraw(){
 const c=$('cfgCv').getContext('2d');
 c.clearRect(0,0,260,260);
 c.save();
 c.translate(130, 130);
 c.scale(7, 7);
 c.translate(-6.375, 0);
 drawGruntBody(c, myCi, 0, myMi);
 c.restore();
}
function renderModelPicker(){
 const box=$('cfgModels');if(!box)return;
 box.innerHTML='';
 GRUNT_MODELS.forEach((m,i)=>{
  const div=document.createElement('div');
  div.className='mdl'+(i===myMi?' sel':'');
  div.title=GRUNT_MODEL_NAMES[i]+(i===0?' (originale)':'');
  const cv=document.createElement('canvas');cv.width=cv.height=88;
  const c=cv.getContext('2d');
  c.translate(44,44);c.scale(2.5,2.5);c.translate(-6.375,0);
  drawGruntBody(c,myCi,0,i);
  div.appendChild(cv);
  div.onclick=()=>{myMi=i;try{localStorage.setItem('airgrunt_model',String(myMi))}catch(_){}cfgMechDraw();renderModelPicker();};
  box.appendChild(div);
 });
}
function cfgDraw(){[['cfgL',0],['cfgR',3]].forEach(([id,o])=>{const col=$(id);col.innerHTML='';
  for(let k=0;k<3;k++){const i=o+k,it=itemOf(loadout[i]),b=document.createElement('button');b.type='button';b.className='slot'+(it?'':' empty');
   b.innerHTML='<small>Casella '+(i+1)+(it?' · '+it.kind:'')+'</small><b'+(it?' style="color:'+it.col+';"':'')+'>'+(it?it.name:'Vuota')+'</b><span>'+(it?it.info:'Tocca per scegliere un’arma o un upgrade')+'</span>';b.onclick=()=>pickOpen(i);col.appendChild(b)}});cfgMechDraw();renderModelPicker()}
function pickOpen(i){
 pickSlot=i;const L=$('pickList');L.innerHTML='';
 const add=(id,title,info,col)=>{
  const b=document.createElement('button'), at=id&&id[0]=='w'?loadout.indexOf(id):-1;
  b.type='button';
  
  // Creiamo un'icona grafica coerente in base all'ID dell'arma o dell'upgrade
  let iconSvg = '', iconCol = '#ff3b3b';
  if(id && id[0]==='w'){
   iconCol = '#ff3b3b';
   const wi = +id.slice(1);
   if(wi===0) iconSvg = '<svg width="20" height="20" viewBox="-10 -10 20 20" style="flex:none;margin-right:8px"><rect x="-5" y="-7" width="10" height="3" rx="1.5" fill="#ff3b3b"/><rect x="-5" y="-1.5" width="10" height="3" rx="1.5" fill="#ff3b3b"/><rect x="-5" y="4" width="10" height="3" rx="1.5" fill="#ff3b3b"/></svg>'; // Mitraglia (3 proiettili)
   else if(wi===1) iconSvg = '<svg width="20" height="20" viewBox="-10 -10 20 20" style="flex:none;margin-right:8px"><circle cx="0" cy="0" r="7" stroke="#ff3b3b" stroke-width="2" fill="none"/><line x1="-9" y1="0" x2="9" y2="0" stroke="#ff3b3b" stroke-width="2"/><line x1="0" y1="-9" x2="0" y2="9" stroke="#ff3b3b" stroke-width="2"/></svg>'; // Cannone
   else if(wi===2) iconSvg = '<svg width="20" height="20" viewBox="-10 -10 20 20" style="flex:none;margin-right:8px"><path d="M0,-8 C6,-3 7,5 0,9 C-7,5 -6,-3 0,-8 Z" fill="#ff3b3b"/></svg>'; // Lanciafiamme
   else if(wi===3) iconSvg = '<svg width="20" height="20" viewBox="-10 -10 20 20" style="flex:none;margin-right:8px"><circle cx="0" cy="0" r="3" fill="#ff3b3b"/><line x1="-8" y1="-8" x2="-4" y2="-4" stroke="#ff3b3b" stroke-width="2"/><line x1="8" y1="-8" x2="4" y2="-4" stroke="#ff3b3b" stroke-width="2"/><line x1="-8" y1="8" x2="-4" y2="4" stroke="#ff3b3b" stroke-width="2"/><line x1="8" y1="8" x2="4" y2="4" stroke="#ff3b3b" stroke-width="2"/></svg>'; // Lanciarazzi
   else if(wi===4) iconSvg = '<svg width="20" height="20" viewBox="-10 -10 20 20" style="flex:none;margin-right:8px"><circle cx="-6" cy="0" r="2.5" fill="#ff3b3b"/><circle cx="5" cy="-5" r="2" fill="#ff3b3b"/><circle cx="6" cy="5" r="2" fill="#ff3b3b"/></svg>'; // Shotgun
  } else if(id && id[0]==='u') {
   const it = itemOf(id);
   iconCol = it.col;
   iconSvg = '<span style="flex:none;margin-right:8px;display:inline-flex">' + upSvg(it, 20) + '</span>';
  }

  b.innerHTML = '<div style="display:flex;align-items:center;width:100%">' + iconSvg + '<div style="flex:1"><b'+(col?' style="color:'+col+';"':'')+'>'+title+'</b>'+(info?'<span>'+info+'</span>':'')+'</div></div>' + 
                (at===i?'<em>nella casella attuale</em>':at>=0?'<em>ora in casella '+(at+1)+' (le due caselle si scambiano)</em>':'');
  b.onclick = () => pickSet(id);
  L.appendChild(b);
 };

 add(null,'Vuota  ','',null);
 ITEMS.forEach(it => {const lk=it.id[0]=='u'&&upLocked(it.id.slice(2));
  add(it.id, (lk?'🔒 ':'')+it.kind+': '+it.name, lk?campLockTxt(it.id.slice(2)):it.info, lk?'#6b7a6b':it.col)});
 $('pick').style.display = 'flex';
}
function pickSet(id){if(id&&id[0]=='u'&&upLocked(id.slice(2)))return;const i=pickSlot,old=loadout[i];if(id&&id[0]=='w'){const j=loadout.indexOf(id);if(j>=0&&j!==i)loadout[j]=old}loadout[i]=id;$('pick').style.display='none';cfgDraw()}
const MECH_IMAGES = ['AG-yellow.png', 'AG-blue.png', 'AG-green.png', 'AG-red.png', 'AG-violet.png', 'AG-grey.png', 'AG-white.png'];

function updateMechImage(){
 const im = $('cfgImg');
 if(myMi!==0 || !MECH_IMAGES[myCi]){im.style.display='none';$('cfgCv').style.display='block';return}
 im.onload = () => { im.style.display = 'block'; $('cfgCv').style.display = 'none'; };
 im.onerror = () => { im.style.display = 'none'; $('cfgCv').style.display = 'block'; };
 im.src = 'img/' + MECH_IMAGES[myCi];
}
$('pickX').onclick=()=>{$('pick').style.display='none'};$('pick').onclick=e=>{if(e.target===$('pick'))$('pick').style.display='none'};
// Il pulsante "Configura AirGrunt" è stato rimosso dalla lobby: la configurazione resta accessibile
// durante il caricamento (bCfgLoading) e dall'armeria in partita (premi R vicino a un'armeria).
const bCfgEl=$('bCfg');if(bCfgEl)bCfgEl.onclick=()=>cfgOpen(false);   // guard: nessun errore se il pulsante non esiste
// ===== menu di configurazione: lobby, caricamento e armeria usano lo stesso menu e lo stesso salvataggio =====
function cfgOpen(arm){if(G.menu)return;if(arm){myCi=P.ci;myMi=P.mi|0}G.menu=1;md=false;unlock();$('cfg').classList.toggle('arm',!!arm);cfgDraw();updateMechImage();$('cfg').style.display='flex'}
$('bCfgLoading').onclick=()=>cfgOpen(false);
function armOpen(){if(ARM.near&&!G.over&&P.hp>0)cfgOpen(true)}   // armeria: menu sopra la mappa
// salva, applica e sincronizza in rete
function saveConfig(){
 saveKeybind();
 if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
 const inGame=G.started&&!G.baking,w0=P.w,sh=P.shs||[];
 G.menu=0;md=false;$('cfg').style.display='none';$('cfg').classList.remove('arm');$('pick').style.display='none';
 P.ci=myCi;P.mi=myMi;
 applyLoadout(P);P.w=P.eq.includes(w0)?w0:P.eq[0];
 P.shs=Array.from({length:P.shn|0},(_,i)=>sh[i]||0);
 const grow=(old,n)=>Array.from({length:n|0},(_,i)=>(old||[])[i]||0);
 P.revive=grow(P.revive,P.rvn);
 P.turs  =grow(P.turs,  P.turn);
 P.grns  =grow(P.grns,  P.grn);
 P.smks  =grow(P.smks,  P.smk);
 P.nuks  =grow(P.nuks,  P.nuk);
 if(NET.on){const msg={t:'ldt',id:NET.id,ci:myCi,mi:myMi,dr:[P.drG,P.drA],rg:[P.rgA?1:0,P.rgG],dm:P.dmx,sh:P.shn,ml:P.mlm,
   rv:P.rvn,prc:P.prc,rad:P.radar,tur:P.turn,grn:P.grn,smk:P.smk,nuk:P.nuk};
  if(NET.host)bcast(msg);else send(NET.hostConn,msg)}
 if(inGame)say('Equipaggiamento aggiornato')}
$('cfgOk').onclick=saveConfig;

$('cfgMech').onclick=()=>{
 myCi = (myCi + 1) % COLS.length;
 updateTitleColor();
 updateMechImage();
 cfgMechDraw();
 renderModelPicker();
 document.querySelectorAll('.sw').forEach((e,j)=>e.classList.toggle('on',j==myCi));
};

// ===== LISTENER EVENTI TOUCH =====
function handleTouchStart(e){
  if(e.target!==cv) return;   // tocchi su pulsanti HTML (schermo intero, volume, configura): al browser, altrimenti preventDefault ne annulla il click
  if(G.started && G.over && G.ot>1){ restartGame(); e.preventDefault(); return; }   // fine partita: un tocco ricomincia (solo host/singolo; il client attende)
  if(campIsBriefing()){ campHide(); e.preventDefault(); return; }   // ← NUOVO: chiude il briefing
  if(!G.started || G.over || G.menu) return;   // a menu aperto i tocchi vanno al menu (senza preventDefault)
  TOUCH.active = true;
  updateTouchButtons();
  const rect = cv.getBoundingClientRect();
  const touches = Array.from(e.changedTouches);
  const onBtn = (px, py) => TOUCH.btns.some(b => Math.hypot(px - b.x, py - b.y) <= b.r + 10);

  // ===== PINCH: due dita che arrivano insieme (stesso evento) e nessuna sui pulsanti =====
  if(touches.length === 2){
    const p1 = { x: touches[0].clientX - rect.left, y: touches[0].clientY - rect.top };
    const p2 = { x: touches[1].clientX - rect.left, y: touches[1].clientY - rect.top };
    if(!onBtn(p1.x, p1.y) && !onBtn(p2.x, p2.y)){
      // annulla un eventuale tap-aim in corso (l'utente sta facendo un altro gesto)
      if(TOUCH.aim.id != null){ TOUCH.aim.id = null; TOUCH.aim.active = false; md = false; }
      const d0 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      TOUCH.pinch = { ids: [touches[0].identifier, touches[1].identifier], d0, zoom0: zoomUserMul };
      e.preventDefault();
      return;
    }
  }

  for(let i=0; i<touches.length; i++){
    const t = touches[i];
    const tx = t.clientX - rect.left, ty = t.clientY - rect.top;

    // Pulsanti tattici
    if(onBtn(tx, ty)){ TOUCH.btns.find(b => Math.hypot(tx - b.x, ty - b.y) <= b.r + 10).action(); continue; }

    // Joystick sinistro: primo tocco sulla metà sinistra, se non già attivo
    if(tx < W / 2 && TOUCH.left.id == null && !TOUCH.pinch){
      TOUCH.left.id = t.identifier;
      TOUCH.left.x0 = TOUCH.left.x = tx;
      TOUCH.left.y0 = TOUCH.left.y = ty;
      TOUCH.left.active = true;
      TOUCH.left.vx = 0; TOUCH.left.vy = 0;
    }
    // Tap-to-aim: qualsiasi altro tocco (metà destra, o metà sinistra con joystick già attivo)
    else if(TOUCH.aim.id == null && !TOUCH.pinch){
      TOUCH.aim.id = t.identifier;
      TOUCH.aim.x = tx;
      TOUCH.aim.y = ty;
      TOUCH.aim.active = true;
      mx = clamp(tx, 0, W); my = clamp(ty, 0, H); mIn = true;
      md = true;   // inizia a sparare subito verso il punto toccato
    }
  }
  e.preventDefault();
}

function handleTouchMove(e){
  if(e.target!==cv) return;   // il movimento di un tocco partito da un pulsante/slider HTML non è del gioco
  if(!G.started || G.over || G.menu) return;
  const rect = cv.getBoundingClientRect();

  // ===== PINCH: aggiorna lo zoom in base alla distanza tra le due dita =====
  if(TOUCH.pinch){
    const two = Array.from(e.touches).filter(t => TOUCH.pinch.ids.includes(t.identifier));
    if(two.length === 2){
      const p1 = { x: two[0].clientX - rect.left, y: two[0].clientY - rect.top };
      const p2 = { x: two[1].clientX - rect.left, y: two[1].clientY - rect.top };
      const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if(TOUCH.pinch.d0 > 20){
        const ratio = d / TOUCH.pinch.d0;
        zoomUserMul = clamp(TOUCH.pinch.zoom0 * ratio, 0.5, 2.0);
      }
    }
    e.preventDefault();
    return;
  }

  for(let i=0; i<e.changedTouches.length; i++){
    const t = e.changedTouches[i];
    const tx = t.clientX - rect.left, ty = t.clientY - rect.top;

    if(t.identifier === TOUCH.left.id){
      TOUCH.left.x = tx; TOUCH.left.y = ty;
      const dx = tx - TOUCH.left.x0, dy = ty - TOUCH.left.y0, d = Math.hypot(dx, dy);
      const maxR = 55;
      TOUCH.left.vx = (d > 5 ? dx / Math.max(d, maxR) : 0);
      TOUCH.left.vy = (d > 5 ? dy / Math.max(d, maxR) : 0);
    } else if(t.identifier === TOUCH.aim.id){
      // Trascinando il dito si sposta il mirino: continua a sparare verso la nuova posizione
      TOUCH.aim.x = tx; TOUCH.aim.y = ty;
      mx = clamp(tx, 0, W); my = clamp(ty, 0, H); mIn = true;
      md = true;
    }
  }
  e.preventDefault();
}

function handleTouchEnd(e){
  for(let i=0; i<e.changedTouches.length; i++){
    const t = e.changedTouches[i];
    if(t.identifier === TOUCH.left.id){
      TOUCH.left.id = null; TOUCH.left.active = false;
      TOUCH.left.vx = 0; TOUCH.left.vy = 0;
    }
    if(t.identifier === TOUCH.aim.id){
      TOUCH.aim.id = null; TOUCH.aim.active = false;
      md = false;
    }
    if(TOUCH.pinch && TOUCH.pinch.ids.includes(t.identifier)){
      TOUCH.pinch = null;   // basta che si alzi uno dei due dita del pinch: fine zoom
    }
  }
}

window.addEventListener('touchstart', handleTouchStart, { passive: false });
window.addEventListener('touchmove', handleTouchMove, { passive: false });
window.addEventListener('touchend', handleTouchEnd, { passive: false });
window.addEventListener('touchcancel', handleTouchEnd, { passive: false });

// Speaker + due slider di volume separati (musica / effetti)
const bgmBtn=document.getElementById('bgmToggle'),bgmSlider=document.getElementById('bgmSlider'),
      musicRange=document.getElementById('musicRange'),musicPct=document.getElementById('musicPct'),
      sfxRange=document.getElementById('sfxRange'),sfxPct=document.getElementById('sfxPct');
function updateBgmIcon(){
 if(!bgmBtn||!musicRange||!sfxRange)return;
 const m=+musicRange.value/100, s=+sfxRange.value/100, mx=Math.max(m,s);
 bgmBtn.textContent=(m<=0&&s<=0)?'🔇':mx<.5?'🔉':'🔊';
}
if(bgmBtn&&bgmSlider&&musicRange&&sfxRange){
 const initM=Math.round(clamp(typeof MUSIC_VOL==='number'?MUSIC_VOL:1,0,1)*100);
 const initS=Math.round(clamp(typeof SFX_VOL  ==='number'?SFX_VOL  :1,0,1)*100);
 musicRange.value=initM; if(musicPct)musicPct.textContent=initM+'%';
 sfxRange.value  =initS; if(sfxPct)  sfxPct.textContent  =initS+'%';
 updateBgmIcon();
 bgmBtn.onclick=(e)=>{
  e.stopPropagation();
  bgmSlider.style.display=bgmSlider.style.display==='flex'?'none':'flex';
 };
 musicRange.oninput=()=>{
  setMusicVolume(+musicRange.value/100);
  if(musicPct)musicPct.textContent=musicRange.value+'%';
  updateBgmIcon();
 };
 sfxRange.oninput=()=>{
  setSfxVolume(+sfxRange.value/100);
  if(sfxPct)sfxPct.textContent=sfxRange.value+'%';
  updateBgmIcon();
 };
 // click fuori dallo slider (o su un tasto diverso) → chiude il popup
 document.addEventListener('click',(e)=>{
  if(bgmSlider.style.display==='flex'&&!bgmSlider.contains(e.target)&&e.target!==bgmBtn)bgmSlider.style.display='none';
 });
}

// ===== UI Rimappatura controlli (dentro la schermata di configurazione) =====
let capturing=null,captureArmed=false,lastMouseBind=0;
const CTRL_ORDER=['up','down','left','right','dash','fire','melee','mode','reload','w1','w2','w3','w4','w5','w6','cam','thermal','fullscreen'];
const CTRL_LABEL={up:'Su',down:'Giù',left:'Sinistra',right:'Destra',dash:'Scatto',fire:'Spara',melee:'Mischia',mode:'Grunt/Air',reload:'Ricarica + Armeria',w1:'Slot 1',w2:'Slot 2',w3:'Slot 3',w4:'Slot 4',w5:'Slot 5',w6:'Slot 6',cam:'Camera',thermal:'Termica',fullscreen:'Schermo intero'};
function renderControls(){const L=document.getElementById('ctrlList');if(!L)return;L.innerHTML='';
 for(const a of CTRL_ORDER){const row=document.createElement('div');row.className='ctrlRow';
  const lb=document.createElement('label');lb.textContent=CTRL_LABEL[a]||a;
  const bt=document.createElement('button');bt.type='button';
  bt.textContent=capturing===a?'Premi…':kbLabel(KEYBIND[a]);
  bt.className=capturing===a?'capturing':'';
  bt.onclick=(ev)=>{ev.stopPropagation();
 if(performance.now()-lastMouseBind<300)return;   // appena bindato col mouse: ignora il click residuo
 if(capturing===a){capturing=null;renderControls()}else startCapture(a)};
  row.appendChild(lb);row.appendChild(bt);L.appendChild(row)}}
function startCapture(a){capturing=a;captureArmed=false;renderControls();
 setTimeout(()=>{captureArmed=true},120)}   // il click di attivazione non deve essere catturato
function setBinding(a,b){
 // rimuovi conflitti: due azioni non possono usare lo stesso tasto/bottone
 for(const k in KEYBIND){if(k===a)continue;const o=KEYBIND[k];if(!o)continue;
  if(b.k&&o.k===b.k){KEYBIND[k]={};}
  if(b.m!=null&&o.m===b.m){KEYBIND[k]={};}}
 KEYBIND[a]=b;saveKeybind();renderControls()}
// Cattura globale: in capture phase, prima di qualunque altro handler
document.addEventListener('keydown',e=>{
 if(!capturing||!captureArmed)return;
 if(e.repeat)return;
 if(e.code==='Escape'){capturing=null;captureArmed=false;renderControls();e.preventDefault();e.stopPropagation();return}
 const a=capturing;capturing=null;captureArmed=false;
 setBinding(a,{k:e.code});
 e.preventDefault();e.stopPropagation()},true);
// Ascolta pointerdown (non mousedown) perché il blocco browser fa preventDefault() sui pointerdown
// con tasto != sinistro: per la spec Pointer Events ciò SOPPRIME i mousedown compatibili,
// quindi il vecchio listener mousedown non scattava mai per il tasto destro / centrale / laterali.
document.addEventListener('pointerdown',e=>{
 if(!capturing||!captureArmed)return;
 const a=capturing;capturing=null;captureArmed=false;
 lastMouseBind=performance.now();
 setBinding(a,{m:e.button});
 e.preventDefault();e.stopPropagation()},true);
const ctrlReset=document.getElementById('ctrlReset');
if(ctrlReset)ctrlReset.onclick=()=>{
 for(const a in KEYBIND_DEF)KEYBIND[a]=JSON.parse(JSON.stringify(KEYBIND_DEF[a]));
 saveKeybind();renderControls();setMoveMode(0)};
const ctrlModeToggle=document.getElementById('ctrlModeToggle');
if(ctrlModeToggle)ctrlModeToggle.onclick=()=>setMoveMode(MOVE_MODE?0:1);
// render iniziale: la lista è dentro un <details> chiuso, ma va popolata la prima volta che si apre
const cfgControlsEl=document.getElementById('cfgControls');
if(cfgControlsEl){cfgControlsEl.addEventListener('toggle',()=>{if(cfgControlsEl.open){renderControls();renderMoveMode()}})}
// se lo slider audio apre la cfg, la lista è già pronta
renderControls();renderMoveMode();

G.q=MOBILE?1:2;resize();requestAnimationFrame(loop);
