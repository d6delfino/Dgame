'use strict';
/* AIRGRUNT · AGterrain.js — disegno del mondo.
   TERRENO STATICO (quote con scarpate, strade, rampe, acqua, cascate, ponti, campi) → disegnato UNA volta in blocchi da 512 px tenuti in cache:
   a ogni fotogramma si copiano solo i blocchi visibili (pochi drawImage). Gli ostacoli (che si distruggono) e la nebbia sono dinamici. */
const circle=(x,y,r)=>{ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill()};
let chBudget=0,frameNo=0;   // CH, chunkGet e chunkReset ora stanno in AGbake.js
function bpath(g,b,k){const n=b.a.length,P2=b.a.map((r,i)=>{const t=i/n*TAU;return[b.x+Math.cos(t)*r*k,b.y+Math.sin(t)*r*k]});
 g.beginPath();g.moveTo((P2[n-1][0]+P2[0][0])/2,(P2[n-1][1]+P2[0][1])/2);
 for(let i=0;i<n;i++){const a=P2[i],c=P2[(i+1)%n];g.quadraticCurveTo(a[0],a[1],(a[0]+c[0])/2,(a[1]+c[1])/2)}g.closePath()}
const hit=(bb,x0,y0,x1,y1)=>bb[0]<x1&&bb[2]>x0&&bb[1]<y1&&bb[3]>y0;
// regione "quota ≥ t" nel riquadro: ogni cella della griglia di quote diventa un poligono ritagliato (unione in un solo percorso, senza giunture)
function levelPath(t,x0,y0,x1,y1){const p=new Path2D(),W1=GW+1,E=M.E,i0=clamp(Math.floor(x0/TC),0,GW-1),i1=clamp(Math.floor(x1/TC),0,GW-1),j0=clamp(Math.floor(y0/TC),0,GH-1),j1=clamp(Math.floor(y1/TC),0,GH-1);
 for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){const a=E[j*W1+i],b=E[j*W1+i+1],c=E[(j+1)*W1+i+1],d=E[(j+1)*W1+i];
  if(a<t&&b<t&&c<t&&d<t)continue;const x=i*TC,y=j*TC;
  if(a>=t&&b>=t&&c>=t&&d>=t){p.rect(x,y,TC,TC);continue}
  const V=[[x,y,a],[x+TC,y,b],[x+TC,y+TC,c],[x,y+TC,d]],o=[];
  for(let k=0;k<4;k++){const s=V[k],e=V[(k+1)%4],is=s[2]>=t,ie=e[2]>=t;if(is)o.push(s[0],s[1]);if(is!==ie){const u=(t-s[2])/(e[2]-s[2]);o.push(s[0]+(e[0]-s[0])*u,s[1]+(e[1]-s[1])*u)}}
  if(o.length>=6){p.moveTo(o[0],o[1]);for(let k=2;k<o.length;k+=2)p.lineTo(o[k],o[k+1]);p.closePath()}}
 return p}
