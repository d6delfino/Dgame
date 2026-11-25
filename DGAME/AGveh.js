'use strict';
/* AIRGRUNT · AGveh.js — VEICOLI guidabili dai giocatori (solo logica: i disegni sono in AGart.js, i valori in VEH_T di AGconf.js).
   REGOLE (le stesse del resto del gioco):
   - i mezzi parcheggiati nascono dal seed: ogni client li ricrea uguali, la loro posizione iniziale non viaggia in rete;
   - un veicolo guidato NON è un'unità: è il giocatore stesso con q.vid (veicolo) e q.vk (tipo). Posizione, scafo (mh) e torretta (fa)
     passano già con 'st' e con lo snapshot; in più viaggiano solo due numeri per giocatore (veicolo guidato e sua vita);
   - salire, scendere, esplodere: piccoli eventi decisi dall'host ('vb', 'vl', 'vx'); lo snapshot riallinea se un evento va perso;
   - investimenti e danni li calcola solo l'host; i client ricevono il risultato con lo snapshot (unità) e con 'cv' (civili).
   PASSEGGERI: anche il passeggero è il giocatore stesso, con q.vid/q.vk e q.pas=1 (il guidatore ha q.pas=0). Non si muove da solo:
   ogni fotogramma prende la posizione del mezzo (niente input, collisioni né rete in più). In rete passa solo q.pas (snapshot) e un campo 'p' in 'vb'.
   I VIP (missioni 2 e 10) salgono da soli accanto a un mezzo con giocatori a bordo: w.inV = mezzo (-1 a piedi), deciso dall'host e mandato con msPack. */
const VHC={list:[],near:null,nt:0};   // near = mezzo libero a portata del giocatore locale · nt = timer del controllo di vicinanza
const _vq=[];
const VEH_GRUNT_T={r:PR_GRUNT/.8};
// ===== occupanti: guidatore, passeggeri (giocatori) e VIP. Tutto calcolato al momento: pochi giocatori, al massimo 3 VIP, nessuno stato da sincronizzare =====
const _vp=[],_vv=[],_vv2=[];
const vehAlly=(a,b)=>G.mode!=1;                                        // cooperativa: tutti alleati · deathmatch: nessuno
const vehDriver=v=>v&&v.drv>=0?(v.drv===NET.id?P:others[v.drv])||null:null;
function vehPeople(v,out){out=out||_vp;out.length=0;if(!v)return out;   // giocatori a bordo (guidatore compreso)
 if(P&&P.vid===v.id)out.push(P);for(const k in others){const q=others[k];if(q&&q.vid===v.id)out.push(q)}return out}
function vehVipList(out){out=out||_vv;out.length=0;if(typeof MS==='undefined'||!MS||G.mode==1)return out;   // VIP che possono salire: missione 2 (MS.al) e 10 (MS.vips)
 if(G.mt==2&&MS.al)out.push(MS.al);else if(G.mt==10&&MS.vips)for(const w of MS.vips)out.push(w);return out}
function vehPasN(v){let n=0;for(const q of vehPeople(v))if(q.pas)n++;for(const w of vehVipList(_vv2))if(w.inV===v.id)n++;return n}   // posti da passeggero occupati
// chi può salire e dove: 'd' guidatore (posto di guida libero: il primo che sale guida) · 'p' passeggero · null nessun posto o non alleati
function vehSeatFor(q,v){if(!v||v.dead)return null;
 for(const o of vehPeople(v))if(o!==q&&!vehAlly(q,o))return null;
 if(v.drv<0)return'd';
 return vehPasN(v)<(VEH_T[v.k].seats|0)?'p':null}
// chi prende i colpi per tutto il mezzo: il guidatore, altrimenti il passeggero con l'id più basso (un colpo = un danno al mezzo)
function vehRep(v){const d=vehDriver(v);if(d&&d.vid===v.id&&!d.pas)return d;let b=null;for(const q of vehPeople(v))if(q.pas&&(!b||q.id<b.id))b=q;return b}
const vehGhost=q=>!!(q.pl&&q.vid>=0&&q.pas&&vehRep(VHC.list[q.vid])!==q);   // passeggero che i colpi devono ignorare (li prende il mezzo)
// il tiratore o (giocatore) è a bordo dello stesso mezzo di q: i suoi colpi non colpiscono il proprio mezzo né i compagni a bordo
function vehSame(o,q){if(!(q.vid>=0)||o==null||o<0||o>=1000)return false;const s=o===NET.id?P:others[o];return !!(s&&s.vid===q.vid)}   // "tipo" fittizio per vehTraffic: il Grunt a piedi viene spinto dalle auto del traffico come un mezzo civile (vehTraffic usa r*.8 = PR_GRUNT)

