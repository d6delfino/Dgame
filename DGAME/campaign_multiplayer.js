/* ============================================================
   campaign_multiplayer.js  —  CAMPAGNA: RETE MULTIPLAYER
   ============================================================
   ARCHITETTURA (Pianificazione Cieca Simultanea)
   ─────────────────────────────────────────────
   Durante la fase PLANNING tutti i giocatori agiscono IN
   PARALLELO senza vedere le mosse altrui.  Solo quando tutti
   hanno premuto CONFERMA ORDINI l'host chiama processConflicts()
   e risolve battaglie/conquiste.

   FLUSSO PRINCIPALE
   ─────────────────
   1. Host avvia campagna → _doHostBroadcast() invia snapshot
      personalizzato a ogni client (ordini altrui nascosti).
   2. Ogni giocatore (host incluso) piazza ordini localmente.
   3. Ogni giocatore preme CONFERMA ORDINI.
      - Client → invia CAMPAIGN_ACTION / CONFIRM_ORDER all'host.
      - Host   → segna se stesso come confermato.
   4. Quando tutti i giocatori attivi hanno confermato,
      l'host chiama processConflicts().
   5. processConflicts() risolve sabotaggi, conquiste, battaglie
      e chiama _net_broadcast(CAMPAIGN_CONFLICT_SUMMARY).
   6. I client vedono il riepilogo e premono AVANTI.
      → inviano SYNC_REQUEST, l'host risponde con CAMPAIGN_STATE_SYNC.
   7. Se ci sono battaglie: _hostRunNextBattle() → CAMPAIGN_BATTLE_START.
   8. Dopo ogni battaglia: CAMPAIGN_BATTLE_RESULT → nuovo round.

   MESSAGGI HOST → CLIENT
     CAMPAIGN_STATE_SYNC        stato campagna (personalizzato per player)
     CAMPAIGN_OPEN_CREDIT_SELECTOR  apri selettore attacco
     CAMPAIGN_OPEN_BONIFICA     apri pannello bonifica
     CAMPAIGN_CONFLICT_SUMMARY  riepilogo round con snapshot
     CAMPAIGN_BATTLE_START      avvia setup battaglia
     CAMPAIGN_BATTLE_RESULT     risultato battaglia con snapshot
     CAMPAIGN_WIN               vittoria campagna

   MESSAGGI CLIENT → HOST  (tutti via CAMPAIGN_ACTION)
     SYNC_REQUEST          richiesta snapshot
     SECTOR_CLICK          click su settore
     CONFIRM_CREDIT_ORDER  conferma ordine attacco con crediti
     CONFIRM_ORDER         conferma fine pianificazione
     SKIP_TURN             conferma senza ordini
     CANCEL_ORDER          annulla un ordine
     ADD_SECTOR_CREDIT     +1 credito su settore
     REMOVE_SECTOR_CREDIT  -1 credito su settore
     SABOTAGE              ordine nuclearizzazione
     SECTOR_UPGRADE        acquisto upgrade settore

   DIPENDE DA: campaign_map.js, campaign_battle.js,
               network_core.js, network_sync.js
   ============================================================ */

// ============================================================
// STATO RETE CAMPAGNA
// ============================================================

window.isCampaignOnline  = false;
window.campaignMyFaction = 0;
window.campaignSeq       = 0;

// Set dei giocatori che hanno già confermato gli ordini questo round.
// Resettato a ogni nuovo round di pianificazione.
let _confirmedPlayers = new Set();

// ============================================================
// IMPLEMENTAZIONE _net_* (stub → funzioni reali)
// ============================================================

/** Broadcast snapshot personalizzato a ogni client */
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
        hostConn.send({
            type:    'CAMPAIGN_ACTION',
            action:  actionType,
            payload: payload || {},
            player:  myPlayerNumber,
        });
    } catch(e) { console.warn('[Net] Errore invio azione:', e); }
};

/** Costruisce snapshot serializzabile. Se forPlayer è fornito,
 *  nasconde gli ordini degli altri durante la fase PLANNING. */
window._net_buildSnapshot = function(forPlayer) {
    if (window.isHost) campaignSeq++;

    const revealAll = (
        !forPlayer ||
        campaignState.phase === 'RESOLVING' ||
        campaignState.phase === 'BATTLE'
    );

    // ── Ordini / mosse / settori ordinati ──
    let filteredOrders, filteredMoves, filteredAllOrdered;

    if (revealAll) {
        filteredOrders      = _deepCopy(campaignState.pendingOrders       || {});
        filteredMoves       = _deepCopy(campaignState.pendingMoves        || {});
        filteredAllOrdered  = _deepCopy(campaignState._allOrderedSectors  || {});
    } else {
        filteredOrders     = {};
        filteredMoves      = {};
        filteredAllOrdered = {};

        if (campaignState.pendingOrders[forPlayer])
            filteredOrders[forPlayer] = _deepCopy(campaignState.pendingOrders[forPlayer]);
        if (campaignState.pendingMoves[forPlayer] !== undefined)
            filteredMoves[forPlayer]  = campaignState.pendingMoves[forPlayer];

        Object.entries(campaignState._allOrderedSectors || {}).forEach(([sid, list]) => {
            const mine = list.filter(pid => pid === forPlayer);
            if (mine.length) filteredAllOrdered[sid] = mine;
        });
    }

    // ── Crediti (crediti propri = live, altrui = snapshot inizio round) ──
    const filteredCredits = {};
    for (let p = 1; p <= campaignState.numPlayers; p++) {
        filteredCredits[p] = (revealAll || p === forPlayer)
            ? campaignState.credits[p]
            : (campaignState._creditsAtRoundStart?.[p] ?? campaignState.credits[p]);
    }

    // ── Crediti settore ──
    const filteredSectorCredits = {};
    Object.entries(campaignState.sectorCredits || {}).forEach(([sid, perPlayer]) => {
        filteredSectorCredits[sid] = {};
        Object.entries(perPlayer || {}).forEach(([pid, val]) => {
            const pNum = parseInt(pid);
            if (revealAll || pNum === forPlayer) {
                filteredSectorCredits[sid][pid] = val;
            } else {
                filteredSectorCredits[sid][pid] =
                    campaignState._sectorCreditsAtRoundStart?.[sid]?.[pNum] || 0;
            }
        });
    });

    // ── Settori (upgrade altrui = snapshot inizio round) ──
    const filteredSectors = campaignState.sectors.map(s => {
        const pre        = campaignState._sectorsAtRoundStart?.[s.id];
        const isMine     = revealAll || s.owner === forPlayer;
        return {
            id: s.id, owner: s.owner, x: s.x, y: s.y,
            blocked: s.blocked, income: s.income,
            specialization: s.specialization || null,
            _nuclearized:             s._nuclearized || false,
            _nuclearCooldown:         s._nuclearCooldown || 0, // FIX CRITICO: Aggiunto l'invio del cooldown
            _mineFieldJustTriggered:  s._mineFieldJustTriggered || false,
            mineUpgrade:     isMine ? s.mineUpgrade     : (pre?.mineUpgrade     ?? s.mineUpgrade),
            mineField:       isMine ? s.mineField       : (pre?.mineField       ?? s.mineField),
            fortressUpgrade: isMine ? s.fortressUpgrade : (pre?.fortressUpgrade ?? s.fortressUpgrade),
        };
    });

    // ── Metadati giocatori ──
    const playersMeta = {};
    for (let p = 1; p <= campaignState.numPlayers; p++) {
        if (window.players?.[p]) {
            playersMeta[p] = {
                name:             players[p].name,
                color:            players[p].color,
                _cosmeticFaction: players[p]._cosmeticFaction,
            };
        }
    }

    return {
        seq:               campaignSeq,
        isActive:          campaignState.isActive,
        numPlayers:        campaignState.numPlayers,
        currentPlayer:     campaignState.currentPlayer,
        credits:           filteredCredits,
        victoryThreshold:  campaignState.victoryThreshold,
        phase:             campaignState.phase,
        turnCount:         campaignState.turnCount || 1,
        pendingMoves:      filteredMoves,
        pendingOrders:     filteredOrders,
        sectorCredits:     filteredSectorCredits,
        _allOrderedSectors: filteredAllOrdered,
        _currentBattle:    campaignState._currentBattle
                               ? _deepCopy(campaignState._currentBattle) : null,
        battleQueue:       _deepCopy(campaignState.battleQueue || []),
        currentBattleParticipants: _deepCopy(campaignState.currentBattleParticipants || []),
        targetSector:      campaignState.targetSector,
        sectors:           filteredSectors,
        _creditsAtRoundStart:       campaignState._creditsAtRoundStart,
        _sectorCreditsAtRoundStart: campaignState._sectorCreditsAtRoundStart,
        _sectorsAtRoundStart:       campaignState._sectorsAtRoundStart,
        playersMeta,
    };
};

