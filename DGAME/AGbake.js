'use strict';
/* AIRGRUNT · AGbake.js — lo SFONDO della mappa: un'unica immagine "appiattita" fatta di blocchi da 512 px del mondo.
   1) preparazione (una volta per mappa): colore del terreno per natura del suolo, texture di rumore, lampioni, auto, scene (piazzamento)
   2) livelli di disegno di un blocco: terreno, quote, dettagli sparsi, superfici piatte (M.flat), acqua, isole, moli, ponti, strade, luci, oggetti
   3) creazione e cache dei blocchi compressi (WebP/JPEG), schermata di caricamento.
   I disegni dei singoli oggetti (veicoli, scene, edifici) sono in AGart.js. Rete: nulla, ogni client rigenera lo stesso sfondo dal seed. */
const DC={URB:null,GM:null,NZ:[],FI:new Map(),OI:new Map(),seed:1,LAMPS:[]};
const urbAt=(x,y)=>{const fx=clamp(x/TC-.5,0,GW-1.001),fy=clamp(y/TC-.5,0,GH-1.001),i=fx|0,j=fy|0,u=fx-i,v=fy-j,U=DC.URB;return(U[j*GW+i]*(1-u)+U[j*GW+i+1]*u)*(1-v)+(U[(j+1)*GW+i]*(1-u)+U[(j+1)*GW+i+1]*u)*v};

// ===== preparazione (una volta per mappa) =====
async function decorPrep(){
 DC.seed=(M.seed*2654435761)>>>0;const N=GW*GH,A=new Float32Array(N);
 const add=(x,y,r,v)=>{const i0=Math.max(0,(x-r)/TC|0),i1=Math.min(GW-1,(x+r)/TC|0),j0=Math.max(0,(y-r)/TC|0),j1=Math.min(GH-1,(y+r)/TC|0);
  for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const d=Math.hypot(i*TC+TC/2-x,j*TC+TC/2-y);if(d<r)A[j*GW+i]+=v*(1-d/r)}};
 const rectAdd=(f,v)=>{const R0=Math.hypot(f.w,f.h)/2,c=Math.cos(f.a||0),s=Math.sin(f.a||0);
  for(let j=Math.max(0,(f.y-R0)/TC|0);j<=Math.min(GH-1,(f.y+R0)/TC|0);j++)for(let i=Math.max(0,(f.x-R0)/TC|0);i<=Math.min(GW-1,(f.x+R0)/TC|0);i++){const dx=i*TC+TC/2-f.x,dy=j*TC+TC/2-f.y,lx=dx*c+dy*s,ly=-dx*s+dy*c;if(Math.abs(lx)<f.w/2+20&&Math.abs(ly)<f.h/2+20)A[j*GW+i]+=v}};
 for(const o of M.obs){if(o.t=='t'||o.ty=='rock')continue;add(o.x,o.y,o.r*2.2+80,o.ty=='wall'?.05:o.ty=='house'?1.1:.8)}
 for(const rd of M.roads){const k=rd.sw?.8:rd.ty?0:.3;if(k)for(let i=0;i<rd.pts.length;i+=2)add(rd.pts[i][0],rd.pts[i][1],rd.w/2+90,k)}
 for(const f of M.flat){if(f.k=='slab'&&f.t!=5)rectAdd(f,1.8);else if(f.k=='lot'||f.k=='park')rectAdd(f,1.5);else if(f.k=='circ'&&f.t==2)add(f.x,f.y,f.r+60,2.4)}
 for(let p=0;p<2;p++){const T2=A.slice();for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){let s=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=i+dx,y=j+dy;if(x<0||y<0||x>=GW||y>=GH)continue;s+=T2[y*GW+x];n++}A[j*GW+i]=s/n}}
 DC.URB=new Float32Array(N);for(let i=0;i<N;i++)DC.URB[i]=clamp(A[i]*.9,0,1);
 await tick();
 // mappa colore del terreno: 1 pixel per cella, ingrandita con interpolazione → transizioni morbide.
 // Il colore nasce dalla NATURA del terreno (M.bio: prato, bosco, roccia, sabbia, cemento, campi) con toni marcati (GROUND_COL in AGconf.js); poi quota e urbanità.
 const BCOL=GROUND_COL.map(hex),CON=hex(GROUND_COL[4]),W1=GW+1;
 const gm=document.createElement('canvas');gm.width=GW;gm.height=GH;const gx=gm.getContext('2d'),im=gx.createImageData(GW,GH);
 for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){let c=[0,0,0],n=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const q=BCOL[M.bio[clamp(j+dy,0,GH-1)*GW+clamp(i+dx,0,GW-1)]],k=dx||dy?1:3;c[0]+=q[0]*k;c[1]+=q[1]*k;c[2]+=q[2]*k;n+=k}
  c=[c[0]/n,c[1]/n,c[2]/n];
  const b=M.bio[j*GW+i],e=(M.E[j*W1+i]+M.E[j*W1+i+1]+M.E[(j+1)*W1+i]+M.E[(j+1)*W1+i+1])/4,u=smooth(.12,.7,DC.URB[j*GW+i]);
  if(M.sub&&typeof natTint==='function')c=natTint(c,M.sub[j*GW+i]);   // biomi (AGnature.js): pinete scure, bosco bruciato, palude, betulle, ghiaioni, dune, prati fioriti
  c=mixc(c,[168,170,128],clamp(e*.13,0,.26));c=mixc(c,CON,u*.9);
  let bv=1;   // macchie più scure a tre scale (640, 160, 80 px): prati, boschi e campi non sono mai piatti; roccia e sabbia hanno venature
  if(b==0||b==1||b==5){const h1=hs(i>>4,j>>4,DC.seed+301),h2=hs(i>>2,j>>2,DC.seed+302),h3=hs(i>>1,j>>1,DC.seed+303);bv=1+(h1<.45?-(1-h1/.45)*.22:0)+(h2<.35?-(1-h2/.35)*.14:0)+(h3<.30?-(1-h3/.30)*.08:0)}
  else if(b==2||b==3)bv=1+(hs(i>>2,j>>2,DC.seed+304)-.5)*.16+(hs(i>>1,j>>1,DC.seed+305)-.5)*.08;
  const k=1+(hs(i,j,7)-.5)*.05,o=(j*GW+i)*4;im.data[o]=c[0]*k*bv;im.data[o+1]=c[1]*k*bv;im.data[o+2]=c[2]*k*bv;im.data[o+3]=255}
 gx.putImageData(im,0,0);DC.GM=gm;
 await tick();
 // texture di rumore ripetibili (valore interpolato con bordi che si chiudono): fine, media, grossa
 DC.NZ=[];for(const[n,oct]of[[64,[1,.5,.25]],[32,[1,.6,.3]],[8,[1,.7,.4]]]){const S2=256,cv=document.createElement('canvas');cv.width=cv.height=S2;const x=cv.getContext('2d'),d=x.createImageData(S2,S2);
  const lat=[];for(let o=0;o<3;o++){const g0=Math.max(2,Math.round(n/(1<<o))),a=new Float32Array(g0*g0);for(let i=0;i<a.length;i++)a[i]=hs(i,o,DC.seed+n);lat.push([g0,a])}
  for(let py=0;py<S2;py++)for(let px=0;px<S2;px++){let v=0,tw=0;for(let o=0;o<3;o++){const[g0,a]=lat[o],fx=px/S2*g0,fy=py/S2*g0,i=fx|0,j=fy|0,u=fx-i,w=fy-j,uu=u*u*(3-2*u),ww=w*w*(3-2*w),i1=(i+1)%g0,j1=(j+1)%g0;
    v+=oct[o]*((a[j*g0+i]*(1-uu)+a[j*g0+i1]*uu)*(1-ww)+(a[j1*g0+i]*(1-uu)+a[j1*g0+i1]*uu)*ww);tw+=oct[o]}
   const k=(v/tw)*255,q=(py*S2+px)*4;d.data[q]=d.data[q+1]=d.data[q+2]=k;d.data[q+3]=255}
  x.putImageData(d,0,0);DC.NZ.push(cv)}
 await tick();
 // pattern verdi scuri per le macchie d'erba (multiply in pGround): due scale, n=5 (~128px) e n=12 (~21px)
 DC.GREEN=[];
 for(const[n,oct,sc,al] of [[5,[1,.6,.3],.4,.5],[12,[1,.5,.25],1.0,.3]]){
  const S2=256,cv=document.createElement('canvas');cv.width=cv.height=S2;const x=cv.getContext('2d');const d=x.createImageData(S2,S2);
  const lat=[];for(let o=0;o<3;o++){const g0=Math.max(2,Math.round(n/(1<<o))),a=new Float32Array(g0*g0);for(let i=0;i<a.length;i++)a[i]=hs(i,o,DC.seed+n*13+777);lat.push([g0,a])}
  for(let py=0;py<S2;py++)for(let px=0;px<S2;px++){let v=0,tw=0;for(let o=0;o<3;o++){const[g0,a]=lat[o],fx=px/S2*g0,fy=py/S2*g0,i=fx|0,j=fy|0,u=fx-i,w=fy-j,uu=u*u*(3-2*u),ww=w*w*(3-2*w),i1=(i+1)%g0,j1=(j+1)%g0;
    v+=oct[o]*((a[j*g0+i]*(1-uu)+a[j*g0+i1]*uu)*(1-ww)+(a[j1*g0+i]*(1-uu)+a[j1*g0+i1]*uu)*ww);tw+=oct[o]}
   const k=v/tw,q=(py*S2+px)*4;
   // k=0 → verde scuro [128,178,102]; k alto → bianco [255,255,255] (multiply = invariato)
   const dark=Math.max(0,1-k*1.6);
   d.data[q]  =Math.round(255*(1-dark*.50));   // R scende fino a 128
   d.data[q+1]=Math.round(255*(1-dark*.30));   // G scende fino a 178 (canale dominante)
   d.data[q+2]=Math.round(255*(1-dark*.60));   // B scende fino a 102 (tono caldo)
   d.data[q+3]=255
  }
  x.putImageData(d,0,0);DC.GREEN.push([cv,sc,al]);
 }
 if(!M.flatGen){M.flatGen=1;await decorGen()}
 await tick();
 // indici spaziali (celle da CH): superfici piatte e oggetti reali
 DC.FI=new Map();DC.OI=new Map();
 const put=(mp,x0,y0,x1,y1,it)=>{for(let cx=Math.max(0,Math.floor(x0/CH));cx<=Math.min(Math.floor(x1/CH),Math.ceil(WW/CH)-1);cx++)for(let cy=Math.max(0,Math.floor(y0/CH));cy<=Math.min(Math.floor(y1/CH),Math.ceil(WH/CH)-1);cy++){const k=cx*64+cy;let a=mp.get(k);if(!a)mp.set(k,a=[]);a.push(it)}};
 const ZZ={slab:0,pslab:0,field:0,park:1,vpark:1,arena:1,circ:1,market:1,lot:2,yard:2,pit:7,drill:1,motorpool:2,range:2,basins:2,transformer:2,stockpile:2,launchpad:2,drydock:7,canal:3,hvline:4,lane:3,fence:4,rail:4,pipe:4,car:5,truck:5,boat:5,lamp:6,pool:7,court:7,wreckage:7,animalPen:7,construction:7,refuelScene:7,repairScene:7,campsite:7,solarArray:7,ventBunker:7,pad:7,tractor:7,smallShip:7,hoverbike:7,veh:7,scn:7};   // 7 = non passa da pFlat (disegnati da pProps/pPads/pCars, DOPO l'acqua): pool e court sopra l'acqua
 for(const f of M.flat){f.z=ZZ[f.k]!=null?ZZ[f.k]:typeof NAT_Z!=='undefined'&&NAT_Z[f.k]!=null?NAT_Z[f.k]:0;let r;if(f.pts){let a=1e9,b=1e9,c=-1e9,d=-1e9;for(const p of f.pts){a=Math.min(a,p[0]);b=Math.min(b,p[1]);c=Math.max(c,p[0]);d=Math.max(d,p[1])}put(DC.FI,a-30,b-30,c+30,d+30,f);continue}
  r=f.r?f.r+30:(Math.hypot(f.w||f.len||40,f.h||f.wid||40)/2+40);put(DC.FI,f.x-r,f.y-r,f.x+r,f.y+r,f)}
 for(const o of M.obs)put(DC.OI,o.x-o.r-30,o.y-o.r-30,o.x+o.r+30,o.y+o.r+30,o)}
// elementi generati: auto parcheggiate lungo i viali, lampioni
async function decorGen(){const f=M.flat,jn=new Map(),jk=(x,y)=>(x/200|0)*1024+(y/200|0);let seq=0;
 for(const j of M.junc){const k=jk(j.x,j.y);if(!jn.has(k))jn.set(k,[]);jn.get(k).push(j)}
 const nearJ=(x,y,r)=>{for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const a=jn.get(((x/200|0)+i)*1024+(y/200|0)+j);if(a)for(const q of a)if(Math.hypot(q.x-x,q.y-y)<r)return true}return false};
 DC.LAMPS=[];
 for(const rd of M.roads){let acc=0,side=1;
  for(let i=1;i<rd.pts.length;i++){const p=rd.pts[i-1],q=rd.pts[i],L=Math.hypot(q[0]-p[0],q[1]-p[1]),a=Math.atan2(q[1]-p[1],q[0]-p[0]),nx=-Math.sin(a),ny=Math.cos(a);acc+=L;
   if(acc>=150){acc=0;side=-side;if(!nearJ(q[0],q[1],110)){const o=rd.w/2+(rd.sw?10:6);f.push({k:'lamp',x:q[0]+nx*o*side,y:q[1]+ny*o*side,c:(seq++)%3})}}
   const dens=rd.cls==='hw'?.55:rd.w>=40?.42:.28;
   if(hs(i,seq++,DC.seed)<dens&&!nearJ(q[0],q[1],rd.w+40)){const sd=hs(i,seq,DC.seed+1)<.5?-1:1,o=rd.w/2-8,isTruck=hs(i,seq,DC.seed+4)<.28;
    f.push({k:isTruck?'truck':'car',x:q[0]+nx*o*sd,y:q[1]+ny*o*sd,a:a+(sd>0?0:Math.PI),col:CAR_COL[hs(i,seq,DC.seed+2)*CAR_COL.length|0],len:isTruck?38:24,wid:isTruck?14:11})}}}
 
 await tick();                                              // ← PAUSA prima della parte più pesante
 await decorScenes();   // nuovo sistema di scene (AGprops.js) — ora async
 await tick(); 
 

 for(const b of M.bridges){const n=Math.max(2,Math.round(b.L/70));for(let i=0;i<=n;i++)for(const sd of[-1,1]){const u=-b.L/2+6+(b.L-12)*i/n;f.push({k:'lamp',x:b.x+b.c*u-b.s*(b.bw/2-5)*sd,y:b.y+b.s*u+b.c*(b.bw/2-5)*sd,c:(i+(sd>0?1:0))%3})}}
 for(const p of M.piers){for(let u=-p.L/2+30;u<p.L/2-10;u+=80)for(const sd of[-1,1])f.push({k:'lamp',x:p.x+p.c*u-p.s*sd*(p.W/2-7),y:p.y+p.s*u+p.c*sd*(p.W/2-7),c:2})}
 for(const q of f.slice())if(q.k=='arena'){const c=Math.cos(q.a),s=Math.sin(q.a);for(const p of seEven(q.A+q.P-8,q.B+q.P-8,q.n,90))f.push({k:'lamp',x:q.x+p[0]*c-p[1]*s,y:q.y+p[0]*s+p[1]*c,c:2})}   // lampioni sul bordo del piazzale dell'arena
 for(const q of f.slice())if(q.k=='circ'&&q.t==2){const n=Math.max(4,Math.round(q.r/30));for(let i=0;i<n;i++){const t=i/n*TAU;f.push({k:'lamp',x:q.x+Math.cos(t)*(q.r-6),y:q.y+Math.sin(t)*(q.r-6),c:i%3})}}
 // 1–3 lucine sul bordo di ogni edificio
 for(const o of M.obs){
  if(o.t!='b'||o.ty=='wall'||o.ty=='rock'||o.r<28)continue;
  const n=1+((hs(o.id|0,21,DC.seed)*3)|0);       // 1, 2 o 3
  for(let i=0;i<n;i++){
   const ang=(i/n)*TAU+hs(o.id|0,22+i,DC.seed)*.6; // sparse sul perimetro
   const rad=o.r*(.82+hs(o.id|0,30+i,DC.seed)*.14);
   f.push({k:'lamp',x:o.x+Math.cos(ang)*rad,y:o.y+Math.sin(ang)*rad,c:(o.id+i)%3});
  }
 }
 // max densità locale: al più MAX_L lampioni entro raggio R_L (solo negli agglomerati/incroci)
const MAX_L=8,R_L=120,cell=R_L,grid=new Map(),gk=(x,y)=>(x/cell|0)*65536+(y/cell|0),kept=[],keepSet=new Set();
for(const q of f){if(q.k!='lamp')continue;let n=0;const ix=q.x/cell|0,iy=q.y/cell|0;
 for(let di=-1;di<=1;di++)for(let dj=-1;dj<=1;dj++){const a=grid.get((ix+di)*65536+(iy+dj));if(a)for(const p of a)if(Math.hypot(p.x-q.x,p.y-q.y)<R_L)n++}
 if(n>=MAX_L)continue;
 kept.push(q);keepSet.add(q);const k=gk(q.x,q.y);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(q)}
for(let i=f.length-1;i>=0;i--)if(f[i].k==='lamp'&&!keepSet.has(f[i]))f.splice(i,1);
DC.LAMPS=kept}

// ===== piazzamento: usa un generatore proprio (la mappa non cambia), evita strade, acqua, edifici e altre scene =====
const DECO_K=new Set(['motorpool','range','drill','basins','transformer','stockpile','launchpad','drydock','arena']);   // decorazioni proprie dei tipi di sito (AGmap.js: FILL)
const SCR={supply:50,repair:64,fieldCamp:56,sam:50,fuelDepot:52,cargoWork:42,scrap:46,wallWork:40,farmyard:62,greenhouse:46,logging:56,wreckShip:72,campsite:30,roadwork:44,crash:34,busStop:36,checkpoint:36,picnic:14,tankPark:0};
async function decorScenes(){
 const f=M.flat,R=rng((DC.seed^0x2545F491)>>>0),rr=(a,b)=>a+R()*(b-a),ri=(a,b)=>a+(R()*(b-a+1)|0),pick=a=>a[R()*a.length|0],placed=[],PQ=(p,u,v)=>[p.x+p.c*u-p.s*v,p.y+p.s*u+p.c*v];   // PQ: punto in coordinate del molo (u lungo il molo, v di traverso)
 // spazio libero per un oggetto di raggio r. o.road: ammesso sulla strada · o.water: deve stare tutto in acqua · o.shore: niente controllo acqua · o.om: fattore del margine dagli edifici
 const free=(x,y,r,o)=>{o=o||{};
  if(x<r+40||y<r+40||x>WW-r-40||y>WH-r-40)return false;
  for(const q of placed)if(Math.hypot(q.x-x,q.y-y)<q.r+r)return false;
  if(!o.road&&circOnRoad(x,y,r,4))return false;
  if(o.water){if(!inWater(x,y,0))return false;for(let i=0;i<8;i++)if(!inWater(x+Math.cos(i*.785)*r*.8,y+Math.sin(i*.785)*r*.8,0))return false}
  else if(!o.shore&&(nearWater(x,y)||wetCell(x,y))){if(inWater(x,y,r*.7))return false;for(let i=0;i<8;i++)if(inWater(x+Math.cos(i*.785)*r,y+Math.sin(i*.785)*r,2))return false}
  const om=o.om==null?.85:o.om;
  for(const q of qobs(x,y,r+60,[])){if(q.t=='t'){if(Math.hypot(q.x-x,q.y-y)<q.r+r*om*.9)return false}else{const l=toLocal(q,x,y);if(bsd(q,l[0],l[1])<r*om)return false}}
  return true};
 const add=(it,r)=>{it.r=r;if(it.s==null)it.s=ri(0,1e6);f.push(it);placed.push({x:it.x,y:it.y,r});return it};
 const rectSpot=(S,r)=>{const c=Math.cos(S.a),s=Math.sin(S.a),hw=S.w/2-r-30,hh=S.h/2-r-30;if(hw<10||hh<10)return null;
  for(let i=0;i<40;i++){const u=rr(-hw,hw),v=rr(-hh,hh),x=S.x+u*c-v*s,y=S.y+u*s+v*c;if(free(x,y,r))return[x,y]}return null};
 const roundSpot=(cx,cy,sp,r,o)=>{for(let i=0;i<40;i++){const t=R()*TAU,d=Math.sqrt(R())*sp,x=cx+Math.cos(t)*d,y=cy+Math.sin(t)*d;if(free(x,y,r,o))return[x,y]}return null};
 const scene=(S,t,n,ex)=>{for(let i=0;i<n;i++){const e=typeof ex==='function'?ex():ex||{},r=t==='tankPark'?34+13*e.n:SCR[t],p=S.w?rectSpot(S,r):roundSpot(S.x,S.y,S.r*.7,r);if(p)add({k:'scn',t,x:p[0],y:p[1],a:(S.a||0)+pick([0,Math.PI/2,Math.PI,-Math.PI/2]),...e},r)}};
 const veh1=(x,y,v,a,col,r,ex)=>add({k:'veh',v,x,y,a,col,...(ex||{})},r);
 // 1) piazzole H: la navicella ci sta sopra (80%) e vicino ci sono camion di rifornimento, casse, fusti. L'estrazione resta libera.
 for(const q of f)if(DECO_K.has(q.k)&&q.x!=null)placed.push({x:q.x,y:q.y,r:q.r||Math.hypot(q.w,q.h)/2*.8});   // decorazioni dei siti (parcheggi mezzi, poligoni, vasche...): le scene non ci vanno sopra
 const pads=f.filter(q=>q.k==='pad'),old=f.filter(q=>q.k==='refuelScene'||q.k==='smallShip'||q.k==='repairScene');
 for(const p of pads)placed.push({x:p.x,y:p.y,r:p.r+6});
 for(let i=old.length-1;i>=0;i--){const q=old[i];   // scena di riparazione della base: se cade su un edificio si sposta nel punto libero più vicino (o sparisce)
  if(q.k==='repairScene'&&!free(q.x,q.y,66,{base:1,om:.8})){const p=roundSpot(q.x,q.y,230,66,{base:1,om:.8});if(p){q.x=p[0];q.y=p[1]}else{f.splice(f.indexOf(q),1);old.splice(i,1)}}}
 for(const q of old){const r=q.k==='refuelScene'?84:q.k==='repairScene'?70:40;q.r=r;placed.push({x:q.x,y:q.y,r})}
 for(const p of pads){if(Math.hypot(p.x-EXT[0],p.y-EXT[1])<90)continue;
  let bl=0;for(const o of qobs(p.x,p.y,p.r+40,[]))if((o.t==='t'||o.ty==='rock')&&Math.hypot(o.x-p.x,o.y-p.y)<p.r+o.r+8)bl=1;
  if(bl){for(let i=f.length-1;i>=0;i--){const q=f[i];if(q===p||((q.k==='refuelScene'||q.k==='smallShip')&&Math.hypot(q.x-p.x,q.y-p.y)<14))f.splice(i,1)}continue}   // piazzola coperta da un albero o una roccia: pPads non la disegna, quindi niente navicella sospesa nel vuoto
  if(old.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<14))continue;
  if(R()<.8){f.push({k:'veh',v:pick(['drop','drop','shuttle','fighter','gunship','lander']),x:p.x,y:p.y,a:R()*TAU,col:pick(GRY_COL),r:p.r+6,s:ri(0,1e6)});
   if(R()<.85){for(let t=0;t<30;t++){const th=R()*TAU,d=p.r+rr(40,60),x=p.x+Math.cos(th)*d,y=p.y+Math.sin(th)*d;if(free(x,y,48)){add({k:'scn',t:'supply',x,y,a:th+pick([0,Math.PI/2]),s:ri(0,1e6)},48);break}}}}}
 await tick();
 // 2) siti
 for(const S of M.sites){
  if(S.k==='c'){scene(S,'tankPark',ri(1,2),()=>({n:ri(2,4),des:0}));scene(S,'repair',1);scene(S,'supply',ri(1,2));if(R()<.5)scene(S,'fieldCamp',1);if(R()<.4)scene(S,'sam',1)}
  else if(S.k==='y'){scene(S,'repair',2,{big:1});scene(S,'supply',ri(1,2));scene(S,'cargoWork',1);if(R()<.5)scene(S,'scrap',1)}
  else if(S.k==='n'){scene(S,'sam',2);scene(S,'supply',1);if(R()<.5)scene(S,'tankPark',1,()=>({n:ri(2,3)}))}
  else if(S.k==='a'){   // aeroporto: navicelle parcheggiate sul piazzale (si cercano i posti liberi tra le rocce), trattore di rimorchio e cisterna
   const n=ri(2,4),c=Math.cos(S.a),s=Math.sin(S.a),dir=R()<.5?1:-1,kinds=['drop','shuttle','fighter','gunship','lander'],ap=(u,v)=>[S.x+u*c-v*s,S.y+u*s+v*c],slots=[];
   for(let u=-S.w*.36;u<=S.w*.36;u+=76)for(const dv of[0,38,-38])slots.push([u,S.h*.22+dv]);
   for(let i=slots.length-1;i>0;i--){const j=R()*(i+1)|0,t=slots[i];slots[i]=slots[j];slots[j]=t}
   for(let i=0,np=0;i<slots.length&&np<n;i++){const p=ap(slots[i][0],slots[i][1]);if(free(p[0],p[1],36)){veh1(p[0],p[1],pick(kinds),S.a+dir*Math.PI/2,pick(GRY_COL),36);np++}}
   const a0=ap(0,S.h*.22);{const p=roundSpot(a0[0],a0[1],170,14);if(p)veh1(p[0],p[1],'tug',R()*TAU,'#e67e22',14)}
   {const p=roundSpot(a0[0],a0[1],170,22);if(p)veh1(p[0],p[1],'tanker',S.a,'#c0392b',22)}
   scene(S,'supply',ri(1,2));if(R()<.6)scene(S,'repair',1);if(R()<.5)scene(S,'sam',1)}
  else if(S.k==='i'){scene(S,'fuelDepot',1);scene(S,'cargoWork',ri(1,2));if(R()<.5)scene(S,'scrap',1);if(R()<.5)scene(S,'supply',1)}
  else if(S.k==='k'){scene(S,'supply',1);scene(S,'cargoWork',1);if(R()<.5)scene(S,'sam',1)}
  // posti di blocco ai varchi dei recinti
  if('cynak'.includes(S.k)||(S.k==='i'&&R()<.6)){for(const e of S.ends||[]){const dx=e[0]-S.x,dy=e[1]-S.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
    for(const off of[10,34,-14]){const x=e[0]+ux*off,y=e[1]+uy*off;if(free(x,y,36,{road:true,om:.6})){add({k:'scn',t:'checkpoint',x,y,a:Math.atan2(uy,ux),s:ri(0,1e6),rhino:R()<.3?1:0,open:R()<.5?1:0},36);break}}}}
  // fattoria: aia con balle di fieno, trattore, animali da cortile; serre
  if(S.k==='f'){const n=ri(1,2);for(let i=0;i<n;i++){const p=roundSpot(S.x,S.y,250,62);if(p)add({k:'scn',t:'farmyard',x:p[0],y:p[1],a:R()*TAU},62)}
   if(R()<.5){const p=roundSpot(S.x,S.y,300,46);if(p)add({k:'scn',t:'greenhouse',x:p[0],y:p[1],a:pick([0,Math.PI/2])+rr(-.3,.3),n:ri(2,4)},46)}}
  // villa: lettini e ombrellone intorno alla piscina, auto davanti al garage
  if(S.k==='v'){for(const q of f.slice()){if(q.k==='pool'&&Math.hypot(q.x-S.x,q.y-S.y)<S.r){const c=Math.cos(q.a||0),s=Math.sin(q.a||0),P=(u,v)=>[q.x+u*c-v*s,q.y+u*s+v*c];
     for(const[u,v]of[[-q.w*.28,q.h/2+13],[0,q.h/2+13],[q.w*.28,-q.h/2-13]]){const p=P(u,v);if(free(p[0],p[1],8,{om:.5,road:true}))veh1(p[0],p[1],'sunbed',(q.a||0)+(v>0?0:Math.PI)+Math.PI/2,pick(['#f4f1e8','#ecf0f1','#f8c471']),9)}
     const p=P(q.w/2+16,0);if(free(p[0],p[1],10,{om:.5}))veh1(p[0],p[1],'parasol',0,pick(['#e74c3c','#f1c40f','#2e86c1']),10)}
    if(q.k==='slab'&&q.t===5&&Math.hypot(q.x-S.x,q.y-S.y)<S.r){const c=Math.cos(q.a||0),s=Math.sin(q.a||0),P=(u,v)=>[q.x+u*c-v*s,q.y+u*s+v*c];
     for(const[u,v]of[[-q.w*.32,q.h*.1],[-q.w*.18,q.h*.12]]){const p=P(u,v);if(R()<.6&&free(p[0],p[1],14,{om:.6}))add({k:'car',x:p[0],y:p[1],a:(q.a||0)+Math.PI/2*pick([1,-1]),col:pick(CAR_COL),len:24,wid:11},14)}}}}
  // porto: lavori in banchina e barche ormeggiate lungo i moli
  if(S.k==='p'){for(const p of S.piers||[]){
    if(R()<.7){const q=PQ(p,rr(-p.L/2+120,p.L/2-60),rr(-p.W*.1,p.W*.1));if(free(q[0],q[1],40,{om:.7,shore:1,road:true}))add({k:'scn',t:'cargoWork',x:q[0],y:q[1],a:p.a,s:ri(0,1e6)},42)}
    for(let i=0,n=ri(1,3);i<n;i++){const q=PQ(p,rr(-p.L/2+100,p.L/2-30),rr(-p.W/2+22,p.W/2-22)),k=pick(['hauler','forklift','crates','forklift','pallet']);if(free(q[0],q[1],16,{om:.7,shore:1,road:true}))veh1(q[0],q[1],k,p.a+(R()<.5?0:Math.PI),pick(IND_COL),k=='hauler'?24:12,{o:{cc:pick(CONT_COL)}})}
    for(const sd of[-1,1])if(R()<.6){const sty=pick([0,1,2,5,9,3]),b=BOAT_BASE[sty],len=Math.round(b[0]*rr(.9,1.6)),wid=Math.max(6,Math.round(len*b[1])),q=PQ(p,rr(-p.L/2+50,p.L/2-40),sd*(p.W/2+wid/2+7));
     if(free(q[0],q[1],len/2,{water:1}))add({k:'boat',x:q[0],y:q[1],a:p.a+rr(-.06,.06)+(R()<.5?0:Math.PI),col:pick(CAR_COL),len,wid,sty},len/2)}}}
 }
 await tick();
 // 3) acqua: barche di ogni tipo e dimensione (fiumi, laghi, mare) e pontili sui laghi
 const boat=(x,y,a,sty,len0,col,mw)=>{const b=BOAT_BASE[sty];let len=len0,wid=Math.max(5,len*b[1]);if(mw&&wid>mw){const k=mw/wid;len*=k;wid*=k}if(len<9)return null;len=Math.round(len);wid=Math.round(wid);
  const c=Math.cos(a),s=Math.sin(a),ok=free(x,y,len/2*.9,{water:1})&&[[1,0],[-1,0]].every(q=>inWater(x+q[0]*c*len*.5,y+q[0]*s*len*.5,0))&&[[1],[-1]].every(q=>inWater(x-s*q[0]*wid*.6,y+c*q[0]*wid*.6,0));
  return ok?add({k:'boat',x,y,a,col:col||pick(CAR_COL),len,wid,sty},len/2):null};
 for(const rv of M.rivers){const P=rv.pts;let i=ri(3,6);while(i<P.length-3){const p=P[i],q=P[i+1],a=Math.atan2(q[1]-p[1],q[0]-p[0]),nx=-Math.sin(a),ny=Math.cos(a),wi=rv.wp?rv.wp[i]:rv.w,off=(wi/2)*rr(-.35,.35),sty=pick([0,0,1,2,3,8,9]);   // wi: larghezza del fiume in quel punto
   if(R()<.7)boat(p[0]+nx*off,p[1]+ny*off,a+(R()<.5?0:Math.PI),sty,BOAT_BASE[sty][0]*rr(.8,2),null,wi*.34);i+=ri(7,13)}}
 for(const l of M.lakes){const mr=Math.min(...l.a);if(mr<110)continue;for(let k=0,nb=ri(2,5);k<nb;k++){const t=R()*TAU,d=Math.sqrt(R())*mr*.6,sty=pick([0,1,2,3,3,8,9,7]);boat(l.x+Math.cos(t)*d,l.y+Math.sin(t)*d,R()*TAU,sty,BOAT_BASE[sty][0]*rr(.8,2.1),null,mr*.2)}
  if(mr>=140&&R()<.6){const t=R()*TAU,r0=rad(l,l.x+Math.cos(t)*100,l.y+Math.sin(t)*100),x=l.x+Math.cos(t)*(r0-8),y=l.y+Math.sin(t)*(r0-8);   // pontile di legno + barca ormeggiata
   if(free(x,y,34,{shore:1,om:.5})){add({k:'scn',t:'jetty',x,y,a:t+Math.PI},34);const sty=pick([0,2,8,1]),b=BOAT_BASE[sty],len=Math.round(b[0]*rr(.9,1.3)),c=Math.cos(t+Math.PI),s=Math.sin(t+Math.PI),lat=len*b[1]/2+9;boat(x+c*6-s*lat,y+s*6+c*lat,t+Math.PI,sty,len,null)}}}
 for(let gi=0,ng=Math.round(18*Math.max(.35,M.dec));gi<ng;gi++){const cv=rr(300,WH-300),[x,y]=fromUV(coastV(cv)+rr(110,560),cv),grp=pick([[1,1,9,2],[3,0,7],[4,5,4],[6,6],[1,1,1,2,8],[0,2,0]]),a0=R()*TAU;
  for(let i=0;i<Math.min(grp.length,ri(1,4));i++){const sty=grp[i],big=sty==7||sty==6||sty==4?rr(1,1.5):rr(.9,2.1);boat(x+rr(-110,110),y+rr(-110,110),a0+rr(-.5,.5),sty,BOAT_BASE[sty][0]*big,null)}}
 await tick();
 // 4) città: lavori stradali, incidenti, fermate dell'autobus, mercati, panchine nei parchi, cantieri murari
 const U=M.sites.filter(s=>'grl'.includes(s.k));
 if(U.length){const near=(x,y)=>U.some(s=>Math.hypot(x-s.x,y-s.y)<s.r+80),cands=[];
  for(const rd of M.roads){if(rd.ty==1||rd.cls==='hw'||rd.cls==='al')continue;for(let i=4;i<rd.pts.length-4;i+=3)if(near(rd.pts[i][0],rd.pts[i][1]))cands.push([rd,i])}
  for(let i=cands.length-1;i>0;i--){const j=R()*(i+1)|0,t=cands[i];cands[i]=cands[j];cands[j]=t}
  const nearJ=(x,y,r)=>{for(const j of M.junc)if(Math.hypot(j.x-x,j.y-y)<r)return true;return false};
  let nRw=ri(2,3)+U.length,nCr=ri(1,3),nBs=U.length*2+ri(0,2);
  for(const[rd,i]of cands){if(!nRw&&!nCr&&!nBs)break;const p=rd.pts[i],q=rd.pts[i+1],a=Math.atan2(q[1]-p[1],q[0]-p[0]);if(nearJ(p[0],p[1],95))continue;
   const nx=-Math.sin(a),ny=Math.cos(a),w=rd.w;
   if(nRw&&R()<.45&&free(p[0],p[1],44,{road:1,om:.4})){add({k:'scn',t:'roadwork',x:p[0],y:p[1],a,s:ri(0,1e6)},44);nRw--}
   else if(nBs&&w>=26&&R()<.5){const x=p[0]+nx*(w/2-8),y=p[1]+ny*(w/2-8);if(free(x,y,36,{road:1,om:.4})){add({k:'scn',t:'busStop',x,y,a,s:ri(0,1e6)},36);nBs--}}
   else if(nCr&&free(p[0],p[1],34,{road:1,om:.4})){add({k:'scn',t:'crash',x:p[0],y:p[1],a,s:ri(0,1e6)},34);nCr--}}
  for(const S of U)scene(S,'wallWork',ri(1,2),()=>({a:0}))}
 for(const q of f.slice()){
  if(q.k==='circ'&&q.t===2&&!q.pool)f.push({k:'market',x:q.x,y:q.y,a:R()*TAU,s:ri(0,1e6),r:q.r});
  else if(q.k==='park'&&R()<.6){const c=Math.cos(q.a||0),s=Math.sin(q.a||0),u=rr(-.3,.3)*q.w,v=rr(-.3,.3)*q.h,x=q.x+u*c-v*s,y=q.y+u*s+v*c;if(free(x,y,16,{om:.6,road:1}))add({k:'scn',t:'picnic',x,y,a:R()*TAU,s:ri(0,1e6)},16)}
  // campi: mandrie al pascolo, balle di fieno nei campi mietuti, un secondo trattore al lavoro
  else if(q.k==='field'){const h=R(),w=q.w*.8,hh=q.h*.8;
   if((q.v===1||q.v===3)&&h<.4)f.push({k:'scn',t:'pasture',x:q.x,y:q.y,a:q.a,w,h:hh,n:Math.max(4,Math.min(11,Math.round(w*hh/2600))),kind:pick(['cow','sheep','sheep','horse','cow']),s:ri(0,1e6),r:Math.hypot(w,hh)/2+10});
   else if(q.v===0&&h<.5)f.push({k:'scn',t:'pasture',x:q.x,y:q.y,a:q.a,w,h:hh,n:ri(5,9),bales:1,s:ri(0,1e6),r:Math.hypot(w,hh)/2+10});
   else if(h<.18&&!f.some(z=>z.k==='tractor'&&Math.hypot(z.x-q.x,z.y-q.y)<8))f.push({k:'tractor',x:q.x,y:q.y,a:0,fa:q.a,fw:q.w,fh:q.h,col:pick(['#27ae60','#c0392b','#2980b9','#e67e22'])})}}
 await tick();
 // 5) campo aperto: relitti di navicelle, bivacchi, taglialegna, pannelli solari, depositi, accampamenti
 for(let i=0,n=0;i<110&&n<Math.round(30*M.dec);i++){const[x,y]=landXY(R,350,400,350);if(wetCell(x,y))continue;const t=rtype(x,y),a=R()*TAU;let ok=null;
  if(t==='nature'){const h=R();ok=h<.3?['wreckShip',72]:h<.6?['campsite',30]:['logging',56]}
  else if(t==='rural'){const h=R();ok=h<.4?['solar',48]:h<.7?['greenhouse',46,{n:ri(2,3)}]:['farmyard',62]}
  else if(t==='indus'){const h=R();ok=h<.4?['scrap',46]:h<.75?['cargoWork',42]:['fuelDepot',52]}
  else if(t==='mil'){const h=R();ok=h<.4?['tankPark',34+13*3,{n:3}]:h<.7?['fieldCamp',56]:['sam',50]}
  else if(t==='urban'&&R()<.5)ok=['wallWork',40];
  if(!ok||!free(x,y,ok[1],{om:.7}))continue;n++;
  if(ok[0]==='solar')add({k:'solarArray',x,y,w:85,h:50,a},48);else add({k:'scn',t:ok[0],x,y,a,s:ri(0,1e6),...(ok[2]||{})},ok[1])}
 // vecchi oggetti: raggio d'ingombro per l'indice dei blocchi di sfondo (così non vengono tagliati)
 const PR={tractor:60,animalPen:70,construction:0,solarArray:56,ventBunker:30};for(const q of f)if(q.r==null&&PR[q.k])q.r=PR[q.k];
}

// ===== livelli di disegno di un blocco (g ha già la trasformazione mondo→blocco) =====
function ovl(g,pi,sc,al,mode,x0,y0){g.save();g.globalAlpha=al;g.globalCompositeOperation=mode;g.scale(sc,sc);g.fillStyle=DC.pat[pi];g.fillRect(x0/sc,y0/sc,CH/sc+2,CH/sc+2);g.restore()}
function pGround(g,x0,y0,tint){const i0=Math.max(0,Math.floor(x0/TC)-1),j0=Math.max(0,Math.floor(y0/TC)-1),i1=Math.min(GW-1,Math.ceil((x0+CH)/TC)+1),j1=Math.min(GH-1,Math.ceil((y0+CH)/TC)+1);
 g.imageSmoothingEnabled=true;g.drawImage(DC.GM,i0,j0,i1-i0+1,j1-j0+1,i0*TC,j0*TC,(i1-i0+1)*TC,(j1-j0+1)*TC);
 ovl(g,2,6,.2,'overlay',x0,y0);ovl(g,1,1.5,.1,'overlay',x0,y0);ovl(g,0,.7,.12,'overlay',x0,y0);
 // macchie verdi scure: due scale (128px e 21px) moltiplicate sul colore base
 if(DC.patGreen)for(let i=0;i<DC.GREEN.length;i++){
  const sc=DC.GREEN[i][1],al=DC.GREEN[i][2];
  g.save();g.globalCompositeOperation='multiply';g.globalAlpha=al;g.scale(sc,sc);
  g.fillStyle=DC.patGreen[i];g.fillRect(x0/sc,y0/sc,CH/sc+2,CH/sc+2);g.restore();
 }
 if(WX.rain){g.fillStyle='rgba(15,30,40,.08)';g.fillRect(x0,y0,CH+2,CH+2)}   // velo bagnato: erba, terra e sfondi si scuriscono leggermente
 else if(WX.snow){g.fillStyle='rgba(235,242,250,.16)';g.fillRect(x0,y0,CH+2,CH+2)}   // neve: velo bianco freddo sul terreno
 else if(WX.sand){g.fillStyle='rgba(200,164,96,.14)';g.fillRect(x0,y0,CH+2,CH+2)}    // tempesta di sabbia: velo giallo-sabbia caldo
 if(tint){g.fillStyle=tint;g.fillRect(x0,y0,CH+2,CH+2)}}
function pLevels(g,x0,y0){const x1=x0+CH,y1=y0+CH,NB=5;
 for(let t=1;t<=2;t++){const p=levelPath(t-.5,x0-TC,y0-TC,x1+TC,y1+TC),FM=3;
  // tratti della linea di quota raggruppati per spessore (NB gruppi da 1 a 3 volte): ogni gruppo è un solo percorso
  const BP=Array.from({length:NB},()=>new Path2D()),bf=k=>1+(FM-1)*k/(NB-1);
  for(const sg of levelSegs(t-.5,x0-170,y0-170,x1+170,y1+170)){const f=lvlF((sg[0]+sg[2])/2,(sg[1]+sg[3])/2),k=clamp(Math.round((f-1)/(FM-1)*(NB-1)),0,NB-1);BP[k].moveTo(sg[0],sg[1]);BP[k].lineTo(sg[2],sg[3])}
  // Scarpata a spessore costante in tutte le direzioni (stroke invece di translate)
  // con SFUMATURA CONTINUA: molti strati concentrici con colori interpolati tra i valori originali
  const stops=t==2
    ? [{w:104,c:[0,0,0,.28]},{w:80,c:[0x2a,0x24,0x1c,1]},{w:56,c:[0x3f,0x36,0x2a,1]},{w:32,c:[0x5a,0x4e,0x3a,1]},{w:16,c:[0x6e,0x5e,0x46,1]}]
    : [{w:104,c:[0,0,0,.28]},{w:80,c:[0x35,0x2e,0x24,1]},{w:56,c:[0x4a,0x40,0x32,1]},{w:32,c:[0x66,0x56,0x42,1]},{w:16,c:[0x7a,0x6a,0x50,1]}];
  const NS=24;
  g.lineJoin='round';g.lineCap='round';
  for(let i=0;i<NS;i++){
   const u=i/(NS-1);
   const lw=104+(16-104)*u;                       // da 104 (esterno) a 16 (interno)
   let a=0; while(a<stops.length-2 && lw < stops[a+1].w) a++;
   const s0=stops[a], s1=stops[a+1]||s0;
   const tt=clamp((s0.w-lw)/((s0.w-s1.w)||1),0,1);
   const cr=Math.round(s0.c[0]+(s1.c[0]-s0.c[0])*tt);
   const cg=Math.round(s0.c[1]+(s1.c[1]-s0.c[1])*tt);
   const cb=Math.round(s0.c[2]+(s1.c[2]-s0.c[2])*tt);
   const ca=s0.c[3]+(s1.c[3]-s0.c[3])*tt;
   g.strokeStyle=`rgba(${cr},${cg},${cb},${ca.toFixed(3)})`;
   for(let k=0;k<NB;k++){g.lineWidth=lw*bf(k);g.stroke(BP[k])}   // scarpata di spessore variabile (da 1 a 3 volte) lungo la linea
  }
  // leggero highlight sul bordo alto
  g.strokeStyle='rgba(255,250,220,.35)';g.lineWidth=5;g.stroke(p);
  g.save();g.clip(p);pGround(g,x0,y0,t==2?'rgba(255,250,200,.09)':'rgba(255,250,215,.045)');g.restore()}}
function pHills(g,x0,y0){for(const h of M.hills)if(h.x+h.r>x0&&h.x-h.r<x0+CH&&h.y+h.r>y0&&h.y-h.r<y0+CH){
  // SFUMATURA CONTINUA: molti blob concentrici con colori interpolati tra i valori originali
  const stops=[[1,[110,96,60,.35]],[.82,[150,135,90,.35]],[.6,[176,160,110,.4]],[.38,[196,180,128,.45]],[.18,[214,198,148,.5]]];
  const NS=22;
  for(let i=0;i<NS;i++){
   const u=i/(NS-1);
   const k=1+(0.18-1)*u;                           // da 1 (esterno) a 0.18 (interno)
   let a=0; while(a<stops.length-2 && k < stops[a+1][0]) a++;
   const s0=stops[a], s1=stops[a+1]||s0;
   const tt=clamp((s0[0]-k)/((s0[0]-s1[0])||1),0,1);
   const cr=Math.round(s0[1][0]+(s1[1][0]-s0[1][0])*tt);
   const cg=Math.round(s0[1][1]+(s1[1][1]-s0[1][1])*tt);
   const cb=Math.round(s0[1][2]+(s1[1][2]-s0[1][2])*tt);
   const ca=s0[1][3]+(s1[1][3]-s0[1][3])*tt;
   bpath(g,h,k);g.fillStyle=`rgba(${cr},${cg},${cb},${ca.toFixed(3)})`;g.fill();
  }
  g.strokeStyle='rgba(60,50,30,.25)';g.lineWidth=2;bpath(g,h,1);g.stroke()}}
// dettagli sparsi: nessuna zona resta di colore piatto (erba, sassolini, fiori, cespugli | crepe, macchie d'olio, pozzanghere, tombini)
function pScatter(g,x0,y0){const SP=22,sd=DC.seed;
 for(let cy=Math.floor(y0/SP);cy<(y0+CH)/SP;cy++)for(let cx=Math.floor(x0/SP);cx<(x0+CH)/SP;cx++){
  const h1=hs(cx,cy,sd),h2=hs(cx,cy,sd+1),h3=hs(cx,cy,sd+2);let x=(cx+h1)*SP,y=(cy+h2)*SP;if(x>=WW||y>=WH)continue;const u=urbAt(x,y);
  const bio=M.bio[clamp(y/TC|0,0,GH-1)*GW+clamp(x/TC|0,0,GW-1)];
  if(u<.42&&bio==1){   // bosco: sottobosco fitto (chiome basse, felci), così la foresta è piena anche tra un albero e l'altro
   if(h3<.5){const r=5+h1*9;g.fillStyle='rgba(0,0,0,.25)';g.beginPath();g.arc(x+2,y+3,r,0,TAU);g.fill();g.fillStyle=h2<.33?'#1c3320':h2<.66?'#27452a':'#203b24';g.beginPath();g.arc(x,y,r,0,TAU);g.arc(x+r*.7,y-r*.3,r*.65,0,TAU);g.fill();g.fillStyle='rgba(130,180,95,.22)';g.beginPath();g.arc(x-r*.3,y-r*.3,r*.4,0,TAU);g.fill()}
   else if(h3<.62){g.strokeStyle='rgba(95,150,70,.5)';g.lineWidth=1.2;g.beginPath();for(let k=0;k<4;k++){const a=k*1.57+h2*3;g.moveTo(x,y);g.lineTo(x+Math.cos(a)*5,y+Math.sin(a)*5)}g.stroke()}
   else if(h3<.66){g.fillStyle='rgba(70,52,30,.5)';g.save();g.translate(x,y);g.rotate(h1*3);g.fillRect(-7,-1.5,14,3);g.restore()}
   continue}
  if(u<.42&&bio==2){   // roccia: ghiaia, crepe, lastre affioranti
   if(h3<.34){g.fillStyle=h1<.5?'rgba(135,130,120,.75)':'rgba(70,66,60,.6)';for(let k=0;k<3;k++){g.beginPath();g.ellipse(x+(hs(cx,cy,k+31)-.5)*14,y+(hs(cx,cy,k+41)-.5)*14,1.2+h2*2.4,1+h1*1.6,h2*3,0,TAU);g.fill()}}
   else if(h3<.46){g.strokeStyle='rgba(25,24,22,.4)';g.lineWidth=1;g.beginPath();g.moveTo(x,y);let px=x,py=y;for(let k=0;k<4;k++)g.lineTo(px+=(hs(cx,cy,k+9)-.4)*9,py+=(hs(cx,cy,k+19)-.5)*9);g.stroke()}
   else if(h3<.54){const r=5+h1*8;g.fillStyle='rgba(0,0,0,.22)';g.beginPath();for(let k=0;k<6;k++){const a=k*1.047+h2,d=r*(.7+hs(cx,cy,k+51)*.5);g.lineTo(x+2+Math.cos(a)*d,y+3+Math.sin(a)*d)}g.fill();
    g.fillStyle=h2<.5?'#77736a':'#868178';g.beginPath();for(let k=0;k<6;k++){const a=k*1.047+h2,d=r*(.7+hs(cx,cy,k+51)*.5);g.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d)}g.fill();g.fillStyle='rgba(255,255,255,.14)';g.beginPath();g.arc(x-r*.25,y-r*.25,r*.35,0,TAU);g.fill()}
   continue}
  if(u<.42&&bio==3){   // sabbia: increspature, sassolini, qualche cespuglio secco
   if(h3<.3){g.strokeStyle='rgba(225,210,165,.35)';g.lineWidth=1.2;g.beginPath();g.moveTo(x-7,y);g.quadraticCurveTo(x,y-3-h1*3,x+7,y);g.stroke()}
   else if(h3<.4){g.fillStyle='rgba(70,60,40,.4)';g.beginPath();g.arc(x,y,1+h1*1.4,0,TAU);g.fill()}
   else if(h3<.43){g.strokeStyle='rgba(95,105,60,.7)';g.lineWidth=1.2;g.beginPath();for(let k=0;k<5;k++){const a=k*1.25+h2;g.moveTo(x,y);g.lineTo(x+Math.cos(a)*5,y+Math.sin(a)*5)}g.stroke()}
   continue}
  if(u<.42){
   if(h3<.4){g.strokeStyle=h1<.5?'rgba(30,80,28,.55)':'rgba(150,200,90,.5)';g.lineWidth=1.3;g.beginPath();for(let k=0;k<3;k++){const a=-1.2+k*.5+h2;g.moveTo(x,y);g.lineTo(x+Math.cos(a)*4,y+Math.sin(a)*-5)}g.stroke()}
   else if(h3<.5){g.fillStyle='rgba(120,118,108,.7)';g.beginPath();g.ellipse(x,y,1+h1*2.2,1+h2*1.5,h1*3,0,TAU);g.fill()}
   else if(h3<.56){g.fillStyle=['#fff6c4','#ffffff','#ff7ad1','#7ae8ff','#ffd24a'][(h1*5)|0];g.beginPath();g.arc(x,y,1.3,0,TAU);g.fill()}
   else if(h3<.63){const r=3+h1*4;g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.arc(x+2,y+3,r,0,TAU);g.fill();g.fillStyle=h2<.5?'#2f6b2e':'#3f8a3a';g.beginPath();g.arc(x,y,r,0,TAU);g.arc(x+r*.8,y+r*.3,r*.7,0,TAU);g.fill();g.fillStyle='rgba(190,240,130,.35)';g.beginPath();g.arc(x-r*.3,y-r*.3,r*.45,0,TAU);g.fill()}
   else if(h3<.68){g.fillStyle='rgba(122,92,56,.22)';g.beginPath();g.ellipse(x,y,7+h1*10,4+h2*7,h1*3,0,TAU);g.fill()}}
  if(u>.3){const w=smooth(.3,.6,u);
   if(h3>.76&&h3<.8){g.strokeStyle=`rgba(20,22,26,${.3*w})`;g.lineWidth=1;g.beginPath();g.moveTo(x,y);for(let k=0;k<4;k++)g.lineTo(x+=(hs(cx,cy,k+9)-.4)*7,y+=(hs(cx,cy,k+19)-.4)*7);g.stroke()}
   else if(h3>.8&&h3<.85){g.fillStyle=`rgba(10,10,14,${.16*w})`;g.beginPath();g.ellipse(x,y,5+h1*9,3+h2*6,h1*3,0,TAU);g.fill()}
   else if(h3>.86&&h3<.9){g.fillStyle=`rgba(70,150,200,${.28*w})`;g.beginPath();g.ellipse(x,y,6+h1*10,3+h2*5,h1*3,0,TAU);g.fill();g.fillStyle=`rgba(255,255,255,${.22*w})`;g.beginPath();g.ellipse(x-1,y-1,2.5+h1*3,1,0,0,TAU);g.fill()}
   else if(h3>.9&&h3<.93){g.fillStyle=['#ff4fa3','#29d3ff','#ffd24a','#ffffff'][(h1*4)|0];g.globalAlpha=.7*w;g.fillRect(x,y,2+h2*2,1.5);g.globalAlpha=1}
   else if(h3>.96){g.strokeStyle=`rgba(0,0,0,${.4*w})`;g.fillStyle=`rgba(30,32,38,${.8*w})`;g.lineWidth=1;g.beginPath();g.arc(x,y,4,0,TAU);g.fill();g.stroke();g.beginPath();g.arc(x,y,2,0,TAU);g.stroke()}}}}
// superfici piatte (piazzali, campi, parcheggi, parchi, piscine, binari...) per livello z
function pFlat(g,x0,y0,zmin,zmax){const a=DC.FI.get(Math.floor(x0/CH)*64+Math.floor(y0/CH));if(!a)return;
 for(const f of a){if(f.z<zmin||f.z>zmax)continue;g.save();
  if(!f.pts&&f.x!=null&&f.y!=null&&f.k!=='pad'&&f.k!=='circ'){g.translate(f.x,f.y);g.rotate(f.a||0)}
  try{PF[f.k]&&PF[f.k](g,f)}catch(e){pFlat.w||console.warn('Elemento di terreno non disegnabile',f.k,e);pFlat.w=1}g.restore()}}

// ===== piazzali =====
// colori: scuri e vicini al cemento del terreno, così il bordo si fonde; [base, scuro]. f.tn sceglie il tono (altrimenti dipende dal punto)
const SLAB_COL=[['#454a53','#33373e'],['#474d49','#353a37'],['#4c4743','#393431'],['#414659','#303444'],['#494552','#36323d'],['#3a4849','#2a3637']];
const slabTone=(x,y,tn)=>SLAB_COL[tn!=null?tn%SLAB_COL.length:(hs(x|0,y|0,DC.seed+31)*SLAB_COL.length)|0];
// corsia disegnata a terra: bordo, cordolo, asfalto e mezzeria tratteggiata lungo il percorso tracciato da path()
function slabLanes(g,path,rw){g.lineJoin='round';g.lineCap='butt';
 for(const[wd,col]of[[rw+9,'rgba(0,0,0,.3)'],[rw+5,'#646a72'],[rw,'#1f2227']]){g.strokeStyle=col;g.lineWidth=wd;path();g.stroke()}
 g.strokeStyle='rgba(235,235,235,.42)';g.lineWidth=1.4;g.setLineDash([9,9]);path();g.stroke();g.setLineDash([])}
// piazzale "morbido" (edifici, siti): base con alone, zone di tono diverso, giunti, segnaletica, un elemento caratteristico,
// una rete di corsie in uno di 5 stili (f.st); i dettagli e gli elementi caratteristici li disegna slabTop, dopo le strade:
// 0 anello ottagonale con uscite e diagonali · 1 corsie curve · 2 reticolo a 45° · 3 anello tondo con raggi · 4 cortili recintati e canale
const SLAB_ZONE=['rgba(20,40,60,.24)','rgba(60,40,20,.22)','rgba(10,10,14,.28)','rgba(40,70,50,.2)','rgba(70,60,90,.2)','rgba(120,120,130,.12)'];
function slabHatch(g,x,y,w,h,col){g.save();g.beginPath();g.rect(x,y,w,h);g.clip();g.fillStyle='rgba(15,15,15,.55)';g.fillRect(x,y,w,h);g.strokeStyle=col||'#d9b300';g.lineWidth=4;g.beginPath();
 for(let k=-h;k<w;k+=12){g.moveTo(x+k,y+h);g.lineTo(x+k+h,y)}g.stroke();g.restore();g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=1;g.strokeRect(x,y,w,h)}
// un dettaglio piccolo (circa 36 px) in (0,0), già ruotato: k sceglie il tipo
function slabBit(g,k,H,n){
 switch(k){
  case 0:{g.fillStyle='rgba(15,17,20,.4)';g.fillRect(-17,-12,34,24);g.strokeStyle='rgba(235,235,235,.6)';g.lineWidth=1.2;g.beginPath();for(const u of[-17,-5.5,5.5,17]){g.moveTo(u,-12);g.lineTo(u,12)}g.stroke();   // stalli con auto
   for(let j=0;j<3;j++)if(H(n,30+j)<.65)car(g,-11.25+j*11.25,0,Math.PI/2,CAR_COL[(H(n,40+j)*CAR_COL.length)|0],19,8);break}
  case 1:{g.fillStyle='#2a2c30';rrect(g,-14,-10,28,20,4);g.fill();g.fillStyle='#35663a';rrect(g,-12,-8,24,16,3);g.fill();g.fillStyle='rgba(0,0,0,.25)';g.beginPath();g.arc(1,2,7,0,TAU);g.fill();   // fioriera con alberello
   g.fillStyle='#2a5a2c';g.beginPath();g.arc(0,0,7,0,TAU);g.fill();g.fillStyle='rgba(190,240,130,.35)';g.beginPath();g.arc(-2,-2,3,0,TAU);g.fill();break}
  case 2:{for(const[cx,cy,s]of[[-6,-4,11],[6,-2,10],[0,7,9]]){g.fillStyle='#7a5c33';g.fillRect(cx-s/2,cy-s/2,s,s);g.strokeStyle='#3a2a14';g.lineWidth=1;g.strokeRect(cx-s/2,cy-s/2,s,s);g.beginPath();g.moveTo(cx-s/2,cy-s/2);g.lineTo(cx+s/2,cy+s/2);g.stroke()}break}   // casse
  case 3:{g.fillStyle='rgba(0,0,0,.3)';g.beginPath();g.arc(2,3,10,0,TAU);g.fill();g.fillStyle='#7b8590';g.beginPath();g.arc(0,0,10,0,TAU);g.fill();g.strokeStyle='#2c3138';g.lineWidth=1.5;g.stroke();   // serbatoio
   g.beginPath();g.arc(0,0,5.5,0,TAU);g.stroke();g.fillStyle='#c8921a';g.fillRect(-1.5,-1.5,3,3);break}
  case 4:{g.fillStyle='#27466f';g.strokeStyle='#8fb4e0';g.lineWidth=.8;for(let r=0;r<2;r++)for(let cc=0;cc<3;cc++){g.fillRect(-18+cc*12.5,-10+r*11,11,9.5);g.strokeRect(-18+cc*12.5,-10+r*11,11,9.5)}break}   // pannelli solari
  case 5:{g.fillStyle='#14161a';g.beginPath();g.arc(0,0,4.5,0,TAU);g.fill();g.strokeStyle='rgba(150,155,165,.6)';g.lineWidth=1;g.stroke();g.beginPath();g.moveTo(-3,0);g.lineTo(3,0);g.moveTo(0,-3);g.lineTo(0,3);g.stroke();   // tombino e lampione
   g.fillStyle='#2b2e33';g.fillRect(8,-10,3,3);g.fillStyle='#fff8e0';g.beginPath();g.arc(9.5,-8.5,2,0,TAU);g.fill();break}
  case 6:slabHatch(g,-16,-9,32,18,H(n,50)<.5?'#d9b300':'#c23b22');break;   // zona di sicurezza a strisce
  case 7:{g.fillStyle='rgba(235,235,235,.55)';g.beginPath();g.moveTo(-14,-3);g.lineTo(4,-3);g.lineTo(4,-8);g.lineTo(15,0);g.lineTo(4,8);g.lineTo(4,3);g.lineTo(-14,3);g.closePath();g.fill();break}   // freccia dipinta
  case 8:{g.fillStyle='rgba(5,5,8,.22)';g.beginPath();g.ellipse(0,0,13,7,H(n,51)*3,0,TAU);g.fill();g.beginPath();g.ellipse(7,4,6,4,0,0,TAU);g.fill();   // macchie d'olio e crepe
   g.strokeStyle='rgba(10,10,10,.4)';g.lineWidth=1;g.beginPath();g.moveTo(-15,-8);g.lineTo(-7,-3);g.lineTo(-9,4);g.lineTo(-2,9);g.stroke();break}
  case 9:{const C=['#b03a2e','#2e6f9e','#c9a227','#3d7a3d'];for(const[cx,cy]of[[-6,-5],[5,-5],[-1,5],[9,5]]){g.fillStyle=C[(H(n,cx+20)*4)|0];g.beginPath();g.arc(cx,cy,4.5,0,TAU);g.fill();g.strokeStyle='rgba(0,0,0,.6)';g.lineWidth=1;g.stroke();g.beginPath();g.arc(cx,cy,2,0,TAU);g.stroke()}break}   // fusti
  case 10:{g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-11,-7,25,17);g.fillStyle='#8d949c';g.fillRect(-13,-9,25,17);g.strokeStyle='#2c3036';g.lineWidth=1;g.strokeRect(-13,-9,25,17);   // gruppo frigo / ventola
   for(const cx of[-6,5]){g.fillStyle='#343a40';g.beginPath();g.arc(cx,-.5,5,0,TAU);g.fill();g.strokeStyle='#8d949c';g.beginPath();g.moveTo(cx-4,-.5);g.lineTo(cx+4,-.5);g.moveTo(cx,-4.5);g.lineTo(cx,3.5);g.stroke()}break}
  case 11:{g.fillStyle='#6b4a2a';g.fillRect(-12,-3,20,6);g.fillStyle='#3a2a18';g.fillRect(-12,-3,20,1.5);g.fillStyle='#2d3238';g.beginPath();g.arc(13,0,3.5,0,TAU);g.fill();   // panchina e cestino
   g.fillStyle='#35663a';g.beginPath();g.arc(-4,-12,6,0,TAU);g.fill();break}
  case 12:{g.fillStyle='#1b1d21';g.fillRect(-10,-6,20,12);g.strokeStyle='#5b616a';g.lineWidth=1;g.beginPath();for(let x=-8;x<=8;x+=3){g.moveTo(x,-6);g.lineTo(x,6)}g.stroke();g.strokeRect(-10,-6,20,12);break}   // griglia di scolo
  case 13:{g.lineCap='round';g.strokeStyle='#59616a';g.lineWidth=5;g.beginPath();g.moveTo(-17,-4);g.lineTo(8,-4);g.lineTo(8,10);g.stroke();g.strokeStyle='#8d949c';g.lineWidth=1.5;g.beginPath();g.moveTo(-17,-5.5);g.lineTo(6.5,-5.5);g.stroke();   // tubazione con flange
   g.fillStyle='#2b2f34';for(const[x,y]of[[-10,-4],[1,-4],[8,4]])g.fillRect(x-2,y-4,4,8);g.lineCap='butt';break}
  case 14:{const col=CAR_COL[(H(n,52)*CAR_COL.length)|0];g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-15,-6,32,15);g.fillStyle='#d6d8dc';g.fillRect(-17,-7,22,14);g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=1;g.strokeRect(-17,-7,22,14);   // furgone
   g.fillStyle=col;g.fillRect(6,-6,10,12);g.fillStyle='#1d2a38';g.fillRect(12,-5,3,10);break}
  default:{g.fillStyle='rgba(235,235,235,.38)';for(let i=0;i<4;i++)g.fillRect(-15+i*8,-8,4,16)}}}   // strisce pedonali
// elemento caratteristico del piazzale (uno o due per piazzale): eliporto, banchine di carico, campo dipinto, deposito recintato, aiuola tonda
function slabFeature(g,k,x,y,s,a,H,n){g.save();g.translate(x,y);g.rotate(a);
 if(k==0){const r=s*.42;g.fillStyle='#2a2d33';g.beginPath();g.arc(0,0,r+4,0,TAU);g.fill();g.strokeStyle='#e6b422';g.lineWidth=3;g.beginPath();g.arc(0,0,r,0,TAU);g.stroke();   // eliporto
  g.strokeStyle='#fff';g.lineWidth=4;g.beginPath();g.moveTo(-r*.35,-r*.45);g.lineTo(-r*.35,r*.45);g.moveTo(r*.35,-r*.45);g.lineTo(r*.35,r*.45);g.moveTo(-r*.35,0);g.lineTo(r*.35,0);g.stroke();
  g.fillStyle='#ffd23f';for(let i=0;i<8;i++){const t=i*TAU/8;g.beginPath();g.arc(Math.cos(t)*(r+8),Math.sin(t)*(r+8),2,0,TAU);g.fill()}}
 else if(k==1){const L=s,n2=Math.max(2,Math.floor(L/40));slabHatch(g,-L/2,-s*.22,L,10,'#d9b300');g.strokeStyle='rgba(235,235,235,.55)';g.lineWidth=2;g.beginPath();   // banchine di carico con camion
  for(let i=0;i<=n2;i++){const u=-L/2+i*L/n2;g.moveTo(u,-s*.22+10);g.lineTo(u,s*.2)}g.stroke();
  for(let i=0;i<n2;i++)if(H(n+i,60)<.6){const u=-L/2+(i+.5)*L/n2;g.fillStyle='rgba(0,0,0,.3)';g.fillRect(u-9,-s*.18+4,20,40);g.fillStyle='#c9cdd2';g.fillRect(u-10,-s*.2+12,20,30);g.fillStyle=CAR_COL[(H(n+i,61)*CAR_COL.length)|0];g.fillRect(u-9,-s*.2+42,18,12)}}
 else if(k==2){const w=s,h=s*.56;g.fillStyle=H(n,62)<.5?'#3d6b4a':'#7a4a36';g.fillRect(-w/2,-h/2,w,h);g.strokeStyle='rgba(255,255,255,.7)';g.lineWidth=2;g.strokeRect(-w/2+4,-h/2+4,w-8,h-8);   // campo sportivo dipinto
  g.beginPath();g.moveTo(0,-h/2+4);g.lineTo(0,h/2-4);g.stroke();g.beginPath();g.arc(0,0,h*.18,0,TAU);g.stroke();g.strokeRect(-w/2+4,-h*.2,w*.12,h*.4);g.strokeRect(w/2-4-w*.12,-h*.2,w*.12,h*.4)}
 else if(k==3){const w=s,h=s*.7;g.fillStyle='rgba(12,14,18,.35)';g.fillRect(-w/2,-h/2,w,h);   // deposito recintato con container
  const C=['#c0392b','#2e86c1','#d4ac0d','#27ae60','#7f8c8d','#e67e22'];for(let r=0;r<2;r++)for(let c=0;c<Math.floor(w/34);c++)if(H(n+r*9+c,63)<.75){const px=-w/2+8+c*34,py=-h/2+10+r*(h*.5);g.fillStyle=C[(H(n+c,64+r)*6)|0];g.fillRect(px,py,28,h*.32);g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=1;g.strokeRect(px,py,28,h*.32);
   g.beginPath();for(let q=py+4;q<py+h*.32;q+=4){g.moveTo(px+2,q);g.lineTo(px+26,q)}g.stroke()}
  g.strokeStyle='rgba(205,210,216,.65)';g.lineWidth=1.5;g.setLineDash([3,3]);g.strokeRect(-w/2,-h/2,w,h);g.setLineDash([])}
 else{const r=s*.36;g.fillStyle='#3a3d42';g.beginPath();g.arc(0,0,r+6,0,TAU);g.fill();g.fillStyle='#3f7a42';g.beginPath();g.arc(0,0,r,0,TAU);g.fill();   // aiuola tonda con fontana
  g.fillStyle='rgba(20,60,25,.4)';for(let i=0;i<6;i++){const t=i*TAU/6+H(n,65);g.beginPath();g.arc(Math.cos(t)*r*.6,Math.sin(t)*r*.6,r*.22,0,TAU);g.fill()}
  g.fillStyle='#2f6f86';g.beginPath();g.arc(0,0,r*.28,0,TAU);g.fill();g.strokeStyle='rgba(200,235,245,.6)';g.lineWidth=1.5;g.stroke()}
 g.restore()}
function slabSoft(g,f){
 const w=f.w,h=f.h,sd=((f.x|0)*13+(f.y|0)*7)|0,H=(i,k)=>hs(i,sd,DC.seed+k),T=f.col||slabTone(f.x,f.y,f.tn),st=f.st!=null?f.st:(H(0,77)*5)|0;
 g.save();g.shadowColor=T[0];g.shadowBlur=28;g.fillStyle=T[0];g.fillRect(-w/2,-h/2,w,h);g.restore();
 g.fillStyle=T[0];g.fillRect(-w/2,-h/2,w,h);
 g.save();g.beginPath();g.rect(-w/2,-h/2,w,h);g.clip();
 // zone di tono diverso e lastre più chiare/scure
 for(let i=0,nz=4+((H(9,1)*4)|0);i<nz;i++){if(H(i,1)<.15)continue;const zw=w*(.18+H(i,2)*.34),zh=h*(.18+H(i,3)*.34);g.fillStyle=SLAB_ZONE[(H(i,4)*SLAB_ZONE.length)|0];g.fillRect((H(i,5)-.5)*(w-zw)-zw/2,(H(i,6)-.5)*(h-zh)-zh/2,zw,zh)}
 const J=H(1,7)<.5?40:32;g.strokeStyle='rgba(255,255,255,.05)';g.lineWidth=1;g.beginPath();for(let x=-w/2+J;x<w/2;x+=J){g.moveTo(x,-h/2);g.lineTo(x,h/2)}for(let y=-h/2+J;y<h/2;y+=J){g.moveTo(-w/2,y);g.lineTo(w/2,y)}g.stroke();
 g.fillStyle='rgba(255,255,255,.035)';for(let i=0;i<10;i++)if(H(i,8)<.6)g.fillRect(-w/2+((H(i,9)*w/J)|0)*J,-h/2+((H(i,10)*h/J)|0)*J,J,J);
 const m=clamp(Math.min(w,h)*.1,10,26),rw=clamp(Math.min(w,h)*.06,7,13),a=w/2-m,b=h/2-m,c=Math.min(a,b)*.38;
 // corsie
 if(st==0)slabLanes(g,()=>{g.beginPath();g.moveTo(-a+c,-b);g.lineTo(a-c,-b);g.lineTo(a,-b+c);g.lineTo(a,b-c);g.lineTo(a-c,b);g.lineTo(-a+c,b);g.lineTo(-a,b-c);g.lineTo(-a,-b+c);g.closePath();
   for(const sx of[-1,1])for(const sy of[-1,1]){g.moveTo(sx*(a-c/2),sy*(b-c/2));g.lineTo(sx*w/2,sy*h/2)}
   g.moveTo(0,-b);g.lineTo(0,-h/2);g.moveTo(0,b);g.lineTo(0,h/2);g.moveTo(-a,0);g.lineTo(-w/2,0);g.moveTo(a,0);g.lineTo(w/2,0)},rw);
 else if(st==1){const k=H(1,81)<.5?1:-1;slabLanes(g,()=>{g.beginPath();g.moveTo(-w/2,-b*.5*k);g.bezierCurveTo(-a*.3,-b*.9*k,a*.3,b*.9*k,w/2,b*.5*k);g.moveTo(-a*.6,h/2);g.bezierCurveTo(-a*.7,0,a*.1,-b*.2,a*.55,-h/2);
   g.moveTo(a*.62,b*.1);g.ellipse(a*.3,b*.1,a*.32,b*.42,0,0,TAU)},rw)}
 else if(st==2){const D=clamp(Math.min(w,h)*.5,90,230),L=(w+h);slabLanes(g,()=>{g.beginPath();for(let k=-Math.ceil(L/D);k<=Math.ceil(L/D);k++){g.moveTo(k*D-L,-L);g.lineTo(k*D+L,L);if(k%2==0){g.moveTo(k*D+L,-L);g.lineTo(k*D-L,L)}}},rw)}
 else if(st==3){const r2=Math.min(a,b)*.34,n=5+((H(2,82)*3)|0),ph=H(3,83)*TAU;slabLanes(g,()=>{g.beginPath();g.ellipse(0,0,a*.78,b*.78,0,0,TAU);g.moveTo(r2,0);g.arc(0,0,r2,0,TAU);
   for(let i=0;i<n;i++){const t=ph+i*TAU/n;g.moveTo(Math.cos(t)*r2,Math.sin(t)*r2);g.lineTo(Math.cos(t)*(w+h),Math.sin(t)*(w+h))}},rw)}
 else{   // cortili recintati di forme diverse, un canale con passerelle, una corsia di servizio
  const hz=H(4,84)<.5,cy=(H(5,85)-.5)*(hz?h:w)*.5,cw=clamp(Math.min(w,h)*.07,8,16);
  g.save();if(!hz)g.rotate(Math.PI/2);const LL=(hz?w:h)/2,amp=cw*1.5,wave=()=>{g.beginPath();g.moveTo(-LL,cy);for(let x=-LL;x<=LL;x+=LL/6)g.lineTo(x,cy+Math.sin(x/LL*5+H(6,86)*6)*amp)};
  g.lineJoin='round';g.strokeStyle='#23262b';g.lineWidth=cw+8;wave();g.stroke();g.strokeStyle='#7d838b';g.lineWidth=cw+4;wave();g.stroke();g.strokeStyle='#2c6f86';g.lineWidth=cw;wave();g.stroke();
  for(const x of[-LL*.5,LL*.15,LL*.62]){const y=cy+Math.sin(x/LL*5+H(6,86)*6)*amp;g.fillStyle='#8a8f96';g.fillRect(x-7,y-cw/2-7,14,cw+14);g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=1;g.strokeRect(x-7,y-cw/2-7,14,cw+14)}
  g.restore();
  for(let i=0;i<3;i++){if(H(i,90)<.3)continue;const yw=w*(.18+H(i,91)*.2),yh=h*(.18+H(i,92)*.2),yx=(H(i,93)-.5)*(w-yw-30),yy=(H(i,94)-.5)*(h-yh-30),k=(H(i,95)*3)|0;
   g.save();g.translate(yx,yy);g.fillStyle='rgba(12,14,18,.28)';g.strokeStyle=k==0?'rgba(217,179,0,.6)':'rgba(205,210,216,.55)';g.lineWidth=2;g.setLineDash(k==2?[]:[7,5]);
   g.beginPath();if(k==1)g.ellipse(0,0,yw/2,yh/2,0,0,TAU);else if(k==2){const q=Math.min(yw,yh)*.3;g.moveTo(-yw/2+q,-yh/2);g.lineTo(yw/2-q,-yh/2);g.lineTo(yw/2,-yh/2+q);g.lineTo(yw/2,yh/2-q);g.lineTo(yw/2-q,yh/2);g.lineTo(-yw/2+q,yh/2);g.lineTo(-yw/2,yh/2-q);g.lineTo(-yw/2,-yh/2+q);g.closePath()}else g.rect(-yw/2,-yh/2,yw,yh);
   g.fill();g.stroke();g.setLineDash([]);g.restore()}
  slabLanes(g,()=>{g.beginPath();g.moveTo(-w/2,b*.8);g.lineTo(a*.2,b*.8);g.lineTo(a*.2+b*.5,b*.3);g.lineTo(w/2,b*.3)},rw)}
 // bordo: cordolo chiaro, paletti o siepe su alcuni lati, filo giallo tratteggiato
 g.strokeStyle='rgba(150,155,165,.35)';g.lineWidth=3;g.strokeRect(-w/2+1.5,-h/2+1.5,w-3,h-3);
 for(let sdI=0;sdI<4;sdI++){const v=H(sdI,96);if(v<.45)continue;const hor=sdI<2,L=hor?w:h,o=(sdI%2?1:-1)*((hor?h:w)/2-7);
  for(let u=-L/2+14;u<L/2-10;u+=v<.75?22:16){const px=hor?u:o,py=hor?o:u;if(v<.75){g.fillStyle='#d8dde3';g.fillRect(px-1.5,py-1.5,3,3)}else{g.fillStyle='#2d5a30';g.beginPath();g.arc(px,py,5.5,0,TAU);g.fill()}}}
 g.strokeStyle='rgba(217,179,0,.35)';g.lineWidth=2;g.setLineDash([12,10]);g.strokeRect(-w/2+10,-h/2+10,w-20,h-20);g.setLineDash([]);
 g.restore()}

// percorsi delle corsie (e del canale) di un piazzale, in coordinate del piazzale: [costruttore del percorso, larghezza]. Servono a non mettere oggetti sulle corsie
function slabPaths(g,f){const w=f.w,h=f.h,sd=((f.x|0)*13+(f.y|0)*7)|0,H=(i,k)=>hs(i,sd,DC.seed+k),st=f.st!=null?f.st:(H(0,77)*5)|0,
  m=clamp(Math.min(w,h)*.1,10,26),rw=clamp(Math.min(w,h)*.06,7,13),a=w/2-m,b=h/2-m,c=Math.min(a,b)*.38;
 if(st==0)return[[()=>{g.beginPath();g.moveTo(-a+c,-b);g.lineTo(a-c,-b);g.lineTo(a,-b+c);g.lineTo(a,b-c);g.lineTo(a-c,b);g.lineTo(-a+c,b);g.lineTo(-a,b-c);g.lineTo(-a,-b+c);g.closePath();
   for(const sx of[-1,1])for(const sy of[-1,1]){g.moveTo(sx*(a-c/2),sy*(b-c/2));g.lineTo(sx*w/2,sy*h/2)}
   g.moveTo(0,-b);g.lineTo(0,-h/2);g.moveTo(0,b);g.lineTo(0,h/2);g.moveTo(-a,0);g.lineTo(-w/2,0);g.moveTo(a,0);g.lineTo(w/2,0)},rw]];
 if(st==1){const k=H(1,81)<.5?1:-1;return[[()=>{g.beginPath();g.moveTo(-w/2,-b*.5*k);g.bezierCurveTo(-a*.3,-b*.9*k,a*.3,b*.9*k,w/2,b*.5*k);g.moveTo(-a*.6,h/2);g.bezierCurveTo(-a*.7,0,a*.1,-b*.2,a*.55,-h/2);
   g.moveTo(a*.62,b*.1);g.ellipse(a*.3,b*.1,a*.32,b*.42,0,0,TAU)},rw]]}
 if(st==2){const D=clamp(Math.min(w,h)*.5,90,230),L=(w+h);return[[()=>{g.beginPath();for(let k=-Math.ceil(L/D);k<=Math.ceil(L/D);k++){g.moveTo(k*D-L,-L);g.lineTo(k*D+L,L);if(k%2==0){g.moveTo(k*D+L,-L);g.lineTo(k*D-L,L)}}},rw]]}
 if(st==3){const r2=Math.min(a,b)*.34,n=5+((H(2,82)*3)|0),ph=H(3,83)*TAU;return[[()=>{g.beginPath();g.ellipse(0,0,a*.78,b*.78,0,0,TAU);g.moveTo(r2,0);g.arc(0,0,r2,0,TAU);
   for(let i=0;i<n;i++){const t=ph+i*TAU/n;g.moveTo(Math.cos(t)*r2,Math.sin(t)*r2);g.lineTo(Math.cos(t)*(w+h),Math.sin(t)*(w+h))}},rw]]}
 const hz=H(4,84)<.5,cy=(H(5,85)-.5)*(hz?h:w)*.5,cw=clamp(Math.min(w,h)*.07,8,16),LL=(hz?w:h)/2,amp=cw*1.5,R=(x,y)=>hz?[x,y]:[-y,x];   // canale (ruotato di 90° se verticale)
 return[[()=>{g.beginPath();for(let x=-LL;x<=LL;x+=LL/6)g.lineTo(...R(x,cy+Math.sin(x/LL*5+H(6,86)*6)*amp))},cw+8],
  [()=>{g.beginPath();g.moveTo(-w/2,b*.8);g.lineTo(a*.2,b*.8);g.lineTo(a*.2+b*.5,b*.3);g.lineTo(w/2,b*.3)},rw]]}
// il punto locale (lx,ly) cade su una corsia (allargata di ex)?
function laneHit(g,P,lx,ly,ex){const t=g.getTransform(),px=t.a*lx+t.c*ly+t.e,py=t.b*lx+t.d*ly+t.f;
 for(const[fn,wd]of P){fn();g.lineWidth=wd+ex;if(g.isPointInStroke(px,py))return true}return false}
// oggetti del piazzale (elementi caratteristici e dettagli): disegnati DOPO le strade, quindi sopra; si saltano i punti su strade, ponti, acqua e corsie
function slabTop(g,f,BL){const w=f.w,h=f.h,sd=((f.x|0)*13+(f.y|0)*7)|0,H=(i,k)=>hs(i,sd,DC.seed+k),ca=Math.cos(f.a||0),sa=Math.sin(f.a||0),
  P=f.soft?slabPaths(g,f):[],m=clamp(Math.min(w,h)*.1,10,26),S0=Math.min(w,h),
  ok=(lx,ly,ex)=>{const x=f.x+lx*ca-ly*sa,y=f.y+lx*sa+ly*ca;if(onRoad(x,y,ex/2)||onBridge(x,y)||(nearWater(x,y)&&inWater(x,y,ex/2))||inFlat(BL,x,y,ex/2))return false;return!(P.length&&laneHit(g,P,lx,ly,ex))};
 g.save();g.beginPath();g.rect(-w/2,-h/2,w,h);g.clip();g.lineCap='butt';g.lineJoin='miter';
 // elementi caratteristici: isolati di città 1 (se grandi), piazzali medi 1, grandi 2; si provano più posizioni finché una è libera
 const nf=f.dt?(S0>=170?1:0):S0>=150?(S0>=320?2:1):0;
 for(let i=0;i<nf;i++){const k=(H(i,70)*5)|0,s=f.dt?clamp(S0*.32,60,150):clamp(S0*(.26+H(i,71)*.12),60,190),rot=H(i,74)<.5?0:Math.PI/2;
  // k==2 (campo da calcio/basket dipinto): si disegna solo dove nessun edificio lo copre
  for(let t=0;t<5;t++){const fx=(H(i*7+t,72)-.5)*(f.dt?w*.5:w-s-2*m),fy=(H(i*7+t,73)-.5)*(f.dt?h*.5:h-s-2*m);
   if(ok(fx,fy,s*.5)&&ok(fx-s/2,fy-s/2,8)&&ok(fx+s/2,fy-s/2,8)&&ok(fx-s/2,fy+s/2,8)&&ok(fx+s/2,fy+s/2,8)&&(k!=2||rectFreeB(f.x+fx*ca-fy*sa,f.y+fx*sa+fy*ca,(f.a||0)+rot,s,s*.56))){slabFeature(g,k,fx,fy,s,rot,H,i*31);break}}}
 // dettagli sparsi
 const P2=f.dt?36:f.big?44:38,ia=w/2-(f.dt?14:10),ib=h/2-(f.dt?14:10),dens=f.dt?.55:f.big?.42:.58;let n=0;
 for(let gy=-ib+P2/2;gy<=ib-P2/2;gy+=P2)for(let gx=-ia+P2/2;gx<=ia-P2/2;gx+=P2){n++;if(H(n,20)>dens)continue;const px=gx+(H(n,21)-.5)*12,py=gy+(H(n,22)-.5)*12;if(!ok(px,py,30))continue;
  g.save();g.translate(px,py);g.rotate(H(n,24)<.6?0:H(n,24)<.85?Math.PI/2:H(n,25)*TAU);slabBit(g,(H(n,23)*16)|0,H,n);g.restore()}
 g.restore()}
// il rettangolo w×h centrato in (cx,cy) e ruotato di ang (coordinate mondo) è libero da edifici, muri e container?
// Campionamento a griglia: ogni campione rappresenta una cella, quindi deve stare fuori dagli edifici di almeno mezza diagonale della cella.
function rectFreeB(cx,cy,ang,w,h){const L=qobs(cx,cy,Math.hypot(w,h)/2+8,[]).filter(o=>o.t=='b');if(!L.length)return true;
 const c=Math.cos(ang),s=Math.sin(ang),nx=Math.max(1,Math.ceil(w/12)),ny=Math.max(1,Math.ceil(h/12)),dx=w/nx,dy=h/ny,mg=Math.hypot(dx,dy)/2;
 for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){const u=-w/2+(i+.5)*dx,v=-h/2+(j+.5)*dy,x=cx+u*c-v*s,y=cy+u*s+v*c;
  for(const o of L){const l=toLocal(o,x,y);if(bsd(o,l[0],l[1])<mg)return false}}
 return true}
// il punto è su una piazza, un parco, un parcheggio, un cantiere o un campo? (lì gli oggetti dei piazzali non vanno)
function inFlat(BL,x,y,mg){for(const q of BL){if(q.k==='circ'||q.k==='market'||q.k==='launchpad'||q.k==='pit'){if(Math.hypot(x-q.x,y-q.y)<q.r+mg)return true;continue}
  const c=Math.cos(q.a||0),s=Math.sin(q.a||0),dx=x-q.x,dy=y-q.y;if(Math.abs(dx*c+dy*s)<q.w/2+mg&&Math.abs(-dx*s+dy*c)<q.h/2+mg)return true}return false}
function pSlabTop(g,x0,y0){const a=DC.FI.get(Math.floor(x0/CH)*64+Math.floor(y0/CH));if(!a)return;
 const BL=a.filter(q=>(q.k==='circ'||q.k==='market'||q.k==='launchpad'||q.k==='pit')&&q.r||(q.k==='park'||q.k==='vpark'||q.k==='lot'||q.k==='construction'||q.k==='field'||q.k==='yard'||DECO_K.has(q.k))&&q.w&&q.h);
 for(const f of a){if(f.k!=='slab'||!(f.soft||f.dt))continue;g.save();g.translate(f.x,f.y);g.rotate(f.a||0);
  try{slabTop(g,f,BL)}catch(e){pSlabTop.w||console.warn('Oggetti del piazzale non disegnabili',e);pSlabTop.w=1}g.restore()}}

// ===== elementi piatti (M.flat): una funzione per tipo. g è già traslato e ruotato sull'elemento (tranne quelli fatti di punti: rail, pipe, lane, fence) =====
const PF={
 slab(g,f){const w=f.w,h=f.h,t=f.t;
  if(f.soft){slabSoft(g,f);return}
  if(t==5){g.fillStyle='#4f8442';g.fillRect(-w/2,-h/2,w,h);g.fillStyle='rgba(30,90,30,.18)';for(let i=0;i<14;i++){g.beginPath();g.arc((hs(i,1,f.s)-.5)*w,(hs(i,2,f.s)-.5)*h,18+hs(i,3,f.s)*26,0,TAU);g.fill()}   // giardino
   g.strokeStyle='#2a5a2c';g.lineWidth=6;g.strokeRect(-w/2+3,-h/2+3,w-6,h-6);g.strokeStyle='rgba(255,255,255,.1)';g.lineWidth=2;g.beginPath();for(let v=-h/2+14;v<h/2;v+=14){g.moveTo(-w/2+6,v);g.lineTo(w/2-6,v)}g.stroke();return}
  g.fillStyle='rgba(0,0,0,.25)';g.fillRect(-w/2-3,-h/2-3,w+6,h+6);
  g.fillStyle=f.col?f.col[0]:{0:'#484d55',1:'#666b72',3:'#82868d',4:'#69705f'}[t]||'#484d55';g.fillRect(-w/2,-h/2,w,h);
  g.strokeStyle='rgba(0,0,0,.14)';g.lineWidth=1;g.beginPath();const st=t==0?38:t==4?60:48;for(let x=-w/2+st;x<w/2;x+=st){g.moveTo(x,-h/2);g.lineTo(x,h/2)}for(let y=-h/2+st;y<h/2;y+=st){g.moveTo(-w/2,y);g.lineTo(w/2,y)}g.stroke();
  g.strokeStyle='rgba(255,255,255,.12)';g.lineWidth=2;g.strokeRect(-w/2+1,-h/2+1,w-2,h-2);
  if(t==1||t==3){g.strokeStyle='#d9b300';g.lineWidth=5;g.setLineDash([16,16]);g.strokeRect(-w/2+9,-h/2+9,w-18,h-18);g.setLineDash([]);
   g.fillStyle='rgba(255,255,255,.55)';for(let i=0;i<Math.floor(w/90);i++)g.fillRect(-w/2+30+i*90,h/2-30,4,22)}
  if(t==4){g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=4;g.beginPath();g.moveTo(-w/2+18,0);g.lineTo(w/2-18,0);g.stroke();g.fillStyle='rgba(255,210,70,.55)';for(let i=-3;i<=3;i++)g.fillRect(i*w/8-3,-h/2+10,6,26)}
  if(t==3){g.fillStyle='#2b2e33';for(let u=-w/2+30;u<w/2;u+=60){g.beginPath();g.arc(u,h/2-6,3,0,TAU);g.fill()}}
  g.fillStyle='rgba(10,12,16,.06)';for(let i=0;i<3;i++){g.beginPath();g.ellipse((hs(i,5,f.x|0)-.5)*w,(hs(i,6,f.x|0)-.5)*h,10+hs(i,7,f.x|0)*14,5+hs(i,8,f.x|0)*8,hs(i,9,f.x|0)*3,0,TAU);g.fill()}
},
 circ(g,f){g.save();g.translate(f.x,f.y);const r=f.r;g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.arc(2,3,r+3,0,TAU);g.fill();
  if(f.t==3){
   // aia / cortile fattoria: marrone molto più leggero + texture
   g.fillStyle='rgba(138,118,80,.35)';g.beginPath();g.arc(0,0,r,0,TAU);g.fill();
   g.strokeStyle='rgba(90,70,40,.25)';g.lineWidth=1.5;
   for(let k=1;k<r/40;k++){g.beginPath();g.arc(0,0,k*40,0,TAU);g.stroke()}
  }else{
   g.fillStyle='#85888f';g.beginPath();g.arc(0,0,r,0,TAU);g.fill();
  }
  if(f.t==2){g.strokeStyle='rgba(0,0,0,.16)';g.lineWidth=1;for(let k=1;k<r/26;k++){g.beginPath();g.arc(0,0,k*26,0,TAU);g.stroke()}g.beginPath();for(let i=0;i<16;i++){g.moveTo(0,0);g.lineTo(Math.cos(i*TAU/16)*r,Math.sin(i*TAU/16)*r)}g.stroke();
   g.strokeStyle='rgba(60,225,255,.55)';g.lineWidth=2.5;g.beginPath();g.arc(0,0,Math.max(0,r-3),0,TAU);g.stroke();g.strokeStyle='rgba(255,70,170,.45)';g.beginPath();g.arc(0,0,Math.max(0,r-9),0,TAU);g.stroke()}
  if(f.pool){g.fillStyle='#2a8fbf';g.beginPath();g.arc(0,0,44,0,TAU);g.fill();g.strokeStyle='#cfd3d8';g.lineWidth=6;g.stroke();g.fillStyle='rgba(255,255,255,.35)';g.beginPath();g.arc(-10,-10,10,0,TAU);g.fill();g.fillStyle='#e6f6ff';g.beginPath();g.arc(0,0,6,0,TAU);g.fill()}g.restore()},
 park(g,f){const w=f.w,h=f.h,s=f.s;g.fillStyle='#4c9442';g.fillRect(-w/2,-h/2,w,h);g.fillStyle='rgba(20,80,25,.22)';for(let i=0;i<16;i++){g.beginPath();g.arc((hs(i,1,s)-.5)*w,(hs(i,2,s)-.5)*h,14+hs(i,3,s)*30,0,TAU);g.fill()}
  g.strokeStyle='#d7c99a';g.lineWidth=9;g.lineCap='round';g.beginPath();g.moveTo(-w/2,0);g.bezierCurveTo(-w/4,h*.28,w/4,-h*.28,w/2,0);g.moveTo(0,-h/2);g.bezierCurveTo(w*.2,-h/6,-w*.2,h/6,0,h/2);g.stroke();
  g.strokeStyle='rgba(120,100,60,.5)';g.lineWidth=1.5;g.stroke();
  if(hs(1,1,s)<.7){const px=(hs(2,2,s)-.5)*w*.4,py=(hs(3,3,s)-.5)*h*.4;g.fillStyle='#d7c99a';g.beginPath();g.ellipse(px,py,46,32,.4,0,TAU);g.fill();g.fillStyle='#3a9dc8';g.beginPath();g.ellipse(px,py,38,25,.4,0,TAU);g.fill();g.fillStyle='rgba(255,255,255,.3)';g.beginPath();g.ellipse(px-8,py-7,12,5,.4,0,TAU);g.fill()}
  g.fillStyle='#2f6e2d';g.lineWidth=1;for(let i=0;i<Math.floor(w/22);i++){g.beginPath();g.arc(-w/2+8+i*22,-h/2+7,6,0,TAU);g.arc(-w/2+8+i*22,h/2-7,6,0,TAU);g.fill()}
  for(let i=0;i<9;i++){g.fillStyle=['#ff7ad1','#ffd24a','#ffffff','#7ae8ff'][i%4];g.beginPath();g.arc((hs(i,4,s)-.5)*w*.8,(hs(i,5,s)-.5)*h*.8,2,0,TAU);g.fill()}},
 field(g,f){const w=f.w,h=f.h,v=f.v,s=f.s,C=['#c9b25a','#5f9c3f','#7b5a3a','#6aa84f','#58783a','#6aa84f'][v];g.fillStyle=C;g.fillRect(-w/2,-h/2,w,h);
  g.strokeStyle=['rgba(120,95,30,.5)','rgba(30,90,25,.5)','rgba(60,35,20,.5)','rgba(40,110,40,.22)','rgba(25,60,20,.55)','rgba(30,90,25,.3)'][v];g.lineWidth=v==3?1:2.2;g.beginPath();const st=v==4?15:v==2?9:11;for(let y=-h/2+st/2;y<h/2;y+=st){g.moveTo(-w/2,y);g.lineTo(w/2,y)}g.stroke();
  if(v==5){for(let i=0;i<70;i++){g.fillStyle=['#ff4fa3','#ffd24a','#ffffff','#7ae8ff'][i%4];g.beginPath();g.arc((hs(i,1,s)-.5)*w,(hs(i,2,s)-.5)*h,2,0,TAU);g.fill()}}
  if(v==3){g.fillStyle='rgba(255,255,255,.8)';for(let i=0;i<9;i++){g.beginPath();g.ellipse((hs(i,1,s)-.5)*w*.9,(hs(i,2,s)-.5)*h*.9,5,3,hs(i,3,s)*3,0,TAU);g.fill()}}
  g.strokeStyle='rgba(30,50,20,.55)';g.lineWidth=3;g.strokeRect(-w/2,-h/2,w,h);g.fillStyle='rgba(255,255,255,.07)';g.fillRect(-w/2,-h/2,w,6)},
 lot(g,f){const w=f.w,h=f.h,s=f.s,mil=f.mil;g.fillStyle='rgba(0,0,0,.28)';g.fillRect(-w/2-2,-h/2-2,w+4,h+4);g.fillStyle=mil?'#4f5548':'#3d4046';g.fillRect(-w/2,-h/2,w,h);
  g.strokeStyle='rgba(255,255,255,.28)';g.lineWidth=2;g.strokeRect(-w/2+2,-h/2+2,w-4,h-4);
  const bw=mil?34:17,bd=mil?64:34,aisle=mil?60:42,band=2*bd+aisle;g.strokeStyle='rgba(235,235,235,.7)';g.lineWidth=1.6;g.beginPath();
  const rows=[];for(let yb=-h/2+6;yb+bd<=h/2-4;yb+=band){rows.push(yb);if(yb+bd+aisle+bd<=h/2-4)rows.push(yb+bd+aisle)}
  for(const yb of rows){for(let x=-w/2+8;x<=w/2-8;x+=bw){g.moveTo(x,yb);g.lineTo(x,yb+bd)}g.moveTo(-w/2+8,yb);g.lineTo(w/2-8,yb)}g.stroke();
  let n=0;for(const yb of rows)for(let x=-w/2+8;x+bw<=w/2-8;x+=bw,n++){if(hs(n,yb|0,s)<(mil?.5:.55)){const cx=x+bw/2,up=yb+bd/2,a=Math.PI/2+(hs(n,3,s)-.5)*.1;if(mil)milLot(g,cx,up,a,n,s);else car(g,cx,up,a,CAR_COL[hs(n,9,s)*CAR_COL.length|0],bd-6,bw-5)}}},
 pool(g,f){g.fillStyle='#d9d4c0';rrect(g,-f.w/2-9,-f.h/2-9,f.w+18,f.h+18,8);g.fill();g.fillStyle='#2f9fd3';rrect(g,-f.w/2,-f.h/2,f.w,f.h,6);g.fill();
  g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=1.5;g.beginPath();for(let x=-f.w/2+10;x<f.w/2;x+=14){g.moveTo(x,-f.h/2+3);g.quadraticCurveTo(x+4,0,x,f.h/2-3)}g.stroke();g.fillStyle='#fff';g.fillRect(-f.w/2+3,-f.h/2-5,3,8);g.fillRect(-f.w/2+9,-f.h/2-5,3,8)},
 court(g,f){g.fillStyle='#3d8b5c';g.fillRect(-f.w/2-8,-f.h/2-8,f.w+16,f.h+16);g.fillStyle='#b5523b';g.fillRect(-f.w/2,-f.h/2,f.w,f.h);g.strokeStyle='#fff';g.lineWidth=2;g.strokeRect(-f.w/2+6,-f.h/2+6,f.w-12,f.h-12);g.beginPath();g.moveTo(0,-f.h/2+6);g.lineTo(0,f.h/2-6);g.moveTo(-f.w/2+6,0);g.lineTo(f.w/2-6,0);g.stroke()},
 rail(g,f){pline(g,f.pts);g.lineCap='butt';g.strokeStyle='#4a3b2c';g.lineWidth=f.w+7;g.setLineDash([4,9]);g.stroke();g.setLineDash([]);for(const d of[-f.w*.32,f.w*.32]){pline(g,offs(f.pts,d));g.strokeStyle='#a9aeb4';g.lineWidth=1.6;g.stroke()}},
 pipe(g,f){pline(g,f.pts);g.lineJoin='round';g.lineCap='round';g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=f.w+4;g.save();g.translate(3,4);g.stroke();g.restore();g.strokeStyle='#3b4048';g.lineWidth=f.w;g.stroke();g.strokeStyle='#7c8590';g.lineWidth=f.w*.3;g.save();g.translate(-1.5,-1.5);g.stroke();g.restore();
  g.strokeStyle='#c8921a';g.lineWidth=f.w+1;g.setLineDash([3,60]);g.stroke();g.setLineDash([])},
 // corsia di servizio dentro un sito (percorso in coordinate mondo)
 lane(g,f){slabLanes(g,()=>pline(g,f.pts),f.w)},
 // recinzione leggera (solo disegno): rete metallica con paletti, lungo un poligono chiuso
 fence(g,f){const P=f.pts.concat([f.pts[0]]);g.lineJoin='miter';pline(g,P);g.strokeStyle='rgba(0,0,0,.28)';g.lineWidth=3;g.save();g.translate(1.5,2);g.stroke();g.restore();g.strokeStyle='rgba(190,196,204,.6)';g.lineWidth=1.3;g.setLineDash([2,3]);g.stroke();g.setLineDash([]);
  g.fillStyle='#22252a';for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.round(L/34));for(let k=0;k<n;k++)g.fillRect(a[0]+(b[0]-a[0])*k/n-1.5,a[1]+(b[1]-a[1])*k/n-1.5,3,3)}},
// isolato triangolare di città (smusso diagonale): piazzale a poligono, punti in coordinate mondo
 pslab(g,f){const P=f.pts,path=()=>{g.beginPath();P.forEach((q,i)=>i?g.lineTo(q[0],q[1]):g.moveTo(q[0],q[1]));g.closePath()};
  path();g.fillStyle='rgba(0,0,0,.25)';g.save();g.translate(3,3);g.fill();g.restore();g.fillStyle={0:'#484d55',1:'#666b72',4:'#69705f'}[f.t]||'#484d55';g.fill();
  let cx=0,cy=0;for(const q of P){cx+=q[0];cy+=q[1]}cx/=P.length;cy/=P.length;const r=Math.max(...P.map(q=>Math.hypot(q[0]-cx,q[1]-cy)));
  g.save();path();g.clip();g.translate(cx,cy);g.rotate(f.a||0);g.strokeStyle='rgba(0,0,0,.14)';g.lineWidth=1;g.beginPath();for(let x=-r;x<r;x+=38){g.moveTo(x,-r);g.lineTo(x,r);g.moveTo(-r,x);g.lineTo(r,x)}g.stroke();
  g.fillStyle='rgba(10,12,16,.07)';for(let i=0;i<3;i++){g.beginPath();g.ellipse((hs(i,5,cx|0)-.5)*r,(hs(i,6,cx|0)-.5)*r,10+hs(i,7,cx|0)*14,5+hs(i,8,cx|0)*8,hs(i,9,cx|0)*3,0,TAU);g.fill()}g.restore();
  path();g.strokeStyle='rgba(255,255,255,.12)';g.lineWidth=2;g.stroke()},
 // parco della villa: prato rasato a strisce, siepe di confine, viale di ghiaia dal cancello, fontana con aiuole, vialetti curvi, laghetto con ninfee e canne, panchine e lampioni
 vpark(g,f){const w=f.w,h=f.h,sx=f.sx||1,H=(i,k)=>hs(i,f.s|0,DC.seed+k),fo=f.fon,pd=f.pond,GR='#c9b98f',GRe='#8f7f58';
  g.fillStyle='#4f8442';g.fillRect(-w/2,-h/2,w,h);
  g.fillStyle='rgba(255,255,255,.05)';for(let u=-w/2,k=0;u<w/2;u+=28,k++)if(k%2)g.fillRect(u,-h/2,28,h);                                       // strisce del tosaerba
  g.fillStyle='rgba(30,80,30,.18)';for(let i=0;i<10;i++){g.beginPath();g.arc((H(i,1)-.5)*w,(H(i,2)-.5)*h,16+H(i,3)*26,0,TAU);g.fill()}
  g.strokeStyle='#2a5a2c';g.lineWidth=12;g.lineJoin='round';g.strokeRect(-w/2+8,-h/2+8,w-16,h-16);g.strokeStyle='rgba(120,190,90,.25)';g.lineWidth=3;g.strokeRect(-w/2+6,-h/2+6,w-12,h-12);   // siepe di confine
  g.fillStyle='#4f8442';g.fillRect(-26,h/2-16,52,16);                                                                                            // varco del cancello nella siepe
  const path=(pts,wd)=>{g.lineCap='round';g.lineJoin='round';g.beginPath();g.moveTo(pts[0][0],pts[0][1]);if(pts.length==3)g.quadraticCurveTo(pts[1][0],pts[1][1],pts[2][0],pts[2][1]);else g.lineTo(pts[1][0],pts[1][1]);
   g.strokeStyle=GRe;g.lineWidth=wd+4;g.stroke();g.strokeStyle=GR;g.lineWidth=wd;g.stroke()};
  // vialetti curvi verso piscina, tennis e laghetto (sotto il viale principale)
  path([[fo[0],fo[1]],[f.pool[0]*.5,fo[1]+30],[f.pool[0],f.pool[1]-40]],14);path([[fo[0],fo[1]],[f.court[0]*.5,fo[1]+30],[f.court[0],f.court[1]-42]],14);
  path([[fo[0]-sx*40,fo[1]-20],[pd[0]*.6,fo[1]-60],[pd[0]+sx*pd[2]*.7,pd[1]+pd[2]*.6]],12);
  path([[0,h/2],[0,fo[1]]],40);                                                                                                                   // viale dal cancello alla fontana
  g.strokeStyle='rgba(120,100,60,.35)';g.lineWidth=1;g.beginPath();for(let v=fo[1]+70;v<h/2;v+=10){g.moveTo(-18,v);g.lineTo(18,v+2)}g.stroke();       // ghiaia rastrellata
  // piazzola della fontana con 4 aiuole fiorite e bordo di bosso
  g.fillStyle=GRe;g.beginPath();g.arc(fo[0],fo[1],68,0,TAU);g.fill();g.fillStyle=GR;g.beginPath();g.arc(fo[0],fo[1],64,0,TAU);g.fill();
  const FL=['#e84d6a','#f2c94c','#bb6bd9','#ffffff','#f2994a','#6fcf97'];
  for(let q=0;q<4;q++){const a0=q*Math.PI/2+Math.PI/4;g.save();g.translate(fo[0],fo[1]);g.rotate(a0);g.fillStyle='#2f5d2f';g.beginPath();g.arc(0,0,58,-.5,.5);g.arc(0,0,38,.5,-.5,true);g.closePath();g.fill();
   g.fillStyle='#3d7a3a';g.beginPath();g.arc(0,0,55,-.45,.45);g.arc(0,0,41,.45,-.45,true);g.closePath();g.fill();
   for(let k=0;k<14;k++){const t=-.4+H(q*20+k,4)*.8,r=42+H(q*20+k,5)*12;g.fillStyle=FL[(H(q*20+k,6)*FL.length)|0];g.beginPath();g.arc(Math.cos(t)*r,Math.sin(t)*r,1.8,0,TAU);g.fill()}g.restore()}
  g.fillStyle='#8e8a80';g.beginPath();g.arc(fo[0],fo[1],30,0,TAU);g.fill();g.fillStyle='#2f7da0';g.beginPath();g.arc(fo[0],fo[1],25,0,TAU);g.fill();     // fontana
  g.strokeStyle='rgba(210,240,250,.55)';g.lineWidth=1.2;for(const r of[9,15,21]){g.beginPath();g.arc(fo[0],fo[1],r,0,TAU);g.stroke()}
  g.fillStyle='#b8b3a6';g.beginPath();g.arc(fo[0],fo[1],6,0,TAU);g.fill();g.fillStyle='rgba(255,255,255,.85)';g.beginPath();g.arc(fo[0],fo[1],3,0,TAU);g.fill();
  for(const sd of[-1,1]){g.save();g.translate(fo[0]+sd*76,fo[1]+46);g.fillStyle='#6b4a2a';g.fillRect(-10,-3,20,6);g.fillStyle='#3a2a18';g.fillRect(-10,-3,20,1.5);g.restore()}   // panchine
  for(let v=fo[1]+90;v<h/2-10;v+=72)for(const sd of[-1,1]){g.fillStyle='#2b2e33';g.beginPath();g.arc(sd*24,v,2.5,0,TAU);g.fill();g.fillStyle='#fff3c0';g.beginPath();g.arc(sd*24,v,1.5,0,TAU);g.fill()}   // lampioni del viale
  // laghetto: sponda di sassi, acqua, riflessi, ninfee, canne
  const N=26,R0=pd[2],shape=k=>{g.beginPath();for(let i=0;i<=N;i++){const t=i/N*TAU,r=R0*k*(1+.14*Math.sin(t*3+H(1,7)*6)+.07*Math.sin(t*5+H(2,7)*6));g.lineTo(pd[0]+Math.cos(t)*r*1.25,pd[1]+Math.sin(t)*r)}g.closePath()};
  shape(1.12);g.fillStyle='#8a8578';g.fill();shape(1);g.fillStyle='#2c6f86';g.fill();shape(.7);g.fillStyle='rgba(20,60,80,.35)';g.fill();
  g.strokeStyle='rgba(200,235,245,.35)';g.lineWidth=1.2;for(let i=0;i<3;i++){g.beginPath();g.ellipse(pd[0]+(H(i,8)-.5)*R0,pd[1]+(H(i,9)-.5)*R0*.6,8+H(i,10)*8,2.5,0,0,TAU);g.stroke()}
  for(let i=0;i<6;i++){const t=H(i,11)*TAU,r=R0*(.3+H(i,12)*.45),x=pd[0]+Math.cos(t)*r*1.2,y=pd[1]+Math.sin(t)*r;g.fillStyle='#4f9a4a';g.beginPath();g.arc(x,y,4+H(i,13)*3,.4,TAU-.2);g.lineTo(x,y);g.fill();if(H(i,14)<.4){g.fillStyle='#f5b7c9';g.beginPath();g.arc(x+1,y-1,1.8,0,TAU);g.fill()}}
  g.strokeStyle='#5f7f3a';g.lineWidth=1.3;g.beginPath();for(let i=0;i<14;i++){const t=H(i,15)*TAU,x=pd[0]+Math.cos(t)*R0*1.2,y=pd[1]+Math.sin(t)*R0*.97;g.moveTo(x,y);g.lineTo(x+(H(i,16)-.5)*4,y-6-H(i,17)*5)}g.stroke();
  // aiuola lungo la facciata della casa
  for(let k=0;k<26;k++){const u=-w*.28+k*(w*.56/25);if(Math.abs(u)<28)continue;g.fillStyle=FL[(H(k,18)*FL.length)|0];g.beginPath();g.arc(u,-h*.22+108+(H(k,19)-.5)*6,2.2,0,TAU);g.fill()}},
 // bancarelle del mercato su una piazza tonda: stesso livello della piazza (strade e acqua ci passano sopra)
 market(g,f){SCN.market(g,f)},
 // ===== decorazioni proprie dei tipi di sito (AGmap.js: FILL.motorpool, range, drill, basins, transformer, stockpile, launchpad; canal e hvline sono fatti di punti) =====
 // parcheggio dei mezzi militari: asfalto scuro, stalli dipinti, una fila di carri e (se c'è posto) una di navicelle
 motorpool(g,f){const w=f.w,h=f.h,H=(i,k)=>hs(i,f.s|0,DC.seed+k),rows=h>=150?2:1,rh=(h-10)/rows;
  g.fillStyle='rgba(0,0,0,.25)';g.fillRect(-w/2-3,-h/2-3,w+6,h+6);g.fillStyle='#2c3128';g.fillRect(-w/2,-h/2,w,h);
  g.fillStyle='rgba(255,255,255,.04)';for(let i=0;i<8;i++){g.beginPath();g.ellipse((H(i,1)-.5)*w,(H(i,2)-.5)*h,10+H(i,3)*16,5+H(i,4)*8,H(i,5)*3,0,TAU);g.fill()}
  g.strokeStyle='#c9a227';g.lineWidth=3;g.setLineDash([12,8]);g.strokeRect(-w/2+4,-h/2+4,w-8,h-8);g.setLineDash([]);
  for(let r=0;r<rows;r++){const ships=rows==2?r==1:H(0,6)<.3,bw=ships?80:36,cy=-h/2+5+rh*(r+.5),n=Math.max(1,Math.floor((w-14)/bw)),x0=-n*bw/2;
   g.strokeStyle='rgba(235,235,225,.55)';g.lineWidth=1.5;g.beginPath();for(let i=0;i<=n;i++){g.moveTo(x0+i*bw,cy-rh/2+7);g.lineTo(x0+i*bw,cy+rh/2-7)}g.moveTo(x0,cy+rh/2-7);g.lineTo(x0+n*bw,cy+rh/2-7);g.stroke();
   for(let i=0;i<n;i++){if(H(i+r*20,7)>.8)continue;const x=x0+(i+.5)*bw;
    if(ships)V(g,['drop','gunship','shuttle','lander','fighter'][(H(i+r*20,8)*5)|0],x,cy,-Math.PI/2+(H(i,9)-.5)*.1,GRY_COL[(H(i,10)*3)|0],Math.min(1,rh/82));
    else V(g,['mbt','mbt','heavy','apc','spg','scout'][(H(i+r*20,8)*6)|0],x,cy,-Math.PI/2+(H(i,9)-.5)*.08,MIL_COL[(H(i,10)*5)|0],Math.min(1,rh/60))}}},
 // poligono di tiro: tettoia della linea di tiro (lato -w), corsie, distanze tratteggiate, bersagli davanti al terrapieno (lato +w, il terrapieno è un muro vero)
 range(g,f){const w=f.w,h=f.h,H=(i,k)=>hs(i,f.s|0,DC.seed+k),n=clamp(Math.floor(h/34),2,8),lh2=h/n;
  g.fillStyle='rgba(0,0,0,.2)';g.fillRect(-w/2-3,-h/2-3,w+6,h+6);g.fillStyle='#8c7c56';g.fillRect(-w/2,-h/2,w,h);
  g.fillStyle='rgba(60,45,25,.3)';for(let i=0;i<12;i++){g.beginPath();g.ellipse((H(i,1)-.5)*w,(H(i,2)-.5)*h,8+H(i,3)*14,4+H(i,4)*6,H(i,5)*3,0,TAU);g.fill()}
  g.strokeStyle='rgba(245,245,235,.6)';g.lineWidth=1.5;g.beginPath();for(let i=1;i<n;i++){const y=-h/2+i*lh2;g.moveTo(-w/2+30,y);g.lineTo(w/2-28,y)}g.stroke();
  g.setLineDash([4,6]);g.beginPath();for(let d=.25;d<1;d+=.25){const x=-w/2+30+(w-58)*d;g.moveTo(x,-h/2+3);g.lineTo(x,h/2-3)}g.stroke();g.setLineDash([]);
  for(let i=0;i<n;i++){const y=-h/2+(i+.5)*lh2,x=w/2-34;g.fillStyle='rgba(0,0,0,.3)';g.beginPath();g.arc(x+2,y+2,7.5,0,TAU);g.fill();
   for(const[r,c]of[[7.5,'#f4f1e8'],[5,'#c0392b'],[2.5,'#f4f1e8']]){g.fillStyle=c;g.beginPath();g.arc(x,y,r,0,TAU);g.fill()}}
  g.fillStyle='#384432';g.fillRect(-w/2,-h/2,28,h);g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=1;g.beginPath();for(let i=1;i<n;i++){const y=-h/2+i*lh2;g.moveTo(-w/2,y);g.lineTo(-w/2+28,y)}g.stroke();
  g.fillStyle='#c9a227';g.fillRect(-w/2+28,-h/2,3,h)},
 // campo di addestramento: prato, pista d'atletica, percorso a ostacoli (muretti, pneumatici, sbarre) e torre di arrampicata
 drill(g,f){const w=f.w,h=f.h,rx=w/2-8,ry=h/2-8,tr=Math.min(16,ry*.24);
  g.fillStyle='#55683b';g.fillRect(-w/2,-h/2,w,h);g.strokeStyle='rgba(30,50,20,.25)';g.lineWidth=6;g.beginPath();for(let x=-w/2+8;x<w/2;x+=16){g.moveTo(x,-h/2);g.lineTo(x,h/2)}g.stroke();
  g.lineWidth=tr;g.strokeStyle='#9a5a3c';g.beginPath();g.ellipse(0,0,rx-tr/2,ry-tr/2,0,0,TAU);g.stroke();g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=1;
  for(const k of[0,.5])if(tr>8){g.beginPath();g.ellipse(0,0,rx-tr*(.25+k),ry-tr*(.25+k),0,0,TAU);g.stroke()}
  const iw=(rx-tr)*1.25,n=6,ih=(ry-tr)*.7;
  for(let i=0;i<n;i++){const x=-iw/2+(i+.5)*iw/n,k=i%3;
   if(k==0){g.fillStyle='rgba(0,0,0,.3)';g.fillRect(x-1,-ih/2+2,6,ih);g.fillStyle='#7a5a36';g.fillRect(x-3,-ih/2,6,ih)}
   else if(k==1){g.strokeStyle='#1e1e1e';g.lineWidth=3;for(const yy of[-ih*.3,0,ih*.3])for(const xx of[-5,5]){g.beginPath();g.arc(x+xx,yy,4.5,0,TAU);g.stroke()}}
   else{g.strokeStyle='#8a8f96';g.lineWidth=2;g.beginPath();for(const yy of[-ih*.35,ih*.35]){g.moveTo(x-8,yy);g.lineTo(x+8,yy)}g.moveTo(x-8,-ih*.35);g.lineTo(x-8,ih*.35);g.moveTo(x+8,-ih*.35);g.lineTo(x+8,ih*.35);g.stroke()}}
  g.fillStyle='rgba(0,0,0,.3)';g.fillRect(rx-tr-14,-9,18,22);g.fillStyle='#6b4a2a';g.fillRect(rx-tr-16,-11,18,22);g.strokeStyle='#3a2a14';g.lineWidth=1;g.strokeRect(rx-tr-16,-11,18,22);g.beginPath();g.moveTo(rx-tr-16,-11);g.lineTo(rx-tr+2,11);g.moveTo(rx-tr+2,-11);g.lineTo(rx-tr-16,11);g.stroke()},
 // vasche di raffreddamento: bordo in cemento, 2-3 vasche d'acqua con increspature, passerelle fra una vasca e l'altra
 basins(g,f){const w=f.w,h=f.h,n=w>h*1.6?3:2,gp=14,bw=(w-gp*(n+1))/n,bh=h-2*gp;
  g.fillStyle='rgba(0,0,0,.25)';g.fillRect(-w/2-3,-h/2-3,w+6,h+6);g.fillStyle='#8a8f96';g.fillRect(-w/2,-h/2,w,h);
  for(let i=0;i<n;i++){const x=-w/2+gp+i*(bw+gp),y=-h/2+gp;g.fillStyle='#174a5c';g.fillRect(x,y,bw,bh);g.fillStyle='#2a7891';g.fillRect(x+4,y+4,bw-8,bh-8);
   g.strokeStyle='rgba(220,245,255,.3)';g.lineWidth=1;g.beginPath();for(let yy=y+12;yy<y+bh-6;yy+=12){g.moveTo(x+8,yy);g.quadraticCurveTo(x+bw/2,yy-4,x+bw-8,yy)}g.stroke();
   g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=1.5;g.strokeRect(x,y,bw,bh)}
  g.fillStyle='#5d636b';for(let i=1;i<n;i++){const x=-w/2+i*(bw+gp)+gp/2;g.fillRect(x-4,-h/2+gp+bh*.2,8,bh*.6)}},
 // canale di scolo: acqua fra due bordi in cemento, con la corrente tratteggiata
 canal(g,f){g.lineJoin='round';g.lineCap='butt';pline(g,f.pts);g.strokeStyle='rgba(0,0,0,.25)';g.lineWidth=f.w+12;g.stroke();g.strokeStyle='#7d838b';g.lineWidth=f.w+8;g.stroke();
  g.strokeStyle='#1f5a6e';g.lineWidth=f.w;g.stroke();g.strokeStyle='rgba(200,240,255,.3)';g.lineWidth=2;g.setLineDash([10,14]);g.stroke();g.setLineDash([])},
 // piazzale dei trasformatori: ghiaia, recinto tratteggiato, file di trasformatori con alette e isolatori, sbarre di collegamento in rame
 transformer(g,f){const w=f.w,h=f.h,nx=Math.max(1,Math.floor((w-24)/48)),ny=Math.max(1,Math.floor((h-24)/60));
  g.fillStyle='#78756d';g.fillRect(-w/2,-h/2,w,h);g.fillStyle='rgba(0,0,0,.1)';for(let i=0;i<60;i++)g.fillRect((hs(i,1,f.x|0)-.5)*w,(hs(i,2,f.x|0)-.5)*h,2,2);
  for(let j=0;j<ny;j++){const y=-h/2+12+(j+.5)*(h-24)/ny;g.strokeStyle='#b07a2a';g.lineWidth=2;g.beginPath();g.moveTo(-w/2+12,y-22);g.lineTo(w/2-12,y-22);g.stroke();
   for(let i=0;i<nx;i++){const x=-w/2+12+(i+.5)*(w-24)/nx;g.fillStyle='rgba(0,0,0,.3)';g.fillRect(x-12,y-14,28,34);g.fillStyle='#5d666f';g.fillRect(x-14,y-16,28,34);
    g.strokeStyle='#2b3036';g.lineWidth=1;g.strokeRect(x-14,y-16,28,34);g.beginPath();for(let k=-10;k<=10;k+=5){g.moveTo(x+k,y-16);g.lineTo(x+k,y+18)}g.stroke();
    g.fillStyle='#d9d4c0';for(const k of[-7,0,7]){g.beginPath();g.arc(x+k,y-21,2.5,0,TAU);g.fill()}}}
  g.strokeStyle='rgba(215,220,225,.75)';g.lineWidth=1.5;g.setLineDash([4,3]);g.strokeRect(-w/2+3,-h/2+3,w-6,h-6);g.setLineDash([]);
  g.fillStyle='#e6b422';g.beginPath();g.moveTo(-w/2+10,h/2-6);g.lineTo(-w/2+18,h/2-20);g.lineTo(-w/2+26,h/2-6);g.closePath();g.fill()},
 // linea di alta tensione: tre cavi (con ombra) e un traliccio a ogni punto
 hvline(g,f){const P=f.pts,dir=i=>{const a=P[Math.min(i+1,P.length-1)],b=P[Math.max(i-1,0)];return Math.atan2(a[1]-b[1],a[0]-b[0])};g.lineCap='round';
  for(const[ox,oy,col,lw]of[[5,7,'rgba(0,0,0,.22)',1.4],[0,0,'#191b1e',1.2]])for(const o of[-9,0,9]){g.strokeStyle=col;g.lineWidth=lw;g.beginPath();
   P.forEach((p,i)=>{const t=dir(i),x=p[0]-Math.sin(t)*o+ox,y=p[1]+Math.cos(t)*o+oy;i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke()}
  for(let i=0;i<P.length;i++){g.save();g.translate(P[i][0],P[i][1]);g.rotate(dir(i));g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-5,-6,14,16);
   g.strokeStyle='#4a5058';g.lineWidth=2;g.strokeRect(-7,-7,14,14);g.beginPath();g.moveTo(-7,-7);g.lineTo(7,7);g.moveTo(7,-7);g.lineTo(-7,7);g.moveTo(0,-13);g.lineTo(0,13);g.stroke();
   g.fillStyle='#d9d4c0';for(const k of[-9,0,9]){g.beginPath();g.arc(0,k,2.2,0,TAU);g.fill()}g.restore()}},
 // cumuli di materie prime grezze (carbone, ghiaia, sabbia, minerale di ferro, calcare) in box di cemento, col nastro trasportatore che li carica:
 // ogni cumulo ha sagoma irregolare, strati dal piede scuro al colmo chiaro (luce da nord-ovest), solchi di erosione, massi e ghiaia sparsa, tracce della pala
 stockpile(g,f){const w=f.w,h=f.h,H=(i,k)=>hs(i,f.s|0,DC.seed+k),n=w>h*1.4?3:2,bw=w/n;
  const MAT=[['#18181b','#2b2b30','#4a4a52','#666670'],['#5f5a4e','#8a8474','#b3ad9a','#d2ccb8'],['#7e6340','#b38f5c','#d9b98a','#ecd9b2'],['#4a2618','#7a422b','#a8653f','#c98a63'],['#666b70','#9aa0a6','#c4c9ce','#e3e6e9']];
  const m0=(H(0,1)*MAT.length)|0;
  g.fillStyle='rgba(40,36,30,.38)';g.fillRect(-w/2,-h/2,w,h);                                                            // piazzale di stoccaggio
  g.fillStyle='rgba(0,0,0,.18)';for(let i=0;i<14;i++){g.beginPath();g.ellipse((H(i,40)-.5)*w,(H(i,41)-.5)*h,6+H(i,42)*16,3+H(i,43)*6,H(i,44)*3,0,TAU);g.fill()}   // macchie
  for(let i=1;i<n;i++){const x=-w/2+i*bw;g.fillStyle='rgba(0,0,0,.3)';g.fillRect(x-1,-h/2+6,7,h*.62);g.fillStyle='#8a867e';g.fillRect(x-3,-h/2+4,6,h*.62);g.fillStyle='#a6a29a';g.fillRect(x-3,-h/2+4,2,h*.62)}   // muri dei box
  const blob=(cx,cy,rx,ry,sd)=>{g.beginPath();const N=26;for(let i=0;i<=N;i++){const t=i/N*TAU,r=1+.13*Math.sin(t*3+H(sd,2)*6)+.08*Math.sin(t*5+H(sd,3)*6)+.05*Math.sin(t*9+H(sd,4)*6);g.lineTo(cx+Math.cos(t)*rx*r,cy+Math.sin(t)*ry*r)}g.closePath()};
  const tops=[];
  for(let i=0;i<n;i++){const M2=MAT[H(i,5)<.3?(H(i,6)*MAT.length)|0:m0],cx=-w/2+(i+.5)*bw+(H(i,7)-.5)*bw*.12,cy=(H(i,8)-.5)*h*.1+h*.04,rx=bw*.43,ry=h*.4,tx=cx-rx*.18,ty=cy-ry*.22;tops.push([tx,ty]);
   g.fillStyle='rgba(0,0,0,.32)';blob(cx+6,cy+8,rx,ry,i*7);g.fill();                                                  // ombra
   for(let j=0;j<34;j++){const t=H(i*50+j,9)*TAU,d=.92+H(i*50+j,10)*.3,sz=1.5+H(i*50+j,11)*3;g.fillStyle=M2[j%3==0?3:j%3==1?1:0];g.fillRect(cx+Math.cos(t)*rx*d,cy+Math.sin(t)*ry*d,sz,sz*.8)}   // ghiaia sparsa al piede
   [[1,0],[.84,1],[.62,1],[.42,2],[.2,3]].forEach(([k,c],l)=>{g.fillStyle=l==2?`rgba(255,255,255,.08)`:M2[c];blob(tx+(cx-tx)*k,ty+(cy-ty)*k,rx*k,ry*k,i*7+l+1);g.fill()});   // strati: piede scuro, colmo chiaro
   g.strokeStyle='rgba(0,0,0,.22)';g.lineWidth=1.2;for(let j=0;j<11;j++){const t=j/11*TAU+H(i*20+j,12)*.35;g.beginPath();g.moveTo(tx+Math.cos(t)*rx*.16,ty+Math.sin(t)*ry*.16);g.quadraticCurveTo(tx+Math.cos(t+.15)*rx*.55,ty+Math.sin(t+.15)*ry*.55,cx+Math.cos(t)*rx*.92,cy+Math.sin(t)*ry*.92);g.stroke()}   // solchi di erosione
   for(let j=0;j<7;j++){const t=H(i*30+j,13)*TAU,d=.3+H(i*30+j,14)*.6,x=tx+(cx-tx)*d+Math.cos(t)*rx*d,y=ty+(cy-ty)*d+Math.sin(t)*ry*d,r=2.5+H(i*30+j,15)*4.5;
    g.fillStyle=M2[3];g.beginPath();for(let q=0;q<6;q++){const a=q/6*TAU+H(j,16),rq=r*(.7+H(j*6+q,17)*.5);g.lineTo(x+Math.cos(a)*rq,y+Math.sin(a)*rq)}g.closePath();g.fill();g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=.8;g.stroke()}   // massi
   if(H(i,18)<.6){const sx=cx+rx*.55,sy=cy+ry*.7;g.strokeStyle='rgba(0,0,0,.18)';g.lineWidth=3;g.setLineDash([2,3]);for(const o of[-5,5]){g.beginPath();g.moveTo(sx+o,sy+h*.3);g.quadraticCurveTo(sx+o+10,sy+10,sx+o-4,sy);g.stroke()}g.setLineDash([])}}   // tracce della pala
  // nastro trasportatore: tramoggia sul bordo, telaio con sostegni, nastro e rulli; scarica sul colmo del primo cumulo
  const A=[-w/2-4,-h/2+4],B=tops[0],L=Math.hypot(B[0]-A[0],B[1]-A[1]),an=Math.atan2(B[1]-A[1],B[0]-A[0]);
  g.save();g.translate(A[0],A[1]);g.rotate(an);
  g.fillStyle='rgba(0,0,0,.3)';g.fillRect(4,2,L,12);
  for(let x=10;x<L-6;x+=20){g.fillStyle='#2a2d33';g.fillRect(x-2,-8,4,16)}                                                 // sostegni
  g.fillStyle='#3a3e45';g.fillRect(0,-5,L,10);g.fillStyle='#1d1f23';g.fillRect(0,-3,L,6);
  g.strokeStyle='#8d949c';g.lineWidth=1.2;g.setLineDash([2,5]);g.beginPath();g.moveTo(0,0);g.lineTo(L,0);g.stroke();g.setLineDash([]);
  g.fillStyle=MAT[m0][2];for(let x=6;x<L-4;x+=9){g.fillRect(x,-2,4,3)}                                                      // materiale sul nastro
  g.restore();
  g.fillStyle='#4a4f57';g.fillRect(A[0]-11,A[1]-11,22,22);g.fillStyle='#1d1f23';g.fillRect(A[0]-7,A[1]-7,14,14);g.strokeStyle='#e6b422';g.lineWidth=1.5;g.strokeRect(A[0]-11,A[1]-11,22,22);   // tramoggia
  if(H(9,19)<.75){const p=tops[n-1],x=p[0]+bw*.32,y=p[1]+h*.3;g.save();g.translate(x,y);g.rotate(-2.2+H(9,20));                                                 // pala gommata
   g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-9,-5,22,14);g.fillStyle='#d9a400';g.fillRect(-11,-6,20,12);g.fillStyle='#2b2b30';g.fillRect(-4,-4,7,8);g.fillStyle='#7b8088';g.fillRect(9,-8,5,16);g.restore()}},
 // rampa di lancio: cerchio di cemento, anello di sicurezza, bruciature, fossa dei gas di scarico, condotte del carburante e torri di servizio
 // bacino della nave spaziale (spazioporto): telaio d'acciaio, guide gialle tratteggiate e passerelle. È disegno a terra: la nave (ostacolo) ci sta sopra,
 // e nella visuale termica non compare (prima faceva parte dello sprite della nave, vedi AGart.js)
 drydock(g,f){const hw=f.w/2,hh=f.h/2;g.lineCap='butt';
  g.strokeStyle='#21262d';g.lineWidth=14;g.strokeRect(-hw-10,-hh-10,f.w+20,f.h+20);
  g.strokeStyle='#e6b422';g.lineWidth=3;g.setLineDash([16,14]);g.strokeRect(-hw-10,-hh-10,f.w+20,f.h+20);g.setLineDash([]);
  g.strokeStyle='#4b5363';g.lineWidth=4;g.beginPath();
  for(let x=-hw*.7;x<=hw*.7;x+=55){g.moveTo(x,-hh-10);g.lineTo(x,-hh*.42);g.moveTo(x,hh+10);g.lineTo(x,hh*.42)}g.stroke()},
 launchpad(g,f){const r=f.r;g.fillStyle='rgba(0,0,0,.25)';g.beginPath();g.arc(3,4,r,0,TAU);g.fill();g.fillStyle='#71767d';g.beginPath();g.arc(0,0,r,0,TAU);g.fill();
  const gr=g.createRadialGradient(0,0,r*.08,0,0,r*.78);gr.addColorStop(0,'rgba(12,10,8,.85)');gr.addColorStop(1,'rgba(12,10,8,0)');g.fillStyle=gr;g.beginPath();g.arc(0,0,r*.78,0,TAU);g.fill();
  g.strokeStyle='#d9b300';g.lineWidth=4;g.setLineDash([14,10]);g.beginPath();g.arc(0,0,r-8,0,TAU);g.stroke();g.setLineDash([]);
  g.fillStyle='#24272c';g.fillRect(-r*.16,r*.12,r*.32,r*.84);g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=1;g.strokeRect(-r*.16,r*.12,r*.32,r*.84);
  g.strokeStyle='#c0392b';g.lineWidth=3;g.beginPath();g.moveTo(-r,-r*.3);g.lineTo(-r*.3,-r*.3);g.moveTo(r,-r*.3);g.lineTo(r*.3,-r*.3);g.stroke();
  for(const[x,y]of[[-r*.55,-r*.55],[r*.55,-r*.55]]){g.fillStyle='rgba(0,0,0,.3)';g.fillRect(x-6,y-6,16,16);g.fillStyle='#8d949c';g.fillRect(x-8,y-8,16,16);g.strokeStyle='#2c3036';g.lineWidth=1;g.strokeRect(x-8,y-8,16,16);g.beginPath();g.moveTo(x-8,y-8);g.lineTo(x+8,y+8);g.stroke()}},
 // cortile di deposito: fondo scuro, bordo di sicurezza, stalli numerati
 yard(g,f){const w=f.w,h=f.h;g.fillStyle='rgba(14,16,20,.3)';g.fillRect(-w/2,-h/2,w,h);g.strokeStyle='rgba(217,179,0,.7)';g.lineWidth=3;g.setLineDash([10,8]);g.strokeRect(-w/2+3,-h/2+3,w-6,h-6);g.setLineDash([]);
  g.strokeStyle='rgba(235,235,235,.3)';g.lineWidth=1.4;g.beginPath();for(let x=-w/2+34;x<w/2-10;x+=34){g.moveTo(x,-h/2+8);g.lineTo(x,-h/2+34);g.moveTo(x,h/2-8);g.lineTo(x,h/2-34)}g.stroke();
  for(let i=0;i<5;i++){g.fillStyle='rgba(5,5,8,.14)';g.beginPath();g.ellipse((hs(i,1,f.s)-.5)*w*.8,(hs(i,2,f.s)-.5)*h*.8,8+hs(i,3,f.s)*14,5+hs(i,4,f.s)*8,hs(i,5,f.s)*3,0,TAU);g.fill()}},
 // cava: fossa a gradoni irregolari, sempre più scura verso il fondo, con rampa a spirale e pozza
 pit(g,f){const R0=f.r,N=28,ring=k=>{g.beginPath();for(let i=0;i<=N;i++){const t=i/N*TAU,r=R0*k*(1+.16*Math.sin(t*3+hs(1,2,f.s)*6)+.08*Math.sin(t*7+hs(3,4,f.s)*6)+.05*Math.sin(t*13+k*9));g.lineTo(Math.cos(t)*r,Math.sin(t)*r)}g.closePath()};
  const C=['#8f8773','#7d7563','#6b6354','#585145','#454038','#34302b'];
  ring(1.08);g.fillStyle='rgba(0,0,0,.25)';g.fill();
  [1,.82,.64,.47,.31,.17].forEach((k,i)=>{ring(k);g.fillStyle=C[i];g.fill();g.strokeStyle='rgba(20,18,14,.45)';g.lineWidth=2;g.stroke();g.save();g.translate(-2,-3);g.strokeStyle='rgba(255,245,215,.16)';g.lineWidth=1.5;ring(k);g.stroke();g.restore()});
  g.strokeStyle='#a39a82';g.lineWidth=11;g.lineCap='round';g.beginPath();for(let t=0;t<=1;t+=.04){const a=t*4.4+1,r=R0*(1-.84*t);g.lineTo(Math.cos(a)*r,Math.sin(a)*r)}g.stroke();   // rampa
  g.strokeStyle='rgba(60,54,42,.5)';g.lineWidth=1.2;g.setLineDash([5,7]);g.stroke();g.setLineDash([]);
  g.fillStyle='#2f6470';g.beginPath();g.ellipse(R0*.03,R0*.02,R0*.1,R0*.07,.5,0,TAU);g.fill();
  if(f.cv){const P=[[R0*.12,0],[R0*.6,-20],[R0+40,-40]];g.lineCap='round';g.lineJoin='round';const ln=(c,wd,dx,dy)=>{g.beginPath();P.forEach((q,i)=>i?g.lineTo(q[0]+dx,q[1]+dy):g.moveTo(q[0]+dx,q[1]+dy));g.strokeStyle=c;g.lineWidth=wd;g.stroke()};   // nastro dal fondo della fossa al frantoio
   ln('rgba(0,0,0,.3)',14,3,4);ln('#3a3e45',11,0,0);ln('#1d1f23',6,0,0);g.setLineDash([2,5]);ln('#8d949c',1.2,0,0);g.setLineDash([]);
   for(const q of P){g.fillStyle='#2a2d33';g.fillRect(q[0]-5,q[1]-5,10,10)}}}};
// pavimentazione intorno agli edifici
// pavimentazione intorno agli edifici (marciapiede, piazzale, aia o giardino a seconda di o.fz); isole separate (set: 0 terraferma, 1 isole)
function pForecourt(g,x0,y0,isle){const a=DC.OI.get(Math.floor(x0/CH)*64+Math.floor(y0/CH));if(!a)return;
 for(const o of a){if(o.t!='b'||o.sp||o.rb||o.nfz||o.ty!='house'||!!o.is!==!!isle)continue;g.save();g.translate(o.x,o.y);g.rotate(o.a);   // nfz: niente piazzale (es. tribuna coperta dell'arena)
  const fz=o.fz||1;
  const base=fz==4?'#6f9a58':slabTone(o.x,o.y)[0];   // stesso colore dello slab dell'edificio (giardino delle isole escluso)
  const exp=6*(1+hs(o.id|0,3,DC.seed)*2);   // 6 … 18
  g.lineJoin='round';
  // base del piazzale (niente stroke / bordo)
  for(const q of o.pr){qp(g,q,-exp);g.fillStyle=base;g.fill()}
  // macchie di colore / usura
  const sd=(o.id|0)*19+5;
  for(let i=0;i<6;i++){
   if(hs(i,sd,DC.seed)<.35)continue;
   const ang=hs(i,sd,DC.seed+1)*TAU;
   const dist=o.r*(.3+hs(i,sd,DC.seed+2)*.7)+exp*hs(i,sd,DC.seed+3);
   const ox=Math.cos(ang)*dist,oy=Math.sin(ang)*dist;
   const rw=8+hs(i,sd,DC.seed+4)*22,rh=6+hs(i,sd,DC.seed+5)*16;
   g.save();g.translate(ox,oy);g.rotate(hs(i,sd,DC.seed+6)*TAU);
   g.fillStyle=hs(i,sd,DC.seed+7)<.5?'rgba(0,0,0,.08)':'rgba(255,255,255,.07)';
   g.beginPath();g.ellipse(0,0,rw,rh,0,0,TAU);g.fill();
   g.restore();
  }
  // stradine / corsie sul piazzale
  for(let i=0;i<3;i++){
   if(hs(i,sd,DC.seed+10)<.4)continue;
   const ang=hs(i,sd,DC.seed+11)*TAU;
   const len=o.r*(.6+hs(i,sd,DC.seed+12)*.8)+exp;
   const c=Math.cos(ang),s=Math.sin(ang);
   g.strokeStyle='rgba(55,58,62,.35)';g.lineWidth=5+hs(i,sd,DC.seed+13)*6;
   g.beginPath();g.moveTo(-c*len*.5,-s*len*.5);g.lineTo(c*len*.5,s*len*.5);g.stroke();
   g.strokeStyle='rgba(200,205,210,.2)';g.lineWidth=1.5;
   g.beginPath();g.moveTo(-c*len*.5,-s*len*.5);g.lineTo(c*len*.5,s*len*.5);g.stroke();
  }
  // griglia leggera solo se cementato urbano
  if(fz==1){
   g.strokeStyle='rgba(255,255,255,.10)';g.lineWidth=1;
   for(const q of o.pr)if(q.k=='r'){
    g.beginPath();
    for(let x=q.x-q.a-exp;x<q.x+q.a+exp;x+=20){g.moveTo(x,q.y-q.b-exp);g.lineTo(x,q.y+q.b+exp)}
    for(let y=q.y-q.b-exp;y<q.y+q.b+exp;y+=20){g.moveTo(q.x-q.a-exp,y);g.lineTo(q.x+q.a+exp,y)}
    g.stroke();
   }
  }
  // piccole crepe
  for(let i=0;i<4;i++){
   if(hs(i,sd,DC.seed+20)<.45)continue;
   const ang=hs(i,sd,DC.seed+21)*TAU;
   const dist=o.r*(.4+hs(i,sd,DC.seed+22)*.5);
   let x=Math.cos(ang)*dist,y=Math.sin(ang)*dist;
   g.strokeStyle='rgba(20,22,26,.25)';g.lineWidth=1;
   g.beginPath();g.moveTo(x,y);
   for(let k=0;k<3;k++){x+=(hs(i,k,sd)-.5)*14;y+=(hs(i,k+4,sd)-.5)*12;g.lineTo(x,y)}
   g.stroke();
  }
  g.restore()}}

function pForecourtDetails(g,x0,y0,isle){const a=DC.OI.get(Math.floor(x0/CH)*64+Math.floor(y0/CH));if(!a)return;
 for(const o of a){if(o.t!='b'||o.sp||o.rb||o.nfz||o.ty!='house'||!!o.is!==!!isle)continue;g.save();g.translate(o.x,o.y);g.rotate(o.a);
  const exp=12*(1+hs(o.id,3,DC.seed)*2);
  const sd=o.id*17+3;
  const nObj=4+((hs(0,sd,DC.seed+9)*4)|0);
  for(let i=0;i<nObj;i++){
   if(hs(i,sd,DC.seed)<.25)continue;
   const ang=hs(i,sd,DC.seed+1)*TAU;
   // nella fascia del piazzale: tra bordo edificio e bordo piazzale
   const dist=o.r + exp*(0.55+hs(i,sd,DC.seed+5)*0.9);
   const ox=Math.cos(ang)*dist, oy=Math.sin(ang)*dist;
   const kind=(hs(i,sd,DC.seed+2)*10)|0;
   g.save();g.translate(ox,oy);g.rotate(hs(i,sd,DC.seed+3)*TAU);
   if(kind<=1) car(g,0,0,0,CAR_COL[(hs(i,sd,DC.seed+4)*CAR_COL.length)|0],18+hs(i,sd,DC.seed+6)*6,8);
   else if(kind===2) truck(g,0,0,0,CAR_COL[(hs(i,sd,DC.seed+4)*CAR_COL.length)|0],28,11);
   else if(kind===3){g.fillStyle='rgba(0,0,0,.2)';g.beginPath();g.ellipse(1,2,7,5,0,0,TAU);g.fill();g.fillStyle=hs(i,sd,DC.seed+7)<.5?'#2f6b2e':'#3f8a3a';g.beginPath();g.ellipse(0,0,7,5,0,0,TAU);g.fill()}
   else if(kind===4){g.fillStyle='#22252a';g.fillRect(-1.2,-10,2.4,12);g.beginPath();g.arc(0,-11,2.6,0,TAU);g.fill();g.fillStyle='#fff6d8';g.beginPath();g.arc(0,-11,1.4,0,TAU);g.fill()}
   else if(kind===5){g.fillStyle='#3a4048';g.fillRect(-7,-5,14,10);g.fillStyle='#2a3038';g.fillRect(-6,-4,12,2.5)}
   else if(kind===6){g.strokeStyle='rgba(235,235,235,.75)';g.lineWidth=1.6;g.beginPath();g.moveTo(-10,-6);g.lineTo(-10,6);g.moveTo(10,-6);g.lineTo(10,6);g.stroke()}
   else if(kind===7){g.fillStyle='#8a6a3a';g.fillRect(-6,-4,12,8)}
   else if(kind===8){g.fillStyle='#2a2c30';g.beginPath();g.arc(0,0,5,0,TAU);g.fill();g.strokeStyle='rgba(180,185,190,.6)';g.lineWidth=1.2;g.beginPath();g.arc(0,0,4,0,TAU);g.stroke()}
   else{g.fillStyle='#444';g.fillRect(-1,-11,2,12);g.fillStyle=hs(i,sd,DC.seed+8)<.5?'#c0392b':'#f1c40f';g.beginPath();g.arc(0,-13,4.2,0,TAU);g.fill()}
   g.restore();
  }
  g.restore()}}
// strade: marciapiedi → asfalto → segnaletica → usura; sterrati a parte
const ROAD_COL={hw:'#2f3237',av:'#363940',st:'#3b3e44',al:'#44474d',dr:'#4a4d52'};
function pRoads(g,x0,y0){const x1=x0+CH,y1=y0+CH,rs=M.roads.filter(r=>hit(r.bb,x0,y0,x1,y1));g.lineJoin='round';g.lineCap='round';
 for(const rd of rs){const p=roadPath(rd);
  if(rd.ty==1){g.strokeStyle='rgba(60,45,25,.35)';g.lineWidth=rd.w+14;g.stroke(p)}
  else if(rd.sw){g.strokeStyle='#4d5058';g.lineWidth=rd.w+30;g.stroke(p);g.strokeStyle='#92959c';g.lineWidth=rd.w+26;g.stroke(p)}
  else{g.strokeStyle='rgba(78,80,74,.55)';g.lineWidth=rd.w+16;g.stroke(p);g.strokeStyle='#23252a';g.lineWidth=rd.w+6;g.stroke(p)}}
 for(const rd of rs){const p=roadPath(rd);
  if(rd.ty==1){g.strokeStyle='#5e4d33';g.lineWidth=rd.w+6;g.stroke(p);g.strokeStyle='#a58c5e';g.lineWidth=rd.w;g.stroke(p);g.strokeStyle='rgba(90,70,40,.4)';g.lineWidth=2.5;for(const d of[-rd.w*.22,rd.w*.22]){pline(g,offs(rd.pts,d));g.stroke()}}
  else{g.strokeStyle=ROAD_COL[rd.cls]||'#3b3e44';g.lineWidth=rd.w;g.stroke(p)}}
 // segnaletica
 for(const rd of rs){if(rd.ty==1)continue;const w=rd.w;g.lineCap='butt';
  if(w>=44){for(const d of[-w/2+4,w/2-4]){pline(g,offs(rd.pts,d));g.strokeStyle='rgba(235,235,235,.7)';g.lineWidth=2;g.stroke()}}
  if(w>=64){pline(g,rd.pts);g.strokeStyle='#585c63';g.lineWidth=7;g.stroke();for(const d of[-w/4,w/4]){pline(g,offs(rd.pts,d));g.strokeStyle='rgba(235,235,235,.6)';g.lineWidth=2;g.setLineDash([22,26]);g.stroke();g.setLineDash([])}}
  else if(w>=44){for(const d of[-1.6,1.6]){pline(g,offs(rd.pts,d));g.strokeStyle='rgba(230,190,40,.85)';g.lineWidth=1.8;g.stroke()}}
  else if(w>=26){pline(g,rd.pts);g.strokeStyle='rgba(235,235,235,.55)';g.lineWidth=2;g.setLineDash([16,18]);g.stroke();g.setLineDash([])}}
 // strisce pedonali ai crocevia
 for(const j of M.junc){if(j.x<x0-120||j.x>x1+120||j.y<y0-120||j.y>y1+120)continue;g.save();g.translate(j.x,j.y);g.rotate(j.a);const d=j.w/2+9,L=j.w*.5;g.fillStyle='rgba(235,235,235,.62)';
  for(const[ax,ay]of[[1,0],[-1,0],[0,1],[0,-1]])for(let k=-L;k<=L;k+=7){if(ax)g.fillRect(ax*d-2,k-1.8,4,3.6);else g.fillRect(k-1.8,ay*d-2,3.6,4)}g.restore()}
 // usura: rattoppi, crepe, sgommate, tombini
 for(const rd of rs){if(rd.ty==1)continue;const sd=(rd.pts[0][0]*7+rd.pts[0][1]*13)|0;
  for(let i=1;i<rd.pts.length;i++){const q=rd.pts[i];if(q[0]<x0-40||q[0]>x1+40||q[1]<y0-40||q[1]>y1+40)continue;const h=hs(i,sd,DC.seed),h2=hs(i,sd,DC.seed+3),a=Math.atan2(q[1]-rd.pts[i-1][1],q[0]-rd.pts[i-1][0]),o=(h2-.5)*(rd.w-10),nx=-Math.sin(a),ny=Math.cos(a);let x=q[0]+nx*o,y=q[1]+ny*o;
   if(h<.18){g.save();g.translate(x,y);g.rotate(a);g.fillStyle=`rgba(${h2<.5?'0,0,0':'110,115,125'},.16)`;g.fillRect(-9-h*20,-4-h2*5,18+h*40,8+h2*10);g.restore()}
   else if(h<.3){g.strokeStyle='rgba(8,8,10,.4)';g.lineWidth=1;g.beginPath();g.moveTo(x,y);for(let k=0;k<4;k++)g.lineTo(x+=(hs(i,k,sd)-.3)*10,y+=(hs(i,k+9,sd)-.5)*8);g.stroke()}
   else if(h<.37&&rd.w>=30){g.strokeStyle='rgba(5,5,8,.28)';g.lineWidth=2;for(const d of[-3,3]){g.beginPath();g.moveTo(x-nx*d-Math.cos(a)*14,y-ny*d-Math.sin(a)*14);g.quadraticCurveTo(x+nx*d*1.6,y+ny*d*1.6,x-nx*d+Math.cos(a)*18,y-ny*d+Math.sin(a)*18);g.stroke()}}
   else if(h>.96){g.fillStyle='rgba(20,22,26,.9)';g.strokeStyle='rgba(120,125,135,.6)';g.lineWidth=1;g.beginPath();g.arc(x,y,4.5,0,TAU);g.fill();g.stroke()}}}}
function pRamps(g,x0,y0){for(const r of M.ramps){if(r.x<x0-120||r.x>x0+CH+120||r.y<y0-120||r.y>y0+CH+120)continue;
  g.save();g.translate(r.x,r.y);g.rotate(r.a);const L=160,w=r.w/2+7,gr=g.createLinearGradient(-L/2,0,L/2,0);gr.addColorStop(0,'rgba(10,10,15,.5)');gr.addColorStop(1,'rgba(255,255,250,.28)');
  g.fillStyle=gr;g.fillRect(-L/2,-w,L,2*w);g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=2;g.beginPath();for(let x=-L/2+10;x<L/2;x+=16){g.moveTo(x,-w);g.lineTo(x,w)}g.stroke();
  g.strokeStyle='#4a4d54';g.lineWidth=6;g.beginPath();g.moveTo(-L/2,-w);g.lineTo(L/2,-w);g.moveTo(-L/2,w);g.lineTo(L/2,w);g.stroke();g.strokeStyle='#e6b422';g.lineWidth=2;g.setLineDash([8,8]);g.stroke();g.setLineDash([]);g.restore()}}
// acqua con rive (cemento vicino alle città, sabbia altrove), profondità a gradiente, onde; strato separato per ritagliare gli effetti sull'acqua
// tratto di costa (intervallo di v) che può toccare il blocco [x0,x1]×[y0,y1]; null se il mare è lontano
function tileV(x0,y0,x1,y1){const C=[[x0,y0],[x1,y0],[x0,y1],[x1,y1]];if(Math.max(...C.map(c=>seaU(c[0],c[1])))<SEA-760)return null;const V=C.map(c=>seaV(c[0],c[1]));return[Math.floor(Math.min(...V)/20)*20-120,Math.max(...V)+120]}   // margini: la spiaggia può essere larga fino a 3 volte
// rumore continuo 0..1 (interpolazione liscia di valori sulla griglia intera)
const nz2=(x,y,sd)=>{const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,a=u*u*(3-2*u),b=v*v*(3-2*v);return(hs(i,j,sd)*(1-a)+hs(i+1,j,sd)*a)*(1-b)+(hs(i,j+1,sd)*(1-a)+hs(i+1,j+1,sd)*a)*b};
// fattore di spessore delle rive di fiumi e laghi: di solito vicino a 1, a tratti fino a 10 (cambia con continuità lungo la riva)
const bankF=(x,y)=>1+9*Math.pow(nz2(x/260,y/260,DC.seed+501),2.6);
// fattore di spessore delle scarpate (linee di dislivello): da 1 a 3
// fattore di spessore della spiaggia sulla costa del mare: da 1 a 3
const coastF=(x,y)=>1+2*Math.pow(nz2(x/340,y/340,DC.seed+911),1.5);
const lvlF=(x,y)=>1+2*Math.pow(nz2(x/380,y/380,DC.seed+733),1.4);
function bankCol(x,y){return urbAt(x,y)>.38?['#55585f','#9a9da4']:['#a9996a','#d3c590']}
function pWater(g,x0,y0,S){const x1=x0+CH,y1=y0+CH,Lc=BK.wl,w=Lc.getContext('2d'),pw=DC.NZ.map(n=>w.createPattern(n,'repeat'));
 // rive: due passaggi (prima tutti i bordi, poi tutti gli interni) per evitare giunzioni a festone
 g.lineCap='round';g.lineJoin='round';const segs=[];
 for(const rv of M.rivers){const P=rv.pts;for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1];if(Math.max(a[0],b[0])<x0-170||Math.min(a[0],b[0])>x1+170||Math.max(a[1],b[1])<y0-170||Math.min(a[1],b[1])>y1+170)continue;
   const mx=(a[0]+b[0])/2,my=(a[1]+b[1])/2,c=bankCol(mx,my),k=c[0]=='#55585f'?[26,20]:[22,15],f=bankF(mx,my),rw=rv.wp?(rv.wp[i]+rv.wp[i+1])/2:rv.w;segs.push([a[0],a[1],b[0],b[1],c,rw+4+(k[0]-4)*f,rw+4+(k[1]-4)*f])}}   // riva di spessore variabile lungo il fiume (che ha a sua volta larghezza variabile)
 const tv=tileV(x0,y0,x1,y1);if(tv)for(let v=tv[0];v<tv[1];v+=20){const a=fromUV(coastV(v),v),b=fromUV(coastV(v+20),v+20),c=fromUV(coastV(v)-30,v),f=coastF(a[0],a[1]);segs.push([a[0],a[1],b[0],b[1],bankCol(c[0],c[1]),70*f,58*f])}   // spiaggia di spessore variabile (1-3 volte)
 // laghi: la riva segue la stessa sagoma di bpath (curve quadratiche fra i punti medi), spezzata in tratti per poterne variare lo spessore
 for(const l of M.lakes){if(l.x+l.r*1.4+300<x0||l.x-l.r*1.4-300>x1||l.y+l.r*1.4+300<y0||l.y-l.r*1.4-300>y1)continue;const c=bankCol(l.x,l.y),n=l.a.length,P2=l.a.map((r,i)=>{const t=i/n*TAU;return[l.x+Math.cos(t)*r,l.y+Math.sin(t)*r]}),Q=[];
  for(let i=0;i<n;i++){const p0=P2[(i+n-1)%n],p1=P2[i],p2=P2[(i+1)%n],s0=[(p0[0]+p1[0])/2,(p0[1]+p1[1])/2],s2=[(p1[0]+p2[0])/2,(p1[1]+p2[1])/2];
   for(let k=0;k<6;k++){const t=k/6,u=1-t;Q.push([u*u*s0[0]+2*u*t*p1[0]+t*t*s2[0],u*u*s0[1]+2*u*t*p1[1]+t*t*s2[1]])}}
  for(let i=0;i<Q.length;i++){const a=Q[i],b=Q[(i+1)%Q.length],f=bankF((a[0]+b[0])/2,(a[1]+b[1])/2);segs.push([a[0],a[1],b[0],b[1],c,30*f,22*f])}}
 for(const pass of[0,1]){for(const s of segs){g.beginPath();g.moveTo(s[0],s[1]);g.lineTo(s[2],s[3]);g.strokeStyle=s[4][pass];g.lineWidth=s[5+pass];g.stroke()}}
 // strato acqua
 w.setTransform(1,0,0,1,0,0);w.clearRect(0,0,Lc.width,Lc.height);w.setTransform(S,0,0,S,-x0*S,-y0*S);w.lineCap='round';w.lineJoin='round';
 // fiumi con sfumatura continua (strati concentrici interpolati tra i valori originali), tratto per tratto: la larghezza cambia lungo il corso
 {
  const NS=12;
  for(const rv of M.rivers){
   const P=rv.pts,WP=rv.wp||P.map(()=>rv.w),seg=[];
   for(let j=0;j<P.length-1;j++){const a=P[j],b=P[j+1],m2=Math.max(WP[j],WP[j+1])/2+10;if(Math.max(a[0],b[0])<x0-m2||Math.min(a[0],b[0])>x1+m2||Math.max(a[1],b[1])<y0-m2||Math.min(a[1],b[1])>y1+m2)continue;seg.push(j)}
   if(!seg.length)continue;
   const rw=rv.w;   // i colori dipendono solo dal rapporto fra gli strati: si calcolano sulla larghezza base, lo spessore su quella locale
   const stops=[
    {w:rw+4,    c:[0x4f,0x9c,0xc0]},
    {w:rw*.8,   c:[0x3f,0x86,0xb0]},
    {w:rw*.5,   c:[0x2f,0x6f,0x9f]},
    {w:rw*.22,  c:[0x28,0x5f,0x8c]}
   ];
   const wMax=rw+4, wMin=rw*.22;
   for(let i=0;i<NS;i++){
    const u=i/(NS-1);
    const lw=wMax+(wMin-wMax)*u;
    let a=0; while(a<stops.length-2 && lw < stops[a+1].w) a++;
    const s0=stops[a], s1=stops[a+1]||s0;
    const tt=clamp((s0.w-lw)/((s0.w-s1.w)||1),0,1);
    const cr=Math.round(s0.c[0]+(s1.c[0]-s0.c[0])*tt);
    const cg=Math.round(s0.c[1]+(s1.c[1]-s0.c[1])*tt);
    const cb=Math.round(s0.c[2]+(s1.c[2]-s0.c[2])*tt);
    w.strokeStyle=`rgb(${cr},${cg},${cb})`;
    const kw=lw/rw;   // spessore dello strato in proporzione alla larghezza base
    for(const j of seg){const lr=(WP[j]+WP[j+1])/2;w.lineWidth=lr*kw;w.beginPath();w.moveTo(P[j][0],P[j][1]);w.lineTo(P[j+1][0],P[j+1][1]);w.stroke()}
   }
  }
 }
 // laghi con sfumatura continua (blob concentrici interpolati)
 {
  const NS=12;
  const stops=[[1,[0x4f,0x9c,0xc0]],[.84,[0x3f,0x86,0xb0]],[.6,[0x2f,0x6f,0x9f]],[.34,[0x28,0x5f,0x8c]]];
  for(const l of M.lakes){
   if(l.x+l.r*1.4<x0||l.x-l.r*1.4>x1||l.y+l.r*1.4<y0||l.y-l.r*1.4>y1)continue;
   for(let i=0;i<NS;i++){
    const u=i/(NS-1);
    const k=1+(0.34-1)*u;
    let a=0; while(a<stops.length-2 && k < stops[a+1][0]) a++;
    const s0=stops[a], s1=stops[a+1]||s0;
    const tt=clamp((s0[0]-k)/((s0[0]-s1[0])||1),0,1);
    const cr=Math.round(s0[1][0]+(s1[1][0]-s0[1][0])*tt);
    const cg=Math.round(s0[1][1]+(s1[1][1]-s0[1][1])*tt);
    const cb=Math.round(s0[1][2]+(s1[1][2]-s0[1][2])*tt);
    bpath(w,l,k);w.fillStyle=`rgb(${cr},${cg},${cb})`;w.fill();
   }
  }
 }
 let sea=null;if(tv){sea=new Path2D();sea.moveTo(...fromUV(WW+60,-60));for(let v=-40;v<=WH+40;v+=20)sea.lineTo(...fromUV(coastV(v),v));sea.lineTo(...fromUV(WW+60,WH+60));sea.closePath();
  const g0=fromUV(SEA-260,0),g1=fromUV(WW,0),gr=w.createLinearGradient(g0[0],g0[1],g1[0],g1[1]);gr.addColorStop(0,'#5aa8c8');gr.addColorStop(.3,'#3f86b0');gr.addColorStop(1,'#1d4c78');w.fillStyle=gr;w.fill(sea);
  w.save();w.clip(sea);
  // chiazze di tonalità diversa: acqua bassa turchese, fondali scuri, alghe verdastre, sabbia sommersa vicino alla riva (ognuna fatta di 2-4 macchie sfumate)
  {const PC=320,TN=[[90,200,205],[16,46,88],[70,140,110],[205,205,160],[40,110,160]];
   for(let cy=Math.floor((y0-300)/PC);cy<=(y1+300)/PC;cy++)for(let cx=Math.floor((x0-300)/PC);cx<=(x1+300)/PC;cx++){const h=k=>hs(cx,cy,DC.seed+600+k);if(h(0)<.42)continue;
    const px=(cx+h(1))*PC,py=(cy+h(2))*PC,du=coastV(seaV(px,py))-seaU(px,py);if(du>-40)continue;
    const c=TN[du>-260&&h(3)<.5?3:(h(4)*TN.length)|0],al=.11+h(5)*.17,R0=80+h(6)*200;
    for(let j=0,n=2+(h(7)*3|0);j<n;j++){const x=px+(h(8+j)-.5)*R0,y=py+(h(12+j)-.5)*R0*.8,r=R0*(.45+h(16+j)*.55);
     const gr=w.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,`rgba(${c[0]},${c[1]},${c[2]},${al.toFixed(3)})`);gr.addColorStop(1,`rgba(${c[0]},${c[1]},${c[2]},0)`);
     w.fillStyle=gr;w.beginPath();w.ellipse(x,y,r,r*(.55+h(20+j)*.45),h(24+j)*3,0,TAU);w.fill()}}}
  w.strokeStyle='rgba(150,215,235,.16)';w.lineWidth=110;w.beginPath();for(let v=tv[0];v<tv[1];v+=20)w.lineTo(...fromUV(coastV(v),v));w.stroke();w.restore()}
 // effetti ritagliati sull'acqua (source-atop)
 w.globalCompositeOperation='source-atop';
 for(const[pi,sc,al]of[[1,1.2,.1],[0,.6,.07]]){w.save();w.globalAlpha=al;w.scale(sc,sc);w.fillStyle=pw[pi];w.fillRect(x0/sc,y0/sc,CH/sc+2,CH/sc+2);w.restore()}   // resta source-atop: solo sull'acqua
 w.strokeStyle='rgba(225,245,255,.2)';w.lineWidth=1.4;w.beginPath();const WS=38;
 for(let cy=Math.floor(y0/WS);cy<(y0+CH)/WS;cy++)for(let cx=Math.floor(x0/WS);cx<(x0+CH)/WS;cx++){const h1=hs(cx,cy,DC.seed+40);if(h1<.5)continue;const x=(cx+h1)*WS,y=(cy+hs(cx,cy,DC.seed+41))*WS,L=8+h1*14;w.moveTo(x,y);w.quadraticCurveTo(x+L/2,y-3,x+L,y)}
 w.stroke();w.globalCompositeOperation='source-over';
 g.save();g.setTransform(1,0,0,1,0,0);g.drawImage(Lc,0,0);g.restore();
 // schiuma sulla riva
 g.strokeStyle='rgba(255,255,255,.4)';g.lineWidth=2.5;g.setLineDash([14,10]);
 if(sea){g.beginPath();for(let v=tv[0];v<tv[1];v+=20)g.lineTo(...fromUV(coastV(v)+2,v));g.stroke()}
 for(const l of M.lakes){if(l.x+l.r*1.4<x0||l.x-l.r*1.4>x1||l.y+l.r*1.4<y0||l.y-l.r*1.4>y1)continue;bpath(g,l,1.0);g.stroke()}g.setLineDash([])}
function pIsles(g,x0,y0){for(const s of M.isles){if(s.x+s.R*1.4<x0||s.x-s.R*1.4>x0+CH||s.y+s.R*1.4<y0||s.y-s.R*1.4>y0+CH)continue;const c=bankCol(s.x,s.y);
  bpath(g,s,1.05);g.strokeStyle=c[0];g.lineWidth=16;g.stroke();g.fillStyle=c[1];g.fill();g.save();bpath(g,s,1);g.clip();pGround(g,x0,y0);pScatter(g,x0,y0);g.restore();
  g.strokeStyle='rgba(30,60,25,.35)';g.lineWidth=2;bpath(g,s,.99);g.stroke()}}
function pPiers(g,x0,y0){for(const p of M.piers){if(p.x+p.L/2<x0-40||p.x-p.L/2>x0+CH+40||p.y+p.W<y0-40||p.y-p.W>y0+CH+40)continue;g.save();g.translate(p.x,p.y);g.rotate(p.a);const L=p.L,W=p.W;
  g.fillStyle='rgba(8,25,40,.4)';g.fillRect(-L/2+7,-W/2+10,L,W);g.fillStyle='#4b4e55';g.fillRect(-L/2-3,-W/2-3,L+6,W+6);g.fillStyle='#868a91';g.fillRect(-L/2,-W/2,L,W);
  g.strokeStyle='rgba(0,0,0,.16)';g.lineWidth=1;g.beginPath();for(let x=-L/2+40;x<L/2;x+=40){g.moveTo(x,-W/2);g.lineTo(x,W/2)}g.stroke();
  g.strokeStyle='#d9b300';g.lineWidth=4;g.setLineDash([14,12]);g.strokeRect(-L/2+4,-W/2+4,L-8,W-8);g.setLineDash([]);
  for(const sd of[-1,1]){g.strokeStyle='#c2c5cb';g.lineWidth=2;g.beginPath();g.moveTo(-L/2,sd*(W/2-17));g.lineTo(L/2,sd*(W/2-17));g.stroke();g.strokeStyle='#4a3b2c';g.lineWidth=6;g.setLineDash([3,8]);g.stroke();g.setLineDash([])}
  g.fillStyle='#2b2e33';for(let x=-L/2+30;x<L/2;x+=65)for(const sd of[-1,1]){g.beginPath();g.arc(x,sd*(W/2-4),3.2,0,TAU);g.fill()}
  g.fillStyle='rgba(255,255,255,.5)';for(let x=-L/2+25;x<L/2-20;x+=90)g.fillRect(x,-2,38,4);g.restore()}}
function pBridges(g,x0,y0){for(const b of M.bridges){if(b.x<x0-b.L||b.x>x0+CH+b.L||b.y<y0-b.L||b.y>y0+CH+b.L)continue;g.save();g.translate(b.x,b.y);g.rotate(b.a);const L=b.L,W=b.bw;
  g.fillStyle='rgba(6,20,34,.38)';g.fillRect(-L/2+6,-W/2+9,L,W);g.fillStyle='#43464d';g.fillRect(-L/2-2,-W/2-5,L+4,W+10);g.fillStyle='#8f9298';g.fillRect(-L/2,-W/2,L,W);
  g.fillStyle='#3d4046';g.fillRect(-L/2,-W/2+9,L,W-18);g.strokeStyle='rgba(235,235,235,.65)';g.lineWidth=2;g.setLineDash([14,14]);g.beginPath();g.moveTo(-L/2,0);g.lineTo(L/2,0);g.stroke();g.setLineDash([]);
  g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=2;g.beginPath();for(let x=-L/2+30;x<L/2-10;x+=30){g.moveTo(x,-W/2);g.lineTo(x,W/2)}g.stroke();
  g.strokeStyle='#c6c9cf';g.lineWidth=3;g.beginPath();g.moveTo(-L/2,-W/2+4);g.lineTo(L/2,-W/2+4);g.moveTo(-L/2,W/2-4);g.lineTo(L/2,W/2-4);g.stroke();g.restore()}}
function pFalls(g,x0,y0){for(const f of M.falls){if(f.x<x0-80||f.x>x0+CH+80||f.y<y0-80||f.y>y0+CH+80)continue;
  g.save();g.translate(f.x,f.y);g.rotate(f.a);
  const w=f.w/2+8, L=28+Math.min(18,f.d*10);   // L = lunghezza del salto (un po' più lunga se il dislivello è alto)

  // Corpo a barre lungo il flusso (X locale): colori acqua, dimensioni casuali
  const cols=['#2a4a5e','#35566f','#3f6f8c','#4a82a0','#5a9ab8','rgba(180,220,240,.55)','rgba(220,240,255,.45)'];
  const nBar=Math.max(14,Math.round(w/3.2));
  g.lineCap='round';
  for(let i=0;i<nBar;i++){
    const t=(i+.35+(i*13%5)*.07)/nBar;          // distribuzione lungo la larghezza
    const y=-w+4+(2*w-8)*t;
    const len=L*(.35+.55*((i*17)%10)/10);        // lunghezza casuale lungo il flusso
    const th=1.2+((i*31)%7)*.55;                 // spessore variabile
    const x0=-2+((i*7)%5)-2;                     // lieve offset in X
    const yJ=((i*11)%5)-2;                       // piccola oscillazione laterale
    g.strokeStyle=cols[i%cols.length];
    g.lineWidth=th;
    g.beginPath();
    g.moveTo(x0,y+yJ);
    g.lineTo(x0+len,y+yJ+((i%2)?2:-1.5));        // leggera inclinazione come i filetti
    g.stroke();
  }
  // Filetti chiari in evidenza (sempre lungo il flusso)
  g.strokeStyle='rgba(230,245,255,.75)';g.lineWidth=1.5;
  for(let i=0,n=Math.max(5,Math.round(w/7));i<n;i++){
    const y=-w+6+(2*w-12)*(i+.3+((i*17)%7)*.04)/n;
    const ox=(i%3-1)*2.2;
    g.beginPath();
    g.moveTo(-2+ox,y);
    g.lineTo(L*.55+ox+(i%2?3:-1),y+(i%2?3:-2));
    g.stroke();
  }
  
  // 7. Schiuma / splash alla base (più ellissi sovrapposte)
  g.fillStyle='rgba(255,255,255,.35)';g.beginPath();g.ellipse(L*.75,0,14,w+6,0,0,TAU);g.fill();
  g.fillStyle='rgba(220,240,255,.45)';g.beginPath();g.ellipse(L*.9, -w*.25,9,w*.55,0,0,TAU);g.fill();
  g.beginPath();g.ellipse(L*.85,  w*.3, 8,w*.5,0,0,TAU);g.fill();
  
  // 8. Piccole gocce / spruzzi intorno alla base
  g.fillStyle='rgba(255,255,255,.65)';
  for(let i=0;i<6;i++){
    const ang=-.6+i*.25, rr=10+i*2.2;
    g.beginPath();g.arc(L*.7+Math.cos(ang)*rr, Math.sin(ang)*rr*(w/28), 1.6+i*.15, 0, TAU);g.fill();
  }
  // 9. Leggera foschia sopra il salto
  g.fillStyle='rgba(210,230,245,.18)';g.beginPath();g.ellipse(L*.2,0,L*.4,w*.7,0,0,TAU);g.fill();
  g.restore()}}
// basi e macerie sotto gli oggetti reali: quando crollano resta un terreno coerente (cenere, mattoni, foglie, ghiaia)
function pRubble(g,x0,y0){const a=DC.OI.get(Math.floor(x0/CH)*64+Math.floor(y0/CH));if(!a)return;
 for(const o of a){const sd=o.id*7+3;
  if(o.t=='t'){g.fillStyle='rgba(45,36,24,.5)';g.beginPath();g.ellipse(o.x,o.y,o.r*1.05,o.r*.95,0,0,TAU);g.fill();g.fillStyle='rgba(90,140,60,.5)';for(let i=0;i<6;i++){g.beginPath();g.arc(o.x+(hs(i,sd,1)-.5)*o.r*2.2,o.y+(hs(i,sd,2)-.5)*o.r*2.2,1.6,0,TAU);g.fill()}continue}
  if(o.ty=='rock'){g.fillStyle='rgba(120,116,104,.5)';for(let i=0;i<7;i++){g.beginPath();g.arc(o.x+(hs(i,sd,1)-.5)*o.r*2.3,o.y+(hs(i,sd,2)-.5)*o.r*2.3,1+hs(i,sd,3)*2,0,TAU);g.fill()}continue}
  g.save();g.translate(o.x,o.y);g.rotate(o.a);g.fillStyle='rgba(18,16,14,.4)';for(const q of o.pr){qp(g,q,-3);g.fill()}
  const n=o.ty=='wall'?8:Math.min(55,Math.round(o.r/2.2));
  for(let i=0;i<n;i++){const q=o.pr[i%o.pr.length],qx=q.k=='g'?0:q.x,qy=q.k=='g'?0:q.y,ra=(q.k=='r'?q.a:q.k=='g'?o.r*.4:q.a)*.9,rb=(q.k=='r'?q.b:ra)*.9;
   const x=qx+(hs(i,sd,4)-.5)*2*ra,y=qy+(hs(i,sd,5)-.5)*2*rb,s2=(2+hs(i,sd,6)*5)*3;
   g.fillStyle=['#5d5b57','#7a7771','#8c5a44','#3f3d3a','#6e6a63'][(hs(i,sd,7)*5)|0];g.save();g.translate(x,y);g.rotate(hs(i,sd,8)*3);g.fillRect(-s2/2,-s2/3,s2,s2*.7);g.restore()}
  // tralicci crollati
  if(o.r>40&&hs(o.id,9,DC.seed)>.55){
   g.strokeStyle='#3a3a3a';g.lineWidth=3.5;
   const len=o.r*(.8+hs(o.id,12,DC.seed)*.8),ang=hs(o.id,11,DC.seed)*TAU;
   g.beginPath();g.moveTo(-Math.cos(ang)*len*.3,-Math.sin(ang)*len*.3);g.lineTo(Math.cos(ang)*len*.7,Math.sin(ang)*len*.7);g.stroke();
   for(let k=-2;k<=2;k++){const t=k/3;g.beginPath();g.moveTo(Math.cos(ang)*len*t-Math.sin(ang)*12,Math.sin(ang)*len*t+Math.cos(ang)*12);g.lineTo(Math.cos(ang)*len*t+Math.sin(ang)*12,Math.sin(ang)*len*t-Math.cos(ang)*12);g.stroke()}
  }
  g.restore()}}

// ===== superfici bagnate (pioggia): pozzanghere + sheen su slabs e strade, tutto deterministico =====
function puddleShape(g,x,y,rw,rh,a){
 g.save();g.translate(x,y);g.rotate(a||0);
 if(WX.snow){
  // cumulo di neve: gradiente radiale (bianco al centro, ombra azzurrina ai bordi)
  const gr=g.createRadialGradient(-rw*.15,-rh*.25,rw*.05,-rw*.05,-rh*.05,rw*1.1);
  gr.addColorStop(0,'rgba(255,255,255,1)');
  gr.addColorStop(.55,'rgba(248,252,255,.92)');
  gr.addColorStop(1,'rgba(210,228,245,.65)');
  g.fillStyle=gr;g.beginPath();g.ellipse(0,0,rw*1.12,rh*1.12,0,0,TAU);g.fill();
  // ombra in basso (luce che arriva dall'alto)
  g.fillStyle='rgba(180,205,235,.35)';g.beginPath();g.ellipse(rw*.10,rh*.22,rw*.70,rh*.55,0,0,TAU);g.fill();
  // riflesso/luccichio in alto-sx
  g.fillStyle='rgba(255,255,255,.85)';g.beginPath();g.ellipse(-rw*.18,-rh*.28,rw*.55,rh*.40,0,0,TAU);g.fill();
 }else{
  // corpo scuro (acqua in ombra)
  g.fillStyle='rgba(10,18,28,.55)';g.beginPath();g.ellipse(0,0,rw,rh,0,0,TAU);g.fill();
  // riflesso del cielo (bordo alto, ellisse chiara decentrata verso l'alto)
  g.fillStyle='rgba(190,215,235,.42)';g.beginPath();g.ellipse(-rw*.20,-rh*.35,rw*.50,rh*.28,0,0,TAU);g.fill();
  // riflesso freddo interno (acqua che rimanda l'azzurro del cielo)
  g.fillStyle='rgba(140,175,205,.18)';g.beginPath();g.ellipse(rw*.15,rh*.15,rw*.55,rh*.35,0,0,TAU);g.fill();
 }
 g.restore()}

// riflessi bagnati multicolori: sfumature chiare e irregolari su terreno, strade e piazzali
const LAMP_COL=['255,45,190','0,235,255','255,175,40'];   // più saturi, coerenti con COL in pLights
function pWetReflections(g,x0,y0){
 if(!WX.rain)return;
 const tk=((x0/CH)|0)*64+((y0/CH)|0);
 const sd=(tk*7919+DC.seed)|0;
 const u=urbAt(x0+CH/2,y0+CH/2);
 g.save();
 g.globalCompositeOperation='lighter';

 // lista delle macchie già piazzate in questo blocco (per limitare le sovrapposizioni)
 const placed=[];
 // helper: una macchia irregolare con beam direzionali dai lampioni vicini
 const wetPatch=(bx,by,idx,sdx,radMul)=>{
  radMul=radMul||1;
  const baseR=(55+hs(idx,sdx,DC.seed+930)*65)*radMul;
  // limite: al massimo 2 macchie sovrapposte in ogni punto
  // (sagome irregolari: considero "sovrapposte" due macchie se distanza < (r1+r2)*0.8)
  let overlaps=0;
  for(const p of placed){
   const dx=p.x-bx, dy=p.y-by, rr=(p.r+baseR)*0.8;
   if(dx*dx+dy*dy<rr*rr){overlaps++;if(overlaps>=2)return}
  }
  const verts=10+((hs(idx,sdx,DC.seed+950)*8)|0);
  const pts=[];
  for(let v=0;v<verts;v++){
   const a=v/verts*TAU;
   const rv=baseR*(0.55+hs(idx,sdx,DC.seed+960+v*3)*0.7);
   pts.push([bx+Math.cos(a)*rv,by+Math.sin(a)*rv]);
  }
  // Path2D: riutilizzabile per fill e clip
  const path=new Path2D();
  const pm=pts[verts-1];
  path.moveTo((pm[0]+pts[0][0])/2,(pm[1]+pts[0][1])/2);
  for(let v=0;v<verts;v++){
   const p=pts[v],q=pts[(v+1)%verts];
   path.quadraticCurveTo(p[0],p[1],(p[0]+q[0])/2,(p[1]+q[1])/2);
  }
  path.closePath();
  // 1. base multicolore (due colori lampione) — alpha ridotto per lasciare spazio ai beam
  const c1=(hs(idx,sdx,DC.seed+700)*3)|0;
  const c2=(c1+1+((hs(idx,sdx,DC.seed+701)*2)|0))%3;
  const a1=0.12+hs(idx,sdx,DC.seed+800)*0.12;   // 0.12–0.24
  const gr=g.createRadialGradient(bx,by,baseR*0.08,bx,by,baseR*1.35);
  gr.addColorStop(0,`rgba(${LAMP_COL[c1]},${a1.toFixed(3)})`);
  gr.addColorStop(0.35,`rgba(${LAMP_COL[c2]},${(a1*0.85).toFixed(3)})`);
  gr.addColorStop(0.7,`rgba(${LAMP_COL[c1]},${(a1*0.45).toFixed(3)})`);
  gr.addColorStop(1,`rgba(${LAMP_COL[c2]},0)`);
  g.fillStyle=gr;
  g.fill(path);
  // 2. beam direzionali dai lampioni entro LAMP_R px, con tetto totale per non bruciare la macchia
  const LAMP_R=340, BEAM_MAX=0.18;             // tetto massimo del contributo dei lampioni su una singola macchia
  const beams=[];
  let beamTot=0;
  for(let li=0;li<DC.LAMPS.length;li++){
   const L=DC.LAMPS[li];
   const dx=bx-L.x, dy=by-L.y, d2=dx*dx+dy*dy;
   if(d2>LAMP_R*LAMP_R)continue;
   const d=Math.sqrt(d2)||1;
   const ba=(1-d/LAMP_R)*0.12;                 // 0.12 vicino, 0 lontano (era 0.35)
   if(ba<0.015)continue;
   beams.push({L,d,ba});beamTot+=ba;
  }
  if(beamTot>0){
   const k=beamTot>BEAM_MAX?BEAM_MAX/beamTot:1;   // se più lampioni si sovrappongono, si ridimensionano
   for(const b of beams){
    const ba=b.ba*k;
    if(ba<0.008)continue;
    g.save();
    g.clip(path);
    const col=LAMP_COL[b.L.c];
    const grB=g.createRadialGradient(b.L.x,b.L.y,Math.max(1,b.d-baseR),b.L.x,b.L.y,b.d+baseR*1.2);
    grB.addColorStop(0,`rgba(${col},${ba.toFixed(3)})`);
    grB.addColorStop(0.55,`rgba(${col},${(ba*0.5).toFixed(3)})`);
    grB.addColorStop(1,`rgba(${col},0)`);
    g.fillStyle=grB;
    g.fillRect(bx-baseR*1.4,by-baseR*1.4,baseR*2.8,baseR*2.8);
    g.restore();
   }
  }
  // registra la macchia per i check successivi nel blocco
  placed.push({x:bx,y:by,r:baseR});
 };

 // A. macchie sparse su terreno/slab (2–6 per blocco, +1 in zona urbana)
 const n=2+((hs(0,sd,DC.seed+900)*5)|0)+((u>0.5)?1:0);
 for(let i=0;i<n;i++){
  const bx=x0+CH*0.25+hs(i,sd,DC.seed+910)*CH*0.5;
  const by=y0+CH*0.25+hs(i,sd,DC.seed+920)*CH*0.5;
  wetPatch(bx,by,i,sd);
 }
 // B. macchie fitte lungo le strade (evita lunghi tratti asciutti)
 //    Un tentativo ogni ~75 px lungo il tracciato, ~68% di successo, offset laterale dentro la carreggiata
 for(let rdi=0;rdi<M.roads.length;rdi++){
  const rd=M.roads[rdi];
  if(!hit(rd.bb,x0,y0,x0+CH,y0+CH))continue;
  if(rd.ty==1||rd.w<24)continue;
  const pts=rd.pts, step=75;
  for(let j=1;j<pts.length;j++){
   const p=pts[j-1], q=pts[j];
   const segL=Math.hypot(q[0]-p[0],q[1]-p[1]);
   if(segL<1)continue;
   const nSteps=Math.max(1,Math.round(segL/step));
   const a=Math.atan2(q[1]-p[1],q[0]-p[0]);
   const nx=-Math.sin(a), ny=Math.cos(a);
   for(let k=0;k<nSteps;k++){
    const t=(k+0.5)/nSteps;
    const cx=p[0]+(q[0]-p[0])*t, cy=p[1]+(q[1]-p[1])*t;
    if(cx<x0-120||cx>x0+CH+120||cy<y0-120||cy>y0+CH+120)continue;
    if(hs(j*7+k,rdi,sd+940)<0.32)continue;    // ~68% delle posizioni genera una macchia
    const lat=(hs(j*3+k,rdi,sd+941)-0.5)*rd.w*0.7;   // offset laterale dentro la carreggiata
    const px=cx+nx*lat, py=cy+ny*lat;
    wetPatch(px,py,j*100+k,sd+17+rdi*31,0.55);       // raggio 55% (stanno dentro la strada)
   }
  }
 }
 g.restore();
}

// cumuli di neve: riusano la stessa distribuzione delle "macchie di riflesso" della pioggia,
// ma disegnati come accumuli bianchi (le macchie restano dove erano le pozzanghere riflettenti).
function pSnowAccum(g,x0,y0){
 if(!WX.snow)return;
 const tk=((x0/CH)|0)*64+((y0/CH)|0);
 const sd=(tk*7919+DC.seed)|0;
 const u=urbAt(x0+CH/2,y0+CH/2);
 g.save();
 const placed=[];
 const snowPatch=(bx,by,idx,sdx,radMul)=>{
  radMul=radMul||1;
  const baseR=(55+hs(idx,sdx,DC.seed+930)*65)*radMul;
  let overlaps=0;
  for(const p of placed){
   const dx=p.x-bx, dy=p.y-by, rr=(p.r+baseR)*0.8;
   if(dx*dx+dy*dy<rr*rr){overlaps++;if(overlaps>=2)return}
  }
  const verts=10+((hs(idx,sdx,DC.seed+950)*8)|0);
  const pts=[];
  for(let v=0;v<verts;v++){
   const a=v/verts*TAU;
   const rv=baseR*(0.55+hs(idx,sdx,DC.seed+960+v*3)*0.7);
   pts.push([bx+Math.cos(a)*rv,by+Math.sin(a)*rv]);
  }
  const path=new Path2D();
  const pm=pts[verts-1];
  path.moveTo((pm[0]+pts[0][0])/2,(pm[1]+pts[0][1])/2);
  for(let v=0;v<verts;v++){
   const p=pts[v],q=pts[(v+1)%verts];
   path.quadraticCurveTo(p[0],p[1],(p[0]+q[0])/2,(p[1]+q[1])/2);
  }
  path.closePath();
  // corpo del cumulo: gradiente radiale (bianco al centro, azzurro-ombra ai bordi)
  const gr=g.createRadialGradient(bx,by,baseR*0.08,bx,by,baseR*1.35);
  gr.addColorStop(0,'rgba(255,255,255,.95)');
  gr.addColorStop(0.35,'rgba(245,250,255,.82)');
  gr.addColorStop(0.7,'rgba(215,230,245,.48)');
  gr.addColorStop(1,'rgba(195,220,240,0)');
  g.fillStyle=gr;
  g.fill(path);
  // ombra diffusa in basso (vista dall'alto: la neve accumula più luce sul lato alto)
  g.save();g.clip(path);
  const gs=g.createLinearGradient(bx,by-baseR,bx,by+baseR);
  gs.addColorStop(0,'rgba(255,255,255,.5)');
  gs.addColorStop(0.55,'rgba(255,255,255,0)');
  gs.addColorStop(1,'rgba(150,180,220,.35)');
  g.fillStyle=gs;g.fillRect(bx-baseR*1.4,by-baseR*1.4,baseR*2.8,baseR*2.8);
  g.restore();
  placed.push({x:bx,y:by,r:baseR});
 };
 // A. macchie sparse su terreno/slab (2–6 per blocco, +1 in zona urbana) — stesse posizioni della pioggia
 const n=2+((hs(0,sd,DC.seed+900)*5)|0)+((u>0.5)?1:0);
 for(let i=0;i<n;i++){
  const bx=x0+CH*0.25+hs(i,sd,DC.seed+910)*CH*0.5;
  const by=y0+CH*0.25+hs(i,sd,DC.seed+920)*CH*0.5;
  snowPatch(bx,by,i,sd);
 }
 // B. cumuli ai BORDI delle strade (la strada resta "pulita" al centro, la neve si accumula lateralmente)
 for(let rdi=0;rdi<M.roads.length;rdi++){
  const rd=M.roads[rdi];
  if(!hit(rd.bb,x0,y0,x0+CH,y0+CH))continue;
  if(rd.ty==1||rd.w<24)continue;
  const pts=rd.pts, step=75;
  for(let j=1;j<pts.length;j++){
   const p=pts[j-1], q=pts[j];
   const segL=Math.hypot(q[0]-p[0],q[1]-p[1]);
   if(segL<1)continue;
   const nSteps=Math.max(1,Math.round(segL/step));
   const a=Math.atan2(q[1]-p[1],q[0]-p[0]);
   const nx=-Math.sin(a), ny=Math.cos(a);
   for(let k=0;k<nSteps;k++){
    const t=(k+0.5)/nSteps;
    const cx=p[0]+(q[0]-p[0])*t, cy=p[1]+(q[1]-p[1])*t;
    if(cx<x0-120||cx>x0+CH+120||cy<y0-120||cy>y0+CH+120)continue;
    if(hs(j*7+k,rdi,sd+940)<0.35)continue;    // ~65% delle posizioni genera un cumulo
    const side=(hs(j*3+k,rdi,sd+941)<0.5?-1:1); // sempre ai lati, mai al centro
    const lat=side*(rd.w*0.38);
    const px=cx+nx*lat, py=cy+ny*lat;
    snowPatch(px,py,j*100+k,sd+17+rdi*31,0.42);
   }
  }
 }
 g.restore();
}

// maschera delle chiazze del meteo (rallentamento e scie): ripete ESATTAMENTE la disposizione di pWetReflections (pioggia) e pSnowAccum (neve),
// blocco per blocco, e segna le celle dentro la sagoma (all'85%: il bordo sfumato non conta). Gira una volta per mappa, dopo decorPrep.
function wxMaskBuild(){M.wxm=null;if(!WX.rain&&!WX.snow)return;
 const GX=Math.ceil(WW/WXC),GY=Math.ceil(WH/WXC),m=new Uint8Array(GX*GY),snow=!!WX.snow,val=snow?2:1;
 for(let cy=0;cy<BK.ny;cy++)for(let cx=0;cx<BK.nx;cx++){const x0=cx*CH,y0=cy*CH,x1=x0+CH,y1=y0+CH,sd=((cx*64+cy)*7919+DC.seed)|0,u=urbAt(x0+CH/2,y0+CH/2),placed=[];
  const patch=(bx,by,idx,sdx,radMul)=>{radMul=radMul||1;const baseR=(55+hs(idx,sdx,DC.seed+930)*65)*radMul;let ov=0;
   for(const p of placed){const dx=p.x-bx,dy=p.y-by,rr=(p.r+baseR)*.8;if(dx*dx+dy*dy<rr*rr){ov++;if(ov>=2)return}}
   const n=10+((hs(idx,sdx,DC.seed+950)*8)|0),rv=[];for(let k=0;k<n;k++)rv.push(baseR*(.55+hs(idx,sdx,DC.seed+960+k*3)*.7)*.85);
   placed.push({x:bx,y:by,r:baseR});
   const R=baseR*1.1,i0=Math.max(x0,bx-R)/WXC|0,i1=Math.min(Math.min(x1,WW)-1,bx+R)/WXC|0,j0=Math.max(y0,by-R)/WXC|0,j1=Math.min(Math.min(y1,WH)-1,by+R)/WXC|0;   // solo dentro il blocco (il disegno è ritagliato al blocco)
   for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const px=i*WXC+WXC/2-bx,py=j*WXC+WXC/2-by,d=Math.hypot(px,py);if(d>R)continue;let a=Math.atan2(py,px);if(a<0)a+=TAU;
    const f=a/TAU*n,k=f|0,t=f-k;if(d<rv[k%n]*(1-t)+rv[(k+1)%n]*t)m[j*GX+i]=val}};
  const n=2+((hs(0,sd,DC.seed+900)*5)|0)+((u>0.5)?1:0);   // A. macchie sparse (stesse formule del disegno)
  for(let i=0;i<n;i++)patch(x0+CH*.25+hs(i,sd,DC.seed+910)*CH*.5,y0+CH*.25+hs(i,sd,DC.seed+920)*CH*.5,i,sd);
  for(let rdi=0;rdi<M.roads.length;rdi++){const rd=M.roads[rdi];if(!hit(rd.bb,x0,y0,x1,y1)||rd.ty==1||rd.w<24)continue;const P=rd.pts;   // B. lungo le strade
   for(let j=1;j<P.length;j++){const p=P[j-1],q=P[j],L=Math.hypot(q[0]-p[0],q[1]-p[1]);if(L<1)continue;const ns=Math.max(1,Math.round(L/75)),a=Math.atan2(q[1]-p[1],q[0]-p[0]),nx=-Math.sin(a),ny=Math.cos(a);
    for(let k=0;k<ns;k++){const t=(k+.5)/ns,qx=p[0]+(q[0]-p[0])*t,qy=p[1]+(q[1]-p[1])*t;if(qx<x0-120||qx>x1+120||qy<y0-120||qy>y1+120)continue;
     if(hs(j*7+k,rdi,sd+940)<(snow?.35:.32))continue;
     const lat=snow?(hs(j*3+k,rdi,sd+941)<.5?-1:1)*rd.w*.38:(hs(j*3+k,rdi,sd+941)-.5)*rd.w*.7;
     patch(qx+nx*lat,qy+ny*lat,j*100+k,sd+17+rdi*31,snow?.42:.55)}}}}
 M.wxm={g:m,w:GX,h:GY}}
function pWetGround(g,x0,y0){
 if(!WX.rain&&!WX.snow)return;const x1=x0+CH,y1=y0+CH;
 g.save();g.beginPath();g.rect(x0,y0,CH,CH);g.clip();   // 1. tile clip: niente sconfinamenti tra blocchi
 // 2. slabs "grandi" (quartieri, industrie, militari, porto): sheen diagonale + pozzanghere (pioggia) / cumuli (neve)
 const a=DC.FI.get(Math.floor(x0/CH)*64+Math.floor(y0/CH));
 if(a)for(const f of a){
  if(f.k!=='slab'||f.t==5)continue;                     // niente giardini/parchi
  if(f.w<250&&f.h<250)continue;                         // skip slabs per-edificio (sotto gli edifici): troppo piccoli
  const w=f.w,h=f.h;
  g.save();g.translate(f.x,f.y);g.rotate(f.a||0);
  g.beginPath();g.rect(-w/2,-h/2,w,h);g.clip();         // 3. clip alla sagoma dello slab
  // sheen diagonale (solo pioggia: chiaro agli angoli, scuro al centro)
  if(WX.rain){
   const gr=g.createLinearGradient(-w/2,-h/2,w/2,h/2);
   gr.addColorStop(0,'rgba(25,35,50,.22)');
   gr.addColorStop(.5,'rgba(25,35,50,.06)');
   gr.addColorStop(1,'rgba(25,35,50,.22)');
   g.fillStyle=gr;g.fillRect(-w/2,-h/2,w,h);
  }
  // 2–5 macchie deterministiche (pozzanghere o cumuli), lontane dai bordi
  const sd=((f.x|0)*17+(f.y|0)*23)|0,n=2+((hs(1,sd,DC.seed+700)*4)|0);
  for(let i=0;i<n;i++){
   const px=(hs(i,sd,DC.seed+710)-.5)*w*.55;
   const py=(hs(i,sd,DC.seed+711)-.5)*h*.55;
   const rw=10+hs(i,sd,DC.seed+712)*22;
   const rh=6+hs(i,sd,DC.seed+713)*14;
   const pa=hs(i,sd,DC.seed+714)*3.14;
   puddleShape(g,px,py,rw,rh,pa)}
  g.restore()}
 // 4. strade: sheen scuro + riflesso sui bordi (solo pioggia: asfalto bagnato)
 if(WX.rain)for(const rd of M.roads){
  if(!hit(rd.bb,x0,y0,x1,y1))continue;
  if(rd.ty==1||rd.w<24)continue;                       // niente su sterrati o stradine
  const p=roadPath(rd);
  g.strokeStyle='rgba(20,30,45,.18)';g.lineWidth=rd.w-6;g.stroke(p);
  g.strokeStyle='rgba(180,200,220,.12)';g.lineWidth=2.5;
  for(const d of[-rd.w/2+4,rd.w/2-4]){pline(g,offs(rd.pts,d));g.stroke()}
 }
 // 5. patina meteo sull'intero tile: pioggia = macchie bagnate, neve = cumuli bianchi (stessi punti)
 if(WX.rain)pWetReflections(g,x0,y0);
 else if(WX.snow)pSnowAccum(g,x0,y0);
 g.restore()}

// luci al neon: aloni additivi vicino a lampioni, piazze e ponti
function pLights(g,x0,y0){const COL=['255,70,170','60,225,255','255,190,90'];
 // 0. riflessi nelle pozzanghere (pioggia): stretta verticale colorata SOTTO il lampione, coerente con la luce
 if(WX.rain){g.save();g.globalCompositeOperation='lighter';
 for(const l of DC.LAMPS){
  if(l.x<x0-160||l.x>x0+CH+160||l.y<y0-160||l.y>y0+CH+160)continue;
  g.save();g.translate(l.x,l.y);
  // riflesso bagnato: alone circolare con gradiente radiale (nessun bordo rettilineo)
  const R0=42;
  const gr=g.createRadialGradient(0,0,2,0,0,R0);
  gr.addColorStop(0,`rgba(${COL[l.c]},.55)`);
  gr.addColorStop(.35,`rgba(${COL[l.c]},.22)`);
  gr.addColorStop(1,`rgba(${COL[l.c]},0)`);
  g.fillStyle=gr;g.beginPath();g.arc(0,0,R0,0,TAU);g.fill();
  g.restore()}
 g.restore()}
 // 1. alone normale (invariato)
 g.save();g.globalCompositeOperation='lighter';
 for(const l of DC.LAMPS){if(l.x<x0-160||l.x>x0+CH+160||l.y<y0-160||l.y>y0+CH+160)continue;const u=urbAt(l.x,l.y),R0=(26+u*14)*2,gr=g.createRadialGradient(l.x,l.y,0,l.x,l.y,R0);gr.addColorStop(0,`rgba(${COL[l.c]},.38)`);gr.addColorStop(.45,`rgba(${COL[l.c]},.12)`);gr.addColorStop(1,`rgba(${COL[l.c]},0)`);g.fillStyle=gr;g.fillRect(l.x-R0,l.y-R0,R0*2,R0*2)}
 g.restore();
 // 2. dot luminoso (invariato)
 for(const l of DC.LAMPS){if(l.x<x0-8||l.x>x0+CH+8||l.y<y0-8||l.y>y0+CH+8)continue;
  g.fillStyle='#fff8e0';g.beginPath();g.arc(l.x,l.y,2.8,0,TAU);g.fill()}
 }
// auto parcheggiate (elementi 'car' generati lungo i viali)
// ===== ARENA (sito 's'): piazzale, tribune col pubblico, campo che cambia (gladiatori, calcio, basket, atletica, tennis, football, baseball, motocross) =====
// f = {A,B: semiassi esterni · D: profondità delle tribune · P: piazzale · n: esponente della superellisse · v: tipo di campo · gt: varchi · gr: tribuna coperta}
// g arriva già traslato e ruotato sull'arena (pFlat). Asse u = x (lungo), asse v = y.
const ARENA_TEAM=['#c0392b','#2e86c1','#f1c40f','#27ae60','#ecf0f1','#e67e22','#8e44ad','#16a085','#2c3e50','#d35400','#111111','#ff69b4'];
const ARENA_SHIRT=['#c0392b','#2e86c1','#f1c40f','#27ae60','#ecf0f1','#e67e22','#8e44ad','#2c3e50','#7f8c8d','#d35400','#ff69b4','#111111','#9b59b6','#1abc9c'];
const ARENA_SKIN=['#f1c9a5','#e0ac69','#c68642','#8d5524','#ffdbac'];
const ROMAN_CL=['#f4efe2','#e8dcc0','#d9c7a0','#efe6cf','#b5523b','#c9a227','#ffffff','#9c8a6a'];
function sePath(g,a,b,n,N){N=N||128;let p=sePt(a,b,n,0);g.moveTo(p[0],p[1]);for(let i=1;i<N;i++){p=sePt(a,b,n,i/N*TAU);g.lineTo(p[0],p[1])}g.closePath()}
// rettangolo più grande di proporzioni r (larghezza/altezza) dentro la superellisse: metà dei lati
const seFit=(a,b,n,r)=>{const k=1/Math.pow(Math.pow(r/a,n)+Math.pow(1/b,n),1/n);return[k*r,k]};
// omino visto dall'alto rivolto verso +x (spalle, testa); s = scala
function afig(g,x,y,a,col,s,sk){s=s||1;g.save();g.translate(x,y);g.rotate(a||0);g.scale(s,s);
 g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.ellipse(.9,1.3,2.2,3.4,0,0,TAU);g.fill();
 g.fillStyle=col;g.beginPath();g.ellipse(0,0,1.9,3.2,0,0,TAU);g.fill();
 g.fillStyle=sk||'#d9a87a';g.beginPath();g.arc(.25,0,1.4,0,TAU);g.fill();g.restore()}
const aLine=(g,pts,c,w,dash)=>{g.strokeStyle=c;g.lineWidth=w;if(dash)g.setLineDash(dash);g.beginPath();g.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)g.lineTo(pts[i][0],pts[i][1]);g.stroke();if(dash)g.setLineDash([])};
const aText=(g,t,x,y,sz,c,rot)=>{g.save();g.translate(x,y);if(rot)g.rotate(rot);g.fillStyle=c;g.font='bold '+sz+'px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(t,0,0);g.restore()};
// il punto (x,y) delle tribune cade nel tunnel di un varco?
const arenaInGate=(gt,x,y,w)=>gt.some(q=>q[0]?Math.sign(x)===Math.sign(q[0])&&Math.abs(y)<w:Math.sign(y)===Math.sign(q[1])&&Math.abs(x)<w);

PF.arena=function(g,f){const{A,B,D,n,v}=f,a=A-D,b=B-D,H=(i,k)=>hs(i,f.s|0,DC.seed+k),rom=v===0,gt=f.gt||[[A,0],[-A,0]];
 if(!f.t1){f.t1=ARENA_TEAM[(H(1,1)*ARENA_TEAM.length)|0];for(let i=0;i<12&&(!f.t2||f.t2===f.t1);i++)f.t2=ARENA_TEAM[(H(2+i,2)*ARENA_TEAM.length)|0]}
 const t1=f.t1,t2=f.t2;
 arenaPlaza(g,f,H,rom,t1,t2,gt);
 arenaStands(g,f,H,rom,t1,t2,gt);
 g.save();g.beginPath();sePath(g,a,b,n);g.clip();
 try{(ARENA_FIELD[v]||ARENA_FIELD[1])(g,f,a,b,n,H,t1,t2)}catch(e){console.warn('Campo dell’arena non disegnabile',e)}
 g.restore();
 arenaRim(g,f,H,rom,t1,t2,gt)};

// ----- piazzale: lastre, cordolo, aiuole, panchine, lampioni, chioschi, bandiere, tifosi; ai varchi tornelli, biglietterie, code, statue o pullman -----
function arenaPlaza(g,f,H,rom,t1,t2,gt){const{A,B,P,n}=f,pa=A+P,pb=B+P;
 g.beginPath();sePath(g,pa+5,pb+5,n);g.fillStyle='rgba(0,0,0,.16)';g.fill();
 g.beginPath();sePath(g,pa,pb,n);g.fillStyle=rom?'#bcae8e':'#8e8b85';g.fill();
 g.strokeStyle=rom?'rgba(90,70,40,.2)':'rgba(255,255,255,.08)';g.lineWidth=1;
 for(let k=1;k<5;k++){g.beginPath();sePath(g,A+P*k/5,B+P*k/5,n);g.stroke()}
 g.beginPath();for(let i=0;i<180;i++){const t=i/180*TAU,p=sePt(A-10,B-10,n,t),q=sePt(pa,pb,n,t);g.moveTo(p[0],p[1]);g.lineTo(q[0],q[1])}g.stroke();
 for(let i=0;i<40;i++){const t=H(i,10)*TAU,k=H(i,11),p=sePt(A+P*k,B+P*k,n,t);g.fillStyle=rom?'rgba(120,100,60,.13)':'rgba(0,0,0,.08)';g.beginPath();g.ellipse(p[0],p[1],6+H(i,12)*16,3+H(i,13)*6,H(i,14)*3,0,TAU);g.fill()}
 g.beginPath();sePath(g,pa,pb,n);g.strokeStyle=rom?'#8f7f5c':'#c9c6bf';g.lineWidth=3;g.stroke();
 g.beginPath();sePath(g,pa-3,pb-3,n);g.strokeStyle='rgba(0,0,0,.15)';g.lineWidth=1;g.stroke();
 // mosaico/rosa dei venti davanti a ogni varco, poi tornelli, biglietterie e la coda
 const gp=gt.map(q=>[q[0]?Math.sign(q[0])*(A+P/2):0,q[1]?Math.sign(q[1])*(B+P/2):0,q[0]?(q[0]>0?0:Math.PI):(q[1]>0?Math.PI/2:-Math.PI/2)]);
 gp.forEach((q,i)=>{g.save();g.translate(q[0],q[1]);g.rotate(q[2]);
  g.fillStyle=rom?'#a8946a':'#6f7278';g.beginPath();g.arc(0,0,24,0,TAU);g.fill();
  g.fillStyle=rom?'#7a2e1e':t1;g.beginPath();for(let k=0;k<8;k++){const r=k%2?9:21,t=k/8*TAU;g.lineTo(Math.cos(t)*r,Math.sin(t)*r)}g.closePath();g.fill();
  g.fillStyle=rom?'#e8dcc0':t2;g.beginPath();g.arc(0,0,6,0,TAU);g.fill();
  g.strokeStyle='#cfd3d8';g.lineWidth=1.6;for(let k=-4;k<=4;k++){g.beginPath();g.moveTo(-P/2+8,k*9);g.lineTo(-P/2+15,k*9);g.stroke()}   // tornelli
  g.fillStyle='#2b2e33';g.fillRect(-P/2+7,-40,10,80);g.fillStyle='rgba(255,255,255,.15)';for(let k=-4;k<4;k++)g.fillRect(-P/2+8,k*9+2,8,5);
  for(const sd of[-1,1]){veh(g,'booth',-P/2+22,sd*52,0,rom?'#8a6a3a':t1,1.6)}
  for(let k=0;k<10;k++){const x=-P/2+20+k*4.2+(H(i*20+k,15)-.5)*3,y=(H(i*20+k,16)-.5)*28;afig(g,x,y,Math.PI+(H(k,17)-.5),rom?ROMAN_CL[(H(i*20+k,18)*ROMAN_CL.length)|0]:ARENA_SHIRT[(H(i*20+k,18)*ARENA_SHIRT.length)|0],.9)}   // gente in coda
  if(rom){for(const sd of[-1,1]){g.fillStyle='#d8d0bc';g.fillRect(P/2-18,sd*44-8,16,16);g.fillStyle='#8a5a2a';g.beginPath();g.ellipse(P/2-10,sd*44,4,5,0,0,TAU);g.fill();g.fillStyle='#6a4a22';g.beginPath();g.arc(P/2-10,sd*44,2.4,0,TAU);g.fill()}}   // statue di bronzo sui piedistalli
  g.restore()});
 // oggetti lungo il piazzale
 const pts=seEven(A+P*.42,B+P*.42,n,40),L=pts.length;
 for(let i=0;i<L;i++){const p=pts[i],q=pts[(i+1)%L],ta=Math.atan2(q[1]-p[1],q[0]-p[0]);if(gp.some(z=>Math.hypot(p[0]-z[0],p[1]-z[1])<95))continue;
  const k=(H(i,20)*10)|0,ox=p[0],oy=p[1];
  if(k<2)veh(g,'bench',ox,oy,ta,null,1.3);
  else if(k==2){g.fillStyle='#2b2e33';g.beginPath();g.arc(ox,oy,2.6,0,TAU);g.fill();g.fillStyle='rgba(255,240,190,.22)';g.beginPath();g.arc(ox,oy,9,0,TAU);g.fill();g.fillStyle='#fff3c0';g.beginPath();g.arc(ox,oy,1.4,0,TAU);g.fill()}   // lampione
  else if(k==3)veh(g,'stall',ox,oy,ta,rom?pick2(['#b5523b','#c9a227','#7a5a36'],H(i,21)):pick2([t1,t2,'#e74c3c','#f1c40f','#2e86c1'],H(i,21)),1.2,{w:20,h:12});   // chiosco di cibo e bevande
  else if(k==4){for(let j=0;j<4+((H(i,22)*4)|0);j++)afig(g,ox+(H(i*9+j,23)-.5)*22,oy+(H(i*9+j,24)-.5)*14,H(i*9+j,25)*TAU,rom?ROMAN_CL[(H(i*9+j,26)*ROMAN_CL.length)|0]:(H(i*9+j,26)<.6?t1:ARENA_SHIRT[(H(i*9+j,27)*ARENA_SHIRT.length)|0]),.95)}   // gruppetto di tifosi
  else if(k==5){g.fillStyle='#3a3d42';g.beginPath();g.arc(ox,oy,2,0,TAU);g.fill();g.save();g.translate(ox,oy);g.rotate(.4);g.fillStyle=rom?'#7a2e1e':(i%2?t1:t2);g.fillRect(1,-1,14,8);g.fillStyle='rgba(255,255,255,.25)';g.fillRect(1,-1,14,2);g.restore()}   // pennone con bandiera
  else if(k==6&&!rom)veh(g,'booth',ox,oy,ta,'#7f8c8d',1.1);   // edicola / merchandising
  else if(k==7){g.fillStyle='#3d4046';g.fillRect(ox-3,oy-3,6,6);g.fillStyle='#5d6066';g.fillRect(ox-2,oy-2,4,4)}   // cestino
  else if(k==8&&!rom){g.strokeStyle='#9aa1a8';g.lineWidth=1;for(let j=-2;j<=2;j++){g.beginPath();g.arc(ox+j*4,oy,2.4,Math.PI,0);g.stroke()}}   // rastrelliera bici
 }
 // pullman delle squadre (o carri dei gladiatori) vicino a una testata
 if(!rom&&H(5,30)<.8){const sd=H(5,31)<.5?1:-1;for(let j=0;j<2;j++)veh(g,'bus',sd*(A+P*.55),(j?-1:1)*(B*.42+(H(j,32)*30)),Math.PI/2,j?t2:t1,1.3)}
 if(rom){const sd=H(5,31)<.5?1:-1;veh(g,'horse',sd*(A+P*.5),-B*.4,Math.PI/2,'#7a4a2a',1.2);veh(g,'horse',sd*(A+P*.5)+9,-B*.4,Math.PI/2,'#d9cfc0',1.2)}}
const pick2=(a,h)=>a[(h*a.length)|0];

// ----- tribune: gradoni, settori colorati, scale, vomitori, pubblico seduto; ai varchi i tunnel d'ingresso -----
function arenaStands(g,f,H,rom,t1,t2,gt){const{A,B,D,n}=f,a=A-D,b=B-D,nr=Math.max(6,Math.round(D/7.5)),dr=D/nr,nS=rom?32:24;
 // gradoni: dall'esterno verso l'interno, ognuno col suo bordo (alzata)
 for(let j=nr-1;j>=0;j--){g.beginPath();sePath(g,a+(j+1)*dr,b+(j+1)*dr,n);
  g.fillStyle=rom?(j%2?'#cdbf9c':'#bfb08c'):(j%2?'#61666e':'#585c64');g.fill();g.strokeStyle=rom?'rgba(80,60,30,.4)':'rgba(0,0,0,.4)';g.lineWidth=1;g.stroke()}
 // corridoi orizzontali (precinzioni): uno nei palazzetti, due negli stadi grandi
 const walk=nr>=11?[Math.round(nr/3),Math.round(nr*2/3)]:[Math.round(nr/2)];
 for(const j of walk){g.beginPath();sePath(g,a+(j+1)*dr,b+(j+1)*dr,n);sePath(g,a+j*dr,b+j*dr,n);g.fillStyle=rom?'#d8ccad':'#4a4e55';g.fill('evenodd')}
 // posti e pubblico (file in cache sull'elemento: si ricalcolano una volta sola)
 if(!f._rw){f._rw=[];for(let j=0;j<nr;j++)f._rw.push(seEven(a+(j+.5)*dr,b+(j+.5)*dr,n,4.6))}
 const cr=.35+H(4,4)*.6,mode=(H(3,3)*4)|0,awayS=(H(6,6)*nS)|0;
 const seatCol=s=>rom?null:mode==0?shade(t1,-.15):mode==1?(s%2?shade(t1,-.15):shade(t2,-.15)):mode==2?(s<nS/2?shade(t1,-.15):'#9aa1a8'):shade('#9aa1a8',-.2);
 for(let j=0;j<nr;j++){if(walk.includes(j))continue;const R0=f._rw[j],L=R0.length;
  for(let i=0;i<L;i++){const p=R0[i],fr=i/L*nS,s=fr|0,inS=(fr-s)*L/nS;if(inS<1.4)continue;   // scala fra i settori
   if(arenaInGate(gt,p[0],p[1],ARENA_GW))continue;
   const den=clamp(cr*(.5+H(s,40)*.9),0,1),h=hs(i,j*977+(f.s|0),DC.seed+50);
   if(h<den){const away=Math.abs(s-awayS)<=1&&!rom,c=rom?ROMAN_CL[(hs(i,j,DC.seed+51)*ROMAN_CL.length)|0]:away?t2:(hs(i,j,DC.seed+52)<.55?t1:ARENA_SHIRT[(hs(i,j,DC.seed+51)*ARENA_SHIRT.length)|0]);
    g.fillStyle=c;g.fillRect(p[0]-1.7,p[1]-1.7,3.4,3.4);g.fillStyle=ARENA_SKIN[(hs(i,j,DC.seed+53)*ARENA_SKIN.length)|0];g.fillRect(p[0]-.8,p[1]-.8,1.6,1.6)}
   else if(!rom){g.fillStyle=seatCol(s);g.fillRect(p[0]-1.3,p[1]-1.3,2.6,2.6)}
   else if(h<den+.05){g.fillStyle='rgba(120,30,20,.6)';g.fillRect(p[0]-1,p[1]-1,2,2)}}}   // cuscini lasciati sulla pietra
 // scale fra i settori e vomitori sui corridoi
 for(let s=0;s<nS;s++){const pl=[];for(let j=0;j<nr;j++){const R0=f._rw[j];pl.push(R0[Math.round(s/nS*R0.length)%R0.length])}
  if(arenaInGate(gt,pl[0][0],pl[0][1],ARENA_GW+8))continue;
  aLine(g,pl,rom?'#e3d8bd':'#8d9299',4);aLine(g,pl,rom?'rgba(90,70,40,.45)':'rgba(0,0,0,.35)',4,[1,2.2]);
  for(const j of walk){const R0=f._rw[j],p=R0[Math.round((s+.5)/nS*R0.length)%R0.length],q=R0[(Math.round((s+.5)/nS*R0.length)+1)%R0.length];
   if(arenaInGate(gt,p[0],p[1],ARENA_GW+8))continue;g.save();g.translate(p[0],p[1]);g.rotate(Math.atan2(q[1]-p[1],q[0]-p[0]));g.fillStyle='#1a1c20';g.fillRect(-6,-dr*.5,12,dr*.9);g.fillStyle=rom?'#a8946a':'#3b9b52';g.fillRect(-6,-dr*.5-1.2,12,1.2);g.restore()}}
 // tunnel d'ingresso ai varchi: pavimento scuro, luci, cartello
 for(const q of gt){g.save();if(q[0]){g.scale(Math.sign(q[0]),1)}else{g.rotate(Math.PI/2);g.scale(Math.sign(q[1]),1)}
  const r0=(q[0]?a:b)-6,r1=(q[0]?A:B)+2,w=ARENA_GW;g.fillStyle=rom?'#6b5a3e':'#33363b';g.fillRect(r0,-w,r1-r0,2*w);g.fillStyle=rom?'#5a4a30':'#2a2c30';g.fillRect(r0,-w,r1-r0,5);g.fillRect(r0,w-5,r1-r0,5);
  g.strokeStyle=rom?'rgba(255,230,180,.18)':'rgba(255,255,255,.14)';g.lineWidth=1;g.setLineDash([6,6]);g.beginPath();g.moveTo(r0,-w*.4);g.lineTo(r1,-w*.4);g.moveTo(r0,w*.4);g.lineTo(r1,w*.4);g.stroke();g.setLineDash([]);
  g.fillStyle=rom?'rgba(255,170,60,.7)':'rgba(255,250,220,.75)';for(let x=r0+8;x<r1-4;x+=14)g.fillRect(x,-1,3,2);
  if(!rom){g.fillStyle='#1d8f4e';g.fillRect(r1-14,-w+6,10,6);g.fillStyle='#fff';g.fillRect(r1-12,-w+8,6,2)}
  g.restore()}}

// ----- bordo del campo e cose sopra le tribune: parapetto (marmo o LED), bocche dei tunnel, torri faro, tabelloni, copertura, velario, palchi -----
function arenaRim(g,f,H,rom,t1,t2,gt){const{A,B,D,n}=f,a=A-D,b=B-D;
 g.beginPath();sePath(g,a+3,b+3,n);g.strokeStyle=rom?'#efe8d8':'#1b1e23';g.lineWidth=7;g.stroke();
 if(rom){g.beginPath();sePath(g,a,b,n);g.strokeStyle='#8a2a1c';g.lineWidth=1.5;g.stroke()}
 else{const P0=seEven(a+3,b+3,n,22),cols=[t1,t2,'#f1c40f','#ecf0f1','#2e86c1','#e74c3c'];for(let i=0;i<P0.length;i++){const p=P0[i],q=P0[(i+1)%P0.length];if(arenaInGate(gt,p[0],p[1],ARENA_GW))continue;aLine(g,[p,q],cols[(i+((H(7,7)*6)|0))%cols.length],4)}}   // cartelloni LED
 for(const q of gt){const x=q[0]?Math.sign(q[0])*a:0,y=q[1]?Math.sign(q[1])*b:0,ang=q[0]?(q[0]>0?0:Math.PI):(q[1]>0?Math.PI/2:-Math.PI/2);g.save();g.translate(x,y);g.rotate(ang);
  const w=ARENA_GW;g.fillStyle='#141518';g.beginPath();g.ellipse(2,0,w*.55,w,0,Math.PI/2,-Math.PI/2,true);g.fill();g.fillStyle=rom?'#6b4a22':'#555a61';g.fillRect(-2,-w,5,2*w);   // bocca del tunnel (cancello a grata)
  g.strokeStyle=rom?'#3b2a14':'#888';g.lineWidth=1;for(let k=-w+4;k<=w-4;k+=6){g.beginPath();g.moveTo(-2,k);g.lineTo(3,k);g.stroke()}g.restore()}
 if(rom){
  // velario: teli tesi sopra i gradoni alti, tirati da funi verso il centro; pali sul bordo esterno
  const nV=32,r0=.5;
  for(let s=0;s<nV;s++){if(H(s,60)<.3)continue;const t0=s/nV*TAU,t1v=(s+1)/nV*TAU;g.beginPath();
   for(let k=0;k<=6;k++){const p=sePt(A-6,B-6,n,t0+(t1v-t0)*k/6);k?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1])}
   for(let k=6;k>=0;k--){const p=sePt(a+D*r0,b+D*r0,n,t0+(t1v-t0)*k/6);g.lineTo(p[0],p[1])}g.closePath();g.fillStyle=s%2?'rgba(239,226,196,.86)':'rgba(201,111,59,.82)';g.fill();g.strokeStyle='rgba(90,50,20,.35)';g.lineWidth=.8;g.stroke()}
  g.strokeStyle='rgba(60,40,20,.22)';g.lineWidth=.7;g.beginPath();for(let s=0;s<nV*2;s++){const t=s/(nV*2)*TAU,p=sePt(a+D*r0,b+D*r0,n,t),q=sePt(a*.55,b*.55,n,t);g.moveTo(p[0],p[1]);g.lineTo(q[0],q[1])}g.stroke();
  g.fillStyle='#5a3a1a';for(let s=0;s<nV*2;s++){const p=sePt(A-4,B-4,n,s/(nV*2)*TAU);g.beginPath();g.arc(p[0],p[1],2,0,TAU);g.fill()}
  // pulvinare dell'imperatore (porpora e oro) e palco delle vestali di fronte
  const box=(x,y,c,e,k)=>{g.save();g.translate(x,y);g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-27,-11,58,26);g.fillStyle=c;g.fillRect(-29,-13,58,26);g.strokeStyle=e;g.lineWidth=2;g.strokeRect(-29,-13,58,26);
   for(let i=0;i<6;i++){g.fillStyle=i%2?e:c;g.fillRect(-29+i*58/6,-13,58/6,6)}for(let i=0;i<k;i++)afig(g,-16+i*32/(k-1||1),4,Math.PI/2*Math.sign(-y),i==((k/2)|0)?'#d4a017':'#f4efe2',1.2);g.restore()};
  box(-70,b+D*.3,'#5b2a6e','#d4a017',5);box(70,-(b+D*.3),'#f4efe2','#b5523b',4)}
 else{
  // copertura trasparente sopra le file alte di un lato lungo (se non c'è la tribuna coperta lì)
  if(f.n>=3&&H(8,8)<.6){g.save();g.beginPath();g.rect(-a*.9,0,a*1.8,B+4);g.clip();g.beginPath();sePath(g,A-2,B-2,n);sePath(g,a+D*.35,b+D*.35,n);g.fillStyle='rgba(205,212,220,.55)';g.fill('evenodd');
   g.strokeStyle='rgba(60,66,74,.5)';g.lineWidth=1.2;g.beginPath();for(let x=-a*.9;x<=a*.9;x+=18){g.moveTo(x,b+D*.3);g.lineTo(x,B)}g.stroke();g.restore()}
  // torri faro sulle quattro diagonali, con la luce sul campo
  for(let k=0;k<4;k++){const t=Math.PI/4+k*Math.PI/2,p=sePt(A-12,B-12,n,t),q=sePt(A-12,B-12,n,t+.02),ang=Math.atan2(q[1]-p[1],q[0]-p[0]);g.save();g.translate(p[0],p[1]);g.rotate(ang);
   g.fillStyle='rgba(0,0,0,.35)';g.fillRect(-14,-3,32,12);g.fillStyle='#2a2d32';g.fillRect(-16,-6,32,12);g.fillStyle='#fffbe0';for(let i=0;i<6;i++)for(let j=0;j<2;j++)g.fillRect(-14+i*5,-4+j*5,4,3.5);g.fillStyle='#3a3d42';g.fillRect(-3,6,6,6);g.restore()}
  g.save();g.beginPath();sePath(g,a,b,n);g.clip();const gr=g.createRadialGradient(0,0,0,0,0,Math.max(a,b));gr.addColorStop(0,'rgba(255,255,240,.1)');gr.addColorStop(1,'rgba(255,255,240,0)');g.fillStyle=gr;g.fillRect(-a,-b,2*a,2*b);g.restore()
  // maxischermi con il punteggio
  const sc=[(H(9,9)*5)|0,(H(10,10)*4)|0];
  for(const t of[.42,Math.PI+.42]){const p=sePt(a+D*.62,b+D*.62,n,t),q=sePt(a+D*.62,b+D*.62,n,t+.02);if(arenaInGate(gt,p[0],p[1],40))continue;g.save();g.translate(p[0],p[1]);g.rotate(Math.atan2(q[1]-p[1],q[0]-p[0])+Math.PI);
   g.fillStyle='rgba(0,0,0,.35)';g.fillRect(-28,-9,60,22);g.fillStyle='#0d0f12';g.fillRect(-30,-11,60,22);g.strokeStyle=t1;g.lineWidth=2;g.strokeRect(-30,-11,60,22);
   g.fillStyle=t1;g.fillRect(-27,-8,14,16);g.fillStyle=t2;g.fillRect(13,-8,14,16);aText(g,sc[0]+' - '+sc[1],0,0,9,'#ffe14d');g.restore()}
  // palco autorità / tribuna stampa (vetrata) sul lato lungo libero
  if(!arenaInGate(gt,70,b+D*.45,30)){g.save();g.translate(70,b+D*.45);g.fillStyle='#1e2a36';g.fillRect(-30,-9,60,18);g.fillStyle='rgba(140,200,240,.55)';for(let i=0;i<6;i++)g.fillRect(-28+i*10,-7,8,7);g.fillStyle='#d8dde3';g.fillRect(-30,7,60,2);g.restore()}
  // bandierine sul bordo alto
  const PB=seEven(A-4,B-4,n,58);PB.forEach((p,i)=>{if(arenaInGate(gt,p[0],p[1],30))return;g.save();g.translate(p[0],p[1]);g.fillStyle='#ddd';g.fillRect(-1,-1,2,2);g.fillStyle=i%2?t1:t2;g.beginPath();g.moveTo(0,0);g.lineTo(9,2);g.lineTo(0,5);g.fill();g.restore()})}}

// ----- i campi: (g,f,a,b,n,H,t1,t2), già ritagliati sulla superellisse interna -----
const ARENA_FIELD=[
 // 0 GLADIATORI: sabbia rastrellata, botole dell'ipogeo, sangue, bracieri, coppie di gladiatori, carro, leone, armi a terra
 (g,f,a,b,n,H)=>{g.fillStyle='#d6bd85';g.fillRect(-a,-b,2*a,2*b);
  for(let i=0;i<1400;i++){const x=(H(i,100)-.5)*2*a,y=(H(i,101)-.5)*2*b;g.fillStyle=H(i,102)<.5?'rgba(120,90,40,.2)':'rgba(255,245,220,.25)';g.fillRect(x,y,1.2+H(i,103)*1.6,1.2)}
  g.strokeStyle='rgba(140,105,55,.2)';g.lineWidth=1;for(let k=.12;k<1;k+=.055){g.beginPath();sePath(g,a*k,b*k,n,90);g.stroke()}
  // ipogeo: corridoio centrale e due file di botole di legno
  g.strokeStyle='rgba(80,55,25,.4)';g.lineWidth=2;g.setLineDash([10,6]);g.beginPath();g.moveTo(-a*.8,0);g.lineTo(a*.8,0);g.stroke();g.setLineDash([]);
  for(let x=-a*.6;x<=a*.6+1;x+=a*.15)for(const sy of[-1,1]){const y=sy*b*.3;g.fillStyle='#6b4f2a';g.fillRect(x-7,y-7,14,14);g.strokeStyle='#3b2a14';g.lineWidth=1;g.strokeRect(x-7,y-7,14,14);g.beginPath();g.moveTo(x-7,y-2.3);g.lineTo(x+7,y-2.3);g.moveTo(x-7,y+2.3);g.lineTo(x+7,y+2.3);g.stroke();g.fillStyle='#2a1d0e';g.fillRect(x+3,y-1,2,2)}
  // sangue
  for(let i=0;i<10;i++){const x=(H(i,110)-.5)*a*1.4,y=(H(i,111)-.5)*b*1.4;g.fillStyle='rgba(110,18,12,.55)';g.beginPath();g.ellipse(x,y,4+H(i,112)*9,3+H(i,113)*5,H(i,114)*3,0,TAU);g.fill();g.fillStyle='rgba(110,18,12,.45)';for(let k=0;k<6;k++)g.fillRect(x+(H(i*7+k,115)-.5)*26,y+(H(i*7+k,116)-.5)*18,1.6,1.6)}
  // bracieri
  for(let k=0;k<4;k++){const p=sePt(a*.88,b*.88,n,Math.PI/4+k*Math.PI/2);g.fillStyle='#3a3530';g.beginPath();g.arc(p[0],p[1],5,0,TAU);g.fill();veh(g,'fire',p[0],p[1],0,null,1.1)}
  // gladiatori: mirmillone (scudo rettangolare) contro reziario (rete e tridente)
  const glad=(x,y,ang,ret)=>{g.save();g.translate(x,y);g.rotate(ang);
   if(ret){g.strokeStyle='rgba(60,50,30,.6)';g.lineWidth=.6;g.beginPath();g.arc(-6,7,6,0,TAU);for(let k=-5;k<=5;k+=2.5){g.moveTo(-12,7+k);g.lineTo(0,7+k);g.moveTo(-6+k,1);g.lineTo(-6+k,13)}g.stroke();
    aLine(g,[[0,-3],[13,-3]],'#7a5a36',1.2);aLine(g,[[13,-5],[16,-5]],'#aaa',.8);aLine(g,[[13,-3],[16,-3]],'#aaa',.8);aLine(g,[[13,-1],[16,-1]],'#aaa',.8);aLine(g,[[13,-5],[13,-1]],'#aaa',.8)}
   else{g.fillStyle='#9c2a1a';g.fillRect(3,-6,3,10);g.strokeStyle='#d4a017';g.lineWidth=.6;g.strokeRect(3,-6,3,10);aLine(g,[[2,4],[9,5]],'#cfd3d8',1.2)}
   afig(g,0,0,0,ret?'#c9b28a':'#8a6a3a',1.5,'#c68642');g.fillStyle=ret?'#c68642':'#9aa1a8';g.beginPath();g.arc(.4,0,2.1,0,TAU);g.fill();if(!ret){g.fillStyle='#c0392b';g.fillRect(-1.5,-.5,3,1)}g.restore()};
  const np=1+((H(1,120)*3)|0);for(let i=0;i<np;i++){const x=(H(i,121)-.5)*a*1.1,y=(H(i,122)-.5)*b*.9,an=H(i,123)*TAU;glad(x,y,an,0);glad(x+Math.cos(an)*14,y+Math.sin(an)*14,an+Math.PI,1);
   if(i==0)afig(g,x+Math.cos(an+1.6)*16,y+Math.sin(an+1.6)*16,an-1.6,'#f4efe2',1.3)}   // summa rudis (arbitro)
  // carro con due cavalli
  if(H(2,124)<.6){const x=(H(2,125)-.5)*a,y=(H(2,126)<.5?-1:1)*b*.55,an=H(2,127)<.5?0:Math.PI;g.save();g.translate(x,y);g.rotate(an);veh(g,'horse',8,-3.5,0,'#f4f1e8',1);veh(g,'horse',8,3.5,0,'#2a2018',1);
   g.fillStyle='#8a5a2a';g.beginPath();g.arc(-6,0,6,Math.PI/2,-Math.PI/2);g.fill();g.fillStyle='#d4a017';g.fillRect(-7,-7,2,14);aLine(g,[[-6,0],[4,0]],'#5a3a1a',1);afig(g,-6,0,0,'#c0392b',1.2);
   g.strokeStyle='rgba(120,90,40,.4)';g.lineWidth=1;g.beginPath();g.moveTo(-8,-7);g.lineTo(-60,-9);g.moveTo(-8,7);g.lineTo(-60,9);g.stroke();g.restore()}
  // leone
  if(H(3,128)<.55){const x=(H(3,129)-.5)*a*1.2,y=(H(3,130)-.5)*b,an=H(3,131)*TAU;g.save();g.translate(x,y);g.rotate(an);g.fillStyle='rgba(0,0,0,.25)';g.beginPath();g.ellipse(1,2,10,4.5,0,0,TAU);g.fill();
   g.fillStyle='#c8913a';g.beginPath();g.ellipse(0,0,9,4,0,0,TAU);g.fill();g.fillStyle='#7a4a1a';g.beginPath();g.arc(7,0,4.6,0,TAU);g.fill();g.fillStyle='#d9a24a';g.beginPath();g.arc(8.5,0,2.6,0,TAU);g.fill();aLine(g,[[-9,0],[-14,2],[-16,1]],'#c8913a',1.2);g.restore()}
  // armi e scudi abbandonati
  for(let i=0;i<8;i++){const x=(H(i,140)-.5)*a*1.5,y=(H(i,141)-.5)*b*1.4,an=H(i,142)*TAU,k=(H(i,143)*3)|0;g.save();g.translate(x,y);g.rotate(an);
   if(k==0){g.fillStyle='#b8862a';g.beginPath();g.arc(0,0,4,0,TAU);g.fill();g.fillStyle='#8a5a1a';g.beginPath();g.arc(0,0,1.4,0,TAU);g.fill()}else if(k==1)aLine(g,[[-5,0],[5,0]],'#cfd3d8',1.4);else{aLine(g,[[-7,0],[7,0]],'#7a5a36',1);aLine(g,[[7,-2],[9,-2]],'#aaa',.7);aLine(g,[[7,2],[9,2]],'#aaa',.7)}g.restore()}},

 // 1 CALCIO: erba a strisce, linee regolamentari, porte con la rete, panchine, cartelloni, 22 giocatori, arbitro e guardalinee, fotografi
 (g,f,a,b,n,H,t1,t2)=>{g.fillStyle='#3a8a37';g.fillRect(-a,-b,2*a,2*b);
  const fit=seFit(a,b,n,105/68),sx=fit[0]*.86/52.5,hw=52.5*sx,hh=34*sx;
  for(let i=-14;i<14;i++)if(i%2==0){g.fillStyle='rgba(255,255,255,.07)';g.fillRect(i*hw/9,-b,hw/9,2*b)}
  g.fillStyle='rgba(0,0,0,.05)';for(let j=-8;j<8;j+=2)g.fillRect(-a,j*hh/6,2*a,hh/6);
  for(let i=0;i<60;i++){g.fillStyle='rgba(120,90,40,.12)';g.beginPath();g.ellipse((H(i,200)-.5)*hw*.6+(H(i,201)<.5?-1:1)*hw*.85,(H(i,202)-.5)*hh*.5,3+H(i,203)*5,2,0,0,TAU);g.fill()}   // erba consumata davanti alle porte
  g.strokeStyle='rgba(255,255,255,.92)';g.lineWidth=1.5;g.strokeRect(-hw,-hh,2*hw,2*hh);
  g.beginPath();g.moveTo(0,-hh);g.lineTo(0,hh);g.stroke();g.beginPath();g.arc(0,0,9.15*sx,0,TAU);g.stroke();g.fillStyle='#fff';g.beginPath();g.arc(0,0,1.6,0,TAU);g.fill();
  for(const sd of[-1,1]){g.strokeRect(sd>0?hw-16.5*sx:-hw,-20.16*sx,16.5*sx,40.32*sx);g.strokeRect(sd>0?hw-5.5*sx:-hw,-9.16*sx,5.5*sx,18.32*sx);
   const px=sd*(hw-11*sx);g.beginPath();g.arc(px,0,1.3,0,TAU);g.fill();const th=Math.acos(5.5/9.15);g.beginPath();if(sd>0)g.arc(px,0,9.15*sx,Math.PI-th,Math.PI+th);else g.arc(px,0,9.15*sx,-th,th);g.stroke();
   for(const sy of[-1,1]){const c=Math.atan2(-sy,-sd);g.beginPath();g.arc(sd*hw,sy*hh,Math.max(2,sx),c-Math.PI/4,c+Math.PI/4);g.stroke();
    aLine(g,[[sd*hw,sy*hh],[sd*hw,sy*hh-sy*4]],'#ddd',1);g.fillStyle='#f1c40f';g.beginPath();g.moveTo(sd*hw,sy*hh-sy*4);g.lineTo(sd*hw+sd*4,sy*hh-sy*3);g.lineTo(sd*hw,sy*hh-sy*2);g.fill()}   // bandierine d'angolo
   const gx=sd*hw,gd=2.2*sx,gw=3.66*sx;g.fillStyle='rgba(255,255,255,.18)';g.fillRect(sd>0?gx:gx-gd,-gw,gd,2*gw);g.strokeStyle='rgba(255,255,255,.45)';g.lineWidth=.6;g.beginPath();for(let y=-gw;y<=gw;y+=2.2){g.moveTo(gx,y);g.lineTo(gx+sd*gd,y)}for(let x=0;x<=gd;x+=2.2){g.moveTo(gx+sd*x,-gw);g.lineTo(gx+sd*x,gw)}g.stroke();
   g.strokeStyle='#fff';g.lineWidth=2;g.beginPath();g.moveTo(gx,-gw);g.lineTo(gx+sd*gd,-gw);g.lineTo(gx+sd*gd,gw);g.lineTo(gx,gw);g.stroke();g.strokeStyle='rgba(255,255,255,.92)';g.lineWidth=1.5}
  // panchine coperte e area tecnica
  for(const sd of[-1,1]){const x=sd*12*sx,y=hh+4*sx;g.fillStyle='rgba(20,30,40,.55)';g.fillRect(x-6*sx,y,12*sx,2.6*sx);g.strokeStyle='rgba(200,230,255,.5)';g.lineWidth=1;g.strokeRect(x-6*sx,y,12*sx,2.6*sx);
   for(let k=0;k<7;k++)afig(g,x-5*sx+k*1.6*sx,y+1.3*sx,-Math.PI/2,sd<0?t1:t2,.8);g.strokeStyle='rgba(255,255,255,.6)';g.setLineDash([2,2]);g.strokeRect(x-8*sx,hh+.6*sx,16*sx,3*sx);g.setLineDash([])}
  // fotografi dietro le porte
  for(const sd of[-1,1])for(let k=0;k<6;k++)afig(g,sd*(hw+3.5*sx),(-6+k*2.4+H(k*sd+9,210))*sx,sd>0?Math.PI:0,'#3d4046',.85);
  // giocatori (4-4-2), portieri, palla, arbitro e guardalinee
  const F=[[-.94,0],[-.68,-.62],[-.7,-.22],[-.7,.22],[-.68,.62],[-.38,-.66],[-.4,-.22],[-.4,.22],[-.38,.66],[-.12,-.24],[-.1,.26]],sh=(H(1,220)-.5)*.5;
  F.forEach((q,i)=>{const j=(H(i,221)-.5)*.08;afig(g,(q[0]+(i?sh:0)+j)*hw,(q[1]+j)*hh,0,i?t1:'#f1c40f',1.2);afig(g,(-q[0]+(i?sh:0)-j)*hw,(q[1]-j*.5)*hh,Math.PI,i?t2:'#27ae60',1.2)});
  const bx=(sh+(H(2,222)-.5)*.3)*hw,by=(H(3,223)-.5)*hh;g.fillStyle='#fff';g.beginPath();g.arc(bx,by,1.6,0,TAU);g.fill();g.fillStyle='#111';g.fillRect(bx-.5,by-.5,1,1);
  afig(g,bx-8,by+10,Math.PI/2,'#111',1.1);afig(g,sh*hw*.5,-hh-1.5*sx,Math.PI/2,'#f1c40f',1);afig(g,-sh*hw*.5,hh+1.5*sx,-Math.PI/2,'#f1c40f',1);
  // cartelloni a bordo campo
  const ad=[t1,t2,'#ecf0f1','#e74c3c','#2e86c1','#f39c12'];for(const sy of[-1,1])for(let x=-hw;x<hw;x+=12*sx){g.fillStyle=ad[((x/sx|0)+sy*3+99)%ad.length];g.fillRect(x+.5,sy*(hh+7*sx)-1,12*sx-1,2.4)}},

 // 2 BASKET: pavimento del palazzetto, parquet a listelli, aree dipinte, linee da tre punti, canestri, panchine, tavolo dei giudici, posti a bordo campo, cheerleader
 (g,f,a,b,n,H,t1,t2)=>{g.fillStyle='#2a2e35';g.fillRect(-a,-b,2*a,2*b);
  const fit=seFit(a,b,n,28/15),sx=fit[0]*.8/14,hw=14*sx,hh=7.5*sx;
  g.fillStyle=shade(t1,-.35);g.fillRect(-hw-2*sx,-hh-2*sx,2*hw+4*sx,2*hh+4*sx);   // fascia esterna col colore di casa
  g.fillStyle='#c99258';g.fillRect(-hw,-hh,2*hw,2*hh);
  for(let y=-hh,r=0;y<hh;y+=2.2,r++){const off=H(r,300)*40;for(let x=-hw+off%30-30;x<hw;x+=30+H(r*7,301)*30){g.fillStyle=H(r*31+(x|0),302)<.5?'rgba(120,70,20,.12)':'rgba(255,230,190,.1)';g.fillRect(Math.max(-hw,x),y,Math.min(30,hw-x),2.1)}g.fillStyle='rgba(90,50,15,.18)';g.fillRect(-hw,y+2.1,2*hw,.25)}
  g.strokeStyle='#fff';g.lineWidth=1.3;
  for(const sd of[-1,1]){const bx=sd*(hw-1.575*sx);
   g.fillStyle=shade(t1,-.1);g.fillRect(sd>0?hw-5.8*sx:-hw,-2.45*sx,5.8*sx,4.9*sx);g.strokeRect(sd>0?hw-5.8*sx:-hw,-2.45*sx,5.8*sx,4.9*sx);   // area dei tre secondi
   g.beginPath();g.arc(sd*(hw-5.8*sx),0,1.8*sx,0,TAU);g.stroke();
   for(let k=1;k<4;k++)for(const sy of[-1,1])aLine(g,[[sd*(hw-(1.75+k*.9)*sx),sy*2.45*sx],[sd*(hw-(1.75+k*.9)*sx),sy*2.75*sx]],'#fff',1);   // tacche dei rimbalzi
   const th=Math.asin(6.6/6.75);g.beginPath();g.moveTo(sd*hw,-6.6*sx);g.lineTo(sd*(hw-1.575*sx-6.75*sx*Math.cos(th)),-6.6*sx);   // linea da tre punti
   if(sd>0)g.arc(bx,0,6.75*sx,Math.PI+th,Math.PI-th,true);else g.arc(bx,0,6.75*sx,-th,th);g.lineTo(sd*hw,6.6*sx);g.stroke();
   g.beginPath();g.arc(bx,0,1.25*sx,sd>0?Math.PI/2:-Math.PI/2,sd>0?Math.PI*1.5:Math.PI/2);g.stroke();
   aLine(g,[[sd*(hw-1.2*sx),-.9*sx],[sd*(hw-1.2*sx),.9*sx]],'#f4f4f4',2.2);g.strokeStyle='#ff6a1a';g.lineWidth=1.3;g.beginPath();g.arc(bx,0,Math.max(1.6,.23*sx),0,TAU);g.stroke();g.strokeStyle='#fff';g.lineWidth=1.3;
   g.fillStyle=t1;g.fillRect(sd*(hw+1.4*sx)-2,-3,4,6)}   // supporto imbottito del canestro
  g.strokeRect(-hw,-hh,2*hw,2*hh);g.beginPath();g.moveTo(0,-hh);g.lineTo(0,hh);g.stroke();g.fillStyle=t2;g.beginPath();g.arc(0,0,1.8*sx,0,TAU);g.fill();g.stroke();aText(g,'★',0,0,Math.max(8,sx*1.8),t1);
  // panchine, tavolo dei giudici, posti a bordo campo, cheerleader
  g.fillStyle='#1a1d22';g.fillRect(-3*sx,hh+1*sx,6*sx,1.2*sx);for(let k=0;k<4;k++)afig(g,-2*sx+k*1.3*sx,hh+2.6*sx,-Math.PI/2,'#2c3e50',.8);
  for(const sd of[-1,1])for(let k=0;k<8;k++){g.fillStyle='#3a3f47';g.fillRect(sd*(5+k*.95)*sx-2,hh+1.2*sx,4,4);afig(g,sd*(5+k*.95)*sx,hh+1.8*sx,-Math.PI/2,sd<0?t1:t2,.75)}
  for(const sy of[-1,1])for(let r=0;r<2;r++)for(let x=-hw+2;x<hw-2;x+=4.4){if(sy>0&&Math.abs(x)<hw*.9)continue;const h=H((x|0)+r*999+sy*7,310);g.fillStyle='#4a2a2a';g.fillRect(x,sy*(hh+(2.2+r*1.2)*sx)-1.6,3.4,3.2);if(h<.85){g.fillStyle=h<.4?t1:ARENA_SHIRT[(h*ARENA_SHIRT.length)|0];g.fillRect(x+.4,sy*(hh+(2.2+r*1.2)*sx)-1.2,2.6,2.4)}}
  for(let k=0;k<6;k++)afig(g,-hw-1*sx,(-3+k*1.2)*sx,0,k%2?'#ff69b4':'#ffffff',.9);
  // giocatori: attacco della squadra di casa verso destra
  const O=[[.62,0],[.8,-.62],[.8,.62],[.92,-.2],[.9,.22]],Dd=[[.7,-.05],[.84,-.5],[.84,.5],[.96,-.12],[.95,.15]];
  O.forEach((q,i)=>afig(g,q[0]*hw,q[1]*hh,0,t1,1.25));Dd.forEach((q,i)=>afig(g,q[0]*hw,q[1]*hh,Math.PI,t2,1.25));
  g.fillStyle='#e8752a';g.beginPath();g.arc(.6*hw+2,1,1.7,0,TAU);g.fill();
  for(const q of[[.5,-1.08],[.98,1.08],[.2,1.08]])afig(g,q[0]*hw,q[1]*hh,q[1]>0?-Math.PI/2:Math.PI/2,'#dcdcdc',1)},

 // 3 ATLETICA: pista rossa a 8 corsie, prato centrale, salto in lungo, alto, getto del peso, martello, giavellotto, siepi, ostacoli, atleti in gara
 (g,f,a,b,n,H,t1,t2)=>{g.fillStyle='#3d7f3a';g.fillRect(-a,-b,2*a,2*b);
  const fit=seFit(a,b,n,177/92.6);let sx=Math.min(fit[1]*1.08,b*.95)/46.3;if(sx*(42.2+46.3)>a*.97)sx=a*.97/(42.2+46.3);const s=42.2*sx;
  const stad=r=>{g.beginPath();g.moveTo(-s,-r);g.lineTo(s,-r);g.arc(s,0,r,-Math.PI/2,Math.PI/2);g.lineTo(-s,r);g.arc(-s,0,r,Math.PI/2,Math.PI*1.5);g.closePath()};
  stad(48*sx);g.fillStyle='#a9452f';g.fill();stad(36.5*sx);g.fillStyle='#3f8a3c';g.fill();
  g.save();stad(36.4*sx);g.clip();for(let i=-12;i<12;i+=2){g.fillStyle='rgba(255,255,255,.07)';g.fillRect(i*6*sx,-b,6*sx,2*b)}g.restore();
  g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=.9;for(let k=0;k<=8;k++){stad((36.5+1.22*k)*sx);g.stroke()}
  for(let k=0;k<8;k++)aText(g,String(k+1),s+4*sx,(36.5+1.22*k+.61)*sx,Math.max(5,sx*.9),'#fff',-Math.PI/2);
  for(let i=0;i<8;i++){const y=(36.5+1.22*i)*sx;aLine(g,[[s,y],[s,y+1.22*sx]],i%2?'#111':'#fff',3)}   // traguardo a scacchi
  for(let k=0;k<8;k++){const x=-s*.2+k*2.4*sx;aLine(g,[[x,-(36.5+1.22*k)*sx],[x,-(36.5+1.22*(k+1))*sx]],'#fff',1.2)}   // partenze scalate sul rettilineo opposto
  // ostacoli sul rettilineo d'arrivo
  for(let x=-s*.7;x<s*.6;x+=9*sx)for(let k=0;k<8;k++){const y=(36.5+1.22*k)*sx;aLine(g,[[x,y+1.5],[x,y+1.22*sx-1.5]],'#f4f4f4',1.6);aLine(g,[[x,y+1.5],[x,y+3]],'#222',1.6)}
  // riviera delle siepi (dentro la curva)
  {const r=34*sx;g.fillStyle='#2a7fb0';g.fillRect(-s-r*.9,-4*sx,3.6*sx,8*sx);g.strokeStyle='#ddd';g.lineWidth=1;g.strokeRect(-s-r*.9,-4*sx,3.6*sx,8*sx);aLine(g,[[-s-r*.9+3.6*sx,-4*sx],[-s-r*.9+3.6*sx,4*sx]],'#7a5a36',2)}
  // salto in lungo: pedana e buca di sabbia
  g.fillStyle='#8a3a28';g.fillRect(-s*.6,-30*sx,40*sx,1.4*sx);g.fillStyle='#e3d3a3';g.fillRect(-s*.6+40*sx,-31*sx,9*sx,3.4*sx);g.fillStyle='#fff';g.fillRect(-s*.6+38*sx,-30*sx,.6*sx,1.4*sx);
  // salto in alto: materasso e ritti
  g.fillStyle='#1f5fbf';g.fillRect(s+14*sx,-4*sx,5*sx,8*sx);g.fillStyle='#2f75e0';g.fillRect(s+14.4*sx,-3.6*sx,4.2*sx,7.2*sx);aLine(g,[[s+13.6*sx,-4.5*sx],[s+13.6*sx,4.5*sx]],'#f1c40f',1.2);g.fillStyle='#a9452f';g.beginPath();g.arc(s+6*sx,0,9*sx,Math.PI/2,-Math.PI/2);g.closePath();g.fill();
  // peso e martello: pedane circolari con il settore di lancio e la gabbia a C
  for(const[cx,cy,cg]of[[-s*.25,18*sx,0],[s*.35,20*sx,1]]){g.fillStyle='#9aa1a8';g.beginPath();g.arc(cx,cy,1.2*sx+1,0,TAU);g.fill();aLine(g,[[cx,cy],[cx+22*sx*Math.cos(-2.6),cy+22*sx*Math.sin(-2.6)]],'#fff',.8);aLine(g,[[cx,cy],[cx+22*sx*Math.cos(-2.0),cy+22*sx*Math.sin(-2.0)]],'#fff',.8);
   if(cg){g.strokeStyle='#2b2e33';g.lineWidth=1.6;g.beginPath();g.arc(cx,cy,3.5*sx,-2.3+.6,-2.3-.6+TAU);g.stroke()}}
  // giavellotto: pedana lunga e settore
  aLine(g,[[s*.1,-18*sx],[s*.1+30*sx,-18*sx]],'#8a3a28',1.4*sx);aLine(g,[[s*.1+30*sx,-18*sx],[s*.1+60*sx,-26*sx]],'rgba(255,255,255,.6)',.8);aLine(g,[[s*.1+30*sx,-18*sx],[s*.1+60*sx,-10*sx]],'rgba(255,255,255,.6)',.8);
  // atleti in gara in curva e giudici
  const pos=H(1,320)*Math.PI;for(let k=0;k<8;k++){const t=pos+(H(k,321)-.5)*.25,r=(36.5+1.22*k+.6)*sx;afig(g,s+Math.cos(t-Math.PI/2)*r,Math.sin(t-Math.PI/2)*r,t,ARENA_SHIRT[(k*5+3)%ARENA_SHIRT.length],1)}
  for(let k=0;k<4;k++)afig(g,s+1.5*sx+k*1.6*sx,49*sx,-Math.PI/2,'#2c3e50',.9);for(let k=0;k<3;k++)afig(g,-s*.6+(30+k*2)*sx,-27.5*sx,Math.PI/2,k?'#ecf0f1':t1,1)},

 // 4 TENNIS: superficie (terra, erba o cemento), righe, rete con i paletti, sedia dell'arbitro, panchine, raccattapalle, giudici di linea, giocatori, sponsor
 (g,f,a,b,n,H,t1,t2)=>{const ty=(H(1,400)*3)|0,SU=[['#b65a36','#c0643c'],['#4f8a3c','#5b9a46'],['#2c7a52','#2f6fb0']][ty];
  g.fillStyle=SU[0];g.fillRect(-a,-b,2*a,2*b);
  const fit=seFit(a,b,n,36.6/18.3),sx=fit[0]*.9/18.3,hw=11.885*sx,hh=5.485*sx;
  g.fillStyle=SU[1];g.fillRect(-hw,-hh,2*hw,2*hh);
  if(ty==0){g.strokeStyle='rgba(255,230,210,.15)';g.lineWidth=1;for(let i=0;i<30;i++){const x=(H(i,401)-.5)*2*hw,y=(H(i,402)-.5)*2*hh;g.beginPath();g.moveTo(x,y);g.lineTo(x+(H(i,403)-.5)*14,y+(H(i,404)-.5)*4);g.stroke()}}   // scivolate sulla terra
  if(ty==1){g.fillStyle='rgba(255,255,255,.07)';for(let i=-8;i<8;i+=2)g.fillRect(i*hw/8,-hh,hw/8,2*hh);g.fillStyle='rgba(150,120,70,.35)';for(const sd of[-1,1]){g.beginPath();g.ellipse(sd*hw*.95,0,hw*.08,hh*.5,0,0,TAU);g.fill()}}   // erba consumata a fondo campo
  g.strokeStyle='#fff';g.lineWidth=1.4;g.strokeRect(-hw,-hh,2*hw,2*hh);aLine(g,[[-hw,-4.115*sx],[hw,-4.115*sx]],'#fff',1.2);aLine(g,[[-hw,4.115*sx],[hw,4.115*sx]],'#fff',1.2);
  aLine(g,[[-6.4*sx,-4.115*sx],[-6.4*sx,4.115*sx]],'#fff',1.2);aLine(g,[[6.4*sx,-4.115*sx],[6.4*sx,4.115*sx]],'#fff',1.2);aLine(g,[[-6.4*sx,0],[6.4*sx,0]],'#fff',1.2);
  for(const sd of[-1,1])aLine(g,[[sd*hw,0],[sd*(hw-.6*sx),0]],'#fff',1.2);
  aLine(g,[[0,-6.4*sx],[0,6.4*sx]],'rgba(20,20,20,.7)',2.4);aLine(g,[[0,-6.4*sx],[0,6.4*sx]],'#f4f4f4',.8);for(const sy of[-1,1]){g.fillStyle='#1d1d1d';g.beginPath();g.arc(0,sy*6.4*sx,1.8,0,TAU);g.fill()}
  // sedia dell'arbitro, panchine dei giocatori con ombrellone, raccattapalle, giudici di linea
  g.fillStyle='#2b2e33';g.fillRect(-1.5*sx/2-2,-(hh+2.4*sx)-3,6,6);afig(g,0,-(hh+2.4*sx),Math.PI/2,'#2c3e50',1.2);
  for(const sd of[-1,1]){g.fillStyle='#1e5a3a';g.fillRect(sd*2.5*sx-4,-(hh+2.6*sx)-2,8,4);afig(g,sd*2.5*sx,-(hh+2.4*sx),Math.PI/2,sd<0?t1:t2,1);veh(g,'parasol',sd*3.6*sx,-(hh+3.2*sx),0,sd<0?t1:t2,.8)}
  for(const q of[[0,6.9],[0,-6.9],[-12.9,-6],[-12.9,6],[12.9,-6],[12.9,6]])afig(g,q[0]*sx,q[1]*sx,q[0]?(q[0]>0?Math.PI:0):(q[1]>0?-Math.PI/2:Math.PI/2),'#7f8c8d',.85);
  for(const q of[[-14.8,-4.1],[14.8,4.1],[-6.4,-7.6],[6.4,7.6]])afig(g,q[0]*sx,q[1]*sx,0,'#e8e2d2',.9);
  const dbl=H(2,405)<.3,PL=dbl?[[-.85,-.35],[-.5,.35],[.85,.35],[.5,-.3]]:[[-1.06,(H(3,406)-.5)*.8],[1.04,(H(4,407)-.5)*.8]];
  PL.forEach((q,i)=>afig(g,q[0]*hw,q[1]*hh,q[0]<0?0:Math.PI,q[0]<0?'#ffffff':t2,1.3));
  g.fillStyle='#d7f53a';g.beginPath();g.arc((H(5,408)-.5)*hw,(H(6,409)-.5)*hh,1.3,0,TAU);g.fill();
  for(const sd of[-1,1]){g.fillStyle=sd<0?t1:t2;g.fillRect(sd*(17.4*sx)-1.6,-hh*.9,3.2,hh*1.8);aText(g,'ACE',sd*17.4*sx,0,Math.max(5,sx),'#fff',Math.PI/2*sd)}},

 // 5 FOOTBALL AMERICANO: strisce ogni 5 yard, linee, numeri, mete colorate, pali a Y, logo, panchine, 22 giocatori in formazione, arbitri, catena dei dieci yard
 (g,f,a,b,n,H,t1,t2)=>{g.fillStyle='#3b8a3a';g.fillRect(-a,-b,2*a,2*b);
  const fit=seFit(a,b,n,120/53.33),sx=fit[0]*.9/60,hw=60*sx,hh=26.67*sx;
  for(let y=-50;y<50;y+=10){g.fillStyle='rgba(255,255,255,.06)';g.fillRect(y*sx,-hh,5*sx,2*hh)}
  for(const sd of[-1,1]){g.fillStyle=sd<0?t1:t2;g.fillRect(sd>0?50*sx:-hw,-hh,10*sx,2*hh);g.strokeStyle='rgba(255,255,255,.25)';g.lineWidth=1;g.beginPath();for(let k=-30;k<30;k+=3){g.moveTo(sd*55*sx+k*sx-5*sx,-hh);g.lineTo(sd*55*sx+k*sx+5*sx,hh)}g.save();g.beginPath();g.rect(sd>0?50*sx:-hw,-hh,10*sx,2*hh);g.clip();g.stroke();g.restore();
   aText(g,sd<0?'HOME':'AWAY',sd*55*sx,0,Math.max(7,sx*4),'rgba(255,255,255,.85)',sd*Math.PI/2)}
  g.strokeStyle='#fff';g.lineWidth=2;g.strokeRect(-hw,-hh,2*hw,2*hh);
  for(let yd=-50;yd<=50;yd+=5)aLine(g,[[yd*sx,-hh],[yd*sx,hh]],'rgba(255,255,255,.85)',yd%10?.8:1.2);
  for(let yd=-49;yd<=49;yd++){if(yd%5==0)continue;for(const y of[-3.08,3.08,-hh/sx+.6,hh/sx-.6])aLine(g,[[yd*sx,(y-.4)*sx],[yd*sx,(y+.4)*sx]],'rgba(255,255,255,.7)',.6)}
  for(let yd=-40;yd<=40;yd+=10){const num=String(50-Math.abs(yd));for(const sy of[-1,1])aText(g,num,yd*sx,sy*(hh-12*sx),Math.max(6,sx*2.2),'rgba(255,255,255,.85)',sy>0?0:Math.PI)}
  for(const sd of[-1,1]){const x=sd*(hw+.6*sx);aLine(g,[[x,-3.08*sx],[x,3.08*sx]],'#f1c40f',2);aLine(g,[[x,0],[x+sd*2*sx,0]],'#f1c40f',2);g.fillStyle='#f1c40f';for(const sy of[-1,1]){g.beginPath();g.arc(x,sy*3.08*sx,1.8,0,TAU);g.fill()}}
  g.fillStyle=t1;g.beginPath();g.arc(0,0,6*sx,0,TAU);g.fill();g.strokeStyle='#fff';g.lineWidth=1.2;g.stroke();aText(g,'★',0,0,Math.max(8,sx*6),t2);
  // panchine (area squadra) sulle due linee laterali
  for(const sd of[-1,1]){g.fillStyle='rgba(255,255,255,.12)';g.fillRect(-15*sx,sd>0?hh+1:-hh-6*sx,30*sx,6*sx);for(let k=0;k<16;k++)afig(g,(-14+k*1.8)*sx,sd*(hh+3*sx),-sd*Math.PI/2,sd<0?t1:t2,.85)}
  // formazione sulla linea di scrimmage
  const L=(H(1,500)-.5)*70,x0=L*sx;
  for(let k=-2;k<=2;k++){afig(g,x0-1*sx,k*1.2*sx,0,t1,1.15);afig(g,x0+1.4*sx,k*1.3*sx,Math.PI,t2,1.15)}
  for(const q of[[-5,0],[-8,0],[-1,10],[-1,-12],[-2,-3.5]])afig(g,x0+q[0]*sx,q[1]*sx,0,t1,1.15);
  for(const q of[[5,0],[5,-6],[5,6],[10,-10],[10,10],[16,0]])afig(g,x0+q[0]*sx,q[1]*sx,Math.PI,t2,1.15);
  g.fillStyle='#7a3b12';g.beginPath();g.ellipse(x0,0,1.6,1,0,0,TAU);g.fill();aLine(g,[[x0,-hh],[x0,hh]],'rgba(60,130,255,.55)',1.4);aLine(g,[[x0+10*sx,-hh],[x0+10*sx,hh]],'rgba(255,220,40,.6)',1.4);   // linee virtuali
  for(const q of[[-12,0],[8,-6],[8,6],[0,-hh/sx-1.5],[0,hh/sx+1.5]]){afig(g,x0+q[0]*sx,q[1]*sx,Math.PI/2,'#f4f4f4',1);g.fillStyle='#111';g.fillRect(x0+q[0]*sx-1.4,q[1]*sx-.4,2.8,.8)}   // arbitri a righe
  for(const dx of[0,10])g.fillStyle='#ff7a1a',g.fillRect(x0+dx*sx-1.5,hh+2*sx,3,3)},   // catena dei dieci yard

 // 6 BASEBALL: diamante con le basi, monte di lancio, terra del diamante, prato a scacchi, traccia di avvertimento, linee di foul, panchine interrate, bullpen, nove difensori, battitore, arbitro
 (g,f,a,b,n,H,t1,t2)=>{g.fillStyle='#3f8a3c';g.fillRect(-a,-b,2*a,2*b);
  const hx=-a*.62,inS=(x,y)=>Math.pow(Math.abs(x/a),n)+Math.pow(Math.abs(y/b),n)<=1;let R0=1e9;
  for(let th=-Math.PI/4;th<=Math.PI/4+1e-6;th+=Math.PI/40){let r=10;while(r<3*a&&inS(hx+Math.cos(th)*r,Math.sin(th)*r))r+=3;R0=Math.min(R0,r-3)}
  const R=R0*.94,ft=R/400,P2=(d,t)=>[hx+Math.cos(t)*d*ft,Math.sin(t)*d*ft],base=[[90,Math.PI/4],[127.3,0],[90,-Math.PI/4]].map(q=>P2(q[0],q[1]));
  const wedge=r=>{g.beginPath();g.moveTo(hx,0);g.arc(hx,0,r,-Math.PI/4,Math.PI/4);g.closePath()};
  g.fillStyle='#357a33';g.fillRect(-a,-b,2*a,2*b);wedge(R);g.fillStyle='#46943f';g.fill();
  g.save();wedge(R);g.clip();g.fillStyle='rgba(255,255,255,.07)';for(let i=-30;i<30;i++)for(let j=-30;j<30;j++)if((i+j)%2==0)g.fillRect(hx+i*14,j*14,14,14);g.restore();
  g.beginPath();g.arc(hx,0,R,-Math.PI/4,Math.PI/4);g.arc(hx,0,R-15*ft,Math.PI/4,-Math.PI/4,true);g.closePath();g.fillStyle='#b98a5a';g.fill();   // traccia di avvertimento
  g.save();wedge(R);g.clip();g.fillStyle='#b98a5a';g.beginPath();g.arc(hx+60.5*ft,0,95*ft,0,TAU);g.fill();g.restore();
  g.fillStyle='#46943f';g.beginPath();const ins=[P2(0,0),...base].map((p,i)=>{const c=[hx+63.6*ft,0];return[c[0]+(p[0]-c[0])*.83,c[1]+(p[1]-c[1])*.83]});g.moveTo(ins[0][0],ins[0][1]);ins.slice(1).forEach(p=>g.lineTo(p[0],p[1]));g.closePath();g.fill();   // erba del diamante
  g.fillStyle='#b98a5a';g.beginPath();g.arc(hx,0,13*ft,0,TAU);g.fill();g.beginPath();g.arc(hx+60.5*ft,0,9*ft,0,TAU);g.fill();g.fillStyle='#fff';g.fillRect(hx+60.5*ft-.6,-2,1.2,4);   // casa base e monte
  for(const p of base){g.save();g.translate(p[0],p[1]);g.rotate(Math.PI/4);g.fillStyle='#fff';g.fillRect(-2,-2,4,4);g.restore()}
  g.fillStyle='#fff';g.beginPath();g.moveTo(hx-1.5,-1.5);g.lineTo(hx+1,-1.5);g.lineTo(hx+2.2,0);g.lineTo(hx+1,1.5);g.lineTo(hx-1.5,1.5);g.fill();
  aLine(g,[[hx,0],P2(R/ft,Math.PI/4)],'#fff',1.1);aLine(g,[[hx,0],P2(R/ft,-Math.PI/4)],'#fff',1.1);
  g.strokeStyle='#fff';g.lineWidth=.8;g.strokeRect(hx-3*ft-2,-4*ft-3,3*ft,3*ft);g.strokeRect(hx-3*ft-2,1*ft+3,3*ft,3*ft);
  for(const sy of[-1,1]){const p=P2(R/ft,sy*Math.PI/4);g.fillStyle='#f1c40f';g.beginPath();g.arc(p[0],p[1],2.4,0,TAU);g.fill();
   const d=P2(60,sy*Math.PI/4);g.fillStyle='#1d1f24';g.save();g.translate(d[0],d[1]+sy*14);g.rotate(sy*Math.PI/4);g.fillRect(-14,-4,28,8);for(let k=0;k<6;k++)afig(g,-11+k*4.4,0,-sy*Math.PI/2,sy>0?t1:t2,.8);g.restore();   // panchine interrate
   const bp=P2(R/ft-30,sy*(Math.PI/4-.12));g.fillStyle='#b98a5a';g.fillRect(bp[0]-10,bp[1]-3,20,6);afig(g,bp[0]-4,bp[1],0,sy>0?t1:t2,.9)}   // bullpen
  for(const r of[[22,.9],[22,-.9]]){const p=P2(r[0],Math.PI/2*r[1]*1.4);g.strokeStyle='rgba(255,255,255,.6)';g.beginPath();g.arc(p[0]-10,p[1],2.6,0,TAU);g.stroke()}
  const DF=[[60.5,0],[-3,0],[85,.62],[140,.18],[140,-.18],[85,-.62],[260,-.5],[320,0],[260,.5]];DF.forEach(q=>{const p=P2(q[0],q[1]);afig(g,p[0],p[1],Math.PI,t1,1.15)});
  afig(g,hx-1,4,-Math.PI/2,t2,1.2);aLine(g,[[hx-1,4],[hx+5,8]],'#c8a060',1);afig(g,hx-8*ft-2,0,0,'#111',1.15);
  if(H(1,600)<.6){const p=base[(H(2,601)*3)|0];afig(g,p[0]+3,p[1]+2,0,t2,1.15)}
  g.fillStyle='#fff';g.beginPath();g.arc(hx+30*ft,0,1.1,0,TAU);g.fill()},

 // 7 MOTOCROSS (o show dei monster truck): terra, pista ad anello con paraboliche, salti, gobbe, balle di fieno, gomme, cancello di partenza, moto, box e commissari
 (g,f,a,b,n,H,t1,t2)=>{g.fillStyle='#8a6a45';g.fillRect(-a,-b,2*a,2*b);
  for(let i=0;i<900;i++){g.fillStyle=H(i,700)<.5?'rgba(60,40,20,.18)':'rgba(200,170,120,.15)';g.fillRect((H(i,701)-.5)*2*a,(H(i,702)-.5)*2*b,1.5+H(i,703)*2,1.5)}
  if(H(1,704)<.35){   // monster truck: fila di auto schiacciate sotto una rampa, i camion giganti, segni delle ruote
   g.strokeStyle='rgba(40,25,10,.35)';g.lineWidth=5;for(let k=0;k<5;k++){g.beginPath();g.ellipse(0,0,a*(.3+k*.12),b*(.25+k*.12),H(k,705),0,TAU);g.stroke()}
   for(const sd of[-1,1]){g.fillStyle='#a07a4e';g.beginPath();g.moveTo(sd*a*.5,-18);g.lineTo(sd*a*.2,-14);g.lineTo(sd*a*.2,14);g.lineTo(sd*a*.5,18);g.closePath();g.fill();g.fillStyle='rgba(0,0,0,.25)';g.fillRect(sd*a*.2-(sd>0?0:3),-14,3,28)}
   for(let k=-3;k<=3;k++)veh(g,'carwreck',k*20,0,Math.PI/2,ARENA_SHIRT[(k+3)*3%ARENA_SHIRT.length],1.2);
   const mt=(x,y,an,c)=>{g.save();g.translate(x,y);g.rotate(an);g.fillStyle='rgba(0,0,0,.35)';g.fillRect(-15,-12,34,28);g.fillStyle='#111';for(const[wx,wy]of[[-10,-11],[10,-11],[-10,11],[10,11]]){g.beginPath();g.ellipse(wx,wy,7,4.5,0,0,TAU);g.fill()}
    g.fillStyle=c;g.fillRect(-14,-8,28,16);g.fillStyle=shade(c,.25);g.fillRect(-4,-6,10,12);g.fillStyle='rgba(20,30,40,.8)';g.fillRect(6,-5,3,10);g.restore()};
   mt(-a*.55,b*.3,.3,t1);mt(a*.4,-b*.35,Math.PI+.4,t2);mt(-a*.1,-b*.55,-.2,'#8e44ad');return}
  // anello della pista: punti con raggio variabile, levigati
  const N=14,pts=[];for(let i=0;i<N;i++){const t=i/N*TAU,r=.52+H(i,710)*.32;pts.push([Math.cos(t)*a*r,Math.sin(t)*b*r])}
  const loop=()=>{g.beginPath();const m=(p,q)=>[(p[0]+q[0])/2,(p[1]+q[1])/2];let s0=m(pts[N-1],pts[0]);g.moveTo(s0[0],s0[1]);for(let i=0;i<N;i++){const e=m(pts[i],pts[(i+1)%N]);g.quadraticCurveTo(pts[i][0],pts[i][1],e[0],e[1])}g.closePath()};
  g.lineJoin='round';loop();g.strokeStyle='#a5845a';g.lineWidth=40;g.stroke();loop();g.strokeStyle='#6e4f2e';g.lineWidth=30;g.stroke();
  g.strokeStyle='rgba(40,25,10,.35)';g.lineWidth=1;g.setLineDash([6,4]);for(const o of[-8,-3,4,9]){g.save();g.translate(o*.3,o);loop();g.stroke();g.restore()}g.setLineDash([]);
  // salti e gobbe
  for(let i=1;i<N;i+=3){const p=pts[i],q=pts[(i+1)%N],an=Math.atan2(q[1]-p[1],q[0]-p[0]);g.save();g.translate(p[0],p[1]);g.rotate(an);g.fillStyle='rgba(0,0,0,.3)';g.fillRect(2,-15,12,30);g.fillStyle='#b08a5c';g.beginPath();g.moveTo(-12,-15);g.lineTo(6,-15);g.lineTo(6,15);g.lineTo(-12,15);g.closePath();g.fill();g.fillStyle='#c9a676';g.fillRect(2,-15,4,30);g.restore()}
  {const p=pts[5],q=pts[6],an=Math.atan2(q[1]-p[1],q[0]-p[0]);g.save();g.translate(p[0],p[1]);g.rotate(an);for(let k=0;k<6;k++){g.fillStyle=k%2?'#5c4126':'#9a7850';g.fillRect(-18+k*6,-14,4,28)}g.restore()}
  // balle di fieno e pile di gomme ai bordi
  const off=(p,d)=>{const l=Math.hypot(p[0],p[1])||1;return[p[0]*(l+d)/l,p[1]*(l+d)/l]};
  for(let i=0;i<N;i++){const p=pts[i],hi=off(p,-24);veh(g,'haybale',hi[0],hi[1],0,null,1.1);veh(g,'haybale',hi[0]+5,hi[1]+3,0,null,1.1);if(H(i,720)<.6){const o=off(p,25);g.fillStyle='#151515';for(let j=0;j<3;j++){g.beginPath();g.arc(o[0]+j*4,o[1],2.6,0,TAU);g.fill();g.fillStyle='#333';g.beginPath();g.arc(o[0]+j*4,o[1],1,0,TAU);g.fill();g.fillStyle='#151515'}}}
  // cancello di partenza con le moto in fila, poi le moto in gara
  {const p=pts[0],q=pts[1],an=Math.atan2(q[1]-p[1],q[0]-p[0]);g.save();g.translate(p[0],p[1]);g.rotate(an);aLine(g,[[0,-15],[0,15]],'#9aa1a8',2.4);g.restore()}
  const bike=(x,y,an,c)=>{g.save();g.translate(x,y);g.rotate(an);g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-3,-1,8,3);g.fillStyle='#1a1a1a';g.fillRect(-4,-1,8,2);g.fillStyle=c;g.fillRect(-2,-1.6,4,3.2);g.fillStyle='#fff';g.beginPath();g.arc(-.5,0,1.4,0,TAU);g.fill();g.restore()};
  for(let k=0;k<7;k++){const i=(1+((H(k,730)*N)|0))%N,p=pts[i],q=pts[(i+1)%N],u=H(k,731),x=lerp(p[0],q[0],u),y=lerp(p[1],q[1],u)+(H(k,732)-.5)*16;bike(x,y,Math.atan2(q[1]-p[1],q[0]-p[0]),ARENA_SHIRT[(k*3+2)%ARENA_SHIRT.length])}
  // box dei piloti al centro: tende, furgoni, fusti; commissari con le bandiere
  veh(g,'tent',-a*.12,0,0,t1,1.6);veh(g,'tent',a*.08,0,0,t2,1.6);veh(g,'van',-a*.1,b*.18,0,'#ecf0f1',1.1);veh(g,'van',a*.12,-b*.18,Math.PI,'#2c3e50',1.1);veh(g,'barrels',0,b*.08,0,'#c0392b',.8);
  for(let i=2;i<N;i+=4){const p=off(pts[i],34);afig(g,p[0],p[1],Math.atan2(-p[1],-p[0]),'#f1c40f',1);g.fillStyle='#f1c40f';g.fillRect(p[0]+2,p[1]-4,4,3)}}];
function pCars(g,x0,y0){const a=DC.FI.get(Math.floor(x0/CH)*64+Math.floor(y0/CH));if(!a)return;
 for(const f of a){
  if(f.k==='car'||f.k==='truck')roadVeh(g,f);
  else if(f.k==='boat')vessel(g,f.x,f.y,f.a,f.col||'#ffffff',f.len||24,f.wid||10,f.sty||0);
 }}

const gc=(g,x,y,r)=>{g.beginPath();g.arc(x,y,r,0,TAU);g.fill()};
// oggetti a terra disegnati dopo l'acqua (z = 7): PROPS (AGart.js) ha la precedenza, qui ci sono quelli senza un disegno là
const PF_PROPS={
 pool:PF.pool,court:PF.court,      // piscina e campo della villa: restano visibili anche se la villa tocca un lago o un fiume
 pit:PF.pit,                        // fossa della cava: nell'ultimo passaggio del terreno, così niente la copre (piazzali, corsie, rive)
 drydock:PF.drydock,               // bacino della nave spaziale: sopra piazzale e corsie del sito (resta disegno a terra: niente visuale termica)
 solarArray(g,f){const w=f.w||80,h=f.h||50;g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-w/2,-h/2,w,h);
  for(let row=-h/2+6;row<=h/2-10;row+=14){g.fillStyle='#1a365d';g.fillRect(-w/2+4,row,w-8,10);g.strokeStyle='#63b3ed';g.lineWidth=1;g.strokeRect(-w/2+4,row,w-8,10)}
  g.fillStyle='#718096';g.fillRect(w/2-6,-6,6,12)},
 ventBunker(g,f){g.fillStyle='#2d3748';gc(g,0,0,22);g.strokeStyle='#e2e8f0';g.lineWidth=2;g.stroke();g.strokeStyle='#ecc94b';g.lineWidth=3;g.setLineDash([5,5]);gc(g,0,0,18);g.stroke();g.setLineDash([]);
  g.fillStyle='#0f172a';gc(g,0,0,13);g.strokeStyle='#718096';g.lineWidth=2.5;g.beginPath();g.moveTo(-11,0);g.lineTo(11,0);g.moveTo(0,-11);g.lineTo(0,11);g.stroke()}};
function pProps(g,x0,y0){
 const a=DC.FI.get(Math.floor(x0/CH)*64+Math.floor(y0/CH));if(!a)return;
 for(const f of a){
  const dr=PROPS[f.k]||PF_PROPS[f.k];if(!dr)continue;
  g.save();
  g.translate(f.x,f.y);
  g.rotate(f.a||0);
  try{dr(g,f)}catch(e){pProps.w||console.warn('Oggetto non disegnabile',f.k,e);pProps.w=1}
  g.restore();
 }
}
// disegno completo di un blocco
function pPads(g,x0,y0){
 const a=DC.FI.get(Math.floor(x0/CH)*64+Math.floor(y0/CH));if(!a)return;
 for(const f of a){
  if(f.k!=='pad')continue;
  // evita di disegnare se c’è un albero o una roccia troppo vicina
  let blocked=false;
  for(const o of (DC.OI.get(Math.floor(f.x/CH)*64+Math.floor(f.y/CH))||[])){
   if((o.t==='t'||o.ty==='rock')&&Math.hypot(o.x-f.x,o.y-f.y)<f.r+o.r+8){blocked=true;break}
  }
  if(blocked)continue;
  g.save();g.translate(f.x,f.y);
  g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.arc(3,4,f.r+4,0,TAU);g.fill();
  g.fillStyle='#52585f';g.beginPath();g.arc(0,0,f.r,0,TAU);g.fill();
  g.strokeStyle='#e6b422';g.lineWidth=5;g.beginPath();g.arc(0,0,f.r-6,0,TAU);g.stroke();
  // H
  g.strokeStyle='#e6b422';g.lineWidth=4;
  g.beginPath();g.moveTo(-f.r*.35,-f.r*.4);g.lineTo(-f.r*.35,f.r*.4);
  g.moveTo(f.r*.35,-f.r*.4);g.lineTo(f.r*.35,f.r*.4);
  g.moveTo(-f.r*.35,0);g.lineTo(f.r*.35,0);g.stroke();
  g.restore();
 }
} 
async function paintTile(g,x0,y0,S){
 g.setTransform(S,0,0,S,-x0*S,-y0*S);g.lineJoin='round';g.lineCap='round';
 DC.pat=DC.NZ.map(n=>g.createPattern(n,'repeat'));
 DC.patGreen=DC.GREEN.map(([cv])=>g.createPattern(cv,'repeat'));
 pGround(g,x0,y0);pLevels(g,x0,y0);pHills(g,x0,y0);pScatter(g,x0,y0);if(typeof pNature==='function')pNature(g,x0,y0);
 pForecourt(g,x0,y0,0);
 pFlat(g,x0,y0,0,1);pFlat(g,x0,y0,2,4);
 await tick();                                              // ← pausa 1
 pWater(g,x0,y0,S);if(typeof pNatureWater==='function')pNatureWater(g,x0,y0);pIsles(g,x0,y0);pForecourt(g,x0,y0,1);pPiers(g,x0,y0);pBridges(g,x0,y0);pFalls(g,x0,y0);
 await tick();                                              // ← pausa 2 (NUOVA)
 pRoads(g,x0,y0);pWetGround(g,x0,y0);pCars(g,x0,y0);pRamps(g,x0,y0);pSlabTop(g,x0,y0);
 await tick();                                              // ← pausa 3 (NUOVA)
 pRubble(g,x0,y0);pLights(g,x0,y0);
 pPads(g,x0,y0);
 pForecourtDetails(g,x0,y0,0);
 pForecourtDetails(g,x0,y0,1);
 pProps(g,x0,y0);
}
// regione "quota ≥ t" nel riquadro: ogni cella della griglia di quote diventa un poligono ritagliato (unione in un solo percorso, senza giunture)
function levelPath(t,x0,y0,x1,y1){const p=new Path2D(),W1=GW+1,E=M.E,i0=clamp(Math.floor(x0/TC),0,GW-1),i1=clamp(Math.floor(x1/TC),0,GW-1),j0=clamp(Math.floor(y0/TC),0,GH-1),j1=clamp(Math.floor(y1/TC),0,GH-1);
 for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const a=E[j*W1+i],b=E[j*W1+i+1],c=E[(j+1)*W1+i+1],d=E[(j+1)*W1+i];
  if(a<t&&b<t&&c<t&&d<t)continue;const x=i*TC,y=j*TC;
  if(a>=t&&b>=t&&c>=t&&d>=t){p.rect(x,y,TC,TC);continue}
  const V=[[x,y,a],[x+TC,y,b],[x+TC,y+TC,c],[x,y+TC,d]],o=[];
  for(let k=0;k<4;k++){const s=V[k],e=V[(k+1)%4],is=s[2]>=t,ie=e[2]>=t;if(is)o.push(s[0],s[1]);if(is!==ie){const u=(t-s[2])/(e[2]-s[2]);o.push(s[0]+(e[0]-s[0])*u,s[1]+(e[1]-s[1])*u)}}
  if(o.length>=6){p.moveTo(o[0],o[1]);for(let k=2;k<o.length;k+=2)p.lineTo(o[k],o[k+1]);p.closePath()}}
 return p}
// tratti della linea di quota t (marching squares sulla griglia delle quote): [x1,y1,x2,y2]
function levelSegs(t,x0,y0,x1,y1){const out=[],W1=GW+1,E=M.E,i0=clamp(Math.floor(x0/TC),0,GW-1),i1=clamp(Math.floor(x1/TC),0,GW-1),j0=clamp(Math.floor(y0/TC),0,GH-1),j1=clamp(Math.floor(y1/TC),0,GH-1);
 for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const x=i*TC,y=j*TC,V=[[x,y,E[j*W1+i]],[x+TC,y,E[j*W1+i+1]],[x+TC,y+TC,E[(j+1)*W1+i+1]],[x,y+TC,E[(j+1)*W1+i]]],c=[];
  for(let k=0;k<4;k++){const s=V[k],e=V[(k+1)%4];if((s[2]>=t)!==(e[2]>=t)){const u=(t-s[2])/(e[2]-s[2]);c.push(s[0]+(e[0]-s[0])*u,s[1]+(e[1]-s[1])*u)}}
  for(let k=0;k+3<c.length;k+=4)out.push([c[k],c[k+1],c[k+2],c[k+3]])}
 return out}
const roadPath=rd=>rd.path||(rd.path=(()=>{const p=new Path2D();rd.pts.forEach((q,i)=>i?p.lineTo(q[0],q[1]):p.moveTo(q[0],q[1]));return p})());
const riverPath=rv=>rv.path||(rv.path=(()=>{const p=new Path2D();rv.pts.forEach((q,i)=>i?p.lineTo(q[0],q[1]):p.moveTo(q[0],q[1]));return p})());

const CH=512,BK={tok:0,S:1,tiles:new Map(),bm:new Map(),pend:new Set(),fr:0,wl:null,cv:null,type:'image/webp',nx:Math.ceil(WW/CH),ny:Math.ceil(WH/CH)};
const BAKE_S=[1,1.25,1.5];
const bmax=()=>G.q>=2?44:34;
const mkCanvas=n=>{const c=document.createElement('canvas');c.width=c.height=n;return c};
let _webp=null;const webpOK=()=>_webp===null?(_webp=(()=>{try{return mkCanvas(2).toDataURL('image/webp').indexOf('data:image/webp')==0}catch(e){return false}})()):_webp;
const tick=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const toBlobP=(cv,type,q)=>new Promise(res=>{try{if(cv.toBlob)cv.toBlob(b=>res(b),type,q);else res(null)}catch(e){res(null)}});
function chunkReset(){BK.tok++;for(const v of BK.bm.values())try{v.img&&v.img.close&&v.img.close()}catch(e){}BK.bm=new Map();BK.tiles=new Map();BK.pend=new Set();G.baking=0}
// usato dal disegno: restituisce l'immagine del blocco (o null se non è ancora decompresso: si disegna un colore di riserva)
function chunkGet(cx,cy){const k=cx*64+cy,b=BK.bm.get(k);if(b){b.t=BK.fr;return b.img}dec(k);return null}
function evict(){const mx=bmax();while(BK.bm.size>mx){let o=null,ot=1e18;for(const[k,v]of BK.bm)if(v.t<ot){ot=v.t;o=k}if(o==null||ot>=BK.fr-1)break;const v=BK.bm.get(o);try{v.img.close&&v.img.close()}catch(e){}BK.bm.delete(o)}}
function decodeBlob(b){if(typeof createImageBitmap=='function')return createImageBitmap(b);
 return new Promise((res,rej)=>{const im=new Image(),u=URL.createObjectURL(b);im.onload=()=>{URL.revokeObjectURL(u);res(im)};im.onerror=rej;im.src=u})}
function dec(k){if(BK.pend.has(k)||BK.pend.size>=4)return;const b=BK.tiles.get(k);if(!b)return;
 if(b.getContext){BK.bm.set(k,{img:b,t:BK.fr});evict();return}            // riserva senza compressione
 BK.pend.add(k);const tok=BK.tok;
 decodeBlob(b).then(im=>{BK.pend.delete(k);if(tok!==BK.tok){im.close&&im.close();return}BK.bm.set(k,{img:im,t:BK.fr});evict()}).catch(()=>BK.pend.delete(k))}
// chiamata a ogni fotogramma con il rettangolo visibile: prepara in anticipo i blocchi intorno alla camera
function bakePrefetch(x0,y0,x1,y1){BK.fr++;const m=CH*.6;
 for(let cx=Math.max(0,Math.floor((x0-m)/CH));cx<=Math.min(BK.nx-1,Math.floor((x1+m)/CH));cx++)for(let cy=Math.max(0,Math.floor((y0-m)/CH));cy<=Math.min(BK.ny-1,Math.floor((y1+m)/CH));cy++){const k=cx*64+cy,b=BK.bm.get(k);if(b)b.t=BK.fr;else dec(k)}}
// ===== creazione =====
const airdropSnd = new Audio('sfx/sfx-airdrop.mp3');
const playRandomAirdrop = () => {
 airdropSnd.playbackRate = 0.3 + Math.random() * 1.5; // Variazione estrema del tono (da 0.3 a 1.8)
 airdropSnd.volume = (0.3 + Math.random() * 0.7) * (typeof SFX_VOL !== 'undefined' ? SFX_VOL : 1);
 airdropSnd.currentTime = 0;
 airdropSnd.play().catch(e => {});
};

function bakeStart(){
 chunkReset();
 const tok=BK.tok;
 BK.S=BAKE_S[clamp(G.q,0,2)];
 fsSet(true);   // <-- retry schermo intero all'avvio del caricamento (siamo ancora nella transient activation del click)
 G.baking=1;
 G.bakeP=0;
 G.bakeMsg='Preparo la mappa…';
 document.getElementById('bCfgLoading').style.display='block';

 playRandomAirdrop();
 const dropInterval = setInterval(() => {
  if(!G.baking || tok !== BK.tok) {
   clearInterval(dropInterval);
   return;
  }
  playRandomAirdrop();
 }, 600);

 setTimeout(()=>bakeRun(tok),40);
}
async function bakeRun(tok){
 try{
  if(!M.decorDone){M.decorDone=1;G.bakeMsg='Studio il terreno…';await tick();await decorPrep()}
  if(M.wxm===undefined)wxMaskBuild();   // chiazze di neve / pozzanghere: maschera per rallentamento e scie
  const S=BK.S,px=Math.round(CH*S);BK.cv=mkCanvas(px);BK.wl=mkCanvas(px);const g=BK.cv.getContext('2d');BK.type=webpOK()?'image/webp':'image/jpeg';
  const N=BK.nx*BK.ny;let n=0,bad=0;G.bakeMsg='IN VIAGGIO VERSO LA ZONA DI MISSIONE…';
  for(let cy=0;cy<BK.ny;cy++)for(let cx=0;cx<BK.nx;cx++){await tick();if(tok!==BK.tok)return;
   try{g.setTransform(1,0,0,1,0,0);g.globalAlpha=1;g.globalCompositeOperation='source-over';g.setLineDash([]);await paintTile(g,cx*CH,cy*CH,S);
    g.setTransform(1,0,0,1,0,0);let b=await toBlobP(BK.cv,BK.type,.84);if(!b){const c2=mkCanvas(px);c2.getContext('2d').drawImage(BK.cv,0,0);b=c2}BK.tiles.set(cx*64+cy,b)}
   catch(e){if(!bad++)console.warn('Blocco di sfondo',cx,cy,e)}
   G.bakeP=++n/N}
  // decomprime subito i blocchi intorno alla partenza: la prima schermata è già completa
  G.bakeMsg='Quasi pronto…';const pl=typeof P!=='undefined'&&P?P:{x:START[0],y:START[1]};
  for(let cx=Math.max(0,Math.floor((pl.x-900)/CH));cx<=Math.min(BK.nx-1,Math.floor((pl.x+900)/CH));cx++)for(let cy=Math.max(0,Math.floor((pl.y-700)/CH));cy<=Math.min(BK.ny-1,Math.floor((pl.y+700)/CH));cy++){
   const b=BK.tiles.get(cx*64+cy);if(!b)continue;if(b.getContext)BK.bm.set(cx*64+cy,{img:b,t:BK.fr});else try{BK.bm.set(cx*64+cy,{img:await decodeBlob(b),t:BK.fr})}catch(e){}}
 }catch(e){console.error('Creazione sfondo',e)}
 if(tok===BK.tok){
  G.baking=0;
  const btn = document.getElementById('bCfgLoading');
  if(btn) btn.style.display='none';
 }}
function bakeDraw(){
 const c=ctx,w=W,h=H;
 c.setTransform(1,0,0,1,0,0);
 c.fillStyle='#0b0f0b';
 c.fillRect(0,0,cv.width,cv.height);
 const d=cv.width/(w||1);
 c.setTransform(d,0,0,d,0,0);

 if (G.bakeMsg && G.bakeMsg.includes("VIAGGIO")) {
  const t = performance.now();

  // 1. TERRENO A SCORRIMENTO ESTESO A TUTTO LO SCHERMO
  const groundY = 0; 
  c.fillStyle = '#0d140d';
  c.fillRect(0, groundY, w, h);

  c.fillStyle = '#162216';
  for (let i = 0; i < 8; i++) {
   const speed = ((t * (0.25 + i * 0.075)) % (w + 300));
   const yPos = groundY + 20 + (i * 55) % h;
   c.fillRect(w - speed, yPos, 120 + i * 30, 8 + (i % 3) * 2);
  }

// 1.3 PICCOLI INSEDIAMENTI E LUCINE SPARSE SUL TERRENO
  const numSpots = 10, spotLoop = w + 1600;
  for (let s = 0; s < numSpots; s++) {
   const rawPos = t * 0.35 + s * (spotLoop / numSpots);
   const cycle = Math.floor(rawPos / spotLoop);
   const sx = w + 800 - (rawPos % spotLoop);
   const rndS = (seed) => { const x = Math.sin(seed * 91.345 + cycle * 43.12) * 43758.5453; return x - Math.floor(x); };
   const sy = h * (0.05 + rndS(s * 7 + 1) * 0.90);
   const kind = Math.floor(rndS(s * 7 + 2) * 3); // 0: antenna lampeggiante, 1: casolare/coppia di luci, 2: piccolo borgo

   c.save();
   c.translate(sx, sy);
   if (kind === 0) {
    const blink = Math.sin(t / 180 + s * 2) > 0.4 ? 1 : 0.12;
    c.fillStyle = rndS(s) < 0.5 ? '#ff3b3b' : '#ffffff';
    c.globalAlpha = blink;
    c.fillRect(-1.5, -1.5, 3, 3);
   } else if (kind === 1) {
    for (let li = 0; li < 3; li++) {
     const lx = (rndS(s * 13 + li) - 0.5) * 26, ly = (rndS(s * 17 + li) - 0.5) * 20;
     const glow = 0.4 + 0.6 * Math.sin(t / 220 + s + li * 2);
     c.fillStyle = li % 2 === 0 ? '#ffea75' : '#ffb443';
     c.globalAlpha = 0.4 + 0.5 * glow;
     c.fillRect(lx - 1, ly - 1, 2.5, 2.5);
    }
   } else {
    c.fillStyle = 'rgba(255, 180, 70, 0.08)';
    c.beginPath(); c.arc(0, 0, 22, 0, TAU); c.fill();
    for (let li = 0; li < 6; li++) {
     const lx = (rndS(s * 23 + li) - 0.5) * 36, ly = (rndS(s * 29 + li) - 0.5) * 30;
     const glow = 0.4 + 0.6 * Math.sin(t / 200 + s * 2 + li);
     c.fillStyle = li % 3 === 0 ? '#ffffff' : li % 3 === 1 ? '#ffea75' : '#ff9933';
     c.globalAlpha = 0.45 + 0.55 * glow;
     c.fillRect(lx - 1, ly - 1, 2, 2);
    }
   }
   c.restore();
  }

// 1.4 CITTÀ E BORGHI IN MINIATURA (~15% delle dimensioni standard)
  const numMiniTowns = 6, miniLoop = w + 2000;
  for (let m = 0; m < numMiniTowns; m++) {
   const mRawPos = t * 0.35 + m * (miniLoop / numMiniTowns) + 500;
   const mCycle = Math.floor(mRawPos / miniLoop);
   const mx = w + 1000 - (mRawPos % miniLoop);
   const rndM = (salt) => { const x = Math.sin(m * 123.45 + mCycle * 54.32 + salt) * 43758.5453; return x - Math.floor(x); };
   const my = h * (0.08 + rndM(1.3) * 0.84);    // Sparpagliate su tutta l'altezza dello schermo (8% - 92%)
   const mSize = 24 + rndM(2.1) * 8;             // Dimensione al 15% (24 - 32px)
   const mRot = rndM(3.7) * TAU;                 // Rotazione casuale

   c.save();
   c.translate(mx, my);
   c.rotate(mRot);

   // A. Piccola chiazza di terreno suburbano scuro
   c.fillStyle = '#141e14';
   c.globalAlpha = 0.35;
   c.beginPath();
   c.arc(0, 0, mSize * 0.85, 0, TAU);
   c.arc((rndM(4.1) - 0.5) * 12, (rndM(5.2) - 0.5) * 12, mSize * 0.65, 0, TAU);
   c.fill();

   // B. Micro inquinamento luminoso ambrato
   c.globalAlpha = 0.16;
   const mGrad = c.createRadialGradient(0, 0, 2, 0, 0, mSize * 1.35);
   mGrad.addColorStop(0, '#ffb443');
   mGrad.addColorStop(1, 'rgba(8, 12, 16, 0)');
   c.fillStyle = mGrad;
   c.beginPath();
   c.arc(0, 0, mSize * 1.35, 0, TAU);
   c.fill();

   // C. Snodi stradali (4-5 piccoli assi scuri che irradiano verso l'esterno)
   c.strokeStyle = '#05080c';
   c.lineWidth = 2.2;
   c.globalAlpha = 0.85;
   c.lineCap = 'round';
   c.beginPath();
   for (let r = 0; r < 5; r++) {
    const rAng = (r / 5) * TAU + (rndM(r * 2 + 6) - 0.5) * 0.5;
    const rLen = mSize * (0.6 + rndM(r * 3 + 7) * 0.5);
    c.moveTo(0, 0);
    c.lineTo(Math.cos(rAng) * rLen, Math.sin(rAng) * rLen);
   }
   c.stroke();

   // D. Centro abitato (Downtown compatto: 10 lucine dense)
   for (let cl = 0; cl < 10; cl++) {
    const cDist = rndM(cl * 4 + 8) * (mSize * 0.32);
    const cAng = rndM(cl * 5 + 9) * TAU;
    const glow = 0.5 + 0.5 * Math.sin(t / 160 + cl + m);
    c.fillStyle = cl % 2 === 0 ? '#ffea75' : '#ffb443';
    c.globalAlpha = 0.6 + 0.4 * glow;
    c.fillRect(Math.cos(cAng) * cDist - 1, Math.sin(cAng) * cDist - 1, 2.2, 2.2);
   }

   // E. Lucine periferiche sparse (14 lucine più sfumate)
   for (let pl = 0; pl < 14; pl++) {
    const pDist = (0.35 + rndM(pl * 6 + 10) * 0.65) * mSize;
    const pAng = rndM(pl * 7 + 11) * TAU;
    const glow = 0.4 + 0.6 * Math.sin(t / 200 + pl * 2 + m);
    c.fillStyle = pl % 3 === 0 ? '#ffffff' : pl % 3 === 1 ? '#ffea75' : '#ff7a33';
    c.globalAlpha = 0.45 + 0.55 * glow;
    c.fillRect(Math.cos(pAng) * pDist - 1, Math.sin(pAng) * pDist - 1, 1.8, 1.8);
   }

   c.restore();
  }

// 1.5. CITTÀ NOTTURNE VISTE DALL'ALTO (Posizione, rotazione e dimensione casuali)
  const cityData = [
   { offset: 0, speed: 0.35 },
   { offset: 1800, speed: 0.35 }
  ];
  const cityLoopDist = w + 2400;

  for(let i = 0; i < cityData.length; i++) {
   const cEntry = cityData[i];
   const rawPos = t * cEntry.speed + cEntry.offset;
   const cycle = Math.floor(rawPos / cityLoopDist);
   const speed = rawPos % cityLoopDist;
   const cx = w + 1200 - speed;

   // Calcolo casuale ma coerente per ciascun passaggio
   const rndC = (salt) => {
    const x = Math.sin(cycle * 67.89 + i * 149.23 + salt) * 43758.5453;
    return x - Math.floor(x);
   };

   const cy = h * (0.16 + rndC(1.1) * 0.68);
   const cd = { size: 140 + rndC(2.2) * 110 }; // Unico 'cd', con la dimensione casuale
   const cityRot = rndC(3.3) * TAU;

   c.save();
   c.translate(cx, cy);
   c.rotate(cityRot);

   // Macchie di terreno naturali vincolate alla città ma ampiamente disperse nello spazio
   const seedBlob = i * 888;
   const numBlobs = 10;
   const patchTones = ['#131d13', '#182417', '#152015', '#1a261a', '#111b11', '#162218', '#141e14', '#192518'];
   //const patchTones = ['#1d2d1e', '#292e1d', '#28211b', '#202f23', '#1f272a', '#2c271b', '#233423', '#2b231d'];

   for (let b = 0; b < numBlobs; b++) {
    const rnd = (s) => { const x = Math.sin(s * 19.898) * 43758.5453; return x - Math.floor(x); };
    c.fillStyle = patchTones[b % patchTones.length];
    c.globalAlpha = 0.32;
    
    c.beginPath();
    // Angolo aureo (137.5°) + rotazione base città: impossibile avere punti allineati sugli stessi assi
    const goldenAngle = 2.3999632;
    const angle = rnd(seedBlob + 17.5) * TAU + b * goldenAngle;
    
    // Raggio proporzionale all'area (distribuzione uniforme dal centro verso i bordi)
    const spreadArea = Math.sqrt((b + 0.5) / numBlobs);
    const dist = cd.size * (0.6 + spreadArea * 3.8 + (rnd(seedBlob + b * 53.1) - 0.5) * 1.2);
    
    // Proporzionato all'aspect ratio panoramico dello schermo (più esteso su X, controllato su Y)
    const bx = Math.cos(angle) * (dist * 1.35) + (rnd(seedBlob + b * 19.3) - 0.5) * (cd.size * 0.8);
    const by = Math.sin(angle) * (dist * 0.85) + (rnd(seedBlob + b * 29.7) - 0.5) * (cd.size * 0.6);
    
    // Dimensioni base (-35%) ed eccentricità (alcune allungate, altre a ventaglio)
    const bSize = cd.size * 1.65;
    const stretchX = 0.65 + rnd(seedBlob + b * 81.3) * 0.85;
    const stretchY = 0.65 + rnd(seedBlob + b * 93.7) * 0.85;
    const rot = rnd(seedBlob + b * 11.2) * TAU;

    // Poligono a 7 lobi asimmetrici con insenature e protuberanze naturali
    const numPts = 7;
    const pts = [];
    for (let p = 0; p < numPts; p++) {
     const pAng = (p / numPts) * TAU + (rnd(seedBlob + b * 15 + p * 3.7) - 0.5) * 0.45;
     // Ampia escursione: raggi corti (rientranze/fenditure) e raggi lunghi (lingue di terra)
     const pRad = bSize * (0.28 + Math.pow(rnd(seedBlob + b * 27 + p * 5.1), 1.6) * 1.25);
     const lx = Math.cos(pAng) * pRad * stretchX;
     const ly = Math.sin(pAng) * pRad * stretchY;
     // Rotazione dell'intera macchia
     pts.push({
      x: bx + lx * Math.cos(rot) - ly * Math.sin(rot),
      y: by + lx * Math.sin(rot) + ly * Math.cos(rot)
     });
    }

    // Curvatura fluida continua attraverso i punti mediani
    c.beginPath();
    const lastPt = pts[numPts - 1];
    let midX = (lastPt.x + pts[0].x) * 0.5;
    let midY = (lastPt.y + pts[0].y) * 0.5;
    c.moveTo(midX, midY);

    for (let p = 0; p < numPts; p++) {
     const nextPt = pts[(p + 1) % numPts];
     const nextMidX = (pts[p].x + nextPt.x) * 0.5;
     const nextMidY = (pts[p].y + nextPt.y) * 0.5;
     c.quadraticCurveTo(pts[p].x, pts[p].y, nextMidX, nextMidY);
    }
    c.closePath();
    c.fill();
   }

   // 1. Alone luminoso notturno (Light pollution)
   c.globalAlpha = 0.14;
   const grad = c.createRadialGradient(0, 0, 10, 0, 0, cd.size * 1.3);
   grad.addColorStop(0, '#ffb443');
   grad.addColorStop(1, 'rgba(8, 12, 16, 0)');
   c.fillStyle = grad;
   c.beginPath();
   c.arc(0, 0, cd.size * 1.3, 0, TAU);
   c.fill();

   // 2. RAGGI PRINCIPALI con lucine posizionate direttamente lungo il loro percorso
   const numRays = 20;
   const seed = i * 999;
   c.lineCap = 'round';

   const rndRayAngle = (idx) => {
    const x = Math.sin(idx * 89.123 + seed * 1.2) * 43758.5453;
    return (x - Math.floor(x)) * TAU;
   };

   const rndRayLen = (min, max, idx) => {
    const x = Math.sin(idx * 12.9898 + seed) * 43758.5453;
    return min + (x - Math.floor(x)) * (max - min);
   };

   for (let j = 0; j < numRays; j++) {
    const angle = rndRayAngle(j);
    const len = rndRayLen(cd.size * 0.25, cd.size * 1.1, j);
    
    // Disegna il raggio scuro
    c.strokeStyle = '#05080c';
    c.lineWidth = 10 + (j % 4) * 5;
    c.globalAlpha = 0.9;

    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(Math.cos(angle) * len, Math.sin(angle) * len);
    c.stroke();

    // Aggiungi 3 lucine scintillanti distribuite lungo questo raggio
    const lightsPerRay = 3;
    for (let rl = 0; rl < lightsPerRay; rl++) {
     const frac = 0.2 + (rl * 0.28) + (rndRayLen(-0.05, 0.05, j + rl));
     if (frac > 0.95 || frac < 0.1) continue;
     const lx = Math.cos(angle) * (len * frac);
     const ly = Math.sin(angle) * (len * frac);

     const glow = 0.4 + 0.6 * Math.sin(t / 200 + rl * 1.5 + j + i);
     c.fillStyle = rl % 2 === 0 ? '#ffea75' : '#ffb443';
     c.globalAlpha = 0.5 + 0.5 * glow;
     c.fillRect(lx - 1, ly - 1, 2.5, 2.5);
    }
   }

   // 3. SOPRA LA RAGGIERA: Griglia ortogonale con linee di lunghezze CASUALI
   const halfLen = cd.size * 0.5 * 0.7; 
   c.strokeStyle = '#05080c'; 
   c.lineWidth = 3; 
   c.globalAlpha = 0.9;

   const rndGridLen = (min, max, idx) => {
    const x = Math.sin(idx * 73.123 + seed * 1.5) * 43758.5453;
    return min + (x - Math.floor(x)) * (max - min);
   };

   const minGridLen = cd.size * 0.08;
   const maxGridLen = cd.size * 0.90;
   
   c.beginPath();
   const numSteps = 9; 
   for (let g = -numSteps; g <= numSteps; g++) {
    const pos = g * (halfLen / numSteps);
    
    const lenV1 = rndGridLen(minGridLen, maxGridLen, g + 111);
    const lenV2 = rndGridLen(minGridLen, maxGridLen, g + 222);
    c.moveTo(pos, -lenV1);
    c.lineTo(pos, lenV2);

    const lenH1 = rndGridLen(minGridLen, maxGridLen, g + 333);
    const lenH2 = rndGridLen(minGridLen, maxGridLen, g + 444);
    c.moveTo(-lenH1, pos);
    c.lineTo(lenH2, pos);
   }
   c.stroke();

   // 4. LUCINE SPARSE E NUCLEO CENTRALE (Downtown ad altissima concentrazione)
   
   // A. Nucleo centrale (Downtown): concentrazione elevata di luci calde e bianche al centro
   const coreLights = 50;
   const rndCore = (idx, salt) => {
    const x = Math.sin(idx * 37.123 + salt) * 43758.5453;
    return x - Math.floor(x);
   };

   for (let cl = 0; cl < coreLights; cl++) {
    const dist = rndCore(cl, seed + 50) * (cd.size * 0.25); // Raggio stretto al centro (25%)
    const angle = rndCore(cl, seed + 60) * TAU;
    const lx = Math.cos(angle) * dist;
    const ly = Math.sin(angle) * dist;

    const glow = 0.5 + 0.5 * Math.sin(t / 150 + cl);
    c.fillStyle = cl % 3 === 0 ? '#ffffff' : cl % 3 === 1 ? '#ffea75' : '#ffb443';
    c.globalAlpha = 0.6 + 0.4 * glow;
    c.fillRect(lx - 1, ly - 1, 3, 3);
   }

   // B. Lucine periferiche sparse (150 lucine, più fitte verso il centro)
   const numLights = 150;
   const rndLight = (idx, salt) => {
    const x = Math.sin(idx * 51.123 + salt) * 43758.5453;
    return x - Math.floor(x);
   };

   for (let l = 0; l < numLights; l++) {
    // Usando esponente > 1, le luci si concentrano naturalmente di più verso il centro
    const dist = Math.pow(rndLight(l, seed + 10), 1.4) * (cd.size * 0.75);
    const angle = rndLight(l, seed + 20) * TAU;
    const lx = Math.cos(angle) * dist;
    const ly = Math.sin(angle) * dist;

    const glow = 0.4 + 0.6 * Math.sin(t / 200 + rndLight(l, seed + 30) * 10 + i);
    c.fillStyle = l % 5 === 0 ? '#ffea75' : l % 5 === 1 ? '#ffb443' : l % 5 === 2 ? '#ffffff' : l % 5 === 3 ? '#ff7a33' : '#aad4ff';
    c.globalAlpha = 0.45 + 0.55 * glow;

    c.fillRect(lx - 1, ly - 1, 2.5, 2.5);
   }

   c.restore();
  }

// 2. STRATO DI NUVOLE (Velocità rapida, pari a quella del terreno)
  //c.fillStyle = 'rgba(160, 210, 225, 0.07)'; // Azzurro nebbioso / atmosferico
  c.fillStyle = 'rgba(160, 210, 225, 0.21)'; // Azzurro nebbioso / atmosferico
  
  const CLOUD_SCALE = 3.0; // <-- MODIFICA QUI: es. 0.7 (-30%), 0.5 (-50%), 1.4 (+40%)

  const cloudData = [
   { y: 0.15, speed: 0.25, scale: 0.8, type: 0 },
   { y: 0.58, speed: 0.4,  scale: 1.4, type: 1 },
   { y: 0.24, speed: 0.3,  scale: 0.9, type: 2 },
   { y: 0.70, speed: 0.55, scale: 1.2, type: 3 },
   { y: 0.35, speed: 0.45, scale: 1.0, type: 0 },
   { y: 0.50, speed: 0.275,scale: 1.3, type: 2 }
  ];

  for(let i = 0; i < cloudData.length; i++) {
   const cd = cloudData[i];
   const drift = (t * cd.speed + i * 200) % (w + 500);
   const cx = w + 300 - drift; // Scorrimento rapido verso sinistra
   const cy = h * cd.y + Math.sin(t/800 + i * 1.5) * 15;
   
   c.beginPath();
   c.save();
   c.translate(cx, cy);
   c.scale(cd.scale * CLOUD_SCALE, cd.scale * CLOUD_SCALE);
   
   // Funzione helper: isola ogni lobo con moveTo per evitare tagli geometrici interni
   const addCircle = (x, y, r) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); };
   const addEllipse = (x, y, rx, ry, rot) => { c.moveTo(x + rx, y); c.ellipse(x, y, rx, ry, rot, 0, TAU); };

   if (cd.type === 0) {
    addCircle(0, 0, 45);
    addCircle(35, -12, 38);
    addCircle(-30, 8, 32);
   } else if (cd.type === 1) {
    addEllipse(0, 0, 70, 22, 0.15);
    addEllipse(45, -4, 50, 18, 0);
    addCircle(20, -2, 28); // Sigilla il nucleo centrale
   } else if (cd.type === 2) {
    addCircle(0, 0, 50);
    addCircle(-25, -22, 35);
    addCircle(30, -18, 40);
    addCircle(5, -38, 25);
    addCircle(0, -15, 30); // Sigilla il nucleo centrale
   } else {
    addCircle(-35, 0, 32);
    addCircle(0, 6, 42);
    addCircle(38, -4, 28);
    addCircle(65, 4, 22);
   }
   c.fill();
   c.restore();
  }

  // Posizione della Dropship (movimento sinuoso)
          const dsX = w / 2 + Math.sin(t / 250) * 20; 
          const dsY = h / 2 - 10 + Math.cos(t / 350) * 12 + Math.sin(t / 80) * 2; 

/*
          // 3. OMBRA PROIETTATA A TERRA (Ancora più indietro)
  c.fillStyle = 'rgba(0, 0, 0, 0.45)';
  c.beginPath();
  c.ellipse(dsX - 120, dsY + 120, 40, 20, 0, 0, Math.PI * 2);
  c.fill();
*/
          // 4. LA DROPSHIP E LE FIAMME
          if (typeof drawDropship === 'function') {
           const pCi = (typeof P !== 'undefined' && P && P.ci != null) ? P.ci : 0;
           let baseCol = '#4aa3ff';
           if (typeof COLS !== 'undefined' && COLS) {
            const raw = COLS[pCi] != null ? COLS[pCi] : COLS[0];
            if (typeof raw === 'string') baseCol = raw;
            else if (Array.isArray(raw)) baseCol = typeof raw[0] === 'number' ? `rgb(${raw[0]},${raw[1]},${raw[2]})` : raw[0];
            else if (raw && typeof raw === 'object') {
             baseCol = raw.turret || raw.c || raw.col || raw.color || raw.hex || raw.main ||
                       Object.values(raw).find(v => typeof v === 'string' && (v[0] === '#' || v.startsWith('rgb'))) || baseCol;
            } else if (typeof raw === 'number') baseCol = '#' + raw.toString(16).padStart(6, '0');
           }
           const alpha = 0.65 + 0.25 * Math.sin(t * Math.PI / 125);
           let flameCol = `rgba(74, 163, 255, ${alpha})`;
           if (typeof baseCol === 'string' && baseCol[0] === '#') {
            const hex = baseCol.slice(1);
            const n = parseInt(hex.length === 3 ? hex.split('').map(x => x + x).join('') : hex, 16);
            if (!isNaN(n)) flameCol = `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
           } else if (typeof baseCol === 'string' && baseCol.startsWith('rgb')) {
            flameCol = baseCol.replace(/rgba?\(([^)]+)\)/, (_, m) => `rgba(${m.split(',').slice(0, 3).join(',')}, ${alpha})`);
           }

           // 4 scie ovali allungate all'indietro per i 4 motori
           c.save();
           c.translate(dsX, dsY);
           c.scale(2.0, 2.0);
           c.rotate(Math.PI / 2);
           c.fillStyle = flameCol;
           
           c.beginPath(); c.ellipse(-29.5, 18, 4, 25, 0, 0, TAU); c.fill();
           c.beginPath(); c.ellipse(29.5, 18, 4, 25, 0, 0, TAU); c.fill();
           c.beginPath(); c.ellipse(-6, 75, 5.5, 30, 0, 0, TAU); c.fill();
           c.beginPath(); c.ellipse(6, 75, 5.5, 30, 0, 0, TAU); c.fill();
           c.restore();

           drawDropship(dsX, dsY, 0, pCi);
          }

  // 5. SCIE ATMOSFERICHE (Coprono tutto lo schermo e variano in modo organico)
  for (let i = 0; i < 18; i++) {
   const rnd1 = Math.abs(Math.sin(i * 12.9898 + 1.2));
   const rnd2 = Math.abs(Math.sin(i * 78.233 + 4.5));
   const rnd3 = Math.abs(Math.sin(i * 45.123 + 7.8));

   const spd = 3.2 + rnd1 * 3.8;                    // Velocità asimmetriche
   const loopLen = w + 800;
   const speed = ((t * spd + rnd2 * loopLen) % loopLen);
   const xPos = w + 400 - speed;
   const yPos = rnd3 * h;                           // Copre tutta l'altezza da 0 ad H
   const len = 70 + rnd1 * 260;                     // Lunghezze variegate (70 - 330px)
   const th = 1.0 + rnd2 * 2.2;                     // Spessori sottili diversi (1 - 3.2px)

   c.fillStyle = `rgba(223, 233, 220, ${0.07 + rnd3 * 0.15})`;
   c.fillRect(xPos, yPos, len, th);
  }
 

/*
 // Testo Titolo in alto
 c.textAlign='center';
 c.fillStyle='#dfe9dc';
 c.font='600 22px system-ui,sans-serif';
 c.fillText('AIRGRUNT', w/2, Math.max(60, h * 0.15));

*/

// Barra di progresso in basso
  const barY = h - Math.min(290, h * 0.35);
  c.textAlign = 'center';
  c.font = '14px system-ui,sans-serif';
  c.fillStyle = '#9bd3a1';
  c.fillText((G.bakeMsg || '') + '  ' + Math.round((G.bakeP || 0) * 100) + '%', w / 2, barY - 10);

  const bw = Math.min(320, w * .7);
  c.fillStyle = '#1b2a1b';
  c.fillRect(w / 2 - bw / 2, barY, bw, 10);
  c.fillStyle = '#3fae4a';
  c.fillRect(w / 2 - bw / 2, barY, bw * (G.bakeP || 0), 10);

  // ===== TRAMA DELLA MISSIONE (in alto, solo testo con bordo nero) =====
  if (typeof MISSION_STORY !== 'undefined' && typeof G !== 'undefined' && typeof G.mt === 'number') {
   const isDM = (G.mode == 1);
   const storyText = isDM
    ? 'Deathmatch: agenti ostili combattono per la supremazia del settore. Primo a '
      + (typeof DM_LIMIT !== 'undefined' ? DM_LIMIT : 15)
      + ' uccisioni vince. Nessuna alleanza, nessuna tregua, nessuna pietà.'
    : (MISSION_STORY[G.mt] || '');
   const storyTitle = isDM
    ? 'DEATHMATCH'
    : 'MISSIONE: ' + (typeof MIS_NAMES !== 'undefined' && MIS_NAMES[G.mt]
        ? MIS_NAMES[G.mt].toUpperCase()
        : 'IN CORSO');

   if (storyText) {
    // pannello in ALTO: si adatta allo spazio verticale REALE disponibile (dal bordo superiore
    // alla barra di progresso) e il font si rimpicciolisce finché TUTTO il testo ci sta: nessun taglio.
    const panelW = Math.min(w * 0.92, 1000);
    const panelX = (w - panelW) / 2;
    const panelY = 14;
    const availH = Math.max(0, barY - 50 - panelY);      // spazio reale fino alla barra di progresso (meno margine)
    const panelH = Math.min(280, availH);

    // su schermi molto bassi si salta (mancanza di spazio): la barra di progresso resta comunque visibile
    if (panelH >= 60) {
     // impostazioni comuni del contorno nero (nitido, senza punte)
     c.lineJoin = 'round';
     c.miterLimit = 2;

     // titolo (nome missione) — TESTO DOPPIO con bordo nero sottile; dimensione adattiva
     const titleSize = Math.max(14, Math.min(28, Math.floor(panelH / 5)));
     c.textAlign = 'center';
     c.font = 'bold ' + titleSize + 'px system-ui,sans-serif';
     c.strokeStyle = '#000000';
     c.lineWidth = Math.max(2.5, titleSize * 0.13);
     c.strokeText(storyTitle, w / 2, panelY + titleSize + 4);
     c.fillStyle = '#ffd23f';
     c.fillText(storyTitle, w / 2, panelY + titleSize + 4);

     // corpo con wrapping automatico e AUTO-FIT del font: sceglie la dimensione più grande
     // (tra 24 e 10 px) che fa stare TUTTO il testo nello spazio disponibile, così non viene mai tagliato.
     // Spazio riservato tra il titolo e il corpo: l'ascendente del font corpo MASSIMO (24px)
     // più un margine. Usato solo per stimare in modo conservativo lo spazio disponibile.
     const titleGap = Math.round(24 * 0.85) + 14;
     const bodyAvail = panelH - titleSize - 4 - titleGap - 6;
     const maxWidth = panelW - 40;
     const words = storyText.split(' ');

     const wrap = fs => {
      c.font = fs + 'px system-ui,sans-serif';
      const ls = []; let cur = '';
      for (const word of words) {
       const test = cur ? cur + ' ' + word : word;
       if (c.measureText(test).width > maxWidth && cur) { ls.push(cur); cur = word; }
       else { cur = test; }
      }
      if (cur) ls.push(cur);
      return ls;
     };

     let bodyFont = 10, lineH = 14, lines = null;
     for (let fs = 24; fs >= 10; fs--) {
      const lh = Math.round(fs * 1.4), ls = wrap(fs);
      if (ls.length * lh <= bodyAvail) { bodyFont = fs; lineH = lh; lines = ls; break; }
     }
     if (!lines) { lines = wrap(10); bodyFont = 10; lineH = 14; }

     // bodyTop calcolato DOPO aver scelto bodyFont, aggiungendo l'ascendente reale (≈0.85·font)
     // e un margine, così il corpo non sale mai sul titolo.
     const bodyTop = panelY + titleSize + 4 + Math.round(bodyFont * 0.85) + 12;

     c.font = bodyFont + 'px system-ui,sans-serif';
     c.textAlign = 'left';
     c.strokeStyle = '#000000';
     c.lineWidth = Math.max(2, bodyFont * 0.12);
     c.fillStyle = '#dfe9dc';
     const maxLines = Math.max(1, Math.floor((panelH - (bodyTop - panelY)) / lineH));
     for (let i = 0; i < lines.length && i < maxLines; i++) {
      const isTruncated = (i === maxLines - 1 && lines.length > maxLines);
      const txt = isTruncated ? lines[i] + '…' : lines[i];
      c.strokeText(txt, panelX + 20, bodyTop + i * lineH);
      c.fillText(txt, panelX + 20, bodyTop + i * lineH);
     }
     c.textAlign = 'center';
    }
   }
  }

  c.textAlign = 'left';
 }   // ← chiude if(G.bakeMsg && G.bakeMsg.includes("VIAGGIO"))
}    // ← chiude bakeDraw()
