'use strict';
/* AIRGRUNT · AGai.js — AI dei nemici, leggera e coordinata.
   Ogni unità vive in uno di tre stati: 0 INATTIVA (pattuglia), 1 REAZIONE (si è accorta, aspetta il tempo di reazione), 2 CACCIA.
   - Percezione: ogni unità "pensa" 4 volte al secondo (a turno, non tutte nello stesso fotogramma); il movimento e il tiro sono a ogni fotogramma.
   - Stealth: un giocatore non visto da 5 s è "nascosto"; chi lo avvista per primo reagisce più lentamente (sorpresa).
   - Tempo di reazione: dipende dalla difficoltà (diffReact) con una variazione casuale.
   - Allarme e caccia di gruppo: l'avvistamento avvisa la squadra e le unità vicine; la squadra assegna ruoli (frontale, fianco sinistro, fianco destro).
   - Aggiramenti e percorsi: A* sulla griglia di navigazione (un percorso per volta, a coda), linea retta quando la strada è libera.
   - Armi: le stesse di WEAPONS, con raffiche e pause (la pausa non cambia l'arma). */
let UID=1000,GID=0,TG=[],PQ=[];
const rnd=(a,b)=>a+Math.random()*(b-a);
function mkUnit(k,x,y,g){const T=UT[k],hp=T.hp,ar=T.arm>=1?ARM_MIN+Math.floor(Math.random()*(ARM_MAX-ARM_MIN+1)):Math.random()<T.arm?ARM_MIN+Math.floor(Math.random()*(ARM_MAX-ARM_MIN+1)):0;
 const u={id:UID++,k,x,y,h:rnd(0,TAU),hp,mhp:hp,ar,g,z:T.fly?1:0,st:0,rt:0,th:rnd(0,.3),thT:.25,lkx:x,lky:y,lkt:0,path:null,pi:0,gx:x,gy:y,pt:0,pq:0,role:0,fk:0,side:Math.random()<.5?1:-1,
 bl:0,bp:rnd(0,1),fl:0,dis:0,slp:0,vx:0,vy:0,hx:x,hy:y,wt:rnd(0,3),px:x,py:y,od:Math.random()<.5?-1:1,dn:rnd(.5,2),dk:rnd(0,1),dg:0,dd:1,stk:0,rp:0,bo:null,sq:0,shout:0,bt:3,vis:false,vd:1e9,T:null,fast:k==1&&Math.random()<.5,aimT:0,la:-99,lvx:0,lvy:0,sw:0,sa:0};
 // Tank: variante deterministica (0 = cannone del player, 1 = lanciarazzi)
 // L'id è progressivo e identico sull'host e sui client, quindi u.tv coincide ovunque.
 if(k==5){u.tv=hs(u.id,7,M.seed)<.5?0:1;if(u.tv==0)u.bw=W_CAN}
 const wi=u.bw!=null?u.bw:T.w;
 if(wi>=0)u.ws=newWS(wi);if(T.w2!=null)u.ws2=newWS(T.w2);
 units.push(u);return u}
