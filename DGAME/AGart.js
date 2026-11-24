'use strict';
/* AIRGRUNT · AGart.js — CATALOGO DEI DISEGNI. Qui c'è solo "come è fatta" ogni cosa: nessuna regola di gioco, nessuna generazione.
   Per cambiare l'aspetto di qualcosa si modifica solo questo file.
   1) utilità di disegno e colori
   2) ostacoli: alberi, rocce, edifici (tetti, dettagli, crepe, neve e pioggia sui tetti), edifici speciali (container, silos, navi...)
   3) veicoli, barche e scene a terra (VEH, SCN, PROPS), usati dall'immagine di sfondo
   4) mech, unità nemiche, navicelle, icone e simboli della missione */
// ===== 1) utilità di disegno =====
const hex=c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const rgbs=a=>`rgb(${a[0]|0},${a[1]|0},${a[2]|0})`;
const mixc=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
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
const circle=(x,y,r)=>{ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill()};
function bpath(g,b,k){const n=b.a.length,P2=b.a.map((r,i)=>{const t=i/n*TAU;return[b.x+Math.cos(t)*r*k,b.y+Math.sin(t)*r*k]});
 g.beginPath();g.moveTo((P2[n-1][0]+P2[0][0])/2,(P2[n-1][1]+P2[0][1])/2);
 for(let i=0;i<n;i++){const a=P2[i],c=P2[(i+1)%n];g.quadraticCurveTo(a[0],a[1],(a[0]+c[0])/2,(a[1]+c[1])/2)}g.closePath()}
const hit=(bb,x0,y0,x1,y1)=>bb[0]<x1&&bb[2]>x0&&bb[1]<y1&&bb[3]>y0;

// ===== 2) ostacoli =====
// ===== ostacoli (dinamici) =====
function qpath(g,q,k){g.beginPath();
 if(q.k=='r')g.rect(q.x-q.a+k,q.y-q.b+k,Math.max(1,2*(q.a-k)),Math.max(1,2*(q.b-k)));
 else if(q.k=='c')g.arc(q.x,q.y,Math.max(1,q.a-k),0,TAU);
 else if(q.k=='p'){const r=Math.max(1,q.a-k);for(let i=0;i<q.n;i++){const a=i*TAU/q.n;g.lineTo(q.x+Math.cos(a)*r,q.y+Math.sin(a)*r)}g.closePath()}
 else{for(const v of q.vs)g.lineTo(v[0],v[1]);g.closePath()}}
const TH=[100,120,145],TCOL={};
function treeCols(tn,f){const k=tn*11+Math.round(f*10);let c=TCOL[k];if(!c){const h=TH[tn|0],s=30+30*f,l=18+10*f;
  c={base:`hsl(${h},${s}%,${l-6}%)`,tuft:[0,1,2,3,4].map(i=>`hsl(${h+(i%2?8:-6)},${s}%,${l+2+i*2.2}%)`),hi:`hsla(${h+12},${s}%,${l+22}%,.55)`};TCOL[k]=c}return c}
// ===== alberi: ogni combinazione (specie, tinta, danno, variante) si disegna UNA volta su un'immagine e poi si copia =====
// L'immagine è fatta per un albero di raggio TREE_R e si scala sul raggio vero: un drawImage al posto di 6-25 forme per albero a ogni fotogramma.
const TREE_R=24,TREE_SP=new Map(),TREE_VAR=4;
// disegno vero e proprio di un albero (specie base) sul contesto c
function drawTreeRaw(c,o,f){const cl=treeCols(o.tn,f),r=o.r,cc=(x,y,rr)=>{c.beginPath();c.arc(x,y,rr,0,TAU);c.fill()};
 c.fillStyle='rgba(0,0,0,.22)';cc(o.x+r*.35,o.y+r*.45,r);c.fillStyle=cl.base;cc(o.x,o.y,r);
 let k=(o.id+1)*2654435761>>>0;
 for(let i=0;i<5;i++){k=(k*1664525+1013904223)>>>0;const a=k/4294967296*TAU;k=(k*1664525+1013904223)>>>0;const d=k/4294967296*r*.5,br=r*(.28+(k&255)/255*.14);
  c.fillStyle=cl.tuft[i];cc(o.x+Math.cos(a)*d-r*.04,o.y+Math.sin(a)*d-r*.04,br)}
 c.fillStyle=cl.hi;cc(o.x-r*.28,o.y-r*.3,r*.2)}
// immagine in cache: margine per l'ombra (in basso a destra) e per le fronde delle palme; risoluzione più alta con la qualità alta
function treeSprite(kd,tn,fq,vr){const key=kd+'|'+tn+'|'+fq+'|'+vr;let s=TREE_SP.get(key);if(s)return s;
 const q=G.q>=2?3:2,M0=TREE_R*1.5,side=Math.ceil(M0*2*q),cv=document.createElement('canvas');cv.width=cv.height=side;const c=cv.getContext('2d');c.scale(q,q);
 const o={x:M0,y:M0,r:TREE_R,tn,kd,id:vr*7919+tn*31};if(kd&&typeof natTree==='function')natTree(o,fq,1,c);else drawTreeRaw(c,o,fq);
 s={cv,o:M0,w:M0*2};TREE_SP.set(key,s);return s}
function drawTree(o,f,lod){const fq=Math.round(clamp(f,0,1)*4)/4,s=treeSprite(o.kd|0,o.tn|0,fq,(o.id|0)%TREE_VAR),k=o.r/TREE_R;
 ctx.drawImage(s.cv,o.x-s.o*k,o.y-s.o*k,s.w*k,s.w*k)}
function drawRock(o,lod){if(o.nd&&typeof NAT_DRAW!=='undefined'&&NAT_DRAW[o.nd]){NAT_DRAW[o.nd](o,lod);return}   // tronchi, torrette, menhir, colonne, ruderi, relitti, totem (AGnature.js)
 const q=o.pr[0],v=q.vs;
 ctx.save();ctx.translate(o.x,o.y);
 ctx.save();ctx.translate(6,8);ctx.fillStyle='rgba(0,0,0,.3)';qpath(ctx,q,0);ctx.fill();ctx.restore();
 if(lod<1){ctx.fillStyle=`rgb(${o.tone},${o.tone},${o.tone})`;qpath(ctx,q,0);ctx.fill()}
 else{for(let i=0;i<v.length;i++){const a=v[i],b=v[(i+1)%v.length];ctx.fillStyle=o.fc[i];ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.closePath();ctx.fill()}
  ctx.strokeStyle='rgba(0,0,0,.45)';ctx.lineWidth=1.5;ctx.lineJoin='miter';qpath(ctx,q,0);ctx.stroke()}
 ctx.restore()}
const DECO=(ctx2,type,hw,hh)=>{const c=ctx2;
 switch(type){
  case 0:c.fillStyle='#2b332c';c.strokeStyle='#f3c67a';c.lineWidth=1.5;c.beginPath();c.arc(0,0,Math.min(hw,hh)*.6,0,TAU);c.fill();c.stroke();c.fillStyle='#f3c67a';c.fillRect(-8,-2,16,4);c.fillRect(-2,-8,4,16);break;
  case 1:c.fillStyle='#222';c.strokeStyle='#777';c.lineWidth=1;c.fillRect(-12,-8,10,14);c.strokeRect(-12,-8,10,14);c.fillRect(2,-4,12,10);c.strokeRect(2,-4,12,10);break;
  case 2:c.strokeStyle='#995533';c.lineWidth=4;c.lineCap='round';c.beginPath();c.moveTo(-hw*.5,-4);c.lineTo(hw*.5,-4);c.moveTo(-hw*.5,4);c.lineTo(hw*.5,4);c.stroke();break;
  case 3:c.fillStyle='#3a6073';c.strokeStyle='#111';c.lineWidth=1.5;c.beginPath();c.arc(0,0,Math.min(hw,hh)*.45,0,TAU);c.fill();c.stroke();c.fillStyle='#fff';c.beginPath();c.arc(-2,-2,3,0,TAU);c.fill();break;
  case 4:c.fillStyle='#1c2833';c.strokeStyle='#5dade2';c.lineWidth=1;c.fillRect(-14,-10,28,20);c.strokeRect(-14,-10,28,20);c.beginPath();c.moveTo(-14,0);c.lineTo(14,0);c.stroke();break;
  case 5:c.fillStyle='#7f8c8d';c.strokeStyle='#2c3e50';c.lineWidth=1.5;c.beginPath();c.ellipse(0,0,12,18,0,0,TAU);c.fill();c.stroke();c.fillStyle='#bdc3c7';c.beginPath();c.ellipse(0,-3,9,14,0,0,TAU);c.fill();break;
  case 6:c.fillStyle='#111';c.fillRect(-2,-18,4,36);c.strokeStyle='#e74c3c';c.lineWidth=1.5;c.beginPath();c.moveTo(-8,-12);c.lineTo(8,-8);c.moveTo(-8,4);c.lineTo(8,8);c.stroke();break;
  case 7:c.fillStyle='#85c1e9';c.strokeStyle='#2471a3';c.lineWidth=1.5;c.fillRect(-15,-12,30,24);c.strokeRect(-15,-12,30,24);c.strokeStyle='#d4efdf';c.lineWidth=1;c.beginPath();c.moveTo(-15,0);c.lineTo(15,0);c.moveTo(0,-12);c.lineTo(0,12);c.stroke();break;
  case 8:c.fillStyle='#39423a';c.strokeStyle='#000';c.lineWidth=1.5;c.fillRect(-hw*.4,-hh*.4,hw*.8,hh*.5);c.strokeRect(-hw*.4,-hh*.4,hw*.8,hh*.5);break;
  case 9:c.strokeStyle='#d35400';c.lineWidth=2;c.beginPath();c.arc(0,0,12,0,TAU);c.arc(0,0,6,0,TAU);c.stroke();break;
  case 10:c.fillStyle='#2c3e50';c.strokeStyle='#e67e22';c.lineWidth=1.5;c.beginPath();c.arc(0,0,10,0,TAU);c.fill();c.stroke();c.fillStyle='#e74c3c';c.fillRect(4,-2,8,4);break}};
function roof(q,style){ // stile del tetto di un rettangolo: 1 a due falde, 2 a shed, 3 a padiglione
 const a=q.a,b=q.b,x=q.x,y=q.y,long=a>=b;ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=2;ctx.beginPath();
 if(style==1){ctx.fillStyle='rgba(0,0,0,.13)';if(long){ctx.fillRect(x-a+4,y,2*a-8,b-4);ctx.moveTo(x-a+4,y);ctx.lineTo(x+a-4,y)}else{ctx.fillRect(x,y-b+4,a-4,2*b-8);ctx.moveTo(x,y-b+4);ctx.lineTo(x,y+b-4)}}
 else if(style==2){ctx.strokeStyle='rgba(0,0,0,.16)';ctx.lineWidth=3;if(long)for(let u=x-a+16;u<x+a-8;u+=16){ctx.moveTo(u,y-b+4);ctx.lineTo(u,y+b-4)}else for(let u=y-b+16;u<y+b-8;u+=16){ctx.moveTo(x-a+4,u);ctx.lineTo(x+a-4,u)}}
 else{const k=Math.min(a,b)*.5;ctx.moveTo(x-a+4,y-b+4);ctx.lineTo(long?x-a+k:x-a+4+k*.2,long?y:y-b+k);ctx.moveTo(x+a-4,y-b+4);ctx.lineTo(long?x+a-k:x+a-4-k*.2,long?y:y-b+k);ctx.moveTo(x-a+4,y+b-4);ctx.lineTo(long?x-a+k:x-a+4+k*.2,long?y:y+b-k);ctx.moveTo(x+a-4,y+b-4);ctx.lineTo(long?x+a-k:x+a-4-k*.2,long?y:y+b-k);if(long){ctx.moveTo(x-a+k,y);ctx.lineTo(x+a-k,y)}}
 ctx.stroke()}
function crack(o,f,hw,hh){ctx.strokeStyle='#151c16';ctx.lineWidth=3.6;ctx.beginPath();
 const line=(x0,y0,x1,y1,st,sd)=>{ctx.moveTo(x0,y0);let k=(o.id+sd)*2654435761>>>0;for(let s=1;s<=st;s++){const t=s/st;k=(k*1664525+1013904223)>>>0;let rx=(k/4294967296-.5)*14;k=(k*1664525+1013904223)>>>0;let ry=(k/4294967296-.5)*14;if(s===st)rx=ry=0;ctx.lineTo(x0+(x1-x0)*t+rx,y0+(y1-y0)*t+ry)}};
 line(0,0,-hw*.5,-hh*.5,5,1);if(f<.6)line(0,0,hw*.5,hh*.5,6,2);if(f<.3)line(-hw*.4,hh*.4,hw*.4,-hh*.4,7,3);ctx.stroke()}

const ACC=['#d98b2b','#3b82f6','#cc0000','#a855f7','#65944d','#f4f1e8'];
function bldDetail(o){const sd=o.id|0,c=ctx;let i=0;
 for(const q of o.pr){const n=i++,H=k=>hs(n,sd,k+50),m=Math.min(q.a,q.b);if(q.k=='g'||m<16)continue;
  if(q.k=='r'){const x=q.x,y=q.y,a=q.a,b=q.b,lg=a>=b,A=lg?a:b,B=lg?b:a;let v=(o.rf&&n==0)?-1:(H(1)*7)|0;if(v==6&&m<50)v=0;
   c.lineWidth=2;c.strokeStyle='rgba(0,0,0,.28)';c.strokeRect(x-a+9,y-b+9,2*a-18,2*b-18);c.strokeStyle='rgba(255,255,255,.12)';c.strokeRect(x-a+11,y-b+11,2*a-22,2*b-22);
   if(H(2)<.4){c.fillStyle=ACC[(H(3)*6)|0]+'99';c.fillRect(x-a+4,y-b+4,2*a-8,5)}
   if(v==0){c.fillStyle='rgba(140,200,230,.6)';c.strokeStyle='rgba(0,0,0,.4)';c.lineWidth=1;   // lucernari
    for(let u=-A+26;u<A-20;u+=26){const px=lg?x+u:x,py=lg?y:y+u,sw=lg?14:B*.9,sh=lg?B*.9:14;c.fillRect(px-sw/2,py-sh/2,sw,sh);c.strokeRect(px-sw/2,py-sh/2,sw,sh)}}
   else if(v==1){const cw=17,ch=10,cols=Math.min(7,((2*a-26)/cw)|0),rows=Math.min(5,((2*b-26)/ch)|0);   // pannelli solari
    if(cols>0&&rows>0){const ox=x-cols*cw/2,oy=y-rows*ch/2;c.fillStyle='#27466f';c.strokeStyle='#8fb4e0';c.lineWidth=.8;c.beginPath();
     for(let r=0;r<rows;r++)for(let cc=0;cc<cols;cc++)c.rect(ox+cc*cw+1,oy+r*ch+1,cw-3,ch-3);c.fill();c.stroke()}}
   else if(v==2){for(let j=0,nn=2+((H(4)*3)|0);j<nn;j++){const px=x+(H(10+j)-.5)*(2*a-40),py=y+(H(20+j)-.5)*(2*b-40);   // climatizzatori
     c.fillStyle='rgba(0,0,0,.3)';c.fillRect(px-7,py-4,16,12);c.fillStyle='#8d949c';c.fillRect(px-8,py-6,16,12);c.strokeStyle='#2c3036';c.lineWidth=1;c.strokeRect(px-8,py-6,16,12);
     c.fillStyle='#343a40';c.beginPath();c.arc(px,py,4,0,TAU);c.fill();c.beginPath();c.moveTo(px-4,py);c.lineTo(px+4,py);c.moveTo(px,py-4);c.lineTo(px,py+4);c.stroke()}}
   else if(v==3){for(let j=0;j<24;j++){c.fillStyle=j&1?'rgba(255,255,255,.14)':'rgba(0,0,0,.16)';c.fillRect(x+(H(10+j)-.5)*(2*a-24),y+(H(40+j)-.5)*(2*b-24),2.5,2.5)}   // ghiaia + vano scala
    const px=x+(H(5)-.5)*a,py=y+(H(6)-.5)*b;c.fillStyle='rgba(0,0,0,.3)';c.fillRect(px-9,py-5,22,16);c.fillStyle='#767d84';c.fillRect(px-11,py-8,22,16);c.strokeStyle='#2c3036';c.lineWidth=1;c.strokeRect(px-11,py-8,22,16)}
   else if(v==4){c.fillStyle='rgba(70,140,70,.85)';c.fillRect(x-a+14,y-b+14,2*a-28,2*b-28);c.fillStyle='rgba(20,80,25,.3)';   // tetto verde
    for(let j=0;j<6;j++){c.beginPath();c.arc(x+(H(10+j)-.5)*(2*a-40),y+(H(20+j)-.5)*(2*b-40),5+H(30+j)*8,0,TAU);c.fill()}
    c.strokeStyle='#d7c99a';c.lineWidth=4;c.beginPath();if(lg){c.moveTo(x-a+14,y);c.lineTo(x+a-14,y)}else{c.moveTo(x,y-b+14);c.lineTo(x,y+b-14)}c.stroke()}
   else if(v==5){c.lineCap='round';c.strokeStyle='#59616a';c.lineWidth=5;c.beginPath();   // tubi e sfiati
    if(lg){c.moveTo(x-a+20,y-b*.35);c.lineTo(x+a-30,y-b*.35);c.lineTo(x+a-30,y+b*.4);c.moveTo(x-a+20,y+b*.15);c.lineTo(x+a*.2,y+b*.15)}
    else{c.moveTo(x-a*.35,y-b+20);c.lineTo(x-a*.35,y+b-30);c.lineTo(x+a*.4,y+b-30);c.moveTo(x+a*.15,y-b+20);c.lineTo(x+a*.15,y-b*.2)}
    c.stroke();c.lineCap='butt';c.fillStyle='#2b2f34';c.strokeStyle='#8d949c';c.lineWidth=1;
    for(let j=0;j<3;j++){c.beginPath();c.arc(x+(H(10+j)-.5)*a*1.2,y+(H(20+j)-.5)*b*1.2,4,0,TAU);c.fill();c.stroke()}}
   else if(v==6){const r=Math.min(m*.55,34);c.strokeStyle='#e6b422';c.lineWidth=3;c.beginPath();c.arc(x,y,r,0,TAU);c.stroke();   // eliporto
    c.strokeStyle='#fff';c.lineWidth=3.5;c.beginPath();c.moveTo(x-r*.35,y-r*.45);c.lineTo(x-r*.35,y+r*.45);c.moveTo(x+r*.35,y-r*.45);c.lineTo(x+r*.35,y+r*.45);c.moveTo(x-r*.35,y);c.lineTo(x+r*.35,y);c.stroke()}}
  else if(q.k=='c'){c.strokeStyle='rgba(0,0,0,.25)';c.lineWidth=2;for(const f of[.72,.44]){c.beginPath();c.arc(q.x,q.y,q.a*f,0,TAU);c.stroke()}
   c.fillStyle='rgba(255,255,255,.1)';c.beginPath();c.arc(q.x,q.y,q.a*.3,0,TAU);c.fill();
   c.beginPath();for(let j=0;j<8;j++){const t=j*TAU/8;c.moveTo(q.x+Math.cos(t)*q.a*.44,q.y+Math.sin(t)*q.a*.44);c.lineTo(q.x+Math.cos(t)*q.a*.72,q.y+Math.sin(t)*q.a*.72)}c.stroke()}
  else if(q.k=='p'){qpath(c,q,q.a*.5);c.fillStyle='rgba(0,0,0,.16)';c.fill();c.strokeStyle='rgba(255,255,255,.18)';c.lineWidth=2;c.stroke();c.fillStyle='#343a40';c.beginPath();c.arc(q.x,q.y,q.a*.12,0,TAU);c.fill()}}}

// riflessi bagnati sui tetti degli edifici: macchie multicolori + beam dai lampioni vicini,
// clippati alla sagoma REALE del tetto (primitive o.pr) così nessuna goccia sborda oltre il bordo.
function pWetBuildingDraw(o,g){const ctx=g;          // disegna sullo sprite g: questo "ctx" locale oscura quello globale
 if(!WX.rain&&!WX.snow)return;                       // <-- neve: entra anche senza lampioni (nessun beam)
 if(o.ty!=='house'||o.sp||o.shape==='pyramid')return;
 const id=(o.id|0)*7919+DC.seed;
 // probabilità: edifici grandi sempre, piccoli ~55% — gli stessi edifici mostrano neve/pioggia
 const big=o.r>=70;
 if(!big && hs(id,0,DC.seed+1200)>0.45)return;
 const nWet=big?2+((hs(id,1,DC.seed+1201)*2)|0):1+((hs(id,1,DC.seed+1201)*2)|0);   // grandi: 2-3, piccoli: 1-2
 ctx.save();
 // CLIP: sagoma reale del tetto, ristretta di 3 px per stare dentro il bordo nero
 ctx.beginPath();
 for(const q of o.pr){
  if(q.k=='r')ctx.rect(q.x-q.a+3,q.y-q.b+3,Math.max(1,2*(q.a-3)),Math.max(1,2*(q.b-3)));
  else if(q.k=='c')ctx.arc(q.x,q.y,Math.max(1,q.a-3),0,TAU);
  else if(q.k==='p'){const r=Math.max(1,q.a-3);for(let i=0;i<q.n;i++){const a=i*TAU/q.n;ctx.lineTo(q.x+Math.cos(a)*r,q.y+Math.sin(a)*r)}ctx.closePath()}
  else if(q.k=='g'){q.vs.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath()}
 }
 ctx.clip();

 if(WX.snow){
  // ===== NEVE SUI TETTI: cumuli bianchi OPACHI (source-over), stessa distribuzione deterministica della pioggia =====
  ctx.globalCompositeOperation='source-over';
  for(let i=0;i<nWet;i++){
   const ang=hs(id,i,DC.seed+1202)*TAU;
   const dist=(0.15+hs(id,i+10,DC.seed+1203)*0.35)*o.r;
   const bx=Math.cos(ang)*dist, by=Math.sin(ang)*dist;
   const baseR=Math.min(o.r*0.7,32+hs(id,i+20,DC.seed+1204)*38);
   // 1. corpo del cumulo: gradiente radiale da bianco pieno (centro) ad azzurro trasparente (bordo)
   const gr=ctx.createRadialGradient(bx-baseR*0.15,by-baseR*0.25,baseR*0.08,bx,by,baseR*1.35);
   gr.addColorStop(0,'rgba(255,255,255,.95)');
   gr.addColorStop(0.5,'rgba(248,252,255,.82)');
   gr.addColorStop(0.8,'rgba(218,232,246,.42)');
   gr.addColorStop(1,'rgba(195,220,240,0)');
   ctx.fillStyle=gr;
   ctx.beginPath();ctx.arc(bx,by,baseR*1.4,0,TAU);ctx.fill();
   // 2. ombra azzurrina in basso (luce diffusa dall'alto)
   ctx.fillStyle='rgba(150,185,225,.30)';
   ctx.beginPath();ctx.ellipse(bx+baseR*0.10,by+baseR*0.30,baseR*0.62,baseR*0.28,0,0,TAU);ctx.fill();
   // 3. lucichio bianco in alto-sx (neve fresca)
   ctx.fillStyle='rgba(255,255,255,.85)';
   ctx.beginPath();ctx.ellipse(bx-baseR*0.22,by-baseR*0.28,baseR*0.48,baseR*0.30,0,0,TAU);ctx.fill();
  }
  ctx.restore();
  return;
 }

 // ===== PIOGGIA: macchie colorate + beam dei lampioni (comportamento invariato) =====
 ctx.globalCompositeOperation='lighter';
 // 1. base multicolore (in coordinate locali all'edificio: il transform è già applicato in drawBld)
 for(let i=0;i<nWet;i++){
  const ang=hs(id,i,DC.seed+1202)*TAU;
  const dist=(0.15+hs(id,i+10,DC.seed+1203)*0.35)*o.r;
  const bx=Math.cos(ang)*dist, by=Math.sin(ang)*dist;
  const baseR=Math.min(o.r*0.7,32+hs(id,i+20,DC.seed+1204)*38);
  const c1=(hs(id,i+30,DC.seed+1205)*3)|0;
  const c2=(c1+1+((hs(id,i+40,DC.seed+1206)*2)|0))%3;
  const a1=0.24+hs(id,i+50,DC.seed+1207)*0.18;     // 0.24-0.42
  const gr=ctx.createRadialGradient(bx,by,baseR*0.08,bx,by,baseR*1.35);
  gr.addColorStop(0,`rgba(${LAMP_COL[c1]},${a1.toFixed(3)})`);
  gr.addColorStop(0.35,`rgba(${LAMP_COL[c2]},${(a1*0.85).toFixed(3)})`);
  gr.addColorStop(0.7,`rgba(${LAMP_COL[c1]},${(a1*0.45).toFixed(3)})`);
  gr.addColorStop(1,`rgba(${LAMP_COL[c2]},0)`);
  ctx.fillStyle=gr;
  ctx.beginPath();ctx.arc(bx,by,baseR*1.4,0,TAU);ctx.fill();
 }
 // 2. beam dai lampioni (in coordinate locali), con tetto totale per non bruciare il tetto
 const R=340, BEAM_MAX=0.28;
 const beams=[];let beamTot=0;
 for(const L of DC.LAMPS){
  if(Math.abs(L.x-o.x)>R||Math.abs(L.y-o.y)>R)continue;   // fast-reject box
  const dx=(L.x-o.x)*o.c+(L.y-o.y)*o.s;
  const dy=-(L.x-o.x)*o.s+(L.y-o.y)*o.c;
  const d2=dx*dx+dy*dy;
  if(d2>R*R)continue;
  const d=Math.sqrt(d2)||1;
  const ba=(1-d/R)*0.16;
  if(ba<0.008)continue;
  beams.push({dx,dy,d,ba,col:L.c});
  beamTot+=ba;
 }
 if(beamTot>0){
  const k=beamTot>BEAM_MAX?BEAM_MAX/beamTot:1;
  for(const b of beams){
   const ba=b.ba*k;
    if(ba<0.006)continue;
    const col=LAMP_COL[b.col];
    const bR=Math.min(o.r*0.9,60);
    const grB=ctx.createRadialGradient(b.dx,b.dy,Math.max(1,b.d-bR),b.dx,b.dy,b.d+bR*1.2);
    grB.addColorStop(0,`rgba(${col},${ba.toFixed(3)})`);
    grB.addColorStop(0.55,`rgba(${col},${(ba*0.6).toFixed(3)})`);
    grB.addColorStop(1,`rgba(${col},0)`);
    ctx.fillStyle=grB;
    ctx.beginPath();ctx.arc(b.dx,b.dy,b.d+bR*1.2,0,TAU);ctx.fill();
  }
 }
 ctx.restore();
}

// effetto bagnato/neve dei tetti: calcolato UNA volta per edificio in uno sprite (coordinate locali), poi 1 drawImage per frame
const WET={q:[],S:.6,max:260};
function wetReset(){for(const o of WET.q){if(o._ws)o._ws.width=0;o._ws=undefined}WET.q.length=0}
function wetSprite(o){
 if(o.ty!=='house'||o.sp||o.shape==='pyramid')return null;
 const id=(o.id|0)*7919+DC.seed;
 if(o.r<70&&hs(id,0,DC.seed+1200)>0.45)return null;                 // stessa esclusione di pWetBuildingDraw: su questo edificio non c'è effetto
 const R=Math.ceil(o.r+8),S=WET.S,c=document.createElement('canvas');c.width=c.height=Math.ceil(2*R*S);
 const g=c.getContext('2d');g.setTransform(S,0,0,S,R*S,R*S);        // coordinate locali dell'edificio, origine al centro dello sprite
 pWetBuildingDraw(o,g);o._wr=R;return c}
function pWetBuilding(o){
 if(!WX.rain&&!WX.snow)return;
 let s=o._ws;
 if(s===undefined){s=o._ws=wetSprite(o);
  if(s){WET.q.push(o);if(WET.q.length>WET.max){const v=WET.q.shift();if(v._ws)v._ws.width=0;v._ws=undefined}}}   // cache FIFO: memoria limitata
 if(!s)return;
 const R=o._wr;ctx.save();ctx.globalCompositeOperation=WX.snow?'source-over':'lighter';ctx.drawImage(s,-R,-R,2*R,2*R);ctx.restore()}   // pioggia: luce additiva come prima; neve: opaca
function drawBld(o,f,lod){
 ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.a);
 const hw=o.w/2,hh=o.h/2,pal=BPAL[o.pal||0];

 if(o.shape==='pyramid'){   // piramide a gradoni: ombra, bordo nero e palette come gli altri edifici
  ctx.save();ctx.translate(5,7);ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(-hw,-hh,o.w,o.h);ctx.restore();
  const a2=hw*.4,b2=hh*.4,face=(p,sh)=>{ctx.beginPath();p.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath();ctx.fillStyle=pal[1];ctx.fill();ctx.fillStyle=sh;ctx.fill()};
  ctx.lineJoin='round';ctx.fillStyle=pal[0];ctx.fillRect(-hw,-hh,o.w,o.h);
  face([[-hw,-hh],[hw,-hh],[a2,-b2],[-a2,-b2]],'rgba(255,255,255,.14)');   // nord: illuminata
  face([[-hw,-hh],[-a2,-b2],[-a2,b2],[-hw,hh]],'rgba(255,255,255,.05)');   // ovest
  face([[hw,-hh],[hw,hh],[a2,b2],[a2,-b2]],'rgba(0,0,0,.18)');             // est: in ombra
  face([[-hw,hh],[-a2,b2],[a2,b2],[hw,hh]],'rgba(0,0,0,.3)');              // sud: più in ombra
  if(lod>=1){ctx.strokeStyle='rgba(0,0,0,.3)';ctx.lineWidth=2;ctx.strokeRect(-hw*.7,-hh*.7,hw*1.4,hh*1.4)}   // gradone intermedio
  ctx.strokeStyle='#000';ctx.lineWidth=2.5;ctx.beginPath();
  ctx.moveTo(-hw,-hh);ctx.lineTo(-a2,-b2);ctx.moveTo(hw,-hh);ctx.lineTo(a2,-b2);ctx.moveTo(hw,hh);ctx.lineTo(a2,b2);ctx.moveTo(-hw,hh);ctx.lineTo(-a2,b2);ctx.stroke();   // spigoli
  ctx.fillStyle=pal[1];ctx.fillRect(-a2,-b2,a2*2,b2*2);ctx.fillStyle='rgba(255,255,255,.2)';ctx.fillRect(-a2,-b2,a2*2,b2*2);ctx.strokeRect(-a2,-b2,a2*2,b2*2);   // sommità
  ctx.lineWidth=4;ctx.strokeRect(-hw,-hh,o.w,o.h);   // bordo esterno come gli altri edifici
  if(f<.95)crack(o,f,hw,hh);if(o.bar||o.vipB||o.tg||o.rb||o.arm||o.sb)drawMark(o);
  ctx.restore();return;
 }

 ctx.save();ctx.translate(5,7);ctx.fillStyle='rgba(0,0,0,.3)';for(const q of o.pr){qpath(ctx,q,0);ctx.fill()}ctx.restore();
 if(o.ty=='wall'){ctx.fillStyle=pal[0];ctx.fillRect(-hw,-hh,o.w,o.h);ctx.fillStyle=pal[1];ctx.fillRect(-hw+2,-hh+2,o.w-4,o.h-4);
  if(lod>=1){ctx.strokeStyle='rgba(0,0,0,.3)';ctx.lineWidth=1.5;ctx.beginPath();for(let x=-hw+14;x<hw;x+=22){ctx.moveTo(x,-hh+2);ctx.lineTo(x,hh-2)}ctx.stroke()}
  if(f<.95)crack(o,f,hw*.5,hh);ctx.restore();return}
 ctx.lineJoin='round';ctx.strokeStyle='#000';ctx.lineWidth=4;for(const q of o.pr){qpath(ctx,q,0);ctx.stroke()}
 ctx.fillStyle=pal[0];for(const q of o.pr){qpath(ctx,q,0);ctx.fill()}
 ctx.fillStyle=pal[1];for(const q of o.pr){qpath(ctx,q,4);ctx.fill()}
 if(lod>=1&&o.rf&&o.pr[0].k=='r')roof(o.pr[0],o.rf);
 if(lod>=1)bldDetail(o);
 if(lod>=1&&o.dec)for(let i=0;i<2;i++){const an=o.an[i];ctx.save();ctx.translate(an[0],an[1]);
  if([1,4,5,6,7,9,10].includes(o.dec[i])){const sc=clamp(Math.min(an[2],an[3])/14,.5,2.2);ctx.scale(sc,sc)}DECO(ctx,o.dec[i],an[2],an[3]);ctx.restore()}
 if(lod>=1)pWetBuilding(o);   // <-- riflessi bagnati sul tetto (clippati alla geometria)
 if(f<.95)crack(o,f,hw,hh);
 if(o.bar||o.vipB||o.tg||o.rb||o.arm||o.sb)drawMark(o);
 ctx.restore()}
