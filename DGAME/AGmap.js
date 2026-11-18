'use strict';
/* AIRGRUNT · AGmap.js — generazione del MONDO (solo dati, nessun disegno). Tutto deriva dal seed: host e client ottengono la stessa mappa.
   FASI, nell'ordine in cui genMap le chiama (ognuna è una funzione a sé, modificabile senza toccare le altre):
   0 planSites    → densità (profilo di AGconf.js) ed elenco dei siti da costruire
   1 genNature    → lato del mare, costa, quote, laghi, fiumi, isole, zone naturali (bosco, roccia, sabbia), alberi e rocce
   2 genSites     → siti PRIMA delle strade: zone tematiche (urbana, industriale, militare, rurale), siti raggruppati nella loro zona e distanziati
                    (densità dal profilo), città a più griglie, complessi recintati, porti, fattorie, ville, cave (ogni sito si prende la propria area)
   3 genSats      → mini-siti satelliti attorno ai siti: posizione e rotazione molto casuali, ognuno col suo varco
   4 genRoads     → strade DOPO i siti: autostrade da bordo a bordo che toccano i siti maggiori, rete di collegamento (albero minimo + anelli),
                    raccordi verso i varchi dei satelliti; nessuna strada attraversa siti o mini-siti (percorsi A* che li aggirano)
   5 genMinor     → il resto: piccoli siti lungo le strade e tessuto urbano attorno alle città
   6 genDetail    → dettagli sul terreno rimasto libero, viali alberati, isole, navi
   7 finishMap    → rampe, cascate, indici degli ostacoli, punti del deathmatch, griglia di navigazione
   Gli oggetti "veri" (edifici, muri, alberi, rocce) vanno in M.obs; tutto ciò che è solo disegnato a terra va descritto in M.flat (lo disegna AGbake.js).
   Coordinate (u,v): u cresce verso il mare, v corre lungo la costa (vedi toUV/fromUV in AGworld.js): così il mare può stare su ogni lato. */
const PAL_ALL=[0,1,2,3,4,5,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28];
const PAL_CITY=[0,1,2,3,4,5,13,14,15,16,13,14,15,17,18,19,20,21,22,23,24,25,26,27,28],PAL_IND=[0,2,3,4,13,22,23,25],PAL_MIL=[3,4],PAL_RES=[1,5,17,20,24,27,21],PAL_COM=[2,13,14,15,18,26,28,22];
const BTOWN=['rect','square','rect','L','T','cross','oct','hex','circle','U','H','Z','tower','quad','fact','U','rect'];
const BPAL_N=BPAL.length;   // palette fisse di AGconf.js: quelle dopo le aggiunge la mappa (tonalità dei quartieri) e si azzerano a ogni mappa nuova
const SPEC={cont:300,silo:650,tank:520,crane:420,ship:1400,carrier:3200,plat:1800,stack:380,cruiser:2800,hatch:900,radar:1100};   // vita di base degli edifici speciali
const ZT=['nature','rural','urban','indus','mil'],ZTI={nature:0,rural:1,urban:2,indus:3,mil:4};                                  // tipo di zona di ogni cella (M.zt)
const BIO={plain:0,forest:1,rock:2,sand:3,urban:4,farm:5};                                                                       // natura del terreno di ogni cella (M.bio)
const rtype=(x,y)=>ZT[M.zt[clamp(y/TC|0,0,GH-1)*GW+clamp(x/TC|0,0,GW-1)]];
// geometria delle forme speciali (le altre le gestisce bgeom di AGworld.js)
function bgeomEx(sh,w,h){const P=prim;let pr;
 switch(sh){
  case'cont':case'plat':case'hatch':pr=[P('r',0,0,w/2,h/2)];break;
  case'silo':{const n=Math.max(1,Math.round(w/h)),r=h/2;pr=[];for(let i=0;i<n;i++)pr.push(P('c',(i-(n-1)/2)*h,0,r));break}
  case'tank':case'stack':pr=[P('c',0,0,Math.min(w,h)/2)];break;
  case'crane':{const a=w/2,b=h/2;pr=[P('r',-(a-b),0,b,b),P('r',a-b,0,b,b)];break}      // due zampe: in mezzo si passa, la trave è sopra
  case'ship':{const a=w/2,b=h/2,k=Math.min(a*.5,b*2.2);pr=[P('g',0,0,0,0,0,[[-a,-b],[a-k,-b],[a,0],[a-k,b],[-a,b]])];break}
  case'carrier':{const a=w/2,b=h/2;pr=[P('g',0,0,0,0,0,[[-a,-b],[a*.55,-b],[a*.78,-b*.75],[a*.96,-b*.35],[a*.96,b*.35],[a*.78,b*.75],[a*.55,b],[-a,b]])];break}
  case'cruiser':{const a=w/2,b=h/2;pr=[P('r',a*.65,0,a*.25,b*.7),P('r',0,0,a*.5,b*.35),P('r',-a*.15,0,a*.25,b*.95),P('r',-a*.7,0,a*.22,b*.6)];break}
  case'radar':{const r=Math.min(w,h)/2;pr=[P('c',0,0,r),P('r',0,r*.55,r*.18,r*.55)];break}
  default:return bgeom(sh,w,h)}
 return geom(pr)}
// rumore continuo ripetibile (0..1): due ottave di valori interpolati su una griglia di passo sc
function mapNoise(s,sc){const n=(s2,c)=>(x,y)=>{const fx=x/c,fy=y/c,i=Math.floor(fx),j=Math.floor(fy),u=fx-i,v=fy-j,a=u*u*(3-2*u),b=v*v*(3-2*v);
  return(hs(i,j,s2)*(1-a)+hs(i+1,j,s2)*a)*(1-b)+(hs(i,j+1,s2)*(1-a)+hs(i+1,j+1,s2)*a)*b},n1=n(s,sc),n2=n(s+1,sc/2.3);
 return(x,y)=>n1(x,y)*.68+n2(x+977,y+311)*.32}

function genMap(seed){
 const K=mapKit(seed);
 planSites(K);genNature(K);genSites(K);genSats(K);genRoads(K);connectRoads(K);missionKeep(K);genMinor(K);genDetail(K);natGen(K);finishMap(K);
 return M}

// ===== attrezzi comuni a tutte le fasi (K = "kit") =====
function mapKit(seed){
 const R=rng(seed),rr=(a,b)=>a+R()*(b-a),ri=(a,b)=>a+(R()*(b-a+1)|0),pick=a=>a[R()*a.length|0],shuf=a=>a.map(o=>[R(),o]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]);
 // profilo di densità: 0 = casuale (scelto dal seed: uguale su host e client), 1..N = PROFILES[n-1]
 const PROF=G.profile===0?PROFILES[(rng((seed^0x9E3779B9)>>>0)()*PROFILES.length)|0]:PROFILES[clamp(G.profile-1,0,PROFILES.length-1)];
 const m=M={seed,profile:PROF.n,side:0,E:new Float32Array((GW+1)*(GH+1)),bio:new Uint8Array(GW*GH),zt:new Uint8Array(GW*GH),own:new Int16Array(GW*GH),
  dec:PROF.dec,lakes:[],isles:[],hills:[],rivers:[],bridges:[],roads:[],links:[],roadCells:new Map(),ramps:[],falls:[],obs:[],blds:[],sites:[],comp:[],
  WM:new Uint8Array(GW*GH),RV:new Uint8Array(GW*GH),WN:new Uint8Array(GW*GH),dm:[],flat:[],junc:[],piers:[],tspots:[],cb:null,ports:[]};
 gClear();BPAL.length=BPAL_N;
 const K={m,R,rr,ri,pick,shuf,PROF,seed,ts:[],later:[],grp:0};
 const cell=K.cell=(x,y)=>clamp(y/TC|0,0,GH-1)*GW+clamp(x/TC|0,0,GW-1);
 const dS=K.dS=(x,y)=>Math.hypot(x-START[0],y-START[1]);
 K.bioAt=(x,y)=>m.bio[cell(x,y)];
 const inMap=K.inMap=(x,y,mg)=>x>mg&&y>mg&&x<WW-mg&&y<WH-mg;
 const lvlFlat=K.lvlFlat=(x,y,r)=>{const l=levelAt(x,y);for(let k=0;k<12;k++){const a=k*.5236,c=Math.cos(a),s=Math.sin(a);if(levelAt(x+c*r,y+s*r)!==l||levelAt(x+c*r*.5,y+s*r*.5)!==l)return false}return true};
 // ----- ostacoli -----
 const addO=K.addO=o=>{o.pal=o.pal||0;m.obs.push(o);gAdd(o);return o};
 // via alberi e rocce da un cerchio / da un rettangolo ruotato (le strade e i siti puliscono così la propria sede)
 const clearNat=K.clearNat=(x,y,r)=>{for(const o of qobs(x,y,r+240,[])){if(o.t=='t'){if(Math.hypot(o.x-x,o.y-y)<r+o.r)o.dead=1}else if(o.ty=='rock'&&bsd(o,x-o.x,y-o.y)<r)o.dead=1}};
 const clearRect=K.clearRect=(x,y,w,h,a,mg)=>{const c=Math.cos(a),s=Math.sin(a);for(const o of qobs(x,y,Math.hypot(w,h)/2+mg+240,[])){if(o.t!='t'&&o.ty!='rock')continue;
   const dx=o.x-x,dy=o.y-y,k=o.r*(o.t=='t'?.7:.9);if(Math.abs(dx*c+dy*s)<w/2+mg+k&&Math.abs(-dx*s+dy*c)<h/2+mg+k)o.dead=1}};
 // scrive tipo di zona, natura del terreno e proprietario (sito) nelle celle di un cerchio / rettangolo
 const put=(i,zt,bio,own)=>{if(m.WM[i])return;if(zt!=null)m.zt[i]=zt;if(bio!=null)m.bio[i]=bio;if(own!=null)m.own[i]=own};
 K.stampC=(x,y,r,zt,bio,own)=>{for(let j=Math.max(0,(y-r)/TC|0);j<=Math.min(GH-1,(y+r)/TC|0);j++)for(let i=Math.max(0,(x-r)/TC|0);i<=Math.min(GW-1,(x+r)/TC|0);i++)if(Math.hypot(i*TC+20-x,j*TC+20-y)<r)put(j*GW+i,zt,bio,own)};
 K.stampR=(x,y,w,h,a,mg,zt,bio,own)=>{const c=Math.cos(a),s=Math.sin(a),r=Math.hypot(w,h)/2+mg;
  for(let j=Math.max(0,(y-r)/TC|0);j<=Math.min(GH-1,(y+r)/TC|0);j++)for(let i=Math.max(0,(x-r)/TC|0);i<=Math.min(GW-1,(x+r)/TC|0);i++){const dx=i*TC+20-x,dy=j*TC+20-y;if(Math.abs(dx*c+dy*s)<w/2+mg&&Math.abs(-dx*s+dy*c)<h/2+mg)put(j*GW+i,zt,bio,own)}};
 const free=K.free=(x,y,r,rm)=>!(nearWater(x,y)&&inWater(x,y,Math.max(0,r-4)))&&!m.bridges.some(b=>Math.hypot(x-b.x,y-b.y)<b.L/2+60)&&!onRoad(x,y,rm==null?r+8:rm);
 const mkB=(x,y,w,h,a,shape,ty)=>{const g=bgeomEx(shape,w,h),sp=SPEC[shape]||0;return{t:'b',ty:ty||(sp?shape:'house'),shape,x,y,w,h,a,c:Math.cos(a),s:Math.sin(a),r:g.r,pr:g.pr,an:g.an,hp:sp?Math.round(sp*Math.max(.7,Math.sqrt(w*h)/110)):Math.round(w*h/25),sp:sp?1:0}};
 // l'edificio o può stare lì? mode 0 terra, 1 isola, 2 senza controlli sull'acqua, 3 solo acqua (navi, piattaforme); riv: il fiume non conta (ci si costruisce sopra)
 const bOK=K.bOK=(o,gap,mode,riv)=>{
  if(!inMap(o.x,o.y,o.r*.7))return false;
  for(const b of qobs(o.x,o.y,o.r+gap+170,[])){if(b.t=='t'||b.ty=='rock')continue;const d=Math.hypot(o.x-b.x,o.y-b.y),rs=o.r+b.r+gap;if(d>=rs)continue;if(d<rs*.3)return false;
   for(let u=-o.r;u<=o.r;u+=20)for(let v=-o.r;v<=o.r;v+=20){if(bsd(o,u,v)>4)continue;const w=toWorld(o,u,v),l=toLocal(b,w[0],w[1]);if(bsd(b,l[0],l[1])<gap)return false}}
  if(mode!=1)for(const b of m.bridges){if(Math.hypot(o.x-b.x,o.y-b.y)>=b.L/2+b.bw/2+o.r+60)continue;
   for(let u=-o.r;u<=o.r;u+=20)for(let v=-o.r;v<=o.r;v+=20){if(bsd(o,u,v)>6)continue;const w=toWorld(o,u,v),dx=w[0]-b.x,dy=w[1]-b.y;
    if(Math.abs(dx*b.c+dy*b.s)<b.L/2+60&&Math.abs(-dx*b.s+dy*b.c)<b.bw/2+14)return false}}
  let wetN=0,sampN=0;
  for(let u=-o.r;u<=o.r;u+=40)for(let v=-o.r;v<=o.r;v+=40)if(bsd(o,u,v)<12){const w=toWorld(o,u,v);sampN++;
   if(mode==0){if(wetCell(w[0],w[1])&&!(riv&&riverCell(w[0],w[1])))wetN++}
   else if(mode==1&&isleM(w[0],w[1])<14)return false;
   else if(mode==3&&!inWater(w[0],w[1],0))return false}
  if(mode==0&&sampN&&wetN/sampN>.30)return false;                       // a terra: al massimo il 30% dell'ingombro può sporgere sull'acqua
  if(mode==0||mode==1){const n=Math.ceil((o.r+60)/100),cx=o.x/100|0,cy=o.y/100|0,seen=new Set();
   for(let i=-n;i<=n;i++)for(let j=-n;j<=n;j++){const a=m.roadCells.get((cx+i)*1024+cy+j);if(a)for(const d of a)if(!seen.has(d)){seen.add(d);
    for(let k=0;k<d.pts.length-1;k++){const A=d.pts[k],B=d.pts[k+1],segL=Math.hypot(B[0]-A[0],B[1]-A[1]),steps=Math.max(1,Math.ceil(segL/20));
     for(let t=0;t<=steps;t++){const u=t/steps,dx=A[0]+(B[0]-A[0])*u-o.x,dy=A[1]+(B[1]-A[1])*u-o.y;
      if(dx*dx+dy*dy<(o.r+d.w/2+8)**2&&bsd(o,dx*o.c+dy*o.s,-dx*o.s+dy*o.c)<d.w/2+2+(d.sw?8:0))return false}}}}}
  return true};
 // riquadro dell'ingombro reale di un ostacolo, in coordinate locali [u0,v0,u1,v1] (alcune sagome non sono centrate: torre, fabbrica, combo...)
 const footBox=K.footBox=o=>{let a=1e9,b=1e9,c=-1e9,d=-1e9;for(const q of o.pr){if(q.k=='g'){for(const v of q.vs){a=Math.min(a,v[0]);b=Math.min(b,v[1]);c=Math.max(c,v[0]);d=Math.max(d,v[1])}continue}
  const ex=q.a,ey=q.k=='r'?q.b:q.a;a=Math.min(a,q.x-ex);b=Math.min(b,q.y-ey);c=Math.max(c,q.x+ex);d=Math.max(d,q.y+ey)}return[a,b,c,d]};
 const killNat=o=>{for(const t of qobs(o.x,o.y,o.r+240,[])){if(t.t!='t'&&t.ty!='rock')continue;const l=toLocal(o,t.x,t.y);if(bsd(o,l[0],l[1])<t.r*(t.t=='t'?1:.9)+4)t.dead=1}};
 // gruppo di edifici (ognuno resta un edificio a sé, ma insieme formano una struttura): o tutti o nessuno.
 // opt: tight (città: distanze strette), iso (isola), pal/pals (palette), fz (tipo di pavimentazione attorno), riv, force, gap, tw (conta come edificio "di città")
 const addGroup=K.addGroup=(parts,opt)=>{opt=opt||{};const gap=opt.gap!=null?opt.gap:opt.tight?8:28,os=[];
  for(const p of parts){const o=mkB(p.x,p.y,p.w,p.h,p.a,p.sh||pick(opt.tight?BTOWN:BSHAPES),p.ty);
   if(!opt.force&&o.ty=='house'&&!o.sp&&Math.min(p.w,p.h)<BLD_MIN)return null;   // troppo piccolo: meglio niente
   if(!opt.force&&(!bOK(o,gap,opt.iso?1:0,opt.riv)||(!opt.tight&&!opt.iso&&!lvlFlat(o.x,o.y,o.r))))return null;os.push(o)}
  const g=parts.length>1?++K.grp:0,pal=opt.pal!=null?opt.pal:pick(opt.pals||PAL_ALL);
  for(const o of os){let d1=ri(0,10),d2=ri(0,9);if(d2>=d1)d2++;o.dec=[d1,d2];o.pal=opt.pals&&(os.length==1||R()<.4)?pick(opt.pals):pal;o.tw=opt.tw!=null?opt.tw:opt.tight?1:0;o.is=opt.iso?1:0;
   o.rf=o.w>=150&&o.h>=150&&(o.shape=='rect'||o.shape=='square')?ri(0,3):0;o.grp=g;o.fz=opt.fz!=null?opt.fz:opt.iso?4:opt.tight?1:3;killNat(o);m.blds.push(o);addO(o)}
  // piazzale: UNO per tutto il gruppo, centrato sull'ingombro REALE delle sagome (nel verso del primo edificio). Edificio solo: da 1,5 a 3 volte il suo lato maggiore;
  // gruppo: il riquadro che li contiene tutti più un margine. own = i suoi edifici (fitSlabs lo adatta a fine mappa). Le strade e gli altri edifici ci vengono disegnati sopra.
  if(!K.noSlab&&!opt.noSlab&&!opt.iso){const o=os[0],ca=o.c,sa=o.s;let a=1e9,b=1e9,c=-1e9,d=-1e9;
   for(const q of os){const bb=footBox(q);for(const[u,v]of[[bb[0],bb[1]],[bb[2],bb[1]],[bb[2],bb[3]],[bb[0],bb[3]]]){const wx=q.x+u*q.c-v*q.s-o.x,wy=q.y+u*q.s+v*q.c-o.y,lu=wx*ca+wy*sa,lv=-wx*sa+wy*ca;a=Math.min(a,lu);b=Math.min(b,lv);c=Math.max(c,lu);d=Math.max(d,lv)}}
   const L=Math.max(c-a,d-b),cu=(a+c)/2,cv=(b+d)/2,one=os.length==1,mg=rr(40,80),k=rr(1.5,3),sw=one?L*k:c-a+2*mg,sh=one?Math.max(L*1.5,L*k*rr(.8,1.2)):d-b+2*mg,
    sx=o.x+cu*ca-cv*sa,sy=o.y+cu*sa+cv*ca;m.flat.push({k:'slab',t:0,x:sx,y:sy,w:sw,h:sh,a:o.a,soft:1,tn:ri(0,5),st:ri(0,4),own:os});
   // muro perimetrale (edifici isolati, non in città): dentro il piazzale, con un varco verso la strada più vicina e a volte uno opposto
   if(!opt.tight&&one&&R()<.34){const ww=Math.max(L+110,sw*rr(.72,.88)),wh=Math.max(L+110,sh*rr(.72,.88)),T=(u,v)=>[sx+u*o.c-v*o.s,sy+u*o.s+v*o.c],
     sides=[T(0,-wh/2),T(0,wh/2),T(-ww/2,0),T(ww/2,0)],dr=q=>{let d=1e9;for(let i=-3;i<=3;i++)for(let j=-3;j<=3;j++){const a=m.roadCells.get(((q[0]/100|0)+i)*1024+(q[1]/100|0)+j);if(a)for(const r of a)d=Math.min(d,segNear(r.pts,q[0],q[1])[0])}return d},
     bi=[0,1,2,3].sort((p,q)=>dr(sides[p])-dr(sides[q]))[0],gates=[sides[bi]];if(R()<.5)gates.push(sides[bi^1]);K.wallRect(sx,sy,o.a,ww,wh,rr(12,18),gates)}}
  return os};
 K.addB=(x,y,w,h,a,sh,tight,iso,ty,pals,fz,force,tw)=>{const r=addGroup([{x,y,w,h,a,sh,ty}],{tight,iso,pals,fz,force,tw});return r?r[0]:null};
 // edificio "che si adatta": prima come richiesto (anche ruotato), poi senza rotazione e via via più piccolo; infine piccolo e spostato verso un lato
 K.fitB=(x,y,w,h,a,a0,sh,ty,pals,fz,riv,tw)=>{for(const k of[1,.92,.84,.74,.64,.55]){for(const aa of(a===a0?[a0]:[a,a0])){const r=addGroup([{x,y,w:w*k,h:h*k,a:aa,sh,ty}],{tight:true,pals,fz,riv,tw,gap:k<1?4:8});if(r)return r[0]}}
  const c=Math.cos(a0),s=Math.sin(a0);
  for(const[du,dv]of[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]]){const u=du*w*.28,v=dv*h*.28,r=addGroup([{x:x+u*c-v*s,y:y+u*s+v*c,w:w*.5,h:h*.5,a:a0,sh,ty}],{tight:true,pals,fz,riv,tw,gap:4});if(r)return r[0]}
  return null};
 // edificio speciale (container, silos, serbatoi, gru, navi...): ex = {gap, force, o:{campi in più}}
 K.addX=(x,y,w,h,a,shape,mode,ex)=>{ex=ex||{};const o=mkB(x,y,w,h,a,shape);if(!ex.force&&!bOK(o,ex.gap!=null?ex.gap:12,mode||0))return null;
  Object.assign(o,ex.o||{});if(shape=='cont'&&!o.cc)o.cc=Array.from({length:Math.max(1,Math.round(w/56))*Math.max(1,Math.round(h/24))},()=>ri(0,9));killNat(o);return addO(o)};
 // muri: sempre a pezzetti allineati; dove passa una strada, c'è un varco (gates) o c'è acqua restano vuoti
 const wallSeg=(x,y,len,th,a,gates,tag)=>{   // tag: i pezzi con la stessa etichetta non si escludono a vicenda (anelli curvi dell'arena)
  for(const g of gates||[])if(Math.hypot(x-g[0],y-g[1])<len/2+70)return;
  if(!inMap(x,y,20)||wetCell(x,y)||m.bridges.some(b=>Math.hypot(x-b.x,y-b.y)<b.L/2+40)||onRoad(x,y,th/2+2))return;
  const o=mkB(x,y,len,th+4,a,'rect','wall');o.hp=o.m=520;o.pal=PAL_WALL;
  for(const b of qobs(x,y,o.r+55,[])){if(b.t=='t'||b.ty==='rock'||(tag&&b.tag===tag)||Math.hypot(x-b.x,y-b.y)>o.r+b.r+18)continue;const l=toLocal(b,x,y);if(bsd(b,l[0],l[1])<(b.ty==='wall'?22:th/2+2))return}
  if(tag)o.tag=tag;killNat(o);addO(o)};
 K.wallSeg=wallSeg;   // un pezzo di muro singolo (l'arena costruisce così i suoi anelli, senza i buchi casuali di wallLine)
 const wallLine=K.wallLine=(ax,ay,bx,by,th,gates,skip)=>{const L=Math.hypot(bx-ax,by-ay),n=Math.max(1,Math.round(L/70)),a=Math.atan2(by-ay,bx-ax),sl=L/n;
  for(let i=0;i<n;i++){const x=ax+(bx-ax)*((i+.5)/n),y=ay+(by-ay)*((i+.5)/n);if(R()<.1||(skip&&skip(x,y)))continue;wallSeg(x,y,sl+2,th,a,gates)}};
 K.wallRect=(x,y,a,w,h,th,gates,skip)=>{const C=Math.cos(a),Sn=Math.sin(a),T=(u,v)=>[x+u*C-v*Sn,y+u*Sn+v*C],hw=w/2,hh=h/2,cs=[T(-hw,-hh),T(hw,-hh),T(hw,hh),T(-hw,hh)];
  for(let i=0;i<4;i++)wallLine(cs[i][0],cs[i][1],cs[(i+1)%4][0],cs[(i+1)%4][1],th,gates,skip)};
 K.wallCirc=(x,y,r,gates)=>{const n=40;for(let i=0;i<n;i++){const t0=i/n*TAU,t1=(i+1)/n*TAU;wallLine(x+Math.cos(t0)*r,y+Math.sin(t0)*r,x+Math.cos(t1)*r,y+Math.sin(t1)*r,20,gates)}};
 // alberi e rocce
 const onSlab=(x,y)=>{for(const f of m.flat){if(f.k!='slab'&&f.k!='lot')continue;if(f.k=='slab'&&(f.t==0||f.t==2||f.t==5))continue;const c=Math.cos(f.a||0),s=Math.sin(f.a||0),dx=x-f.x,dy=y-f.y;if(Math.abs(dx*c+dy*s)<f.w/2&&Math.abs(-dx*s+dy*c)<f.h/2)return true}return false};   // piazzali industriali, portuali, militari e parcheggi: niente alberi
 K.tree=(x,y,r,sw)=>{if(!inMap(x,y,r)||!free(x,y,r,sw?-2:null)||onSlab(x,y))return;
  for(const o of qobs(x,y,r+30,[])){if(o.t=='t'){if(Math.hypot(o.x-x,o.y-y)<(o.r+r)*.55)return;continue}const l=toLocal(o,x,y);if(bsd(o,l[0],l[1])<r+6)return}
  addO({t:'t',x,y,r,hp:50,m:50,tn:ri(0,2)})};
 K.rock=(x,y,sz,allowWater)=>{
  if(!inMap(x,y,sz*.6))return;
  if(!allowWater&&(!free(x,y,sz*.8)||wetCell(x,y)))return;
  if(allowWater&&!inWater(x,y,0)&&!free(x,y,sz*.8))return;
  const n=ri(5,9),sx=rr(.7,1.3),sy=rr(.7,1.3),pts=[],a0=R()*TAU;
  for(let i=0;i<n;i++){const a=a0+(i+rr(-.3,.3))/n*TAU,d=sz*rr(.55,1);pts.push([Math.cos(a)*d*sx,Math.sin(a)*d*sy])}
  const g=rockGeom(pts),o={t:'b',ty:'rock',shape:'rock',x,y,w:sz*2,h:sz*2,a:0,c:1,s:0,r:g.r,pr:g.pr,an:g.an,hp:1,m:1,ind:1,pal:0};
  for(const b of qobs(x,y,o.r+30,[])){if(b.t=='t'){if(Math.hypot(b.x-x,b.y-y)<o.r+b.r)b.dead=1;continue}if(Math.hypot(b.x-x,b.y-y)<o.r+b.r+10)return}
  const tone=ri(70,150),v=g.pr[0].vs;o.fc=v.map((_,i)=>{const k=tone+((i*37+ri(0,4))%5-2)*9+ri(-6,6);return`rgb(${k},${k+ri(-2,3)},${k+ri(-4,2)})`});o.tone=tone;
  addO(o);return true};
 // qualche roccia decorativa in un parco (rettangolo w×h, T porta (u,v) nel mondo; evita il laghetto disegnato da PF.park con lo stesso seme s) o in una piazza tonda
 K.parkRocks=(T,w,h,s)=>{const pond=hs(1,1,s)<.7?[(hs(2,2,s)-.5)*w*.4,(hs(3,3,s)-.5)*h*.4]:null;
  for(let i=0,n=ri(1,4);i<n;i++){const u=rr(-.42,.42)*w,v=rr(-.42,.42)*h;if(pond&&Math.hypot(u-pond[0],v-pond[1])<70)continue;const q=T(u,v);K.rock(q[0],q[1],rr(12,26))}};
 K.plazaRocks=(x,y,r,a)=>{for(let i=0,n=ri(1,3);i<n;i++){const t=(a||0)+R()*TAU,d=rr(Math.min(r*.55,r-40),r*.85);K.rock(x+Math.cos(t)*d,y+Math.sin(t)*d,rr(10,20))}};
 K.rockSz=()=>{const u=R();return u<.55?rr(18,40):u<.85?rr(40,90):rr(100,200)};
 // ----- strade -----
 // tratto dritto a passi di 50 px (le vie dei siti)
 K.st=(A,B,w,cls,sw)=>{const L=Math.hypot(B[0]-A[0],B[1]-A[1]),n=Math.max(1,Math.round(L/50)),pts=[];for(let i=0;i<=n;i++)pts.push([A[0]+(B[0]-A[0])*i/n,A[1]+(B[1]-A[1])*i/n]);return{pts,w,ty:0,cls,sw}};
 // tiene i punti di una strada fuori dai laghi e dentro la terraferma
 const fix=K.fix=(p,mg)=>{for(const l of m.lakes){const dx=p[0]-l.x,dy=p[1]-l.y,d=Math.hypot(dx,dy),mm=rad(l,p[0],p[1])+mg;if(d<mm){const k=mm/(d||1);p[0]=l.x+dx*k;p[1]=l.y+dy*k}}
  const q=toUV(p[0],p[1]),w=fromUV(clamp(q[0],40,coastV(q[1])-90),clamp(q[1],40,WH-40));p[0]=w[0];p[1]=w[1]};
 // strada sinuosa per alcuni punti di passaggio
 K.makeRoad=(pts,w)=>{const out=[];
  for(let i=0;i<pts.length-1;i++){const[ax,ay]=pts[i],[bx,by]=pts[i+1],L=Math.hypot(bx-ax,by-ay)||1,n=Math.max(1,Math.round(L/50)),nx=-(by-ay)/L,ny=(bx-ax)/L,ph=rr(0,6.28),am=rr(15,40);
   for(let k=0;k<n;k++){const t=k/n,o=Math.sin(t*TAU+ph)*am*Math.sin(t*Math.PI);out.push([ax+(bx-ax)*t+nx*o,ay+(by-ay)*t+ny*o])}}
  out.push(pts[pts.length-1].slice());for(const p of out)fix(p,100);
  for(let it=0;it<6;it++){for(let i=1;i<out.length-1;i++){out[i][0]=(out[i-1][0]+out[i][0]*2+out[i+1][0])/4;out[i][1]=(out[i-1][1]+out[i][1]*2+out[i+1][1])/4}for(const p of out)fix(p,90)}
  return{pts:out,w}};
 // registra una strada: celle per le ricerche, riquadro, e via alberi e rocce dalla sede (niente ponti: la strada passa sopra il fiume e fa da passaggio, vedi onBridge in AGworld.js)
 K.addRoad=rd=>{if(!rd||rd.pts.length<2)return null;rd.ty=rd.ty||0;rd.sw=rd.sw||0;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
  for(const q of rd.pts){x0=Math.min(x0,q[0]);y0=Math.min(y0,q[1]);x1=Math.max(x1,q[0]);y1=Math.max(y1,q[1]);const cx=Math.floor(q[0]/100),cy=Math.floor(q[1]/100);
   for(let i=-2;i<=2;i++)for(let j=-2;j<=2;j++){const k=(cx+i)*1024+cy+j;let a=m.roadCells.get(k);if(!a)m.roadCells.set(k,a=[]);if(a[a.length-1]!==rd)a.push(rd)}
   clearNat(q[0],q[1],rd.w/2+(rd.sw?16:8))}
  rd.bb=[x0-110,y0-110,x1+110,y1+110];m.roads.push(rd);return rd};
 // ----- controlli per piazzare i siti -----
 const dry=K.dry=(x,y,r)=>{if(!inMap(x,y,r*.75)||seaU(x,y)>SEA-r*.4)return false;
  let wet=0;for(let k=0;k<8;k++){const a=k*.7853;if(inWater(x+Math.cos(a)*r*.6,y+Math.sin(a)*r*.6,0))wet++}
  if(wet>3||inWater(x,y,0)||dS(x,y)<r+420)return false;
  return m.sites.every(s=>s.ds?s.ds.every(q=>Math.hypot(x-q.x,y-q.y)>q.rad+r+60):Math.hypot(x-s.x,y-s.y)>(r+s.r)*.8+70)};
 K.dryD=(D,ds)=>dry(D.x,D.y,D.rad)&&lvlFlat(D.x,D.y,D.rad*.5)&&ds.every(q=>Math.hypot(D.x-q.x,D.y-q.y)>q.rad+D.rad+20);
 // posizioni [u, v, angolo] di n oggetti di lato sz in un rettangolo w×h: fila, doppia fila, quadrato, semicerchio, L, griglia (fra un oggetto e l'altro almeno un vicolo ALLEY)
 K.pattern=(kind,w,h,sz,gap)=>{gap=Math.max(gap,ALLEY);const out=[],st=sz+gap,nx=Math.max(1,Math.floor(w/st)),ny=Math.max(1,Math.floor(h/st));
  if(kind=='row')for(let i=0;i<nx;i++)out.push([(i-(nx-1)/2)*st,0,0]);
  else if(kind=='rows2')for(let i=0;i<nx;i++)for(const sd of[-1,1])out.push([(i-(nx-1)/2)*st,sd*Math.max(sz*.6,h/2-sz/2),sd>0?0:Math.PI]);
  else if(kind=='square'){for(let i=0;i<nx;i++)for(const sd of[-1,1])out.push([(i-(nx-1)/2)*st,sd*(h/2-sz/2),sd>0?0:Math.PI]);
   for(let j=0,n=Math.floor((h-2*st)/st);j<n;j++)for(const sd of[-1,1])out.push([sd*(w/2-sz/2),(j-(n-1)/2)*st,Math.PI/2*sd])}
  else if(kind=='arc'&&h>=sz*1.6){const rx=w/2-sz/2,ry=h-sz,n=Math.max(3,Math.floor(Math.PI*Math.min(rx,ry)/st));for(let i=0;i<n;i++){const t=Math.PI*(i+.5)/n;out.push([Math.cos(t)*rx,h/2-sz/2-Math.sin(t)*ry,t-Math.PI/2])}}
  else if(kind=='L'){for(let i=0;i<nx;i++)out.push([(i-(nx-1)/2)*st,h/2-sz/2,0]);for(let j=0;j<ny-1;j++)out.push([-w/2+sz/2,h/2-sz/2-(j+1)*st,Math.PI/2])}
  else for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)out.push([(i-(nx-1)/2)*st,(j-(ny-1)/2)*st,0]);
  return out};
 return K}