// ===== popolazione iniziale: ~50 nemici, il numero NON dipende dalla difficoltà =====
function populate(){units.length=0;PQ.length=0;UID=1000;GID=0;
 const dS=(x,y)=>Math.hypot(x-START[0],y-START[1]),okE=(x,y,r)=>clearAt(x,y,r)&&dS(x,y)>SAFE_R,rx=()=>rnd(300,SEA-150),ry=()=>rnd(150,WH-150);
 let n0=0;   // prima le torrette agli angoli dei complessi, ai varchi e nei porti (punti decisi dalla mappa)
 for(const sp of shuf2(M.tspots||[])){if(n0>=Math.round(N_TUR*.6))break;if(okE(sp[0],sp[1],30)&&!units.some(t=>Math.hypot(sp[0]-t.x,sp[1]-t.y)<220)){mkUnit(0,sp[0],sp[1],-1);n0++}}
 for(let n=n0,tr=0;n<N_TUR&&tr<5000;tr++){const x=rx(),y=ry();if(okE(x,y,30)&&!units.some(t=>Math.hypot(x-t.x,y-t.y)<350)){mkUnit(0,x,y,-1);n++}}
 for(let n=0,tr=0;n<N_SQUAD&&tr<5000;tr++){const x=rx(),y=ry();if(!okE(x,y,40))continue;const r0=Math.random(),sz=r0<.3?1:r0<.6?2:r0<.85?3:4,g=GID;let c=0;
  for(let k=0;k<sz;k++){const a=Math.random()*TAU,d=k?rnd(45,80):0,ex=x+Math.cos(a)*d,ey=y+Math.sin(a)*d;if(clearAt(ex,ey,20)){mkUnit(1,ex,ey,g);c++}}
  if(c){GID++;n++}}
 for(let n=0,tr=0;n<N_FLY&&tr<5000;tr++){const x=rnd(400,SEA-300),y=rnd(300,WH-300);if(dS(x,y)>2800&&!units.some(t=>t.k==2&&Math.hypot(x-t.x,y-t.y)<1500)){mkUnit(2,x,y,GID++);n++}}
 const spawn=(k,cnt)=>{for(let c=0,tr=0;c<cnt&&tr<5000;tr++){const x=rx(),y=ry();
  if((k==3?dS(x,y)>SAFE_R:okE(x,y,k==5?40:30))&&!units.some(t=>t.k==k&&Math.hypot(x-t.x,y-t.y)<(k==4?600:300))){mkUnit(k,x,y,-1);c++}}};
 spawn(3,N_RUSH);spawn(4,N_SNIP);spawn(5,N_TANK);G.cap=units.length}
// deathmatch: bot che combattono contro tutti, sparsi sui punti di rinascita
function populateDM(){units.length=0;PQ.length=0;UID=1000;GID=0;const sp=shuf2(M.dm);
 for(let i=0;i<DM_BOTS&&i<sp.length;i++){const u=mkUnit(1,sp[i][0],sp[i][1],-1);u.name='BOT '+(i+1);u.ci=(Math.random()*COLS.length)|0;u.kills=0;u.deaths=0;u.dm=1;botLoadout(u)}}
const shuf2=a=>a.map(o=>[Math.random(),o]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]);
// ===== bot del deathmatch: 1 arma a caso (fra le 5) e 3 upgrade a caso (doppioni ammessi, come nelle caselle del giocatore) =====
const BOT_UP=['regen','dmx','shield','gspd','gfrm','grlm','gdr'];      // upgrade che hanno effetto su un mech a terra
const BOT_BURST=[[[3,5],[1,1.8]],[[1,1],[.3,.8]],[[25,50],[1,2]],[[1,2],[1.5,2.5]],[[1,2],[.7,1.3]]];   // per arma: [colpi per raffica, pausa in s]
function botLoadout(u){
 const wi=Math.random()*5|0,W=WEAPONS[wi],ups=[0,1,2].map(()=>{const id=BOT_UP[Math.random()*BOT_UP.length|0];return UPGRADES.find(x=>x.id==id)});   // prima si sceglie l'id, poi lo si cerca
 const mul=k=>ups.reduce((m,x)=>x[k]?m+(x[k]-1):m,1),sum=k=>ups.reduce((m,x)=>x[k]?m+x[k]:m,0);
 u.bw=wi;u.ws=newWS(wi);u.burst=BOT_BURST[wi][0];u.pause=BOT_BURST[wi][1];u.bl=Math.round(rnd(u.burst[0],u.burst[1]));
 u.hold=Math.min(UT[1].hold,Math.max(150,W.range*.6));                 // distanza di tiro adatta all'arma (lanciafiamme da vicino, ecc.)
 u.spm=mul('spd');u.frm=mul('frm');u.rlm=mul('rlm');u.dmx=sum('dmx');u.ar=(u.ar||0)+sum('drG');
 u.rg=ups.some(x=>x.rgA)?REGEN*mul('rgG'):0;                            // rigenerazione
 u.shs=Array(sum('sh')).fill(0);u.sg=0}                                  // scudi
