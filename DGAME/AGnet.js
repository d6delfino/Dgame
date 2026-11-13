'use strict';
/* AIRGRUNT · AGnet.js — multiplayer: host autorevole nel browser via PeerJS, un canale affidabile con messaggi {t:tipo,...}.
   REGOLA: la grafica è SEMPRE locale. In rete passano solo i dati che servono a tenere tutti sincronizzati:
   - la mappa NON viaggia: ogni client la rigenera dal seed (e dai parametri della partita);
   - snapshot a 15/s: giocatori (pochi numeri) + solo le unità nemiche CAMBIATE dall'ultimo invio (delta), più uno snapshot completo ogni 1,5 s e per chi entra;
   - colpi: una sola riga [arma, x, y, angolo, durata, tiratore, ...] per proiettile; ogni client lo anima da sé (proiettili, fiamme, esplosioni, particelle e suoni sono locali);
   - ostacoli: solo [id, vita] di quelli colpiti; missione e punteggi: pochi numeri nello snapshot.
   Chi entra a partita in corso riceve seed + parametri + ostacoli danneggiati + uno snapshot completo, e da lì è sincronizzato. */
const Handlers={};
NET.sq=[];NET.cq=[];NET.rm=[];NET.cv=[];NET.a1=0;NET.a2=0;NET.a3=0;NET.fk=0;
const NET_HOST_TIMEOUT=8000;   // 8 s senza segnali dall'host → il client torna al menu principale
//const NET_LOAD_GRACE=99000;    // tolleranza (ms) durante generazione mappa / riavvio: nessun controllo "zombie" né "host perso"
// Disconnessione pulita: distrugge il Peer, pulisce gli altri player, torna in lobby con un avviso.
// Sicura da chiamare più volte: non fa nulla se non siamo client connessi.
function hostLost(){
 if(!NET.on||NET.host)return;
 NET.on=false;NET.host=false;NET.lastHost=0;G.started=false;G.baking=0;
 try{if(NET.peer)NET.peer.destroy()}catch(_){}
 NET.peer=null;NET.hostConn=null;
 for(const k in others)delete others[k];
 if(typeof showLobby==='function')showLobby('Connessione con l’host persa');
}
const send=(c,m)=>{try{if(c&&c.open)c.send(m)}catch(e){}};
const bcast=(m,ex)=>{for(const id in NET.conns){const c=NET.conns[id];if(c!==ex)send(c,m)}};
const onMsg=(m,c)=>{if(!m||!Handlers[m.t])return;
 if(!NET.host)NET.lastHost=performance.now();   // heartbeat: qualunque messaggio dall'host rinnova il timer
 try{Handlers[m.t](m,c)}catch(e){console.error('Rete: errore in',m.t,e);
  if(m.t=='hello')send(c,{t:'err',e:'errore dell’host'});else if(m.t=='welcome'){NET.on=false;G.started=false;showLobby('Errore: '+e.message)}}
 if(!NET.host&&NET.on&&m.t!='ld')NET.lastHost=performance.now()};   // dopo handler lunghi (welcome/init = generazione mappa) il timer riparte da qui; 'ld' imposta una tolleranza sua
const q1=v=>Math.round(v*10)/10,q2=v=>Math.round(v*100)/100;
const bPack=b=>[b.w,Math.round(b.x),Math.round(b.y),Math.round(Math.atan2(b.vy,b.vx)*1000)/1000,Math.round(b.life*1000)/1000,b.o,b.fly,b.tz,b.sm,b.pierce||0,b.dmg,b.ex,b.fuse||0];
function newPlayer(id,ci,name){const[x,y]=spawnAt(id);
 return{id,pl:1,ci,name:String(name||'Pilota').slice(0,12),x,y,tx:x,ty:y,vx:0,vy:0,h:0,mh:0,fa:0,air:false,z:0,w:0,hp:100,hpMax:100,fl:0,drG:0,drA:0,rgA:false,rgG:1,kills:0}}
const applyObs=(id,hp)=>{const o=M&&M.obs[id];if(!o||o.dead)return;o.hp=hp;if(hp<=0){o.dead=1;wreckFx(o)}};

