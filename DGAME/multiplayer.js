/* ============================================================
   multiplayer.js — Networking P2P via PeerJS
   ============================================================
   ARCHITETTURA: Host autoritativo (P1) + client P2/P3/P4
   - L'host genera la mappa, gestisce lo stato e lo propaga.
   - I client inviano solo le proprie azioni; l'host le valida
     e le ri-trasmette a tutti gli altri client (broadcast).
   - Le fazioni AI online sono eseguite solo dall'host.

   ESPONE: isOnline, isHost, myPlayerNumber, onlineTotalPlayers,
           onlineAIFactions, playersReady,
           showLocalMenu, startLocalGame, showOnlineMenu,
           sendOnlineMessage, broadcastToClients,
           hostStartGame, tryHostStart
   DIPENDE DA: constants.js, state.js,
               map.js (generateProceduralMap, receiveGameState),
               gamelogic.js (endTurn, executeRemoteAction, resetTurnState),
               cards.js (applyReceivedCards, receiveRemoteCardAction,
                         CARD_DEFINITIONS),
               graphics.js (showDisconnectOverlay),
               setup.js (updateSetupUI, buildWaitMessage)
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
let playersReady      = { 1: false, 2: false, 3: false, 4: false };
let onlineTotalPlayers = 2;

// Buffer agenti ricevuti dai client PRIMA che l'host avvii il setup.
// Necessario perché un client può inviare SETUP_DONE prima che l'host
// clicchi "Avvia Partita" — i dati vengono conservati e applicati al momento giusto.
let clientSetupBuffer = {};

// Fazioni gestite dall'AI online (eseguite solo sull'host)
let onlineAIFactions = new Set();

// ---- HEARTBEAT / RESILIENZA RETE ----
// Costanti
const NET_HEARTBEAT_MS   = 5000;   // ping ogni 5 s
const NET_GRACE_MS       = 12000;   // tollera silenzio fino a 12 s prima di convertire in AI
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
        for (let n = 2; n <= onlineTotalPlayers; n++) {
    if (!clientConns[n]) { 
        assignedPlayer = n; 
        break; 
    }
}
        if (!assignedPlayer) { c.close(); return; }
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

        <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:10px;">
            <span style="color:#aaa; font-size:11px; text-transform:uppercase;">Giocatori:</span>
            <div style="display:flex; gap:5px;">
                ${[2,3,4].map(n => `<button class="action-btn" onclick="setOnlinePlayers(${n})" id="online-p-btn-${n}"
                    style="border:1px solid ${n===onlineTotalPlayers?'#00ff88':'#444'}; 
                    color:${n===onlineTotalPlayers?'#00ff88':'#888'}; background:transparent;">
                    ${n}P</button>`).join('')}
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

    const factionColors = ['','#00ff88','#cc00ff','#00aaff','#FFD700'];
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
    const factionColors = ['','#00ff88','#cc00ff','#00aaff','#FFD700'];

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
        // Annulla grace timer se era in corso (riconnessione)
        if (_clientHB[playerNum]) {
            clearTimeout(_clientHB[playerNum].graceTimer);
            _clientHB[playerNum].graceTimer      = null;
            _clientHB[playerNum].isDisconnected  = false;
        } else {
            _clientHB[playerNum] = { pingInterval: null, graceTimer: null, isDisconnected: false };
        }

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
        clearInterval(_clientHB[playerNum].pingInterval);
        _clientHB[playerNum].pingInterval = setInterval(() => {
            if (c.open) {
                try { c.send({ type: 'PING' }); } catch(e) {}
            } else {
                clearInterval(_clientHB[playerNum].pingInterval);
                handleClientDisconnection(playerNum);
            }
        }, NET_HEARTBEAT_MS);
    });

    c.on('data', (data) => { 
        handleHostReceivedData(data, playerNum); 
    });

    c.on('close', () => handleClientDisconnection(playerNum));
    c.on('error', (err) => {
        console.warn(`Errore connessione P${playerNum}:`, err);
        handleClientDisconnection(playerNum);
    });

    const checkIce = setInterval(() => {
        const pc = c.peerConnection;
        if (!pc) return;
        const s = pc.iceConnectionState;
        if (s === 'disconnected' || s === 'failed' || s === 'closed') {
            clearInterval(checkIce);
            handleClientDisconnection(playerNum);
        }
    }, 4000);
}

function handleClientDisconnection(playerNum) {
    if (!isOnline || !isHost) return;

    // Crea sempre la entry HB se mancante (es. disconnessione prima di 'open')
    if (!_clientHB[playerNum]) {
        _clientHB[playerNum] = { pingInterval: null, graceTimer: null, isDisconnected: false };
    }
    const hb = _clientHB[playerNum];

    if (hb.graceTimer) return;   // grace già in corso — ignora duplicate

    hb.isDisconnected = true;
    clearInterval(hb.pingInterval);
    hb.pingInterval = null;

    players[playerNum].isDisconnected = true;

    delete clientConns[playerNum];
    updateHostLobby();

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
        setConnectionStatus('✅ Connesso! Attendi assegnazione fazione...', '#00ff88');
        _hostLastSeen      = Date.now();
        _reconnectAttempts = 0;

        // Attacca listener ICE qui, dopo open, quando peerConnection esiste
        const pc = c.peerConnection;
        if (pc) {
            pc.oniceconnectionstatechange = () => {
                const s = pc.iceConnectionState;
                if (s === 'disconnected' || s === 'failed' || s === 'closed') {
                    _onClientSideDisconnect('ice:' + s);
                }
            };
        }

        // Loop di controllo silenzio host: scatta ogni NET_HEARTBEAT_MS
        clearInterval(_hostPingInterval);
        _hostPingInterval = setInterval(() => {
            const elapsed = Date.now() - _hostLastSeen;
            // Avviso visibile dopo metà del grace period
            if (elapsed > NET_GRACE_MS / 2 && elapsed <= NET_GRACE_MS) {
                showTemporaryMessage("⚠️ Connessione con l'host instabile...", 4000);
            }
            if (elapsed > NET_GRACE_MS) {
                clearInterval(_hostPingInterval);
                _tryClientReconnect();
            }
        }, NET_HEARTBEAT_MS);
    });

    c.on('data', (data) => { 
        handleClientReceivedData(data); 
    });

    c.on('close', () => _onClientSideDisconnect('close'));
    c.on('error', (err) => {
        console.warn("Errore connessione con l'Host:", err);
        _onClientSideDisconnect('error');
    });
}

function _onClientSideDisconnect(reason) {
    if (!isOnline || isHost) return;
    clearInterval(_hostPingInterval);
    clearTimeout(_hostGraceTimer);
    // Breve pausa prima di tentare — potrebbe essere micro-disconnessione
    _hostGraceTimer = setTimeout(() => {
        if (!hostConn || !hostConn.open) _tryClientReconnect();
    }, 2000);
}

function _tryClientReconnect() {
    if (_reconnectAttempts >= NET_MAX_RETRIES) {
        handleHostDisconnection();
        return;
    }
    _reconnectAttempts++;
    setConnectionStatus(
        `🔄 Riconnessione... (${_reconnectAttempts}/${NET_MAX_RETRIES})`, '#FFD700'
    );
    setTimeout(() => {
        if (!_storedHostId) { handleHostDisconnection(); return; }
        hostConn = peer.connect(_storedHostId, {
            reliable: true,
            metadata: { playerNumber: myPlayerNumber },
        });
        setupClientConnection(hostConn);
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
// GESTIONE MESSAGGI
// ============================================================

function handleHostReceivedData(data, fromPlayer) {
    // ── Heartbeat ──────────────────────────────────────────
    if (data.type === 'PONG') {
        if (_clientHB[fromPlayer]) _clientHB[fromPlayer].isDisconnected = false;
        return;
    }

    if (data.type === 'SETUP_DONE') {
        clientSetupBuffer[fromPlayer] = data.agents;
        playersReady[fromPlayer] = true;

        // CARTE: salva le carte del client nel buffer del giocatore
        if (data.cards) {
            players[fromPlayer].cards     = data.cards;
            players[fromPlayer].usedCards = {};
        }

        tryHostStart();

    } else if (data.type === 'ACTION_CARD') {
        // CARTE: riceve l'attivazione di una carta da un client, la applica e la propaga
        if (typeof receiveRemoteCardAction === 'function') receiveRemoteCardAction(data);
        broadcastToClients(data, fromPlayer);

    } else if (data.type === 'CP_CAPTURE') {
        applyRemoteCPCapture(data);
        broadcastToClients(data, fromPlayer);

    } else if (data.type === 'SHOP_RECRUIT') {
        // Sicurezza: la fazione nel messaggio deve coincidere col mittente
        if (data.faction !== fromPlayer) {
            console.warn(`[HOST] SHOP_RECRUIT rifiutato: fazione ${data.faction} != mittente P${fromPlayer}`);
            return;
        }
        // Il negozio è aperto solo durante il proprio turno: valida anche questo
        if (currentPlayer !== fromPlayer) {
            console.warn(`[HOST] SHOP_RECRUIT rifiutato: P${fromPlayer} non è il giocatore di turno (turno di P${currentPlayer})`);
            return;
        }
        if (typeof applyRemoteShopRecruit === 'function') applyRemoteShopRecruit(data);
        broadcastToClients(data, fromPlayer);

    } else if (data.type === 'SHOP_CARD_REPLACE') {
        // Sicurezza: la fazione nel messaggio deve coincidere col mittente
        if (data.faction !== fromPlayer) {
            console.warn(`[HOST] SHOP_CARD_REPLACE rifiutato: fazione ${data.faction} != mittente P${fromPlayer}`);
            return;
        }
        // Valida che sia ancora il turno del mittente
        if (currentPlayer !== fromPlayer) {
            console.warn(`[HOST] SHOP_CARD_REPLACE rifiutato: P${fromPlayer} non è il giocatore di turno (turno di P${currentPlayer})`);
            return;
        }
        if (typeof applyRemoteShopCardReplace === 'function') applyRemoteShopCardReplace(data);
        broadcastToClients(data, fromPlayer);

    } else if (data.type === 'ACTION') {
        executeRemoteAction(data);
        broadcastToClients(data, fromPlayer);

    } else if (data.type === 'END_TURN') {
        currentPlayer = data.nextPlayer;
        endTurn(true);
        broadcastToClients(data, fromPlayer);
        // Invia lo stato completo dopo che endTurn ha aggiornato tutto
        setTimeout(() => _hostSendFullSync(), 150);
    }
}

function broadcastToClients(data, exceptPlayer = null) {
    Object.entries(clientConns).forEach(([num, c]) => {
        if (parseInt(num) !== exceptPlayer && c && c.open) {
            try { 
                c.send(data); 
            } catch(e) { 
                console.warn('broadcast error to P' + num, e); 
            }
        }
    });
}

function handleClientReceivedData(data) {
    // ── Heartbeat: aggiorna timestamp e rispondi ───────────
    _hostLastSeen = Date.now();
    if (data.type === 'PING') {
        if (hostConn && hostConn.open) {
            try { hostConn.send({ type: 'PONG' }); } catch(e) {}
        }
        return;
    }

    // ── Full state sync (fine turno / resync riconnessione) ─
    if (data.type === 'FULL_STATE_SYNC') {
        _applyFullStateSync(data.state);
        return;
    }

    if (data.type === 'ASSIGN_PLAYER') {
        myPlayerNumber = data.playerNumber;
        onlineTotalPlayers = data.totalPlayers;
        totalPlayers = data.totalPlayers;

        const colors = ['','#00ff88','#cc00ff','#00aaff','#FFD700'];
        setConnectionStatus(`✅ Sei il Giocatore ${myPlayerNumber} — ${players[myPlayerNumber].name}`, colors[myPlayerNumber]);

        document.getElementById('network-menu').style.display = 'none';
        currentPlayer = myPlayerNumber;
        setupData = freshSetupData();
        for (let p = 1; p <= 4; p++) { 
            players[p].hq = null; 
            players[p].agents = []; 
        }
        updateSetupUI();

    } else if (data.type === 'GAME_STATE') {
        if (data.state.themeId) {
            const themeToApply = bgOptions.find(t => t.id === data.state.themeId);
            if (themeToApply) applyTheme(themeToApply);
        }
        if (data.state.onlineAIFactions) {
            onlineAIFactions = new Set(data.state.onlineAIFactions);
        }

        // CARTE: applica le carte di tutti i giocatori ricevute dall'host
        if (data.state.playerCards) {
            applyReceivedCards(data.state.playerCards);
        }

        receiveGameState(data.state);
        startActiveGameUI(data.state.startingPlayer);

    } else if (data.type === 'ACTION_CARD') {
        // CARTE: riceve l'attivazione di una carta dall'host o da altro client
        if (typeof receiveRemoteCardAction === 'function') receiveRemoteCardAction(data);

    } else if (data.type === 'CP_CAPTURE') {
        applyRemoteCPCapture(data);

    } else if (data.type === 'SHOP_RECRUIT') {
        if (typeof applyRemoteShopRecruit === 'function') applyRemoteShopRecruit(data);

    } else if (data.type === 'SHOP_CARD_REPLACE') {
        if (typeof applyRemoteShopCardReplace === 'function') applyRemoteShopCardReplace(data);

    } else if (data.type === 'ACTION') {
        executeRemoteAction(data);

    } else if (data.type === 'END_TURN') {
        currentPlayer = data.nextPlayer;
        endTurn(true);

    } else if (data.type === 'PLAYER_DISCONNECTED') {
        showTemporaryMessage(
        `⚠️ ${players[data.playerNumber]?.name ?? data.playerNumber} disconnesso...`
        );
    }

    else if (data.type === 'PLAYER_BECAME_AI') {
    onlineAIFactions.add(data.playerNumber);

    showTemporaryMessage(
        `🤖 ${players[data.playerNumber].name} ora è controllato da AI`
    );
  }

    else if (data.type === 'PLAYER_RECONNECTED') {
    onlineAIFactions.delete(data.playerNumber);

    showTemporaryMessage(
        `🔌 ${players[data.playerNumber].name} è tornato in partita`
    );
}

}

// ============================================================
// SEND HELPER
// ============================================================

function sendOnlineMessage(data) {
    if (!isOnline) return;
    if (isHost) {
        broadcastToClients(data);
    } else if (hostConn && hostConn.open) {
        try { 
            hostConn.send(data); 
        } catch(e) { 
            console.warn('send error:', e); 
        }
    }
}

// ============================================================
// UTILS
// ============================================================

// ============================================================
// FULL STATE SYNC
// ============================================================

/**
 * Serializza e invia l'intero stato a tutti i client (o a uno solo).
 * Chiamata dall'host dopo endTurn e in caso di riconnessione.
 */
