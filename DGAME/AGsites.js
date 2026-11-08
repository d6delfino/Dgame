'use strict';
/* AIRGRUNT · AGsites.js
   1) edifici SPECIALI SOLIDI: container, silos, serbatoi, ciminiere, gru, navi, piattaforme. Sono edifici veri
      (collidono, bloccano vista e colpi, si distruggono) ma hanno forma e disegno propri.
   2) costruttori dei SITI TEMATICI: quartieri urbani a più griglie, complessi industriali, porti, basi militari, ville, fattorie.
   Ogni costruttore NON disegna nulla di piatto: mette in M.flat solo i dati di ciò che finirà nell'immagine di sfondo (vedi AGdecor.js);
   gli oggetti "reali" (edifici, muri, alberi) vanno in M.obs tramite il kit K che arriva da genMap (AGmap.js). */
// palette in più (più cupe, da città cyberpunk): indici 13..16
BPAL.push(['#2b2f3a','#3d4454'],['#2a2538','#41395a'],['#1f3a3f','#2f5c63'],['#3a2a2f','#5a3f48'],
 // nuove, indici 17..28: terracotta, blu, oliva, ocra, prugna, grafite, cemento, verde, ruggine, petrolio, crema, viola
 ['#6b3f2a','#9a5b3c'],['#2e4a6b','#4a79a8'],['#5a6b2e','#86a047'],['#7a6a3a','#b39d55'],['#6b2e4a','#a14d79'],['#3a3a3a','#5c5c5c'],
 ['#8a8f96','#b4b9c0'],['#2f5a3a','#4f8f63'],['#7a3a2a','#c0583a'],['#2a4a52','#3f7f8c'],['#a8a08a','#d2c9ae'],['#5a4a7a','#8a77b8']);
const PAL_ALL=[0,1,2,3,4,5,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28];
const PAL_CITY=[0,1,2,3,4,5,13,14,15,16,13,14,15,17,18,19,20,21,22,23,24,25,26,27,28],PAL_IND=[0,2,3,4,13,22,23,25],BTOWN=['rect','square','rect','L','T','cross','oct','hex','circle','U','H','Z','tower','quad','fact','U','rect'];
const SPEC={cont:300,silo:650,tank:520,crane:420,ship:1400,plat:1800,stack:380,cruiser:2800,hatch:900,radar:1100};   // vita di base dei tipi speciali
const CONT_COL=['#c0392b','#2e86c1','#d4ac0d','#27ae60','#7f8c8d','#e67e22','#8e44ad','#16a085','#d9dde0','#34495e'];
// geometria: forme speciali (le altre le gestisce bgeom di AGutil.js)
function bgeomEx(sh,w,h){const P=prim;let pr;
 switch(sh){
  case'cont':case'plat':pr=[P('r',0,0,w/2,h/2)];break;
  case'silo':{const n=Math.max(1,Math.round(w/h)),r=h/2;pr=[];for(let i=0;i<n;i++)pr.push(P('c',(i-(n-1)/2)*h,0,r));break}
  case'tank':case'stack':pr=[P('c',0,0,Math.min(w,h)/2)];break;
  case'crane':{const a=w/2,b=h/2;pr=[P('r',-(a-b),0,b,b),P('r',a-b,0,b,b)];break}      // due zampe: in mezzo si passa, la trave è sopra
  case'ship':{const a=w/2,b=h/2,k=Math.min(a*.5,b*2.2);pr=[P('g',0,0,0,0,0,[[-a,-b],[a-k,-b],[a,0],[a-k,b],[-a,b]])];break}
  case'cruiser':{const a=w/2,b=h/2;pr=[P('r',a*.65,0,a*.25,b*.7),P('r',0,0,a*.5,b*.35),P('r',-a*.15,0,a*.25,b*.95),P('r',-a*.7,0,a*.22,b*.6)];break}
  case'hatch':pr=[P('r',0,0,w/2,h/2)];break;   // portello silo ICBM
  case'radar':{const r=Math.min(w,h)/2;pr=[P('c',0,0,r),P('r',0,r*.55,r*.18,r*.55)];break}   // parabola + supporto
  default:return bgeom(sh,w,h)}
 return geom(pr)}

