/* ============================================================
   campaign_net_host.js — Campagna Multiplayer: Protocollo di Rete
   ============================================================
   RESPONSABILITÀ:
   - Stato condiviso online (isCampaignOnline, seq, ...)
   - Serializzazione/deserializzazione snapshot campaignState
   - Lato HOST: ricezione azioni client, validazione, esecuzione
   - Lato HOST: processConflicts, runNextBattle, gestione rendita
   - Lato CLIENT: ricezione messaggi campagna e UI di attesa/risultati

   DIPENDE DA: campaign.js, campaign_sectors.js, campaign_battles.js,
               network_core.js, network_sync.js
   CARICATO DA: index.html — dopo campaign_battles.js,
                             prima di campaign_net_client.js
   ============================================================ */

/* ============================================================
   campaign_network.js — CAMPAGNA MULTIPLAYER (Host Autoritativo)
   ============================================================
   FLUSSO:
     - L'HOST controlla TUTTO lo stato di campaignState.
     - I CLIENT ricevono snapshot completi (CAMPAIGN_STATE_SYNC)
       dopo ogni "Conferma Ordine" di qualunque giocatore.
     - I CLIENT inviano solo:
         CAMPAIGN_ACTION  → click su settore / slider crediti / sabotaggio
         CAMPAIGN_CONFIRM → il giocatore corrente confirma i suoi ordini
         CAMPAIGN_SKIP    → passa senza ordini
     - L'HOST applica l'azione, valida, e poi manda CAMPAIGN_STATE_SYNC
       a tutti.

   INTEGRA con i file esistenti via hook-pattern (window.fn).
   DEVE essere caricato DOPO campaign_battles.js in index.html.
   ============================================================ */

// ── STATO CAMPAGNA ONLINE ──────────────────────────────────────
window.isCampaignOnline   = window.isCampaignOnline   || false;
window.campaignMyFaction  = window.campaignMyFaction  || 0;
window.campaignSeq        = window.campaignSeq        || 0;

// ─────────────────────────────────────────────────────────────
// SERIALIZZAZIONE SNAPSHOT CAMPAGNA
// ─────────────────────────────────────────────────────────────

/**
 * Costruisce un oggetto JSON-serializzabile con l'intero stato
 * della campagna. Usato dall'host dopo ogni CONFERMA ORDINE.
 */
function _cn_buildCampaignSnapshot() {
    campaignSeq++;
    return {
        seq:               campaignSeq,
        isActive:          campaignState.isActive,
        numPlayers:        campaignState.numPlayers,
        currentPlayer:     campaignState.currentPlayer,
        credits:           JSON.parse(JSON.stringify(campaignState.credits)),
        victoryThreshold:  campaignState.victoryThreshold,
        phase:             campaignState.phase,
        turnCount:         campaignState.turnCount || 1,
        pendingMoves:      JSON.parse(JSON.stringify(campaignState.pendingMoves || {})),
        pendingOrders:     JSON.parse(JSON.stringify(campaignState.pendingOrders || {})),
        sectorCredits:     JSON.parse(JSON.stringify(campaignState.sectorCredits || {})),
        pendingAllocation: campaignState.pendingAllocation ? JSON.parse(JSON.stringify(campaignState.pendingAllocation)) : null,
        _allOrderedSectors: JSON.parse(JSON.stringify(campaignState._allOrderedSectors || {})),
        _currentBattle:    campaignState._currentBattle ? JSON.parse(JSON.stringify(campaignState._currentBattle)) : null,
        battleQueue:       JSON.parse(JSON.stringify(campaignState.battleQueue || [])),
        currentBattleParticipants: JSON.parse(JSON.stringify(campaignState.currentBattleParticipants || [])),
        targetSector:      campaignState.targetSector,
        sectors:           campaignState.sectors.map(s => ({
            id:             s.id,
            owner:          s.owner,
            x:              s.x,
            y:              s.y,
            blocked:        s.blocked,
            income:         s.income,
            specialization: s.specialization || null,
        })),
    };
}

/**
 * Applica un snapshot ricevuto sovrascrivendo campaignState.
 * Chiamata dai client quando ricevono CAMPAIGN_STATE_SYNC.
 */
function _cn_applyCampaignSnapshot(snap) {
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

    // Applica settori (mantieni adj e tutto ciò che non viene dalla rete)
    if (snap.sectors && snap.sectors.length === campaignState.sectors.length) {
        snap.sectors.forEach((ss, i) => {
            campaignState.sectors[i].owner          = ss.owner;
            campaignState.sectors[i].blocked        = ss.blocked;
            campaignState.sectors[i].income         = ss.income;
            campaignState.sectors[i].specialization = ss.specialization || null;
        });
    }
}

// ─────────────────────────────────────────────────────────────
// INVIO SNAPSHOT DA HOST
// ─────────────────────────────────────────────────────────────

function _cn_hostBroadcastCampaignState() {
    if (!isOnline || !isHost) return;
    const msg = {
        type:   'CAMPAIGN_STATE_SYNC',
        state:  _cn_buildCampaignSnapshot(),
    };
    broadcastToClients(msg);
}

// ─────────────────────────────────────────────────────────────
// INVIO AZIONI DA CLIENT → HOST
// ─────────────────────────────────────────────────────────────

