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
allyList=()=>{const a=MS.al;return a&&a.on&&a.hp>0?[a]:[]};
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
 else if(m.ex==2&&!DS.on&&!SH.on&&(!m.nk||NK.t>=NK_WIN))finish(2,m.exMsg+' Estrazione completata!')}

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
function nukeWipe(){for(const o of M.obs)if(!o.dead&&!o.ind){o.hp=0;o.dead=1}navBuild()}
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
  6:()=>{const minD=G.sel==6?0:OBJ_MIN,c=shuf(sites.filter(q=>(q.k=='n'||q.k=='k')&&dSt(q)>minD));if(!c.length)return false;MD.z=[zoneAt(c[0])];MD.sk=c[0].k;return true},   // un solo sito nucleare a caso: silos ICBM ('n') o centrale ('k')
  7:()=>{const minD=G.sel==7?0:OBJ_MIN,pl=sites.find(q=>q.k=='k'&&dSt(q)>minD)||sites.find(q=>q.k=='i'&&dSt(q)>minD)||sites.find(q=>q.k=='c'&&dSt(q)>minD),yd=sites.find(q=>q.k=='y'&&dSt(q)>minD),sh=M.obs.find(o=>o.shape=='cruiser');
   if(!pl||!yd||!sh)return false;MD.z=[zoneAt(pl),zoneAt(yd)];MD.ship=sh;EXT[0]=sh.x;EXT[1]=sh.y;return true}};   // prima la centrale, poi il cantiere; l'estrazione diventa la nave
 const first=G.sel<0?0:G.sel>0?G.sel:1+(sel*7|0),order=G.sel<0?[]:[first,...[1,2,3,4,5,6,7].filter(x=>x!=first)];
 let t=0;
 for(const k of order){MR=rng(M.seed+7919+k*131);if(B[k]()){t=k;break}MD={blk:[],tg:[],z:[],wp:MD.wp}} // se la missione estratta non è realizzabile su questa mappa si prova la successiva
 G.mt=t;navBuild()}

// ===== parte dinamica (host): nemici di missione =====
function missionSpawn(){
 for(const o of BAR)o.barTimer=BAR_T;
 MS={t:G.mt,st:0,al:null,sp:0,wt:2,cz:0,rc:0,hv:null,lx:0,ly:0,hh:0,ex:0,exMsg:'',nk:0,nt:0};
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
  if(h){h.ar=8;h.wi=(w0+1)%MD.wp.length;MS.hv=h;MS.lx=h.x;MS.ly=h.y;MS.hh=h.hp;squad(h.x,h.y,2,90,170,false)}}}
function kothWave(z){const g=GID++;let c=0;
 for(let tr=0;c<KOTH_N&&tr<200;tr++){const a=Math.random()*TAU,d=rnd(750,1050),x=z.x+Math.cos(a)*d,y=z.y+Math.sin(a)*d,r=Math.random(),k=r<.65?1:r<.9?3:G.diff>=5?5:1;
  if(x>60&&y>60&&x<SEA-100&&y<WH-60&&(k==3||clearAt(x,y,k==5?40:22))){mkUnit(k,x,y,g).ms=1;c++}}
 announce('Ondata di nemici in arrivo!')}
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
 for(const o of BAR){if(o.dead)continue;o.barTimer-=dt;if(o.barTimer>0)continue;o.barTimer=BAR_T; // caserme: nuovi nemici a tempo, fino al numero iniziale
  const room=Math.min(BAR_SPAWN,G.cap-units.reduce((n,t)=>n+(t.ms?0:1),0));if(room<=0)continue;const g=GID++;
  for(let i=0,tr=0;i<room&&tr<80;tr++){const a=Math.random()*TAU,d=o.r+rnd(50,110),x=o.x+Math.cos(a)*d,y=o.y+Math.sin(a)*d,dr=Math.random()<.2;
   if(x>60&&y>60&&x<SEA-100&&y<WH-60&&(dr||clearAt(x,y,22))){mkUnit(dr?3:1,x,y,g);i++;fxSpawn(x,y,'#ff9a3a',10,true)}}}
 if(m.ex){extractTick(dt);return}                                    // obiettivo già compiuto: ora conta solo l'estrazione
 if(G.mt==0){if(!units.length&&BAR.every(o=>o.dead))objDone('Nemici e caserme distrutti.');return}
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
 else if(G.mt>=5){const z=MD.z[m.cz];
  if(z){const inside=pl.some(q=>!q.z&&Math.hypot(q.x-z.x,q.y-z.y)<z.r);z.p=clamp(z.p+(inside?dt/KOTH_T:-dt/KOTH_T*.5),0,1);
   if(inside){m.wt-=dt;if(m.wt<=0){m.wt=KOTH_WAVE;kothWave(z)}}
   if(z.p>=1){m.cz++;m.wt=3;
    if(m.cz>=MD.z.length){if(G.mt==6)nukeArm(z);else objDone(G.mt==7?'Cantiere conquistato!':'Avamposti conquistati!')}
    else announce(G.mt==7?'Centrale energetica conquistata! Raggiungi il cantiere spaziale':'Avamposto conquistato! Raggiungi il prossimo')}}}}
