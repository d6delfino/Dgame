'use strict';
/* AIRGRUNT · AGrender.js — canvas, disegno di mech, nemici, bersagli di missione, HUD e contatore FPS.
   Tutta la grafica nasce da dati locali (posizioni, vita, eventi): in rete non viaggia nulla di grafico. */
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
let W=0,H=0,zoom=1,camX=0,camY=0,mx=0,my=0;
let zoomUserMul=1;   // moltiplicatore di zoom manuale (rotella). 1 = zoom automatico per arma/modalità
function resize(){const r=cv.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,G.q>=2?2:1.25);W=r.width;H=r.height;cv.width=W*d;cv.height=H*d;ctx.setTransform(d,0,0,d,0,0)}
addEventListener('resize',resize);
// ===== mech del giocatore =====
function gunArms(col,fl){ctx.strokeStyle='#aaa';ctx.lineWidth=.8;ctx.fillStyle='#111';ctx.beginPath();ctx.rect(4,-2.5,26,5);ctx.fill();ctx.stroke();ctx.fillStyle='#2a2a2a';ctx.beginPath();ctx.rect(8,-3.5,12,7);ctx.fill();ctx.stroke();
 ctx.fillStyle=col;ctx.strokeStyle='#000';ctx.lineWidth=1;
 ctx.beginPath();ctx.ellipse(7,-8,7,4,.3,0,TAU);ctx.fill();ctx.stroke();   // Spalla/braccio sinistro (da -10 a -8)
 ctx.beginPath();ctx.ellipse(10,9,7,4,-.3,0,TAU);ctx.fill();ctx.stroke();  // Spalla/braccio destro (da 7 a 9)
 ctx.fillStyle='#1d1d1d';ctx.strokeStyle='#aaa';ctx.lineWidth=.8;
 ctx.beginPath();ctx.arc(12,-5,3,0,TAU);ctx.fill();ctx.stroke();         // Dettaglio sinistro (da -7 a -5)
 ctx.beginPath();ctx.arc(15,6,3,0,TAU);ctx.fill();ctx.stroke();          // Dettaglio destro (da 4 a 6)
 if(fl){ctx.fillStyle='#fff';circle(30,0,5)}}

