'use strict';
/* AIRGRUNT · AGnature.js — zone naturali varie: biomi, specie di alberi, terreno, acqua, sottobosco, tracce umane, animali ed effetti d'atmosfera.
   1) GENERAZIONE (dal seed, dentro genMap: host e client ottengono lo stesso mondo)
      natBiomes  → sotto-tipo di ogni cella (pineta, latifoglie, betulle, bosco bruciato, palude, ghiaione, dune, prato fiorito): M.sub
      natKind    → specie dell'albero in base al bioma (conifere, latifoglie, palme, salici, betulle, bruciati, secchi)
      natGen     → paludi, radure, gole, crateri, grotte e miniere, massi erratici, fango, erba alta, ruscelli, banchi di sabbia, guadi, dighe di castori,
                   sorgenti termali e geyser, tronchi caduti, capanne, torrette, staccionate, rovine, relitti di guerra, totem, ponti di corda, sentieri, palme sulla costa
   2) DISEGNO DELLO SFONDO (AGbake): elementi piatti in M.flat (PF.n*), sottobosco per bioma (pNature), ninfee (pNatureWater), tinta del terreno (natTint)
   3) DISEGNO DEGLI OSTACOLI (AGart): specie di alberi (natTree) e ostacoli naturali speciali (NAT_DRAW: tronchi, torrette, menhir, colonne, ruderi, relitti, totem)
   4) VITA (solo locale, nulla in rete): branchi di cervi e cavalli, stormi, gabbiani, aironi, pesci, farfalle, foglie, polline, cenere, lucciole, nebbia,
      vapore e geyser, fumo dei fuochi. Gioco: fango e paludi rallentano il Grunt (natSlow), l'erba alta nasconde le unità a terra oltre 110 px (natHide). */

const SUB={none:0,broad:1,pine:2,burnt:3,swamp:4,birch:5,scree:6,dune:7,meadow:8};
const TK={broad:0,pine:1,palm:2,willow:3,birch:4,burnt:5,dead:6};
// livello di disegno degli elementi piatti nuovi (vedi ZZ in AGbake: 0-1 prima di tutto, 3-4 dopo i piazzali, 7 dopo l'acqua)
const NAT_Z={nmarsh:1,nclear:1,ncanyon:1,ncrater:1,ncave:1,nmud:1,ngrass:1,nspring:1,nhut:1,nruin:1,nrelic:1,npath:0,nfence2:4,nstream:3,nsandbar:7,nford:7,ndam:7,nropebr:7};
const NAT_BLOCK=['nmarsh','nclear','ncanyon','ncrater','ncave','nspring','nhut','nruin','nrelic','ngrass'];   // le scene di AGbake non ci vanno sopra
if(typeof DECO_K!=='undefined')for(const k of NAT_BLOCK)DECO_K.add(k);

// ======================================================================================
// 1) GENERAZIONE
// ======================================================================================
// sotto-tipo di ogni cella; usa solo rumore e hash (nessun numero casuale del seed: il resto della mappa non cambia)
function natBiomes(K){const{m,seed}=K,N=GW*GH,n1=mapNoise(seed+61,900),n2=mapNoise(seed+71,620),n3=mapNoise(seed+81,1300);m.sub=new Uint8Array(N);
 const wetNear=(i,j,R0)=>{for(let dy=-R0;dy<=R0;dy++)for(let dx=-R0;dx<=R0;dx++){const x=i+dx,y=j+dy;if(x>=0&&y>=0&&x<GW&&y<GH&&m.WM[y*GW+x])return true}return false};
 for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const c=j*GW+i;if(m.WM[c])continue;const x=i*TC+20,y=j*TC+20,b=m.bio[c],a=n1(x,y),q=n2(x,y),l=levelAt(x,y);
  if(b==BIO.forest)m.sub[c]=q<.24&&n3(x,y)>.5?SUB.burnt:l==0&&a<.48&&wetNear(i,j,3)?SUB.swamp:l==2||a>.6?SUB.pine:a<.33?SUB.birch:SUB.broad;
  else if(b==BIO.plain)m.sub[c]=l==0&&a<.32&&wetNear(i,j,2)?SUB.swamp:q>.66?SUB.meadow:0;
  else if(b==BIO.rock)m.sub[c]=q>.58?SUB.scree:0;
  else if(b==BIO.sand)m.sub[c]=coastV(seaV(x,y))-seaU(x,y)>220||a>.55?SUB.dune:0}}
// specie dell'albero in base al bioma della cella (hash della posizione: deterministico)
function natKind(K,x,y){const s=K.m.sub?K.m.sub[K.cell(x,y)]:0,h=hs(x|0,y|0,K.seed+91);
 switch(s){case SUB.pine:return h<.88?TK.pine:TK.broad;case SUB.burnt:return h<.78?TK.burnt:TK.dead;case SUB.swamp:return h<.62?TK.willow:TK.dead;
  case SUB.birch:return h<.62?TK.birch:TK.broad;case SUB.broad:return h<.1?TK.pine:h<.18?TK.birch:TK.broad;default:return h<.12?TK.birch:TK.broad}}

