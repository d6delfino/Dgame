'use strict';
/* AIRGRUNT · AGmapXin.js — MAPPE SPECIALI · INTERNI: generazione della pianta (megastruttura, astronave, base sottomarina) e arredi per tipo di stanza.
   Parte comune (temi, geometria, regole di gioco) all'inizio di AGmap.js: si carica prima di questo file. */

// ===== 3) generazione degli interni =====
const X_TO=56,X_TI=34,X_DOOR=22;   // spessore dei muri perimetrali, interni, delle porte
// megastruttura: colonne dei corridoi (passo, distanza minima fra due colonne qualsiasi) · probabilità dei tagli a 45° e ad arco · atri a piazza (probabilità per stanza, massimo)
const X_COLS=200,X_COLD=160,X_DIAG_P=.22,X_ARC_P=.2,X_PLAZA_P=.16,X_PLAZA_MAX=8;
// megastruttura: larghezza dei varchi e delle porte [min, max] (metà di prima: ci passa ancora il carro pesante, raggio 30) · distanza minima delle colonne dall'imbocco di un altro corridoio · luce di ogni colonna [raggio, intensità]
const X_OPW=[90,150],X_MOUTH=50,X_PLR=150,X_PLA=.6;   // X_PLR, X_PLA: raggio e intensità al centro del lampione di ogni pilastro (come i lampioni delle mappe normali)
// luci a tema: ogni corridoio prende il colore delle stanze su cui dà (giallo equipaggio, ciano impianti, ambra logistica, verde ricerca, rosso sicurezza)
const XLC={equip:'#ffd36b',tec:'#6fd8ff',log:'#ffa94a',ric:'#8affc8',sic:'#ff6a5a'},XLC_X=['#ff6ad5','#a98bff','#e8f4ff','#7dffda'];   // XLC_X: colori in più per variare i corridoi
// porte: probabilità che un varco verso una stanza abbia la porta · stanze con porte blindate (4× punti vita, disegno apposito)
const X_DOOR_P=.75,X_BDOOR=['reattore','comando','baia','armeria','sicurezza','ponte'];
const XLCAT={mensa:'equip',bagni:'equip',uffici:'equip',ufficio:'equip',atrio:'equip',olo:'equip',serra:'equip',alloggi:'equip',cabina:'equip',infermeria:'equip',
 server:'tec',server2:'tec',macchine:'tec',reattore:'tec',motori:'tec',pompe:'tec',magazzino:'log',ripostiglio:'log',baia:'log',hangar:'log',stiva:'log',dock:'log',capsule:'log',
 lab:'ric',osservatorio:'ric',acquario:'ric',moonpool:'ric',sicurezza:'sic',comando:'sic',armeria:'sic',ponte:'sic',belvedere:'equip'};
function genInterior(K){const{m,R,rr,ri,pick}=K,T=THEMES[m.th];
 m.hi=1;m.sp=[];m.ops=[];m.VD=new Uint8Array(GW*GH);m.lakes=[];m.cols=xMG(m.th)?[]:null;m.lamps=xMG(m.th)?[]:null;   // cols: posizioni di tutte le colonne (megastruttura: mai più vicine di X_COLD)
 SIDE=m.side=0;m.cb=()=>6000;BASE.k=0;BASE.xr=WW;BASE.ox=BASE.oy=0;   // niente mare; la base la sposta la stanza di partenza
 // --- pianta: elenco di spazi grezzi {g, k:'r' stanza | 'c' corridoio/tubo, ...}
 let S=T.lay=='hull'?xLayHull(K):T.lay=='pods'?xLayPods(K):xLayBSPX(K,120,120,WW-120,WH-120,4,300,[400,1000]);   // megastruttura: stanze in media più piccole, qualcuna grande   // stanze da piccole (380) a grandi
 if(T.lay!='pods')xSoften(K,S);   // angoli dei corridoi a 45° e atri
 if(T.lay=='bsp')xPlazas(K,S);   // megastruttura: alcune stanze diventano piazze aperte sul corridoio
 if(m.th==3)xShipRoles(K,S);   // astronave: motori a poppa (il lato della partenza), ponte di comando a prua
 S.forEach((s,i)=>s.id=i);
 // --- adiacenze: sovrapposizione (si passa liberamente) o pareti in comune (servono aperture)
 const P=new Map(),key=(i,j)=>i<j?i*4096+j:j*4096+i,nb=S.map(()=>[]);
 const adj=()=>{P.clear();for(const l of nb)l.length=0;
 for(let i=0;i<S.length;i++)for(let j=i+1;j<S.length;j++){const a=S[i],b=S[j];if(!xBbHit(a.g.bb,b.g.bb,4))continue;
  const pen=xPen(a.g,b.g);let pr=null;
  if(pen>40)pr={i,j,ov:1,sh:[]};   // sovrapposti a fondo: si passa
  else if(pen>6)continue;   // si sfiorano appena (un angolo): non è un passaggio
  else if(pen>-3){const sh=xShared(a.g,b.g);if(sh.length)pr={i,j,ov:0,sh,L:Math.max(...sh.map(q=>q.L))}}
  if(!pr)continue;pr.mg=pr.ov||(a.k=='c'&&b.k=='c')?1:0;if(!pr.ov&&a.fuse&&a.fuse===b.fuse){pr.mg=1;pr.join=1}if(!pr.ov&&((a.piaz&&a.piaz===b)||(b.piaz&&b.piaz===a)))pr.mg=1;if(pr.mg&&!pr.ov&&pr.L<130)continue;/* corridoi che si toccano solo per un tratto corto: non si passa */pr.op=[];P.set(key(i,j),pr);nb[i].push(j);nb[j].push(i)}};
 adj();
 // sale smussate o ottagonali che toccano i vicini solo per un tratto troppo corto (niente porta possibile): tornano rettangolari
 {let fix=0;for(const s of S){if(s.k!='r'||!(s.oct||s.cham)||!s.rb||s.nk||s.grp)continue;const ok=nb[s.id].some(j=>{const pr=P.get(key(s.id,j));return pr.ov||pr.L>=300});
   if(!ok){s.g=xRect(...s.rb);s.oct=0;s.cham=0;s.ang=0;fix=1}}if(fix)adj()}
 // la partenza deve avere almeno un passaggio largo verso il resto: altrimenti si sceglie la stanza più vicina che lo ha
 {const okS=i=>nb[i].some(j=>{const pr=P.get(key(i,j));return pr.ov||pr.mg||pr.L>=320}),st=S.find(s=>s.st);
  if(st&&!okS(st.id)){let bs=null,bd=1e18;for(const s of S){const b=s.g.bb;if(s.k!='r'||s.nk||s.grp||b[2]-b[0]<560||b[3]-b[1]<560||!okS(s.id))continue;const d=Math.hypot(s.g.cx-st.g.cx,s.g.cy-st.g.cy);if(d<bd){bd=d;bs=s}}
   if(bs){st.st=0;bs.st=1;if(st.rt0=='dock'){bs.rt0='dock';st.rt0=0}}}}
 // --- sculture della sagoma (solo pianta a BSP/scafo): si tolgono stanze al bordo e qualche pozzo interno, senza staccare nessuna parte
 const alive=S.map(()=>1),conn=()=>{const st=S.findIndex((s,i)=>alive[i]&&s.st);if(st<0)return false;const seen=new Set([st]),q=[st];
  while(q.length){const i=q.pop();for(const j of nb[i])if(alive[j]&&!seen.has(j)){const pr=P.get(key(i,j));if(pr.ov||pr.mg||pr.L>=230){seen.add(j);q.push(j)}}}
  return S.every((s,i)=>!alive[i]||seen.has(i))};
 if(T.lay!='pods'){
  for(const i of K.shuf(S.map((_,i)=>i))){const s=S[i];if(s.k!='r'||s.st||s.keep||s.grp)continue;const b=s.g.bb,edge=b[0]<200||b[1]<200||b[2]>WW-200||b[3]>WH-200;
   if(R()<(edge?(T.lay=='hull'?.1:.5):T.lay=='hull'?0:.09)){alive[i]=0;if(!conn())alive[i]=1}}
  // corridori: si accorciano fino all'ultimo spazio che servono; quelli rimasti senza vicini spariscono
  for(let it=0;it<3;it++)for(let i=0;i<S.length;i++){const c=S[i];if(!alive[i]||c.k!='c'||c.fix)continue;const v=c.vert,b=c.g.bb;let lo=1e9,hi=-1e9;
   for(const j of nb[i]){if(!alive[j])continue;const o=S[j].g.bb;lo=Math.min(lo,v?o[1]:o[0]);hi=Math.max(hi,v?o[3]:o[2])}
   lo=Math.max(lo,v?b[1]:b[0]);hi=Math.min(hi,v?b[3]:b[2]);
   if(hi-lo<200){alive[i]=0;if(!conn())alive[i]=1;continue}
   if(v)c.g=xRect(b[0],lo,b[2],hi);else c.g=xRect(lo,b[1],hi,b[3])}
  if(!conn())alive.fill(1)}
 let L=S.filter((s,i)=>alive[i]);L.forEach((s,i)=>{s.oid=s.id;s.id=i});
 let P2=new Map();for(const pr of P.values()){const a=S[pr.i],b=S[pr.j];if(!alive[pr.i]||!alive[pr.j])continue;
  if(!pr.ov){const sh=xShared(a.g,b.g);if(!sh.length)continue;pr.sh=sh;pr.L=Math.max(...sh.map(q=>q.L));if(pr.mg&&pr.L<130)continue}   // i corridori accorciati cambiano i tratti in comune
  pr.i=a.id;pr.j=b.id;if(pr.i>pr.j){const t=pr.i;pr.i=pr.j;pr.j=t;if(!pr.ov){const a2=L[pr.i],b2=L[pr.j];pr.sh=xShared(a2.g,b2.g)}}P2.set(key(pr.i,pr.j),pr)}
 // spazi rimasti isolati (la sagoma o i corridoi accorciati li hanno staccati): si tolgono, nessuna stanza irraggiungibile
 {const st=L.findIndex(s=>s.st);if(st>=0){const g2=L.map(()=>[]);for(const pr of P2.values())if(pr.ov||pr.mg||pr.L>=210){g2[pr.i].push(pr.j);g2[pr.j].push(pr.i)}
  const seen=new Set([st]),q=[st];while(q.length){const i=q.pop();for(const j of g2[i])if(!seen.has(j)){seen.add(j);q.push(j)}}
  if(seen.size<L.length){const nid=L.map(()=>-1);L=L.filter((s,i)=>seen.has(i));L.forEach((s,i)=>{nid[s.id]=i;s.id=i});const P3=new Map();
   for(const pr of P2.values()){if(nid[pr.i]<0||nid[pr.j]<0)continue;pr.i=nid[pr.i];pr.j=nid[pr.j];P3.set(key(pr.i,pr.j),pr)}P2=P3}}}
 m.sp=L;
 // sale unite: due stanze vicine diventano una sola sala (a L, a T, a gradini), senza muro in mezzo; al massimo 3 stanze per sala
 m.mgU=L.map((_,i)=>i);const mf=i=>m.mgU[i]===i?i:(m.mgU[i]=mf(m.mgU[i])),gn=L.map(()=>1);
 for(const pr of P2.values())if(pr.join){const ra=mf(pr.i),rb=mf(pr.j);if(ra!==rb){m.mgU[ra]=rb;gn[rb]+=gn[ra]}}   // pezzi fusi di un complesso: una sala sola
 for(const pr of P2.values()){const a=L[pr.i],b=L[pr.j];if(pr.ov||pr.mg||a.k!='r'||b.k!='r'||a.st||b.st)continue;
  const ma=Math.min(a.g.bb[2]-a.g.bb[0],a.g.bb[3]-a.g.bb[1]),mb=Math.min(b.g.bb[2]-b.g.bb[0],b.g.bb[3]-b.g.bb[1]),ra=mf(pr.i),rb=mf(pr.j);
  if(ra!==rb&&pr.L>=300&&pr.L>=Math.min(ma,mb)*.45&&gn[ra]+gn[rb]<=3&&R()<(xMG(m.th)?.18:.32)){pr.mg=1;pr.join=1;m.mgU[ra]=rb;gn[rb]+=gn[ra]}}
 // lati che danno su uno spazio unito: niente ombra sul pavimento
 for(const s of L)s.open=new Set();
 for(const pr of P2.values())if(pr.mg&&!pr.ov){for(const q of xShared(L[pr.i].g,L[pr.j].g))L[pr.i].open.add(q.ei);for(const q of xShared(L[pr.j].g,L[pr.i].g))L[pr.j].open.add(q.ei)}
 // --- aperture: un albero che collega tutto (preferendo stanza↔corridoio) + qualche anello in più; le stanze cieche a volte hanno una PORTA
 const up=L.map((_,i)=>i),fd=i=>up[i]===i?i:(up[i]=fd(up[i])),un=(a,b)=>{a=fd(a);b=fd(b);if(a!==b){up[a]=b;return true}return false};
 for(const pr of P2.values())if(pr.ov||pr.mg)un(pr.i,pr.j);
 const cand=[...P2.values()].filter(pr=>!pr.ov&&!pr.mg&&pr.L>=210).map(pr=>[R()+(L[pr.i].k=='r'&&L[pr.j].k=='r'?.55:0),pr]).sort((a,b)=>a[0]-b[0]).map(q=>q[1]),extra=[];
 for(const pr of cand){if(fd(pr.i)!==fd(pr.j)){const n=pr.op.length;xOpen(K,pr,'gap');if(pr.op.length>n){un(pr.i,pr.j);continue}}extra.push(pr)}   // si unisce solo se il varco c'è davvero
 {const sm=s=>s.k=='r'&&Math.min(s.g.bb[2]-s.g.bb[0],s.g.bb[3]-s.g.bb[1])<480,dg=i=>{let n=0;for(const q of P2.values())if((q.i==i||q.j==i)&&q.op.length)n++;return n};
  for(const pr of extra)if(R()<.32){if((sm(L[pr.i])&&dg(pr.i))||(sm(L[pr.j])&&dg(pr.j)))continue;xOpen(K,pr,R()<.5?'door':'gap')}}   // le stanze piccole non diventano corridoi di passaggio
 for(const pr of cand)if(pr.op.length==1&&pr.L>1100&&R()<.3)xOpen(K,pr,R()<.6?'gap':'door');   // pareti lunghe: un secondo varco
 // stanze cieche (un solo accesso): spesso chiuse da una porta da abbattere
 const deg=L.map(()=>0);for(const pr of P2.values()){if(pr.ov||pr.mg){deg[pr.i]+=9;deg[pr.j]+=9}else{deg[pr.i]+=pr.op.length;deg[pr.j]+=pr.op.length}}
 for(const pr of P2.values())for(const o of pr.op){const a=L[pr.i],b=L[pr.j];for(const s of[a,b])if(s.k=='r'&&!s.st&&deg[s.id]==1&&R()<.4)o.ty='door'}
 for(const pr of P2.values()){if(pr.ov||pr.mg||pr.op.length||pr.L<210)continue;const a=L[pr.i],b=L[pr.j];if(a.grp&&a.grp===b.grp&&(a.fo||b.fo))xOpen(K,pr,'gap')}   // ogni cella ha il suo varco sulla galleria
 for(const pr of P2.values())for(const o of pr.op)if(L[pr.i].st||L[pr.j].st)o.ty='gap';   // dalla partenza si esce sempre
 m.pairs=P2;
 // --- maschera del vuoto e dei pavimenti (celle da TC px)
 const walk=new Uint8Array(GW*GH);
 for(const s of L){const b=s.g.bb;for(let j=Math.max(0,b[1]/TC|0);j<=Math.min(GH-1,b[3]/TC|0);j++)for(let i=Math.max(0,b[0]/TC|0);i<=Math.min(GW-1,b[2]/TC|0);i++)if(xDep(s.g,i*TC+TC/2,j*TC+TC/2)>-2)walk[j*GW+i]=1}
 for(let i=0;i<GW*GH;i++)m.VD[i]=walk[i]?0:1;
 // --- tipo di ogni stanza, stanza di partenza, siti
 xRooms(K,L);
 if(m.th==3)xPlumes(K,L);   // astronave: scie dei motori nello spazio, dietro le stanze dei motori
 // --- porte: la maggior parte delle stanze ha porte; le stanze speciali porte blindate (la partenza resta aperta)
 if(xMG(m.th))for(const pr of P2.values())for(const o of pr.op){const a=L[pr.i],b=L[pr.j];if(a.st||b.st||(a.k!='r'&&b.k!='r'))continue;
  if([a,b].some(s=>s.k=='r'&&X_BDOOR.includes(s.rt))){o.ty='door';o.bd=1}else if(R()<X_DOOR_P)o.ty='door'}
 // --- muri e porte
 xWalls(K,L,P2);
 // --- arredi (prima i varchi: davanti alle aperture resta sempre libero; nella megastruttura i varchi sono stretti ma lo spazio libero davanti resta quello di prima)
 for(const s of L){s.ex=[];s.exs=[];s.lanes=[];s.ovl=[];s.ent=[]}
 if(m.x4d)for(const d of m.x4d){const inC=L.filter(s=>s.k=='c'&&xDep(s.g,d.x,d.y)>-6);   // base sottomarina: porta al centro dei tubi, dentro il tubo, fra i suoi muri
  if(inC.length!=1||inC[0].tid!==d.tid||L.some(s=>s.k=='r'&&xDep(s.g,d.x,d.y)>-30))continue;const g=bgeom('rect',d.w,X_DOOR);   // un altro tubo che passa di lì o una sala troppo vicina: niente porta
  K.addO({t:'b',ty:'door',shape:'rect',th:'door',x:d.x,y:d.y,w:d.w,h:X_DOOR,a:d.a,c:Math.cos(d.a),s:Math.sin(d.a),r:g.r,pr:g.pr,an:g.an,hp:Math.round(d.w*1.6),hi:1,pal:PAL_WALL,dv:K.ri(0,2),bd:0});
  inC[0].ex.push([d.x,d.y,d.w/2+70])}   // davanti alla porta niente arredi
 for(const pr of P2.values()){const a=L[pr.i],b=L[pr.j];
  for(const o of pr.op){const ew=xMG(m.th)?Math.max(o.w,180):o.w,ew2=xMG(m.th)?Math.max(o.w,150):o.w;for(const s of[a,b]){s.ex.push([o.x,o.y,ew/2+60,ew2/2+26]);if(s.k=='r')s.lanes.push([o.x,o.y,s.g.cx,s.g.cy])}}
  if(pr.mg&&!pr.ov&&pr.sh.length){const q=pr.sh.reduce((u,v)=>v.L>u.L?v:u),mx=(q.ax+q.bx)/2,my=(q.ay+q.by)/2;
   for(const s of[a,b]){if(s.k=='r')s.lanes.push([mx,my,s.g.cx,s.g.cy]);else s.exs.push([q.ax,q.ay,q.bx,q.by])}}
  if(pr.ov){a.ovl.push(b);b.ovl.push(a);const r=a.k=='r'?a:b,c=a.k=='r'?b:a;
   if(r.k=='r'&&c.k=='c'){const ax=xAxis(c),n=60;let f=null,l=null;   // asse del corridoio dentro la stanza: corsia fino al centro
    for(let i=0;i<=n;i++){const t=i/n,x=ax.a[0]+(ax.b[0]-ax.a[0])*t,y=ax.a[1]+(ax.b[1]-ax.a[1])*t;if(xDep(r.g,x,y)>0){if(!f)f=[x,y];l=[x,y]}}
    if(f){const dx=l[0]-f[0],dy=l[1]-f[1],tt=clamp(((r.g.cx-f[0])*dx+(r.g.cy-f[1])*dy)/(dx*dx+dy*dy||1),0,1),q=[f[0]+dx*tt,f[1]+dy*tt];
     r.lanes.push([f[0],f[1],l[0],l[1]],[q[0],q[1],r.g.cx,r.g.cy])}}}}   // corsia lungo tutto il tratto del corridoio dentro la stanza (può attraversarla) e da lì al centro
 if(m.cols){xCorPrep(K,L,P2);xLifts(K,L,P2);xRingCols(K,L)}   // megastruttura: ascensori in fondo ai corridoi prima delle colonne   // megastruttura: luci e tinte dei corridoi, imbocchi, colonne lungo i corridoi curvi
 for(const s of L)xFurnish(K,s);
 // --- acqua (piscine interne), maschere dell'acqua: il vuoto conta come acqua profonda
 for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const c=j*GW+i;if(m.VD[c]){m.WM[c]=1;continue}for(const l of m.lakes)if(inBlob(l,i*TC+20,j*TC+20,6)){m.WM[c]=1;m.RV[c]=0}}
 for(let j=0;j<GH;j++)for(let i=0;i<GW;i++)if(m.WM[j*GW+i])for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=i+dx,y=j+dy;if(x>=0&&y>=0&&x<GW&&y<GH)m.WN[y*GW+x]=1}
 m.wnReady=1;
 xVoidDecor(K);
 finishMap(K)}

// --- piante ---
// BSP: si divide il riquadro; le prime divisioni lasciano un corridoio (viale largo, poi corridoi), le ultime solo pareti fra stanze
function xLayBSP(K,X0,Y0,X1,Y1,dc,mn,mx,first,nk){const{R,rr}=K,out=[],MIN=mn||600,MX=mx||[1000,1750],sn=v=>Math.round(v/20)*20;   // mx: lato massimo di una stanza [min,max] · first: verso della prima divisione (1 verticale, 0 orizzontale)
 // stanza: rettangolo, rettangolo con angoli smussati (alcuni o tutti) oppure sala ottagonale
 const leaf=(x0,y0,x1,y1,cmp)=>{for(const q of xShape(K,x0,y0,x1,y1,{neck:nk,cmp,bd:[X0,Y0,X1,Y1]}))out.push(q)};
 const rec=(x0,y0,x1,y1,d)=>{const w=x1-x0,h=y1-y0,big=Math.max(w,h),cw=d<dc&&(d<3||R()<.65)?sn(d==0?rr(270,380):d==1?rr(220,320):rr(200,260)):0;   // corridoi di larghezze diverse
  if(nk&&d>=1&&Math.min(w,h)>=950&&big<=Math.min(w,h)*1.55&&big<=2200&&R()<(K.m.th==2?.3:.5)){leaf(x0,y0,x1,y1,1);return}   // foglia grande e quasi quadrata: un complesso
  if((d>=dc&&big<rr(MX[0],MX[1]))||big<MIN*2+cw+20){leaf(x0,y0,x1,y1);return}
  const v=d==0&&first!=null?first:w>h*1.2?1:h>w*1.2?0:(R()<.5?1:0),Ln=v?w:h;if(Ln<MIN*2+cw){leaf(x0,y0,x1,y1);return}
  const s=sn(clamp(Ln*rr(.34,.66),MIN,Ln-MIN-cw));
  if(v){if(cw)out.push({k:'c',vert:1,d,g:xRect(x0+s,y0,x0+s+cw,y1)});rec(x0,y0,x0+s,y1,d+1);rec(x0+s+cw,y0,x1,y1,d+1)}
  else{if(cw)out.push({k:'c',vert:0,d,g:xRect(x0,y0+s,x1,y0+s+cw)});rec(x0,y0,x1,y0+s,d+1);rec(x0,y0+s+cw,x1,y1,d+1)}};
 rec(X0,Y0,X1,Y1,0);
 // stanza di partenza: quella più vicina a un angolo a caso
 const cx=K.ri(0,1)?X1-300:X0+300,cy=K.ri(0,1)?Y1-300:Y0+300;let best=null,bd=1e9;
 for(const s of out){if(s.k!='r'||s.nk||s.grp)continue;const b=s.g.bb;if(b[2]-b[0]<560||b[3]-b[1]<560)continue;const d=Math.hypot(s.g.cx-cx,s.g.cy-cy);if(d<bd){bd=d;best=s}}
 (best||out.find(s=>s.k=='r')).st=1;return out}
// MEGASTRUTTURA: BSP su poligoni convessi. Oltre ai tagli dritti (verticali e orizzontali) ci sono tagli a 45° (corridoio in diagonale)
// e tagli ad arco (corridoio a quarto di cerchio attorno a una sala a spicchio, con fuori una sala dal muro curvo); le stanze hanno forme varie (xShapeX)
const xRectP=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
const xIsRect=P=>P.length==4&&P.every((p,i)=>{const q=P[(i+1)%4];return Math.abs(p[0]-q[0])<.5||Math.abs(p[1]-q[1])<.5});
// asse di un corridoio tagliato da rette parallele (normale nx,ny; centro n·p=cm): tratto della retta centrale dentro il poligono
function xAxisOf(g,nx,ny,cm,w){const dx=-ny,dy=nx,px=nx*cm,py=ny*cm;let t0=-1e9,t1=1e9;
 for(const e of g.n){const k=e[0]*dx+e[1]*dy,r=e[2]-(e[0]*px+e[1]*py);if(Math.abs(k)<1e-9)continue;const t=r/k;if(k>0)t1=Math.min(t1,t);else t0=Math.max(t0,t)}
 return{a:[px+dx*t0,py+dy*t0],b:[px+dx*t1,py+dy*t1],w}}
function xLayBSPX(K,X0,Y0,X1,Y1,dc,mn,mx){const{R,rr}=K,out=[],MIN=mn,MX=mx,sn=v=>Math.round(v/20)*20,sn10=v=>Math.round(v/10)*10,bd=[X0,Y0,X1,Y1];
 const bbOf=P=>{let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const p of P){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1])}return[x0,y0,x1,y1]};
 const leafR=(x0,y0,x1,y1,cmp)=>{for(const q of xShape(K,x0,y0,x1,y1,{neck:1,cmp,bd,ex:1}))out.push(q)};
 // foglia non rettangolare (nata da un taglio a 45°): la stanza è il poligono stesso, orientata lungo il suo lato più lungo; le schegge troppo sottili restano vuoto
 const leafP=P=>{if(P.length<3)return;const g=xPg(P);if(g.p.length<3||xDep(g,g.cx,g.cy)<120)return;
  if(xIsRect(g.p)){const b=g.bb;leafR(b[0],b[1],b[2],b[3]);return}
  let bl=0,ang=0;for(let i=0;i<g.p.length;i++){const a=g.p[i],b=g.p[(i+1)%g.p.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(l>bl){bl=l;ang=Math.atan2(b[1]-a[1],b[0]-a[0])}}
  out.push({k:'r',g,cham:1,ang})};
 const cut3=(P,nx,ny,c0,c1)=>[xClip(P,nx,ny,c0),xClip(xClip(P,nx,ny,c1),-nx,-ny,-c0),xClip(P,-nx,-ny,-c1)];   // metà A · corridoio · metà B (stesse rette: le pareti combaciano)
 const good=Q=>{if(Q.length<3)return false;const g=xPg(Q);return g.p.length>=3&&xDep(g,g.cx,g.cy)>=MIN*.5};
 // taglio a 45°: fascia diagonale attraverso il riquadro, le due metà diventano trapezi o triangoli
 const diagCut=(P,d,cw)=>{const s2=Math.SQRT1_2,nx=s2,ny=(R()<.5?1:-1)*s2;let lo=1e9,hi=-1e9;for(const p of P){const q=p[0]*nx+p[1]*ny;lo=Math.min(lo,q);hi=Math.max(hi,q)}
  const c0=lo+(hi-lo)*rr(.36,.64)-cw/2,c1=c0+cw,[A,Cq,B]=cut3(P,nx,ny,c0,c1);if(!good(A)||!good(B)||Cq.length<3)return false;
  const g=xPg(Cq);out.push({k:'c',diag:1,fix:1,d,g,axis:xAxisOf(g,nx,ny,c0+cw/2,cw)});rec(A,d+1);rec(B,d+1);return true};
 // taglio ad arco: in un angolo del riquadro (con entrambi i lati verso l'interno) un corridoio a quarto di cerchio gira attorno a una sala a spicchio;
 // fuori dall'arco una sala dal muro curvo (ventaglio di triangoli fusi), poi le due strisce rimaste continuano a dividersi
 const arcCut=(x0,y0,x1,y1,d,cw)=>{const w=x1-x0,h=y1-y0,m=Math.min(w,h),CR=[[x0,y0,1,1,0,3],[x1,y0,-1,1,0,1],[x1,y1,-1,-1,2,1],[x0,y1,1,-1,2,3]].filter(c=>!xOnBd(c[4],x0,y0,x1,y1,bd)&&!xOnBd(c[5],x0,y0,x1,y1,bd));
  if(!CR.length)return false;const c=K.pick(CR),C0=[c[0],c[1]],sx=c[2],sy=c[3],aw=Math.max(cw,240);let rI=sn10(rr(.3,.44)*m);rI=Math.min(rI,m-MIN-aw-20);if(rI<300)return false;
  const rO=rI+aw,n=rO>950?10:8,Pt=(r,k)=>{const t=k*Math.PI/2/n;return[C0[0]+sx*r*Math.cos(t),C0[1]+sy*r*Math.sin(t)]};
  const G={rb:[Math.min(C0[0],C0[0]+sx*rO),Math.min(C0[1],C0[1]+sy*rO),Math.max(C0[0],C0[0]+sx*rO),Math.max(C0[1],C0[1]+sy*rO)],pieces:[]},add=s=>{s.grp=G;G.pieces.push(s);out.push(s);return s};
  const inn=[];for(let k=0;k<=n;k++)inn.push(Pt(rI,k));add({k:'r',g:xPg([C0,...inn]),cham:1,role:'hub',ang:Math.atan2(sy,sx)});
  const rm=(rI+rO)/2;for(let k=0;k<n;k++)add({k:'c',ring:1,fix:1,d,rk:k,rc:C0,g:xPg([Pt(rI,k),Pt(rI,k+1),Pt(rO,k+1),Pt(rO,k)]),axis:{a:Pt(rm,k),b:Pt(rm,k+1),w:aw}});
  const gate=(r0,r1,k)=>{const a=Pt(r0,k),b=Pt(r1,k);add({k:'c',neck:1,gate:1,fix:1,g:xSeg(a[0],a[1],b[0],b[1],180),axis:{a,b,w:180}})};   // passaggio corto nel muro curvo (i tratti curvi sono troppo corti per una porta)
  gate(rI-60,rI+80,n/2);
  const F=[C0[0]+sx*rO,C0[1]+sy*rO],FU={};for(let k=0;k<n;k++)add({k:'r',g:xPg([F,Pt(rO,k),Pt(rO,k+1)]),role:'outer',fuse:FU,cham:1});
  gate(rO-80,rO+60,n/2+(R()<.5?-2:2));
  const ax0=sx>0?C0[0]+rO:x0,ax1=sx>0?x1:C0[0]-rO,bx0=G.rb[0],bx1=G.rb[2],by0=sy>0?C0[1]+rO:y0,by1=sy>0?y1:C0[1]-rO;
  rec(xRectP(ax0,y0,ax1,y1),d+1);rec(xRectP(bx0,by0,bx1,by1),d+1);return true};
 const rec=(P,d)=>{const b=bbOf(P),x0=b[0],y0=b[1],x1=b[2],y1=b[3],w=x1-x0,h=y1-y0,big=Math.max(w,h),rect=xIsRect(P),leaf=()=>rect?leafR(x0,y0,x1,y1):leafP(P);
  const cw=d<dc&&(d<3||R()<.65)?sn(d==0?rr(270,380):d==1?rr(220,320):rr(200,260)):0;   // corridoi di larghezze diverse
  if(rect){
   if(d>=1&&Math.min(w,h)>=950&&big<=Math.min(w,h)*1.55&&big<=2200&&R()<.3){leafR(x0,y0,x1,y1,1);return}   // foglia grande e quasi quadrata: un complesso
   if(cw&&d>=1&&Math.min(w,h)>=1300&&R()<X_ARC_P&&arcCut(x0,y0,x1,y1,d,cw))return;
   if(cw&&d<=2&&Math.min(w,h)>=1500&&big<=Math.min(w,h)*1.7&&R()<(d?X_DIAG_P:X_DIAG_P*.65)&&diagCut(P,d,cw))return}
  else{const g=xPg(P);if(xDep(g,g.cx,g.cy)<MIN*.75+cw/2){leafP(P);return}}
  if((d>=dc&&big<rr(MX[0],MX[1]))||big<MIN*2+cw+20){leaf();return}
  const v=w>h*1.2?1:h>w*1.2?0:(R()<.5?1:0),Ln=v?w:h;if(Ln<MIN*2+cw){leaf();return}
  const s=sn(clamp(Ln*rr(.34,.66),MIN,Ln-MIN-cw)),nx=v?1:0,ny=v?0:1,c0=(v?x0:y0)+s,c1=c0+cw,[A,Cq,B]=cut3(P,nx,ny,c0,c1);
  if(!rect&&(!good(A)||!good(B))){leafP(P);return}
  if(cw&&Cq.length>=3){const g=xPg(Cq);if(xIsRect(g.p))out.push({k:'c',vert:v,d,g});else out.push({k:'c',vert:v,d,fix:1,g,axis:xAxisOf(g,nx,ny,c0+cw/2,cw)})}   // corridoio dritto in un poligono: estremità oblique, non si accorcia
  rec(A,d+1);rec(B,d+1)};
 rec(xRectP(X0,Y0,X1,Y1),0);
 // stanza di partenza: quella più vicina a un angolo a caso
 const cx=K.ri(0,1)?X1-300:X0+300,cy=K.ri(0,1)?Y1-300:Y0+300;let best=null,bdd=1e9;
 for(const s of out){if(s.k!='r'||s.nk||s.grp||s.fuse)continue;const b=s.g.bb;if(b[2]-b[0]<560||b[3]-b[1]<560||xDep(s.g,s.g.cx,s.g.cy)<260)continue;const d=Math.hypot(s.g.cx-cx,s.g.cy-cy);if(d<bdd){bdd=d;best=s}}
 (best||out.find(s=>s.k=='r'&&!s.grp)||out.find(s=>s.k=='r')).st=1;return out}