// ===== percezione, allarme, reazione =====
const reactTime=mul=>diffReact(G.diff)*(.7+.6*Math.random())*(mul||1);
function startReact(u,T,mul){u.st=1;u.rt=reactTime(mul);u.lkx=T.x;u.lky=T.y;u.lkt=LOST_T;u.fk=0;u.sa=0;u.sw=0;u.la=G.t;u.lvx=T.vx||0;u.lvy=T.vy||0}
// avvisa la squadra e le unità vicine (con un po' di ritardo proporzionale alla distanza); full=false aggiorna solo chi è già allarmato
function alertFrom(u,T,full){if(G.mode==1)return;
 const members=[];
 for(const v of units){if(v===u||v.dead||v.slp)continue;const d=Math.hypot(v.x-u.x,v.y-u.y),same=u.g>=0&&v.g===u.g;
  if(!same&&d>ALERT_R)continue;
  if(v.st==0){if(!full)continue;startReact(v,T,1);v.rt+=d/1500}
  else if(v.st>=1){v.lkx=T.x;v.lky=T.y;v.lkt=LOST_T;v.lvx=T.vx||0;v.lvy=T.vy||0;v.sa=0;v.sw=0}
  if(same)members.push(v)}
 if(full&&u.g>=0){members.push(u);members.sort((a,b)=>a.id-b.id);const R0=[0,1,-1,0];members.forEach((v,i)=>{v.role=UT[v.k].fixed?0:R0[i%4]})}}
// colpita da un giocatore: se non ne vede nessuno si attiva subito (senza tempo di reazione) e corre verso l'origine del colpo
function hurtReact(u,o){const q=o===P.id?P:others[o];if(!q||q.hp<=0||u.dead)return;
 u.slp=0;if(u.st==2&&u.vis)return;
 u.lkx=q.x;u.lky=q.y;u.lkt=LOST_T;u.sa=0;u.sw=0;u.lvx=q.vx||0;u.lvy=q.vy||0;u.la=G.t;
 if(u.st<2){u.st=2;u.rt=0;u.fk=0;u.path=null;u.pt=0}
 if(u.shout<=0){u.shout=1.5;alertFrom(u,q,true)}}   // anche squadra e unità vicine corrono verso l'origine del colpo
