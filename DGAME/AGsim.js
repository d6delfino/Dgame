'use strict';
/* AIRGRUNT · AGsim.js — simulazione (nessun disegno).
   1) armi: un solo codice per giocatori e AI (proiettili, esplosioni, mischia, lanciafiamme, bruciature)
   2) AI dei nemici: percezione, allarme, reazione, caccia di gruppo, percorsi A*, tiro
   3) missioni: obiettivi, alleati, ondate, civili e regole di vittoria
   4) campagna: regista narrativo, salvataggio, briefing e debriefing */
const plist=()=>{const a=[];if(P&&P.hp>0)a.push(P);for(const k in others)if(others[k].hp>0)a.push(others[k]);return a};
let allyList=()=>[];                                   // la missione sostituisce questa funzione (convoglio, VIP)
const plR=q=>q.vid>=0?VEH_T[q.vk].r:q.z?PR_AIR:PR_GRUNT;   // raggio d'impatto di un giocatore: mech a terra, in Air o a bordo di un veicolo
const eRad=e=>e.pl?plR(e):e.k!=null?UT[e.k].r:e.rr||20;
const dirtyObs=new Set();                              // ostacoli danneggiati da comunicare ai client
const BURN_OBS=new Set();                              // ostacoli che stanno bruciando (evita di iterare tutti M.obs)
const BURN_DUR=4, BURN_DPS=20, BURN_TICK=.5, BURN_TICK_DMG=Math.round(BURN_DPS*BURN_TICK);   // DoT residuo: 40 dmg/s applicati a colpi da 20 ogni 0.5s, per 4 s
// resti in fiamme: chi muore mentre brucia (o ucciso dalla fiamma: civili) continua a bruciare per BURN_DUR s · solo grafica e suono, nessun danno, nessun dato in rete
const BURN_REM=[],BURN_REM_MAX=40;
function burnRem(x,y,s,rate){if(BURN_REM.length>=BURN_REM_MAX)BURN_REM.shift();BURN_REM.push({x,y,s,rate,burn:BURN_DUR})}
// ===== stato di un'arma: caricatore, ricarica, cadenza =====
const newWS=(w,n)=>{const m=WEAPONS[w].mag*Math.max(1,n|0);return{a:m,cd:0,rl:0,m}};   // n = copie dell'arma nelle caselle: caricatore × copie (AI e bot: 1)
function tickWS(ws,w,dt){ws.cd-=dt;if(ws.rl>0){ws.rl-=dt;if(ws.rl<=0){ws.rl=0;ws.a=ws.m||WEAPONS[w].mag}}}   // la ricarica riempie tutto il caricatore (con le copie)
const readyWS=ws=>ws.cd<=0&&ws.rl<=0&&ws.a>0;
function spendWS(ws,w,cdMul,rlMul){const W=WEAPONS[w];ws.cd=W.cd/(cdMul||1);if(--ws.a<=0){ws.rl=Math.max(.05,W.reload*(rlMul||1));return true}return false}   // la ricarica dura sempre almeno 0,05 s: con tempo 0 il caricatore non si riempirebbe mai
// ===== danni =====
// scudo: ogni scudo carico assorbe un colpo e poi si ricarica in SHIELD_T s; il colpo dopo usa il successivo scudo carico
function absorbShield(e){if(e.sg>0)return true;     // stesso "colpo" (pallini, fiamma): già assorbito
 const i=e.shs.findIndex(t=>t<=0);if(i<0)return false;
 e.shs[i]=SHIELD_T;e.sg=SHIELD_GRACE;fxSpawn(e.x,e.y,'#8fe3ff',14,true,40);sfxAt(SFX_LIST.hit,.7,e.x,e.y,60);return true}
let SHIP_FW=0;                                         // 1 mentre un colpo allo scafo viene girato all'unità della nave (shipObsHit)
function damage(e,d,o){
 if(e.sob&&!SHIP_FW)return 0;                  // nave da guerra: si danneggia solo colpendo lo scafo (ostacolo)
 if(G.ext&&e.pl)return 0;                      // durante l'estrazione i giocatori sono invulnerabili
 if(e.pl&&e.vid>=0)return vehGhost(e)?0:vehHit(e,d,o);   // a bordo di un veicolo: il colpo lo prende il mezzo, una volta sola (vedi vehRep in AGveh.js)
 if(e.shs&&e.shs.length&&absorbShield(e))return 0;           // scudo (giocatori e bot): il colpo non fa alcun danno
 const red=e.pl?(e.z?e.drA:e.drG)||0:e.ar||e.drG||0;d=Math.max(atkMin(o),d-red);e.hp-=d;e.lh=o;   // minimo 1, o 2 con Proiettili perforanti
// RIANIMAZIONE (upgrade): se l'entità morirebbe ed ha una carica, torna al 50% di vita
 if((e.pl||e.k!=null)&&e.hp<=0&&Array.isArray(e.revive)&&e.revive.length){
  const i=e.revive.findIndex(t=>t<=0);
  if(i>=0){
   e.revive[i]=REVIVE_CD;
   e.hp=Math.ceil((e.hpMax||e.mhp||100)*.5);
   fxSpawn(e.x,e.y,'#ffc400',20,true,50);sfxAt(SFX_LIST.toGrunt,.8,e.x,e.y,80);
   if(e===P)say('Rianimazione!');else if(e.k===6)announce('Il bersaglio d\u2019\u00e9lite si \u00e8 rianimato!');
  }
 }
 if(e.hp<=0&&!e.pl&&!e.al&&!e.dead){e.dead=1;e.kb=o}
 else if(e.hp>0&&e.k!=null&&!e.pl&&!e.al&&!e.sec&&o<1000)hurtReact(e,o);   // unità colpita da un giocatore
 return d}
function damageObs(o,d,by){if(o.ind||o.dead)return;
 if(o.aiS&&o.suU&&!o.suU.dead){shipObsHit(o,d,by);return}   // nave nemica: il danno va all'unità (corazza 12)
 o.hp-=d;dirtyObs.add(o.id);
 if(o.mil&&!o.suU&&by!=null&&o.hp>0&&authority())navWake(o,by);   // nave militare colpita: risponde al fuoco
 if(o.sb=='pol'&&authority())polWave(o);   // centrale di polizia colpita (da chiunque): ondata di poliziotti
 if(o.hp<=0){o.dead=1;wreckFx(o);navRefresh(o);
 if(o.sb=='pri'&&authority()&&by!=null&&by>=0&&by<1000)priBreak(o,by);   // prigione distrutta da un giocatore: prigionieri liberati
 // edificio neutro distrutto da un giocatore: -10 kill (esclusi caserme, missione, muri, speciali, edifici speciali facoltativi, alberi)
 if(by!=null&&by>=0&&by<1000&&o.t=='b'&&o.ty=='house'&&!o.bar&&!o.vipB&&!o.tg&&!o.rb&&!o.sp&&!o.sb){
  const q=by===NET.id?P:others[by];
  if(q){q.kills=(q.kills|0)-10;if(q===P)say('Edificio distrutto: -10 kill')}}}}
const hurtFx=(x,y)=>{fxSpawn(x,y,'#ff5a4a',8);sfxAt(SFX_LIST.hurt,.8,x,y,60)};
// ===== proiettili =====
const dmxB=(x,W)=>x&&W.mag?Math.max(1,x/(W.mag*Math.max(1,W.pellets))):0;   // bonus "+danni per caricatore" (Proiettili perforanti) spalmato su colpi e pallini: almeno +1 a colpo o a tick
// danno minimo a colpo di chi attacca: 1 + numero di copie di Proiettili perforanti (prc). Le unità si cercano solo in deathmatch (i bot sono gli unici con upgrade)
function atkMin(o){if(o==null||o<0)return 1;const a=o===NET.id?P:o<1000?others[o]:G.mode==1?units.find(u=>u.id===o):null;return 1+((a&&a.prc)|0)}
const secId=id=>{const u=units.find(z=>z.id===id);return !!(u&&u.sec)};   // missione 8: l'unità con questo id è una guardia alleata?
function mkBullet(w,x,y,a,life,o,fly,tz,sm){const W=WEAPONS[w],s=W.speed*(sm||1),su=o>=1000?units.find(z=>z.id===o):null,dmo=G.mode==1&&su&&su.owner!=null;   // dmo: torretta o wingman di un giocatore in deathmatch
 return{x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life,w,o,fly:fly?1:0,tz,sm:sm||1,dmg:W.dmg,ex:W.ex||0,pierce:W.pierce||0,sec:su&&su.sec&&!dmo?1:0,ow:dmo?su.owner:-1,nw:1}}   // ow: proprietario (deathmatch) · i suoi colpi non toccano lui né le sue unità   // sec: i colpi delle guardie non fanno danno a giocatori, VIP e altre guardie
// distanza dal centro del giocatore a cui nasce il colpo: la fine della canna disegnata;
// se un ostacolo sta fra il centro e la canna (mech appoggiato al muro), il colpo nasce sulla superficie dell'ostacolo
function muzzleOff(e,a){const off=gruntMuzzle(e);if(e.z&&!M.hi)return off;   // in Air i colpi volano sopra gli ostacoli
 const cx=Math.cos(a),cy=Math.sin(a),o=losBlocker(e.x,e.y,e.x+cx*off,e.y+cy*off);
 return o?Math.min(off,rayO(o,e.x,e.y,cx,cy)+.5):off}
function addBullet(b,emit){bullets.push(b);if(emit&&NET.on)NET.sq.push(b)}
// spara un colpo (tutti i pallini) da un tiratore: stessa funzione per giocatori e AI
function fireWeapon(e,w,aim,dEnd,tz,off,sm){const W=WEAPONS[w],out=[],life=Math.max(.02,(dEnd-off)/(W.speed*(sm||1))),fly=e.z?1:0,cx=Math.cos(aim),cy=Math.sin(aim),bx=dmxB(e.dmx,W),spr=W.spread*(e.id>=1000&&!e.sec?diffAiSpread(G.diff):1);   // nemici AI: spread più largo alle difficoltà basse
 for(let i=0;i<W.pellets;i++){const s=aim+(Math.random()-.5)*spr;
  const b=mkBullet(w,e.x+cx*off,e.y+cy*off,s,life,e.id,fly,tz,sm);b.dmg+=bx;
  if(e.prc&&e.prc>b.pierce)b.pierce=e.prc;   // "proiettili perforanti" del giocatore e dei bot del deathmatch
  out.push(b)}
 return out}
function slashBlocks(x,y,o,tz,ext){   // ext: raggio extra = lama di chi attacca (per parare un altro fendente)
 for(const sl of slashes){if(sl.id===o)continue;const q=sl.q||(sl.q=sl.id===NET.id?P:others[sl.id]||(sl.id>=1000?units.find(v=>v.id===sl.id):null));if(!q||(tz>=0&&tz!==(q.z?1:0)))continue;   // sl.q: proprietario in cache (giocatore o unità)
  const dx=x-q.x,dy=y-q.y,d=Math.hypot(dx,dy);if(d>MELEE_R*(sl.sc||1)+(ext||0))continue;if(d>10&&Math.abs(ad(Math.atan2(dy,dx),sl.a))>slArc(sl))continue;return sl}
 return null}
// arco del fendente: ridotto con la Plasmablade (sl.pb)
const slArc=sl=>sl&&sl.pb?MELEE_ARC*PLASMA_ARC:MELEE_ARC;
// Plasmablade: il fendente che para un colpo restituisce l'energia consumata (una volta per fendente)
// net = l'host avvisa il client proprietario (parate di fendenti, decise solo dall'host)
function plasmaRefund(sl,net){if(!sl||!sl.pb||sl.rf)return;
 if(sl.id===NET.id){sl.rf=1;P.dc=Math.max(0,P.dc-DASH_CD*MELEE_COST);fxSpawn(P.x,P.y,COLS[P.ci||0][0],6,false,20)}
 else if(net&&NET.host&&sl.id<1000&&NET.conns[sl.id]){sl.rf=1;send(NET.conns[sl.id],{t:'prf'})}}
// Missili guidati: bersaglio dall'id (unità ≥1000, altrimenti giocatore)
const homFind=id=>id==null||id<0?null:id>=1000?units.find(u=>u.id===id)||null:id===NET.id?P:others[id]||null;
// curva il missile verso il bersaglio (virata limitata); bersaglio morto o sparito: prosegue dritto. Vicino al bersaglio: spoletta di prossimità
function homSteer(b,dt){let t=b.tq;if(t===undefined)t=b.tq=homFind(b.tg);
 if(!t||t.dead||!(t.hp>0)){b.tg=-1;b.tq=null;return}
 if(b.f0===undefined)b.f0=b.fly;b.fly=t.z?1:b.f0;   // bersaglio in volo: il missile sale e passa sopra gli ostacoli (anche se sparato da terra); torna come partito se il bersaglio atterra
 const W=WEAPONS[b.w],dx=t.x-b.x,dy=t.y-b.y;
 if(Math.hypot(dx,dy)<eRad(t)+6){b.life=0;return}   // esplode al passo successivo (vedi life<=0)
 const sp=Math.hypot(b.vx,b.vy),h=Math.atan2(b.vy,b.vx),nh=h+clamp(ad(Math.atan2(dy,dx),h),-W.turn*dt,W.turn*dt);
 b.vx=Math.cos(nh)*sp;b.vy=Math.sin(nh)*sp}
// ===== missili guidati abbattibili: un colpo nemico che li tocca li distrugge in volo (senza esplosione né danni) =====
// Nessun dato in rete: ogni client simula già tutti i proiettili e decide da sé, come per i colpi fermati da ostacoli e unità; i danni restano dell'host.
// Costo: solo se in volo c'è almeno un missile guidato (lista HM, di solito vuota), un controllo di distanza per colpo e per missile.
const MSL_R=8,MSL_R2=MSL_R*MSL_R,HM=[];
const mslSide=b=>G.mode==1?(b.ow>=0?b.ow:b.o):(b.o<1000||b.sec?0:1);   // cooperativa: giocatori e alleati contro AI · deathmatch: ognuno per sé (torrette e wingman col loro proprietario)
const mslFoe=(a,b)=>a.o!==b.o&&mslSide(a)!==mslSide(b);
function mslPop(m){m.dead=1;m.ex=0;m.bx=1;fxBoom(m.x,m.y,'unit',16);fxSpawn(m.x,m.y,'#ffd23f',6,false,20);sfxAt(SFX_LIST.hit,.9,m.x,m.y,40)}   // ex=0: non esplode più, nessun danno ad area
// distanza minima fra il missile e il TRATTO percorso dal colpo in questo passo (moto relativo: si muove anche il missile): niente colpi "saltati" anche con un raggio piccolo
function mslShot(b,sd){for(const m of HM){if(m===b||m.dead||!mslFoe(b,m))continue;
  const px=b.x-m.x,py=b.y-m.y,dx=(b.vx-m.vx)*sd,dy=(b.vy-m.vy)*sd,ax=px-dx,ay=py-dy,dd=dx*dx+dy*dy,t=dd>0?clamp(-(ax*dx+ay*dy)/dd,0,1):1,qx=ax+dx*t,qy=ay+dy*t;
  if(qx*qx+qy*qy<MSL_R2)return m}return null}
function bulletsStep(dt,A){
 const pl=plist(),al=allyList(),bd=dt*(SLOW.t>0?SLOW_W:1);                         // slow motion: tutti i proiettili in volo al 25%, anche quelli di chi l'ha attivato
 HM.length=0;for(const b of bullets)if(WEAPONS[b.w].hom&&!b.dead)HM.push(b);   // missili guidati in volo in questo fotogramma
 for(const b of bullets){
  if(b.tg>=0)homSteer(b,bd);   // missili guidati: una correzione di rotta per fotogramma
  const ns=Math.max(1,Math.ceil(Math.hypot(b.vx,b.vy)*bd/14)),sd=bd/ns;           // colpi veloci: più passi per fotogramma
  for(let sp=0;sp<ns&&!b.dead;sp++){
   if(b.nw)b.nw=0;else{b.x+=b.vx*sd;b.y+=b.vy*sd;b.life-=sd}   // appena nato: il primo controllo collisioni avviene nel punto di partenza, prima di muoversi
   if(b.ex)smokeFx(b.x,b.y,b.vx,b.vy);

   // ===== ESPLOSIVO a innesco (fuse>0): vola fino al punto target, si ferma, poi esplode =====
   // Condizioni di esplosione:
   //   • fuse <= 0                      (scaduti i 10 s di sicurezza)
   //   • detect >= 0.5                  (un nemico è rimasto nel raggio per 0.5 s continui)
   //   • uscita dalla mappa             (fuori WW/WH)
   // Non fa danno al contatto: tutto il danno arriva dall'esplosione finale.
   if(b.fuse){
    if(b.life<=0){b.life=0;b.vx=0;b.vy=0}   // arrivato: si ferma in attesa
    b.fuse-=sd;
    // "nemico nel raggio": esclude il tiratore. Raggio = ex + raggio dell'unità.
    let near=false;
    for(const u of units){if(u.dead||u.id===b.o)continue;const r=UT[u.k].r+b.ex;if((u.x-b.x)**2+(u.y-b.y)**2<r*r){near=true;break}}
    if(!near)for(const q of pl){if(q.id===b.o)continue;const r=plR(q)+b.ex;if((q.x-b.x)**2+(q.y-b.y)**2<r*r){near=true;break}}
    if(near)b.detect=(b.detect||0)+sd;else b.detect=0;
    if(b.detect>=0.5||b.fuse<=0||b.x<0||b.y<0||b.x>WW||b.y>WH){b.dead=1;break}
    continue;                                // salta collisioni e resto del ciclo
   }

   if(b.life<=0||b.x<0||b.y<0||b.x>WW||b.y>WH){b.dead=1;if(b.life<=0&&b.x>=0&&b.y>=0&&b.x<=WW&&b.y<=WH){groundFx(b);if(A&&b.fly&&b.o<1000&&!b.ex)landHit(b)}break}
   {const bs=slashBlocks(b.x,b.y,b.o,b.tz);if(bs){plasmaRefund(bs,false);b.dead=1;impact(b.x,b.y,'#e6f6ff');break}}   // i proiettili sono simulati da tutti: rimborso solo locale
   if(HM.length){const m=mslShot(b,sd);if(m){mslPop(m);if(WEAPONS[b.w].hom)mslPop(b);else if(!b.pierce){b.dead=1;break}}if(b.dead)break}   // colpo su un missile guidato nemico: il missile salta in aria (il cannone perforante prosegue, il razzo esplode dove si trova)
   const lo=!b.fly&&b.tz!==1;   // colpo basso: lo ferma ogni ostacolo; colpo in volo: solo quelli alti degli interni
   if(lo||M.hi)for(const o of qobs(b.x,b.y,8,_bq)){if(!lo&&!o.hi)continue;if(o.su===b.o||!bHit(o,b.x,b.y))continue;   // i colpi di una nave non urtano il suo scafo
    if(b.pierce){b.hz=b.hz||new Set();if(b.hz.has(o.id))continue;b.hz.add(o.id)}
    if(A&&!b.ex)damageObs(o,b.dmg,b.o);impact(b.x,b.y);if(!b.pierce){b.dead=1;break}}
   if(b.dead)break;
   for(const u of units)if(u.id!==b.o&&!(b.sec&&u.sec)&&!(b.ow>=0&&u.owner===b.ow)&&(b.tz<0||b.tz===u.z)&&Math.hypot(b.x-u.x,b.y-u.y)<UT[u.k].r&&!u.sob&&hitE(b,u,A,'u'))break;
   if(b.dead)break;
   if(!b.sec)for(const q of pl)if(q.id!==b.o&&q.id!==b.ow&&(b.tz<0||b.tz===(q.z?1:0))&&Math.hypot(b.x-q.x,b.y-q.y)<plR(q)&&!(q.vid>=0&&(vehGhost(q)||vehSame(b.o,q)))&&hitE(b,q,A,'p'))break;   // a bordo: un solo bersaglio per mezzo, e chi è a bordo non colpisce il proprio mezzo
   if(b.dead)break;
   if(!b.sec)for(const q of al)if(q.hp>0&&(b.tz<0||b.tz===0)&&Math.hypot(b.x-q.x,b.y-q.y)<q.rr&&hitE(b,q,A,'a'))break;
   if(b.dead)break;
   if(A&&CIV.n&&(b.tz<0||b.tz===0)&&!WEAPONS[b.w].hom&&civHitB(b)){if(!b.pierce)b.dead=1}   // i missili guidati passano sopra i civili   // il cannone (pierce) li attraversa e ne uccide più d'uno
   if(b.dead)break;
   if(A&&SKY.n&&(b.tz<0||b.tz===1)&&!WEAPONS[b.w].hom&&skyHitB(b)){if(!b.pierce)b.dead=1}}}   // macchine civili volanti: strato aereo (AGsky.js)
 for(const b of bullets)if(b.dead&&b.ex&&!b.bx){b.bx=1;explode(b.x,b.y,b.ex,b.dmg,b.tz,b.o,A,b.fly&&!(b.o<1000&&b.life<=0),b.w)}   // il razzo finito esplode dove si ferma
 bullets=bullets.filter(b=>!b.dead)}
const _bq=[];
// colpo sparato in Air che non ha colpito nessuno: a fine corsa cade a terra e danneggia l'ostacolo che si trova in quel punto
function landHit(b){for(const o of qobs(b.x,b.y,8,_bq))if(bHit(o,b.x,b.y)){damageObs(o,b.dmg,b.o);impact(b.x,b.y,'#ffe14d');break}}
function hitE(b,e,A,kind){ // colpo diretto su un'entità; restituisce true se il proiettile si ferma
 if(b.pierce){b.hz=b.hz||new Set();const k=kind+e.id;if(b.hz.has(k))return false;b.hz.add(k)}
 if(A&&!b.ex)damage(e,b.dmg,b.o);
 if(kind=='u')impact(b.x,b.y);else hurtFx(b.x,b.y);
 if(!b.pierce){b.dead=1;return true}return false}
function groundFx(b){const n=2+Math.round(b.dmg/8),hv=b.dmg>=20;fxImpact(b.x,b.y,n,hv);fxImpact(b.x,b.y,Math.ceil(n/2),hv,FXS*.7)}
// ===== esplosione ad area: danno al centro dmg, scende fino a EX_MIN*dmg al bordo; colpisce chiunque, anche chi l'ha sparata =====
function explode(x,y,r,dmg,tz,o,A,fly,weapon){
 fxBoom(x,y,'unit',r*.6);fxSpawn(x,y,'#ffd23f',12,true,40);
 if(HM.length&&o!=null){const fo={o,ow:-1,sec:o>=1000&&secId(o)?1:0};for(const m of HM)if(!m.dead&&mslFoe(fo,m)&&(m.x-x)**2+(m.y-y)**2<r*r)mslPop(m)}   // esplosioni nemiche: abbattono i missili guidati nel raggio (non quelli della stessa salva)
 sfxAt((weapon!=null&&WEAPONS[weapon]&&WEAPONS[weapon].exSfx)||SFX_LIST.boom,.8,x,y,50);   // suono dell'esplosione: proprio dell'arma (Lanciarazzi, Esplosivo), altrimenti sfx-explosion.mp3
 // armi con area di esplosione (lanciarazzi): cratere bruciato permanente a terra
 // - !fly  → esclude i razzi sparati in Air (esplosione a mezz'aria)
 // - weapon!=null && WEAPONS[weapon].ex>0 → esclude il kamikaze e altre esplosioni non-arma
 // - in acqua: niente cratere scuro, ma schiuma bianca che sfuma in 2 s (vedi FOAM in AGmission.js)
 if(!fly&&weapon!=null&&WEAPONS[weapon].ex>0){if(inWater(x,y,0))foamAdd(x,y,r);else craterAdd(x,y,r);}
 if(!A)return;
 const WX=weapon!=null?WEAPONS[weapon]:null,em=WX&&WX.exMin!=null?WX.exMin:EX_MIN,ei=WX&&WX.exIn,   // em: frazione del danno nella fascia esterna (o al bordo) · ei: raggio del danno pieno (armi a fasce)
  lo=Math.round(dmg*em),
  val=ei?d=>d<=ei?dmg:lo:d=>Math.round(dmg*(1-(1-em)*clamp(d/r,0,1)));   // a fasce: due valori fissi · altrimenti: calo lineare fino al bordo
 const sb=(G.mt==8||G.mt==9)&&o>=1000&&secId(o);   // esplosione di una guardia alleata: non colpisce giocatori, VIP né altre guardie
 const hit=e=>{if(e.k===5&&e.id===o)return;if(sb&&(e.pl||e.al||e.sec))return;   // il carro pesante è immune alla propria esplosione
  if(e.pl&&e.vid>=0&&(e.id===o||vehSame(o,e)||vehGhost(e)))return;              // anche i veicoli dei giocatori (granate del carro, missili del jet e del Colosso, colpi dei passeggeri) · un danno sola per mezzo
  const d=Math.hypot(e.x-x,e.y-y)-eRad(e);if(d<r){damage(e,val(Math.max(0,d)),o);if(e.pl||e.al)hurtFx(e.x,e.y)}};
 for(const u of units)if(tz<0||tz===u.z)hit(u);
 for(const q of plist())if(tz<0||tz===(q.z?1:0))hit(q);
 for(const q of allyList())if(q.hp>0)hit(q);
 if(tz<=0)civArea(x,y,r,o);
 if(tz!==0)skyArea(x,y,r,o);   // macchine civili volanti (strato aereo)
 if(fly)return;
 for(const ob of qobs(x,y,r+150,_bq)){if(ob.su===o)continue;const l=toLocal(ob,x,y),d=ob.t=='t'?Math.hypot(x-ob.x,y-ob.y)-ob.r:bsd(ob,l[0],l[1]);if(d<r)damageObs(ob,val(Math.max(0,d)),o)}}
// ===== mischia: fendente nell'arco davanti; danneggia unità, giocatori e (a terra) ostacoli =====
function meleeHit(x,y,a,z,o,dry,H,sc,arc){   // H: oggetti già colpiti; sc: scala del fendente (1=Air, MECH_SCALE=Grunt); arc: semi-arco (Plasmablade più stretto)
 if(sc==null)sc=1;if(arc==null)arc=MELEE_ARC;
 {const bs=slashBlocks(x,y,o,-1,MELEE_R*sc);if(bs){if(!dry)plasmaRefund(bs,true);impact(x,y,'#e6f6ff');return}}   // parato: chi attacca è davanti a un altro fendente in corso
 const q0=o===NET.id?P:others[o],mm=MELEE_DMG*((q0&&q0.mlm)||1);   // danno INVARIATO (non scala col mech)
 const R0=MELEE_R*sc;                                                // raggio scala col mech Grunt ridotto
 const once=k=>!H||(!H.has(k)&&(H.add(k),true));
 const inArc=(tx,ty,er)=>{const dx=tx-x,dy=ty-y,d=Math.hypot(dx,dy);return d<=R0+er&&(d<=er+6||Math.abs(ad(Math.atan2(dy,dx),a))<=arc)};
 for(const u of units)if(u.id!==o&&inArc(u.x,u.y,UT[u.k].r)&&once('u'+u.id)){if(!dry)damage(u,mm,o);impact(u.x,u.y,'#e6f6ff')}
 for(const q of plist())if(q.id!==o&&!vehGhost(q)&&inArc(q.x,q.y,plR(q))&&once('p'+q.id)){if(!dry)damage(q,mm,o);hurtFx(q.x,q.y)}
 for(const q of allyList())if(q.hp>0&&inArc(q.x,q.y,q.rr)&&once('a'+q.id)){if(!dry)damage(q,mm,o)}
 if(!dry)civCone(inArc,o);
 if(z)return;
 for(const ob of qobs(x,y,R0+100,_bq)){const n=nearestPt(ob,x,y),d=Math.hypot(n[0]-x,n[1]-y);if(d>R0)continue;if(d>8&&Math.abs(ad(Math.atan2(n[1]-y,n[0]-x),a))>arc)continue;
  if(!once('o'+ob.id))continue;if(!dry)damageObs(ob,mm,o);impact(n[0],n[1],'#e6f6ff')}}
// ===== lanciafiamme: ogni tick danneggia ciò che sta nel cono; a terra gli ostacoli fermano il fuoco =====
function flameBlocked(x,y,tx,ty,d){const ux=(tx-x)/d,uy=(ty-y)/d;for(const o of qobs((x+tx)/2,(y+ty)/2,d/2+130,_bq))if(rayO(o,x,y,ux,uy)<d-10)return true;return false}
function flameHit(x,y,a,z,w,o,dry){const Rg=w.range,C=w.arc,coned=(tx,ty,er)=>{const dx=tx-x,dy=ty-y,d=Math.hypot(dx,dy);return d<=Rg+er&&(d<=er+4||Math.abs(ad(Math.atan2(dy,dx),a))<=C+Math.asin(Math.min(1,er/d)))};
 for(const u of units){if(u.id===o)continue;const er=UT[u.k].r;if(!coned(u.x,u.y,er))continue;if(!z&&!u.z?flameBlocked(x,y,u.x,u.y,Math.hypot(u.x-x,u.y-y)||1):M.hi&&xHiBlock(x,y,u.x,u.y))continue;if(!dry)damage(u,w.dmg,o);if(!u.burn||u.burn<=0)igniteFx(u.x,u.y,er);u.burn=BURN_DUR;u.burnBy=o;fxSpawn(u.x,u.y,'#ff9a3a',2)}
 for(const q of plist())if(q.id!==o&&!(q.vid>=0&&(vehGhost(q)||vehSame(o,q)))&&coned(q.x,q.y,plR(q))){if(!dry)damage(q,w.dmg,o);if(!q.burn||q.burn<=0)igniteFx(q.x,q.y,plR(q));q.burn=BURN_DUR;q.burnBy=o;fxSpawn(q.x,q.y,'#ff9a3a',2)}
 for(const q of allyList())if(q.hp>0&&coned(q.x,q.y,q.rr)){if(!dry)damage(q,w.dmg,o);if(!q.burn||q.burn<=0)igniteFx(q.x,q.y,q.rr);q.burn=BURN_DUR;q.burnBy=o}
 civCone(coned,o,1);   // 1 = fiamma: i civili uccisi restano in fiamme
 if(z)return;
 for(const ob of qobs(x,y,Rg+120,_bq)){const n=nearestPt(ob,x,y),d=Math.hypot(n[0]-x,n[1]-y);if(d>Rg)continue;if(d>8&&Math.abs(ad(Math.atan2(n[1]-y,n[0]-x),a))>C)continue;if(!dry)damageObs(ob,w.dmg,o);if(!ob.dead){if(!ob.burn)igniteFx(n[0],n[1],Math.min(ob.r,40));ob.burn=BURN_DUR;ob.burnBy=o;BURN_OBS.add(ob)};fxSpawn(n[0],n[1],'#ff7a1a',1)}}

// ===== bruciatura: chi è stato colpito dal lanciafiamme emette fiamme residue per 2 s =====
// - le entità sono già state marcate in flameHit(); qui si decrementa e si spawnano particelle piccole e rade
// - fxP.length < fxCap(false) evita di saturare il cap quando molte entità bruciano insieme
// ===== bruciatura: chi è colpito dal lanciafiamme emette fiamme residue per 2 s e subisce danno residuo =====
// - il danno (BURN_DPS) è applicato SOLO dall'host (authority()), accumulato ogni BURN_TICK secondi
//   per non tritare damage() con sub-1 (Math.max(1, d-red) renderebbe 1 danno per frame = 60 dmg/s!)
// - l'effetto visivo gira su ogni client, indipendente dall'autorità

// burst iniziale: emette subito alcune particelle di fiamma quando un bersaglio prende fuoco
// (elimina il "ritardo" dell'emissione probabilistica del burnTick)
function igniteFx(x,y,size){if(fxP.length>=fxCap(true))return;
 const n=4+((Math.random()*3)|0);
 for(let i=0;i<n;i++){
  const an=Math.random()*TAU,sp=1.8+Math.random()*2.4;
  fxP.push({x:x+(Math.random()-.5)*size*.4,y:y+(Math.random()-.5)*size*.4,
   vx:Math.cos(an)*sp,vy:Math.sin(an)*sp-1.5,
   life:1,decay:.05+Math.random()*.03,
   color:FL_COLS[1+(Math.random()*3|0)],size:95*(Math.random()*.25+.15),
   rise:.3+Math.random()*.6,grow:.2+Math.random()*.3})}}