function natGen(K){const{m,R,rr,ri,pick,PROF}=K,nk=PROF.nat,cnt=a=>Math.max(0,Math.round(a*nk*(.8+R()*.4)));
 if(!m.sub)natBiomes(K);K.noSlab=1;m.slow=[];m.hide=[];m.natSpots=[];
 const NF=[],reg=(x,y,r)=>NF.push({x,y,r}),subAt=(x,y)=>m.sub[K.cell(x,y)],bioAt=(x,y)=>m.bio[K.cell(x,y)];
 const cellOK=(x,y)=>{if(!K.inMap(x,y,60))return false;const c=K.cell(x,y);return!m.own[c]&&!m.WM[c]&&m.zt[c]<=1};
 // superfici costruite (piazzali, parcheggi, campi, parchi, cortili...): la natura nuova non ci va sopra. Griglia da 256 px per cercarle in fretta
 const FG=new Map();for(const f of m.flat){if(f.k[0]=='n'&&NAT_Z[f.k]!=null||f.pts||f.x==null)continue;const R0=f.r||Math.hypot(f.w||0,f.h||0)/2;if(!R0)continue;
  for(let i=Math.floor((f.x-R0)/256);i<=Math.floor((f.x+R0)/256);i++)for(let j=Math.floor((f.y-R0)/256);j<=Math.floor((f.y+R0)/256);j++){const k=i*4096+j;if(!FG.has(k))FG.set(k,[]);FG.get(k).push(f)}}
 const onFlat=(x,y,r)=>{const L=FG.get(Math.floor(x/256)*4096+Math.floor(y/256));if(!L)return false;for(const f of L){if(f.w&&f.h){const c=Math.cos(f.a||0),sn=Math.sin(f.a||0),dx=x-f.x,dy=y-f.y;if(Math.abs(dx*c+dy*sn)<f.w/2+r&&Math.abs(-dx*sn+dy*c)<f.h/2+r)return true}else if(Math.hypot(x-f.x,y-f.y)<f.r+r)return true}return false};
 const bldNear=(x,y,r)=>qobs(x,y,r+220,[]).some(o=>!o.dead&&o.t=='b'&&o.ty!='rock'&&Math.hypot(o.x-x,o.y-y)<r+o.r+12);
 const area=(x,y,r,o)=>{o=o||{};if(!cellOK(x,y)||K.dS(x,y)<r+520||Math.hypot(x-EXT[0],y-EXT[1])<r+220)return false;
  for(let k=0;k<12;k++){const t=k/12*TAU,px=x+Math.cos(t)*r,py=y+Math.sin(t)*r;if(!K.inMap(px,py,20))return false;const c=K.cell(px,py);if(m.own[c]||m.zt[c]>1||(!o.wet&&m.WM[c]))return false}
  if(!o.road&&circOnRoad(x,y,r,10))return false;if(bldNear(x,y,r))return false;
  for(let k=0;k<9;k++){const t=k/8*TAU,d=k?r:0;if(onFlat(x+Math.cos(t)*d,y+Math.sin(t)*d,10))return false}
  if((m.keep||[]).some(k=>Math.hypot(k.x-x,k.y-y)<k.r+r+40))return false;
  return NF.every(f=>Math.hypot(f.x-x,f.y-y)>f.r+r+40)};
 const spot=(test,tries)=>{for(let t=0;t<(tries||120);t++){const p=fromUV(rr(250,SEA-250),rr(250,WH-250));if(test(p[0],p[1]))return p}return null};
 const treeK=(x,y,r,kd)=>{const n0=m.obs.length;K.tree(x,y,r);if(m.obs.length>n0){const o=m.obs[m.obs.length-1];if(o.t=='t'){o.kd=kd;return o}}return null};
 // ostacolo naturale "speciale" (stesso trattamento delle rocce: indistruttibile, ripulito dalle strade e dai siti) con un disegno suo (nd)
 const natObs=(x,y,pts,nd,ex)=>{if(!K.inMap(x,y,30)||!K.free(x,y,8)||m.own[K.cell(x,y)]||onFlat(x,y,16))return null;const g=rockGeom(pts);
  const o=Object.assign({t:'b',ty:'rock',shape:'rock',x,y,w:g.r*2,h:g.r*2,a:0,c:1,s:0,r:g.r,pr:g.pr,an:g.an,hp:1,m:1,ind:1,pal:0,nd,tone:110,fc:pts.map(()=>'#777'),ns:ri(0,1e6)},ex||{});
  for(const b of qobs(x,y,o.r+40,[])){if(b.dead)continue;if(b.t=='t'){if(Math.hypot(b.x-x,b.y-y)<o.r+b.r*.6)b.dead=1;continue}if(Math.hypot(b.x-x,b.y-y)<o.r+b.r+6)return null}
  return K.addO(o)};
 const rectPts=(L,W,a)=>{const c=Math.cos(a),s=Math.sin(a);return[[-L/2,-W/2],[L/2,-W/2],[L/2,W/2],[-L/2,W/2]].map(([u,v])=>[u*c-v*s,u*s+v*c])};
 const circPts=(r,n)=>Array.from({length:n},(_,i)=>[Math.cos(i/n*TAU)*r,Math.sin(i/n*TAU)*r]);
 const flat=f=>{f.s=f.s==null?ri(0,1e6):f.s;m.flat.push(f);return f};

 // --- paludi: acqua bassa, fango, canne, alberi morti e salici; rallentano ---
 for(let i=0,n=cnt(2.2);i<n;i++){const r=rr(110,180),p=spot((x,y)=>(subAt(x,y)==SUB.swamp||m.WN[K.cell(x,y)]&&levelAt(x,y)==0)&&area(x,y,r,{wet:1}),300);if(!p)continue;
  const b=blob(R,p[0],p[1],r);flat({k:'nmarsh',x:p[0],y:p[1],r:b.r*1.4,b});reg(p[0],p[1],r);m.slow.push({x:p[0],y:p[1],r,b,f:.55,k:1});m.natSpots.push({t:'marsh',x:p[0],y:p[1],r});
  for(const o of qobs(p[0],p[1],r,[]))if(o.t=='t'&&!o.dead&&inBlob(b,o.x,o.y,0)){if(R()<.35)o.dead=1;else o.kd=R()<.5?TK.dead:TK.willow}
  for(let k=0,nd=ri(3,6);k<nd;k++){const t=R()*TAU,d=Math.sqrt(R())*r*.8;treeK(p[0]+Math.cos(t)*d,p[1]+Math.sin(t)*d,rr(12,20),R()<.6?TK.dead:TK.willow)}}
 // --- radure fiorite nei boschi ---
 for(let i=0,n=cnt(4);i<n;i++){const r=rr(70,120),p=spot((x,y)=>bioAt(x,y)==BIO.forest&&subAt(x,y)!=SUB.burnt&&area(x,y,r));if(!p)continue;
  K.clearNat(p[0],p[1],r);flat({k:'nclear',x:p[0],y:p[1],r:r*1.3,b:blob(R,p[0],p[1],r)});reg(p[0],p[1],r);m.natSpots.push({t:'clear',x:p[0],y:p[1],r})}
 // --- bosco bruciato: punti dove il fuoco cova ancora ---
 {let ns=0;for(let t=0;t<400&&ns<cnt(4);t++){const p=fromUV(rr(250,SEA-250),rr(250,WH-250));if(subAt(p[0],p[1])==SUB.burnt&&cellOK(p[0],p[1])&&!onRoad(p[0],p[1],30)){m.natSpots.push({t:'smolder',x:p[0],y:p[1]});ns++}}}
 // --- gole nella roccia: corridoio fra due pareti di massi ---
 for(let i=0,n=cnt(1.4);i<n;i++){const L=rr(300,520),w=rr(64,92),p=spot((x,y)=>bioAt(x,y)==BIO.rock&&area(x,y,L/2));if(!p)continue;const a=R()*Math.PI,c=Math.cos(a),s=Math.sin(a);
  K.clearRect(p[0],p[1],L,w+40,a,0);flat({k:'ncanyon',x:p[0],y:p[1],a,L,w,r:L/2+50});reg(p[0],p[1],L/2);
  for(let u=-L/2;u<=L/2;u+=rr(28,40))for(const sd of[-1,1]){const sz=rr(24,44),v=sd*(w/2+sz*.65);K.rock(p[0]+u*c-v*s,p[1]+u*s+v*c,sz)}}
 // --- crateri di vecchi bombardamenti ---
 for(let i=0,n=cnt(6);i<n;i++){const r=rr(36,78),p=spot((x,y)=>(bioAt(x,y)==BIO.plain||bioAt(x,y)==BIO.forest)&&area(x,y,r));if(!p)continue;
  K.clearNat(p[0],p[1],r*.85);flat({k:'ncrater',x:p[0],y:p[1],r:r*1.4,rc:r,w:R()<.4?1:0});reg(p[0],p[1],r)}
 // --- grotte e miniere abbandonate: ingresso sul fianco di un grande masso ---
 for(let i=0,n=cnt(2);i<n;i++){const p=spot((x,y)=>(bioAt(x,y)==BIO.rock||inHill(x,y))&&area(x,y,120));if(!p)continue;const sz=rr(58,78);K.clearNat(p[0],p[1],sz+30);if(!K.rock(p[0],p[1],sz))continue;
  const a=R()*TAU,mx=p[0]+Math.cos(a)*sz*.95,my=p[1]+Math.sin(a)*sz*.95;flat({k:'ncave',x:mx,y:my,a,mine:R()<.6?1:0,r:110});reg(p[0],p[1],120);m.natSpots.push({t:'cave',x:mx+Math.cos(a)*40,y:my+Math.sin(a)*40})}
 // --- massi erratici isolati in pianura ---
 for(let i=0,n=cnt(9);i<n;i++){const p=spot((x,y)=>bioAt(x,y)==BIO.plain&&area(x,y,70));if(p&&K.rock(p[0],p[1],rr(55,92)))reg(p[0],p[1],80)}
 // --- fango (rallenta) ---
 for(let i=0,n=cnt(7);i<n;i++){const r=rr(40,80),p=spot((x,y)=>(bioAt(x,y)==BIO.plain||bioAt(x,y)==BIO.forest)&&area(x,y,r));if(!p)continue;const b=blob(R,p[0],p[1],r);
  flat({k:'nmud',x:p[0],y:p[1],r:r*1.3,b});reg(p[0],p[1],r);m.slow.push({x:p[0],y:p[1],r,b,f:.72,k:2})}
 // --- erba alta (nasconde le unità a terra) ---
 for(let i=0,n=cnt(10);i<n;i++){const r=rr(60,115),p=spot((x,y)=>bioAt(x,y)==BIO.plain&&area(x,y,r));if(!p)continue;const b=blob(R,p[0],p[1],r);
  flat({k:'ngrass',x:p[0],y:p[1],r:r*1.3,b});reg(p[0],p[1],r*.8);m.hide.push({x:p[0],y:p[1],r,b})}
 // --- sorgenti termali e geyser ---
 for(let i=0,n=cnt(1.5);i<n;i++){const r=rr(24,38),p=spot((x,y)=>(bioAt(x,y)==BIO.rock||subAt(x,y)==SUB.scree||bioAt(x,y)==BIO.plain)&&area(x,y,r+40));if(!p)continue;
  K.clearNat(p[0],p[1],r+30);const gey=R()<.5?1:0;flat({k:'nspring',x:p[0],y:p[1],r:r*2,rp:r,gey});reg(p[0],p[1],r+40);m.natSpots.push({t:'steam',x:p[0],y:p[1],r,gey})}
 // --- ruscelli: dalle colline o dalla pianura fino al fiume o al lago più vicino (acqua solo disegnata: si attraversa) ---
 const waterNear=(x,y)=>{let best=null,bd=1100;for(const rv of m.rivers){const q=segNear(rv.pts,x,y);if(q[0]<bd){bd=q[0];best=[q[1],q[2]]}}
  for(const l of m.lakes){const d=Math.hypot(x-l.x,y-l.y)-l.r;if(d<bd){bd=d;const k=l.r/(Math.hypot(x-l.x,y-l.y)||1);best=[l.x+(x-l.x)*k,l.y+(y-l.y)*k]}}return best};
 const streams=[];
 for(let i=0,n=cnt(3.5);i<n;i++){for(let t=0;t<40;t++){const p=fromUV(rr(300,SEA-400),rr(300,WH-300));if(!cellOK(p[0],p[1])||m.zt[K.cell(p[0],p[1])]>1)continue;const q=waterNear(p[0],p[1]);if(!q)continue;
   const L=Math.hypot(q[0]-p[0],q[1]-p[1]);if(L<320)continue;const N=Math.ceil(L/26),nx=-(q[1]-p[1])/L,ny=(q[0]-p[0])/L,ph=R()*TAU,am=rr(30,70),pts=[];let ok=true;
   for(let k=0;k<=N;k++){const u=k/N,o=Math.sin(u*TAU*rr(1.4,1.6)+ph)*am*Math.sin(u*Math.PI)+(R()-.5)*6,x=p[0]+(q[0]-p[0])*u+nx*o,y=p[1]+(q[1]-p[1])*u+ny*o;
    if(!K.inMap(x,y,20)){ok=false;break}const c=K.cell(x,y);if(m.own[c]){ok=false;break}pts.push([x,y]);if(m.WM[c])break}
   if(!ok||pts.length<10)continue;const w=rr(7,12);streams.push(flat({k:'nstream',pts,w}));
   for(let k=3;k<pts.length-3;k+=ri(3,6))if(R()<.45){const a=pts[k],b=pts[k+1],l=Math.hypot(b[0]-a[0],b[1]-a[1])||1,sd=R()<.5?1:-1;treeK(a[0]-(b[1]-a[1])/l*sd*rr(22,40),a[1]+(b[0]-a[0])/l*sd*rr(22,40),rr(13,20),R()<.6?TK.willow:natKind(K,a[0],a[1]))}
   if(R()<.4)m.natSpots.push({t:'source',x:pts[0][0],y:pts[0][1]});break}}
 // --- fiumi: banchi di sabbia, guadi di sassi, ponti di corda, dighe di castori ---
 const nearRoadOrFall=(x,y,r)=>onRoad(x,y,r)||m.bridges.some(b=>Math.hypot(b.x-x,b.y-y)<r+b.L)||m.falls.some(f=>Math.hypot(f.x-x,f.y-y)<r);
 for(const rv of m.rivers){const P=rv.pts,dirAt=i=>Math.atan2(P[i+1][1]-P[i-1][1],P[i+1][0]-P[i-1][0]);
  const pickI=()=>{for(let t=0;t<30;t++){const i=ri(8,P.length-9),x=P[i][0],y=P[i][1];if(!nearRoadOrFall(x,y,160)&&!m.own[K.cell(x,y)]&&NF.every(f=>Math.hypot(f.x-x,f.y-y)>f.r+80))return i}return -1};
  if(rv.w>=54)for(let k=0,n=ri(1,3);k<n;k++){const i=pickI();if(i<0)continue;const L=rr(60,130);flat({k:'nsandbar',x:P[i][0],y:P[i][1],a:dirAt(i),L,w:rv.w*rr(.2,.3),r:L/2});reg(P[i][0],P[i][1],L/2)}
  if(rv.w<=76){let i=pickI();if(i>=0&&R()<.8){flat({k:'nford',x:P[i][0],y:P[i][1],a:dirAt(i)+Math.PI/2,L:rv.w+26,r:rv.w/2+20});reg(P[i][0],P[i][1],rv.w/2+30)}
   i=pickI();if(i>=0&&R()<.6){flat({k:'nropebr',x:P[i][0],y:P[i][1],a:dirAt(i)+Math.PI/2,L:rv.w+46,r:rv.w/2+30});reg(P[i][0],P[i][1],rv.w/2+40)}}
  if(rv.w<50&&R()<.6){const i=pickI();if(i>=0){flat({k:'ndam',x:P[i][0],y:P[i][1],a:dirAt(i)+Math.PI/2,L:rv.w+20,w:rv.w,r:rv.w+30});reg(P[i][0],P[i][1],rv.w+30)}}}
 for(const s of streams)if(R()<.4&&s.pts.length>16){const i=ri(6,s.pts.length-7),a=s.pts[i],b=s.pts[i+1];flat({k:'ndam',x:a[0],y:a[1],a:Math.atan2(b[1]-a[1],b[0]-a[0])+Math.PI/2,L:s.w*3+10,w:s.w*2.2,r:40})}
 // --- tronchi caduti nei boschi (ostacoli bassi) ---
 for(let i=0,n=cnt(22);i<n;i++){const p=spot((x,y)=>bioAt(x,y)==BIO.forest&&cellOK(x,y)&&!onRoad(x,y,60)&&K.dS(x,y)>500,60);if(!p)continue;const L=rr(48,92),W=rr(10,16),a=R()*Math.PI;
  natObs(p[0],p[1],rectPts(L,W,a),'log',{L,W,la:a,bk:subAt(p[0],p[1])==SUB.burnt?1:0})}
 // --- capanne di caccia e rifugi (edificio vero) con legnaia, fuoco e ceppo ---
 for(let i=0,n=cnt(4);i<n;i++){const p=spot((x,y)=>(bioAt(x,y)==BIO.forest||bioAt(x,y)==BIO.plain)&&area(x,y,95));if(!p)continue;const a=R()*TAU;K.clearNat(p[0],p[1],70);
  const o=K.addB(p[0],p[1],rr(66,80),rr(64,72),a,'rect',false,false,'house',[1,8,17],4,false,0);if(!o)continue;o.fz=4;
  const c=Math.cos(a),s=Math.sin(a),fx=p[0]-s*58,fy=p[1]+c*58;flat({k:'nhut',x:fx,y:fy,a,r:50});reg(p[0],p[1],95);m.natSpots.push({t:'hut',x:fx,y:fy})}
 // --- torrette di avvistamento in legno ---
 for(let i=0,n=cnt(4);i<n;i++){const p=spot((x,y)=>(bioAt(x,y)==BIO.forest||inHill(x,y))&&area(x,y,40));if(!p)continue;const a=R()*Math.PI;if(natObs(p[0],p[1],rectPts(22,22,a),'tower',{ta:a})){reg(p[0],p[1],40);m.natSpots.push({t:'tower',x:p[0],y:p[1]})}}
 // --- staccionate cadenti nella campagna ---
 for(let i=0,n=cnt(6);i<n;i++){const p=spot((x,y)=>bioAt(x,y)==BIO.plain&&cellOK(x,y)&&!onRoad(x,y,40));if(!p)continue;let a=R()*TAU,x=p[0],y=p[1];const pts=[[x,y]];
  for(let k=0,nn=ri(3,6);k<nn;k++){a+=rr(-.7,.7);x+=Math.cos(a)*rr(50,90);y+=Math.sin(a)*rr(50,90);if(!cellOK(x,y)||onRoad(x,y,8))break;pts.push([x,y])}if(pts.length>2)flat({k:'nfence2',pts})}
 // --- rovine antiche: cerchio di pietre, tempietto con colonne, mura spezzate ---
 for(let i=0,n=cnt(2.4);i<n;i++){const p=spot((x,y)=>(bioAt(x,y)==BIO.plain||bioAt(x,y)==BIO.forest||bioAt(x,y)==BIO.rock)&&area(x,y,115));if(!p)continue;K.clearNat(p[0],p[1],100);
  const t=ri(0,2),a=R()*TAU,c=Math.cos(a),s=Math.sin(a),T=(u,v)=>[p[0]+u*c-v*s,p[1]+u*s+v*c],f={k:'nruin',x:p[0],y:p[1],a,t,r:110};
  if(t==0){const rr0=rr(46,64),ns=ri(8,12);f.rc=rr0;for(let k=0;k<ns;k++){if(R()<.18)continue;const q=T(Math.cos(k/ns*TAU)*rr0,Math.sin(k/ns*TAU)*rr0),pts=Array.from({length:6},(_,j)=>[Math.cos(j/6*TAU+a)*rr(6,10)*(j%3?1:1.5),Math.sin(j/6*TAU+a)*rr(5,8)]);natObs(q[0],q[1],pts,'stone')}
   const q=T(0,0);natObs(q[0],q[1],rectPts(26,12,a),'stone',{alt:1})}
  else if(t==1){const W=rr(110,150),H=rr(72,96);f.w=W;f.h=H;f.fall=[];for(let u=-W/2+10;u<=W/2-10;u+=24)for(const v of[-H/2+8,H/2-8]){const q=T(u,v);if(R()<.3)f.fall.push([u,v,R()*TAU]);else natObs(q[0],q[1],circPts(7,8),'col')}}
  else{const W=rr(100,140),H=rr(80,110);f.w=W;f.h=H;for(const[u0,v0,u1,v1]of[[-W/2,-H/2,W/2,-H/2],[W/2,-H/2,W/2,H/2],[W/2,H/2,-W/2,H/2],[-W/2,H/2,-W/2,-H/2]]){if(R()<.3)continue;const L=Math.hypot(u1-u0,v1-v0),k0=rr(0,.3),k1=rr(.6,1),
    mu=u0+(u1-u0)*(k0+k1)/2,mv=v0+(v1-v0)*(k0+k1)/2,q=T(mu,mv);natObs(q[0],q[1],rectPts(L*(k1-k0),12,a+Math.atan2(v1-v0,u1-u0)),'ruin',{L:L*(k1-k0),la:a+Math.atan2(v1-v0,u1-u0)})}}
  flat(f);reg(p[0],p[1],115);m.natSpots.push({t:'ruin',x:p[0],y:p[1]})}
 // --- relitti di guerra: carro arrugginito, ala di navicella, trincea con filo spinato ---
 for(let i=0,n=cnt(4);i<n;i++){const p=spot((x,y)=>(bioAt(x,y)==BIO.plain||bioAt(x,y)==BIO.forest||bioAt(x,y)==BIO.sand)&&area(x,y,80));if(!p)continue;K.clearNat(p[0],p[1],60);
  const t=ri(0,2),a=R()*TAU,f={k:'nrelic',x:p[0],y:p[1],a,t,r:80};
  if(t==0)natObs(p[0],p[1],rectPts(48,30,a),'wreck',{wa:a,wt:0,tur:R()<.6?1:0});
  else if(t==1){const c=Math.cos(a),s=Math.sin(a);natObs(p[0]+c*24,p[1]+s*24,rectPts(30,22,a),'wreck',{wa:a,wt:1})}
  else{const pts=[];let u=-70;while(u<70){pts.push([u,(pts.length%2?1:-1)*rr(10,22)]);u+=rr(22,34)}f.pts=pts}
  flat(f);reg(p[0],p[1],80)}
 // --- totem vicino a radure e capanne ---
 for(const q of m.natSpots.filter(z=>z.t=='clear'||z.t=='hut'))if(R()<.45){const t=R()*TAU,d=q.r?q.r*.6:40;natObs(q.x+Math.cos(t)*d,q.y+Math.sin(t)*d,circPts(6,6),'totem')}
 // --- palme sulla costa sabbiosa ---
 for(let v=rr(200,500);v<WH-200;v+=rr(160,420)){const p=fromUV(coastV(v)-rr(50,170),v);if(bioAt(p[0],p[1])!=BIO.sand||!cellOK(p[0],p[1])||onRoad(p[0],p[1],40))continue;
  for(let k=0,nn=ri(2,5);k<nn;k++)treeK(p[0]+rr(-50,50),p[1]+rr(-50,50),rr(14,22),TK.palm)}
 // --- sentieri sterrati: collegano radure, capanne, rovine, sorgenti, grotte, torrette, paludi e rive dei laghi fra loro o alla strada più vicina ---
 const POI=m.natSpots.filter(z=>'clear hut ruin steam cave tower marsh'.includes(z.t)).map(z=>[z.x,z.y]);
 for(const l of m.lakes)if(R()<.6){const t=R()*TAU,r=l.r+rr(40,70),q=[l.x+Math.cos(t)*r,l.y+Math.sin(t)*r];if(cellOK(q[0],q[1]))POI.push(q)}
 const roadPt=(x,y)=>{let best=null,bd=750;for(const rd of m.roads){if(rd.bb&&(x<rd.bb[0]-750||x>rd.bb[2]+750||y<rd.bb[1]-750||y>rd.bb[3]+750))continue;for(let i=0;i<rd.pts.length;i+=2){const q=rd.pts[i],d=Math.hypot(q[0]-x,q[1]-y);if(d<bd){bd=d;best=q}}}return best};
 const linked=new Set();
 for(let i=0;i<POI.length;i++){const a=POI[i];let tgt=null,bd=900;for(let j=0;j<POI.length;j++){if(j==i||linked.has(j+'-'+i))continue;const d=Math.hypot(POI[j][0]-a[0],POI[j][1]-a[1]);if(d<bd){bd=d;tgt=POI[j]}}
  const rp=roadPt(a[0],a[1]);if(rp&&(!tgt||Math.hypot(rp[0]-a[0],rp[1]-a[1])<bd*.8))tgt=rp;if(!tgt)continue;linked.add(i+'-'+POI.indexOf(tgt));
  const L=Math.hypot(tgt[0]-a[0],tgt[1]-a[1]);if(L<60)continue;const N=Math.ceil(L/22),nx=-(tgt[1]-a[1])/L,ny=(tgt[0]-a[0])/L,ph=R()*TAU,am=rr(15,45),pts=[];
  for(let k=0;k<=N;k++){const u=k/N,o=Math.sin(u*TAU+ph)*am*Math.sin(u*Math.PI),x=a[0]+(tgt[0]-a[0])*u+nx*o,y=a[1]+(tgt[1]-a[1])*u+ny*o;if(!K.inMap(x,y,10))break;const c=K.cell(x,y);if(m.WM[c]||(m.own[c]&&k>2&&k<N-1))break;pts.push([x,y])}
  if(pts.length>4)m.flat.unshift({k:'npath',pts,w:rr(8,11),s:ri(0,1e6)})}   // in testa all'elenco: si disegna sotto a tutto il resto
 natTreeKinds(K);K.noSlab=0}
