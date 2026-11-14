'use strict';
/* AIRGRUNT · AGmap.js
   Generazione della GEOMETRIA del mondo: tutto deriva dal seed (host e client ottengono la stessa mappa).
   Qui si crea solo ciò che serve al gioco: quote, acqua (costa con baie e moli, laghi, fiumi, isole), strade, edifici, muri, alberi, rocce.
   Tutto ciò che è puramente decorativo (marciapiedi, parcheggi, campi, piazzali, veicoli...) viene solo descritto in M.flat e disegnato
   da AGdecor.js nell'immagine di sfondo. I siti tematici (quartieri, industrie, porti, ville...) sono costruiti da AGsites.js.
   ZONE (Voronoi deformato): urbane (la maggioranza), industriali, rurali, militari, naturali e la zona di partenza.
   Ogni zona ha una QUOTA (bassa, media, alta): le strade superano i dislivelli con RAMPE, i fiumi con CASCATE. */
function genMap(seed){
 const R=rng(seed),rr=(a,b)=>a+R()*(b-a),ri=(a,b)=>a+(R()*(b-a+1)|0),pick=a=>a[R()*a.length|0],shuf=a=>a.map(o=>[R(),o]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]);
 const m=M={seed,E:new Float32Array((GW+1)*(GH+1)),reg:new Uint8Array(GW*GH),regions:[],lakes:[],isles:[],hills:[],rivers:[],bridges:[],roads:[],roadCells:new Map(),
  ramps:[],falls:[],obs:[],blds:[],sites:[],comp:[],WM:new Uint8Array(GW*GH),RV:new Uint8Array(GW*GH),WN:new Uint8Array(GW*GH),dm:[],flat:[],junc:[],piers:[],tspots:[],cb:null,ports:[]};
 // angolo di partenza casuale: base, partenza ed estrazione ruotano insieme (host e client lo ricavano dal seed)
 BASE.k=R()*4|0;const s0=baseXY(200,200),e0=baseXY(260,260);START[0]=s0[0];START[1]=s0[1];EXT[0]=e0[0];EXT[1]=e0[1];
 const dS=(x,y)=>Math.hypot(x-START[0],y-START[1]);
 gClear();
 // ===== 0. forma della costa: baie e promontori che si sommano alla costa di base =====
 {const cbs=[],by=BASE.k==1?330:WH-330;
 // baie più profonde (fino a -380), promontori invariati. Il mare guadagna spazio verso la terra.
 for(let i=0,n=8+(R()*4|0);i<n;i++){
  const b=[rr(250,WH-250),R()<.72?-rr(150,380):rr(40,90),rr(90,300)];
  // protezione base più ampia e più severa: zona 2.2×larghezza + 1000, riduzione al 10%.
  // Necessario perché con baie -380 una riduzione al 15% lascerebbe la costa troppo vicina al piazzale (BASE.xr=5700).
  if((BASE.k==1||BASE.k==2)&&Math.abs(b[0]-by)<b[2]*2.2+1000)b[1]*=.10;
  cbs.push(b)
 }
 m.cb=y=>{let s=0;for(const b of cbs){const t=(y-b[0])/b[2];s+=b[1]*Math.exp(-t*t)}return s}}
 // ===== 1. zone e quote =====
 const rg=m.regions,cols=5,rows=5,cw=(SEA+300)/cols,chh=WH/rows;
 for(let j=0;j<rows;j++)for(let i=0;i<cols;i++)rg.push({id:rg.length,x:cw*(i+.5)+rr(-.28,.28)*cw,y:chh*(j+.5)+rr(-.28,.28)*chh,type:'nature',lvl:0,rin:0});
 for(const a of rg){let d=1e9;for(const b of rg)if(b!==a)d=Math.min(d,Math.hypot(a.x-b.x,a.y-b.y));a.rin=d/2}
 const base=rg.reduce((a,b)=>dS(a.x,a.y)<dS(b.x,b.y)?a:b);   // referenza alla regione attorno a START (nessun type speciale)
// Profilo di densità scelto in lobby (G.profile → indice in PROFILES di AGconf.js).
// Le regioni non-base non-costiere sono ~19-22; le prime N ricevono i tipi del profilo,
// le altre restano 'nature' (default della griglia). Questo crea la differenza fra una
// metropoli fitta e una wilderness quasi vuota SENZA toccare nient'altro.
// G.profile===0: "Casuale" → profilo scelto dal seed, deterministico (così host e client
// con lo stesso seed risolvono lo STESSO profilo: la mappa resta identica in rete).
// G.profile 1..N: mappa direttamente a PROFILES[0..N-1].
const PROF=G.profile===0
  ? PROFILES[(rng((seed^0x9E3779B9)>>>0)()*PROFILES.length)|0]
  : PROFILES[clamp(G.profile-1,0,PROFILES.length-1)];
const TYPES=[];for(const k in PROF.w)for(let i=0;i<PROF.w[k];i++)TYPES.push(k);
const DENS=PROF.d!=null?PROF.d:1;   // moltiplicatore densità "fuori città"; default 1 per retrocompatibilità
const coastal=r=>r.x>SEA-380;
shuf(rg.filter(r=>!coastal(r))).forEach((r,i)=>{if(i<TYPES.length)r.type=TYPES[i]});
// Costa: il primo tratto resta indus (ancora visiva del porto); tutti gli altri scalano con DENS,
// così in "Selvaggia" non spuntano 3-4 città costiere indesiderate.
shuf(rg.filter(r=>coastal(r))).forEach((r,i)=>r.type=i==0?'indus':R()<.7*DENS?'urban':'rural');
m.profile=PROF.n;   // esposto in M per debug/HUD ("Metropoli", "Selvaggia", …)
 for(const r of rg){const e=.55*(1-r.x/SEA)+.45*R();r.lvl=coastal(r)?0:e<.34?0:e<.62?1:2}
 {const ph=[R()*6.28,R()*6.28,R()*6.28,R()*6.28],cl=new Float32Array(GW*GH),W1=GW+1,E=m.E;
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const x=i*TC+TC/2,y=j*TC+TC/2,wx=x+110*Math.sin(y/230+ph[0])+60*Math.sin(y/97+ph[1]),wy=y+110*Math.sin(x/270+ph[2])+60*Math.sin(x/110+ph[3]);
   let b=0,bd=1e18;for(const r of rg){const d=(wx-r.x)**2+(wy-r.y)**2;if(d<bd){bd=d;b=r.id}}m.reg[j*GW+i]=b;cl[j*GW+i]=rg[b].lvl}
  for(let j=0;j<=GH;j++)for(let i=0;i<=GW;i++){let s=0;for(const[dx,dy]of[[-1,-1],[0,-1],[-1,0],[0,0]])s+=cl[clamp(j+dy,0,GH-1)*GW+clamp(i+dx,0,GW-1)];E[j*W1+i]=s/4}
  for(let p=0;p<2;p++){const T2=E.slice();for(let j=0;j<=GH;j++)for(let i=0;i<=GW;i++){let s=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=i+dx,y=j+dy;if(x<0||y<0||x>GW||y>GH)continue;s+=T2[y*W1+x];n++}E[j*W1+i]=s/n}}}
 const regAt=(x,y)=>rg[m.reg[clamp(y/TC|0,0,GH-1)*GW+clamp(x/TC|0,0,GW-1)]];
 const lvlFlat=(x,y,r)=>{const l=levelAt(x,y);for(let k=0;k<12;k++){const a=k*.5236,c=Math.cos(a),s=Math.sin(a);if(levelAt(x+c*r,y+s*r)!==l||levelAt(x+c*r*.5,y+s*r*.5)!==l)return false}return true};
 // ===== 2. acqua: laghi, stagni, fiumi, isole, moli =====
 // porti: moli di cemento che entrano in mare (terra extra: inWater li considera asciutti); decisi per primi, laghi e fiumi li evitano
 const mPorts=PROF.mp!=null?PROF.mp:2;
