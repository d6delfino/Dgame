/* ============================================================
   network_sync.js — Protocollo di Gioco e Sincronizzazione
   ============================================================
   Gestisce la trasmissione delle mosse, la deserializzazione
   degli stati completi della mappa e l'avvio della partita.
   Dipende dalle variabili globali dichiarate in network_core.js.

   ── SISTEMA ROUTER A PLUGIN ─────────────────────────────────
   I moduli successivi (campaign_multiplayer.js, ecc.) NON devono
   più sovrascrivere window.handleHostReceivedData /
   window.handleClientReceivedData con il pattern _orig/override.

   Usano invece le due API di registrazione:

     registerHostMessageHandler(type, fn)
       fn(data, fromPlayer) → viene chiamata se data.type === type
       (lato HOST). Ritornare true non è necessario: la funzione
       viene chiamata e il dispatcher si ferma su quel tipo.

     registerClientMessageHandler(type, fn)
       fn(data) → viene chiamata se data.type === type (lato CLIENT).

   I tipi registrati da moduli esterni hanno PRIORITÀ sui tipi
   built-in: il dispatcher li controlla per primo. Questo permette
   a campaign_multiplayer.js di intercettare 'SETUP_DONE' durante
   la campagna senza rompere il flusso normale.

   Se nessun handler esterno corrisponde, il dispatcher esegue
   la logica built-in originale (invariata).
   ============================================================ */

// ============================================================
// ROUTER — registri interni
// ============================================================

// Map: type → fn(data, fromPlayer)  per messaggi HOST
const _hostMessageHandlers   = new Map();

// Map: type → fn(data)  per messaggi CLIENT
const _clientMessageHandlers = new Map();

/**
 * Registra un handler per un tipo di messaggio lato HOST.
 * @param {string}   type  Valore di data.type da intercettare
 * @param {Function} fn    fn(data, fromPlayer)
 */
function registerHostMessageHandler(type, fn) {
    _hostMessageHandlers.set(type, fn);
}

/**
 * Registra un handler per un tipo di messaggio lato CLIENT.
 * @param {string}   type  Valore di data.type da intercettare
 * @param {Function} fn    fn(data)
 */
function registerClientMessageHandler(type, fn) {
    _clientMessageHandlers.set(type, fn);
}

// Esponi le API su window così che i moduli caricati dopo possano
// registrarsi anche prima che questo file sia completamente eseguito
// (raro, ma corretto difensivamente).
window.registerHostMessageHandler   = registerHostMessageHandler;
window.registerClientMessageHandler = registerClientMessageHandler;


// ============================================================
// GESTIONE MESSAGGI
// ============================================================