// stato della missione per i client (solo numeri)
function msPack(){const m=MS,a=m.al,z=MD.z&&MD.z[m.cz];
 return[m.st,a?Math.round(a.x):0,a?Math.round(a.y):0,a?Math.max(0,Math.ceil(a.hp)):0,a?(G.mt==1?Math.round(a.s):a.st|0):0,a?(a.hold|0):0,a?(G.mt==1?(a.go?1:0):Math.round(m.rc*10)/10):0,m.cz|0,z?Math.round(z.p*100)/100:0,m.sp>0?1:0,Math.round(m.lx),Math.round(m.ly),Math.max(0,Math.ceil(m.hh)),a?Math.round((a.h||0)*100)/100:0,m.ex|0,m.nk|0,Math.round((m.nk==2?NK.t:m.nt||0)*10)/10]}
function msUnpack(a){const m=MS,al=m.al;m.st=a[0];
 if(al){al.tx=a[1];al.ty=a[2];al.hp=a[3];al.hold=a[5];al.h=a[13];if(G.mt==1){al.s=a[4];al.go=a[6];al.on=a[6]}else{al.st=a[4];al.on=a[4];m.rc=a[6]}}
 m.cz=a[7];if(MD.z)MD.z.forEach((z,i)=>z.p=i<m.cz?1:i==m.cz?a[8]:0);m.sp=a[9];m.lx=a[10];m.ly=a[11];m.hh=a[12];m.ex=a[14]|0;if(m.ex==2)extractBegin();
 m.nk=a[15]|0;if(m.nk==1)m.nt=+a[16]||0;else if(m.nk==2&&!NK.on)nukeBegin(+a[16]||0)}   // chi entra a esplosione in corso parte dal punto giusto
// la parte non-host ricrea gli alleati della missione (stessa struttura, posizione dallo snapshot)
function missionClientInit(){MS={t:G.mt,st:0,al:null,sp:0,wt:0,cz:0,rc:0,hv:null,lx:0,ly:0,hh:0,ex:0,nk:0,nt:0};
 const al=(x,y,hp,rr0)=>({id:-1,al:1,z:0,x,y,tx:x,ty:y,vx:0,vy:0,hp,mhp:hp,rr:rr0,on:0,h:0,s:0,go:0,hold:0,st:0});
 if(G.mt==1){const q=pathAt(0);MS.al=al(q.x,q.y,CONV_HP,30)}else if(G.mt==2){MS.al=al(MD.vb.x,MD.vb.y,VIP_HP,16)}}
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
  default:return{t:'Distruggi tutti i nemici e le caserme',f:-1}}}
function missionMarks(){const m=MS,al=m.al,o=[];
 if(m.ex){if(m.ex==1)o.push({x:EXT[0],y:EXT[1],c:'#5ee0c0'});return o}
 if(G.mt==1&&al)o.push({x:al.x,y:al.y,c:'#4aa3ff'});
 else if(G.mt==2&&al)o.push(al.st?{x:EXT[0],y:EXT[1],c:'#5ee0c0'}:{x:MD.vb.x,y:MD.vb.y,c:'#5ee0c0'});
 else if(G.mt==3){for(const t of MD.tg)if(!t.dead)o.push({x:t.x,y:t.y,c:'#ffb02e'})}
 else if(G.mt==4){if(m.sp>0)o.push({x:m.lx,y:m.ly,c:'#ff4a4a'})}
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
function onUnitDead(u){blastFx(u);if(u.dm&&G.mode==1){const key='b'+u.bi;dmCredit(u.kb,key,u.name);DM.rq.push({t:DM_RESPAWN,bi:u.bi,name:u.name})}}
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
  if(!q.dd){q.dd=1;if(coopNet){q.air=false;q.z=0;q.vx=q.vy=0;q.rv=0;fxSpawn(q.x,q.y,'#ff5a4a',16,true,40);sfxAt(SFX_LIST.crash,.8,q.x,q.y,80)}else{fxBoom(q.x,q.y,'unit',FXS);if(G.mode==1)dmCredit(q.lh,'p'+q.id,q.name)}}
  if(!NET.on&&G.mode!=1){continue}                                      // singolo: la morte finisce la partita (vedi gameTick)
  if(coopNet){reviveTick(q,dt);continue}
  q.rs=(q.rs==null?(G.mode==1?DM_RESPAWN:5):q.rs)-dt;
  if(q.rs<=0){q.rs=null;q.hp=q.hpMax||100;q.dd=0;q.unseen=0;q.hid=true;q.shs=(q.shs||[]).map(()=>0);q.sg=0;const[x,y]=G.mode==1?dmPoint():spawnAt(q.id);
   if(q===P){P.x=x;P.y=y;P.vx=P.vy=0}else{q.x=q.tx=x;q.y=q.ty=y;send(NET.conns[q.id],{t:'rs',x,y})}}}
 if(NET.on&&G.mode!=1&&G.started&&!G.over&&!plist().length)finish(1,'Tutti i giocatori sono incapacitati: missione fallita')}