// ===== creazione dal seed (host e client ottengono gli stessi mezzi negli stessi posti) =====
// I mezzi sono coerenti con i siti: civili sugli slab degli edifici e sulle strade delle città; APC e carri solo nei siti militari;
// jet negli aeroporti, nei cantieri spaziali e nelle grandi basi (sulle piazzole, se ci sono); il Colosso, rarissimo, nei siti militari o in un grande cantiere spaziale.
// Rarità e quantità: VEH_T (p, cnt, wt) e VEH_CIV_PER / VEH_CIV_MAX in AGconf.js.
function vehInit(){VHC.list=[];VHC.near=null;VHC.nt=0;if(!M)return;
 const R=rng((M.seed|0)+7717),ri=(a,b)=>a+Math.floor(R()*(b-a+1)),used=[];
 const rot=(f,x,y)=>{const c=Math.cos(f.a||0),s=Math.sin(f.a||0),dx=x-f.x,dy=y-f.y;return[dx*c+dy*s,-dx*s+dy*c]};
 // aree dove lo sfondo disegna già mezzi, casse o strutture (parcheggi, autoparchi, cantieri...): lì non si parcheggia
 const AV={lot:1,motorpool:1,park:1,vpark:1,yard:1,stockpile:1,launchpad:1,drydock:1,construction:1,court:1,pool:1,range:1,pit:1,basins:1};
 const avoid=M.flat.filter(f=>AV[f.k]),props=M.flat.filter(f=>f.k=='veh');
 const blocked=(x,y,r)=>{for(const f of avoid){if(f.w&&f.h){const l=rot(f,x,y);if(Math.abs(l[0])<f.w/2+r&&Math.abs(l[1])<f.h/2+r)return true}else if(f.r&&Math.hypot(x-f.x,y-f.y)<f.r+r)return true}
  for(const f of props)if(Math.hypot(x-f.x,y-f.y)<(f.r||20)+r)return true;return false};
 const free=(x,y,r)=>x>200&&y>200&&x<WW-200&&y<WH-200&&!inBase(x,y,30)&&!inWater(x,y,r+12)&&clearAt(x,y,r+6)&&!blocked(x,y,r)
  &&!used.some(u=>Math.hypot(u[0]-x,u[1]-y)<u[2]+r+30);
 const add=(k,x,y,h)=>{const T=VEH_T[k],t=T.civ?CIV_VEH.find(z=>z.n==T.civ):null;
  VHC.list.push({id:VHC.list.length,k,x,y,h,hp:T.hp,mhp:T.hp,drv:-1,dead:0,ci:t?(R()*t.cols.length|0):0,va:0,wk:0});used.push([x,y,T.r]);return true};
 const circ=S=>S.ds?S.ds.map(D=>[D.x,D.y,D.rad]):[[S.x,S.y,S.r]];
 const inSite=(S,x,y)=>circ(S).some(c=>Math.hypot(x-c[0],y-c[1])<c[2]);
 // ---- militari: ogni sito ammesso tira il dado per ogni tipo ----
 const milSpot=(k,S)=>{const T=VEH_T[k],sr=S.r*.8;
  if(T.fly){for(const f of M.flat)if(f.k=='pad'&&Math.hypot(f.x-S.x,f.y-S.y)<S.r&&free(f.x,f.y,T.r))return add(k,f.x,f.y,(S.a||0)+(R()<.5?0:Math.PI))}   // jet: prima le piazzole
  const sl=M.flat.filter(f=>f.k=='slab'&&f.t==4&&Math.hypot(f.x-S.x,f.y-S.y)<S.r);   // poi i piazzali militari del sito
  for(let t=0;t<40&&sl.length;t++){const f=sl[R()*sl.length|0],u=(R()-.5)*Math.max(0,f.w-2*T.r),v=(R()-.5)*Math.max(0,f.h-2*T.r),c=Math.cos(f.a||0),s=Math.sin(f.a||0),x=f.x+u*c-v*s,y=f.y+u*s+v*c;
   if(free(x,y,T.r))return add(k,x,y,(f.a||0)+ri(0,3)*Math.PI/2)}
  for(let t=0;t<60;t++){const a=R()*TAU,d=Math.sqrt(R())*sr,x=S.x+Math.cos(a)*d,y=S.y+Math.sin(a)*d;if(free(x,y,T.r))return add(k,x,y,(S.a||0)+ri(0,3)*Math.PI/2)}   // infine ovunque nel sito
  return false};
 for(let k=0;k<VEH_T.length;k++){const T=VEH_T[k];if(!T.at)continue;
  for(const S of M.sites){const mr=T.at[S.k];if(mr==null||S.r<mr)continue;
   if(R()>=T.p)continue;                       // rarità: il mezzo c'è solo con probabilità p
   for(let i=0,n=ri(T.cnt[0],T.cnt[1]);i<n;i++)milSpot(k,S)}}
 // ---- TEST (da rimuovere): un mezzo per tipo in fila nella base di partenza ----
 //for(let k=0;k<VEH_T.length;k++){const p=baseXY(80+k*75,420);add(k,p[0],p[1],baseAng(-Math.PI/2))}
 // ---- FINE TEST ----
 // ---- civili: quanti dipende da quanta città c'è; il tipo si estrae con i pesi wt ----
 const slabs=M.flat.filter(f=>f.k=='slab'&&f.t==0&&f.w&&f.h),cities=M.sites.filter(S=>S.k=='g');
 if(!slabs.length&&!cities.length)return;
 const civK=VEH_T.map((T,k)=>T.wt?k:-1).filter(k=>k>=0),wsum=civK.reduce((a,k)=>a+VEH_T[k].wt,0);
 const pickCiv=()=>{let x=R()*wsum;for(const k of civK){x-=VEH_T[k].wt;if(x<0)return k}return civK[0]};
 // sul bordo libero di uno slab di edificio, allineato allo slab
 const onSlab=k=>{const T=VEH_T[k];for(let t=0;t<120&&slabs.length;t++){const f=slabs[R()*slabs.length|0],side=ri(0,3),
   along=(R()-.5)*((side&1?f.h:f.w)-2*T.r),edge=((side&1?f.w:f.h)/2-T.r*.7)*(side<2?1:-1),u=side&1?edge:along,v=side&1?along:edge,
   c=Math.cos(f.a||0),s=Math.sin(f.a||0),x=f.x+u*c-v*s,y=f.y+u*s+v*c;
   if(free(x,y,T.r))return add(k,x,y,(f.a||0)+(side&1?Math.PI/2:0)+(R()<.5?0:Math.PI))}return false};
 // a lato di una strada asfaltata, ma solo dentro una città
 const onRoad=k=>{const T=VEH_T[k];if(!cities.length||!M.roads.length)return false;
  for(let t=0;t<80;t++){const rd=M.roads[R()*M.roads.length|0];if(!rd||rd.pts.length<2||rd.cls=='dirt')continue;
   const i=R()*(rd.pts.length-1)|0,a=rd.pts[i],b=rd.pts[i+1],u=R(),h=Math.atan2(b[1]-a[1],b[0]-a[0]),sd=R()<.5?1:-1,off=(rd.w||40)*.22+CIV_RV+T.r*.8+4;   // a lato, fuori dalla corsia delle auto del traffico
   const x=a[0]+(b[0]-a[0])*u-Math.sin(h)*off*sd,y=a[1]+(b[1]-a[1])*u+Math.cos(h)*off*sd;
   if(cities.some(S=>inSite(S,x,y))&&free(x,y,T.r))return add(k,x,y,sd>0?h:h+Math.PI)}return false};
 const nCiv=Math.min(VEH_CIV_MAX,Math.max(1,Math.round(slabs.length/VEH_CIV_PER)+ri(-1,2)));
 for(let i=0;i<nCiv;i++){const k=pickCiv();if(R()<.55)onSlab(k)||onRoad(k);else onRoad(k)||onSlab(k)}}

