'use strict';
/* AIRGRUNT · AGmapXout.js — MAPPE SPECIALI · ESTERNI ALIENI: base lunare e varianti esterne (Marte, Nettuno, fondale marino, stazione orbitale): generazione, pittura dello sfondo e disegni.
   Si carica dopo AGmapXdraw.js (usa XA e la pittura comune).
   Parte comune (temi, geometria, regole di gioco) all'inizio di AGmap.js: si carica prima di questo file. */

// ===== 5) base lunare =====
// densità e ingredienti: niente acqua né alberi, molta roccia; siti adatti alla Luna (basi, silos, spazioporto, cantiere, reattore, miniere, colonie)
function xMoonProf(K){const P0=K.PROF,mix={};for(const k in P0.mix)if(!'fvp'.includes(k))mix[k]=P0.mix[k];mix.y=(mix.y||1)+1;mix.a=(mix.a||1)+1;mix.q=(mix.q||1)+1;
 K.PROF=Object.assign({},P0,{lakes:[0,0],rivers:[0,0],forest:0,rock:Math.min(.32,P0.rock*1.5+.06),ports:0,nat:Math.max(.5,P0.nat*.9),mix,dec:P0.dec*.6,noSea:1});K.m.dec=K.PROF.dec}
// dopo la generazione: via gli alberi, cupole e moduli bianchi, crateri (con massi sui bordi), pannelli solari vicino ai siti
function xMoonPost(K){const{m,R,rr,ri,pick}=K;
 for(const o of m.obs)if(o.t=='t')o.dead=1;
 BPAL.push(['#8a8e94','#c8ccd2'],['#6e7278','#a6aab0'],['#7a6a3a','#c9a74a'],['#5a626e','#8e98a6'],['#9a9ea4','#dde0e4']);const MP=[BPAL.length-5,BPAL.length-4,BPAL.length-3,BPAL.length-2,BPAL.length-1];
 for(const o of m.blds){if(o.ty!='house'||o.dead)continue;o.pal=pick(MP);
  if(o.shape!='circle'&&!o.sp&&Math.min(o.w,o.h)>=80&&Math.max(o.w,o.h)<Math.min(o.w,o.h)*1.25&&R()<.4){const g=bgeom('circle',o.w,o.h);o.shape='circle';o.pr=g.pr;o.an=g.an;o.r=g.r}   // più cupole
  if(o.shape=='circle'||o.shape=='oct'||o.shape=='hex'){o.th='dome';o.v=ri(0,3)}}
 m.crat=[];const free=(x,y,r)=>{for(let a=0;a<8;a++){const px=x+Math.cos(a*.785)*r,py=y+Math.sin(a*.785)*r;if(m.own[K.cell(px,py)]||onRoad(px,py,20))return false}return !m.own[K.cell(x,y)]&&!onRoad(x,y,r*.5)&&K.dS(x,y)>r+500};
 for(let t=0;t<900&&m.crat.length<260;t++){const u=R(),r=u<.7?rr(30,90):u<.94?rr(90,220):rr(220,520),x=rr(r,WW-r),y=rr(r,WH-r);if(!free(x,y,r))continue;if(m.crat.some(c=>Math.hypot(c.x-x,c.y-y)<(c.r+r)*.75))continue;
  m.crat.push({x,y,r,s:ri(1,9999)});if(r>160)for(let k=0,n=ri(3,8);k<n;k++){const a=R()*TAU,d=r*rr(.95,1.15);K.rock(x+Math.cos(a)*d,y+Math.sin(a)*d,rr(14,34))}}
 for(const s of m.sites){if(R()<.5)continue;for(let t=0;t<20;t++){const a=R()*TAU,d=s.r+rr(80,260),x=s.x+Math.cos(a)*d,y=s.y+Math.sin(a)*d,w=rr(180,320),h=rr(110,180);
  if(free(x,y,Math.max(w,h)/2)){m.flat.push({k:'xsol',x,y,w,h,a:s.a||0});break}}}}

// ===== 5b) varianti esterne: base marziana, miniera su Nettuno, fondale marino, stazione orbitale =====
// Come la base lunare: genMap (AGmap.js) chiama xExtProf prima della generazione (densità e ingredienti) e xExtPost alla fine (ritocchi);
// lo sfondo passa da thGround (dopo il terreno) e thGrade (alla fine del blocco), nella sezione 8b. Tutto dal seed: in rete viaggia solo G.th.
const thExt=th=>{const T=THEMES[th!=null?th:M?M.th|0:0];return T&&T.ext||''};
const TH_BG={moon:'#6e6e70',mars:'#8a4c30',nep:'#1c2a44',sea:'#174a52',orb:'#03040b'};   // colore di riserva di un blocco di sfondo non ancora pronto (AGrender.js)
const thBg=()=>TH_BG[thExt()]||LVL_COL[1];
function xExtProf(K){const e=thExt(K.m.th);if(e=='moon')xMoonProf(K);else if(XEXT[e])XEXT[e].prof(K)}
function xExtPost(K){const e=thExt(K.m.th);if(e=='moon')xMoonPost(K);else if(XEXT[e])XEXT[e].post(K);if(e&&e!='orb')xDiggers(K)}
// MEGA ESCAVATORI (Luna, Marte, Nettuno, fondale): ruota a tazze su braccio, sovrastruttura e cingoli; ostacolo tipo edificio (ty 'xexc', disegno XA.xexc nella sezione 8b)
// ognuno sta in una cava terrazzata (flat 'xpit', dipinta da xPitPaint); preferiscono le cave e le zone industriali, altrimenti campo aperto
function xDiggers(K){const{m,R,rr,ri}=K,n=ri(2,4),near=m.sites.filter(s=>s.k=='q'||s.k=='i');let k=0;
 for(let t=0;t<1500&&k<n;t++){const S=near.length&&t<500?near[ri(0,near.length-1)]:null,a0=R()*TAU,
   x=S?S.x+Math.cos(a0)*(S.r+rr(150,500)):rr(500,WW-500),y=S?S.y+Math.sin(a0)*(S.r+rr(150,500)):rr(500,WH-500),w=rr(380,470),h=w*rr(.42,.5),a=R()*TAU;
  if(x<400||y<400||x>WW-400||y>WH-400||K.dS(x,y)<900||m.own[K.cell(x,y)]||xOnFlat(m,x,y,h*.45)||onRoad(x,y,w*.6)||wetCell(x,y))continue;
  const r=K.addGroup([{x,y,w,h,a,sh:'rect',ty:'xexc'}],{noSlab:1,gap:40});if(!r)continue;const o=r[0];
  o.th='xexc';o.v=ri(0,3);o.nfz=1;o.nrb=1;o.hp=1600;m.flat.push({k:'xpit',x,y,w:w*1.35,h:h*2.1,a,s:ri(1,9999)});if(m._fm)m._fm=null;k++}}   // nrb: niente macerie dipinte sotto (si vedrebbero fra il braccio e i cingoli)
// profilo derivato: tipi di sito tolti (drop) e con peso in più (add); niente acqua né boschi salvo diversa indicazione (o)
// o.noSea: niente mare · o.esc/o.et: scala e soglia del rumore delle quote · o.cany: canyon (Marte) · o.flat: tutto in piano (stazione orbitale)
function xProf(K,drop,add,o){const P0=K.PROF,mix={};for(const k in P0.mix)if(!drop.includes(k))mix[k]=P0.mix[k];for(const k in add)mix[k]=(mix[k]||0)+add[k];
 K.PROF=Object.assign({},P0,{lakes:[0,0],rivers:[0,0],forest:0,ports:0,noSea:1,mix},o||{});K.m.dec=K.PROF.dec}
// palette del tema per gli edifici normali; quelli tondi (e alcuni quasi quadrati, con probabilità pd) diventano cupole
function xPals(K,pals,pd){const{m,R,ri,pick}=K,i0=BPAL.length;BPAL.push(...pals);const MP=pals.map((_,i)=>i0+i);
 for(const o of m.blds){if(o.ty!='house'||o.dead)continue;o.pal=pick(MP);
  if(o.shape!='circle'&&!o.sp&&Math.min(o.w,o.h)>=80&&Math.max(o.w,o.h)<Math.min(o.w,o.h)*1.25&&R()<pd){const g=bgeom('circle',o.w,o.h);o.shape='circle';o.pr=g.pr;o.an=g.an;o.r=g.r}
  if(o.shape=='circle'||o.shape=='oct'||o.shape=='hex'){o.th='dome';o.v=ri(0,3)}}}
// rocce: stessa sagoma, colore del tema (f: grigio [r,g,b] → [r,g,b]); o.tc = colore pieno usato da lontano (drawRock in AGart.js)
function xRockTint(m,f){const t=v=>rgbs(f(v).map(c=>clamp(c,0,255)));for(const o of m.obs)if(o.ty=='rock'&&o.fc&&!o.nd){o.fc=o.fc.map(c=>t(c.match(/\d+/g).map(Number)));o.tc=t([o.tone,o.tone,o.tone])}}
// celle coperte da piazzali, parcheggi, piazzole... (m.flat con w,h o r): lì non vanno massi, crateri e macchie · xOnFlat: il cerchio (x,y,r) ne tocca una?
function xFlatMask(m){if(m._fm)return m._fm;const A=m._fm=new Uint8Array(GW*GH);
 for(const f of m.flat){if(f.x==null)continue;const R0=f.w&&f.h?Math.hypot(f.w,f.h)/2+20:f.r?f.r+20:0;if(!R0)continue;const c=Math.cos(f.a||0),n=Math.sin(f.a||0);
  for(let j=Math.max(0,(f.y-R0)/TC|0);j<=Math.min(GH-1,(f.y+R0)/TC|0);j++)for(let i=Math.max(0,(f.x-R0)/TC|0);i<=Math.min(GW-1,(f.x+R0)/TC|0);i++){const dx=i*TC+20-f.x,dy=j*TC+20-f.y;
   if(f.w&&f.h?Math.abs(dx*c+dy*n)<f.w/2+20&&Math.abs(-dx*n+dy*c)<f.h/2+20:Math.hypot(dx,dy)<f.r+20)A[j*GW+i]=1}}return A}
function xOnFlat(m,x,y,r){const A=xFlatMask(m),t=(px,py)=>{const i=px/TC|0,j=py/TC|0;return i>=0&&j>=0&&i<GW&&j<GH&&A[j*GW+i]};if(t(x,y))return true;for(let k=0;k<8;k++){const a=k*TAU/8;if(t(x+Math.cos(a)*r,y+Math.sin(a)*r))return true}return false}
// crateri (come sulla Luna): al massimo n, raggio da r0 a r1; con rocks i grandi hanno massi sul bordo
function xCraters(K,n,r0,r1,rocks){const{m,R,rr,ri}=K,out=[],free=(x,y,r)=>{for(let a=0;a<8;a++){const px=x+Math.cos(a*.785)*r,py=y+Math.sin(a*.785)*r;if(m.own[K.cell(px,py)]||onRoad(px,py,20)||wetCell(px,py))return false}return !m.own[K.cell(x,y)]&&!onRoad(x,y,r*.5)&&!xOnFlat(m,x,y,r)&&K.dS(x,y)>r+500};
 for(let t=0;t<n*5&&out.length<n;t++){const r=R()<.75?rr(r0,r0*3):rr(r0*3,r1),x=rr(r,WW-r),y=rr(r,WH-r);if(!free(x,y,r)||out.some(c=>Math.hypot(c.x-x,c.y-y)<(c.r+r)*.75))continue;
  out.push({x,y,r,s:ri(1,9999)});if(rocks&&r>150)for(let k=0,nk=ri(3,7);k<nk;k++){const a=R()*TAU,d=r*rr(.95,1.15);K.rock(x+Math.cos(a)*d,y+Math.sin(a)*d,rr(14,34))}}
 return out}
// macchie dalla forma libera fuori da siti, strade e acqua (zone lente, barriere coralline...): {x, y, r, b (blob), s}
function xBlobs(K,n,r0,r1){const{m,R,rr}=K,out=[];
 for(let t=0;t<n*8&&out.length<n;t++){const r=rr(r0,r1),x=rr(r+200,WW-r-200),y=rr(r+200,WH-r-200);if(K.dS(x,y)<r+600||Math.hypot(x-EXT[0],y-EXT[1])<r+250||m.own[K.cell(x,y)])continue;
  let ok=true;for(let k=0;k<12&&ok;k++){const a=k*TAU/12,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;if(m.own[K.cell(px,py)]||onRoad(px,py,30)||wetCell(px,py))ok=false}
  if(!ok||xOnFlat(m,x,y,r)||out.some(q=>Math.hypot(q.x-x,q.y-y)<q.r+r+80))continue;out.push({x,y,r,b:blob(R,x,y,r),s:(R()*9999)|0})}
 return out}
// pannelli solari attorno ai siti (prob = probabilità per sito), come sulla Luna
function xSolarNear(K,prob){const{m,R,rr}=K,free=(x,y,r)=>!m.own[K.cell(x,y)]&&!onRoad(x,y,r)&&clearAt(x,y,r*.6)&&K.dS(x,y)>r+500;
 for(const s of m.sites){if(R()>prob)continue;for(let t=0;t<20;t++){const a=R()*TAU,d=s.r+rr(80,260),x=s.x+Math.cos(a)*d,y=s.y+Math.sin(a)*d,w=rr(180,320),h=rr(110,180);if(free(x,y,Math.max(w,h)/2)){m.flat.push({k:'xsol',x,y,w,h,a:s.a||0});break}}}}
// punti sparsi lontani da siti, strade, acqua e partenza (bocche dei geyser, sorgenti di bolle)
function xSpots(K,n,r){const{m,rr}=K,out=[];for(let t=0;t<n*15&&out.length<n;t++){const x=rr(300,WW-300),y=rr(300,WH-300);
 if(m.own[K.cell(x,y)]||onRoad(x,y,r+30)||wetCell(x,y)||xOnFlat(m,x,y,r+20)||K.dS(x,y)<700||!clearAt(x,y,r)||out.some(q=>Math.hypot(q.x-x,q.y-y)<300))continue;out.push({x,y,s:K.ri(1,9999),L:rr(260,620)})}return out}