// ===== disegno degli edifici speciali (dinamico: si danneggiano e crollano come gli altri) =====
function drawSpecial(o,f,lod){const c=ctx,t=o.shape,hw=o.w/2,hh=o.h/2,v=o.v|0;c.save();c.translate(o.x,o.y);c.rotate(o.a);
 const big=t=='crane'||t=='plat'||t=='ship';c.save();c.translate(big?8:5,big?12:7);c.fillStyle='rgba(0,0,0,.3)';for(const q of o.pr){qpath(c,q,0);c.fill()}c.restore();
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
 else if(t=='ship'){const vs=o.pr[0].vs,hull=['#2f3c48','#7a2d27','#5a6670'][v%3],deck=['#4c5b69','#a45a3a','#7f8c96'][v%3];
  c.beginPath();vs.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();c.fillStyle='#000';c.fill();c.lineWidth=5;c.strokeStyle='#000';c.stroke();c.fillStyle=hull;c.fill();
  c.beginPath();vs.forEach((p,i)=>i?c.lineTo(p[0]*.9,p[1]*.72):c.moveTo(p[0]*.9,p[1]*.72));c.closePath();c.fillStyle=deck;c.fill();
  const a=hw*.9,b=hh*.7;
  if(v==0){for(let i=0;i<7;i++)for(let j=-1;j<=1;j+=2){c.fillStyle=CONT_COL[(o.id+i*3+j+9)%CONT_COL.length];c.fillRect(-a*.55+i*a*.17,j<0?-b*.84:b*.08,a*.15,b*.74)}}
  else if(v==1){c.fillStyle='#2b3138';for(let i=0;i<5;i++){c.beginPath();c.arc(-a*.4+i*a*.2,0,b*.34,0,TAU);c.fill()}c.strokeStyle='#d0d6da';c.lineWidth=2;c.beginPath();c.moveTo(-a*.5,0);c.lineTo(a*.5,0);c.stroke()}
  else{c.fillStyle='#38424a';for(const x of[.1,.5]){c.beginPath();c.arc(a*x,0,b*.42,0,TAU);c.fill();c.fillRect(a*x,-3,b*1.1,6)}c.strokeStyle='#cfd8dc';c.lineWidth=2;c.beginPath();c.arc(-a*.35,0,b*.5,0,TAU);c.stroke()}
  c.fillStyle='#e8e4dc';c.fillRect(-hw*.9,-b*.5,a*.3,b);c.fillStyle='#3a6a8a';c.fillRect(-hw*.9+2,-b*.35,5,b*.7);c.fillStyle='#c0392b';c.beginPath();c.arc(-hw*.62,0,b*.22,0,TAU);c.fill()}
 else if(t=='plat'){c.fillStyle='#000';c.fillRect(-hw-2,-hh-2,o.w+4,o.h+4);c.fillStyle='#4d5a66';c.fillRect(-hw,-hh,o.w,o.h);c.fillStyle='#5f6f7d';c.fillRect(-hw+5,-hh+5,o.w-10,o.h-10);
  c.strokeStyle='#e6b422';c.lineWidth=3;c.setLineDash([10,8]);c.strokeRect(-hw+3,-hh+3,o.w-6,o.h-6);c.setLineDash([]);
  c.fillStyle='#37424c';c.beginPath();c.arc(-hw*.4,-hh*.1,Math.min(hw,hh)*.42,0,TAU);c.fill();c.strokeStyle='#fff';c.lineWidth=3;c.beginPath();c.arc(-hw*.4,-hh*.1,Math.min(hw,hh)*.34,0,TAU);c.stroke();
  c.beginPath();c.moveTo(-hw*.4-9,-hh*.1-11);c.lineTo(-hw*.4-9,-hh*.1+11);c.moveTo(-hw*.4+9,-hh*.1-11);c.lineTo(-hw*.4+9,-hh*.1+11);c.moveTo(-hw*.4-9,-hh*.1);c.lineTo(-hw*.4+9,-hh*.1);c.stroke();
  const dx=hw*.5,dy=-hh*.3,s2=Math.min(hw,hh)*.34;c.fillStyle='#cfd8dc';c.fillRect(dx-s2,dy-s2,s2*2,s2*2);c.strokeStyle='#37424c';c.lineWidth=2;c.strokeRect(dx-s2,dy-s2,s2*2,s2*2);c.beginPath();c.moveTo(dx-s2,dy-s2);c.lineTo(dx+s2,dy+s2);c.moveTo(dx+s2,dy-s2);c.lineTo(dx-s2,dy+s2);c.stroke();
  c.fillStyle='#c0392b';c.beginPath();c.arc(hw*.8,hh*.7,5,0,TAU);c.fill()}
 else if(t=='cruiser'){
  const now=performance.now();
  // 1. Bacino di carenaggio con travi d'acciaio e guide gialle a strisce (non si disegna sulla nave in volo)
  if(!o.fl){
  c.strokeStyle='#21262d';c.lineWidth=14;c.strokeRect(-hw-10,-hh-10,o.w+20,o.h+20);
  c.strokeStyle='#e6b422';c.lineWidth=3;c.setLineDash([16,14]);c.strokeRect(-hw-10,-hh-10,o.w+20,o.h+20);c.setLineDash([]);
  // Passerelle di servizio estensibili
  c.strokeStyle='#4b5363';c.lineWidth=4;c.beginPath();
  for(let x=-hw*.7;x<=hw*.7;x+=55){c.moveTo(x,-hh-10);c.lineTo(x,-hh*.42);c.moveTo(x,hh+10);c.lineTo(x,hh*.42)}c.stroke();
  }
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

// ===== costruttori dei siti: K è il kit di genMap (generatore, edifici, muri, alberi, strade, M.flat) =====
const PLAN={};
// --- quartiere: più griglie con dimensioni e angoli diversi, raccordate da strade ---
PLAN.mkCity=(K,sc)=>{const{R,rr,ri,pick}=K,x=K.r0.x+rr(-.4,.4)*K.r0.rin,y=K.r0.y+rr(-.4,.4)*K.r0.rin,a0=R()*3.14,ds=[];
 const mkD=(x,y,a)=>{const P=rr(250,400),nx=Math.max(2,Math.round(ri(3,6)*sc)),ny=Math.max(2,Math.round(ri(2,5)*sc));return{x,y,a,P,nx,ny,rad:Math.hypot(nx,ny)*P/2+30}};
 const D0=mkD(x,y,a0);if(!K.dryD(D0,[]))return null;ds.push(D0);
 for(let k=0,nd=ri(1,3);k<nd;k++)for(let t=0;t<40;t++){const par=pick(ds),ph=R()*TAU,D=mkD(0,0,R()*3.14);D.x=par.x+Math.cos(ph)*(par.rad+D.rad+rr(70,150));D.y=par.y+Math.sin(ph)*(par.rad+D.rad+rr(70,150));D.par=ds.indexOf(par);
  if(K.dryD(D,ds)){ds.push(D);break}}
 let r=0;for(const D of ds)r=Math.max(r,Math.hypot(D.x-D0.x,D.y-D0.y)+D.rad);
 const c0=Math.cos(D0.a),s0=Math.sin(D0.a),pu=((D0.nx>>1)+.5)*D0.P-D0.nx*D0.P/2,pv=((D0.ny>>1)+.5)*D0.P-D0.ny*D0.P/2;   // centro del blocco-piazza
 return{x:D0.x+pu*c0-pv*s0,y:D0.y+pu*s0+pv*c0,r,ds}};
PLAN.city=(K,S)=>{const{R,rr,ri,pick,ts,st,m}=K;S.ends=[];
 S.ds.forEach((D,di)=>{const c=Math.cos(D.a),s=Math.sin(D.a),T=(u,v)=>[D.x+u*c-v*s,D.y+u*s+v*c],P=D.P,hx=D.nx*P/2,hy=D.ny*P/2,mu=D.nx>>1,mv=D.ny>>1;D.T=T;
  const wU=[],wV=[];for(let i=0;i<=D.nx;i++)wU.push(i==mu?rr(46,54):rr(28,38));for(let j=0;j<=D.ny;j++)wV.push(j==mv?rr(46,54):rr(28,38));
  for(let i=0;i<=D.nx;i++)ts.push(st(T(i*P-hx,-hy-50),T(i*P-hx,hy+50),wU[i],i==mu?'av':'st',1));
  for(let j=0;j<=D.ny;j++)ts.push(st(T(-hx-50,j*P-hy),T(hx+50,j*P-hy),wV[j],j==mv?'av':'st',1));
  for(let i=0;i<=D.nx;i++)for(let j=0;j<=D.ny;j++){const p=T(i*P-hx,j*P-hy);m.junc.push({x:p[0],y:p[1],w:Math.max(wU[i],wV[j]),a:D.a})}
  D.ends=[T(mu*P-hx,-hy-50),T(mu*P-hx,hy+50),T(-hx-50,mv*P-hy),T(hx+50,mv*P-hy)];
  K.later.push(()=>{
   for(let i=0;i<D.nx;i++)for(let j=0;j<D.ny;j++){
    const u0=i*P-hx+wU[i]/2+14,u1=(i+1)*P-hx-wU[i+1]/2-14,v0=j*P-hy+wV[j]/2+14,v1=(j+1)*P-hy-wV[j+1]/2-14,bw=u1-u0,bh=v1-v0,p=T((u0+u1)/2,(v0+v1)/2),ctr=i==mu&&j==mv,rd=R();
    const diam=Math.hypot(bw,bh);
    m.flat.push({k:'slab',t:0,x:p[0],y:p[1],w:bw+36,h:bh+36,a:D.a});
    const here=(u,v)=>T((u0+u1)/2+u,(v0+v1)/2+v),sh=()=>pick(BTOWN);
    if(ctr&&di==0){m.flat.push({k:'circ',t:2,x:p[0],y:p[1],r:Math.min(bw,bh)*.46,pool:1});for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const q=here(a*bw*.46,b*bh*.46);K.tree(q[0],q[1],rr(11,14))}continue}   // piazza centrale aperta
    if(!ctr&&rd<.10){m.flat.push({k:'park',x:p[0],y:p[1],w:bw,h:bh,a:D.a,s:ri(0,1e6)});for(let t=0,n=ri(6,12);t<n;t++){const q=here(rr(-.45,.45)*bw,rr(-.45,.45)*bh);K.tree(q[0],q[1],rr(11,17))}continue}
    if(!ctr&&rd<.10){m.flat.push({k:'circ',t:2,x:p[0],y:p[1],r:Math.min(bw,bh)*.46});for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const q=here(a*bw*.36,b*bh*.36);K.tree(q[0],q[1],rr(12,16))}continue}
    if(!ctr&&rd<.10){m.flat.push({k:'lot',x:p[0],y:p[1],w:bw-8,h:bh-8,a:D.a,s:ri(0,1e6)});continue}
    const big=Math.min(bw,bh)>=180;
    if(!ctr&&rd<.45&&bw>=200&&bh>=150){const w2=bw/2-12;
     for(const sd of[-1,1]){const q=here(sd*(bw/4),0);const ba=D.a+(R()<.55?rr(-.55,.55):0);K.fitB(q[0],q[1],w2,Math.min(bh-4,rr(150,bh)),ba,D.a,pick(['rect','rect','L','U','fact']),'house',PAL_CITY)}continue}
    if((ctr||rd<.85)&&big){ // gruppo di edifici fusi in un'unica struttura (ognuno resta un edificio a sé)
     const k=ctr?0:ri(0,2),g=2,pa=pick(PAL_CITY),parts=[];
     if(k==0){const ht=Math.min(bh*.44,rr(120,170)),wt=Math.min(bw*.6,rr(150,200));parts.push({x:0,y:bh/2-ht/2-6,w:bw-12,h:ht,sh:'rect'},{x:0,y:bh/2-ht-6-g-Math.min(bw,bh)*.22,w:Math.min(bw*.6,wt*1.1),h:Math.min(bw*.6,wt*1.1),sh:pick(['square','oct','hex','circle'])})}
     else if(k==1){const w1=bw*.62,h1=bh*.46,w2=bw*.3,h2=bh*.9;parts.push({x:-bw/2+w1/2+3,y:-bh/2+h1/2+3,w:w1,h:h1,sh:'rect'},{x:bw/2-w2/2-3,y:0,w:w2,h:h2,sh:'rect'},{x:-bw/2+w1/2+3,y:bh/2-bh*.22-3,w:w1,h:bh*.4,sh:pick(['rect','fact','U'])})}
     else{const wb=(bw-8-2*g)/3;for(let q=-1;q<=1;q++)parts.push({x:q*(wb+g),y:0,w:wb,h:bh-14,sh:q==0?pick(['rect','H']):'rect'})}
     const ps=parts.filter(q=>q.w>=110&&q.h>=110).map(q=>{const w=here(q.x,q.y);return{x:w[0],y:w[1],w:q.w,h:q.h,a:D.a+(R()<.55?rr(-.55,.55):0),sh:q.sh}});
     if(ps.length==parts.length&&K.addGroup(ps,{tight:true,grp:1,pal:pa,fz:1}))continue}
    if(bw<110||bh<110)continue;const w=Math.min(bw,Math.max(150,rr(.78,1)*bw)),h=Math.min(bh,Math.max(150,rr(.78,1)*bh));
    const ba=D.a+(R()<.55?rr(-.55,.55):(R()<.15?1.5708:0));
    const b=K.fitB(p[0],p[1],w,h,ba,D.a,ctr?pick(['tower','quad','cross','fact']):sh(),'house',PAL_CITY);
    if(b&&rd>.9&&bw>=230&&bh>=230)K.wallRect(p[0],p[1],D.a,bw+14,bh+14,12,[T((u0+u1)/2,v1+16)]);   // isolato recintato con un varco
   }});
  if(di>0){const par=S.ds[D.par],nr=(o,q)=>o.ends.reduce((b,e)=>Math.hypot(e[0]-q.x,e[1]-q.y)<Math.hypot(b[0]-q.x,b[1]-q.y)?e:b),A=nr(par,D),B=nr(D,par);ts.push(st(A,B,rr(46,56),'av',1))}
  S.ends.push(...D.ends)})};
