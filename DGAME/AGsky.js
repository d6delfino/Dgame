'use strict';
/* AIRGRUNT · AGsky.js — MACCHINE CIVILI VOLANTI (scenografia leggera, stesso schema delle auto civili in strada).
   REGOLE:
   - le rotte nascono dal seed: rette che attraversano la mappa (quasi sempre sopra una città) ed escono oltre il bordo;
     la posizione dipende solo dall'orologio dei civili CIV.t (già sincronizzato con lo snapshot): ogni client le calcola da sé, niente rete;
   - a fine rotta la macchina ricompare all'inizio: entrambi i punti sono fuori mappa (SKY_EDGE), il salto non si vede;
   - niente collisioni con edifici, alberi o acqua (volano); stanno nello strato aereo: le colpiscono i colpi con tz -1 o 1 e le esplosioni;
   - la distruzione la decide l'host ('sk' a tutti, elenco dei distrutti nel 'welcome'); chi ne abbatte una perde CIV_PEN kill, come per i civili;
   - disegno: immagini pronte create una volta sola per tipo e colore (con la loro ombra), tetto di disegni per qualità, solo quelle a schermo;
   - suono: un solo loop (motore del jet a volume dei motori dell'AI) che segue la macchina più vicina (aiMoveSnd in AGveh.js).
   Valori: SKY_MIN, SKY_PER, SKY_MAX, SKY_EDGE, SKY_T, SKY_COLS, SKY_DRAW in AGconf.js. */
const SKY={n:0,AX:null,AY:null,DX:null,DY:null,L:null,S0:null,V:null,H:null,T:null,C:null,SH:null,D:null,VA:null,X:null,Y:null};

// ===== creazione dal seed (uguale su host e client) =====
function skyInit(){const S=SKY;S.n=0;if(!M||M.hi)return;
 const R=rng((M.seed|0)+5303),cities=M.sites.filter(s=>s.k=='g'),n=Math.min(SKY_MAX,SKY_MIN+cities.length*SKY_PER),E=SKY_EDGE;
 const F=()=>new Float32Array(n);
 S.AX=F();S.AY=F();S.DX=F();S.DY=F();S.L=F();S.S0=F();S.V=F();S.H=F();S.SH=F();S.VA=F();S.X=F();S.Y=F();
 S.T=new Uint8Array(n);S.C=new Uint8Array(n);S.D=new Uint8Array(n);
 const wsum=SKY_T.reduce((a,t)=>a+t.wt,0),pick=()=>{let x=R()*wsum;for(let k=0;k<SKY_T.length;k++){x-=SKY_T[k].wt;if(x<0)return k}return 0};
 for(let i=0;i<n;i++){
  let px,py;   // punto di passaggio: dentro una città (75%) o in un punto qualunque
  if(cities.length&&R()<.75){const c=cities[R()*cities.length|0],a=R()*TAU,d=Math.sqrt(R())*c.r;px=c.x+Math.cos(a)*d;py=c.y+Math.sin(a)*d}
  else{px=200+R()*(WW-400);py=200+R()*(WH-400)}
  const a=R()*TAU,dx=Math.cos(a),dy=Math.sin(a);
  let t0=-1e9,t1=1e9;   // tratto della retta dentro il riquadro allargato [-E, W+E]: entra e esce fuori mappa
  for(const[p,d,W]of[[px,dx,WW],[py,dy,WH]])if(Math.abs(d)>1e-6){let ta=(-E-p)/d,tb=(W+E-p)/d;if(ta>tb){const q=ta;ta=tb;tb=q}if(ta>t0)t0=ta;if(tb<t1)t1=tb}
  const k=pick(),T=SKY_T[k];
  S.AX[i]=px+dx*t0;S.AY[i]=py+dy*t0;S.DX[i]=dx;S.DY[i]=dy;S.L[i]=Math.max(1,t1-t0);S.H[i]=a;
  S.T[i]=k;S.C[i]=R()*SKY_COLS.length|0;S.V[i]=T.v[0]+R()*(T.v[1]-T.v[0]);S.S0[i]=R()*S.L[i];S.SH[i]=16+R()*14}   // SH = quota (distanza dell'ombra)
 S.n=n;skyTick(0)}

// ===== ogni fotogramma: solo una moltiplicazione per macchina =====
function skyTick(dt){const S=SKY;if(!S.n)return;
 if(!CIV.n)CIV.t+=dt;   // mappa senza civili: l'orologio lo fa avanzare questo modulo (civTick non lo tocca)
 const t=CIV.t;
 for(let i=0;i<S.n;i++){if(S.D[i])continue;const s=(S.S0[i]+S.V[i]*t)%S.L[i];S.X[i]=S.AX[i]+S.DX[i]*s;S.Y[i]=S.AY[i]+S.DY[i]*s}}