// FORME DELLE STANZE (megastruttura): L, T, E, semicerchio, abside (rettangolo + semicerchio), stadio (rettangolo fra due semicerchi), esagono, ottagono con ali.
// Le forme concave sono fatte di pezzi convessi fusi (fuse: niente muro fra loro, una sala sola). Gli angoli rimasti fuori: vuoto o una piccola stanza a parte.
// Il lato "di base" (v=0) è un lato del riquadro che non sta sul bordo della mappa: lì la stanza tocca sempre il vicino per tutta la sua larghezza.
function xShapeX(K,x0,y0,x1,y1,o){const{R,rr}=K,w=x1-x0,h=y1-y0,sn=v=>Math.round(v/10)*10,rb=[x0,y0,x1,y1];
 const sides=[0,1,2,3].filter(sd=>!xOnBd(sd,x0,y0,x1,y1,o.bd)),sd=sides.length?K.pick(sides):K.ri(0,3);
 const W2=sd%2?h:w,H2=sd%2?w:h,f=sd==0?(u,v)=>[x0+u,y0+v]:sd==2?(u,v)=>[x1-u,y1-v]:sd==3?(u,v)=>[x0+v,y1-u]:(u,v)=>[x1-v,y0+u];
 const R2=(u0,v0,u1,v1)=>{const p=f(u0,v0),q=f(u1,v1);return xRect(Math.min(p[0],q[0]),Math.min(p[1],q[1]),Math.max(p[0],q[0]),Math.max(p[1],q[1]))};
 const PG=pts=>xPg(pts.map(p=>f(p[0],p[1]))),o0=f(0,0),oV=f(0,1),oU=f(1,0),angV=Math.atan2(oV[1]-o0[1],oV[0]-o0[0]),angU=Math.atan2(oU[1]-o0[1],oU[0]-o0[0]);
 const arc=(cu,cv,r,a0,a1,n)=>{const P=[];for(let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n;P.push([cu+Math.cos(a)*r,cv+Math.sin(a)*r])}return P};
 const FU={},out=[],part=(g,ex)=>{const s=Object.assign({k:'r',g,fuse:FU},ex||{});out.push(s);return s},
  spare=(u0,v0,u1,v1)=>{if(Math.min(u1-u0,v1-v0)>=300&&R()<.55)out.push({k:'r',g:R2(u0,v0,u1,v1)})};   // angolo rimasto: piccola stanza a parte, altrimenti vuoto
 const TY=[];if(Math.min(W2,H2)>=620)TY.push(['L',1]);if(H2>=540&&W2>=640)TY.push(['T',1]);if(W2>=1000&&H2>=560)TY.push(['E',.8]);
 if(Math.min(W2/2,H2)>=320)TY.push(['semi',.8]);if(W2>=560&&H2>=600)TY.push(['apse',1]);if(W2>=H2+300&&H2>=440)TY.push(['stadium',.8]);
 if(W2>=600&&H2>=420)TY.push(['hex',.9]);if(W2>=H2*1.35+60&&H2>=560)TY.push(['octw',.8]);
 if(!TY.length)return null;let tw=TY.reduce((a,t)=>a+t[1],0)*R(),ty=TY[0][0];for(const t of TY){tw-=t[1];if(tw<0){ty=t[0];break}}
 if(ty=='L'){const a=sn(W2*rr(.42,.58)),b=sn(H2*rr(.42,.58));if(a<260||b<260||W2-a<250||H2-b<250)return null;
  part(R2(0,0,a,H2));part(R2(a,H2-b,W2,H2));spare(a,0,W2,H2-b);return out}
 if(ty=='T'){const b=sn(H2*rr(.38,.52)),s=sn(W2*rr(.36,.5));if(b<260||H2-b<260||s<260||(W2-s)/2<180)return null;
  part(R2(0,0,W2,b));part(R2((W2-s)/2,b,(W2+s)/2,H2));spare(0,b,(W2-s)/2,H2);spare((W2+s)/2,b,W2,H2);return out}
 if(ty=='E'){const a=sn(H2*rr(.34,.46)),p=sn(W2*rr(.2,.25)),g=(W2-3*p)/2;if(a<260||H2-a<260||p<200||g<200)return null;
  part(R2(0,0,W2,a));for(const u of[0,(W2-p)/2,W2-p])part(R2(u,a,u+p,H2));spare(p,a,p+g,H2);spare(W2-p-g,a,W2-p,H2);return out}
 if(ty=='semi'){const r=sn(Math.min(W2/2,H2)*rr(.92,1));return[{k:'r',g:PG(arc(W2/2,0,r,0,Math.PI,14)),cham:1,semi:1,rb,ang:angV}]}
 if(ty=='apse'){const d=sn(H2*rr(.45,.62)),rA=sn(Math.min(W2*rr(.3,.45),H2-d));if(d<280||rA<200)return null;
  part(R2(0,0,W2,d));part(PG(arc(W2/2,d,rA,0,Math.PI,12)),{semi:1,ang:angV});spare(0,d,W2/2-rA,H2);spare(W2/2+rA,d,W2,H2);return out}
 if(ty=='stadium'){const r=H2/2;part(R2(r,0,W2-r,H2));part(PG(arc(r,r,r,Math.PI/2,Math.PI*1.5,10)),{semi:1,ang:angU+Math.PI});part(PG(arc(W2-r,r,r,-Math.PI/2,Math.PI/2,10)),{semi:1,ang:angU});return out}
 if(ty=='hex'){const c=sn(Math.min(W2*rr(.18,.3),(W2-340)/2));if(c<60)return null;return[{k:'r',g:PG([[c,0],[W2-c,0],[W2,H2/2],[W2-c,H2],[c,H2],[0,H2/2]]),cham:1,rb,ang:angU}]}
 if(ty=='octw'){const R0=H2/2/.924,ul=W2/2-H2/2,hs=R0*.383;if(ul<220)return null;const P=[];for(let i=0;i<8;i++){const a=(i+.5)*Math.PI/4;P.push([W2/2+Math.cos(a)*R0,H2/2+Math.sin(a)*R0])}
  part(PG(P),{oct:1,R:R0});part(R2(0,H2/2-hs,ul,H2/2+hs));part(R2(W2-ul,H2/2-hs,W2,H2/2+hs));
  spare(0,0,ul,H2/2-hs);spare(W2-ul,0,W2,H2/2-hs);spare(0,H2/2+hs,ul,H2);spare(W2-ul,H2/2+hs,W2,H2);return out}
 return null}
// ATRI A PIAZZA: alcune stanze che danno su un corridoio diventano una piazza unita al corridoio (nessun muro sul lato in comune)
function xPlazas(K,S){const{R}=K,C=S.filter(c=>c.k=='c'&&!c.neck&&!c.tube&&!c.ring&&!c.tri&&!c.gate&&!c.atr);let n=0;
 for(const s of K.shuf(S.filter(s=>s.k=='r'&&!s.st&&!s.grp&&!s.fuse&&!s.nk&&!s.oct))){if(n>=X_PLAZA_MAX)break;if(R()>X_PLAZA_P)continue;const b=s.g.bb;if(Math.min(b[2]-b[0],b[3]-b[1])<420)continue;
  let best=null,bl=0;for(const c of C){if(!xBbHit(b,c.g.bb,4))continue;const pen=xPen(s.g,c.g);if(pen>6||pen<=-3)continue;for(const q of xShared(s.g,c.g))if(q.L>bl){bl=q.L;best=c}}
  if(best&&bl>=320){s.piaz=best;s.rt0=K.m.th==3?'belvedere':'atrio';s.keep=1;n++}}}
// ASTRONAVE: la poppa è il lato della mappa più vicino alla partenza (lì attraccano le navette); le stanze grandi su quel bordo diventano i motori,
// la stanza grande più lontana da quel bordo il ponte di comando. Il resto della pianta è quello della megastruttura
function xShipRoles(K,S){const st=S.find(s=>s.st);if(!st)return;const cx=st.g.cx,cy=st.g.cy,D=[cx,cy,WW-cx,WH-cy],sd=D.indexOf(Math.min(...D));   // 0 ovest · 1 nord · 2 est · 3 sud
 K.m.stern=[[-1,0],[0,-1],[1,0],[0,1]][sd];
 const near=s=>{const q=s.g.bb;return sd==0?q[0]:sd==1?q[1]:sd==2?WW-q[2]:WH-q[3]},far=s=>sd==0?s.g.cx:sd==1?s.g.cy:sd==2?WW-s.g.cx:WH-s.g.cy;
 const ok=s=>s.k=='r'&&!s.st&&!s.grp&&!s.fuse&&!s.nk&&!s.piaz&&!s.rt0,mn=s=>Math.min(s.g.bb[2]-s.g.bb[0],s.g.bb[3]-s.g.bb[1]);
 const E=S.filter(s=>ok(s)&&near(s)<300&&mn(s)>=420).sort((a,b)=>Math.hypot(a.g.cx-cx,a.g.cy-cy)-Math.hypot(b.g.cx-cx,b.g.cy-cy));
 for(const s of E.slice(0,3)){s.rt0='motori';s.keep=1}
 let bow=null;for(const s of S)if(ok(s)&&mn(s)>=520&&(!bow||far(s)>far(bow)))bow=s;if(bow){bow.rt0='ponte';bow.keep=1}}
function xPlumes(K,L){const m=K.m,bk=m.stern||[-1,0];m.plumes=[];
 for(const s of L){if(s.rt!='motori')continue;const b=s.g.bb,cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2,ex=bk[0]?(bk[0]<0?b[0]:b[2]):cx,ey=bk[1]?(bk[1]<0?b[1]:b[3]):cy;
  const n=Math.max(1,Math.round((bk[0]?b[3]-b[1]:b[2]-b[0])/420));
  for(let i=0;i<n;i++){const f=(i+.5)/n;m.plumes.push({x:bk[0]?ex:b[0]+(b[2]-b[0])*f,y:bk[1]?ey:b[1]+(b[3]-b[1])*f,a:Math.atan2(bk[1],bk[0]),w:K.rr(110,160)})}}}
// CORRIDOI della megastruttura prima degli arredi: colore della luce a tema (dalle stanze su cui il corridoio dà, pesate per lunghezza del lato in comune),
// tinta delle colonne (dal pavimento), imbocchi degli altri corridoi (lì niente colonne). Gli archi prendono un colore solo per tutto l'anello
function xCorPrep(K,L,P2){const cat=s=>XLCAT[s.rt]||'tec';
 for(const s of L){s.mouth=[];if(s.k=='r')s.lc=XLC[cat(s)]}
 const votes=L.map(()=>({}));
 for(const pr of P2.values()){const a=L[pr.i],b=L[pr.j],wt=pr.ov?300:pr.L||0;
  if(a.k=='c'&&b.k=='r')votes[pr.i][cat(b)]=(votes[pr.i][cat(b)]||0)+wt;
  if(b.k=='c'&&a.k=='r')votes[pr.j][cat(a)]=(votes[pr.j][cat(a)]||0)+wt;
  if(pr.mg&&!pr.ov&&a.k=='c'&&b.k=='c'&&!a.tri&&!b.tri&&!a.atr&&!b.atr&&!(a.ring&&b.ring))for(const q of pr.sh){const l=[q.ax,q.ay,q.bx,q.by];a.mouth.push(l);b.mouth.push(l)}}
 // colori: ogni corridoio (un anello conta come uno) ha il suo colore; si preferisce quello a tema delle stanze vicine, ma mai uguale a un corridoio che lo tocca
 const top=v=>{let b='tec',bv=-1;for(const c in v)if(v[c]>bv){bv=v[c];b=c}return XLC[b]},PAL=Object.values(XLC).concat(XLC_X);
 const node=s=>s.ring&&s.rc?'r'+Math.round(s.rc[0])+','+Math.round(s.rc[1]):'c'+s.id,items=new Map(),nbs=new Map(),pref=new Map();
 L.forEach((s,i)=>{if(s.k!='c')return;const n=node(s);if(!items.has(n)){items.set(n,[]);nbs.set(n,new Set());pref.set(n,{})}items.get(n).push(s);const pv=pref.get(n);for(const c in votes[i])pv[c]=(pv[c]||0)+votes[i][c]});
 for(const pr of P2.values()){const a=L[pr.i],b=L[pr.j];if(a.k!='c'||b.k!='c'||!(pr.mg||pr.ov))continue;const na=node(a),nb=node(b);if(na!==nb){nbs.get(na).add(nb);nbs.get(nb).add(na)}}
 const col=new Map();for(const[n,ss]of items){const used=new Set([...nbs.get(n)].map(x=>col.get(x)).filter(Boolean)),p0=top(pref.get(n)),fr=PAL.filter(c=>!used.has(c));
  const c=!used.has(p0)&&K.R()<.4?p0:fr.length?K.pick(fr):p0,pc=ss[0].fl&&ss[0].fl[1];col.set(n,c);for(const s of ss){s.lc=c;s.pc=pc}}}
// COLONNE dei corridoi curvi (anelli e quarti d'anello): una o due file lungo l'arco, una colonna quadrata ogni 200 px misurati sulla fila
function xRingCols(K,L){const groups=new Map();
 for(const s of L)if(s.k=='c'&&s.ring&&s.rc&&s.axis){const k=Math.round(s.rc[0])+','+Math.round(s.rc[1])+','+Math.round(s.axis.w);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s)}
 for(const segs of groups.values()){segs.sort((a,b)=>a.rk-b.rk);const rc=segs[0].rc,wd=segs[0].axis.w,ps=wd>=280?44:wd>=250?40:34,A=p=>Math.atan2(p[1]-rc[1],p[0]-rc[0]);
  let rIv=1e9,rOv=0,ha=0,Th=0;
  for(const s of segs){for(const p of s.g.p){const r=Math.hypot(p[0]-rc[0],p[1]-rc[1]);rIv=Math.min(rIv,r);rOv=Math.max(rOv,r)}const da=ad(A(s.axis.b),A(s.axis.a));ha=Math.max(ha,Math.abs(da)/2);Th+=da}
  if(Math.abs(Th)<.05)continue;const th0=A(segs[0].axis.a),dir=Th>0?1:-1,AT=Math.abs(Th),closed=AT>TAU-.02;
  const r1=rIv+X_TI/2+ps*.71+6,r2=rOv*Math.cos(ha)-X_TI/2-ps*.71-6;if(r2<r1)continue;
  const pts=[],row=(r,step,alt)=>{const L0=AT*r,n=closed?Math.floor(L0/step):Math.floor((L0-100)/step)+1;if(n<1)return;const da=step/r,s0=closed?0:(AT-(n-1)*da)/2;
   for(let i=0;i<n;i++)pts.push([th0+dir*(s0+i*da),alt?(i%2?r2:r1):r])};
  if(r2-r1>=X_COLD){row(r1,X_COLS);row(r2,X_COLS)}else row((r1+r2)/2,X_COLS,1);   // corridoio stretto: colonne alternate fra i due lati
  for(const[a,r]of pts)for(const dt of[0,30,-30,60,-60]){const aa=a+dt/r,x=rc[0]+Math.cos(aa)*r,y=rc[1]+Math.sin(aa)*r,S=segs.find(s=>xDep(s.g,x,y)>ps*.5);if(!S)continue;
   if(xPut(K,S,'column',x,y,ps,ps,aa+Math.PI/2,{wl:1,gap:6}))break}}}
// AMMORBIDIMENTO della pianta a corridoi dritti:
//  · incroci e curve: l'angolo della stanza dietro lo spigolo viene tagliato a 45° e il triangolo passa al corridoio (piazzette ottagonali)
//  · atri: una stanza lungo il corridoio cede una striscia; il corridoio si allarga, con un colonnato sul bordo e le stanze vicine tagliate a 45° alle due estremità
function xSoften(K,S){const{R,rr}=K,sn=v=>Math.round(v/10)*10,C=S.filter(c=>c.k=='c'&&!c.fix&&!c.neck&&!c.tube&&c.vert!=null&&c.g.p.length==4),out=[];
 const RM=()=>S.filter(s=>s.k=='r'&&!s.grp&&!s.st),nr=(a,b)=>Math.abs(a-b)<1.5,hasV=(s,x,y)=>s.g.p.some(q=>nr(q[0],x)&&nr(q[1],y));
 const clipR=(s,nx,ny,c)=>{const P=xClip(s.g.p,nx,ny,c);if(P.length<3)return false;const g=xPg(P);if(xDep(g,g.cx,g.cy)<150)return false;s.g=g;s.rb=null;s.cut=1;if(!s.oct)s.cham=1;return true};
 const cutTri=(N,T,keep)=>{const A=T[1],B=T[2];let nx=B[1]-A[1],ny=A[0]-B[0],c=nx*A[0]+ny*A[1];if(nx*keep[0]+ny*keep[1]>c){nx=-nx;ny=-ny;c=-c}
  const tc=[(T[0][0]+T[1][0]+T[2][0])/3,(T[0][1]+T[1][1]+T[2][1])/3];if(xDep(N.g,tc[0],tc[1])<1)return false;return clipR(N,nx,ny,c)};
 // atri
 for(const c of C){if(R()>.65)continue;const b=c.g.bb,v=c.vert;
  for(const sd of K.shuf([-1,1])){if(R()>.5)continue;const line=v?(sd<0?b[0]:b[2]):(sd<0?b[1]:b[3]),W=(u,w)=>v?[line+sd*w,u]:[u,line+sd*w],
   mr=(u0,w0,u1,w1)=>{const a=W(u0,w0),q=W(u1,w1);return xRect(Math.min(a[0],q[0]),Math.min(a[1],q[1]),Math.max(a[0],q[0]),Math.max(a[1],q[1]))};
   const cand=RM().filter(s=>!s.cut&&!s.oct&&!s.nk&&!s.fuse&&!s.semi).filter(s=>{const q=s.g.bb;if(!(v?(sd<0?nr(q[2],line):nr(q[0],line))&&q[1]>=b[1]-1&&q[3]<=b[3]+1:(sd<0?nr(q[3],line):nr(q[1],line))&&q[0]>=b[0]-1&&q[2]<=b[2]+1))return false;
    const u0=v?q[1]:q[0],u1=v?q[3]:q[2];return hasV(s,...W(u0,0))&&hasV(s,...W(u1,0))});   // il lato sul corridoio è dritto da un capo all'altro
   if(!cand.length)continue;const Rm=K.pick(cand),q=Rm.g.bb,u0=v?q[1]:q[0],u1=v?q[3]:q[2],V=v?q[2]-q[0]:q[3]-q[1],e=sn(rr(150,250));if(u1-u0<420||V-e<380)continue;
   {const a=W(u0,e),c2=W(u1,e);let nx=c2[1]-a[1],ny=a[0]-c2[0],cc=nx*a[0]+ny*a[1];const kp=W((u0+u1)/2,V);if(nx*kp[0]+ny*kp[1]>cc){nx=-nx;ny=-ny;cc=-cc}if(!clipR(Rm,nx,ny,cc))continue}out.push({k:'c',vert:v,fix:1,atr:1,atrN:v?[-sd,0]:[0,-sd],g:mr(u0,0,u1,e)});
   for(const[uc,du]of[[u0,-1],[u1,1]]){const N=RM().find(s=>s!==Rm&&hasV(s,...W(uc,0))&&xDep(s.g,...W(uc+du*10,10))>0);if(!N)continue;
    const T=[W(uc,0),W(uc+du*e,0),W(uc,e)];if(cutTri(N,T,W(uc+du*(e+60),e+60)))out.push({k:'c',fix:1,tri:1,cs:e,g:xPg(T)})}}}
 // angoli degli incroci e delle curve
 const V=C.filter(c=>c.vert),H=C.filter(c=>!c.vert);
 for(const a0 of V)for(const h0 of H){const a=a0.g.bb,h=h0.g.bb;if(!(a[0]<=h[2]+1&&a[2]>=h[0]-1&&a[1]<=h[3]+1&&a[3]>=h[1]-1))continue;if(R()>.8)continue;const cs=sn(rr(140,250));
  for(const X of[a[0],a[2]])for(const Y of[h[1],h[3]]){const dx=X==a[0]?-1:1,dy=Y==h[1]?-1:1;
   if(dy<0?a[1]>Y-60:a[3]<Y+60)continue;if(dx<0?h[0]>X-60:h[2]<X+60)continue;   // lungo i due lati dello spigolo ci sono entrambi i corridoi
   const N=RM().find(s=>hasV(s,X,Y)&&xDep(s.g,X+dx*10,Y+dy*10)>0);if(!N)continue;
   const T=[[X,Y],[X+dx*cs,Y],[X,Y+dy*cs]];if(cutTri(N,T,[X+dx*(cs+80),Y+dy*(cs+80)]))out.push({k:'c',fix:1,tri:1,cs,g:xPg(T)})}}
 for(const q of out)S.push(q);return S}
// collo: corto corridoio dal lato sd del riquadro (0 su, 1 destra, 2 giù, 3 sinistra), centrato in t, fino a dove inside() è vero
function xNeckTo(x0,y0,x1,y1,sd,t,nw,inside){const m=Math.min(x1-x0,y1-y0),hor=sd%2==0,pt=(d,e)=>sd==0?[t+e,y0+d]:sd==2?[t+e,y1-d]:sd==3?[x0+d,t+e]:[x1-d,t+e];let d=0;
 for(;d<m;d+=10){const a=pt(d,-nw*.42),c=pt(d,nw*.42);if(inside(a)&&inside(c))break}if(d>=m*.62)return null;d=Math.max(d+10,40);
 const A=pt(0,-nw/2),C=pt(d,nw/2);return{k:'c',neck:1,vert:hor?1:0,g:xRect(Math.min(A[0],C[0]),Math.min(A[1],C[1]),Math.max(A[0],C[0]),Math.max(A[1],C[1]))}}
const xOnBd=(sd,x0,y0,x1,y1,b)=>(sd==0&&y0<b[1]+5)||(sd==2&&y1>b[3]-5)||(sd==3&&x0<b[0]+5)||(sd==1&&x1>b[2]-5);
// COMPLESSI: più spazi pensati insieme in una foglia grande, con stanze "gemelle" (stesso ruolo → stesso tipo e pavimento)
//  ottagono con camere negli angoli · fascia diagonale a 45° (una, o due a X) con le stanze ai lati · corridoio ad anello attorno a una sala tonda · rosa di stanze attorno a un salone
function xComp(K,x0,y0,x1,y1,o){const{R,rr,ri}=K,w=x1-x0,h=y1-y0,m=Math.min(w,h),sn=v=>Math.round(v/10)*10,cx=sn((x0+x1)/2),cy=sn((y0+y1)/2),rb=[x0,y0,x1,y1],grp={rb,pieces:[]};
 const add=s=>{s.grp=grp;grp.pieces.push(s);return s},rect=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],sides=K.shuf([0,1,2,3].filter(sd=>!xOnBd(sd,x0,y0,x1,y1,o.bd)));
 // scelta pesata del complesso (anello, rosa e chiostro solo nelle foglie grandi)
 const TY=[['octc',1],['band',1.1],['comb',1.3],['cross',1],['U',1],['arc',1.3]];if(m>=1000)TY.push(['ring',.9],['rose',.7],['clo',1.2]);
 let tw=TY.reduce((a,t)=>a+t[1],0)*R(),ty='octc';for(const t of TY){tw-=t[1];if(tw<0){ty=t[0];break}}
 const F={},mapR=(f,a)=>{const p=f(a[0],a[1]),q=f(a[2],a[3]);return xRect(Math.min(p[0],q[0]),Math.min(p[1],q[1]),Math.max(p[0],q[0]),Math.max(p[1],q[1]))};
 if(ty=='arc'){   // corridoio curvo: un quarto di anello da un lato all'altro, attorno a una sala a spicchio; fuori una sala dal muro curvo, oppure vuoto
  const q=K.ri(0,3),C0=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]][q],sx=q==0||q==3?1:-1,sy=q<2?1:-1,cw=sn(rr(240,300)),rI=sn(rr(.32,.45)*m),rO=rI+cw;if(rO>m-250||rI<260)return null;
  const n=8,P=(r,k)=>{const t=k*Math.PI/2/n;return[C0[0]+sx*r*Math.cos(t),C0[1]+sy*r*Math.sin(t)]};
  const inn=[];for(let k=0;k<=n;k++)inn.push(P(rI,k));const hub=add({k:'r',g:xPg([C0,...inn]),cham:1,role:'hub',ang:Math.atan2(sy,sx)});
  for(let k=0;k<n;k++){const rm=(rI+rO)/2;add({k:'c',ring:1,fix:1,rk:k,rc:C0,g:xPg([P(rI,k),P(rI,k+1),P(rO,k+1),P(rO,k)]),axis:{a:P(rm,k),b:P(rm,k+1),w:cw}})}
  const gate=(r0,r1,k)=>{const a=P(r0,k),b=P(r1,k);add({k:'c',neck:1,gate:1,fix:1,g:xSeg(a[0],a[1],b[0],b[1],180),axis:{a,b,w:180}})};
  gate(rI-60,rI+80,R()<.5?3:5);   // passaggio fra spicchio e corridoio
  if(R()<.25){const F=[C0[0]+sx*w,C0[1]+sy*h],Cx=[C0[0]+sx*w,C0[1]],Cy=[C0[0],C0[1]+sy*h],FU={};   // fuori: ventaglio di triangoli fusi in una sola sala col muro curvo
   if(Math.hypot(F[0]-P(rO,n/2)[0],F[1]-P(rO,n/2)[1])>=320){add({k:'r',g:xPg([F,Cx,P(rO,0)]),role:'outer',fuse:FU});for(let k=0;k<n;k++)add({k:'r',g:xPg([F,P(rO,k),P(rO,k+1)]),role:'outer',fuse:FU});add({k:'r',g:xPg([F,P(rO,n),Cy]),role:'outer',fuse:FU});
    gate(rO-80,rO+60,R()<.5?2:6)}}
  return grp.pieces}
 if(ty=='cross'){   // sala a croce: quattro bracci uniti in una sola sala; negli angoli camere gemelle oppure vuoto
  const aw=sn(rr(.36,.48)*m);if(aw<300)return null;const hx0=cx-aw/2,hx1=cx+aw/2,hy0=cy-aw/2,hy1=cy+aw/2;
  add({k:'r',g:xRect(x0,hy0,x1,hy1),role:'arm',fuse:F});add({k:'r',g:xRect(hx0,y0,hx1,hy0),role:'arm',fuse:F});add({k:'r',g:xRect(hx0,hy1,hx1,y1),role:'arm',fuse:F});
  if(Math.min(hx0-x0,hy0-y0)>=300&&R()<.6){const C=[[x0,y0,hx0,hy0],[hx1,y0,x1,hy0],[hx1,hy1,x1,y1],[x0,hy1,hx0,y1]];for(const i of R()<.6?[0,1,2,3]:R()<.5?[0,2]:[1,3])add({k:'r',g:xRect(...C[i]),role:'corner'})}
  return grp.pieces}
 if(ty=='U'){   // sala a U attorno a una corte (vuota, oppure un giardino/atrio) aperta su un lato
  const sd=K.ri(0,3),W2=sd%2?h:w,H2=sd%2?w:h,aw=sn(rr(.28,.38)*Math.min(W2,H2));if(aw<280||W2-2*aw<180)return null;
  const f=sd==0?(u,v)=>[x0+u,y0+v]:sd==2?(u,v)=>[x0+u,y1-v]:sd==3?(u,v)=>[x0+v,y0+u]:(u,v)=>[x1-v,y0+u];
  add({k:'r',g:mapR(f,[0,H2-aw,W2,H2]),role:'arm',fuse:F});add({k:'r',g:mapR(f,[0,0,aw,H2-aw]),role:'arm',fuse:F});add({k:'r',g:mapR(f,[W2-aw,0,W2,H2-aw]),role:'arm',fuse:F});
  if(W2-2*aw>=280&&H2-aw>=280&&R()<.5)add({k:'r',g:mapR(f,[aw,0,W2-aw,H2-aw]),role:'court',fo:1});
  return grp.pieces}
 if(ty=='clo'){   // chiostro: quattro bracci (corridoi o una sala ad anello) attorno a un pozzo di luce o a una corte
  const rw=sn(rr(.22,.3)*m);if(rw<260||m-2*rw<220)return null;const asC=R()<.5,A=[[x0,y0,x1,y0+rw,0],[x0,y1-rw,x1,y1,0],[x0,y0+rw,x0+rw,y1-rw,1],[x1-rw,y0+rw,x1,y1-rw,1]];
  for(const a of A)add(asC?{k:'c',vert:a[4],fix:1,role:'arm',g:xRect(a[0],a[1],a[2],a[3])}:{k:'r',role:'arm',fuse:F,g:xRect(a[0],a[1],a[2],a[3])});
  if(R()<.5&&m-2*rw>=300)add({k:'r',g:xRect(x0+rw,y0+rw,x1-rw,y1-rw),role:'court',fo:1});
  return grp.pieces}
 if(ty=='comb'){   // galleria a pettine: un corridoio lungo e una fila (o due) di celle uguali che vi si affacciano, tutte con il loro varco
  const hor=w>=h,LW=hor?w:h,SH=hor?h:w,sp=sn(rr(260,320)),both=SH>=sp+2*300&&R()<.55,cd=both?(SH-sp)/2:SH-sp;if(cd<280)return null;
  const n=Math.max(2,Math.round(LW/rr(270,360))),cw=LW/n;if(cw<240)return null;const s0=both?cd:(R()<.5?0:cd),f=hor?(u,v)=>[x0+u,y0+v]:(u,v)=>[x0+v,y0+u],alt=R()<.35;
  add({k:'c',vert:hor?0:1,fix:1,role:'spine',g:mapR(f,[0,s0,LW,s0+sp])});
  const rows=both?[[0,cd],[cd+sp,SH]]:s0==0?[[sp,SH]]:[[0,cd]];
  for(const[v0,v1]of rows)for(let i=0;i<n;i++)add({k:'r',g:mapR(f,[Math.round(i*cw),v0,Math.round((i+1)*cw),v1]),role:alt&&i%2?'cellB':'cellA',fo:1,symM:hor?'x':'y'});
  return grp.pieces}
 if(ty=='octc'){   // ottagono con camere d'angolo (tutte e quattro o una coppia opposta)
  const c=sn(Math.min(rr(.28,.36)*m,(m-330)/2));if(c<220)return null;
  add({k:'r',g:xPg([[x0+c,y0],[x1-c,y0],[x1,y0+c],[x1,y1-c],[x1-c,y1],[x0+c,y1],[x0,y1-c],[x0,y0+c]]),cham:1,role:'hub'});
  const T=[[[x0,y0],[x0+c,y0],[x0,y0+c]],[[x1,y0],[x1,y0+c],[x1-c,y0]],[[x1,y1],[x1-c,y1],[x1,y1-c]],[[x0,y1],[x0,y1-c],[x0+c,y1]]];
  for(const i of R()<.55?[0,1,2,3]:R()<.5?[0,2]:[1,3])add({k:'r',g:xPg(T[i]),cham:1,role:'corner',symM:'y',ang:Math.atan2(cy-T[i][0][1],cx-T[i][0][0])});return grp.pieces}
 if(ty=='band'){   // fasce diagonali a 45°: corridoi che attraversano la foglia, stanze a trapezio o triangolo ai lati
  const X=R()<.4,bw=sn(rr(250,310)),h2=bw/2,D=X?[[1,1],[1,-1]]:[R()<.5?[1,1]:[1,-1]],N=D.map(d=>[-d[1]/Math.SQRT2,d[0]/Math.SQRT2]),C0=N.map(n=>n[0]*cx+n[1]*cy);
  for(let k=0;k<D.length;k++){const n=N[k],c0=C0[k],P=xClip(xClip(rect,n[0],n[1],c0+h2),-n[0],-n[1],-(c0-h2)),d=[D[k][0]/Math.SQRT2,D[k][1]/Math.SQRT2];let t0=-1e9,t1=1e9;
   for(const[q,lo,hi]of[[d[0],x0-cx,x1-cx],[d[1],y0-cy,y1-cy]]){const a=lo/q,b=hi/q;t0=Math.max(t0,Math.min(a,b));t1=Math.min(t1,Math.max(a,b))}
   add({k:'c',diag:1,fix:1,band:1,g:xPg(P),axis:{a:[cx+d[0]*t0,cy+d[1]*t0],b:[cx+d[0]*t1,cy+d[1]*t1],w:bw}})}
  const SG=X?[[1,1],[-1,-1],[1,-1],[-1,1]]:[[1],[-1]];
  for(let q=0;q<SG.length;q++){const sg=SG[q];let P=rect;for(let k=0;k<D.length;k++){const n=N[k];P=sg[k]>0?xClip(P,-n[0],-n[1],-(C0[k]+h2)):xClip(P,n[0],n[1],C0[k]-h2)}
   if(P.length<3)continue;const g=xPg(P);if(xDep(g,g.cx,g.cy)<130)continue;add({k:'r',g,cham:1,role:X?(q<2?'quadA':'quadB'):'side',symM:'x',ang:Math.atan2(D[0][1],D[0][0])})}
  return grp.pieces.length>=2?grp.pieces:null}
 if(m<1000||sides.length<2)return null;   // anello e rosa hanno bisogno di colli verso almeno due lati
 const cc0=(n)=>Math.cos(Math.PI/n);
 if(ty=='ring'){   // corridoio ad anello (16 tratti) attorno a una sala tonda; passaggi corti nel muro interno, colli verso i lati
  const n=16,cc=cc0(n),rw=sn(rr(230,280));let rI=sn(rr(.2,.26)*m);if(rI+rw>m/2-80)rI=m/2-80-rw;if(rI<220)return null;const rO=rI+rw,V=(r,k)=>{const a=(k+.5)*TAU/n;return[cx+Math.cos(a)*r/cc,cy+Math.sin(a)*r/cc]};
  const inn=[],out=[];for(let k=0;k<n;k++){inn.push(V(rI,k));out.push(V(rO,k))}
  const hub=add({k:'r',g:xPg(inn),oct:1,role:'hub'});hub.R=rI/.924;
  for(let k=0;k<n;k++){const k1=(k+1)%n,rm=(rI+rO)/2;add({k:'c',ring:1,fix:1,rk:k,rc:[cx,cy],g:xPg([inn[k],inn[k1],out[k1],out[k]]),axis:{a:V(rm,k),b:V(rm,k1),w:rw}})}
  const ng=R()<.5?2:4,j0=ri(0,3)*4;for(let q=0;q<ng;q++){const a=(j0+q*n/ng)*TAU/n,ca=Math.cos(a),sa=Math.sin(a),A=[cx+ca*(rI-60),cy+sa*(rI-60)],B=[cx+ca*(rI+80),cy+sa*(rI+80)];
   add({k:'c',neck:1,gate:1,fix:1,g:xSeg(A[0],A[1],B[0],B[1],180),axis:{a:A,b:B,w:180}})}
  const og=xPg(out);let nn=0;for(const sd of sides){if(nn>=ri(2,4))break;const q=xNeckTo(x0,y0,x1,y1,sd,sd%2==0?cx:cy,sn(rr(300,340)),p=>xDep(og,p[0],p[1])>54);if(q){add(q);nn++}}
  return nn?grp.pieces:null}
 {// rosa: salone a 6 o 8 lati, attorno stanze a trapezio (petali alternati di due tipi)
  const n=R()<.5?6:8,cc=cc0(n),k0=n==6?0:.5;let rI=sn(Math.max(n==6?270:370,rr(.2,.25)*m)),rO=m/2-40;
  const V=(r,k)=>{const a=(k+k0)*TAU/n;return[cx+Math.cos(a)*r/cc,cy+Math.sin(a)*r/cc]};
  let bx=0,by=0;for(let k=0;k<n;k++){const p=V(rO,k);bx=Math.max(bx,Math.abs(p[0]-cx));by=Math.max(by,Math.abs(p[1]-cy))}
  const f=Math.min(1,(w/2-30)/bx,(h/2-30)/by);rO*=f;if(rO-rI<230)return null;
  const inn=[],out=[];for(let k=0;k<n;k++){inn.push(V(rI,k));out.push(V(rO,k))}
  const hub=add({k:'r',g:xPg(inn),oct:1,role:'hub'});hub.R=rI/.924;
  for(let k=0;k<n;k++){const k1=(k+1)%n;add({k:'r',g:xPg([inn[k],inn[k1],out[k1],out[k]]),cham:1,role:k%2?'petalB':'petalA',symM:'y',ang:((k+k0+.5)*TAU/n)})}
  const og=xPg(out);let nn=0;for(const sd of sides){if(nn>=ri(2,3))break;const q=xNeckTo(x0,y0,x1,y1,sd,sd%2==0?cx:cy,sn(rr(300,340)),p=>xDep(og,p[0],p[1])>54);if(q){add(q);nn++}}
  return nn?grp.pieces:null}}
