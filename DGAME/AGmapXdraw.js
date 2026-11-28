'use strict';
/* AIRGRUNT · AGmapXdraw.js — MAPPE SPECIALI · DISEGNO: oggetti degli interni (muri, porte, arredi in cache) e pittura dello sfondo.
   Parte comune (temi, geometria, regole di gioco) all'inizio di AGmap.js: si carica prima di questo file. */

// ===== 7) disegno degli oggetti =====
// muri e porte: pochi rettangoli disegnati al volo · gli altri oggetti: immagini pronte in cache (stessa immagine per oggetti uguali)
function thDraw(o,f,lod){const t=o.th;
 if(t=='wall'){xDrawWall(o,lod);return}
 if(t=='door'){xDrawDoor(o,f,lod);return}
 if(t=='bwall'||t=='partition'){xDrawBWall(o,f,lod);return}   // muri interni: distruttibili, a lastre, si crepano
 const s=xSprite(o),w=s.width/XS,h=s.height/XS;ctx.save();ctx.translate(o.x,o.y);ctx.rotate(o.a);ctx.drawImage(s,-w/2,-h/2,w,h);
 if(f<.95&&!o.ind)crack(o,f,o.w*.3,o.h*.3);if(o.bar||o.vipB||o.tg||o.rb||o.arm||o.sb)drawMark(o);ctx.restore()}
function xDrawWall(o,lod){const P=XP[M.th],C=o.wk?P.wall:P.wallO,c=ctx,hw=o.w/2,hh=o.h/2;c.save();c.translate(o.x,o.y);c.rotate(o.a);
 c.fillStyle='rgba(0,0,0,.3)';c.fillRect(-hw+3,-hh+5,o.w,o.h);
 c.fillStyle=C[0];c.fillRect(-hw,-hh,o.w,o.h);c.fillStyle=C[1];c.fillRect(-hw+3,-hh+3,o.w-6,o.h-6);c.fillStyle=C[2];c.fillRect(-hw+3,-hh+3,o.w-6,3);
 if(lod){c.strokeStyle='rgba(0,0,0,.35)';c.lineWidth=1.5;c.beginPath();for(let x=-hw+40;x<hw-10;x+=80){c.moveTo(x,-hh+3);c.lineTo(x,hh-3)}c.stroke();
  if(!o.wk){if(M.th==2){c.fillStyle='rgba(111,216,255,.30)';c.fillRect(-hw+5,-5,o.w-10,10);c.fillStyle='rgba(220,250,255,.35)';c.fillRect(-hw+5,-5,o.w-10,2)}   // vetrata sul vuoto
   else if(M.th==4){for(let x=-hw+55;x<hw-20;x+=110){c.fillStyle='#0b1a1e';c.beginPath();c.arc(x,0,13,0,TAU);c.fill();c.fillStyle='#2a7f95';c.beginPath();c.arc(x,0,9,0,TAU);c.fill();c.fillStyle='rgba(200,250,255,.55)';c.beginPath();c.arc(x-3,-3,3,0,TAU);c.fill()}}   // oblò
   else{c.fillStyle=P.acc;for(let x=-hw+20;x<hw-10;x+=80)c.fillRect(x,-hh+6,10,3)}}   // segnali sullo scafo
  else{c.fillStyle='rgba(255,255,255,.07)';c.fillRect(-hw+3,-1,o.w-6,2)}}
 c.restore()}
function xDrawDoor(o,f,lod){const P=XP[M.th],c=ctx,hw=o.w/2,hh=o.h/2;c.save();c.translate(o.x,o.y);c.rotate(o.a);
 if(o.bd){c.fillStyle='rgba(0,0,0,.4)';c.fillRect(-hw+3,-hh+6,o.w,o.h);c.fillStyle='#14171b';c.fillRect(-hw,-hh,o.w,o.h);c.fillStyle='#3a4048';c.fillRect(-hw+3,-hh+3,o.w-6,o.h-6);   // porta blindata: lastre spesse, bordi a strisce, bulloni
  c.save();c.beginPath();c.rect(-hw+3,-hh+3,o.w-6,o.h-6);c.clip();c.fillStyle='#ffc83a';for(const ex of[-hw+3,hw-17])for(let y=-hh-14;y<hh+14;y+=10){c.beginPath();c.moveTo(ex,y);c.lineTo(ex+14,y+7);c.lineTo(ex+14,y+12);c.lineTo(ex,y+5);c.fill()}c.restore();
  c.fillStyle='#565e68';c.fillRect(-hw+17,-hh+5,o.w-34,o.h-10);c.fillStyle='#0d0f12';c.fillRect(-1.5,-hh+3,3,o.h-6);c.fillStyle='#9aa4ae';for(let x=-hw+22;x<hw-20;x+=12){c.fillRect(x,-hh+7,2.5,2.5);c.fillRect(x,hh-9.5,2.5,2.5)}
  c.strokeStyle='#0d0f12';c.lineWidth=2;c.strokeRect(-hw+1,-hh+1,o.w-2,o.h-2);const ga=c.globalAlpha;c.globalAlpha=ga*(.6+.4*Math.sin(performance.now()/400+o.id));c.fillStyle='#ff4a3a';c.fillRect(-7,-3,5,6);c.fillStyle='#ffc83a';c.fillRect(2,-3,5,6);c.globalAlpha=ga;
  if(f<.95)crack(o,f,hw*.6,hh);c.restore();return}
 c.fillStyle='rgba(0,0,0,.35)';c.fillRect(-hw+3,-hh+5,o.w,o.h);c.fillStyle=P.door[0];c.fillRect(-hw,-hh,o.w,o.h);
 c.save();c.beginPath();c.rect(-hw+4,-hh+3,o.w-8,o.h-6);c.clip();c.fillStyle=P.door[1];
 for(let x=-hw-24;x<hw+24;x+=18){c.beginPath();c.moveTo(x,-hh);c.lineTo(x+9,-hh);c.lineTo(x+9-o.h,hh);c.lineTo(x-o.h,hh);c.fill()}c.restore();
 c.fillStyle='rgba(0,0,0,.6)';c.fillRect(-2,-hh,4,o.h);c.strokeStyle='rgba(0,0,0,.5)';c.lineWidth=2;c.strokeRect(-hw+1,-hh+1,o.w-2,o.h-2);
 const ga=c.globalAlpha;c.globalAlpha=ga*(.6+.4*Math.sin(performance.now()/300+o.id));c.fillStyle='#ff4a3a';c.fillRect(-hw+8,-2,8,4);c.fillRect(hw-16,-2,8,4);c.globalAlpha=ga;   // spie di blocco
 if(f<.95)crack(o,f,hw*.6,hh);c.restore()}
// MEGASTRUTTURA: i muri esterni (indistruttibili) sono dipinti nello sfondo, come un'unica linea: un tratto per strato, i pezzi si fondono senza giunte.
// Gli oggetti restano (fermano movimento, colpi e visuale) ma non si disegnano più a ogni fotogramma (vedi drawObstacles in AGrender.js)
function xOuterPaint(g,x0,y0){const L=qrect(x0-120,y0-120,x0+CH+120,y0+CH+120,[]).filter(o=>o.th=='wall'&&!o.wk);if(!L.length)return;
 const P=XP[M.th],C=P.wallO,p=new Path2D();let th=X_TO;for(const o of L){const hx=Math.cos(o.a)*o.w/2,hy=Math.sin(o.a)*o.w/2;p.moveTo(o.x-hx,o.y-hy);p.lineTo(o.x+hx,o.y+hy);th=o.h}
 g.save();g.lineCap='butt';g.lineJoin='miter';
 g.save();g.translate(3,5);g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=th;g.stroke(p);g.restore();   // ombra
 g.strokeStyle=C[0];g.lineWidth=th;g.stroke(p);g.strokeStyle=C[1];g.lineWidth=th-6;g.stroke(p);
 if(M.th==3){g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=12;g.stroke(p);g.setLineDash([28,56]);g.strokeStyle=P.acc;g.lineWidth=5;g.stroke(p);g.setLineDash([])}   // astronave: segni dello scafo
 else if(M.th==4){g.strokeStyle='rgba(111,230,255,.26)';g.lineWidth=14;g.stroke(p);g.strokeStyle='rgba(210,250,255,.32)';g.lineWidth=2;g.stroke(p);   // base sottomarina: vetrata spessa sul mare,
  g.setLineDash([10,96]);g.strokeStyle=C[2];g.lineWidth=th-4;g.stroke(p);g.setLineDash([])}   // con i costoloni dello scafo
 else{g.strokeStyle='rgba(111,216,255,.30)';g.lineWidth=10;g.stroke(p);g.strokeStyle='rgba(220,250,255,.35)';g.lineWidth=2;g.stroke(p)}   // vetrata sul vuoto
 g.restore()}
// muro sottile abbattibile: a lastre con bulloni e giunti scuri alle estremità; col danno si crepa
function xDrawBWall(o,f,lod){const P=XP[M.th],C=P.wall,c=ctx,hw=o.w/2,hh=o.h/2;c.save();c.translate(o.x,o.y);c.rotate(o.a);
 c.fillStyle='rgba(0,0,0,.3)';c.fillRect(-hw+3,-hh+5,o.w,o.h);c.fillStyle=C[0];c.fillRect(-hw,-hh,o.w,o.h);c.fillStyle=xmix(C[1],'#000000',.18);c.fillRect(-hw+3,-hh+3,o.w-6,o.h-6);
 if(lod){const n=Math.max(2,Math.round(o.w/70));c.strokeStyle='rgba(0,0,0,.45)';c.lineWidth=2;c.beginPath();for(let i=1;i<n;i++){const x=-hw+i*o.w/n;c.moveTo(x,-hh+3);c.lineTo(x,hh-3)}c.stroke();
  c.fillStyle='rgba(255,255,255,.35)';for(let i=0;i<n;i++){const x=-hw+(i+.5)*o.w/n;c.fillRect(x-o.w/n/2+5,-hh+5,2.5,2.5);c.fillRect(x+o.w/n/2-7.5,hh-7.5,2.5,2.5)}
  c.fillStyle='#1a1a1a';c.fillRect(-hw,-hh,5,o.h);c.fillRect(hw-5,-hh,5,o.h)}   // giunti alle estremità
 if(f<.95)crack(o,f,hw*.7,hh);c.restore()}
const XSP=new Map(),XSP_MAX=150,XS=1.25;
function xSprite(o){const k=o.th+'|'+Math.round(o.w/6)+'|'+Math.round(o.h/6)+'|'+(o.v|0)+'|'+M.th+'|'+(o.th=='dome'?o.pal:0)+'|'+(o.cc||'')+'|'+(o.lc||'')+'|'+(o.kb==null?'':o.kb);let s=XSP.get(k);
 if(s){XSP.delete(k);XSP.set(k,s);return s}
 const pad=14,W=Math.ceil((o.w+pad*2)*XS),H=Math.ceil((Math.max(o.h,1)+pad*2)*XS);s=document.createElement('canvas');s.width=W;s.height=H;
 const g=s.getContext('2d');g.setTransform(XS,0,0,XS,W/2,H/2);g.lineJoin='round';g.lineCap='round';
 const P=XP[M.th]||XP[2],D=XK[o.th]||{},cir=D.c||o.th=='dome';
 if(o.th!='xexc'){g.fillStyle='rgba(0,0,0,.33)';g.beginPath();if(cir)g.arc(4,5,Math.max(o.w,o.h)/2,0,TAU);else g.rect(-o.w/2+4,-o.h/2+5,o.w,o.h);g.fill()}   // ombra (il mega escavatore si fa la sua: la sagoma non è un rettangolo)
 try{(XA[o.th]||XA.crate)(g,o.w,o.h,P,o.v|0,o)}catch(e){}
 if(o.lc){const r=Math.min(o.w,o.h);xc(g,0,0,r*.24,xmix(o.lc,'#000000',.35));xc(g,0,0,r*.17,o.lc);xc(g,0,0,r*.07,'#ffffff')}   // colonna-lampada
 XSP.set(k,s);if(XSP.size>XSP_MAX){const f=XSP.keys().next().value;XSP.delete(f)}return s}
// --- piccoli attrezzi di disegno
const xr=(g,x,y,w,h,c)=>{g.fillStyle=c;g.fillRect(x,y,w,h)},xc=(g,x,y,r,c)=>{g.fillStyle=c;g.beginPath();g.arc(x,y,Math.max(.1,r),0,TAU);g.fill()},
 xst=(g,c,w)=>{g.strokeStyle=c;g.lineWidth=w||1},xrr=(g,x,y,w,h,r,c)=>{g.fillStyle=c;g.beginPath();g.roundRect(x,y,w,h,Math.max(0,Math.min(r,w/2,h/2)));g.fill()},
 xh=(a,b,c)=>hs(a,b,c||77),xmix=(a,b,t)=>rgbs(mixc(hex(a),hex(b),t));