// ===== disegno degli edifici speciali (dinamico: si danneggiano e crollano come gli altri) =====
function drawSpecial(o,f,lod){const c=ctx,t=o.shape,hw=o.w/2,hh=o.h/2,v=o.v|0;c.save();c.translate(o.x,o.y);c.rotate(o.a);
 const big=t=='crane'||t=='plat'||t=='ship'||t=='carrier';c.save();c.translate(big?8:5,big?12:7);c.fillStyle='rgba(0,0,0,.3)';for(const q of o.pr){qpath(c,q,0);c.fill()}c.restore();
 c.lineJoin='round';
 if(t=='cont'){const nx=Math.max(1,Math.round(o.w/56)),ny=Math.max(1,Math.round(o.h/24)),cw=o.w/nx,ch=o.h/ny;
  if(lod<1){c.fillStyle=CONT_COL[o.cc[0]%CONT_COL.length];c.fillRect(-hw,-hh,o.w,o.h)}
  else{for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){c.fillStyle=CONT_COL[o.cc[j*nx+i]%CONT_COL.length];c.fillRect(-hw+i*cw+1,-hh+j*ch+1,cw-2,ch-2)}
   c.strokeStyle='rgba(0,0,0,.3)';c.lineWidth=1.2;c.beginPath();for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=-hw+i*cw,y=-hh+j*ch;for(const k of[.3,.5,.7]){c.moveTo(x+2,y+ch*k);c.lineTo(x+cw-2,y+ch*k)}}c.stroke()}
  c.strokeStyle='#111';c.lineWidth=2;c.strokeRect(-hw,-hh,o.w,o.h)}
 else if(t=='silo'||t=='tank'||t=='stack'){const cols=t=='tank'?['#3c4046','#5b6168','#8a949c']:t=='stack'?['#8a2a22','#c0392b','#e8e4dc']:v==1?['#6b4a32','#9b6b4a','#c79a78']:v==2?['#44566a','#6d8fb0','#a9c4de']:['#555d63','#8f969c','#c2c9ce'];
  for(const q of o.pr){const r=q.a;c.fillStyle='#000';c.beginPath();c.arc(q.x,q.y,r+2,0,TAU);c.fill();c.fillStyle=cols[0];c.beginPath();c.arc(q.x,q.y,r,0,TAU);c.fill();
   c.fillStyle=cols[1];c.beginPath();c.arc(q.x-r*.06,q.y-r*.06,r*.84,0,TAU);c.fill();
   if(lod>=1){c.strokeStyle='rgba(0,0,0,.3)';c.lineWidth=1.5;c.beginPath();if(t=='stack'){for(const k of[.62,.32]){c.moveTo(q.x+r*k,q.y);c.arc(q.x,q.y,r*k,0,TAU)}}else{for(let i=0;i<6;i++){const a=i*TAU/6+.3;c.moveTo(q.x+Math.cos(a)*r*.25,q.y+Math.sin(a)*r*.25);c.lineTo(q.x+Math.cos(a)*r*.82,q.y+Math.sin(a)*r*.82)}}c.stroke()}
   if(t=='tank'&&o.ct){
    // solo torri di raffreddamento della centrale
    c.fillStyle='#0c0e10';c.beginPath();c.arc(q.x,q.y,r*.38,0,TAU);c.fill();
    c.fillStyle='#1a1e22';c.beginPath();c.arc(q.x,q.y,r*.22,0,TAU);c.fill();
    c.strokeStyle=cols[2];c.lineWidth=2;c.beginPath();c.moveTo(q.x+r*.2,q.y+r*.2);c.lineTo(q.x+r*.82,q.y+r*.5);c.stroke();
   }else{
    c.fillStyle=cols[2];c.beginPath();c.arc(q.x-r*.22,q.y-r*.22,r*.22,0,TAU);c.fill();
    if(t=='tank'){c.strokeStyle=cols[2];c.lineWidth=2;c.beginPath();c.moveTo(q.x+r*.2,q.y+r*.2);c.lineTo(q.x+r*.82,q.y+r*.5);c.stroke()}
   }}}
 else if(t=='crane'){const L=o.w+70;
  for(const q of o.pr){c.fillStyle='#000';c.fillRect(q.x-q.a-2,q.y-q.b-2,q.a*2+4,q.b*2+4);c.fillStyle='#46505a';c.fillRect(q.x-q.a,q.y-q.b,q.a*2,q.b*2);c.fillStyle='#e6b422';c.fillRect(q.x-q.a*.55,q.y-q.b*.55,q.a*1.1,q.b*1.1)}
  c.fillStyle='#000';c.fillRect(-L/2-2,-8,L+4,16);c.fillStyle='#e6b422';c.fillRect(-L/2,-6,L,12);
  if(lod>=1){c.strokeStyle='rgba(0,0,0,.45)';c.lineWidth=1.4;c.beginPath();for(let x=-L/2+6;x<L/2-4;x+=12){c.moveTo(x,-6);c.lineTo(x+6,6)}c.stroke()}
  const tx=((o.id*37)%100/100-.5)*o.w*.6;c.fillStyle='#c0392b';c.fillRect(tx-9,-11,18,22);c.fillStyle='#fff';c.fillRect(tx-3,-3,6,6)}
 else if(t=='ship'){const vs=o.pr[0].vs,AC=o.aiS?(G.aiCi!=null?COLS[G.aiCi][0]:'#7a2d27'):null,   // nave nemica: colore dell'AI
   hull=AC?shade(AC,-.35):['#2f3c48','#7a2d27','#5a6670'][v%3],deck=AC?shade(AC,-.1):['#4c5b69','#a45a3a','#7f8c96'][v%3];
  c.beginPath();vs.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.fillStyle='#000';c.fill();c.lineWidth=5;c.strokeStyle='#000';c.stroke();c.fillStyle=hull;c.fill();
  c.beginPath();vs.forEach((p,i)=>i?c.lineTo(p[0]*.9,p[1]*.72):c.moveTo(p[0]*.9,p[1]*.72));c.closePath();c.fillStyle=deck;c.fill();
  const a=hw*.9,b=hh*.7;
  if(v==0){for(let i=0;i<7;i++)for(let j=-1;j<=1;j+=2){c.fillStyle=CONT_COL[(o.id+i*3+j+9)%CONT_COL.length];c.fillRect(-a*.55+i*a*.17,j<0?-b*.84:b*.08,a*.15,b*.74)}}
  else if(v==1){c.fillStyle='#2b3138';for(let i=0;i<5;i++){c.beginPath();c.arc(-a*.4+i*a*.2,0,b*.34,0,TAU);c.fill()}c.strokeStyle='#d0d6da';c.lineWidth=2;c.beginPath();c.moveTo(-a*.5,0);c.lineTo(a*.5,0);c.stroke()}
  else{const su=o.suU&&!o.suU.dead?o.suU:null;c.fillStyle='#38424a';   // torrette: ferme in avanti finché la nave non combatte, poi seguono l'unità (thr3 razzi, thr mitraglia)
   for(let i=0;i<2;i++){const x=i?.5:.1,ta=su?(i?su.thr:su.thr3):null;c.save();c.translate(a*x,0);c.beginPath();c.arc(0,0,b*.42,0,TAU);c.fill();if(ta!=null)c.rotate(ta-o.a);c.fillRect(0,-3,b*1.1,6);c.restore()}c.strokeStyle='#cfd8dc';c.lineWidth=2;c.beginPath();c.arc(-a*.35,0,b*.5,0,TAU);c.stroke()}
  c.fillStyle='#e8e4dc';c.fillRect(-hw*.9,-b*.5,a*.3,b);c.fillStyle='#3a6a8a';c.fillRect(-hw*.9+2,-b*.35,5,b*.7);c.fillStyle='#c0392b';c.beginPath();c.arc(-hw*.62,0,b*.22,0,TAU);c.fill()}
 
 else if(t=='carrier'){
  // FIX: 'now' e i colori hullBase/hullLight/armorOrange erano usati nel blocco ma erano
  // dichiarati solo dentro 'cruiser' (scope locale diverso): in 'use strict' → ReferenceError.
  const now=performance.now();
  // ===== 1. scafo: bordo nero + riempimento scuro con tonalità in base a v =====
  const vs=o.pr[0].vs,hullTone=['#2e3842','#333b46','#2a3a4a'][v%3];
  const hullBase=hullTone,hullLight='#48586e',armorOrange='#ba5d23';
  c.beginPath();vs.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();
  c.lineWidth=6;c.strokeStyle='#000';c.stroke();
  c.fillStyle=hullTone;c.fill();

  // ===== 2. ponte di volo (scala 0.9) =====
  const ds=0.9;
  c.beginPath();vs.forEach((p,i)=>i?c.lineTo(p[0]*ds,p[1]*ds):c.moveTo(p[0]*ds,p[1]*ds));c.closePath();
  c.fillStyle='#4a5460';c.fill();

  // bordo di sicurezza rosso/bianco (raddoppiato)
  c.save();c.setLineDash([12,12]);c.strokeStyle='#c0392b';c.lineWidth=3.6;
  c.beginPath();vs.forEach((p,i)=>i?c.lineTo(p[0]*ds*.94,p[1]*ds*.94):c.moveTo(p[0]*ds*.94,p[1]*ds*.94));c.closePath();c.stroke();c.restore();

  const a=hw*ds,b=hh*ds;
  const DK=2;   // fattore di ingrandimento dei dettagli del ponte (esclusa l'isola, sezione 7)

  // (Pista di atterraggio spostata a fine blocco, estesa e sopra ogni altro dettaglio)

  // ===== 4. PISTA LATERALE DI DECOLLO (port side, angolata) =====
  c.save();
  c.beginPath();c.moveTo(-a*.65,-b*.55);c.lineTo(a*.5,-b*.42);c.lineTo(a*.5,-b*.2);c.lineTo(-a*.65,-b*.33);c.closePath();
  c.fillStyle='#3a444f';c.fill();
  c.strokeStyle='#8899aa';c.lineWidth=1.6*DK;c.stroke();
  c.setLineDash([14*DK,10*DK]);c.strokeStyle='rgba(232,213,138,.75)';c.lineWidth=2.4*DK;
  c.beginPath();c.moveTo(-a*.65,-b*.44);c.lineTo(a*.5,-b*.31);c.stroke();c.setLineDash([]);
  // luci bordo pista (verdi = decollo)
  for(let t=0;t<=1;t+=.06){
    const ux=-a*.65+(a*1.15)*t, uyP=-b*.55+(b*.13)*t, uyS=-b*.33+(b*.13)*t;
    c.fillStyle='#66ff66';circle(ux,uyP,1.6*DK);circle(ux,uyS,1.6*DK);
  }
  c.restore();

  // ===== 5. "H" DI ATTERRAGGIO (3) con luci angolari =====
  const drawH=(hx,hy,size)=>{
    const dc=1.3*size;
    c.setLineDash([5*DK,4*DK]);c.strokeStyle='rgba(255,210,63,.7)';c.lineWidth=1.5*DK;
    c.beginPath();c.arc(hx,hy,dc,0,TAU);c.stroke();c.setLineDash([]);
    c.strokeStyle='rgba(255,255,255,.9)';c.lineWidth=3*DK;c.lineCap='round';
    c.beginPath();
    c.moveTo(hx-size,hy-size*.75);c.lineTo(hx-size,hy+size*.75);
    c.moveTo(hx+size,hy-size*.75);c.lineTo(hx+size,hy+size*.75);
    c.moveTo(hx-size,hy);c.lineTo(hx+size,hy);
    c.stroke();
    const lp=.5+.5*Math.sin(now/200);
    c.fillStyle=`rgba(255,210,63,${.5+.5*lp})`;
    for(const[sx,sy]of[[-1,-1],[1,-1],[1,1],[-1,1]])circle(hx+sx*dc*.88,hy+sy*dc*.88,1.6*DK);
  };
  drawH(a*.35, b*.45, 7*DK);   // H1: prua-starboard
  drawH(-a*.85, b*.4, 7*DK);   // H2: poppa-starboard (fantail)
  drawH(a*.62, -b*.4, 6*DK);   // H3: prua-port, oltre la pista di decollo

  // ===== 6. FILA DI 6 MINI-DROPSHIP (starboard-aft, angolate) =====
  const drawMiniDrop=(dx,dy,ang,sc)=>{
    c.save();c.translate(dx,dy);c.rotate(ang);c.scale(sc,sc);
    c.fillStyle='rgba(0,0,0,.35)';c.beginPath();c.ellipse(0,2,7,10,0,0,TAU);c.fill();
    c.fillStyle='#2c3238';c.strokeStyle='#1a1e22';c.lineWidth=1;
    c.beginPath();
    c.moveTo(-2,-2);c.lineTo(-11,-4);c.lineTo(-14,2);c.lineTo(-1,7);c.closePath();
    c.moveTo(2,-2);c.lineTo(11,-4);c.lineTo(14,2);c.lineTo(1,7);c.closePath();
    c.fill();c.stroke();
    c.fillStyle='#3a4046';
    c.beginPath();c.moveTo(0,-13);c.lineTo(6,-4);c.lineTo(3,12);c.lineTo(-3,12);c.lineTo(-6,-4);c.closePath();
    c.fill();c.stroke();
    c.fillStyle='#88ccff';circle(0,-7,1.8);
    c.fillStyle='#ff2222';circle(-2,-10,.8);circle(2,-10,.8);
    c.fillStyle='#15181b';c.fillRect(-8,-3,2,4);c.fillRect(6,-3,2,4);
    c.restore();
  };
  const dropY=b*.38,dropStart=-a*.92,dropEnd=a*.02,dropN=6;
  if(!o.suU)for(let i=0;i<dropN;i++)drawMiniDrop(dropStart+(dropEnd-dropStart)*i/(dropN-1),dropY,-Math.PI*.35,DK*0.7);
  // segnaletica di parcheggio
  c.save();c.setLineDash([4*DK,4*DK]);c.strokeStyle='rgba(232,213,138,.4)';c.lineWidth=1.2*DK;
  c.beginPath();c.moveTo(dropStart-5*DK,dropY+7*DK);c.lineTo(dropEnd+5*DK,dropY+7*DK);c.stroke();c.restore();

  // ===== 7. ASCENSORE (1) =====
  {const ex=a*.5,ey=-b*.75;
   c.fillStyle='#252e38';c.strokeStyle='#5a6a7a';c.lineWidth=2*DK;
   c.fillRect(ex-12*DK,ey-7*DK,24*DK,14*DK);c.strokeRect(ex-12*DK,ey-7*DK,24*DK,14*DK);
   c.beginPath();c.moveTo(ex-12*DK,ey-7*DK);c.lineTo(ex+12*DK,ey+7*DK);c.stroke();
   c.fillStyle=Math.sin(now/180+ex)>0?'#ffcc44':'#996600';
   circle(ex-12*DK,ey-7*DK,1.2*DK);circle(ex+12*DK,ey+7*DK,1.2*DK)}

  // ===== 8. GRU LOGISTICA DIETRO LA TORRE DI CONTROLLO =====
  c.save();c.translate(-a*.22,b*.62);
  c.fillStyle='#3a4048';c.fillRect(-3*DK,-16*DK,6*DK,32*DK);
  c.strokeStyle='#111';c.lineWidth=1.5*DK;c.strokeRect(-3*DK,-16*DK,6*DK,32*DK);
  c.fillStyle='#e6b422';c.fillRect(-16*DK,-20*DK,32*DK,7*DK);
  c.strokeStyle='#111';c.lineWidth=1.5*DK;c.strokeRect(-16*DK,-20*DK,32*DK,7*DK);
  c.fillStyle='#111';c.beginPath();c.arc(0,-16*DK,2.5*DK,0,TAU);c.fill();
  c.strokeStyle='#666';c.lineWidth=1.2*DK;c.beginPath();c.moveTo(12*DK,-13*DK);c.lineTo(12*DK,0);c.stroke();
  c.fillStyle='#222';c.fillRect(10*DK,-2*DK,4*DK,4*DK);
  c.fillStyle=Math.sin(now/150)>.2?'#ff4444':'#661111';circle(12*DK,3*DK,1.5*DK);
  c.restore();

  // ===== 9. ISOLA / TORRE DI CONTROLLO con luci nav =====
  c.fillStyle='#19202a';c.fillRect(-hw*.18,-hh*.13,54,hh*.26);
  c.strokeStyle='#424f60';c.lineWidth=1.5;c.strokeRect(-hw*.18,-hh*.13,54,hh*.26);
  c.fillStyle=hullLight;c.fillRect(-hw*.15,-hh*.08,44,hh*.16);
  c.fillStyle='#00f0ff';c.fillRect(-hw*.12,-hh*.05,7,hh*.1);
  c.fillStyle='#ff2222';circle(-hw*.17,-hh*.13-3,2.2*DK);
  c.fillStyle='#22ff44';circle(-hw*.17,hh*.13+3,2.2*DK);
  c.fillStyle=Math.sin(now/300)>.3?'#ffffff':'#88aaff';circle(-hw*.04,-hh*.13-3,1.8*DK);
  c.fillStyle='#d2d8e0';circle(-hw*.03,0,5.5);c.strokeStyle='#111';c.lineWidth=1;c.stroke();
  c.strokeStyle='#ff2222';c.lineWidth=2;circle(-hw*.14,0,2.5);

  // ===== 10. PRUA A MARTELLO + CANNONE + LUCI NAV =====
  // I lati della prua seguono il profilo del ponte di volo (paralleli, interni):
  // niente punte che sporgono oltre lo scafo. I vertici esterni sono allineati ai
  // vertici P2/P3/P4/P5 del poligono 'carrier' (leggermente indentati per stare dentro).
  c.fillStyle=hullBase;c.beginPath();
  c.moveTo(hw*.34,-hh*.72);       // attacco port con il corpo centrale
  c.lineTo(hw*.70,-hh*.66);       // P2 del ponte (smusso port), parallelo allo scafo
  c.lineTo(hw*.85,-hh*.30);       // P3 del ponte (fronte port), parallelo allo scafo
  c.lineTo(hw*.82,0);             // punta di prua (dentro il fronte piatto del ponte)
  c.lineTo(hw*.85,hh*.30);        // P4 del ponte (fronte starboard)
  c.lineTo(hw*.70,hh*.66);        // P5 del ponte (smusso starboard)
  c.lineTo(hw*.34,hh*.72);        // attacco starboard con il corpo centrale
  c.closePath();c.fill();
  c.strokeStyle='#111';c.lineWidth=2;c.stroke();
  // Piastre corazzate superiori (accreditate sui nuovi bordi, senza sbordare)
  c.fillStyle=hullLight;c.fillRect(hw*.40,-hh*.55,hw*.28,22);c.fillRect(hw*.40,hh*.55-22,hw*.28,22);
  c.strokeStyle='#222';c.lineWidth=1;c.strokeRect(hw*.40,-hh*.55,hw*.28,22);c.strokeRect(hw*.40,hh*.55-22,hw*.28,22);
  c.fillStyle=armorOrange;c.fillRect(hw*.44,-hh*.55,8,22);c.fillRect(hw*.44,hh*.55-22,8,22);
  c.fillStyle='#0c1015';c.beginPath();c.arc(hw*.68,0,28,-Math.PI/2,Math.PI/2);c.closePath();c.fill();c.stroke();
  c.strokeStyle='#38bdf8';c.lineWidth=2;c.beginPath();c.arc(hw*.68,0,20,-Math.PI/2,Math.PI/2);c.stroke();
  c.fillStyle='#ff6600';circle(hw*.64,0,9);c.fillStyle='#ffea00';circle(hw*.64,0,4.5);
  c.fillStyle='#ff2222';c.beginPath();c.arc(a*.88,-b*.28,3*DK,0,TAU);c.fill();c.strokeStyle='#000';c.lineWidth=1*DK;c.stroke();
  c.fillStyle='#22ff44';c.beginPath();c.arc(a*.88,b*.28,3*DK,0,TAU);c.fill();c.strokeStyle='#000';c.lineWidth=1*DK;c.stroke();

  // ===== 11. CIWS IN MINIATURA (4, sbordanti dai bordi del ponte) =====
  const drawCIWS=(cx,cy,outAng)=>{
    c.save();c.translate(cx,cy);c.rotate(outAng);
    c.fillStyle='#0e1218';c.beginPath();c.arc(0,0,7*DK,0,TAU);c.fill();
    c.fillStyle='#2a3540';c.beginPath();c.arc(0,0,5.5*DK,0,TAU);c.fill();
    c.strokeStyle='#556677';c.lineWidth=1.5*DK;c.stroke();
    c.fillStyle='#1a222c';circle(0,0,3.5*DK);c.strokeStyle='#556677';c.lineWidth=1*DK;c.stroke();
    c.fillStyle='#111';
    c.fillRect(2*DK,-1.8*DK,10*DK,1.4*DK);c.fillRect(2*DK,0.4*DK,10*DK,1.4*DK);
    c.strokeStyle='#666';c.lineWidth=.6*DK;
    c.strokeRect(2*DK,-1.8*DK,10*DK,1.4*DK);c.strokeRect(2*DK,0.4*DK,10*DK,1.4*DK);
    c.fillStyle=Math.sin(now/220+outAng)>.4?'#ff3333':'#661111';circle(-3*DK,0,1.2*DK);
    c.restore();
  };
  // portaerei sveglia (colpita): i CIWS seguono le torrette dell'unità (prua = mitraglia, poppa = razzi)
  const su=o.suU&&!o.suU.dead?o.suU:null,ca=(t,d)=>su&&su[t]!=null?su[t]-o.a:d;
  drawCIWS(a*.72, b*.95, ca('thr',Math.PI/2));
  drawCIWS(a*.72,-b*.95,ca('thr',-Math.PI/2));
  drawCIWS(-a*.72, b*.95,ca('thr3',Math.PI/2));
  drawCIWS(-a*.72,-b*.95,ca('thr3',-Math.PI/2));

  // ===== 12. NUMERO DI PRUA (hull number, sobrio) =====
  const num=((o.id*11)%80)+60;
  c.save();c.translate(a*.45,b*.08);c.rotate(-Math.PI/2);
  c.font='bold '+Math.round(Math.min(hw,hh)*.38)+'px system-ui,sans-serif';
  c.fillStyle='rgba(230,230,230,.5)';c.textAlign='center';c.textBaseline='middle';
  c.fillText(String(num),0,0);c.restore();

  // ===== 13. CONTAINER/MUNIZIONI A POPPA-PORT =====
  c.fillStyle='#4a3a20';c.strokeStyle='#222';c.lineWidth=1.5*DK;
  for(let i=0;i<4;i++){
    const ccx=-a*.85+(i%2)*8*DK,ccy=-b*.7+Math.floor(i/2)*5*DK;
    c.fillRect(ccx-4*DK,ccy-2*DK,8*DK,4*DK);c.strokeRect(ccx-4*DK,ccy-2*DK,8*DK,4*DK);
    c.strokeStyle='rgba(255,255,255,.35)';c.beginPath();c.moveTo(ccx-2*DK,ccy-2*DK);c.lineTo(ccx-2*DK,ccy+2*DK);c.moveTo(ccx+2*DK,ccy-2*DK);c.lineTo(ccx+2*DK,ccy+2*DK);c.stroke();
    c.strokeStyle='#222';
  }

  }   // chiude carrier

 else if(t=='plat'){c.fillStyle='#000';c.fillRect(-hw-2,-hh-2,o.w+4,o.h+4);c.fillStyle='#4d5a66';c.fillRect(-hw,-hh,o.w,o.h);c.fillStyle='#5f6f7d';c.fillRect(-hw+5,-hh+5,o.w-10,o.h-10);
  c.strokeStyle='#e6b422';c.lineWidth=3;c.setLineDash([10,8]);c.strokeRect(-hw+3,-hh+3,o.w-6,o.h-6);c.setLineDash([]);
  c.fillStyle='#37424c';c.beginPath();c.arc(-hw*.4,-hh*.1,Math.min(hw,hh)*.42,0,TAU);c.fill();c.strokeStyle='#fff';c.lineWidth=3;c.beginPath();c.arc(-hw*.4,-hh*.1,Math.min(hw,hh)*.34,0,TAU);c.stroke();
  c.beginPath();c.moveTo(-hw*.4-9,-hh*.1-11);c.lineTo(-hw*.4-9,-hh*.1+11);c.moveTo(-hw*.4+9,-hh*.1-11);c.lineTo(-hw*.4+9,-hh*.1+11);c.moveTo(-hw*.4-9,-hh*.1);c.lineTo(-hw*.4+9,-hh*.1);c.stroke();
  const dx=hw*.5,dy=-hh*.3,s2=Math.min(hw,hh)*.34;c.fillStyle='#cfd8dc';c.fillRect(dx-s2,dy-s2,s2*2,s2*2);c.strokeStyle='#37424c';c.lineWidth=2;c.strokeRect(dx-s2,dy-s2,s2*2,s2*2);c.beginPath();c.moveTo(dx-s2,dy-s2);c.lineTo(dx+s2,dy+s2);c.moveTo(dx+s2,dy-s2);c.lineTo(dx-s2,dy+s2);c.stroke();
  c.fillStyle='#c0392b';c.beginPath();c.arc(hw*.8,hh*.7,5,0,TAU);c.fill()}
 else if(t=='cruiser'){
  const now=performance.now();
  // 1. il bacino di carenaggio (telaio, guide gialle, passerelle) è disegno a terra: PF.drydock in AGbake.js (così non compare nella visuale termica)
  if(o.gone){c.restore();return}   // nave decollata: resta solo il bacino vuoto

  // 2. Tonalità dello scafo Terran
  const hullDark='#1c232b',hullBase='#344152',hullLight='#48586e',armorOrange='#ba5d23';

  // A. POPPA E PROPULSIONE
  c.fillStyle=hullDark;c.fillRect(-hw*.92,-hh*.58,hw*.42,hh*1.16);
  c.strokeStyle='#111';c.lineWidth=2;c.strokeRect(-hw*.92,-hh*.58,hw*.42,hh*1.16);
  // Piastre corazzate di poppa
  c.fillStyle=hullBase;c.fillRect(-hw*.78,-hh*.48,hw*.22,hh*.96);
  c.strokeStyle='#222';c.strokeRect(-hw*.78,-hh*.48,hw*.22,hh*.96);
  // 4 Campane dei motori a reazione con anelli di scarico
  for(const ty of[-hh*.4,-hh*.14,hh*.14,hh*.4]){
   c.fillStyle='#0e1216';c.beginPath();c.arc(-hw*.92,ty,17,0,TAU);c.fill();c.stroke();
   c.fillStyle='#2b3542';c.beginPath();c.arc(-hw*.92,ty,11,0,TAU);c.fill();
   c.fillStyle=Math.sin(now/160+ty)>.1?'#38bdf8':'#16324a';c.beginPath();c.arc(-hw*.92,ty,6,0,TAU);c.fill();
   // Tubi di alimentazione carburante ad alta pressione (stile edifici v==5)
   c.strokeStyle='#626b78';c.lineWidth=3;c.beginPath();c.moveTo(-hw*.72,ty);c.lineTo(-hw*.82,ty);c.stroke();
  }

  // B. SPONSON ALARI (Hangar e baie d'attracco)
  for(const sd of[-1,1]){
   c.fillStyle=hullBase;c.beginPath();
   c.moveTo(-hw*.45,sd*hh*.96);c.lineTo(hw*.14,sd*hh*.96);c.lineTo(hw*.04,sd*hh*.34);c.lineTo(-hw*.45,sd*hh*.34);c.closePath();c.fill();
   c.strokeStyle='#111';c.lineWidth=2;c.stroke();
   // Piastra superiore corazzata
   c.fillStyle=hullLight;c.fillRect(-hw*.38,sd>0?sd*hh*.42:sd*hh*.88,hw*.42,hh*.46);
   c.strokeStyle='#222';c.lineWidth=1;c.strokeRect(-hw*.38,sd>0?sd*hh*.42:sd*hh*.88,hw*.42,hh*.46);
   // Strisce identificative d'emergenza arancioni (Terran)
   c.fillStyle=armorOrange;c.fillRect(-hw*.32,sd>0?sd*hh*.9-6:sd*hh*.9,hw*.32,6);
   // Portellone d'imbarco / Hangar con chevron di pericolo
   c.fillStyle='#12161b';c.fillRect(-hw*.05,sd>0?sd*hh*.5:sd*hh*.8,32,18);
   c.strokeStyle='#e6b422';c.lineWidth=2;c.setLineDash([5,5]);c.strokeRect(-hw*.05,sd>0?sd*hh*.5:sd*hh*.8,32,18);c.setLineDash([]);
  }
  // Sezione ala destra aperta con telaio a tralicci a vista (in costruzione)
  c.strokeStyle='#ca8a04';c.lineWidth=2.5;c.beginPath();
  for(let gx=-hw*.38;gx<=hw*.08;gx+=16){c.moveTo(gx,hh*.42);c.lineTo(gx+8,hh*.92);c.moveTo(gx+8,hh*.42);c.lineTo(gx,hh*.92)}c.stroke();

  // C. FUSOLIERA E COLONNA CENTRALE (Dettagli tecnici degli edifici)
  c.fillStyle=hullBase;c.fillRect(-hw*.54,-hh*.33,hw*1.06,hh*.66);
  c.strokeStyle='#111';c.lineWidth=2;c.strokeRect(-hw*.54,-hh*.33,hw*1.06,hh*.66);
  // Pannellatura della corazza a blocchi (linee di giunzione a 90°)
  c.strokeStyle='rgba(0,0,0,0.45)';c.lineWidth=1.2;c.beginPath();
  for(let px=-hw*.46;px<=hw*.4;px+=45){c.moveTo(px,-hh*.33);c.lineTo(px,hh*.33)}
  c.moveTo(-hw*.54,0);c.lineTo(hw*.52,0);c.stroke();
  // Rivetti metallici lungo le giunture
  c.fillStyle='rgba(255,255,255,0.22)';
  for(let px=-hw*.44;px<=hw*.38;px+=45){circle(px,-hh*.3,1.3);circle(px,hh*.3,1.3);circle(px,0,1.3)}

  // Dettaglio edificio 1: Griglie radiatori termici blu (stile pannelli solari v==1)
  const cw=14,ch=9;
  c.fillStyle='#223e63';c.strokeStyle='#7ba5d9';c.lineWidth=.8;c.beginPath();
  for(let r=0;r<2;r++)for(let col=0;col<4;col++){
   c.rect(-hw*.48+col*cw+2,-hh*.28+r*ch+1,cw-3,ch-2);
   c.rect(-hw*.48+col*cw+2,hh*.14+r*ch+1,cw-3,ch-2);
  }
  c.fill();c.stroke();

  // Dettaglio edificio 2: Climatizzatori / Turbine di sfogo circolari (stile v==2)
  for(const[vx,vy]of[[-hw*.12,-hh*.2],[hw*.15,-hh*.2],[-hw*.12,hh*.2],[hw*.15,hh*.2]]){
   c.fillStyle='rgba(0,0,0,.35)';circle(vx+1,vy+1,8);
   c.fillStyle='#6c7582';circle(vx,vy,8);c.strokeStyle='#21262d';c.lineWidth=1;c.stroke();
   c.fillStyle='#1d2127';circle(vx,vy,4);
   c.beginPath();c.moveTo(vx-6,vy);c.lineTo(vx+6,vy);c.moveTo(vx,vy-6);c.lineTo(vx,vy+6);c.stroke();
  }

  // D. PONTE DI COMANDO ELEVATO (Torre Terran multi-livello)
  c.fillStyle='#19202a';c.fillRect(-hw*.18,-hh*.13,54,hh*.26);
  c.strokeStyle='#424f60';c.lineWidth=1.5;c.strokeRect(-hw*.18,-hh*.13,54,hh*.26);
  c.fillStyle=hullLight;c.fillRect(-hw*.15,-hh*.08,44,hh*.16); // piano superiore
  c.fillStyle='#00f0ff';c.fillRect(-hw*.12,-hh*.05,7,hh*.1); // vetrata olografica comando
  // Cupola radar/sensori (stile DECO type 3)
  c.fillStyle='#d2d8e0';circle(-hw*.03,0,5.5);c.strokeStyle='#111';c.lineWidth=1;c.stroke();
  // Traliccio telecomunicazioni con spia rossa d'ostacolo (stile DECO type 6)
  c.strokeStyle='#ff2222';c.lineWidth=2;circle(-hw*.14,0,2.5);

  // E. PRUA A MARTELLO (Yamato Bow)
  c.fillStyle=hullBase;c.beginPath();
  c.moveTo(hw*.34,-hh*.72);c.lineTo(hw*.93,-hh*.72);c.lineTo(hw*.84,-hh*.18);c.lineTo(hw*.7,0);
  c.lineTo(hw*.84,hh*.18);c.lineTo(hw*.93,hh*.72);c.lineTo(hw*.34,hh*.72);c.closePath();c.fill();
  c.strokeStyle='#111';c.lineWidth=2;c.stroke();
  // Piastre corazzate superiori angolate sulla prua
  c.fillStyle=hullLight;c.fillRect(hw*.42,-hh*.62,hw*.33,22);c.fillRect(hw*.42,hh*.62-22,hw*.33,22);
  c.strokeStyle='#222';c.lineWidth=1;c.strokeRect(hw*.42,-hh*.62,hw*.33,22);c.strokeRect(hw*.42,hh*.62-22,hw*.33,22);
  c.fillStyle=armorOrange;c.fillRect(hw*.48,-hh*.62,10,22);c.fillRect(hw*.48,hh*.62-22,10,22); // insegne

  // Cannone Yamato centrale con bobine magnetiche e camera al plasma
  c.fillStyle='#0c1015';c.beginPath();c.arc(hw*.68,0,28,-Math.PI/2,Math.PI/2);c.closePath();c.fill();c.stroke();
  c.strokeStyle='#38bdf8';c.lineWidth=2;c.beginPath();c.arc(hw*.68,0,20,-Math.PI/2,Math.PI/2);c.stroke(); // anello bobina
  c.fillStyle='#ff6600';circle(hw*.64,0,9);
  c.fillStyle='#ffea00';circle(hw*.64,0,4.5); // nucleo energetico carico

  // 3. SCINTILLE DI SALDATURA ANIMATE LUNGO I TRALICCI APERTI
  const sparks=[[hw*.56,-hh*.46],[0,hh*.66],[-hw*.14,-hh*.2],[hw*.16,hh*.22],[-hw*.36,hh*.65]];
  for(let s=0;s<sparks.length;s++){
   const sp=sparks[s],active=Math.sin(now/80+s*2.7)>0.25;
   if(active){
    c.fillStyle='#ffffff';circle(sp[0],sp[1],4.5);
    c.fillStyle='#70d6ff';circle(sp[0],sp[1],9);
    c.strokeStyle='#ffffff';c.lineWidth=1.5;
    for(let k=0;k<4;k++){const ang=(now/35+k*Math.PI/2);c.beginPath();c.moveTo(sp[0],sp[1]);c.lineTo(sp[0]+Math.cos(ang)*12,sp[1]+Math.sin(ang)*12);c.stroke()}
   }
  }
 }
 else if(t=='hatch'){
  // Portello silo ICBM: tronco di piramide basso
  const face=(p,sh)=>{c.beginPath();p.forEach((q,i)=>i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]));c.closePath();c.fillStyle='#3a3f46';c.fill();c.fillStyle=sh;c.fill()};
  c.fillStyle='#2a2e34';c.fillRect(-hw,-hh,o.w,o.h);
  const a2=hw*.55,b2=hh*.55,a3=hw*.28,b3=hh*.28;
  face([[-hw,-hh],[hw,-hh],[a2,-b2],[-a2,-b2]],'rgba(255,255,255,.08)');
  face([[-hw,-hh],[-a2,-b2],[-a2,b2],[-hw,hh]],'rgba(255,255,255,.03)');
  face([[hw,-hh],[hw,hh],[a2,b2],[a2,-b2]],'rgba(0,0,0,.18)');
  face([[-hw,hh],[-a2,b2],[a2,b2],[hw,hh]],'rgba(0,0,0,.28)');
  c.fillStyle='#4a515a';c.fillRect(-a2,-b2,a2*2,b2*2);
  c.fillStyle='#2c3138';c.fillRect(-a3,-b3,a3*2,b3*2);
  c.strokeStyle='#111';c.lineWidth=2.5;c.strokeRect(-hw,-hh,o.w,o.h);c.strokeRect(-a2,-b2,a2*2,b2*2);c.strokeRect(-a3,-b3,a3*2,b3*2);
  c.strokeStyle='#e6b422';c.lineWidth=2;c.beginPath();c.moveTo(-a3*.7,0);c.lineTo(a3*.7,0);c.moveTo(0,-b3*.7);c.lineTo(0,b3*.7);c.stroke();
  c.fillStyle='#c9a227';for(const[sx,sy]of[[-1,-1],[1,-1],[1,1],[-1,1]]){c.beginPath();c.arc(sx*a3*.75,sy*b3*.75,2.2,0,TAU);c.fill()}
  if(lod>=1){c.strokeStyle='rgba(0,0,0,.35)';c.lineWidth=1.2;c.beginPath();for(let u=-hw+10;u<hw;u+=14){c.moveTo(u,-hh);c.lineTo(u,hh)}c.stroke()}
 }
 else if(t=='radar'){
  // Antenna radar satellitare
  const R0=Math.min(hw,hh);
  c.fillStyle='#000';c.beginPath();c.arc(0,0,R0+3,0,TAU);c.fill();
  c.fillStyle='#4a5560';c.beginPath();c.arc(0,0,R0,0,TAU);c.fill();
  c.fillStyle='#6a7785';c.beginPath();c.arc(0,0,R0*.88,0,TAU);c.fill();
  if(lod>=1){c.strokeStyle='rgba(0,0,0,.35)';c.lineWidth=1.4;c.beginPath();
   for(let i=0;i<8;i++){const a=i*TAU/8;c.moveTo(0,0);c.lineTo(Math.cos(a)*R0*.86,Math.sin(a)*R0*.86)}
   for(const k of[.35,.55,.75]){c.moveTo(R0*k,0);c.arc(0,0,R0*k,0,TAU)}c.stroke()}
  c.fillStyle='#2a3038';c.beginPath();c.arc(0,0,R0*.16,0,TAU);c.fill();
  c.fillStyle='#e6b422';c.beginPath();c.arc(0,0,R0*.07,0,TAU);c.fill();
  c.fillStyle='#3d4650';c.fillRect(-R0*.14,R0*.35,R0*.28,R0*.55);
  c.strokeStyle='#111';c.lineWidth=2;c.strokeRect(-R0*.14,R0*.35,R0*.28,R0*.55);
  c.fillStyle='#555e68';c.fillRect(-R0*.22,R0*.85,R0*.44,R0*.18);
  c.strokeStyle='#8a949e';c.lineWidth=3;c.beginPath();c.moveTo(0,R0*.1);c.lineTo(0,-R0*.55);c.stroke();
  c.fillStyle='#c0392b';c.beginPath();c.arc(0,-R0*.55,4,0,TAU);c.fill();
 }
 if(f<.95)crack(o,f,hw*.8,hh*.8);c.restore()}