// --- cittadina ad anello (con piazza centrale) ---
PLAN.ring=(K,S)=>{const{R,rr,ri,ts,st,m}=K,Rr=S.rr,pts=[];S.ends=[];for(let i=0;i<=36;i++){const t=i/36*TAU;pts.push([S.x+Math.cos(t)*Rr,S.y+Math.sin(t)*Rr])}
 ts.push({pts,w:44,ty:0,cls:'st',sw:1});const sp=4+(R()*3|0);
 for(let i=0;i<sp;i++){const t=S.a+i/sp*TAU,e=[S.x+Math.cos(t)*(Rr+120),S.y+Math.sin(t)*(Rr+120)];S.ends.push(e);ts.push(st([S.x,S.y],e,i%2?34:44,'st',1))}
 m.flat.push({k:'circ',t:2,x:S.x,y:S.y,r:Math.max(60,Rr-190),pool:1});
 K.later.push(()=>{for(const rd of[Rr+120,Rr-125].filter(d=>d>=110)){const n=Math.round(TAU*rd/185);for(let i=0;i<n;i++){const t=S.a+(i+.5)/n*TAU;K.fitB(S.x+Math.cos(t)*rd,S.y+Math.sin(t)*rd,rr(150,175),rr(150,185),t+1.5708,t+1.5708,null,'house',PAL_CITY)}}
  K.fitB(S.x,S.y,rr(110,130),rr(110,130),S.a,S.a,R()<.5?'oct':'circle','house',PAL_CITY);
  if(R()<.6)K.wallCirc(S.x,S.y,Rr+250,S.ends)})};
