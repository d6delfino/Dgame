'use strict';
/* AIRGRUNT · AGworld.js — fondamenta del mondo (nessun disegno di mappa).
   1) matematica, generatore con seed, primitive geometriche degli ostacoli, griglia spaziale
   2) stato globale della partita, orientamento del mare (SIDE), terreno, acqua, collisioni, navigazione A*
   3) effetti a particelle e suoni (tutto locale: in rete passano solo gli eventi) */
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const ad=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));       // differenza di angoli normalizzata
const lerp=(a,b,t)=>a+(b-a)*t;
const TAU=Math.PI*2;
function rng(s){return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

// ===== primitive =====
function prim(k,x,y,a,b,n,pts){
 const q={k,x,y,a,b,n};
 if(k=='r'){q.vs=[[x-a,y-b],[x+a,y-b],[x+a,y+b],[x-a,y+b]];q.pl=[[1,0,x+a],[-1,0,a-x],[0,1,y+b],[0,-1,b-y]]}
 else if(k=='p'){q.vs=[];q.pl=[];for(let i=0;i<n;i++){const t=i*TAU/n,u=(i+.5)*TAU/n,c=Math.cos(u),s=Math.sin(u);q.vs.push([x+Math.cos(t)*a,y+Math.sin(t)*a]);q.pl.push([c,s,x*c+y*s+a*Math.cos(Math.PI/n)])}}
 else if(k=='g'){q.vs=pts;q.pl=[];let cx=0,cy=0;for(const p of pts){cx+=p[0];cy+=p[1]}cx/=pts.length;cy/=pts.length;
  for(let i=0;i<pts.length;i++){const p=pts[i],r=pts[(i+1)%pts.length];let nx=r[1]-p[1],ny=p[0]-r[0];const l=Math.hypot(nx,ny)||1;nx/=l;ny/=l;
   if(nx*((p[0]+r[0])/2-cx)+ny*((p[1]+r[1])/2-cy)<0){nx=-nx;ny=-ny}q.pl.push([nx,ny,nx*p[0]+ny*p[1]])}}
 return q}
const primR=q=>q.k=='c'?q.a:q.k=='r'?Math.hypot(q.a,q.b):q.a; // raggio della primitiva attorno al proprio centro (poligoni 'g': vedi geom)
function geom(pr,an){let r=0;for(const q of pr){const m=q.k=='g'?Math.max(...q.vs.map(v=>Math.hypot(v[0],v[1]))):Math.hypot(q.x,q.y)+primR(q);if(m>r)r=m}
 if(!an){const f=q=>[q.x,q.y,q.k=='r'?q.a:q.a,q.k=='r'?q.b:q.a],a0=pr[0],a1=pr[pr.length-1];an=[f(a0),f(a1===a0?pr[0]:a1)]}
 return{pr,an,r}}
const BSHAPES=['rect','square','circle','hex','oct','combo','L','cross','T','U','H','Z','tower','quad','fact','pyramid'];
function bgeom(sh,w,h){const a=w/2,b=h/2,R=Math.max(w,h)/2,P=prim;let pr,an;
 switch(sh){
  case'circle':pr=[P('c',0,0,R)];break;
  case'hex':pr=[P('p',0,0,R,0,6)];break;
  case'oct':pr=[P('p',0,0,R,0,8)];break;
  case'combo':pr=[P('r',0,0,a,b),P('c',a*.5,0,b*.8)];break;
  case'L':pr=[P('r',0,b/2,a,b/2),P('r',-a/2,-b/2,a/2,b/2)];an=[[a/2,b/2,a/2,b/2],[-a/2,-b/2,a/2,b/2]];break;
  case'cross':pr=[P('r',0,0,a,b*.35),P('r',0,0,a*.35,b)];an=[[-a*.65,0,a*.3,b*.3],[a*.65,0,a*.3,b*.3]];break;
  case'T':pr=[P('r',0,-b*.65,a,b*.35),P('r',0,b*.35,a*.35,b*.65)];an=[[-a*.55,-b*.65,a*.35,b*.3],[0,b*.4,a*.3,b*.5]];break;
  case'U':pr=[P('r',0,b*.55,a,b*.45),P('r',-a*.72,-b*.45,a*.28,b*.55),P('r',a*.72,-b*.45,a*.28,b*.55)];an=[[0,b*.55,a*.6,b*.35],[-a*.72,-b*.45,a*.2,b*.4]];break;
  case'H':pr=[P('r',-a*.72,0,a*.28,b),P('r',a*.72,0,a*.28,b),P('r',0,0,a*.5,b*.3)];an=[[-a*.72,0,a*.2,b*.7],[a*.72,0,a*.2,b*.7]];break;
  case'Z':pr=[P('r',-a*.35,-b*.5,a*.65,b*.5),P('r',a*.35,b*.5,a*.65,b*.5)];break;
  case'tower':pr=[P('r',0,b*.4,a,b*.6),P('c',0,-b*.35,Math.min(a,b)*.6)];break;
  case'pyramid':pr=[P('r',0,0,a,b), P('r',0,0,a*0.7,b*0.7), P('r',0,0,a*0.4,b*0.4)];break;
  case'quad':pr=[P('r',-a*.62,-b*.62,a*.38,b*.38),P('r',a*.62,-b*.62,a*.38,b*.38),P('r',-a*.62,b*.62,a*.38,b*.38),P('r',a*.62,b*.62,a*.38,b*.38)];break;
  case'fact':{const s=Math.min(a,b)*.3;pr=[P('r',-a*.15,0,a*.85,b),P('c',a*.78,-b*.45,s),P('c',a*.78,b*.45,s)];an=[[-a*.5,0,a*.3,b*.7],[a*.1,0,a*.3,b*.7]];break}
  default:if(sh=='square')w=h=(w+h)/2;pr=[P('r',0,0,w/2,h/2)];
 }
 return geom(pr,an)}
function convexHull(p){p=p.slice().sort((u,v)=>u[0]-v[0]||u[1]-v[1]);const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lo=[],up=[];
 for(const q of p){while(lo.length>1&&cr(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q)}
 for(let i=p.length-1;i>=0;i--){const q=p[i];while(up.length>1&&cr(up[up.length-2],up[up.length-1],q)<=0)up.pop();up.push(q)}
 lo.pop();up.pop();return lo.concat(up)}
function rockGeom(pts){const g=geom([prim('g',0,0,0,0,0,convexHull(pts))]);return g}

// ===== distanza e raggi =====
function bsd(o,x,y){let m=1e9; // distanza con segno dal bordo (negativa dentro) di un punto in coordinate locali
 for(const q of o.pr){let d;
  if(q.k=='c')d=Math.hypot(x-q.x,y-q.y)-q.a;
  else if(q.k=='r'){const bx=Math.abs(x-q.x)-q.a,by=Math.abs(y-q.y)-q.b;d=Math.hypot(Math.max(bx,0),Math.max(by,0))+Math.min(Math.max(bx,by),0)}
  else{d=-1e9;for(const p of q.pl){const v=p[0]*x+p[1]*y-p[2];if(v>d)d=v}}
  if(d<m)m=d}
 return m}
function bgr(o,x,y){const e=.5,gx=bsd(o,x+e,y)-bsd(o,x-e,y),gy=bsd(o,x,y+e)-bsd(o,x,y-e),l=Math.hypot(gx,gy);return l>1e-6?[gx/l,gy/l]:[1,0]}
const toLocal=(o,x,y)=>{const dx=x-o.x,dy=y-o.y;return[dx*o.c+dy*o.s,-dx*o.s+dy*o.c]};
const toWorld=(o,x,y)=>[o.x+x*o.c-y*o.s,o.y+x*o.s+y*o.c];
function bHit(o,x,y){if(o.t=='t')return Math.hypot(x-o.x,y-o.y)<o.r;const l=toLocal(o,x,y);return bsd(o,l[0],l[1])<=0}
function rayCirc(o,px,py,dx,dy){const ox=o.x-px,oy=o.y-py,b=ox*dx+oy*dy,disc=b*b-(ox*ox+oy*oy-o.r*o.r);if(disc<0)return 1e9;const d=b-Math.sqrt(disc);return d<0?1e9:d}
function rayB(o,px,py,dx,dy){let best=1e9;
 const x0=(px-o.x)*o.c+(py-o.y)*o.s,y0=-(px-o.x)*o.s+(py-o.y)*o.c,ux=dx*o.c+dy*o.s,uy=-dx*o.s+dy*o.c;
 for(const q of o.pr){let d=1e9;
  if(q.k=='c'){const ox=x0-q.x,oy=y0-q.y,b=-(ox*ux+oy*uy),disc=b*b-(ox*ox+oy*oy-q.a*q.a);if(disc>=0){const t=b-Math.sqrt(disc);if(t>=0)d=t}}
  else{let t0=0,t1=1e9,ok=true;
   for(const p of q.pl){const dn=ux*p[0]+uy*p[1],on=x0*p[0]+y0*p[1]-p[2];
    if(Math.abs(dn)<1e-9){if(on>0){ok=false;break}}else{const t=-on/dn;if(dn<0){if(t>t0)t0=t}else if(t<t1)t1=t}}
   if(ok&&t1>=t0&&t0>0)d=t0}
  if(d<best)best=d}
 return best}
const rayO=(o,px,py,dx,dy)=>o.t=='t'?rayCirc(o,px,py,dx,dy):rayB(o,px,py,dx,dy);
function nearestPt(o,x,y){ // punto più vicino della sagoma reale dell'ostacolo
 if(o.t=='t'){const dx=o.x-x,dy=o.y-y,d=Math.hypot(dx,dy)||1,k=Math.max(0,d-o.r);return[x+dx/d*k,y+dy/d*k]}
 const l=toLocal(o,x,y),k=Math.max(0,bsd(o,l[0],l[1])),g=bgr(o,l[0],l[1]);return toWorld(o,l[0]-g[0]*k,l[1]-g[1]*k)}

// ===== griglia spaziale degli ostacoli (celle da 256 px) =====
const GCELL=256;let GRID=new Map(),QST=0;const _q=[];
const gk=(cx,cy)=>cx*2048+cy;
function gClear(){GRID=new Map()}
function gAdd(o){const r=o.r+2,x0=Math.floor((o.x-r)/GCELL),x1=Math.floor((o.x+r)/GCELL),y0=Math.floor((o.y-r)/GCELL),y1=Math.floor((o.y+r)/GCELL);
 for(let cx=x0;cx<=x1;cx++)for(let cy=y0;cy<=y1;cy++){const k=gk(cx,cy);let a=GRID.get(k);if(!a)GRID.set(k,a=[]);a.push(o)}}
function qrect(x0,y0,x1,y1,out){out=out||_q;out.length=0;QST++;
 for(let cx=Math.floor(x0/GCELL),ex=Math.floor(x1/GCELL);cx<=ex;cx++)for(let cy=Math.floor(y0/GCELL),ey=Math.floor(y1/GCELL);cy<=ey;cy++){
  const a=GRID.get(gk(cx,cy));if(a)for(const o of a)if(!o.dead&&o.qs!==QST){o.qs=QST;out.push(o)}}
 return out}
const qobs=(x,y,r,out)=>qrect(x-r,y-r,x+r,y+r,out); // ostacoli vivi vicini a (x,y)

// ===== forme naturali (laghi, isole, colline): raggio variabile in funzione dell'angolo =====
function blob(R,x,y,r){const n=36,a=[],ph=[R()*TAU,R()*TAU,R()*TAU],am=[.1+R()*.1,.06+R()*.06,.03+R()*.04];
 for(let i=0;i<n;i++){const t=i/n*TAU;a.push(r*(1+am[0]*Math.sin(2*t+ph[0])+am[1]*Math.sin(3*t+ph[1])+am[2]*Math.sin(5*t+ph[2])+(R()-.5)*.06))}
 return{x,y,a,r}}
function rad(b,x,y){const n=b.a.length,t=Math.atan2(y-b.y,x-b.x),f=(t<0?t+TAU:t)/TAU*n,i=Math.floor(f)%n,u=f-Math.floor(f);return b.a[i]*(1-u)+b.a[(i+1)%n]*u}
const inBlob=(b,x,y,m)=>Math.hypot(x-b.x,y-b.y)<rad(b,x,y)+(m||0);
function segNear(P,x,y){let best=1e9,bx=0,by=0,bi=0,bu=0; // punto più vicino di una polilinea: [distanza, x, y, indice del tratto, posizione 0..1 nel tratto]
 for(let i=0;i<P.length-1;i++){const ax=P[i][0],ay=P[i][1],vx=P[i+1][0]-ax,vy=P[i+1][1]-ay,u=clamp(((x-ax)*vx+(y-ay)*vy)/(vx*vx+vy*vy||1),0,1),qx=ax+vx*u,qy=ay+vy*u,d=Math.hypot(x-qx,y-qy);if(d<best){best=d;bx=qx;by=qy;bi=i;bu=u}}
 return[best,bx,by,bi,bu]}
// larghezza di un fiume nel punto trovato da segNear (rv.wp = larghezza in ogni punto del tracciato; i fiumi vecchi senza wp usano rv.w)
const rvW=(rv,q)=>rv.wp?rv.wp[q[3]]+(rv.wp[q[3]+1]-rv.wp[q[3]])*q[4]:rv.w;
// hash ripetibile di tre interi (0..1): decorazioni e varianti deterministiche
const hs=(i,j,s)=>{let h=Math.imul(i|0,374761393)+Math.imul(j|0,668265263)+Math.imul((s|0)+1,1274126177)|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296};

let M=null;                                    // mappa corrente (la crea AGmap.js)
const G={mode:0,diff:1,mis:0,seed:1,over:0,overMsg:'',msg:'',msgT:0,started:false,fog:1,t:0,q:2,fps:0,
 mt:0,sel:0,want:-1,aiCi:null,alCi:null,profile:0,weatherMode:-1,theme:0,th:0};   // aiCi = colore dell'AI nemica · alCi = colore dell'AI alleata (guardie, torrette alleate)                        // mode 0 = missioni, 1 = deathmatch; mt = missione in corso; sel = scelta nella lobby; profile = value dello slider (0 = Casuale, 1..N = PROFILES[profile-1])
let units=[],bullets=[],slashes=[],P=null;
let smokes=[],NUKES=[];   // fumogeni (raggio, durata) e attacchi nucleari in arrivo {x,y,t,owner,flash}
const others={};                               // altri giocatori (id -> giocatore)
const NET={on:false,host:false,id:0,peer:null,conns:{},hostConn:null,n:0,lastN:-1,nextId:1,code:'',lastHost:0};
// meteo: 0 = sereno, 1 = pioggia (stampato sul bake + gocce screen-space); intensità 0..1, wind = vento orizzontale -1..1
const WX={rain:0,snow:0,sand:0,intensity:1,wind:0.15,drops:[],flakes:[],t:0};
const authority=()=>!NET.on||NET.host;         // chi simula davvero (singolo o host)
const say=m=>{G.msg=m;G.msgT=2};
// ===== slow motion: SLOW.t = secondi reali rimasti · SLOW.own = id di chi l'ha attivato (-1 = nessuno) · SLOW.cd = ricarica locale =====
const SLOW={t:0,own:-1,cds:[],f:0};   // cds = ricariche locali, una per ogni copia equipaggiata · f = intensità dell'effetto grafico (0..1)
const tsOf=id=>SLOW.t>0?(id===SLOW.own?SLOW_P:SLOW_W):1;   // fattore di tempo di un'entità (id del giocatore o del tiratore)
function slowStart(id){SLOW.own=id;SLOW.t=SLOW_T;if(id===NET.id)say('Slow motion!')}
function slowTick(rd){                                      // chiamata una volta per fotogramma: restituisce il dt del MONDO
 for(let i=0;i<SLOW.cds.length;i++)if(SLOW.cds[i]>0)SLOW.cds[i]=Math.max(0,SLOW.cds[i]-rd);
 SLOW.f=SLOW.t>0?Math.min(1,SLOW.f+rd*5):Math.max(0,SLOW.f-rd*3);   // entra in 0,2 s, esce in 0,33 s
 if(SLOW.t<=0)return rd;
 SLOW.t-=rd;if(SLOW.t<=0){SLOW.t=0;SLOW.own=-1}
 return rd*SLOW_W}

// ===== terreno =====
// ===== orientamento del mondo: il mare può stare su ogni lato =====
// SIDE: 0 est, 1 sud, 2 ovest, 3 nord (lo decide genMap dal seed). (u,v) sono le coordinate "canoniche": u cresce verso il mare, v corre lungo la costa.
// Passare da (u,v) al mondo è una rotazione di SIDE×90° attorno al centro: un angolo canonico a diventa a+SIDE·π/2.
let SIDE=0;
const toUV=(x,y)=>SIDE==0?[x,y]:SIDE==1?[y,WW-x]:SIDE==2?[WW-x,WH-y]:[WH-y,x];
const fromUV=(u,v)=>SIDE==0?[u,v]:SIDE==1?[WW-v,u]:SIDE==2?[WW-u,WH-v]:[v,WH-u];
const seaU=(x,y)=>SIDE==0?x:SIDE==1?y:SIDE==2?WW-x:WH-y;      // quanto il punto è "verso il mare"
const seaV=(x,y)=>SIDE==0?y:SIDE==1?WW-x:SIDE==2?WH-y:x;      // posizione lungo la costa
// linea di costa: u della riva alla posizione v (costa di base frastagliata + baie e promontori della mappa)
const coastV=v=>SEA-40+110*Math.sin(v/190)+65*Math.sin(v/67+1.3)+45*Math.sin(v/29+.5)+(M&&M.cb?M.cb(v):0);
// punto a caso sulla terraferma: R = generatore (0..1), u0/um = margini verso l'interno e verso il mare, vm = margine lungo la costa
const landXY=(R,u0,um,vm)=>fromUV(u0+R()*(SEA-um-u0),vm+R()*(WH-2*vm));
function elev(x,y){const fx=clamp(x/TC,0,GW-.001),fy=clamp(y/TC,0,GH-.001),ix=fx|0,iy=fy|0,u=fx-ix,v=fy-iy,W1=GW+1,E=M.E,i=iy*W1+ix;
 return(E[i]*(1-u)+E[i+1]*u)*(1-v)+(E[i+W1]*(1-u)+E[i+W1+1]*u)*v}
const levelAt=(x,y)=>{const e=elev(x,y);return e<.5?0:e<1.5?1:2};
// niente ponti: dove una strada passa sopra l'acqua, la carreggiata stessa fa da passaggio (stessa larghezza della strada)
function onBridge(x,y){return nearWater(x,y)&&onRoad(x,y,0)}
function isleM(x,y){let m=-1e9;for(const s of M.isles){const v=rad(s,x,y)-Math.hypot(x-s.x,y-s.y);if(v>m)m=v}return m} // >0: dentro un'isola
function onIsle(x,y){for(const s of M.isles)if(Math.hypot(x-s.x,y-s.y)<rad(s,x,y))return s;return null}
// molo: rettangolo ruotato di terra che entra in mare (mg = margine interno)
function pierAt(x,y,mg){for(const p of M.piers){const dx=x-p.x,dy=y-p.y;if(Math.abs(dx)>p.L||Math.abs(dy)>p.L)continue;const lx=dx*p.c+dy*p.s,ly=-dx*p.s+dy*p.c;if(Math.abs(lx)<p.L/2-mg&&Math.abs(ly)<p.W/2-mg)return p}return null}
function inWater(x,y,r){
 if(M.wnReady&&r<=40&&!nearWater(x,y))return false;
 if(M.VD&&xVoid(x,y,r))return true;   // interni: il vuoto attorno (AGmapX.js)
 if(M.piers.length&&pierAt(x,y,Math.min(r,10)))return false;   // il molo conta come terra anche se il cerchio sporge di qualche pixel
 if(M.isles.length&&isleM(x,y)>=r)return false;
 if(seaU(x,y)+r>coastV(seaV(x,y)))return true;
 for(const l of M.lakes)if(inBlob(l,x,y,r))return true;
 if(!onBridge(x,y))for(const rv of M.rivers){const q=segNear(rv.pts,x,y);if(q[0]<rvW(rv,q)/2+r)return true}
 return false}
const wetCell=(x,y)=>x<0||y<0||x>=WW||y>=WH||M.WM[(y/TC|0)*GW+(x/TC|0)]===1;   // acqua vicina a un punto (maschera a celle)
const riverCell=(x,y)=>x>=0&&y>=0&&x<WW&&y<WH&&M.RV[(y/TC|0)*GW+(x/TC|0)]===1;   // cella bagnata che è SOLO fiume (né lago né mare): qui si costruisce e si passa con un ponte
const nearWater=(x,y)=>{const cx=clamp(x/TC|0,0,GW-1),cy=clamp(y/TC|0,0,GH-1);return M.WN[cy*GW+cx]===1};
// chiazze del meteo: 0 niente, 1 pozzanghera (pioggia), 2 neve. Maschera a celle da WXC px creata una volta per mappa (wxMaskBuild in AGbake.js): una sola lettura
const WXC=16;
const wxAt=(x,y)=>{const w=M&&M.wxm;if(!w)return 0;const i=x/WXC|0,j=y/WXC|0;return i<0||j<0||i>=w.w||j>=w.h?0:w.g[j*w.w+i]};
function onRoad(x,y,r){const a=M.roadCells.get(Math.floor(x/100)*1024+Math.floor(y/100));if(!a)return false;for(const rd of a)if(segNear(rd.pts,x,y)[0]<rd.w/2+r)return true;return false}
// verifica se un rettangolo ruotato (x,y,w,h,a) tocca una strada (mg = margine extra)
function rectOnRoad(x,y,w,h,a,mg){const c=Math.cos(a),s=Math.sin(a);const pts=[[0,0],[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2],[-w/2,0],[w/2,0],[0,-h/2],[0,h/2]];for(const[u,v]of pts)if(onRoad(x+u*c-v*s,y+u*s+v*c,mg))return true;return false}
// verifica se un cerchio (x,y,r) tocca una strada
function circOnRoad(x,y,r,mg){if(onRoad(x,y,r+mg))return true;for(let i=0;i<8;i++){const a=i*TAU/8;if(onRoad(x+Math.cos(a)*r,y+Math.sin(a)*r,mg))return true}return false}
const inHill=(x,y)=>{for(const h of M.hills)if(inBlob(h,x,y))return true;return false};
// punto libero (niente acqua, ostacoli, ponti, partenza): per piazzare nemici, VIP, ecc.
function clearAt(x,y,r){if(nearWater(x,y)&&inWater(x,y,r+10))return false;
 for(const o of qobs(x,y,r+40,[]))if(Math.hypot(x-o.x,y-o.y)<o.r+r&&(o.t=='t'||bsd(o,...toLocal(o,x,y))<r))return false;return true}

// ===== collisioni =====
// wade: il Grunt del giocatore può entrare in acqua (lo fermano solo edifici, alberi, rocce e muri)
function push(p,r,wade){
 if(!wade&&nearWater(p.x,p.y)){
  const bb=onBridge(p.x,p.y),is=onIsle(p.x,p.y);
  if(is&&!bb){const dx=p.x-is.x,dy=p.y-is.y,d=Math.hypot(dx,dy)||1,m=rad(is,p.x,p.y)-r;if(d>m){p.x=is.x+dx/d*m;p.y=is.y+dy/d*m}}
  else if(!bb){for(const l of M.lakes){const dx=p.x-l.x,dy=p.y-l.y,d=Math.hypot(dx,dy),m=rad(l,p.x,p.y)+r;if(d<m){const k=m/(d||1);p.x=l.x+dx*k;p.y=l.y+dy*k}}
   const pr=M.piers.length&&pierAt(p.x,p.y,0);
   if(pr){const dx=p.x-pr.x,dy=p.y-pr.y,lx=Math.min(dx*pr.c+dy*pr.s,pr.L/2-r),ly=clamp(-dx*pr.s+dy*pr.c,-(pr.W/2-r),pr.W/2-r);p.x=pr.x+lx*pr.c-ly*pr.s;p.y=pr.y+lx*pr.s+ly*pr.c}   // sul molo: resta sul molo
   else{const u=seaU(p.x,p.y),v=seaV(p.x,p.y),c=coastV(v)-r;if(u>c){const q=fromUV(c,v);p.x=q[0];p.y=q[1]}}}
  if(!bb)for(const rv of M.rivers){const sq=segNear(rv.pts,p.x,p.y),[d,qx,qy]=sq,m=rvW(rv,sq)/2+r;if(d<m){const dx=p.x-qx,dy=p.y-qy,l=Math.hypot(dx,dy)||1;p.x=qx+dx/l*m;p.y=qy+dy/l*m}}}
 for(const o of qobs(p.x,p.y,r+60,_pq)){
  if(o.t=='t'){const dx=p.x-o.x,dy=p.y-o.y,d=Math.hypot(dx,dy),m=o.r+r;if(d<m){const k=m/(d||1);p.x=o.x+dx*k;p.y=o.y+dy*k}}
  else for(let it=0;it<6;it++){ // più passaggi: nelle forme a L, T, U la spinta fuori da una primitiva può finire dentro un'altra
   const l=toLocal(o,p.x,p.y),d=bsd(o,l[0],l[1]);if(d>=r)break;
   const g=bgr(o,l[0],l[1]),k=r-d,w=toWorld(o,l[0]+g[0]*k,l[1]+g[1]*k);p.x=w[0];p.y=w[1]}}
 if(M.VD)xVoidOut(p);
 p.x=clamp(p.x,r,WW-r);p.y=clamp(p.y,r,WH-r)}
const _pq=[];
// ostacolo che ostruisce la linea di vista tra due punti (null = libera)
function losBlocker(ax,ay,bx,by,margin){const dx=bx-ax,dy=by-ay,d=Math.hypot(dx,dy);if(d<1)return null;const ux=dx/d,uy=dy/d,st=GCELL*.6,n=Math.ceil(d/st);let best=null,bd=d-(margin||0);QST++;
 for(let i=0;i<=n;i++){const s=Math.min(d,i*st),cx=Math.floor((ax+ux*s)/GCELL),cy=Math.floor((ay+uy*s)/GCELL),a=GRID.get(gk(cx,cy));if(!a)continue;
  for(const o of a){if(o.dead||o.qs===QST)continue;o.qs=QST;const e=rayO(o,ax,ay,ux,uy);if(e<bd){bd=e;best=o}}}
 return best}

// ===== griglia di navigazione (celle da 80 px): solo per i nemici di terra =====
const NC=80,NW=WW/NC,NH=WH/NC;let nav=null,navW=null;
const ncell=(x,y)=>clamp(y/NC|0,0,NH-1)*NW+clamp(x/NC|0,0,NW-1);
function cellObs(i){const cx=(i%NW)*NC+NC/2,cy=(i/NW|0)*NC+NC/2;
 for(const o of qobs(cx,cy,NC,[])){if(o.t=='t'||o.dead)continue;const l=toLocal(o,cx,cy);if(bsd(o,l[0],l[1])<34)return 1}return 0}
function navBuild(){nav=new Uint8Array(NW*NH);navW=new Uint8Array(NW*NH);
 for(let i=0;i<nav.length;i++){const cx=(i%NW)*NC+NC/2,cy=(i/NW|0)*NC+NC/2;navW[i]=nearWater(cx,cy)&&inWater(cx,cy,26)?1:0}
 for(const rd of M.roads)for(let k=0;k<rd.pts.length-1;k++){const A=rd.pts[k],B=rd.pts[k+1],n=Math.max(1,Math.ceil(Math.hypot(B[0]-A[0],B[1]-A[1])/30));   // strade sopra i fiumi: si passa
  for(let i=0;i<=n;i++){const x=A[0]+(B[0]-A[0])*i/n,y=A[1]+(B[1]-A[1])*i/n;if(riverCell(x,y))navW[ncell(x,y)]=0}}
 for(let i=0;i<nav.length;i++)nav[i]=navW[i]|cellObs(i)}
function navRefresh(o){if(!nav||o.t=='t')return;const x0=clamp((o.x-o.r)/NC|0,0,NW-1),x1=clamp((o.x+o.r)/NC|0,0,NW-1),y0=clamp((o.y-o.r)/NC|0,0,NH-1),y1=clamp((o.y+o.r)/NC|0,0,NH-1);
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const i=y*NW+x;nav[i]=navW[i]|cellObs(i)}}
function navLos(ax,ay,bx,by){const d=Math.hypot(bx-ax,by-ay),n=Math.ceil(d/30);for(let i=1;i<n;i++){const t=i/n;if(nav[ncell(ax+(bx-ax)*t,ay+(by-ay)*t)])return false}return true}
// A*: restituisce i punti di passaggio in coordinate mondo (null se non serve un percorso); se la meta è irraggiungibile arriva al punto più vicino
const _g=new Float32Array(NW*NH),_f=new Float32Array(NW*NH),_par=new Int32Array(NW*NH),_st=new Uint32Array(NW*NH),_cl=new Uint32Array(NW*NH),_heap=new Int32Array(NW*NH+8);let _stamp=0;
function navPath(sx,sy,gx,gy){
 let s=ncell(sx,sy),g=ncell(gx,gy);
 if(nav[g]){let b=-1,bd=1e9;const gcx=g%NW,gcy=g/NW|0;for(let r=1;r<=4&&b<0;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const x=gcx+dx,y=gcy+dy;if(x<0||y<0||x>=NW||y>=NH||nav[y*NW+x])continue;const d=dx*dx+dy*dy;if(d<bd){bd=d;b=y*NW+x}}if(b>=0)g=b}
 if(s===g)return[[gx,gy]];
 _stamp++;let hn=0;const gcx=g%NW,gcy=g/NW|0,H=i=>{const dx=Math.abs(i%NW-gcx),dy=Math.abs((i/NW|0)-gcy);return dx+dy-.586*Math.min(dx,dy)};
 const up=i=>{while(i>0){const p=(i-1)>>1;if(_f[_heap[p]]<=_f[_heap[i]])break;const t=_heap[p];_heap[p]=_heap[i];_heap[i]=t;i=p}};
 const down=i=>{for(;;){let l=i*2+1,r=l+1,m=i;if(l<hn&&_f[_heap[l]]<_f[_heap[m]])m=l;if(r<hn&&_f[_heap[r]]<_f[_heap[m]])m=r;if(m===i)break;const t=_heap[m];_heap[m]=_heap[i];_heap[i]=t;i=m}};
 _g[s]=0;_f[s]=H(s);_st[s]=_stamp;_par[s]=-1;_heap[hn++]=s;let best=s,bh=H(s),it=0;
 while(hn&&it++<5000){
  const c=_heap[0];_heap[0]=_heap[--hn];down(0);if(_cl[c]===_stamp)continue;_cl[c]=_stamp;
  if(c===g){best=g;break}const h=H(c);if(h<bh){bh=h;best=c}
  const cx=c%NW,cy=c/NW|0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=NW||y>=NH)continue;const n=y*NW+x;if(nav[n]||_cl[n]===_stamp)continue;
   if(dx&&dy&&(nav[cy*NW+x]||nav[y*NW+cx]))continue;
   const ng=_g[c]+(dx&&dy?1.414:1);if(_st[n]!==_stamp||ng<_g[n]){_st[n]=_stamp;_g[n]=ng;_f[n]=ng+H(n);_par[n]=c;_heap[hn]=n;up(hn++)}}}
 const cells=[];for(let c=best;c>=0;c=_par[c])cells.push(c);cells.reverse();
 const pts=cells.map(i=>[(i%NW)*NC+NC/2,(i/NW|0)*NC+NC/2]);
 if(best===g)pts[pts.length-1]=[gx,gy];
 // semplificazione: si salta ogni punto raggiungibile in linea retta
 const out=[];let i=0;
 while(i<pts.length-1){let j=pts.length-1;while(j>i+1&&!navLos(pts[i][0],pts[i][1],pts[j][0],pts[j][1]))j--;out.push(pts[j]);i=j}
 return out.length?out:[[gx,gy]]}