function _cn_clientSendAction(actionType, payload) {
    if (!isOnline || isHost) return;
    if (!hostConn || !hostConn.open) return;
    try {
        hostConn.send({
            type:    'CAMPAIGN_ACTION',
            action:  actionType,
            payload: payload,
            player:  myPlayerNumber,
        });
    } catch(e) {
        console.warn('[CampaignNet] Errore invio azione:', e);
    }
}

// ─────────────────────────────────────────────────────────────
// GESTIONE MESSAGGI CAMPAGNA (lato host, ricevuto da client)
// ─────────────────────────────────────────────────────────────

function _cn_handleHostReceivedCampaignMsg(data, fromPlayer) {
    if (!isOnline || !isHost) return;
    if (!campaignState.isActive) return;

    const { action, payload } = data;

    // Sicurezza: solo il giocatore di turno può inviare azioni nella fase PLANNING
    if (campaignState.phase === 'PLANNING') {
        if (fromPlayer !== campaignState.currentPlayer) {
            console.warn(`[CampaignHost] Azione ${action} da P${fromPlayer} rifiutata: non è il suo turno (turno di P${campaignState.currentPlayer})`);
            // Invia comunque lo stato attuale per correggere il client
            _cn_hostSendCampaignStateTo(fromPlayer);
            return;
        }
    }

    switch(action) {
        case 'SECTOR_CLICK':
            // Valida il settore lato host, poi manda il segnale al client
            // per aprire il selettore crediti (non modifica ancora lo stato)
            _cn_hostValidateAndOpenCreditSelector(payload.sectorId, fromPlayer);
            return; // Non broadcast qui — risponde solo al mittente
            break;

        case 'CONFIRM_ORDER':
            // Simula finishPlayerTurn
            _cn_hostApplyConfirmOrder(fromPlayer);
            break;

        case 'SKIP_TURN':
            // Simula skipPlayerTurn
            _cn_hostApplySkipTurn(fromPlayer);
            break;

        case 'CANCEL_ORDER':
            // Annulla un ordine specifico
            _cn_hostApplyCancelOrder(payload.sectorId, fromPlayer);
            break;

        case 'ADD_SECTOR_CREDIT':
            _cn_hostApplyAllocCredit(payload.sectorId, fromPlayer, +1);
            break;

        case 'REMOVE_SECTOR_CREDIT':
            _cn_hostApplyAllocCredit(payload.sectorId, fromPlayer, -1);
            break;

        case 'CONFIRM_CREDIT_ORDER': {
            // Il client ha confermato un ordine con i crediti scelti
            const { sectorId, credits } = payload;
            _cn_hostApplyOrderWithCredits(sectorId, credits, fromPlayer);
            break;
        }

        case 'SABOTAGE': {
            _cn_hostApplySabotage(payload.sectorId, fromPlayer);
            break;
        }

        default:
            console.warn('[CampaignHost] Azione campagna sconosciuta:', action);
    }

    // Dopo qualsiasi azione valida, broadcast stato aggiornato
    _cn_hostBroadcastCampaignState();
}

// ─────────────────────────────────────────────────────────────
// LOGICHE HOST
// ─────────────────────────────────────────────────────────────

function _cn_hostApplySectorClick(targetId, fromPlayer) {
    // Replica handleSectorClick lato host
    const target = campaignState.sectors[targetId];
    if (!target || target.blocked) return;
    if (target.owner === fromPlayer) return;

    // Controlla raggiungibilità (con eventuale TRASPORTI)
    const hasTrasporti = campaignState.sectors.some(s => s.owner === fromPlayer && s.specialization === 'TRASPORTI');
    const isAdjacent = campaignState.adj[targetId].some(id => campaignState.sectors[id].owner === fromPlayer);
    let reachable = isAdjacent;
    if (!reachable && hasTrasporti) {
        reachable = campaignState.adj[targetId].some(neighborId => {
            if (campaignState.sectors[neighborId].blocked) return false;
            return campaignState.adj[neighborId].some(id2 => campaignState.sectors[id2].owner === fromPlayer);
        });
    }
    if (!reachable) return;

    // Toggle ordine se già presente
    const orders = campaignState.pendingOrders[fromPlayer] || [];
    const existing = orders.find(o => o.sectorId === targetId);
    if (existing) {
        campaignState.pendingOrders[fromPlayer] = orders.filter(o => o.sectorId !== targetId);
        campaignState.credits[fromPlayer] += existing.credits;
    }
    // Segnala che il settore è stato selezionato (il credito verrà fissato con CONFIRM_CREDIT_ORDER)
    // Per ora usiamo il vecchio sistema pendingMoves per compatibilità
    campaignState.pendingMoves[fromPlayer] = targetId;
}

/**
 * Valida il click su settore e, se valido, manda CAMPAIGN_OPEN_CREDIT_SELECTOR
 * SOLO al client che ha cliccato (non modifica lo stato).
 * Se il settore era già in un ordine pendente del client, lo cancella (toggle).
 */