// ===== 3) veicoli, barche, scene =====
// ===== piccoli attrezzi di disegno =====
const SHD='rgba(0,0,0,.3)';
const shade=(c,k)=>{const t=k<0?0:255;return rgbs(mixc(hex(c),[t,t,t],Math.abs(k)))};   // k>0 schiarisce, k<0 scurisce (c = '#rrggbb')
const fR=(g,x,y,w,h,c)=>{g.fillStyle=c;g.fillRect(x,y,w,h)};
const fC=(g,x,y,r,c)=>{g.fillStyle=c;g.beginPath();g.arc(x,y,r,0,TAU);g.fill()};
const fE=(g,x,y,rx,ry,c,a)=>{g.fillStyle=c;g.beginPath();g.ellipse(x,y,rx,ry,a||0,0,TAU);g.fill()};
const fP=(g,pts,c,ln)=>{g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.closePath();g.fillStyle=c;g.fill();if(ln){g.strokeStyle=ln;g.lineWidth=1;g.stroke()}};
const sL=(g,pts,c,w)=>{g.strokeStyle=c;g.lineWidth=w||1;g.beginPath();pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.stroke()};
const sh2=(g,x,y,w,h)=>{g.fillStyle=SHD;g.fillRect(x+2,y+3,w,h)};   // ombra rettangolare
const wheel=(g,x,y,w,h)=>{fR(g,x-w/2,y-h/2,w,h,'#111')};
const MIL_COL=['#556b2f','#4a5d23','#6b7b3a','#5d6b4a','#6a6f55'],DES_COL=['#a89870','#9c8c64','#b3a47a'],GRY_COL=['#6b7580','#5b6570','#7a838c'];
const IND_COL=['#f1c40f','#e67e22','#d4ac0d','#e8e8e8','#2e86c1','#c0392b'];
// ===== registro dei disegni =====
const VEH={};
function veh(g,k,x,y,a,col,s,o){const d=VEH[k];if(!d)return;g.save();g.translate(x,y);g.rotate(a||0);if(s&&s!==1)g.scale(s,s);d(g,col||'#7f8c8d',o||{});g.restore()}
// ---------- carri armati e veicoli militari ----------
VEH.mbt=(g,c)=>{g.fillStyle=SHD;g.fillRect(-15,-8,36,22);
 fR(g,-19,-11,38,6,'#1c1e21');fR(g,-19,5,38,6,'#1c1e21');g.strokeStyle='rgba(255,255,255,.14)';g.lineWidth=1;g.beginPath();for(let x=-18;x<19;x+=3){g.moveTo(x,-11);g.lineTo(x,-5);g.moveTo(x,5);g.lineTo(x,11)}g.stroke();
 fR(g,-17,-7,34,14,c);fP(g,[[17,-7],[21,-4],[21,4],[17,7]],shade(c,.12));fR(g,-17,-6,8,12,shade(c,-.28));g.strokeStyle='rgba(0,0,0,.4)';g.beginPath();for(let y=-4;y<=4;y+=2){g.moveTo(-16,y);g.lineTo(-10,y)}g.stroke();
 g.save();g.translate(-2,0);fP(g,[[-8,-5],[-4,-8],[6,-7],[9,-3],[9,3],[6,7],[-4,8],[-8,5]],shade(c,.1),'rgba(0,0,0,.45)');
 fR(g,8,-1.3,22,2.6,'#2a2e33');fR(g,28,-2.2,4,4.4,'#1a1d20');fC(g,-2,-3,2.4,'#14161a');fC(g,-2,-3,1.3,shade(c,-.4));fR(g,-8,3,5,2,'#14161a');g.restore()};
VEH.heavy=(g,c)=>{g.fillStyle=SHD;g.fillRect(-20,-12,46,28);
 fR(g,-24,-15,48,8,'#18191c');fR(g,-24,7,48,8,'#18191c');g.strokeStyle='rgba(255,255,255,.13)';g.lineWidth=1;g.beginPath();for(let x=-23;x<24;x+=3.2){g.moveTo(x,-15);g.lineTo(x,-7);g.moveTo(x,7);g.lineTo(x,15)}g.stroke();
 fR(g,-22,-10,44,20,c);fP(g,[[22,-10],[27,-6],[27,6],[22,10]],shade(c,.12));fR(g,-22,-8,10,16,shade(c,-.3));
 fR(g,-6,-12,3,5,shade(c,-.15));fR(g,-6,7,3,5,shade(c,-.15));   // pannelli laterali
 g.save();g.translate(-3,0);fP(g,[[-11,-7],[-6,-11],[8,-10],[13,-5],[13,5],[8,10],[-6,11],[-11,7]],shade(c,.1),'rgba(0,0,0,.5)');
 fR(g,12,-5.5,26,3,'#262a2e');fR(g,12,2.5,26,3,'#262a2e');fR(g,36,-6.2,4,4.4,'#15171a');fR(g,36,1.8,4,4.4,'#15171a');fC(g,-4,0,4,'#14161a');fC(g,-4,0,2.2,shade(c,-.4));g.restore()};
VEH.scout=(g,c)=>{g.fillStyle=SHD;g.fillRect(-12,-6,28,16);
 for(const x of[-9,0,9])for(const y of[-8,8])wheel(g,x,y,7,3.4);
 fR(g,-13,-6,27,12,c);fP(g,[[14,-6],[18,-3],[18,3],[14,6]],shade(c,.1));fR(g,-12,-5,6,10,shade(c,-.25));
 g.save();g.translate(1,0);fC(g,0,0,5.5,shade(c,.1));g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=1;g.stroke();fR(g,3,-.9,13,1.8,'#2a2e33');fC(g,-1.5,-2,1.6,'#14161a');g.restore()};
VEH.spg=(g,c)=>{g.fillStyle=SHD;g.fillRect(-18,-9,42,24);
 fR(g,-21,-11,42,6,'#1c1e21');fR(g,-21,5,42,6,'#1c1e21');g.strokeStyle='rgba(255,255,255,.13)';g.lineWidth=1;g.beginPath();for(let x=-20;x<21;x+=3){g.moveTo(x,-11);g.lineTo(x,-5);g.moveTo(x,5);g.lineTo(x,11)}g.stroke();
 fR(g,-19,-7,38,14,c);fR(g,-19,-6,8,12,shade(c,-.28));
 g.save();g.translate(-5,0);fR(g,-10,-8,22,16,shade(c,.1));g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=1;g.strokeRect(-10,-8,22,16);fR(g,11,-1.8,30,3.6,'#2a2e33');fR(g,38,-2.8,5,5.6,'#15171a');fR(g,5,-3,6,6,shade(c,-.2));fC(g,-5,0,3,'#14161a');g.restore()};
VEH.sam=(g,c)=>{g.fillStyle=SHD;g.fillRect(-20,-8,44,22);
 for(const x of[-15,-6,12,20])for(const y of[-9,9])wheel(g,x,y,8,3.6);
 fR(g,-21,-7,43,14,c);fR(g,12,-6,9,12,shade(c,.12));fR(g,14,-4.5,5,4,'#223');fR(g,-21,-6,6,12,shade(c,-.25));
 g.save();g.translate(-3,0);fR(g,-10,-7,26,14,'#3a3f45');g.strokeStyle='#1c1f22';g.lineWidth=1;g.strokeRect(-10,-7,26,14);
 for(const y of[-4.8,-1.6,1.6,4.8]){fR(g,-9,y-1.2,25,2.4,'#aab2b9');fP(g,[[16,y-1.2],[20,y],[16,y+1.2]],'#c0392b')}g.restore()};
VEH.apc=(g,c)=>{g.fillStyle=SHD;g.fillRect(-15,-8,32,19);
 for(const x of[-10,-3.5,3.5,10])for(const y of[-9,9])wheel(g,x,y,6,3.4);
 fR(g,-16,-8,33,16,c);fP(g,[[17,-8],[21,-5],[21,5],[17,8]],shade(c,.12));fR(g,-15,-7,9,14,shade(c,-.22));fR(g,-3,-6,13,12,shade(c,.08));g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=1;g.strokeRect(-3,-6,13,12);
 fC(g,4,0,3,'#14161a');fR(g,5,-.7,9,1.4,'#2a2e33');fC(g,-8,-3,1.8,'#14161a')};
VEH.hover=(g,c)=>{g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.ellipse(3,4,20,12,0,0,TAU);g.fill();   // carro antigravità cyberpunk
 g.fillStyle='rgba(0,229,255,.18)';g.beginPath();g.ellipse(0,0,22,13,0,0,TAU);g.fill();
 fP(g,[[22,0],[10,-9],[-14,-11],[-19,-6],[-19,6],[-14,11],[10,9]],c,'rgba(0,0,0,.5)');fP(g,[[-14,-8],[-4,-6],[-4,6],[-14,8]],shade(c,-.3));
 for(const y of[-12,12]){fR(g,-18,y-2,12,4,'#2c3e50');fR(g,-20,y-1.4,3,2.8,'#00e5ff')}
 fE(g,3,0,8,6,shade(c,.15));g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=1;g.beginPath();g.ellipse(3,0,8,6,0,0,TAU);g.stroke();fR(g,9,-1,17,2,'#25292d');fC(g,-1,0,2.4,'#00e5ff')};
// ---------- camion e veicoli civili/industriali ----------
const cab=(g,x,c,w)=>{fR(g,x,-w/2,9,w,c);fR(g,x+5,-w/2+1.5,3.4,w-3,'rgba(20,30,40,.75)');fR(g,x+8.4,-w/2+1,.8,2,'#ffe9a0');fR(g,x+8.4,w/2-3,.8,2,'#ffe9a0')};
VEH.army=(g,c)=>{sh2(g,-19,-6.5,38,13);fR(g,-19,-6.5,27,13,'#3c4631');for(let x=-17;x<7;x+=4)fR(g,x,-6,2,12,c);fR(g,-19,-6.5,27,1.4,'rgba(0,0,0,.3)');cab(g,9,c,13);wheel(g,-12,-7.5,7,2.4);wheel(g,-12,7.5,7,2.4);wheel(g,13,-7.5,6,2.4);wheel(g,13,7.5,6,2.4)};
VEH.hauler=(g,c,o)=>{sh2(g,-24,-7,48,14);const cc=o.cc||CONT_COL[(hs(c.length,3,DC.seed)*CONT_COL.length)|0];fR(g,-24,-7.5,34,15,'#2a2d31');fR(g,-23,-7,32,14,cc);g.strokeStyle='rgba(0,0,0,.28)';g.lineWidth=1;g.beginPath();for(let x=-21;x<9;x+=2.6){g.moveTo(x,-7);g.lineTo(x,7)}g.stroke();fR(g,-23,-7,32,1.5,shade(cc,.18));cab(g,11,c,13);wheel(g,-17,-7.5,7,2.4);wheel(g,-17,7.5,7,2.4);wheel(g,-9,-7.5,7,2.4);wheel(g,-9,7.5,7,2.4);wheel(g,15,-7.5,6,2.4);wheel(g,15,7.5,6,2.4)};
VEH.tanker=(g,c)=>{sh2(g,-22,-7,44,14);fR(g,-22,-6,30,12,'#2a2d31');g.fillStyle='#cfd5da';g.beginPath();g.ellipse(-7,0,15,6.4,0,0,TAU);g.fill();g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1;g.stroke();
 fE(g,-7,-1.6,13,2,'rgba(255,255,255,.55)');for(const x of[-14,-7,0]){g.strokeStyle='rgba(0,0,0,.18)';g.beginPath();g.moveTo(x,-6.2);g.lineTo(x,6.2);g.stroke()}fR(g,-9,-6.4,4,12.8,c);fC(g,-1,0,1.8,'#555');cab(g,9,c,13);wheel(g,-15,-7,7,2.4);wheel(g,-15,7,7,2.4);wheel(g,-8,-7,7,2.4);wheel(g,-8,7,7,2.4);wheel(g,13,-7,6,2.4);wheel(g,13,7,6,2.4)};
VEH.dumper=(g,c)=>{sh2(g,-20,-8,40,16);fR(g,-20,-8,28,16,'#3b3f44');fR(g,-18.5,-6.5,25,13,shade(c,-.15));g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=1.3;g.beginPath();for(let x=-14;x<6;x+=5){g.moveTo(x,-6.5);g.lineTo(x,6.5)}g.stroke();fR(g,-18.5,-6.5,25,1.6,shade(c,.2));cab(g,9,c,14);wheel(g,-13,-8.5,9,3);wheel(g,-13,8.5,9,3);wheel(g,14,-8.5,8,3);wheel(g,14,8.5,8,3)};
VEH.mixer=(g,c)=>{sh2(g,-19,-7,38,14);fR(g,-19,-6,26,12,'#2a2d31');g.fillStyle='#d9d9d2';g.beginPath();g.moveTo(-18,-6);g.lineTo(2,-5);g.lineTo(2,5);g.lineTo(-18,6);g.closePath();g.fill();g.strokeStyle=c;g.lineWidth=2;g.beginPath();for(let x=-16;x<2;x+=4){g.moveTo(x,-5.5);g.lineTo(x+3,5.5)}g.stroke();fC(g,2.5,0,2.4,'#555');cab(g,8,c,13);wheel(g,-13,-7,7,2.4);wheel(g,-13,7,7,2.4);wheel(g,-5,-7,7,2.4);wheel(g,-5,7,7,2.4);wheel(g,12,-7,6,2.4);wheel(g,12,7,6,2.4)};
VEH.bus=(g,c)=>{sh2(g,-23,-7,46,14);fR(g,-23,-6.5,46,13,c);fR(g,-22,-5.2,43,10.4,shade(c,.15));g.fillStyle='rgba(15,25,38,.82)';for(let x=-20;x<18;x+=7)g.fillRect(x,-5.6,5.5,2);for(let x=-20;x<18;x+=7)g.fillRect(x,3.6,5.5,2);fR(g,19,-5.6,3.4,11.2,'rgba(15,25,38,.82)');fR(g,-18,-2,9,4,'#d8dde1');fR(g,0,-2,9,4,'#d8dde1');fR(g,22,-5,.9,2,'#ffe9a0');fR(g,22,3,.9,2,'#ffe9a0');fR(g,-23,-5,.9,2,'#ff4040');fR(g,-23,3,.9,2,'#ff4040')};
VEH.van=(g,c)=>{sh2(g,-13,-6,26,12);fR(g,-13,-6,26,12,c);fR(g,-12,-5,17,10,shade(c,.12));fR(g,6,-5,6,10,'rgba(15,25,38,.8)');fR(g,12,-5,.9,2,'#ffe9a0');fR(g,12,3,.9,2,'#ffe9a0');fR(g,-13,-5,.9,2,'#ff4040');fR(g,-13,3,.9,2,'#ff4040');fR(g,-5,-4,6,8,'rgba(255,255,255,.12)')};
VEH.pickup=(g,c)=>{sh2(g,-14,-6,28,12);fR(g,-14,-6,28,12,c);fR(g,-13,-5,12,10,'#3a3d40');fR(g,-13,-5,12,1.2,'#555');fR(g,0,-5.4,9,10.8,shade(c,.1));fR(g,3,-4.6,4,9.2,'rgba(15,25,38,.8)');fR(g,13,-5,.9,2,'#ffe9a0');fR(g,13,3,.9,2,'#ffe9a0');fR(g,-14,-5,.9,2,'#ff4040');fR(g,-14,3,.9,2,'#ff4040')};
VEH.jeep=(g,c)=>{sh2(g,-9,-5,19,10);fR(g,-9,-5,19,10,c);fR(g,-8,-4,7,8,shade(c,-.2));fR(g,0,-4.4,5,8.8,'rgba(15,25,38,.7)');fR(g,5,-4,4,8,shade(c,.1));fC(g,-4,0,2.2,'#222');fR(g,-3,-.5,5,1,'#2a2e33');wheel(g,-5,-5.4,4,1.8);wheel(g,-5,5.4,4,1.8);wheel(g,5,-5.4,4,1.8);wheel(g,5,5.4,4,1.8)};
VEH.taxi=(g,c)=>{car(g,0,0,0,c||'#f1c40f',24,11);fR(g,-2,-2,4,4,'#fff');};
VEH.forklift=(g,c)=>{sh2(g,-8,-5,15,10);fR(g,-8,-4.5,12,9,c);fR(g,-4,-3,6,6,'rgba(20,30,40,.8)');fR(g,-8,-4.5,3,9,'#333');fR(g,4,-4,2,8,'#333');fR(g,6,-3.5,10,1.4,'#999');fR(g,6,2.1,10,1.4,'#999');wheel(g,-4,-5,4,1.8);wheel(g,-4,5,4,1.8);wheel(g,2,-5,4,1.8);wheel(g,2,5,4,1.8)};
VEH.tug=(g,c)=>{sh2(g,-9,-5,18,10);fR(g,-9,-5,18,10,c);fR(g,0,-4,7,8,'rgba(20,30,40,.75)');fR(g,-9,-5,4,10,shade(c,-.25));wheel(g,-4,-5.3,5,2);wheel(g,-4,5.3,5,2);wheel(g,5,-5.3,5,2);wheel(g,5,5.3,5,2);fR(g,-12,-1,3,2,'#555')};
VEH.excav=(g,c,o)=>{const ar=o.arm==null?0:o.arm;g.fillStyle=SHD;g.fillRect(-10,-7,24,18);fR(g,-12,-9,24,5,'#1c1e21');fR(g,-12,4,24,5,'#1c1e21');g.strokeStyle='rgba(255,255,255,.12)';g.lineWidth=1;g.beginPath();for(let x=-11;x<12;x+=3){g.moveTo(x,-9);g.lineTo(x,-4);g.moveTo(x,4);g.lineTo(x,9)}g.stroke();
 g.save();g.rotate(ar*.5);fR(g,-9,-6,16,12,c);fR(g,-9,-6,5,12,shade(c,-.25));fR(g,1,-5,5,8,'rgba(20,30,40,.8)');g.strokeStyle=shade(c,-.3);g.lineWidth=3.2;g.beginPath();g.moveTo(6,0);g.lineTo(16,-3);g.lineTo(24,2);g.stroke();fP(g,[[23,-1],[28,0],[28,5],[22,5]],'#555');g.restore()};
VEH.dozer=(g,c)=>{g.fillStyle=SHD;g.fillRect(-11,-8,26,19);fR(g,-12,-10,26,5,'#1c1e21');fR(g,-12,5,26,5,'#1c1e21');fR(g,-8,-6,17,12,c);fR(g,-1,-4.5,6,9,'rgba(20,30,40,.8)');fR(g,-8,-6,4,12,shade(c,-.25));fR(g,13,-11,4,22,'#8a8f94');fR(g,13,-11,1.2,22,'#bbb');sL(g,[[9,-8],[13,-9]],'#444',1.6);sL(g,[[9,8],[13,9]],'#444',1.6)};
VEH.roller=(g,c)=>{sh2(g,-12,-7,25,14);fR(g,-12,-6,8,12,'#555');fR(g,6,-6,8,12,'#555');fR(g,-4,-5,10,10,c);fR(g,-2,-3,5,6,'rgba(20,30,40,.8)');g.strokeStyle='rgba(255,255,255,.2)';g.lineWidth=1;g.beginPath();g.moveTo(-12,0);g.lineTo(-4,0);g.moveTo(6,0);g.lineTo(14,0);g.stroke()};
VEH.mcrane=(g,c,o)=>{const ar=o.arm==null?0:o.arm;sh2(g,-22,-7,44,14);fR(g,-22,-6,44,12,'#34383d');for(const x of[-17,-6,15])for(const y of[-1,1])wheel(g,x,y*7.5,7,2.6);
 for(const x of[-17,13])for(const y of[-1,1]){sL(g,[[x,y*6],[x,y*12]],'#d35400',2);fR(g,x-2,y*12-1.5,4,3,'#222')}   // stabilizzatori
 fR(g,10,-5.4,10,10.8,c);fR(g,15,-4.4,4,8.8,'rgba(20,30,40,.8)');fR(g,-18,-5,22,10,shade(c,-.1));
 g.save();g.translate(-4,0);g.rotate(ar);fC(g,0,0,4.5,'#555');sL(g,[[0,0],[36,0]],c,3.2);g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=.8;g.beginPath();for(let x=2;x<36;x+=4){g.moveTo(x,-1.6);g.lineTo(x+2,1.6)}g.stroke();fC(g,36,0,1.6,'#222');sL(g,[[36,0],[36,5]],'#111',.8);fR(g,34.5,5,3,3,'#e6b422');g.restore()};
// ---------- agricoltura ----------
VEH.tractor=(g,c)=>{sh2(g,-11,-9,22,18);fR(g,-13,-10,11,4.4,'#111');fR(g,-13,5.6,11,4.4,'#111');fR(g,5,-7.5,6,3,'#111');fR(g,5,4.5,6,3,'#111');fR(g,-9,-4.2,19,8.4,c);fR(g,-8,-3,7,6,'rgba(20,30,40,.7)');fR(g,2,-2.4,8,4.8,shade(c,-.2));fC(g,10,0,1.7,'#333')};
VEH.trailer=(g,c,o)=>{sh2(g,-13,-7,26,14);fR(g,-13,-7,26,14,'#3a3d40');fR(g,-12,-6,24,12,o.load||'#c9a227');g.strokeStyle='rgba(0,0,0,.25)';g.lineWidth=1;g.beginPath();for(let x=-9;x<12;x+=4){g.moveTo(x,-6);g.lineTo(x,6)}g.stroke();fR(g,-9,-8,5,2,'#111');fR(g,-9,6,5,2,'#111');fR(g,13,-.6,6,1.2,'#444')};
VEH.plow=(g,c)=>{g.fillStyle=SHD;g.fillRect(-9,-8,14,18);fR(g,-9,-10,5,20,'#444');for(let y=-8;y<=8;y+=4)fP(g,[[-9,y],[-14,y+1.6],[-9,y+3]],'#8a8f94');fR(g,-5,-.8,10,1.6,'#555')};
VEH.combine=(g,c)=>{sh2(g,-16,-12,34,24);fR(g,-18,-14,4,28,'#d8d8d0');for(let y=-13;y<14;y+=3)fR(g,-18,y,4,1.2,'#a33');fR(g,-14,-9,24,18,c);fR(g,-12,-7,14,14,shade(c,.12));fR(g,4,-6,5,12,'rgba(20,30,40,.75)');fR(g,-14,-9,24,2,shade(c,-.25));sL(g,[[-6,-9],[-6,-17]],shade(c,-.3),2.4);wheel(g,6,-10,9,3.4);wheel(g,6,10,9,3.4);wheel(g,-8,-9.6,6,2.6);wheel(g,-8,9.6,6,2.6)};
VEH.quad=(g,c)=>{g.fillStyle=SHD;g.fillRect(-5,-5,11,12);wheel(g,-4,-4.4,4,2.2);wheel(g,-4,4.4,4,2.2);wheel(g,4,-4.4,4,2.2);wheel(g,4,4.4,4,2.2);fR(g,-5,-2.4,11,4.8,c);fR(g,-3,-1.4,4,2.8,'#222')};
// ---------- navicelle ----------
VEH.drop=(g,c)=>{g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.ellipse(4,6,28,15,0,0,TAU);g.fill();   // dropship a due motori
 for(const y of[-1,1]){fR(g,-8,y*18-4,26,8,shade(c,-.2));fC(g,19,y*18,4.2,'#14181c');fC(g,19,y*18,2.4,'#00e5ff');fR(g,-10,y*18-2.6,3,5.2,'#ff7a1a');fP(g,[[-4,y*8],[8,y*17-(y>0?-2:2)],[8,y*13],[-4,y*5]],shade(c,-.1))}
 fP(g,[[28,0],[20,-6],[-6,-8.5],[-18,-6],[-22,-3],[-22,3],[-18,6],[-6,8.5],[20,6]],c,'rgba(0,0,0,.5)');
 fP(g,[[26,0],[19,-4.4],[12,-4.4],[12,4.4],[19,4.4]],'rgba(120,200,235,.85)','rgba(0,0,0,.4)');
 fR(g,-22,-4,9,8,shade(c,-.25));sL(g,[[-16,-4],[-16,4]],'rgba(0,0,0,.5)',1);fR(g,-4,-1,12,2,shade(c,.18));fC(g,-8,0,2.4,shade(c,-.3))};
VEH.fighter=(g,c)=>{g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.moveTo(26,3);g.lineTo(-14,21);g.lineTo(-10,3);g.lineTo(-14,-15);g.fill();
 fP(g,[[26,0],[-4,-5],[-17,-19],[-21,-18],[-12,-4],[-16,-3],[-16,3],[-12,4],[-21,18],[-17,19],[-4,5]],c,'rgba(0,0,0,.5)');
 fP(g,[[20,0],[11,-3],[6,-3],[6,3],[11,3]],'rgba(120,200,235,.85)');fR(g,-18,-2.6,5,5.2,'#2c3e50');fR(g,-21,-1.8,3,3.6,'#00e5ff');for(const y of[-12,12])fR(g,-12,y-1,8,2,shade(c,-.3))};
VEH.shuttle=(g,c)=>{g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.moveTo(26,3);g.lineTo(-17,22);g.lineTo(-17,-16);g.fill();
 fP(g,[[26,0],[-12,-20],[-18,-20],[-18,20],[-12,20]],c,'rgba(0,0,0,.5)');fR(g,-19,-6,8,12,'#2c3e50');fR(g,-22,-4,4,8,'#00e5ff');
 fP(g,[[19,0],[10,-4],[4,-4],[4,4],[10,4]],'rgba(120,200,235,.85)');sL(g,[[-12,0],[10,0]],shade(c,-.3),1.4);fR(g,-8,-12,6,3,shade(c,.2));fR(g,-8,9,6,3,shade(c,.2))};