const FXS=30,FX_STEP=1/15;const fxP=[];
const fxCap=big=>(G.q>=2?150:G.q==1?90:50)*(big?2:1);   // tetto in base alla qualità
const fxVis=v=>G.fog<.02||v==null||v>.3;               // niente effetti su ciò che la nebbia nasconde
function fxSpawn(x,y,color,n,big,s){s=s||FXS;const cap=fxCap(big);
 for(let i=0;i<n&&fxP.length<cap;i++){const a=Math.random()*TAU,sp=Math.random()*s*(big?.4:.2);
  fxP.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,decay:Math.random()*.04+.03,color,size:s*(Math.random()*.25+.15)})}}
// fumo di crollo: blob grigi persistenti (vita 4–10 s), che salgono piano e si espandono — stile "fiamma" ma grigio
function collapseSmoke(x,y,s,big){s=s||FXS;const cap=fxCap(true);
 const cols=['#7a7570','#8a8580','#666361','#9a9590','#5a5754','#adaba6'];
 const n=big?12:8;
 for(let i=0;i<n&&fxP.length<cap;i++){
  const a=Math.random()*TAU,sp=Math.random()*s*(big?.22:.15);
  fxP.push({x:x+(Math.random()-.5)*s*.35,y:y+(Math.random()-.5)*s*.55,
   vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-s*.05,      // leggero bias verso l'alto alla nascita
   life:1,decay:.004+Math.random()*.005,           // vita ≈ 4–10 s (era 1–2 s)
   color:cols[Math.random()*cols.length|0],
   size:s*(.45+Math.random()*.45),                 // 8–18 px iniziali, come le fiamme
   rise:.4+Math.random()*.9,                       // 6–19 px/s verso l'alto (costante, indipendente dall'attrito)
   grow:.10+Math.random()*.40,                     // +1.5–6 px/s di diametro (crescita "nuvola")
   soft:1                                          // dissolvenza smoothstep (vedi fxDraw): niente "pop"
  })}}