// forma di una stanza dentro il riquadro di una foglia: rettangolo, angoli tagliati (a 45° o storti, diversi fra loro), sala diagonale,
// ottagono; con nk anche sale "staccate" dai lati (cerchio, esagono, rombo, galleria a 45°, poligono irregolare) raggiunte da corti colli
function xShape(K,x0,y0,x1,y1,o){const{R,rr,ri}=K,w=x1-x0,h=y1-y0,m=Math.min(w,h),sn=v=>Math.round(v/10)*10,rb=[x0,y0,x1,y1];
 if(o.neck&&(o.cmp||(m>=700&&R()<.32))){const c=xComp(K,x0,y0,x1,y1,o);if(c)return c}
 if(o.neck&&m>=640&&R()<(o.ex?.3:.34)){const v=R();let P=[],kind='cham',ang=0;
  if(v<.3){const n=m>1000?24:20,a0=R()*TAU;for(let i=0;i<n;i++)P.push([Math.cos(a0+i*TAU/n),Math.sin(a0+i*TAU/n)]);kind='oct'}
  else if(v<.45){const a0=R()<.5?0:Math.PI/6;for(let i=0;i<6;i++)P.push([Math.cos(a0+i*TAU/6),Math.sin(a0+i*TAU/6)]);kind='oct'}
  else if(v<.6){const k=R()<.6?1:rr(.75,1.3);P=[[0,-1],[k,0],[0,1],[-k,0]]}   // rombo: muri a 45°
  else if(v<.75){const a=(R()<.5?1:-1)*Math.PI/4,c=Math.cos(a),q=Math.sin(a),lw=rr(.32,.5);for(const[u,t]of[[-1,-lw],[1,-lw],[1,lw],[-1,lw]])P.push([u*c-t*q,u*q+t*c]);ang=a}   // galleria in diagonale
  else{const k=ri(5,8),sx=rr(.75,1.3);for(let i=0;i<k;i++){const a=(i+rr(-.3,.3))*TAU/k,r=rr(.72,1);P.push([Math.cos(a)*r*sx,Math.sin(a)*r])}P=xHull(P)}   // poligono irregolare
  let bx0=1e9,by0=1e9,bx1=-1e9,by1=-1e9;for(const p of P){bx0=Math.min(bx0,p[0]);by0=Math.min(by0,p[1]);bx1=Math.max(bx1,p[0]);by1=Math.max(by1,p[1])}
  const sc=Math.min((w-50)/(bx1-bx0),(h-50)/(by1-by0))*rr(.84,1),ox=x0+25+rr(0,Math.max(0,w-50-(bx1-bx0)*sc))-bx0*sc,oy=y0+25+rr(0,Math.max(0,h-50-(by1-by0)*sc))-by0*sc;   // posizione libera nel riquadro: niente simmetria
  const g=xPg(P.map(p=>[ox+p[0]*sc,oy+p[1]*sc]));if(xDep(g,g.cx,g.cy)<220)return[{k:'r',g:xRect(x0,y0,x1,y1)}];
  // colli: dai lati del riquadro fino dentro la sala (sui lati al bordo dell'area non servono)
  const out=[],sides=K.shuf([0,1,2,3]),want=ri(2,4);
  for(const sd of sides){if(out.length>=want)break;const hor=sd%2==0,b=o.bd;if((sd==0&&y0<b[1]+5)||(sd==2&&y1>b[3]-5)||(sd==3&&x0<b[0]+5)||(sd==1&&x1>b[2]-5))continue;
   const nw=sn(rr(300,360)),gb=g.bb,c0=hor?(gb[0]+gb[2])/2:(gb[1]+gb[3])/2,sp=hor?gb[2]-gb[0]:gb[3]-gb[1],lo=Math.max((hor?x0:y0)+nw/2+30,c0-sp*.28),hi=Math.min((hor?x1:y1)-nw/2-30,c0+sp*.28);if(lo>hi)continue;
   const t=sn(rr(lo,hi)),pt=(d,e)=>sd==0?[t+e,y0+d]:sd==2?[t+e,y1-d]:sd==3?[x0+d,t+e]:[x1-d,t+e];let d=0;
   for(;d<m;d+=10){const a=pt(d,-nw*.42),c=pt(d,nw*.42);if(xDep(g,a[0],a[1])>54&&xDep(g,c[0],c[1])>54)break}if(d>=m*.6)continue;d=Math.max(d+10,40);
   const A=pt(0,-nw/2),C=pt(d,nw/2);out.push({k:'c',neck:1,vert:hor?1:0,g:xRect(Math.min(A[0],C[0]),Math.min(A[1],C[1]),Math.max(A[0],C[0]),Math.max(A[1],C[1]))})}
  if(!out.length)return[{k:'r',g:xRect(x0,y0,x1,y1)}];
  const S={k:'r',g,nk:1,rb,ang};if(kind=='oct'){S.oct=1;S.R=xDep(g,g.cx,g.cy)/.924}else S.cham=1;for(const q of out)q.par=S;return[S].concat(out)}
 if(o.ex&&m>=560&&R()<.55){const q=xShapeX(K,x0,y0,x1,y1,o);if(q)return q}   // megastruttura: L, T, E, semicerchio, abside, stadio, esagono, ottagono con ali
 const u=R(),C=[[x0,y0,1,1],[x1,y0,-1,1],[x1,y1,-1,-1],[x0,y1,1,-1]],poly=(cx,cy)=>{const q=[];
  for(let i=0;i<4;i++){const[x,y,sx,sy]=C[i];if(!cx[i]||!cy[i]){q.push([x,y]);continue}if(i%2==0){q.push([x,y+sy*cy[i]]);q.push([x+sx*cx[i],y])}else{q.push([x+sx*cx[i],y]);q.push([x,y+sy*cy[i]])}}return xPg(q)};
 // sala diagonale: due angoli opposti tagliati a fondo, resta una fascia a 45°
 if(m>=700&&u<.14){const c=sn(Math.min(rr(.36,.52)*m,m-340)),d=R()<.5?0:1,cx=[0,0,0,0],cy=[0,0,0,0];cx[d]=cy[d]=cx[d+2]=cy[d+2]=c;
  const e=1-d;if(R()<.4){const c2=sn(rr(50,110));if(c+c2<=m-340){cx[e]=cy[e]=c2}}
  return[{k:'r',g:poly(cx,cy),cham:1,rb,ang:d?Math.PI/4:-Math.PI/4}]}
 if(m>=760&&u<.22){const R0=m/2/.924;return[{k:'r',g:xOct((x0+x1)/2,(y0+y1)/2,R0),oct:1,R:R0,rb}]}
 // angoli tagliati: ognuno per conto suo, a 45° o storti; su ogni lato restano almeno 330 px dritti (per le porte)
 if(m>=420&&u<.68){const cx=[0,0,0,0],cy=[0,0,0,0],mX=(w-330)/2,mY=(h-330)/2;let any=0;
  for(let i=0;i<4;i++){if(R()>.62)continue;const a=rr(50,Math.min(320,m*.42)),s45=R()<.55;let ax=s45?a:rr(50,Math.min(360,w*.45)),ay=s45?a:rr(50,Math.min(360,h*.45));
   ax=sn(Math.min(ax,mX));ay=sn(Math.min(ay,mY));if(ax<40||ay<40)continue;cx[i]=ax;cy[i]=ay;any=1}
  if(any)return[{k:'r',g:poly(cx,cy),cham:1,rb}]}
 return[{k:'r',g:xRect(x0,y0,x1,y1)}]}
// ASTRONAVE: BSP nel riquadro dello scafo, poi restano solo le stanze dentro la sagoma (poppa larga, ali, prua affusolata); ruotata a caso di 90°
function xLayHull(K){const{R,rr,ri}=K,X0=260,X1=WW-260,len=X1-X0,mid=WH/2,rot=ri(0,3),
  W0=rr(1750,2050),WG=rr(2450,2800),wa=rr(.18,.28),wb=wa+rr(.18,.28),tp=rr(.72,.8),
  hw=x=>{const u=(x-X0)/len;let w=u<wa?W0:u<wb?WG:u<tp?W0*1.05:W0*1.05*Math.pow(Math.max(0,1-(u-tp)/(1-tp)),.7);return Math.max(220,w)};
 const raw=xLayBSP(K,X0,mid-2900,X1,mid+2900,3,400,[600,1150],0,1),out=[];   // la prima divisione è la chiglia: un viale lungo tutta la nave
 for(const s of raw){if(s.grp){const g=s.grp;if(g.done)continue;g.done=1;const b=g.rb,h=Math.min(hw(b[0]),hw(b[2]),hw((b[0]+b[2])/2)),y0=Math.ceil(Math.max(b[1],mid-h)/20)*20,y1=Math.floor(Math.min(b[3],mid+h)/20)*20;
   if(y1-y0<400||Math.abs((y0+y1)/2-mid)>hw((b[0]+b[2])/2)+40)continue;if(y0>b[1]+1||y1<b[3]-1)out.push({k:'r',g:xRect(b[0],y0,b[2],y1)});else out.push(...g.pieces);continue}   // complesso: intero se sta nella sagoma, altrimenti una stanza tagliata
  const b=s.nk?s.rb:s.g.bb,ok=c=>Math.abs(c[1]-mid)<=hw(c[0])+40;
  if(s.k=='c'){out.push(s);continue}
  const h=Math.min(hw(b[0]),hw(b[2]),hw((b[0]+b[2])/2)),y0=Math.ceil(Math.max(b[1],mid-h)/20)*20,y1=Math.floor(Math.min(b[3],mid+h)/20)*20;   // la stanza si taglia alla sagoma
  if(y1-y0<400||!ok([(b[0]+b[2])/2,(y0+y1)/2]))continue;if(y0>b[1]+1||y1<b[3]-1){s.g=xRect(b[0],y0,b[2],y1);s.oct=0;s.cham=0;s.ang=0;s.nk=0}out.push(s)}
 for(let i=out.length-1;i>=0;i--){const c=out[i];if(c.neck&&c.par&&!(c.par.nk&&out.includes(c.par)))out.splice(i,1)}   // colli di sale tagliate o tolte
 // corridoi: si tagliano alla sagoma (il viale principale corre lungo la chiglia)
 const cut=[];for(const c of out){if(c.k!='c'||c.neck||c.grp){cut.push(c);continue}const b=c.g.bb;
  if(c.vert){const x=(b[0]+b[2])/2,h=hw(x);const y0=Math.max(b[1],mid-h+60),y1=Math.min(b[3],mid+h-60);if(y1-y0>300){c.g=xRect(b[0],y0,b[2],y1);cut.push(c)}}
  else{let x1=b[2];while(x1>b[0]&&Math.abs((b[1]+b[3])/2-mid)>hw(x1)-120)x1-=40;if(x1-b[0]>300){c.g=xRect(b[0],b[1],x1,b[3]);cut.push(c)}}}
 for(const s of cut)s.st=0;
 // partenza: l'hangar più a poppa vicino alla chiglia; motori: le stanze di poppa; ponte: la stanza più a prua
 const rooms=cut.filter(s=>s.k=='r'),sc=s=>{const b=s.g.bb;return Math.min(b[2]-b[0],b[3]-b[1])*2-Math.abs(s.g.cy-mid)*.4};let st=null;   // partenza: l'hangar più grande nel terzo di poppa
 for(const s of rooms){const b=s.g.bb;if(s.nk||s.grp||b[2]-b[0]<560||b[3]-b[1]<560||s.g.cx>X0+len*.38)continue;if(!st||sc(s)>sc(st))st=s}
 (st||rooms[0]).st=1;
 for(const s of rooms)if(!s.st&&s.g.bb[0]<X0+80)s.rt0='motori';
 let bow=null;for(const s of rooms)if(!bow||s.g.bb[2]>bow.g.bb[2])bow=s;if(bow&&!bow.st){bow.rt0='ponte';bow.keep=1}
 const tr=(x,y)=>{let dx=x-WW/2,dy=y-WH/2;for(let k=0;k<rot;k++){const t=dx;dx=-dy;dy=t}return[dx+WW/2,dy+WH/2]};
 K.m.shipRot=rot;
 for(const s of cut){if(s.oct||s.cham||s.grp||s.axis){s.g=xPg(s.g.p.map(q=>tr(q[0],q[1])));if(s.rb){const a=tr(s.rb[0],s.rb[1]),c=tr(s.rb[2],s.rb[3]);s.rb=[Math.min(a[0],c[0]),Math.min(a[1],c[1]),Math.max(a[0],c[0]),Math.max(a[1],c[1])]}if(s.ang)s.ang+=rot*Math.PI/2;
   if(s.axis)s.axis={a:tr(...s.axis.a),b:tr(...s.axis.b),w:s.axis.w};if(s.rc)s.rc=tr(...s.rc);if(s.k=='c'&&rot&1&&s.vert!=null)s.vert=s.vert?0:1;continue}   // sale smussate e ottagonali: si ruotano i vertici
  const b=s.g.bb,a=tr(b[0],b[1]),c=tr(b[2],b[3]);s.g=xRect(Math.min(a[0],c[0]),Math.min(a[1],c[1]),Math.max(a[0],c[0]),Math.max(a[1],c[1]));if(s.k=='c'&&rot&1)s.vert=s.vert?0:1}
 // scie dei motori nello spazio: dietro le stanze di poppa
 K.m.plumes=[];const back=[-1,0];for(let k=0;k<rot;k++){const t=back[0];back[0]=-back[1];back[1]=t}
 for(const s of cut)if(s.rt0=='motori'){const b=s.g.bb,cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2,ex=back[0]?(back[0]<0?b[0]:b[2]):cx,ey=back[1]?(back[1]<0?b[1]:b[3]):cy;
  const n=Math.max(1,Math.round((back[0]?b[3]-b[1]:b[2]-b[0])/420));for(let i=0;i<n;i++){const f=(i+.5)/n;K.m.plumes.push({x:back[0]?ex:b[0]+(b[2]-b[0])*f,y:back[1]?ey:b[1]+(b[3]-b[1])*f,a:Math.atan2(back[1],back[0]),w:rr(110,160)})}}
 return cut}
// BASE SOTTOMARINA: grandi moduli sparsi sul fondale (rotondi, ottagonali, esagonali, quadrati, rettangolari), collegati da tubi a L, a 45° o dritti.
// I moduli quadrati e rettangolari grandi si dividono in 2-3 sale (BSP senza corridoi). Muri, porte, lampioni e arredo sono quelli della megastruttura (xMG)
const X4_DOOR_P=.9;   // tubi con la porta al centro
const X4_TW=300,X4_POD=[[.25,680,900],[.7,500,680],[1,400,500]],X4_GAP=210;   // larghezza dei tubi · taglie dei moduli [probabilità cumulata, raggio min, max] · spazio minimo fra due moduli
function xLayPods(K){const{R,rr,ri,PROF}=K,out=[],pods=[],tw=X4_TW;
 const corner=[[760,760],[WW-760,760],[WW-760,WH-760],[760,WH-760]][ri(0,3)];
 pods.push({x:corner[0],y:corner[1],R:520,rect:[corner[0]-480,corner[1]-440,corner[0]+480,corner[1]+440],st:1});
 const want=clamp(Math.round(16+PROF.sites[1]*.45),18,30);
 for(let t=0;t<500&&pods.length<want;t++){const u=R(),T=X4_POD.find(q=>u<q[0]),r0=rr(T[1],T[2]);let x=0,y=0,bs=1e9;
  for(let k=0;k<60;k++){const cx=rr(r0+220,WW-r0-220),cy=rr(r0+220,WH-r0-220);let sl=1e9;for(const p of pods){const d=Math.hypot(p.x-cx,p.y-cy)-(p.R+r0+X4_GAP);if(d<sl)sl=d}
   if(sl>=0&&sl<bs){bs=sl;x=cx;y=cy}}   // fra i punti liberi il più vicino agli altri moduli: la base resta compatta e ci stanno più moduli
  if(bs>=1e9)continue;
  const p={x,y,R:r0},q=R();if(r0>440&&q<.5){const sq=q<.2,w=r0*(sq?rr(1.5,1.7):rr(1.65,2.05)),h=sq?w:r0*rr(1.15,1.4),fl=R()<.5,W2=fl?h:w,H2=fl?w:h;   // quadrato o rettangolo (in piedi o coricato)
   p.rect=[x-W2/2,y-H2/2,x+W2/2,y+H2/2];p.R=Math.hypot(W2,H2)/2*.8}pods.push(p)}
 for(const p of pods){if(p.rect){if(p.st){const g=xRect(...p.rect);p.subs=[g];out.push({k:'r',g,st:1,rt0:'dock',pod:p})}
   else{const sub=xLayBSP(K,p.rect[0],p.rect[1],p.rect[2],p.rect[3],0,520,[900,1300]);p.subs=sub.map(s=>s.g);for(const s of sub){s.st=0;s.pod=p;s.mod=1;out.push(s)}}}   // subs: le sale vere (smussate, ottagonali...) del modulo   // sale grandi; xLayBSP sceglie una sua partenza: qui la partenza è solo l'attracco
  else{const v=R();let g;
   if(v<.4)g=xCirc(p.x,p.y,p.R,p.R>650?28:24,R()*TAU);   // rotondo
   else if(v<.7)g=xOct(p.x,p.y,p.R);                     // ottagonale
   else g=xCirc(p.x,p.y,p.R*1.04,6,R()<.5?0:Math.PI/6);  // esagonale
   p.g=g;out.push({k:'r',g,oct:1,R:xDep(g,p.x,p.y)/.924,pod:p})}}
 // albero minimo fra i moduli + qualche collegamento in più (corti)
 const E=[],inT=new Set([0]);while(inT.size<pods.length){let b=null,bd=1e18;for(const i of inT)for(let j=0;j<pods.length;j++){if(inT.has(j))continue;const d=Math.hypot(pods[i].x-pods[j].x,pods[i].y-pods[j].y);if(d<bd){bd=d;b=[i,j]}}inT.add(b[1]);E.push(b)}
 for(let i=0;i<pods.length;i++){let b=-1,bd=2100;for(let j=0;j<pods.length;j++){if(j==i||E.some(e=>(e[0]==i&&e[1]==j)||(e[0]==j&&e[1]==i)))continue;const d=Math.hypot(pods[i].x-pods[j].x,pods[i].y-pods[j].y);if(d<bd){bd=d;b=j}}if(b>=0&&R()<.3)E.push([i,b])}
 // tubi: il percorso (a L, a 45° più un tratto dritto, oppure dritto) si taglia al bordo dei due moduli, così non attraversa le sale
 // (prima partiva dal centro e cancellava i muri divisori dei moduli a più sale); si sceglie un percorso che non passa dentro un terzo modulo
 const h=tw/2,inPod=(p,x,y)=>p.rect?p.subs.some(g=>xDep(g,x,y)>0):xDep(p.g,x,y)>0;   // dentro una delle sale del modulo (non nel riquadro: le sale possono essere smussate)
 const plAt=(P,s)=>{for(let i=0;i<P.length-1;i++){const L=Math.hypot(P[i+1][0]-P[i][0],P[i+1][1]-P[i][1]);if(s<=L||i==P.length-2){const t=L?Math.min(1,s/L):0;return[P[i][0]+(P[i+1][0]-P[i][0])*t,P[i][1]+(P[i+1][1]-P[i][1])*t,Math.atan2(P[i+1][1]-P[i][1],P[i+1][0]-P[i][0])]}s-=L}};
 const plLen=P=>{let L=0;for(let i=0;i<P.length-1;i++)L+=Math.hypot(P[i+1][0]-P[i][0],P[i+1][1]-P[i][1]);return L};
 const plCut=(P,s0,s1)=>{const o=[plAt(P,s0).slice(0,2)];let acc=0;for(let i=0;i<P.length-1;i++){acc+=Math.hypot(P[i+1][0]-P[i][0],P[i+1][1]-P[i][1]);if(acc>s0+1&&acc<s1-1)o.push(P[i+1])}o.push(plAt(P,s1).slice(0,2));return o};   // tratto fra s0 e s1
 K.m.x4d=[];let tid=0;
 for(const[i,j]of E){tid++;const segs=[];const a=pods[i],b=pods[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.min(Math.abs(dx),Math.abs(dy)),sx=Math.sign(dx),sy=Math.sign(dy);
  const C=K.shuf([[[a.x,a.y],[b.x,a.y],[b.x,b.y]],[[a.x,a.y],[a.x,b.y],[b.x,b.y]],[[a.x,a.y],[a.x+sx*d,a.y+sy*d],[b.x,b.y]],[[a.x,a.y],[b.x-sx*d,b.y-sy*d],[b.x,b.y]],[[a.x,a.y],[b.x,b.y]]]);
  let best=null;
  for(const P of C){const Ln=plLen(P);if(Ln<10)continue;let s0=0,s1=Ln;for(let s=0;s<=Ln;s+=10){const q=plAt(P,s);if(inPod(a,q[0],q[1]))s0=s}for(let s=Ln;s>=0;s-=10){const q=plAt(P,s);if(inPod(b,q[0],q[1]))s1=s}
   if(s1-s0<60)continue;const T={P,s0,s1};if(!best)best=T;let bad=false;
   for(let s=s0;s<=s1&&!bad;s+=25){const q=plAt(P,s),nx=-Math.sin(q[2]),ny=Math.cos(q[2]);for(const o of[-h-40,0,h+40]){const x=q[0]+nx*o,y=q[1]+ny*o;if(pods.some(p=>p!==a&&p!==b&&inPod(p,x,y))){bad=true;break}}}
   if(!bad){best=T;break}}
  if(!best)continue;const{P,s0,s1}=best,Q=plCut(P,Math.max(0,s0-10),Math.min(plLen(P),s1+10));   // 10 px dentro i moduli: con la mezza larghezza del tubo la sovrapposizione è abbondante
  for(let k=0;k<Q.length-1;k++){const[x0,y0]=Q[k],[x1,y1]=Q[k+1];if(Math.hypot(x1-x0,y1-y0)<2)continue;const v=Math.abs(x1-x0)<1,hz=Math.abs(y1-y0)<1,axis={a:[x0,y0],b:[x1,y1],w:tw};
   const sg=!v&&!hz?{k:'c',tube:1,diag:1,axis,g:xSeg(x0,y0,x1,y1,tw)}   // tratto in diagonale
    :{k:'c',vert:v?1:0,tube:1,axis,g:v?xRect(x0-h,Math.min(y0,y1)-h,x0+h,Math.max(y0,y1)+h):xRect(Math.min(x0,x1)-h,y0-h,Math.max(x0,x1)+h,y0+h)};
   sg.tid=tid;segs.push(sg);out.push(sg)}
  // porta al centro del tubo: dal punto medio si cerca, alternando avanti e indietro, un punto coperto da un solo tratto del tubo (non nel gomito) e fuori dai moduli
  if(s1-s0>=160&&R()<X4_DOOR_P){const sm=(s0+s1)/2;
   for(let k=0;k<=(s1-s0)/2-50;k+=20){let q=null;for(const sg of k?[1,-1]:[1]){const c=plAt(P,sm+sg*k);if(segs.filter(g=>xDep(g.g,c[0],c[1])>-6).length==1&&!pods.some(pp=>inPod(pp,c[0],c[1]))){q=c;break}}
    if(q){K.m.x4d.push({x:q[0],y:q[1],a:q[2]+Math.PI/2,w:tw-X_TO+8,tid});break}}}}
 return out}

// punto lungo il tratto s (fra lo e hi) dove cade il centro di una cella della griglia di navigazione, il più vicino a c (null se non c'è)
function xNavC(s,c,lo,hi){const x=s.ax+s.ux*c,y=s.ay+s.uy*c,ax=Math.abs(s.ux)<.02||Math.abs(s.uy)<.02;let best=null,bd=1e9;
 for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){const cx=(Math.floor(x/NC)+i)*NC+NC/2,cy=(Math.floor(y/NC)+j)*NC+NC/2,t=(cx-s.ax)*s.ux+(cy-s.ay)*s.uy,dp=Math.abs((cx-s.ax)*s.nx+(cy-s.ay)*s.ny);
  if(t<lo||t>hi||(!ax&&dp>22))continue;const d=Math.abs(t-c)+(ax?0:dp);if(d<bd){bd=d;best=t}}   // muro dritto: basta allinearsi lungo il muro · muro obliquo: la cella deve stare sul muro
 return best}
// apertura nella parete in comune pr (varco o porta): nel tratto più lungo, lontano dagli angoli
function xOpen(K,pr,ty){const{rr}=K,s=pr.sh.reduce((a,b)=>b.L>a.L?b:a),T2=xMG(K.m.th),W0=T2?X_OPW:[180,300],mn=T2?84:120;
 let w=Math.min(rr(W0[0],W0[1]),s.L-110),nar=0;if(w<W0[0]-10){w=s.L-90;nar=1;if(w<mn)return}   // pareti corte: varco stretto ma sempre passabile
 for(let t=0;t<8;t++){let c=nar?s.L/2:rr(w/2+55,s.L-w/2-55);if(!(c>0))return;
  if(T2){const lo=nar?w/2+10:w/2+55;let cs=xNavC(s,c,lo,s.L-lo);if(cs==null)cs=xNavC(s,c,w/2+15,s.L-w/2-15);if(cs==null&&w>92){w=92;cs=xNavC(s,c,w/2+15,s.L-w/2-15)}if(cs!=null)c=cs}   // megastruttura: varco stretto centrato su una cella della griglia dell'AI (il percorso A* ci passa)
  if(pr.op.some(o=>Math.abs(o.c-c)<(o.w+w)/2+120))continue;
  pr.op.push({c,w,ty,x:s.ax+s.ux*c,y:s.ay+s.uy*c,ux:s.ux,uy:s.uy,nx:s.nx,ny:s.ny,seg:s});return}}

// tipi di stanza, partenza (base e punti di arrivo), siti per missioni e civili
const XRS={2:['ripostiglio','ufficio','bagni','server2','ufficio'],3:['cabina','ripostiglio','capsule','cabina'],4:['cabina','ripostiglio','cabina','server2']};
// base sottomarina: pavimenti dei tubi per zona della mappa (piastre chiodate, grigliati, metallo bagnato, ceramica)
const X4_CF=[['rivet','#44646a','#25393d'],['grate','#3a5a60','#1c3034'],['wet','#3e5a5e','#23373a'],['tile','#4a6a70','#2c4448'],['rivet','#4e5a52','#2c342e'],['wave','#3a6670','#20404a'],['plate','#46606a','#28383e'],['rivet','#3a4e5e','#1e2a34']];
function xRooms(K,L){const{m,R,rr,pick}=K,th=m.th,tab=XRT[th],ws=tab.reduce((a,t)=>a+t[1],0),pk=()=>{let x=R()*ws;for(const t of tab){x-=t[1];if(x<0)return t[0]}return tab[0][0]};
 const st=L.find(s=>s.st)||L.find(s=>s.k=='r');st.st=1;st.rt=th==4?'dock':'hangar';
 const b=st.g.bb;BASE.ox=(b[0]+b[2])/2-330;BASE.oy=(b[1]+b[3])/2-330;   // base di 660×640 centrata nella stanza: spawnAt e inBase la seguono
 const s0=baseXY(200,200),e0=baseXY(260,260);START[0]=s0[0];START[1]=s0[1];EXT[0]=e0[0];EXT[1]=e0[1];
 // reattore: la stanza grande più lontana dalla partenza
 const ez=s=>Math.min(s.g.bb[2]-s.g.bb[0],s.g.bb[3]-s.g.bb[1],2*xDep(s.g,s.g.cx,s.g.cy)+60);   // misura utile (un triangolo lungo e stretto non conta come stanza grande)
 let far=null;for(const s of L){if(s.k!='r'||s.st||s.rt0)continue;const m2=ez(s);if(m2<720)continue;const d=Math.hypot(s.g.cx-START[0],s.g.cy-START[1]);
  s.sc=(d>OBJ_MIN+300?1e5:0)+(d>OBJ_MIN+300?m2:d);if(!far||s.sc>far.sc)far=s}   // lontana quanto basta per le missioni, poi la più grande
 if(far)far.rt='reattore';
 // stanze per le missioni: centri operativi (un edificio al centro, attorno spazio libero: guardia di sicurezza, difesa della base)
 // e una baia di carico quasi vuota (ricerca e recupero); tutte lontane dalla partenza
 const big=L.filter(s=>s.k=='r'&&!s.rt&&!s.rt0&&Math.hypot(s.g.cx-START[0],s.g.cy-START[1])>2600).map(s=>[ez(s),s]).sort((a,b)=>b[0]-a[0]);
 const mb=1;if(big.length&&big[0][0]>=1100*mb){big[0][1].rt='baia';big.shift()}
 for(const[m2,s]of big.slice(0,2))if(m2>=860*mb)s.rt='comando';
 for(const s of L){if(s.rt)continue;if(s.k=='c'){s.rt='cor';continue}
  if(s.rt0){s.rt=s.rt0;continue}
  const w=s.g.bb[2]-s.g.bb[0],h=s.g.bb[3]-s.g.bb[1];let t=pk();
  if(Math.min(w,h)<560&&!s.oct&&R()<.75)t=pick(XRS[th]);   // stanze piccole: ripostigli, uffici singoli, servizi, cabine...
  if((t=='server'||t=='stiva'||t=='magazzino')&&Math.min(w,h)<520)t=pick(['uffici','lab','alloggi','mensa'].filter(q=>tab.some(z=>z[0]==q)))||t;
  if(s.oct&&(t=='server'||t=='uffici'))t='lab';
  if(th==2&&w*h>1.9e6&&R()<.4)t='atrio';
  s.rt=t}
 // complessi: lo stesso ruolo ha lo stesso tipo (camere d'angolo gemelle, petali alternati, stanze ai lati della fascia); il salone centrale è una sala "di rappresentanza"
 {const SP0=['reattore','comando','baia','ponte','motori','hangar','dock'],HUB={2:['atrio','olo','lab','mensa','serra'],3:['olo','mensa','serra','lab','infermeria'],4:['serra','osservatorio','lab','mensa']},BIG=['hub','arm','court','outer'],seen=new Map();
  for(const s of L){if(s.k!='r'||!s.grp||s.st||SP0.includes(s.rt))continue;let mp=seen.get(s.grp);if(!mp){mp={};seen.set(s.grp,mp)}
   if(!mp[s.role]){if(BIG.includes(s.role))s.rt=pick(HUB[th]);mp[s.role]=s}else s.rt=mp[s.role].rt}}
 const SP=['reattore','comando','baia','ponte','motori'],lead=i=>m.mgU[i]===i?i:lead(m.mgU[i]);   // sale unite: le parti prendono il tipo della prima
 for(const s of L){if(s.k!='r')continue;const r=L[lead(s.id)];if(r!==s&&!r.st&&!s.st&&!SP.includes(s.rt)&&!SP.includes(r.rt)){s.rt=r.rt;s.lead=r}}
 if(xMG(th)){const ok=s=>s.k=='r'&&!s.st&&!s.grp&&!s.fuse&&!s.lead&&!SP.includes(s.rt)&&!L.some(q=>q.lead===s),C=K.shuf(L.filter(s=>ok(s)&&ez(s)>=500));   // megastruttura e astronave: c'è sempre un'armeria
  const A=C.find(s=>Math.hypot(s.g.cx-START[0],s.g.cy-START[1])>1500)||C[0]||K.shuf(L.filter(ok))[0];if(A)A.rt='armeria'}
 for(const s of L){s.fl=xFloorOf(th,s.rt=='comando'?'sicurezza':s.rt=='baia'?'hangar':s.rt,R);s.sd=K.ri(1,99999);s.code=String.fromCharCode(65+K.ri(0,7))+'-'+K.ri(1,48)}
 for(const s of L)if(s.lead){s.fl=s.lead.fl;s.code=s.lead.code}
 if(xMG(th)){const CF=th==4?X4_CF:th==2?[['tile2','#7c8290','#5a606c'],['tile2','#8a7c6c','#62584c'],['marble','#9a9488','#6e6860'],['plate','#5e6670','#40464e'],['tile','#6c7a86','#4c5862'],['hex','#5a6470','#3c444e'],['lino','#9aa4a8','#727c80'],['conc','#7a7468','#58544c'],['tile2','#6c7c74','#4c5a52'],['tile','#7a6a72','#56484e']]
   :[['deck','#3a4048','#22262c'],['grate','#3e444c','#1e2228'],['deck','#4a4436','#2e2a20'],['plate','#3c4652','#242a32'],['deck','#2e3a46','#1a222a'],['grate','#4a3e3e','#2a2222'],['plate','#46484a','#2a2c2e']],Z=K.shuf(CF.slice());
  for(const s of L){if(s.k!='c')continue;const z=clamp(Math.floor(s.g.cx/(WW/3)),0,2)+3*clamp(Math.floor(s.g.cy/(WH/3)),0,2);s.fl=Z[z%Z.length]}}   // corridoi: colore e trama della zona
 {const f=new Map();for(const s of L){if(!s.grp||s.k!='r')continue;const k=s.grp.rb.join()+s.role+s.rt;if(f.has(k))s.fl=f.get(k);else f.set(k,s.fl)}}   // gemelle: stesso pavimento
 // siti: le stanze grandi contano come "città" (caccia al VIP, avamposti, civili); il reattore come centrale (sabotaggio nucleare)
 for(const s of L){if(s.k!='r')continue;const w=s.g.bb[2]-s.g.bb[0],h=s.g.bb[3]-s.g.bb[1];if(ez(s)<(xMG(th)?560:700)&&!(s.oct&&s.R>520))continue;
  const S={k:s.rt=='reattore'?'k':'g',x:s.g.cx,y:s.g.cy,r:Math.min(w,h)*.45,a:0,sp:s};m.sites.push(S);S.id=m.sites.length;s.site=S}
 // missioni che cercano spazio libero (zone da conquistare, area di schianto): il centro di qualche stanza grande e lontana resta sgombro
 m.keep=[];const sel=G.mode==1?-1:G.want,D=sel>0&&MIS[sel],P=D&&D.keepIn;   // campo keepIn della missione: n radure di raggio r · big 1 = le stanze più grandi, altrimenti a caso
 if(P){const fs=m.sites.filter(q=>q.k=='g'&&Math.hypot(q.x-START[0],q.y-START[1])>OBJ_MIN+60).sort((a,b)=>b.r-a.r);
  for(const q of P.big?fs:K.shuf(fs)){if(m.keep.length>=P.n)break;if(m.keep.some(k=>Math.hypot(k.x-q.x,k.y-q.y)<1300))continue;
   const r=P.r;m.keep.push({x:q.x,y:q.y,r,s:q.id});q.sp.kp=r}}}

// muri: ogni lato di ogni spazio, campionato ogni 8 px: dentro un altro spazio → aperto; su una parete in comune → muro interno (una volta sola) o apertura; altrimenti perimetro
// muri: spessi verso il vuoto (esterni, indistruttibili) · sottili fra due spazi (si abbattono a pezzi e aprono un passaggio)
function xWalls(K,L,P2){const m=K.m,key=(i,j)=>i<j?i*4096+j:j*4096+i;
 for(const a of L){const cs=L.filter(b=>b!==a&&xBbHit(a.g.bb,b.g.bb,8)),np=a.g.p.length;
  for(let e=0;e<np;e++){const A=a.g.p[e],B=a.g.p[(e+1)%np],dx=B[0]-A[0],dy=B[1]-A[1],Ln=Math.hypot(dx,dy),ux=dx/Ln,uy=dy/Ln,n=Math.max(1,Math.round(Ln/8)),cl=new Array(n),nbr=new Array(n);
   for(let k=0;k<n;k++){const t=(k+.5)*Ln/n,x=A[0]+ux*t,y=A[1]+uy*t;let c=1,nb=null;
    for(const b of cs){const d=xDep(b.g,x,y);if(d>3){c=0;break}if(d<-3)continue;
     const pr=P2.get(key(a.id,b.id));if(!pr){if(a.id>b.id){c=0;break}c=2;nb=b;continue}if(pr.ov){c=0;break}   // muro in comune fra due spazi: sempre sottile e distruttibile   // sul bordo di uno spazio sovrapposto: aperto (niente monconi nei varchi)
     const on=pr.sh.some(s=>{const q=(x-s.ax)*s.ux+(y-s.ay)*s.uy,r=Math.abs((x-s.ax)*s.uy-(y-s.ay)*s.ux);return q>-1&&q<s.L+1&&r<3});
     if(!on)continue;if(pr.mg||a.id>b.id||pr.op.some(o=>Math.abs((x-o.x)*o.ux+(y-o.y)*o.uy)<o.w/2&&Math.abs((x-o.x)*o.nx+(y-o.y)*o.ny)<6)){c=0;break}c=2;nb=b}
    cl[k]=c;nbr[k]=nb}
   const emit=(t0,t1,th,c)=>{const len=t1-t0;if(len<4)return;const np2=Math.max(1,Math.ceil(len/(c==1?340:260))),sl=len/np2;   // i sottili a pezzi più corti: brecce larghe come una porta
    for(let q=0;q<np2;q++){const tm=t0+sl*(q+.5),x=A[0]+ux*tm,y=A[1]+uy*tm,g=bgeom('rect',sl+2,th),o={t:'b',ty:'wall',shape:'rect',th:'wall',wk:c==1?0:1,x,y,w:sl+2,h:th,a:Math.atan2(uy,ux),c:ux,s:uy,r:g.r,pr:g.pr,an:g.an,hp:1,m:1,ind:1,hi:1,pal:PAL_WALL,sd:(x*7+y*13)|0};
     if(c==2){o.th='bwall';o.hp=o.m=Math.round((sl+2)*5.1);delete o.ind}   // muro sottile fra due spazi: si abbatte (tre volte una porta della stessa larghezza)
     K.addO(o)}};
   for(let k=0;k<n;){const c=cl[k];if(!c){k++;continue}let k2=k;while(k2+1<n&&cl[k2+1]===c&&nbr[k2+1]===nbr[k])k2++;
    const th=c==1?X_TO:X_TI,ext=th/2+(np>=12?10:0);let t0=k*Ln/n,t1=(k2+1)*Ln/n;if(k==0)t0-=ext;if(k2==n-1)t1+=ext;   // sale tonde: pezzi un po' più lunghi, niente fessure fra un pannello e l'altro
    emit(t0,t1,th,c);k=k2+1}}}
 // porte: un pannello alto che chiude il varco (si abbatte) · mai dove la parete non c'è (un terzo spazio la copre: la porta resterebbe in mezzo al nulla)
 for(const pr of P2.values())for(const o of pr.op){if(o.ty!='door')continue;if(K.m.th==4&&L.some(s=>s.id!==pr.i&&s.id!==pr.j&&xDep(s.g,o.x,o.y)>-8))continue;const dh=o.bd?X_DOOR+10:X_DOOR,g=bgeom('rect',o.w+6,dh);
  K.addO({t:'b',ty:'door',shape:'rect',th:'door',x:o.x,y:o.y,w:o.w+6,h:dh,a:Math.atan2(o.uy,o.ux),c:o.ux,s:o.uy,r:g.r,pr:g.pr,an:g.an,hp:Math.round(o.w*1.6*(o.bd?4:1)),hi:1,pal:PAL_WALL,dv:K.ri(0,2),bd:o.bd?1:0})}}   // bd: porta blindata, 4× punti vita