/** Aggiorna badge / lock in base allo stato del round */
window._net_applyTurnState = function() {
    if (!isCampaignOnline) return;
    if (campaignState.phase === 'RESOLVING') {
        _showWaitingBadge('resolving');
        return;
    }
    
    // Se il client ha confermato nel round corrente, mantieni l'UI bloccata
    if (typeof window._clientLockedRound !== 'undefined' && window._clientLockedRound === campaignState.turnCount) {
        _net_showOrderSentOverlay(); // Assicura che l'overlay sia visibile
        return; // Esci senza sbloccare i bottoni o togliere i badge
    }

    // In pianificazione simultanea tutti possono sempre agire:
    _removeWaitingBadge();
    _fixConfirmButton();
    _unlockMap();
};

function _unlockMap() {
    const actDiv = document.getElementById('campaign-actions');
    if (actDiv) actDiv.style.visibility = 'visible';
}

/** Overlay "ordine inviato — attendo gli altri" */
window._net_showOrderSentOverlay = function() {
    const existing = document.getElementById('cn-order-sent-overlay');
    if (existing) return;

    const actDiv = document.getElementById('campaign-actions');
    if (actDiv) actDiv.querySelectorAll('button')
        .forEach(b => { b.disabled = true; b.style.opacity = '0.4'; });

    const pColor = players[myPlayerNumber]?.color || '#00ff88';
    const badge  = document.createElement('div');
    badge.id = 'cn-order-sent-overlay';
    badge.style.cssText = `
        position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
        background:rgba(0,0,0,0.92); border:2px solid ${pColor};
        border-radius:10px; padding:16px 32px;
        font-family:'Courier New',monospace; text-align:center;
        z-index:200001; pointer-events:none; min-width:280px;`;
    badge.innerHTML = `
        <div style="color:${pColor};font-weight:bold;font-size:16px;margin-bottom:6px;">
            ✅ ORDINE CONFERMATO</div>
        <div style="color:#aaa;font-size:13px;">
            In attesa degli altri giocatori...</div>`;
    document.body.appendChild(badge);
};

/** Setup battaglia in campagna online */
window._net_handleConfirmSetup = function() {
    if (isHost) {
        playersReady[window.myPlayerNumber]         = true;
        clientSetupBuffer[window.myPlayerNumber]    = players[window.myPlayerNumber].agents;
        document.getElementById('setup-box').innerHTML =
            `<h2 style='color:white;text-align:center'>Pronto!<br>
             <span style='font-size:14px;color:#aaa'>Attendi gli altri giocatori...</span></h2>`;
        _tryBattleStart();
    } else {
        sendOnlineMessage({
            type:    'SETUP_DONE',
            agents:  players[myPlayerNumber].agents,
            cards:   players[myPlayerNumber].cards,
            credits: players[myPlayerNumber].credits,
        });
        document.getElementById('setup-box').innerHTML =
            `<h2 style='color:white;text-align:center'>Setup inviato!<br>
             <span style='font-size:14px;color:#aaa'>Attendi l'Host...</span></h2>`;
    }
};

// ============================================================
// HOOK RETE HOST — messaggi in arrivo dai client
// ============================================================
// Usa registerHostMessageHandler (network_sync.js) invece del
// pattern _mp_orig/override: i tipi registrati qui hanno
// priorità sui built-in, e i tipi non gestiti cascano
// automaticamente sulla logica built-in di network_sync.js.

registerHostMessageHandler('CAMPAIGN_ACTION', function(data, fromPlayer) {
    _hostHandleAction(data, fromPlayer);
});