function fxBoom(x,y,kind,s){
 if(kind=='tree'){fxSpawn(x,y,'#4f8f3f',10,true,s);return}
 fxSpawn(x,y,'#ff8800',15,true,s);fxSpawn(x,y,'#ff3333',10,true,s);
 if(kind=='struct')collapseSmoke(x,y,s||FXS,true)}
function fxStep(dt){const k=dt/FX_STEP,f=Math.pow(.85,k);
 // Rimozione STABILE (compaction): l'ordine delle particelle sopravvissute non cambia mai.
 // Prima si faceva swap-removal (fxP[i]=fxP[ultimo]; pop()), che riordinava l'array a ogni
 // morte: con source-over il compositing cambiava di scatto → flicker di z-order.
 let w=0;
 for(let i=0;i<fxP.length;i++){const p=fxP[i];
  p.x+=p.vx*k;p.y+=p.vy*k;if(p.rise)p.y-=p.rise*k;if(p.grow)p.size+=p.grow*k;
  p.vx*=f;p.vy*=f;p.life-=p.decay*k;
  if(p.life>0)fxP[w++]=p}
 fxP.length=w}
const FL_COLS=['#fff3a0','#ffb02e','#ff6a1a','#e63a12'],FL_MUZZLE=76;
function flameFx(x,y,a,w){const sp=(w.range-FL_MUZZLE)/5.7,cap=fxCap(true);
 for(let i=0;i<5&&fxP.length<cap;i++){const d=a+(Math.random()-.5)*w.arc*2,v=sp*(.55+Math.random()*.45);
  fxP.push({x:x+Math.cos(a)*FL_MUZZLE,y:y+Math.sin(a)*FL_MUZZLE,vx:Math.cos(d)*v,vy:Math.sin(d)*v,life:1,decay:.03+Math.random()*.03,color:FL_COLS[Math.random()*4|0],size:5+Math.random()*8})}}