// specie per gli alberi creati dagli altri passaggi (siti, rive, viali): salici vicino all'acqua, palme sulla sabbia, il resto secondo il bioma
function natTreeKinds(K){const{m}=K;for(const o of m.obs){if(o.t!='t'||o.kd!=null)continue;const c=K.cell(o.x,o.y);
 if(m.own[c]||m.zt[c]>=2){o.kd=TK.broad;continue}const h=hs(o.x|0,o.y|0,K.seed+93);
 if(m.bio[c]==BIO.sand)o.kd=h<.7?TK.palm:TK.broad;else if(m.WN[c])o.kd=h<.6?TK.willow:natKind(K,o.x,o.y);else o.kd=natKind(K,o.x,o.y)}}
// fattore di velocità nel fango e nelle paludi (1 = normale)
function natSlow(x,y){const L=M&&M.slow;if(!L)return 1;let f=1;for(const s of L)if(Math.abs(x-s.x)<s.r*1.3&&Math.abs(y-s.y)<s.r*1.3&&inBlob(s.b,x,y,0))f=Math.min(f,s.f);return f}
// il punto è dentro l'erba alta?
function natSlowK(x,y){const L=M&&M.slow;if(!L)return 0;for(const s of L)if(Math.abs(x-s.x)<s.r*1.3&&Math.abs(y-s.y)<s.r*1.3&&inBlob(s.b,x,y,0))return s.k||1;return 0}   // tipo di zona lenta: 0 nessuna, 1 palude, 2 fango (per gli sbuffi del Grunt)
function natHide(x,y){const L=M&&M.hide;if(!L)return false;for(const s of L)if(Math.abs(x-s.x)<s.r*1.3&&Math.abs(y-s.y)<s.r*1.3&&inBlob(s.b,x,y,0))return true;return false}

// ======================================================================================
// 2) DISEGNO DELLO SFONDO (AGbake)
// ======================================================================================
// tinta del terreno per bioma: [r,g,b] → [r,g,b]
const NAT_TINT={[SUB.pine]:[[34,58,46],.35],[SUB.burnt]:[[52,46,40],.62],[SUB.swamp]:[[70,78,46],.45],[SUB.birch]:[[120,142,70],.3],[SUB.scree]:[[150,146,136],.35],[SUB.dune]:[[214,190,132],.35],[SUB.meadow]:[[96,150,62],.3]};
function natTint(c,s){const t=NAT_TINT[s];return t?mixc(c,t[0],t[1]):c}
// contorno morbido di un blob (forma naturale) in coordinate locali al suo centro
function natBlob(g,b,k,cx,cy){const n=b.a.length,P=[];for(let i=0;i<n;i++){const t=i/n*TAU,r=b.a[i]*k;P.push([(cx||0)+Math.cos(t)*r,(cy||0)+Math.sin(t)*r])}
 g.beginPath();g.moveTo((P[n-1][0]+P[0][0])/2,(P[n-1][1]+P[0][1])/2);for(let i=0;i<n;i++){const a=P[i],c=P[(i+1)%n];g.quadraticCurveTo(a[0],a[1],(a[0]+c[0])/2,(a[1]+c[1])/2)}g.closePath()}
const nH=(f,i,k)=>hs(i,f.s|0,DC.seed+k);
const nC=(g,x,y,r,c)=>{g.fillStyle=c;g.beginPath();g.arc(x,y,r,0,TAU);g.fill()};
const nE=(g,x,y,rx,ry,a,c)=>{g.fillStyle=c;g.beginPath();g.ellipse(x,y,rx,ry,a||0,0,TAU);g.fill()};
const nL=(g,pts,c,w,dash)=>{g.strokeStyle=c;g.lineWidth=w;if(dash)g.setLineDash(dash);g.beginPath();g.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)g.lineTo(pts[i][0],pts[i][1]);g.stroke();if(dash)g.setLineDash([])};
const FLOWERS=['#ffffff','#fff07a','#ff8fd0','#c39bff','#ff6a5a','#7ad7ff','#ffb347'];
function natReeds(g,x,y,n,h,sd){g.lineCap='round';for(let k=0;k<n;k++){const a=-Math.PI/2+(hs(k,sd,7)-.5)*1.1,l=h*(.6+hs(k,sd,8)*.6),bx=x+(hs(k,sd,9)-.5)*8,by=y+(hs(k,sd,10)-.5)*5;
  g.strokeStyle=hs(k,sd,11)<.5?'#5f7f3a':'#7d8f45';g.lineWidth=1.1;g.beginPath();g.moveTo(bx,by);g.lineTo(bx+Math.cos(a)*l,by+Math.sin(a)*l);g.stroke();
  if(hs(k,sd,12)<.35)nE(g,bx+Math.cos(a)*l*.85,by+Math.sin(a)*l*.85,1.3,2.6,a+Math.PI/2,'#6b4423')}}

// --- palude ---
PF.nmarsh=(g,f)=>{const b=f.b,H=(i,k)=>nH(f,i,k),R0=b.r;g.save();
 natBlob(g,b,1.08);g.fillStyle='rgba(60,66,38,.45)';g.fill();natBlob(g,b,1);g.fillStyle='#4b5333';g.fill();
 g.save();natBlob(g,b,1);g.clip();for(let i=0;i<70;i++)nE(g,(H(i,1)-.5)*R0*2,(H(i,2)-.5)*R0*2,4+H(i,3)*14,2+H(i,4)*6,H(i,5)*3,H(i,6)<.5?'rgba(40,46,24,.35)':'rgba(110,120,70,.25)');
 const np=5+((H(0,7)*5)|0);for(let i=0;i<np;i++){const x=(H(i,8)-.5)*R0*1.2,y=(H(i,9)-.5)*R0*1.2,rx=12+H(i,10)*26,ry=8+H(i,11)*16,a=H(i,12)*3;
  nE(g,x,y,rx+4,ry+4,a,'#3a3f22');nE(g,x,y,rx,ry,a,'#2e4a44');nE(g,x-rx*.2,y-ry*.2,rx*.6,ry*.5,a,'rgba(80,120,110,.35)');
  for(let k=0;k<4;k++){const t=H(i*9+k,13)*TAU,px=x+Math.cos(t)*rx*.6,py=y+Math.sin(t)*ry*.6;nC(g,px,py,2.6+H(i*9+k,14)*2,'#4f8a3e');if(H(i*9+k,15)<.3)nC(g,px+.5,py-.5,1,'#f5b7c9')}   // ninfee
  for(let k=0;k<3;k++){const t=H(i*7+k,16)*TAU;natReeds(g,x+Math.cos(t)*(rx+3),y+Math.sin(t)*(ry+3),6,10,i*31+k)}}
 for(let i=0;i<4;i++){const x=(H(i,17)-.5)*R0*1.3,y=(H(i,18)-.5)*R0*1.3;g.save();g.translate(x,y);g.rotate(H(i,19)*3);g.fillStyle='#4a3b2a';g.fillRect(-14,-3,28,6);g.fillStyle='rgba(90,140,60,.6)';g.fillRect(-10,-3,8,3);g.restore()}   // tronchi marci
 g.restore();g.restore()};