// ===== 4) arredi =====
// tipi di oggetto: hp = vita · c = tondo · hi = alto (ferma l'Air) · ind = indistruttibile · house = edificio "vero" (missioni, armerie, caserme, civili)
// tutti gli oggetti sono ostacoli normali: fermano il Grunt, i colpi e la vista (l'Air ci vola sopra, tranne quelli alti)
const XK={crate:{hp:80},crates:{hp:220},barrels:{hp:140},cont:{hp:420},shelf:{hp:160},server:{hp:200},cooler:{hp:220},desk:{hp:120},table:{hp:90},ctable:{hp:90,c:1},
 bench:{hp:150},tank:{hp:320,c:1},pod:{hp:150,c:1},gen:{hp:420},turbine:{hp:650,c:1},planter:{hp:120},fountain:{hp:600,c:1},holo:{hp:260,c:1},statue:{hp:420,c:1},
 console:{hp:170},holotable:{hp:320,c:1},engine:{hp:1400,c:1},shuttle:{hp:600},bunk:{hp:100},medbed:{hp:110},rack:{hp:160},pump:{hp:380,c:1},hydro:{hp:130},
 locker:{hp:130},barrier:{hp:200},sofa:{hp:90},pillar:{c:1,hi:1,ind:1},column:{hi:1,ind:1},partition:{hi:1,hp:300},shaft:{c:1,hi:1,ind:1},rail:{hp:180},armchair:{hp:70},chair:{hp:40},
 vend:{hp:140},pot:{hp:50,c:1},bigscreen:{hp:150},robot:{hp:160,c:1},copier:{hp:110},bin:{hp:40,c:1},books:{hp:140},sculpt:{hp:500,c:1},arcade:{hp:120},bench2:{hp:90},
 stall:{hp:120},sink:{hp:120},mechbay:{hp:700},torp:{hp:300},fuelc:{hp:260},cryo:{hp:180},ammo:{hp:90},drone:{hp:140,c:1},cargo:{hp:200},
 o2:{hp:160},minisub:{hp:650},suits:{hp:130},valve:{hp:220,c:1},sample:{hp:200,c:1},compressor:{hp:300},
 reception:{hp:200},filecab:{hp:110},divider:{hp:60},counter:{hp:200},cart:{hp:60},ups:{hp:160},fireext:{hp:30,c:1},pallet:{hp:120},forklift:{hp:300},stool:{hp:30,c:1},
 hood:{hp:180},analyzer:{hp:120},toolcart:{hp:80},scanner:{hp:220},bucket:{hp:20,c:1},urinal:{hp:60},dryer:{hp:40},   // megastruttura (XM)
 navcon:{hp:170},captchair:{hp:80},synth:{hp:130},maglock:{hp:260},plasmac:{hp:300,c:1},lifepod:{hp:240},   // astronave (XM3)
 fishtank:{hp:140},coralpot:{hp:60,c:1},   // base sottomarina (XM4): vasca con i pesci, vaso di coralli
 armcrates:{house:1},cabin:{house:1},core:{house:1},reactor:{house:1,c:1},aquarium:{house:1,c:1},bridge:{house:1},lift:{house:1}};
// riquadro libero di una stanza (margine dai muri): stanze rettangolari → il loro riquadro; ottagoni → il quadrato inscritto
function xBox(S,mg){if(S.oct){const h=S.R*.653-mg;return[S.g.cx-h,S.g.cy-h,S.g.cx+h,S.g.cy+h]}const b=S.g.bb;return[b[0]+mg,b[1]+mg,b[2]-mg,b[3]-mg]}
// l'oggetto o sta nella stanza S? dentro i muri, lontano dalle aperture, dalla base e dagli altri oggetti
const _xq=[];
const XLANE=66;   // mezza larghezza delle corsie libere (dalle aperture al centro): ci passa il Grunt e la griglia dell'AI
const xSegD=(x,y,l)=>{const dx=l[2]-l[0],dy=l[3]-l[1],t=clamp(((x-l[0])*dx+(y-l[1])*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-l[0]-dx*t,y-l[1]-dy*t)};
function xFits(S,o,gap,nb,nl){   // nb (o S.nb0, l'hangar di partenza): anche dentro la base di partenza · nl: può stare sulle corsie (pezzi centrali, con un anello libero attorno)
const fb=[];const bb=[1e9,1e9,-1e9,-1e9];for(const q of o.pr){const ex=q.a,ey=q.k=='r'?q.b:q.a;bb[0]=Math.min(bb[0],q.x-ex);bb[1]=Math.min(bb[1],q.y-ey);bb[2]=Math.max(bb[2],q.x+ex);bb[3]=Math.max(bb[3],q.y+ey)}
 const nu=Math.max(2,Math.ceil((bb[2]-bb[0])/55)),nv=Math.max(2,Math.ceil((bb[3]-bb[1])/55));   // campioni ogni ~55 px: niente oggetto lungo che scavalca una corsia
 for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++)fb.push(toWorld(o,bb[0]+(bb[2]-bb[0])*i/nu,bb[1]+(bb[3]-bb[1])*j/nv));
 const mg=o.wl?-4:o.wa?Math.max(X_TO/2+4,(S.mg||X_TI/2)+10):(S.mg||X_TI/2)+10;
 for(const p of fb){if(xDep(S.g,p[0],p[1])<mg)return false;if(!nb&&!S.nb0&&inBase(p[0],p[1],10))return false;for(const e of S.ex)if(Math.hypot(p[0]-e[0],p[1]-e[1])<(e[3]&&(o.wl||o.wa||o.st||S.lw==42)?e[3]+(o.wl?0:o.wa?14:o.st?-10:34):o.ln?e[2]*.7:e[2]))return false;   // ciò che sta contro il muro deve solo restare fuori dal varco · i muri interni della base sottomarina (ln) possono avvicinarsi di più alle zone libere attorno ai pezzi di missione
  if(S.exs)for(const l of S.exs)if(xSegD(p[0],p[1],l)<(o.wl?14:50))return false;   // lato aperto su un altro spazio: niente oggetti a ridosso
  if(!nl)for(const l of S.lanes)if(xSegD(p[0],p[1],l)<(o.ln||(o.st?36:(S.lw||XLANE))))return false;   // ln: corsia propria (muri interni della base sottomarina)
  if(S.k=='c')for(const q of S.ovl)if(xDep(q.g,p[0],p[1])>-50)return false;   // gli arredi dei corridoi non entrano nelle stanze
  if(M.lakes.length)for(const l of M.lakes)if(inBlob(l,p[0],p[1],20))return false}
 for(const b of qobs(o.x,o.y,o.r+gap+40,_xq)){if(b.dead||b===o.ign||((o.wl||o.wa)&&(b.th=='wall'||b.th=='bwall')))continue;if(Math.hypot(b.x-o.x,b.y-o.y)>o.r+b.r+gap)continue;
  for(const p of fb){if(b.t=='t'){if(Math.hypot(p[0]-b.x,p[1]-b.y)<b.r+gap)return false;continue}const l=toLocal(b,p[0],p[1]);if(bsd(b,l[0],l[1])<gap)return false}
  const l=toLocal(o,b.x,b.y);if(bsd(o,l[0],l[1])<gap+(b.t=='t'?b.r:0))return false}
 return true}
function xPut(K,S,kind,x,y,w,h,a,opt){opt=opt||{};const D=XK[kind]||{},sh=D.c?'circle':'rect';if(D.c)w=h=Math.max(w,h);const g=bgeom(sh,w,h);
 const o={t:'b',ty:D.house?'house':kind=='pillar'||kind=='column'||kind=='partition'||kind=='shaft'?'wall':'prop',shape:sh,th:kind,x,y,w,h,a:a||0,c:Math.cos(a||0),s:Math.sin(a||0),r:g.r,pr:g.pr,an:g.an,
  hp:Math.round((D.house?w*h/25*(opt.hm||1):D.hp||100)*(xMG(K.m.th)?2:1)),   // megastruttura e astronave: oggetti interni resistenti il doppio
 v:opt.v!=null?opt.v:K.ri(0,3),sd:K.ri(1,99999),pal:0};
 if(D.hi)o.hi=1;if(D.ind||opt.ind){o.ind=1;o.hp=1}
 if(kind=='partition')o.wk=1;
 if(opt.wl)o.wl=1;if(opt.wa)o.wa=1;if(opt.st)o.st=1;if(opt.ln)o.ln=opt.ln;if(opt.ign)o.ign=opt.ign;   // ign: oggetto a cui ci si appoggia (non conta come ostacolo vicino)
 const isC=(kind=='pillar'||kind=='column')&&K.m.cols;if(isC){for(const q of K.m.cols)if((q[0]-x)*(q[0]-x)+(q[1]-y)*(q[1]-y)<X_COLD*X_COLD)return null;
  if(S.mouth)for(const l of S.mouth)if(xSegD(x,y,l)<Math.max(w,h)/2+X_MOUTH)return null;   // davanti all'imbocco di un altro corridoio: niente colonna
  if(S.pc)o.cc=S.pc;if(S.lc)o.lc=S.lc}   // tinta del corridoio e lampada   // megastruttura: mai due colonne più vicine di X_COLD (anche quelle forzate)
 if(!opt.force&&!xFits(S,o,opt.gap!=null?opt.gap:(S.k=='r'?26:16),opt.nb,opt.nl))return null;   // nelle stanze fra un oggetto e l'altro ci passa sempre il Grunt
 delete o.wl;delete o.wa;delete o.st;delete o.ln;delete o.ign;
 if(opt.dry)return o;   // solo prova: c'è posto?
 if(opt.nl&&!opt.nx)S.ex.push([x,y,o.r+90]);   // pezzo centrale: attorno resta un anello libero dove le corsie si incontrano
 K.addO(o);if(isC){K.m.cols.push([x,y]);if(o.lc&&K.m.lamps)K.m.lamps.push({x,y,c:o.lc})}   // ogni pilastro è un lampione (xLampPaint lo dipinge nello sfondo)
 if(D.house){o.tw=opt.tw!=null?opt.tw:1;o.is=0;o.dec=[0,0];o.rf=0;o.grp=0;o.fz=0;o.rt=S.rt;K.m.blds.push(o)}   // rt: tipo di stanza (gli edifici speciali vanno in stanze adatte, vedi armInit in AGsim.js)
 return o}
// file di oggetti (colonne lungo y se dir=0, righe lungo x se dir=1), centrate nel riquadro B
function xRows(K,S,B,kind,iw,ih,along,aisle,dir,opt){const W=B[2]-B[0],H=B[3]-B[1],cw=dir?H:W,ch=dir?W:H,nc=Math.max(1,Math.floor((cw+aisle)/(iw+aisle))),nr=Math.max(1,Math.floor((ch+along)/(ih+along)));
 const sx=(cw-(nc*iw+(nc-1)*aisle))/2,sy=(ch-(nr*ih+(nr-1)*along))/2;let n=0;
 for(let c=0;c<nc;c++)for(let r=0;r<nr;r++){const u=sx+c*(iw+aisle)+iw/2,v=sy+r*(ih+along)+ih/2,x=dir?B[0]+v:B[0]+u,y=dir?B[1]+u:B[1]+v;
  if(xPut(K,S,kind,x,y,dir?ih:iw,dir?iw:ih,0,opt))n++}return n}
function xGrid(K,S,B,kind,w,h,step,opt,jit){const{rr}=K,W=B[2]-B[0],H=B[3]-B[1],nx=Math.max(1,Math.floor(W/step)),ny=Math.max(1,Math.floor(H/step));let n=0;
 const ga=S.oa||0;   // la griglia segue l'orientamento della stanza
 for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){const x=B[0]+(i+.5)*W/nx+(jit?rr(-jit,jit):0),y=B[1]+(j+.5)*H/ny+(jit?rr(-jit,jit):0);if(xPut(K,S,kind,x,y,w,h,opt&&opt.rot?K.R()*TAU:ga,opt))n++}return n}
function xRing(K,S,cx,cy,rad,n,kind,w,h,opt){if(S.oct)rad=Math.min(rad,S.R*.924-X_TO/2-30-Math.max(w,h)/2);n=Math.min(n,Math.floor(TAU*Math.max(10,rad-(opt&&opt.face?h/2:Math.max(w,h)/2))/((opt&&opt.face?w:Math.max(w,h))+70)));   // fra un pezzo e l'altro resta sempre un passaggio
 let c=0;const a0=K.R()*TAU;for(let i=0;i<n;i++){const a=a0+i*TAU/n;if(xPut(K,S,kind,cx+Math.cos(a)*rad,cy+Math.sin(a)*rad,w,h,opt&&opt.face?a+Math.PI/2:0,opt))c++}return c}
// simmetrie della stanza: ogni oggetto sparso ha le sue copie speculari (a specchio su uno o due assi, ribaltato, oppure ripetuto in giro nelle sale tonde)
// e tutti seguono un orientamento unico per stanza (S.oa): ordine, con la casualità nella scelta dei pezzi e delle posizioni
function xSym(K,S,mode){const{R}=K,cx=S.g.cx,cy=S.g.cy,an=S.oa||0,c=Math.cos(an),s=Math.sin(an),toL=(x,y)=>[(x-cx)*c+(y-cy)*s,-(x-cx)*s+(y-cy)*c],toW=(u,v)=>[cx+u*c-v*s,cy+u*s+v*c];
 const mk=f=>(x,y,a)=>{const l=toL(x,y),r=f(l[0],l[1],a-an),w=toW(r[0],r[1]);return[w[0],w[1],r[2]+an]};
 const MX=mk((u,v,a)=>[-u,v,Math.PI-a]),MY=mk((u,v,a)=>[u,-v,-a]),PT=mk((u,v,a)=>[-u,-v,a+Math.PI]);
 if(mode=='x')return[MX];if(mode=='y')return[MY];
 if(S.oct){const n=K.pick([2,3,4,4,6]),T=[];for(let k=1;k<n;k++){const r=k*TAU/n,cr=Math.cos(r),sr=Math.sin(r);T.push((x,y,a)=>[cx+(x-cx)*cr-(y-cy)*sr,cy+(x-cx)*sr+(y-cy)*cr,a+r])}return T}
 const u=R();return u<.4?[MX,MY,PT]:u<.6?[MX]:u<.8?[MY]:u<.92?[PT]:[]}
function xScat(K,S,B,kind,n,w0,w1,h0,h1,opt){const{rr}=K;let c=0;const T=opt&&opt.free?[]:S.symT||[];
 for(let t=0;t<n*8&&c<n;t++){const w=rr(w0,w1),h=rr(h0,h1),x=rr(B[0],B[2]),y=rr(B[1],B[3]),a=opt&&opt.rot?(S.oa||0)+K.ri(0,3)*Math.PI/2+(K.R()<.3?K.rr(-.3,.3):0):(S.oa||0)+(K.R()<.3?Math.PI/2:0);
  if(!xPut(K,S,kind,x,y,w,h,a,opt))continue;c++;for(const f of T){const q=f(x,y,a);if(xPut(K,S,kind,q[0],q[1],w,h,q[2],opt))c++}}return c}
// lungo i muri della stanza (ogni lato del poligono, a qualunque angolo): oggetti col lato lungo parallelo al muro, a volte un po' storti
function xAlong(K,S,kind,w,h,gap,prob,opt){const p=S.g.p,np=p.length,op=S.open||new Set(),mg=X_TO/2+16,dIn=X_TO/2+12+h/2;
 for(let e=0;e<np;e++){if(op.has(e))continue;const A=p[e],B=p[(e+1)%np],dx=B[0]-A[0],dy=B[1]-A[1],L=Math.hypot(dx,dy),n=Math.floor((L-2*mg+gap)/(w+gap));if(n<1)continue;
  const ux=dx/L,uy=dy/L,nx=S.g.n[e][0],ny=S.g.n[e][1],an=Math.atan2(uy,ux),sl=(L-2*mg)/n,jt=K.R()<.3;
  const oa=Object.assign({wa:1},opt||{});for(let i=0;i<n;i++){if(K.R()>prob)continue;const t=mg+(i+.5)*sl;xPut(K,S,kind,A[0]+ux*t-nx*dIn,A[1]+uy*t-ny*dIn,w,h,an+(jt?K.rr(-.14,.14):0),oa)}}}   // contro il muro: deve solo stare fuori dai varchi
// pilastri addossati ai muri (ostacoli alti, indistruttibili): mai davanti ai varchi né dove la stanza si apre su un altro spazio
function xPilasters(K,S,kind,sz,sp){const p=S.g.p,np=p.length,op=S.open||new Set();let n=0;
 for(let e=0;e<np;e++){if(op.has(e))continue;const A=p[e],B=p[(e+1)%np],dx=B[0]-A[0],dy=B[1]-A[1],L=Math.hypot(dx,dy);if(L<sp*.9||L<sz+80)continue;
  const ux=dx/L,uy=dy/L,nx=S.g.n[e][0],ny=S.g.n[e][1],k=Math.max(1,Math.floor(L/sp)),off=X_TI/2+sz/2-2;
  for(let i=0;i<k;i++){const t=(i+.5)*L/k,ex=A[0]+ux*t,ey=A[1]+uy*t;if(S.ovl.some(q=>xDep(q.g,ex,ey)>-70))continue;
   if(xPut(K,S,kind,ex-nx*off,ey-ny*off,sz,sz,Math.atan2(uy,ux),{wl:1,gap:6}))n++}}return n}
// pilastri: la mappa è divisa in 3×3 zone, ognuna con il suo tipo e la sua misura (nella stessa zona tutti uguali)
function xPZ(K,x,y,cap){const m=K.m;if(!m.pz)m.pz=Array.from({length:9},()=>({k:m.th==3?(K.R()<.7?'pillar':'column'):(K.R()<.5?'pillar':'column'),s:Math.round(K.rr(30,56))}));
 const z=m.pz[clamp(Math.floor(x/(WW/3)),0,2)+3*clamp(Math.floor(y/(WH/3)),0,2)];return{k:z.k,s:Math.min(z.s,cap||99)}}
// LIVELLI: niente altezza vera (il gioco è piatto), ma piani rialzati e ribassati disegnati a terra, chiusi da ringhiere;
// si sale e si scende dalle scale (riservate prima) e dai buchi che le corsie lasciano nella ringhiera, dove si disegnano altre scale
function xRail(K,S,x0,y0,x1,y1,nl,sa,op){const L=Math.hypot(x1-x0,y1-y0),ux=(x1-x0)/L,uy=(y1-y0)/L,n=Math.max(1,Math.round(L/100)),sl=L/n,a=Math.atan2(uy,ux),ok=[];
 for(let i=0;i<n;i++){const t=(i+.5)*sl;ok.push(!!xPut(K,S,'rail',x0+ux*t,y0+uy*t,sl-4,14,a,Object.assign({gap:1},op||{})))}   // op: opzioni in più (balconata: distanze dei pezzi piccoli)
 for(let i=0;i<n;){if(ok[i]){i++;continue}let j=i;while(j+1<n&&!ok[j+1])j++;const t=(i+j+1)/2*sl,w=Math.min(130,(j-i+1)*sl-20);   // buco nella ringhiera: scale
  if(w>=50)xDec(K,'stairs',x0+ux*t+nl[0]*45,y0+uy*t+nl[1]*45,w,90,sa);i=j+1}}
function xLevels(K,S,B,kind){const{R,rr,ri,pick}=K,b=S.g.bb,th=K.m.th,sn=v=>Math.round(v/10)*10,OB=K.m.obs.filter(o=>!o.dead&&o.th!='wall'&&o.th!='bwall'&&o.th!='pillar'&&o.th!='column'&&xDep(S.g,o.x,o.y)>-20);
 if(kind=='balcony'){   // soppalco lungo uno dei lati lunghi (a qualunque angolo): ringhiera parallela al muro, scale, postazioni affacciate
  const p=S.g.p,np=p.length,op=S.open||new Set(),E=[];for(let e=0;e<np;e++){if(op.has(e))continue;const q=p[(e+1)%np],Le=Math.hypot(q[0]-p[e][0],q[1]-p[e][1]);if(Le>=480)E.push([e,Le])}
  if(!E.length)return 0;const d=sn(rr(190,250)),blk=(x,y)=>S.ex.some(q=>Math.hypot(x-q[0],y-q[1])<q[2]+20)||S.lanes.some(l=>xSegD(x,y,l)<(S.lw||XLANE)+20);
  for(const c of E){const e=c[0],A=p[e],Bq=p[(e+1)%np],Le=c[1],ux=(Bq[0]-A[0])/Le,uy=(Bq[1]-A[1])/Le,nx=-S.g.n[e][0],ny=-S.g.n[e][1];let f=0,n=0;   // quanto della ringhiera resterebbe libera da varchi e corsie
   for(let t=60;t<Le-60;t+=50){const x=A[0]+ux*t+nx*d,y=A[1]+uy*t+ny*d;if(xDep(S.g,x,y)<X_TO/2+6)continue;n++;if(!blk(x,y))f++}c[2]=n?f/n:0;
   if(OB.some(o=>{const v=(o.x-A[0])*nx+(o.y-A[1])*ny;return v<d+o.r+20&&v>-50}))c[2]=0}   // sul soppalco non deve esserci già un edificio
  E.sort((x,y)=>y[2]-x[2]||y[1]-x[1]);if(E[0][2]<.6)return 0;const[e]=E[0],A=p[e],Bq=p[(e+1)%np],Le=Math.hypot(Bq[0]-A[0],Bq[1]-A[1]),ux=(Bq[0]-A[0])/Le,uy=(Bq[1]-A[1])/Le,nx=-S.g.n[e][0],ny=-S.g.n[e][1];   // n verso l'interno
  const P=t=>[A[0]+ux*t+nx*d,A[1]+uy*t+ny*d];let t0=null,t1=null;for(let t=0;t<=Le;t+=10){const q=P(t);if(xDep(S.g,q[0],q[1])>X_TO/2+6){if(t0==null)t0=t;t1=t}}
  if(t0==null||t1-t0<380)return 0;const sa=Math.atan2(nx,-ny),Lb=t1-t0,mc=[A[0]+ux*(t0+t1)/2+nx*d/2,A[1]+uy*(t0+t1)/2+ny*d/2];
  if(xDep(S.g,mc[0],mc[1])<d/2-10)return 0;xDec(K,'deck',mc[0],mc[1],Lb,d,sa);
  const ns=Lb>800&&R()<.6?2:1,sw=rr(100,130);for(let i=0;i<ns;i++){const t=t0+(ns==1?Lb*rr(.3,.7):Lb*(i?.78:.22)),q=P(t);S.ex.push([q[0]+nx*55,q[1]+ny*55,sw/2+40]);xDec(K,'stairs',q[0]+nx*55,q[1]+ny*55,sw,110,sa)}
  const a=P(t0),c=P(t1);xRail(K,S,a[0],a[1],c[0],c[1],[nx,ny],sa);
  for(let t=t0+Lb*.15;t<t1-Lb*.1;t+=rr(220,320)){if(R()<.35)continue;const q=P(t);xPut(K,S,pick(['console','console','locker','crates']),q[0]-nx*62,q[1]-ny*62,96,36,sa,{gap:10})}   // sul soppalco: postazioni affacciate
  return 1}
 if(kind=='pit'){   // fossa al centro, allineata alla stanza: ringhiera sui quattro lati, scale sui due lati lunghi, macchinari sul fondo
  const an=S.oa||0,ca=Math.cos(an),sa0=Math.sin(an),cx=S.g.cx,cy=S.g.cy,W=(B[2]-B[0])*rr(.36,.5),H=(B[3]-B[1])*rr(.36,.5);if(Math.min(W,H)<260)return 0;
  const T=(u,v)=>[cx+u*ca-v*sa0,cy+u*sa0+v*ca],C=[T(-W/2,-H/2),T(W/2,-H/2),T(W/2,H/2),T(-W/2,H/2)];if(C.some(q=>xDep(S.g,q[0],q[1])<170)||OB.some(o=>Math.abs((o.x-cx)*ca+(o.y-cy)*sa0)<W/2+o.r+60&&Math.abs(-(o.x-cx)*sa0+(o.y-cy)*ca)<H/2+o.r+60))return 0;
  xDec(K,'pit',cx,cy,W,H,an);const hor=W>=H,sw=rr(100,120),st=hor?[[0,-H/2,0],[0,H/2,Math.PI]]:[[-W/2,0,-Math.PI/2],[W/2,0,Math.PI/2]];
  for(const q of st){const n=[-Math.sin(q[2]+an),Math.cos(q[2]+an)],c0=T(q[0],q[1]);S.ex.push([c0[0]+n[0]*45,c0[1]+n[1]*45,sw/2+40]);xDec(K,'stairs',c0[0]+n[0]*45,c0[1]+n[1]*45,sw,90,q[2]+an)}
  for(let k=0;k<4;k++){const a=C[k],c=C[(k+1)%4],ea=[0,Math.PI/2,Math.PI,-Math.PI/2][k]+an;xRail(K,S,a[0],a[1],c[0],c[1],[-Math.sin(ea),Math.cos(ea)],ea)}
  const mk={2:['holotable','fountain','gen'],3:['gen','engine','turbine'],4:['pump','tank','turbine']}[th],c0=T(0,0);xPut(K,S,pick(mk),c0[0],c0[1],rr(90,130),rr(90,130),an,{nl:1,nx:1,gap:30});
  for(const sg of[-1,1]){const q=T(sg*W*.28,0);xPut(K,S,pick(mk),q[0],q[1],rr(70,100),rr(70,100),an,{gap:30})}return 1}
 if(kind=='dais'){const cx=S.g.cx,cy=S.g.cy,ap=xDep(S.g,cx,cy),rd=Math.min(rr(150,210),ap-230);if(rd<130||OB.some(o=>Math.hypot(o.x-cx,o.y-cy)<rd+o.r+70))return 0;
  xDec(K,'dais',cx,cy,rd*2,rd*2,0);const n=Math.max(8,Math.round(TAU*rd/90)),a0=R()*TAU,sw=110;
  for(let k=0;k<4;k++){const a=a0+k*Math.PI/2;S.ex.push([cx+Math.cos(a)*(rd+45),cy+Math.sin(a)*(rd+45),sw/2+30]);xDec(K,'stairs',cx+Math.cos(a)*(rd+45),cy+Math.sin(a)*(rd+45),sw,90,a-Math.PI/2)}
  for(let k=0;k<n;k++){const a=(k+.5)*TAU/n,x=cx+Math.cos(a)*rd,y=cy+Math.sin(a)*rd;xPut(K,S,'rail',x,y,TAU*rd/n-6,14,a+Math.PI/2,{gap:1})}
  xPut(K,S,pick(th==2?['holotable','statue','sculpt']:th==3?['holotable','holo']:['holotable','sample']),cx,cy,rr(90,130),rr(90,130),0,{nl:1,nx:1,gap:30});return 1}
 return 0}
// giardino: laghetto con sponde e rocce, alberi, aiuole fiorite, panchine (alberi e rocce sono quelli delle mappe normali)
function xGarden(K,S,B,d){const{R,rr,ri}=K,fit=(x,y,r)=>xFits(S,{x,y,a:0,c:1,s:0,r,pr:bgeom('circle',r*2,r*2).pr},20);
 if(d.big>=420&&R()<.75){const r=Math.min(170,d.big*.22);for(let t=0;t<14;t++){const x=rr(B[0]+r+30,B[2]-r-30),y=rr(B[1]+r+30,B[3]-r-30);if(!(x<y+1e9)||!fit(x,y,r+30))continue;
   K.m.lakes.push(blob(K.R,x,y,r));S.ex.push([x,y,r+50]);xDec(K,'pond',x,y,r*2.5,r*2.5,0);
   for(let k=0,n=ri(3,6);k<n;k++){const a=R()*TAU,q=r*rr(1.05,1.25),px=x+Math.cos(a)*q,py=y+Math.sin(a)*q;if(xDep(S.g,px,py)>60)K.rock(px,py,rr(12,24))}break}}
 for(let i=0,n=ri(5,11);i<n;i++){const x=rr(B[0],B[2]),y=rr(B[1],B[3]);if(fit(x,y,30))K.tree(x,y,rr(18,32),true)}
 for(let i=0,n=ri(1,3);i<n;i++){const x=rr(B[0],B[2]),y=rr(B[1],B[3]);if(fit(x,y,26))K.rock(x,y,rr(14,26))}
 for(let i=0,n=ri(3,6);i<n;i++){const x=rr(B[0],B[2]),y=rr(B[1],B[3]),w=rr(80,150);if(xDep(S.g,x,y)>w/2+30)xDec(K,'flowers',x,y,w,rr(50,90),R()*TAU)}
 xScat(K,S,B,'bench2',ri(1,3),110,130,26,30,{rot:1})}
// forme di casse (celle [colonna, riga]); maxRows: righe massime verso il centro del corridoio
const sn5=v=>Math.round(v/2)*2;
function xCrShape(K,maxRows){const F=[[[0,0],[1,0],[2,0],[3,0]],[[0,0],[1,0],[2,0],[0,1]],[[0,0],[1,0],[2,0],[1,1]],[[0,0],[1,0],[2,0],[0,1],[0,2]],[[0,0],[1,0],[1,1],[2,1]],[[0,0],[1,0],[0,1],[1,1]],
  [[0,0],[0,1],[1,1],[2,1],[2,0]],[[0,0],[1,0],[2,0],[3,0],[1,1]],[[0,0],[1,0],[2,0],[1,1],[1,2]],[[0,0],[1,0],[2,0],[0,1],[1,1]]].filter(f=>f.every(c=>c[1]<maxRows));
 const f=K.pick(F.length?F:[[[0,0],[1,0],[2,0]]]);return K.R()<.5?f:f.map(c=>[Math.max(...f.map(q=>q[0]))-c[0],c[1]])}   // a volte specchiata
// INSIEMI D'ARREDO: pezzi pensati insieme [tipo, u, v, larghezza, profondità, rotazione]; lo schienale di divani e poltrone sta in alto (−v), il davanti verso +v
const XSETS={
 lounge1:[['sofa',0,-88,140,48,0],['ctable',0,0,72,72,0],['armchair',-94,0,52,52,-Math.PI/2],['armchair',94,0,52,52,Math.PI/2]],   // divano, tavolino e due poltrone
 lounge2:[['sofa',12,-88,140,48,0],['sofa',-88,12,120,48,-Math.PI/2],['armchair',94,6,52,52,Math.PI/2],['ctable',6,4,72,72,0]],   // divano a L, poltrona e tavolino
 lounge3:[['sofa',0,-92,140,48,0],['sofa',0,92,140,48,Math.PI],['table',0,0,110,56,0]],   // due divani affacciati con tavolo basso
 lounge4:[['sofa',0,-52,120,44,0],['ctable',0,22,58,58,0]],   // divanetto con tavolino
 lounge5:[['armchair',-62,0,50,50,-Math.PI/2],['armchair',62,0,50,50,Math.PI/2],['ctable',0,0,56,56,0]],   // due poltrone e un tavolino
 dine0:[['table',0,0,150,66,0],['bench2',0,-54,140,24,0],['bench2',0,54,140,24,0]],
 dine:[['table',0,0,180,76,0],['bench2',0,-62,170,26,0],['bench2',0,62,170,26,0]],   // tavolo da mensa con due panche
 dine2:[['table',-102,0,180,76,0],['table',102,0,180,76,0],['bench2',-102,-62,170,26,0],['bench2',-102,62,170,26,0],['bench2',102,-62,170,26,0],['bench2',102,62,170,26,0]],
 desk1:[['desk',0,0,110,64,0],['chair',0,56,36,36,Math.PI],['pot',78,-14,40,40,0]],   // scrivania con sedia e pianta
 desk2:[['desk',0,-36,110,64,0],['desk',0,36,110,64,Math.PI],['chair',0,-92,36,36,0],['chair',0,92,36,36,Math.PI]],   // due scrivanie affacciate
 meet:[['table',0,0,170,84,0],['chair',-55,-66,34,34,0],['chair',0,-66,34,34,0],['chair',55,-66,34,34,0],['chair',-55,66,34,34,Math.PI],['chair',0,66,34,34,Math.PI],['chair',55,66,34,34,Math.PI],['chair',-110,0,34,34,-Math.PI/2],['chair',110,0,34,34,Math.PI/2]]};   // riunioni
const XRSET={uffici:['desk2','desk1','meet','desk2','desk1'],ufficio:['desk1'],mensa:['dine2','dine','dine0','dine0'],atrio:['lounge1','lounge2','lounge3','lounge4','lounge5'],olo:['lounge1','lounge2','lounge4','lounge5'],osservatorio:['lounge2','lounge3','lounge5'],
 alloggi:['lounge3','lounge4','lounge5'],cabina:['lounge4','lounge5'],infermeria:['meet'],sicurezza:['desk2'],comando:['meet','desk2'],lab:['meet']};
function xSet(K,S,x,y,a,set){const P=XSETS[set],ca=Math.cos(a),sa=Math.sin(a),W=P.map(q=>[q[0],x+q[1]*ca-q[2]*sa,y+q[1]*sa+q[2]*ca,q[3],q[4],a+q[5]]);
 for(const q of W)if(!xPut(K,S,q[0],q[1],q[2],q[3],q[4],q[5],{dry:1,gap:26,st:1}))return 0;   // tutto l'insieme o niente (le corsie restano larghe almeno 72 px)
 const v=K.ri(0,3);for(const q of W)xPut(K,S,q[0],q[1],q[2],q[3],q[4],q[5],{force:1,v});return 1}
// insiemi sparsi nella stanza: ognuno girato tutto insieme (dritto, a 90° o un po' storto), con le copie speculari della stanza; ord: tutti con lo stesso verso (file ordinate)
function xSets(K,S,B,list,n,ord){let c=0;const a0=(S.oa||0)+K.ri(0,3)*Math.PI/2;
 for(let t=0;t<n*30&&c<n;t++){const set=K.pick(list),x=K.rr(B[0],B[2]),y=K.rr(B[1],B[3]),a=ord?a0:(S.oa||0)+K.ri(0,3)*Math.PI/2+(K.R()<.35?K.rr(-.45,.45):0);
  if(!xSet(K,S,x,y,a,set))continue;c++;for(const f of S.symT||[]){const q=f(x,y,a);if(xSet(K,S,q[0],q[1],q[2],set))c++}}return c}
// insiemi in griglia (mense, uffici a open space): stesso verso, file allineate
function xSetGrid(K,S,B,set,gx,gy){const W=B[2]-B[0],H=B[3]-B[1],hor=W>=H,a=(S.oa||0)+(hor?0:Math.PI/2),L=hor?W:H,Sh=hor?H:W,nx=Math.max(1,Math.floor(L/gx)),ny=Math.max(1,Math.floor(Sh/gy));let c=0;
 for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){const u=(i+.5)*L/nx,v=(j+.5)*Sh/ny,x=hor?B[0]+u:B[0]+v,y=hor?B[1]+v:B[1]+u;for(let k=0;k<5;k++){const jx=k?K.rr(-50,50):0,jy=k?K.rr(-50,50):0;if(xSet(K,S,x+jx,y+jy,a,set)){c++;break}}}return c}   // se non c'entra, prova a spostarlo di poco
