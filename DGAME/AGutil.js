'use strict';
/* AIRGRUNT · AGutil.js
   Matematica, generatore casuale con seed, griglia spaziale e geometria degli ostacoli.
   Ogni ostacolo (edificio, muro, roccia) è l'unione di primitive in coordinate locali:
   'c' cerchio, 'r' rettangolo, 'p' poligono regolare, 'g' poligono convesso qualsiasi.
   Disegno, collisioni, colpi, mischia, visuale e AI usano tutti queste stesse primitive. */
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
function segNear(P,x,y){let best=1e9,bx=0,by=0; // punto più vicino di una polilinea
 for(let i=0;i<P.length-1;i++){const ax=P[i][0],ay=P[i][1],vx=P[i+1][0]-ax,vy=P[i+1][1]-ay,u=clamp(((x-ax)*vx+(y-ay)*vy)/(vx*vx+vy*vy||1),0,1),qx=ax+vx*u,qy=ay+vy*u,d=Math.hypot(x-qx,y-qy);if(d<best){best=d;bx=qx;by=qy}}
 return[best,bx,by]}
