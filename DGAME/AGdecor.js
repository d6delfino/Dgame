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

// ===== preparazione (una volta per mappa) =====
function decorPrep(){
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
 // mappa colore del terreno: 1 pixel per cella, ingrandita con interpolazione → transizioni morbide
 const BASE={nature:'#3f7336',rural:'#6a9b47',urban:'#66914c',indus:'#667a56',mil:'#6c7a5d',base:'#6f8665'},CON=hex('#4e5259'),W1=GW+1;
 const gm=document.createElement('canvas');gm.width=GW;gm.height=GH;const gx=gm.getContext('2d'),im=gx.createImageData(GW,GH);
 for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const t=M.regions[M.reg[j*GW+i]].type,e=(M.E[j*W1+i]+M.E[j*W1+i+1]+M.E[(j+1)*W1+i]+M.E[(j+1)*W1+i+1])/4,u=smooth(.12,.7,DC.URB[j*GW+i]);
  let c=mixc(hex(BASE[t]||BASE.rural),[170,176,110],clamp(e*.16,0,.3));c=mixc(c,CON,u*.92);const k=1+(hs(i,j,7)-.5)*.05,o=(j*GW+i)*4;im.data[o]=c[0]*k;im.data[o+1]=c[1]*k;im.data[o+2]=c[2]*k;im.data[o+3]=255}
 gx.putImageData(im,0,0);DC.GM=gm;
 // texture di rumore ripetibili (valore interpolato con bordi che si chiudono): fine, media, grossa
 DC.NZ=[];for(const[n,oct]of[[64,[1,.5,.25]],[32,[1,.6,.3]],[8,[1,.7,.4]]]){const S2=256,cv=document.createElement('canvas');cv.width=cv.height=S2;const x=cv.getContext('2d'),d=x.createImageData(S2,S2);
  const lat=[];for(let o=0;o<3;o++){const g0=Math.max(2,Math.round(n/(1<<o))),a=new Float32Array(g0*g0);for(let i=0;i<a.length;i++)a[i]=hs(i,o,DC.seed+n);lat.push([g0,a])}
  for(let py=0;py<S2;py++)for(let px=0;px<S2;px++){let v=0,tw=0;for(let o=0;o<3;o++){const[g0,a]=lat[o],fx=px/S2*g0,fy=py/S2*g0,i=fx|0,j=fy|0,u=fx-i,w=fy-j,uu=u*u*(3-2*u),ww=w*w*(3-2*w),i1=(i+1)%g0,j1=(j+1)%g0;
    v+=oct[o]*((a[j*g0+i]*(1-uu)+a[j*g0+i1]*uu)*(1-ww)+(a[j1*g0+i]*(1-uu)+a[j1*g0+i1]*uu)*ww);tw+=oct[o]}
   const k=(v/tw)*255,q=(py*S2+px)*4;d.data[q]=d.data[q+1]=d.data[q+2]=k;d.data[q+3]=255}
  x.putImageData(d,0,0);DC.NZ.push(cv)}
 if(!M.flatGen){M.flatGen=1;decorGen()}
 // indici spaziali (celle da CH): superfici piatte e oggetti reali
 DC.FI=new Map();DC.OI=new Map();
 const put=(mp,x0,y0,x1,y1,it)=>{for(let cx=Math.max(0,Math.floor(x0/CH));cx<=Math.min(Math.floor(x1/CH),Math.ceil(WW/CH)-1);cx++)for(let cy=Math.max(0,Math.floor(y0/CH));cy<=Math.min(Math.floor(y1/CH),Math.ceil(WH/CH)-1);cy++){const k=cx*64+cy;let a=mp.get(k);if(!a)mp.set(k,a=[]);a.push(it)}};
 const ZZ={slab:0,field:0,park:1,circ:1,lot:2,pool:3,court:3,pad:3,rail:4,pipe:4,car:5,lamp:6};
 for(const f of M.flat){f.z=ZZ[f.k]||0;let r;if(f.pts){let a=1e9,b=1e9,c=-1e9,d=-1e9;for(const p of f.pts){a=Math.min(a,p[0]);b=Math.min(b,p[1]);c=Math.max(c,p[0]);d=Math.max(d,p[1])}put(DC.FI,a-30,b-30,c+30,d+30,f);continue}
  r=f.r?f.r+30:Math.hypot(f.w||20,f.h||20)/2+30;put(DC.FI,f.x-r,f.y-r,f.x+r,f.y+r,f)}
 for(const o of M.obs)put(DC.OI,o.x-o.r-30,o.y-o.r-30,o.x+o.r+30,o.y+o.r+30,o)}