function think(u){
 // bersaglio = il più vicino tra quelli che vede; se non ne vede nessuno, il più vicino in assoluto
 let T=null,bd=1e18,vis=false,blk=null;const sight=UT[u.k].sight;
 for(const q of TG){if(q===u||q.hp<=0)continue;const d2=(q.x-u.x)**2+(q.y-u.y)**2;let v=false,b=null;
  if(d2<=sight*sight){if(q.z||u.z)v=true;else{b=losBlocker(u.x,u.y,q.x,q.y,eRad(q));v=!b}}
  if((v&&!vis)||(v===vis&&d2<bd)){T=q;bd=d2;vis=v;blk=b}}
 u.T=T;if(!T){u.vis=false;u.vd=1e9;return}
 const d=Math.sqrt(bd);
 u.vis=vis;u.vd=d;u.blk=blk;
 if(vis){
    u.lkx=T.x;u.lky=T.y;u.lkt=LOST_T;u.lvx=T.vx||0;u.lvy=T.vy||0;u.sa=0;u.sw=0;   // ultima posizione e velocità; azzera la ricerca
    const recent=G.t-u.la<RECALL_T;u.la=G.t;                                        // allerta ancora viva
    let surprise=false;if(T.pl){T.unseen=0;if(T.hid){T.hid=false;surprise=true}}
    if(u.st==0){startReact(u,T,recent?RECALL_MUL:surprise?1.8:1);alertFrom(u,T,true);u.shout=1.5}
    else alertFrom(u,T,false)}
   else if(u.st>=1){
    const distToTarget = Math.hypot(u.lkx - u.x, u.lky - u.y);
    if(u.st === 2 && distToTarget > 100) u.lkt-=u.thT*.35;   // in viaggio: il timer scende lentamente
    else u.lkt-=u.thT;
    if(u.lkt<=0){u.st=0;u.path=null;u.fk=0;u.sa=0;u.sw=0}
  }
}
// ===== tiro: raffiche e pause; stessa arma e stesse funzioni dei giocatori =====
function aiShoot(u,dt){const Ty=UT[u.k],wi=u.bw!=null?u.bw:Ty.w;if(wi<0||!u.ws)return;const T=u.T,W=WEAPONS[wi],R=W.range*(Ty.rm||1);
 let tx,ty,tz,vis=u.vis,ob=false;
 if(u.stk>2&&u.bo&&!u.bo.dead){tx=u.bo.x;ty=u.bo.y;tz=0;ob=true}   // bloccato da più di 2 s: spara all'ostacolo (ha la precedenza sul bersaglio)
 else if(vis){
  if((u.aimT||0) < diffAimTime(G.diff)) return; // Richiede tempo di vista ininterrotta in base alla difficoltà
  tx=T.x;ty=T.y;tz=T.z?1:0;
 }
 else if(u.np&&u.blk&&!u.blk.ind&&u.vd<R){tx=u.blk.x;ty=u.blk.y;tz=0;vis=true}      // percorso bloccato: spara all'ostacolo
 else return;
 const d=Math.hypot(tx-u.x,ty-u.y);if(d>=R)return;
 let ang=Math.atan2(ty-u.y,tx-u.x);
 
 // Rotazione graduale e fluida per tutte le unità (fisse e mobili)
 const rotSpeed = Ty.fixed ? 5 : 8; // Velocità di rotazione (radianti al secondo)
 u.h += clamp(ad(ang, u.h), -rotSpeed * dt, rotSpeed * dt);
 
 // L'unità non spara finché la canna non è puntata verso il bersaglio (entro ~17 gradi / 0.3 radianti)
 if(Math.abs(ad(ang, u.h)) > 0.3) return;
 if(u.ws2){u.bt-=dt;if(u.bt<=0&&readyWS(u.ws2)&&u.vis){u.bt=4;const b=fireWeapon(u,Ty.w2,ang,Math.min(WEAPONS[Ty.w2].range,d+200),tz,30);b.forEach(x=>addBullet(x,true));spendWS(u.ws2,Ty.w2);sfxAt(WEAPONS[Ty.w2].sfx,.5,u.x,u.y,60)}}
 if(u.bp>0){u.bp-=dt;return}
 if(!readyWS(u.ws))return;
 if(u.vis&&!ob&&Math.random()<Ty.lead){const sp=W.speed*(Ty.bsp||1);let t=d/sp;tx=T.x+(T.vx||0)*t;ty=T.y+(T.vy||0)*t;t=Math.hypot(tx-u.x,ty-u.y)/sp;tx=T.x+(T.vx||0)*t;ty=T.y+(T.vy||0)*t}
 ang=Math.atan2(ty-u.y,tx-u.x)+(Math.random()*2-1)*Ty.err*Math.PI/180;
 const dEnd=Math.min(R,Math.hypot(tx-u.x,ty-u.y)+12),off=Ty.r+4;
 if(W.flame){flameHit(u.x,u.y,ang,u.z,{...W,dmg:W.dmg+dmxB(u.dmx,W)},u.id);flameFx(u.x,u.y,ang,W);if(NET.on)bcast({t:'fl',id:u.id,x:u.x,y:u.y,a:ang})}   // lanciafiamme del bot
 else for(const b of fireWeapon(u,wi,ang,dEnd,tz,off,Ty.bsp))addBullet(b,true);
 spendWS(u.ws,wi,(Ty.rate||1)*(u.frm||1),(Ty.rlm||1)*(u.rlm||1));if(Ty.inf){u.ws.a=W.mag;u.ws.rl=0}   // torretta: caricatore infinito, mai ricarica
 u.fl=.04;sfxAt(wi==W_MG?SFX_LIST.enemy:W.sfx,.35,u.x,u.y,40);
 if(!Ty.inf&&--u.bl<=0){const ps=u.pause||Ty.pause,bs=u.burst||Ty.burst;u.bp=rnd(ps[0],ps[1]);u.bl=Math.round(rnd(bs[0],bs[1]))}}
// ===== movimento =====
// schivata casuale (come jetgrunt-MP-22): ogni 0,8–1,4 s, nel 70% dei casi uno scatto laterale di 0,3–0,6 s.
// Restituisce true mentre schiva e mette in DG la velocità laterale (perpendicolare alla direzione verso tx,ty)
const DG={x:0,y:0};
function dodgeStep(u,dt,s,tx,ty){u.dk-=dt;
 if(u.dg>0){u.dg-=dt;const dx=tx-u.x,dy=ty-u.y,d=Math.hypot(dx,dy)||1;DG.x=-dy/d*u.dd*s;DG.y=dx/d*u.dd*s;return true}
 if(u.dk<=0){u.dk=rnd(.8,2.4);if(Math.random()<.7){u.dg=rnd(.3,.6);u.dd=Math.random()<.5?-1:1}}
 return false}
