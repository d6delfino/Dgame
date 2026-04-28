/* ============================================================
   network_core.js — Infrastruttura di Rete e Connessioni (PeerJS)
   ============================================================
   Gestisce l'istanza di PeerJS, la creazione della lobby (Host),
   la connessione al volo (Client), la resilienza (Heartbeat) e
   le disconnessioni.
   ============================================================ */

// --- STATO RETE ---
window.peer = null;
window.isOnline = false;
window.isHost = false;
window.connectionLost = false;
window.myPlayerNumber = 0;
window.onlineTotalPlayers = 2;

let reconnectOverlay = null;
let _connectionWatchdog = null;

// Host: una connessione per ogni client connesso { playerNum: PeerConnection }
let clientConns = {};

// Client: unica connessione verso l'host
let hostConn = null;

let currentPeerId     = '';
let playersReady = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false };

// Buffer agenti ricevuti dai client PRIMA che l'host avvii il setup.
let clientSetupBuffer = {};

// Fazioni gestite dall'AI online (eseguite solo sull'host)
let onlineAIFactions = new Set();

// ---- HEARTBEAT / RESILIENZA RETE ----
const NET_HEARTBEAT_MS   = 5000;   // ping ogni 5 s
const NET_GRACE_MS       = 12000;  // tollera silenzio fino a 12 s prima di convertire in AI
const NET_RECONNECT_DELAY = 3000;  // client: pausa tra tentativi di riconnessione
const NET_MAX_RETRIES    = 8;      // client: max tentativi prima di mostrare overlay

// Host: { playerNum → { pingInterval, graceTimer, isDisconnected } }
let _clientHB = {};

// Client
let _hostLastSeen        = 0;
let _hostPingInterval    = null;
let _hostGraceTimer      = null;
let _reconnectAttempts   = 0;
let _storedHostId        = '';    // conservato per retry riconnessione
let _isReconnecting      = false; // previene accavallamenti di tentativi

// Sequence number (host → tutti, per scartare duplicati)
let _hostSeq       = 0;
let _clientLastSeq = -1;

// ============================================================
// MENU PRINCIPALE
// ============================================================

function showLocalMenu() {
    document.getElementById('local-options').style.display = 'block';
    document.getElementById('online-options').style.display = 'none';
}

function startLocalGame(numPlayers) {
    totalPlayers = numPlayers || 2;
    isOnline = false; 
    myPlayerNumber = 0; 
    currentPlayer = 1;
    resetPlayers();
    document.getElementById('network-menu').style.display = 'none';
    setupData = freshSetupData();
    updateSetupUI();
}

function setConnectionStatus(msg, color) {
    const el = document.getElementById('connection-status');
    if (el) { 
        el.innerText = msg; 
        el.style.color = color || '#888'; 
    }
}

function generateShortId(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) { 
        result += chars.charAt(Math.floor(Math.random() * chars.length)); 
    }
    return result;
}

// ============================================================
// MENU ONLINE
// ============================================================

function showOnlineMenu() {
    document.getElementById('online-options').style.display = 'block';
    document.getElementById('local-options').style.display = 'none';

    const box = document.getElementById('online-options');
    box.innerHTML = `
        <div style="display:flex; gap:12px; justify-content:center; margin-bottom:18px; flex-wrap:nowrap;">
            <button class="action-btn" id="btn-be-host" onclick="initAsHost()"
                style="padding:12px 22px; border:2px solid #00ff88; color:#00ff88; background:transparent; cursor:pointer;">
                🏠 CREA PARTITA (Host)
            </button>
            <button class="action-btn" id="btn-be-client" onclick="showClientPanel()"
                style="padding:12px 22px; border:2px solid #cc00ff; color:#cc00ff; background:transparent; cursor:pointer;">
                🔗 ENTRA IN PARTITA
            </button>
        </div>
        <div id="host-panel" style="display:none;"></div>
        <div id="client-panel" style="display:none;"></div>
        <div id="connection-status" style="color:#888; font-size:12px; margin-top:10px; min-height:16px;"></div>
    `;
}

