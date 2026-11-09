'use strict';
/* AIRGRUNT · AGgame.js — avvio partita, input, mech del giocatore, telecamera, ciclo principale e schermata iniziale.
   Il ciclo è limitato a 30 fps sui dispositivi touch (60 sugli altri) e, se i fotogrammi calano, abbassa da solo la qualità grafica. */
const K={};let md=false,mIn=false,sfxFl=0;G.laser=true;
const MOBILE=typeof matchMedia=='function'&&matchMedia('(pointer:coarse)').matches,TARGET_FPS=MOBILE?30:60;
let myCi=0,myName='Pilota',loadout=['w0','w1',null,null];

// ===== GESTORE CONTROLLI TOUCH MOBILE =====
const TOUCH = {
  active: MOBILE,
  left: { id: null, x0: 0, y0: 0, x: 0, y: 0, active: false, vx: 0, vy: 0 },
  right: { id: null, x0: 0, y0: 0, x: 0, y: 0, active: false, vx: 0, vy: 0 },
  btns: []
};

function cycleWeapon(){
  if(G.over || !P.eq || P.eq.length <= 1) return;
  const idx = P.eq.indexOf(P.w);
  P.w = P.eq[(idx + 1) % P.eq.length];
}

function updateTouchButtons(){
  const bw = W, bh = H;
  TOUCH.btns = [
    { id: 'dash',   x: bw - 70,  y: bh - 70,  r: 32, label: 'DASH', col: '#8b5cf6', action: dash },
    { id: 'melee',  x: bw - 145, y: bh - 60,  r: 30, label: 'LAMA', col: '#e2e8f0', action: melee },
    { id: 'mode',   x: bw - 70,  y: bh - 150, r: 28, label: P&&P.air?'GRUNT':'AIR', col: '#4aa3ff', action: toggleMode },
    { id: 'reload', x: bw - 145, y: bh - 135, r: 26, label: 'RIC',  col: '#ffd23f', action: reload },
    { id: 'weapon', x: bw - 145, y: bh - 205, r: 26, label: 'ARMA', col: '#ff3b3b', action: cycleWeapon },
    { id: 'cam',    x: bw - 45,  y: 80,       r: 22, label: 'F',    col: '#3fae4a', action: ()=>{ camResetT=0.2; camResetX0=camOffX; camResetY0=camOffY; } },
    ...(ARM.near ? [{ id: 'arm', x: bw - 70, y: bh - 215, r: 28, label: 'ARM', col: '#3fd05a', action: armOpen }] : [])   // solo vicino a un'armeria
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
 const list=[{id:NET.id,x:P.x,y:P.y,ci:P.ci}];
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
 p.ws=WEAPONS.map((w,i)=>newWS(i))}
function resetPlayer(p){Object.assign(p,{vx:0,vy:0,h:0,mh:0,fa:0,aim:0,air:false,z:0,hp:100,hpMax:100,sp:0,dt:0,da:0,dc:0,mc:0,sw:0,fl:0,dd:0,rs:null,unseen:5,hid:true,lh:null,shs:Array(p.shn|0).fill(0),sg:0});p.ws=WEAPONS.map((w,i)=>newWS(i));p.w=p.eq[0]}
P=newPlayer(0,0,'Pilota');P.eq=[W_MG];applyLoadout(P);resetPlayer(P);
// ===== nuova partita (stesso codice per singolo, host e client: la mappa deriva dal seed) =====
function startGame(seed,isClient){
 G.seed=seed;G.over=0;G.overMsg='';G.msg='';G.msgT=0;G.fog=1;G.t=0;G.ext=0;NK.on=0;SH.on=0;
 playBgm(); // <-- Avvia la musica di sottofondo
 if(!isClient && G.mode!=1){const taken=new Set([P.ci]);const avail=COLS.map((_,i)=>i).filter(i=>!taken.has(i));G.aiCi=avail.length?avail[Math.floor(Math.random()*avail.length)]:null}
 
 // LOOP: se la mappa creata non può ospitare la missione scelta, cambia seme e riprova all'istante (fino a 50 volte)
 let attempt = 0, currentSeed = seed;
 while (attempt < 50) {
  genMap(currentSeed);
  missionStatic();
  if (G.mode == 1 || G.sel <= 0 || G.mt === G.sel) break;
  attempt++;
  currentSeed = (seed + attempt * 12345) >>> 0;
 }
 
 civInit();armInit();chunkReset();
 units=[];bullets=[];slashes=[];fxP.length=0;dirtyObs.clear();NET.rm=[];NET.sq=[];NET.cq=[];NET.cv=[];NET.lastN=-1;NET.fk=0;PQ.length=0;MS={t:0,st:0,al:null};
 resetPlayer(P);P.kills=0;const[x,y]=G.mode==1&&!isClient?dmPoint():spawnAt(NET.id);P.x=x;P.y=y;P.id=NET.id;
 for(const k in others){const q=others[k];q.hp=100;q.kills=0;q.dd=0;q.rs=null;q.unseen=5;q.hid=true;if(!isClient){const s=G.mode==1?dmPoint():spawnAt(q.id);q.x=q.tx=s[0];q.y=q.ty=s[1];send(NET.conns[q.id],{t:'rs',x:s[0],y:s[1]})}}
 if(!isClient){if(G.mode==1){dmInit();for(const k in others)dmEnsure('p'+k,others[k].name)}else{populate();missionSpawn()}}
 else if(G.mode!=1)missionClientInit();else DM.sc={};
 camReset();mx=W/2;my=H/2;dsStart();bakeStart()}
const newSeed=()=>Math.floor(Math.random()*1e5);
function restartGame(){if(NET.on&&!NET.host)return;const s=newSeed();startGame(s,false);if(NET.on)bcast({t:'init',seed:s,mis:G.sel,diff:G.diff,mode:G.mode})}
// ===== azioni del giocatore =====
function toggleMode(){const p=P;if(G.over||G.ext||p.sw>0||p.hp<=0)return;
 if(p.dc>DASH_CD*(p.dcm-1)){say('Barra scatto non carica');return}
 if(p.air){p.air=false;p.z=0;p.mh=p.h;sfx(SFX_LIST.toGrunt,.7)}else{p.air=true;p.z=1;p.dt=0;p.h=p.mh;p.sp=Math.max(Math.hypot(p.vx,p.vy),120);sfx(SFX_LIST.toAir,.7)}
 p.dc+=DASH_CD;p.sw=.6}
function dash(){const p=P,x=(K.KeyD?1:0)-(K.KeyA?1:0),y=(K.KeyS?1:0)-(K.KeyW?1:0);if(G.over||G.ext||p.air||p.hp<=0||p.dc>DASH_CD*(p.dcm-1))return;p.da=(x||y)?Math.atan2(y,x):p.mh;p.dt=DASH_T;p.dc+=DASH_CD}
function melee(){const p=P;if(G.over||G.ext||!G.started||p.mc>0||p.hp<=0)return;
 if(p.dc>DASH_CD*(p.dcm-MELEE_COST)){say('Barra scatto troppo scarica');return}
 const a=p.air?(p.it>0?p.ia:p.h):p.mh;p.mc=MELEE_CD;p.dc=Math.min(DASH_CD*p.dcm,p.dc+DASH_CD*MELEE_COST);
 slashes.push({id:NET.id,a,t:0,life:.22,hit:new Set(),n:0});sfx(SFX_LIST.melee,.8);
 if(authority()){if(NET.on)bcast({t:'sl',id:NET.id,a})}
 else send(NET.hostConn,{t:'melee',x:p.x,y:p.y,a,z:p.z})}   // il danno lo applica slashHits() a 0, 0,1 e 0,2 s
function reload(){const p=P,w=WEAPONS[p.w],ws=p.ws[p.w];if(!G.over&&ws.rl<=0&&ws.a<w.mag){ws.rl=w.reload*(p.air?1:p.rlm);sfx(SFX_LIST.reload,.7)}}
function flameShot(p,a,w,A){flameFx(p.x,p.y,a,w);
 if(A){flameHit(p.x,p.y,a,p.z,{...w,dmg:w.dmg+dmxB(p.dmx,w)},p.id);if(NET.on)bcast({t:'fl',id:NET.id,x:p.x,y:p.y,a})}else send(NET.hostConn,{t:'fl',x:p.x,y:p.y,a})}
function playerFire(p,a,A){const w=WEAPONS[p.w],ws=p.ws[p.w];if(!readyWS(ws))return;
 const rl=spendWS(ws,p.w,p.air?1:p.frm,p.air?1:p.rlm);p.fl=.04;
 if(w.flame)flameShot(p,a,w,A);
 else{const dEnd=Math.min(w.range,Math.hypot(mx/zoom+camX-p.x,my/zoom+camY-p.y));
  for(const b of fireWeapon(p,p.w,a,dEnd,-1,20)){addBullet(b,A);if(!A)NET.cq.push(b)}}      // client: il colpo locale è solo grafica, l'host crea quello vero
 if(w.sfx&&(!w.sg||performance.now()>sfxFl)){sfx(w.sfx,w.vol);sfxFl=performance.now()+(w.sg||0)}
 if(rl)sfx(SFX_LIST.reload,.7)}
// ===== telecamera: segue il mech; col cursore sul bordo la visuale scorre =====
let camPx=0,camPy=0,camOffX=0,camOffY=0,camResetT=0,camResetX0=0,camResetY0=0;
const camZoomTarget=p=>{
  const base=Math.min(W,H)/CAM.ref;
  const z=CAM.zoom*Math.min(1,Math.max(0.05,base))*Math.min(p.air?CAM.far:1,WEAPONS[p.w].camZ||1);
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
  
  if(dt > 0 && mIn && camResetT <= 0){
    const E = CAM.edge, dx = (mx<=E?-1:0) + (mx>=W-E?1:0), dy = (my<=E?-1:0) + (my>=H-E?1:0), n = Math.hypot(dx,dy);
    if(n){
      const s = CAM.pan * dt / zoom / n, nx = clamp(x + dx*s, lx, hx), ny = clamp(y + dy*s, ly, hy);
      if(nx !== x){ camOffX = nx + VW/2 - P.x; x = nx; }
      if(ny !== y){ camOffY = ny + VH/2 - P.y; y = ny; }
    }
  }
  camX = isFinite(x) ? x : P.x;
  camY = isFinite(y) ? y : P.y;
}
// ===== giocatore locale =====
function playerUpdate(dt,A){const p=P,live=p.hp>0&&!G.over&&!G.ext&&!G.menu,KK=live?K:{};if(!live&&p.air&&p.hp<=0){p.air=false;p.z=0}
 p.sw=Math.max(0,p.sw-dt);p.mc=Math.max(0,p.mc-dt);p.fl=Math.max(0,p.fl-dt);p.dc=Math.max(0,p.dc-dt);
 for(let i=0;i<p.ws.length;i++)tickWS(p.ws[i],i,dt);
 let fw=KK.KeyW?1:0, bk=KK.KeyS?1:0, tr=(KK.KeyD?1:0)-(KK.KeyA?1:0);
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
 const il=Math.hypot(tr,bk-fw),ix=il?tr/il:0,iy=il?(bk-fw)/il:0;G.fog+=((p.air?0:1)-G.fog)*Math.min(1,6*dt);
 if(il){p.ia=Math.atan2(iy,ix);p.it=.4}else p.it=Math.max(0,(p.it||0)-dt);   // ultima direzione WASD (assoluta, come lo scatto) e per quanto è ancora valida
 if(live){
  if(p.air){
   const boost=(!G.over&&!G.ext&&p.hp>0&&(K.ShiftLeft||K.ShiftRight)&&p.dc<DASH_CD*p.dcm);
   if(boost)p.dc=Math.min(DASH_CD*p.dcm,p.dc+DASH_CD*p.dcm*1*dt);   // netto ~50%/s (compensa la ricarica)
   p.h+=tr*AIR_TURN*p.agi*(boost?1.7:1)*dt;                           // +70% virata mentre Shift è premuto
   p.sp+=((fw?AIR_V*p.agi:0)-p.sp)*Math.min(1,(fw?1.1:bk?2.5:.35)*dt);
   p.vx=Math.cos(p.h)*p.sp;p.vy=Math.sin(p.h)*p.sp;
  }else{const hill=inHill(p.x,p.y)?HILL_SLOW:1,wat=!onBridge(p.x,p.y)&&inWater(p.x,p.y,0)?WATER_SLOW:1;
   if(p.dt>0){p.dt-=dt;p.vx=Math.cos(p.da)*DASH_V*wat;p.vy=Math.sin(p.da)*DASH_V*wat}else{p.vx=ix*GRUNT_V*p.spd*hill*wat;p.vy=iy*GRUNT_V*p.spd*hill*wat}
   if(Math.hypot(p.vx,p.vy)>10)p.mh=Math.atan2(p.vy,p.vx)}
  const ox=p.x,oy=p.y;p.x+=p.vx*dt;p.y+=p.vy*dt;
  if(p.air){p.x=clamp(p.x,16,WW-16);p.y=clamp(p.y,16,WH-16)}else{
   push(p,14,1); // Collisione normale col terreno (14 pixel)
   // Nuova collisione con nemici e altri giocatori (repulsione)
   for(const e of units.concat(Object.values(others)))if(e.hp>0&&!e.z&&!e.air){const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy);if(d<34&&d>.1){p.x+=dx/d*(34-d)*12*dt;p.y+=dy/d*(34-d)*12*dt}}
  }
  walkSnd(!p.air&&Math.hypot(p.x-ox,p.y-oy)>15*dt)}
 else walkSnd(false);
 camUpdate(dt);
 p.aim=Math.atan2(my/zoom+camY-p.y,mx/zoom+camX-p.x);let a=p.aim;if(p.air)a=p.h+clamp(ad(a,p.h),-p.qa,p.qa);p.fa=a;
 if(md&&live)playerFire(p,a,A);
 ear.x=p.x;ear.y=p.y;if(A)for(const q of plist()){const rt=q.z?(q.rgA?REGEN*(q.rgG||1):0):REGEN*(q.rgG||1);if(rt&&q.hp<q.hpMax)q.hp=Math.min(q.hpMax,q.hp+rt*dt);
 if(q.shs){q.sg=Math.max(0,(q.sg||0)-dt);for(let i=0;i<q.shs.length;i++)if(q.shs[i]>0)q.shs[i]=Math.max(0,q.shs[i]-dt)}}}