function burnTick(dt){
 const A=authority();
 // applica danno accumulato; ritorna true se l'entità è ancora bruciante
 const hurt=(e,ob)=>{if(e.burn<=0)return false;e.burnAcc=(e.burnAcc||0)+dt;
  if(e.burnAcc>=BURN_TICK){e.burnAcc-=BURN_TICK;if(e.burnBy!=null&&e.burnBy>=0&&e.burnBy<1000){if(ob)damageObs(e,BURN_TICK_DMG,e.burnBy);else damage(e,BURN_TICK_DMG,e.burnBy)}}
  return true};
 // visual: particelle ravvicinate, dimensione grande (9–24 px); velocità 4× e bias verso l'alto per farle "sfiammare"
 const emit=(e,size,rate)=>{if(fxP.length>=fxCap(false)||Math.random()>=dt*rate)return;
  const an=Math.random()*TAU,d=Math.random()*size*.18,sp=2+Math.random()*2.5;
  fxP.push({x:e.x+Math.cos(an)*d,y:e.y+Math.sin(an)*d,vx:Math.cos(an)*sp,vy:Math.sin(an)*sp-1.2,
   life:1,decay:.04+Math.random()*.02,color:FL_COLS[1+(Math.random()*3|0)],size:95*(Math.random()*.25+.15),
   rise:.3+Math.random()*.6,grow:.2+Math.random()*.3})};
 // unità AI
 for(const u of units){if(!u.burn)continue;u.burn-=dt;if(u.burn<=0){u.burn=0;u.burnAcc=0;continue}if(A)hurt(u,false);emit(u,UT[u.k].r*.8,10)}
 // giocatori (host + client remoti)
 for(const q of plist()){if(!q.burn)continue;q.burn-=dt;if(q.burn<=0){q.burn=0;q.burnAcc=0;continue}if(A)hurt(q,false);emit(q,plR(q)*.8,10)}
 // alleati (VIP, convoglio)
 for(const v of allyList()){if(!v.burn)continue;v.burn-=dt;if(v.burn<=0){v.burn=0;v.burnAcc=0;continue}if(A)hurt(v,false);emit(v,v.rr*.8,8)}
 // ostacoli (case, alberi, ecc.): danno via damageObs → dirtyObs → sync automatico ai client
 if(BURN_OBS.size)for(const o of BURN_OBS){
  if(o.dead||!o.burn||o.burn<=0){o.burn=0;o.burnAcc=0;BURN_OBS.delete(o);continue}
  o.burn-=dt;if(o.burn<=0){o.burn=0;o.burnAcc=0;BURN_OBS.delete(o);continue}
  if(A)hurt(o,true);emit(o,Math.min(o.r,60),5)}   // ostacoli: rate più basso (5/s) perché possono essere tanti
 // resti in fiamme (unità, civili, edifici e alberi distrutti): solo fiamme, su ogni client
 for(let i=BURN_REM.length-1;i>=0;i--){const r=BURN_REM[i];r.burn-=dt;if(r.burn<=0){BURN_REM.splice(i,1);continue}emit(r,r.s,r.rate)}
}

let UID=1000,GID=0,TG=[],TGE=[],TGP=[],PQ=[];   // TGE: bersagli delle guardie alleate (missione 8) · TGP: bersagli dei poliziotti (tutti)
const rnd=(a,b)=>a+Math.random()*(b-a);
// Rotazione AI: UN solo valore per tutti (rad/s). Lo scafo del carro in movimento ruota a 2/3.
const AI_ROT=4, AI_ROT_HULL=AI_ROT*2/3;
const aiTurn=(h,a,rs,dt)=>h+clamp(ad(a,h),-rs*dt,rs*dt);   // ruota h verso a, al massimo rs*dt
function mkUnit(k,x,y,g,opt){const T=UT[k],hp=T.hp,ar=T.arF!=null?T.arF:T.arm>=1?ARM_MIN+Math.floor(Math.random()*(ARM_MAX-ARM_MIN+1)):T.arm>0&&Math.random()<diffArmP(G.diff)?ARM_MIN+Math.floor(Math.random()*(ARM_MAX-ARM_MIN+1)):0;
 const u={id:UID++,k,x,y,h:rnd(0,TAU),hp,mhp:hp,ar,g,z:T.fly?1:0,st:0,rt:0,th:rnd(0,.3),thT:.25,lkx:x,lky:y,lkt:0,path:null,pi:0,gx:x,gy:y,pt:0,pq:0,role:0,fk:0,side:Math.random()<.5?1:-1,
 bl:0,bp:rnd(0,1),fl:0,dis:0,slp:0,vx:0,vy:0,hx:x,hy:y,wt:rnd(0,3),px:x,py:y,od:Math.random()<.5?-1:1,dn:rnd(.5,2),dk:rnd(0,1),dg:0,dd:1,stk:0,rp:0,bo:null,sq:0,shout:0,bt:3,vis:false,vd:1e9,T:null,fast:k==1&&Math.random()<.5,aimT:0,lvx:0,lvy:0,sw:0,sa:0};
 if(opt&&opt.du){   // Arena Duel: arma e variante fisse (nessuna estrazione casuale)
  const D=opt.du;
  if(k==5){u.tv=D.tv|0;if(u.tv==0)u.bw=W_CAN;u.thr=u.h}
  else if(D.w>=0&&D.w!==T.w){u.bw=D.w;u.hold=Math.min(T.hold||400,Math.max(150,WEAPONS[D.w].range*.6))}
 }else{
  // Tank: variante deterministica (0 = cannone del player, 1 = lanciarazzi)
  // L'id è progressivo e identico sull'host e sui client, quindi u.tv coincide ovunque.
  if(k==5){u.tv=hs(u.id,7,M.seed)<.5?0:1;if(u.tv==0)u.bw=W_CAN;u.thr=u.h}   // thr = rotazione torretta (indipendente dallo scafo h)
  let wi0=u.bw!=null?u.bw:T.w;
  // Arma casuale per i nemici AI a terra (mech, torretta, cecchino, bersaglio):
  // 4% lanciafiamme, 4% shotgun (8% totali), 1% cannone (per k=6: 80% cannone, 20% mitraglia). Il tank (k=5) ha già la sua variante,
  // gli infiltrati/guardie (k>=UK_HUM) restano con la mitraglia e i jet (fly:1) con la loro arma.
  if(u.bw==null&&wi0>=0&&!T.fly&&k<UK_HUM&&k!==5&&k!==UK_APC&&k!==UK_SHIP){const r=Math.random();
   if(k===6){if(r<.8)wi0=W_CAN}
   else{if(r<.04)wi0=W_FLM;else if(r<.08)wi0=W_SHG;else if(r<.09)wi0=W_CAN}
   if(wi0!==T.w){u.bw=wi0;   // memorizza l'override: aiShoot e draw usano u.bw
    // il nemico regola la distanza di ingaggio sulla nuova arma (LF 300 → 180, SG 486 → 292, CAN 1620 → invariato)
    u.hold=Math.min(T.hold||400,Math.max(150,WEAPONS[wi0].range*.6))}}
  if(u.bw==null&&(k===2||k===UK_APC)&&Math.random()<.5)u.bw=W_HOM;   // jet e APC: 50% missili guidati
 }
 const wi=u.bw!=null?u.bw:T.w;
 if(wi>=0)u.ws=newWS(wi);if(T.w2!=null)u.ws2=newWS(T.w2);
 if(T.w3!=null){u.ws3=newWS(T.w3);u.bt3=1.5}   // terza arma (Dirigibile: lanciarazzi)
 if(has3(k)){u.thr=u.h;u.thr2=u.h;u.thr3=u.h;}   // 3 torrette indipendenti (dirigibile e nave da guerra)
 else if(k===UK_APC)u.thr=u.h;                   // APC: torretta separata dallo scafo
 units.push(u);return u}
// ===== popolazione iniziale: ~50 nemici, il numero NON dipende dalla difficoltà =====
function populate(){units.length=0;PQ.length=0;UID=1000;GID=0;
 const dS=(x,y)=>Math.hypot(x-START[0],y-START[1]),okE=(x,y,r)=>clearAt(x,y,r)&&dS(x,y)>SAFE_R,rxy=()=>landXY(Math.random,300,150,150);
 let n0=0;   // prima le torrette agli angoli dei complessi, ai varchi e nei porti (punti decisi dalla mappa)
 for(const sp of shuf2(M.tspots||[])){if(n0>=Math.round(N_TUR*.6))break;if(okE(sp[0],sp[1],30)&&!units.some(t=>Math.hypot(sp[0]-t.x,sp[1]-t.y)<220)){mkUnit(0,sp[0],sp[1],-1);n0++}}
 for(let n=n0,tr=0;n<N_TUR&&tr<5000;tr++){const[x,y]=rxy();if(okE(x,y,30)&&!units.some(t=>Math.hypot(x-t.x,y-t.y)<350)){mkUnit(0,x,y,-1);n++}}
 for(let n=0,tr=0;n<N_SQUAD&&tr<5000;tr++){const[x,y]=rxy();if(!okE(x,y,40))continue;const r0=Math.random(),sz=r0<.3?1:r0<.6?2:r0<.85?3:4,g=GID;let c=0;
  for(let k=0;k<sz;k++){const a=Math.random()*TAU,d=k?rnd(45,80):0,ex=x+Math.cos(a)*d,ey=y+Math.sin(a)*d;if(clearAt(ex,ey,20)){mkUnit(1,ex,ey,g);c++}}
  if(c){GID++;n++}}
 for(let n=0,tr=0;n<(M.hi?0:N_FLY)&&tr<5000;tr++){const[x,y]=landXY(Math.random,400,300,300);if(dS(x,y)>2800&&!units.some(t=>t.k==2&&Math.hypot(x-t.x,y-t.y)<1500)){mkUnit(2,x,y,GID++);n++}}
 const spawn=(k,cnt)=>{for(let c=0,tr=0;c<cnt&&tr<5000;tr++){const[x,y]=rxy();
  if((k==3?dS(x,y)>SAFE_R:okE(x,y,k==5?40:30))&&!units.some(t=>t.k==k&&Math.hypot(x-t.x,y-t.y)<(k==4?600:300))){mkUnit(k,x,y,-1);c++}}};
 spawn(M.hi?UK_SWD:3,N_RUSH);spawn(4,N_SNIP);spawn(5,Math.floor(Math.random()*(diffTanks(G.diff)+1)));spawn(UK_SWD,N_SWD);spawn(UK_APC,N_APC);
 for(const o of SHIPS)if(o.aiS&&!o.dead&&!o.fleet){const u=mkUnit(UK_SHIP,o.x,o.y,-1);u.h=u.thr=u.thr2=u.thr3=o.a;shipLink(u)}   // nave nemica (scelta in shipInit)
 if(!M.hi&&Math.random()<blimpProb(G.diff))for(let c=0,tr=0;c<diffBlimps(G.diff)&&tr<5000;tr++){const[x,y]=landXY(Math.random,400,300,300);if(dS(x,y)>2800&&!units.some(t=>t.k==UK_BLIMP&&Math.hypot(x-t.x,y-t.y)<1500)){mkUnit(UK_BLIMP,x,y,-1);c++}}   // dirigibile: probabilità legata alla difficoltà (25%→100%), uno solo, lontano dalla partenza
 G.cap=units.length;
 humanSpawn(UK_HUM,N_INF,0);humanSpawn(UK_GRD,N_GRD,1)}    // dopo G.cap: non contano per le caserme
// ===== navi: nemica (al posto di una nave della mappa, probabilità del dirigibile) e militari che rispondono al fuoco =====
// shipInit gira su host E client (scelta dal seed): così tutti sanno quale scafo va disegnato col colore dell'AI
const SHIPS=[];
function shipInit(){SHIPS.length=0;
 for(const o of M.obs)if((o.shape=='ship'||o.shape=='carrier')&&!o.dead){o.aiS=0;o.su=null;o.suU=null;o.mil=o.shape=='carrier'||(o.v|0)==2?1:0;SHIPS.push(o)}   // la portaerei è sempre militare: colpita, risponde al fuoco come le navi da guerra
 if(G.mode==1||G.mt==8||G.mt==9)return;                       // deathmatch e missioni senza popolazione iniziale: niente nave nemica
 if(G.mt==11){for(const o of MD.fleet||[])if(!o.dead){o.aiS=1;o.mil=0;o.v=2}return}   // missione 11: le navi nemiche sono quelle della flotta (niente nave nemica a caso)
 const R=rng(((M.seed^0x5A1F)+G.diff*977)>>>0);
 if(R()>=blimpProb(G.diff))return;
 const far=SHIPS.filter(o=>o.shape=='ship'&&Math.hypot(o.x-START[0],o.y-START[1])>2800);if(!far.length)return;   // la nave nemica è sempre una nave, mai la portaerei
 const o=far[R()*far.length|0];o.aiS=1;o.mil=0;o.v=2}           // prende il posto di una nave normale (aspetto militare, colore dell'AI)
// collega un'unità nave al suo scafo (host alla nascita, client quando arriva lo snapshot)
function shipLink(u){let b=null,bd=12;for(const o of SHIPS){const d=Math.abs(o.x-u.x)+Math.abs(o.y-u.y);if(d<bd){bd=d;b=o}}
 if(b){u.ob=b;u.sob=1;b.su=u.id;b.suU=u}return b}
// colpo allo scafo della nave nemica: il danno passa all'unità (con la sua corazza), lo scafo ne copia la vita
function shipObsHit(o,d,by){const u=o.suU;SHIP_FW=1;damage(u,d,by);SHIP_FW=0;
 o.hp=Math.max(0,o.m*u.hp/u.mhp);dirtyObs.add(o.id);
 if(u.dead||o.hp<=0){o.hp=0;o.dead=1;wreckFx(o);navRefresh(o)}}
// nave militare colpita (da chiunque): nasce l'unità che ne muove le torrette e attacca tutti quelli che vede
function navWake(o,by){const u=mkUnit(UK_SHIP,o.x,o.y,-1);u.nav=1;u.ms=1;u.ar=0;u.h=u.thr=u.thr2=u.thr3=o.a;u.hp=o.hp;u.mhp=o.m;shipLink(u);
 const q=by<1000?(by===NET.id?P:others[by]):units.find(v=>v.id===by);
 u.st=2;if(q){u.lkx=q.x;u.lky=q.y;u.lkt=LOST_T}
 if(o.shape=='carrier')carrierJets(o,q)}
// portaerei svegliata: decollano i jet parcheggiati sul ponte (stesse posizioni delle mini-dropship disegnate in drawSpecial)
// nav=1 → attaccano tutti, giocatori e AI, come la nave che li lancia · cj=1 → jet della portaerei (colore proprio, vedi nvCi in AGgame.js)
const CARR_JETS=6;
function carrierJets(o,q){const a=o.w/2*.9,b=o.h/2*.9,y=b*.38,x0=-a*.92,x1=a*.02;
 for(let i=0;i<CARR_JETS;i++){const p=toWorld(o,x0+(x1-x0)*i/(CARR_JETS-1),y),u=mkUnit(2,p[0],p[1],-1);
  u.nav=1;u.cj=1;u.ms=1;u.st=2;u.h=o.a-Math.PI*.85;u.hx=o.x;u.hy=o.y;u.px=Math.random()*TAU;   // hx,hy: senza bersagli girano attorno alla portaerei
  if(q){u.lkx=q.x;u.lky=q.y;u.lkt=LOST_T}
  fxSpawn(p[0],p[1],'#ffd23f',8,true,30)}
 sfxAt(SFX_LIST.toAir,.7,o.x,o.y,80)}
// Arena Duel: sceglie un punto di rinascita a media distanza dai giocatori (700–1500 px) per iniziare subito il duello
function duelPoint(){const pl=plist();if(!pl.length||!M.dm.length)return dmPoint();
 let best=null,bd=1e9;
 for(const q of shuf2(M.dm)){const d=pl.reduce((m,a)=>Math.min(m,Math.hypot(a.x-q[0],a.y-q[1])),1e9);
  if(d>=700&&d<=1500)return q;if(d>=600&&Math.abs(d-1000)<bd){bd=Math.abs(d-1000);best=q}}
 return best||dmPoint()}
// deathmatch: bot che combattono contro tutti, sparsi sui punti di rinascita (in Arena Duel: 1 sola unità scelta)
function populateDM(){units.length=0;PQ.length=0;UID=1000;GID=0;
 if(G.duel>=0){const du=DUEL_UNITS[G.duel]||DUEL_UNITS[0],p=duelPoint(),u=mkUnit(du.k,p[0],p[1],-1,{du});
  u.name=du.n;u.bi=1;u.kills=0;u.deaths=0;u.dm=1;if(u.k===UK_POL)u.st=2;return}
 const sp=shuf2(M.dm);
 for(let i=0;i<DM_BOTS&&i<sp.length;i++){const u=mkUnit(1,sp[i][0],sp[i][1],-1);u.name='BOT '+(i+1);u.ci=(Math.random()*COLS.length)|0;u.kills=0;u.deaths=0;u.dm=1;botLoadout(u)}}
const shuf2=a=>a.map(o=>[Math.random(),o]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]);
// ===== infiltrati (k=7) e guardie (k=8): partono travestiti da omini sui percorsi dei civili =====
// posizione e direzione a distanza m lungo il percorso r (avanti e indietro, stessa formula di civTick), off = scostamento laterale
function civPathAt(r,m,off){const L=r.L,mm=m%(2*L),fw=mm<L,s=fw?mm:2*L-mm,cl=r.cl;
 let lo=0,hi=cl.length-2;while(lo<hi){const q=(lo+hi+1)>>1;if(cl[q]<=s)lo=q;else hi=q-1}
 const a=r.p[lo],b=r.p[lo+1],u=(s-cl[lo])/((cl[lo+1]-cl[lo])||1),tx=b[0]-a[0],ty=b[1]-a[1],tl=Math.hypot(tx,ty)||1;
 return[a[0]+tx*u-ty/tl*off,a[1]+ty*u+tx/tl*off,Math.atan2(ty,tx)+(fw?0:Math.PI)]}
// c = classe del percorso: 0 civili, 1 militari (le guardie compaiono solo dove ci sono percorsi militari)
function humanSpawn(k,n,c){let made=0;
 for(let t=0;t<600&&made<n&&CIV.rd.length;t++){const j=Math.random()*CIV.rd.length|0,r=CIV.rd[j];if(!r.ped||r.hw||r.pc!==c)continue;
  const ps=Math.random()*2*r.L,po=r.off?0:(Math.random()<.5?1:-1)*(r.w/2+7),q=civPathAt(r,ps,po);
  if(Math.hypot(q[0]-START[0],q[1]-START[1])<SAFE_R||!clearAt(q[0],q[1],14))continue;
  const u=mkUnit(k,q[0],q[1],-1);u.h=q[2];u.rj=j;u.ps=ps;u.po=po;u.pv=rnd(22,42);u.rb=0;u.ms=1;made++}}
// ===== bot del deathmatch: 1 arma a caso (fra le 5) e 3 upgrade a caso (doppioni ammessi, come nelle caselle del giocatore) =====
const BOT_UP=['regen','pierce','shield','gspd','grlm','gdr'];   // upgrade che hanno effetto su un mech a terra (grlm = ricarica rapida + cadenza di fuoco)
const BOT_W=[W_MG,W_CAN,W_FLM,W_RKT,W_SHG,W_HOM];   // armi fra cui scelgono i bot
const BOT_BURST=[[[3,5],[1,1.8]],[[1,1],[.3,.8]],[[25,50],[1,2]],[[1,2],[1.5,2.5]],[[1,2],[.7,1.3]],[[2,4],[1,1.8]]];   // per arma (stesso ordine di BOT_W): [colpi per raffica, pausa in s]
function botLoadout(u){
 const bi=Math.random()*BOT_W.length|0,wi=BOT_W[bi],W=WEAPONS[wi],ups=[0,1,2].map(()=>{const id=BOT_UP[Math.random()*BOT_UP.length|0];return UPGRADES.find(x=>x.id==id)});   // prima si sceglie l'id, poi lo si cerca
 const mul=k=>ups.reduce((m,x)=>x[k]?m+(x[k]-1):m,1),sum=k=>ups.reduce((m,x)=>x[k]?m+x[k]:m,0);
 u.bw=wi;u.ws=newWS(wi);u.burst=BOT_BURST[bi][0];u.pause=BOT_BURST[bi][1];u.bl=Math.round(rnd(u.burst[0],u.burst[1]));
 u.hold=Math.min(UT[1].hold,Math.max(150,W.range*.6));                 // distanza di tiro adatta all'arma (lanciafiamme da vicino, ecc.)
 u.spm=mul('spd');u.frm=mul('frm');u.rlm=ups.reduce((m,x)=>x.rlm?m*x.rlm:m,1);u.dmx=sum('dmx');u.prc=sum('prc');u.ar=(u.ar||0)+sum('drG');   // dmx e prc arrivano entrambi da Proiettili perforanti
 u.rg=ups.some(x=>x.rgA)?REGEN*mul('rgG'):0;                            // rigenerazione
 u.shs=Array(sum('sh')).fill(0);u.sg=0}                                  // scudi
// ===== percezione, allarme, reazione =====
function startReact(u,T){u.st=2;u.path=null;u.pt=0;u.lkx=T.x;u.lky=T.y;u.lkt=LOST_T;u.fk=0;u.sa=0;u.sw=0;u.lvx=T.vx||0;u.lvy=T.vy||0}
// avvisa la squadra e le unità vicine (con un po' di ritardo proporzionale alla distanza); full=false aggiorna solo chi è già allarmato
function alertFrom(u,T,full){if(G.mode==1||u.pol||u.nav)return;   // i poliziotti e le navi militari non avvisano nessuno
 const members=[];
 for(const v of units){if(v===u||v.dead||v.slp||v.nav||v.k>=UK_HUM||!!v.sec!==!!u.sec)continue;const d=Math.hypot(v.x-u.x,v.y-u.y),same=u.g>=0&&v.g===u.g;
  if(!same&&d>ALERT_R)continue;
  if(v.st==0){if(!full)continue;startReact(v,T)}
  else if(v.st>=1){v.lkx=T.x;v.lky=T.y;v.lkt=LOST_T;v.lvx=T.vx||0;v.lvy=T.vy||0;v.sa=0;v.sw=0}
  if(same)members.push(v)}
 if(full&&u.g>=0){members.push(u);members.sort((a,b)=>a.id-b.id);const R0=[0,1,-1,0];members.forEach((v,i)=>{v.role=UT[v.k].fixed?0:R0[i%4]})}}
// colpita da un giocatore: se non ne vede nessuno si attiva subito (senza tempo di reazione) e corre verso l'origine del colpo
function hurtReact(u,o){const q=o===P.id?P:others[o];if(!q||q.hp<=0||u.dead)return;
 u.slp=0;if(u.st==2&&u.vis)return;
 u.lkx=q.x;u.lky=q.y;u.lkt=LOST_T;u.sa=0;u.sw=0;u.lvx=q.vx||0;u.lvy=q.vy||0;
 if(u.st<2){u.st=2;u.fk=0;u.path=null;u.pt=0}
 if(u.shout<=0){u.shout=1.5;alertFrom(u,q,true)}}   // anche squadra e unità vicine corrono verso l'origine del colpo
function think(u){
 // bersaglio = il più vicino tra quelli che vede; se non ne vede nessuno, il più vicino in assoluto
 let T=null,bd=1e18,vis=false,blk=null;
 const Ty=UT[u.k],wi=u.bw!=null?u.bw:Ty.w;                       // arma effettivamente usata
 const sight=has3(u.k)
  ? Math.max(WEAPONS[Ty.w].range,Ty.w2!=null?WEAPONS[Ty.w2].range*(UT[0].rm||1):0,WEAPONS[Ty.w3].range*2)*1.2   // dirigibile: max 1944 · nave (senza torretta 2): 1440
  : wi>=0?WEAPONS[wi].range*((u.bw==null&&Ty.rm)||1)*1.2:900;   // rm SOLO con l'arma di default
 const dmo=G.mode==1&&u.owner!=null;   // torretta o wingman di un giocatore in deathmatch: nemici sono tutti, tranne il proprietario e le sue unità
 for(const q of(u.pol||u.nav?TGP:dmo?TG:u.sec?TGE:TG)){if(q===u||q.hp<=0)continue;if(dmo&&(q.id===u.owner||q.owner===u.owner))continue;if(u.pol&&Math.hypot(q.x-u.hx,q.y-u.hy)>POL_LEASH)continue;if(u.sec&&!u.plWingman&&MD.bt&&Math.hypot(q.x-MD.bt.x,q.y-MD.bt.y)>SEC_LEASH)continue;const d2=(q.x-u.x)**2+(q.y-u.y)**2;let v=false,b=null;
  if(d2<=sight*sight){
   // Bersaglio VOLANTE: sempre visibile (il fumo non nasconde le unità volanti)
   if(q.z){v=!M.hi||!xHiBlock(u.x,u.y,q.x,q.y)}
   else{
    // Bersaglio A TERRA: LOS dipende da chi guarda.
    // - osservatore in volo: LOS libera (vola sopra gli edifici)
    // - osservatore a terra: raycast contro gli ostacoli
    if(u.z)v=!M.hi||!xHiBlock(u.x,u.y,q.x,q.y);
    else{b=losBlocker(u.x,u.y,q.x,q.y,eRad(q));v=!b;if(v&&typeof lvlBlocker==='function'&&lvlBlocker(u.x,u.y,q.x,q.y))v=false}
    // ERBA ALTA (AGnature.js): chi sta a terra nell'erba alta non si vede oltre 110 px, come per il giocatore (vedi drawUnit)
    if(v&&typeof natHide==='function'&&d2>110*110&&natHide(q.x,q.y))v=false;
    // FUMOGENI: nascondono SEMPRE i bersagli a terra dentro il fumo (o quando l'osservatore
    // è nel fumo, perché il fumo sale). Vale per qualsiasi osservatore, anche volante.
    // La distanza limite è SMK_HIDE (40 px).
    if(v&&typeof smokes!=='undefined'&&smokes.length){
     const lim=(typeof SMK_HIDE!=='undefined'?SMK_HIDE:40);
     for(const s of smokes){
      if(s.t>=s.life)continue;
      if(Math.hypot(q.x-s.x,q.y-s.y)<s.r||Math.hypot(u.x-s.x,u.y-s.y)<s.r){if(Math.sqrt(d2)>lim){v=false}break}
     }
    }
   }
  }
  if(!v&&(q.pol||q.nav||((u.pol||u.nav)&&!q.pl)))continue;   // poliziotti: i nemici li attaccano solo se li vedono; loro inseguono alla cieca solo i giocatori
  if((v&&!vis)||(v===vis&&d2<bd)){T=q;bd=d2;vis=v;blk=b}}
 u.T=T;if(!T){u.vis=false;u.vd=1e9;if(u.pol){u.lkx=u.hx;u.lky=u.hy;u.lkt=LOST_T}return}   // poliziotto senza bersagli: torna alla centrale
 const d=Math.sqrt(bd);
 u.vis=vis;u.vd=d;u.blk=blk;
 if(u.k>=UK_HUM){humanSee(u,T,d);return}          // infiltrati e guardie: logica propria (niente reazione né stealth)
 if(vis){
    u.lkx=T.x;u.lky=T.y;u.lkt=LOST_T;u.lvx=T.vx||0;u.lvy=T.vy||0;u.sa=0;u.sw=0;   // ultima posizione e velocità; azzera la ricerca
    if(u.st==0){startReact(u,T);if(!T.pol)alertFrom(u,T,true);u.shout=1.5}   // un poliziotto non mette in allarme la squadra
    else if(!T.pol)alertFrom(u,T,false)}
   else if(u.st>=1){
    const distToTarget = Math.hypot(u.lkx - u.x, u.lky - u.y);
    if(u.st === 2 && distToTarget > 100) u.lkt-=u.thT*.35;   // in viaggio: il timer scende lentamente
    else u.lkt-=u.thT;
    if(u.lkt<=0){u.st=0;u.path=null;u.fk=0;u.sa=0;u.sw=0}
  }
 if(u.aw&&!vis&&MD.bt){if(u.st<2){u.st=2;u.path=null;u.pt=0}u.lkt=LOST_T;u.lkx=MD.bt.x;u.lky=MD.bt.y}   // assalto (missione 8): se non vede nessuno marcia sull'edificio del meeting
}
// ===== infiltrati e guardie =====
// smascherati (st=2) quando un bersaglio visibile è a tiro della mitraglia; poi lo inseguono finché lo vedono, infine rinfoderano
function humanSee(u,T,d){
 if(u.pol||(u.dm&&u.k===UK_POL)){u.st=2;u.lkx=T.x;u.lky=T.y;u.lkt=LOST_T;u.lvx=T.vx||0;u.lvy=T.vy||0;return}   // poliziotto: sempre armato, va verso il bersaglio più vicino
 if(u.vis&&(u.st==2||d<WEAPONS[W_MG].range)){
  u.lkx=T.x;u.lky=T.y;u.lkt=LOST_T;u.lvx=T.vx||0;u.lvy=T.vy||0;u.sa=0;u.sw=0;
  if(u.st==0){u.st=2;u.fk=0;u.path=null;u.pt=0;u.bp=.4;alertFrom(u,T,true);u.shout=1.5}}   // estrae l'arma (bp = ~0,4 s per estrarla); alertFrom(…,false) per NON allarmare i vicini
 else if(u.st==2&&!u.vis){u.lkt-=u.thT;if(u.lkt<=0){u.st=0;u.path=null;u.fk=0;u.sa=0;u.sw=0;u.rb=0}}}   // bersaglio perso: rinfodera
function humanAI(u,dt){
 if(u.st==2){groundAI(u,dt);if(u.T)aiShoot(u,dt);return}   // armato: stessa AI dei nemici di terra
 const r=CIV.rd[u.rj];if(!r){if(u.dm)groundAI(u,dt);return}   // in Arena Duel senza percorso civile: pattuglia normalmente
 const q=civPathAt(r,u.ps,u.po),dx=q[0]-u.x,dy=q[1]-u.y,d=Math.hypot(dx,dy);
 if(d>16){stepTo(u,q[0],q[1],70,dt);push(u,UT[u.k].pr);u.h=Math.atan2(dy,dx);if((u.rb+=dt)>15){u.x=q[0];u.y=q[1];u.rb=0}}   // dopo uno scontro torna sul percorso
 else{u.rb=0;u.ps+=u.pv*dt;const n=civPathAt(r,u.ps,u.po);u.x=n[0];u.y=n[1];u.h=n[2];u.vx=u.vy=0}}