// ============================================================
// LATO HOST
// ============================================================

function initAsHost() {
    window.isHost = true; 
    window.isOnline = true;
    window.myPlayerNumber = 1;

    const panel = document.getElementById('host-panel');
    panel.style.display = 'block';
    panel.innerHTML = `<p style="color:#888; font-size:12px;">Connessione in corso...</p>`;

    peer = new Peer(generateShortId(6), { config: buildIceConfig(), debug: 1 });

    peer.on('open', (id) => {
        currentPeerId = id;
        renderHostPanel(id);
    });

    players[1]._colorConfirmed = true;
    players[1]._cosmeticFaction = 1;

    peer.on('connection', (c) => {
        let assignedPlayer = null;

        // 1. Controlla se è una riconnessione
        if (c.metadata && c.metadata.playerNumber) {
            assignedPlayer = c.metadata.playerNumber;
        } else {
            // 2. Assegnazione iniziale
            for (let n = 2; n <= onlineTotalPlayers; n++) {
                if (!clientConns[n]) { 
                    assignedPlayer = n; 
                    break; 
                }
            }
        }

        if (!assignedPlayer) { c.close(); return; }
        
        // PULIZIA: Se esiste già una connessione per questo giocatore, forzane la chiusura
        if (clientConns[assignedPlayer]) {
            clientConns[assignedPlayer].close();
        }

        clientConns[assignedPlayer] = c;
        setupHostConnection(c, assignedPlayer);
    });

    peer.on('error', handlePeerError);
}

function renderHostPanel(id) {
    const panel = document.getElementById('host-panel');
    if (!panel) return;

    panel.innerHTML = `
        <div style="background:#111; border:1px solid #333; padding:8px; border-radius:4px; margin-bottom:8px;">
            <p style="color:#888; font-size:10px; margin:0 0 4px 0; text-transform:uppercase; text-align:center;">ID PARTITA (Tocca per copiare)</p>
            <div id="my-id-display" onclick="copyMyID()" style="
                color:#00ff88; font-size:18px; font-weight:bold; letter-spacing:2px;
                text-align:center; cursor:pointer; padding:6px; background:#0a0a15;
                border:1px solid #00ff88; border-radius:4px; user-select:text;">
                ${id}
            </div>
            <div id="copy-fallback" style="display:none; margin-top:4px;">
                <input id="copy-fallback-input" type="text" readonly value="${id}"
                    style="width:100%; box-sizing:border-box; background:#0a0a15; border:1px solid #333;
                    color:#00ff88; font-size:14px; text-align:center; padding:4px; font-family:'Courier New',monospace;">
            </div>
        </div>

        <div style="margin-bottom: 15px; width: 100%; padding: 0 5px; box-sizing: border-box;">
            <p style="color:#aaa; font-size: 10px; text-transform: uppercase; text-align: center; margin-bottom: 8px; letter-spacing: 1px;">Configurazione Giocatori</p>
            <div style="display: flex; gap: 2px; width: 100%; box-sizing: border-box; justify-content: center;">
                ${[2,3,4,5,6,7,8].map(n => `
                    <button class="action-btn" onclick="setOnlinePlayers(${n})" id="online-p-btn-${n}"
                        style="
                            flex: 1; 
                            min-width: 0 !important; 
                            padding: 12px 0 !important; 
                            font-size: 12px !important; 
                            border: 1px solid ${n===onlineTotalPlayers?'#00ff88':'#444'}; 
                            color: ${n===onlineTotalPlayers?'#00ff88':'#888'}; 
                            background: ${n===onlineTotalPlayers?'rgba(0,255,136,0.1)':'transparent'};
                            margin: 0 !important;
                        ">
                        ${n}P
                    </button>`).join('')}
            </div>
        </div>

        <div id="ai-slots-panel" style="margin-bottom:10px; border:1px solid #333; padding:6px 4px; border-radius:4px; background:rgba(255,255,255,0.02);">
            <p style="color:#888; font-size:10px; margin:0 0 6px 0; text-transform:uppercase; text-align:center;">Configura Bot Avversari</p>
            <div id="ai-slots-buttons" style="display:flex; gap:4px; justify-content:center;"></div>
        </div>

        <div id="host-lobby-status" style="background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; color:#888; font-size:11px; line-height:1.3; margin-bottom:10px; border:1px solid #222;"></div>
        
        <button class="action-btn" onclick="showOnlineColorPickerHost()" 
        style="width:100%; border-color:#fff; color:#fff; margin-bottom:10px; font-size:12px; padding:10px;">
        🎨 CAMBIA IL MIO COLORE (Attuale: ${players[1].name})
        </button>

        <div style="display:flex; gap:8px; margin-top:0;">
            <button class="action-btn" id="btn-start-online" onclick="hostStartGame()"
                style="flex:1; padding:14px 6px; border:2px solid #555; color:#555; background:transparent; cursor:not-allowed; font-size:13px; font-weight:bold;" disabled>
                ⚔️ AVVIA BATTAGLIA
            </button>
            <button class="action-btn" id="btn-start-campaign-online" onclick="hostStartOnlineCampaign()"
                style="flex:1; padding:14px 6px; border:2px solid #555; color:#555; background:transparent; cursor:not-allowed; font-size:13px; font-weight:bold;" disabled>
                🗺️ AVVIA CAMPAGNA
            </button>
        </div>
    `;

    updateAISlotsUI();
    updateHostLobby();
}

