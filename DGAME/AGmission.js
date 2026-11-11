'use strict';
/* AIRGRUNT · AGmission.js — regole di gioco: caserme, 5 missioni, deathmatch, rinascita dei giocatori.
   La parte FISSA (edifici speciali, zone, percorsi) deriva dal seed e dai parametri della partita: host e client la ricavano uguale in missionStatic().
   Lo stato che cambia (convoglio, VIP, avamposti, punteggi) lo simula solo l'host (missionTick) e viaggia negli snapshot (msPack/msUnpack).
   Missioni (G.mt): 1 scorta convoglio, 2 estrazione VIP, 3 sabotaggio, 4 caccia al bersaglio d'élite, 5 conquista avamposto. G.mode 1 = deathmatch. */
let MD={blk:[],tg:[],z:[],wp:[]},MS={t:0,st:0,al:null},BAR=[];
const DM={sc:{},rq:[]};
const spawnAt=id=>baseXY(200+(id%5)*48,200+((id/5)|0)*48);   // le file di partenza seguono la rotazione della base
const dSt=o=>Math.hypot(o.x-START[0],o.y-START[1]);
const isTown=s=>s.k=='g'||s.k=='r'||s.k=='l';
allyList=()=>{if(G.mt==8)return(MS.vans||[]).filter(v=>v.on&&v.hp>0);if(G.mt==10)return(MS.vips||[]).filter(v=>v.on&&!v.saved&&v.hp>0);const a=MS.al;return a&&a.on&&a.hp>0?[a]:[]};   // missione 8: furgoni · missione 10: VIP recuperati
function plen(p){let L=0;for(let i=1;i<p.length;i++)L+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);return L}
function pathAt(s){const p=MD.pts,c=MD.cl;s=clamp(s,0,MD.len);let i=1;while(i<c.length-1&&c[i]<s)i++;const a=p[i-1],b=p[i],u=clamp((s-c[i-1])/((c[i]-c[i-1])||1),0,1);return{x:a[0]+(b[0]-a[0])*u,y:a[1]+(b[1]-a[1])*u,h:Math.atan2(b[1]-a[1],b[0]-a[0])}}
function wAt(s){const c=MD.cl;let i=1;while(i<c.length-1&&c[i]<s)i++;for(const g of MD.sg)if(i>=g.i0&&i<=g.i1)return g.w;return MD.sg[MD.sg.length-1].w}
function finish(v,txt){if(G.over)return;G.over=v;G.overMsg=txt;MS.st=v==2?1:2;if(NET.on&&NET.host)bcast({t:'over',v,m:txt})}
function announce(t){say(t);if(NET.on&&NET.host)bcast({t:'say',m:t})}

// fine obiettivo: non si vince subito. Fase 1 = raggiungere il punto di estrazione, fase 2 = arriva la dropship
function objDone(txt){if(G.over||MS.ex)return;MS.ex=1;MS.exMsg=txt;announce(txt+(G.mt==7?' Raggiungi la nave spaziale!':' Raggiungi il punto di estrazione!'))}
function extractBegin(){if(G.ext)return;G.ext=1;P.air=false;P.z=0;P.vx=P.vy=0;P.sp=0;if(G.mt==7)shipBegin();else dsExtract()}
function extractTick(dt){const m=MS,pl=plist();
 if(m.nk==1){m.nt-=dt;if(m.nt<=0){m.nt=0;nukeGo()}}                 // timer scaduto: esplode, i giocatori non in estrazione muoiono
 if(m.ex==1&&m.nk!=2){if(pl.length==1+Object.keys(others).length&&pl.every(q=>Math.hypot(q.x-EXT[0],q.y-EXT[1])<extR())){m.ex=2;announce(G.mt==7?'La nave spaziale sta per decollare!':'Dropship in arrivo!');extractBegin();if(m.nk==1)nukeGo()}}
 else if(m.ex==2&&!DS.on&&!SH.on&&(!m.nk||NK.t>=NK_WIN))finish(2,'Estrazione completata!')}

// ===== missione 6 (esplosione nucleare) e 7 (decollo della nave) =====
// NK e SH sono animazioni LOCALI: in rete passano solo m.ex, m.nk (0 niente, 1 conto alla rovescia, 2 esplosa) e m.nt (secondi) — vedi msPack
const NK={on:0,t:0,x:0,y:0,wiped:0,s1:0,s2:0},SH={on:0,t:0,o:null,x:0,y:0,a:0},SH_BOARD=1.2,SH_LIFT=1.6,SH_FLY=6.5;
const extR=()=>G.mt==7?SHIP_R:EXT_R;
// punto libero più vicino al centro del sito (a spirale) dove mettere la zona di cattura
function zoneAt(s){for(let r=0;r<=330;r+=30)for(let k=0,n=r?12:1;k<n;k++){const a=k*TAU/12,x=s.x+Math.cos(a)*r,y=s.y+Math.sin(a)*r;if(clearAt(x,y,70)&&!inWater(x,y,KOTH_R))return{x,y,r:KOTH_R,p:0}}return{x:s.x,y:s.y,r:KOTH_R,p:0}}
// sito catturato: parte il timer e compaiono nemici (dormienti) tra il sito e l'estrazione; vipTrap già li piazza lungo quella linea
function nukeArm(z){objDone('Sito nucleare conquistato! Detonazione tra '+NK_T+' secondi.');MS.nk=1;MS.nt=NK_T;vipTrap(z);vipTrap(z)}
function nukeGo(){if(MS.nk==2)return;MS.nk=2;nukeBegin(0)}
function nukeBegin(t0){const z=MD.z[0];NK.on=1;NK.t=t0||0;NK.x=z.x;NK.y=z.y;NK.wiped=NK.t>=NK_GROW?1:0;NK.s1=NK.t>0?1:0;NK.s2=NK.t>1?1:0;if(NK.wiped)nukeWipe()}
// distrugge all'istante ogni ostacolo distruttibile (senza passare da dirtyObs: ogni client lo fa da sé)
function nukeWipe(){for(const o of M.obs)if(!o.dead&&!o.ind){o.hp=0;o.dead=1}for(let i=0;i<CIV.n;i++)if(!CIV.d[i])CIV.d[i]=3;navBuild()}
function nukeTick(dt){if(!NK.on)return;NK.t+=dt;const t=NK.t;
 if(!NK.s1){NK.s1=1;sfx(SFX_LIST.nuke,1)}
 if(!NK.s2&&t>=1){NK.s2=1;sfx(SFX_LIST.crash,1)}                 // il crollo 1 secondo dopo il boom
 if(NK.wiped||t<NK_GROW)return;NK.wiped=1;nukeWipe();           // schermo ormai tutto bianco: la mappa viene spazzata via
 if(authority())for(const u of units){u.hp=0;u.dead=1;u.kb=-1}
 if(!G.ext){P.hp=0;for(const q of Object.values(others))q.hp=0;if(authority())finish(1,'Esplosione nucleare: missione fallita')}}   // chi non è in estrazione muore
function shipBegin(){const o=MD.ship;if(!o||SH.on)return;Object.assign(SH,{on:1,t:0,o,x:o.x,y:o.y,a:o.a});sfxAt(SFX_LIST.toAir,.9,o.x,o.y,0)}
function shipTick(dt){if(!SH.on)return;SH.t+=dt;const o=SH.o,t=SH.t;
 if(t<SH_LIFT+3&&Math.random()<.9){const a=Math.random()*TAU,d=60+Math.random()*180;fxSpawn(o.x+Math.cos(a)*d,o.y+Math.sin(a)*d,'#c9b99a',3,true,50)}   // polvere dei motori
 if(t>=SH_LIFT&&!o.dead){o.dead=1;navRefresh(o);sfxAt(SFX_LIST.toAir,1,o.x,o.y,0)}   // lo scafo sparisce (non collide più) e da qui lo disegna drawShip
 if(t>=SH_LIFT+SH_FLY)SH.on=0}

const regione=(x,y)=>{const v=y<WH/3?'nord':y>WH*2/3?'sud':'',h=x<SEA/3?'ovest':x>SEA*2/3?'est':'';return v&&h?v+'-'+h:v||h||'centro'};