// ===== salire e scendere (stesso codice su host e client; chi decide è l'host) =====
// pas: 1 = sale come passeggero (lo decide chi ha l'autorità con vehSeatFor e lo manda nel campo 'p' di 'vb')
function vehEnter(q,v,pas){if(!q||!v||v.dead||q.vid===v.id)return;
 if(q.vid>=0)vehLeave(q,q.x,q.y,q.pas?q.mh:VEH_T[q.vk].fly?q.h:q.mh);
 const T=VEH_T[v.k];
 if(pas){q.vid=v.id;q.vk=v.k;q.pas=1;q.x=v.x;q.y=v.y;if(q!==P){q.tx=v.x;q.ty=v.y}
  q.vx=q.vy=0;q.sp=0;q.dt=0;q.mh=q.h=v.h;const d=vehDriver(v),fly=!!(T.fly&&d&&d.air);q.air=fly;q.z=fly?1:0;
  if(q===P){sfx(SFX_LIST.toGrunt,.7);say(T.n+' · passeggero · spari con le armi del Grunt · '+kbLabel(KEYBIND.veh)+' scendi')}
  else sfxAt(SFX_LIST.toGrunt,.6,v.x,v.y,80);
  return}
 q.pas=0;v.drv=q.id;q.vid=v.id;q.vk=v.k;
 q.x=v.x;q.y=v.y;if(q!==P){q.tx=v.x;q.ty=v.y}
 q.vx=q.vy=0;q.sp=0;q.dt=0;q.mh=q.h=v.h;q.air=!!T.fly;q.z=T.fly?1:0;
 if(q===P){if(T.w.length){if(!P._eq){P._eq=P.eq;P._w=P.w}P.eq=T.w.slice();P.w=P.eq[0]}   // mezzo armato: le sue armi · disarmato: restano quelle del Grunt
 
  sfx(SFX_LIST.toGrunt,.7);say(T.n+' · W gas · A/D ruota · S freno'+(T.w.length>1?' · 1-'+T.w.length+' armi':T.w.length?'':' · armi del Grunt')+' · '+kbLabel(KEYBIND.veh)+' scendi')}
 else sfxAt(SFX_LIST.toGrunt,.6,v.x,v.y,80)}
// eject = il mezzo è esploso: resta dove si trova
// passeggero: il mezzo non si tocca; se il mezzo vola (jet in volo) e non è esploso, il passeggero si lancia fuori in modalità Air
function vehLeave(q,x,y,h,eject){const v=VHC.list[q.vid],T=v?VEH_T[v.k]:null,pas=!!q.pas,jump=pas&&!eject&&q.air;
 if(v&&!pas&&v.drv===q.id){v.drv=-1;if(!eject){v.x=x;v.y=y;v.h=h}}
 q.vid=-1;q.vk=-1;q.pas=0;q.vrep=0;q.sp=0;q.vx=q.vy=0;q.mh=h||0;
 if(jump){q.air=true;q.z=1;q.h=h||0;q.sp=120;q.x=x;q.y=y;if(q!==P){q.tx=x;q.ty=y}}
 else{q.air=false;q.z=0;
  if(T){const px=-Math.sin(h),py=Math.cos(h),fx=Math.cos(h),fy=Math.sin(h),d=T.r+18;let ex=x,ey=y;   // si scende di fianco al mezzo (destra, sinistra, dietro, davanti, poi in diagonale)
   for(const[a,b]of[[px*d,py*d],[-px*d,-py*d],[-fx*d,-fy*d],[fx*d,fy*d],[(px-fx)*d*.75,(py-fy)*d*.75],[(-px-fx)*d*.75,(-py-fy)*d*.75],[(px+fx)*d*.75,(py+fy)*d*.75],[(fx-px)*d*.75,(fy-py)*d*.75]]){if(clearAt(x+a,y+b,PR_PUSH+2)){ex=x+a;ey=y+b;break}}
   q.x=ex;q.y=ey;if(q!==P){q.tx=ex;q.ty=ey}}}
 if(q===P){if(P._eq){P.eq=P._eq;P.w=P._w;P._eq=null}sfx(SFX_LIST.toAir,.5)}}
// tasto E (o pulsante SALI / ESCI): il client chiede, l'host decide e rimanda a tutti
function vehUse(){if(G.over||G.ext||G.menu||!G.started||P.hp<=0)return;
 if(P.vid>=0){const T=VEH_T[P.vk],vid=P.vid,v=VHC.list[vid];let x=P.x,y=P.y,h;
  if(P.pas){h=v?v.h:P.mh;if(v){x=v.x;y=v.y}}   // passeggero: scende accanto al mezzo (dal jet in volo si lancia in Air)
  else{h=T.fly?P.h:P.mh;if(T.fly&&inWater(P.x,P.y,10)){say('Il jet non può atterrare in acqua');return}}
  if(!NET.on||NET.host){vehLeave(P,x,y,h);if(NET.on)bcast({t:'vl',id:P.id,vid,x:Math.round(x),y:Math.round(y),h:Math.round(h*100)/100})}
  else send(NET.hostConn,{t:'vl',x,y,h});
  return}
 const v=VHC.near;if(!v)return;
 if(!NET.on||NET.host){const s=vehSeatFor(P,v);if(!s)return;vehEnter(P,v,s==='p');if(NET.on)bcast({t:'vb',id:P.id,vid:v.id,p:s==='p'?1:0})}
 else send(NET.hostConn,{t:'vb',vid:v.id})}

// ===== guida del giocatore locale (chiamata da playerUpdate al posto del Grunt / Air) =====
// TUTTI i mezzi si guidano come il jet: W accelera · A/D ruotano · S frena (a terra, da fermi, S tenuto fa una retromarcia lenta per uscire dagli angoli)
// Shift = turbo (consuma la barra dello scatto; il Colosso non ce l'ha). Le ruote sterzano bene solo in movimento, cingoli e gambe ruotano sul posto.
function vehMove(p,dt,fw,bk,tr,ix,iy,il,KK){const T=VEH_T[p.vk],cap=DASH_CD*p.dcm;
 const boost=!!KK.dash&&p.dc<cap&&!T.walk&&fw>0;
 if(boost)p.dc=Math.min(cap,p.dc+DASH_CD*dt);   // consumo fisso (come il boost in Air): con Energia il turbo dura di più
 if(T.fly){
  p.h+=tr*T.turn*p.agi*(boost?1.5:1)*dt;
  p.sp+=((fw?T.v*p.agi*(boost?1.3:1):0)-p.sp)*Math.min(1,(fw?T.acc:bk?T.brk:.35)*dt);
  p.vx=Math.cos(p.h)*p.sp;p.vy=Math.sin(p.h)*p.sp;p.mh=p.h;return}
 const wat=T.walk&&!onBridge(p.x,p.y)&&inWater(p.x,p.y,0)?WATER_SLOW:1,
  hill=inHill(p.x,p.y)?(T.track||T.walk?.85:HILL_SLOW):1,
  mud=(typeof natSlow==='function'?natSlow(p.x,p.y):1)*(wxAt(p.x,p.y)?(T.track||T.walk?.9:WX_SLOW):1),
  road=!T.track&&!T.walk&&onRoad(p.x,p.y,0)?1.12:1;   // le ruote vanno meglio sull'asfalto
 // sterzo: A/D ruotano il mezzo; le ruote solo in movimento (e in retromarcia lo sterzo si inverte, come in auto)
 const wheels=!T.track&&!T.walk,tk=wheels?clamp(Math.abs(p.sp)/90,.3,1)*(p.sp<-5?-1:1):1;
 p.mh+=tr*T.turn*tk*dt;
 // gas e freno
 let tgt=0,rate=.6;                                                            // senza tasti il mezzo rallenta da solo
 if(fw){tgt=T.v*fw*(boost?1.35:1);rate=p.sp<0?T.brk:T.acc}
 else if(bk){if(p.sp>12){tgt=0;rate=T.brk*1.4}else{tgt=-(T.rev||T.v*.35)*bk;rate=T.acc}}   // S: frena; da fermo, retromarcia lenta (T.rev: velocità di retromarcia propria del mezzo)
 p.sp+=(tgt-p.sp)*Math.min(1,rate*dt);
 const f=hill*mud*wat*road;p.vx=Math.cos(p.mh)*p.sp*f;p.vy=Math.sin(p.mh)*p.sp*f;p.h=p.mh}