function setOnlinePlayers(n) {
    onlineTotalPlayers = n;
    totalPlayers = n;
    // Rimuovi fazioni AI che eccedono il numero di giocatori scelto
    for (let i = n + 1; i <= 4; i++) onlineAIFactions.delete(i);
    renderHostPanel(currentPeerId);
}

function updateAISlotsUI() {
    const container = document.getElementById('ai-slots-buttons');
    if (!container) return;

    const factionColors = ['', '#00ff88', '#cc00ff', '#00aaff', '#FFD700', '#ff3333', '#ffffff', '#444444', '#ff69b4'];
    container.innerHTML = '';

    for (let n = 2; n <= onlineTotalPlayers; n++) {
        const isAI = onlineAIFactions.has(n);
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.style.cssText = `
            flex: 1;
            padding: 8px 2px; 
            border: 1px solid ${factionColors[n]}; 
            color: ${isAI ? '#000' : factionColors[n]}; 
            background: ${isAI ? factionColors[n] : 'transparent'}; 
            font-size: 10px; 
            min-width: 0;
            white-space: nowrap;
        `;
        // Testo ultra-compatto per mobile
        btn.innerHTML = `P${n} ${isAI ? '🤖' : '👤'}`;
        btn.onclick = () => {
            if (onlineAIFactions.has(n)) onlineAIFactions.delete(n);
            else onlineAIFactions.add(n);
            updateAISlotsUI();
            updateHostLobby();
        };
        container.appendChild(btn);
    }
}