// --- cittadina lineare lungo una via ---
PLAN.line=(K,S)=>{const{R,rr,ts,st,m}=K,c=Math.cos(S.a),s=Math.sin(S.a),T=(u,v)=>[S.x+u*c-v*s,S.y+u*s+v*c];S.ends=[T(-S.L/2,0),T(S.L/2,0)];ts.push(st(S.ends[0],S.ends[1],46,'av',1));
 for(let u=-S.L/2+260;u<S.L/2-200;u+=rr(300,420)){const A=T(u,-190),B=T(u,190);ts.push(st(A,B,30,'st',1));m.junc.push({x:T(u,0)[0],y:T(u,0)[1],w:46,a:S.a})}   // vie traverse
 K.later.push(()=>{for(let u=-S.L/2+110;u<S.L/2-90;u+=rr(190,215))for(const sd of[-1,1])if(R()<.85){const h=rr(150,210),p=T(u,sd*(23+h/2+30));K.addB(p[0],p[1],rr(150,180),h,S.a,null,true,false,'house',PAL_CITY)}})};
// --- fattoria: cascina, fienili, silos, serbatoio, campi di vario tipo ---
PLAN.farm=(K,S)=>{const{R,rr,ri,pick,m}=K;S.ends=[[S.x,S.y]];
 m.flat.push({k:'circ',t:3,x:S.x,y:S.y,r:rr(250,300)});
 for(let i=0,n=ri(3,5);i<n;i++){const t=S.a+(i+.5)/n*TAU+rr(-.3,.3),d=rr(400,500),w=rr(230,330),h=rr(170,250);m.flat.push({k:'field',x:S.x+Math.cos(t)*d,y:S.y+Math.sin(t)*d,w,h,a:t+1.5708,v:ri(0,5),s:ri(0,1e6),hedge:R()<.6})}
 K.later.push(()=>{const n=ri(3,5);
  for(let i=0;i<n;i++){const t=S.a+i/n*TAU+rr(-.3,.3),d=rr(190,250);K.addB(S.x+Math.cos(t)*d,S.y+Math.sin(t)*d,rr(130,210),rr(120,180),t,i==0?'L':i==1?'rect':null,false,false,'house',[0,1,2,3],3)}
  for(let i=0,k=ri(1,2);i<k;i++){const t=R()*TAU,d=rr(300,360),sd=rr(60,80);K.addX(S.x+Math.cos(t)*d,S.y+Math.sin(t)*d,sd*ri(1,3),sd,t,'silo',0,{o:{v:ri(0,2)}})}
  if(R()<.6){const t=R()*TAU;K.addX(S.x+Math.cos(t)*rr(120,170),S.y+Math.sin(t)*rr(120,170),64,64,0,'tank',0,{o:{v:1}})}
  if(R()<.7){const h=rr(190,230),a=S.a,c=Math.cos(a),s=Math.sin(a),T=(u,v)=>[S.x+u*c-v*s,S.y+u*s+v*c],q=[T(-h,-h),T(h,-h),T(h,h),T(-h,h)];for(let i=0;i<4;i++)K.wallLine(q[i][0],q[i][1],q[(i+1)%4][0],q[(i+1)%4][1],14,[q[(i+2)%4]])}})};
// --- villa: edificio principale, garage, viale alberato, giardino, piscina, campo da tennis, muro con cancello ---
PLAN.villa=(K,S)=>{const{R,rr,ri,pick,m}=K,c=Math.cos(S.a),s=Math.sin(S.a),T=(u,v)=>[S.x+u*c-v*s,S.y+u*s+v*c],W=S.W,H=S.H;S.T=T;S.ends=[T(0,H/2+70)];
 m.flat.push({k:'slab',t:5,x:S.x,y:S.y,w:W,h:H,a:S.a,garden:1,s:ri(0,1e6)});
 const pool=R()<.7,court=R()<.5,px=T(W*.24,H*.2);if(pool)m.flat.push({k:'pool',x:px[0],y:px[1],w:130,h:70,a:S.a});
 const cx=T(-W*.26,H*.2);if(court)m.flat.push({k:'court',x:cx[0],y:cx[1],w:140,h:75,a:S.a});
 K.ts.push(K.st(T(0,H/2+70),T(0,H*.1),22,'dr',0));
 K.later.push(()=>{const sh=pick(['combo','L','U','H','cross']);
  const v=K.addB(...T(0,-H*.2),rr(190,240),rr(150,190),S.a,sh,false,false,'house',[0,1,2,5],4);
  K.addB(...T(-W*.3,-H*.18),rr(110,130),rr(110,130),S.a,'rect',false,false,'house',[0,1,2,5],4);
  for(let v2=H/2-10;v2>H*.16;v2-=38)for(const sd of[-1,1]){const q=T(sd*26,v2);K.tree(q[0],q[1],rr(11,14),1)}
  for(let i=0,n=ri(4,8);i<n;i++){const q=T(rr(-.45,.45)*W,rr(-.42,.42)*H);if(pool&&Math.hypot(q[0]-px[0],q[1]-px[1])<90)continue;if(court&&Math.hypot(q[0]-cx[0],q[1]-cx[1])<95)continue;K.tree(q[0],q[1],rr(12,18))}
  if(R()<.85)K.wallRect(S.x,S.y,S.a,W,H,14,[T(0,H/2)])})};
