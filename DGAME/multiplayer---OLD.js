/* ============================================================
   multiplayer.js — Networking P2P via PeerJS
   Architettura: Host autoritativo (P1) + client P2/P3/P4
   ============================================================ */

let peer = null;
let isOnline = false;
let isHost = false;

// Per l'Host: una connessione per ogni client
let clientConns = {};

// Per i client: unica connessione verso l'Host
let hostConn = null;

let myPlayerNumber = 0;
let currentPeerId = "";
let playersReady = { 1: false, 2: false, 3: false, 4: false };
let onlineTotalPlayers = 2;

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
    for (let p = 1; p <= 4; p++) { 
        players[p].hq = null; 
        players[p].agents = []; 
    }
    document.getElementById('network-menu').style.display = 'none';
    setupData = { points: 30, agents: [] };
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
        <p style="color:#888; font-size:12px; margin-bottom:10px; text-transform:uppercase;">Sei l'Host o ti colleghi?</p>
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

    const btnH = document.getElementById('btn-be-host');
    const btnC = document.getElementById('btn-be-client');
    if (btnH) btnH.disabled = true;
    if (btnC) btnC.disabled = true;

    if (!peer) {
        const myShortId = generateShortId(6);
        setConnectionStatus('Inizializzazione rete...', '#aaa');
        
        peer = new Peer(myShortId, { config: buildIceConfig(), debug: 1 });

        peer.on('open', (id) => {
            currentPeerId = id;
            renderHostPanel();
            setConnectionStatus('Pronto — condividi il tuo ID', '#00ff88');
        });

        peer.on('error', handlePeerError);

        peer.on('connection', (incoming) => {
            const takenNums = Object.keys(clientConns).map(Number);
            let assignedNum = null;
            for (let n = 2; n <= onlineTotalPlayers; n++) {
                if (!takenNums.includes(n)) { 
                    assignedNum = n; 
                    break; 
                }
            }
            if (!assignedNum) { 
                incoming.close(); 
                return; 
            }

            setConnectionStatus(`Giocatore ${assignedNum} connesso...`, '#FFD700');
            clientConns[assignedNum] = incoming;
            setupHostConnection(incoming, assignedNum);
        });
    } else if (currentPeerId) {
        renderHostPanel();
    }
}

function renderHostPanel() {
    const panel = document.getElementById('host-panel');
    if (!panel) return;
    panel.style.display = 'block';
    panel.innerHTML = `
        <p style="color:#888; font-size:11px; margin-bottom:6px; text-transform:uppercase;">Il tuo ID (condividilo con gli altri)</p>
        <div style="background:#0a0a15; border:2px solid #00ff88; border-radius:6px; padding:12px 16px; margin-bottom:10px; cursor:pointer;" onclick="copyMyID()">
            <span id="my-id-display" style="color:#00ff88; font-size:22px; font-weight:bold; letter-spacing:4px;">${currentPeerId}</span>
            <div id="copy-hint" style="color:#888; font-size:11px; margin-top:4px;">tocca per copiare</div>
        </div>
        <div id="copy-fallback" style="display:none; background:#0a0a15; border:1px solid #555; border-radius:4px; padding:8px; margin-bottom:10px;">
            <p style="color:#aaa; font-size:11px; margin:0 0 4px 0;">Copia manualmente:</p>
            <input id="copy-fallback-input" type="text" readonly 
                style="width:100%; background:transparent; border:none; color:#00ff88; font-size:18px; font-weight:bold; letter-spacing:3px; text-align:center; outline:none;" 
                onclick="this.select()" value="${currentPeerId}">
        </div>
        <p style="color:#888; font-size:11px; margin-bottom:8px; text-transform:uppercase;">Numero di giocatori:</p>
        <div style="display:flex; gap:10px; justify-content:center; margin-bottom:14px;">
            <button class="action-btn" onclick="setOnlinePlayers(2)" id="onl-btn-2" 
                style="padding:10px 18px; border:2px solid #00ff88; color:#00ff88; background:rgba(0,255,136,0.15); cursor:pointer;">2</button>
            <button class="action-btn" onclick="setOnlinePlayers(3)" id="onl-btn-3" 
                style="padding:10px 18px; border:2px solid #555; color:#555; background:transparent; cursor:pointer;">3</button>
            <button class="action-btn" onclick="setOnlinePlayers(4)" id="onl-btn-4" 
                style="padding:10px 18px; border:2px solid #555; color:#555; background:transparent; cursor:pointer;">4</button>
        </div>
        <div id="host-lobby-status" style="font-size:13px; color:#aaa; margin-bottom:12px; line-height:1.8;"></div>
        <button class="action-btn" id="btn-start-online" onclick="hostStartGame()" disabled
            style="width:100%; padding:13px; border:2px solid #555; color:#555; background:transparent; cursor:not-allowed;">
            AVVIA PARTITA
        </button>
    `;
    setOnlinePlayers(2);
    updateHostLobby();
}