// ===== fendenti: effetto subito, a 0,1 s e a 0,2 s; ogni oggetto è colpito una sola volta per fendente =====
function slashHits(){if(G.over)return;const A=authority();
 for(const sl of slashes){if(!sl.hit||(!A&&sl.id!==NET.id))continue;const q=sl.id===NET.id?P:others[sl.id];if(!q||q.hp<=0)continue;
  while(sl.n<3&&sl.t>=sl.n*.1){sl.n++;meleeHit(sl.x!=null?sl.x:q.x,sl.y!=null?sl.y:q.y,sl.a,q.z?1:0,sl.id,!A,sl.hit)}}}   // il client fa solo scintille (dry)
// ===== ciclo di simulazione =====
function update(dt){
 G.t+=dt;G.msgT=Math.max(0,G.msgT-dt);for(const sl of slashes)sl.t+=dt;slashHits();slashes=slashes.filter(sl=>sl.t<sl.life);fxStep(dt);fallSpray(dt);
 dsUpdate(dt);nukeTick(dt);shipTick(dt);civTick(dt);armTick();
 const A=authority();
 if(G.over){walkSnd(false);camUpdate(dt);return}
 playerUpdate(dt,A);
 const k=Math.min(1,15*dt);
 for(const id in others){const q=others[id];q.fl=Math.max(0,q.fl-dt);q.z=q.air?1:0;q.x+=(q.tx-q.x)*k;q.y+=(q.ty-q.y)*k}
 if(A){
  aiUpdate(dt);bulletsStep(dt,true);
  if(units.some(u=>u.dead)){for(const u of units)if(u.dead){onUnitDead(u);if(NET.on)NET.rm.push(u.id)}units=units.filter(u=>!u.dead)}
  if(G.mode==1)dmTick(dt);else missionTick(dt);
  lifeTick(dt);
  if(!NET.on&&G.mode!=1&&P.hp<=0)finish(1,'Mech distrutto')}
 else{for(const u of units){u.x+=(u.tx-u.x)*k;u.y+=(u.ty-u.y)*k;u.h+=ad(u.th,u.h)*Math.min(1,12*dt);u.fl=Math.max(0,u.fl-dt)}
  bulletsStep(dt,false);if(MS.al&&MS.al.tx!=null){MS.al.x+=(MS.al.tx-MS.al.x)*k;MS.al.y+=(MS.al.ty-MS.al.y)*k}}
 netTick(dt)}
