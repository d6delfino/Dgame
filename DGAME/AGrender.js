'use strict';
/* AIRGRUNT · AGrender.js — canvas, disegno di mech, nemici, bersagli di missione, HUD e contatore FPS.
   Tutta la grafica nasce da dati locali (posizioni, vita, eventi): in rete non viaggia nulla di grafico. */
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
let W=0,H=0,zoom=1,camX=0,camY=0,mx=0,my=0;
let zoomUserMul=1;   // moltiplicatore di zoom manuale (rotella). 1 = zoom automatico per arma/modalità
function resize(){const r=cv.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,G.q>=2?2:1.25);W=r.width;H=r.height;cv.width=W*d;cv.height=H*d;ctx.setTransform(d,0,0,d,0,0)}
addEventListener('resize',resize);
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
function seen(x,y,fly){
 const dx=x-P.x,dy=y-P.y,d=Math.hypot(dx,dy);
 // FUMOGENI: nascondono SOLO le unità a terra (fly=false). Le volanti sono sempre visibili.
 // Il controllo è indipendente da G.fog: in modalità Air G.fog=0, quindi va fatto PRIMA
 // del bypass della nebbia, altrimenti il fumo non avrebbe effetto in volo.
 // - tInSmoke: il bersaglio è dentro il fumogeno
 // - pInSmoke: il giocatore è dentro il fumogeno (fumo "sale": anche in volo sopra, sei accecato)
 // - entro 40px il bersaglio è comunque visibile (vedi da vicino)
 if(!fly && d>40 && typeof smokes!=='undefined' && smokes.length){
  for(const s of smokes){
   if(s.t>=s.life)continue;
   if(Math.hypot(x-s.x,y-s.y)<s.r||Math.hypot(P.x-s.x,P.y-s.y)<s.r)return false;
  }
 }
 if(G.fog<.02)return true;
 const visR=viewRange(P)*VIEW_MARGIN;
 if(d<1)return true;
 if(d>visR)return false;
 if(fly)return true;
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
function fxDraw(ctx){
 // Difensivo: se una draw precedente ha lasciato 'lighter'/'screen', il fumo si somma
 // in modo additivo e flickera. Forziamo source-over.
 ctx.globalCompositeOperation='source-over';
 ctx.lineCap='round';
 let last='';
 // NIENTE sort: l'ordine dell'array è stabile grazie alla compaction in fxStep.
 for(const p of fxP){
  if(p.soft){
   // FUMO → cerchio pieno. Il fill di un'arc ha antialiasing molto più stabile dello stroke
   // di una linea sub-pixel: il flicker "un frame sì, un frame no" sparisce alla radice.
   const lf=p.life;
   let a = lf*lf*0.75;                 // opacità −25% come richiesto + fade quadratico
   if(a < 0.008) a = 0;                // 0.008 ≈ 2/255: fuori dalla zona di arrotondamento 0↔1
   if(a <= 0) continue;                 // non disegnare affatto (niente no-op, niente flicker)
   ctx.globalAlpha = a;
   ctx.fillStyle = p.color;
   ctx.beginPath();
   ctx.arc(p.x, p.y, p.size*0.5, 0, TAU);   // raggio costante (niente shrink → niente sub-pixel)
   ctx.fill();
  }else{
   // Altri effetti (scintille, impatti, esplosioni): fade lineare, resa a linea invariata.
   if(p.color!==last){ctx.strokeStyle=last=p.color}
   ctx.globalAlpha = p.life;
   ctx.lineWidth = p.size;
   ctx.beginPath();ctx.moveTo(p.x-p.vx,p.y-p.vy);ctx.lineTo(p.x,p.y);ctx.stroke();
  }
 }
 ctx.globalAlpha=1;
}
function drawUnit(t,ldt){
 const fly=!!t.z;
 const now=performance.now();
 let vis=seen(t.x,t.y,fly);
 if(vis&&!fly&&typeof natHide==='function'&&natHide(t.x,t.y)&&Math.hypot(t.x-P.x,t.y-P.y)>110)vis=false;   // erba alta (AGnature.js): da lontano non si vede chi c'è dentro
 if(!vis&&P.bf&&P.bf.rad>0)vis=true;   // potenziamento del Radar (edificio speciale): si vedono tutti anche nella nebbia di guerra
 if(vis){t._lastSeen=now}
 else if(P.radar&&t._lastSeen&&now-t._lastSeen<P.radar*1000){
  const d=Math.hypot(t.x-P.x,t.y-P.y);
  if(d<viewRange(P)*1.5)vis=true;
 }
 const tg=vis?1:0;t.va=t.va==null?tg:t.va+(tg-t.va)*Math.min(1,10*ldt);if(t.va<.03)return;ctx.globalAlpha=t.va;
 if(t.k===UK_BLIMP)blimpBody(t);else if(fly)flyBody(t);else if(t.k>=UK_HUM)humanBody(t);else unitBody(t);
 const bw=t.k==6?40:t.k==UK_BLIMP?72:t.k==0||t.k==5?52:40,by=t.k==6?-36:t.k==UK_BLIMP?-60:-36;
 if(t.k<UK_HUM||t.wp||t.st==2){ctx.fillStyle='#222';ctx.fillRect(t.x-bw/2,t.y+by,bw,4);ctx.fillStyle='#e04b4b';ctx.fillRect(t.x-bw/2,t.y+by,bw*clamp(t.hp/(t.mhp||120),0,1),4)}
 ctx.textAlign='center';
 if(t.k==6){ctx.fillStyle='#ff5a5a';ctx.font='bold 13px system-ui,sans-serif';ctx.fillText('BERSAGLIO D’ÉLITE',t.x,t.y+by-6)}
 if(t.name){ctx.fillStyle='#ffd2d2';ctx.font='bold 12px system-ui,sans-serif';ctx.fillText(t.name,t.x,t.y+by-6)}
 if(t.dis>0){ctx.fillStyle='#5dd6ff';ctx.font='bold 12px system-ui,sans-serif';ctx.fillText('SPENTA',t.x,t.y+by-6)}
 if(t.st==1&&!t.dis){ctx.fillStyle='#ff3b3b';ctx.strokeStyle='#fff';ctx.lineWidth=4;ctx.font='bold 30px system-ui,sans-serif';ctx.strokeText('!',t.x,t.y+by-20);ctx.fillText('!',t.x,t.y+by-20)}  // si è accorto di te: sta reagendo
 ctx.globalAlpha=1}
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
 ctx.fillStyle='#ffd23f';ctx.font='bold 14px system-ui,sans-serif';ctx.fillText((CAMP.on?campTag():'MISSIONE · ')+MIS_NAMES[G.mt].toUpperCase()+(G.mt==8||G.mt==9?'':'  ·  Caserme '+BAR.filter(o=>!o.dead).length+'/'+BAR.length),W/2,28);
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

 // 6 quadratini slot (a destra della vita)
 const slotY=18,slotS=28,slotGap=5,slotX0=245;
 let shIdx=0,rvIdx=0,turIdx=0,wmgIdx=0,grnIdx=0,smkIdx=0,nukIdx=0,slwIdx=0;
 const drawCooldown=(t,maxT,cx,cy,R,col)=>{
  if(!t||t<=0){ // carico
   ctx.fillStyle=col+'55';ctx.beginPath();ctx.arc(cx,cy,R-3,0,TAU);ctx.fill();
   return;
  }
  ctx.lineWidth=6.5;
  ctx.strokeStyle='#223140';
  ctx.beginPath();ctx.arc(cx,cy,R,0,TAU);ctx.stroke();
  ctx.strokeStyle=col;
  ctx.beginPath();ctx.arc(cx,cy,R,-Math.PI/2,-Math.PI/2+clamp(1-t/maxT,0,1)*TAU);ctx.stroke();
 };
 for(let i=0;i<6;i++){
  const id=loadout[i],x=slotX0+i*(slotS+slotGap),sel=id&&id[0]=='w'&&+id.slice(1)===p.w;
  // sfondo
  ctx.fillStyle=sel?'#ffd23f':'#2a2a2a';
  ctx.fillRect(x,slotY,slotS,slotS);
  ctx.strokeStyle=sel?'#fff':'#555';
  ctx.lineWidth=sel?2:1;
  ctx.strokeRect(x+.5,slotY+.5,slotS-1,slotS-1);

  // numero del tasto corrispondente (1-6) sopra la casella (posizione invariata)
  ctx.save();
  ctx.font='bold 10px system-ui,sans-serif';
  ctx.textAlign='center';
  ctx.textBaseline='bottom';
  ctx.lineWidth=3;
  ctx.strokeStyle='#000';
  ctx.strokeText(String(i+1), x+slotS/2, slotY-1);
  ctx.fillStyle=sel?'#ffd23f':'#fff';
  ctx.fillText(String(i+1), x+slotS/2, slotY-1);
  ctx.restore();

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

 // indicatore di ricarica per abilità attive — OGNI durata legge la variabile reale,
 // nessun numero fisso duplicato: se cambi ABIL_CD.* o REVIVE_CD/SHIELD_T/SLOW_CD
 // l'animazione resta automaticamente allineata (nessun "carico visivo ≠ carico reale")
 const cx=x+slotS/2, cy=slotY+slotS/2, R=10;
 if(id==='u:shield'&&p.shs&&shIdx<p.shs.length)drawCooldown(p.shs[shIdx++],SHIELD_T,cx,cy,R,'#0066ff');
 else if(id==='u:revive'&&p.revive&&rvIdx<p.revive.length)drawCooldown(p.revive[rvIdx++],REVIVE_CD,cx,cy,R,'#ffc400');
 else if(id==='u:turret'&&p.turs&&turIdx<p.turs.length)drawCooldown(p.turs[turIdx++],ABIL_CD.turret,cx,cy,R,'#3fd05a');
 else if(id==='u:wingman'&&p.wmgs&&wmgIdx<p.wmgs.length)drawCooldown(p.wmgs[wmgIdx++],ABIL_CD.wingman,cx,cy,R,'#ffd23f');
 else if(id==='u:grenade'&&p.grns&&grnIdx<p.grns.length)drawCooldown(p.grns[grnIdx++],ABIL_CD.grenade,cx,cy,R,'#ff9a3a');
 else if(id==='u:smoke'&&p.smks&&smkIdx<p.smks.length)drawCooldown(p.smks[smkIdx++],ABIL_CD.smoke,cx,cy,R,'#aab8c0');
 else if(id==='u:nuke'&&p.nuks&&nukIdx<p.nuks.length)drawCooldown(p.nuks[nukIdx++],ABIL_CD.nuke,cx,cy,R,'#ff4a4a');
 else if(id==='u:slowmo'&&slwIdx<SLOW.cds.length)drawCooldown(SLOW.cds[slwIdx++],SLOW_CD,cx,cy,R,'#b27dff');
}
 // potenziamenti a tempo degli edifici speciali: una casella in più per ognuno attivo; il cerchio si SVUOTA col tempo che resta
 {let j=6;for(const ty of SB_BUFF){const t=p.bf&&p.bf[ty];if(!(t>0))continue;const S=SB_TYPES[ty],x=slotX0+j*(slotS+slotGap)+8,cx=x+slotS/2,cy=slotY+slotS/2;j++;
  ctx.fillStyle='#2a2a2a';ctx.fillRect(x,slotY,slotS,slotS);ctx.strokeStyle=S.c;ctx.lineWidth=2;ctx.strokeRect(x+.5,slotY+.5,slotS-1,slotS-1);
  const im=upImg(itemOf('u:'+S.up));if(im.complete&&im.naturalWidth)ctx.drawImage(im,cx-8,cy-8,16,16);
  ctx.lineWidth=3;ctx.strokeStyle='#223140';ctx.beginPath();ctx.arc(cx,cy,11,0,TAU);ctx.stroke();
  ctx.strokeStyle=S.c;ctx.beginPath();ctx.arc(cx,cy,11,-Math.PI/2,-Math.PI/2+clamp(t/S.t,0,1)*TAU);ctx.stroke()}}

 

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
    // cerchietto bersaglio SOLO quando si mira col dito: con l'autoaim agganciato
    // (TOUCH.lock attivo) il cerchietto da 18 px coprirebbe il nemico → viene omesso.
    if(!TOUCH.lock){
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ax, ay, 18, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(ax, ay, 6, 0, TAU); ctx.stroke();
    }
    // puntino centrale sempre (piccolo, non copre il bersaglio)
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
 // autoaim agganciato (mobile): mirino minimale — solo puntino, niente cerchi che coprirebbero il bersaglio
 const lock=typeof TOUCH!=='undefined'&&!!TOUCH.lock;
// lanciarazzi (w.ex>0): anello sottile al raggio reale dell'esplosione — rosso se in gittata, bianco se fuori (come il cerchietto)
 if(w.ex>0){ctx.lineWidth=1.5;ctx.strokeStyle=inR?'rgba(255,59,59,.55)':'rgba(255,255,255,.55)';ctx.beginPath();ctx.arc(mx,my,w.ex*zoom,0,TAU);ctx.stroke()}
 if(!lock){
  ctx.lineWidth=6;ctx.strokeStyle='#000';ctx.beginPath();ctx.arc(mx,my,9,0,TAU);ctx.stroke();
  if(rlOn){ctx.lineWidth=4;ctx.strokeStyle='#5a5a5a';ctx.beginPath();ctx.arc(mx,my,9,0,TAU);ctx.stroke();ctx.strokeStyle='#ffc400';ctx.beginPath();ctx.arc(mx,my,9,-Math.PI/2,-Math.PI/2+clamp(1-ws.rl/rlT,0,1)*TAU);ctx.stroke()}
  else{ctx.lineWidth=4;ctx.strokeStyle=inR?'#ff3b3b':'#fff';ctx.beginPath();ctx.arc(mx,my,9,0,TAU);ctx.stroke()}
 }
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
// ===== Fumogeno: 3 nuvolette con le stesse forme della schermata di caricamento =====
// Le forme (type 0..3) sono IDENTICHE a quelle di bakeDraw() in AGbake.js:
//   0 = 3 cerchi, 1 = 2 ellissi + 1 cerchio, 2 = 5 cerchi, 3 = 4 cerchi.
// Ogni fumogeno usa ESATTAMENTE 3 nuvolette (grigio chiaro / medio / scuro)
// disposte a 120° tra loro su un cerchio di raggio ~0.50·s.r: coprono tutta l'area
// dell'effetto sbordando leggermente all'esterno, senza accavallarsi troppo al centro.

// traccia la sagoma di un puff (senza fill): chiamare ctx.fill() dopo
function smokeCloudPath(g,cx,cy,type,scale){
 g.beginPath();
 const ac=(x,y,r)=>{g.moveTo(x+r,y);g.arc(x,y,r,0,TAU)};
 const ae=(x,y,rx,ry,rot)=>{g.moveTo(x+rx,y);g.ellipse(x,y,rx,ry,rot,0,TAU)};
 if(type===0){
  ac(cx,cy,45*scale);
  ac(cx+35*scale,cy-12*scale,38*scale);
  ac(cx-30*scale,cy+8*scale,32*scale);
 }else if(type===1){
  ae(cx,cy,70*scale,22*scale,0.15);
  ae(cx+45*scale,cy-4*scale,50*scale,18*scale,0);
  ac(cx+20*scale,cy-2*scale,28*scale);
 }else if(type===2){
  ac(cx,cy,50*scale);
  ac(cx-25*scale,cy-22*scale,35*scale);
  ac(cx+30*scale,cy-18*scale,40*scale);
  ac(cx+5*scale,cy-38*scale,25*scale);
  ac(cx,cy-15*scale,30*scale);
 }else{
  ac(cx-35*scale,cy,32*scale);
  ac(cx,cy+6*scale,42*scale);
  ac(cx+38*scale,cy-4*scale,28*scale);
  ac(cx+65*scale,cy+4*scale,22*scale);
 }
 g.closePath();
}

// Estensione massima dal centro di ciascuna forma (unità di scale × 1):
const SHAPE_EXTENT=[78,95,78,90];

// 3 nuvolette fisse: ognuna con la sua forma e il suo grigio ben distinto.
// 225 = chiaro, 145 = medio, 80 = scuro.
const SMOKE_3=[
 {type:0, tone:225},   // chiaro  (3 cerchi)
 {type:2, tone:145},   // medio   (5 cerchi)
 {type:3, tone:80}     // scuro   (4 cerchi)
];

function drawSmokes(){
 if(!smokes.length)return;
 for(const s of smokes){
  const d=Math.hypot(s.x-P.x,s.y-P.y);
  if(d>viewRange(P)*VIEW_MARGIN+s.r)continue;
  const fade=Math.min(1,s.t<1?s.t:(s.life-s.t<1?(s.life-s.t):1));
  const k=clamp(fade,0,1);
  if(k<=0)continue;

  ctx.save();

  // 0. cerchio di copertura: delinea ESATTAMENTE l'area dell'effetto (raggio = s.r)
  //    con un grigio neutro a opacità 20%.
  ctx.fillStyle=`rgba(150,150,150,${0.20*k})`;
  ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,TAU);ctx.fill();

  // 1. 3 nuvolette animate, opacità 20%
  //    • angoli fissi a 120° (0°, 120°, 240°) + rotazione collettiva lenta
  //      → restano sempre equidistanti, nessuna direzione "scoperta".
  //    • distanza dal centro oscilla 0.45..0.55·s.r (per nuvoletta, sfasata)
  //      → non sembrano un unico corpo rigido, ma restano ben distribuite.
  //    • raggio cloud fisso a 0.60·s.r → bordo esterno raggiunto: d+R ≈ 1.05..1.15·s.r.
  //    • ampiezza oscillazione piccola (±0.10·s.r) per non uscire dall'area.
  const A=0.20*k;                            // opacità uniforme al 20%
  const rot=s.t*0.35;                        // rotazione collettiva (rad/s)
  const CLOUD_MUL=1.30;                      // nuvolette +30%
  for(let i=0;i<3;i++){
   const p=SMOKE_3[i];
   const angle=rot+i*(TAU/3);                // 120° fissi + rotazione
   // distanza: 0.45..0.55·s.r, sfasata nel tempo per ogni nuvoletta
   const distMul=0.50+0.05*Math.sin(s.t*0.7+i*2.1);
   const r=distMul*s.r;
   const cx=s.x+Math.cos(angle)*r;
   const cy=s.y+Math.sin(angle)*r;
   const scale=(0.60*CLOUD_MUL*s.r)/SHAPE_EXTENT[p.type];
   // 1a. contorno: stessa forma leggermente più grande (6%) e di tono più scuro (-45)
   const tD=Math.max(0,p.tone-45);
   ctx.fillStyle=`rgba(${tD},${tD},${tD},${A})`;
   smokeCloudPath(ctx,cx,cy,p.type,scale*1.06);
   ctx.fill();
   // 1b. corpo: forma a scala nominale e tono principale
   ctx.fillStyle=`rgba(${p.tone},${p.tone},${p.tone},${A})`;
   smokeCloudPath(ctx,cx,cy,p.type,scale);
   ctx.fill();
  }

  ctx.restore();
 }
}
// ===== marker degli attacchi nucleari in arrivo (world space) =====
function drawNukeMarkers(){
 if(!NUKES.length)return;
 const now=performance.now();
 for(const n of NUKES){
  if(n.flash>=0)continue;
  const pul=0.5+0.5*Math.sin(now/150);
  ctx.save();
  ctx.translate(n.x,n.y);
  // cerchio bersaglio — raggio REALE della distruzione
  ctx.strokeStyle=`rgba(255,${Math.round(60+60*pul)},60,${0.55+0.4*pul})`;
  ctx.lineWidth=3;
  ctx.setLineDash([16,12]);ctx.beginPath();ctx.arc(0,0,NUKE_RADIUS,0,TAU);ctx.stroke();ctx.setLineDash([]);
  // alone interno sottile alla metà (solo visivo, per dare prospettiva)
  ctx.setLineDash([6,10]);ctx.strokeStyle=`rgba(255,140,60,${0.35+0.25*pul})`;
  ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,NUKE_RADIUS*0.5,0,TAU);ctx.stroke();ctx.setLineDash([]);
  // croce
  ctx.strokeStyle=`rgba(255,60,60,${0.7+0.3*pul})`;
  ctx.lineWidth=2.5;
  ctx.beginPath();ctx.moveTo(-22,0);ctx.lineTo(22,0);ctx.moveTo(0,-22);ctx.lineTo(0,22);ctx.stroke();
  // timer
  ctx.fillStyle='#ff3333';ctx.font='bold 22px system-ui,sans-serif';ctx.textAlign='center';
  ctx.fillText(Math.ceil(NUKE_DELAY-n.t),0,-34);
  ctx.restore();
 }
}
// ===== flash dei nuke che esplodono (screen space, stile NK) =====
function drawNukeFlashes(){
 if(!NUKES.length)return;
 for(const n of NUKES){
  if(n.flash<0)continue;
  const u=clamp(n.flash/2.5,0,1),fade=Math.min(1,n.flash<0.5?n.flash/0.5:(n.flash<1.0?1:1-(n.flash-1)/1.5));
  if(fade<=0)continue;
  const sx=(n.x-camX)*zoom,sy=(n.y-camY)*zoom,R=Math.max(1,Math.hypot(W,H)*1.2*u*u);
  const g=ctx.createRadialGradient(sx,sy,0,sx,sy,R);
  g.addColorStop(0,`rgba(255,255,255,${fade})`);
  g.addColorStop(0.7,`rgba(255,250,235,${fade*0.9})`);
  g.addColorStop(1,'rgba(255,240,200,0)');
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  ctx.fillStyle=`rgba(255,255,255,${fade*u*u*0.6})`;ctx.fillRect(0,0,W,H);
 }
}
// ===== ciclo di disegno =====
// ===== slow motion: vignettatura viola + velo leggero (un solo fillRect, gradiente in cache) =====
let _slwG=null,_slwW=0,_slwH=0;
function drawSlow(){
 const f=SLOW.f;if(f<.01)return;
 if(!_slwG||_slwW!==W||_slwH!==H){_slwW=W;_slwH=H;const R=Math.hypot(W,H)/2;
  _slwG=ctx.createRadialGradient(W/2,H/2,R*.4,W/2,H/2,R);
  _slwG.addColorStop(0,'rgba(178,125,255,.06)');   // centro: velo appena visibile
  _slwG.addColorStop(1,'rgba(150,100,255,.55)')}   // bordi: vignettatura
 ctx.save();
 ctx.globalAlpha=f*(.85+.15*Math.sin(performance.now()*.0025));   // dissolvenza + lieve "respiro"
 ctx.fillStyle=_slwG;ctx.fillRect(0,0,W,H);
 ctx.restore()}