// --- radura fiorita ---
PF.nclear=(g,f)=>{const H=(i,k)=>nH(f,i,k),R0=f.b.r;natBlob(g,f.b,1.06);g.fillStyle='rgba(120,170,80,.35)';g.fill();natBlob(g,f.b,1);g.fillStyle='#5f9a48';g.fill();
 g.save();natBlob(g,f.b,1);g.clip();for(let i=0;i<40;i++)nE(g,(H(i,1)-.5)*R0*2,(H(i,2)-.5)*R0*2,8+H(i,3)*14,5+H(i,4)*8,H(i,5)*3,'rgba(140,200,90,.18)');
 for(let c=0;c<14;c++){const cx=(H(c,6)-.5)*R0*1.5,cy=(H(c,7)-.5)*R0*1.5,col=FLOWERS[(H(c,8)*FLOWERS.length)|0];for(let k=0;k<16;k++)nC(g,cx+(H(c*20+k,9)-.5)*24,cy+(H(c*20+k,10)-.5)*18,1.1+H(c*20+k,11),col)}
 for(let i=0;i<6;i++)nE(g,(H(i,12)-.5)*R0*1.4,(H(i,13)-.5)*R0*1.4,4+H(i,14)*4,3+H(i,15)*3,H(i,16)*3,'#8d8a80');g.restore()};
// --- gola ---
PF.ncanyon=(g,f)=>{const{L,w}=f,H=(i,k)=>nH(f,i,k);
 g.fillStyle='rgba(0,0,0,.25)';g.fillRect(-L/2-30,-w/2-30,L+60,w+60);
 const gr=g.createLinearGradient(0,-w/2,0,w/2);gr.addColorStop(0,'#4f483e');gr.addColorStop(.18,'#7a7062');gr.addColorStop(.5,'#867c6c');gr.addColorStop(.82,'#6f665a');gr.addColorStop(1,'#3f3a32');
 g.fillStyle=gr;g.beginPath();g.moveTo(-L/2-20,-w/2+6);for(let u=-L/2;u<=L/2+20;u+=20)g.lineTo(u,-w/2+(H(u|0,1)-.5)*10);for(let u=L/2+20;u>=-L/2-20;u-=20)g.lineTo(u,w/2+(H(u|0,2)-.5)*10);g.closePath();g.fill();
 g.strokeStyle='rgba(90,110,130,.35)';g.lineWidth=3;g.beginPath();for(let u=-L/2;u<=L/2;u+=16){const v=Math.sin(u/40+H(0,3)*6)*w*.15;u==-L/2?g.moveTo(u,v):g.lineTo(u,v)}g.stroke();   // letto di un torrente secco
 for(let i=0;i<90;i++)nE(g,(H(i,4)-.5)*L,(H(i,5)-.5)*w*.8,1+H(i,6)*2.5,1+H(i,7)*1.6,H(i,8)*3,H(i,9)<.5?'rgba(160,150,135,.8)':'rgba(70,64,56,.7)');
 for(const sd of[-1,1]){g.strokeStyle='rgba(30,26,22,.45)';g.lineWidth=1;for(let i=0;i<10;i++){const u=(H(i*sd+20,10)-.5)*L;g.beginPath();g.moveTo(u,sd*w/2);g.lineTo(u+(H(i,11)-.5)*12,sd*(w/2-10-H(i,12)*10));g.stroke()}}};
// --- cratere ---
PF.ncrater=(g,f)=>{const r=f.rc,H=(i,k)=>nH(f,i,k);nC(g,0,0,r*1.15,'rgba(110,90,60,.35)');nC(g,0,0,r,'#7a6544');
 const gr=g.createRadialGradient(-r*.2,-r*.2,r*.1,0,0,r);gr.addColorStop(0,f.w?'#3d4a3a':'#5a6a3a');gr.addColorStop(.7,f.w?'#4c4a36':'#6a6a42');gr.addColorStop(1,'#5a4a30');nC(g,0,0,r*.86,gr);
 if(f.w){nE(g,(H(0,1)-.5)*r*.3,(H(0,2)-.5)*r*.3,r*.5,r*.4,H(0,3)*3,'#35585a');nE(g,-r*.1,-r*.1,r*.25,r*.15,0,'rgba(180,220,220,.25)');for(let k=0;k<5;k++){const t=H(k,4)*TAU;natReeds(g,Math.cos(t)*r*.5,Math.sin(t)*r*.4,5,9,k+(f.s|0))}}
 else{for(let i=0;i<30;i++){g.strokeStyle='rgba(120,170,80,.5)';g.lineWidth=1;const x=(H(i,5)-.5)*r*1.3,y=(H(i,6)-.5)*r*1.3;g.beginPath();g.moveTo(x,y);g.lineTo(x+1,y-4);g.stroke()}
  g.save();g.translate((H(1,7)-.5)*r*.5,(H(1,8)-.5)*r*.5);g.rotate(H(1,9)*3);g.fillStyle='#6b4a2a';g.fillRect(-7,-2.5,12,5);g.beginPath();g.moveTo(5,-2.5);g.lineTo(9,0);g.lineTo(5,2.5);g.fill();g.restore()}   // vecchio proiettile arrugginito
 for(let i=0;i<14;i++){const t=H(i,10)*TAU,d=r*(.95+H(i,11)*.4);nE(g,Math.cos(t)*d,Math.sin(t)*d,2+H(i,12)*4,1.5+H(i,13)*3,t,'rgba(90,75,50,.7)')}};
// --- grotta / miniera (la bocca guarda verso +x) ---
PF.ncave=(g,f)=>{const H=(i,k)=>nH(f,i,k);
 if(f.mine){g.fillStyle='rgba(70,60,45,.55)';g.fillRect(0,-26,100,52);for(let x=6;x<100;x+=9){g.fillStyle='#4a3b2a';g.fillRect(x,-12,4,24)}nL(g,[[0,-7],[100,-7]],'#8d949c',1.6);nL(g,[[0,7],[100,7]],'#8d949c',1.6);
  g.save();g.translate(58,0);g.fillStyle='rgba(0,0,0,.35)';g.fillRect(-9,-8,22,18);g.fillStyle='#5a4a3a';g.fillRect(-11,-10,22,20);g.fillStyle='#3a3a40';g.fillRect(-9,-8,18,16);for(let k=0;k<6;k++)nC(g,-5+(k%3)*5,-3+(k/3|0)*6,2.4,['#8a7f72','#9a8c6a','#6f6a62'][k%3]);g.restore();
  for(let k=0;k<7;k++)nC(g,80+H(k,1)*30,-30+H(k,2)*20,3+H(k,3)*4,'#7a7268');                                             // mucchio di detriti
  g.save();g.translate(24,22);g.fillStyle='#6b4a2a';g.fillRect(-1,-1,2,10);g.fillStyle='#c9a227';g.fillRect(-9,-8,18,8);g.fillStyle='#3a2a12';g.fillRect(-7,-6,14,1.4);g.restore()}   // cartello
 g.fillStyle='rgba(0,0,0,.4)';g.beginPath();g.ellipse(4,0,16,24,0,-Math.PI/2,Math.PI/2);g.fill();
 const gr=g.createRadialGradient(-6,0,2,-4,0,24);gr.addColorStop(0,'#000');gr.addColorStop(1,'#2a2622');g.fillStyle=gr;g.beginPath();g.ellipse(-2,0,14,21,0,-Math.PI/2,Math.PI/2);g.closePath();g.fill();
 if(f.mine){g.fillStyle='#5a3e22';g.fillRect(-4,-24,6,48);g.fillRect(-4,-24,14,5);g.fillRect(-4,19,14,5);g.fillStyle='rgba(255,190,90,.35)';nC(g,10,-16,6,'rgba(255,190,90,.3)');nC(g,10,-16,2,'#ffd27a')}};
// --- fango ---
PF.nmud=(g,f)=>{const H=(i,k)=>nH(f,i,k),R0=f.b.r;natBlob(g,f.b,1.06);g.fillStyle='rgba(80,60,35,.35)';g.fill();natBlob(g,f.b,1);g.fillStyle='#5e4a30';g.fill();
 g.save();natBlob(g,f.b,1);g.clip();for(let i=0;i<14;i++)nE(g,(H(i,1)-.5)*R0*1.5,(H(i,2)-.5)*R0*1.5,5+H(i,3)*12,3+H(i,4)*6,H(i,5)*3,'rgba(90,110,120,.35)');
 for(let i=0;i<40;i++)nE(g,(H(i,6)-.5)*R0*2,(H(i,7)-.5)*R0*2,2+H(i,8)*5,1+H(i,9)*2,H(i,10)*3,H(i,11)<.5?'rgba(40,30,18,.4)':'rgba(140,115,80,.3)');
 g.strokeStyle='rgba(40,30,18,.4)';g.lineWidth=3;g.setLineDash([3,3]);g.beginPath();g.moveTo(-R0,(H(0,12)-.5)*R0);g.quadraticCurveTo(0,(H(0,13)-.5)*R0,R0,(H(0,14)-.5)*R0);g.stroke();g.setLineDash([]);g.restore()};
// --- erba alta ---
PF.ngrass=(g,f)=>{const H=(i,k)=>nH(f,i,k),R0=f.b.r;natBlob(g,f.b,1.05);g.fillStyle='rgba(120,140,60,.35)';g.fill();natBlob(g,f.b,1);g.fillStyle='#6e8a3a';g.fill();
 g.save();natBlob(g,f.b,1);g.clip();g.lineCap='round';const n=Math.round(R0*R0/14);
 for(let i=0;i<n;i++){const x=(H(i,1)-.5)*R0*2,y=(H(i,2)-.5)*R0*2,a=-1.9+H(i,3)*.8,l=6+H(i,4)*7;g.strokeStyle=H(i,5)<.33?'#4f6a2a':H(i,5)<.66?'#9aa84e':'#c4b862';g.lineWidth=1.1;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke()}
 g.restore()};
// --- sorgente termale / geyser ---
PF.nspring=(g,f)=>{const r=f.rp,H=(i,k)=>nH(f,i,k);for(let k=4;k>=1;k--){nE(g,(H(k,1)-.5)*6,(H(k,2)-.5)*6,r*(1+k*.22),r*(.85+k*.2),H(k,3),k%2?'#d9a35a':'#efe2c4');}
 nE(g,0,0,r*1.05,r*.92,0,'#c86a2e');const gr=g.createRadialGradient(0,0,1,0,0,r);gr.addColorStop(0,'#bff4ff');gr.addColorStop(.5,'#3cc4d6');gr.addColorStop(1,'#1e7f92');nE(g,0,0,r,r*.86,0,gr);
 for(let i=0;i<8;i++)nC(g,(H(i,4)-.5)*r,(H(i,5)-.5)*r*.8,1+H(i,6)*1.5,'rgba(255,255,255,.6)');
 if(f.gey){nC(g,r*1.3,0,7,'#bcae8e');nC(g,r*1.3,0,3.5,'#4a4030')}
 g.save();g.translate(-r*1.6,r*.6);g.fillStyle='#6b4a2a';g.fillRect(-1,-1,2,9);g.fillStyle='#e8dcc0';g.fillRect(-8,-7,16,7);g.fillStyle='#b5523b';g.fillRect(-6,-5,12,1.4);g.restore()};
// --- capanna: legnaia, fuoco, ceppo, stendino, terra battuta ---
PF.nhut=(g,f)=>{const H=(i,k)=>nH(f,i,k);nE(g,0,4,40,24,0,'rgba(120,95,60,.4)');
 g.save();g.translate(-24,-2);for(let r=0;r<3;r++)for(let k=0;k<5-r;k++){nC(g,k*5+r*2.5,-r*4,2.6,'#7a5a36');nC(g,k*5+r*2.5,-r*4,1.2,'#c9a26a')}g.restore();   // legnaia
 g.save();g.translate(12,8);for(let k=0;k<8;k++)nC(g,Math.cos(k/8*TAU)*8,Math.sin(k/8*TAU)*8,2.4,'#8d8a80');nC(g,0,0,6,'#2a2420');nC(g,0,0,3,'rgba(255,140,40,.8)');nC(g,0,0,1.4,'#ffe28a');g.restore();   // fuoco
 g.save();g.translate(-6,18);nC(g,0,0,5,'#6b4a2a');nC(g,0,0,3.5,'#c9a26a');nL(g,[[0,0],[7,-5]],'#5a3a1a',1.4);nL(g,[[6,-6],[9,-3]],'#cfd3d8',2);g.restore();   // ceppo con l'ascia
 nL(g,[[-30,22],[24,30]],'rgba(220,220,220,.6)',.8);for(let k=0;k<4;k++){g.fillStyle=FLOWERS[(k*2+1)%FLOWERS.length];g.fillRect(-24+k*12,22+k*1.5,5,6)}};   // stendino