// CANYON di Marte: chiamata da genNature (AGmap.js) sulla griglia delle classi di quota (cl: 0 bassa, 1 media, 2 alta), prima che diventi M.E.
// Pochi canyon larghi da bordo a bordo con anse, più rami laterali ciechi: fondo a quota 0, una terrazza a quota 1, altopiano a quota 2 lungo i bordi.
// Mai sulla base di partenza né sull'estrazione. m.cany serve anche allo sfondo (dune sul fondo, marsGround).
function xCanyons(K,cl){const{m,R,rr,ri}=K,D=new Float32Array(GW*GH).fill(1e9);m.cany=[];
 const line=(a,b,w,mk)=>{const L=Math.hypot(b[0]-a[0],b[1]-a[1])||1,n=Math.max(8,Math.round(L/40)),nx=-(b[1]-a[1])/L,ny=(b[0]-a[0])/L,p1=rr(0,TAU),p2=rr(0,TAU),pts=[];
   for(let i=0;i<=n;i++){const t=i/n,o=(Math.sin(t*7+p1)*260+Math.sin(t*19+p2)*70)*mk*Math.min(1,t*6,(1-t)*6);pts.push([a[0]+(b[0]-a[0])*t+nx*o,a[1]+(b[1]-a[1])*t+ny*o])}return{pts,w}},
  edge=()=>{const s=ri(0,3),u=rr(500,WW-500);return s==0?[u,-60]:s==1?[WW+60,u]:s==2?[u,WH+60]:[-60,u]},
  ok=c=>c.pts.every(q=>K.dS(q[0],q[1])>c.w/2+800&&!inBase(q[0],q[1],c.w/2+560)&&Math.hypot(q[0]-EXT[0],q[1]-EXT[1])>c.w/2+560);
 for(let i=0,n=0,N=ri(2,4);i<80&&n<N;i++){const a=edge(),b=edge();if(Math.hypot(a[0]-b[0],a[1]-b[1])<WW*.6)continue;const c=line(a,b,rr(260,440),1);if(ok(c)){m.cany.push(c);n++}}
 for(const c of m.cany.slice())for(let k=0,nb=ri(1,3);k<nb;k++){const p=c.pts[ri(4,c.pts.length-5)],an=R()*TAU,L=rr(800,1700),s=line(p,[p[0]+Math.cos(an)*L,p[1]+Math.sin(an)*L],rr(140,230),.45);if(ok(s))m.cany.push(s)}
 for(const c of m.cany){const R0=c.w/2+500;for(const p of c.pts){const i0=Math.max(0,(p[0]-R0)/TC|0),i1=Math.min(GW-1,(p[0]+R0)/TC|0),j0=Math.max(0,(p[1]-R0)/TC|0),j1=Math.min(GH-1,(p[1]+R0)/TC|0);
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const d=Math.hypot(i*TC+20-p[0],j*TC+20-p[1])-c.w/2,k=j*GW+i;if(d<D[k])D[k]=d}}}
 for(let k=0;k<GW*GH;k++){const d=D[k];if(d<0)cl[k]=0;else if(d<150)cl[k]=Math.min(cl[k],1);else if(d<480)cl[k]=2}}
// STAZIONE ORBITALE: il piano calpestabile è l'unione di siti, strade, piazzali, edifici, base di partenza, estrazione e zone di missione;
// tutto il resto è VUOTO (M.VD, come negli interni: conta come acqua profonda, nessuno ci cammina, l'Air ci vola sopra).
// Le parti staccate si collegano alla piattaforma della base con passerelle dritte. Le stesse forme servono alla maschera e alla pittura del ponte (orbGround).
// forme: {k:'c',x,y,r} cerchio · {k:'r',x,y,w,h,a} rettangolo ruotato · {k:'l',pts,w,cw} striscia lungo una polilinea (cw: passerella)
// misure del piano calpestabile della stazione orbitale. Valori singoli: per tutti i profili · liste: un valore per profilo (Metropoli, Urbana, Media, Rurale, Selvaggia),
// tarati per avere circa il 25% di vuoto in più rispetto alla prima versione (vuoto medio: 21%, 30%, 43%, 52%, 65% della mappa)
// sr: frazione del raggio dei siti · sm: margine dei siti · rw / rs: larghezza in più delle strade principali / interne ai siti · bm: margine attorno agli edifici · fm: margine dei piazzali
// cf, ff: minimi di city e fill del profilo · cd: scala della grandezza delle città · ke: quota di piazzali senza edifici che restano piattaforma
const XORB={n:[.12,.2,.3,.42,.5],sr:[.72,.6,.5,.45,.4],sm:30,rw:45,rs:40,bm:34,fm:40,cf:[.35,.27,.24,.28,.2],ff:[.35,.16,.08,.1,0],cd:[.5,.48,.42,.36,.28],ke:[1,.66,.35,.3,.15]};
// valore del parametro per il profilo della mappa (un valore per ogni voce di PROFILES: Metropoli, Urbana, Media, Rurale, Selvaggia)
// stazione orbitale: frazione di piattaforme (siti ed edifici sparsi) rispetto alla città normale, per densità (Metropoli … Selvaggia)
const xOrbK=(k,P)=>{const v=XORB[k],i=PROFILES.findIndex(q=>q.n==P.n);return v[clamp(i<0?2:i,0,v.length-1)]};
const XORB_FL=new Set(['slab','pslab','lot','park','vpark','field','yard','motorpool','range','basins','stockpile','launchpad','drydock','court','pool']);
function xOrbStamp(V,s){const cells=(x0,y0,x1,y1,f)=>{for(let j=Math.max(0,Math.floor(y0/TC));j<=Math.min(GH-1,Math.floor(y1/TC));j++)for(let i=Math.max(0,Math.floor(x0/TC));i<=Math.min(GW-1,Math.floor(x1/TC));i++)if(f(i*TC+TC/2,j*TC+TC/2))V[j*GW+i]=0};
 if(s.k=='c')cells(s.x-s.r,s.y-s.r,s.x+s.r,s.y+s.r,(x,y)=>Math.hypot(x-s.x,y-s.y)<s.r);
 else if(s.k=='r'){const c=Math.cos(s.a),n=Math.sin(s.a),R0=Math.hypot(s.w,s.h)/2;cells(s.x-R0,s.y-R0,s.x+R0,s.y+R0,(x,y)=>{const dx=x-s.x,dy=y-s.y;return Math.abs(dx*c+dy*n)<s.w/2&&Math.abs(-dx*n+dy*c)<s.h/2})}
 else if(s.k=='p'){const b=xShapeBB(s),Q=s.pts;cells(b[0],b[1],b[2],b[3],(x,y)=>{let ins=false;for(let i=0,j=Q.length-1;i<Q.length;j=i++){const a=Q[i],c=Q[j];if((a[1]>y)!==(c[1]>y)&&x<(c[0]-a[0])*(y-a[1])/(c[1]-a[1])+a[0])ins=!ins}return ins})}   // poligono (scafi delle navi in costruzione)
 else{const h=s.w/2,P=s.pts;for(let k=0;k<P.length-1;k++){const a=P[k],b=P[k+1],vx=b[0]-a[0],vy=b[1]-a[1],L2=vx*vx+vy*vy||1;
  cells(Math.min(a[0],b[0])-h,Math.min(a[1],b[1])-h,Math.max(a[0],b[0])+h,Math.max(a[1],b[1])+h,(x,y)=>{const t=clamp(((x-a[0])*vx+(y-a[1])*vy)/L2,0,1);return Math.hypot(x-a[0]-vx*t,y-a[1]-vy*t)<h})}}}
function xOrbPlat(K){const{m,R,rr,ri}=K,P=[];
 const X=XORB,sr=xOrbK('sr',K.PROF),ke=xOrbK('ke',K.PROF);for(const s of m.sites){if(s.ds)for(const d of s.ds)P.push({k:'c',x:d.x,y:d.y,r:d.rad*sr+X.sm});else P.push({k:'c',x:s.x,y:s.y,r:s.r*sr+X.sm})}
 for(const rd of m.roads)P.push({k:'l',pts:rd.pts,w:rd.w+(rd.site?X.rs:X.rw)});
 const hasB=f=>{const c=Math.cos(f.a||0),n=Math.sin(f.a||0);for(const o of qobs(f.x,f.y,Math.hypot(f.w,f.h)/2,[])){if(o.t!='b'||o.ty=='rock'||o.dead)continue;const dx=o.x-f.x,dy=o.y-f.y;if(Math.abs(dx*c+dy*n)<f.w/2&&Math.abs(-dx*n+dy*c)<f.h/2)return true}return false};
 for(const f of m.flat){if(f.x==null)continue;if(f.w&&f.h&&XORB_FL.has(f.k)){if(f.k=='slab'&&!hasB(f)&&R()>ke){f.orbX=1;continue}P.push({k:'r',x:f.x,y:f.y,w:f.w+X.fm,h:f.h+X.fm,a:f.a||0})}else if(f.k=='circ'&&f.r)P.push({k:'c',x:f.x,y:f.y,r:f.r+X.fm*.75})}   // piazzali vuoti (senza edifici): solo una parte (ke) resta piattaforma
 for(const o of m.obs)if(!o.dead&&o.t=='b'&&o.ty!='rock')P.push({k:'c',x:o.x,y:o.y,r:o.r+X.bm});
 {const c=baseXY((BASE_W+20)/2,(BASE_H+20)/2);P.push({k:'r',x:c[0],y:c[1],w:BASE_W+180,h:BASE_H+180,a:baseAng(0)})}
 {const a=baseAng(0),c1=baseXY(1100,190),c2=baseXY(190,1100);P.push({k:'r',x:c1[0],y:c1[1],w:1000,h:380,a},{k:'r',x:c2[0],y:c2[1],w:380,h:1000,a})}   // due piste lungo i bordi della mappa, ai lati della base (navette parcheggiate e merci: xOrbPad)
 P.push({k:'c',x:START[0],y:START[1],r:320},{k:'c',x:EXT[0],y:EXT[1],r:EXT_R+90});
 for(const q of m.keep||[])P.push({k:'c',x:q.x,y:q.y,r:q.r+70});
 const V=new Uint8Array(GW*GH).fill(1),N=GW*GH;for(const s of P)xOrbStamp(V,s);
 // parti staccate: si etichettano le zone calpestabili (4-vicini) e si collega la più grande delle staccate alla parte della base, finché ne resta una sola
 const lab=new Int32Array(N),Q=new Int32Array(N),st=(START[1]/TC|0)*GW+(START[0]/TC|0);
 for(let it=0;it<400;it++){lab.fill(0);let nc=0;const sz=[0];
  for(let s0=0;s0<N;s0++){if(V[s0]||lab[s0])continue;nc++;let h=0,t=0,n=0;Q[t++]=s0;lab[s0]=nc;
   while(h<t){const c=Q[h++],i=c%GW,j=c/GW|0;n++;if(i>0&&!V[c-1]&&!lab[c-1]){lab[c-1]=nc;Q[t++]=c-1}if(i<GW-1&&!V[c+1]&&!lab[c+1]){lab[c+1]=nc;Q[t++]=c+1}
    if(j>0&&!V[c-GW]&&!lab[c-GW]){lab[c-GW]=nc;Q[t++]=c-GW}if(j<GH-1&&!V[c+GW]&&!lab[c+GW]){lab[c+GW]=nc;Q[t++]=c+GW}}sz.push(n)}
  const main=lab[st];if(nc<=1||!main)break;
  let best=0;for(let c=1;c<=nc;c++)if(c!==main&&(!best||sz[c]>sz[best]))best=c;
  const A=[],B=[];for(let k=0;k<N;k++){if(lab[k]===best)A.push(k);else if(lab[k]===main){const i=k%GW,j=k/GW|0;if((i>0&&V[k-1])||(i<GW-1&&V[k+1])||(j>0&&V[k-GW])||(j<GH-1&&V[k+GW]))B.push(k)}}
  let bd=1e18,ba=A[0],bb=B[0];for(const a of A){const ax=a%GW,ay=a/GW|0;for(const b of B){const dx=ax-b%GW,dy=ay-(b/GW|0),d=dx*dx+dy*dy;if(d<bd){bd=d;ba=a;bb=b}}}
  const cw={k:'l',pts:[[(ba%GW)*TC+TC/2,(ba/GW|0)*TC+TC/2],[(bb%GW)*TC+TC/2,(bb/GW|0)*TC+TC/2]],w:130,cw:1};P.push(cw);xOrbStamp(V,cw)}
 m.VD=V;m.orb.plat=P;for(const s of P)s.bb=xShapeBB(s);
 for(let k=0;k<N;k++)if(V[k]){m.WM[k]=1;const i=k%GW,j=k/GW|0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=i+dx,y=j+dy;if(x>=0&&y>=0&&x<GW&&y<GH)m.WN[y*GW+x]=1}}
 // nel vuoto non resta nulla: oggetti, decorazioni a terra e linee (elettrodotti, binari, recinti) fuori dal piano
 for(const o of m.obs)if(!o.dead&&xVoid(o.x,o.y,0))o.dead=1;
 m.flat=m.flat.filter(f=>{if(f.orbX)return false;if(f.pts){let n=0;for(const p of f.pts)if(xVoid(p[0],p[1],0))n++;return n<=f.pts.length*.2}return f.x==null||!xVoid(f.x,f.y,0)});
 // cantiere orbitante: scafi in costruzione nel vuoto (solo sfondo), preferibilmente accanto al cantiere navale; qualche satellite
 const ys=m.sites.find(s=>s.k=='y'),inV=(x,y,mg)=>{for(const[dx,dy]of[[0,0],[mg,0],[-mg,0],[0,mg],[0,-mg],[mg,mg],[-mg,-mg],[mg,-mg],[-mg,mg]])if(!xVoid(x+dx,y+dy,0))return false;return true};
 m.orb.ships=[];const nS=ri(3,6);
 for(let t=0;t<600&&m.orb.ships.length<nS;t++){const L=rr(520,1250),W=L*rr(.22,.3),a=R()*TAU,c0=ys&&t<300?[ys.x+rr(-1,1)*(ys.r+1400),ys.y+rr(-1,1)*(ys.r+1400)]:[rr(0,WW),rr(0,WH)],ca=Math.cos(a),sa=Math.sin(a);
  let ok=K.dS(c0[0],c0[1])>900&&m.orb.ships.every(q=>Math.hypot(q.x-c0[0],q.y-c0[1])>(q.L+L)*.6);for(let u=-.5;u<=.5&&ok;u+=.25)ok=inV(c0[0]+ca*u*L,c0[1]+sa*u*L,W*.7+60);
  if(ok)m.orb.ships.push({x:c0[0],y:c0[1],L,W,a,s:ri(1,9999),done:rr(.3,.8)})}
 m.orb.sats=[];for(let t=0;t<300&&m.orb.sats.length<14;t++){const x=rr(0,WW),y=rr(0,WH);if(inV(x,y,130)&&m.orb.ships.every(q=>Math.hypot(q.x-x,q.y-y)>q.L*.6+100))m.orb.sats.push({x,y,a:R()*TAU,s:ri(1,9999),sz:rr(.7,1.4)})}
 // gli scafi in costruzione sono calpestabili (ci si arriva in Air): la loro sagoma esce dal vuoto; poi si rifanno le maschere d'acqua (in orbita c'è solo il vuoto)
 for(const q of m.orb.ships){const c=Math.cos(q.a),n=Math.sin(q.a),L=q.L,W=q.W,sh={k:'p',ship:1,pts:[[L/2,0],[L*.3,-W*.45],[L*.12,-W/2],[-L/2,-W*.42],[-L/2,W*.42],[L*.12,W/2],[L*.3,W*.45]].map(([u,v])=>[q.x+u*c-v*n,q.y+u*n+v*c])};sh.bb=xShapeBB(sh);P.push(sh);xOrbStamp(V,sh)}
 m.WN.fill(0);for(let k=0;k<N;k++){m.WM[k]=V[k];if(V[k]){const i=k%GW,j=k/GW|0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=i+dx,y=j+dy;if(x>=0&&y>=0&&x<GW&&y<GH)m.WN[y*GW+x]=1}}}}