function handleHostReceivedData(data, fromPlayer) {
    // ── Handler registrati da moduli esterni (priorità massima) ─
    if (_hostMessageHandlers.has(data.type)) {
        _hostMessageHandlers.get(data.type)(data, fromPlayer);
        return;
    }

    // ── Logica built-in ────────────────────────────────────────

    // Heartbeat
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
        receiveRemoteCardAction(data);
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
        applyRemoteShopRecruit(data);
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
        applyRemoteShopCardReplace(data);
        broadcastToClients(data, fromPlayer);

    } else if (data.type === 'ACTION') {
        // Nessun blocco qui: i colpi devono sempre arrivare per calcolare i danni e la morte!
        executeRemoteAction(data);
        broadcastToClients(data, fromPlayer);

    } else if (data.type === 'AGENT_SELECT') {
        // Mostra le stats dell'agente selezionato anche all'host, poi propaga agli altri client
        if (typeof showRemoteAgentStats === 'function') showRemoteAgentStats(data);
        broadcastToClients(data, fromPlayer);

    } else if (data.type === 'END_TURN_REQUEST') {
        // L'Host valida la richiesta del Client
        if (fromPlayer !== currentPlayer) {
            console.warn(`[Host] Richiesta fine turno ignorata: P${fromPlayer} non è il giocatore di turno.`);
            _hostSendFullSync(fromPlayer); // Risincronizza il client molesto
            return;
        }
        console.log(`[Host] Ricevuta richiesta fine turno da P${fromPlayer}. Elaborazione...`);
        endTurn(); // Calcola il prossimo e broadcasta

    } else if (data.type === 'END_TURN') {
        // Mantieni questo per retrocompatibilità
        if (fromPlayer === currentPlayer) endTurn();

    } else if (data.type === 'REQUEST_RECONNECT_SYNC') {
        console.log(`[HOST] Richiesta sync da P${fromPlayer}. Invio stato...`);
        _hostSendFullSync(fromPlayer);
    }

    if (data.type === 'REQUEST_COLOR') {
        const requested = data.factionSlot;
        const takenByConfirmed = new Set();

        // 1. Identifica i colori già BLOCCATI (giocatori che hanno già confermato)
        for (let p = 1; p <= onlineTotalPlayers; p++) {
            if (players[p] && players[p]._colorConfirmed && p !== fromPlayer) {
                takenByConfirmed.add(players[p]._cosmeticFaction || p);
            }
        }

        if (takenByConfirmed.has(requested)) {
            // Colore già occupato da qualcuno che ha confermato: RIFIUTA
            clientConns[fromPlayer].send({ type: 'COLOR_RESPONSE', success: false, error: 'Colore già occupato da un altro giocatore!' });
        } else {
            // 2. Il colore è disponibile o occupato solo per "default": SPOSTALI
            for (let p = 1; p <= onlineTotalPlayers; p++) {
                if (p === fromPlayer) continue;
                let currentPos = players[p]._cosmeticFaction || p;

                if (currentPos === requested) {
                    // Dobbiamo spostare questo giocatore/AI perché il richiedente ha la priorità
                    const busy = new Set(takenByConfirmed);
                    busy.add(requested);
                    for (let p2 = 1; p2 <= onlineTotalPlayers; p2++) {
                        if (p2 !== p) busy.add(players[p2]._cosmeticFaction || p2);
                    }

                    for (let s = 1; s <= 8; s++) {
                        if (!busy.has(s)) {
                            players[p]._cosmeticFaction = s;
                            const d = _FACTION_DEFS[s-1];
                            players[p].color = d.color;
                            players[p].name  = d.name;
                            break;
                        }
                    }
                }
            }

            // 3. Assegna il colore al richiedente
            players[fromPlayer]._cosmeticFaction = requested;
            players[fromPlayer]._colorConfirmed  = true;
            const def = _FACTION_DEFS[requested - 1];
            players[fromPlayer].color = def.color;
            players[fromPlayer].name  = def.name;

            clientConns[fromPlayer].send({ type: 'COLOR_RESPONSE', success: true, factionSlot: requested });
            updateHostLobby();
            broadcastToClients({ type: 'LOBBY_UPDATE', playersMeta: _buildLobbyMeta() });
        }
    }
}

function broadcastToClients(data, exceptPlayer = null) {
    // Serializza una volta sola per tutti i client (Risparmio enorme di CPU per l'Host)
    const jsonStr = JSON.stringify(data);
    const sizeKB = (jsonStr.length / 1024).toFixed(2);
    
    if (sizeKB > 15) {
        console.warn(`📡 [BROADCAST WARN] Tipo: ${data.type} | Dimensione: ${sizeKB} KB`);
    } else if (sizeKB > 5) {
        console.log(`📡 [BROADCAST INFO] Tipo: ${data.type} | Dimensione: ${sizeKB} KB`);
    }

    let delayMs = 0; // Contatore per scaglionare gli invii
    
    Object.entries(clientConns).forEach(([num, c]) => {
        if (parseInt(num) !== exceptPlayer && c && c.open) {
            // Aumenta il respiro se il pacchetto è molto grande
            const dynamicDelay = sizeKB > 20 ? 80 : 40;
            
            setTimeout(() => {
                try {
                    c.send(jsonStr); // Invia la stringa già serializzata
                } catch(e) {
                    console.warn('broadcast error to P' + num, e);
                }
            }, delayMs);
            
            delayMs += dynamicDelay; 
        }
    });
}