// elementi generati: auto parcheggiate lungo i viali, lampioni
function decorGen(){const f=M.flat,jn=new Map(),jk=(x,y)=>(x/200|0)*1024+(y/200|0);let seq=0;
 for(const j of M.junc){const k=jk(j.x,j.y);if(!jn.has(k))jn.set(k,[]);jn.get(k).push(j)}
 const nearJ=(x,y,r)=>{for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const a=jn.get(((x/200|0)+i)*1024+(y/200|0)+j);if(a)for(const q of a)if(Math.hypot(q.x-x,q.y-y)<r)return true}return false};
 DC.LAMPS=[];
 for(const rd of M.roads){let acc=0,side=1;
  for(let i=1;i<rd.pts.length;i++){const p=rd.pts[i-1],q=rd.pts[i],L=Math.hypot(q[0]-p[0],q[1]-p[1]),a=Math.atan2(q[1]-p[1],q[0]-p[0]),nx=-Math.sin(a),ny=Math.cos(a);acc+=L;
   if(acc>=150){acc=0;side=-side;const o=rd.w/2+(rd.sw?10:6);f.push({k:'lamp',x:q[0]+nx*o*side,y:q[1]+ny*o*side,c:(seq++)%3});}
   const dens=rd.cls==='hw'?.55:rd.w>=40?.42:.28;
   if(hs(i,seq++,DC.seed)<dens&&!nearJ(q[0],q[1],rd.w+40)){const sd=hs(i,seq,DC.seed+1)<.5?-1:1,o=rd.w/2-8,isTruck=hs(i,seq,DC.seed+4)<.28;
    f.push({k:isTruck?'truck':'car',x:q[0]+nx*o*sd,y:q[1]+ny*o*sd,a:a+(sd>0?0:Math.PI),col:CAR_COL[hs(i,seq,DC.seed+2)*CAR_COL.length|0],len:isTruck?38:24,wid:isTruck?14:11})}}}
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
 for(const q of f)if(q.k=='lamp')DC.LAMPS.push(q)}

// ===== livelli di disegno di un blocco (g ha già la trasformazione mondo→blocco) =====
function ovl(g,pi,sc,al,mode,x0,y0){g.save();g.globalAlpha=al;g.globalCompositeOperation=mode;g.scale(sc,sc);g.fillStyle=DC.pat[pi];g.fillRect(x0/sc,y0/sc,CH/sc+2,CH/sc+2);g.restore()}
function pGround(g,x0,y0,tint){const i0=Math.max(0,Math.floor(x0/TC)-1),j0=Math.max(0,Math.floor(y0/TC)-1),i1=Math.min(GW-1,Math.ceil((x0+CH)/TC)+1),j1=Math.min(GH-1,Math.ceil((y0+CH)/TC)+1);
 g.imageSmoothingEnabled=true;g.drawImage(DC.GM,i0,j0,i1-i0+1,j1-j0+1,i0*TC,j0*TC,(i1-i0+1)*TC,(j1-j0+1)*TC);
 ovl(g,2,6,.2,'overlay',x0,y0);ovl(g,1,1.5,.1,'overlay',x0,y0);ovl(g,0,.7,.12,'overlay',x0,y0);
 if(tint){g.fillStyle=tint;g.fillRect(x0,y0,CH+2,CH+2)}}
function pLevels(g,x0,y0){const x1=x0+CH,y1=y0+CH;
 for(let t=1;t<=2;t++){const p=levelPath(t-.5,x0-TC,y0-TC,x1+TC,y1+TC);
  // Scarpata a spessore costante in tutte le direzioni (stroke invece di translate)
  const layers=[
   [52,'rgba(0,0,0,.28)'],
   [40,t==2?'#2a241c':'#352e24'],
   [28,t==2?'#3f362a':'#4a4032'],
   [16,t==2?'#5a4e3a':'#665642'],
   [8, t==2?'#6e5e46':'#7a6a50']
  ];
  g.lineJoin='round';g.lineCap='round';
  for(const[w,col]of layers){
   g.strokeStyle=col;g.lineWidth=w;g.stroke(p);
  }
  // leggero highlight sul bordo alto
  g.strokeStyle='rgba(255,250,220,.35)';g.lineWidth=5;g.stroke(p);
  g.save();g.clip(p);pGround(g,x0,y0,t==2?'rgba(255,250,200,.09)':'rgba(255,250,215,.045)');g.restore()}}