// colonnato: due file di colonne parallele al lato lungo (navata e corridoi laterali), passo regolare
function xColonnade(K,S,B,kind,sz){const{rr}=K,W=B[2]-B[0],H=B[3]-B[1],hor=W>=H,L=hor?W:H,Sh=hor?H:W,off=Sh*rr(.24,.32),sp=rr(230,300),n=Math.floor((L-60)/sp),t0=(L-(n-1)*sp)/2;let c=0;
 for(let i=0;i<n;i++)for(const sd of[-1,1]){const t=(hor?B[0]:B[1])+t0+i*sp,x=hor?t:(B[0]+B[2])/2+sd*off,y=hor?(B[1]+B[3])/2+sd*off:t;if(xPut(K,S,kind,x,y,sz,sz,0,{nl:1,nx:1,gap:20}))c++}return c}
// gruppetti di oggetti attorno a un punto, girati a caso (salotto, cumulo di casse, postazione, aiuola...): rompono la regolarità delle stanze
const XCL={2:['pile','garden','pile'],3:['pile','work','ammo','drones'],4:['pile','tanks','work','lab']};
function xCluster(K,S,B,t){const{R,rr,ri,pick}=K;
 for(let tr=0;tr<8;tr++){const x=rr(B[0],B[2]),y=rr(B[1],B[3]),a=(S.oa||0)+ri(0,3)*Math.PI/2,ca=Math.cos(a),sa=Math.sin(a);let n=0;const done=[];
  const put=(k,u,v,w,h,da)=>{const X=x+u*ca-v*sa,Y=y+u*sa+v*ca,A=a+(da||0);if(xPut(K,S,k,X,Y,w,h,A,{gap:8})){n++;done.push([k,X,Y,w,h,A])}return n};
  switch(t){
   case'lounge':if(!put('ctable',0,0,84,84))continue;for(let i=0,m=ri(2,4);i<m;i++){const b=i*TAU/4+rr(-.25,.25);put(R()<.7?'sofa':'pot',Math.cos(b)*96,Math.sin(b)*96,110,44,b+Math.PI/2)}break;
   case'pile':if(!put(pick(['crates','cont','crates']),0,0,rr(100,140),rr(70,100)))continue;for(let i=0,m=ri(2,5);i<m;i++){const b=R()*TAU,d=rr(80,130);put(pick(['crate','crate','barrels']),Math.cos(b)*d,Math.sin(b)*d,rr(40,64),rr(40,64),R()*TAU)}break;
   case'work':if(!put('desk',0,0,110,64))continue;put('console',0,-62,96,36);put(pick(['crate','bin','pot']),78,10,44,44,R());put('locker',-90,-40,80,30,Math.PI/2);break;
   case'garden':if(!put('planter',0,0,130,60))continue;put('planter',0,90,130,60);put('pot',-95,45,48,48);put('bench2',100,45,110,28,Math.PI/2);break;
   case'ammo':if(!put('ammo',0,0,64,42))continue;put('ammo',0,50,64,42,rr(-.2,.2));put('ammo',72,22,64,42,rr(-.4,.4));put('crates',-90,20,100,70);break;
   case'drones':if(!put('drone',0,0,60,60))continue;put('drone',80,20,56,56);put('crate',30,-70,50,50,R());put('fuelc',-80,40,120,56,Math.PI/2);break;
   case'tanks':if(!put('tank',0,0,96,96))continue;put('tank',105,0,80,80);put('pump',50,90,80,80);put('valve',-80,60,48,48);break;
   case'lab':if(!put('sample',0,0,64,64))continue;put('sample',72,10,56,56);put('pod',30,-72,60,60);put('compressor',-80,40,96,66,R());break}
  if(n>=2){for(const f of S.symT||[])for(const d of done){const q=f(d[1],d[2],d[5]);xPut(K,S,d[0],q[0],q[1],d[3],d[4],q[2],{gap:8})}return n}}return 0}   // il gruppo si ripete nelle copie speculari
// una "cabina" (edificio basso: ufficio, sala controllo, magazzino chiuso...) nel riquadro: prova diverse posizioni
function xCabin(K,S,B,kind,w0,w1,opt){const{rr}=K;for(let t=0;t<14;t++){const k=1-t*.04,w=rr(w0,w1)*k,h=rr(w0,w1)*k,x=rr(B[0]+w/2,Math.max(B[0]+w/2,B[2]-w/2)),y=rr(B[1]+h/2,Math.max(B[1]+h/2,B[3]-h/2));
 const o=xPut(K,S,kind,t<3?(B[0]+B[2])/2:x,t<3?(B[1]+B[3])/2:y,w,h,0,opt);if(o)return o}return null}
// edificio basso vicino a un angolo o a un lato del riquadro (il centro resta alla ricetta della stanza)
function xCabinSide(K,S,B,kind,w0,w1,opt){const{rr,R}=K;for(let t=0;t<12;t++){const k=1-t*.03,w=rr(w0,w1)*k,h=rr(w0,w1)*k,q=K.ri(0,7),fx=[0,1,1,0,.5,1,.5,0][q],fy=[0,0,1,1,0,.5,1,.5][q],
  x=B[0]+w/2+(B[2]-B[0]-w)*fx,y=B[1]+h/2+(B[3]-B[1]-h)*fy;if(B[2]-B[0]<w||B[3]-B[1]<h)return null;const o=xPut(K,S,kind,x,y,w,h,0,opt);if(o)return o}return null}
const xLight=(K,x,y,r,c,a)=>K.m.flat.push({k:'xl',x,y,r,c,al:a||.16});
const xArea=g=>{let a=0;const p=g.p;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];a+=p[i][0]*q[1]-q[0]*p[i][1]}return Math.abs(a)/2};
const xDec=(K,t,x,y,w,h,a,o)=>K.m.flat.push(Object.assign({k:'xd',t,x,y,w,h,a:a||0,s:K.ri(1,9999)},o||{}));

// ===== ARREDO DELLA MEGASTRUTTURA: ostacoli e decorazioni per tipo di stanza, combinati in gruppi =====
// MISURE: il Grunt ingombra circa 27 px (raggio 13,5), come un omino: una sedia ~22, una scrivania ~62×34, un divano ~80×30, un letto ~40×80.
// Per ogni tipo di stanza: o = 5 ostacoli [tipo, larghezza, profondità] · d = 5 decorazioni piatte (dipinte nello sfondo) [disegno, larghezza, profondità]
// g = gruppi: pezzi [rif, u, v, rotazione, larghezza?, profondità?] con rif 'o0'..'o4' (ostacolo) o 'd0'..'d4' (decorazione); il gruppo gira tutto insieme
// a multipli di 45° attorno al suo centro (u, v = posizione relativa). Davanti di sedie, divani e poltrone verso +v (schienale verso −v).
// w = ostacoli (indici in o) che vanno anche lungo i muri
const XH=Math.PI/2,XPI=Math.PI;
const XM={
 atrio:{o:[['sofa',80,30],['armchair',32,32],['planter',70,30],['reception',120,36],['fountain',110,110]],
  d:[['rug',150,110],['ctablef',46,28],['mosaic',230,230],['logo',150,150],['flowers',90,50]],
  g:[[['d0',0,0],['o0',0,-46,0],['o1',-64,4,-XH],['o1',64,4,XH],['d1',0,4]],                                   // salotto: divano, due poltrone, tavolino e tappeto
   [['o3',0,0,0],['d3',0,96],['o2',-104,0,XH],['o2',104,0,XH]],                                               // accoglienza: bancone, logo a terra, fioriere ai lati
   [['d2',0,0],['o4',0,0],['o2',0,-118,0],['o2',0,118,0],['o2',-118,0,XH],['o2',118,0,XH]],                  // fontana su mosaico, quattro fioriere
   [['d4',0,0],['o2',0,-44,0],['o0',0,44,XPI]]],                                                               // aiuola con fioriera e divano affacciato
  f:[['planter',70,30],['pot',30,30],['sofa',80,30],['armchair',32,32],['vend',40,30]],
  w:[0,2]},
 uffici:{o:[['desk',62,34],['chair',22,22],['filecab',34,26],['copier',44,36],['divider',80,8]],
  d:[['chairmat',40,40],['papers',30,22],['cables',70,18],['carpettiles',220,150],['rug',120,80]],
  g:[[['o0',0,0,0,0,0,{kb:1}],['d0',0,32],['o1',0,32,XPI],['d2',0,-12],['d1',12,-2]],                       // postazione
   [['d3',0,0],['o0',-33,-20,0,0,0,{kb:-1}],['o0',33,-20,0,0,0,{kb:-1}],['o0',-33,20,XPI,0,0,{kb:-1}],['o0',33,20,XPI,0,0,{kb:-1}],['o4',0,0,0,140,8],['o1',-33,-52,0],['o1',33,-52,0],['o1',-33,52,XPI],['o1',33,52,XPI]],   // isola da quattro con divisorio
   [['o2',-40,0,0],['o2',0,0,0],['o2',40,0,0],['d1',0,38]],                                                   // archivio
   [['d4',0,0],['o0',-34,0,0,62,40,{kb:2}],['o0',34,0,0,62,40,{kb:2}],['o1',-34,-38,0],['o1',34,-38,0],['o1',-34,38,XPI],['o1',34,38,XPI],['d1',0,0]],   // tavolo riunioni (due scrivanie unite)
   [['o3',0,0,0],['o2',52,0,0],['d1',-10,32]]],                                                                // angolo fotocopie
  f:[['filecab',34,26],['copier',44,36],['books',90,26],['pot',26,26],['cooler',30,30]],
  w:[2,3]},
 ufficio:{o:[['desk',70,36],['chair',22,22],['armchair',30,30],['books',90,26],['filecab',34,26]],
  d:[['rug',130,90],['chairmat',40,40],['papers',30,22],['cables',60,18],['logo',70,70]],
  g:[[['d0',0,22],['o0',0,0,0,0,0,{kb:-1}],['d1',0,-34],['o1',0,-34,0],['o2',-26,58,XPI],['o2',26,58,XPI],['d2',12,0]],   // scrivania direzionale con due poltroncine per gli ospiti
   [['o3',0,0,0],['o4',64,0,0],['d2',0,34]]],                                                                  // libreria e schedario
  f:[['books',90,26],['filecab',34,26],['pot',26,26],['armchair',30,30]],
  w:[3,4]},
 mensa:{o:[['table',130,40],['bench2',120,18],['counter',130,38],['cooler',40,40],['cart',40,26]],
  d:[['tray',24,16],['placemat',28,18],['queue',170,30],['mat',90,46],['stain',50,50]],
  g:[[['o0',0,0,0],['o1',0,-36,0],['o1',0,36,0],['d1',-40,-8],['d1',0,-8],['d1',40,8],['d0',-40,-8],['d0',40,8]],   // tavolata con due panche, vassoi e tovagliette
   [['o2',0,0,0],['d2',0,52],['o3',92,0,0],['d3',0,96]],                                                      // self-service: bancone, fila, frigorifero
   [['o4',0,0,0],['o4',0,34,0],['d4',36,24]],                                                                  // carrelli dei vassoi
   [['o0',0,-60,0],['o1',0,-96,0],['o1',0,-24,0],['o0',0,60,0],['o1',0,24,0],['o1',0,96,0],['d0',-30,-60],['d0',30,60]]],   // due tavolate in fila
  f:[['cooler',40,40],['cart',40,26],['vend',40,30],['bin',18,18],['crates',50,50]],
  w:[2,3]},
 server:{o:[['server',34,62],['ups',46,38],['cooler',46,46],['console',64,28],['fireext',14,14]],
  d:[['coldaisle',60,200],['cables',120,18],['tilehole',40,40],['vent',40,40],['hazmark',90,18]],
  g:[[['d0',0,0,XH],['o0',-68,-44,0],['o0',-34,-44,0],['o0',0,-44,0],['o0',34,-44,0],['o0',68,-44,0],['o0',-68,44,XPI],['o0',-34,44,XPI],['o0',0,44,XPI],['o0',34,44,XPI],['o0',68,44,XPI],['d1',0,-88]],   // due file di armadi con corsia fredda
   [['o3',0,0,0],['o4',44,-6],['d1',0,-22],['d2',0,36]],                                                       // postazione di controllo
   [['o2',0,0,0],['o2',58,0,0],['d3',29,44],['o1',-54,0,0],['d4',0,-38]]],                                    // raffreddamento e gruppo di continuità
  f:[['server',34,62],['ups',46,38],['cooler',46,46],['crate',36,36],['fireext',14,14]],
  w:[1,2]},
 server2:{o:[['server',34,62],['ups',44,36],['cooler',44,44],['console',60,26],['fireext',14,14]],
  d:[['cables',90,18],['tilehole',40,40],['vent',40,40],['coldaisle',56,130],['hazmark',80,18]],
  g:[[['d3',0,0,XH],['o0',-34,-40,0],['o0',0,-40,0],['o0',34,-40,0],['o0',-34,40,XPI],['o0',0,40,XPI],['o0',34,40,XPI]],
   [['o3',0,0,0],['o4',40,-6],['d0',0,-22],['d1',0,34]],[['o2',0,0,0],['o1',52,0,0],['d2',0,40],['d4',26,-34]]],
  f:[['server',34,62],['ups',44,36],['cooler',44,44],['crate',34,34]],
  w:[1,2]},
 magazzino:{o:[['shelf',96,28],['crates',50,50],['pallet',46,46],['forklift',34,58],['barrels',44,44]],
  d:[['palletf',46,46],['numbers',60,40],['forklane',40,260],['arrows',60,40],['stain',50,50]],
  g:[[['o0',0,-17,0],['o0',0,17,XPI],['d1',72,0,XH]],                                                         // scaffali schiena contro schiena
   [['o2',-26,-26],['o2',26,-26],['o1',-26,26],['d0',26,26],['d4',0,0,0,70,70]],                              // deposito su pallet
   [['d2',0,0],['o3',0,-20,0],['o2',0,-76,0],['d3',0,90]],                                                     // muletto con carico e corsia
   [['o4',0,0],['o4',46,4],['o1',-50,-6],['d4',20,40]]],                                                       // fusti e casse
  f:[['cont',120,50],['crates',56,56],['pallet',46,46],['barrels',44,44],['crate',36,36],['shelf',96,28]],
  w:[0,4]},
 lab:{o:[['bench',100,34],['stool',18,18],['hood',70,34],['analyzer',40,40],['sample',34,34]],
  d:[['hazmark',80,18],['spill',50,40],['papers',30,22],['biohaz',60,60],['hatch',60,60]],
  g:[[['o0',0,0,0],['o1',-30,30],['o1',30,30],['d2',20,-4]],                                                   // bancone con sgabelli
   [['o2',0,0,0],['d0',0,30,0],['o3',58,0,0],['o1',58,36]],                                                    // cappa aspirante e analizzatore
   [['d3',0,0],['o4',-24,-6],['o4',24,-6],['o4',0,26],['d1',44,26]],                                          // campioni su simbolo di pericolo
   [['o0',0,-26,0],['o0',0,26,XPI],['o1',-36,-56],['o1',36,56],['d4',80,0]]],                                 // doppio bancone
  f:[['sample',34,34],['analyzer',40,40],['tank',40,40],['locker',50,24],['crate',34,34]],
  w:[2,3]},
 macchine:{o:[['gen',110,70],['turbine',100,100],['pump',60,60],['console',64,28],['toolcart',40,26]],
  d:[['pipe',200,36],['oil',60,40],['hazmark',110,18],['drain',48,48],['vent',56,56]],
  g:[[['o0',0,0,0],['o3',0,56,XPI],['d2',0,-46,0],['d1',56,42]],                                             // generatore con quadro comandi
   [['d0',0,0],['o2',-74,0],['o2',74,0],['d3',0,44]],                                                          // coppia di pompe collegate
   [['o1',0,0],['d2',0,-66,0],['d2',0,66,0]],                                                                  // turbina fra le strisce di pericolo
   [['o4',0,0,0],['d1',18,30],['d4',-40,-4]]],                                                                 // carrello degli attrezzi
  f:[['pump',60,60],['gen',100,64],['compressor',66,46],['barrels',44,44],['toolcart',40,26]],
  w:[3,4]},
 serra:{o:[['tree',42,42],['rock',48,48],['hydro',120,40],['bench2',100,18],['tank',40,40]],
  d:[['flowers',90,50],['path',170,40],['puddle',50,40],['soil',130,60],['leaves',70,70]],
  g:[[['o0',0,0],['o0',52,24],['o0',-20,50],['o1',30,-30],['d4',16,22]],                                     // boschetto
   [['d3',0,0,0,130,110],['o2',0,-30,0],['o2',0,30,0],['o4',80,0]],                                          // orto idroponico con serbatoio
   [['d1',0,0],['o3',0,-36,0],['d0',-60,36],['d0',60,36]],                                                    // sosta: panchina sul sentiero fra le aiuole
   [['o0',0,0],['o1',-44,12],['o1',38,-30],['d4',0,0],['d2',46,34]],                                        // albero fra le rocce
   [['d0',0,0,0,200,120],['o3',0,-70,0],['d0',90,50,0,120,70]]],                                            // prato fiorito con panchina
  f:[['planter',110,44],['tree',42,42],['rock',48,48],['tank',40,40],['hydro',120,40]],
  w:[]},
 olo:{o:[['holo',110,110],['arcade',34,34],['sofa',80,30],['armchair',32,32],['vend',40,30]],
  d:[['holoring',220,220],['rug',140,100],['logo',120,120],['cables',60,18],['ctablef',44,28]],
  g:[[['d0',0,0],['o0',0,0],['o3',0,-112,0],['o3',0,112,XPI],['o3',-112,0,-XH],['o3',112,0,XH]],              // proiettore con poltrone attorno
   [['o1',-40,0,0],['o1',0,0,0],['o1',40,0,0],['d1',0,40,0,140,60]],                                         // fila di giochi
   [['d1',0,0],['o2',0,-44,0],['o3',-62,4,-XH],['d4',0,4]],                                                   // salottino
   [['o4',-24,0,0],['o4',24,0,0],['d3',0,24]]],                                                                // distributori
  f:[['arcade',34,34],['vend',40,30],['armchair',32,32],['pot',30,30]],
  w:[1,4]},
 sicurezza:{o:[['barrier',90,24],['rack',90,28],['desk',62,34],['locker',50,24],['scanner',64,40]],
  d:[['hazmark',100,18],['stopline',120,16],['arrows',60,40],['numbers',60,40],['chairmat',40,40]],
  g:[[['o4',0,0,0],['o0',-84,0,0],['o0',84,0,0],['d1',0,-38,0],['d2',0,54]],                               // varco di controllo con scanner
   [['o2',0,0,0,0,0,{kb:1}],['d4',0,32],['o3',58,-4,0]],                                                       // postazione di guardia
   [['o1',0,0,0],['o3',-72,0,0],['d3',0,34]],                                                                  // rastrelliera e armadietti
   [['o0',0,0,XPI/4],['o0',60,60,XPI/4],['d0',30,30,XPI/4]]],                                                // barriere a zig-zag
  f:[['locker',50,24],['rack',90,28],['barrier',90,24],['crates',50,50],['ammo',56,38]],
  w:[1,3]},
 ripostiglio:{o:[['shelf',90,26],['crates',46,46],['barrels',40,40],['bucket',18,18],['cart',40,26]],
  d:[['stain',50,50],['puddle',50,40],['vent',40,40],['boxesf',50,40],['numbers',50,34]],
  g:[[['o0',0,0,0],['d3',0,30]],[['o4',0,0,0],['o3',30,2],['d1',0,32]],[['o1',0,0],['o2',44,8],['d0',-30,30]]],
  f:[['cont',110,50],['crates',60,60],['crates',50,50],['barrels',44,44],['crate',36,36],['shelf',90,26]],
  w:[0]},
 bagni:{o:[['stall',44,50],['sink',50,28],['urinal',22,18],['bin',18,18],['dryer',22,12]],
  d:[['drain',48,48],['puddle',50,40],['tilesf',130,130],['mat',60,30],['wetsign',30,30]],
  g:[[['o1',-28,0,0],['o1',28,0,0],['o3',66,0],['d3',0,30],['d1',0,52]],                                     // lavabi
   [['o0',-46,0,0],['o0',0,0,0],['o0',46,0,0],['d0',0,56]],                                                    // fila di box
   [['o2',-26,0,0],['o2',0,0,0],['o2',26,0,0],['d4',0,40]],                                                    // orinatoi
   [['d2',0,0],['o4',0,-50,0],['d0',0,0]]],                                                                    // piastrelle con scarico
  f:[['bin',18,18],['crate',30,30],['locker',50,24]],
  w:[0,1,4]},
 reattore:{o:[['reactor',0,0],['valve',36,36],['turbine',90,90],['console',64,28],['tank',60,60]],
  d:[['radiation',120,120],['pipe',200,36],['hazmark',110,18],['vent',50,50],['conduit',220,40]],
  g:[[['o3',0,0,0],['d2',0,32,0]],                                                                            // quadro di controllo
   [['o4',-36,0],['o4',36,0],['o1',0,46],['d0',0,-70,0,90,90]],                                              // serbatoi del refrigerante
   [['o2',0,0],['d1',0,70,0]],[['o1',0,0],['o1',44,0],['d3',22,40]]],
  f:[['tank',60,60],['valve',36,36],['gen',110,70],['compressor',66,46],['barrels',44,44]],
  w:[3]},
 comando:{o:[['cabin',0,0],['console',64,28],['bigscreen',120,16],['holotable',100,100],['chair',22,22]],
  d:[['mapfloor',170,120],['cables',70,18],['numbers',60,40],['arrows',60,40],['chairmat',40,40]],
  g:[[['d0',0,0],['o3',0,0],['o4',0,-70,0],['o4',0,70,XPI],['o4',-70,0,-XH],['o4',70,0,XH]],               // plancia attorno al tavolo olografico
   [['o1',0,0,0],['d4',0,32],['o4',0,32,XPI],['d1',0,-22]],                                                  // postazione
   [['o2',0,0,0],['o1',-40,50,XPI],['o1',40,50,XPI],['o4',-40,84,XPI],['o4',40,84,XPI]]],                    // schermo con due postazioni
  f:[['rack',90,28],['locker',50,24],['console',64,28],['books',90,26]],
  w:[1,2]},
 baia:{o:[['cont',120,50],['crates',50,50],['forklift',34,58],['fuelc',90,40],['cargo',60,60]],
  d:[['hazmark',140,18],['arrows',60,40],['numbers',60,40],['tires',160,60],['palletf',46,46]],
  g:[[['o0',0,0,0],['o1',-36,52],['o1',36,52],['d1',0,-56]],[['o2',0,0,0],['d3',0,40],['o4',0,-70]],
   [['o3',0,0,0],['o3',0,46,0],['d0',0,-34,0]],[['o4',0,0],['o4',64,0],['d4',32,48]]],
  f:[['cont',120,50],['crates',56,56],['cargo',60,60],['fuelc',90,40],['barrels',44,44]],
  w:[0,3]},
 hangar:{o:[['shuttle',180,110],['crates',50,50],['barrels',44,44],['gen',100,64],['toolcart',40,26]],
  d:[['pad',220,220],['hazmark',160,18],['arrows',60,40],['oil',70,50],['tires',160,60]],
  g:[[['o0',0,0,0],['o4',124,24,XH],['o4',-120,-30,-XH],['d3',40,74],['d1',0,-82,0,220,18],['o1',-60,96],['o2',0,96]],   // nave in riparazione: carrelli degli attrezzi, ricambi, olio
   [['o1',-27,-27],['o1',27,-27],['o1',-27,27],['o1',27,27],['o2',80,0],['d2',0,-70]],                       // catasta di casse con un fusto
   [['o3',0,0,0],['o4',0,52,0],['d3',50,40],['d1',0,-48,0,120,18]],                                           // macchinario con carrello
   [['o2',0,0],['o2',46,0],['o2',23,40],['o2',-23,40],['d1',12,-40,0,110,18]],                                // fusti
   [['d4',0,0],['d0',0,0,0,180,180],['o4',110,0,XH]]],                                                        // piazzola con segni di pneumatici
  f:[['crates',56,56],['barrels',44,44],['cont',120,50],['fuelc',90,40],['mechbay',90,90],['toolcart',40,26],['crate',36,36],['gen',100,64]],
  w:[1,3]},
 armeria:{o:[['rack',90,28],['ammo',56,38],['locker',50,24],['bench',100,34],['crates',50,50]],
  d:[['hazmark',100,18],['numbers',60,40],['mat',90,46],['oil',50,36],['stopline',100,16]],
  g:[[['o0',0,-18,0],['o0',0,18,XPI],['d1',70,0,XH]],                                                        // rastrelliere schiena contro schiena
   [['o1',-30,0,0],['o1',30,0,0],['o1',0,-42,0],['d0',0,40,0]],                                              // casse di munizioni
   [['o3',0,0,0],['d2',0,36],['o2',64,-4,0],['d3',-30,30]],                                                  // banco di montaggio delle armi
   [['o4',-27,0],['o4',27,0],['o1',0,46,0],['d4',0,-44]]],                                                   // scorte
  f:[['rack',90,28],['locker',50,24],['ammo',56,38],['crates',56,56],['crate',36,36]],
  w:[0,2]}};
XM.dock=XM.hangar;
// ===== ARREDO DELL'ASTRONAVE (stesso schema di XM: o = 5 ostacoli, d = 5 decorazioni, g = gruppi, f = riempimento, w = lungo i muri) =====
// ostacoli nuovi dell'astronave: navcon (consolle di navigazione curva), captchair (poltrona del comandante), synth (sintetizzatore di cibo),
// maglock (carico bloccato da morse magnetiche), plasmac (bobina al plasma), lifepod (capsula di salvataggio)
// decorazioni nuove: spacewin (ampia finestra sullo spazio, senza telaio in mezzo), starmap (carta stellare), airlock (portello stagno nel pavimento),
// thrust (bruciatura dei propulsori), medcross (croce medica), hullplate (piastra di rinforzo), gravring (anello di gravità artificiale)
const XM3={
 hangar:{o:[['shuttle',180,110],['fuelc',90,40],['drone',36,36],['toolcart',40,26],['maglock',70,50]],
  d:[['pad',220,220],['hazmark',160,18],['thrust',150,150],['airlock',130,130],['oil',70,50]],
  g:[[['o0',0,0,0],['o3',124,24,XH],['o1',-130,0,XH],['d2',-40,0],['d1',0,-82,0,220,18]],                       // navetta in manutenzione: carrello, celle di carburante, bruciatura dei propulsori
   [['o4',-40,0,0],['o4',40,0,0],['o2',0,52],['d1',0,-48,0,140,18]],                                              // carico in attesa con un drone di servizio
   [['d3',0,0],['o2',-84,0],['o2',84,0],['d1',0,84,0,120,18]],                                                    // portello stagno con due droni
   [['o1',0,-26,0],['o1',0,26,0],['o3',70,0,XH],['d4',-60,30]]],                                                 // rifornimento
  f:[['maglock',70,50],['fuelc',90,40],['crates',56,56],['toolcart',40,26],['drone',36,36],['barrels',44,44]],
  w:[1,3]},
 baia:{o:[['cont',120,50],['maglock',70,50],['cargo',60,60],['forklift',34,58],['crates',50,50]],
  d:[['airlock',150,150],['hazmark',140,18],['numbers',60,40],['arrows',60,40],['palletf',46,46]],
  g:[[['o0',0,0,0],['o1',-36,52],['o1',36,52],['d2',0,-56]],[['o3',0,0,0],['d3',0,58],['o2',0,-70]],
   [['o1',0,0,0],['o1',0,56,0],['d4',60,0]],[['o4',0,0],['o4',60,0],['d1',30,48,0,140,18]]],
  f:[['cont',120,50],['maglock',70,50],['cargo',60,60],['crates',56,56]],
  w:[0,1]},
 stiva:{o:[['maglock',70,50],['cont',120,50],['cargo',60,60],['crates',50,50],['mechbay',90,90]],
  d:[['palletf',46,46],['numbers',60,40],['hullplate',90,90],['arrows',60,40],['forklane',40,260]],
  g:[[['o1',0,-28,0],['o1',0,28,0],['d1',84,0,XH]],                                                              // container in coppia
   [['o0',-40,-30,0],['o0',40,-30,0],['o0',-40,30,0],['o0',40,30,0],['d2',0,0,0,140,120]],                       // blocco di carichi agganciati sulla piastra
   [['d4',0,0],['o2',0,-90],['o2',0,90],['d3',30,0,XH]],                                                         // corsia di carico
   [['o4',0,0,0],['o3',72,0],['d0',-70,0]]],                                                                     // esoscheletro da carico
  f:[['maglock',70,50],['cont',120,50],['cargo',60,60],['crates',56,56],['crate',36,36],['barrels',44,44]],
  w:[0,1]},
 alloggi:{o:[['bunk',40,80],['locker',50,24],['ctable',46,46],['chair',22,22],['synth',40,30]],
  d:[['rug',120,80],['spacewin',260,150],['papers',30,22],['mat',60,30],['stain',50,50]],
  g:[[['o0',-30,0,0],['o0',30,0,0],['o1',0,-58,0],['d3',0,58]],                                                  // due cuccette e un armadietto
   [['d0',0,0],['o2',0,0],['o3',-40,0,-XH],['o3',40,0,XH],['d2',0,0]],                                           // tavolino comune
   [['d1',0,0],['o3',-60,96,XPI],['o3',0,96,XPI],['o3',60,96,XPI]],                                              // oblò panoramico con le sedie davanti
   [['o0',-44,0,0],['o0',0,0,0],['o0',44,0,0],['o4',0,-64,0]]],                                                   // fila di cuccette
  f:[['locker',50,24],['bunk',40,80],['synth',40,30],['pot',24,24]],
  w:[1,4]},
 cabina:{o:[['bunk',40,80],['locker',50,24],['desk',62,34],['chair',22,22],['pot',24,24]],
  d:[['rug',100,70],['spacewin',180,110],['papers',30,22],['mat',50,26],['chairmat',40,40]],
  g:[[['o0',0,0,0],['o1',40,-20,XH],['d3',-40,0,XH]],                                                            // cuccetta e armadietto
   [['o2',0,0,0,0,0,{kb:1}],['d4',0,32],['o3',0,32,XPI],['d2',10,-2]],                                            // scrivania
   [['d1',0,0],['o4',-80,60],['d0',0,90,0,90,50]]],                                                               // finestrella con una pianta
  f:[['locker',50,24],['pot',24,24],['crate',30,30]],
  w:[1]},
 mensa:{o:[['table',130,40],['bench2',120,18],['synth',60,36],['counter',130,38],['cart',40,26]],
  d:[['tray',24,16],['placemat',28,18],['queue',170,30],['spacewin',300,170],['stain',50,50]],
  g:[[['o0',0,0,0],['o1',0,-36,0],['o1',0,36,0],['d1',-40,-8],['d1',0,-8],['d1',40,8],['d0',-40,-8],['d0',40,8]],   // tavolata
   [['o3',0,0,0],['d2',0,52],['o2',100,0,0],['o2',-100,0,0]],                                                    // bancone con i sintetizzatori
   [['d3',0,0],['o0',0,130,0],['o1',0,96,0],['o1',0,164,0]],                                                     // tavolata davanti alla vetrata
   [['o4',0,0,0],['o4',0,34,0],['d4',36,24]]],                                                                    // carrelli dei vassoi
  f:[['synth',40,30],['cart',40,26],['cooler',40,40],['bin',18,18],['crates',50,50]],
  w:[2,3]},
 infermeria:{o:[['medbed',44,90],['cryo',50,100],['analyzer',40,40],['console',64,28],['cart',40,26]],
  d:[['medcross',110,110],['tilesf',130,130],['spill',50,40],['biohaz',60,60],['drain',48,48]],
  g:[[['o0',-36,0,0],['o0',36,0,0],['o4',0,-60,0],['d0',0,0,0,80,80]],                                           // due lettini e il carrello
   [['o1',-34,0,0],['o1',34,0,0],['o3',0,74,XPI],['d1',0,0,0,150,120]],                                         // vasche criogeniche con la consolle
   [['o2',0,0],['o3',60,0,XH],['d3',0,50]],                                                                       // analisi
   [['d0',0,0],['o0',0,0,XH],['o2',-70,0],['d4',70,40]]],                                                         // lettino sulla croce medica
  f:[['medbed',44,90],['analyzer',40,40],['cart',40,26],['locker',50,24],['cryo',50,100]],
  w:[1,3]},
 armeria:{o:[['rack',90,28],['ammo',56,38],['torp',140,48],['bench',100,34],['suits',110,40]],
  d:[['hazmark',100,18],['numbers',60,40],['mat',90,46],['stopline',100,16],['hullplate',90,90]],
  g:[[['o0',0,-18,0],['o0',0,18,XPI],['d1',70,0,XH]],                                                            // rastrelliere schiena contro schiena
   [['o1',-30,0,0],['o1',30,0,0],['o1',0,-42,0],['d4',0,10,0,110,110]],                                         // munizioni sulla piastra
   [['o3',0,0,0],['d2',0,36],['o2',0,-50,0],['d3',0,70]],                                                         // banco di montaggio e siluri
   [['o4',0,0,0],['d0',0,32,0,120,18]]],                                                                           // tute da combattimento
  f:[['rack',90,28],['ammo',56,38],['torp',140,48],['crates',56,56],['locker',50,24]],
  w:[0,4]},
 serra:{o:[['hydro',120,40],['tree',42,42],['tank',40,40],['planter',70,30],['bench2',100,18]],
  d:[['soil',130,60],['flowers',90,50],['path',170,40],['puddle',50,40],['leaves',70,70]],
  g:[[['d0',0,0,0,140,110],['o0',0,-30,0],['o0',0,30,0],['o2',84,0]],                                            // vasche idroponiche con serbatoio
   [['o1',0,0],['o1',52,24],['o1',-20,50],['d4',16,22]],                                                         // boschetto
   [['d2',0,0],['o4',0,-36,0],['d1',-60,36],['d1',60,36]],                                                        // sosta sul sentiero
   [['o3',-40,0,XH],['o3',40,0,XH],['d1',0,0,0,60,90],['d3',0,60]]],                                             // fioriere
  f:[['hydro',120,40],['planter',70,30],['tree',42,42],['tank',40,40]],
  w:[]},
 lab:{o:[['bench',100,34],['stool',18,18],['sample',34,34],['analyzer',40,40],['plasmac',50,50]],
  d:[['biohaz',60,60],['spill',50,40],['starmap',140,140],['hazmark',80,18],['papers',30,22]],
  g:[[['o0',0,0,0],['o1',-30,30],['o1',30,30],['d4',20,-4]],                                                     // bancone con sgabelli
   [['d0',0,0],['o2',-24,-6],['o2',24,-6],['o2',0,26],['d1',44,26]],                                             // campioni
   [['d2',0,0],['o4',0,0],['o3',-86,0],['o3',86,0]],                                                              // bobina al plasma sulla carta stellare
   [['o0',0,-26,0],['o0',0,26,XPI],['o1',-36,-56],['o1',36,56],['d3',80,0,XH]]],                                 // doppio bancone
  f:[['sample',34,34],['analyzer',40,40],['tank',40,40],['locker',50,24],['plasmac',50,50]],
  w:[3]},
 macchine:{o:[['gen',110,70],['plasmac',60,60],['compressor',66,46],['console',64,28],['toolcart',40,26]],
  d:[['pipe',200,36],['oil',60,40],['hazmark',110,18],['vent',56,56],['conduit',220,40]],
  g:[[['o0',0,0,0],['o3',0,56,XPI],['d2',0,-46,0],['d1',56,42]],                                                 // generatore con quadro comandi
   [['d0',0,0],['o1',-74,0],['o1',74,0],['d3',0,44]],                                                             // bobine collegate
   [['o2',0,0,0],['o2',0,52,0],['d4',0,0,XH]],                                                                    // compressori sul condotto
   [['o4',0,0,0],['d1',18,30],['d3',-40,-4]]],                                                                    // carrello degli attrezzi
  f:[['plasmac',60,60],['gen',100,64],['compressor',66,46],['barrels',44,44],['toolcart',40,26]],
  w:[3,4]},
 olo:{o:[['holo',110,110],['arcade',34,34],['sofa',80,30],['armchair',32,32],['synth',40,30]],
  d:[['holoring',220,220],['rug',140,100],['spacewin',300,170],['starmap',140,140],['ctablef',44,28]],
  g:[[['d0',0,0],['o0',0,0],['o3',0,-112,0],['o3',0,112,XPI],['o3',-112,0,-XH],['o3',112,0,XH]],               // proiettore con poltrone attorno
   [['o1',-40,0,0],['o1',0,0,0],['o1',40,0,0],['d1',0,40,0,140,60]],                                            // fila di giochi
   [['d2',0,0],['o2',0,120,XPI],['o3',-74,110,XPI],['o3',74,110,XPI],['d4',0,80]],                              // salottino davanti alla vetrata
   [['d3',0,0],['o4',-30,0,0],['o4',30,0,0]]],                                                                     // sintetizzatori sulla carta stellare
  f:[['arcade',34,34],['synth',40,30],['armchair',32,32],['pot',30,30]],
  w:[1,4]},
 reattore:{o:[['reactor',0,0],['plasmac',60,60],['turbine',90,90],['console',64,28],['tank',60,60]],
  d:[['radiation',120,120],['conduit',220,40],['hazmark',110,18],['vent',50,50],['gravring',160,160]],
  g:[[['o3',0,0,0],['d2',0,32,0]],                                                                                // quadro di controllo
   [['o4',-36,0],['o4',36,0],['o1',0,46],['d0',0,-70,0,90,90]],                                                  // serbatoi del refrigerante
   [['o2',0,0],['d4',0,0]],[['o1',0,0],['o1',64,0],['d1',32,44]]],
  f:[['tank',60,60],['plasmac',60,60],['gen',110,70],['compressor',66,46],['barrels',44,44]],
  w:[3]},
 comando:{o:[['cabin',0,0],['navcon',90,40],['bigscreen',120,16],['holotable',100,100],['captchair',30,30]],
  d:[['starmap',170,170],['mapfloor',170,120],['cables',70,18],['numbers',60,40],['chairmat',40,40]],
  g:[[['d0',0,0],['o3',0,0],['o1',0,-84,0],['o1',0,84,XPI],['o1',-84,0,-XH],['o1',84,0,XH]],                     // plancia attorno al tavolo olografico
   [['o1',0,0,0],['d4',0,36],['o4',0,36,XPI],['d2',0,-24]],                                                      // postazione
   [['o2',0,0,0],['o1',-50,46,XPI],['o1',50,46,XPI]]],                                                           // schermo con due consolle
  f:[['rack',90,28],['locker',50,24],['console',64,28]],
  w:[2]},
 ponte:{o:[['navcon',90,40],['captchair',32,32],['holotable',110,110],['bigscreen',140,16],['chair',22,22]],
  d:[['spacewin',420,200],['starmap',170,170],['chairmat',40,40],['cables',70,18],['logo',120,120]],
  g:[[['d0',0,0],['o0',-100,130,XPI],['o0',0,138,XPI],['o0',100,130,XPI],['o4',-100,170,XPI],['o4',0,178,XPI],['o4',100,170,XPI]],   // vetrata di prua con la fila delle consolle
   [['d1',0,0],['o2',0,0],['o1',0,96,XPI],['d2',0,96]],                                                          // tavolo olografico e poltrona del comandante
   [['o0',0,0,0],['o4',0,36,XPI],['d2',0,36],['d3',0,-24]],                                                       // postazione di navigazione
   [['o3',0,0,0],['o0',-50,46,XPI],['o0',50,46,XPI]]],                                                           // schermo tattico
  f:[['console',64,28],['locker',50,24],['rack',90,28]],
  w:[3]},
 motori:{o:[['engine',180,180],['fuelc',90,40],['plasmac',60,60],['console',64,28],['toolcart',40,26]],
  d:[['thrust',200,200],['pipe',200,36],['hazmark',140,18],['oil',60,40],['conduit',220,40]],
  g:[[['d0',0,0,0,280,280],['o0',0,0],['d2',0,-120,0,180,18],['d2',0,120,0,180,18]],                             // propulsore principale
   [['o2',-40,0],['o2',40,0],['d4',0,50]],                                                                         // bobine di accensione
   [['o1',0,-26,0],['o1',0,26,0],['o3',72,0,XH],['d3',-60,0]],                                                  // celle di carburante con il quadro
   [['d1',0,0],['o4',0,40,0]]],
  f:[['fuelc',90,40],['plasmac',60,60],['gen',100,64],['toolcart',40,26],['compressor',66,46]],
  w:[1,3]},
 ripostiglio:{o:[['shelf',90,26],['crates',46,46],['barrels',40,40],['maglock',60,44],['cart',40,26]],
  d:[['stain',50,50],['numbers',50,34],['vent',40,40],['boxesf',50,40],['hullplate',70,70]],
  g:[[['o0',0,0,0],['d3',0,30]],[['o3',0,0,0],['o4',44,2],['d1',0,34]],[['o1',0,0],['o2',44,8],['d4',-30,30]]],
  f:[['maglock',60,44],['crates',60,60],['crates',50,50],['barrels',44,44],['crate',36,36],['shelf',90,26]],
  w:[0]},
 capsule:{o:[['lifepod',60,90],['suits',110,40],['o2',60,40],['locker',50,24],['console',60,26]],
  d:[['airlock',110,110],['hazmark',100,18],['arrows',60,40],['numbers',50,34],['stopline',100,16]],
  g:[[['o0',-40,0,0],['o0',40,0,0],['d1',0,62,0,140,18]],                                                        // due capsule di salvataggio
   [['d0',0,0],['o0',0,0,0],['d2',0,76]],                                                                         // capsula sul portello stagno
   [['o1',0,0,0],['o2',76,0,XH],['d3',0,34]]],                                                                    // tute e ossigeno
  f:[['lifepod',60,90],['o2',60,40],['locker',50,24],['suits',110,40]],
  w:[1,2]},
 belvedere:{o:[['sofa',80,30],['armchair',32,32],['planter',70,30],['ctable',46,46],['holotable',90,90]],
  d:[['spacewin',420,220],['spacewin',260,150],['rug',150,110],['starmap',140,140],['ctablef',46,28]],
  g:[[['d0',0,0],['o0',-90,150,XPI],['o0',0,156,XPI],['o0',90,150,XPI],['o2',-170,140,XH],['o2',170,140,XH]],    // grande vetrata con i divani affacciati
   [['d1',0,0],['o1',-60,104,XPI],['o1',60,104,XPI],['o3',0,110]],                                              // vetrata piccola con due poltrone
   [['d2',0,0],['o0',0,-46,0],['o1',-64,4,-XH],['o1',64,4,XH],['d4',0,4]],                                       // salotto
   [['d3',0,0],['o4',0,0]]],                                                                                       // carta stellare olografica
  f:[['planter',70,30],['pot',30,30],['sofa',80,30],['armchair',32,32]],
  w:[2]}};