function smokeFx(x,y,vx,vy){if(fxP.length<fxCap(false)&&Math.random()<.6)fxP.push({x,y,vx:-vx*.08+(Math.random()-.5)*4,vy:-vy*.08+(Math.random()-.5)*4,life:1,decay:.04+Math.random()*.02,color:'#b8b8b8',size:4+Math.random()*3})}
// spray delle cascate: pallini bianchi continui (stile impatto), con delay casuale per cascata
function fallSpray(dt){
  if(!M||!M.falls||!M.falls.length)return;
  const cap=fxCap(false);
  for(const f of M.falls){
    // solo cascate vicine alla camera (evita spreco fuori schermo)
    if(f.x<camX-200||f.x>camX+W/zoom+200||f.y<camY-200||f.y>camY+H/zoom+200)continue;
    f._st=(f._st==null?Math.random()*.12:f._st)-dt;   // timer per cascata
    if(f._st>0)continue;
    f._st=.04+Math.random()*.14;                      // delay casuale 40–180 ms
    if(fxP.length>=cap)continue;
    if(typeof seen==='function'&&P&&!seen(f.x,f.y,false))continue;   // cascata nascosta dalla nebbia (o da un fumogeno): niente schizzi
    // punto di impatto in fondo al salto (lungo la direzione della cascata)
    const ca=Math.cos(f.a),sa=Math.sin(f.a), half=f.w/2;
    const bx=f.x+ca*20, by=f.y+sa*20;                 // base del salto
    const n=1+(Math.random()*2|0);                    // 1–2 pallini per tick
    for(let i=0;i<n&&fxP.length<cap;i++){
      const side=(Math.random()-.5)*half*1.1;
      const x=bx-sa*side+(Math.random()-.5)*3;
      const y=by+ca*side+(Math.random()-.5)*3;
      const a=f.a+(Math.random()-.7)*.9;              // ventaglio più stretto intorno alla direzione
      const sp=2+Math.random()*6;
      fxP.push({
        x,y,
        vx:Math.cos(a)*sp,
        vy:Math.sin(a)*sp,
        life:1,
        decay:.08+Math.random()*.07,
        color:Math.random()<.55?'#ffffff':'#d8eef8',  // bianco / azzurro chiaro
        size:8+Math.random()*16                      // dimensioni raddoppiate
      });
    }
  }
}
const IMPACT_COLS=['#ffe14d','#999999','#ff8800'];
const fxImpact=(x,y,n,big,s)=>{s=s||FXS;const cap=fxCap(big);
 for(let i=0;i<n&&fxP.length<cap;i++){const a=Math.random()*TAU,sp=Math.random()*s*(big?.4:.2),color=IMPACT_COLS[Math.random()*IMPACT_COLS.length|0];
  fxP.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,decay:Math.random()*.04+.03,color,size:s*(Math.random()*.25+.15)})}};