// ===== ciclo di disegno: limite fps, contatore, qualità automatica =====
let last=performance.now(),fAcc=0,fN=0,slow=0;
function loop(now){requestAnimationFrame(loop);
 const el=(now-last)/1000;if(el<1/TARGET_FPS-.003)return;last=now;const dt=Math.min(.05,el);
 fAcc+=el;fN++;if(fAcc>=.5){G.fps=fN/fAcc;fAcc=fN=0;
  if(G.started&&!G.baking&&G.fps<TARGET_FPS*.85&&G.q>0){if(++slow>=3){slow=0;G.q--;resize();fxP.length=0}}else slow=0}   // sotto l'85% dell'obiettivo per 1,5 s: grafica più leggera (non durante la creazione dello sfondo)
 if(G.started){if(G.baking)bakeDraw();else{update(dt);draw(dt)}}}
addEventListener('keydown',e=>{K[e.code]=1;if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;
 if(G.menu){if(!e.repeat&&(e.code=='KeyK'||(e.code=='KeyR'&&G.baking)))saveConfig();return}   // a menu aperto: K chiude (R solo durante il caricamento), gli altri tasti non fanno nulla
 if(e.code=='KeyK'&&!e.repeat)armOpen();
 if(e.code=='KeyB'&&!e.repeat){G.noBg=!G.noBg;say(G.noBg?'Visuale termica attiva':'Visuale termica disattivata')}
 if(e.code=='KeyF'&&!e.repeat){camResetT=0.2;camResetX0=camOffX;camResetY0=camOffY;}
 if(e.code=='Space'){e.preventDefault();if(!e.repeat)toggleMode()}
 if(e.code=='KeyR'){
  if(G.baking)cfgOpen(false);   // durante il caricamento R apre il menu (per chiuderlo vedi sopra)
  else if(G.over)restartGame();
  else reload();
 }
 if((e.code=='ShiftLeft'||e.code=='ShiftRight')&&!e.repeat)dash();
 const n=+e.code.slice(5);if(e.code.startsWith('Digit')&&P.eq[n-1]!=null&&!G.over)P.w=P.eq[n-1]});