const stlAim=T=>T&&T.stl?STL_AIM:1;   // stealth attivo sul bersaglio: tempo di mira ×4
function aiShoot(u,dt){
 // ===== Dirigibile e nave da guerra: torrette indipendenti, ognuna mira e spara al proprio massimo raggio =====
 if(has3(u.k)){aiBlimpShoot(u,dt);return}
 const Ty=UT[u.k],wi=u.bw!=null?u.bw:Ty.w;if(wi<0||!u.ws)return;const T=u.T,W=WEAPONS[wi],R=W.range*((u.bw==null&&Ty.rm)||1);
 let tx,ty,tz,vis=u.vis,ob=false;
 if(u.stk>2&&u.bo&&!u.bo.dead){tx=u.bo.x;ty=u.bo.y;tz=0;ob=true}   // bloccato da più di 2 s: spara all'ostacolo (ha la precedenza sul bersaglio)
 else if(vis){
  if((u.aimT||0) < diffAimTime(G.diff,u)*stlAim(T)) return; // Richiede tempo di vista ininterrotta in base alla difficoltà (e allo stealth del bersaglio)
  tx=T.x;ty=T.y;tz=T.z?1:0;
 }
 else if(u.np&&u.blk&&!u.blk.ind&&u.vd<R){tx=u.blk.x;ty=u.blk.y;tz=0;vis=true}      // percorso bloccato: spara all'ostacolo
 else return;
 const d=Math.hypot(tx-u.x,ty-u.y);if(d>=R)return;
 
 // Calcola PRIMA il punto di lead e l'errore casuale: ang è l'angolo di sparo REALE (incluso il lead)
 const ld=u.lead!=null?u.lead:Ty.lead,er=(u.err!=null?u.err:Ty.err)*(u.sec?1:diffAiErr(G.diff));   // il wingman ha valori propri
 if(u.lr==null)u.lr=Math.random()<ld?(u.sec?1:diffLeadMul(G.diff)):0;   // il lead si decide UNA volta per colpo (si rilancia dopo lo sparo), non a ogni fotogramma
 if(u.vis&&!ob&&u.lr){const sp=W.speed*(Ty.bsp||1),vx=(T.vx||0)*u.lr,vy=(T.vy||0)*u.lr;let t=d/sp;tx=T.x+vx*t;ty=T.y+vy*t;t=Math.hypot(tx-u.x,ty-u.y)/sp;tx=T.x+vx*t;ty=T.y+vy*t}
 let ang=Math.atan2(ty-u.y,tx-u.x)+(Math.random()*2-1)*er*Math.PI/180;
 
// Rotazione graduale: il tank ruota SOLO la torretta (thr), le altre unità ruotano h (che è anche la torretta). Stessa velocità per tutti.
 const curA = hasTur(u.k) ? (u.thr!=null?u.thr:u.h) : u.h;
 const newA = aiTurn(curA, ang, AI_ROT, dt);
 if(hasTur(u.k)) u.thr = newA; else u.h = newA;
 
 // L'unità non spara finché la canna non è allineata all'angolo di sparo finale (entro ~1 grado / 0.0175 rad)
 if(Math.abs(ad(ang, newA)) > 0.0175) return;
 if(u.ws2){u.bt-=dt;if(u.bt<=0&&readyWS(u.ws2)&&u.vis){u.bt=4;const b=fireWeapon(u,Ty.w2,ang,Math.min(WEAPONS[Ty.w2].range,d+200),tz,30);b.forEach(x=>addBullet(x,true));spendWS(u.ws2,Ty.w2);sfxAt(WEAPONS[Ty.w2].sfx,.5,u.x,u.y,60)}}
 if(u.ws3){u.bt3-=dt;if(u.bt3<=0&&readyWS(u.ws3)&&u.vis){u.bt3=3;const b=fireWeapon(u,Ty.w3,ang,Math.min(WEAPONS[Ty.w3].range,d+12),tz,30);b.forEach(x=>addBullet(x,true));spendWS(u.ws3,Ty.w3);sfxAt(WEAPONS[Ty.w3].sfx,.5,u.x,u.y,60)}}   // terza arma (Dirigibile): lanciarazzi ogni 3 s
 if(u.bp>0){u.bp-=dt;return}
 if(!readyWS(u.ws))return;
 const tg=W.hom&&u.vis&&!ob&&T?(T.pl?T.id:T.id>=1000?T.id:-1):-1;   // missili guidati: bersaglio agganciato (giocatore o unità; ostacoli e VIP no: il missile va dritto)
 const dEnd=W.hom?R:Math.min(R,Math.hypot(tx-u.x,ty-u.y)+12),off=Ty.r+4;   // il missile guidato vola fino a gittata piena (come quello del giocatore)
 if(W.flame){flameHit(u.x,u.y,ang,u.z,{...W,dmg:W.dmg+dmxB(u.dmx,W)},u.id);flameFx(u.x,u.y,ang,W);if(NET.on)bcast({t:'fl',id:u.id,x:u.x,y:u.y,a:ang})}   // lanciafiamme del bot
 else for(const b of fireWeapon(u,wi,ang,dEnd,tz,off,Ty.bsp)){
  if(tg>=0)b.tg=tg;
  if(Ty.dmg!=null)b.dmg=Ty.dmg+dmxB(u.dmx,W);   // override del danno per-tipo (es. Cecchino 50 invece di 80)
  addBullet(b,true)}
 const def=u.bw==null,rtMul=(def&&Ty.rate)||1,rlMul=(def&&Ty.rlm)||1;
spendWS(u.ws,wi,rtMul*(u.frm||1),rlMul*(u.rlm||1));if(def&&Ty.inf){u.ws.a=W.mag;u.ws.rl=0}   // inf/rate/rlm SOLO con l'arma di default
 u.fl=.04;u.lr=null;sfxAt(wi==W_MG?SFX_LIST.enemy:W.sfx,.35,u.x,u.y,40);   // u.lr=null: al colpo successivo si rilancia il lead
 if(!Ty.inf&&--u.bl<=0){const ps=u.pause||Ty.pause,bs=u.burst||Ty.burst;u.bp=rnd(ps[0],ps[1]);u.bl=Math.round(rnd(bs[0],bs[1]))}}
// ===== movimento =====
// schivata casuale (come jetgrunt-MP-22): ogni 0,8–1,4 s, nel 70% dei casi uno scatto laterale di 0,3–0,6 s.
// Restituisce true mentre schiva e mette in DG la velocità laterale (perpendicolare alla direzione verso tx,ty)
const DG={x:0,y:0};

// Dirigibile: 3 torrette indipendenti (thr=mitraglia, thr2=cannone, thr3=lanciarazzi).
// Ognuna ha il proprio angolo e il proprio range (540 / 1620 / 600); mirano tutte al bersaglio u.T.
function aiBlimpShoot(u,dt){
 const Ty=UT[u.k],T=u.T;
 if(!T)return;
 // bersaglio e visibilità (come le altre AI: se è bloccato da >2 s spara all'ostacolo)
 let tx,ty,tz,ob=false;
 if(u.stk>2&&u.bo&&!u.bo.dead){tx=u.bo.x;ty=u.bo.y;tz=0;ob=true}
 else{
  if(!u.vis)return;
  if((u.aimT||0)<diffAimTime(G.diff,u)*stlAim(T))return;   // tempo di vista ininterrotta in base alla difficoltà (e allo stealth del bersaglio)
  tx=T.x;ty=T.y;tz=T.z?1:0;
 }
 const d=Math.hypot(tx-u.x,ty-u.y);
 const T0=UT[0];   // la torretta centrale replica in tutto la torretta di terra
 // tre torrette: [key angolo, ws, arma, timer, intervallo, flag lead, gittata, cadenza, infinite, raffiche]
 const TUR=[
  {key:'thr',  ws:u.ws,  w:Ty.w,  bt:null,  gap:0, lk:'l1', rm:1,        rate:1,       inf:0,      lead:Ty.lead, err:Ty.err, burst:1},
  {key:'thr2', ws:u.ws2, w:Ty.w2, bt:null,  gap:0, lk:'l2', rm:T0.rm||1, rate:T0.rate, inf:T0.inf, lead:T0.lead, err:T0.err, burst:0},
  {key:'thr3', ws:u.ws3, w:Ty.w3, bt:'bt3', gap:3, lk:'l3', rm:2,        rate:1,       inf:0,      lead:Ty.lead, err:Ty.err, burst:0},
 ];
 for(const tt of TUR){
  if(tt.w<0||!tt.ws)continue;
  const WT=WEAPONS[tt.w],R=WT.range*tt.rm;
  if(u[tt.lk]==null)u[tt.lk]=Math.random()<tt.lead?(u.sec?1:diffLeadMul(G.diff)):0;
  // lead specifico per questa arma (mitraglia 760, lanciarazzi 400)
  let lx=tx,ly=ty;
  if(!ob&&u[tt.lk]){
   const sp=WT.speed;
   let tf=Math.hypot(lx-u.x,ly-u.y)/sp;
   const vx=(T.vx||0)*u[tt.lk],vy=(T.vy||0)*u[tt.lk];   // u[tt.lk] = moltiplicatore dell'anticipo (errore della difficoltà)
   lx=T.x+vx*tf; ly=T.y+vy*tf;
   tf=Math.hypot(lx-u.x,ly-u.y)/sp;
   lx=T.x+vx*tf; ly=T.y+vy*tf;
  }
  const ang=Math.atan2(ly-u.y,lx-u.x);
  // ruota solo questa torretta verso il bersaglio
  const cur=u[tt.key]!=null?u[tt.key]:u.h;
  const newA=aiTurn(cur,ang,AI_ROT,dt);
  u[tt.key]=newA;
  // spara solo se il bersaglio è entro il range di QUESTA torretta e la canna è allineata
  if(d>=R)continue;
  if(Math.abs(ad(ang,newA))>0.0175)continue;
  // timer per lanciarazzi; mitraglia anteriore a raffiche; centrale continua come torretta di terra
  if(tt.bt){u[tt.bt]-=dt;if(u[tt.bt]>0)continue}
  if(tt.burst&&u.bp>0){u.bp-=dt;continue}
  if(!readyWS(tt.ws))continue;
  const dLead=Math.hypot(lx-u.x,ly-u.y),dEnd=Math.min(R,dLead+12),off=Ty.r+4;
  const shotA=newA+(Math.random()*2-1)*tt.err*(u.sec?1:diffAiErr(G.diff))*Math.PI/180;
  for(const b of fireWeapon(u,tt.w,shotA,dEnd,tz,off))addBullet(b,true);
  spendWS(tt.ws,tt.w,tt.rate);
  if(tt.inf){tt.ws.a=WT.mag;tt.ws.rl=0}
  u[tt.lk]=Math.random()<tt.lead?(u.sec?1:diffLeadMul(G.diff)):0;   // lead rilanciato a ogni colpo, come in aiShoot
  if(tt.bt)u[tt.bt]=tt.gap;
  else if(tt.burst&&--u.bl<=0){const ps=Ty.pause,bs=Ty.burst;u.bp=rnd(ps[0],ps[1]);u.bl=Math.round(rnd(bs[0],bs[1]))}
  u.fl=.04;
  sfxAt(tt.w==W_MG?SFX_LIST.enemy:WT.sfx,tt.w==W_MG?.35:.5,u.x,u.y,40);
 }
}

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
// rallentamento del terreno per l'AI a terra (come il Grunt del giocatore): colline, fango/palude, neve/pozzanghere; ricalcolato solo dopo 24 px di spostamento
function gSlow(u){if(u.z)return 1;if(u._gx!=null&&Math.abs(u.x-u._gx)+Math.abs(u.y-u._gy)<24)return u._gs;u._gx=u.x;u._gy=u.y;
 return u._gs=(inHill(u.x,u.y)?HILL_SLOW:1)*(typeof natSlow==='function'?natSlow(u.x,u.y):1)*(wxAt(u.x,u.y)?WX_SLOW:1)}
function groundAI(u,dt){const Ty=UT[u.k],T=u.T,x0=u.x,y0=u.y,hd=u.hold||Ty.hold;let moving=false,sp=0,dgx=0,dgy=0;
 if(u.st==2){
  const tgt=u.vis?T:{x:u.lkx,y:u.lky,vx:0,vy:0};let gx=tgt.x,gy=tgt.y;
  if(u.k!=5&&dodgeStep(u,dt,(u.fast?170:140)*GND_SPD,gx,gy)){dgx=DG.x;dgy=DG.y;moving=true}   // schivata: si somma al movimento, non lo sostituisce (il tank non schiva)
  if(u.vis&&u.vd<hd)u.vx=u.vy=0;   // in posizione: si ferma e spara (si muove solo per schivare): la velocità è zero anche se non schiva
  else{
   if(u.role&&!u.fk&&u.vis&&u.vd>hd*1.3){ // fianco: punta a un lato del bersaglio, poi attacca da lì
    const ux=(T.x-u.x)/u.vd,uy=(T.y-u.y)/u.vd,F=hd+160;gx=T.x-uy*u.role*F;gy=T.y+ux*u.role*F;
    if(Math.hypot(gx-u.x,gy-u.y)<240)u.fk=1}
   else if(!u.vis&&Math.hypot(u.lkx-u.x,u.lky-u.y)<50)searchNext(u);
   if(u.sw>0&&!u.vis){u.sw-=dt;u.h+=Math.sin(G.t*2.5+u.id)*2*dt;u.vx=u.vy=0}   // ricerca: si ferma e si guarda attorno
   else{
    sp=(u.k==1?(u.fast?Ty.fast:Ty.spd):Ty.spd)*(u.spm||1)*gSlow(u);
    followPath(u,gx,gy,sp,dt);moving=true}}
 }else if(u.st==0){ // pattuglia
  if(u.k==6&&MD&&MD.wp&&MD.wp.length){const w=MD.wp[(u.wi||0)%MD.wp.length];
   if(Math.hypot(w[0]-u.x,w[1]-u.y)<160)u.wi=((u.wi||0)+1)%MD.wp.length;followPath(u,w[0],w[1],110*GND_SPD*gSlow(u),dt);moving=true}
  else{u.wt-=dt;if(u.wt<=0||Math.hypot(u.px-u.x,u.py-u.y)<30){u.wt=rnd(3,8);const a=Math.random()*TAU,d=rnd(100,350),px=clamp(u.hx+Math.cos(a)*d,100,WW-100),py=clamp(u.hy+Math.sin(a)*d,100,WH-100);if(!nav[ncell(px,py)]){u.px=px;u.py=py}}
   stepTo(u,u.px,u.py,(u.k==1?50:u.k==4?40:35)*GND_SPD*gSlow(u),dt);moving=true}}
 if(moving){
  u.x+=dgx*dt;u.y+=dgy*dt;u.vx+=dgx;u.vy+=dgy;   // la schivata si somma al passo già fatto
  separate(u,dt);push(u,Ty.pr);
  if(!(u.st==2&&u.vis)&&Math.hypot(u.vx,u.vy)>5){
   const tgtH=Math.atan2(u.vy,u.vx);
   u.h=aiTurn(u.h,tgtH,u.k===5?AI_ROT_HULL:AI_ROT,dt)}}   // tank: scafo a 2/3, tutti gli altri a velocità piena
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
 if(Math.hypot(u.vx,u.vy)>15&&!(u.st==2&&u.vis))u.h=aiTurn(u.h,Math.atan2(u.vy,u.vx),AI_ROT,dt)}

function kamiAI(u,dt){const T=u.T,B=UT[3].boom;let gx=u.x,gy=u.y,sp=0;
 if(u.st==2){gx=u.vis?T.x:u.lkx;gy=u.vis?T.y:u.lky;sp=UT[3].spd;if(!u.vis&&Math.hypot(gx-u.x,gy-u.y)<50){sp=0;u.st=0}}
 else{u.wt-=dt;if(u.wt<=0||Math.hypot(u.px-u.x,u.py-u.y)<30){u.wt=rnd(3,8);const a=Math.random()*TAU,d=rnd(100,350);u.px=clamp(u.x+Math.cos(a)*d,100,WW-100);u.py=clamp(u.y+Math.sin(a)*d,100,WH-100)}gx=u.px;gy=u.py;sp=80}
 if(sp>0){const dx=gx-u.x,dy=gy-u.y,d=Math.hypot(dx,dy)||1;u.vx=dx/d*sp;u.vy=dy/d*sp;
  if(u.st==2&&dodgeStep(u,dt,160,gx,gy)){u.vx+=DG.x;u.vy+=DG.y}   // avanza verso il bersaglio e schiva insieme
  u.x=clamp(u.x+u.vx*dt,20,WW-20);u.y=clamp(u.y+u.vy*dt,20,WH-20);u.h=aiTurn(u.h,Math.atan2(dy,dx),AI_ROT,dt)}
 if(u.vis&&u.vd<B.trig){explode(u.x,u.y,B.r,B.dmg,T.z?1:0,u.id,true,1);u.dead=1;u.kb=-1}}// Swordman fuori portata della spada: un colpo singolo di mitraglia ogni SWD_GUN_CD s (stessa arma, danno e proiettile della mitraglia di tutti)
function swordGun(u,T){if(u.sgc>0||!u.vis)return;
 if((u.aimT||0)<diffAimTime(G.diff,u)*stlAim(T))return;   // stesso tempo di mira degli altri nemici (e stesso effetto dello stealth)
 const W=WEAPONS[W_MG],d=Math.hypot(T.x-u.x,T.y-u.y);if(d>=W.range)return;
 const ang=Math.atan2(T.y-u.y,T.x-u.x)+(Math.random()*2-1)*ENEMY_AIM_ERR*diffAiErr(G.diff)*Math.PI/180;
 if(Math.abs(ad(ang,u.h))>.15)return;   // spara solo quando è già girato verso il bersaglio
 u.sgc=SWD_GUN_CD;
 for(const b of fireWeapon(u,W_MG,ang,Math.min(W.range,d+12),T.z?1:0,UT[UK_SWD].r+4))addBullet(b,true);
 u.fl=.04;sfxAt(SFX_LIST.enemy,.35,u.x,u.y,40)}
// Swordman: corre addosso al bersaglio e, ogni SWD_CD s, colpisce con la spada chi è a portata (giocatori, alleati, wingman, torrette, edificio da difendere)
function swordAI(u,dt){const T=u.T;u.swc=Math.max(0,(u.swc||0)-dt);u.sgc=Math.max(0,(u.sgc||0)-dt);
 if(T&&u.vis)u.h=aiTurn(u.h,Math.atan2(T.y-u.y,T.x-u.x),AI_ROT*1.5,dt);   // si gira verso il bersaglio (un po' più in fretta degli altri)
 const R0=MELEE_R*MECH_SCALE,hits=[];
 if(T&&Math.hypot(T.x-u.x,T.y-u.y)>R0+eRad(T)){swordGun(u,T);return}   // bersaglio fuori portata della spada: pistola
 if(u.swc>0)return;
 for(const q of TG){if(q===u||q.hp<=0||(q.k!=null&&!q.sec&&!q.plWingman&&!q.plTurret))continue;   // mai gli altri nemici
  const er=eRad(q),dx=q.x-u.x,dy=q.y-u.y,d=Math.hypot(dx,dy);
  if(d<=R0+er&&(d<=er+6||Math.abs(ad(Math.atan2(dy,dx),u.h))<=MELEE_ARC)&&(d<=er+6||!losBlocker(u.x,u.y,q.x,q.y,er)))hits.push(q)}
 if(!hits.length)return;
 u.swc=SWD_CD;const dm=MELEE_DMG*SWD_DMG;
 slashes.push({id:u.id,a:u.h,t:0,life:.22,sc:MECH_SCALE});sfxAt(SFX_LIST.melee,.8,u.x,u.y,100);
 if(NET.on)bcast({t:'sl',id:u.id,a:u.h,sc:MECH_SCALE});
 const bs=slashBlocks(u.x,u.y,u.id,-1,R0);
 if(bs){plasmaRefund(bs,true);impact(u.x,u.y,'#e6f6ff')}   // parato da un fendente in corso: il fendente parte lo stesso ma non fa danno
 else for(const q of hits){if(q===MD.bt){if(MD.mb&&!MD.mb.dead)damageObs(MD.mb,dm,u.id)}else damage(q,dm,u.id)}}
// Dirigibile: lento, vola dritto sopra tutto (niente percorsi né collisioni); la torretta ruota per conto suo (u.thr, vedi aiShoot)
function blimpAI(u,dt){const Ty=UT[u.k],T=u.T;let gx=u.px,gy=u.py,sp=0;
 if(u.st==2){
  const tg=u.vis?T:{x:u.lkx,y:u.lky};gx=tg.x;gy=tg.y;
  if(u.vis&&u.vd<(u.hold||Ty.hold))sp=0;                        // in posizione: resta fermo e spara
  else if(!u.vis&&Math.hypot(gx-u.x,gy-u.y)<50)sp=0;            // all'ultimo punto noto: aspetta (think() lo riporta in pattuglia quando lkt scade)
  else sp=Ty.spd*(u.spm||1)}
 else{u.wt-=dt;if(u.wt<=0||Math.hypot(u.px-u.x,u.py-u.y)<30){u.wt=rnd(3,8);const a=Math.random()*TAU,d=rnd(100,350);u.px=clamp(u.hx+Math.cos(a)*d,100,WW-100);u.py=clamp(u.hy+Math.sin(a)*d,100,WH-100)}gx=u.px;gy=u.py;sp=35}   // pattuglia attorno al punto di partenza
 if(sp>0){stepTo(u,gx,gy,sp,dt);u.x=clamp(u.x,40,WW-40);u.y=clamp(u.y,40,WH-40);u.h=aiTurn(u.h,Math.atan2(u.vy,u.vx),AI_ROT_HULL,dt)}   // lo scafo punta dove va (ruota a 2/3, come il carro)
 else u.vx=u.vy=0}
// ===== Wingman: segue il proprietario in FORMAZIONE (come i VIP della missione 10) =====
// Usa la STESSA logica del VIP (vipMove): percorso A*, sblocco dopo 2 s, teletrasporto dopo 3 s.
// In più: ogni wingman ha un offset laterale diverso (in base all'indice tra i wingman del
// proprietario) e una separazione minima, così non si accavallano mai l'uno sull'altro.
function wingmanAI(u,dt){
 const owner=(u.owner==null||u.owner===NET.id)?P:others[u.owner];
 if(!owner||owner.hp<=0){if(!u.dead){u.hp=0;u.dead=1;u.kb=-1}return}
 const Ty=UT[u.k];
 // Player in Air: il Mech a terra non può seguirlo, resta fermo e aspetta
 if(owner.air){u.vx=0;u.vy=0;return}
 // In combattimento (nemico visibile e in gittata): fermo, ci pensa aiShoot a girarlo e sparare
 if(u.vis&&u.T&&u.vd<(u.hold||Ty.hold||320)*1.2&&Math.hypot(owner.x-u.x,owner.y-u.y)<350){u.vx=0;u.vy=0;return}   // fermo a combattere solo se il proprietario è vicino; altrimenti resta in formazione e spara muovendosi
 if(u.rr==null)u.rr=(Ty.pr||18)-2;

 // ===== FORMAZIONE =====
 // 1) posizione in formazione: l'indice del wingman tra i wingman vivi dello stesso
 //    proprietario determina lo scostamento laterale (come fanno i VIP con v.n-2).
 //    Con n=1 → dietro dritto; n=2 → sinistra+destra; n=3 → sinistra+centro+destra; ecc.
 const peers=units.filter(v=>v.plWingman&&v.owner===u.owner&&!v.dead);
 const n=peers.length;
 const idx=peers.indexOf(u);
 const side=n>1?(idx-(n-1)/2):0;

 // 2) direzione: linea wingman→owner (identica ai VIP)
 const dx=owner.x-u.x, dy=owner.y-u.y, d=Math.hypot(dx,dy)||1;
 const ux=dx/d, uy=dy/d;
 const FD=80, LAT=70;               // distanza dietro al player · scostamento laterale per "step"
 const px=-uy, py=ux;               // perpendicolare alla linea
 const tx=owner.x-ux*FD+px*side*LAT;
 const ty=owner.y-uy*FD+py*side*LAT;

 // 3) se il wingman "centrale" è già addosso al player E non è davanti alla mira,
 //    si ferma e guarda dove guarda il player (evita di incollarsi).
 const fa=owner.fa!=null?owner.fa:(owner.h||0);
 const isFront=((u.x-owner.x)*Math.cos(fa)+(u.y-owner.y)*Math.sin(fa))>30;
 if(d<60 && Math.abs(side)<.1 && !isFront){
  u.vx=0;u.vy=0;
  u.h=aiTurn(u.h,fa,AI_ROT*.5,dt);
  return;
 }

 // 4) se la formazione si è spostata molto (player ruotato o spostato), invalida il path
 if(u.path){const lp=u.path[u.path.length-1];if(Math.hypot(lp[0]-tx,lp[1]-ty)>200){u.pt=0;u.path=null}}
 const h0=u.h;
 vipMove(u,tx,ty,owner,dt);
 if(u.vis&&u.T)u.h=h0;   // vipMove punta il mech nella direzione di marcia: con un bersaglio si conserva la mira (la gestisce aiShoot)

 // 5) separazione: se due wingman si sovrappongono, si respingono a vicenda.
 //    È la stessa idea dei VIP in missione 10 (distanza minima 40 px). Per i Mech usiamo 55 px.
 for(const v of peers){if(v===u)continue;
  const ddx=u.x-v.x, ddy=u.y-v.y, dd=Math.hypot(ddx,ddy)||1, min=55;
  if(dd<min){const k=(min-dd)/dd*.5;u.x+=ddx*k;u.y+=ddy*k;v.x-=ddx*k;v.y-=ddy*k}
 }
 // 6) ricontrolla le collisioni dopo la separazione (un Mech potrebbe essere finito dentro un muro)
 push(u,16,1);
}
// ===== ciclo principale dell'AI (solo singolo/host) =====
function aiUpdate(dt){
 const pl=plist();
 TG=G.mode==1?pl.concat(units):pl.concat(allyList());
 // Wingman: alleato del giocatore in ogni modalità, i nemici lo devono poter attaccare
 for(const u of units)if(u.plWingman&&!u.dead&&u.hp>0)TG.push(u);
 // TGE = nemici: SEMPRE popolato (servono alle torrette del giocatore, oltre che alle guardie della missione 8)
 TGE=units.filter(u=>!u.dead&&!u.sec&&(!u.nav||u.cj)&&(u.k<UK_HUM||u.st==2));   // anche i jet della portaerei: le guardie e le torrette dei giocatori li abbattono   // omini nemici (infiltrati/guardie) solo se hanno estratto l'arma
 if((G.mt==8||G.mt==9)&&G.mode!=1){
  const B8=MD.bt;if(B8&&MD.mb&&!MD.mb.dead){B8.hp=MD.mb.hp;TG.push(B8)}
  for(const u of units)if(u.sec&&!u.dead&&u.hp>0&&!u.plTurret)TG.push(u)
 }
 // Torrette del giocatore: sempre attaccabili dai nemici, in qualsiasi modalità
 for(const u of units)if(u.plTurret&&!u.dead)TG.push(u);
 // Poliziotti: i nemici li attaccano; loro attaccano tutti (giocatori, alleati, nemici, wingman, torrette) tranne gli altri poliziotti
 TGP=units.some(u=>(u.pol||u.nav)&&!u.dead)?pl.concat(allyList(),units.filter(u=>!u.dead&&!u.pol&&!u.nav&&(u.k<UK_HUM||u.st==2))):[];   // anche le navi militari sveglie attaccano tutti
 if(G.mode!=1)for(const u of TGP.length?units:[])if((u.pol||u.nav)&&!u.dead)TG.push(u);
 for(const u of units){if(u.dead)continue;
 if(u.sob&&(!u.ob||u.ob.dead)){u.dead=1;if(u.kb==null)u.kb=-1;continue}   // scafo affondato: l'unità della nave sparisce
 u.fl=Math.max(0,u.fl-dt);u.pt-=dt;u.shout-=dt;if(u.dis>0){u.dis-=dt;continue}
 if(u.ws)tickWS(u.ws,u.bw!=null?u.bw:UT[u.k].w,dt);if(u.ws2)tickWS(u.ws2,UT[u.k].w2,dt);if(u.ws3)tickWS(u.ws3,UT[u.k].w3,dt);
 if(u.rg&&u.hp<u.mhp)u.hp=Math.min(u.mhp,u.hp+u.rg*dt);                 // rigenerazione del bot
 if(u.shs){u.sg=Math.max(0,(u.sg||0)-dt);for(let i=0;i<u.shs.length;i++)if(u.shs[i]>0)u.shs[i]=Math.max(0,u.shs[i]-dt)}   // ricarica degli scudi
 if(u.revive)for(let i=0;i<u.revive.length;i++)if(u.revive[i]>0)u.revive[i]=Math.max(0,u.revive[i]-dt);   // ricarica della rianimazione
 if(u.slp){const q=pl.length?pl.reduce((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)<Math.hypot(b.x-u.x,b.y-u.y)?a:b):null;if(q&&Math.hypot(q.x-u.x,q.y-u.y)<650)u.slp=0;else continue}
 
 // Se l'unità vede il bersaglio in stato di caccia, accumula tempo di mira; altrimenti si azzera
 if(u.vis&&u.T&&u.st==2){const cap=diffAimTime(G.diff,u)*stlAim(u.T)+AIM_CAP;if((u.aimT||0)<cap)u.aimT=Math.min(cap,(u.aimT||0)+dt)}   // sale mentre vede il bersaglio, fino a soglia + AIM_CAP (gli alleati partono da 999: restano pronti)
 else u.aimT=Math.max(0,(u.aimT||0)-dt*diffAimDecay(G.diff));   // non ti vede: il contatore cala (più in fretta alle difficoltà basse)

 u.th-=dt;if(u.th<=0){u.th=.2+Math.random()*.1;u.thT=u.th>0?.25:.25;think(u)}
   if(u.plWingman){
   if(u.vis&&u.st<2){u.st=2;u.fk=0;u.path=null;u.pt=0}   // niente attesa di reazione per un alleato
   wingmanAI(u,dt);
   if(u.T&&u.vis)aiShoot(u,dt);
   continue;
  }
  if(u.k>=UK_HUM){humanAI(u,dt);continue}
  if(u.k===UK_SHIP){if(u.nav){u.hp=u.ob.hp;u.mhp=u.ob.m}if(u.st==2&&u.T)aiShoot(u,dt);continue}   // nave militare: la vita è quella dello scafo
  if(u.k==0){if(u.st==2&&u.T)aiShoot(u,dt);continue}
  if(u.k==2)flyerAI(u,dt);else if(u.k==3){kamiAI(u,dt);continue}else if(u.k===UK_BLIMP)blimpAI(u,dt);else groundAI(u,dt);
  if(u.st==2&&u.T){if(u.k===UK_SWD)swordAI(u,dt);else aiShoot(u,dt)}}
 for(let n=0;n<2&&PQ.length;n++){const u=PQ.shift();u.pq=0;if(u.dead)continue;const p=navPath(u.x,u.y,u.gx,u.gy);
  u.path=p;u.pi=0;const l=p[p.length-1];u.np=Math.hypot(l[0]-u.gx,l[1]-u.gy)>200}}

let MD={blk:[],tg:[],z:[],wp:[]},MS={t:0,st:0,al:null},BAR=[];
const DM={sc:{},rq:[]};
const spawnAt=id=>baseXY(200+(id%5)*48,200+((id/5)|0)*48);   // le file di partenza seguono la rotazione della base
const dSt=o=>Math.hypot(o.x-START[0],o.y-START[1]);
const isTown=s=>s.k=='g'||s.k=='r'||s.k=='l';
allyList=()=>{if(G.mt==8)return(MS.vans||[]).filter(v=>v.on&&v.hp>0);if(G.mt==10)return(MS.vips||[]).filter(v=>v.on&&!v.saved&&v.hp>0&&!(v.inV>=0));const a=MS.al;return a&&a.on&&a.hp>0&&!(a.inV>=0)?[a]:[]};   // VIP a bordo: li protegge il mezzo   // missione 8: furgoni · missione 10: VIP recuperati
function plen(p){let L=0;for(let i=1;i<p.length;i++)L+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);return L}
function pathAt(s){const p=MD.pts,c=MD.cl;s=clamp(s,0,MD.len);let i=1;while(i<c.length-1&&c[i]<s)i++;const a=p[i-1],b=p[i],u=clamp((s-c[i-1])/((c[i]-c[i-1])||1),0,1);return{x:a[0]+(b[0]-a[0])*u,y:a[1]+(b[1]-a[1])*u,h:Math.atan2(b[1]-a[1],b[0]-a[0])}}
function wAt(s){const c=MD.cl;let i=1;while(i<c.length-1&&c[i]<s)i++;for(const g of MD.sg)if(i>=g.i0&&i<=g.i1)return g.w;return MD.sg[MD.sg.length-1].w}
function finish(v,txt){if(G.over)return;G.over=v;G.overMsg=txt;MS.st=v==2?1:2;rainLoopStop();windLoopStop();campFinish(v);if(NET.on&&NET.host)bcast({t:'over',v,m:txt,c:campPack()})}
function announce(t){say(t);if(NET.on&&NET.host)bcast({t:'say',m:t})}