const impact=(x,y,big,s)=>{fxImpact(x,y,8,big,s);sfxAt(SFX_LIST.hit,1,x,y,60)};
function wreckFx(o){if(o.ind)return;const b=o.t=='b';if(o.burn>0)burnRem(o.x,o.y,Math.min(o.r,60),5);   // distrutto mentre bruciava: le macerie continuano a bruciare (burnRem in AGsim.js)
 if(!b)sfxAt(SFX_LIST.crunch,.8,o.x,o.y,60);   // albero caduto per qualunque motivo (mezzi, armi, esplosioni): suono di schianto · gap 60 ms: un'esplosione che ne abbatte tanti non satura l'audio
 // edificio distrutto: cratere bruciato permanente, stesso raggio di quello lasciato dal lanciarazzi.
 // Eccezione: se l'edificio si trova sull'acqua (navi, piattaforme, portaerei, incrociatori) niente cratere.
 if(b&&!inWater(o.x,o.y,0))craterAdd(o.x,o.y,o.th?Math.min(WEAPONS[W_RKT].ex,o.r*1.1+20):WEAPONS[W_RKT].ex);
 fxBoom(o.x,o.y,b?'struct':'tree',b?Math.min(90,Math.max(FXS,o.r*.9)):FXS*.8);if(b)sfxAt(SFX_LIST.crash,.8,o.x,o.y,80)}