addEventListener('keyup',e=>K[e.code]=0);
// ===== durante la partita il browser non deve reagire a scorciatoie, tasto Alt, pulsanti laterali del mouse e zoom =====
addEventListener('keydown',e=>{
 if(!G.started||/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))return;
 if(e.code=='Escape'||e.code=='F5'||e.code=='F11'||e.code=='F12')return;   // restano attivi: rilascio mouse, ricarica pagina, schermo intero, strumenti sviluppatore
 e.preventDefault()},{capture:true});
addEventListener('keyup',e=>{if(G.started&&(e.code=='AltLeft'||e.code=='AltRight'))e.preventDefault()},{capture:true});   // Alt da solo apre il menu del browser
addEventListener('mousedown',e=>{if(G.started&&e.button!=0&&e.button!=2)e.preventDefault()},{capture:true});   // rotellina premuta e pulsanti avanti/indietro
addEventListener('auxclick',e=>{if(G.started)e.preventDefault()},{capture:true});
addEventListener('wheel',e=>{if(G.started&&(e.ctrlKey||e.metaKey))e.preventDefault()},{passive:false,capture:true});   // Ctrl + rotellina = zoom pagina
const PLR=cv.requestPointerLock||cv.webkitRequestPointerLock,locked=()=>document.pointerLockElement===cv||document.webkitPointerLockElement===cv;
function plock(){try{if(PLR&&!locked()){const r=PLR.call(cv);if(r&&r.catch)r.catch(()=>{})}}catch(_){}}
function unlock(){try{const f=document.exitPointerLock||document.webkitExitPointerLock;if(f&&locked())f.call(document)}catch(_){}}
addEventListener('mousemove',e=>{if(locked()){mx+=e.movementX||0;my+=e.movementY||0}else{const r=cv.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top}mx=clamp(mx,0,W);my=clamp(my,0,H);mIn=true});
document.documentElement.addEventListener('mouseleave',e=>{if(locked())return;const r=cv.getBoundingClientRect(),x=clamp(e.clientX-r.left,0,W),y=clamp(e.clientY-r.top,0,H),d=[x,W-x,y,H-y],k=d.indexOf(Math.min(...d));mx=k==0?0:k==1?W:x;my=k==2?0:k==3?H:y;mIn=true});
for(const ev of['pointerlockchange','webkitpointerlockchange'])document.addEventListener(ev,()=>{if(locked())say('Mouse agganciato (Esc per rilasciarlo)');else mIn=false});
cv.addEventListener('mousedown',e=>{plock();if(e.button==0)md=true;else if(e.button==2)melee()});
cv.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('mouseup',()=>md=false);
addEventListener('blur',()=>{for(const k in K)K[k]=0;md=false;mIn=false;walkSnd(false)});
// ===== schermo intero =====
const FSE=document.documentElement,FSR=FSE.requestFullscreen||FSE.webkitRequestFullscreen,FSX=document.exitFullscreen||document.webkitExitFullscreen,fsCan=!!FSR&&document.fullscreenEnabled!==false;
const fsOn=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);
function fsSet(go){if(!fsCan)return;try{const on=fsOn();if(go==null)go=!on;if(go===on)return;const r=go?FSR.call(FSE):(FSX&&FSX.call(document));if(r&&r.catch)r.catch(()=>{})}catch(_){}}
const $=i=>document.getElementById(i);   // ← questa riga era stata eliminata per sbaglio
addEventListener('keydown',e=>{if(e.code=='KeyO'&&!e.repeat&&!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))fsSet()});
addEventListener('click',()=>{fsSet(true); playBgm();},{once:true});
// ===== schermata iniziale =====
function showLobby(s){walkSnd(false);unlock();G.menu=0;$('cfg').classList.remove('arm');$('cfg').style.display='none';$('lobby').style.display='flex';$('lobSt').textContent=s||''}
function hideLobby(){$('lobby').style.display='none'}
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
COLS.forEach((c,i)=>{const d=document.createElement('div');d.className='sw'+(i?'':' on');d.style.background=c[0];d.onclick=()=>{myCi=i;document.querySelectorAll('.sw').forEach((e,j)=>e.classList.toggle('on',j==i));updateTitleColor();updateMechImage();cfgMechDraw();};$('lobCols').appendChild(d)});
updateTitleColor();
const prep=()=>{G.diff=clamp(+$('lobDiff').value||1,1,10);G.sel=+$('lobMis').value||0;G.mode=+$('lobMode').value||0;myName=($('lobName').value||'Pilota').slice(0,12);P.ci=myCi;P.name=myName;applyLoadout(P);resetPlayer(P);preloadSfx();resize()};
const noPeer=()=>{if(typeof Peer=='undefined'){$('lobSt').textContent='peerjs.min.js non trovato: multiplayer non disponibile';return true}};
const later=f=>{$('lobSt').textContent='Genero la mappa…';setTimeout(f,40)};   // lascia il tempo di mostrare il messaggio prima della generazione
$('lobDiff').oninput=()=>{$('lobDiffV').textContent=$('lobDiff').value};
$('lobMode').onchange=()=>{$('lobMisRow').style.display=$('lobMode').value=='1'?'none':'flex'};
$('bSolo').onclick=()=>{prep();later(()=>{NET.id=0;startGame(newSeed(),false);G.started=true;hideLobby()})};
$('bHost').onclick=()=>{prep();if(noPeer())return;$('lobSt').textContent='Creo la partita…';hostGame(e=>{if(e){$('lobSt').textContent='Errore: '+e;return}later(()=>{startGame(newSeed(),false);G.started=true;hideLobby();say('Codice partita: '+NET.code)})})};
$('bJoin').onclick=()=>{prep();if(noPeer())return;const c=$('lobCode').value.trim();if(c.length<4){$('lobSt').textContent='Inserisci il codice';return}$('lobSt').textContent='Mi collego…';joinGame(c,e=>{if(e)$('lobSt').textContent='Errore: '+e},s=>{$('lobSt').textContent=s})};
// ===== configurazione del mech: 4 caselle (2 a sinistra, 2 a destra), ognuna con un'arma o un upgrade =====
const ITEMS=[...WEAPONS.slice(0,5).map((w,i)=>({id:'w'+i,kind:'Arma',name:w.n,info:'Danno '+w.dmg+' · 1 colpo ogni '+w.cd+' s · gittata '+w.range+' · caricatore '+w.mag,col:WP_COL})),
 ...UP_GROUPS.flatMap(g=>UPGRADES.filter(u=>u.g==g).map(u=>({id:'u:'+u.id,kind:'Upgrade',name:u.n,info:u.d,col:UP_COL[g],ic:u.ic})))];   // ordine: armi → tutti → Grunt → Air