// ===== parte fissa =====
function missionStatic(){
 const sites=M.sites,blds=M.blds;let MR=rng(M.seed+7919);const mr=(a,b)=>a+MR()*(b-a),shuf=a=>a.map(o=>[MR(),o]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]);
 MD={blk:[],tg:[],z:[],wp:[]};BAR=[];G.mt=0;
 if(G.mode==1){return}
 // caserme: la difficoltà ne decide il numero; stanno nei recinti murati (poi negli edifici grandi lontani dalla partenza)
 const nb=diffBars(G.diff),mkBar=o=>{o.bar=1;o.pal=PAL_BAR;o.hp=o.m=Math.round(o.hp*BAR_HP);o.barTimer=BAR_T;BAR.push(o)},cands=shuf(M.comp.filter(c=>c.bar).map(c=>c.bar));
 for(const o of cands){if(BAR.length>=nb)break;if(BAR.every(b=>Math.hypot(o.x-b.x,o.y-b.y)>1200))mkBar(o)}
 for(const o of cands){if(BAR.length>=nb)break;if(!o.bar)mkBar(o)}
 for(const o of shuf(blds.filter(o=>!o.bar&&dSt(o)>SAFE_R&&o.w>=150&&o.h>=150&&!o.is&&o.ty=='house'))){if(BAR.length>=nb)break;if(BAR.every(b=>Math.hypot(o.x-b.x,o.y-b.y)>1600))mkBar(o)}
 const fr=blds.filter(o=>!o.bar&&o.ty=='house'),towns=sites.filter(s=>isTown(s)&&dSt(s)>2000),sel=MR();
 MD.wp=towns.map(s=>[s.x,s.y]);
 const mkBlk=(x,y,a,w,h,hp)=>{const g=bgeom('rect',w,h),o={t:'b',ty:'house',shape:'rect',x,y,w,h,a,c:Math.cos(a),s:Math.sin(a),r:g.r,pr:g.pr,an:g.an,hp,m:hp,pal:PAL_BLK,rb:1,dec:[0,0],rf:0};o.id=M.obs.length;M.obs.push(o);gAdd(o);return o};
 const B={
  1:()=>{const E=M.roads.filter(r=>r.lk&&sites.includes(r.lk[0])&&sites.includes(r.lk[1])&&r.lk[0].k!='c'&&r.lk[1].k!='c'),cands=[];
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
    for(let tr=0;tr<200;tr++){const a=MR()*TAU,d=tr<40?0:mr(0,380),x=s.x+Math.cos(a)*d,y=s.y+Math.sin(a)*d;
     if(dSt({x,y})>OBJ_MIN&&!inWater(x,y,KOTH_R+40)&&M.obs.every(o=>Math.hypot(x-o.x,y-o.y)>o.r+KOTH_R*.6)&&!M.bridges.some(b=>Math.hypot(x-b.x,y-b.y)<b.L/2+KOTH_R)){MD.z.push({x,y,r:KOTH_R,p:0});break}}}
   return MD.z.length>=2},
  6:()=>{const c=shuf(sites.filter(q=>(q.k=='n'||q.k=='k')&&dSt(q)>OBJ_MIN));if(!c.length)return false;MD.z=[zoneAt(c[0])];MD.sk=c[0].k;return true},   // un solo sito nucleare a caso: silos ICBM ('n') o centrale ('k')
  7:()=>{const pl=sites.find(q=>q.k=='k'&&dSt(q)>OBJ_MIN)||sites.find(q=>q.k=='i'&&dSt(q)>OBJ_MIN)||sites.find(q=>q.k=='c'&&dSt(q)>OBJ_MIN),yd=sites.find(q=>q.k=='y'&&dSt(q)>OBJ_MIN),sh=M.obs.find(o=>o.shape=='cruiser');
   if(!pl||!yd||!sh)return false;MD.z=[zoneAt(pl),zoneAt(yd)];MD.ship=sh;EXT[0]=sh.x;EXT[1]=sh.y;return true},
  8:()=>{const c=shuf(fr.filter(o=>dSt(o)>OBJ_MIN&&o.w>=150&&o.h>=150&&!o.is&&!o.tw&&o.x>700&&o.x<SEA-700&&o.y>700&&o.y<WH-700&&!inWater(o.x,o.y,o.r)));if(!c.length)return false;   // edificio del meeting: grande, lontano dalla partenza e dai bordi
   const o=c[0];o.vipB=1;o.pal=PAL_VIP;o.hp=o.m=Math.round(o.hp*SEC_BHP);MD.mb=o;MD.bt={x:o.x,y:o.y,hp:o.hp,z:0,rr:o.r,bld:1};   // bt = bersaglio per l'AI nemica
   MD.z=[{x:o.x,y:o.y,r:o.r+130,p:0}];return true},   // zona di cattura attorno all'edificio
  9:()=>{const pool=fr.filter(o=>dSt(o)>OBJ_MIN&&o.w>=150&&o.h>=150&&!o.is&&!o.tw&&o.x>900&&o.x<SEA-900&&o.y>900&&o.y<WH-900&&!inWater(o.x,o.y,o.r)).sort((p,q)=>q.w*q.h-p.w*p.h).slice(0,8);   // i più grandi
   for(const o of shuf(pool)){const a0=MR()*TAU,zs=[];
    for(let i=0;i<4;i++){const a=a0+i*TAU/4;let ok=false;   // un punto per quadrante: la torretta sta al centro della sua zona
     for(let d=o.r+TD_ZONE_R+40;d<=o.r+TD_TUR_D+380&&!ok;d+=25)for(const da of[0,.2,-.2,.4,-.4,.6,-.6]){const x=o.x+Math.cos(a+da)*d,y=o.y+Math.sin(a+da)*d;   // dal più vicino al più lontano, con piccole deviazioni d'angolo
      if(x>150&&y>150&&x<SEA-250&&y<WH-150&&clearAt(x,y,TD_ZONE_R*.6)&&!inWater(x,y,TD_ZONE_R*.6+30)&&!M.bridges.some(b=>Math.hypot(x-b.x,y-b.y)<b.L/2+TD_ZONE_R)&&zs.every(z=>Math.hypot(x-z.x,y-z.y)>TD_ZONE_R*2+60)){zs.push({x,y,r:TD_ZONE_R,p:0,on:0});ok=true;break}}}
    if(zs.length<4)continue;   // non c'è spazio per tutte e 4: si prova un altro edificio
    o.vipB=1;o.pal=PAL_VIP;o.hp=o.m=Math.round(o.hp*TD_BHP);MD.mb=o;MD.bt={x:o.x,y:o.y,hp:o.hp,z:0,rr:o.r,bld:1};MD.z=zs;return true}
   return false},   // difesa della base: edificio centrale + 4 zone delle torrette
  10:()=>{const c=shuf(sites.filter(q=>['g','r','l','i','c','v'].includes(q.k)&&dSt(q)>OBJ_MIN));if(!c.length)return false;
   const CR=180;                         // raggio dell'area di schianto (in MD.crash.r)
   const CRm=CR+20;                      // margine minimo dal bordo mappa perché il cerchio ci stia tutto
   let best=null;
   for(const s of c){for(let tr=0;tr<200&&!best;tr++){const a=MR()*TAU,d=tr<40?0:mr(200,800),x=s.x+Math.cos(a)*d,y=s.y+Math.sin(a)*d;
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
   return true}};   // ricerca e recupero: relitto da trovare + 3 VIP feriti da scortare
 const first=G.sel<0?0:G.sel>0?G.sel:1+(sel*10|0),order=G.sel<0?[]:[first,...[1,2,3,4,5,6,7,8,9,10].filter(x=>x!=first)];
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
   if(far(x,y)&&x>60&&y>60&&x<SEA-100&&y<WH-60&&clearAt(x,y,k==0||k==6?30:22)){const t=mkUnit(k,x,y,g);t.ms=1;return t}}return null};
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
  for(let tr=0;tr<800&&!h;tr++){const x=rnd(500,SEA-300),y=rnd(300,WH-300);if(dSt({x,y})>OBJ_MIN&&clearAt(x,y,30)){h=mkUnit(6,x,y,GID++);h.ms=1}}
  if(h){h.ar=8;h.wi=(w0+1)%MD.wp.length;MS.hv=h;MS.lx=h.x;MS.ly=h.y;MS.hh=h.hp;squad(h.x,h.y,2,90,170,false)}}
 else if(G.mt==8)secSpawn()
 else if(G.mt==9)tdSpawn()
 else if(G.mt==10){for(const p of MD.vipsPos){MS.vips.push({id:-20-MS.vips.length,n:MS.vips.length+1,al:1,z:0,x:p.x,y:p.y,h:p.h,vx:0,vy:0,hp:VIP_HP,mhp:VIP_HP,rr:16,on:0,saved:0,dead:0,rv:0,st:0,burn:0})}}}