function blastFx(u){
 if(u.k>=UK_HUM){fxSpawn(u.x,u.y,'#c01818',10,true,45);sfxAt(SFX_LIST.boom,.7,u.x,u.y,60);return}   // omini: sangue + esplosione (come i nemici AI)
 fxBoom(u.x,u.y,'unit',u.k==UK_BLIMP?80:u.k==0?42:FXS);sfxAt(SFX_LIST.boom,.8,u.x,u.y,80)}
// ===== audio: piccolo pool di elementi per sovrapporre più volte lo stesso suono =====
const SFX={},ear={x:0,y:0},SFX_R=1500,sfxT={};// Volumi separati (0..1): uno per la musica, uno per tutti gli effetti.
let MUSIC_VOL=1, SFX_VOL=1;
// Audio ambientali (pioggia, vento): due player per suono alternati con crossfade di 0,1 s.
// Non usano Audio.loop (i browser producono un piccolo gap a ogni iterazione): il player successivo
// parte in anticipo mentre il precedente sta ancora suonando, con volumi incrociati.
const AMB_XF=0.10;    // durata del crossfade (s)
const AMB_POLL=100;   // ms tra un controllo di fine traccia e l'altro
const AMB={
 rain:{src:'sfx/AGrain.mp3',players:null,idx:0,vol:.3, active:false,timer:null,fadeId:0},
 wind:{src:'sfx/AGwind.mp3',players:null,idx:0,vol:.45,active:false,timer:null,fadeId:0}
};
// Musica: applica subito ai due lettori in riproduzione
function setMusicVolume(v){MUSIC_VOL=clamp(+v||0,0,1);
 const bv=0.35*MUSIC_VOL;for(const p of bgmPlayers){if(p.muted)p.muted=false;p.volume=bv}}
// Effetti: passi del mech (gli altri effetti usano SFX_VOL dentro sfx())
function setSfxVolume(v){SFX_VOL=clamp(+v||0,0,1);
 if(typeof walkAP!=='undefined'&&walkAP){walkAP.vol=clamp(WALK_VOL*walkAP.gain*SFX_VOL,0,1);for(const a of walkAP.p)if(!a.paused)a.volume=walkAP.vol}
 if(typeof walkWA!=='undefined'&&walkWA)walkWA.g.gain.value=WALK_VOL*walkWA.gain*SFX_VOL;   // loop di movimento in Web Audio
 for(const k in AMB){const A=AMB[k];if(!A.players)continue;const cur=A.players[A.idx];if(cur)cur.volume=A.vol*SFX_VOL}}
// Retro-compatibilità: imposta entrambi (utile se qualche vecchio codice chiama setMasterVolume)
function setMasterVolume(v){setMusicVolume(v);setSfxVolume(v)}
const SFX_MAX=3;   // massimo elementi audio per ogni suono, creati solo se servono
function sfxPool(src){let a=SFX[src];if(!a){a=SFX[src]={p:[],i:0};a.p.push(new Audio(src))}return a}
// Web Audio: ogni file è decodificato UNA volta in memoria e suonato con nodi leggeri (niente scatti, niente elementi <audio> in più).
// OGNI suono, anche quelli aggiunti in futuro, passa da sfx() e riceve una variazione casuale: tono/velocità, volume e timbro.
// La musica (playBgm) è separata e non viene toccata. Il pool qui sopra resta come ripiego (file:// o decodifica non riuscita).
let AC=null;const SB={},SLAST={},SV_MAX=24;let svAct=0;       // contesto audio, buffer decodificati, ultima velocità di ogni suono, voci attive e loro tetto
const SV_DEF={r:.16,g:.22,t:1};                                // variazione di base: tono/velocità ±16%, volume fino a −22%, timbro casuale
const SFX_VAR={[WEAPONS[W_MG].sfx]:{r:.04,g:.06,t:.25}};   // mitraglia: effetti dimezzati                                              // facoltativo, per un suono particolare: SFX_VAR['sfx/x.mp3']={r:.05,g:.1,t:0}
function audioCtx(){if(AC===null){try{const C=window.AudioContext||window.webkitAudioContext;AC=C?new C({latencyHint:'interactive'}):0}catch(_){AC=0}}return AC}
['pointerdown','keydown','touchstart'].forEach(t=>addEventListener(t,()=>{const c=audioCtx();if(c&&c.state=='suspended')c.resume();
 for(const k in AMB){const A=AMB[k];if(!A.players||!A.active)continue;
  if((k==='rain'&&!WX.rain)||(k==='wind'&&!WX.sand))continue;
  const cur=A.players[A.idx];if(cur&&cur.paused){const r=cur.play();if(r&&r.catch)r.catch(()=>{})}}
},{passive:true}));
function sfxLoad(src){if(SB[src]!==undefined)return SB[src];SB[src]=0;const c=audioCtx();if(!c){SB[src]=-1;return -1}
 fetch(src).then(r=>{if(!r.ok)throw 0;return r.arrayBuffer()}).then(b=>new Promise((ok,ko)=>c.decodeAudioData(b,ok,ko))).then(buf=>{SB[src]=buf}).catch(()=>{SB[src]=-1});return 0}