function updateHostLobby() {
    const statusDiv = document.getElementById('host-lobby-status');
    const startBtn  = document.getElementById('btn-start-online');
    if (!statusDiv || !startBtn) return;

    const connected = Object.keys(clientConns).map(Number);
    const factionColors = ['', '#00ff88', '#cc00ff', '#00aaff', '#FFD700', '#ff3333', '#ffffff', '#444444', '#ff69b4'];

    // L'host usa il suo colore aggiornato
    const hostColor = players[1].color || factionColors[1];
    const lines = [`<span style="color:${hostColor}">P1 ${players[1].name || 'Verde'}</span>: ✅ Tu (Host)`];
    
    let allReady = true;

    for (let n = 2; n <= onlineTotalPlayers; n++) {
        let status;
        
        if (onlineAIFactions.has(n)) {
            status = '🤖 BOT (AI)';
        } else if (connected.includes(n)) {
            // CONTROLLO CRITICO: Il client è connesso, ma ha scelto il colore?
            if (players[n]._colorConfirmed) {
                status = '✅ Pronto';
            } else {
                status = '🎨 Scegliendo colore...';
                allReady = false; // Blocca l'avvio della partita!
            }
        } else {
            status = '⏳ In attesa di connessione...';
            allReady = false; // Blocca l'avvio della partita!
        }

        // Usa il colore e il nome scelti se ha confermato, altrimenti usa i default grigiastri
        const displayColor = players[n]._colorConfirmed ? players[n].color : factionColors[n];
        const displayName  = players[n]._colorConfirmed ? players[n].name : `P${n}`;

        lines.push(`<span style="color:${displayColor}">${displayName}</span>: ${status}`);
    }
    
    statusDiv.innerHTML = lines.join('<br>');

    // Gestione visiva bottone Battaglia Normale
    startBtn.disabled = !allReady;
    startBtn.style.borderColor = allReady ? '#00ff88' : '#555';
    startBtn.style.color       = allReady ? '#00ff88' : '#555';
    startBtn.style.cursor      = allReady ? 'pointer' : 'not-allowed';
    startBtn.style.background  = allReady ? 'rgba(0,255,136,0.1)' : 'transparent';

    // Gestione visiva bottone Campagna
    const campBtn = document.getElementById('btn-start-campaign-online');
    if (campBtn) {
        const campReady = allReady && onlineTotalPlayers >= 2 && onlineTotalPlayers <= 4;
        campBtn.disabled = !campReady;
        campBtn.style.borderColor = campReady ? '#cc00ff' : '#555';
        campBtn.style.color       = campReady ? '#cc00ff' : '#555';
        campBtn.style.cursor      = campReady ? 'pointer' : 'not-allowed';
        campBtn.style.background  = campReady ? 'rgba(204,0,255,0.08)' : 'transparent';
    }
}

function setupHostConnection(c, playerNum) {
    c.on('open', () => {
        if (!_clientHB[playerNum]) {
            _clientHB[playerNum] = { pingInterval: null, graceTimer: null, checkIce: null, isDisconnected: false };
        }
        const hb = _clientHB[playerNum];

        // Annulla grace timer se era in corso
        clearTimeout(hb.graceTimer);
        hb.graceTimer = null;
        hb.isDisconnected = false;
        players[playerNum].isDisconnected = false;

        // Se era diventato AI → torna umano
        if (onlineAIFactions.has(playerNum)) {
            onlineAIFactions.delete(playerNum);
            showTemporaryMessage(`🔌 ${players[playerNum].name} è tornato in partita`);
            broadcastToClients({ type: 'PLAYER_RECONNECTED', playerNumber: playerNum });
        }

        updateHostLobby();
        c.send({ type: 'ASSIGN_PLAYER', playerNumber: playerNum, totalPlayers: onlineTotalPlayers });

        // Se la partita è già iniziata → resync immediato
        if (state === 'PLAYING' || state === 'GAME_OVER') {
            setTimeout(() => _hostSendFullSync(playerNum), 200);
        }

        // Avvia heartbeat verso questo client
        clearInterval(hb.pingInterval);
        hb.pingInterval = setInterval(() => {
            if (c.open) {
                try { c.send({ type: 'PING' }); } catch(e) {}
            } else {
                handleClientDisconnection(playerNum);
            }
        }, NET_HEARTBEAT_MS);

        // PULIZIA ICE CHECK: Gestione rigorosa del controllo di stato della connessione
        clearInterval(hb.checkIce);
        hb.checkIce = setInterval(() => {
            const pc = c.peerConnection;
            if (!pc) return;
            const s = pc.iceConnectionState;
            if (s === 'disconnected' || s === 'failed' || s === 'closed') {
                handleClientDisconnection(playerNum);
            }
        }, 4000);
    });

    // Delegato a network_sync.js
    c.on('data', (data) => { window.handleHostReceivedData(data, playerNum); });
    c.on('close', () => handleClientDisconnection(playerNum));
    c.on('error', (err) => handleClientDisconnection(playerNum));
}