// --- rovine ---
PF.nruin=(g,f)=>{const H=(i,k)=>nH(f,i,k);
 if(f.t==0){g.strokeStyle='rgba(120,100,70,.35)';g.lineWidth=14;g.beginPath();g.arc(0,0,f.rc,0,TAU);g.stroke();nC(g,0,0,f.rc*.5,'rgba(90,120,60,.35)');for(let i=0;i<20;i++)nC(g,(H(i,1)-.5)*f.rc*1.6,(H(i,2)-.5)*f.rc*1.6,1.3,FLOWERS[(H(i,3)*FLOWERS.length)|0])}
 else if(f.t==1){const W=f.w,Hh=f.h;g.fillStyle='rgba(0,0,0,.25)';g.fillRect(-W/2-4,-Hh/2-2,W+12,Hh+12);g.fillStyle='#bdb5a2';g.fillRect(-W/2-6,-Hh/2-6,W+12,Hh+12);g.fillStyle='#d6cfbd';g.fillRect(-W/2,-Hh/2,W,Hh);
  g.strokeStyle='rgba(90,80,60,.35)';g.lineWidth=1;g.beginPath();for(let x=-W/2;x<=W/2;x+=14){g.moveTo(x,-Hh/2);g.lineTo(x,Hh/2)}for(let y=-Hh/2;y<=Hh/2;y+=14){g.moveTo(-W/2,y);g.lineTo(W/2,y)}g.stroke();
  for(let i=0;i<10;i++){g.strokeStyle='rgba(40,35,28,.5)';g.beginPath();let x=(H(i,4)-.5)*W,y=(H(i,5)-.5)*Hh;g.moveTo(x,y);for(let k=0;k<3;k++)g.lineTo(x+=(H(i*5+k,6)-.5)*14,y+=(H(i*5+k,7)-.5)*14);g.stroke()}   // crepe
  for(let i=0;i<12;i++)nE(g,(H(i,8)-.5)*W,(H(i,9)-.5)*Hh,6+H(i,10)*12,4+H(i,11)*6,H(i,12)*3,'rgba(60,110,50,.55)');   // edera
  g.fillStyle='#e8e2d2';g.fillRect(-10,-7,20,14);g.strokeStyle='#9c8a6a';g.strokeRect(-10,-7,20,14);   // altare
  for(const q of f.fall||[]){g.save();g.translate(q[0],q[1]);g.rotate(q[2]);g.fillStyle='rgba(0,0,0,.25)';g.fillRect(-3,-5,30,12);for(let k=0;k<3;k++){g.fillStyle=k%2?'#ded7c4':'#cfc8b4';g.fillRect(k*9,-6,8.5,12)}g.restore()}}   // colonne crollate
 else{for(let i=0;i<50;i++)nE(g,(H(i,1)-.5)*f.w*1.2,(H(i,2)-.5)*f.h*1.2,2+H(i,3)*5,2+H(i,4)*3,H(i,5)*3,H(i,6)<.5?'#9a9282':'#7a7264');for(let i=0;i<10;i++)nE(g,(H(i,7)-.5)*f.w,(H(i,8)-.5)*f.h,6+H(i,9)*10,4+H(i,10)*6,0,'rgba(60,110,50,.4)')}};
// --- relitti di guerra ---
PF.nrelic=(g,f)=>{const H=(i,k)=>nH(f,i,k);
 if(f.t==0){nE(g,0,0,46,32,0,'rgba(30,25,20,.35)');for(const sd of[-1,1]){g.strokeStyle='rgba(50,40,30,.4)';g.lineWidth=6;g.setLineDash([4,3]);g.beginPath();g.moveTo(-90,sd*12);g.lineTo(-30,sd*12);g.stroke();g.setLineDash([])}}   // solchi dei cingoli
 else if(f.t==1){nE(g,0,0,60,26,0,'rgba(25,20,15,.4)');g.fillStyle='#8a9096';g.beginPath();g.moveTo(-50,-4);g.lineTo(10,-16);g.lineTo(18,-6);g.lineTo(-44,10);g.closePath();g.fill();g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1;g.beginPath();for(let k=-40;k<10;k+=10){g.moveTo(k,-4-(k+50)*.2);g.lineTo(k+4,8-(k+50)*.25)}g.stroke();g.fillStyle='#c0392b';g.fillRect(-30,-4,8,4);
  g.strokeStyle='rgba(40,40,40,.5)';g.lineWidth=3;g.beginPath();g.moveTo(-110,20);g.lineTo(-30,6);g.stroke()}   // ala e solco dello schianto
 else{const P=f.pts;nL(g,P,'#2b241c',14);nL(g,P,'#3d3226',9);for(const q of P)for(const sd of[-1,1])for(let k=0;k<3;k++)nE(g,q[0]+(k-1)*6,q[1]+sd*10,3.5,2.4,0,'#a08e66');   // trincea e sacchi
  g.strokeStyle='rgba(160,160,160,.6)';g.lineWidth=.8;for(let x=-70;x<70;x+=6){g.beginPath();g.arc(x,-30,3,0,TAU);g.stroke()}   // filo spinato
  for(let i=0;i<3;i++)nC(g,(H(i,1)-.5)*100,(H(i,2)-.5)*20,3,'#4f5a3a')}   // elmetti
 for(let i=0;i<10;i++){g.save();g.translate((H(i,3)-.5)*100,(H(i,4)-.5)*70);g.rotate(H(i,5)*3);g.fillStyle=H(i,6)<.5?'#6b5a4a':'#7a3a20';g.fillRect(-3,-1.5,6,3);g.restore()}};   // rottami
// --- sentiero, staccionata, ruscello (punti in coordinate mondo) ---
PF.npath=(g,f)=>{g.lineJoin='round';g.lineCap='round';nL(g,f.pts,'rgba(90,70,45,.45)',f.w+4);nL(g,f.pts,'#9a8462',f.w)};
PF.nfence2=(g,f)=>{const P=f.pts;for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.round(L/18));
  for(let k=0;k<=n;k++){const x=a[0]+(b[0]-a[0])*k/n,y=a[1]+(b[1]-a[1])*k/n;if(hs(i*40+k,f.s|0,5)<.15)continue;g.fillStyle='rgba(0,0,0,.3)';g.fillRect(x+1,y+1.5,3.5,3.5);g.fillStyle='#6b4a2a';g.fillRect(x-1.5,y-1.5,3.5,3.5)}
  if(hs(i,f.s|0,6)<.75)nL(g,[[a[0],a[1]],[a[0]+(b[0]-a[0])*(.6+hs(i,f.s|0,7)*.4),a[1]+(b[1]-a[1])*(.6+hs(i,f.s|0,7)*.4)]],'#8a6a44',1.6)}};
PF.nstream=(g,f)=>{g.lineJoin='round';g.lineCap='round';nL(g,f.pts,'#3d4a2c',f.w+7);nL(g,f.pts,'#5b6b4a',f.w+3);nL(g,f.pts,'#3f7d95',f.w);
 for(let i=1;i<f.pts.length;i+=3){const q=f.pts[i];nC(g,q[0]+(hs(i,f.s|0,3)-.5)*f.w,q[1]+(hs(i,f.s|0,4)-.5)*f.w,1.6,'rgba(150,145,130,.8)')}};
// --- sopra l'acqua (z = 7): banco di sabbia, guado, ponte di corda, diga di castori ---
const NAT_PROPS={
 nsandbar(g,f){const H=(i,k)=>nH(f,i,k);nE(g,0,0,f.L/2+5,f.w/2+4,0,'rgba(120,150,140,.5)');nE(g,0,0,f.L/2,f.w/2,0,'#d8c48c');nE(g,-f.L*.08,-f.w*.1,f.L*.32,f.w*.25,0,'#e6d6a6');
  for(let k=0;k<3;k++)natReeds(g,(H(k,1)-.5)*f.L*.6,(H(k,2)-.5)*f.w*.5,5,8,k+(f.s|0));g.save();g.rotate(H(0,3)*3);g.fillStyle='#8a7a5a';g.fillRect(-10,-2,20,4);g.restore()},
 nford(g,f){const n=Math.max(4,Math.round(f.L/12));for(let k=0;k<n;k++){const u=-f.L/2+(k+.5)*f.L/n,v=(nH(f,k,1)-.5)*6;nE(g,u,v,6.5,5,0,'rgba(200,235,245,.35)');nE(g,u+1,v+1.5,5,3.8,0,'rgba(0,0,0,.3)');nE(g,u,v,5,4,nH(f,k,2),'#8f8a80');nE(g,u-1,v-1,2.4,1.6,0,'rgba(255,255,255,.25)')}},
 nropebr(g,f){const L=f.L;g.fillStyle='rgba(0,0,0,.25)';g.fillRect(-L/2+3,-6,L,14);for(let u=-L/2;u<L/2;u+=4.5){g.fillStyle=nH(f,u|0,1)<.08?'rgba(0,0,0,0)':nH(f,u|0,2)<.5?'#8a6a44':'#9a7a50';g.fillRect(u,-5,3.5,10)}
  for(const sd of[-1,1]){g.strokeStyle='#c9b48a';g.lineWidth=1.2;g.beginPath();g.moveTo(-L/2,sd*6);g.quadraticCurveTo(0,sd*7.5,L/2,sd*6);g.stroke();for(const e of[-1,1])nC(g,e*L/2,sd*7,2.4,'#5a3e22')}},
 ndam(g,f){const L=f.L;nE(g,-f.w*.6,0,f.w*.7,L*.6,0,'rgba(40,90,110,.45)');for(let k=0;k<14;k++){g.save();g.translate((nH(f,k,1)-.5)*8,(nH(f,k,2)-.5)*L);g.rotate((nH(f,k,3)-.5)*.9);g.fillStyle=k%2?'#6b4a2a':'#7f5a36';g.fillRect(-9,-1.6,18,3.2);g.restore()}
  g.save();g.translate(-f.w*.5,L*.45);nC(g,0,0,9,'#5a4026');for(let k=0;k<8;k++)nL(g,[[Math.cos(k)*8,Math.sin(k)*8],[Math.cos(k)*2,Math.sin(k)*2]],'#7a5a36',1.4);g.restore()}};
if(typeof PF_PROPS!=='undefined')Object.assign(PF_PROPS,NAT_PROPS);
// sottobosco e dettagli di ogni bioma, cella per cella (dopo pScatter): aghi di pino, foglie, felci, funghi, cenere, ceppi bruciati, pozzanghere,
// ciottoli dei ghiaioni, creste delle dune, fiori dei prati, rovi, canne lungo le rive
function pNature(g,x0,y0){if(!M.sub)return;const S=40,sd=DC.seed+700;
 for(let cy=Math.floor(y0/S);cy<(y0+CH)/S;cy++)for(let cx=Math.floor(x0/S);cx<(x0+CH)/S;cx++){if(cx<0||cy<0||cx>=GW||cy>=GH)continue;const c=cy*GW+cx;if(M.own[c]||M.WM[c]||M.zt[c]>1)continue;
  const s=M.sub[c],b=M.bio[c],X=cx*S,Y=cy*S,H=k=>hs(cx,cy,sd+k);if(urbAt(X+20,Y+20)>.42)continue;
  const ok=(x,y)=>!onRoad(x,y,8);
  if(M.WN[c]&&H(1)<.75){for(let k=0;k<2;k++){const x=X+H(2+k)*S,y=Y+H(4+k)*S;if(ok(x,y)&&!inWater(x,y,2))natReeds(g,x,y,7,12,cx*977+cy*13+k)}}
  if(s==SUB.pine){g.fillStyle='rgba(120,80,40,.18)';for(let k=0;k<4;k++){const x=X+H(10+k)*S,y=Y+H(20+k)*S;if(ok(x,y))g.fillRect(x,y,3+H(30+k)*5,1)}if(H(6)<.4){const x=X+H(7)*S,y=Y+H(8)*S;if(ok(x,y))nE(g,x,y,1.6,2.4,H(9)*3,'#6b4423')}}
  else if(s==SUB.broad||s==SUB.birch){const LC=s==SUB.birch?['#e0c84a','#c9a227','#9ab84a']:['#c0642a','#d9a03a','#8a3a1a','#a8752a'];for(let k=0;k<5;k++){const x=X+H(10+k)*S,y=Y+H(20+k)*S;if(ok(x,y))nE(g,x,y,1.8,1,H(30+k)*3,LC[(H(40+k)*LC.length)|0])}
   if(H(6)<.35){const x=X+H(7)*S,y=Y+H(8)*S;if(ok(x,y)){g.strokeStyle='#3f7a34';g.lineWidth=1.2;g.beginPath();for(let k=0;k<6;k++){const a=k/6*TAU+H(9);g.moveTo(x,y);g.quadraticCurveTo(x+Math.cos(a+.4)*5,y+Math.sin(a+.4)*5,x+Math.cos(a)*9,y+Math.sin(a)*9)}g.stroke()}}   // felce
   if(H(11)<.12){const x=X+H(12)*S,y=Y+H(13)*S;if(ok(x,y)){nC(g,x,y,2.2,'#c0392b');nC(g,x-.6,y-.6,.6,'#fff');nC(g,x+3,y+2,1.6,'#c0392b')}}   // funghi
   if(s==SUB.birch&&H(14)<.3){const x=X+H(15)*S,y=Y+H(16)*S;if(ok(x,y)){g.fillStyle='#e8e4da';g.fillRect(x,y,6,1.6);g.fillStyle='#222';g.fillRect(x+2,y,1,1.6)}}}
  else if(s==SUB.burnt){for(let k=0;k<3;k++){const x=X+H(10+k)*S,y=Y+H(20+k)*S;if(ok(x,y))nE(g,x,y,5+H(30+k)*9,3+H(31+k)*5,H(32+k)*3,'rgba(25,22,20,.35)')}
   if(H(6)<.4){const x=X+H(7)*S,y=Y+H(8)*S;if(ok(x,y)){nC(g,x,y,4,'#1d1a18');nC(g,x,y,2.2,'#3a2e24')}}if(H(9)<.15){const x=X+H(41)*S,y=Y+H(42)*S;if(ok(x,y))nC(g,x,y,1.2,'rgba(255,120,40,.85)')}}
  else if(s==SUB.swamp){if(H(6)<.55){const x=X+H(7)*S,y=Y+H(8)*S;if(ok(x,y)){nE(g,x,y,6+H(9)*8,4+H(10)*4,H(11)*3,'#33463a');nE(g,x-1,y-1,3,1.5,0,'rgba(170,210,200,.25)')}}
   if(H(12)<.5){const x=X+H(13)*S,y=Y+H(14)*S;if(ok(x,y))natReeds(g,x,y,6,10,cx*31+cy)}}
  else if(s==SUB.scree){for(let k=0;k<7;k++){const x=X+H(10+k)*S,y=Y+H(20+k)*S;if(ok(x,y))nE(g,x,y,1.4+H(30+k)*3,1+H(40+k)*2,H(50+k)*3,H(60+k)<.5?'rgba(170,166,156,.9)':'rgba(96,92,84,.85)')}}
  else if(s==SUB.dune){const x=X+H(7)*S,y=Y+H(8)*S;if(ok(x,y)){g.strokeStyle='rgba(255,240,200,.35)';g.lineWidth=2;g.beginPath();g.moveTo(x-16,y+4);g.quadraticCurveTo(x,y-8-H(9)*6,x+16,y+4);g.stroke();g.strokeStyle='rgba(150,120,70,.3)';g.lineWidth=3;g.beginPath();g.moveTo(x-14,y+7);g.quadraticCurveTo(x,y-4,x+14,y+7);g.stroke()}
   g.strokeStyle='rgba(180,150,100,.25)';g.lineWidth=1;for(let k=0;k<3;k++){const yy=Y+H(10+k)*S;g.beginPath();g.moveTo(X+H(20+k)*10,yy);g.quadraticCurveTo(X+20,yy-3,X+30+H(30+k)*10,yy);g.stroke()}}
  else if(s==SUB.meadow){if(H(6)<.45){const cx2=X+H(7)*S,cy2=Y+H(8)*S,col=FLOWERS[(H(9)*FLOWERS.length)|0];if(ok(cx2,cy2))for(let k=0;k<9;k++)nC(g,cx2+(H(10+k)-.5)*16,cy2+(H(20+k)-.5)*12,1.2,col)}}   // ciuffi di fiori dello stesso colore
  else if(b==BIO.plain&&H(6)<.06){const x=X+H(7)*S,y=Y+H(8)*S;if(ok(x,y)){g.strokeStyle='#3a3020';g.lineWidth=1;g.beginPath();for(let k=0;k<7;k++){g.moveTo(x+(H(10+k)-.5)*14,y+(H(20+k)-.5)*10);g.quadraticCurveTo(x,y,x+(H(30+k)-.5)*14,y+(H(40+k)-.5)*10)}g.stroke();for(let k=0;k<4;k++)nC(g,x+(H(50+k)-.5)*10,y+(H(60+k)-.5)*8,1,'#5a1a3a')}}}}   // rovi con le more