// STAZIONE ORBITALE: il muro invisibile segue il disegno. Le forme del ponte (le stesse di orbGround) si mettono in secchi da 256 px (le strade
// spezzate in segmenti); il punto è sul ponte se sta entro il bordo esterno della fascia gialla e nera (ORB_E px oltre la forma, meno il raggio di chi
// si muove). Gli scafi delle navi in costruzione contano fino allo scafo. La griglia a celle (M.VD) resta per percorsi, acqua e generazione
const ORB_E=30,ORB_B=256;
function xOrbIx(m){const ix=new Map(),add=(e,b)=>{const g=ORB_E+8;for(let j=Math.floor((b[1]-g)/ORB_B);j<=Math.floor((b[3]+g)/ORB_B);j++)for(let i=Math.floor((b[0]-g)/ORB_B);i<=Math.floor((b[2]+g)/ORB_B);i++){const k=j*4096+i;let a=ix.get(k);if(!a)ix.set(k,a=[]);a.push(e)}};
 for(const s of m.orb.plat){
  if(s.k=='c')add({k:0,x:s.x,y:s.y,r:s.r},[s.x-s.r,s.y-s.r,s.x+s.r,s.y+s.r]);
  else if(s.k=='r'){const R0=Math.hypot(s.w,s.h)/2;add({k:1,x:s.x,y:s.y,c:Math.cos(s.a),n:Math.sin(s.a),hw:s.w/2,hh:s.h/2},[s.x-R0,s.y-R0,s.x+R0,s.y+R0])}
  else if(s.k=='l'){const h=s.w/2;for(let i=1;i<s.pts.length;i++){const a=s.pts[i-1],b=s.pts[i],dx=b[0]-a[0],dy=b[1]-a[1],L2=dx*dx+dy*dy||1;
   add({k:2,ax:a[0],ay:a[1],dx,dy,L2,h},[Math.min(a[0],b[0])-h,Math.min(a[1],b[1])-h,Math.max(a[0],b[0])+h,Math.max(a[1],b[1])+h])}}
  else if(s.k=='p')add({k:3,pts:s.pts},s.bb||xShapeBB(s))}
 m.orb.ix=ix}
// distanza (con segno: <0 dentro) dal bordo di una forma; per gli scafi conta lo scafo, per il resto la forma (il margine si aggiunge dopo)
function xOrbSd(e,x,y){
 if(e.k==0)return Math.hypot(x-e.x,y-e.y)-e.r;
 if(e.k==1){const dx=x-e.x,dy=y-e.y,u=Math.abs(dx*e.c+dy*e.n)-e.hw,v=Math.abs(-dx*e.n+dy*e.c)-e.hh;return Math.max(u,v)}   // come il disegno: rettangolo allargato a spigoli vivi
 if(e.k==2){let t=((x-e.ax)*e.dx+(y-e.ay)*e.dy)/e.L2;t=t<0?0:t>1?1:t;return Math.hypot(x-e.ax-e.dx*t,y-e.ay-e.dy*t)-e.h}
 const Q=e.pts;let ins=false,bd=1e18;for(let i=0,j=Q.length-1;i<Q.length;j=i++){const a=Q[i],c=Q[j];if((a[1]>y)!==(c[1]>y)&&x<(c[0]-a[0])*(y-a[1])/(c[1]-a[1])+a[0])ins=!ins;
  const dx=c[0]-a[0],dy=c[1]-a[1],L2=dx*dx+dy*dy||1;let t=((x-a[0])*dx+(y-a[1])*dy)/L2;t=t<0?0:t>1?1:t;const d=Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);if(d<bd)bd=d}
 return ins?-bd:bd}
const xOrbMg=e=>e.k==3?ORB_E-18:ORB_E;   // margine oltre la forma: fascia del ponte; scafi: solo un filo oltre la lamiera
// vero se il punto è nel vuoto per un corpo di raggio r (il corpo deve stare entro il bordo esterno della fascia)
function xOrbVoid(x,y,r){const ci=x/TC|0,cj=y/TC|0;if(ci>=0&&cj>=0&&ci<GW&&cj<GH){const c=cj*GW+ci;if(!M.VD[c]&&!M.WN[c])return false}   // lontano dal vuoto: risposta immediata
 const a=M.orb.ix.get(Math.floor(y/ORB_B)*4096+Math.floor(x/ORB_B));if(!a)return true;for(const e of a)if(xOrbSd(e,x,y)<xOrbMg(e)-r)return false;return true}
// punto del ponte più vicino a (x,y) per un corpo di raggio r (null se non c'è nessuna forma vicina)
function xOrbNear(x,y,r){let b=null,bd=1e18;const i0=Math.floor(x/ORB_B),j0=Math.floor(y/ORB_B),seen=new Set();
 for(let j=j0-1;j<=j0+1;j++)for(let i=i0-1;i<=i0+1;i++){const a=M.orb.ix.get(j*4096+i);if(!a)continue;for(const e of a){if(seen.has(e))continue;seen.add(e);const m=xOrbMg(e)-r-.5;let q=null;
  if(e.k==0){const dx=x-e.x,dy=y-e.y,d=Math.hypot(dx,dy)||1,R=Math.max(1,e.r+m);q=[e.x+dx/d*R,e.y+dy/d*R]}
  else if(e.k==1){const dx=x-e.x,dy=y-e.y,hw=Math.max(1,e.hw+m),hh=Math.max(1,e.hh+m);let u=dx*e.c+dy*e.n,v=-dx*e.n+dy*e.c;u=clamp(u,-hw,hw);v=clamp(v,-hh,hh);q=[e.x+u*e.c-v*e.n,e.y+u*e.n+v*e.c]}   // (angoli a spigolo: per i rettangoli basta)
  else if(e.k==2){let t=((x-e.ax)*e.dx+(y-e.ay)*e.dy)/e.L2;t=t<0?0:t>1?1:t;const px=e.ax+e.dx*t,py=e.ay+e.dy*t,dx=x-px,dy=y-py,d=Math.hypot(dx,dy)||1,R=Math.max(1,e.h+m);q=d<=R?[x,y]:[px+dx/d*R,py+dy/d*R]}
  else{const Q=e.pts;let bq=null,bdd=1e18;for(let i=0,j=Q.length-1;i<Q.length;j=i++){const a=Q[i],c=Q[j],dx=c[0]-a[0],dy=c[1]-a[1],L2=dx*dx+dy*dy||1;let t=((x-a[0])*dx+(y-a[1])*dy)/L2;t=t<0?0:t>1?1:t;
    const px=a[0]+dx*t,py=a[1]+dy*t,d=Math.hypot(x-px,y-py);if(d<bdd){bdd=d;const k=d>m?m/(d||1):1;bq=[px+(x-px)*k,py+(y-py)*k]}}q=bq}
  const d=Math.hypot(q[0]-x,q[1]-y);if(d<bd){bd=d;b=q}}}
 return b}
const xShapeBB=s=>{if(s.k=='p'){let a=1e9,b=1e9,c=-1e9,d=-1e9;for(const p of s.pts){a=Math.min(a,p[0]);b=Math.min(b,p[1]);c=Math.max(c,p[0]);d=Math.max(d,p[1])}return[a,b,c,d]}
 if(s.k=='c')return[s.x-s.r,s.y-s.r,s.x+s.r,s.y+s.r];if(s.k=='r'){const R0=Math.hypot(s.w,s.h)/2;return[s.x-R0,s.y-R0,s.x+R0,s.y+R0]}
 let a=1e9,b=1e9,c=-1e9,d=-1e9;for(const p of s.pts){a=Math.min(a,p[0]);b=Math.min(b,p[1]);c=Math.max(c,p[0]);d=Math.max(d,p[1])}return[a-s.w/2,b-s.w/2,c+s.w/2,d+s.w/2]};
// i quattro temi: prof (densità e ingredienti) · post (ritocchi a mappa fatta) · ground/grade (pittura dello sfondo, sezione 8b)
const XEXT={
 // BASE MARZIANA: canyon profondi e altopiani (molti dislivelli), massi enormi e campi di rocce, crateri, cupole e moduli color ocra
 mars:{prof(K){const P0=K.PROF;xProf(K,'fvp',{c:1,n:1,a:1,y:1,q:2,k:1},{rock:Math.min(.34,P0.rock*1.6+.08),nat:Math.max(.6,P0.nat),dec:P0.dec*.6,hill:1,esc:1300,et:-.03,cany:1,city:P0.city*.8})},
  post(K){const{m,R,rr,ri}=K;
   for(const o of m.obs)if(o.t=='t')o.dead=1;
   xPals(K,[['#8a5a44','#c98e6a'],['#6e4a3c','#a8765c'],['#9a9ea4','#dde0e4'],['#7a6a5a','#b8a48a'],['#8a3a2a','#c8664a'],['#5a5e66','#8e949e']],.35);
   m.crat=xCraters(K,110,24,380,1);
   for(let t=0,n=0,nn=Math.round(60*K.PROF.nat);t<3000&&n<nn;t++){const x=rr(300,WW-300),y=rr(300,WH-300),sz=R()<.3?rr(120,220):rr(55,120);if(K.dS(x,y)<800||m.own[K.cell(x,y)]||xOnFlat(m,x,y,sz))continue;   // massi enormi con il loro ghiaione
    if(K.rock(x,y,sz)){n++;for(let k=0,nk=ri(2,6);k<nk;k++){const a=R()*TAU,d=sz*rr(1.1,2.2),px=x+Math.cos(a)*d,py=y+Math.sin(a)*d;if(!xOnFlat(m,px,py,40))K.rock(px,py,rr(16,46))}}}
   for(const c of m.cany||[])for(let i=2;i<c.pts.length-2;i+=ri(2,5)){const p=c.pts[i],q=c.pts[i+1],L=Math.hypot(q[0]-p[0],q[1]-p[1])||1,sd=R()<.5?1:-1,d=c.w/2+rr(-50,40),rx=p[0]-(q[1]-p[1])/L*d*sd,ry=p[1]+(q[0]-p[0])/L*d*sd,rs=rr(24,70);if(!m.own[K.cell(rx,ry)]&&!xOnFlat(m,rx,ry,rs))K.rock(rx,ry,rs)}   // frane lungo le pareti
   xRockTint(m,v=>[v[0]*1.2+14,v[1]*.66+4,v[2]*.46]);
   xSolarNear(K,.5)},
  ground:marsGround,grade:marsGrade},
 // MINIERA SU NETTUNO: ghiaccio, laghi di metano, foreste di cristalli, campi di poltiglia d'azoto (rallentano), geyser; pochissima città, niente omini
 nep:{prof(K){const P0=K.PROF;xProf(K,'fvpts',{q:4,i:2,k:1,n:1,c:1},{city:Math.min(.12,P0.city),lakes:[2,4],forest:.16,rock:Math.min(.36,P0.rock*1.8+.1),nat:Math.max(.7,P0.nat),dec:P0.dec*.5,hill:1,esc:1200})},
  post(K){const{m}=K;
   for(const o of m.obs)if(o.t=='t'){o.hp=o.m=120}   // cristalli: più duri degli alberi
   xPals(K,[['#3a4250','#5c687a'],['#2e3a48','#4a5c70'],['#4a4a3a','#c9a227'],['#404a5a','#7a8aa0'],['#2a3038','#48525f'],['#3a3446','#665a7a']],.3);
   m.crat=xCraters(K,70,22,300,1);
   m.nslush=xBlobs(K,Math.round(10+8*K.PROF.nat),140,340);m.slow=m.nslush.map(b=>({x:b.x,y:b.y,r:b.r,b:b.b,f:.6,k:2}));   // poltiglia d'azoto: come il fango (natSlow in AGnature.js)
   m.gey=xSpots(K,36,30);
   xRockTint(m,v=>[v[0]*.6+6,v[1]*.74+14,v[2]*.95+40])},
  ground:nepGround,grade:nepGrade},
 // FONDALE MARINO: base sottomarina all'aperto; boschi di alghe e coralli al posto degli alberi, barriere coralline, sorgenti di bolle; cupole di vetro
 sea:{prof(K){const P0=K.PROF;xProf(K,'fvp',{i:1,k:1},{forest:.22,rock:Math.min(.24,P0.rock*1.2+.04),nat:P0.nat,dec:P0.dec*.8,hill:1})},
  post(K){const{m}=K;
   xPals(K,[['#2f5a64','#5aa0aa'],['#3a4a56','#8ab0be'],['#6a5a2a','#d8b44a'],['#2a4a5a','#4f8fa8'],['#5a6a70','#c8dce0'],['#2e3e4e','#e07a4a']],.45);
   xRockTint(m,v=>[v[0]*.42+8,v[1]*.7+18,v[2]*.72+24]);
   m.reef=xBlobs(K,Math.round(14+10*K.PROF.nat),90,240);m.vent=xSpots(K,30,24)},
  ground:seaGround,grade:seaGrade},
 // STAZIONE ORBITALE: tutto artificiale e in piano; fuori dalle piattaforme c'è il vuoto e sotto si vede il pianeta (img/AGorbit.jpg)
 orb:{prof(K){const P0=K.PROF,F=xOrbK('n',P0);xProf(K,'fvpq',{y:2,a:2,i:1,k:1,c:1},{rock:0,nat:0,flat:1,dec:P0.dec*.7,city:Math.max(P0.city,xOrbK('cf',P0)),fill:Math.max(P0.fill,xOrbK('ff',P0))*F,cd:P0.cd*xOrbK('cd',P0),hill:1,
   sites:[Math.max(2,Math.round(P0.sites[0]*F)),Math.max(2,Math.round(P0.sites[1]*F))],minor:Math.round((P0.minor||0)*F)})},   // XORB_N: meno siti, edifici sparsi e minori, stessa densità su ogni piattaforma
  post(K){const{m,ri}=K;m.orb={rot:ri(0,3)};
   for(const o of m.obs)if(o.t=='t'||o.ty=='rock')o.dead=1;m.hills=[];
   xPals(K,[['#8a929e','#d6dce4'],['#5a6474','#9aa6b8'],['#3a4a6a','#6a86b0'],['#9a9ea4','#eef0f4'],['#4a525e','#c9a227'],['#2e3644','#5a6a80']],.35);
   xOrbPlat(K);xOrbIx(K.m);xOrbPad(K)},
  ground:orbGround}};

