'use strict';
/* AIRGRUNT · AGweapons.js
   Un solo codice per le armi: giocatori e AI sparano con le stesse funzioni e gli stessi valori di WEAPONS.
   OGNI arma fa danno a TUTTI (nemici, giocatori, alleati da scortare, ostacoli) tranne al proprio tiratore per i colpi diretti;
   le esplosioni colpiscono anche chi le ha sparate.
   Entità: giocatori (pl=1, id<1000), unità AI (id>=1000), alleati di missione (al=1). z = 1 se volano (Air, jet, kamikaze). */
const plist=()=>{const a=[];if(P&&P.hp>0)a.push(P);for(const k in others)if(others[k].hp>0)a.push(others[k]);return a};
let allyList=()=>[];                                   // la missione sostituisce questa funzione (convoglio, VIP)
const eRad=e=>e.pl?(e.z?16:18):e.k!=null?UT[e.k].r:e.rr||20;
const dirtyObs=new Set();                              // ostacoli danneggiati da comunicare ai client
// ===== stato di un'arma: caricatore, ricarica, cadenza =====
const newWS=w=>({a:WEAPONS[w].mag,cd:0,rl:0});
function tickWS(ws,w,dt){ws.cd-=dt;if(ws.rl>0){ws.rl-=dt;if(ws.rl<=0){ws.rl=0;ws.a=WEAPONS[w].mag}}}
const readyWS=ws=>ws.cd<=0&&ws.rl<=0&&ws.a>0;
function spendWS(ws,w,cdMul,rlMul){const W=WEAPONS[w];ws.cd=W.cd/(cdMul||1);if(--ws.a<=0){ws.rl=W.reload*(rlMul||1);return true}return false}
// ===== danni =====
// scudo: ogni scudo carico assorbe un colpo e poi si ricarica in SHIELD_T s; il colpo dopo usa il successivo scudo carico
function absorbShield(e){if(e.sg>0)return true;     // stesso "colpo" (pallini, fiamma): già assorbito
 const i=e.shs.findIndex(t=>t<=0);if(i<0)return false;
 e.shs[i]=SHIELD_T;e.sg=SHIELD_GRACE;fxSpawn(e.x,e.y,'#8fe3ff',14,true,40);sfxAt(SFX_LIST.hit,.7,e.x,e.y,60);return true}
function damage(e,d,o){
 if(G.ext&&e.pl)return 0;                      // durante l'estrazione i giocatori sono invulnerabili
 if(e.shs&&e.shs.length&&absorbShield(e))return 0;           // scudo (giocatori e bot): il colpo non fa alcun danno
 const red=e.pl?(e.z?e.drA:e.drG)||0:e.ar||e.drG||0;d=Math.max(1,d-red);e.hp-=d;e.lh=o;
 if(e.hp<=0&&!e.pl&&!e.al&&!e.dead){e.dead=1;e.kb=o}
 else if(e.hp>0&&e.k!=null&&!e.pl&&!e.al&&o<1000)hurtReact(e,o);   // unità colpita da un giocatore
 return d}
function damageObs(o,d){if(o.ind||o.dead)return;o.hp-=d;dirtyObs.add(o.id);if(o.hp<=0){o.dead=1;wreckFx(o);navRefresh(o)}}
const hurtFx=(x,y)=>{fxSpawn(x,y,'#ff5a4a',8);sfxAt(SFX_LIST.hurt,.8,x,y,60)};
// ===== proiettili =====
const dmxB=(x,W)=>x&&W.mag?x/(W.mag*Math.max(1,W.pellets)):0;   // bonus "+danni per caricatore" spalmato su colpi e pallini
function mkBullet(w,x,y,a,life,o,fly,tz,sm){const W=WEAPONS[w],s=W.speed*(sm||1);return{x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,w,o,fly:fly?1:0,tz,sm:sm||1,dmg:W.dmg,ex:W.ex||0,pierce:W.pierce||0}}
function addBullet(b,emit){bullets.push(b);if(emit&&NET.on)NET.sq.push(b)}
// spara un colpo (tutti i pallini) da un tiratore: stessa funzione per giocatori e AI
function fireWeapon(e,w,aim,dEnd,tz,off,sm){const W=WEAPONS[w],out=[],life=Math.max(.02,(dEnd-off)/(W.speed*(sm||1))),fly=e.z?1:0,cx=Math.cos(aim),cy=Math.sin(aim),bx=dmxB(e.dmx,W);
 for(let i=0;i<W.pellets;i++){const s=aim+(Math.random()-.5)*W.spread;
  const b=mkBullet(w,e.x+cx*off,e.y+cy*off,s,life,e.id,fly,tz,sm);b.dmg+=bx;out.push(b)}
 return out}