function setOnlinePlayers(n) {
    onlineTotalPlayers = n;
    totalPlayers = n;
    [2, 3, 4].forEach(i => {
        const btn = document.getElementById(`onl-btn-${i}`);
        if (!btn) return;
        const active = (i === n);
        btn.style.borderColor = active ? '#00ff88' : '#555';
        btn.style.color       = active ? '#00ff88' : '#555';
        btn.style.background  = active ? 'rgba(0,255,136,0.15)' : 'transparent';
    });
    updateHostLobby();
}

function updateHostLobby() {
    const statusDiv = document.getElementById('host-lobby-status');
    const startBtn  = document.getElementById('btn-start-online');
    if (!statusDiv || !startBtn) return;

    const connected = Object.keys(clientConns).map(Number);
    const needed = onlineTotalPlayers - 1;
    const factionColors = ['','#00ff88','#cc00ff','#00aaff','#FFD700'];
    const factionNames  = ['','Verde','Viola','Blu','Oro'];

    const lines = [`<span style="color:${factionColors[1]}">P1 Verde</span>: ✅ Tu (Host)`];
    for (let n = 2; n <= onlineTotalPlayers; n++) {
        const status = connected.includes(n) ? '✅ Connesso' : '⏳ In attesa...';
        lines.push(`<span style="color:${factionColors[n]}">P${n} ${factionNames[n]}</span>: ${status}`);
    }
    statusDiv.innerHTML = lines.join('<br>');

    const allConnected = connected.length >= needed;
    startBtn.disabled = !allConnected;
    startBtn.style.borderColor = allConnected ? '#00ff88' : '#555';
    startBtn.style.color       = allConnected ? '#00ff88' : '#555';
    startBtn.style.cursor      = allConnected ? 'pointer' : 'not-allowed';
    startBtn.style.background  = allConnected ? 'rgba(0,255,136,0.1)' : 'transparent';
}

function setupHostConnection(c, playerNum) {
    c.on('open', () => {
        c.send({ type: 'ASSIGN_PLAYER', playerNumber: playerNum, totalPlayers: onlineTotalPlayers });
        updateHostLobby();
    });

    c.on('data', (data) => { 
        handleHostReceivedData(data, playerNum); 
    });

    c.on('close', () => handleClientDisconnection(playerNum));
    c.on('error', (err) => {
        console.warn(`Errore connessione P${playerNum}:`, err);
        handleClientDisconnection(playerNum);
    });
}

function handleClientDisconnection(playerNum) {
    if (!isOnline || !isHost) return;

    delete clientConns[playerNum];
    updateHostLobby();

    broadcastToClients({ 
        type: 'PLAYER_DISCONNECTED', 
        playerNumber: playerNum 
    });

    showDisconnectOverlay(
        "GIOCATORE DISCONNESSO",
        `Il giocatore ${['','Verde','Viola','Blu','Oro'][playerNum]} ha lasciato la partita.`
    );
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

    hostConn = peer.connect(targetId, { reliable: true });
    setupClientConnection(hostConn);
}