// ===== FASE 0: quali siti costruire =====
// La missione scelta nella lobby (G.sel) decide alcuni siti obbligatori: così resta giocabile anche sulle mappe quasi vuote.
function planSites(K){const{R,ri,PROF}=K,sel=G.mode==1?-1:G.sel,n=ri(PROF.sites[0],PROF.sites[1]),L=['g'],cnt=k=>L.filter(x=>x==k).length;
 const need=({1:['g','g'],4:['g','g'],5:['g','g'],3:['g'],6:[R()<.5?'n':'k'],7:['y','k']})[sel]||[];K.need={};
 for(const k of need){L.push(k);K.need[k]=(K.need[k]||0)+1}
 const nCity=Math.max(1,Math.round(n*PROF.city));while(cnt('g')<nCity)L.push('g');
 const W=PROF.mix,keys=Object.keys(W),tot=keys.reduce((s,k)=>s+W[k],0);
 for(let g=0;L.length<n&&g<300;g++){let x=R()*tot,k=keys[0];for(const q of keys){x-=W[q];if(x<0){k=q;break}}
  if('kynas'.includes(k)&&cnt(k))continue;   // centrale, cantiere, silos, aeroporto e arena: al massimo uno per mappa
 if(k=='p'&&cnt('p')>=PROF.ports)continue;L.push(k)}
 K.plan=L;K.nPort=cnt('p')}

// ===== FASE 1: natura =====
function genNature(K){const{m,R,rr,ri,pick,PROF,seed}=K;
 // 1. lato del mare; la partenza è uno dei due angoli lontani dal mare
 SIDE=m.side=R()*4|0;BASE.k=R()<.5?SIDE:(SIDE+3)%4;BASE.xr=WW;
 const s0=baseXY(200,200),e0=baseXY(260,260);START[0]=s0[0];START[1]=s0[1];EXT[0]=e0[0];EXT[1]=e0[1];
 // 2. costa: baie (anche profonde) e promontori che si sommano alla costa di base
 {const cbs=[];for(let i=0,n=8+(R()*4|0);i<n;i++)cbs.push([rr(250,WH-250),R()<.72?-rr(150,380):rr(40,90),rr(90,300)]);
  m.cb=v=>{let s=0;for(const b of cbs){const t=(v-b[0])/b[2];s+=b[1]*Math.exp(-t*t)}return s}}
 // 3. dislivelli: altopiani dal rumore (più alti lontano dal mare), poi quote ai vertici e due passate di ammorbidimento
 {const nE=mapNoise(seed+11,1700),cl=new Float32Array(GW*GH),W1=GW+1,E=m.E,t1=.53+(1-PROF.hill)*.08,t2=t1+.1;
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const x=i*TC+20,y=j*TC+20,u=seaU(x,y),e=nE(x,y)+.1*(1-u/SEA);cl[j*GW+i]=u>SEA-430?0:e<t1?0:e<t2?1:2}
  for(let j=0;j<=GH;j++)for(let i=0;i<=GW;i++){let s=0;for(const[dx,dy]of[[-1,-1],[0,-1],[-1,0],[0,0]])s+=cl[clamp(j+dy,0,GH-1)*GW+clamp(i+dx,0,GW-1)];E[j*W1+i]=s/4}
  for(let p=0;p<2;p++){const T2=E.slice();for(let j=0;j<=GH;j++)for(let i=0;i<=GW;i++){let s=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=i+dx,y=j+dy;if(x<0||y<0||x>GW||y>GH)continue;s+=T2[y*W1+x];n++}E[j*W1+i]=s/n}}}
 // 4. porti: si decide subito dove (tratto di costa dritto e in piano): i moli sono terra in più, laghi e fiumi li evitano
 for(let t=0;t<300&&m.ports.length<K.nPort;t++){const v=rr(1000,WH-1000),c0=coastV(v),q=fromUV(c0-300,v);
  if(m.ports.some(p=>Math.abs(p.cv-v)<1700))continue;
  let ok=K.lvlFlat(q[0],q[1],260)&&K.dS(q[0],q[1])>1600;for(let dv=-440;dv<=440&&ok;dv+=55)if(coastV(v+dv)<c0-150)ok=false;if(!ok)continue;
  const P0=PLAN.mkPort(K,v);m.ports.push(P0);m.piers.push(...P0.piers)}
 // 5. laghi
 const lakeOK=(x,y,r)=>K.inMap(x,y,r+80)&&seaU(x,y)+r<SEA-250&&K.dS(x,y)>r+900&&m.ports.every(p=>Math.hypot(x-p.x,y-p.y)>r+800)&&K.lvlFlat(x,y,r*1.25)&&m.lakes.every(l=>Math.hypot(x-l.x,y-l.y)>l.r*1.3+r*1.4+250);
 for(let i=0,n=0,nl=ri(PROF.lakes[0],PROF.lakes[1]);n<nl&&i<300;i++){const big=n<nl/2,r0=big?rr(230,520):rr(80,150),p=fromUV(rr(400,SEA-500),rr(350,WH-350));if(lakeOK(p[0],p[1],r0)){m.lakes.push(blob(R,p[0],p[1],r0));n++}}
 // 6. fiumi: dall'interno (o da un lago) fino al mare, con anse; larghi, medi, ruscelli
 const river=(ax,ay,bx,by,w,mk)=>{const n=120,pts=[],L=Math.hypot(bx-ax,by-ay),nx=-(by-ay)/L,ny=(bx-ax)/L,p1=rr(0,6.28),p2=rr(0,6.28);
  for(let i=0;i<=n;i++){const t=i/n,o=(Math.sin(t*9+p1)*170+Math.sin(t*23+p2)*50)*mk*Math.min(1,t*8,(1-t)*8);pts.push([ax+(bx-ax)*t+nx*o,ay+(by-ay)*t+ny*o])}
  // larghezza variabile lungo il corso: da w (base) fino a 2w, con continuità (onde lente; fasi dal punto di partenza/arrivo, senza consumare R)
  const s0=hs(ax|0,ay|0,7)*TAU,s1=hs(bx|0,by|0,11)*TAU,wp=pts.map((q,i)=>{const t=i/n;return w*(1+clamp(.5+.35*Math.sin(t*7.3+s0)+.25*Math.sin(t*17.1+s1),0,1))});
  return{pts,w,wp,wm:Math.max(...wp)}};   // w = larghezza minima (base) · wp = larghezza in ogni punto · wm = larghezza massima
 const RT=[[92,124,1.1],[54,72,1],[34,44,.8],[54,72,1],[34,44,.8]];
 for(let i=0,n=0,nr=ri(PROF.rivers[0],PROF.rivers[1]);n<nr&&i<200;i++){const[w0,w1,mk]=RT[n%RT.length],L0=m.lakes.length?pick(m.lakes):null,fl=L0&&R()<.5,a=fl?[L0.x,L0.y]:fromUV(rr(600,SEA-1600),rr(250,WH-250)),bv=rr(300,WH-300),b=fromUV(coastV(bv)+40,bv),rv=river(a[0],a[1],b[0],b[1],rr(w0,w1),mk);rv.bv=bv;
  if(m.rivers.every(o=>Math.abs(o.bv-bv)>420)&&m.ports.every(p=>Math.abs(p.cv-bv)>700)&&rv.pts.every(q=>K.dS(q[0],q[1])>650)&&(R()<.35||rv.pts.every((q,i)=>i>112||m.rivers.every(o=>segNear(o.pts,q[0],q[1])[0]>o.wm/2+rv.wm/2+140)))){m.rivers.push(rv);n++}/* di solito i fiumi non si incrociano, a volte sì */}
 // 7. isole: nei laghi grandi e in mare
 const isl=(x,y,R0)=>{const s=blob(R,x,y,R0),sx=rr(.65,1.45),sy=rr(.65,1.45),stretch=R()<.4?rr(1.2,1.9):1,mx=Math.max(...s.a),k=ri(2,5),ph=R()*6;
  s.a=s.a.map((v,i)=>{const ang=i/s.a.length*TAU,def=R0*(.75+.25*v/mx)*(1+.25*Math.sin(ang*k+ph));return def*(Math.abs(Math.cos(ang))*sx+Math.abs(Math.sin(ang))*sy)*stretch*.7});s.R=Math.max(...s.a);return s};
 const free0=(x,y,R0)=>m.rivers.every(rv=>{const q=segNear(rv.pts,x,y);return q[0]>R0*1.2+rvW(rv,q)/2+40})&&m.isles.every(s=>Math.hypot(x-s.x,y-s.y)>s.R+R0+40)&&m.piers.every(p=>Math.hypot(x-p.x,y-p.y)>R0+p.L/2+160);
 for(const l of m.lakes.slice()){const mr=Math.min(...l.a);if(mr<250)continue;const two=mr>380,R0=two?mr*.3:clamp(mr*.42,115,230);
  for(let k=0;k<(two?2:1);k++){const t=R()*6.28,d=two?mr*.38:rr(0,mr*.2),x=l.x+Math.cos(t+k*3.1416)*d,y=l.y+Math.sin(t+k*3.1416)*d;
   if(!free0(x,y,R0))continue;const s=isl(x,y,R0);s.q=t;m.isles.push(s)}}
 for(let i=0,n=0;n<4&&i<60;i++){const v=rr(300,WH-300),W2=(WW-coastV(v))/2,R0=Math.min(rr(110,135),W2-30),p=fromUV(coastV(v)+W2,v);if(R0>=105&&free0(p[0],p[1],R0)){m.isles.push(isl(p[0],p[1],R0));n++}}
 // 8. maschere dell'acqua (WM bagnato, RV solo fiume, WN vicino all'acqua): inWater si controlla solo nelle celle candidate
 {const cand=new Uint8Array(GW*GH),mk=(x,y,r)=>{const i0=Math.max(0,Math.floor((x-r)/TC)),i1=Math.min(GW-1,Math.floor((x+r)/TC)),j0=Math.max(0,Math.floor((y-r)/TC)),j1=Math.min(GH-1,Math.floor((y+r)/TC));for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++)cand[j*GW+i]=1};
  for(const rv of m.rivers)rv.pts.forEach((q,i)=>mk(q[0],q[1],rv.wp[i]/2+10));
  for(const l of m.lakes)mk(l.x,l.y,l.r*1.4+10);
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++)if(seaU(i*TC+20,j*TC+20)>SEA-760)cand[j*GW+i]=1;
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++)if(cand[j*GW+i]&&inWater(i*TC+20,j*TC+20,26))m.WM[j*GW+i]=1;
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++)if(m.WM[j*GW+i]){const x=i*TC+20,y=j*TC+20;let w=seaU(x,y)+26>coastV(seaV(x,y));for(const l of m.lakes)if(!w&&inBlob(l,x,y,26))w=true;if(!w)m.RV[j*GW+i]=1}
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++)if(m.WM[j*GW+i])for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const x=i+dx,y=j+dy;if(x>=0&&y>=0&&x<GW&&y<GH)m.WN[y*GW+x]=1}
  m.wnReady=1}
 // 9. zone naturali: bosco e roccia occupano una frazione precisa della mappa (soglia = quantile del rumore); le scarpate sono rocciose; sabbia lungo il mare e in qualche duna
 {const nF=mapNoise(seed+21,1150),nR=mapNoise(seed+31,950),nS=mapNoise(seed+41,700),N=GW*GH,vF=new Float32Array(N),vR=new Float32Array(N),vS=new Float32Array(N),W1=GW+1,E=m.E;
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const c=j*GW+i,x=i*TC+20,y=j*TC+20,e=[E[j*W1+i],E[j*W1+i+1],E[(j+1)*W1+i],E[(j+1)*W1+i+1]];
   vF[c]=nF(x,y);vR[c]=nR(x,y)+(Math.max(...e)-Math.min(...e))*.55;vS[c]=nS(x,y)}
  const qt=(a,f)=>{const s=Float32Array.from(a).sort();return s[clamp((N*(1-f))|0,0,N-1)]},tF=qt(vF,PROF.forest),tR=qt(vR,PROF.rock),tS=qt(vS,.035);
  for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const c=j*GW+i,x=i*TC+20,y=j*TC+20;if(m.WM[c]||K.dS(x,y)<430)continue;
   const dF=vF[c]-tF,dR=vR[c]-tR;
   m.bio[c]=coastV(seaV(x,y))-seaU(x,y)<60+90*vS[c]?BIO.sand:dR>0&&dR>=dF?BIO.rock:dF>0?BIO.forest:vS[c]>tS?BIO.sand:BIO.plain}}
 for(let i=0,n=0,nh=ri(3,7);n<nh&&i<200;i++){const p=fromUV(rr(400,SEA-500),rr(350,WH-350)),b=K.bioAt(p[0],p[1]);if((b==BIO.rock||b==BIO.plain&&R()<.3)&&!wetCell(p[0],p[1])&&K.dS(p[0],p[1])>800){m.hills.push(blob(R,p[0],p[1],rr(220,420)));n++}}
 natBiomes(K);   // sotto-tipi delle zone naturali (AGnature.js): servono alle specie degli alberi
 // 10. alberi: fitti dentro i boschi (un reticolo deformato, più rado ai margini), a ciuffi nelle pianure
 {let fc=0;for(let i=0;i<GW*GH;i++)if(m.bio[i]==BIO.forest)fc++;
  const S=clamp(Math.sqrt(fc*TC*TC/5200),60,100),F=(x,y)=>K.inMap(x,y,1)&&K.bioAt(x,y)==BIO.forest,T0=(x,y,r)=>{if(K.inMap(x,y,r)&&!wetCell(x,y)&&K.dS(x,y)>330)K.addO({t:'t',x,y,r,hp:50,m:50,tn:ri(0,2),kd:natKind(K,x,y)})};
  for(let y=S/2;y<WH;y+=S)for(let x=S/2;x<WW;x+=S){const px=x+rr(-.42,.42)*S,py=y+rr(-.42,.42)*S,b=K.bioAt(px,py);
   if(b==BIO.forest){const deep=F(px+S,py)&&F(px-S,py)&&F(px,py+S)&&F(px,py-S);if(R()<(deep?.94:.6))T0(px,py,R()<.14?rr(28,40):rr(14,24))}
   else if(b==BIO.plain&&R()<.011*PROF.nat)for(let k=0,n=ri(3,8);k<n;k++){const a=R()*TAU,d=Math.sqrt(R())*110;T0(px+Math.cos(a)*d,py+Math.sin(a)*d,rr(15,34))}}}
 // 11. rocce: campi di massi nelle zone rocciose, creste lungo le scarpate, scogliere in mare e qualche scoglio nei laghi
 {const S=88;for(let y=S/2;y<WH;y+=S)for(let x=S/2;x<WW;x+=S){const px=x+rr(-.4,.4)*S,py=y+rr(-.4,.4)*S;if(K.bioAt(px,py)!=BIO.rock||K.dS(px,py)<380||R()>.72)continue;
   const sz=K.rockSz();K.rock(px,py,sz);if(sz>70)for(let k=0,n=ri(2,5);k<n;k++){const a=R()*TAU;K.rock(px+Math.cos(a)*sz*rr(1.2,2.1),py+Math.sin(a)*sz*rr(1.2,2.1),rr(18,46))}}
  for(let i=0,n=0;i<6000&&n<Math.round(170*PROF.nat);i++){const p=fromUV(rr(150,SEA-150),rr(150,WH-150)),e=elev(p[0],p[1]);if((Math.abs(e-.5)<.1||Math.abs(e-1.5)<.1)&&K.dS(p[0],p[1])>380){K.rock(p[0],p[1],rr(18,70));n++}}
  for(let g=0,ng=ri(3,5);g<ng;g++){const v0=rr(300,WH-300);for(let k=0,n=ri(6,12);k<n;k++){const v=v0+rr(-260,260),p=fromUV(coastV(v)+rr(30,240),v);K.rock(p[0],p[1],rr(20,70),true)}}
  for(const l of m.lakes)if(R()<.7)for(let k=0,n=ri(1,3);k<n;k++){const t=R()*TAU,d=rr(20,Math.min(...l.a)*.6);K.rock(l.x+Math.cos(t)*d,l.y+Math.sin(t)*d,rr(18,55),true)}}}

// ===== FASE 2: siti (prima delle strade) =====
// rango di un sito (larghezza delle strade che lo collegano) e ordine di costruzione: prima i più grandi
const SITE_RK={g:3,i:3,p:3,y:3,a:3,c:2,n:2,k:2,t:2,s:2,f:1,v:1,q:1},SITE_ORD='gaynkicstqfv';
function genSites(K){const{m,R,rr,pick}=K;
 const build=S=>{siteClaim(K,S);K.noSlab=SITE[S.k]||'pfv'.includes(S.k)?1:0;   // complessi, porti, fattorie e ville hanno già il loro piazzale
  const o0=m.obs.length,f0=m.flat.length,tn=siteTone(K,S.k);
  PLAN[S.k](K,S);for(const rd of K.ts){rd.site=1;K.addRoad(rd)}K.ts=[];for(const f of K.later)f();K.later=[];K.noSlab=0;
  if(tn){S.tone=tn.pals;   // tonalità del tipo di sito: edifici normali (non le palette speciali: caserma, centrale, radar...) e piazzali
   for(let i=o0;i<m.obs.length;i++){const o=m.obs[i];if(o.t=='b'&&o.ty=='house'&&!(o.pal>=PAL_BAR&&o.pal<=PAL_WALL))o.pal=tn.pals[(o.grp||i)%tn.pals.length]}
   for(let i=f0;i<m.flat.length;i++){const f=m.flat[i];if(f.k=='slab'&&f.t!=5)f.col=tn.slab}}};
 for(const P0 of m.ports){m.sites.push(P0);build(P0)}
 // ZONE TEMATICHE: un centro per ogni carattere presente nel piano (due per le città nelle mappe dense). I siti di un carattere nascono attorno al suo centro:
 // la mappa diventa una serie di "quartieri" (zona militare, zona industriale, città, campagna) invece di un miscuglio uniforme. Ogni zona ha un suo angolo:
 // spesso i complessi vi si allineano (identità della zona), le città e i satelliti invece ruotano liberamente.
 const ztOf=k=>SITE[k]?SITE[k].zt:k=='g'?'urban':k=='p'||k=='q'?'indus':'rural',zs={};
 const zPt=z=>{const cst=(z=='urban'||z=='indus')&&R()<K.PROF.city*1.3;   // zona sulla costa: tanto più probabile quanto più la mappa è urbana (la costa è la parte più affollata)
  let best=null,bs=-1;for(let t=0;t<16;t++){const p=z=='indus'&&m.ports.length&&t<6?(q=>fromUV(q.cu-rr(900,1600),q.cv+rr(-700,700)))(pick(m.ports)):cst?(v=>fromUV(coastV(v)-rr(650,1400),v))(rr(700,WH-700)):fromUV(rr(600,SEA-700),rr(600,WH-600));
   if(!K.inMap(p[0],p[1],400)||inWater(p[0],p[1],0)||K.dS(p[0],p[1])<1300)continue;let d=1e9;for(const k in zs)for(const q of zs[k])d=Math.min(d,Math.hypot(p[0]-q.x,p[1]-q.y));
   const sc=Math.min(d,3000)+R()*900;if(sc>bs){bs=sc;best=p}}
  return best?{x:best[0],y:best[1],a:R()*Math.PI}:{x:WW/2,y:WH/2,a:0}};
 for(const k of K.plan){const z=ztOf(k);if(!zs[z]){zs[z]=[zPt(z)];if(z=='urban'&&K.PROF.city>=.45)zs[z].push(zPt(z))}}
 m.zones=Object.keys(zs).flatMap(k=>zs[k].map(q=>({k,x:q.x,y:q.y,a:q.a})));
 // distanza minima fra i siti (lascia i corridoi alle strade e il posto ai satelliti): stretta nella metropoli, larga nelle mappe vuote
 const GAP=K.PROF.city>=.6?80:K.PROF.city>=.45?170:K.PROF.city>=.3?300:420,circ=S=>S.ds?S.ds.map(D=>[D.x,D.y,D.rad]):[[S.x,S.y,S.r]];
 const spaced=(S,g)=>{for(const a of circ(S))if(!K.inMap(a[0],a[1],a[2]+150))return false;   // lontano dai bordi: resta il passo per le strade
  for(const o of m.sites)for(const a of circ(S))for(const b of circ(o))if(Math.hypot(a[0]-b[0],a[1]-b[1])<a[2]+b[2]+g)return false;return true};
 // punto candidato: di solito attorno al centro della zona del sito (sempre più lontano a ogni tentativo), a volte ovunque sulla terraferma
 const spot=(k,t)=>{const z=pick(zs[ztOf(k)]);if(R()<(t<40?.85:.55)){const a=R()*TAU,d=Math.sqrt(R())*Math.min(500+t*90,2800);return[z.x+Math.cos(a)*d,z.y+Math.sin(a)*d,z]}
  const p=fromUV(rr(300,SEA-350),rr(300,WH-300));return[p[0],p[1],null]};
 const want={q:BIO.rock,f:BIO.plain,v:BIO.plain,g:BIO.plain};
 let nc=0;
 // ordine: prima i siti chiesti dalla missione, poi un sito per ogni tipo (dal più grande: così ogni tipo trova posto anche nelle mappe piene di città), poi gli altri
 const ord=K.plan.map((k,i)=>({k,f:K.plan.indexOf(k)==i?0:1})).sort((a,b)=>((K.need[b.k]>0)-(K.need[a.k]>0))||a.f-b.f||SITE_ORD.indexOf(a.k)-SITE_ORD.indexOf(b.k)).map(o=>o.k);
 for(const k of ord){if(k=='p')continue;
  const far=K.need[k]>0;   // sito chiesto dalla missione: lontano dalla partenza (l'obiettivo deve stare a più di OBJ_MIN)
  for(let t=0,nt=K.PROF.city>=.45?120:70;t<(far?110:nt);t++){const p=spot(k,t),sc=Math.max(.5,1-(far?Math.max(0,t-50):Math.max(0,t-20))*.03),g=GAP*Math.max(.3,1-t/90);
   if(far&&t<95&&K.dS(p[0],p[1])<(k=='g'?2600:OBJ_MIN+500))continue;
   if(t<30&&k!='v'&&want[k]!=null&&K.bioAt(p[0],p[1])!=want[k]&&!(k=='g'&&K.bioAt(p[0],p[1])==BIO.sand))continue;
   const za=p[2]&&R()<.6?p[2].a+(R()<.5?0:Math.PI/2)+rr(-.06,.06):null;   // allineato alla zona
   const S=k=='g'?PLAN.mkCity(K,p[0],p[1],sc,K.PROF.city==0||nc>0&&(K.PROF.sites[1]<=4||R()<(K.PROF.city>=.45?.6:.3)||t>40)):k=='v'?villaAt(K,p[0],p[1]):PLAN.mk(K,k,p[0],p[1],sc,za);
   if(!S||!spaced(S,g))continue;if(k!='g'&&!(K.dry(S.x,S.y,S.r)&&(k=='v'||K.lvlFlat(S.x,S.y,S.r*.5))))continue;
   if(k=='q'&&(inWater(S.x,S.y,S.rp+140)||!K.lvlFlat(S.x,S.y,S.rp+60)))continue;   // cava: fossa e frantoio su terreno asciutto e in piano
   if(k=='s'&&!arenaDry(S))continue;   // arena: niente acqua sotto stadio, piazzale e parcheggi (l'acqua verrebbe disegnata sopra)
   if(S.ds)for(const D of S.ds)D.tone=tone(K,D.ch);   // le tinte dei quartieri solo per la città accettata (BPAL non cresce coi tentativi scartati)
   S.k=k;S.id=m.sites.length+1;m.sites.push(S);build(S);if(k=='g')nc++;if(far)K.need[k]--;break}}}