// Setup battaglia in campagna: intercetta SETUP_DONE solo
// quando la campagna è attiva, altrimenti network_sync.js
// lo gestisce normalmente (partite singole).
registerHostMessageHandler('SETUP_DONE', function(data, fromPlayer) {
    if (isCampaignOnline && isHost && campaignState.isActive) {
        clientSetupBuffer[fromPlayer] = data.agents;
        playersReady[fromPlayer]      = true;
        if (data.cards)                players[fromPlayer].cards    = data.cards;
        if (data.credits !== undefined) players[fromPlayer].credits = data.credits;
        players[fromPlayer].usedCards = {};
        _tryBattleStart();
    } else {
        // Campagna non attiva: delega al built-in di network_sync.js
        // richiamando la logica originale manualmente.
        clientSetupBuffer[fromPlayer] = data.agents;
        playersReady[fromPlayer]      = true;
        if (data.cards) {
            players[fromPlayer].cards     = data.cards;
            players[fromPlayer].usedCards = {};
        }
        if (data.credits !== undefined) players[fromPlayer].credits = data.credits;
        if (data.color)           players[fromPlayer].color            = data.color;
        if (data.name)            players[fromPlayer].name             = data.name;
        if (data.cosmeticFaction) players[fromPlayer]._cosmeticFaction = data.cosmeticFaction;
        tryHostStart();
    }
});

// ============================================================
// HOOK RETE CLIENT — messaggi in arrivo dall'host
// ============================================================
// Usa registerClientMessageHandler (network_sync.js) invece del
// pattern _mp_orig/override. I tipi registrati qui hanno
// priorità sui built-in di network_sync.js.

registerClientMessageHandler('CAMPAIGN_STATE_SYNC',           _clientHandleStateSync);
registerClientMessageHandler('CAMPAIGN_OPEN_CREDIT_SELECTOR', _clientOpenCreditSelector);
registerClientMessageHandler('CAMPAIGN_OPEN_BONIFICA',        _clientOpenBonifica);
registerClientMessageHandler('CAMPAIGN_CONFLICT_SUMMARY',     _clientHandleConflictSummary);
registerClientMessageHandler('CAMPAIGN_BATTLE_START',         _clientHandleBattleStart);
registerClientMessageHandler('CAMPAIGN_BATTLE_RESULT',        _clientHandleBattleResult);
registerClientMessageHandler('CAMPAIGN_WIN', function(data) {
    if (typeof _showCampaignWinUI === 'function') _showCampaignWinUI(data.winner);
});
registerClientMessageHandler('CP_HOST_ID_NOTICE', function(data) {
    if (data.hostPeerId) sessionStorage.setItem('RICONNETTITI', data.hostPeerId);
});

// ============================================================
// HOOK: snapshot al client appena connesso
// ============================================================
// Questo non riguarda un tipo di messaggio ma l'evento di
// connessione: non può usare registerHostMessageHandler.
// Manteniamo il pattern _mp_orig solo qui, che è l'unico
// caso dove serve davvero agganciare un evento di connessione
// anziché un tipo di messaggio.

const _mp_origSetupHostConn = window.setupHostConnection;
window.setupHostConnection = function(c, playerNum) {
    if (_mp_origSetupHostConn) _mp_origSetupHostConn(c, playerNum);
    if (isCampaignOnline && isHost && campaignState.isActive) {
        setTimeout(() => {
            if (c.open) {
                try {
                    c.send({ type: 'CAMPAIGN_STATE_SYNC', state: _net_buildSnapshot(playerNum) });
                } catch(e) {}
            }
        }, 600);
    }
};

// ============================================================
// AVVIO CAMPAGNA ONLINE
// ============================================================

function startOnlineCampaign(numPlayers) {
    if (!isOnline || !isHost) {
        alert("Solo l'Host può avviare la campagna online!");
        return;
    }

    const save = typeof getCampaignSave === 'function' ? getCampaignSave() : null;

    const _launch = (fresh) => {
        if (fresh && save) clearCampaignSave();
        isCampaignOnline  = true;
        campaignMyFaction = myPlayerNumber;
        document.getElementById('cn-campaign-init-overlay')?.remove();
        if (!fresh && save) {
            loadCampaignSnapshot(save);
            setTimeout(() => _doHostBroadcast(), 300);
        } else {
            startCampaign(numPlayers || onlineTotalPlayers);
        }
    };

    if (save) {
        const existing = document.getElementById('cn-save-choice-modal');
        if (existing) { existing.remove(); return; }

        const d       = new Date(save.savedAt);
        const dateStr = d.toLocaleDateString('it-IT') + ' ' +
                        d.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' });

        const modal = document.createElement('div');
        modal.id = 'cn-save-choice-modal';
        modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,0.95);z-index:999999;
            display:flex;align-items:center;justify-content:center;
            font-family:'Courier New',monospace;padding:16px;box-sizing:border-box;`;
        modal.innerHTML = `
            <div style="background:rgba(5,10,20,0.98);border:3px solid #FFD700;border-radius:12px;
                        padding:28px;max-width:480px;width:100%;text-align:center;">
                <h2 style="color:#FFD700;margin:0 0 8px;">💾 CAMPAGNA IN CORSO</h2>
                <p style="color:#aaa;font-size:13px;margin:0 0 24px;">
                    Round ${save.turnCount} — Salvata il ${dateStr}</p>
                <div style="display:flex;flex-direction:column;gap:12px;">
                    <button id="cn-btn-resume" class="action-btn"
                        style="border:2px solid #FFD700;color:#FFD700;background:transparent;
                               padding:14px;font-size:16px;cursor:pointer;">
                        ▶ RIPRENDI CAMPAGNA
                    </button>
                    <button id="cn-btn-new" class="action-btn"
                        style="border:2px solid #ff4444;color:#ff4444;background:transparent;
                               padding:12px;font-size:14px;cursor:pointer;">
                        🗑️ NUOVA CAMPAGNA (cancella salvataggio)
                    </button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.querySelector('#cn-btn-resume').onclick = () => { modal.remove(); _launch(false); };
        modal.querySelector('#cn-btn-new').onclick    = () => {
            if (!confirm(`Avviare una nuova campagna cancellerà il salvataggio (Round ${save.turnCount}). Procedere?`)) return;
            modal.remove();
            _launch(true);
        };
    } else {
        _launch(true);
    }
}
window.startOnlineCampaign = startOnlineCampaign;

// ============================================================
// HOST: gestione azioni ricevute dai client
// ============================================================