// ===== host: snapshot =====
function sendSnap(){
 // Pulisce i player "zombie": la cui connessione PeerJS è chiusa (!c.open)
 // o che non inviano 'st' da più di 8 secondi (rete caduta senza close: succede spesso).
 // Senza questa pulizia un client disconnesso resterebbe in others per decine di secondi,
 // verrebbe incluso in ogni snapshot, contato da plist() e bloccherebbe extractTick.
 const now=performance.now();
 for(const id in others){
  const q=others[id],c=NET.conns[id];
  const stale=(q.lastMsg&&now-q.lastMsg>8000&&now>(q.ld||0));   // q.ld = fine tolleranza di caricamento: finché è nel futuro non è mai zombie
  if(!c||!c.open||stale){
   delete others[id];delete NET.conns[id];
   try{if(c)c.close()}catch(_){}
  }
 }
 const full=NET.fk<=0;if(full)NET.fk=1.5;
 const msg={t:'snap',n:++NET.n,f:full?1:0,p:[P,...Object.values(others)].map(q=>[q.id,Math.round(q.x),Math.round(q.y),Math.round(q.vx),Math.round(q.vy),q2(q.h),q2(q.mh),q.air?1:0,q2(q.fa),q.w,Math.ceil(q.hp),q.ci,q.name,q.shs?q.shs.map(t=>Math.round(t*10)/10):0,q.rv?Math.round(q.rv*100)/100:0,q.kills|0,
   q.revive?q.revive.map(t=>Math.round(t*10)/10):0,
   q.turs?q.turs.map(t=>Math.round(t*10)/10):0,
   q.grns?q.grns.map(t=>Math.round(t*10)/10):0,
   q.smks?q.smks.map(t=>Math.round(t*10)/10):0,
   q.nuks?q.nuks.map(t=>Math.round(t*10)/10):0]),ac:G.aiCi,ct:q2(CIV.t),e:[],x:NET.rm,ms:G.mode==1?0:msPack()};
 NET.rm=[];
 for(const u of units){const f=(u.st==1?1:0)|(u.dis>0?2:0)|(u.k>=UK_HUM&&u.st==2?4:0)|(u.sec?8:0),x=Math.round(u.x),y=Math.round(u.y),h=q2(u.h),hp=Math.ceil(u.hp);
  const thr=u.k===5?q2(u.thr!=null?u.thr:u.h):null;   // rotazione torretta (solo tank)
  if(full){msg.e.push([u.id,u.k,x,y,h,hp,u.mhp,u.ar||0,f,u.name||0,thr!=null?thr:h]);if(u.k===5)u.sthr=thr}
  else if(u.sx!==x||u.sy!==y||u.sh!==h||u.shp!==hp||u.sf!==f||(u.k===5&&u.sthr!==thr)){
   const d=[u.id,x,y,h,hp,f];
   if(u.k===5){d.push(thr);u.sthr=thr}
   msg.e.push(d)}
  u.sx=x;u.sy=y;u.sh=h;u.shp=hp;u.sf=f}
 if(G.mode==1)msg.dm=dmPack();
 bcast(msg);return msg}
function netTick(dt){
 if(!NET.on)return;
 const tn=performance.now();
 if(NET.tk&&tn-NET.tk>2000){   // questo dispositivo era fermo (background, blocco lungo): il silenzio altrui non conta
  if(NET.host){for(const id in others)others[id].lastMsg=tn}
  else if(NET.lastHost)NET.lastHost=tn}
 NET.tk=tn;
 NET.fk-=dt;
 if(NET.host){NET.a1+=dt;if(NET.a1>=1/15){NET.a1=0;sendSnap()}
  if(NET.sq.length){bcast({t:'b',l:NET.sq.map(bPack)});NET.sq.length=0}
  if(NET.cv.length){bcast({t:'cv',l:NET.cv});NET.cv=[]}      // civili uccisi: [id, x, y]
  NET.a3+=dt;if(dirtyObs.size&&NET.a3>=.1){NET.a3=0;bcast({t:'o',l:[...dirtyObs].map(i=>[i,Math.max(0,Math.ceil(M.obs[i].hp))])});dirtyObs.clear()}}
 else{
  // Rilevamento caduta host: nessun messaggio ricevuto per NET_HOST_TIMEOUT ms → back al menu con avviso.
  // (copre anche i casi in cui il browser dell'host viene killato e PeerJS non emette 'close')
  if(NET.lastHost && performance.now()-NET.lastHost>NET_HOST_TIMEOUT){hostLost();return}
  NET.a2+=dt;if(NET.a2>=.05){NET.a2=0;send(NET.hostConn,{t:'st',x:P.x,y:P.y,vx:P.vx,vy:P.vy,h:P.h,mh:P.mh,air:P.air?1:0,fa:P.fa,w:P.w})}
  if(NET.cq.length){send(NET.hostConn,{t:'fire',l:NET.cq.map(bPack)});NET.cq.length=0}}}

