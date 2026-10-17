/* ============================================================
   dnet.js — rete di DawnlorD con PeerJS (l'HOST è un browser)
   ============================================================
   Come funziona (stessa idea del gioco precedente):
     - chi crea la partita è l'HOST: il suo browser tiene lo stato vero e fa da arbitro.
       Esegue le regole di drules.js con applyAction() e decide se una mossa è legale.
     - gli altri sono CLIENT e si collegano solo all'host (PeerJS/WebRTC). Mandano azioni,
       ricevono lo stato aggiornato (snapshot). Non decidono niente.
     - il servizio gratuito di PeerJS serve solo a far "incontrare" i browser (codice stanza);
       poi i dati viaggiano direttamente tra i browser (o tramite un relay TURN se serve).
     - timer del turno, margine per chi si disconnette, battito (ping/pong), carte segrete
       e rientro con token: come nella versione con server Node, ma dentro il browser dell'host.
     - l'host salva la partita nel proprio browser a ogni mossa: se ricarica la pagina può
       riprenderla ("Riprendi partita") e i client si ricollegano da soli.

   Protocollo (stringhe JSON sul canale dati):
     client -> host  {type:'action', id, action} · {type:'pong'}
     host -> client  {type:'joined', room, seat, token, n} · {type:'lobby', room, n, taken, seat}
                     {type:'state', snap, t, by, log, events, ack, timer, connected}
                     {type:'presence', connected, timer} · {type:'rejected', ack, err}
                     {type:'error', err, code} · {type:'ping'}
   Le azioni sono quelle elencate in drules.js. Il token del posto arriva nei metadati della connessione.

   Questo file va caricato DOPO peerjs_min.js e PRIMA dello script principale della pagina.
   ============================================================ */

// ---------- configurazione ----------
// Facoltativo: server TURN (relay) per le reti che non riescono a collegarsi direttamente
// (tipico: telefoni con rete mobile). Incolla qui la lista "iceServers" che usavi nel gioco precedente.
// Se resta vuota si usano i server predefiniti di PeerJS.
const EXTRA_ICE_SERVERS = [
  { urls: 'turn:global.relay.metered.ca:80', username: '0a099e5d0bdc770566e1b8be', credential: '/7ZvcHP2v8O7nit7' },
  { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: '0a099e5d0bdc770566e1b8be', credential: '/7ZvcHP2v8O7nit7' },
  { urls: 'turn:global.relay.metered.ca:443', username: '0a099e5d0bdc770566e1b8be', credential: '/7ZvcHP2v8O7nit7' },
  { urls: 'turns:global.relay.metered.ca:443', username: '0a099e5d0bdc770566e1b8be', credential: '/7ZvcHP2v8O7nit7' }
];
const NETCFG = Object.assign({
  heartbeatMs:5000,        // ogni quanto l'host manda un ping
  lostMs:15000,            // senza notizie per tanto tempo = connessione persa
  iceCheckMs:4000,         // controllo dello stato della connessione WebRTC
  graceTurnMs:30000,       // attesa di 1 minuto prima che l'AI prenda il posto dell'assente
  reconnectDelayMs:3000,   // pausa tra un tentativo di rientro e il successivo (client)
  maxReconnect:10,         // tentativi di rientro prima di arrendersi
  connectTimeoutMs:15000,  // tempo massimo per il primo collegamento all'host
  idRetryMs:1500, idRetries:12,   // host che riprende una stanza: attesa che il servizio liberi il vecchio codice
  maxMsgChars:20000, rateMax:40,  // limiti sui messaggi dei client (rateMax = messaggi al secondo)
  turnSeconds:null         // null = durata del turno di drules.js
}, window.DLW_NET_CFG || {});
const ID_PREFIX = 'dlw-', CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const HOST_KEY = 'dlw-host', SESSION_KEY = 'dlw-session', RESUME_MAX_AGE_MS = 6*3600*1000;