function handleClientDisconnection(playerNum) {
    if (!isOnline || !isHost) return;

    if (!_clientHB[playerNum]) {
        _clientHB[playerNum] = { pingInterval: null, graceTimer: null, checkIce: null, isDisconnected: false };
    }
    const hb = _clientHB[playerNum];

    if (hb.graceTimer) return; // Disconnessione già in gestione

    hb.isDisconnected = true;
    
    // PULIZIA: Ferma i vecchi timer che altrimenti continuerebbero a girare!
    clearInterval(hb.pingInterval);
    clearInterval(hb.checkIce);
    hb.pingInterval = null;
    hb.checkIce = null;

    players[playerNum].isDisconnected = true;
    delete clientConns[playerNum];
    updateHostLobby();

    // Delegato a network_sync.js
    broadcastToClients({ type: 'PLAYER_DISCONNECTED', playerNumber: playerNum });
    showTemporaryMessage(`⚠️ ${players[playerNum].name} disconnesso... attendo riconnessione (${NET_GRACE_MS / 1000}s)`);

    hb.graceTimer = setTimeout(() => {
        if (hb.isDisconnected) convertPlayerToAI(playerNum);
    }, NET_GRACE_MS);
}

function convertPlayerToAI(playerNum) {
    if (onlineAIFactions.has(playerNum)) return;

    const hb = _clientHB[playerNum];
    if (hb) {
        hb.isDisconnected = false;
        clearTimeout(hb.graceTimer);
        hb.graceTimer = null;
        clearInterval(hb.pingInterval);
    }
    players[playerNum].isDisconnected = false;

    onlineAIFactions.add(playerNum);
    updateHostLobby();

    // Delegato a network_sync.js
    broadcastToClients({ type: 'PLAYER_BECAME_AI', playerNumber: playerNum });
    showTemporaryMessage(`🤖 ${players[playerNum].name} ora controllato da AI`);

    // Se era il turno del giocatore disconnesso, fai avanzare il gioco
    if (state === 'PLAYING' && currentPlayer === playerNum) {
        endTurn();
    }

    // Sync stato aggiornato a tutti i client
    setTimeout(() => _hostSendFullSync(), 100);
}

// ============================================================
// LATO CLIENT
// ============================================================

function showClientPanel() {
    const panel = document.getElementById('client-panel');
    if (!panel) return;
    panel.style.display = 'block';
    document.getElementById('host-panel').style.display = 'none';

    panel.innerHTML = `
        <p style="color:#888; font-size:11px; margin-bottom:6px; text-transform:uppercase;">ID dell'Host</p>
        <input type="text" id="peer-id-input" placeholder="Incolla ID Host..." autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false"
            style="width:100%; box-sizing:border-box; padding:14px 10px; background:#111; border:2px solid #cc00ff; color:#fff; font-size:18px; letter-spacing:2px; text-align:center; border-radius:4px; margin-bottom:12px; font-family:'Courier New',monospace;">
        <button class="action-btn" onclick="connectToHost()" id="btn-connect"
            style="width:100%; padding:14px 20px; background:#cc00ff; color:#fff; border:none; cursor:pointer; font-size:16px; border-radius:4px;">
            CONNETTI E GIOCA
        </button>
    `;

    if (!peer) {
        peer = new Peer(generateShortId(6), { config: buildIceConfig(), debug: 1 });
        peer.on('error', handlePeerError);
    }
}

function connectToHost() {
    const targetId = document.getElementById('peer-id-input').value.trim().toUpperCase();
    if (!targetId) return setConnectionStatus("Incolla prima l'ID dell'Host!", '#ff3333');

    const btn = document.getElementById('btn-connect');
    btn.disabled = true; 
    btn.innerText = 'CONNETTENDO...';
    setConnectionStatus('Ricerca Host...', '#FFD700');

    isOnline = true; 
    isHost = false;
    _storedHostId = targetId;
    _reconnectAttempts = 0;

    hostConn = peer.connect(targetId, { reliable: true });
    setupClientConnection(hostConn);
}