function _cn_hostValidateAndOpenCreditSelector(targetId, fromPlayer) {
    const target = campaignState.sectors[targetId];
    if (!target || target.blocked) return;
    if (target.owner === fromPlayer) {
        _cn_hostSendCampaignStateTo(fromPlayer); // aggiorna il client col messaggio di errore
        return;
    }

    // Controlla raggiungibilità
    const hasTrasporti = campaignState.sectors.some(s => s.owner === fromPlayer && s.specialization === 'TRASPORTI');
    const isAdjacent   = campaignState.adj[targetId].some(id => campaignState.sectors[id].owner === fromPlayer);
    let reachable = isAdjacent;
    if (!reachable && hasTrasporti) {
        reachable = campaignState.adj[targetId].some(neighborId => {
            if (campaignState.sectors[neighborId].blocked) return false;
            return campaignState.adj[neighborId].some(id2 => campaignState.sectors[id2].owner === fromPlayer);
        });
    }
    if (!reachable) return;

    // Toggle: se questo settore ha già un ordine pendente, lo cancella
    const orders   = campaignState.pendingOrders[fromPlayer] || [];
    const existing = orders.find(o => o.sectorId === targetId);
    if (existing) {
        // Annulla ordine e rimborsa
        campaignState.credits[fromPlayer]          += existing.credits;
        campaignState.pendingOrders[fromPlayer]     = orders.filter(o => o.sectorId !== targetId);
        delete campaignState.pendingMoves[fromPlayer];
        // Rimuovi da _allOrderedSectors
        if (campaignState._allOrderedSectors?.[targetId]) {
            campaignState._allOrderedSectors[targetId] =
                campaignState._allOrderedSectors[targetId].filter(p => p !== fromPlayer);
        }
        _cn_hostBroadcastCampaignState();
        return;
    }

    // Settore valido e non ancora ordinato: manda richiesta apertura selettore
    const defCredits = target.owner > 0
        ? (campaignState.sectorCredits[targetId]?.[target.owner] || 0)
        : 0;
    const hasExplosion = campaignState.sectors.some(s => s.owner === fromPlayer && s.specialization === 'ESPLOSIONE');
    const canSabotage  = hasExplosion && target.owner > 0 && target.owner !== fromPlayer
                         && defCredits > 0 && (campaignState.credits[fromPlayer] || 0) >= 30;

    const msg = {
        type:         'CAMPAIGN_OPEN_CREDIT_SELECTOR',
        sectorId:     targetId,
        sectorOwner:  target.owner,
        defCredits,
        canSabotage,
        availCredits: campaignState.credits[fromPlayer] || 0,
        specialization: target.specialization || null,
    };
    const conn = clientConns[fromPlayer];
    if (conn && conn.open) {
        try { conn.send(msg); } catch(e) {}
    }
}

function _cn_hostApplyOrderWithCredits(sectorId, credits, fromPlayer) {
    const avail = campaignState.credits[fromPlayer] || 0;
    const minCost = 4;
    if (credits < minCost || credits > avail) return;

    // Rimuovi eventuale ordine precedente su questo settore
    const orders = campaignState.pendingOrders[fromPlayer] || [];
    const existing = orders.find(o => o.sectorId === sectorId);
    if (existing) {
        campaignState.credits[fromPlayer] += existing.credits;
        campaignState.pendingOrders[fromPlayer] = orders.filter(o => o.sectorId !== sectorId);
    }

    campaignState.credits[fromPlayer] -= credits;
    if (!campaignState.pendingOrders[fromPlayer]) campaignState.pendingOrders[fromPlayer] = [];
    campaignState.pendingOrders[fromPlayer].push({ sectorId, credits });

    // Aggiorna _allOrderedSectors
    if (!campaignState._allOrderedSectors) campaignState._allOrderedSectors = {};
    if (!campaignState._allOrderedSectors[sectorId]) campaignState._allOrderedSectors[sectorId] = [];
    if (!campaignState._allOrderedSectors[sectorId].includes(fromPlayer)) {
        campaignState._allOrderedSectors[sectorId].push(fromPlayer);
    }

    // Aggiorna pendingMoves per compatibilità
    campaignState.pendingMoves[fromPlayer] = sectorId;
}

function _cn_hostApplyCancelOrder(sectorId, fromPlayer) {
    const orders = campaignState.pendingOrders[fromPlayer] || [];
    const order  = orders.find(o => o.sectorId === sectorId);
    if (!order) return;
    campaignState.credits[fromPlayer] += order.credits;
    campaignState.pendingOrders[fromPlayer] = orders.filter(o => o.sectorId !== sectorId);
    delete campaignState.pendingMoves[fromPlayer];
}

function _cn_hostApplyAllocCredit(sectorId, fromPlayer, delta) {
    if (!campaignState.sectorCredits[sectorId]) campaignState.sectorCredits[sectorId] = {};
    if (!campaignState.sectorCredits[sectorId][fromPlayer]) campaignState.sectorCredits[sectorId][fromPlayer] = 0;

    if (delta > 0) {
        if (campaignState.credits[fromPlayer] <= 0) return;
        campaignState.sectorCredits[sectorId][fromPlayer]++;
        campaignState.credits[fromPlayer]--;
    } else {
        if (campaignState.sectorCredits[sectorId][fromPlayer] <= 0) return;
        campaignState.sectorCredits[sectorId][fromPlayer]--;
        campaignState.credits[fromPlayer]++;
    }
}