// dopo lo spostamento: edifici e acqua (push), alberi abbattuti dai mezzi pesanti, altri veicoli e unità pesanti; contro un ostacolo la velocità cala
function vehGround(p,dt){const T=VEH_T[p.vk],x0=p.x,y0=p.y;
 if(T.crush)vehCrush(p,T);
 if(T.civ)vehTraffic(p,T);   // auto, pickup e furgoni vengono spinti dal traffico (prima dei muri: non finiscono dentro un edificio)
 push(p,T.pr,T.walk?1:0);   // solo il Colosso guada; le ruote e i cingoli si fermano sulla riva (i ponti si passano)
 vehSolid(p,T.r*.8);
 const c=Math.hypot(p.x-x0,p.y-y0),mv=Math.abs(p.sp)*dt+1;
 if(c>.3)p.sp*=Math.max(.2,1-c/mv)}
// veicoli (parcheggiati o guidati da altri) e, per chi è a bordo, unità pesanti: si spinge fuori p. Restituisce 1 se ha urtato qualcosa
function vehSolid(p,r){let hit=0;
 for(const v of VHC.list){if(v.dead||v.id===p.vid)continue;
  if(v.drv>=0){const q=v.drv===NET.id?P:others[v.drv];if(!q||q.air)continue}   // il jet in volo non ingombra
  const rr=r+VEH_T[v.k].r*.8,dx=p.x-v.x,dy=p.y-v.y;if(dx>rr||dx<-rr||dy>rr||dy<-rr)continue;
  const d=Math.hypot(dx,dy);if(d>=rr)continue;const k=d>.1?(rr-d)/d:0;p.x+=dx*k;p.y+=dy*k;hit=1}
 if(p.vid>=0)for(const u of units){if(u.dead||u.z||!VEH_HEAVY.has(u.k))continue;   // torrette, carri e APC nemici: non si spostano e fermano il mezzo
  const rr=r+UT[u.k].r*.85,dx=p.x-u.x,dy=p.y-u.y;if(dx>rr||dx<-rr||dy>rr||dy<-rr)continue;
  const d=Math.hypot(dx,dy);if(d>=rr||d<.1)continue;const k=(rr-d)/d;p.x+=dx*k;p.y+=dy*k;hit=1}
 return hit}
// carro armato e Colosso abbattono gli alberi che urtano (l'host decide; il client li abbatte subito in locale e lo comunica)
function vehCrush(p,T){if(Math.abs(p.sp)<40)return;const A=authority();
 for(const o of qobs(p.x,p.y,T.r+60,_vq)){if(o.t!=='t'||o.dead||Math.hypot(o.x-p.x,o.y-p.y)>T.r+o.r+2)continue;
  if(A)damageObs(o,o.hp+1,null);else{send(NET.hostConn,{t:'vt',id:o.id});applyObs(o.id,0)}}}
// suono di movimento del giocatore: Grunt (passi), Colosso, jet, carro armato, ogni altro mezzo
const moveSfx=p=>{if(!(p.vid>=0))return SFX_LIST.move;const T=VEH_T[p.vk];return T.walk?SFX_LIST.mvWalker:T.fly?SFX_LIST.mvJet:T.track?SFX_LIST.mvTank:SFX_LIST.mvVeh};
const moveMul=p=>p.vid>=0&&VEH_T[p.vk].walk?VEH_WALK_VOL:1;   // volume in più del loop di movimento: solo il Colosso
// Colosso: un passo ogni volta che un piede tocca terra nel disegno (artWalker: gambe = sin(wk/22), piede a terra ai picchi → ogni π·22 px percorsi)
function vehStepSnd(p){const v=VHC.list[p.vid];if(!v)return;
 const n=Math.floor((v.wk||0)/(Math.PI*22)-.5);   // indice del passo in corso
 if(p._stk!==n){if(p._stk!=null&&p._stv===v.id)sfx(SFX_LIST.mvWalker,Math.min(1,WALK_VOL*VEH_WALK_VOL));p._stk=n;p._stv=v.id}}   // _stv: niente passo "finto" appena si sale a bordo