// --- complesso militare: recinto con pochi varchi sorvegliati, torrette agli angoli, caserma, hangar, depositi ---
PLAN.comp=(K,S)=>{const{R,rr,ri,pick,m}=K,c=Math.cos(S.a),s=Math.sin(S.a),T=(u,v)=>[S.x+u*c-v*s,S.y+u*s+v*c];S.T=T;
 const gs=K.shuf([[0,-S.h/2-50],[0,S.h/2+50],[-S.w/2-50,0],[S.w/2+50,0]]).slice(0,ri(1,2));S.ends=gs.map(g=>T(g[0],g[1]));
 m.flat.push({k:'slab',t:4,x:S.x,y:S.y,w:S.w,h:S.h,a:S.a,soft:1});m.comp.push(S);
 for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const q=T(a*(S.w/2-55),b*(S.h/2-55));m.tspots.push(q)}
 for(const g of gs){const sg=g[0]?Math.sign(g[0]):0,sv=g[1]?Math.sign(g[1]):0;for(const d of[-1,1]){const q=T(sg?sg*(S.w/2-60):d*110,sv?sv*(S.h/2-60):d*110);m.tspots.push(q)}}
 K.later.push(()=>{K.wallRect(S.x,S.y,S.a,S.w,S.h,24,S.ends);
  const sh=pick(['U','fact','H','rect']),bw=rr(190,250),bh=rr(170,230);
  for(const[du,dv]of[[0,0],[-S.w*.12,S.h*.08],[S.w*.12,-S.h*.08]]){const p=T(du,dv),o=K.addB(p[0],p[1],bw,bh,S.a,sh,true,false,'house',[3,4]);if(o){S.bar=o;break}}
  for(let i=0,n=ri(2,4);i<n;i++){const p=T(pick([-1,1])*S.w*rr(.26,.36),pick([-1,1])*S.h*rr(.2,.32));K.addB(p[0],p[1],rr(120,160),rr(120,150),S.a,pick(['rect','square','oct']),true,false,'house',[3,4])}
  for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const p=T(a*(S.w/2-30),b*(S.h/2-30));K.addX(p[0],p[1],38,38,0,'stack',0,{gap:2,o:{v:0}})}   // torri d'angolo
  const hp=T(S.w*.28,S.h*.3);m.flat.push({k:'pad',x:hp[0],y:hp[1],r:52});const vd=T(-S.w*.3,S.h*.3);m.flat.push({k:'lot',x:vd[0],y:vd[1],w:170,h:90,a:S.a,s:ri(0,1e6),mil:1})})};
// --- complesso industriale: fabbriche, magazzini, silos, serbatoi, ciminiere, deposito di container con gru, uffici e parcheggio ---
PLAN.mkInd=(K,sc)=>{const{rr}=K,w=rr(760,980)*sc,h=rr(560,760)*sc,x=K.r0.x+rr(-.2,.2)*K.r0.rin,y=K.r0.y+rr(-.2,.2)*K.r0.rin;return{x,y,w,h,r:Math.hypot(w,h)/2+60}};
PLAN.ind=(K,S)=>{const{R,rr,ri,pick,m}=K,c=Math.cos(S.a),s=Math.sin(S.a),T=(u,v)=>[S.x+u*c-v*s,S.y+u*s+v*c],w=S.w,h=S.h;S.T=T;
 const gs=K.shuf([[0,h/2+50],[-w/2-50,0],[w/2+50,0],[0,-h/2-50]]).slice(0,2);S.ends=gs.map(g=>T(g[0],g[1]));
 m.flat.push({k:'slab',t:1,x:S.x,y:S.y,w,h,a:S.a});
 for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]])m.tspots.push(T(a*(w/2-55),b*(h/2-55)));
 K.later.push(()=>{const A=S.a,P=(u,v)=>T(u,v);
  let u=-w/2+90;for(let i=0;i<3&&u<w/2-300;i++){const ww=rr(220,300),hh=rr(150,200),p=P(u+ww/2,-h/2+hh/2+60);if(K.addB(p[0],p[1],ww,hh,A,pick(['fact','rect','U']),true,false,'house',PAL_IND,2))u+=ww+rr(36,64);else u+=120}
  for(let i=0;i<2;i++){const p=P(-w/2+95+i*0,-h/2+250+i*150);K.addB(p[0],p[1],rr(120,150),rr(240,300),A,'rect',true,false,'house',PAL_IND,2)}
  const sp=P(w/2-120,-h/2+120);K.addX(sp[0],sp[1],rr(80,100)*ri(2,3),rr(80,100),A,'silo',0,{o:{v:ri(0,2)}});
  for(let i=0,n=ri(2,4);i<n;i++){const p=P(w/2-90-(i%2)*120,-h/2+250+Math.floor(i/2)*115);K.addX(p[0],p[1],rr(80,110),rr(80,110),0,'tank',0,{o:{v:ri(0,1)*1}})}
  for(let i=0,n=ri(1,2);i<n;i++){const p=P(rr(-.1,.2)*w,-h/2+40);K.addX(p[0],p[1],rr(56,70),rr(56,70),0,'stack',0,{o:{v:0}})}
  // deposito di container a file con corsie larghe, e una gru a cavalletto
  const rows=ri(2,3),cols=ri(3,4);let vv=h/2-250;
  for(let j=0;j<rows;j++){const ny=ri(1,2),nx=ri(2,3);let uu=-w/2+110;for(let i=0;i<cols;i++){const cw=nx*56,ch=ny*24,p=P(uu+cw/2,vv);
    if(R()<.82){const o=K.addX(p[0],p[1],cw,ch,A,'cont',0,{gap:4});if(o)o.cc=Array.from({length:nx*ny},()=>ri(0,9))}uu+=cw+rr(58,90)}vv+=ny*24+rr(60,78)}
  const cr=P(-w*.05,h/2-205);K.addX(cr[0],cr[1],w*.62,26,A,'crane',0,{gap:4,o:{v:0}});
  const op=P(w/2-200,h/2-95);K.addB(op[0],op[1],rr(130,160),rr(110,130),A,'rect',true,false,'house',PAL_CITY,1);const lt=P(w/2-330,h/2-90);m.flat.push({k:'lot',x:lt[0],y:lt[1],w:150,h:90,a:A,s:ri(0,1e6)});
  m.flat.push({k:'rail',pts:[P(-w/2+30,h/2-130),P(w/2-30,h/2-130)],w:8});m.flat.push({k:'pipe',pts:[P(w/2-150,-h/2+190),P(w/2-150,-h/2+330),P(w/2-420,-h/2+330)],w:9});
  K.wallRect(S.x,S.y,A,w,h,18,S.ends)})};