function _cn_hostApplySabotage(targetSectorId, fromPlayer) {
    const hasExplosion = campaignState.sectors.some(s => s.owner === fromPlayer && s.specialization === 'ESPLOSIONE');
    const target = campaignState.sectors[targetSectorId];
    if (!hasExplosion || !target || target.owner === fromPlayer || target.owner <= 0) return;

    const avail = campaignState.credits[fromPlayer] || 0;
    if (avail < 30) return;

    const defCredits = campaignState.sectorCredits[targetSectorId]?.[target.owner] || 0;
    if (defCredits <= 0) return;

    campaignState.credits[fromPlayer] -= 30;
    if (!campaignState.sectorCredits[targetSectorId]) campaignState.sectorCredits[targetSectorId] = {};
    campaignState.sectorCredits[targetSectorId][target.owner] = 0;
}

function _cn_hostApplyConfirmOrder(fromPlayer) {
    if (campaignState.currentPlayer !== fromPlayer) return;
    // Esegui la logica di finishPlayerTurn
    const n = campaignState.numPlayers;
    let next = campaignState.currentPlayer + 1;
    while (next <= n) {
        const hasSectors = campaignState.sectors.some(s => s.owner === next);
        if (!hasSectors) { next++; continue; }
        break;
    }
    if (next > n) {
        // Tutti hanno confermato → avvia risoluzione conflitti
        // La risoluzione avviene SOLO lato host — poi manda snapshot con phase=RESOLVING
        _cn_hostProcessConflicts();
    } else {
        campaignState.currentPlayer = next;
        _cn_hostBroadcastCampaignState();
    }
}

function _cn_hostApplySkipTurn(fromPlayer) {
    delete campaignState.pendingMoves[fromPlayer];
    _cn_hostApplyConfirmOrder(fromPlayer);
}

/**
 * Replica di processConflicts lato host.
 * Calcola conquiste pacifiche e coda battaglie, poi invia snapshot.
 */
function _cn_hostProcessConflicts() {
    campaignState.phase = 'RESOLVING';
    campaignState.battleQueue = [];
    
    // usa pendingOrders se disponibile, altrimenti pendingMoves
    const orders = campaignState.pendingOrders || {};
    const moves  = campaignState.pendingMoves  || {};

    const sectorMap = {};
    campaignState.sectors.forEach(s => { sectorMap[s.id] = { attackers: [], defender: s.owner }; });

    const n = campaignState.numPlayers;
    for (let p = 1; p <= n; p++) {
        (orders[p] || []).forEach(o => sectorMap[o.sectorId].attackers.push({ p, credits: o.credits }));
        // fallback: pendingMoves
        const mv = moves[p];
        if (mv !== undefined) {
            const already = (orders[p] || []).some(o => o.sectorId === mv);
            if (!already) sectorMap[mv].attackers.push({ p, credits: 0 });
        }
    }

    campaignState.sectors.forEach(sector => {
        const { attackers } = sectorMap[sector.id];
        if (attackers.length === 0) return;

        const participants = new Set(attackers.map(a => a.p));
        if (sector.owner > 0 && !participants.has(sector.owner)) {
            participants.add(sector.owner);
        }

        // --- FIX: CALCOLO CREDITI DA INVIARE ALLA BATTAGLIA ---
        const battleCredits = {};
        attackers.forEach(a => { battleCredits[a.p] = a.credits; });

        let fortressAdjacentZeroed = [];
        if (sector.owner > 0) {
            let defCr = campaignState.sectorCredits[sector.id]?.[sector.owner] || 0;
            // NON azzeriamo sectorCredits qui, ma calcoliamo quanto porta in battaglia il difensore
            if (sector.specialization === 'FORTEZZA') {
                campaignState.adj[sector.id].forEach(adjId => {
                    const adj = campaignState.sectors[adjId];
                    if (adj.owner === sector.owner) {
                        const adjCr = (campaignState.sectorCredits[adjId]?.[sector.owner] || 0);
                        defCr += adjCr;
                        if (adjCr > 0) fortressAdjacentZeroed.push(adjId);
                    }
                });
            }
            battleCredits[sector.owner] = defCr;
        }
        // ------------------------------------------------------

        if (participants.size > 1 && (sector.owner === 0 || (battleCredits[sector.owner] || 0) > 3)) {
            campaignState.battleQueue.push({
                sectorId: sector.id,
                factions: Array.from(participants),
                battleCredits: battleCredits,           // <--- FIX: INSERITO NELLA CODA
                fortressAdjacentZeroed: fortressAdjacentZeroed
            });
        } else {
            const attacker = Array.from(participants)[0];
            sector.owner = attacker;
            if (!campaignState.sectorCredits[sector.id]) campaignState.sectorCredits[sector.id] = {};
            const invested = battleCredits[attacker] || 0;
            campaignState.sectorCredits[sector.id][attacker] =
                (campaignState.sectorCredits[sector.id][attacker] || 0) + invested;
        }
    });

    // Invia snapshot con la coda battaglie pronta
    _cn_hostBroadcastCampaignState();

    // L'host avvia la prima battaglia dopo un breve delay
    setTimeout(() => {
        _cn_hostRunNextBattle();
    }, 1500);
}