function stepTo(u,tx,ty,sp,dt){const dx=tx-u.x,dy=ty-u.y,d=Math.hypot(dx,dy)||1,s=Math.min(sp,d/dt);u.vx=dx/d*s;u.vy=dy/d*s;u.x+=u.vx*dt;u.y+=u.vy*dt}
function separate(u,dt){for(const v of units){if(v===u||v.z||UT[v.k].fixed)continue;const dx=u.x-v.x,dy=u.y-v.y,d=Math.hypot(dx,dy);if(d<44&&d>.1){const k=(44-d)/d*4*dt;u.x+=dx*k;u.y+=dy*k}}}
function wantPath(u,gx,gy){ // pianifica a coda: massimo 2 percorsi per fotogramma
 const moved=Math.hypot(gx-u.gx,gy-u.gy)>160;
 if((!u.path||u.pt<=0||moved)&&!u.pq){u.gx=gx;u.gy=gy;u.pq=1;PQ.push(u);u.pt=rnd(1.6,2.6)}}
function followPath(u,gx,gy,sp,dt){
 if(u.vis&&u.vd<500&&navLos(u.x,u.y,gx,gy)){u.path=null;stepTo(u,gx,gy,sp,dt);return}   // via libera: linea retta
 wantPath(u,gx,gy);
 if(u.path&&u.pi<u.path.length){const p=u.path[u.pi];if(Math.hypot(p[0]-u.x,p[1]-u.y)<30){u.pi++;if(u.pi>=u.path.length){u.path=null;u.pt=0;return}}
  else{stepTo(u,p[0],p[1],sp,dt);return}}
 stepTo(u,gx,gy,sp,dt)}
// ostacolo distruggibile davanti all'unità, nella direzione (dx,dy), entro L px (null se non ce n'è)
function blockerAhead(u,dx,dy,L){const d=Math.hypot(dx,dy);if(d<1)return null;
 const o=losBlocker(u.x,u.y,u.x+dx/d*L,u.y+dy/d*L,0);return o&&!o.ind?o:null}