const roadPath=rd=>rd.path||(rd.path=(()=>{const p=new Path2D();rd.pts.forEach((q,i)=>i?p.lineTo(q[0],q[1]):p.moveTo(q[0],q[1]));return p})());
const riverPath=rv=>rv.path||(rv.path=(()=>{const p=new Path2D();rv.pts.forEach((q,i)=>i?p.lineTo(q[0],q[1]):p.moveTo(q[0],q[1]));return p})());
function drawChunk(g,x0,y0){
 const x1=x0+CH,y1=y0+CH,m=M;g.translate(-x0,-y0);g.lineJoin='round';g.lineCap='round';
 g.fillStyle=LVL_COL[0];g.fillRect(x0,y0,CH,CH);
 // quote: altopiani con ombra e fianco di scarpata
 for(let t=1;t<=2;t++){const p=levelPath(t-.5,x0-TC,y0-TC,x1+TC,y1+TC);
  g.save();g.translate(20,26);g.fillStyle='rgba(0,0,0,.24)';g.fill(p);g.restore();
  g.save();g.translate(0,14);g.fillStyle=t==2?'#4a3d2c':'#58492f';g.fill(p);g.restore();
  g.save();g.translate(-2,-3);g.fillStyle='rgba(255,255,225,.32)';g.fill(p);g.restore();
  g.fillStyle=LVL_COL[t];g.fill(p)}
 for(const h of m.hills)if(h.x+h.r>x0&&h.x-h.r<x1&&h.y+h.r>y0&&h.y-h.r<y1){g.fillStyle='rgba(176,160,110,.4)';for(const k of[1,.66,.33]){bpath(g,h,k);g.fill()}}
 // campi, piazze, parcheggi
 for(const d of m.decals){const R0=(d.r||Math.hypot(d.w,d.h)/2)+10;if(d.x+R0<x0||d.x-R0>x1||d.y+R0<y0||d.y-R0>y1)continue;
  g.save();g.translate(d.x,d.y);
  if(d.k=='c'){g.fillStyle=d.f;g.beginPath();g.arc(0,0,Math.max(0,d.r),0,TAU);g.fill();if(d.l){g.strokeStyle=d.l;g.lineWidth=6;g.beginPath();g.arc(0,0,40,0,TAU);g.stroke();g.fillStyle=d.l;g.beginPath();g.arc(0,0,34,0,TAU);g.fill()}}
  else{g.rotate(d.a);g.fillStyle=d.f;g.fillRect(-d.w/2,-d.h/2,d.w,d.h);g.strokeStyle='rgba(0,0,0,.18)';g.lineWidth=2;g.strokeRect(-d.w/2,-d.h/2,d.w,d.h);
   if(d.s){g.strokeStyle='rgba(0,0,0,.14)';g.lineWidth=3;g.beginPath();for(let v=-d.h/2+9;v<d.h/2;v+=14){g.moveTo(-d.w/2,v);g.lineTo(d.w/2,v)}g.stroke()}}
  g.restore()}
 // strade
 for(const rd of m.roads){if(!hit(rd.bb,x0,y0,x1,y1))continue;const dr=rd.ty==1,p=roadPath(rd);
  g.strokeStyle=dr?'#5e4d33':'#4f5148';g.lineWidth=rd.w+(dr?8:10);g.stroke(p);g.strokeStyle=dr?'#a58c5e':'#8a8b84';g.lineWidth=rd.w;g.stroke(p);
  if(dr){g.strokeStyle='rgba(90,70,40,.35)';g.lineWidth=rd.w*.45;g.setLineDash([60,40])}else{g.strokeStyle='rgba(240,225,140,.75)';g.lineWidth=3;g.setLineDash([28,24])}g.stroke(p);g.setLineDash([])}
 // rampe: la strada sale (chiara) o scende (scura) da una quota all'altra tra due muretti
 for(const r of m.ramps){if(r.x<x0-120||r.x>x1+120||r.y<y0-120||r.y>y1+120)continue;
  g.save();g.translate(r.x,r.y);g.rotate(r.a);const L=160,w=r.w/2+7,gr=g.createLinearGradient(-L/2,0,L/2,0);gr.addColorStop(0,'rgba(10,10,5,.5)');gr.addColorStop(1,'rgba(255,255,240,.3)');
  g.fillStyle=gr;g.fillRect(-L/2,-w,L,2*w);g.strokeStyle='rgba(0,0,0,.28)';g.lineWidth=2;g.beginPath();for(let x=-L/2+10;x<L/2;x+=16){g.moveTo(x,-w);g.lineTo(x,w)}g.stroke();
  g.strokeStyle='#3d3a33';g.lineWidth=5;g.beginPath();g.moveTo(-L/2,-w);g.lineTo(L/2,-w);g.moveTo(-L/2,w);g.lineTo(L/2,w);g.stroke();g.restore()}
 // acqua
 for(const k of[10,0]){g.strokeStyle=k?'#c8b983':'#3f7fb5';for(const rv of m.rivers){g.lineWidth=rv.w+k;g.stroke(riverPath(rv))}}
 g.fillStyle='#3f7fb5';g.strokeStyle='#c8b983';g.lineWidth=5;
 for(const l of m.lakes)if(l.x+l.r*1.3>x0&&l.x-l.r*1.3<x1&&l.y+l.r*1.3>y0&&l.y-l.r*1.3<y1){bpath(g,l,1);g.fill();g.stroke()}
 if(x1>SEA-120){g.beginPath();g.moveTo(WW,0);for(let y=0;y<=WH;y+=20)g.lineTo(coast(y),y);g.lineTo(WW,WH);g.closePath();g.fill();g.stroke()}
 for(const s of m.isles)if(s.x+s.R*1.3>x0&&s.x-s.R*1.3<x1&&s.y+s.R*1.3>y0&&s.y-s.R*1.3<y1){g.fillStyle='#7d9a5a';g.strokeStyle='#d2c28f';g.lineWidth=9;bpath(g,s,1);g.stroke();g.fill()}
 // cascate: dove il fiume scende da una quota all'altra
 for(const f of m.falls){if(f.x<x0-60||f.x>x1+60||f.y<y0-60||f.y>y1+60)continue;
  g.save();g.translate(f.x,f.y);g.rotate(f.a);const w=f.w/2+6;
  g.fillStyle='#35566f';g.fillRect(-12,-w,34,2*w);g.fillStyle='rgba(228,244,252,.9)';g.fillRect(-12,-w+3,30,2*w-6);
  g.strokeStyle='rgba(120,170,205,.8)';g.lineWidth=2;g.beginPath();for(let v=-w+8;v<w-4;v+=9){g.moveTo(-12,v);g.lineTo(16,v+3)}g.stroke();
  g.fillStyle='rgba(255,255,255,.75)';g.beginPath();g.ellipse(24,0,13,w+4,0,0,TAU);g.fill();g.restore()}
 for(const b of m.bridges){if(b.x<x0-b.L||b.x>x1+b.L||b.y<y0-b.L||b.y>y1+b.L)continue;
  g.save();g.translate(b.x,b.y);g.rotate(b.a);g.fillStyle='#8b6a3e';g.fillRect(-b.L/2,-b.bw/2,b.L,b.bw);g.strokeStyle='#4a3519';g.lineWidth=4;g.strokeRect(-b.L/2,-b.bw/2,b.L,b.bw);
  g.strokeStyle='rgba(60,40,15,.5)';g.lineWidth=2;g.beginPath();for(let x=-b.L/2+14;x<b.L/2;x+=14){g.moveTo(x,-b.bw/2);g.lineTo(x,b.bw/2)}g.stroke();g.restore()}}