// icona di un upgrade: un solo disegno (campo ic) per selezione e HUD
const upSvg=(it,sz)=>'<svg xmlns="http://www.w3.org/2000/svg" width="'+sz+'" height="'+sz+'" viewBox="-10 -10 20 20">'+it.ic.replace(/currentColor/g,it.col)+'</svg>';
const upImgs={};
function upImg(it){let im=upImgs[it.id];if(!im){im=upImgs[it.id]=new Image();im.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(upSvg(it,64))}return im}
const itemOf=id=>ITEMS.find(x=>x.id===id);let pickSlot=-1;
function cfgMechDraw(){const c=$('cfgCv').getContext('2d'),col=COLS[myCi]||COLS[0];c.clearRect(0,0,260,260);c.save();c.translate(130,130);c.fillStyle=col[0];c.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3;c.lineTo(Math.cos(a)*84,Math.sin(a)*84)}c.closePath();c.fill();
 c.fillStyle=col[1];c.beginPath();c.arc(0,0,52,0,TAU);c.fill();c.fillStyle='#1d1d1d';c.fillRect(0,-12,120,24);c.restore()}
function cfgDraw(){[['cfgL',0],['cfgR',2]].forEach(([id,o])=>{const col=$(id);col.innerHTML='';
  for(let k=0;k<2;k++){const i=o+k,it=itemOf(loadout[i]),b=document.createElement('button');b.type='button';b.className='slot'+(it?'':' empty');
   b.innerHTML='<small>Casella '+(i+1)+(it?' · '+it.kind:'')+'</small><b'+(it?' style="color:'+it.col+';"':'')+'>'+(it?it.name:'Vuota')+'</b><span>'+(it?it.info:'Tocca per scegliere un’arma o un upgrade')+'</span>';b.onclick=()=>pickOpen(i);col.appendChild(b)}});cfgMechDraw()}
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
 ITEMS.forEach(it => add(it.id, it.kind+': '+it.name, it.info, it.col));
 $('pick').style.display = 'flex';
}
function pickSet(id){const i=pickSlot,old=loadout[i];if(id&&id[0]=='w'){const j=loadout.indexOf(id);if(j>=0&&j!==i)loadout[j]=old}loadout[i]=id;$('pick').style.display='none';cfgDraw()}
const MECH_IMAGES = ['AG-yellow.png', 'AG-blue.png', 'AG-green.png', 'AG-red.png', 'AG-violet.png', 'AG-grey.png', 'AG-white.png'];