for(let t=0;t<200&&m.ports.length<mPorts;t++){const y=rr(1000,WH-1000),cx0=coast(y);
  if(m.ports.some(p=>Math.abs(p.y-y)<1700))continue;
  let ok=lvlFlat(cx0-300,y,260);for(let dy=-440;dy<=440&&ok;dy+=55)if(coast(y+dy)<cx0-150)ok=false;if(!ok)continue;
  const P0=PLAN.mkPort({R,rr,ri},y);m.ports.push(P0);m.piers.push(...P0.piers)}
 const lakeOK=(x,y,r)=>m.ports.every(p=>Math.hypot(x-p.x,y-p.y)>r+800)&&x+r<SEA-250&&lvlFlat(x,y,r*1.25)&&m.lakes.every(l=>Math.hypot(x-l.x,y-l.y)>l.r*1.3+r*1.4+250);
 for(const r of rg){if(coastal(r)||!(r.type=='nature'&&R()<.7||r.type=='rural'&&R()<.3||r.type=='urban'&&R()<.12))continue;
  for(let t=0;t<30;t++){const r0=rr(230,Math.max(250,Math.min(520,r.rin*.7))),x=r.x+rr(-.3,.3)*r.rin,y=r.y+rr(-.3,.3)*r.rin;if(lakeOK(x,y,r0)){m.lakes.push(blob(R,x,y,r0));break}}}
 for(let i=0,n=0;n<4&&i<300;i++){const x=rr(500,SEA-450),y=rr(400,WH-400),r0=rr(70,130),t=regAt(x,y).type;
  if((t=='nature'||t=='rural')&&dS(x,y)>900&&lvlFlat(x,y,r0*1.3)&&m.lakes.every(l=>Math.hypot(x-l.x,y-l.y)>l.r*1.3+r0+300)){m.lakes.push(blob(R,x,y,r0));n++}}
 // fiumi di varie dimensioni: grande (con foce larga), medi, ruscello
 const river=(ax,ay,bx,by,w,mk)=>{const n=120,pts=[],L=Math.hypot(bx-ax,by-ay),nx=-(by-ay)/L,ny=(bx-ax)/L,p1=rr(0,6.28),p2=rr(0,6.28);
  for(let i=0;i<=n;i++){const t=i/n,o=(Math.sin(t*9+p1)*170+Math.sin(t*23+p2)*50)*mk*Math.min(1,t*8,(1-t)*8);pts.push([ax+(bx-ax)*t+nx*o,ay+(by-ay)*t+ny*o])}return{pts,w}};
 const RT=[[92,124,1.1],[54,72,1],[54,72,1],[34,44,.8],[34,44,.8]];
 for(let i=0,n=0,nr=3+(R()*3|0);n<nr&&i<160;i++){const[w0,w1,mk]=RT[n%RT.length],L0=m.lakes.length?pick(m.lakes):null,fl=L0&&R()<.5,ax=fl?L0.x:rr(1200,SEA-900),ay=fl?L0.y:rr(100,WH-100),by=rr(300,WH-300),rv=river(ax,ay,coast(by)+40,by,rr(w0,w1),mk);
  if(m.rivers.every(o=>Math.abs(o.pts[o.pts.length-1][1]-by)>420)&&m.ports.every(p=>Math.abs(p.y-by)>700)){m.rivers.push(rv);n++}}
 // (i ponti isolati sui fiumi si decidono più avanti, dopo le strade: vedi "ponti" nel punto 5)
 const isl=(x,y,R0)=>{
  const s=blob(R,x,y,R0);
  // Forme più variate: ellittiche, allungate, irregolari
  const sx=rr(.65,1.45), sy=rr(.65,1.45), stretch=R()<.4?rr(1.2,1.9):1;
  const mx=Math.max(...s.a);
  s.a=s.a.map((v,i)=>{
    const ang=i/s.a.length*TAU;
    const def=R0*(.75+.25*v/mx)*(1+0.25*Math.sin(ang*ri(2,5)+R()*6));
    return def*(Math.abs(Math.cos(ang))*sx + Math.abs(Math.sin(ang))*sy)*stretch*.7;
  });
  s.R=Math.max(...s.a);
  return s;
};
// E variare R0:
// R0 = two ? mr*.22..*.38 : clamp(mr*.35, 90, 280)
 const free0=(x,y,R0)=>m.rivers.every(rv=>segNear(rv.pts,x,y)[0]>R0*1.2+rv.w/2+40)&&m.isles.every(s=>Math.hypot(x-s.x,y-s.y)>s.R+R0+40)&&m.piers.every(p=>Math.hypot(x-p.x,y-p.y)>R0+p.L/2+160);
 for(const l of m.lakes.slice()){const mr=Math.min(...l.a);if(mr<250)continue;const two=mr>380,R0=two?mr*.3:clamp(mr*.42,115,230);
  for(let k=0;k<(two?2:1);k++){const t=R()*6.28,d=two?mr*.38:rr(0,mr*.2),x=l.x+Math.cos(t+k*3.1416)*d,y=l.y+Math.sin(t+k*3.1416)*d;
   if(!free0(x,y,R0))continue;const s=isl(x,y,R0);s.q=t;m.isles.push(s);
   if(R0>=150&&R()<.6){const th=R()*6.28,c=Math.cos(th),sn=Math.sin(th);let q=R0*.6;s.dir=th;
    while(q<2000&&inBlob(l,x+c*q,y+sn*q,10))q+=12;const t0=R0*.6,t1=q+60;m.bridges.push({x:x+c*(t0+t1)/2,y:y+sn*(t0+t1)/2,a:th,c,s:sn,L:t1-t0,bw:116})}}}
 for(let i=0,n=0;n<4&&i<60;i++){const y=rr(300,WH-300),W2=(WW-coast(y))/2,R0=Math.min(rr(110,135),W2-30),x=coast(y)+W2;if(R0>=105&&free0(x,y,R0)){m.isles.push(isl(x,y,R0));n++}}
 { // maschere dell'acqua: si controllano con inWater solo le celle vicine ad acqua
  const cand=new Uint8Array(GW*GH),mk=(x,y,r)=>{const i0=Math.max(0,Math.floor((x-r)/TC)),i1=Math.min(GW-1,Math.floor((x+r)/TC)),j0=Math.max(0,Math.floor((y-r)/TC)),j1=Math.min(GH-1,Math.floor((y+r)/TC));for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)cand[j*GW+i]=1};
  // Margini ridotti da +60 a +10 per permettere di costruire più vicini
  for(const rv of m.rivers)for(const q of rv.pts)mk(q[0],q[1],rv.w/2+10);
  for(const l of m.lakes)mk(l.x,l.y,l.r*1.4+10);
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++)if(i*TC+TC>SEA-300)cand[j*GW+i]=1;
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++)if(cand[j*GW+i]&&inWater(i*TC+20,j*TC+20,26))m.WM[j*GW+i]=1;
  // RV: celle bagnate che sono SOLO fiume (né lago né mare)
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++)if(m.WM[j*GW+i]){const x=i*TC+20,y=j*TC+20;let w=x+26>coast(y);for(const l of m.lakes)if(!w&&inBlob(l,x,y,26))w=true;if(!w)m.RV[j*GW+i]=1}
  // Espansione di sicurezza ridotta da 3 celle a 1 cella
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++)if(m.WM[j*GW+i])for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=i+dx,y=j+dy;if(x>=0&&y>=0&&x<GW&&y<GH)m.WN[y*GW+x]=1}
  m.wnReady=1}
 for(const r of rg)if(r.type=='nature'&&!coastal(r))for(let k=0;k<2;k++){const x=r.x+rr(-.5,.5)*r.rin,y=r.y+rr(-.5,.5)*r.rin;if(!wetCell(x,y))m.hills.push(blob(R,x,y,rr(220,420)))}
 // ===== 3. strumenti per costruire: edifici (anche fusi in gruppi), speciali, muri, alberi =====

 const obs=m.obs,blds=m.blds,sites=m.sites,ts=[],later=[];let GRP=0;
 const addO=o=>{o.pal=o.pal||0;obs.push(o);gAdd(o);return o};
 const free=(x,y,r,rm)=>!(nearWater(x,y)&&inWater(x,y,Math.max(0,r-4)))&&!m.bridges.some(b=>Math.hypot(x-b.x,y-b.y)<b.L/2+60)&&!onRoad(x,y,rm==null?r+8:rm);
 const mkB=(x,y,w,h,a,shape,ty)=>{const g=bgeomEx(shape,w,h),sp=SPEC[shape]||0;return{t:'b',ty:ty||(sp?shape:'house'),shape,x,y,w,h,a,c:Math.cos(a),s:Math.sin(a),r:g.r,pr:g.pr,an:g.an,hp:sp?Math.round(sp*Math.max(.7,Math.sqrt(w*h)/110)):Math.round(w*h/25),sp:sp?1:0}};
 // mode 0 terra, 1 isola, 2 senza controlli sull'acqua, 3 solo acqua (navi, piattaforme)
 const bOK=(o,gap,mode,riv)=>{
  for(const b of qobs(o.x,o.y,o.r+gap+170,[])){if(b.t=='t')continue;const d=Math.hypot(o.x-b.x,o.y-b.y),rs=o.r+b.r+gap;if(d>=rs)continue;if(d<rs*.3)return false;
   for(let u=-o.r;u<=o.r;u+=20)for(let v=-o.r;v<=o.r;v+=20){if(bsd(o,u,v)>4)continue;const w=toWorld(o,u,v),l=toLocal(b,w[0],w[1]);if(bsd(b,l[0],l[1])<gap)return false}}
  if(mode!=1)for(const b of m.bridges){if(Math.hypot(o.x-b.x,o.y-b.y)>=b.L/2+b.bw/2+o.r+60)continue;   // scarto veloce
   for(let u=-o.r;u<=o.r;u+=20)for(let v=-o.r;v<=o.r;v+=20){if(bsd(o,u,v)>6)continue;const w=toWorld(o,u,v),dx=w[0]-b.x,dy=w[1]-b.y;   // il ponte è un rettangolo: si evita lui, non un cerchio grande quanto un isolato
    if(Math.abs(dx*b.c+dy*b.s)<b.L/2+60&&Math.abs(-dx*b.s+dy*b.c)<b.bw/2+14)return false}}
  let wetN=0,sampN=0;
for(let u=-o.r;u<=o.r;u+=40)for(let v=-o.r;v<=o.r;v+=40)if(bsd(o,u,v)<12){const w=toWorld(o,u,v);sampN++;
 if(mode==0){if(wetCell(w[0],w[1])&&!(riv&&riverCell(w[0],w[1])))wetN++}   // conta, non rifiuta subito; con riv il FIUME non conta (si costruisce sopra), lago e mare sì
 else if(mode==1&&isleM(w[0],w[1])<14)return false;
 else if(mode==3&&!inWater(w[0],w[1],0))return false}
// mode 0: accetta fino a ~30% del footprint in wetCell (sbordo sul fiume)
if(mode==0&&sampN&&wetN/sampN>.30)return false;
  if(mode==0||mode==1){const n=Math.ceil((o.r+60)/100),cx=o.x/100|0,cy=o.y/100|0,seen=new Set();
 for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++){const a=m.roadCells.get((cx+i)*1024+cy+j);if(a)for(const d of a)if(!seen.has(d)){seen.add(d);
  // campiona lungo i segmenti (20 px) invece di usare solo i vertici (50 px)
  for(let k=0;k<d.pts.length-1;k++){
   const A=d.pts[k],B=d.pts[k+1],segL=Math.hypot(B[0]-A[0],B[1]-A[1]),steps=Math.max(1,Math.ceil(segL/20));
   for(let t=0;t<=steps;t++){
    const u=t/steps,qx=A[0]+(B[0]-A[0])*u,qy=A[1]+(B[1]-A[1])*u;
    const dx=qx-o.x,dy=qy-o.y;
    if(dx*dx+dy*dy<(o.r+d.w/2+8)**2&&bsd(o,dx*o.c+dy*o.s,-dx*o.s+dy*o.c)<d.w/2+2+(d.sw?8:0))return false;
   }
  }
 }}}
  return true};
 const killTrees=o=>{for(const t of qobs(o.x,o.y,o.r+40,[]))if(t.t=='t'){const l=toLocal(o,t.x,t.y);if(bsd(o,l[0],l[1])<t.r+4)t.dead=1}};
 // gruppo di edifici (ognuno resta un edificio a sé, ma insieme formano una struttura): o tutti o nessuno
 const addGroup=(parts,opt)=>{opt=opt||{};const gap=opt.gap!=null?opt.gap:opt.tight?8:28,os=[];
 for(const p of parts){const o=mkB(p.x,p.y,p.w,p.h,p.a,p.sh||pick(opt.tight?BTOWN:BSHAPES),p.ty);
  // force:true salta tutti i controlli geometrici (dS, inBase, bOK, lvlFlat): usato dalla villa che deve essere costruita sempre
  if(!opt.force && (!bOK(o,gap,opt.iso?1:0,opt.riv)||(!opt.tight&&!opt.iso&&!lvlFlat(o.x,o.y,o.r))))return null;os.push(o)}
  const g=parts.length>1?++GRP:0,pal=opt.pal!=null?opt.pal:pick(PAL_ALL);
  for(const o of os){let d1=ri(0,10),d2=ri(0,9);if(d2>=d1)d2++;o.dec=[d1,d2];o.pal=opt.pals?pick(opt.pals):(opt.pal==null&&os.length>1&&R()<.4?pick(PAL_ALL):pal);o.tw=opt.tight?1:0;o.is=opt.iso?1:0;
   o.rf=o.w>=150&&o.h>=150&&(o.shape=='rect'||o.shape=='square')?ri(0,3):0;o.grp=g;o.fz=opt.fz!=null?opt.fz:opt.iso?4:opt.tight?1:3;killTrees(o);blds.push(o);addO(o);
   if(!opt.noSlab){const sc=1+R()*2;
    m.flat.push({k:'slab',t:0,x:o.x,y:o.y,w:o.w*sc+24,h:o.h*sc+24,a:o.a,soft:1});
    if(R()<.4) m.flat.push({k:'lot',x:o.x+rr(-o.w*.3,o.w*.3),y:o.y+rr(-o.h*.3,o.h*.3),w:rr(40,80),h:rr(40,70),a:o.a+rr(-.3,.3),s:ri(0,1e6)})}}
  return os};
 const addB=(x,y,w,h,a,sh,tight,iso,ty,pals,fz,force,noSlab)=>{const r=addGroup([{x,y,w,h,a,sh,ty}],{tight,iso,pals,fz,force,noSlab});return r?r[0]:null};
 // edificio "che si adatta" (isolati e anelli cittadini): prima come richiesto (anche ruotato), poi senza rotazione e via via più piccolo, con distanze più strette
 const fitB=(x,y,w,h,a,a0,sh,ty,pals,fz,riv)=>{for(const k of[1,.92,.84,.74,.64,.55]){for(const aa of(a===a0?[a0]:[a,a0])){const r=addGroup([{x,y,w:w*k,h:h*k,a:aa,sh,ty}],{tight:true,pals,fz,riv,gap:k<1?4:8});if(r)return r[0]}}
  const c=Math.cos(a0),s=Math.sin(a0);   // ultima spiaggia (strada che attraversa l'isolato): edificio piccolo spostato verso un lato o un angolo
  for(const[du,dv]of[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]]){const u=du*w*.28,v=dv*h*.28,r=addGroup([{x:x+u*c-v*s,y:y+u*s+v*c,w:w*.5,h:h*.5,a:a0,sh,ty}],{tight:true,pals,fz,riv,gap:4});if(r)return r[0]}
  return null};
 // complesso: più edifici di forme diverse disposti insieme su un unico slab. Ogni riga: [u, v, larghezza, altezza, forma] in coordinate locali
 const addCompound=(x,y,a)=>{const c=Math.cos(a),s=Math.sin(a),k=rr(.85,1.15),T=(u,v)=>[x+u*c-v*s,y+u*s+v*c],
  LAY={
   court:[[0,-70,230,70,'rect'],[-90,20,50,100,'rect'],[90,20,50,100,'rect']],
   row:[[-150,0,100,100,'rect'],[0,0,120,130,pick(['L','U','H','T'])],[150,0,100,100,'oct']],
   campus:[[0,0,150,150,pick(['oct','hex','cross','quad'])],[-140,0,60,80,'rect'],[140,0,60,80,'rect'],[0,135,100,60,'rect'],[0,-135,100,60,'rect']],
   twin:[[0,0,120,120,'tower'],[130,20,90,70,'rect'],[-120,-10,80,100,'L']]},
  L=LAY[pick(Object.keys(LAY))],
  ps=L.map(p=>{const q=T(p[0]*k,p[1]*k);return{x:q[0],y:q[1],w:p[2]*k,h:p[3]*k,a,sh:p[4],ty:'house'}}),
  ex=L.reduce((e,p)=>[Math.min(e[0],p[0]-p[2]/2),Math.max(e[1],p[0]+p[2]/2),Math.min(e[2],p[1]-p[3]/2),Math.max(e[3],p[1]+p[3]/2)],[1e9,-1e9,1e9,-1e9]),
  sp=T((ex[0]+ex[1])/2*k,(ex[2]+ex[3])/2*k),os=addGroup(ps,{gap:12,fz:3,noSlab:1});
  if(os)m.flat.push({k:'slab',t:0,x:sp[0],y:sp[1],w:(ex[1]-ex[0])*k+70,h:(ex[3]-ex[2])*k+70,a,soft:1});
  return os};
 const addX=(x,y,w,h,a,shape,mode,ex)=>{ex=ex||{};const o=mkB(x,y,w,h,a,shape);if(!ex.force && !bOK(o,ex.gap!=null?ex.gap:12,mode||0))return null;
  Object.assign(o,ex.o||{});if(shape=='cont'&&!o.cc)o.cc=Array.from({length:Math.max(1,Math.round(w/56))*Math.max(1,Math.round(h/24))},()=>ri(0,9));killTrees(o);return addO(o)};
 // muri: segmenti allineati; dove passa una strada o c'è un varco restano vuoti
 const wallSeg=(x,y,len,th,a,gates)=>{
  for(const g of gates||[])if(Math.hypot(x-g[0],y-g[1])<len/2+70)return;
  if(wetCell(x,y)||m.bridges.some(b=>Math.hypot(x-b.x,y-b.y)<b.L/2+40))return;
  const c=Math.cos(a),s=Math.sin(a);
  if(onRoad(x,y,th/2+2))return;
  const o=mkB(x,y,len,th+4,a,'rect','wall');o.hp=o.m=520;o.pal=PAL_WALL;
  // distanza minima anche dagli altri muri (evita labirinti)
  for(const b of qobs(x,y,o.r+55,[])){
   if(b.t=='t'||b.ty==='rock')continue;
   if(Math.hypot(x-b.x,y-b.y)>o.r+b.r+18)continue;   // +18 px di margine
   const l=toLocal(b,x,y);
   if(bsd(b,l[0],l[1])<(b.ty==='wall'?22:th/2+2))return;
  }
  killTrees(o);addO(o)};
 const wallLine=(ax,ay,bx,by,th,gates)=>{
  const L=Math.hypot(bx-ax,by-ay);
  // SEMPRE a pezzetti (mai un pezzo unico lungo)
  const n=Math.max(1,Math.round(L/70)),a=Math.atan2(by-ay,bx-ax),sl=L/n;
  for(let i=0;i<n;i++){
   // piccolo gap casuale ogni tanto per dare un aspetto più rotto
   if(R()<.12)continue;
   wallSeg(ax+(bx-ax)*((i+.5)/n),ay+(by-ay)*((i+.5)/n),sl+2,th,a,gates);
  }
};
 const wallRect=(x,y,a,w,h,th,gates)=>{const C=Math.cos(a),Sn=Math.sin(a),T=(u,v)=>[x+u*C-v*Sn,y+u*Sn+v*C],hw=w/2,hh=h/2,cs=[T(-hw,-hh),T(hw,-hh),T(hw,hh),T(-hw,hh)];
  for(let i=0;i<4;i++)wallLine(cs[i][0],cs[i][1],cs[(i+1)%4][0],cs[(i+1)%4][1],th,gates)};
 const wallCirc=(x,y,r,gates)=>{const n=40;for(let i=0;i<n;i++){const t0=i/n*TAU,t1=(i+1)/n*TAU;wallLine(x+Math.cos(t0)*r,y+Math.sin(t0)*r,x+Math.cos(t1)*r,y+Math.sin(t1)*r,20,gates)}};
 const onSlab=(x,y)=>{for(const f of m.flat){if(f.k!='slab'&&f.k!='lot')continue;if(f.k=='slab'&&(f.t==0||f.t==2||f.t==5))continue;const c=Math.cos(f.a||0),s=Math.sin(f.a||0),dx=x-f.x,dy=y-f.y;if(Math.abs(dx*c+dy*s)<f.w/2&&Math.abs(-dx*s+dy*c)<f.h/2)return true}return false};   // piazzali industriali, portuali, militari e parcheggi: niente alberi
 const tree=(x,y,r,sw)=>{if(!free(x,y,r,sw?-2:null)||onSlab(x,y))return;for(const o of qobs(x,y,r+30,[])){if(o.t=='t')continue;const l=toLocal(o,x,y);if(bsd(o,l[0],l[1])<r+6)return}addO({t:'t',x,y,r,hp:50,m:50,tn:ri(0,2)})};
 const st=(A,B,w,cls,sw)=>{const L=Math.hypot(B[0]-A[0],B[1]-A[1]),n=Math.max(1,Math.round(L/50)),pts=[];for(let i=0;i<=n;i++)pts.push([A[0]+(B[0]-A[0])*i/n,A[1]+(B[1]-A[1])*i/n]);return{pts,w,ty:0,cls,sw}};
 const dry=(x,y,r)=>{if(x<r*.5||y<r*.5||y>WH-r*.5||x>SEA-r*.4)return false;
  let waterHits = 0;
  // Controlla 8 punti al 60% del raggio, senza margini rigidi
  for(let k=0;k<8;k++){const a=k*.7853;if(inWater(x+Math.cos(a)*r*.6,y+Math.sin(a)*r*.6,0))waterHits++;}
  // Se più di 3 punti su 8 sono in acqua profonda, scarta. Altrimenti accetta (permette attraversamenti).
  if(waterHits>3)return false;
  return!inWater(x,y,0)&&sites.every(s=>s.ds?s.ds.every(q=>Math.hypot(x-q.x,y-q.y)>q.rad+r+70):Math.hypot(x-s.x,y-s.y)>(r+s.r)*.75+80)};
 const dryD=(D,ds)=>dry(D.x,D.y,D.rad)&&lvlFlat(D.x,D.y,D.rad*.5)&&ds.every(q=>Math.hypot(D.x-q.x,D.y-q.y)>q.rad+D.rad+40);
 const K={m,R,rr,ri,pick,shuf,ts,st,later,addB,fitB,addGroup,addX,wallLine,wallRect,wallCirc,tree,dryD,r0:null,cs:PROF.cs||1,cd:PROF.cd||1};
 // ===== 4. siti: cittadine (g quartieri a più griglie, r anello, l lineare), industrie (i), porti (p), fattorie (f), ville (v), basi militari (c) =====
 const addSite=(S,tries)=>{for(let t=0;t<tries;t++){const sc=Math.max(.5,1-t*.05);S.sc=sc;const o=S.mk(sc);
  // il sito villa non richiede pianura: può sorgere su un pendio (l'edificio sarà posizionato in modalità "tight", senza lvlFlat)
  if(o&&dry(o.x,o.y,o.r)&&(S.k=='v'||lvlFlat(o.x,o.y,o.r*.5))){Object.assign(S,o);sites.push(S);return true}}
  return false};
 for(const P0 of m.ports)sites.push(P0);
 for(const r of rg){K.r0=r;
  if(r.type=='urban'){const k0=R(),kind=k0<.5?'g':k0<.75?'r':'l';   // 50% griglia, 25% anello, 25% lineare
  if(kind=='g'){for(let n=0,nc=1;n<nc;n++)for(let t=0;t<24;t++){const S0=PLAN.mkCity(K,Math.max(.45,1-t*.04));if(S0){sites.push({k:'g',reg:r.id,a:0,...S0});break}}}
  else addSite({k:kind,reg:r.id,a:R()*3.14,mk:sc=>{const x=r.x+rr(-.4,.4)*r.rin,y=r.y+rr(-.4,.4)*r.rin;if(kind=='r'){const rr0=rr(300,380)*sc;return{x,y,rr:rr0,r:rr0+300}}const L=rr(900,1400)*sc;return{x,y,L,r:L/2+150}}},24)}
  else if(r.type=='indus'){
   if(!sites.some(s=>s.k=='k')&&R()<.45)addSite({k:'k',reg:r.id,a:R()*3.14,mk:sc=>PLAN.mkNuke(K,sc)},16);
   else addSite({k:'i',reg:r.id,a:R()<.5?0:1.5708+rr(-.2,.2),mk:sc=>PLAN.mkInd(K,sc)},14);
  }
  else if(r.type=='rural'){for(let i=0;i<3;i++)addSite({k:'f',reg:r.id,a:R()*3.14,mk:()=>{const a=R()*TAU,d=Math.sqrt(R())*r.rin*.9;return{x:r.x+Math.cos(a)*d,y:r.y+Math.sin(a)*d,r:330}}},12);
   for(let i=0,n=ri(1,2);i<n;i++)addSite({k:'v',reg:r.id,a:R()*3.14,mk:()=>{const a=R()*TAU,d=Math.sqrt(R())*r.rin*.9,W=rr(380,470),H=rr(320,400);return{x:r.x+Math.cos(a)*d,y:r.y+Math.sin(a)*d,W,H,r:Math.hypot(W,H)/2+90}}},12)}
  else if(r.type=='mil'){
   const milPick=R();
   if(milPick<.25&&!sites.some(s=>s.k=='y'))addSite({k:'y',reg:r.id,a:R()*3.14,mk:sc=>PLAN.mkYard(K,sc)},24);
   else if(milPick<.50&&!sites.some(s=>s.k=='n'))addSite({k:'n',reg:r.id,a:R()*3.14,mk:sc=>PLAN.mkSilo(K,sc)},16);
   else if(milPick<.75&&!sites.some(s=>s.k=='a'))addSite({k:'a',reg:r.id,a:R()*3.14,mk:sc=>PLAN.mkAir(K,sc)},16);
   else addSite({k:'c',reg:r.id,a:R()*3.14,mk:sc=>{const w=rr(620,820)*sc,h=rr(500,660)*sc;return{x:r.x+rr(-.2,.2)*r.rin,y:r.y+rr(-.2,.2)*r.rin,w,h,r:Math.hypot(w,h)/2+60}}},8);
  }
  else if(r.type=='nature'&&R()<.3)addSite({k:'v',reg:r.id,a:R()*3.14,mk:()=>{const a=R()*TAU,d=Math.sqrt(R())*r.rin*.8,W=rr(380,450),H=rr(320,380);return{x:r.x+Math.cos(a)*d,y:r.y+Math.sin(a)*d,W,H,r:Math.hypot(W,H)/2+90}}},12)}
 // recinti militari in più (le caserme sono fino a BAR_MAX) — numero scalato dalla densità del profilo