function sfxVar(src){const d=SFX_VAR[src]||SV_DEF,l=SLAST[src]||1,lo=1-d.r,hi=1+d.r,m=d.r*.35,a=Math.max(lo,l-m),w=Math.max(0,Math.min(hi,l+m)-a);   // zona da evitare: vicino all'ultima velocità usata
 let rate=lo+Math.random()*(hi-lo-w);if(rate>=a)rate+=w;   // mai quasi uguale alla volta prima
 SLAST[src]=rate;return{rate,gain:1-d.g*Math.random(),cut:d.t?22000-d.t*(17500-Math.random()*13500):0}}
function sfx(src,vol,pan){if(!src)return;const b=sfxLoad(src);   // 0 = ancora in caricamento, -1 = Web Audio non disponibile: in entrambi i casi si usa l'elemento <audio>
 const v=sfxVar(src),g0=clamp(vol==null?1:vol,0,1)*v.gain*SFX_VOL;
 if(b===0||b===-1){try{const a=sfxPool(src);let e=a.p.find(x=>x.paused);   // elemento libero
  if(!e){if(a.p.length<SFX_MAX){e=new Audio(src);a.p.push(e)}else e=a.p[a.i++%a.p.length]}
  e.volume=clamp(g0,0,1);e.currentTime=0;e.preservesPitch=false;e.playbackRate=v.rate;const r=e.play();if(r&&r.catch)r.catch(()=>{})}catch(_){}return}
 if(svAct>=SV_MAX)return;   // tetto di voci contemporanee: il gioco resta fluido anche con molti spari
 try{const c=AC;if(c.state=='suspended')c.resume();
  const s=c.createBufferSource(),g=c.createGain();s.buffer=b;s.playbackRate.value=v.rate;g.gain.value=g0;s.connect(g);let o=g;const n=[s,g];
  if(v.cut){const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=v.cut;o.connect(f);o=f;n.push(f)}
  if(c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=clamp(pan||0,-1,1);o.connect(p);o=p;n.push(p)}
  o.connect(c.destination);svAct++;s.onended=()=>{svAct--;for(const x of n)try{x.disconnect()}catch(_){}};s.start()}catch(_){}}
function sfxAt(src,vol,x,y,gap){const d=Math.hypot(x-ear.x,y-ear.y);if(d>SFX_R)return;const n=performance.now();if(sfxT[src]>n)return;sfxT[src]=n+(gap||0);sfx(src,vol*(1-d/SFX_R*.8),(x-ear.x)/SFX_R*1.6)}
// ===== suono di movimento del giocatore locale (passi del mech, motori dei veicoli): UN solo loop alla volta, nessun dato in rete =====
// stessa variazione di tutti i suoni (sfxVar: tono, volume, timbro), estratta ogni volta che il loop riparte. src = file (default: passi del mech)
const WALK_VOL=.35;let walkSrc=null,walkMul=1,walkWA=null,walkAP=null;   // walkMul = volume in più del loop in corso (Colosso) · walkWA = loop Web Audio · walkAP = ripiego <audio>: due copie alternate
const WALK_MUL={'sfx/vehicle.mp3':2.5,'sfx/tracks.mp3':2.5};   // volume in più per singolo file di movimento (1 = normale); fino a 1/WALK_VOL ≈ 2.85 vale anche nel ripiego <audio>
const WALK_SEG=[4,6];   // ogni quanti secondi (min, max) il loop riparte con tono e volume nuovi: niente suono sempre identico
const WALK_XF=.62;   // sovrapposizione (s) fra una ripetizione e la successiva: la nuova parte prima che finisca quella in corso, con dissolvenza incrociata
function walkStop(){if(walkWA){const W=walkWA,t=AC.currentTime;
  for(const x of W.vs){try{x.g.gain.cancelScheduledValues(t);x.g.gain.setValueAtTime(x.g.gain.value,t);x.g.gain.linearRampToValueAtTime(0,t+.04);x.s.stop(t+.05)}catch(_){}}   // si spegne in 40 ms: niente clic
  setTimeout(()=>{for(const k of W.n)try{k.disconnect()}catch(_){}},120);walkWA=null}
 if(walkAP){for(const a of walkAP.p)try{a.pause()}catch(_){}walkAP.fd=null}}
// una ripetizione che parte all'istante t (orologio audio): entra ed esce in dissolvenza per WALK_XF; la successiva parte WALK_XF prima della fine
function walkVoice(W,t,first){const c=AC,s=c.createBufferSource(),g=c.createGain(),seg=()=>WALK_SEG[0]+Math.random()*(WALK_SEG[1]-WALK_SEG[0]);
 if(first||W.rt==null)W.rt=t+seg();
 else if(t>=W.rt-.01){if(W.src)W.rate=sfxVar(W.src).rate;W.vk=.85+Math.random()*.15;W.rt=t+seg()}   // ogni 4-6 s: si ricomincia con tono/velocità e volume nuovi
 const k=W.vk||1,full=W.b.duration/W.rate,d=Math.min(full,Math.max(1,W.rt-t+WALK_XF)),xf=Math.min(WALK_XF,d/4);   // file più lungo del tratto: si interrompe e la ripetizione successiva parte al cambio
 s.buffer=W.b;s.playbackRate.value=W.rate;s.connect(g);g.connect(W.g);
 g.gain.setValueAtTime(first?k:0,t);if(!first)g.gain.linearRampToValueAtTime(k,t+xf);
 g.gain.setValueAtTime(k,t+d-xf);g.gain.linearRampToValueAtTime(0,t+d);
 s.start(t);s.stop(t+d+.02);const x={s,g};W.vs.push(x);
 s.onended=()=>{const i=W.vs.indexOf(x);if(i>=0)W.vs.splice(i,1);try{s.disconnect();g.disconnect()}catch(_){}};
 W.next=t+d-xf}
// chiamata a ogni fotogramma mentre il loop suona: programma la ripetizione successiva con un quarto di secondo di anticipo
function walkPump(){const W=walkWA;if(!W)return;const t=AC.currentTime;if(W.next-t<.25)walkVoice(W,Math.max(W.next,t),false)}
// ripiego <audio>: due copie dello stesso file; la nuova parte WALK_XF prima della fine dell'altra e i volumi si incrociano (come pioggia e vento)
function walkAuStart(src,v){let A=walkAP;
 if(!A||A.src!==src){if(A)for(const a of A.p)try{a.pause()}catch(_){}
  A=walkAP={src,p:[new Audio(src),new Audio(src)]};for(const a of A.p){a.loop=false;a.preservesPitch=false}}
 A.i=0;A.fd=null;A.gain=v.gain;A.vol=clamp(WALK_VOL*v.gain*SFX_VOL,0,1);
 for(const a of A.p){try{a.pause()}catch(_){}a.playbackRate=v.rate}
 const a=A.p[0];a.currentTime=0;a.volume=A.vol;const r=a.play();if(r&&r.catch)r.catch(()=>{})}
