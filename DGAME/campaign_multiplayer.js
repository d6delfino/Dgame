/* ============================================================
   campaign_multiplayer.js  —  CAMPAGNA: RETE MULTIPLAYER
   ============================================================
   Sostituisce: campaign_net_host.js, campaign_net_client.js,
                campaign_multiplayer_fix.js
   Dipende da : campaign_core.js, network_core.js, network_sync.js
   Caricato DA: index.html — dopo campaign_core.js

   ARCHITETTURA:
     - Nessun hook/override a cascata.
     - campaign_core.js chiama direttamente le funzioni _net_*
       esposte qui (stub no-op in locale).
     - Qui vivono TUTTE le logiche online: snapshot, messaggi,
       validazione host, UI attesa client, setup battaglia.
   ============================================================ */

// ============================================================
// STATO RETE CAMPAGNA
// ============================================================

window.isCampaignOnline  = false;
window.campaignMyFaction = 0;
window.campaignSeq       = 0;

// ============================================================
// IMPLEMENTAZIONE _net_* (chiamate da campaign_core.js)
// ============================================================

/** Broadcast snapshot a tutti i client */
window._net_hostBroadcast = function() {
    if (!isOnline || !isHost) return;
    _doHostBroadcast();
};

/** Invia un messaggio arbitrario a tutti i client */
window._net_broadcast = function(msg) {
    if (!isOnline || !isHost) return;
    broadcastToClients(msg);
};

/** Il client invia un'azione all'host */
window._net_clientSend = function(actionType, payload) {
    if (!isCampaignOnline || isHost) return;
    if (!hostConn || !hostConn.open) return;
    try {
        hostConn.send({ type: 'CAMPAIGN_ACTION', action: actionType, payload: payload || {}, player: myPlayerNumber });
    } catch(e) { console.warn('[Net] Errore invio azione:', e); }
};

/** Costruisce uno snapshot serializzabile dello stato campagna */
window._net_buildSnapshot = function() {
    if (window.isHost) {campaignSeq++;}
    return {
        seq:               campaignSeq,
        isActive:          campaignState.isActive,
        numPlayers:        campaignState.numPlayers,
        currentPlayer:     campaignState.currentPlayer,
        credits:           JSON.parse(JSON.stringify(campaignState.credits)),
        victoryThreshold:  campaignState.victoryThreshold,
        phase:             campaignState.phase,
        turnCount:         campaignState.turnCount || 1,
        pendingMoves:      JSON.parse(JSON.stringify(campaignState.pendingMoves  || {})),
        pendingOrders:     JSON.parse(JSON.stringify(campaignState.pendingOrders || {})),
        sectorCredits:     JSON.parse(JSON.stringify(campaignState.sectorCredits || {})),
        pendingAllocation: campaignState.pendingAllocation ? JSON.parse(JSON.stringify(campaignState.pendingAllocation)) : null,
        _allOrderedSectors: JSON.parse(JSON.stringify(campaignState._allOrderedSectors || {})),
        _currentBattle:    campaignState._currentBattle ? JSON.parse(JSON.stringify(campaignState._currentBattle)) : null,
        battleQueue:       JSON.parse(JSON.stringify(campaignState.battleQueue || [])),
        currentBattleParticipants: JSON.parse(JSON.stringify(campaignState.currentBattleParticipants || [])),
        targetSector:      campaignState.targetSector,
        sectors: campaignState.sectors.map(s => ({
            id: s.id, owner: s.owner, x: s.x, y: s.y,
            blocked: s.blocked, income: s.income, specialization: s.specialization || null,
            // --- AGGIUNTI QUI ---
            mineUpgrade: s.mineUpgrade,
            mineField: s.mineField,
            fortressUpgrade: s.fortressUpgrade
        })),
        playersMeta: (() => {
            const out = {};
            for (let p = 1; p <= campaignState.numPlayers; p++) {
                if (window.players?.[p]) {
                    out[p] = { 
                        name: players[p].name, 
                        color: players[p].color,
                        _cosmeticFaction: players[p]._cosmeticFaction
                    };
                }
            }
            return out;
        })(),
    };
};

/** Applica un badge e lock/unlock mappa in base al turno corrente */
window._net_applyTurnState = function() {
    if (!isCampaignOnline) return;
    if (campaignState.phase === 'RESOLVING') {
        _showTurnBadge('resolving'); _lockMap(); return;
    }
    if (campaignState.currentPlayer === myPlayerNumber) {
        _removeTurnBadge(); _unlockMap(); _fixConfirmButton();
    } else {
        _showTurnBadge('waiting'); _lockMap();
    }
};

/** Mostra l'overlay "Ordine confermato — in attesa degli altri" */
window._net_showOrderSentOverlay = function() {
    const existing = document.getElementById('cn-order-sent-overlay');
    if (existing) return;
    const actDiv = document.getElementById('campaign-actions');
    if (actDiv) actDiv.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.4'; });

    const pColor = players[myPlayerNumber]?.color || COLORS['p' + myPlayerNumber] || '#00ff88';
    const badge  = document.createElement('div');
    badge.id = 'cn-order-sent-overlay';
    badge.style.cssText = `
        position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
        background:rgba(0,0,0,0.92); border:2px solid ${pColor};
        border-radius:10px; padding:16px 32px;
        font-family:'Courier New',monospace; text-align:center;
        z-index:200001; pointer-events:none; min-width:280px;`;
    badge.innerHTML = `
        <div style="color:${pColor};font-weight:bold;font-size:16px;margin-bottom:6px;">✅ ORDINE CONFERMATO</div>
        <div style="color:#aaa;font-size:13px;">In attesa degli altri giocatori...</div>`;
    document.body.appendChild(badge);
};