function getRandomEnemyType(){
 const r=Math.random();
 if(r<.55)return 1;          // 55% - Mech standard
 if(r<.65)return 3;          // 10% - Kamikaze
 if(r<.75)return 2;          // 10% - Jet volanti
 if(r<.90)return 4;          // 15% - Cecchini
 return G.diff>=4?5:1;       // 10% - Carro pesante (se difficoltà >= 4) o Mech
}

function kothWave(z){const g=GID++;let c=0;
 for(let tr=0;c<KOTH_N&&tr<200;tr++){const a=Math.random()*TAU,d=rnd(750,1050),x=z.x+Math.cos(a)*d,y=z.y+Math.sin(a)*d,k=getRandomEnemyType();
  if(x>60&&y>60&&x<SEA-100&&y<WH-60&&((k==2||k==3)||clearAt(x,y,k==5?40:22))){mkUnit(k,x,y,g).ms=1;c++}}
 announce('Ondata di nemici in arrivo!')}
 
// ===== missione 8: guardia di sicurezza =====
// Fase 1: raggiungere e presidiare l'edificio del meeting (nessun nemico). Fase 2: ogni SEC_GAP s parte un ciclo: SEC_WAVES ondate nemiche a SEC_SPAWN_D dall'edificio,
// poi (a SEC_LEAD s) un furgone blindato con un VIP che guida fino all'edificio (se lo tocca, il VIP è salvo). Le guardie alleate (units con sec=1) non rinascono.
const secFoes=()=>units.filter(u=>!u.dead&&!u.sec&&u.k<UK_HUM);
function secSpawn(){units.length=0;PQ.length=0;G.cap=0;secNavBuild();   // niente nemici all'inizio (e niente caserme: vedi missionTick)
 const b=MD.mb,g=GID++,kinds=[1,1,1,4,5,0,0],d1=Math.max(SEC_ALLY_D,b.r+120);
 for(let i=0;i<SEC_ALLY_N;i++){const k=kinds[i%kinds.length];
  for(let tr=0;tr<250;tr++){const a=Math.random()*TAU,d=rnd(b.r+50,d1),x=b.x+Math.cos(a)*d,y=b.y+Math.sin(a)*d;
   if(x>60&&y>60&&x<SEA-100&&y<WH-60&&clearAt(x,y,k==5?40:k==0?30:22)){const u=mkUnit(k,x,y,g);u.sec=1;u.ms=1;u.hp=u.mhp=Math.round(u.hp*1.3);u.ar=(k==0?0:6);break}}}}
// il punto è libero e da lì (senza alberi/rocce di mezzo) si arriva a piedi fino all'edificio? (evita nemici incastrati subito dopo la nascita)
function secReach(x,y){if(NAVV[ncell(x,y)])return false;const p=secPath(x,y),l=p[p.length-1],b=MD.mb;return Math.hypot(l[0]-b.x,l[1]-b.y)<b.r+350}
// nemico d'assalto incastrato da troppo tempo (terreno, rocce): riappare più vicino all'edificio su un punto libero
function secUnstick(u){const b=MD.mb;for(let tr=0;tr<40;tr++){const a=Math.atan2(u.y-b.y,u.x-b.x)+rnd(-.6,.6),d=rnd(Math.max(b.r+350,SEC_SPAWN_D*.45),SEC_SPAWN_D*.75),x=b.x+Math.cos(a)*d,y=b.y+Math.sin(a)*d;
  if(x>60&&y>60&&x<SEA-100&&y<WH-60&&clearAt(x,y,u.k==5?40:22)&&secReach(x,y)){u.x=x;u.y=y;u.stk=0;u.rp=0;u.bo=null;u.path=null;u.pt=0;fxSpawn(x,y,'#ff9a3a',8,true);return}}}
function secWave(){const b=MD.mb,g=GID++,a0=Math.random()*TAU;let c=0;   // ogni ondata nasce in un punto casuale a SEC_SPAWN_D dal meeting
 for(let tr=0;c<SEC_WAVE_N&&tr<300;tr++){const a=a0+rnd(-.5,.5)*(tr>100?4:1),x=b.x+Math.cos(a)*SEC_SPAWN_D+rnd(-70,70),y=b.y+Math.sin(a)*SEC_SPAWN_D+rnd(-70,70),k=getRandomEnemyType();
  if(x>60&&y>60&&x<SEA-100&&y<WH-60&&((k==2||k==3)||(clearAt(x,y,k==5?40:22)&&secReach(x,y)))){const u=mkUnit(k,x,y,g);u.ms=1;u.aw=1;u.st=2;u.rt=0;u.lkx=b.x;u.lky=b.y;u.lkt=LOST_T;c++;fxSpawn(x,y,'#ff9a3a',10,true)}}
 if(c)announce('Ondata di nemici in arrivo!')}
function secVan(){const b=MD.mb;let best=null;
 for(let tr=0;tr<24&&!best;tr++){const a=Math.random()*TAU,x=b.x+Math.cos(a)*SEC_VAN_D,y=b.y+Math.sin(a)*SEC_VAN_D;
  if(x<150||y<150||x>SEA-250||y>WH-150||dSt({x,y})<600||!clearAt(x,y,30))continue;
  if(NAVV[ncell(x,y)])continue;const p=secPath(x,y),l=p[p.length-1];if(Math.hypot(l[0]-b.x,l[1]-b.y)<b.r+280)best={x,y,p}}   // si parte solo da punti da cui un percorso arriva fino all'edificio
 if(!best){const a=Math.random()*TAU;best={x:clamp(b.x+Math.cos(a)*SEC_VAN_D*.6,150,SEA-250),y:clamp(b.y+Math.sin(a)*SEC_VAN_D*.6,150,WH-150),p:null}}
 MS.dp++;MS.vans.push({id:-10-MS.dp,n:MS.dp,al:1,van:1,z:0,x:best.x,y:best.y,vx:0,vy:0,hp:SEC_VAN_HP,mhp:SEC_VAN_HP,drG:3,rr:26,on:1,h:Math.atan2(b.y-best.y,b.x-best.x),path:best.p,pi:0,pt:best.p?3:0});
 announce('VIP '+MS.dp+'/'+SEC_VIP_N+' in arrivo: proteggi il furgone!')}