function xGlow(g,x,y,r,c,a){const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,c);gr.addColorStop(1,'rgba(0,0,0,0)');g.save();g.globalAlpha=a==null?1:a;g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,TAU);g.fill();g.restore()}
// --- arte degli oggetti: (g, larghezza, altezza, colori del tema, variante, oggetto) disegnati attorno a (0,0)
const XA={
 // --- base sottomarina: vasca con i pesci (telaio, acqua, sabbia, alghe, pesci, bolle) e vaso di coralli
 fishtank(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(XH);const L=hor?w:h,S=hor?h:w,nw=Math.max(2,L/24|0),nf=Math.max(2,L/30|0);
  xrr(g,-L/2,-S/2,L,S,4,'#1c262c');const gr=g.createLinearGradient(0,-S/2,0,S/2);gr.addColorStop(0,'#4fd0e8');gr.addColorStop(1,'#0b5a72');g.fillStyle=gr;g.fillRect(-L/2+3,-S/2+3,L-6,S-6);
  xr(g,-L/2+3,S/2-3-S*.18,L-6,S*.18,'#c8b080');
  for(let i=0;i<nw;i++){const x=-L/2+10+i*(L-20)/Math.max(1,nw-1);g.strokeStyle=i%2?'#3a9a4a':'#5ab84a';g.lineWidth=2;g.beginPath();g.moveTo(x,S/2-4);g.quadraticCurveTo(x+4,S*.05,x-2,-S*.2);g.stroke()}
  const FC=['#ff8a3a','#ffd23f','#ff5a8a','#6affd8'];for(let i=0;i<nf;i++){const x=-L/2+14+((i*37+v*11)%Math.max(1,L-28)),y=-S/4+((i*13+v*7)%Math.max(1,S*.4)),d=i%2?1:-1;g.fillStyle=FC[(i+v)%4];
   g.beginPath();g.ellipse(x,y,4,2.2,0,0,TAU);g.fill();g.beginPath();g.moveTo(x-d*4,y);g.lineTo(x-d*8,y-2.5);g.lineTo(x-d*8,y+2.5);g.closePath();g.fill()}
  for(let i=0;i<3;i++)xc(g,L/2-10-i*4,-S/2+6+i*5,1.4,'rgba(220,250,255,.8)');
  xr(g,-L/2+3,-S/2+3,L-6,2,'rgba(255,255,255,.45)');g.strokeStyle='#5a6a72';g.lineWidth=2;g.strokeRect(-L/2+1,-S/2+1,L-2,S-2);g.restore()},
 coralpot(g,w,h,P,v){const r=w/2,C=[['#ff6a8a','#ffb0c0'],['#ff9a3a','#ffd0a0'],['#c25fff','#e0b0ff'],['#3fe0c0','#b0fff0']][v%4];xc(g,0,0,r,'#3a4a50');xc(g,0,0,r-4,'#c8b080');
  g.strokeStyle=C[0];g.lineWidth=3;g.lineCap='round';for(let i=0;i<6;i++){const a=i*TAU/6+v,l=r*.75;g.beginPath();g.moveTo(0,0);g.lineTo(Math.cos(a)*l,Math.sin(a)*l);g.moveTo(Math.cos(a)*l*.55,Math.sin(a)*l*.55);g.lineTo(Math.cos(a+.5)*l*.85,Math.sin(a+.5)*l*.85);g.stroke()}
  for(let i=0;i<6;i++){const a=i*TAU/6+v;xc(g,Math.cos(a)*r*.75,Math.sin(a)*r*.75,2.2,C[1])}xc(g,0,0,r*.18,C[1])},
 // --- megastruttura: ostacoli nuovi dei gruppi d'arredo
 reception(g,w,h,P){xrr(g,-w/2,-h/2,w,h,10,'#2a2f38');xrr(g,-w/2+3,-h/2+3,w-6,h-6,8,'#d8d2c4');xr(g,-w/2+8,-h/2+3,w-16,6,'#8a7a5a');xr(g,-w/2+10,h/2-12,w-20,4,'rgba(0,0,0,.18)');xc(g,-w/4,-1,5,'#3a4a5a');xr(g,w/6,-4,18,10,'#1b2a3a');xr(g,w/6+2,-2,14,6,'#5cc8ff')},
 filecab(g,w,h){xr(g,-w/2,-h/2,w,h,'#3a3f48');xr(g,-w/2+2,-h/2+2,w-4,h-4,'#7a828e');g.fillStyle='rgba(0,0,0,.35)';for(let i=1;i<3;i++)g.fillRect(-w/2+2,-h/2+i*h/3-1,w-4,2);g.fillStyle='#c8ced6';for(let i=0;i<3;i++)g.fillRect(-4,-h/2+i*h/3+h/6-1.5,8,3)},
 divider(g,w,h){xr(g,-w/2,-h/2,w,h,'#2e333c');xr(g,-w/2+2,-h/2+1.5,w-4,h-3,'#5a6a82');g.fillStyle='rgba(255,255,255,.12)';for(let x=-w/2+12;x<w/2;x+=24)g.fillRect(x,-h/2+1,2,h-2)},
 counter(g,w,h){xr(g,-w/2,-h/2,w,h,'#3a3f46');xr(g,-w/2+3,-h/2+3,w-6,h-6,'#b8c0c8');const n=Math.max(2,Math.floor(w/32));for(let i=0;i<n;i++){const x=-w/2+8+i*(w-16)/n;xr(g,x+2,-h/2+6,(w-16)/n-4,h-16,'#7a838c');xr(g,x+4,-h/2+8,(w-16)/n-8,h-20,['#c8783a','#6a9a3a','#d8c058','#a84a3a'][i%4])}xr(g,-w/2+3,h/2-7,w-6,3,'#e8ecf0')},
 cart(g,w,h){xr(g,-w/2,-h/2,w,h,'#4a525c');xr(g,-w/2+3,-h/2+3,w-6,h-6,'#9aa4ae');g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-w/2+3,-1,w-6,2);for(const sx of[-1,1])for(const sy of[-1,1])xc(g,sx*(w/2-3),sy*(h/2-3),3,'#15181c')},
 ups(g,w,h){xr(g,-w/2,-h/2,w,h,'#101318');xr(g,-w/2+3,-h/2+3,w-6,h-6,'#262b33');for(let i=0;i<4;i++)xc(g,-w/2+9+i*7,-h/2+8,2,['#7dff8a','#7dff8a','#ffd23f','#5cf2ff'][i]);g.fillStyle='rgba(255,255,255,.1)';for(let y=-h/2+14;y<h/2-4;y+=5)g.fillRect(-w/2+6,y,w-12,2)},
 fireext(g,w){const r=w/2;xc(g,0,0,r,'#7a1414');xc(g,0,0,r-2,'#d83a2a');xc(g,-r*.3,-r*.3,r*.3,'rgba(255,255,255,.4)');xc(g,0,0,2,'#222')},
 pallet(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#6a4e30');g.fillStyle='#8a6a42';for(let i=0;i<5;i++)g.fillRect(-w/2+1,-h/2+1+i*(h-2)/5,w-2,(h-2)/5-2);const C=['#b0803a','#9a7448','#c49a5a'][v%3];xr(g,-w/2+5,-h/2+5,w-10,h-10,C);xst(g,'rgba(0,0,0,.35)',1.5);g.beginPath();g.moveTo(-w/2+5,0);g.lineTo(w/2-5,0);g.moveTo(0,-h/2+5);g.lineTo(0,h/2-5);g.stroke();xr(g,-w/2+5,-2,w-10,4,'rgba(230,230,220,.5)')},
 forklift(g,w,h){xr(g,-w/2+3,-h/2,4,h*.36,'#8a929c');xr(g,w/2-7,-h/2,4,h*.36,'#8a929c');xr(g,-w/2,-h/2+h*.32,w,5,'#2a2e34');xrr(g,-w/2,-h/2+h*.36,w,h*.64,5,'#c89a1a');xrr(g,-w/2+5,-h/2+h*.44,w-10,h*.3,4,'#2a2e34');xr(g,-w/2+7,h/2-12,w-14,8,'#e0b42a');for(const sx of[-1,1])for(const fy of[.42,.92])xr(g,sx*(w/2)-(sx>0?4:0),-h/2+h*fy-6,4,12,'#111')},
 stool(g,w){const r=w/2;xc(g,0,0,r,'#2a2e34');xc(g,0,0,r-2.5,'#5a6a7a');xc(g,0,0,2,'#9aa4ae')},
 hood(g,w,h){xr(g,-w/2,-h/2,w,h,'#3a4048');xr(g,-w/2+3,-h/2+3,w-6,h-6,'#d0d6dc');xr(g,-w/2+6,-h/2+6,w-12,h*.45,'#7ab8d0');xr(g,-w/2+6,-h/2+6,w-12,3,'rgba(255,255,255,.5)');xc(g,w/2-10,h/2-8,3,'#7dff8a')},
 analyzer(g,w,h){xrr(g,-w/2,-h/2,w,h,5,'#3a4048');xrr(g,-w/2+3,-h/2+3,w-6,h-6,4,'#c8ced6');xc(g,-w/6,h/8,Math.min(w,h)*.22,'#4a525c');xc(g,-w/6,h/8,Math.min(w,h)*.12,'#9ad8ff');xr(g,w/12,-h/2+6,w*.3,h*.22,'#12202a');xr(g,w/12+2,-h/2+8,w*.3-4,h*.22-4,'#5cf2ff')},
 toolcart(g,w,h){xr(g,-w/2,-h/2,w,h,'#5a1a14');xr(g,-w/2+2,-h/2+2,w-4,h-4,'#c8382a');g.fillStyle='rgba(0,0,0,.35)';g.fillRect(-w/2+2,-1,w-4,2);xr(g,-w/4,-h/2+4,6,h/3,'#c8ced6');xr(g,w/8,-h/2+5,10,4,'#c8ced6');for(const sx of[-1,1])for(const sy of[-1,1])xc(g,sx*(w/2-3),sy*(h/2-3),2.5,'#15181c')},
 scanner(g,w,h){xr(g,-w/2,-h/2,10,h,'#2a2f38');xr(g,w/2-10,-h/2,10,h,'#2a2f38');xr(g,-w/2,-h/2,w,7,'#3a414c');g.fillStyle='rgba(120,230,255,.25)';g.fillRect(-w/2+10,-h/2+7,w-20,h-7);xr(g,-w/2+2,-h/2+10,6,h-14,'#5cf2ff');xr(g,w/2-8,-h/2+10,6,h-14,'#5cf2ff');xc(g,0,-h/2+3.5,2.5,'#ff4a3a')},
 bucket(g,w){const r=w/2;xc(g,0,0,r,'#8a6a10');xc(g,0,0,r-2,'#e0b42a');xc(g,0,0,r-4.5,'#5a7a8a');xst(g,'#555',1.2);g.beginPath();g.moveTo(-r,0);g.lineTo(r,0);g.stroke()},
 urinal(g,w,h){xrr(g,-w/2,-h/2,w,h,6,'#9aa4ae');xrr(g,-w/2+2,-h/2+3,w-4,h-5,5,'#eef2f4');xc(g,0,h/6,2,'#8a949c')},
 dryer(g,w,h){xrr(g,-w/2,-h/2,w,h,3,'#5a626c');xrr(g,-w/2+2,-h/2+2,w-4,h-4,2,'#c8ced6');xc(g,0,0,2,'#3a4048')},
 crate(g,w,h,P,v){const C=P.crate[v%P.crate.length],x=-w/2,y=-h/2;xr(g,x,y,w,h,C[1]);xr(g,x+3,y+3,w-6,h-6,C[0]);
  xst(g,C[1],2.6);g.beginPath();g.moveTo(x+5,y+5);g.lineTo(x+w-5,y+h-5);g.moveTo(x+w-5,y+5);g.lineTo(x+5,y+h-5);g.stroke();
  xst(g,'rgba(255,255,255,.2)',1.2);g.strokeRect(x+3.5,y+3.5,w-7,h-7);g.fillStyle='rgba(0,0,0,.35)';for(const[a,b]of[[x,y],[x+w-6,y],[x,y+h-6],[x+w-6,y+h-6]])g.fillRect(a,b,6,6)},
 crates(g,w,h,P,v){const hor=w>=h,n=2+(v%2),L=hor?w:h,S=hor?h:w;
  for(let i=0;i<n;i++){const s=L/n,cx=-L/2+s*(i+.5),j=(xh(v,i)-.5)*6;g.save();if(hor)g.translate(cx,j);else g.translate(j,cx);XA.crate(g,(hor?s:S)-5,(hor?S:s)-5,P,(v+i)%4);g.restore()}
  const k=Math.min(w,h)*.55;g.save();g.translate(-w*.1+xh(v,9)*w*.2,-h*.1);g.fillStyle='rgba(0,0,0,.35)';g.fillRect(-k/2+4,-k/2+5,k,k);g.rotate((xh(v,7)-.5)*.5);XA.crate(g,k,k,P,(v+2)%4);g.restore()},
 barrels(g,w,h,P,v){const r=Math.min(w,h)/4.3,nx=Math.max(1,Math.floor(w/(2*r+3))),ny=Math.max(1,Math.floor(h/(2*r+3)));
  for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){const x=-w/2+(i+.5)*w/nx,y=-h/2+(j+.5)*h/ny,C=P.crate[(v+i+j)%P.crate.length];
   xc(g,x,y,r,C[1]);xc(g,x,y,r-2,C[0]);xst(g,C[1],1.5);g.beginPath();g.arc(x,y,r*.62,0,TAU);g.stroke();xc(g,x+r*.35,y-r*.3,r*.13,'#222');
   if(xh(v,i*7+j)<.3){xst(g,'#ffd23f',2);g.beginPath();g.arc(x,y,r-3,0,TAU);g.stroke()}}},
 cont(g,w,h,P,v){const c=CONT_COL[v%CONT_COL.length];xr(g,-w/2,-h/2,w,h,shade(c,-.45));xr(g,-w/2+2,-h/2+2,w-4,h-4,c);
  xst(g,'rgba(0,0,0,.28)',1.4);g.beginPath();for(let x=-w/2+8;x<w/2-8;x+=7){g.moveTo(x,-h/2+3);g.lineTo(x,h/2-3)}g.stroke();
  xr(g,w/2-10,-h/2+2,8,h-4,shade(c,-.25));xst(g,'#222',1.5);g.beginPath();g.moveTo(w/2-7,-h/2+5);g.lineTo(w/2-7,h/2-5);g.stroke();xr(g,-w/2+2,-h/2+2,w-4,3,'rgba(255,255,255,.22)')},
 shelf(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#2a2e34');xr(g,-w/2+3,-h/2+3,w-6,h-6,'#3c424a');const L=Math.max(w,h),hor=w>=h,n=Math.floor(L/22);
  for(let i=0;i<n;i++)for(let k=0;k<2;k++){const t=-L/2+6+i*(L-12)/n,s=(L-12)/n-3,cc=P.crate[(i+k+v)%P.crate.length][0];if(xh(v,i*3+k)<.2)continue;if(hor)xr(g,t,-h/2+4+k*(h-8)/2,s,(h-8)/2-2,cc);else xr(g,-w/2+4+k*(w-8)/2,t,(w-8)/2-2,s,cc)}},
 server(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#0d0f13');xr(g,-w/2+2,-h/2+2,w-4,h-4,'#1b1f27');const hor=w>=h,L=hor?w:h,S=hor?h:w;
  for(let i=0;i<Math.floor(L/9);i++){const t=-L/2+6+i*9,c=P.led[(i*7+v)%P.led.length];if(xh(v,i)<.55)continue;if(hor)xr(g,t,S/2-6,3,2,c);else xr(g,S/2-6,t,2,3,c)}
  xst(g,'rgba(255,255,255,.08)',1);g.beginPath();for(let i=0;i<Math.floor(L/16);i++){const t=-L/2+8+i*16;if(hor){g.moveTo(t,-S/2+4);g.lineTo(t,S/2-10)}else{g.moveTo(-S/2+4,t);g.lineTo(S/2-10,t)}}g.stroke()},
 cooler(g,w,h,P){xr(g,-w/2,-h/2,w,h,P.metal[1]);xr(g,-w/2+3,-h/2+3,w-6,h-6,P.metal[0]);const r=Math.min(w,h)*.36;xc(g,0,0,r,'#15181c');
  xst(g,'#7a8290',2);for(let i=0;i<6;i++){const a=i*TAU/6;g.beginPath();g.moveTo(0,0);g.quadraticCurveTo(Math.cos(a+.6)*r*.7,Math.sin(a+.6)*r*.7,Math.cos(a)*r*.9,Math.sin(a)*r*.9);g.stroke()}xc(g,0,0,r*.2,'#aab')},
 desk(g,w,h,P,v,o){const top=v%2?'#cfc8b8':'#e2e4e6',kb=o&&o.kb!=null?o.kb:1;xr(g,-w/2,-h/2,w,h,'#2a2e34');xr(g,-w/2+2,-h/2+2,w-4,h-4,top);xr(g,-w/2+2,-h/2+2,w-4,3,'rgba(255,255,255,.35)');   // scrivania: un monitor grande, tastiera e mouse dal lato di ogni sedia (kb: 1 = +v, −1 = −v, 2 = entrambi)
  const mw=Math.min(w*.6,44),my=kb==2?0:kb>0?-h*.2:h*.2;xr(g,-mw/2,my-3.5,mw,7,'#0d0f13');xr(g,-mw/2+1.5,my-2,mw-3,4,P.glow);g.fillStyle='rgba(255,255,255,.35)';g.fillRect(-mw/2+3,my-1.5,mw*.3,1);
  for(const sd of kb==2?[1,-1]:[kb>0?1:-1]){const ky=sd*h*.3;xr(g,-10,ky-3,20,6,'#1b2030');g.fillStyle='rgba(255,255,255,.28)';for(let i=0;i<3;i++)g.fillRect(-9,ky-2+i*1.6,18,.8);xrr(g,13,ky-3,5,6,2.5,'#2a2e34')}
  if(v%3==0)xc(g,w/2-7,-h/2+7,3,'#4a7a3a')},
 table(g,w,h,P,v){const hor=w>=h,L=hor?w:h,S=hor?h:w;g.save();if(!hor)g.rotate(Math.PI/2);const n=Math.max(2,Math.floor(L/34));
  for(let i=0;i<n;i++)for(const sd of[-1,1])xc(g,-L/2+L*(i+.5)/n,sd*(S/2+2),7,P.cloth[(i+v)%4]);xrr(g,-L/2+4,-S/2+6,L-8,S-12,6,v%2?'#8a6a48':'#9aa2ac');xr(g,-L/2+10,-2,L-20,4,'rgba(255,255,255,.12)');g.restore()},
 ctable(g,w,h,P,v){const r=w/2;for(let i=0;i<6;i++){const a=i*TAU/6;xc(g,Math.cos(a)*(r-6),Math.sin(a)*(r-6),7,P.cloth[(i+v)%4])}xc(g,0,0,r*.62,'#6a5a48');xc(g,0,0,r*.55,v%2?'#8a6a48':'#aab2bc')},
 bench(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#7a8088');xr(g,-w/2+3,-h/2+3,w-6,h-6,'#e6eaee');const hor=w>=h,L=hor?w:h;
  for(let i=0;i<Math.floor(L/30);i++){const t=-L/2+15+i*30,c=['#5fd0ff','#7dff8a','#ff7ad0','#ffd23f'][(i+v)%4],x=hor?t:0,y=hor?0:t;if(xh(v,i)<.35)xr(g,x-7,y-6,14,12,'#3a4048');else{xc(g,x,y,5,'rgba(255,255,255,.7)');xc(g,x,y,3.5,c)}}},
 tank(g,w,h,P,v){const r=w/2,c=['#3fe07a','#3fa8ff','#c25fff','#ff9a3a'][v%4];xc(g,0,0,r,'#2a2f36');xc(g,0,0,r-4,'#5a626e');xc(g,0,0,r*.72,'#1a1e24');
  const gr=g.createRadialGradient(-r*.2,-r*.2,1,0,0,r*.68);gr.addColorStop(0,'#ffffff');gr.addColorStop(.25,c);gr.addColorStop(1,shade(c,-.6));g.fillStyle=gr;g.beginPath();g.arc(0,0,r*.66,0,TAU);g.fill();
  for(let i=0;i<8;i++){const a=i*TAU/8;xc(g,Math.cos(a)*(r-7),Math.sin(a)*(r-7),2,'#9aa2ac')}xst(g,'rgba(255,255,255,.5)',2);g.beginPath();g.arc(0,0,r*.5,3.6,4.6);g.stroke()},
 pod(g,w,h,P,v){const r=w/2,c=v%3==0?'#7dff8a':v%3==1?P.glow:'#ff9ad0';xc(g,0,0,r,'#15181c');xc(g,0,0,r-3,'#4a525e');
  const gr=g.createRadialGradient(0,0,1,0,0,r*.8);gr.addColorStop(0,'#ffffff');gr.addColorStop(.3,c);gr.addColorStop(1,shade(c,-.7));g.fillStyle=gr;g.beginPath();g.arc(0,0,r*.78,0,TAU);g.fill();
  g.fillStyle='rgba(0,20,30,.5)';g.beginPath();g.ellipse(0,0,r*.22,r*.42,0,0,TAU);g.fill();xc(g,0,-r*.36,r*.13,'rgba(0,20,30,.5)')},
 gen(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xr(g,-L/2,-S/2,L,S,P.metal[1]);xr(g,-L/2+3,-S/2+3,L-6,S-6,P.metal[0]);
  xst(g,'rgba(0,0,0,.35)',2);g.beginPath();for(let x=-L/2+8;x<-L*.05;x+=7){g.moveTo(x,-S/2+5);g.lineTo(x,S/2-5)}g.stroke();
  for(const fx of[L*.2,L*.38]){xc(g,fx,0,S*.3,'#15181c');xst(g,'#8a92a0',1.6);for(let i=0;i<5;i++){const a=i*TAU/5+v;g.beginPath();g.moveTo(fx,0);g.lineTo(fx+Math.cos(a)*S*.27,Math.sin(a)*S*.27);g.stroke()}}
  g.fillStyle=P.acc;g.fillRect(-L/2+3,-S/2+3,L-6,4);g.fillStyle='#111';for(let x=-L/2+3;x<L/2-6;x+=10)g.fillRect(x,-S/2+3,5,4);xc(g,L/2-10,S/2-9,3,'#7dff8a');g.restore()},
 turbine(g,w,h,P,v){const r=w/2;xc(g,0,0,r,'#1a1e24');xc(g,0,0,r-5,P.metal[1]);xc(g,0,0,r*.84,'#101317');
  g.fillStyle=P.metal[0];for(let i=0;i<9;i++){const a=i*TAU/9+v*.3;g.beginPath();g.moveTo(Math.cos(a)*r*.2,Math.sin(a)*r*.2);g.quadraticCurveTo(Math.cos(a+.45)*r*.6,Math.sin(a+.45)*r*.6,Math.cos(a+.3)*r*.8,Math.sin(a+.3)*r*.8);g.lineTo(Math.cos(a+.55)*r*.78,Math.sin(a+.55)*r*.78);g.quadraticCurveTo(Math.cos(a+.5)*r*.4,Math.sin(a+.5)*r*.4,Math.cos(a+.35)*r*.2,Math.sin(a+.35)*r*.2);g.fill()}
  xc(g,0,0,r*.22,'#3a4048');xc(g,0,0,r*.1,P.acc);for(let i=0;i<12;i++){const a=i*TAU/12;xc(g,Math.cos(a)*(r-9),Math.sin(a)*(r-9),2.2,'#9aa2ac')}},
 planter(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#8a8478');xr(g,-w/2+4,-h/2+4,w-8,h-8,'#3a2c1c');const n=Math.max(2,Math.floor(w*h/1100));
  for(let i=0;i<n;i++){const x=(xh(v,i)-.5)*(w-16),y=(xh(v,i+50)-.5)*(h-16),r=7+xh(v,i+90)*8;xc(g,x+1,y+2,r,'rgba(0,0,0,.3)');xc(g,x,y,r,['#2f6a2e','#3e8a38','#4f9a40'][i%3]);xc(g,x-r*.3,y-r*.3,r*.4,'rgba(170,230,120,.35)');if(xh(v,i+7)<.25)xc(g,x+r*.3,y,2.5,FLOWERS[i%7])}},
 sofa(g,w,h,P,v){const c=P.cloth[v%4];xrr(g,-w/2,-h/2,w,h,8,shade(c,-.35));xrr(g,-w/2+5,-h/2+10,w-10,h-14,6,c);xr(g,-1,-h/2+12,2,h-16,'rgba(0,0,0,.25)')},
 fountain(g,w,h,P,v){const r=w/2;xc(g,0,0,r,'#9a9488');xc(g,0,0,r-8,'#d8d2c4');const gr=g.createRadialGradient(0,0,r*.2,0,0,r-12);gr.addColorStop(0,'#7fd8ff');gr.addColorStop(1,'#1f6a8a');g.fillStyle=gr;g.beginPath();g.arc(0,0,r-12,0,TAU);g.fill();
  xst(g,'rgba(255,255,255,.35)',1.5);for(const k of[.45,.65,.85]){g.beginPath();g.arc(0,0,(r-12)*k,0,TAU);g.stroke()}xc(g,0,0,r*.22,'#d8d2c4');xc(g,0,0,r*.12,v%2?'#c9a227':'#e6e2d8');xc(g,-2,-2,r*.05,'#fff')},
 statue(g,w,h,P,v){const s=w/2;xr(g,-s,-s,w,w,'#8a8478');xr(g,-s+5,-s+5,w-10,w-10,'#d8d2c4');const c=v%2?'#c9a227':'#7a8a8a';xc(g,0,4,s*.5,shade(c,-.3));g.fillStyle=c;g.beginPath();g.ellipse(0,4,s*.48,s*.3,0,0,TAU);g.fill();xc(g,0,-s*.1,s*.2,c);xc(g,-s*.06,-s*.16,s*.06,'rgba(255,255,255,.5)')},
 holo(g,w,h,P,v){const r=w/2,c=P.glow;xc(g,0,0,r,'#15181e');xc(g,0,0,r-6,'#2a303c');xGlow(g,0,0,r*.95,c,.45);xst(g,c,1.4);g.globalAlpha=.85;
  g.beginPath();g.arc(0,0,r*.6,0,TAU);g.stroke();for(let i=1;i<4;i++){g.beginPath();g.ellipse(0,0,r*.6*i/4,r*.6,0,0,TAU);g.stroke();g.beginPath();g.ellipse(0,0,r*.6,r*.6*i/4,0,0,TAU);g.stroke()}g.globalAlpha=1;xc(g,0,0,4,'#fff')},
 console(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xrr(g,-L/2,-S/2,L,S,6,'#1a1e26');xrr(g,-L/2+4,-S/2+4,L-8,S*.55,4,'#0b2a3a');
  for(let i=0;i<3;i++)xr(g,-L/2+10+i*(L-20)/3,-S/2+8,(L-20)/3-6,S*.4,i==1?'#0e3a2a':'#0e2f44');xst(g,P.glow,1.2);g.beginPath();for(let i=0;i<3;i++){const x=-L/2+12+i*(L-20)/3;g.moveTo(x,-S/2+14);g.lineTo(x+(L-20)/3-12,-S/2+12+xh(v,i)*S*.3)}g.stroke();
  for(let i=0;i<Math.floor(L/12);i++)xc(g,-L/2+8+i*12,S/2-9,2.4,P.led[(i+v)%3]);g.restore()},
 holotable(g,w,h,P,v){const r=w/2;xc(g,0,0,r,'#15181e');xc(g,0,0,r-6,'#262c36');xGlow(g,0,0,r-8,P.glow,.5);xst(g,P.glow,1.2);g.globalAlpha=.8;
  for(let i=-3;i<=3;i++){g.beginPath();g.moveTo(-r*.6,i*r*.15);g.lineTo(r*.6,i*r*.15);g.moveTo(i*r*.15,-r*.6);g.lineTo(i*r*.15,r*.6);g.stroke()}
  g.globalAlpha=1;xc(g,(xh(v,1)-.5)*r*.6,(xh(v,2)-.5)*r*.6,4,'#ff4a4a');xc(g,(xh(v,3)-.5)*r*.6,(xh(v,4)-.5)*r*.6,4,'#7dff8a')},
 engine(g,w,h,P,v){const r=w/2,c=v%2?'#ffb040':P.glow;xc(g,0,0,r,'#101317');xc(g,0,0,r-6,P.metal[1]);for(let i=0;i<14;i++){const a=i*TAU/14;xc(g,Math.cos(a)*(r-12),Math.sin(a)*(r-12),3,'#9aa2ac')}
  xc(g,0,0,r*.74,'#1a1e24');xst(g,'#b0703a',r*.1);for(let i=0;i<16;i++){const a=i*TAU/16;g.beginPath();g.arc(0,0,r*.62,a,a+.28);g.stroke()}
  const gr=g.createRadialGradient(0,0,1,0,0,r*.5);gr.addColorStop(0,'#ffffff');gr.addColorStop(.35,c);gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.beginPath();g.arc(0,0,r*.5,0,TAU);g.fill();
  for(let i=0;i<4;i++){g.save();g.rotate(i*Math.PI/2+Math.PI/4);xr(g,r*.72,-8,r*.3,16,'#2a2f36');xr(g,r*.72,-3,r*.3,6,c);g.restore()}},
 shuttle(g,w,h,P,v){const L=w/2,S=h/2,c=P.crate[v%4][0];g.fillStyle=shade(c,-.35);g.beginPath();g.moveTo(-L*.4,0);g.lineTo(-L*.8,-S);g.lineTo(-L*.55,-S);g.lineTo(L*.1,-S*.3);g.lineTo(L*.1,S*.3);g.lineTo(-L*.55,S);g.lineTo(-L*.8,S);g.closePath();g.fill();
  g.fillStyle='#c8ccd2';g.beginPath();g.moveTo(L,0);g.lineTo(L*.5,-S*.36);g.lineTo(-L*.9,-S*.3);g.lineTo(-L*.9,S*.3);g.lineTo(L*.5,S*.36);g.closePath();g.fill();
  g.fillStyle=c;g.fillRect(-L*.5,-S*.3,L*.6,S*.6);g.fillStyle='#16324a';g.beginPath();g.moveTo(L*.82,0);g.lineTo(L*.5,-S*.2);g.lineTo(L*.4,0);g.lineTo(L*.5,S*.2);g.closePath();g.fill();
  xr(g,-L*.98,-S*.24,6,S*.18,P.glow);xr(g,-L*.98,S*.06,6,S*.18,P.glow);xst(g,'rgba(0,0,0,.4)',1.2);g.beginPath();g.moveTo(-L*.2,-S*.3);g.lineTo(-L*.2,S*.3);g.stroke()},
 bunk(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xr(g,-L/2,-S/2,L,S,'#2a2f36');xr(g,-L/2+3,-S/2+3,L-6,S-6,'#dfe2e6');
  xr(g,-L/2+4,-S/2+4,L*.22,S-8,'#ffffff');xr(g,-L/2+L*.3,-S/2+3,L*.68,S-6,P.cloth[v%4]);xst(g,'rgba(0,0,0,.25)',1);g.beginPath();g.moveTo(-L/2+L*.3,0);g.lineTo(L/2-4,0);g.stroke();g.restore()},
 medbed(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xr(g,-L/2,-S/2,L,S,'#8a929c');xrr(g,-L/2+3,-S/2+3,L-6,S-6,6,'#cfe6f0');xr(g,-L/2+5,-S/2+6,L*.2,S-12,'#ffffff');
  xr(g,L/2-22,-S/2-8,18,10,'#1a1e24');xst(g,'#7dff8a',1.2);g.beginPath();g.moveTo(L/2-20,-S/2-3);g.lineTo(L/2-15,-S/2-3);g.lineTo(L/2-13,-S/2-7);g.lineTo(L/2-10,-S/2);g.lineTo(L/2-6,-S/2-3);g.stroke();g.restore()},
 rack(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xr(g,-L/2,-S/2,L,S,'#1a1d22');xr(g,-L/2+2,-S/2+2,L-4,S-4,'#2e333b');
  for(let x=-L/2+10;x<L/2-6;x+=13){xr(g,x,-S/2+4,4,S-8,'#0d0f12');xr(g,x-1,S/2-9,6,5,'#4a3a2a')}g.restore()},
 pump(g,w,h,P,v){const r=w/2;xr(g,-r*.2,-r*.95,r*.4,r*1.9,'#3a4048');xc(g,0,0,r*.8,P.metal[1]);xc(g,0,0,r*.7,P.acc);xc(g,0,0,r*.5,shade(P.acc,-.35));
  xr(g,r*.4,-r*.25,r*.6,r*.5,P.metal[0]);xc(g,-r*.3,-r*.3,r*.22,'#c0392b');xst(g,'#7a1a12',1.5);for(let i=0;i<4;i++){const a=i*Math.PI/2;g.beginPath();g.moveTo(-r*.3,-r*.3);g.lineTo(-r*.3+Math.cos(a)*r*.2,-r*.3+Math.sin(a)*r*.2);g.stroke()}},
 hydro(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xr(g,-L/2,-S/2,L,S,'#3a4048');xr(g,-L/2+3,-S/2+3,L-6,S-6,'#24282e');
  for(let x=-L/2+10;x<L/2-6;x+=13)for(const y of[-S/4,S/4]){xc(g,x,y,5.5,['#3e9a3a','#5aba42','#2f7a2e'][(Math.abs(x|0)+v)%3])}xr(g,-L/2+3,-1.5,L-6,3,'rgba(220,120,255,.7)');g.restore()},
 locker(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w,n=Math.max(2,Math.floor(L/24)),c=P.metal[0];xr(g,-L/2,-S/2,L,S,'#1a1d22');
  for(let i=0;i<n;i++){const x=-L/2+2+i*(L-4)/n;xr(g,x,-S/2+2,(L-4)/n-2,S-4,i%2?c:shade(c,-.12));xr(g,x+3,-S/2+5,(L-4)/n-8,2,'rgba(0,0,0,.4)');xr(g,x+(L-4)/n-7,0,2,5,'#ccc')}g.restore()},
 barrier(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#5a5a56');xr(g,-w/2+3,-h/2+3,w-6,h-6,'#8a8a82');g.save();g.beginPath();g.rect(-w/2+3,-h/2+3,w-6,h-6);g.clip();g.fillStyle=P.acc;
  for(let x=-w/2-h;x<w/2+h;x+=20){g.beginPath();g.moveTo(x,-h/2);g.lineTo(x+10,-h/2);g.lineTo(x+10-h,h/2);g.lineTo(x-h,h/2);g.fill()}g.restore()},
 pillar(g,w,h,P,v){const r=w/2;if(M.th==3){g.fillStyle=P.pil[1];g.beginPath();for(let i=0;i<6;i++){const a=i*TAU/6;g.lineTo(Math.cos(a)*r,Math.sin(a)*r)}g.closePath();g.fill();g.fillStyle=P.pil[0];g.beginPath();for(let i=0;i<6;i++){const a=i*TAU/6;g.lineTo(Math.cos(a)*(r-4),Math.sin(a)*(r-4))}g.closePath();g.fill();xc(g,0,0,4,P.acc);return}
  xc(g,0,0,r,P.pil[1]);const gr=g.createRadialGradient(-r*.3,-r*.3,1,0,0,r-3);gr.addColorStop(0,'#ffffff');gr.addColorStop(.35,P.pil[0]);gr.addColorStop(1,P.pil[1]);g.fillStyle=gr;g.beginPath();g.arc(0,0,r-3,0,TAU);g.fill();
  if(M.th==4){xst(g,'#1a3038',2);g.beginPath();g.arc(0,0,r*.6,0,TAU);g.stroke()}},
 column(g,w,h,P,v,o){const cc=o&&o.cc;xr(g,-w/2,-h/2,w,h,cc?xmix(cc,'#000000',.55):P.pil[1]);xr(g,-w/2+4,-h/2+4,w-8,h-8,cc?xmix(cc,'#000000',.18):P.pil[0])},   // tinta simile al pavimento del corridoio
 cabin(g,w,h,P,v){const R2=P.roof;xr(g,-w/2,-h/2,w,h,'#0b0d10');xr(g,-w/2+5,-h/2+5,w-10,h-10,R2[0]);
  if(M.th==2&&v%2==0){xr(g,-w/2+8,-h/2+8,w-16,h-16,'rgba(110,200,255,.25)');xst(g,'rgba(200,240,255,.35)',1.2);g.beginPath();for(let x=-w/2+8;x<w/2-8;x+=w/4){g.moveTo(x,-h/2+8);g.lineTo(x,h/2-8)}g.stroke();   // ufficio vetrato: si vedono le scrivanie
   for(let i=0;i<3;i++)xr(g,-w/2+16+i*(w-32)/3,-6,(w-32)/3-10,14,'rgba(230,226,214,.55)')}
  else{xst(g,'rgba(0,0,0,.25)',1.5);g.beginPath();for(let x=-w/2+5+(w-10)/4;x<w/2-5;x+=(w-10)/4){g.moveTo(x,-h/2+5);g.lineTo(x,h/2-5)}g.stroke();
   xr(g,-w/2+5,-h/2+5,w-10,4,R2[1]);for(let i=0;i<2;i++){const x=(xh(v,i)-.5)*w*.5,y=(xh(v,i+9)-.5)*h*.5;xr(g,x-14,y-14,28,28,'#2a2e34');xc(g,x,y,10,'#15181c');xst(g,'#8a92a0',1.4);g.beginPath();g.moveTo(x-8,y);g.lineTo(x+8,y);g.moveTo(x,y-8);g.lineTo(x,y+8);g.stroke()}
   xr(g,w/2-30,h/2-22,18,12,P.glow);xc(g,-w/2+16,h/2-16,4,P.acc)}},
 core(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#07080a');xr(g,-w/2+6,-h/2+6,w-12,h-12,'#11141a');xst(g,P.glow,1);g.globalAlpha=.55;g.beginPath();for(let x=-w/2+14;x<w/2-8;x+=14){g.moveTo(x,-h/2+8);g.lineTo(x,h/2-8)}for(let y=-h/2+14;y<h/2-8;y+=14){g.moveTo(-w/2+8,y);g.lineTo(w/2-8,y)}g.stroke();g.globalAlpha=1;
  xGlow(g,0,0,Math.min(w,h)*.35,P.glow,.6);xc(g,0,0,Math.min(w,h)*.16,'#0b0d10');xst(g,P.glow,3);g.beginPath();g.arc(0,0,Math.min(w,h)*.16,0,TAU);g.stroke()},
 reactor(g,w,h,P,v){const r=w/2;xc(g,0,0,r,'#0d0f12');g.save();g.beginPath();g.arc(0,0,r-2,0,TAU);g.arc(0,0,r-20,0,TAU,true);g.clip();for(let i=0;i<36;i++){const a=i*TAU/36;g.fillStyle=i%2?'#ffd23f':'#111';g.beginPath();g.moveTo(0,0);g.arc(0,0,r,a,a+TAU/36);g.fill()}g.restore();
  xc(g,0,0,r-22,'#3a424e');xc(g,0,0,r*.72,'#1a1e24');for(let i=0;i<8;i++){const a=i*TAU/8;xc(g,Math.cos(a)*r*.82,Math.sin(a)*r*.82,6,'#9aa2ac');g.save();g.rotate(a);xr(g,r*.36,-6,r*.34,12,'#2a2f36');g.restore()}
  const c=v%2?'#7dff8a':P.glow,gr=g.createRadialGradient(0,0,1,0,0,r*.42);gr.addColorStop(0,'#ffffff');gr.addColorStop(.3,c);gr.addColorStop(1,shade(c,-.7));g.fillStyle=gr;g.beginPath();g.arc(0,0,r*.42,0,TAU);g.fill();
  xst(g,'rgba(0,0,0,.45)',2);for(let i=0;i<6;i++){const a=i*TAU/6;g.beginPath();g.moveTo(0,0);g.lineTo(Math.cos(a)*r*.42,Math.sin(a)*r*.42);g.stroke()}},
 aquarium(g,w,h,P,v){const r=w/2;xc(g,0,0,r,'#1c2a30');xc(g,0,0,r-8,'#4a6a72');const gr=g.createRadialGradient(-r*.2,-r*.2,r*.1,0,0,r-12);gr.addColorStop(0,'#5fd8f0');gr.addColorStop(1,'#0b4a62');g.fillStyle=gr;g.beginPath();g.arc(0,0,r-12,0,TAU);g.fill();
  for(let i=0;i<9;i++){const a=xh(v,i)*TAU,d=xh(v,i+20)*(r-30);xc(g,Math.cos(a)*d,Math.sin(a)*d,6+xh(v,i+40)*12,['#ff6a8a','#ff9a3a','#c25fff','#3fe07a'][i%4])}   // coralli
  for(let i=0;i<14;i++){const a=xh(v,i+60)*TAU,d=xh(v,i+80)*(r-26),x=Math.cos(a)*d,y=Math.sin(a)*d,an=xh(v,i+99)*TAU,c=['#ffd23f','#ff7a3a','#7fd8ff','#ffffff'][i%4];g.save();g.translate(x,y);g.rotate(an);g.fillStyle=c;g.beginPath();g.ellipse(0,0,6,3,0,0,TAU);g.fill();g.beginPath();g.moveTo(-5,0);g.lineTo(-10,-3);g.lineTo(-10,3);g.closePath();g.fill();g.restore()}
  xst(g,'rgba(255,255,255,.4)',3);g.beginPath();g.arc(0,0,r-16,3.5,4.5);g.stroke()},
 bridge(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#0b0d10');xr(g,-w/2+5,-h/2+5,w-10,h-10,P.roof[0]);g.fillStyle='rgba(110,220,255,.45)';g.beginPath();g.moveTo(w/2-5,-h/2+12);g.lineTo(w/2-28,-h/2+12);g.lineTo(w/2-28,h/2-12);g.lineTo(w/2-5,h/2-12);g.closePath();g.fill();
  xc(g,-w*.15,0,Math.min(w,h)*.18,'#2a303a');xst(g,P.glow,2);g.beginPath();g.arc(-w*.15,0,Math.min(w,h)*.12,0,TAU);g.stroke();xr(g,-w/2+12,-h/2+10,w*.3,6,P.acc)},
 armcrates(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#1a1d14');const C=['#4b5a2a','#5a6a32','#3f4d24'];for(let i=0;i<2;i++)for(let j=0;j<2;j++){const x=-w/2+4+i*(w-8)/2,y=-h/2+4+j*(h-8)/2,cw=(w-8)/2-3,ch=(h-8)/2-3;xr(g,x,y,cw,ch,C[(i+j+v)%3]);xr(g,x+2,y+2,cw-4,ch-4,xmix(C[(i+j+v)%3],'#ffffff',.08));
   g.fillStyle='rgba(255,210,63,.75)';g.fillRect(x+4,y+ch/2-2,cw-8,4);xst(g,'rgba(0,0,0,.4)',1.5);g.strokeRect(x+.5,y+.5,cw-1,ch-1)}xr(g,-w/2+4,-3,w-8,6,'rgba(0,0,0,.35)')},   // casse di armi (armeria dell'hangar)
 lift(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#0b0d10');g.save();g.beginPath();g.rect(-w/2+4,-h/2+4,w-8,h-8);g.clip();g.fillStyle=P.acc;for(let x=-w;x<w;x+=24){g.beginPath();g.moveTo(x,-h/2);g.lineTo(x+12,-h/2);g.lineTo(x+12-h,h/2);g.lineTo(x-h,h/2);g.fill()}g.restore();
  xr(g,-w/2+14,-h/2+14,w-28,h-28,'#3a4048');xst(g,'rgba(0,0,0,.4)',1);g.beginPath();for(let x=-w/2+20;x<w/2-14;x+=10){g.moveTo(x,-h/2+14);g.lineTo(x,h/2-14)}g.stroke();
  g.fillStyle=P.acc;for(const s of[-1,1]){g.beginPath();g.moveTo(0,s*h*.18);g.lineTo(-14,s*h*.05);g.lineTo(14,s*h*.05);g.closePath();g.fill()}},
 // Base lunare: cupola di vetro su anello di metallo (edifici tondi, ottagonali, esagonali)
 // --- nuovi oggetti
 armchair(g,w,h,P,v){const c=P.cloth[v%4];xrr(g,-w/2,-h/2,w,h,9,shade(c,-.35));xrr(g,-w/2+7,-h/2+12,w-14,h-15,6,c);xrr(g,-w/2,-h/2+8,7,h-8,3,shade(c,-.2));xrr(g,w/2-7,-h/2+8,7,h-8,3,shade(c,-.2))},
 chair(g,w,h,P,v){xrr(g,-w/2,-h/2,w,h,6,'#2e323a');xrr(g,-w/2+3,-h/2+8,w-6,h-11,5,['#4a5a7a','#6a4a4a','#4a6a5a','#5a5a5a'][v%4]);xr(g,-w/2+4,-h/2+2,w-8,4,'#5a606a')},
 rail(g,w,h,P,v){g.fillStyle='rgba(0,0,0,.35)';g.fillRect(-w/2,-1,w,h/2+4);xr(g,-w/2,-3,w,6,'#4a525c');xr(g,-w/2,-1.2,w,2.4,P.acc);
  for(let x=-w/2+7;x<w/2-3;x+=20){xc(g,x,0,4.6,'#22262c');xc(g,x,0,2.6,'#9aa2ac')}},
 shaft(g,w,h,P,v){const r=w/2;xc(g,0,0,r,'#1a1e24');xc(g,0,0,r-5,P.pil[1]);xc(g,0,0,r-12,P.pil[0]);xc(g,0,0,r*.62,'#0a1218');
  const gr=g.createRadialGradient(0,0,r*.05,0,0,r*.58);gr.addColorStop(0,v%2?'#ffe6b0':'#cfefff');gr.addColorStop(1,'#14303c');g.globalAlpha=.85;g.fillStyle=gr;g.beginPath();g.arc(0,0,r*.57,0,TAU);g.fill();g.globalAlpha=1;
  g.strokeStyle='rgba(255,255,255,.25)';g.lineWidth=2;for(let i=0;i<8;i++){const a=i*TAU/8;g.beginPath();g.moveTo(Math.cos(a)*r*.57,Math.sin(a)*r*.57);g.lineTo(Math.cos(a)*(r-12),Math.sin(a)*(r-12));g.stroke()}
  for(let i=0;i<16;i++){const a=i*TAU/16;xc(g,Math.cos(a)*(r-8),Math.sin(a)*(r-8),2.4,P.led[i%3])}xrr(g,-r*.22,-r*.22,r*.44,r*.44,6,'rgba(40,50,60,.7)');xr(g,-r*.2,-1.5,r*.4,3,P.acc)},
 vend(g,w,h,P,v){const c=['#b03030','#2a6ab0','#2a8a4a','#c08a20'][v%4];xrr(g,-w/2,-h/2,w,h,4,shade(c,-.4));xrr(g,-w/2+3,-h/2+3,w-6,h-6,3,c);xr(g,-w/2+6,-h/2+5,w*.62,h-10,'#1a2a36');
  for(let i=0;i<3;i++)for(let j=0;j<2;j++)xc(g,-w/2+12+i*(w*.62-12)/3,-h/2+12+j*(h-22)/2,3,['#ffd27a','#ff6a6a','#7affc8'][(i+j+v)%3]);xr(g,w/2-w*.28,-h/2+8,w*.2,h*.25,'#d0d4d8');xc(g,w/2-w*.18,h*.15,3,P.led[0])},
 pot(g,w,h,P,v){const r=w/2;xc(g,0,0,r,'#6a4a32');xc(g,0,0,r-4,'#3a2a1a');const c=['#3a7a3a','#4a8a2a','#2a6a4a'][v%3];
  for(let i=0;i<7;i++){const a=i*TAU/7+v,d=r*.45;xc(g,Math.cos(a)*d,Math.sin(a)*d,r*.42,shade(c,-.2+i%3*.12))}xc(g,0,0,r*.35,shade(c,.2))},
 bigscreen(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xr(g,-L/2,-S/2,L,S,'#14161a');xr(g,-L/2+3,-S/2+3,L-6,S-6,'#0a2a3a');
  const gr=g.createLinearGradient(-L/2,0,L/2,0);gr.addColorStop(0,P.glow);gr.addColorStop(.5,'#2a6a9a');gr.addColorStop(1,P.acc);g.globalAlpha=.6;g.fillStyle=gr;g.fillRect(-L/2+5,-S/2+5,L-10,S-10);g.globalAlpha=1;
  for(let x=-L/2+10;x<L/2-10;x+=14)xr(g,x,-S/2+5,6,(S-10)*(.3+xh(x|0,v)*.7),'rgba(255,255,255,.25)');g.restore()},
 robot(g,w,h,P,v){const r=w/2;xc(g,0,0,r,'#2a2e34');xc(g,0,0,r-3,v%2?'#c8ccd2':'#9aa2ac');xc(g,0,0,r*.6,'#3a3e46');xc(g,r*.2,-r*.15,r*.18,P.led[v%3]);xc(g,r*.2,r*.15,r*.18,P.led[v%3]);
  xr(g,-r-4,-4,8,8,'#555');xr(g,r-4,-4,8,8,'#555')},
 copier(g,w,h,P,v){xrr(g,-w/2,-h/2,w,h,4,'#9aa0a8');xrr(g,-w/2+3,-h/2+3,w-6,h-6,3,'#d8dce0');xr(g,-w/2+6,-h/2+6,w-12,h*.45,'#4a5058');xr(g,-w/2+8,-h/2+8,w-16,h*.45-4,'#6a8aa0');xr(g,w/2-16,h/2-12,10,6,'#2a2e34');xc(g,-w/2+12,h/2-10,3,'#7dff8a')},
 bin(g,w,h,P,v){const r=w/2;xc(g,0,0,r,'#2a2e34');xc(g,0,0,r-3,['#3a6a3a','#2a4a7a','#4a5a4a'][v%3]);xc(g,0,0,r*.55,'#14161a')},
 books(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xr(g,-L/2,-S/2,L,S,'#4a3222');let x=-L/2+3;
  while(x<L/2-4){const bw=4+xh(x|0,v)*5,c=['#8a2a2a','#2a4a7a','#3a6a3a','#a08a3a','#5a3a6a','#c8c0a8'][(x*7|0)%6];xr(g,x,-S/2+3,bw-1,S-6,c);x+=bw}g.restore()},
 sculpt(g,w,h,P,v){const r=w/2;xc(g,0,0,r,'#3a3e46');xc(g,0,0,r-4,'#6a6e76');g.fillStyle=v%2?'#c9a74a':'#a8d8e8';g.beginPath();for(let i=0;i<10;i++){const a=i*TAU/10,d=i%2?r*.3:r*.72;g.lineTo(Math.cos(a)*d,Math.sin(a)*d)}g.closePath();g.fill();
  xc(g,0,0,r*.18,'#ffffff');xGlow(g,0,0,r*.8,P.glow,.25)},
 arcade(g,w,h,P,v){xrr(g,-w/2,-h/2,w,h,4,'#1a1a24');xr(g,-w/2+4,-h/2+4,w-8,h*.5,['#5a2a8a','#2a5a8a','#8a2a4a'][v%3]);xr(g,-w/2+8,-h/2+8,w-16,h*.5-8,'#0a1420');
  for(let i=0;i<5;i++)xr(g,-w/2+10+i*(w-20)/5,-h/2+12+xh(i,v)*(h*.3),4,4,P.led[i%3]);xc(g,-w*.2,h*.22,4,'#ff4a4a');xc(g,w*.1,h*.22,4,'#4aff7a');xc(g,w*.25,h*.22,4,'#4a7aff')},
 bench2(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xr(g,-L/2+6,-S/2,6,S,'#2a2e34');xr(g,L/2-12,-S/2,6,S,'#2a2e34');
  for(let i=0;i<3;i++)xrr(g,-L/2,-S/2+2+i*(S-4)/3,L,(S-4)/3-2,2,i%2?'#8a6a48':'#9a7a52');g.restore()},
 stall(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#6a7a84');xr(g,-w/2+3,-h/2+3,w-6,h-6,'#c8d4dc');xrr(g,-w*.22,-h*.3,w*.44,h*.5,10,'#f4f8fa');xrr(g,-w*.16,-h*.22,w*.32,h*.34,8,'#b8c8d0');xr(g,-w/2,h/2-6,w,6,'#5a6a74')},
 sink(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xr(g,-L/2,-S/2,L,S,'#8a9aa4');xr(g,-L/2+2,-S/2+2,L-4,S-4,'#e4ecf0');
  const n=Math.max(1,Math.floor(L/56));for(let i=0;i<n;i++){const x=-L/2+(i+.5)*L/n;xrr(g,x-16,-S/2+8,32,S-16,8,'#b8c8d0');xc(g,x,-S/2+5,3,'#9aa4aa')}g.restore()},
 mechbay(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#2a2e34');xr(g,-w/2+5,-h/2+5,w-10,h-10,'#3a4048');g.strokeStyle=P.acc;g.lineWidth=4;g.setLineDash([10,8]);g.strokeRect(-w/2+9,-h/2+9,w-18,h-18);g.setLineDash([]);
  xr(g,-w*.28,-h*.32,w*.56,h*.64,'#5a636e');xr(g,-w*.18,-h*.22,w*.36,h*.3,'#6e7884');xr(g,-w*.36,-h*.1,w*.1,h*.36,'#4a525c');xr(g,w*.26,-h*.1,w*.1,h*.36,'#4a525c');xc(g,0,-h*.08,5,P.led[0]);
  xr(g,-w/2,-h/2,8,h,'#1a1d22');xr(g,w/2-8,-h/2,8,h,'#1a1d22')},
 torp(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xr(g,-L/2,-S/2,L,S,'#2a3038');const n=Math.max(1,Math.floor(S/26));
  for(let i=0;i<n;i++){const y=-S/2+(i+.5)*S/n,r=S/n*.38;xrr(g,-L/2+8,y-r,L-24,r*2,r,'#6a747e');xr(g,-L/2+8+(L-24)*.7,y-r,4,r*2,P.acc);g.fillStyle='#4a525c';g.beginPath();g.moveTo(L/2-16,y);g.lineTo(L/2-4,y-r*1.3);g.lineTo(L/2-4,y+r*1.3);g.fill()}g.restore()},
 fuelc(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xr(g,-L/2,-S/2,L,S,'#2a2e34');const n=Math.max(2,Math.floor(L/34));
  for(let i=0;i<n;i++){const x=-L/2+(i+.5)*L/n;xc(g,x,0,S*.38,'#7a2a1a');xc(g,x,0,S*.3,v%2?'#c04a2a':'#d0a030');xc(g,x-3,-3,S*.08,'rgba(255,255,255,.4)')}xr(g,-L/2,-2,L,4,'#14161a');g.restore()},
 cryo(g,w,h,P,v){xrr(g,-w/2,-h/2,w,h,w*.45,'#3a4250');xrr(g,-w/2+4,-h/2+4,w-8,h-8,w*.4,'#8ab8d0');const gr=g.createLinearGradient(0,-h/2,0,h/2);gr.addColorStop(0,'rgba(220,250,255,.7)');gr.addColorStop(1,'rgba(80,160,200,.3)');
  g.fillStyle=gr;g.beginPath();g.roundRect(-w/2+7,-h/2+7,w-14,h-14,w*.35);g.fill();xrr(g,-w*.18,-h*.28,w*.36,h*.56,w*.16,'rgba(40,60,80,.45)');xc(g,0,h/2-8,3,P.led[0])},
 ammo(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#3a4426');xr(g,-w/2+3,-h/2+3,w-6,h-6,'#5e6b3a');xr(g,-w/2+3,-2,w-6,4,'#2e3620');xr(g,-6,-h/2+4,12,5,'#ffd23f');g.fillStyle='#ffd23f';g.font='bold 9px monospace';g.textAlign='center';g.fillText('AMMO',0,h/2-6)},
 drone(g,w,h,P,v){const r=w/2;g.strokeStyle='#3a3e46';g.lineWidth=5;g.beginPath();g.moveTo(-r*.7,-r*.7);g.lineTo(r*.7,r*.7);g.moveTo(r*.7,-r*.7);g.lineTo(-r*.7,r*.7);g.stroke();
  for(const[sx,sy]of[[-1,-1],[1,-1],[1,1],[-1,1]]){xc(g,sx*r*.7,sy*r*.7,r*.3,'rgba(30,34,40,.85)');g.strokeStyle='rgba(200,210,220,.4)';g.lineWidth=1.5;g.beginPath();g.arc(sx*r*.7,sy*r*.7,r*.28,0,TAU);g.stroke()}
  xrr(g,-r*.35,-r*.35,r*.7,r*.7,4,'#5a636e');xc(g,0,0,r*.14,P.led[v%3])},
 cargo(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#2a2e34');const c=P.crate[(v+1)%P.crate.length];xr(g,-w/2+4,-h/2+4,w-8,h-8,c[0]);g.strokeStyle=c[1];g.lineWidth=3;g.beginPath();
  for(let x=-w/2+14;x<w/2-8;x+=14){g.moveTo(x,-h/2+4);g.lineTo(x,h/2-4)}g.stroke();xr(g,-w*.2,-h*.12,w*.4,h*.24,'#14161a');xr(g,-w*.18,-h*.1,w*.36,h*.2,P.acc)},
 o2(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xr(g,-L/2,-S/2,L,S,'#2a3038');const n=Math.max(2,Math.floor(L/26));
  for(let i=0;i<n;i++){const x=-L/2+(i+.5)*L/n;xc(g,x,0,S*.32,v%2?'#2a6a8a':'#e0e4e8');xc(g,x,0,S*.14,'#8a929c');xc(g,x-2,-2,S*.06,'rgba(255,255,255,.6)')}g.restore()},
 minisub(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xrr(g,-L/2,-S*.38,L,S*.76,S*.38,'#c8a030');xrr(g,-L/2+4,-S*.32,L-8,S*.64,S*.32,'#e8c040');
  g.fillStyle='#14303a';g.beginPath();g.ellipse(L*.26,0,S*.26,S*.22,0,0,TAU);g.fill();g.fillStyle='rgba(180,240,255,.4)';g.beginPath();g.ellipse(L*.22,-S*.06,S*.12,S*.08,0,0,TAU);g.fill();
  xr(g,-L/2-4,-S/2,14,S,'#5a636e');xc(g,-L*.1,0,S*.12,'#9a7a20');g.restore()},
 suits(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;xr(g,-L/2,-S/2,L,S,'#1a1d22');const n=Math.max(2,Math.floor(L/34));
  for(let i=0;i<n;i++){const x=-L/2+(i+.5)*L/n;xrr(g,x-12,-S/2+5,24,S-10,8,M.th==4?'#c8a030':'#d8dce0');xc(g,x,-S/2+S*.35,S*.2,'#2a4a5a');xc(g,x-2,-S/2+S*.3,S*.06,'rgba(255,255,255,.5)')}g.restore()},
 valve(g,w,h,P,v){const r=w/2;xc(g,0,0,r,'#2a3038');xc(g,0,0,r-4,'#5a636e');g.strokeStyle='#b03030';g.lineWidth=5;g.beginPath();g.arc(0,0,r*.62,0,TAU);g.stroke();g.lineWidth=4;g.beginPath();
  for(let i=0;i<4;i++){const a=i*TAU/4+v;g.moveTo(0,0);g.lineTo(Math.cos(a)*r*.62,Math.sin(a)*r*.62)}g.stroke();xc(g,0,0,r*.18,'#8a929c')},
 sample(g,w,h,P,v){const r=w/2;xc(g,0,0,r,'#2a3038');xc(g,0,0,r-4,'#8ab8c8');xc(g,0,0,r-8,['#2a8a6a','#8a4ac0','#c08a2a'][v%3]);xGlow(g,0,0,r,['#4affc0','#c08aff','#ffd27a'][v%3],.35);
  for(let i=0;i<5;i++)xc(g,(xh(i,v,1)-.5)*r,(xh(i,v,2)-.5)*r,2+xh(i,v,3)*3,'rgba(255,255,255,.5)');xc(g,-r*.35,-r*.35,r*.15,'rgba(255,255,255,.5)')},
 compressor(g,w,h,P,v){xr(g,-w/2,-h/2,w,h,'#22262c');xr(g,-w/2+4,-h/2+4,w-8,h-8,'#4a525c');const r=Math.min(w,h)*.3;xc(g,-w*.18,0,r,'#2a2e34');g.strokeStyle='#6a747e';g.lineWidth=2;
  for(let i=0;i<6;i++){const a=i*TAU/6+v;g.beginPath();g.moveTo(-w*.18,0);g.lineTo(-w*.18+Math.cos(a)*r,Math.sin(a)*r);g.stroke()}xr(g,w*.1,-h*.3,w*.28,h*.6,'#3a4048');for(let y=-h*.25;y<h*.25;y+=7)xr(g,w*.12,y,w*.24,3,'#1a1d22');xc(g,w*.3,h*.36,3,P.led[1])},
 dome(g,w,h,P,v,o){const r=Math.max(w,h)/2,pal=BPAL[o.pal]||['#6e7278','#a6aab0'];xc(g,0,0,r,'#2a2e34');xc(g,0,0,r-3,pal[0]);xc(g,0,0,r*.86,'#1a2026');
  g.save();g.beginPath();g.arc(0,0,r*.84,0,TAU);g.clip();const inn=['#2f6a3a','#4a5a6a','#6a5a3a','#3a4a6a'][v%4];xc(g,0,0,r*.84,inn);
  for(let i=0;i<10;i++){const a=xh(v,i)*TAU,d=xh(v,i+9)*r*.6;xc(g,Math.cos(a)*d,Math.sin(a)*d,r*(.05+xh(v,i+3)*.08),v%4==0?'#4f9a40':'#8a92a0')}
  const gr=g.createRadialGradient(-r*.35,-r*.35,r*.05,0,0,r*.9);gr.addColorStop(0,'rgba(255,255,255,.75)');gr.addColorStop(.3,'rgba(180,230,255,.28)');gr.addColorStop(1,'rgba(40,80,120,.35)');g.fillStyle=gr;g.fillRect(-r,-r,2*r,2*r);g.restore();
  xst(g,'rgba(220,235,245,.55)',1.4);for(let i=0;i<8;i++){const a=i*TAU/8;g.beginPath();g.moveTo(0,0);g.lineTo(Math.cos(a)*r*.84,Math.sin(a)*r*.84);g.stroke()}
  for(const k of[.35,.62]){g.beginPath();g.arc(0,0,r*.84*k,0,TAU);g.stroke()}xc(g,0,0,r*.08,'#dfe4ea');
  for(let i=0;i<3;i++){const a=i*TAU/3+v;g.save();g.rotate(a);xr(g,r-4,-r*.12,r*.18,r*.24,pal[0]);g.restore()}}};   // portelli d'accesso
// --- ASTRONAVE: ostacoli nuovi (stesso stile degli altri: rettangoli e cerchi pieni, luci dei led del tema)
Object.assign(XA,{
 navcon(g,w,h,P,v){const hor=w>=h;g.save();if(!hor)g.rotate(Math.PI/2);const L=hor?w:h,S=hor?h:w;   // consolle di navigazione curva: il davanti è verso +S
  const band=(k,c)=>{g.fillStyle=c;g.beginPath();g.moveTo(-L/2+k,S/2-k);g.quadraticCurveTo(0,-S/2-S*.4+k*2.2,L/2-k,S/2-k);g.lineTo(L/2-k-S*.32,S/2-k);g.quadraticCurveTo(0,-S*.1+k*1.4,-L/2+k+S*.32,S/2-k);g.closePath();g.fill()};
  band(0,'#14181f');band(3,'#2a303a');band(6,'#0b2a3a');
  g.save();g.globalAlpha=.85;for(let i=0;i<4;i++){const t=(i+.5)/4,x=-L/2+L*t,y=S/2-S*.55-Math.sin(t*Math.PI)*S*.25;xr(g,x-L*.09,y-3,L*.18,6,i==1||i==2?'#1f6a8a':'#164a5e');xr(g,x-L*.07,y-1,L*.14*(.3+xh(v,i)*.7),2,P.glow)}g.restore();
  for(let i=0;i<6;i++){const t=(i+.5)/6;xc(g,-L/2+L*t*.9+L*.05,S/2-6,1.8,P.led[(i+v)%3])}g.restore()},
 captchair(g,w,h,P,v){const c=P.cloth[(v+1)%4];xrr(g,-w/2,-h/2,w,h,10,'#1c2027');xrr(g,-w/2+5,-h/2+9,w-10,h-12,7,c);xrr(g,-w/2+5,-h/2+9,w-10,6,3,shade(c,.15));   // poltrona del comandante: braccioli con pannelli
  xrr(g,-w/2-3,-h/2+6,7,h-6,3,'#3a414c');xrr(g,w/2-4,-h/2+6,7,h-6,3,'#3a414c');xc(g,-w/2+.5,h/2-7,1.8,P.led[0]);xc(g,w/2-.5,h/2-7,1.8,P.led[2]);xr(g,-w/2+8,-h/2+2,w-16,3,P.acc)},
 synth(g,w,h,P,v){xrr(g,-w/2,-h/2,w,h,5,'#22272e');xrr(g,-w/2+3,-h/2+3,w-6,h-6,4,P.metal[0]);   // sintetizzatore di cibo: vano luminoso, schermino, griglia
  xrr(g,-w*.3,-h*.05,w*.6,h*.36,3,'#0b1014');xGlow(g,0,h*.12,Math.min(w,h)*.38,v%2?'#ffd27a':P.glow,.55);xr(g,-w*.36,-h/2+6,w*.34,h*.2,'#0b2a3a');xr(g,-w*.34,-h/2+8,w*.22,2,P.glow);
  for(let i=0;i<3;i++)xr(g,w*.08+i*w*.1,-h/2+7,w*.06,h*.18,'rgba(0,0,0,.35)');xc(g,w*.36,h/2-6,2,P.led[1])},
 maglock(g,w,h,P,v){const C=P.crate[v%P.crate.length];xr(g,-w/2,-h/2,w,h,'#191c21');xr(g,-w/2+5,-h/2+5,w-10,h-10,C[1]);xr(g,-w/2+8,-h/2+8,w-16,h-16,C[0]);   // carico bloccato da morse magnetiche
  xst(g,'rgba(0,0,0,.35)',2);g.beginPath();g.moveTo(-w/2+8,-h/2+8);g.lineTo(w/2-8,h/2-8);g.moveTo(w/2-8,-h/2+8);g.lineTo(-w/2+8,h/2-8);g.stroke();
  for(const[sx,sy]of[[-1,-1],[1,-1],[1,1],[-1,1]]){xr(g,sx*w/2-(sx>0?12:0),sy*h/2-(sy>0?12:0),12,12,'#e0a020');xr(g,sx*w/2-(sx>0?8:-4)-(sx>0?0:4),sy*h/2-(sy>0?8:-4)-(sy>0?0:4),4,4,'#14161a')}
  g.save();g.globalAlpha=.7;xr(g,-w/2+2,-1.5,4,3,P.glow);xr(g,w/2-6,-1.5,4,3,P.glow);g.restore()},
 plasmac(g,w,h,P,v){const r=w/2,c=['#c08aff','#7fe3ff','#ff8ad0','#ffb040'][v%4];xc(g,0,0,r,'#14171c');xc(g,0,0,r-4,P.metal[1]);   // bobina al plasma: spire di rame e nucleo acceso
  xst(g,'#b8743a',r*.12);for(const k of[.78,.6]){g.beginPath();g.arc(0,0,r*k,0,TAU);g.stroke()}xst(g,'#6a3a1a',1.2);for(let i=0;i<18;i++){const a=i*TAU/18;g.beginPath();g.moveTo(Math.cos(a)*r*.52,Math.sin(a)*r*.52);g.lineTo(Math.cos(a)*r*.86,Math.sin(a)*r*.86);g.stroke()}
  xc(g,0,0,r*.42,'#0b0d12');xGlow(g,0,0,r*.48,c,.9);xc(g,0,0,r*.12,'#ffffff');for(let i=0;i<4;i++){const a=i*TAU/4+Math.PI/4;xr(g,Math.cos(a)*(r-3)-3,Math.sin(a)*(r-3)-3,6,6,'#3a414c')}},
 lifepod(g,w,h,P,v){const hor=w>=h;g.save();if(hor)g.rotate(Math.PI/2);const S=hor?h:w,L=hor?w:h;   // capsula di salvataggio sulla sua rampa di lancio
  xr(g,-S/2-4,-L/2,4,L,'#3a414c');xr(g,S/2,-L/2,4,L,'#3a414c');xrr(g,-S/2,-L/2,S,L,S*.48,'#2a3038');xrr(g,-S/2+3,-L/2+3,S-6,L-6,S*.44,'#c8ccd2');
  g.save();g.beginPath();g.roundRect(-S/2+3,-L/2+3,S-6,L-6,S*.44);g.clip();for(const y of[-L*.12,L*.2])xr(g,-S/2,y,S,6,'#e07a1e');g.restore();
  xrr(g,-S*.28,-L/2+S*.22,S*.56,S*.42,S*.2,'#123044');xrr(g,-S*.22,-L/2+S*.26,S*.2,S*.12,S*.06,'rgba(200,240,255,.45)');xc(g,0,L/2-S*.32,S*.16,'#14161a');xGlow(g,0,L/2-S*.32,S*.2,'#ffb040',.5);g.restore()}});
// --- ASTRONAVE: decorazioni piatte nuove (dipinte nello sfondo, come quelle di XM): (g, decorazione, colori del tema), già traslate e ruotate
const XDS={
 // --- base sottomarina: schermo del sonar, mosaico dei pesci, rete da pesca, sabbia con le conchiglie
 sonar(g,f){const r=Math.min(f.w,f.h)/2;xc(g,0,0,r+4,'rgba(8,20,24,.75)');xc(g,0,0,r,'rgba(10,60,50,.7)');g.strokeStyle='rgba(110,255,180,.45)';g.lineWidth=1.5;for(let k=1;k<=3;k++){g.beginPath();g.arc(0,0,r*k/3,0,TAU);g.stroke()}
  g.beginPath();g.moveTo(-r,0);g.lineTo(r,0);g.moveTo(0,-r);g.lineTo(0,r);g.stroke();const a=hs(1,f.s,1)*TAU;g.fillStyle='rgba(110,255,180,.25)';g.beginPath();g.moveTo(0,0);g.arc(0,0,r,a,a+.7);g.closePath();g.fill();
  for(let i=0;i<4;i++){const b=hs(i,f.s,2)*TAU,q=r*(.25+hs(i,f.s,3)*.65);xc(g,Math.cos(b)*q,Math.sin(b)*q,2.5,'rgba(160,255,200,.85)')}},
 fishmos(g,f){const r=Math.min(f.w,f.h)/2,C=['#ffb03a','#ff6a5a','#ffe07a'];xc(g,0,0,r,'#d8cfb8');xc(g,0,0,r-6,'#2a6f8a');xc(g,0,0,r*.62,'#3a8aa4');g.strokeStyle='rgba(0,0,0,.22)';g.lineWidth=1;
  for(let i=0;i<24;i++){const a=i*TAU/24;g.beginPath();g.moveTo(Math.cos(a)*r*.62,Math.sin(a)*r*.62);g.lineTo(Math.cos(a)*(r-6),Math.sin(a)*(r-6));g.stroke()}
  for(let i=0;i<5;i++){const a=i*TAU/5+hs(1,f.s,1),q=r*.8;g.save();g.translate(Math.cos(a)*q,Math.sin(a)*q);g.rotate(a+XH);g.fillStyle=C[i%3];g.beginPath();g.ellipse(0,0,r*.12,r*.05,0,0,TAU);g.fill();
   g.beginPath();g.moveTo(-r*.11,0);g.lineTo(-r*.19,-r*.05);g.lineTo(-r*.19,r*.05);g.closePath();g.fill();g.restore()}
  g.save();g.rotate(hs(2,f.s,1)*TAU);g.fillStyle='#e8eef0';g.beginPath();g.ellipse(0,0,r*.36,r*.14,0,0,TAU);g.fill();g.beginPath();g.moveTo(-r*.32,0);g.lineTo(-r*.52,-r*.16);g.lineTo(-r*.52,r*.16);g.closePath();g.fill();xc(g,r*.22,-r*.03,r*.03,'#1a1a1a');g.restore()},   // pesce grande al centro
 netf(g,f){g.save();g.beginPath();g.ellipse(0,0,f.w/2,f.h/2,0,0,TAU);g.clip();g.strokeStyle='rgba(200,190,150,.55)';g.lineWidth=1.5;g.beginPath();for(let x=-f.w/2;x<=f.w/2+f.h;x+=16){g.moveTo(x,-f.h/2);g.lineTo(x-f.h,f.h/2);g.moveTo(x-f.h,-f.h/2);g.lineTo(x,f.h/2)}g.stroke();g.restore();
  for(let i=0;i<6;i++){const a=i*TAU/6+hs(1,f.s,1);xc(g,Math.cos(a)*f.w*.45,Math.sin(a)*f.h*.45,4,i%2?'#ff8a3a':'#ffd23f')}},
 shells(g,f){g.fillStyle='rgba(200,180,130,.45)';g.beginPath();g.ellipse(0,0,f.w/2,f.h/2,0,0,TAU);g.fill();
  for(let i=0;i<9;i++){const x=(hs(i,f.s,1)-.5)*f.w*.8,y=(hs(i,f.s,2)-.5)*f.h*.8,s=3+hs(i,f.s,3)*4;g.save();g.translate(x,y);g.rotate(hs(i,f.s,4)*TAU);g.fillStyle=['#f0e0d0','#ffb0a0','#e8d0a0'][i%3];
   g.beginPath();g.moveTo(0,-s);g.lineTo(s*.9,s*.6);g.lineTo(-s*.9,s*.6);g.closePath();g.fill();g.strokeStyle='rgba(120,90,60,.5)';g.lineWidth=.8;g.beginPath();g.moveTo(0,-s);g.lineTo(0,s*.6);g.stroke();g.restore()}},
 // AMPIA FINESTRA sullo spazio: una sola lastra (niente telaio in mezzo), stelle, nebulosa, galassia lontana, un pianeta con la sua luna, riflessi del vetro
 spacewin(g,f,P){const w=f.w,h=f.h,r=Math.min(w,h)*.16,s=f.s|0,H=(i,k)=>hs(i,s,k);
  xrr(g,-w/2-12,-h/2-12,w+24,h+24,r+10,'#0a0d12');xrr(g,-w/2-8,-h/2-8,w+16,h+16,r+7,P.metal[1]);xrr(g,-w/2-5,-h/2-5,w+10,h+10,r+5,P.metal[0]);xrr(g,-w/2-2,-h/2-2,w+4,h+4,r+2,'#05070b');   // cornice dello scafo
  g.save();g.beginPath();g.roundRect(-w/2,-h/2,w,h,r);g.clip();
  const bg=g.createLinearGradient(-w/2,-h/2,w/2,h/2);bg.addColorStop(0,'#020309');bg.addColorStop(.55,'#060a1c');bg.addColorStop(1,'#0a0416');g.fillStyle=bg;g.fillRect(-w/2,-h/2,w,h);
  const NC=['#5a2a8a','#1a5a8a','#8a2a5a','#2a7a6a','#7a4a2a'];for(let i=0;i<3;i++)xGlow(g,(H(i,1)-.5)*w,(H(i,2)-.5)*h,Math.max(w,h)*(.25+H(i,3)*.3),NC[(s+i)%5],.32);   // nebulosa
  {g.save();g.translate((H(5,1)-.5)*w*.7,(H(5,2)-.5)*h*.6);g.rotate(H(5,3)*Math.PI);g.scale(1,.32);xGlow(g,0,0,Math.min(w,h)*.22,'#dcd0ff',.35);xGlow(g,0,0,Math.min(w,h)*.07,'#ffffff',.6);g.restore()}   // galassia lontana
  for(let i=0,n=Math.round(w*h/260);i<n;i++){const x=(H(i,11)-.5)*w,y=(H(i,12)-.5)*h,q=H(i,13),z=.4+q*q*1.8;xc(g,x,y,z,q<.06?'#9fc8ff':q<.12?'#ffe0a0':'#ffffff')}   // stelle
  for(let i=0;i<4;i++){const x=(H(i,21)-.5)*w*.9,y=(H(i,22)-.5)*h*.9;xGlow(g,x,y,7,'#cfe6ff',.8);g.strokeStyle='rgba(255,255,255,.55)';g.lineWidth=1;g.beginPath();g.moveTo(x-9,y);g.lineTo(x+9,y);g.moveTo(x,y-9);g.lineTo(x,y+9);g.stroke()}
  const PC=['#c97a3a','#3a7ac9','#7ac96a','#b04ac9','#c9b03a','#4ac9b8'],pc=PC[s%6],pr=Math.min(w,h)*(.32+H(7,1)*.22),sx=H(7,2)<.5?-1:1,sy=H(7,3)<.5?-1:1,px=sx*(w/2-pr*(.35+H(7,4)*.45)),py=sy*(h/2-pr*(.25+H(7,5)*.5));   // pianeta, in parte fuori dalla finestra
  xGlow(g,px,py,pr*1.25,xmix(pc,'#ffffff',.3),.35);
  const ring=H(7,6)<.55,rg=(a0,a1)=>{g.strokeStyle='rgba(230,215,180,.45)';g.lineWidth=pr*.09;g.beginPath();g.ellipse(px,py,pr*1.75,pr*.42,-.3,a0,a1);g.stroke();g.strokeStyle='rgba(255,240,210,.25)';g.lineWidth=pr*.04;g.beginPath();g.ellipse(px,py,pr*1.55,pr*.36,-.3,a0,a1);g.stroke()};
  if(ring)rg(Math.PI,TAU);   // metà posteriore dell'anello: dietro il pianeta
  {const lx=-sx,ly=-sy,gr=g.createRadialGradient(px+lx*pr*.45,py+ly*pr*.45,pr*.05,px,py,pr);gr.addColorStop(0,xmix(pc,'#ffffff',.45));gr.addColorStop(.55,pc);gr.addColorStop(1,xmix(pc,'#000000',.88));g.fillStyle=gr;g.beginPath();g.arc(px,py,pr,0,TAU);g.fill();
   g.save();g.beginPath();g.arc(px,py,pr,0,TAU);g.clip();g.strokeStyle=xmix(pc,'#000000',.35);g.globalAlpha=.35;for(let k=-4;k<=4;k++){g.lineWidth=pr*(.04+H(k+9,6)*.07);g.beginPath();g.ellipse(px,py+k*pr*.21,pr,pr*.05,.12,0,TAU);g.stroke()}g.globalAlpha=1;
   const sh=g.createLinearGradient(px+lx*pr,py+ly*pr,px-lx*pr,py-ly*pr);sh.addColorStop(0,'rgba(0,0,0,0)');sh.addColorStop(.55,'rgba(0,0,0,.15)');sh.addColorStop(1,'rgba(0,0,0,.8)');g.fillStyle=sh;g.fillRect(px-pr,py-pr,pr*2,pr*2);g.restore()}   // terminatore
  if(ring)rg(0,Math.PI);   // metà anteriore dell'anello: davanti al pianeta
  {const mr=pr*.16,mx=px-sx*pr*1.55,my=py-sy*pr*.75,gr=g.createRadialGradient(mx-sx*mr*.4,my-sy*mr*.4,1,mx,my,mr);gr.addColorStop(0,'#e8e4dc');gr.addColorStop(1,'#3a3836');g.fillStyle=gr;g.beginPath();g.arc(mx,my,mr,0,TAU);g.fill()}   // luna
  const rf=g.createLinearGradient(-w/2,-h/2,w/2,h/2);rf.addColorStop(0,'rgba(200,235,255,.16)');rf.addColorStop(.3,'rgba(200,235,255,0)');rf.addColorStop(.62,'rgba(200,235,255,0)');rf.addColorStop(.7,'rgba(200,235,255,.08)');rf.addColorStop(.78,'rgba(200,235,255,0)');g.fillStyle=rf;g.fillRect(-w/2,-h/2,w,h);   // riflessi del vetro
  g.strokeStyle='rgba(0,0,0,.55)';g.lineWidth=14;g.beginPath();g.roundRect(-w/2,-h/2,w,h,r);g.stroke();g.restore();
  g.strokeStyle='rgba(180,220,255,.35)';g.lineWidth=1.5;g.beginPath();g.roundRect(-w/2+1,-h/2+1,w-2,h-2,r);g.stroke();
  for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]])xc(g,a*(w/2+2),b*(h/2+2),2.4,P.led[0])},
 // carta stellare olografica: orbite, stelle, rotta
 starmap(g,f,P){const r=Math.min(f.w,f.h)/2,s=f.s|0;g.fillStyle='rgba(5,20,35,.55)';g.beginPath();g.arc(0,0,r,0,TAU);g.fill();g.strokeStyle='rgba(120,220,255,.5)';g.lineWidth=2;g.stroke();
  g.strokeStyle='rgba(120,220,255,.22)';g.lineWidth=1.2;for(const k of[.3,.52,.74]){g.beginPath();g.ellipse(0,0,r*k,r*k*.62,.3,0,TAU);g.stroke()}
  const S=[];for(let i=0;i<9;i++){const a=hs(i,s,1)*TAU,q=r*(.15+hs(i,s,2)*.75);S.push([Math.cos(a)*q,Math.sin(a)*q*.8])}
  g.strokeStyle='rgba(255,210,63,.55)';g.lineWidth=2;g.setLineDash([6,5]);g.beginPath();S.slice(0,5).forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1]));g.stroke();g.setLineDash([]);
  S.forEach((p,i)=>{xGlow(g,p[0],p[1],9,i<5?'#ffd27a':'#9fe8ff',.7);xc(g,p[0],p[1],2.2,'#ffffff')});xc(g,0,0,4,P.acc)},
 // portello stagno nel pavimento: corona a strisce di pericolo, lastre a raggiera, frecce
 airlock(g,f,P){const r=Math.min(f.w,f.h)/2;xc(g,0,0,r,'#14171c');g.save();g.beginPath();g.arc(0,0,r-2,0,TAU);g.arc(0,0,r*.78,0,TAU,true);g.clip();
  for(let i=0;i<24;i++){g.fillStyle=i%2?'#e0b42a':'#14161a';g.beginPath();g.moveTo(0,0);g.arc(0,0,r,i*TAU/24,(i+1)*TAU/24);g.closePath();g.fill()}g.restore();
  xc(g,0,0,r*.76,P.metal[1]);xst(g,'rgba(0,0,0,.55)',2);for(let i=0;i<6;i++){const a=i*TAU/6+.2;g.beginPath();g.moveTo(0,0);g.lineTo(Math.cos(a)*r*.76,Math.sin(a)*r*.76);g.stroke()}
  xc(g,0,0,r*.2,'#2a3038');xc(g,0,0,r*.1,P.acc);g.fillStyle='rgba(255,255,255,.25)';for(let i=0;i<4;i++){g.save();g.rotate(i*XH);g.beginPath();g.moveTo(r*.36,0);g.lineTo(r*.5,-r*.08);g.lineTo(r*.5,r*.08);g.closePath();g.fill();g.restore()}},
 // bruciatura dei propulsori: nero al centro, alone arancio, striature
 thrust(g,f,P){const r=Math.min(f.w,f.h)/2,s=f.s|0,gr=g.createRadialGradient(0,0,2,0,0,r);gr.addColorStop(0,'rgba(0,0,0,.6)');gr.addColorStop(.45,'rgba(30,18,10,.4)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.beginPath();g.arc(0,0,r,0,TAU);g.fill();
  g.strokeStyle='rgba(0,0,0,.28)';g.lineWidth=3;for(let i=0;i<14;i++){const a=hs(i,s,1)*TAU,q=r*(.35+hs(i,s,2)*.55);g.beginPath();g.moveTo(Math.cos(a)*r*.25,Math.sin(a)*r*.25);g.lineTo(Math.cos(a)*q,Math.sin(a)*q);g.stroke()}
  xGlow(g,0,0,r*.4,'#ff8a2a',.16)},
 // croce medica a terra
 medcross(g,f,P){const r=Math.min(f.w,f.h)/2;g.fillStyle='rgba(230,245,250,.22)';g.beginPath();g.arc(0,0,r,0,TAU);g.fill();g.strokeStyle='rgba(120,220,200,.55)';g.lineWidth=4;g.stroke();
  g.fillStyle='rgba(60,200,170,.5)';g.fillRect(-r*.18,-r*.62,r*.36,r*1.24);g.fillRect(-r*.62,-r*.18,r*1.24,r*.36)},
 // piastra di rinforzo dello scafo: bulloni sul bordo, traverse
 hullplate(g,f,P){const w=f.w,h=f.h;xr(g,-w/2,-h/2,w,h,'rgba(0,0,0,.22)');xr(g,-w/2+3,-h/2+3,w-6,h-6,'rgba(150,160,175,.14)');xst(g,'rgba(0,0,0,.3)',3);g.beginPath();g.moveTo(-w/2+6,-h/2+6);g.lineTo(w/2-6,h/2-6);g.moveTo(w/2-6,-h/2+6);g.lineTo(-w/2+6,h/2-6);g.stroke();
  for(let x=-w/2+8;x<=w/2-8;x+=(w-16)/4)for(const y of[-h/2+7,h/2-7])xc(g,x,y,2.2,'rgba(200,205,215,.5)');for(let y=-h/2+8+(h-16)/4;y<h/2-8;y+=(h-16)/4)for(const x of[-w/2+7,w/2-7])xc(g,x,y,2.2,'rgba(200,205,215,.5)')},
 // anello di gravità artificiale: cerchi luminosi a segmenti
 gravring(g,f,P){const r=Math.min(f.w,f.h)/2;for(const[k,al]of[[1,.5],[.8,.32],[.6,.2]]){g.strokeStyle='rgba(111,216,255,'+al+')';g.lineWidth=5;g.setLineDash([r*k*.35,r*k*.18]);g.beginPath();g.arc(0,0,r*k,0,TAU);g.stroke()}g.setLineDash([]);xGlow(g,0,0,r*.5,P.glow,.18)}};