// fine obiettivo: non si vince subito. Fase 1 = raggiungere il punto di estrazione, fase 2 = arriva la dropship
function objDone(txt){if(G.over||MS.ex)return;MS.ex=1;MS.exMsg=txt;announce(txt+(G.mt==7?' Raggiungi la nave spaziale!':' Raggiungi il punto di estrazione!'))}
function extractBegin(){if(G.ext)return;G.ext=1;P.air=false;P.z=0;P.vx=P.vy=0;P.sp=0;if(G.mt==7)shipBegin();else dsExtract()}
function extractTick(dt){const m=MS,pl=plist();
 if(m.nk==1&&m.ex<2){m.nt-=dt;if(m.nt<=0){m.nt=0;nukeGo()}}         // timer scaduto: esplode, i giocatori non in estrazione muoiono (con le dropship in arrivo il timer si ferma)
 if(m.nk==1&&m.ng>0){m.ng-=dt;if(m.ng<=0){m.ng=0;nukeGo()}}         // l'ultima dropship sta ripartendo: detonazione
 if(m.ex==1&&m.nk!=2){if(pl.length==1+Object.keys(others).length&&pl.every(q=>Math.hypot(q.x-EXT[0],q.y-EXT[1])<extR())){m.ex=2;announce(G.mt==7?'La nave spaziale sta per decollare!':'Dropship in arrivo!');extractBegin();
   if(m.nk==1)m.ng=2.4+DS_T.hover+.8+DS_T.turn+.35*Math.max(0,DS.ships.length-1)+.2}}   // arrivo + sosta + giro dell'ultima dropship (vedi dsExtract): esplode mentre se ne vanno
 else if(m.ex==2&&!DS.on&&!SH.on&&(!m.nk||NK.wiped))finish(2,'Estrazione completata!')}   // nucleare: appena l'onda d'urto ha coperto la mappa

// ===== missione 6 (esplosione nucleare) e 7 (decollo della nave) =====
// NK e SH sono animazioni LOCALI: in rete passano solo m.ex, m.nk (0 niente, 1 conto alla rovescia, 2 esplosa) e m.nt (secondi) — vedi msPack
const NK={on:0,t:0,x:0,y:0,wiped:0,s2:0},SH={on:0,t:0,o:null,x:0,y:0,a:0},SH_BOARD=1.2,SH_LIFT=1.6,SH_FLY=6.5;
const extR=()=>G.mt==7?SHIP_R:EXT_R;
// punto libero più vicino al centro del sito (a spirale) dove mettere la zona di cattura
function zoneAt(s){for(let r=0;r<=330;r+=30)for(let k=0,n=r?12:1;k<n;k++){const a=k*TAU/12,x=s.x+Math.cos(a)*r,y=s.y+Math.sin(a)*r;if(clearAt(x,y,70)&&!inWater(x,y,KOTH_R))return{x,y,r:KOTH_R,p:0}}return{x:s.x,y:s.y,r:KOTH_R,p:0}}
// sito catturato: parte il timer e compaiono nemici (dormienti) tra il sito e l'estrazione; vipTrap già li piazza lungo quella linea
function nukeArm(z){objDone('Sito nucleare conquistato! Detonazione tra '+NK_T+' secondi.');MS.nk=1;MS.nt=NK_T;vipTrap(z);vipTrap(z)}
function nukeGo(){if(MS.nk==2)return;MS.nk=2;nukeBegin(0)}
// onda d'urto: raggio = NK.v·t · arriva all'estrazione in NK_SW_ARR s e copre tutta la mappa in al massimo NK_SW_MAX s (NK.T = fine dell'onda)
const NK_SW_ARR=2.6,NK_SW_MAX=6,NK_SW_B=300;   // NK_SW_B = spessore del fronte (px del mondo)
function nukeBegin(t0){const z=MD.z[0];NK.on=1;NK.t=t0||0;NK.x=z.x;NK.y=z.y;
 const dE=Math.hypot(EXT[0]-z.x,EXT[1]-z.y),D=Math.max(Math.hypot(z.x,z.y),Math.hypot(WW-z.x,z.y),Math.hypot(z.x,WH-z.y),Math.hypot(WW-z.x,WH-z.y))+NK_SW_B;
 NK.v=Math.max(900,dE/NK_SW_ARR,D/NK_SW_MAX);NK.T=D/NK.v;
 NK.wiped=NK.t>=NK.T?1:0;NK.s2=NK.t>.5?1:0;if(NK.wiped)nukeWipe()}
// distrugge all'istante ogni ostacolo distruttibile (senza passare da dirtyObs: ogni client lo fa da sé)
function nukeWipe(){for(const o of M.obs)if(!o.dead&&!o.ind){o.hp=0;o.dead=1}for(let i=0;i<CIV.n;i++)if(!CIV.d[i])CIV.d[i]=3;for(let i=0;i<SKY.n;i++)skyKill(i,null,1,1);navBuild()}
// il fronte dell'onda spazza ciò che raggiunge: ostacoli, auto, macchine volanti, nemici (esplosioni solo per ciò che è a schermo)
function nukeSweep(R){const R2=R*R,x=NK.x,y=NK.y,vx0=camX-100,vy0=camY-100,vx1=camX+W/zoom+100,vy1=camY+H/zoom+100,vis=(a,b)=>a>vx0&&a<vx1&&b>vy0&&b<vy1;
 for(const o of M.obs){if(o.dead||o.ind)continue;const dx=o.x-x,dy=o.y-y;if(dx*dx+dy*dy>=R2)continue;o.hp=0;o.dead=1;if(vis(o.x,o.y))fxBoom(o.x,o.y,o.t=='b'?'struct':'tree',o.t=='b'?Math.min(90,Math.max(FXS,o.r*.9)):FXS*.8)}
 for(let i=0;i<CIV.n;i++){if(CIV.d[i])continue;const dx=CIV.X[i]-x,dy=CIV.Y[i]-y;if(dx*dx+dy*dy<R2)CIV.d[i]=3}
 for(let i=0;i<SKY.n;i++){if(SKY.D[i])continue;const dx=SKY.X[i]-x,dy=SKY.Y[i]-y;if(dx*dx+dy*dy<R2)skyKill(i,null,1,!vis(SKY.X[i],SKY.Y[i]))}
 if(authority())for(const u of units){if(u.dead)continue;const dx=u.x-x,dy=u.y-y;if(dx*dx+dy*dy<R2){u.hp=0;u.dead=1;u.kb=-1}}}
function nukeTick(dt){if(!NK.on)return;NK.t+=dt;const t=NK.t,R=NK.v*t;
 // suoni solo quando il fronte raggiunge il giocatore (ear), non al lampo iniziale
 if(!NK.s1&&R>=Math.hypot(NK.x-ear.x,NK.y-ear.y)){NK.s1=1;NK.s1t=t;sfx(SFX_LIST.nuke,1)}
 if(NK.s1&&!NK.s2&&t>=NK.s1t+1.5){NK.s2=1;sfx(SFX_LIST.crash,1)}
 if(NK.wiped)return;nukeSweep(R);
 if(t<NK.T)return;NK.wiped=1;nukeWipe();                         // l'onda ha coperto tutta la mappa
 if(authority())for(const u of units){u.hp=0;u.dead=1;u.kb=-1}
 if(!G.ext){P.hp=0;for(const q of Object.values(others))q.hp=0;if(authority())finish(1,'Esplosione nucleare: missione fallita')}}   // chi non è in estrazione muore
function shipBegin(){const o=MD.ship;if(!o||SH.on)return;Object.assign(SH,{on:1,t:0,o,x:o.x,y:o.y,a:o.a});sfxAt(SFX_LIST.toAir,.9,o.x,o.y,0)}
function shipTick(dt){if(!SH.on)return;SH.t+=dt;const o=SH.o,t=SH.t;
 if(t<SH_LIFT+3&&Math.random()<.9){const a=Math.random()*TAU,d=60+Math.random()*180;fxSpawn(o.x+Math.cos(a)*d,o.y+Math.sin(a)*d,'#c9b99a',3,true,50)}   // polvere dei motori
 if(t>=SH_LIFT&&!o.dead){o.dead=1;navRefresh(o);sfxAt(SFX_LIST.toAir,1,o.x,o.y,0)}   // lo scafo sparisce (non collide più) e da qui lo disegna drawShip
 if(t>=SH_LIFT+SH_FLY)SH.on=0}

const regione=(x,y)=>{const v=y<WH/3?'nord':y>WH*2/3?'sud':'',h=x<WW/3?'ovest':x>WW*2/3?'est':'';return v&&h?v+'-'+h:v||h||'centro'};

// nave della flotta (missione 11): scafo come le navi della mappa; null se non sta tutta in acqua libera (niente moli, rocce, altre navi entro 30 px)
function fleetFit(x,y,L,B,a){const g=bgeomEx('ship',L,B),hp=Math.round(SPEC.ship*Math.max(.7,Math.sqrt(L*B)/110)),
  o={t:'b',ty:'ship',shape:'ship',x,y,w:L,h:B,a,c:Math.cos(a),s:Math.sin(a),r:g.r,pr:g.pr,an:g.an,hp,m:hp,sp:1,pal:0,v:2},pts=[];
 for(let u=-L/2;u<=L/2;u+=Math.max(18,L/14))for(let v=-B/2;v<=B/2;v+=Math.max(14,B/5)){if(bsd(o,u,v)>2)continue;const w=toWorld(o,u,v);if(w[0]<40||w[1]<40||w[0]>WW-40||w[1]>WH-40||!inWater(w[0],w[1],0))return null;pts.push(w)}
 for(const b of qobs(x,y,o.r+120,[])){if(b.t=='t'||b.dead)continue;for(const w of pts){const l=toLocal(b,w[0],w[1]);if(bsd(b,l[0],l[1])<30)return null}}
 return o}
// ===== parte fissa =====
function missionStatic(){
 const sites=M.sites,blds=M.blds;let MR=rng(M.seed+7919);const mr=(a,b)=>a+MR()*(b-a),shuf=a=>a.map(o=>[MR(),o]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]);
 MD={blk:[],tg:[],z:[],wp:[]};BAR=[];G.mt=0;
 if(G.mode==1){return}
 // caserme: la difficoltà ne decide il numero; stanno nei recinti murati (poi negli edifici grandi lontani dalla partenza)
 const nb=diffBars(G.diff),mkBar=o=>{o.bar=1;o.pal=PAL_BAR;o.hp=o.m=Math.round(o.hp*BAR_HP);o.barTimer=BAR_T;BAR.push(o)},cands=shuf(M.comp.filter(c=>c.bar).map(c=>c.bar));
 if(xMG(M.th))for(const o of shuf(M.blds.filter(o=>o.lift&&!o.dead&&dSt(o)>SAFE_R))){if(BAR.length>=nb)break;if(BAR.every(b=>Math.hypot(o.x-b.x,o.y-b.y)>1200))mkBar(o)}   // megastruttura: le caserme sono gli ascensori in fondo ai corridoi
 for(const o of cands){if(BAR.length>=nb)break;if(BAR.every(b=>Math.hypot(o.x-b.x,o.y-b.y)>1200))mkBar(o)}
 for(const o of cands){if(BAR.length>=nb)break;if(!o.bar)mkBar(o)}
 for(const o of shuf(blds.filter(o=>!o.bar&&dSt(o)>SAFE_R&&o.w>=150&&o.h>=150&&!o.is&&o.ty=='house'))){if(BAR.length>=nb)break;if(BAR.every(b=>Math.hypot(o.x-b.x,o.y-b.y)>1600))mkBar(o)}
 const fr=blds.filter(o=>!o.bar&&o.ty=='house'),towns=sites.filter(s=>isTown(s)&&dSt(s)>2000),sel=MR();
 MD.wp=towns.map(s=>[s.x,s.y]);
 const mkBlk=(x,y,a,w,h,hp)=>{const g=bgeom('rect',w,h),o={t:'b',ty:'house',shape:'rect',x,y,w,h,a,c:Math.cos(a),s:Math.sin(a),r:g.r,pr:g.pr,an:g.an,hp,m:hp,pal:PAL_BLK,rb:1,dec:[0,0],rf:0};o.id=M.obs.length;M.obs.push(o);gAdd(o);return o};
 const B={
  1:()=>{const E=M.links.filter(r=>r.lk&&sites.includes(r.lk[0])&&sites.includes(r.lk[1])&&r.lk[0].k!='c'&&r.lk[1].k!='c'),cands=[];
   const walk=(T,node,segs,L,used)=>{for(const e of E){const fw=e.lk[0]===node,bw=e.lk[1]===node;if(!fw&&!bw||segs.some(s=>s.e===e))continue;const nx=fw?e.lk[1]:e.lk[0],nl=L+plen(e.pts);if(nl>4500||used.has(nx))continue;
     const sg=segs.concat([{e,rev:!fw}]);if(isTown(nx)){const q=fw?e.pts[e.pts.length-1]:e.pts[0];if(nl>=1200&&dSt({x:q[0],y:q[1]})>OBJ_MIN)cands.push({sg,L:nl})}else if(sg.length<4){used.add(nx);walk(T,nx,sg,nl,used);used.delete(nx)}}};
   for(const T of sites)if(isTown(T)&&dSt(T)>1500)walk(T,T,[],0,new Set([T]));
   if(!cands.length)return false;const c=shuf(cands)[0],pts=[],sg=[];
   for(const s of c.sg){const q=s.e.pts.map(a=>a.slice());if(s.rev)q.reverse();const i0=pts.length;for(const a of q){if(pts.length&&Math.hypot(a[0]-pts[pts.length-1][0],a[1]-pts[pts.length-1][1])<2)continue;pts.push(a)}sg.push({i0,i1:pts.length-1,w:s.e.w})}
   if(dSt({x:pts[0][0],y:pts[0][1]})<1500||dSt({x:pts[pts.length-1][0],y:pts[pts.length-1][1]})<=OBJ_MIN)return false;
   MD.pts=pts;MD.sg=sg;MD.cl=[0];for(let i=1;i<pts.length;i++)MD.cl.push(MD.cl[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));MD.len=MD.cl[pts.length-1];
   for(const f of[.3,.55,.78]){const q=pathAt(MD.len*f),b=mkBlk(q.x,q.y,q.h,26,wAt(MD.len*f)+50,400);b.ps=MD.len*f;MD.blk.push(b)}
   return true},
  2:()=>{const c=shuf(fr.filter(o=>(o.tw||o.is)&&dSt(o)>OBJ_MIN));if(!c.length)return false;const o=c[0];o.vipB=1;o.pal=PAL_VIP;o.hp=o.m=100000;MD.vb=o;MD.d0=Math.hypot(o.x-EXT[0],o.y-EXT[1]);return true},
  3:()=>{const pool=shuf(fr.filter(o=>o.tw&&dSt(o)>OBJ_MIN&&o.w>=150&&o.h>=150)),pick=[];
   for(const o of pool){if(pick.length>=3)break;if(pick.every(p=>Math.hypot(o.x-p.x,o.y-p.y)>900))pick.push(o)}
   if(pick.length<3)return false;const kinds=['plant','radar','tank'];pick.forEach((o,i)=>{o.tg=kinds[i];o.pal=PAL_PLANT+i;o.hp=o.m=Math.round(o.hp*1.5)});MD.tg=pick;return true},
  4:()=>MD.wp.length>=2,
  5:()=>{for(const s of shuf(towns)){if(MD.z.length>=2)break;if(MD.z.some(z=>Math.hypot(z.x-s.x,z.y-s.y)<1200))continue;
    const kp=(M.keep||[]).find(k=>k.s===s.id);for(let tr=0;tr<200;tr++){const a=MR()*TAU,d=tr<40?0:mr(0,380),x=kp&&!tr?kp.x:s.x+Math.cos(a)*d,y=kp&&!tr?kp.y:s.y+Math.sin(a)*d;
     if(dSt({x,y})>OBJ_MIN&&!inWater(x,y,KOTH_R+40)&&M.obs.every(o=>Math.hypot(x-o.x,y-o.y)>o.r+KOTH_R*.6)&&!M.bridges.some(b=>Math.hypot(x-b.x,y-b.y)<b.L/2+KOTH_R)){MD.z.push({x,y,r:KOTH_R,p:0});break}}}
   return MD.z.length>=2},
  6:()=>{const c=shuf(sites.filter(q=>(q.k=='n'||q.k=='k')&&dSt(q)>OBJ_MIN));if(!c.length)return false;MD.z=[zoneAt(c[0])];MD.sk=c[0].k;return true},   // un solo sito nucleare a caso: silos ICBM ('n') o centrale ('k')
  7:()=>{const pl=sites.find(q=>q.k=='k'&&dSt(q)>OBJ_MIN)||sites.find(q=>q.k=='i'&&dSt(q)>OBJ_MIN)||sites.find(q=>q.k=='c'&&dSt(q)>OBJ_MIN),yd=sites.find(q=>q.k=='y'&&dSt(q)>OBJ_MIN),sh=M.obs.find(o=>o.shape=='cruiser');
   if(!pl||!yd||!sh)return false;MD.z=[zoneAt(pl),zoneAt(yd)];MD.ship=sh;EXT[0]=sh.x;EXT[1]=sh.y;return true},
  8:()=>{const c=shuf(fr.filter(o=>dSt(o)>OBJ_MIN&&o.w>=150&&o.h>=150&&!o.is&&!o.tw&&o.x>700&&o.x<WW-700&&seaU(o.x,o.y)<SEA-700&&o.y>700&&o.y<WH-700&&!inWater(o.x,o.y,o.r)));if(!c.length)return false;   // edificio del meeting: grande, lontano dalla partenza e dai bordi
   const o=c[0];o.vipB=1;o.pal=PAL_VIP;o.hp=o.m=Math.round(o.hp*SEC_BHP);MD.mb=o;MD.bt={x:o.x,y:o.y,hp:o.hp,z:0,rr:o.r,bld:1};   // bt = bersaglio per l'AI nemica
   MD.z=[{x:o.x,y:o.y,r:o.r+130,p:0}];return true},   // zona di cattura attorno all'edificio
  9:()=>{const pool=fr.filter(o=>dSt(o)>OBJ_MIN&&o.w>=150&&o.h>=150&&!o.is&&!o.tw&&o.x>900&&o.x<WW-900&&seaU(o.x,o.y)<SEA-900&&o.y>900&&o.y<WH-900&&!inWater(o.x,o.y,o.r)).sort((p,q)=>q.w*q.h-p.w*p.h).slice(0,8);   // i più grandi
   for(const o of shuf(pool)){const a0=MR()*TAU,zs=[];
    for(let i=0;i<4;i++){const a=a0+i*TAU/4;let ok=false;   // un punto per quadrante: la torretta sta al centro della sua zona
     for(let d=o.r+TD_ZONE_R+40;d<=o.r+TD_TUR_D+380&&!ok;d+=25)for(const da of[0,.2,-.2,.4,-.4,.6,-.6]){const x=o.x+Math.cos(a+da)*d,y=o.y+Math.sin(a+da)*d;   // dal più vicino al più lontano, con piccole deviazioni d'angolo
      if(x>150&&y>150&&x<WW-60&&seaU(x,y)<SEA-250&&y<WH-150&&clearAt(x,y,TD_ZONE_R*.6)&&!inWater(x,y,TD_ZONE_R*.6+30)&&!M.bridges.some(b=>Math.hypot(x-b.x,y-b.y)<b.L/2+TD_ZONE_R)&&zs.every(z=>Math.hypot(x-z.x,y-z.y)>TD_ZONE_R*2+60)){zs.push({x,y,r:TD_ZONE_R,p:0,on:0});ok=true;break}}}
    if(zs.length<4)continue;   // non c'è spazio per tutte e 4: si prova un altro edificio
    o.vipB=1;o.pal=PAL_VIP;o.hp=o.m=Math.round(o.hp*TD_BHP);MD.mb=o;MD.bt={x:o.x,y:o.y,hp:o.hp,z:0,rr:o.r,bld:1};MD.z=zs;return true}
   return false},   // difesa della base: edificio centrale + 4 zone delle torrette
  10:()=>{const c=shuf(sites.filter(q=>['g','r','l','i','c','v'].includes(q.k)&&dSt(q)>OBJ_MIN));if(!c.length)return false;
   const CR=180;                         // raggio dell'area di schianto (in MD.crash.r)
   const CRm=CR+20;                      // margine minimo dal bordo mappa perché il cerchio ci stia tutto
   let best=null;
   for(const s of c){const kp=(M.keep||[]).find(k=>k.s===s.id);for(let tr=0;tr<200&&!best;tr++){const a=MR()*TAU,d=tr<40?0:mr(200,800),x=kp&&!tr?kp.x:s.x+Math.cos(a)*d,y=kp&&!tr?kp.y:s.y+Math.sin(a)*d;
    if(dSt({x,y})>OBJ_MIN
     &&x>CRm&&x<WW-CRm&&y>CRm&&y<WH-CRm     // tutto il cerchio dentro i bordi del mondo
     // niente più !inWater: lo schianto può cadere in mare/lago/fiume
     &&M.obs.every(o=>Math.hypot(x-o.x,y-o.y)>o.r+CR+40)
     &&!M.bridges.some(b=>Math.hypot(x-b.x,y-b.y)<b.L/2+CR+40)
     &&!onRoad(x,y,CR-60))best={x,y}}}
   if(!best)return false;
   const wet=inWater(best.x,best.y,0);           // schianto in acqua?
   MD.crash={x:best.x,y:best.y,a:MR()*TAU,r:CR,seen:0,wet:wet?1:0};
   MD.vipsPos=[];
   const vipR=wet?260:130;                        // se il crash è in acqua i VIP (su terra asciutta) possono stare più lontani
   for(let i=0;i<3;i++){let found=false;
    for(let tr=0;tr<80;tr++){const a=(i/3)*TAU+MR()*.6,d=60+MR()*(vipR-60),x=best.x+Math.cos(a)*d,y=best.y+Math.sin(a)*d;
     if(x>40&&x<WW-40&&y>40&&y<WH-40   // VIP feriti lontani dai bordi
      &&clearAt(x,y,20)&&!onRoad(x,y,10)&&!inWater(x,y,40)){MD.vipsPos.push({x,y,h:MR()*TAU});found=true;break}}
    if(!found)return false}   // nessun posto asciutto vicino → questo schianto non va bene, prova altrove
   return true},   // ricerca e recupero: relitto da trovare + 3 VIP feriti da scortare
  11:()=>{const N=FLEET_N,pick=[],made=[],inSea=(x,y)=>seaU(x,y)>coastV(seaV(x,y))-10&&inWater(x,y,0),spread=(o,g)=>pick.every(p=>Math.hypot(o.x-p.x,o.y-p.y)>g);
   // 1) navi già in mare (non nei laghi), lontane dalla partenza e distanziate fra loro
   const pool=shuf(M.obs.filter(o=>o.shape=='ship'&&!o.dead&&dSt(o)>OBJ_MIN&&inSea(o.x,o.y)));
   for(const g of[FLEET_GAP,FLEET_GAP/2])for(const o of pool){if(pick.length>=N)break;if(pick.indexOf(o)<0&&spread(o,g))pick.push(o)}
   // 2) mancano navi (mappa selvaggia, mare stretto): se ne varano di nuove nel mare libero, parallele alla costa o di traverso
   for(let tr=0;pick.length<N&&tr<1500;tr++){const L=mr(260,360),B=mr(66,86),v=mr(300,WH-300),along=tr%3!=0,half=along?B/2:L/2,u0=coastV(v)+half+40,u1=WW-half-40;if(u0>u1)continue;
    const a=SIDE*Math.PI/2+(along?(MR()<.5?1:-1)*Math.PI/2:0)+mr(-.25,.25),q=fromUV(mr(u0,u1),v),o=fleetFit(q[0],q[1],L,B,a);
    if(!o||dSt(o)<=OBJ_MIN||!spread(o,tr<900?FLEET_GAP:FLEET_GAP/2))continue;
    o.id=M.obs.length;M.obs.push(o);gAdd(o);made.push(o);pick.push(o)}
   if(pick.length<N){for(const o of made)o.dead=1;return false}   // mare inservibile: si cambia mappa
   pick.sort((p,q)=>seaV(p.x,p.y)-seaV(q.x,q.y));   // numerate lungo la costa
   for(const o of pick){o.fleet=1;o.v=2}MD.fleet=pick;return true}};   // affonda la flotta: 3 navi da guerra nemiche in mare
 // la missione è decisa in startGame (G.want); l'ordine di ripiego serve solo se nemmeno 50 mappe diverse la rendono possibile
 const want=G.want!=null?G.want:G.sel,first=want<0?0:want>0?want:1+(sel*MIS_N|0),order=want<0?[]:[first,...Array.from({length:MIS_N},(_,i)=>i+1).filter(x=>x!=first)];
 let t=0;
 for(const k of order){MR=rng(M.seed+7919+k*131);if(B[k]()){t=k;break}MD={blk:[],tg:[],z:[],wp:MD.wp}} // se la missione estratta non è realizzabile su questa mappa si prova la successiva
 G.mt=t;navBuild()}

// ===== parte dinamica (host): nemici di missione =====
function missionSpawn(){
 for(const o of BAR)o.barTimer=BAR_T;
 MS={t:G.mt,st:0,al:null,sp:0,wt:2,cz:0,rc:0,hv:null,lx:0,ly:0,hh:0,ex:0,exMsg:'',nk:0,nt:0,vans:[],vips:[],sf:0,ls:0,dp:0,cap:0,cy:0,ct:0,wd:0,vd:0,wst:0,ta:0,tt:0,tw:0,tn:0};   // ta: tempo partito · tt: secondi trascorsi · tw: attesa prossima ondata · tn: sequenza nucleare
 if(!G.mt)return;
 const far=(x,y)=>Math.hypot(x-START[0],y-START[1])>900;
 const put=(k,cx,cy,d0,d1,g)=>{for(let tr=0;tr<120;tr++){const a=Math.random()*TAU,d=rnd(d0,d1+tr*5),x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d;
   if(far(x,y)&&x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60&&clearAt(x,y,k==0||k==6?30:22)){const t=mkUnit(k,x,y,g);t.ms=1;return t}}return null};
 const squad=(cx,cy,n,d0,d1,sleep)=>{const g=GID++;for(let i=0;i<n;i++){const t=put(1,cx,cy,d0,d1,g);if(t&&sleep)t.slp=1}};   // sleep = imboscata
 const al=(x,y,hp,dr,rr0,h)=>({id:-1,al:1,z:0,x,y,vx:0,vy:0,hp,mhp:hp,drG:dr,rr:rr0,on:0,h});
 if(G.mt==1){const L=MD.len,q0=pathAt(0);MS.al=al(q0.x,q0.y,CONV_HP,2,30,q0.h);MS.al.s=0;MS.al.go=0;MS.al.hold=0;
  for(const f of[.2,.45,.7,.9]){const q=pathAt(L*f),w=wAt(L*f),sd=Math.random()<.5?-1:1;squad(q.x+Math.cos(q.h+1.5708)*sd*(w/2+150),q.y+Math.sin(q.h+1.5708)*sd*(w/2+150),2,0,90,true)}
  for(const f of[.15,.4,.62,.82]){const q=pathAt(L*f),w=wAt(L*f),sd=Math.random()<.5?-1:1;put(0,q.x+Math.cos(q.h+1.5708)*sd*(w/2+260),q.y+Math.sin(q.h+1.5708)*sd*(w/2+260),0,60,-1)}}
 else if(G.mt==2){const b=MD.vb;MS.al=al(b.x,b.y,VIP_HP,0,16,0);MS.al.st=0;
  for(let i=0;i<2;i++)put(0,b.x,b.y,b.r+110,b.r+230,-1);squad(b.x,b.y,3,b.r+90,b.r+220,false)}
 else if(G.mt==3){for(const o of MD.tg){put(0,o.x,o.y,o.r+110,o.r+230,-1);squad(o.x,o.y,2,o.r+90,o.r+220,false)}}
 else if(G.mt==4){let h=null;const w0=Math.random()*MD.wp.length|0;
  for(let k=0;k<MD.wp.length&&!h;k++){const w=MD.wp[(w0+k)%MD.wp.length];if(Math.hypot(w[0]-START[0],w[1]-START[1])>OBJ_MIN+260)h=put(6,w[0],w[1],0,260,GID++)}
  for(let tr=0;tr<800&&!h;tr++){const[x,y]=landXY(Math.random,500,300,300);if(dSt({x,y})>OBJ_MIN&&clearAt(x,y,30)){h=mkUnit(6,x,y,GID++);h.ms=1}}
  if(h){h.ar=14;h.shs=Array(4).fill(0);h.sg=0;h.rg=REGEN*3;h.revive=[0];h.wi=(w0+1)%MD.wp.length;MS.hv=h;MS.lx=h.x;MS.ly=h.y;MS.hh=h.hp;squad(h.x,h.y,2,90,170,false)}}
 else if(G.mt==8)secSpawn()
 else if(G.mt==9)tdSpawn()
 else if(G.mt==10){for(const p of MD.vipsPos){MS.vips.push({id:-20-MS.vips.length,n:MS.vips.length+1,al:1,z:0,x:p.x,y:p.y,h:p.h,vx:0,vy:0,hp:VIP_HP,mhp:VIP_HP,rr:16,on:0,saved:0,dead:0,rv:0,st:0,burn:0})}}
 else if(G.mt==11){for(const o of MD.fleet){if(o.dead)continue;   // ogni nave: l'unità che ne comanda le torrette, un jet di scorta sopra e un presidio sulla costa più vicina
  const u=mkUnit(UK_SHIP,o.x,o.y,-1);u.ms=1;u.h=u.thr=u.thr2=u.thr3=o.a;shipLink(u);
  mkUnit(2,o.x,o.y,GID++).ms=1;
  const v=seaV(o.x,o.y),c=fromUV(coastV(v)-260,v);put(0,c[0],c[1],0,220,-1);squad(c[0],c[1],2,60,240,false)}}}

function getRandomEnemyType(){const k=enemyType0();return M.hi&&UT[k].fly?(Math.random()<.5?1:UK_SWD):k}   // interni: niente volanti
function enemyType0(){
 const r=Math.random();
 if(r<.37)return 1;          // 37% - Mech standard
 if(r<.45)return UK_APC;     //  8% - APC
 if(r<.55)return 8;          // 10% - Swordman
 if(r<.65)return 3;          // 10% - Kamikaze
 if(r<.75)return 2;          // 10% - Jet volanti
 if(r<.90)return 4;          // 15% - Cecchini
 return G.diff>=4?5:1;       // 10% - Carro pesante (se difficoltà >= 4) o Mech
}

function kothWave(z){const g=GID++;let c=0;
 for(let tr=0;c<KOTH_N&&tr<200;tr++){const a=Math.random()*TAU,d=rnd(750,1050),x=z.x+Math.cos(a)*d,y=z.y+Math.sin(a)*d,k=getRandomEnemyType();
  if(x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60&&((k==2||k==3)||clearAt(x,y,k==5?40:22))){mkUnit(k,x,y,g).ms=1;c++}}
 announce('Ondata di nemici in arrivo!')}
 
// ===== missione 8: guardia di sicurezza =====
// Fase 1: raggiungere e presidiare l'edificio del meeting (nessun nemico). Fase 2: ogni SEC_GAP s parte un ciclo: SEC_WAVES ondate nemiche a SEC_SPAWN_D dall'edificio,
// poi (a SEC_LEAD s) un furgone blindato con un VIP che guida fino all'edificio (se lo tocca, il VIP è salvo). Le guardie alleate (units con sec=1) non rinascono.
const secFoes=()=>units.filter(u=>!u.dead&&!u.sec&&u.k<UK_HUM);
function secSpawn(){units.length=0;PQ.length=0;G.cap=0;secNavBuild();   // niente nemici all'inizio (e niente caserme: vedi missionTick)
 const b=MD.mb,g=GID++,kinds=[1,1,1,4,5,0,0],d1=Math.max(SEC_ALLY_D,b.r+120);
 for(let i=0;i<SEC_ALLY_N;i++){const k=kinds[i%kinds.length];
  for(let tr=0;tr<250;tr++){const a=Math.random()*TAU,d=rnd(b.r+50,d1),x=b.x+Math.cos(a)*d,y=b.y+Math.sin(a)*d;
   if(x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60&&clearAt(x,y,k==5?40:k==0?30:22)){const u=mkUnit(k,x,y,g);u.sec=1;u.ms=1;u.hp=u.mhp=Math.round(u.hp*1.3);u.ar=(k==0?0:6);break}}}}