function _hostHandleAction(data, fromPlayer) {
    if (!isOnline || !isHost || !campaignState.isActive) return;
    const { action, payload } = data;

    switch (action) {

        case 'SYNC_REQUEST':
            _hostSendStateTo(fromPlayer);
            return;

        case 'SECTOR_CLICK':
            _hostValidateAndOpenSelector(payload.sectorId, fromPlayer);
            return;

        case 'CONFIRM_CREDIT_ORDER':
            _hostApplyOrderWithCredits(payload.sectorId, payload.credits, fromPlayer);
            _hostSendStateTo(fromPlayer);
            return;

        case 'CONFIRM_ORDER':
        case 'SKIP_TURN':
            _hostApplyConfirm(fromPlayer, action === 'SKIP_TURN');
            return;

        case 'CANCEL_ORDER':
            _cancelOrder(fromPlayer, payload.sectorId);
            _hostSendStateTo(fromPlayer);
            return;

        case 'ADD_SECTOR_CREDIT':
            allocSectorCredit(payload.sectorId, +1, fromPlayer);
            _hostSendStateTo(fromPlayer);
            return;

        case 'REMOVE_SECTOR_CREDIT':
            allocSectorCredit(payload.sectorId, -1, fromPlayer);
            _hostSendStateTo(fromPlayer);
            return;

        case 'SABOTAGE':
            _hostApplySabotage(payload.sectorId, fromPlayer);
            _hostSendStateTo(fromPlayer);
            return;

        case 'SECTOR_UPGRADE':
            _hostApplyUpgrade(payload.sectorId, payload.upgradeKey, payload.cost, fromPlayer);
            _hostSendStateTo(fromPlayer);
            return;

        default:
            console.warn('[Net] Azione campagna sconosciuta:', action);
    }
}

// ── CONFIRMA / SKIP ──────────────────────────────────────────

/**
 * Registra la conferma di un giocatore.
 * Quando TUTTI i giocatori attivi hanno confermato, risolve i conflitti.
 * Nessuna modifica al turno durante la fase di pianificazione:
 * tutti pianificano in parallelo.
 */
function _hostApplyConfirm(fromPlayer, isSkip) {
    if (isSkip) {
        // Usa la logica centralizzata (definita in campaign_map.js) per rimborsare
        const orders = campaignState.pendingOrders[fromPlayer] || [];
        if (typeof _eco_refundOrders === 'function') {
            _eco_refundOrders(fromPlayer, orders);
        } else {
            // Fallback di sicurezza se il file non fosse ancora caricato
            orders.forEach(o => {
                campaignState.credits[fromPlayer] += (o.isSabotage ? (o.sabotageCost || 0) : (o.credits || 0));
            });
        }
        
        campaignState.pendingOrders[fromPlayer] = [];
        delete campaignState.pendingMoves[fromPlayer];
    }

    _confirmedPlayers.add(fromPlayer);

    if (_allPlayersConfirmed()) {
        document.getElementById('cn-order-sent-overlay')?.remove();
        processConflicts();
    } else {
        _hostSendStateTo(fromPlayer);
    }
}

/** Anche l'host deve confermare; viene chiamato da finishPlayerTurn() */
function _hostSelfConfirm() {
    _confirmedPlayers.add(myPlayerNumber);
    if (_allPlayersConfirmed()) {
        // PULIZIA UI HOST: Rimuove l'overlay se l'host è l'ultimo a confermare
        document.getElementById('cn-order-sent-overlay')?.remove();
        processConflicts();
    }
    // Se non tutti hanno confermato, _net_showOrderSentOverlay già mostra l'attesa
}

/** Ritorna true se tutti i giocatori con almeno un settore hanno confermato */
function _allPlayersConfirmed() {
    for (let p = 1; p <= campaignState.numPlayers; p++) {
        const isActive = campaignState.sectors.some(s => s.owner === p);
        if (isActive && !_confirmedPlayers.has(p)) return false;
    }
    return true;
}

// ── UPGRADE ──────────────────────────────────────────────────

function _hostApplyUpgrade(sectorId, upgradeKey, cost, fromPlayer) {
    const sector = campaignState.sectors[sectorId];
    if (!sector || (campaignState.credits[fromPlayer] || 0) < cost) return;

    if (upgradeKey === 'bonifica') {
        if (!sector.blocked || sector._nuclearized) return;
        const isAdj = campaignState.adj[sectorId]?.some(
            nbId => campaignState.sectors[nbId]?.owner === fromPlayer
        );
        if (!isAdj) return;
        campaignState.credits[fromPlayer] -= cost;
        sector.blocked = false;
        sector.income  = 1;
        sector.owner   = 0;
        if (!campaignState.sectorCredits[sectorId]) campaignState.sectorCredits[sectorId] = {};
        return;
    }

    if (sector.owner !== fromPlayer) return;
    campaignState.credits[fromPlayer] -= cost;
    if (upgradeKey === 'mine')      { sector.mineUpgrade = true; sector.income += 2; }
    if (upgradeKey === 'minefield') { sector.mineField = true; }
    if (upgradeKey === 'fortress')  { sector.fortressUpgrade = true; }
}

// ── SABOTAGGIO ────────────────────────────────────────────────

function _hostApplySabotage(targetSectorId, fromPlayer) {
    const target = campaignState.sectors[targetSectorId];
    if (!target || target.owner === fromPlayer || target.owner <= 0) return;
    const hasExp  = campaignState.sectors.some(
        s => s.owner === fromPlayer && s.specialization === 'ESPLOSIONE'
    );
    const realCost = hasExp ? (CAMPAIGN.NUCLEARIZE_COST / 2) : CAMPAIGN.NUCLEARIZE_COST;
    if ((campaignState.credits[fromPlayer] || 0) < realCost) return;
    _orderNuclearize(targetSectorId, fromPlayer, realCost);
}

// ── VALIDAZIONE CLICK SETTORE ────────────────────────────────