let NAVV=null;   // griglia di navigazione dei furgoni: come quella dei nemici ma con in più alberi e rocce (che i mech scavalcano, i furgoni no)
function secNavBuild(){NAVV=Uint8Array.from(nav);for(const o of M.obs){if(o.dead||!(o.t=='t'||o.ty=='rock'))continue;const rr=o.r+34,x0=clamp((o.x-rr)/NC|0,0,NW-1),x1=clamp((o.x+rr)/NC|0,0,NW-1),y0=clamp((o.y-rr)/NC|0,0,NH-1),y1=clamp((o.y+rr)/NC|0,0,NH-1);
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(Math.hypot(x*NC+NC/2-o.x,y*NC+NC/2-o.y)<rr+NC*.35)NAVV[y*NW+x]=1}}
function secPath(x,y){const b=MD.mb,o=nav;nav=NAVV||nav;try{return navPath(x,y,b.x,b.y)}finally{nav=o}}
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
  if(x>60&&y>60&&x<SEA-100&&y<WH-60&&((k==2||k==3)||clearAt(x,y,k==5?40:22))){const u=mkUnit(k,x,y,g);u.ms=1;u.aw=1;u.st=2;u.rt=0;u.lkx=b.x;u.lky=b.y;u.lkt=LOST_T;c++;fxSpawn(x,y,'#ff9a3a',10,true)}}
 // fallback: se restano nemici da piazzare (spawn troppo bloccato da alberi/rocce/edifici), piazzali in un anello più stretto attorno all'edificio
 for(let tr=0;c<n&&tr<400;tr++){const a=Math.random()*TAU,d=rnd(b.r+120,b.r+420),x=b.x+Math.cos(a)*d,y=b.y+Math.sin(a)*d,k=getRandomEnemyType();
  if(x>60&&y>60&&x<SEA-100&&y<WH-60&&(k==2||k==3||clearAt(x,y,18))){const u=mkUnit(k,x,y,g);u.ms=1;u.aw=1;u.st=2;u.rt=0;u.lkx=b.x;u.lky=b.y;u.lkt=LOST_T;c++;fxSpawn(x,y,'#ff9a3a',10,true)}}
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
 const ok=(x,y)=>x>60&&y>60&&x<SEA-100&&y<WH-60&&Math.hypot(x-START[0],y-START[1])>900&&Math.hypot(x-al.x,y-al.y)>TRAP_MIN&&!pl.some(q=>Math.hypot(q.x-x,q.y-y)<TRAP_MIN);
 const cl=[0,1].map(i=>{for(let tr=0;tr<200;tr++){const t=rnd(i?.5:.2,i?.85:.5)*L,s=rnd(-260,260),x=al.x+ux*t-uy*s,y=al.y+uy*t+ux*s;if(ok(x,y)&&clearAt(x,y,30))return{x,y,g:GID++}}return null}).filter(Boolean);
 for(let c=0,tr=0;c<n&&cl.length&&tr<400;tr++){const q=cl[c%cl.length],a=Math.random()*TAU,d=rnd(30,110),x=q.x+Math.cos(a)*d,y=q.y+Math.sin(a)*d;
  if(!ok(x,y)||!clearAt(x,y,30))continue;
  const r=Math.random(),u=mkUnit(r<.7?1:r<.88?4:5,x,y,q.g);u.ms=1;u.slp=1;c++}}
function missionTick(dt){
 if(G.over)return;
 const m=MS,al=m.al,pl=plist();
 for(const o of BAR){if(o.dead||G.mt>=8)continue;o.barTimer-=dt;if(o.barTimer>0)continue;o.barTimer=BAR_T; // caserme: nuovi nemici a tempo, fino al numero iniziale
 const room=Math.min(BAR_SPAWN,G.cap-units.reduce((n,t)=>n+(t.ms?0:1),0));if(room<=0)continue;const g=GID++;
 for(let i=0,tr=0;i<room&&tr<80;tr++){const a=Math.random()*TAU,d=o.r+rnd(50,110),x=o.x+Math.cos(a)*d,y=o.y+Math.sin(a)*d,k=getRandomEnemyType();
  if(x>60&&y>60&&x<SEA-100&&y<WH-60&&((k==2||k==3)||clearAt(x,y,k==5?40:22))){mkUnit(k,x,y,g);i++;fxSpawn(x,y,'#ff9a3a',10,true)}}}
 if(m.ex){extractTick(dt);return}                                    // obiettivo già compiuto: ora conta solo l'estrazione
 if(G.mt==0){if(!units.some(u=>u.k<UK_HUM)&&BAR.every(o=>o.dead))objDone('Nemici e caserme distrutti.');return}
 if(G.mt==1){
  if(!al.go){if(pl.some(q=>Math.hypot(q.x-al.x,q.y-al.y)<450)){al.go=1;al.on=1;announce('Il convoglio è in marcia: proteggilo!')}}
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
   if(gr.length){const T=gr.reduce((a,c)=>Math.hypot(a.x-al.x,a.y-al.y)<Math.hypot(c.x-al.x,c.y-al.y)?a:c),dx=T.x-al.x,dy=T.y-al.y,d=Math.hypot(dx,dy)||1;
    if(d>110){const sp=VIP_V*(inWater(al.x,al.y,0)&&!onBridge(al.x,al.y)?WATER_SLOW:1);al.vx=dx/d*sp;al.vy=dy/d*sp;al.x+=al.vx*dt;al.y+=al.vy*dt;al.h=Math.atan2(dy,dx);push(al,14,1)}}
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
    if(gr.length){
     const T=gr.reduce((a,c)=>Math.hypot(a.x-v.x,a.y-v.y)<Math.hypot(c.x-v.x,c.y-v.y)?a:c);
     // Sistema missione 2: insegui il player più vicino, fermati a una soglia.
     // Il punto di inseguimento sta DIETRO il player di MELEE_R+20 (mai sotto il range mischia)
     // e ha un offset laterale di 40 px distribuito (-40, 0, +40 per VIP 1, 2, 3).
     const dx=T.x-v.x,dy=T.y-v.y,d=Math.hypot(dx,dy)||1;
     const perpX=-dy/d, perpY=dx/d, side=v.n-2, FD=MELEE_R+20;
     const tx=T.x-dx/d*FD+perpX*40*side, ty=T.y-dy/d*FD+perpY*40*side;
     const tdx=tx-v.x,tdy=ty-v.y,td=Math.hypot(tdx,tdy)||1;
     if(td>6){
      const sp=VIP_V*(inWater(v.x,v.y,0)&&!onBridge(v.x,v.y)?WATER_SLOW:1);
      const step=Math.min(td,sp*dt);
      v.vx=tdx/td*sp;v.vy=tdy/td*sp;
      v.x+=tdx/td*step;v.y+=tdy/td*step;
      v.h=Math.atan2(tdy,tdx);
      push(v,v.rr-2,1);
     }else v.h=Math.atan2(T.y-v.y,T.x-v.x);
     // sicurezza: mai sotto MELEE_R+5 dal player (mai dentro il raggio della mischia)
     const ndx=v.x-T.x,ndy=v.y-T.y,nd=Math.hypot(ndx,ndy)||1,minD=MELEE_R+5;
     if(nd<minD){const k=Math.min(dt*VIP_V*1.5,(minD-nd))/(nd||1);v.x+=ndx*k;v.y+=ndy*k}
    }
    if(Math.hypot(v.x-EXT[0],v.y-EXT[1])<EXT_R){v.saved=1;v.on=0;fxSpawn(v.x,v.y,'#5ee0c0',18,true,45);sfxAt(SFX_LIST.toGrunt,.8,v.x,v.y,0);announce('VIP '+v.n+' in salvo! ('+MS.vips.filter(z=>z.saved).length+'/3)')}
   }
  }
  // separazione tra VIP recuperati (40 px minimo)
  for(let i=0;i<MS.vips.length;i++){
   const a=MS.vips[i];if(!a.on||a.saved||a.dead)continue;
   for(let j=i+1;j<MS.vips.length;j++){
    const b=MS.vips[j];if(!b.on||b.saved||b.dead)continue;
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,min=40;
    if(d<min){const k=(min-d)/d*.5;a.x-=dx*k;a.y-=dy*k;b.x+=dx*k;b.y+=dy*k}
   }
  }
  // vittoria: almeno 2 VIP su 3 in salvo
  if(MS.vips.length&&MS.vips.filter(v=>v.saved).length>=2)objDone('Almeno 2 VIP in salvo: missione riuscita!')}
 else if(G.mt>=5){const z=MD.z[m.cz];
  if(z){const inside=pl.some(q=>!q.z&&Math.hypot(q.x-z.x,q.y-z.y)<z.r);z.p=clamp(z.p+(inside?dt/KOTH_T:-dt/KOTH_T*.5),0,1);
   if(inside){m.wt-=dt;if(m.wt<=0){m.wt=KOTH_WAVE;kothWave(z)}}
   if(z.p>=1){m.cz++;m.wt=3;
    if(m.cz>=MD.z.length){if(G.mt==6)nukeArm(z);else objDone(G.mt==7?'Cantiere conquistato!':'Avamposti conquistati!')}
    else announce(G.mt==7?'Centrale energetica conquistata! Raggiungi il cantiere spaziale':'Avamposto conquistato! Raggiungi il prossimo')}}}}
