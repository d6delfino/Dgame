'use strict';
/* AIRGRUNT · AGmis.js — MISSIONI, tutte in questo file:
     PARTE COMUNE  registro (misDef, Mi) e attrezzi condivisi: estrazione, zone da conquistare, ondate, VIP, missioni di difesa, rete, HUD
     MISSIONI      un blocco per missione (0 Sterminio … 11 Affonda la flotta): misDef(id,{...}) con tutto ciò che la riguarda, più le sue funzioni di aiuto
     MODELLO       in fondo, commentato: una missione d'esempio completa da copiare
   Il resto del gioco non controlla mai il numero della missione: chiede alla missione in corso, Mi(), i suoi campi e le sue funzioni.
   COME SI AGGIUNGE UNA MISSIONE: copia il blocco della missione più simile (o il MODELLO) in fondo all'elenco delle missioni, cambia id (il primo libero) e contenuto.
   Non serve toccare nient'altro: menu della lobby, missioni a caso, schermata di caricamento e campagna la trovano da sole.
   I valori numerici restano in AGconf.js (sezione della missione), come per il resto del gioco.

   CAMPI DI misDef (tutti facoltativi tranne name; le funzioni le chiama solo chi simula, tranne dove è scritto "tutti"):
   · testi      name · story (schermata di caricamento) · camp (testi della campagna: b, bv, bf, bfv, w, l, sw, sl, fw, fl, fwv, vedi AGcamp.js)
   · campagna   unlock: upgrade sbloccati vincendola · vipBonus: 1 = può dare il bonus raro Slow motion · dir: peso nel regista {open, dev, fin} (numero o h=>numero, h = {has, lf, last, lost})
   · mappa      th: ambienti ammessi (indici di THEMES; assente = tutti) · need(r): siti obbligatori ('g' città, 'k' centrale...) · keep / keepIn: radure tenute libere (esterni / interni)
                static(K): prepara MD dalla mappa (K = sites, blds, fr, towns, mkBlk, MR, mr, shuf); false = mappa non adatta, se ne crea un'altra (tutti)
   · partita    spawn(S): nemici e alleati iniziali (S = put, squad, al, far) · tick(dt, pl): regole, vittoria e sconfitta · tickAfterExt: 1 = tick continua anche durante l'estrazione
                defend: 1 = missione di difesa (niente caserme né nave nemica, i nemici attaccano anche MD.mb) · ships(): navi nemiche al posto di quella a caso
                allies(): alleati che i nemici attaccano · vipList(out) / vipActive(w): VIP che salgono sui veicoli · extVips(list): VIP caricati dalle dropship · engine(): alleato col rumore del motore
   · estrazione ext: testi e raggio (vedi EXT_DEF) · extBegin · extTick · extStart · extHold · extBusy · extInfo (vedi extractTick e missionInfo)
   · rete       pack(): numeri in più nello snapshot · unpack(a, i): li legge da a[i] (client) · clientInit(al): alleati sul client
   · HUD        info(): {t testo, f barra 0..1 (-1 = niente), c colore, h seconda barra} · marks(o): triangoli {x, y, c} (assente = caserme)
   · disegno (tutti) zones: 1 = disegna le zone MD.z · extShow: 1 = cerchio di estrazione sempre visibile · drawUnder(pu) / drawWorld(pu): sul terreno, prima / dopo zone ed estrazione
                drawAir(): sopra i giocatori a terra · drawScreen(): sullo schermo intero · anim(dt): animazioni locali · reset(): a ogni nuova partita · hideAll(): i mech sono "a bordo" */

// ===== registro: ogni file di missione chiama misDef(id,{...}) =====
const MIS=[],MIS_NAMES=[],MISSION_STORY=[];let MIS_N=0;   // MIS_N = id più alto: le missioni estraibili a caso sono 1..MIS_N (la 0, Sterminio, solo se scelta)
function misDef(id,d){d.id=id;MIS[id]=d;MIS_NAMES[id]=d.name;MISSION_STORY[id]=d.story||'';if(id>MIS_N)MIS_N=id;return d}
const Mi=()=>MIS[G.mt]||MIS[0];   // la missione in corso (deathmatch e Arena Duel: G.mt = 0)
// missioni possibili nell'ambiente th (indice di THEMES in AGmap.js): campo th della missione (assente = tutti) · th = 0 (città): null = tutte
const misTh=th=>th?Array.from({length:MIS_N},(_,i)=>i+1).filter(k=>MIS[k]&&(!MIS[k].th||MIS[k].th.indexOf(th)>=0)):null;

// ===== stato della missione =====
// MD = dati fissi (dal seed, uguali su tutti i client): zone MD.z, bersagli MD.tg, percorso, edificio MD.mb... · MS = stato dinamico (lo decide l'host, ai client arriva con msPack)
let MD={blk:[],tg:[],z:[],wp:[]},MS={t:0,st:0,al:null},BAR=[];
allyList=()=>{const D=Mi();if(D.allies)return D.allies();const a=MS.al;return a&&a.on&&a.hp>0&&!(a.inV>=0)?[a]:[]};   // alleati che i nemici attaccano e che i colpi colpiscono · VIP a bordo: li protegge il mezzo

// ===== obiettivo compiuto ed estrazione =====
// non si vince subito. Fase 1 (MS.ex = 1) = raggiungere il punto di estrazione, fase 2 (MS.ex = 2) = arriva la dropship
// testi e raggio dell'estrazione: campo ext della missione (la nave spaziale della missione 7 li cambia), altrimenti questi
const EXT_DEF={r:EXT_R,label:'ESTRAZIONE',to:' Raggiungi il punto di estrazione!',go:'Dropship in arrivo!',run:'Estrazione in corso…',all:'Obiettivo compiuto! Tutti i giocatori al punto di estrazione'};
const misExt=()=>Mi().ext||EXT_DEF;
const extR=()=>misExt().r;
function objDone(txt){if(G.over||MS.ex)return;MS.ex=1;MS.exMsg=txt;announce(txt+misExt().to)}
function extractBegin(){if(G.ext)return;G.ext=1;P.air=false;P.z=0;P.vx=P.vy=0;P.sp=0;const D=Mi();if(D.extBegin)D.extBegin();else dsExtract()}
// extTick: ogni fotogramma durante l'estrazione · extHold: la dropship non può arrivare · extStart: appena parte l'estrazione · extBusy: la vittoria aspetta (animazione in corso)
function extractTick(dt){const m=MS,pl=plist(),D=Mi();
 if(D.extTick)D.extTick(dt);
 if(m.ex==1&&!(D.extHold&&D.extHold())){if(pl.length==1+Object.keys(others).length&&pl.every(q=>Math.hypot(q.x-EXT[0],q.y-EXT[1])<extR())){m.ex=2;announce(misExt().go);extractBegin();if(D.extStart)D.extStart()}}
 else if(m.ex==2&&!DS.on&&!(D.extBusy&&D.extBusy()))finish(2,'Estrazione completata!')}

// ===== attrezzi comuni =====
// punto libero più vicino al centro del sito (a spirale) dove mettere la zona di cattura
function zoneAt(s){for(let r=0;r<=330;r+=30)for(let k=0,n=r?12:1;k<n;k++){const a=k*TAU/12,x=s.x+Math.cos(a)*r,y=s.y+Math.sin(a)*r;if(clearAt(x,y,70)&&!inWater(x,y,KOTH_R))return{x,y,r:KOTH_R,p:0}}return{x:s.x,y:s.y,r:KOTH_R,p:0}}
const regione=(x,y)=>{const v=y<WH/3?'nord':y>WH*2/3?'sud':'',h=x<WW/3?'ovest':x>WW*2/3?'est':'';return v&&h?v+'-'+h:v||h||'centro'};
// zone da conquistare una dopo l'altra (MD.z, MS.cz) con il Grunt: dentro la zona l'avanzamento sale, fuori scende; con un giocatore dentro arrivano ondate (kothWave)
// done(z) = presa l'ultima zona · next = messaggio fra una zona e la successiva
function zonesTick(dt,pl,done,next){const m=MS,z=MD.z[m.cz];
 if(z){const inside=pl.some(q=>!q.z&&Math.hypot(q.x-z.x,q.y-z.y)<z.r);z.p=clamp(z.p+(inside?dt/KOTH_T:-dt/KOTH_T*.5),0,1);
  if(inside){m.wt-=dt;if(m.wt<=0){m.wt=KOTH_WAVE;kothWave(z)}}
  if(z.p>=1){m.cz++;m.wt=3;
   if(m.cz>=MD.z.length)done(z);
   else announce(next)}}}
const zonesInfo=nm=>{const i=Math.min(MS.cz,MD.z.length-1);return{t:'Occupa '+nm(i)+' con il Grunt e resisti alle ondate',f:MD.z[i].p,c:'#ffd23f'}};   // nm(i) = nome della zona i
function zonesMarks(o){const z=MD.z[MS.cz];if(z)o.push({x:z.x,y:z.y,c:'#ffd23f'})}
function barMarks(o){for(const b of BAR)if(!b.dead)o.push({x:b.x,y:b.y,c:'#ff5a4a'})}   // caserme ancora in piedi

// ===== parte fissa: caserme e preparazione della missione (dal seed, uguale su tutti i client) =====
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
 const K={sites,blds,fr,towns,mkBlk,MR:null,mr,shuf};   // attrezzi per static() delle missioni
 // la missione è decisa in startGame (G.want); l'ordine di ripiego serve solo se nemmeno 50 mappe diverse la rendono possibile
 const want=G.want!=null?G.want:G.sel,first=want<0?0:want>0?want:1+(sel*MIS_N|0),order=want<0?[]:[first,...Array.from({length:MIS_N},(_,i)=>i+1).filter(x=>x!=first)];
 let t=0;
 for(const k of order){const D=MIS[k];if(!D)continue;MR=rng(M.seed+7919+k*131);K.MR=MR;if(!D.static||D.static(K)){t=k;break}MD={blk:[],tg:[],z:[],wp:MD.wp}} // se la missione estratta non è realizzabile su questa mappa si prova la successiva
 G.mt=t;navBuild()}

// ===== parte dinamica (host): nemici di missione =====
function missionSpawn(){
 for(const o of BAR)o.barTimer=BAR_T;
 MS={t:G.mt,st:0,al:null,sp:0,wt:2,cz:0,rc:0,hv:null,lx:0,ly:0,hh:0,ex:0,exMsg:'',nk:0,nt:0,vans:[],vips:[],sf:0,ls:0,dp:0,cap:0,cy:0,ct:0,wd:0,vd:0,wst:0,ta:0,tt:0,tw:0,tn:0};   // ta: tempo partito · tt: secondi trascorsi · tw: attesa prossima ondata · tn: sequenza nucleare

 if(!G.mt)return;
 const far=(x,y)=>Math.hypot(x-START[0],y-START[1])>900;
 const put=(k,cx,cy,d0,d1,g)=>{for(let tr=0;tr<120;tr++){const a=Math.random()*TAU,d=rnd(d0,d1+tr*5),x=cx+Math.cos(a)*d,y=cy+Math.sin(a)*d;
   if(far(x,y)&&x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60&&clearAt(x,y,k==UK_TUR||k==UK_ELITE?30:22)){const t=mkUnit(k,x,y,g);t.ms=1;return t}}return null};
 const squad=(cx,cy,n,d0,d1,sleep)=>{const g=GID++;for(let i=0;i<n;i++){const t=put(UK_MECH,cx,cy,d0,d1,g);if(t&&sleep)t.slp=1}};   // sleep = imboscata
 const al=(x,y,hp,dr,rr0,h)=>({id:-1,al:1,z:0,x,y,vx:0,vy:0,hp,mhp:hp,drG:dr,rr:rr0,on:0,h});
 const D=Mi();if(D.spawn)D.spawn({put,squad,al,far})}

function getRandomEnemyType(){const k=enemyType0();return M.hi&&UT[k].fly?(Math.random()<.5?UK_MECH:UK_SWD):k}   // interni: niente volanti
function enemyType0(){
 const r=Math.random();
 if(r<.37)return UK_MECH;    // 37% - Mech standard
 if(r<.45)return UK_APC;     //  8% - APC
 if(r<.55)return UK_SWD;     // 10% - Swordman
 if(r<.65)return UK_KAMI;    // 10% - Kamikaze
 if(r<.75)return UK_JET;     // 10% - Jet volanti
 if(r<.90)return UK_SNIP;    // 15% - Cecchini
 return G.diff>=4?UK_TANK:UK_MECH;   // 10% - Carro pesante (se difficoltà >= 4) o Mech
}

// ===== ONDATE DI UN OBIETTIVO (vale per tutte le missioni, attuali e future) =====
// Ogni nemico di un'ondata riceve con waveUnit il punto che l'ha generata (awx, awy) e raggio (awr): finché non vede nessuno ci marcia sopra (think),
// nasce solo dove a piedi si arriva davvero all'obiettivo (waveSpot) e, se resta incastrato, riappare più vicino (waveUnstick, da aiUpdate).
// Raggiungibilità: una visita in ampiezza della griglia di navigazione a partire dall'obiettivo, fatta UNA volta per obiettivo (poi in cache).
const WREACH={c:-1,n:null,m:null};
function waveReach(tx,ty,rr){const c0=ncell(tx,ty);if(WREACH.c===c0&&WREACH.n===nav)return WREACH.m;
 const N=NW*NH,m=new Uint8Array(N),q=new Int32Array(N),cx=c0%NW,cy=c0/NW|0,R0=Math.max(4,Math.ceil(((rr||0)+120)/NC));let h=0,t=0;
 for(let dy=-R0;dy<=R0;dy++)for(let dx=-R0;dx<=R0;dx++){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=NW||y>=NH)continue;const i=y*NW+x;if(!nav[i]&&!m[i]){m[i]=1;q[t++]=i}}   // partenza: le celle libere attorno all'obiettivo (anche se l'obiettivo è un edificio)
 while(h<t){const c=q[h++],x=c%NW,y=c/NW|0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const X=x+dx,Y=y+dy;if(X<0||Y<0||X>=NW||Y>=NH)continue;const n=Y*NW+X;
   if(m[n]||nav[n]||(dx&&dy&&(nav[y*NW+X]||nav[Y*NW+x])))continue;m[n]=1;q[t++]=n}}   // stesse regole di navPath (niente diagonali fra due celle bloccate)
 WREACH.c=c0;WREACH.n=nav;WREACH.m=m;return m}