function _hostSendFullSync(targetPlayerNum = null) {
    if (!isOnline || !isHost) return;

    const walls    = [];
    const terrains = [];
    grid.forEach(cell => {
        if (cell.type === 'wall' || cell.type === 'barricade') {
            walls.push({ q: cell.q, r: cell.r, type: cell.type,
                hp: cell.hp, maxHp: cell.maxHp,
                sprite: cell.sprite, customSpriteId: cell.customSpriteId });
        }
        if (cell.terrain) terrains.push({ q: cell.q, r: cell.r, terrain: cell.terrain });
    });

    const playersSnapshot = {};
    for (let p = 1; p <= totalPlayers; p++) {
        playersSnapshot[p] = {
            hq:        players[p].hq,
            agents:    players[p].agents,
            credits:   players[p].credits,
            cards:     players[p].cards     || [],
            usedCards: players[p].usedCards || {},
        };
    }

    const msg = {
        type: 'FULL_STATE_SYNC',
        state: {
            walls, terrains,
            players:          playersSnapshot,
            totalPlayers,
            currentPlayer,
            turnCount,
            onlineAIFactions: Array.from(onlineAIFactions),
            controlPoints:    Array.from(controlPoints.values()),
        },
    };

    if (targetPlayerNum !== null) {
        const c = clientConns[targetPlayerNum];
        if (c && c.open) try { c.send(msg); } catch(e) {}
    } else {
        broadcastToClients(msg);
    }
}