// stato della missione per i client (solo numeri)
function msPack(){const m=MS,a=m.al,z=MD.z&&MD.z[m.cz];
 return[m.st,a?Math.round(a.x):0,a?Math.round(a.y):0,a?Math.max(0,Math.ceil(a.hp)):0,a?(G.mt==1?Math.round(a.s):a.st|0):0,a?(a.hold|0):0,a?(G.mt==1?(a.go?1:0):Math.round(m.rc*10)/10):0,m.cz|0,z?Math.round(z.p*100)/100:0,m.sp>0?1:0,Math.round(m.lx),Math.round(m.ly),Math.max(0,Math.ceil(m.hh)),a?Math.round((a.h||0)*100)/100:0,m.ex|0,m.nk|0,Math.round((m.nk==2?NK.t:m.nt||0)*10)/10].concat(G.mt==8?[m.sf|0,m.ls|0,m.dp|0,m.cap|0,m.wst|0,Math.round(m.ct*10)/10,...m.vans.flatMap(v=>[v.n,Math.round(v.x),Math.round(v.y),Math.max(0,Math.ceil(v.hp)),Math.round((v.h||0)*100)/100])]:[]).concat(G.mt==9?[m.ta|0,Math.round(m.tt),m.tn|0,...MD.z.flatMap(z=>[Math.round(z.p*100)/100,z.on|0])]:[])
 .concat(G.mt==10?[(MD.crash&&MD.crash.seen?1:0),...(m.vips||[]).flatMap(v=>[Math.round(v.x),Math.round(v.y),Math.max(0,Math.ceil(v.hp)),v.on|0,v.saved|0,v.dead|0,Math.round((v.rv||0)*100)/100,Math.round((v.h||0)*100)/100])]:[])}
