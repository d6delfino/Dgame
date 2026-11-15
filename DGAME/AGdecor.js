'use strict';
/* AIRGRUNT · AGdecor.js — tutto ciò che è PIATTO: viene disegnato una sola volta nell'immagine di sfondo (vedi AGbake.js).
   Qui NON c'è nulla di interattivo: sono solo disegni derivati dalla geometria del mondo (M) e da M.flat.
   Il terreno è il RISULTATO di tutti i disegni: il colore di base dipende dalla "urbanità" locale (edifici, strade, piazzali nei dintorni),
   poi si sovrappongono rumore, quote, dettagli sparsi, piazzali, strade con marciapiedi e segnaletica, acqua, moli, ponti, macerie e luci.
   Tutto è deterministico (hash del seed): ogni client produce lo stesso sfondo senza scambiare dati.
   Ordine dei livelli: terreno → quote → colline → dettagli sparsi → superfici piatte → pavimentazione sotto gli edifici → strade → rampe →
   acqua e rive → isole → moli → ponti → cascate → macerie e basi degli oggetti reali → luci. */
const DC={URB:null,GM:null,NZ:[],FI:new Map(),OI:new Map(),seed:1,LAMPS:[]};
const hs=(i,j,s)=>{let h=Math.imul(i|0,374761393)+Math.imul(j|0,668265263)+Math.imul((s|0)+1,1274126177)|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296};
const hex=c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const rgbs=a=>`rgb(${a[0]|0},${a[1]|0},${a[2]|0})`;
const mixc=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const urbAt=(x,y)=>{const fx=clamp(x/TC-.5,0,GW-1.001),fy=clamp(y/TC-.5,0,GH-1.001),i=fx|0,j=fy|0,u=fx-i,v=fy-j,U=DC.URB;return(U[j*GW+i]*(1-u)+U[j*GW+i+1]*u)*(1-v)+(U[(j+1)*GW+i]*(1-u)+U[(j+1)*GW+i+1]*u)*v};
const rtype=(x,y)=>M.regions[M.reg[clamp(y/TC|0,0,GH-1)*GW+clamp(x/TC|0,0,GW-1)]].type;
function rrect(g,x,y,w,h,r){r=Math.min(r,w/2,h/2);g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()}
function qp(g,q,k){g.beginPath();   // sagoma di una primitiva, ingrandita di -k (k negativo = bordo esterno)
 if(q.k=='r')g.rect(q.x-q.a+k,q.y-q.b+k,Math.max(1,2*(q.a-k)),Math.max(1,2*(q.b-k)));
 else if(q.k=='c')g.arc(q.x,q.y,Math.max(1,q.a-k),0,TAU);
 else if(q.k=='p'){const r=Math.max(1,q.a-k);for(let i=0;i<q.n;i++){const a=i*TAU/q.n;g.lineTo(q.x+Math.cos(a)*r,q.y+Math.sin(a)*r)}g.closePath()}
 else if(q.k=='g'){q.vs.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath()}}
function offs(pts,d){const o=[];for(let i=0;i<pts.length;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(pts.length-1,i+1)],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;o.push([pts[i][0]+-dy/l*d,pts[i][1]+dx/l*d])}return o}
function pline(g,pts){g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]))}
const CAR_COL=['#c0392b','#2e86c1','#d4ac0d','#bdc3c7','#2c3e50','#e67e22','#8e44ad','#16a085','#ecf0f1','#e84393','#00cec9','#34495e'];
function car(g,x,y,a,col,len,wid){g.save();g.translate(x,y);g.rotate(a);const l=len/2,w=wid/2;
 g.fillStyle='rgba(0,0,0,.3)';rrect(g,-l+2,-w+3,len,wid,3);g.fill();g.fillStyle=col;rrect(g,-l,-w,len,wid,3);g.fill();
 g.fillStyle='rgba(0,0,0,.45)';rrect(g,-l*.38,-w*.76,len*.46,wid*.76,2);g.fill();g.fillStyle='rgba(255,255,255,.18)';g.fillRect(-l*.3,-w*.6,len*.18,wid*.5);
 g.fillStyle='#ffe9a0';g.fillRect(l-2,-w+1,2,2);g.fillRect(l-2,w-3,2,2);g.fillStyle='#ff4040';g.fillRect(-l,-w+1,2,2);g.fillRect(-l,w-3,2,2);g.restore()}
function truck(g,x,y,a,col,len,wid){g.save();g.translate(x,y);g.rotate(a);const l=len/2,w=wid/2;
 g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-l+2,-w+3,len,wid);g.fillStyle=col;g.fillRect(-l,-w,len,wid);g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-l,-w,len,2);g.fillRect(-l,w-2,len,2);
 g.fillStyle='rgba(0,0,0,.35)';g.beginPath();g.arc(-l*.1,0,w*.55,0,TAU);g.fill();g.fillRect(-l*.1,-1.5,l*.9,3);g.restore()}
 
function tractor(g,x,y,a,col){g.save();g.translate(x,y);g.rotate(a);
 g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-10,-8,20,16); // ombra
 g.fillStyle='#111';g.fillRect(-12,-10,12,4);g.fillRect(-12,6,12,4); // ruote post
 g.fillRect(6,-7,6,3);g.fillRect(6,4,6,3); // ruote ant
 g.fillStyle=col;g.fillRect(-8,-4,18,8); // corpo
 g.fillStyle='rgba(255,255,255,.4)';g.fillRect(-6,-3,6,6); // cabina
 g.fillStyle='#333';g.beginPath();g.arc(8,0,2,0,TAU);g.fill(); // motore
 g.restore()}