// ===== 8) pittura dello sfondo =====
const XPC=new Map();
function xPat(g,st,c1,c2){const k=st+c1+c2;let e=XPC.get(k);if(e&&e.g===g)return e.p;const cv=e?e.cv:xTile(st,c1,c2);e={cv,g,p:g.createPattern(cv,'repeat')};XPC.set(k,e);return e.p}
function xTile(st,c1,c2){const S=128,cv=document.createElement('canvas');cv.width=cv.height=S;const g=cv.getContext('2d'),sd=st.length*31+c1.charCodeAt(2);xr(g,0,0,S,S,c1);
 const L=(x0,y0,x1,y1,c,w)=>{g.strokeStyle=c;g.lineWidth=w||1;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke()},n=(i,j)=>hs(i,j,sd);
 switch(st){
  case'tile':for(let i=0;i<4;i++)for(let j=0;j<4;j++)xr(g,i*32,j*32,32,32,(i+j)%2?c1:xmix(c1,c2,.25));for(let k=0;k<=4;k++){L(k*32,0,k*32,S,c2,1.5);L(0,k*32,S,k*32,c2,1.5)}break;
  case'tile2':for(let i=0;i<2;i++)for(let j=0;j<2;j++){xr(g,i*64+1,j*64+1,62,62,xmix(c1,c2,n(i,j)*.25));L(i*64+2,j*64+2,i*64+62,j*64+2,'rgba(255,255,255,.12)',1.5)}for(let k=0;k<=2;k++){L(k*64,0,k*64,S,c2,2);L(0,k*64,S,k*64,c2,2)}break;
  case'marble':for(let i=0;i<2;i++)for(let j=0;j<2;j++)xr(g,i*64,j*64,64,64,(i+j)%2?c1:c2);for(let k=0;k<6;k++){g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=1;g.beginPath();g.moveTo(n(k,1)*S,0);g.bezierCurveTo(n(k,2)*S,S*.3,n(k,3)*S,S*.7,n(k,4)*S,S);g.stroke()}
   for(let k=0;k<=2;k++){L(k*64,0,k*64,S,'rgba(0,0,0,.25)',1);L(0,k*64,S,k*64,'rgba(0,0,0,.25)',1)}break;
  case'carpet':for(let k=0;k<900;k++){g.fillStyle=n(k,1)<.5?'rgba(255,255,255,.05)':'rgba(0,0,0,.08)';g.fillRect(n(k,2)*S,n(k,3)*S,1.5,1.5)}for(let k=0;k<S;k+=16)L(k,0,k+S,S,'rgba(0,0,0,.06)',3);break;
  case'raised':for(let i=0;i<2;i++)for(let j=0;j<2;j++){xr(g,i*64+1,j*64+1,62,62,c1);g.fillStyle='rgba(0,0,0,.3)';if((i+j)%2)for(let a=0;a<5;a++)for(let b=0;b<5;b++)g.fillRect(i*64+10+a*11,j*64+10+b*11,3,3)}for(let k=0;k<=2;k++){L(k*64,0,k*64,S,c2,2.5);L(0,k*64,S,k*64,c2,2.5)}break;
  case'conc':for(let k=0;k<700;k++){g.fillStyle=n(k,1)<.5?'rgba(255,255,255,.06)':'rgba(0,0,0,.1)';const s=1+n(k,4)*2;g.fillRect(n(k,2)*S,n(k,3)*S,s,s)}L(0,0,S,0,c2,2);L(0,0,0,S,c2,2);break;
  case'plate':for(let i=0;i<8;i++)for(let j=0;j<8;j++){const x=i*16+(j%2)*8,y=j*16;g.save();g.translate(x+4,y+8);g.rotate((i+j)%2?.7:-.7);g.fillStyle='rgba(255,255,255,.14)';g.fillRect(-4,-1.2,8,2.4);g.restore()}L(0,0,S,0,c2,2);L(0,0,0,S,c2,2);break;
  case'grate':xr(g,0,0,S,S,c2);for(let k=0;k<S;k+=8){xr(g,k+1,0,4,S,c1)}for(let k=0;k<S;k+=32)xr(g,0,k,S,3,xmix(c1,'#000000',.2));L(0,0,S,0,'rgba(0,0,0,.5)',3);break;
  case'hex':{const r=16,h=r*Math.sqrt(3);g.strokeStyle=c2;g.lineWidth=2;for(let j=-1;j<6;j++)for(let i=-1;i<6;i++){const x=i*r*3+(j%2?r*1.5:0),y=j*h/2;g.beginPath();for(let k=0;k<6;k++){const a=k*Math.PI/3;g.lineTo(x+Math.cos(a)*r,y+Math.sin(a)*r)}g.closePath();g.stroke()}break}
  case'deck':for(let i=0;i<2;i++)for(let j=0;j<4;j++){xr(g,i*64+1,j*32+1,62,30,xmix(c1,c2,n(i,j)*.3));for(const[a,b]of[[4,4],[58,4],[4,26],[58,26]])xc(g,i*64+a,j*32+b,1.4,'rgba(0,0,0,.45)')}for(let k=0;k<=2;k++)L(k*64,0,k*64,S,c2,2);for(let k=0;k<=4;k++)L(0,k*32,S,k*32,c2,2);break;
  case'soil':for(let k=0;k<500;k++){g.fillStyle=n(k,1)<.35?c2:n(k,1)<.7?'rgba(0,0,0,.2)':'rgba(255,220,160,.08)';const s=1.5+n(k,4)*3;g.beginPath();g.arc(n(k,2)*S,n(k,3)*S,s,0,TAU);g.fill()}break;
  case'lino':for(let i=0;i<4;i++)for(let j=0;j<4;j++)xr(g,i*32+1,j*32+1,30,30,(i*3+j)%5?c1:xmix(c1,c2,.4));for(let k=0;k<=4;k++){L(k*32,0,k*32,S,c2,1);L(0,k*32,S,k*32,c2,1)}break;
  case'wet':for(let i=0;i<2;i++)for(let j=0;j<2;j++)xr(g,i*64+1,j*64+1,62,62,xmix(c1,c2,n(i,j)*.4));for(let k=0;k<5;k++){g.strokeStyle='rgba(160,230,255,.08)';g.lineWidth=6;g.beginPath();g.moveTo(n(k,1)*S,n(k,2)*S);g.lineTo(n(k,1)*S+30,n(k,2)*S+8);g.stroke()}for(let k=0;k<=2;k++){L(k*64,0,k*64,S,c2,2);L(0,k*64,S,k*64,c2,2)}break;
  case'wood':for(let j=0;j<8;j++){const o=(j%2)*64;for(let i=-1;i<2;i++){xr(g,i*128+o+1,j*16+1,126,14,xmix(c1,c2,n(i+j,j)*.5))}L(0,j*16,S,j*16,'rgba(0,0,0,.35)',1.5)}break;
  case'rivet':for(let i=0;i<2;i++)for(let j=0;j<2;j++){xr(g,i*64+1,j*64+1,62,62,xmix(c1,c2,n(i,j)*.22));L(i*64+2,j*64+2,i*64+62,j*64+2,'rgba(255,255,255,.1)',1.5);L(i*64+2,j*64+62,i*64+62,j*64+62,'rgba(0,0,0,.25)',1.5);   // piastre chiodate dello scafo
   for(let k=0;k<4;k++){const px=i*64+7+k*16.5;xc(g,px,j*64+6,1.6,'rgba(0,0,0,.45)');xc(g,px-.5,j*64+5.5,.8,'rgba(255,255,255,.3)');xc(g,px,j*64+58,1.6,'rgba(0,0,0,.45)')}
   if(n(i+2,j)<.35){g.fillStyle='rgba(140,80,40,.18)';g.beginPath();g.arc(i*64+20+n(i,j+3)*30,j*64+20+n(i+3,j)*30,6+n(i,j)*8,0,TAU);g.fill()}}   // ruggine
   for(let k=0;k<=2;k++){L(k*64,0,k*64,S,c2,2.5);L(0,k*64,S,k*64,c2,2.5)}break;
  case'wave':for(let i=0;i<4;i++)for(let j=0;j<4;j++){xr(g,i*32+1,j*32+1,30,30,(i+j)%2?c1:xmix(c1,'#ffffff',.08));g.strokeStyle='rgba(220,250,255,.28)';g.lineWidth=1.5;g.beginPath();   // ceramica con l'onda
   g.moveTo(i*32+4,j*32+18);g.quadraticCurveTo(i*32+10,j*32+10,i*32+16,j*32+18);g.quadraticCurveTo(i*32+22,j*32+26,i*32+28,j*32+18);g.stroke()}
   for(let k=0;k<=4;k++){L(k*32,0,k*32,S,c2,1.5);L(0,k*32,S,k*32,c2,1.5)}break;
  case'glass':xr(g,0,0,S,S,'rgba(0,0,0,0)');g.clearRect(0,0,S,S);for(let k=0;k<=2;k++){xr(g,k*64-3,0,6,S,c2);xr(g,0,k*64-3,S,6,c2)}break}
 return cv}