function msUnpack(a){const m=MS,al=m.al;m.st=a[0];
 if(al){al.tx=a[1];al.ty=a[2];al.hp=a[3];al.hold=a[5];al.h=a[13];if(G.mt==1){al.s=a[4];al.go=a[6];al.on=a[6]}else{al.st=a[4];al.on=a[4];m.rc=a[6]}}
 m.cz=a[7];if(MD.z)MD.z.forEach((z,i)=>z.p=i<m.cz?1:i==m.cz?a[8]:0);m.sp=a[9];m.lx=a[10];m.ly=a[11];m.hh=a[12];m.ex=a[14]|0;if(m.ex==2)extractBegin();
 m.nk=a[15]|0;if(m.nk==1)m.nt=+a[16]||0;else if(m.nk==2&&!NK.on)nukeBegin(+a[16]||0)
 if(G.mt==8){m.sf=a[17]|0;m.ls=a[18]|0;m.dp=a[19]|0;m.cap=a[20]|0;m.wst=a[21]|0;m.ct=+a[22]||0;const keep=[];   // furgoni dei VIP: ricreati/aggiornati dallo snapshot
  for(let i=23;i+4<a.length;i+=5){const n=a[i];let v=m.vans.find(q=>q.n===n);if(!v){v={id:-10-n,n,al:1,van:1,z:0,x:a[i+1],y:a[i+2],vx:0,vy:0,mhp:SEC_VAN_HP,rr:26,on:1,h:a[i+4]};m.vans.push(v)}v.tx=a[i+1];v.ty=a[i+2];v.hp=a[i+3];v.h=a[i+4];keep.push(v)}
  m.vans=keep}   // chi entra a esplosione in corso parte dal punto giusto
 if(G.mt==9){m.ta=a[17]|0;m.tt=+a[18]||0;const tn=a[19]|0;if(tn&&!m.tn)tdNukeBegin(0);m.tn=tn;
  MD.z.forEach((z,i)=>{z.p=+a[20+i*2]||0;z.on=a[21+i*2]|0})}   // zone delle torrette: avanzamento e stato
 if(G.mt==10){if(MD.crash)MD.crash.seen=a[17]|0;if(!m.vips)m.vips=[];
  for(let i=0;i<3;i++){const b=18+i*8;if(b+7>=a.length)break;
   let v=m.vips[i];if(!v){v={id:-20-i,n:i+1,al:1,z:0,x:a[b],y:a[b+1],tx:a[b],ty:a[b+1],rr:16,mhp:VIP_HP,burn:0,dead:0};m.vips.push(v)}
   const wasDead=v.dead|0;
   v.tx=a[b];v.ty=a[b+1];v.hp=a[b+2];v.on=a[b+3]|0;v.saved=a[b+4]|0;v.dead=a[b+5]|0;v.rv=+a[b+6]||0;v.h=+a[b+7]||0;
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
  default:return{t:'Distruggi tutti i nemici e le caserme',f:-1}}}
function missionMarks(){const m=MS,al=m.al,o=[];
 if(m.ex){if(m.ex==1)o.push({x:EXT[0],y:EXT[1],c:'#5ee0c0'});return o}
 if(G.mt==1&&al)o.push({x:al.x,y:al.y,c:'#4aa3ff'});
 else if(G.mt==2&&al)o.push(al.st?{x:EXT[0],y:EXT[1],c:'#5ee0c0'}:{x:MD.vb.x,y:MD.vb.y,c:'#5ee0c0'});
 else if(G.mt==3){for(const t of MD.tg)if(!t.dead)o.push({x:t.x,y:t.y,c:'#ffb02e'})}
 else if(G.mt==4){if(m.sp>0)o.push({x:m.lx,y:m.ly,c:'#ff4a4a'})}
 else if(G.mt==8){if(!m.cap){const z=MD.z[0];o.push({x:z.x,y:z.y,c:'#ffd23f'})}else{o.push({x:MD.mb.x,y:MD.mb.y,c:'#5ee0c0'});for(const v of m.vans)o.push({x:v.x,y:v.y,c:'#4aa3ff'});
   if(m.wst)for(const u of units.filter(u=>!u.sec&&u.k<UK_HUM).sort((p,q)=>Math.hypot(p.x-P.x,p.y-P.y)-Math.hypot(q.x-P.x,q.y-P.y)).slice(0,4))o.push({x:u.x,y:u.y,c:'#ff4a4a'})}}   // finale: i 4 nemici più vicini sono segnalati
 else if(G.mt==9){if(!m.ta)o.push({x:MD.mb.x,y:MD.mb.y,c:'#5ee0c0'});for(const z of MD.z)if(z.on)o.push({x:z.x,y:z.y,c:'#ff4a4a'})}   // prima la base, poi le torrette da ripristinare
 else if(G.mt==10){const n=MS.vips||[];
   if(MD.crash.seen)for(const v of n)if(!v.saved&&!v.dead&&!v.on&&v.hp>0)o.push({x:v.x,y:v.y,c:'#5ee0c0'});
   if(n.some(v=>v.on&&!v.saved&&!v.dead)||n.some(v=>v.saved))o.push({x:EXT[0],y:EXT[1],c:'#5ee0c0'});
 }
 else if(G.mt>=5){const z=MD.z[m.cz];if(z)o.push({x:z.x,y:z.y,c:'#ffd23f'})}
 else for(const b of BAR)if(!b.dead)o.push({x:b.x,y:b.y,c:'#ff5a4a'});
 return o}

// ===== deathmatch =====
const dmKey=id=>{if(id==null||id<0)return null;if(id<1000)return'p'+id;const u=units.find(v=>v.id===id);return u&&u.dm?'b'+u.bi:null};
function dmEnsure(key,name){return DM.sc[key]||(DM.sc[key]={n:name,k:0,d:0})}
function dmCredit(killer,vkey,vname){if(G.mode!=1)return;const v=dmEnsure(vkey,vname);v.d++;const kk=dmKey(killer);
 if(kk&&kk!==vkey){const s=DM.sc[kk]||dmEnsure(kk,kk[0]=='p'?(killer==NET.id?P.name:(others[killer]&&others[killer].name)||'Pilota'):'BOT');s.k++;
  if(s.k>=DM_LIMIT&&!G.over){const me=dmKey(NET.id);finish(kk===me?2:1,s.n+' vince il deathmatch ('+s.k+' uccisioni)')}}}
function dmPoint(){ // punto di rinascita più lontano da tutti, tra alcuni a caso
 const all=plist().concat(units);let best=M.dm[0],bd=-1;
 for(let i=0;i<6;i++){const p=M.dm[Math.random()*M.dm.length|0],d=all.reduce((m,q)=>Math.min(m,Math.hypot(q.x-p[0],q.y-p[1])),1e9);if(d>bd){bd=d;best=p}}
 return best}
function dmInit(){DM.sc={};DM.rq=[];dmEnsure('p'+NET.id,P.name);populateDM();units.forEach(u=>{u.bi=+u.name.slice(4);dmEnsure('b'+u.bi,u.name)})}
function dmTick(dt){for(let i=DM.rq.length-1;i>=0;i--){const r=DM.rq[i];r.t-=dt;if(r.t>0)continue;DM.rq.splice(i,1);const p=dmPoint(),u=mkUnit(1,p[0],p[1],-1);u.name=r.name;u.bi=r.bi;u.ci=(Math.random()*COLS.length)|0;u.dm=1;botLoadout(u);fxSpawn(p[0],p[1],'#ff9a3a',10,true)}}
const dmPack=()=>Object.entries(DM.sc).map(([k,v])=>[k,v.n,v.k,v.d]);
const dmUnpack=a=>{for(const[k,n,kk,d]of a)DM.sc[k]={n,k:kk,d}};

// ===== vita dei giocatori e delle unità (host/singolo) =====
function onUnitDead(u){blastFx(u); makeBlood(u.x, u.y, u.k>=UK_HUM?CIV_SP:2.5); // omini: stessa macchia dei civili; mech: 2.5
 if(G.mode!=1&&u.kb>=0&&u.kb<1000){const k=u.kb===NET.id?P:others[u.kb];if(k)k.kills=(k.kills|0)+1}   // uccisione di un nemico
 if(u.dm&&G.mode==1){const key='b'+u.bi;dmCredit(u.kb,key,u.name);DM.rq.push({t:DM_RESPAWN,bi:u.bi,name:u.name})}}
// ===== cooperativa in rete: mech incapacitato =====
// un alleato vivo che gli sta accanto REVIVE_T secondi lo rimette in piedi con metà vita; se si allontana la barra scende al doppio della velocità
const REVIVE_R=90,REVIVE_T=3;
function reviveTick(q,dt){
 const near=plist().some(a=>a!==q&&Math.hypot(a.x-q.x,a.y-q.y)<REVIVE_R);
 q.rv=clamp((q.rv||0)+(near?dt/REVIVE_T:-dt/REVIVE_T*2),0,1);
 if(q.rv>=1){q.rv=0;q.hp=(q.hpMax||100)*.5;q.dd=0;q.unseen=0;q.hid=true;q.shs=(q.shs||[]).map(()=>0);
  fxSpawn(q.x,q.y,'#ffc400',16,true,40);sfxAt(SFX_LIST.toGrunt,.7,q.x,q.y,80);announce(q.name+' è di nuovo in piedi!')}}
function lifeTick(dt){
 for(const q of[P,...Object.values(others)]){
  if(q.hp>0){q.rs=null;q.rv=0;if(q.dd)q.dd=0;continue}
  const coopNet=NET.on&&G.mode!=1;                                      // cooperativa in rete: non si rinasce, si resta incapacitati
  if(!q.dd){q.dd=1; makeBlood(q.x, q.y, 2.5); if(coopNet){q.air=false;q.z=0;q.vx=q.vy=0;q.rv=0;fxSpawn(q.x,q.y,'#ff5a4a',16,true,40);sfxAt(SFX_LIST.crash,.8,q.x,q.y,80)}else{fxBoom(q.x,q.y,'unit',FXS);if(G.mode==1)dmCredit(q.lh,'p'+q.id,q.name)}}
  if(!NET.on&&G.mode!=1){continue}                                      // singolo: la morte finisce la partita (vedi gameTick)
  if(coopNet){reviveTick(q,dt);continue}
  q.rs=(q.rs==null?(G.mode==1?DM_RESPAWN:5):q.rs)-dt;
  if(q.rs<=0){q.rs=null;q.hp=q.hpMax||100;q.dd=0;q.unseen=0;q.hid=true;q.shs=(q.shs||[]).map(()=>0);q.sg=0;const[x,y]=G.mode==1?dmPoint():spawnAt(q.id);
   if(q===P){P.x=x;P.y=y;P.vx=P.vy=0}else{q.x=q.tx=x;q.y=q.ty=y;send(NET.conns[q.id],{t:'rs',x,y})}}}
 if(NET.on&&G.mode!=1&&G.started&&!G.over&&!plist().length)finish(1,'Tutti i giocatori sono incapacitati: missione fallita')}

  // ===== civili (omini e veicoli) =====
// Scenografia DETERMINISTICA: ogni civile percorre una strada (avanti e indietro); la posizione dipende solo da seed e orologio CIV.t,
// quindi in rete NON viaggiano posizioni: passano solo l'orologio (nello snapshot) e gli id dei civili uccisi (evento 'cv').
// Qualsiasi colpo li uccide subito (decide solo l'host); ogni civile ucciso toglie CIV_PEN kill a chi l'ha colpito.
const CIV={t:0,n:0,rd:[],k:null,r:null,c:null,h:null,d:null,s0:null,v:null,o:null,X:null,Y:null,H:null,spl:[]};   // d: 0 vivo, 1 ucciso, 3 spazzato via dal nucleare
const CIV_SP=1.5,CIV_SV=.8;                                                                                // scala: omini ×2, veicoli −20%
const CIV_RP=9*CIV_SP,CIV_RV=15*CIV_SV,SPL_MAX=60;                                                                     // raggio d'impatto omino / veicolo, macchie al massimo
// Nuova funzione per generare sangue universale
function makeBlood(x, y, scale) {
  CIV.spl.push({x: x, y: y, v: Math.random()*3|0, a: Math.random()*TAU, sc: scale});
  if(CIV.spl.length > SPL_MAX) CIV.spl.shift();
}
// ===== crateri da esplosione (lanciarazzi, ecc.): macchie permanenti, FIFO come il sangue =====
const CRAT=[],CRAT_MAX=30,CRAT_S=[];
function craterAdd(x,y,r){CRAT.push({x,y,r:r*.92,v:Math.random()*3|0,a:Math.random()*TAU});if(CRAT.length>CRAT_MAX)CRAT.shift()}
function cratSpr(){if(CRAT_S.length)return;
 for(let v=0;v<3;v++)CRAT_S.push((()=>{
  const s=128,c=document.createElement('canvas');c.width=c.height=s;const g=c.getContext('2d');g.translate(s/2,s/2);const R=rng(311+v);
// alone bruciato esterno (fuliggine scura irregolare, chiazze sparse)
for(let i=0;i<20;i++){const a=R()*TAU,d=s*.14+R()*s*.30,rr=s*.04+R()*s*.06;
 g.fillStyle=['#1c1a18','#2c2a28','#131211','#2c2a28'][i%4];g.globalAlpha=.4+.4*R();
 g.beginPath();g.arc(Math.cos(a)*d,Math.sin(a)*d,rr,0,TAU);g.fill()}
  g.globalAlpha=1;
// cratere centrale (cenere nera, doppio strato)
g.fillStyle='#100e0c';g.beginPath();g.arc(0,0,s*.24,0,TAU);g.fill();
g.fillStyle='#1e1815';g.beginPath();g.arc(0,0,s*.19,0,TAU);g.fill();
  // anello bruciato (grigio scuro caldo, chiazze a raggiera)
for(let i=0;i<22;i++){const a=i/22*TAU+R()*.2,d=s*.24+R()*s*.06;
 g.fillStyle=i%3===0?'#4a4744':i%3===1?'#383634':'#5e5a56';g.beginPath();g.arc(Math.cos(a)*d,Math.sin(a)*d,s*.035+R()*s*.015,0,TAU);g.fill()}
  // detriti e macerie (ruggine, carbone, cenere grigia)
for(let i=0;i<28;i++){const a=R()*TAU,d=s*.12+R()*s*.26;
 g.fillStyle=['#6a5a4a','#4a3e34','#7a6a5a','#242018','#7a7570'][i%5];g.globalAlpha=.5+.5*R();
 g.fillRect(Math.cos(a)*d-1.5,Math.sin(a)*d-1.5,2+R()*3,2+R()*3)}
  g.globalAlpha=1;
  return c;
 })())}
function craterDraw(){
 if(!CRAT.length)return;
 cratSpr();
 const VW=W/zoom,VH=H/zoom,x0=camX-50,y0=camY-50,x1=camX+VW+50,y1=camY+VH+50,vr=G.fog>.02?viewRange(P)*VIEW_MARGIN:1e9,vr2=vr*vr;
 let lim=G.q>=2?40:G.q==1?25:15;   // tetto di crateri disegnati per qualità (come civDraw)
 for(let i=CRAT.length-1;i>=0&&lim>0;i--){const s=CRAT[i];
  if(s.x<x0||s.x>x1||s.y<y0||s.y>y1)continue;
  const dx=s.x-P.x,dy=s.y-P.y;if(dx*dx+dy*dy>vr2)continue;
  lim--;
  const z=s.r*2.6;   // il fattore 2.6 include l'alone bruciato oltre il raggio nominale
  ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.a);ctx.globalAlpha=.85;ctx.drawImage(CRAT_S[s.v],-z/2,-z/2,z,z);ctx.restore()}}