function helmet(){ctx.fillStyle='#788878';ctx.beginPath();ctx.arc(0,0,7.5,0,TAU);ctx.fill();ctx.strokeStyle='#1c241c';ctx.lineWidth=1.2;ctx.stroke();ctx.fillStyle='#ff2222';circle(5.5,-2.5,1.2);circle(5.5,2.5,1.2)}
function torso(col){
 ctx.fillStyle='#333';ctx.strokeStyle='#111';ctx.lineWidth=1;
 ctx.beginPath();ctx.rect(-13,-6,6,14);ctx.fill();ctx.stroke();
 ctx.fillStyle=col;ctx.strokeStyle='#000';ctx.beginPath();ctx.ellipse(-2,0,8,15,0,0,TAU);ctx.fill();ctx.stroke();
 
 ctx.fillStyle=col;
 ctx.strokeStyle='#111';
 ctx.lineWidth=1.5;
 
 // Spallaccio superiore (portato da -13 a -8 per avvicinarlo al centro)
 ctx.beginPath();
 ctx.arc(0, -9, 7, Math.PI, TAU);
 ctx.closePath();
 ctx.fill();
 ctx.stroke();

 // Spallaccio inferiore (portato da 13 a 8 per avvicinarlo al centro)
 ctx.beginPath();
 ctx.arc(0, 9, 7, 0, Math.PI);
 ctx.closePath();
 ctx.fill();
 ctx.stroke();
}
function mech(p,off,shadow){
 ctx.save();ctx.translate(p.x+off,p.y+off*1.3);const col=COLS[p.ci||0][0];
 if(p.air){
  if(shadow){ctx.rotate(p.h);ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,0,10,16,0,0,TAU);ctx.rect(-13,-8,7,16);ctx.arc(0,0,8,0,TAU);ctx.rect(-21,-11,12,9);ctx.rect(-21,2,12,9);ctx.fill()}
  else{ctx.save();ctx.rotate(p.fa);gunArms(col,p.fl>0);ctx.restore();
   ctx.save();ctx.rotate(p.h);ctx.strokeStyle='#aaa';ctx.lineWidth=.8;ctx.fillStyle='#222';ctx.fillRect(-21,-11,12,9);ctx.strokeRect(-21,-11,12,9);ctx.fillRect(-21,2,12,9);ctx.strokeRect(-21,2,12,9);
   if(p===P&&(typeof KB!=='undefined'&&KB.up)){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-23,-6,4,0,TAU);ctx.arc(-23,6,4,0,TAU);ctx.fill()}
   torso(col);helmet();ctx.restore()}}
 else{ctx.rotate(p.fa);
  const GS=MECH_SCALE;   // scala del mech Grunt (l'Air resta a 1.0)
  if(shadow){ctx.save();ctx.scale(GS,GS);ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(0,0,10,16,0,0,TAU);ctx.rect(-13,-8,7,16);ctx.arc(0,0,8,0,TAU);ctx.rect(4,-3,24,6);ctx.fill();ctx.restore()}
  else{ctx.save();ctx.scale(GS,GS);gunArms(col,p.fl>0);torso(col);helmet();ctx.restore()}}
 if(!shadow&&p.shs&&p.shs.some(t=>t<=0)){ctx.strokeStyle='rgba(143,227,255,.7)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,p.air?24:22*MECH_SCALE,0,TAU);ctx.stroke()}   // anello scudo (scala col Grunt)
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
function nameTag(q){ctx.save();ctx.font='bold 12px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.strokeStyle='#000';ctx.lineWidth=3;ctx.strokeText(q.name,q.x,q.y-28);ctx.fillStyle=COLS[q.ci||0][0];ctx.fillText(q.name,q.x,q.y-28);ctx.restore()}
// ===== nemici: stesse forme di prima; l'orientamento del mech coincide con la direzione di tiro =====
function unitBody(t){ctx.save();ctx.translate(t.x,t.y);const a=t.h||0, c=t.sec?'#2aa6d9':t.ci!=null?COLS[t.ci][0]:((G.mode!=1&&G.aiCi!=null)?COLS[G.aiCi][0]:null);   // sec = guardia alleata (missione 8): azzurra
 if(t.ar>0){ctx.strokeStyle='rgba(255,210,63,.7)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,t.k==6?62:t.k==5?34:t.k==0?30:t.k==4?26:t.k==2?30:t.k==3?22:18*MECH_SCALE,0,TAU);ctx.stroke()}
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
  ctx.restore()}
 else if(t.k==6){const pu=.5+.5*Math.sin(performance.now()/180);ctx.strokeStyle='rgba(255,60,60,'+(.35+.4*pu)+')';ctx.lineWidth=4;ctx.beginPath();ctx.arc(0,0,54+5*pu,0,TAU);ctx.stroke();
  ctx.save();ctx.rotate(a);ctx.scale(2.2,2.2);const col=c||'#c9a227';
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
  ctx.restore()}
 else if(t.k==4){ctx.save();ctx.rotate(a);ctx.fillStyle='#2f4a2b';ctx.strokeStyle='#111';ctx.lineWidth=1.5;for(let i=0;i<4;i++){const q=i*Math.PI/2+Math.PI/4;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(q)*22,Math.sin(q)*22);ctx.stroke()}
  ctx.beginPath();for(let i=0;i<6;i++){const q=i*Math.PI/3;ctx.lineTo(Math.cos(q)*14,Math.sin(q)*14)}ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#111';ctx.strokeStyle='#aaa';ctx.lineWidth=1;ctx.fillRect(4,-1.5,60,3);ctx.strokeRect(4,-1.5,60,3);ctx.fillStyle='#555';ctx.fillRect(16,-2.5,12,5);
  ctx.fillStyle=c||'#6f9a4a';circle(0,0,9);ctx.strokeStyle='#111';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#ff2222';circle(7,0,2);if(t.fl>0){ctx.fillStyle='#fff';circle(66,0,3)}ctx.restore()}
 else if(t.k==5){
  const baseCol=c||'#6b2424';
  const thrA=(t.thr!=null?t.thr:a);   // rotazione torretta (fallback: h)
  // ===== SCAFO (rotazione a = t.h) =====
  ctx.save();ctx.rotate(a);
  // 1. cingoli
  ctx.fillStyle='#2b2b30';ctx.strokeStyle='#111';ctx.lineWidth=1.5;
  ctx.fillRect(-28,-22,56,10);ctx.strokeRect(-28,-22,56,10);
  ctx.fillRect(-28,12,56,10);ctx.strokeRect(-28,12,56,10);
  ctx.strokeStyle='#1a1a1d';ctx.lineWidth=2;ctx.beginPath();
  for(let i=-22;i<=22;i+=6){ctx.moveTo(i,-21);ctx.lineTo(i,-13);ctx.moveTo(i,13);ctx.lineTo(i,21)}ctx.stroke();
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
   ctx.fillStyle='#2a2a2a';ctx.strokeStyle='#888';ctx.lineWidth=1;
   ctx.fillRect(8,-11,22,7);ctx.strokeRect(8,-11,22,7);
   ctx.fillRect(8,4,22,7);ctx.strokeRect(8,4,22,7);
   ctx.fillStyle='#111';ctx.fillRect(28,-12,4,9);ctx.fillRect(28,3,4,9);
   ctx.fillStyle='#888';ctx.fillRect(10,-9.5,2,4);ctx.fillRect(10,5.5,2,4);
   if(t.fl>0){ctx.fillStyle='#fff';circle(31,-7.5,4);circle(31,7.5,4)}
  }else{
   ctx.fillStyle='#222';ctx.strokeStyle='#888';ctx.lineWidth=1;
   ctx.fillRect(10,-5,32,10);ctx.strokeRect(10,-5,32,10);
   ctx.fillStyle='#333';ctx.fillRect(40,-6,8,12);ctx.strokeStyle='#666';ctx.strokeRect(40,-6,8,12);
   ctx.fillStyle='#111';ctx.fillRect(46,-4,3,8);
   if(t.fl>0){ctx.fillStyle='#fff';circle(48,0,7)}
  }
  ctx.restore();
 }
 else if(t.k==0){ctx.fillStyle='#2b2b30';ctx.strokeStyle='#111';ctx.lineWidth=2;
  for(const[r,c_in]of[[26,'#2b2b30'],[18,'#4a1414']]){ctx.fillStyle=c_in;ctx.beginPath();for(let i=0;i<8;i++){const q=i*Math.PI/4+Math.PI/8;ctx.lineTo(Math.cos(q)*r,Math.sin(q)*r)}ctx.closePath();ctx.fill();ctx.stroke()}
  ctx.rotate(a);ctx.fillStyle='#111';ctx.strokeStyle='#777';ctx.lineWidth=1;ctx.fillRect(8,-10,26,5);ctx.strokeRect(8,-10,26,5);ctx.fillRect(8,5,26,5);ctx.strokeRect(8,5,26,5);
  ctx.fillStyle=c||'#732323';circle(0,0,14);ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#222';ctx.fillRect(-4,-6,12,12);if(t.fl>0){ctx.fillStyle='#fff';circle(36,-7.5,4);circle(36,7.5,4)}}
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
function flyBody(t){const k3=t.k==3, c=(G.mode!=1&&G.aiCi!=null)?COLS[G.aiCi][0]:null;
 ctx.save();ctx.translate(t.x+12,t.y+16);ctx.rotate(t.h||0);ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();
 if(k3){ctx.moveTo(20,0);ctx.lineTo(-6,-10);ctx.lineTo(-2,0);ctx.lineTo(-6,10)}else{ctx.moveTo(22,0);ctx.lineTo(6,-8);ctx.lineTo(-14,-26);ctx.lineTo(-8,0);ctx.lineTo(-14,26);ctx.lineTo(6,8)}ctx.closePath();ctx.fill();ctx.restore();
 if(t.ar>0){ctx.strokeStyle='rgba(255,210,63,.7)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(t.x,t.y,k3?22:30,0,TAU);ctx.stroke()}
 ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.h||0);ctx.strokeStyle='#111';ctx.lineWidth=1.5;
 if(k3){ctx.fillStyle='#333';ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(-12,-14);ctx.lineTo(-8,0);ctx.lineTo(-12,14);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle=c||'#d9701a';ctx.beginPath();ctx.moveTo(20,0);ctx.lineTo(-6,-10);ctx.lineTo(-2,0);ctx.lineTo(-6,10);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle=Math.floor(performance.now()/120)%2?'#ff3b3b':'#7a0f0f';circle(-2,0,4.5);ctx.stroke();ctx.fillStyle='#ffc400';circle(-12,0,2)}
 else{ctx.fillStyle=c||'#512b7a';ctx.beginPath();ctx.moveTo(22,0);ctx.lineTo(6,-8);ctx.lineTo(-14,-26);ctx.lineTo(-8,0);ctx.lineTo(-14,26);ctx.lineTo(6,8);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#222';ctx.fillRect(-12,-6,8,12);ctx.strokeRect(-12,-6,8,12);ctx.fillStyle='#e0c8ff';circle(6,0,4.5);ctx.lineWidth=1;ctx.stroke();if(t.fl>0){ctx.fillStyle='#fff';circle(-12,-4,3);circle(-12,4,3)}}
 ctx.restore()}
// omino travestito (infiltrato = colori a caso come i civili, guardia = classe militare); con l'arma estratta mostra la canna del mech
function humanBody(t){civSpr();
 const arm=t.wp||t.st==2,pal=t.k==8?CIV_CLS[1]:[t.id%COLS.length,(t.id*5+1)%COLS.length],im=civPed(pal[0],pal[1],((G.t*5+t.id)|0)&1,arm);
 ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.h||0);
 ctx.drawImage(im,-im.width/2,-im.height/2);
 if(arm){ctx.scale(.7,.7);ctx.strokeStyle='#aaa';ctx.lineWidth=.8;
  // Arma sul lato destro dell'omino (+y) e arretrata verso il corpo (−x):
  // il receiver entra nel fianco destro, la canna sporge ancora oltre il corpo.
  ctx.translate(-6,10);
  ctx.fillStyle='#111';ctx.beginPath();ctx.rect(8,-2.5,22,5);ctx.fill();ctx.stroke();
  ctx.fillStyle='#2a2a2a';ctx.beginPath();ctx.rect(8,-3.5,12,7);ctx.fill();ctx.stroke();
  if(t.fl>0){ctx.fillStyle='#fff';circle(30,0,5)}}
 ctx.restore()}
function drawUnit(t,ldt){
 const fly=!!t.z,tg=seen(t.x,t.y,fly)?1:0;t.va=t.va==null?tg:t.va+(tg-t.va)*Math.min(1,10*ldt);if(t.va<.03)return;ctx.globalAlpha=t.va;
 if(fly)flyBody(t);else if(t.k>=UK_HUM)humanBody(t);else unitBody(t);
 const bw=t.k==6?80:t.k==0||t.k==5?52:40,by=t.k==6?-72:-36;
 if(t.k<UK_HUM||t.wp||t.st==2){ctx.fillStyle='#222';ctx.fillRect(t.x-bw/2,t.y+by,bw,4);ctx.fillStyle='#e04b4b';ctx.fillRect(t.x-bw/2,t.y+by,bw*clamp(t.hp/(t.mhp||120),0,1),4)}
 ctx.textAlign='center';
 if(t.k==6){ctx.fillStyle='#ff5a5a';ctx.font='bold 13px system-ui,sans-serif';ctx.fillText('BERSAGLIO D’ÉLITE',t.x,t.y+by-6)}
 if(t.name){ctx.fillStyle='#ffd2d2';ctx.font='bold 12px system-ui,sans-serif';ctx.fillText(t.name,t.x,t.y+by-6)}
 if(t.dis>0){ctx.fillStyle='#5dd6ff';ctx.font='bold 12px system-ui,sans-serif';ctx.fillText('SPENTA',t.x,t.y+by-6)}
 if(t.st==1&&!t.dis){ctx.fillStyle='#ff3b3b';ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.font='bold 30px system-ui,sans-serif';ctx.strokeText('!',t.x,t.y+by-20);ctx.fillText('!',t.x,t.y+by-20)}  // si è accorto di te: sta reagendo
 ctx.globalAlpha=1}
function drawSlash(sl){
 const o = sl.id === NET.id ? P : others[sl.id];
 if(!o) return;
 const u = sl.t / sl.life;
 const A0 = sl.a - MELEE_ARC, A1 = sl.a + MELEE_ARC;

 ctx.save();
 ctx.translate(o.x, o.y);
 ctx.globalAlpha = 1.0; 

 const currentAngle = A0 + (A1 - A0) * u;
 ctx.rotate(currentAngle);
 // Scala il fendente (Grunt ridotto: MECH_SCALE; Air: 1) → lama più corta e più sottile
 const sc = sl.sc || 1;
 if(sc!==1) ctx.scale(sc, sc);

 const cPrimary = COLS[o.ci || 0][0];

 // 2. Guardamano e impugnatura tattica (allargato da -5/5 a -9/9)
 ctx.fillStyle = '#111111';
 ctx.strokeStyle = '#333333';
 ctx.lineWidth = 1.5;
 ctx.fillRect(10, -9, 6, 18);
 ctx.strokeRect(10, -9, 6, 18);

 // 3. Lama in acciaio da combattimento (allargata da -3.5/3.5 a -7/7)
 ctx.fillStyle = '#d5e1e8';
 ctx.strokeStyle = '#0f1419';
 ctx.lineWidth = 1.5;
 ctx.beginPath();
 ctx.moveTo(16, -7);
 ctx.lineTo(52, -5);
 ctx.lineTo(64, 0);   
 ctx.lineTo(52, 5);
 ctx.lineTo(16, 7);
 ctx.closePath();
 ctx.fill();
 ctx.stroke();

 // 4. Scanalatura centrale (Fuller)
 ctx.strokeStyle = '#4b5563';
 ctx.lineWidth = 1.2;
 ctx.beginPath();
 ctx.moveTo(18, 0);
 ctx.lineTo(46, 0);
 ctx.stroke();

 ctx.restore();
}
// ===== bersagli e oggetti di missione =====
function drawMark(o){const hw=o.w/2,hh=o.h/2,pu=.5+.5*Math.sin(performance.now()/260);
 if(o.rb){ctx.fillStyle='#ffb000';for(let y=-hh;y<hh-1;y+=24)ctx.fillRect(-hw,y,o.w,12);ctx.strokeStyle='#111';ctx.lineWidth=2;ctx.strokeRect(-hw,-hh,o.w,o.h);return}
 if(o.bar||o.arm){ctx.save();ctx.setLineDash([16,10]);ctx.strokeStyle=o.arm?'#3fd05a':'#ff3b3b';ctx.lineWidth=5;for(const q of o.pr){qpath(ctx,q,4);ctx.stroke()}ctx.restore()}
 ctx.save();ctx.rotate(-o.a);const R0=Math.min(26,Math.min(o.w,o.h)*.28);
 if(o.bar){ctx.fillStyle='#b01818';ctx.strokeStyle='#fff';ctx.lineWidth=3;circle(0,0,R0);ctx.stroke();ctx.fillStyle='#fff';ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?R0*.28:R0*.65;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill()}
 else if(o.arm){ctx.fillStyle='#10261a';ctx.strokeStyle='#3fd05a';ctx.lineWidth=3;circle(0,0,R0);ctx.stroke();   // armi incrociate
  ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-R0*.5,-R0*.5);ctx.lineTo(R0*.5,R0*.5);ctx.moveTo(R0*.5,-R0*.5);ctx.lineTo(-R0*.5,R0*.5);ctx.stroke();
  ctx.fillStyle='#3fd05a';circle(0,0,R0*.2)}
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
function drawMissionWorld(){const pu=.5+.5*Math.sin(performance.now()/300),mt=G.mt;
 if(mt==1&&MD.pts){ctx.save();ctx.strokeStyle='rgba(74,163,255,.5)';ctx.lineWidth=6;ctx.setLineDash([26,22]);ctx.beginPath();MD.pts.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.stroke();ctx.restore()}
 if(mt==2||mt==10||MS.ex==1){ctx.save();ctx.strokeStyle='rgba(94,224,192,'+(.5+.4*pu)+')';ctx.lineWidth=5;ctx.beginPath();ctx.arc(EXT[0],EXT[1],extR(),0,TAU);ctx.stroke();ctx.fillStyle='rgba(94,224,192,.9)';ctx.font='bold 16px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText(G.mt==7?'NAVE SPAZIALE':'ESTRAZIONE',EXT[0],EXT[1]+6);ctx.restore()}
 if(mt>=5&&mt!=9)MD.z.forEach((z,i)=>{ctx.save();const done=z.p>=1,act=i==MS.cz,col=done?'63,174,74':act?'255,210,63':'200,200,200';
  ctx.fillStyle='rgba('+col+','+(act?.12:.06)+')';ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.fill();ctx.strokeStyle='rgba('+col+',.7)';ctx.lineWidth=4;ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.stroke();
  if(z.p>0){ctx.strokeStyle='rgb('+col+')';ctx.lineWidth=10;ctx.beginPath();ctx.arc(z.x,z.y,z.r-8,-Math.PI/2,-Math.PI/2+TAU*z.p);ctx.stroke()}
  ctx.fillStyle='rgba('+col+',.9)';ctx.font='bold 22px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText(done?'✓':String(i+1),z.x,z.y+8);ctx.restore()});
 if(mt==9)MD.z.forEach((z,i)=>{if(!z.on)return;ctx.save();ctx.fillStyle='rgba(255,74,74,'+(.08+.08*pu)+')';ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.fill();
  ctx.strokeStyle='rgba(255,74,74,.8)';ctx.lineWidth=4;ctx.beginPath();ctx.arc(z.x,z.y,z.r,0,TAU);ctx.stroke();
  if(z.p>0){ctx.strokeStyle='#5ee0c0';ctx.lineWidth=10;ctx.beginPath();ctx.arc(z.x,z.y,z.r-8,-Math.PI/2,-Math.PI/2+TAU*z.p);ctx.stroke()}   // barra di ripristino
  ctx.fillStyle='rgba(255,130,130,.95)';ctx.font='bold 14px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText('TORRETTA '+(i+1),z.x,z.y+5);ctx.restore()});
 if(mt==10){
  const c=MD.crash;
  if(c){
   const onScr=c.x>camX-250&&c.x<camX+W/zoom+250&&c.y>camY-250&&c.y<camY+H/zoom+250;   // il sito è (almeno in parte) nello schermo
   // area del sito: cerchio tratteggiato pulsante, solo dopo la scoperta
   if(c.seen&&onScr){const pu=.5+.5*Math.sin(performance.now()/300);
    ctx.save();ctx.strokeStyle='rgba(255,140,60,'+(.35+.25*pu)+')';ctx.lineWidth=4;ctx.setLineDash([20,16]);
    ctx.beginPath();ctx.arc(c.x,c.y,c.r,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.restore()}
   // relitto: solo se è nello schermo e il suo centro è nella visuale del Grunt (non attraverso la nebbia)
   if(onScr&&seen(c.x,c.y,false)){
    ctx.save();ctx.translate(c.x,c.y);ctx.rotate(c.a);
    try{SCN.wreckShip(ctx,{s:(c.x|0)*7+(c.y|0)*11,big:1})}catch(e){if(!c.err){c.err=1;console.warn('wreckShip:',e)}}   // l'errore si segnala una volta sola invece di essere nascosto
    ctx.restore()}
  }
  // VIP: feriti a terra (recuperabili) oppure recuperati (seguono il player)
  for(const v of MS.vips||[]){
   if(v.dead)continue;
   if(v.on||v.saved){if(!dsHides('vip'+v.n))drawAlly(v,'vip');continue}   // recuperati o in salvo: restano visibili finché la dropship non li carica
   if(!seen(v.x,v.y,false))continue;   // ferito: si vede solo se è nella visuale del Grunt (nebbia di guerra)
   // ferito: figurina stesa + alone + barra di recupero
   const pu=.5+.5*Math.sin(performance.now()/300+v.id);
   ctx.save();
   ctx.fillStyle='rgba(94,224,192,'+(.06+.06*pu)+')';ctx.beginPath();ctx.arc(v.x,v.y,55,0,TAU);ctx.fill();
   ctx.translate(v.x,v.y);ctx.rotate(v.h||0);
   ctx.fillStyle='#e8eef5';ctx.strokeStyle='#111';ctx.lineWidth=1;
   ctx.beginPath();ctx.ellipse(0,0,7,4,0,0,TAU);ctx.fill();ctx.stroke();
   ctx.fillStyle='#f1c27d';ctx.beginPath();ctx.arc(9,0,2.5,0,TAU);ctx.fill();ctx.strokeStyle='#111';ctx.lineWidth=1;ctx.stroke();
   ctx.restore();
   ctx.save();ctx.textAlign='center';
   ctx.fillStyle='#5ee0c0';ctx.font='bold 11px system-ui,sans-serif';ctx.fillText('VIP '+v.n,v.x,v.y-18);
   ctx.fillStyle='#333';ctx.fillRect(v.x-22,v.y+10,44,5);
   ctx.fillStyle='#5ee0c0';ctx.fillRect(v.x-22,v.y+10,44*clamp((v.rv||0)/VIP_T,0,1),5);
   ctx.restore();
  }
 }
 if(mt==1&&MS.al&&!dsHides('vip'))drawAlly(MS.al,'conv');
 if(mt==2&&MS.al&&MS.al.st&&!dsHides('vip'))drawAlly(MS.al,'vip');
 if(mt==8)for(const v of MS.vans||[]){ctx.strokeStyle='rgba(94,224,192,'+(.4+.4*pu)+')';ctx.lineWidth=3;ctx.beginPath();ctx.arc(v.x,v.y,38,0,TAU);ctx.stroke();drawAlly(v,'van');
  ctx.fillStyle='#333';ctx.fillRect(v.x-22,v.y-48,44,5);ctx.fillStyle='#3fae4a';ctx.fillRect(v.x-22,v.y-48,44*clamp(v.hp/v.mhp,0,1),5);ctx.fillStyle='#5ee0c0';ctx.font='bold 11px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText('VIP '+v.n,v.x,v.y-53)}}
function drawMissionHud(p){const inf=missionInfo(),w=Math.min(W-24,520),x=W/2-w/2,bar=inf.f>=0,hb=inf.h!=null;
 ctx.save();ctx.textAlign='center';ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(x,10,w,bar?(hb?80:68):52);
 ctx.fillStyle='#ffd23f';ctx.font='bold 14px system-ui,sans-serif';ctx.fillText('MISSIONE · '+MIS_NAMES[G.mt].toUpperCase()+(G.mt==8||G.mt==9?'':'  ·  Caserme '+BAR.filter(o=>!o.dead).length+'/'+BAR.length),W/2,28);
 ctx.fillStyle='#fff';ctx.font='13px system-ui,sans-serif';ctx.fillText(inf.t,W/2,46);
 if(bar){ctx.fillStyle='#333';ctx.fillRect(x+12,54,w-24,8);ctx.fillStyle=inf.c||'#3fae4a';ctx.fillRect(x+12,54,(w-24)*clamp(inf.f,0,1),8)}
 if(hb){ctx.fillStyle='#333';ctx.fillRect(x+12,66,w-24,5);ctx.fillStyle='#3fae4a';ctx.fillRect(x+12,66,(w-24)*clamp(inf.h,0,1),5)}
 for(const m of missionMarks()){const sx=(m.x-camX)*zoom,sy=(m.y-camY)*zoom,d=Math.hypot(m.x-p.x,m.y-p.y);ctx.fillStyle=m.c;ctx.strokeStyle='#000';ctx.lineWidth=2;
  if(sx>40&&sx<W-40&&sy>120&&sy<H-60){ctx.beginPath();ctx.moveTo(sx,sy-34);ctx.lineTo(sx-9,sy-52);ctx.lineTo(sx+9,sy-52);ctx.closePath();ctx.fill();ctx.stroke()}
  else{const cx=W/2,cy=H/2,dx=sx-cx,dy=sy-cy,k=Math.min((W/2-40)/Math.abs(dx||1e-6),(H/2-90)/Math.abs(dy||1e-6)),ex=cx+dx*k,ey=Math.max(110,cy+dy*k),a=Math.atan2(dy,dx);
    ctx.save();ctx.translate(ex,ey);ctx.rotate(a);ctx.beginPath();ctx.moveTo(16,0);ctx.lineTo(-10,-11);ctx.lineTo(-10,11);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    ctx.fillStyle='#fff';ctx.font='bold 12px system-ui,sans-serif';ctx.fillText(Math.round(d)+' m',ex-Math.cos(a)*32,ey-Math.sin(a)*32+4)}}
 ctx.restore()}
function drawDmHud(){const rows=Object.values(DM.sc).sort((a,b)=>b.k-a.k||a.d-b.d).slice(0,6),w=Math.min(W-24,340),x=W/2-w/2;
 ctx.save();ctx.textAlign='left';ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(x,10,w,34+rows.length*18);
 ctx.fillStyle='#ffd23f';ctx.font='bold 14px system-ui,sans-serif';ctx.textAlign='center';ctx.fillText('DEATHMATCH · primo a '+DM_LIMIT+' KILLS',W/2,28);ctx.textAlign='left';ctx.font='13px system-ui,sans-serif';
 rows.forEach((r,i)=>{ctx.fillStyle=r.n==P.name?'#9cf0a2':'#fff';ctx.fillText((i+1)+'. '+r.n,x+14,48+i*18);ctx.textAlign='right';ctx.fillText(r.k+' / '+r.d,x+w-14,48+i*18);ctx.textAlign='left'});ctx.restore()}
// ===== HUD =====
function bar(y,f,col,txt){ctx.fillStyle='#333';ctx.fillRect(22,y,200,16);ctx.fillStyle=col;ctx.fillRect(22,y,200*clamp(f,0,1),16);ctx.fillStyle='#fff';ctx.font='12px system-ui,sans-serif';ctx.textAlign='left';ctx.fillText(txt,28,y+12)}
function drawHud(p){
 ctx.save();ctx.translate(12,12);ctx.scale(HUD_SCALE,HUD_SCALE);ctx.translate(-12,-12);
 ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(12,12,220,132);

 // Barra vita
 bar(22,p.hp/p.hpMax,'#3fae4a','Vita '+Math.max(0,Math.ceil(p.hp))+'/'+p.hpMax);

 // 4 quadratini slot (a destra della vita)
 const slotY=18,slotS=32,slotGap=6,slotX0=248;
 let shIdx=0;   // indice nello array p.shs per le caselle "Scudo"
 for(let i=0;i<4;i++){
  const id=loadout[i],x=slotX0+i*(slotS+slotGap),sel=id&&id[0]=='w'&&+id.slice(1)===p.w;
  // sfondo
  ctx.fillStyle=sel?'#ffd23f':'#2a2a2a';
  ctx.fillRect(x,slotY,slotS,slotS);
  ctx.strokeStyle=sel?'#fff':'#555';
  ctx.lineWidth=sel?2:1;
  ctx.strokeRect(x+.5,slotY+.5,slotS-1,slotS-1);
  
  // ==========================================
  // ICONA STILIZZATA
  // ==========================================
  ctx.save();
  ctx.translate(x+slotS/2, slotY+slotS/2);
  
  // Colore dinamico: rosso per armi, blu per Air, bianco per entrambi (6,7), giallo per Grunt
  let iconCol = '#ff3b3b';
  if(id && id[0] === 'u'){
   iconCol = itemOf(id).col;   // giallo Grunt, blu Air, bianco per tutti (stessa fonte di ITEMS)
  }
  ctx.fillStyle = iconCol;
  ctx.strokeStyle = iconCol;
  ctx.lineWidth = 1.5;

  if(!id){
   // Slot vuoto: trattino neutro
   ctx.fillStyle = '#888';
   ctx.strokeStyle = '#888';
   ctx.beginPath(); ctx.moveTo(-4,0); ctx.lineTo(4,0); ctx.stroke();
  }else if(id[0]==='w'){
   const wi = +id.slice(1);
   
   if(wi===0){ 
    // 1. MITRAGLIA: 3 proiettili allineati
    for(let pr = -1; pr <= 1; pr++){
     ctx.save();
     ctx.translate(0, pr * 7);
     ctx.beginPath();
     ctx.roundRect(-5, -2, 10, 4, 2);
     ctx.fill();
     ctx.restore();
    }
   }else if(wi===1){ 
    // 2. CANNONE: 1 mirino (cerchio con croce)
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-11, 0); ctx.lineTo(11, 0);
    ctx.moveTo(0, -11); ctx.lineTo(0, 11);
    ctx.stroke();
   }else if(wi===2){ 
    // 3. LANCIAFIAMME: Una fiamma stilizzata
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.bezierCurveTo(6, -3, 7, 5, 0, 9);
    ctx.bezierCurveTo(-7, 5, -6, -3, 0, -9);
    ctx.fill();
   }else if(wi===3){ 
    // 4. LANCIAMISSILI: Pallino centrale con raggi intorno (esplosione)
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, TAU);
    ctx.fill();
    for(let r = 0; r < 8; r++){
     const angle = r * Math.PI / 4;
     ctx.beginPath();
     ctx.moveTo(Math.cos(angle) * 5, Math.sin(angle) * 5);
     ctx.lineTo(Math.cos(angle) * 9, Math.sin(angle) * 9);
     ctx.stroke();
    }
   }else if(wi===4){ 
    // 5. SHOTGUN: Un cono di colpi a ventaglio
    ctx.beginPath();
    ctx.arc(-6, 0, 2, -Math.PI/2, Math.PI/2);
    ctx.fill();
    for(let s = -1; s <= 1; s++){
     ctx.beginPath();
     ctx.arc(6, s * 7, 2, 0, TAU);
     ctx.fill();
     ctx.beginPath();
     ctx.moveTo(-4, 0);
     ctx.lineTo(6, s * 7);
     ctx.stroke();
    }
   }
  }else if(id[0]==='u'){
   const im = upImg(itemOf(id));   // lo stesso disegno (campo ic) della schermata di selezione
   if(im.complete && im.naturalWidth) ctx.drawImage(im, -10, -10, 20, 20);
  }
  ctx.restore();

 // Scudo in questa casella: cerchio di ricarica DENTRO lo slot
 if(id==='u:shield' && p.shs && shIdx < p.shs.length){
  const t=p.shs[shIdx++], cx=x+slotS/2, cy=slotY+slotS/2, R=12;
  ctx.lineWidth=7.5;
  ctx.strokeStyle='#223140';
  ctx.beginPath(); ctx.arc(cx,cy,R,0,TAU); ctx.stroke();
  // arco di avanzamento (pieno quando t<=0 = scudo carico)
  ctx.strokeStyle='#0066ff';
  ctx.beginPath();
  ctx.arc(cx,cy,R,-Math.PI/2,-Math.PI/2+clamp(1-t/SHIELD_T,0,1)*TAU);
  ctx.stroke();
  if(t<=0){
   ctx.fillStyle='rgba(0,102,255,.35)';
   ctx.beginPath(); ctx.arc(cx,cy,R-4,0,TAU); ctx.fill();
  }
 }
}

 

  // Barra munizioni
 {const W0=WEAPONS[p.w],ws=p.ws[p.w],rl=ws.rl>0,f=rl?1:ws.a/W0.mag;
  bar(48,f,rl?(Math.floor(performance.now()/150)%2?'#9a9a9a':'#555'):'#d9534f',W0.n+' '+ws.a+'/'+W0.mag);
  if(W0.cd>=1&&ws.cd>0){ctx.fillStyle='#ffd23f';ctx.fillRect(22,61,200*clamp(1-ws.cd/W0.cd,0,1),3)}}

 // Barra scatto
 bar(68,1-p.dc/(DASH_CD*p.dcm),'#8b5cf6','Scatto · mischia');

 // Modalità e info
 ctx.fillStyle='#fff';ctx.font='14px system-ui,sans-serif';ctx.textAlign='left';
 ctx.fillText('Modalità: '+(p.air?'AIR':'GRUNT')+(NET.on&&NET.host?'  ·  '+NET.code:''),22,100);
 ctx.fillText((G.mode==1?'Bot: ':'Nemici: ')+units.length+'  ·  diff: '+G.diff+(M.profile?'  ·  '+M.profile:'')+(NET.on?'  ·  Giocatori: '+(1+Object.keys(others).length):''),22,118);
 if(G.mode!=1){   // uccisioni per giocatore (singolo e multiplayer)
  const L=[p,...Object.values(others)].sort((a,b)=>(b.kills|0)-(a.kills|0));
  ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(12,150,220,10+L.length*18);ctx.font='13px system-ui,sans-serif';
  L.forEach((q,i)=>{ctx.fillStyle=q===p?'#9cf0a2':'#fff';ctx.textAlign='left';ctx.fillText((q.name||'Pilota').slice(0,12),22,168+i*18);ctx.textAlign='right';ctx.fillText('KILLS: '+(q.kills|0),222,168+i*18)});ctx.textAlign='left'}
 ctx.restore();
 // contatore FPS: verde ≥ 28, giallo ≥ 20, rosso sotto
 ctx.font='bold 13px system-ui,sans-serif';ctx.textAlign='right';ctx.fillStyle=G.fps>=28?'#7dff8a':G.fps>=20?'#ffd23f':'#ff6a5a';ctx.fillText(Math.round(G.fps)+' FPS',W-15,20);ctx.textAlign='center';ctx.font='14px system-ui,sans-serif'}

// ===== DISEGNO JOYSTICK E PULSANTI TOUCH =====
function drawTouchControls(){
  if(typeof TOUCH === 'undefined' || !TOUCH.active || G.over || !G.started) return;
  ctx.save();

  // 1. Joystick Sinistro (Movimento)
  if(TOUCH.left.active){
    const jx = TOUCH.left.x0, jy = TOUCH.left.y0;
    const kx = TOUCH.left.x, ky = TOUCH.left.y;
    const dx = kx - jx, dy = ky - jy, d = Math.hypot(dx, dy), maxR = 55;
    const knobX = jx + (d > maxR ? (dx / d) * maxR : dx);
    const knobY = jy + (d > maxR ? (dy / d) * maxR : dy);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath(); ctx.arc(jx, jy, maxR, 0, TAU); ctx.fill(); ctx.stroke();

    ctx.fillStyle = 'rgba(63, 174, 74, 0.65)';
    ctx.beginPath(); ctx.arc(knobX, knobY, 24, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  }

  // 2. Tap-to-aim: feedback sul punto toccato (cerchietto + linea tratteggiata dal mech)
  if(TOUCH.aim.active || TOUCH.lock){
    const ax = TOUCH.lock ? TOUCH.lock.x : TOUCH.aim.x, ay = TOUCH.lock ? TOUCH.lock.y : TOUCH.aim.y;   // bersaglio agganciato (assist/AUTO) o punto toccato
    const psx = (P.x - camX) * zoom, psy = (P.y - camY) * zoom;
    // linea tratteggiata dal mech al puntatore
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(psx, psy); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.setLineDash([]);
    // cerchietto bersaglio
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ax, ay, 18, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(ax, ay, 6, 0, TAU); ctx.stroke();
    // puntino centrale
    ctx.fillStyle = 'rgba(255, 60, 60, 0.9)';
    ctx.beginPath(); ctx.arc(ax, ay, 2.5, 0, TAU); ctx.fill();
  }

  // 3. Pulsanti Tattici semi-trasparenti
  if(typeof updateTouchButtons === 'function') updateTouchButtons();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for(const b of TOUCH.btns){
    ctx.fillStyle = 'rgba(15, 22, 15, 0.55)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
    if(b.on){ ctx.fillStyle = b.col; ctx.globalAlpha = .28; ctx.fill(); ctx.globalAlpha = 1; }   // pulsante attivo (AUTO, camera bloccata)
    ctx.strokeStyle = b.col;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold ' + Math.round(Math.min(13, b.r*.42)) + 'px system-ui,sans-serif';   // testo proporzionato al pulsante
    ctx.fillStyle = b.col;
    ctx.fillText(b.label, b.x, b.y);
  }

  ctx.restore();
}
function drawCrosshair(){const p=P,w=WEAPONS[p.w],inR=Math.hypot(mx/zoom+camX-p.x,my/zoom+camY-p.y)<=w.range&&(!p.air||Math.abs(ad(p.aim,p.h))<=p.qa),rlT=w.reload*(p.air?1:p.rlm),ws=p.ws[p.w],rlOn=ws.rl>0&&rlT>0;
// lanciarazzi (w.ex>0): anello sottile al raggio reale dell'esplosione — rosso se in gittata, bianco se fuori (come il cerchietto)
 if(w.ex>0){ctx.lineWidth=1.5;ctx.strokeStyle=inR?'rgba(255,59,59,.55)':'rgba(255,255,255,.55)';ctx.beginPath();ctx.arc(mx,my,w.ex*zoom,0,TAU);ctx.stroke()}
 ctx.lineWidth=6;ctx.strokeStyle='#000';ctx.beginPath();ctx.arc(mx,my,9,0,TAU);ctx.stroke();
 if(rlOn){ctx.lineWidth=4;ctx.strokeStyle='#5a5a5a';ctx.beginPath();ctx.arc(mx,my,9,0,TAU);ctx.stroke();ctx.strokeStyle='#ffc400';ctx.beginPath();ctx.arc(mx,my,9,-Math.PI/2,-Math.PI/2+clamp(1-ws.rl/rlT,0,1)*TAU);ctx.stroke()}
 else{ctx.lineWidth=4;ctx.strokeStyle=inR?'#ff3b3b':'#fff';ctx.beginPath();ctx.arc(mx,my,9,0,TAU);ctx.stroke()}
 ctx.beginPath();ctx.arc(mx,my,2.5,0,TAU);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle='#000';ctx.stroke()}
// ===== nave spaziale che decolla (missione 7): bacino vuoto + scafo che sale, ingrandisce e accelera verso la prua =====
function drawShip(){if(!SH.on)return;const o=SH.o,t=SH.t,u=clamp((t-SH_LIFT)/SH_FLY,0,1),k=u*u,x=SH.x+Math.cos(SH.a)*k*3200,y=SH.y+Math.sin(SH.a)*k*3200,sc=1+u*1.8;
 if(t<SH_LIFT)return;                                           // prima del decollo lo scafo è ancora l'edificio normale
 const gh={shape:'cruiser',x:SH.x,y:SH.y,w:o.w,h:o.h,a:SH.a,v:0,id:o.id,pr:[],hp:1,m:1};
 ctx.save();ctx.globalAlpha=1;drawSpecial({...gh,gone:1},1,1);   // bacino vuoto
 ctx.translate(SH.x+u*150,SH.y+u*220);ctx.rotate(SH.a);ctx.fillStyle='rgba(0,0,0,'+.28*(1-u)+')';ctx.fillRect(-o.w*.45,-o.h*.36,o.w*.9,o.h*.72);ctx.restore();   // ombra a terra che si stacca
 ctx.save();ctx.translate(x,y);ctx.scale(sc,sc);ctx.translate(-x,-y);drawSpecial({...gh,x,y,fl:1},1,1);
 ctx.translate(x,y);ctx.rotate(SH.a);                           // fiamme dei 4 motori
 for(const ty of[-.4,-.14,.14,.4]){ctx.fillStyle='rgba(143,227,255,'+(.35+.3*Math.random())+')';ctx.beginPath();ctx.ellipse(-o.w*.46-18,ty*o.h/2,10+22*u,6,0,0,TAU);ctx.fill()}
 ctx.restore()}
// ===== esplosione nucleare: lampo bianco crescente → bianco pieno → velo di polvere grigio/marrone all'80% =====
function drawNuke(){if(!NK.on)return;const t=NK.t,c=ctx;c.save();
 if(t<NK_GROW){const u=t/NK_GROW,sx=(NK.x-camX)*zoom,sy=(NK.y-camY)*zoom,R=Math.max(1,Math.hypot(W,H)*1.3*u*u),g=c.createRadialGradient(sx,sy,0,sx,sy,R);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.7,'rgba(255,250,235,.95)');g.addColorStop(1,'rgba(255,240,200,0)');
  c.fillStyle=g;c.fillRect(0,0,W,H);c.fillStyle='rgba(255,255,255,'+u*u*u+')';c.fillRect(0,0,W,H)}   // dal punto zero verso tutto lo schermo
 else{const f=clamp((t-NK_GROW-NK_HOLD)/NK_FADE,0,1),e=f*f*(3-2*f),
  r=Math.round(255+(122-255)*e),gg=Math.round(255+(111-255)*e),b=Math.round(255+(98-255)*e),a=1+(.8-1)*e;   // bianco → (122,111,98) con alpha 1 → .8
  c.fillStyle='rgba('+r+','+gg+','+b+','+a+')';c.fillRect(0,0,W,H)}
 c.restore()}
// esplosioni nucleari della missione 9: lampi sull'orizzonte, oltre il bordo dello schermo (fuori mappa), in tutte le direzioni
function drawTdNuke(){if(!TN.on)return;const c=ctx;c.save();let veil=0;
 for(const f of TN.f){if(!f.s)continue;const u=(TN.t-f.t0)/1.4;if(u>=1)continue;
  const sx=W/2+Math.cos(f.a)*W*.55,sy=H/2+Math.sin(f.a)*H*.55,R=Math.hypot(W,H)*(.25+.55*u),g=c.createRadialGradient(sx,sy,0,sx,sy,R);
  g.addColorStop(0,'rgba(255,255,255,'+(1-u)+')');g.addColorStop(.6,'rgba(255,240,200,'+.5*(1-u)+')');g.addColorStop(1,'rgba(255,240,200,0)');
  c.fillStyle=g;c.fillRect(0,0,W,H);veil=Math.max(veil,.35*(1-u)*(1-u))}
 if(veil>0){c.fillStyle='rgba(255,255,255,'+veil+')';c.fillRect(0,0,W,H)}
 c.restore()}
// ===== ciclo di disegno =====
function draw(ldt){
 const p=P;
 if(!p || W<2 || H<2 || !isFinite(zoom) || zoom<0.05 || !isFinite(camX) || !isFinite(camY)){
   zoom=1; camX=p ? p.x : 0; camY=p ? p.y : 0;
   return;
 }
 const VW=W/zoom, VH=H/zoom; frameNo++; chBudget=G.q>=1?2:1; bakePrefetch(camX,camY,camX+VW,camY+VH);
 ctx.fillStyle=G.noBg?'#14052e':'#0b0f0b'; ctx.fillRect(0,0,W,H);
 ctx.save();
 
 try {
   ctx.scale(zoom, zoom);
   ctx.translate(-camX, -camY);

   // 1. Disegno Terrain Chunks
   if(!G.noBg){
     for(let cx=Math.max(0,Math.floor(camX/CH)),ex=Math.min(Math.ceil(WW/CH)-1,Math.floor((camX+VW)/CH));cx<=ex;cx++) {
       for(let cy=Math.max(0,Math.floor(camY/CH)),ey=Math.min(Math.ceil(WH/CH)-1,Math.floor((camY+VH)/CH));cy<=ey;cy++){
         const c=chunkGet(cx,cy);
         if(c) ctx.drawImage(c, cx*CH, cy*CH, CH+1, CH+1);   // +1 px: nessuna cucitura tra i blocchi
         else { ctx.fillStyle=LVL_COL[1]; ctx.fillRect(cx*CH, cy*CH, CH, CH); }
       }
     }
   }

   // 1b. Crateri (sotto il sangue), schiuma in acqua, poi civili e macchie di sangue (sotto il velo di nebbia)
   craterDraw();
   foamDraw();
   civDraw();

   // 2. Nebbia di guerra
   if(G.fog > .02 && p.x != null && p.y != null){
     try {
       const n = visCalc(p, VW, VH);
       ctx.fillStyle = 'rgba(8,12,8,' + (.85 * G.fog) + ')';
       ctx.beginPath();
       ctx.rect(camX - 50, camY - 50, VW + 100, VH + 100);
       for(let i = 0; i < n; i++){
         const a = AN[i], d = VD[i], x = p.x + Math.cos(a)*d, y = p.y + Math.sin(a)*d;
         if(isFinite(x) && isFinite(y)) { i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
       }
       ctx.closePath();
       ctx.fill('evenodd');
     } catch(err) { visLive = []; }
   } else {
     visLive = [];
   }

   // 3. Ostacoli, Alberi, Edifici
   drawObstacles(VW, VH, zoom, ldt);
   drawMissionWorld();

   // 4. Unità e Nemici a terra
   const inView = o => o && o.x > camX-90 && o.x < camX+VW+90 && o.y > camY-90 && o.y < camY+VH+90;
   for(const t of units) { if(t && !t.z && inView(t)) drawUnit(t, ldt); }

   // 5. Giocatore e altri player (Grunt)
   if(p.hp > 0 && !p.air && !dsHides(p.id)) mech(p, 0, false);
   for(const q of Object.values(others)){ if(q && q.hp > 0 && !q.air && !dsHides(q.id)) { mech(q, 0, false); nameTag(q); } }

   // Mech incapacitati (cooperativa in rete)
   if(NET.on&&G.mode!=1)for(const q of[p,...Object.values(others)]){if(q&&q.hp<=0&&inView(q))downedFx(q)}

   // Dropship intro: già sullo spawn, gira e se ne va (disegnata SOPRA i player)
   if(typeof DS!=='undefined'&&DS.on){
     for(const s of DS.ships){
       if(s.done||s.t<0)continue;
       if(s.x>camX-200&&s.x<camX+VW+200&&s.y>camY-200&&s.y<camY+VH+200)
         drawDropship(s.x,s.y,s.h,s.ci);
     }
   }

   drawShip();

   // 6. Proiettili — ALLEATI (missione 8) in blu chiaro, NEMICI in rosso, giocatori in giallo/arancio
   ctx.globalAlpha = 1;
   for(const b of bullets){
     if(!b || !isFinite(b.x) || !isFinite(b.y)) continue;
     if(b.o >= 1000 && !seen(b.x, b.y, b.fly)) continue;
     const hv = b.o < 1000 && b.dmg >= 20;
     // b.sec = 1 → guardia alleata della missione 8 (impostato in mkBullet/AGweapons.js)
     ctx.fillStyle = b.sec ? '#7fd0ff' : b.o >= 1000 ? '#ff5a4a' : hv ? '#ffa21a' : '#ffe14d';
     circle(b.x, b.y, b.o >= 1000 ? (b.dmg > 12 ? 6 : 4) : hv ? 6 : 3);
   }

   // 7. Altri player (Air)
   for(const q of Object.values(others)){ if(q && q.hp > 0 && q.air) { mech(q, 12, true); mech(q, 0, false); nameTag(q); } }

   // 8. Giocatore (Air)
   if(p.hp > 0 && p.air){
     ctx.fillStyle = 'rgba(255,230,120,.12)';
     ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.arc(p.x, p.y, 320, p.h - p.qa, p.h + p.qa); ctx.closePath(); ctx.fill();
     mech(p, 12, true); mech(p, 0, false);
   }

   // 9. Unità volanti
   for(const t of units) { if(t && t.z && inView(t)) drawUnit(t, ldt); }

   // 10. Effetti mischia e particelle
   for(const sl of slashes) drawSlash(sl);
   fxDraw(ctx);

   // 11. Laser mira e pallino gittata massima
   if(G.laser && p.hp > 0 && !(p.air && Math.abs(ad(p.aim, p.h)) > p.qa)){
     const cx = Math.cos(p.fa), cy = Math.sin(p.fa);
     const maxR = WEAPONS[p.w].range;
     
     // Distanza del puntatore del mouse dal mech
     const tx = mx/zoom + camX, ty = my/zoom + camY;
     const dist = Math.hypot(tx - p.x, ty - p.y);
     
     // Calcoliamo i punti proiettandoli perfettamente dritti lungo la mira (p.fa)
     const targetX = p.x + cx * dist, targetY = p.y + cy * dist;
     const maxX = p.x + cx * maxR, maxY = p.y + cy * maxR;

     ctx.lineWidth = 0.75;
     
     if (dist > maxR) {
       // 1a. Dal mech alla gittata max: rosso continuo
       ctx.strokeStyle = 'rgba(255,0,0,.65)';
       ctx.beginPath(); ctx.moveTo(p.x + cx*28, p.y + cy*28); ctx.lineTo(maxX, maxY); ctx.stroke();
       
       // 1b. Dalla gittata max al mouse: bianco tratteggiato
       ctx.strokeStyle = 'rgba(255,255,255,.5)';
       ctx.setLineDash([5, 5]);
       ctx.beginPath(); ctx.moveTo(maxX, maxY); ctx.lineTo(targetX, targetY); ctx.stroke();
       ctx.setLineDash([]); // Resetta il tratteggio
     } else {
       // 2a. Dal mech al mouse (che è vicino): rosso continuo
       ctx.strokeStyle = 'rgba(255,0,0,.65)';
       ctx.beginPath(); ctx.moveTo(p.x + cx*28, p.y + cy*28); ctx.lineTo(targetX, targetY); ctx.stroke();
       
       // 2b. Dal mouse alla gittata max: bianco tratteggiato
       ctx.strokeStyle = 'rgba(255,255,255,.5)';
       ctx.setLineDash([5, 5]);
       ctx.beginPath(); ctx.moveTo(targetX, targetY); ctx.lineTo(maxX, maxY); ctx.stroke();
       ctx.setLineDash([]); // Resetta il tratteggio
     }

     // 3. Pallino rosso alla gittata massima
     ctx.fillStyle = 'rgba(255,40,40,0.9)';
     ctx.beginPath(); ctx.arc(maxX, maxY, 3.5, 0, TAU); ctx.fill();
   }

// 12. Bordo mappa: rettangolo rosso tratteggiato sul perimetro del mondo (sempre visibile, anche sopra la nebbia)
   {
     const dashOn = 18/zoom, dashOff = 14/zoom, lw = 4/zoom, halo = 3/zoom;
     ctx.save();
     ctx.setLineDash([dashOn, dashOff]);
     // alone scuro per contrasto (sotto)
     ctx.strokeStyle = 'rgba(0,0,0,.6)';
     ctx.lineWidth = lw + halo*2;
     ctx.strokeRect(0, 0, WW, WH);
     // linea rossa tratteggiata (sopra)
     ctx.strokeStyle = 'rgba(230,40,40,.92)';
     ctx.lineWidth = lw;
     ctx.strokeRect(0, 0, WW, WH);
     ctx.restore();
   }

 } catch(e){
   console.warn('Recovered from non-fatal render exception:', e);
 } finally {
   ctx.restore();
 }
 if(!G.noBg){rainDraw();snowDraw();sandstormDrawOverlay()}   // pioggia/neve (screen-space) + velo sabbia uniforme; nascoste in visuale termica
 if(G.noBg){ctx.save();ctx.globalCompositeOperation='overlay';ctx.fillStyle='rgba(255,80,0,.55)';ctx.fillRect(0,0,W,H);ctx.restore()}
 drawNuke();drawTdNuke();
 drawHud(p);
 ctx.save();
 ctx.font='13px system-ui,sans-serif'; // Stessa dimensione del testo dell'HUD in alto a sinistra
 const txt=MOBILE?(G.t<25?'Sx: muovi · Dx: tocca/trascina per mirare e sparare · AUTO: mira da sola · ZOOM: ingrandisce':''):'WASD muovi · Shift scatto · Sx spara · Dx fendente · R ricarica · 1-4 arma · Spazio Grunt/Air · B radar termico · F centra camera · O schermo intero';
 const tw=ctx.measureText(txt).width+24, th=24;
 ctx.fillStyle='rgba(0,0,0,.35)'; // Stessa trasparenza (0.35) dell'HUD in alto a sinistra
 if(txt)ctx.fillRect(W/2-tw/2, H-32, tw, th);
 ctx.fillStyle='#fff';
 ctx.textAlign='center';
 ctx.textBaseline='middle';
 if(txt)ctx.fillText(txt, W/2, H-20);
 ctx.restore();
 if(G.mode==1)drawDmHud();else if(G.mt||MS.ex)drawMissionHud(p);
 ctx.fillStyle='#fff';
 if(G.msgT>0){ctx.font='bold 18px system-ui,sans-serif';ctx.fillText(G.msg,W/2,116)}
 if(ARM.near&&!G.menu){const t=MOBILE?'ARMERIA: tocca ARM':'ARMERIA: premi R per cambiare armi e upgrade';ctx.font='bold 17px system-ui,sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#000';ctx.strokeText(t,W/2,H-62);ctx.fillStyle='#7dff8a';ctx.fillText(t,W/2,H-62)}
 if(p.hp<=0&&!G.over){ctx.font='bold 22px system-ui,sans-serif';ctx.fillText(G.mode==1?'Mech distrutto, rientro in corso…':NET.on?'Mech incapacitato: un alleato deve restarti accanto per rialzarti':'',W/2,H/2)}
 if(G.over){ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(0,0,W,H);ctx.fillStyle='#fff';ctx.font='bold 30px system-ui,sans-serif';ctx.fillText(G.over==2?(G.overMsg||'Vittoria!'):(G.overMsg||'Mech distrutto'),W/2,H/2-8);
  ctx.font='16px system-ui,sans-serif';ctx.fillText(NET.on&&!NET.host?'In attesa dell’host…':(MOBILE?'Tocca lo schermo per ricominciare':'Premi R per ricominciare'),W/2,H/2+24)}
 drawTouchControls();
 if(p.hp>0&&!G.ext&&(!MOBILE||TOUCH.aim.active||TOUCH.lock))drawCrosshair()}   // touch: solo con dito sulla mira o bersaglio agganciato   // estrazione in corso (o conclusa): niente mirino, in tutte le missioni

// ===== pioggia: gocce screen-space (indipendenti dal mondo, un solo stroke() per tutte) =====
function rainInit(){WX.drops.length=0;const n=(typeof MOBILE!=='undefined'&&MOBILE)?110:200;
 for(let i=0;i<n;i++)WX.drops.push({x:Math.random()*W,y:Math.random()*H,len:10+Math.random()*14,spd:600+Math.random()*500})}
function rainUpdate(dt){if(!WX.rain)return;if(!WX.drops.length)rainInit();
 const tilt=WX.wind*.35;
 for(const d of WX.drops){d.y+=d.spd*dt;d.x+=d.spd*dt*tilt;
  if(d.y>H+20){d.y=-20;d.x=Math.random()*W}else if(d.x>W+20)d.x-=W+40;else if(d.x<-20)d.x+=W+40}}
function rainDraw(){if(!WX.rain||!WX.drops.length)return;
 ctx.save();ctx.strokeStyle='rgba(190,215,235,.42)';ctx.lineWidth=1.3;ctx.lineCap='round';ctx.beginPath();
 const tilt=WX.wind*.35;
 for(const d of WX.drops){ctx.moveTo(d.x,d.y);ctx.lineTo(d.x-d.len*tilt,d.y-d.len)}
 ctx.stroke();ctx.restore()}
// ===== neve: fiocchi screen-space (caduta lenta, oscillazione laterale, dimensione correlata alla velocità) =====
function snowInit(){WX.flakes.length=0;const n=(typeof MOBILE!=='undefined'&&MOBILE)?90:160;
 for(let i=0;i<n;i++){const r=1.1+Math.random()*2.4;WX.flakes.push({x:Math.random()*W,y:Math.random()*H,r,spd:45+r*28,ph:Math.random()*TAU,sw:.6+Math.random()*1.4})}}
function snowUpdate(dt){if(!WX.snow)return;if(!WX.flakes.length)snowInit();WX.t+=dt;
 for(const f of WX.flakes){f.y+=f.spd*dt;f.x+=(Math.sin(WX.t*f.sw+f.ph)*55+WX.wind*40)*dt;
  if(f.y>H+20){f.y=-20;f.x=Math.random()*W}else if(f.x>W+20)f.x-=W+40;else if(f.x<-20)f.x+=W+40}}
function snowDraw(){if(!WX.snow||!WX.flakes.length)return;
 ctx.save();ctx.fillStyle='rgba(240,248,255,.82)';ctx.beginPath();
 for(const f of WX.flakes){ctx.moveTo(f.x+f.r,f.y);ctx.arc(f.x,f.y,f.r,0,TAU)}
 ctx.fill();ctx.restore()}

// ===== tempesta di sabbia: effetto interamente SCREEN-SPACE =====
// Non dipende da camera né da zoom: rimane fisso sullo schermo.
// Componenti: (1) velo sabbia uniforme, (2) macchie informi sfumate marroncino sabbia che scorrono lentamente.
// Ogni macchia è un poligono irregolare (vertici a raggio variabile, bordi morbidi con curve quadratiche)
// riempito da un gradiente radiale: il bordo irregolare sfuma nel trasparente, senza contorni netti.
const SAND_BLOBS=[];
function sandInit(){
 SAND_BLOBS.length=0;
 const isMobile=(typeof MOBILE!=='undefined'&&MOBILE);
 const n=isMobile?8:13;
 for(let i=0;i<n;i++){
  // forma: 10–14 vertici con raggi variabili (0.65..1.15 del raggio base) → bordo irregolare
  const nv=10+((Math.random()*5)|0),verts=[];
  for(let k=0;k<nv;k++)verts.push(0.65+Math.random()*0.5);
  SAND_BLOBS.push({
   x:Math.random(),                       // posizione (frazioni di W,H)
   y:Math.random(),
   r:0.10+Math.random()*0.14,             // raggio base (frazione di max(W,H))
   vx:-0.03-Math.random()*0.05,           // drift verso sinistra (frazioni W/s)
   vy:0.005+Math.random()*0.02,           // lieve caduta
   //a:0.14+Math.random()*0.16,             // alpha al centro (0.14–0.30) (OLD)
   a:0.22+Math.random()*0.20,             // alpha al centro (0.22–0.42)
   ph:Math.random()*TAU,                  // fase
   rot:0.05+Math.random()*0.10,           // velocità di rotazione della forma
   pulse:0.08+Math.random()*0.08,         // ampiezza pulsazione del raggio
   ps:0.6+Math.random()*0.6,              // velocità pulsazione
   verts
  });
 }
}
function sandstormUpdate(dt){
 if(!WX.sand)return;
 if(!SAND_BLOBS.length)sandInit();
 WX.t+=dt;                                // solo il tempo: nessuna dipendenza da camera o zoom
 for(const b of SAND_BLOBS){
  b.x+=b.vx*dt;b.y+=b.vy*dt;
  if(b.x<-.3)b.x+=1.6;                    // wrap orizzontale
  if(b.y>1.3)b.y-=1.6;                    // wrap verticale (ricompaiono in alto)
 }
}
function sandstormDrawOverlay(){
 if(!WX.sand)return;
 ctx.save();
 // 1. velo sabbia uniforme (due strati, come la nebbia corposa)
 ctx.fillStyle='rgba(190,148,80,.34)';
 ctx.fillRect(0,0,W,H);
 ctx.fillStyle='rgba(230,200,130,.13)';
 ctx.fillRect(0,0,W,H);
 // 2. macchie informi sfumate, in movimento
 if(SAND_BLOBS.length){
  const M=Math.max(W,H);
  for(const b of SAND_BLOBS){
   const cx=b.x*W, cy=b.y*H;
   const puls=1+b.pulse*Math.sin(WX.t*b.ps+b.ph);
   const R=b.r*M*puls;
   const rot=WX.t*b.rot+b.ph;
   // path a poligono irregolare con bordi morbidi (curve quadratiche sui punti medi)
   const nv=b.verts.length,pts=[];
   for(let k=0;k<nv;k++){
    const ang=(k/nv)*TAU+rot,rad=R*b.verts[k];
    pts.push([cx+Math.cos(ang)*rad,cy+Math.sin(ang)*rad]);
   }
   ctx.beginPath();
   const last=pts[nv-1];
   ctx.moveTo((last[0]+pts[0][0])/2,(last[1]+pts[0][1])/2);
   for(let k=0;k<nv;k++){
    const p=pts[k],q=pts[(k+1)%nv];
    ctx.quadraticCurveTo(p[0],p[1],(p[0]+q[0])/2,(p[1]+q[1])/2);
   }
   ctx.closePath();
   // gradiente radiale marroncino sabbia: pieno al centro, trasparente a R
   const g=ctx.createRadialGradient(cx,cy,0,cx,cy,R);
   g.addColorStop(0,   `rgba(210,168,96,${b.a.toFixed(3)})`);
   g.addColorStop(0.55,`rgba(200,158,88,${(b.a*0.55).toFixed(3)})`);
   g.addColorStop(1,   'rgba(180,140,70,0)');
   ctx.fillStyle=g;
   ctx.fill();
  }
 }
 ctx.restore();
}