// ricerca: all'ultimo punto noto si ferma e si guarda attorno, poi ispeziona fino a SEARCH_N punti; solo dopo rinuncia
function searchNext(u){
 if(u.sw>0)return;                                              // sta ancora guardandosi attorno
 if(u.sa>=SEARCH_N){u.st=0;u.path=null;u.fk=0;u.sa=0;return}   // ricerca finita: torna in pattuglia
 let px,py;
 if(u.sa==0){const s=Math.min(1,400/(Math.hypot(u.lvx,u.lvy)*SEARCH_LEAD||1));px=u.lkx+u.lvx*SEARCH_LEAD*s;py=u.lky+u.lvy*SEARCH_LEAD*s}   // dove stava andando
 else{const a=Math.random()*TAU,d=rnd(120,260);px=u.lkx+Math.cos(a)*d;py=u.lky+Math.sin(a)*d}                                           // attorno
 px=clamp(px,100,WW-100);py=clamp(py,100,WH-100);
 u.sa++;u.sw=1.2;
 if(!nav[ncell(px,py)]){u.lkx=px;u.lky=py;u.path=null;u.pt=0}   // punto raggiungibile: ci va dopo la pausa
}
function groundAI(u,dt){const Ty=UT[u.k],T=u.T,x0=u.x,y0=u.y,hd=u.hold||Ty.hold;let moving=false,sp=0,dgx=0,dgy=0;
 if(u.st==2){
  const tgt=u.vis?T:{x:u.lkx,y:u.lky,vx:0,vy:0};let gx=tgt.x,gy=tgt.y;
  if(u.k!=5&&dodgeStep(u,dt,u.fast?170:140,gx,gy)){dgx=DG.x;dgy=DG.y;moving=true}   // schivata: si somma al movimento, non lo sostituisce (il tank non schiva)
  if(u.vis&&u.vd<hd){if(dgx||dgy)u.vx=u.vy=0}   // in posizione: si ferma e spara (si muove solo per schivare)
  else{
   if(u.role&&!u.fk&&u.vis&&u.vd>hd*1.3){ // fianco: punta a un lato del bersaglio, poi attacca da lì
    const ux=(T.x-u.x)/u.vd,uy=(T.y-u.y)/u.vd,F=hd+160;gx=T.x-uy*u.role*F;gy=T.y+ux*u.role*F;
    if(Math.hypot(gx-u.x,gy-u.y)<240)u.fk=1}
   else if(!u.vis&&Math.hypot(u.lkx-u.x,u.lky-u.y)<50)searchNext(u);
   if(u.sw>0&&!u.vis){u.sw-=dt;u.h+=Math.sin(G.t*2.5+u.id)*2*dt;u.vx=u.vy=0}   // ricerca: si ferma e si guarda attorno
   else{
    sp=(u.k==1?(u.fast?Ty.fast:Ty.spd):u.k==6?130:Ty.spd)*(u.spm||1);
    followPath(u,gx,gy,sp,dt);moving=true}}
 }else if(u.st==0){ // pattuglia
  if(u.k==6&&MD&&MD.wp&&MD.wp.length){const w=MD.wp[(u.wi||0)%MD.wp.length];
   if(Math.hypot(w[0]-u.x,w[1]-u.y)<160)u.wi=((u.wi||0)+1)%MD.wp.length;followPath(u,w[0],w[1],110,dt);moving=true}
  else{u.wt-=dt;if(u.wt<=0||Math.hypot(u.px-u.x,u.py-u.y)<30){u.wt=rnd(3,8);const a=Math.random()*TAU,d=rnd(100,350),px=clamp(u.hx+Math.cos(a)*d,100,WW-100),py=clamp(u.hy+Math.sin(a)*d,100,WH-100);if(!nav[ncell(px,py)]){u.px=px;u.py=py}}
   stepTo(u,u.px,u.py,u.k==1?50:u.k==4?40:35,dt);moving=true}}
 if(moving){
  u.x+=dgx*dt;u.y+=dgy*dt;u.vx+=dgx;u.vy+=dgy;   // la schivata si somma al passo già fatto
  separate(u,dt);push(u,Ty.pr);
  if(!(u.st==2&&u.vis)&&Math.hypot(u.vx,u.vy)>5)u.h=Math.atan2(u.vy,u.vx)}
 // bloccato: l'avanzamento reale (senza la schivata) è meno del 30% di quello voluto
 if(moving&&u.st==2&&sp>0&&Math.hypot(u.x-x0-dgx*dt,u.y-y0-dgy*dt)<sp*dt*.3){
  u.stk+=dt;
  if(u.stk>1.2&&!u.rp){u.rp=1;u.path=null;u.pt=0}                                    // dopo 1,2 s: riplanifica (una volta)
  if(u.stk>2)u.bo=blockerAhead(u,u.vx-dgx,u.vy-dgy,Ty.pr+70)||u.blk}                 // dopo 2 s: individua l'ostacolo da distruggere
 else{u.stk=Math.max(0,u.stk-dt*2);if(u.stk<=0){u.rp=0;u.bo=null}}}
const k6=u=>u.k==6;
function flyerAI(u,dt){const T=u.T;let vx,vy;
 if(u.st==2&&T){const dx=T.x-u.x,dy=T.y-u.y,d=Math.hypot(dx,dy)||1;u.dn-=dt;if(u.dn<=0){u.dn=rnd(1.5,4);u.od=-u.od}
  const rd=clamp((d-380)*1.2,-200,260),tg=170*u.od;vx=dx/d*rd-dy/d*tg;vy=dy/d*rd+dx/d*tg;
  if(dodgeStep(u,dt,230,T.x,T.y)){vx+=DG.x;vy+=DG.y}}      // lo scatto si somma all'orbita
 else{u.px+=dt*.35;const hx=u.hx+Math.cos(u.px)*220-u.x,hy=u.hy+Math.sin(u.px)*220-u.y,hd=Math.hypot(hx,hy)||1;vx=hx/hd*110;vy=hy/hd*110}
 const k=Math.min(1,3*dt);u.vx+=(vx-u.vx)*k;u.vy+=(vy-u.vy)*k;u.x=clamp(u.x+u.vx*dt,20,WW-20);u.y=clamp(u.y+u.vy*dt,20,WH-20);
 if(Math.hypot(u.vx,u.vy)>15&&!(u.st==2&&u.vis))u.h=Math.atan2(u.vy,u.vx)}