// ===== schiuma da esplosione in acqua: stessa sagoma del cratere ma bianca, sfuma in 2 s e svanisce =====
const FOAM=[],FOAM_T=2,FOAM_S=[];
function foamAdd(x,y,r){FOAM.push({x,y,r:r*.92,v:Math.random()*3|0,a:Math.random()*TAU,t:0});}
function foamSpr(){if(FOAM_S.length)return;
 for(let v=0;v<3;v++)FOAM_S.push((()=>{
  const s=128,c=document.createElement('canvas');c.width=c.height=s;const g=c.getContext('2d');g.translate(s/2,s/2);const R=rng(311+v);
  // alone esterno: chiazze bianche irregolari sparse (come il cratere, ma bianco)
  for(let i=0;i<20;i++){const a=R()*TAU,d=s*.14+R()*s*.30,rr=s*.04+R()*s*.06;
   g.fillStyle=['#eaf4fa','#d6e8f2','#ffffff','#c9dfeb'][i%4];g.globalAlpha=.5+.4*R();
   g.beginPath();g.arc(Math.cos(a)*d,Math.sin(a)*d,rr,0,TAU);g.fill()}
  g.globalAlpha=1;
  // nucleo centrale bianco (doppio strato, come il cratere scuro)
  g.fillStyle='#ffffff';g.beginPath();g.arc(0,0,s*.24,0,TAU);g.fill();
  g.fillStyle='#e6f2fa';g.beginPath();g.arc(0,0,s*.19,0,TAU);g.fill();
  // anello di spruzzi a raggiera
  for(let i=0;i<22;i++){const a=i/22*TAU+R()*.2,d=s*.24+R()*s*.06;
   g.fillStyle=i%3===0?'#ffffff':i%3===1?'#dfeef7':'#f2f8fc';g.beginPath();g.arc(Math.cos(a)*d,Math.sin(a)*d,s*.035+R()*s*.015,0,TAU);g.fill()}
  // detriti / gocce bianche
  for(let i=0;i<28;i++){const a=R()*TAU,d=s*.12+R()*s*.26;
   g.fillStyle=['#ffffff','#d0e4ef','#eaf4fa','#c0d8e5','#f8fdff'][i%5];g.globalAlpha=.5+.5*R();
   g.fillRect(Math.cos(a)*d-1.5,Math.sin(a)*d-1.5,2+R()*3,2+R()*3)}
  g.globalAlpha=1;
  return c;
 })())}
function foamTick(dt){for(let i=FOAM.length-1;i>=0;i--){FOAM[i].t+=dt;if(FOAM[i].t>=FOAM_T)FOAM.splice(i,1)}}
function foamDraw(){
 if(!FOAM.length)return;
 foamSpr();
 const VW=W/zoom,VH=H/zoom,x0=camX-50,y0=camY-50,x1=camX+VW+50,y1=camY+VH+50,vr=G.fog>.02?viewRange(P)*VIEW_MARGIN:1e9,vr2=vr*vr;
 let lim=G.q>=2?20:G.q==1?14:8;
 for(let i=FOAM.length-1;i>=0&&lim>0;i--){const s=FOAM[i];
  if(s.x<x0||s.x>x1||s.y<y0||s.y>y1)continue;
  const dx=s.x-P.x,dy=s.y-P.y;if(dx*dx+dy*dy>vr2)continue;
  lim--;
  const z=s.r*2.6,al=1-s.t/FOAM_T;
  ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.a);ctx.globalAlpha=al;ctx.drawImage(FOAM_S[s.v],-z/2,-z/2,z,z);ctx.restore()}}

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
 let n=0;
 const add=(j,car,c,h,s0,v,o)=>{if(n>=cap)return;CIV.k[n]=car;CIV.r[n]=j;CIV.c[n]=c;CIV.h[n]=h;CIV.s0[n]=s0;CIV.v[n]=v;CIV.o[n]=o;n++};
 const pickP=f=>{for(let t=0;t<40;t++){const j=R()*CIV.rd.length|0,r=CIV.rd[j];if(f(r)&&R()*mx<r.L)return j}return -1};   // più probabile sulle strade lunghe
 // gruppo di k omini della classe c che camminano insieme sul percorso j (c=0: colori a caso)
 const group=(j,k,c)=>{const r=CIV.rd[j],v=rr(22,38),s0=R()*2*r.L;
  for(let q=0;q<k;q++){const pal=c?CIV_CLS[c]:[ri(0,NC-1),ri(0,NC-1)];add(j,0,pal[0],pal[1],s0+q*rr(14,26),v+rr(-1.5,1.5),(q%2?1:-1)*rr(3,9))}};
 // 2) omini e auto sulle strade (come prima; gli omini non vanno sulle autostrade, le auto non sui sentieri)
 for(let i=0;i<N_CIV_P;i++){const j=pickP(r=>r.ped&&!r.pc&&!r.hw&&!r.off);if(j<0)continue;const r=CIV.rd[j];add(j,0,ri(0,NC-1),ri(0,NC-1),R()*2*r.L,rr(22,42),(R()<.5?1:-1)*(r.w/2+7))}
 for(let i=0;i<N_CIV_V;i++){const j=pickP(r=>r.car&&!r.dirt);if(j<0)continue;const r=CIV.rd[j];add(j,1,ri(0,3),ri(0,NC-1),R()*2*r.L,rr(90,150),0)}
 // 3) intorno agli edifici: giro lungo il perimetro, si usa il tratto libero più lungo (isolati stretti: tratti corti o niente)
 const pool=M.blds.filter(o=>o.ty=='house'&&!o.sp&&!o.dead&&o.w>=90&&o.h>=90&&!inBase(o.x,o.y,200)).map(o=>[R(),o]).sort((a,b)=>a[0]-b[0]);
 let nb=0;
 for(const[,o]of pool){if(nb>=N_CIV_B)break;
  const hw=o.w/2+CP+12,hh=o.h/2+CP+12,T=(u,v)=>[o.x+u*o.c-v*o.s,o.y+u*o.s+v*o.c],e=walk(dense([T(-hw,-hh),T(hw,-hh),T(hw,hh),T(-hw,hh)],true),140);
  if(!e)continue;CIV.rd.push(e);const k=R()<.6?1:2;group(CIV.rd.length-1,k,e.pc);nb+=k}
 // 4) sparsi ovunque sulla mappa, a gruppetti (nei siti speciali diventano militari/operai da soli: la classe dipende dal punto)
 for(let t=0,nw=0;t<500&&nw<N_CIV_W;t++){const x=rr(250,SEA-250),y=rr(250,WH-250),a=R()*TAU,L=rr(120,320),e=walk(dense([[x,y],[x+Math.cos(a)*L,y+Math.sin(a)*L]],false),100);
  if(!e)continue;CIV.rd.push(e);const k=ri(CIV_GRP[0],CIV_GRP[1]);group(CIV.rd.length-1,k,e.pc);nw+=k}
 // 5) siti speciali: prima i tratti di strada che ci passano dentro, poi gruppetti che camminano nel sito
 for(const s of M.sites){const c=CIV_SITE[s.k];if(!c)continue;const N=ri(CIV_SITE_N[c][0],CIV_SITE_N[c][1]);let m=0;
  for(let j=0,nj=CIV.rd.length;j<nj&&m<N/2;j++){const r=CIV.rd[j];if(r.off||!r.ped||r.pc!==c)continue;const q=r.p[r.p.length>>1];if(Math.hypot(q[0]-s.x,q[1]-s.y)<s.r&&R()<.7){const k=ri(1,2);group(j,k,c);m+=k}}
  for(let t=0;t<80&&m<N;t++){const a=R()*TAU,d=Math.sqrt(R())*s.r*.8,x=s.x+Math.cos(a)*d,y=s.y+Math.sin(a)*d,b=R()*TAU,L=rr(100,260),e=walk(dense([[x,y],[x+Math.cos(b)*L,y+Math.sin(b)*L]],false),90);
   if(!e||e.pc!==c)continue;CIV.rd.push(e);const k=Math.min(N-m,ri(1,3));group(CIV.rd.length-1,k,c);m+=k}}
 CIV.n=n;civTick(0)}