// ===== connessione =====
function hostGame(cb){
 const code=Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random()*32|0]).join('');
 // Distruggi l'eventuale Peer precedente per liberare le connessioni WebRTC residue
 if(NET.peer){try{NET.peer.destroy()}catch(_){}NET.peer=null}
 const pe=new Peer(PEER_PREFIX+code,PEER_OPTS);NET.peer=pe;
 pe.on('open',()=>{NET.on=true;NET.host=true;NET.id=0;NET.code=code;cb(null)});
 pe.on('error',e=>{if(e.type=='unavailable-id')hostGame(cb);else cb(e.type)});
 pe.on('connection',c=>{c.on('data',m=>onMsg(m,c));c.on('close',()=>{if(c.pid!=null){delete others[c.pid];delete NET.conns[c.pid]}})})}
function joinGame(code,cb,st){   // st(testo): aggiorna lo stato mostrato nella lobby
 st=st||(()=>{});let dead=false,ok=false,tm=0;
 const fail=e=>{if(dead||ok)return;dead=true;clearTimeout(tm);NET.on=false;try{pe.destroy()}catch(_){}cb(e)};
 const wait=(ms,e)=>{clearTimeout(tm);tm=setTimeout(()=>fail(e),ms)};
 // Distruggi l'eventuale Peer precedente (da un tentativo fallito o da una connessione caduta):
 // altrimenti la vecchia connessione WebRTC resta "appesa" e l'host non riceve mai il close.
 if(NET.peer){try{NET.peer.destroy()}catch(_){}NET.peer=null}
 const pe=new Peer(PEER_OPTS);NET.peer=pe;
 st('Contatto il server…');wait(12000,'server di collegamento non raggiungibile');
 pe.on('open',()=>{st('Cerco la partita…');wait(25000,'impossibile collegarsi all’host (rete o firewall)');
  const c=pe.connect(PEER_PREFIX+code.toUpperCase(),{reliable:true});NET.hostConn=c;
  c.on('open',()=>{NET.on=true;NET.host=false;NET.lastHost=performance.now();send(c,{t:'hello',v:PROTO,ci:P.ci,name:P.name,dr:[P.drG,P.drA],rg:[P.rgA?1:0,P.rgG],dm:P.dmx,sh:P.shn,ml:P.mlm,rv:P.rvn,prc:P.prc,rad:P.radar,tur:P.turn,grn:P.grn,smk:P.smk,nuk:P.nuk});st('Connesso, aspetto l’host…');wait(15000,'l’host non risponde');cb(null)});
  c.on('data',m=>{if(m&&m.t=='welcome')ok=true;if(m&&m.t=='err')dead=true;if(m&&(m.t=='welcome'||m.t=='err'))clearTimeout(tm);onMsg(m,c)});
  c.on('close',()=>{if(ok){hostLost()}else fail('connessione chiusa dall’host')});
  c.on('error',()=>fail('connessione'))});
 pe.on('error',e=>fail(e.type))}

