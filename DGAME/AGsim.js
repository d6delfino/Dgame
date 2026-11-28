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
   if(e===P)say('Rianimazione!');else if(e.k===UK_ELITE)announce('Il bersaglio d\u2019\u00e9lite si \u00e8 rianimato!');
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
// gittata in più delle armi di un giocatore (upgrade Radar eyes): p.radar = secondi di Radar sommati (rad per copia), quindi copie = p.radar/rad · vale per il giocatore locale e, sull'host, per i client (q.radar arriva con hello/ldt)
const UP_RAD=UPGRADES.find(u=>u.id=='radar'),plRng=p=>1+(UP_RAD.rng-1)*((p&&p.radar)||0)/UP_RAD.rad;
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
   if(A&&SKY.n&&(b.tz<0||b.tz===1)&&!WEAPONS[b.w].hom&&skyHitB(b)){if(!b.pierce)b.dead=1}}}   // macchine civili volanti: strato aereo (in fondo ad AGveh.js)
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
 const sb=Mi().defend&&o>=1000&&secId(o);   // esplosione di una guardia alleata: non colpisce giocatori, VIP né altre guardie
 const hit=e=>{if(weapon!=null&&o>=1000&&e.id===o)return;if(sb&&(e.pl||e.al||e.sec))return;   // le unità AI (id ≥ 1000) non si feriscono con le proprie esplosioni (razzi, missili anche guidati, granate del carro); il giocatore sì
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
 bl:0,bp:rnd(0,1),fl:0,dis:0,slp:0,vx:0,vy:0,hx:x,hy:y,wt:rnd(0,3),px:x,py:y,od:Math.random()<.5?-1:1,dn:rnd(.5,2),dk:rnd(0,1),dg:0,dd:1,stk:0,rp:0,bo:null,sq:0,shout:0,bt:3,vis:false,vd:1e9,T:null,fast:k==UK_MECH&&Math.random()<.5,aimT:0,lvx:0,lvy:0,sw:0,sa:0};
 if(opt&&opt.du){   // Arena Duel: arma e variante fisse (nessuna estrazione casuale)
  const D=opt.du;
  if(k==UK_TANK){u.tv=D.tv|0;if(u.tv==0)u.bw=W_CAN;u.thr=u.h}
  else if(D.w>=0&&D.w!==T.w){u.bw=D.w;u.hold=Math.min(T.hold||HOLD_DEF,Math.max(HOLD_MIN,WEAPONS[D.w].range*.6))}
 }else{
  // Tank: variante deterministica (0 = cannone del player, 1 = lanciarazzi)
  // L'id è progressivo e identico sull'host e sui client, quindi u.tv coincide ovunque.
  if(k==UK_TANK){u.tv=hs(u.id,7,M.seed)<.5?0:1;if(u.tv==0)u.bw=W_CAN;u.thr=u.h}   // thr = rotazione torretta (indipendente dallo scafo h)
  let wi0=u.bw!=null?u.bw:T.w;
  // Arma casuale per i nemici AI a terra (mech, torretta, cecchino, bersaglio):
  // 4% lanciafiamme, 4% shotgun (8% totali), 1% cannone (per k=6: 80% cannone, 20% mitraglia). Il tank (k=5) ha già la sua variante,
  // gli infiltrati/guardie (k>=UK_HUM) restano con la mitraglia e i jet (fly:1) con la loro arma.
  if(u.bw==null&&wi0>=0&&!T.fly&&k<UK_HUM&&k!==UK_TANK&&k!==UK_APC&&k!==UK_SHIP){const r=Math.random();
   if(k===UK_ELITE){if(r<.8)wi0=W_CAN}
   else{if(r<.04)wi0=W_FLM;else if(r<.08)wi0=W_SHG;else if(r<.09)wi0=W_CAN}
   if(wi0!==T.w){u.bw=wi0;   // memorizza l'override: aiShoot e draw usano u.bw
    // il nemico regola la distanza di ingaggio sulla nuova arma: 60% della gittata, fra HOLD_MIN e la sua distanza di serie
    u.hold=Math.min(T.hold||HOLD_DEF,Math.max(HOLD_MIN,WEAPONS[wi0].range*.6))}}
  if(u.bw==null&&(k===UK_JET||k===UK_APC)&&Math.random()<.5)u.bw=W_HOM;   // jet e APC: 50% missili guidati
 }
 const wi=u.bw!=null?u.bw:T.w;
 if(wi>=0)u.ws=newWS(wi);if(T.w2!=null)u.ws2=newWS(T.w2);
 if(T.w3!=null){u.ws3=newWS(T.w3);u.bt3=1.5}   // terza arma (Dirigibile: lanciarazzi)
 if(has3(k)){u.thr=u.h;u.thr2=u.h;u.thr3=u.h;}   // 3 torrette indipendenti (dirigibile e nave da guerra)
 else if(k===UK_APC)u.thr=u.h;                   // APC: torretta separata dallo scafo
 if(k===UK_ELITE){u.ar=14;u.shs=[0,0,0,0];u.sg=0;u.rg=REGEN*3;u.revive=[0]}
 units.push(u);return u}