VEH.gunship=(g,c)=>{g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.ellipse(3,5,26,14,0,0,TAU);g.fill();
 fR(g,-6,-19,14,38,shade(c,-.15));for(const y of[-1,1]){fR(g,8,y*15-1,14,2,'#2a2e33');fR(g,-6,y*13-3,10,6,shade(c,-.3));fC(g,-8,y*17,3.4,'#14181c');fC(g,-8,y*17,2,'#ff7a1a')}
 fP(g,[[28,0],[18,-6],[-12,-7],[-20,-4],[-20,4],[-12,7],[18,6]],c,'rgba(0,0,0,.5)');fP(g,[[22,0],[15,-4],[9,-4],[9,4],[15,4]],'rgba(255,170,70,.85)');fR(g,22,-1,8,2,'#2a2e33');fR(g,-14,-3,10,6,shade(c,-.25))};
VEH.lander=(g,c)=>{g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.ellipse(4,6,30,22,0,0,TAU);g.fill();
 for(const[x,y]of[[-12,-17],[-12,17],[14,-17],[14,17]]){fC(g,x,y,6,'#2a2e33');fC(g,x,y,3.6,'#00e5ff');fC(g,x,y,1.4,'#fff')}
 fP(g,[[26,0],[20,-14],[-14,-14],[-24,-9],[-24,9],[-14,14],[20,14]],c,'rgba(0,0,0,.5)');fR(g,-24,-8,10,16,shade(c,-.3));g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=1;g.beginPath();g.moveTo(-14,-14);g.lineTo(-14,14);g.moveTo(0,-14);g.lineTo(0,14);g.stroke();fP(g,[[24,0],[19,-6],[15,-6],[15,6],[19,6]],'rgba(120,200,235,.85)');fR(g,-10,-9,18,18,shade(c,.1));fR(g,-4,-5,6,10,'#2a2e33')};
VEH.dronepod=(g,c)=>{g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.ellipse(3,5,12,12,0,0,TAU);g.fill();
 for(const[x,y]of[[-8,-8],[8,-8],[-8,8],[8,8]]){sL(g,[[0,0],[x,y]],'#333',2);fC(g,x,y,5.4,'rgba(200,220,235,.55)');g.strokeStyle='#555';g.lineWidth=.8;g.beginPath();g.arc(x,y,5.4,0,TAU);g.stroke()}fC(g,0,0,5,c);fC(g,2,0,2,'#00e5ff')};
// ---------- robot (mech) ----------
VEH.walker=(g,c,o)=>{g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.ellipse(2,4,14,13,0,0,TAU);g.fill();
 for(const y of[-1,1]){fR(g,-6,y*8-2.6,16,5.2,'#2a2e33');fR(g,8,y*8-3.4,5,6.8,'#1a1d20');fR(g,-6,y*8-2.6,16,1.2,shade('#2a2e33',.2))}   // piedi
 fP(g,[[8,-8],[-8,-9],[-12,-4],[-12,4],[-8,9],[8,8],[11,3],[11,-3]],c,'rgba(0,0,0,.5)');
 for(const y of[-1,1]){fR(g,-3,y*10.5-3,9,6,shade(c,-.2));if(!o.arm)fR(g,6,y*10.5-1.1,12,2.2,'#2a2e33')}   // spalle e armi
 fP(g,[[11,0],[5,-3.6],[3,-3.6],[3,3.6],[5,3.6]],'rgba(255,160,40,.9)');fC(g,-5,0,3.4,'#2a2e33');fC(g,-5,0,1.6,'#c0392b')};
VEH.heavymech=(g,c,o)=>{g.fillStyle='rgba(0,0,0,.28)';g.beginPath();g.ellipse(2,5,19,18,0,0,TAU);g.fill();
 for(const y of[-1,1]){fR(g,-9,y*11-3.6,22,7.2,'#25282c');fR(g,11,y*11-4.6,6,9.2,'#17191c')}
 fP(g,[[12,-11],[-10,-12],[-16,-5],[-16,5],[-10,12],[12,11],[15,5],[15,-5]],c,'rgba(0,0,0,.55)');
 for(const y of[-1,1]){fR(g,-5,y*14-4,12,8,shade(c,-.2));if(!o.arm){fR(g,7,y*14-2.4,16,2.4,'#2a2e33');fR(g,7,y*14+.4,16,2.4,'#2a2e33')}}
 fP(g,[[14,0],[7,-4.6],[3,-4.6],[3,4.6],[7,4.6]],'rgba(255,90,60,.9)');fR(g,-12,-5,7,10,shade(c,-.3));fC(g,-6,0,3,'#14161a')};
VEH.spider=(g,c,o)=>{g.fillStyle='rgba(0,0,0,.25)';g.beginPath();g.ellipse(2,4,18,18,0,0,TAU);g.fill();
 g.strokeStyle='#2a2e33';g.lineWidth=2.6;g.lineJoin='round';for(const[sx,sy]of[[1,1],[1,-1],[-1,1],[-1,-1]]){g.beginPath();g.moveTo(sx*4,sy*3);g.lineTo(sx*13,sy*8);g.lineTo(sx*17,sy*16);g.stroke();fC(g,sx*17,sy*16,2,'#111')}
 fE(g,0,0,9,8,c);g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=1;g.beginPath();g.ellipse(0,0,9,8,0,0,TAU);g.stroke();fC(g,4,0,3,'#14161a');fC(g,4.6,0,1.4,'#ff3b3b');if(!o.arm)fR(g,5,-.8,11,1.6,'#2a2e33')};
// ---------- animali (vista dall'alto, rivolti a +x) ----------
VEH.cow=(g,c)=>{g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.ellipse(1.6,2.6,7.4,4.2,0,0,TAU);g.fill();fE(g,0,0,7,3.8,'#f1eee6');fE(g,-2,-1,2.6,1.6,c||'#3a2f2a',.4);fE(g,2.4,1.2,2,1.4,c||'#3a2f2a');fC(g,7.2,0,2.2,'#e9e4d8');fC(g,8.6,0,1.2,'#e7b6b0');fR(g,6,-3,1.2,1.8,'#ddd');fR(g,6,1.2,1.2,1.8,'#ddd');sL(g,[[-7,0],[-10,1.2]],'#2a2420',.9)};
VEH.sheep=(g)=>{g.fillStyle='rgba(0,0,0,.2)';g.beginPath();g.ellipse(1.4,2.2,5,3.6,0,0,TAU);g.fill();fC(g,-1.4,-1,2.6,'#f5f3ee');fC(g,1.4,1.2,2.8,'#efece6');fC(g,-2,1.4,2.4,'#f1eee8');fC(g,1.8,-1.4,2.4,'#f5f3ee');fC(g,4.6,0,1.5,'#3b332e')};
VEH.pig=(g)=>{g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.ellipse(1.6,2.4,5.6,3.4,0,0,TAU);g.fill();fE(g,0,0,5.4,3.2,'#e8a5a0');fC(g,5.4,0,2,'#eaaaa4');fR(g,7,-.8,1.2,1.6,'#c97d78');fE(g,4.6,-2.2,1.3,.9,'#d38d88');fE(g,4.6,2.2,1.3,.9,'#d38d88');sL(g,[[-5.4,0],[-7,1]],'#d38d88',.9)};
VEH.horse=(g,c)=>{g.fillStyle='rgba(0,0,0,.22)';g.beginPath();g.ellipse(1.8,2.8,8.4,3.8,0,0,TAU);g.fill();fE(g,-1,0,7,3.4,c||'#7a4a2a');fE(g,6.6,0,3.6,2,c||'#7a4a2a',.0);fC(g,9.6,0,1.9,c||'#7a4a2a');sL(g,[[3,0],[8,0]],'#2a1a10',1.6);sL(g,[[-8,0],[-12,1.6]],'#2a1a10',1.4)};
VEH.hen=(g,c)=>{fE(g,0,0,2.4,1.7,c||'#f3efe6');fC(g,2.6,0,1.2,c||'#f3efe6');fC(g,3.6,-.2,.5,'#d32f2f')};
// ---------- oggetti ----------
VEH.crate=(g,c)=>{fR(g,-5,-4,10,8,'rgba(0,0,0,.28)');fR(g,-6,-5,10,10,c||'#8a6a3a');g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=1;g.strokeRect(-6,-5,10,10);g.beginPath();g.moveTo(-6,-5);g.lineTo(4,5);g.moveTo(4,-5);g.lineTo(-6,5);g.stroke()};
VEH.crates=(g,c)=>{for(const[x,y,s,k]of[[-6,-5,10,0],[5,-3,9,.1],[-3,6,8,-.1]]){fR(g,x-s/2+2,y-s/2+3,s,s,SHD);fR(g,x-s/2,y-s/2,s,s,shade(c||'#8a6a3a',k));g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=1;g.strokeRect(x-s/2,y-s/2,s,s);g.beginPath();g.moveTo(x-s/2,y-s/2);g.lineTo(x+s/2,y+s/2);g.stroke()}};
VEH.barrel=(g,c)=>{fC(g,1.2,1.8,3.2,SHD);fC(g,0,0,3.2,c||'#c0392b');g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=.8;g.beginPath();g.arc(0,0,3.2,0,TAU);g.stroke();g.beginPath();g.arc(0,0,1.8,0,TAU);g.stroke()};
VEH.barrels=(g,c)=>{for(const[x,y,k]of[[-3.6,-3,0],[3.6,-3,1],[0,3.6,2],[-7.6,3.4,1]])veh(g,'barrel',x,y,0,[c||'#c0392b','#2e86c1','#7f8c8d'][k])};
VEH.pallet=(g,c)=>{fR(g,-7,-6,14,12,'#9a7b4f');g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=.8;g.beginPath();for(let x=-4;x<=4;x+=4){g.moveTo(x,-6);g.lineTo(x,6)}g.stroke();fR(g,-5.4,-4.6,10.8,9.2,c||'#cfc8b8');g.strokeStyle='rgba(0,0,0,.3)';g.strokeRect(-5.4,-4.6,10.8,9.2)};
VEH.cone=(g)=>{fC(g,.8,1.2,2.6,SHD);fR(g,-2.4,-2.4,4.8,4.8,'#444');fC(g,0,0,1.9,'#ff6a1a');fC(g,0,0,.8,'#fff')};
VEH.sandbags=(g,c,o)=>{const n=o.n||5;g.fillStyle='#b8a878';g.strokeStyle='rgba(60,50,30,.55)';g.lineWidth=.8;for(let i=0;i<n;i++){const t=n>1?(i/(n-1)-.5):0,x=t*(o.w||26),y=Math.abs(t)*(o.bend||5);g.beginPath();g.ellipse(x,y,3.4,2.2,t*.8,0,TAU);g.fill();g.stroke()}};
VEH.tent=(g,c)=>{g.fillStyle=SHD;g.fillRect(-9,-7,20,16);fP(g,[[-10,-7],[10,-7],[10,7],[-10,7]],c||'#556b2f');sL(g,[[-10,0],[10,0]],shade(c||'#556b2f',-.35),1.6);g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=.8;g.strokeRect(-10,-7,20,14);fR(g,9,-2,2,4,'#222')};
VEH.booth=(g,c)=>{fR(g,-5,-5,12,12,SHD);fR(g,-6,-6,12,12,c||'#6b7580');fR(g,-5,-5,10,10,shade(c||'#6b7580',.14));fR(g,3,-4,2.6,8,'rgba(20,30,40,.8)');g.strokeStyle='rgba(0,0,0,.4)';g.strokeRect(-6,-6,12,12)};
VEH.boom=(g)=>{fR(g,-2,-2,4,4,'#444');g.fillStyle='#fff';g.fillRect(2,-1,30,2);g.fillStyle='#d32f2f';for(let x=2;x<30;x+=10)g.fillRect(x+4,-1,5,2)};
VEH.dish=(g,c)=>{fC(g,1,1.6,7,SHD);fC(g,0,0,7,'#cfd5da');g.strokeStyle='#6b7580';g.lineWidth=1;g.beginPath();g.arc(0,0,7,0,TAU);g.stroke();g.beginPath();g.arc(0,0,3.6,0,TAU);g.stroke();sL(g,[[0,0],[6,0]],'#444',1);fC(g,6,0,1.1,'#c0392b')};
VEH.mast=(g)=>{fR(g,-3,-3,6,6,SHD);g.strokeStyle='#444';g.lineWidth=1.2;g.strokeRect(-3,-3,6,6);sL(g,[[-3,-3],[3,3]],'#444',1);sL(g,[[3,-3],[-3,3]],'#444',1);fC(g,0,0,1.6,'#fff8c0')};
VEH.gen=(g,c)=>{fR(g,-8,-5,16,10,SHD);fR(g,-9,-6,16,11,c||'#f1c40f');g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=.8;g.strokeRect(-9,-6,16,11);g.beginPath();for(let x=-6;x<5;x+=3){g.moveTo(x,-5);g.lineTo(x,4)}g.stroke();fR(g,3,-5,3,4,'#444')};
VEH.toolcart=(g,c)=>{fR(g,-5,-3,10,8,SHD);fR(g,-6,-4,10,8,c||'#c0392b');fR(g,-5,-3,8,6,'#2a2e33');for(const[x,y]of[[-3,-1],[0,1.4],[2,-1.2]])fR(g,x,y,2.6,1,'#bbb')};
VEH.haybale=(g)=>{fC(g,1.4,2,5.6,SHD);fC(g,0,0,5.4,'#d4b24c');g.strokeStyle='rgba(120,90,20,.55)';g.lineWidth=.8;for(const r of[1.6,3.2,4.8]){g.beginPath();g.arc(0,0,r,0,TAU);g.stroke()}};
VEH.haysq=(g)=>{fR(g,-5,-4,12,9,SHD);fR(g,-6,-5,12,9,'#d4b24c');g.strokeStyle='rgba(120,90,20,.6)';g.lineWidth=.8;g.strokeRect(-6,-5,12,9);sL(g,[[-2,-5],[-2,4]],'#6b5a2a',.8);sL(g,[[2,-5],[2,4]],'#6b5a2a',.8)};
VEH.trough=(g)=>{fR(g,-7,-2,14,5,SHD);fR(g,-8,-3,14,5,'#6b5a3a');fR(g,-7,-2,12,3,'#3f87ad')};
VEH.log=(g,c)=>{fR(g,-9,-2.4,19,5.2,SHD);fR(g,-10,-3,19,5,c||'#7a5a36');fC(g,-10,-.5,2.5,'#cfae7a');fC(g,-10,-.5,1,'#8a6a3e')};
VEH.logs=(g)=>{for(const[x,y]of[[0,-6],[1,-1.2],[-1,3.6],[.4,8.4]])veh(g,'log',x,y,0,['#7a5a36','#6e4f2e','#85633d'][(x*3+y*7|0)&1?1:0])};
VEH.table=(g)=>{fR(g,-6,-3,12,7,SHD);fR(g,-7,-4,12,7,'#8a6a3a');fR(g,-7,-7.6,12,2.4,'#6e5230');fR(g,-7,3.6,12,2.4,'#6e5230');fC(g,-1,-.5,5.6,'rgba(210,60,60,.8)')};
VEH.bench=(g)=>{fR(g,-6,-1.6,12,4,SHD);fR(g,-7,-2.4,12,3.6,'#7a5a36');fR(g,-7,-2.4,12,.9,'#9a7a4c')};
VEH.sunbed=(g,c)=>{fR(g,-5,-2,11,5,SHD);fR(g,-6,-3,11,5,c||'#f4f1e8');fR(g,-6,-3,4,5,shade(c||'#f4f1e8',-.15))};
VEH.parasol=(g,c)=>{fC(g,1.6,2.2,8,SHD);fC(g,0,0,8,c||'#e74c3c');g.strokeStyle='rgba(255,255,255,.5)';g.lineWidth=1;g.beginPath();for(let i=0;i<4;i++){g.moveTo(0,0);g.lineTo(Math.cos(i*Math.PI/4)*8,Math.sin(i*Math.PI/4)*8);g.moveTo(0,0);g.lineTo(-Math.cos(i*Math.PI/4)*8,-Math.sin(i*Math.PI/4)*8)}g.stroke();fC(g,0,0,1,'#333')};
VEH.stall=(g,c,o)=>{const w=o.w||18,h=o.h||12;fR(g,-w/2+2,-h/2+3,w,h,SHD);fR(g,-w/2,-h/2,w,h,'#d8d2c0');g.fillStyle=c||'#e74c3c';for(let x=-w/2;x<w/2-1;x+=4)g.fillRect(x,-h/2,2,h);g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=.8;g.strokeRect(-w/2,-h/2,w,h)};
VEH.shelter=(g)=>{fR(g,-10,-5,22,11,SHD);fR(g,-11,-6,22,11,'rgba(120,160,185,.55)');g.strokeStyle='#4a5560';g.lineWidth=1.2;g.strokeRect(-11,-6,22,11);sL(g,[[-9,2],[9,2]],'#6b7580',1.6)};
VEH.skid=(g)=>{g.strokeStyle='rgba(8,8,10,.4)';g.lineWidth=1.6;for(const y of[-3,3]){g.beginPath();g.moveTo(-34,y);g.quadraticCurveTo(-12,y+(y>0?4:-4),8,y);g.stroke()}};
VEH.debris=(g,c,o)=>{const sd=o.s||7;for(let i=0;i<7;i++){const x=(hs(i,sd,11)-.5)*34,y=(hs(i,sd,12)-.5)*24,s=2+hs(i,sd,13)*4;g.save();g.translate(x,y);g.rotate(hs(i,sd,14)*TAU);fR(g,-s/2+1,-s/3+1,s,s*.7,SHD);fR(g,-s/2,-s/3,s,s*.7,['#666','#888','#444','#9a7a4a'][i&3]);g.restore()}};
VEH.fire=(g)=>{fC(g,0,0,9,'rgba(255,120,30,.28)');fC(g,0,0,5.6,'rgba(255,170,50,.5)');fC(g,0,0,2.8,'rgba(255,240,150,.9)')};
VEH.spark=(g)=>{g.strokeStyle='rgba(255,230,120,.95)';g.lineWidth=1;g.beginPath();for(let i=0;i<7;i++){const a=i*.9;g.moveTo(Math.cos(a)*1.5,Math.sin(a)*1.5);g.lineTo(Math.cos(a)*(5+i%3*2),Math.sin(a)*(5+i%3*2))}g.stroke();fC(g,0,0,1.8,'#fff')};
VEH.carwreck=(g,c)=>{g.fillStyle='rgba(20,15,10,.4)';g.beginPath();g.ellipse(0,0,17,11,0,0,TAU);g.fill();fR(g,-12,-5.5,24,11,shade(c||'#7f8c8d',-.45));fR(g,-8,-4.5,10,9,'#222');fR(g,5,-5.5,5,3,'#554');g.strokeStyle='rgba(0,0,0,.55)';g.lineWidth=1;g.beginPath();g.moveTo(-12,-5.5);g.lineTo(0,2);g.lineTo(12,-3);g.stroke()};
// ===== barche: stessa firma della vecchia boat() (len/wid in pixel) + 10 tipi (sty). Quelle veloci lasciano la scia =====
const BOAT_BASE=[[24,.42],[26,.42],[18,.40],[28,.46],[40,.34],[24,.50],[34,.30],[42,.26],[13,.24],[22,.40]];   // [lunghezza base, rapporto larghezza/lunghezza] per tipo
function vessel(g,x,y,a,col,len,wid,sty){sty=sty|0;const l=len/2,w=wid/2;col=col||'#ffffff';g.save();g.translate(x,y);g.rotate(a);
 if(sty==0||sty==2||sty==5||sty==6||sty==9){g.lineCap='round';g.strokeStyle='rgba(255,255,255,.34)';g.lineWidth=Math.max(1.4,w*.45);g.beginPath();g.moveTo(-l*.9,-w*.5);g.lineTo(-l*2.5,-w*1.7);g.moveTo(-l*.9,w*.5);g.lineTo(-l*2.5,w*1.7);g.stroke();g.strokeStyle='rgba(255,255,255,.2)';g.lineWidth=w*.9;g.beginPath();g.moveTo(-l,0);g.lineTo(-l*3,0);g.stroke();g.lineCap='butt'}
 g.fillStyle='rgba(0,20,40,.3)';g.beginPath();g.ellipse(2,3,l,w,0,0,TAU);g.fill();
 const hull=(c,k)=>{k=k||1;g.fillStyle=c;g.beginPath();g.moveTo(l*k,0);g.bezierCurveTo(l*.6*k,w*k,-l*.7*k,w*k,-l*k,w*.75*k);g.lineTo(-l*k,-w*.75*k);g.bezierCurveTo(-l*.7*k,-w*k,l*.6*k,-w*k,l*k,0);g.fill()};
 const box=(x0,y0,w0,h0,c)=>{g.fillStyle=c;g.fillRect(x0,y0,w0,h0)};
 if(sty==1){hull(col);g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1.2;g.stroke();box(-l*.65,-w*.62,l*.95,w*1.24,'#8a6a3a');box(l*.1,-w*.5,l*.45,w,'#ecebe4');box(l*.4,-w*.38,l*.1,w*.76,'#2b3a46');g.strokeStyle='#555';g.lineWidth=Math.max(1,w*.12);g.beginPath();g.moveTo(-l*.4,0);g.lineTo(-l*.95,-w*1.3);g.stroke();fR(g,-l*.62,-w*.3,l*.3,w*.6,'#38617a');g.fillStyle='#f39c12';for(const yy of[-.4,.4]){g.beginPath();g.arc(-l*.1,w*yy,Math.max(1,w*.14),0,TAU);g.fill()}}
 else if(sty==2){g.strokeStyle='#2c3e50';g.lineWidth=Math.max(2,w*.42);g.lineJoin='round';g.beginPath();g.moveTo(-l,-w*.78);g.lineTo(l*.55,-w*.78);g.lineTo(l,0);g.lineTo(l*.55,w*.78);g.lineTo(-l,w*.78);g.stroke();box(-l*.8,-w*.5,l*1.5,w,'#cfd6dc');box(-l*.05,-w*.3,l*.3,w*.6,col);box(-l*1.02,-w*.34,l*.22,w*.68,'#222');g.fillStyle='#111';g.fillRect(-l*1.1,-w*.2,l*.1,w*.4)}
 else if(sty==3){hull(col);g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1.2;g.stroke();hull('#c9a56a',.72);g.fillStyle='rgba(255,255,255,.9)';g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=.8;
  g.beginPath();g.moveTo(l*.1,0);g.lineTo(-l*.75,w*.2);g.quadraticCurveTo(-l*.45,w*1.9,l*.08,w*2.1);g.closePath();g.fill();g.stroke();g.beginPath();g.moveTo(l*.2,0);g.lineTo(l*.8,w*.05);g.quadraticCurveTo(l*.6,w*1.4,l*.22,w*1.7);g.closePath();g.fill();g.stroke();fC(g,l*.1,0,Math.max(1,w*.14),'#333')}
 else if(sty==4){g.fillStyle=col;g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=1.2;g.beginPath();g.moveTo(l,-w*.5);g.lineTo(l*.82,-w);g.lineTo(-l,-w);g.lineTo(-l,w);g.lineTo(l*.82,w);g.lineTo(l,w*.5);g.closePath();g.fill();g.stroke();
  const n=Math.max(2,Math.round(len/12));for(let i=0;i<n;i++){const cx=-l*.78+i*(l*1.5/n);for(const yy of[-1,0]){fR(g,cx,yy*w*.82+(yy?0:w*.02),l*1.5/n-1.2,w*.78,CONT_COL[(i*3+(yy?0:5)+(len|0))%CONT_COL.length])}}
  box(-l*.98,-w*.34,l*.22,w*.68,'#ecebe4')}
 else if(sty==5){hull(col,1);g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=1.3;g.stroke();box(-l*.3,-w*.55,l*.6,w*1.1,'#ecebe4');box(l*.12,-w*.4,l*.14,w*.8,'#2b3a46');fC(g,-l*.45,0,w*.34,'#c0392b');g.fillStyle='#111';for(let i=-2;i<=2;i++){g.beginPath();g.arc(l*.82-Math.abs(i)*l*.08,i*w*.3,Math.max(1,w*.13),0,TAU);g.fill()}}
 else if(sty==6){hull('#7b8791');g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=1.2;g.stroke();box(-l*.5,-w*.5,l*.9,w,'#5f6b75');box(-l*.15,-w*.34,l*.3,w*.68,'#2b3a46');fC(g,l*.45,0,w*.42,'#4c555d');box(l*.45,-w*.1,l*.45,w*.2,'#222');sL(g,[[-l*.4,-w*.4],[-l*.4,w*.4]],'#222',Math.max(1,w*.14));box(-l*.92,-w*.5,l*.25,w,'#c0392b')}
 else if(sty==7){hull('#f4f1e8');g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=1.2;g.stroke();hull('#c8a96a',.7);box(-l*.2,-w*.55,l*.7,w*1.1,'#f4f1e8');box(l*.02,-w*.42,l*.4,w*.84,'rgba(35,55,75,.85)');box(-l*.8,-w*.28,l*.38,w*.56,'#f0d9a8');fC(g,-l*.62,0,w*.18,col)}
 else if(sty==8){g.fillStyle=col;g.beginPath();g.moveTo(l,0);g.quadraticCurveTo(0,w*1.25,-l,0);g.quadraticCurveTo(0,-w*1.25,l,0);g.fill();g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1;g.stroke();fC(g,0,0,Math.max(1,w*.55),'#e8c39a');sL(g,[[-l*.3,-w*1.5],[l*.3,w*1.5]],'#8a6a3a',1)}
 else if(sty==9){hull(col);g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1.2;g.stroke();box(-l*.5,-w*.5,l*.8,w,'#a8875a');for(const[xx,yy]of[[-.3,-.25],[0,.2],[.15,-.2]])fR(g,l*xx-w*.25,w*yy-w*.2,w*.5,w*.4,'#6e5230');box(l*.4,-w*.2,l*.15,w*.4,'#2b3a46')}
 else{hull(col);g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1.2;g.stroke();box(-l*.5,-w*.5,l*.7,w,'rgba(255,255,255,.88)');g.fillStyle='#1d2a36';g.beginPath();g.arc(l*.2,0,w*.45,-Math.PI/2,Math.PI/2);g.fill();if(len>35){g.strokeStyle='#e74c3c';g.lineWidth=1.6;g.beginPath();g.arc(-l*.2,0,w*.3,0,TAU);g.stroke()}box(-l*.8,-w*.18,l*.2,w*.36,'#222')}
 g.restore()}
// ===== scene tematiche: gruppi coerenti di veicoli e oggetti. Disegnate nell'origine (l'angolo lo applica pProps); f.s = seme locale =====
const SCN={};
const lh=(f,i,k)=>hs(i,(f.s|0)+(k||0),DC.seed+91);
const V=(g,k,x,y,a,c,s,o)=>veh(g,k,x,y,a,c,s,o);
const hose=(g,pts,c)=>{g.lineCap='round';g.lineJoin='round';sL(g,pts,'rgba(0,0,0,.25)',3);g.save();g.translate(-.6,-.6);sL(g,pts,c||'#222',2);g.restore();g.lineCap='butt'};
const matRect=(g,w,h,hz)=>{fR(g,-w/2-2,-h/2-2,w+4,h+4,'rgba(0,0,0,.3)');fR(g,-w/2,-h/2,w,h,'#4a4f55');g.strokeStyle='rgba(255,255,255,.1)';g.lineWidth=1;g.beginPath();for(let x=-w/2+10;x<w/2;x+=10){g.moveTo(x,-h/2);g.lineTo(x,h/2)}g.stroke();if(hz){g.strokeStyle='#d9b300';g.lineWidth=2.4;g.setLineDash([7,6]);g.strokeRect(-w/2+3,-h/2+3,w-6,h-6);g.setLineDash([])}};
SCN.supply=(g,f)=>{const k=lh(f,1)*3|0;
 V(g,k==0?'tanker':k==1?'army':'hauler',-16,-10,-.25+lh(f,2)*.3,k==0?'#c0392b':MIL_COL[0],1);
 V(g,'crates',22,-16,lh(f,3)*.6,'#8a6a3a');V(g,'barrels',22,10,0,'#c0392b');V(g,'pallet',-24,16,.2,'#cfc8b8');V(g,'crate',-8,19,.3,'#6e5230');
 hose(g,[[-2,-8],[8,-4],[12,2],[16,8]],'#222');V(g,'cone',-34,-2,0);V(g,'cone',30,-2,0);if(lh(f,4)<.5)V(g,'forklift',8,22,2.6,'#e67e22')};
SCN.repair=(g,f)=>{const big=f.big,list=big?['drop','lander','gunship','shuttle']:['walker','heavymech','spider','mbt','hover','apc','drop'],kind=list[(lh(f,5)*list.length)|0],W=big?84:62,Hh=big?60:46;
 matRect(g,W,Hh,1);
 g.strokeStyle='#e6b422';g.lineWidth=2;g.strokeRect(-W/2-7,-Hh/2-7,W+14,Hh+14);g.beginPath();for(const sx of[-1,1])for(const sy of[-1,1]){g.moveTo(sx*(W/2+7),sy*(Hh/2+7));g.lineTo(sx*(W/2+7),sy*(Hh/2+7)-sy*10)}g.stroke();   // portale di manutenzione sopra il mezzo
 g.fillStyle='#e6b422';for(const sx of[-1,1])for(const sy of[-1,1])g.fillRect(sx*(W/2+7)-2.5,sy*(Hh/2+7)-2.5,5,5);
 sL(g,[[-W/2-7,0],[W/2+7,0]],'rgba(230,180,34,.7)',2.6);fR(g,-4,-Hh/2-7,8,Hh+14,'rgba(230,180,34,.35)');
 V(g,kind,0,0,lh(f,6)*.5-.25,kind=='mbt'||kind=='apc'?MIL_COL[1]:kind=='hover'?'#7f8c8d':GRY_COL[0],big&&kind=='drop'?1:1,{arm:1});
 V(g,'spark',lh(f,7)*16-4,lh(f,8)*14-7,0);V(g,'spark',-12-lh(f,9)*8,lh(f,10)*18-9,0);
 V(g,'mcrane',-W/2-6,-Hh/2-18,.05,'#e6b422',.9,{arm:.7+lh(f,11)*.8});
 V(g,'toolcart',W/2+12,Hh/2+4,.3,'#c0392b');V(g,'crate',W/2+10,-Hh/2+6,.2,'#6e5230');V(g,'barrels',-W/2-20,Hh/2+14,0,'#2e86c1');V(g,'gen',W/2+14,-Hh/2-12,0.1,'#f1c40f');
 hose(g,[[W/2+12,-Hh/2-8],[W/2,-6],[10,-2]],'#c0392b');V(g,'mast',-W/2-4,Hh/2+8,0);V(g,'mast',W/2+4,-Hh/2-3,0);
 g.fillStyle='#777';g.fillRect(-W/2+4,Hh/2-9,5,3);g.fillRect(-W/2+12,Hh/2-8,4,4)};   // pezzi di ricambio
SCN.tankPark=(g,f)=>{const n=f.n||3,kinds=f.des?['mbt','heavy','spg','apc','scout']:['mbt','mbt','heavy','spg','apc','scout','sam'],col=f.des?DES_COL:MIL_COL,sp=27;
 g.fillStyle='rgba(60,80,50,.22)';g.fillRect(-34,-n*sp/2-7,68,n*sp+14);g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=1.2;g.setLineDash([6,5]);g.strokeRect(-34,-n*sp/2-7,68,n*sp+14);g.setLineDash([]);
 for(let i=0;i<n;i++){const k=kinds[(lh(f,20+i)*kinds.length)|0];V(g,k,(lh(f,30+i)-.5)*6,(i-(n-1)/2)*sp,(lh(f,40+i)-.5)*.14,col[(lh(f,50+i)*col.length)|0],1)}
 V(g,'jeep',-30,(n*sp)/2+14,.4,col[0],1);V(g,'barrels',32,(n*sp)/2+10,0,'#556b2f');V(g,'sandbags',0,-n*sp/2-14,0,null,1,{n:6,w:34})};
SCN.checkpoint=(g,f)=>{fR(g,-30,-24,60,10,'rgba(80,80,80,.25)');V(g,'booth',-2,-19,0,'#6b7580');V(g,'boom',0,-9,Math.PI/2*(f.open?-.1:1),null,1);V(g,'sandbags',-18,-23,0,null,1,{n:4,w:16,bend:2});V(g,'sandbags',18,-23,0,null,1,{n:4,w:16,bend:2});V(g,'cone',-6,16,0);V(g,'cone',8,16,0);V(g,f.rhino?'apc':'jeep',-23,-5,.15,MIL_COL[2],1);V(g,'mast',24,-12,0)};
SCN.fieldCamp=(g,f)=>{const col=f.des?DES_COL:MIL_COL;for(const[x,y,a]of[[-20,-14,0],[8,-22,.1],[-4,8,-.1]])V(g,'tent',x,y,a,col[(lh(f,x+99)*col.length)|0],1);
 V(g,'fire',24,6,0);V(g,'log',17,12,1.2);V(g,'log',31,12,-1.2);V(g,'sandbags',22,-12,Math.PI/2,null,1,{n:5,w:24,bend:4});V(g,lh(f,3)<.5?'jeep':'army',-30,18,.5,col[1],1);V(g,'dish',-36,-4,0);V(g,'crates',10,24,.2,'#6e5230');V(g,'gen',-14,26,0,'#f1c40f')};