const maxMil=Math.max(1,Math.round(BAR_MAX*DENS));
for(let t=0;t<700&&sites.filter(q=>q.k=='c').length<maxMil;t++){const r=pick(rg);if(coastal(r)||r.type=='mil')continue;
  addSite({k:'c',reg:r.id,a:R()*3.14,mk:sc=>{const w=rr(560,680)*sc,h=rr(440,520)*sc;return{x:rr(500,SEA-500),y:rr(400,WH-400),w,h,r:Math.hypot(w,h)/2+60}}},1)}

 // Estrazione equa dei 3 mega-siti speciali (astronave 'y', silos 'n', aeroporto 'a')
 // Mega-siti forzati (y/n/a/k). Il numero MASSIMO di aggiunte è limitato da PROF.mf:
// in Selvaggia (mf=1) la mappa resta quasi vuota; in Metropoli (mf=4) ci sono tutti.
const forcedList=shuf(G.sel==0||G.sel>=6?['y','n','a','k']:['y','n','a']);
const mf=PROF.mf!=null?PROF.mf:4;
let fCount=0;
for(const k of forcedList){
  if(fCount>=mf)break;
  if(sites.some(s=>s.k==k))continue;             // già presente (es. 'k' dalla regione indus): non consuma mf
  const mkFn=k=='y'?PLAN.mkYard:k=='n'?PLAN.mkSilo:k=='k'?PLAN.mkNuke:PLAN.mkAir;
  for(let t=0;t<300&&!sites.some(s=>s.k==k);t++){
   const r=pick(rg);if(coastal(r))continue;
   K.r0=r;
   if(addSite({k,reg:r.id,a:R()*3.14,mk:sc=>mkFn(K,sc)},12))break;
  }
  if(sites.some(s=>s.k==k))fCount++;
}

 const PK={g:PLAN.city,r:PLAN.ring,l:PLAN.line,f:PLAN.farm,v:PLAN.villa,c:PLAN.comp,i:PLAN.ind,p:PLAN.port,y:PLAN.yard,n:PLAN.silo,a:PLAN.air,k:PLAN.nuke};
 for(const S of sites)PK[S.k](K,S);
 // Niente PLAN.base: lo spawn è in un angolo a caso (BASE.k resta, i giocatori partono lì),
 // ma il sito vicino allo spawn è quello che il caso ha generato (o niente).
 // ===== 5. rete stradale: superstrade tra i grandi siti, viali, strade secondarie, qualche sterrato; strada costiera =====
 const fix=(p,mg)=>{for(const l of m.lakes){const dx=p[0]-l.x,dy=p[1]-l.y,d=Math.hypot(dx,dy),mm=rad(l,p[0],p[1])+mg;if(d<mm){const k=mm/(d||1);p[0]=l.x+dx*k;p[1]=l.y+dy*k}}p[0]=clamp(p[0],40,coast(p[1])-90);p[1]=clamp(p[1],40,WH-40)};
 const makeRoad=(pts,w)=>{const out=[];
  for(let i=0;i<pts.length-1;i++){const[ax,ay]=pts[i],[bx,by]=pts[i+1],L=Math.hypot(bx-ax,by-ay),n=Math.max(1,Math.round(L/50)),nx=-(by-ay)/L,ny=(bx-ax)/L,ph=rr(0,6.28),am=rr(15,40);
   for(let k=0;k<n;k++){const t=k/n,o=Math.sin(t*TAU+ph)*am*Math.sin(t*Math.PI);out.push([ax+(bx-ax)*t+nx*o,ay+(by-ay)*t+ny*o])}}
  out.push(pts[pts.length-1].slice());for(const p of out)fix(p,100);
  for(let it=0;it<6;it++){for(let i=1;i<out.length-1;i++){out[i][0]=(out[i-1][0]+out[i][0]*2+out[i+1][0])/4;out[i][1]=(out[i-1][1]+out[i][1]*2+out[i+1][1])/4}for(const p of out)fix(p,90)}
  return{pts:out,w}};
 const bc=baseXY(330,330),nodes=[{x:bc[0],y:bc[1],k:'c',ends:[baseXY(690,330),baseXY(330,680)]},...sites],rk={g:3,r:3,l:2,f:1,c:2,i:3,p:3,v:1,y:3,n:2,a:3,k:2},lk=new Set(),dn=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const nearEnd=(A,P)=>{let b=[A.x,A.y],bd=1e9;for(const e of A.ends||[]){const d=Math.hypot(e[0]-P[0],e[1]-P[1]);if(d<bd){bd=d;b=e}}return b};
 const link=(A0,B0)=>{const ea=nearEnd(A0,[B0.x,B0.y]),eb=nearEnd(B0,ea),A={x:ea[0],y:ea[1]},B={x:eb[0],y:eb[1]},L=dn(A,B),k=Math.min(rk[A0.k],rk[B0.k]),nx=-(B.y-A.y)/L,ny=(B.x-A.x)/L,mm=L>1300?2:1,p=[[A.x,A.y]];
  for(let i=1;i<=mm;i++){const t=i/(mm+1),o=rr(-.18,.18)*L;p.push([A.x+(B.x-A.x)*t+nx*o,A.y+(B.y-A.y)*t+ny*o])}
  p.push([B.x,B.y]);const rd=makeRoad(p,k==3?rr(74,90):k==2?rr(52,62):rr(32,40));rd.ty=k==1&&R()<.3?1:0;rd.cls=k==3?'hw':k==2?'av':rd.ty?'dirt':'st';rd.sw=0;rd.lk=[A0,B0];m.roads.push(rd)};
 const inT=[0];
 while(inT.length<nodes.length){let bi=0,bj=0,bd=1e9;for(const i of inT)for(let j=0;j<nodes.length;j++)if(!inT.includes(j)&&dn(nodes[i],nodes[j])<bd){bd=dn(nodes[i],nodes[j]);bi=i;bj=j}inT.push(bj);link(nodes[bi],nodes[bj]);lk.add(bi+','+bj)}
 for(let i=1;i<nodes.length;i++)if(R()<.35){let bj=-1,bd=1e9;for(let j=0;j<nodes.length;j++)if(j!=i&&!lk.has(i+','+j)&&!lk.has(j+','+i)&&dn(nodes[i],nodes[j])<bd){bd=dn(nodes[i],nodes[j]);bj=j}if(bj>=0){lk.add(i+','+bj);link(nodes[i],nodes[bj])}}
 for(let i=1;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const A=nodes[i],B=nodes[j];   // superstrade in più tra cittadine lontane il giusto
  if('grl'.includes(A.k)&&'grl'.includes(B.k)&&dn(A,B)>1400&&dn(A,B)<4200&&!lk.has(i+','+j)&&!lk.has(j+','+i)&&R()<.45){lk.add(i+','+j);link(A,B)}}
 {const y0=rr(200,900),y1=rr(WH*0.75,WH-300),p=[];for(let y=y0;y<=y1;y+=400)p.push([coast(y)-(m.ports.some(q=>Math.abs(y-q.y)<650)?720:250),y]);const rd=makeRoad(p,84);rd.ty=0;rd.cls='hw';rd.sw=0;m.roads.push(rd)}   // strada costiera
 {const main=m.roads.filter(r=>r.pts.length>24);
  for(let i=0;i<12&&main.length;i++){const r0=pick(main),q=r0.pts[10+Math.floor(R()*(r0.pts.length-20))],a=R()*TAU,L=rr(300,700),
   p1=[q[0]+Math.cos(a)*L*.5+rr(-60,60),q[1]+Math.sin(a)*L*.5+rr(-60,60)],a2=a+rr(-.5,.5),p2=[q[0]+Math.cos(a2)*L,q[1]+Math.sin(a2)*L],rd=makeRoad([q.slice(),p1,p2],rr(22,28));rd.ty=0;rd.cls='al';rd.sw=0;m.roads.push(rd)}   // stradine secondarie
  for(const r of rg)if(r.type=='nature'&&!coastal(r)&&R()<.9){const a=R()*TAU,p=[],c0=[r.x+rr(-.3,.3)*r.rin,r.y+rr(-.3,.3)*r.rin];for(let k=0;k<3;k++){const t=a+k*.9+rr(-.3,.3);p.push([c0[0]+Math.cos(t)*rr(120,300)*(k+1)*.7,c0[1]+Math.sin(t)*rr(120,300)*(k+1)*.7])}
   const rd=makeRoad(p,rr(18,24));rd.ty=1;rd.cls='dirt';rd.sw=0;if(rd.pts.every(q=>!wetCell(q[0],q[1])&&m.rivers.every(rv=>segNear(rv.pts,q[0],q[1])[0]>rv.w/2+70)))m.roads.push(rd)}}   // sentieri in terra, rari
 m.roads.push(...ts);
 for(const rd of m.roads){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  rd.pts.forEach(q=>{x0=Math.min(x0,q[0]);y0=Math.min(y0,q[1]);x1=Math.max(x1,q[0]);y1=Math.max(y1,q[1]);const cx=Math.floor(q[0]/100),cy=Math.floor(q[1]/100);
   for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++){const k=(cx+i)*1024+cy+j;let a=m.roadCells.get(k);if(!a)m.roadCells.set(k,a=[]);if(a[a.length-1]!==rd)a.push(rd)}});
  rd.bb=[x0-110,y0-110,x1+110,y1+110]}
 // ponti (sempre in cemento) dove le strade attraversano i fiumi
 for(const rd of m.roads)for(const rv of m.rivers){let i0=-1;
  const flush=i1=>{if(i0<0)return;
   for(let s=i0;s<=i1;s+=5){const e=Math.min(i1,s+5),f=rd.pts[s],l=rd.pts[e],pa=rd.pts[Math.max(0,s-1)],pb=rd.pts[Math.min(rd.pts.length-1,e+1)],a=Math.atan2(pb[1]-pa[1],pb[0]-pa[0]);   // un tratto lungo (strada che segue il fiume) si copre con più ponti da 5 segmenti, ognuno nella direzione locale
   const nb={x:(f[0]+l[0])/2,y:(f[1]+l[1])/2,a,c:Math.cos(a),s:Math.sin(a),L:Math.max(rv.w+110,Math.hypot(l[0]-f[0],l[1]-f[1])+80),bw:Math.max(96,rd.w+34)};
   // un ponte parallelo che si sovrappone a uno già fatto (strade quasi sovrapposte, tipico vicino alla costa) viene fuso: l'esistente si allarga
   const ov=m.bridges.find(b=>{const dx=nb.x-b.x,dy=nb.y-b.y;return Math.abs(Math.sin(a-b.a))<.12&&Math.abs(dx*b.c+dy*b.s)<(b.L+nb.L)/2-40&&Math.abs(-dx*b.s+dy*b.c)<(b.bw+nb.bw)/2+20});
   if(ov){const dx=nb.x-ov.x,dy=nb.y-ov.y,al=dx*ov.c+dy*ov.s,lat=-dx*ov.s+dy*ov.c,a0=Math.min(-ov.L/2,al-nb.L/2),a1=Math.max(ov.L/2,al+nb.L/2),dr=nb.L/2*Math.abs(Math.sin(a-ov.a)),l0=Math.min(-ov.bw/2,lat-nb.bw/2-dr),l1=Math.max(ov.bw/2,lat+nb.bw/2+dr),ma=(a0+a1)/2,ml=(l0+l1)/2;ov.x+=ov.c*ma-ov.s*ml;ov.y+=ov.s*ma+ov.c*ml;ov.L=a1-a0;ov.bw=l1-l0}
   else m.bridges.push(nb)}
   i0=-1};
  rd.pts.forEach((q,i)=>{if(segNear(rv.pts,q[0],q[1])[0]<rv.w/2+rd.w/2+4){if(i0<0)i0=i}else flush(i-1)});flush(rd.pts.length-1)}   // ponte solo dove la strada tocca davvero l'acqua (non dove le corre accanto)