/** Gestisce confirmPlayerSetup in campagna online */
window._net_handleConfirmSetup = function() {
    if (isHost) {
        playersReady[window.myPlayerNumber] = true;                    // usa myPlayerNumber, non currentPlayer
        clientSetupBuffer[window.myPlayerNumber] = players[window.myPlayerNumber].agents;
        document.getElementById('setup-box').innerHTML = `<h2 style='color:white;text-align:center'>Pronto!<br>
            <span style='font-size:14px;color:#aaa'>Attendi che tutti i giocatori siano pronti...</span></h2>`;
        _tryBattleStart();
    } else {
        sendOnlineMessage({
            type:    'SETUP_DONE',
            agents:  players[myPlayerNumber].agents,
            cards:   players[myPlayerNumber].cards,
            credits: players[myPlayerNumber].credits,
        });
        document.getElementById('setup-box').innerHTML = `
            <h2 style='color:white;text-align:center'>Setup inviato!<br>
            <span style='font-size:14px;color:#aaa'>Attendi che l'Host avvii la battaglia...</span></h2>`;
    }
};

// ============================================================
// HOOK RETE: handleHostReceivedData — messaggi campagna → host
// ============================================================

const _mp_origHandleHostData = window.handleHostReceivedData;
window.handleHostReceivedData = function(data, fromPlayer) {
    // Intercetta azioni campagna
    if (data.type === 'CAMPAIGN_ACTION') {
        _hostHandleAction(data, fromPlayer);
        return;
    }
    // In campagna online: intercetta SETUP_DONE per usare _tryBattleStart
    if (data.type === 'SETUP_DONE' && isCampaignOnline && isHost && campaignState.isActive) {
        clientSetupBuffer[fromPlayer] = data.agents;
        playersReady[fromPlayer] = true;
        if (data.cards)   { players[fromPlayer].cards = data.cards; players[fromPlayer].usedCards = {}; }
        if (data.credits !== undefined) players[fromPlayer].credits = data.credits;
        _tryBattleStart();
        return;
    }
    if (_mp_origHandleHostData) _mp_origHandleHostData(data, fromPlayer);
};

// ============================================================
// HOOK RETE: handleClientReceivedData — messaggi campagna → client
// ============================================================

const _mp_origHandleClientData = window.handleClientReceivedData;
window.handleClientReceivedData = function(data) {
    switch (data.type) {
        case 'CAMPAIGN_STATE_SYNC':    _clientHandleStateSync(data);    return;
        case 'CAMPAIGN_BATTLE_START':  _clientHandleBattleStart(data);  return;
        case 'CAMPAIGN_BATTLE_RESULT': _clientHandleBattleResult(data); return;
        case 'CAMPAIGN_INCOME_NOTICE':
            // Non più usato: l'host procede direttamente senza schermata rendite.
            // Gestito come SYNC per retrocompatibilità con versioni precedenti.
            if (data.campaignSnap) {
                const incomingSeq = data.campaignSnap.seq || 0;
                if (incomingSeq >= (campaignSeq || 0)) {
                    campaignSeq = incomingSeq;
                    _applySnapshot(data.campaignSnap);
                }
            }
            _prepareMapDOM();
            renderCampaignMap();
            return;
        case 'CAMPAIGN_OPEN_CREDIT_SELECTOR': _clientOpenCreditSelector(data); return;
        case 'CAMPAIGN_CONFLICT_SUMMARY': // Nuova logica per mostrare il Riepilogo al client
            if (data.campaignSnap) {
                const incomingSeq = data.campaignSnap.seq || 0;
                if (incomingSeq >= (campaignSeq || 0)) {
                    campaignSeq = incomingSeq;
                    _applySnapshot(data.campaignSnap);
                }
            }
            if (typeof _showConflictSummary === 'function') _showConflictSummary();
            return;
        case 'CP_HOST_ID_NOTICE':
            if (data.hostPeerId) sessionStorage.setItem('RICONNETTITI', data.hostPeerId);
            return;
    }
    if (_mp_origHandleClientData) _mp_origHandleClientData(data);
};

// ============================================================
// HOOK RETE: setupHostConnection — invia snapshot al client appena connesso
// ============================================================

const _mp_origSetupHostConn = window.setupHostConnection;
window.setupHostConnection = function(c, playerNum) {
    if (_mp_origSetupHostConn) _mp_origSetupHostConn(c, playerNum);
    if (isCampaignOnline && isHost && campaignState.isActive) {
        setTimeout(() => {
            if (c.open) {
                try { c.send({ type: 'CAMPAIGN_STATE_SYNC', state: _net_buildSnapshot() }); } catch(e) {}
            }
        }, 600);
    }
};

// ============================================================
// AVVIO CAMPAGNA ONLINE
// ============================================================

function startOnlineCampaign(numPlayers) {
    if (!isOnline || !isHost) { alert('Solo l\'Host può avviare la campagna online!'); return; }
    isCampaignOnline  = true;
    campaignMyFaction = myPlayerNumber; // = 1
    const initOv = document.getElementById('cn-campaign-init-overlay');
    if (initOv) initOv.remove();
    startCampaign(numPlayers || onlineTotalPlayers);
}
window.startOnlineCampaign = startOnlineCampaign;

// ============================================================
// LATO HOST: gestione azioni ricevute dai client
// ============================================================