function boat(g,x,y,a,col,len,wid,sty){g.save();g.translate(x,y);g.rotate(a);const l=len/2,w=wid/2;
 g.fillStyle='rgba(0,0,0,.3)';g.beginPath();g.ellipse(3,4,l,w,0,0,TAU);g.fill(); // ombra
 g.fillStyle=col;g.beginPath();g.moveTo(l,0);g.bezierCurveTo(l*.6,w,-l*.7,w,-l,w*.75);g.lineTo(-l,-w*.75);g.bezierCurveTo(-l*.7,-w,l*.6,-w,l,0);g.fill(); // scafo
 g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1.5;g.stroke();
 
 if(sty===1){ // Peschereccio / Barca da lavoro (argano e cassoni)
  g.fillStyle='#8a6a3a';g.fillRect(-l*.3,-w*.6,l*.6,w*1.2); // ponte in legno
  g.fillStyle='#e0e0e0';g.fillRect(l*.1,-w*.45,l*.5,w*.9); // cabina di prua
  g.fillStyle='#111';g.fillRect(-l*.8,-w*.35,l*.3,w*.7); // argano/motore
  g.fillStyle='#f39c12';circle(-l*.2,-w*.25,2);circle(-l*.2,w*.25,2); // boe
 } else if(sty===2){ // Gommone d'altura / RIB con tubolari scuri
  g.strokeStyle='#2c3e50';g.lineWidth=Math.max(2,w*.25);g.beginPath();
  g.moveTo(-l,-w*.8);g.lineTo(l*.6,-w*.8);g.lineTo(l,0);g.lineTo(l*.6,w*.8);g.lineTo(-l,w*.8);g.stroke();
  g.fillStyle='#ecf0f1';g.fillRect(-l*.3,-w*.4,l*.6,w*.8); // console guida
  g.fillStyle='#111';g.fillRect(-l*.9,-w*.3,l*.2,w*.6); // motori doppi
 } else { // Motoscafo classico con parabrezza e prendisole
  g.fillStyle='rgba(255,255,255,.85)';g.fillRect(-l*.5,-w*.5,l*.7,w);
  g.fillStyle='#1d2a36';g.beginPath();g.arc(l*.2,0,w*.45,-Math.PI/2,Math.PI/2);g.fill(); // parabrezza fumé
  if(len>35){ // Se grande (>140%): salvagente rosso/bianco e antenna
   g.strokeStyle='#e74c3c';g.lineWidth=2;circle(-l*.2,0,w*.3);
   g.fillStyle='#333';g.fillRect(-l*.6,-1,l*.2,2);
  }
 }
 g.restore()}

function hoverbike(g,x,y,a,col){g.save();g.translate(x,y);g.rotate(a);
 g.fillStyle='rgba(0,0,0,.25)';g.fillRect(-8,-3,16,6); // ombra
 g.fillStyle=col;g.fillRect(-7,-2.5,14,5); // telaio
 g.fillStyle='#111';g.fillRect(3,-4,2,8); // manubrio
 g.fillStyle='#2c3e50';g.fillRect(-4,-1.5,5,3); // sella
 g.fillStyle='#00e5ff';g.fillRect(-9,-1.5,2,3); // propulsore ionico posteriore
 g.restore()}