// pittura di un blocco di sfondo per gli interni: vuoto, bordo esterno (scafo/facciata), pavimenti, luci, decalcomanie, macerie
async function thPaint(g,x0,y0,S){g.setTransform(S,0,0,S,-x0*S,-y0*S);g.lineJoin='round';g.lineCap='round';DC.pat=DC.NZ.map(n=>g.createPattern(n,'repeat'));
 const x1=x0+CH,y1=y0+CH,vis=M.sp.filter(s=>xBbHit(s.g.bb,[x0,y0,x1,y1],140));
 xVoidPaint(g,x0,y0);
 // bordo esterno: lo scafo o la facciata sporge attorno a tutti gli spazi (i pavimenti lo coprono dentro)
 const P=XP[M.th];g.lineJoin='miter';
 for(const[w,c]of[[150,'#06080b'],[124,P.rim],[96,xmix(P.rim,'#ffffff',.08)]]){g.strokeStyle=c;g.lineWidth=w;for(const s of vis){xPath(g,s.g.p);g.stroke()}}
 if(M.th==2){g.strokeStyle='rgba(111,216,255,.16)';g.lineWidth=110;for(const s of vis){xPath(g,s.g.p);g.stroke()}}
 g.lineJoin='round';await tick();
 for(const s of vis)if(s.k=='c')xFloorPaint(g,s,x0,y0);for(const s of vis)if(s.k!='c')xFloorPaint(g,s,x0,y0);
 // sporco e usura (solo sui pavimenti)
 g.save();g.beginPath();for(const s of vis){const p=s.g.p;g.moveTo(p[0][0],p[0][1]);for(let i=1;i<p.length;i++)g.lineTo(p[i][0],p[i][1]);g.closePath()}g.clip();
 ovl(g,2,4,.16,'overlay',x0,y0);ovl(g,1,1.2,.08,'multiply',x0,y0);g.restore();
 await tick();
 xFlatPaint(g,x0,y0);
 if(xMG(M.th))xOuterPaint(g,x0,y0);   // megastruttura e astronave: muri esterni dipinti nello sfondo, sopra pavimenti e luci
 // soglie delle aperture: strisce di pericolo sul pavimento
 for(const pr of M.pairs.values())for(const o of pr.op){if(o.x<x0-200||o.x>x1+200||o.y<y0-200||o.y>y1+200)continue;g.save();g.translate(o.x,o.y);g.rotate(Math.atan2(o.uy,o.ux));
  g.beginPath();g.rect(-o.w/2,-30,o.w,60);g.clip();g.globalAlpha=.55;g.fillStyle='#111';g.fillRect(-o.w/2,-30,o.w,60);g.fillStyle=P.acc;for(let x=-o.w/2-60;x<o.w/2+60;x+=24){g.beginPath();g.moveTo(x,-30);g.lineTo(x+12,-30);g.lineTo(x-48,30);g.lineTo(x-60,30);g.fill()}g.restore()}
 xFoot(g,x0,y0);
 if(M.lamps)xLampPaint(g,x0,y0)}   // megastruttura: lampioni dei pilastri per ultimi, illuminano tutto lo sfondo