function _hostHandleAction(data, fromPlayer) {
    if (!isOnline || !isHost || !campaignState.isActive) return;
    const { action, payload } = data;

    // Solo il giocatore di turno può agire in PLANNING
    // (CONFIRM_ORDER e SKIP_TURN sono tolleranti al lag: vedi _hostApplyConfirm)
    const turnIndependent = (action === 'CONFIRM_ORDER' || action === 'SKIP_TURN');
    if (campaignState.phase === 'PLANNING' && !turnIndependent) {
        if (fromPlayer !== campaignState.currentPlayer) {
            _hostSendStateTo(fromPlayer); return;
        }
    }

    switch (action) {
        case 'SYNC_REQUEST':
            _hostSendStateTo(fromPlayer);
            return;

        case 'SECTOR_CLICK':
            _hostValidateAndOpenSelector(payload.sectorId, fromPlayer);
            return; // risponde solo al mittente, no broadcast

        case 'CONFIRM_CREDIT_ORDER':
            _hostApplyOrderWithCredits(payload.sectorId, payload.credits, fromPlayer);
            _doHostBroadcast();
            return;

        case 'CONFIRM_ORDER':
            _hostApplyConfirm(fromPlayer);
            return; // _hostApplyConfirm gestisce il broadcast

        case 'SKIP_TURN':
            _hostApplySkip(fromPlayer);
            return;

        case 'CANCEL_ORDER':
            _cancelOrder(fromPlayer, payload.sectorId);
            _doHostBroadcast();
            return;

        case 'ADD_SECTOR_CREDIT':
            allocSectorCredit(payload.sectorId, +1, fromPlayer);
            return;

        case 'REMOVE_SECTOR_CREDIT':
            allocSectorCredit(payload.sectorId, -1, fromPlayer);
            return;

        case 'SABOTAGE':
            _hostApplySabotage(payload.sectorId, fromPlayer);
            _doHostBroadcast();
            return;

        case 'SECTOR_UPGRADE':
            _hostApplyUpgrade(payload.sectorId, payload.upgradeKey, payload.cost, fromPlayer);
            _doHostBroadcast();
            return;
            
        case 'SECTOR_UPGRADE_PANEL':
            // Opzionale: rimanda lo stato al client per sicurezza prima che apra il pannello
            _hostSendStateTo(fromPlayer);
            return;

        default:
            console.warn('[Net] Azione campagna sconosciuta:', action);
    }
}


function _hostApplyUpgrade(sectorId, upgradeKey, cost, fromPlayer) {
    const sector = campaignState.sectors[sectorId];
    const avail = campaignState.credits[fromPlayer] || 0;
    if (!sector || sector.owner !== fromPlayer || avail < cost) return;

    campaignState.credits[fromPlayer] -= cost;
    if (upgradeKey === 'mine') { sector.mineUpgrade = true; sector.income += 1; }
    if (upgradeKey === 'minefield') { sector.mineField = true; }
    if (upgradeKey === 'fortress') { sector.fortressUpgrade = true; }
}

// ── Validazione click settore lato host ──────────────────────

function _hostValidateAndOpenSelector(targetId, fromPlayer) {
    const target = campaignState.sectors[targetId];
    if (!target || target.blocked) return;
    if (target.owner === fromPlayer) { _hostSendStateTo(fromPlayer); return; }
    if (!_isSectorReachable(targetId, fromPlayer)) { _hostSendStateTo(fromPlayer); return; }

    // Toggle ordine già presente
    const orders   = campaignState.pendingOrders[fromPlayer] || [];
    const existing = orders.find(o => o.sectorId === targetId);
    if (existing) {
        campaignState.credits[fromPlayer] += existing.credits;
        campaignState.pendingOrders[fromPlayer] = orders.filter(o => o.sectorId !== targetId);
        delete campaignState.pendingMoves[fromPlayer];
        if (campaignState._allOrderedSectors?.[targetId])
            campaignState._allOrderedSectors[targetId] = campaignState._allOrderedSectors[targetId].filter(p => p !== fromPlayer);
        _doHostBroadcast();
        return;
    }

    const defCredits = target.owner > 0 ? (campaignState.sectorCredits[targetId]?.[target.owner] || 0) : 0;
    const hasExp     = campaignState.sectors.some(s => s.owner === fromPlayer && s.specialization === 'ESPLOSIONE');
    const canSabotage = hasExp && target.owner > 0 && target.owner !== fromPlayer && defCredits > 0 && (campaignState.credits[fromPlayer] || 0) >= 30;

    const msg = {
        type:           'CAMPAIGN_OPEN_CREDIT_SELECTOR',
        sectorId:       targetId,
        sectorOwner:    target.owner,
        defCredits,
        canSabotage,
        availCredits:   campaignState.credits[fromPlayer] || 0,
        specialization: target.specialization || null,
    };
    const conn = clientConns[fromPlayer];
    if (conn?.open) { try { conn.send(msg); } catch(e) {} }
}

function _hostApplyOrderWithCredits(sectorId, credits, fromPlayer) {
    const avail = campaignState.credits[fromPlayer] || 0;
    if (credits > avail) return;
    _applyOrderWithCredits(sectorId, credits, fromPlayer);
}

function _hostApplyConfirm(fromPlayer) {
    if (campaignState.currentPlayer !== fromPlayer) {
        // Conferma in ritardo da rete lenta: invia snapshot per sbloccare il client
        _hostSendStateTo(fromPlayer);
        return;
    }
    // Avanza il turno
    const n = campaignState.numPlayers;
    let next = campaignState.currentPlayer + 1;
    while (next <= n && !campaignState.sectors.some(s => s.owner === next)) next++;

    if (next > n) {
        processConflicts(); // processConflicts chiama già _net_hostBroadcast internamente
    } else {
        campaignState.currentPlayer = next;
        _doHostBroadcast();
    }
}