function updateMechImage() {
 const im = $('cfgImg');
 im.onload = () => { im.style.display = 'block'; $('cfgCv').style.display = 'none'; };
 im.onerror = () => { im.style.display = 'none'; $('cfgCv').style.display = 'block'; };
 im.src = 'img/' + MECH_IMAGES[myCi];
}
$('pickX').onclick=()=>{$('pick').style.display='none'};$('pick').onclick=e=>{if(e.target===$('pick'))$('pick').style.display='none'};
$('bCfg').onclick=()=>{cfgDraw();updateMechImage();$('cfg').style.display='flex'};
// ===== menu di configurazione: lobby, caricamento e armeria usano lo stesso menu e lo stesso salvataggio =====
function cfgOpen(arm){if(G.menu)return;G.menu=1;md=false;unlock();$('cfg').classList.toggle('arm',!!arm);cfgDraw();updateMechImage();$('cfg').style.display='flex'}
$('bCfgLoading').onclick=()=>cfgOpen(false);
function armOpen(){if(ARM.near&&!G.over&&P.hp>0)cfgOpen(true)}   // armeria: menu sopra la mappa
// salva, applica e sincronizza in rete
function saveConfig(){
 const inGame=G.started&&!G.baking,w0=P.w,sh=P.shs||[];
 G.menu=0;md=false;$('cfg').style.display='none';$('cfg').classList.remove('arm');$('pick').style.display='none';
 if(!inGame)P.ci=myCi;                                                // il colore si cambia solo in lobby o durante il caricamento
 applyLoadout(P);P.w=P.eq.includes(w0)?w0:P.eq[0];                    // resta l'arma in mano se è ancora equipaggiata
 P.shs=Array.from({length:P.shn|0},(_,i)=>sh[i]||0);                  // gli scudi in ricarica restano in ricarica
 if(NET.on){const msg={t:'ldt',id:NET.id,ci:P.ci,dr:[P.drG,P.drA],rg:[P.rgA?1:0,P.rgG],dm:P.dmx,sh:P.shn,ml:P.mlm};
  if(NET.host)bcast(msg);else send(NET.hostConn,msg)}
 if(inGame)say('Equipaggiamento aggiornato')}