// ---------- stato di rete ----------
let online = false, isHost = false, seat = -1, connected = [], awaiting = false, awaitId = 0, awaitTimer = 0, wantNet = false;
let peer = null, hostConn = null, session = null, linkOk = false, lastSeen = 0, watchdog = 0, reconnecting = false, attempts = 0, retryTimer = 0, connTimer = 0, joinedOnce = false;
let room = null;                                      // solo host: stanza (posti, token, connessioni, timer)
const $ = id => document.getElementById(id);
const isMine = () => !isBotTurn() && (!online || seat === step % NUM_PLAYERS);          // online: posso agire solo nel mio turno; nel turno di un bot nessun umano
const lobbyOpen = () => $('lobby').style.display==='block';

// ---------- utilità ----------
function rbytes(n){ const a = new Uint8Array(n); if(window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else for(let i=0;i<n;i++) a[i] = Math.floor(Math.random()*256); return a; }
const rndStr = (n,chars) => Array.from(rbytes(n),b=>chars[b%chars.length]).join('');
const genCode = () => rndStr(4,CODE_CHARS);
const newToken = () => Array.from(rbytes(12),b=>b.toString(16).padStart(2,'0')).join('');
function parseMsg(raw){ try{ const m = typeof raw==='string' ? JSON.parse(raw) : raw; return m && typeof m==='object' && typeof m.type==='string' ? m : null; }catch{ return null; } }
function connSend(c,o){ if(!c || !c.open) return false; try{ c.send(JSON.stringify(o)); return true; }catch{ return false; } }
function peerOpts(){
  const o = {debug:1};
  // CORREZIONE: Carica SEMPRE i server STUN e TURN per scavalcare firewall e NAT
  o.config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      ...EXTRA_ICE_SERVERS
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all'
  };
  return o;
}
const viewFor = (s,sd) => ({...s, players: s.players.map((p,i)=> i===sd ? p : {...p, cards:[], usedCards:{}})});   // le carte altrui restano segrete
function destroyPeer(){ if(peer){ const p = peer; peer = null; try{ p.destroy(); }catch{} } hostConn = null; }

// ---------- invio di una mossa (locale, host o client) ----------
function send(a){
  if(online){
    if((!isMine() && a.t!=='surrender') || (isHost && !(room && room.started))) return {ok:false};   // la resa è l'unica azione possibile anche fuori turno
    if(isHost) return hostLocalAction(a);
    if(awaiting || !hostConn) return {ok:false};
    awaiting = true; const id = ++awaitId;
    clearTimeout(awaitTimer); awaitTimer = setTimeout(()=>{ if(awaiting && awaitId===id) awaiting = false; },8000);   // risposta mai arrivata: si sblocca
    if(!connSend(hostConn,{type:'action', id, action:a})){ awaiting = false; return {ok:false}; }
    return {ok:true, pending:true};
  }
  if(isBotTurn()) return {ok:false};                  // tocca a un bot: l'umano non può muovere al suo posto
  const prevPhase = phase;                            // partita locale: stesso schermo
  const res = applyAction(a, step%NUM_PLAYERS);
  handleResult(a,res,prevPhase,true);
  return res;
}