const waveCan=(x,y,tx,ty,rr)=>waveReach(tx,ty,rr)[ncell(x,y)]===1;
// il nemico marcia sull'obiettivo (tx, ty, raggio rr) finché non vede qualcuno; con un bersaglio in vista combatte normalmente
function waveUnit(u,tx,ty,rr){u.ms=1;u.aw=1;u.awx=tx;u.awy=ty;u.awr=rr||0;u.st=2;u.lkx=tx;u.lky=ty;u.lkt=LOST_T;u.path=null;u.pt=0;return u}
// punto di nascita per il tipo k fra d0 e d1 px dall'obiettivo (a0 = direzione, null = a caso): libero e raggiungibile a piedi; negli ultimi tentativi basta libero
function waveSpot(k,tx,ty,d0,d1,a0,rr){const fly=k==UK_JET||k==UK_KAMI||!!UT[k].fly,r=k==UK_TANK?40:22;
 for(let tr=0;tr<300;tr++){const f=tr/300,a=a0!=null?a0+rnd(-.5,.5)*(1+f*11):Math.random()*TAU,d=rnd(d0*(1-f*.4),d1*(1+f*.2)),x=tx+Math.cos(a)*d,y=ty+Math.sin(a)*d;
  if(!(x>60&&y>60&&x<WW-60&&y<WH-60&&seaU(x,y)<SEA-100))continue;
  if(fly)return{x,y};
  if(clearAt(x,y,r)&&(tr>=240||waveCan(x,y,tx,ty,rr)))return{x,y}}
 return null}
// nemico d'ondata incastrato da più di 25 s: riappare fra il 45% e il 75% della distanza dall'obiettivo, su un punto libero e raggiungibile
function waveUnstick(u){const tx=u.awx,ty=u.awy,D=Math.hypot(u.x-tx,u.y-ty);if(D<(u.awr||0)+400){u.stk=0;return}   // già sull'obiettivo: niente salti
 const a0=Math.atan2(u.y-ty,u.x-tx),r=u.k==UK_TANK?40:22;
 for(let tr=0;tr<40;tr++){const a=a0+rnd(-.6,.6),d=rnd(Math.max(300,D*.45),Math.max(350,D*.75)),x=tx+Math.cos(a)*d,y=ty+Math.sin(a)*d;
  if(x>60&&y>60&&x<WW-60&&y<WH-60&&seaU(x,y)<SEA-100&&clearAt(x,y,r)&&waveCan(x,y,tx,ty,u.awr)){u.x=x;u.y=y;u.stk=0;u.rp=0;u.bo=null;u.path=null;u.pt=0;fxSpawn(x,y,'#ff9a3a',8,true);return}}
 u.stk=0}   // nessun punto trovato: riprova fra 25 s (niente 40 tentativi a ogni fotogramma)
function kothWave(z){const g=GID++;let c=0;
 for(let i=0;i<KOTH_N;i++){const k=getRandomEnemyType(),s=waveSpot(k,z.x,z.y,KOTH_D[0],KOTH_D[1],null,z.r);if(!s)continue;
  waveUnit(mkUnit(k,s.x,s.y,g),z.x,z.y,z.r);c++}
 if(c)announce('Ondata di nemici in arrivo!')}

// ===== missioni di difesa (campo defend: guardia di sicurezza, difesa della base): attrezzi comuni =====
// guardie e torrette alleate sono unità con sec=1; i nemici attaccano anche l'edificio MD.mb (bersaglio MD.bt)
const secFoes=()=>units.filter(u=>!u.dead&&!u.sec&&u.k<UK_HUM);
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

// trappola del VIP: 4-8 nemici in imboscata (dormienti) in 2 gruppi lungo la strada fra il VIP e il punto di estrazione, mai addosso al VIP né ai giocatori
const TRAP_MIN=700;
function vipTrap(al){
 const n=4+(Math.random()*5|0),dx=EXT[0]-al.x,dy=EXT[1]-al.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,pl=plist();
 const ok=(x,y)=>x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60&&Math.hypot(x-START[0],y-START[1])>900&&Math.hypot(x-al.x,y-al.y)>TRAP_MIN&&!pl.some(q=>Math.hypot(q.x-x,q.y-y)<TRAP_MIN);
 const cl=[0,1].map(i=>{for(let tr=0;tr<200;tr++){const t=rnd(i?.5:.2,i?.85:.5)*L,s=rnd(-260,260),x=al.x+ux*t-uy*s,y=al.y+uy*t+ux*s;if(ok(x,y)&&clearAt(x,y,30))return{x,y,g:GID++}}return null}).filter(Boolean);
 for(let c=0,tr=0;c<n&&cl.length&&tr<400;tr++){const q=cl[c%cl.length],a=Math.random()*TAU,d=rnd(30,110),x=q.x+Math.cos(a)*d,y=q.y+Math.sin(a)*d;
  if(!ok(x,y)||!clearAt(x,y,30))continue;
  const r=Math.random(),u=mkUnit(r<.7?UK_MECH:r<.88?UK_SNIP:UK_TANK,x,y,q.g);u.ms=1;u.slp=1;c++}}

// ===== ogni fotogramma (host): caserme, estrazione, regole della missione =====
function missionTick(dt){
 if(G.over)return;
 const m=MS,pl=plist(),D=Mi();
 for(const o of BAR){if(o.dead||D.defend)continue;o.barTimer-=dt;if(o.barTimer>0)continue;o.barTimer=BAR_T; // caserme: nuovi nemici a tempo, fino al numero iniziale
 const room=Math.min(BAR_SPAWN,G.cap-units.reduce((n,t)=>n+(t.ms?0:1),0));if(room<=0)continue;const g=GID++;
 for(let i=0,tr=0;i<room&&tr<80;tr++){const a=Math.random()*TAU,d=o.r+rnd(50,110),x=o.x+Math.cos(a)*d,y=o.y+Math.sin(a)*d,k=getRandomEnemyType();
  if(x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60&&((k==UK_JET||k==UK_KAMI)||clearAt(x,y,k==UK_TANK?40:22))){mkUnit(k,x,y,g);i++;fxSpawn(x,y,'#ff9a3a',10,true)}}}
 if(m.ex){extractTick(dt);if(!D.tickAfterExt)return}   // obiettivo già compiuto: ora conta solo l'estrazione (tickAfterExt: la missione continua a girare, es. i VIP della 10 seguono i giocatori)

 if(D.tick)D.tick(dt,pl)}

// ===== rete: stato della missione per i client (solo numeri) =====
// [0 stato, 1 zona in corso, 2 suo avanzamento, 3 estrazione] + i numeri della missione (pack / unpack, da indice 4)
function msPack(){const m=MS,z=MD.z&&MD.z[m.cz],D=Mi();
 return[m.st,m.cz|0,z?Math.round(z.p*100)/100:0,m.ex|0].concat(D.pack?D.pack():[])}
function msUnpack(a){const m=MS,D=Mi();m.st=a[0];
 m.cz=a[1];if(MD.z)MD.z.forEach((z,i)=>z.p=i<m.cz?1:i==m.cz?a[2]:0);
 if(D.unpack)D.unpack(a,4);
 m.ex=a[3]|0;if(m.ex==2)extractBegin()}   // chi entra a estrazione in corso parte dal punto giusto
// la parte non-host ricrea gli alleati della missione (stessa struttura, posizione dallo snapshot)
function missionClientInit(){MS={t:G.mt,st:0,al:null,sp:0,wt:0,cz:0,rc:0,hv:null,lx:0,ly:0,hh:0,ex:0,nk:0,nt:0,vans:[],vips:[],sf:0,ls:0,dp:0,cap:0,ct:0,wst:0,ta:0,tt:0,tw:0,tn:0};
 const al=(x,y,hp,rr0)=>({id:-1,al:1,z:0,x,y,tx:x,ty:y,vx:0,vy:0,hp,mhp:hp,rr:rr0,on:0,h:0,s:0,go:0,hold:0,st:0});
 const D=Mi();if(D.clientInit)D.clientInit(al)}

// ===== HUD: testo e barra della missione, triangoli che indicano dove andare =====
function missionInfo(){const m=MS,D=Mi();
 if(m.ex){const d=Math.hypot(P.x-EXT[0],P.y-EXT[1]);if(m.ex==2)return{t:misExt().run,f:1,c:'#5ee0c0'};
  const r=D.extInfo&&D.extInfo();if(r)return r;
  return{t:misExt().all,f:clamp(1-(d-extR())/3500,0,1),c:'#5ee0c0'}}
 return D.info?D.info():{t:'Distruggi tutti i nemici e le caserme',f:-1}}
function missionMarks(){const m=MS,o=[];
 if(m.ex){if(m.ex==1)o.push({x:EXT[0],y:EXT[1],c:'#5ee0c0'});return o}
 const D=Mi();if(D.marks)D.marks(o);else barMarks(o);
 return o}


// ====================================================================================================
//                                               MISSIONI                                              
// ====================================================================================================


// ####################################################################################################
// ##### MISSIONE 0 · STERMINIO
// ##### Sterminio (classica): distruggi tutte le caserme e tutti i nemici. Si sceglie solo esplicitamente (mai a caso).
// ####################################################################################################
misDef(0,{
 name:'Sterminio',
 story:"Le caserme nemiche rimpiazzano le perdite subite ad un ritmo per noi insostenibile... sembrano beffarsi dei nostri sforzi, e noi non facciamo progressi. Il comando ha ordinato lo sterminio totale: distruggi ogni caserma e annienta tutte le forze ostili in un colpo solo. Eliminarli ci fa comodo, ma il punto è mandare un chiaro messaggio: dateci più nemici che noi ci divertiamo a sterminarli!",
 camp:{b:'Il nemico presidia il settore con forze notevoli, rifornite costantemente dalle sue caserme, e si crede al sicuro. Stermina ogni nemico e caserma come atto dimostrativo, fagli capire che non importa quanti soldati schiera, noi possiamo spazzarli via tutti, per altro divertendoci nel farlo!',
  bv:[['cmd','Senza {cmd} l’esercito nemico è nel panico, ma presidia ancora il settore con forze notevoli e per ora si crede al sicuro. Stermina ogni nemico e caserma come atto dimostrativo: fagli capire che se il loro capo non ha avuto scampo, figuriamoci loro!'],
   ['sab','Con le difese del settore a pezzi il nemico è più vulnerabile, ma presidia ancora l’area con forze notevoli. Stermina ogni nemico e caserma come atto dimostrativo, fagli capire che non importa quanti soldati schiera, noi possiamo spazzarli via tutti, per altro divertendoci nel farlo!'],
   ['fwd','Dalla nostra base avanzata il settore è sotto controllo, ma il nemico presidia ancora l’area con forze notevoli pensa di poter resistere. Stermina ogni nemico e caserma come atto dimostrativo, fagli capire che non importa quanti soldati schiera, noi possiamo spazzarli via tutti, per altro divertendoci nel farlo!']],
  bf:'Il nemico ha ritirato ogni forza rimasta nel settore: è la sua ultima resistenza, non ha più riserve né rinforzi. Stermina ogni nemico e distruggi le caserme: quando l’ultimo soldato nemico cade, la guerra è vinta... nessuno potrà più opporsi.',
  bfv:[['cmd','Senza {cmd} il comando nemico è allo sbando, ma i suoi ultimi soldati si sono asserragliati nel settore in un’ultima resistenza disperata. Stermina ogni nemico e distruggi le caserme: quando l’ultimo soldato cade, la guerra è vinta. Nessun altro oserà pù opporsi.'],
   ['sab','Le difese nemiche sono a pezzi e i suoi ultimi soldati si sono asserragliati nel settore in un’ultima resistenza disperata, senza riserve né rinforzi. Stermina ogni nemico e distruggi le caserme: quando l’ultimo soldato cade, la guerra è vinta. Il nostro controllo sulla regione sarà totale.'],
   ['ally','Gli alleati hanno circondato ed isolato il nemico: i suoi ultimi soldati si sono asserragliati nel settore in un’ultima resistenza disperata, senza riserve né rinforzi. Stermina ogni nemico e distruggi le caserme: quando l’ultimo soldato cade, la guerra è vinta. Nessuno oserà mai più opporsi a questa alleanza.']],
  w:'Il settore è stato pacificato...e abbiamo mandato un chiaro messaggio al nemico: ci siamo divertiti nel farlo!',l:'Forse avevamo sottovalutato la forza del nemico. Questo fallimento ci sia di lezione.',sw:[],sl:[],
  fw:'Non resta un solo soldato nemico nel settore: l’ultima resistenza è stata spezzata e le caserme sono macerie. Il nemico non ha più un esercito, la guerra è vinta. Opporsi a noi significa tramutarsi in cenere.',fl:'L’ultima resistenza nemica ha tenuto: i suoi soldati hanno respinto i nostri attacchi e ora hanno le forze per riprendersi la regione. Non ci sono più uomini né mezzi, la nostra eliminazione è la giusta conseguenza per questa sconfitta.'},
 unlock:['pierce'],
 dir:{dev:({has,lf})=>has('sab')||has('cmd')?3:lf?1:2,fin:({has})=>1+(has('cmd')?2:0)+(has('sab')?2:0)},
 tick(dt,pl){if(!units.some(u=>u.k<UK_HUM&&!u.nav&&!u.sec)&&BAR.every(o=>o.dead))objDone('Nemici e caserme distrutti.')},   // !sec: torrette, wingman e droni dei giocatori non contano
 info:()=>({t:'Distruggi tutti i nemici e le caserme',f:-1})
});