// ===== gestori lato host =====
Handlers.hello=(m,c)=>{if(m.v!==PROTO){send(c,{t:'err',e:'versione diversa'});return}
  // Prevenzione: se una vecchia connessione dello stesso client non è stata chiusa, rimuovila
  // prima di creare il nuovo player, così non restano duplicati in others.
  for(const id in others){const cc=NET.conns[id];if(!cc||!cc.open){delete others[id];delete NET.conns[id]}}
  const id=NET.nextId++,ci=COLS[m.ci]?m.ci:0;c.pid=id;NET.conns[id]=c;const q=others[id]=newPlayer(id,ci,m.name);
  q.lastMsg=performance.now();   // parte il timer di inattività: se non arriva 'st' entro 8s, il player è rimosso
  q.ld=performance.now()+NET_LOAD_GRACE;   // il client sta per generare la mappa (blocco lungo, nessun 'st'): tolleranza
  const dr=m.dr||[],rg=m.rg||[];q.drG=Math.max(0,+dr[0]||0);q.drA=Math.max(0,+dr[1]||0);q.rgA=!!rg[0];q.rgG=clamp(+rg[1]||1,1,5);q.dmx=clamp(+m.dm||0,0,120);q.shn=clamp(+m.sh||0,0,4);q.shs=Array(q.shn).fill(0);q.mlm=clamp(+m.ml||1,1,5);
q.rvn=clamp(+m.rv||0,0,4);q.revive=Array(q.rvn).fill(0);   // revive lato host: coerente col client
  if(G.mode==1)dmEnsure('p'+id,q.name);
  if(G.mode!=1 && ci===G.aiCi){const taken=new Set([P.ci,...Object.values(others).map(p=>p.ci)]);const avail=COLS.map((_,i)=>i).filter(i=>i!==1&&!taken.has(i));G.aiCi=avail.length?avail[Math.floor(Math.random()*avail.length)]:null}
  send(c,{t:'welcome',id,ci,seed:G.seed,mis:G.sel,diff:G.diff,mode:G.mode,prof:G.profile,ac:G.aiCi,wx:WX.rain?1:WX.snow?2:WX.sand?3:0,o:M.obs.filter(o=>o.hp<o.m&&!o.ind).map(o=>[o.id,Math.max(0,o.hp)]),over:G.over,om:G.overMsg,cv:civDeadPack(),camp:campPack()});
 NET.fk=0};                                                     // il prossimo snapshot sarà completo
Handlers.st=(m,c)=>{const q=others[c.pid];if(!q)return;
 q.lastMsg=performance.now();   // heartbeat: se smette di arrivare per >8s il player è considerato zombie
 q.tx=m.x;q.ty=m.y;q.vx=m.vx;q.vy=m.vy;q.h=m.h;q.mh=m.mh;if(q.air!==!!m.air)sfxAt(m.air?SFX_LIST.toAir:SFX_LIST.toGrunt,.55,q.x,q.y,80);q.air=!!m.air;q.z=m.air?1:0;q.fa=m.fa;q.w=m.w};
Handlers.fire=(m,c)=>{const q=others[c.pid];if(!q||q.hp<=0)return;
 for(const e of m.l){const W=WEAPONS[e[0]];if(!W||W.flame||e[0]>=W_NONE)continue;
  const b=mkBullet(e[0],e[1],e[2],e[3],Math.min(+e[4],W.range/W.speed),c.pid,e[6],e[7]);
  if(e[9])b.pierce=e[9];
  if(e[10]!=null)b.dmg=e[10];
  if(e[11]!=null)b.ex=e[11];
  b.dmg+=dmxB(q.dmx,W);addBullet(b,true);q.fl=.04;if(W.sfx)sfxAt(W.sfx,W.vol,e[1],e[2],40)}};   // il tiratore ignora il rimbalzo del proprio colpo (vedi Handlers.b)
Handlers.melee=(m,c)=>{const q=others[c.pid];if(!q||q.hp<=0)return;
 let x=+m.x,y=+m.y;if(!(Math.hypot(x-q.tx,y-q.ty)<200)){x=q.x;y=q.y}   // posizione reale del client, solo se plausibile
 const sc=+m.sc||1;
 slashes.push({id:c.pid,a:+m.a,t:0,life:.22,hit:new Set(),n:0,x,y,sc});sfxAt(SFX_LIST.melee,.8,q.x,q.y,100);bcast({t:'sl',id:c.pid,a:+m.a,sc},c)};