// ===== popolazione iniziale: ~50 nemici, il numero NON dipende dalla difficoltà =====
function populate(){units.length=0;PQ.length=0;UID=1000;GID=0;
 const dS=(x,y)=>Math.hypot(x-START[0],y-START[1]),okE=(x,y,r)=>clearAt(x,y,r)&&dS(x,y)>SAFE_R,rxy=()=>landXY(Math.random,300,150,150);
 let n0=0;   // prima le torrette agli angoli dei complessi, ai varchi e nei porti (punti decisi dalla mappa)
 for(const sp of shuf2(M.tspots||[])){if(n0>=Math.round(N_TUR*.6))break;if(okE(sp[0],sp[1],30)&&!units.some(t=>Math.hypot(sp[0]-t.x,sp[1]-t.y)<220)){mkUnit(UK_TUR,sp[0],sp[1],-1);n0++}}
 for(let n=n0,tr=0;n<N_TUR&&tr<5000;tr++){const[x,y]=rxy();if(okE(x,y,30)&&!units.some(t=>Math.hypot(x-t.x,y-t.y)<350)){mkUnit(UK_TUR,x,y,-1);n++}}
 for(let n=0,tr=0;n<N_SQUAD&&tr<5000;tr++){const[x,y]=rxy();if(!okE(x,y,40))continue;const r0=Math.random(),sz=r0<.3?1:r0<.6?2:r0<.85?3:4,g=GID;let c=0;
  for(let k=0;k<sz;k++){const a=Math.random()*TAU,d=k?rnd(45,80):0,ex=x+Math.cos(a)*d,ey=y+Math.sin(a)*d;if(clearAt(ex,ey,20)){mkUnit(UK_MECH,ex,ey,g);c++}}
  if(c){GID++;n++}}
 for(let n=0,tr=0;n<(M.hi?0:N_FLY)&&tr<5000;tr++){const[x,y]=landXY(Math.random,400,300,300);if(dS(x,y)>2800&&!units.some(t=>t.k==UK_JET&&Math.hypot(x-t.x,y-t.y)<1500)){mkUnit(UK_JET,x,y,GID++);n++}}
 const spawn=(k,cnt)=>{for(let c=0,tr=0;c<cnt&&tr<5000;tr++){const[x,y]=rxy();
  if((k==UK_KAMI?dS(x,y)>SAFE_R:okE(x,y,k==UK_TANK?40:30))&&!units.some(t=>t.k==k&&Math.hypot(x-t.x,y-t.y)<(k==UK_SNIP?600:300))){mkUnit(k,x,y,-1);c++}}};
 spawn(M.hi?UK_SWD:UK_KAMI,N_RUSH);spawn(UK_SNIP,N_SNIP);spawn(UK_TANK,Math.floor(Math.random()*(diffTanks(G.diff)+1)));spawn(UK_SWD,N_SWD);spawn(UK_APC,N_APC);
 for(const o of SHIPS)if(o.aiS&&!o.dead&&!o.fleet){const u=mkUnit(UK_SHIP,o.x,o.y,-1);u.h=u.thr=u.thr2=u.thr3=o.a;shipLink(u)}   // nave nemica (scelta in shipInit)
 if(!M.hi&&Math.random()<blimpProb(G.diff))for(let c=0,tr=0;c<diffBlimps(G.diff)&&tr<5000;tr++){const[x,y]=landXY(Math.random,400,300,300);if(dS(x,y)>2800&&!units.some(t=>t.k==UK_BLIMP&&Math.hypot(x-t.x,y-t.y)<1500)){mkUnit(UK_BLIMP,x,y,-1);c++}}   // dirigibile: probabilità legata alla difficoltà (25%→100%), uno solo, lontano dalla partenza
 G.cap=units.length;
 humanSpawn(UK_HUM,N_INF,0);humanSpawn(UK_GRD,N_GRD,1)}    // dopo G.cap: non contano per le caserme
