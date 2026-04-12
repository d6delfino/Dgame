/* ============================================================
   network_sync.js — Protocollo di Gioco e Sincronizzazione
   ============================================================
   Gestisce la trasmissione delle mosse, la deserializzazione
   degli stati completi della mappa e l'avvio della partita.
   Dipende dalle variabili globali dichiarate in network_core.js.
   ============================================================ */

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
    
    } else if (data.type === 'REQUEST_RECONNECT_SYNC') {
        console.log(`[HOST] Richiesta sync da P${fromPlayer}. Invio stato...`);
        _hostSendFullSync(fromPlayer); 
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

        const colors = ['', '#00ff88', '#cc00ff', '#00aaff', '#FFD700', '#ff3333', '#ffffff', '#444444', '#ff69b4'];
        setConnectionStatus(`✅ Sei il Giocatore ${myPlayerNumber} — ${players[myPlayerNumber].name}`, colors[myPlayerNumber]);

        document.getElementById('network-menu').style.display = 'none';
        currentPlayer = myPlayerNumber;
        setupData = freshSetupData();
        for (let p = 1; p <= 8; p++) { 
            if (players[p]) {
                players[p].hq = null; 
                players[p].agents = []; 
            }
        }
        updateSetupUI();

        if (state === 'PLAYING') {
            console.log("[Network] Riconnesso: richiedo sincronizzazione totale...");
            sendOnlineMessage({ type: 'REQUEST_RECONNECT_SYNC' });
        }

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
// AVVIO PARTITA E SETUP MULTIPLAYER
// ============================================================

function hostStartGame() {
    const needed = onlineTotalPlayers - 1;
    // Le fazioni AI non richiedono un client connesso
    const humanClientsNeeded = needed - onlineAIFactions.size;
    if (Object.keys(clientConns).length < humanClientsNeeded) return;

    document.getElementById('network-menu').style.display = 'none';
    totalPlayers = onlineTotalPlayers;
    currentPlayer = 1;
    setupData = freshSetupData();
    
    // Reset playersReady e players, ma CONSERVA clientSetupBuffer e carte già ricevute
    playersReady = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false };
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
            playerCards,   
            controlPoints: Array.from(controlPoints.values()),
        }
    };

    broadcastToClients(gameStateMsg);
    startActiveGameUI(startingPlayer);

    // Immunità primo turno: protegge chi non gioca per primo 
    for (let p = 1; p <= onlineTotalPlayers; p++) {           
        const immune = (p !== startingPlayer);                
        players[p].agents.forEach(a => { a.firstTurnImmune = immune; });  
        if (players[p].hq) players[p].hq.firstTurnImmune = immune;        
    }
}

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
            themeId:          SELECTED_BG_ID, 
            timeLeft:         timeLeft,       
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

    // PULIZIA UI CLIENT: Annulla qualsiasi azione l'utente stesse facendo
    selectedAgent = null;
    currentActionMode = null;
    validActionTargets = [];

    if (st.onlineAIFactions) onlineAIFactions = new Set(st.onlineAIFactions);
    if (st.turnCount    !== undefined) turnCount     = st.turnCount;
    if (st.totalPlayers !== undefined) totalPlayers  = st.totalPlayers;
    if (st.currentPlayer !== undefined) currentPlayer = st.currentPlayer;
    
    // Ripristina il tema se il client ha appena caricato la pagina
    if (st.themeId) {
        const themeToApply = bgOptions.find(t => t.id === st.themeId);
        if (themeToApply) applyTheme(themeToApply);
    }

    const effectiveRadius = totalPlayers > 4 ? Math.round(GRID_RADIUS * 1.6) : GRID_RADIUS;
    // 1. Ricostruzione fisica della griglia
    grid.clear();
    const RQ = effectiveRadius;
    const RR = Math.round(effectiveRadius * 0.85);
    for (let r = -RR; r <= RR; r++) {
        const qOffset = Math.floor(r / 2);
        for (let q = -RQ - qOffset; q <= RQ - qOffset; q++) {
            grid.set(getKey(q, r), { type: 'empty', q, r, entity: null, hp: 0, maxHp: 0 });
        }
    }

    // 2. Ricostruzione Muri e Terreni
    if (st.walls) {
        st.walls.forEach(w => {
            const cell = grid.get(getKey(w.q, w.r));
            if (cell) { 
                cell.hp = w.hp; cell.maxHp = w.maxHp; cell.type = w.type;
                cell.sprite = w.sprite; cell.customSpriteId = w.customSpriteId; 
            }
        });
    }
    if (st.terrains) {
        st.terrains.forEach(t => {
            const cell = grid.get(getKey(t.q, t.r));
            if (cell) cell.terrain = t.terrain;
        });
    }

    // 3. Ricostruzione Punti di Controllo
    controlPoints.clear();
    if (st.controlPoints) {
        st.controlPoints.forEach(cp =>
            controlPoints.set(getKey(cp.q, cp.r), { q: cp.q, r: cp.r, faction: cp.faction })
        );
    }

    // 4. Ripristino Giocatori, HQ e Agenti
    if (st.players) {
        for (let p = 1; p <= totalPlayers; p++) {
            if (!st.players[p]) continue;
            const src = st.players[p];
            
            players[p].credits   = src.credits || 0;
            players[p].cards     = src.cards || [];
            players[p].usedCards = src.usedCards || {};
            
            if (src.hq) {
                players[p].hq = JSON.parse(JSON.stringify(src.hq));
                const hqCell = grid.get(getKey(src.hq.q, src.hq.r));
                if (hqCell) hqCell.entity = players[p].hq;
            } else {
                players[p].hq = null;
            }

            players[p].agents = JSON.parse(JSON.stringify(src.agents || []));
            players[p].agents.forEach(a => {
                const cell = grid.get(getKey(a.q, a.r));
                if (cell) cell.entity = a;
            });
        }
    }

    // 5. Se il client era nel Menu di Setup, passalo al gioco attivo
    if (state !== 'PLAYING') {
        state = 'PLAYING';
        document.getElementById('setup-overlay').style.display  = 'none';
        document.getElementById('controls-panel').style.display = 'block';
        if (typeof initCreditShopUI === 'function') initCreditShopUI();
        autoFitMap();
        startTimer();
    }

    // 6. Sincronizzazione secondi esatti del turno
    if (st.timeLeft !== undefined) {
        timeLeft = st.timeLeft;
        const secDiv = document.getElementById('timer-seconds');
        if (secDiv) {
            secDiv.innerText = `⏳ ${timeLeft}s`;
        } else if (timerUI) {
            timerUI.innerText = `⏳ ${timeLeft}s`;
        }
    }

    if (typeof updateUI   === 'function') updateUI();
    autoFitMap();
    if (state === 'PLAYING') startTimer()
    if (typeof drawGame   === 'function') drawGame();
}

/**
 * API pubblica: chiamata da gamelogic.js dopo endTurn sull'host locale.
 */
function hostBroadcastTurnSync() { _hostSendFullSync(); }

// ============================================================
// HELPER CREDITI / PUNTI DI CONTROLLO
// ============================================================

function applyRemoteCPCapture(data) {
    const key = getKey(data.q, data.r);
    if (controlPoints.has(key)) {
        controlPoints.get(key).faction = data.faction;
    }
    drawGame();
}

// ============================================================
// HELPER CARTE E DEEP AI
// ============================================================

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
    if (typeof window.clearWorld === "function") window.clearWorld();
    gameState = structuredClone(state);
    if (typeof window.rebuildWorld === "function") window.rebuildWorld(gameState);
    else updateGameState(gameState);
}