// STAZIONE ORBITALE: la pista di partenza (piazzale della base) non è più vuota. Navette parcheggiate (come quelle dell'hangar dell'astronave) sulle
// loro piazzole dipinte, cataste di casse, container, fusti, taniche, generatori, carrelli e droni lungo i bordi. Restano liberi: le file di partenza,
// il cerchio di estrazione, le due uscite stradali della base e un passaggio fra un oggetto e l'altro. Le piazzole e i segni sul ponte li dipinge orbGround
function xOrbPad(K){const{m,R,rr,ri,pick}=K,A0=baseAng(0),pads=m.orb.pads=[],marks=m.orb.marks=[],put=[];
 const inR=(u,v,r,a,b,c,d)=>u>a+r&&u<b-r&&v>c+r&&v<d-r,okL=(u,v,r)=>(inR(u,v,r,40,715,40,715)||inR(u,v,r,600,1570,30,345)||inR(u,v,r,30,345,600,1570))&&Math.hypot(u-260,v-260)>EXT_R+30+r&&!(u>420-r&&u<720&&Math.abs(v-330)<125+r)&&!(v>420-r&&v<720&&Math.abs(u-330)<125+r);   // base e piste laterali, fuori da partenza, estrazione e uscite
 const RG=[[40,715,40,715],[600,1570,30,345],[30,345,600,1570]],rp=()=>{const q=RG[R()<.4?0:R()<.5?1:2];return[rr(q[0],q[1]),rr(q[2],q[3])]};   // punto a caso nella base o in una delle piste
 const free=(x,y,r,gap)=>{if(xVoid(x,y,r+30)||onRoad(x,y,r+30))return false;for(const q of pads)if(Math.hypot(q.x-x,q.y-y)<q.r+r+6)return false;for(const o of qobs(x,y,r+gap+120,[]))if(!o.dead&&o.t=='b'&&Math.hypot(o.x-x,o.y-y)<o.r+r+gap)return false;return true};
 const add=(kind,u,v,w,h,a,gap)=>{const D=XK[kind]||{},sh=D.c?'circle':'rect';if(D.c)w=h=Math.max(w,h);const g=bgeom(sh,w,h),r=g.r;if(!okL(u,v,r))return null;const[x,y]=baseXY(u,v);if(!free(x,y,r,gap==null?34:gap))return null;
  const o={t:'b',ty:'prop',shape:sh,th:kind,x,y,w,h,a,c:Math.cos(a),s:Math.sin(a),r,pr:g.pr,an:g.an,hp:D.hp||100,v:ri(0,3),sd:ri(1,99999),pal:0};K.addO(o);put.push(o);return o};
 // navette parcheggiate sulle piazzole (prima le posizioni migliori, poi a caso nella fascia libera)
 const SL=[[600,110,0],[110,600,Math.PI/2],[800,180,0],[180,800,Math.PI/2],[1340,180,0],[180,1340,Math.PI/2],[1070,180,0],[180,1070,Math.PI/2]].map(q=>[q[0]+rr(-14,14),q[1]+rr(-14,14),q[2]+(R()<.5?Math.PI:0)]);
 let nS=ri(3,4);for(const[u,v,a]of SL){if(nS<=0)break;const w=rr(190,230),h=w*.6,o=add('shuttle',u,v,w,h,A0+a,60);if(o){nS--;pads.push({x:o.x,y:o.y,r:w*.56,a:o.a,n:pads.length+1})}}
 for(let t=0;t<200&&nS>0;t++){const[u,v]=rp(),w=rr(190,230),h=w*.6,a=A0+pick([0,Math.PI/2,Math.PI,-Math.PI/2]),o=add('shuttle',u,v,w,h,a,60);if(o){nS--;pads.push({x:o.x,y:o.y,r:w*.56,a,n:pads.length+1})}}
 for(let t=0;t<900&&pads.length<2;t++){const b=R()*TAU,d=rr(420,2000),x=START[0]+Math.cos(b)*d,y=START[1]+Math.sin(b)*d,w=rr(150,190),h=w*.6,a=A0+pick([0,Math.PI/2,Math.PI,-Math.PI/2]),r=Math.hypot(w,h)/2;   // mappe fitte: almeno due navette nei paraggi, più piccole
  if(x<r+60||y<r+60||x>WW-r-60||y>WH-r-60||Math.hypot(x-EXT[0],y-EXT[1])<EXT_R+30+r||!free(x,y,r,40))continue;const o={t:'b',ty:'prop',shape:'rect',th:'shuttle',x,y,w,h,a,c:Math.cos(a),s:Math.sin(a),r,pr:bgeom('rect',w,h).pr,an:bgeom('rect',w,h).an,hp:XK.shuttle.hp,v:ri(0,3),sd:ri(1,99999),pal:0};
  K.addO(o);put.push(o);pads.push({x,y,r:w*.56,a,n:pads.length+1})}
 // cataste: un pezzo grande e qualche pezzo piccolo attorno
 const BIG=[['cont',130,52],['crates',64,64],['cargo',66,66],['gen',104,66],['fuelc',96,42],['mechbay',92,92]],SM=[['crate',38,38],['crate',44,44],['barrels',48,48],['toolcart',42,28],['drone',40,40],['maglock',72,50]];
 let nP=ri(8,12);for(let t=0;t<600&&nP>0;t++){const[u,v]=rp(),[k,w,h]=pick(BIG),a=A0+(R()<.5?0:Math.PI/2)+rr(-.06,.06),o=add(k,u,v,w,h,a,30);if(!o)continue;nP--;
  for(let i=0,n=ri(1,4);i<n;i++){const b=R()*TAU,d=o.r+rr(24,44),[k2,w2,h2]=pick(SM);add(k2,u+Math.cos(b)*d,v+Math.sin(b)*d,w2,h2,A0+rr(-.5,.5),6)}}
 for(let t=0;t<300&&put.length<40;t++){const[k,w,h]=pick(SM),[u,v]=rp();add(k,u,v,w,h,A0+rr(-.6,.6),26)}   // pezzi sparsi
 // segni dipinti sul ponte della pista: grande cerchio d'atterraggio alla partenza, frecce verso le due uscite, numeri di settore
 marks.push({k:'ring',x:START[0],y:START[1],r:150},{k:'arr',p:baseXY(470,330),a:A0},{k:'arr',p:baseXY(330,470),a:A0+Math.PI/2},{k:'arr',p:baseXY(560,330),a:A0},{k:'arr',p:baseXY(330,560),a:A0+Math.PI/2},
  {k:'txt',p:baseXY(120,40+22),a:A0,t:'PISTA '+String.fromCharCode(65+ri(0,5))+'-'+ri(1,9)})}
// ===== 8b) varianti esterne: pittura dello sfondo e disegni (Marte, Nettuno, fondale marino, stazione orbitale) =====
// thGround: dopo terreno, quote e dettagli sparsi (paintTile in AGbake.js) · thGrade: alla fine del blocco (tinta di tutto lo sfondo)
async function thGround(g,x0,y0){const e=thExt();if(e=='moon')moonGround(g,x0,y0);else if(XEXT[e]&&XEXT[e].ground)await XEXT[e].ground(g,x0,y0);xPitPaint(g,x0,y0)}
// cava del mega escavatore: gradoni ellittici sempre più scuri verso il fondo, solchi dei cingoli
function xPitPaint(g,x0,y0){for(const f of M.flat){if(f.k!='xpit'||!xInT(f.x,f.y,Math.max(f.w,f.h)*.6,x0,y0))continue;g.save();g.translate(f.x,f.y);g.rotate(f.a);
 for(let i=0;i<5;i++){const k=1-i*.17;g.fillStyle='rgba(0,0,0,'+(.1+i*.04)+')';g.beginPath();g.ellipse(0,0,f.w/2*k,f.h/2*k,0,0,TAU);g.fill();
  g.strokeStyle='rgba(255,255,255,.12)';g.lineWidth=3;g.beginPath();g.ellipse(-3,-4,f.w/2*k,f.h/2*k,0,Math.PI*.9,Math.PI*1.9);g.stroke()}
 g.strokeStyle='rgba(0,0,0,.22)';g.lineWidth=7;for(const sd of[-1,1]){g.beginPath();g.moveTo(-f.w*.5,sd*f.h*.08);g.quadraticCurveTo(-f.w*.15,sd*f.h*.12+(hs(1,f.s,2)-.5)*40,f.w*.05,sd*f.h*.1);g.stroke()}
 g.restore()}}
function thGrade(g,x0,y0){const e=thExt();if(e=='moon')moonGrade(g,x0,y0);else if(XEXT[e]&&XEXT[e].grade)XEXT[e].grade(g,x0,y0)}
const xInT=(x,y,r,x0,y0)=>x+r>x0&&x-r<x0+CH&&y+r>y0&&y-r<y0+CH;   // il cerchio (x,y,r) tocca il blocco?
// cratere (stesso disegno della Luna) con la luce del tema lc = 'r,g,b'
function xCraterPaint(g,c,lc){const r=c.r,L=a=>'rgba('+lc+','+a+')';
 if(r>150){g.strokeStyle=L(.06);g.lineWidth=r*.05;for(let k=0;k<14;k++){const a=hs(k,c.s,1)*TAU,l=r*(1.2+hs(k,c.s,2)*1.2);g.beginPath();g.moveTo(c.x+Math.cos(a)*r,c.y+Math.sin(a)*r);g.lineTo(c.x+Math.cos(a)*l,c.y+Math.sin(a)*l);g.stroke()}}
 const ej=g.createRadialGradient(c.x,c.y,r*.9,c.x,c.y,r*1.45);ej.addColorStop(0,L(.16));ej.addColorStop(1,L(0));g.fillStyle=ej;g.beginPath();g.arc(c.x,c.y,r*1.45,0,TAU);g.fill();
 g.save();g.beginPath();g.arc(c.x,c.y,r,0,TAU);g.clip();g.fillStyle='rgba(0,0,0,.32)';g.fillRect(c.x-r,c.y-r,2*r,2*r);
 g.fillStyle=L(.2);g.beginPath();g.arc(c.x+r*.22,c.y+r*.22,r*.92,0,TAU);g.fill();g.fillStyle='rgba(0,0,0,.12)';g.beginPath();g.arc(c.x+r*.1,c.y+r*.1,r*.55,0,TAU);g.fill();g.restore();
 g.strokeStyle=L(.3);g.lineWidth=Math.max(2,r*.09);g.beginPath();g.arc(c.x,c.y,r,Math.PI*.75,Math.PI*1.75,true);g.stroke();
 g.strokeStyle='rgba(0,0,0,.3)';g.beginPath();g.arc(c.x,c.y,r,Math.PI*1.75,Math.PI*.75,true);g.stroke()}
const xTint=(g,x0,y0,mode,al,c)=>{g.globalCompositeOperation=mode;g.globalAlpha=al;g.fillStyle=c;g.fillRect(x0,y0,CH+2,CH+2)};