/**
 * Host esegue la prossima battaglia della coda.
 * Se la coda è vuota, avvia il prossimo round di planning.
 */
function _cn_hostRunNextBattle() {
    if (!isCampaignOnline || !isHost) return;

    if (campaignState.battleQueue.length === 0) {
        // Fine battaglie → round successivo
        campaignState.turnCount = (campaignState.turnCount || 1) + 1;
        campaignState.phase = 'PLANNING';
        campaignState.currentPlayer = 1;
        campaignState.pendingMoves = {};
        campaignState.pendingOrders = {};
        campaignState._allOrderedSectors = {};

        // Salta eliminati
        while (campaignState.currentPlayer <= campaignState.numPlayers &&
               !campaignState.sectors.some(s => s.owner === campaignState.currentPlayer)) {
            campaignState.currentPlayer++;
        }

        // Verifica vittoria
        for (let p = 1; p <= campaignState.numPlayers; p++) {
            const cnt = campaignState.sectors.filter(s => s.owner === p).length;
            if (cnt >= campaignState.victoryThreshold) {
                campaignState.phase = 'VICTORY';
                campaignState.winner = p;
                break;
            }
        }

        if (campaignState.phase === 'VICTORY') {
            _cn_hostBroadcastCampaignState();
            checkCampaignWin();
        } else {
            startNextPlanningRound();
        }
        return;
    }

    const battle = campaignState.battleQueue.shift();
    campaignState._currentBattle = battle;
    campaignState.targetSector   = battle.sectorId;
    campaignState.currentBattleParticipants = battle.factions.slice().sort((a, b) => a - b);

    // --- FIX: AZZERA I CREDITI DEL SETTORE GRAFICAMENTE ---
    if (battle.battleCredits && battle.sectorId != null) {
        if (!campaignState.sectorCredits[battle.sectorId]) campaignState.sectorCredits[battle.sectorId] = {};
        battle.factions.forEach(p => {
            const sector = campaignState.sectors.find(s => s.id === battle.sectorId);
            if (sector && sector.owner === p) {
                campaignState.sectorCredits[battle.sectorId][p] = 0; // Azzera i crediti del difensore nel settore
            }
            if (battle.fortressAdjacentZeroed) {
                battle.fortressAdjacentZeroed.forEach(adjId => {
                    if (campaignState.sectorCredits[adjId]) {
                        campaignState.sectorCredits[adjId][p] = 0;
                    }
                });
            }
        });
    }
    // ------------------------------------------------------

    // Invia snapshot con la battaglia corrente
    _cn_hostBroadcastCampaignState();

    // Aggiungi anche info sulla battaglia nel messaggio CAMPAIGN_BATTLE_START
    const battleMsg = {
        type:         'CAMPAIGN_BATTLE_START',
        sectorId:     battle.sectorId,
        factions:     battle.factions,
        campaignSnap: _cn_buildCampaignSnapshot(),
    };
    broadcastToClients(battleMsg);

    // L'host avvia localmente la battaglia
    setTimeout(() => {
        startCampaignBattle(battle.factions, battle.sectorId);
    }, 500);
}

// ─────────────────────────────────────────────────────────────
// GESTIONE MESSAGGI CAMPAGNA (lato client)
// ─────────────────────────────────────────────────────────────

function _cn_handleClientReceivedCampaignMsg(data) {
    switch(data.type) {

        case 'CAMPAIGN_STATE_SYNC': {
            if (!data.state || data.state.seq <= (campaignSeq || 0)) return; // scarta vecchi
            campaignSeq = data.state.seq;
            _cn_applyCampaignSnapshot(data.state);

            // Rimuovi overlay di inizializzazione se ancora presente
            const initOv = document.getElementById('cn-campaign-init-overlay');
            if (initOv) initOv.remove();

            // Ridisegna la mappa campagna
            if (campaignState.isActive && campaignState.phase === 'PLANNING') {
                renderCampaignMap();
                // Mostra indicatore "non è il tuo turno" se necessario
                if (campaignState.currentPlayer !== myPlayerNumber) {
                    _cn_showNotYourTurnBadge();
                } else {
                    _cn_removeNotYourTurnBadge();
                }
            } else if (campaignState.phase === 'RESOLVING') {
                // Mostra schermata di attesa battaglie
                _cn_showClientWaitingScreen();
            } else if (campaignState.phase === 'VICTORY') {
                checkCampaignWin();
            }
            break;
        }

        case 'CAMPAIGN_OPEN_CREDIT_SELECTOR': {
            // L'host ha validato il click: apri il selettore crediti localmente
            _cn_clientOpenCreditSelector(data);
            break;
        }

        case 'CAMPAIGN_BATTLE_START': {
            if (data.campaignSnap) {
                campaignSeq = data.campaignSnap.seq;
                _cn_applyCampaignSnapshot(data.campaignSnap);
            }
            // Avvia la battaglia lato client
            _cn_clientStartBattle(data.factions, data.sectorId);
            break;
        }

        case 'CAMPAIGN_BATTLE_RESULT': {
            if (data.campaignSnap) {
                campaignSeq = data.campaignSnap.seq;
                _cn_applyCampaignSnapshot(data.campaignSnap);
            }
            // Nascondi eventuali overlay di battaglia/spettatore
            ['cn-spectate-overlay', 'cn-waiting-overlay', 'gameover-overlay'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.remove();
            });
            // Nascondi il canvas di gioco se visibile
            const controls = document.getElementById('controls-panel');
            if (controls) controls.style.display = 'none';
            state = 'SETUP_P1'; // reset per prossima battaglia

            _cn_clientShowBattleResults(data.winnerFaction, data.sectorId, data.results);
            break;
        }

        case 'CAMPAIGN_INCOME_NOTICE': {
            // Notifica inizio nuovo round con rendita
            if (data.campaignSnap) {
                campaignSeq = data.campaignSnap.seq;
                _cn_applyCampaignSnapshot(data.campaignSnap);
            }
            _cn_clientShowIncomeNotice(data.earned);
            break;
        }
    }
}