// posizione di tutti i civili vivi (poche centinaia di operazioni: nessun costo reale)
function civTick(dt){if(!CIV.n)return;CIV.t+=dt;const t=CIV.t;
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
function civHitB(b){for(let i=0;i<CIV.n;i++){if(CIV.d[i])continue;const r=CIV.k[i]?CIV_RV:CIV_RP,dx=b.x-CIV.X[i],dy=b.y-CIV.Y[i];
  if(dx>r||dx<-r||dy>r||dy<-r||dx*dx+dy*dy>=r*r)continue;if(!b.ex)civKill(i,b.o);return true}
 return false}
function civArea(x,y,r,o){for(let i=0;i<CIV.n;i++){if(CIV.d[i])continue;if(Math.hypot(CIV.X[i]-x,CIV.Y[i]-y)<r+(CIV.k[i]?CIV_RV:CIV_RP))civKill(i,o)}}
function civCone(f,o){for(let i=0;i<CIV.n;i++)if(!CIV.d[i]&&f(CIV.X[i],CIV.Y[i],CIV.k[i]?CIV_RV:CIV_RP))civKill(i,o)}   // f = test di cono o di arco (fiamma, mischia)
// ----- disegno: immagini pronte (create una volta sola) -----
const CIVS={};
function civSpr(){if(CIVS.p)return;
 const mk=(w,h,f,s)=>{s=s||1;const c=document.createElement('canvas');c.width=Math.ceil(w*s);c.height=Math.ceil(h*s);const g=c.getContext('2d');g.translate(c.width/2,c.height/2);g.scale(s,s);f(g);return c};
 CIVS.p=[];CIVS.v=[];CIVS.s=[];
 CIVS.mk=mk;   // gli omini si creano al bisogno (vedi civPed)
 for(const col of['#c8ccd4','#c83c3c','#3c6ac8','#d8b840'])CIVS.v.push(mk(44,26,g=>{                          // auto vista dall'alto, prua verso +x
  g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-18,-8,40,20);
  g.fillStyle='#111';g.fillRect(-14,-12,8,4);g.fillRect(-14,8,8,4);g.fillRect(8,-12,8,4);g.fillRect(8,8,8,4);
  g.fillStyle=col;g.strokeStyle='#111';g.lineWidth=1.2;g.beginPath();g.roundRect(-19,-9,38,18,4);g.fill();g.stroke();
  g.fillStyle='#1d2a36';g.fillRect(3,-7,7,14);g.fillRect(-12,-7,5,14)},CIV_SV));
 for(let v=0;v<3;v++)CIVS.s.push(mk(40,40,g=>{const R=rng(77+v);g.fillStyle='#8a0f0f';g.beginPath();g.arc(0,0,7+R()*3,0,TAU);g.fill();   // macchia di sangue
  for(let i=0;i<8;i++){const a=R()*TAU,d=6+R()*11;g.fillStyle=i%2?'#b01818':'#6e0b0b';g.beginPath();g.arc(Math.cos(a)*d,Math.sin(a)*d,1.5+R()*3.5,0,TAU);g.fill()}}))}
// omino visto dall'alto: b = colore del vestito, h = colore della testa (indici di COLS), fr = fotogramma di passo;
// noRightArm = true → non disegna l'arto destro animato (y=+5.5): usato dagli infiltrati con l'arma estratta.
function civPed(b,h,fr,noRightArm){const k=((b*CPAL.length+h)*2+fr)+(noRightArm?1000:0);
 return CIVS.p[k]||(CIVS.p[k]=CIVS.mk(14,14,g=>{
  g.fillStyle='#222';g.beginPath();
  g.ellipse(fr?2:-2,-5.5,1.7,1.1,0,0,TAU);                    // arto sinistro (sempre)
  if(!noRightArm)g.ellipse(fr?-2:2,5.5,1.7,1.1,0,0,TAU);      // arto destro solo se non è l'infiltrato armato
  g.fill();
  g.fillStyle=CPAL[b];g.strokeStyle='#111';g.lineWidth=.8;g.beginPath();g.ellipse(0,0,3,5.5,0,0,TAU);g.fill();g.stroke();
  g.fillStyle=CPAL[h];g.strokeStyle='#111';g.lineWidth=.8;g.beginPath();g.arc(1,0,2.6,0,TAU);g.fill();g.stroke()},CIV_SP))}
// chiamata PRIMA del velo di nebbia: dove la nebbia copre, i civili non si vedono (niente calcoli di visibilità)
function civDraw(){
 if(!CIV.n&&!CIV.spl.length)return;civSpr();
 const VW=W/zoom,VH=H/zoom,x0=camX-50,y0=camY-50,x1=camX+VW+50,y1=camY+VH+50,vr=G.fog>.02?viewRange(P)*VIEW_MARGIN:1e9,vr2=vr*vr;
 for(const s of CIV.spl){if(s.x<x0||s.x>x1||s.y<y0||s.y>y1)continue;const z=40*s.sc;ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.a);ctx.drawImage(CIVS.s[s.v],-z/2,-z/2,z,z);ctx.restore()}
 let lim=G.q>=2?90:G.q==1?55:30;                            // tetto di civili disegnati, in base alla qualità
 for(let i=0;i<CIV.n&&lim>0;i++){if(CIV.d[i])continue;const x=CIV.X[i],y=CIV.Y[i];
  if(x<x0||x>x1||y<y0||y>y1)continue;const car=CIV.k[i];if(!car&&zoom<.45)continue;   // con la visuale lontana gli omini spariscono
  const dx=x-P.x,dy=y-P.y;if(dx*dx+dy*dy>vr2)continue;
  lim--;const im=car?CIVS.v[CIV.c[i]]:civPed(CIV.c[i],CIV.h[i],((CIV.t*5+i)|0)&1);
  ctx.save();ctx.translate(x,y);ctx.rotate(CIV.H[i]);ctx.drawImage(im,-im.width/2,-im.height/2);ctx.restore()}}

// ===== armerie: alcuni edifici scelti dal seed (uguali su tutti i client, niente rete) =====
const ARM={list:[],near:null};                                  // near = armeria a portata del giocatore locale
function armInit(){ARM.list=[];ARM.near=null;
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
  if(ARM.list.every(b=>Math.hypot(o.x-b.x,o.y-b.y)>1100)){o.arm=1;ARM.list.push(o)}}}
function armTick(){let best=null,bd=ARM_R;
 if(G.menu){if(G.over||P.hp<=0)saveConfig();else $('cfg').classList.add('arm')}   // chiuso da solo se la partita finisce o il mech muore; se era aperto dal caricamento diventa trasparente
 if(P.hp>0&&!P.air&&!G.over&&!G.ext&&!G.menu)for(const o of ARM.list){if(o.dead)continue;const l=toLocal(o,P.x,P.y),d=bsd(o,l[0],l[1]);if(d<bd){bd=d;best=o}}
 ARM.near=best}