// ninfee e foglie galleggianti sui bordi dei laghi (dopo l'acqua)
function pNatureWater(g,x0,y0){const S=40,sd=DC.seed+800;
 for(const l of M.lakes){if(l.x+l.r*1.4<x0||l.x-l.r*1.4>x0+CH||l.y+l.r*1.4<y0||l.y-l.r*1.4>y0+CH)continue;const n=Math.round(l.r/6);
  for(let i=0;i<n;i++){const t=hs(i,l.x|0,sd)*TAU,r=rad(l,l.x+Math.cos(t),l.y+Math.sin(t))-8-hs(i,l.y|0,sd+1)*30,x=l.x+Math.cos(t)*r,y=l.y+Math.sin(t)*r;if(x<x0-10||x>x0+CH+10||y<y0-10||y>y0+CH+10)continue;
   if(!inWater(x,y,3)||onRoad(x,y,6))continue;for(let k=0;k<3;k++){const px=x+(hs(i,k,sd+2)-.5)*14,py=y+(hs(i,k,sd+3)-.5)*14;g.fillStyle='#4f8a3e';g.beginPath();g.arc(px,py,3+hs(i,k,sd+4)*2,.3,TAU-.2);g.lineTo(px,py);g.fill();if(hs(i,k,sd+5)<.25)nC(g,px+.5,py-.5,1.2,hs(i,k,sd+6)<.5?'#f5b7c9':'#ffffff')}}}}

// ======================================================================================
// 3) DISEGNO DEGLI OSTACOLI (AGart: drawTree e drawRock passano di qui)
// ======================================================================================
const NTC={};
const ntc=(k,f,fn)=>{const key=k+'|'+Math.round(f*10);return NTC[key]||(NTC[key]=fn(f))};
// disegna una specie sul contesto c (lo usa treeSprite in AGart.js: il risultato finisce in cache)
function natTree(o,f,lod,c){c=c||ctx;const x=o.x,y=o.y,r=o.r,id=(o.id+1)*2654435761>>>0,circle=(x,y,rr)=>{c.beginPath();c.arc(x,y,rr,0,TAU);c.fill()};
 c.fillStyle='rgba(0,0,0,.22)';
 switch(o.kd){
  case TK.pine:{const C=ntc('p'+o.tn,f,f=>({a:`hsl(${150+o.tn*6},${25+20*f}%,${14+8*f}%)`,b:`hsl(${148+o.tn*6},${28+20*f}%,${20+9*f}%)`,c:`hsl(${145+o.tn*6},${30+20*f}%,${28+10*f}%)`}));
   circle(x+r*.35,y+r*.45,r);const st=(rr,col,rot)=>{c.fillStyle=col;c.beginPath();for(let i=0;i<16;i++){const a=i/16*TAU+rot,d=i%2?rr*.62:rr;c.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d)}c.closePath();c.fill()};
   st(r,C.a,id%7);if(lod<1)return;st(r*.72,C.b,id%5);st(r*.42,C.c,id%3);c.fillStyle='rgba(255,255,255,.12)';circle(x-r*.15,y-r*.18,r*.12);return}
  case TK.palm:{circle(x+r*.5,y+r*.6,r*.6);const C=ntc('m',f,f=>({a:`hsl(95,${35+20*f}%,${22+10*f}%)`,b:`hsl(88,${40+20*f}%,${32+10*f}%)`}));c.lineCap='round';
   for(let i=0;i<7;i++){const a=i/7*TAU+(id%10)/10,ex=x+Math.cos(a)*r*1.15,ey=y+Math.sin(a)*r*1.15;c.strokeStyle=C.a;c.lineWidth=r*.34;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+Math.cos(a+.25)*r*.7,y+Math.sin(a+.25)*r*.7,ex,ey);c.stroke();
    if(lod>=1){c.strokeStyle=C.b;c.lineWidth=r*.12;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+Math.cos(a+.25)*r*.7,y+Math.sin(a+.25)*r*.7,ex,ey);c.stroke()}}
   c.fillStyle='#6b4a2a';circle(x,y,r*.16);c.fillStyle='#4a3218';circle(x+r*.1,y-r*.12,r*.07);circle(x-r*.08,y+r*.1,r*.07);return}
  case TK.willow:{const C=ntc('w',f,f=>({a:`hsl(96,${22+16*f}%,${18+8*f}%)`,b:`hsl(92,${26+16*f}%,${26+9*f}%)`,c:`hsla(88,${30+15*f}%,${36+8*f}%,.6)`}));
   circle(x+r*.35,y+r*.45,r*1.05);c.fillStyle=C.a;circle(x,y,r*1.05);if(lod<1)return;c.strokeStyle=C.c;c.lineWidth=1.2;c.beginPath();
   for(let i=0;i<22;i++){const a=i/22*TAU,d0=r*.25,d1=r*(.85+((id>>i)&3)*.07);c.moveTo(x+Math.cos(a)*d0,y+Math.sin(a)*d0);c.quadraticCurveTo(x+Math.cos(a+.15)*r*.6,y+Math.sin(a+.15)*r*.6+2,x+Math.cos(a)*d1,y+Math.sin(a)*d1+2)}c.stroke();
   c.fillStyle=C.b;circle(x-r*.1,y-r*.12,r*.45);return}
  case TK.birch:{const C=ntc('b',f,f=>({a:`hsl(82,${28+18*f}%,${24+9*f}%)`,b:`hsl(76,${34+18*f}%,${33+9*f}%)`,c:`hsla(70,${40+15*f}%,${44+8*f}%,.75)`}));circle(x+r*.3,y+r*.4,r*.8);   // betulla: chioma leggera a ciuffi, verde chiaro
   c.fillStyle=C.a;for(let i=0;i<5;i++){const a=i*1.26+(id%9),d=r*.38;circle(x+Math.cos(a)*d,y+Math.sin(a)*d,r*.42)}if(lod>=1){c.fillStyle=C.b;for(let i=0;i<4;i++){const a=i*1.57+(id%7),d=r*.3;circle(x+Math.cos(a)*d,y+Math.sin(a)*d,r*.26)}c.fillStyle=C.c;circle(x-r*.22,y-r*.25,r*.16)}return}
  case TK.burnt:case TK.dead:{const burnt=o.kd==TK.burnt;c.fillStyle='rgba(0,0,0,.18)';circle(x+r*.25,y+r*.3,r*.45);c.lineCap='round';
   c.strokeStyle=burnt?'#1a1614':'#6e665a';for(let i=0;i<6;i++){const a=i/6*TAU+(id%11)*.3,l=r*(.6+((id>>(i*2))&3)*.1);c.lineWidth=r*.12;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);c.stroke();
    if(lod>=1){c.lineWidth=r*.06;c.beginPath();c.moveTo(x+Math.cos(a)*l*.6,y+Math.sin(a)*l*.6);c.lineTo(x+Math.cos(a+.5)*l*.95,y+Math.sin(a+.5)*l*.95);c.stroke()}}
   c.fillStyle=burnt?'#2a221c':'#8a8072';circle(x,y,r*.24);if(burnt&&lod>=1){c.fillStyle='rgba(255,110,30,.5)';circle(x+r*.08,y-r*.05,r*.06)}return}}}