// il punto è libero e da lì (senza alberi/rocce di mezzo) si arriva a piedi fino all'edificio? (evita nemici incastrati subito dopo la nascita)
function secReach(x,y){if(NAVV[ncell(x,y)])return false;const p=secPath(x,y),l=p[p.length-1],b=MD.mb;return Math.hypot(l[0]-b.x,l[1]-b.y)<b.r+350}
// nemico d'assalto incastrato da troppo tempo (terreno, rocce): riappare più vicino all'edificio su un punto libero
function secUnstick(u){const b=MD.mb;for(let tr=0;tr<40;tr++){const a=Math.atan2(u.y-b.y,u.x-b.x)+rnd(-.6,.6),d=rnd(Math.max(b.r+350,SEC_SPAWN_D*.45),SEC_SPAWN_D*.75),x=b.x+Math.cos(a)*d,y=b.y+Math.sin(a)*d;
  if(x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60&&clearAt(x,y,u.k==5?40:22)&&secReach(x,y)){u.x=x;u.y=y;u.stk=0;u.rp=0;u.bo=null;u.path=null;u.pt=0;fxSpawn(x,y,'#ff9a3a',8,true);return}}}
// punto di nascita valido per il tipo k, a partire dalla direzione a0: se non si trova, allarga angolo e distanza e poi rilassa i requisiti. Il tipo NON cambia mai.
function secSpot(k,a0){const b=MD.mb,fly=k==2||k==3,r=k==5?40:22;
 for(let tr=0;tr<450;tr++){const f=tr/450,
   a=a0+rnd(-.5,.5)*(1+f*11),                        // da ±0,5 rad fino al cerchio intero
   d=SEC_SPAWN_D*rnd(.94-f*.4,1.06+f*.2),            // da ±6% fino a 0,54–1,26 volte la distanza standard
   x=b.x+Math.cos(a)*d,y=b.y+Math.sin(a)*d;
  if(!(x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60))continue;
  if(fly)return{x,y,a};
  if(tr<150?(clearAt(x,y,r)&&secReach(x,y)):tr<300?clearAt(x,y,r):!inWater(x,y,r))return{x,y,a}}   // 1) libero e raggiungibile  2) solo libero (secUnstick penserà al resto)  3) almeno non in acqua
 return null}
function secWave(){const b=MD.mb,g=GID++;let c=0;
 const pr=secSpot(1,Math.random()*TAU),a0=pr?pr.a:Math.random()*TAU;   // direzione dell'ondata: scelta su un punto valido per i mezzi di terra, così l'ondata resta compatta
 for(let i=0;i<SEC_WAVE_N;i++){const k=getRandomEnemyType(),s=secSpot(k,a0);   // tipo estratto una sola volta: le percentuali di getRandomEnemyType restano intatte
  if(!s)continue;
  const u=mkUnit(k,s.x,s.y,g);u.ms=1;u.aw=1;u.st=2;u.lkx=b.x;u.lky=b.y;u.lkt=LOST_T;c++;fxSpawn(s.x,s.y,'#ff9a3a',10,true)}
 if(c)announce('Ondata di nemici in arrivo!')}
function secVan(){const b=MD.mb;let best=null;
 for(let tr=0;tr<24&&!best;tr++){const a=Math.random()*TAU,x=b.x+Math.cos(a)*SEC_VAN_D,y=b.y+Math.sin(a)*SEC_VAN_D;
  if(x<150||y<150||x>WW-150||seaU(x,y)>SEA-250||y>WH-150||dSt({x,y})<600||!clearAt(x,y,30))continue;
  if(NAVV[ncell(x,y)])continue;const p=secPath(x,y),l=p[p.length-1];if(Math.hypot(l[0]-b.x,l[1]-b.y)<b.r+280)best={x,y,p}}   // si parte solo da punti da cui un percorso arriva fino all'edificio
 if(!best){const a=Math.random()*TAU;best={x:clamp(b.x+Math.cos(a)*SEC_VAN_D*.6,150,WW-150),y:clamp(b.y+Math.sin(a)*SEC_VAN_D*.6,150,WH-150),p:null}}
 MS.dp++;MS.vans.push({id:-10-MS.dp,n:MS.dp,al:1,van:1,z:0,x:best.x,y:best.y,vx:0,vy:0,hp:SEC_VAN_HP,mhp:SEC_VAN_HP,drG:3,rr:26,on:1,h:Math.atan2(b.y-best.y,b.x-best.x),path:best.p,pi:0,pt:best.p?3:0});
 announce('VIP '+MS.dp+'/'+SEC_VIP_N+' in arrivo: proteggi il furgone!')}
let NAVV=null;   // griglia di navigazione dei furgoni: come quella dei nemici ma con in più alberi e rocce (che i mech scavalcano, i furgoni no)
function secNavBuild(){NAVV=Uint8Array.from(nav);for(const o of M.obs){if(o.dead||!(o.t=='t'||o.ty=='rock'))continue;const rr=o.r+34,x0=clamp((o.x-rr)/NC|0,0,NW-1),x1=clamp((o.x+rr)/NC|0,0,NW-1),y0=clamp((o.y-rr)/NC|0,0,NH-1),y1=clamp((o.y+rr)/NC|0,0,NH-1);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(Math.hypot(x*NC+NC/2-o.x,y*NC+NC/2-o.y)<rr+NC*.35)NAVV[y*NW+x]=1}}
function secPath(x,y){const b=MD.mb,o=nav;nav=NAVV||nav;try{return navPath(x,y,b.x,b.y)}finally{nav=o}}
// ===== movimento dei VIP (missioni 2 e 10): percorso A*, sblocco e teletrasporto =====
const VIP_TP_NEAR=550,VIP_TP_FAR=1000,VIP_STUCK=2;   // teletrasporto se incastrato ≥3 s e oltre NEAR px dal giocatore, o ≥6 s ovunque, o SEMPRE oltre FAR px; dopo VIP_STUCK s di incastro attraversa gli ostacoli
let NAVP=null;   // griglia dei VIP: come quella dei nemici, ma il fiume si guada (lentamente); laghi e mare no; alberi e rocce bloccano
function vipNavBuild(){if(!nav||!navW)return;NAVP=new Uint8Array(NW*NH);
 for(let i=0;i<NAVP.length;i++){const cx=(i%NW)*NC+NC/2,cy=(i/NW|0)*NC+NC/2;NAVP[i]=navW[i]?((M.RV&&riverCell(cx,cy))?cellObs(i):1):nav[i]}
 for(const o of M.obs){if(o.dead||!(o.t=='t'||o.ty=='rock'))continue;const rr=o.r+26,x0=clamp((o.x-rr)/NC|0,0,NW-1),x1=clamp((o.x+rr)/NC|0,0,NW-1),y0=clamp((o.y-rr)/NC|0,0,NH-1),y1=clamp((o.y+rr)/NC|0,0,NH-1);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(Math.hypot(x*NC+NC/2-o.x,y*NC+NC/2-o.y)<rr+NC*.35)NAVP[y*NW+x]=1}
 NAVP.m=M;NAVP.t=performance.now()}                  // si ricostruisce ogni 15 s (edifici e alberi distrutti) e a ogni nuova mappa
// punti di passaggio verso (gx,gy); null = linea libera, si va dritti
function vipPath(x,y,gx,gy){if(!nav)return null;if(!NAVP||NAVP.m!==M||performance.now()-NAVP.t>15000)vipNavBuild();if(!NAVP)return null;
 const o=nav;nav=NAVP;try{return(navLos(x,y,gx,gy)&&!losBlocker(x,y,gx,gy,0))?null:navPath(x,y,gx,gy)}finally{nav=o}}
// riappare vicino al giocatore, dal lato da cui stava arrivando, su un punto libero e raggiungibile
function vipTeleport(v,T){const base=Math.atan2(v.y-T.y,v.x-T.x);
 for(let tr=0;tr<40;tr++){const a=base+rnd(-1.2,1.2)*(1+tr/20),d=rnd(MELEE_R+50,MELEE_R+170),x=T.x+Math.cos(a)*d,y=T.y+Math.sin(a)*d;
  if(x<60||y<60||x>WW-60||y>WH-60||inWater(x,y,(v.rr||16)+10)||!clearAt(x,y,(v.rr||16)+8)||(NAVP&&NAVP[ncell(x,y)]))continue;
  fxSpawn(v.x,v.y,'#8fe3ff',10,true,40);v.x=x;v.y=y;v.path=null;v.pi=0;v.stk=0;v.sk=0;v.lx=x;v.ly=y;v.gh=0;v.pt=0;v.tc=2;
  fxSpawn(x,y,'#8fe3ff',12,true,45);sfxAt(SFX_LIST.toGrunt,.7,x,y,0);return true}
 return false}
// muove il VIP verso (tx,ty); T = giocatore da seguire (serve al teletrasporto)
function vipMove(v,tx,ty,T,dt){
 v.pt=(v.pt==null?(v.n||1)*.17:v.pt)-dt;   // i VIP non ricalcolano il percorso tutti nello stesso fotogramma
 if(v.pt<=0){v.pt=.5;v.path=vipPath(v.x,v.y,tx,ty);v.pi=0}
 if(v.gh>0)v.gh-=dt;
 let wx=tx,wy=ty;
 if(v.path){const p=v.path;while(v.pi<p.length-1&&Math.hypot(p[v.pi][0]-v.x,p[v.pi][1]-v.y)<45)v.pi++;
  if(v.pi<p.length-1||Math.hypot(p[v.pi][0]-v.x,p[v.pi][1]-v.y)>=45){wx=p[v.pi][0];wy=p[v.pi][1]}}   // ultimo punto raggiunto: ultimo tratto dritto verso la meta
 const dx=wx-v.x,dy=wy-v.y,d=Math.hypot(dx,dy)||1;
 if(d>6){const sp=VIP_V*(inWater(v.x,v.y,0)&&!onBridge(v.x,v.y)?WATER_SLOW:1),st=Math.min(d,sp*dt);
  v.vx=dx/d*sp;v.vy=dy/d*sp;v.x+=dx/d*st;v.y+=dy/d*st;v.h=Math.atan2(dy,dx);
  if(!(v.gh>0))push(v,(v.rr||16)-2,1)}
 // incastro: ogni secondo controlla se si è mosso davvero
 v.sk=(v.sk||0)+dt;v.tc=Math.max(0,(v.tc||0)-dt);
 if(v.sk>=1){const mv=Math.hypot(v.x-(v.lx==null?-1e4:v.lx),v.y-(v.ly==null?-1e4:v.ly));
  if(Math.hypot(tx-v.x,ty-v.y)>90&&mv<20){v.stk=(v.stk||0)+1;v.pt=0}else v.stk=0;   // incastrato: nuovo percorso subito
  v.lx=v.x;v.ly=v.y;v.sk=0}
 if(v.stk>=VIP_STUCK&&!(v.gh>0))v.gh=2;   // incastrato da 2 s: per 2 s attraversa gli ostacoli (come i furgoni)
 const dT=Math.hypot(T.x-v.x,T.y-v.y);
 if(v.tc<=0&&(dT>VIP_TP_FAR||(v.stk>=3&&dT>VIP_TP_NEAR)||v.stk>=6))vipTeleport(v,T)}
function secTick(dt,pl){const m=MS,b=MD.mb,z=MD.z[0];
 if(b.dead){finish(1,'Edificio del meeting distrutto: missione fallita');return}
 if(!m.cap){const inside=pl.some(q=>!q.z&&Math.hypot(q.x-z.x,q.y-z.y)<z.r);z.p=clamp(z.p+(inside?dt/SEC_CAP_T:-dt/SEC_CAP_T*.5),0,1);
  if(z.p>=1){m.cap=1;m.cz=1;m.ct=-SEC_FIRST;m.wd=0;m.vd=0;announce('Zona conquistata! I VIP stanno per arrivare: difendi l’edificio.')}return}
 for(const u of units)if(u.aw&&!u.dead&&!u.z&&u.stk>25)secUnstick(u);
 if(m.sf>=SEC_SAFE)m.wst=1;   // abbastanza VIP al sicuro: niente più ondate né altri furgoni
 if(!m.wst){m.ct+=dt;
  const nw=m.dp>=SEC_VIP_LATE?SEC_WAVES_LATE:SEC_WAVES;
  while(m.wd<nw&&m.ct>=m.wd*SEC_WAVE_GAP){secWave();m.wd++}
  if(!m.vd&&m.ct>=SEC_LEAD){m.vd=1;secVan()}
  if(m.vd&&m.dp<SEC_VIP_N&&m.ct>=SEC_GAP){m.ct=0;m.wd=0;m.vd=0}}
 for(let i=m.vans.length-1;i>=0;i--){const v=m.vans[i];
  if(v.hp<=0){m.vans.splice(i,1);m.ls++;fxBoom(v.x,v.y,'unit',60);sfxAt(SFX_LIST.boom,1,v.x,v.y,0);announce('VIP perso! ('+m.ls+' su '+(SEC_FAIL+1)+' tollerati: al '+(SEC_FAIL+1)+'° la missione fallisce)');continue}
  const l=toLocal(b,v.x,v.y);if(bsd(b,l[0],l[1])<v.rr+26){m.vans.splice(i,1);m.sf++;fxSpawn(v.x,v.y,'#5ee0c0',18,true,45);sfxAt(SFX_LIST.toGrunt,.8,v.x,v.y,0);announce('VIP in salvo! ('+m.sf+'/'+SEC_VIP_N+')');continue}   // toccato l'edificio: il VIP è dentro e il furgone svanisce
  v.pt-=dt;if(v.pt<=0){v.pt=3;v.path=secPath(v.x,v.y);v.pi=0}
  let tx=b.x,ty=b.y;if(v.path){while(v.pi<v.path.length-1&&Math.hypot(v.path[v.pi][0]-v.x,v.path[v.pi][1]-v.y)<50)v.pi++;tx=v.path[v.pi][0];ty=v.path[v.pi][1]}
  const a=Math.atan2(ty-v.y,tx-v.x);v.vx=Math.cos(a)*SEC_VAN_V;v.vy=Math.sin(a)*SEC_VAN_V;v.x+=v.vx*dt;v.y+=v.vy*dt;v.h+=clamp(ad(a,v.h),-4*dt,4*dt);
  v.sk=(v.sk||0)+dt;if(v.sk>=1.5){if(Math.hypot(v.x-(v.lx==null?-1e4:v.lx),v.y-(v.ly==null?-1e4:v.ly))<30){v.pt=0;v.rs=(v.rs||0)+1;if(v.rs>=3){v.gh=3;v.rs=0}}else v.rs=0;v.lx=v.x;v.ly=v.y;v.sk=0}   // bloccato da 1,5 s: nuovo percorso; dopo 3 volte attraversa gli ostacoli per 3 s
  if(v.gh>0)v.gh-=dt;else push(v,v.rr-6,0)}
 if(m.ls>SEC_FAIL){finish(1,'Troppi VIP uccisi: missione fallita');return}
 if(m.wst&&!secFoes().length)objDone('I VIP sono al sicuro e le minacce sono state eliminate!')}

// ===== missione 9: difesa della base (tower defence) =====
// Edificio centrale (MD.mb) e 4 zone (MD.z) derivano dal seed. Le torrette alleate sono unità sec=1 (come le guardie della missione 8) al centro delle zone.
// Torretta morta → la sua zona si attiva (z.on=1): un giocatore a terra che ci resta TD_CAP_T s la ripristina. Il tempo parte quando un giocatore si avvicina.
// Dopo TD_TIME s con l'edificio vivo: esplosioni nucleari fuori mappa (effetto LOCALE) eliminano i nemici e la missione è vinta.
const TN={on:0,t:0,k:0,f:[]};
function tdTurret(z){const u=mkUnit(0,z.x,z.y,GID++);u.sec=1;u.ms=1;u.hp=u.mhp=Math.round(u.hp*TD_TUR_HP);u.ar=0;
 if(u.bw!=null){u.bw=null;u.ws=newWS(W_MG)}   // sempre mitraglia (mkUnit a volte assegna lanciafiamme/shotgun/cannone)
 z.u=u;z.on=0;z.p=0;return u}
function tdSpawn(){units.length=0;PQ.length=0;G.cap=0;secNavBuild();for(const z of MD.z)tdTurret(z)}   // niente nemici all'inizio, solo le 4 torrette
function tdWave(n){const b=MD.mb,g=GID++,a0=Math.random()*TAU;let c=0;   // ogni ondata nasce in una direzione casuale a TD_SPAWN_D dall'edificio
 for(let tr=0;c<n&&tr<600;tr++){const a=a0+rnd(-.5,.5)*(tr>200?4:1),x=b.x+Math.cos(a)*TD_SPAWN_D+rnd(-70,70),y=b.y+Math.sin(a)*TD_SPAWN_D+rnd(-70,70),k=getRandomEnemyType();
  if(x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60&&((k==2||k==3)||clearAt(x,y,k==5?40:22))){const u=mkUnit(k,x,y,g);u.ms=1;u.aw=1;u.st=2;u.lkx=b.x;u.lky=b.y;u.lkt=LOST_T;c++;fxSpawn(x,y,'#ff9a3a',10,true)}}
 // fallback: se restano nemici da piazzare (spawn troppo bloccato da alberi/rocce/edifici), piazzali in un anello più stretto attorno all'edificio
 for(let tr=0;c<n&&tr<400;tr++){const a=Math.random()*TAU,d=rnd(b.r+120,b.r+420),x=b.x+Math.cos(a)*d,y=b.y+Math.sin(a)*d,k=getRandomEnemyType();
  if(x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60&&(k==2||k==3||clearAt(x,y,18))){const u=mkUnit(k,x,y,g);u.ms=1;u.aw=1;u.st=2;u.lkx=b.x;u.lky=b.y;u.lkt=LOST_T;c++;fxSpawn(x,y,'#ff9a3a',10,true)}}
 return c}
function tdTick(dt,pl){const m=MS,b=MD.mb;
 if(b.dead){finish(1,'Edificio centrale distrutto: missione fallita');return}
 for(const u of units)if(u.aw&&!u.dead&&!u.z&&u.stk>25)secUnstick(u);
 MD.z.forEach((z,i)=>{
  if(!z.on){if(z.u&&z.u.dead){z.on=1;z.p=0;announce('Torretta '+(i+1)+' distrutta! Riconquista la sua zona.')}return}
  const inside=pl.some(q=>!q.z&&Math.hypot(q.x-z.x,q.y-z.y)<z.r);z.p=clamp(z.p+(inside?dt/TD_CAP_T:-dt/TD_CAP_T*2),0,1);
  if(z.p>=1){tdTurret(z);fxSpawn(z.x,z.y,'#5ee0c0',18,true,45);sfxAt(SFX_LIST.toGrunt,.8,z.x,z.y,0);announce('Torretta '+(i+1)+' ripristinata!')}});
 if(m.tn)return;
 if(!m.ta){if(pl.some(q=>Math.hypot(q.x-b.x,q.y-b.y)<TD_START_R)){m.ta=1;m.tt=0;m.tw=TD_FIRST;announce('Difendi l’edificio per '+Math.round(TD_TIME/60)+' minuti!')}return}
 m.tt+=dt;
 if(m.tt>=TD_TIME){m.tn=1;tdNukeBegin(0);announce('Esplosioni nucleari in arrivo!');return}
 m.tw-=dt;if(m.tw<=0){const f=m.tt/TD_TIME;m.tw=lerp(TD_GAP[0],TD_GAP[1],f);
  const n=Math.min(Math.round(lerp(TD_WN[0],TD_WN[1],f)),TD_MAX-secFoes().length);if(n>0)tdWave(n)}}
// sequenza nucleare: effetto locale su ogni client (in rete passa solo m.tn). L'host al primo lampo uccide i nemici (non le torrette alleate) e a fine sequenza vince.
function tdNukeBegin(t0){TN.on=1;TN.t=t0||0;TN.k=TN.t>=TD_NUKE_KILL?1:0;TN.f=Array.from({length:TD_NUKE_N},(_,i)=>({t0:i*(TD_NUKE_T*.7)/TD_NUKE_N,a:Math.random()*TAU,s:0}))}
function tdNukeTick(dt){if(!TN.on)return;TN.t+=dt;
 for(const f of TN.f)if(!f.s&&TN.t>=f.t0){f.s=1;sfx(SFX_LIST.nuke,.7)}
 if(!TN.k&&TN.t>=TD_NUKE_KILL){TN.k=1;sfx(SFX_LIST.crash,.8);if(authority())for(const u of units)if(!u.sec&&!u.dead){u.hp=0;u.dead=1;u.kb=-1}}   // kb=-1: nessuna kill assegnata
 if(TN.t>=TD_NUKE_T){TN.on=0;if(authority())finish(2,'Base difesa! Le esplosioni nucleari hanno eliminato tutti i nemici.')}}

// trappola del VIP: 4-8 nemici in imboscata (dormienti) in 2 gruppi lungo la strada fra il VIP e il punto di estrazione, mai addosso al VIP né ai giocatori
const TRAP_MIN=700;
function vipTrap(al){
 const n=4+(Math.random()*5|0),dx=EXT[0]-al.x,dy=EXT[1]-al.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,pl=plist();
 const ok=(x,y)=>x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60&&Math.hypot(x-START[0],y-START[1])>900&&Math.hypot(x-al.x,y-al.y)>TRAP_MIN&&!pl.some(q=>Math.hypot(q.x-x,q.y-y)<TRAP_MIN);
 const cl=[0,1].map(i=>{for(let tr=0;tr<200;tr++){const t=rnd(i?.5:.2,i?.85:.5)*L,s=rnd(-260,260),x=al.x+ux*t-uy*s,y=al.y+uy*t+ux*s;if(ok(x,y)&&clearAt(x,y,30))return{x,y,g:GID++}}return null}).filter(Boolean);
 for(let c=0,tr=0;c<n&&cl.length&&tr<400;tr++){const q=cl[c%cl.length],a=Math.random()*TAU,d=rnd(30,110),x=q.x+Math.cos(a)*d,y=q.y+Math.sin(a)*d;
  if(!ok(x,y)||!clearAt(x,y,30))continue;
  const r=Math.random(),u=mkUnit(r<.7?1:r<.88?4:5,x,y,q.g);u.ms=1;u.slp=1;c++}}
function missionTick(dt){
 if(G.over)return;
 // TEST missione 6: dopo 5 s innesta il nucleare (rimuovere la riga seguente dopo la prova)
 //if(G.mt==6&&!MS.nk){MS._t=(MS._t||0)+dt;if(MS._t>=5){nukeArm(MD.z[0]);MS.nt=3}}
 // FINE TEST NUCLEARE
 const m=MS,al=m.al,pl=plist();
 for(const o of BAR){if(o.dead||G.mt==8||G.mt==9)continue;o.barTimer-=dt;if(o.barTimer>0)continue;o.barTimer=BAR_T; // caserme: nuovi nemici a tempo, fino al numero iniziale
 const room=Math.min(BAR_SPAWN,G.cap-units.reduce((n,t)=>n+(t.ms?0:1),0));if(room<=0)continue;const g=GID++;
 for(let i=0,tr=0;i<room&&tr<80;tr++){const a=Math.random()*TAU,d=o.r+rnd(50,110),x=o.x+Math.cos(a)*d,y=o.y+Math.sin(a)*d,k=getRandomEnemyType();
  if(x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60&&((k==2||k==3)||clearAt(x,y,k==5?40:22))){mkUnit(k,x,y,g);i++;fxSpawn(x,y,'#ff9a3a',10,true)}}}
 if(m.ex){extractTick(dt);if(G.mt!=10)return}   // nella 10 i VIP recuperati continuano a seguire i giocatori e a poter morire                                    // obiettivo già compiuto: ora conta solo l'estrazione
 if(G.mt==0){if(!units.some(u=>u.k<UK_HUM&&!u.nav&&!u.sec)&&BAR.every(o=>o.dead))objDone('Nemici e caserme distrutti.');return}   // !sec: torrette, wingman e droni dei giocatori non contano
 if(G.mt==1){
  if(!al.go){if(pl.some(q=>Math.hypot(q.x-al.x,q.y-al.y)<250)){al.go=1;al.on=1;announce('Il convoglio è in marcia: proteggilo!')}}
  else{const blocked=MD.blk.some(o=>!o.dead&&o.ps-al.s<110&&o.ps-al.s>-30),foes=units.some(t=>!t.slp&&Math.hypot(t.x-al.x,t.y-al.y)<330),lonely=!pl.some(q=>Math.hypot(q.x-al.x,q.y-al.y)<1300);
   al.hold=blocked?1:foes?2:lonely?3:0;if(!al.hold)al.s=Math.min(MD.len,al.s+CONV_V*dt);
   const q=pathAt(al.s);al.x=q.x;al.y=q.y;al.h=q.h;al.vx=al.hold?0:Math.cos(q.h)*CONV_V;al.vy=al.hold?0:Math.sin(q.h)*CONV_V;
   if(al.hp<=0){al.on=0;finish(1,'Convoglio distrutto: missione fallita')}else if(al.s>=MD.len-2)objDone('Il convoglio è arrivato a destinazione!')}}
 else if(G.mt==2){const b=MD.vb;
  if(!al.st){const gr=pl.filter(q=>!q.z&&Math.hypot(q.x-b.x,q.y-b.y)<b.r+90);m.rc=clamp(m.rc+(gr.length?dt:-dt*.5),0,VIP_T);
   if(m.rc>=VIP_T){const a=Math.atan2(START[1]-b.y,START[0]-b.x);let x=b.x+Math.cos(a)*(b.r+40),y=b.y+Math.sin(a)*(b.r+40);
    for(let k=1;k<14&&!clearAt(x,y,14);k++){const aa=a+k*.55;x=b.x+Math.cos(aa)*(b.r+40+k*6);y=b.y+Math.sin(aa)*(b.r+40+k*6)}
    al.x=x;al.y=y;al.st=1;al.on=1;announce('VIP recuperato! Scortalo fino al punto di estrazione');vipTrap(al)}}
  else{const gr=pl.filter(q=>!q.z);al.vx=al.vy=0;
   if(gr.length&&!(al.inV>=0)){const T=gr.reduce((a,c)=>Math.hypot(a.x-al.x,a.y-al.y)<Math.hypot(c.x-al.x,c.y-al.y)?a:c),dx=T.x-al.x,dy=T.y-al.y,d=Math.hypot(dx,dy)||1;
    if(d>110)vipMove(al,T.x,T.y,T,dt);else al.stk=0}   // a bordo di un mezzo (al.inV) la posizione la dà il mezzo (vehVipTick)
   if(al.hp<=0){al.on=0;finish(1,'Il VIP è stato ucciso: missione fallita')}else if(Math.hypot(al.x-EXT[0],al.y-EXT[1])<EXT_R)objDone('VIP in salvo!')}}
 else if(G.mt==3){
  for(const o of MD.tg)if(o.dead&&o.tg=='plant'&&!o.fx){o.fx=1;for(const t of units)if(t.k==0&&Math.hypot(t.x-o.x,t.y-o.y)<PLANT_R)t.dis=PLANT_T;announce('Centrale distrutta: le torrette vicine sono spente')}
  if(MD.tg.every(o=>o.dead))objDone('Sabotaggio riuscito!')}
 else if(G.mt==4){const h=m.hv;m.sp=Math.max(0,m.sp-dt);
  if(h){if(pl.some(q=>Math.hypot(q.x-h.x,q.y-h.y)<(q.z?1300:Math.max(WEAPONS[q.w].range,540)*1.1))){m.sp=6;m.lx=h.x;m.ly=h.y}
   m.hh=h.hp;if(h.hp<=0)objDone('Bersaglio d’élite eliminato!')}}
 else if(G.mt==8)secTick(dt,pl);
 else if(G.mt==9)tdTick(dt,pl);
 else if(G.mt==10){const c=MD.crash;
  if(!c.seen&&pl.some(q=>Math.hypot(q.x-c.x,q.y-c.y)<c.r+80)){c.seen=1;announce('Sito di schianto individuato: recupera i 3 VIP!')}
  for(const v of MS.vips){
   if(v.saved||v.dead)continue;
   // morte del VIP: si comporta come ogni altra unità (sangue, esplosione, rimozione dalla mappa)
   if(v.hp<=0){v.dead=1;v.on=0;v.rv=0;
    fxBoom(v.x,v.y,'unit',FXS);fxSpawn(v.x,v.y,'#c01818',10,true,45);makeBlood(v.x,v.y,2.5);sfxAt(SFX_LIST.crash,.8,v.x,v.y,80);
    announce('VIP '+v.n+' ucciso! ('+MS.vips.filter(z=>z.dead).length+' persi su 3)');
    if(MS.vips.filter(z=>z.dead).length>=2){finish(1,'Troppi VIP uccisi: missione fallita');return}
    continue}
   if(!v.on){
    if(m.ex)continue;   // obiettivo già compiuto: i VIP rimasti a terra non si recuperano più
    const gr=pl.filter(q=>!q.z&&Math.hypot(q.x-v.x,q.y-v.y)<v.rr+60);
    v.rv=clamp((v.rv||0)+(gr.length?dt/VIP_T:-dt*.5),0,VIP_T);
    if(v.rv>=VIP_T){
     // appena recuperato, "aggancia" al player mettendolo dietro a distanza di sicurezza (oltre il range mischia)
     if(gr.length){const T=gr[0],a=Math.atan2(T.y-v.y,T.x-v.x);v.x=T.x-Math.cos(a)*(MELEE_R+20);v.y=T.y-Math.sin(a)*(MELEE_R+20);push(v,v.rr-2,1)}
     v.on=1;v.rv=0;
     announce('VIP '+v.n+' recuperato! ('+MS.vips.filter(z=>z.on||z.saved).length+'/3)');
     vipTrap(v);
    }
   }else{
    const gr=pl.filter(q=>!q.z);v.vx=v.vy=0;
    if(gr.length&&!G.ext&&!(v.inV>=0)){   // a bordo di un mezzo: la posizione la dà il mezzo (vehVipTick)   // estrazione in corso: i VIP restano fermi dove sono, come nella missione 2
     const T=gr.reduce((a,c)=>Math.hypot(a.x-v.x,a.y-v.y)<Math.hypot(c.x-v.x,c.y-v.y)?a:c);
     // Sistema missione 2: insegui il player più vicino, fermati a una soglia.
     // Il punto di inseguimento sta DIETRO il player di MELEE_R+20 (mai sotto il range mischia)
     // e ha un offset laterale di 40 px distribuito (-40, 0, +40 per VIP 1, 2, 3).
     const dx=T.x-v.x,dy=T.y-v.y,d=Math.hypot(dx,dy)||1;
     const perpX=-dy/d, perpY=dx/d, side=v.n-2, FD=MELEE_R+20;
     const tx=T.x-dx/d*FD+perpX*40*side, ty=T.y-dy/d*FD+perpY*40*side;
     const td=Math.hypot(tx-v.x,ty-v.y)||1;
     if(td>6)vipMove(v,tx,ty,T,dt);   // percorso A*, sblocco e teletrasporto (vedi vipMove)
     else{v.h=Math.atan2(T.y-v.y,T.x-v.x);v.stk=0}
     // sicurezza: mai sotto MELEE_R+5 dal player (mai dentro il raggio della mischia)
     const ndx=v.x-T.x,ndy=v.y-T.y,nd=Math.hypot(ndx,ndy)||1,minD=MELEE_R+5;
     if(nd<minD){const k=Math.min(dt*VIP_V*1.5,(minD-nd))/(nd||1);v.x+=ndx*k;v.y+=ndy*k}
    }
    if(Math.hypot(v.x-EXT[0],v.y-EXT[1])<EXT_R){v.saved=1;v.on=0;announce('VIP '+v.n+' in salvo! ('+MS.vips.filter(z=>z.saved).length+'/3)')}   // come nella missione 2: nessun effetto, il VIP resta lì finché la dropship lo carica
   }
  }
  // separazione tra VIP recuperati (40 px minimo)
  for(let i=0;i<MS.vips.length;i++){
   const a=MS.vips[i];if(!a.on||a.saved||a.dead||a.inV>=0)continue;
   for(let j=i+1;j<MS.vips.length;j++){
    const b=MS.vips[j];if(!b.on||b.saved||b.dead||b.inV>=0)continue;
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,min=40;
    if(d<min){const k=(min-d)/d*.5;a.x-=dx*k;a.y-=dy*k;b.x+=dx*k;b.y+=dy*k}
   }
  }
  // vittoria: almeno 2 VIP su 3 in salvo
  if(MS.vips.length&&MS.vips.filter(v=>v.saved).length>=2)objDone('Almeno 2 VIP in salvo: missione riuscita!')}
 else if(G.mt==11){const N=MD.fleet.length,n=MD.fleet.filter(o=>o.dead).length;
  if(n>(m.fs|0)){m.fs=n;if(n<N)announce('Nave nemica affondata! ('+n+'/'+N+')')}
  if(n>=N)objDone('Flotta nemica affondata!')}
 else if(G.mt>=5){const z=MD.z[m.cz];
  if(z){const inside=pl.some(q=>!q.z&&Math.hypot(q.x-z.x,q.y-z.y)<z.r);z.p=clamp(z.p+(inside?dt/KOTH_T:-dt/KOTH_T*.5),0,1);
   if(inside){m.wt-=dt;if(m.wt<=0){m.wt=KOTH_WAVE;kothWave(z)}}
   if(z.p>=1){m.cz++;m.wt=3;
    if(m.cz>=MD.z.length){if(G.mt==6)nukeArm(z);else objDone(G.mt==7?'Cantiere conquistato!':'Avamposti conquistati!')}
    else announce(G.mt==7?'Centrale energetica conquistata! Raggiungi il cantiere spaziale':'Avamposto conquistato! Raggiungi il prossimo')}}}}