function setupClientConnection(c) {
    c.on('open', () => {
        // Cancella watchdog (connessione riuscita)
        if (_connectionWatchdog) {
            clearTimeout(_connectionWatchdog);
            _connectionWatchdog = null;
        }

        // === RESET SOLO QUANDO LA CONNESSIONE È REALMENTE TORNATA ===
        if (connectionLost) {
            console.log("[Network] Connessione ristabilita → reset dello stato di gioco");
            resetClientToPreConnectionState();
            connectionLost = false;
        }
        
        sessionStorage.removeItem('RICONNETTITI');
        setConnectionStatus('✅ Connesso! Sync in corso...', '#00ff88');
        _hostLastSeen      = Date.now();
        _reconnectAttempts = 0;
        _isReconnecting    = false;

        const pc = c.peerConnection;
        if (pc) {
            pc.oniceconnectionstatechange = () => {
                const s = pc.iceConnectionState;
                if (s === 'disconnected' || s === 'failed' || s === 'closed') {
                    _onClientSideDisconnect('ice:' + s);
                }
            };
        }

        clearInterval(_hostPingInterval);
        _hostPingInterval = setInterval(() => {
            const elapsed = Date.now() - _hostLastSeen;
            if (elapsed > NET_GRACE_MS / 2 && elapsed <= NET_GRACE_MS) {
                showTemporaryMessage("⚠️ Connessione instabile...", 4000);
            }
            if (elapsed > NET_GRACE_MS) {
                _onClientSideDisconnect('timeout');
            }
        }, NET_HEARTBEAT_MS);
    });

    // Delegato a network_sync.js
    c.on('data', (data) => { window.handleClientReceivedData(data); });
    c.on('close', () => _onClientSideDisconnect('close'));
    c.on('error', (err) => _onClientSideDisconnect('error'));
}

function _onClientSideDisconnect(reason) {
    if (!isOnline || isHost) return;
    
    connectionLost = true;
    console.log("[Network] Connessione persa (Reason: " + reason + "). Blocco interfaccia...");

    // 1. Blocca subito la partita
    state = 'WAITING_RECONNECT'; // Stato di sicurezza
    const controls = document.getElementById('controls-panel');
    if (controls) controls.style.pointerEvents = 'none';
    
    // 2. Mostra l'overlay bloccante
    if (!reconnectOverlay) {
        reconnectOverlay = document.createElement('div');
        reconnectOverlay.id = 'reconnect-lost-overlay';
        reconnectOverlay.style.cssText = `
            position:fixed; top:0; left:0; width:100%; height:100%; 
            background:rgba(0,0,0,0.9); z-index:99999; display:flex; 
            flex-direction:column; align-items:center; justify-content:center;
            color:#fff; font-family:'Courier New',monospace; text-align:center;
            backdrop-filter: blur(5px);
        `;
        reconnectOverlay.innerHTML = `
            <div style="font-size:4em;margin-bottom:20px; animation: pulse 1.5s infinite;">📡</div>
            <h2 style="margin:0 0 12px 0; color:#ff3333;">CONNESSIONE INTERROTTA</h2>
            <p id="overlay-subtitle" style="margin:0; font-size:18px; color:#aaa;">Rilevamento rete in corso...</p>
            <div style="margin-top:30px; font-size:12px; color:#666; border:1px solid #444; padding:10px;">
                NON CHIUDERE IL GIOCO<br>Il sistema tornerà in partita automaticamente.
            </div>
        `;
        document.body.appendChild(reconnectOverlay);
    }
    
    clearInterval(_hostPingInterval);
    clearTimeout(_hostGraceTimer);
    
    // Avvia la procedura di salvataggio e reload
    _tryClientReconnect();
}