// ===== navi: nemica (al posto di una nave della mappa, probabilità del dirigibile) e militari che rispondono al fuoco =====
// shipInit gira su host E client (scelta dal seed): così tutti sanno quale scafo va disegnato col colore dell'AI
const SHIPS=[];
function shipInit(){SHIPS.length=0;
 for(const o of M.obs)if((o.shape=='ship'||o.shape=='carrier')&&!o.dead){o.aiS=0;o.su=null;o.suU=null;o.mil=o.shape=='carrier'||(o.v|0)==2?1:0;SHIPS.push(o)}   // la portaerei è sempre militare: colpita, risponde al fuoco come le navi da guerra
 if(G.mode==1||Mi().defend)return;                            // deathmatch e missioni di difesa (senza popolazione iniziale): niente nave nemica
 if(Mi().ships){Mi().ships();return}                             // la missione sceglie le sue navi nemiche (Affonda la flotta)
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
 for(let i=0;i<CARR_JETS;i++){const p=toWorld(o,x0+(x1-x0)*i/(CARR_JETS-1),y),u=mkUnit(UK_JET,p[0],p[1],-1);
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
 for(let i=0;i<DM_BOTS&&i<sp.length;i++){const u=mkUnit(UK_MECH,sp[i][0],sp[i][1],-1);u.name='BOT '+(i+1);u.ci=(Math.random()*COLS.length)|0;u.kills=0;u.deaths=0;u.dm=1;botLoadout(u)}}
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
 u.hold=Math.min(UT[UK_MECH].hold,Math.max(HOLD_MIN,W.range*.6));                 // distanza di tiro adatta all'arma (lanciafiamme da vicino, ecc.)
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
  ? Math.max(WEAPONS[Ty.w].range,Ty.w2!=null?WEAPONS[Ty.w2].range*(UT[UK_TUR].rm||1):0,WEAPONS[Ty.w3].range*2)*1.2   // dirigibile: max 1944 · nave (senza torretta 2): 1440
  : wi>=0?WEAPONS[wi].range*((u.bw==null&&Ty.rm)||1)*1.2:SIGHT_NOW;   // rm SOLO con l'arma di default
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
 if(u.aw&&!vis&&u.awx!=null){if(u.st<2){u.st=2;u.path=null;u.pt=0}u.lkt=LOST_T;u.lkx=u.awx;u.lky=u.awy}   // ondata di un obiettivo: se non vede nessuno marcia sull'obiettivo che l'ha generata (waveUnit)
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
 const T0=UT[UK_TUR];   // la torretta centrale replica in tutto la torretta di terra
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
  if(u.k!=UK_TANK&&dodgeStep(u,dt,(u.fast?170:140)*GND_SPD,gx,gy)){dgx=DG.x;dgy=DG.y;moving=true}   // schivata: si somma al movimento, non lo sostituisce (il tank non schiva)
  if(u.vis&&u.vd<hd)u.vx=u.vy=0;   // in posizione: si ferma e spara (si muove solo per schivare): la velocità è zero anche se non schiva
  else{
   if(u.role&&!u.fk&&u.vis&&u.vd>hd*1.3){ // fianco: punta a un lato del bersaglio, poi attacca da lì
    const ux=(T.x-u.x)/u.vd,uy=(T.y-u.y)/u.vd,F=hd+FLANK_OFF;gx=T.x-uy*u.role*F;gy=T.y+ux*u.role*F;
    if(Math.hypot(gx-u.x,gy-u.y)<FLANK_OK)u.fk=1}
   else if(!u.vis&&Math.hypot(u.lkx-u.x,u.lky-u.y)<50)searchNext(u);
   if(u.sw>0&&!u.vis){u.sw-=dt;u.h+=Math.sin(G.t*2.5+u.id)*2*dt;u.vx=u.vy=0}   // ricerca: si ferma e si guarda attorno
   else{
    sp=(u.k==UK_MECH?(u.fast?Ty.fast:Ty.spd):Ty.spd)*(u.spm||1)*gSlow(u);
    followPath(u,gx,gy,sp,dt);moving=true}}
 }else if(u.st==0){ // pattuglia
  if(u.k==UK_ELITE&&MD&&MD.wp&&MD.wp.length){const w=MD.wp[(u.wi||0)%MD.wp.length];
   if(Math.hypot(w[0]-u.x,w[1]-u.y)<160)u.wi=((u.wi||0)+1)%MD.wp.length;followPath(u,w[0],w[1],110*GND_SPD*gSlow(u),dt);moving=true}
  else{u.wt-=dt;if(u.wt<=0||Math.hypot(u.px-u.x,u.py-u.y)<30){u.wt=rnd(3,8);const a=Math.random()*TAU,d=rnd(100,350),px=clamp(u.hx+Math.cos(a)*d,100,WW-100),py=clamp(u.hy+Math.sin(a)*d,100,WH-100);if(!nav[ncell(px,py)]){u.px=px;u.py=py}}
   stepTo(u,u.px,u.py,(u.k==UK_MECH?50:u.k==UK_SNIP?40:35)*GND_SPD*gSlow(u),dt);moving=true}}
 if(moving){
  u.x+=dgx*dt;u.y+=dgy*dt;u.vx+=dgx;u.vy+=dgy;   // la schivata si somma al passo già fatto
  separate(u,dt);push(u,Ty.pr);
  if(!(u.st==2&&u.vis)&&Math.hypot(u.vx,u.vy)>5){
   const tgtH=Math.atan2(u.vy,u.vx);
   u.h=aiTurn(u.h,tgtH,u.k===UK_TANK?AI_ROT_HULL:AI_ROT,dt)}}   // tank: scafo a 2/3, tutti gli altri a velocità piena
 // bloccato: l'avanzamento reale (senza la schivata) è meno del 30% di quello voluto
 if(moving&&u.st==2&&sp>0&&Math.hypot(u.x-x0-dgx*dt,u.y-y0-dgy*dt)<sp*dt*.3){
  u.stk+=dt;
  if(u.stk>1.2&&!u.rp){u.rp=1;u.path=null;u.pt=0}                                    // dopo 1,2 s: riplanifica (una volta)
  if(u.stk>2)u.bo=blockerAhead(u,u.vx-dgx,u.vy-dgy,Ty.pr+70)||u.blk}                 // dopo 2 s: individua l'ostacolo da distruggere
 else{u.stk=Math.max(0,u.stk-dt*2);if(u.stk<=0){u.rp=0;u.bo=null}}}