// ####################################################################################################
// ##### MISSIONE 1 · SCORTA CONVOGLIO
// ##### Scorta convoglio: il convoglio parte quando un giocatore lo raggiunge e va su strada fino alla città di arrivo; barricate (MD.blk) da distruggere.
// ####################################################################################################
// percorso del convoglio (MD.pts, MD.cl lunghezze cumulate, MD.sg larghezza delle strade per tratto)
function plen(p){let L=0;for(let i=1;i<p.length;i++)L+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);return L}
function pathAt(s){const p=MD.pts,c=MD.cl;s=clamp(s,0,MD.len);let i=1;while(i<c.length-1&&c[i]<s)i++;const a=p[i-1],b=p[i],u=clamp((s-c[i-1])/((c[i]-c[i-1])||1),0,1);return{x:a[0]+(b[0]-a[0])*u,y:a[1]+(b[1]-a[1])*u,h:Math.atan2(b[1]-a[1],b[0]-a[0])}}
function wAt(s){const c=MD.cl;let i=1;while(i<c.length-1&&c[i]<s)i++;for(const g of MD.sg)if(i>=g.i0&&i<=g.i1)return g.w;return MD.sg[MD.sg.length-1].w}
misDef(1,{
 name:'Scorta convoglio',
 story:"Un convoglio di rifornimenti deve attraversare il territorio ostile via terra per raggiungere la base avanzata. L'antiaerea nemica domina il cielo, ma anche le strade sono pattugliate dal nemico. Scorta il convoglio fino alla meta e difendilo dagli agguati, il nostro avamposto non può resistere senza munizioni e donne da compagnia!",
 camp:{b:'Un convoglio di rifornimenti deve attraversare territorio nemico per raggiungere un avamposto, ma bisogna passare via terra per evitare la possente difesa anti-aerea nemica. Aprigli la strada e scortalo fino a destinazione.',
  bv:[['hard','Le difese nemiche del settore sono state rinforzate: il convoglio dovrà aprirsi la strada tra imboscate e blocchi stradali ancora più letali.'],
   ['fleet','La flotta nemica controlla ancora il mare e ogni rifornimento via nave finisce sul fondo: resta solo la strada, sotto l’antiaerea e tra le pattuglie nemiche. Aprigli la strada e scortalo fino a destinazione.']],
  w:'Il convoglio è arrivato al nostro avamposto: ora l’avamposto ha armi sufficienti per difendere l’area e lanciare missioni offensive.',l:'Il convoglio è stato distrutto: le scorte dell’avamposto sono ridotte al minimo, riusciranno a malapena a difendersi ma non per molto, e di certo non ad aiutarci.',sw:['sup'],sl:['noSup']},
 unlock:['grlm'],
 dir:{open:3,dev:({has})=>has('noSup')?4:1},
 th:[0,1,5,6,7,8],                      // servono strade lunghe fra città: niente interni
 need:()=>['g','g'],
 static(K){const{sites,shuf,mkBlk}=K;const E=M.links.filter(r=>r.lk&&sites.includes(r.lk[0])&&sites.includes(r.lk[1])&&r.lk[0].k!='c'&&r.lk[1].k!='c'),cands=[];
   const walk=(T,node,segs,L,used)=>{for(const e of E){const fw=e.lk[0]===node,bw=e.lk[1]===node;if(!fw&&!bw||segs.some(s=>s.e===e))continue;const nx=fw?e.lk[1]:e.lk[0],nl=L+plen(e.pts);if(nl>4500||used.has(nx))continue;
     const sg=segs.concat([{e,rev:!fw}]);if(isTown(nx)){const q=fw?e.pts[e.pts.length-1]:e.pts[0];if(nl>=1200&&dSt({x:q[0],y:q[1]})>OBJ_MIN)cands.push({sg,L:nl})}else if(sg.length<4){used.add(nx);walk(T,nx,sg,nl,used);used.delete(nx)}}};
   for(const T of sites)if(isTown(T)&&dSt(T)>1500)walk(T,T,[],0,new Set([T]));
   if(!cands.length)return false;const c=shuf(cands)[0],pts=[],sg=[];
   for(const s of c.sg){const q=s.e.pts.map(a=>a.slice());if(s.rev)q.reverse();const i0=pts.length;for(const a of q){if(pts.length&&Math.hypot(a[0]-pts[pts.length-1][0],a[1]-pts[pts.length-1][1])<2)continue;pts.push(a)}sg.push({i0,i1:pts.length-1,w:s.e.w})}
   if(dSt({x:pts[0][0],y:pts[0][1]})<1500||dSt({x:pts[pts.length-1][0],y:pts[pts.length-1][1]})<=OBJ_MIN)return false;
   MD.pts=pts;MD.sg=sg;MD.cl=[0];for(let i=1;i<pts.length;i++)MD.cl.push(MD.cl[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));MD.len=MD.cl[pts.length-1];
   for(const f of[.3,.55,.78]){const q=pathAt(MD.len*f),b=mkBlk(q.x,q.y,q.h,26,wAt(MD.len*f)+50,400);b.ps=MD.len*f;MD.blk.push(b)}
   return true},
 spawn(S){const{put,squad,al}=S;
 {const L=MD.len,q0=pathAt(0);MS.al=al(q0.x,q0.y,CONV_HP,2,30,q0.h);MS.al.s=0;MS.al.go=0;MS.al.hold=0;
  for(const f of[.2,.45,.7,.9]){const q=pathAt(L*f),w=wAt(L*f),sd=Math.random()<.5?-1:1;squad(q.x+Math.cos(q.h+1.5708)*sd*(w/2+150),q.y+Math.sin(q.h+1.5708)*sd*(w/2+150),2,0,90,true)}
  for(const f of[.15,.4,.62,.82]){const q=pathAt(L*f),w=wAt(L*f),sd=Math.random()<.5?-1:1;put(UK_TUR,q.x+Math.cos(q.h+1.5708)*sd*(w/2+260),q.y+Math.sin(q.h+1.5708)*sd*(w/2+260),0,60,-1)}}},
 tick(dt,pl){const m=MS,al=m.al;
 {
  if(!al.go){if(pl.some(q=>Math.hypot(q.x-al.x,q.y-al.y)<250)){al.go=1;al.on=1;announce('Il convoglio è in marcia: proteggilo!')}}
  else{const blocked=MD.blk.some(o=>!o.dead&&o.ps-al.s<110&&o.ps-al.s>-30),foes=units.some(t=>!t.slp&&Math.hypot(t.x-al.x,t.y-al.y)<330),lonely=!pl.some(q=>Math.hypot(q.x-al.x,q.y-al.y)<1300);
   al.hold=blocked?1:foes?2:lonely?3:0;if(!al.hold)al.s=Math.min(MD.len,al.s+CONV_V*dt);
   const q=pathAt(al.s);al.x=q.x;al.y=q.y;al.h=q.h;al.vx=al.hold?0:Math.cos(q.h)*CONV_V;al.vy=al.hold?0:Math.sin(q.h)*CONV_V;
   if(al.hp<=0){al.on=0;finish(1,'Convoglio distrutto: missione fallita')}else if(al.s>=MD.len-2)objDone('Il convoglio è arrivato a destinazione!')}}},
 info(){const al=MS.al;if(!al)return{t:'',f:-1};
  return{t:al.go?['Scorta il convoglio fino alla meta','Il convoglio è bloccato: distruggi la barricata','Il convoglio è sotto attacco: elimina i nemici','Il convoglio ti aspetta: restagli vicino'][al.hold|0]:'Raggiungi il convoglio per farlo partire',f:al.go?al.s/MD.len:0,c:'#4aa3ff',h:al.hp/al.mhp};},
 marks(o){const al=MS.al;if(al)o.push({x:al.x,y:al.y,c:'#4aa3ff'});else barMarks(o)},
 pack(){const a=MS.al;return a?[Math.round(a.x),Math.round(a.y),Math.max(0,Math.ceil(a.hp)),Math.round(a.s),a.hold|0,a.go?1:0,Math.round((a.h||0)*100)/100]:[0,0,0,0,0,0,0]},
 unpack(a,i){const al=MS.al;if(al){al.tx=a[i];al.ty=a[i+1];al.hp=a[i+2];al.s=a[i+3];al.hold=a[i+4];al.go=a[i+5];al.on=a[i+5];al.h=a[i+6]}},
 clientInit(al){const q=pathAt(0);MS.al=al(q.x,q.y,CONV_HP,30)},
 engine:()=>MS.al&&MS.al.hp>0?MS.al:null,   // motore del convoglio (aiMoveSnd in AGveh.js)
 drawUnder(){
 if(MD.pts){ctx.save();ctx.strokeStyle='rgba(74,163,255,.5)';ctx.lineWidth=6;ctx.setLineDash([26,22]);ctx.beginPath();MD.pts.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.stroke();ctx.restore()}},   // percorso tratteggiato
 drawWorld(){if(MS.al&&!dsHides('vip'))drawAlly(MS.al,'conv')}
});


// ####################################################################################################
// ##### MISSIONE 2 · ESTRAZIONE VIP
// ##### Estrazione VIP: raggiungi l’edificio del VIP (MD.vb), restaci vicino finché si unisce a te e scortalo fino all’estrazione.
// ####################################################################################################
misDef(2,{
 name:'Estrazione VIP',
 story:"Un prezioso informatore è rimasto intrappolato in un edificio sorvegliato. Raggiungilo, convincilo a seguirti (con le buone questa volta!) e scortalo fino al punto di estrazione. Le informazioni che ha memorizzato valgono ben più della sua vita, ma se non è vivo non può riferircele, quindi questa volta non riportare solo i pezzi!",
 camp:{b:'{Vip}, uno scienziato chiave della resistenza, ha sottratto al nemico una preziosa nuova tecnologia oltre ad informazioni vitali, ma ora è bloccato in un edificio nemico. Recuperalo e scortalo all’estrazione. Questa volta... vivo magari.',
  bv:[['noSup','Senza rifornimenti la resistenza locale è allo stremo e {vip} è l’ultima speranza di recuperare nuove risorse ed un vantaggio tecnologico per non essere spazzati via. Recuperalo e portalo al sicuro.']],
  w:'{Vip} è in salvo e ha consegnato i piani del nemico ed una preziosa nuova tecnologia.',l:'{Vip} è nelle mani del nemico: la resistenza è cieca senza informazioni vitali.',sw:['vip'],sl:['noVip']},
 unlock:['shield'],vipBonus:1,
 dir:{open:2,dev:({lf})=>lf?2:1},
 extShow:1,
 static(K){const{fr,shuf}=K;const c=shuf(fr.filter(o=>(o.tw||o.is)&&dSt(o)>OBJ_MIN));if(!c.length)return false;const o=c[0];o.vipB=1;o.pal=PAL_VIP;o.hp=o.m=100000;MD.vb=o;MD.d0=Math.hypot(o.x-EXT[0],o.y-EXT[1]);return true},
 spawn(S){const{put,squad,al}=S;
 {const b=MD.vb;MS.al=al(b.x,b.y,VIP_HP,0,16,0);MS.al.st=0;
  for(let i=0;i<2;i++)put(UK_TUR,b.x,b.y,b.r+110,b.r+230,-1);squad(b.x,b.y,3,b.r+90,b.r+220,false)}},
 tick(dt,pl){const m=MS,al=m.al;
 {const b=MD.vb;
  if(!al.st){const gr=pl.filter(q=>!q.z&&Math.hypot(q.x-b.x,q.y-b.y)<b.r+90);m.rc=clamp(m.rc+(gr.length?dt:-dt*.5),0,VIP_T);
   if(m.rc>=VIP_T){const a=Math.atan2(START[1]-b.y,START[0]-b.x);let x=b.x+Math.cos(a)*(b.r+40),y=b.y+Math.sin(a)*(b.r+40);
    for(let k=1;k<14&&!clearAt(x,y,14);k++){const aa=a+k*.55;x=b.x+Math.cos(aa)*(b.r+40+k*6);y=b.y+Math.sin(aa)*(b.r+40+k*6)}
    al.x=x;al.y=y;al.st=1;al.on=1;announce('VIP recuperato! Scortalo fino al punto di estrazione');vipTrap(al)}}
  else{const gr=pl.filter(q=>!q.z);al.vx=al.vy=0;
   if(gr.length&&!(al.inV>=0)){const T=gr.reduce((a,c)=>Math.hypot(a.x-al.x,a.y-al.y)<Math.hypot(c.x-al.x,c.y-al.y)?a:c),dx=T.x-al.x,dy=T.y-al.y,d=Math.hypot(dx,dy)||1;
    if(d>110)vipMove(al,T.x,T.y,T,dt);else al.stk=0}   // a bordo di un mezzo (al.inV) la posizione la dà il mezzo (vehVipTick)
   if(al.hp<=0){al.on=0;finish(1,'Il VIP è stato ucciso: missione fallita')}else if(Math.hypot(al.x-EXT[0],al.y-EXT[1])<EXT_R)objDone('VIP in salvo!')}}},
 info(){const m=MS,al=m.al;if(!al)return{t:'',f:-1};
  return al.st?{t:'Scorta il VIP fino al punto di estrazione (base di partenza)',f:1-clamp(Math.hypot(al.x-EXT[0],al.y-EXT[1])/MD.d0,0,1),c:'#5ee0c0',h:al.hp/al.mhp}:{t:'Raggiungi a piedi l’edificio segnalato e restaci vicino',f:m.rc/VIP_T,c:'#5ee0c0'};},
 marks(o){const al=MS.al;if(al)o.push(al.st?{x:EXT[0],y:EXT[1],c:'#5ee0c0'}:{x:MD.vb.x,y:MD.vb.y,c:'#5ee0c0'});else barMarks(o)},
 pack(){const m=MS,a=m.al;return a?[Math.round(a.x),Math.round(a.y),Math.max(0,Math.ceil(a.hp)),a.st|0,a.hold|0,Math.round(m.rc*10)/10,Math.round((a.h||0)*100)/100,a.inV>=0?a.inV:-1]:[0,0,0,0,0,0,0,-1]},   // inV: VIP a bordo di un mezzo (-1 = a piedi)
 unpack(a,i){const m=MS,al=m.al;if(al){al.tx=a[i];al.ty=a[i+1];al.hp=a[i+2];al.st=a[i+3];al.on=a[i+3];al.hold=a[i+4];m.rc=a[i+5];al.h=a[i+6];al.inV=a[i+7]!=null?a[i+7]|0:-1}},
 clientInit(al){MS.al=al(MD.vb.x,MD.vb.y,VIP_HP,16)},
 vipList(out){if(MS.al)out.push(MS.al)},vipActive:w=>!!w.st,   // il VIP sale sui veicoli dei giocatori dopo essere stato recuperato
 extVips(list){if(MS.al&&MS.al.st&&MS.al.hp>0)list.push({id:'vip',x:MS.al.x,y:MS.al.y,ci:2})},   // il VIP sale PER PRIMO sulla dropship
 drawWorld(){if(MS.al&&MS.al.st&&!dsHides('vip')&&!(MS.al.inV>=0))drawAlly(MS.al,'vip')}
});