function pHills(g,x0,y0){for(const h of M.hills)if(h.x+h.r>x0&&h.x-h.r<x0+CH&&h.y+h.r>y0&&h.y-h.r<y0+CH){
  for(const[k,c]of[[1,'rgba(110,96,60,.35)'],[.82,'rgba(150,135,90,.35)'],[.6,'rgba(176,160,110,.4)'],[.38,'rgba(196,180,128,.45)'],[.18,'rgba(214,198,148,.5)']]){bpath(g,h,k);g.fillStyle=c;g.fill()}
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
  if(f.k=='slab'||f.k=='field'||f.k=='lot'||f.k=='park'||f.k=='pool'||f.k=='court'){g.translate(f.x,f.y);g.rotate(f.a||0)}
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
  let n=0;for(const yb of rows)for(let x=-w/2+8;x+bw<=w/2-8;x+=bw,n++){if(hs(n,yb|0,s)<(mil?.5:.55)){const cx=x+bw/2,up=yb+bd/2,a=Math.PI/2+(hs(n,3,s)-.5)*.1;if(mil)truck(g,cx,up,a,['#556b2f','#4a5d23','#6b7b3a'][n%3],bd-8,bw-6);else car(g,cx,up,a,CAR_COL[hs(n,9,s)*CAR_COL.length|0],bd-6,bw-5)}}},
 pool(g,f){g.fillStyle='#d9d4c0';rrect(g,-f.w/2-9,-f.h/2-9,f.w+18,f.h+18,8);g.fill();g.fillStyle='#2f9fd3';rrect(g,-f.w/2,-f.h/2,f.w,f.h,6);g.fill();
  g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=1.5;g.beginPath();for(let x=-f.w/2+10;x<f.w/2;x+=14){g.moveTo(x,-f.h/2+3);g.quadraticCurveTo(x+4,0,x,f.h/2-3)}g.stroke();g.fillStyle='#fff';g.fillRect(-f.w/2+3,-f.h/2-5,3,8);g.fillRect(-f.w/2+9,-f.h/2-5,3,8)},
 court(g,f){g.fillStyle='#3d8b5c';g.fillRect(-f.w/2-8,-f.h/2-8,f.w+16,f.h+16);g.fillStyle='#b5523b';g.fillRect(-f.w/2,-f.h/2,f.w,f.h);g.strokeStyle='#fff';g.lineWidth=2;g.strokeRect(-f.w/2+6,-f.h/2+6,f.w-12,f.h-12);g.beginPath();g.moveTo(0,-f.h/2+6);g.lineTo(0,f.h/2-6);g.moveTo(-f.w/2+6,0);g.lineTo(f.w/2-6,0);g.stroke()},
 pad(g,f){g.save();g.translate(f.x,f.y);g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.arc(3,4,f.r+4,0,TAU);g.fill();g.fillStyle='#52585f';g.beginPath();g.arc(0,0,f.r,0,TAU);g.fill();g.strokeStyle='#e6b422';g.lineWidth=5;g.beginPath();g.arc(0,0,f.r-6,0,TAU);g.stroke();
  g.strokeStyle='#fff';g.lineWidth=7;g.beginPath();g.moveTo(-f.r*.3,-f.r*.42);g.lineTo(-f.r*.3,f.r*.42);g.moveTo(f.r*.3,-f.r*.42);g.lineTo(f.r*.3,f.r*.42);g.moveTo(-f.r*.3,0);g.lineTo(f.r*.3,0);g.stroke();g.restore()},
 rail(g,f){pline(g,f.pts);g.lineCap='butt';g.strokeStyle='#4a3b2c';g.lineWidth=f.w+7;g.setLineDash([4,9]);g.stroke();g.setLineDash([]);for(const d of[-f.w*.32,f.w*.32]){pline(g,offs(f.pts,d));g.strokeStyle='#a9aeb4';g.lineWidth=1.6;g.stroke()}},
 pipe(g,f){pline(g,f.pts);g.lineJoin='round';g.lineCap='round';g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=f.w+4;g.save();g.translate(3,4);g.stroke();g.restore();g.strokeStyle='#3b4048';g.lineWidth=f.w;g.stroke();g.strokeStyle='#7c8590';g.lineWidth=f.w*.3;g.save();g.translate(-1.5,-1.5);g.stroke();g.restore();
  g.strokeStyle='#c8921a';g.lineWidth=f.w+1;g.setLineDash([3,60]);g.stroke();g.setLineDash([])}};
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
 for(const[k,c]of[[4,'#4f9cc0'],[.8,'#3f86b0'],[.5,'#2f6f9f'],[.22,'#285f8c']])for(const rv of M.rivers){w.strokeStyle=c;w.lineWidth=k>1?rv.w+k:rv.w*k;w.stroke(riverPath(rv))}
 for(const l of M.lakes){if(l.x+l.r*1.4<x0||l.x-l.r*1.4>x1||l.y+l.r*1.4<y0||l.y-l.r*1.4>y1)continue;for(const[k,c]of[[1,'#4f9cc0'],[.84,'#3f86b0'],[.6,'#2f6f9f'],[.34,'#285f8c']]){bpath(w,l,k);w.fillStyle=c;w.fill()}}
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
// luci al neon: aloni additivi vicino a lampioni, piazze e ponti
function pLights(g,x0,y0){g.save();g.globalCompositeOperation='lighter';const COL=['255,70,170','60,225,255','255,190,90'];
 for(const l of DC.LAMPS){if(l.x<x0-160||l.x>x0+CH+160||l.y<y0-160||l.y>y0+CH+160)continue;const u=urbAt(l.x,l.y),R0=(26+u*14)*2,gr=g.createRadialGradient(l.x,l.y,0,l.x,l.y,R0);gr.addColorStop(0,`rgba(${COL[l.c]},.38)`);gr.addColorStop(.45,`rgba(${COL[l.c]},.12)`);gr.addColorStop(1,`rgba(${COL[l.c]},0)`);g.fillStyle=gr;g.fillRect(l.x-R0,l.y-R0,R0*2,R0*2)}
 g.restore();
 for(const l of DC.LAMPS){if(l.x<x0-8||l.x>x0+CH+8||l.y<y0-8||l.y>y0+CH+8)continue;
  g.fillStyle='#fff8e0';g.beginPath();g.arc(l.x,l.y,2.8,0,TAU);g.fill()}
 }