Handlers.fl=(m,c)=>{const W=WEAPONS[W_FLM];
 if(NET.host){const q=others[c.pid];if(!q||q.hp<=0)return;flameHit(+m.x,+m.y,+m.a,m.z?1:0,{...W,dmg:W.dmg+dmxB(q.dmx,W)},c.pid);flameFx(+m.x,+m.y,+m.a,W);sfxAt(W.sfx,W.vol,+m.x,+m.y,W.sg||0);bcast({t:'fl',id:c.pid,x:+m.x,y:+m.y,a:+m.a},c)}
 else if(m.id!==NET.id){flameFx(+m.x,+m.y,+m.a,W);sfxAt(W.sfx,W.vol,+m.x,+m.y,W.sg||0);flameHit(+m.x,+m.y,+m.a,0,W,null,true)}};   // dry: marca il burn locale per la fiamma di un altro client
// ===== gestori lato client =====
Handlers.welcome=m=>{NET.id=m.id;P.id=m.id;P.ci=m.ci;G.diff=m.diff;G.sel=m.mis;G.mode=m.mode;G.profile=(m.prof|0);G.aiCi=m.ac;campUnpack(m.camp);
 {const wx=m.wx|0;WX.rain=wx===1?1:0;WX.snow=wx===2?1:0;WX.sand=wx===3?1:0}   // ← meteo dall'host (0 sereno / 1 pioggia / 2 neve / 3 sabbia): DEVE essere prima di startGame
  // Il client ha ricevuto un nuovo id: eventuali player nel vecchio others sono "fantasmi" della
  // connessione precedente. Vanno rimossi PRIMA di startGame (che li resettarebbe a hp=100 invece
  // di eliminarli). Il primo snapshot (completo) ricostruirà gli altri player correttamente.
  for(const k in others)delete others[k];
  startGame(m.seed,true);for(const[id,hp]of m.o)applyObs(id,hp);for(const e of m.cv||[])civKill(e[0],null,2,e[1],e[2]);G.over=m.over||0;G.overMsg=m.om||'';G.started=true;hideLobby()};
Handlers.snap=m=>{if(m.n<=NET.lastN)return;NET.lastN=m.n;if(m.ac!==undefined)G.aiCi=m.ac;const ids=new Set();
 for(const e of m.p){ids.add(e[0]);if(e[0]==NET.id){P.hp=e[10];P.shs=e[13]||[];P.rv=e[14]||0;P.kills=e[15]|0;
   if(Array.isArray(e[16]))P.revive=e[16];           // accetta anche [] (host non sa ancora) MA se il client ha revive locale lo preserva finché l'host non manda un array coerente
   else if(!P.revive)P.revive=[];
   P.turs=e[17]||P.turs;P.grns=e[18]||P.grns;P.smks=e[19]||P.smks;P.nuks=e[20]||P.nuks;
   continue}
  const q=others[e[0]]||(others[e[0]]=newPlayer(e[0],e[11],e[12]));
  q.tx=e[1];q.ty=e[2];q.vx=e[3];q.vy=e[4];q.h=e[5];q.mh=e[6];if(q.air!==!!e[7])sfxAt(e[7]?SFX_LIST.toAir:SFX_LIST.toGrunt,.55,q.x,q.y,80);q.air=!!e[7];q.z=e[7]?1:0;q.fa=e[8];q.w=e[9];q.hp=e[10];q.ci=e[11];q.name=e[12];q.shs=e[13]||[];q.rv=e[14]||0;q.kills=e[15]|0;
  q.revive=e[16]||[];q.turs=e[17]||[];q.grns=e[18]||[];q.smks=e[19]||[];q.nuks=e[20]||[]}
 for(const id in others)if(!ids.has(+id))delete others[id];
 for(const id of m.x){const i=units.findIndex(u=>u.id===id);if(i>=0){blastFx(units[i]);units.splice(i,1)}}
 if(m.f){const keep=new Set();
  for(const e of m.e){keep.add(e[0]);let u=units.find(z=>z.id===e[0]);if(!u){
    u={id:e[0],k:e[1],x:e[2],y:e[3],h:e[4],fl:0};
    if(u.k==5)u.tv=hs(u.id,7,M.seed)<.5?0:1;   // stessa formula dell'host: variante identica
    units.push(u)}
   u.k=e[1];u.tx=e[2];u.ty=e[3];u.th=e[4];u.hp=e[5];u.mhp=e[6];u.ar=e[7];u.st=e[8]&1?1:0;u.dis=e[8]&2?1:0;u.wp=e[8]&4?1:0;u.sec=e[8]&8?1:0;u.z=UT[e[1]].fly?1:0;if(e[9])u.name=e[9];
   if(u.k===5)u.thrT=(e.length>10)?e[10]:e[4]}   // target torretta (fallback: h)
  units=units.filter(u=>keep.has(u.id))}
 else for(const e of m.e){const u=units.find(z=>z.id===e[0]);if(u){u.tx=e[1];u.ty=e[2];u.th=e[3];u.hp=e[4];u.st=e[5]&1?1:0;u.dis=e[5]&2?1:0;u.wp=e[5]&4?1:0;
  if(u.k===5&&e.length>6)u.thrT=e[6]}}
 if(m.ct!=null)civSync(m.ct);if(m.ms)msUnpack(m.ms);if(m.dm)dmUnpack(m.dm)};