// villa: un rettangolo libero orientato a caso; il cancello (lato +v) lo raggiungerà una strada (genRoads)
function villaAt(K,x,y){const{m,R,rr}=K,W=rr(460,580),H=rr(400,500),a=R()*TAU;
 for(const[u,v]of[[0,0],[-W/2,-H/2],[W/2,-H/2],[W/2,H/2],[-W/2,H/2],[0,H/2+90]]){const px=x+u*Math.cos(a)-v*Math.sin(a),py=y+u*Math.sin(a)+v*Math.cos(a),c=K.cell(px,py);if(!K.inMap(px,py,40)||m.own[c]||wetCell(px,py))return null}
 return{x,y,a,W,H,r:Math.hypot(W,H)/2+90}}
// il sito prende possesso della propria area: via alberi e rocce, terreno e tipo di zona
function siteClaim(K,S){const Z=SITE[S.k]?SITE[S.k].zt:S.k=='g'?'urban':S.k=='p'||S.k=='q'?'indus':'rural',zt=ZTI[Z],id=S.id||(S.id=K.m.sites.indexOf(S)+1);
 if(S.ds)for(const D of S.ds){K.clearNat(D.x,D.y,D.rad+20);K.stampC(D.x,D.y,D.rad+30,zt,BIO.urban,id);const hf=distHalf(D);if(hf)K.stampR(D.x,D.y,hf[0]*2,hf[1]*2,D.a,20,zt,BIO.urban,id)}   // griglie e vie: anche gli angoli fuori dal cerchio
 else if(S.parts)for(const p of S.parts){const q=S.T(p.u,p.v);K.clearRect(q[0],q[1],p.w,p.h,S.a,30);K.stampR(q[0],q[1],p.w,p.h,S.a,40,zt,BIO.urban,id)}
 else if(S.k=='v'){K.clearRect(S.x,S.y,S.W,S.H,S.a,20);K.stampR(S.x,S.y,S.W,S.H,S.a,30,zt,null,id)}
 else if(S.k=='p'){K.clearNat(S.x,S.y,S.r);K.stampC(S.x,S.y,S.r*.85,zt,BIO.urban,id)}
 else if(S.k=='s'){K.clearNat(S.x,S.y,S.r);K.stampC(S.x,S.y,S.r-20,zt,BIO.urban,id)}   // arena: tutta pavimentata
 else{K.clearNat(S.x,S.y,S.k=='f'?300:S.r*.8);K.stampC(S.x,S.y,S.r,zt,S.k=='f'?BIO.farm:BIO.rock,id)}}

const PLAN={};
// Via spezzata solo dove serve: i FIUMI si attraversano (addRoad ci mette il ponte), laghi e mare no (la via si ferma a riva).
// Un tratto che corre DENTRO il fiume per più di ~400 px viene scartato: sarebbe un ponte lungo parallelo all'acqua.
PLAN.runs=(K,pts,w,cls,sw)=>{let run=[],pend=[],bad=false;
 const flush=()=>{if(run.length>=2)K.ts.push({pts:run,w,ty:0,cls,sw});run=[];pend=[]};
 for(const p of pts){
  if(!wetCell(p[0],p[1])){if(run.length)run.push(...pend);pend=[];bad=false;run.push(p);continue}
  if(bad)continue;
  if(!riverCell(p[0],p[1])||pend.length>=8){flush();bad=true;continue}
  pend.push(p)}
 flush()};
PLAN.road=(K,A,B,w,cls,sw)=>PLAN.runs(K,K.st(A,B,w,cls,sw).pts,w,cls,sw);

// distHalf: semilati dell'impronta di un quartiere lungo il suo asse e di traverso (con il margine per le vie perimetrali e i loro capi); null = anello (vale il raggio)
const distHalf=D=>D.kind=='grid'?[D.W/2+70,D.H/2+70]:D.kind=='line'?[D.L/2+80,290]:null;
// ----- stili dei quartieri a griglia: P = lato medio degli isolati, nx/ny = quanti, ws/wa = larghezza di vie e viali, ax/ay = allungamento degli isolati -----
const GST={
 dense:{P:[205,245],nx:[4,6],ny:[3,5],ws:[22,28],wa:[36,42]},                              // centro storico: isolati piccoli, vie strette
 std:{P:[280,350],nx:[3,5],ny:[2,4],ws:[28,38],wa:[46,54]},
 big:{P:[390,470],nx:[2,3],ny:[2,3],ws:[34,42],wa:[50,58]},                                // super-isolati riempiti da mini-siti
 long:{P:[220,270],nx:[2,3],ny:[3,5],ws:[26,34],wa:[46,54],ax:[1.7,2.2],ay:[.62,.78]}};    // isolati lunghi e stretti (a schiera)
// ----- tonalità dei quartieri: 2-4 palette vicine (una "famiglia" di colore scelta in base al carattere), aggiunte in coda a BPAL -----
// ogni famiglia: [tinta min, max, saturazione min, max, luminosità del tetto min, max]; il bordo è la stessa tinta, più scura
const TONES={res:[[8,26,30,44,38,52],[34,48,28,40,42,56],[40,55,14,24,52,64],[345,365,22,34,40,52],[90,130,14,24,38,50]],
 com:[[200,228,16,30,36,50],[0,360,0,6,34,56],[170,192,16,28,34,46],[250,278,14,26,36,48]],
 ind:[[200,222,8,16,32,46],[0,360,0,4,30,48],[135,165,8,16,32,44],[14,26,22,34,30,40]],
 mil:[[62,86,16,28,30,42],[36,48,18,28,40,52],[100,135,12,22,28,38]]};
const hsl=(h,s,l)=>`hsl(${((h%360)+360)%360|0},${clamp(s,0,100)|0}%,${clamp(l,8,92)|0}%)`;
function tone(K,ch){const{R,rr,ri,pick}=K,f=pick(TONES[ch]||TONES.com),wild=R()<.12,h0=rr(f[0],f[1]),s0=rr(f[2],f[3]),l0=rr(f[4],f[5]),out=[];   // wild: quartiere variopinto
 for(let i=0,n=ri(2,4);i<n;i++){const h=wild?h0+i*rr(50,110):h0+rr(-9,9),s=s0+rr(-6,6),l=l0+rr(-7,7);out.push(BPAL.push([hsl(h,s+4,l-13),hsl(h,s,l)])-1)}
 if(R()<.2)out.push(pick({res:PAL_RES,com:PAL_COM,ind:PAL_IND,mil:PAL_MIL}[ch]||PAL_CITY));   // ogni tanto un edificio "fuori tono"
 return out}
// ----- tonalità di un tipo di sito (SITE_TONE in AGconf.js): 3 palette vicine per gli edifici e i due colori del piazzale [base, scuro]; null per le città -----
function siteTone(K,k){const{rr}=K,f=SITE_TONE[k];if(!f)return null;const h0=rr(f[0],f[1]),s0=rr(f[2],f[3]),l0=rr(f[4],f[5]),pals=[];
 for(let i=0;i<3;i++){const h=h0+rr(-6,6),s=s0+rr(-5,5),l=l0+rr(-6,6);pals.push(BPAL.push([hsl(h,s+4,l-13),hsl(h,s,l)])-1)}
 const sl=clamp(l0*.66,18,36);return{pals,slab:[hsl(h0,s0*.5,sl),hsl(h0,s0*.5,sl-8)]}}
// ----- CITTÀ: più quartieri fusi insieme. Ogni quartiere ha una forma (griglia irregolare con angoli tagliati, anello con raggi, via lineare),
// un angolo (spesso a 45° rispetto al vicino) e un carattere (com commerciale, res residenziale, ind industriale, mil militare) che decide edifici e piazzali -----
PLAN.mkCity=(K,x,y,sc,small)=>{const{R,rr,ri,pick}=K,ds=[];
 const mkD=(x,y,a,kind,ch)=>{
  if(kind=='ring'){const Rr=rr(300,380)*Math.max(.85,sc),two=!small&&R()<.45;return{kind,ch,x,y,a,Rr,two,rad:Rr+(two?480:270)}}
  if(kind=='line'){const L=rr(800,1200)*sc;return{kind,ch,x,y,a,L,rad:L/2+60}}
  const st=pick(['std','dense','big','big','long','std']),g=GST[st],nx=Math.max(2,Math.round(ri(g.nx[0],g.nx[1])*sc)),ny=Math.max(2,Math.round(ri(g.ny[0],g.ny[1])*sc)),P=rr(g.P[0],g.P[1]),cw=[],chh=[];
  for(let i=0;i<nx;i++)cw.push(P*(g.ax?rr(g.ax[0],g.ax[1]):rr(.8,1.3)));for(let j=0;j<ny;j++)chh.push(P*(g.ay?rr(g.ay[0],g.ay[1]):rr(.8,1.3)));
  const W=cw.reduce((s,v)=>s+v,0),H=chh.reduce((s,v)=>s+v,0),mask=new Uint8Array(nx*ny).fill(1);
  for(let k=0,nk=nx*ny>=9?ri(0,2):0;k<nk;k++){const ax=R()<.5,ay=R()<.5,kx=ri(1,Math.max(1,(nx-1)>>1)),ky=ri(1,Math.max(1,(ny-1)>>1));   // angoli tagliati: sagoma asimmetrica
   for(let i=0;i<kx;i++)for(let j=0;j<ky;j++)mask[(ay?ny-1-j:j)*nx+(ax?nx-1-i:i)]=0}
  return{kind:'grid',st,g,ch,x,y,a,nx,ny,cw,chh,W,H,mask,rad:Math.hypot(W,H)/2*.84+20,riv:R()<.55}};
 const D0=mkD(x,y,R()*Math.PI,small?pick(['grid','ring','line']):pick(['grid','grid','grid','ring']),'com');   // le strade arriveranno dopo (genRoads)
 if(!K.dryD(D0,[]))return null;ds.push(D0);
 const nd=small?ri(0,1):Math.max(1,Math.round(ri(2,4)*sc*K.PROF.cd));
 for(let k=0;k<nd;k++)for(let t=0;t<30;t++){const par=pick(ds),ph=R()*TAU,u=R(),a=u<.45?par.a+Math.PI/4:u<.7?par.a:R()*Math.PI,
   D=mkD(0,0,a,pick(['grid','grid','grid','ring','line']),pick(['res','res','com','ind','mil','res','ind'])),d=par.rad+D.rad+rr(25,80);
  D.x=par.x+Math.cos(ph)*d;D.y=par.y+Math.sin(ph)*d;D.par=ds.indexOf(par);if(K.dryD(D,ds)){ds.push(D);break}}
 let r=0;for(const D of ds)r=Math.max(r,Math.hypot(D.x-x,D.y-y)+D.rad);
 return{x,y,r,ds,a:0}};
PLAN.g=(K,S)=>{const{rr}=K;S.ends=[];
 S.ds.forEach((D,di)=>{({grid:cityGrid,ring:cityRing,line:cityLine})[D.kind](K,S,D,di);
  if(di>0){const par=S.ds[D.par],nr=(o,q)=>o.ends.reduce((b,e)=>Math.hypot(e[0]-q.x,e[1]-q.y)<Math.hypot(b[0]-q.x,b[1]-q.y)?e:b);PLAN.road(K,nr(par,D),nr(D,par),rr(46,56),'av',1)}
  S.ends.push(...D.ends)})};
// QUARTIERE A GRIGLIA (stile in GST: centro storico, normale, super-isolati, a schiera), con varianti combinate a caso:
// - smussi diagonali sugli angoli (la via perimetrale corre a ~45° e gli isolati del bordo diventano triangoli; solo con isolati medi o grandi)
// - via diagonale interna: prende il posto delle vie di un blocco 2×2 o 3×3 e lo divide in due grandi triangoli
// - isolati uniti (la via fra loro sparisce) con un edificio lungo e articolato, rotatorie negli incroci
// - viale curvo: prende il posto di una via interna per tutta la sua lunghezza (gli isolati ai lati si uniscono a coppie)
function cityGrid(K,S,D,di){const{R,rr,ri,pick,shuf,m}=K,c=Math.cos(D.a),s=Math.sin(D.a),T=(u,v)=>[D.x+u*c-v*s,D.y+u*s+v*c],nx=D.nx,ny=D.ny,xs=[-D.W/2],ys=[-D.H/2],mu=nx>>1,mv=ny>>1;D.T=T;D.ends=[];
 for(let i=0;i<nx;i++)xs.push(xs[i]+D.cw[i]);for(let j=0;j<ny;j++)ys.push(ys[j]+D.chh[j]);
 const id=(i,j)=>j*nx+i,on=(i,j)=>i>=0&&j>=0&&i<nx&&j<ny&&D.mask[id(i,j)]===1,wU=[],wV=[],nk=(i,j)=>i*1000+j,
  CUT=new Array(nx*ny).fill(null),cut=(i,j)=>i>=0&&j>=0&&i<nx&&j<ny?CUT[id(i,j)]:null,asp=(i,j)=>D.cw[i]/D.chh[j],diags=[],DN=new Set();
 const g=D.g;for(let i=0;i<=nx;i++)wU.push(i==mu?rr(g.wa[0],g.wa[1]):rr(g.ws[0],g.ws[1]));for(let j=0;j<=ny;j++)wV.push(j==mv?rr(g.wa[0],g.wa[1]):rr(g.ws[0],g.ws[1]));
 const isC=(i,j)=>di==0&&i==mu&&j==mv;
 // 1) smussi diagonali (0 = alto-sx, 1 = alto-dx, 2 = basso-dx, 3 = basso-sx). keep = metà tenuta: prima lettera u/l (sopra/sotto), seconda l/r (sinistra/destra)
 //    solo con isolati medi o grandi: con quelli piccoli i triangoli del bordo sarebbero inutilizzabili
 if(nx>=3&&ny>=3&&(D.st=='std'||D.st=='big')&&R()<.5)for(const cr of shuf([0,1,2,3]).slice(0,R()<.35?2:1)){const k=ri(2,Math.min(3,Math.min(nx,ny)-1)),fi=cr==1||cr==2,fj=cr>=2,
   bI=ii=>fi?nx-1-ii:ii,bJ=jj=>fj?ny-1-jj:jj,nI=ii=>fi?nx-ii:ii,nJ=jj=>fj?ny-jj:jj,keep=['lr','ll','ul','ur'][cr],dg=fi!==fj?'d':'a';
  let ok=true;for(let ii=0;ii<k;ii++)for(let jj=0;jj<k-ii;jj++)if(!on(bI(ii),bJ(jj))||cut(bI(ii),bJ(jj))||isC(bI(ii),bJ(jj)))ok=false;if(!ok)continue;
  for(let ii=0;ii<k;ii++)for(let jj=0;jj<k-ii;jj++){const i=bI(ii),j=bJ(jj);if(ii+jj<k-1)D.mask[id(i,j)]=0;else CUT[id(i,j)]={d:dg,keep}}
  diags.push(Array.from({length:k+1},(_,t)=>[nI(k-t),nJ(t)]))}
 // unione di isolati: toglie TUTTE le vie interne del rettangolo di isolati [i0..i1]×[j0..j1]; due unioni non condividono incroci del bordo.
 // MH = tratto di via verticale i (fra le righe j e j+1) tolto, MV = tratto di via orizzontale j (fra le colonne i e i+1) tolto
 const MH=new Set(),MV=new Set(),usedN=new Set(),mrg=new Map(),
  merge=(i0,j0,i1,j1)=>{if(i0<0||j0<0||i1>=nx||j1>=ny||i0==i1&&j0==j1)return null;
   for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++)if(!on(i,j)||cut(i,j)||mrg.has(id(i,j))||isC(i,j))return null;
   const bn=[];for(let i=i0+1;i<=i1;i++)bn.push(nk(i,j0),nk(i,j1+1));for(let j=j0+1;j<=j1;j++)bn.push(nk(i0,j),nk(i1+1,j));if(bn.some(n=>usedN.has(n)))return null;
   for(const n of bn)usedN.add(n);
   for(let i=i0+1;i<=i1;i++)for(let j=j0;j<=j1;j++)MH.add(nk(i,j));for(let j=j0+1;j<=j1;j++)for(let i=i0;i<=i1;i++)MV.add(nk(i,j));
   const B={i0,j0,i1,j1};for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++)mrg.set(id(i,j),B);return B};
 // 2) via diagonale interna: SOSTITUISCE le vie interne di un blocco 2×2 o 3×3 (spariscono e la diagonale le rimpiazza): due grandi isolati triangolari, non tanti pezzetti
 if(nx>=2&&ny>=2&&R()<.5)for(let t=0;t<16;t++){const k=ri(2,Math.min(3,nx,ny)),i0=ri(0,nx-k),j0=ri(0,ny-k);let W0=0,H0=0;for(let q=0;q<k;q++){W0+=D.cw[i0+q];H0+=D.chh[j0+q]}
  if(W0/H0<.7||W0/H0>1.45)continue;const B=merge(i0,j0,i0+k-1,j0+k-1);if(!B)continue;
  const dg=R()<.5?'d':'a',q={d:dg,keep:'both'};for(let i=i0;i<i0+k;i++)for(let j=j0;j<j0+k;j++)CUT[id(i,j)]=q;
  diags.push(dg=='d'?[[i0,j0],[i0+k,j0+k]]:[[i0,j0+k],[i0+k,j0]]);break}
 for(const dl of diags)for(const[i,j]of dl)DN.add(nk(i,j));
 // 3) isolati uniti (2×1, 3×1, 2×2): la via fra loro sparisce e al suo posto nasce un edificio lungo e articolato (complexB)
 if(R()<.6)for(let t=0,nm=ri(1,3),dn=0;t<40&&dn<nm;t++){const sz=pick([[2,1],[1,2],[2,1],[1,2],[3,1],[1,3],[2,2]]);if(sz[0]>nx||sz[1]>ny)continue;
  const i0=ri(0,nx-sz[0]),j0=ri(0,ny-sz[1]),B=merge(i0,j0,i0+sz[0]-1,j0+sz[1]-1);if(B){B.cx=1;dn++}}
 // 3b) viale curvo: SOSTITUISCE una via interna per tutta la sua lunghezza; gli isolati ai due lati si uniscono a coppie e il viale li attraversa con una curva ampia (o a S)
 let CVr=null;const CVN=new Set();
 if(R()<.35)for(let t=0;t<6&&!CVr;t++){const hz=R()<.5,n1=hz?ny:nx,n2=hz?nx:ny;if(n1<2)continue;const k=ri(1,n1-1);   // hz: sostituisce la via orizzontale j=k, altrimenti la verticale i=k
  const cl=q=>hz?[[q,k-1],[q,k]]:[[k-1,q],[k,q]];let ok=true;
  for(let q=0;q<n2&&ok;q++)for(const[i,j]of cl(q))if(!on(i,j)||cut(i,j)||mrg.has(id(i,j))||isC(i,j))ok=false;
  const nodes=[];for(let q=0;q<=n2;q++)nodes.push(hz?nk(q,k):nk(k,q));if(!ok||nodes.some(n=>usedN.has(n)||DN.has(n)))continue;
  for(const n of nodes){usedN.add(n);CVN.add(n)}
  for(let q=0;q<n2;q++){const B=hz?{i0:q,j0:k-1,i1:q,j1:k,cv:1}:{i0:k-1,j0:q,i1:k,j1:q,cv:1};(hz?MV:MH).add(hz?nk(q,k):nk(k,q));for(const[i,j]of cl(q))mrg.set(id(i,j),B)}
  const cs=hz?D.chh:D.cw,amp=Math.min(cs[k-1],cs[k])*rr(.2,.3)*(R()<.5?1:-1),sw=R()<.4,L0=hz?xs[0]:ys[0],L1=hz?xs[nx]:ys[ny],c0=hz?ys[k]:xs[k],pts=[];
  for(let q=0;q<=32;q++){const tt=q/32,a=L0-45+(L1-L0+90)*tt,o=amp*(sw?Math.sin(tt*TAU):Math.sin(tt*Math.PI));pts.push(hz?[a,c0+o]:[c0+o,a])}
  CVr={pts,w:rr(34,42)}}
 const edge=(i,j,sd)=>{if(!on(i,j))return false;const q=cut(i,j);if(!q||q.keep=='both')return true;return sd=='t'?q.keep[0]=='u':sd=='b'?q.keep[0]=='l':sd=='l'?q.keep[1]=='l':q.keep[1]=='r'};
 const sV=(i,j)=>j>=0&&j<ny&&(edge(i-1,j,'r')||edge(i,j,'l'))&&!MH.has(nk(i,j)),sH=(i,j)=>i>=0&&i<nx&&(edge(i,j-1,'b')||edge(i,j,'t'))&&!MV.has(nk(i,j));
 // 4) rotatorie in incroci interni a quattro vie (non sulle diagonali, non vicine fra loro)
 const RB=new Map();
 if(R()<.45)for(let t=0,nr=ri(1,2);t<24&&RB.size<nr;t++){const i=ri(1,Math.max(1,nx-1)),j=ri(1,Math.max(1,ny-1));if(i>=nx||j>=ny||DN.has(nk(i,j))||RB.has(nk(i,j)))continue;
  if(!(sV(i,j-1)&&sV(i,j)&&sH(i-1,j)&&sH(i,j)))continue;if([...RB.keys()].some(q=>Math.abs((q/1000|0)-i)+Math.abs(q%1000-j)<2))continue;
  RB.set(nk(i,j),Math.max(wU[i],wV[j])/2+rr(46,64))}
 // 5) vie: tratti consecutivi; ai capi verso l'esterno si allungano di 45 px; alle rotatorie la via si interrompe sull'anello
 const W=q=>T(q[0],q[1]),emit=(nodes,keys,w,cls,av)=>{let cur=[];const flush=()=>{if(cur.length>=2){const pts=[];for(let k=0;k<cur.length-1;k++){const p=K.st(W(cur[k]),W(cur[k+1]),w,cls,1).pts;pts.push(...(k?p.slice(1):p))}PLAN.runs(K,pts,w,cls,1)}cur=[]};
  nodes.forEach((p,k)=>{const r=keys[k]!=null&&RB.get(keys[k]);if(r&&k>0&&k<nodes.length-1){const a=nodes[k-1],b=nodes[k+1],la=Math.hypot(p[0]-a[0],p[1]-a[1]),lb=Math.hypot(b[0]-p[0],b[1]-p[1]);
   cur.push([p[0]-(p[0]-a[0])/la*r,p[1]-(p[1]-a[1])/la*r]);flush();cur.push([p[0]+(b[0]-p[0])/lb*r,p[1]+(b[1]-p[1])/lb*r])}else cur.push(p)});flush()};
 for(let i=0;i<=nx;i++){let j0=-1;for(let j=0;j<=ny;j++){const a=j<ny&&sV(i,j);if(a&&j0<0)j0=j;if(!a&&j0>=0){
   const e0=!(on(i-1,j0-1)||on(i,j0-1)),e1=!(on(i-1,j)||on(i,j)),nodes=[],keys=[];if(e0){nodes.push([xs[i],ys[j0]-45]);keys.push(null)}
   for(let q=j0;q<=j;q++){nodes.push([xs[i],ys[q]]);keys.push(nk(i,q))}if(e1){nodes.push([xs[i],ys[j]+45]);keys.push(null)}
   emit(nodes,keys,wU[i],i==mu?'av':'st');if(i==mu){D.ends.push(W(nodes[0]),W(nodes[nodes.length-1]))}j0=-1}}}
 for(let j=0;j<=ny;j++){let i0=-1;for(let i=0;i<=nx;i++){const a=i<nx&&sH(i,j);if(a&&i0<0)i0=i;if(!a&&i0>=0){
   const e0=!(on(i0-1,j-1)||on(i0-1,j)),e1=!(on(i,j-1)||on(i,j)),nodes=[],keys=[];if(e0){nodes.push([xs[i0]-45,ys[j]]);keys.push(null)}
   for(let q=i0;q<=i;q++){nodes.push([xs[q],ys[j]]);keys.push(nk(q,j))}if(e1){nodes.push([xs[i]+45,ys[j]]);keys.push(null)}
   emit(nodes,keys,wV[j],j==mv?'av':'st');if(j==mv){D.ends.push(W(nodes[0]),W(nodes[nodes.length-1]))}i0=-1}}}
 for(const dl of diags)emit(dl.map(([i,j])=>[xs[i],ys[j]]),dl.map(()=>null),rr(30,38),'st');
 for(const[key,r]of RB){const p=W([xs[key/1000|0],ys[key%1000]]),pts=[];for(let k=0;k<=28;k++){const t=k/28*TAU;pts.push([p[0]+Math.cos(t)*r,p[1]+Math.sin(t)*r])}
  PLAN.runs(K,pts,rr(26,32),'st',1);m.flat.push({k:'circ',t:2,x:p[0],y:p[1],r:r-17,pool:1})}
 // 6) viale curvo (scelto al passo 3b: ha preso il posto di una via)
 if(CVr){PLAN.runs(K,CVr.pts.map(W),CVr.w,'av',1);D.ends.push(W(CVr.pts[0]),W(CVr.pts[CVr.pts.length-1]))}   // i suoi capi collegano gli altri quartieri (può aver preso il posto del viale centrale)
 if(!D.ends.length)D.ends.push(W([xs[0]-45,ys[mv]]),W([xs[nx]+45,ys[mv]]),W([xs[mu],ys[0]-45]),W([xs[mu],ys[ny]+45]));   // le unioni hanno tolto tutti i viali centrali: capi sul perimetro
 for(let i=0;i<=nx;i++)for(let j=0;j<=ny;j++){if(RB.has(nk(i,j))||CVN.has(nk(i,j)))continue;const n=(sV(i,j-1)?1:0)+(sV(i,j)?1:0)+(sH(i-1,j)?1:0)+(sH(i,j)?1:0);if(n<2)continue;const p=W([xs[i],ys[j]]);if(!wetCell(p[0],p[1]))m.junc.push({x:p[0],y:p[1],w:Math.max(wU[i],wV[j]),a:D.a})}
 // 7) isolati (dopo le vie: gli edifici le evitano)
 const pals=D.tone;   // tonalità del quartiere (vedi tone)
 K.later.push(()=>{const done=new Set();
  for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){if(!on(i,j)||done.has(id(i,j)))continue;const B=mrg.get(id(i,j))||{i0:i,j0:j,i1:i,j1:j};for(let a=B.i0;a<=B.i1;a++)for(let b=B.j0;b<=B.j1;b++)done.add(id(a,b));
   const u0=xs[B.i0]+wU[B.i0]/2+14,u1=xs[B.i1+1]-wU[B.i1+1]/2-14,v0=ys[B.j0]+wV[B.j0]/2+14,v1=ys[B.j1+1]-wV[B.j1+1]/2-14,q=cut(i,j);
   const bk={p:T((u0+u1)/2,(v0+v1)/2),bw:u1-u0,bh:v1-v0,here:(u,v)=>T((u0+u1)/2+u,(v0+v1)/2+v),gate:T((u0+u1)/2,v1+16),u0,u1,v0,v1,cx:B.cx};
   if(B.cv){m.flat.push({k:'slab',t:D.ch=='ind'?1:D.ch=='mil'?4:0,x:bk.p[0],y:bk.p[1],w:bk.bw+36,h:bk.bh+36,a:D.a,dt:1});curveBlock(K,D,bk,CVr,pals);continue}
   if(q){const halves=q.keep!='both'?[q.keep]:q.d=='d'?['ur','ll']:['ul','lr'];
    if(q.keep=='both')m.flat.push({k:'slab',t:D.ch=='ind'?1:D.ch=='mil'?4:0,x:bk.p[0],y:bk.p[1],w:bk.bw+36,h:bk.bh+36,a:D.a,dt:1});
    else{const U0=u0-18,U1=u1+18,V0=v0-18,V1=v1+18,cs={ul:[U0,V0],ur:[U1,V0],lr:[U1,V1],ll:[U0,V1]},opp={ul:'lr',lr:'ul',ur:'ll',ll:'ur'}[q.keep];
     m.flat.push({k:'pslab',t:D.ch=='ind'?1:D.ch=='mil'?4:0,a:D.a,pts:['ul','ur','lr','ll'].filter(k=>k!=opp).map(k=>T(cs[k][0],cs[k][1]))})}
    for(const h of halves)triBlock(K,D,bk,h,pals);continue}
   cityBlock(K,D,bk,i==mu&&j==mv,di==0);
   // muretto attorno all'isolato (a caso, più spesso nei quartieri industriali e militari): i tratti che toccherebbero un edificio restano vuoti; 2-4 varchi a metà dei lati
   if(R()<(D.ch=='ind'||D.ch=='mil'?.55:.35)&&bk.bw>=120&&bk.bh>=120)K.wallRect(bk.p[0],bk.p[1],D.a,bk.bw-6,bk.bh-6,rr(12,16),K.shuf([bk.here(0,-bk.bh/2),bk.here(0,bk.bh/2),bk.here(-bk.bw/2,0),bk.here(bk.bw/2,0)]).slice(0,ri(2,4)))}
  // fuori dalla griglia: file di edifici (a tratti, a caso) sul lato esterno delle vie perimetrali, rivolti verso la via
  for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){if(!on(i,j)||cut(i,j))continue;
   for(const sdI of[0,1,2,3]){const nb=sdI==0?on(i,j-1):sdI==1?on(i,j+1):sdI==2?on(i-1,j):on(i+1,j);if(nb||R()<.2)continue;
    const hor=sdI<2,L=hor?xs[i+1]-xs[i]:ys[j+1]-ys[j],rw=hor?wV[sdI==0?j:j+1]:wU[sdI==2?i:i+1],base=hor?ys[sdI==0?j:j+1]:xs[sdI==2?i:i+1],sg=sdI%2?1:-1,c0=hor?(xs[i]+xs[i+1])/2:(ys[j]+ys[j+1])/2,a0=D.a+(hor?0:Math.PI/2);
    {const dep=rr(140,200),off=base+sg*(rw/2+14+dep/2),p=hor?T(c0,off):T(off,c0),sl=L-rr(20,50);   // striscia lungo la via: un mini-sito (formazione) invece di edifici sparsi
     if(!wetCell(p[0],p[1])&&R()<.85&&miniSite(K,p[0],p[1],sl,dep,a0,{pals,st:'long',ch:D.ch,riv:D.riv,slab:1})){K.stampR(p[0],p[1],sl+24,dep+24,a0,8,ZTI.urban,BIO.urban,S.id);continue}}
    for(let u=-L/2+rr(4,30);u<L/2-70;){const bw=rr(110,190),dep=rr(100,175);if(u+bw>L/2+30)break;
     if(R()<.78){const al=c0+u+bw/2,off=base+sg*(rw/2+14+dep/2),p=hor?T(al,off):T(off,al),a=a0+(R()<.2?rr(-.3,.3):0);
      if(!wetCell(p[0],p[1])&&K.fitB(p[0],p[1],bw,dep,a,a0,pick(BTOWN),'house',pals,1,D.riv,1))K.stampR(p[0],p[1],bw+24,dep+24,a0,8,ZTI.urban,BIO.urban,S.id)}
     u+=bw+rr(ALLEY,ALLEY+30)}}}})}