// ===== motori dell'AI: carri (cingoli) · APC, auto in strada, convoglio, furgoni VIP (motore) =====
// UN loop per suono (2 in tutto) che segue la sorgente in movimento più vicina: volume con la distanza e stereo, come sfxAt.
// Niente rete (posizioni già note a ogni client), ricerca 10 volte al secondo, stesse ripetizioni senza stacchi del loop del giocatore (walkVoice). Solo Web Audio.
const AI_MV_VOL=.3,CIV_SND=.5,AIS={t:0,L:{}},_aiCiv={x:0,y:0},_aiSky={x:0,y:0};   // volume di base · loop attivi per file · posizione dell'auto civile / della macchina volante più vicina (oggetti riusati)
function aiLoop(src,best,bd,mul){const c=AC;let S=AIS.L[src];   // mul = volume in più per la sorgente di questo giro (1 se manca)
 if(!best){if(S&&!S.off){S.off=1;
   if(S.au){for(const a of S.au.p)try{a.pause()}catch(_){}delete AIS.L[src]}   // ripiego <audio>: si ferma subito
   else{S.g.gain.setTargetAtTime(0,c.currentTime,.15);S.end=c.currentTime+.8}}   // Web Audio: dissolvenza, poi aiMoveSnd lo distrugge
  return}
 const b=sfxLoad(src);if(b===0)return;   // ancora in caricamento
 const vol=(src===SFX_LIST.burn?1:AI_MV_VOL)*(WALK_MUL[src]||1)*(mul==null?1:mul)*SFX_VOL*(1-bd/SFX_R*.8);   // fuoco del lanciafiamme: volume base 1 · motori dell'AI: AI_MV_VOL
 if(!S){const v=sfxVar(src);
  if(b===-1||!c){   // Web Audio non disponibile (pagina aperta da file://, file non decodificabile): due <audio> alternati, senza stereo né timbro
   const p=[new Audio(src),new Audio(src)];for(const a of p){a.loop=false;a.preservesPitch=false;a.playbackRate=v.rate;a.volume=0}
   S=AIS.L[src]={au:{src,p,i:0,fd:null,vol:0},gain:v.gain};const r=p[0].play();if(r&&r.catch)r.catch(()=>{})}
  else{const g=c.createGain();g.gain.value=0;let o=g;const n=[g];
   if(v.cut){const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=v.cut;o.connect(f);o=f;n.push(f)}
   let pn=null;if(c.createStereoPanner){pn=c.createStereoPanner();o.connect(pn);o=pn;n.push(pn)}
   o.connect(c.destination);S=AIS.L[src]={W:{b,src,rate:v.rate,g,vs:[],next:0},g,n,pn,gain:v.gain};walkVoice(S.W,c.currentTime,true)}}
 S.off=0;
 if(S.au){const A=S.au;A.vol=clamp(vol*S.gain,0,1);if(!A.fd)A.p[A.i].volume=A.vol;return}   // durante la dissolvenza il volume lo applica walkAuPump
 const t=c.currentTime;S.g.gain.setTargetAtTime(vol*S.gain,t,.1);
 if(S.pn)S.pn.pan.setTargetAtTime(clamp((best.x-ear.x)/SFX_R*1.6,-1,1),t,.1)}
function aiMoveSnd(rd){const c=AC;
 for(const k in AIS.L){const S=AIS.L[k];   // ogni fotogramma: prossima ripetizione, oppure distruzione dei loop spenti
  if(S.au){walkAuPump(S.au);continue}      // ripiego <audio>: dissolvenza fra le due copie
  if(S.off&&c.currentTime>S.end){for(const x of S.W.vs)try{x.s.stop()}catch(_){}for(const q of S.n)try{q.disconnect()}catch(_){}delete AIS.L[k];continue}
  if(S.W.next-c.currentTime<.25)walkVoice(S.W,Math.max(S.W.next,c.currentTime),false)}
 AIS.t-=rd;if(AIS.t>0)return;AIS.t=.1;
 if(!G.started||G.over||!M){aiLoop(SFX_LIST.mvTank,null);aiLoop(SFX_LIST.mvVeh,null);aiLoop(SFX_LIST.burn,null);aiLoop(SFX_LIST.mvJet,null);return}
 const mv=o=>{const m=o._sx!=null&&Math.abs(o.x-o._sx)+Math.abs(o.y-o._sy)>1.5;o._sx=o.x;o._sy=o.y;return m};   // si è mosso dall'ultimo controllo (anche sui client, dove le unità sono interpolate)
 let tb=null,td=SFX_R,vb=null,vd=SFX_R;
 const near=(o,tank)=>{const d=Math.hypot(o.x-ear.x,o.y-ear.y);if(tank){if(d<td){td=d;tb=o}}else if(d<vd){vd=d;vb=o}};
 for(const u of units){if(u.dead||(u.k!==5&&u.k!==UK_APC))continue;if(mv(u))near(u,u.k===5)}   // carri e APC dell'AI, nemici e alleati
 if(typeof MS!=='undefined'&&MS){if(G.mt==1&&MS.al&&MS.al.hp>0&&mv(MS.al))near(MS.al,false);   // convoglio
  if(MS.vans)for(const v of MS.vans)if(v.hp>0&&mv(v))near(v,false)}                            // furgoni dei VIP
 for(let i=0;i<CIV.n;i++){if(!CIV.k[i]||CIV.d[i])continue;const d=Math.hypot(CIV.X[i]-ear.x,CIV.Y[i]-ear.y);   // auto del traffico: sempre in marcia
  if(d<vd){vd=d;_aiCiv.x=CIV.X[i];_aiCiv.y=CIV.Y[i];vb=_aiCiv}}
 aiLoop(SFX_LIST.mvTank,tb,td);aiLoop(SFX_LIST.mvVeh,vb,vd,vb===_aiCiv?CIV_SND:1);   // auto civile più vicina: a metà volume · APC, convoglio, furgoni: volume pieno
 {let sd=SFX_R,sb=null;for(let i=0;i<SKY.n;i++){if(SKY.D[i])continue;const d=Math.hypot(SKY.X[i]-ear.x,SKY.Y[i]-ear.y);if(d<sd){sd=d;_aiSky.x=SKY.X[i];_aiSky.y=SKY.Y[i];sb=_aiSky}}
  aiLoop(SFX_LIST.mvJet,sb,sd,CIV_SND)}   // macchine civili volanti: motore del jet, volume dei motori dell'AI (AI_MV_VOL)
 // fuoco del lanciafiamme: un solo loop che segue la cosa in fiamme più vicina (unità, giocatori, alleati, edifici e alberi) · lo stato burn c'è già su ogni client
 let fb=null,fd=SFX_R;const fire=o=>{if(!(o&&o.burn>0))return;const d=Math.hypot(o.x-ear.x,o.y-ear.y);if(d<fd){fd=d;fb=o}};
 for(const u of units)if(!u.dead)fire(u);
 for(const q of plist())if(q.hp>0)fire(q);
 for(const q of allyList())if(q.hp>0)fire(q);
 for(const o of BURN_OBS)if(!o.dead)fire(o);
 for(const r of BURN_REM)fire(r);   // resti in fiamme
 aiLoop(SFX_LIST.burn,fb,fd)}

// ===== traffico: le auto dei civili vanno sui loro binari e non si fermano; un mezzo CIVILE dei giocatori che le tocca viene spostato via, senza danni =====
// o = veicolo guidato (il giocatore) o parcheggiato · stessa griglia dei colpi (civGrid): poche celle, nessuna allocazione · restituisce 1 se è stato spinto
function vehTraffic(o,T){if(!CIV.n)return 0;civGrid();const rm=T.r*.8+CIV_RV,
 x0=clamp((o.x-rm)/CVG|0,0,CVGW-1),x1=clamp((o.x+rm)/CVG|0,0,CVGW-1),y0=clamp((o.y-rm)/CVG|0,0,CVGH-1),y1=clamp((o.y+rm)/CVG|0,0,CVGH-1);let hit=0;
 for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++)for(let i=CIV.gh[cy*CVGW+cx];i>=0;i=CIV.gn[i]){if(CIV.d[i]||!CIV.k[i])continue;
  const rr=T.r*.8+CIV_VR[CIV.c[i]],dx=o.x-CIV.X[i],dy=o.y-CIV.Y[i];if(dx>rr||dx<-rr||dy>rr||dy<-rr)continue;
  const d=Math.hypot(dx,dy);if(d>=rr)continue;
  // spinta soprattutto di lato rispetto alla marcia dell'auto (esce dalla corsia invece di essere trascinato lungo la strada)
  const hx=Math.cos(CIV.H[i]),hy=Math.sin(CIV.H[i]),sd=hx*dy-hy*dx>=0?1:-1,lx=-hy*sd,ly=hx*sd,
   ux=d>.1?dx/d:lx,uy=d>.1?dy/d:ly,px=ux*.35+lx,py=uy*.35+ly,pl=Math.hypot(px,py)||1,k=(rr-d)*1.4+2;
  o.x+=px/pl*k;o.y+=py/pl*k
  hit=1}
 return hit}