function _tryClientReconnect() {
    // Se abbiamo l'ID dell'host, lo salviamo e ricarichiamo dopo un breve delay
    if (_storedHostId) {
        console.log("[Network] Salvataggio sessione e reload per ID:", _storedHostId);
        
        const subtitle = document.getElementById('overlay-subtitle');
        if (subtitle) subtitle.innerText = "Ripristino sessione... attendi";

        // Salviamo l'ID nel localStorage
        sessionStorage.setItem('RICONNETTITI', _storedHostId);

        // Aspettiamo 3 secondi (per dare tempo alla rete di stabilizzarsi dopo il toggle)
        setTimeout(() => {
            location.reload();
        }, 3000);
    } else {
        // Se non abbiamo l'ID, non possiamo fare nulla se non tornare al menu
        handleHostDisconnection();
    }
}

// ============================================================
// UTILITY PEERJS
// ============================================================

function buildIceConfig() {
    return {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
            { urls: 'turn:global.relay.metered.ca:80', username: '0a099e5d0bdc770566e1b8be', credential: '/7ZvcHP2v8O7nit7' },
            { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: '0a099e5d0bdc770566e1b8be', credential: '/7ZvcHP2v8O7nit7' },
            { urls: 'turn:global.relay.metered.ca:443', username: '0a099e5d0bdc770566e1b8be', credential: '/7ZvcHP2v8O7nit7' },
            { urls: 'turns:global.relay.metered.ca:443', username: '0a099e5d0bdc770566e1b8be', credential: '/7ZvcHP2v8O7nit7' },
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all'
    };
}

function handlePeerError(err) {
    console.warn("⚠️ PeerJS error:", err.type, err);
    if (err.type === 'unavailable-id') {
        peer = null;
        if (isHost) initAsHost(); 
        else showClientPanel();
    } else if (err.type === 'peer-unavailable') {
        setConnectionStatus('ID non trovato — ricontrolla', '#ff3333');
        const btn = document.getElementById('btn-connect');
        if (btn) { 
            btn.disabled = false; 
            btn.innerText = 'CONNETTI E GIOCA'; 
        }
    } else if (err.type === 'network' || err.type === 'server-error') {
        setConnectionStatus('Errore rete — riprova', '#ff3333');
    }
}

function resetClientToPreConnectionState() {
    console.log("[Network] Esecuzione resetClientToPreConnectionState");

    // Rimozione forzata dell'overlay (anche se la variabile fosse null)
    const overlay = document.getElementById('reconnect-lost-overlay');
    if (overlay) {
        overlay.remove();
        console.log("[Network] Overlay rimosso");
    }
    if (reconnectOverlay) {
        reconnectOverlay.remove();
        reconnectOverlay = null;
    }

    // Reset stato
    isOnline = false;
    state = 'MENU';
    selectedAgent = null;
    currentActionMode = null;
    validActionTargets = [];

    // Pulizia mondo (difensivo)
    if (typeof clearWorld === 'function') clearWorld();
    else if (typeof grid !== 'undefined' && grid.clear) grid.clear();

    if (typeof resetPlayers === 'function') resetPlayers();

    // Nascondi tutto
    const setup = document.getElementById('setup-overlay');
    if (setup) setup.style.display = 'none';
    
    const controls = document.getElementById('controls-panel');
    if (controls) {
        controls.style.display = 'none';
        controls.style.pointerEvents = 'auto';
    }

    const gameover = document.getElementById('gameover-overlay');
    if (gameover) gameover.remove();

    // Torna al menu di connessione
    const networkMenu = document.getElementById('network-menu');
    if (networkMenu) networkMenu.style.display = 'block';

    showOnlineMenu();
    showClientPanel();

    console.log("[Network] Client riportato allo stato pre-connessione");
}