// ponti isolati sui fiumi: solo dove non c'è già una strada (300 px) né un altro ponte, non vicino alla costa e senza edifici sopra
for(const rv of m.rivers)for(const t of[.25,.5,.75]){const i=Math.round(rv.pts.length*(t+rr(-.05,.05))),q=rv.pts[i],a=Math.atan2(rv.pts[i+1][1]-rv.pts[i-1][1],rv.pts[i+1][0]-rv.pts[i-1][0])+Math.PI/2,L=rv.w+80;
 if(q[0]>coast(q[1])-450||m.roads.some(rd=>q[0]>rd.bb[0]-200&&q[0]<rd.bb[2]+200&&q[1]>rd.bb[1]-200&&q[1]<rd.bb[3]+200&&segNear(rd.pts,q[0],q[1])[0]<300))continue;
 if(m.bridges.some(b=>Math.hypot(q[0]-b.x,q[1]-b.y)<b.L/2+L/2+250)||qobs(q[0],q[1],L/2+60,[]).some(o=>o.t!='t'&&Math.hypot(o.x-q[0],o.y-q[1])<L/2+o.r+20))continue;
 m.bridges.push({x:q[0],y:q[1],a,c:Math.cos(a),s:Math.sin(a),L,bw:84,sa:1})}
 // rampe: dove una strada cambia quota; cascate: dove un fiume cambia quota
 for(const rd of m.roads){if(rd.pts.length<8)continue;let pl=levelAt(rd.pts[0][0],rd.pts[0][1]);
  for(let i=1;i<rd.pts.length;i++){const q=rd.pts[i],l=levelAt(q[0],q[1]);if(l===pl)continue;const p0=rd.pts[i-1],a=Math.atan2(q[1]-p0[1],q[0]-p0[0]),up=l>pl;
   if(!m.ramps.some(r=>Math.hypot(r.x-q[0],r.y-q[1])<160))m.ramps.push({x:(q[0]+p0[0])/2,y:(q[1]+p0[1])/2,a:up?a:a+Math.PI,w:rd.w,d:Math.abs(l-pl)});pl=l}}
 for(const rv of m.rivers){let pl=levelAt(rv.pts[0][0],rv.pts[0][1]);
  for(let i=1;i<rv.pts.length;i++){const q=rv.pts[i],l=levelAt(q[0],q[1]);if(l===pl)continue;const p0=rv.pts[i-1];
   if(l<pl&&!m.falls.some(f=>Math.hypot(f.x-q[0],f.y-q[1])<200))m.falls.push({x:(q[0]+p0[0])/2,y:(q[1]+p0[1])/2,a:Math.atan2(q[1]-p0[1],q[0]-p0[0]),w:rv.w,d:pl-l});pl=l}}
 // ===== 6. costruzioni dei siti (dopo le strade: gli edifici le evitano), isole, mare =====
 for(const s of m.isles){const big=s.R>=150,n=big?1+(R()*2|0):1;
  for(let k=0;k<n;k++)for(let tr=0;tr<8;tr++){const mx=Math.max(130,s.R*.95),o=k?(k%2?1:-1)*s.R*.5:-s.R*.2,t=s.dir==null?(s.q||0):s.dir+3.1416;
   if(addB(s.x+Math.cos(t)*o,s.y+Math.sin(t)*o,rr(120,mx),rr(120,mx),R()*Math.PI,null,false,true,'house',null,4))break}}
 for(const f of later)f();