// mezzo isolato triangolare: un edificio a L lungo i due cateti (due corpi uniti nell'angolo retto, dentro l'ipotenusa) e un albero verso l'ipotenusa;
// se non c'è posto, un edificio solo nell'angolo retto
function triBlock(K,D,b,h,pals){const{R,rr,pick}=K,A=D.a,Lu=b.u1-b.u0,Lv=b.v1-b.v0,cu=h[1]=='r'?b.u1:b.u0,cv=h[0]=='u'?b.v0:b.v1,su=h[1]=='r'?-1:1,sv=h[0]=='u'?1:-1,
  P=(fu,fv)=>b.here(cu+su*Lu*fu-(b.u0+b.u1)/2,cv+sv*Lv*fv-(b.v0+b.v1)/2);
 if(Lu<150||Lv<150)return;
 const fu=clamp(Math.max(rr(.2,.28),(BLD_MIN+6)/Lv),0,.34),fv=clamp(Math.max(rr(.2,.28),(BLD_MIN+6)/Lu),0,.34),la=.9-fu,lb=.9-fv;   // spessori (frazioni del cateto): ogni spigolo resta entro .9 dell'ipotenusa
 const p1=P(la/2,fu/2),p2=P(fv/2,(fu+lb)/2);
 if(!K.addGroup([{x:p1[0],y:p1[1],w:la*Lu,h:fu*Lv,a:A,sh:'rect'},{x:p2[0],y:p2[1],w:fv*Lu,h:(lb-fu)*Lv+4,a:A,sh:'rect'}],{tight:true,pal:pick(pals),fz:1,riv:D.riv,gap:6,noSlab:1})){
  const p0=P(.25,.25);K.fitB(p0[0],p0[1],Lu*.46,Lv*.46,A,A,pick(['rect','L','rect','fact','cross','square']),'house',pals,1,D.riv)}
 const t=P(.45,.42);K.tree(t[0],t[1],rr(12,16))}
// un isolato: piazzale + contenuto secondo il carattere del quartiere
function cityBlock(K,D,b,ctr,first){const{R,rr,ri,pick,m}=K,ch=D.ch,A=D.a,bw=b.bw,bh=b.bh,p=b.p,here=b.here,rd=R(),pals=D.tone,jit=()=>A+(R()<.5?rr(-.5,.5):0);
 m.flat.push({k:'slab',t:ch=='ind'?1:ch=='mil'?4:0,x:p[0],y:p[1],w:bw+36,h:bh+36,a:A,dt:1});
 const corners=(k,r0,r1)=>{for(const[a,c]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const q=here(a*bw*k,c*bh*k);K.tree(q[0],q[1],rr(r0,r1))}};
 if(ctr&&first){m.flat.push({k:'circ',t:2,x:p[0],y:p[1],r:Math.min(bw,bh)*.46,pool:1});corners(.46,11,14);if(R()<.5)K.plazaRocks(p[0],p[1],Math.min(bw,bh)*.46,A);return}                        // piazza centrale della città
 if(bw<90||bh<90)return;
 if(b.cx&&complexB(K,D,b,pals))return;                                                                                                       // isolati uniti: un edificio lungo e articolato
 if(ch!='ind'&&ch!='mil'){
  if(rd<.06){const ps=ri(0,1e6);m.flat.push({k:'park',x:p[0],y:p[1],w:bw,h:bh,a:A,s:ps});K.parkRocks(here,bw,bh,ps);for(let t=0,n=ri(6,12);t<n;t++){const q=here(rr(-.45,.45)*bw,rr(-.45,.45)*bh);K.tree(q[0],q[1],rr(11,17))}return}   // parco: rocce e alberi
  if(rd<.10){m.flat.push({k:'circ',t:2,x:p[0],y:p[1],r:Math.min(bw,bh)*.46});corners(.36,12,16);if(R()<.7)K.plazaRocks(p[0],p[1],Math.min(bw,bh)*.46,A);return}}   // piazza tonda
 if(rd<.14&&!ctr){if(R()<.4)m.flat.push({k:'construction',x:p[0],y:p[1],w:bw-20,h:bh-20,a:A});else m.flat.push({k:'lot',x:p[0],y:p[1],w:bw-8,h:bh-8,a:A,s:ri(0,1e6),mil:ch=='mil'?1:0});return}
 const big=Math.min(bw,bh)>=180;
 if(Math.max(bw,bh)>=2*M0+ALLEY&&R()<(D.st=='big'?.75:ch=='res'?.6:ch=='com'?.5:.4)&&miniSite(K,p[0],p[1],bw-6,bh-6,A,{pals,st:D.st,ch,riv:D.riv}))return;          // mini-sito: formazione di edifici ruotata a caso, alternata a caso agli edifici classici qui sotto
 if(ch=='ind'&&rd<.6&&big){const w1=bw*.6,o=K.fitB(...here(-bw*.18,0),w1,bh-10,A,A,pick(['fact','U','rect','fact']),'house',pals,2,D.riv);                 // fabbrica + silos, serbatoi o container
  const k=ri(0,2);for(let i=0,n=ri(1,3);i<n;i++){const q=here(bw*.33,(i-(n-1)/2)*bh*.3),s2=Math.min(bw*.28,rr(58,86));
   if(k==0)K.addX(q[0],q[1],s2,s2,0,'tank',0,{gap:4,o:{v:ri(0,1)}});else if(k==1)K.addX(q[0],q[1],s2*.8,s2*.8,0,i?'stack':'tank',0,{gap:4,o:{v:0}});else K.addX(q[0],q[1],56*ri(1,2),24*ri(1,2),A+Math.PI/2,'cont',0,{gap:4})}
  if(o)return}
 if(ch=='mil'&&rd<.7&&big){K.wallRect(p[0],p[1],A,bw+10,bh+10,14,[b.gate]);                                                                // isolato recintato: caserma + parcheggio mezzi
  const o=K.fitB(...here(-bw*.14,0),bw*.56,bh*.7,A,A,pick(['H','U','fact','rect']),'house',pals,2,D.riv);const q=here(bw*.3,0);
  m.flat.push({k:'lot',x:q[0],y:q[1],w:Math.min(120,bw*.3),h:bh*.7,a:A+Math.PI/2,s:ri(0,1e6),mil:1});if(o)return}
 if(!ctr&&rd<.5&&bw>=2*M0+ALLEY+20&&bh>=150){const w2=bw/2-ALLEY/2;for(const sd of[-1,1]){const q=here(sd*(bw/4),0);K.fitB(q[0],q[1],w2,Math.min(bh-4,rr(150,bh)),jit(),A,pick(['rect','rect','L','U','fact']),'house',pals,null,D.riv)}return}
 if((ctr||rd<.88)&&big){const k=ctr||ch=='com'?ri(0,1):ri(0,2),g=2,parts=[];                                                               // gruppo di edifici fusi in un'unica struttura
  if(k==0){const ht=Math.min(bh*.44,rr(120,170)),wt=Math.min(bw*.6,rr(150,200));parts.push({x:0,y:bh/2-ht/2-6,w:bw-12,h:ht,sh:'rect'},{x:0,y:bh/2-ht-6-g-Math.min(bw,bh)*.22,w:Math.min(bw*.6,wt*1.1),h:Math.min(bw*.6,wt*1.1),sh:pick(['square','oct','hex','circle','tower'])})}
  else if(k==1){const w1=bw*.62,h1=bh*.46,w2=bw*.3,h2=bh*.9;parts.push({x:-bw/2+w1/2+3,y:-bh/2+h1/2+3,w:w1,h:h1,sh:'rect'},{x:bw/2-w2/2-3,y:0,w:w2,h:h2,sh:'rect'},{x:-bw/2+w1/2+3,y:bh/2-bh*.22-3,w:w1,h:bh*.4,sh:pick(['rect','fact','U'])})}
  else{const wb=(bw-8-2*g)/3;for(let q=-1;q<=1;q++)parts.push({x:q*(wb+g),y:0,w:wb,h:bh-14,sh:q==0?pick(['rect','H']):'rect'})}
  const ps=parts.filter(q=>q.w>=110&&q.h>=110).map(q=>{const w=here(q.x,q.y);return{x:w[0],y:w[1],w:q.w,h:q.h,a:jit(),sh:q.sh}});
  if(ps.length==parts.length&&K.addGroup(ps,{tight:true,pal:pick(pals),fz:1,riv:D.riv}))return}
 const w=Math.min(bw,Math.max(120,rr(.70,.95)*bw)),h=Math.min(bh,Math.max(120,rr(.70,.95)*bh)),ba=A+(R()<.55?rr(-.55,.55):(R()<.15?1.5708:0));
 let o=K.fitB(p[0],p[1],w,h,ba,A,ctr||ch=='com'?pick(['tower','quad','cross','fact','oct']):pick(BTOWN),'house',pals,null,D.riv);
 if(!o)o=K.fitB(p[0],p[1],w*.72,h*.72,ba,A,'rect','house',pals,null,D.riv);
 if(!o&&bw>=210&&bh>=210)for(const[sa,sb]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const q=here(sa*bw*.25,sb*bh*.25);if(K.fitB(q[0],q[1],bw/2-10,bh/2-10,A,A,'rect','house',pals,null,D.riv))o=true}   // il fiume taglia l'isolato: un edificio per quarto
 if(o&&rd>.93&&bw>=230&&bh>=230)K.wallRect(p[0],p[1],A,bw+14,bh+14,12,[b.gate])}
// ===== PATTERN DI EDIFICI =====
// Un pattern dispone edifici in un'area w×h centrata in (0,0) e restituisce le parti {u,v,w,h,a,sh} (a e sh facoltativi). Le parti che si toccano formano un unico complesso.
// Per aggiungerne uno basta una funzione qui e il suo nome nelle liste di PAT_BY.
const M0=BLD_MIN+4,AL=ALLEY;   // lato minimo usato dai pattern (un filo sopra BLD_MIN) · vicolo fra due edifici separati della stessa formazione
// n edifici larghi circa t lungo un lato w, separati da vicoli AL: [n, larghezza vera, posizione (centro) del k-esimo]
const strip=(w,t,mx)=>{const n=clamp(Math.floor((w+AL)/(t+AL)),1,mx||6),b=(w-(n-1)*AL)/n;return[n,b,k=>-w/2+b/2+k*(b+AL)]};
const PATS={
 row:(K,w,h)=>{const{rr}=K,d=Math.min(h,rr(90,150)),[n,b,P]=strip(w,rr(100,170));if(d<M0||b<M0)return[];return Array.from({length:n},(_,i)=>({u:P(i),v:0,w:b,h:d}))},   // in fila
 rows2:(K,w,h)=>{const{rr}=K,d=Math.min((h-AL)/2,rr(80,130)),[n,b,P]=strip(w,rr(100,150),5),o=[];if(d<M0||b<M0)return o;
  for(let i=0;i<n;i++)for(const sd of[-1,1])o.push({u:P(i),v:sd*(h/2-d/2),w:b,h:d,a:sd>0?0:Math.PI});return o},                                                         // due file affacciate
 arc:(K,w,h)=>{const{rr}=K,sz=rr(M0+10,110),rx=w/2-sz/2,ry=h-sz,o=[];if(ry<sz*.6||rx<sz)return o;const n=clamp(Math.floor(Math.PI*(Math.min(rx,ry)-sz/2)/(sz+AL+10)),3,9);
  for(let i=0;i<n;i++){const t=Math.PI*(i+.5)/n;o.push({u:Math.cos(t)*rx,v:h/2-sz/2-Math.sin(t)*ry,w:sz,h:sz*rr(.85,1),a:t-Math.PI/2})}return o},                             // semicerchio
 L:(K,w,h)=>{const{rr}=K,d=Math.min(rr(90,130),w*.45,(h-AL)*.5),o=[];if(d<M0)return o;const[nx,bx,Px]=strip(w,rr(110,160),5),Lc=h-d-AL,[ny,by,Py]=strip(Lc,rr(110,160),4);if(bx<M0)return o;
  for(let i=0;i<nx;i++)o.push({u:Px(i),v:h/2-d/2,w:bx,h:d});if(by>=M0)for(let j=0;j<ny;j++)o.push({u:-w/2+d/2,v:-h/2+Lc/2+Py(j),w:d,h:by});return o},                      // a L
 T:(K,w,h)=>{const{rr}=K,d=Math.min(rr(90,130),h*.42,w*.4),Lc=h-d-AL,o=[];if(d<M0||Lc<M0)return o;const[nx,bx,Px]=strip(w,rr(110,160),5),[ny,by,Py]=strip(Lc,rr(110,150),4);if(bx<M0||by<M0)return o;
  for(let i=0;i<nx;i++)o.push({u:Px(i),v:-h/2+d/2,w:bx,h:d});for(let j=0;j<ny;j++)o.push({u:0,v:h/2-Lc/2+Py(j),w:d,h:by});return o},                                       // a T
 quinc:(K,w,h)=>{const{rr,pick}=K,m=Math.min(w,h),k=Math.max(M0,m*rr(.24,.3)),c=Math.min(m*rr(.3,.38),m-2*k-2*AL);if(c<M0)return[];const o=[{u:0,v:0,w:c,h:c,sh:pick(['oct','square','circle','cross','tower','hex'])}];
  for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]])o.push({u:a*(w/2-k/2),v:b*(h/2-k/2),w:k,h:k});return o},                                                                  // uno al centro e quattro agli angoli
 court:(K,w,h)=>{const{R,rr}=K,d=Math.max(M0,Math.min(rr(72,110),w*.3,h*.3));if(h-2*d<AL||w-2*d<AL)return[];const o=[{u:0,v:-h/2+d/2,w,h:d},{u:-w/2+d/2,v:0,w:d,h:h-2*d+6}];
  if(R()<.65)o.push({u:0,v:h/2-d/2,w,h:d});o.push({u:w/2-d/2,v:0,w:d,h:h-2*d+6});return o},                                                                                  // corte (chiusa o a U): corpi uniti
 pinwheel:(K,w,h)=>{const{rr}=K,m=Math.min(w,h),d=Math.max(M0,m*rr(.26,.3)),l=m-d-AL,hm=m/2;if(l<d+10)return[];
  return[{u:-hm+l/2,v:-hm+d/2,w:l,h:d},{u:hm-d/2,v:-hm+l/2,w:d,h:l},{u:hm-l/2,v:hm-d/2,w:l,h:d},{u:-hm+d/2,v:hm-l/2,w:d,h:l}]},                                              // girandola (vicoli fra i bracci)
 stagger:(K,w,h)=>{const{rr}=K,[nx,bx,Px]=strip(w,rr(M0+8,115),5),[ny,by,Py]=strip(h,rr(M0+4,100),4),o=[];if(nx<2||ny<2||bx<M0||by<M0)return o;
  for(let j=0;j<ny;j++){const odd=j%2;for(let i=0;i<nx-odd;i++)o.push({u:Px(i)+(odd?(bx+AL)/2:0),v:Py(j),w:bx,h:by})}return o},                                          // a scacchiera sfalsata (come i mattoni)
 comb:(K,w,h)=>{const{rr}=K,d=Math.max(M0,Math.min(rr(80,110),h*.4)),[n,tw,P]=strip(w,rr(70,100),5),tl=h*rr(.6,.95)-d;if(tl<M0||n<2||tw<M0)return[];
  const o=[{u:0,v:-h/2+d/2,w,h:d}];for(let i=0;i<n;i++)o.push({u:P(i),v:-h/2+d-4+tl/2,w:tw,h:tl+4});return o},                                                            // pettine: denti uniti alla spina, vicoli fra i denti
 twin:(K,w,h)=>{const{pick}=K,t=Math.min(h*.9,w*.38),l=w-2*t+8,sh=pick(['tower','square','oct','quad']);if(t<M0||l<M0)return[];
  return[{u:-w/2+t/2,v:0,w:t,h:t,sh},{u:w/2-t/2,v:0,w:t,h:t,sh},{u:0,v:0,w:l,h:Math.max(M0,t*.42),sh:'rect'}]},                                                             // due torri e un ponte coperto (uniti)
 terrace:(K,w,h)=>{const{rr}=K,n=clamp(Math.floor(w/Math.max(rr(100,140),M0+4)),2,6),s=w/n,d=Math.min(h*.55,rr(90,130)),o=[];if(d<M0||s<M0)return o;
  for(let i=0;i<n;i++)o.push({u:-w/2+s*(i+.5),v:-h/2+d/2+(h-d)*i/(n-1),w:s+2,h:d});return o},                                                                              // a gradini (uniti)
 ring:(K,w,h)=>{const{rr,pick}=K,m=Math.min(w,h),sz=clamp(m*.22,M0+2,110),r=m/2-sz/2,c=Math.min(m*.3,2*(r-sz/2-AL)),o=[];if(r<sz*1.4||c<M0)return o;
  const n=clamp(Math.floor(TAU*(r-sz/2)/(sz*.9+AL)),4,10);o.push({u:0,v:0,w:c,h:c,sh:pick(['circle','oct','hex'])});
  for(let i=0;i<n;i++){const t=i/n*TAU;o.push({u:Math.cos(t)*r,v:Math.sin(t)*r,w:sz,h:sz*rr(.85,1),a:t+Math.PI/2})}return o},                                             // corona attorno a un edificio tondo
 cross:(K,w,h)=>{const{rr}=K,m=Math.min(w,h),d=Math.max(M0,m*rr(.22,.28)),pz=Math.max(m*rr(.13,.18),d/2+AL*.75),l=m/2-pz;if(l<M0)return[];
  return[{u:0,v:-pz-l/2,w:d,h:l},{u:0,v:pz+l/2,w:d,h:l},{u:-pz-l/2,v:0,w:l,h:d},{u:pz+l/2,v:0,w:l,h:d}]},                                                                  // quattro bracci attorno a una piazzetta
 fan:(K,w,h)=>{const{rr}=K,R0=h*rr(.9,1.2),cy=h/2+R0*.25,sp=Math.min(1.1,w/R0),r=R0*.8,bw=Math.min(h*.55,140),ri=r-bw/2,n=clamp(Math.floor(ri*sp/(M0+AL)),3,7),bt=Math.min(120,ri*sp/n-AL),o=[];
  if(bw<M0||bt<M0)return o;for(let i=0;i<n;i++){const t=-Math.PI/2+(i-(n-1)/2)*sp/n;o.push({u:Math.cos(t)*r,v:cy+Math.sin(t)*r,w:bw,h:bt,a:t})}return o},                // a ventaglio verso un fuoco
 grid2:(K,w,h)=>{const nx=w>h*1.4?3:2,bx=(w-(nx-1)*AL)/nx,by=(h-AL)/2,o=[];if(bx<M0||by<M0)return o;
  for(let j=0;j<2;j++)for(let i=0;i<nx;i++)o.push({u:-w/2+bx/2+i*(bx+AL),v:-h/2+by/2+j*(by+AL),w:bx,h:by});return o},                                                      // griglia regolare di edifici uguali
 bar:(K,w,h)=>{const{rr,pick}=K,L=w*rr(.75,.9),d=Math.min(h*.55,rr(100,150)),a=Math.min(h-d-14,rr(80,120)),aw=Math.min(L*.35,rr(90,130));if(d<M0||L<M0)return[];
  const o=[{u:0,v:-h/2+d/2,w:L,h:d,sh:pick(['rect','fact','H'])}];if(a>=M0&&aw>=M0)o.push({u:rr(-.3,.3)*L,v:-h/2+d-4+a/2,w:aw,h:a+4,sh:'rect'});return o}};   // stecca, a volte con un'ala (unita)
// quali pattern per ogni stile di quartiere (res = quartieri residenziali a griglia normale)
const PAT_BY={dense:['row','rows2','L','T','stagger','terrace','court','comb','grid2'],std:['rows2','L','T','quinc','court','pinwheel','stagger','arc','comb','twin','grid2','bar'],
 big:['court','comb','twin','ring','cross','pinwheel','quinc','fan','arc','bar','T','grid2'],long:['row','rows2','terrace','comb','stagger','bar','L'],res:['arc','quinc','rows2','L','pinwheel','ring','stagger','T','fan','court','cross']};
const PAT_SH={dense:['rect','rect','square','L'],big:['rect','fact','U','H','rect'],long:['rect','rect','L'],std:['rect','square','L','rect','oct']};
// MINI-SITO: un solo slab coerente diviso in 1-3 riquadri lungo il lato lungo (separati da un vicolo); in ognuno un pattern con rotazione casuale (0/90/180/270°, a volte 45°),
// stessa palette per tutto il riquadro. Gli edifici non hanno piazzali propri: c'è quello dell'isolato/sito, oppure (o.slab) quello del mini-sito.
// o: {pals, st (stile), ch (carattere), riv, slab (disegna anche lo slab), t (tipo di slab), shapes}
function miniSite(K,x,y,W,H,A,o){const{R,rr,pick}=K,c=Math.cos(A),s=Math.sin(A),lg=W>=H,L=lg?W:H,S2=lg?H:W;
 let n=clamp(Math.floor(L/Math.max(S2*rr(1,1.3),230)),1,3);if(n==1&&S2>=380&&R()<.5)n=2;   // si divide solo se ogni riquadro resta largo almeno ~230 px
 const fr=[];let acc=0;for(let i=0;i<n;i++){const f=rr(.8,1.2);fr.push(f);acc+=f}
 const list=PAT_BY[o.st=='big'||o.st=='dense'||o.st=='long'?o.st:o.ch=='res'?'res':'std'],shs=o.shapes||PAT_SH[o.st]||PAT_SH.std,pal=pick(o.pals);let any=0,a0=-L/2;
 for(let i=0;i<n;i++){const len=L*fr[i]/acc,mid=a0+len/2;a0+=len;const sw=lg?len-(n>1?AL:0):S2,sh=lg?S2:len-(n>1?AL:0),cu=lg?mid:0,cv=lg?0:mid;
  const ks=K.shuf(list),nt=Math.min(7,ks.length);let solo=null;   // solo: un pattern riuscito con un edificio solo, tenuto da parte (meglio una formazione vera)
  for(let t=0;t<=nt;t++){let kind,diag,rot,P;
   if(t<nt){kind=ks[t];diag=R()<.12&&'quinc pinwheel ring cross court'.includes(kind);rot=diag?pick([1,3,5,7])*Math.PI/4:pick([0,1,2,3])*Math.PI/2;
    const odd=Math.round(rot/(Math.PI/2))%2,q=Math.min(sw,sh)*.72,sc=t<4?1:.86,aw=(diag?q:odd?sh:sw)*sc,ah=(diag?q:odd?sw:sh)*sc;P=PATS[kind](K,aw,ah);if(!P.length)continue;
    if(P.length==1&&!solo){solo={kind,diag,rot,P};continue}}
   else{if(!solo)break;({kind,diag,rot,P}=solo)}
   const cr=Math.cos(rot),sr=Math.sin(rot),sh0=pick(shs),ps=P.map(p=>{const u=cu+p.u*cr-p.v*sr,v=cv+p.u*sr+p.v*cr;let sh=p.sh||sh0,w=p.w;
     if('oct hex circle square'.includes(sh)&&Math.max(p.w,p.h)>Math.min(p.w,p.h)*1.15)sh='rect';else if(sh=='fact')w*=.92;   // ottagono, esagono e cerchio usano il lato maggiore: su parti rettangolari sborderebbero nei vicoli
     return{x:x+u*c-v*s,y:y+u*s+v*c,w,h:p.h,a:A+rot+(p.a||0),sh}});
   if(K.addGroup(ps,{tight:true,pal:R()<.8?pal:pick(o.pals),fz:1,riv:o.riv,gap:14,noSlab:1})){any++;if('court pinwheel cross'.includes(kind)){const q2=[x+cu*c-cv*s,y+cu*s+cv*c];K.tree(q2[0],q2[1],rr(13,19))}break}}}
 if(any&&o.slab)K.m.flat.push({k:'slab',t:o.t||0,x,y,w:W+30,h:H+30,a:A,soft:1,tn:K.ri(0,5),st:K.ri(0,4),box:1});
 return any>0}