/**
 * Applica un FULL_STATE_SYNC ricevuto dal client.
 * Sovrascrive crediti, HP, posizioni, CP, turno corrente.
 */
function _applyFullStateSync(st) {
    if (!st) return;

    if (st.onlineAIFactions) onlineAIFactions = new Set(st.onlineAIFactions);
    if (st.turnCount    !== undefined) turnCount     = st.turnCount;
    if (st.totalPlayers !== undefined) totalPlayers  = st.totalPlayers;
    if (st.currentPlayer !== undefined) currentPlayer = st.currentPlayer;

    // Aggiorna giocatori: crediti, carte, HP agenti e HQ
    if (st.players) {
        for (let p = 1; p <= totalPlayers; p++) {
            if (!st.players[p]) continue;
            const src = st.players[p];
            if (src.credits   !== undefined) players[p].credits   = src.credits;
            if (src.cards)                   players[p].cards      = src.cards;
            if (src.usedCards)               players[p].usedCards  = src.usedCards;
            if (src.agents) {
                src.agents.forEach(sa => {
                    const la = players[p].agents.find(a => a.id === sa.id);
                    if (la) { la.hp = sa.hp; la.ap = sa.ap; la.q = sa.q; la.r = sa.r; }
                });
            }
            if (src.hq && players[p].hq) players[p].hq.hp = src.hq.hp;
        }
    }

    // Aggiorna CP
    if (st.controlPoints) {
        controlPoints.clear();
        st.controlPoints.forEach(cp =>
            controlPoints.set(getKey(cp.q, cp.r), { q: cp.q, r: cp.r, faction: cp.faction })
        );
    }

    // Aggiorna HP muri
    if (st.walls) {
        st.walls.forEach(w => {
            const cell = grid.get(getKey(w.q, w.r));
            if (cell) { cell.hp = w.hp; cell.maxHp = w.maxHp; cell.type = w.type; }
        });
    }

    if (typeof updateUI   === 'function') updateUI();
    if (typeof drawGame   === 'function') drawGame();
}