$('cfgOk').onclick=saveConfig;

$('cfgMech').onclick=()=>{
 myCi = (myCi + 1) % COLS.length;
 updateTitleColor();
 updateMechImage();
 cfgMechDraw();
 document.querySelectorAll('.sw').forEach((e,j)=>e.classList.toggle('on',j==myCi));
};

// ===== LISTENER EVENTI TOUCH =====
function handleTouchStart(e){
  if(!G.started || G.over || G.menu) return;   // a menu aperto i tocchi vanno al menu (senza preventDefault)
  TOUCH.active = true;
  updateTouchButtons();
  const rect = cv.getBoundingClientRect();
  for(let i=0; i<e.changedTouches.length; i++){
    const t = e.changedTouches[i];
    const tx = t.clientX - rect.left, ty = t.clientY - rect.top;
    
    // Controlla se il tocco è su uno dei pulsanti tattici
    let hitBtn = false;
    for(const b of TOUCH.btns){
      if(Math.hypot(tx - b.x, ty - b.y) <= b.r + 10){
        b.action();
        hitBtn = true;
        break;
      }
    }
    if(hitBtn) continue;

    // Metà Sinistra -> Joystick Movimento
    if(tx < W / 2 && TOUCH.left.id == null){
      TOUCH.left.id = t.identifier;
      TOUCH.left.x0 = TOUCH.left.x = tx;
      TOUCH.left.y0 = TOUCH.left.y = ty;
      TOUCH.left.active = true;
      TOUCH.left.vx = 0; TOUCH.left.vy = 0;
    }
    // Metà Destra -> Joystick Mira e Sparo
    else if(tx >= W / 2 && TOUCH.right.id == null){
      TOUCH.right.id = t.identifier;
      TOUCH.right.x0 = TOUCH.right.x = tx;
      TOUCH.right.y0 = TOUCH.right.y = ty;
      TOUCH.right.active = true;
      TOUCH.right.vx = 0; TOUCH.right.vy = 0;
    }
  }
  e.preventDefault();
}