// EDIFICIO ARTICOLATO su isolati uniti: più corpi uniti fra loro (un unico complesso). Coordinate: a lungo il lato lungo dell'isolato, b di traverso.
// 0 a H (corpo e due testate) · 1 pettine · 2 basamento con torri · 3 a gradoni · 4 corte chiusa · 5 spina con blocchi alternati
function complexB(K,D,b,pals){const{R,rr,ri,pick}=K,lg=b.bw>=b.bh,L=(lg?b.bw:b.bh)-10,S2=(lg?b.bh:b.bw)-10,P=[],k=ri(0,5),add=(a,bb,l,d,sh)=>P.push({a,b:bb,l,d,sh:sh||'rect'});
 if(S2<BLD_MIN*1.6)return false;
 const d0=clamp(S2*rr(.34,.46),BLD_MIN,S2);
 if(k==0){const lw=Math.max(BLD_MIN,L*rr(.1,.16));add(0,0,L-2*lw+8,d0);for(const sd of[-1,1])add(sd*(L/2-lw/2),0,lw,S2*rr(.75,1))}
 else if(k==1){add(0,-S2/2+d0/2,L,d0);const[n,tw,Pt]=strip(L,rr(70,100),5),tl=S2*rr(.6,.9)-d0+6;if(tw>=BLD_MIN)for(let i=0;i<n;i++)add(Pt(i),-S2/2+d0-3+tl/2,tw,tl)}   // pettine: vicoli fra i denti
 else if(k==2){add(0,S2*.12,L,S2*.7);const n=ri(1,3);for(let i=0;i<n;i++){const t=Math.min(S2*rr(.5,.7),L/n*.7);add(-L/2+L/n*(i+.5),-S2/2+t/2,t,t,pick(['tower','oct','square','quad']))}}
 else if(k==3){let o=-S2/2;for(const f of[.42,.32,.26]){const d=S2*f;add(0,o+d/2,L*(1-(.42-f)*1.6),d+4);o+=d}}
 else if(k==4){const d=clamp(S2*rr(.24,.3),BLD_MIN,S2*.4);add(0,-S2/2+d/2,L,d);add(0,S2/2-d/2,L,d);for(const sd of[-1,1])add(sd*(L/2-d/2),0,d,S2-2*d+8)}
 else{const sp=Math.max(BLD_MIN,S2*.22);add(0,0,L,sp);const n=ri(2,4);for(let i=0;i<n;i++){const sd=i%2?1:-1,l=L/n*rr(.6,.8),d=(S2-sp)/2*rr(.75,.95);add(-L/2+L/n*(i+.5),sd*(sp/2+d/2-3),l,d)}}
 const ps=P.map(q=>{const w=b.here(lg?q.a:q.b,lg?q.b:q.a);return{x:w[0],y:w[1],w:lg?q.l:q.d,h:lg?q.d:q.l,a:D.a,sh:q.sh}});
 const ok=K.addGroup(ps,{tight:true,pal:pick(pals),fz:1,riv:D.riv,gap:6,noSlab:1});
 if(ok&&k==4){const t=b.here(0,0);K.tree(t[0],t[1],rr(14,20))}
 return!!ok}
// isolato attraversato dal viale curvo: il tratto di viale dentro l'isolato si divide in parti uguali; per ogni parte, ai due lati, una o due file di edifici allineati al viale
function curveBlock(K,D,b,CV,pals){const{R,rr,pick}=K,P=CV.pts,pal=pick(pals),sh=pick(['rect','rect','L','square']),hw=CV.w/2+20,cum=[0],mu=(b.u0+b.u1)/2,mv=(b.v0+b.v1)/2;
 for(let k=1;k<P.length;k++)cum.push(cum[k-1]+Math.hypot(P[k][0]-P[k-1][0],P[k][1]-P[k-1][1]));
 const at=s=>{let k=1;while(k<P.length-1&&cum[k]<s)k++;const A=P[k-1],B=P[k],l=cum[k]-cum[k-1]||1,f=clamp((s-cum[k-1])/l,0,1);return[A[0]+(B[0]-A[0])*f,A[1]+(B[1]-A[1])*f,(B[0]-A[0])/l,(B[1]-A[1])/l]};
 const inR=(u,v)=>u>=b.u0-2&&u<=b.u1+2&&v>=b.v0-2&&v<=b.v1+2;
 const inB=(cu,cv,tx,ty,nx,ny,wd,dp)=>{for(const[a,e]of[[-1,-1],[1,-1],[1,1],[-1,1]])if(!inR(cu+tx*wd/2*a+nx*dp/2*e,cv+ty*wd/2*a+ny*dp/2*e))return false;return true};
 const put=(cu,cv,a,wd,dp)=>{const w=b.here(cu-mu,cv-mv);return K.addGroup([{x:w[0],y:w[1],w:wd,h:dp,a,sh}],{tight:true,pal:R()<.8?pal:pick(pals),fz:1,riv:D.riv,gap:6,noSlab:1})};
 let s0=-1,s1=-1;for(let s=0;s<=cum[cum.length-1];s+=6){const q=at(s);if(inR(q[0],q[1])){if(s0<0)s0=s;s1=s}}   // tratto del viale dentro l'isolato
 const Ls=s1-s0-8;if(s0<0||Ls<M0+8)return;
 const n=Math.max(1,Math.round((Ls+ALLEY)/rr(115+ALLEY,165+ALLEY))),wd=(Ls+ALLEY)/n-ALLEY;if(wd<M0)return;   // n edifici separati da vicoli
 for(const sd of[-1,1])for(let i=0;i<n;i++){const[cu,cv,tx0,ty0]=at(s0+4+i*(wd+ALLEY)+wd/2);let ok=false;
  for(const[tx,ty]of[[tx0,ty0],Math.abs(tx0)>Math.abs(ty0)?[Math.sign(tx0),0]:[0,Math.sign(ty0)]]){if(ok)break;   // prima allineato al viale, poi all'isolato
   const nx=-ty*sd,ny=tx*sd,a=D.a+Math.atan2(ty,tx);let lim=1e9;
   if(nx>1e-3)lim=Math.min(lim,(b.u1-cu)/nx);if(nx<-1e-3)lim=Math.min(lim,(b.u0-cu)/nx);if(ny>1e-3)lim=Math.min(lim,(b.v1-cv)/ny);if(ny<-1e-3)lim=Math.min(lim,(b.v0-cv)/ny);
   for(const k of[1,.82,.66]){if(ok)break;for(const ex of[0,16,32]){const w2=wd*k,dp=Math.min(lim-hw-ex-6,rr(110,170)*k);if(dp<M0||w2<M0)break;const o1=hw+ex+dp/2;   // ex: più lontano dal viale, dove la curva si avvicina
    if(!inB(cu+nx*o1,cv+ny*o1,tx,ty,nx,ny,w2,dp)||!put(cu+nx*o1,cv+ny*o1,a,w2,dp))continue;ok=true;
    const d2=Math.min(lim-hw-ex-dp-ALLEY-6,150);if(d2>=M0){const o2=hw+ex+dp+ALLEY+d2/2;if(inB(cu+nx*o2,cv+ny*o2,tx,ty,nx,ny,w2,d2))put(cu+nx*o2,cv+ny*o2,a,w2,d2)}   // seconda fila, dietro
    break}}}}}
// QUARTIERE AD ANELLO: anello principale (tondo, ottagonale o esagonale, a volte doppio), anello interno tondo o quadrato attorno a una piazza
// o a un edificio centrale, raggi che partono dall'anello interno (mai tutti nel centro) e settori abbastanza larghi per costruire
function cityRing(K,S,D,di){const{R,rr,ri,pick,m}=K,Rr=D.Rr,riv=R()<.55,pals=D.tone;D.ends=[];
 const poly=(r,n,ph)=>{const pts=[];for(let i=0;i<=n;i++){const t=ph+i/n*TAU;pts.push([D.x+Math.cos(t)*r,D.y+Math.sin(t)*r])}return pts};
 const on=pick([36,36,8,6]),sq=R()<.4,r0=clamp(Rr*rr(.36,.44),112,160),rIn=sq?r0*.88:r0;   // rIn = distanza del bordo dell'anello interno dal centro (apotema per il quadrato)
 PLAN.runs(K,poly(on<36?Rr/Math.cos(Math.PI/on):Rr,on,D.a+(on<36?Math.PI/on:0)),44,'st',1);
 if(D.two)PLAN.runs(K,poly(Rr+250,pick([36,36,8]),D.a),34,'st',1);
 PLAN.runs(K,sq?poly(r0*1.245,4,D.a+Math.PI/4):poly(r0,36,0),30,'st',1);
 // raggi: 3-5 (settori larghi almeno ~320 px sull'anello); alcuni partono dall'anello principale invece che da quello interno
 const sp=Math.max(3,Math.min(ri(3,5),Math.floor(TAU*Rr/320))),ext=Rr+(D.two?370:120),ph=D.a+rr(-.2,.2);let full=0;
 for(let i=0;i<sp;i++){const t=ph+i/sp*TAU+rr(-.12,.12),st=full<2||R()<.7?rIn:Rr,e=[D.x+Math.cos(t)*ext,D.y+Math.sin(t)*ext];if(st==rIn)full++;
  D.ends.push(e);PLAN.road(K,[D.x+Math.cos(t)*st,D.y+Math.sin(t)*st],e,i%2?34:42,'st',1)}
 const plaza=R()<.5;if(plaza)m.flat.push({k:'circ',t:2,x:D.x,y:D.y,r:rIn-17,pool:1});
 const tang=R()<.5,wide=R()<.4;   // edifici rivolti al centro o allineati all'anello; file di case strette o "mezzelune" larghe
 K.later.push(()=>{
  if(!plaza){const z=(rIn-30)*(sq?1.6:1.35);K.fitB(D.x,D.y,z,z,D.a,D.a,pick(['oct','circle','cross','quad','hex','tower']),'house',pals,null,riv)}   // edificio centrale
  else{for(let i=0;i<4;i++){const t=D.a+Math.PI/4+i*Math.PI/2;K.tree(D.x+Math.cos(t)*(rIn-40),D.y+Math.sin(t)*(rIn-40),rr(11,14))}if(R()<.6)K.plazaRocks(D.x,D.y,rIn-17,D.a+Math.PI/4)}
  const mid=(rIn+15+Rr-22)/2,dep=Rr-22-(rIn+15)-30;                                       // fascia fra anello interno e anello principale
  const rings=[[Rr+125,rr(140,175)]];if(dep>=85)rings.push([mid,Math.min(dep,165)]);if(D.two)rings.push([Rr+375,rr(140,175)]);
  for(const[rd,dp]of rings){const n=Math.max(4,Math.round(TAU*rd/(wide?rr(230,270):rr(170,200))));for(let i=0;i<n;i++){const t=D.a+(i+.5)/n*TAU,len=TAU*rd/n*rr(.62,.8),a=t+Math.PI/2;
    K.fitB(D.x+Math.cos(t)*rd,D.y+Math.sin(t)*rd,len,dp,tang?a:a+rr(-.25,.25),a,wide?'rect':null,'house',pals,null,riv)}}
  if(R()<.4){const rt=Rr-34,n=Math.round(TAU*rt/62);for(let i=0;i<n;i++){const t=i/n*TAU;K.tree(D.x+Math.cos(t)*rt,D.y+Math.sin(t)*rt,rr(10,13),1)}}   // alberi lungo l'anello
  if(!D.two&&R()<.4)K.wallCirc(D.x,D.y,Rr+250,D.ends)})}
// quartiere lineare: una via principale, traverse, case sui due lati
function cityLine(K,S,D,di){const{R,rr,m}=K,c=Math.cos(D.a),s=Math.sin(D.a),T=(u,v)=>[D.x+u*c-v*s,D.y+u*s+v*c],pals=D.tone;D.ends=[T(-D.L/2,0),T(D.L/2,0)];
 PLAN.road(K,D.ends[0],D.ends[1],46,'av',1);
 const cr=[];for(let u=-D.L/2+260;u<D.L/2-200;u+=rr(300,420)){cr.push(u);PLAN.road(K,T(u,-190),T(u,190),30,'st',1);m.junc.push({x:T(u,0)[0],y:T(u,0)[1],w:46,a:D.a})}
 // tra una traversa e l'altra, su ogni lato del viale: una striscia-mini-sito (formazione); se non riesce, case singole separate da vicoli
 K.later.push(()=>{const ed=[-D.L/2+70,...cr,D.L/2-70];
  for(let i=0;i<ed.length-1;i++){const a0=ed[i]+(i?31:0),a1=ed[i+1]-(i<ed.length-2?31:0),sl=a1-a0;if(sl<M0)continue;
   for(const sd of[-1,1]){const dep=rr(150,210),p=T((a0+a1)/2,sd*(23+16+dep/2));
    if(sl>=2*M0+ALLEY&&R()<.85&&miniSite(K,p[0],p[1],sl,dep,D.a,{pals,st:'long',ch:D.ch,riv:0,slab:1}))continue;
    const[n,b,P]=strip(sl,rr(130,170),4);if(b<M0)continue;for(let k=0;k<n;k++)if(R()<.85){const h=rr(150,210),q=T((a0+a1)/2+P(k),sd*(23+h/2+30));K.addB(q[0],q[1],b,h,D.a,null,true,false,'house',pals)}}}})}

// ----- COMPLESSI: un corpo principale più 0-2 ali attaccate ai lati (sagome a L, T, Z), recinto con varchi, e dentro tante "celle" ognuna con una funzione.
// SITE descrive ogni tipo: dimensioni, piazzale, funzioni obbligatorie (req) e facoltative (pool, estratte a caso). Per un sito nuovo basta una riga qui (e una in SITE_RK/SITE_ORD). -----
const SITE={
 c:{zt:'mil',slab:4,w:[620,860],h:[480,680],wall:24,pal:PAL_MIL,comp:1,req:['barracks','motorpool','range'],pool:['drill','houses','pad','motorpool','bunkers','radar','drill','lotMil']},
 i:{zt:'indus',slab:1,w:[760,1000],h:[560,780],wall:18,pal:PAL_IND,req:['factory','stockpile'],pool:['piperack','tanks','silos','stacks','warehouse','stockpile','conts','factory','yard']},
 k:{zt:'indus',slab:1,w:[720,880],h:[520,640],wall:18,pal:PAL_IND,req:['cooling','reactor','transformer','basins'],pool:['basins','tanks','stacks','warehouse','solar','transformer']},
 y:{zt:'mil',slab:1,w:[760,860],h:[540,620],wall:20,pal:PAL_IND,comp:1,one:'ship',ann:[1,2],req:['launchpad'],pool:['launchpad','conts','tanks','warehouse','pad','stacks']},
 n:{zt:'mil',slab:4,w:[720,860],h:[540,660],wall:20,pal:PAL_MIL,comp:1,req:['hatches','hq','radar','motorpool'],pool:['range','drill','pad','bunkers','motorpool','tanks']},
 a:{zt:'mil',slab:4,w:[980,1180],h:[560,680],wall:20,pal:PAL_MIL,comp:1,air:1,req:[],pool:['pad','tanks','lotMil','radar','houses']},
 t:{zt:'urban',slab:0,w:[600,820],h:[460,640],wall:0,pal:PAL_COM,req:['tower','green'],pool:['lot','solar','houses','plaza','green','vents']},
 s:{zt:'urban'}};   // arena: non è un complesso a celle (PLAN.s più sotto prende il posto di compound); qui serve solo il tipo di zona
PLAN.mk=(K,k,x,y,sc,za)=>{const{R,rr,ri,pick}=K;
 if(k=='f')return{x,y,a:R()*3.14,r:330};
 if(k=='v'){const W=rr(380,470),H=rr(320,400);return{x,y,a:R()*3.14,W,H,r:Math.hypot(W,H)/2+90}}
 if(k=='q'){const rp=rr(190,260)*sc;return{x,y,a:R()*TAU,rp,r:rp+250}}
 if(k=='s')return arenaAt(K,x,y);
 sc=Math.max(sc,k=='y'?.92:k=='a'?.85:.72);const sp=SITE[k],w=rr(sp.w[0],sp.w[1])*sc,h=rr(sp.h[0],sp.h[1])*sc,a=za!=null?za:R()*Math.PI,c=Math.cos(a),s=Math.sin(a),parts=[{u:0,v:0,w,h}],sides=K.shuf([0,1,2,3]),an=sp.ann||[0,2];
 // corpi aggiunti: ognuno sporge dal lato sd di un corpo base B e rientra di 30 px in lui (lì il muro si apre); off = spostamento lungo il lato, len = larghezza, dp = sporgenza
 const add=(B,sd,len,dp,off)=>{const hor=sd<2,sg=sd%2?1:-1,p=hor?{u:B.u+off,v:B.v+sg*(B.h/2+dp/2-15),w:len,h:dp+30,sd}:{u:B.u+sg*(B.w/2+dp/2-15),v:B.v+off,w:dp+30,h:len,sd};parts.push(p);return p};
 const L=sd=>sd<2?w:h,end=(sd,len,f)=>(f<0?-1:1)*(L(sd)-len)/2,fo=k?pick(['wings','wings','L','step','U','T','comb']):'wings';   // forma del sito: ali sparse, L, gradoni, U, T, pettine
 if(sp.one||sp.air||fo=='wings')for(let i=0,n=ri(an[0],an[1]);i<n;i++){const sd=sides[i],len=L(sd)*rr(.4,.75);add(parts[0],sd,len,rr(210,340)*sc,rr(-.5,.5)*(L(sd)-len))}   // ali qua e là
 else if(fo=='L'){const sd=sides[0],len=L(sd)*rr(.42,.62),A2=add(parts[0],sd,len,rr(300,460)*sc,end(sd,len,R()-.5));   // un corpo grande su un angolo: sagoma a L
  if(R()<.6){const sd2=sides[1],l2=L(sd2)*rr(.3,.5);add(parts[0],sd2,l2,rr(180,260)*sc,rr(-.4,.4)*(L(sd2)-l2))}}
 else if(fo=='step'){const sd=sides[0],f=R()-.5,len=L(sd)*rr(.5,.68),A2=add(parts[0],sd,len,rr(240,340)*sc,end(sd,len,f)),l3=len*rr(.55,.75);   // gradoni: ogni corpo più piccolo e spostato verso lo stesso estremo
  add(A2,sd,l3,rr(180,260)*sc,(f<0?-1:1)*(len-l3)/2)}
 else if(fo=='U'){const sd=sides[0],len=L(sd)*rr(.22,.3),dp=rr(260,400)*sc;add(parts[0],sd,len,dp,end(sd,len,-1));add(parts[0],sd,len*rr(.85,1.15),dp*rr(.7,1.1),end(sd,len,1))}   // due bracci: corte aperta
 else if(fo=='T'){const sd=sides[0],len=L(sd)*rr(.3,.45);add(parts[0],sd,len,rr(300,440)*sc,rr(-.15,.15)*L(sd));if(R()<.5){const o=sd^1,l2=L(o)*rr(.3,.5);add(parts[0],o,l2,rr(160,240)*sc,rr(-.4,.4)*(L(o)-l2))}}   // gambo della T (e a volte una piccola ala opposta)
 else{const sd=sides[0],n=ri(3,4),len=L(sd)/(n*2-1);for(let i=0;i<n;i++)add(parts[0],sd,len,rr(200,320)*sc,-L(sd)/2+len/2+i*len*2)}   // pettine: denti separati da cortili
 let r=0;for(const p of parts)r=Math.max(r,Math.hypot(Math.abs(p.u)+p.w/2,Math.abs(p.v)+p.h/2));
 return{x,y,a,w,h,parts,r:r+50,sp,T:(u,v)=>[x+u*c-v*s,y+u*s+v*c]}};
function compound(K,S){const{R,rr,ri,pick,shuf,m}=K,sp=S.sp,T=S.T,w=S.w,h=S.h,P=S.parts,A=S.a;
 const inP=(p,u,v,mg)=>Math.abs(u-p.u)<p.w/2-mg&&Math.abs(v-p.v)<p.h/2-mg;
 const used=new Set(P.slice(1).map(p=>p.sd)),gs=shuf([[0,-h/2,0],[0,h/2,1],[-w/2,0,2],[w/2,0,3]].filter(g=>!used.has(g[2]))).slice(0,2);                 // varchi: sui lati senza ali
 S.ends=gs.map(g=>T(g[0]+Math.sign(g[0])*55,g[1]+Math.sign(g[1])*55));
 const tn=ri(0,5),st=ri(0,4);for(const p of P){const q=T(p.u,p.v);m.flat.push({k:'slab',t:sp.slab,x:q[0],y:q[1],w:p.w,h:p.h,a:A,soft:1,tn,st,big:1})}
 if(sp.comp)m.comp.push(S);
 for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]])m.tspots.push(T(a*(w/2-55),b*(h/2-55)));
 for(const g of gs)for(const d of[-1,1])m.tspots.push(T(g[0]?g[0]-Math.sign(g[0])*60:d*110,g[1]?g[1]-Math.sign(g[1])*60:d*110));
 // celle: ogni parte è tagliata in 1-6 celle con tagli asimmetrici; tra le celle restano corsie di servizio (disegnate sul piazzale)
 const cells=[],cut=(p,main)=>{const nx=main&&sp.one?1:p.w>700?3:p.w>380?2:1,ny=main&&sp.one?1:p.h>520?2:1,xs=[-p.w/2],ys=[-p.h/2];
  for(let i=1;i<nx;i++)xs.push(-p.w/2+p.w*(i/nx+rr(-.07,.07)));xs.push(p.w/2);for(let j=1;j<ny;j++)ys.push(-p.h/2+p.h*(j/ny+rr(-.1,.1)));ys.push(p.h/2);
  for(let i=1;i<nx;i++)m.flat.push({k:'lane',pts:[T(p.u+xs[i],p.v-p.h/2+26),T(p.u+xs[i],p.v+p.h/2-26)],w:18});
  for(let j=1;j<ny;j++)m.flat.push({k:'lane',pts:[T(p.u-p.w/2+26,p.v+ys[j]),T(p.u+p.w/2-26,p.v+ys[j])],w:18});
  for(let i=0;i<nx;i++)for(let j=0;j<ny;j++)cells.push({u:p.u+(xs[i]+xs[i+1])/2,v:p.v+(ys[j]+ys[j+1])/2,w:xs[i+1]-xs[i]-56,h:ys[j+1]-ys[j]-56,main})};
 K.later.push(()=>{
  if(sp.wall)for(const p of P){const q=T(p.u,p.v);K.wallRect(q[0],q[1],A,p.w,p.h,sp.wall,S.ends,(x,y)=>{const dx=x-S.x,dy=y-S.y,u=dx*Math.cos(A)+dy*Math.sin(A),v=-dx*Math.sin(A)+dy*Math.cos(A);return P.some(o=>o!==p&&inP(o,u,v,6))})}
  else for(const p of P)for(let k=0,n=Math.round((p.w+p.h)/45);k<n;k++){const t=k/n,e=t<.5?[(t*4-1)*p.w/2,(k%2?1:-1)*p.h/2]:[(k%2?1:-1)*p.w/2,((t-.5)*4-1)*p.h/2],q=T(p.u+e[0],p.v+e[1]);K.tree(q[0],q[1],rr(13,19))}   // senza muro: siepe di alberi
  if(sp.air){const tw=w/3-50,th=h*.5-70;cells.push({u:-w/3,v:-h*.22,w:tw,h:th,f:'hangars'},{u:0,v:-h*.22,w:tw,h:th,f:'hangars'},{u:w/3,v:-h*.22,w:tw,h:th,f:'tower'},{u:0,v:h*.22,w:w*.86,h:h*.38,f:'runway'});for(const p of P.slice(1))cut(p,0)}
  else P.forEach((p,i)=>cut(p,i==0));
  const todo=cells.filter(c=>!c.f).sort((a,b)=>b.w*b.h-a.w*a.h),req=(sp.one?[sp.one]:[]).concat(sp.req);let last='';
  for(const c of todo){c.f=req.length?req.shift():pick(sp.pool.filter(f=>f!=last));last=c.f}
  for(const c of cells)if(c.w>=60&&c.h>=60)FILL[c.f](K,S,c);
  if(S.trf){const line=(A,B)=>{const L=Math.hypot(B[0]-A[0],B[1]-A[1]),n=Math.max(1,Math.round(L/110)),pts=[];for(let i=0;i<=n;i++)pts.push([A[0]+(B[0]-A[0])*i/n,A[1]+(B[1]-A[1])*i/n]);m.flat.push({k:'hvline',pts})};   // alta tensione: tralicci ogni ~110 px
   if(S.rct)line(S.trf,S.rct);const dx=S.trf[0]-S.x,dy=S.trf[1]-S.y,d=Math.hypot(dx,dy)||1;line(S.trf,[S.x+dx/d*(S.r+240),S.y+dy/d*(S.r+240)])}   // dai trasformatori al reattore e fuori dal sito
  for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]]){const q=T(a*(w/2-32),b*(h/2-32));if(sp.wall)K.addX(q[0],q[1],36,36,0,'stack',0,{gap:2,o:{v:0}})}})}   // torri d'angolo