SCN.sam=(g,f)=>{const col=f.des?DES_COL:MIL_COL;V(g,'sam',-6,-16,.1,col[0],1);V(g,'sam',-6,16,-.1,col[1],1);V(g,'army',22,0,Math.PI/2,col[2],1);V(g,'dish',28,-22,0);V(g,'sandbags',-30,0,Math.PI/2,null,1,{n:7,w:44,bend:5});V(g,'crates',32,22,.2,'#6e5230')};
SCN.apron=(g,f)=>{const n=f.n||3,kinds=['drop','shuttle','fighter','gunship','lander'];for(let i=0;i<n;i++){const k=kinds[(lh(f,60+i)*kinds.length)|0],x=(i-(n-1)/2)*74;V(g,k,x,(lh(f,70+i)-.5)*6,Math.PI/2*(f.dir||1),GRY_COL[(lh(f,80+i)*3)|0],1)}
 V(g,'tug',-(n*37)-2,12,.3,'#e67e22',1);if(lh(f,5)<.6)V(g,'tanker',(n*37)+8,14,0,'#c0392b',1);V(g,'cone',-n*37+10,26,0);V(g,'cone',n*37-10,26,0)};
SCN.fuelDepot=(g,f)=>{fR(g,-40,-30,80,60,'rgba(70,70,60,.35)');g.strokeStyle='#d9b300';g.lineWidth=1.6;g.setLineDash([8,6]);g.strokeRect(-40,-30,80,60);g.setLineDash([]);
 V(g,'tanker',-14,-14,0,'#c0392b',1);V(g,'tanker',-14,12,0,'#2e86c1',1);fC(g,30,-12,11,'rgba(0,0,0,.28)');fC(g,29,-13,11,'#cfd5da');g.strokeStyle='#6b7580';g.lineWidth=1.2;g.beginPath();g.arc(29,-13,11,0,TAU);g.stroke();fC(g,29,-13,4,'#999');
 fR(g,22,8,16,10,'#555');fR(g,25,10,10,6,'#e6b422');hose(g,[[22,12],[12,12],[8,10]],'#222');V(g,'barrels',-36,20,0,'#c0392b');V(g,'cone',36,24,0);V(g,'cone',-36,-22,0)};
SCN.cargoWork=(g,f)=>{const cc=CONT_COL[(lh(f,1)*CONT_COL.length)|0];fR(g,-30,-18,60,36,'rgba(60,60,60,.3)');
 fR(g,6,-14,34,14,'rgba(0,0,0,.3)');fR(g,4,-16,34,14,cc);g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=1;g.beginPath();for(let x=6;x<36;x+=3){g.moveTo(x,-16);g.lineTo(x,-2)}g.stroke();
 V(g,'hauler',-14,8,.05,IND_COL[(lh(f,2)*IND_COL.length)|0],1,{cc:CONT_COL[(lh(f,3)*CONT_COL.length)|0]});V(g,'forklift',20,12,-.5,'#e67e22',1);V(g,'pallet',34,18,.2,'#cfc8b8');V(g,'pallet',-34,-10,.1,'#b8b19f');V(g,'crates',-30,-2,0,'#8a6a3a')};
SCN.scrap=(g,f)=>{fE(g,0,0,38,28,'rgba(40,36,30,.35)');for(let i=0;i<3;i++)V(g,'carwreck',(lh(f,i)-.5)*40,(lh(f,i+5)-.5)*30,lh(f,i+9)*TAU,CAR_COL[(lh(f,i+3)*CAR_COL.length)|0],1);
 V(g,'debris',0,0,0,null,1,{s:f.s|0});V(g,'excav',22,16,lh(f,12)*TAU,'#e6b422',.9,{arm:lh(f,13)*.8});V(g,'barrels',-26,16,0,'#7f8c8d');if(lh(f,14)<.4)V(g,'fire',-8,-4,0)};
SCN.wallWork=(g,f)=>{fR(g,-34,-12,68,26,'rgba(130,120,105,.3)');fR(g,-30,-3,46,6,'rgba(0,0,0,.25)');
 for(let i=0;i<10;i++){const x=-30+i*4.6,hgt=i<6?1:0;g.fillStyle=i%2?'#a35d44':'#b56a4e';g.fillRect(x,-3,4.4,6);if(hgt){g.fillStyle='rgba(255,255,255,.12)';g.fillRect(x,-3,4.4,1.4)}}
 g.strokeStyle='#8a8f94';g.lineWidth=1.2;g.beginPath();g.moveTo(-31,-9);g.lineTo(18,-9);g.moveTo(-31,9);g.lineTo(18,9);for(let x=-31;x<=18;x+=12){g.moveTo(x,-9);g.lineTo(x,9)}g.stroke();   // impalcatura
 for(let i=0;i<3;i++)for(let j=0;j<2;j++)fR(g,22+j*6,-12+i*6,5,5,'#a35d44');V(g,'pallet',26,12,.1,'#b56a4e');V(g,'mixer',-8,-20,.05,'#e67e22',.7);V(g,'cone',-34,6,0)};
SCN.roadwork=(g,f)=>{fR(g,-24,-9,48,18,'rgba(35,35,38,.7)');g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=1;g.setLineDash([5,4]);g.strokeRect(-24,-9,48,18);g.setLineDash([]);fR(g,-18,-4,24,8,'rgba(70,52,34,.75)');
 const kk=lh(f,1)*3|0;V(g,kk==0?'excav':kk==1?'roller':'dumper',-6,0,kk==0?-.1:0,'#e6b422',.85,{arm:.5});
 for(const x of[-46,-38,-30,-22])V(g,'cone',x,(x+46)*.18-4,0);for(const x of[26,34,42])V(g,'cone',x,-(x-26)*.2+4,0);
 fR(g,-27,-13,4,26,'#fff');g.fillStyle='#e74c3c';for(let y=-13;y<13;y+=6)g.fillRect(-27,y,4,3);fR(g,24,-12,3,24,'#fff');g.fillStyle='#e74c3c';for(let y=-12;y<12;y+=6)g.fillRect(24,y,3,3);V(g,'mast',34,12,0)};
SCN.crash=(g,f)=>{V(g,'skid',-6,-2,0);V(g,'skid',-14,6,.12);V(g,'carwreck',2,-5,.35,CAR_COL[(lh(f,1)*CAR_COL.length)|0],1);car(g,10,9,-1.1+lh(f,2)*.4,CAR_COL[(lh(f,3)*CAR_COL.length)|0],24,11);V(g,'debris',6,2,0,null,1,{s:f.s|0});V(g,'spark',12,3,0);if(lh(f,4)<.5)V(g,'fire',3,-6,0)};
SCN.busStop=(g,f)=>{V(g,'bus',0,0,0,['#e67e22','#2e86c1','#c0392b','#16a085'][(lh(f,1)*4)|0],1);V(g,'shelter',4,16,0);V(g,'bench',6,12,0);V(g,'cone',-30,0,0)};
SCN.market=(g,f)=>{const R0=f.r||90,n=Math.max(6,Math.min(22,Math.round(R0/6)));const SC=['#e74c3c','#f1c40f','#2e86c1','#27ae60','#e67e22','#8e44ad','#16a085'];
 for(let i=0;i<n;i++){const ring=i%2,r=R0*(ring?.42:.7),t=i/n*TAU*1.0+ring*.2;g.save();g.translate(Math.cos(t)*r,Math.sin(t)*r);g.rotate(t+Math.PI/2);V(g,'stall',0,0,0,SC[(lh(f,i)*SC.length)|0],1,{w:16+lh(f,i+30)*8,h:11});g.restore()}
 V(g,'crates',0,0,0.3,'#8a6a3a');V(g,'van',R0*.2,-R0*.2,.4,'#ecf0f1',1);V(g,'barrel',-R0*.2,R0*.2,0,'#2e86c1')};
SCN.picnic=(g,f)=>{V(g,'parasol',0,0,0,['#e74c3c','#f1c40f','#2e86c1'][(lh(f,1)*3)|0],1);V(g,'table',0,0,0);V(g,'bench',0,-13,0);V(g,'bench',0,13,Math.PI)};
SCN.farmyard=(g,f)=>{fE(g,0,0,58,44,'rgba(110,86,50,.28)');for(const[x,y]of[[-30,-18],[-20,-30],[-38,-6]])V(g,'haybale',x,y,0);V(g,'haysq',34,-20,.3);V(g,'haysq',34,-9,.28);V(g,'trough',-4,26,0);
 const k=lh(f,2)*3|0;if(k==0){V(g,'tractor',16,8,-.4,['#27ae60','#c0392b','#2980b9'][(lh(f,3)*3)|0],1);V(g,'trailer',-6,16,-.4,null,1,{load:'#c9a227'})}else if(k==1)V(g,'pickup',16,10,.5,CAR_COL[(lh(f,3)*CAR_COL.length)|0],1);else{V(g,'tractor',18,6,.8,'#c0392b',1);V(g,'plow',6,12,.8)}
 for(let i=0;i<7;i++)V(g,'hen',(lh(f,10+i)-.5)*40,16+lh(f,20+i)*16,lh(f,30+i)*TAU,lh(f,40+i)<.5?'#f3efe6':'#a8662c',1);V(g,'barrels',40,22,0,'#2e86c1')};
SCN.pasture=(g,f)=>{const w=f.w||100,h=f.h||80,kind=f.kind||'cow',n=f.n||6;
 if(f.bales){for(let i=0;i<n;i++)V(g,i%3?'haybale':'haysq',(lh(f,i)-.5)*w*.8,(lh(f,i+40)-.5)*h*.8,lh(f,i+80)*TAU,null,1);return}
 g.fillStyle='rgba(40,90,40,.18)';for(let i=0;i<3;i++){g.beginPath();g.ellipse((lh(f,i)-.5)*w*.5,(lh(f,i+9)-.5)*h*.5,w*.18,h*.14,lh(f,i+3)*3,0,TAU);g.fill()}
 V(g,'trough',(lh(f,50)-.5)*w*.4,(lh(f,51)-.5)*h*.4,lh(f,52)*3,null,1);fE(g,(lh(f,53)-.5)*w*.5,h*.28,w*.1,h*.07,'rgba(63,135,173,.8)');
 const cx=(lh(f,60)-.5)*w*.3,cy=(lh(f,61)-.5)*h*.3;for(let i=0;i<n;i++){const t=lh(f,i+70)*TAU,d=Math.sqrt(lh(f,i+100))*Math.min(w,h)*.38;V(g,kind,cx+Math.cos(t)*d*1.2,cy+Math.sin(t)*d,lh(f,i+130)*TAU,kind=='cow'?(lh(f,i+160)<.5?'#3a2f2a':'#8a5a2a'):kind=='horse'?['#7a4a2a','#2a1a10','#b88a4a'][i%3]:null,1)}};
SCN.greenhouse=(g,f)=>{const n=f.n||3;for(let i=0;i<n;i++){const y=(i-(n-1)/2)*20;fR(g,-34,y-8,70,18,'rgba(0,0,0,.22)');fR(g,-35,y-9,70,17,'rgba(170,215,205,.55)');g.strokeStyle='rgba(255,255,255,.6)';g.lineWidth=1;g.strokeRect(-35,y-9,70,17);g.beginPath();for(let x=-30;x<35;x+=6){g.moveTo(x,y-9);g.lineTo(x,y+8)}g.stroke();fR(g,-34,y-1,68,2,'rgba(60,130,60,.5)')}
 V(g,'crates',-40,n*10+6,0,'#8a6a3a');V(g,'pallet',-24,n*10+6,.1,'#cfc8b8');V(g,'quad',30,n*10+8,.5,'#c0392b',1)};
SCN.logging=(g,f)=>{fE(g,0,0,52,38,'rgba(80,60,35,.3)');V(g,'logs',-26,-6,.1);V(g,'logs',-24,18,-.1);V(g,'dozer',20,-14,.5,'#e67e22',.8);V(g,'trailer',24,14,-.2,null,1,{load:'#7a5a36'});V(g,'tent',-4,30,.2,'#556b2f',.8);V(g,'fire',10,28,0);V(g,'log',34,2,1.3);V(g,'barrel',34,24,0,'#c0392b')};
SCN.wreckShip=(g,f)=>{const big=f.big;g.fillStyle='rgba(18,14,10,.6)';g.beginPath();g.ellipse(-44,0,50,13,0,0,TAU);g.fill();g.fillStyle='rgba(18,14,10,.4)';g.beginPath();g.ellipse(-20,0,34,18,0,0,TAU);g.fill();
 for(let i=0;i<6;i++){V(g,'debris',-70+i*14,(lh(f,i)-.5)*22,0,null,1,{s:(f.s|0)+i})}
 g.save();g.rotate(.18);V(g,'drop',6,0,0,'#6b7580',1);g.fillStyle='rgba(15,12,10,.55)';g.beginPath();g.moveTo(-22,-14);g.lineTo(2,-10);g.lineTo(-6,6);g.lineTo(-24,14);g.fill();g.restore();   // fusoliera bruciata
 g.save();g.translate(-20,-26);g.rotate(1.3);V(g,'drop',0,0,0,'#555d66',.42);g.restore();   // pezzo staccato
 V(g,'fire',-6,-4,0);V(g,'fire',14,6,0);V(g,'spark',-30,8,0);for(let i=0;i<3;i++)fC(g,-46-i*9,(lh(f,i+20)-.5)*10,2.4,'#222')};
SCN.campsite=(g,f)=>{for(const[x,y,a]of[[-14,-10,.2],[10,-12,-.15]])V(g,'tent',x,y,a,['#556b2f','#a89870','#8a5a2a'][(lh(f,x+9)*3)|0],.9);V(g,'fire',2,10,0);V(g,'log',-6,16,.2);V(g,'log',10,17,-.1);V(g,'crates',22,4,.3,'#8a6a3a');if(lh(f,4)<.5)V(g,'quad',-26,10,.6,'#c0392b',1)};
SCN.villa=(g,f)=>{};   // segnaposto: la villa usa oggetti singoli (vedi decorScenes)
SCN.jetty=(g,f)=>{fR(g,-34,-4,64,9,'rgba(0,15,30,.35)');fR(g,-36,-5,64,9,'#8a6a3a');g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1;g.beginPath();for(let x=-32;x<28;x+=5){g.moveTo(x,-5);g.lineTo(x,4)}g.stroke();fC(g,-34,-5,1.6,'#3e2723');fC(g,-34,4,1.6,'#3e2723');fC(g,26,-5,1.6,'#3e2723');fC(g,26,4,1.6,'#3e2723');V(g,'crates',-18,0,0,'#8a6a3a',.7);V(g,'barrel',-4,0,0,'#2e86c1')};
// ===== disegno degli elementi 'veh' / 'scn' e delle versioni migliorate dei vecchi oggetti (PROPS ha la precedenza su PF_PROPS di AGdecor.js) =====
const PROPS={
 veh(g,f){veh(g,f.v,0,0,0,f.col,f.sc,f.o)},
 scn(g,f){const d=SCN[f.t];if(d)d(g,f)},
 // trattore al lavoro nel campo: orientato come i solchi, con la striscia lavorata dietro (aratro, rimorchio di fieno o mietitrebbia)
 tractor(g,f){const h=hs(f.x|0,f.y|0,DC.seed+61),fa=f.fa!=null?f.fa:(f.a||0),rot=fa+(h<.5?0:Math.PI)-(f.a||0),kind=h<.34?0:h<.67?1:2,L=Math.max(30,Math.min(90,(f.fw||150)*.38));g.rotate(rot);
  if(kind==0){fR(g,-L-6,-9,L,18,'rgba(70,45,25,.5)');g.strokeStyle='rgba(40,25,12,.45)';g.lineWidth=1;g.beginPath();for(let y=-8;y<=8;y+=3){g.moveTo(-L-6,y);g.lineTo(-8,y)}g.stroke();V(g,'plow',-12,0,0,null,1);V(g,'tractor',2,0,0,f.col||'#27ae60',1)}
  else if(kind==1){V(g,'trailer',-14,0,0,null,1,{load:'#c9a227'});V(g,'tractor',6,0,0,f.col||'#c0392b',1)}
  else{fR(g,-L-10,-14,L,28,'rgba(205,185,95,.5)');g.strokeStyle='rgba(120,95,30,.4)';g.lineWidth=1;g.beginPath();for(let y=-12;y<=12;y+=4){g.moveTo(-L-10,y);g.lineTo(-14,y)}g.stroke();V(g,'combine',0,0,0,f.col||'#c0392b',1)}},
 animalPen(g,f){const w=f.w||80,h=f.h||80,sd=f.s||1,H=(i,k)=>hs(i,sd,DC.seed+k),kind=['cow','sheep','pig','horse'][(H(1,3)*4)|0],gate=(H(2,3)*4)|0;
  g.fillStyle=kind=='pig'?'rgba(95,68,42,.7)':'rgba(150,125,70,.55)';g.fillRect(-w/2,-h/2,w,h);g.strokeStyle='rgba(60,40,20,.25)';g.lineWidth=1;for(let i=0;i<18;i++){const x=(H(i,5)-.5)*w,y=(H(i,6)-.5)*h;g.beginPath();g.moveTo(x,y);g.lineTo(x+5,y+2);g.stroke()}
  g.strokeStyle='#6b4c33';g.lineWidth=2.4;g.lineCap='butt';const side=(x0,y0,x1,y1,gp)=>{g.beginPath();if(gp){const mx=(x0+x1)/2,my=(y0+y1)/2,dx=(x1-x0)*.14,dy=(y1-y0)*.14;g.moveTo(x0,y0);g.lineTo(mx-dx,my-dy);g.moveTo(mx+dx,my+dy);g.lineTo(x1,y1)}else{g.moveTo(x0,y0);g.lineTo(x1,y1)}g.stroke()};
  side(-w/2,-h/2,w/2,-h/2,gate==0);side(w/2,-h/2,w/2,h/2,gate==1);side(w/2,h/2,-w/2,h/2,gate==2);side(-w/2,h/2,-w/2,-h/2,gate==3);g.fillStyle='#3e2723';for(let x=-w/2;x<=w/2;x+=14){g.fillRect(x-1.5,-h/2-1.5,3,3);g.fillRect(x-1.5,h/2-1.5,3,3)}for(let y=-h/2;y<=h/2;y+=14){g.fillRect(-w/2-1.5,y-1.5,3,3);g.fillRect(w/2-1.5,y-1.5,3,3)}
  fR(g,-w/2+5,-h/2+5,Math.min(30,w*.38),12,'rgba(0,0,0,.25)');fR(g,-w/2+4,-h/2+4,Math.min(30,w*.38),12,'#8a5a3a');fR(g,-w/2+4,-h/2+4,Math.min(30,w*.38),2,'#a8744d');   // tettoia
  V(g,'trough',w/2-14,h/2-9,0,null,1);const n=3+((H(4,3)*4)|0);for(let i=0;i<n;i++)V(g,kind,(H(i,7)-.5)*(w-30)+4,(H(i,8)-.5)*(h-34)+8,H(i,9)*TAU,kind=='cow'?(H(i,10)<.5?'#3a2f2a':'#8a5a2a'):kind=='horse'?['#7a4a2a','#2a1a10','#b88a4a'][i%3]:null,1)},
 construction(g,f){const w=f.w||90,h=f.h||90,sd=f.s!=null?f.s:(((f.x|0)*73+(f.y|0)*37)|0),H=(i,k)=>hs(i,sd,DC.seed+k),big=Math.min(w,h)>=120;
  g.fillStyle='rgba(150,140,125,.55)';g.fillRect(-w/2,-h/2,w,h);g.strokeStyle='rgba(60,50,40,.2)';g.lineWidth=1;for(let i=0;i<10;i++){g.beginPath();g.ellipse((H(i,1)-.5)*w,(H(i,2)-.5)*h,6+H(i,3)*12,4+H(i,4)*7,H(i,5)*3,0,TAU);g.stroke()}
  const fw=w*.52,fh=h*.46,fx=0,fy=-h*.04,mode=(H(1,9)*3)|0;
  if(mode==0){fR(g,fx-fw/2-3,fy-fh/2-3,fw+6,fh+6,'rgba(0,0,0,.3)');fR(g,fx-fw/2,fy-fh/2,fw,fh,'#bfc2c4');g.strokeStyle='#4a4d50';g.lineWidth=3;g.strokeRect(fx-fw/2,fy-fh/2,fw,fh);g.strokeStyle='rgba(60,60,60,.7)';g.lineWidth=1.4;g.beginPath();for(let x=fx-fw/2+8;x<fx+fw/2;x+=8){g.moveTo(x,fy-fh/2+3);g.lineTo(x,fy+fh/2-3)}for(let y=fy-fh/2+8;y<fy+fh/2;y+=8){g.moveTo(fx-fw/2+3,y);g.lineTo(fx+fw/2-3,y)}g.stroke()}   // fondamenta con armatura
  else if(mode==1){fR(g,fx-fw/2,fy-fh/2,fw,fh,'#a9acae');for(let x=fx-fw/2+4;x<=fx+fw/2-3;x+=14)for(let y=fy-fh/2+4;y<=fy+fh/2-3;y+=14){fR(g,x+1.5,y+2,6,6,'rgba(0,0,0,.3)');fR(g,x,y,6,6,'#6d7073')}g.strokeStyle='#d35400';g.lineWidth=1.4;g.beginPath();for(let x=fx-fw/2;x<=fx+fw/2;x+=14){g.moveTo(x+3,fy-fh/2);g.lineTo(x+3,fy+fh/2)}g.stroke()}   // pilastri e solaio
  else{fR(g,fx-fw/2,fy-fh/2,fw,fh,'#aaa79e');g.fillStyle='#8c5a44';g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=1;const t=5;for(const[x0,y0,ww,hh]of[[fx-fw/2,fy-fh/2,fw,t],[fx-fw/2,fy+fh/2-t,fw*.6,t],[fx-fw/2,fy-fh/2,t,fh],[fx+fw/2-t,fy-fh/2,t,fh*.55]]){g.fillRect(x0,y0,ww,hh);g.strokeRect(x0,y0,ww,hh)}}   // muri in costruzione
  g.strokeStyle='#d35400';g.lineWidth=2.4;g.setLineDash([7,5]);g.strokeRect(-w/2+3,-h/2+3,w-6,h-6);g.setLineDash([]);fR(g,-9,h/2-5,18,5,'rgba(150,140,125,.9)');   // recinto con cancello
  V(g,'mast',-w/2+10,-h/2+10,0);V(g,'mast',w/2-10,h/2-12,0);
  if(big){V(g,'mcrane',-w/2+26,-h/2+16,.6+H(2,9)*.5,'#e6b422',.9,{arm:H(3,9)*TAU});V(g,'excav',w/2-24,-h/2+24,H(4,9)*2,'#e6b422',.85,{arm:.6});V(g,'mixer',w/2-26,h/2-22,Math.PI/2,'#e67e22',.85);V(g,'dumper',-w/2+30,h/2-18,.1,'#e6b422',.85)}
  else{V(g,'mixer',w/2-18,h/2-14,Math.PI/2,'#e67e22',.7)}
  for(let i=0;i<(big?3:1);i++)V(g,'pallet',-w/2+12+i*13,h/2-34+(i%2)*3,H(i,12)*.3,['#a35d44','#cfc8b8','#8a8f94'][i%3],1);if(big){fE(g,w/2-30,h/2-50,15,10,'#c8b27a');fE(g,w/2-52,h/2-46,11,8,'#8a8f94');fR(g,-w/2+8,-4,18,9,'#ecebe4');fR(g,-w/2+8,-4,18,2,'#2e86c1');fR(g,-w/2+8,8,18,9,'#ecebe4');V(g,'crates',-w/2+44,h/2-14,.2,'#8a6a3a')}},
 refuelScene(g,f){const h=hs(f.x|0,f.y|0,DC.seed+62),k=['drop','shuttle','gunship','lander'][(h*4)|0];V(g,k,0,0,.4,GRY_COL[(h*3)|0],1);V(g,'tanker',-66,20,.5,'#c0392b',1);hose(g,[[-54,16],[-34,10],[-22,6]],'#222');V(g,'crates',58,-22,.3,'#8a6a3a');V(g,'barrels',60,16,0,'#c0392b');V(g,'forklift',-46,-30,-.8,'#e67e22',1);V(g,'cone',44,34,0)},
 repairScene(g,f){SCN.repair(g,{s:(f.x|0)+(f.y|0)*7,big:f.big})},
 smallShip(g,f){const h=hs(f.x|0,f.y|0,DC.seed+63);V(g,['drop','shuttle','fighter','gunship'][(h*4)|0],0,0,0,f.col||GRY_COL[(h*3)|0],1)},
 wreckage(g,f){SCN.wreckShip(g,{s:(f.x|0)+(f.y|0)*5})},
 campsite(g,f){SCN.campsite(g,{s:(f.x|0)+(f.y|0)*3})}
};
// veicoli stradali tematici: città = auto, taxi, furgoni, autobus, hovercar; industria = cisterne, mezzi da cantiere; campagna = pickup, quad; zone militari = jeep e blindati
function roadVeh(g,f){const h=hs(f.x|0,f.y|0,DC.seed+77),t=rtype(f.x,f.y),u=urbAt(f.x,f.y),tr=f.k==='truck';let k='car',c=f.col;
 if(t==='mil'||t==='base'){k=tr?(h<.5?'army':h<.75?'apc':'hauler'):(h<.55?'jeep':h<.8?'scout':'pickup');c=MIL_COL[(h*50|0)%5]}
 else if(t==='indus'){k=tr?(h<.3?'hauler':h<.55?'tanker':h<.8?'dumper':'mixer'):(h<.4?'pickup':h<.65?'van':'car');if(tr&&h>=.3)c=IND_COL[(h*60|0)%IND_COL.length]}
 else if(t==='rural'||t==='nature'){k=tr?(h<.4?'dumper':h<.7?'trailer':'army'):(h<.45?'pickup':h<.65?'jeep':h<.78?'quad':'car');if(k==='trailer'){V(g,'tractor',f.x,f.y,f.a,c,1);V(g,'trailer',f.x-Math.cos(f.a)*19,f.y-Math.sin(f.a)*19,f.a,null,1,{load:'#c9a227'});return}if(k==='army'||k==='jeep')c=MIL_COL[(h*50|0)%5]}
 else{k=tr?(h<.38?'bus':h<.72?'van':h<.88?'mixer':'hauler'):(u>.45?(h<.12?'taxi':h<.28?'van':h<.5?'hover':'car'):(h<.25?'pickup':h<.4?'van':'car'));if(k==='bus')c=['#e67e22','#2e86c1','#c0392b','#16a085'][(h*40|0)%4]}
 if(k==='car')car(g,f.x,f.y,f.a,c,f.len||24,f.wid||11);else if(k==='taxi')V(g,'taxi',f.x,f.y,f.a,'#f1c40f',1);else V(g,k,f.x,f.y,f.a,c,1)}
// riga di un parcheggio militare: carri, blindati e camion a rotazione
function milLot(g,x,y,a,n,s){const h=hs(n,5,s),k=['mbt','apc','army','jeep','scout','spg','sam','hauler','army'][(h*9)|0];V(g,k,x,y,a,MIL_COL[(hs(n,4,s)*5)|0],1)}

// ===== 4) mech, unità, navicelle, simboli =====
// ===== mech del giocatore =====
function gunArms(g,col,fl){g.strokeStyle='#aaa';g.lineWidth=.8;g.fillStyle='#111';g.beginPath();g.rect(4,-2.5,26,5);g.fill();g.stroke();g.fillStyle='#2a2a2a';g.beginPath();g.rect(8,-3.5,12,7);g.fill();g.stroke();
 g.fillStyle=col;g.strokeStyle='#000';g.lineWidth=1;
 g.beginPath();g.ellipse(7,-8,7,4,.3,0,TAU);g.fill();g.stroke();   // Spalla/braccio sinistro (da -10 a -8)
 g.beginPath();g.ellipse(10,9,7,4,-.3,0,TAU);g.fill();g.stroke();  // Spalla/braccio destro (da 7 a 9)
 g.fillStyle='#1d1d1d';g.strokeStyle='#aaa';g.lineWidth=.8;
 g.beginPath();g.arc(12,-5,3,0,TAU);g.fill();g.stroke();         // Dettaglio sinistro (da -7 a -5)
 g.beginPath();g.arc(15,6,3,0,TAU);g.fill();g.stroke();          // Dettaglio destro (da 4 a 6)
 if(fl){g.fillStyle='#fff';g.beginPath();g.arc(30,0,5,0,TAU);g.fill()}}

function helmet(g){g.fillStyle='#788878';g.beginPath();g.arc(0,0,7.5,0,TAU);g.fill();g.strokeStyle='#1c241c';g.lineWidth=1.2;g.stroke();g.fillStyle='#ff2222';g.beginPath();g.arc(5.5,-2.5,1.2,0,TAU);g.fill();g.beginPath();g.arc(5.5,2.5,1.2,0,TAU);g.fill()}

// ===== Catalogo dei modelli del Grunt =====
// Ogni modello è una funzione (g, colore, fl) che disegna il mech nell'origine, rivolto verso +x.
// Stessa hitbox per tutti (PR_GRUNT). fl > 0 = lampo di sparo attivo.
const GRUNT_MODEL_NAMES=['Assault','Valkyrie','Juggernaut','Ronin','Scarab','Inferno','Hornet','Corsair'];
// ===== helper per i modelli del Grunt (forme piene con contorno) =====
function mPoly(g,pts,fill,stroke,lw){g.beginPath();g.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)g.lineTo(pts[i][0],pts[i][1]);g.closePath();if(fill){g.fillStyle=fill;g.fill()}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw||1;g.stroke()}}
function mRect(g,x,y,w,h,fill,stroke,lw){g.beginPath();g.rect(x,y,w,h);if(fill){g.fillStyle=fill;g.fill()}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw||1;g.stroke()}}
function mEll(g,x,y,rx,ry,rot,fill,stroke,lw){g.beginPath();g.ellipse(x,y,rx,ry,rot||0,0,TAU);if(fill){g.fillStyle=fill;g.fill()}if(stroke){g.strokeStyle=stroke;g.lineWidth=lw||1;g.stroke()}}
function mLine(g,x0,y0,x1,y1,col,lw){g.strokeStyle=col;g.lineWidth=lw||1;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke()}