// ─────────────────────────────────────────────────────────────
// UI CLIENT — schermata di attesa
// ─────────────────────────────────────────────────────────────

/**
 * Apre il selettore crediti per un ordine lato client.
 * Replica _bat_showCreditSelector ma invia CONFIRM_CREDIT_ORDER all'host.
 */
function _cn_clientOpenCreditSelector(data) {
    const { sectorId, sectorOwner, defCredits, canSabotage, availCredits, specialization } = data;

    const existing = document.getElementById('eco-credit-modal');
    if (existing) existing.remove();

    const minCost  = 4;
    const pColor   = COLORS['p' + myPlayerNumber] || '#00ff88';
    const pName    = players[myPlayerNumber]?.name || 'P' + myPlayerNumber;

    const defLine = sectorOwner > 0
        ? `<div style="color:#aaa;font-size:22px;margin-top:12px;">
               Difensore: \uD83C\uDFE6 ${defCredits} crediti allocati
           </div>`
        : `<div style="color:#888;font-size:22px;margin-top:12px;">Settore Neutro</div>`;

    const specData = (typeof SECTOR_SPECIALIZATIONS !== 'undefined' && specialization)
        ? SECTOR_SPECIALIZATIONS.find(s => s.id === specialization)
        : null;
    const specLine = specData
        ? `<div style="color:#FFD700;font-size:20px;margin-top:10px;">${specData.label} — ${specData.desc}</div>`
        : '';

    const sabotageBtnHtml = canSabotage
        ? `<button class="action-btn" id="eco-sabotage-btn"
                style="border:3px solid #ff4444;color:#ff4444;padding:20px 35px;font-size:26px;
                       font-weight:bold;background:rgba(255,0,0,0.1);cursor:pointer;">
                SABOTAGGIO \uD83D\uDCA5 (30\uD83D\uDCB0)
           </button>`
        : '';

    const modal = document.createElement('div');
    modal.id = 'eco-credit-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(0,0,0,0.90);z-index:999999;' +
        'display:flex;align-items:center;justify-content:center;font-family:Courier New;';

    modal.innerHTML =
        '<div style="background:rgba(5,10,20,0.98);border:4px solid ' + pColor + ';border-radius:20px;' +
        'padding:50px 60px;min-width:580px;text-align:center;box-shadow:0 0 60px rgba(0,0,0,1);">' +
        '<h1 style="color:' + pColor + ';margin:0 0 16px;font-size:40px;letter-spacing:3px;">ORDINE DI ATTACCO</h1>' +
        '<div style="color:#fff;font-size:28px;margin-bottom:8px;font-weight:bold;">' +
            pName + ' \u2192 Settore ' + sectorId +
        '</div>' +
        defLine + specLine +
        '<hr style="border-color:#444;margin:30px 0;">' +
        '<div style="color:#aaa;font-size:24px;margin-bottom:16px;">' +
            'Crediti in Banca: <span style="color:#FFD700;">' + availCredits + '</span>' +
        '</div>' +
        '<div style="color:#fff;font-size:28px;margin-bottom:24px;">' +
            'Investimento: <span id="eco-credit-val" style="color:#00ff88;font-size:52px;' +
            'font-weight:bold;text-shadow:0 0 16px #00ff88;">' + Math.min(minCost, availCredits) + '</span>' +
        '</div>' +
        '<input type="range" id="eco-credit-slider" ' +
            'min="' + Math.min(minCost, availCredits) + '" max="' + availCredits + '" ' +
            'value="' + Math.min(minCost, availCredits) + '" step="1" ' +
            'style="width:100%;height:36px;cursor:pointer;accent-color:' + pColor + ';margin-bottom:40px;">' +
        '<div style="display:flex;gap:24px;justify-content:center;flex-wrap:wrap;">' +
            '<button class="action-btn" id="eco-confirm-order" ' +
                'style="border:3px solid ' + pColor + ';color:' + pColor + ';padding:20px 40px;' +
                'font-size:28px;font-weight:bold;background:transparent;cursor:pointer;">' +
                'INVIA ORDINE \u2713' +
            '</button>' +
            sabotageBtnHtml +
            '<button class="action-btn" ' +
                'style="border:3px solid #666;color:#888;padding:20px 35px;font-size:28px;' +
                'background:transparent;cursor:pointer;" ' +
                'onclick="document.getElementById(\'eco-credit-modal\').remove();">' +
                'ANNULLA' +
            '</button>' +
        '</div></div>';

    document.body.appendChild(modal);

    const slider  = modal.querySelector('#eco-credit-slider');
    const valDisp = modal.querySelector('#eco-credit-val');

    if (availCredits < minCost) {
        valDisp.style.color = '#ff4444';
        const confirmBtn = modal.querySelector('#eco-confirm-order');
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.3';
        confirmBtn.style.cursor = 'not-allowed';
    }

    slider.oninput = () => { valDisp.textContent = slider.value; };

    modal.querySelector('#eco-confirm-order').onclick = () => {
        const chosen = parseInt(slider.value);
        modal.remove();
        campaignSendAction('CONFIRM_CREDIT_ORDER', { sectorId, credits: chosen });
    };

    if (canSabotage) {
        const sabBtn = modal.querySelector('#eco-sabotage-btn');
        if (sabBtn) {
            sabBtn.onclick = () => {
                const ok = confirm(
                    'SABOTAGGIO!\n\nAzzerare i crediti nemici nel Settore ' + sectorId +
                    '.\nCosto: 30 crediti.\n\nProcedere?'
                );
                if (ok) {
                    modal.remove();
                    campaignSendAction('SABOTAGE', { sectorId });
                }
            };
        }
    }
}