for(const k in SITE)PLAN[k]=compound;
// funzioni delle celle: c = {u,v,w,h} nel sistema del sito (S.T lo porta nel mondo)
const FILL={
 hall(K,S,c,o){o=o||{};const{rr,pick}=K,p=S.T(c.u,c.v),W=o.w||[170,250],H=o.h||[140,210];return K.fitB(p[0],p[1],Math.min(c.w,rr(W[0],W[1])),Math.min(c.h,rr(H[0],H[1])),S.a,S.a,pick(o.sh||['fact','rect','U']),'house',o.pal||S.sp.pal,o.fz||2,0,0)},
 barracks(K,S,c){const b=FILL.hall(K,S,c,{sh:['U','fact','H','rect'],w:[190,250],h:[170,230]});if(b&&!S.bar)S.bar=b},
 factory(K,S,c){FILL.hall(K,S,{u:c.u-c.w*.12,v:c.v,w:c.w*.74,h:c.h},{sh:['fact','U','fact','H'],w:[220,300],h:[150,210]});const p=S.T(c.u+c.w*.4,c.v-c.h*.3);K.addX(p[0],p[1],K.rr(52,68),60,0,'stack',0,{gap:4,o:{v:0}})},
 warehouse(K,S,c){const{rr}=K,lg=c.w>=c.h,sp=lg?c.h:c.w,n=clamp(Math.floor((sp+ALLEY)/(110+ALLEY)),1,3),bt=Math.min(120,(sp-(n-1)*ALLEY)/n);   // capannoni paralleli separati da vicoli
  for(let i=0;i<n;i++){const d=-sp/2+bt/2+i*(bt+ALLEY),p=lg?S.T(c.u,c.v+d):S.T(c.u+d,c.v);K.addB(p[0],p[1],lg?Math.min(c.w,rr(220,300)):bt,lg?bt:Math.min(c.h,rr(220,300)),S.a,'rect',true,false,'house',S.sp.pal,2,0,0)}},
 hq(K,S,c){FILL.hall(K,S,c,{sh:['pyramid'],w:[140,160],h:[140,160]})},
 reactor(K,S,c){S.rct=S.T(c.u,c.v);FILL.hall(K,S,{u:c.u-c.w*.15,v:c.v,w:c.w*.7,h:c.h},{sh:['oct','circle','hex'],w:[170,210],h:[170,210]});FILL.hall(K,S,{u:c.u+c.w*.34,v:c.v,w:c.w*.3,h:c.h},{sh:['rect'],w:[90,120],h:[130,180]})},
 houses(K,S,c){const{rr,pick}=K,sz=rr(84,108),p0=S.T(c.u,c.v);if(Math.max(c.w,c.h)>=2*M0+ALLEY&&miniSite(K,p0[0],p0[1],c.w,c.h,S.a,{pals:S.sp.pal,st:'std',ch:'res'}))return;   // prima una formazione
  for(const q of K.pattern(pick(['rows2','square','arc','row','L','grid']),c.w,c.h,sz,rr(14,30))){const p=S.T(c.u+q[0],c.v+q[1]);K.addB(p[0],p[1],sz*rr(.9,1.1),sz*rr(.78,1),S.a+q[2]+rr(-.12,.12),pick(['rect','rect','square','oct','L']),true,false,'house',S.sp.pal,2,0,0)}},
 bunkers(K,S,c){const{rr,pick}=K,sz=rr(96,116);for(const q of K.pattern(pick(['arc','row','L']),c.w,c.h,sz,rr(24,44))){const p=S.T(c.u+q[0],c.v+q[1]);K.addB(p[0],p[1],sz,sz,S.a+q[2],pick(['oct','hex','oct','square']),true,false,'house',PAL_MIL,2,0,0)}},
 tanks(K,S,c){const{rr,ri,m}=K,sz=rr(64,98),P=K.pattern('grid',c.w,c.h,sz,rr(14,26)),v=ri(0,1);for(const q of P){const p=S.T(c.u+q[0],c.v+q[1]);K.addX(p[0],p[1],sz,sz,0,'tank',0,{gap:4,o:{v}})}
  if(P.length>1)m.flat.push({k:'pipe',pts:[S.T(c.u+P[0][0],c.v+P[0][1]),S.T(c.u+P[P.length-1][0],c.v+P[0][1]),S.T(c.u+P[P.length-1][0],c.v+P[P.length-1][1])],w:8})},
 silos(K,S,c){const{rr,ri}=K,sd=rr(70,96),n=Math.max(1,Math.min(3,Math.floor(c.w/sd))),rows=c.h>sd*2.4?2:1;for(let j=0;j<rows;j++){const p=S.T(c.u,c.v+(j-(rows-1)/2)*sd*1.25);K.addX(p[0],p[1],sd*n,sd,S.a,'silo',0,{gap:4,o:{v:ri(0,2)}})}},
 stacks(K,S,c){const{rr}=K;for(const d of[-.25,.25]){const p=S.T(c.u+c.w*d,c.v-c.h*.2);K.addX(p[0],p[1],rr(52,70),60,0,'stack',0,{gap:4,o:{v:0}})}FILL.hall(K,S,{u:c.u,v:c.v+c.h*.22,w:c.w,h:c.h*.5},{sh:['rect','fact'],w:[130,190],h:[90,120]})},
 conts(K,S,c){const{R,rr,ri}=K;let vv=-c.h/2+16;while(vv<c.h/2-24){const ny=ri(1,2),ch=ny*24;let uu=-c.w/2+4;while(uu<c.w/2-110){const nx=ri(2,3),cw=nx*56;if(R()<.85){const p=S.T(c.u+uu+cw/2,c.v+vv+ch/2);K.addX(p[0],p[1],cw,ch,S.a,'cont',0,{gap:4})}uu+=cw+rr(40,70)}vv+=ch+rr(50,70)}
  if(c.w>300){const p=S.T(c.u,c.v);K.addX(p[0],p[1],c.w*.9,26,S.a,'crane',0,{gap:2,o:{v:0}})}},
 lot(K,S,c){const p=S.T(c.u,c.v);K.m.flat.push({k:'lot',x:p[0],y:p[1],w:Math.min(c.w,220),h:Math.min(c.h,150),a:S.a,s:K.ri(0,1e6)})},
 lotMil(K,S,c){const p=S.T(c.u,c.v);K.m.flat.push({k:'lot',x:p[0],y:p[1],w:Math.min(c.w,240),h:Math.min(c.h,150),a:S.a,s:K.ri(0,1e6),mil:1})},
 pad(K,S,c){const p=S.T(c.u,c.v);K.m.flat.push({k:'pad',x:p[0],y:p[1],r:Math.min(54,Math.min(c.w,c.h)/2-4)})},
 solar(K,S,c){for(const q of K.pattern('grid',c.w,c.h,56,36)){const p=S.T(c.u+q[0],c.v+q[1]);K.m.flat.push({k:'solarArray',x:p[0],y:p[1],w:85,h:50,a:S.a,r:56})}},
 vents(K,S,c){for(const q of K.pattern('row',c.w,c.h,48,40)){const p=S.T(c.u+q[0],c.v+q[1]);K.m.flat.push({k:'ventBunker',x:p[0],y:p[1],a:0,r:30})}},
 radar(K,S,c){const p=S.T(c.u-c.w*.15,c.v),sz=Math.min(86,Math.min(c.w,c.h)-10);K.addX(p[0],p[1],sz,sz,S.a,'radar',0,{gap:6});FILL.hall(K,S,{u:c.u+c.w*.3,v:c.v,w:c.w*.36,h:c.h},{sh:['square','oct'],w:[90,110],h:[90,110]})},
 hatches(K,S,c){const P=K.pattern('grid',c.w,c.h,68,34);for(const q of P){const p=S.T(c.u+q[0],c.v+q[1]);K.addX(p[0],p[1],68,68,S.a,'hatch',0,{gap:6})}
  if(P.length>1)K.m.flat.push({k:'pipe',pts:[S.T(c.u-c.w/2+10,c.v),S.T(c.u+c.w/2-10,c.v)],w:8})},
 cooling(K,S,c){const{rr}=K,tw=Math.min(rr(115,140),c.h-10),n=Math.max(2,Math.min(4,Math.floor(c.w/(tw*1.12))));for(let i=0;i<n;i++){const p=S.T(c.u+(i-(n-1)/2)*tw*1.14,c.v);K.addX(p[0],p[1],tw,tw,0,'tank',0,{gap:8,o:{v:0,ct:1}})}},   // ct = torre di raffreddamento
 green(K,S,c){const{rr,ri}=K,p=S.T(c.u,c.v),ps=ri(0,1e6);K.m.flat.push({k:'park',x:p[0],y:p[1],w:c.w,h:c.h,a:S.a,s:ps});K.parkRocks((u,v)=>S.T(c.u+u,c.v+v),c.w,c.h,ps);for(let t=0,n=ri(5,10);t<n;t++){const q=S.T(c.u+rr(-.45,.45)*c.w,c.v+rr(-.45,.45)*c.h);K.tree(q[0],q[1],rr(11,17))}},
 plaza(K,S,c){const p=S.T(c.u,c.v);K.m.flat.push({k:'circ',t:2,x:p[0],y:p[1],r:Math.min(c.w,c.h)*.46});if(K.R()<.6)K.plazaRocks(p[0],p[1],Math.min(c.w,c.h)*.46,S.a)},
 yard(K,S,c){const{rr,ri,pick}=K,p=S.T(c.u,c.v);K.m.flat.push({k:'yard',x:p[0],y:p[1],w:c.w,h:c.h,a:S.a,s:ri(0,1e6)});
  for(let i=0,n=ri(2,5);i<n;i++){const q=S.T(c.u+rr(-.35,.35)*c.w,c.v+rr(-.35,.35)*c.h);K.m.flat.push({k:'veh',v:pick(['crates','pallet','barrels','crate','gen','forklift']),x:q[0],y:q[1],a:S.a+rr(-.3,.3),col:pick(['#8a6a3a','#c0392b','#e67e22','#cfc8b8']),r:16,s:ri(0,1e6)})}},
 // ----- decorazioni proprie del tipo di sito (le disegna AGbake: PF.motorpool, PF.range...). Le celle lunghe e strette si ruotano: w è sempre il lato lungo -----
 // militari: parcheggio dei mezzi (carri e navicelle negli stalli), poligono di tiro col terrapieno dietro i bersagli, campo di addestramento
 motorpool(K,S,c){const p=S.T(c.u,c.v),lg=c.w>=c.h;K.m.flat.push({k:'motorpool',x:p[0],y:p[1],w:(lg?c.w:c.h)-6,h:(lg?c.h:c.w)-6,a:S.a+(lg?0:Math.PI/2),s:K.ri(0,1e6)})},
 range(K,S,c){const{R,ri}=K,p=S.T(c.u,c.v),lg=c.w>=c.h,W=(lg?c.w:c.h)-6,H=(lg?c.h:c.w)-6,a=S.a+(lg?0:Math.PI/2)+(R()<.5?0:Math.PI),ca=Math.cos(a),sa=Math.sin(a),P=(u,v)=>[p[0]+u*ca-v*sa,p[1]+u*sa+v*ca];
  K.m.flat.push({k:'range',x:p[0],y:p[1],w:W,h:H,a,s:ri(0,1e6)});if(W>=160)K.wallLine(...P(W/2-11,-H/2+8),...P(W/2-11,H/2-8),20,null)},   // il terrapieno è un muro vero
 drill(K,S,c){const p=S.T(c.u,c.v),lg=c.w>=c.h;K.m.flat.push({k:'drill',x:p[0],y:p[1],w:(lg?c.w:c.h)-6,h:(lg?c.h:c.w)-6,a:S.a+(lg?0:Math.PI/2),s:K.ri(0,1e6)})},
 // centrale nucleare: vasche di raffreddamento con un canale di scolo verso l'esterno, piazzale dei trasformatori (S.trf: da lì partono le linee di alta tensione)
 basins(K,S,c){const m=K.m,p=S.T(c.u,c.v),lg=c.w>=c.h;m.flat.push({k:'basins',x:p[0],y:p[1],w:(lg?c.w:c.h)-10,h:(lg?c.h:c.w)-10,a:S.a+(lg?0:Math.PI/2)});
  const hz=Math.abs(c.u)/S.w>Math.abs(c.v)/S.h,sg=(hz?Math.sign(c.u):Math.sign(c.v))||1,b=hz?[c.u+sg*c.w/2,c.v]:[c.u,c.v+sg*c.h/2],e=hz?[sg*(S.w/2+90),c.v]:[c.u,sg*(S.h/2+90)];
  m.flat.push({k:'canal',pts:[S.T(b[0],b[1]),S.T(e[0],e[1])],w:14})},
 transformer(K,S,c){const p=S.T(c.u,c.v),lg=c.w>=c.h;if(!S.trf)S.trf=p;K.m.flat.push({k:'transformer',x:p[0],y:p[1],w:(lg?c.w:c.h)-10,h:(lg?c.h:c.w)-10,a:S.a+(lg?0:Math.PI/2)})},
 // industria: cumuli di materiale col nastro trasportatore, fascio di tubi con la casetta delle pompe
 stockpile(K,S,c){const p=S.T(c.u,c.v),lg=c.w>=c.h;K.m.flat.push({k:'stockpile',x:p[0],y:p[1],w:(lg?c.w:c.h)-8,h:(lg?c.h:c.w)-8,a:S.a+(lg?0:Math.PI/2),s:K.ri(0,1e6)})},
 piperack(K,S,c){const lg=c.w>=c.h,L=(lg?c.w:c.h)/2-10;for(const o of[-18,0,18]){const A=lg?S.T(c.u-L,c.v+o):S.T(c.u+o,c.v-L),B=lg?S.T(c.u+L,c.v+o):S.T(c.u+o,c.v+L);K.m.flat.push({k:'pipe',pts:[A,B],w:o?7:10})}
  const sd=(lg?c.h:c.w)/2-45;if(sd>=50)FILL.hall(K,S,lg?{u:c.u,v:c.v+sd,w:c.w*.4,h:80}:{u:c.u+sd,v:c.v,w:80,h:c.h*.4},{sh:['rect'],w:[90,120],h:[70,80]})},
 // cantiere spaziale: rampa di lancio
 launchpad(K,S,c){const p=S.T(c.u,c.v);K.m.flat.push({k:'launchpad',x:p[0],y:p[1],r:Math.min(c.w,c.h)/2-8,a:S.a})},
 // cantiere stellare: la nave al centro, gru a portale su binari, tubazioni
 ship(K,S,c){const m=K.m,T=S.T,w=S.w,h=S.h,A=S.a;if(K.addX(S.x,S.y,480,280,A,'cruiser',2,{gap:10,force:true,o:{v:0}}))m.flat.push({k:'drydock',x:S.x,y:S.y,w:480,h:280,a:A});   // il bacino è disegnato a terra
  for(const sd of[-1,1]){m.flat.push({k:'rail',pts:[T(-w/2+70,sd*(h/2-35)),T(w/2-70,sd*(h/2-35))],w:8});K.addX(...T(0,sd*(h/2-35)),w*.6,24,A,'crane',0,{gap:6,o:{v:1}})}
  m.flat.push({k:'pipe',pts:[T(-w/2+90,h/2-80),T(-w/2+90,h*.16),T(-140,h*.16)],w:9})},
 // aeroporto: pista con piazzole (le navicelle le mette la scenografia), hangar, torre con radar
 runway(K,S,c){const m=K.m,p=S.T(c.u,c.v);m.flat.push({k:'slab',t:4,x:p[0],y:p[1],w:c.w,h:c.h,a:S.a});for(const sd of[-1,1]){const q=S.T(c.u+sd*S.w*.38,c.v);m.flat.push({k:'pad',x:q[0],y:q[1],r:48});if(K.R()<.5)m.flat.push(sd<0?{k:'refuelScene',x:q[0],y:q[1],a:S.a+Math.PI/2}:{k:'smallShip',x:q[0],y:q[1],a:S.a-Math.PI/2,col:'#7f8c8d'})}},
 hangars(K,S,c){FILL.hall(K,S,c,{sh:['fact'],w:[190,210],h:[125,140]})},
 tower(K,S,c){if(S.sp.air){const p=S.T(c.u-c.w*.2,c.v),q=S.T(c.u+c.w*.25,c.v);K.addB(p[0],p[1],110,110,S.a,'tower',true,false,'house',PAL_MIL,2,0,0);K.addX(q[0],q[1],74,74,S.a,'radar',0,{gap:6})}else FILL.hall(K,S,c,{sh:['tower','quad','cross','oct'],w:[180,240],h:[180,240],fz:1})}};

// ----- porto: moli (terra in più), gru a portale, navi ormeggiate, banchina con container, magazzini e serbatoi. Q(du,dv) parte dal punto di costa (cu,cv) -----
PLAN.mkPort=(K,v)=>{const{rr,ri}=K,cu=coastV(v),np=ri(2,3),piers=[],gap=rr(300,340),A=SIDE*Math.PI/2;
 for(let i=0;i<np;i++){const pv=v+(i-(np-1)/2)*gap,u1=coastV(pv)-40,L=rr(420,600),W=rr(104,124),q=fromUV(u1+L/2,pv);piers.push({x:q[0],y:q[1],a:A,c:Math.cos(A),s:Math.sin(A),L,W,u1,pv})}
 const q=fromUV(cu-300,v);return{k:'p',x:q[0],y:q[1],r:640,piers,cu,cv:v,a:A}};
PLAN.p=(K,S)=>{const{R,rr,ri,m}=K,Q=(du,dv)=>fromUV(S.cu+du,S.cv+dv),A=S.a,np=S.piers.length,hy=np*140;S.ends=[Q(-640,0)];
 m.flat.push({k:'slab',t:3,x:Q(-270,0)[0],y:Q(-270,0)[1],w:560,h:np*340+240,a:A,soft:1,tn:3,st:0,big:1});
 for(const[a,b]of[[-1,-1],[1,-1],[1,1],[-1,1]])m.tspots.push(Q(-300+a*210,b*(np*150+60)));
 K.later.push(()=>{
  S.piers.forEach((p,i)=>{const pu=p.u1-S.cu,pv=p.pv-S.cv;
   for(let k=0,n=ri(1,2);k<n;k++)K.addX(...Q(pu+90+k*180+rr(0,60),pv),p.W+30,24,A+Math.PI/2,'crane',2,{gap:2,o:{v:1}});                 // le zampe stanno ai bordi del molo: in mezzo si passa
   const side=i%2?1:-1,ln=rr(290,Math.min(440,p.L-70)),bm=rr(64,88),su=pu+p.L*.5+rr(-30,30);
   K.addX(...Q(su,pv+side*(p.W/2+bm/2+28)),ln,bm,A,'ship',3,{gap:6,o:{v:ri(0,2)}});
   if(i==np-1&&R()<.7)K.addX(...Q(su,pv-side*(p.W/2+bm/2+28)),rr(260,330),rr(60,80),A,'ship',3,{gap:6,o:{v:ri(0,2)}})});
  let vv=-hy+30;while(vv<hy-20){const ny=ri(1,3),ch=ny*24;let xx=-280;for(let i=0;i<3;i++){const nx=ri(2,3),cw=nx*56;if(R()<.85){const q=Q(xx+cw/2,vv+ch/2),rot=R()<.3?(R()<.5?Math.PI/4:Math.PI/2):0;K.addX(...q,cw,ch,A+rot,'cont',0,{gap:4})||rot&&K.addX(...q,cw,ch,A,'cont',0,{gap:4})}/* alcune pile ruotate di 45° o 90° (se non c'è posto, dritte) */xx+=cw+rr(58,80)}vv+=ch+rr(62,78)}
  for(const sd of[-1,1])K.addB(...Q(-450,sd*170),rr(250,280),rr(130,150),A,'rect',true,false,'house',PAL_IND,2,0,0);
  for(let i=0,n=ri(2,3);i<n;i++)K.addX(...Q(-420+i*120,-hy-75),rr(80,100),rr(80,100),0,'tank',0,{o:{v:ri(0,1)}});
  K.addB(...Q(-330,hy+55),rr(140,170),rr(110,130),A,'rect',true,false,'house',PAL_COM,1,0,0);
  m.flat.push({k:'rail',pts:[Q(-600,-np*150),Q(-600,np*150)],w:8})})};
// ----- fattoria: aia, cascina e fienili, silos, campi di vario tipo, recinti degli animali -----
PLAN.f=(K,S)=>{const{R,rr,ri,m}=K;S.ends=[[S.x,S.y]];
 K.later.push(()=>{const cR=rr(250,300);if(!circOnRoad(S.x,S.y,cR,10))m.flat.push({k:'circ',t:3,x:S.x,y:S.y,r:cR});
  for(let i=0,nf=ri(3,6);i<nf;i++){const t=S.a+(i+.5)/nf*TAU+rr(-.3,.3),d=rr(400,520),w=rr(230,340),h=rr(170,260),fa=t+1.5708,fx=S.x+Math.cos(t)*d,fy=S.y+Math.sin(t)*d;
   const ow=m.own[K.cell(fx,fy)];if(!rectOnRoad(fx,fy,w,h,fa,10)&&!wetCell(fx,fy)&&(!ow||ow==S.id)){K.clearRect(fx,fy,w,h,fa,6);K.stampR(fx,fy,w,h,fa,10,ZTI.rural,BIO.farm,S.id);
    m.flat.push({k:'field',x:fx,y:fy,w,h,a:fa,v:ri(0,5),s:ri(0,1e6),hedge:R()<.6});if(R()<.3)m.flat.push({k:'tractor',x:fx,y:fy,a:R()*TAU,fa,fw:w,fh:h,col:['#27ae60','#c0392b','#2980b9'][ri(0,2)]})}
   if(R()<.3){const ax=S.x+Math.cos(t)*(d-180),ay=S.y+Math.sin(t)*(d-180);if(!rectOnRoad(ax,ay,80,80,t,10))m.flat.push({k:'animalPen',x:ax,y:ay,w:80,h:80,a:t,s:ri(0,1e6)})}}
  for(let i=0,n=ri(3,5);i<n;i++){const t=S.a+i/n*TAU+rr(-.3,.3),d=rr(190,250);K.addB(S.x+Math.cos(t)*d,S.y+Math.sin(t)*d,rr(130,210),rr(120,180),t,i==0?'L':i==1?'rect':null,false,false,'house',[0,1,2,3],3)}
  for(let i=0,k=ri(1,2);i<k;i++){const t=R()*TAU,d=rr(300,360),sd=rr(60,80);K.addX(S.x+Math.cos(t)*d,S.y+Math.sin(t)*d,sd*ri(1,3),sd,t,'silo',0,{o:{v:ri(0,2)}})}
  if(R()<.6){const t=R()*TAU;K.addX(S.x+Math.cos(t)*rr(120,170),S.y+Math.sin(t)*rr(120,170),64,64,0,'tank',0,{o:{v:1}})}
  if(R()<.7){const h=rr(190,230),c=Math.cos(S.a),s=Math.sin(S.a),T=(u,v)=>[S.x+u*c-v*s,S.y+u*s+v*c],q=[T(-h,-h),T(h,-h),T(h,h),T(-h,h)];for(let i=0;i<4;i++)K.wallLine(q[i][0],q[i][1],q[(i+1)%4][0],q[(i+1)%4][1],14,[q[(i+2)%4]])}})};
// ----- villa: casa padronale col garage, piscina, campo da tennis e un parco (prato, viale alberato col cancello sulla strada, fontana con aiuole,
// laghetto, boschetti, siepi, vialetti). Il lato +v guarda la strada; sx sceglie a caso da che parte stanno piscina, tennis e laghetto -----
PLAN.v=(K,S)=>{const{R,rr,ri,pick,m}=K,c=Math.cos(S.a),s=Math.sin(S.a),W=S.W,H=S.H,T=(u,v)=>[S.x+u*c-v*s,S.y+u*s+v*c],sx=R()<.5?1:-1;S.T=T;S.ends=[T(0,H/2+70)];
 const pool=[sx*W*.26,H*.2],court=[-sx*W*.27,H*.21],fon=[0,H*.04],pond=[-sx*W*.32,-H*.3,rr(44,58)],grove=[sx*W*.34,-H*.39],garage=[sx*W*.36,-H*.13];
 const free=(u,v,r)=>(Math.abs(u-pool[0])>65+r+8||Math.abs(v-pool[1])>35+r+8)&&(Math.abs(u-court[0])>70+r+8||Math.abs(v-court[1])>38+r+8)&&Math.hypot(u-pond[0],v-pond[1])>pond[2]+r+12&&Math.hypot(u-fon[0],v-fon[1])>66+r&&Math.abs(u)>24+r;
 const tr=(u,v,r,sw)=>{if(free(u,v,r)){const q=T(u,v);K.tree(q[0],q[1],r,sw)}};
 K.later.push(()=>{const pp=T(pool[0],pool[1]),cc=T(court[0],court[1]);
  m.flat.push({k:'vpark',x:S.x,y:S.y,w:W,h:H,a:S.a,s:ri(0,1e6),sx,fon,pond,pool,court},{k:'pool',x:pp[0],y:pp[1],w:130,h:70,a:S.a},{k:'court',x:cc[0],y:cc[1],w:140,h:75,a:S.a});
  K.addB(...T(0,-H*.22),rr(190,240),rr(150,190),S.a,pick(['combo','L','U','H','cross']),true,false,'house',[0,1,2,5],4,true,0);
  K.addB(...T(garage[0],garage[1]),rr(90,100),rr(100,110),S.a,'rect',true,false,'house',[0,1,2,5],4,true,0);
  for(let v2=H*.44;v2>H*.13;v2-=36)for(const sd of[-1,1]){const q=T(sd*32,v2);K.tree(q[0],q[1],rr(11,14),1)}                                    // viale alberato dal cancello alla fontana
  for(let i=0,n=ri(7,11);i<n;i++){const t=R()*TAU,d=Math.sqrt(R())*72;tr(grove[0]+Math.cos(t)*d,grove[1]+Math.sin(t)*d*.6,rr(13,20))}     // boschetto
  for(let i=0,n=ri(4,7);i<n;i++){const t=R()*TAU;tr(pond[0]+Math.cos(t)*(pond[2]+30),pond[1]+Math.sin(t)*(pond[2]+24),rr(11,17))}            // alberi attorno al laghetto
  for(const sd of[-1,1])for(let i=0,n=ri(2,4);i<n;i++)tr(sd*W*.42+rr(-22,22),H*.41+rr(-16,10),rr(12,17));                                     // angoli verso la strada
  for(const sd of[-1,1])for(let v2=-H*.42;v2<H*.06;v2+=rr(55,80))if(R()<.7)tr(sd*(W/2-28),v2,rr(11,16));                                        // filari lungo i muri laterali
  if(R()<.85)K.wallRect(S.x,S.y,S.a,W,H,14,[T(0,H/2)])})};
// ----- cava: fossa a gradoni, frantoio, silos, nastro trasportatore, cumuli di massi -----
PLAN.q=(K,S)=>{const{R,rr,ri,m}=K,c=Math.cos(S.a),s=Math.sin(S.a),T=(u,v)=>[S.x+u*c-v*s,S.y+u*s+v*c],rp=S.rp;S.T=T;S.ends=[T(rp+210,0)];
 m.flat.push({k:'pit',x:S.x,y:S.y,r:rp,a:S.a,cv:1,s:ri(0,1e6)});   // la fossa (col nastro verso il frantoio) è disegnata sopra tutto il terreno: niente la copre
 K.later.push(()=>{const p=T(rp+110,-40);K.fitB(p[0],p[1],rr(170,210),rr(120,150),S.a,S.a,'fact','house',PAL_IND,2,0,0);
  K.addX(...T(rp+90,130),rr(70,84)*ri(1,2),76,S.a+1.5708,'silo',0,{o:{v:1}});K.addX(...T(rp+190,90),60,60,0,'tank',0,{o:{v:1}});
  m.flat.push({k:'lot',x:T(rp+150,-150)[0],y:T(rp+150,-150)[1],w:150,h:80,a:S.a,s:ri(0,1e6),mil:1});
  for(let i=0,n=ri(10,18);i<n;i++){const t=rr(1.1,5.2),d=rp+rr(25,150);   // massi attorno alla fossa, non dal lato del frantoio
  K.rock(S.x+Math.cos(S.a+t)*d,S.y+Math.sin(S.a+t)*d,rr(18,60))}})};

// ----- arena (sito 's'): stadio con tribune ad anello, piazzale pedonale tutto attorno, parcheggi sui fianchi. Il campo cambia a ogni arena:
// 0 gladiatori · 1 calcio · 2 basket · 3 atletica · 4 tennis · 5 football americano · 6 baseball · 7 motocross / monster truck.
// Oggetti veri: la facciata esterna e il parapetto del campo (muri con 3-4 varchi allineati), a volte una tribuna coperta (edificio), gli alberi del piazzale.
// Tutto il resto (pubblico, campo, luci, tabelloni, chioschi...) è disegno: PF.arena in AGbake.js -----
// A: semiasse maggiore esterno [min,max] · q: rapporto B/A · n: esponente della superellisse (2 = ellisse, 4 = rettangolo arrotondato) · D: profondità delle tribune
const ARENA_V=[
 {A:[300,360],q:[.78,.84],n:2,D:[85,110]},     // 0 gladiatori (anfiteatro ellittico)
 {A:[320,380],q:[.66,.72],n:4,D:[80,105]},     // 1 calcio
 {A:[230,280],q:[.68,.74],n:3.2,D:[60,80]},    // 2 basket (palazzetto)
 {A:[330,380],q:[.62,.70],n:2.6,D:[75,95]},    // 3 atletica
 {A:[220,270],q:[.70,.78],n:3.2,D:[60,80]},    // 4 tennis (campo centrale)
 {A:[320,380],q:[.62,.70],n:4,D:[80,100]},     // 5 football americano
 {A:[300,350],q:[.86,.94],n:2.4,D:[75,95]},    // 6 baseball
 {A:[310,370],q:[.66,.76],n:2,D:[70,90]}];     // 7 motocross / monster truck
const ARENA_P=70;                                // larghezza del piazzale pedonale attorno alla facciata
const ARENA_GW=40;                               // metà larghezza dei varchi (tunnel d'ingresso) nella facciata e nel parapetto
// punto della superellisse di semiassi a,b ed esponente n all'angolo di parametro t
const sePt=(a,b,n,t)=>{const c=Math.cos(t),s=Math.sin(t);return[a*Math.sign(c)*Math.pow(Math.abs(c),2/n),b*Math.sign(s)*Math.pow(Math.abs(s),2/n)]};
// punti della superellisse equidistanti lungo il bordo (passo step px): servono per muri, file di posti, alberi e lampioni
function seEven(a,b,n,step){const N=480,Q=[];let L=0;
 for(let i=0;i<=N;i++){const p=sePt(a,b,n,i/N*TAU);if(i)L+=Math.hypot(p[0]-Q[i-1][0],p[1]-Q[i-1][1]);p.L=L;Q.push(p)}
 const k=Math.max(12,Math.round(L/step)),ds=L/k,P=[];let j=0;
 for(let i=0;i<k;i++){const d=i*ds;while(j<N-1&&Q[j+1].L<d)j++;const u=(d-Q[j].L)/((Q[j+1].L-Q[j].L)||1);P.push([lerp(Q[j][0],Q[j+1][0],u),lerp(Q[j][1],Q[j+1][1],u)])}
 return P}