function slashBlocks(x,y,o,tz){
 for(const sl of slashes){if(sl.id===o)continue;const q=sl.id===NET.id?P:others[sl.id];if(!q||(tz>=0&&tz!==(q.z?1:0)))continue;
  const dx=x-q.x,dy=y-q.y,d=Math.hypot(dx,dy);if(d>MELEE_R)continue;if(d>10&&Math.abs(ad(Math.atan2(dy,dx),sl.a))>MELEE_ARC)continue;return true}
 return false}
function bulletsStep(dt,A){
 const pl=plist(),al=allyList();
 for(const b of bullets){
  const ns=Math.max(1,Math.ceil(Math.hypot(b.vx,b.vy)*dt/14)),sd=dt/ns;           // colpi veloci: più passi per fotogramma
  for(let sp=0;sp<ns&&!b.dead;sp++){
   b.x+=b.vx*sd;b.y+=b.vy*sd;b.life-=sd;
   if(b.ex)smokeFx(b.x,b.y,b.vx,b.vy);
   if(b.life<=0||b.x<0||b.y<0||b.x>WW||b.y>WH){b.dead=1;if(b.life<=0&&b.x>=0&&b.y>=0&&b.x<=WW&&b.y<=WH){groundFx(b);if(A&&b.fly&&b.o<1000&&!b.ex)landHit(b)}break}
   if(slashBlocks(b.x,b.y,b.o,b.tz)){b.dead=1;impact(b.x,b.y,'#e6f6ff');break}
   if(!b.fly&&b.tz!==1)for(const o of qobs(b.x,b.y,8,_bq)){if(!bHit(o,b.x,b.y))continue;
    if(b.pierce){b.hz=b.hz||new Set();if(b.hz.has(o.id))continue;b.hz.add(o.id)}
    if(A&&!b.ex)damageObs(o,b.dmg);impact(b.x,b.y);if(!b.pierce){b.dead=1;break}}
   if(b.dead)break;
   for(const u of units)if(u.id!==b.o&&(b.tz<0||b.tz===u.z)&&Math.hypot(b.x-u.x,b.y-u.y)<UT[u.k].r&&hitE(b,u,A,'u'))break;
   if(b.dead)break;
   for(const q of pl)if(q.id!==b.o&&(b.tz<0||b.tz===(q.z?1:0))&&Math.hypot(b.x-q.x,b.y-q.y)<(q.z?16:18)&&hitE(b,q,A,'p'))break;
   if(b.dead)break;
   for(const q of al)if(q.hp>0&&(b.tz<0||b.tz===0)&&Math.hypot(b.x-q.x,b.y-q.y)<q.rr&&hitE(b,q,A,'a'))break;
   if(b.dead)break;
   if(A&&CIV.n&&(b.tz<0||b.tz===0)&&civHitB(b)){if(!b.pierce)b.dead=1}}}   // il cannone (pierce) li attraversa e ne uccide più d'uno
 for(const b of bullets)if(b.dead&&b.ex&&!b.bx){b.bx=1;explode(b.x,b.y,b.ex,b.dmg,b.tz,b.o,A,b.fly&&!(b.o<1000&&b.life<=0))}   // il razzo finito esplode dove si ferma
 bullets=bullets.filter(b=>!b.dead)}
const _bq=[];
// colpo sparato in Air che non ha colpito nessuno: a fine corsa cade a terra e danneggia l'ostacolo che si trova in quel punto
function landHit(b){for(const o of qobs(b.x,b.y,8,_bq))if(bHit(o,b.x,b.y)){damageObs(o,b.dmg);impact(b.x,b.y,'#ffe14d');break}}
function hitE(b,e,A,kind){ // colpo diretto su un'entità; restituisce true se il proiettile si ferma
 if(b.pierce){b.hz=b.hz||new Set();const k=kind+e.id;if(b.hz.has(k))return false;b.hz.add(k)}
 if(A&&!b.ex)damage(e,b.dmg,b.o);
 if(kind=='u')impact(b.x,b.y);else hurtFx(b.x,b.y);
 if(!b.pierce){b.dead=1;return true}return false}
