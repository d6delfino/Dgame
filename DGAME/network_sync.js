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

        if (data.credits !== undefined) {
            players[fromPlayer].credits = data.credits;
        }

        // COSMESI: aggiorna colore, nome e fazione cosmetica scelti dal client
        if (data.color)           players[fromPlayer].color            = data.color;
        if (data.name)            players[fromPlayer].name             = data.name;
        if (data.cosmeticFaction) players[fromPlayer]._cosmeticFaction = data.cosmeticFaction;

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
        // Nessun blocco qui: i colpi devono sempre arrivare per calcolare i danni e la morte!
        executeRemoteAction(data);
        broadcastToClients(data, fromPlayer);

    } else if (data.type === 'END_TURN_REQUEST') {
        // L'Host valida la richiesta del Client
        if (fromPlayer !== currentPlayer) {
            console.warn(`[Host] Richiesta fine turno ignorata: P${fromPlayer} non è il giocatore di turno.`);
            _hostSendFullSync(fromPlayer); // Risincronizza il client molesto
            return;
        }
        console.log(`[Host] Ricevuta richiesta fine turno da P${fromPlayer}. Elaborazione...`);
        endTurn(); // Calcola il prossimo e broadcasta (grazie alla modifica sopra)

    } else if (data.type === 'END_TURN') {
        // Mantieni questo per retrocompatibilità o rimuovilo se hai aggiornato endTurn dappertutto
        if (fromPlayer === currentPlayer) endTurn();
    
    } else if (data.type === 'REQUEST_RECONNECT_SYNC') {
        console.log(`[HOST] Richiesta sync da P${fromPlayer}. Invio stato...`);
        _hostSendFullSync(fromPlayer); 
    }

    if (data.type === 'REQUEST_COLOR') {
    const requested = data.factionSlot;
    const taken = new Set();
    
    // Controlla quali colori sono già stati confermati dagli altri
    for (let p = 1; p <= onlineTotalPlayers; p++) {
        if (players[p] && players[p]._colorConfirmed && p !== fromPlayer) {
            taken.add(players[p]._cosmeticFaction || p);
        }
    }

    if (taken.has(requested)) {
        // Rifiuta
        clientConns[fromPlayer].send({ type: 'COLOR_RESPONSE', success: false, error: 'Colore già occupato!' });
    } else {
        // Accetta e registra
        players[fromPlayer]._cosmeticFaction = requested;
        players[fromPlayer]._colorConfirmed = true;
        const def = _FACTION_DEFS[requested - 1];
        players[fromPlayer].color = def.color;
        players[fromPlayer].name = def.name;
        
        clientConns[fromPlayer].send({ type: 'COLOR_RESPONSE', success: true, factionSlot: requested });
        updateHostLobby(); // Aggiorna la lista nomi/colori per l'host
        broadcastToClients({ type: 'LOBBY_UPDATE', playersMeta: _buildLobbyMeta() }); // Notifica gli altri
    }
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

    if (data.type === 'COLOR_RESPONSE') {
    if (data.success) {
        // Chiudi selettore e attendi l'inizio dell'host
        document.getElementById('online-color-picker')?.remove();
        applyFactionCosmetic(data.factionSlot); // Aggiorna setup locale
        setConnectionStatus(`Colore confermato: ${players[myPlayerNumber].name}`, players[myPlayerNumber].color);
    } else {
        alert(data.error);
        // Il selettore rimane aperto per una nuova scelta
    }
    } else if (data.type === 'LOBBY_UPDATE') {
    // Sincronizza i nomi/colori degli altri nella lobby
    _applyLobbyMeta(data.playersMeta);
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
        showOnlineColorPicker();

    } else if (data.type === 'GAME_STATE') {
        if (data.state.themeId) {
            const themeToApply = bgOptions.find(t => t.id === data.state.themeId);
            if (themeToApply) applyTheme(themeToApply);
        }
        if (data.state.onlineAIFactions) {
            onlineAIFactions = new Set(data.state.onlineAIFactions);
        }

        // COSMESI: applica colore, nome e fazione cosmetica di ogni giocatore
        if (data.state.players) {
            for (let p = 1; p <= (data.state.totalPlayers || 8); p++) {
                const src = data.state.players[p];
                if (!src) continue;
                if (src.color)            players[p].color            = src.color;
                if (src.name)             players[p].name             = src.name;
                if (src._cosmeticFaction) players[p]._cosmeticFaction = src._cosmeticFaction;
            }
        }

        // CARTE: applica le carte di tutti i giocatori ricevute dall'host
        if (data.state.playerCards) {
            applyReceivedCards(data.state.playerCards);
        }

        receiveGameState(data.state);
        if (data.state.firstPlayerOfGame !== undefined) {
            _firstPlayerOfGame = data.state.firstPlayerOfGame;
        }
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
        // Nessun blocco qui
        executeRemoteAction(data);

    } else if (data.type === 'TURN_CHANGED') {
        console.log(`[Network] L'Host ha cambiato il turno. Nuovo giocatore: P${data.nextPlayer}`);
        currentPlayer = data.nextPlayer;
        endTurn(true); // Esegue il reset del turno localmente

    } else if (data.type === 'END_TURN') {
        // Se l'host usa ancora il vecchio messaggio END_TURN
        currentPlayer = data.nextPlayer;
        endTurn(true);

    } else if (data.type === 'PLAYER_DISCONNECTED') {
        showTemporaryMessage(
        `⚠️ ${players[data.playerNumber]?.name ?? data.playerNumber} disconnesso...`
        );
    }

    else if (data.type === 'CAMPAIGN_ONLINE_START') {
        isCampaignOnline  = true;
        campaignMyFaction = myPlayerNumber;
        totalPlayers      = data.numPlayers || onlineTotalPlayers;

        document.getElementById('network-menu').style.display = 'none';
        const setupOv = document.getElementById('setup-overlay');
        if (setupOv) setupOv.style.display = 'none';

        const waitDiv = document.createElement('div');
        waitDiv.id = 'cn-campaign-init-overlay';
        waitDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
            'background:rgba(5,5,9,0.96);z-index:99990;' +
            'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
            'font-family:\'Courier New\',monospace;color:#fff;text-align:center;';
        const pColor = COLORS['p' + myPlayerNumber] || '#00ff88';
        const pName  = players[myPlayerNumber] ? players[myPlayerNumber].name : '';
        waitDiv.innerHTML =
            '<div style="font-size:3em;margin-bottom:20px;">\uD83D\uDDFA\uFE0F</div>' +
            '<h2 style="color:' + pColor + ';margin-bottom:10px;">CAMPAGNA GLOBALE</h2>' +
            '<p style="color:#aaa;">Inizializzazione in corso...<br>' +
            '<span style="color:' + pColor + ';font-size:1.2em;margin-top:10px;display:block;">' +
            'Sei il Giocatore ' + myPlayerNumber + ' — ' + pName + '</span></p>';
        document.body.appendChild(waitDiv);
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
        const aiCosmeticFaction = players[faction]._cosmeticFaction ?? faction;
        const factionData = FACTION_PREFIXES[aiCosmeticFaction];

        for (let i = 0; i < 3; i++) {
            const hp = Math.floor(Math.random() * 5) + 1;
            const slot = (i % factionData.count) + 1;

            generatedAgents.push({
                id: crypto.randomUUID(), type: 'agent', faction,
                sprite: getRandomSprite(SPRITE_POOLS[aiCosmeticFaction] || SPRITE_POOLS[faction]),
                customSpriteId: `${factionData.prefix}${slot}`,
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
        playersSnapshot[p] = {
            ...players[p],
            color:           players[p].color,
            name:            players[p].name,
            _cosmeticFaction: players[p]._cosmeticFaction ?? p,
        };
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
            firstPlayerOfGame: startingPlayer,
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
            hq:               players[p].hq,
            agents:           players[p].agents,
            credits:          players[p].credits,
            cards:            players[p].cards     || [],
            usedCards:        players[p].usedCards || {},
            color:            players[p].color,
            name:             players[p].name,
            _cosmeticFaction: players[p]._cosmeticFaction ?? p,
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

            // COSMESI: ripristina colore e nome scelti durante il setup
            if (src.color)            players[p].color            = src.color;
            if (src.name)             players[p].name             = src.name;
            if (src._cosmeticFaction) players[p]._cosmeticFaction = src._cosmeticFaction;
            
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

// Esponiamo le funzioni di dispatch su window così che i moduli successivi
// (campaign_multiplayer.js, campaign_persist.js) possano sovrascriverle.
window.handleHostReceivedData   = handleHostReceivedData;
window.handleClientReceivedData = handleClientReceivedData;

function _buildLobbyMeta() {
    const meta = {};
    for (let p = 1; p <= onlineTotalPlayers; p++) {
        meta[p] = {
            name: players[p].name,
            color: players[p].color,
            conf: !!players[p]._colorConfirmed,
            cosmeticFaction: players[p]._cosmeticFaction
        };
    }
    return meta;
}

function _applyLobbyMeta(meta) {
    if (!meta) return;
    Object.keys(meta).forEach(p => {
        const pNum = parseInt(p);
        if (players[pNum]) {
            players[pNum].name = meta[p].name;
            players[pNum].color = meta[p].color;
            players[pNum]._colorConfirmed = meta[p].conf;
            // <--- AGGIUNTO: Salva il numero fazione ricevuto dall'host
            if (meta[p].cosmeticFaction !== undefined) {
                players[pNum]._cosmeticFaction = meta[p].cosmeticFaction;
            }
        }
    });
}