const k6=u=>u.k==UK_ELITE;
function flyerAI(u,dt){const T=u.T;let vx,vy;
 if(u.st==2&&T){const dx=T.x-u.x,dy=T.y-u.y,d=Math.hypot(dx,dy)||1;u.dn-=dt;if(u.dn<=0){u.dn=rnd(1.5,4);u.od=-u.od}
  const rd=clamp((d-(u.hold||UT[u.k].hold))*1.2,-200,260),tg=170*u.od;vx=dx/d*rd-dy/d*tg;vy=dy/d*rd+dx/d*tg;
  if(dodgeStep(u,dt,230,T.x,T.y)){vx+=DG.x;vy+=DG.y}}      // lo scatto si somma all'orbita
 else{u.px+=dt*.35;const hx=u.hx+Math.cos(u.px)*220-u.x,hy=u.hy+Math.sin(u.px)*220-u.y,hd=Math.hypot(hx,hy)||1;vx=hx/hd*110;vy=hy/hd*110}
 const k=Math.min(1,3*dt);u.vx+=(vx-u.vx)*k;u.vy+=(vy-u.vy)*k;u.x=clamp(u.x+u.vx*dt,20,WW-20);u.y=clamp(u.y+u.vy*dt,20,WH-20);
 if(Math.hypot(u.vx,u.vy)>15&&!(u.st==2&&u.vis))u.h=aiTurn(u.h,Math.atan2(u.vy,u.vx),AI_ROT,dt)}