function kamiAI(u,dt){const T=u.T,B=UT[3].boom;let gx=u.x,gy=u.y,sp=0;
 if(u.st==2){gx=u.vis?T.x:u.lkx;gy=u.vis?T.y:u.lky;sp=UT[3].spd;if(!u.vis&&Math.hypot(gx-u.x,gy-u.y)<50){sp=0;u.st=0}}
 else{u.wt-=dt;if(u.wt<=0||Math.hypot(u.px-u.x,u.py-u.y)<30){u.wt=rnd(3,8);const a=Math.random()*TAU,d=rnd(100,350);u.px=clamp(u.x+Math.cos(a)*d,100,WW-100);u.py=clamp(u.y+Math.sin(a)*d,100,WH-100)}gx=u.px;gy=u.py;sp=80}
 if(sp>0){const dx=gx-u.x,dy=gy-u.y,d=Math.hypot(dx,dy)||1;u.vx=dx/d*sp;u.vy=dy/d*sp;
  if(u.st==2&&dodgeStep(u,dt,160,gx,gy)){u.vx+=DG.x;u.vy+=DG.y}   // avanza verso il bersaglio e schiva insieme
  u.x=clamp(u.x+u.vx*dt,20,WW-20);u.y=clamp(u.y+u.vy*dt,20,WH-20);u.h=Math.atan2(dy,dx)}
 if(u.vis&&u.vd<B.trig){explode(u.x,u.y,B.r,B.dmg,T.z?1:0,u.id,true,1);u.dead=1;u.kb=-1}}
// ===== ciclo principale dell'AI (solo singolo/host) =====
function aiUpdate(dt){
 const pl=plist();for(const q of pl){q.unseen=(q.unseen==null?5:q.unseen+dt);if(q.unseen>=5)q.hid=true}   // stealth: nascosto dopo 5 s senza essere visto
 TG=G.mode==1?pl.concat(units):pl.concat(allyList());
 for(const u of units){if(u.dead)continue;
 u.fl=Math.max(0,u.fl-dt);u.pt-=dt;u.shout-=dt;if(u.dis>0){u.dis-=dt;continue}
 if(u.ws)tickWS(u.ws,u.bw!=null?u.bw:UT[u.k].w,dt);if(u.ws2)tickWS(u.ws2,UT[u.k].w2,dt);
 if(u.rg&&u.hp<u.mhp)u.hp=Math.min(u.mhp,u.hp+u.rg*dt);                 // rigenerazione del bot
 if(u.shs){u.sg=Math.max(0,(u.sg||0)-dt);for(let i=0;i<u.shs.length;i++)if(u.shs[i]>0)u.shs[i]=Math.max(0,u.shs[i]-dt)}   // ricarica degli scudi
 if(u.slp){const q=pl.length?pl.reduce((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)<Math.hypot(b.x-u.x,b.y-u.y)?a:b):null;if(q&&Math.hypot(q.x-u.x,q.y-u.y)<650)u.slp=0;else continue}
 
 // Se l'unità vede il bersaglio in stato di caccia, accumula tempo di mira; altrimenti si azzera
 if(u.vis && u.T && u.st==2) u.aimT = (u.aimT || 0) + dt;
 else u.aimT = Math.max(0, (u.aimT || 0) - dt * .5);

 u.th-=dt;if(u.th<=0){u.th=.2+Math.random()*.1;u.thT=u.th>0?.25:.25;think(u)}
  if(u.st==1){u.rt-=dt;const T=u.T;if(T&&!UT[u.k].fly){const a=Math.atan2(T.y-u.y,T.x-u.x);u.h+=clamp(ad(a,u.h),-5*dt,5*dt)}if(u.rt<=0)u.st=2;if(u.k!=3)continue}
  if(u.k==0){if(u.st==2&&u.T)aiShoot(u,dt);continue}
  if(u.k==2)flyerAI(u,dt);else if(u.k==3){kamiAI(u,dt);continue}else groundAI(u,dt);
  if(u.st==2&&u.T)aiShoot(u,dt)}
 for(let n=0;n<2&&PQ.length;n++){const u=PQ.shift();u.pq=0;if(u.dead)continue;const p=navPath(u.x,u.y,u.gx,u.gy);
  u.path=p;u.pi=0;const l=p[p.length-1];u.np=Math.hypot(l[0]-u.gx,l[1]-u.gy)>200}}