function draw(ldt){
 const p=P;
 if(!p || W<2 || H<2 || !isFinite(zoom) || zoom<0.05 || !isFinite(camX) || !isFinite(camY)){
   zoom=1; camX=p ? p.x : 0; camY=p ? p.y : 0;
   return;
 }
 const VW=W/zoom, VH=H/zoom; bakePrefetch(camX,camY,camX+VW,camY+VH);
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
   if(typeof natDrawGround==='function')natDrawGround();   // animali e pesci (AGnature.js): sotto la nebbia di guerra

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

   if(typeof natDrawAir==='function')natDrawAir();   // uccelli in volo, insetti, foglie, nebbia, vapore, fumo (AGnature.js)

   // 9b. Fumogeni e marker nucleari (sopra le unità, sotto gli effetti)
   drawSmokes();
   drawNukeMarkers();

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
 drawNuke();drawTdNuke();drawNukeFlashes();
 drawSlow();
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
 if(G.mode==1)drawDmHud();else drawMissionHud(p);
 ctx.fillStyle='#fff';
 if(G.msgT>0){ctx.font='bold 18px system-ui,sans-serif';ctx.fillText(G.msg,W/2,116)}
 if(SPB.near&&!G.menu){const S=SB_TYPES[SPB.near.sb],t=S.n.toUpperCase()+(MOBILE?': tocca USA':': premi R')+' → '+S.e+' per '+S.t+' s';ctx.font='bold 17px system-ui,sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#000';ctx.strokeText(t,W/2,H-86);ctx.fillStyle=S.c;ctx.fillText(t,W/2,H-86)}
 if(ARM.near&&!G.menu){const t=MOBILE?'ARMERIA: tocca ARM':'ARMERIA: premi R per cambiare armi e upgrade';ctx.font='bold 17px system-ui,sans-serif';ctx.textAlign='center';ctx.lineWidth=4;ctx.strokeStyle='#000';ctx.strokeText(t,W/2,H-62);ctx.fillStyle='#7dff8a';ctx.fillText(t,W/2,H-62)}
 if(p.hp<=0&&!G.over){ctx.font='bold 22px system-ui,sans-serif';ctx.fillText(G.mode==1?'Mech distrutto, rientro in corso…':NET.on?'Mech incapacitato: un alleato deve restarti accanto per rialzarti':'',W/2,H/2)}
 if(G.over){ctx.fillStyle='rgba(0,0,0,.6)';ctx.fillRect(0,0,W,H);
  if(!CAMP.on){ctx.fillStyle='#fff';ctx.font='bold 30px system-ui,sans-serif';ctx.fillText(G.over==2?(G.overMsg||'Vittoria!'):(G.overMsg||'Mech distrutto'),W/2,H/2-8);
  ctx.font='16px system-ui,sans-serif';ctx.fillText(NET.on&&!NET.host?'In attesa dell’host…':(MOBILE?'Tocca lo schermo per ricominciare':'Premi R per ricominciare'),W/2,H/2+24)}}
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
function craterDraw(){
 if(!CRAT.length)return;
 cratSpr();
 const VW=W/zoom,VH=H/zoom,vr=G.fog>.02?viewRange(P)*VIEW_MARGIN:1e9;
 let lim=G.q>=2?40:G.q==1?25:15;   // tetto di crateri disegnati per qualità (come civDraw)
 for(let i=CRAT.length-1;i>=0&&lim>0;i--){const s=CRAT[i],z=s.r*2.6,hz=z/2;   // il fattore 2.6 include l'alone bruciato oltre il raggio nominale
  if(s.x+hz<camX||s.x-hz>camX+VW||s.y+hz<camY||s.y-hz>camY+VH)continue;
  const dx=s.x-P.x,dy=s.y-P.y,vrp=vr+hz;if(dx*dx+dy*dy>vrp*vrp)continue;
  lim--;
  ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.a);ctx.globalAlpha=.85;ctx.drawImage(CRAT_S[s.v],-hz,-hz,z,z);ctx.restore()}}