Handlers.o=m=>{for(const[id,hp]of m.l)applyObs(id,hp)};
Handlers.cv=m=>{if(NET.host)return;for(const e of m.l)civKill(e[0],null,1,e[1],e[2])};   // civili uccisi dall'host
Handlers.b=m=>{for(const e of m.l){if(e[5]===NET.id)continue;const b=mkBullet(e[0],e[1],e[2],e[3],e[4],e[5],e[6],e[7],e[8]);
  if(e[9])b.pierce=e[9];
  if(e[10]!=null)b.dmg=e[10];
  if(e[11]!=null)b.ex=e[11];
  if(e[12]){b.fuse=e[12];b.detect=0}     // esplosivo: sincronizza l'innesco a tempo
  bullets.push(b);
  const W=WEAPONS[e[0]],s=e[5]<1000?(e[5]===0?P0():others[e[5]]):units.find(u=>u.id===e[5]);if(s)s.fl=.04;sfxAt(e[5]<1000?W.sfx:e[0]==W_MG?SFX_LIST.enemy:W.sfx,e[5]<1000?W.vol:.35,e[1],e[2],40)}};
const P0=()=>NET.host?P:others[0];                               // il giocatore host ha id 0
Handlers.init=m=>{campUnpack(m.camp);G.diff=m.diff;G.sel=m.mis;G.mode=m.mode;G.profile=(m.prof|0);const wx=m.wx|0;WX.rain=wx===1?1:0;WX.snow=wx===2?1:0;WX.sand=wx===3?1:0;startGame(m.seed,true)};
Handlers.over=m=>{G.over=m.v;G.overMsg=m.m||'';if(m.c)campUnpack(m.c);rainLoopStop();windLoopStop()};
Handlers.say=m=>say(m.m);
Handlers.rs=m=>{P.x=m.x;P.y=m.y;P.vx=P.vy=0};
Handlers.sl=m=>{if(m.id===NET.id)return;slashes.push({id:m.id,a:m.a,t:0,life:.22,sc:m.sc||1});const q=m.id===0?P0():others[m.id];if(q)sfxAt(SFX_LIST.melee,.8,q.x,q.y,100)};
Handlers.err=m=>showLobby('Errore: '+m.e);
Handlers.ld=()=>{if(!NET.host)NET.lastHost=performance.now()+NET_LOAD_GRACE};   // l'host sta generando la mappa: non è "perso"