function _cn_showClientWaitingScreen() {
    const existing = document.getElementById('cn-waiting-overlay');
    if (existing) return; // già mostrata

    const overlay = document.createElement('div');
    overlay.id = 'cn-waiting-overlay';
    overlay.style.cssText = `
        position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(5,5,9,0.92); z-index:99990;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        font-family:'Courier New',monospace; color:#fff; text-align:center;
    `;
    overlay.innerHTML = `
        <div style="font-size:3em; margin-bottom:20px; animation:pulse 1.5s infinite;">⚔️</div>
        <h2 style="color:#ff4444; margin-bottom:10px;">BATTAGLIE IN CORSO</h2>
        <p style="color:#aaa; font-size:1.1em;">Attendi che l'Host risolva le battaglie...</p>
        <div style="margin-top:20px; font-size:0.85em; color:#555;">
            Battaglie rimanenti: <span id="cn-battles-left">${campaignState.battleQueue.length}</span>
        </div>
    `;
    document.body.appendChild(overlay);
}

function _cn_removeWaitingScreen() {
    const el = document.getElementById('cn-waiting-overlay');
    if (el) el.remove();
}

// ─────────────────────────────────────────────────────────────
// CLIENT — avvio battaglia
// ─────────────────────────────────────────────────────────────

function _cn_clientStartBattle(factions, sectorId) {
    _cn_removeWaitingScreen();

    // Il client è un partecipante?
    const isParticipant = factions.includes(myPlayerNumber);

    if (isParticipant) {
        // Partecipa normalmente alla battaglia
        startCampaignBattle(factions, sectorId);
    } else {
        // Spettatore — mostra schermata di attesa battaglia
        const overlay = document.createElement('div');
        overlay.id = 'cn-spectate-overlay';
        overlay.style.cssText = `
            position:fixed; top:0; left:0; width:100%; height:100%;
            background:rgba(5,5,9,0.96); z-index:99990;
            display:flex; flex-direction:column; align-items:center; justify-content:center;
            font-family:'Courier New',monospace; color:#fff; text-align:center;
        `;
        const names = factions.map(p => {
            const c = COLORS['p' + p];
            return `<span style="color:${c};">${players[p]?.name || 'P'+p}</span>`;
        }).join(' <span style="color:#888">vs</span> ');
        overlay.innerHTML = `
            <div style="font-size:3em; margin-bottom:20px;">⚔️</div>
            <h2 style="color:#ff4444; margin-bottom:8px;">BATTAGLIA IN CORSO</h2>
            <p style="font-size:1.2em; margin-bottom:12px;">Settore <strong>${sectorId}</strong></p>
            <p style="color:#aaa; font-size:1.1em;">${names}</p>
            <p style="color:#555; margin-top:20px; font-size:0.85em;">Non sei un partecipante — attendi il risultato.</p>
        `;
        document.body.appendChild(overlay);
    }
}