function foamDraw(){
 if(!FOAM.length)return;
 foamSpr();
 const VW=W/zoom,VH=H/zoom,x0=camX-50,y0=camY-50,x1=camX+VW+50,y1=camY+VH+50,vr=G.fog>.02?viewRange(P)*VIEW_MARGIN:1e9,vr2=vr*vr;
 let lim=G.q>=2?20:G.q==1?14:8;
 for(let i=FOAM.length-1;i>=0&&lim>0;i--){const s=FOAM[i];
  if(s.x<x0||s.x>x1||s.y<y0||s.y>y1)continue;
  const dx=s.x-P.x,dy=s.y-P.y;if(dx*dx+dy*dy>vr2)continue;
  lim--;
  const z=s.r*2.6,al=1-s.t/FOAM_T;
  ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.a);ctx.globalAlpha=al;ctx.drawImage(FOAM_S[s.v],-z/2,-z/2,z,z);ctx.restore()}}
// chiamata PRIMA del velo di nebbia: dove la nebbia copre, i civili non si vedono (niente calcoli di visibilità)
function civDraw(){
 if(!CIV.n&&!CIV.spl.length)return;civSpr();
 const VW=W/zoom,VH=H/zoom,x0=camX-50,y0=camY-50,x1=camX+VW+50,y1=camY+VH+50,vr=G.fog>.02?viewRange(P)*VIEW_MARGIN:1e9,vr2=vr*vr;
 for(const s of CIV.spl){if(s.x<x0||s.x>x1||s.y<y0||s.y>y1)continue;const z=40*s.sc;ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.a);ctx.drawImage(CIVS.s[s.v],-z/2,-z/2,z,z);ctx.restore()}
 let lim=G.q>=2?90:G.q==1?55:30;                            // tetto di civili disegnati, in base alla qualità
 for(let i=0;i<CIV.n&&lim>0;i++){if(CIV.d[i])continue;const x=CIV.X[i],y=CIV.Y[i];
  if(x<x0||x>x1||y<y0||y>y1)continue;const car=CIV.k[i];if(!car&&zoom<.45)continue;   // con la visuale lontana gli omini spariscono
  const dx=x-P.x,dy=y-P.y;if(dx*dx+dy*dy>vr2)continue;
  lim--;const im=car?CIVS.v[CIV.c[i]]:civPed(CIV.c[i],CIV.h[i],((CIV.t*5+i)|0)&1);
  ctx.save();ctx.translate(x,y);ctx.rotate(CIV.H[i]);ctx.drawImage(im,-im.width/2,-im.height/2);ctx.restore()}}