// --- MARTE: chiazze di basalto e di polvere, dune sul fondo dei canyon, crateri con la scia di polvere sottovento, tracce dei diavoli di polvere
function marsGround(g,x0,y0){const x1=x0+CH,y1=y0+CH,sd=M.seed+61,wa=hs(1,2,sd)*TAU;   // wa: direzione del vento dominante
 for(let cy=Math.floor(y0/800)-2;cy<=y1/800+1;cy++)for(let cx=Math.floor(x0/800)-2;cx<=x1/800+1;cx++){const h=hs(cx,cy,sd);if(h>.5)continue;const x=(cx+hs(cx,cy,sd+1))*800,y=(cy+hs(cx,cy,sd+2))*800,r=350+h*1100,dk=h<.28;
  if(!xInT(x,y,r,x0,y0))continue;const gr=g.createRadialGradient(x,y,r*.15,x,y,r);gr.addColorStop(0,dk?'rgba(40,24,18,.32)':'rgba(255,225,190,.14)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x0,y0,CH,CH)}
 g.lineCap='round';g.lineJoin='round';
 for(const c of M.cany||[]){if(!c.pts.some(p=>xInT(p[0],p[1],c.w,x0,y0)))continue;
  pline(g,c.pts);g.strokeStyle='rgba(30,16,10,.2)';g.lineWidth=c.w*.92;g.stroke();g.strokeStyle='rgba(255,215,175,.07)';g.lineWidth=c.w*.45;g.stroke();   // fondo più scuro, sabbia al centro
  for(let i=1;i<c.pts.length-1;i++){const p=c.pts[i];if(!xInT(p[0],p[1],c.w,x0,y0))continue;const q=c.pts[i+1],a=Math.atan2(q[1]-p[1],q[0]-p[0]),ca=Math.cos(a),sa=Math.sin(a),nx=-sa,ny=ca;
   for(let k=0;k<3;k++){const o=(hs(i,k,sd+5)-.5)*c.w*.62,x=p[0]+nx*o+ca*k*14,y=p[1]+ny*o+sa*k*14,L=c.w*(.08+hs(i,k,sd+6)*.12);   // dune trasversali
    g.strokeStyle='rgba(50,24,14,.26)';g.lineWidth=4;g.beginPath();g.moveTo(x-nx*L,y-ny*L);g.quadraticCurveTo(x+ca*12,y+sa*12,x+nx*L,y+ny*L);g.stroke();
    g.strokeStyle='rgba(255,220,180,.18)';g.lineWidth=1.6;g.beginPath();g.moveTo(x-nx*L-ca*3,y-ny*L-sa*3);g.quadraticCurveTo(x+ca*9,y+sa*9,x+nx*L-ca*3,y+ny*L-sa*3);g.stroke()}}}
 for(const c of M.crat||[]){if(!xInT(c.x,c.y,c.r*3.2,x0,y0))continue;g.save();g.translate(c.x,c.y);g.rotate(wa);const gr=g.createLinearGradient(c.r*.5,0,c.r*3,0);gr.addColorStop(0,'rgba(255,222,186,.15)');gr.addColorStop(1,'rgba(255,222,186,0)');g.fillStyle=gr;
  g.beginPath();g.moveTo(c.r*.4,-c.r*.85);g.quadraticCurveTo(c.r*3,-c.r*.3,c.r*3.1,0);g.quadraticCurveTo(c.r*3,c.r*.3,c.r*.4,c.r*.85);g.closePath();g.fill();g.restore();xCraterPaint(g,c,'245,218,190')}
 for(let cy=Math.floor(y0/600)-2;cy<=y1/600+1;cy++)for(let cx=Math.floor(x0/600)-2;cx<=x1/600+1;cx++){if(hs(cx,cy,sd+8)>.4)continue;let x=(cx+hs(cx,cy,sd+9))*600,y=(cy+hs(cx,cy,sd+10))*600;
  if(!xInT(x,y,800,x0,y0))continue;const ph=hs(cx,cy,sd+11)*TAU,rr0=9+hs(cx,cy,sd+12)*8;g.strokeStyle='rgba(28,14,8,.17)';g.lineWidth=2.5;g.beginPath();g.moveTo(x,y);
  for(let k=0;k<80;k++){const t=k*.42+ph;x+=Math.cos(wa)*8+Math.cos(t)*rr0;y+=Math.sin(wa)*8+Math.sin(t)*rr0;g.lineTo(x,y)}g.stroke()}}
function marsGrade(g,x0,y0){g.save();xTint(g,x0,y0,'color',.66,'#b4542a');xTint(g,x0,y0,'multiply',.2,'#e0a070');xTint(g,x0,y0,'soft-light',.3,'#ffc890');g.restore();
 for(const f of M.flat)if(f.k=='xsol'&&xInT(f.x,f.y,300,x0,y0))xSolar(g,f)}   // i pannelli restano blu

// --- NETTUNO: lastre di ghiaccio crepate, brina e chiazze scure, poltiglia d'azoto, crateri, geyser con la striscia scura sottovento; tinta blu e laghi di metano viola
function nepGround(g,x0,y0){const x1=x0+CH,y1=y0+CH,sd=M.seed+71,wa=hs(3,4,sd)*TAU,S=150;g.lineCap='round';
 for(let cy=Math.floor(y0/500)-2;cy<=y1/500+1;cy++)for(let cx=Math.floor(x0/500)-2;cx<=x1/500+1;cx++){const h=hs(cx,cy,sd+7);if(h>.55)continue;const x=(cx+hs(cx,cy,sd+8))*500,y=(cy+hs(cx,cy,sd+9))*500,r=200+h*700;
  if(!xInT(x,y,r,x0,y0))continue;const gr=g.createRadialGradient(x,y,r*.1,x,y,r);gr.addColorStop(0,h<.25?'rgba(240,248,255,.3)':'rgba(8,10,24,.3)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(x0,y0,CH,CH)}
 const PT=(i,j)=>[(i+.2+hs(i,j,sd)*.6)*S,(j+.2+hs(i,j,sd+1)*.6)*S];
 for(let cy=Math.floor(y0/S)-1;cy<=y1/S;cy++)for(let cx=Math.floor(x0/S)-1;cx<=x1/S;cx++){const a=PT(cx,cy);
  for(const[di,dj]of[[1,0],[0,1]]){if(hs(cx*2+di,cy*2+dj,sd+2)<.22)continue;const b=PT(cx+di,cy+dj),mx=(a[0]+b[0])/2+(hs(cx,cy,sd+3+di)-.5)*36,my=(a[1]+b[1])/2+(hs(cx,cy,sd+5+dj)-.5)*36;
   g.strokeStyle='rgba(6,10,22,.42)';g.lineWidth=2.6;g.beginPath();g.moveTo(a[0],a[1]);g.quadraticCurveTo(mx,my,b[0],b[1]);g.stroke();
   g.strokeStyle='rgba(235,248,255,.24)';g.lineWidth=1;g.beginPath();g.moveTo(a[0]+1.6,a[1]+1.6);g.quadraticCurveTo(mx+1.6,my+1.6,b[0]+1.6,b[1]+1.6);g.stroke()}}
 for(const b of M.nslush||[]){if(!xInT(b.x,b.y,b.r*1.3,x0,y0))continue;bpath(g,b.b,1.1);g.fillStyle='rgba(225,240,255,.3)';g.fill();bpath(g,b.b,1);g.fillStyle='#5e6e82';g.fill();bpath(g,b.b,.78);g.fillStyle='#7a8ca2';g.fill();
  g.strokeStyle='rgba(255,255,255,.22)';g.lineWidth=2;for(let i=0;i<7;i++){g.beginPath();g.arc(b.x+(hs(i,b.s,1)-.5)*b.r,b.y+(hs(i,b.s,2)-.5)*b.r,8+hs(i,b.s,3)*22,0,TAU);g.stroke()}}
 for(const c of M.crat||[])if(xInT(c.x,c.y,c.r*2.5,x0,y0))xCraterPaint(g,c,'235,245,255');
 for(const q of M.gey||[]){if(!xInT(q.x,q.y,q.L+40,x0,y0))continue;g.save();g.translate(q.x,q.y);g.rotate(wa+(hs(1,q.s,1)-.5)*.5);const gr=g.createLinearGradient(0,0,q.L,0);gr.addColorStop(0,'rgba(6,6,14,.6)');gr.addColorStop(1,'rgba(6,6,14,0)');g.fillStyle=gr;
  g.beginPath();g.moveTo(0,-10);g.quadraticCurveTo(q.L*.5,-q.L*.16,q.L,-q.L*.1);g.lineTo(q.L,q.L*.1);g.quadraticCurveTo(q.L*.5,q.L*.16,0,10);g.closePath();g.fill();g.restore();
  xc(g,q.x,q.y,18,'#c8d8e8');xc(g,q.x,q.y,13,'#1a2230');xc(g,q.x,q.y,8,'#06080e')}}
function nepGrade(g,x0,y0){const sd=M.seed+71;g.save();xTint(g,x0,y0,'color',.75,'#2c5cb0');
 g.globalAlpha=1;for(let cy=Math.floor(y0/900)-2;cy<=(y0+CH)/900+1;cy++)for(let cx=Math.floor(x0/900)-2;cx<=(x0+CH)/900+1;cx++){const h=hs(cx,cy,sd+30);if(h>.55)continue;   // grandi zone di tinta diversa: ghiaccio turchese o viola
  const x=(cx+hs(cx,cy,sd+31))*900,y=(cy+hs(cx,cy,sd+32))*900,r=500+h*900;if(!xInT(x,y,r,x0,y0))continue;const gr=g.createRadialGradient(x,y,r*.1,x,y,r),c=h<.28?'40,190,200':'110,60,190';
  gr.addColorStop(0,'rgba('+c+',.55)');gr.addColorStop(1,'rgba('+c+',0)');g.fillStyle=gr;g.fillRect(x0,y0,CH+2,CH+2)}
 xTint(g,x0,y0,'multiply',.45,'#7f98d0');xTint(g,x0,y0,'soft-light',.35,'#c8f4ff');
 g.globalCompositeOperation='color';g.globalAlpha=.6;g.fillStyle='#4a2a9a';for(const l of M.lakes)if(xInT(l.x,l.y,l.r*1.4,x0,y0)){bpath(g,l,1);g.fill()}   // laghi di metano
 g.globalCompositeOperation='screen';g.globalAlpha=1;for(const q of M.gey||[])if(xInT(q.x,q.y,90,x0,y0))xGlow(g,q.x,q.y,70,'#7fe8ff',.5);   // bocche dei geyser accese
 g.restore()}

// --- FONDALE: increspature della sabbia, conchiglie e stelle marine, praterie scure; tinta d'acqua, barriere coralline, caustiche e raggi di luce, bolle
function seaGround(g,x0,y0){const x1=x0+CH,y1=y0+CH,sd=M.seed+81,S=36;g.lineCap='round';
 for(let cy=Math.floor(y0/600)-2;cy<=y1/600+1;cy++)for(let cx=Math.floor(x0/600)-2;cx<=x1/600+1;cx++){const h=hs(cx,cy,sd+6);if(h>.42)continue;const x=(cx+hs(cx,cy,sd+7))*600,y=(cy+hs(cx,cy,sd+8))*600,r=250+h*700;
  if(!xInT(x,y,r,x0,y0))continue;const gr=g.createRadialGradient(x,y,r*.2,x,y,r);gr.addColorStop(0,'rgba(18,56,28,.34)');gr.addColorStop(1,'rgba(18,56,28,0)');g.fillStyle=gr;g.fillRect(x0,y0,CH,CH)}
 for(let cy=Math.floor(y0/S)-1;cy<=y1/S;cy++)for(let cx=Math.floor(x0/S)-1;cx<=x1/S;cx++){const h=hs(cx,cy,sd);if(h>.7)continue;const x=(cx+hs(cx,cy,sd+1))*S,y=(cy+hs(cx,cy,sd+2))*S,L=10+h*22;
  g.strokeStyle='rgba(255,240,205,.16)';g.lineWidth=2;g.beginPath();g.moveTo(x-L,y);g.quadraticCurveTo(x,y-5,x+L,y);g.stroke();g.strokeStyle='rgba(0,0,0,.12)';g.beginPath();g.moveTo(x-L,y+3);g.quadraticCurveTo(x,y-2,x+L,y+3);g.stroke()}
 const S2=70;for(let cy=Math.floor(y0/S2);cy<y1/S2;cy++)for(let cx=Math.floor(x0/S2);cx<x1/S2;cx++){const h=hs(cx,cy,sd+3);if(h>.2)continue;const x=(cx+hs(cx,cy,sd+4))*S2,y=(cy+hs(cx,cy,sd+5))*S2;
  if(h<.05){g.fillStyle='rgba(240,110,70,.85)';g.beginPath();for(let k=0;k<10;k++){const a=k*TAU/10+h*40,r=k%2?2.2:6.5;g.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r)}g.closePath();g.fill()}   // stella marina
  else if(h<.11){xc(g,x,y,3.4,'rgba(250,240,220,.8)');g.strokeStyle='rgba(120,100,80,.6)';g.lineWidth=.8;g.beginPath();g.arc(x,y,3.4,0,Math.PI);g.stroke()}   // conchiglia
  else{const r=4+h*16;xc(g,x+1,y+1.5,r,'rgba(0,0,0,.2)');xc(g,x,y,r,'#6a6658');xc(g,x-r*.25,y-r*.25,r*.4,'rgba(255,255,255,.12)')}}}   // sassi
function seaGrade(g,x0,y0){const x1=x0+CH,y1=y0+CH,sd=M.seed+81;g.save();xTint(g,x0,y0,'color',.38,'#1c8a98');xTint(g,x0,y0,'multiply',.35,'#6ab0bc');g.restore();
 for(const b of M.reef||[]){if(!xInT(b.x,b.y,b.r*1.3,x0,y0))continue;bpath(g,b.b,1.12);g.fillStyle='rgba(0,0,0,.24)';g.fill();bpath(g,b.b,1);g.fillStyle='#3e5e58';g.fill();   // barriera corallina (dopo la tinta: colori vivi)
  const C=['#ff6a8a','#ff9a3a','#c25fff','#ffd23f','#5ff0d0','#ff4a6a','#f0f0e0'],n=Math.round(b.r*b.r/220);
  for(let i=0;i<n;i++){const a=hs(i,b.s,1)*TAU,q=Math.sqrt(hs(i,b.s,2))*.88*rad(b.b,b.x+Math.cos(a),b.y+Math.sin(a)),x=b.x+Math.cos(a)*q,y=b.y+Math.sin(a)*q,c=C[(i+b.s)%C.length],t=hs(i,b.s,3),r=5+hs(i,b.s,4)*12;
   if(t<.35){xc(g,x+2,y+3,r,'rgba(0,0,0,.25)');xc(g,x,y,r,c);g.strokeStyle='rgba(0,0,0,.25)';g.lineWidth=1.2;g.beginPath();g.arc(x,y,r*.6,a,a+3);g.stroke();g.beginPath();g.arc(x,y,r*.3,a+1,a+4);g.stroke()}   // corallo a cervello
   else if(t<.7){g.strokeStyle=c;g.lineWidth=2.2;for(let k=0;k<5;k++){const d=a+k*1.25,l=r*1.3;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+Math.cos(d)*l*.5+3,y+Math.sin(d)*l*.5,x+Math.cos(d)*l,y+Math.sin(d)*l);g.stroke()}}   // ramificato
   else{for(let k=0;k<10;k++){const d=k*TAU/10;g.strokeStyle=c;g.lineWidth=1.6;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(d)*r*.9,y+Math.sin(d)*r*.9);g.stroke()}xc(g,x,y,r*.3,'#fff3c8')}}}   // anemone
 g.save();g.globalCompositeOperation='screen';g.lineJoin='round';const S=110,PT=(i,j)=>[(i+.15+hs(i,j,sd+20)*.7)*S,(j+.15+hs(i,j,sd+21)*.7)*S];   // caustiche: reticolo di luce ondulato
 for(let cy=Math.floor(y0/S)-1;cy<=y1/S;cy++)for(let cx=Math.floor(x0/S)-1;cx<=x1/S;cx++){const a=PT(cx,cy);for(const[di,dj]of[[1,0],[0,1],[1,1]]){if(hs(cx+di*7,cy+dj*5,sd+22)<.3)continue;const b=PT(cx+di,cy+dj),mx=(a[0]+b[0])/2+(hs(cx,cy,sd+23+di)-.5)*50,my=(a[1]+b[1])/2+(hs(cx,cy,sd+25+dj)-.5)*50;
  g.strokeStyle='rgba(140,230,255,.035)';g.lineWidth=12;g.beginPath();g.moveTo(a[0],a[1]);g.bezierCurveTo(mx+(b[1]-a[1])*.3,my-(b[0]-a[0])*.3,mx-(b[1]-a[1])*.3,my+(b[0]-a[0])*.3,b[0],b[1]);g.stroke();g.strokeStyle='rgba(200,250,255,.055)';g.lineWidth=3;g.stroke()}}
 g.fillStyle='rgba(120,220,255,.05)';for(let k=-4;k<WW/700+1;k++){const x=k*700+hs(k,1,sd+9)*700,w=60+hs(k,2,sd+9)*110;if(x+w+WH*.3<x0||x>x1)continue;g.beginPath();g.moveTo(x,0);g.lineTo(x+w,0);g.lineTo(x+w+WH*.3,WH);g.lineTo(x+WH*.3,WH);g.closePath();g.fill()}   // raggi di luce dall'alto
 g.restore();
 for(const q of M.vent||[]){if(!xInT(q.x,q.y,80,x0,y0))continue;xc(g,q.x,q.y,20,'#2a3a3a');xc(g,q.x,q.y,13,'#0c1414');for(let i=0;i<9;i++){const a=hs(i,q.s,1)*TAU,d=10+hs(i,q.s,2)*46;xc(g,q.x+Math.cos(a)*d*.5,q.y+Math.sin(a)*d*.5-d*.4,2+hs(i,q.s,3)*4,'rgba(210,250,255,.45)')}}}   // sorgenti di bolle

// --- STAZIONE ORBITALE: il pianeta visto dall'orbita (img/AGorbit.jpg, ruotata dal seed), le stelle, gli scafi del cantiere orbitante e i satelliti nel vuoto;
// sopra, i ponti delle piattaforme (stesse forme della maschera del vuoto, un po' più larghe): ombra, bordo, fascia di pericolo, luci di posizione, lamiere
const ORB_IMG={p:null,im:null,sd:null,fail:0},ORB_PL=[.8,1.32,1.02];   // immagine del pianeta · centro (x, y) e raggio del pianeta nell'immagine, in frazioni del lato
// caricamento robusto: si prova img/AGorbit.jpg (e due varianti del percorso), si aspetta fino a 25 s; un fallimento NON resta in memoria per sempre
// (si riprova alla mappa successiva) e nel frattempo si usa un pianeta procedurale dettagliato (xOrbProc), mai più il disco blu sfumato
const ORB_SRC=['img/AGorbit.jpg','AGorbit.jpg','img/agorbit.jpg'];
function xOrbImg(){if(ORB_IMG.im)return Promise.resolve();if(ORB_IMG.p&&(!ORB_IMG.fail||ORB_IMG.sd===(M?M.seed:null)))return ORB_IMG.p;ORB_IMG.fail=0;ORB_IMG.sd=(M?M.seed:null);
 return ORB_IMG.p=new Promise(res=>{if(typeof Image=='undefined'){res();return}let k=0,done=0;const t0=setTimeout(()=>{if(!done){done=1;ORB_IMG.fail=1;console.warn('AIRGRUNT: img/AGorbit.jpg non caricata in tempo, uso il pianeta procedurale');res()}},25000);
  const next=()=>{if(done)return;if(k>=ORB_SRC.length){done=1;ORB_IMG.fail=1;clearTimeout(t0);console.warn('AIRGRUNT: img/AGorbit.jpg non trovata (mettila nella cartella img accanto ad AGcore.html), uso il pianeta procedurale');res();return}
   const im=new Image(),src=ORB_SRC[k++];im.onload=()=>{if(done)return;if(!im.naturalWidth&&!im.width){next();return}done=1;clearTimeout(t0);ORB_IMG.im=im;res()};im.onerror=next;im.src=src};next()})}
if(typeof document!='undefined'&&typeof Image!='undefined')setTimeout(()=>{if(!ORB_IMG.im&&!ORB_IMG.p)xOrbImg()},50);   // precarica subito: a mappa pronta l'immagine c'è già
// pianeta procedurale (riserva): la parte di pianeta che cade sulla mappa, resa a 1024² in coordinate del mondo come l'immagine:
// oceani profondi e bassi fondali, continenti con rilievo ombreggiato, deserti, foreste, montagne innevate, laghi, macchie urbane
// con le luci delle città sul lato in ombra, nuvole a bande e vortici, crepuscolo e alone d'atmosfera sul bordo
const XPL={cv:null,sd:null,p:null};
function xOrbProc(){if(XPL.cv&&XPL.sd===M.seed)return Promise.resolve(XPL.cv);if(XPL.p&&XPL.sd===M.seed)return XPL.p;XPL.sd=M.seed;XPL.cv=null;
 return XPL.p=(async()=>{const N=640,cv=document.createElement('canvas');cv.width=cv.height=N;const g=cv.getContext('2d'),id=g.createImageData(N,N),D=id.data;
  const R=rng(((M.seed|0)^0x51A7)>>>0),PM=new Uint8Array(512),VL=new Float32Array(256);{const p=[];for(let i=0;i<256;i++){p.push(i);VL[i]=R()}for(let i=255;i>0;i--){const j=R()*(i+1)|0,t=p[i];p[i]=p[j];p[j]=t}for(let i=0;i<512;i++)PM[i]=p[i&255]}
  const h3=(a,b,c)=>VL[PM[PM[PM[a&255]+(b&255)]+(c&255)]];
  const n3=(x,y,z)=>{const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),xf=x-xi,yf=y-yi,zf=z-zi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf),
    a0=h3(xi,yi,zi),a1=h3(xi+1,yi,zi),a2=h3(xi,yi+1,zi),a3=h3(xi+1,yi+1,zi),b0=h3(xi,yi,zi+1),b1=h3(xi+1,yi,zi+1),b2=h3(xi,yi+1,zi+1),b3=h3(xi+1,yi+1,zi+1),
    c0=a0+(a1-a0)*u,c1=a2+(a3-a2)*u,d0=b0+(b1-b0)*u,d1=b2+(b3-b2)*u,e0=c0+(c1-c0)*v,e1=d0+(d1-d0)*v;return e0+(e1-e0)*w};
  const fb=(x,y,z,o)=>{let s=0,a=.5,f=1,t=0;for(let i=0;i<o;i++){s+=a*n3(x*f,y*f,z*f);t+=a;a*=.5;f*=2.03}return s/t};
  const[px,py,pr]=xOrbPlanet(),S=WW/N,dm=Math.hypot(WW/2-px,WH/2-py)||1,ux=(WW/2-px)/dm,uy=(WH/2-py)/dm,Lx=ux*.75-uy*.4,Ly=uy*.75+ux*.4,Lz=.5,ll=Math.hypot(Lx,Ly,Lz),sx=Lx/ll,sy=Ly/ll,sz=Lz/ll,ox=R()*50,oy=R()*50,oz=R()*50,
   lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t],cl=v=>v<0?0:v>1?1:v;
  const C={deep:[6,24,58],sea:[16,62,120],shal:[34,120,160],sand:[196,180,128],grass:[62,112,52],forest:[30,74,38],dry:[150,132,78],des:[202,164,104],rock:[112,98,84],snow:[236,240,246],ice:[220,232,244],city:[120,116,108]};
  for(let j=0;j<N;j++){if((j&63)==63)await new Promise(r=>setTimeout(r,0));const wy=(j+.5)*S;
   for(let i=0;i<N;i++){const wx=(i+.5)*S,dx=(wx-px)/pr,dy=(wy-py)/pr,d2=dx*dx+dy*dy,k=(j*N+i)*4;
    if(d2>=1){const d=Math.sqrt(d2);if(d<1.06){const a=Math.pow(1-(d-1)/.06,2.2)*.85;D[k]=90;D[k+1]=170;D[k+2]=255;D[k+3]=a*255}continue}   // alone esterno
    const z=Math.sqrt(1-d2),X=dx*2.4+ox,Y=dy*2.4+oy,Z=z*2.4+oz,lat=Math.abs(dy*.9+z*.3);
    const lo=(fb(X*.4,Y*.4,Z*.4,2)-.5)*.5;let e=fb(X,Y,Z,6)+lo;const wet=fb(X*1.7+9,Y*1.7,Z*1.7,3),e2=fb(X+.02,Y+.02,Z,4)+lo;
    let c,land=e>.53;
    if(!land){const t=cl((e-.36)/.17);c=t<.7?lerp(C.deep,C.sea,t/.7):lerp(C.sea,C.shal,(t-.7)/.3)}
    else{const h=(e-.53)/.25;if(h<.03)c=C.sand;else if(h>.62)c=lerp(C.rock,C.snow,cl((h-.62)/.2));else if(h>.42)c=lerp(C.forest,C.rock,cl((h-.42)/.2));
     else{const dr=cl((.5-wet)*2.6+(lat<.35?.25:-.25));c=lerp(wet>.55?C.forest:C.grass,dr>.5?C.des:C.dry,dr)}
     const u=fb(X*5+70,Y*5,Z*5,3);if(h>.05&&h<.35&&u<.3)c=lerp(c,C.sea,.85);   // laghi
    if(h>.02&&h<.3&&u>.64)c=lerp(c,C.city,cl((u-.64)*7));   // macchie urbane
     const sh=cl(.5+(e-e2)*55);c=lerp(c,[0,0,0],(1-sh)*.45)}   // rilievo ombreggiato
    let cf=fb(X*1.3+20+Math.sin(Y*3)*.4,Y*2.6,Z*1.3,5);cf=cl((cf-.5)*3.2);const sw=fb(X*.7,Y*.7+5,Z*.7,2);cf=cl(cf+Math.max(0,sw-.62)*3*Math.sin((X+Y)*8));   // nuvole a bande e vortici
    const lt=dx*sx+dy*sy+z*sz,day=cl(lt*2.2+.25);c=lerp(c,[250,252,255],cf*.9);
    let r=c[0]*day,gg=c[1]*day,b=c[2]*day;
    if(land&&day<.35&&cf<.4){const u=fb(X*5+70,Y*5,Z*5,2),ct=n3(X*60,Y*60,Z*60);if(u>.6&&ct>.55){const q=(1-day/.35)*(ct-.55)*4;r+=255*q;gg+=190*q;b+=90*q}}   // luci delle città di notte
    if(lt>-.08&&lt<.12){const q=1-Math.abs(lt-.02)/.1;if(q>0){r+=45*q;gg+=16*q}}   // crepuscolo
    const at=Math.pow(1-z,2.4);r=r*(1-at*.75)+110*at;gg=gg*(1-at*.75)+180*at;b=b*(1-at*.75)+255*at;   // atmosfera verso il bordo
    D[k]=r>255?255:r;D[k+1]=gg>255?255:gg;D[k+2]=b>255?255:b;D[k+3]=255}}
  g.putImageData(id,0,0);XPL.cv=cv;return cv})()}