// LAMPIONI dei pilastri (megastruttura): stessa luce dei lampioni delle mappe normali (pLights in AGbake.js), somma additiva con alone radiale,
// nel colore a tema del corridoio; dipinti alla fine, così illuminano pavimenti, muri esterni e soglie
function xLampPaint(g,x0,y0){const R0=X_PLR;g.save();g.setLineDash([]);g.globalCompositeOperation='lighter';
 for(const l of M.lamps){if(l.x<x0-R0||l.x>x0+CH+R0||l.y<y0-R0||l.y>y0+CH+R0)continue;const c=hex(l.c).join(','),gr=g.createRadialGradient(l.x,l.y,0,l.x,l.y,R0);
  gr.addColorStop(0,'rgba('+c+','+X_PLA+')');gr.addColorStop(.45,'rgba('+c+','+(X_PLA*.42).toFixed(3)+')');gr.addColorStop(1,'rgba('+c+',0)');g.fillStyle=gr;g.fillRect(l.x-R0,l.y-R0,R0*2,R0*2)}
 g.restore()}
// impronta leggera sotto ogni oggetto distruttibile: quando viene distrutto resta un segno scuro con qualche frammento
function xFoot(g,x0,y0){for(const o of qrect(x0-120,y0-120,x0+CH+120,y0+CH+120,[])){if(o.t!='b'||o.ind||o.th=='door'||o.th=='bwall'||o.th=='partition')continue;g.save();g.translate(o.x,o.y);g.rotate(o.a);
 g.fillStyle='rgba(0,0,0,.16)';if(o.shape=='circle'){g.beginPath();g.arc(0,0,o.w/2+4,0,TAU);g.fill()}else g.fillRect(-o.w/2-4,-o.h/2-4,o.w+8,o.h+8);
 const n=Math.min(14,4+Math.round(o.r/12)),sd=o.sd|0;for(let i=0;i<n;i++){const x=(hs(i,sd,1)-.5)*o.w,y=(hs(i,sd,2)-.5)*Math.max(o.h,o.w*(o.shape=='circle'?1:0)),s2=3+hs(i,sd,3)*7;
  g.fillStyle=['#3a3e44','#5a5e64','#2a2c30','#6a5a48'][i%4];g.save();g.translate(x,y);g.rotate(hs(i,sd,4)*3);g.fillRect(-s2/2,-s2/3,s2,s2*.6);g.restore()}
 g.restore()}}