/**
 * API pubblica: chiamata da gamelogic.js dopo endTurn sull'host locale.
 * Invia FULL_STATE_SYNC a tutti i client.
 */
function hostBroadcastTurnSync() { _hostSendFullSync(); }

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

function hostStartGame() {
    const needed = onlineTotalPlayers - 1;
    // Le fazioni AI non richiedono un client connesso
    const humanClientsNeeded = needed - onlineAIFactions.size;
    if (Object.keys(clientConns).length < humanClientsNeeded) return;

    document.getElementById('network-menu').style.display = 'none';
    totalPlayers = onlineTotalPlayers;
    currentPlayer = 1;
    setupData = freshSetupData();
    // Reset playersReady e players, ma CONSERVA clientSetupBuffer e carte già ricevute:
    // i client potrebbero aver inviato SETUP_DONE prima che l'host cliccasse "Avvia Partita".
    playersReady = { 1: false, 2: false, 3: false, 4: false };
    resetPlayers();
    // Ri-applica subito i dati già arrivati dai client (early SETUP_DONE)
    for (const [p, agents] of Object.entries(clientSetupBuffer)) {
        const pNum = parseInt(p);
        players[pNum].agents = agents;
        playersReady[pNum] = true;
    }

    // Auto-genera il setup per le fazioni AI e marcale subito come pronte
    onlineAIFactions.forEach(faction => {
        const generatedAgents = [];
        const spriteOffset = (faction - 1) * 4;
        for (let i = 0; i < 3; i++) {
            const hp = Math.floor(Math.random() * 5) + 1;
            generatedAgents.push({
                id: crypto.randomUUID(), type: 'agent', faction,
                sprite: getRandomSprite(SPRITE_POOLS[faction]),
                customSpriteId: `AG${i + 1 + spriteOffset}`,
                hp, maxHp: hp,
                mov: Math.floor(Math.random() * 2) + 2,
                rng: Math.floor(Math.random() * 3) + 2,
                dmg: Math.floor(Math.random() * 3) + 2,
                ap: GAME.AP_PER_TURN, q: 0, r: 0
            });
        }
        clientSetupBuffer[faction] = generatedAgents;
        playersReady[faction] = true;

        // CARTE: assegna carte casuali alle fazioni AI
        // players[faction].cards     = _generateAICards(); // originale
        players[faction].cards     = [];
        players[faction].usedCards = {};
    });

    updateSetupUI();
}