// mezzi civili parcheggiati: li sposta solo l'host e manda le nuove posizioni (raramente: solo quando un'auto del traffico li urta)
function vehTrafficParked(dt){let mv=0;
 for(const v of VHC.list){if(v.dead||v.drv>=0)continue;const T=VEH_T[v.k];if(!T.civ)continue;
  if(vehTraffic(v,T)){push(v,T.pr);v.tmv=1;mv=1}}
 if(!NET.on)return;
 VHC.tt=(VHC.tt||0)-dt;if(VHC.tt>0)return;VHC.tt=.1;   // al massimo 10 invii al secondo, solo dei mezzi spostati
 const l=[];for(const v of VHC.list)if(v.tmv){v.tmv=0;l.push([v.id,Math.round(v.x),Math.round(v.y)])}
 if(l.length)bcast({t:'vp',l})}

// ===== investimenti (solo host): umanoidi danneggiati e spinti via, civili uccisi, mezzi pesanti intoccabili =====
function vehRamHit(e,o){const a=e.ar,g=e.drG;e.ar=0;e.drG=0;damage(e,VEH_RAM_DMG,o);e.ar=a;e.drG=g}   // 50 punti vita esatti: la corazza non conta
function vehRam(q,v,T){const sp=Math.hypot(q.vx||0,q.vy||0);if(sp<VEH_RAM_V)return;
 const nx=q.vx/sp,ny=q.vy/sp,R0=T.r;
 // spinta: fuori dal mezzo, di lato e in avanti rispetto alla corsa
 const shove=(e,rr,d,dx,dy)=>{const ux=d>.1?dx/d:-ny,uy=d>.1?dy/d:nx,ox=ux*(rr-d)+(ux*.6+nx*.4)*VEH_RAM_PUSH,oy=uy*(rr-d)+(uy*.6+ny*.4)*VEH_RAM_PUSH;return[ox,oy]};
 for(const u of units){if(u.dead||u.z||!VEH_HUM.has(u.k))continue;
  const rr=R0+UT[u.k].r,dx=u.x-q.x,dy=u.y-q.y;if(dx>rr||dx<-rr||dy>rr||dy<-rr)continue;
  const d=Math.hypot(dx,dy);if(d>=rr)continue;
  const[ox,oy]=shove(u,rr,d,dx,dy);u.x+=ox;u.y+=oy;push(u,UT[u.k].pr||18);   // non finisce dentro un edificio o in acqua
  if(u._rk>G.t)continue;u._rk=G.t+VEH_RAM_CD;
  fxSpawn(u.x,u.y,'#c01818',8,true,30);sfxAt(SFX_LIST.melee,.8,u.x,u.y,80);
  if(!u.sec)vehRamHit(u,q.id)}   // gli alleati (wingman, guardie, torrette) vengono solo spostati
 // civili sotto le ruote (stessa griglia dei colpi: poche celle)
 if(CIV.n){civGrid();const rm=R0+CIV_RV,x0=clamp((q.x-rm)/CVG|0,0,CVGW-1),x1=clamp((q.x+rm)/CVG|0,0,CVGW-1),y0=clamp((q.y-rm)/CVG|0,0,CVGH-1),y1=clamp((q.y+rm)/CVG|0,0,CVGH-1);
  for(let cy=y0;cy<=y1;cy++)for(let cx=x0;cx<=x1;cx++)for(let i=CIV.gh[cy*CVGW+cx];i>=0;i=CIV.gn[i]){if(CIV.d[i])continue;
   if(CIV.k[i]&&T.civ)continue;   // auto del traffico: le schiacciano solo carro, APC e Colosso; ai mezzi civili danno una spinta (vehTraffic)
   const r=R0*.85+(CIV.k[i]?CIV_VR[CIV.c[i]]:CIV_RP);if(Math.hypot(CIV.X[i]-q.x,CIV.Y[i]-q.y)<r)civKill(i,q.id)}}
 // deathmatch: anche i Grunt degli altri giocatori (a piedi) si investono
 if(G.mode==1)for(const t of plist()){if(t===q||t.z||t.vid>=0)continue;
  const rr=R0+PR_GRUNT,dx=t.x-q.x,dy=t.y-q.y;if(dx>rr||dx<-rr||dy>rr||dy<-rr)continue;
  const d=Math.hypot(dx,dy);if(d>=rr)continue;const[ox,oy]=shove(t,rr,d,dx,dy);
  if(t===P){P.x+=ox;P.y+=oy;push(P,PR_PUSH,1)}else{t.x+=ox;t.y+=oy;t.tx+=ox;t.ty+=oy;send(NET.conns[t.id],{t:'kb',x:Math.round(ox),y:Math.round(oy)})}
  if(t._rk>G.t)continue;t._rk=G.t+VEH_RAM_CD;hurtFx(t.x,t.y);sfxAt(SFX_LIST.melee,.8,t.x,t.y,80);vehRamHit(t,q.id)}}

// ===== danni al mezzo (da damage() in AGsim.js: chi è a bordo non viene colpito direttamente) =====
function vehHit(e,d,o){const v=VHC.list[e.vid];if(!v||v.dead){e.vid=-1;e.vk=-1;return damage(e,d,o)}
 const T=VEH_T[v.k];d=Math.max(atkMin(o),d-T.ar);v.hp-=d;e.lh=o;   // minimo 1, o 2 con Proiettili perforanti
 if(v.hp<=0&&authority()){vehDestroy(v,o);if(NET.on)bcast({t:'vx',vid:v.id})}
 return d}