function _hostValidateAndOpenSelector(targetId, fromPlayer) {
    const target = campaignState.sectors[targetId];
    if (!target) return;

    // Toggle: annulla ordine esistente
    const orders = campaignState.pendingOrders[fromPlayer] || [];
    if (orders.find(o => o.sectorId === targetId)) {
        _cancelOrder(fromPlayer, targetId);
        _hostSendStateTo(fromPlayer);
        return;
    }

    // Settore bloccato
    if (target.blocked) {
        if (target._nuclearized) {
            _hostSendStateTo(fromPlayer);
            return;
        }
        const isAdj = campaignState.adj[targetId]?.some(
            nbId => campaignState.sectors[nbId]?.owner === fromPlayer
        );
        if (!isAdj) { _hostSendStateTo(fromPlayer); return; }

        const conn = clientConns[fromPlayer];
        if (conn?.open) {
            try {
                conn.send({
                    type:         'CAMPAIGN_OPEN_BONIFICA',
                    sectorId:     targetId,
                    availCredits: campaignState.credits[fromPlayer] || 0,
                });
            } catch(e) {}
        }
        return;
    }

    // Settore proprio → upgrade (gestito lato client, l'host non fa nulla)
    if (target.owner === fromPlayer) {
        _hostSendStateTo(fromPlayer);
        return;
    }

    // Verifica raggiungibilità
    if (!_isSectorReachable(targetId, fromPlayer)) {
        _hostSendStateTo(fromPlayer);
        return;
    }

    // Calcola dati per il selettore crediti
    const defCredits  = target.owner > 0
        ? (campaignState.sectorCredits[targetId]?.[target.owner] || 0) : 0;
    const hasExp      = campaignState.sectors.some(
        s => s.owner === fromPlayer && s.specialization === 'ESPLOSIONE'
    );
    const nukeCost    = hasExp ? (CAMPAIGN.NUCLEARIZE_COST / 2) : CAMPAIGN.NUCLEARIZE_COST;
    const canSabotage = _isNukeReachable(targetId, fromPlayer) &&
                    (campaignState.credits[fromPlayer] || 0) >= nukeCost;

    const conn = clientConns[fromPlayer];
    if (conn?.open) {
        try {
            conn.send({
                type:           'CAMPAIGN_OPEN_CREDIT_SELECTOR',
                sectorId:       targetId,
                sectorOwner:    target.owner,
                defCredits,
                canSabotage,
                nukeCost,
                availCredits:   campaignState.credits[fromPlayer] || 0,
                specialization: target.specialization || null,
            });
        } catch(e) {}
    }
}

function _hostApplyOrderWithCredits(sectorId, credits, fromPlayer) {
    const avail = campaignState.credits[fromPlayer] || 0;
    if (credits > avail) return;
    // Evita doppi ordini sullo stesso settore
    const orders = campaignState.pendingOrders[fromPlayer] || [];
    if (orders.find(o => o.sectorId === sectorId)) return;
    _applyOrderWithCredits(sectorId, credits, fromPlayer);
}

// ============================================================
// CLIENT: gestione messaggi ricevuti dall'host
// ============================================================

function _clientHandleStateSync(data) {
    isCampaignOnline  = true;
    campaignMyFaction = myPlayerNumber;
    if (!data.state) return;
    if ((data.state.seq || 0) < (campaignSeq || 0)) return;
    campaignSeq = data.state.seq || 0;
    _applySnapshot(data.state);

    if (typeof window._clientLockedRound === 'undefined') window._clientLockedRound = -1;

    // Se il server è avanzato di round (o è in fase di risoluzione), sblocca il client
    if (campaignState.turnCount > window._clientLockedRound || campaignState.phase !== 'PLANNING') {
        window._clientLockedRound = -1;
    }

    // Se NON siamo bloccati in attesa, rimuoviamo l'overlay di conferma
    if (window._clientLockedRound === -1) {
        ['cn-campaign-init-overlay', 'cn-order-sent-overlay', 'campaign-summary-overlay'].forEach(id => {
            document.getElementById(id)?.remove();
        });
    } else {
        // Rimuove solo gli altri overlay, ma preserva "cn-order-sent-overlay"
        ['cn-campaign-init-overlay', 'campaign-summary-overlay'].forEach(id => {
            document.getElementById(id)?.remove();
        });
    }

    _prepareMapDOM();
    renderCampaignMap();
    
    // Sblocca i bottoni mappa solo se non siamo in attesa
    if (window._clientLockedRound === -1) {
        _fixConfirmButton();
    }
}

function _clientHandleConflictSummary(data) {
    if (data.campaignSnap) {
        const seq = data.campaignSnap.seq || 0;
        if (seq >= (campaignSeq || 0)) {
            campaignSeq = seq;
            _applySnapshot(data.campaignSnap);
        }
    }
    if (typeof _showConflictSummary === 'function') _showConflictSummary();
}

function _clientHandleBattleStart(data) {
    fullResetForBattle();

    if (timerUI) timerUI.style.display = 'none';
    document.getElementById('audio-toggle').style.display    = 'none';
    document.getElementById('legend-toggle-btn').style.display = 'none';

    ['cn-income-overlay','eco-credit-modal','cn-order-sent-overlay',
     'campaign-summary-overlay'].forEach(id => document.getElementById(id)?.remove());
    document.querySelector('.campaign-summary-overlay')?.remove();
    _removeWaitingBadge();

    if (data.campaignSnap) {
        campaignSeq = data.campaignSnap.seq || 0;
        _applySnapshot(data.campaignSnap);
    }

    document.getElementById('campaign-overlay').style.display = 'none';

    // Imposta giocatori
    window.totalPlayers = campaignState.numPlayers || 4;
    resetPlayers();
    const battle = campaignState._currentBattle;
    for (let p = 1; p <= window.totalPlayers; p++) {
        if (!players[p]) continue;
        players[p].isDisconnected = !data.factions.includes(p);
        if (data.factions.includes(p)) {
            const bc = battle?.battleCredits?.[p];
            players[p].credits = bc !== undefined ? bc : (campaignState.credits[p] ?? 10);
        }
    }

    const isParticipant = data.factions.includes(window.myPlayerNumber);

    if (isParticipant) {
        window.state      = 'SETUP_P1';
        window.currentPlayer = window.myPlayerNumber;
        document.getElementById('setup-overlay').style.display = 'flex';
        _restoreSetupBox();
        setupData = freshSetupData();
        updateSetupUI();
    } else {
        // Spettatore
        let specOv = document.getElementById('cn-spectate-overlay');
        if (!specOv) {
            specOv = document.createElement('div');
            specOv.id = 'cn-spectate-overlay';
            specOv.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
                background:rgba(0,0,0,0.9);z-index:99999;
                display:flex;flex-direction:column;align-items:center;justify-content:center;
                color:#fff;font-family:monospace;`;
            document.body.appendChild(specOv);
        }
        specOv.style.display = 'flex';
        specOv.innerHTML = `<h2>⚔️ BATTAGLIA IN CORSO</h2>
            <p style="color:#aaa">Settore ${data.sectorId} — In attesa dei risultati...</p>`;
    }
}

