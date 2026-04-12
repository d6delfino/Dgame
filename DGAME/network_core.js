/* ============================================================
   network_core.js — Infrastruttura di Rete e Connessioni (PeerJS)
   ============================================================
   Gestisce l'istanza di PeerJS, la creazione della lobby (Host),
   la connessione al volo (Client), la resilienza (Heartbeat) e
   le disconnessioni.
   ============================================================ */

// --- STATO RETE ---
let peer   = null;
let isOnline = false;
let isHost   = false;

// Host: una connessione per ogni client connesso { playerNum: PeerConnection }
let clientConns = {};

// Client: unica connessione verso l'host
let hostConn = null;

let myPlayerNumber    = 0;
let currentPeerId     = '';
let playersReady = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false };
let onlineTotalPlayers = 2;

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
        <div style="display:flex; gap:12px; justify-content:center; margin-bottom:18px; flex-wrap:wrap;">
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
    isHost = true; 
    isOnline = true;
    myPlayerNumber = 1;

    const panel = document.getElementById('host-panel');
    panel.style.display = 'block';
    panel.innerHTML = `<p style="color:#888; font-size:12px;">Connessione in corso...</p>`;

    peer = new Peer(generateShortId(6), { config: buildIceConfig(), debug: 1 });

    peer.on('open', (id) => {
        currentPeerId = id;
        renderHostPanel(id);
    });

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

        <div style="margin-bottom: 12px; width: 100%;">
            <!-- Spostiamo il titolo SOPRA per liberare spazio ai lati -->
            <p style="color:#aaa; font-size:10px; text-transform:uppercase; text-align:center; margin-bottom:6px;">Numero Giocatori</p>
            
            <div style="display:flex; gap:3px; width:100%; box-sizing:border-box;">
                ${[2,3,4,5,6,7,8].map(n => `
                    <button class="action-btn" onclick="setOnlinePlayers(${n})" id="online-p-btn-${n}"
                        style="flex:1; padding:10px 0; font-size:12px; min-width:0; text-align:center;
                        border:1px solid ${n===onlineTotalPlayers?'#00ff88':'#444'}; 
                        color:${n===onlineTotalPlayers?'#00ff88':'#888'}; background:transparent;">
                        ${n}P
                    </button>`).join('')}
            </div>
        </div>

        <div id="ai-slots-panel" style="margin-bottom:10px; border:1px solid #333; padding:6px 4px; border-radius:4px; background:rgba(255,255,255,0.02);">
            <p style="color:#888; font-size:10px; margin:0 0 6px 0; text-transform:uppercase; text-align:center;">Configura Bot Avversari</p>
            <div id="ai-slots-buttons" style="display:flex; gap:4px; justify-content:center;"></div>
        </div>

        <div id="host-lobby-status" style="background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; color:#888; font-size:11px; line-height:1.3; margin-bottom:10px; border:1px solid #222;"></div>
        
        <button class="action-btn" id="btn-start-online" onclick="hostStartGame()"
            style="width:100%; padding:14px; border:2px solid #555; color:#555; background:transparent; cursor:not-allowed; font-size:14px; font-weight:bold;" disabled>
            AVVIA PARTITA
        </button>
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

    const lines = [`<span style="color:${factionColors[1]}">P1 Verde</span>: ✅ Tu (Host)`];
    let allReady = true;
    for (let n = 2; n <= onlineTotalPlayers; n++) {
        let status;
        if (onlineAIFactions.has(n)) {
            status = '🤖 BOT (AI)';
        } else if (connected.includes(n)) {
            status = '✅ Connesso';
        } else {
            status = '⏳ In attesa...';
            allReady = false;
        }
        lines.push(`<span style="color:${factionColors[n]}">P${n} ${players[n].name}</span>: ${status}`);
    }
    statusDiv.innerHTML = lines.join('<br>');

    startBtn.disabled = !allReady;
    startBtn.style.borderColor = allReady ? '#00ff88' : '#555';
    startBtn.style.color       = allReady ? '#00ff88' : '#555';
    startBtn.style.cursor      = allReady ? 'pointer' : 'not-allowed';
    startBtn.style.background  = allReady ? 'rgba(0,255,136,0.1)' : 'transparent';
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
    c.on('data', (data) => { handleHostReceivedData(data, playerNum); });
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
        setConnectionStatus('✅ Connesso! Sync in corso...', '#00ff88');
        _hostLastSeen      = Date.now();
        _reconnectAttempts = 0;
        _isReconnecting    = false; // Sblocca il lucchetto di riconnessione

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
    c.on('data', (data) => { handleClientReceivedData(data); });
    c.on('close', () => _onClientSideDisconnect('close'));
    c.on('error', (err) => _onClientSideDisconnect('error'));
}

function _onClientSideDisconnect(reason) {
    if (!isOnline || isHost) return;
    
    clearInterval(_hostPingInterval);
    clearTimeout(_hostGraceTimer);
    
    // Evita loop di riconnessione se ci sta già provando
    if (_isReconnecting) return;
    
    _hostGraceTimer = setTimeout(() => {
        _tryClientReconnect();
    }, 2000);
}

function _tryClientReconnect() {
    if (_isReconnecting) return;
    _isReconnecting = true; 

    if (_reconnectAttempts >= NET_MAX_RETRIES) {
        handleHostDisconnection();
        return;
    }
    _reconnectAttempts++;
    setConnectionStatus(
        `🔄 Riconnessione... (${_reconnectAttempts}/${NET_MAX_RETRIES})`, '#FFD700'
    );
    
    // PULIZIA AGGRESSIVA: Chiudiamo e annulliamo la vecchia connessione
    if (hostConn) {
        hostConn.removeAllListeners(); // Rimuove vecchi eventi che potrebbero creare conflitti
        hostConn.close();
        hostConn = null;
    }

    setTimeout(() => {
        if (!_storedHostId) { handleHostDisconnection(); return; }
        
        console.log("[Network] Tentativo di riconnessione a:", _storedHostId);
        
        hostConn = peer.connect(_storedHostId, {
            reliable: true,
            metadata: { 
                playerNumber: myPlayerNumber,
                isReconnect: true // Diciamo all'host che siamo noi che torniamo
            },
        });
        setupClientConnection(hostConn);
        
        // Sblocca il lucchetto dopo 2 secondi per permettere un nuovo tentativo se questo fallisce
        setTimeout(() => { _isReconnecting = false; }, 2000);
    }, NET_RECONNECT_DELAY);
}

function handleHostDisconnection() {
    if (!isOnline || isHost) return;

    clearInterval(_hostPingInterval);
    clearTimeout(_hostGraceTimer);
    isOnline = false;
    hostConn = null;

    showDisconnectOverlay(
        "HOST DISCONNESSO",
        "L'host ha lasciato la partita o è irraggiungibile."
    );
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