// Ricezione del cambio configurazione in corsa
Handlers.ldt = (m, c) => {
 // Identifica chi ha mandato il messaggio
 const pid = NET.host ? c.pid : m.id;
 const q = NET.host ? others[pid] : (m.id === 0 ? (NET.host ? P : others[0]) : others[m.id]);
 if (!q) return;

 // Applica le nuove statistiche e il colore
 if (COLS[m.ci]) q.ci = m.ci;
 const dr = m.dr || [], rg = m.rg || [];
 q.drG = Math.max(0, +dr[0] || 0);
 q.drA = Math.max(0, +dr[1] || 0);
 q.rgA = !!rg[0];
 q.rgG = clamp(+rg[1] || 1, 1, 5);
 q.dmx = clamp(+m.dm || 0, 0, 120);
 q.shn = clamp(+m.sh || 0, 0, 4);
 q.mlm = clamp(+m.ml || 1, 1, 5);
 q.rvn = clamp(+m.rv || 0, 0, 4);
 q.prc = clamp(+m.prc || 0, 0, 5);
 q.radar = clamp(+m.rad || 0, 0, 10);
 q.turn = clamp(+m.tur || 0, 0, 4);
 q.grn = clamp(+m.grn || 0, 0, 4);
 q.smk = clamp(+m.smk || 0, 0, 4);
 q.nuk = clamp(+m.nuk || 0, 0, 4);
 
 // Se aveva un numero di scudi diverso, ridimensiona l'array mantenendo le ricariche in corso
 if (!q.shs || q.shs.length !== q.shn) { const o = q.shs || []; q.shs = Array.from({ length: q.shn }, (_, i) => o[i] || 0); }
 // Stessa cosa per le nuove abilità
 const grow=(old,n)=>Array.from({length:n|0},(_,i)=>(old||[])[i]||0);
 if (!q.revive || q.revive.length !== q.rvn) q.revive = grow(q.revive, q.rvn);
 if (!q.turs   || q.turs.length   !== q.turn) q.turs   = grow(q.turs,   q.turn);
 if (!q.grns   || q.grns.length   !== q.grn) q.grns   = grow(q.grns,   q.grn);
 if (!q.smks   || q.smks.length   !== q.smk) q.smks   = grow(q.smks,   q.smk);
 if (!q.nuks   || q.nuks.length   !== q.nuk) q.nuks   = grow(q.nuks,   q.nuk);

 // Se l'host riceve questo messaggio da un client, lo rimbalza a tutti gli altri
 if (NET.host) {
  m.id = pid;
  bcast(m, c);
 }
};

// Torretta alleata del giocatore: host crea, bcast agli altri
Handlers.ptur=(m,c)=>{
 if(NET.host&&c.pid!=null){
  const q=others[c.pid];if(!q)return;
  spawnPlayerTurret(c.pid,m.x,m.y,m.a||0);
  bcast({t:'ptur',id:c.pid,x:m.x,y:m.y,a:m.a||0});
 } else if(m.id!=null&&m.id!==NET.id){
  spawnPlayerTurret(m.id,m.x,m.y,m.a||0);
 }
};
// Granata del giocatore: creiamo il "bullet" autoritativo lato host
Handlers.grn=(m,c)=>{
 if(NET.host&&c.pid!=null){
  const q=others[c.pid];if(!q)return;
  spawnGrenade(c.pid,q.x,q.y,m.x,m.y);
 }
};
// Fumogeno: host crea e bcast a tutti (incluso il mittente)
Handlers.smk=(m,c)=>{
 if(NET.host&&c.pid!=null){
  spawnSmoke(m.x,m.y);
  bcast({t:'smk',id:c.pid,x:m.x,y:m.y});
 } else if(m.id!=null){
  spawnSmoke(m.x,m.y);
 }
};
// Attacco nucleare: host crea e bcast a tutti (incluso il mittente)
Handlers.nuk=(m,c)=>{
 if(NET.host&&c.pid!=null){
  NUKES.push({x:m.x,y:m.y,t:0,owner:c.pid,flash:-1});
  bcast({t:'nuk',id:c.pid,x:m.x,y:m.y});
  sfxAt(SFX_LIST.toAir,.5,m.x,m.y,80);
 } else if(m.id!=null){
  NUKES.push({x:m.x,y:m.y,t:0,owner:m.id,flash:-1});
 }
};

// Battito leggero quando la pagina è in background (rAF fermo → niente 'st'): evita l'espulsione per inattività
setInterval(()=>{if(NET.on&&!NET.host&&document.hidden)send(NET.hostConn,{t:'pg'})},1000);
Handlers.pg=(m,c)=>{const q=others[c.pid];if(q)q.lastMsg=performance.now()};