// muri casuali sparsi sulla mappa (recinzioni, ruderi, delimitazioni)
for(let i=0,n=Math.round(90*DENS);i<n;i++){
  const x=rr(300,SEA-300),y=rr(300,WH-300);
  if(wetCell(x,y)||onRoad(x,y,40))continue;
  const len=rr(180,420),a=R()*TAU,th=rr(14,22);
  const ax=x-Math.cos(a)*len/2,ay=y-Math.sin(a)*len/2;
  const bx=x+Math.cos(a)*len/2,by=y+Math.sin(a)*len/2;
  wallLine(ax,ay,bx,by,th,null);
  // a volte un secondo muro perpendicolare → forma a L o a C
  if(R()<.45){
   const len2=rr(120,280),a2=a+1.5708*(R()<.5?1:-1);
   wallLine(bx,by,bx+Math.cos(a2)*len2,by+Math.sin(a2)*len2,th,null);
  }
 }
 // container sparsi sulla mappa
for(let i=0,n=Math.round(120*DENS);i<n;i++){
  const x=rr(250,SEA-250),y=rr(250,WH-250);
  if(wetCell(x,y)||onRoad(x,y,50))continue;
  const nx=ri(1,3),ny=ri(1,2),cw=nx*56,ch=ny*24;
  const o=addX(x,y,cw,ch,R()*TAU,'cont',0,{gap:6});
  if(o)o.cc=Array.from({length:nx*ny},()=>ri(0,9));
 }
 // qualche container vicino agli edifici urbani / industriali
 for(const b of m.blds){
  if(b.ty!=='house'||b.sp||R()>.18)continue;
  const a=R()*TAU,d=b.r+rr(40,90);
  const x=b.x+Math.cos(a)*d,y=b.y+Math.sin(a)*d;
  if(wetCell(x,y)||onRoad(x,y,30))continue;
  const nx=ri(1,2),ny=1,cw=nx*56,ch=ny*24;
  const o=addX(x,y,cw,ch,b.a+rr(-.3,.3),'cont',0,{gap:4});
  if(o)o.cc=Array.from({length:nx*ny},()=>ri(0,9));
 } 
 PLAN.sea(K);
 // case sparse nelle campagne e ai margini delle città (il numero scala con la densità del profilo)