// ================== HOST ==================
function newRoom(n,code){
  return {code, n, tokens:Array(n).fill(null), conns:Array(n).fill(null), dcTimes:Array(n).fill(null), started:false, turnMs:(NETCFG.turnSeconds ?? TURN_SECONDS)*1000,
          lastStep:null, fullDeadline:null, deadline:null, timer:null, dcAt:null, pausedAt:null, hbTimer:0, iceTimer:0, rlTimer:0, restoring:false, ready:false, lastActivity:Date.now()};
}
function becomeHost(){
  online = true; isHost = true; wantNet = true; seat = 0; connected = connectedArr();
  $('localCtl').style.display = 'none'; $('roomInfo').innerHTML = `Stanza <b>${room.code}</b> (sei l'host)`;
}
function hostCreate(n){
  clearHostSaved(); clearSession();
  const cp = coopLobbyPrep(n,+$('lobBots').value); n = cp.n; NUM_PLAYERS = n; NUM_BOTS = cp.bots; startNewGame();   // coop: n giocatori umani + 1 giocatore "Mostri"; war: come prima
  room = newRoom(n, genCode()); room.tokens[0] = newToken();            // il posto 0 è dell'host
  players.forEach((p,i)=>{ if(p.bot) room.tokens[i] = 'bot'; });         // i posti dei bot sono già occupati
  becomeHost(); lobbyMsg('Connessione al servizio di incontro…');
  hostOpenPeer(0);
}
function hostOpenPeer(attempt){
  let p;
  try{ p = new Peer(ID_PREFIX+room.code, peerOpts()); }catch(e){ lobbyMsg('PeerJS non disponibile: '+e.message); return; }
  peer = p;
  p.on('open', ()=>{
    if(peer!==p) return;
    lobbyMsg(''); hideNetMsg(); room.ready = true; room.restoring = false; $('roomInfo').innerHTML = `Stanza <b>${room.code}</b> (sei l'host)`;
    if(!room.started){ if(room.tokens.every(Boolean)) hostStart(); else showWait(room.code, room.tokens.map(Boolean), room.n); }   // solo bot oltre all'host: si parte subito
    hostStartTimers(); armTimer();
  });
  p.on('connection', c => { if(peer===p) hostOnConnection(c); });
  p.on('disconnected', ()=>{ if(peer===p && !p.destroyed){ try{ p.reconnect(); }catch{} } });   // perso il servizio di incontro: le connessioni già aperte continuano
  p.on('error', err => {
    if(peer!==p) return;
    const t = err && err.type;
    if(t==='unavailable-id'){
      try{ p.destroy(); }catch{}
      if(room.restoring && attempt<NETCFG.idRetries) setTimeout(()=>{ if(room && peer===p) hostOpenPeer(attempt+1); }, NETCFG.idRetryMs);   // il vecchio codice si libera dopo qualche secondo
      else if(!room.restoring && attempt<5){ room.code = genCode(); setTimeout(()=>{ if(room) hostOpenPeer(attempt+1); },50); }
      else { lobbyMsg('Impossibile registrare la stanza. Riprova.'); showLobby(); }
    } else if(t==='network' || t==='server-error' || t==='socket-error' || t==='socket-closed') showNetMsg('Servizio di incontro non raggiungibile… ('+t+')');
    else if(!room.ready) lobbyMsg(t==='browser-incompatible' ? 'Questo browser non supporta WebRTC: non può ospitare la partita.' : 'Errore di connessione ('+t+').');
  });
}
function hostStartTimers(){
  if(room.hbTimer) return;
  room.hbTimer = setInterval(hostHeartbeat, NETCFG.heartbeatMs);
  room.iceTimer = setInterval(hostIceCheck, NETCFG.iceCheckMs);
  room.rlTimer = setInterval(()=>{ room.conns.forEach(c=>{ if(c) c.budget = NETCFG.rateMax; }); }, 1000);
}
function hostHeartbeat(){
  room.conns.forEach((c,i)=>{ if(!c) return; if(Date.now()-c.lastSeen>NETCFG.lostMs) hostDrop(i,c); else connSend(c,{type:'ping'}); });
  // Se un giocatore umano è disconnesso da più di 60 secondi, subentra l'AI
  if(room && room.started && phase === 'play'){
    const now = Date.now();
    for(let i = 1; i < room.n; i++){
      if(!room.conns[i] && players[i] && !players[i].bot && room.dcTimes && room.dcTimes[i] && (now - room.dcTimes[i] >= 60000)){
        players[i].bot = true;
        players[i].tempBot = true;
        emitPresence();
        if(step % NUM_PLAYERS === i) armTimer();
      }
    }
  }
}
function hostIceCheck(){                              // connessione WebRTC "disconnected/failed" per due controlli di fila = caduta
  room.conns.forEach((c,i)=>{
    if(!c) return; const pc = c.peerConnection, st = pc && pc.iceConnectionState;
    if(st==='disconnected' || st==='failed' || st==='closed'){ if(++c.iceBad>=2) hostDrop(i,c); } else c.iceBad = 0;
  });
}
function hostOnConnection(c){
  if(!room){ try{ c.close(); }catch{} return; }
  const token = c.metadata && typeof c.metadata.token==='string' ? c.metadata.token.slice(0,64) : null;
  c.seatIdx = -1; c.lastSeen = Date.now(); c.budget = NETCFG.rateMax; c.iceBad = 0; c.seatTried = false;
  const go = () => { if(c.seatTried) return; c.seatTried = true; hostSeatIn(c,token); };
  c.on('open', go); c.on('data', raw => hostOnData(c,raw));
  c.on('close', () => hostDrop(c.seatIdx,c)); c.on('error', () => hostDrop(c.seatIdx,c));
  if(c.open) go();
}
function rejectConn(c,err,code){ connSend(c,{type:'error',err,code}); setTimeout(()=>{ try{ c.close(); }catch{} },100); }
function hostSeatIn(c,token){
  let s = token ? room.tokens.indexOf(token) : -1;

  if(s < 0){
    if(room.started){
      // Cerca un posto umano disconnesso (anche se attualmente pilotato dall'AI provvisoria)
      let openSeat = room.conns.findIndex((conn, i) => i > 0 && !conn && players[i] && (!players[i].bot || players[i].tempBot) && !players[i].surrendered);
      if(openSeat < 0){
        openSeat = room.conns.findIndex((conn, i) => i > 0 && !conn && players[i] && (!players[i].bot || players[i].tempBot));
      }
      if(openSeat < 0){
        return rejectConn(c, 'Partita in corso: tutti i posti sono attualmente occupati.', 'full');
      }
      s = openSeat;
      room.tokens[s] = newToken();
    } else {
      s = room.tokens.indexOf(null);
      if(s < 0) return rejectConn(c, 'Stanza piena.');
      room.tokens[s] = newToken();
    }
  }

  // Non permette di connettersi sui bot originali di inizio partita
  if(s===0 || (players[s] && players[s].bot && !players[s].tempBot)) return rejectConn(c,'Posto non valido.','bad-token');

  // Se il posto era pilotato provvisoriamente dall'AI, torna umano al 100%
  if(players[s] && players[s].tempBot){
    players[s].bot = false;
    delete players[s].tempBot;
  }
  if(room.dcTimes) room.dcTimes[s] = null;

  const old = room.conns[s];
  if(old && old!==c){ connSend(old,{type:'error',err:'Collegato da un altro dispositivo.',code:'replaced'}); old.seatIdx = -1; setTimeout(()=>{ try{ old.close(); }catch{} },50); }
  room.conns[s] = c; c.seatIdx = s; c.lastSeen = Date.now(); room.lastActivity = Date.now();
  connSend(c,{type:'joined', room:room.code, seat:s, token:room.tokens[s], n:room.n});

  if(!room.started && room.tokens.every(Boolean)){ hostStart(); return; }
  if(room.started){
    armTimer();
    connSend(c,{type:'state', snap:viewFor(snapshot(),s), connected:connectedArr(), timer:remaining(), t:'sync', by:-1, log:'', events:[]});
    emitPresence();
  } else emitLobby();
}
function hostStart(){                                 // stanza piena: si comincia
  room.started = true; const prev = phase;
  armTimer(); persistHost(); hideLobby(); hideNetMsg();
  connected = connectedArr();
  handleResult({t:'sync'}, {ok:true,log:'',events:[]}, prev, true);
  hostEmitState({t:'sync', by:-1, log:'', events:[]});
}
function hostOnData(c,raw){
  if(c.seatIdx<=0) return;                            // non ancora al proprio posto
  c.lastSeen = Date.now();
  if(typeof raw==='string' && raw.length>NETCFG.maxMsgChars){ hostDrop(c.seatIdx,c,true); return; }
  if(--c.budget<0){ hostDrop(c.seatIdx,c,true); return; }
  const m = parseMsg(raw); if(!m || m.type==='pong') return;
  if(m.type==='action') hostApplyRemote(c,m);
}
function hostDrop(s,c,kick){                          // connessione di un client caduta (o espulsa)
  if(!room || s<=0 || room.conns[s]!==c){ if(kick){ try{ c.close(); }catch{} } return; }
  room.conns[s] = null; c.seatIdx = -1; try{ c.close(); }catch{}
  if(!room.started) room.tokens[s] = null;            // prima dell'inizio chi esce libera il posto (qualcun altro può entrare)
  else if(room.dcTimes) room.dcTimes[s] = Date.now(); // registra l'orario di disconnessione
  room.lastActivity = Date.now();
  armTimer(); emitPresence(); if(!room.started) emitLobby();
}
function hostApplyRemote(c,m){                        // azione di un client: controllo, esecuzione, nuovo stato a tutti
  const a = m.action, id = Number.isInteger(m.id) ? m.id : undefined;
  if(!room.started){ connSend(c,{type:'rejected',ack:id,err:'Mancano ancora dei giocatori.'}); return; }
  if(!a || typeof a!=='object' || Array.isArray(a)){ connSend(c,{type:'rejected',ack:id,err:'Azione non valida.'}); return; }
  const prev = phase, res = applyAction(JSON.parse(JSON.stringify(a)), c.seatIdx);
  if(!res.ok){ connSend(c,{type:'rejected',ack:id,err:res.err}); return; }
  hostAfter(a, c.seatIdx, res, id, prev, false);
}
function hostLocalAction(a){                          // azione dell'host stesso
  const prev = phase, res = applyAction(a, 0);
  if(!res.ok){ handleResult(a,res,prev,true); return res; }
  hostAfter(a, 0, res, undefined, prev, true);
  return res;
}
function hostAfter(a,by,res,ackId,prev,mine){         // dopo un'azione riuscita: timer, interfaccia dell'host, salvataggio, stato ai client
  room.lastActivity = Date.now();
  armTimer();
  handleResult({t:a.t}, res, prev, mine);
  persistHost();
  hostEmitState({t:a.t, by, log:res.log, events:res.events}, by, ackId);
}
const connectedArr = () => room.conns.map((c,i)=> (i===0 || (players[i] && players[i].bot)) ? true : !!c);   // host e bot sono sempre "collegati"
const remaining = () => room.deadline ? Math.max(0, room.deadline-Date.now()) : null;
function hostEmitState(extra,ackSeat,ackId){
  const s = snapshot(), con = connectedArr(), timer = remaining(); connected = con;
  room.conns.forEach((c,i)=>{ if(c) connSend(c,{type:'state', snap:viewFor(s,i), connected:con, timer, ...extra, ack: i===ackSeat ? ackId : undefined}); });
}
function emitPresence(){
  const con = connectedArr(), timer = remaining(); connected = con;
  room.conns.forEach(c=>{ if(c) connSend(c,{type:'presence', connected:con, timer}); });
  updateUI();
}
function emitLobby(){
  const taken = room.tokens.map(Boolean);
  room.conns.forEach((c,i)=>{ if(c) connSend(c,{type:'lobby', room:room.code, n:room.n, taken, seat:i}); });
  showWait(room.code, taken, room.n);
}
// ---------- timer del turno (solo fase di gioco) ----------
function armTimer(){
  clearTimeout(room.timer); room.timer = null;
  const setEnd = () => { turnEnd = room.deadline || 0; };
  if(phase!=='play'){ room.lastStep = null; room.fullDeadline = room.deadline = null; setEnd(); return; }
  const now = Date.now();
  if(!room.conns.some(Boolean) && !players.some(p=>p.bot)){ if(!room.pausedAt) room.pausedAt = now; room.deadline = null; setEnd(); return; }   // nessun client collegato: il tempo si ferma
  if(room.pausedAt){ if(room.fullDeadline) room.fullDeadline += now - room.pausedAt; room.pausedAt = null; }
  if(room.lastStep!==step){ room.lastStep = step; room.fullDeadline = now + room.turnMs; room.dcAt = null; }
  const cur = step % NUM_PLAYERS; let eff = room.fullDeadline;
  if(cur!==0 && !room.conns[cur] && !(players[cur] && players[cur].bot)){ if(room.dcAt==null) room.dcAt = now; eff = Math.min(eff, room.dcAt + NETCFG.graceTurnMs); }   // il giocatore di turno non c'è
  else room.dcAt = null;
  room.deadline = eff; setEnd();
  room.timer = setTimeout(onExpire, Math.max(0,eff-now)+5);
}
function onExpire(){                                  // tempo scaduto: l'host passa il turno o attiva l'AI
  if(!room || phase!=='play') return;
  const cur = step % NUM_PLAYERS;
  // Se il giocatore di turno è assente e non ancora bot, allo scadere dei 60s l'AI prende il comando del turno
  if(cur !== 0 && !room.conns[cur] && players[cur] && !players[cur].bot){
    players[cur].bot = true;
    players[cur].tempBot = true;
    emitPresence();
    return; // L'AI giocherà subito il turno tramite aiPoll()
  }
  const a = {t:'endTurn'}, prev = phase, res = applyAction(a, cur);
  if(res.ok) hostAfter(a, -1, res, undefined, prev, false);
}
// ---------- salvataggio e ripresa della partita (browser dell'host) ----------
function persistHost(){
  if(!room || !room.started) return;
  try{
    if(phase==='over') localStorage.removeItem(HOST_KEY);
    else localStorage.setItem(HOST_KEY, JSON.stringify({code:room.code, n:room.n, tokens:room.tokens, snap:snapshot(), ts:Date.now()}));
  }catch{}
}
function savedHost(){ try{ const d = JSON.parse(localStorage.getItem(HOST_KEY)||'null'); return d && d.code && d.snap && Date.now()-d.ts<RESUME_MAX_AGE_MS ? d : null; }catch{ return null; } }
function clearHostSaved(){ try{ localStorage.removeItem(HOST_KEY); }catch{} }
function hostResume(){
  const d = savedHost(); if(!d){ lobbyMsg('Nessuna partita da riprendere.'); return; }
  NUM_PLAYERS = d.n; startNewGame(); restore(d.snap);
  room = newRoom(d.n,d.code); room.tokens = d.tokens; room.started = true; room.restoring = true;
  becomeHost(); hideLobby(); showNetMsg('Ripristino della stanza in corso…');
  handleResult({t:'sync'}, {ok:true,log:'',events:[]}, 'tiles', true);
  hostOpenPeer(0);
}