// ===== ostacoli (dinamici) =====
function qpath(g,q,k){g.beginPath();
 if(q.k=='r')g.rect(q.x-q.a+k,q.y-q.b+k,Math.max(1,2*(q.a-k)),Math.max(1,2*(q.b-k)));
 else if(q.k=='c')g.arc(q.x,q.y,Math.max(1,q.a-k),0,TAU);
 else if(q.k=='p'){const r=Math.max(1,q.a-k);for(let i=0;i<q.n;i++){const a=i*TAU/q.n;g.lineTo(q.x+Math.cos(a)*r,q.y+Math.sin(a)*r)}g.closePath()}
 else{for(const v of q.vs)g.lineTo(v[0],v[1]);g.closePath()}}
const TH=[100,120,145],TCOL={};
function treeCols(tn,f){const k=tn*11+Math.round(f*10);let c=TCOL[k];if(!c){const h=TH[tn|0],s=30+30*f,l=18+10*f;
  c={base:`hsl(${h},${s}%,${l-6}%)`,tuft:[0,1,2,3,4].map(i=>`hsl(${h+(i%2?8:-6)},${s}%,${l+2+i*2.2}%)`),hi:`hsla(${h+12},${s}%,${l+22}%,.55)`};TCOL[k]=c}return c}
function drawTree(o,f,lod){const c=treeCols(o.tn,f),r=o.r;ctx.fillStyle='rgba(0,0,0,.22)';circle(o.x+r*.35,o.y+r*.45,r);ctx.fillStyle=c.base;circle(o.x,o.y,r);
 if(lod<1){ctx.fillStyle=c.tuft[2];circle(o.x-r*.1,o.y-r*.1,r*.6);return}
 let k=(o.id+1)*2654435761>>>0;
 for(let i=0;i<5;i++){k=(k*1664525+1013904223)>>>0;const a=k/4294967296*TAU;k=(k*1664525+1013904223)>>>0;const d=k/4294967296*r*.5,br=r*(.28+(k&255)/255*.14);
  ctx.fillStyle=c.tuft[i];circle(o.x+Math.cos(a)*d-r*.04,o.y+Math.sin(a)*d-r*.04,br)}
 ctx.fillStyle=c.hi;circle(o.x-r*.28,o.y-r*.3,r*.2)}
function drawRock(o,lod){const q=o.pr[0],v=q.vs;
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
  if(f<.95)crack(o,f,hw,hh);if(o.bar||o.vipB||o.tg||o.rb)drawMark(o);
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
 if(o.bar||o.vipB||o.tg||o.rb||o.arm)drawMark(o);
 ctx.restore()}