// a ogni fotogramma: incrocia i volumi durante il passaggio, oppure fa partire la copia ferma quando l'altra sta per finire
function walkAuPump(A){A=A||walkAP;if(!A)return;const now=performance.now();   // A = coppia di <audio> (default: quella del giocatore; i motori dell'AI passano la loro)
 if(A.fd){const F=A.fd,u=Math.min(1,(now-F.t0)/(F.xf*1000));F.to.volume=A.vol*u;F.from.volume=A.vol*(1-u);if(u>=1){try{F.from.pause()}catch(_){}A.fd=null}return}
 const cur=A.p[A.i],d=cur.duration,rt=cur.playbackRate||1;if(!isFinite(d)||d<=0)return;
 const xf=Math.min(WALK_XF,d/rt/4);if((d-cur.currentTime)/rt>xf)return;
 const nx=A.p[1-A.i];nx.currentTime=0;nx.volume=0;const r=nx.play();if(r&&r.catch)r.catch(()=>{});
 A.fd={from:cur,to:nx,t0:now,xf};A.i=1-A.i}
const walkAuOn=()=>walkAP&&walkAP.src===walkSrc&&!walkAP.p[walkAP.i].paused;
function walkSnd(on,src,mul){src=src||SFX_LIST.move;mul=mul||1;
 if(!on){if(walkSrc){walkStop();walkSrc=null}return}
 if(walkSrc===src&&walkMul===mul&&(walkWA||walkAuOn())){if(walkWA)walkPump();else walkAuPump();return}   // già in loop con questo file e questo volume: prepara solo la prossima ripetizione
 walkStop();walkSrc=src;walkMul=mul;const v=sfxVar(src),b=sfxLoad(src);v.gain*=(WALK_MUL[src]||1)*mul;   // volume del file × volume del mezzo (resta valido anche quando cambia il cursore degli effetti)
 if(b&&b!==-1){try{const c=AC;if(c.state=='suspended')c.resume();
   const g=c.createGain();g.gain.value=WALK_VOL*v.gain*SFX_VOL;let o=g;const n=[g];   // g = volume generale del loop (lo regola anche il cursore degli effetti)
   if(v.cut){const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=v.cut;o.connect(f);o=f;n.push(f)}
   o.connect(c.destination);
   walkWA={b,src,rate:v.rate,g,n,gain:v.gain,vs:[],next:0};walkVoice(walkWA,c.currentTime,true);return}catch(_){}}
 try{walkAuStart(src,v)}catch(_){}}
const preloadSfx=()=>{[...new Set([...WEAPONS.map(w=>w.sfx),...Object.values(SFX_LIST)].filter(Boolean))].forEach((f,i)=>setTimeout(()=>sfxLoad(f),i*120))};

let bgmPlayers = [new Audio('sfx/AGmusic.mp3'), new Audio('sfx/AGmusic.mp3')];
let activeBgm = 0;
let bgmInterval = null;

function playBgm() {
  if (bgmInterval) return;
  
  const p1 = bgmPlayers[0];
  p1.volume = 0.35 * MUSIC_VOL;
  p1.currentTime = 0;
  p1.play().catch(() => {});

  bgmInterval = setInterval(() => {
    const current = bgmPlayers[activeBgm];
    const next = bgmPlayers[1 - activeBgm];

    if (current.duration && current.currentTime >= current.duration - 1.0) {
      if (next.paused) {
        next.volume = 0;
        next.currentTime = 0;
        next.play().catch(() => {});

        let steps = 0;
        let fadeTimer = setInterval(() => {
          steps++;
          if (steps <= 10) {
            current.volume = Math.max(0, 0.35 * MUSIC_VOL * (1 - steps / 10)); // Sfiamma la corrente
            next.volume = Math.min(0.35 * MUSIC_VOL, 0.35 * MUSIC_VOL * (steps / 10));     // Accende la successiva
          } else {
            current.pause();
            current.volume = 0.35 * MUSIC_VOL;
            clearInterval(fadeTimer);
          }
        }, 40);

        activeBgm = 1 - activeBgm;
      }
    }
  }, 250);
}

// ===== audio ambientali (crossfade 0,1 s): pioggia e tempesta di sabbia =====
// Per ogni meteo due player identici; quando il player attivo sta per finire, il secondo parte
// in anticipo di AMB_XF e i volumi si scambiano linearmente (fade-out del primo, fade-in del secondo).
// Nessun gap acustico tra un'iterazione e la successiva.
function ambEnsurePlayers(A){
 if(A.players)return;
 A.players=[new Audio(A.src),new Audio(A.src)];
 for(const p of A.players){p.loop=false;p.preservesPitch=false;p.volume=A.vol*SFX_VOL}
}
function ambTick(A){
 if(!A.active)return;
 const cur=A.players[A.idx];
 if(!cur||cur.paused)return;
 const dur=cur.duration;
 if(!isFinite(dur)||dur<=0)return;                                    // file non ancora caricato
 const remaining=dur-cur.currentTime;
 if(remaining>AMB_XF+0.05)return;                                     // non è ancora il momento
 const next=A.players[1-A.idx];
 if(!next.paused)return;                                              // già partito (tick ravvicinati)
 // avvia il successivo a volume 0 e fai crossfade
 next.currentTime=0;next.volume=0;
 const r=next.play();if(r&&r.catch)r.catch(()=>{});
 A.idx=1-A.idx;
 const startV=A.vol*SFX_VOL,t0=performance.now(),fid=++A.fadeId;
 const fade=()=>{
  if(!A.active||A.fadeId!==fid)return;                                // stop o altro crossfade nel frattempo
  const u=Math.min(1,(performance.now()-t0)/(AMB_XF*1000));
  next.volume=startV*u;cur.volume=startV*(1-u);
  if(u<1)requestAnimationFrame(fade);
  else{try{cur.pause();cur.currentTime=0;cur.volume=startV}catch(_){}}  // il vecchio è pronto per il prossimo giro
 };
 requestAnimationFrame(fade);
}
function ambStart(k){
 const A=AMB[k];if(!A)return;
 ambEnsurePlayers(A);
 A.active=true;
 if(!A.timer)A.timer=setInterval(()=>ambTick(A),AMB_POLL);
 const cur=A.players[A.idx];
 if(cur.paused){cur.currentTime=0;cur.volume=A.vol*SFX_VOL;const r=cur.play();if(r&&r.catch)r.catch(()=>{})}
}
function ambStop(k){
 const A=AMB[k];if(!A)return;
 A.active=false;A.fadeId=0;
 if(A.timer){clearInterval(A.timer);A.timer=null}
 if(A.players)for(const p of A.players){try{p.pause();p.currentTime=0;p.volume=A.vol*SFX_VOL}catch(_){}}
 A.idx=0;
}
const rainLoopStart=()=>ambStart('rain');
const rainLoopStop =()=>ambStop('rain');
const windLoopStart=()=>ambStart('wind');
const windLoopStop =()=>ambStop('wind');