function vehDestroy(v,o){if(!v||v.dead)return;const T=VEH_T[v.k],A=authority(),out=vehPeople(v,[]);   // copia: vehLeave cambia chi è a bordo
 for(const q of out)vehLeave(q,v.x,v.y,v.h,1);   // guidatore e passeggeri sbalzati fuori
 for(const w of vehVipList())if(w.inV===v.id){if(w.hp>0)vehVipOut(w,v);else w.inV=-1;if(A&&w.hp>0)damage(w,VEH_EJECT_DMG,o)}   // anche i VIP, feriti
 v.dead=1;v.hp=0;v.drv=-1;
 fxBoom(v.x,v.y,'struct',Math.min(90,T.r*2));fxSpawn(v.x,v.y,'#ffd23f',14,true,45);sfxAt(SFX_LIST.boom,1,v.x,v.y,0);
 makeBlood(v.x,v.y,T.r/12,true);if(!inWater(v.x,v.y,0))craterAdd(v.x,v.y,T.r*1.6);   // macchia d'olio e cratere
 if(A)for(const q of out)damage(q,VEH_EJECT_DMG,o)}   // chi era a bordo viene sbalzato fuori ferito

// ===== riparazione all'armeria: R a bordo vicino a un'armeria → +VEH_REPAIR vita/s finché il mezzo resta vicino (la vita la decide l'host) =====
const armNearAt=(x,y,r)=>{for(const o of ARM.list){if(o.dead)continue;const l=toLocal(o,x,y);if(bsd(o,l[0],l[1])<ARM_R+r)return o}return null};
function vehRepair(){if(!(P.vid>=0)||P.pas||P.hp<=0||G.over||!VHC.arm)return;const v=VHC.list[P.vid];if(!v||v.dead)return;   // ripara solo chi guida
 if(v.hp>=v.mhp){say('Il veicolo è già integro');return}
 P.vrep=1;say('Riparazione in corso: resta vicino all\u2019armeria');
 if(NET.on&&!NET.host)send(NET.hostConn,{t:'vr'})}
function vehRepairTick(dt){const A=authority();
 for(const q of plist()){if(!q.vrep)continue;const v=VHC.list[q.vid];
  if(!v||v.dead||q.pas||!armNearAt(q.x,q.y,VEH_T[v.k].r)){q.vrep=0;if(q===P&&v&&!v.dead)say('Riparazione interrotta');continue}   // lontano dall'armeria: si ferma
  if(A)v.hp=Math.min(v.mhp,v.hp+VEH_REPAIR*dt);
  if(v.hp>=v.mhp){q.vrep=0;if(q===P)say('Veicolo riparato')}}}   // sul client la vita arriva dallo snapshot
Handlers.vr=(m,c)=>{if(!NET.host)return;const q=others[c.pid];if(q&&q.vid>=0&&!q.pas)q.vrep=1};   // il client chiede la riparazione; distanza e vita le controlla vehRepairTick

// ===== ogni fotogramma (tutti): i mezzi seguono i piloti; l'host calcola gli investimenti; mezzo libero più vicino =====
function vehTick(dt){const L=VHC.list;if(!L.length)return;const A=authority();
 for(const v of L){if(v.dead||v.drv<0)continue;
  const q=v.drv===NET.id?P:others[v.drv];
  if(!q||q.vid!==v.id||q.pas){v.drv=-1;continue}   // pilota uscito dalla partita: il mezzo resta dov'è
  const T=VEH_T[v.k],ox=v.x,oy=v.y;v.x=q.x;v.y=q.y;v.h=T.fly?q.h:q.mh;v.wk+=Math.hypot(v.x-ox,v.y-oy);
  if(q.hp<=0||G.ext){vehLeave(q,q.x,q.y,v.h);continue}   // pilota a terra / estrazione: scende
  if(A&&!q.air)vehRam(q,v,T)}
 vehPasTick();                 // passeggeri: seguono il mezzo (dopo che il guidatore l'ha spostato)
 if(A){vehTrafficParked(dt);vehVipTick(dt)}
 vehRepairTick(dt);
 VHC.nt-=dt;if(VHC.nt>0)return;VHC.nt=.15;   // vicinanza: 7 volte al secondo bastano
 const ar=P.vid>=0&&!P.pas&&P.hp>0&&!G.over?armNearAt(P.x,P.y,VEH_T[P.vk].r):null;   // armeria a portata del mezzo guidato
 if(ar&&!VHC.arm&&!P.vrep){const v=VHC.list[P.vid];if(v&&v.hp<v.mhp)say('Premi '+kbLabel(KEYBIND.reload)+' per riparare il veicolo')}
 VHC.arm=ar;
 let best=null,bd=VEH_USE_R,bs=null;   // mezzo libero o con un posto da passeggero (solo alleati) più vicino
 if(P.hp>0&&!(P.vid>=0)&&!P.air&&!G.over&&!G.ext)for(const v of L){if(v.dead)continue;const d=Math.hypot(v.x-P.x,v.y-P.y)-VEH_T[v.k].r;if(d>=bd)continue;
  const s=vehSeatFor(P,v);if(s){bd=d;best=v;bs=s}}
 VHC.near=best;VHC.ns=bs}
// passeggeri (giocatori): posizione, velocità e quota del mezzo; scendono se il mezzo non c'è più, se muoiono o all'estrazione
function vehPasTick(){
 for(const q of[P,...Object.values(others)]){if(!q||!(q.vid>=0)||!q.pas)continue;const v=VHC.list[q.vid];
  if(!v||v.dead){q.vid=-1;q.vk=-1;q.pas=0;q.air=false;q.z=0;continue}
  if(q.hp<=0||G.ext){vehLeave(q,v.x,v.y,v.h,G.ext?1:0);continue}
  const d=vehDriver(v),fly=!!(VEH_T[v.k].fly&&d&&d.air);
  q.x=v.x;q.y=v.y;if(q!==P){q.tx=v.x;q.ty=v.y}q.h=q.mh=v.h;q.vx=d?d.vx||0:0;q.vy=d?d.vy||0:0;q.air=fly;q.z=fly?1:0}}
// ===== VIP a bordo (solo host): salgono se restano accanto a un mezzo fermo con giocatori a bordo e un posto libero; scendono se a bordo non resta nessun giocatore =====
const vipActive=w=>w.hp>0&&!w.dead&&(G.mt==2?!!w.st:(!!w.on&&!w.saved));
function vehVipOut(w,v){const T=VEH_T[v.k],h=v.h,px=-Math.sin(h),py=Math.cos(h),d=T.r+(w.rr||16)+6;let x=v.x,y=v.y;
 for(const[a,b]of[[-px*d,-py*d],[px*d,py*d],[-Math.cos(h)*d,-Math.sin(h)*d],[Math.cos(h)*d,Math.sin(h)*d]])if(!inWater(v.x+a,v.y+b,(w.rr||16)+4)&&clearAt(v.x+a,v.y+b,(w.rr||16)+2)){x=v.x+a;y=v.y+b;break}
 w.inV=-1;w.vbT=0;w.x=x;w.y=y;w.tx=x;w.ty=y;w.vx=w.vy=0;w.path=null;w.pi=0;w.pt=0;w.stk=0;w.sk=0;w.lx=x;w.ly=y;w.gh=0;w.tc=1;
 sfxAt(SFX_LIST.toGrunt,.6,x,y,60)}