function xOrbPlanet(){const r=M.orb.rot|0,u=ORB_PL[0]-.5,v=ORB_PL[1]-.5,c=Math.cos(r*XH),s=Math.sin(r*XH);return[WW/2+(u*c-v*s)*WW,WH/2+(u*s+v*c)*WH,ORB_PL[2]*WW]}   // centro e raggio nel mondo
let _xhz=null;   // fascia di pericolo gialla e nera (immagine del motivo, creata una volta)
function xOrbShape(g,s,e){if(s.k=='c'){g.beginPath();g.arc(s.x,s.y,s.r+e,0,TAU);g.fill();return}
 if(s.k=='r'){const c=Math.cos(s.a),n=Math.sin(s.a),hw=s.w/2+e,hh=s.h/2+e;g.beginPath();for(const[u,v]of[[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]])g.lineTo(s.x+u*c-v*n,s.y+u*n+v*c);g.closePath();g.fill();return}
 g.lineWidth=s.w+2*e;g.lineCap='round';g.lineJoin='round';pline(g,s.pts);g.stroke()}
async function orbGround(g,x0,y0){await xOrbImg();const PC=ORB_IMG.im?null:await xOrbProc();const x1=x0+CH,y1=y0+CH,sd=M.seed+91,[px,py,pr]=xOrbPlanet();
 xr(g,x0,y0,CH,CH,'#02030a');
 if(ORB_IMG.im){g.save();g.beginPath();g.rect(x0,y0,CH,CH);g.clip();g.translate(WW/2,WH/2);g.rotate((M.orb.rot|0)*XH);g.drawImage(ORB_IMG.im,-WW/2,-WH/2,WW,WH);g.restore()}
 else if(PC){g.save();g.beginPath();g.rect(x0,y0,CH,CH);g.clip();g.imageSmoothingEnabled=true;g.drawImage(PC,0,0,WW,WH);g.restore()}   // riserva: pianeta procedurale
 for(let cy=Math.floor(y0/48);cy<y1/48;cy++)for(let cx=Math.floor(x0/48);cx<x1/48;cx++){const h=hs(cx,cy,sd+3);if(h>.4)continue;const x=(cx+hs(cx,cy,sd+4))*48,y=(cy+hs(cx,cy,sd+5))*48;if(Math.hypot(x-px,y-py)<pr*1.03)continue;   // stelle (non davanti al pianeta)
  const s=.5+h*h*8;xc(g,x,y,s,h<.04?'#9fc8ff':h<.09?'#ffe0a0':'#ffffff');if(h<.025){g.strokeStyle='rgba(255,255,255,.45)';g.lineWidth=1;g.beginPath();g.moveTo(x-9,y);g.lineTo(x+9,y);g.moveTo(x,y-9);g.lineTo(x,y+9);g.stroke()}}
 for(const q of M.orb.sats||[])if(xInT(q.x,q.y,160,x0,y0))xOrbSat(g,q);
 for(const q of M.orb.ships||[])if(xInT(q.x,q.y,q.L*.75,x0,y0))xOrbShip(g,q);
 const P=(M.orb.plat||[]).filter(s=>!s.ship&&s.bb[0]<x1+160&&s.bb[2]>x0-160&&s.bb[1]<y1+160&&s.bb[3]>y0-160);if(!P.length)return;
 const L=(e,fs)=>{g.fillStyle=fs;g.strokeStyle=fs;for(const s of P)xOrbShape(g,s,e)};
 if(!_xhz){_xhz=document.createElement('canvas');_xhz.width=_xhz.height=32;const h=_xhz.getContext('2d');h.fillStyle='#1a1c20';h.fillRect(0,0,32,32);h.fillStyle='#d8b02a';for(const o of[-32,0,32]){h.beginPath();h.moveTo(o,0);h.lineTo(o+16,0);h.lineTo(o+48,32);h.lineTo(o+32,32);h.closePath();h.fill()}}
 L(36,'#14181e');L(30,g.createPattern(_xhz,'repeat'));L(22,'#2a313b');
 g.fillStyle='#7fe8ff';for(const s of P){if(s.k=='c'){const n=Math.max(6,Math.round(s.r*TAU/90));for(let i=0;i<n;i++){const a=i*TAU/n;xc(g,s.x+Math.cos(a)*(s.r+26),s.y+Math.sin(a)*(s.r+26),2.6,i%5?'#7fe8ff':'#ff5a4a')}}   // luci di posizione sul bordo
  else if(s.k=='l'){let acc=0;for(let i=1;i<s.pts.length;i++){const a=s.pts[i-1],b=s.pts[i],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1;acc+=l;if(acc<110&&s.pts.length>2)continue;acc=0;const nx=-(b[1]-a[1])/l,ny=(b[0]-a[0])/l,o=s.w/2+26;
   for(const sd2 of[-1,1])xc(g,b[0]+nx*o*sd2,b[1]+ny*o*sd2,2.6,'#7fe8ff')}}}
 L(14,xPat(g,'deck','#5a626e','#3a414c'));
 g.save();g.globalAlpha=.16;L(14,'#000000');g.restore();   // ponte un po' più scuro: le strade e i piazzali risaltano
 for(const s of P)if(s.cw){const a=s.pts[0],b=s.pts[1],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1,ux=(b[0]-a[0])/l,uy=(b[1]-a[1])/l,nx=-uy,ny=ux,hw=s.w/2+6;   // passerelle: corrimano e traversine
  g.strokeStyle='#8a929e';g.lineWidth=5;g.beginPath();for(const sd2 of[-1,1]){g.moveTo(a[0]+nx*hw*sd2,a[1]+ny*hw*sd2);g.lineTo(b[0]+nx*hw*sd2,b[1]+ny*hw*sd2)}g.stroke();
  g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=3;g.beginPath();for(let t=20;t<l;t+=40){const x=a[0]+ux*t,y=a[1]+uy*t;g.moveTo(x-nx*hw,y-ny*hw);g.lineTo(x+nx*hw,y+ny*hw)}g.stroke()}
 xOrbPads(g,x0,y0);
 g.fillStyle=g.strokeStyle='#000';g.lineWidth=1;g.lineCap=g.lineJoin='round'}   // niente motivi lasciati attivi per gli strati successivi