// ===== ARREDO DELLA BASE SOTTOMARINA (stesso schema di XM: o = 5 ostacoli, d = 5 decorazioni, g = gruppi, f = riempimento, w = lungo i muri) =====
// ostacoli nuovi: fishtank (vasca rettangolare con i pesci), coralpot (vaso di coralli) · decorazioni nuove (XDS): sonar, fishmos (mosaico di pesci),
// netf (rete da pesca stesa), shells (sabbia e conchiglie) · glassfloor: lastra di vetro sul fondale
const XM4={
 dock:{o:[['minisub',200,90],['crates',50,50],['o2',60,40],['suits',110,40],['toolcart',40,26]],
  d:[['pad',220,220],['hazmark',160,18],['arrows',60,40],['oil',70,50],['netf',140,90]],
  g:[[['o0',0,0,0],['o4',130,30,XH],['o1',-140,-20],['d4',0,82,0,200,60],['d1',0,-70,0,220,18]],              // minisommergibile in manutenzione: carrello, ricambi, rete stesa
   [['o2',-34,0,0],['o2',34,0,0],['o3',0,52,0],['d2',0,-46]],                                                 // bombole e tute da immersione
   [['o1',-27,-27],['o1',27,-27],['o1',-27,27],['o1',27,27],['d2',76,0]],                                     // catasta di casse
   [['d0',0,0,0,180,180],['o4',110,0,XH],['d3',0,0]]],                                                         // piazzola di attracco
  f:[['crates',56,56],['barrels',44,44],['o2',60,40],['suits',110,40],['cont',120,50],['toolcart',40,26]],
  w:[2,3]},
 acquario:{o:[['fishtank',110,40],['coralpot',44,44],['sofa',80,30],['bench2',100,18],['planter',70,30]],
  d:[['fishmos',200,200],['rug',140,100],['shells',80,60],['glassfloor',160,110],['sonar',120,120]],
  g:[[['d0',0,0],['o1',0,0],['o4',-130,0,XH],['o4',130,0,XH],['o3',0,-100,0],['o3',0,100,0]],              // mosaico dei pesci con i coralli al centro, panche e fioriere attorno
   [['o0',0,0,0],['o0',0,46,0],['d2',0,-46]],                                                                 // parete di vasche
   [['d1',0,0],['o2',0,-46,0],['o2',0,46,XPI],['d2',0,0,0,60,40]],                                           // salottino davanti ai pesci
   [['o0',-62,0,XH],['o0',62,0,XH],['o3',0,0,XH],['d3',0,0,0,90,130]]],                                      // vetro sul fondale fra due vasche
  f:[['fishtank',110,40],['coralpot',44,44],['planter',70,30],['pot',30,30]],
  w:[0,4]},
 serra:{o:[['tree',42,42],['rock',48,48],['hydro',120,40],['bench2',100,18],['coralpot',44,44]],
  d:[['flowers',90,50],['path',170,40],['puddle',50,40],['soil',130,60],['leaves',70,70]],
  g:[[['o0',0,0],['o0',52,24],['o0',-20,50],['o1',30,-30],['d4',16,22]],                                     // boschetto
   [['d3',0,0,0,130,110],['o2',0,-30,0],['o2',0,30,0],['o4',80,0]],                                          // orto idroponico con coralli
   [['d1',0,0],['o3',0,-36,0],['d0',-60,36],['d0',60,36]],                                                    // sosta sul sentiero
   [['o0',0,0],['o1',-44,12],['o1',38,-30],['d4',0,0],['d2',46,34]]],                                        // albero fra le rocce
  f:[['planter',110,44],['tree',42,42],['rock',48,48],['coralpot',44,44],['hydro',120,40]],
  w:[]},
 lab:{o:[['bench',100,34],['stool',18,18],['sample',34,34],['analyzer',40,40],['fishtank',90,34]],
  d:[['hazmark',80,18],['spill',50,40],['papers',30,22],['biohaz',60,60],['sonar',90,90]],
  g:[[['o0',0,0,0],['o1',-30,30],['o1',30,30],['d2',20,-4]],                                                  // bancone con sgabelli
   [['o4',0,0,0],['o3',72,0],['d4',0,56,0,80,80]],                                                            // vasca dei campioni vivi, analizzatore e sonar
   [['d3',0,0],['o2',-24,-6],['o2',24,-6],['o2',0,26],['d1',44,26]],                                         // campioni sul simbolo di pericolo
   [['o0',0,-26,0],['o0',0,26,XPI],['o1',-36,-56],['o1',36,56],['d0',80,0,XH]]],                             // doppio bancone
  f:[['sample',34,34],['analyzer',40,40],['tank',40,40],['locker',50,24],['fishtank',90,34]],
  w:[2,4]},
 pompe:{o:[['pump',60,60],['valve',36,36],['compressor',66,46],['tank',60,60],['console',64,28]],
  d:[['pipe',200,36],['puddle',50,40],['hazmark',110,18],['drain',48,48],['rust',60,60]],
  g:[[['d0',0,0],['o0',-74,0],['o0',74,0],['o1',0,40],['d3',0,-40]],                                         // due pompe collegate con la valvola
   [['o3',-35,0],['o3',35,0],['o1',0,52],['d4',0,0,0,150,90]],                                               // serbatoi gemelli
   [['o2',0,0,0],['o4',0,52,XPI],['d2',0,-46,0]],                                                             // compressore con il quadro comandi
   [['o0',0,0],['d2',0,-56,0],['d2',0,56,0],['o1',62,0],['d1',-56,30]]],                                     // pompa fra le strisce di pericolo
  f:[['pump',60,60],['compressor',66,46],['valve',36,36],['tank',60,60],['barrels',44,44]],
  w:[2,4]},
 alloggi:{o:[['bunk',40,80],['locker',50,24],['ctable',46,46],['chair',22,22],['fishtank',70,28]],
  d:[['rug',120,80],['glassfloor',140,90],['papers',30,22],['mat',60,30],['shells',60,40]],
  g:[[['o0',-30,0,0],['o0',30,0,0],['o1',0,-58,0],['d3',0,58]],                                              // due cuccette e un armadietto
   [['d0',0,0],['o2',0,0],['o3',-40,0,-XH],['o3',40,0,XH],['d2',0,0]],                                       // tavolino comune
   [['d1',0,0],['o3',-50,80,XPI],['o3',0,80,XPI],['o3',50,80,XPI]],                                          // vetro sul fondale con le sedie davanti
   [['o0',-44,0,0],['o0',0,0,0],['o0',44,0,0],['o1',0,-64,0],['o4',0,62,0]]],                                // fila di cuccette con la vasca dei pesci
  f:[['locker',50,24],['bunk',40,80],['pot',24,24],['fishtank',70,28]],
  w:[1,4]},
 magazzino:{o:[['shelf',96,28],['crates',50,50],['pallet',46,46],['barrels',44,44],['o2',60,40]],
  d:[['palletf',46,46],['numbers',60,40],['forklane',40,260],['arrows',60,40],['puddle',50,40]],
  g:[[['o0',0,-17,0],['o0',0,17,XPI],['d1',72,0,XH]],                                                         // scaffali schiena contro schiena
   [['o2',-26,-26],['o2',26,-26],['o1',-26,26],['d0',26,26],['d4',0,0,0,70,70]],                              // deposito su pallet
   [['d2',0,0],['o4',-34,-60,0],['o4',34,-60,0],['o1',0,70],['d3',0,0]],                                     // corsia di carico con le bombole
   [['o3',0,0],['o3',46,4],['o1',-50,-6],['d4',20,40]]],                                                       // fusti e casse
  f:[['cont',120,50],['crates',56,56],['pallet',46,46],['barrels',44,44],['crate',36,36],['shelf',96,28]],
  w:[0,3]},
 osservatorio:{o:[['sofa',80,30],['armchair',32,32],['holotable',90,90],['coralpot',44,44],['bench2',100,18]],
  d:[['glassfloor',260,160],['glassfloor',160,110],['rug',150,110],['sonar',140,140],['ctablef',46,28]],
  g:[[['d0',0,0],['o0',-90,112,XPI],['o0',0,118,XPI],['o0',90,112,XPI],['o3',-170,100],['o3',170,100]],     // grande vetro sul fondale con i divani affacciati
   [['d1',0,0],['o1',-50,82,XPI],['o1',50,82,XPI],['o4',0,-82,0]],                                          // vetro piccolo con due poltrone
   [['d2',0,0],['o0',0,-46,0],['o1',-64,4,-XH],['o1',64,4,XH],['d4',0,4]],                                   // salotto
   [['d3',0,0],['o2',0,0]]],                                                                                   // sonar con la mappa olografica del fondale
  f:[['coralpot',44,44],['pot',30,30],['sofa',80,30],['armchair',32,32]],
  w:[3]},
 mensa:{o:[['table',130,40],['bench2',120,18],['counter',130,38],['cooler',40,40],['fishtank',100,36]],
  d:[['tray',24,16],['placemat',28,18],['queue',170,30],['fishmos',150,150],['puddle',50,40]],
  g:[[['o0',0,0,0],['o1',0,-36,0],['o1',0,36,0],['d1',-40,-8],['d1',40,8],['d0',0,-8]],                     // tavolata con due panche
   [['o2',0,0,0],['d2',0,52],['o3',92,0,0]],                                                                  // self-service: bancone, fila, frigorifero
   [['d3',0,0],['o4',0,0,0],['o1',0,-62,0],['o1',0,62,0]],                                                   // vasca dei pesci sul mosaico, fra due panche
   [['o0',0,-60,0],['o1',0,-96,0],['o1',0,-24,0],['o0',0,60,0],['o1',0,24,0],['o1',0,96,0]]],               // due tavolate in fila
  f:[['cooler',40,40],['cart',40,26],['vend',40,30],['bin',18,18],['fishtank',100,36]],
  w:[2,3]},
 moonpool:{o:[['minisub',200,90],['suits',110,40],['o2',60,40],['crates',50,50],['valve',36,36]],
  d:[['netf',140,90],['shells',80,60],['puddle',50,40],['hazmark',120,18],['drain',48,48]],
  g:[[['o0',0,0,0],['o2',0,70,0],['d1',-130,0]],                                                              // minisommergibile pronto all'immersione
   [['o1',0,0,0],['o2',0,46,0],['d0',0,-50,0,140,60]],                                                        // tute e bombole, rete stesa
   [['o3',-27,0],['o3',27,0],['o4',0,48],['d2',0,-40]],                                                       // casse dell'equipaggiamento
   [['d3',0,0,0,140,18],['o2',-40,30,0],['o2',40,30,0]]],                                                     // linea di sicurezza con le bombole
  f:[['crates',50,50],['o2',60,40],['suits',110,40],['valve',36,36],['barrels',44,44]],
  w:[1,2]},
 cabina:{o:[['bunk',40,80],['locker',50,24],['desk',62,34],['chair',22,22],['fishtank',70,28]],
  d:[['rug',100,70],['glassfloor',140,90],['papers',30,22],['mat',50,26],['chairmat',40,40]],
  g:[[['o0',0,0,0],['o1',40,-20,XH],['d3',-40,0,XH]],                                                         // cuccetta e armadietto
   [['o2',0,0,0,0,0,{kb:1}],['d4',0,32],['o3',0,32,XPI],['d2',10,-2]],                                        // scrivania
   [['d1',0,0],['o4',0,-70,0]]],                                                                              // vetro sul fondale con la vasca dei pesci
  f:[['locker',50,24],['pot',24,24],['crate',30,30]],
  w:[1]}};
XM4.ripostiglio=XM.ripostiglio;XM4.server2=XM.server2;XM4.reattore=XM.reattore;XM4.comando=XM.comando;XM4.baia=XM.baia;XM4.armeria=XM.armeria;
const X_BALC_P=.32,X_SETGAP=48,X_FILL=.17,X_FILLGAP=90,X_TREES=8;   // X_TREES: alberi della serra = 8× (+700%)   // ... · riempimento: superficie della stanza da occupare · spazio minimo fra un oggetto extra e gli altri (ci passa il Grunt)   // probabilità della balconata (stanze di almeno 600 px) · spazio libero fra un gruppo e gli altri oggetti (ci passa il Grunt)
// un ostacolo del gruppo: alberi e rocce sono quelli delle mappe normali; dry = solo prova
function xMObs(K,S,q,dry,v){   // q.x7: proprietà in più per l'oggetto (es. kb: dove stanno tastiera e mouse sulla scrivania)
 if(q.k=='tree'||q.k=='rock'){const r=q.w/2;if(dry&&!xFits(S,{x:q.x,y:q.y,a:0,c:1,s:0,r,st:1,pr:bgeom('circle',r*2,r*2).pr},X_SETGAP*.6))return false;if(!dry){if(q.k=='tree')K.addO({t:'t',x:q.x,y:q.y,r:r*K.rr(.9,1.2),hp:50,m:50,tn:K.ri(0,2)});else K.rock(q.x,q.y,r*K.rr(.75,1.3))}return true}   // alberi: lo spazio l'ha già controllato il gruppo
 if(dry)return!!xPut(K,S,q.k,q.x,q.y,q.w,q.h,q.a,{dry:1,gap:X_SETGAP,st:1});
 const o=xPut(K,S,q.k,q.x,q.y,q.w,q.h,q.a,{force:1,v});if(o&&q.x7)Object.assign(o,q.x7);return!!o}
// un gruppo in (x, y), girato di a: prima si prova a posare tutti gli ostacoli, poi si posa tutto (decorazioni solo se stanno nella stanza)
function xMSet(K,S,x,y,a,C,G){const ca=Math.cos(a),sa=Math.sin(a);
 const W=G.map(p=>{const io=p[0][0]=='o',D=(io?C.o:C.d)[+p[0].slice(1)];return{o:io,k:D[0],x:x+p[1]*ca-p[2]*sa,y:y+p[1]*sa+p[2]*ca,w:p[4]||D[1],h:p[5]||D[2],a:a+(p[3]||0),x7:p[6]}});
 for(const q of W)if(q.o&&!xMObs(K,S,q,1))return 0;
 const v=K.ri(0,3);for(const q of W){if(q.o)xMObs(K,S,q,0,v);else if(xDep(S.g,q.x,q.y)>Math.max(q.w,q.h)*.35+X_TI/2)xDec(K,q.k,q.x,q.y,q.w,q.h,q.a)}return 1}
// ingombro di un gruppo (raggio dal suo centro)
const xGR=(C,G)=>G._r||(G._r=Math.max(...G.map(p=>{const io=p[0][0]=='o',D=(io?C.o:C.d)[+p[0].slice(1)];return io?Math.hypot(p[1],p[2])+Math.hypot(p[4]||D[1],p[5]||D[2])/2:0})));
// SOTTO-STANZE della base sottomarina: muri interni (partition, distruttibili) con solo due formazioni, angoli sempre a 90°:
//  · a U: fondo e due fianchi, aperta davanti; a volte con una porta nel fondo
//  · a L: due bracci ad angolo retto, l'interno è l'angolo fra i due
// Misure casuali; ogni formazione sta lontana dai muri della sala e dalle altre (ci si gira attorno, niente labirinti) e non copre corsie né varchi.
// Si posa solo se dentro ci stanno ostacoli della stanza (in fila contro il fondo e contro un fianco), più una o due decorazioni della stanza
const X4_PT=24,X4_DOOR=[110,140],X4_SUB=[1,2,4],X4_LANE=48,X4_TRY=80,X4_U=.55,X4_UDOOR=.4,X4_GAPW=120,X4_GAPF=120;   // spessore dei muri interni · larghezza della porta nel fondo della U · formazioni per sala piccola/media/grande · mezza larghezza delle corsie lasciate libere · tentativi per formazione · probabilità della U (altrimenti L) · probabilità della porta nella U · distanza minima dai muri della sala · distanza minima fra due formazioni
function x4Pieces(a,b,out){const L=Math.hypot(b[0]-a[0],b[1]-a[1]);if(L<8)return;const n=Math.max(1,Math.ceil(L/110)),sx=(b[0]-a[0])/L,sy=(b[1]-a[1])/L,sl=L/n,an=Math.atan2(sy,sx);
 for(let i=0;i<n;i++){const s=(i+.5)*sl;out.push([a[0]+sx*s,a[1]+sy*s,sl+2,an])}}
function x4Build(K,S,pc){if(!pc.length||!pc.every(q=>xPut(K,S,'partition',q[0],q[1],q[2],X4_PT,q[3],{wl:1,gap:4,dry:1,ln:X4_LANE})))return false;
 for(const q of pc){const o=xPut(K,S,'partition',q[0],q[1],q[2],X4_PT,q[3],{wl:1,force:1});if(o)o.hp=Math.round(q[2]*5.1)}return true}   // vita come i muri sottili fra due spazi
function x4Sub(K,S,C){const{R,rr,ri,pick}=K,area=xArea(S.g);let made=0;
 const want=area<450000?X4_SUB[0]:area<1000000?X4_SUB[1]:X4_SUB[2],F=S.x4f||(S.x4f=[]),np=S.g.p.length,op=S.open||new Set();
 const far=(pts,m)=>pts.every(q=>xDep(S.g,q[0],q[1])>=X_TO/2+m);
 const O=C.o.filter(q=>q[0]!='tree'&&q[0]!='rock');if(!O.length)return 0;   // ostacoli della stanza da mettere nelle sotto-stanze
 // muro dritto da A a B con una porta larga gw nel mezzo (t 0..1); t<0: muro pieno
 const wallD=(A,B,t,gw,pc)=>{const L=Math.hypot(B[0]-A[0],B[1]-A[1]);if(t<0||L<gw+80){x4Pieces(A,B,pc);return null}const ux=(B[0]-A[0])/L,uy=(B[1]-A[1])/L,c=clamp(t*L,gw/2+40,L-gw/2-40);
  x4Pieces(A,[A[0]+ux*(c-gw/2),A[1]+uy*(c-gw/2)],pc);x4Pieces([A[0]+ux*(c+gw/2),A[1]+uy*(c+gw/2)],B,pc);return[A[0]+ux*c,A[1]+uy*c]};
 // ostacoli in fila contro un muro interno: da u0 a u1 lungo il muro, a filo della sua faccia interna (v0, verso +v); P(u,v) → punto, rot: angolo del muro
 const rowAt=(P,u0,u1,v0,rot,dry,out)=>{let u=u0+rr(0,30),n=0;for(let k=0;k<4&&u<u1-30;k++){const it=pick(O);if(it[1]>u1-u)continue;const q=P(u+it[1]/2,v0+it[2]/2+10);
   const ok=xPut(K,S,it[0],q[0],q[1],it[1],it[2],rot,{gap:12,wa:1,dry:1});if(ok){out.push([it[0],q[0],q[1],it[1],it[2],rot]);n++;u+=it[1]+rr(20,60)}else u+=40}return n};
 for(let t=0;t<want*X4_TRY&&made<want;t++){
  const U=R()<X4_U,w=U?rr(240,420):rr(240,440),d=U?rr(200,320):rr(220,400);   // U: larga w, profonda d · L: braccia lunghe w e d
  // di solito col fondo verso un muro della sala (a X4_GAPW, ci si passa dietro) e l'apertura verso il centro: lì non passano le corsie, che vanno dalle aperture al centro
  let an,cx,cy;
  if(R()<.8){const e=ri(0,np-1);if(op.has(e)||(!S.oct&&Math.abs(S.g.n[e][0]*S.g.n[e][1])>.1))continue;const A=S.g.p[e],Bq=S.g.p[(e+1)%np],L=Math.hypot(Bq[0]-A[0],Bq[1]-A[1]),nx=-S.g.n[e][0],ny=-S.g.n[e][1],t=L>w+160?rr(w/2+80,L-w/2-80):L/2,o=X_TO/2+X4_GAPW+d/2+(S.oct?w*w/(8*S.R):10);   // nelle sale dritte non contro gli smussi a 45°
   cx=A[0]+(Bq[0]-A[0])*t/L+nx*o;cy=A[1]+(Bq[1]-A[1])*t/L+ny*o;an=Math.atan2(-nx,ny)}
  else{const B=xBox(S,X_TI/2);if(B[2]-B[0]<w+2*X4_GAPW||B[3]-B[1]<d+2*X4_GAPW)continue;an=(S.oa||0)+ri(0,3)*XH;cx=rr(B[0]+w/2+X4_GAPW,B[2]-w/2-X4_GAPW);cy=rr(B[1]+d/2+X4_GAPW,B[3]-d/2-X4_GAPW)}   // a volte in mezzo alla sala
  const ca=Math.cos(an),sa=Math.sin(an),P=(u,v)=>[cx+u*ca-v*sa,cy+u*sa+v*ca],rad=Math.max(w,d)/2;
  if(!far([P(-w/2,-d/2),P(w/2,-d/2),P(w/2,d/2),P(-w/2,d/2),P(0,d/2),P(0,-d/2)],X4_GAPW-30))continue;   // lontana dai muri della sala: attorno ci si passa
  if(F.some(f=>Math.hypot(f[0]-cx,f[1]-cy)<f[2]+rad+X4_GAPF))continue;   // lontana dalle altre formazioni: niente labirinti
  const pc=[],h=X4_PT/2,items=[];let dr=null;
  if(U){   // ===== U: fondo (v=-d/2) e due fianchi; aperta davanti (+v). A volte una porta nel fondo
   dr=wallD(P(-w/2-h,-d/2),P(w/2+h,-d/2),R()<X4_UDOOR?rr(.35,.65):-1,rr(X4_DOOR[0],X4_DOOR[1]),pc);x4Pieces(P(-w/2,-d/2+h),P(-w/2,d/2),pc);x4Pieces(P(w/2,-d/2+h),P(w/2,d/2),pc)}
  else{    // ===== L: braccio lungo il lato v=-d/2 e braccio lungo il lato u=-w/2, angolo retto in (-w/2,-d/2); l'interno è il quadrante verso +u +v
   x4Pieces(P(-w/2-h,-d/2),P(w/2,-d/2),pc);x4Pieces(P(-w/2,-d/2+h),P(-w/2,d/2),pc)}
  if(!pc.every(q=>xPut(K,S,'partition',q[0],q[1],q[2],X4_PT,q[3],{wl:1,gap:4,dry:1,ln:X4_LANE})))continue;
  // contenuto (prima della posa, a secco): contro il fondo/il braccio lungo, poi contro un fianco/l'altro braccio
  const v0=-d/2+h;let n=0;
  if(U&&dr){const c=(Math.hypot(dr[0]-P(-w/2,-d/2)[0],dr[1]-P(-w/2,-d/2)[1]))-w/2,g=X4_DOOR[1]/2+20;n+=rowAt(P,-w/2+h,c-g,v0,an,1,items);n+=rowAt(P,c+g,w/2-h,v0,an,1,items)}   // fondo con la porta: pezzi ai lati della porta
  else n+=rowAt(P,-w/2+X4_PT,w/2-(U?h:0),v0,an,1,items);
  const dep=items.reduce((m,it)=>Math.max(m,it[4]),0);   // lungo il fianco sinistro / il secondo braccio (s dal fondo verso l'apertura, t verso l'interno), dopo la fila del fondo
  if(R()<.75)n+=rowAt((s,t)=>P(-w/2+t,-d/2+s),X4_PT+dep+30,d-20,h,an+XH,1,items);
  if(!n)continue;   // una sotto-stanza vuota non serve: si cerca un altro posto
  x4Build(K,S,pc);   // posa i muri (già verificati)
  for(const it of items)xPut(K,S,it[0],it[1],it[2],it[3],it[4],it[5],{force:1});   // già provati a secco, a 10 px dalla faccia del muro
  const dc=U?P(0,0):P(-w/2+w*.45,-d/2+d*.45),dq=pick(C.d);xDec(K,dq[0],dc[0],dc[1],Math.min(dq[1],Math.min(w,d)*.55),Math.min(dq[2],Math.min(w,d)*.55),an);   // decorazione a terra della stanza
  if(R()<.6){const q2=pick(C.d),p2=U?P(rr(-w/4,w/4),d/4):P(-w/2+w*.7,-d/2+d*.25);xDec(K,q2[0],p2[0],p2[1],Math.min(q2[1],140),Math.min(q2[2],140),an)}
  if(U){const fr=P(0,d/2+70);S.ex.push([fr[0],fr[1],Math.min(w/2,160),90])}else{const fr=P(w*.1,d*.1);S.ex.push([fr[0],fr[1],Math.min(w,d)*.3,60])}   // ingresso libero
  if(dr){const o=P(0,-d/2-60);S.ex.push([dr[0],dr[1],X4_DOOR[1]/2+50,X4_DOOR[1]/2+10],[o[0],o[1],90,50])}
  F.push([cx,cy,rad]);made++}
 return made}
// BALCONATA: una parte della stanza è più alta. Fascia lungo un lato (stanze medie), a L su due lati (grandi), a U su tre lati (molto grandi).
// Bordo: parapetto basso (ferma il Grunt e i colpi bassi, l'Air ci vola sopra); le scale sono i buchi del parapetto (almeno una per fascia, più dove passano le corsie)
function xBalc(K,S){const{R,rr}=K,rect=xIsRect(S.g.p),b=S.g.bb,W=b[2]-b[0],H=b[3]-b[1],m=Math.min(W,H);if(m<600)return 0;
 const op=S.open||new Set(),edgeOf=sd=>{let be=-1,bl=0;for(let e=0;e<S.g.n.length;e++){const n=S.g.n[e],A=S.g.p[e],Bq=S.g.p[(e+1)%S.g.p.length],l=Math.hypot(Bq[0]-A[0],Bq[1]-A[1]);if((sd==0&&n[1]<-.99||sd==1&&n[0]>.99||sd==2&&n[1]>.99||sd==3&&n[0]<-.99)&&l>bl){bl=l;be=e}}return be};
 const len=sd=>sd%2?H:W,ok=sd=>{const e=edgeOf(sd);if(e<0||op.has(e))return false;const A=S.g.p[e],Bq=S.g.p[(e+1)%S.g.p.length];return Math.hypot(Bq[0]-A[0],Bq[1]-A[1])>=len(sd)*.55};
 const dep=Math.round(clamp(m*rr(.26,.34),200,340)/10)*10,nS=!rect?1:m>=1400&&R()<.45?3:m>=1000&&R()<.6?2:1;
 const main=[0,1,2,3].filter(ok).sort((p,q)=>len(q)-len(p)+(R()-.5)*200)[0];if(main==null)return 0;
 const sides=[main];if(nS>=2){const adj=[(main+1)%4,(main+3)%4].filter(ok);if(nS==3&&adj.length==2)sides.push(...adj);else if(adj.length)sides.push(K.pick(adj))}
 const has=sd=>sides.includes(sd),IN=[[0,1],[-1,0],[0,-1],[1,0]],SA=[0,XH,XPI,-XH];   // IN: verso il piano di sotto per ogni lato · SA: rotazione del disegno
 const inside=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]].every(q=>xDep(S.g,q[0],q[1])>=-2);
 let n0=0;
 for(const sd of sides){const e=edgeOf(sd),A=S.g.p[e],Bq=S.g.p[(e+1)%S.g.p.length];let x0,y0,x1,y1;
  if(sd%2==0){x0=Math.min(A[0],Bq[0]);x1=Math.max(A[0],Bq[0]);if(sd==0){y0=b[1];y1=b[1]+dep}else{y0=b[3]-dep;y1=b[3]}if(has(3))x0=Math.max(x0,b[0]+dep);if(has(1))x1=Math.min(x1,b[2]-dep)}
  else{y0=Math.min(A[1],Bq[1]);y1=Math.max(A[1],Bq[1]);if(sd==1){x0=b[2]-dep;x1=b[2]}else{x0=b[0];x1=b[0]+dep}}
  for(let k=0;k<20&&!inside(x0,y0,x1,y1);k++){if(sd%2==0){x0+=20;x1-=20}else{y0+=20;y1-=20}}   // stanze non rettangolari: la fascia si accorcia finché sta dentro
  const L0=sd%2?y1-y0:x1-x0;if(L0<260||!inside(x0,y0,x1,y1))continue;
  xDec(K,'deck',(x0+x1)/2,(y0+y1)/2,L0,dep,SA[sd]);n0++;   // piano rialzato, con l'ombra verso il piano di sotto
  // parapetto sul bordo interno (dove la fascia dà sul piano di sotto, non dove continua su un'altra fascia); ai lati corti, se la fascia non tocca un muro, si chiude anche lì
  const n=IN[sd];let a0,a1;if(sd%2==0){const y=sd==0?y1:y0;a0=[x0,y];a1=[x1,y]}else{const x=sd==1?x0:x1;a0=[x,y0+(has(0)?dep:0)];a1=[x,y1-(has(2)?dep:0)]}
  let Lr=Math.hypot(a1[0]-a0[0],a1[1]-a0[1]);if(Lr<160)continue;{const ix=(a1[0]-a0[0])/Lr*40,iy=(a1[1]-a0[1])/Lr*40;a0=[a0[0]+ix,a0[1]+iy];a1=[a1[0]-ix,a1[1]-iy];Lr-=80}   // il parapetto parte un po' dopo il muro: niente buchi contro le pareti
  for(let i=0,k=Lr>900?2:1;i<k;i++){const t=k==1?rr(.25,.75):(i?rr(.62,.85):rr(.15,.38));S.ex.push([a0[0]+(a1[0]-a0[0])*t,a0[1]+(a1[1]-a0[1])*t,40])}   // scale: qui il parapetto si apre (un pezzo)
  xRail(K,S,a0[0],a0[1],a1[0],a1[1],n,Math.atan2(n[0],-n[1]),{st:1});
  if(!rect)for(const[c,sg]of[[sd%2==0?[x0,y0,x0,y1]:[x0,y0,x1,y0],-1],[sd%2==0?[x1,y0,x1,y1]:[x0,y1,x1,y1],1]]){const mx=(c[0]+c[2])/2,my=(c[1]+c[3])/2,tn=sd%2==0?[sg,0]:[0,sg];
   if(xDep(S.g,mx+tn[0]*30,my+tn[1]*30)>20)xRail(K,S,c[0],c[1],c[2],c[3],tn,Math.atan2(tn[0],-tn[1]),{st:1})}}   // fianchi aperti della fascia
 return n0}