function vehVipTick(dt){const L=vehVipList();if(!L.length)return;
 for(const w of L){if(w.inV==null)w.inV=-1;
  if(w.inV>=0){const v=VHC.list[w.inV];
   if(!v||v.dead||!vipActive(w)||!vehPeople(v).length){if(v&&!v.dead&&w.hp>0&&!w.dead)vehVipOut(w,v);else w.inV=-1;continue}   // nessun giocatore a bordo (o VIP in salvo): scende
   w.x=v.x;w.y=v.y;w.h=v.h;w.vx=w.vy=0;continue}
  if(!vipActive(w)){w.vbT=0;continue}
  let best=null;
  for(const v of VHC.list){if(v.dead||!vehPeople(v).length||vehPasN(v)>=(VEH_T[v.k].seats|0))continue;
   const d=vehDriver(v);if(d&&(d.air||Math.hypot(d.vx||0,d.vy||0)>VEH_VIP_V))continue;   // mezzo in volo o in corsa: il VIP aspetta
   if(Math.hypot(w.x-v.x,w.y-v.y)-VEH_T[v.k].r<VEH_VIP_R){best=v;break}}
  if(!best){w.vbT=0;continue}
  w.vbT=(w.vbT||0)+dt;
  if(w.vbT>=VEH_VIP_T){w.vbT=0;w.inV=best.id;fxSpawn(w.x,w.y,'#5ee0c0',10,true,35);sfxAt(SFX_LIST.toGrunt,.6,w.x,w.y,60);announce((w.n?'VIP '+w.n:'VIP')+' a bordo: '+VEH_T[best.k].n)}}}

// ===== rete =====
// stato completo dei mezzi (welcome e snapshot completi): [x, y, scafo, vita, pilota, distrutto], indice = id
const vehPack=()=>VHC.list.map(v=>[Math.round(v.x),Math.round(v.y),Math.round(v.h*100)/100,Math.max(0,Math.ceil(v.hp)),v.drv,v.dead?1:0]);
function vehUnpack(a){if(!Array.isArray(a))return;
 for(let i=0;i<a.length&&i<VHC.list.length;i++){const v=VHC.list[i],e=a[i];if(!e)continue;
  if(e[5]){if(!v.dead){for(const q of vehPeople(v,[]))vehLeave(q,v.x,v.y,v.h,1);v.dead=1;v.drv=-1;v.hp=0}continue}   // distrutto mentre non c'eravamo: niente effetti
  v.hp=e[3];if(e[4]<0&&v.drv<0){v.x=e[0];v.y=e[1];v.h=e[2]}}}   // i mezzi guidati li sposta il loro pilota; chi guida cosa lo dicono le righe dei giocatori (vehSnap)
// riga di un giocatore nello snapshot: vid = veicolo guidato secondo l'host, hp = sua vita
function vehSnap(q,vid,hp,pas){if(vid==null)return;vid=vid|0;pas=pas?1:0;
 if(vid!==q.vid||(vid>=0&&pas!==(q.pas|0))){
  const lv=()=>{if(q.vid>=0){const T=VEH_T[q.vk];vehLeave(q,q.x,q.y,!q.pas&&T&&T.fly?q.h:q.mh)}};
  if(vid<0)lv();
  else{const v=VHC.list[vid];if(v&&!v.dead){lv();vehEnter(q,v,pas)}}}
 if(vid>=0&&VHC.list[vid])VHC.list[vid].hp=+hp||0}
// salire: il client chiede, l'host controlla (mezzo libero e vicino) e lo rimanda a tutti, mittente compreso
Handlers.vb=(m,c)=>{
 if(NET.host){const q=others[c.pid],v=VHC.list[m.vid|0];
  if(!q||q.hp<=0||q.air||q.vid>=0||!v||v.dead||Math.hypot(q.tx-v.x,q.ty-v.y)>VEH_T[v.k].r+VEH_USE_R+80)return;
  const s=vehSeatFor(q,v);if(!s)return;   // posto di guida libero → guida; altrimenti passeggero se c'è posto e sono alleati
  vehEnter(q,v,s==='p');bcast({t:'vb',id:c.pid,vid:v.id,p:s==='p'?1:0})}
 else{const q=m.id===NET.id?P:others[m.id],v=VHC.list[m.vid|0];if(q&&v)vehEnter(q,v,!!m.p)}};
// scendere: posizione del client se plausibile
Handlers.vl=(m,c)=>{
 if(NET.host){const q=others[c.pid];if(!q||q.vid<0)return;const vid=q.vid;let x=+m.x,y=+m.y;if(!(Math.hypot(x-q.tx,y-q.ty)<200)){x=q.x;y=q.y}const h=+m.h||0;
  vehLeave(q,x,y,h);bcast({t:'vl',id:c.pid,vid,x:Math.round(x),y:Math.round(y),h:Math.round(h*100)/100})}
 else{const q=m.id===NET.id?P:others[m.id];if(q&&q.vid>=0)vehLeave(q,+m.x,+m.y,+m.h)}};
// mezzi parcheggiati spinti dal traffico (deciso dall'host): [id, x, y]
Handlers.vp=m=>{if(NET.host)return;for(const e of m.l){const v=VHC.list[e[0]|0];if(v&&!v.dead&&v.drv<0){v.x=+e[1];v.y=+e[2]}}};
// mezzo distrutto (deciso dall'host)
Handlers.vx=m=>{if(NET.host)return;vehDestroy(VHC.list[m.vid|0],null)};
// spinta subita da un investimento (deathmatch)
Handlers.kb=m=>{if(NET.host)return;P.x+=+m.x||0;P.y+=+m.y||0;push(P,PR_PUSH,1);hurtFx(P.x,P.y)};
// albero abbattuto dal mezzo pesante di un client
Handlers.vt=(m,c)=>{if(!NET.host)return;const q=others[c.pid],o=M&&M.obs[m.id|0];
 if(!q||q.vid<0||!VEH_T[q.vk].crush||!o||o.dead||o.t!=='t'||Math.hypot(o.x-q.tx,o.y-q.ty)>VEH_T[q.vk].r+o.r+120)return;
 damageObs(o,o.hp+1,null)};