// ####################################################################################################
// ##### MISSIONE 3 · SABOTAGGIO
// ##### Sabotaggio: distruggi centrale elettrica, radar e serbatoio (MD.tg). La centrale distrutta spegne le torrette vicine.
// ####################################################################################################
misDef(3,{
 name:'Sabotaggio',
 story:"Tre strutture alimentano la macchina da guerra nemica: una centrale elettrica, un radar e un serbatoio di carburante. Distruggile tutte per paralizzare le operazioni nel settore. Spoiler: la centrale alimenta le torrette difensive nei dintorni ed anche le ricariche degli smartphone nemici! Ci rimarranno malissimo!",
 camp:{b:'Alcune strutture chiave sono essenziali per le difese nemiche. Senza queste strutture le difese nemiche perderanno molta della loro efficacia e coordinazione. Distruggile tutte.',
  bv:[['sup','Con i rifornimenti arrivati all’avamposto ora puoi colpire più a fondo: distruggi le strutture chiave che alimentano le difese nemiche.'],['vip','{Vip} ha individuato i punti deboli della difesa nemica: distruggi le strutture chiave che alimentano le difese nemiche e la loro efficacia crollerà drasticamente.']],
  w:'Le difese nemiche del settore sono a pezzi: il nemico ora è più vulnerabile.',l:'Il sabotaggio è fallito: il nemico ora ha rinforzato e decentralizzato i punti deboli che alimentano le sue difese, sarà più difficile indebolire le difese nemiche.',sw:['sab'],sl:['hard']},
 unlock:['w'+W_GRN],
 dir:{open:2,dev:({has})=>has('sup')?3:2},
 need:()=>['g'],
 static(K){const{fr,shuf}=K;const pool=shuf(fr.filter(o=>o.tw&&dSt(o)>OBJ_MIN&&o.w>=150&&o.h>=150)),pick=[];
   for(const o of pool){if(pick.length>=3)break;if(pick.every(p=>Math.hypot(o.x-p.x,o.y-p.y)>900))pick.push(o)}
   if(pick.length<3)return false;const kinds=['plant','radar','tank'];pick.forEach((o,i)=>{o.tg=kinds[i];o.pal=PAL_PLANT+i;o.hp=o.m=Math.round(o.hp*1.5)});MD.tg=pick;return true},
 spawn(S){const{put,squad}=S;
 {for(const o of MD.tg){put(UK_TUR,o.x,o.y,o.r+110,o.r+230,-1);squad(o.x,o.y,2,o.r+90,o.r+220,false)}}},
 tick(dt,pl){
 {
  for(const o of MD.tg)if(o.dead&&o.tg=='plant'&&!o.fx){o.fx=1;for(const t of units)if(t.k==UK_TUR&&Math.hypot(t.x-o.x,t.y-o.y)<PLANT_R)t.dis=PLANT_T;announce('Centrale distrutta: le torrette vicine sono spente')}
  if(MD.tg.every(o=>o.dead))objDone('Sabotaggio riuscito!')}},
 info(){const n=MD.tg.filter(o=>o.dead).length,nm={plant:'centrale',radar:'radar',tank:'serbatoio'};return{t:'Strutture distrutte '+n+'/'+MD.tg.length+' · restano: '+(MD.tg.filter(o=>!o.dead).map(o=>nm[o.tg]).join(', ')||'-'),f:n/MD.tg.length,c:'#ffb02e'}},
 marks(o){for(const t of MD.tg)if(!t.dead)o.push({x:t.x,y:t.y,c:'#ffb02e'})}
});


// ####################################################################################################
// ##### MISSIONE 4 · CACCIA AL VIP
// ##### Caccia al VIP: trova ed elimina il bersaglio d’élite (k = UK_ELITE) che si sposta fra le città.
// ####################################################################################################
misDef(4,{
 name:'Caccia al VIP',
 story:"Un comandante d'élite nemico sta seminando caos e distruzione nelle nostre difese. Corazzato, armato pesantemente, scortato. Le ultime informazioni lo collocano nella zona indicata. Trovalo, affrontalo e neutralizzalo: fagli vedere chi è il più grosso e cattivo nella valle!",
 camp:{b:'{Cmd} si muove tra le città del settore, seminando distruzione e gravi perdite tra le nostre difese. Pare che abbia una nuova tecnologia ed armi efficacissime. Sta seminando il terrore tra le nostre difese, ma la sua leggenda finisce qua. Trovalo ed eliminalo, in modo spettacolare se possibile.',
  bv:[['vip','{Vip} ha scoperto dove si trova {cmd}: è il momento di prendere l’iniziativa e colpirlo quando non se lo aspetta. Questa volta invece di subire i suoi attacchi saremo noi ad attaccarlo.'],['pilots','I superstiti hanno visto dove si trova il terrore delle nostre difese: {cmd}: è il momento di colpirlo mentre non se lo aspetta invece di subire sempre la sua offensiva.']],
  w:'{Cmd} è caduto: l’esercito nemico è nel panico per la brutale eliminazione della sua leggenda. Ora sono facili prede dei nostri attacchi.',l:'{Cmd} è sfuggito al tentativo di assassinio, mantenendo l’aura leggendaria che lo avvolge, e ora è più cauto e più pericoloso, ed i suoi soldati ancora più motivati.',sw:['cmd'],sl:['cmdLive']},
 unlock:['plasma'],
 dir:{dev:({has})=>has('vip')||has('pilots')?4:1},
 need:()=>['g','g'],
 static:()=>MD.wp.length>=2,          // il bersaglio d'élite gira fra le città (MD.wp)
 spawn(S){const{put,squad}=S;
 {let h=null;const w0=Math.random()*MD.wp.length|0;
  for(let k=0;k<MD.wp.length&&!h;k++){const w=MD.wp[(w0+k)%MD.wp.length];if(Math.hypot(w[0]-START[0],w[1]-START[1])>OBJ_MIN+260)h=put(UK_ELITE,w[0],w[1],0,260,GID++)}
  for(let tr=0;tr<800&&!h;tr++){const[x,y]=landXY(Math.random,500,300,300);if(dSt({x,y})>OBJ_MIN&&clearAt(x,y,30)){h=mkUnit(UK_ELITE,x,y,GID++);h.ms=1}}
  if(h){h.wi=(w0+1)%MD.wp.length;MS.hv=h;MS.lx=h.x;MS.ly=h.y;MS.hh=h.hp;squad(h.x,h.y,2,90,170,false)}}},
 tick(dt,pl){const m=MS;
 {const h=m.hv;m.sp=Math.max(0,m.sp-dt);
  if(h){if(pl.some(q=>Math.hypot(q.x-h.x,q.y-h.y)<(q.z?SPOT_AIR:Math.max(WEAPONS[q.w].range,WEAPONS[W_MG].range)*1.1))){m.sp=6;m.lx=h.x;m.ly=h.y}
   m.hh=h.hp;if(h.hp<=0)objDone('Bersaglio d’élite eliminato!')}}},
 info(){const m=MS;
  return m.sp>0?{t:'Bersaglio d’élite avvistato: neutralizzalo!',f:m.hh/UT[UK_ELITE].hp,c:'#ff4a4a'}:{t:'Individua il bersaglio d’élite · ultimo avvistamento: '+regione(m.lx,m.ly),f:-1};},
 marks(){},   // niente marker: il bersaglio d'élite non è segnalato da un triangolo rosso (sarebbe sempre visibile anche nella nebbia)
 pack(){const m=MS;return[m.sp>0?1:0,Math.round(m.lx),Math.round(m.ly),Math.max(0,Math.ceil(m.hh))]},   // avvistato · ultimo avvistamento · vita del bersaglio
 unpack(a,i){const m=MS;m.sp=a[i];m.lx=a[i+1];m.ly=a[i+2];m.hh=a[i+3]}
});


// ####################################################################################################
// ##### MISSIONE 5 · CONQUISTA AVAMPOSTO
// ##### Conquista avamposto: occupa con il Grunt due zone (MD.z) una dopo l’altra, resistendo alle ondate.
// ####################################################################################################
misDef(5,{
 name:'Conquista avamposto',
 story:"Due avamposti strategici controllano facilmente il settore e il comando li vuole entrambi. Occupa le zone designate con il Grunt, respingi i contrattacchi nemici e mantieni il controllo fino al completamento della conquista. Come dice sempre il comandante: quel che è tuo... è mio, quel che è mio... è mio!",
 camp:{b:'Ci servono avamposti per organizzare le nostre difese nella zona e far partire attacchi verso il nemico. Al tempo stesso dobbiamo indebolire il nemico: occupa gli avamposti nemici e difendili dal contrattacco nemico finché non sono in sicurezza.',
  bv:[['sab','Le difese indebolite del nemico ti permettono di occupare facilmente gli avamposti nemici: conquistali e difendili dai contrattacchi finchè non sono in sicurezza.']],
  w:'Gli avamposti nemici ora sono nostri: la resistenza locale ora ha una base avanzata da cui può far partire attacchi verso il nemico.',l:'L’assalto agli avamposti nemici è stato respinto: non siamo riusciti ad insediarci nella zona ed il nemico è libero di contrattaccare con ancora maggior forza.',sw:['fwd'],sl:['noFwd']},
 unlock:['turret'],
 dir:{open:3,dev:1},
 need:()=>['g','g'],
 // radure tenute libere dalla mappa per le zone: esterni (missionKeep in AGmap.js) · interni (AGmapXin.js)
 keep:{n:2,ds:1,cl:KOTH_R*.6+30,d0:0,rd:380,wet:KOTH_R+50,road:0},keepIn:{n:2,r:190},
 zones:1,
 static(K){const{towns,shuf,MR,mr}=K;for(const s of shuf(towns)){if(MD.z.length>=2)break;if(MD.z.some(z=>Math.hypot(z.x-s.x,z.y-s.y)<1200))continue;
    const kp=(M.keep||[]).find(k=>k.s===s.id);for(let tr=0;tr<200;tr++){const a=MR()*TAU,d=tr<40?0:mr(0,380),x=kp&&!tr?kp.x:s.x+Math.cos(a)*d,y=kp&&!tr?kp.y:s.y+Math.sin(a)*d;
     if(dSt({x,y})>OBJ_MIN&&!inWater(x,y,KOTH_R+40)&&M.obs.every(o=>Math.hypot(x-o.x,y-o.y)>o.r+KOTH_R*.6)&&!M.bridges.some(b=>Math.hypot(x-b.x,y-b.y)<b.L/2+KOTH_R)){MD.z.push({x,y,r:KOTH_R,p:0});break}}}
   return MD.z.length>=2},
 tick(dt,pl){zonesTick(dt,pl,()=>objDone('Avamposti conquistati!'),'Avamposto conquistato! Raggiungi il prossimo')},
 info:()=>zonesInfo(i=>'l’avamposto '+(i+1)+'/'+MD.z.length),
 marks:zonesMarks
});


// ####################################################################################################
// ##### MISSIONE 6 · SABOTAGGIO NUCLEARE
// ##### Sabotaggio nucleare: conquista il sito nucleare, poi raggiungi l’estrazione prima della detonazione (onda d’urto su tutta la mappa).
// ####################################################################################################
// ===== esplosione nucleare =====
// NK è un'animazione LOCALE: in rete passano solo MS.nk (0 niente, 1 conto alla rovescia, 2 esplosa) e MS.nt (secondi) — vedi pack
const NK={on:0,t:0,x:0,y:0,wiped:0,s2:0};
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

// ===== esplosione nucleare: lampo bianco crescente → bianco pieno → velo di polvere grigio/marrone all'80% =====
function drawNuke(){if(!NK.on)return;const t=NK.t,c=ctx;c.save();
 const sx=(NK.x-camX)*zoom,sy=(NK.y-camY)*zoom,Rs=NK.v*Math.min(t,NK.T)*zoom;
 // interno dell'onda: grigio quasi opaco (costo: 1 path + 1 fill a frame)
 if(Rs>2){c.beginPath();c.arc(sx,sy,Rs,0,TAU);c.fillStyle='rgba(70,70,70,.95)';c.fill()}
 if(t<NK.T){const B=NK_SW_B*zoom,
   g=c.createRadialGradient(sx,sy,Math.max(0,Rs-B),sx,sy,Math.max(1,Rs+B*.15));   // dentro il fronte: terra bruciata · fronte: arancione → giallo · fuori: niente
  g.addColorStop(0,'rgba(140,72,30,.35)');g.addColorStop(.55,'rgba(230,110,25,.75)');g.addColorStop(.85,'rgba(255,200,90,.95)');g.addColorStop(1,'rgba(255,180,80,0)');
  c.fillStyle=g;c.fillRect(0,0,W,H)}
 else{const f=clamp((t-NK.T)/NK_FADE,0,1),e=f*f*(3-2*f),   // dopo l'onda: terra bruciata → velo di polvere (122,111,98) all'80%
  r=Math.round(140+(122-140)*e),gg=Math.round(72+(111-72)*e),b=Math.round(30+(98-30)*e),a=.55+(.8-.55)*e;
  c.fillStyle='rgba('+r+','+gg+','+b+','+a+')';c.fillRect(0,0,W,H)}
 if(t<NK_FLASH){const k=1-t/NK_FLASH;c.fillStyle='rgba(255,255,255,'+(.99*k)+')';c.fillRect(0,0,W,H)}   // lampo lontano della detonazione: si spegne in NK_FLASH s
 c.restore()}