// ostacoli naturali speciali: o.nd
const NAT_DRAW={
 log(o,lod){const c=ctx;c.save();c.translate(o.x,o.y);c.rotate(o.la);const L=o.L,W=o.W;c.fillStyle='rgba(0,0,0,.3)';c.fillRect(-L/2+4,-W/2+5,L,W);
  c.fillStyle=o.bk?'#2a221c':'#5e4630';c.fillRect(-L/2,-W/2,L,W);if(lod>=1){c.strokeStyle=o.bk?'rgba(255,255,255,.08)':'rgba(30,20,10,.45)';c.lineWidth=1;c.beginPath();for(let u=-L/2+5;u<L/2-3;u+=7){c.moveTo(u,-W/2+1);c.lineTo(u+3,W/2-1)}c.stroke();
   if(!o.bk){c.fillStyle='rgba(90,140,60,.6)';c.fillRect(-L*.2,-W/2,L*.25,W*.4)}c.fillStyle=o.bk?'#3a2e24':'#c9a26a';c.beginPath();c.ellipse(L/2,0,2.5,W/2,0,0,TAU);c.fill();c.strokeStyle='rgba(90,60,30,.6)';c.beginPath();c.ellipse(L/2,0,1.2,W/4,0,0,TAU);c.stroke()}c.restore()},
 tower(o,lod){const c=ctx;c.save();c.translate(o.x,o.y);c.rotate(o.ta);c.fillStyle='rgba(0,0,0,.35)';c.fillRect(-4,0,26,26);
  c.fillStyle='#6b4a2a';for(const[x,y]of[[-11,-11],[9,-11],[-11,9],[9,9]])c.fillRect(x,y,3,3);c.fillStyle='#8a6440';c.fillRect(-10,-10,20,20);
  if(lod>=1){c.strokeStyle='rgba(40,25,10,.5)';c.lineWidth=1;c.beginPath();for(let k=-6;k<=6;k+=4){c.moveTo(-10,k);c.lineTo(10,k)}c.stroke()}
  c.fillStyle='#4a5a3a';c.beginPath();c.moveTo(-12,-12);c.lineTo(12,-12);c.lineTo(0,0);c.closePath();c.fill();c.fillStyle='#3e4d30';c.beginPath();c.moveTo(12,-12);c.lineTo(12,12);c.lineTo(0,0);c.closePath();c.fill();c.restore()},
 stone(o,lod){const c=ctx,v=o.pr[0].vs;c.save();c.translate(o.x,o.y);c.fillStyle='rgba(0,0,0,.32)';c.beginPath();for(const p of v)c.lineTo(p[0]+5,p[1]+7);c.closePath();c.fill();
  c.fillStyle=o.alt?'#9a9488':'#8a867c';c.beginPath();for(const p of v)c.lineTo(p[0],p[1]);c.closePath();c.fill();c.strokeStyle='rgba(0,0,0,.4)';c.lineWidth=1.2;c.stroke();
  if(lod>=1){c.fillStyle='rgba(255,255,255,.14)';c.beginPath();c.arc(-2,-2,3,0,TAU);c.fill();c.fillStyle='rgba(170,180,90,.5)';c.beginPath();c.arc(2,1,2.2,0,TAU);c.fill()}c.restore()},
 col(o,lod){const c=ctx;c.fillStyle='rgba(0,0,0,.3)';circle(o.x+4,o.y+6,8);c.fillStyle='#e2dccb';circle(o.x,o.y,8);if(lod>=1){c.strokeStyle='rgba(120,110,90,.6)';c.lineWidth=.8;for(let k=0;k<8;k++){const a=k/8*TAU;c.beginPath();c.moveTo(o.x+Math.cos(a)*3,o.y+Math.sin(a)*3);c.lineTo(o.x+Math.cos(a)*7.5,o.y+Math.sin(a)*7.5);c.stroke()}}c.fillStyle='#f2ede0';circle(o.x-1.5,o.y-1.5,3)},
 ruin(o,lod){const c=ctx;c.save();c.translate(o.x,o.y);c.rotate(o.la);const L=o.L;c.fillStyle='rgba(0,0,0,.3)';c.fillRect(-L/2+4,-1,L,14);c.fillStyle='#a69d8a';c.fillRect(-L/2,-6,L,12);
  if(lod>=1){c.strokeStyle='rgba(60,50,40,.5)';c.lineWidth=1;c.beginPath();for(let u=-L/2+10;u<L/2;u+=10){c.moveTo(u,-6);c.lineTo(u,0)}for(let u=-L/2+5;u<L/2;u+=10){c.moveTo(u,0);c.lineTo(u,6)}c.moveTo(-L/2,0);c.lineTo(L/2,0);c.stroke();c.fillStyle='rgba(60,110,50,.55)';c.fillRect(-L*.3,-6,L*.2,5)}c.restore()},
 wreck(o,lod){const c=ctx;c.save();c.translate(o.x,o.y);c.rotate(o.wa);c.fillStyle='rgba(0,0,0,.35)';c.fillRect(-20,-11,48,30);
  if(o.wt==0){c.fillStyle='#3a3026';c.fillRect(-24,-15,48,6);c.fillRect(-24,9,48,6);c.fillStyle='#7a4a2a';c.fillRect(-21,-10,42,20);c.fillStyle='#8f5a32';c.fillRect(-18,-8,30,16);
   if(lod>=1){c.fillStyle='rgba(60,30,10,.5)';for(let k=0;k<5;k++)c.fillRect(-16+k*7,-6+((k*7)%10),4,3);c.fillStyle='rgba(90,140,60,.55)';c.fillRect(6,-10,10,6)}
   if(o.tur){c.fillStyle='#6b4024';c.beginPath();c.arc(0,0,8,0,TAU);c.fill();c.fillRect(0,-1.8,22,3.6)}}
  else{c.fillStyle='#7f868c';c.beginPath();c.moveTo(-15,-11);c.lineTo(15,-6);c.lineTo(12,11);c.lineTo(-14,8);c.closePath();c.fill();c.fillStyle='#2a2e32';c.fillRect(-6,-4,10,8);c.fillStyle='#ff8a2a';c.fillRect(8,-3,3,3)}
  c.restore()},
 totem(o,lod){const c=ctx;c.fillStyle='rgba(0,0,0,.3)';circle(o.x+3,o.y+5,7);for(const[r,col]of[[7,'#7a4a2a'],[5.5,'#c0392b'],[4,'#e6b422'],[2.4,'#2e86c1']]){c.fillStyle=col;circle(o.x,o.y,r)}
  c.fillStyle='#7a4a2a';c.fillRect(o.x-12,o.y-2,24,4);c.fillStyle='#e6b422';c.fillRect(o.x-12,o.y-2,4,4);c.fillRect(o.x+8,o.y-2,4,4)}};

// ======================================================================================
// 4) VITA: animali, uccelli, pesci, insetti, particelle d'atmosfera (solo locale)
// ======================================================================================
const NAT={m:null,herds:[],flocks:[],gulls:[],herons:[],P:[],t:0,bt:0,fishT:0};
const NATP_MAX=240;
function natInit(){NAT.m=M;NAT.herds=[];NAT.flocks=[];NAT.gulls=[];NAT.herons=[];NAT.P=[];if(!M||!M.sub)return;
 const R=rng((M.seed^0x51ED27)>>>0),rr=(a,b)=>a+R()*(b-a),ri=(a,b)=>a+(R()*(b-a+1)|0),cell=(x,y)=>clamp(y/TC|0,0,GH-1)*GW+clamp(x/TC|0,0,GW-1);
 const wild=(x,y)=>{const c=cell(x,y);return x>80&&y>80&&x<WW-80&&y<WH-80&&!M.own[c]&&!M.WM[c]&&M.zt[c]<=1&&Math.hypot(x-START[0],y-START[1])>700};
 const rnd=()=>fromUV(rr(200,SEA-200),rr(200,WH-200));
 // branchi: cervi nei boschi e ai margini, cavalli selvatici nei prati
 for(let i=0,nh=ri(6,11);i<nh;i++)for(let t=0;t<40;t++){const p=rnd();if(!wild(p[0],p[1]))continue;const b=M.bio[cell(p[0],p[1])];if(b!=BIO.plain&&b!=BIO.forest)continue;
  const k=b==BIO.forest||R()<.55?0:1,A=[];for(let j=0,n=ri(3,7);j<n;j++)A.push({x:p[0]+rr(-40,40),y:p[1]+rr(-40,40),a:R()*TAU,v:0,st:0,tt:rr(1,4),k,ant:k==0&&R()<.35,col:k?['#7a4a2a','#3a2a1a','#d9cfc0','#a0693a'][ri(0,3)]:'#8a5a32',ph:R()*TAU});
  NAT.herds.push({hx:p[0],hy:p[1],A});break}
 // stormi appollaiati sugli alberi dei boschi
 for(let i=0,nf=ri(8,14);i<nf;i++)for(let t=0;t<40;t++){const p=rnd();if(!wild(p[0],p[1])||M.bio[cell(p[0],p[1])]!=BIO.forest)continue;
  NAT.flocks.push({x:p[0],y:p[1],st:0,tx:0,ty:0,col:R()<.5?'#2a2a2a':'#5a4a3a',B:Array.from({length:ri(6,14)},()=>({x:0,y:0,vx:0,vy:0,ph:R()*TAU}))});break}
 // gabbiani sulla costa
 for(let i=0;i<4;i++){const v=rr(400,WH-400),p=fromUV(coastV(v)+rr(40,200),v);NAT.gulls.push({x:p[0],y:p[1],B:Array.from({length:ri(3,6)},()=>({r:rr(40,110),a:R()*TAU,w:rr(.35,.7)*(R()<.5?1:-1),ph:R()*TAU}))})}
 // aironi nelle paludi
 for(const s of M.natSpots||[])if(s.t=='marsh')for(let j=0,n=ri(1,2);j<n;j++)NAT.herons.push({cx:s.x,cy:s.y,r:s.r,x:s.x+rr(-s.r,s.r)*.5,y:s.y+rr(-s.r,s.r)*.5,a:R()*TAU,st:0,vx:0,vy:0,tt:0,ph:0})}
// particella d'atmosfera: t = tipo (leaf, pollen, ash, ffly, fog, steam, smoke, spark, fly=farfalla, fish, ring, jet)
function natP(t,x,y,o){if(NAT.P.length>=NATP_MAX)return;NAT.P.push(Object.assign({t,x,y,vx:0,vy:0,life:1,age:0,dur:3,ph:Math.random()*TAU},o||{}))}
const NAT_ROT=Math.PI;   // rotazione massima degli animali a terra: 180° al secondo
function natTick(dt){if(NAT.m!==M)natInit();if(!M||!M.sub||!P)return;NAT.t+=dt;const R=Math.random,px=P.x,py=P.y;
 const VW=W/zoom,VH=H/zoom,x0=camX,y0=camY,inV=(x,y,m)=>x>x0-m&&x<x0+VW+m&&y>y0-m&&y<y0+VH+m;
 // spari vicini: un elenco ridotto di punti (aggiornato 5 volte al secondo)
 NAT.bt-=dt;let shots=null;if(NAT.bt<=0){NAT.bt=.2;shots=[];for(const b of bullets)if(b&&b.life>0&&inV(b.x,b.y,500))shots.push(b)}
 const threat=(x,y,r)=>Math.hypot(x-px,y-py)<r||(shots&&shots.some(b=>Math.hypot(b.x-x,b.y-y)<r*1.2));
 // branchi: pascolano vicino a casa, scappano dal Grunt e dagli spari
 for(const h of NAT.herds){if(Math.hypot(h.hx-px,h.hy-py)>2200)continue;let flee=false;for(const a of h.A)if(a.st==0&&threat(a.x,a.y,a.k?240:300)){flee=true;break}
  for(const a of h.A){if(flee&&a.st==0){a.st=1;a.tt=2.5+R()*2;a.a=Math.atan2(a.y-py,a.x-px)+(R()-.5)*.8}
   a.tt-=dt;if(a.st==1){a.v=a.k?200:180;if(a.tt<=0){a.st=0;a.tt=1+R()*3;h.hx=a.x;h.hy=a.y}}
   else{if(a.tt<=0){a.tt=1+R()*4;a.v=R()<.5?0:10+R()*14;a.a+=(R()-.5)*1.6;if(Math.hypot(a.x-h.hx,a.y-h.hy)>110)a.a=Math.atan2(h.hy-a.y,h.hx-a.x)}}
   if(a.h==null)a.h=a.a;a.h+=clamp(ad(a.a,a.h),-NAT_ROT*dt,NAT_ROT*dt);   // a.a = direzione voluta · a.h = direzione reale, ruota al massimo di NAT_ROT rad/s
   const nx=a.x+Math.cos(a.h)*a.v*dt,ny=a.y+Math.sin(a.h)*a.v*dt;if(nx<60||ny<60||nx>WW-60||ny>WH-60||(nearWater(nx,ny)&&inWater(nx,ny,8))||!clearAt(nx,ny,6)){if(Math.abs(ad(a.a,a.h))<.2)a.a+=Math.PI*(.5+R())}else{a.x=nx;a.y=ny}   // bloccato: sceglie una nuova direzione solo dopo aver finito di girarsi
   a.ph+=dt*(a.v>20?12:a.v>0?4:1)}}
 // stormi: si alzano quando il Grunt si avvicina o si spara, volano verso un altro bosco e si posano
 for(const f of NAT.flocks){if(f.st==0){if(Math.hypot(f.x-px,f.y-py)<1600&&threat(f.x,f.y,230)){f.st=1;const a=R()*TAU,d=600+R()*500;f.tx=clamp(f.x+Math.cos(a)*d,100,WW-100);f.ty=clamp(f.y+Math.sin(a)*d,100,WH-100);
    for(const b of f.B){const t=R()*TAU;b.x=f.x+(R()-.5)*30;b.y=f.y+(R()-.5)*30;b.vx=Math.cos(t)*120;b.vy=Math.sin(t)*120}}}
  else{let n=0,cx=0,cy=0;for(const b of f.B){const dx=f.tx-b.x,dy=f.ty-b.y,d=Math.hypot(dx,dy)||1;b.vx+=(dx/d*170-b.vx)*dt*1.2+(R()-.5)*90*dt;b.vy+=(dy/d*170-b.vy)*dt*1.2+(R()-.5)*90*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.ph+=dt*16;cx+=b.x;cy+=b.y;n++}
   if(Math.hypot(cx/n-f.tx,cy/n-f.ty)<50){f.st=0;f.x=f.tx;f.y=f.ty}}}
 for(const g of NAT.gulls)for(const b of g.B){b.a+=b.w*dt;b.ph+=dt*(5+Math.sin(NAT.t+b.r)*3)}
 // aironi: fermi nell'acqua bassa, volano via quando ti avvicini e si posano dall'altra parte della palude
 for(const h of NAT.herons){if(h.st==0){if(threat(h.x,h.y,190)){h.st=1;const a=Math.atan2(h.y-py,h.x-px);h.vx=Math.cos(a)*110;h.vy=Math.sin(a)*110;h.tt=2.5}}
  else{h.tt-=dt;h.x+=h.vx*dt;h.y+=h.vy*dt;h.ph+=dt*9;if(h.tt<=0){h.st=0;const a=Math.random()*TAU,d=Math.random()*h.r*.6;h.x=h.cx+Math.cos(a)*d;h.y=h.cy+Math.sin(a)*d;h.a=Math.random()*TAU}}}
 // particelle d'atmosfera vicino alla visuale, secondo il bioma
 for(let k=0;k<5;k++){const x=x0+R()*VW,y=y0+R()*VH,c=clamp(y/TC|0,0,GH-1)*GW+clamp(x/TC|0,0,GW-1),s=M.sub[c],own=M.own[c]||M.zt[c]>1;if(own)continue;const u=R();
  if((s==SUB.broad||s==SUB.birch)&&u<.5)natP('leaf',x,y,{dur:4+R()*3,col:s==SUB.birch?['#e0c84a','#c9a227'][R()*2|0]:['#c0642a','#d9a03a','#8a3a1a'][R()*3|0],vx:12+R()*10,vy:6});
  else if(s==SUB.meadow&&u<.6){if(u<.3)natP('pollen',x,y,{dur:3+R()*3,vx:(R()-.5)*10,vy:-4});if(u<.02)natP('fly',x,y,{dur:6+R()*4,col:FLOWERS[R()*FLOWERS.length|0]})}   // farfalle nei prati (era .08: -75%)
  else if(s==SUB.burnt&&u<.5)natP('ash',x,y,{dur:4+R()*3,vx:(R()-.5)*14,vy:-6-R()*6});
  else if(s==SUB.swamp&&u<.4){if(u<.22)natP('ffly',x,y,{dur:3+R()*4});if(u<.1)natP('fog',x,y,{dur:9+R()*6,vx:4+R()*5,sz:60+R()*50})}
  else if(M.WM[c]&&u<.04&&M.lakes.some(l=>inBlob(l,x,y,-20)))natP('fish',x,y,{dur:.7,a:R()*TAU})}
 // radure: farfalle; paludi: nebbia bassa; sorgenti: vapore e geyser; fuochi che covano e camini delle capanne: fumo
 for(const s of M.natSpots||[]){if(!inV(s.x,s.y,220))continue;
  if(s.t=='clear'&&R()<dt*.375)natP('fly',s.x+(R()-.5)*s.r,s.y+(R()-.5)*s.r,{dur:6+R()*4,col:FLOWERS[R()*FLOWERS.length|0]});
  else if(s.t=='marsh'&&R()<dt*2.5)natP('fog',s.x+(R()-.5)*s.r*1.4,s.y+(R()-.5)*s.r*1.4,{dur:10+R()*6,vx:3+R()*4,sz:70+R()*60});
  else if(s.t=='steam'){if(R()<dt*3)natP('steam',s.x+(R()-.5)*s.r*1.4,s.y+(R()-.5)*s.r,{dur:2.5+R()*2,vx:4+(R()-.5)*8,vy:-10,sz:6+R()*8});
   if(s.gey){s.gt=(s.gt==null?4+R()*8:s.gt)-dt;if(s.gt<=0){s.gt=10+R()*10;for(let k=0;k<26;k++)natP('jet',s.x+s.r*1.3,s.y,{dur:1.2+R()*1.2,vx:(R()-.5)*50,vy:-90-R()*120,sz:4+R()*6})}}}
  else if((s.t=='smolder'||s.t=='hut')&&R()<dt*(s.t=='hut'?2.5:4)){natP('smoke',s.x+(R()-.5)*8,s.y+(R()-.5)*8,{dur:3+R()*2,vx:6+R()*4,vy:-10,sz:5+R()*6});if(R()<.3)natP('spark',s.x,s.y,{dur:.8+R()*.6,vx:(R()-.5)*20,vy:-30-R()*20})}}
 // movimento delle particelle
 let w=0;for(const p of NAT.P){p.age+=dt;if(p.age>=p.dur)continue;p.ph+=dt;
  if(p.t=='leaf'){p.x+=(p.vx+Math.sin(p.ph*2)*14)*dt;p.y+=(p.vy+Math.cos(p.ph*1.3)*6)*dt}
  else if(p.t=='fly'){p.vx+=(Math.random()-.5)*160*dt;p.vy+=(Math.random()-.5)*160*dt;p.vx*=.96;p.vy*=.96;p.x+=p.vx*dt;p.y+=p.vy*dt}
  else if(p.t=='ffly'){p.x+=Math.sin(p.ph*1.7)*8*dt;p.y+=Math.cos(p.ph*1.3)*8*dt}
  else if(p.t=='jet'){p.vy+=110*dt;p.x+=p.vx*dt;p.y+=p.vy*dt}
  else{p.x+=p.vx*dt;p.y+=p.vy*dt}
  NAT.P[w++]=p}NAT.P.length=w}