function copyMyID() {
    if (!currentPeerId) return;
    const hint = document.getElementById('copy-hint');
    const fallbackBox = document.getElementById('copy-fallback');
    const fallbackInput = document.getElementById('copy-fallback-input');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentPeerId).then(() => {
            if (hint) { 
                hint.innerText = '✅ Copiato!'; 
                hint.style.color = '#00ff88'; 
            }
            setTimeout(() => { 
                if (hint) { 
                    hint.innerText = 'tocca per copiare'; 
                    hint.style.color = ''; 
                } 
            }, 2000);
        }).catch(() => {
            if (fallbackBox) fallbackBox.style.display = 'block';
            if (fallbackInput) { 
                fallbackInput.value = currentPeerId; 
                fallbackInput.select(); 
            }
        });
    } else {
        if (fallbackBox) fallbackBox.style.display = 'block';
        if (fallbackInput) {
            fallbackInput.value = currentPeerId; 
            fallbackInput.focus(); 
            fallbackInput.select();
            try { document.execCommand('copy'); } catch(e) {}
        }
    }
}

// ============================================================
// AVVIO CAMPAGNA ONLINE (Host)
// ============================================================

function hostStartOnlineCampaign() {
    if (!window.isHost || !window.isOnline) return;

    const needed = window.onlineTotalPlayers - 1;
    const humanClientsNeeded = needed - (window.onlineAIFactions ? window.onlineAIFactions.size : 0);
    
    if (Object.keys(clientConns).length < humanClientsNeeded) {
        showTemporaryMessage('Non tutti i giocatori sono connessi!');
        return;
    }

    // Notifica l'inizio ai client PRIMA di mostrare il dialogo all'host
    broadcastToClients({
        type: 'CAMPAIGN_ONLINE_START',
        numPlayers: window.onlineTotalPlayers,
    });

    // Delega a startOnlineCampaign che gestisce il dialogo carica/nuova
    if (typeof startOnlineCampaign === 'function') {
        startOnlineCampaign(window.onlineTotalPlayers);
    }
}

function showOnlineColorPicker() {
    const existing = document.getElementById('online-color-picker');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'online-color-picker';
    overlay.style.cssText = `
        position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(5,5,15,0.98); z-index:200000;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        font-family:'Courier New',monospace;
    `;

    let buttonsHtml = _FACTION_DEFS.map(def => {
    return `<button class="action-btn" onclick="requestColor(${def.slot})" 
            style="width:100%; margin:0; border:2px solid ${def.color}; color:${def.color}; background:transparent; padding: 15px 5px; font-size: 14px;">
            ${def.name.toUpperCase()}
            </button>`;
}).join('');

overlay.innerHTML = `
    <div style="width: 100%; max-width: 450px; padding: 20px; box-sizing: border-box; text-align: center;">
        <h2 style="color:#fff; margin-bottom:20px; font-size: clamp(18px, 5vw, 24px); text-transform: uppercase;">SCEGLI LA TUA FAZIONE</h2>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; width: 100%;">
            ${buttonsHtml}
        </div>
        <p style="color:#666; margin-top:20px; font-size:12px;">L'host deve confermare la tua scelta</p>
    </div>
`;
    document.body.appendChild(overlay);
}

window.requestColor = function(slot) {
    if (hostConn && hostConn.open) {
        hostConn.send({ type: 'REQUEST_COLOR', factionSlot: slot });
    }
};

function showOnlineColorPickerHost() {
    // Simile a quella del client, ma invece di mandare un messaggio, 
    // l'Host controlla localmente e applica subito.
    showOnlineColorPicker(); 
    // Sovrascriviamo la funzione requestColor solo per l'host in questo contesto
    window.requestColor = function(slot) {
        const taken = new Set();
        for(let p=2; p<=onlineTotalPlayers; p++) {
            if(players[p]._colorConfirmed) taken.add(players[p]._cosmeticFaction);
        }
        if(taken.has(slot)) {
            alert("Colore già prenotato da un client!");
        } else {
            applyFactionCosmetic(slot);
            players[1]._colorConfirmed = true;
            players[1]._cosmeticFaction = slot;
            document.getElementById('online-color-picker').remove();
            renderHostPanel(currentPeerId);
            updateHostLobby();
            broadcastToClients({ type: 'LOBBY_UPDATE', playersMeta: _buildLobbyMeta() });
        }
    };
}


markScriptAsLoaded('network_core.js');