function _hostApplySkip(fromPlayer) {
    (campaignState.pendingOrders[fromPlayer] || []).forEach(o => {
        campaignState.credits[fromPlayer] = (campaignState.credits[fromPlayer] || 0) + o.credits;
    });
    campaignState.pendingOrders[fromPlayer] = [];
    delete campaignState.pendingMoves[fromPlayer];
    _hostApplyConfirm(fromPlayer);
}

function _hostApplySabotage(targetSectorId, fromPlayer) {
    const hasExp  = campaignState.sectors.some(s => s.owner === fromPlayer && s.specialization === 'ESPLOSIONE');
    const target  = campaignState.sectors[targetSectorId];
    if (!hasExp || !target || target.owner === fromPlayer || target.owner <= 0) return;
    if ((campaignState.credits[fromPlayer] || 0) < 30) return;
    const defCr = campaignState.sectorCredits[targetSectorId]?.[target.owner] || 0;
    if (defCr <= 0) return;
    campaignState.credits[fromPlayer] -= 30;
    if (!campaignState.sectorCredits[targetSectorId]) campaignState.sectorCredits[targetSectorId] = {};
    campaignState.sectorCredits[targetSectorId][target.owner] = 0;
}

// ============================================================
// LATO CLIENT: gestione messaggi ricevuti dall'host
// ============================================================