for(let i=0,n=Math.round(1600*DENS);i<n;i++){const x=rr(200,SEA-200),y=rr(200,WH-200),t=regAt(x,y).type;
if(t=='rural'||t=='nature'&&R()<.25||(t=='urban'&&R()<.7)||t=='indus'&&R()<.5){if(R()<.3)addCompound(x,y,R()*Math.PI);else addB(x,y,rr(120,260),rr(120,240),R()*Math.PI,null,false,false,'house',null,3)}}
 // edifici lungo fiumi (probabilità scalata dalla densità)
for(const rv of m.rivers){
  for(let i=4;i<rv.pts.length-4;i+=ri(3,7)){
   if(R()>.55*DENS)continue;
   const q=rv.pts[i],q2=rv.pts[Math.min(i+1,rv.pts.length-1)];
   const a=Math.atan2(q2[1]-q[1],q2[0]-q[0])+1.5708;
   const sd=R()<.5?-1:1,dist=rv.w/2+rr(55,120);
   const x=q[0]+Math.cos(a)*dist*sd,y=q[1]+Math.sin(a)*dist*sd;
   if(!wetCell(x,y)&&!inWater(x,y,40))addB(x,y,rr(110,200),rr(100,180),a+rr(-.5,.5),null,false,false,'house',null,3);
  }
 }
 // edifici intorno ai laghi (numero per lago scalato dalla densità)