function tryHostStart() {
    for (let p = 1; p <= onlineTotalPlayers; p++) {
        if (!playersReady[p]) return;
    }

    // Applica gli agenti dal buffer prima di generare la mappa
    for (const [p, agents] of Object.entries(clientSetupBuffer)) {
        players[parseInt(p)].agents = agents;
    }

    generateProceduralMap();
    const startingPlayer = Math.ceil(Math.random() * onlineTotalPlayers);
    const walls = [];
    const terrains = [];
    grid.forEach(cell => {
        if (cell.type === 'wall' || cell.type === 'barricade') {
            walls.push({ 
                q: cell.q, 
                r: cell.r, 
                type: cell.type, 
                hp: cell.hp, 
                maxHp: cell.maxHp, 
                sprite: cell.sprite, 
                customSpriteId: cell.customSpriteId 
            });
        }

        if (cell.terrain) {
            terrains.push({ q: cell.q, r: cell.r, terrain: cell.terrain });
        }

    });

    const playersSnapshot = {};
    for (let p = 1; p <= onlineTotalPlayers; p++) {
        playersSnapshot[p] = players[p];   // includes .credits
    }

    // CARTE: costruisce la mappa carte da inviare a tutti i client
    const playerCards = {};
    for (let p = 1; p <= onlineTotalPlayers; p++) {
        playerCards[p] = players[p].cards || [];
    }

    const gameStateMsg = {
        type: 'GAME_STATE',
        state: { 
            themeId: SELECTED_BG_ID,
            walls,
            terrains, 
            players: playersSnapshot, 
            totalPlayers: onlineTotalPlayers, 
            startingPlayer,
            onlineAIFactions: Array.from(onlineAIFactions),
            playerCards,   // <-- CARTE incluse nel game state
            controlPoints: Array.from(controlPoints.values()),  // <-- CP
        }
    };

    broadcastToClients(gameStateMsg);
    startActiveGameUI(startingPlayer);

    // Immunità primo turno: protegge chi non gioca per primo  ← AGGIUNGI
    for (let p = 1; p <= onlineTotalPlayers; p++) {           // ← AGGIUNGI
        const immune = (p !== startingPlayer);                // ← AGGIUNGI
        players[p].agents.forEach(a => { a.firstTurnImmune = immune; });  // ← AGGIUNGI
        if (players[p].hq) players[p].hq.firstTurnImmune = immune;        // ← AGGIUNGI
    }

}

// ============================================================
// HELPER CREDITI / PUNTI DI CONTROLLO
// ============================================================

/**
 * Applica la cattura di un CP ricevuta via rete.
 */
function applyRemoteCPCapture(data) {
    const key = getKey(data.q, data.r);
    if (controlPoints.has(key)) {
        controlPoints.get(key).faction = data.faction;
    }
    drawGame();
}

// ============================================================
// HELPER CARTE
// ============================================================

/**
 * Genera una selezione di 3 carte casuali per le fazioni AI.
 */
function _generateAICards() {
    const ids = Object.keys(CARD_DEFINITIONS);
    const result = [];
    for (let i = 0; i < 3; i++) {
        result.push(ids[Math.floor(Math.random() * ids.length)]);
    }
    return result;
}

function loadFullGameState(state) {
    console.log("🔄 FULL SYNC ricevuto");

    // RESET COMPLETO
    if (typeof window.clearWorld === "function") {
        window.clearWorld();
    }

    // copia sicura
    gameState = structuredClone(state);

    // ricostruzione
    if (typeof window.rebuildWorld === "function") {
        window.rebuildWorld(gameState);
    } else {
        // fallback
        updateGameState(gameState);
    }
}