// tutta l'impronta dell'arena (superellisse del piazzale più la fascia dei parcheggi) è asciutta?
function arenaDry(S){const R0=S.A+S.P+40;for(let u=-R0;u<=R0;u+=30)for(let w=-R0;w<=R0;w+=30){if(Math.pow(Math.abs(u/(S.A+S.P+10)),S.n)+Math.pow(Math.abs(w/(S.B+S.P+120)),S.n)>1)continue;const q=S.T(u,w);if(wetCell(q[0],q[1]))return false}return true}
function arenaAt(K,x,y){const{R,rr,ri}=K,v=ri(0,ARENA_V.length-1),T0=ARENA_V[v],A=rr(T0.A[0],T0.A[1]),B=A*rr(T0.q[0],T0.q[1]),D=rr(T0.D[0],T0.D[1]),a=R()*Math.PI,c=Math.cos(a),s=Math.sin(a);
 return{x,y,a,A,B,D,P:ARENA_P,n:T0.n,v,r:A+ARENA_P+40,T:(u,w)=>[x+u*c-w*s,y+u*s+w*c]}}
PLAN.s=(K,S)=>{const{R,rr,ri,m}=K,{A,B,D,P,n,T}=S,a=A-D,b=B-D;
 S.ends=[T(A+P+60,0),T(-A-P-60,0)];   // le strade arrivano alle due testate
 const f={k:'arena',x:S.x,y:S.y,a:S.a,A,B,D,P,n,v:S.v,s:ri(0,1e6),r:A+P,gr:0,gt:[[A,0],[-A,0],[0,B],[0,-B]]};m.flat.push(f);
 // parcheggi sui due fianchi, oltre il piazzale (dentro l'area del sito)
 const lh=Math.min(100,A-B+10),lw=Math.min(2*A*.55,300);
 if(lh>=56)for(const sd of[-1,1]){const q=T(0,sd*(B+P+lh/2+4));m.flat.push({k:'lot',x:q[0],y:q[1],w:lw,h:lh,a:S.a,s:ri(0,1e6)})}
 K.later.push(()=>{
  // tribuna coperta (solo negli stadi "squadrati"): un edificio vero sopra le gradinate di un lato lungo; lì la facciata non ha varco
  if(n>=3&&R()<.75){const o=K.addB(...T(0,-(B-D/2)),2*a*.6,D-8,S.a,'rect',true,false,'house',[0,1,2,5],2,0,0);if(o){o.nfz=1;f.gr=1;f.gt=f.gt.slice(0,3)}}
  // anello di muri lungo una superellisse, con i varchi dove servono
  // varco: niente muro dove il pezzo invaderebbe la fascia larga 2×ARENA_GW lungo l'asse del varco (stessa fascia dei tunnel disegnati da AGbake)
  const inG=(u,w,h)=>f.gt.some(q=>q[0]?Math.sign(u)===Math.sign(q[0])&&Math.abs(w)<ARENA_GW+h:Math.sign(w)===Math.sign(q[1])&&Math.abs(u)<ARENA_GW+h);
  const ring=(ra,rb,th,step)=>{const Pt=seEven(ra,rb,n,step);
   for(let i=0;i<Pt.length;i++){const p=Pt[i],q=Pt[(i+1)%Pt.length],mu=(p[0]+q[0])/2,mv=(p[1]+q[1])/2,L=Math.hypot(q[0]-p[0],q[1]-p[1]);if(inG(mu,mv,L/2))continue;
    const c=T(mu,mv);K.wallSeg(c[0],c[1],L+2,th,S.a+Math.atan2(q[1]-p[1],q[0]-p[0]),[],'arena'+S.id)}};
  ring(A-8,B-8,22,62);   // facciata esterna
  ring(a+4,b+4,10,48);   // parapetto del campo (i varchi sono allineati a quelli della facciata)
  // alberi in aiuola sul piazzale, lontano dai varchi
  const gp=f.gt.map(q=>[q[0]?Math.sign(q[0])*(A+P/2):0,q[1]?Math.sign(q[1])*(B+P/2):0]);
  for(const p of seEven(A+P*.58,B+P*.58,n,78))if(gp.every(q=>Math.hypot(p[0]-q[0],p[1]-q[1])>130)&&R()<.8){const q=T(p[0],p[1]);K.tree(q[0],q[1],rr(11,15))}})};

// ===== FASE 3: mini-siti satelliti =====
// Attorno a ogni sito nascono alcuni mini-siti (formazioni di edifici su un piazzale, avamposti, depositi, cascine...) del suo stesso carattere e con le sue tinte:
// distanza, direzione e rotazione sono del tutto casuali, ma ognuno lascia un corridoio libero tutto attorno e ha un varco verso il sito. Le strade arrivano dopo.
const SAT_K={mil:['outpost','block','outpost','block'],indus:['depot','block','mine','depot'],urban:['block','block','block','hamlet','roadside'],rural:['farmstead','hamlet','lumber','farmstead']};
function genSats(K){const{m,R,rr,ri,pick,shuf,PROF}=K;m.sats=[];
 const dens=PROF.city>=.6?2.8:PROF.city>=.45?2.1:PROF.city>=.3?1.3:PROF.city>0?1:.5;   // quanti satelliti: dal profilo
 for(const S of shuf(m.sites.slice())){const zt=SITE[S.k]?SITE[S.k].zt:S.k=='g'?'urban':S.k=='p'||S.k=='q'?'indus':'rural';
  const n=Math.round((S.ds?ri(2,4)+Math.round(S.ds.length*1.5):S.k=='v'?ri(0,1):'fq'.includes(S.k)?ri(0,2):ri(1,3))*dens);
  for(let i=0,t=0;i<n&&t<n*20;t++){const D=S.ds?pick(S.ds):null,cx=D?D.x:S.x,cy=D?D.y:S.y,ph=R()*TAU,d=(D?D.rad:S.r)+rr(80,560*Math.max(1,dens*.7)),kind=pick(SAT_K[zt]),pals=D?D.tone:S.tone;
   for(const sc of[1,.85]){const T0=minorSite(K,cx+Math.cos(ph)*d,cy+Math.sin(ph)*d,R()*TAU,kind,sc,pals&&(kind=='block'||R()<.6)?pals:null,{mg:110,to:[cx,cy]});
    if(T0){T0.par=S;m.sats.push(T0);i++;break}}}}}

// ===== FASE 4: strade (dopo i siti) =====
// Ogni strada è un percorso su una griglia da 80 px: evita laghi, mare, i siti e i mini-siti (celle con un proprietario: chiuse), costa un po' di più accanto a loro
// (resta un margine), attraversa i fiumi solo se serve e costa meno dove una strada esiste già: così le strade confluiscono.
// 1) autostrade: entrano da un bordo, toccano i varchi di uno o due siti maggiori lungo il cammino ed escono da un altro bordo
// 2) collegamenti: albero minimo fra la base e tutti i siti (più qualche anello), larghezza secondo il rango dei siti; il percorso intero resta in M.links (missione "scorta convoglio")
// 3) raccordi: dal varco di ogni satellite alla strada più vicina
// Solo i tratti NUOVI diventano strade.
function genRoads(K){const{m,R,rr,ri,pick,PROF}=K,RC=80,RW=WW/RC,RH=WH/RC,N=RW*RH,base=new Float32Array(N),own=new Int16Array(N),adj=new Uint8Array(N),tight=new Uint8Array(N);
 for(let j=0;j<RH;j++)for(let i=0;i<RW;i++){const x=i*RC+40,y=j*RC+40,c=j*RW+i;let k=1,wet=0,riv=0,o=0;
  for(const[dx,dy]of[[-20,-20],[20,-20],[-20,20],[20,20]]){const t=K.cell(x+dx,y+dy);if(m.WM[t]){if(m.RV[t])riv=1;else wet=1}if(m.own[t])tight[c]=1}o=m.own[K.cell(x,y)];   // la cella è di un sito se lo è il suo centro; se lo è solo un quarto è "stretta" (si passa solo se serve)
  const b=K.bioAt(x,y),l=levelAt(x,y);if(b==BIO.forest)k+=.6;else if(b==BIO.rock)k+=1.3;if(levelAt(x+RC,y)!=l||levelAt(x,y+RC)!=l)k+=1.5;
  base[c]=wet?1e9:riv?k+6:k;own[c]=o}
 for(let j=1;j<RH-1;j++)for(let i=1;i<RW-1;i++){const c=j*RW+i;if(own[c])continue;for(let dy=-1;dy<=1&&!adj[c];dy++)for(let dx=-1;dx<=1;dx++)if(own[c+dy*RW+dx]){adj[c]=1;break}}
 const dist=new Float64Array(N),par=new Int32Array(N),net=new Uint8Array(N),rc=(x,y)=>clamp(y/RC|0,0,RH-1)*RW+clamp(x/RC|0,0,RW-1),mark=rd=>{for(const q of rd.pts)net[rc(q[0],q[1])]=1};
 for(const rd of m.roads)mark(rd);
 const HK=new Float64Array(N*9),HV=new Int32Array(N*9);let hn=0;   // coda a priorità (heap binario): chiave = distanza, valore = cella
 const hpush=(k,v)=>{let i=hn++;while(i>0){const p=(i-1)>>1;if(HK[p]<=k)break;HK[i]=HK[p];HV[i]=HV[p];i=p}HK[i]=k;HV[i]=v};
 const hpop=()=>{const k0=HK[0],v0=HV[0],k=HK[--hn],v=HV[hn];let i=0;for(;;){let c=i*2+1;if(c>=hn)break;if(c+1<hn&&HK[c+1]<HK[c])c++;if(HK[c]>=k)break;HK[i]=HK[c];HV[i]=HV[c];i=c}HK[i]=k;HV[i]=v;return[k0,v0]};
 // hw: autostrada (non entra nelle città; soft: ripiego che le attraversa lungo le loro vie, vedi lay)
 const route=(a,b,ia,ib,hw,soft)=>{const s=rc(a[0],a[1]),g=rc(b[0],b[1]);hn=0;hpush(0,s);dist.fill(1e12);par.fill(-1);dist[s]=0;
  // dentro il proprio sito si passa solo lungo le sue vie (o pagando caro); una città altrui si attraversa lungo le sue vie; gli altri siti e i satelliti sono chiusi
  const sx=s%RW,sy=s/RW|0,gx=g%RW,gy=g/RW|0,near=(c,r)=>{const x=c%RW,y=c/RW|0;return Math.max(Math.abs(x-sx),Math.abs(y-sy))<=r||Math.max(Math.abs(x-gx),Math.abs(y-gy))<=r};
  // le città (anche la propria) sono chiuse: si entra e si esce solo dai capi delle loro vie, sul perimetro (lungo la via); i complessi solo dal varco; gli altri siti propri (fattoria, cava...) si attraversano pagando caro
  const cost=c=>{if(c==s||c==g)return 1;const o=own[c];if(o>0&&m.sites[o-1].k=='v')return 1e9;if(soft&&o>0&&m.sites[o-1].ds)return net[c]?1.3:1e9;if(o>0&&(o==ia||o==ib)){const S=m.sites[o-1];return S.ds?(near(c,1)||near(c,2)&&net[c]?3:1e9):S.parts?(near(c,2)?3:1e9):25}if(o)return 1e9;return base[c]*(net[c]?.35:1)+(tight[c]?8:adj[c]?2.5:0)};
  while(hn){const[d,c]=hpop();if(d>dist[c])continue;if(c==g)break;
   const cx=c%RW,cy=c/RW|0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const x=cx+dx,y=cy+dy;if(x<1||y<1||x>=RW-1||y>=RH-1)continue;const n=y*RW+x,k=cost(n);if(k>=1e8)continue;
    if(dx&&dy&&(cost(cy*RW+x)>=1e8||cost(y*RW+cx)>=1e8))continue;   // niente diagonali che tagliano lo spigolo di un'area chiusa
    const nd=d+k*(dx&&dy?1.414:1);if(nd<dist[n]){dist[n]=nd;par[n]=c;hpush(nd,n)}}}
  if(par[g]<0)return null;const cs=[];for(let c=g;c>=0;c=par[c])cs.push(c);cs.reverse();
  let p=[a.slice(),...cs.slice(1,-1).map(c=>[(c%RW)*RC+40,(c/RW|0)*RC+40]),b.slice()];
  for(let it=0;it<2;it++){const q=[p[0]];for(let i=0;i<p.length-1;i++){const A=p[i],B=p[i+1];q.push([A[0]*.75+B[0]*.25,A[1]*.75+B[1]*.25],[A[0]*.25+B[0]*.75,A[1]*.25+B[1]*.75])}q.push(p[p.length-1]);p=q}   // smussa gli angoli
  const out=[p[0]];for(const q of p){const l=out[out.length-1];if(Math.hypot(q[0]-l[0],q[1]-l[1])>=42)out.push(q)}out.push(p[p.length-1]);return out};
 // solo i tratti che non ricalcano una strada esistente diventano strade
 // soft: percorso di ripiego che passa per le vie di una città (lì non si disegna nulla: le vie ci sono già)
 const lay=(pts,w,cls,ty,main,soft)=>{const on=pts.map(q=>{if(onRoad(q[0],q[1],2))return true;if(!soft)return false;const o=own[rc(q[0],q[1])];return o>0&&!!m.sites[o-1].ds});let run=[];
  const flush=()=>{if(run.length>=3){const rd=K.addRoad({pts:run,w,ty,cls,sw:0});if(main)rd.main=1;mark(rd)}run=[]};
  pts.forEach((q,i)=>{if(!on[i]){if(!run.length&&i>0)run.push(pts[i-1]);run.push(q)}else if(run.length){run.push(q);flush()}});flush()};
 const bc=baseXY(330,330),nodes=[{x:bc[0],y:bc[1],k:'c',id:0,ends:[baseXY(560,330),baseXY(330,560)]},...m.sites],dn=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),lk=new Set();
 // capo raggiungibile: a non più di 2 celle da terreno libero (i capi delle vie interne a una città fatta di più quartieri non lo sono)
 const open=e=>{const ex=clamp(e[0]/RC|0,1,RW-2),ey=clamp(e[1]/RC|0,1,RH-2);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=ex+dx,y=ey+dy;if(x<1||y<1||x>=RW-1||y>=RH-1)continue;const c=y*RW+x;if(!own[c]&&base[c]<1e8)return true}return false};
 const nearEnd=(A,P)=>{let b=[A.x,A.y],bd=1e9;const E=(A.ends||[]).filter(open),L=E.length?E:A.ends||[];for(const e of L){const d=Math.hypot(e[0]-P[0],e[1]-P[1]);if(d<bd){bd=d;b=e}}return b};
 // 1) autostrade
 const big=m.sites.filter(S=>S.ds||SITE_RK[S.k]==3),used=new Map(),nH=Math.max(1,Math.round(ri(PROF.roads[0],PROF.roads[1])*.6));
 const edge=e=>{for(let t=0;t<40;t++){const p=e==0?fromUV(40,rr(500,WH-500)):fromUV(rr(500,SEA-900),e==1?40:WH-40),c=rc(p[0],p[1]);if(!own[c]&&!adj[c]&&base[c]<20&&K.dS(p[0],p[1])>700)return p}return null};
 for(let h=0;h<nH;h++){const e1=ri(0,2),e2=(e1+ri(1,2))%3,A=edge(e1),B=edge(e2);if(!A||!B)continue;
  const vx=B[0]-A[0],vy=B[1]-A[1],L2=vx*vx+vy*vy,on=[];
  for(const S of big){const t=clamp(((S.x-A[0])*vx+(S.y-A[1])*vy)/L2,.08,.92),d=Math.hypot(S.x-A[0]-vx*t,S.y-A[1]-vy*t);if(d<1700)on.push([d+(used.get(S)||0)*1200+rr(0,500),t,S])}
  on.sort((a,b)=>a[0]-b[0]);const via=on.slice(0,R()<.5?1:2).sort((a,b)=>a[1]-b[1]).map(q=>q[2]);
  const w=rr(74,90);let P=A,pS=null;
  for(const S of[...via,null]){const Q=S?nearEnd(S,P):B;let soft=0,pts=route(P,Q,pS?pS.id:0,S?S.id:0,1);if(!pts){soft=1;pts=route(P,Q,pS?pS.id:0,S?S.id:0,1,1)}
   if(pts){lay(pts,w,'hw',0,1,soft);if(pS&&S&&pS.k!='c'&&S.k!='c'){m.links.push({lk:[pS,S],pts,w})}}
   if(S){used.set(S,(used.get(S)||0)+1);P=Q;pS=S}}}
 // 1b) lungomare (mappe urbane): una strada che segue la costa da un capo all'altro, a tappe; ogni tappa aggira i siti come le altre
 if(PROF.city>=.45||PROF.city>=.3&&R()<.6){const off=rr(230,330),wp=[];
  for(let v=rr(120,300);v<WH-120;v+=rr(420,620)){const p=fromUV(coastV(v)-off-(m.ports.some(q=>Math.abs(v-q.cv)<650)?700:0),v),c=rc(p[0],p[1]);if(!own[c]&&base[c]<1e8&&K.inMap(p[0],p[1],60))wp.push(p)}
  const w=rr(44,52);for(let i=0;i<wp.length-1;i++){if(Math.hypot(wp[i+1][0]-wp[i][0],wp[i+1][1]-wp[i][1])>1500)continue;const pts=route(wp[i],wp[i+1],0,0,0);if(pts)lay(pts,w,'av',0,0)}}
 // 2) collegamenti fra i siti
 const link=(A0,B0)=>{const ea=nearEnd(A0,[B0.x,B0.y]),eb=nearEnd(B0,ea),k=Math.min(SITE_RK[A0.k]||1,SITE_RK[B0.k]||1),w=k==3?rr(52,62):k==2?rr(38,46):rr(28,36),dirt=k==1&&R()<.35;
  let soft=0,pts=route(ea,eb,A0.id,B0.id,0);if(!pts){soft=1;pts=route(ea,eb,A0.id,B0.id,0,1)}if(!pts)return false;   // se le città sbarrano il passo: lungo le loro vie
  m.links.push({lk:[A0,B0],pts,w});lay(pts,w,k==3?'av':dirt?'dirt':'st',dirt?1:0,0,soft);return true};
 const inT=[0],bad=new Set();
 while(inT.length<nodes.length){let bi=-1,bj=-1,bd=1e9;for(const i of inT)for(let j=0;j<nodes.length;j++)if(!inT.includes(j)&&!bad.has(i+','+j)&&dn(nodes[i],nodes[j])<bd){bd=dn(nodes[i],nodes[j]);bi=i;bj=j}
  if(bi<0)break;if(link(nodes[bi],nodes[bj])){inT.push(bj);lk.add(bi+','+bj)}else bad.add(bi+','+bj)}
 for(let i=1;i<nodes.length;i++)if(R()<.35){let bj=-1,bd=1e9;for(let j=1;j<nodes.length;j++)if(j!=i&&!lk.has(i+','+j)&&!lk.has(j+','+i)&&dn(nodes[i],nodes[j])<bd){bd=dn(nodes[i],nodes[j]);bj=j}if(bj>=0&&bd<3200){lk.add(i+','+bj);link(nodes[i],nodes[bj])}}
 // 3) raccordi dei satelliti: dal varco al punto di strada più vicino (non le vie interne dei complessi), sterrato in campagna
 for(const T0 of m.sats){const g=T0.ends[0];let best=null,bd=1700;
  for(const rd of m.roads){if(rd.site||g[0]<rd.bb[0]-bd||g[0]>rd.bb[2]+bd||g[1]<rd.bb[1]-bd||g[1]>rd.bb[3]+bd)continue;   // strade fuori dai siti...
   for(const q of rd.pts){const d=Math.hypot(q[0]-g[0],q[1]-g[1]);if(d<bd){bd=d;best=q}}}
  for(const S of m.sites)for(const q of S.ends||[]){const d=Math.hypot(q[0]-g[0],q[1]-g[1]);if(d<bd){bd=d;best=q}}   // ...o i varchi dei siti
  if(!best)best=nearEnd(T0.par,g);
  const dirt='farmstead lumber mine'.includes(T0.kind)&&R()<.6,ob=own[rc(best[0],best[1])],pts=route(g,best,0,ob>0?ob:0,0);if(pts&&pts.length>=2)lay(pts,rr(22,30),dirt?'dirt':'st',dirt?1:0,0)}
 // sicurezza: ciò che una strada nuova tocca comunque (lo spigolo di un edificio di fattoria, un tratto di muro) sparisce
 for(const rd of m.roads){if(rd.site)continue;for(const q of rd.pts)for(const b of qobs(q[0],q[1],rd.w/2+160,[])){if(b.t!='b'||b.dead||b.ty=='rock')continue;const l=toLocal(b,q[0],q[1]);if(bsd(b,l[0],l[1])<rd.w/2-4){b.dead=1;m.cut=(m.cut||0)+1}}}}

// ===== strade che finiscono vicino a un'altra dello stesso tipo: si collegano =====
// Per ogni capo di strada non già innestato su un'altra via si cerca, entro 320 px e in avanti, la via più vicina dello stesso fondo
// (asfalto o sterrato) e di larghezza simile; il raccordo si fa se il tracciato è libero (niente edifici, muri, lago o mare, stessa quota; i fiumi si passano con un ponte).
function connectRoads(K){const{m}=K,grp=rd=>rd.ty==1?1:0,ends=[];
 for(const rd of m.roads)if(rd.pts.length>=2)ends.push([rd,0],[rd,rd.pts.length-1]);
 for(const[rd,ie]of ends){const E=rd.pts[ie],P2=rd.pts[ie?ie-1:1],dl=Math.hypot(E[0]-P2[0],E[1]-P2[1])||1,ux=(E[0]-P2[0])/dl,uy=(E[1]-P2[1])/dl,seen=new Set();
  let best=null,bs=1e9,conn=false;
  for(let i=-4;i<=4&&!conn;i++)for(let j=-4;j<=4&&!conn;j++){const a=m.roadCells.get(((E[0]/100|0)+i)*1024+(E[1]/100|0)+j);if(!a)continue;
   for(const o of a){if(conn)break;if(seen.has(o))continue;seen.add(o);
    for(let k=0;k<o.pts.length-1;k++){if(o===rd&&Math.abs(k-ie)<9)continue;const A=o.pts[k],B=o.pts[k+1],vx=B[0]-A[0],vy=B[1]-A[1],t=clamp(((E[0]-A[0])*vx+(E[1]-A[1])*vy)/(vx*vx+vy*vy||1),0,1),qx=A[0]+vx*t,qy=A[1]+vy*t,d=Math.hypot(E[0]-qx,E[1]-qy);
     if(d<o.w/2+3){conn=true;break}
     if(grp(o)!=grp(rd)||Math.min(o.w,rd.w)/Math.max(o.w,rd.w)<.38||d-o.w/2>320)continue;
     const dot=((qx-E[0])*ux+(qy-E[1])*uy)/(d||1);if(dot<-.15)continue;   // mai all'indietro
     const sc=(d-o.w/2)*(1.7-dot*.7);if(sc<bs){bs=sc;best=[qx,qy,o]}}}}
  if(conn||!best)continue;
  const[qx,qy,o]=best,L=Math.hypot(qx-E[0],qy-E[1]),n=Math.max(2,Math.ceil(L/20)),w=Math.min(rd.w,o.w),l0=levelAt(E[0],E[1]);let ok=levelAt(qx,qy)===l0,nRiv=0;
  for(let k=1;k<n&&ok;k++){const x=E[0]+(qx-E[0])*k/n,y=E[1]+(qy-E[1])*k/n;
   const ow=m.own[K.cell(x,y)];if(!K.inMap(x,y,30)||(wetCell(x,y)&&!riverCell(x,y))||levelAt(x,y)!==l0||(riverCell(x,y)&&++nRiv>8)||ow>0&&m.sites[ow-1].k=='v'){ok=false;break}   // un fiume si attraversa, non si percorre
   for(const b of qobs(x,y,w/2+60,[])){if(b.t=='t'||b.ty=='rock'||b.dead)continue;const lc=toLocal(b,x,y);if(bsd(b,lc[0],lc[1])<w/2+4){ok=false;break}}}
  if(!ok)continue;
  const nr=K.st(E,[qx,qy],w,rd.cls,rd.sw);nr.ty=rd.ty;if(rd.site)nr.site=1;nr.join=1;K.addRoad(nr)}}

// ===== radure per le missioni =====
// Conquista avamposto (5) e Ricerca e recupero (10) cercano uno spazio libero vicino a un sito lontano dalla partenza:
// la mappa lo tiene libero PRIMA del riempimento (M.keep), così la missione lo trova subito e non serve rigenerare la mappa.
function missionKeep(K){const{m,R,rr}=K,sel=G.mode==1?-1:G.sel;m.keep=[];if(sel!=5&&sel!=10)return;
 const far=s=>K.dS(s.x,s.y)>OBJ_MIN+150,sites=m.sites.filter(s=>far(s)&&(sel==5?s.ds:'gcivkyna'.includes(s.k))),cl=sel==5?KOTH_R*.6+30:240,rd=sel==5?380:760,want=sel==5?2:1;
 for(const s of K.shuf(sites)){if(m.keep.length>=want)break;if(m.keep.some(k=>Math.hypot(k.x-s.x,k.y-s.y)<1300))continue;
  for(let t=0;t<300;t++){const a=R()*TAU,d=t<20?rr(0,120):rr(sel==10?220:0,rd),x=s.x+Math.cos(a)*d,y=s.y+Math.sin(a)*d;
   if(!K.inMap(x,y,260)||K.dS(x,y)<OBJ_MIN+60||inWater(x,y,sel==5?KOTH_R+50:20)||onRoad(x,y,sel==10?130:0)&&sel==10||m.bridges.some(b=>Math.hypot(x-b.x,y-b.y)<b.L/2+KOTH_R+60))continue;
   if(qobs(x,y,cl+400,[]).some(o=>o.t!='t'&&o.ty!='rock'&&!o.dead&&Math.hypot(x-o.x,y-o.y)<o.r+cl+10))continue;
   K.clearNat(x,y,cl+40);K.stampC(x,y,cl+60,null,null,-1);m.keep.push({x,y,r:cl+40,s:s.id});break}}}

// ===== FASE 5: il resto: siti minori lungo le strade e tessuto urbano attorno alle città =====
// MINOR: w,h = piazzale · n = quanti edifici piccoli · sz = lato · pat = disposizioni possibili · main = edificio principale [lato min, max, forme] · x = oggetti a terra
const MINOR={
 hamlet:{w:[300,430],h:[240,330],sz:[80,104],pat:['square','rows2','arc','L'],pal:PAL_RES,main:[150,180,['L','rect','U','T']],zt:'urban',x:['crates','barrels']},
 farmstead:{w:[320,420],h:[250,320],sz:[84,100],pat:['L','row'],pal:[0,1,3,17,20],main:[150,190,['L','rect','combo']],zt:'rural',x:['haybale','haysq','tractor','trough'],silo:1,field:1},
 roadside:{w:[260,340],h:[190,240],sz:[76,92],pat:['row'],pal:PAL_COM,main:[150,170,['rect','fact']],zt:'urban',x:['van','pickup','barrels'],lot:1},
 depot:{w:[340,440],h:[240,300],sz:[90,110],pat:['rows2','row','grid'],pal:PAL_IND,main:[160,200,['fact','rect']],zt:'indus',x:['crates','pallet','forklift','hauler'],tank:1,cont:1},
 outpost:{w:[280,360],h:[230,290],sz:[86,100],pat:['arc','L','row'],pal:PAL_MIL,main:[130,150,['oct','hex','square']],zt:'mil',x:['sandbags','jeep','crates','tent'],tur:1,wall:1},
 lumber:{w:[260,330],h:[210,260],sz:[78,92],pat:['row','L'],pal:[1,3,17],main:[120,140,['rect','L']],zt:'rural',x:['logs','logs','log','dozer','trailer']},
 mine:{w:[280,350],h:[220,270],sz:[80,96],pat:['row','L'],pal:PAL_IND,main:[130,150,['fact','rect']],zt:'indus',x:['dumper','excav','debris','barrels'],tank:1},
 block:{w:[250,300],h:[240,290],sz:[84,100],pat:['square','rows2','L','grid'],pal:PAL_CITY,main:[150,200,BTOWN],zt:'urban',x:[],tight:1}};