// auto parcheggiate (elementi 'car' generati lungo i viali)
function pCars(g,x0,y0){const a=DC.FI.get(Math.floor(x0/CH)*64+Math.floor(y0/CH));if(!a)return;
 for(const f of a){
  if(f.k==='car')car(g,f.x,f.y,f.a,f.col,f.len||24,f.wid||11);
  else if(f.k==='truck')truck(g,f.x,f.y,f.a,f.col,f.len||38,f.wid||14);
 }}
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
function paintTile(g,x0,y0,S){
 g.setTransform(S,0,0,S,-x0*S,-y0*S);g.lineJoin='round';g.lineCap='round';
 DC.pat=DC.NZ.map(n=>g.createPattern(n,'repeat'));
 pGround(g,x0,y0);pLevels(g,x0,y0);pHills(g,x0,y0);pScatter(g,x0,y0);
 pForecourt(g,x0,y0,0);
 pFlat(g,x0,y0,0,1);pFlat(g,x0,y0,2,4);
 pWater(g,x0,y0,S);pIsles(g,x0,y0);pForecourt(g,x0,y0,1);pPiers(g,x0,y0);pBridges(g,x0,y0);pFalls(g,x0,y0);
 pRoads(g,x0,y0);pCars(g,x0,y0);pRamps(g,x0,y0);
 pRubble(g,x0,y0);pLights(g,x0,y0);
 pPads(g,x0,y0);
 pForecourtDetails(g,x0,y0,0);
 pForecourtDetails(g,x0,y0,1)}