// --- porto: moli (terra extra), gru, banchina con container, magazzini, serbatoi e navi ormeggiate ---
PLAN.mkPort=(K,y)=>{const{R,rr,ri}=K,cx=coast(y),np=ri(2,3),piers=[],gap=rr(300,340);
 for(let i=0;i<np;i++){const py=y+(i-(np-1)/2)*gap,x1=coast(py)-40,L=rr(420,600),W=rr(104,124);piers.push({x:x1+L/2,y:py,a:0,c:1,s:0,L,W,x1,x2:x1+L})}
 return{k:'p',x:cx-300,y,r:640,piers,cx}};
PLAN.port=(K,S)=>{const{R,rr,ri,pick,m}=K,cx=S.cx,y=S.y;S.ends=[[cx-640,y]];S.k='p';
 m.flat.push({k:'slab',t:3,x:cx-270,y,w:560,h:S.piers.length*340+240,a:0,soft:1});
 for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]])m.tspots.push([cx-300+a*210,y+b*(S.piers.length*150+60)]);
 K.later.push(()=>{
  S.piers.forEach((p,i)=>{
   // gru a portale che scavalcano la banchina del molo (le zampe stanno ai bordi: in mezzo si passa)
   for(let k=0,n=ri(1,2);k<n;k++)K.addX(p.x1+90+k*180+rr(0,60),p.y,p.W+30,24,Math.PI/2,'crane',2,{gap:2,o:{v:1}});
   // nave ormeggiata nel lato libero tra i moli
   const side=i%2?1:-1,ln=rr(290,Math.min(440,p.L-70)),bm=rr(64,88),sx=p.x1+p.L*.5+rr(-30,30),sy=p.y+side*(p.W/2+bm/2+28);
   K.addX(sx,sy,ln,bm,0,'ship',3,{gap:6,o:{v:ri(0,2)}});
   if(i==S.piers.length-1&&R()<.7)K.addX(sx,p.y-side*(p.W/2+bm/2+28),rr(260,330),rr(60,80),0,'ship',3,{gap:6,o:{v:ri(0,2)}})});
  // banchina: file di container con corsie larghe, magazzini, serbatoi
  const hy=S.piers.length*140;let vv=y-hy+30;
  while(vv<y+hy-20){const ny=ri(1,3),ch=ny*24;let xx=cx-280;
   for(let i=0;i<3;i++){const nx=ri(2,3),cw=nx*56;if(R()<.85){const o=K.addX(xx+cw/2,vv+ch/2,cw,ch,0,'cont',0,{gap:4});if(o)o.cc=Array.from({length:nx*ny},()=>ri(0,9))}xx+=cw+rr(58,80)}
   vv+=ch+rr(62,78)}
  for(const sd of[-1,1])K.addB(cx-450,y+sd*170,rr(250,280),rr(130,150),0,'rect',true,false,'house',PAL_IND,2);
  for(let i=0,n=ri(2,3);i<n;i++)K.addX(cx-420+i*120,y-hy-75,rr(80,100),rr(80,100),0,'tank',0,{o:{v:ri(0,1)}});
  K.addB(cx-330,y+S.piers.length*140+55,rr(140,170),rr(110,130),0,'rect',true,false,'house',PAL_CITY,1);
  m.flat.push({k:'rail',pts:[[cx-600,y-S.piers.length*150],[cx-600,y+S.piers.length*150]],w:8})})};
// --- base di partenza: tettoie, hangar e piazzale (a distanza di sicurezza dalla partenza) ---
PLAN.base=(K)=>{const{m}=K,L=baseXY,A=baseAng,c=L(330,330),gates=[L(650,330),L(330,640)],
 bld=(u,v,w,h,a,sh,fz)=>{const p=L(u,v);return K.addGroup([{x:p[0],y:p[1],w,h,a:A(a),sh}],{base:true,tight:true,pals:[3,4],fz:fz||2,noSlab:1})},
 cnt=(u,v,w,h)=>{const p=L(u,v);K.addX(p[0],p[1],w,h,A(0),'cont',0,{gap:4,base:1})};
 m.flat.push({k:'slab',t:4,x:c[0],y:c[1],w:BASE_W,h:BASE_H,a:A(0),soft:1},{k:'pad',x:EXT[0],y:EXT[1],r:70});
 K.later.push(()=>{
  bld(510,420,160,160,0,'pyramid',3);          // edificio di comando
  bld(470,115,200,130,0,'fact');               // hangar
  bld(110,470,190,130,1.5708,'fact');          // hangar
  cnt(250,555,112,24);cnt(424,555,112,24);cnt(250,462,56,48);cnt(370,462,56,24);   // container con corsie larghe
  for(const[u,v]of[[50,60],[610,60],[610,590],[50,590]]){const p=L(u,v);K.addX(p[0],p[1],38,38,0,'stack',0,{gap:2,base:1,o:{v:0}})}   // torri d'angolo
  const lt=L(500,255);m.flat.push({k:'lot',x:lt[0],y:lt[1],w:170,h:90,a:A(0),s:K.ri(0,1e6),mil:1});
  m.baseWalls=1;K.wallRect(c[0],c[1],A(0),BASE_W,BASE_H,24,gates);m.baseWalls=0})};