for(const l of m.lakes){
  const n=Math.round(ri(4,10)*DENS),mr=Math.min(...l.a);
  for(let k=0;k<n;k++){
   const t=R()*TAU,d=mr*rr(1.05,1.35)+rr(30,80);
   const x=l.x+Math.cos(t)*d,y=l.y+Math.sin(t)*d;
   if(!wetCell(x,y)&&!inWater(x,y,40))addB(x,y,rr(110,210),rr(100,190),t+rr(-.6,.6),null,false,false,'house',null,3);
  }
 }
 // edifici lungo strade normali / secondarie (probabilità scalata dalla densità)
for(const rd of m.roads)if(rd.cls==='st'||rd.cls==='al'||rd.cls==='dirt'){
  for(let i=4;i<rd.pts.length-4;i+=ri(3,6)){
   if(R()>.55*DENS)continue;
   const q=rd.pts[i],q2=rd.pts[Math.min(i+1,rd.pts.length-1)];
   const a=Math.atan2(q2[1]-q[1],q2[0]-q[0])+1.5708;
   const sd=R()<.5?-1:1,dist=rd.w/2+rr(70,140);
   addB(q[0]+Math.cos(a)*dist*sd,q[1]+Math.sin(a)*dist*sd,rr(120,220),rr(110,200),a+rr(-.4,.4),null,false,false,'house',null,3);
  }
 }
 // ===== 7. alberi (organici nelle zone naturali, in filari nelle rurali e lungo i viali), rocce =====
 const forest=(cx,cy,RR,dens)=>{const n=Math.round(RR/dens);for(let k=0;k<n;k++){const a=R()*TAU,d=Math.sqrt(R())*RR;tree(cx+Math.cos(a)*d,cy+Math.sin(a)*d,rr(16,48))}};

 // --- definizione di rock e rockSz PRIMA di qualsiasi loro utilizzo ---
 const rock=(x,y,sz,allowWater)=>{
  if(!allowWater&&(!free(x,y,sz*.8)||wetCell(x,y)))return;
  if(allowWater&&!inWater(x,y,0)&&!free(x,y,sz*.8))return;
  const n=ri(5,9),sx=rr(.7,1.3),sy=rr(.7,1.3),pts=[],a0=R()*TAU;
  for(let i=0;i<n;i++){const a=a0+(i+rr(-.3,.3))/n*TAU,d=sz*rr(.55,1);pts.push([Math.cos(a)*d*sx,Math.sin(a)*d*sy])}
  const g=rockGeom(pts),o={t:'b',ty:'rock',shape:'rock',x,y,w:sz*2,h:sz*2,a:0,c:1,s:0,r:g.r,pr:g.pr,an:g.an,hp:1,m:1,ind:1,pal:0};
  for(const b of qobs(x,y,o.r+30,[])){if(b.t=='t'){if(Math.hypot(b.x-x,b.y-y)<o.r+b.r)b.dead=1;continue}if(Math.hypot(b.x-x,b.y-y)<o.r+b.r+10)return}
  const tone=ri(70,150),v=g.pr[0].vs;o.fc=v.map((_,i)=>{const k=tone+((i*37+ri(0,4))%5-2)*9+ri(-6,6);return`rgb(${k},${k+ri(-2,3)},${k+ri(-4,2)})`});o.tone=tone;
  addO(o);return true};
 const rockSz=()=>{const u=R();return u<.55?rr(18,40):u<.85?rr(40,90):rr(100,220)};

 // alberi e rocce intorno ai laghi (ora rock esiste)
 for(const l of m.lakes){
  const nT=ri(8,16),nR=ri(4,9);
  for(let i=0;i<nT;i++){const t=R()*TAU,d=(Math.min(...l.a))*rr(.85,1.25)+rr(20,60);tree(l.x+Math.cos(t)*d,l.y+Math.sin(t)*d,rr(18,40))}
  for(let i=0;i<nR;i++){const t=R()*TAU,d=(Math.min(...l.a))*rr(.9,1.35)+rr(10,50);rock(l.x+Math.cos(t)*d,l.y+Math.sin(t)*d,rockSz())}
 }

 // foreste per zona
 for(const r of rg){
  if(r.type=='nature')for(let i=0;i<12;i++){const a=R()*TAU,d=Math.sqrt(R())*r.rin;forest(r.x+Math.cos(a)*d,r.y+Math.sin(a)*d,rr(130,320),5)}
  else if(r.type=='rural'){for(let i=0;i<6;i++){const a=R()*TAU,d=Math.sqrt(R())*r.rin;forest(r.x+Math.cos(a)*d,r.y+Math.sin(a)*d,rr(100,200),6.5)}
   for(let i=0;i<2;i++){const a=R()*TAU,d=Math.sqrt(R())*r.rin*.8,ox=r.x+Math.cos(a)*d,oy=r.y+Math.sin(a)*d,ang=R()*3.14,c=Math.cos(ang),s=Math.sin(ang),nx=ri(4,8),ny=ri(3,6);
    for(let u=0;u<nx;u++)for(let v=0;v<ny;v++)tree(ox+u*c*70-v*s*70,oy+u*s*70+v*c*70,rr(18,36))}}
  else if(r.type=='urban'||r.type=='indus'){
   for(let i=0;i<6;i++){const a=R()*TAU,d=Math.sqrt(R())*r.rin;forest(r.x+Math.cos(a)*d,r.y+Math.sin(a)*d,rr(80,130),8)}
   for(let i=0;i<ri(12,28);i++){const a=R()*TAU,d=Math.sqrt(R())*r.rin*.9;tree(r.x+Math.cos(a)*d,r.y+Math.sin(a)*d,rr(16,32))}
   for(let i=0;i<ri(6,14);i++){const a=R()*TAU,d=Math.sqrt(R())*r.rin*.9;rock(r.x+Math.cos(a)*d,r.y+Math.sin(a)*d,rockSz())}
  }
 }
 for(let i=0;i<10;i++)forest(rr(200,SEA-300),rr(200,WH-200),rr(90,180),5.5);

 // viali alberati
 for(const rd of m.roads)if(rd.w>=30&&R()<.85)for(let i=2;i<rd.pts.length-2;i+=2){const q=rd.pts[i],q2=rd.pts[i+1],a=Math.atan2(q2[1]-q[1],q2[0]-q[0])+1.5708;
  for(const sd of[-1,1]){const r=rr(16,22),o=rd.w/2+r+6;tree(q[0]+Math.cos(a)*o*sd,q[1]+Math.sin(a)*o*sd,r,1)}}
 for(const rd of m.roads)if(rd.cls=='hw'&&R()<.55)for(let i=2;i<rd.pts.length-2;i+=2){const q=rd.pts[i],q2=rd.pts[i+1],a=Math.atan2(q2[1]-q[1],q2[0]-q[0])+1.5708;
  for(const sd of[-1,1]){const r=rr(18,26);tree(q[0]+Math.cos(a)*(rd.w/2+r+22)*sd,q[1]+Math.sin(a)*(rd.w/2+r+22)*sd,r)}}
 for(const f of m.flat)if(f.k=='field'&&f.hedge){const c=Math.cos(f.a),s=Math.sin(f.a);for(let u=-f.w/2;u<=f.w/2;u+=60)tree(f.x+c*u-s*(f.h/2+16),f.y+s*u+c*(f.h/2+16),rr(16,24))}

 // rocce per zona
 for(const r of rg){const cnt=r.type=='nature'?88:r.type=='rural'?28:r.type=='mil'?16:r.type=='indus'?10:6;
  for(let i=0;i<cnt;i++){const a=R()*TAU,d=Math.sqrt(R())*r.rin,x=r.x+Math.cos(a)*d,y=r.y+Math.sin(a)*d,sz=rockSz();rock(x,y,sz);
   if(sz>60)for(let k=0;k<ri(3,6);k++){const a2=R()*TAU;rock(x+Math.cos(a2)*sz*rr(1.2,2.2),y+Math.sin(a2)*sz*rr(1.2,2.2),rr(18,50))}}}
 for(let i=0,n=0;i<8000&&n<220;i++){const x=rr(150,SEA-150),y=rr(150,WH-150),e=elev(x,y);if(Math.abs(e-.5)<.1||Math.abs(e-1.5)<.1){rock(x,y,rr(18,70));n++}}

 // rocce in acqua (mare e laghi)
 for(let i=0,n=0;i<800&&n<40;i++){const y=rr(200,WH-200),x=coast(y)+rr(40,280);if(rock(x,y,rr(20,70),true))n++}
 for(const l of m.lakes)if(R()<.7){for(let k=0;k<ri(1,3);k++){const t=R()*TAU,d=rr(20,Math.min(...l.a)*.6);rock(l.x+Math.cos(t)*d,l.y+Math.sin(t)*d,rr(18,55),true)}}

 // ===== 8. rifiniture =====
 m.obs=obs.filter(o=>!o.dead);m.obs.forEach((o,i)=>{o.id=i;if(o.m==null)o.m=o.hp});m.blds=blds.filter(o=>!o.dead);
 gClear();m.obs.forEach(gAdd);
 for(let t=0;t<3000&&m.dm.length<24;t++){const x=rr(300,SEA-300),y=rr(300,WH-300);if(clearAt(x,y,34)&&!inWater(x,y,60)&&m.dm.every(p=>Math.hypot(p[0]-x,p[1]-y)>600))m.dm.push([x,y])}
 for(const rd of m.roads)rd.path=null;
 navBuild();
 return m}
