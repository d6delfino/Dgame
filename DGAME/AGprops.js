'use strict';
/* AIRGRUNT · AGprops.js — catalogo di VEICOLI, ANIMALI, BARCHE, OGGETTI e SCENE TEMATICHE, tutto PIATTO (finisce nell'immagine di sfondo, vedi AGbake.js).
   Niente di interattivo e niente di rete: ogni client rigenera tutto dal seed (generatore proprio, NON tocca quello della mappa, quindi la mappa resta identica).
   Struttura:
   1) VEH  = disegni (veicoli, animali, oggetti): ognuno è disegnato nell'origine, rivolto verso +x, con la propria ombra.  veh(g,nome,x,y,angolo,colore,scala,opzioni)
   2) vessel() = barche (stessa firma della vecchia boat(): len/wid in pixel)
   3) SCN  = scene tematiche (gruppi coerenti di veicoli e oggetti), disegnate da PROPS.scn
   4) decorScenes() = piazza le scene intorno ai siti (militari, industriali, rurali, porti, città) controllando strade, acqua, edifici e altre scene */
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
// ===== piazzamento: usa un generatore proprio (la mappa non cambia), evita strade, acqua, edifici e altre scene =====
const SCR={supply:50,repair:64,fieldCamp:56,sam:50,fuelDepot:52,cargoWork:42,scrap:46,wallWork:40,farmyard:62,greenhouse:46,logging:56,wreckShip:72,campsite:30,roadwork:44,crash:34,busStop:36,checkpoint:36,picnic:14,tankPark:0};
function decorScenes(){
 const f=M.flat,R=rng((DC.seed^0x2545F491)>>>0),rr=(a,b)=>a+R()*(b-a),ri=(a,b)=>a+(R()*(b-a+1)|0),pick=a=>a[R()*a.length|0],placed=[];
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
    if(R()<.7){const u=rr(p.x1+120,p.x2-60),v=rr(-p.W*.1,p.W*.1);if(free(u,p.y+v,40,{om:.7,shore:1,road:true}))add({k:'scn',t:'cargoWork',x:u,y:p.y+v,a:0,s:ri(0,1e6)},42)}
    for(let i=0,n=ri(1,3);i<n;i++){const u=rr(p.x1+100,p.x2-30),v=rr(-p.W/2+22,p.W/2-22),k=pick(['hauler','forklift','crates','forklift','pallet']);if(free(u,p.y+v,16,{om:.7,shore:1,road:true}))veh1(u,p.y+v,k,R()<.5?0:Math.PI,pick(IND_COL),k=='hauler'?24:12,{o:{cc:pick(CONT_COL)}})}
    for(const sd of[-1,1])if(R()<.6){const sty=pick([0,1,2,5,9,3]),b=BOAT_BASE[sty],len=Math.round(b[0]*rr(.9,1.6)),wid=Math.max(6,Math.round(len*b[1])),u=rr(p.x1+50,p.x2-40),y=p.y+sd*(p.W/2+wid/2+7);
     if(free(u,y,len/2,{water:1}))add({k:'boat',x:u,y,a:rr(-.06,.06)+(R()<.5?0:Math.PI),col:pick(CAR_COL),len,wid,sty},len/2)}}}
 }
 // 3) acqua: barche di ogni tipo e dimensione (fiumi, laghi, mare) e pontili sui laghi
 const boat=(x,y,a,sty,len0,col,mw)=>{const b=BOAT_BASE[sty];let len=len0,wid=Math.max(5,len*b[1]);if(mw&&wid>mw){const k=mw/wid;len*=k;wid*=k}if(len<9)return null;len=Math.round(len);wid=Math.round(wid);
  const c=Math.cos(a),s=Math.sin(a),ok=free(x,y,len/2*.9,{water:1})&&[[1,0],[-1,0]].every(q=>inWater(x+q[0]*c*len*.5,y+q[0]*s*len*.5,0))&&[[1],[-1]].every(q=>inWater(x-s*q[0]*wid*.6,y+c*q[0]*wid*.6,0));
  return ok?add({k:'boat',x,y,a,col:col||pick(CAR_COL),len,wid,sty},len/2):null};
 for(const rv of M.rivers){const P=rv.pts;let i=ri(3,6);while(i<P.length-3){const p=P[i],q=P[i+1],a=Math.atan2(q[1]-p[1],q[0]-p[0]),nx=-Math.sin(a),ny=Math.cos(a),off=(rv.w/2)*rr(-.35,.35),sty=pick([0,0,1,2,3,8,9]);
   if(R()<.7)boat(p[0]+nx*off,p[1]+ny*off,a+(R()<.5?0:Math.PI),sty,BOAT_BASE[sty][0]*rr(.8,2),null,rv.w*.34);i+=ri(7,13)}}
 for(const l of M.lakes){const mr=Math.min(...l.a);if(mr<110)continue;for(let k=0,nb=ri(2,5);k<nb;k++){const t=R()*TAU,d=Math.sqrt(R())*mr*.6,sty=pick([0,1,2,3,3,8,9,7]);boat(l.x+Math.cos(t)*d,l.y+Math.sin(t)*d,R()*TAU,sty,BOAT_BASE[sty][0]*rr(.8,2.1),null,mr*.2)}
  if(mr>=140&&R()<.6){const t=R()*TAU,r0=rad(l,l.x+Math.cos(t)*100,l.y+Math.sin(t)*100),x=l.x+Math.cos(t)*(r0-8),y=l.y+Math.sin(t)*(r0-8);   // pontile di legno + barca ormeggiata
   if(free(x,y,34,{shore:1,om:.5})){add({k:'scn',t:'jetty',x,y,a:t+Math.PI},34);const sty=pick([0,2,8,1]),b=BOAT_BASE[sty],len=Math.round(b[0]*rr(.9,1.3)),c=Math.cos(t+Math.PI),s=Math.sin(t+Math.PI),lat=len*b[1]/2+9;boat(x+c*6-s*lat,y+s*6+c*lat,t+Math.PI,sty,len,null)}}}
 for(let gi=0;gi<18;gi++){const y=rr(300,WH-300),x=coast(y)+rr(110,560),grp=pick([[1,1,9,2],[3,0,7],[4,5,4],[6,6],[1,1,1,2,8],[0,2,0]]),a0=R()*TAU;
  for(let i=0;i<Math.min(grp.length,ri(1,4));i++){const sty=grp[i],big=sty==7||sty==6||sty==4?rr(1,1.5):rr(.9,2.1);boat(x+rr(-110,110),y+rr(-110,110),a0+rr(-.5,.5),sty,BOAT_BASE[sty][0]*big,null)}}
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
  if(q.k==='circ'&&q.t===2&&!q.pool)f.push({k:'scn',t:'market',x:q.x,y:q.y,a:R()*TAU,s:ri(0,1e6),r:q.r});
  else if(q.k==='park'&&R()<.6){const c=Math.cos(q.a||0),s=Math.sin(q.a||0),u=rr(-.3,.3)*q.w,v=rr(-.3,.3)*q.h,x=q.x+u*c-v*s,y=q.y+u*s+v*c;if(free(x,y,16,{om:.6,road:1}))add({k:'scn',t:'picnic',x,y,a:R()*TAU,s:ri(0,1e6)},16)}
  // campi: mandrie al pascolo, balle di fieno nei campi mietuti, un secondo trattore al lavoro
  else if(q.k==='field'){const h=R(),w=q.w*.8,hh=q.h*.8;
   if((q.v===1||q.v===3)&&h<.4)f.push({k:'scn',t:'pasture',x:q.x,y:q.y,a:q.a,w,h:hh,n:Math.max(4,Math.min(11,Math.round(w*hh/2600))),kind:pick(['cow','sheep','sheep','horse','cow']),s:ri(0,1e6),r:Math.hypot(w,hh)/2+10});
   else if(q.v===0&&h<.5)f.push({k:'scn',t:'pasture',x:q.x,y:q.y,a:q.a,w,h:hh,n:ri(5,9),bales:1,s:ri(0,1e6),r:Math.hypot(w,hh)/2+10});
   else if(h<.18&&!f.some(z=>z.k==='tractor'&&Math.hypot(z.x-q.x,z.y-q.y)<8))f.push({k:'tractor',x:q.x,y:q.y,a:0,fa:q.a,fw:q.w,fh:q.h,col:pick(['#27ae60','#c0392b','#2980b9','#e67e22'])})}}
 // 5) campo aperto: relitti di navicelle, bivacchi, taglialegna, pannelli solari, depositi, accampamenti
 for(let i=0,n=0;i<110&&n<30;i++){const x=rr(350,SEA-400),y=rr(350,WH-350);if(wetCell(x,y))continue;const t=rtype(x,y),a=R()*TAU;let ok=null;
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
SCN.jetty=(g,f)=>{fR(g,-34,-4,64,9,'rgba(0,15,30,.35)');fR(g,-36,-5,64,9,'#8a6a3a');g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1;g.beginPath();for(let x=-32;x<28;x+=5){g.moveTo(x,-5);g.lineTo(x,4)}g.stroke();fC(g,-34,-5,1.6,'#3e2723');fC(g,-34,4,1.6,'#3e2723');fC(g,26,-5,1.6,'#3e2723');fC(g,26,4,1.6,'#3e2723');V(g,'crates',-18,0,0,'#8a6a3a',.7);V(g,'barrel',-4,0,0,'#2e86c1')};