// ===== colpi ed esplosioni (solo host) =====
function skyHitB(b){const S=SKY;   // true = il proiettile si ferma (il razzo non distrugge da sé: ci pensa la sua esplosione)
 for(let i=0;i<S.n;i++){if(S.D[i])continue;const r=SKY_T[S.T[i]].r,dx=b.x-S.X[i],dy=b.y-S.Y[i];
  if(dx>r||dx<-r||dy>r||dy<-r||dx*dx+dy*dy>=r*r)continue;
  if(!b.ex)skyKill(i,b.o);return true}
 return false}
function skyArea(x,y,r,o){const S=SKY;for(let i=0;i<S.n;i++)if(!S.D[i]&&Math.hypot(S.X[i]-x,S.Y[i]-y)<r+SKY_T[S.T[i]].r)skyKill(i,o)}
// rem = evento arrivato dall'host (niente penalità né rete) · quiet = chi entra in partita: già distrutta, niente effetti
function skyKill(i,o,rem,quiet){const S=SKY;if(i<0||i>=S.n||S.D[i])return;S.D[i]=1;if(quiet)return;
 const x=S.X[i],y=S.Y[i],gx=x+S.SH[i],gy=y+S.SH[i]*1.3;   // gx,gy: punto a terra sotto la macchina (dove sta la sua ombra)
 fxBoom(x,y,'unit',34);fxSpawn(x,y,'#ffd23f',8,true,40);sfxAt(SFX_LIST.boom,.8,x,y,60);
 if(!inWater(gx,gy,0)){makeBlood(gx,gy,1.2,true);craterAdd(gx,gy,22)}   // il rottame cade: olio e piccolo cratere
 if(rem)return;
 if(NET.on&&NET.host)bcast({t:'sk',i});
 if(o!=null&&o>=0&&o<1000){const q=o===NET.id?P:others[o];if(q){q.kills=(q.kills|0)-CIV_PEN;if(q===P)say('Civile ucciso: -'+CIV_PEN+' kill')}}}

// ===== rete =====
const skyDeadPack=()=>{const a=[];for(let i=0;i<SKY.n;i++)if(SKY.D[i])a.push(i);return a};
function skyUnpack(a){if(Array.isArray(a))for(const i of a)skyKill(i|0,null,1,1)}
Handlers.sk=m=>{if(NET.host)return;skyKill(m.i|0,null,1)};

// ===== disegno: immagini pronte (tipo × colore), ognuna con la sua ombra nera, create alla prima richiesta =====
const SKYS=[],SKY_IW=64,SKY_IH=40,SKY_OS=2;   // dimensione dell'immagine in px del mondo · sovracampionamento
function skyArt(g,k,c0,c1){g.lineJoin='round';g.lineWidth=1.2;g.strokeStyle='#111';
 const glass='#9fd8ff',pad=(x,y,rx,ry)=>{g.fillStyle='#1d2a33';g.beginPath();g.ellipse(x,y,rx,ry,0,0,TAU);g.fill();g.strokeStyle='rgba(120,230,255,.85)';g.lineWidth=1.4;g.stroke();g.strokeStyle='#111';g.lineWidth=1.2};
 const rr=(x,y,w,h,r,f,s)=>{g.beginPath();g.roundRect(x,y,w,h,r);g.fillStyle=f;g.fill();if(s)g.stroke()};
 if(k===0){   // berlina volante: 4 pattini a levitazione
  for(const[x,y]of[[11,-9],[11,9],[-11,-9],[-11,9]])pad(x,y,5,3);
  rr(-17,-8,34,16,6,c0,1);rr(-7,-6,14,12,4,c1);rr(5,-5.5,6,11,2,glass);rr(-11,-5,4,10,1.5,'#6fa8c8');
  g.fillStyle='#fff';g.fillRect(15,-6,2,2);g.fillRect(15,4,2,2);g.fillStyle='#ff3b3b';g.fillRect(-17,-6,2,2);g.fillRect(-17,4,2,2)}
 else if(k===1){   // taxi drone: 4 rotori
  g.strokeStyle='#222';g.lineWidth=2.5;g.beginPath();for(const[x,y]of[[13,-11],[13,11],[-13,-11],[-13,11]]){g.moveTo(0,0);g.lineTo(x,y)}g.stroke();
  for(const[x,y]of[[13,-11],[13,11],[-13,-11],[-13,11]]){g.fillStyle='rgba(200,220,230,.25)';g.strokeStyle='rgba(220,235,245,.7)';g.lineWidth=1;g.beginPath();g.arc(x,y,7,0,TAU);g.fill();g.stroke();g.fillStyle='#222';g.beginPath();g.arc(x,y,2,0,TAU);g.fill()}
  g.strokeStyle='#111';g.lineWidth=1.2;rr(-11,-7,22,14,6,c0,1);g.fillStyle=glass;g.beginPath();g.ellipse(4,0,5.5,4.5,0,0,TAU);g.fill();rr(-6,-2,4,4,1,c1)}
 else if(k===2){   // furgone volante
  for(const[x,y]of[[13,-10],[13,10],[-13,-10],[-13,10]])pad(x,y,5.5,3);
  rr(-20,-9,40,18,4,c0,1);rr(9,-8,10,16,3,c1);rr(15,-6.5,4,13,1.5,glass);
  g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1;g.beginPath();g.moveTo(-17,0);g.lineTo(7,0);g.stroke();
  g.fillStyle='#ff3b3b';g.fillRect(-20,-7,2,3);g.fillRect(-20,4,2,3)}
 else{   // sportiva volante: cuneo con alette e propulsori
  g.fillStyle='rgba(255,160,60,.45)';for(const y of[-3.5,3.5]){g.beginPath();g.arc(-20,y,4.5,0,TAU);g.fill()}
  g.fillStyle='#ff9a3a';for(const y of[-3.5,3.5]){g.beginPath();g.arc(-19,y,2.4,0,TAU);g.fill()}
  g.fillStyle=c1;for(const s of[-1,1]){g.beginPath();g.moveTo(-12,9*s);g.lineTo(-20,13*s);g.lineTo(-17,5*s);g.closePath();g.fill();g.stroke()}
  g.beginPath();g.moveTo(21,0);g.lineTo(4,-8);g.lineTo(-14,-9);g.lineTo(-18,-5);g.lineTo(-18,5);g.lineTo(-14,9);g.lineTo(4,8);g.closePath();g.fillStyle=c0;g.fill();g.stroke();
  g.fillStyle=glass;g.beginPath();g.ellipse(1,0,7,3.8,0,0,TAU);g.fill()}}