function _cn_clientShowBattleResults(winnerFaction, sectorId, results) {
    // Rimuovi overlay spettatore se presente
    const spec = document.getElementById('cn-spectate-overlay');
    if (spec) spec.remove();

    // Mostra risultati (stesso formato di _bat_showBattleResultsUI ma read-only)
    const winnerColor = COLORS['p' + winnerFaction];
    const winnerName  = players[winnerFaction]?.name || 'P' + winnerFaction;

    const participants = campaignState.currentBattleParticipants || [];
    const creditsHtml = participants.map(faction => {
        const c    = COLORS['p' + faction];
        const name = players[faction]?.name || 'P' + faction;
        const r    = results ? results[faction] : null;
        const isWinner = faction === winnerFaction;
        const dest = isWinner ? '→ 📦 Nel Settore' : `→ 🏦 Alla Banca`;
        const detail = r ? `Negozio: ${r.shopResidual} + Agenti: ${r.survivorValue} = ${r.total}` : '';
        return `<div style="color:${c};font-size:18px;margin:10px 0;border-left:4px solid ${c};padding-left:12px;">
            <strong>${name}</strong> ${isWinner ? '🏆' : '💀'}
            <div style="color:#aaa;font-size:13px;">${detail} ${dest}</div>
        </div>`;
    }).join('');

    const ownedHtml = Array.from({ length: campaignState.numPlayers }, (_, i) => i + 1).map(p => {
        const cnt = campaignState.sectors.filter(s => s.owner === p).length;
        const c   = COLORS['p' + p];
        return `<span style="color:${c};margin:0 10px;">${players[p]?.name || 'P'+p}: 🏴${cnt}</span>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'cn-result-overlay';
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.96);z-index:99995;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-family:Courier New,monospace;text-align:center;padding:20px;`;
    overlay.innerHTML = `
        <h1 style="color:${winnerColor};text-shadow:0 0 20px ${winnerColor};margin-bottom:10px;">⚔️ BATTAGLIA CONCLUSA</h1>
        <h2 style="color:${winnerColor};margin-bottom:25px;">VINCITORE: ${winnerName.toUpperCase()}</h2>
        <div style="background:rgba(255,255,255,0.05);border:2px solid #333;border-radius:10px;
                    padding:20px 35px;margin-bottom:20px;min-width:520px;text-align:left;">
            ${creditsHtml}
        </div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid #222;border-radius:8px;
                    padding:12px 25px;margin-bottom:25px;">${ownedHtml}</div>
        <button class="action-btn"
            style="padding:15px 50px;border:2px solid ${winnerColor};color:${winnerColor};
                   background:transparent;cursor:pointer;font-size:18px;"
            onclick="document.getElementById('cn-result-overlay').remove(); _cn_removeWaitingScreen(); renderCampaignMap();">
            AVANTI ▶
        </button>
    `;
    document.body.appendChild(overlay);
}

function _cn_clientShowIncomeNotice(earned) {
    _cn_removeWaitingScreen();

    const n = campaignState.numPlayers;
    let incomeHtml = '';
    for (let p = 1; p <= n; p++) {
        const c    = COLORS['p' + p];
        const name = players[p]?.name || 'P' + p;
        const e    = earned ? (earned[p] || 0) : 0;
        incomeHtml += `<div style="color:${c};margin:10px 0;font-size:20px;border-left:4px solid ${c};padding-left:12px;">
            ${name}: <span style="color:#fff;">+${e}</span> rendita → 
            <span style="color:#FFD700;">💰 ${campaignState.credits[p]}</span>
        </div>`;
    }

    const overlay = document.createElement('div');
    overlay.id = 'cn-income-overlay';
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.95);z-index:99995;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-family:Courier New,monospace;text-align:center;padding:20px;`;
    overlay.innerHTML = `
        <h2 style="color:#FFD700;margin-bottom:20px;">💰 RISCOSSIONE RENDITA</h2>
        <div style="background:rgba(255,255,255,0.05);border:1px solid #444;border-radius:8px;
                    padding:20px 35px;margin-bottom:20px;min-width:400px;text-align:left;">
            ${incomeHtml}
        </div>
        <button class="action-btn"
            style="padding:12px 40px;border:2px solid #FFD700;color:#FFD700;background:transparent;cursor:pointer;"
            onclick="document.getElementById('cn-income-overlay').remove(); renderCampaignMap();">
            AVANTI ▶
        </button>
    `;
    document.body.appendChild(overlay);
}

// ============================================================
// FIX DEFINITIVO: SALTO TURNO E RIMOZIONE BASI FANTASMA
// ============================================================

// 1. Forza il gioco a considerare "Eliminati" i giocatori non coinvolti.
// In questo modo il sistema dei turni li salta ISTANTANEAMENTE e non parte mai il timer.
const _cn_origIsPlayerEliminated = window.isPlayerEliminated;
window.isPlayerEliminated = function(p) {
    if (typeof campaignState !== 'undefined' && campaignState.isActive) {
        const participants = campaignState.currentBattleParticipants || [];
        if (participants.length > 0 && !participants.includes(p)) {
            return true; // Salta SEMPRE il turno di chi non partecipa
        }
    }
    // Comportamento normale per gli altri casi
    return _cn_origIsPlayerEliminated ? _cn_origIsPlayerEliminated(p) : false;
};

// 2. Spazza via le basi dalla mappa all'inizio di ogni turno (infallibile, agisce a partita avviata)
const _cn_cleanHqResetTurnState = window.resetTurnState;
window.resetTurnState = function() {
    if (typeof campaignState !== 'undefined' && campaignState.isActive) {
        const participants = campaignState.currentBattleParticipants || [];
        if (participants.length > 0) {
            
            // Elimina fisicamente le entità HQ non autorizzate dalla griglia grafica
            grid.forEach(cell => {
                if (cell.entity && cell.entity.type === 'hq' && !participants.includes(cell.entity.faction)) {
                    cell.entity = null;
                }
            });
            
            // Azzera i dati dei giocatori fantasma
            for (let p = 1; p <= 4; p++) {
                if (!participants.includes(p) && players[p]) {
                    players[p].hq = null;
                    players[p].agents = [];
                }
            }
        }
    }
    
    // Esegue il reset del turno normale
    if (_cn_cleanHqResetTurnState) _cn_cleanHqResetTurnState();
};