// pista di partenza: piazzole numerate delle navette (cerchio giallo, croce, segni di allineamento), cerchio d'atterraggio, frecce, scritta del settore
function xOrbPads(g,x0,y0){const O=M.orb;if(!O.pads&&!O.marks)return;
 for(const q of O.pads||[]){if(!xInT(q.x,q.y,q.r+40,x0,y0))continue;g.save();g.translate(q.x,q.y);g.rotate(q.a);
  g.fillStyle='rgba(20,24,30,.55)';g.beginPath();g.arc(0,0,q.r,0,TAU);g.fill();
  g.strokeStyle='#d8b02a';g.lineWidth=8;g.setLineDash([34,18]);g.beginPath();g.arc(0,0,q.r-8,0,TAU);g.stroke();g.setLineDash([]);
  g.strokeStyle='rgba(216,176,42,.55)';g.lineWidth=4;g.beginPath();g.arc(0,0,q.r*.55,0,TAU);g.moveTo(-q.r+20,0);g.lineTo(q.r-20,0);g.moveTo(0,-q.r+20);g.lineTo(0,q.r-20);g.stroke();
  for(const s of[-1,1]){g.fillStyle='#d8b02a';g.beginPath();g.moveTo(s*(q.r+6),0);g.lineTo(s*(q.r+26),-12);g.lineTo(s*(q.r+26),12);g.closePath();g.fill()}   // segni di allineamento
  g.save();g.translate(0,q.r*.78);g.rotate(baseAng(0)-q.a);g.fillStyle='rgba(235,240,245,.8)';g.font='bold 40px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(String(q.n).padStart(2,'0'),0,0);g.restore();
  for(let i=0;i<8;i++){const a=i*TAU/8+TAU/16;xc(g,Math.cos(a)*(q.r+14),Math.sin(a)*(q.r+14),3.4,i%2?'#ff5a4a':'#7fe8ff')}g.restore()}
 for(const k of O.marks||[]){
  if(k.k=='ring'){if(!xInT(k.x,k.y,k.r+30,x0,y0))continue;g.strokeStyle='rgba(127,232,255,.5)';g.lineWidth=10;g.beginPath();g.arc(k.x,k.y,k.r,0,TAU);g.stroke();
   g.strokeStyle='rgba(216,176,42,.7)';g.lineWidth=5;g.setLineDash([22,22]);g.beginPath();g.arc(k.x,k.y,k.r+18,0,TAU);g.stroke();g.setLineDash([]);
   g.fillStyle='rgba(216,176,42,.75)';for(let i=0;i<4;i++){const a=i*XH+XH/2;g.save();g.translate(k.x+Math.cos(a)*(k.r-26),k.y+Math.sin(a)*(k.r-26));g.rotate(a+Math.PI);g.beginPath();g.moveTo(-12,-14);g.lineTo(12,0);g.lineTo(-12,14);g.closePath();g.fill();g.restore()}}   // frecce verso il centro
  else if(k.k=='arr'){if(!xInT(k.p[0],k.p[1],90,x0,y0))continue;g.save();g.translate(k.p[0],k.p[1]);g.rotate(k.a);g.fillStyle='rgba(235,240,245,.55)';
   for(const d of[-34,10]){g.beginPath();g.moveTo(d,-26);g.lineTo(d+30,0);g.lineTo(d,26);g.lineTo(d+12,0);g.closePath();g.fill()}g.restore()}   // doppia freccia verso l'uscita
  else if(k.k=='txt'){if(!xInT(k.p[0],k.p[1],200,x0,y0))continue;g.save();g.translate(k.p[0],k.p[1]);g.rotate(k.a);g.fillStyle='rgba(216,176,42,.7)';g.font='bold 36px sans-serif';g.textAlign='left';g.textBaseline='middle';g.fillText(k.t,0,0);g.restore()}}}
// scafo in costruzione: lamiere da poppa fino a q.done, il resto a costole e longheroni; impalcatura gialla, saldature accese, motori a poppa
function xOrbShip(g,q){const L=q.L,W=q.W,H=(i,k)=>hs(i,q.s,k);g.save();g.translate(q.x,q.y);g.rotate(q.a);
 const hull=()=>{g.beginPath();g.moveTo(L/2,0);g.quadraticCurveTo(L*.36,-W*.5,L*.12,-W/2);g.lineTo(-L/2,-W*.42);g.lineTo(-L/2,W*.42);g.lineTo(L*.12,W/2);g.quadraticCurveTo(L*.36,W*.5,L/2,0);g.closePath()};
 hull();g.fillStyle='#070a10';g.fill();g.save();hull();g.clip();const xd=-L/2+L*q.done;
 g.fillStyle='#7a828e';g.fillRect(-L/2,-W,xd+L/2,W*2);g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=2;g.beginPath();for(let x=-L/2+48;x<xd;x+=48){g.moveTo(x,-W);g.lineTo(x,W)}for(let y=-W/2+W/6;y<W/2;y+=W/6){g.moveTo(-L/2,y);g.lineTo(xd,y)}g.stroke();   // lamiere
 for(let i=0;i<6;i++)xr(g,-L/2+H(i,1)*(xd+L/2-60),-W*.4+H(i,2)*W*.7,40+H(i,3)*40,10,i%2?'#5a626e':'#9aa2ae');
 g.strokeStyle='#4a5260';g.lineWidth=7;g.beginPath();for(let x=xd+20;x<L/2;x+=44){g.moveTo(x,-W);g.lineTo(x,W)}g.stroke();   // costole
 g.strokeStyle='#5e6674';g.lineWidth=5;g.beginPath();for(const y of[-W*.28,0,W*.28]){g.moveTo(xd,y);g.lineTo(L/2,y)}g.stroke();g.restore();
 hull();g.strokeStyle='#2a3038';g.lineWidth=4;g.stroke();
 for(const y of[-W*.28,0,W*.28]){xc(g,-L/2-6,y,W*.13,'#2a2e34');xc(g,-L/2-6,y,W*.08,'#14171b')}   // ugelli
 g.strokeStyle='rgba(216,176,42,.75)';g.lineWidth=3;const sx=-L*.55,ex=L*.55,sy=W*.75;g.beginPath();for(const s of[-1,1]){g.moveTo(sx,sy*s);g.lineTo(ex,sy*s)}for(let x=sx;x<=ex;x+=70){g.moveTo(x,-sy);g.lineTo(x,sy*-.62);g.moveTo(x,sy);g.lineTo(x,sy*.62)}g.stroke();   // impalcatura
 g.lineWidth=1.5;g.beginPath();for(let x=sx;x<ex;x+=70)for(const s of[-1,1]){g.moveTo(x,sy*s);g.lineTo(x+70,sy*.62*s)}g.stroke();
 for(let i=0;i<5;i++){const x=xd+(H(i,5)-.3)*60,y=(H(i,6)-.5)*W*.8;xGlow(g,x,y,26,'#ffd27a',.7);xc(g,x,y,3,'#ffffff')}   // saldature
 for(const s of[-1,1])for(const x of[sx,ex])xc(g,x,sy*s,4,s>0?'#5aff8a':'#ff4a4a');
 g.restore()}
function xOrbSat(g,q){g.save();g.translate(q.x,q.y);g.rotate(q.a);g.scale(q.sz,q.sz);
 for(const s of[-1,1]){xr(g,s>0?14:-74,-16,60,32,'#1a3a6a');g.strokeStyle='rgba(150,200,255,.4)';g.lineWidth=1;g.beginPath();for(let x=0;x<=60;x+=12){g.moveTo((s>0?14:-74)+x,-16);g.lineTo((s>0?14:-74)+x,16)}g.moveTo(s>0?14:-74,0);g.lineTo(s>0?74:-14,0);g.stroke()}
 xr(g,-14,-3,28,6,'#8a929e');xrr(g,-12,-12,24,24,4,'#c9ccd2');xc(g,0,0,7,'#5a626e');xc(g,4,-4,2,'#ff5a4a');g.restore()}

// --- disegni dei temi: alberi (cristalli di Nettuno, alghe e coralli del fondale), pesci, sottomarini
const XTREE={
 nep(c,o,f){const r=o.r,x=o.x,y=o.y,hu=[192,272,165][o.tn|0],H=k=>hs(o.id|0,k,913);
  c.fillStyle='rgba(0,0,0,.3)';c.beginPath();c.ellipse(x+r*.4,y+r*.5,r*.9,r*.75,0,0,TAU);c.fill();
  const gl=c.createRadialGradient(x,y,0,x,y,r*1.4);gl.addColorStop(0,'hsla('+hu+',95%,65%,'+(.38*f+.05)+')');gl.addColorStop(1,'hsla('+hu+',95%,65%,0)');c.fillStyle=gl;c.beginPath();c.arc(x,y,r*1.4,0,TAU);c.fill();
  c.fillStyle='hsl('+hu+',25%,15%)';c.beginPath();c.arc(x,y,r*.5,0,TAU);c.fill();
  const n=Math.max(3,Math.round((5+H(1)*3)*(.45+.55*f)));
  for(let i=0;i<n;i++){const a=i/n*TAU+H(i+2)*.8,Lh=r*(.55+H(i+12)*.5),w=r*(.15+H(i+22)*.1),ca=Math.cos(a),sa=Math.sin(a),nx=-sa*w,ny=ca*w,bx=x+ca*r*.1,by=y+sa*r*.1,mx=x+ca*Lh*.72,my=y+sa*Lh*.72,tx=x+ca*Lh,ty=y+sa*Lh;
   const gr=c.createLinearGradient(bx,by,tx,ty);gr.addColorStop(0,'hsl('+hu+',55%,'+(12+8*f)+'%)');gr.addColorStop(1,'hsl('+hu+',90%,'+(40+32*f)+'%)');c.fillStyle=gr;
   c.beginPath();c.moveTo(bx+nx,by+ny);c.lineTo(mx+nx*.8,my+ny*.8);c.lineTo(tx,ty);c.lineTo(mx-nx*.8,my-ny*.8);c.lineTo(bx-nx,by-ny);c.closePath();c.fill();
   c.strokeStyle='rgba(235,255,255,'+(.25+.35*f)+')';c.lineWidth=1;c.beginPath();c.moveTo(bx+nx*.2,by+ny*.2);c.lineTo(mx+nx*.3,my+ny*.3);c.lineTo(tx,ty);c.stroke()}
  c.fillStyle='rgba(230,255,255,'+(.5*f)+')';c.beginPath();c.arc(x,y,r*.12,0,TAU);c.fill()},
 sea(c,o,f){const r=o.r,x=o.x,y=o.y,H=k=>hs(o.id|0,k,917),t=o.tn|0;
  c.fillStyle='rgba(0,0,0,.25)';c.beginPath();c.ellipse(x+r*.35,y+r*.45,r*.85,r*.7,0,0,TAU);c.fill();c.lineCap='round';
  if(t==0){const n=6+(H(1)*3|0);for(let i=0;i<n;i++){const a=i/n*TAU+H(i+2),L=r*(.75+H(i+5)*.4),ca=Math.cos(a),sa=Math.sin(a),w=(H(i+9)-.5)*r*.7;   // alghe giganti: fronde dal piede, foglie e vescicole
    c.strokeStyle=f>.5?'#6a5a1e':'#4a3a18';c.lineWidth=2.2;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+ca*L*.5-sa*w,y+sa*L*.5+ca*w,x+ca*L,y+sa*L);c.stroke();
    for(let k=1;k<5;k++){const u=k/5,px=x+ca*L*u-sa*w*u*(1-u)*2,py=y+sa*L*u+ca*w*u*(1-u)*2;c.fillStyle=k%2?'#5a7a24':'#6e8a2a';c.beginPath();c.ellipse(px,py,r*.16,r*.07,a+(k%2?.6:-.6),0,TAU);c.fill()}
    c.fillStyle='#c9b23a';c.beginPath();c.arc(x+ca*L,y+sa*L,r*.07,0,TAU);c.fill()}c.fillStyle='#3a3014';c.beginPath();c.arc(x,y,r*.16,0,TAU);c.fill()}
  else if(t==1){const col=['#e0405a','#ff8a3a','#b04ae0'][(o.id|0)%3],a0=H(1)*TAU;c.fillStyle=col;c.globalAlpha=.35*f+.2;c.beginPath();c.moveTo(x,y);c.arc(x,y,r,a0-1.1,a0+1.1);c.closePath();c.fill();c.globalAlpha=1;   // gorgonia a ventaglio
   c.strokeStyle=col;c.lineWidth=2;for(let i=0;i<9;i++){const a=a0-1+i*.25,L=r*(.75+H(i+3)*.25);c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+Math.cos(a+.15)*L*.5,y+Math.sin(a+.15)*L*.5,x+Math.cos(a)*L,y+Math.sin(a)*L);c.stroke()}
   c.lineWidth=.8;c.strokeStyle='rgba(255,230,230,.45)';for(let k=2;k<5;k++){c.beginPath();c.arc(x,y,r*k/5,a0-1,a0+1);c.stroke()}}
  else{const col=['#d8b46a','#e07a8a','#7ad0a0'][(o.id|0)%3];c.fillStyle=col;c.beginPath();c.arc(x,y,r*.8,0,TAU);c.fill();   // corallo a cervello
   c.strokeStyle='rgba(0,0,0,.28)';c.lineWidth=2;for(let i=0;i<6;i++){c.beginPath();const a=H(i+1)*TAU;c.arc(x+Math.cos(a)*r*.15,y+Math.sin(a)*r*.15,r*(.2+i*.1),a,a+2.4);c.stroke()}
   c.fillStyle='rgba(255,255,255,'+(.25*f)+')';c.beginPath();c.arc(x-r*.3,y-r*.3,r*.22,0,TAU);c.fill()}}};