function xFloorPaint(g,s,x0,y0){const b=s.g.bb,ax=Math.max(x0-4,b[0]),ay=Math.max(y0-4,b[1]),bx=Math.min(x0+CH+4,b[2]),by=Math.min(y0+CH+4,b[3]);if(bx<=ax||by<=ay)return;
 g.save();xPath(g,s.g.p);g.clip();const[st,c1,c2]=s.fl;
 if(M.th==2&&s.rt=='serra'){g.fillStyle=LVL_COL[1];g.fillRect(ax,ay,bx-ax,by-ay);if(DC.pat){ovl(g,2,6,.2,'overlay',x0,y0);ovl(g,1,1.5,.1,'overlay',x0,y0);ovl(g,0,.7,.12,'overlay',x0,y0)}   // serra della megastruttura: prato come il terreno delle mappe normali
  if(DC.GREEN)for(let i=0;i<DC.GREEN.length;i++){const sc=DC.GREEN[i][1];g.save();g.globalCompositeOperation='multiply';g.globalAlpha=DC.GREEN[i][2];g.scale(sc,sc);g.fillStyle=g.createPattern(DC.GREEN[i][0],'repeat');g.fillRect(ax/sc,ay/sc,(bx-ax)/sc+2,(by-ay)/sc+2);g.restore()}}
 else if(st=='glass'){xOceanPaint(g,ax,ay,bx,by,1);g.fillStyle=xPat(g,st,c1,c2);g.fillRect(ax,ay,bx-ax,by-ay)}   // pavimento di vetro: sotto si vede il fondale
 else{g.fillStyle=xPat(g,st,c1,c2);g.fillRect(ax,ay,bx-ax,by-ay)}
 if(st=='carpet'&&s.k=='r'){g.strokeStyle='rgba(0,0,0,.25)';g.lineWidth=60;xPath(g,s.g.p);g.stroke();g.strokeStyle='rgba(255,220,150,.12)';g.lineWidth=4;g.save();g.translate(s.g.cx,s.g.cy);g.scale(.9,.9);g.translate(-s.g.cx,-s.g.cy);xPath(g,s.g.p);g.stroke();g.restore()}
 // ombra lungo i muri (luce dall'alto)
 g.lineJoin='miter';g.lineCap='square';g.beginPath();const pp=s.g.p,op=s.open||new Set();for(let i=0;i<pp.length;i++){if(op.has(i))continue;const a=pp[i],c=pp[(i+1)%pp.length];g.moveTo(a[0],a[1]);g.lineTo(c[0],c[1])}
 g.strokeStyle='rgba(0,0,0,.2)';g.lineWidth=110;g.stroke();g.strokeStyle='rgba(0,0,0,.18)';g.lineWidth=50;g.stroke();g.lineJoin='round';g.lineCap='round';
 g.restore()}