function _clientHandleStateSync(data) {
    isCampaignOnline  = true;
    campaignMyFaction = myPlayerNumber;
    if (!data.state) return;

    if ((data.state.seq || 0) < (campaignSeq || 0)) return;
    campaignSeq = data.state.seq || 0;
    _applySnapshot(data.state);

    // FIX: Rimuovi overlay vecchi o temporanei
    ['cn-campaign-init-overlay','cn-order-sent-overlay','campaign-summary-overlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });

    _prepareMapDOM();
    renderCampaignMap();
    _fixConfirmButton();
}

function _clientHandleBattleStart(data) {
    console.log("[Net-Client] Inizio Battaglia nel settore:", data.sectorId);
    
    fullResetForBattle();

    // 1. PULIZIA TOTALE UI CAMPAGNA
    const overlaysToRemove = [
        'cn-income-overlay', 'eco-income-overlay', 'cn-result-overlay', 
        'eco-credit-modal', 'cn-order-sent-overlay', 'campaign-summary-overlay'
    ];
    overlaysToRemove.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
    
    const summary = document.querySelector('.campaign-summary-overlay');
    if (summary) summary.remove();

    _removeTurnBadge();

    // 2. AGGIORNAMENTO STATO
    if (data.campaignSnap) {
        campaignSeq = data.campaignSnap.seq || 0;
        _applySnapshot(data.campaignSnap);
    }

    const isParticipant = data.factions.includes(window.myPlayerNumber);

    // 3. CAMBIO STATO GIOCO
    const campOverlay = document.getElementById('campaign-overlay');
    if (campOverlay) campOverlay.style.display = 'none';

    // ==========================================
    // FIX CRITICO: Pulizia profonda dei giocatori sul Client
    // ==========================================
    window.totalPlayers = campaignState.numPlayers || 4;
    if (typeof resetPlayers === 'function') resetPlayers();

    const battle = campaignState._currentBattle;
    for (let p = 1; p <= window.totalPlayers; p++) {
        if (players[p]) {
            players[p].isDisconnected = !data.factions.includes(p);
            if (data.factions.includes(p)) {
                const bc = battle?.battleCredits?.[p];
                players[p].credits = bc !== undefined ? bc : (campaignState.credits[p] ?? 10);
            }
        }
    }
    // ==========================================
    
    if (isParticipant) {
        window.state = 'SETUP_P1';
        window.currentPlayer = window.myPlayerNumber;
        
        const setupOv = document.getElementById('setup-overlay');
        if (setupOv) setupOv.style.display = 'flex';
        
        if (typeof _restoreSetupBox === 'function') _restoreSetupBox();
        setupData = freshSetupData();
        if (typeof updateSetupUI === 'function') updateSetupUI();
    } else {
        // Overlay Spettatore
        let specOv = document.getElementById('cn-spectate-overlay');
        if (!specOv) {
            specOv = document.createElement('div');
            specOv.id = 'cn-spectate-overlay';
            specOv.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:monospace;`;
            document.body.appendChild(specOv);
        }
        specOv.style.display = 'flex';
        specOv.innerHTML = `<h2>⚔️ BATTAGLIA IN CORSO</h2><p style="color:#aaa">Settore ${data.sectorId} - In attesa dei risultati...</p>`;
    }
}


function _clientHandleBattleResult(data) {
    isCampaignOnline  = true;
    campaignMyFaction = myPlayerNumber;

    if (data.campaignSnap) {
        const incomingSeq = data.campaignSnap.seq || 0;
        if (incomingSeq >= (campaignSeq || 0)) {
            campaignSeq = incomingSeq;
            _applySnapshot(data.campaignSnap);
        }
    }

    // Nascondi interfacce di battaglia e attesa
    ['cn-spectate-overlay','cn-waiting-overlay','gameover-overlay', 'setup-overlay', 'controls-panel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Pulizia immediata della mappa della battaglia
    if (typeof grid !== 'undefined' && grid.clear) grid.clear();
    if (typeof controlPoints !== 'undefined' && controlPoints.clear) controlPoints.clear();
    if (typeof ctx !== 'undefined' && typeof canvas !== 'undefined') ctx.clearRect(0, 0, canvas.width, canvas.height);
    window.state = 'CAMPAIGN_MAP';

    _clientShowBattleResults(data.winnerFaction, data.sectorId, data.results);
}


// ============================================================
// AVVIO BATTAGLIA CAMPAGNA (host online)
// ============================================================

function _hostRunNextBattle() {
    if (!window.isCampaignOnline || !window.isHost) return;

    if (campaignState.battleQueue.length === 0) {
        startNextPlanningRound();
        return;
    }

    const battle = campaignState.battleQueue.shift();
    fullResetForBattle();
    campaignState._currentBattle = battle;
    campaignState.targetSector = battle.sectorId;
    campaignState.phase = 'BATTLE';
    campaignState.currentBattleParticipants = battle.factions.slice().sort((a, b) => a - b);

    // Reset buffer per la nuova battaglia
    playersReady = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false };
    clientSetupBuffer = {};

    const snap = _net_buildSnapshot();

    // Broadcast ai client PRIMA di cambiare lo stato locale dell'host
    broadcastToClients({
        type: 'CAMPAIGN_BATTLE_START',
        sectorId: battle.sectorId,
        factions: battle.factions,
        campaignSnap: snap
    });

    // L'Host entra in setup
    setTimeout(() => {
        _removeTurnBadge();
        const overlay = document.getElementById('campaign-overlay');
        if (overlay) overlay.style.display = 'none';

        // ==========================================
        // FIX CRITICO: Pulizia profonda dei giocatori per l'Host
        // ==========================================
        window.totalPlayers = campaignState.numPlayers || 4;
        if (typeof resetPlayers === 'function') resetPlayers();

        for (let p = 1; p <= window.totalPlayers; p++) {
            if (players[p]) {
                players[p].isDisconnected = !battle.factions.includes(p);
                if (battle.factions.includes(p)) {
                    const bc = battle?.battleCredits?.[p];
                    players[p].credits = bc !== undefined ? bc : (campaignState.credits[p] ?? 10);
                }
            }
        }
        // ==========================================

        if (battle.factions.includes(window.myPlayerNumber)) {
            window.state = 'SETUP_P1';
            window.currentPlayer = window.myPlayerNumber; // Garantisce il setup corretto per l'Host
            const setupOv = document.getElementById('setup-overlay');
            if (setupOv) setupOv.style.display = 'flex';
            
            if (typeof _restoreSetupBox === 'function') _restoreSetupBox();
            setupData = freshSetupData();
            if (typeof updateSetupUI === 'function') updateSetupUI();
        } else {
            _tryBattleStart();
        }
    }, 200);
}
window._hostRunNextBattle = _hostRunNextBattle;

// ============================================================
// _tryBattleStart — attende che tutti i partecipanti siano pronti
// ============================================================

function _tryBattleStart() {
    if (!isOnline || !isHost) return;
    const participants = campaignState.currentBattleParticipants || [];
    if (participants.length === 0) return;
    for (const p of participants) {
        if (!playersReady[p]) return; // qualcuno non è ancora pronto
    }

    // Applica agenti dal buffer
    for (const [p, agents] of Object.entries(clientSetupBuffer)) {
        players[parseInt(p)].agents = agents;
    }

    generateProceduralMap();
    const startingPlayer = participants[0];

    const walls = [], terrains = [];
    grid.forEach(cell => {
        if (cell.type === 'wall' || cell.type === 'barricade')
            walls.push({ q:cell.q,r:cell.r,type:cell.type,hp:cell.hp,maxHp:cell.maxHp,sprite:cell.sprite,customSpriteId:cell.customSpriteId });
        if (cell.terrain)
            terrains.push({ q:cell.q,r:cell.r,terrain:cell.terrain });
    });

    const playersSnapshot = {}, playerCards = {};
    for (let p = 1; p <= 4; p++) {
        playersSnapshot[p] = players[p];
        playerCards[p] = players[p]?.cards || [];
    }

    broadcastToClients({
        type: 'GAME_STATE',
        state: {
            themeId: SELECTED_BG_ID, walls, terrains,
            players: playersSnapshot, totalPlayers: 4,
            startingPlayer, firstPlayerOfGame: startingPlayer,
            onlineAIFactions: Array.from(onlineAIFactions),
            playerCards, controlPoints: Array.from(controlPoints.values()),
        }
    });

    startActiveGameUI(startingPlayer);
    for (let p = 1; p <= 4; p++) {
        const immune = (p !== startingPlayer);
        if (players[p]?.agents) players[p].agents.forEach(a => { a.firstTurnImmune = immune; });
        if (players[p]?.hq)    players[p].hq.firstTurnImmune = immune;
    }

    const specOv = document.getElementById('cn-spectate-overlay');
    if (specOv) specOv.remove();
}

// ============================================================
// UI CLIENT: risultati battaglia, rendita, waiting screen
// ============================================================

function _clientShowBattleResults(winnerFaction, sectorId, results) {
    const participants = campaignState.currentBattleParticipants || [];
    const n            = campaignState.numPlayers;
    const winnerColor  = players[winnerFaction]?.color || COLORS['p' + winnerFaction] || '#ffffff';
    const winnerName   = players[winnerFaction]?.name || 'P' + winnerFaction;

    const creditsHtml = participants.map(faction => {
        const c    = players[faction]?.color || COLORS['p' + faction] || '#ffffff';
        const name = players[faction]?.name || 'P' + faction;
        const r    = results[faction] || { shopResidual: 0, survivorValue: 0, total: 0 };
        const isW  = faction === winnerFaction;
        const dest = isW
            ? `→ 📦 Nel Settore: <b>${campaignState.sectorCredits[sectorId]?.[faction] || 0}</b>`
            : `→ 🏦 Alla Banca: <b>+${r.total}</b>`;
        return `<div style="color:${c}; font-size:15px; margin:10px 0; border-left:3px solid ${c}; padding:5px 12px; background:rgba(255,255,255,0.03); border-radius:0 5px 5px 0;">
            <div style="font-weight:bold; font-size:18px;">${name} ${isW ? '🏆' : '💀'}</div>
            <div style="color:#aaa; font-size:13px; margin:4px 0;">Negozio: ${r.shopResidual} + Agenti vivi: ${r.survivorValue} = <b>${r.total}</b></div>
            <div style="font-size:14px; border-top:1px solid rgba(255,255,255,0.05); padding-top:4px;">${dest}</div>
        </div>`;
    }).join('');

    const ownedHtml = Array.from({ length: n }, (_, i) => i + 1).map(p => {
        const cnt = campaignState.sectors.filter(s => s.owner === p).length;
        const c   = players[p]?.color || COLORS['p' + p] || '#ffffff';
        return `<span style="color:${c}; margin:4px 10px; font-weight:bold; font-size:14px; white-space:nowrap;">${players[p]?.name || 'P'+p}: 🏴${cnt}</span>`;
    }).join('');

    const oldOverlay = document.getElementById('cn-result-overlay');
    if (oldOverlay) oldOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cn-result-overlay';
    overlay.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.94); z-index:99995;
        display:flex; align-items:center; justify-content:center;
        font-family:Courier New,monospace; padding:10px; box-sizing:border-box;`;

    overlay.innerHTML = `
        <div style="background:rgba(10,15,30,0.98); border:3px solid ${winnerColor}; border-radius:15px;
                    padding:20px; width:100%; max-width:580px; max-height:95vh; overflow-y:auto; 
                    box-shadow:0 0 50px rgba(0,0,0,1); box-sizing:border-box; text-align:center;">
            
            <h1 style="color:${winnerColor}; text-shadow:0 0 15px ${winnerColor}; margin:0 0 10px; font-size:clamp(22px, 5vw, 32px); text-transform:uppercase;">⚔️ BATTAGLIA CONCLUSA</h1>
            <h2 style="color:#fff; margin:0 0 20px; font-size:clamp(16px, 4vw, 22px);">VINCITORE: <span style="color:${winnerColor}">${winnerName.toUpperCase()}</span></h2>
            
            <div style="background:rgba(0,0,0,0.3); border:1px solid #333; border-radius:10px; padding:10px; margin-bottom:20px; text-align:left;">
                <p style="color:#888; font-size:11px; margin:0 0 10px; text-transform:uppercase; text-align:center; letter-spacing:1px;">Resoconto Crediti</p>
                ${creditsHtml}
            </div>

            <div style="background:rgba(255,255,255,0.03); border:1px solid #222; border-radius:8px; padding:10px; margin-bottom:25px; display:flex; flex-wrap:wrap; justify-content:center;">
                ${ownedHtml}
            </div>

            <button class="action-btn"
                style="padding:15px; border:3px solid ${winnerColor}; color:${winnerColor}; 
                       background:rgba(0,0,0,0.5); cursor:pointer; font-size:22px; font-weight:bold; width:100%; border-radius:10px;"
                onclick="document.getElementById('cn-result-overlay').remove(); if(typeof _net_clientSend === 'function') _net_clientSend('SYNC_REQUEST', {}); _prepareMapDOM(); renderCampaignMap();">
                AVANTI ▶
            </button>
        </div>`;
    document.body.appendChild(overlay);
}

/** UI selettore crediti lato client (aperto dall'host via CAMPAIGN_OPEN_CREDIT_SELECTOR) */
function _clientOpenCreditSelector(data) {
    const { sectorId, sectorOwner, defCredits, canSabotage, availCredits, specialization } = data;
    const existing = document.getElementById('eco-credit-modal');
    if (existing) existing.remove();

    const minCost = 4;
    const pColor  = players[myPlayerNumber]?.color || COLORS['p' + myPlayerNumber] || '#00ff88';
    const pName   = players[myPlayerNumber]?.name || 'P' + myPlayerNumber;

    const defLine = sectorOwner > 0
        ? `<div style="color:#aaa;font-size:22px;margin-top:12px;">Difensore: 🏦 ${defCredits} crediti allocati</div>`
        : `<div style="color:#888;font-size:22px;margin-top:12px;">Settore Neutro</div>`;
    const specData = specialization ? SECTOR_SPECIALIZATIONS.find(s => s.id === specialization) : null;
    const specLine = specData ? `<div style="color:#FFD700;font-size:20px;margin-top:10px;">${specData.label} — ${specData.desc}</div>` : '';
    const sabHtml  = canSabotage
        ? `<button class="action-btn" id="eco-sabotage-btn"
               style="border:3px solid #ff4444;color:#ff4444;padding:20px 35px;font-size:26px;
                      font-weight:bold;background:rgba(255,0,0,0.1);cursor:pointer;">
               SABOTAGGIO 💥 (30💰)
           </button>` : '';

    const modal = document.createElement('div');
    modal.id = 'eco-credit-modal';
    modal.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.92); z-index:999999;
        display:flex; align-items:center; justify-content:center; font-family:Courier New; padding:10px; box-sizing:border-box;`;
    
    modal.innerHTML = `
        <div style="background:rgba(5,10,20,0.98); border:4px solid ${pColor}; border-radius:15px;
                    padding:20px; width:100%; max-width:600px; max-height:95vh; overflow-y:auto; 
                    text-align:center; box-shadow:0 0 40px rgba(0,0,0,1); box-sizing:border-box;">
            
            <h1 style="color:${pColor}; margin:0 0 10px; font-size:clamp(24px, 6vw, 40px); letter-spacing:2px; text-transform:uppercase;">ORDINE ATTACCO</h1>
            <div style="color:#fff; font-size:clamp(16px, 4vw, 24px); margin-bottom:5px; font-weight:bold;">Tu → Settore ${sectorId}</div>
            
            <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; margin:10px 0;">
                ${defLine}
                ${specLine}
            </div>

            <div style="color:#aaa; font-size:18px; margin:15px 0 5px;">
                In Banca: <span style="color:#FFD700; font-weight:bold;">${availCredits}💰</span>
            </div>
            
            <div style="color:#fff; font-size:20px; margin-bottom:10px;">
                Investimento: <br>
                <span id="eco-credit-val" style="color:#00ff88; font-size:48px; font-weight:bold; text-shadow:0 0 15px #00ff88;">${Math.min(minCost, availCredits)}</span>
            </div>

            <input type="range" id="eco-credit-slider"
                min="${Math.min(minCost, availCredits)}" max="${availCredits}" value="${Math.min(minCost, availCredits)}" step="1"
                style="width:100%; height:30px; cursor:pointer; accent-color:${pColor}; margin-bottom:25px;">

            <div style="display:flex; gap:10px; flex-direction:column; align-items:stretch;">
                <button class="action-btn" id="eco-confirm-order"
                    style="border:3px solid ${pColor}; color:${pColor}; padding:15px; font-size:22px; font-weight:bold; background:rgba(0,0,0,0.5); cursor:pointer; border-radius:8px;">
                    INVIA ORDINE ✓
                </button>
                ${sabHtml}
                <button class="action-btn"
                    style="border:2px solid #666; color:#888; padding:10px; font-size:18px; background:transparent; cursor:pointer; border-radius:8px;"
                    onclick="document.getElementById('eco-credit-modal').remove();">
                    ANNULLA
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const slider  = modal.querySelector('#eco-credit-slider');
    const valDisp = modal.querySelector('#eco-credit-val');
    if (availCredits < minCost) {
        valDisp.style.color = '#ff4444';
        const cb = modal.querySelector('#eco-confirm-order');
        cb.disabled = true; cb.style.opacity = '0.3'; cb.style.cursor = 'not-allowed';
    }
    slider.oninput = () => { valDisp.textContent = slider.value; };
    modal.querySelector('#eco-confirm-order').onclick = () => {
        const chosen = parseInt(slider.value);
        modal.remove();
        _net_clientSend('CONFIRM_CREDIT_ORDER', { sectorId, credits: chosen });
    };
    if (canSabotage) {
        modal.querySelector('#eco-sabotage-btn').onclick = () => {
            if (confirm(`SABOTAGGIO 💥\n\nAzzerare i ${defCredits} crediti nemici nel Settore ${sectorId}.\nCosto: 30 crediti.\nProcedere?`)) {
                modal.remove();
                _net_clientSend('SABOTAGE', { sectorId });
            }
        };
    }
}

// ============================================================
// UTILITY
// ============================================================

function _doHostBroadcast() {
    if (!isOnline || !isHost) return;
    broadcastToClients({ type: 'CAMPAIGN_STATE_SYNC', state: _net_buildSnapshot() });
    // Salva snapshot per persistenza
    if (typeof cpSaveSnapshot === 'function') cpSaveSnapshot();
}

function _hostSendStateTo(playerNum) {
    if (!isOnline || !isHost) return;
    const c = clientConns[playerNum];
    if (c?.open) { try { c.send({ type: 'CAMPAIGN_STATE_SYNC', state: _net_buildSnapshot() }); } catch(e) {} }
}

function _applySnapshot(snap) {
    if (!snap) return;
    campaignState.isActive          = snap.isActive;
    campaignState.numPlayers        = snap.numPlayers;
    campaignState.currentPlayer     = snap.currentPlayer;
    campaignState.credits           = snap.credits || {};
    campaignState.victoryThreshold  = snap.victoryThreshold || 18;
    campaignState.phase             = snap.phase;
    campaignState.turnCount         = snap.turnCount || 1;
    campaignState.pendingMoves      = snap.pendingMoves || {};
    campaignState.pendingOrders     = snap.pendingOrders || {};
    campaignState.sectorCredits     = snap.sectorCredits || {};
    campaignState.pendingAllocation = snap.pendingAllocation || null;
    campaignState._allOrderedSectors = snap._allOrderedSectors || {};
    campaignState._currentBattle   = snap._currentBattle || null;
    campaignState.battleQueue       = snap.battleQueue || [];
    campaignState.currentBattleParticipants = snap.currentBattleParticipants || [];
    campaignState.targetSector      = snap.targetSector;

    if (snap.sectors?.length > 0) {
        const byId = {};
        campaignState.sectors.forEach(s => { byId[s.id] = s; });
        snap.sectors.forEach(ss => {
            const s = byId[ss.id]; if (!s) return;
            s.owner = ss.owner; s.blocked = ss.blocked;
            s.income = ss.income; s.specialization = ss.specialization || null;
            if (ss.x !== undefined) s.x = ss.x;
            if (ss.y !== undefined) s.y = ss.y;
            s.mineUpgrade = ss.mineUpgrade;
            s.mineField = ss.mineField;
            s.fortressUpgrade = ss.fortressUpgrade;
        });
    }

    if (snap.playersMeta && window.players) {
        Object.keys(snap.playersMeta).forEach(p => {
            const pNum = Number(p);
            if (!window.players[pNum]) window.players[pNum] = {};
            if (snap.playersMeta[p].name)  window.players[pNum].name  = snap.playersMeta[p].name;
            if (snap.playersMeta[p].color) window.players[pNum].color = snap.playersMeta[p].color;
            // ---> AGGIUNTO: Salva la fazione estetica <---
            if (snap.playersMeta[p]._cosmeticFaction) window.players[pNum]._cosmeticFaction = snap.playersMeta[p]._cosmeticFaction;
        });
    }
}

function _prepareMapDOM() {
    ['network-menu','setup-overlay','controls-panel',
     'cn-waiting-overlay','cn-spectate-overlay','cn-result-overlay',
     'eco-credit-modal','eco-orders-panel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    let overlay = document.getElementById('campaign-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'campaign-overlay';
        document.body.appendChild(overlay);
    }
    window.state = 'CAMPAIGN_MAP';
}

function _restoreSetupBox() {
    const box = document.getElementById('setup-box');
    if (!box) return;
    if (document.getElementById('setup-title') &&
        document.getElementById('pts-count') &&
        document.getElementById('confirm-setup-btn') &&
        document.getElementById('agents-market')) return;

    box.innerHTML = `
        <div id="setup-header">
            <h1 id="setup-title" class="text-p1">Fase Setup</h1>
            <div id="setup-points-display">
                Punti Rimasti: <span id="pts-count" style="font-weight:bold;font-size:1.4em">10</span>
            </div>
            <button class="action-btn p1-theme" onclick="addNewAgentToMarket()"
                    style="font-size:12px;padding:10px 20px">
                + Recluta Agente (Costo: 4)
            </button>
        </div>
        <div id="agents-market"></div>
        <div id="card-selection-panel"></div>
        <button class="action-btn p1-theme" id="confirm-setup-btn" onclick="confirmPlayerSetup()"
                style="width:100%;font-size:16px;padding:15px">
            Conferma Operativi
        </button>`;
}

// ── Badge turno ───────────────────────────────────────────────

function _showTurnBadge(type) {
    let badge = document.getElementById('cn-not-your-turn-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'cn-not-your-turn-badge';
        badge.style.cssText = `
            position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
            background:rgba(0,0,0,0.88);border-radius:8px;
            font-family:'Courier New',monospace;font-size:14px;
            padding:10px 24px;z-index:200000;text-align:center;pointer-events:none;min-width:300px;`;
        document.body.appendChild(badge);
    }
    if (type === 'resolving') {
        badge.style.borderColor = '#ff4444'; badge.style.border = '2px solid #ff4444';
        badge.innerHTML = `<span style="color:#ff4444;font-weight:bold;">⚔️ RISOLUZIONE CONFLITTI IN CORSO...</span><br><span style="color:#888;font-size:11px;">L'Host sta processando le battaglie</span>`;
    } else {
        const currP  = campaignState.currentPlayer;
        const pColor  = players[currP]?.color || COLORS['p' + currP] || '#aaa';
        const pName  = players[currP]?.name || 'P' + currP;
        const myColor = players[myPlayerNumber]?.color || COLORS['p' + myPlayerNumber] || '#00ff88';
        const myName  = players[myPlayerNumber]?.name || 'Tu';
        badge.style.border = '2px solid #555';
        badge.innerHTML = `In attesa degli ordini di <span style="color:${pColor};font-weight:bold;">${pName}</span>
            &nbsp;|&nbsp; <span style="color:${myColor};">Sei: ${myName}</span>`;
    }
}

function _removeTurnBadge() {
    const b = document.getElementById('cn-not-your-turn-badge');
    if (b) b.remove();
}

function _lockMap() {
    const sv = document.getElementById('map-sectors');
    if (sv) sv.style.pointerEvents = 'none';
    const actDiv = document.getElementById('campaign-actions');
    if (actDiv) actDiv.style.visibility = 'hidden';
}

function _unlockMap() {
    const sv = document.getElementById('map-sectors');
    if (sv) sv.style.pointerEvents = '';
    const actDiv = document.getElementById('campaign-actions');
    if (actDiv) actDiv.style.visibility = 'visible';
}

function _fixConfirmButton() {
    if (campaignState.currentPlayer !== myPlayerNumber) return;
    const actDiv = document.getElementById('campaign-actions');
    if (!actDiv) return;
    const btn = actDiv.querySelector('.action-btn');
    if (!btn) return;
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
}

// ============================================================
// PERSISTENZA — cpSaveSnapshot viene chiamata da _doHostBroadcast
// ma l'implementazione completa vive in campaign_persist.js
// (che non è cambiato e rimane invariato).
// Qui esponiamo solo _cn_hostBroadcastCampaignState come alias
// per retrocompatibilità con campaign_persist.js.
// ============================================================

window._cn_hostBroadcastCampaignState = _doHostBroadcast;
window._cn_hostRunNextBattle          = _hostRunNextBattle;
window._cn_buildCampaignSnapshot      = _net_buildSnapshot;

console.log('[campaign_multiplayer.js] Caricato.');



markScriptAsLoaded('campaign_multiplayer.js');