// animali a terra e pesci (sotto la nebbia di guerra: si vedono solo nella visuale)
function natDrawGround(){if(NAT.m!==M||!M)return;const c=ctx,VW=W/zoom,VH=H/zoom,inV=(x,y)=>x>camX-60&&x<camX+VW+60&&y>camY-60&&y<camY+VH+60;
 for(const h of NAT.herds)for(const a of h.A){if(!inV(a.x,a.y))continue;
  const ah=a.h!=null?a.h:a.a;   // direzione reale (ruota al massimo di NAT_ROT)
  if(a.k==1){veh(c,'horse',a.x,a.y,ah,a.col,1.25);continue}
  c.save();c.translate(a.x,a.y);c.rotate(ah);const bob=a.v>20?Math.sin(a.ph)*1.2:0;c.fillStyle='rgba(0,0,0,.22)';c.beginPath();c.ellipse(1.5,2.5,9,4,0,0,TAU);c.fill();
  c.fillStyle=a.col;c.beginPath();c.ellipse(0,bob*.3,8,3.6,0,0,TAU);c.fill();c.beginPath();c.ellipse(7.5,0,3.2,1.8,0,0,TAU);c.fill();c.fillStyle='#6b4224';c.beginPath();c.arc(10.4,0,1.6,0,TAU);c.fill();
  c.fillStyle='#f4efe2';c.beginPath();c.arc(-7.8,0,1.5,0,TAU);c.fill();c.fillStyle='rgba(255,255,255,.35)';for(let k=0;k<4;k++)c.fillRect(-4+k*2.5,-1.6+(k%2),1,1);
  if(a.ant){c.strokeStyle='#d8c6a0';c.lineWidth=.9;c.beginPath();for(const sd of[-1,1]){c.moveTo(9.5,sd*1);c.lineTo(8,sd*4.5);c.lineTo(6,sd*5.5);c.moveTo(8.6,sd*3.2);c.lineTo(10.5,sd*4.6)}c.stroke()}c.restore()}
 for(const h of NAT.herons){if(h.st||!inV(h.x,h.y))continue;c.save();c.translate(h.x,h.y);c.rotate(h.a);c.fillStyle='rgba(0,0,0,.2)';c.beginPath();c.ellipse(1.5,2,6,2.5,0,0,TAU);c.fill();
  c.fillStyle='#9aa4ac';c.beginPath();c.ellipse(0,0,5.5,2.4,0,0,TAU);c.fill();c.strokeStyle='#c9d1d6';c.lineWidth=1.2;c.beginPath();c.moveTo(4,0);c.quadraticCurveTo(7,-2,8,0);c.stroke();c.strokeStyle='#e6b422';c.lineWidth=.9;c.beginPath();c.moveTo(8,0);c.lineTo(11,.4);c.stroke();c.restore()}
 for(const p of NAT.P){if(p.t!='fish'||!inV(p.x,p.y))continue;const u=p.age/p.dur;c.strokeStyle=`rgba(220,240,250,${(1-u)*.7})`;c.lineWidth=1;for(const k of[1,.6]){c.beginPath();c.arc(p.x,p.y,4+u*16*k,0,TAU);c.stroke()}
  if(u<.6){c.save();c.translate(p.x,p.y);c.rotate(p.a);const h=Math.sin(u/.6*Math.PI)*6;c.fillStyle='#9fb4bf';c.beginPath();c.ellipse(0,-h,4,1.6,0,0,TAU);c.fill();c.restore()}}}
// banco di nebbia sfumato: disegnato una volta sola (prima ogni banco creava un gradiente nuovo a ogni fotogramma)
let NAT_FOG=null,NAT_FLY=null;
// lucciola: alone e punto luminoso in un'immagine sola
function natFlySprite(){if(NAT_FLY)return NAT_FLY;const cv=document.createElement('canvas');cv.width=cv.height=20;const g=cv.getContext('2d');g.fillStyle='rgba(220,255,120,.35)';g.beginPath();g.arc(10,10,8,0,TAU);g.fill();g.fillStyle='#eaff8a';g.fillRect(8.4,8.4,3.2,3.2);return NAT_FLY=cv}
function natFogSprite(){if(NAT_FOG)return NAT_FOG;const cv=document.createElement('canvas');cv.width=cv.height=128;const g=cv.getContext('2d'),gr=g.createRadialGradient(64,64,0,64,64,64);
 gr.addColorStop(0,'#e8eef0');gr.addColorStop(.55,'rgba(232,238,240,.7)');gr.addColorStop(1,'rgba(232,238,240,0)');g.fillStyle=gr;g.fillRect(0,0,128,128);return NAT_FOG=cv}
// uccelli in volo, farfalle, foglie, polline, cenere, lucciole, nebbia, vapore, fumo
function natDrawAir(){if(NAT.m!==M||!M)return;const c=ctx,VW=W/zoom,VH=H/zoom,inV=(x,y,m)=>x>camX-(m||60)&&x<camX+VW+(m||60)&&y>camY-(m||60)&&y<camY+VH+(m||60);
 for(const p of NAT.P){if(p.t=='fish'||!inV(p.x,p.y,120))continue;const u=p.age/p.dur,fade=Math.min(1,u*5,(1-u)*3);
  switch(p.t){
   case 'leaf':c.globalAlpha=fade;c.fillStyle=p.col;c.beginPath();c.ellipse(p.x,p.y,2.4,1.2,p.ph*3,0,TAU);c.fill();break;
   case 'pollen':c.globalAlpha=fade*.8;c.fillStyle='#fff6c4';c.fillRect(p.x,p.y,1.4,1.4);break;
   case 'ash':c.globalAlpha=fade*.8;c.fillStyle='#5a5652';c.fillRect(p.x,p.y,2,1.6);break;
   case 'ffly':c.globalAlpha=fade*(.5+.5*Math.sin(p.ph*6));c.drawImage(natFlySprite(),p.x-5,p.y-5,10,10);break;
   case 'fly':{const w=Math.abs(Math.sin(p.ph*14))*2.6+.6;c.globalAlpha=fade;c.fillStyle=p.col;c.beginPath();c.ellipse(p.x-w*.6,p.y,w,1.8,0,0,TAU);c.ellipse(p.x+w*.6,p.y,w,1.8,0,0,TAU);c.fill();c.fillStyle='#222';c.fillRect(p.x-.4,p.y-1.2,.8,2.4);break}
   case 'fog':{c.globalAlpha=fade*.55;c.drawImage(natFogSprite(),p.x-p.sz,p.y-p.sz,p.sz*2,p.sz*2);break}
   case 'steam':case 'smoke':case 'jet':{const r=p.sz*(1+u*(p.t=='jet'?.5:1.6));c.globalAlpha=fade*(p.t=='smoke'?.3:p.t=='jet'?.55:.14)*(1-u*.5);c.fillStyle=p.t=='smoke'?'#77736e':'#f2f6f8';c.beginPath();c.arc(p.x,p.y,r,0,TAU);c.fill();break}
   case 'spark':c.globalAlpha=fade;c.fillStyle='#ffb347';c.fillRect(p.x,p.y,1.6,1.6);break}}
 c.globalAlpha=1;
 const bird=(x,y,a,ph,col,s)=>{const w=Math.sin(ph)*.8;c.save();c.translate(x,y);c.rotate(a);c.scale(s,s);c.fillStyle='rgba(0,0,0,.18)';c.fillRect(6,8,3,1.5);c.strokeStyle=col;c.lineWidth=1.4;c.lineCap='round';
  c.beginPath();c.moveTo(-1,-5);c.quadraticCurveTo(1,-2+w*3,1.5,0);c.quadraticCurveTo(1,2-w*3,-1,5);c.stroke();c.fillStyle=col;c.beginPath();c.ellipse(1.5,0,2,1,0,0,TAU);c.fill();c.restore()};
 for(const f of NAT.flocks)if(f.st==1)for(const b of f.B)if(inV(b.x,b.y))bird(b.x,b.y,Math.atan2(b.vy,b.vx),b.ph,f.col,1);
 for(const g of NAT.gulls)for(const b of g.B){const x=g.x+Math.cos(b.a)*b.r,y=g.y+Math.sin(b.a)*b.r*.6;if(inV(x,y))bird(x,y,b.a+Math.PI/2*Math.sign(b.w),b.ph,'#f4f4f4',1.4)}
 for(const h of NAT.herons)if(h.st&&inV(h.x,h.y))bird(h.x,h.y,Math.atan2(h.vy,h.vx),h.ph,'#9aa4ac',2.2)}