// luci, decalcomanie e scritte (M.flat con k che inizia per x)
function xFlatPaint(g,x0,y0){const x1=x0+CH,y1=y0+CH,P=XP[M.th]||XP[2];
 for(const f of M.flat){const R0=f.k=='xl'?f.r:f.k=='xt'?400:Math.max(f.w||0,f.h||0,f.r||0)/2+80;if(f.x+R0<x0||f.x-R0>x1||f.y+R0<y0||f.y-R0>y1)continue;
  if(f.k=='xl'){g.save();g.globalCompositeOperation='screen';xGlow(g,f.x,f.y,f.r,f.c,f.al);g.restore();continue}
  if(f.k=='xt'){g.save();g.translate(f.x,f.y);g.font='bold '+(f.sz|0)+'px monospace';g.textAlign='center';g.textBaseline='middle';g.fillStyle='rgba(255,255,255,.13)';g.fillText(f.s,0,0);g.strokeStyle='rgba(0,0,0,.18)';g.lineWidth=1.5;g.strokeText(f.s,0,0);g.restore();continue}
  if(f.k=='xsol'){xSolar(g,f);continue}
  if(f.k!='xd')continue;g.save();g.translate(f.x,f.y);g.rotate(f.a||0);
  if(XDS[f.t]){XDS[f.t](g,f,P);g.restore();continue}   // decorazioni dell'astronave (XDS)
  switch(f.t){
   // --- megastruttura: decorazioni piatte dei gruppi d'arredo (w, h in px del mondo, s = seme)
   case'ctablef':{xrr(g,-f.w/2+2,-f.h/2+3,f.w,f.h,5,'rgba(0,0,0,.28)');xrr(g,-f.w/2,-f.h/2,f.w,f.h,5,'#5a4632');xrr(g,-f.w/2+3,-f.h/2+3,f.w-6,f.h-6,4,'#8a6a48');xc(g,-f.w/5,0,3.5,'#e8e2d4');xr(g,f.w/8,-4,9,7,'#d8d2c4');break}
   case'chairmat':{g.fillStyle='rgba(200,220,235,.18)';g.beginPath();g.ellipse(0,0,f.w/2,f.h/2,0,0,TAU);g.fill();g.strokeStyle='rgba(255,255,255,.22)';g.lineWidth=1.5;g.stroke();break}
   case'papers':{for(let i=0;i<4;i++){g.save();g.rotate((hs(i,f.s,1)-.5)*1.2);g.translate((hs(i,f.s,2)-.5)*f.w*.5,(hs(i,f.s,3)-.5)*f.h*.5);xr(g,-6,-8,12,16,'rgba(235,235,228,.8)');g.fillStyle='rgba(60,70,90,.45)';for(let y=-5;y<6;y+=3)g.fillRect(-4,y,8,1);g.restore()}break}
   case'cables':{const C=['#2a2a2a','#3a5a8a','#8a3a3a','#c8a83a'];g.lineWidth=2.5;for(let i=0;i<3;i++){g.strokeStyle=C[(i+f.s)%4];g.beginPath();g.moveTo(-f.w/2,(i-1)*4);for(let x=-f.w/2;x<=f.w/2;x+=f.w/6)g.lineTo(x,(i-1)*4+Math.sin(x*.08+i+f.s)*f.h*.25);g.stroke()}break}
   case'carpettiles':{g.globalAlpha*=.6;const t=40,C=[xmix(P.cloth[f.s%4],'#000000',.25),xmix(P.cloth[f.s%4],'#000000',.38)];for(let x=-f.w/2;x<f.w/2;x+=t)for(let y=-f.h/2;y<f.h/2;y+=t){g.fillStyle=C[((x+y)/t|0)&1];g.fillRect(x,y,Math.min(t,f.w/2-x),Math.min(t,f.h/2-y))}break}
   case'tray':{xrr(g,-f.w/2,-f.h/2,f.w,f.h,3,'#c8ced6');xc(g,-f.w/5,0,f.h*.3,'#e8e2d4');xc(g,-f.w/5,0,f.h*.18,['#c8783a','#6a9a3a','#a84a3a'][f.s%3]);xr(g,f.w/10,-f.h/4,f.w/4,f.h/2,'#d8d2c4');break}
   case'placemat':{xrr(g,-f.w/2,-f.h/2,f.w,f.h,3,['rgba(180,60,60,.55)','rgba(60,110,170,.55)','rgba(70,140,80,.55)'][f.s%3]);g.strokeStyle='rgba(255,255,255,.35)';g.lineWidth=1;g.strokeRect(-f.w/2+3,-f.h/2+3,f.w-6,f.h-6);break}
   case'queue':{g.strokeStyle='rgba(255,210,63,.55)';g.lineWidth=4;g.setLineDash([14,10]);g.beginPath();g.moveTo(-f.w/2,-f.h/2);g.lineTo(f.w/2,-f.h/2);g.moveTo(-f.w/2,f.h/2);g.lineTo(f.w/2,f.h/2);g.stroke();g.setLineDash([]);
    g.fillStyle='rgba(255,210,63,.5)';for(let x=-f.w/2+20;x<f.w/2;x+=40){g.beginPath();g.moveTo(x,-6);g.lineTo(x+12,0);g.lineTo(x,6);g.fill()}break}
   case'mat':{xrr(g,-f.w/2,-f.h/2,f.w,f.h,4,'rgba(20,24,30,.55)');g.fillStyle='rgba(255,255,255,.08)';for(let x=-f.w/2+5;x<f.w/2-4;x+=6)g.fillRect(x,-f.h/2+4,2,f.h-8);break}
   case'tilehole':{xr(g,-f.w/2,-f.h/2,f.w,f.h,'#05070a');g.strokeStyle='#6a7280';g.lineWidth=2;g.strokeRect(-f.w/2,-f.h/2,f.w,f.h);g.strokeStyle='#3a5a8a';g.lineWidth=2;g.beginPath();g.moveTo(-f.w/2+4,f.h/4);g.quadraticCurveTo(0,-f.h/3,f.w/2-4,f.h/5);g.stroke();break}
   case'coldaisle':{g.fillStyle='rgba(90,180,255,.13)';g.fillRect(-f.w/2,-f.h/2,f.w,f.h);g.strokeStyle='rgba(120,200,255,.45)';g.lineWidth=3;g.setLineDash([20,12]);g.strokeRect(-f.w/2+3,-f.h/2+3,f.w-6,f.h-6);g.setLineDash([]);
    g.fillStyle='rgba(160,220,255,.35)';for(let y=-f.h/2+24;y<f.h/2-10;y+=40){g.beginPath();g.moveTo(-6,y);g.lineTo(0,y+8);g.lineTo(6,y);g.fill()}break}
   case'hazmark':{g.save();g.beginPath();g.rect(-f.w/2,-f.h/2,f.w,f.h);g.clip();xr(g,-f.w/2,-f.h/2,f.w,f.h,'rgba(20,20,20,.55)');g.fillStyle='rgba(255,200,40,.6)';for(let x=-f.w/2-f.h;x<f.w/2+f.h;x+=f.h*1.2){g.beginPath();g.moveTo(x,-f.h/2);g.lineTo(x+f.h*.6,-f.h/2);g.lineTo(x+f.h*.6-f.h,f.h/2);g.lineTo(x-f.h,f.h/2);g.fill()}g.restore();break}
   case'palletf':{g.fillStyle='rgba(120,88,52,.75)';for(let i=0;i<5;i++)g.fillRect(-f.w/2,-f.h/2+i*f.h/5+1,f.w,f.h/5-3);g.fillStyle='rgba(80,58,34,.8)';for(const x of[-f.w/2,-4,f.w/2-8])g.fillRect(x,-f.h/2,8,f.h);break}
   case'forklane':{g.strokeStyle='rgba(255,210,63,.45)';g.lineWidth=4;g.beginPath();g.moveTo(-f.w/2,-f.h/2);g.lineTo(-f.w/2,f.h/2);g.moveTo(f.w/2,-f.h/2);g.lineTo(f.w/2,f.h/2);g.stroke();g.fillStyle='rgba(255,210,63,.3)';for(let y=-f.h/2+20;y<f.h/2;y+=60)g.fillRect(-f.w/2+6,y,f.w-12,4);break}
   case'spill':{g.fillStyle=['rgba(90,220,120,.3)','rgba(200,90,220,.28)','rgba(90,200,230,.3)'][f.s%3];g.beginPath();for(let i=0;i<10;i++){const a=i*TAU/10,r=Math.min(f.w,f.h)*(.25+hs(i,f.s,1)*.25);g.lineTo(Math.cos(a)*r,Math.sin(a)*r)}g.closePath();g.fill();break}
   case'biohaz':{const r=Math.min(f.w,f.h)/2;g.globalAlpha=.4;xc(g,0,0,r,'#ffd23f');xc(g,0,0,r-5,'#1a1a1a');g.fillStyle='#ffd23f';for(let i=0;i<3;i++){const a=i*TAU/3-XH;g.beginPath();g.arc(Math.cos(a)*r*.38,Math.sin(a)*r*.38,r*.34,0,TAU);g.fill()}xc(g,0,0,r*.2,'#1a1a1a');break}
   case'pipe':{for(let i=0;i<2;i++){const o=(i-.5)*f.h*.5;g.strokeStyle='rgba(0,0,0,.4)';g.lineWidth=f.h*.42;g.beginPath();g.moveTo(-f.w/2,o+3);g.lineTo(f.w/2,o+3);g.stroke();g.strokeStyle=['#7a5a3a','#5a6a7a'][i];g.lineWidth=f.h*.36;g.beginPath();g.moveTo(-f.w/2,o);g.lineTo(f.w/2,o);g.stroke();
     g.strokeStyle='rgba(255,255,255,.18)';g.lineWidth=2;g.beginPath();g.moveTo(-f.w/2,o-f.h*.1);g.lineTo(f.w/2,o-f.h*.1);g.stroke();for(let x=-f.w/2+30;x<f.w/2;x+=60)xr(g,x,o-f.h*.22,6,f.h*.44,'#3a3f46')}break}
   case'oil':{g.fillStyle='rgba(10,10,14,.5)';g.beginPath();for(let i=0;i<11;i++){const a=i*TAU/11,r=Math.min(f.w,f.h)*(.22+hs(i,f.s,1)*.28);g.lineTo(Math.cos(a)*r,Math.sin(a)*r)}g.closePath();g.fill();g.strokeStyle='rgba(120,90,200,.25)';g.lineWidth=2;g.stroke();break}
   case'path':{for(let i=0;i<Math.round(f.w/26);i++){const x=-f.w/2+13+i*26+(hs(i,f.s,1)-.5)*8,y=(hs(i,f.s,2)-.5)*f.h*.4,r=8+hs(i,f.s,3)*5;xc(g,x+1.5,y+2,r,'rgba(0,0,0,.25)');xc(g,x,y,r,'#a89a80');xc(g,x-2,y-2,r*.4,'rgba(255,255,255,.18)')}break}
   case'leaves':{for(let i=0;i<14;i++){const a=hs(i,f.s,1)*TAU,q=Math.sqrt(hs(i,f.s,2))*Math.min(f.w,f.h)/2,x=Math.cos(a)*q,y=Math.sin(a)*q;g.save();g.translate(x,y);g.rotate(hs(i,f.s,3)*TAU);g.fillStyle=['#5a7a2a','#8a7a2a','#a85a2a','#4a6a3a'][i%4];g.beginPath();g.ellipse(0,0,5,2.5,0,0,TAU);g.fill();g.restore()}break}
   case'soil':{xrr(g,-f.w/2,-f.h/2,f.w,f.h,8,'rgba(70,48,28,.75)');g.strokeStyle='rgba(40,26,14,.6)';g.lineWidth=2;for(let y=-f.h/2+8;y<f.h/2-4;y+=10){g.beginPath();g.moveTo(-f.w/2+6,y);g.lineTo(f.w/2-6,y);g.stroke()}for(let i=0;i<8;i++)xc(g,(hs(i,f.s,1)-.5)*f.w*.85,(hs(i,f.s,2)-.5)*f.h*.8,3,'#5a8a2a');break}
   case'holoring':{const r=Math.min(f.w,f.h)/2;for(const[k,al]of[[1,.4],[.82,.25],[.64,.15]]){g.strokeStyle='rgba(120,230,255,'+al+')';g.lineWidth=4;g.beginPath();g.arc(0,0,r*k,0,TAU);g.stroke()}g.fillStyle='rgba(120,230,255,.08)';g.beginPath();g.arc(0,0,r,0,TAU);g.fill();
    g.fillStyle='rgba(160,240,255,.4)';for(let i=0;i<12;i++){const a=i*TAU/12;g.fillRect(Math.cos(a)*r*.9-3,Math.sin(a)*r*.9-3,6,6)}break}
   case'stopline':{xr(g,-f.w/2,-f.h/2,f.w,f.h,'rgba(220,40,40,.55)');g.fillStyle='rgba(255,255,255,.55)';g.font='bold '+(f.h*.8|0)+'px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('STOP',0,1);break}
   case'boxesf':{for(let i=0;i<3;i++){g.save();g.translate((i-1)*f.w*.3,(hs(i,f.s,1)-.5)*f.h*.3);g.rotate((hs(i,f.s,2)-.5)*.6);xr(g,-9,-7,18,14,'rgba(170,130,80,.75)');xr(g,-9,-1,18,2,'rgba(220,200,150,.6)');g.restore()}break}
   case'tilesf':{g.fillStyle='rgba(255,255,255,.12)';g.fillRect(-f.w/2,-f.h/2,f.w,f.h);g.strokeStyle='rgba(60,90,110,.3)';g.lineWidth=1.5;g.beginPath();for(let x=-f.w/2;x<=f.w/2;x+=18){g.moveTo(x,-f.h/2);g.lineTo(x,f.h/2)}for(let y=-f.h/2;y<=f.h/2;y+=18){g.moveTo(-f.w/2,y);g.lineTo(f.w/2,y)}g.stroke();break}
   case'wetsign':{const r=Math.min(f.w,f.h)/2;g.fillStyle='#e0b42a';g.beginPath();g.moveTo(0,-r);g.lineTo(r*.9,r*.7);g.lineTo(-r*.9,r*.7);g.closePath();g.fill();g.fillStyle='#1a1a1a';g.fillRect(-1.5,-r*.4,3,r*.6);g.fillRect(-1.5,r*.32,3,3);break}
   case'radiation':{const r=Math.min(f.w,f.h)/2;g.globalAlpha=.42;xc(g,0,0,r,'#ffd23f');g.fillStyle='#1a1a1a';for(let i=0;i<3;i++){const a=i*TAU/3-XH;g.beginPath();g.moveTo(0,0);g.arc(0,0,r*.8,a-.5,a+.5);g.closePath();g.fill()}xc(g,0,0,r*.2,'#ffd23f');xc(g,0,0,r*.13,'#1a1a1a');break}
   case'mapfloor':{xrr(g,-f.w/2,-f.h/2,f.w,f.h,6,'rgba(10,30,50,.6)');g.strokeStyle='rgba(90,200,255,.45)';g.lineWidth=1.5;g.beginPath();for(let x=-f.w/2+20;x<f.w/2;x+=20){g.moveTo(x,-f.h/2);g.lineTo(x,f.h/2)}for(let y=-f.h/2+20;y<f.h/2;y+=20){g.moveTo(-f.w/2,y);g.lineTo(f.w/2,y)}g.stroke();
    g.strokeStyle='rgba(120,240,160,.6)';g.lineWidth=3;g.beginPath();for(let i=0;i<7;i++){const x=-f.w/2+10+i*(f.w-20)/6,y=(hs(i,f.s,1)-.5)*f.h*.7;i?g.lineTo(x,y):g.moveTo(x,y)}g.stroke();xc(g,f.w*.2,-f.h*.1,5,'rgba(255,90,90,.8)');break}
   case'tires':{g.strokeStyle='rgba(10,10,10,.28)';g.lineWidth=10;for(const o of[-f.h/4,f.h/4]){g.beginPath();g.moveTo(-f.w/2,o);g.quadraticCurveTo(0,o+(hs(1,f.s,1)-.5)*f.h,f.w/2,o);g.stroke()}break}
   case'pad':{const r=f.w/2;g.strokeStyle='rgba(255,210,63,.55)';g.lineWidth=10;g.beginPath();g.arc(0,0,r,0,TAU);g.stroke();g.setLineDash([30,20]);g.lineWidth=4;g.beginPath();g.arc(0,0,r*.8,0,TAU);g.stroke();g.setLineDash([]);
    g.fillStyle='rgba(255,255,255,.28)';g.font='bold '+(r*.7|0)+'px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('H',0,0);break}
   case'lane':{g.strokeStyle='rgba(255,210,63,.22)';g.lineWidth=4;g.setLineDash([40,30]);g.beginPath();if(f.v){g.moveTo(0,-f.h/2+40);g.lineTo(0,f.h/2-40)}else{g.moveTo(-f.w/2+40,0);g.lineTo(f.w/2-40,0)}g.stroke();g.setLineDash([]);
    g.strokeStyle=xmix(P.glow,'#000000',.2);g.globalAlpha=.25;g.lineWidth=3;const o=(f.v?f.w:f.h)/2-30;g.beginPath();if(f.v){g.moveTo(-o,-f.h/2);g.lineTo(-o,f.h/2);g.moveTo(o,-f.h/2);g.lineTo(o,f.h/2)}else{g.moveTo(-f.w/2,-o);g.lineTo(f.w/2,-o);g.moveTo(-f.w/2,o);g.lineTo(f.w/2,o)}g.stroke();break}
   case'pipes':{const n=3,hor=f.w>=f.h;for(let i=0;i<n;i++){const o=(i-1)*18,c=['#7a5a3a','#5a6a7a','#3a6a5a'][i];g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=12;g.beginPath();if(hor){g.moveTo(-f.w/2+60,o+f.h*.3);g.lineTo(f.w/2-60,o+f.h*.3)}else{g.moveTo(o+f.w*.3,-f.h/2+60);g.lineTo(o+f.w*.3,f.h/2-60)}g.stroke();g.strokeStyle=c;g.lineWidth=8;g.stroke()}break}
   case'deck':{const w=f.w,h=f.h;g.fillStyle='rgba(255,255,255,.08)';g.fillRect(-w/2,-h/2,w,h);g.strokeStyle='rgba(0,0,0,.2)';g.lineWidth=2;g.beginPath();
    for(let x=-w/2+60;x<w/2;x+=60){g.moveTo(x,-h/2);g.lineTo(x,h/2)}for(let y=-h/2+60;y<h/2;y+=60){g.moveTo(-w/2,y);g.lineTo(w/2,y)}g.stroke();
    const gr=g.createLinearGradient(0,h/2,0,h/2+50);gr.addColorStop(0,'rgba(0,0,0,.5)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(-w/2,h/2,w,50);   // ombra sul piano di sotto
    g.fillStyle='rgba(255,255,255,.25)';g.fillRect(-w/2,h/2-6,w,6);g.setLineDash([16,12]);g.strokeStyle='rgba(255,210,63,.5)';g.lineWidth=5;g.beginPath();g.moveTo(-w/2,h/2-14);g.lineTo(w/2,h/2-14);g.stroke();g.setLineDash([]);break}
   case'pit':{const w=f.w,h=f.h;g.fillStyle='rgba(0,0,0,.32)';g.fillRect(-w/2,-h/2,w,h);for(const[d,al]of[[0,.4],[14,.2],[28,.09]]){g.strokeStyle='rgba(0,0,0,'+al+')';g.lineWidth=14;g.strokeRect(-w/2+d+7,-h/2+d+7,w-2*d-14,h-2*d-14)}
    g.strokeStyle='rgba(0,0,0,.18)';g.lineWidth=2;g.beginPath();for(let x=-w/2+50;x<w/2;x+=50){g.moveTo(x,-h/2);g.lineTo(x,h/2)}g.stroke();break}
   case'dais':{const r=f.w/2,gr=g.createRadialGradient(0,0,r,0,0,r+44);gr.addColorStop(0,'rgba(0,0,0,.45)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.beginPath();g.arc(0,0,r+44,0,TAU);g.fill();
    g.fillStyle='rgba(255,255,255,.1)';g.beginPath();g.arc(0,0,r,0,TAU);g.fill();g.strokeStyle='rgba(255,255,255,.28)';g.lineWidth=6;g.stroke();g.strokeStyle='rgba(0,0,0,.2)';g.lineWidth=2;for(let k=1;k<4;k++){g.beginPath();g.arc(0,0,r*k/4,0,TAU);g.stroke()}break}
   case'stairs':{const w=f.w,h=f.h,n=Math.max(4,Math.round(h/13));for(let i=0;i<n;i++){const y=-h/2+i*h/n,t=i/n;g.fillStyle=i%2?'rgba(0,0,0,'+(.1+.3*t)+')':'rgba(255,255,255,'+(.2*(1-t))+')';g.fillRect(-w/2,y,w,h/n+.5)}
    g.strokeStyle='rgba(0,0,0,.45)';g.lineWidth=1.5;g.beginPath();for(let i=1;i<n;i++){const y=-h/2+i*h/n;g.moveTo(-w/2,y);g.lineTo(w/2,y)}g.stroke();xr(g,-w/2-5,-h/2,5,h,'#59616c');xr(g,w/2,-h/2,5,h,'#59616c');break}
   case'pond':{const l=M.lakes.find(q=>Math.abs(q.x-f.x)<2&&Math.abs(q.y-f.y)<2);g.rotate(-(f.a||0));g.translate(-f.x,-f.y);if(l){g.beginPath();bpath(g,l,1.22);g.fillStyle='rgba(60,90,40,.55)';g.fill();
    g.beginPath();bpath(g,l,1.1);g.fillStyle='#8a7c58';g.fill();g.beginPath();bpath(g,l,1);const gr=g.createRadialGradient(l.x,l.y,l.r*.1,l.x,l.y,l.r);gr.addColorStop(0,'#1f5a6e');gr.addColorStop(1,'#2f7a7a');g.fillStyle=gr;g.fill();
    g.strokeStyle='rgba(200,240,255,.3)';g.lineWidth=2;for(let i=0;i<4;i++){g.beginPath();g.arc(l.x+(hs(i,f.s,1)-.5)*l.r,l.y+(hs(i,f.s,2)-.5)*l.r,6+hs(i,f.s,3)*14,0,TAU);g.stroke()}
    for(let i=0;i<5;i++){const a=hs(i,f.s,4)*TAU,q=l.r*(.5+hs(i,f.s,5)*.35),x=l.x+Math.cos(a)*q,y=l.y+Math.sin(a)*q;xc(g,x,y,8,'#3e7a32');g.fillStyle='#2a5a22';g.beginPath();g.moveTo(x,y);g.arc(x,y,8,a,a+.6);g.fill();if(i%2)xc(g,x+3,y-2,2.5,'#f0b0d0')}}break}
   case'flowers':{const w=f.w,h=f.h;g.fillStyle='rgba(50,80,30,.6)';g.beginPath();g.ellipse(0,0,w/2,h/2,0,0,TAU);g.fill();const C=['#e04a6a','#f0d040','#f0f0f0','#b060e0','#ff8a3a'];
    for(let i=0;i<Math.round(w*h/180);i++){const a=hs(i,f.s,1)*TAU,q=Math.sqrt(hs(i,f.s,2)),x=Math.cos(a)*q*w/2*.9,y=Math.sin(a)*q*h/2*.9;xc(g,x,y,2+hs(i,f.s,3)*2,C[(i+f.s)%5])}break}
   case'rug':{const c=P.cloth[f.s%4];xrr(g,-f.w/2,-f.h/2,f.w,f.h,6,xmix(c,'#000000',.2));g.strokeStyle=xmix(c,'#ffffff',.35);g.lineWidth=3;g.strokeRect(-f.w/2+8,-f.h/2+8,f.w-16,f.h-16);g.strokeStyle='rgba(255,230,170,.25)';g.lineWidth=2;g.beginPath();g.moveTo(-f.w/2+16,0);g.lineTo(0,-f.h/2+16);g.lineTo(f.w/2-16,0);g.lineTo(0,f.h/2-16);g.closePath();g.stroke();break}
   case'logo':{const r=Math.min(f.w,f.h)*.5;g.globalAlpha=.3;g.strokeStyle=P.glow;g.lineWidth=5;g.beginPath();g.arc(0,0,r,0,TAU);g.stroke();g.beginPath();for(let i=0;i<3;i++){const a=i*TAU/3-Math.PI/2;g.moveTo(0,0);g.lineTo(Math.cos(a)*r,Math.sin(a)*r)}g.stroke();xc(g,0,0,r*.22,P.acc);break}
   case'mosaic':{const r=Math.min(f.w,f.h)*.55;for(let k=0;k<4;k++){g.fillStyle=['#a86a3a','#3a6a8a','#d2cdc2','#7a3a4a'][(k+f.s)%4];g.beginPath();g.arc(0,0,r*(1-k*.22),0,TAU);g.fill()}g.strokeStyle='rgba(0,0,0,.3)';g.lineWidth=1;for(let i=0;i<16;i++){const a=i*TAU/16;g.beginPath();g.moveTo(0,0);g.lineTo(Math.cos(a)*r,Math.sin(a)*r);g.stroke()}break}
   case'skylight':{g.beginPath();g.rect(-f.w/2,-f.h/2,f.w,f.h);g.save();g.clip();xr(g,-f.w/2,-f.h/2,f.w,f.h,'#05070d');for(let i=0;i<30;i++)xc(g,(hs(i,f.s,1)-.5)*f.w,(hs(i,f.s,2)-.5)*f.h,1+hs(i,f.s,3)*1.6,['#ffb347','#7fd8ff','#ffd27a','#ffffff'][i%4]);g.restore();
    g.strokeStyle='#8a929c';g.lineWidth=6;g.strokeRect(-f.w/2,-f.h/2,f.w,f.h);g.lineWidth=2;g.beginPath();g.moveTo(0,-f.h/2);g.lineTo(0,f.h/2);g.moveTo(-f.w/2,0);g.lineTo(f.w/2,0);g.stroke();g.fillStyle='rgba(180,230,255,.12)';g.fillRect(-f.w/2,-f.h/2,f.w*.4,f.h);break}
   case'glassfloor':{g.beginPath();g.rect(-f.w/2,-f.h/2,f.w,f.h);g.save();g.clip();g.rotate(-(f.a||0));g.translate(-f.x,-f.y);xOceanPaint(g,f.x-f.w,f.y-f.w,f.x+f.w,f.y+f.w,1);g.restore();
    g.strokeStyle='#5a7a80';g.lineWidth=6;g.strokeRect(-f.w/2,-f.h/2,f.w,f.h);g.lineWidth=2;g.beginPath();g.moveTo(0,-f.h/2);g.lineTo(0,f.h/2);g.stroke();g.fillStyle='rgba(180,240,255,.1)';g.fillRect(-f.w/2,-f.h/2,f.w*.35,f.h);break}
   case'stain':{g.fillStyle=f.s%3?'rgba(20,18,14,.22)':'rgba(60,40,20,.2)';g.beginPath();for(let i=0;i<9;i++){const a=i*TAU/9,r=Math.min(f.w,f.h)*(.25+hs(i,f.s,1)*.25);g.lineTo(Math.cos(a)*r,Math.sin(a)*r)}g.closePath();g.fill();break}
   case'puddle':{g.fillStyle='rgba(90,170,200,.22)';g.beginPath();for(let i=0;i<10;i++){const a=i*TAU/10,r=Math.min(f.w,f.h)*(.25+hs(i,f.s,1)*.25);g.lineTo(Math.cos(a)*r,Math.sin(a)*r)}g.closePath();g.fill();g.strokeStyle='rgba(200,240,255,.3)';g.lineWidth=2;g.beginPath();g.arc(-5,-5,Math.min(f.w,f.h)*.15,3.4,4.6);g.stroke();break}
   case'rust':{for(let i=0;i<7;i++)xc(g,(hs(i,f.s,1)-.5)*f.w,(hs(i,f.s,2)-.5)*f.h,6+hs(i,f.s,3)*18,'rgba(140,70,30,.22)');break}
   case'scorch':{const gr=g.createRadialGradient(0,0,4,0,0,Math.min(f.w,f.h)*.5);gr.addColorStop(0,'rgba(0,0,0,.45)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.beginPath();g.arc(0,0,Math.min(f.w,f.h)*.5,0,TAU);g.fill();break}
   case'vent':{const w=Math.min(f.w,70),h=Math.min(f.h,50);xr(g,-w/2,-h/2,w,h,'#2a2e34');g.fillStyle='#0d0f12';for(let y=-h/2+5;y<h/2-4;y+=7)g.fillRect(-w/2+5,y,w-10,3);g.strokeStyle='#5a626e';g.lineWidth=2;g.strokeRect(-w/2,-h/2,w,h);break}
   case'drain':{xc(g,0,0,24,'#3a4248');xc(g,0,0,20,'#101418');g.strokeStyle='#5a666e';g.lineWidth=2;for(let i=-2;i<=2;i++){g.beginPath();g.moveTo(i*7,-18);g.lineTo(i*7,18);g.stroke()}break}
   case'hatch':{xc(g,0,0,30,'#2e343c');xc(g,0,0,25,'#454d58');g.strokeStyle='#1a1e24';g.lineWidth=2;g.beginPath();g.arc(0,0,18,0,TAU);g.stroke();xr(g,-12,-3,24,6,P.acc);for(let i=0;i<8;i++){const a=i*TAU/8;xc(g,Math.cos(a)*27,Math.sin(a)*27,1.6,'#8a929c')}break}
   case'cable':{g.strokeStyle='rgba(10,10,12,.7)';g.lineWidth=5;for(let k=0;k<2;k++){g.beginPath();g.moveTo(-f.w/2,k*8);g.bezierCurveTo(-f.w*.15,-30+k*8+hs(k,f.s,1)*60,f.w*.15,30+k*8-hs(k,f.s,2)*60,f.w/2,k*8);g.stroke()}g.strokeStyle=['#c0392b','#2e86c1'][f.s%2];g.lineWidth=2;g.stroke();break}
   case'arrows':{g.fillStyle='rgba(255,255,255,.18)';for(let i=-1;i<=1;i++){g.beginPath();g.moveTo(i*30+12,0);g.lineTo(i*30-6,-12);g.lineTo(i*30-6,12);g.closePath();g.fill()}break}
   case'numbers':{g.font='bold 54px monospace';g.textAlign='center';g.textBaseline='middle';g.fillStyle='rgba(255,138,30,.22)';g.fillText(String.fromCharCode(65+f.s%6)+(f.s%90+10),0,0);break}
   case'grid':{g.strokeStyle='rgba(255,210,63,.2)';g.lineWidth=3;g.strokeRect(-f.w/2,-f.h/2,f.w,f.h);g.setLineDash([12,10]);g.beginPath();g.moveTo(-f.w/2,0);g.lineTo(f.w/2,0);g.moveTo(0,-f.h/2);g.lineTo(0,f.h/2);g.stroke();g.setLineDash([]);break}
   case'conduit':{g.strokeStyle='#1a1e24';g.lineWidth=12;g.beginPath();g.moveTo(-f.w*.8,0);g.lineTo(f.w*.8,0);g.stroke();g.strokeStyle=P.glow;g.globalAlpha=.6;g.lineWidth=3;g.stroke();g.globalAlpha=1;xc(g,-f.w*.8,0,8,'#3a424e');xc(g,f.w*.8,0,8,'#3a424e');break}
   case'haz':{g.strokeStyle='rgba(255,210,63,.5)';g.lineWidth=16;g.setLineDash([24,24]);g.beginPath();g.arc(0,0,f.w/2,0,TAU);g.stroke();g.setLineDash([]);break}
   case'pool':{const l=M.lakes.find(q=>Math.abs(q.x-f.x)<2&&Math.abs(q.y-f.y)<2);g.rotate(-(f.a||0));g.translate(-f.x,-f.y);if(l){g.beginPath();bpath(g,l,1.12);g.fillStyle='#8a9aa0';g.fill();g.beginPath();bpath(g,l,1);
     const gr=g.createRadialGradient(l.x,l.y,l.r*.1,l.x,l.y,l.r);gr.addColorStop(0,'#0a5a74');gr.addColorStop(1,'#04212c');g.fillStyle=gr;g.fill();g.strokeStyle='rgba(160,240,255,.35)';g.lineWidth=3;g.stroke()}break}}
  g.restore()}}
// pannelli solari della base lunare (file di pannelli blu con struttura argentata)
function xSolar(g,f){g.save();g.translate(f.x,f.y);g.rotate(f.a||0);const n=Math.max(2,Math.floor(f.h/46));g.fillStyle='rgba(0,0,0,.35)';g.fillRect(-f.w/2+4,-f.h/2+5,f.w,f.h);
 for(let i=0;i<n;i++){const y=-f.h/2+i*f.h/n+3,h=f.h/n-8;g.fillStyle='#9aa2ac';g.fillRect(-f.w/2,y-2,f.w,h+4);g.fillStyle='#1a3a6a';g.fillRect(-f.w/2+2,y,f.w-4,h);g.strokeStyle='rgba(150,200,255,.35)';g.lineWidth=1;g.beginPath();for(let x=-f.w/2+16;x<f.w/2;x+=16){g.moveTo(x,y);g.lineTo(x,y+h)}g.moveTo(-f.w/2+2,y+h/2);g.lineTo(f.w/2-2,y+h/2);g.stroke()}g.restore()}
// il vuoto: abisso con le luci della città lontanissime (megastruttura), spazio stellato (astronave), fondale marino (base sottomarina)
function xVoidPaint(g,x0,y0){const x1=x0+CH,y1=y0+CH,th=M.th;
 if(th==4){xOceanPaint(g,x0,y0,x1,y1,0);return}
 if(th==3){xr(g,x0,y0,CH,CH,'#03040b');
  for(const d of M.vdec){if(d.k!='neb'||d.x+d.r<x0||d.x-d.r>x1||d.y+d.r<y0||d.y-d.r>y1)continue;xGlow(g,d.x,d.y,d.r,d.c,d.a)}
  for(let cy=Math.floor(y0/48);cy<y1/48;cy++)for(let cx=Math.floor(x0/48);cx<x1/48;cx++){const h=hs(cx,cy,M.seed+3);if(h>.42)continue;const x=(cx+hs(cx,cy,M.seed+4))*48,y=(cy+hs(cx,cy,M.seed+5))*48,s=.5+h*h*9,
   c=h<.05?'#9fc8ff':h<.1?'#ffe0a0':'#ffffff';xc(g,x,y,s,c);if(h<.03){g.strokeStyle='rgba(255,255,255,.5)';g.lineWidth=1;g.beginPath();g.moveTo(x-8,y);g.lineTo(x+8,y);g.moveTo(x,y-8);g.lineTo(x,y+8);g.stroke()}}
  for(const d of M.vdec){if(d.k!='planet'||d.x+d.r*2<x0||d.x-d.r*2>x1||d.y+d.r*2<y0||d.y-d.r*2>y1)continue;xGlow(g,d.x,d.y,d.r*1.3,d.c,.25);
   const gr=g.createRadialGradient(d.x-d.r*.4,d.y-d.r*.4,d.r*.1,d.x,d.y,d.r);gr.addColorStop(0,xmix(d.c,'#ffffff',.4));gr.addColorStop(.6,d.c);gr.addColorStop(1,xmix(d.c,'#000000',.85));g.fillStyle=gr;g.beginPath();g.arc(d.x,d.y,d.r,0,TAU);g.fill();
   g.save();g.beginPath();g.arc(d.x,d.y,d.r,0,TAU);g.clip();g.strokeStyle='rgba(0,0,0,.12)';g.lineWidth=d.r*.08;for(let k=-3;k<=3;k++){g.beginPath();g.ellipse(d.x,d.y+k*d.r*.25,d.r,d.r*.06,0,0,TAU);g.stroke()}g.restore();
   if(d.ring){g.strokeStyle='rgba(230,210,170,.45)';g.lineWidth=d.r*.1;g.beginPath();g.ellipse(d.x,d.y,d.r*1.7,d.r*.45,-.35,0,TAU);g.stroke()}}
  for(const p of M.plumes||[]){if(p.x<x0-900||p.x>x1+900||p.y<y0-900||p.y>y1+900)continue;g.save();g.translate(p.x,p.y);g.rotate(p.a);const gr=g.createLinearGradient(0,0,700,0);gr.addColorStop(0,'rgba(140,230,255,.75)');gr.addColorStop(.25,'rgba(80,160,255,.35)');gr.addColorStop(1,'rgba(40,80,255,0)');
   g.fillStyle=gr;g.beginPath();g.moveTo(0,-p.w/2);g.lineTo(700,-p.w*.15);g.lineTo(700,p.w*.15);g.lineTo(0,p.w/2);g.closePath();g.fill();xGlow(g,0,0,p.w*.9,'#bff4ff',.6);g.restore()}
  return}
 // megastruttura: sfondo scelto dal seed (metropoli, grotte/cave, pianeta selvaggio, deserto)
 xMegaVoid(g,x0,y0)}
function xMegaVoid(g,x0,y0){const x1=x0+CH,y1=y0+CH,sd=M.seed+50,bg=M.vbg||'city';g.save();
 if(bg=='city'){
  xr(g,x0,y0,CH,CH,'#060913');ovl(g,2,5,.22,'overlay',x0,y0);
  for(const d of M.vdec||[])if(d.k=='cglow'&&d.x+d.r>x0&&d.x-d.r<x1&&d.y+d.r>y0&&d.y-d.r<y1)xGlow(g,d.x,d.y,d.r,d.c,d.a);
  const S=240,cx0=Math.floor((x0-40)/S),cx1=Math.ceil((x1+40)/S),cy0=Math.floor((y0-40)/S),cy1=Math.ceil((y1+40)/S);
  for(let cx=cx0;cx<=cx1;cx++){const x=cx*S,av=cx%3===0,rw=av?38:20;xr(g,x-rw/2,y0,rw,CH,'#0c121e');
   if(av){g.strokeStyle='rgba(255,205,90,.28)';g.lineWidth=1.5;g.setLineDash([18,16]);g.beginPath();g.moveTo(x,y0);g.lineTo(x,y1);g.stroke();g.setLineDash([])}
   for(let y=Math.floor(y0/45)*45;y<y1;y+=45)if(hs(cx,y|0,sd+1)<(av?.45:.2))xr(g,x+(hs(cx,y|0,sd+2)<.5?-rw*.24:rw*.24)-1,y,2,6,hs(cx,y|0,sd+3)<.5?'#ffe6a0':'#ff4a4a')}
  for(let cy=cy0;cy<=cy1;cy++){const y=cy*S,av=cy%3===0,rw=av?38:20;xr(g,x0,y-rw/2,CH,rw,'#0c121e');
   if(av){g.strokeStyle='rgba(255,205,90,.28)';g.lineWidth=1.5;g.setLineDash([18,16]);g.beginPath();g.moveTo(x0,y);g.lineTo(x1,y);g.stroke();g.setLineDash([])}
   for(let x=Math.floor(x0/45)*45;x<x1;x+=45)if(hs(x|0,cy,sd+4)<(av?.45:.2))xr(g,x,y+(hs(x|0,cy,sd+5)<.5?-rw*.24:rw*.24)-1,6,2,hs(x|0,cy,sd+6)<.5?'#ffe6a0':'#ff4a4a')}
  for(let cy=cy0;cy<cy1;cy++)for(let cx=cx0;cx<cx1;cx++){const H=k=>hs(cx,cy,sd+10+k),mx0=cx*S+(cx%3===0?22:13),my0=cy*S+(cy%3===0?22:13),
    bw=(cx+1)*S-((cx+1)%3===0?22:13)-mx0,bh=(cy+1)*S-((cy+1)%3===0?22:13)-my0;if(H(0)<.12)continue;
   xr(g,mx0,my0,bw,bh,'#0b101b');const nb=1+(H(1)*3|0);
   for(let i=0;i<nb;i++){const w=bw*(.34+H(i+10)*.48),h=bh*(.34+H(i+20)*.48),bx=mx0+(bw-w)*H(i+30),by=my0+(bh-h)*H(i+40),
     tone=['#121928','#172033','#0e1522','#1b2538'][i%4],acc=['#5cf2ff','#ff5a9a','#ffd23f','#7dff8a'][(i+(cx+cy&3))%4];
    xr(g,bx+6,by+8,w,h,'rgba(0,0,0,.45)');xr(g,bx,by,w,h,tone);g.strokeStyle='rgba(140,180,220,.16)';g.lineWidth=1.2;g.strokeRect(bx+.5,by+.5,w-1,h-1);
    if(H(i+50)<.45){g.strokeStyle=acc;g.globalAlpha=.45;g.lineWidth=2;g.strokeRect(bx+3,by+3,w-6,h-6);g.globalAlpha=1}
    if(H(i+60)<.3&&Math.min(w,h)>54){g.strokeStyle='rgba(255,210,63,.3)';g.lineWidth=1.5;g.beginPath();g.arc(bx+w/2,by+h/2,Math.min(w,h)*.24,0,TAU);g.stroke()}
    for(let k=0;k<8;k++){const wx=bx+5+H(i*17+k+70)*(w-12),wy=by+5+H(i*17+k+80)*(h-12);xr(g,wx,wy,2.5,2.5,k%3?'#ffd27a':'#7fd8ff')}}}}
 else if(bg=='cave'){
  xr(g,x0,y0,CH,CH,'#14110f');ovl(g,2,5,.32,'overlay',x0,y0);ovl(g,1,1.4,.14,'overlay',x0,y0);
  const S=260;for(let cy=Math.floor((y0-150)/S);cy<=Math.ceil((y1+150)/S);cy++)for(let cx=Math.floor((x0-150)/S);cx<=Math.ceil((x1+150)/S);cx++){
   const H=k=>hs(cx,cy,sd+100+k);if(H(0)>.68)continue;const px=(cx+H(1))*S,py=(cy+H(2))*S,r=60+H(3)*85,nv=6+(H(4)*4|0);
   const poly=sc=>{g.beginPath();for(let i=0;i<nv;i++){const a=i*TAU/nv+H(5)*2,d=r*sc*(.65+H(10+i)*.45);i?g.lineTo(px+Math.cos(a)*d,py+Math.sin(a)*d):g.moveTo(px+Math.cos(a)*d,py+Math.sin(a)*d)}g.closePath()};
   g.save();g.translate(8,10);poly(1);g.fillStyle='rgba(0,0,0,.45)';g.fill();g.restore();
   poly(1);g.fillStyle='#24201c';g.fill();poly(.7);g.fillStyle='#312b25';g.fill();g.strokeStyle='rgba(210,195,175,.12)';g.lineWidth=1.5;g.stroke()}
  for(const d of M.vdec||[]){if(d.x+d.r*1.3<x0||d.x-d.r*1.3>x1||d.y+d.r*1.3<y0||d.y-d.r*1.3>y1)continue;
   if(d.k=='cpool'){bpath(g,d.b,1.12);g.fillStyle='#2a2520';g.fill();bpath(g,d.b,1);g.fillStyle='#0b3340';g.fill();bpath(g,d.b,.65);g.fillStyle='#051d26';g.fill();
    g.strokeStyle='rgba(140,220,245,.22)';g.lineWidth=1.4;for(let i=0;i<3;i++){g.beginPath();g.arc(d.x+(hs(i,d.s,1)-.5)*d.r*.6,d.y+(hs(i,d.s,2)-.5)*d.r*.6,12+hs(i,d.s,3)*24,0,TAU);g.stroke()}}
   else if(d.k=='crys'){xGlow(g,d.x,d.y,d.r,d.c,.24);
    for(let i=0;i<5;i++){const a=i*TAU/5+hs(i,d.s,1),l=18+hs(i,d.s,2)*28,w=7+hs(i,d.s,3)*6;g.save();g.translate(d.x,d.y);g.rotate(a);
     g.fillStyle=d.c;g.beginPath();g.moveTo(0,-w/2);g.lineTo(l,0);g.lineTo(0,w/2);g.closePath();g.fill();
     g.fillStyle=xmix(d.c,'#ffffff',.5);g.beginPath();g.moveTo(0,-w/2);g.lineTo(l,0);g.lineTo(0,0);g.closePath();g.fill();g.restore()}}}}
 else if(bg=='wild'){
  const ex=!!M.vwild;xr(g,x0,y0,CH,CH,ex?'#16332c':'#223a1e');ovl(g,2,6,.26,'overlay',x0,y0);ovl(g,1,1.5,.12,'overlay',x0,y0);
  for(const d of M.vdec||[])if(d.k=='wglade'&&d.x+d.r>x0&&d.x-d.r<x1&&d.y+d.r>y0&&d.y-d.r<y1){
   bpath(g,d.b,1);g.fillStyle=ex?'#224c3e':'#335927';g.fill();
   for(let i=0;i<16;i++)xc(g,d.x+(hs(i,d.s,1)-.5)*d.r,d.y+(hs(i,d.s,2)-.5)*d.r,1.8,ex?'#7dffda':'#e8d87a')}
  const RVs=(M.vdec||[]).filter(d=>d.k=='wriv');
  for(const d of RVs){g.lineCap='round';g.lineJoin='round';pline(g,d.pts);
   g.strokeStyle=ex?'#384e48':'#685a3e';g.lineWidth=d.w+22;g.stroke();g.strokeStyle=ex?'#155966':'#1d556f';g.lineWidth=d.w;g.stroke();
   g.strokeStyle=ex?'#0d3b46':'#123b52';g.lineWidth=d.w*.55;g.stroke();g.strokeStyle='rgba(200,240,255,.22)';g.lineWidth=3;g.setLineDash([20,26]);g.stroke();g.setLineDash([])}
  const S=72;for(let cy=Math.floor((y0-50)/S);cy<=Math.ceil((y1+50)/S);cy++)for(let cx=Math.floor((x0-50)/S);cx<=Math.ceil((x1+50)/S);cx++){
   const H=k=>hs(cx,cy,sd+200+k);if(H(0)>.78)continue;const px=(cx+H(1))*S,py=(cy+H(2))*S;
   if(RVs.some(rv=>segNear(rv.pts,px,py)[0]<rv.w*.65+18))continue;
   if(H(0)>.68){const r=10+H(3)*14;xc(g,px+3,py+4,r,'rgba(0,0,0,.28)');xc(g,px,py,r,'#5a5850');xc(g,px-r*.25,py-r*.25,r*.45,'#78756a');continue}
   const r=16+H(3)*16,c0=ex?'#102822':'#142a14',c1=ex?'#1b453a':'#24491f',c2=ex?'#2b6856':'#386b2d';
   xc(g,px+5,py+7,r,'rgba(0,0,0,.26)');xc(g,px,py,r,c0);xc(g,px-2,py-2,r*.78,c1);xc(g,px-r*.25,py-r*.25,r*.42,c2)}}
 else{
  xr(g,x0,y0,CH,CH,'#6e502f');ovl(g,2,6,.26,'overlay',x0,y0);ovl(g,0,.8,.1,'overlay',x0,y0);
  const S=180;for(let cy=Math.floor((y0-130)/S);cy<=Math.ceil((y1+130)/S);cy++)for(let cx=Math.floor((x0-130)/S);cx<=Math.ceil((x1+130)/S);cx++){
   const H=k=>hs(cx,cy,sd+300+k);if(H(0)>.75)continue;const px=(cx+H(1))*S,py=(cy+H(2))*S,L=90+H(3)*90,a=-.5+(H(4)-.5)*.6;
   g.save();g.translate(px,py);g.rotate(a);g.lineCap='round';
   g.strokeStyle='rgba(35,20,8,.25)';g.lineWidth=24;g.beginPath();g.moveTo(-L/2,5);g.quadraticCurveTo(0,-14,L/2,5);g.stroke();
   g.strokeStyle='rgba(235,198,140,.22)';g.lineWidth=9;g.beginPath();g.moveTo(-L/2,0);g.quadraticCurveTo(0,-18,L/2,0);g.stroke();g.restore()}
  for(const d of M.vdec||[])if(d.k=='mesa'&&d.x+d.r*1.2>x0&&d.x-d.r*1.2<x1&&d.y+d.r*1.2>y0&&d.y-d.r*1.2<y1){
   if(d.cr){bpath(g,d.b,1.1);g.fillStyle='#8c683e';g.fill();bpath(g,d.b,.88);g.fillStyle='#4a341c';g.fill()}
   else{bpath(g,d.b,1.06);g.fillStyle='rgba(0,0,0,.3)';g.fill();bpath(g,d.b,1);g.fillStyle='#583d22';g.fill();bpath(g,d.b,.76);g.fillStyle='#7c5a36';g.fill();bpath(g,d.b,.52);g.fillStyle='#9c754a';g.fill()}}
  const SR=96;for(let cy=Math.floor((y0-30)/SR);cy<=Math.ceil((y1+30)/SR);cy++)for(let cx=Math.floor((x0-30)/SR);cx<=Math.ceil((x1+30)/SR);cx++){
   const H=k=>hs(cx,cy,sd+350+k);if(H(0)<.25){const px=(cx+H(1))*SR,py=(cy+H(2))*SR,r=7+H(3)*13;xc(g,px+3,py+4,r,'rgba(0,0,0,.25)');xc(g,px,py,r,'#5a4228');xc(g,px-2,py-2,r*.45,'#8c6b45')}}}
 for(const d of M.vdec||[]){if(d.k!='cloud'||d.x+d.r<x0||d.x-d.r>x1||d.y+d.r<y0||d.y-d.r>y1)continue;xGlow(g,d.x,d.y,d.r,d.c||'#8aa0c0',d.a)}
 g.restore()}
// fondale marino (anche sotto i pavimenti di vetro): sabbia e roccia, alghe, coralli, bolle, raggi di luce
function xOceanPaint(g,x0,y0,x1,y1,under){const sd=M.seed+21;xr(g,x0,y0,x1-x0,y1-y0,'#063443');
 for(let cy=Math.floor(y0/420)-1;cy<=y1/420+1;cy++)for(let cx=Math.floor(x0/420)-1;cx<=x1/420+1;cx++){const h=hs(cx,cy,sd+30);xGlow(g,(cx+hs(cx,cy,sd+31))*420,(cy+hs(cx,cy,sd+32))*420,260+h*320,h<.5?'#021c26':'#0e4c5c',.55)}   // fondali più chiari e più scuri (coordinate del mondo: nessuna cucitura)
 ovl(g,2,5,.35,'overlay',x0,y0);
 for(let cy=Math.floor(y0/64);cy<y1/64;cy++)for(let cx=Math.floor(x0/64);cx<x1/64;cx++){const h=hs(cx,cy,sd),x=(cx+hs(cx,cy,sd+1))*64,y=(cy+hs(cx,cy,sd+2))*64,big=hs(cx>>3,cy>>3,sd+3);
  if(big<.3&&h<.5){g.fillStyle='rgba(170,150,100,.10)';g.beginPath();g.ellipse(x,y,40,22,h*6,0,TAU);g.fill()}   // chiazze di sabbia
  if(h<.06){xc(g,x+3,y+4,10+h*200,'rgba(0,0,0,.3)');xc(g,x,y,10+h*200,'#1e3a40');xc(g,x-3,y-3,(10+h*200)*.5,'rgba(120,170,170,.18)')}   // rocce
  else if(h<.16&&big>.4){g.strokeStyle=h<.11?'rgba(60,140,70,.65)':'rgba(90,160,60,.55)';g.lineWidth=3;for(let k=0;k<4;k++){g.beginPath();g.moveTo(x+k*5,y);g.bezierCurveTo(x+k*5+8,y-14,x+k*5-8,y-28,x+k*5+4,y-44-h*120);g.stroke()}}   // alghe
  else if(h<.2&&big>.62){const c=['#ff6a8a','#ff9a3a','#c25fff','#ffd23f'][(h*100|0)%4];for(let k=0;k<5;k++)xc(g,x+hs(cx,k,sd+5)*20-10,y+hs(k,cy,sd+6)*20-10,3+hs(cx+k,cy,sd+7)*5,c)}   // coralli
  else if(h>.97)xc(g,x,y,2.5,'rgba(200,250,255,.5)')}   // bolle
 if(!under)for(const d of M.vdec||[]){if(d.x+d.r<x0||d.x-d.r>x1||d.y+d.r<y0||d.y-d.r>y1)continue;
  if(d.k=='kelp'){for(let k=0;k<24;k++){const a=hs(k,d.s,1)*TAU,r=hs(k,d.s,2)*d.r,x=d.x+Math.cos(a)*r,y=d.y+Math.sin(a)*r;g.strokeStyle='rgba(50,130,60,.7)';g.lineWidth=4;g.beginPath();g.moveTo(x,y);g.bezierCurveTo(x+12,y-20,x-12,y-40,x+6,y-70);g.stroke()}}
  if(d.k=='wreck'){g.save();g.translate(d.x,d.y);g.rotate(d.a);g.fillStyle='rgba(0,0,0,.3)';g.fillRect(-d.r*.5+6,-d.r*.14+8,d.r,d.r*.28);g.fillStyle='#3a3a32';g.beginPath();g.moveTo(d.r*.55,0);g.lineTo(d.r*.3,-d.r*.14);g.lineTo(-d.r*.5,-d.r*.12);g.lineTo(-d.r*.5,d.r*.12);g.lineTo(d.r*.3,d.r*.14);g.closePath();g.fill();
   g.strokeStyle='#5a4a32';g.lineWidth=3;for(let x=-d.r*.4;x<d.r*.3;x+=18){g.beginPath();g.moveTo(x,-d.r*.12);g.lineTo(x,d.r*.12);g.stroke()}g.fillStyle='rgba(90,150,80,.35)';g.fillRect(-d.r*.2,-d.r*.05,d.r*.3,d.r*.1);g.restore()}}
 g.save();g.globalCompositeOperation='screen';g.fillStyle='rgba(120,220,255,.045)';for(let k=-3;k<WW/700;k++){const x=k*700+hs(k,1,sd+9)*700,w=50+hs(k,2,sd+9)*90;g.beginPath();g.moveTo(x,0);g.lineTo(x+w,0);g.lineTo(x+w+WH*.3,WH);g.lineTo(x+WH*.3,WH);g.closePath();g.fill()}g.restore()}   // raggi di luce dall'alto

// --- base lunare: crateri, mari di basalto, piste dei rover (dopo il terreno) e regolite grigia (alla fine del blocco)
function moonGround(g,x0,y0){const x1=x0+CH,y1=y0+CH,sd=M.seed+41;
 for(let cy=Math.floor(y0/700)-1;cy<=y1/700;cy++)for(let cx=Math.floor(x0/700)-1;cx<=x1/700;cx++){const h=hs(cx,cy,sd);if(h>.35)continue;const x=(cx+hs(cx,cy,sd+1))*700,y=(cy+hs(cx,cy,sd+2))*700,r=300+h*1200;
  const gr=g.createRadialGradient(x,y,r*.2,x,y,r);gr.addColorStop(0,'rgba(30,30,34,.28)');gr.addColorStop(1,'rgba(30,30,34,0)');g.fillStyle=gr;g.fillRect(x0,y0,CH,CH)}   // mari di basalto
 for(const c of M.crat||[]){if(c.x+c.r*1.6<x0||c.x-c.r*1.6>x1||c.y+c.r*1.6<y0||c.y-c.r*1.6>y1)continue;const r=c.r;
  if(r>150){g.strokeStyle='rgba(230,230,230,.06)';g.lineWidth=r*.05;for(let k=0;k<14;k++){const a=hs(k,c.s,1)*TAU,l=r*(1.2+hs(k,c.s,2)*1.2);g.beginPath();g.moveTo(c.x+Math.cos(a)*r,c.y+Math.sin(a)*r);g.lineTo(c.x+Math.cos(a)*l,c.y+Math.sin(a)*l);g.stroke()}}   // raggi di materiale espulso
  const ej=g.createRadialGradient(c.x,c.y,r*.9,c.x,c.y,r*1.45);ej.addColorStop(0,'rgba(220,220,220,.16)');ej.addColorStop(1,'rgba(220,220,220,0)');g.fillStyle=ej;g.beginPath();g.arc(c.x,c.y,r*1.45,0,TAU);g.fill();
  g.save();g.beginPath();g.arc(c.x,c.y,r,0,TAU);g.clip();g.fillStyle='rgba(0,0,0,.32)';g.fillRect(c.x-r,c.y-r,2*r,2*r);
  g.fillStyle='rgba(225,225,225,.20)';g.beginPath();g.arc(c.x+r*.22,c.y+r*.22,r*.92,0,TAU);g.fill();   // parete interna illuminata (sole in alto a sinistra)
  g.fillStyle='rgba(0,0,0,.12)';g.beginPath();g.arc(c.x+r*.1,c.y+r*.1,r*.55,0,TAU);g.fill();g.restore();
  g.strokeStyle='rgba(240,240,240,.30)';g.lineWidth=Math.max(2,r*.09);g.beginPath();g.arc(c.x,c.y,r,Math.PI*.75,Math.PI*1.75,true);g.stroke();   // bordo: lato al sole
  g.strokeStyle='rgba(0,0,0,.30)';g.beginPath();g.arc(c.x,c.y,r,Math.PI*1.75,Math.PI*.75,true);g.stroke()}
 // piste dei rover: doppie linee leggere che girano attorno ai siti
 for(let cy=Math.floor(y0/900);cy<y1/900;cy++)for(let cx=Math.floor(x0/900);cx<x1/900;cx++){if(hs(cx,cy,sd+7)>.4)continue;const ax=(cx+hs(cx,cy,sd+8))*900,ay=(cy+hs(cx,cy,sd+9))*900,a=hs(cx,cy,sd+10)*TAU;
  g.strokeStyle='rgba(0,0,0,.12)';g.lineWidth=3;for(const o of[-7,7]){g.beginPath();g.moveTo(ax+Math.cos(a+1.57)*o,ay+Math.sin(a+1.57)*o);g.quadraticCurveTo(ax+Math.cos(a)*450+Math.cos(a+2.4)*200+Math.cos(a+1.57)*o,ay+Math.sin(a)*450+Math.sin(a+2.4)*200+Math.sin(a+1.57)*o,ax+Math.cos(a+.6)*900+Math.cos(a+1.57)*o,ay+Math.sin(a+.6)*900+Math.sin(a+1.57)*o);g.stroke()}}}
function moonGrade(g,x0,y0){g.save();g.globalCompositeOperation='saturation';g.fillStyle='#808080';g.globalAlpha=.9;g.fillRect(x0,y0,CH+2,CH+2);
 g.globalCompositeOperation='soft-light';g.globalAlpha=.35;g.fillStyle='#c8d0dc';g.fillRect(x0,y0,CH+2,CH+2);g.restore();
 for(const f of M.flat)if(f.k=='xsol'&&f.x>x0-300&&f.x<x0+CH+300&&f.y>y0-300&&f.y<y0+CH+300)xSolar(g,f)}   // i pannelli restano blu