// ===== visuale del Grunt: raycasting dal mech contro gli ostacoli (raggio dell'arma + 10%) =====
const MAXA=3000,AN=new Float32Array(MAXA),VD=new Float32Array(MAXA);let fr=0,visList=[];
const CS=new Float32Array(MAXA),SN=new Float32Array(MAXA),HO=new Array(MAXA).fill(null);   // coseno, seno e ostacolo colpito per ogni raggio
const VIEW_MARGIN=1.10,viewRange=p=>Math.max(WEAPONS[p.w].range,WEAPONS[W_MG].range);
function visCalc(p,VW,VH){fr++;
 // oltre l'angolo più lontano dello schermo i raggi non servono: raggio limitato al riquadro visibile
 const fx=Math.max(Math.abs(camX-p.x),Math.abs(camX+VW-p.x)),fy=Math.max(Math.abs(camY-p.y),Math.abs(camY+VH-p.y)),
  visR=Math.min(viewRange(p)*VIEW_MARGIN,Math.hypot(fx,fy)+80),near=qobs(p.x,p.y,visR+60,visList);
 let n=0;const E=1e-4,add=a=>{if(n<MAXA){while(a>Math.PI)a-=TAU;while(a<-Math.PI)a+=TAU;AN[n++]=a}};
 const nb=G.q>=2?64:G.q==1?48:36;for(let i=0;i<nb;i++)add(i/nb*TAU-Math.PI);
 const tg=(cx,cy,r)=>{const dx=cx-p.x,dy=cy-p.y,d=Math.hypot(dx,dy);if(d<=r+1)return;const a=Math.atan2(dy,dx),w=Math.asin(r/d);add(a);for(let k=-1;k<=1;k+=2){add(a+k*w-E);add(a+k*w+E)}};
 const live=[];
 for(const o of near){if(Math.hypot(o.x-p.x,o.y-p.y)>visR+o.r)continue;live.push(o);
  if(o.t=='t'){tg(o.x,o.y,o.r);continue}
  for(const q of o.pr){if(q.k=='c'){tg(o.x+q.x*o.c-q.y*o.s,o.y+q.x*o.s+q.y*o.c,q.a);continue}
   for(const v of q.vs){const a=Math.atan2(o.y+v[0]*o.s+v[1]*o.c-p.y,o.x+v[0]*o.c-v[1]*o.s-p.x);add(a-E);add(a+E)}}}
 AN.subarray(0,n).sort();
 for(let i=0;i<n;i++){CS[i]=Math.cos(AN[i]);SN[i]=Math.sin(AN[i]);VD[i]=visR;HO[i]=null}
 const lb=a=>{let lo=0,hi=n;while(lo<hi){const m=(lo+hi)>>1;if(AN[m]<a)lo=m+1;else hi=m}return lo};   // primo raggio con angolo >= a
 const run=(o,i0,i1)=>{for(let i=i0;i<i1;i++){const e=rayO(o,p.x,p.y,CS[i],SN[i]);if(e<VD[i]){VD[i]=e;HO[i]=o}}};
 for(const o of live){const ox=o.x-p.x,oy=o.y-p.y,d=Math.hypot(ox,oy),R=o.r+1;
  if(d<=R){run(o,0,n);continue}                                   // il mech è dentro il cerchio dell'ostacolo: tutti i raggi
  const c=Math.atan2(oy,ox),w=Math.asin(R/d)+1e-3,a0=c-w,a1=c+w;   // solo i raggi nell'intervallo angolare dell'ostacolo
  if(a0<-Math.PI){run(o,lb(a0+TAU),n);run(o,0,lb(a1))}
  else if(a1>Math.PI){run(o,lb(a0),n);run(o,0,lb(a1-TAU))}
  else run(o,lb(a0),lb(a1))}
 for(let i=0;i<n;i++)if(HO[i])HO[i].seen=fr;
 visLive=live;return n}
let visLive=[];
// il punto è visibile dal Grunt locale? (gli oggetti volanti si vedono sempre entro il raggio)
function seen(x,y,fly){if(G.fog<.02)return true;const dx=x-P.x,dy=y-P.y,d=Math.hypot(dx,dy),visR=viewRange(P)*VIEW_MARGIN;if(d<1)return true;if(d>visR)return false;if(fly)return true;
 const ux=dx/d,uy=dy/d;
 for(const o of visLive){const ox=o.x-P.x,oy=o.y-P.y,pr=ox*ux+oy*uy;
  if(pr<-o.r||pr>d+o.r||Math.abs(ox*uy-oy*ux)>o.r+1)continue;   // dietro, oltre il bersaglio o fuori dal raggio
  const e=rayO(o,P.x,P.y,ux,uy);if(e<d-14)return false}return true}
const _vo=[];
function drawObstacles(VW,VH,zoom,ldt){
 const list=qrect(camX-150,camY-150,camX+VW+150,camY+VH+150,_vo),lod=G.q>=2?(zoom>.55?1:0):G.q==1?(zoom>.8?1:0):0,tr=[];
 for(const o of list){const tg=(G.fog<.02||o.seen===fr)?1:0;o.va=(o.va||0)+(tg-(o.va||0))*Math.min(1,10*ldt);if(o.va<.03)continue;
  if(o.t=='t'){tr.push(o);continue}
  ctx.globalAlpha=o.va;const f=o.hp/o.m;if(o.ty=='rock')drawRock(o,lod);else if(o.sp)drawSpecial(o,f,lod);else drawBld(o,f,lod)}
 for(const o of tr){ctx.globalAlpha=o.va;drawTree(o,o.hp/o.m,lod)}
 ctx.globalAlpha=1}