function smallShip(g,x,y,a,col){g.save();g.translate(x,y);g.rotate(a);
 g.fillStyle='rgba(0,0,0,.3)';g.beginPath();g.moveTo(17,3);g.lineTo(-10,14);g.lineTo(-10,-6);g.fill(); // ombra
 g.fillStyle=col;g.beginPath();g.moveTo(15,0);g.lineTo(-10,12);g.lineTo(-10,-12);g.fill(); // ala delta
 g.fillStyle='#2c3e50';g.fillRect(-12,-5,6,10); // blocco motore
 g.fillStyle='#00e5ff';g.beginPath();g.arc(2,0,3,0,TAU);g.fill(); // cockpit
 g.fillStyle='rgba(143,227,255,.6)';g.fillRect(-15,-3,3,6); // luce reattore
 g.restore()}

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
 // mappa colore del terreno: 1 pixel per cella, ingrandita con interpolazione → transizioni morbide
 const BASE={nature:'#3f7336',rural:'#6a9b47',urban:'#66914c',indus:'#667a56',mil:'#6c7a5d',base:'#6f8665'},CON=hex('#4e5259'),W1=GW+1;
 const gm=document.createElement('canvas');gm.width=GW;gm.height=GH;const gx=gm.getContext('2d'),im=gx.createImageData(GW,GH);
 for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const t=M.regions[M.reg[j*GW+i]].type,e=(M.E[j*W1+i]+M.E[j*W1+i+1]+M.E[(j+1)*W1+i]+M.E[(j+1)*W1+i+1])/4,u=smooth(.12,.7,DC.URB[j*GW+i]);
  let c=mixc(hex(BASE[t]||BASE.rural),[170,176,110],clamp(e*.16,0,.3));c=mixc(c,CON,u*.92);
  // macchie verdi scure per le zone naturali/rurali: tre scale sovrapposte (640px, 160px, 80px)
  let bv=1;
  if(t==='nature'||t==='rural'){
   const h1=hs(i>>4,j>>4,DC.seed+301),h2=hs(i>>2,j>>2,DC.seed+302),h3=hs(i>>1,j>>1,DC.seed+303);
   const b1=h1<.45?-(1-h1/.45)*.25:0;   // fino a -25% in circa il 45% delle celle-macro
   const b2=h2<.35?-(1-h2/.35)*.15:0;   // fino a -15% a scala media
   const b3=h3<.30?-(1-h3/.30)*.08:0;   // fino a  -8% a scala piccola
   bv=1+b1+b2+b3;
  }
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
 const ZZ={slab:0,field:0,park:1,circ:1,lot:2,rail:4,pipe:4,car:5,truck:5,boat:5,lamp:6,pool:7,court:7,wreckage:7,animalPen:7,construction:7,refuelScene:7,repairScene:7,campsite:7,solarArray:7,ventBunker:7,pad:7,tractor:7,smallShip:7,hoverbike:7,veh:7,scn:7};   // 7 = non passa da pFlat (disegnati da pProps/pPads/pCars, DOPO l'acqua): pool e court sopra l'acqua
 for(const f of M.flat){f.z=ZZ[f.k]||0;let r;if(f.pts){let a=1e9,b=1e9,c=-1e9,d=-1e9;for(const p of f.pts){a=Math.min(a,p[0]);b=Math.min(b,p[1]);c=Math.max(c,p[0]);d=Math.max(d,p[1])}put(DC.FI,a-30,b-30,c+30,d+30,f);continue}
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
 for(const p of M.piers){for(let u=-p.L/2+30;u<p.L/2-10;u+=80)for(const sd of[-1,1])f.push({k:'lamp',x:p.x+u-0,y:p.y+sd*(p.W/2-7),c:2})}
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
function pLevels(g,x0,y0){const x1=x0+CH,y1=y0+CH;
 for(let t=1;t<=2;t++){const p=levelPath(t-.5,x0-TC,y0-TC,x1+TC,y1+TC);
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
   g.lineWidth=lw;
   g.stroke(p);
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

// colori slab: scuri e vicini al terreno urbano (CON in decorPrep), così il bordo si fonde; [base, scuro]
const SLAB_COL=[['#4b5058','#383c43'],['#50564f','#3c413b'],['#564f4a','#403a36'],['#474c5e','#353949'],['#504b57','#3b3742'],['#3f4e4d','#2e3b3a']];
const slabTone=(x,y)=>SLAB_COL[(hs(x|0,y|0,DC.seed+31)*SLAB_COL.length)|0];
function slabSoft(g,f){
 const w=f.w,h=f.h,sd=((f.x|0)*13+(f.y|0)*7)|0,H=(i,k)=>hs(i,sd,DC.seed+k),T=slabTone(f.x,f.y);
 // 1. base con alone sfumato: il bordo si dissolve nel terreno
 g.save();g.shadowColor=T[0];g.shadowBlur=28;g.fillStyle=T[0];g.fillRect(-w/2,-h/2,w,h);g.restore();
 g.fillStyle=T[0];g.fillRect(-w/2,-h/2,w,h);
 g.save();g.beginPath();g.rect(-w/2,-h/2,w,h);g.clip();
 // 2. zone di tono diverso
 const ZT=['rgba(20,40,60,.22)','rgba(60,40,20,.2)','rgba(10,10,14,.25)','rgba(40,70,50,.18)'];
 for(let i=0;i<4;i++){if(H(i,1)<.25)continue;const zw=w*(.2+H(i,2)*.3),zh=h*(.2+H(i,3)*.3);g.fillStyle=ZT[(H(i,4)*4)|0];g.fillRect((H(i,5)-.5)*(w-zw)-zw/2,(H(i,6)-.5)*(h-zh)-zh/2,zw,zh)}
 // 3. giunti della pavimentazione (90°)
 g.strokeStyle='rgba(255,255,255,.05)';g.lineWidth=1;g.beginPath();for(let x=-w/2+40;x<w/2;x+=40){g.moveTo(x,-h/2);g.lineTo(x,h/2)}for(let y=-h/2+40;y<h/2;y+=40){g.moveTo(-w/2,y);g.lineTo(w/2,y)}g.stroke();
 // 4. rete stradina: anello ottagonale (lati a 90° e smussi a 45°), 4 uscite a 90°, 4 diagonali a 45° fino agli angoli
 const m=clamp(Math.min(w,h)*.1,10,26),rw=clamp(Math.min(w,h)*.06,7,13),a=w/2-m,b=h/2-m,c=Math.min(a,b)*.38;
 const net=()=>{g.beginPath();g.moveTo(-a+c,-b);g.lineTo(a-c,-b);g.lineTo(a,-b+c);g.lineTo(a,b-c);g.lineTo(a-c,b);g.lineTo(-a+c,b);g.lineTo(-a,b-c);g.lineTo(-a,-b+c);g.closePath();
  for(const sx of[-1,1])for(const sy of[-1,1]){g.moveTo(sx*(a-c/2),sy*(b-c/2));g.lineTo(sx*w/2,sy*h/2)}
  g.moveTo(0,-b);g.lineTo(0,-h/2);g.moveTo(0,b);g.lineTo(0,h/2);g.moveTo(-a,0);g.lineTo(-w/2,0);g.moveTo(a,0);g.lineTo(w/2,0)};
 // vialetti pedonali verso l'edificio (si vedono anche quando crolla)
 const t=Math.min(a,b)-c/2;g.strokeStyle='rgba(200,205,212,.2)';g.lineWidth=4;g.beginPath();g.moveTo(0,-b+rw);g.lineTo(0,b-rw);g.moveTo(-a+rw,0);g.lineTo(a-rw,0);
 for(const sx of[-1,1])for(const sy of[-1,1]){g.moveTo(sx*(a-c/2),sy*(b-c/2));g.lineTo(sx*(a-c/2-t),sy*(b-c/2-t))}g.stroke();
 g.lineJoin='round';g.lineCap='butt';
 for(const[wd,col]of[[rw+9,'rgba(0,0,0,.3)'],[rw+5,'#6b7077'],[rw,'#24272c']]){g.strokeStyle=col;g.lineWidth=wd;net();g.stroke()}
 g.strokeStyle='rgba(235,235,235,.45)';g.lineWidth=1.4;g.setLineDash([9,9]);net();g.stroke();g.setLineDash([]);
 g.strokeStyle='rgba(217,179,0,.35)';g.lineWidth=2;g.setLineDash([12,10]);g.strokeRect(-w/2+4,-h/2+4,w-8,h-8);g.setLineDash([]);
 // 5. dettagli nell'area dentro l'anello: parcheggi, aiuole, casse, serbatoi, pannelli solari, tombini e lampioni
 const ia=a-rw-8,ib=b-rw-8;let n=0;
 for(let gy=-ib+20;gy<=ib-20;gy+=46)for(let gx=-ia+20;gx<=ia-20;gx+=46){n++;
  if(H(n,20)<.45)continue;const px=gx+(H(n,21)-.5)*14,py=gy+(H(n,22)-.5)*14;
  if(Math.abs(px)<rw+14||Math.abs(py)<rw+14||Math.abs(px)+Math.abs(py)>ia+ib-c-10)continue;
  g.save();g.translate(px,py);const k=(H(n,23)*6)|0;
  if(k==0){g.rotate(H(n,24)<.5?0:Math.PI/2);g.fillStyle='rgba(15,17,20,.4)';g.fillRect(-17,-12,34,24);g.strokeStyle='rgba(235,235,235,.6)';g.lineWidth=1.2;g.beginPath();for(const u of[-17,-5.5,5.5,17]){g.moveTo(u,-12);g.lineTo(u,12)}g.stroke();
   for(let j=0;j<3;j++)if(H(n,30+j)<.6)car(g,-11.25+j*11.25,0,Math.PI/2,CAR_COL[(H(n,40+j)*CAR_COL.length)|0],19,8)}
  else if(k==1){g.fillStyle='#2a2c30';rrect(g,-14,-10,28,20,4);g.fill();g.fillStyle='#3e7a3c';rrect(g,-12,-8,24,16,3);g.fill();g.fillStyle='rgba(0,0,0,.25)';g.beginPath();g.arc(1,2,7,0,TAU);g.fill();g.fillStyle='#2f6b2e';g.beginPath();g.arc(0,0,7,0,TAU);g.fill();g.fillStyle='rgba(190,240,130,.35)';g.beginPath();g.arc(-2,-2,3,0,TAU);g.fill()}
  else if(k==2){for(const[cx,cy,s]of[[-6,-4,11],[6,-2,10],[0,7,9]]){g.fillStyle='#7a5c33';g.fillRect(cx-s/2,cy-s/2,s,s);g.strokeStyle='#3a2a14';g.lineWidth=1;g.strokeRect(cx-s/2,cy-s/2,s,s);g.beginPath();g.moveTo(cx-s/2,cy-s/2);g.lineTo(cx+s/2,cy+s/2);g.stroke()}}
  else if(k==3){g.fillStyle='rgba(0,0,0,.3)';g.beginPath();g.arc(2,3,10,0,TAU);g.fill();g.fillStyle='#7b8590';g.beginPath();g.arc(0,0,10,0,TAU);g.fill();g.strokeStyle='#2c3138';g.lineWidth=1.5;g.stroke();g.beginPath();g.arc(0,0,5.5,0,TAU);g.stroke();g.fillStyle='#c8921a';g.fillRect(-1.5,-1.5,3,3)}
  else if(k==4){g.rotate(H(n,24)<.5?0:Math.PI/2);g.fillStyle='#27466f';g.strokeStyle='#8fb4e0';g.lineWidth=.8;for(let r=0;r<2;r++)for(let cc=0;cc<3;cc++){g.fillRect(-18+cc*12.5,-10+r*11,11,9.5);g.strokeRect(-18+cc*12.5,-10+r*11,11,9.5)}}
  else{g.fillStyle='#14161a';g.beginPath();g.arc(0,0,4.5,0,TAU);g.fill();g.strokeStyle='rgba(150,155,165,.6)';g.lineWidth=1;g.stroke();g.beginPath();g.moveTo(-3,0);g.lineTo(3,0);g.moveTo(0,-3);g.lineTo(0,3);g.stroke();g.fillStyle='#fff8e0';g.beginPath();g.arc(9,-9,2,0,TAU);g.fill()}
  g.restore()}
 g.restore()}

const PF={
 slab(g,f){const w=f.w,h=f.h,t=f.t;
  if(f.soft){slabSoft(g,f);return}   // slab dei singoli edifici: vedi slabSoft
  if(t==5){g.fillStyle='#5f9a48';g.fillRect(-w/2,-h/2,w,h);g.fillStyle='rgba(30,90,30,.18)';for(let i=0;i<14;i++){g.beginPath();g.arc((hs(i,1,f.s)-.5)*w,(hs(i,2,f.s)-.5)*h,18+hs(i,3,f.s)*26,0,TAU);g.fill()}
   g.strokeStyle='#2f6a2e';g.lineWidth=6;g.strokeRect(-w/2+3,-h/2+3,w-6,h-6);g.strokeStyle='rgba(255,255,255,.1)';g.lineWidth=2;g.beginPath();for(let v=-h/2+14;v<h/2;v+=14){g.moveTo(-w/2+6,v);g.lineTo(w/2-6,v)}g.stroke();return}
  const base={0:'#52575e',1:'#777b81',3:'#9a9da4',4:'#7b8474'}[t]||'#52575e';
  if(!f.soft){g.fillStyle='rgba(0,0,0,.25)';g.fillRect(-w/2-3,-h/2-3,w+6,h+6)}
  g.fillStyle=base;g.fillRect(-w/2,-h/2,w,h);
  


  if(f.soft){
   // --- piazzale per-edificio: stradine + zone più scure ---
   const sd=((f.x|0)*13+(f.y|0)*7)|0;
   // zone/piazzole più scure
   for(let i=0;i<5;i++){
    if(hs(i,sd,DC.seed)<.3)continue;
    const pw=w*(.18+hs(i,sd,DC.seed+1)*.28),ph=h*(.18+hs(i,sd,DC.seed+2)*.28);
    const px=(hs(i,sd,DC.seed+3)-.5)*(w-pw)*.7,py=(hs(i,sd,DC.seed+4)-.5)*(h-ph)*.7;
    g.fillStyle=hs(i,sd,DC.seed+5)<.5?'rgba(40,44,50,.28)':'rgba(55,58,64,.22)';
    g.fillRect(px-pw/2,py-ph/2,pw,ph);
   }
   // stradine a angoli vari
   for(let i=0;i<4;i++){
    if(hs(i,sd,DC.seed+10)<.25)continue;
    const ang=hs(i,sd,DC.seed+11)*TAU;
    const len=Math.min(w,h)*(.35+hs(i,sd,DC.seed+12)*.45);
    const cx=(hs(i,sd,DC.seed+13)-.5)*w*.35,cy=(hs(i,sd,DC.seed+14)-.5)*h*.35;
    const c=Math.cos(ang),s=Math.sin(ang);
    g.strokeStyle='rgba(45,48,54,.4)';g.lineWidth=6+hs(i,sd,DC.seed+15)*8;
    g.beginPath();g.moveTo(cx-c*len/2,cy-s*len/2);g.lineTo(cx+c*len/2,cy+s*len/2);g.stroke();
    g.strokeStyle='rgba(190,195,200,.18)';g.lineWidth=1.5;
    g.beginPath();g.moveTo(cx-c*len/2,cy-s*len/2);g.lineTo(cx+c*len/2,cy+s*len/2);g.stroke();
   }
   // griglia leggera
   g.strokeStyle='rgba(255,255,255,.08)';g.lineWidth=1;g.beginPath();
   const st=32;for(let x=-w/2+st;x<w/2;x+=st){g.moveTo(x,-h/2);g.lineTo(x,h/2)}for(let y=-h/2+st;y<h/2;y+=st){g.moveTo(-w/2,y);g.lineTo(w/2,y)}g.stroke();
  }



  else{
   g.strokeStyle='rgba(0,0,0,.14)';g.lineWidth=1;g.beginPath();const st=t==0?38:t==4?60:48;for(let x=-w/2+st;x<w/2;x+=st){g.moveTo(x,-h/2);g.lineTo(x,h/2)}for(let y=-h/2+st;y<h/2;y+=st){g.moveTo(-w/2,y);g.lineTo(w/2,y)}g.stroke();
   g.strokeStyle='rgba(255,255,255,.12)';g.lineWidth=2;g.strokeRect(-w/2+1,-h/2+1,w-2,h-2);
  }
  if(t==1||t==3){g.strokeStyle='#d9b300';g.lineWidth=5;g.setLineDash([16,16]);g.strokeRect(-w/2+9,-h/2+9,w-18,h-18);g.setLineDash([]);
   g.fillStyle='rgba(255,255,255,.55)';for(let i=0;i<Math.floor(w/90);i++)g.fillRect(-w/2+30+i*90,h/2-30,4,22)}
  if(t==4){g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=4;g.beginPath();g.moveTo(-w/2+18,0);g.lineTo(w/2-18,0);g.stroke();g.fillStyle='rgba(255,210,70,.55)';for(let i=-3;i<=3;i++)g.fillRect(i*w/8-3,-h/2+10,6,26)}
  if(t==3){g.fillStyle='#2b2e33';for(let u=-w/2+30;u<w/2;u+=60){g.beginPath();g.arc(u,h/2-6,3,0,TAU);g.fill()}}
  g.fillStyle='rgba(10,12,16,.06)';for(let i=0;i<3;i++){g.beginPath();g.ellipse((hs(i,5,f.x|0)-.5)*w,(hs(i,6,f.x|0)-.5)*h,10+hs(i,7,f.x|0)*14,5+hs(i,8,f.x|0)*8,hs(i,9,f.x|0)*3,0,TAU);g.fill()}
  if(f.soft)g.restore()},
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
 pad(g,f){g.save();g.translate(f.x,f.y);g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.arc(3,4,f.r+4,0,TAU);g.fill();g.fillStyle='#52585f';g.beginPath();g.arc(0,0,f.r,0,TAU);g.fill();g.strokeStyle='#e6b422';g.lineWidth=5;g.beginPath();g.arc(0,0,f.r-6,0,TAU);g.stroke();
  g.strokeStyle='#fff';g.lineWidth=7;g.beginPath();g.moveTo(-f.r*.3,-f.r*.42);g.lineTo(-f.r*.3,f.r*.42);g.moveTo(f.r*.3,-f.r*.42);g.lineTo(f.r*.3,f.r*.42);g.moveTo(-f.r*.3,0);g.lineTo(f.r*.3,0);g.stroke();g.restore()},
 rail(g,f){pline(g,f.pts);g.lineCap='butt';g.strokeStyle='#4a3b2c';g.lineWidth=f.w+7;g.setLineDash([4,9]);g.stroke();g.setLineDash([]);for(const d of[-f.w*.32,f.w*.32]){pline(g,offs(f.pts,d));g.strokeStyle='#a9aeb4';g.lineWidth=1.6;g.stroke()}},
 pipe(g,f){pline(g,f.pts);g.lineJoin='round';g.lineCap='round';g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=f.w+4;g.save();g.translate(3,4);g.stroke();g.restore();g.strokeStyle='#3b4048';g.lineWidth=f.w;g.stroke();g.strokeStyle='#7c8590';g.lineWidth=f.w*.3;g.save();g.translate(-1.5,-1.5);g.stroke();g.restore();
  g.strokeStyle='#c8921a';g.lineWidth=f.w+1;g.setLineDash([3,60]);g.stroke();g.setLineDash([])},
 animalPen(g,f){const w=f.w||80,h=f.h||80;
  g.fillStyle='rgba(110,80,50,.55)';g.fillRect(-w/2,-h/2,w,h);
  g.strokeStyle='#5c4033';g.lineWidth=3;g.strokeRect(-w/2,-h/2,w,h);
  g.fillStyle='#3e2723';
  for(let x=-w/2;x<=w/2;x+=16){g.fillRect(x-2,-h/2-2,4,4);g.fillRect(x-2,h/2-2,4,4)}
  for(let y=-h/2;y<=h/2;y+=16){g.fillRect(-w/2-2,y-2,4,4);g.fillRect(w/2-2,y-2,4,4)}
  for(let i=0;i<6;i++){g.fillStyle=i%2?'#ffffff':'#5d4037';g.beginPath();g.arc((hs(i,1,f.s||1)-.5)*w*.7,(hs(i,2,f.s||1)-.5)*h*.7,3.5,0,TAU);g.fill()}
  g.fillStyle='#8d6e63';g.fillRect(-w/2+4,-h/2+4,12,16);
 },
 construction(g,f){const w=f.w||90,h=f.h||90,sd=f.s!=null?f.s:(((f.x|0)*73+(f.y|0)*37)|0);
  g.fillStyle='rgba(150,140,130,.4)';g.fillRect(-w/2,-h/2,w,h);
  g.strokeStyle='#d35400';g.lineWidth=3.5;g.strokeRect(-w/2+4,-h/2+4,w-8,h-8);
  // mattoni impilati (come prima, ma più opachi)
  g.fillStyle='#bdc3c7';g.fillRect(w/4,-h/4,16,16);g.strokeStyle='#3a2a14';g.lineWidth=1;g.strokeRect(w/4,-h/4,16,16);g.beginPath();g.moveTo(w/4,-h/4);g.lineTo(w/4+16,-h/4+16);g.stroke();
  g.strokeStyle='#2c3e50';g.lineWidth=1.5;g.beginPath();for(let x=-w/2+10;x<w/2;x+=20){g.moveTo(x,-h/2);g.lineTo(x,h/2)}g.stroke();
  // --- macerie e detriti sparsi nell'area del cantiere (dimensioni ×2) ---
  const MAC=['#7a6e62','#8f8478','#a89b8e','#8c5a44','#6e5a48','#5c5248'];
  // sassi/detriti (10 pezzi, orientamento casuale, dimensione 3-10 px)
  for(let i=0;i<10;i++){const h1=hs(i,sd,11),h2=hs(i,sd,12),h3=hs(i,sd,13),h4=hs(i,sd,14);
   const x=-w/2+14+h1*(w-28),y=-h/2+14+h2*(h-28),s2=3+h3*7;
   g.save();g.translate(x,y);g.rotate(h1*TAU);
   g.fillStyle='rgba(0,0,0,.2)';g.fillRect(-s2/2+2,-s2/3+2,s2,s2*.7);
   g.fillStyle=MAC[(h4*MAC.length)|0];g.fillRect(-s2/2,-s2/3,s2,s2*.7);
   g.restore()}
  // travi/assi di legno cadute (2 pezzi, lunghezza 12-36 px)
  for(let i=0;i<2;i++){const h1=hs(i,sd,21),h2=hs(i,sd,22),h3=hs(i,sd,23);
   const x=-w/2+24+h1*(w-48),y=-h/2+24+h2*(h-48),len=12+h3*24,a=h1*TAU;
   g.strokeStyle='rgba(0,0,0,.25)';g.lineWidth=5;g.beginPath();g.moveTo(x-Math.cos(a)*len/2+2,y-Math.sin(a)*len/2+2);g.lineTo(x+Math.cos(a)*len/2+2,y+Math.sin(a)*len/2+2);g.stroke();
   g.strokeStyle='#5c4030';g.lineWidth=4;g.beginPath();g.moveTo(x-Math.cos(a)*len/2,y-Math.sin(a)*len/2);g.lineTo(x+Math.cos(a)*len/2,y+Math.sin(a)*len/2);g.stroke()}
  // chiazze di polvere/terra smossa (3 pezzi, ellissi fino a 18×12 px)
  g.fillStyle='rgba(120,105,90,.28)';
  for(let i=0;i<3;i++){const h1=hs(i,sd,31),h2=hs(i,sd,32),h3=hs(i,sd,33);
   const x=-w/2+20+h1*(w-40),y=-h/2+20+h2*(h-40);
   g.beginPath();g.ellipse(x,y,6+h3*12,4+h1*8,h2*TAU,0,TAU);g.fill()}
  truck(g,0,h/2+16,0,'#f39c12',34,14);
 },
 refuelScene(g,f){
  smallShip(g,0,0,0,'#34495e');
  truck(g,-32,18,0.5,'#c0392b',32,13);
  g.strokeStyle='#111';g.lineWidth=2;g.beginPath();g.moveTo(-22,18);g.quadraticCurveTo(-10,24,0,0);g.stroke();
  g.fillStyle='#8a6a3a';g.fillRect(20,8,12,12);g.fillRect(20,24,10,10);g.fillRect(34,12,8,14);
 },
 repairScene(g,f){
  tractor(g,0,0,0,'#2980b9');
  g.fillStyle='#e6b422';g.fillRect(-20,-18,10,10);
  g.strokeStyle='#e6b422';g.lineWidth=2.5;g.beginPath();g.moveTo(-15,-13);g.lineTo(-2,-2);g.stroke();
  g.fillStyle='#ffffff';g.beginPath();g.arc(-2,-2,3.5,0,TAU);g.fill();
  g.fillStyle='#555';g.fillRect(14,-10,8,14);
 },
 wreckage(g,f){ // Relitto di navicella schiantata con solco nel terreno
  g.fillStyle='rgba(20,15,10,.55)';g.beginPath();g.ellipse(-25,0,35,10,0,0,TAU);g.fill(); // scia di scavo/bruciato
  g.fillStyle='#111';for(let i=0;i<5;i++)circle(-15-i*8,(i%2?3:-3),2.5); // frammenti fumanti
  g.fillStyle='#7f8c8d';g.beginPath();g.moveTo(14,0);g.lineTo(-12,12);g.lineTo(-6,-10);g.closePath();g.fill(); // fusoliera spezzata
  g.strokeStyle='#c0392b';g.lineWidth=1.5;circle(2,-2,3); // nucleo d'emergenza rosso
 },
 campsite(g,f){ // Bivacco con tende mimetiche e casse
  g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-18,-14,36,28); // ombra campo
  g.fillStyle='#3e4f3a';g.fillRect(-16,-12,14,24); // tenda 1
  g.fillStyle='#2d3a2a';g.fillRect(-16,-1,14,2); // colmo tenda
  g.fillStyle='#556b2f';g.fillRect(2,-12,14,16); // tenda 2
  g.fillStyle='#8a6a3a';g.fillRect(4,8,8,6);g.fillRect(13,6,6,8); // casse viveri/munizioni
  g.strokeStyle='#d4ac0d';g.lineWidth=2;g.beginPath();g.arc(0,0,16,Math.PI*.7,Math.PI*1.3);g.stroke(); // sacchi di sabbia
 },
 solarArray(g,f){const w=f.w||80,h=f.h||50; // Campi solari fotovoltaici
  g.fillStyle='rgba(0,0,0,.25)';g.fillRect(-w/2,-h/2,w,h);
  for(let row=-h/2+6; row<=h/2-10; row+=14){
   g.fillStyle='#1a365d';g.fillRect(-w/2+4,row,w-8,10); // pannello blu
   g.strokeStyle='#63b3ed';g.lineWidth=0.8;g.strokeRect(-w/2+4,row,w-8,10); // griglia
  }
  g.fillStyle='#718096';g.fillRect(w/2-6,-6,6,12); // inverter / scatola elettrica
 },
 ventBunker(g,f){ // Bunker di ventilazione con ventolone industriale
  g.fillStyle='#2d3748';circle(0,0,22); // basamento ottagonale/tondo
  g.strokeStyle='#e2e8f0';g.lineWidth=2;circle(0,0,22);
  g.strokeStyle='#ecc94b';g.lineWidth=3;g.setLineDash([5,5]);circle(0,0,18);g.setLineDash([]); // strisce di sicurezza
  g.fillStyle='#0f172a';circle(0,0,13); // condotto
  g.strokeStyle='#718096';g.lineWidth=2.5; // pale della ventola
  g.beginPath();g.moveTo(-11,0);g.lineTo(11,0);g.moveTo(0,-11);g.lineTo(0,11);g.stroke();
 }};
// pavimentazione intorno agli edifici
// pavimentazione intorno agli edifici (marciapiede, piazzale, aia o giardino a seconda di o.fz); isole separate (set: 0 terraferma, 1 isole)
function pForecourt(g,x0,y0,isle){const a=DC.OI.get(Math.floor(x0/CH)*64+Math.floor(y0/CH));if(!a)return;
 for(const o of a){if(o.t!='b'||o.sp||o.rb||o.ty!='house'||!!o.is!==!!isle)continue;g.save();g.translate(o.x,o.y);g.rotate(o.a);
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
 for(const o of a){if(o.t!='b'||o.sp||o.rb||o.ty!='house'||!!o.is!==!!isle)continue;g.save();g.translate(o.x,o.y);g.rotate(o.a);
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
function bankCol(x,y){return urbAt(x,y)>.38?['#55585f','#9a9da4']:['#a9996a','#d3c590']}
function pWater(g,x0,y0,S){const x1=x0+CH,y1=y0+CH,Lc=BK.wl,w=Lc.getContext('2d'),pw=DC.NZ.map(n=>w.createPattern(n,'repeat'));
 // rive: due passaggi (prima tutti i bordi, poi tutti gli interni) per evitare giunzioni a festone
 g.lineCap='round';g.lineJoin='round';const segs=[];
 for(const rv of M.rivers){const P=rv.pts;for(let i=0;i<P.length-1;i++){const a=P[i],b=P[i+1];if(Math.max(a[0],b[0])<x0-80||Math.min(a[0],b[0])>x1+80||Math.max(a[1],b[1])<y0-80||Math.min(a[1],b[1])>y1+80)continue;
   const c=bankCol((a[0]+b[0])/2,(a[1]+b[1])/2),k=c[0]=='#55585f'?[26,20]:[22,15];segs.push([a[0],a[1],b[0],b[1],c,rv.w+k[0],rv.w+k[1]])}}
 if(x1>SEA-420)for(let y=Math.floor(y0/20)*20-40;y<y1+40;y+=20){const xa=coast(y),xb=coast(y+20);segs.push([xa,y,xb,y+20,bankCol(xa-30,y),70,58])}
 for(const pass of[0,1]){for(const s of segs){g.beginPath();g.moveTo(s[0],s[1]);g.lineTo(s[2],s[3]);g.strokeStyle=s[4][pass];g.lineWidth=s[5+pass];g.stroke()}}
 for(const l of M.lakes){if(l.x+l.r*1.4<x0||l.x-l.r*1.4>x1||l.y+l.r*1.4<y0||l.y-l.r*1.4>y1)continue;const c=bankCol(l.x,l.y);bpath(g,l,1.0);g.strokeStyle=c[0];g.lineWidth=30;g.stroke();g.strokeStyle=c[1];g.lineWidth=22;g.stroke()}
 // strato acqua
 w.setTransform(1,0,0,1,0,0);w.clearRect(0,0,Lc.width,Lc.height);w.setTransform(S,0,0,S,-x0*S,-y0*S);w.lineCap='round';w.lineJoin='round';
 // fiumi con sfumatura continua (strati concentrici interpolati tra i valori originali)
 {
  const NS=12;
  for(const rv of M.rivers){
   const rw=rv.w, rp=riverPath(rv);
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
    w.lineWidth=lw;
    w.stroke(rp);
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
 let sea=null;if(x1>SEA-420){sea=new Path2D();sea.moveTo(WW+60,-60);for(let y=-40;y<=WH+40;y+=20)sea.lineTo(coast(y),y);sea.lineTo(WW+60,WH+60);sea.closePath();
  const gr=w.createLinearGradient(SEA-260,0,WW,0);gr.addColorStop(0,'#5aa8c8');gr.addColorStop(.3,'#3f86b0');gr.addColorStop(1,'#1d4c78');w.fillStyle=gr;w.fill(sea);
  w.save();w.clip(sea);w.strokeStyle='rgba(150,215,235,.16)';w.lineWidth=110;w.beginPath();for(let y=Math.floor(y0/20)*20-40;y<y1+40;y+=20)w.lineTo(coast(y),y);w.stroke();w.restore()}
 // effetti ritagliati sull'acqua (source-atop)
 w.globalCompositeOperation='source-atop';
 for(const[pi,sc,al]of[[1,1.2,.1],[0,.6,.07]]){w.save();w.globalAlpha=al;w.scale(sc,sc);w.fillStyle=pw[pi];w.fillRect(x0/sc,y0/sc,CH/sc+2,CH/sc+2);w.restore()}   // resta source-atop: solo sull'acqua
 w.strokeStyle='rgba(225,245,255,.2)';w.lineWidth=1.4;w.beginPath();const WS=38;
 for(let cy=Math.floor(y0/WS);cy<(y0+CH)/WS;cy++)for(let cx=Math.floor(x0/WS);cx<(x0+CH)/WS;cx++){const h1=hs(cx,cy,DC.seed+40);if(h1<.5)continue;const x=(cx+h1)*WS,y=(cy+hs(cx,cy,DC.seed+41))*WS,L=8+h1*14;w.moveTo(x,y);w.quadraticCurveTo(x+L/2,y-3,x+L,y)}
 w.stroke();w.globalCompositeOperation='source-over';
 g.save();g.setTransform(1,0,0,1,0,0);g.drawImage(Lc,0,0);g.restore();
 // schiuma sulla riva
 g.strokeStyle='rgba(255,255,255,.4)';g.lineWidth=2.5;g.setLineDash([14,10]);
 if(sea){g.beginPath();for(let y=Math.floor(y0/20)*20-40;y<y1+40;y+=20)g.lineTo(coast(y)+2,y);g.stroke()}
 for(const l of M.lakes){if(l.x+l.r*1.4<x0||l.x-l.r*1.4>x1||l.y+l.r*1.4<y0||l.y-l.r*1.4>y1)continue;bpath(g,l,1.0);g.stroke()}g.setLineDash([])}
function pIsles(g,x0,y0){for(const s of M.isles){if(s.x+s.R*1.4<x0||s.x-s.R*1.4>x0+CH||s.y+s.R*1.4<y0||s.y-s.R*1.4>y0+CH)continue;const c=bankCol(s.x,s.y);
  bpath(g,s,1.05);g.strokeStyle=c[0];g.lineWidth=16;g.stroke();g.fillStyle=c[1];g.fill();bpath(g,s,1);g.fillStyle='#78975a';g.fill();g.save();bpath(g,s,1);g.clip();ovl(g,1,1.5,.4,'overlay',x0,y0);ovl(g,0,.7,.3,'overlay',x0,y0);g.restore();
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
function pCars(g,x0,y0){const a=DC.FI.get(Math.floor(x0/CH)*64+Math.floor(y0/CH));if(!a)return;
 for(const f of a){
  if(f.k==='car'||f.k==='truck')roadVeh(g,f);
  else if(f.k==='boat')vessel(g,f.x,f.y,f.a,f.col||'#ffffff',f.len||24,f.wid||10,f.sty||0);
 }}

const gc=(g,x,y,r)=>{g.beginPath();g.arc(x,y,r,0,TAU);g.fill()};

const PF_PROPS={
 // pool e court della villa: disegnati da pProps (DOPO l'acqua) così restano visibili anche se la villa finisce su un lago/fiume
 pool:PF.pool,
 court:PF.court,
 tractor(g,f){tractor(g,0,0,0,f.col||'#27ae60')},
 hoverbike(g,f){hoverbike(g,0,0,0,f.col||'#00cec9')},
 smallShip(g,f){smallShip(g,0,0,0,f.col||'#7f8c8d')},
 animalPen(g,f){const w=f.w||80,h=f.h||80;
  g.fillStyle='rgba(110,80,50,.7)';g.fillRect(-w/2,-h/2,w,h); // fango
  g.strokeStyle='#5c4033';g.lineWidth=3;g.strokeRect(-w/2,-h/2,w,h); // steccato
  g.fillStyle='#3e2723';
  for(let x=-w/2;x<=w/2;x+=16){g.fillRect(x-2,-h/2-2,4,4);g.fillRect(x-2,h/2-2,4,4)}
  for(let y=-h/2;y<=h/2;y+=16){g.fillRect(-w/2-2,y-2,4,4);g.fillRect(w/2-2,y-2,4,4)}
  for(let i=0;i<6;i++){g.fillStyle=i%2?'#ffffff':'#5d4037';gc(g,(hs(i,1,f.s||1)-.5)*w*.7,(hs(i,2,f.s||1)-.5)*h*.7,3.5)}
  g.fillStyle='#2980b9';g.fillRect(-w/2+4,-h/2+4,12,16); // vasca acqua
 },
 construction(g,f){const w=f.w||90,h=f.h||90,sd=f.s!=null?f.s:(((f.x|0)*73+(f.y|0)*37)|0);
  g.fillStyle='rgba(160,150,140,.6)';g.fillRect(-w/2,-h/2,w,h);
  g.strokeStyle='#d35400';g.lineWidth=3.5;g.strokeRect(-w/2+4,-h/2+4,w-8,h-8);
  // mattoni impilati
  g.fillStyle='#bdc3c7';g.fillRect(w/4,-h/4,16,16);g.strokeStyle='#3a2a14';g.lineWidth=1;g.strokeRect(w/4,-h/4,16,16);g.beginPath();g.moveTo(w/4,-h/4);g.lineTo(w/4+16,-h/4+16);g.stroke();
  g.strokeStyle='#2c3e50';g.lineWidth=1.5;g.beginPath();for(let x=-w/2+10;x<w/2;x+=20){g.moveTo(x,-h/2);g.lineTo(x,h/2)}g.stroke();
  // --- macerie e detriti (dimensioni ×2) ---
  const MAC=['#7a6e62','#8f8478','#a89b8e','#8c5a44','#6e5a48','#5c5248'];
  for(let i=0;i<10;i++){const h1=hs(i,sd,11),h2=hs(i,sd,12),h3=hs(i,sd,13),h4=hs(i,sd,14);
   const x=-w/2+14+h1*(w-28),y=-h/2+14+h2*(h-28),s2=3+h3*7;
   g.save();g.translate(x,y);g.rotate(h1*TAU);
   g.fillStyle='rgba(0,0,0,.2)';g.fillRect(-s2/2+2,-s2/3+2,s2,s2*.7);
   g.fillStyle=MAC[(h4*MAC.length)|0];g.fillRect(-s2/2,-s2/3,s2,s2*.7);
   g.restore()}
  for(let i=0;i<2;i++){const h1=hs(i,sd,21),h2=hs(i,sd,22),h3=hs(i,sd,23);
   const x=-w/2+24+h1*(w-48),y=-h/2+24+h2*(h-48),len=12+h3*24,a=h1*TAU;
   g.strokeStyle='rgba(0,0,0,.25)';g.lineWidth=5;g.beginPath();g.moveTo(x-Math.cos(a)*len/2+2,y-Math.sin(a)*len/2+2);g.lineTo(x+Math.cos(a)*len/2+2,y+Math.sin(a)*len/2+2);g.stroke();
   g.strokeStyle='#5c4030';g.lineWidth=4;g.beginPath();g.moveTo(x-Math.cos(a)*len/2,y-Math.sin(a)*len/2);g.lineTo(x+Math.cos(a)*len/2,y+Math.sin(a)*len/2);g.stroke()}
  g.fillStyle='rgba(120,105,90,.28)';
  for(let i=0;i<3;i++){const h1=hs(i,sd,31),h2=hs(i,sd,32),h3=hs(i,sd,33);
   const x=-w/2+20+h1*(w-40),y=-h/2+20+h2*(h-40);
   g.beginPath();g.ellipse(x,y,6+h3*12,4+h1*8,h2*TAU,0,TAU);g.fill()}
  truck(g,0,h/2+16,0,'#f39c12',34,14); // camion cantiere
 },
 refuelScene(g,f){
  smallShip(g,0,0,0,'#34495e');
  truck(g,-32,18,0.5,'#c0392b',32,13); // autobotte
  g.strokeStyle='#111';g.lineWidth=2;g.beginPath();g.moveTo(-22,18);g.quadraticCurveTo(-10,24,0,0);g.stroke();
  g.fillStyle='#8a6a3a';g.fillRect(20,8,12,12);g.fillRect(20,24,10,10);g.fillRect(34,12,8,14);
 },
 repairScene(g,f){
  tractor(g,0,0,0,'#2980b9');
  g.fillStyle='#e6b422';g.fillRect(-20,-18,10,10);
  g.strokeStyle='#e6b422';g.lineWidth=2.5;g.beginPath();g.moveTo(-15,-13);g.lineTo(-2,-2);g.stroke();
  g.fillStyle='#ffffff';gc(g,-2,-2,3.5); // scintilla
  g.fillStyle='#555';g.fillRect(14,-10,8,14);
 },
 wreckage(g,f){
  g.fillStyle='rgba(20,15,10,.75)';g.beginPath();g.ellipse(-25,0,38,12,0,0,TAU);g.fill(); // scia bruciata
  g.fillStyle='#111';for(let i=0;i<5;i++)gc(g,-15-i*8,(i%2?3:-3),2.5);
  g.fillStyle='#7f8c8d';g.beginPath();g.moveTo(14,0);g.lineTo(-12,12);g.lineTo(-6,-10);g.closePath();g.fill(); // fusoliera
  g.strokeStyle='#c0392b';g.lineWidth=2;gc(g,2,-2,3.5);
 },
 campsite(g,f){
  g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-18,-14,36,28);
  g.fillStyle='#3e4f3a';g.fillRect(-16,-12,14,24); // tenda 1
  g.fillStyle='#2d3a2a';g.fillRect(-16,-1,14,2);
  g.fillStyle='#556b2f';g.fillRect(2,-12,14,16); // tenda 2
  g.fillStyle='#8a6a3a';g.fillRect(4,8,8,6);g.fillRect(13,6,6,8); // casse
  g.strokeStyle='#d4ac0d';g.lineWidth=2.5;g.beginPath();g.arc(0,0,16,Math.PI*.7,Math.PI*1.3);g.stroke();
 },
 solarArray(g,f){const w=f.w||80,h=f.h||50;
  g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-w/2,-h/2,w,h);
  for(let row=-h/2+6; row<=h/2-10; row+=14){
   g.fillStyle='#1a365d';g.fillRect(-w/2+4,row,w-8,10);
   g.strokeStyle='#63b3ed';g.lineWidth=1;g.strokeRect(-w/2+4,row,w-8,10);
  }
  g.fillStyle='#718096';g.fillRect(w/2-6,-6,6,12);
 },
 ventBunker(g,f){
  g.fillStyle='#2d3748';gc(g,0,0,22);
  g.strokeStyle='#e2e8f0';g.lineWidth=2;g.stroke();
  g.strokeStyle='#ecc94b';g.lineWidth=3;g.setLineDash([5,5]);gc(g,0,0,18);g.stroke();g.setLineDash([]);
  g.fillStyle='#0f172a';gc(g,0,0,13);
  g.strokeStyle='#718096';g.lineWidth=2.5;
  g.beginPath();g.moveTo(-11,0);g.lineTo(11,0);g.moveTo(0,-11);g.lineTo(0,11);g.stroke();
 }
};

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
 pGround(g,x0,y0);pLevels(g,x0,y0);pHills(g,x0,y0);pScatter(g,x0,y0);
 pForecourt(g,x0,y0,0);
 pFlat(g,x0,y0,0,1);pFlat(g,x0,y0,2,4);
 await tick();                                              // ← pausa 1
 pWater(g,x0,y0,S);pIsles(g,x0,y0);pForecourt(g,x0,y0,1);pPiers(g,x0,y0);pBridges(g,x0,y0);pFalls(g,x0,y0);
 await tick();                                              // ← pausa 2 (NUOVA)
 pRoads(g,x0,y0);pWetGround(g,x0,y0);pCars(g,x0,y0);pRamps(g,x0,y0);
 await tick();                                              // ← pausa 3 (NUOVA)
 pRubble(g,x0,y0);pLights(g,x0,y0);
 pPads(g,x0,y0);
 pForecourtDetails(g,x0,y0,0);
 pForecourtDetails(g,x0,y0,1);
 pProps(g,x0,y0);
}