function kamiAI(u,dt){const T=u.T,B=UT[UK_KAMI].boom;let gx=u.x,gy=u.y,sp=0;
 if(u.st==2){gx=u.vis?T.x:u.lkx;gy=u.vis?T.y:u.lky;sp=UT[UK_KAMI].spd;if(!u.vis&&Math.hypot(gx-u.x,gy-u.y)<50){sp=0;u.st=0}}
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
 // Player in Air: anche il wingman vola (strato aereo, z=1) e lo segue in linea retta, senza percorso A* né collisioni
 if(owner.air){
  if(!u.z){u.z=1;u.path=null;u.pt=0;u.stk=0;u.gh=0}
  let n=0,idx=0;for(const v of units)if(v.plWingman&&v.owner===u.owner&&!v.dead){if(v===u)idx=n;n++}
  const side=n>1?(idx-(n-1)/2):0,oh=owner.h||0,cx=Math.cos(oh),cy=Math.sin(oh);
  const tx=owner.x-cx*90-cy*side*70,ty=owner.y-cy*90+cx*side*70;   // 90 px dietro, 70 px di lato per ogni posto in formazione
  const dx=tx-u.x,dy=ty-u.y,d=Math.hypot(dx,dy);
  if(d>4){const sp=Math.min(d*4,AIR_V*1.2),st=Math.min(d,sp*dt);u.vx=dx/d*sp;u.vy=dy/d*sp;u.x+=dx/d*st;u.y+=dy/d*st;if(!(u.vis&&u.T))u.h=aiTurn(u.h,d>40?Math.atan2(dy,dx):oh,AI_ROT,dt)}
  else{u.vx=u.vy=0}
  u.x=clamp(u.x,20,WW-20);u.y=clamp(u.y,20,WH-20);return}
 if(u.z){u.z=0;u.path=null;u.pt=0;push(u,16,1)}   // il proprietario è atterrato: anche il wingman torna a terra, fuori dagli ostacoli
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
 if(Mi().defend&&G.mode!=1){
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

 if(u.aw&&!u.z&&u.stk>25)waveUnstick(u);   // nemico d'ondata incastrato da più di 25 s: riappare più vicino al suo obiettivo
 u.th-=dt;if(u.th<=0){u.th=.2+Math.random()*.1;u.thT=u.th>0?.25:.25;think(u)}
   if(u.plWingman){
   if(u.vis&&u.st<2){u.st=2;u.fk=0;u.path=null;u.pt=0}   // niente attesa di reazione per un alleato
   wingmanAI(u,dt);
   if(u.T&&u.vis)aiShoot(u,dt);
   continue;
  }
  if(u.k>=UK_HUM){humanAI(u,dt);continue}
  if(u.k===UK_SHIP){if(u.nav){u.hp=u.ob.hp;u.mhp=u.ob.m}if(u.st==2&&u.T)aiShoot(u,dt);continue}   // nave militare: la vita è quella dello scafo
  if(u.k==UK_TUR){if(u.st==2&&u.T)aiShoot(u,dt);continue}
  if(u.k==UK_JET)flyerAI(u,dt);else if(u.k==UK_KAMI){kamiAI(u,dt);continue}else if(u.k===UK_BLIMP)blimpAI(u,dt);else groundAI(u,dt);
  if(u.st==2&&u.T){if(u.k===UK_SWD)swordAI(u,dt);else aiShoot(u,dt)}}
 for(let n=0;n<2&&PQ.length;n++){const u=PQ.shift();u.pq=0;if(u.dead)continue;const p=navPath(u.x,u.y,u.gx,u.gy);
  u.path=p;u.pi=0;const l=p[p.length-1];u.np=Math.hypot(l[0]-u.gx,l[1]-u.gy)>200}}