const GRUNT_MODELS=[
 // 0: Assault — l'originale, invariato
 (g,c,fl)=>{gunArms(g,c,fl>0);torso(g,c);helmet(g)},
 // 1: Valkyrie — cecchina snella con lunga chioma rossa, fucile con ottica e bipiede
 (g,c,fl)=>{
  g.lineJoin='round';
  mRect(g,-12,-3.5,5,7,'#2a2a2a','#000',1);                                  // zainetto
  mRect(g,-8,-1.6,12,3.2,'#4a3b2a','#000',.8);                               // calcio
  mEll(g,-1,0,6.5,12,0,c,'#000',1);                                          // busto snello
  mEll(g,0,-8.5,5.5,4.5,0,c,'#111',1.2);mEll(g,0,8.5,5.5,4.5,0,c,'#111',1.2);   // spalline
  mEll(g,7,-6,5,2.8,.3,c,'#000',1);mEll(g,12,6.5,5,2.8,-.3,c,'#000',1);      // braccia
  mRect(g,3,-1.2,31,2.4,'#151515','#8a8a8a',.6);                             // canna lunga
  mRect(g,33,-2,3,4,'#444','#000',.7);                                       // freno di bocca
  mRect(g,9,-2.6,10,5.2,'#262626','#999',.7);mEll(g,19,0,1.2,2.2,0,'#38d6ff');    // ottica
  mLine(g,27,0,24,-6,'#aaa',1);mLine(g,27,0,24,6,'#aaa',1);                 // bipiede ripiegato
  mEll(g,0,0,6.5,6.5,0,'#a6b0ba','#1a2028',1.1);                            // elmetto
  g.fillStyle='#38d6ff';g.beginPath();g.arc(0,0,6,-.75,.75);g.arc(0,0,4.4,.75,-.75,true);g.closePath();g.fill();   // visiera
  // chioma rossa: coda a ciocche che sventola all'indietro + calotta sul capo
  g.fillStyle='#c4301c';g.strokeStyle='#4a0e08';g.lineWidth=.9;
  g.beginPath();g.moveTo(-3.5,-2.2);g.quadraticCurveTo(-11,-8.5,-17,-4.5);g.quadraticCurveTo(-11.5,-3.2,-4.5,-.4);g.closePath();g.fill();g.stroke();
  g.beginPath();g.moveTo(-3.5,-.6);g.quadraticCurveTo(-12,-1.6,-19,1);g.quadraticCurveTo(-12,2.6,-3.5,1.2);g.closePath();g.fill();g.stroke();
  g.beginPath();g.moveTo(-3.5,.8);g.quadraticCurveTo(-10,5,-16.5,8.5);g.quadraticCurveTo(-9.5,8.8,-3,3.2);g.closePath();g.fill();g.stroke();
  g.beginPath();g.ellipse(-3,0,3.8,5.4,0,0,TAU);g.fill();g.stroke();       // calotta di capelli sul retro dell'elmetto
  g.strokeStyle='#ff8a5a';g.lineWidth=.8;g.beginPath();g.moveTo(-5,-3.4);g.quadraticCurveTo(-10,-6,-15,-4.4);g.moveTo(-5,.3);g.quadraticCurveTo(-11,-.2,-17,.9);g.moveTo(-4.6,2.6);g.quadraticCurveTo(-9,5.4,-14,7.4);g.stroke();   // riflessi
  mEll(g,-1.5,-5.3,1.1,1.1,0,'#fff');                                          // fermaglio
  if(fl){g.fillStyle='#fff';g.beginPath();g.arc(37,0,3.5,0,TAU);g.fill()}
 },
 // 2: Juggernaut — gigante corazzato: spallacci squadrati a strisce gialle, gatling a canne rotanti, nastro munizioni
 (g,c,fl)=>{
  g.lineJoin='round';
  mRect(g,-17,-11,9,22,'#262626','#000',1);mRect(g,-15,-9,5,18,'#3a3a3a');mRect(g,-16,-3,2,6,'#e6b422');   // zaino munizioni
  g.save();g.setLineDash([2,1.5]);mLine(g,-8,-4,6,-3,'#d6a516',2);mLine(g,-8,4,6,3,'#d6a516',2);g.restore();    // nastri
  mEll(g,0,0,12,16,0,c,'#000',1.2);                                          // torso largo
  mRect(g,-5,-21,17,10,c,'#111',1.5);mRect(g,-5,11,17,10,c,'#111',1.5);      // spallacci squadrati
  for(let i=0;i<4;i++){mPoly(g,[[-3+i*4,-21],[0+i*4,-21],[3+i*4-3,-17],[i*4-3,-17]],'#e6b422');mPoly(g,[[-3+i*4,17],[0+i*4,17],[3+i*4-3,21],[i*4-3,21]],'#e6b422')}   // strisce di pericolo
  mRect(g,6,-8,11,16,'#1d1d1d','#999',.9);                                   // blocco motore
  mRect(g,17,-5,17,10,'#4a4a4a','#000',1);                                   // fascio di canne
  for(let i=0;i<4;i++)mLine(g,17,-3.4+i*2.27,34,-3.4+i*2.27,'#111',1.1);
  mRect(g,22,-5.6,2.2,11.2,'#2a2a2a','#000',.8);mRect(g,31.5,-5.6,2.6,11.2,'#2a2a2a','#000',.8);
  mRect(g,-5,-6.5,11,13,'#3d4a3d','#0a120a',1.5);                            // testa squadrata
  mRect(g,3.5,-5,2.5,10,'#ffb000');mRect(g,-3,-1,5,2,'#1a1a1a');
  if(fl){g.fillStyle='#fff';g.beginPath();g.arc(35,-3,3.5,0,TAU);g.arc(35,3,3.5,0,TAU);g.fill()}
 },
 // 3: Ronin — samurai: kabuto con corna dorate, sode a strati, katana sulla schiena, fucile con fasce d'ottone
 (g,c,fl)=>{
  g.lineJoin='round';
  mPoly(g,[[-6,-6],[-13,-9],[-13,9],[-6,6]],'#2a2a2a','#000',1);              // nuchale (shikoro)
  mLine(g,-9,-7.5,-9,7.5,'#a3281c',1.3);mLine(g,-11.5,-8.2,-11.5,8.2,'#a3281c',1.3);
  mEll(g,-1,0,8,13,0,c,'#000',1);                                            // corazza
  for(const x of[-5,-1.5,2])mLine(g,x,-9,x,9,'rgba(0,0,0,.45)',1);          // lamelle
  for(let i=0;i<3;i++){mRect(g,-4+i*2,-16+i*2.2,10,3,c,'#000',.9);mRect(g,-4+i*2,13-i*2.2,10,3,c,'#000',.9);mLine(g,-3+i*2,-14.4+i*2.2,5+i*2,-14.4+i*2.2,'#a3281c',.8);mLine(g,-3+i*2,14.4-i*2.2,5+i*2,14.4-i*2.2,'#a3281c',.8)}   // sode laccati
  mEll(g,8,-6.5,5.5,2.8,.3,c,'#000',1);mEll(g,12,6.5,5.5,2.8,-.3,c,'#000',1);   // braccia
  mRect(g,5,-1.6,29,3.2,'#1a1a1a','#777',.6);                                // canna
  for(const x of[11,19,27])mRect(g,x,-2.3,1.6,4.6,'#d4a017');                // fasce ottone
  mRect(g,9,-2.5,6,5,'#333');
  mLine(g,-11,11,-2,-14,'#161616',2.6);mEll(g,-4.6,-7.2,2,2,0,'#d4a017','#000',.7);mLine(g,-10.5,10,-8.7,5.2,'#a3281c',2.2);   // katana in fodero (tsuba dorata, impugnatura rossa)
  mEll(g,0,0,7,7,0,'#2b2b2b','#000',1.2);                                    // kabuto
  g.fillStyle='#d4a017';g.strokeStyle='#5a4208';g.lineWidth=.8;
  g.beginPath();g.moveTo(2.5,-4.6);g.quadraticCurveTo(12,-7,16,-15.5);g.quadraticCurveTo(11.5,-4.2,2,-1.2);g.closePath();g.fill();g.stroke();   // corna (maedate)
  g.beginPath();g.moveTo(2.5,4.6);g.quadraticCurveTo(12,7,16,15.5);g.quadraticCurveTo(11.5,4.2,2,1.2);g.closePath();g.fill();g.stroke();
  mPoly(g,[[4.5,-3.6],[7.2,-2],[7.2,2],[4.5,3.6]],'#b3261e','#000',.8);mLine(g,5.6,-1.4,5.6,1.4,'#000',.8);       // maschera (menpo)
  mEll(g,-1,0,2,2,0,'#d4a017','#5a4208',.7);                                 // stemma
  if(fl){g.fillStyle='#fff';g.beginPath();g.arc(34,0,3.5,0,TAU);g.fill()}
 },
 // 4: Scarab — insettoide: guscio segmentato, antenne, occhi verdi multipli, chele laterali, zampette, cannone organico
 (g,c,fl)=>{
  g.lineJoin='round';g.lineCap='round';
  for(let i=0;i<3;i++){const x=-6+i*5;mLine(g,x,-12.5,x-3,-19+i*.6,'#1a2614',1.6);mLine(g,x,12.5,x-3,19-i*.6,'#1a2614',1.6)}   // zampe
  g.fillStyle='#2f4a2a';g.strokeStyle='#0d1a0a';g.lineWidth=1;
  g.beginPath();g.moveTo(5,-8);g.quadraticCurveTo(15,-13,21,-8);g.quadraticCurveTo(20,-3.8,16,-3.8);g.quadraticCurveTo(15,-8,6,-6);g.closePath();g.fill();g.stroke();   // chela sx
  g.beginPath();g.moveTo(5,8);g.quadraticCurveTo(15,13,21,8);g.quadraticCurveTo(20,3.8,16,3.8);g.quadraticCurveTo(15,8,6,6);g.closePath();g.fill();g.stroke();       // chela dx
  mPoly(g,[[6,-3.4],[28,-1.9],[28,1.9],[6,3.4]],'#34502c','#0d1a0a',1);mEll(g,28,0,2.6,2.6,0,'#ff9a1a','#4a2a00',.8);   // cannone organico con bocca acida
  mEll(g,-2,0,12.5,15,0,c,'#000',1.2);                                       // guscio
  g.save();g.beginPath();g.ellipse(-2,0,12.5,15,0,0,TAU);g.clip();
  g.strokeStyle='rgba(0,0,0,.5)';g.lineWidth=1.1;
  for(const x of[-10,-5.5,-1,3.5]){g.beginPath();g.moveTo(x,-16);g.quadraticCurveTo(x+3.2,0,x,16);g.stroke()}
  g.restore();
  mLine(g,-14,0,6,0,'rgba(0,0,0,.65)',1.4);                                  // linea elitre
  mEll(g,-8,-6,1.8,1.8,0,'rgba(255,255,255,.3)');mEll(g,-4,7.5,1.5,1.5,0,'rgba(255,255,255,.3)');
  mEll(g,3,0,6.2,6,0,'#27381f','#0d1a0a',1.2);                               // testa
  mEll(g,6,-2.6,1.8,1.8,0,'#8dff3a');mEll(g,6,2.6,1.8,1.8,0,'#8dff3a');mEll(g,3.2,-4.4,1,1,0,'#8dff3a');mEll(g,3.2,4.4,1,1,0,'#8dff3a');   // occhi
  g.strokeStyle='#27381f';g.lineWidth=1.1;g.beginPath();g.moveTo(8,-1.4);g.quadraticCurveTo(16,-4.6,21,-12);g.moveTo(8,1.4);g.quadraticCurveTo(16,4.6,21,12);g.stroke();   // antenne
  if(fl){g.fillStyle='#fff';g.beginPath();g.arc(31,0,4,0,TAU);g.fill()}
 },
 // 5: Inferno — lanciafiamme: due bombole a strisce di pericolo, tubi, spalle a punte, maschera antigas, fiamma pilota
 (g,c,fl)=>{
  g.lineJoin='round';
  mRect(g,-15,-11,10,8.5,'#d9a400','#000',1);mRect(g,-15,2.5,10,8.5,'#d9a400','#000',1);   // bombole
  for(const x of[-12.5,-9.5,-6.5]){mLine(g,x,-11,x,-2.5,'rgba(0,0,0,.6)',1);mLine(g,x,2.5,x,11,'rgba(0,0,0,.6)',1)}
  mEll(g,-5,-6.7,1.5,1.5,0,'#c0392b','#000',.6);mEll(g,-5,6.7,1.5,1.5,0,'#c0392b','#000',.6);   // valvole
  g.strokeStyle='#2a2a2a';g.lineWidth=1.8;g.beginPath();g.moveTo(-5,-6.7);g.quadraticCurveTo(0,-8,7,-2.6);g.moveTo(-5,6.7);g.quadraticCurveTo(0,8,7,2.6);g.stroke();   // tubi
  mEll(g,0,0,8.5,13,0,c,'#000',1.2);
  mPoly(g,[[-3,-5],[2,-2],[0,0],[3,3],[-1,6],[-4,2],[-2,-1]],'rgba(255,140,20,.85)');   // fiamma sul torace
  mPoly(g,[[-3,-8],[-1,-14],[1,-10],[3,-16],[5,-10],[8,-13],[8,-7]],c,'#111',1.4);     // spalla a punte
  mPoly(g,[[-3,8],[-1,14],[1,10],[3,16],[5,10],[8,13],[8,7]],c,'#111',1.4);
  mEll(g,7,-6,5,2.8,.3,c,'#000',1);mEll(g,10,6,5,2.8,-.3,c,'#000',1);
  mRect(g,6,-3,19,6,'#2a2a2a','#888',.8);mRect(g,10,-4,6,8,'#3a3a3a','#000',.8);      // lancia
  mPoly(g,[[25,-3.5],[29,-5.6],[29,5.6],[25,3.5]],'#555','#000',1);                  // ugello
  mEll(g,31.5,0,2.2,1.5,0,'#ff8a1a');mEll(g,31.5,0,1.2,.8,0,'#ffe066');             // fiamma pilota
  mEll(g,0,0,7.2,7.2,0,'#4a4a4a','#111',1.3);                                          // elmetto
  mEll(g,6.5,0,3,3,0,'#1f1f1f','#888',.9);mEll(g,6.5,0,1.1,1.1,0,'#555');             // filtro antigas
  mEll(g,3,-3.2,1.7,1.7,0,'#ff9a1a','#000',.6);mEll(g,3,3.2,1.7,1.7,0,'#ff9a1a','#000',.6);   // occhiali
  if(fl){g.fillStyle='#ff9a1a';g.beginPath();g.arc(32,0,5,0,TAU);g.fill();g.fillStyle='#fff3a0';g.beginPath();g.arc(32,0,2.8,0,TAU);g.fill()}
 },
 // 6: Hornet — vespa missilistica: due lanciamissili sulle spalle con 6 testate ciascuno, busto a strisce, pungiglione, visore a occhio di insetto
 (g,c,fl)=>{
  g.lineJoin='round';
  mPoly(g,[[-8,-3],[-18,0],[-8,3]],'#e6b422','#000',1);                      // pungiglione
  mEll(g,-1,0,7.5,11,0,c,'#000',1.2);
  g.save();g.beginPath();g.ellipse(-1,0,7.5,11,0,0,TAU);g.clip();g.fillStyle='rgba(0,0,0,.6)';g.fillRect(-9,-12,3,24);g.fillRect(-3,-12,3,24);g.fillRect(3,-12,3,24);g.restore();   // strisce da vespa
  for(const s of[-1,1]){                                                      // lanciamissili
   mRect(g,-6,s<0?-21:11,19,10,'#2a2a2a','#000',1.2);mRect(g,-5,s<0?-20:12,17,8,'#3b3b3b');
   for(let r=0;r<2;r++)for(let k=0;k<3;k++){const x=-1+k*5.5,y=(s<0?-18:14)+r*4;mEll(g,x+2.5,y,1.9,1.9,0,'#111');mEll(g,x+2.5,y,1,1,0,'#e53a2a')}
   mEll(g,6+(s<0?1:2),s*6,5,2.6,s*-.3,c,'#000',1);                             // braccio
  }
  mRect(g,5,-3.8,19,2.3,'#1a1a1a','#888',.7);mRect(g,5,1.5,19,2.3,'#1a1a1a','#888',.7);mRect(g,8,-4.4,6,8.8,'#333');   // mitragliatrice gemella
  mEll(g,0,0,6.8,6.8,0,'#3a3a3a','#000',1.2);
  g.fillStyle='#ff6a00';g.strokeStyle='#000';g.lineWidth=.8;g.beginPath();g.arc(0,0,6.2,-.95,.95);g.arc(0,0,3,.95,-.95,true);g.closePath();g.fill();g.stroke();   // visore ad occhio composto
  mLine(g,4,-3.5,4,3.5,'rgba(0,0,0,.45)',.7);mLine(g,5.6,-2,5.6,2,'rgba(0,0,0,.45)',.7);
  g.strokeStyle='#e6b422';g.lineWidth=1;g.beginPath();g.moveTo(5,-2);g.quadraticCurveTo(10,-5,14,-6);g.moveTo(5,2);g.quadraticCurveTo(10,5,14,6);g.stroke();   // antennine
  if(fl){g.fillStyle='#fff';g.beginPath();g.arc(25,-2.6,3,0,TAU);g.arc(25,2.6,3,0,TAU);g.fill()}
 },
 // 7: Corsair — pirata: tricorno con piuma rossa, teschio e tibie incrociate sullo zaino, archibugio con bocca svasata
 (g,c,fl)=>{
  g.lineJoin='round';g.lineCap='round';
  mRect(g,-15,-9,9,18,'#2a2a2a','#000',1);                                   // zaino
  mLine(g,-14.2,-7.5,-6.8,7.5,'#eee',1.7);mLine(g,-14.2,7.5,-6.8,-7.5,'#eee',1.7);   // tibie
  mEll(g,-10.5,0,3.6,3.4,0,'#f2f2f2','#000',.8);mRect(g,-8.2,-1.5,2.2,3,'#f2f2f2','#000',.6);   // teschio
  mEll(g,-11.3,-1.3,.95,.95,0,'#000');mEll(g,-11.3,1.3,.95,.95,0,'#000');
  mEll(g,-1,0,8.5,14,0,c,'#000',1.2);                                        // busto
  for(const x of[-5,-1.5,2])mLine(g,x,-10.5,x,10.5,'rgba(255,255,255,.4)',1.1);   // maglia a righe
  mRect(g,-1.5,-13,2.6,26,'#5a3a1a','#000',.7);mRect(g,-2,-2,3.6,4,'#d4a017','#5a4208',.6);   // cintura con fibbia
  mEll(g,0,-9,5.5,4.2,0,c,'#111',1.2);mEll(g,0,9,5.5,4.2,0,c,'#111',1.2);    // spalle
  mEll(g,7,-6.5,5,2.8,.3,c,'#000',1);mEll(g,11,6.5,5,2.8,-.3,c,'#000',1);
  mPoly(g,[[5,-2],[20,-2.8],[30,-7],[30,7],[20,2.8],[5,2]],'#8a6a2a','#000',1);          // archibugio svasato
  mRect(g,12,-3.4,1.8,6.8,'#d4a017');mRect(g,19,-3.8,1.8,7.6,'#d4a017');
  mEll(g,30,0,1.9,5.6,0,'#0e0e0e');                                          // bocca
  g.fillStyle='#1c1c1c';g.strokeStyle='#d4a017';g.lineWidth=1.3;                // tricorno
  g.beginPath();g.moveTo(10,0);g.quadraticCurveTo(2,-3,-3,-11);g.quadraticCurveTo(-5.5,0,-3,11);g.quadraticCurveTo(2,3,10,0);g.closePath();g.fill();g.stroke();
  mEll(g,0,0,4.2,4.2,0,'#2e2e2e','#000',.8);
  g.strokeStyle='#e02a2a';g.lineWidth=2;g.beginPath();g.moveTo(-1,-3.5);g.quadraticCurveTo(-5,-7.5,-9.5,-8.5);g.stroke();     // piuma
  g.strokeStyle='#ff8a7a';g.lineWidth=.7;g.beginPath();g.moveTo(-1,-3.5);g.quadraticCurveTo(-5,-7.2,-8.6,-8.2);g.stroke();
  if(fl){g.fillStyle='#fff';g.beginPath();g.arc(33,0,6,0,TAU);g.fill()}
 }
];
// Fine della canna di ogni modello (x locale, prua verso +x, prima della scala): da qui partono i colpi.
const GRUNT_MUZZLE=[30,36,34,34,28,29,24,30];   // Assault, Valkyrie (freno di bocca), Juggernaut, Ronin, Scarab, Inferno (ugello), Hornet, Corsair
const gruntMuzzle=p=>p.vid>=0?(p.pas?VEH_T[p.vk].r*.5:VEH_T[p.vk].mz):(GRUNT_MUZZLE[p.mi|0]||GRUNT_MUZZLE[0])*(p.air?1:MECH_SCALE);   // a terra il mech è scalato, in Air no · a bordo: bocca dell'arma del veicolo

function torso(g,col){
 g.fillStyle='#333';g.strokeStyle='#111';g.lineWidth=1;
 g.beginPath();g.rect(-13,-6,6,14);g.fill();g.stroke();
 g.fillStyle=col;g.strokeStyle='#000';g.beginPath();g.ellipse(-2,0,8,15,0,0,TAU);g.fill();g.stroke();
 
 g.fillStyle=col;
 g.strokeStyle='#111';
 g.lineWidth=1.5;
 
 // Spallaccio superiore (portato da -13 a -8 per avvicinarlo al centro)
 g.beginPath();
 g.arc(0, -9, 7, Math.PI, TAU);
 g.closePath();
 g.fill();
 g.stroke();

 // Spallaccio inferiore (portato da 13 a 8 per avvicinarlo al centro)
 g.beginPath();
 g.arc(0, 9, 7, 0, Math.PI);
 g.closePath();
 g.fill();
 g.stroke();
}

// Fonte unica del corpo del Grunt (non Air): disegnato sul contesto g, centrato nell'origine, prua verso +x.
// Usata dal gioco (mech) e dalla schermata di configurazione (cfgMechDraw), così ogni futura modifica al Grunt
// si riflette automaticamente anche nell'anteprima di configurazione.
function drawGruntBody(g, ci, fl, mi){
 g.save();
 g.scale(MECH_SCALE, MECH_SCALE);
 const col = COLS[ci||0][0];
 (GRUNT_MODELS[mi||0]||GRUNT_MODELS[0])(g, col, fl);
 g.restore();
}

// ===== danni visibili: 4 livelli in base alla vita (niente · pochi · parecchi · moltissimi) =====
// bio=1 → sangue e bruciature mescolati (mech dei giocatori e nemici umanoidi) · bio=0 → solo annerimenti e crepe (nemici meccanici; al livello massimo anche braci accese)
// Si disegnano nella trasformazione GIÀ attiva del corpo (nessun save/restore in più) con 2-3 tracciati in tutto.
// La disposizione è fissa per ogni unità (dal suo id) e resta salvata sull'oggetto (t._dmS): sparisce da sola quando l'unità muore.
// Salendo di livello si aggiungono segni nuovi, quelli già presenti restano dove sono.
const DMG_N=[0,3,7,13];   // segni per livello
const dmgLvl=t=>{const f=(t.hp||0)/(t.mhp||t.hpMax||100);return f>=1?0:f>=.7?1:f>=.4?2:3};   // piena · 70–99% · 40–69% · 0–39%
// zone del corpo per il sangue, in coordinate del mech (x verso la mira): [x, y, semiasse x, semiasse y, grandezza delle macchie]
// convertite nelle coordinate normalizzate di dmgOn rispetto al mech di riferimento (ox=-2, ex=8, ey=12); su omini e altri corpi si adattano da sole
const DMG_ZONE=[[-4,0,4,7,1],[0,0,3,3,.8],[0,-10,4,3,.85],[0,10,4,3,.85],[8,-7.5,3.5,2,.7],[11,8,3.5,2,.7]].map(z=>[(z[0]+2)/8,z[1]/12,z[2]/8,z[3]/12,z[4]]);   // busto · testa · spallaccio sx · dx · braccio sx · dx
const DMG_SEQ=[0,2,5,1,3,4,0,4,3,5,2,0,1];   // ordine delle zone: già al primo livello le macchie stanno su busto, spallaccio e braccio
function dmgSet(t,bio){let S=t._dmS;if(S)return S;S=t._dmS=[];const sd=((t.id|0)+1)*7919,mir=hs(0,99,sd)<.5?1:-1;   // mir: lato sinistro/destro scambiato a caso fra un'unità e l'altra
 for(let i=0;i<DMG_N[3];i++){const R=k=>hs(i,k,sd);
  const a=R(1)*TAU,d=Math.sqrt(R(2)),r=1.3+R(3)*2,rx=r*(1+R(5)*.6),ro=R(6)*TAU;
  let u=Math.cos(a)*d,v=Math.sin(a)*d,z=1;
  if(bio){const Z=DMG_ZONE[DMG_SEQ[i]];u=Z[0]+u*Z[2];v=(Z[1]+v*Z[3])*mir;z=Z[4]}   // sangue: punto a caso dentro la zona del corpo
  const sc=!bio||((i%2==1)!==(R(60)<.25));   // bruciatura? meccanici: sempre · umanoidi: alternate al sangue, con uno scambio a caso ogni 4 circa
  const dots=[],nd=2+(R(4)*3|0);if(!sc)for(let j=0;j<nd;j++){const b=R(10+j)*TAU,e=r*(1+R(20+j)*1.2);dots.push([Math.cos(b)*e*z,Math.sin(b)*e*z,(.4+R(30+j)*.8)*z])}   // schizzi attorno (solo sangue)
  const ck=[];if(sc&&(bio||i%2==0)){let ca=R(7)*TAU,cx=0,cy=0;for(let j=0;j<3;j++){ca+=(R(40+j)-.5)*1.4;const l=(2+R(50+j)*3)*z;cx+=Math.cos(ca)*l;cy+=Math.sin(ca)*l;ck.push([cx,cy])}}   // crepa spezzata (solo bruciature)
  S.push({u,v,r:r*z,rx:rx*z,c:Math.cos(ro),s:Math.sin(ro),ro,sc,dots,ck})}
 return S}
// ox = centro del corpo sull'asse x locale · ex,ey = semiassi dell'area dove cadono i segni · rs = grandezza dei segni
function dmgOn(g,t,bio,ox,ex,ey,rs){const n=DMG_N[dmgLvl(t)];if(!n)return;const S=dmgSet(t,bio);
 let nb=0,ns=0;for(let i=0;i<n;i++)if(S[i].sc)ns++;else nb++;   // quante bruciature e quante macchie di sangue a questo livello: si disegna solo ciò che c'è
 if(ns){const k=rs*1.35;   // 1. bruciature: annerimento (più largo di una macchia) + crepe
  g.fillStyle='rgba(18,14,12,.55)';g.beginPath();
  for(let i=0;i<n;i++){const b=S[i];if(!b.sc)continue;const x=ox+b.u*ex,y=b.v*ey,rx=b.rx*k;g.moveTo(x+rx*b.c,y+rx*b.s);g.ellipse(x,y,rx,b.r*k,b.ro,0,TAU)}
  g.fill();
  g.strokeStyle='rgba(8,6,5,.85)';g.lineWidth=.9*rs;g.beginPath();const q=rs*.6;   // crepe corte: restano dentro la sagoma
  for(let i=0;i<n;i++){const b=S[i];if(!b.ck.length)continue;const x=ox+b.u*ex,y=b.v*ey;g.moveTo(x,y);for(const p of b.ck)g.lineTo(x+p[0]*q,y+p[1]*q)}
  g.stroke()}
 if(nb){g.fillStyle='rgba(110,6,6,.88)';g.beginPath();   // 2. sangue: macchia + schizzi, poi il centro più chiaro (sangue fresco)
  for(let i=0;i<n;i++){const b=S[i];if(b.sc)continue;const x=ox+b.u*ex,y=b.v*ey,rx=b.rx*rs;g.moveTo(x+rx*b.c,y+rx*b.s);g.ellipse(x,y,rx,b.r*rs,b.ro,0,TAU);
   for(const d of b.dots){const dx=x+d[0]*rs,dy=y+d[1]*rs,dr=d[2]*rs;g.moveTo(dx+dr,dy);g.arc(dx,dy,dr,0,TAU)}}
  g.fill();
  g.fillStyle='rgba(170,16,16,.8)';g.beginPath();
  for(let i=0;i<n;i++){const b=S[i];if(b.sc)continue;const x=ox+b.u*ex,y=b.v*ey,h=b.rx*rs*.5;g.moveTo(x+h*b.c,y+h*b.s);g.ellipse(x,y,h,b.r*rs*.5,b.ro,0,TAU)}
  g.fill()}
 if(!bio&&n>=DMG_N[3]){g.fillStyle='rgba(255,120,30,'+(.55+.35*Math.sin(G.t*9+(t.id|0)))+')';g.beginPath();   // braci che pulsano (solo meccanici, a vita molto bassa)
  for(let i=0;i<4;i++){const b=S[i],x=ox+b.u*ex,y=b.v*ey,r=.9*rs;g.moveTo(x+r,y);g.arc(x,y,r,0,TAU)}
  g.fill()}}
function mech(p,off,shadow){
 if(p.vid>=0){if(!p.pas)vehDrawPl(p,off,shadow);return}   // a bordo di un veicolo: si disegna il mezzo al posto del mech (il passeggero non si disegna: è dentro)
 ctx.save();if(p.stl)ctx.globalAlpha*=STL_A;ctx.translate(p.x+off,p.y+off*1.3);const col=COLS[p.ci||0][0],mi=p.mi|0,model=GRUNT_MODELS[mi]||GRUNT_MODELS[0];
 if(p.air){
  if(shadow){ctx.rotate(p.h);ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,0,10,16,0,0,TAU);ctx.rect(-13,-8,7,16);ctx.arc(0,0,8,0,TAU);ctx.rect(-21,-11,20,9);ctx.rect(-21,2,20,9);ctx.fill()}
  else{
   // propulsori Air: orientati nella direzione di moto (p.h) e NON ruotano col corpo
   ctx.save();ctx.rotate(p.h);ctx.strokeStyle='#aaa';ctx.lineWidth=.8;ctx.fillStyle='#222';
   ctx.fillRect(-21,-11,20,9);ctx.strokeRect(-21,-11,20,9);
   ctx.fillRect(-21,2,20,9);ctx.strokeRect(-21,2,20,9);
   if(p===P&&(typeof KB!=='undefined'&&KB.up)){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-23,-6,4,0,TAU);ctx.arc(-23,6,4,0,TAU);ctx.fill()}
   ctx.restore();
   // corpo del modello verso la mira (uguale per tutti i modelli, incluso il modello 0)
   ctx.save();ctx.rotate(p.fa);model(ctx,col,p.fl>0);dmgOn(ctx,p,1,-1,8,11,1.25);ctx.restore()}}
 else{ctx.rotate(p.fa);
  const GS=MECH_SCALE;
  if(shadow){ctx.save();ctx.scale(GS,GS);ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,0,10,16,0,0,TAU);ctx.rect(-13,-8,7,16);ctx.arc(0,0,8,0,TAU);ctx.rect(4,-3,24,6);ctx.fill();ctx.restore()}
  else{ctx.save();ctx.scale(GS,GS);model(ctx,col,p.fl>0);dmgOn(ctx,p,1,-1,8,11,1.25);ctx.restore()}}
 if(!shadow&&p.shs&&p.shs.some(t=>t<=0)){ctx.strokeStyle='rgba(143,227,255,.7)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,p.air?24:22*MECH_SCALE,0,TAU);ctx.stroke()}
 ctx.restore()}
// mech incapacitato: grigio, con croce rossa e un anello come quello del reload (grigio + arco giallo) che si riempie mentre un alleato lo rialza
function downedFx(q){
 ctx.save();ctx.globalAlpha=.45;mech(q,0,false);ctx.restore();
 ctx.save();ctx.translate(q.x,q.y);
 ctx.scale(MECH_SCALE,MECH_SCALE);   // coerente col mech Grunt ridotto
 ctx.strokeStyle='#ff5a4a';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-11,-11);ctx.lineTo(11,11);ctx.moveTo(11,-11);ctx.lineTo(-11,11);ctx.stroke();
 ctx.lineWidth=5;ctx.strokeStyle='#5a5a5a';ctx.beginPath();ctx.arc(0,0,30,0,TAU);ctx.stroke();
 const f=clamp(q.rv||0,0,1);if(f>0){ctx.strokeStyle='#ffc400';ctx.beginPath();ctx.arc(0,0,30,-Math.PI/2,-Math.PI/2+f*TAU);ctx.stroke()}
 ctx.restore();if(q!==P)nameTag(q)}