// pesce visto dall'alto (prua verso +x), stessi colori degli omini: b corpo, h coda e strisce, fr fotogramma della coda
function xFish(b,h,fr){civSpr();const F=CIVS.f||(CIVS.f={}),k=(b*64+h)*2+fr;return F[k]||(F[k]=CIVS.mk(22,14,g=>{const c=CPAL[b],c2=CPAL[h],t=fr?2.5:-2.5;
 g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.ellipse(2,2.5,6.5,3,0,0,TAU);g.fill();
 g.fillStyle=c2;g.beginPath();g.moveTo(-4.5,0);g.lineTo(-10,-4+t);g.lineTo(-8.5,t*.4);g.lineTo(-10,4+t);g.closePath();g.fill();   // coda
 g.beginPath();g.moveTo(-1.5,-2.5);g.lineTo(1.5,-5.5);g.lineTo(3,-2.3);g.closePath();g.fill();g.beginPath();g.moveTo(-1.5,2.5);g.lineTo(1.5,5.5);g.lineTo(3,2.3);g.closePath();g.fill();   // pinne
 g.fillStyle=c;g.strokeStyle='#111';g.lineWidth=.7;g.beginPath();g.ellipse(0,0,6.8,3.1,0,0,TAU);g.fill();g.stroke();
 g.strokeStyle=c2;g.lineWidth=1.1;g.beginPath();g.moveTo(-1.2,-2.8);g.lineTo(-1.2,2.8);g.moveTo(1.8,-2.9);g.lineTo(1.8,2.9);g.stroke();   // strisce
 g.fillStyle='#fff';g.beginPath();g.arc(4.3,-1.2,1,0,TAU);g.arc(4.3,1.2,1,0,TAU);g.fill();g.fillStyle='#000';g.beginPath();g.arc(4.6,-1.2,.5,0,TAU);g.arc(4.6,1.2,.5,0,TAU);g.fill()},CIV_SP))}
// sottomarini civili (fondale marino) al posto dei veicoli civili: [lunghezza, larghezza, stile] per tipo di CIV_VEH
const XSUB={berlina:[36,16,0],sportiva:[40,13,1],pickup:[42,18,2],furgone:[44,18,2],autobus:[68,22,3],camion:[62,22,2],jeep:[34,16,0],blindato:[50,22,4]};
const xCivArt=n=>thExt()=='sea'?(g,col)=>xSub(g,col,n):null;
function xSub(g,col,n){const[l,w,k]=XSUB[n]||[40,18,0],hl=l/2,hw=w/2,dk=xmix(col,'#000000',.4);
 g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.ellipse(2,3,hl,hw,0,0,TAU);g.fill();
 g.fillStyle=dk;for(const s of[-1,1]){g.beginPath();g.moveTo(-hl+6,s*hw*.3);g.lineTo(-hl-2,s*(hw+3));g.lineTo(-hl+10,s*hw*.7);g.closePath();g.fill();g.beginPath();g.moveTo(hl*.15,s*hw*.8);g.lineTo(-hl*.05,s*(hw+3));g.lineTo(-hl*.25,s*hw*.8);g.closePath();g.fill()}   // pinne di coda e laterali
 xr(g,-hl-4,-hw*.55,5,hw*1.1,'#2a2e34');g.strokeStyle='rgba(210,230,240,.7)';g.lineWidth=1.3;g.beginPath();g.moveTo(-hl-2,-hw*.48);g.lineTo(-hl-2,hw*.48);g.stroke();   // elica intubata
 g.fillStyle=col;g.strokeStyle='#111';g.lineWidth=1.2;g.beginPath();g.ellipse(0,0,hl,hw,0,0,TAU);g.fill();g.stroke();
 g.fillStyle='rgba(255,255,255,.22)';g.beginPath();g.ellipse(-hl*.1,-hw*.38,hl*.7,hw*.22,0,0,TAU);g.fill();
 if(k==1){g.fillStyle='rgba(255,255,255,.55)';g.fillRect(-hl+4,-1,l-8,2)}
 if(k==2){xrr(g,-hl*.75,-hw*.62,hl*.9,hw*1.24,3,xmix(col,'#ffffff',.25));g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=1;g.strokeRect(-hl*.75,-hw*.62,hl*.9,hw*1.24)}   // capsula di carico
 if(k==3){for(let x=-hl*.6;x<hl*.4;x+=9){xc(g,x,-hw*.45,2,'#9fe8ff');xc(g,x,hw*.45,2,'#9fe8ff')}}   // oblò del sottomarino da trasporto
 if(k==4){g.fillStyle='#1a1d22';for(const s of[-1,1])g.fillRect(hl*.35,s*hw*.55-1.5,hl*.6,3);xc(g,-hl*.15,0,hw*.5,dk);g.strokeStyle='#111';g.lineWidth=1;g.stroke()}   // tubi lanciasiluri e torretta
 const gx=k==3?hl*.62:hl*.38;g.fillStyle='#8fdcff';g.strokeStyle='#111';g.lineWidth=1;g.beginPath();g.ellipse(gx,0,hw*.7,hw*.58,0,0,TAU);g.fill();g.stroke();xc(g,gx-hw*.18,-hw*.2,hw*.17,'rgba(255,255,255,.75)');   // cupola
 xc(g,hl-1,-hw*.42,1.6,'#fff6c0');xc(g,hl-1,hw*.42,1.6,'#fff6c0')}   // fari
// macchine volanti del fondale (in fondo ad AGveh.js): k 0 manta, 1 drone a quattro eliche, 2 sottomarino da carico, 3 siluro veloce; c0 carrozzeria, c1 dettagli
function xSkySub(g,k,c0,c1){g.lineJoin='round';g.lineWidth=1.2;g.strokeStyle='#111';const glass='#9fe8ff';
 g.fillStyle='rgba(210,250,255,.5)';for(let i=0;i<4;i++){g.beginPath();g.arc(-24-i*3.5,(i%2?2:-2),1.4+i*.3,0,TAU);g.fill()}   // scia di bolle
 if(k===0){g.fillStyle=c0;g.beginPath();g.moveTo(20,0);g.quadraticCurveTo(8,-6,-4,-17);g.lineTo(-12,-15);g.quadraticCurveTo(-10,-4,-16,0);g.quadraticCurveTo(-10,4,-12,15);g.lineTo(-4,17);g.quadraticCurveTo(8,6,20,0);g.closePath();g.fill();g.stroke();
  g.strokeStyle=c1;g.lineWidth=2;g.beginPath();g.moveTo(-4,-15);g.quadraticCurveTo(4,-6,14,-2);g.moveTo(-4,15);g.quadraticCurveTo(4,6,14,2);g.stroke();g.strokeStyle='#111';g.lineWidth=1.2;g.beginPath();g.moveTo(-16,0);g.lineTo(-25,0);g.stroke();
  g.fillStyle=glass;g.beginPath();g.ellipse(8,0,5,3.4,0,0,TAU);g.fill();g.stroke()}
 else if(k===1){for(const[x,y]of[[12,-10],[12,10],[-12,-10],[-12,10]]){g.fillStyle='#22282e';g.beginPath();g.arc(x,y,6.5,0,TAU);g.fill();g.stroke();g.strokeStyle='rgba(200,240,255,.6)';g.lineWidth=1;g.beginPath();g.moveTo(x-4,y);g.lineTo(x+4,y);g.stroke();g.strokeStyle='#111';g.lineWidth=1.2}
  g.fillStyle=c0;g.beginPath();g.ellipse(0,0,12,8,0,0,TAU);g.fill();g.stroke();g.fillStyle=glass;g.beginPath();g.ellipse(4,0,5,4.4,0,0,TAU);g.fill();g.fillStyle=c1;g.fillRect(-8,-2,5,4)}
 else if(k===2){g.fillStyle=c0;g.beginPath();g.ellipse(0,0,21,10,0,0,TAU);g.fill();g.stroke();g.fillStyle=c1;g.beginPath();g.roundRect(-14,-6.5,18,13,3);g.fill();g.stroke();
  g.fillStyle='#2a2e34';g.fillRect(-25,-5,5,10);g.fillStyle=glass;g.beginPath();g.ellipse(12,0,5,4.5,0,0,TAU);g.fill();g.stroke()}
 else{g.fillStyle=c0;g.beginPath();g.ellipse(0,0,22,5.5,0,0,TAU);g.fill();g.stroke();g.fillStyle=c1;for(const s of[-1,1]){g.beginPath();g.moveTo(-12,s*4);g.lineTo(-20,s*11);g.lineTo(-17,s*3);g.closePath();g.fill();g.stroke()}
  g.fillStyle=glass;g.beginPath();g.ellipse(9,0,5,3,0,0,TAU);g.fill();g.stroke();g.fillStyle='#ffd27a';g.beginPath();g.arc(-22,0,2.2,0,TAU);g.fill()}}

// mega escavatore a ruota di tazze, visto dall'alto (+x = verso la ruota): cingoli, sovrastruttura con cabina, contrappeso, braccio a traliccio con nastro, ruota con tazze
XA.xexc=function(g,w,h,P,v,o){const C=({moon:['#d8d4c4','#a8a294'],mars:['#d8961a','#a86a10'],nep:['#c9a227','#8a6c12'],sea:['#e0702a','#a84a18']}[thExt()]||['#d8a21a','#a8760c']),c0=v%2?C[1]:C[0],c1=v%2?C[0]:C[1],
 hw=w/2,hh=h/2,bx=-w*.2,r=h*.38,wx=hw-r-2,dk='#24272c';
 g.lineJoin='round';g.save();g.translate(6,8);g.fillStyle='rgba(0,0,0,.35)';g.fillRect(bx-w*.2,-hh*.62-h*.11,w*.4,hh*1.24+h*.22);g.fillRect(-hw,-h*.16,bx+hw,h*.32);g.fillRect(bx,-h*.09,wx-bx,h*.18);g.beginPath();g.arc(wx,0,r+3,0,TAU);g.fill();g.restore();   // ombra della sagoma
 for(const sd of[-1,1]){xrr(g,bx-w*.2,sd*hh*.62-h*.11,w*.4,h*.22,6,dk);g.strokeStyle='#4a4e54';g.lineWidth=2;g.beginPath();for(let x=bx-w*.2+6;x<bx+w*.2-4;x+=9){g.moveTo(x,sd*hh*.62-h*.1);g.lineTo(x,sd*hh*.62+h*.1)}g.stroke()}   // cingoli
 xr(g,-hw+4,-h*.07,bx-w*.18+hw,h*.14,c1);xrr(g,-hw,-h*.16,w*.1,h*.32,4,'#3a3e44');g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=1.5;g.strokeRect(-hw+4,-h*.07,bx-w*.18+hw,h*.14);   // braccio del contrappeso
 g.fillStyle=c0;g.strokeStyle='#111';g.lineWidth=2;g.beginPath();g.moveTo(bx+w*.05,-h*.09);g.lineTo(wx,-h*.06);g.lineTo(wx,h*.06);g.lineTo(bx+w*.05,h*.09);g.closePath();g.fill();g.stroke();   // braccio della ruota
 g.strokeStyle=c1;g.lineWidth=2;g.beginPath();for(let x=bx+w*.07,u=0;x<wx-8;x+=16,u^=1){g.moveTo(x,-h*.08);g.lineTo(x+16,h*.08*(u?1:-1)*-1)}g.stroke();xr(g,bx+w*.05,-2.5,wx-bx-w*.05,5,'#2a2a2a');   // traliccio e nastro
 xrr(g,bx-w*.17,-hh*.5,w*.34,h*.5,8,c0);g.strokeStyle='#111';g.lineWidth=2;g.strokeRect(bx-w*.17,-hh*.5,w*.34,h*.5);   // sovrastruttura
 xr(g,bx-w*.12,-hh*.36,w*.1,h*.12,'#3a3e44');xr(g,bx+w*.0,-hh*.36,w*.1,h*.12,'#3a3e44');xrr(g,bx+w*.1,-hh*.46,w*.06,h*.16,3,'#8fdcff');   // macchinari e cabina
 for(let x=bx-w*.16;x<bx+w*.16;x+=14){g.fillStyle=(x/14|0)%2?'#111':'#e8c020';g.fillRect(x,hh*.38,7,5)}   // fascia di pericolo
 xc(g,wx,0,r+3,'#111');xc(g,wx,0,r,c1);xc(g,wx,0,r*.72,dk);g.strokeStyle=c0;g.lineWidth=3;g.beginPath();for(let i=0;i<8;i++){const a=i*TAU/8;g.moveTo(wx,0);g.lineTo(wx+Math.cos(a)*r*.72,Math.sin(a)*r*.72)}g.stroke();xc(g,wx,0,r*.16,c0);   // ruota
 for(let i=0;i<12;i++){const a=i*TAU/12+.1,cx=wx+Math.cos(a)*r,cy=Math.sin(a)*r;g.save();g.translate(cx,cy);g.rotate(a);xrr(g,-5,-7,12,14,3,'#5a5e64');xr(g,4,-6,3,12,'#2a2a2a');g.restore()}   // tazze
 for(const[x,y]of[[bx-w*.17,-hh*.5],[bx+w*.17,-hh*.5],[wx,-r-2],[-hw+6,0]])xc(g,x,y,3,'#ff5a4a')};