misDef(6,{
 name:'Sabotaggio nucleare',
 story:"Bombardando dall'orbita non riusciamo a penetrare le difese nemiche, ma il nemico in zona ha un sito nucleare attivo... hehehe... Il comando ne ordina la distruzione, sarà più devastante di un bombardamento! Conquista la zona, piazza l'ordigno e allontanati. Hai 30 secondi prima della detonazione. Chi resta indietro non torna... o torna come cenere se il vento tira in questa direzione.",
 camp:{b:'Sappiamo che il nemico utilizza dispositivi nucleari, e ora sappiamo dove si trovano. Anche se la loro difesa anti-aerea blocca ogni nostro bombardamento, praticamente hanno una bomba nucleare già pronta dietro le loro linee, basta solo farla esplodere. Conquista il sito, innesca la detonazione e raggiungi l’estrazione prima che esploda.',
  bv:[['cmdLive','{Cmd} è sempre più agguerrito e intenzionato ad usare il suo arsenale nucleare... ma solo se questo non esplode prima! Conquista il sito nucleare, innesca la detonazione e raggiungi l’estrazione prima che esploda.'],
   ['ship','La nave spaziale che abbiamo rubato ci dà il controllo dell’orbita, ma l’antiaerea nemica blocca comunque ogni bombardamento: comunque l’arsenale nucleare nemico è come una bomba già pronta dietro le loro linee, basta solo farla esplodere. Conquista il sito, innesca la detonazione e raggiungi l’estrazione prima che esploda.'],
   ['noShip','Il nemico ha ripreso la sua nave spaziale e ci sovrasta dall’orbita, tuttavia l’arsenale nucleare nemico è come una bomba già pronta dietro le loro linee: basta solo farla esplodere. Conquista il sito, innesca la detonazione e raggiungi l’estrazione prima che esploda.']],
  w:'L’arsenale nemico non esiste più, è stato spazzato via ed ora non restano che ceneri e rimasugli di quello che era un grande esercito.',l:'L’arsenale nucleare è rimasto saldamente nelle mani del nemico, ed ora sicuramente lo userà contro le nostre difese, con effetti devastanti.',sw:[],sl:[],
  fw:'L’arsenale nemico non esiste più: {cmd} ha perso la sua arma finale ed il suo esercito, la guerra è vinta e dovrà accettare le nostre condizioni. Potremmo perfino offrigli un lavoro...',
  fwv:[['cmd','L’arsenale nemico non esiste più: con {cmd} già caduto, il nemico non ha più né un capo né un’arma finale, e il suo esercito è allo sbando. La guerra è vinta per annientamento totale, da parte nostra è un perfetto esempio di strategia militare.']],
  fl:'L’arsenale nucleare è rimasto intatto sotto il controllo nemico: la resistenza locale è stata spazzata via, non possiamo più opporci al nemico, è finita.'},
 unlock:['stealth'],
 dir:{dev:({has})=>has('cmdLive')||has('hard')?2:1,fin:({has})=>1+(has('cmdLive')?2:0)+(has('hard')?2:0)+(has('noFwd')?1:0)},
 need:r=>[r<.5?'n':'k'],              // silos ICBM o centrale nucleare
 zones:1,
 static(K){const{sites,shuf}=K;const c=shuf(sites.filter(q=>(q.k=='n'||q.k=='k')&&dSt(q)>OBJ_MIN));if(!c.length)return false;MD.z=[zoneAt(c[0])];MD.sk=c[0].k;return true},   // un solo sito nucleare a caso: silos ICBM ('n') o centrale ('k')

 tick(dt,pl){zonesTick(dt,pl,z=>nukeArm(z),'Avamposto conquistato! Raggiungi il prossimo')},
 info:()=>zonesInfo(()=>MD.sk=='k'?'la centrale nucleare':'il sito ICBM'),
 marks:zonesMarks,
 // estrazione con il conto alla rovescia: timer scaduto = esplode (i giocatori non in estrazione muoiono); con le dropship in arrivo il timer si ferma
 extTick(dt){const m=MS;
 if(m.nk==1&&m.ex<2){m.nt-=dt;if(m.nt<=0){m.nt=0;nukeGo()}}         // timer scaduto: esplode, i giocatori non in estrazione muoiono (con le dropship in arrivo il timer si ferma)
 if(m.nk==1&&m.ng>0){m.ng-=dt;if(m.ng<=0){m.ng=0;nukeGo()}}         // l'ultima dropship sta ripartendo: detonazione
},
 extHold:()=>MS.nk==2,
 extStart(){const m=MS;if(m.nk==1)m.ng=2.4+DS_T.hover+.8+DS_T.turn+.35*Math.max(0,DS.ships.length-1)+.2},   // arrivo + sosta + giro dell'ultima dropship (vedi dsExtract): esplode mentre se ne vanno
 extBusy:()=>MS.nk&&!NK.wiped,          // nucleare: si vince appena l'onda d'urto ha coperto la mappa
 extInfo(){const m=MS;return m.nk==1?{t:'DETONAZIONE NUCLEARE tra '+Math.ceil(m.nt)+' s · tutti i giocatori all’estrazione!',f:clamp(m.nt/NK_T,0,1),c:'#ff4a4a'}
  :m.nk==2?{t:'Detonazione nucleare!',f:-1}:null},
 pack(){const m=MS;return[m.nk|0,Math.round((m.nk==2?NK.t:m.nt||0)*10)/10]},
 unpack(a,i){const m=MS;m.nk=a[i]|0;if(m.nk==1)m.nt=+a[i+1]||0;else if(m.nk==2&&!NK.on)nukeBegin(+a[i+1]||0)},
 reset(){NK.on=0},anim:nukeTick,drawScreen:drawNuke
});


// ####################################################################################################
// ##### MISSIONE 7 · RUBA LA NAVE SPAZIALE
// ##### Ruba la nave spaziale: conquista centrale energetica e cantiere spaziale, poi imbarcati sulla nave (che decolla).
// ####################################################################################################
// ===== decollo della nave =====
// SH è un'animazione LOCALE (ogni client la fa partire da sé quando l'estrazione inizia)
const SH={on:0,t:0,o:null,x:0,y:0,a:0},SH_BOARD=1.2,SH_LIFT=1.6,SH_FLY=6.5;
function shipBegin(){const o=MD.ship;if(!o||SH.on)return;Object.assign(SH,{on:1,t:0,o,x:o.x,y:o.y,a:o.a});sfxAt(SFX_LIST.toAir,.9,o.x,o.y,0)}
function shipTick(dt){if(!SH.on)return;SH.t+=dt;const o=SH.o,t=SH.t;
 if(t<SH_LIFT+3&&Math.random()<.9){const a=Math.random()*TAU,d=60+Math.random()*180;fxSpawn(o.x+Math.cos(a)*d,o.y+Math.sin(a)*d,'#c9b99a',3,true,50)}   // polvere dei motori
 if(t>=SH_LIFT&&!o.dead){o.dead=1;navRefresh(o);sfxAt(SFX_LIST.toAir,1,o.x,o.y,0)}   // lo scafo sparisce (non collide più) e da qui lo disegna drawShip
 if(t>=SH_LIFT+SH_FLY)SH.on=0}
// ===== nave spaziale che decolla (missione 7): bacino vuoto + scafo che sale, ingrandisce e accelera verso la prua =====
function drawShip(){if(!SH.on)return;const o=SH.o,t=SH.t,u=clamp((t-SH_LIFT)/SH_FLY,0,1),k=u*u,x=SH.x+Math.cos(SH.a)*k*3200,y=SH.y+Math.sin(SH.a)*k*3200,sc=1+u*1.8;
 if(t<SH_LIFT)return;                                           // prima del decollo lo scafo è ancora l'edificio normale
 const gh={shape:'cruiser',x:SH.x,y:SH.y,w:o.w,h:o.h,a:SH.a,v:0,id:o.id,pr:[],hp:1,m:1};
 ctx.save();ctx.globalAlpha=1;drawSpecial({...gh,gone:1},1,1);   // bacino vuoto
 ctx.translate(SH.x+u*150,SH.y+u*220);ctx.rotate(SH.a);ctx.fillStyle='rgba(0,0,0,'+.28*(1-u)+')';ctx.fillRect(-o.w*.45,-o.h*.36,o.w*.9,o.h*.72);ctx.restore();   // ombra a terra che si stacca
 ctx.save();ctx.translate(x,y);ctx.scale(sc,sc);ctx.translate(-x,-y);drawSpecial({...gh,x,y,fl:1},1,1);
 ctx.translate(x,y);ctx.rotate(SH.a);                           // fiamme dei 4 motori
 for(const ty of[-.4,-.14,.14,.4]){ctx.fillStyle='rgba(143,227,255,'+(.35+.3*Math.random())+')';ctx.beginPath();ctx.ellipse(-o.w*.46-18,ty*o.h/2,10+22*u,6,0,0,TAU);ctx.fill()}
 ctx.restore()}
misDef(7,{
 name:'Ruba la nave spaziale',
 story:"Una nave spaziale nemica è in fase di rifornimento al cantiere... a noi piace davvero tanto... deve essere nostra. Una nave in più per noi ed una in meno per loro in un colpo solo. Conquista la centrale energetica per alimentare i sistemi di bordo, poi raggiungi la nave e prendi il volo. Se ti avanza tempo al posto della nave lasciagli un post-it: grazie del regalo, poi vi renderemo i missili nucleari... accesi.",
 camp:{b:'Un’opportunità rara: una nave spaziale del nemico è in cantiere per riparazioni e rifornimenti. Rubare quella nave significa di colpo una nave in più per noi ed una in meno per il nemico. Conquista la centrale energetica che la alimenta e il cantiere spaziale che la trattiene, poi raggiungi la nave e imbarcati: decolla e lascia il settore.',
  bv:[['vip','{Vip} conosce i sistemi della nave spaziale nemica ferma in cantiere e sa come rubarla: conquista la centrale energetica e il cantiere, poi imbarcati e fai decollare la nave.'],
   ['pilots','I superstiti dello schianto sanno pilotare le navi nemiche: una nave spaziale è ferma in cantiere per riparazioni, e si può rubare. Conquista la centrale energetica e il cantiere, poi imbarcati e fai decollare la nave.'],
   ['sab','Con le difese del settore a pezzi puoi tentare il colpo grosso: una nave spaziale nemica è ferma in cantiere per riparazioni. Conquista la centrale energetica e il cantiere, poi imbarcati: la nave sarà un’arma decisiva per la resistenza.'],
   ['hard','Il nemico ha rinforzato le difese del settore, ma la sua nave spaziale in cantiere vale ogni rischio. Conquista la centrale energetica e il cantiere, poi imbarcati e fai decollare la nave prima che finiscano le riparazioni.']],
  w:'La nave spaziale del nemico ora è nostra: ha lasciato il settore ed è in orbita sotto il nostro controllo, e i suoi sistemi di puntamento ci permettono di guidare attacchi nucleari sui bersagli che marchiamo. Il nemico ci ha fatto proprio un bel regalo.',l:'La nave spaziale è rimasta a terra in mano al nemico, che sta completando le riparazioni. Non capiterà più un’opportunità simile.',sw:['ship'],sl:['noShip'],
  fw:'La nave spaziale che abbiamo sottratto al nemico è in orbita: la resistenza locale ora ha un’arma decisiva, con il supporto orbitale e perfino i loro codici il nemico è spacciato. La guerra è vinta... grazie a questo splendido massacro atomico unilaterale che vedete sui monitor in tempo reale.',fl:'La nave spaziale è rimasta a terra in mano al nemico che ha terminato le riparazioni. Appena tornata in orbita la nave ha cominciato a bombardare le nostre difese con armi nucleari. Proprio mentre parliamo gli scudi stanno cedendo e il prossimo colpo ci ridurrà in cenere. Almeno non sopravviveremo al nostro fallimento. Ammirate la luce...'},
 unlock:['w'+W_NUK],
 dir:{dev:({has})=>has('vip')||has('sab')?3:1,fin:({has})=>1+(has('vip')?3:0)+(has('sab')?2:0)},
 th:[0,1,5,6,7,8],                      // serve il cantiere spaziale con la nave: niente interni
 need:()=>['y','k'],
 zones:1,
 static(K){const{sites}=K;const pl=sites.find(q=>q.k=='k'&&dSt(q)>OBJ_MIN)||sites.find(q=>q.k=='i'&&dSt(q)>OBJ_MIN)||sites.find(q=>q.k=='c'&&dSt(q)>OBJ_MIN),yd=sites.find(q=>q.k=='y'&&dSt(q)>OBJ_MIN),sh=M.obs.find(o=>o.shape=='cruiser');
   if(!pl||!yd||!sh)return false;MD.z=[zoneAt(pl),zoneAt(yd)];MD.ship=sh;EXT[0]=sh.x;EXT[1]=sh.y;return true},
 tick(dt,pl){zonesTick(dt,pl,()=>objDone('Cantiere conquistato!'),'Centrale energetica conquistata! Raggiungi il cantiere spaziale')},
 info:()=>zonesInfo(i=>i?'il cantiere spaziale':'la centrale energetica'),
 marks:zonesMarks,
 // l'estrazione è la nave stessa (EXT = posizione della nave, vedi static)
 ext:{r:SHIP_R,label:'NAVE SPAZIALE',to:' Raggiungi la nave spaziale!',go:'La nave spaziale sta per decollare!',run:'La nave spaziale sta decollando…',all:'Obiettivo compiuto! Tutti i giocatori alla nave spaziale'},
 extBegin:shipBegin,extBusy:()=>SH.on,
 reset(){SH.on=0},anim:shipTick,drawAir:drawShip,hideAll:()=>SH.on&&SH.t>=SH_BOARD   // hideAll: i mech sono a bordo, non si disegnano
});


// ####################################################################################################
// ##### MISSIONE 8 · GUARDIA DI SICUREZZA
// ##### Guardia di sicurezza: presidia l’edificio del meeting (MD.mb), poi proteggi i furgoni dei VIP dalle ondate. Missione di difesa (defend).
// ####################################################################################################
// ===== missione 8: guardia di sicurezza =====
// Fase 1: raggiungere e presidiare l'edificio del meeting (nessun nemico). Fase 2: ogni SEC_GAP s parte un ciclo: SEC_WAVES ondate nemiche a SEC_SPAWN_D dall'edificio,
// poi (a SEC_LEAD s) un furgone blindato con un VIP che guida fino all'edificio (se lo tocca, il VIP è salvo). Le guardie alleate (units con sec=1) non rinascono.

function secSpawn(){units.length=0;PQ.length=0;G.cap=0;secNavBuild();   // niente nemici all'inizio (e niente caserme: vedi missionTick)
 const b=MD.mb,g=GID++,kinds=[UK_MECH,UK_MECH,UK_MECH,UK_SNIP,UK_TANK,UK_TUR,UK_TUR],d1=Math.max(SEC_ALLY_D,b.r+120);
 for(let i=0;i<SEC_ALLY_N;i++){const k=kinds[i%kinds.length];
  for(let tr=0;tr<250;tr++){const a=Math.random()*TAU,d=rnd(b.r+50,d1),x=b.x+Math.cos(a)*d,y=b.y+Math.sin(a)*d;
   if(x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60&&clearAt(x,y,k==UK_TANK?40:k==UK_TUR?30:22)){const u=mkUnit(k,x,y,g);u.sec=1;u.ms=1;u.hp=u.mhp=Math.round(u.hp*1.3);u.ar=(k==UK_TUR?0:6);break}}}}
// il punto è libero e da lì (senza alberi/rocce di mezzo) si arriva a piedi fino all'edificio? (evita nemici incastrati subito dopo la nascita)
function secReach(x,y){if(NAVV[ncell(x,y)])return false;const p=secPath(x,y),l=p[p.length-1],b=MD.mb;return Math.hypot(l[0]-b.x,l[1]-b.y)<b.r+350}
// punto di nascita valido per il tipo k, a partire dalla direzione a0: se non si trova, allarga angolo e distanza e poi rilassa i requisiti. Il tipo NON cambia mai.
function secSpot(k,a0){const b=MD.mb,fly=k==UK_JET||k==UK_KAMI,r=k==UK_TANK?40:22;
 for(let tr=0;tr<450;tr++){const f=tr/450,
   a=a0+rnd(-.5,.5)*(1+f*11),                        // da ±0,5 rad fino al cerchio intero
   d=SEC_SPAWN_D*rnd(.94-f*.4,1.06+f*.2),            // da ±6% fino a 0,54–1,26 volte la distanza standard
   x=b.x+Math.cos(a)*d,y=b.y+Math.sin(a)*d;
  if(!(x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60))continue;
  if(fly)return{x,y,a};
  if(tr<150?(clearAt(x,y,r)&&secReach(x,y)):tr<300?clearAt(x,y,r):!inWater(x,y,r))return{x,y,a}}   // 1) libero e raggiungibile  2) solo libero (waveUnstick penserà al resto)  3) almeno non in acqua
 return null}