function handleTouchMove(e){
  if(!G.started || G.over || G.menu) return;
  const rect = cv.getBoundingClientRect();
  for(let i=0; i<e.changedTouches.length; i++){
    const t = e.changedTouches[i];
    const tx = t.clientX - rect.left, ty = t.clientY - rect.top;

    if(t.identifier === TOUCH.left.id){
      TOUCH.left.x = tx; TOUCH.left.y = ty;
      const dx = tx - TOUCH.left.x0, dy = ty - TOUCH.left.y0, d = Math.hypot(dx, dy);
      const maxR = 55;
      TOUCH.left.vx = (d > 5 ? dx / Math.max(d, maxR) : 0);
      TOUCH.left.vy = (d > 5 ? dy / Math.max(d, maxR) : 0);
    } else if(t.identifier === TOUCH.right.id){
      TOUCH.right.x = tx; TOUCH.right.y = ty;
      const dx = tx - TOUCH.right.x0, dy = ty - TOUCH.right.y0, d = Math.hypot(dx, dy);
      if(d > 8){
        const aimAngle = Math.atan2(dy, dx);
        const wRange = WEAPONS[P.w].range || 400;
        const targetWorldX = P.x + Math.cos(aimAngle) * wRange;
        const targetWorldY = P.y + Math.sin(aimAngle) * wRange;
        mx = (targetWorldX - camX) * zoom;
        my = (targetWorldY - camY) * zoom;
        mIn = true;
        // Fuoco automatico se la levetta viene allontanata oltre 18px
        md = (d >= 18);
      } else {
        md = false;
      }
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
    if(t.identifier === TOUCH.right.id){
      TOUCH.right.id = null; TOUCH.right.active = false;
      TOUCH.right.vx = 0; TOUCH.right.vy = 0;
      md = false;
    }
  }
}

window.addEventListener('touchstart', handleTouchStart, { passive: false });
window.addEventListener('touchmove', handleTouchMove, { passive: false });
window.addEventListener('touchend', handleTouchEnd, { passive: false });
window.addEventListener('touchcancel', handleTouchEnd, { passive: false });

const bgmBtn = document.getElementById('bgmToggle');
if (bgmBtn) bgmBtn.onclick = () => toggleBgm();

G.q=MOBILE?1:2;resize();requestAnimationFrame(loop);