// ================== CLIENT ==================
function clientJoin(code){
  destroyPeer();
  
  // Se chi clicca era già in questa partita, recupera il suo token per dargli priorità
  let savedToken = null;
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (s && s.room === code) savedToken = s.token;
  } catch(e) {}

  session = {room:code, token:savedToken};
  joinedOnce = !!savedToken;
  reconnecting = false;
  attempts = 0;
  wantNet = true;
  
  lobbyMsg('Connessione…'); clientConnect();
}
function clientConnect(){                             // (ri)collegamento all'host con una connessione nuova
  stopWatchdog(); clearTimeout(connTimer); destroyPeer(); linkOk = false;
  let p;
  try{ p = new Peer(ID_PREFIX+'c-'+rndStr(10,ID_CHARS), peerOpts()); }catch(e){ lobbyMsg('PeerJS non disponibile: '+e.message); wantNet = false; return; }
  peer = p;
  p.on('open', ()=>{
    if(peer!==p) return;
    const c = p.connect(ID_PREFIX+session.room, {reliable:true, metadata:{token:session.token||null}});
    hostConn = c; clientBind(c);
  });
  p.on('error', err => {
    if(peer!==p) return;
    const t = err && err.type;
    if(t==='unavailable-id'){ setTimeout(()=>{ if(peer===p && wantNet) clientConnect(); },50); return; }
    if(t==='peer-unavailable' && !joinedOnce){ wantNet = false; destroyPeer(); showLobby(); lobbyMsg('Stanza non trovata. Controlla il codice.'); return; }
    clientLost(t||'errore');
  });
  connTimer = setTimeout(()=>{ if(peer===p && wantNet && !linkOk) clientLost('timeout-connessione'); }, NETCFG.connectTimeoutMs);
}
function clientBind(c){
  c.on('open', ()=>{ if(hostConn!==c) return; lastSeen = Date.now(); startWatchdog(c); });
  c.on('data', raw => {
    if(hostConn!==c) return;
    lastSeen = Date.now(); const m = parseMsg(raw); if(!m) return;
    if(m.type==='ping'){ connSend(c,{type:'pong'}); return; }
    onNet(m);
  });
  c.on('close', ()=>{ if(hostConn===c) clientLost('chiusura'); });
  c.on('error', ()=>{ if(hostConn===c) clientLost('errore'); });
}
function startWatchdog(c){
  stopWatchdog(); let bad = 0;
  watchdog = setInterval(()=>{
    if(hostConn!==c) return;
    if(Date.now()-lastSeen>NETCFG.lostMs){ clientLost('timeout'); return; }
    const pc = c.peerConnection, st = pc && pc.iceConnectionState;
    if(st==='disconnected' || st==='failed' || st==='closed'){ if(++bad>=2) clientLost('ice'); } else bad = 0;
  }, NETCFG.iceCheckMs);
}
function stopWatchdog(){ clearInterval(watchdog); watchdog = 0; }
function clientLost(reason){
  if(!wantNet || reconnecting) return;
  stopWatchdog(); clearTimeout(connTimer); awaiting = false;
  if(!joinedOnce){ wantNet = false; destroyPeer(); showLobby(); lobbyMsg('Connessione non riuscita ('+reason+'). Riprova.'); return; }
  reconnecting = true; showNetMsg('Connessione persa… riconnessione in corso'); scheduleReconnect();
}
function scheduleReconnect(){
  clearTimeout(retryTimer);
  if(++attempts>NETCFG.maxReconnect){ showNetMsg("Impossibile ricollegarsi all'host.",true); return; }
  retryTimer = setTimeout(()=>{ if(!wantNet) return; reconnecting = false; clientConnect(); }, NETCFG.reconnectDelayMs);
}
function onNet(m){                                    // messaggi dell'host (lato client)
  if(m.type==='joined'){
    online = true; isHost = false; wantNet = true; seat = m.seat; session = {room:m.room, token:m.token};
    joinedOnce = true; linkOk = true; reconnecting = false; attempts = 0; clearTimeout(connTimer); hideNetMsg();
    try{ sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); }catch{}
    $('localCtl').style.display = 'none'; $('roomInfo').innerHTML = `Stanza <b>${m.room}</b>`;
    lobbyMsg(''); showWait(m.room, null, m.n);
  } else if(m.type==='lobby') showWait(m.room, m.taken, m.n);
  else if(m.type==='state') onState(m);
  else if(m.type==='presence'){ connected = m.connected; turnEnd = (m.timer!=null && phase==='play') ? Date.now()+m.timer : turnEnd; updateUI(); }
  else if(m.type==='rejected'){ if(m.ack===awaitId) awaiting = false; logMsg = '⚠️ '+m.err; updateUI(); redraw(); }
  else if(m.type==='error'){
    if(m.code==='bad-token'){ clearSession(); wantNet = false; online = false; destroyPeer(); $('localCtl').style.display = ''; showLobby(); lobbyMsg(m.err); }
    else if(m.code==='replaced'){ wantNet = false; stopWatchdog(); showNetMsg(m.err+' Ricarica la pagina per rientrare.'); }
    else if(!joinedOnce){ wantNet = false; destroyPeer(); showLobby(); lobbyMsg(m.err); }     // es. partita già iniziata: messaggio chiaro, niente nuovi tentativi
    else lobbyMsg(m.err);
  }
}
function onState(m){                                  // stato nuovo dall'host (anche per le azioni degli altri)
  const prevPhase = phase;
  restore(m.snap);
  connected = m.connected || [];
  turnEnd = (m.timer!=null && phase==='play') ? Date.now()+m.timer : 0;
  if(m.ack!==undefined && m.ack===awaitId) awaiting = false;
  hideLobby(); hideNetMsg();
  handleResult({t:m.t||'sync'}, {ok:true, log:m.log||'', events:m.events||[]}, prevPhase, m.by===seat || m.t==='sync');
}
function onlineNote(){                                // righe aggiuntive nel pannello di stato
  if(!online || !players[seat]) return '';
  const me = players[seat];
  let s = `<br><small>Tu sei <b style="color:${me.color}">${me.name}</b> · ${me.surrendered ? '🏳️ ti sei arreso' : isMine() ? '<b>tocca a te</b>' : 'attendi il tuo turno'}</small>`;
  const off = connected.map((c,i)=>c ? null : (players[i] && players[i].name)).filter(Boolean);
  if(off.length) s += `<br><small>⚠️ Non collegato: ${off.join(', ')}</small>`;
  return s;
}