function secWave(){const b=MD.mb,g=GID++;let c=0;
 const pr=secSpot(1,Math.random()*TAU),a0=pr?pr.a:Math.random()*TAU;   // direzione dell'ondata: scelta su un punto valido per i mezzi di terra, così l'ondata resta compatta
 for(let i=0;i<SEC_WAVE_N;i++){const k=getRandomEnemyType(),s=secSpot(k,a0);   // tipo estratto una sola volta: le percentuali di getRandomEnemyType restano intatte
  if(!s)continue;
  waveUnit(mkUnit(k,s.x,s.y,g),b.x,b.y,b.r);c++;fxSpawn(s.x,s.y,'#ff9a3a',10,true)}
 if(c)announce('Ondata di nemici in arrivo!')}
function secVan(){const b=MD.mb;let best=null;
 for(let tr=0;tr<24&&!best;tr++){const a=Math.random()*TAU,x=b.x+Math.cos(a)*SEC_VAN_D,y=b.y+Math.sin(a)*SEC_VAN_D;
  if(x<150||y<150||x>WW-150||seaU(x,y)>SEA-250||y>WH-150||dSt({x,y})<600||!clearAt(x,y,30))continue;
  if(NAVV[ncell(x,y)])continue;const p=secPath(x,y),l=p[p.length-1];if(Math.hypot(l[0]-b.x,l[1]-b.y)<b.r+280)best={x,y,p}}   // si parte solo da punti da cui un percorso arriva fino all'edificio
 if(!best){const a=Math.random()*TAU;best={x:clamp(b.x+Math.cos(a)*SEC_VAN_D*.6,150,WW-150),y:clamp(b.y+Math.sin(a)*SEC_VAN_D*.6,150,WH-150),p:null}}
 MS.dp++;MS.vans.push({id:-10-MS.dp,n:MS.dp,al:1,van:1,z:0,x:best.x,y:best.y,vx:0,vy:0,hp:SEC_VAN_HP,mhp:SEC_VAN_HP,drG:3,rr:26,on:1,h:Math.atan2(b.y-best.y,b.x-best.x),path:best.p,pi:0,pt:best.p?3:0});
 announce('VIP '+MS.dp+'/'+SEC_VIP_N+' in arrivo: proteggi il furgone!')}