// --- centrale nucleare: tre torri di raffreddamento in linea + edificio reattore/controllo ---
PLAN.mkNuke=(K,sc)=>{const{rr}=K,w=rr(700,820)*sc,h=rr(480,580)*sc,x=K.r0.x+rr(-.2,.2)*K.r0.rin,y=K.r0.y+rr(-.2,.2)*K.r0.rin;return{x,y,w,h,r:Math.hypot(w,h)/2+40}};
PLAN.nuke=(K,S)=>{const{R,rr,ri,pick,m}=K,c=Math.cos(S.a),s=Math.sin(S.a),T=(u,v)=>[S.x+u*c-v*s,S.y+u*s+v*c],w=S.w,h=S.h,A=S.a;S.T=T;
 const gs=K.shuf([[0,h/2+50],[-w/2-50,0],[w/2+50,0],[0,-h/2-50]]).slice(0,2);S.ends=gs.map(g=>T(g[0],g[1]));
 // piazzale industriale (stesso tipo degli ind)
 m.flat.push({k:'slab',t:1,x:S.x,y:S.y,w,h,a:A});
 K.later.push(()=>{
  // tre torri di raffreddamento in linea (cerchi grandi, vista dall'alto)
  const tw=rr(115,140), gap=tw*1.15, u0=-gap;
  for(let i=0;i<3;i++){
   const p=T(u0+i*gap,-h*.12);
   K.addX(p[0],p[1],tw,tw,0,'tank',0,{gap:8,o:{v:0,ct:1}});  // ct = cooling tower
  }
  // edificio reattore / controllo accanto alle torri
  const bp=T(w*.28,h*.18);
  K.addB(bp[0],bp[1],rr(180,230),rr(140,180),A,pick(['fact','rect','U']),true,false,'house',PAL_IND,2);
  // piccolo edificio secondario / magazzino
  if(R()<.75){const sp=T(-w*.32,h*.22);K.addB(sp[0],sp[1],rr(110,140),rr(90,120),A,'rect',true,false,'house',PAL_IND,1)}
  // serbatoi e ciminiere di dettaglio
  for(let i=0,n=ri(1,3);i<n;i++){const p=T(rr(-.35,.35)*w,h*.32+rr(0,40));K.addX(p[0],p[1],rr(55,75),rr(55,75),0,'tank',0,{o:{v:ri(0,1)}})}
  if(R()<.7){const p=T(w*.1,-h*.38);K.addX(p[0],p[1],rr(40,52),rr(40,52),0,'stack',0,{o:{v:0}})}
  // parcheggio
  const lt=T(-w*.28,h*.35);m.flat.push({k:'lot',x:lt[0],y:lt[1],w:150,h:80,a:A,s:ri(0,1e6)});
  // recinto con varchi
  if(R()<.9)K.wallRect(S.x,S.y,A,w,h,18,S.ends);
 })};

// --- vita sul mare e sui laghi: navi, petroliere, piattaforme ---
PLAN.sea=(K)=>{const{R,rr,ri,m}=K;
 for(let i=0,n=0;i<200&&n<7;i++){const y=rr(300,WH-300),x=coast(y)+rr(260,1300),L=rr(300,450),B=rr(66,92);if(K.addX(x,y,L,B,rr(-.35,.35),'ship',3,{gap:90,o:{v:ri(0,2)}}))n++}
 for(let i=0,n=0;i<200&&n<4;i++){const y=rr(300,WH-300),x=coast(y)+rr(500,1300),s2=rr(190,250);if(K.addX(x,y,s2,s2*rr(.8,1),0,'plat',3,{gap:120}))n++}
 for(const l of m.lakes){const mr=Math.min(...l.a);if(mr<190)continue;
  if(K.R()<.7)for(let t=0;t<8;t++){const a=K.R()*TAU,d=K.R()*mr*.4,s2=rr(110,150);if(K.addX(l.x+Math.cos(a)*d,l.y+Math.sin(a)*d,s2,s2*.8,0,'plat',3,{gap:90}))break}
  for(let k=0,nb=ri(1,3);k<nb;k++)for(let t=0;t<8;t++){const a=K.R()*TAU,d=K.R()*mr*.55;if(K.addX(l.x+Math.cos(a)*d,l.y+Math.sin(a)*d,rr(120,170),rr(34,46),K.R()*TAU,'ship',3,{gap:40,o:{v:2}}))break}}};

// --- cantiere navale stellare: astronave colossale in costruzione con bacino, gru, magazzini e serbatoi ---
PLAN.mkYard=(K,sc)=>{const{rr}=K,w=rr(720,820)*sc,h=rr(520,600)*sc,x=K.r0.x+rr(-.2,.2)*K.r0.rin,y=K.r0.y+rr(-.2,.2)*K.r0.rin;return{x,y,w,h,r:Math.hypot(w,h)/2+20}};
PLAN.yard=(K,S)=>{const{R,rr,ri,pick,m}=K,c=Math.cos(S.a),s=Math.sin(S.a),T=(u,v)=>[S.x+u*c-v*s,S.y+u*s+v*c],w=S.w,h=S.h;S.T=T;
 const gs=K.shuf([[0,h/2+50],[-w/2-50,0],[w/2+50,0],[0,-h/2-50]]).slice(0,2);S.ends=gs.map(g=>T(g[0],g[1]));
 // 1. Base piazzale sfumata e decorata con finitura industriale
 m.flat.push({k:'slab',t:1,x:S.x,y:S.y,w,h,a:S.a,soft:1});
 m.comp.push(S);
 // Punti di pattuglia/guardia
 for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]])m.tspots.push(T(a*(w/2-55),b*(h/2-55)));
 K.later.push(()=>{const A=S.a,P=(u,v)=>T(u,v);
  // 1. La grande Nave Spaziale al centro (mode 2 = esclude falsi positivi con le strade del cancello)
  K.addX(S.x,S.y,480,280,A,'cruiser',2,{gap:10,force:true,o:{v:0}});
  // 3. Binari ferroviari pesanti di servizio per le gru del bacino
  m.flat.push({k:'rail',pts:[P(-w/2+70,-h/2+35),P(w/2-70,-h/2+35)],w:8});
  m.flat.push({k:'rail',pts:[P(-w/2+70,h/2-35),P(w/2-70,h/2-35)],w:8});
  // 4. Gru a portale che scorrono sui binari
  K.addX(...P(0,-h/2+35),w*.6,24,A,'crane',0,{gap:6,o:{v:1}});
  K.addX(...P(0,h/2-35),w*.6,24,A,'crane',0,{gap:6,o:{v:1}});
  // 5. Edifici industriali di collaudo e assemblaggio
  K.addB(...P(-w/2+95,-h/2+100),150,110,A,'fact',true,false,'house',PAL_IND,2);
  K.addB(...P(w/2-95,-h/2+100),150,110,A,'rect',true,false,'house',PAL_IND,2);
  // 6. Condotte tubazioni carburante dai serbatoi allo scafo
  m.flat.push({k:'pipe',pts:[P(-w/2+90,h/2-70),P(-w/2+90,h*.16),P(-140,h*.16)],w:9});
  // 7. Parco serbatoi combustibile e bombole criogeniche
  for(let i=0;i<3;i++)K.addX(...P(-w/2+90+i*85,h/2-70),70,70,0,'tank',0,{o:{v:1}});
  K.addX(...P(-w/2+340,h/2-70),54,54,0,'stack',0,{gap:4,o:{v:0}});
  // 8. Eliporto logistico per navette
  const hp=P(w/2-105,h/2-85);m.flat.push({k:'pad',x:hp[0],y:hp[1],r:44});
  // 9. Parcheggio veicoli pesanti da cantiere
  const lt=P(w/2-240,h/2-85);m.flat.push({k:'lot',x:lt[0],y:lt[1],w:140,h:85,a:A,s:ri(0,1e6),mil:1});
  // 10. File di container con parti di ricambio
  for(let i=0;i<2;i++){const p=P(w/2-140+i*60,-h/2+180),o=K.addX(p[0],p[1],112,24,A,'cont',0,{gap:4});if(o)o.cc=[0,1,2,3]}
  // 11. Torrette d'angolo di guardia
  for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const p=P(a*(w/2-32),b*(h/2-32));K.addX(p[0],p[1],36,36,0,'stack',0,{gap:2,o:{v:0}})}
  // Muro perimetrale con varchi di sicurezza
  K.wallRect(S.x,S.y,A,w,h,20,S.ends)})};