// laghetto vero della serra (acqua come nelle mappe normali), con sponde e rocce
function xPond(K,S,B,d){const{R,rr,ri}=K;if(d.big<170)return;const fit=(x,y,r)=>xFits(S,{x,y,a:0,c:1,s:0,r,pr:bgeom('circle',r*2,r*2).pr},20);
 const n=1+(d.big>650?1:0)+(d.big>1000&&R()<.6?1:0)+(Math.max(d.Bw,d.Bh)>1400?1:0);   // anche più laghetti, piccoli o grandi
 for(let p=0;p<n;p++){let done=0;for(const k of[1,.75,.55,.4,.3])for(let t=0;t<40&&!done;t++){const r=Math.max(32,Math.min(170,d.big*rr(.1,.2)*k));if(B[2]-B[0]<2*r+60||B[3]-B[1]<2*r+60)continue;
   const x=rr(B[0]+r+30,B[2]-r-30),y=rr(B[1]+r+30,B[3]-r-30);if(!fit(x,y,r+30))continue;done=1;
   K.m.lakes.push(blob(K.R,x,y,r));S.ex.push([x,y,r+50]);xDec(K,'pond',x,y,r*2.5,r*2.5,0);
   for(let k2=0,m=ri(3,6);k2<m;k2++){const a=R()*TAU,q=r*rr(1.05,1.25),px=x+Math.cos(a)*q,py=y+Math.sin(a)*q;if(xDep(S.g,px,py)>60)K.rock(px,py,rr(16,28))}}
  if(!done)break}}
// BOSCO della serra: molti alberi (X_TREES volte quelli già posati), lasciando libere le corsie, i varchi e l'acqua
function xForest(K,S,n0){const{rr}=K,m=K.m;let have=0;for(let i=n0;i<m.obs.length;i++)if(m.obs[i].t=='t')have++;
 const B=xBox(S,30),area=xArea(S.g),want=Math.max(have*X_TREES,Math.round(area/9000));let got=have;
 for(let t=0;t<want*12&&got<want;t++){const x=rr(B[0],B[2]),y=rr(B[1],B[3]),r=rr(16,30);
  if(!xFits(S,{x,y,a:0,c:1,s:0,r,st:1,pr:bgeom('circle',r*2,r*2).pr},8))continue;K.addO({t:'t',x,y,r,hp:50,m:50,tn:K.ri(0,2)});got++}}
// SERRA ROTONDA o a forma composta (pezzi convessi fusi, senza muri fra loro): laghetti, bosco e prati sull'intera sala
// xUFit: un cerchio (x, y, r) sta nella sala fatta dai pezzi P, lontano dai muri esterni, dalle corsie (lm), dai varchi, dall'acqua e dagli ostacoli (gap)
function xUFit(P,x,y,r,gap,lm){const mg=X_TI/2+12;
 if(!P.some(q=>xDep(q.g,x,y)>0))return false;for(let i=0;i<12;i++){const a=i*TAU/12,px=x+Math.cos(a)*(r+mg),py=y+Math.sin(a)*(r+mg);if(!P.some(q=>xDep(q.g,px,py)>0))return false}
 for(const q of P){for(const l of q.lanes)if(xSegD(x,y,l)<r+lm)return false;for(const e of q.ex)if(Math.hypot(x-e[0],y-e[1])<e[2]+r)return false;if(q.exs)for(const l of q.exs)if(xSegD(x,y,l)<r+50)return false}
 if(inBase(x,y,r+10))return false;for(const l of M.lakes)if(inBlob(l,x,y,r+20))return false;
 for(const b of qobs(x,y,r+gap+60,_xq)){if(b.dead)continue;if(b.t=='t'){if(Math.hypot(b.x-x,b.y-y)<b.r+r+gap)return false;continue}const l=toLocal(b,x,y);if(bsd(b,l[0],l[1])<r+gap)return false}
 return true}
function xSerraU(K,S){const{R,rr,ri}=K,F=S.fuse;if(F.serra)return;F.serra=1;const P=K.m.sp.filter(q=>q.fuse===F&&q.k=='r');
 const bb=[1e9,1e9,-1e9,-1e9];let area=0;for(const q of P){const b=q.g.bb;bb[0]=Math.min(bb[0],b[0]);bb[1]=Math.min(bb[1],b[1]);bb[2]=Math.max(bb[2],b[2]);bb[3]=Math.max(bb[3],b[3]);area+=xArea(q.g)}
 const at=()=>[rr(bb[0],bb[2]),rr(bb[1],bb[3])],big=Math.sqrt(area),S0=P.reduce((a,q)=>xArea(q.g)>xArea(a.g)?q:a,P[0]);
 // laghetti
 const n=1+(big>650?1:0)+(big>1000&&R()<.6?1:0);for(let p=0;p<n;p++){let done=0;for(const k of[1,.75,.55,.4,.3])for(let t=0;t<120&&!done;t++){const r=Math.max(32,Math.min(170,big*rr(.1,.18)*k)),[x,y]=at();if(!xUFit(P,x,y,r+30,20,XLANE))continue;done=1;
  K.m.lakes.push(blob(R,x,y,r));for(const q of P)if(xDep(q.g,x,y)>-r-60)q.ex.push([x,y,r+50]);xDec(K,'pond',x,y,r*2.5,r*2.5,0);
  for(let k2=0,m=ri(3,6);k2<m;k2++){const a=R()*TAU,qd=r*rr(1.05,1.25),px=x+Math.cos(a)*qd,py=y+Math.sin(a)*qd;if(xUFit(P,px,py,14,4,36))K.rock(px,py,rr(16,28))}}if(!done)break}
 // prati fioriti
 for(let i=0,m=ri(3,7),t=0;i<m&&t<200;t++){const w=rr(120,230),[x,y]=at();if(!xUFit(P,x,y,w*.3,-1e3,-1e3))continue;i++;xDec(K,'flowers',x,y,w,w*rr(.45,.7),ri(0,7)*Math.PI/4)}
 // bosco e rocce
 const want=Math.round(area/9000*X_TREES/4);for(let t=0,got=0;t<want*40&&got<want;t++){const[x,y]=at(),r=rr(16,30);if(!xUFit(P,x,y,r,8,40))continue;   // le corsie restano libere: il Grunt attraversa il bosco
 
  if(R()<.12)K.rock(x,y,r*rr(.9,1.4));else K.addO({t:'t',x,y,r,hp:50,m:50,tn:ri(0,2)});got++}}
// RIEMPIMENTO: oggetti extra della stanza (f) addossati a un muro o a contatto con un ostacolo già posato, finché la stanza è piena quanto X_FILL;
// dagli altri oggetti resta sempre lo spazio per far passare il Grunt (X_FILLGAP)
function xMFill(K,S,C,n0){const{R,rr,ri,pick}=K,F=C.f||[];if(!F.length)return;const m=K.m,area=Math.max(1,xArea(S.g)),hg=S.rt=='hangar'||S.rt=='dock',FT=(hg?X_FILL*1.5:X_FILL)*(m.th==4?1.4:1);   // l'hangar è più pieno · base sottomarina: sale più piene (+40%)
 const occ=()=>{let a=0;for(let i=n0;i<m.obs.length;i++){const o=m.obs[i];if(o.t=='t'){a+=o.r*o.r*3.14;continue}if(o.th=='wall'||o.th=='bwall'||o.th=='rail')continue;a+=(o.w||0)*(o.h||0)}return a/area};
 const p=S.g.p,np=p.length,op=S.open||new Set(),far=(x,y,w,h)=>S.ex.every(e=>Math.hypot(x-e[0],y-e[1])>e[2]+Math.max(w,h)/2+60);   // lontano dai varchi: davanti alle porte resta il passaggio
 for(let t=0,f=0;t<(hg?500:260)&&f<40&&occ()<FT;t++){const it=pick(F),k=it[0],w=it[1],h=it[2];let ok=null;
  if(k=='tree'||k=='rock'){const B=xBox(S,40),q={k,x:rr(B[0],B[2]),y:rr(B[1],B[3]),w,h:w,a:0};if(xMObs(K,S,q,1)){xMObs(K,S,q,0);f++}continue}
  if(R()<(hg?.7:.45)){   // contro un muro, parallelo
   const e=ri(0,np-1);if(op.has(e))continue;const A=p[e],Bq=p[(e+1)%np],L=Math.hypot(Bq[0]-A[0],Bq[1]-A[1]);if(L<w+80)continue;
   const ux=(Bq[0]-A[0])/L,uy=(Bq[1]-A[1])/L,nx=S.g.n[e][0],ny=S.g.n[e][1],tt=rr(w/2+40,L-w/2-40),d=Math.max(X_TO/2+4,(S.mg||X_TI/2)+10)+4+h/2;   // appena dentro il margine dei muri
   const x=A[0]+ux*tt-nx*d,y=A[1]+uy*tt-ny*d;if(!far(x,y,w,h))continue;ok=xPut(K,S,k,x,y,w,h,Math.atan2(uy,ux),{wa:1,gap:X_FILLGAP})}
  else{   // a contatto con un ostacolo della stanza, stesso orientamento
   const cand=[];for(let i=n0;i<m.obs.length;i++){const o=m.obs[i];if(o.t!='t'&&o.ty!='wall'&&!o.dead&&o.th!='rail'&&o.w)cand.push(o)}if(!cand.length)continue;
   const b=pick(cand),sd=ri(0,3),ca=Math.cos(b.a||0),sa=Math.sin(b.a||0),hor=sd%2==0,sg=sd<2?1:-1,bh=b.h||b.w;
   const du=hor?sg*(b.w/2+w/2+2):rr(-(b.w-w)/2,(b.w-w)/2)*.6,dv=hor?rr(-(bh-h)/2,(bh-h)/2)*.6:sg*(bh/2+h/2+2);
   const x=b.x+du*ca-dv*sa,y=b.y+du*sa+dv*ca;if(!far(x,y,w,h))continue;ok=xPut(K,S,k,x,y,w,h,b.a||0,{gap:X_FILLGAP,ign:b})}
  if(ok)f++}}
// arredo di una stanza della megastruttura
function xFurnishM(K,S,B,d,free,n0){const{R,rr,ri,pick}=K,rt=S.rt,T=K.m.th==4?XM4:K.m.th==3?XM3:XM,C=T[rt]||T.ripostiglio;
 // 1) oggetti speciali e di missione
 if(rt=='hangar'||rt=='dock'){S.nb0=1;xDec(K,'pad',d.cx,d.cy,Math.min(d.Bw,d.Bh)*.6,0);S.ex.push([EXT[0],EXT[1],EXT_R*.6]);
  const b=S.g.bb,P=[[b[2]-130,d.cy],[b[0]+130,d.cy],[d.cx,b[3]-120],[d.cx,b[1]+120]];for(let i=0;i<150;i++)P.push([rr(b[0],b[2]),rr(b[1],b[3])]);   // lati, poi punti a caso
  const sx=START[0]+96,sy=START[1]+96;P.sort((p,q)=>Math.hypot(q[0]-sx,q[1]-sy)-Math.hypot(p[0]-sx,p[1]-sy));   // il più lontano possibile da dove si arriva
  for(const k of[1,.8])for(const[x,y]of P){if(S.arm)break;if(xDep(S.g,x,y)<70*k||Math.hypot(x-sx,y-sy)<120+60*k)continue;const o=xPut(K,S,'armcrates',x,y,130*k,110*k,K.ri(0,3)*XH,{gap:16,tw:0,nb:1,st:1});if(o){o.armB=1;S.arm=o}}
  S.ex.push([sx,sy,170])}   // spazio per chi arriva   // armeria della partenza: casse di armi
 if(rt=='reattore'){const r=Math.min(190,Math.min(d.Bw,d.Bh)*.24);let rc=null;for(const k of[1,.82,.66,.52])if(!rc)rc=xPut(K,S,'reactor',d.cx,d.cy,r*2*k,r*2*k,0,{gap:30,tw:1,hm:4,nb:1,nl:1});if(rc)rc.sp=1;   // nucleo (sabotaggio nucleare)
  xDec(K,'haz',d.cx,d.cy,r*2+120,0,0,{ring:1});for(let i=0;i<4;i++){const a=i*XH;xDec(K,'conduit',d.cx+Math.cos(a)*(r+120),d.cy+Math.sin(a)*(r+120),220,40,a)}}
 if(rt=='comando')xPut(K,S,'cabin',d.cx,d.cy,rr(190,250),rr(170,230),0,{tw:0,gap:30,nl:1});   // sala comandi (missioni)
 if(rt=='baia'){S.ex.push([d.cx,d.cy,d.big*.3]);xDec(K,'pad',d.cx,d.cy,Math.min(d.Bw,d.Bh)*.5,0)}   // centro libero (ricerca e recupero)
 if(rt=='armeria'){for(const k of[1,.85,.7]){const o=xPut(K,S,'cabin',d.cx,d.cy,140*k,120*k,0,{tw:0,gap:30,nl:1});if(o){o.armB=1;break}}}   // armeria (si usa col tasto R)
 if(K.m.th==3&&rt=='motori'){const hor=d.Bw>=d.Bh,n=Math.max(1,Math.min(3,Math.round(Math.max(d.Bw,d.Bh)/560)));   // astronave: propulsori in fila, ognuno sulla sua bruciatura
  for(let i=0;i<n;i++){const t=(i+.5)/n,x=hor?B[0]+d.Bw*t:d.cx,y=hor?d.cy:B[1]+d.Bh*t;for(const k of[1,.85,.7,.56]){const r=Math.min(95,Math.min(d.Bw,d.Bh)*.22)*k;if(xPut(K,S,'engine',x,y,r*2,r*2,0,{gap:30,nl:1})){xDec(K,'thrust',x,y,r*3.2,r*3.2,R()*TAU);xDec(K,'hazmark',x,y+r+26,r*2,18,0);break}}}}
 if(K.m.th==3&&rt=='ponte'){const st=K.m.stern||[-1,0],a=Math.atan2(-st[0],st[1]),ca=Math.cos(a),sa=Math.sin(a);   // astronave: la grande vetrata guarda a prua, dietro la fila delle consolle e la poltrona del comandante
  const at=(x,y,u,v)=>[x+u*ca-v*sa,y+u*sa+v*ca],inside=(x,y,w,h)=>[[-1,-1],[1,-1],[1,1],[-1,1]].every(q=>{const p=at(x,y,q[0]*w/2,q[1]*h/2);return xDep(S.g,p[0],p[1])>=X_TI/2+8});
  let W0=null;for(const sc of[1,.85,.7,.56,.44]){if(W0)break;const ww=420*sc,hh=200*sc;for(const k of[.5,.42,.34,.26,.18,.1,0]){const x=d.cx-st[0]*d.big*k,y=d.cy-st[1]*d.big*k;if(inside(x,y,ww,hh)){W0={x,y,ww,hh};break}}}
  if(W0){const{x,y,ww,hh}=W0;xDec(K,'spacewin',x,y,ww,hh,a);   // la vetrata è dipinta a terra: non ingombra, si posa sempre
   for(const u of[-ww*.3,0,ww*.3]){const p=at(x,y,u,hh/2+44),q=at(x,y,u,hh/2+86);if(xPut(K,S,'navcon',p[0],p[1],90,40,a+XPI,{gap:24}))xPut(K,S,'chair',q[0],q[1],22,22,a+XPI,{gap:16})}
   for(const v of[hh/2+180,hh/2+150,hh/2+120]){const p=at(x,y,0,v);if(xPut(K,S,'captchair',p[0],p[1],34,34,a+XPI,{gap:24}))break}}}
 if(K.m.th==4&&rt=='acquario'){const r=Math.min(240,d.big*.3);for(const k of[1,.82,.66]){const aq=xPut(K,S,'aquarium',d.cx,d.cy,r*2*k,r*2*k,0,{tw:1,gap:40,nl:1});if(aq){aq.sp=1;break}}}   // base sottomarina: grande acquario al centro
 if(K.m.th==4&&rt=='moonpool'){const r=Math.min(230,d.big*.28);K.m.lakes.push(blob(K.R,d.cx,d.cy,r));S.ex.push([d.cx,d.cy,r+80]);xDec(K,'pool',d.cx,d.cy,r*2,r*2,0)}   // vasca d'immersione aperta sul mare
 if(K.m.th==4&&!S.st&&rt!='serra')x4Sub(K,S,C);   // mini-stanze e muri interni in tutte le sale (tranne l'attracco e la serra): le zone riservate alle missioni (S.ex) restano libere
 // 2) balconata (prima dell'edificio basso, che poi le gira attorno)
 if(free&&rt!='serra'&&!S.kp&&Math.min(d.W,d.H)>=600&&R()<X_BALC_P)xBalc(K,S);
  if(free&&rt!='armeria'&&d.big>=420&&R()<.88)xCabinSide(K,S,B,'cabin',172,250,{tw:R()<(Math.hypot(d.cx-START[0],d.cy-START[1])>3000?.8:.5)?1:0});   // edificio basso: missioni, armerie, civili
 // 3) serra: laghetti d'acqua vera
 if(rt=='serra'){xPond(K,S,B,d);for(let i=0,n=K.ri(3,6);i<n;i++){const w=rr(120,230),h=w*rr(.45,.7),x=rr(B[0],B[2]),y=rr(B[1],B[3]);if(xDep(S.g,x,y)>w/2+20)xDec(K,'flowers',x,y,w,h,K.ri(0,7)*Math.PI/4)}}   // prati fioriti
 // 4) gruppi, girati a multipli di 45°
 const want=K.m.th==4?clamp(Math.round(d.Bw*d.Bh/70000)+3,4,12):clamp(Math.round(d.Bw*d.Bh/80000)+1,1,10);let got=0;   // base sottomarina: una decina di gruppi nelle sale grandi
 const gR=G=>xGR(C,G);   // ingombro del gruppo
 for(let t=0,h=0;t<want*120&&h<want*40&&got<want;t++){const G=pick(C.g),r=gR(G),x=rr(B[0],B[2]),y=rr(B[1],B[3]);
  if(xDep(S.g,x,y)<r*.7+X_TI||S.lanes.some(l=>xSegD(x,y,l)<r*.45+36))continue;   // filtro rapido: il centro deve avere spazio attorno
  h++;if(xMSet(K,S,x,y,ri(0,7)*Math.PI/4,C,G))got++}
 // 5) qualche ostacolo della stanza lungo i muri
 for(const i of C.w||[]){const q=C.o[i];if(q[1]&&q[2])xAlong(K,S,q[0],q[1],q[2],rr(70,150),.4)}
 // 6) riempimento: oggetti extra contro i muri o a contatto con gli altri
 xMFill(K,S,C,n0);
 if(rt=='serra'){if(S.fuse)xSerraU(K,S);else xForest(K,S,n0)}   // serra a pezzi fusi: si arreda tutta insieme
 xRoomLamps(K,S,n0)}
// lampioni nelle stanze: sugli ostacoli coerenti (luce a tema S.lc) e, se servono, colonne-lampione lungo i muri
const XLAMP1=new Set(['fishtank','aquarium','holo','holotable','reactor','plasmac','engine','fountain','sculpt','statue','sample','cryo','scanner','bigscreen','navcon','console','hydro','core','bridge','cabin','armcrates']);
const XLAMP2=new Set(['server','ups','vend','arcade','synth','hood','analyzer','medbed','desk','reception','gen','turbine','pump','compressor','tank','pod','mechbay','lifepod','maglock','cooler','copier','forklift','shuttle','drone','robot','minisub','coralpot']);
const XLAMP3=new Set(['bench','rack','shelf','dryer','sink']);
function xRoomLamps(K,S,n0){const{m}=K;if(!m.lamps||!S.lc)return;const rl=[],c=S.lc;
 const far=o=>rl.every(l=>(l.x-o.x)**2+(l.y-o.y)**2>=X_COLS*X_COLS)&&m.lamps.every(l=>(l.x-o.x)**2+(l.y-o.y)**2>=6400);
 const add=o=>{const l={x:o.x,y:o.y,c};rl.push(l);m.lamps.push(l)};
 const obs=m.obs.slice(n0).filter(o=>!o.dead&&o.t!='t'&&o.ty!='rock');
 for(const T of[XLAMP1,XLAMP2])for(const o of obs)if(T.has(o.th)&&far(o))add(o);
 if(!rl.length||xArea(S.g)>=500000){const p=S.g.p,np=p.length,op=S.open||new Set(),sz=36,sp=X_COLS*1.4,off=X_TI/2+sz/2-2;
  for(let e=0;e<np;e++){if(op.has(e))continue;const A=p[e],B=p[(e+1)%np],dx=B[0]-A[0],dy=B[1]-A[1],L=Math.hypot(dx,dy);if(L<sz+100)continue;
   const ux=dx/L,uy=dy/L,nx=S.g.n[e][0],ny=S.g.n[e][1],k=Math.max(1,Math.floor(L/sp));
   for(let i=0;i<k;i++){const t=(i+.5)*L/k,ex=A[0]+ux*t,ey=A[1]+uy*t,px=ex-nx*off,py=ey-ny*off;
    if(S.ovl.some(q=>xDep(q.g,ex,ey)>-70))continue;
    if(rl.some(l=>(l.x-px)**2+(l.y-py)**2<sp*sp*.75))continue;
    const col=xPut(K,S,'column',px,py,sz,sz,Math.atan2(uy,ux),{wl:1,gap:6});if(col)rl.push({x:col.x,y:col.y,c})}}}
 if(!rl.length)for(const o of obs)if(XLAMP3.has(o.th)&&far(o))add(o)}
// ASCENSORI: in fondo a ogni corridoio che finisce contro un muro (senza varco) o contro il vuoto; quando servono caserme diventano caserme (AGsim.js)
function xLifts(K,L,P2){const key=(i,j)=>i<j?i*4096+j:j*4096+i;
 for(const S of L){if(S.k!='c'||S.ring||S.tri||S.atr||S.neck||S.gate||S.tube)continue;const A=xAxis(S),Ln=Math.hypot(A.b[0]-A.a[0],A.b[1]-A.a[1]);if(Ln<400)continue;
  const ux=(A.b[0]-A.a[0])/Ln,uy=(A.b[1]-A.a[1])/Ln,wd=A.w,an=Math.atan2(uy,ux);
  for(const[E,s]of[[A.a,-1],[A.b,1]]){const px=E[0]+ux*s*30,py=E[1]+uy*s*30;let open=false;
   for(const T of L){if(T===S||xDep(T.g,px,py)<=4)continue;const pr=P2.get(key(S.id,T.id));if(pr&&(pr.ov||pr.mg||pr.op.some(o=>Math.hypot(o.x-E[0],o.y-E[1])<wd)))open=true}
   if(open)continue;const dp=70,ac=clamp(wd*.6,120,210),off=X_TI/2+14+dp/2,x=E[0]-ux*s*off,y=E[1]-uy*s*off;
   const o=xPut(K,S,'lift',x,y,ac,dp,an+XH,{gap:8,tw:0,wl:1});if(o)o.lift=1}}}
function xFurnish(K,S){const{m,R,rr,ri,pick}=K,th=m.th,P=XP[th],b=S.g.bb,W=b[2]-b[0],H=b[3]-b[1],cx=S.g.cx,cy=S.g.cy,n0=m.obs.length;
 if(Math.min(W,H)<620)S.lw=Math.min(W,H)<450?42:52;   // stanze piccole: corsie più strette (il Grunt passa comunque)
 if(S.kp)S.ex.push([cx,cy,S.kp]);   // centro tenuto libero per la missione
 S.mg=X_TI/2+(S.oct?X_TO/2:0);
 const B=xBox(S,X_TI/2+40),Bw=B[2]-B[0],Bh=B[3]-B[1],big=Math.min(Bw,Bh);
 const free=!S.st&&!['comando','baia','reattore','acquario','moonpool'].includes(S.rt);
 S.oa=(S.ang||0)+(!S.oct&&!S.ang&&R()<.15?Math.PI/4:0);S.symT=S.k=='r'?xSym(K,S,S.symM):[];   // orientamento unico e simmetrie della stanza
 // nome della stanza scritto sul pavimento, luci dal soffitto
 const apo=xDep(S.g,cx,cy);
 if(S.k=='r'&&XNAME[S.rt]&&!S.lead)K.m.flat.push({k:'xt',x:cx,y:S.oct||S.nk||S.ang?cy+apo*.55:b[3]-70,s:XNAME[S.rt]+' · '+S.code,sz:S.oct?40:Math.min(46,W/14)});
 if(S.k=='c'){const A=xAxis(S),Ln=Math.hypot(A.b[0]-A.a[0],A.b[1]-A.a[1])||1,ux=(A.b[0]-A.a[0])/Ln,uy=(A.b[1]-A.a[1])/Ln,an=Math.atan2(uy,ux),wd=A.w,at=(t,o)=>[A.a[0]+ux*t-uy*o,A.a[1]+uy*t+ux*o];
  if(!xMG(th)){const n=Math.max(1,Math.round(Ln/320));for(let i=0;i<n;i++){const q=at(Ln*(i+.5)/n,0);xLight(K,q[0],q[1],130,P.glow,.12)}}   // megastruttura: la luce viene dalle colonne
  if(!S.tube&&!S.neck&&!S.tri&&!S.atr){const q=at(Ln/2,0);xDec(K,'lane',q[0],q[1],Ln,wd,an,{v:0})}   // i tubi entrano nei moduli: niente strisce che li attraversano
  if(S.neck)return;
  if(S.tri){if(S.cs>=170){const Z=xPZ(K,cx,cy,48),p=S.g.p;if(xMG(th))Z.k='column';let e0=0,bl=0;for(let e=0;e<p.length;e++){const q=p[(e+1)%p.length],l=Math.hypot(q[0]-p[e][0],q[1]-p[e][1]);if(l>bl){bl=l;e0=e}}   // angolo smussato: una colonna contro il muro obliquo
    const A=p[e0],Bq=p[(e0+1)%p.length],nx=S.g.n[e0][0],ny=S.g.n[e0][1],o=X_TI/2+Z.s/2-2;xPut(K,S,Z.k,(A[0]+Bq[0])/2-nx*o,(A[1]+Bq[1])/2-ny*o,Z.s,Z.s,Math.atan2(Bq[1]-A[1],Bq[0]-A[0]),{wl:1,gap:6})}return}
  if(S.atr){const Z=xPZ(K,cx,cy,50);if(xMG(th))Z.k='column';const b=S.g.bb,v=S.vert,L0=v?b[3]-b[1]:b[2]-b[0],n=Math.max(1,Math.round(L0/200)),nC=S.atrN,dep=(v?b[2]-b[0]:b[3]-b[1])/2;   // atro: colonnato sul lato che dà sul corridoio
   for(let i=0;i<n;i++){const t=(i+.5)*L0/n,mx=v?cx:b[0]+t,my=v?b[1]+t:cy;xPut(K,S,Z.k,mx+nC[0]*(dep-Z.s/2-4),my+nC[1]*(dep-Z.s/2-4),Z.s,Z.s,0,{force:1})}
   return}
  if(S.ring){let e0=0,bd=-1;const p=S.g.p;for(let e=0;e<p.length;e++){const q=p[(e+1)%p.length],d=Math.hypot((p[e][0]+q[0])/2-S.rc[0],(p[e][1]+q[1])/2-S.rc[1]);if(d>bd){bd=d;e0=e}}
   const A=p[e0],Bq=p[(e0+1)%p.length],mx=(A[0]+Bq[0])/2,my=(A[1]+Bq[1])/2,nx=S.g.n[e0][0],ny=S.g.n[e0][1],ea=Math.atan2(Bq[1]-A[1],Bq[0]-A[0]);
   if(S.rk%2==0){if(xMG(th))return;const Z=xPZ(K,mx,my,50),o=X_TI/2+Z.s/2-2;xPut(K,S,Z.k,mx-nx*o,my-ny*o,Z.s,Z.s,ea,{wl:1,gap:6})}
   else{const it=pick(XCOR[th]);if(it[2]<=26){const o=X_TO/2+12+it[2]/2;xPut(K,S,it[0],mx-nx*o,my-ny*o,Math.min(it[1],110),it[2],ea,{gap:10})}}
   return}
  // ritmo del corridoio: pilastri contro i muri ogni ~200 px (a coppie se è largo, alternati se è stretto);
  // fra due pilastri spesso un riparo (console, casse, armadietti...) contro il muro o staccato quanto basta per passarci dietro;
  // nei corridoi larghi qualche isola al centro, con passaggio libero ai due lati
  const T2=xMG(th),PZ=xPZ(K,(A.a[0]+A.b[0])/2,(A.a[1]+A.b[1])/2,wd>=280?56:wd>=250?44:36),pk=T2?'column':PZ.k,ps=T2?(wd>=280?44:wd>=250?40:34):PZ.s,sp=T2?X_COLS:rr(190,210),off=wd/2-X_TI/2-ps/2+2,two=T2?wd>=220&&2*off>=X_COLD:wd>=220,isl=[],LL=XCOV[th];
  // megastruttura: colonne quadrate ogni X_COLS px lungo tutto il corridoio, messe per prime (a coppie se fra le due file restano X_COLD px, altrimenti alternate)
  let cT0=0;if(T2&&Ln>=160){const nC=Math.max(1,Math.floor((Ln-100)/sp)+1);cT0=(Ln-(nC-1)*sp)/2;
   for(let k=0;k<nC;k++)for(const sd of two?[-1,1]:[k%2?-1:1])for(const dt of[0,30,-30,60,-60]){const q=at(cT0+k*sp+dt,sd*off);if(xPut(K,S,pk,q[0],q[1],ps,ps,an,{wl:1,gap:6}))break}}
  if(wd>=290&&Ln>=700)for(let t=rr(300,450);t<Ln-300;t+=rr(650,950)){if(R()<.35)continue;const it=pick(XISL[th]),acr=Math.min(it[2],wd-X_TO-170);if(acr<26)continue;const q=at(t,0);
   if(xPut(K,S,it[0],q[0],q[1],it[1],acr,an+(XK[it[0]]&&XK[it[0]].c?0:R()<.2?Math.PI/2*0:0),{gap:T2?70:20}))isl.push([t,it[1]/2+90])}
  const nearI=t=>isl.some(q=>Math.abs(q[0]-t)<q[1]);
  // barricate improvvisate (prima dei pilastri, che poi le aggirano)
  if(T2&&wd>=210&&Ln>=600)for(let t0=rr(300,500);t0<Ln-300;t0+=rr(700,1100)){if(R()>.5)continue;const sd0=R()<.5?-1:1;
   {const u=sn5(rr(46,58)),reach=wd-X_TO-95,sh=xCrShape(K,Math.max(1,Math.floor(reach/u))),ext=sh.reduce((a,c)=>[Math.max(a[0],c[0]),Math.max(a[1],c[1])],[0,0]);   // casse a forma di lettera contro un muro
    if(!nearI(t0)&&(ext[1]+1)*u<=reach){const v0=wd/2-X_TO/2-14-u/2,pts=sh.map(c=>at(t0+(c[0]-ext[0]/2)*u,sd0*(v0-c[1]*u)));if(pts.every(q=>xPut(K,S,'crate',q[0],q[1],u-4,u-4,an,{dry:1,gap:14}))){for(const q of pts)xPut(K,S,'crate',q[0],q[1],u-4,u-4,an,{force:1});isl.push([t0,(ext[0]+1)*u/2+70])}}}
  }
  if(wd>=200&&Ln>=300){let k=0;for(let t=T2?cT0:rr(60,sp*.6);t<Ln-60;t+=sp,k++){if(nearI(t))continue;
    if(!T2)for(const sd of two?[-1,1]:[k%2?-1:1])for(const dt of[0,30,-30,60,-60]){const q=at(t+dt,sd*off);if(xPut(K,S,pk,q[0],q[1],ps,ps,an,{wl:1,gap:6}))break}   // davanti a un varco il pilastro scivola di lato: il varco resta incorniciato
    const tm=t+sp/2;if(tm>Ln-80||nearI(tm))continue;   // a metà fra due pilastri: un riparo
    if(th==4&&k%3==1&&wd>=260){const ro=wd/2-X_TO/2-31;let n2=0;for(const sd of[-1,1]){const q=at(tm,sd*ro);const o=xPut(K,S,'partition',q[0],q[1],X4_PT,62,an,{wl:1,gap:4});if(o){o.hp=320;n2++}}   // base sottomarina: telaio stagno, due costole dai muri (al centro resta il passaggio)
     if(n2){const q=at(tm,0);xDec(K,'hazmark',q[0],q[1],wd-X_TO-130,16,an+XH)}continue}
    for(const sd of two?[-1,1]:[k%2?1:-1]){if(R()>(two?.42:.5))continue;const it=pick(LL),dep=Math.min(it[2],wd>=280?60:40),len=Math.min(rr(it[1]*.8,it[1]),sp-ps-40);if(len<36)continue;
     let back=wd>=330&&R()<.45?78:0;if(wd-X_TO-2*(14+dep+back)<110)back=0;if(wd-X_TO-2*(14+dep)<100)continue;
     const o2=wd/2-X_TO/2-12-dep/2-back,q=at(tm,sd*o2);xPut(K,S,it[0],q[0],q[1],len,dep,an,{gap:10})}}}
  if(th==4&&Ln>=500)for(let t=rr(220,420);t<Ln-220;t+=rr(650,1000)){if(R()<.45)continue;const q=at(t,0);if(S.ovl.some(o=>xDep(o.g,q[0],q[1])>-120))continue;xDec(K,'glassfloor',q[0],q[1],rr(130,200),wd*.42,an)}   // vetri nel pavimento dei tubi: sotto si vede il fondale
  for(let i=0;i<Ln/600;i++){const q=at(rr(.1,.9)*Ln,rr(-wd*.25,wd*.25));xDec(K,pick(XDEC_C[th]),q[0],q[1],rr(50,90),rr(40,70),xMG(th)?an+(R()<.5?0:Math.PI):R()*TAU)}   // megastruttura e astronave: griglie allineate al corridoio
  return}
 if(xMG(th)){xFurnishM(K,S,B,{W,H,cx,cy,big,Bw,Bh},free,n0);return}   // megastruttura (XM) e astronave (XM3): la luce viene dai lampioni sugli ostacoli
 {const st=Math.max(360,big/2.2);for(let x=B[0]+st/2;x<B[2];x+=st)for(let y=B[1]+st/2;y<B[3];y+=st)if(xDep(S.g,x,y)>80)xLight(K,x,y,rr(170,240),R()<.8?'#fff2d0':P.glow,.13)}
 // quasi ogni stanza ha un edificio basso (ufficio, cabina, magazzino chiuso) in un angolo: servono alle missioni, alle armerie e ai civili
 // disegni a terra del tema (macchie, griglie, botole, tappeti, scritte...)
 // disegni "di progetto" (tappeti, loghi, griglie, botole...) allineati e nelle copie speculari; sporco (macchie, ruggine, cavi) dove capita
 {const DIRT=['stain','puddle','rust','scorch','cable'],RUG=['uffici','ufficio','alloggi','cabina','atrio','olo','osservatorio','mensa'],okD=q=>q!='rug'&&q!='mosaic',DL=XDEC[th].filter(okD);
 // disegni a tema del tipo di stanza (allineati e nelle copie speculari)
 {const TL=XDECR[S.rt];if(S.k=='r'&&TL){for(let i=0,n=clamp(Math.round(W*H/180000)+1,1,5),t=0;i<n&&t<n*5;t++){const k=pick(TL);if(k=='pipes'){if(!S.pp){S.pp=1;xDec(K,'pipes',cx,cy,W,H,Math.abs(Math.cos(S.oa||0))>.7?0:Math.PI/2)}i++;continue}
   const x=rr(B[0],B[2]),y=rr(B[1],B[3]),dw=rr(80,170),dh=rr(60,130);if(xDep(S.g,x,y)<Math.max(dw,dh)/2+30)continue;i++;const a=S.oa||0;xDec(K,k,x,y,dw,dh,a);
   for(const f of S.symT){const q=f(x,y,a);if(xDep(S.g,q[0],q[1])>=Math.max(dw,dh)/2+30)xDec(K,k,q[0],q[1],dw,dh,q[2])}}}}
 if(S.k=='r'&&big>=500&&R()<.5){const t=pick(DL.filter(q=>!DIRT.includes(q)));if(t&&apo>200)xDec(K,t,cx,cy,Math.min(apo*.9,rr(160,260)),Math.min(apo*.7,rr(120,200)),S.oa||0)}
 for(let i=0,n=clamp(Math.round(W*H/220000)+2,2,7),t=0;i<n&&t<n*4;t++){const x=rr(B[0],B[2]),y=rr(B[1],B[3]),dw=rr(70,150),dh=rr(60,120),k=pick(DL),dirt=DIRT.includes(k);if(xDep(S.g,x,y)<Math.max(dw,dh)/2+30)continue;i++;
  if(dirt){xDec(K,k,x,y,dw,dh,R()*TAU);continue}const a=S.oa||0;xDec(K,k,x,y,dw,dh,a);
  for(const f of S.symT){const q=f(x,y,a);if(xDep(S.g,q[0],q[1])>=Math.max(dw,dh)/2+30)xDec(K,k,q[0],q[1],dw,dh,q[2])}}}
 // divisori: nelle sale grandi qualche muro interno parte da una parete e crea nicchie e angoli (mai sulle corsie)
 if(free&&!S.oct&&!S.cham&&big>=700&&R()<.45)for(let i=0,n=K.ri(1,2);i<n;i++){const side=K.ri(0,3),hor=side<2,Lp=(hor?H:W)*rr(.28,.45),tt=rr(.25,.75),
   x=hor?b[0]+W*tt:side==2?b[0]+Lp/2:b[2]-Lp/2,y=hor?(side==0?b[1]+Lp/2:b[3]-Lp/2):b[1]+H*tt;
   const pw=hor?28:Lp,ph=hor?Lp:28,MX=hor?[[2*cx-x,y]]:[[x,2*cy-y]];   // divisori a coppie speculari (nicchie gemelle)
   if(xPut(K,S,'partition',x,y,pw,ph,0,{wl:1,gap:0}))for(const q of MX)xPut(K,S,'partition',q[0],q[1],pw,ph,0,{wl:1,gap:0})}
 if(free&&S.oct&&S.R>330&&R()<.42){const r=S.R*.924*rr(.26,.38);if(xPut(K,S,'shaft',cx,cy,r*2,r*2,0,{nl:1,gap:30})&&S.site){const a=R()*TAU,q=S.site;q.x=cx+Math.cos(a)*(r+110);q.y=cy+Math.sin(a)*(r+110);q.r=Math.min(q.r,S.R*.924-r-80)}}   // il sito si sposta nell'anello   // pozzo al centro: la sala diventa un anello
 // edificio basso in un angolo (prima dei livelli: soppalchi, fosse e pedane gli girano attorno)
 if(free&&big>=(th==3||th==2||S.oct?420:600)&&R()<(th==3||th==2?.88:.7))xCabinSide(K,S,B,th==3&&R()<.3?'bridge':'cabin',172,250,{tw:R()<(Math.hypot(cx-START[0],cy-START[1])>3000?(th==3?.95:.8):.5)?1:0});
 const PZ=xPZ(K,cx,cy,54);let pil=0;if(S.k=='r'&&!S.st&&big>=480&&R()<(S.oct?.55:.5))pil=xPilasters(K,S,PZ.k,PZ.s,S.oct?rr(130,200):rr(190,215));
 // livelli: soppalco lungo un muro, fossa al centro, pedana tonda nelle sale rotonde
 if(free&&!S.kp&&S.k=='r'&&big>=420){const u=R(),sh=m.obs.slice(n0).some(o=>o.th=='shaft');if(S.oct&&!sh&&u<.45)xLevels(K,S,B,'dais');else if(!S.oct&&big>=820&&u<.25)xLevels(K,S,B,'pit');else if(u<.6)xLevels(K,S,B,'balcony')}
 // contenuti divisi: nelle sale lunghe la ricetta prende una parte, l'altra parte ha un uso diverso (asimmetria)
 const SPX=['comando','baia','reattore','acquario','moonpool','hangar','dock','ponte','motori'],dz=Z=>({W:Z[2]-Z[0],H:Z[3]-Z[1],cx:(Z[0]+Z[2])/2,cy:(Z[1]+Z[3])/2,big:Math.min(Z[2]-Z[0],Z[3]-Z[1]),Bw:Z[2]-Z[0],Bh:Z[3]-Z[1]});
 let B1=B,B2=null;
 if(free&&!S.oct&&big>=520&&Math.max(Bw,Bh)>=900&&R()<.55&&!SPX.includes(S.rt)){const hor=Bw>=Bh,f=rr(.45,.68),fs=R()<.5,L0=hor?Bw:Bh,cut=(hor?B[0]:B[1])+L0*(fs?f:1-f);
  const a=hor?[B[0],B[1],cut-30,B[3]]:[B[0],B[1],B[2],cut-30],c=hor?[cut+30,B[1],B[2],B[3]]:[B[0],cut+30,B[2],B[3]];B1=fs?a:c;B2=fs?c:a}
 if(B2)S.symT=xSym(K,S,Bw>=Bh?'y':'x');   // sala divisa: le copie restano nella propria metà
 if(free&&!B2&&!S.oct&&!S.nk&&big>=720&&R()<.3)xColonnade(K,S,B,PZ.k,Math.max(40,PZ.s));   // sala colonnata
 const F=XF[S.rt]||(W<560||H<560?XF.ripostiglio:XF.magazzino);F(K,S,B1,P,B1===B?{W,H,cx,cy,big,Bw,Bh}:dz(B1));
 if(B2){const alt=XRT[th].map(t=>t[0]).filter(t=>t!==S.rt&&XF[t]&&!SPX.includes(t));if(alt.length)XF[pick(alt)](K,S,B2,P,dz(B2))}
 // quanto è piena la stanza (superficie degli oggetti messi finora / superficie della stanza)
 const occ=()=>{let a=0;for(let i=n0;i<m.obs.length;i++){const o=m.obs[i];if(o.th!='wall'&&o.th!='bwall')a+=o.w*o.h}return a/Math.max(1,xArea(S.g))};
 if(!free){if(!S.st&&!pil&&big>=600&&occ()<.06)xPilasters(K,S,PZ.k,PZ.s,S.oct?rr(150,200):rr(190,215));return}   // stanze delle missioni: solo pilastri ai muri
 // riempimento: oggetti del tema sparsi e lungo i muri (le stanze non restano mai vuote)
 for(let i=0,n=big>900?ri(1,3):big>560?ri(0,2):R()<.4?1:0;i<n;i++){if(XRSET[S.rt]&&th==2)xSets(K,S,B,XRSET[S.rt],1);else xCluster(K,S,B,pick(XCL[th]))}
 const PL=S.lead||S;if(!PL.palX)PL.palX=K.shuf(XFILL[th].slice()).slice(0,R()<.55?1:2);const L=PL.palX,goal=clamp(Math.round(Bw*Bh/60000)+2,3,26);let got=0;   // tavolozza della stanza: 1-2 tipi, non tutto il catalogo
 const SETS=XRSET[S.rt];if(SETS&&th==2){got+=xSets(K,S,B,SETS,Math.max(1,Math.round(goal/4)))*4}   // stanze civili: insiemi d'arredo, non oggetti a caso
 for(let i=0;i<goal*5&&got<goal;i++){const t=pick(SETS&&th==2?XWALLF:L);got+=xScat(K,S,B,t[0],1,t[1],t[2],t[3],t[4],{rot:t[5]})}
 for(let i=0,n=big>520?2:1;i<n;i++){const t=pick(XWALL[th]);xAlong(K,S,t[0],t[1],t[2],t[3],Math.min(.85,t[4]+.25))}
 // stanze ancora semivuote: pilastri a ritmo fisso, qualche gruppo in più, un soppalco o una fila ordinata in mezzo
 if(big<500&&occ()<.12){const t=pick(XWALL[th]);xAlong(K,S,t[0],Math.min(t[1],120),Math.min(t[2],50),t[3]*.5,.9);   // stanza piccola: qualcosa lungo i muri e un pezzo o due
  for(let i=0;i<8&&occ()<.12;i++){const q=pick(L);xScat(K,S,B,q[0],1,Math.min(q[1],90),Math.min(q[2],90),Math.min(q[3],70),Math.min(q[4],70),{rot:q[5]})}}
 if(big>=500&&occ()<.12){if(!pil)xPilasters(K,S,PZ.k,PZ.s,S.oct?rr(140,200):rr(190,215));
  for(let i=0;i<5&&occ()<.12;i++){if(XRSET[S.rt]&&th==2)xSets(K,S,B,XRSET[S.rt],1);else xCluster(K,S,B,pick(XCL[th]))}
  if(occ()<.07&&R()<.6)xLevels(K,S,B,'balcony');
  for(let i=0;i<14&&occ()<.11;i++){const t=pick(XRSET[S.rt]&&th==2?XWALLF:L);xScat(K,S,B,t[0],2,t[1],t[2],t[3],t[4],{rot:t[5]})}}
 // moduli rotondi: corona lungo la parete tra un tubo e l'altro, poi un secondo giro più interno di oggetti piccoli
 if(S.oct){for(let k=0;k<2;k++){const t=pick(XWALL[th]);xAlong(K,S,t[0],Math.min(t[1],110),t[2],t[3]*.6,.9)}
  const sm=L.filter(t=>Math.max(t[1],t[2])<=90);if(sm.length)for(let k=0;k<2;k++){const t=pick(sm);xRing(K,S,cx,cy,S.R*rr(.42,.55),ri(5,9),t[0],t[2],t[4]||t[2],{face:1})}}}