function skySpr(j){const sea=typeof thExt==='function'&&thExt()=='sea',jj=j+(sea?1000:0);let s=SKYS[jj];if(s)return s;   // fondale marino: al posto delle macchine volanti, sottomarini (xSkySub in AGmapX.js)
 const k=(j/SKY_COLS.length)|0,col=SKY_COLS[j%SKY_COLS.length],mk=()=>{const c=document.createElement('canvas');c.width=SKY_IW*SKY_OS;c.height=SKY_IH*SKY_OS;return c};
 const im=mk(),g=im.getContext('2d');g.setTransform(SKY_OS,0,0,SKY_OS,SKY_IW*SKY_OS/2,SKY_IH*SKY_OS/2);if(sea)xSkySub(g,k,col[0],col[1]);else skyArt(g,k,col[0],col[1]);
 const sh=mk(),h=sh.getContext('2d');h.drawImage(im,0,0);h.globalCompositeOperation='source-in';h.fillStyle='#000';h.fillRect(0,0,sh.width,sh.height);   // ombra: stessa sagoma, nera
 return SKYS[jj]={im,sh}}
// chiamata dopo le unità volanti: ombra a terra spostata con la quota, poi la macchina · si vedono come le unità in volo (entro la visuale, sempre sopra la nebbia)
function skyDraw(ldt){const S=SKY;if(!S.n)return;
 const VW=W/zoom,VH=H/zoom,x0=camX-70,y0=camY-70,x1=camX+VW+70,y1=camY+VH+70;
 let lim=SKY_DRAW[G.q>=2?2:G.q==1?1:0];const hw=SKY_IW/2,hh=SKY_IH/2;
 for(let i=0;i<S.n&&lim>0;i++){if(S.D[i])continue;const x=S.X[i],y=S.Y[i];if(x<x0||x>x1||y<y0||y>y1)continue;
  const tg=seen(x,y,true)?1:0;S.VA[i]+=(tg-S.VA[i])*Math.min(1,10*ldt);const a=S.VA[i];if(a<.03)continue;lim--;
  const s=skySpr(S.T[i]*SKY_COLS.length+S.C[i]),h=S.H[i],d=S.SH[i];
  if(!(M.th==8&&xVoid(x+d,y+d*1.3,0))){ctx.save();ctx.translate(x+d,y+d*1.3);ctx.rotate(h);ctx.globalAlpha=a*.28;ctx.drawImage(s.sh,-hw,-hh,SKY_IW,SKY_IH);ctx.restore()}   // ombra a terra (nella stazione orbitale non sul vuoto)
  ctx.save();ctx.translate(x,y);ctx.rotate(h);ctx.globalAlpha=a;ctx.drawImage(s.im,-hw,-hh,SKY_IW,SKY_IH);ctx.restore()}             // macchina
 ctx.globalAlpha=1}
