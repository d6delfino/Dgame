'use strict';
/* AIRGRUNT · AGworld.js
   Stato globale della partita, interrogazioni sul terreno (quota, acqua, ponti, strade),
   collisioni dei mech e griglia di navigazione con A* per l'AI. */
// ===== stato =====
let M=null;                                    // mappa corrente (la crea AGmap.js)
const G={mode:0,diff:1,mis:0,seed:1,over:0,overMsg:'',msg:'',msgT:0,started:false,fog:1,t:0,q:2,fps:0,
 mt:0,sel:0,aiCi:null};                                  // mode 0 = missioni, 1 = deathmatch; mt = missione in corso; sel = scelta nella lobby
let units=[],bullets=[],slashes=[],P=null;
const others={};                               // altri giocatori (id -> giocatore)
const NET={on:false,host:false,id:0,peer:null,conns:{},hostConn:null,n:0,lastN:-1,nextId:1,code:''};
const authority=()=>!NET.on||NET.host;         // chi simula davvero (singolo o host)
const say=m=>{G.msg=m;G.msgT=2};

// ===== terreno =====
const coast=y=>SEA+70*Math.sin(y/190)+40*Math.sin(y/67+1.3)+25*Math.sin(y/29+.5)+(M&&M.cb?M.cb(y):0);   // base + baie e promontori del seed
function elev(x,y){const fx=clamp(x/TC,0,GW-.001),fy=clamp(y/TC,0,GH-.001),ix=fx|0,iy=fy|0,u=fx-ix,v=fy-iy,W1=GW+1,E=M.E,i=iy*W1+ix;
 return(E[i]*(1-u)+E[i+1]*u)*(1-v)+(E[i+W1]*(1-u)+E[i+W1+1]*u)*v}
const levelAt=(x,y)=>{const e=elev(x,y);return e<.5?0:e<1.5?1:2};
function onBridge(x,y){for(const b of M.bridges){const dx=x-b.x,dy=y-b.y;if(Math.abs(dx)>b.L||Math.abs(dy)>b.L)continue;const lx=dx*b.c+dy*b.s,ly=-dx*b.s+dy*b.c;if(Math.abs(lx)<b.L/2&&Math.abs(ly)<b.bw/2-16)return true}return false}
function isleM(x,y){let m=-1e9;for(const s of M.isles){const v=rad(s,x,y)-Math.hypot(x-s.x,y-s.y);if(v>m)m=v}return m} // >0: dentro un'isola
function onIsle(x,y){for(const s of M.isles)if(Math.hypot(x-s.x,y-s.y)<rad(s,x,y))return s;return null}
// molo: rettangolo ruotato di terra che entra in mare (mg = margine interno)
function pierAt(x,y,mg){for(const p of M.piers){const dx=x-p.x,dy=y-p.y;if(Math.abs(dx)>p.L||Math.abs(dy)>p.L)continue;const lx=dx*p.c+dy*p.s,ly=-dx*p.s+dy*p.c;if(Math.abs(lx)<p.L/2-mg&&Math.abs(ly)<p.W/2-mg)return p}return null}
function inWater(x,y,r){
 if(M.wnReady&&r<=40&&!nearWater(x,y))return false;
 if(M.piers.length&&pierAt(x,y,Math.min(r,10)))return false;   // il molo conta come terra anche se il cerchio sporge di qualche pixel
 if(M.isles.length&&isleM(x,y)>=r)return false;
 if(x+r>coast(y))return true;
 for(const l of M.lakes)if(inBlob(l,x,y,r))return true;
 if(!onBridge(x,y))for(const rv of M.rivers)if(segNear(rv.pts,x,y)[0]<rv.w/2+r)return true;
 return false}
const wetCell=(x,y)=>x<0||y<0||x>=WW||y>=WH||M.WM[(y/TC|0)*GW+(x/TC|0)]===1;   // acqua vicina a un punto (maschera a celle)
const riverCell=(x,y)=>x>=0&&y>=0&&x<WW&&y<WH&&M.RV[(y/TC|0)*GW+(x/TC|0)]===1;   // cella bagnata che è SOLO fiume (né lago né mare): qui si costruisce e si passa con un ponte
const nearWater=(x,y)=>{const cx=clamp(x/TC|0,0,GW-1),cy=clamp(y/TC|0,0,GH-1);return M.WN[cy*GW+cx]===1};
function onRoad(x,y,r){const a=M.roadCells.get(Math.floor(x/100)*1024+Math.floor(y/100));if(!a)return false;for(const rd of a)if(segNear(rd.pts,x,y)[0]<rd.w/2+r)return true;return false}
// verifica se un rettangolo ruotato (x,y,w,h,a) tocca una strada (mg = margine extra)
function rectOnRoad(x,y,w,h,a,mg){const c=Math.cos(a),s=Math.sin(a);const pts=[[0,0],[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2],[-w/2,0],[w/2,0],[0,-h/2],[0,h/2]];for(const[u,v]of pts)if(onRoad(x+u*c-v*s,y+u*s+v*c,mg))return true;return false}
// verifica se un cerchio (x,y,r) tocca una strada
function circOnRoad(x,y,r,mg){if(onRoad(x,y,r+mg))return true;for(let i=0;i<8;i++){const a=i*TAU/8;if(onRoad(x+Math.cos(a)*r,y+Math.sin(a)*r,mg))return true}return false}
const inHill=(x,y)=>{for(const h of M.hills)if(inBlob(h,x,y))return true;return false};
// punto libero (niente acqua, ostacoli, ponti, partenza): per piazzare nemici, VIP, ecc.
function clearAt(x,y,r){if(Math.hypot(x-START[0],y-START[1])<340)return false;if(nearWater(x,y)&&inWater(x,y,r+10))return false;
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
   else{const c=coast(p.y)-r;if(p.x>c)p.x=c}}
  if(!bb)for(const rv of M.rivers){const[d,qx,qy]=segNear(rv.pts,p.x,p.y),m=rv.w/2+r;if(d<m){const dx=p.x-qx,dy=p.y-qy,l=Math.hypot(dx,dy)||1;p.x=qx+dx/l*m;p.y=qy+dy/l*m}}}
 for(const o of qobs(p.x,p.y,r+60,_pq)){
  if(o.t=='t'){const dx=p.x-o.x,dy=p.y-o.y,d=Math.hypot(dx,dy),m=o.r+r;if(d<m){const k=m/(d||1);p.x=o.x+dx*k;p.y=o.y+dy*k}}
  else for(let it=0;it<6;it++){ // più passaggi: nelle forme a L, T, U la spinta fuori da una primitiva può finire dentro un'altra
   const l=toLocal(o,p.x,p.y),d=bsd(o,l[0],l[1]);if(d>=r)break;
   const g=bgr(o,l[0],l[1]),k=r-d,w=toWorld(o,l[0]+g[0]*k,l[1]+g[1]*k);p.x=w[0];p.y=w[1]}}
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
 for(const b of M.bridges)for(let s=-b.L/2;s<=b.L/2;s+=30)navW[ncell(b.x+b.c*s,b.y+b.s*s)]=0;
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