// oggetti di riempimento per tema: [tipo, larghezza min, max, altezza min, max, ruotato a caso]
const XFILL={2:[['crates',100,150,70,110],['barrels',70,100,70,90],['planter',70,120,40,60],['cooler',70,80,70,80],['crate',40,60,40,60,1],['sofa',90,120,40,48],['vend',70,80,40,46],['copier',60,70,48,56],['shelf',140,160,44,50]],
 3:[['crates',100,150,70,110],['barrels',70,100,70,90],['crate',40,60,40,60,1],['gen',120,150,70,90],['cont',140,180,56,64],['ammo',56,70,38,44,1],['drone',50,64,0,0],['cargo',90,110,90,110],['fuelc',120,150,56,64],['torp',140,170,52,60]],
 4:[['crates',100,140,70,100],['barrels',70,100,70,90],['pump',80,90,80,90],['tank',80,110,80,110],['crate',40,60,40,60,1],['o2',80,100,56,64],['valve',44,56,0,0],['sample',56,70,0,0],['compressor',90,110,64,72],['suits',120,140,40,46]]};
// riempimento ordinato delle stanze civili (piante, armadi, distributori)
const XWALLF=[['planter',90,120,44,56],['pot',40,52,0,0],['vend',70,80,40,46],['shelf',140,160,44,50]];
// oggetti lungo le pareti dei corridoi: [tipo, lunghezza, profondità]
// ripari contro i muri dei corridoi: [tipo, lunghezza, profondità] · isole al centro dei corridoi larghi: [tipo, lungo l'asse, di traverso]
const XCOV={2:[['console',96,36],['crates',100,64],['barrier',120,36],['planter',110,44],['vend',70,44],['locker',100,30],['bench2',110,28],['copier',64,52]],
 3:[['console',96,36],['crates',100,64],['barrier',120,36],['ammo',64,42],['fuelc',120,56],['cargo',90,80],['locker',100,30],['rack',110,34]],
 4:[['console',96,36],['crates',100,64],['barrier',120,36],['o2',90,56],['compressor',96,62],['locker',100,30],['suits',110,40],['valve',48,48]]};
const XISL={2:[['planter',150,50],['holo',90,90],['statue',80,80],['console',110,40],['crates',110,70],['sculpt',90,90]],
 3:[['barrier',140,38],['crates',110,70],['cargo',90,90],['console',110,40],['drone',60,60],['torp',150,56]],
 4:[['hydro',150,56],['tank',90,90],['console',110,40],['crates',110,70],['sample',70,70],['pump',80,80]]};
const XCOR={2:[['vend',70,26],['bench2',120,26],['bigscreen',160,18],['locker',110,26],['books',130,26]],
 3:[['locker',110,26],['ammo',70,26],['fuelc',140,26],['rack',120,26],['crate',50,26],['o2',90,26]],
 4:[['o2',90,26],['locker',110,26],['valve',40,40],['suits',120,26],['crate',50,26],['hydro',140,26]]};
// disegni a terra per tema (stanze) e per i corridoi
// disegni a tema per tipo di stanza
const XDECR={reattore:['haz','grid','conduit','pipes','vent'],comando:['grid','numbers','arrows','conduit'],sicurezza:['haz','grid','numbers'],macchine:['pipes','haz','grid','stain','conduit'],
 server:['cable','grid','vent','conduit'],server2:['cable','vent'],lab:['hatch','grid','vent'],magazzino:['numbers','grid','arrows','stain'],hangar:['haz','arrows','numbers'],baia:['haz','arrows','numbers'],
 ripostiglio:['stain','vent','numbers'],bagni:['drain','puddle'],mensa:['stain','grid'],atrio:['skylight','grid'],olo:['skylight'],uffici:['cable','grid'],ufficio:['cable'],
 osservatorio:['skylight'],armeria:['haz','numbers','grid'],infermeria:['grid','drain'],stiva:['numbers','grid','arrows'],motori:['pipes','haz','conduit'],ponte:['grid','conduit'],pompe:['pipes','drain','puddle'],
 alloggi:['stain'],cabina:['stain'],capsule:['haz','arrows']};
const XDEC={2:['skylight','stain','vent','cable','arrows','grid'],3:['numbers','grid','conduit','vent','hatch','scorch','stain','cable'],4:['puddle','drain','glassfloor','rust','vent','hatch','cable','stain']},
 XDEC_C={2:['arrows','vent','stain'],3:['conduit','arrows','vent','hatch','hullplate'],4:['puddle','drain','vent','rust','hatch','cable']};
// oggetti lungo i muri per tema: [tipo, lunghezza, profondità, distanza, probabilità]
const XWALL={2:[['locker',110,34,50,.4],['planter',80,40,180,.35],['cooler',80,70,120,.3],['shelf',160,46,80,.35],['vend',70,44,90,.35],['books',160,40,60,.4],['bigscreen',180,22,160,.35],['arcade',56,60,60,.35]],
 3:[['locker',110,34,50,.45],['rack',120,34,70,.35],['crates',110,70,90,.35],['torp',160,56,80,.35],['fuelc',140,60,80,.35],['mechbay',120,120,120,.3],['cryo',60,110,50,.35]],
 4:[['locker',110,34,50,.45],['crates',110,70,90,.35],['hydro',160,56,80,.3],['o2',100,60,70,.4],['suits',130,44,60,.4],['compressor',100,70,90,.35]]};

// ricette di arredo: ogni tipo di stanza ha il suo carattere (oggetti grandi, varie file, un pezzo centrale)
const XF={
 hangar(K,S,B,P,d){xDec(K,'pad',d.cx,d.cy,Math.min(d.Bw,d.Bh)*.7,0);xScat(K,S,B,K.m.th==4?'minisub':K.m.th==3?'drone':'robot',2,K.m.th==4?200:50,K.m.th==4?230:64,K.m.th==4?90:0,K.m.th==4?100:0,{rot:1,nb:1});xAlong(K,S,K.m.th==4?'o2':'fuelc',120,56,120,.35,{nb:1});const nb={nb:1};S.ex.push([START[0]+96,START[1]+96,250],[EXT[0],EXT[1],EXT_R*.6]);   // spazio per chi arriva
  xAlong(K,S,'crates',120,70,90,.5,nb);xAlong(K,S,'barrels',70,70,140,.25,nb);
  for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,r=Math.min(d.W,d.H)*.42;xPut(K,S,'crates',d.cx+Math.cos(a)*r,d.cy+Math.sin(a)*r,K.rr(90,130),K.rr(70,100),0,nb)}
  // deposito (armeria della partenza): una cabina vicino a un lato
  const b=S.g.bb;for(const[x,y]of[[b[2]-150,d.cy],[b[0]+150,d.cy],[d.cx,b[3]-140],[d.cx,b[1]+140]]){if(xPut(K,S,'cabin',x,y,170,140,0,{force:false,gap:20,tw:0,nb:1}))break}
  if(K.m.th==3)XF.shuttles(K,S,B,2,{nb:1})},
 dock(K,S,B,P,d){XF.hangar(K,S,B,P,d)},
 shuttles(K,S,B,n,o){for(let i=0;i<n;i++)xScat(K,S,B,'shuttle',1,190,240,110,130,Object.assign({rot:1},o||{}))},
 atrio(K,S,B,P,d){const st=K.rr(300,380);for(let x=B[0]+st*.5;x<B[2]-st*.3;x+=st)for(let y=B[1]+st*.5;y<B[3]-st*.3;y+=st)xPut(K,S,'pillar',x,y,44,44,0,{gap:30});
  const c=K.pick(['fountain','statue','sculpt','holo']);xPut(K,S,c,d.cx,d.cy,c=='fountain'?K.rr(170,230):c=='statue'?110:K.rr(110,150),0,0,{gap:40,nl:1});
  xScat(K,S,B,'planter',4,90,140,50,70);xSets(K,S,B,['lounge1','lounge2','lounge3','lounge4','lounge5'],3);xScat(K,S,B,'pot',4,40,56,0,0);xAlong(K,S,'bigscreen',180,22,200,.4);
  if(d.big>900)xCabin(K,S,[B[0],B[1],B[0]+d.Bw*.4,B[1]+d.Bh*.4],'cabin',180,260,{tw:K.R()<.6?1:0})},
 uffici(K,S,B,P,d){if(d.big>760)xCabin(K,S,B,'cabin',170,260,{tw:1});if(K.R()<.6)xSetGrid(K,S,B,'desk2',220,300);else xSets(K,S,B,['desk1','desk2','meet'],6,1);xAlong(K,S,'books',150,40,60,.45);xAlong(K,S,'copier',64,52,160,.3);xScat(K,S,B,'pot',4,40,56,0,0)},
 server(K,S,B,P,d){const dir=d.Bw>d.Bh?0:1;if(d.big>900&&K.R()<.6)xCabin(K,S,B,'core',220,300,{tw:1});xRows(K,S,B,'server',46,K.rr(170,250),50,165,dir);xAlong(K,S,'cooler',80,80,80,.5);xScat(K,S,B,'robot',1,46,52,0,0)},
 magazzino(K,S,B,P,d){const dir=d.Bw>d.Bh?1:0;if(K.R()<.5)xRows(K,S,B,'shelf',50,K.rr(200,320),70,170,dir);else xGrid(K,S,B,'crates',K.rr(100,150),K.rr(90,140),K.rr(240,300),{},30);
  xAlong(K,S,'barrels',70,70,100,.4);xScat(K,S,B,'cont',2,150,190,60,70);xScat(K,S,B,'cargo',3,90,120,90,120);if(d.big>800&&K.R()<.6)xCabin(K,S,B,'cabin',160,220,{tw:0})},
 stiva(K,S,B,P,d){const dir=d.Bw>d.Bh?1:0;if(d.big>820)XF.shuttles(K,S,B,K.ri(1,2));xRows(K,S,B,'cont',60,K.rr(150,190),40,170,dir);xAlong(K,S,'crates',110,70,80,.45);xScat(K,S,B,'cargo',3,90,120,90,120);xScat(K,S,B,'mechbay',1,120,130,120,130);if(d.big>800&&K.R()<.5)xCabin(K,S,B,'lift',170,230,{tw:0})},
 lab(K,S,B,P,d){if(d.big>700)xCabin(K,S,B,'cabin',180,250,{tw:1});
  if(S.oct)xRing(K,S,d.cx,d.cy,S.R*.52,K.ri(6,9),'pod',56,56);else xRows(K,S,B,'bench',60,K.rr(160,230),70,180,d.Bw>d.Bh?1:0);
  xScat(K,S,B,'tank',3,70,110,0,0);xAlong(K,S,'pod',60,60,90,.4);xScat(K,S,B,'sample',3,56,70,0,0);xScat(K,S,B,'robot',1,46,52,0,0)},
 macchine(K,S,B,P,d){const st=K.rr(300,380);for(let x=B[0]+st*.5;x<B[2];x+=st)for(let y=B[1]+st*.5;y<B[3];y+=st){if(K.R()<.45)xPut(K,S,'turbine',x,y,K.rr(140,200),0,0);else xPut(K,S,'gen',x,y,K.rr(130,170),K.rr(80,110),K.R()<.5?0:Math.PI/2)}
  xDec(K,'pipes',d.cx,d.cy,d.W,d.H,0);xAlong(K,S,'barrels',70,70,120,.35);xScat(K,S,B,'compressor',2,90,110,64,72)},
 motori(K,S,B,P,d){const n=Math.max(1,Math.round(Math.max(d.Bw,d.Bh)/520)),hor=d.Bw>=d.Bh,r=Math.min(170,Math.min(d.Bw,d.Bh)*.3);
  for(let i=0;i<n;i++){const f=(i+.5)/n;xPut(K,S,'engine',hor?B[0]+d.Bw*f:d.cx,hor?d.cy:B[1]+d.Bh*f,r*2,r*2,0,{gap:30})}xDec(K,'pipes',d.cx,d.cy,d.W,d.H,0);xAlong(K,S,'gen',140,70,120,.4);xAlong(K,S,'fuelc',140,60,100,.35)},
 pompe(K,S,B,P,d){if(S.oct)xRing(K,S,d.cx,d.cy,S.R*.45,K.ri(5,8),'pump',96,96);else xGrid(K,S,B,'pump',96,96,K.rr(230,280));xPut(K,S,'tank',d.cx,d.cy,140,140,0,{nl:1});xDec(K,'pipes',d.cx,d.cy,d.W,d.H,0);xScat(K,S,B,'valve',3,44,56,0,0);xScat(K,S,B,'compressor',1,90,110,64,72)},
 serra(K,S,B,P,d){const dir=d.Bw>d.Bh?1:0;if(K.m.th==2){xGarden(K,S,B,d);if(K.R()<.45)xRows(K,S,B,'planter',90,K.rr(220,320),90,190,dir)}
  else if(S.oct)xRing(K,S,d.cx,d.cy,S.R*.5,K.ri(6,10),'hydro',60,170,{face:1});else xRows(K,S,B,'hydro',60,K.rr(200,300),60,170,dir)},
 mensa(K,S,B,P,d){const big=d.big>=420;if(!xSetGrid(K,S,B,big&&K.R()<.6?'dine2':big?'dine':'dine0',big?470:220,big?210:180))xSets(K,S,B,['dine','dine0'],4,1);xAlong(K,S,K.m.th==2?'vend':'cooler',72,48,100,.45)},
 olo(K,S,B,P,d){xPut(K,S,'holo',d.cx,d.cy,K.rr(150,210),0,0,{gap:40,nl:1});xAlong(K,S,'arcade',56,60,70,.5);const r=Math.min(d.Bw,d.Bh)*.38;xRing(K,S,d.cx,d.cy,r,K.ri(6,8),'pillar',40,40,{gap:30});xSets(K,S,B,['lounge1','lounge2','lounge4','lounge5'],2)},
 osservatorio(K,S,B,P,d){xPut(K,S,'holotable',d.cx,d.cy,150,150,0,{nl:1});xScat(K,S,B,'pot',4,40,56,0,0);xRing(K,S,d.cx,d.cy,(S.R||d.big/2)*.45,K.ri(5,7),'sofa',110,44,{face:1})},
 sicurezza(K,S,B,P,d){xCabin(K,S,B,'cabin',160,220,{tw:0});xScat(K,S,B,'barrier',5,120,160,34,40,{rot:1});xAlong(K,S,'rack',120,34,60,.45);xScat(K,S,B,'drone',2,50,64,0,0);
  const b=S.g.bb;for(const[x,y]of[[b[0]+110,b[1]+110],[b[2]-110,b[3]-110]])K.m.tspots.push([x,y])},
 armeria(K,S,B,P,d){xRows(K,S,B,'rack',40,K.rr(150,210),60,160,d.Bw>d.Bh?1:0);xAlong(K,S,'torp',160,56,80,.4);xScat(K,S,B,'ammo',4,56,70,38,44,{rot:1});xScat(K,S,B,'mechbay',1,120,130,120,130);if(d.big>700)xCabin(K,S,B,'cabin',160,220,{tw:0})},
 alloggi(K,S,B,P,d){if(S.oct)xRing(K,S,d.cx,d.cy,S.R*.5,K.ri(6,9),'bunk',110,46,{face:1});else xGrid(K,S,B,'bunk',110,46,K.rr(150,190));xAlong(K,S,'locker',110,34,40,.6);xScat(K,S,B,'ctable',1,90,100,0,0)},
 infermeria(K,S,B,P,d){xGrid(K,S,B,'medbed',110,50,K.rr(170,210));xScat(K,S,B,'pod',3,60,60,0,0);xAlong(K,S,'cryo',60,110,50,.4);if(d.big>760)xCabin(K,S,B,'cabin',160,220,{tw:1})},
 reattore(K,S,B,P,d){const r=Math.min(190,Math.min(d.Bw,d.Bh)*.24);let rc=null;for(const k of[1,.82,.66,.52])if(!rc)rc=xPut(K,S,'reactor',d.cx,d.cy,r*2*k,r*2*k,0,{gap:30,tw:1,hm:4,nb:1,nl:1});if(rc)rc.sp=1;
  for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4,rr2=r+200;xPut(K,S,'pillar',d.cx+Math.cos(a)*rr2,d.cy+Math.sin(a)*rr2,50,50,0,{gap:30})}
  xRing(K,S,d.cx,d.cy,r+330,K.ri(4,6),'console',110,46,{face:1});xDec(K,'haz',d.cx,d.cy,r*2+120,0,0,{ring:1});
  const mk=K.m.th==3?['gen','engine','turbine','fuelc']:K.m.th==4?['pump','tank','turbine','compressor']:['gen','turbine','cooler','compressor'];   // macchinari attorno al nucleo e lungo i muri
  xRing(K,S,d.cx,d.cy,r+215,K.ri(5,8),K.pick(mk),96,70,{face:1});xAlong(K,S,'gen',140,70,90,.65);xAlong(K,S,K.pick(['cooler','compressor']),86,72,110,.55);
  for(let i=0;i<4;i++){const a=i*Math.PI/2;xDec(K,'conduit',d.cx+Math.cos(a)*(r+120),d.cy+Math.sin(a)*(r+120),220,40,a)}xScat(K,S,B,K.pick(mk),3,80,110,60,80)},
 ponte(K,S,B,P,d){xPut(K,S,'holotable',d.cx,d.cy,170,170,0,{gap:40,nl:1});xRing(K,S,d.cx,d.cy,Math.min(d.Bw,d.Bh)*.36,K.ri(6,9),'console',120,44,{face:1});
  if(d.big>800)xCabin(K,S,[B[0],B[1],B[2],B[1]+d.Bh*.35],'bridge',200,280,{tw:1})},
 acquario(K,S,B,P,d){const r=Math.min(240,(S.R||d.big/2)*.42);const aq=xPut(K,S,'aquarium',d.cx,d.cy,r*2,r*2,0,{tw:1,gap:40,nl:1});xScat(K,S,B,'pot',4,40,56,0,0);if(aq)aq.sp=1;xRing(K,S,d.cx,d.cy,r+150,K.ri(5,7),'sofa',100,40,{face:1})},
 moonpool(K,S,B,P,d){const r=Math.min(230,(S.R||d.big/2)*.38);K.m.lakes.push(blob(K.R,d.cx,d.cy,r));S.ex.push([d.cx,d.cy,r+80]);xDec(K,'pool',d.cx,d.cy,r*2,r*2,0);xScat(K,S,B,'minisub',1,200,230,90,100,{rot:1});xAlong(K,S,'suits',130,44,60,.5);
  xRing(K,S,d.cx,d.cy,r+130,K.ri(4,6),'crates',100,80,{});xRing(K,S,d.cx,d.cy,r+120,2,'pump',80,80)},
 comando(K,S,B,P,d){xPut(K,S,'cabin',d.cx,d.cy,K.rr(190,250),K.rr(170,230),0,{tw:0,gap:30,nl:1});
  const r=Math.min(d.Bw,d.Bh)*.46;for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;xPut(K,S,'barrier',d.cx+Math.cos(a)*r,d.cy+Math.sin(a)*r,120,36,a+Math.PI/2)}
  xAlong(K,S,'console',120,44,140,.45);xAlong(K,S,'bigscreen',180,22,90,.45);xRing(K,S,d.cx,d.cy,Math.min(d.Bw,d.Bh)*.3,K.ri(5,8),'console',100,40,{face:1});xAlong(K,S,'rack',110,34,160,.3)},
 baia(K,S,B,P,d){xDec(K,'pad',d.cx,d.cy,Math.min(d.Bw,d.Bh)*.5,0);xAlong(K,S,'crates',120,70,100,.5);xAlong(K,S,'barrels',70,70,160,.3)},
 // stanze piccole
 ripostiglio(K,S,B,P,d){xAlong(K,S,K.m.th==2?'shelf':'crates',K.m.th==2?150:110,K.m.th==2?46:70,30,.85);xScat(K,S,B,'crates',2,80,120,60,90);xScat(K,S,B,'barrels',1,60,80,60,80)},
 ufficio(K,S,B,P,d){if(!xSet(K,S,d.cx,d.cy,(S.oa||0)+K.ri(0,3)*Math.PI/2,'desk1'))xSets(K,S,B,['desk1'],1);xAlong(K,S,'books',140,40,40,.7);xScat(K,S,B,'pot',2,40,50,0,0);xScat(K,S,B,'copier',1,60,70,48,56)},
 bagni(K,S,B,P,d){xAlong(K,S,'stall',74,80,10,.9);xAlong(K,S,'sink',130,44,60,.5)},
 server2(K,S,B,P,d){xRows(K,S,B,'server',46,K.rr(130,200),50,160,d.Bw>d.Bh?0:1);xAlong(K,S,'cooler',80,80,60,.5)},
 cabina(K,S,B,P,d){xAlong(K,S,'bunk',110,46,40,.7);xAlong(K,S,'locker',110,34,40,.6);xScat(K,S,B,'ctable',1,80,90,0,0)},
 capsule(K,S,B,P,d){xAlong(K,S,'cryo',64,116,30,.9);xScat(K,S,B,'o2',1,90,100,56,64)},
 cor(){}};
XF.stiva2=XF.stiva;

// decorazioni del vuoto (generate una volta): nebulose e pianeta nello spazio, banchi di alghe e relitti sul fondale, nuvole sotto la megastruttura
function xVoidDecor(K){const{m,R,rr,ri}=K;m.vdec=[];
 const voidAt=(x,y)=>m.VD[clamp(y/TC|0,0,GH-1)*GW+clamp(x/TC|0,0,GW-1)]===1;
 if(m.th==3){for(let i=0;i<6;i++)m.vdec.push({k:'neb',x:rr(0,WW),y:rr(0,WH),r:rr(900,2200),c:['#5a2a8a','#1a5a7a','#7a2a4a','#2a7a5a'][ri(0,3)],a:rr(.12,.22)});
  for(let t=0;t<200;t++){const x=rr(500,WW-500),y=rr(500,WH-500),r=rr(260,520);let ok=true;for(let a=0;a<8&&ok;a++)if(!voidAt(x+Math.cos(a*.785)*(r+250),y+Math.sin(a*.785)*(r+250)))ok=false;if(ok&&voidAt(x,y)){m.vdec.push({k:'planet',x,y,r,c:['#c97a3a','#3a7ac9','#7ac96a','#b04ac9'][ri(0,3)],ring:R()<.5});break}}}
 if(m.th==4)for(let i=0;i<40;i++){const x=rr(0,WW),y=rr(0,WH);if(voidAt(x,y))m.vdec.push({k:R()<.15?'wreck':'kelp',x,y,r:rr(120,320),a:R()*TAU,s:ri(1,999)})}
 if(m.th==2){
  m.vbg=K.pick(['city','cave','wild','desert']);
  if(m.vbg=='city'){
   for(let i=0;i<14;i++)m.vdec.push({k:'cglow',x:rr(0,WW),y:rr(0,WH),r:rr(600,1300),c:K.pick(['#ff9a3a','#2a88d8','#b04ac9','#2aa89a']),a:rr(.08,.16)});
   for(let i=0;i<10;i++)m.vdec.push({k:'cloud',x:rr(0,WW),y:rr(0,WH),r:rr(600,1400),c:'#8aa0c0',a:rr(.05,.1)})}
  else if(m.vbg=='cave'){
   for(let i=0;i<12;i++){const x=rr(0,WW),y=rr(0,WH),r=rr(180,380);m.vdec.push({k:'cpool',x,y,r,b:blob(R,x,y,r),s:ri(1,999)})}
   for(let i=0;i<16;i++)m.vdec.push({k:'crys',x:rr(0,WW),y:rr(0,WH),r:rr(130,260),c:K.pick(['#5cf2ff','#b06aff','#ff9a3a','#6effa0']),s:ri(1,999)});
   for(let i=0;i<8;i++)m.vdec.push({k:'cloud',x:rr(0,WW),y:rr(0,WH),r:rr(500,1100),c:'#5a6470',a:rr(.05,.09)})}
  else if(m.vbg=='wild'){
   m.vwild=R()<.35?1:0;
   for(let k=0,nr=ri(1,2);k<nr;k++){const hz=R()<.5,a0=hz?[0,rr(800,WH-800)]:[rr(800,WW-800),0],a1=hz?[WW,rr(800,WH-800)]:[rr(800,WW-800),WH],
     L=Math.hypot(a1[0]-a0[0],a1[1]-a0[1]),nx=-(a1[1]-a0[1])/L,ny=(a1[0]-a0[0])/L,ph=R()*TAU,am=rr(180,360),pts=[];
    for(let i=0;i<=48;i++){const t=i/48,o=Math.sin(t*7+ph)*am+Math.sin(t*17+ph*2)*am*.25;pts.push([a0[0]+(a1[0]-a0[0])*t+nx*o,a0[1]+(a1[1]-a0[1])*t+ny*o])}
    m.vdec.push({k:'wriv',pts,w:rr(70,120)})}
   for(let i=0;i<14;i++){const x=rr(0,WW),y=rr(0,WH),r=rr(180,380);m.vdec.push({k:'wglade',x,y,r,b:blob(R,x,y,r),s:ri(1,999)})}
   for(let i=0;i<10;i++)m.vdec.push({k:'cloud',x:rr(0,WW),y:rr(0,WH),r:rr(550,1200),c:'#cbe0d8',a:rr(.05,.1)})}
  else{
   for(let i=0;i<16;i++){const x=rr(0,WW),y=rr(0,WH),r=rr(160,380);m.vdec.push({k:'mesa',x,y,r,b:blob(R,x,y,r),cr:R()<.3,s:ri(1,999)})}
   for(let i=0;i<10;i++)m.vdec.push({k:'cloud',x:rr(0,WW),y:rr(0,WH),r:rr(600,1300),c:'#d8b078',a:rr(.06,.12)})}
 }}