// ===== missioni: tutte in AGmis.js (registro, parti comuni, un blocco per missione) =====
const DM={sc:{},rq:[]};
const spawnAt=id=>baseXY(200+(id%5)*48,200+((id/5)|0)*48);   // le file di partenza seguono la rotazione della base
const dSt=o=>Math.hypot(o.x-START[0],o.y-START[1]);
const isTown=s=>s.k=='g'||s.k=='r'||s.k=='l';
function finish(v,txt){if(G.over)return;G.over=v;G.overMsg=txt;MS.st=v==2?1:2;rainLoopStop();windLoopStop();campFinish(v);if(NET.on&&NET.host)bcast({t:'over',v,m:txt,c:campPack()})}
function announce(t){say(t);if(NET.on&&NET.host)bcast({t:'say',m:t})}

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
 const p=dmPoint(),u=mkUnit(UK_MECH,p[0],p[1],-1);u.name=r.name;u.bi=r.bi;u.ci=(Math.random()*COLS.length)|0;u.dm=1;botLoadout(u);fxSpawn(p[0],p[1],'#ff9a3a',10,true)}}
const dmPack=()=>Object.entries(DM.sc).map(([k,v])=>[k,v.n,v.k,v.d]);
const dmUnpack=a=>{for(const[k,n,kk,d]of a)DM.sc[k]={n,k:kk,d}};

// ===== vita dei giocatori e delle unità (host/singolo) =====
// macchia lasciata da un'unità morta: la usano l'host/singolo (onUnitDead) e i client (Handlers.snap in AGnet.js), così tutti la vedono uguale
const OIL_K=new Set([UK_TUR,UK_JET,UK_KAMI,UK_TANK,UK_BLIMP,UK_APC]);   // tipi che lasciano olio + sangue: torretta, jet, kamikaze, carro pesante, dirigibile, APC (il cecchino resta col sangue)
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
 const TT=THEMES[M.th]||{},noPed=!!TT.noPed,CV=[];if(TT.civV){let q=0;for(const t of CIV_VEH)for(const c of t.cols){if(TT.civV.includes(t.n))CV.push(q);q++}}   // temi (THEMES in AGmap.js): niente omini (Nettuno), solo alcuni tipi di mezzi
 const add=(j,car,c,h,s0,v,o)=>{if(n>=cap||(!car&&noPed))return;CIV.k[n]=car;CIV.r[n]=j;CIV.c[n]=c;CIV.h[n]=h;CIV.s0[n]=s0;CIV.v[n]=v;CIV.o[n]=o;n++};
 const pickP=f=>{if(!CIV.rd.length)return -1;for(let t=0;t<40;t++){const j=R()*CIV.rd.length|0,r=CIV.rd[j];if(f(r)&&R()*mx<r.L)return j}return -1};   // più probabile sulle strade lunghe
 // gruppo di k omini della classe c che camminano insieme sul percorso j (c=0: colori a caso)
 const group=(j,k,c)=>{const r=CIV.rd[j],v=rr(22,38),s0=R()*2*r.L;
  for(let q=0;q<k;q++){const pal=c?CIV_CLS[c]:[ri(0,NC-1),ri(0,NC-1)];add(j,0,pal[0],pal[1],s0+q*rr(14,26),v+rr(-1.5,1.5),(q%2?1:-1)*rr(3,9))}};
 // 2) omini e auto sulle strade (come prima; gli omini non vanno sulle autostrade, le auto non sui sentieri)
 for(let i=0;i<N_CIV_P;i++){const j=pickP(r=>r.ped&&!r.pc&&!r.hw&&!r.off);if(j<0)continue;const r=CIV.rd[j];add(j,0,ri(0,NC-1),ri(0,NC-1),R()*2*r.L,rr(22,42),(R()<.5?1:-1)*(r.w/2+7))}
 for(let i=0;i<N_CIV_V;i++){const j=pickP(r=>r.car&&!r.dirt);if(j<0)continue;const r=CIV.rd[j],c=CV.length?CV[ri(0,CV.length-1)]:ri(0,CIV_VN-1);add(j,1,c,ri(0,NC-1),R()*2*r.L,rr(90,150)*CIV_VS[c],0)}
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
  SPB.list=[];SPB.near=null;const RT={pol:['sicurezza','armeria'],pri:['sicurezza','magazzino','stiva'],hos:['lab','infermeria'],off:['macchine','hangar','motori','pompe','dock','moonpool'],rad:['server','server2','comando','ponte','osservatorio'],gen:['reattore','macchine','motori','pompe']};   // astronave: armeria, stiva, infermeria, motori, ponte
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