// stato della missione per i client (solo numeri)
function msPack(){const m=MS,a=m.al,z=MD.z&&MD.z[m.cz];
 return[m.st,a?Math.round(a.x):0,a?Math.round(a.y):0,a?Math.max(0,Math.ceil(a.hp)):0,a?(G.mt==1?Math.round(a.s):a.st|0):0,a?(a.hold|0):0,a?(G.mt==1?(a.go?1:0):Math.round(m.rc*10)/10):0,m.cz|0,z?Math.round(z.p*100)/100:0,m.sp>0?1:0,Math.round(m.lx),Math.round(m.ly),Math.max(0,Math.ceil(m.hh)),a?Math.round((a.h||0)*100)/100:0,m.ex|0,m.nk|0,Math.round((m.nk==2?NK.t:m.nt||0)*10)/10].concat(G.mt==8?[m.sf|0,m.ls|0,m.dp|0,m.cap|0,m.wst|0,Math.round(m.ct*10)/10,...m.vans.flatMap(v=>[v.n,Math.round(v.x),Math.round(v.y),Math.max(0,Math.ceil(v.hp)),Math.round((v.h||0)*100)/100])]:[]).concat(G.mt==9?[m.ta|0,Math.round(m.tt),m.tn|0,...MD.z.flatMap(z=>[Math.round(z.p*100)/100,z.on|0])]:[])
 .concat(G.mt==10?[(MD.crash&&MD.crash.seen?1:0),...(m.vips||[]).flatMap(v=>[Math.round(v.x),Math.round(v.y),Math.max(0,Math.ceil(v.hp)),v.on|0,v.saved|0,v.dead|0,Math.round((v.rv||0)*100)/100,Math.round((v.h||0)*100)/100,v.inV>=0?v.inV:-1])]:[])
 .concat(G.mt==2?[a&&a.inV>=0?a.inV:-1]:[])}   // VIP a bordo: id del mezzo (-1 = a piedi)
function msUnpack(a){const m=MS,al=m.al;m.st=a[0];
 if(al){al.tx=a[1];al.ty=a[2];al.hp=a[3];al.hold=a[5];al.h=a[13];if(G.mt==1){al.s=a[4];al.go=a[6];al.on=a[6]}else{al.st=a[4];al.on=a[4];m.rc=a[6]}}
 m.cz=a[7];if(MD.z)MD.z.forEach((z,i)=>z.p=i<m.cz?1:i==m.cz?a[8]:0);m.sp=a[9];m.lx=a[10];m.ly=a[11];m.hh=a[12];m.ex=a[14]|0;if(m.ex==2)extractBegin();
 m.nk=a[15]|0;if(m.nk==1)m.nt=+a[16]||0;else if(m.nk==2&&!NK.on)nukeBegin(+a[16]||0)
 if(G.mt==8){m.sf=a[17]|0;m.ls=a[18]|0;m.dp=a[19]|0;m.cap=a[20]|0;m.wst=a[21]|0;m.ct=+a[22]||0;const keep=[];   // furgoni dei VIP: ricreati/aggiornati dallo snapshot
  for(let i=23;i+4<a.length;i+=5){const n=a[i];let v=m.vans.find(q=>q.n===n);if(!v){v={id:-10-n,n,al:1,van:1,z:0,x:a[i+1],y:a[i+2],vx:0,vy:0,mhp:SEC_VAN_HP,rr:26,on:1,h:a[i+4]};m.vans.push(v)}v.tx=a[i+1];v.ty=a[i+2];v.hp=a[i+3];v.h=a[i+4];keep.push(v)}
  m.vans=keep}   // chi entra a esplosione in corso parte dal punto giusto
 if(G.mt==2&&al)al.inV=a[17]!=null?a[17]|0:-1;   // VIP a bordo di un mezzo
 if(G.mt==9){m.ta=a[17]|0;m.tt=+a[18]||0;const tn=a[19]|0;if(tn&&!m.tn)tdNukeBegin(0);m.tn=tn;
  MD.z.forEach((z,i)=>{z.p=+a[20+i*2]||0;z.on=a[21+i*2]|0})}   // zone delle torrette: avanzamento e stato
 if(G.mt==10){if(MD.crash)MD.crash.seen=a[17]|0;if(!m.vips)m.vips=[];
  for(let i=0;i<3;i++){const b=18+i*9;if(b+8>=a.length)break;
   let v=m.vips[i];if(!v){v={id:-20-i,n:i+1,al:1,z:0,x:a[b],y:a[b+1],tx:a[b],ty:a[b+1],rr:16,mhp:VIP_HP,burn:0,dead:0};m.vips.push(v)}
   const wasDead=v.dead|0;
   v.tx=a[b];v.ty=a[b+1];v.hp=a[b+2];v.on=a[b+3]|0;v.saved=a[b+4]|0;v.dead=a[b+5]|0;v.rv=+a[b+6]||0;v.h=+a[b+7]||0;v.inV=a[b+8]|0;
   if(v.dead&&!wasDead){fxBoom(v.x,v.y,'unit',FXS);fxSpawn(v.x,v.y,'#c01818',10,true,45);makeBlood(v.x,v.y,2.5);sfxAt(SFX_LIST.crash,.8,v.x,v.y,80)}}}}
// la parte non-host ricrea gli alleati della missione (stessa struttura, posizione dallo snapshot)
function missionClientInit(){MS={t:G.mt,st:0,al:null,sp:0,wt:0,cz:0,rc:0,hv:null,lx:0,ly:0,hh:0,ex:0,nk:0,nt:0,vans:[],vips:[],sf:0,ls:0,dp:0,cap:0,ct:0,wst:0,ta:0,tt:0,tw:0,tn:0};
 const al=(x,y,hp,rr0)=>({id:-1,al:1,z:0,x,y,tx:x,ty:y,vx:0,vy:0,hp,mhp:hp,rr:rr0,on:0,h:0,s:0,go:0,hold:0,st:0});
 if(G.mt==1){const q=pathAt(0);MS.al=al(q.x,q.y,CONV_HP,30)}else if(G.mt==2){MS.al=al(MD.vb.x,MD.vb.y,VIP_HP,16)}
 if(G.mt==10&&MD.vipsPos)for(const p of MD.vipsPos)MS.vips.push({id:-20-MS.vips.length,n:MS.vips.length+1,al:1,z:0,x:p.x,y:p.y,tx:p.x,ty:p.y,h:p.h,vx:0,vy:0,hp:VIP_HP,mhp:VIP_HP,rr:16,on:0,saved:0,dead:0,rv:0,st:0,burn:0})}
function missionInfo(){const m=MS,al=m.al;
 if(m.ex){const d=Math.hypot(P.x-EXT[0],P.y-EXT[1]);return m.ex==2?{t:G.mt==7?'La nave spaziale sta decollando…':'Estrazione in corso…',f:1,c:'#5ee0c0'}
  :m.nk==1?{t:'DETONAZIONE NUCLEARE tra '+Math.ceil(m.nt)+' s · tutti i giocatori all’estrazione!',f:clamp(m.nt/NK_T,0,1),c:'#ff4a4a'}
  :m.nk==2?{t:'Detonazione nucleare!',f:-1}
  :{t:G.mt==7?'Obiettivo compiuto! Tutti i giocatori alla nave spaziale':'Obiettivo compiuto! Tutti i giocatori al punto di estrazione',f:clamp(1-(d-extR())/3500,0,1),c:'#5ee0c0'}}
 if((G.mt==1||G.mt==2)&&!al)return{t:'',f:-1};
 switch(G.mt){
  case 1:return{t:al.go?['Scorta il convoglio fino alla meta','Il convoglio è bloccato: distruggi la barricata','Il convoglio è sotto attacco: elimina i nemici','Il convoglio ti aspetta: restagli vicino'][al.hold|0]:'Raggiungi il convoglio per farlo partire',f:al.go?al.s/MD.len:0,c:'#4aa3ff',h:al.hp/al.mhp};
  case 2:return al.st?{t:'Scorta il VIP fino al punto di estrazione (base di partenza)',f:1-clamp(Math.hypot(al.x-EXT[0],al.y-EXT[1])/MD.d0,0,1),c:'#5ee0c0',h:al.hp/al.mhp}:{t:'Raggiungi a piedi l’edificio segnalato e restaci vicino',f:m.rc/VIP_T,c:'#5ee0c0'};
  case 3:{const n=MD.tg.filter(o=>o.dead).length,nm={plant:'centrale',radar:'radar',tank:'serbatoio'};return{t:'Strutture distrutte '+n+'/'+MD.tg.length+' · restano: '+(MD.tg.filter(o=>!o.dead).map(o=>nm[o.tg]).join(', ')||'-'),f:n/MD.tg.length,c:'#ffb02e'}}
  case 4:return m.sp>0?{t:'Bersaglio d’élite avvistato: neutralizzalo!',f:m.hh/UT[6].hp,c:'#ff4a4a'}:{t:'Individua il bersaglio d’élite · ultimo avvistamento: '+regione(m.lx,m.ly),f:-1};
  case 5:case 6:case 7:{const i=Math.min(m.cz,MD.z.length-1),nm=G.mt==6?(MD.sk=='k'?'la centrale nucleare':'il sito ICBM'):G.mt==7?(i?'il cantiere spaziale':'la centrale energetica'):'l’avamposto '+(i+1)+'/'+MD.z.length;
   return{t:'Occupa '+nm+' con il Grunt e resisti alle ondate',f:MD.z[i].p,c:'#ffd23f'}}
  case 8:{const b=MD.mb,z=MD.z[0];if(!m.cap)return{t:'Raggiungi a piedi l’edificio del meeting e presidia la zona',f:z.p,c:'#ffd23f',h:b.hp/b.m};
   if(m.wst)return{t:'VIP al sicuro ('+m.sf+'/'+SEC_VIP_N+'): elimina i nemici rimasti ('+units.filter(u=>!u.sec&&u.k<UK_HUM).length+')',f:1,c:'#5ee0c0',h:b.hp/b.m};
   const nx=Math.ceil(m.ct<SEC_LEAD?SEC_LEAD-m.ct:SEC_GAP+SEC_LEAD-m.ct);
   return{t:'Difendi il meeting · VIP in salvo '+m.sf+'/'+SEC_VIP_N+' · persi '+m.ls+'/'+(SEC_FAIL+1)+(m.dp<SEC_VIP_N?' · prossimo furgone tra '+nx+' s':''),f:m.sf/SEC_SAFE,c:'#5ee0c0',h:b.hp/b.m}}
  case 9:{const b=MD.mb;if(!m.ta)return{t:'Raggiungi la base e preparati a difenderla',f:-1,h:b.hp/b.m};
   if(m.tn)return{t:'Esplosioni nucleari: i nemici vengono eliminati!',f:1,c:'#ff4a4a',h:b.hp/b.m};
   const dead=MD.z.filter(z=>z.on).length,left=Math.max(0,TD_TIME-m.tt),mm=Math.floor(left/60),ss=Math.floor(left%60);
   return{t:'Difendi la base · '+mm+':'+String(ss).padStart(2,'0')+' · torrette distrutte '+dead+'/'+MD.z.length+(dead?' · riconquista le zone rosse':''),f:m.tt/TD_TIME,c:'#5ee0c0',h:b.hp/b.m}}
  case 10:{const n=MS.vips||[],rec=n.filter(v=>v.on||v.saved).length,sav=n.filter(v=>v.saved).length,dth=n.filter(v=>v.dead).length,c=MD.crash;
   if(!c.seen)return{t:'Nessuna indicazione: esplora e individua il sito di schianto (zona '+regione(c.x,c.y)+')',f:-1,c:'#5ee0c0'};
   if(sav>=2)return{t:'Almeno 2 VIP in salvo: missione riuscita!',f:1,c:'#5ee0c0'};
   if(dth>=2)return{t:'Troppi VIP persi: missione fallita',f:-1,c:'#ff4a4a'};
   if(rec+dth<3)return{t:'Raggiungi il relitto e recupera i VIP feriti · '+rec+' recuperati, '+dth+' persi (ne servono 2)',f:rec/2,c:'#5ee0c0'};
   return{t:'Scorta i VIP al punto di estrazione · '+sav+' in salvo, '+dth+' persi (ne servono 2)',f:sav/2,c:'#5ee0c0'}}
  case 11:{const F=MD.fleet||[],n=F.filter(o=>o.dead).length,hp=F.reduce((a,o)=>a+(o.dead?0:Math.max(0,o.hp)),0),mh=F.reduce((a,o)=>a+o.m,0)||1;
   return{t:'Affonda la flotta nemica: colpisci gli scafi · navi affondate '+n+'/'+F.length,f:F.length?n/F.length:0,c:'#ff4a4a',h:hp/mh}}
  default:return{t:'Distruggi tutti i nemici e le caserme',f:-1}}}
function missionMarks(){const m=MS,al=m.al,o=[];
 if(m.ex){if(m.ex==1)o.push({x:EXT[0],y:EXT[1],c:'#5ee0c0'});return o}
 if(G.mt==1&&al)o.push({x:al.x,y:al.y,c:'#4aa3ff'});
 else if(G.mt==2&&al)o.push(al.st?{x:EXT[0],y:EXT[1],c:'#5ee0c0'}:{x:MD.vb.x,y:MD.vb.y,c:'#5ee0c0'});
 else if(G.mt==3){for(const t of MD.tg)if(!t.dead)o.push({x:t.x,y:t.y,c:'#ffb02e'})}
 else if(G.mt==4){}   // niente marker: il bersaglio d'élite non è segnalato da un triangolo rosso (sarebbe sempre visibile anche nella nebbia)
 else if(G.mt==8){if(!m.cap){const z=MD.z[0];o.push({x:z.x,y:z.y,c:'#ffd23f'})}else{o.push({x:MD.mb.x,y:MD.mb.y,c:'#5ee0c0'});for(const v of m.vans)o.push({x:v.x,y:v.y,c:'#4aa3ff'});
   if(m.wst)for(const u of units.filter(u=>!u.sec&&u.k<UK_HUM).sort((p,q)=>Math.hypot(p.x-P.x,p.y-P.y)-Math.hypot(q.x-P.x,q.y-P.y)).slice(0,4))o.push({x:u.x,y:u.y,c:'#ff4a4a'})}}   // finale: i 4 nemici più vicini sono segnalati
 else if(G.mt==9){if(!m.ta)o.push({x:MD.mb.x,y:MD.mb.y,c:'#5ee0c0'});for(const z of MD.z)if(z.on)o.push({x:z.x,y:z.y,c:'#ff4a4a'})}   // prima la base, poi le torrette da ripristinare
 else if(G.mt==10){const n=MS.vips||[];
   if(MD.crash.seen)for(const v of n)if(!v.saved&&!v.dead&&!v.on&&v.hp>0)o.push({x:v.x,y:v.y,c:'#5ee0c0'});
   if(n.some(v=>v.on&&!v.saved&&!v.dead)||n.some(v=>v.saved))o.push({x:EXT[0],y:EXT[1],c:'#5ee0c0'});
 }
 else if(G.mt==11){for(const s of MD.fleet||[])if(!s.dead)o.push({x:s.x,y:s.y,c:'#ff4a4a'})}   // navi ancora a galla
 else if(G.mt>=5){const z=MD.z[m.cz];if(z)o.push({x:z.x,y:z.y,c:'#ffd23f'})}
 else for(const b of BAR)if(!b.dead)o.push({x:b.x,y:b.y,c:'#ff5a4a'});
 return o}

// ===== deathmatch =====
const dmKey=id=>{if(id==null||id<0)return null;if(id<1000)return'p'+id;const u=units.find(v=>v.id===id);return u&&u.dm?'b'+u.bi:u&&u.owner!=null?'p'+u.owner:null};   // torretta o wingman: l'uccisione va al giocatore proprietario
function dmEnsure(key,name){return DM.sc[key]||(DM.sc[key]={n:name,k:0,d:0})}
function dmCredit(killer,vkey,vname){if(G.mode!=1)return;const v=dmEnsure(vkey,vname);v.d++;const kk=dmKey(killer);
 if(kk&&kk!==vkey){const s=DM.sc[kk]||dmEnsure(kk,kk[0]=='p'?(killer==NET.id?P.name:(others[killer]&&others[killer].name)||'Pilota'):'BOT');s.k++;
  if(s.k>=DM_LIMIT&&!G.over){const me=dmKey(NET.id);finish(kk===me?2:1,s.n+' vince il deathmatch ('+s.k+' uccisioni)')}}}
function dmPoint(){ // punto di rinascita più lontano da tutti, tra alcuni a caso
 const all=plist().concat(units);let best=M.dm[0],bd=-1;
 for(let i=0;i<6;i++){const p=M.dm[Math.random()*M.dm.length|0],d=all.reduce((m,q)=>Math.min(m,Math.hypot(q.x-p[0],q.y-p[1])),1e9);if(d>bd){bd=d;best=p}}
 return best}
function dmInit(){DM.sc={};DM.rq=[];dmEnsure('p'+NET.id,P.name);populateDM();units.forEach(u=>{if(u.bi==null)u.bi=+u.name.slice(4);dmEnsure('b'+u.bi,u.name)})}
function dmTick(dt){for(let i=DM.rq.length-1;i>=0;i--){const r=DM.rq[i];r.t-=dt;if(r.t>0)continue;DM.rq.splice(i,1);
 if(G.duel>=0){const du=DUEL_UNITS[G.duel]||DUEL_UNITS[0],p=duelPoint(),u=mkUnit(du.k,p[0],p[1],-1,{du});u.name=r.name;u.bi=r.bi;u.dm=1;if(u.k===UK_POL)u.st=2;fxSpawn(p[0],p[1],'#ff9a3a',10,true);continue}
 const p=dmPoint(),u=mkUnit(1,p[0],p[1],-1);u.name=r.name;u.bi=r.bi;u.ci=(Math.random()*COLS.length)|0;u.dm=1;botLoadout(u);fxSpawn(p[0],p[1],'#ff9a3a',10,true)}}
const dmPack=()=>Object.entries(DM.sc).map(([k,v])=>[k,v.n,v.k,v.d]);
const dmUnpack=a=>{for(const[k,n,kk,d]of a)DM.sc[k]={n,k:kk,d}};

// ===== vita dei giocatori e delle unità (host/singolo) =====
// macchia lasciata da un'unità morta: la usano l'host/singolo (onUnitDead) e i client (Handlers.snap in AGnet.js), così tutti la vedono uguale
const OIL_K=new Set([0,2,3,5,UK_BLIMP,UK_APC]);   // tipi che lasciano olio + sangue: torretta, jet, kamikaze, carro pesante, dirigibile, APC (il cecchino resta col sangue)
function deathMark(u){if(!u.sob)makeBlood(u.x, u.y, u.k>=UK_HUM?CIV_SP:2.5, OIL_K.has(u.k));
 if(u.burn>0)burnRem(u.x,u.y,UT[u.k].r*.8,10)}   // omini: stessa macchia dei civili; mech: 2.5 · mezzi di OIL_K: olio + sangue · nave: niente · morta mentre bruciava: il resto continua a bruciare
function onUnitDead(u){blastFx(u); deathMark(u);
 if(G.mode!=1&&u.kb>=0&&u.kb<1000){const k=u.kb===NET.id?P:others[u.kb];if(k)k.kills=(k.kills|0)+1}   // uccisione di un nemico
 if(u.dm&&G.mode==1){const key='b'+u.bi;dmCredit(u.kb,key,u.name);DM.rq.push({t:DM_RESPAWN,bi:u.bi,name:u.name})}}
// ===== cooperativa in rete: mech incapacitato =====
// un alleato vivo che gli sta accanto REVIVE_T secondi lo rimette in piedi con metà vita; se si allontana la barra scende al doppio della velocità
const REVIVE_R=90,REVIVE_T=3;
function reviveTick(q,dt){
 const near=plist().some(a=>a!==q&&Math.hypot(a.x-q.x,a.y-q.y)<REVIVE_R);
 q.rv=clamp((q.rv||0)+(near?dt/REVIVE_T:-dt/REVIVE_T*2),0,1);
 if(q.rv>=1){q.rv=0;q.hp=(q.hpMax||100)*.5;q.dd=0;q.shs=(q.shs||[]).map(()=>0);
  fxSpawn(q.x,q.y,'#ffc400',16,true,40);sfxAt(SFX_LIST.toGrunt,.7,q.x,q.y,80);announce(q.name+' è di nuovo in piedi!')}}
function lifeTick(dt){
 for(const q of[P,...Object.values(others)]){
  if(q.hp>0){q.rs=null;q.rv=0;if(q.dd)q.dd=0;continue}
  const coopNet=NET.on&&G.mode!=1;                                      // cooperativa in rete: non si rinasce, si resta incapacitati
  if(!q.dd){q.dd=1; makeBlood(q.x, q.y, 2.5); if(coopNet){q.air=false;q.z=0;q.vx=q.vy=0;q.rv=0;fxSpawn(q.x,q.y,'#ff5a4a',16,true,40);sfxAt(SFX_LIST.crash,.8,q.x,q.y,80)}else{fxBoom(q.x,q.y,'unit',FXS);if(G.mode==1)dmCredit(q.lh,'p'+q.id,q.name)}}
  if(!NET.on&&G.mode!=1){continue}                                      // singolo: la morte finisce la partita (vedi gameTick)
  if(coopNet){reviveTick(q,dt);continue}
  q.rs=(q.rs==null?(G.mode==1?DM_RESPAWN:5):q.rs)-dt;
  if(q.rs<=0){q.rs=null;q.hp=q.hpMax||100;q.dd=0;q.shs=(q.shs||[]).map(()=>0);q.sg=0;const[x,y]=G.mode==1?dmPoint():spawnAt(q.id);
   if(q===P){P.x=x;P.y=y;P.vx=P.vy=0}else{q.x=q.tx=x;q.y=q.ty=y;send(NET.conns[q.id],{t:'rs',x,y})}}}
 // (rimosso) la sconfitta "tutti i giocatori incapacitati" è gestita in update() con ritardo di 3 secondi.
 // Le rianimazioni in cooperativa restano attive in reviveTick() durante quei 3 s: se un compagno arriva,
 // plist() torna >0 e il timer in update() si azzera senza far terminare la partita.
}
  // ===== civili (omini e veicoli) =====
// Scenografia DETERMINISTICA: ogni civile percorre una strada (avanti e indietro); la posizione dipende solo da seed e orologio CIV.t,
// quindi in rete NON viaggiano posizioni: passano solo l'orologio (nello snapshot) e gli id dei civili uccisi (evento 'cv').
// Qualsiasi colpo li uccide subito (decide solo l'host); ogni civile ucciso toglie CIV_PEN kill a chi l'ha colpito.
const CIV={t:0,n:0,rd:[],k:null,r:null,c:null,h:null,d:null,s0:null,v:null,o:null,X:null,Y:null,H:null,spl:[]};   // d: 0 vivo, 1 ucciso, 3 spazzato via dal nucleare
const CIV_SP=1.5,CIV_SV=.8;                                                                                // scala: omini ×2, veicoli −20%
const CIV_RP=9*CIV_SP,SPL_MAX=60;
const CVG=128,CVGW=Math.ceil(WW/CVG),CVGH=Math.ceil(WH/CVG);   // griglia a celle per i colpi sui civili                                                                     // raggio d'impatto omino / veicolo, macchie al massimo
// Nuova funzione per generare sangue universale
function makeBlood(x, y, scale, oil) {   // oil = true: macchia mista olio + sangue (sprite 3..5 invece di 0..2)
  CIV.spl.push({x: x, y: y, v: (oil?3:0)+(Math.random()*3|0), a: Math.random()*TAU, sc: scale});
  if(CIV.spl.length > SPL_MAX) CIV.spl.shift();
}
// ===== crateri da esplosione (lanciarazzi, ecc.): macchie permanenti, FIFO come il sangue =====
const CRAT=[],CRAT_MAX=30,CRAT_S=[];
function craterAdd(x,y,r,sc,al){CRAT.push({x,y,r:r*.92*(sc||1),v:Math.random()*3|0,a:Math.random()*TAU,al:al!=null?al:.85});if(CRAT.length>CRAT_MAX)CRAT.shift()}

// ===== schiuma da esplosione in acqua: stessa sagoma del cratere ma bianca, sfuma in 2 s e svanisce =====
const FOAM=[],FOAM_T=3,FOAM_S=[];
const FOAM_K=['#ffffff','#56633a','#6e5232','#a8987a'];   // colore degli sbuffi: 0 acqua (bianco), 1 palude, 2 fango, 3 collina (polvere)
function foamAdd(x,y,r,k,life){FOAM.push({x,y,r:r*.92,v:(Math.random()*3|0)+3*(k|0),a:Math.random()*TAU,t:0,life:life||FOAM_T});}   // life opzionale (default FOAM_T)
function foamTick(dt){for(let i=FOAM.length-1;i>=0;i--){FOAM[i].t+=dt;if(FOAM[i].t>=(FOAM[i].life||FOAM_T))FOAM.splice(i,1)}}
// sbuffi: un Grunt (giocatore, anche remoto) dove è rallentato lascia una piccola schiuma, la stessa dell'esplosione in acqua ma più piccola,
// del colore del terreno: bianca in acqua, verde scuro in palude, marrone nel fango, polvere sulle colline. Sulla terra solo se si muove.
const SPLASH_R=26;
// ===== scie nel meteo: impronte nella neve e spruzzi nelle pozzanghere (giocatori e unità a terra NELLO SCHERMO; solo grafica, locale, niente rete) =====
const PRINTS=[],PRINT_MAX=140,PRINT_T=25;   // impronte: quante al massimo, durata (s)
function wxStep(dt){if(!M||!M.wxm)return;
 for(let i=PRINTS.length-1;i>=0;i--)if((PRINTS[i].t+=dt)>=PRINT_T)PRINTS.splice(i,1);
 const VW=W/zoom,VH=H/zoom,x0=camX-60,y0=camY-60,x1=camX+VW+60,y1=camY+VH+60;
 const step=(e,big)=>{if(e.x<x0||e.x>x1||e.y<y0||e.y>y1)return;
  if(e._wpx==null){e._wpx=e.x;e._wpy=e.y;return}
  const dx=e.x-e._wpx,dy=e.y-e._wpy;if(dx*dx+dy*dy<12*12)return;   // un passo ogni 12 px, uguale per tutti (mech e omini)
  const a=Math.atan2(dy,dx);e._wpx=e.x;e._wpy=e.y;const k=wxAt(e.x,e.y);if(!k)return;
  if(k==2){e._wps=-(e._wps||1);const s=e._wps*3;PRINTS.push({x:e.x-Math.sin(a)*s,y:e.y+Math.cos(a)*s,a,t:0});if(PRINTS.length>PRINT_MAX)PRINTS.shift()}   // piede sinistro / destro alternati: stessa orma per tutti
  else if(Math.random()<(big?.5:.25))foamAdd(e.x+(Math.random()-.5)*10,e.y+(Math.random()-.5)*10,SPLASH_R*(big?.55:.3),0)};   // pozzanghera: piccolo spruzzo bianco
 for(const q of plist())if(!q.air&&!q.z&&!q.pas)step(q,1);
 for(const u of units)if(!u.z&&!UT[u.k].fixed)step(u,u.k<UK_HUM?1:0)}
function gruntSplash(dt){for(const q of plist()){if(q.air||q.z||q.pas)continue;const mv=q._spX!=null&&Math.hypot(q.x-q._spX,q.y-q._spY)>dt*20;q._spX=q.x;q._spY=q.y;q._spT=(q._spT||0)-dt;if(q._spT>0)continue;
 let k=-1;
 if(nearWater(q.x,q.y)&&!onBridge(q.x,q.y)&&inWater(q.x,q.y,0))k=0;                  // acqua
 else if(mv){const s=typeof natSlowK==='function'?natSlowK(q.x,q.y):0;k=s?s:inHill(q.x,q.y)?3:-1}   // palude, fango, collina
 if(k<0){q._spT=.1;continue}
 foamAdd(q.x+(Math.random()-.5)*12,q.y+(Math.random()-.5)*12,SPLASH_R*(k==3?.8:mv?1:.7),k);q._spT=k==3?.7:.55}}