function secTick(dt,pl){const m=MS,b=MD.mb,z=MD.z[0];
 if(b.dead){finish(1,'Edificio del meeting distrutto: missione fallita');return}
 if(!m.cap){const inside=pl.some(q=>!q.z&&Math.hypot(q.x-z.x,q.y-z.y)<z.r);z.p=clamp(z.p+(inside?dt/SEC_CAP_T:-dt/SEC_CAP_T*.5),0,1);
  if(z.p>=1){m.cap=1;m.cz=1;m.ct=-SEC_FIRST;m.wd=0;m.vd=0;announce('Zona conquistata! I VIP stanno per arrivare: difendi l’edificio.')}return}
 
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
misDef(8,{
 name:'Guardia di sicurezza',
 story:"Devi proteggere un edificio strategico sede di un meeting vitale. Dieci VIP verranno di persona per l'occasione con furgoni blindati. I nemici arriveranno sicuramente, attirati come mosche sullo sterco. Le guardie alleate ti copriranno, ma non ce la faranno da sole. Lo so... lo so... qui nessuno vuole fare il babysitter... ma vediamo il lato positivo: ci saranno molti nemici da massacrare e non dovremo nemmeno cercarli, verrano loro da noi! Ah...non perdere più di tre VIP o la missione fallirà.",
 camp:{b:'Dieci delegati delle regioni nostre alleate raggiungono un vertice segreto, uno alla volta, in furgoni blindati. Discuteranno e decideranno se supportare la nostra causa oppure no. L’edificio del meeting è nel nostro territorio, ma sospettiamo che il nemico non si farà scappare un occasione così ghiotta. Difendi l’edificio del meeting e non lasciare che il nemico uccida i delegati, cosa che proverà sicuramente a fare.',
  bv:[['fwd','Si terrà un vertice segreto per discutere con i delegati di regioni alleate se darci maggior supporto: dieci delegati alleati arrivano uno alla volta in furgoni blindati. Anche se siamo in territorio alleato sospettiamo che il nemico non si farà scappare un occasione così ghiotta. Difendi l’edificio del meeting e non lasciare che il nemico uccida i delegati.']],
  w:'Il vertice si è svolto: la sicurezza che gli abbiamo garantito li ha convinti a fornirci supporto.',l:'Le gravi perdite hanno fatto saltare il vertice. Gli alleati hanno perso fiducia nelle nostre capacità militari e ci hanno negato ogni supporto.',sw:['ally'],sl:['noAlly'],
  fw:'Il vertice dei delegati ha imposto l’armistizio al nemico, visto lo squilibrio di forze. {cmd} essendo isolato ed in inferiorità assoluta, ha deciso di arrendersi prima di capitolare ed essere eliminato... mossa astuta. La guerra è finita, abbiamo vinto, ma è sembrata più una manovra politica che militare, comunque ora la regione è nostra... e per una generosa percentuale è anche dei nostri alleati.',
  fwv:[['cmd','Il vertice dei delegati ha imposto l’armistizio al nemico: con {cmd} eliminato il comando nemico è allo sbando, le sue forze sono isolate ed in inferiorità assoluta e si arrendono senza condizioni. La guerra è finita, abbiamo vinto, ma è sembrata più una manovra politica che militare, comunque ora la regione è nostra... e per una generosa percentuale è anche dei nostri alleati.']],
  fl:'Il vertice è fallito: gli alleati erano la nostra unica speranza, molti sono rimasti neutrali ed alcuni si sono perfino alleati con il nemico. La resistenza locale è spacciata, ormai possono eliminarci facilmente dall’orbita, opporsi sarebbe solo un inutile spreco di risorse. dobbiamo arrenderci al nemico ed accettare le sue condizioni. Subito dopo la firma dell’armistizio, tra le nostre fila molte teste cadranno, in senso letterale.'},
 unlock:['revive'],
 dir:{dev:({has})=>has('fwd')||has('sup')?3:1,fin:({has})=>1+(has('cmd')?3:0)+(has('ally')?2:0)},
 defend:1,zones:1,
 static(K){const{fr,shuf}=K;const c=shuf(fr.filter(o=>dSt(o)>OBJ_MIN&&o.w>=150&&o.h>=150&&!o.is&&!o.tw&&o.x>700&&o.x<WW-700&&seaU(o.x,o.y)<SEA-700&&o.y>700&&o.y<WH-700&&!inWater(o.x,o.y,o.r)));if(!c.length)return false;   // edificio del meeting: grande, lontano dalla partenza e dai bordi
   const o=c[0];o.vipB=1;o.pal=PAL_VIP;o.hp=o.m=Math.round(o.hp*SEC_BHP);MD.mb=o;MD.bt={x:o.x,y:o.y,hp:o.hp,z:0,rr:o.r,bld:1};   // bt = bersaglio per l'AI nemica
   MD.z=[{x:o.x,y:o.y,r:o.r+130,p:0}];return true},   // zona di cattura attorno all'edificio

 spawn:()=>secSpawn(),
 tick:(dt,pl)=>secTick(dt,pl),
 info(){const m=MS;
  {const b=MD.mb,z=MD.z[0];if(!m.cap)return{t:'Raggiungi a piedi l’edificio del meeting e presidia la zona',f:z.p,c:'#ffd23f',h:b.hp/b.m};
   if(m.wst)return{t:'VIP al sicuro ('+m.sf+'/'+SEC_VIP_N+'): elimina i nemici rimasti ('+units.filter(u=>!u.sec&&u.k<UK_HUM).length+')',f:1,c:'#5ee0c0',h:b.hp/b.m};
   const nx=Math.ceil(m.ct<SEC_LEAD?SEC_LEAD-m.ct:SEC_GAP+SEC_LEAD-m.ct);
   return{t:'Difendi il meeting · VIP in salvo '+m.sf+'/'+SEC_VIP_N+' · persi '+m.ls+'/'+(SEC_FAIL+1)+(m.dp<SEC_VIP_N?' · prossimo furgone tra '+nx+' s':''),f:m.sf/SEC_SAFE,c:'#5ee0c0',h:b.hp/b.m}}},
 marks(o){const m=MS;
 {if(!m.cap){const z=MD.z[0];o.push({x:z.x,y:z.y,c:'#ffd23f'})}else{o.push({x:MD.mb.x,y:MD.mb.y,c:'#5ee0c0'});for(const v of m.vans)o.push({x:v.x,y:v.y,c:'#4aa3ff'});
   if(m.wst)for(const u of units.filter(u=>!u.sec&&u.k<UK_HUM).sort((p,q)=>Math.hypot(p.x-P.x,p.y-P.y)-Math.hypot(q.x-P.x,q.y-P.y)).slice(0,4))o.push({x:u.x,y:u.y,c:'#ff4a4a'})}}   // finale: i 4 nemici più vicini sono segnalati
},
 allies:()=>(MS.vans||[]).filter(v=>v.on&&v.hp>0),   // i furgoni dei VIP
 pack(){const m=MS;return[m.sf|0,m.ls|0,m.dp|0,m.cap|0,m.wst|0,Math.round(m.ct*10)/10,...m.vans.flatMap(v=>[v.n,Math.round(v.x),Math.round(v.y),Math.max(0,Math.ceil(v.hp)),Math.round((v.h||0)*100)/100])]},
 unpack(a,i){const m=MS;m.sf=a[i]|0;m.ls=a[i+1]|0;m.dp=a[i+2]|0;m.cap=a[i+3]|0;m.wst=a[i+4]|0;m.ct=+a[i+5]||0;const keep=[];   // furgoni dei VIP: ricreati/aggiornati dallo snapshot
  for(let j=i+6;j+4<a.length;j+=5){const n=a[j];let v=m.vans.find(q=>q.n===n);if(!v){v={id:-10-n,n,al:1,van:1,z:0,x:a[j+1],y:a[j+2],vx:0,vy:0,mhp:SEC_VAN_HP,rr:26,on:1,h:a[j+4]};m.vans.push(v)}v.tx=a[j+1];v.ty=a[j+2];v.hp=a[j+3];v.h=a[j+4];keep.push(v)}
  m.vans=keep},
 drawWorld(pu){
 for(const v of MS.vans||[]){ctx.strokeStyle='rgba(94,224,192,'+(.4+.4*pu)+')';ctx.lineWidth=3;ctx.beginPath();ctx.arc(v.x,v.y,38,0,TAU);ctx.stroke();drawAlly(v,'van');
  ctx.fillStyle='#333';ctx.fillRect(v.x-22,v.y-48,44,5);ctx.fillStyle='#3fae4a';ctx.fillRect(v.x-22,v.y-48,44*clamp(v.hp/v.mhp,0,1),5);ctx.fillStyle='#5ee0c0';ctx.font='bold 11px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText('VIP '+v.n,v.x,v.y-53)}}
});


// ####################################################################################################
// ##### MISSIONE 9 · DIFESA DELLA BASE
// ##### Difesa della base: difendi l’edificio centrale (MD.mb) per TD_TIME secondi e ripristina le 4 torrette. Missione di difesa (defend).
// ####################################################################################################
// ===== missione 9: difesa della base (tower defence) =====
// Edificio centrale (MD.mb) e 4 zone (MD.z) derivano dal seed. Le torrette alleate sono unità sec=1 (come le guardie della missione 8) al centro delle zone.
// Torretta morta → la sua zona si attiva (z.on=1): un giocatore a terra che ci resta TD_CAP_T s la ripristina. Il tempo parte quando un giocatore si avvicina.
// Dopo TD_TIME s con l'edificio vivo: esplosioni nucleari fuori mappa (effetto LOCALE) eliminano i nemici e la missione è vinta.
const TN={on:0,t:0,k:0,f:[]};
function tdTurret(z){const u=mkUnit(UK_TUR,z.x,z.y,GID++);u.sec=1;u.ms=1;u.hp=u.mhp=Math.round(u.hp*TD_TUR_HP);u.ar=0;
 if(u.bw!=null){u.bw=null;u.ws=newWS(W_MG)}   // sempre mitraglia (mkUnit a volte assegna lanciafiamme/shotgun/cannone)
 z.u=u;z.on=0;z.p=0;return u}
function tdSpawn(){units.length=0;PQ.length=0;G.cap=0;secNavBuild();for(const z of MD.z)tdTurret(z)}   // niente nemici all'inizio, solo le 4 torrette
function tdWave(n){const b=MD.mb,g=GID++,a0=Math.random()*TAU;let c=0;   // ogni ondata nasce in una direzione casuale a TD_SPAWN_D dall'edificio
 for(let tr=0;c<n&&tr<600;tr++){const a=a0+rnd(-.5,.5)*(tr>200?4:1),x=b.x+Math.cos(a)*TD_SPAWN_D+rnd(-70,70),y=b.y+Math.sin(a)*TD_SPAWN_D+rnd(-70,70),k=getRandomEnemyType();
  if(x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60&&((k==UK_JET||k==UK_KAMI)||clearAt(x,y,k==UK_TANK?40:22)&&(tr>=400||waveCan(x,y,b.x,b.y,b.r)))){waveUnit(mkUnit(k,x,y,g),b.x,b.y,b.r);c++;fxSpawn(x,y,'#ff9a3a',10,true)}}
 // fallback: se restano nemici da piazzare (spawn troppo bloccato da alberi/rocce/edifici), piazzali in un anello più stretto attorno all'edificio
 for(let tr=0;c<n&&tr<400;tr++){const a=Math.random()*TAU,d=rnd(b.r+120,b.r+420),x=b.x+Math.cos(a)*d,y=b.y+Math.sin(a)*d,k=getRandomEnemyType();
  if(x>60&&y>60&&x<WW-60&&seaU(x,y)<SEA-100&&y<WH-60&&(k==UK_JET||k==UK_KAMI||clearAt(x,y,18))){waveUnit(mkUnit(k,x,y,g),b.x,b.y,b.r);c++;fxSpawn(x,y,'#ff9a3a',10,true)}}
 return c}
function tdTick(dt,pl){const m=MS,b=MD.mb;
 if(b.dead){finish(1,'Edificio centrale distrutto: missione fallita');return}
 
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
// esplosioni nucleari della missione 9: lampi sull'orizzonte, oltre il bordo dello schermo (fuori mappa), in tutte le direzioni
function drawTdNuke(){if(!TN.on)return;const c=ctx;c.save();let veil=0;
 for(const f of TN.f){if(!f.s)continue;const u=(TN.t-f.t0)/1.4;if(u>=1)continue;
  const sx=W/2+Math.cos(f.a)*W*.55,sy=H/2+Math.sin(f.a)*H*.55,R=Math.hypot(W,H)*(.25+.55*u),g=c.createRadialGradient(sx,sy,0,sx,sy,R);
  g.addColorStop(0,'rgba(255,255,255,'+(1-u)+')');g.addColorStop(.6,'rgba(255,240,200,'+.5*(1-u)+')');g.addColorStop(1,'rgba(255,240,200,0)');
  c.fillStyle=g;c.fillRect(0,0,W,H);veil=Math.max(veil,.35*(1-u)*(1-u))}
 if(veil>0){c.fillStyle='rgba(255,255,255,'+veil+')';c.fillRect(0,0,W,H)}
 c.restore()}
misDef(9,{
 name:'Difesa della base',
 story:"La nostra base è sotto assedio, e il supporto aereo arriverà fra 15 minuti: devi resistere fino ad allora! Se l'edificio centrale crolla, la base è perduta. Le ondate nemiche non si fermeranno, ma puoi ripristinare le torrette quando vengono distrutte.",
 camp:{b:'Un attacco nemico ad una nostra base è imminente. Il nemico ha forze ingenti ed assalterà incessantemente in modo frontale e diretto, contando sui suoi numeri. Dobbiamo dimostrargli che il numero non basta. Difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.',
  bv:[['noFwd','Dopo il fallimento nella conquista degli avamposti il nemico contrattacca pesantemente mirando direttamente alla nostra base: difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.'],['fwd','Il nemico vuole riprendersi i territori perduti e attacca direttamente la nostra base avanzata con forze soverchianti: difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.'],
   ['ship','Il nemico non ha perdonato il furto della nave spaziale e attacca direttamente la nostra base con forze soverchianti, deciso a vendicarsi. Difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.'],
   ['noShip','Il nemico ha riparato la sua nave spaziale e, forte del supporto orbitale, attacca direttamente la nostra base con forze soverchianti: difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.'],
   ['fleet','La flotta nemica, rimasta padrona del mare, ha sbarcato truppe fresche a ridosso della nostra base: l’assalto è imminente e sarà incessante. Difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.']],
  w:'La nostra base ha respinto le ondate nemiche ed è ancora operativa: il nemico ha perso l’iniziativa e molte unità.',l:'La nostra base è stata distrutta: la resistenza locale è in ritirata ed abbiamo ceduto molto territorio al nemico.',sw:['held'],sl:['baseLost'],
  fw:'La nostra base ha resistito all’ultimo devastante assalto nemico: ci hanno mandato contro tutto quello che avevano, e noi lo abbiamo ridotto in poltiglia. Ora l’offensiva nemica è spezzata, non gli rimane più un esercito, la guerra è vinta. Stermineremo i nemici superstiti come atto dimostrativo per evitare future ribellioni.',fl:'La nostra ultima base nel settore è stata travolta dalle ondate nemiche: non abbiamo più possibilità nè mezzi per contrastare il nemico. La regione è persa. Mentre parliamo il nemico sta per sfondare la porta di questo bunker, suggerisco di completare il nostro fallimento con un ultima grande esplosione...'},
 unlock:['gdr'],
 dir:{dev:({last,lf,has})=>last&&last[0]==5&&lf?8:has('fwd')?2:1,fin:({has,lost})=>1+(has('fwd')?3:0)+(lost>=2?3:0)},   // dopo una Conquista avamposto persa il nemico contrattacca
 defend:1,
 static(K){const{fr,shuf,MR}=K;const pool=fr.filter(o=>dSt(o)>OBJ_MIN&&o.w>=150&&o.h>=150&&!o.is&&!o.tw&&o.x>900&&o.x<WW-900&&seaU(o.x,o.y)<SEA-900&&o.y>900&&o.y<WH-900&&!inWater(o.x,o.y,o.r)).sort((p,q)=>q.w*q.h-p.w*p.h).slice(0,8);   // i più grandi
   for(const o of shuf(pool)){const a0=MR()*TAU,zs=[];
    for(let i=0;i<4;i++){const a=a0+i*TAU/4;let ok=false;   // un punto per quadrante: la torretta sta al centro della sua zona
     for(let d=o.r+TD_ZONE_R+40;d<=o.r+TD_TUR_D+380&&!ok;d+=25)for(const da of[0,.2,-.2,.4,-.4,.6,-.6]){const x=o.x+Math.cos(a+da)*d,y=o.y+Math.sin(a+da)*d;   // dal più vicino al più lontano, con piccole deviazioni d'angolo
      if(x>150&&y>150&&x<WW-60&&seaU(x,y)<SEA-250&&y<WH-150&&clearAt(x,y,TD_ZONE_R*.6)&&!inWater(x,y,TD_ZONE_R*.6+30)&&!M.bridges.some(b=>Math.hypot(x-b.x,y-b.y)<b.L/2+TD_ZONE_R)&&zs.every(z=>Math.hypot(x-z.x,y-z.y)>TD_ZONE_R*2+60)){zs.push({x,y,r:TD_ZONE_R,p:0,on:0});ok=true;break}}}
    if(zs.length<4)continue;   // non c'è spazio per tutte e 4: si prova un altro edificio
    o.vipB=1;o.pal=PAL_VIP;o.hp=o.m=Math.round(o.hp*TD_BHP);MD.mb=o;MD.bt={x:o.x,y:o.y,hp:o.hp,z:0,rr:o.r,bld:1};MD.z=zs;return true}
   return false},   // difesa della base: edificio centrale + 4 zone delle torrette

 spawn:()=>tdSpawn(),
 tick:(dt,pl)=>tdTick(dt,pl),
 info(){const m=MS;
  {const b=MD.mb;if(!m.ta)return{t:'Raggiungi la base e preparati a difenderla',f:-1,h:b.hp/b.m};
   if(m.tn)return{t:'Esplosioni nucleari: i nemici vengono eliminati!',f:1,c:'#ff4a4a',h:b.hp/b.m};
   const dead=MD.z.filter(z=>z.on).length,left=Math.max(0,TD_TIME-m.tt),mm=Math.floor(left/60),ss=Math.floor(left%60);
   return{t:'Difendi la base · '+mm+':'+String(ss).padStart(2,'0')+' · torrette distrutte '+dead+'/'+MD.z.length+(dead?' · riconquista le zone rosse':''),f:m.tt/TD_TIME,c:'#5ee0c0',h:b.hp/b.m}}},
 marks(o){const m=MS;
 {if(!m.ta)o.push({x:MD.mb.x,y:MD.mb.y,c:'#5ee0c0'});for(const z of MD.z)if(z.on)o.push({x:z.x,y:z.y,c:'#ff4a4a'})}   // prima la base, poi le torrette da ripristinare
},
 pack(){const m=MS;return[m.ta|0,Math.round(m.tt),m.tn|0,...MD.z.flatMap(z=>[Math.round(z.p*100)/100,z.on|0])]},
 unpack(a,i){const m=MS;m.ta=a[i]|0;m.tt=+a[i+1]||0;const tn=a[i+2]|0;if(tn&&!m.tn)tdNukeBegin(0);m.tn=tn;
  MD.z.forEach((z,k)=>{z.p=+a[i+3+k*2]||0;z.on=a[i+4+k*2]|0})},   // zone delle torrette: avanzamento e stato
 anim:tdNukeTick,drawScreen:drawTdNuke,
 drawWorld(pu){
 MD.z.forEach((z,i)=>{if(!z.on)return;ctx.save();ctx.fillStyle='rgba(255,74,74,'+(.08+.08*pu)+')';ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.fill();
  ctx.strokeStyle='rgba(255,74,74,.8)';ctx.lineWidth=4;ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.stroke();
  if(z.p>0){ctx.strokeStyle='#5ee0c0';ctx.lineWidth=10;ctx.beginPath();ctx.arc(z.x,z.y,z.r-8,-Math.PI/2,-Math.PI/2+TAU*z.p);ctx.stroke()}   // barra di ripristino
  ctx.fillStyle='rgba(255,130,130,.95)';ctx.font='bold 14px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText('TORRETTA '+(i+1),z.x,z.y+5);ctx.restore()});}
});


// ####################################################################################################
// ##### MISSIONE 10 · RICERCA E RECUPERO
// ##### Ricerca e recupero: trova il sito dello schianto, recupera i 3 VIP feriti e portane almeno 2 all’estrazione.
// ####################################################################################################
misDef(10,{
 name:'Ricerca e recupero',
 story:"L'antiaerea nemica non ci da tregua, ed una nostra navicella è stata abbattuta. A bordo c'erano tre VIP. Il segnale di soccorso parla di feriti in capsule di salvataggio sparse nella zona. Se il comando ha autorizzato la missione è perchè questi VIP hanno tecnologie preziose o sono parenti di qualche dirigente... ad ogni modo trova il sito, recupera almeno due VIP e portali al punto di estrazione.",
 camp:{b:'Una dropship alleata è stata abbattuta dall’antiaerea nemica ed ha fatto un atterraggio di emergenza nel settore. Cadendo ha trasmesso un segnale di soccorso che parlava di 3 capsule di salvataggio con VIP a bordo. Trova il relitto in territorio nemico e porta in salvo i superstiti che trovi, potrebbero essere preziosi.',
  bv:[['noVip','La resistenza locale ha già perso {vip} ed ora l’antiaerea nemica ha abbattuto una dropship con a bordo altri componenti chiave della resistenza locale. Non possiamo permetterci di perdere altri elementi essenziali. Se le capsule di salvataggio hanno retto, i VIP potrebbero essere ancora vivi. Trova il relitto in territorio nemico e porta in salvo i superstiti.']],
  w:'I superstiti dello schianto sono in salvo: i racconti delle loro ricognizioni svelano le mosse del nemico, dandoci un notevole vantaggio.',l:'I superstiti dello schianto sono andati perduti: la resistenza locale ha subito un altra grave perdita oggi.',sw:['pilots'],sl:['pilotsLost']},
 unlock:['radar'],vipBonus:1,
 dir:{dev:({has,lf})=>has('noVip')||lf?3:1},
 keep:{n:1,ds:0,kinds:'gcivkyna',cl:240,d0:220,rd:760,wet:20,road:130},keepIn:{n:1,r:310,big:1},   // radura per l'area di schianto
 extShow:1,tickAfterExt:1,              // durante l'estrazione i VIP recuperati continuano a seguire i giocatori e a poter morire
 static(K){const{sites,shuf,MR,mr}=K;const c=shuf(sites.filter(q=>['g','r','l','i','c','v'].includes(q.k)&&dSt(q)>OBJ_MIN));if(!c.length)return false;
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

 spawn(){
 {for(const p of MD.vipsPos){MS.vips.push({id:-20-MS.vips.length,n:MS.vips.length+1,al:1,z:0,x:p.x,y:p.y,h:p.h,vx:0,vy:0,hp:VIP_HP,mhp:VIP_HP,rr:16,on:0,saved:0,dead:0,rv:0,st:0,burn:0})}}},
 tick(dt,pl){const m=MS;
 {const c=MD.crash;
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
  if(MS.vips.length&&MS.vips.filter(v=>v.saved).length>=2)objDone('Almeno 2 VIP in salvo: missione riuscita!')}},
 info(){const n=MS.vips||[],rec=n.filter(v=>v.on||v.saved).length,sav=n.filter(v=>v.saved).length,dth=n.filter(v=>v.dead).length,c=MD.crash;
   if(!c.seen)return{t:'Nessuna indicazione: esplora e individua il sito di schianto (zona '+regione(c.x,c.y)+')',f:-1,c:'#5ee0c0'};
   if(sav>=2)return{t:'Almeno 2 VIP in salvo: missione riuscita!',f:1,c:'#5ee0c0'};
   if(dth>=2)return{t:'Troppi VIP persi: missione fallita',f:-1,c:'#ff4a4a'};
   if(rec+dth<3)return{t:'Raggiungi il relitto e recupera i VIP feriti · '+rec+' recuperati, '+dth+' persi (ne servono 2)',f:rec/2,c:'#5ee0c0'};
   return{t:'Scorta i VIP al punto di estrazione · '+sav+' in salvo, '+dth+' persi (ne servono 2)',f:sav/2,c:'#5ee0c0'}},
 marks(o){
 {const n=MS.vips||[];
   if(MD.crash.seen)for(const v of n)if(!v.saved&&!v.dead&&!v.on&&v.hp>0)o.push({x:v.x,y:v.y,c:'#5ee0c0'});
   if(n.some(v=>v.on&&!v.saved&&!v.dead)||n.some(v=>v.saved))o.push({x:EXT[0],y:EXT[1],c:'#5ee0c0'});
 }},
 allies:()=>(MS.vips||[]).filter(v=>v.on&&!v.saved&&v.hp>0&&!(v.inV>=0)),   // VIP recuperati (a bordo di un mezzo li protegge il mezzo)
 vipList(out){if(MS.vips)for(const w of MS.vips)out.push(w)},vipActive:w=>!!w.on&&!w.saved,
 extVips(list){for(const v of MS.vips||[])if((v.on||v.saved)&&!v.dead&&v.hp>0)list.push({id:'vip'+v.n,x:v.x,y:v.y,ci:2})},   // ogni VIP recuperato o in salvo sale su una dropship, prima dei giocatori
 pack(){const m=MS;return[(MD.crash&&MD.crash.seen?1:0),...(m.vips||[]).flatMap(v=>[Math.round(v.x),Math.round(v.y),Math.max(0,Math.ceil(v.hp)),v.on|0,v.saved|0,v.dead|0,Math.round((v.rv||0)*100)/100,Math.round((v.h||0)*100)/100,v.inV>=0?v.inV:-1])]},
 unpack(a,i){const m=MS;if(MD.crash)MD.crash.seen=a[i]|0;if(!m.vips)m.vips=[];
  for(let k=0;k<3;k++){const b=i+1+k*9;if(b+8>=a.length)break;
   let v=m.vips[k];if(!v){v={id:-20-k,n:k+1,al:1,z:0,x:a[b],y:a[b+1],tx:a[b],ty:a[b+1],rr:16,mhp:VIP_HP,burn:0,dead:0};m.vips.push(v)}
   const wasDead=v.dead|0;
   v.tx=a[b];v.ty=a[b+1];v.hp=a[b+2];v.on=a[b+3]|0;v.saved=a[b+4]|0;v.dead=a[b+5]|0;v.rv=+a[b+6]||0;v.h=+a[b+7]||0;v.inV=a[b+8]|0;
   if(v.dead&&!wasDead){fxBoom(v.x,v.y,'unit',FXS);fxSpawn(v.x,v.y,'#c01818',10,true,45);makeBlood(v.x,v.y,2.5);sfxAt(SFX_LIST.crash,.8,v.x,v.y,80)}}},
 clientInit(){if(MD.vipsPos)for(const p of MD.vipsPos)MS.vips.push({id:-20-MS.vips.length,n:MS.vips.length+1,al:1,z:0,x:p.x,y:p.y,tx:p.x,ty:p.y,h:p.h,vx:0,vy:0,hp:VIP_HP,mhp:VIP_HP,rr:16,on:0,saved:0,dead:0,rv:0,st:0,burn:0})},
 drawWorld(){
  const c=MD.crash;
  if(c){
   const onScr=c.x>camX-250&&c.x<camX+W/zoom+250&&c.y>camY-250&&c.y<camY+H/zoom+250;   // il sito è (almeno in parte) nello schermo
   // area del sito: cerchio tratteggiato pulsante, solo dopo la scoperta
   if(c.seen&&onScr){const pu=.5+.5*Math.sin(performance.now()/300);
    ctx.save();ctx.strokeStyle='rgba(255,140,60,'+(.35+.25*pu)+')';ctx.lineWidth=4;ctx.setLineDash([20,16]);
    ctx.beginPath();ctx.arc(c.x,c.y,c.r,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.restore()}
   // relitto: solo se è nello schermo e il suo centro è nella visuale del Grunt (non attraverso la nebbia)
   if(onScr&&seen(c.x,c.y,false)){
    ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.a);
    try{SCN.wreckShip(ctx,{s:(c.x|0)*7+(c.y|0)*11,big:1})}catch(e){if(!c.err){c.err=1;console.warn('wreckShip:',e)}}   // l'errore si segnala una volta sola invece di essere nascosto
    ctx.restore()}
  }
  // VIP: feriti a terra (recuperabili) oppure recuperati (seguono il player)
  for(const v of MS.vips||[]){
   if(v.dead)continue;
   if(v.on||v.saved){if(!dsHides('vip'+v.n)&&!(v.inV>=0))drawAlly(v,'vip');continue}   // a bordo di un mezzo: non si disegna   // recuperati o in salvo: restano visibili finché la dropship non li carica
   if(!seen(v.x,v.y,false))continue;   // ferito: si vede solo se è nella visuale del Grunt (nebbia di guerra)
   // ferito: figurina stesa + alone + barra di recupero
   const pu=.5+.5*Math.sin(performance.now()/300+v.id);
   ctx.save();
   ctx.fillStyle='rgba(94,224,192,'+(.06+.06*pu)+')';ctx.beginPath();ctx.arc(v.x,v.y,55,0,TAU);ctx.fill();
   ctx.translate(v.x,v.y);ctx.rotate(v.h||0);
   ctx.fillStyle='#e8eef5';ctx.strokeStyle='#111';ctx.lineWidth=1;
   ctx.beginPath();ctx.ellipse(0,0,7,4,0,0,TAU);ctx.fill();ctx.stroke();
   ctx.fillStyle='#f1c27d';ctx.beginPath();ctx.arc(9,0,2.5,0,TAU);ctx.fill();ctx.strokeStyle='#111';ctx.lineWidth=1;ctx.stroke();
   ctx.restore();
   ctx.save();ctx.textAlign='center';
   ctx.fillStyle='#5ee0c0';ctx.font='bold 11px system-ui,sans-serif';ctx.fillText('VIP '+v.n,v.x,v.y-18);
   ctx.fillStyle='#333';ctx.fillRect(v.x-22,v.y+10,44,5);
   ctx.fillStyle='#5ee0c0';ctx.fillRect(v.x-22,v.y+10,44*clamp((v.rv||0)/VIP_T,0,1),5);
   ctx.restore();
  }}
});


// ####################################################################################################
// ##### MISSIONE 11 · AFFONDA LA FLOTTA
// ##### Affonda la flotta: affonda le FLEET_N navi da guerra nemiche ancorate al largo (MD.fleet).
// ####################################################################################################
// nave della flotta (missione 11): scafo come le navi della mappa; null se non sta tutta in acqua libera (niente moli, rocce, altre navi entro 30 px)
function fleetFit(x,y,L,B,a){const g=bgeomEx('ship',L,B),hp=Math.round(SPEC.ship*Math.max(.7,Math.sqrt(L*B)/110)),
  o={t:'b',ty:'ship',shape:'ship',x,y,w:L,h:B,a,c:Math.cos(a),s:Math.sin(a),r:g.r,pr:g.pr,an:g.an,hp,m:hp,sp:1,pal:0,v:2},pts=[];
 for(let u=-L/2;u<=L/2;u+=Math.max(18,L/14))for(let v=-B/2;v<=B/2;v+=Math.max(14,B/5)){if(bsd(o,u,v)>2)continue;const w=toWorld(o,u,v);if(w[0]<40||w[1]<40||w[0]>WW-40||w[1]>WH-40||!inWater(w[0],w[1],0))return null;pts.push(w)}
 for(const b of qobs(x,y,o.r+120,[])){if(b.t=='t'||b.dead)continue;for(const w of pts){const l=toLocal(b,w[0],w[1]);if(bsd(b,l[0],l[1])<30)return null}}
 return o}
misDef(11,{
 name:'Affonda la flotta',
 story:"Tre navi da guerra nemiche sono ancorate al largo della costa: cannoneggiano le nostre posizioni e coprono gli sbarchi nemici. Il comando vuole che quelle navi vadano a parcheggiarsi sul fondo del mare. Attraversa il settore, raggiungi la costa e affonda tutte e tre le navi: quando lo scafo sarà pieno di buchi vedremo quanto bene nuotano i marinai nemici... o se respirano sott'acqua.",
 camp:{b:'Tre navi da guerra di {cmd} sono ancorate al largo della costa: bombardano le nostre posizioni e proteggono gli sbarchi dei rinforzi nemici. Raggiungi la costa e affondale tutte e tre. Mira agli scafi: le torrette smetteranno di spararci dal fondo del mare.',
  bv:[['noSup','Senza i rifornimenti via terra l’unica speranza è il mare, ma tre navi da guerra nemiche bloccano ogni avvicinamento alla costa. Affondale tutte e tre e le nostre scorte potranno finalmente arrivare via nave.'],
   ['vip','{Vip} ha decifrato la posizione della flotta nemica che ci bombarda: tre navi da guerra sono all’ancora al largo della costa, ferme a rifornirsi. Raggiungile e affondale tutte e tre prima che ripartano.'],
   ['pilots','I superstiti dello schianto hanno visto dove si nasconde la flotta che ha guidato l’antiaerea contro la loro dropship: sono tre navi da guerra al largo della costa. Mandale a fondo tutte e tre, sarà un duro colpo per il nemico.'],
   ['hard','Il nemico ha rinforzato le difese e ora porta i rinforzi via mare, protetti da tre navi da guerra che presidiano la costa. Affondale tutte e tre ed interromperemo il flusso di rinforzi nemici.']],
  w:'La flotta nemica ora riposa sul fondo del mare: il nemico ha perso il controllo della costa e i nostri rifornimenti ora possono arrivare via nave.',l:'La flotta nemica è ancora a galla e domina la costa: il nemico continua a sbarcare rinforzi e a cannoneggiare le nostre posizioni.',sw:['navy'],sl:['fleet'],
  fw:'L’ultima risorsa di {cmd} , e cioè la sua flotta, è ora sul fondo del mare. Senza navi il nemico è rimasto isolato e circondato, senza rinforzi, munizioni e speranza. Si arrendono senza condizioni, la guerra è vinta. Presto sorgerà un museo subacqueo nei relitti delle navi nemiche, per mostrare a tutti che fine fa chi si oppone al nostro dominio.',
  fl:'La flotta nemica domina ancora il mare: i rinforzi nemici sbarcano senza sosta e le nostre ultime difese sulla costa sono state spazzate via. La regione è persa, siamo circondati e l’unica via di fuga ormai era proprio il mare... ora resteremo qui ad affrontare le conseguenze del nostro fallimento.'},
 unlock:['wingman'],
 dir:{dev:({has})=>has('noSup')?4:has('hard')||has('pilots')?3:2,fin:({has})=>1+(has('noSup')?2:0)+(has('hard')?1:0)},
 th:[0],                                // serve il mare aperto: solo la città
 static(K){const{MR,mr,shuf}=K;const N=FLEET_N,pick=[],made=[],inSea=(x,y)=>seaU(x,y)>coastV(seaV(x,y))-10&&inWater(x,y,0),spread=(o,g)=>pick.every(p=>Math.hypot(o.x-p.x,o.y-p.y)>g);
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
   for(const o of pick){o.fleet=1;o.v=2}MD.fleet=pick;return true},   // affonda la flotta: 3 navi da guerra nemiche in mare

 spawn(S){const{put,squad}=S;
 {for(const o of MD.fleet){if(o.dead)continue;   // ogni nave: l'unità che ne comanda le torrette, un jet di scorta sopra e un presidio sulla costa più vicina
  const u=mkUnit(UK_SHIP,o.x,o.y,-1);u.ms=1;u.h=u.thr=u.thr2=u.thr3=o.a;shipLink(u);
  mkUnit(UK_JET,o.x,o.y,GID++).ms=1;
  const v=seaV(o.x,o.y),c=fromUV(coastV(v)-260,v);put(UK_TUR,c[0],c[1],0,220,-1);squad(c[0],c[1],2,60,240,false)}}},
 ships(){for(const o of MD.fleet||[])if(!o.dead){o.aiS=1;o.mil=0;o.v=2}},   // le navi nemiche sono quelle della flotta (niente nave nemica a caso)
 tick(dt,pl){const m=MS;
 {const N=MD.fleet.length,n=MD.fleet.filter(o=>o.dead).length;
  if(n>(m.fs|0)){m.fs=n;if(n<N)announce('Nave nemica affondata! ('+n+'/'+N+')')}
  if(n>=N)objDone('Flotta nemica affondata!')}},
 info(){const F=MD.fleet||[],n=F.filter(o=>o.dead).length,hp=F.reduce((a,o)=>a+(o.dead?0:Math.max(0,o.hp)),0),mh=F.reduce((a,o)=>a+o.m,0)||1;
   return{t:'Affonda la flotta nemica: colpisci gli scafi · navi affondate '+n+'/'+F.length,f:F.length?n/F.length:0,c:'#ff4a4a',h:hp/mh}},
 marks(o){
 {for(const s of MD.fleet||[])if(!s.dead)o.push({x:s.x,y:s.y,c:'#ff4a4a'})}   // navi ancora a galla
},
 drawWorld(){
 (MD.fleet||[]).forEach((o,i)=>{if(o.dead||!(o.va>.03))return;   // navi della flotta: nome e vita dello scafo (solo se la nave si vede)
  const y=o.y-(Math.abs(o.s)*o.w+Math.abs(o.c)*o.h)*.5-14;ctx.save();ctx.globalAlpha=o.va;ctx.textAlign='center';   // appena sopra lo scafo, qualunque sia la sua rotazione
  ctx.fillStyle='#333';ctx.fillRect(o.x-44,y,88,6);ctx.fillStyle='#ff4a4a';ctx.fillRect(o.x-44,y,88*clamp(o.hp/o.m,0,1),6);
  ctx.fillStyle='rgba(255,140,140,.95)';ctx.font='bold 14px system-ui,sans-serif';ctx.fillText('NAVE '+(i+1),o.x,y-6);ctx.restore()});}
});


// ####################################################################################################
// ##### MODELLO PER UNA NUOVA MISSIONE (commentato: non viene caricato)
// Per usarlo: copia il codice qui sotto (da misDef in poi) dopo l'ultima missione, togli il commento, cambia id (primo libero), testi e regole. La missione compare da sola nel menu della lobby, fra quelle estratte a caso, nel caricamento e nella campagna (se ha dir).
// Esempio completo e funzionante: "Demolizione", distruggi due edifici grandi lontani dalla partenza, poi raggiungi l'estrazione.
// Tutti i campi possibili sono descritti all'inizio di questo file; per idee più complesse guarda la missione esistente più simile.
// ####################################################################################################
/*
misDef(12,{
 name:'Demolizione',
 story:"Due edifici nemici ospitano i comandi del settore. Raggiungili, radili al suolo e torna al punto di estrazione.",   // schermata di caricamento
 camp:{b:'Due edifici del nemico coordinano le sue difese nel settore: radili al suolo.',w:'I comandi nemici sono macerie.',l:'I comandi nemici sono ancora in piedi.',sw:[],sl:[]},   // campagna: briefing, vittoria, sconfitta, flag
 dir:{dev:1},                          // peso nel regista della campagna durante lo sviluppo (niente open / fin: mai in apertura né come finale)
 need:()=>['g'],                       // la mappa deve avere almeno una città
 // MAPPA (dal seed, su tutti i client): sceglie i due edifici; false = mappa non adatta, il gioco ne crea un'altra
 static(K){const{fr,shuf}=K,pick=[];
  for(const o of shuf(fr.filter(o=>dSt(o)>OBJ_MIN&&o.w>=150&&o.h>=150))){if(pick.length>=2)break;if(pick.every(p=>Math.hypot(o.x-p.x,o.y-p.y)>900))pick.push(o)}
  if(pick.length<2)return false;for(const o of pick){o.pal=PAL_PLANT;o.hp=o.m=Math.round(o.hp*2)}MD.tg=pick;return true},
 // NEMICI INIZIALI (host): una torretta e una squadra attorno a ogni edificio
 spawn(S){const{put,squad}=S;for(const o of MD.tg){put(UK_TUR,o.x,o.y,o.r+110,o.r+230,-1);squad(o.x,o.y,2,o.r+90,o.r+220,false)}},
 // REGOLE (host, ogni fotogramma): obiettivo compiuto → objDone, poi l'estrazione la gestisce AGmis.js
 tick(dt,pl){if(MD.tg.every(o=>o.dead))objDone('Comandi nemici demoliti!')},
 // HUD: testo, barra e triangoli verso gli obiettivi
 info(){const n=MD.tg.filter(o=>o.dead).length;return{t:'Edifici demoliti '+n+'/'+MD.tg.length,f:n/MD.tg.length,c:'#ffb02e'}},
 marks(o){for(const t of MD.tg)if(!t.dead)o.push({x:t.x,y:t.y,c:'#ffb02e'})}
});
*/