// sc = scala del piazzale (i tentativi successivi provano piazzali più piccoli)
function minorSite(K,x,y,a,kind,sc,pals,o){sc=sc||1;o=o||{};const{R,rr,ri,pick,m}=K,D=MINOR[kind],w=rr(D.w[0],D.w[1])*sc,h=rr(D.h[0],D.h[1])*sc,c=Math.cos(a),s=Math.sin(a),T=(u,v)=>[x+u*c-v*s,y+u*s+v*c];
 if(!K.inMap(x,y,Math.hypot(w,h)/2+30)||K.dS(x,y)<520)return false;
 for(const[u,v]of[[0,0],[-1,-1],[1,-1],[1,1],[-1,1],[0,-1],[0,1],[-1,0],[1,0]]){const p=T(u*w/2,v*h/2),i=K.cell(p[0],p[1]);if(m.own[i]||wetCell(p[0],p[1])||m.WN[i])return false}
 if(o.mg){const e=o.mg;for(let u=-w/2-e;u<=w/2+e+1;u+=Math.max(30,(w+2*e)/8))for(let v=-h/2-e;v<=h/2+e+1;v+=Math.max(30,(h+2*e)/8)){const p=T(u,v);if(!K.inMap(p[0],p[1],90)||m.own[K.cell(p[0],p[1])])return false}   // satellite: un corridoio libero tutto attorno (ci passerà una strada)
  for(const st of m.sites)for(const g of st.ends||[])if(Math.abs((g[0]-x)*c+(g[1]-y)*s)<w/2+e+60&&Math.abs(-(g[0]-x)*s+(g[1]-y)*c)<h/2+e+60)return false}   // e non copre il varco di un sito
 if(rectOnRoad(x,y,w+16,h+16,a,6)||!K.lvlFlat(x,y,Math.max(w,h)*.55))return false;
 for(const o of qobs(x,y,Math.hypot(w,h)/2+60,[]))if(o.t!='t'&&o.ty!='rock'&&Math.hypot(o.x-x,o.y-y)<o.r+Math.hypot(w,h)/2)return false;
 K.clearRect(x,y,w,h,a,8);K.stampR(x,y,w,h,a,o.mg?34:6,ZTI[D.zt],D.zt=='rural'?null:BIO.urban,-1);
 // varco: sul lato rivolto verso o.to (il sito di cui è satellite) o, senza, su un lato a caso; il muro si apre lì e sul lato opposto
 const sides=[[0,-h/2,0,-1],[0,h/2,0,1],[-w/2,0,-1,0],[w/2,0,1,0]];let gs=sides[R()*4|0];
 if(o.to){let bd=1e9;for(const q of sides){const p=T(q[0]+q[2]*60,q[1]+q[3]*60),d=Math.hypot(p[0]-o.to[0],p[1]-o.to[1])*rr(.8,1.25);if(d<bd){bd=d;gs=q}}}
 const gate=T(gs[0]+gs[2]*(o.mg?o.mg+20:60),gs[1]+gs[3]*(o.mg?o.mg+20:60));
 const sf=o.mg?[1.08,1.22]:[1.1,1.3];m.flat.push({k:'slab',t:0,x,y,w:w*rr(sf[0],sf[1]),h:h*rr(sf[0],sf[1]),a,soft:1,tn:ri(0,5),st:ri(0,4),box:1});K.noSlab=1;   // il piazzale del gruppo sborda un po' oltre il recinto (non fino alla strada)
 const pl=pals||D.pal,ms=kind=='block'&&Math.max(w,h)>=2*M0+ALLEY&&miniSite(K,x,y,w-14,h-14,a,{pals:pl,st:R()<.5?'dense':'std',ch:'res',shapes:['rect','rect','square','L']});   // isolato del tessuto urbano: una formazione
 const tw=D.tight?1:0,fz=D.tight?1:3,mw=rr(D.main[0],D.main[1]),mh=mw*rr(.72,1),big=!ms&&(kind!='block'||R()<.5);
 if(big){const p=T(-w/2+mw/2+14,-h/2+mh/2+14);K.addB(p[0],p[1],mw,mh,a,pick(D.main[2]),true,false,'house',pl,fz,0,tw)}                 // edificio principale in un angolo
 const sz=rr(D.sz[0],D.sz[1]),ox=big?mw+ALLEY:0,pw=w-ox-16,ph=h-16,ms2=!ms&&kind!='block'&&pw>=M0&&ph>=M0&&Math.max(pw,ph)>=2*M0+ALLEY&&miniSite(K,...T(ox/2,0),pw,ph,a,{pals:pl,st:'std',ch:'res',shapes:['rect','rect','square','L']});   // accanto all'edificio principale: una formazione
 if(!ms&&!ms2){const sh0=pick(['rect','rect','square','L','oct']),p0=pick(pl),ps=[];   // ripiego: casette in fila/quadrato/L, ma ordinate (stessa forma, stesso colore, stesso verso) e posate insieme
  for(const q of K.pattern(pick(D.pat),pw,ph,sz,ALLEY)){const p=T(ox/2+q[0],q[1]);if(big&&Math.abs(q[0]+ox/2+w/2-mw/2-14)<mw/2+sz/2+6&&Math.abs(q[1]+h/2-mh/2-14)<mh/2+sz/2+6)continue;if(ps.every(o=>Math.hypot(o.x-p[0],o.y-p[1])>=sz+ALLEY-4))ps.push({x:p[0],y:p[1],w:sz,h:sz*.86,a:a+q[2],sh:sh0})}   // via le casette che lascerebbero un vicolo troppo stretto
  if(ps.length&&!K.addGroup(ps,{tight:true,pal:p0,fz,tw,gap:8}))for(const q of ps)K.addB(q.x,q.y,q.w,q.h,q.a,q.sh,true,false,'house',[p0],fz,0,tw)}
 if(D.silo){const p=T(w/2-50,-h/2+50);K.addX(p[0],p[1],64*ri(1,2),64,a,'silo',0,{gap:4,o:{v:ri(0,2)}})}
 if(D.tank){const p=T(w/2-48,h/2-48);K.addX(p[0],p[1],62,62,0,'tank',0,{gap:4,o:{v:ri(0,1)}})}
 if(D.cont)for(let i=0,n=ri(1,3);i<n;i++){const p=T(rr(-.3,.3)*w,h/2-22-i*30);K.addX(p[0],p[1],56*ri(1,2),24,a,'cont',0,{gap:4})}
 if(D.lot){const p=T(w*.18,h*.22);m.flat.push({k:'lot',x:p[0],y:p[1],w:w*.5,h:h*.4,a,s:ri(0,1e6)})}
 if(D.tur)m.tspots.push(T(w/2-40,h/2-40));
 if(R()<(D.wall?.85:.4))K.wallRect(x,y,a,w+8,h+8,12,[T(gs[0],gs[1]),T(-gs[0],-gs[1])]);   // muro di cinta del gruppo
 if(D.field){const p=T(0,h/2+110),fw=w*rr(.8,1.2);if(!rectOnRoad(p[0],p[1],fw,180,a,8)&&!m.own[K.cell(p[0],p[1])]&&!wetCell(p[0],p[1])){K.clearRect(p[0],p[1],fw,180,a,4);K.stampR(p[0],p[1],fw,180,a,8,ZTI.rural,BIO.farm,-1);m.flat.push({k:'field',x:p[0],y:p[1],w:fw,h:180,a,v:ri(0,5),s:ri(0,1e6),hedge:R()<.5})}}
 for(let i=0,n=D.x.length?ri(2,4):0;i<n;i++){const p=T(rr(-.4,.4)*w,rr(-.4,.4)*h);if(clearAt(p[0],p[1],14))m.flat.push({k:'veh',v:pick(D.x),x:p[0],y:p[1],a:a+rr(-.5,.5),col:pick(['#8a6a3a','#c0392b','#27ae60','#e67e22','#6b7580']),r:20,s:ri(0,1e6),o:{n:5,w:26}})}
 m.flat.push({k:'fence',pts:[T(-w/2+5,-h/2+5),T(w/2-5,-h/2+5),T(w/2-5,h/2-5),T(-w/2+5,h/2-5)],s:ri(0,1e6)});
 for(let i=0,n=ri(2,5);i<n;i++){const e=R()<.5,sg=R()<.5?1:-1,p=e?T(rr(-.5,.5)*w,sg*(h/2+16)):T(sg*(w/2+16),rr(-.5,.5)*h);K.tree(p[0],p[1],rr(13,20))}
 K.noSlab=0;return{x,y,w,h,a,kind,ends:[gate]}}
function genMinor(K){const{m,R,rr,pick,shuf,PROF}=K;
 // tipo adatto al posto: vicino a un sito ne prende il carattere, altrimenti dipende dalla natura del terreno
 const kindAt=(x,y)=>{let z=0,bd=1100;for(const s of m.sites){const d=Math.hypot(x-s.x,y-s.y)-s.r;if(d<bd){bd=d;z=SITE[s.k]?ZTI[SITE[s.k].zt]:s.k=='g'?2:s.k=='p'?3:1}}
  const b=K.bioAt(x,y);if(z==2)return R()<.75?'hamlet':'roadside';if(z==3)return R()<.7?'depot':'roadside';if(z==4)return'outpost';
  return b==BIO.forest?'lumber':b==BIO.rock?'mine':z==1||R()<.6?'farmstead':pick(['hamlet','roadside','outpost'])};
 // 1) lungo le strade (non quelle interne ai siti), su un lato o sull'altro
 const cand=[];for(const rd of m.roads){if(rd.site||rd.pts.length<8)continue;for(let i=3;i<rd.pts.length-3;i+=5)cand.push([rd,i,R()<.5?1:-1])}
 let n=0;for(const[rd,i,sd]of shuf(cand)){if(n>=PROF.minor)break;const q=rd.pts[i],q2=rd.pts[i+1],a=Math.atan2(q2[1]-q[1],q2[0]-q[0]),kind=kindAt(q[0],q[1]),D=MINOR[kind];
  for(const[sc,ex]of[[1,0],[1,70],[.8,30],[.66,110]]){const d=rd.w/2+D.h[1]*sc/2+rr(26,50)+ex;if(minorSite(K,q[0]-Math.sin(a)*d*sd,q[1]+Math.cos(a)*d*sd,a+(sd<0?Math.PI:0),kind,sc)){n++;break}}}
  if(PROF.fill>0){const towns=m.sites.filter(s=>s.ds),near=(x,y)=>{let b=null,bd=1e9;for(const s of towns)for(const D of s.ds){const d=Math.hypot(x-D.x,y-D.y)-D.rad;if(d<bd){bd=d;b=D}}return[b,bd]};
  // 2) tessuto urbano: isolati-formazione a caso attorno alle città, ma solo affacciati a una strada (entro ~260 px) e allineati a lei: il tessuto segue le vie, non riempie la campagna
  const roadDir=(x,y)=>{let bd=1e9,ba=null;for(let i=-3;i<=3;i++)for(let j=-3;j<=3;j++){const a=m.roadCells.get(((x/100|0)+i)*1024+(y/100|0)+j);if(a)for(const rd of a){for(let k=0;k<rd.pts.length-1;k++){const A=rd.pts[k],B=rd.pts[k+1],vx=B[0]-A[0],vy=B[1]-A[1],t=clamp(((x-A[0])*vx+(y-A[1])*vy)/(vx*vx+vy*vy||1),0,1),d=Math.hypot(x-A[0]-vx*t,y-A[1]-vy*t);if(d<bd){bd=d;ba=Math.atan2(vy,vx)}}}}return bd<260?ba:null};
  // metà circa dei punti cade nella fascia costiera (lungomare): lì il tessuto nasce anche lontano dalle città
  for(let i=0,ns=Math.round(6000*PROF.fill);i<ns;i++){const cs=R()<.5,q=cs?(v=>fromUV(coastV(v)-rr(150,1100),v))(rr(150,WH-150)):[rr(150,WW-150),rr(150,WH-150)],x=q[0],y=q[1],ci=K.cell(x,y);if(m.own[ci]||m.WN[ci])continue;
   const[D,d]=near(x,y);if(!D||!cs&&R()>clamp(1-d/(PROF.fill>=.9?900:600),0,1))continue;const a=roadDir(x,y);if(a==null)continue;
   for(const sc of[1,.84,.7])if(minorSite(K,x,y,a,'block',sc,d<900?D.tone:null))break}}
 // 3) edifici singoli affacciati alle strade (fuori dai siti): tanti nella metropoli, pochi in campagna, nessuno nella selvaggia; più fitti verso la costa
 const rds=m.roads.filter(r=>!r.site&&r.pts.length>=4),nS=Math.round(Math.pow(PROF.city,1.3)*330);let ns=0;
 if(rds.length)for(let t=0;ns<nS&&t<nS*12;t++){const rd=pick(rds),j=1+(R()*(rd.pts.length-2)|0),q=rd.pts[j],q2=rd.pts[j+1]||rd.pts[j-1],a=Math.atan2(q2[1]-q[1],q2[0]-q[0]),
   cf=clamp(1-(coastV(seaV(q[0],q[1]))-seaU(q[0],q[1]))/1600,0,1);if(R()>.35+.65*cf)continue;   // vicino alla costa si accetta quasi sempre
  const sd=R()<.5?1:-1,w=rr(BLD_MIN+16,170),h=rr(BLD_MIN+10,Math.min(150,w)),d=rd.w/2+h/2+rr(16,44),x=q[0]-Math.sin(a)*d*sd,y=q[1]+Math.cos(a)*d*sd,ci=K.cell(x,y);
  if(m.own[ci]||m.WN[ci]||wetCell(x,y)||K.dS(x,y)<500)continue;
  const pal=cf>.4||PROF.city>=.45?PAL_CITY:PAL_RES;if(K.fitB(x,y,w,h,a,a,pick(BTOWN),'house',[pick(pal)],null)){K.stampC(x,y,Math.max(w,h)*.6,null,null,-1);ns++}}}   // solo lotti dove sta una formazione

// ===== FASE 6: dettagli sul terreno libero =====
function genDetail(K){const{m,R,rr,ri,PROF}=K,dec=PROF.dec,land=()=>fromUV(rr(250,SEA-250),rr(250,WH-250)),freeLand=p=>!wetCell(p[0],p[1])&&!m.own[K.cell(p[0],p[1])]&&K.dS(p[0],p[1])>450;
 // isole: una o due case con giardino (collegate o no da un ponte)
 if(dec>0)for(const s of m.isles){const big=s.R>=150,n=big?1+(R()*2|0):1;
  for(let k=0;k<n;k++)for(let tr=0;tr<8;tr++){const mx=Math.max(130,s.R*.95),o=k?(k%2?1:-1)*s.R*.5:-s.R*.2,t=s.dir==null?(s.q||0):s.dir+3.1416;if(K.addB(s.x+Math.cos(t)*o,s.y+Math.sin(t)*o,rr(120,mx),rr(120,mx),R()*Math.PI,null,false,true,'house',null,4))break}}
 // isole: alberi (a ciuffi) e rocce, come sulla terraferma (dopo le case: si mettono solo dove c'è posto)
 for(const s of m.isles){const nT=Math.round(s.R*s.R/1700),nR=ri(2,5)+Math.round(s.R/80),pt=k=>{const t=R()*TAU,d=Math.sqrt(R())*rad(s,s.x+Math.cos(t),s.y+Math.sin(t))*k;return[s.x+Math.cos(t)*d,s.y+Math.sin(t)*d]};
  for(let i=0;i<nT;i++){const p=pt(.8);K.tree(p[0],p[1],R()<.15?rr(26,36):rr(14,24))}
  for(let i=0;i<nR;i++){const p=pt(.85);K.rock(p[0],p[1],R()<.2?rr(40,70):rr(16,38))}}
 // ruderi (muri a L o a C) e container abbandonati
 for(let i=0,n=Math.round(26*dec);i<n;i++){const p=land();if(!freeLand(p)||onRoad(p[0],p[1],40))continue;const len=rr(180,420),a=R()*TAU,th=rr(14,22),bx=p[0]+Math.cos(a)*len/2,by=p[1]+Math.sin(a)*len/2;
  K.wallLine(p[0]-Math.cos(a)*len/2,p[1]-Math.sin(a)*len/2,bx,by,th,null);if(R()<.45){const l2=rr(120,280),a2=a+1.5708*(R()<.5?1:-1);K.wallLine(bx,by,bx+Math.cos(a2)*l2,by+Math.sin(a2)*l2,th,null)}}
 for(let i=0,n=Math.round(30*dec);i<n;i++){const p=land();if(!freeLand(p)||onRoad(p[0],p[1],50))continue;K.addX(p[0],p[1],56*ri(1,3),24*ri(1,2),R()*TAU,'cont',0,{gap:6})}
 // viali alberati lungo le strade (dentro i siti: sui marciapiedi)
 for(const rd of m.roads)if(rd.w>=30&&rd.ty!=1&&R()<(rd.main?.5:.8))for(let i=2;i<rd.pts.length-2;i+=2){const q=rd.pts[i],q2=rd.pts[i+1],a=Math.atan2(q2[1]-q[1],q2[0]-q[0])+1.5708;
  for(const sd of[-1,1]){const r=rd.main?rr(18,26):rr(16,22),o=rd.w/2+r+(rd.main?22:6);K.tree(q[0]+Math.cos(a)*o*sd,q[1]+Math.sin(a)*o*sd,r,rd.main?0:1)}}
 for(const f of m.flat)if(f.k=='field'&&f.hedge){const c=Math.cos(f.a),s=Math.sin(f.a);for(let u=-f.w/2;u<=f.w/2;u+=60)K.tree(f.x+c*u-s*(f.h/2+16),f.y+s*u+c*(f.h/2+16),rr(16,24))}
 // gruppetti di scogli e alberi qua e là sulle rive: costa del mare, laghi e fiumi (mai dentro siti, mini-siti o sulle strade)
 const shoreOK=(x,y)=>K.inMap(x,y,60)&&!m.own[K.cell(x,y)]&&!onRoad(x,y,40)&&K.dS(x,y)>400&&!m.ports.some(q=>Math.hypot(x-q.x,y-q.y)<q.r+150);
 const clump=(x,y,nx,ny,inR)=>{   // (nx,ny) = verso la terra; scogli a cavallo della riva, alberi un po' più in là
  if(!shoreOK(x,y))return;const nR=ri(2,6),nT=R()<.75?ri(2,6):0;
  for(let i=0;i<nR;i++){const t=R()*TAU,d=Math.sqrt(R())*inR;K.rock(x+Math.cos(t)*d-nx*rr(0,30),y+Math.sin(t)*d-ny*rr(0,30),R()<.25?rr(26,46):rr(10,24),true)}
  for(let i=0;i<nT;i++){const t=R()*TAU,d=Math.sqrt(R())*inR*.9,o=rr(45,110),px=x+nx*o+Math.cos(t)*d,py=y+ny*o+Math.sin(t)*d;if(shoreOK(px,py)&&!wetCell(px,py))K.tree(px,py,rr(13,24))}};
 for(let v=rr(100,400);v<WH-100;v+=rr(260,700))if(R()<.55){const p=fromUV(coastV(v)+rr(-10,15),v);   // costa del mare
  clump(p[0],p[1],-Math.cos(SIDE*Math.PI/2),-Math.sin(SIDE*Math.PI/2),rr(50,95))}
 for(const l of m.lakes)for(let k=0,n=ri(1,3);k<n;k++){const t=R()*TAU,c=Math.cos(t),sn=Math.sin(t),r=rad(l,l.x+c,l.y+sn);clump(l.x+c*r,l.y+sn*r,c,sn,rr(40,80))}   // laghi
 for(const rv of m.rivers){const P=rv.pts;for(let i=6;i<P.length-6;i+=ri(14,34))if(R()<.5){const a=P[i-1],b=P[i+1],L=Math.hypot(b[0]-a[0],b[1]-a[1])||1,sd=R()<.5?1:-1,nx=-(b[1]-a[1])/L*sd,ny=(b[0]-a[0])/L*sd,o=rv.wp[i]/2+rr(0,12);   // fiumi: su una sponda
  clump(P[i][0]+nx*o,P[i][1]+ny*o,nx,ny,rr(35,65))}}
 // rive dei laghi: alberi e massi
 for(const l of m.lakes){const mr=Math.min(...l.a);for(let i=0,n=ri(8,16);i<n;i++){const t=R()*TAU,d=mr*rr(.9,1.25)+rr(30,70),p=[l.x+Math.cos(t)*d,l.y+Math.sin(t)*d];if(!m.own[K.cell(p[0],p[1])])K.tree(p[0],p[1],rr(18,38))}
  for(let i=0,n=ri(3,7);i<n;i++){const t=R()*TAU,d=mr*rr(.95,1.35)+rr(20,50),p=[l.x+Math.cos(t)*d,l.y+Math.sin(t)*d];if(!m.own[K.cell(p[0],p[1])])K.rock(p[0],p[1],K.rockSz()*.6)}}
 if(dec>0)mapSea(K)}
// vita sul mare e sui laghi: navi, una portaerei, piattaforme (tutto in coordinate u,v: funziona con il mare su ogni lato)
function mapSea(K){const{m,R,rr,ri}=K,A=SIDE*Math.PI/2,sea=(v,L)=>{const u0=coastV(v)+L/2+30,u1=WW-L/2-30;return u0>u1?null:fromUV(rr(u0,Math.min(u1,u0+600)),v)};
 for(let i=0,n=0;i<400&&n<6;i++){const L=rr(280,400),p=sea(rr(300,WH-300),L);if(p&&K.addX(p[0],p[1],L,rr(66,92),A+rr(-.35,.35),'ship',3,{gap:90,o:{v:ri(0,2)}}))n++}
 // portaerei: tutto il rettangolo ruotato deve stare in acqua libera e nessun ostacolo entro 30 px dai bordi
 const clear=(xc,yc,L,B,ang)=>{const ca=Math.cos(ang),sa=Math.sin(ang),hw=L/2,hh=B/2;
  for(let u=-hw;u<=hw;u+=Math.max(18,L/14))for(let v=-hh;v<=hh;v+=Math.max(18,B/6)){const wx=xc+u*ca-v*sa,wy=yc+u*sa+v*ca;if(!K.inMap(wx,wy,30)||!inWater(wx,wy,0))return false}
  for(const o of qobs(xc,yc,Math.max(L,B)/2+100,[])){if(o.t=='t'||o.dead)continue;
   for(let u=-hw;u<=hw;u+=20)for(let v=-hh;v<=hh;v+=20){const wx=xc+u*ca-v*sa,wy=yc+u*sa+v*ca,l=toLocal(o,wx,wy);if(bsd(o,l[0],l[1])<30)return false}}
  return true};
 for(let i=0;i<900;i++){const L=i<600?rr(520,620):560,B=i<600?rr(140,170):150,ang=A-Math.PI/2+rr(-.78,.78),v=rr(450,WH-450),p=fromUV(rr(coastV(v)+B,WW-B/2-60),v);
  if(clear(p[0],p[1],L,B,ang)&&K.addX(p[0],p[1],L,B,ang,'carrier',3,{gap:60,force:true,o:{v:ri(0,2)}}))break}
 for(let i=0,n=0;i<400&&n<2;i++){const s2=rr(95,125),p=sea(rr(300,WH-300),s2);if(p&&K.addX(p[0],p[1],s2,s2*rr(.8,1),A,'plat',3,{gap:80}))n++}
 for(const l of m.lakes){const mr=Math.min(...l.a);if(mr<190)continue;
  if(R()<.7)for(let t=0;t<8;t++){const a=R()*TAU,d=R()*mr*.4,s2=rr(55,75);if(K.addX(l.x+Math.cos(a)*d,l.y+Math.sin(a)*d,s2,s2*.8,0,'plat',3,{gap:60}))break}
  for(let k=0,nb=ri(1,3);k<nb;k++)for(let t=0;t<8;t++){const a=R()*TAU,d=R()*mr*.55;if(K.addX(l.x+Math.cos(a)*d,l.y+Math.sin(a)*d,rr(120,170),rr(34,46),R()*TAU,'ship',3,{gap:40,o:{v:2}}))break}}}

// ===== FASE 7: rifiniture =====
// ogni piazzale contiene per intero i propri edifici, con un margine: quelli creati insieme a lui (f.own, un gruppo) oppure, per i piazzali "contenitore"
// (isolati di città, siti, aree minori, mini-siti: f.dt/f.big/f.box), quelli col centro dentro. Il piazzale si allarga dal lato che serve e resta centrato su ciò che contiene.
function fitSlabs(K){const{m}=K,MG=18;
 for(const f of m.flat){if(f.k!='slab'||f.t==5){delete f.own;continue}const ca=Math.cos(f.a||0),sa=Math.sin(f.a||0),
   inS=o=>{const dx=o.x-f.x,dy=o.y-f.y;return Math.abs(dx*ca+dy*sa)<f.w/2&&Math.abs(-dx*sa+dy*ca)<f.h/2},
   L=f.own?f.own.filter(o=>!o.dead):f.dt||f.big||f.box?qobs(f.x,f.y,Math.hypot(f.w,f.h)/2,[]).filter(o=>o.t=='b'&&o.ty!='rock'&&o.ty!='wall'&&inS(o)):null;
  delete f.own;if(!L||!L.length)continue;let a=-f.w/2,b=-f.h/2,c=f.w/2,d=f.h/2;
  for(const o of L){const bb=K.footBox(o);for(const[u,v]of[[bb[0],bb[1]],[bb[2],bb[1]],[bb[2],bb[3]],[bb[0],bb[3]]]){const wx=o.x+u*o.c-v*o.s-f.x,wy=o.y+u*o.s+v*o.c-f.y,lu=wx*ca+wy*sa,lv=-wx*sa+wy*ca;
   a=Math.min(a,lu-MG);b=Math.min(b,lv-MG);c=Math.max(c,lu+MG);d=Math.max(d,lv+MG)}}
  const cu=(a+c)/2,cv=(b+d)/2;f.x+=cu*ca-cv*sa;f.y+=cu*sa+cv*ca;f.w=c-a;f.h=d-b}}
function finishMap(K){const{m,rr}=K;
 // rampe dove una strada cambia quota, cascate dove un fiume scende
 for(const rd of m.roads){if(rd.pts.length<8)continue;let pl=levelAt(rd.pts[0][0],rd.pts[0][1]);
  for(let i=1;i<rd.pts.length;i++){const q=rd.pts[i],l=levelAt(q[0],q[1]);if(l===pl)continue;const p0=rd.pts[i-1],a=Math.atan2(q[1]-p0[1],q[0]-p0[0]),up=l>pl;
   if(!m.ramps.some(r=>Math.hypot(r.x-q[0],r.y-q[1])<160))m.ramps.push({x:(q[0]+p0[0])/2,y:(q[1]+p0[1])/2,a:up?a:a+Math.PI,w:rd.w,d:Math.abs(l-pl)});pl=l}}
 for(const rv of m.rivers){let pl=levelAt(rv.pts[0][0],rv.pts[0][1]);
  for(let i=1;i<rv.pts.length;i++){const q=rv.pts[i],l=levelAt(q[0],q[1]);if(l===pl)continue;const p0=rv.pts[i-1];
   // una cascata a OGNI salto di quota (anche dove il tracciato risale: l'acqua cade comunque verso il livello più basso)
   const x=(q[0]+p0[0])/2,y=(q[1]+p0[1])/2,dn=l<pl,a=Math.atan2(q[1]-p0[1],q[0]-p0[0])+(dn?0:Math.PI);
   const fw=(rv.wp[i]+rv.wp[i-1])/2;   // larghezza del fiume nel punto della cascata
   if(!m.falls.some(f=>Math.hypot(f.x-x,f.y-y)<fw*.8+20))m.falls.push({x,y,a,w:fw,d:Math.abs(pl-l)});pl=l}}
 K.clearNat(START[0],START[1],230);K.clearNat(EXT[0],EXT[1],120);for(const k of m.keep||[])K.clearNat(k.x,k.y,k.r);                                      // la partenza resta sgombra
 m.obs=m.obs.filter(o=>!o.dead);m.obs.forEach((o,i)=>{o.id=i;if(o.m==null)o.m=o.hp});m.blds=m.blds.filter(o=>!o.dead);
 gClear();m.obs.forEach(gAdd);fitSlabs(K);
 for(let t=0;t<4000&&m.dm.length<24;t++){const p=fromUV(rr(300,SEA-300),rr(300,WH-300));if(clearAt(p[0],p[1],34)&&!inWater(p[0],p[1],60)&&m.dm.every(q=>Math.hypot(q[0]-p[0],q[1]-p[1])>(t<2500?600:300)))m.dm.push(p)}
 if(!m.dm.length)m.dm.push(START.slice());
 for(const rd of m.roads)rd.path=null;
 navBuild()}