// palette degli omini: i colori di COLS più verde militare, giallo e blu operaio (indici 7, 8, 9 = COLS.length, +1, +2)
const CPAL=COLS.map(c=>c[0]).concat(['#4b5a2a','#ffd23f','#2a5db0']);
// classi di omini: 0 civili (colori a caso), 1 militari (corpo verde militare, testa rossa), 2 operai (corpo blu, testa gialla); [corpo, testa] = indici di CPAL
const CIV_CLS=[null,[COLS.length,3],[COLS.length+2,COLS.length+1]];
function civInit(){
 CIV.t=0;CIV.n=0;CIV.rd=[];CIV.spl.length=0;
 //if(G.mode==1)return;                                      // if(G.mode==1)return;  niente civili nel deathmatch
 const R=rng(M.seed+4243),rr=(a,b)=>a+R()*(b-a),ri=(a,b)=>a+(R()*(b-a+1)|0),CP=CIV_RP,NC=COLS.length;
 // classe di un punto: 0 fuori dai siti speciali, 1 dentro un sito militare, 2 dentro un sito industriale
 const cls=(x,y)=>{for(const s of M.sites){const c=CIV_SITE[s.k];if(c&&Math.hypot(x-s.x,y-s.y)<s.r)return c}return 0};
 // punto dove un omino può camminare: non in acqua, non contro un ostacolo (margine 10 px per l'offset dei gruppi), non nella base di partenza
 const _cq=[],ok=(x,y)=>{if(x<150||y<150||x>WW-150||y>WH-150||inWater(x,y,CP+10))return false;
  for(const o of qobs(x,y,CP+70,_cq)){if(o.t=='t'){if(Math.hypot(x-o.x,y-o.y)<o.r+CP*.5+10)return false}else{const l=toLocal(o,x,y);if(bsd(o,l[0],l[1])<CP+10)return false}}return true};
 // percorso: p punti, w larghezza strada, pc classe degli omini che lo usano, ped/car = chi può usarlo, off = non è una strada
 const path=(p,w,hw,dirt,pc,ped,car)=>{const cl=[0];for(let i=1;i<p.length;i++)cl.push(cl[i-1]+Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]));return{p,w,cl,L:cl[cl.length-1],hw,dirt,pc,ped,car,off:0}};
 // spezza una polilinea in tratti di punti consecutivi validi (chk) e della stessa classe
 const split=(pts,chk)=>{const out=[];let cur=null;for(const q of pts){if(chk&&!chk(q[0],q[1])){cur=null;continue}const c=cls(q[0],q[1]);if(!cur||cur.c!==c){cur={c,p:[]};out.push(cur)}cur.p.push(q)}return out};
 // un punto ogni ~28 px lungo una polilinea (chiusa: ritorna al primo punto)
 const dense=(poly,closed)=>{const out=[],n=poly.length;for(let i=0;i<(closed?n:n-1);i++){const a=poly[i],b=poly[(i+1)%n],m=Math.max(1,Math.round(Math.hypot(b[0]-a[0],b[1]-a[1])/28));for(let k=0;k<m;k++)out.push([a[0]+(b[0]-a[0])*k/m,a[1]+(b[1]-a[1])*k/m])}out.push(poly[closed?0:n-1].slice());return out};
 // percorso fuori strada: il tratto libero più lungo (almeno minL px) lungo la polilinea, tutto nella stessa classe di zona
 const walk=(pts,minL)=>{let best=null;for(const r of split(pts,ok)){if(r.p.length<2)continue;const e=path(r.p,0,0,0,r.c,1,0);e.off=1;if(e.L>=minL&&(!best||e.L>best.L))best=e}return best};
 // 1) strade: ogni strada serve alle auto; gli omini ne usano i tratti per classe di zona (una strada che non entra in siti speciali resta intera, come prima)
 let mx=0;
 for(const rd of M.roads){if(rd.pts.length<8||rd.pts.some(q=>inBase(q[0],q[1],250)))continue;
  const full=path(rd.pts,rd.w,rd.cls=='hw',rd.cls=='dirt',0,0,1);if(full.L<500)continue;
  const runs=split(rd.pts,null);
  if(runs.length==1){full.pc=runs[0].c;full.ped=1}
  CIV.rd.push(full);mx=Math.max(mx,full.L);
  if(runs.length>1)for(const r of runs){const e=path(r.p,rd.w,full.hw,full.dirt,r.c,1,0);if(r.p.length>=3&&e.L>=(r.c?140:400)){CIV.rd.push(e);mx=Math.max(mx,e.L)}}}
 let nsp=0;for(const s of M.sites)if(CIV_SITE[s.k])nsp+=CIV_SITE_N[CIV_SITE[s.k]][1];
 const cap=N_CIV_P+N_CIV_V+N_CIV_B+N_CIV_W+nsp+8;
 CIV.k=new Uint8Array(cap);CIV.r=new Uint16Array(cap);CIV.c=new Uint8Array(cap);CIV.h=new Uint8Array(cap);CIV.d=new Uint8Array(cap);
 CIV.s0=new Float32Array(cap);CIV.v=new Float32Array(cap);CIV.o=new Float32Array(cap);CIV.X=new Float32Array(cap);CIV.Y=new Float32Array(cap);CIV.H=new Float32Array(cap);
 CIV.gh=new Int16Array(CVGW*CVGH);CIV.gn=new Int16Array(cap);CIV.gd=1;   // testa di ogni cella, "prossimo" di ogni civile, griglia da ricostruire
 let n=0;
 const add=(j,car,c,h,s0,v,o)=>{if(n>=cap)return;CIV.k[n]=car;CIV.r[n]=j;CIV.c[n]=c;CIV.h[n]=h;CIV.s0[n]=s0;CIV.v[n]=v;CIV.o[n]=o;n++};
 const pickP=f=>{if(!CIV.rd.length)return -1;for(let t=0;t<40;t++){const j=R()*CIV.rd.length|0,r=CIV.rd[j];if(f(r)&&R()*mx<r.L)return j}return -1};   // più probabile sulle strade lunghe
 // gruppo di k omini della classe c che camminano insieme sul percorso j (c=0: colori a caso)
 const group=(j,k,c)=>{const r=CIV.rd[j],v=rr(22,38),s0=R()*2*r.L;
  for(let q=0;q<k;q++){const pal=c?CIV_CLS[c]:[ri(0,NC-1),ri(0,NC-1)];add(j,0,pal[0],pal[1],s0+q*rr(14,26),v+rr(-1.5,1.5),(q%2?1:-1)*rr(3,9))}};
 // 2) omini e auto sulle strade (come prima; gli omini non vanno sulle autostrade, le auto non sui sentieri)
 for(let i=0;i<N_CIV_P;i++){const j=pickP(r=>r.ped&&!r.pc&&!r.hw&&!r.off);if(j<0)continue;const r=CIV.rd[j];add(j,0,ri(0,NC-1),ri(0,NC-1),R()*2*r.L,rr(22,42),(R()<.5?1:-1)*(r.w/2+7))}
 for(let i=0;i<N_CIV_V;i++){const j=pickP(r=>r.car&&!r.dirt);if(j<0)continue;const r=CIV.rd[j],c=ri(0,CIV_VN-1);add(j,1,c,ri(0,NC-1),R()*2*r.L,rr(90,150)*CIV_VS[c],0)}
 // 3) intorno agli edifici: giro lungo il perimetro, si usa il tratto libero più lungo (isolati stretti: tratti corti o niente)
 const pool=M.blds.filter(o=>o.ty=='house'&&!o.sp&&!o.dead&&o.w>=90&&o.h>=90&&!inBase(o.x,o.y,200)).map(o=>[R(),o]).sort((a,b)=>a[0]-b[0]);
 let nb=0;
 for(const[,o]of pool){if(nb>=N_CIV_B)break;
  const hw=o.w/2+CP+12,hh=o.h/2+CP+12,T=(u,v)=>[o.x+u*o.c-v*o.s,o.y+u*o.s+v*o.c],e=walk(dense([T(-hw,-hh),T(hw,-hh),T(hw,hh),T(-hw,hh)],true),140);
  if(!e)continue;CIV.rd.push(e);const k=R()<.6?1:2;group(CIV.rd.length-1,k,e.pc);nb+=k}
 // 4) sparsi ovunque sulla mappa, a gruppetti (nei siti speciali diventano militari/operai da soli: la classe dipende dal punto)
 for(let t=0,nw=0;t<500&&nw<N_CIV_W;t++){const[x,y]=landXY(R,250,250,250),a=R()*TAU,L=rr(120,320),e=walk(dense([[x,y],[x+Math.cos(a)*L,y+Math.sin(a)*L]],false),100);
  if(!e)continue;CIV.rd.push(e);const k=ri(CIV_GRP[0],CIV_GRP[1]);group(CIV.rd.length-1,k,e.pc);nw+=k}
 // 5) siti speciali: prima i tratti di strada che ci passano dentro, poi gruppetti che camminano nel sito
 for(const s of M.sites){const c=CIV_SITE[s.k];if(!c)continue;const N=ri(CIV_SITE_N[c][0],CIV_SITE_N[c][1]);let m=0;
  for(let j=0,nj=CIV.rd.length;j<nj&&m<N/2;j++){const r=CIV.rd[j];if(r.off||!r.ped||r.pc!==c)continue;const q=r.p[r.p.length>>1];if(Math.hypot(q[0]-s.x,q[1]-s.y)<s.r&&R()<.7){const k=ri(1,2);group(j,k,c);m+=k}}
  for(let t=0;t<80&&m<N;t++){const a=R()*TAU,d=Math.sqrt(R())*s.r*.8,x=s.x+Math.cos(a)*d,y=s.y+Math.sin(a)*d,b=R()*TAU,L=rr(100,260),e=walk(dense([[x,y],[x+Math.cos(b)*L,y+Math.sin(b)*L]],false),90);
   if(!e||e.pc!==c)continue;CIV.rd.push(e);const k=Math.min(N-m,ri(1,3));group(CIV.rd.length-1,k,c);m+=k}}
 CIV.n=n;civTick(0)}
// posizione di tutti i civili vivi (poche centinaia di operazioni: nessun costo reale)
function civTick(dt){if(!CIV.n)return;CIV.t+=dt;const t=CIV.t;CIV.gd=1;
 for(let i=0;i<CIV.n;i++){if(CIV.d[i])continue;
  const r=CIV.rd[CIV.r[i]],L=r.L,m=(CIV.s0[i]+CIV.v[i]*t)%(2*L),fw=m<L,s=fw?m:2*L-m,cl=r.cl;
  let lo=0,hi=cl.length-2;while(lo<hi){const q=(lo+hi+1)>>1;if(cl[q]<=s)lo=q;else hi=q-1}
  const a=r.p[lo],b=r.p[lo+1],u=(s-cl[lo])/((cl[lo+1]-cl[lo])||1),tx=b[0]-a[0],ty=b[1]-a[1],tl=Math.hypot(tx,ty)||1,
   off=CIV.k[i]?(fw?1:-1)*r.w*.22:CIV.o[i];                 // auto: corsia di destra nel verso di marcia
  CIV.X[i]=a[0]+tx*u-ty/tl*off;CIV.Y[i]=a[1]+ty*u+tx/tl*off;CIV.H[i]=Math.atan2(ty,tx)+(fw?0:Math.PI)}}
// il client allinea piano piano l'orologio a quello dell'host
function civSync(ct){const d=ct-CIV.t;if(d>.5||d<-.5)CIV.t=ct;else CIV.t+=d*.25}
// morte di un civile. rem: 0 = decisione dell'host, 1 = evento ricevuto dall'host, 2 = come 1 ma senza suoni (chi entra a partita in corso)
function civKill(i,o,rem,x,y){if(i<0||i>=CIV.n||CIV.d[i])return;CIV.d[i]=1;
 if(rem){CIV.X[i]=x;CIV.Y[i]=y}
 const px=CIV.X[i],py=CIV.Y[i];civSplat(px,py,CIV.k[i],rem==2);
 if(rem)return;                                             // le kill dei giocatori arrivano ai client con lo snapshot
 if(NET.on)NET.cv.push([i,Math.round(px),Math.round(py)]);
 if(o!=null&&o>=0&&o<1000){const q=o===NET.id?P:others[o];if(q){q.kills=(q.kills|0)-CIV_PEN;if(q===P)say('Civile ucciso: -'+CIV_PEN+' kill')}}}
function civSplat(x,y,car,quiet){CIV.spl.push({x,y,v:Math.random()*3|0,a:Math.random()*TAU,sc:car?1.5*CIV_SV:CIV_SP});if(CIV.spl.length>SPL_MAX)CIV.spl.shift();
 if(quiet)return;fxSpawn(x,y,'#c01818',car?16:10,true,45);if(car)fxSpawn(x,y,'#777777',8,true,40);sfxAt(SFX_LIST.boom,.6,x,y,60)}
const civDeadPack=()=>{const a=[];for(let i=0;i<CIV.n;i++)if(CIV.d[i]==1)a.push([i,Math.round(CIV.X[i]),Math.round(CIV.Y[i])]);return a};
// colpo contro i civili: true = il proiettile si ferma (il razzo non uccide da sé: ci pensa la sua esplosione)
// la griglia si ricostruisce al primo colpo dopo ogni spostamento dei civili (nessuna allocazione)
function civGrid(){if(!CIV.gd)return;CIV.gd=0;CIV.gh.fill(-1);
 for(let i=0;i<CIV.n;i++){if(CIV.d[i])continue;const c=clamp(CIV.Y[i]/CVG|0,0,CVGH-1)*CVGW+clamp(CIV.X[i]/CVG|0,0,CVGW-1);CIV.gn[i]=CIV.gh[c];CIV.gh[c]=i}}
function civHitB(b){civGrid();
 const rm=Math.max(CIV_RP,CIV_RV),x0=clamp((b.x-rm)/CVG|0,0,CVGW-1),x1=clamp((b.x+rm)/CVG|0,0,CVGW-1),y0=clamp((b.y-rm)/CVG|0,0,CVGH-1),y1=clamp((b.y+rm)/CVG|0,0,CVGH-1);
 for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++)for(let i=CIV.gh[cy*CVGW+cx];i>=0;i=CIV.gn[i]){if(CIV.d[i])continue;
  const r=CIV.k[i]?CIV_VR[CIV.c[i]]:CIV_RP,dx=b.x-CIV.X[i],dy=b.y-CIV.Y[i];
  if(dx>r||dx<-r||dy>r||dy<-r||dx*dx+dy*dy>=r*r)continue;if(!b.ex)civKill(i,b.o);return true}
 return false}
function civArea(x,y,r,o){for(let i=0;i<CIV.n;i++){if(CIV.d[i])continue;if(Math.hypot(CIV.X[i]-x,CIV.Y[i]-y)<r+(CIV.k[i]?CIV_VR[CIV.c[i]]:CIV_RP))civKill(i,o)}}
function civCone(f,o,fire){for(let i=0;i<CIV.n;i++){if(CIV.d[i])continue;const r=CIV.k[i]?CIV_VR[CIV.c[i]]:CIV_RP;if(!f(CIV.X[i],CIV.Y[i],r))continue;
 civKill(i,o);if(fire&&CIV.d[i])burnRem(CIV.X[i],CIV.Y[i],r*.8,CIV.k[i]?8:6)}}   // f = test di cono o di arco (fiamma, mischia) · fire: ucciso dalla fiamma → resto in fiamme// ----- disegno: immagini pronte (create una volta sola) -----
// tipi di veicolo civile · w,h = dimensione dell'immagine · cols = colori possibili (un'immagine per colore)
// r = raggio d'impatto prima della scala · v = fattore di velocità
const CIV_VEH=[
 {n:'berlina', w:44,h:26,r:15,v:1,   cols:['#c8ccd4','#c83c3c','#3c6ac8','#d8b840']},
 {n:'sportiva',w:46,h:24,r:15,v:1.15,cols:['#d62828','#f77f00','#7b2cbf']},
 {n:'pickup',  w:50,h:28,r:17,v:.95, cols:['#c0392b','#2c6e9b','#e8e8e8']},
 {n:'furgone', w:52,h:28,r:18,v:.9,  cols:['#f2f2f2','#e0a030','#4f7fbf']},
 {n:'autobus', w:76,h:30,r:24,v:.7,  cols:['#e67e22','#2e86c1']},
 {n:'camion',  w:68,h:30,r:21,v:.75, cols:['#2e86c1','#c0392b','#1e8449']},
 {n:'jeep',    w:48,h:26,r:14,v:1,   cols:['#4b5a2a','#6b7a3a']},      // sempre verde militare
 {n:'blindato',w:58,h:30,r:19,v:.8,  cols:['#3f4d24']}];
// tabelle per immagine (stesso indice di CIVS.v e di CIV.c): quante sono, raggio d'impatto, fattore di velocità
const CIV_VN=CIV_VEH.reduce((s,t)=>s+t.cols.length,0),CIV_VR=[],CIV_VS=[];
for(const t of CIV_VEH)for(let k=0;k<t.cols.length;k++){CIV_VR.push(t.r*CIV_SV);CIV_VS.push(t.v)}
const CIV_RV=Math.max(...CIV_VR);                                         // raggio massimo (serve alla griglia dei colpi)

// ===== armerie: alcuni edifici scelti dal seed (uguali su tutti i client, niente rete) =====
const ARM={list:[],near:null};                                  // near = armeria a portata del giocatore locale
function armInit(){ARM.list=[];ARM.near=null;
 // Megastruttura: le armerie sono solo quelle della stanza armeria e le casse-armeria dell'hangar (o.armB);
 // gli edifici speciali vanno solo in stanze di tipo coerente (o.rt), altrimenti quel tipo non c'è.
 if(xMG(M.th)&&M.blds.some(o=>o.armB&&!o.dead)){for(const o of M.blds)if(o.armB&&!o.dead){o.arm=1;ARM.list.push(o)}
  SPB.list=[];SPB.near=null;const RT={pol:['sicurezza','armeria'],pri:['sicurezza','magazzino','stiva'],hos:['lab','infermeria'],off:['macchine','hangar','motori'],rad:['server','server2','comando','ponte'],gen:['reattore','macchine','motori']};   // astronave: armeria, stiva, infermeria, motori, ponte
  const S=rng(M.seed+7919),tys=Object.keys(SB_TYPES).map(k=>[S(),k]).sort((a,b)=>a[0]-b[0]).map(p=>p[1]).slice(0,S()*(SB_MAX+1)|0);
  const pool=M.blds.filter(o=>o.ty=='house'&&!o.bar&&!o.vipB&&!o.tg&&!o.rb&&!o.sp&&!o.dead&&!o.arm).map(o=>[S(),o]).sort((a,b)=>a[0]-b[0]);
  for(const ty of tys)for(const[,o]of pool){if(o.sb||!(RT[ty]||[]).includes(o.rt))continue;
   if(ARM.list.concat(SPB.list).every(b=>Math.hypot(o.x-b.x,o.y-b.y)>600)){o.sb=ty;SPB.list.push(o);break}}
  return}
 // In cooperativa/single l'armeria-obbligatoria è l'edificio idoneo più vicino allo spawn:
 // qualunque cosa ci sia vicino (città, griglia, ville, edifici singoli), si prende il primo
 // "house" senza ruoli speciali e lo si trasforma in armeria.
 // Se non c'è nessun edificio idoneo vicino, ci si accontenta delle sole N_ARM armerie casuali.
 let spawnArm=null;
 if(G.mode!=1){
  let best=null,bd=1e9;
  for(const o of M.blds){
   if(o.dead||o.ty!=='house'||o.bar||o.vipB||o.tg||o.rb||o.sp)continue;
   if(o.w<100||o.h<100)continue;
   const d=Math.hypot(o.x-START[0],o.y-START[1]);
   if(d<bd){bd=d;best=o}
  }
  if(best){best.arm=1;ARM.list.push(best);spawnArm=best}
 }
 // Le N_ARM armerie casuali (escluse quelle già scelte; spawnArm è già in ARM.list).
 const R=rng(M.seed+5107),pool=M.blds.filter(o=>o.ty=='house'&&!o.bar&&!o.vipB&&!o.tg&&!o.rb&&!o.sp&&!o.dead&&!o.arm&&o.w>=100&&o.h>=100).map(o=>[R(),o]).sort((a,b)=>a[0]-b[0]);
 for(const[,o]of pool){if(ARM.list.length>=N_ARM+(spawnArm?1:0))break;
  if(ARM.list.every(b=>Math.hypot(o.x-b.x,o.y-b.y)>1100)){o.arm=1;ARM.list.push(o)}}
 // Edifici speciali facoltativi: da 0 a SB_MAX tipi diversi (scelti dal seed), ognuno su un edificio idoneo lontano dagli altri
 SPB.list=[];SPB.near=null;
 const S=rng(M.seed+7919),tys=Object.keys(SB_TYPES).map(k=>[S(),k]).sort((a,b)=>a[0]-b[0]).map(p=>p[1]).slice(0,S()*(SB_MAX+1)|0);
 for(const ty of tys)for(const[,o]of pool){if(o.arm||o.sb)continue;
  if(ARM.list.concat(SPB.list).every(b=>Math.hypot(o.x-b.x,o.y-b.y)>900)){o.sb=ty;SPB.list.push(o);break}}}
function armTick(){let best=null,bd=ARM_R,sb=null,sd=ARM_R;
 if(G.menu){if(G.over||P.hp<=0)saveConfig();else $('cfg').classList.add('arm')}   // chiuso da solo se la partita finisce o il mech muore; se era aperto dal caricamento diventa trasparente
 if(P.hp>0&&!P.air&&!(P.vid>=0)&&!G.over&&!G.ext&&!G.menu){for(const o of ARM.list){if(o.dead)continue;const l=toLocal(o,P.x,P.y),d=bsd(o,l[0],l[1]);if(d<bd){bd=d;best=o}}
  for(const o of SPB.list){if(o.dead||!SB_TYPES[o.sb].t)continue;const l=toLocal(o,P.x,P.y),d=bsd(o,l[0],l[1]);if(d<sd){sd=d;sb=o}}}   // solo quelli che si usano col tasto R
 ARM.near=best;SPB.near=sb}
// ===== edifici speciali facoltativi (uguali su tutti i client, scelti in armInit) =====
const SPB={list:[],near:null};                                   // near = ospedale/officina/radar/generatore a portata del giocatore locale
// centrale di polizia colpita (da chiunque): ondata di poliziotti che attaccano tutti (solo singolo/host; i client li ricevono dallo snapshot)
function polWave(o){if(G.t<(o.pw==null?-1e9:o.pw)+POL_CD)return;o.pw=G.t;
 const n=Math.min(POL_N,POL_MAX-units.filter(u=>u.pol&&!u.dead).length);let c=0;
 for(let tr=0;tr<80&&c<n;tr++){const a=Math.random()*TAU,d=o.r+30+Math.random()*60,x=o.x+Math.cos(a)*d,y=o.y+Math.sin(a)*d;
  if(!clearAt(x,y,14))continue;
  const u=mkUnit(UK_POL,x,y,-1);u.pol=1;u.ms=1;u.st=2;u.hx=o.x;u.hy=o.y;u.lkx=o.x;u.lky=o.y;u.lkt=LOST_T;u.h=a;c++}
 if(c){announce('Centrale di polizia attaccata: la polizia spara a chiunque!');sfxAt(SFX_LIST.toGrunt,.8,o.x,o.y,0)}}
// prigione distrutta da un giocatore: PRI_N prigionieri liberati diventano suoi wingman (solo singolo/host)
function priBreak(o,by){const q=by===NET.id?P:others[by];if(!q)return;let c=0;
 for(let tr=0;tr<60&&c<PRI_N;tr++){const a=Math.random()*TAU,d=o.r+20+Math.random()*50,x=o.x+Math.cos(a)*d,y=o.y+Math.sin(a)*d;
  if(inWater(x,y,20)||!clearAt(x,y,20))continue;
  const w=spawnWingman(by,x,y,a);w.pri=1;c++;   // pri: non occupano i posti dell'upgrade Wingman
  if(NET.on)bcast({t:'pwmg',id:by,uid:w.id,x,y,a,pr:1})}
 if(c)announce(q.name+' ha liberato '+c+' prigionieri: diventano i suoi wingman!')}

const CAMP_KEY='airgrunt_campaign',CAMP_VER=1,CAMP_MAXLOST=3;
// pl = piano del capitolo in corso (durante la partita) o del prossimo (dopo la fine di un capitolo): {m missione, d difficoltà, p profilo mappa, w meteo, s seed}
const CAMP={on:0,want:0,sd:0,d0:1,len:7,res:[],fl:[],pl:null,done:0,ov:0,br:0,sh:'',tm:0,ac:null,al:null};   // ac / al = colori dell'AI nemica e alleata, fissi per tutta la campagna (null = da scegliere)   // done: 0 in corso · 1 campagna vinta · 2 campagna persa

// ===== nomi (dal seed di campagna) e frammenti di testo =====
const CN_OP1=['Falco','Melo','Lupo','Gufo','Squalo','Titano','Cinghiale','Drago'],CN_OP2=['Grigio','Nero','Rosso','Silente','Spettrale','Cremisi','d’Acciaio','di Cenere'];
const CN_CMD=['il colonnello Voss','il generale Patrick','il maggiore Drax','il colonnello Spawn','il generale Helios','il maggiore Dlegion'];
const CN_VIP=['l’ingegner Dolf','la dottoressa Veruska','il dottor Sirus','la professoressa Alina','lo scienziato Catellani','la scienziata Aniah'];
const CN_INTRO=['{Cmd} ha occupato la regione e la resistenza locale è all’ultima spiaggia. L’operazione {op} è l’ultima possibilità di riprendere la regione.','{Cmd} controlla ormai quasi tutta la regione. L’operazione {op} deve ribaltare le sorti della guerra o perderemo la regione.'];
let _nm=null;
function campNm(){if(!_nm||_nm.sd!==CAMP.sd){const R=rng((CAMP.sd^0x51ED)>>>0),pk=a=>a[R()*a.length|0];_nm={sd:CAMP.sd,op:pk(CN_OP1)+' '+pk(CN_OP2),cmd:pk(CN_CMD),vip:pk(CN_VIP),i:R()<.5?0:1}}return _nm}
function campT(s){const n=campNm(),U=x=>x.charAt(0).toUpperCase()+x.slice(1);
 return s.replace(/\{op\}/g,n.op).replace(/\{Cmd\}/g,U(n.cmd)).replace(/\{cmd\}/g,n.cmd).replace(/\{Vip\}/g,U(n.vip)).replace(/\{vip\}/g,n.vip)}