function setupClientConnection(c) {
    c.on('open', () => {
        setConnectionStatus('✅ Connesso! Attendi assegnazione fazione...', '#00ff88');
    });

    c.on('data', (data) => { 
        handleClientReceivedData(data); 
    });

    // Gestione disconnessione Host
    c.on('close', () => handleHostDisconnection());
    c.on('error', (err) => {
        console.warn("Errore connessione con l'Host:", err);
        handleHostDisconnection();
    });

    // Monitoraggio più affidabile della connessione
    if (c.peerConnection) {
        c.peerConnection.oniceconnectionstatechange = () => {
            const state = c.peerConnection.iceConnectionState;
            if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                handleHostDisconnection();
            }
        };
    }
}

function handleHostDisconnection() {
    if (!isOnline || isHost) return;

    isOnline = false;
    hostConn = null;

    showDisconnectOverlay(
        "HOST DISCONNESSO",
        "L'host ha lasciato la partita o si è disconnesso dalla rete."
    );
}

// ============================================================
// GESTIONE MESSAGGI
// ============================================================

function handleHostReceivedData(data, fromPlayer) {
    if (data.type === 'SETUP_DONE') {
        players[fromPlayer].agents = data.agents;
        playersReady[fromPlayer] = true;
        tryHostStart();

    } else if (data.type === 'ACTION') {
        executeRemoteAction(data);
        broadcastToClients(data, fromPlayer);

    } else if (data.type === 'END_TURN') {
        currentPlayer = data.nextPlayer;
        endTurn(true);
        broadcastToClients(data, fromPlayer);
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
    if (data.type === 'ASSIGN_PLAYER') {
        myPlayerNumber = data.playerNumber;
        onlineTotalPlayers = data.totalPlayers;
        totalPlayers = data.totalPlayers;

        const names  = ['','Verde','Viola','Blu','Oro'];
        const colors = ['','#00ff88','#cc00ff','#00aaff','#FFD700'];
        setConnectionStatus(`✅ Sei il Giocatore ${myPlayerNumber} — ${names[myPlayerNumber]}`, colors[myPlayerNumber]);

        document.getElementById('network-menu').style.display = 'none';
        currentPlayer = myPlayerNumber;
        setupData = { points: 30, agents: [] };
        for (let p = 1; p <= 4; p++) { 
            players[p].hq = null; 
            players[p].agents = []; 
        }
        updateSetupUI();

    } else if (data.type === 'GAME_STATE') {
        receiveGameState(data.state);
        startActiveGameUI(data.state.startingPlayer);

    } else if (data.type === 'ACTION') {
        executeRemoteAction(data);

    } else if (data.type === 'END_TURN') {
        currentPlayer = data.nextPlayer;
        endTurn(true);

    } else if (data.type === 'PLAYER_DISCONNECTED') {
        const names = ['','Verde','Viola','Blu','Oro'];
        showDisconnectOverlay(
            "GIOCATORE DISCONNESSO", 
            `Il giocatore ${names[data.playerNumber]} ha abbandonato la partita.`
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
    if (Object.keys(clientConns).length < needed) return;

    document.getElementById('network-menu').style.display = 'none';
    currentPlayer = 1;
    setupData = { points: 30, agents: [] };
    for (let p = 1; p <= 4; p++) { 
        players[p].hq = null; 
        players[p].agents = []; 
    }
    updateSetupUI();
}

function tryHostStart() {
    for (let p = 1; p <= onlineTotalPlayers; p++) {
        if (!playersReady[p]) return;
    }

    generateProceduralMap();
    const startingPlayer = Math.ceil(Math.random() * onlineTotalPlayers);
    const walls = [];
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
    });

    const playersSnapshot = {};
    for (let p = 1; p <= onlineTotalPlayers; p++) {
        playersSnapshot[p] = players[p];
    }

    const gameStateMsg = {
        type: 'GAME_STATE',
        state: { 
            walls, 
            players: playersSnapshot, 
            totalPlayers: onlineTotalPlayers, 
            startingPlayer 
        }
    };

    broadcastToClients(gameStateMsg);
    startActiveGameUI(startingPlayer);
}