// --- silos ICBM nucleari ---
PLAN.mkSilo=(K,sc)=>{const{rr}=K,w=rr(680,820)*sc,h=rr(520,640)*sc,x=K.r0.x+rr(-.2,.2)*K.r0.rin,y=K.r0.y+rr(-.2,.2)*K.r0.rin;return{x,y,w,h,r:Math.hypot(w,h)/2+50}};
PLAN.silo=(K,S)=>{const{R,rr,ri,pick,m}=K,c=Math.cos(S.a),s=Math.sin(S.a),T=(u,v)=>[S.x+u*c-v*s,S.y+u*s+v*c],w=S.w,h=S.h;S.T=T;
 const gs=K.shuf([[0,h/2+50],[-w/2-50,0],[w/2+50,0],[0,-h/2-50]]).slice(0,2);S.ends=gs.map(g=>T(g[0],g[1]));
 m.flat.push({k:'slab',t:4,x:S.x,y:S.y,w,h,a:S.a,soft:1});m.comp.push(S);
 for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]])m.tspots.push(T(a*(w/2-55),b*(h/2-55)));
 K.later.push(()=>{const A=S.a,P=(u,v)=>T(u,v);
  for(let r=-1;r<=1;r+=2)for(let col=-1.5;col<=1.5;col+=1)K.addX(...P(col*(w*0.19),r*(h*0.25)),68,68,A,'hatch',0,{gap:6});
  m.flat.push({k:'pipe',pts:[P(-w*0.3,-h*0.25),P(w*0.3,-h*0.25)],w:8});
  m.flat.push({k:'pipe',pts:[P(-w*0.3,h*0.25),P(w*0.3,h*0.25)],w:8});
  m.flat.push({k:'pipe',pts:[P(0,-h*0.25),P(0,h*0.25)],w:8});
  K.addX(...P(-w/2+115,0),80,80,A,'radar',0,{gap:6});
  K.addB(...P(w/2-125,-h*0.1),140,140,A,'pyramid',true,false,'house',[3,4],2);
  K.addB(...P(w/2-130,h*0.22),150,90,A,'fact',true,false,'house',[3,4],2);
  for(let i=0;i<3;i++)K.addX(...P(-w/2+100+i*75,-h/2+65),64,64,0,'tank',0,{o:{v:1}});
  const hp=P(w/2-110,-h/2+75);m.flat.push({k:'pad',x:hp[0],y:hp[1],r:46});
  const lt=P(0,h/2-70);m.flat.push({k:'lot',x:lt[0],y:lt[1],w:160,h:80,a:A,s:ri(0,1e6),mil:1});
  for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]])K.addX(...P(a*(w/2-32),b*(h/2-32)),36,36,0,'stack',0,{gap:2,o:{v:0}});
  K.wallRect(S.x,S.y,A,w,h,20,S.ends)})};

// --- aeroporto militare ---
PLAN.mkAir=(K,sc)=>{const{rr}=K,w=rr(900,1100)*sc,h=rr(520,640)*sc,x=K.r0.x+rr(-.2,.2)*K.r0.rin,y=K.r0.y+rr(-.2,.2)*K.r0.rin;return{x,y,w,h,r:Math.hypot(w,h)/2+40}};
PLAN.air=(K,S)=>{const{R,rr,ri,pick,m}=K,c=Math.cos(S.a),s=Math.sin(S.a),T=(u,v)=>[S.x+u*c-v*s,S.y+u*s+v*c],w=S.w,h=S.h;S.T=T;
 const gs=K.shuf([[0,h/2+50],[-w/2-50,0],[w/2+50,0]]).slice(0,2);S.ends=gs.map(g=>T(g[0],g[1]));
 m.flat.push({k:'slab',t:4,x:S.x,y:S.y,w,h,a:S.a,soft:1});m.comp.push(S);
 for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]])m.tspots.push(T(a*(w/2-55),b*(h/2-55)));
 K.later.push(()=>{const A=S.a,P=(u,v)=>T(u,v);
  m.flat.push({k:'slab',t:4,x:P(0,h*0.22)[0],y:P(0,h*0.22)[1],w:w*0.86,h:h*0.38,a:A});
  K.addB(...P(-w*0.25,-h*0.22),200,130,A,'fact',true,false,'house',[3,4],2);
  K.addB(...P(0,-h*0.22),200,130,A,'fact',true,false,'house',[3,4],2);
  K.addB(...P(w*0.25,-h*0.24),110,110,A,'tower',true,false,'house',[3,4],2);
  K.addX(...P(w*0.38,-h*0.24),74,74,A,'radar',0,{gap:6});
  m.flat.push({k:'pad',x:P(-w*0.38,h*0.22)[0],y:P(-w*0.38,h*0.22)[1],r:48});
  m.flat.push({k:'pad',x:P(w*0.38,h*0.22)[0],y:P(w*0.38,h*0.22)[1],r:48});
  for(let i=0;i<4;i++)K.addX(...P(-w/2+90+i*68,-h/2+60),60,60,0,'tank',0,{o:{v:0}});
  m.flat.push({k:'lot',x:P(w*0.18,-h/2+65)[0],y:P(w*0.18,-h/2+65)[1],w:150,h:80,a:A,s:ri(0,1e6),mil:1});
  for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]])K.addX(...P(a*(w/2-32),b*(h/2-32)),36,36,0,'stack',0,{gap:2,o:{v:0}});
  K.wallRect(S.x,S.y,A,w,h,20,S.ends)})};