function groundFx(b){const n=2+Math.round(b.dmg/8),hv=b.dmg>=20;fxImpact(b.x,b.y,n,hv);fxImpact(b.x,b.y,Math.ceil(n/2),hv,FXS*.7)}
// ===== esplosione ad area: danno al centro dmg, scende fino a EX_MIN*dmg al bordo; colpisce chiunque, anche chi l'ha sparata =====
function explode(x,y,r,dmg,tz,o,A,fly){
 fxBoom(x,y,'unit',r*.6);fxSpawn(x,y,'#ffd23f',12,true,40);sfxAt(SFX_LIST.boom,.8,x,y,50);
 if(!A)return;
 const val=d=>Math.round(dmg*(1-(1-EX_MIN)*clamp(d/r,0,1)));
 const hit=e=>{if(e.k===5&&e.id===o)return;   // il carro pesante è immune alla propria esplosione
  const d=Math.hypot(e.x-x,e.y-y)-eRad(e);if(d<r){damage(e,val(Math.max(0,d)),o);if(e.pl||e.al)hurtFx(e.x,e.y)}};
 for(const u of units)if(tz<0||tz===u.z)hit(u);
 for(const q of plist())if(tz<0||tz===(q.z?1:0))hit(q);
 for(const q of allyList())if(q.hp>0)hit(q);
 if(tz<=0)civArea(x,y,r,o);
 if(fly)return;
 for(const ob of qobs(x,y,r+150,_bq)){const l=toLocal(ob,x,y),d=ob.t=='t'?Math.hypot(x-ob.x,y-ob.y)-ob.r:bsd(ob,l[0],l[1]);if(d<r)damageObs(ob,val(Math.max(0,d)))}}
// ===== mischia: fendente nell'arco davanti; danneggia unità, giocatori e (a terra) ostacoli =====
function meleeHit(x,y,a,z,o,dry,H){   // H (facoltativo): insieme degli oggetti già colpiti da questo fendente
 const q0=o===NET.id?P:others[o],mm=MELEE_DMG*((q0&&q0.mlm)||1);   // Plasmablade: moltiplicatore del tiratore (le unità AI sono ×1)
 const once=k=>!H||(!H.has(k)&&(H.add(k),true));
 const inArc=(tx,ty,er)=>{const dx=tx-x,dy=ty-y,d=Math.hypot(dx,dy);return d<=MELEE_R+er&&(d<=er+6||Math.abs(ad(Math.atan2(dy,dx),a))<=MELEE_ARC)};
 for(const u of units)if(u.id!==o&&inArc(u.x,u.y,UT[u.k].r)&&once('u'+u.id)){if(!dry)damage(u,mm,o);impact(u.x,u.y,'#e6f6ff')}
 for(const q of plist())if(q.id!==o&&inArc(q.x,q.y,18)&&once('p'+q.id)){if(!dry)damage(q,mm,o);hurtFx(q.x,q.y)}
 for(const q of allyList())if(q.hp>0&&inArc(q.x,q.y,q.rr)&&once('a'+q.id)){if(!dry)damage(q,mm,o)}
 if(!dry)civCone(inArc,o);
 if(z)return;
 for(const ob of qobs(x,y,MELEE_R+100,_bq)){const n=nearestPt(ob,x,y),d=Math.hypot(n[0]-x,n[1]-y);if(d>MELEE_R)continue;if(d>8&&Math.abs(ad(Math.atan2(n[1]-y,n[0]-x),a))>MELEE_ARC)continue;
  if(!once('o'+ob.id))continue;if(!dry)damageObs(ob,mm);impact(n[0],n[1],'#e6f6ff')}}
// ===== lanciafiamme: ogni tick danneggia ciò che sta nel cono; a terra gli ostacoli fermano il fuoco =====
function flameBlocked(x,y,tx,ty,d){const ux=(tx-x)/d,uy=(ty-y)/d;for(const o of qobs((x+tx)/2,(y+ty)/2,d/2+130,_bq))if(rayO(o,x,y,ux,uy)<d-10)return true;return false}
function flameHit(x,y,a,z,w,o){const Rg=w.range,C=w.arc,coned=(tx,ty,er)=>{const dx=tx-x,dy=ty-y,d=Math.hypot(dx,dy);return d<=Rg+er&&(d<=er+4||Math.abs(ad(Math.atan2(dy,dx),a))<=C+Math.asin(Math.min(1,er/d)))};
 for(const u of units){if(u.id===o)continue;const er=UT[u.k].r;if(!coned(u.x,u.y,er))continue;if(!z&&!u.z&&flameBlocked(x,y,u.x,u.y,Math.hypot(u.x-x,u.y-y)||1))continue;damage(u,w.dmg,o);fxSpawn(u.x,u.y,'#ff9a3a',2)}
 for(const q of plist())if(q.id!==o&&coned(q.x,q.y,18)){damage(q,w.dmg,o);fxSpawn(q.x,q.y,'#ff9a3a',2)}
 for(const q of allyList())if(q.hp>0&&coned(q.x,q.y,q.rr))damage(q,w.dmg,o);
 civCone(coned,o);
 if(z)return;
 for(const ob of qobs(x,y,Rg+120,_bq)){const n=nearestPt(ob,x,y),d=Math.hypot(n[0]-x,n[1]-y);if(d>Rg)continue;if(d>8&&Math.abs(ad(Math.atan2(n[1]-y,n[0]-x),a))>C)continue;damageObs(ob,w.dmg);fxSpawn(n[0],n[1],'#ff7a1a',1)}}