// ================== SCHERMATA INIZIALE (lobby) ==================
function lobbyMsg(t){ $('lobMsg').textContent = t||''; }
function syncIntro(){                                 // lobby aperta = solo immagine d'apertura + lobby (niente pannello, mappa, timer o scelta fazione)
  const on = $('lobby').style.display==='block';
  if(document.body.classList.contains('intro-on')===on) return;
  document.body.classList.toggle('intro-on',on);
  if(typeof updateUI==='function'){ updateUI(); layout(); }
}
function showLobby(){ $('lobby').style.display = 'block'; $('lobMenu').style.display = 'block'; $('lobWait').style.display = 'none'; $('lobResume').style.display = savedHost() ? '' : 'none'; syncIntro(); }
function hideLobby(){ $('lobby').style.display = 'none'; syncIntro(); }
function showWait(code,taken,n){                      // in attesa degli altri giocatori
  $('lobby').style.display = 'block'; $('lobMenu').style.display = 'none'; $('lobWait').style.display = 'block'; syncIntro();
  $('lobRoom').textContent = code;
  $('lobSeats').textContent = taken ? `Giocatori entrati: ${taken.filter(Boolean).length}/${n}` : `Giocatori: ${n}`;
  $('lobLink').textContent = location.href.split('#')[0].split('?')[0]+'?room='+code;
  $('lobHostNote').style.display = isHost ? '' : 'none';
}
function showNetMsg(t,retry){
  const el = $('netmsg'); el.textContent = t; el.style.display = 'block';
  if(retry){ const b = document.createElement('button'); b.textContent = 'Riprova'; b.onclick = ()=>{ attempts = 0; reconnecting = true; scheduleReconnect(); showNetMsg('Riconnessione in corso…'); }; el.appendChild(document.createTextNode(' ')); el.appendChild(b); }
}
function hideNetMsg(){ $('netmsg').style.display = 'none'; }
function clearSession(){ session = null; try{ sessionStorage.removeItem(SESSION_KEY); }catch{} }
function leaveRoom(){
  clearSession(); wantNet = false; stopWatchdog();
  if(room){ clearTimeout(room.timer); clearInterval(room.hbTimer); clearInterval(room.iceTimer); clearInterval(room.rlTimer); if(isHost) clearHostSaved(); }
  destroyPeer(); location.reload();
}
function goFullscreen(){
  try {
    // Esclude iPhone e iPod (dove la Fullscreen API non è supportata dai browser per elementi generici)
    if(/iPhone|iPod/.test(navigator.userAgent)) return;
    const el = document.documentElement;
    const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if(rfs && !document.fullscreenElement && !document.webkitFullscreenElement){
      const p = rfs.call(el);
      if(p && p.catch) p.catch(()=>{});
    }
  } catch(e) {}
}

$('lobCreate').onclick = () => { goFullscreen(); hostCreate(+$('lobN').value); };
$('lobJoin').onclick = () => { goFullscreen(); const code = $('lobCode').value.trim().toUpperCase(); if(!code){ lobbyMsg('Scrivi il codice della stanza.'); return; } clientJoin(code); };
$('lobResume').onclick = () => { goFullscreen(); hostResume(); };
$('lobCode').addEventListener('keydown',e=>{ if(e.key==='Enter') $('lobJoin').click(); });
$('lobLocal').onclick = () => { goFullscreen(); online = false; wantNet = false; $('nPl').value = $('lobN').value; $('nBot').value = $('lobBots').value; hideLobby(); restart(); };
$('lobLeave').onclick = leaveRoom;
function initNet(){                                   // all'apertura: rientro automatico da client, altrimenti lobby
  const q = new URLSearchParams(location.search).get('room'); if(q) $('lobCode').value = q.toUpperCase();
  let s = null; try{ s = JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null'); }catch{}
  showLobby();
  if(s && s.room && s.token){ session = s; joinedOnce = true; wantNet = true; lobbyMsg('Riconnessione alla partita…'); showNetMsg('Riconnessione in corso…'); reconnecting = false; clientConnect(); }
}