function handleClientReceivedData(data) {
    // ── Heartbeat: aggiorna timestamp e rispondi ───────────────
    _hostLastSeen = Date.now();
    if (data.type === 'PING') {
        if (hostConn && hostConn.open) {
            try { hostConn.send({ type: 'PONG' }); } catch(e) {}
        }
        return;
    }

    // ── Full state sync (fine turno / resync riconnessione) ────
    if (data.type === 'FULL_STATE_SYNC') {
        _applyFullStateSync(data.state);
        return;
    }

    // ── Handler registrati da moduli esterni (priorità massima) ─
    // Controllati DOPO PING e FULL_STATE_SYNC (che sono fondamentali
    // e non devono mai essere intercettati da moduli esterni).
    if (_clientMessageHandlers.has(data.type)) {
        _clientMessageHandlers.get(data.type)(data);
        return;
    }

    // ── Logica built-in ────────────────────────────────────────

    if (data.type === 'COLOR_RESPONSE') {
        if (data.success) {
            applyFactionCosmetic(data.factionSlot); 
            
            // DISABILITA UI PER EVITARE CAMBI DI IDEA
            const picker = document.getElementById('online-color-picker');
            if (picker) {
                picker.querySelectorAll('button').forEach(btn => {
                    btn.disabled = true;
                    btn.style.opacity = "0.5";
                    btn.style.cursor = "default";
                });
                const instr = document.getElementById('color-picker-instruction');
                if (instr) instr.innerHTML = `<b style="color:#00ff88">FAZIONE CONFERMATA: ${players[myPlayerNumber].name.toUpperCase()}</b><br>In attesa che l'Host avvii la missione...`;
            }
            
            setConnectionStatus(`Colore confermato: ${players[myPlayerNumber].name}`, players[myPlayerNumber].color);
        } else {
            showTemporaryMessage(`⚠️ ${data.error}`, 3500);
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
                players[p].hq     = null;
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
        document.getElementById('online-color-picker')?.remove();
        // Spettatore campagna: delega senza avviare setup né turno
        if (window._isSpectating && typeof _applySpectatorGameState === 'function') {
            _applySpectatorGameState(data);
            return;
        }

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
                if (!players[p]) players[p] = { hq: null, agents: [], cards: [], usedCards: {}, credits: 0 };
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
        receiveRemoteCardAction(data);

    } else if (data.type === 'CP_CAPTURE') {
        applyRemoteCPCapture(data);

    } else if (data.type === 'SHOP_RECRUIT') {
        applyRemoteShopRecruit(data);

    } else if (data.type === 'SHOP_CARD_REPLACE') {
        applyRemoteShopCardReplace(data);

    } else if (data.type === 'ACTION') {
        // Nessun blocco qui
        executeRemoteAction(data);

    } else if (data.type === 'AGENT_SELECT') {
        if (typeof showRemoteAgentStats === 'function') showRemoteAgentStats(data);

    } else if (data.type === 'TURN_CHANGED') {
        console.log(`[Network] L'Host ha cambiato il turno. Nuovo giocatore: P${data.nextPlayer}`);
        currentPlayer = data.nextPlayer;
        endTurn(true); // Esegue il reset del turno localmente

    } else if (data.type === 'BATTLE_START_SETUP') {
        document.getElementById('online-color-picker')?.remove();

    } else if (data.type === 'END_TURN') {
        // Se l'host usa ancora il vecchio messaggio END_TURN
        currentPlayer = data.nextPlayer;
        endTurn(true);

    } else if (data.type === 'PLAYER_DISCONNECTED') {
    if (players[data.playerNumber]) {
        players[data.playerNumber].isDisconnected = true; // Segna lo stato localmente
    }
    showTemporaryMessage(
        `⚠️ ${players[data.playerNumber]?.name ?? data.playerNumber} disconnesso...`
    );
    // Se siamo nella mappa della campagna, ridisegna per mostrare la X rossa
    if (window.state === 'CAMPAIGN_MAP' && typeof renderCampaignMap === 'function') {
        renderCampaignMap();
    }

    } else if (data.type === 'CAMPAIGN_ONLINE_START') {
        document.getElementById('online-color-picker')?.remove();
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

    } else if (data.type === 'PLAYER_BECAME_AI') {
        onlineAIFactions.add(data.playerNumber);
        showTemporaryMessage(
            `🤖 ${players[data.playerNumber].name} ora è controllato da AI`
        );

    } else if (data.type === 'PLAYER_RECONNECTED') {
        onlineAIFactions.delete(data.playerNumber);
        showTemporaryMessage(
            `🔌 ${players[data.playerNumber].name} è tornato in partita`
        );
    }
}

// ============================================================
// SEND HELPER
// ============================================================

// Utility globale per serializzare una volta, calcolare il peso e inviare in sicurezza
window.safeSend = function(conn, data, context = "") {
    if (!conn || !conn.open) return;
    try {
        const jsonStr = JSON.stringify(data);
        const sizeKB = (jsonStr.length / 1024).toFixed(2);
        
        // Logga i pacchetti pesanti
        if (sizeKB > 15) {
            console.warn(`📦 [NET_WARN] Pacchetto PESANTE (${context}) | Tipo: ${data.type} | Dim: ${sizeKB} KB`);
        } else if (sizeKB > 5) {
            console.log(`📦 [NET_INFO] Pacchetto inviato (${context}) | Tipo: ${data.type} | Dim: ${sizeKB} KB`);
        }
        
        conn.send(jsonStr); // Invia la stringa leggera invece dell'oggetto complesso
    } catch(e) {
        console.warn(`[Net] Errore in safeSend (${context}):`, e);
    }
};

function sendOnlineMessage(data) {
    if (!isOnline) return;
    if (isHost) {
        broadcastToClients(data);
    } else if (hostConn && hostConn.open) {
        safeSend(hostConn, data, "Client -> Host");
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
    totalPlayers  = onlineTotalPlayers;
    currentPlayer = 1;
    setupData     = freshSetupData();

    // Reset playersReady e players, ma CONSERVA clientSetupBuffer e carte già ricevute
    playersReady = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false };
    resetPlayers();

    // Ri-applica subito i dati già arrivati dai client (early SETUP_DONE)
    for (const [p, agents] of Object.entries(clientSetupBuffer)) {
        const pNum = parseInt(p);
        players[pNum].agents  = agents;
        playersReady[pNum]    = true;
    }

    // Auto-genera il setup per le fazioni AI e marcale subito come pronte
    onlineAIFactions.forEach(faction => {

        let currentAiSlot = players[faction]._cosmeticFaction ?? faction;
        const taken = new Set();
        for (let p = 1; p <= onlineTotalPlayers; p++) {
            if (p !== faction && players[p]._colorConfirmed) taken.add(players[p]._cosmeticFaction ?? p);
        }

        // Se il colore dell'AI è già preso da un umano confermato, spostala
        if (taken.has(currentAiSlot)) {
            for (let s = 1; s <= 8; s++) {
                if (!taken.has(s)) {
                    currentAiSlot = s;
                    players[faction]._cosmeticFaction = s;
                    players[faction].color = _FACTION_DEFS[s-1].color;
                    players[faction].name  = _FACTION_DEFS[s-1].name;
                    break;
                }
            }
        }

        const generatedAgents       = [];
        const aiCosmeticFaction     = players[faction]._cosmeticFaction ?? faction;
        const factionData           = FACTION_PREFIXES[aiCosmeticFaction];

        for (let i = 0; i < 4; i++) {
            const hp   = Math.floor(Math.random() * 3) + 3;
            const slot = (i % factionData.count) + 1;

            generatedAgents.push({
                id: crypto.randomUUID(), type: 'agent', faction,
                sprite:        getRandomSprite(SPRITE_POOLS[aiCosmeticFaction] || SPRITE_POOLS[faction]),
                customSpriteId: `${factionData.prefix}${slot}`,
                hp, maxHp: hp,
                mov: Math.floor(Math.random() * 2) + 2,
                rng: Math.floor(Math.random() * 4) + 3,
                dmg: Math.floor(Math.random() * 3) + 3,
                ap:  GAME.AP_PER_TURN, q: 0, r: 0,
            });
        }
        clientSetupBuffer[faction] = generatedAgents;
        playersReady[faction]      = true;

        // CARTE: assegna 3 carte casuali diverse alle fazioni AI
        const allCardIds = Object.keys(CARD_DEFINITIONS);
        for (let i = allCardIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allCardIds[i], allCardIds[j]] = [allCardIds[j], allCardIds[i]];
        }
        players[faction].cards     = [allCardIds[0], allCardIds[1], allCardIds[2]];
        players[faction].usedCards = {};
    });

    updateSetupUI();
    broadcastToClients({ type: 'BATTLE_START_SETUP' });
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
    const walls          = [];
    const terrains       = [];

    grid.forEach(cell => {
        if (cell.type === 'wall' || cell.type === 'barricade' || cell.type === 'water') { // <--- Aggiunto water
            walls.push({ q: cell.q, r: cell.r, type: cell.type,
                hp: cell.hp, maxHp: cell.maxHp,
                sprite: cell.sprite, customSpriteId: cell.customSpriteId });
        }
        if (cell.terrain) {
            terrains.push({ q: cell.q, r: cell.r, terrain: cell.terrain });
        }
    });

    const playersSnapshot = {};
    for (let p = 1; p <= onlineTotalPlayers; p++) {
        playersSnapshot[p] = {
            ...players[p],
            color:            players[p].color,
            name:             players[p].name,
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
            themeId:          SELECTED_BG_ID,
            walls,
            terrains,
            players:          playersSnapshot,
            totalPlayers:     onlineTotalPlayers,
            startingPlayer,
            firstPlayerOfGame: startingPlayer,
            onlineAIFactions: Array.from(onlineAIFactions),
            playerCards,
            controlPoints:    Array.from(controlPoints.values()),
        },
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
        // AGGIUNTO: || cell.type === 'water'
        if (cell.type === 'wall' || cell.type === 'barricade' || cell.type === 'water') {
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
    selectedAgent      = null;
    currentActionMode  = null;
    validActionTargets = [];

    // FIX: Rimuove il selettore colore in caso di riconnessione a battaglia iniziata
    document.getElementById('online-color-picker')?.remove();

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
    buildEmptyGrid(effectiveRadius);

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

            // FIX RICONNESSIONE COOP: Se il giocatore non esiste in memoria (es. Fazione 9 Mostri), 
            // crealo al volo prima di scriverci dentro, evitando il crash!
            if (!players[p]) {
                players[p] = { hq: null, agents: [], cards: [], usedCards: {}, credits: 0, color: src.color || '#ffffff', name: src.name || 'P'+p };
            }

            players[p].credits   = src.credits || 0;
            players[p].cards     = src.cards   || [];
            players[p].usedCards = src.usedCards || {};

            // COSMESI: ripristina colore e nome scelti durante il setup
            if (src.color)            players[p].color            = src.color;
            if (src.name)             players[p].name             = src.name;
            if (src._cosmeticFaction) players[p]._cosmeticFaction = src._cosmeticFaction;

            if (src.hq) {
                players[p].hq = JSON.parse(JSON.stringify(src.hq));
                const hqCell  = grid.get(getKey(src.hq.q, src.hq.r));
                if (hqCell) hqCell.entity = players[p].hq;
            } else {
                players[p].hq = null;
            }

            players[p].agents = JSON.parse(JSON.stringify(src.agents || []));
            players[p].agents.forEach(a => {
                // Non rimettere sulla griglia tane già distrutte nello stato coop
                if (a._isLair && coopState.active) {
                    const lairData = coopState.lairs.find(l => l.q === a.q && l.r === a.r);
                    if (lairData && lairData.destroyed) return;
                }
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
        initCreditShopUI();
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

    updateUI();
    //autoFitMap();
    if (state === 'PLAYING' && !window._isSpectating) startTimer();
    invalidateStaticLayer();
    drawGame();
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
    invalidateStaticLayer();
    drawGame();
}


// Esponiamo le funzioni di dispatch su window così che i moduli successivi
// possano ancora leggerle per eventuali integrazioni future, ma NON devono
// più sovrascriverle: usare registerHostMessageHandler /
// registerClientMessageHandler invece.
window.handleHostReceivedData   = handleHostReceivedData;
window.handleClientReceivedData = handleClientReceivedData;

function _buildLobbyMeta() {
    const meta = {};
    for (let p = 1; p <= onlineTotalPlayers; p++) {
        meta[p] = {
            name:            players[p].name,
            color:           players[p].color,
            conf:            !!players[p]._colorConfirmed,
            cosmeticFaction: players[p]._cosmeticFaction,
        };
    }
    return meta;
}

function _applyLobbyMeta(meta) {
    if (!meta) return;
    Object.keys(meta).forEach(p => {
        const pNum = parseInt(p);
        if (players[pNum]) {
            players[pNum].name           = meta[p].name;
            players[pNum].color          = meta[p].color;
            players[pNum]._colorConfirmed = meta[p].conf;
            if (meta[p].cosmeticFaction !== undefined) {
                players[pNum]._cosmeticFaction = meta[p].cosmeticFaction;
            }
        }
    });
}

registerHostMessageHandler('SURRENDER', function(data, fromPlayer) {
    if (data.faction !== fromPlayer) {
        console.warn(`[HOST] SURRENDER rifiutato: P${fromPlayer} non può arrendersi per P${data.faction}`);
        return;
    }
    console.log(`[HOST] P${fromPlayer} si arrende.`);
    
    if (typeof _applySurrender === 'function') _applySurrender(fromPlayer);
    
    // NOTA: Il broadcast dell'eventuale GAME_OVER è ora gestito in automatico
    // all'interno di _applySurrender in gamelogic.js.
});

function _findWinner() {
    const stillAlive = [];
    for (let p = 1; p <= totalPlayers; p++) {
        if (players[p]?.hq?.hp > 0) stillAlive.push(p);
    }
    if (stillAlive.length === 1) return stillAlive[0];
    if (stillAlive.length === 0) return 0;

    const withAgents = [];
    for (let p = 1; p <= totalPlayers; p++) {
        if (players[p]?.agents?.some(a => a.hp > 0)) withAgents.push(p);
    }
    if (withAgents.length === 1) return withAgents[0];

    return null; // partita ancora in corso
}

registerClientMessageHandler('GAME_OVER', function(data) {
    state = 'GAME_OVER';
    setTimeout(() => showGameOverlay(data.title, data.message, data.color), 300);
});



markScriptAsLoaded('network_sync.js');