function nameTag(q){if(G.mode==1&&q.stl)return;if(q.vid>=0&&q.pas)return;   // passeggero: è dentro il mezzo, si vede solo il nome di chi guida   // deathmatch: lo stealth attivo nasconde anche il nome
 ctx.save();ctx.font='bold 12px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.strokeStyle='#000';ctx.lineWidth=3;ctx.strokeText(q.name,q.x,q.y-28);ctx.fillStyle=COLS[q.ci||0][0];ctx.fillText(q.name,q.x,q.y-28);ctx.restore()}
// ===== nemici: stesse forme di prima; l'orientamento del mech coincide con la direzione di tiro =====

// Missile aria-superficie visto dall'alto, rivolto verso +x, CENTRATO sull'origine
// (metà corpo davanti, metà dietro rispetto al centro di rotazione della torretta).
// w = larghezza (px), l = lunghezza totale (px), col = colore del corpo.
function drawRocket(w,l,col){
 const hw=w/2, hl=l/2, tipStart=hl*0.55;                 // tipStart = dove finisce il corpo e inizia il cono
 // corpo cilindrico
 ctx.fillStyle=col||'#cfd3d8'; ctx.strokeStyle='#111'; ctx.lineWidth=.9;
 ctx.beginPath(); ctx.roundRect(-hl,-hw,tipStart+hl,hw*2,hw*.85); ctx.fill(); ctx.stroke();
 // punta a cono (rossa)
 ctx.fillStyle='#d32f2f';
 ctx.beginPath(); ctx.moveTo(tipStart,-hw); ctx.lineTo(hl,0); ctx.lineTo(tipStart,hw); ctx.closePath();
 ctx.fill(); ctx.stroke();
 // alette posteriori (due per lato, in vista top-down)
 ctx.fillStyle='#4a4a4a';
 ctx.beginPath(); ctx.moveTo(-hl,-hw); ctx.lineTo(-hl+4,-hw-2.5); ctx.lineTo(-hl+4,hw+2.5); ctx.lineTo(-hl,hw); ctx.closePath();
 ctx.fill(); ctx.stroke();
 // ugello posteriore
 ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(-hl+2,0,hw*.6,0,TAU); ctx.fill();
}

function unitBody(t){ctx.save();ctx.translate(t.x,t.y);const a=t.h||0, c=t.ci!=null?COLS[t.ci][0]:t.sec?(G.alCi!=null?COLS[G.alCi][0]:'#2aa6d9'):((G.mode!=1&&G.aiCi!=null)?COLS[G.aiCi][0]:null);   // sec = AI alleata (guardie, torrette alleate): colore dell'AI alleata (azzurro di riserva)
 if(t.ar>0){ctx.strokeStyle='rgba(255,210,63,.7)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,t.k==6?31:t.k==5?34:t.k==UK_APC?28:t.k==0?30:t.k==4?26:t.k==2?30:t.k==3?22:18*MECH_SCALE,0,TAU);ctx.stroke()}
 if(t.k==1){ctx.save();ctx.rotate(a);ctx.scale(MECH_SCALE,MECH_SCALE);const col=c||'#a82c2c';
  // 1. Gruppo braccia e arma (stessa anatomia del player)
  ctx.strokeStyle='#aaa';ctx.lineWidth=.8;ctx.fillStyle='#111';ctx.beginPath();ctx.rect(4,-2.5,26,5);ctx.fill();ctx.stroke();
  ctx.fillStyle='#2a2a2a';ctx.beginPath();ctx.rect(8,-3.5,12,7);ctx.fill();ctx.stroke();
  ctx.fillStyle=col;ctx.strokeStyle='#000';ctx.lineWidth=1;
  ctx.beginPath();ctx.ellipse(7,-8,7,4,.3,0,TAU);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.ellipse(10,9,7,4,-.3,0,TAU);ctx.fill();ctx.stroke();
  ctx.fillStyle='#1d1d1d';ctx.strokeStyle='#aaa';ctx.lineWidth=.8;
  ctx.beginPath();ctx.arc(12,-5,3,0,TAU);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.arc(15,6,3,0,TAU);ctx.fill();ctx.stroke();
  if(t.fl>0){ctx.fillStyle='#fff';circle(30,0,5)}
  // 2. Torso, zaino posteriore e nuovi spallacci a ±9px
  ctx.fillStyle='#333';ctx.strokeStyle='#111';ctx.lineWidth=1;
  ctx.beginPath();ctx.rect(-13,-6,6,14);ctx.fill();ctx.stroke();
  ctx.fillStyle=col;ctx.strokeStyle='#000';ctx.beginPath();ctx.ellipse(-2,0,8,15,0,0,TAU);ctx.fill();ctx.stroke();
  ctx.fillStyle=col;ctx.strokeStyle='#111';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(0,-9,7,Math.PI,TAU);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.arc(0,9,7,0,Math.PI);ctx.closePath();ctx.fill();ctx.stroke();
  // 3. Casco tattico (verde militare scuro con doppi sensori rossi)
  ctx.fillStyle='#434d43';ctx.beginPath();ctx.arc(0,0,7.5,0,TAU);ctx.fill();ctx.strokeStyle='#1c241c';ctx.lineWidth=1.2;ctx.stroke();
  ctx.fillStyle='#ff2222';circle(5.5,-2.5,1.2);circle(5.5,2.5,1.2);
  dmgOn(ctx,t,1,-2,8,12,1.25);   // sangue
  ctx.restore()}
 else if(t.k==UK_SWD){ctx.save();ctx.rotate(a);ctx.scale(MECH_SCALE,MECH_SCALE);const col=c||'#a82c2c',sw=slashes.some(s=>s.id===t.id);
  // piccola mitraglia nella mano libera (sinistra, centrata su y=-5)
  ctx.strokeStyle='#aaa';ctx.lineWidth=.8;ctx.fillStyle='#111';ctx.beginPath();ctx.rect(9,-6.4,16,2.8);ctx.fill();ctx.stroke();
  ctx.fillStyle='#2a2a2a';ctx.beginPath();ctx.rect(11,-7.2,7,4.4);ctx.fill();ctx.stroke();
  // braccia e mani normali del mech (sotto busto e spallacci, come in t.k==1)
  ctx.fillStyle=col;ctx.strokeStyle='#000';ctx.lineWidth=1;
  ctx.beginPath();ctx.ellipse(7,-8,7,4,.3,0,TAU);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.ellipse(10,9,7,4,-.3,0,TAU);ctx.fill();ctx.stroke();
  ctx.fillStyle='#1d1d1d';ctx.strokeStyle='#aaa';ctx.lineWidth=.8;
  ctx.beginPath();ctx.arc(12,-5,3,0,TAU);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.arc(15,6,3,0,TAU);ctx.fill();ctx.stroke();
  // zaino, torso e spallacci sopra alle braccia
  ctx.fillStyle='#333';ctx.strokeStyle='#111';ctx.lineWidth=1;ctx.beginPath();ctx.rect(-13,-6,6,14);ctx.fill();ctx.stroke();
  ctx.fillStyle=col;ctx.strokeStyle='#000';ctx.beginPath();ctx.ellipse(-2,0,8,15,0,0,TAU);ctx.fill();ctx.stroke();
  ctx.strokeStyle='#111';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(0,-9,7,Math.PI,TAU);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.arc(0,9,7,0,Math.PI);ctx.closePath();ctx.fill();ctx.stroke();
  // casco con cresta rossa
  ctx.fillStyle='#434d43';ctx.beginPath();ctx.arc(0,0,7.5,0,TAU);ctx.fill();ctx.strokeStyle='#1c241c';ctx.lineWidth=1.2;ctx.stroke();
  ctx.fillStyle='#d9381e';ctx.beginPath();ctx.rect(-7,-1.6,13,3.2);ctx.fill();
  ctx.fillStyle='#ff2222';circle(5.5,-2.5,1.2);circle(5.5,2.5,1.2);
  dmgOn(ctx,t,1,-2,8,12,1.25);   // sangue
// spada a riposo: parte dalla mano destra (15, 6), passa sullo spallaccio destro e punta verso il retro
  if(!sw){ctx.save();ctx.translate(15,6);ctx.rotate(2.78);ctx.scale(.68,.85);ctx.translate(-11,0);drawBlade(ctx);ctx.restore()}
  ctx.restore()}
 else if(t.k==6){const pu=.5+.5*Math.sin(performance.now()/180);ctx.strokeStyle='rgba(255,60,60,'+(.35+.4*pu)+')';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,27+2.5*pu,0,TAU);ctx.stroke();
  ctx.save();ctx.rotate(a);ctx.scale(1.1,1.1);const col=c||'#c9a227';
  // 1. Gruppo armi pesante d'élite
  ctx.strokeStyle='#aaa';ctx.lineWidth=.8;ctx.fillStyle='#111';ctx.beginPath();ctx.rect(4,-3.5,28,7);ctx.fill();ctx.stroke();
  ctx.fillStyle='#8a1c1c';ctx.beginPath();ctx.rect(8,-4.5,14,9);ctx.fill();ctx.stroke();
  ctx.fillStyle=col;ctx.strokeStyle='#000';ctx.lineWidth=1;
  ctx.beginPath();ctx.ellipse(7,-8,7,4,.3,0,TAU);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.ellipse(10,9,7,4,-.3,0,TAU);ctx.fill();ctx.stroke();
  ctx.fillStyle='#1d1d1d';ctx.strokeStyle='#aaa';ctx.lineWidth=.8;
  ctx.beginPath();ctx.arc(12,-5,3,0,TAU);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.arc(15,6,3,0,TAU);ctx.fill();ctx.stroke();
  if(t.fl>0){ctx.fillStyle='#fff';circle(32,0,6)}
  // 2. Torso corazzato d'élite con spallacci a ±9px
  ctx.fillStyle='#222';ctx.strokeStyle='#111';ctx.lineWidth=1;
  ctx.beginPath();ctx.rect(-13,-6,6,14);ctx.fill();ctx.stroke();
  ctx.fillStyle=col;ctx.strokeStyle='#000';ctx.beginPath();ctx.ellipse(-2,0,8,15,0,0,TAU);ctx.fill();ctx.stroke();
  ctx.fillStyle=col;ctx.strokeStyle='#111';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.arc(0,-9,7,Math.PI,TAU);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.arc(0,9,7,0,Math.PI);ctx.closePath();ctx.fill();ctx.stroke();
  // 3. Casco d'élite blindato (sensori visivi rossi potenziati)
  ctx.fillStyle='#2c302c';ctx.beginPath();ctx.arc(0,0,7.5,0,TAU);ctx.fill();ctx.strokeStyle='#111';ctx.lineWidth=1.2;ctx.stroke();
  ctx.fillStyle='#ff1a1a';circle(5.5,-2.5,1.4);circle(5.5,2.5,1.4);
  dmgOn(ctx,t,1,-2,8,12,1.25);   // sangue
  ctx.restore()}
 else if(t.k==4){ctx.save();ctx.rotate(a);ctx.fillStyle='#2f4a2b';ctx.strokeStyle='#111';ctx.lineWidth=1.5;for(let i=0;i<4;i++){const q=i*Math.PI/2+Math.PI/4;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(q)*22,Math.sin(q)*22);ctx.stroke()}
  ctx.beginPath();for(let i=0;i<6;i++){const q=i*Math.PI/3;ctx.lineTo(Math.cos(q)*14,Math.sin(q)*14)}ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#111';ctx.strokeStyle='#aaa';ctx.lineWidth=1;ctx.fillRect(4,-1.5,60,3);ctx.strokeRect(4,-1.5,60,3);ctx.fillStyle='#555';ctx.fillRect(16,-2.5,12,5);
  ctx.fillStyle=c||'#6f9a4a';circle(0,0,9);ctx.strokeStyle='#111';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#ff2222';circle(7,0,2);if(t.fl>0){ctx.fillStyle='#fff';circle(66,0,3)}dmgOn(ctx,t,0,0,10,10,1);ctx.restore()}
 else if(t.k==5){
  const baseCol=c||'#6b2424';
  const thrA=(t.thr!=null?t.thr:a);   // rotazione torretta (fallback: h)
  // ===== SCAFO (rotazione a = t.h) =====
  ctx.save();ctx.rotate(a);
  // 1. cingoli
  ctx.fillStyle='#2b2b30';ctx.strokeStyle='#111';ctx.lineWidth=1.5;
  ctx.fillRect(-28,-22,56,10);ctx.strokeRect(-28,-22,56,10);
  ctx.fillRect(-28,12,56,10);ctx.strokeRect(-28,12,56,10);
  // maglie che scorrono: spostamento lungo lo scafo misurato fra un disegno e il successivo (in retromarcia scorrono al contrario)
  if(t._tpx!=null){const dx=t.x-t._tpx,dy=t.y-t._tpy;if(dx*dx+dy*dy<4e4)t.wk=(t.wk||0)+dx*Math.cos(a)+dy*Math.sin(a)}
  t._tpx=t.x;t._tpy=t.y;const tko=(((t.wk||0)%6)+6)%6;
  ctx.strokeStyle='#1a1a1d';ctx.lineWidth=2;ctx.beginPath();
  for(let i=-26+tko;i<=26;i+=6){ctx.moveTo(i,-21);ctx.lineTo(i,-13);ctx.moveTo(i,13);ctx.lineTo(i,21)}ctx.stroke();
  // 2. scafo
  ctx.fillStyle=baseCol;ctx.strokeStyle='#111';ctx.lineWidth=2;
  ctx.fillRect(-24,-14,48,28);ctx.strokeRect(-24,-14,48,28);
  ctx.fillStyle=shade(baseCol,-.18);ctx.fillRect(-18,-8,36,16);
  ctx.restore();
  // ===== TORRETTA (rotazione thrA, indipendente) =====
  ctx.save();ctx.rotate(thrA);
  // 3. anello base della torretta
  ctx.fillStyle='#1a1a1a';ctx.beginPath();ctx.arc(0,0,17,0,TAU);ctx.fill();
  ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.stroke();
  // 4. corpo della torretta
  ctx.fillStyle=shade(baseCol,.12);ctx.beginPath();ctx.arc(0,0,14,0,TAU);ctx.fill();
  ctx.strokeStyle='#111';ctx.lineWidth=1.8;ctx.stroke();
  // 5. cupola del capocarro + visore frontale
  ctx.fillStyle='#222';ctx.beginPath();ctx.arc(-3,-2,5,0,TAU);ctx.fill();
  ctx.strokeStyle='#555';ctx.lineWidth=1;ctx.stroke();
  ctx.fillStyle='#444';ctx.fillRect(0,-2.5,4,5);
  // 6. arma sopra la torretta (due varianti)
  if(t.tv){
   // lanciarazzi: due missili veri, ciascuno centrato sull'origine (metà avanti / metà dietro il centro torretta)
   ctx.save(); ctx.translate(0,-7); drawRocket(6,30,'#cfd3d8'); ctx.restore();   // missile superiore
   ctx.save(); ctx.translate(0, 7); drawRocket(6,30,'#cfd3d8'); ctx.restore();   // missile inferiore
   if(t.fl>0){ctx.fillStyle='#fff';circle(18,-7,4);circle(18,7,4)}                 // flash di sparo davanti alla punta
  }else{
   ctx.fillStyle='#222';ctx.strokeStyle='#888';ctx.lineWidth=1;
   ctx.fillRect(10,-5,32,10);ctx.strokeRect(10,-5,32,10);
   ctx.fillStyle='#333';ctx.fillRect(40,-6,8,12);ctx.strokeStyle='#666';ctx.strokeRect(40,-6,8,12);
   ctx.fillStyle='#111';ctx.fillRect(46,-4,3,8);
   if(t.fl>0){ctx.fillStyle='#fff';circle(48,0,7)}
  }
  ctx.restore();
  ctx.rotate(a);dmgOn(ctx,t,0,0,20,11,1.6);   // danni sopra scafo e torretta (il ctx.restore finale di unitBody annulla la rotazione)
 }
 else if(t.k==UK_APC){const bc=c||'#3f4d24',S=.85;
  // scafo: lo stesso blindato che gira per le strade (senza torretta), nel colore dell'AI
  ctx.save();ctx.rotate(a);ctx.scale(S,S);
  CIV_SH(ctx,52,22);CIV_WH(ctx,[-18,-2,16],22);CIV_BODY(ctx,bc,52,22,5);
  ctx.fillStyle='rgba(0,0,0,.22)';ctx.fillRect(-22,-8,26,16);ctx.fillStyle='rgba(255,255,255,.12)';ctx.fillRect(14,-9,8,18);
  dmgOn(ctx,t,0,0,21,8,1.3);
  ctx.restore();
  // torretta: ruota per conto suo (t.thr), imperniata dove il blindato ha la sua
  ctx.save();ctx.translate(Math.cos(a)*6*S,Math.sin(a)*6*S);ctx.rotate(t.thr!=null?t.thr:a);ctx.scale(S,S);
  ctx.strokeStyle='#222';ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(19,0);ctx.stroke();
  ctx.fillStyle=shade(bc,-.25);ctx.strokeStyle='#111';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,0,6,0,TAU);ctx.fill();ctx.stroke();
  if(t.fl>0){ctx.fillStyle='#fff';circle(21,0,3.5)}
  ctx.restore()}
 else if(t.k==0){ctx.fillStyle='#2b2b30';ctx.strokeStyle='#111';ctx.lineWidth=2;
  for(const[r,c_in]of[[26,'#2b2b30'],[18,'#4a1414']]){ctx.fillStyle=c_in;ctx.beginPath();for(let i=0;i<8;i++){const q=i*Math.PI/4+Math.PI/8;ctx.lineTo(Math.cos(q)*r,Math.sin(q)*r)}ctx.closePath();ctx.fill();ctx.stroke()}
  ctx.rotate(a);ctx.fillStyle='#111';ctx.strokeStyle='#777';ctx.lineWidth=1;ctx.fillRect(8,-10,26,5);ctx.strokeRect(8,-10,26,5);ctx.fillRect(8,5,26,5);ctx.strokeRect(8,5,26,5);
  ctx.fillStyle=c||'#732323';circle(0,0,14);ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#222';ctx.fillRect(-4,-6,12,12);if(t.fl>0){ctx.fillStyle='#fff';circle(36,-7.5,4);circle(36,7.5,4)}dmgOn(ctx,t,0,0,17,17,1.5)}
 ctx.restore()}
// ===== Disegno della Dropship (Ingrandita del 35%) =====
function drawDropship(x, y, angle, ci){
 ctx.save();
 ctx.translate(x, y);
 ctx.rotate(angle + Math.PI/2);
 ctx.scale(2.0, 2.0); // Ingrandita di un ulteriore 35% (da 1.5 a 2.0)
 const shipCi=(ci==null?P.ci:ci)|0;

/*
 // 1. Ombra a terra
 ctx.fillStyle='rgba(0,0,0,.3)';
 ctx.beginPath();
 ctx.ellipse(0, 10, 28, 50, 0, 0, TAU);
 ctx.fill();
*/
 
 // 2. ALI 
 ctx.fillStyle='#2c3238';
 ctx.strokeStyle='#1a1e22';
 ctx.lineWidth=1.2;
 ctx.beginPath();
 // Ala sinistra
 ctx.moveTo(-4, -7);
 ctx.lineTo(-26, -13);
 ctx.lineTo(-33, -3);
 ctx.lineTo(-2, 22);
 ctx.closePath();
 // Ala destra
 ctx.moveTo(4, -7);
 ctx.lineTo(26, -13);
 ctx.lineTo(33, -3);
 ctx.lineTo(2, 22);
 ctx.closePath();
 ctx.fill();
 ctx.stroke();

 // 3. CORPO CENTRALE E CODA
 ctx.fillStyle='#3a4046';
 ctx.strokeStyle='#1a1e22';
 ctx.lineWidth=1.2;
 ctx.beginPath();
 ctx.moveTo(0, -42);   // Punta anteriore (prua)
 ctx.lineTo(16, -16);  // Spalla larga anteriore
 ctx.lineTo(10, 48);   // Estremità posteriore destra (poppa stretta)
 ctx.lineTo(3, 48);    // Interno coda destra
 ctx.lineTo(2, 22);    // Inizio vuoto centrale (interno)
 ctx.lineTo(-2, 22);   // Interno coda sinistra
 ctx.lineTo(-3, 48);   // Estremità posteriore sinistra (poppa stretta)
 ctx.lineTo(-10, 48);  // Estremità posteriore esterna sinistra
 ctx.lineTo(-16, -16); // Spalla larga sinistra
 ctx.closePath();
 ctx.fill();
 ctx.stroke();

 // 3.5 DETTAGLI SULLO SCAFO (Linee dalle torrette all'incavo centrale)
 ctx.strokeStyle='#22272c';
 ctx.lineWidth=1.5;
 ctx.beginPath();
 // Linea dalla torretta sinistra verso l'incavo centrale posteriore (2, 22)
 ctx.moveTo(-15, -10);
 ctx.lineTo(-2, 22);
 // Linea dalla torretta destra verso l'incavo centrale posteriore (2, 22)
 ctx.moveTo(15, -10);
 ctx.lineTo(2, 22);
 // Linea centrale longitudinale di rinforzo dello scafo
 ctx.moveTo(0, -35);
 ctx.lineTo(0, 15);
 ctx.stroke();

 // 4. Tre "occhi rossi" sul muso
 ctx.fillStyle='#ff2222';
 ctx.strokeStyle='#1c241c';
 ctx.lineWidth=1.2;
 // Occhio centrale
 circle(0, -28, 2.4);
 ctx.stroke();
 // Occhio destro
 circle(5, -22, 2.4);
 ctx.stroke();
 // Occhio sinistro
 circle(-5, -22, 2.4);
 ctx.stroke();

 // 5. Motori reattori con parte anteriore a cuneo (taglio a 45° che attraversa tutto il fronte)
 ctx.fillStyle='#15181b';
 ctx.strokeStyle='#555';
 ctx.lineWidth=1;
 
 // Motore sinistro (fronte a punta/cuneo)
 ctx.beginPath();
 ctx.moveTo(-29, -15); // Punta anteriore del cuneo
 ctx.lineTo(-26, -12); // Spalla superiore interna (piatta verso l'interno)
 ctx.lineTo(-26, 3);   // Lato interno verticale
 ctx.lineTo(-33, 3);   // Lato inferiore piatto
 ctx.lineTo(-33, -8);  // Lato esterno dritto
 ctx.closePath();
 ctx.fill();
 ctx.stroke();
 // Linea diagonale del cuneo anteriore
 ctx.beginPath();
 ctx.moveTo(-33, -8);
 ctx.lineTo(-29, -15);
 ctx.stroke();

 // Motore destro (fronte a punta/cuneo)
 ctx.beginPath();
 ctx.moveTo(29, -15);  // Punta anteriore del cuneo
 ctx.lineTo(26, -12);  // Spalla superiore interna (piatta verso l'interno)
 ctx.lineTo(26, 3);    // Lato interno verticale
 ctx.lineTo(33, 3);    // Lato inferiore piatto
 ctx.lineTo(33, -8);   // Lato esterno dritto
 ctx.closePath();
 ctx.fill();
 ctx.stroke();
 // Linea diagonale del cuneo anteriore
 ctx.beginPath();
 ctx.moveTo(33, -8);
 ctx.lineTo(29, -15);
 ctx.stroke();

 // 6. Torrette stilizzate (Colore di fazione: base chiara, canna scura)
 const colPrimary = COLS[shipCi][0];
 const colSecondary = COLS[shipCi][1];

 ctx.strokeStyle='#111';
 ctx.lineWidth=1;

 // Torretta sinistra
 ctx.fillStyle = colPrimary; // Corpo rotondo con la stessa tonalità della canna
 ctx.beginPath();
 ctx.arc(-15, -10, 3.5, 0, TAU);
 ctx.fill();
 ctx.stroke();
 ctx.fillStyle = colPrimary; 
 ctx.fillRect(-16, -16, 2, 7);
 ctx.strokeRect(-16, -16, 2, 7);

 // Torretta destra
 ctx.fillStyle = colPrimary; // Corpo rotondo con la stessa tonalità della canna
 ctx.beginPath();
 ctx.arc(15, -10, 3.5, 0, TAU);
 ctx.fill();
 ctx.stroke();
 ctx.fillStyle = colPrimary; 
 ctx.fillRect(14, -16, 2, 7);
 ctx.strokeRect(14, -16, 2, 7);

 // 7. Fiammelle di scarico allineate (Opacità pulsante veloce)
 // Ciclo di 1000 ms. Moltiplicando per 0.25 e aggiungendo 0.65, il range va da 0.40 a 0.90.
 ctx.globalAlpha = 0.65 + 0.25 * Math.sin(performance.now() * Math.PI / 125);
 
 ctx.fillStyle = colPrimary;
 ctx.fillRect(-33, 3, 7, 4);
 ctx.fillRect(26, 3, 7, 4);
 ctx.fillRect(3, 48, 7, 4);
 ctx.fillRect(-10, 48, 7, 4);
 
 ctx.globalAlpha = 1.0; // Ripristina l'opacità normale per sicurezza

 ctx.restore();
}
function flyBody(t){const k3=t.k==3, c=t.nav?COLS[nvCi()][0]:(G.mode!=1&&G.aiCi!=null)?COLS[G.aiCi][0]:null;    // nav: jet della portaerei, colore proprio
 ctx.save();ctx.translate(t.x+12,t.y+16);ctx.rotate(t.h||0);ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();
 if(k3){ctx.moveTo(20,0);ctx.lineTo(-6,-10);ctx.lineTo(-2,0);ctx.lineTo(-6,10)}else{ctx.moveTo(22,0);ctx.lineTo(6,-8);ctx.lineTo(-14,-26);ctx.lineTo(-8,0);ctx.lineTo(-14,26);ctx.lineTo(6,8)}ctx.closePath();ctx.fill();ctx.restore();
 if(t.ar>0){ctx.strokeStyle='rgba(255,210,63,.7)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(t.x,t.y,k3?22:30,0,TAU);ctx.stroke()}
 ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.h||0);ctx.strokeStyle='#111';ctx.lineWidth=1.5;
 if(k3){ctx.fillStyle='#333';ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(-12,-14);ctx.lineTo(-8,0);ctx.lineTo(-12,14);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle=c||'#d9701a';ctx.beginPath();ctx.moveTo(20,0);ctx.lineTo(-6,-10);ctx.lineTo(-2,0);ctx.lineTo(-6,10);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle=Math.floor(performance.now()/120)%2?'#ff3b3b':'#7a0f0f';circle(-2,0,4.5);ctx.stroke();ctx.fillStyle='#ffc400';circle(-12,0,2)}
 else{ctx.fillStyle=c||'#512b7a';ctx.beginPath();ctx.moveTo(22,0);ctx.lineTo(6,-8);ctx.lineTo(-14,-26);ctx.lineTo(-8,0);ctx.lineTo(-14,26);ctx.lineTo(6,8);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#222';ctx.fillRect(-12,-6,8,12);ctx.strokeRect(-12,-6,8,12);ctx.fillStyle='#e0c8ff';circle(6,0,4.5);ctx.lineWidth=1;ctx.stroke();if(t.fl>0){ctx.fillStyle='#fff';circle(-12,-4,3);circle(-12,4,3)}}
 dmgOn(ctx,t,0,k3?2:-2,k3?8:9,k3?5:13,k3?.8:1.1);
 ctx.restore()}
// omino travestito (infiltrato = colori a caso come i civili, guardia = classe militare); con l'arma estratta mostra la canna del mech
function humanBody(t){civSpr();
 const arm=t.wp||t.st==2,pal=t.k==UK_POL?[COLS.length,COLS.length+2]:t.k==UK_GRD?CIV_CLS[1]:[t.id%COLS.length,(t.id*5+1)%COLS.length],im=civPed(pal[0],pal[1],((G.t*5+t.id)|0)&1,arm);   // poliziotto: divisa militare, testa blu
 ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.h||0);
 ctx.drawImage(im,-im.width/2,-im.height/2);
 dmgOn(ctx,t,1,0,4,5,.7);   // sangue (omini: segni piccoli)
 if(arm){ctx.scale(.7,.7);ctx.strokeStyle='#aaa';ctx.lineWidth=.8;
  // Arma sul lato destro dell'omino (+y) e arretrata verso il corpo (−x):
  // il receiver entra nel fianco destro, la canna sporge ancora oltre il corpo.
  ctx.translate(-6,10);
  ctx.fillStyle='#111';ctx.beginPath();ctx.rect(8,-2.5,22,5);ctx.fill();ctx.stroke();
  ctx.fillStyle='#2a2a2a';ctx.beginPath();ctx.rect(8,-3.5,12,7);ctx.fill();ctx.stroke();
  if(t.fl>0){ctx.fillStyle='#fff';circle(30,0,5)}}
 ctx.restore()}
// ===== Dirigibile sci-fi (k=7): vista dall'alto. Scafo (rotazione t.h) + tre torrette sul dorso che ruotano insieme (t.thr) =====
function blimpBody(t){const a=t.h||0,thr1=t.thr!=null?t.thr:a,thr2=t.thr2!=null?t.thr2:a,thr3=t.thr3!=null?t.thr3:a,now=performance.now(),ca=Math.cos(a),sa=Math.sin(a),
  c=t.sec?(G.alCi!=null?COLS[G.alCi][0]:'#2aa6d9'):(G.mode!=1&&G.aiCi!=null)?COLS[G.aiCi][0]:'#33496b';
 ctx.save();ctx.translate(t.x+26,t.y+34);ctx.rotate(a);ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(0,0,50,19,0,0,TAU);ctx.fill();ctx.restore();   // ombra lontana: vola alto
 if(t.ar>0){ctx.strokeStyle='rgba(255,210,63,.7)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(t.x,t.y,46,0,TAU);ctx.stroke()}
 ctx.save();ctx.translate(t.x,t.y);
 // --- scafo ---
 ctx.save();ctx.rotate(a);ctx.strokeStyle='#111';ctx.lineWidth=1.5;
 ctx.fillStyle=shade(c,-.3);                                                                                    // pinne di coda
 for(const s of[-1,1]){ctx.beginPath();ctx.moveTo(-28,s*12);ctx.lineTo(-50,s*31);ctx.lineTo(-58,s*31);ctx.lineTo(-46,s*6);ctx.closePath();ctx.fill();ctx.stroke()}
 const L=9*Math.abs(Math.cos(now/35));                                                                          // motori laterali: l'elica vista di taglio si accorcia e si allunga
 for(const s of[-1,1]){ctx.fillStyle='#2a2d38';ctx.beginPath();ctx.ellipse(-8,s*26,10,4.5,0,0,TAU);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(-8,s*18);ctx.lineTo(-8,s*22);ctx.stroke();
  ctx.fillStyle='rgba(190,225,255,.6)';ctx.fillRect(-19,s*26-L,2.5,2*L)}
 ctx.fillStyle=c;ctx.beginPath();ctx.ellipse(0,0,50,19,0,0,TAU);ctx.fill();ctx.stroke();                         // involucro
 ctx.fillStyle='rgba(255,255,255,.13)';ctx.beginPath();ctx.ellipse(0,-6,42,7,0,0,TAU);ctx.fill();               // riflesso
 ctx.strokeStyle='rgba(0,0,0,.3)';ctx.lineWidth=1.2;ctx.beginPath();                                            // costole
 for(let x=-36;x<=36;x+=12){const y=19*Math.sqrt(1-x*x/2500);ctx.moveTo(x,-y);ctx.lineTo(x,y)}ctx.stroke();
 ctx.fillStyle='rgba(111,227,255,'+(.55+.45*Math.sin(now/260))+')';ctx.fillRect(-34,-1.5,68,3);                   // striscia luminosa pulsante
 const bl=Math.floor(now/400)%2;                                                                                 // luci di via sulle pinne
 ctx.fillStyle=bl?'#ff3b3b':'#7a0f0f';circle(-57,-31,2.2);ctx.fillStyle=bl?'#3bff6a':'#0f7a2a';circle(-57,31,2.2);
 dmgOn(ctx,t,0,0,40,14,2.4);
 ctx.restore();
 // --- torrette sul dorso: posizione legata allo scafo, orientamento = torretta (ca/sa ruotano il punto d'attacco) ---
 const tur=(x,ang,f)=>{ctx.save();ctx.translate(ca*x,sa*x);ctx.rotate(ang);f();ctx.restore()};
 ctx.strokeStyle='#111';ctx.lineWidth=1.5;
 tur(32,thr1,()=>{ctx.fillStyle='#222';ctx.beginPath();ctx.arc(0,0,6.5,0,TAU);ctx.fill();ctx.stroke();                // torretta shotgun
  ctx.fillStyle='#444';ctx.fillRect(3,-3.5,11,7);ctx.strokeRect(3,-3.5,11,7);
  ctx.fillStyle='#777';ctx.fillRect(11,-4,3,8);
  if(t.fl>0){ctx.fillStyle='#fff';circle(16,0,4.5)}});
 tur(2, thr2,()=>{ctx.scale(.65,.65);                                                                                 // torretta mitraglia (stile torretta di terra)
  ctx.fillStyle='#111';ctx.strokeStyle='#777';ctx.lineWidth=1;ctx.fillRect(8,-10,26,5);ctx.strokeRect(8,-10,26,5);ctx.fillRect(8,5,26,5);ctx.strokeRect(8,5,26,5);
  ctx.fillStyle=c;ctx.beginPath();ctx.arc(0,0,14,0,TAU);ctx.fill();ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.stroke();
  ctx.fillStyle='#222';ctx.fillRect(-4,-6,12,12);
  if(t.fl>0){ctx.fillStyle='#fff';circle(36,-7.5,4);circle(36,7.5,4)}});
 tur(-30,thr3,()=>{ctx.fillStyle='#1a1a1a';ctx.beginPath();ctx.arc(0,0,7,0,TAU);ctx.fill();ctx.stroke();               // lanciarazzi
  // due missili centrati sull'origine della torretta (metà davanti / metà dietro), sopra e sotto l'asse di tiro
  ctx.save(); ctx.translate(0,-6.5); drawRocket(5,26,'#cfd3d8'); ctx.restore();
  ctx.save(); ctx.translate(0, 6.5); drawRocket(5,26,'#cfd3d8'); ctx.restore();});
 ctx.restore()}
// Spada da combattimento: origine nel centro del mech, punta verso +x. La usano il fendente dei giocatori (drawSlash) e lo swordman (tenuta in mano)
function drawBlade(g){
 g.fillStyle='#111111';g.strokeStyle='#333333';g.lineWidth=1.5;g.fillRect(10,-9,6,18);g.strokeRect(10,-9,6,18);          // guardamano
 g.fillStyle='#d5e1e8';g.strokeStyle='#0f1419';g.lineWidth=1.5;g.beginPath();g.moveTo(16,-7);g.lineTo(52,-5);g.lineTo(64,0);g.lineTo(52,5);g.lineTo(16,7);g.closePath();g.fill();g.stroke();   // lama
 g.strokeStyle='#4b5563';g.lineWidth=1.2;g.beginPath();g.moveTo(18,0);g.lineTo(46,0);g.stroke()}                          // scanalatura
// Plasmablade: stessa elsa, lama di energia nel colore del giocatore (alone, corpo colorato, anima bianca)
function drawPlasmaBlade(g,col){
 g.save();g.lineCap='round';g.strokeStyle=col;
 g.beginPath();g.moveTo(18,0);g.lineTo(62,0);
 g.globalAlpha=.22;g.lineWidth=16;g.stroke();   // alone esterno
 g.globalAlpha=.5;g.lineWidth=10;g.stroke();    // alone interno
 g.globalAlpha=1;g.lineWidth=6;g.stroke();      // corpo della lama
 g.strokeStyle='#ffffff';g.lineWidth=2.6;g.beginPath();g.moveTo(17,0);g.lineTo(61,0);g.stroke();   // anima
 g.restore();
 g.fillStyle='#111111';g.strokeStyle='#333333';g.lineWidth=1.5;g.fillRect(10,-9,6,18);g.strokeRect(10,-9,6,18)}   // stessa elsa di drawBlade, sopra la base della lama

function drawSlash(sl){
 const o = sl.id === NET.id ? P : (others[sl.id] || (sl.id >= 1000 ? units.find(v => v.id === sl.id) : null));
 if(!o) return;
 const u = sl.t / sl.life;
 const A0 = sl.a - slArc(sl), A1 = sl.a + slArc(sl);

 ctx.save();
 ctx.translate(o.x, o.y);
 ctx.globalAlpha = 1.0; 

 const currentAngle = A0 + (A1 - A0) * u;
 ctx.rotate(currentAngle);
 // Scala il fendente (Grunt ridotto: MECH_SCALE; Air: 1) → lama più corta e più sottile
 const sc = sl.sc || 1;
 if(sc!==1) ctx.scale(sc, sc);

 const cPrimary = COLS[o.ci || 0][0];

 if(sl.pb) drawPlasmaBlade(ctx, cPrimary);   // Plasmablade: lama di energia del colore del giocatore
 else drawBlade(ctx);   // stesso disegno della spada tenuta in mano dallo swordman

 ctx.restore();
}
// ===== bersagli e oggetti di missione =====
function drawMark(o){const hw=o.w/2,hh=o.h/2,pu=.5+.5*Math.sin(performance.now()/260);
 if(o.rb){ctx.fillStyle='#ffb000';for(let y=-hh;y<hh-1;y+=24)ctx.fillRect(-hw,y,o.w,12);ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.strokeRect(-hw,-hh,o.w,o.h);return}
 if(o.bar||o.arm||o.sb){ctx.save();ctx.setLineDash([16,10]);ctx.strokeStyle=o.arm?'#3fd05a':o.sb?SB_TYPES[o.sb].c:'#ff3b3b';ctx.lineWidth=5;for(const q of o.pr){qpath(ctx,q,4);ctx.stroke()}ctx.restore()}
 ctx.save();ctx.rotate(-o.a);const R0=Math.min(26,Math.min(o.w,o.h)*.28);
 if(o.bar){ctx.fillStyle='#b01818';ctx.strokeStyle='#fff';ctx.lineWidth=3;circle(0,0,R0);ctx.stroke();ctx.fillStyle='#fff';ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?R0*.28:R0*.65;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill()}
 else if(o.arm){ctx.fillStyle='#10261a';ctx.strokeStyle='#3fd05a';ctx.lineWidth=3;circle(0,0,R0);ctx.stroke();   // armi incrociate
  ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-R0*.5,-R0*.5);ctx.lineTo(R0*.5,R0*.5);ctx.moveTo(R0*.5,-R0*.5);ctx.lineTo(-R0*.5,R0*.5);ctx.stroke();
  ctx.fillStyle='#3fd05a';circle(0,0,R0*.2)}
 else if(o.sb){const c=SB_TYPES[o.sb].c;ctx.fillStyle='#14181c';ctx.strokeStyle=c;ctx.lineWidth=3;circle(0,0,R0);ctx.stroke();ctx.fillStyle=c;ctx.lineCap='round';
  if(o.sb=='pol'){ctx.beginPath();ctx.moveTo(0,-R0*.62);ctx.lineTo(R0*.5,-R0*.4);ctx.lineTo(R0*.42,R0*.2);ctx.lineTo(0,R0*.62);ctx.lineTo(-R0*.42,R0*.2);ctx.lineTo(-R0*.5,-R0*.4);ctx.closePath();ctx.fill()}   // distintivo
  else if(o.sb=='pri'){ctx.beginPath();for(const k of[-.35,0,.35]){ctx.moveTo(R0*k,-R0*.55);ctx.lineTo(R0*k,R0*.55)}ctx.moveTo(-R0*.55,-R0*.55);ctx.lineTo(R0*.55,-R0*.55);ctx.moveTo(-R0*.55,R0*.55);ctx.lineTo(R0*.55,R0*.55);ctx.stroke()}   // sbarre
  else{const im=upImg({id:'sb:'+o.sb,col:c,ic:UPGRADES.find(u=>u.id==SB_TYPES[o.sb].up).ic});if(im.complete&&im.naturalWidth)ctx.drawImage(im,-R0*.65,-R0*.65,R0*1.3,R0*1.3)}}   // icona dell'upgrade che regala
 else if(o.vipB){ctx.strokeStyle='rgba(94,224,192,'+(.4+.5*pu)+')';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,R0+8+10*pu,0,TAU);ctx.stroke();ctx.fillStyle='#e8fff9';circle(0,0,R0);ctx.fillStyle='#1b7a64';ctx.fillRect(-R0*.18,-R0*.62,R0*.36,R0*1.24);ctx.fillRect(-R0*.62,-R0*.18,R0*1.24,R0*.36)}
 else if(o.tg){const col=o.tg=='plant'?'#ffd23f':o.tg=='radar'?'#7fd0ff':'#6fe0c0';ctx.strokeStyle='rgba(255,70,70,'+(.4+.5*pu)+')';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,R0+8+8*pu,0,TAU);ctx.stroke();
  ctx.fillStyle='#14181c';circle(0,0,R0);ctx.strokeStyle=col;ctx.lineWidth=3;ctx.stroke();ctx.fillStyle=col;
  if(o.tg=='plant'){ctx.beginPath();ctx.moveTo(R0*.15,-R0*.7);ctx.lineTo(-R0*.45,R0*.1);ctx.lineTo(-R0*.02,R0*.1);ctx.lineTo(-R0*.2,R0*.7);ctx.lineTo(R0*.45,-R0*.15);ctx.lineTo(R0*.02,-R0*.15);ctx.closePath();ctx.fill()}
  else if(o.tg=='radar'){ctx.beginPath();ctx.arc(0,R0*.2,R0*.5,Math.PI*1.1,Math.PI*1.9);ctx.stroke();ctx.beginPath();ctx.moveTo(0,R0*.2);ctx.lineTo(0,-R0*.45);ctx.stroke();circle(0,-R0*.5,R0*.12)}
  else{ctx.beginPath();ctx.moveTo(0,-R0*.65);ctx.bezierCurveTo(R0*.6,-R0*.05,R0*.45,R0*.6,0,R0*.6);ctx.bezierCurveTo(-R0*.45,R0*.6,-R0*.6,-R0*.05,0,-R0*.65);ctx.fill()}}
 ctx.restore()}