function _clientHandleBattleResult(data) {
    isCampaignOnline  = true;
    campaignMyFaction = myPlayerNumber;

    if (data.campaignSnap) {
        const seq = data.campaignSnap.seq || 0;
        if (seq >= (campaignSeq || 0)) {
            campaignSeq = seq;
            _applySnapshot(data.campaignSnap);
        }
    }

    ['cn-spectate-overlay','cn-waiting-overlay','gameover-overlay',
     'setup-overlay','controls-panel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    grid?.clear();
    controlPoints?.clear();
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    window.state = 'CAMPAIGN_MAP';

    _clientShowBattleResults(data.winnerFaction, data.sectorId, data.results);
}

function _clientOpenBonifica(data) {
    isCampaignOnline  = true;
    campaignMyFaction = myPlayerNumber;
    const prev = campaignState.credits[myPlayerNumber];
    campaignState.credits[myPlayerNumber] = data.availCredits;
    showBonificaPanel(myPlayerNumber, data.sectorId);
    campaignState.credits[myPlayerNumber] = prev;
}

// ============================================================
// HOST: avvio battaglia online
// ============================================================

function _hostRunNextBattle() {
    if (!isCampaignOnline || !isHost) return;

    if (campaignState.battleQueue.length === 0) {
        startNextPlanningRound();
        return;
    }

    const battle = campaignState.battleQueue.shift();
    fullResetForBattle();
    campaignState._currentBattle             = battle;
    campaignState.targetSector               = battle.sectorId;
    campaignState.phase                      = 'BATTLE';
    campaignState.currentBattleParticipants  = battle.factions.slice().sort((a, b) => a - b);

    playersReady      = { 1:false,2:false,3:false,4:false,5:false,6:false,7:false,8:false };
    clientSetupBuffer = {};

    const snap = _net_buildSnapshot();
    broadcastToClients({
        type:         'CAMPAIGN_BATTLE_START',
        sectorId:     battle.sectorId,
        factions:     battle.factions,
        campaignSnap: snap,
    });

    setTimeout(() => {
        _removeWaitingBadge();
        document.getElementById('campaign-overlay').style.display = 'none';

        window.totalPlayers = campaignState.numPlayers || 4;
        resetPlayers();
        for (let p = 1; p <= window.totalPlayers; p++) {
            if (!players[p]) continue;
            players[p].isDisconnected = !battle.factions.includes(p);
            if (battle.factions.includes(p)) {
                const bc = battle?.battleCredits?.[p];
                players[p].credits = bc !== undefined ? bc : (campaignState.credits[p] ?? 10);
            }
        }

        if (battle.factions.includes(window.myPlayerNumber)) {
            window.state      = 'SETUP_P1';
            window.currentPlayer = window.myPlayerNumber;
            document.getElementById('setup-overlay').style.display = 'flex';
            _restoreSetupBox();
            setupData = freshSetupData();
            updateSetupUI();
        } else {
            _tryBattleStart();
        }
    }, 200);
}
window._hostRunNextBattle = _hostRunNextBattle;

// ── Avvio battaglia quando tutti i partecipanti sono pronti ──

function _tryBattleStart() {
    if (!isOnline || !isHost) return;
    const participants = campaignState.currentBattleParticipants || [];
    if (!participants.length) return;
    for (const p of participants) {
        if (!playersReady[p]) return;
    }

    // Applica agenti dal buffer di setup
    for (const [p, agents] of Object.entries(clientSetupBuffer)) {
        players[parseInt(p)].agents = agents;
    }

    generateProceduralMap();
    const startingPlayer = participants[Math.floor(Math.random() * participants.length)];

    const walls = [], terrains = [];
    grid.forEach(cell => {
        if (cell.type === 'wall' || cell.type === 'barricade')
            walls.push({ q:cell.q, r:cell.r, type:cell.type, hp:cell.hp, maxHp:cell.maxHp,
                         sprite:cell.sprite, customSpriteId:cell.customSpriteId });
        if (cell.terrain)
            terrains.push({ q:cell.q, r:cell.r, terrain:cell.terrain });
    });

    // Numero di giocatori effettivo per questa battaglia.
    // Usare 4 hardcoded escludeva P5-P8 in campagne a 5-8 giocatori.
    const n = campaignState.numPlayers || totalPlayers;

    const playersSnapshot = {};
    for (let p = 1; p <= n; p++) playersSnapshot[p] = players[p];

    broadcastToClients({
        type:  'GAME_STATE',
        state: {
            themeId: SELECTED_BG_ID, walls, terrains,
            players: playersSnapshot, totalPlayers: n,
            startingPlayer, firstPlayerOfGame: startingPlayer,
            onlineAIFactions: Array.from(onlineAIFactions),
            playerCards:      Object.fromEntries(
                Array.from({length: n}, (_, i) => i + 1).map(p => [p, players[p]?.cards || []])
            ),
            controlPoints: Array.from(controlPoints.values()),
        },
    });

    startActiveGameUI(startingPlayer);
    for (let p = 1; p <= n; p++) {
        const immune = (p !== startingPlayer);
        if (players[p]?.agents) players[p].agents.forEach(a => { a.firstTurnImmune = immune; });
        if (players[p]?.hq)    players[p].hq.firstTurnImmune = immune;
    }
    document.getElementById('cn-spectate-overlay')?.remove();
}

// ============================================================
// INTEGRAZIONE finishPlayerTurn per modalità online
// ============================================================
// campaign_map.js chiama finishPlayerTurn() che in locale
// chiama _advanceTurn(). In online l'host non fa avanzare il
// turno: segna sé stesso come confermato e aspetta gli altri.

const _mp_origFinishPlayerTurn = window.finishPlayerTurn;
window.finishPlayerTurn = function() {
    if (!isCampaignOnline) {
        if (_mp_origFinishPlayerTurn) _mp_origFinishPlayerTurn();
        return;
    }

    const p = myPlayerNumber;  

    document.getElementById('eco-orders-panel')?.remove();

    if (!isHost) {
        // CLIENT: Memorizza che per questo round abbiamo confermato gli ordini
        window._clientLockedRound = campaignState.turnCount;

        const hasOrders = (campaignState.pendingOrders?.[p] || []).length > 0;
        _net_clientSend(hasOrders ? 'CONFIRM_ORDER' : 'SKIP_TURN', {});
        _net_showOrderSentOverlay();
    } else {
        const orders = campaignState.pendingOrders[p] || [];
        if (orders.length > 0) campaignState.pendingMoves[p] = orders[0].sectorId;
        _net_showOrderSentOverlay();
        _hostSelfConfirm();
    }
};

// Resetta i confermati a ogni nuovo round di pianificazione
const _mp_origDoStartNextPlanningRound = window._doStartNextPlanningRound;
window._doStartNextPlanningRound = function() {
    _confirmedPlayers = new Set();
    
    // PULIZIA UI HOST: Sicurezza extra all'inizio di ogni nuovo round
    document.getElementById('cn-order-sent-overlay')?.remove();
    
    if (_mp_origDoStartNextPlanningRound) _mp_origDoStartNextPlanningRound();
};

// ============================================================
// UI CLIENT: risultati battaglia
// ============================================================

function _clientShowBattleResults(winnerFaction, sectorId, results) {
    const participants = campaignState.currentBattleParticipants || [];
    const n            = campaignState.numPlayers;
    const winnerColor  = players[winnerFaction]?.color || COLORS['p' + winnerFaction] || '#ffffff';
    const winnerName   = players[winnerFaction]?.name  || 'P' + winnerFaction;

    const creditsHtml = participants.map(faction => {
        const c    = players[faction]?.color || COLORS['p' + faction] || '#ffffff';
        const name = players[faction]?.name  || 'P' + faction;
        const r    = results[faction] || { shopResidual:0, survivorValue:0, total:0 };
        const isW  = faction === winnerFaction;
        const dest = isW
            ? `→ 📦 Nel Settore: <b>${campaignState.sectorCredits[sectorId]?.[faction] || 0}</b>`
            : `→ 🏦 Alla Banca: <b>+${r.total}</b>`;
        return `
        <div style="color:${c};font-size:15px;margin:10px 0;border-left:3px solid ${c};
                    padding:5px 12px;background:rgba(255,255,255,0.03);border-radius:0 5px 5px 0;">
            <div style="font-weight:bold;font-size:18px;">${name} ${isW?'🏆':'💀'}</div>
            <div style="color:#aaa;font-size:13px;margin:4px 0;">
                Negozio: ${r.shopResidual} + Agenti vivi: ${r.survivorValue} = <b>${r.total}</b></div>
            <div style="font-size:14px;border-top:1px solid rgba(255,255,255,0.05);padding-top:4px;">
                ${dest}</div>
        </div>`;
    }).join('');

    const ownedHtml = Array.from({length:n},(_,i)=>i+1).map(p => {
        const cnt = campaignState.sectors.filter(s => s.owner === p).length;
        const c   = players[p]?.color || COLORS['p'+p] || '#ffffff';
        return `<span style="color:${c};margin:4px 10px;font-weight:bold;font-size:14px;white-space:nowrap;">
            ${players[p]?.name || 'P'+p}: 🏴${cnt}</span>`;
    }).join('');

    document.getElementById('cn-result-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cn-result-overlay';
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.94);z-index:99995;
        display:flex;align-items:center;justify-content:center;
        font-family:Courier New,monospace;padding:10px;box-sizing:border-box;`;
    overlay.innerHTML = `
        <div style="background:rgba(10,15,30,0.98);border:3px solid ${winnerColor};border-radius:15px;
                    padding:20px;width:100%;max-width:580px;max-height:95vh;overflow-y:auto;
                    box-shadow:0 0 50px rgba(0,0,0,1);box-sizing:border-box;text-align:center;">
            <h1 style="color:${winnerColor};text-shadow:0 0 15px ${winnerColor};margin:0 0 10px;
                        font-size:clamp(22px,5vw,32px);text-transform:uppercase;">⚔️ BATTAGLIA CONCLUSA</h1>
            <h2 style="color:#fff;margin:0 0 20px;font-size:clamp(16px,4vw,22px);">
                VINCITORE: <span style="color:${winnerColor}">${winnerName.toUpperCase()}</span></h2>
            <div style="background:rgba(0,0,0,0.3);border:1px solid #333;border-radius:10px;
                        padding:10px;margin-bottom:20px;text-align:left;">
                <p style="color:#888;font-size:11px;margin:0 0 10px;text-transform:uppercase;
                           text-align:center;letter-spacing:1px;">Resoconto Crediti</p>
                ${creditsHtml}
            </div>
            <div style="background:rgba(255,255,255,0.03);border:1px solid #222;border-radius:8px;
                        padding:10px;margin-bottom:25px;display:flex;flex-wrap:wrap;justify-content:center;">
                ${ownedHtml}
            </div>
            <button class="action-btn"
                style="padding:15px;border:3px solid ${winnerColor};color:${winnerColor};
                       background:rgba(0,0,0,0.5);cursor:pointer;font-size:22px;font-weight:bold;
                       width:100%;border-radius:10px;"
                onclick="document.getElementById('cn-result-overlay').remove();
                         _net_clientSend('SYNC_REQUEST',{});
                         _prepareMapDOM(); renderCampaignMap();">
                AVANTI ▶
            </button>
        </div>`;
    document.body.appendChild(overlay);
}

// ============================================================
// UI CLIENT: selettore crediti attacco
// ============================================================

function _clientOpenCreditSelector(data) {
    const { sectorId, sectorOwner, defCredits, canSabotage, nukeCost, availCredits } = data;
    const p = window.myPlayerNumber;

    // Content HTML identico a quello dell'Host
    const content = `
        <div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;color:#888;margin-bottom:15px;">
            ${sectorOwner > 0 ? `Difensore: 🏦 ${defCredits} cr` : 'Settore Neutrale'}
        </div>
        <div style="color:#fff;font-size:18px;margin-bottom:10px;">INVESTIMENTO: <span id="cr-val" style="color:#00ff88;font-weight:bold;font-size:24px;">4</span></div>
        <input type="range" id="cr-slider" min="${Math.min(4, availCredits)}" max="${availCredits}" value="${Math.min(4, availCredits)}" style="width:100%;accent-color:#00ff88;">
        <div style="color:#888;font-size:12px;margin-top:5px;">In Banca: 💰${availCredits}</div>
    `;

    // Usa il Factory (unifica lo stile grafico all'Host)
    const modal = _gui_createModalBase(p, "⚔️ ORDINE ATTACCO", `Bersaglio: Settore ${sectorId}`, content, [
        { id: 'btn-attack', label: 'INVIA ATTACCO', primary: true, disabled: availCredits < 4 },
        { id: 'btn-nuke', label: `☢️ NUCLEARIZZA (💰${nukeCost})`, primary: true, disabled: !canSabotage },
        { id: 'btn-cancel', label: 'ANNULLA', primary: false }
    ]);

    const slider = modal.querySelector('#cr-slider');
    slider.oninput = () => modal.querySelector('#cr-val').textContent = slider.value;

    modal.querySelector('#btn-attack').onclick = () => {
        const val = parseInt(slider.value);
        modal.remove();
        _net_clientSend('CONFIRM_CREDIT_ORDER', { sectorId, credits: val });
    };

    modal.querySelector('#btn-nuke').onclick = () => {
        const confirmMsg = `☢️ ATTENZIONE: NUCLEARIZZAZIONE\n\nEffetti:\n1. Il settore sarà BLOCCATO per l'intero turno successivo.\n2. Verranno distrutti tutti i crediti e gli upgrade in difesa.\n3. Se i nemici attaccano qui, perderanno i loro crediti nel vuoto!\n\nVuoi procedere con l'invio dell'ordine?`;
        if (!confirm(confirmMsg)) return;
        
        modal.remove();
        _net_clientSend('SABOTAGE', { sectorId: sectorId });
    };

    modal.querySelector('#btn-cancel').onclick = () => modal.remove();
}