// ===== grafo narrativo: una voce per missione =====
// b = briefing · bv = varianti del briefing [flag, testo] (vale la prima i cui flag esistono) · bf / bfv = briefing e varianti se è il capitolo FINALE (facoltativi) · w / l = conseguenza di vittoria / sconfitta
// sw / sl = flag impostati da vittoria / sconfitta · fw / fl = testi se è il capitolo FINALE (epilogo) · fwv = varianti dell'epilogo di vittoria [flag, testo] (vale la prima i cui flag esistono)
// Flag: sup/noSup scorte · vip/noVip tecnico · sab/hard difese nemiche · cmd/cmdLive comandante · fwd/noFwd base avanzata · ally/noAlly alleati · held/baseLost base · pilots/pilotsLost superstiti · ship/noShip nave spaziale · navy/fleet flotta nemica (affondata / ancora in mare)
const CM={
 0:{b:'Il nemico presidia il settore con forze notevoli, rifornite costantemente dalle sue caserme, e si crede al sicuro. Stermina ogni nemico e caserma come atto dimostrativo, fagli capire che non importa quanti soldati schiera, noi possiamo spazzarli via tutti, per altro divertendoci nel farlo!',
  bv:[['cmd','Senza {cmd} l’esercito nemico è nel panico, ma presidia ancora il settore con forze notevoli e per ora si crede al sicuro. Stermina ogni nemico e caserma come atto dimostrativo: fagli capire che se il loro capo non ha avuto scampo, figuriamoci loro!'],
   ['sab','Con le difese del settore a pezzi il nemico è più vulnerabile, ma presidia ancora l’area con forze notevoli. Stermina ogni nemico e caserma come atto dimostrativo, fagli capire che non importa quanti soldati schiera, noi possiamo spazzarli via tutti, per altro divertendoci nel farlo!'],
   ['fwd','Dalla nostra base avanzata il settore è sotto controllo, ma il nemico presidia ancora l’area con forze notevoli pensa di poter resistere. Stermina ogni nemico e caserma come atto dimostrativo, fagli capire che non importa quanti soldati schiera, noi possiamo spazzarli via tutti, per altro divertendoci nel farlo!']],
  bf:'Il nemico ha ritirato ogni forza rimasta nel settore: è la sua ultima resistenza, non ha più riserve né rinforzi. Stermina ogni nemico e distruggi le caserme: quando l’ultimo soldato nemico cade, la guerra è vinta... nessuno potrà più opporsi.',
  bfv:[['cmd','Senza {cmd} il comando nemico è allo sbando, ma i suoi ultimi soldati si sono asserragliati nel settore in un’ultima resistenza disperata. Stermina ogni nemico e distruggi le caserme: quando l’ultimo soldato cade, la guerra è vinta. Nessun altro oserà pù opporsi.'],
   ['sab','Le difese nemiche sono a pezzi e i suoi ultimi soldati si sono asserragliati nel settore in un’ultima resistenza disperata, senza riserve né rinforzi. Stermina ogni nemico e distruggi le caserme: quando l’ultimo soldato cade, la guerra è vinta. Il nostro controllo sulla regione sarà totale.'],
   ['ally','Gli alleati hanno circondato ed isolato il nemico: i suoi ultimi soldati si sono asserragliati nel settore in un’ultima resistenza disperata, senza riserve né rinforzi. Stermina ogni nemico e distruggi le caserme: quando l’ultimo soldato cade, la guerra è vinta. Nessuno oserà mai più opporsi a questa alleanza.']],
  w:'Il settore è stato pacificato...e abbiamo mandato un chiaro messaggio al nemico: ci siamo divertiti nel farlo!',l:'Forse avevamo sottovalutato la forza del nemico. Questo fallimento ci sia di lezione.',sw:[],sl:[],
  fw:'Non resta un solo soldato nemico nel settore: l’ultima resistenza è stata spezzata e le caserme sono macerie. Il nemico non ha più un esercito, la guerra è vinta. Opporsi a noi significa tramutarsi in cenere.',fl:'L’ultima resistenza nemica ha tenuto: i suoi soldati hanno respinto i nostri attacchi e ora hanno le forze per riprendersi la regione. Non ci sono più uomini né mezzi, la nostra eliminazione è la giusta conseguenza per questa sconfitta.'},
 1:{b:'Un convoglio di rifornimenti deve attraversare territorio nemico per raggiungere un avamposto, ma bisogna passare via terra per evitare la possente difesa anti-aerea nemica. Aprigli la strada e scortalo fino a destinazione.',
  bv:[['hard','Le difese nemiche del settore sono state rinforzate: il convoglio dovrà aprirsi la strada tra imboscate e blocchi stradali ancora più letali.'],
   ['fleet','La flotta nemica controlla ancora il mare e ogni rifornimento via nave finisce sul fondo: resta solo la strada, sotto l’antiaerea e tra le pattuglie nemiche. Aprigli la strada e scortalo fino a destinazione.']],
  w:'Il convoglio è arrivato al nostro avamposto: ora l’avamposto ha armi sufficienti per difendere l’area e lanciare missioni offensive.',l:'Il convoglio è stato distrutto: le scorte dell’avamposto sono ridotte al minimo, riusciranno a malapena a difendersi ma non per molto, e di certo non ad aiutarci.',sw:['sup'],sl:['noSup']},
 2:{b:'{Vip}, uno scienziato chiave della resistenza, ha sottratto al nemico una preziosa nuova tecnologia oltre ad informazioni vitali, ma ora è bloccato in un edificio nemico. Recuperalo e scortalo all’estrazione. Questa volta... vivo magari.',
  bv:[['noSup','Senza rifornimenti la resistenza locale è allo stremo e {vip} è l’ultima speranza di recuperare nuove risorse ed un vantaggio tecnologico per non essere spazzati via. Recuperalo e portalo al sicuro.']],
  w:'{Vip} è in salvo e ha consegnato i piani del nemico ed una preziosa nuova tecnologia.',l:'{Vip} è nelle mani del nemico: la resistenza è cieca senza informazioni vitali.',sw:['vip'],sl:['noVip']},
 3:{b:'Alcune strutture chiave sono essenziali per le difese nemiche. Senza queste strutture le difese nemiche perderanno molta della loro efficacia e coordinazione. Distruggile tutte.',
  bv:[['sup','Con i rifornimenti arrivati all’avamposto ora puoi colpire più a fondo: distruggi le strutture chiave che alimentano le difese nemiche.'],['vip','{Vip} ha individuato i punti deboli della difesa nemica: distruggi le strutture chiave che alimentano le difese nemiche e la loro efficacia crollerà drasticamente.']],
  w:'Le difese nemiche del settore sono a pezzi: il nemico ora è più vulnerabile.',l:'Il sabotaggio è fallito: il nemico ora ha rinforzato e decentralizzato i punti deboli che alimentano le sue difese, sarà più difficile indebolire le difese nemiche.',sw:['sab'],sl:['hard']},
 4:{b:'{Cmd} si muove tra le città del settore, seminando distruzione e gravi perdite tra le nostre difese. Pare che abbia una nuova tecnologia ed armi efficacissime. Sta seminando il terrore tra le nostre difese, ma la sua leggenda finisce qua. Trovalo ed eliminalo, in modo spettacolare se possibile.',
  bv:[['vip','{Vip} ha scoperto dove si trova {cmd}: è il momento di prendere l’iniziativa e colpirlo quando non se lo aspetta. Questa volta invece di subire i suoi attacchi saremo noi ad attaccarlo.'],['pilots','I superstiti hanno visto dove si trova il terrore delle nostre difese: {cmd}: è il momento di colpirlo mentre non se lo aspetta invece di subire sempre la sua offensiva.']],
  w:'{Cmd} è caduto: l’esercito nemico è nel panico per la brutale eliminazione della sua leggenda. Ora sono facili prede dei nostri attacchi.',l:'{Cmd} è sfuggito al tentativo di assassinio, mantenendo l’aura leggendaria che lo avvolge, e ora è più cauto e più pericoloso, ed i suoi soldati ancora più motivati.',sw:['cmd'],sl:['cmdLive']},
 5:{b:'Ci servono avamposti per organizzare le nostre difese nella zona e far partire attacchi verso il nemico. Al tempo stesso dobbiamo indebolire il nemico: occupa gli avamposti nemici e difendili dal contrattacco nemico finché non sono in sicurezza.',
  bv:[['sab','Le difese indebolite del nemico ti permettono di occupare facilmente gli avamposti nemici: conquistali e difendili dai contrattacchi finchè non sono in sicurezza.']],
  w:'Gli avamposti nemici ora sono nostri: la resistenza locale ora ha una base avanzata da cui può far partire attacchi verso il nemico.',l:'L’assalto agli avamposti nemici è stato respinto: non siamo riusciti ad insediarci nella zona ed il nemico è libero di contrattaccare con ancora maggior forza.',sw:['fwd'],sl:['noFwd']},
 6:{b:'Sappiamo che il nemico utilizza dispositivi nucleari, e ora sappiamo dove si trovano. Anche se la loro difesa anti-aerea blocca ogni nostro bombardamento, praticamente hanno una bomba nucleare già pronta dietro le loro linee, basta solo farla esplodere. Conquista il sito, innesca la detonazione e raggiungi l’estrazione prima che esploda.',
  bv:[['cmdLive','{Cmd} è sempre più agguerrito e intenzionato ad usare il suo arsenale nucleare... ma solo se questo non esplode prima! Conquista il sito nucleare, innesca la detonazione e raggiungi l’estrazione prima che esploda.'],
   ['ship','La nave spaziale che abbiamo rubato ci dà il controllo dell’orbita, ma l’antiaerea nemica blocca comunque ogni bombardamento: comunque l’arsenale nucleare nemico è come una bomba già pronta dietro le loro linee, basta solo farla esplodere. Conquista il sito, innesca la detonazione e raggiungi l’estrazione prima che esploda.'],
   ['noShip','Il nemico ha ripreso la sua nave spaziale e ci sovrasta dall’orbita, tuttavia l’arsenale nucleare nemico è come una bomba già pronta dietro le loro linee: basta solo farla esplodere. Conquista il sito, innesca la detonazione e raggiungi l’estrazione prima che esploda.']],
  w:'L’arsenale nemico non esiste più, è stato spazzato via ed ora non restano che ceneri e rimasugli di quello che era un grande esercito.',l:'L’arsenale nucleare è rimasto saldamente nelle mani del nemico, ed ora sicuramente lo userà contro le nostre difese, con effetti devastanti.',sw:[],sl:[],
  fw:'L’arsenale nemico non esiste più: {cmd} ha perso la sua arma finale ed il suo esercito, la guerra è vinta e dovrà accettare le nostre condizioni. Potremmo perfino offrigli un lavoro...',
  fwv:[['cmd','L’arsenale nemico non esiste più: con {cmd} già caduto, il nemico non ha più né un capo né un’arma finale, e il suo esercito è allo sbando. La guerra è vinta per annientamento totale, da parte nostra è un perfetto esempio di strategia militare.']],
  fl:'L’arsenale nucleare è rimasto intatto sotto il controllo nemico: la resistenza locale è stata spazzata via, non possiamo più opporci al nemico, è finita.'},
 7:{b:'Un’opportunità rara: una nave spaziale del nemico è in cantiere per riparazioni e rifornimenti. Rubare quella nave significa di colpo una nave in più per noi ed una in meno per il nemico. Conquista la centrale energetica che la alimenta e il cantiere spaziale che la trattiene, poi raggiungi la nave e imbarcati: decolla e lascia il settore.',
  bv:[['vip','{Vip} conosce i sistemi della nave spaziale nemica ferma in cantiere e sa come rubarla: conquista la centrale energetica e il cantiere, poi imbarcati e fai decollare la nave.'],
   ['pilots','I superstiti dello schianto sanno pilotare le navi nemiche: una nave spaziale è ferma in cantiere per riparazioni, e si può rubare. Conquista la centrale energetica e il cantiere, poi imbarcati e fai decollare la nave.'],
   ['sab','Con le difese del settore a pezzi puoi tentare il colpo grosso: una nave spaziale nemica è ferma in cantiere per riparazioni. Conquista la centrale energetica e il cantiere, poi imbarcati: la nave sarà un’arma decisiva per la resistenza.'],
   ['hard','Il nemico ha rinforzato le difese del settore, ma la sua nave spaziale in cantiere vale ogni rischio. Conquista la centrale energetica e il cantiere, poi imbarcati e fai decollare la nave prima che finiscano le riparazioni.']],
  w:'La nave spaziale del nemico ora è nostra: ha lasciato il settore ed è in orbita sotto il nostro controllo, e i suoi sistemi di puntamento ci permettono di guidare attacchi nucleari sui bersagli che marchiamo. Il nemico ci ha fatto proprio un bel regalo.',l:'La nave spaziale è rimasta a terra in mano al nemico, che sta completando le riparazioni. Non capiterà più un’opportunità simile.',sw:['ship'],sl:['noShip'],
  fw:'La nave spaziale che abbiamo sottratto al nemico è in orbita: la resistenza locale ora ha un’arma decisiva, con il supporto orbitale e perfino i loro codici il nemico è spacciato. La guerra è vinta... grazie a questo splendido massacro atomico unilaterale che vedete sui monitor in tempo reale.',fl:'La nave spaziale è rimasta a terra in mano al nemico che ha terminato le riparazioni. Appena tornata in orbita la nave ha cominciato a bombardare le nostre difese con armi nucleari. Proprio mentre parliamo gli scudi stanno cedendo e il prossimo colpo ci ridurrà in cenere. Almeno non sopravviveremo al nostro fallimento. Ammirate la luce...'},
 8:{b:'Dieci delegati delle regioni nostre alleate raggiungono un vertice segreto, uno alla volta, in furgoni blindati. Discuteranno e decideranno se supportare la nostra causa oppure no. L’edificio del meeting è nel nostro territorio, ma sospettiamo che il nemico non si farà scappare un occasione così ghiotta. Difendi l’edificio del meeting e non lasciare che il nemico uccida i delegati, cosa che proverà sicuramente a fare.',
  bv:[['fwd','Si terrà un vertice segreto per discutere con i delegati di regioni alleate se darci maggior supporto: dieci delegati alleati arrivano uno alla volta in furgoni blindati. Anche se siamo in territorio alleato sospettiamo che il nemico non si farà scappare un occasione così ghiotta. Difendi l’edificio del meeting e non lasciare che il nemico uccida i delegati.']],
  w:'Il vertice si è svolto: la sicurezza che gli abbiamo garantito li ha convinti a fornirci supporto.',l:'Le gravi perdite hanno fatto saltare il vertice. Gli alleati hanno perso fiducia nelle nostre capacità militari e ci hanno negato ogni supporto.',sw:['ally'],sl:['noAlly'],
  fw:'Il vertice dei delegati ha imposto l’armistizio al nemico, visto lo squilibrio di forze. {cmd} essendo isolato ed in inferiorità assoluta, ha deciso di arrendersi prima di capitolare ed essere eliminato... mossa astuta. La guerra è finita, abbiamo vinto, ma è sembrata più una manovra politica che militare, comunque ora la regione è nostra... e per una generosa percentuale è anche dei nostri alleati.',
  fwv:[['cmd','Il vertice dei delegati ha imposto l’armistizio al nemico: con {cmd} eliminato il comando nemico è allo sbando, le sue forze sono isolate ed in inferiorità assoluta e si arrendono senza condizioni. La guerra è finita, abbiamo vinto, ma è sembrata più una manovra politica che militare, comunque ora la regione è nostra... e per una generosa percentuale è anche dei nostri alleati.']],
  fl:'Il vertice è fallito: gli alleati erano la nostra unica speranza, molti sono rimasti neutrali ed alcuni si sono perfino alleati con il nemico. La resistenza locale è spacciata, ormai possono eliminarci facilmente dall’orbita, opporsi sarebbe solo un inutile spreco di risorse. dobbiamo arrenderci al nemico ed accettare le sue condizioni. Subito dopo la firma dell’armistizio, tra le nostre fila molte teste cadranno, in senso letterale.'},
 9:{b:'Un attacco nemico ad una nostra base è imminente. Il nemico ha forze ingenti ed assalterà incessantemente in modo frontale e diretto, contando sui suoi numeri. Dobbiamo dimostrargli che il numero non basta. Difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.',
  bv:[['noFwd','Dopo il fallimento nella conquista degli avamposti il nemico contrattacca pesantemente mirando direttamente alla nostra base: difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.'],['fwd','Il nemico vuole riprendersi i territori perduti e attacca direttamente la nostra base avanzata con forze soverchianti: difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.'],
   ['ship','Il nemico non ha perdonato il furto della nave spaziale e attacca direttamente la nostra base con forze soverchianti, deciso a vendicarsi. Difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.'],
   ['noShip','Il nemico ha riparato la sua nave spaziale e, forte del supporto orbitale, attacca direttamente la nostra base con forze soverchianti: difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.'],
   ['fleet','La flotta nemica, rimasta padrona del mare, ha sbarcato truppe fresche a ridosso della nostra base: l’assalto è imminente e sarà incessante. Difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.']],
  w:'La nostra base ha respinto le ondate nemiche ed è ancora operativa: il nemico ha perso l’iniziativa e molte unità.',l:'La nostra base è stata distrutta: la resistenza locale è in ritirata ed abbiamo ceduto molto territorio al nemico.',sw:['held'],sl:['baseLost'],
  fw:'La nostra base ha resistito all’ultimo devastante assalto nemico: ci hanno mandato contro tutto quello che avevano, e noi lo abbiamo ridotto in poltiglia. Ora l’offensiva nemica è spezzata, non gli rimane più un esercito, la guerra è vinta. Stermineremo i nemici superstiti come atto dimostrativo per evitare future ribellioni.',fl:'La nostra ultima base nel settore è stata travolta dalle ondate nemiche: non abbiamo più possibilità nè mezzi per contrastare il nemico. La regione è persa. Mentre parliamo il nemico sta per sfondare la porta di questo bunker, suggerisco di completare il nostro fallimento con un ultima grande esplosione...'},
 10:{b:'Una dropship alleata è stata abbattuta dall’antiaerea nemica ed ha fatto un atterraggio di emergenza nel settore. Cadendo ha trasmesso un segnale di soccorso che parlava di 3 capsule di salvataggio con VIP a bordo. Trova il relitto in territorio nemico e porta in salvo i superstiti che trovi, potrebbero essere preziosi.',
  bv:[['noVip','La resistenza locale ha già perso {vip} ed ora l’antiaerea nemica ha abbattuto una dropship con a bordo altri componenti chiave della resistenza locale. Non possiamo permetterci di perdere altri elementi essenziali. Se le capsule di salvataggio hanno retto, i VIP potrebbero essere ancora vivi. Trova il relitto in territorio nemico e porta in salvo i superstiti.']],
  w:'I superstiti dello schianto sono in salvo: i racconti delle loro ricognizioni svelano le mosse del nemico, dandoci un notevole vantaggio.',l:'I superstiti dello schianto sono andati perduti: la resistenza locale ha subito un altra grave perdita oggi.',sw:['pilots'],sl:['pilotsLost']},
 11:{b:'Tre navi da guerra di {cmd} sono ancorate al largo della costa: bombardano le nostre posizioni e proteggono gli sbarchi dei rinforzi nemici. Raggiungi la costa e affondale tutte e tre. Mira agli scafi: le torrette smetteranno di spararci dal fondo del mare.',
  bv:[['noSup','Senza i rifornimenti via terra l’unica speranza è il mare, ma tre navi da guerra nemiche bloccano ogni avvicinamento alla costa. Affondale tutte e tre e le nostre scorte potranno finalmente arrivare via nave.'],
   ['vip','{Vip} ha decifrato la posizione della flotta nemica che ci bombarda: tre navi da guerra sono all’ancora al largo della costa, ferme a rifornirsi. Raggiungile e affondale tutte e tre prima che ripartano.'],
   ['pilots','I superstiti dello schianto hanno visto dove si nasconde la flotta che ha guidato l’antiaerea contro la loro dropship: sono tre navi da guerra al largo della costa. Mandale a fondo tutte e tre, sarà un duro colpo per il nemico.'],
   ['hard','Il nemico ha rinforzato le difese e ora porta i rinforzi via mare, protetti da tre navi da guerra che presidiano la costa. Affondale tutte e tre ed interromperemo il flusso di rinforzi nemici.']],
  w:'La flotta nemica ora riposa sul fondo del mare: il nemico ha perso il controllo della costa e i nostri rifornimenti ora possono arrivare via nave.',l:'La flotta nemica è ancora a galla e domina la costa: il nemico continua a sbarcare rinforzi e a cannoneggiare le nostre posizioni.',sw:['navy'],sl:['fleet'],
  fw:'L’ultima risorsa di {cmd} , e cioè la sua flotta, è ora sul fondo del mare. Senza navi il nemico è rimasto isolato e circondato, senza rinforzi, munizioni e speranza. Si arrendono senza condizioni, la guerra è vinta. Presto sorgerà un museo subacqueo nei relitti delle navi nemiche, per mostrare a tutti che fine fa chi si oppone al nostro dominio.',
  fl:'La flotta nemica domina ancora il mare: i rinforzi nemici sbarcano senza sosta e le nostre ultime difese sulla costa sono state spazzate via. La regione è persa, siamo circondati e l’unica via di fuga ormai era proprio il mare... ora resteremo qui ad affrontare le conseguenze del nostro fallimento.'}
};

// ===== regista =====
const campLost=r=>r.filter(x=>!x[1]).length;
function campPick(n,len,F,res,R){   // sceglie la missione del capitolo n (0 = primo, len-1 = finale); mai una missione già giocata
 const used=new Set(res.map(r=>r[0])),last=res.length?res[res.length-1]:null,lf=!!(last&&!last[1]),lost=campLost(res),has=f=>F.indexOf(f)>=0;
 let W;
 if(n<2)W={1:3,5:3,2:2,3:2};                                                  // apertura: missioni "leggere"
 else if(n>=len-1)W={0:1+(has('cmd')?2:0)+(has('sab')?2:0),6:1+(has('cmdLive')?2:0)+(has('hard')?2:0)+(has('noFwd')?1:0),7:1+(has('vip')?3:0)+(has('sab')?2:0),8:1+(has('cmd')?3:0)+(has('ally')?2:0),9:1+(has('fwd')?3:0)+(lost>=2?3:0),11:1+(has('noSup')?2:0)+(has('hard')?1:0)};   // finale: dipende da ciò che è successo
 else W={0:has('sab')||has('cmd')?3:lf?1:2,1:has('noSup')?4:1,2:lf?2:1,3:has('sup')?3:2,4:has('vip')||has('pilots')?4:1,5:1,6:has('cmdLive')||has('hard')?2:1,7:has('vip')||has('sab')?3:1,8:has('fwd')||has('sup')?3:1,9:last&&last[0]==5&&lf?8:has('fwd')?2:1,10:has('noVip')||lf?3:1,11:has('noSup')?4:has('hard')||has('pilots')?3:2};   // sviluppo: reagisce all'ultimo esito
 let c=Object.keys(W).map(Number).filter(k=>!used.has(k)&&W[k]>0);
 if(!c.length)c=Array.from({length:MIS_N+1},(_,i)=>i).filter(k=>!used.has(k));
 if(!c.length)return 0;
 let t=0;for(const k of c)t+=W[k];let x=R()*t;
 for(const k of c){x-=W[k];if(x<0)return k}
 return c[c.length-1]}
function campPlan(n){const C=CAMP,F=C.fl,lost=campLost(C.res),R=rng((C.sd^Math.imul(n+1,0x9E3779B1))>>>0),m=campPick(n,C.len,F,C.res,R);
 let d=C.d0+(n>=C.len-2?1:0)+(F.indexOf('hard')>=0?1:0)-(F.indexOf('sab')>=0?1:0);
 if(lost>=2)d=Math.min(d,C.d0);                                               // "ultima occasione": la difficoltà non sale
 const v=R(),w=v<.5?0:v<.7?1:v<.85?2:3,p=R()<.5?0:1+(R()*PROFILES.length|0);
 return{m,d:clamp(d,1,10),p,w,s:(R()*1e5)|0}}

// ===== stato: nuova campagna, esito di un capitolo, applicazione dei parametri =====
function campNew(d0){const C=CAMP;C.on=1;C.done=0;C.ov=0;C.sd=(Math.random()*1e9)|0;C.d0=clamp(d0|0||1,1,10);C.res=[];C.fl=[];C.ac=null;C.al=null;C.len=7+(rng(C.sd)()<.5?0:1);C.pl=campPlan(0);campSave()}   // colori delle AI: li sceglie aiColors() all'avvio del primo capitolo
function campFinish(v){const C=CAMP;if(!C.on||C.done||G.mode==1)return;   // solo l'host (o il singolo) arriva qui: finish() è autorevole
 const m=G.mt||C.pl.m,win=v==2?1:0,fin=C.res.length>=C.len-1,e=CM[m]||CM[0];
 C.res.push([m,win]);for(const f of win?e.sw:e.sl)if(C.fl.indexOf(f)<0)C.fl.push(f);
 if(fin)C.done=win?1:2;else if(campLost(C.res)>CAMP_MAXLOST)C.done=2;        // finale perso o 4ª sconfitta: campagna persa
 if(!C.done)C.pl=campPlan(C.res.length);                                      // da qui pl è il piano del PROSSIMO capitolo
 campSave()}
function campApply(){const p=CAMP.pl;G.sel=p.m||-1;G.diff=p.d;G.profile=p.p;G.weatherMode=p.w;return p.s}   // imposta i parametri del capitolo e restituisce il seed della mappa (missione 0 = sterminio = G.sel -1; G.sel 0 significherebbe "casuale")
function campNext(){if(CAMP.done)campNew(CAMP.d0);return campApply()}         // chiamata da restartGame (solo host/singolo)
function campBoot(){const sv=$('lobCampSel').value=='1'?campLoad():null;if(sv){campUnpack(sv);CAMP.ov=0}else campNew(G.diff);return campApply()}
function firstSeed(){if(!CAMP.want){CAMP.on=0;return newSeed()}return campBoot()}   // seed della prima partita dalla lobby (campagna o missione normale)

// ===== rete e salvataggio: lo stato è piccolo (pochi numeri e stringhe) =====
const campPack=()=>CAMP.on?{sd:CAMP.sd,d0:CAMP.d0,len:CAMP.len,res:CAMP.res,fl:CAMP.fl,pl:CAMP.pl,dn:CAMP.done,ov:G.over?1:0,ac:CAMP.ac,al:CAMP.al}:0;
function campUnpack(o){const C=CAMP;if(!o||!o.pl){C.on=0;return}
 Object.assign(C,{on:1,sd:o.sd|0,d0:(o.d0|0)||1,len:(o.len|0)||7,res:o.res||[],fl:o.fl||[],pl:o.pl,done:o.dn|0,ov:o.ov|0,ac:o.ac!=null?o.ac|0:null,al:o.al!=null?o.al|0:null})}
function campSave(){try{if(!CAMP.on||CAMP.done)localStorage.removeItem(CAMP_KEY);else localStorage.setItem(CAMP_KEY,JSON.stringify(Object.assign({v:CAMP_VER},campPack())))}catch(_){}}
function campLoad(){try{const o=JSON.parse(localStorage.getItem(CAMP_KEY)||'null');
 if(o&&o.v===CAMP_VER&&Array.isArray(o.res)&&Array.isArray(o.fl)&&o.pl&&o.len>2&&!o.dn&&o.res.length<o.len)return o}catch(_){}return null}

// ===== sblocco upgrade (solo campagna): missione vinta → upgrade sbloccato =====
// PER AGGIUNGERNE UNO basta una riga: id missione → [id upgrade di AGconf.js]. Gli upgrade non in tabella sono sempre disponibili.
const CAMP_UNLOCK={0:['pierce'],1:['grlm'],2:['shield'],3:['w'+W_GRN],4:['plasma'],5:['turret'],6:['stealth'],7:['w'+W_NUK],8:['revive'],9:['gdr'],10:['radar'],11:['wingman']};   // 11 (Affonda la flotta): nessuna ricompensa da quando "Danno per caricatore" è dentro Proiettili perforanti
// bonus raro "Slow motion": vincendo un recupero VIP (missioni 2 e 10) dalla metà campagna in poi c'è il 25% di ottenerlo, in più all'upgrade della missione.
// Deterministico da seed e risultati (stessa logica del regista): niente da salvare né da inviare in rete.
const CAMP_VIPM=[2,10],CAMP_SLOW_P=.25;
const campSlowWin=i=>{const C=CAMP,r=C.res[i];return !!(r&&r[1]&&CAMP_VIPM.indexOf(r[0])>=0&&i>=(C.len>>1)&&rng((C.sd^Math.imul(i+1,0x2545F491))>>>0)()<CAMP_SLOW_P)};   // i = capitolo (0 = primo)
function campUpMis(id){for(const m in CAMP_UNLOCK)if(CAMP_UNLOCK[m].indexOf(id)>=0)return +m;return -1}   // missione che sblocca l'upgrade (-1 = sempre disponibile)
const upLocked=id=>{if(!CAMP.on)return false;if(id==='slowmo')return !CAMP.res.some((r,i)=>campSlowWin(i));const m=campUpMis(id);return m>=0&&!CAMP.res.some(r=>r[0]===m&&r[1])}   // bloccato = in campagna e missione non ancora vinta (slowmo: solo col bonus raro)
const campLockTxt=id=>id==='slowmo'?'   Bonus raro ('+Math.round(CAMP_SLOW_P*100)+'%): vincendo '+MIS_NAMES[2]+' o '+MIS_NAMES[10]+' dopo metà campagna':'   Si sblocca vincendo: '+(MIS_NAMES[campUpMis(id)]||'?')+' (campagna)';
const campUpNames=m=>(CAMP_UNLOCK[m]||[]).map(id=>{const W=/^w\d+$/.test(id)?WEAPONS[+id.slice(1)]:null;if(W)return W.n.trim();const u=UPGRADES.find(x=>x.id===id);return u?u.n:id}).join(', ');
const campUnlockLine=m=>CAMP_UNLOCK[m]?'<div style="color:#ffd23f;margin:4px 0">🔓 Upgrade sbloccato: <b>'+campUpNames(m)+'</b></div>':'';
const campRewardLine=m=>CAMP_UNLOCK[m]?'<div style="color:#9bd3a1;margin:4px 0">🎁 Ricompensa: <b>'+campUpNames(m)+'</b></div>':'';
const campSlowLine=i=>campSlowWin(i)?'<div style="color:#b27dff;margin:4px 0">✨ Bonus raro: <b>Slow motion</b> (tecnologia sperimentale portata in salvo con il VIP)</div>':'';
// toglie dalle caselle gli upgrade ancora bloccati (nuova campagna: si riparte da zero)
// casella (arma 'w<n>' o upgrade 'u:<id>') → chiave in CAMP_UNLOCK, e se è bloccata in campagna
const lockKey=id=>id[0]=='u'?id.slice(2):id;
const itemLocked=id=>!!id&&upLocked(lockKey(id));
function campClampLoadout(){if(!CAMP.on)return;for(let i=0;i<loadout.length;i++){const s=loadout[i];if(s&&itemLocked(s))loadout[i]=null}}

// ===== lobby: la modalità "Campagna" mostra Nuova/Continua e nasconde missione, mappa e meteo (li decide la campagna) =====
function campLobby(){const m=$('lobMode').value,c=m=='2',d=m=='3';
 $('lobMisRow').style.display=m=='0'?'flex':'none';
 $('lobCampRow').style.display=c?'flex':'none';
 if($('lobDuelRow'))$('lobDuelRow').style.display=d?'flex':'none';
 for(const id of ['lobProfile','lobWeather'])$(id).parentNode.style.display=c?'none':'flex';
 if(c){const sv=campLoad(),o=$('lobCampSel').options[1];o.disabled=!sv;
  o.textContent=sv?'Continua (cap. '+(sv.res.length+1)+'/'+sv.len+' · sconfitte '+campLost(sv.res)+'/'+CAMP_MAXLOST+')':'Continua (nessun salvataggio)';
  if(!sv)$('lobCampSel').value='0'}}

// ===== presentazione: briefing e debriefing sono HTML locale, non bloccano la partita (pointer-events:none) =====
const campTag=()=>'CAP. '+(CAMP.res.length+1)+'/'+CAMP.len+' · PERSE '+campLost(CAMP.res)+'/'+CAMP_MAXLOST+' · ';
function campStrip(cur){let s='';for(let i=0;i<CAMP.len;i++){const r=CAMP.res[i];
 s+=(r?'<b style="color:'+(r[1]?'#7dff8a':'#ff6a5a')+'">'+(r[1]?'✔':'✖')+'</b>':i===cur?'<b style="color:#ffd23f">▶</b>':'<span style="opacity:.5">'+(i==CAMP.len-1?'★':'·')+'</span>')+' '}
 return s}
function campLastText(){const C=CAMP,r=C.res[C.res.length-1];if(!r)return'';const e=CM[r[0]]||CM[0],fin=C.res.length>=C.len;
 let fw=fin&&e.fw;if(fw)for(const v of e.fwv||[])if(C.fl.indexOf(v[0])>=0){fw=v[1];break}   // epilogo di vittoria: vale la prima variante (fwv) i cui flag esistono
 return campT(r[1]?fw||e.w:(fin&&e.fl)||e.l)}
function campBrief(){const C=CAMP,p=C.pl,n=C.res.length,m=G.mt||p.m,e=CM[m]||CM[0],nm=campNm(),lost=campLost(C.res),fin=n>=C.len-1;
 let b=e.b,bv=e.bv;if(fin&&e.bf){b=e.bf;bv=e.bfv}   // capitolo finale: se la missione ha un briefing da finale (bf) usa quello e le sue varianti (bfv)
 for(const v of bv||[])if(C.fl.indexOf(v[0])>=0){b=v[1];break}
 const wx=WX.rain?'pioggia':WX.snow?'neve':WX.sand?'tempesta di sabbia':'sereno';
 return'<div class="k">OPERAZIONE '+nm.op.toUpperCase()+' · CAPITOLO '+(n+1)+' DI '+C.len+(fin?' · FINALE':'')+'</div>'
  +'<div class="t">'+MIS_NAMES[m]+'</div>'
  +'<div class="r">'+campT(n?campLastText():CN_INTRO[nm.i])+'</div>'
  +'<div>'+campT(b)+'</div>'+(fin?'':campRewardLine(m))+'<div class="s">'+campStrip(n)+'</div>'
  +'<div class="f">Difficoltà '+p.d+' · Meteo: '+wx+' · Sconfitte '+lost+'/'+CAMP_MAXLOST+(fin?' · l’ultimo capitolo va vinto':'')+'</div>'
  +'<div class="f" style="color:#ffd23f;font-weight:bold">'+(MOBILE?'Tocca per chiudere':'R chiudi il briefing')+'</div>'}
function campDebrief(){const C=CAMP,n=C.res.length,r=C.res[n-1];if(!r)return'';
 const win=r[1],lost=campLost(C.res),nm=campNm(),fin=n>=C.len;
 let h='<div class="k">OPERAZIONE '+nm.op.toUpperCase()+' · CAPITOLO '+n+' DI '+C.len+'</div>'
  +'<div class="t" style="color:'+(win?'#7dff8a':'#ff6a5a')+'">'+(win?'VITTORIA':'SCONFITTA')+' · '+MIS_NAMES[r[0]]+'</div>'
  +'<div>'+campLastText()+'</div>'+(win&&!C.done?campUnlockLine(r[0])+campSlowLine(n-1):'')+'<div class="s">'+campStrip(C.done?-1:n)+'</div>';
 if(C.done==1)h+='<div><b style="color:#7dff8a">CAMPAGNA COMPLETATA</b> · '+C.len+' capitoli, '+lost+' sconfitte</div>';
 else if(C.done==2)h+='<div><b style="color:#ff6a5a">CAMPAGNA PERDUTA</b> · '+(fin?'il capitolo finale andava vinto.':'quarta sconfitta: la resistenza non regge più.')+'</div>';
 else h+='<div>Prossimo capitolo: <b>'+MIS_NAMES[C.pl.m]+'</b>'+(n>=C.len-1?' · <b style="color:#ffd23f">CAPITOLO FINALE</b>':'')+'</div><div class="f">Sconfitte '+lost+'/'+CAMP_MAXLOST+(lost>=CAMP_MAXLOST?' · la prossima sconfitta chiude la campagna':'')+'</div>';
 return h+'<div class="f">'+(NET.on&&!NET.host?'In attesa dell’host…':(MOBILE?'Tocca lo schermo per ':'Premi R per ')+(C.done?'iniziare una nuova campagna':'continuare'))+'</div>'}
function campBox(){let b=document.getElementById('campBox');if(b)return b;
 const st=document.createElement('style');
 st.textContent='#campBox{position:fixed;left:50%;top:15%;transform:translateX(-50%);width:min(92vw,560px);max-height:70%;overflow:hidden;box-sizing:border-box;padding:14px 18px;background:rgba(8,14,8,.86);border:2px solid #3fae4a;border-radius:10px;color:#eee;font:14px/1.45 system-ui,sans-serif;z-index:6;pointer-events:none;display:none;opacity:0;transition:opacity .5s}'
  +'#campBox .k{color:#ffd23f;font-weight:bold;font-size:12px;letter-spacing:.06em}#campBox .t{font-size:20px;font-weight:bold;margin:4px 0 6px}#campBox .r{color:#9bd3a1;font-style:italic;margin:0 0 6px}#campBox .s{letter-spacing:.2em;margin:8px 0;font-size:15px}#campBox .f{font-size:12px;color:#c4d3c4;margin-top:6px}'
  +'@media (pointer:coarse){#campBox{top:12%;font:12px/1.4 system-ui,sans-serif;padding:8px 12px}#campBox .t{font-size:16px}}';
 document.head.appendChild(st);b=document.createElement('div');b.id='campBox';document.body.appendChild(b);return b}
function campShow(h,ms){const b=campBox();clearTimeout(CAMP.tm);b.innerHTML=h;b.dataset.h='0';b.style.display='block';void b.offsetWidth;b.style.opacity=1;if(ms)CAMP.tm=setTimeout(campHide,ms)}
function campHide(){const b=document.getElementById('campBox');CAMP.sh='';if(!b||b.style.display!=='block'||b.dataset.h==='1')return;
 clearTimeout(CAMP.tm);b.dataset.h='1';b.style.opacity=0;CAMP.tm=setTimeout(()=>{b.style.display='none'},500)}
// true se il briefing di campagna è attualmente mostrato (serve al tasto R in AGgame.js)
const campIsBriefing=()=>CAMP.on&&CAMP.sh==='b';
// a ogni nuova mappa (anche per chi entra in corsa): se la campagna è attiva il briefing compare quando la mappa è pronta; chi entra durante un debriefing non vede un briefing sbagliato
function campOnStart(){const C=CAMP;campHide();C.br=0;if(!C.on)return;if(C.ov){C.ov=0;return}C.br=1}
setInterval(()=>{const C=CAMP;
 if(!C.on||!G.started){campHide();return}
 if(G.over){const k='d'+C.res.length;if(C.sh!==k){C.sh=k;campShow(campDebrief())}return}
 if(C.br&&!G.baking){C.br=0;C.sh='b';campShow(campBrief(),46000)}},400);