function drawAlly(a,kind){ctx.save();ctx.translate(a.x,a.y);
 if(kind=='conv'||kind=='van'){ctx.rotate(a.h||0);ctx.fillStyle='rgba(0,0,0,.28)';ctx.fillRect(-22,-6,56,28);ctx.fillStyle='#2f5d3a';ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.fillRect(-28,-14,40,28);ctx.strokeRect(-28,-14,40,28);
  ctx.fillStyle='#3f7a4c';ctx.fillRect(12,-12,18,24);ctx.strokeRect(12,-12,18,24);ctx.fillStyle='#bfe7ff';ctx.fillRect(22,-9,6,18);ctx.fillStyle='#e8f1e8';circle(-8,0,5);ctx.fillStyle=Math.floor(performance.now()/200)%2?'#4aa3ff':'#ff4a4a';circle(16,0,3)}
 else{
  // 1. Anello radar / localizzatore tattico alleato (pulsante)
  const pu=.5+.5*Math.sin(performance.now()/220);
  ctx.strokeStyle='rgba(94,224,192,'+(.35+.35*pu)+')';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(0,0,15+2*pu,0,TAU);ctx.stroke();

  // 2. Figura umana (Scienziato / Dirigente Civile)
  ctx.save();
  ctx.rotate(a.h||0);
  
  // Ombra a terra
  ctx.fillStyle='rgba(0,0,0,.32)';ctx.beginPath();ctx.ellipse(-1,2,7,4.5,0,0,TAU);ctx.fill();

  // Soprabito / Camice da laboratorio e busto
  ctx.fillStyle='#e8eef5';ctx.strokeStyle='#111';ctx.lineWidth=1;
  ctx.beginPath();ctx.ellipse(-2,0,4.5,7.5,0,0,TAU);ctx.fill();ctx.stroke();
  
  // Colletto scuro e badge / cravatta tecnologica
  ctx.fillStyle='#1e293b';ctx.beginPath();ctx.moveTo(-1,-2.5);ctx.lineTo(2,0);ctx.lineTo(-1,2.5);ctx.fill();
  ctx.strokeStyle='#00e5ff';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(0,-1.5);ctx.lineTo(2,0);ctx.lineTo(0,1.5);ctx.stroke();

  // Braccio sinistro
  ctx.fillStyle='#d5dee8';ctx.beginPath();ctx.ellipse(0,-6.5,3.2,1.8,-.2,0,TAU);ctx.fill();ctx.stroke();
  ctx.fillStyle='#f1c27d';circle(2.6,-6.5,1.2);

  // Braccio destro con valigetta dati di ricerca (datapad / briefcase)
  ctx.fillStyle='#d5dee8';ctx.beginPath();ctx.ellipse(0,6.5,3.2,1.8,.2,0,TAU);ctx.fill();ctx.stroke();
  ctx.fillStyle='#f1c27d';circle(2.6,6.5,1.2);
  ctx.fillStyle='#1a202c';ctx.strokeStyle='#4a5568';ctx.lineWidth=.8;
  ctx.beginPath();ctx.rect(0,5.8,7,3.5);ctx.fill();ctx.stroke();
  ctx.fillStyle='#00e5ff';ctx.fillRect(4.5,6.3,1.5,2.5); // LED di sicurezza dati

  // Testa, capigliatura e occhiali/visore olografico
  ctx.fillStyle='#f1c27d';circle(0,0,3.6); // Viso
  ctx.fillStyle='#334155';ctx.beginPath();ctx.arc(-.8,0,3.8,Math.PI*.35,Math.PI*1.65);ctx.fill(); // Capelli
  ctx.fillStyle='#d4935e';circle(3.2,0,1); // Naso / sguardo in avanti
  ctx.strokeStyle='#00e5ff';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(2.2,-2);ctx.lineTo(2.8,-.8);ctx.lineTo(2.8,.8);ctx.lineTo(2.2,2);ctx.stroke(); // Visore/occhiali
  ctx.restore()}
 ctx.restore();
 const bw=kind=='conv'?60:34,by=a.y-(kind=='conv'?32:24);
 ctx.fillStyle='#222';ctx.fillRect(a.x-bw/2,by,bw,5);
 ctx.fillStyle='#4aa3ff';ctx.fillRect(a.x-bw/2,by,bw*clamp(a.hp/a.mhp,0,1),5);
 if(kind!='conv'){ctx.fillStyle='#5ee0c0';ctx.font='bold 11px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText('VIP',a.x,by-4)}}
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
 })());
 // copie colorate (palude, fango, polvere): stessa sagoma, tinta col colore di FOAM_K mantenendo un po' delle sfumature
 for(let k=1;k<FOAM_K.length;k++)for(let v=0;v<3;v++){const src=FOAM_S[v],c=document.createElement('canvas');c.width=src.width;c.height=src.height;const g=c.getContext('2d');
  g.drawImage(src,0,0);g.globalCompositeOperation='source-atop';g.globalAlpha=.85;g.fillStyle=FOAM_K[k];g.fillRect(0,0,c.width,c.height);FOAM_S.push(c)}}
const CIVS={};
// pezzi comuni: ombra, ruote (xs = centri, w = larghezza carrozzeria), carrozzeria
const CIV_SH=(g,l,w)=>{g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-l/2+1,-w/2+1,l+2,w+2)};
const CIV_WH=(g,xs,w)=>{g.fillStyle='#111';for(const x of xs){g.fillRect(x-4,-w/2-3,8,4);g.fillRect(x-4,w/2-1,8,4)}};
const CIV_BODY=(g,col,l,w,r)=>{g.fillStyle=col;g.strokeStyle='#111';g.lineWidth=1.2;g.beginPath();g.roundRect(-l/2,-w/2,l,w,r);g.fill();g.stroke()};
const CIV_DRAW={
 berlina:(g,col)=>{CIV_SH(g,38,18);CIV_WH(g,[-10,12],18);CIV_BODY(g,col,38,18,4);
  g.fillStyle='#1d2a36';g.fillRect(3,-7,7,14);g.fillRect(-12,-7,5,14)},
 sportiva:(g,col)=>{CIV_SH(g,40,16);CIV_WH(g,[-12,12],16);CIV_BODY(g,col,40,16,7);
  g.fillStyle='rgba(255,255,255,.55)';g.fillRect(-19,-1.5,38,3);                       // striscia centrale
  g.fillStyle='#1d2a36';g.beginPath();g.roundRect(-4,-6,11,12,3);g.fill()},            // abitacolo basso
 pickup:(g,col)=>{CIV_SH(g,44,20);CIV_WH(g,[-14,13],20);CIV_BODY(g,col,44,20,3);
  g.fillStyle='#2b2b2b';g.fillRect(-20,-8,19,16);                                      // cassone aperto
  g.fillStyle='#1d2a36';g.fillRect(8,-8,5,16);g.fillRect(-1,-7,3,14)},                 // parabrezza e lunotto
 furgone:(g,col)=>{CIV_SH(g,46,20);CIV_WH(g,[-14,14],20);CIV_BODY(g,col,46,20,3);
  g.fillStyle='rgba(255,255,255,.22)';g.fillRect(-21,-8,30,16);                        // tetto del vano
  g.fillStyle='#1d2a36';g.fillRect(13,-8,6,16)},
 autobus:(g,col)=>{CIV_SH(g,70,22);CIV_WH(g,[-22,-4,24],22);CIV_BODY(g,col,70,22,4);
  g.fillStyle='rgba(255,255,255,.22)';g.fillRect(-31,-8,58,16);                        // tetto
  g.fillStyle='#cfd3d8';for(let x=-24;x<=16;x+=20)g.fillRect(x,-3,8,6);                // botole
  g.fillStyle='#1d2a36';g.fillRect(-31,-10,56,2);g.fillRect(-31,8,56,2);g.fillRect(29,-9,5,18)},   // finestrini e parabrezza
 camion:(g,col)=>{CIV_SH(g,62,22);CIV_WH(g,[-22,-8,22],22);
  g.fillStyle='#222';g.fillRect(10,-3,4,6);                                            // telaio
  g.strokeStyle='#111';g.lineWidth=1.2;
  g.fillStyle=col;g.beginPath();g.roundRect(-31,-10,42,20,2);g.fill();g.stroke();      // cassone colorato
  g.fillStyle='rgba(255,255,255,.2)';g.fillRect(-29,-8,38,16);
  g.fillStyle='#e6e6e6';g.beginPath();g.roundRect(13,-9,18,18,3);g.fill();g.stroke();  // cabina bianca
  g.fillStyle='#1d2a36';g.fillRect(23,-7,5,14)},
 jeep:(g,col)=>{CIV_SH(g,36,18);CIV_WH(g,[-9,11],18);CIV_BODY(g,col,36,18,2);
  g.fillStyle='rgba(0,0,0,.28)';g.fillRect(-14,-6,18,12);                              // abitacolo aperto
  g.fillStyle='#1d2a36';g.fillRect(5,-8,2.5,16);                                       // parabrezza
  g.fillStyle='#222';g.beginPath();g.arc(-19,0,4,0,TAU);g.fill()},                     // ruota di scorta
 blindato:(g,col)=>{CIV_SH(g,52,22);CIV_WH(g,[-18,-2,16],22);CIV_BODY(g,col,52,22,5);
  g.fillStyle='rgba(0,0,0,.22)';g.fillRect(-22,-8,26,16);                              // vano truppe
  g.fillStyle='rgba(255,255,255,.12)';g.fillRect(14,-9,8,18);                          // cofano
  g.strokeStyle='#222';g.lineWidth=2.2;g.beginPath();g.moveTo(6,0);g.lineTo(24,0);g.stroke();   // canna
  g.fillStyle='#2f3a1a';g.strokeStyle='#111';g.lineWidth=1.2;g.beginPath();g.arc(6,0,6,0,TAU);g.fill();g.stroke()}   // torretta
};
function civSpr(){if(CIVS.p)return;
 const mk=(w,h,f,s)=>{s=s||1;const c=document.createElement('canvas');c.width=Math.ceil(w*s);c.height=Math.ceil(h*s);const g=c.getContext('2d');g.translate(c.width/2,c.height/2);g.scale(s,s);f(g);return c};
 CIVS.p=[];CIVS.v=[];CIVS.s=[];
 CIVS.mk=mk;   // gli omini si creano al bisogno (vedi civPed)
 for(const t of CIV_VEH)for(const col of t.cols)CIVS.v.push(mk(t.w,t.h,g=>CIV_DRAW[t.n](g,col),CIV_SV));   // veicoli vista dall'alto, prua verso +x
 for(let v=0;v<3;v++)CIVS.s.push(mk(40,40,g=>{const R=rng(77+v);g.fillStyle='#8a0f0f';g.beginPath();g.arc(0,0,7+R()*3,0,TAU);g.fill();   // macchia di sangue
  for(let i=0;i<8;i++){const a=R()*TAU,d=6+R()*11;g.fillStyle=i%2?'#b01818':'#6e0b0b';g.beginPath();g.arc(Math.cos(a)*d,Math.sin(a)*d,1.5+R()*3.5,0,TAU);g.fill()}}))
 for(let v=0;v<3;v++)CIVS.s.push(mk(40,40,g=>{const R=rng(131+v);   // CIVS.s[3..5]: macchia mista olio + sangue (torrette e carri distrutti)
  g.fillStyle='#14110e';g.beginPath();g.ellipse(0,0,9+R()*3,7+R()*3,R()*TAU,0,TAU);g.fill();   // pozza d'olio
  for(let i=0;i<6;i++){const a=R()*TAU,d=5+R()*10;g.fillStyle=i%2?'#241d16':'#0b0907';g.beginPath();g.arc(Math.cos(a)*d,Math.sin(a)*d,1.5+R()*3,0,TAU);g.fill()}   // schizzi d'olio
  g.fillStyle='rgba(120,140,170,.25)';g.beginPath();g.ellipse(-2,-2,4,1.6,R()*TAU,0,TAU);g.fill();   // riflesso sull'olio
  for(let i=0;i<5;i++){const a=R()*TAU,d=4+R()*12;g.fillStyle=i%2?'#b01818':'#6e0b0b';g.beginPath();g.arc(Math.cos(a)*d,Math.sin(a)*d,1.2+R()*2.8,0,TAU);g.fill()}}))}   // sangue dell'equipaggio
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

// ===== 5) veicoli guidabili dai giocatori (la logica è in AGveh.js, i valori in VEH_T di AGconf.js) =====
// Ogni disegno è centrato nell'origine con la prua verso +x. h = scafo (direzione di marcia), tu = torretta / torso (direzione di mira).
// I segni dei danni usano il veicolo stesso (v.hp / v.mhp), come per le unità nemiche.
const VEHS={};   // immagini pronte dei veicoli civili guidabili, una per tipo e colore (scala: CIV_SV, la stessa delle auto in strada; si legge al disegno perché AGsim.js carica dopo questo file)
function vehCol(v,q){const T=VEH_T[v.k];
 if(T.civ){const t=CIV_VEH.find(z=>z.n==T.civ);return t.cols[(v.ci|0)%t.cols.length]}   // civili: il loro colore, chiunque li guidi
 return q?COLS[q.ci|0][0]:VEH_MIL_COL}                                              // militari: colore del pilota, olivastro se parcheggiati
function vehCivImg(name,col){const k=name+col;let im=VEHS[k];if(im)return im;civSpr();const t=CIV_VEH.find(z=>z.n==name);
 return VEHS[k]=CIVS.mk(t.w,t.h,g=>CIV_DRAW[name](g,col),CIV_SV)}
// sagoma del jet (contorno unico, usato anche per l'ombra)
const JET_PTS=[[26,0],[8,-6],[-4,-6],[-16,-28],[-22,-28],[-16,-5],[-24,-5],[-30,-14],[-34,-14],[-30,0],[-34,14],[-30,14],[-24,5],[-16,5],[-22,28],[-16,28],[-4,6],[8,6]];
function artJet(v,col,h,fl,shadow,eng){const c=ctx;c.save();c.rotate(h);c.scale(.8,.8);   // stessa taglia del jet dell'AI
 if(shadow){c.fillStyle='rgba(0,0,0,.28)';c.beginPath();JET_PTS.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.fill();c.restore();return}
 c.save();c.translate(-8,-17);drawRocket(4,16,'#cfd3d8');c.restore();c.save();c.translate(-8,17);drawRocket(4,16,'#cfd3d8');c.restore();   // missili sotto le ali
 mPoly(c,JET_PTS,col,'#111',1.5);
 mPoly(c,[[8,-4],[-14,-4],[-14,4],[8,4]],shade(col,-.2));                 // dorso
 mLine(c,-16,-5,-20,-24,'rgba(0,0,0,.35)',1);mLine(c,-16,5,-20,24,'rgba(0,0,0,.35)',1);
 mEll(c,10,0,6.5,3,0,'#9fd8ff','#0a2030',1);mEll(c,11.5,-1,2.2,1,0,'rgba(255,255,255,.7)');   // cupolino
 mRect(c,-30,-4.5,6,3.5,'#222');mRect(c,-30,1,6,3.5,'#222');           // ugelli
 if(eng){c.fillStyle='rgba(255,170,60,.85)';circle(-32,-2.7,2.6);circle(-32,2.7,2.6)}
 dmgOn(c,v,0,-4,14,16,1.2);
 if(fl>0){c.fillStyle='#fff';circle(28,0,3.5)}
 c.restore()}
function artTank(v,col,h,tu,fl){const c=ctx,S=.875;   // stessa taglia del carro pesante dell'AI (cingoli 56×44)
 c.save();c.rotate(h);c.scale(S,S);
 c.fillStyle='rgba(0,0,0,.28)';c.fillRect(-30,-23,64,50);
 c.fillStyle='#2b2b30';c.strokeStyle='#111';c.lineWidth=1.5;
 c.fillRect(-32,-25,64,11);c.strokeRect(-32,-25,64,11);c.fillRect(-32,14,64,11);c.strokeRect(-32,14,64,11);   // cingoli
 c.strokeStyle='#1a1a1d';c.lineWidth=2;c.beginPath();const o=(v.wk||0)%6;
 for(let i=-30+o;i<=30;i+=6){c.moveTo(i,-24);c.lineTo(i,-15);c.moveTo(i,15);c.lineTo(i,24)}c.stroke();   // maglie che scorrono quando si muove
 c.fillStyle=col;c.strokeStyle='#111';c.lineWidth=2;c.fillRect(-28,-16,56,32);c.strokeRect(-28,-16,56,32);   // scafo
 c.fillStyle=shade(col,-.18);c.fillRect(-22,-10,42,20);
 c.fillStyle='#222';c.fillRect(-28,-7,5,14);                            // griglia del motore
 dmgOn(c,v,0,0,22,12,1.6);
 c.restore();
 c.save();c.rotate(tu);c.scale(S,S);
 c.fillStyle='#1a1a1a';c.beginPath();c.arc(0,0,18,0,TAU);c.fill();     // anello
 c.fillStyle='#222';c.strokeStyle='#888';c.lineWidth=1;c.fillRect(12,-3.5,42,7);c.strokeRect(12,-3.5,42,7);   // cannone
 c.fillStyle='#333';c.fillRect(50,-5.5,9,11);c.strokeRect(50,-5.5,9,11);  // freno di bocca
 c.fillStyle='#111';c.fillRect(10,-11,17,3);                            // mitragliera coassiale
 c.fillStyle=shade(col,.12);c.strokeStyle='#111';c.lineWidth=1.8;c.beginPath();
 c.moveTo(16,-11);c.lineTo(6,-16);c.lineTo(-14,-14);c.lineTo(-18,0);c.lineTo(-14,14);c.lineTo(6,16);c.lineTo(16,11);c.closePath();c.fill();c.stroke();   // torretta
 c.fillStyle='#222';c.beginPath();c.arc(-4,-5,5,0,TAU);c.fill();c.strokeStyle='#555';c.lineWidth=1;c.stroke();   // cupola del capocarro
 if(fl>0){c.fillStyle='#fff';circle(61,0,7)}
 c.restore()}
function artApc(v,col,h,tu,fl){const c=ctx,S=.79;   // stessa taglia dell'APC dell'AI (scafo 44 px)
 c.save();c.rotate(h);c.scale(S,S);
 CIV_SH(c,56,24);CIV_WH(c,[-19,-3,13],24);CIV_BODY(c,col,56,24,5);
 c.fillStyle='rgba(0,0,0,.22)';c.fillRect(-24,-9,26,18);c.fillStyle='rgba(255,255,255,.12)';c.fillRect(15,-10,9,20);
 c.fillStyle='#1d2a36';c.fillRect(23,-8,3,16);                          // feritoia del pilota
 dmgOn(c,v,0,0,23,9,1.3);
 c.restore();
 c.save();c.translate(Math.cos(h)*6*S,Math.sin(h)*6*S);c.rotate(tu);c.scale(S,S);
 c.strokeStyle='#222';c.lineWidth=2.4;c.beginPath();c.moveTo(0,-2.5);c.lineTo(25,-2.5);c.moveTo(0,2.5);c.lineTo(25,2.5);c.stroke();   // mitragliere gemelle
 c.fillStyle=shade(col,-.25);c.strokeStyle='#111';c.lineWidth=1.2;c.beginPath();c.arc(0,0,8,0,TAU);c.fill();c.stroke();
 c.fillStyle='#222';c.fillRect(-3,-3,5,6);
 if(fl>0){c.fillStyle='#fff';circle(27,-2.5,3.5);circle(27,2.5,3.5)}
 c.restore()}
// Colosso: grande robot da combattimento bipede (disegno originale). Gambe e piedi seguono la marcia, il torso ruota verso la mira.
function artWalker(v,col,h,tu,fl){const c=ctx,ph=Math.sin((v.wk||0)/22),s1=ph*12,s2=-ph*12;
 c.save();c.rotate(h);
 c.fillStyle='rgba(0,0,0,.3)';c.beginPath();c.ellipse(2,0,32,28,0,0,TAU);c.fill();   // ombra
 for(const[sy,sx]of[[-1,s1],[1,s2]]){
  mRect(c,-8+sx*.4,sy*15-5,16,10,'#2b2e33','#000',1);                  // coscia
  c.save();c.translate(sx,sy*24);
  mPoly(c,[[-19,-7],[12,-8],[25,-3],[25,3],[12,8],[-19,7],[-22,0]],'#3a3e45','#000',1.2);   // piede (sporge davanti e dietro al torso)
  mLine(c,-4,-7,-4,7,'rgba(0,0,0,.5)',1);mRect(c,16,-5.5,9,2.6,'#1c1e22');mRect(c,16,2.9,9,2.6,'#1c1e22');mRect(c,-22,-2,4,4,'#1c1e22');   // dita e sperone
  c.restore()}
 mEll(c,0,0,10,23,0,'#2b2e33','#000',1.2);                              // bacino
 c.restore();
 c.save();c.rotate(tu);
 mRect(c,14,-6,10,12,'#2a2a2a','#888',1);                               // mozzo del cannone rotante (sotto l'abitacolo)
 mRect(c,22,-4.5,26,9,'#3c3c3c','#000',1);
 for(let i=0;i<4;i++)mLine(c,22,-3.2+i*2.15,48,-3.2+i*2.15,'#111',1.1);  // canne
 mRect(c,46,-5.5,3,11,'#222','#000',.8);
 for(const sy of[-1,1]){                                                 // pod di missili sulle spalle
  mRect(c,-14,sy<0?-36:20,28,16,shade(col,-.25),'#000',1.4);
  for(let r=0;r<2;r++)for(let k=0;k<4;k++){const x=-8+k*6.5,y=(sy<0?-31.5:24.5)+r*7;mEll(c,x,y,2.3,2.3,0,'#111');mEll(c,x,y,1.1,1.1,0,'#e53a2a')}}
 mPoly(c,[[-21,-18],[8,-21],[21,-10],[23,10],[8,21],[-21,18],[-26,0]],col,'#000',1.6);   // corpo corazzato
 mPoly(c,[[-15,-11],[4,-14],[13,-6],[13,6],[4,14],[-15,11]],shade(col,.14),'rgba(0,0,0,.6)',1);
 mPoly(c,[[13,-7],[22,-4],[22,4],[13,7]],'#5fc8ff','#0a2030',1);        // abitacolo
 mEll(c,17,-3,2,1,0,'rgba(255,255,255,.7)');
 for(const y of[-9,0,9])mRect(c,-26,y-2,5,4,'#222');                    // sfiati posteriori
 mLine(c,-12,-14,-24,-26,'#999',1.2);c.fillStyle=Math.floor(performance.now()/400)%2?'#ff3b3b':'#7a0f0f';circle(-24,-26,1.8);   // antenna
 dmgOn(c,v,0,-2,18,16,1.8);
 if(fl>0){c.fillStyle='#fff';circle(51,0,6.5)}
 c.restore()}
// un veicolo nell'origine (contesto già traslato): v = veicolo, col = colore, h = scafo, tu = torretta, fl = lampo di sparo
function vehArt(v,col,h,tu,fl){const T=VEH_T[v.k];
 switch(T.art){
  case'civ':{const im=vehCivImg(T.civ,col);ctx.save();ctx.rotate(h);ctx.drawImage(im,-im.width/2,-im.height/2);dmgOn(ctx,v,0,0,T.r*.9,T.r*.45,1);ctx.restore();break}
  case'apc':artApc(v,col,h,tu,fl);break;
  case'tank':artTank(v,col,h,tu,fl);break;
  case'walker':artWalker(v,col,h,tu,fl);break;
  case'jet':ctx.save();ctx.translate(4,5);artJet(v,col,h,0,true);ctx.restore();artJet(v,col,h,fl,false,0);break}}   // jet a terra: ombra vicina
// veicolo guidato da un giocatore (chiamato da mech() al posto del Grunt): il jet in volo ha ombra lontana e propulsori accesi
function vehDrawPl(p,off,shadow){const v=VHC.list[p.vid];if(!v)return;const T=VEH_T[v.k];
 ctx.save();if(p.stl)ctx.globalAlpha*=STL_A;
 if(T.fly&&p.air){ctx.translate(p.x+off,p.y+off*1.3);artJet(v,vehCol(v,p),p.h,p.fl,shadow,Math.abs(p.sp||0)>60)}
 else if(!shadow){ctx.translate(p.x,p.y);vehArt(v,vehCol(v,p),p.mh,p.fa,p.fl)}
 ctx.restore()}
// veicoli parcheggiati: nella nebbia di guerra si vedono solo se in vista, come i nemici; quello a portata del giocatore pulsa
function vehDrawParked(ldt,VW,VH){if(!VHC.list.length)return;
 for(const v of VHC.list){if(v.dead||v.drv>=0)continue;
  if(v.x<camX-120||v.x>camX+VW+120||v.y<camY-120||v.y>camY+VH+120)continue;
  const tg=seen(v.x,v.y,false)?1:0;v.va+=(tg-v.va)*Math.min(1,10*ldt);if(v.va<.03)continue;
  ctx.globalAlpha=v.va;ctx.save();ctx.translate(v.x,v.y);vehArt(v,vehCol(v,null),v.h,v.h,0);
  if(v===VHC.near){const pu=.5+.5*Math.sin(performance.now()/200);ctx.strokeStyle='rgba(255,179,90,'+(.35+.5*pu)+')';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,VEH_T[v.k].r+10+5*pu,0,TAU);ctx.stroke()}
  ctx.restore()}
 ctx.globalAlpha=1}