// ============================================================
// UTILITY — Broadcast, snapshot, DOM
// ============================================================

function _doHostBroadcast() {
    if (!isOnline || !isHost) return;
    if (typeof clientConns !== 'undefined') {
        Object.entries(clientConns).forEach(([pNumStr, conn]) => {
            const pNum = parseInt(pNumStr);
            if (conn?.open) {
                try {
                    conn.send({ type:'CAMPAIGN_STATE_SYNC', state:_net_buildSnapshot(pNum) });
                } catch(e) { console.warn('[Net] Errore broadcast a P' + pNum, e); }
            }
        });
    }
    saveCampaignSnapshot?.();
}

function _hostSendStateTo(playerNum) {
    if (!isOnline || !isHost) return;
    const c = clientConns[playerNum];
    if (c?.open) {
        try { c.send({ type:'CAMPAIGN_STATE_SYNC', state:_net_buildSnapshot(playerNum) }); } catch(e) {}
    }
}

function _applySnapshot(snap) {
    if (!snap) return;
    Object.assign(campaignState, {
        isActive:                   snap.isActive,
        numPlayers:                 snap.numPlayers,
        currentPlayer:              snap.currentPlayer,
        credits:                    snap.credits           || {},
        victoryThreshold:           snap.victoryThreshold  || 18,
        phase:                      snap.phase,
        turnCount:                  snap.turnCount         || 1,
        pendingMoves:               snap.pendingMoves      || {},
        pendingOrders:              snap.pendingOrders     || {},
        sectorCredits:              snap.sectorCredits     || {},
        pendingAllocation:          snap.pendingAllocation || null,
        _allOrderedSectors:         snap._allOrderedSectors || {},
        _currentBattle:             snap._currentBattle   || null,
        battleQueue:                snap.battleQueue       || [],
        currentBattleParticipants:  snap.currentBattleParticipants || [],
        targetSector:               snap.targetSector,
        _creditsAtRoundStart:       snap._creditsAtRoundStart,
        _sectorCreditsAtRoundStart: snap._sectorCreditsAtRoundStart,
        _sectorsAtRoundStart:       snap._sectorsAtRoundStart,
    });

    if (snap.sectors?.length > 0) {
        const byId = {};
        campaignState.sectors.forEach(s => { byId[s.id] = s; });
        snap.sectors.forEach(ss => {
            const s = byId[ss.id]; if (!s) return;
            Object.assign(s, {
                owner: ss.owner, blocked: ss.blocked,
                income: ss.income, specialization: ss.specialization || null,
                mineUpgrade: ss.mineUpgrade, mineField: ss.mineField,
                fortressUpgrade: ss.fortressUpgrade,
                _nuclearized:            ss._nuclearized || false,
                _nuclearCooldown:        ss._nuclearCooldown || 0, // FIX CRITICO: Ricezione e applicazione
                _mineFieldJustTriggered: ss._mineFieldJustTriggered || false,
            });
            if (ss.x !== undefined) s.x = ss.x;
            if (ss.y !== undefined) s.y = ss.y;
        });
    }

    if (snap.playersMeta && window.players) {
        Object.entries(snap.playersMeta).forEach(([p, meta]) => {
            const pNum = Number(p);
            if (!window.players[pNum]) window.players[pNum] = {};
            if (meta.name)             window.players[pNum].name             = meta.name;
            if (meta.color)            window.players[pNum].color            = meta.color;
            if (meta._cosmeticFaction) window.players[pNum]._cosmeticFaction = meta._cosmeticFaction;
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

// ── Badge di attesa ───────────────────────────────────────────

function _showWaitingBadge(type) {
    let badge = document.getElementById('cn-not-your-turn-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'cn-not-your-turn-badge';
        badge.style.cssText = `
            position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
            background:rgba(0,0,0,0.88);border-radius:8px;
            font-family:'Courier New',monospace;font-size:14px;
            padding:10px 24px;z-index:200000;text-align:center;
            pointer-events:none;min-width:300px;`;
        document.body.appendChild(badge);
    }
    if (type === 'resolving') {
        badge.style.border = '2px solid #ff4444';
        badge.innerHTML = `
            <span style="color:#ff4444;font-weight:bold;">⚔️ RISOLUZIONE CONFLITTI...</span><br>
            <span style="color:#888;font-size:11px;">L'Host sta processando le battaglie</span>`;
    } else {
        const myColor = players[myPlayerNumber]?.color || '#00ff88';
        const myName  = players[myPlayerNumber]?.name  || 'Tu';
        badge.style.border = '2px solid #555';
        badge.innerHTML = `In attesa degli altri giocatori
            &nbsp;|&nbsp; <span style="color:${myColor};">${myName}: ordine confermato ✅</span>`;
    }
}

function _removeWaitingBadge() {
    document.getElementById('cn-not-your-turn-badge')?.remove();
}

function _fixConfirmButton() {
    const actDiv = document.getElementById('campaign-actions');
    if (!actDiv) return;
    const btn = actDiv.querySelector('.action-btn');
    if (!btn) return;
    btn.disabled          = false;
    btn.style.opacity     = '1';
    btn.style.pointerEvents = 'auto';
}

// ── Utility ───────────────────────────────────────────────────

function _deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// ============================================================
// ALIAS per retrocompatibilità
// ============================================================

window._cn_hostBroadcastCampaignState = _doHostBroadcast;
window._cn_hostRunNextBattle          = _hostRunNextBattle;
window._cn_buildCampaignSnapshot      = _net_buildSnapshot;

console.log('[campaign_multiplayer.js] Caricato.');
markScriptAsLoaded('campaign_multiplayer.js');
