/* ============================================================
   campaign_net_client.js — Campagna Multiplayer: Hook e Integrazione
   ============================================================
   RESPONSABILITÀ:
   - campaignSendAction(): wrapper invio azioni client → host
   - Hook window.*: intercetta le funzioni di gioco esistenti
     (handleSectorClick, finishPlayerTurn, skipPlayerTurn,
      startCampaign, startCampaignBattle, confirmPlayerSetup,
      showBattleResults, startNextPlanningRound, processConflicts,
      renderCampaignMap, _eco_cancelOrder, ...)
   - UI helpers: badge "non è il tuo turno", lock/unlock mappa,
     _cn_allocAdd/_cn_allocRemove
   - startOnlineCampaign(): entry point avvio campagna online

   DIPENDE DA: campaign_net_host.js (deve essere caricato prima)
   CARICATO DA: index.html — dopo campaign_net_host.js
   ============================================================ */

// INTEGRAZIONE CON ESISTENTE: hook sendOnlineMessage campagna
// ─────────────────────────────────────────────────────────────

/**
 * Invia un'azione campagna se siamo online e non host.
 * Wrapper chiamato da handleSectorClick, finishPlayerTurn, ecc.
 */
function campaignSendAction(actionType, payload) {
    if (isCampaignOnline && !isHost) {
        _cn_clientSendAction(actionType, payload);
    }
}

// ─────────────────────────────────────────────────────────────
// HOOK: handleHostReceivedData — intercetta messaggi campagna
// ─────────────────────────────────────────────────────────────

const _cn_origHandleHostReceivedData = typeof handleHostReceivedData !== 'undefined'
    ? window.handleHostReceivedData
    : null;

window.handleHostReceivedData = function(data, fromPlayer) {
    if (data.type === 'CAMPAIGN_ACTION') {
        _cn_handleHostReceivedCampaignMsg(data, fromPlayer);
        return;
    }
    if (_cn_origHandleHostReceivedData) {
        _cn_origHandleHostReceivedData(data, fromPlayer);
    }
};

// ─────────────────────────────────────────────────────────────
// HOOK: handleClientReceivedData — intercetta messaggi campagna
// ─────────────────────────────────────────────────────────────

const _cn_origHandleClientReceivedData = typeof handleClientReceivedData !== 'undefined'
    ? window.handleClientReceivedData
    : null;

window.handleClientReceivedData = function(data) {
    if (data.type === 'CAMPAIGN_STATE_SYNC' ||
        data.type === 'CAMPAIGN_BATTLE_START' ||
        data.type === 'CAMPAIGN_BATTLE_RESULT' ||
        data.type === 'CAMPAIGN_INCOME_NOTICE' ||
        data.type === 'CAMPAIGN_OPEN_CREDIT_SELECTOR') {
        _cn_handleClientReceivedCampaignMsg(data);
        return;
    }
    if (_cn_origHandleClientReceivedData) {
        _cn_origHandleClientReceivedData(data);
    }
};

// ─────────────────────────────────────────────────────────────
// HOOK: setupHostConnection — invia sync campagna ai nuovi client
// ─────────────────────────────────────────────────────────────

const _cn_origSetupHostConnection = typeof setupHostConnection !== 'undefined'
    ? window.setupHostConnection
    : null;

window.setupHostConnection = function(c, playerNum) {
    if (_cn_origSetupHostConnection) {
        _cn_origSetupHostConnection(c, playerNum);
    }
    // Se la campagna è attiva, invia snapshot al client appena connesso
    if (isCampaignOnline && isHost && campaignState.isActive) {
        setTimeout(() => {
            if (c.open) {
                try {
                    c.send({
                        type:  'CAMPAIGN_STATE_SYNC',
                        state: _cn_buildCampaignSnapshot(),
                    });
                } catch(e) {}
            }
        }, 600);
    }
};

// ─────────────────────────────────────────────────────────────
// HOOK: renderCampaignMap — aggiunge badge turno per client
// ─────────────────────────────────────────────────────────────

const _cn_origRenderCampaignMap = window.renderCampaignMap;
window.renderCampaignMap = function() {
    if (_cn_origRenderCampaignMap) _cn_origRenderCampaignMap();
    if (!isCampaignOnline) return;

    const isMyTurn = (campaignState.currentPlayer === myPlayerNumber);

    if (!isMyTurn) {
        _cn_showNotYourTurnBadge();
        _cn_lockMapInteraction();
    } else {
        _cn_removeNotYourTurnBadge();
        _cn_unlockMapInteraction();
        // Fix: abilita il tasto CONFERMA se ci sono ordini pendenti (non solo pendingMoves)
        _cn_fixConfirmButtonState();
    }
};

// ─────────────────────────────────────────────────────────────
// HOOK: processConflicts — host online salta la summary UI
// e invia direttamente snapshot ai client con phase=RESOLVING
// ─────────────────────────────────────────────────────────────

const _cn_origProcessConflicts = window.processConflicts;
window.processConflicts = function() {
    if (!isCampaignOnline || !isHost) {
        if (_cn_origProcessConflicts) _cn_origProcessConflicts();
        return;
    }

    // Per l'host online usiamo la logica di campaign_battles.js
    // ma intercettiamo prima che chiami _bat_showConflictSummary.
    // Ricalcoliamo qui direttamente:
    campaignState.phase = 'RESOLVING';
    campaignState.battleQueue = [];
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
        if (sector.owner > 0 && !participants.has(sector.owner)) participants.add(sector.owner);

        const battleCredits = {};
        attackers.forEach(a => { battleCredits[a.p] = a.credits; });

        if (sector.owner > 0) {
            let defCr = campaignState.sectorCredits[sector.id]?.[sector.owner] || 0;
            // NON azzeriamo sectorCredits qui: li azzeriamo solo quando la battaglia
            // effettivamente inizia (in startCampaignBattle), così la mappa mostra
            // i crediti corretti fino all'avvio della partita.
            if (sector.specialization === 'FORTEZZA') {
                campaignState.adj[sector.id].forEach(adjId => {
                    const adj = campaignState.sectors[adjId];
                    if (adj.owner === sector.owner) {
                        defCr += (campaignState.sectorCredits[adjId]?.[sector.owner] || 0);
                        // Non azzeriamo neanche i settori adiacenti qui
                    }
                });
            }
            battleCredits[sector.owner] = defCr;
        }

        if (participants.size > 1 && (sector.owner === 0 || (battleCredits[sector.owner] || 0) > 3)) {
            campaignState.battleQueue.push({
                sectorId: sector.id,
                factions: Array.from(participants),
                battleCredits
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
    // NO summary UI — finishPlayerTurn hook gestisce broadcast e batttaglie
};

// ─────────────────────────────────────────────────────────────
// HOOK: startCampaign — versione multiplayer
// ─────────────────────────────────────────────────────────────

const _cn_origStartCampaign = window.startCampaign;
window.startCampaign = function(numPlayers) {
    // Modalità multiplayer online?
    if (isOnline && isHost) {
        isCampaignOnline = true;
        campaignMyFaction = myPlayerNumber;
    } else if (isOnline && !isHost) {
        // I client non avviano la campagna da soli
        isCampaignOnline = true;
        campaignMyFaction = myPlayerNumber;
        return;
    }

    // Avvia normalmente (solo host o locale)
    _cn_origStartCampaign(numPlayers);

    // Host: broadcast immediato dopo l'inizializzazione
    if (isCampaignOnline && isHost) {
        setTimeout(() => {
            _cn_hostBroadcastCampaignState();
        }, 200);
    }
};

// ─────────────────────────────────────────────────────────────
// HOOK: finishPlayerTurn — client invia CONFIRM_ORDER
// ─────────────────────────────────────────────────────────────

const _cn_origFinishPlayerTurn = window.finishPlayerTurn;
window.finishPlayerTurn = function() {
    if (isCampaignOnline && !isHost) {
        const panel = document.getElementById('eco-orders-panel');
        if (panel) panel.remove();
        campaignSendAction('CONFIRM_ORDER', {});
        return; // Il client aspetta la risposta dell'host
    }

    if (_cn_origFinishPlayerTurn) {
        _cn_origFinishPlayerTurn();
    }

    // Host: broadcast dopo la conferma
    if (isCampaignOnline && isHost) {
        if (campaignState.phase === 'RESOLVING') {
            // Manda snapshot con coda battaglie ai client,
            // poi avvia la prima battaglia dopo breve pausa
            // (la conflict summary UI è soppressa per l'host online — vedi hook sotto)
            _cn_hostBroadcastCampaignState();
            setTimeout(() => _cn_hostRunNextBattle(), 800);
        } else {
            _cn_hostBroadcastCampaignState();
        }
    }
};

// ─────────────────────────────────────────────────────────────
// HOOK: skipPlayerTurn
// ─────────────────────────────────────────────────────────────

const _cn_origSkipPlayerTurn = window.skipPlayerTurn;
window.skipPlayerTurn = function() {
    if (isCampaignOnline && !isHost) {
        campaignSendAction('SKIP_TURN', {});
        return;
    }
    if (_cn_origSkipPlayerTurn) _cn_origSkipPlayerTurn();
    if (isCampaignOnline && isHost) {
        if (campaignState.phase === 'RESOLVING') {
            setTimeout(() => _cn_hostRunNextBattle(), 1500);
        } else {
            _cn_hostBroadcastCampaignState();
        }
    }
};

// ─────────────────────────────────────────────────────────────
// HOOK: handleSectorClick — client invia azione al posto di agire
// ─────────────────────────────────────────────────────────────

const _cn_origHandleSectorClick = window.handleSectorClick;
window.handleSectorClick = function(targetId) {
    if (isCampaignOnline && !isHost) {
        // Verifica che sia il turno del client
        if (campaignState.currentPlayer !== myPlayerNumber) {
            showTemporaryMessage('Non è il tuo turno!');
            return;
        }
        // Invia al host; l'host risponde con snapshot aggiornato
        campaignSendAction('SECTOR_CLICK', { sectorId: targetId });
        return;
    }
    if (_cn_origHandleSectorClick) _cn_origHandleSectorClick(targetId);
    if (isCampaignOnline && isHost) _cn_hostBroadcastCampaignState();
};

// ─────────────────────────────────────────────────────────────
// HOOK: startCampaignBattle — usa il flusso di rete per le battaglie online
// ─────────────────────────────────────────────────────────────

const _cn_origStartCampaignBattle = window.startCampaignBattle;
window.startCampaignBattle = function(factions, sectorId) {
    if (!isCampaignOnline) {
        if (_cn_origStartCampaignBattle) _cn_origStartCampaignBattle(factions, sectorId);
        return;
    }

    campaignState.targetSector = sectorId;
    campaignState.currentBattleParticipants = factions.slice().sort((a, b) => a - b);
    campaignState._hasReceivedFirstIncome = {};
    factions.forEach(f => { campaignState._hasReceivedFirstIncome[f] = false; });

    totalPlayers = 4;
    resetPlayers();

    // 1. Assegna crediti o elimina le basi di chi non gioca
    for (let p = 1; p <= 4; p++) {
        players[p].isDisconnected = !factions.includes(p);
        if (factions.includes(p)) {
            const battle = campaignState._currentBattle;
            const bc = battle?.battleCredits?.[p];
            players[p].credits = bc !== undefined ? bc : (campaignState.credits[p] ?? 10);
        } else {
            // Elimina la base
            if (players[p].hq) {
                const hq = players[p].hq;
                const cell = grid.get(getKey(hq.q, hq.r));
                if (cell && cell.entity === hq) cell.entity = null; 
                players[p].hq = null; 
            }
        }
    }

    if (isHost) {
        onlineTotalPlayers = 4;
        playersReady = { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false, 7: false, 8: false };
        clientSetupBuffer = {};

        // 2. Segna ISTANTANEAMENTE come "Pronti" i giocatori assenti, così non bloccano la lobby
        for (let p = 1; p <= 4; p++) {
            if (!factions.includes(p)) {
                onlineAIFactions.delete(p);
                players[p].isDisconnected = true;
                players[p].agents = [];
                players[p].cards = [];
                playersReady[p] = true; // IMPORTANTISSIMO: L'assente è considerato "pronto"
            } else {
                onlineAIFactions.delete(p);
            }
        }

        document.getElementById('campaign-overlay').style.display = 'none';
        const specOv = document.getElementById('cn-spectate-overlay');
        if (specOv) specOv.remove();

        // 3. Se l'Host partecipa alla battaglia: mostra il menu di setup!
        if (factions.includes(myPlayerNumber)) {
            state = 'SETUP_P1';
            document.getElementById('setup-overlay').style.display = 'flex';
            currentPlayer = myPlayerNumber;
            _cn_restoreSetupBox(); // <--- FIX GRAFICO: Ricostruisce il menu (sparisce la scritta "Pronto")
            setupData = freshSetupData();
            updateSetupUI();
        } else {
            // 4. L'Host fa da SPETTATORE
            playersReady[myPlayerNumber] = true; // L'Host è "pronto" a guardare
            
            const overlay = document.createElement('div');
            overlay.id = 'cn-spectate-overlay';
            overlay.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%;
                background:rgba(5,5,9,0.96); z-index:99990; display:flex; flex-direction:column; 
                align-items:center; justify-content:center; font-family:'Courier New'; color:#fff; text-align:center;`;
            const names = factions.map(p => `<span style="color:${COLORS['p'+p]};">${players[p]?.name || 'P'+p}</span>`).join(' vs ');
            overlay.innerHTML = `<div style="font-size:3em; margin-bottom:20px;">⚔️</div>
                <h2 style="color:#ff4444; margin-bottom:8px;">BATTAGLIA IN CORSO</h2>
                <p style="font-size:1.2em; margin-bottom:12px;">Settore <strong>${sectorId}</strong></p>
                <p style="color:#aaa; font-size:1.1em;">${names}</p>
                <p style="color:#555; margin-top:20px;">Non sei un partecipante — fai da arbitro e attendi il risultato.</p>`;
            document.body.appendChild(overlay);

            tryHostStart(); // Controlla subito se i client sono già pronti
        }

    } else {
        // Logica Client
        if (!factions.includes(myPlayerNumber)) {
            return; // Il client spettatore ha già l'interfaccia gestita altrove
        }

        document.getElementById('campaign-overlay').style.display = 'none';
        const specOv = document.getElementById('cn-spectate-overlay');
        if (specOv) specOv.remove();

        state = 'SETUP_P1';
        document.getElementById('setup-overlay').style.display = 'flex';
        currentPlayer = myPlayerNumber;
        _cn_restoreSetupBox(); // <--- FIX GRAFICO CLIENT
        setupData = freshSetupData();
        updateSetupUI();
    }
};

// ─────────────────────────────────────────────────────────────
// HOOK: confirmPlayerSetup — in campagna online, usa il flusso di rete
// ─────────────────────────────────────────────────────────────

const _cn_origConfirmPlayerSetup = window.confirmPlayerSetup;
window.confirmPlayerSetup = function() {
    if (!isCampaignOnline) {
        if (_cn_origConfirmPlayerSetup) _cn_origConfirmPlayerSetup();
        return;
    }

    if (setupData.agents.length === 0) {
        if (typeof showTemporaryMessage === 'function') showTemporaryMessage('Devi reclutare almeno un agente!');
        return;
    }

    players[currentPlayer].agents    = JSON.parse(JSON.stringify(setupData.agents));
    players[currentPlayer].credits   = setupData.points;
    players[currentPlayer].cards     = typeof getFinalCardSelection === 'function' ? getFinalCardSelection() : [];
    players[currentPlayer].usedCards = {};

    if (campaignState.isActive) {
        campaignState.sectors.forEach(s => {
            if (s.owner === currentPlayer && s.specialization) {
                players[currentPlayer].agents.forEach(agent => {
                    if (s.specialization === 'ARSENALE') agent.dmg += 1;
                    else if (s.specialization === 'FORGIA') { agent.maxHp += 1; agent.hp += 1; }
                });
            }
        });
    }

    if (isHost) {
        playersReady[currentPlayer] = true;
        clientSetupBuffer[currentPlayer] = players[currentPlayer].agents;

        const waitMsg = `<h2 style='color:white;text-align:center'>Pronto!<br>
            <span style='font-size:14px;color:#aaa'>Attendi che tutti i giocatori siano pronti...</span></h2>`;
        document.getElementById('setup-box').innerHTML = waitMsg;

        tryHostStart(); // L'host controlla se tutti (reali e vuoti) sono pronti

    } else {
        sendOnlineMessage({
            type:    'SETUP_DONE',
            agents:  players[myPlayerNumber].agents,
            cards:   players[myPlayerNumber].cards,
            credits: setupData.points // FIX: Invia i crediti residui
        });
        document.getElementById('setup-box').innerHTML = `
            <h2 style='color:white;text-align:center'>Setup inviato!<br>
            <span style='font-size:14px;color:#aaa'>Attendi che l'Host avvii la battaglia...</span></h2>
        `;
    }
};

/**
 * Ripristina la struttura DOM originale di #setup-box.
 * Necessario quando il setup della lobby online ha sostituito il contenuto
 * con "Setup inviato!" — distruggendo gli elementi figli come #setup-title,
 * #pts-count, #confirm-setup-btn, #agents-market, ecc.
 * Senza questo ripristino updateSetupUI() crasha su getElementById() = null.
 */
function _cn_restoreSetupBox() {
    const box = document.getElementById('setup-box');
    if (!box) return;

    // Controlla se i child elements necessari esistono ancora
    if (document.getElementById('setup-title') &&
        document.getElementById('pts-count') &&
        document.getElementById('confirm-setup-btn') &&
        document.getElementById('agents-market')) {
        return; // Struttura intatta, nessun ripristino necessario
    }

    // Ricostruisce la struttura originale del setup-box (da index.html)
    box.innerHTML = `
        <div id="setup-header">
            <h1 id="setup-title" class="text-p1">Fase Setup</h1>
            <div id="setup-points-display">
                Punti Rimasti: <span id="pts-count" style="font-weight:bold; font-size:1.4em">10</span>
            </div>
            <button class="action-btn p1-theme" onclick="addNewAgentToMarket()"
                    style="font-size:12px; padding:10px 20px">
                + Recluta Agente (Costo: 4)
            </button>
        </div>
        <div id="agents-market"></div>
        <div id="card-selection-panel"></div>
        <button class="action-btn p1-theme" id="confirm-setup-btn" onclick="confirmPlayerSetup()"
                style="width:100%; font-size:16px; padding:15px">
            Conferma Operativi
        </button>
    `;
}

function _cn_autoGenerateSetup(faction) {
    const spriteOffset = (faction - 1) * 4;
    const agents = [];
    for (let i = 0; i < 3; i++) {
        const hp = Math.floor(Math.random() * 4) + 2;
        agents.push({
            id: crypto.randomUUID(), type: 'agent', faction,
            sprite: getRandomSprite(SPRITE_POOLS[faction]),
            customSpriteId: `AG${i + 1 + spriteOffset}`,
            hp, maxHp: hp,
            mov: Math.floor(Math.random() * 2) + 2,
            rng: Math.floor(Math.random() * 3) + 2,
            dmg: Math.floor(Math.random() * 3) + 2,
            ap: GAME.AP_PER_TURN, q: 0, r: 0, firstTurnImmune: true
        });
    }
    players[faction].agents    = agents;
    players[faction].cards     = [];
    players[faction].usedCards = {};
    clientSetupBuffer[faction] = agents;
    playersReady[faction]      = true;
}

// ─────────────────────────────────────────────────────────────
// HOOK: showBattleResults (fine partita in campagna online)
// ─────────────────────────────────────────────────────────────

const _cn_origShowBattleResults = window.showBattleResults;
window.showBattleResults = function(winnerFaction) {
    if (!isCampaignOnline) {
        if (_cn_origShowBattleResults) _cn_origShowBattleResults(winnerFaction);
        return;
    }

    if (isHost) {
        // Host calcola risultati e aggiorna campagna
        _cn_origShowBattleResults(winnerFaction);

        // Calcola i risultati da inviare
        const participants = campaignState.currentBattleParticipants;

        const results = {};
        participants.forEach(faction => {
            const shopResidual  = Math.max(0, players[faction]?.credits || 0);
            const survivorValue = typeof _bat_agentSurvivorValue === 'function'
                ? _bat_agentSurvivorValue(faction) : 0;
            results[faction] = { shopResidual, survivorValue, total: shopResidual + survivorValue };
        });

        // Broadcast risultati e snapshot aggiornato a tutti i client
        broadcastToClients({
            type:         'CAMPAIGN_BATTLE_RESULT',
            winnerFaction,
            sectorId:     campaignState.targetSector,
            results,
            campaignSnap: _cn_buildCampaignSnapshot(),
        });
    } else {
        // Client: blocca la logica locale — il risultato arriva via CAMPAIGN_BATTLE_RESULT
        // Nascondi la schermata di fine partita locale se presente
        const gameOver = document.getElementById('gameover-overlay');
        if (gameOver) gameOver.style.display = 'none';
        // Non fare nulla — aspetta il messaggio dall'host
        console.log('[CampaignNet] Client: attendo CAMPAIGN_BATTLE_RESULT dall\'host...');
    }
};

// ─────────────────────────────────────────────────────────────
// HOOK: startNextPlanningRound (dopo le battaglie)
// ─────────────────────────────────────────────────────────────

const _cn_origStartNextPlanningRound = window.startNextPlanningRound;
window.startNextPlanningRound = function() {
    if (!isCampaignOnline) {
        if (_cn_origStartNextPlanningRound) _cn_origStartNextPlanningRound();
        return;
    }

    if (isHost) {
        if (_cn_origStartNextPlanningRound) _cn_origStartNextPlanningRound();

        // Costruisce earned per i client
        const earned = {};
        for (let p = 1; p <= campaignState.numPlayers; p++) earned[p] = 0;
        campaignState.sectors.forEach(s => {
            if (s.owner > 0 && s.owner <= campaignState.numPlayers) earned[s.owner] += (s.income || 2);
        });

        broadcastToClients({
            type:         'CAMPAIGN_INCOME_NOTICE',
            earned,
            campaignSnap: _cn_buildCampaignSnapshot(),
        });
    }
    // Client: aspetta CAMPAIGN_INCOME_NOTICE → renderCampaignMap
};

// ─────────────────────────────────────────────────────────────
// HOOK: _eco_cancelOrder (click ✕ su ordine nella sidebar)
// ─────────────────────────────────────────────────────────────

const _cn_origCancelOrder = window._eco_cancelOrder;
window._eco_cancelOrder = function(playerFaction, sectorId) {
    if (isCampaignOnline && !isHost) {
        campaignSendAction('CANCEL_ORDER', { sectorId });
        return;
    }
    if (_cn_origCancelOrder) _cn_origCancelOrder(playerFaction, sectorId);
    if (isCampaignOnline && isHost) _cn_hostBroadcastCampaignState();
};

// ─────────────────────────────────────────────────────────────
// HOOK: allocazione crediti settore (+/-)
// Gli overlay con +/- sono generati da renderCampaignMap in campaign_sectors.js.
// Intercettiamo le funzioni bPlus.onclick e bMinus.onclick tramite
// un proxy sullo stato (modificare campaignState lato client non ha effetto,
// ma mandiamo l'azione all'host).
// ─────────────────────────────────────────────────────────────

// Inietta funzioni globali che il DOM può chiamare direttamente
window._cn_allocAdd = function(sectorId) {
    // Guard: only the player whose turn it is can allocate credits
    if (isCampaignOnline && campaignState.currentPlayer !== myPlayerNumber) return;
    if (isCampaignOnline && !isHost) {
        campaignSendAction('ADD_SECTOR_CREDIT', { sectorId });
    } else {
        const p = campaignState.currentPlayer;
        if (!campaignState.sectorCredits[sectorId]) campaignState.sectorCredits[sectorId] = {};
        if (campaignState.credits[p] > 0) {
            campaignState.sectorCredits[sectorId][p] = (campaignState.sectorCredits[sectorId][p] || 0) + 1;
            campaignState.credits[p]--;
            renderCampaignMap();
        }
        if (isCampaignOnline && isHost) _cn_hostBroadcastCampaignState();
    }
};

window._cn_allocRemove = function(sectorId) {
    // Guard: only the player whose turn it is can allocate credits
    if (isCampaignOnline && campaignState.currentPlayer !== myPlayerNumber) return;
    if (isCampaignOnline && !isHost) {
        campaignSendAction('REMOVE_SECTOR_CREDIT', { sectorId });
    } else {
        const p = campaignState.currentPlayer;
        if (!campaignState.sectorCredits[sectorId]) return;
        const cur = campaignState.sectorCredits[sectorId][p] || 0;
        if (cur > 0) {
            campaignState.sectorCredits[sectorId][p]--;
            campaignState.credits[p]++;
            renderCampaignMap();
        }
        if (isCampaignOnline && isHost) _cn_hostBroadcastCampaignState();
    }
};

// ─────────────────────────────────────────────────────────────
// UI CLIENT — badge "non è il tuo turno"
// ─────────────────────────────────────────────────────────────

function _cn_showNotYourTurnBadge() {
    let badge = document.getElementById('cn-not-your-turn-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'cn-not-your-turn-badge';
        badge.style.cssText = `
            position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
            background:rgba(0,0,0,0.88); border:2px solid #555;
            color:#888; font-family:'Courier New',monospace;
            font-size:14px; padding:10px 24px; border-radius:8px;
            z-index:20000; text-align:center; pointer-events:none;
        `;
        document.body.appendChild(badge);
    }
    const currP   = campaignState.currentPlayer;
    const pColor  = COLORS['p' + currP] || '#aaa';
    const pName   = players[currP]?.name || 'P' + currP;
    const myColor = COLORS['p' + myPlayerNumber] || '#00ff88';
    const myName  = players[myPlayerNumber]?.name || 'Tu';
    badge.innerHTML = `In attesa degli ordini di <span style="color:${pColor};font-weight:bold;">${pName}</span>
        &nbsp;|&nbsp; <span style="color:${myColor};">Sei: ${myName}</span>`;
}

function _cn_removeNotYourTurnBadge() {
    const badge = document.getElementById('cn-not-your-turn-badge');
    if (badge) badge.remove();
}

/**
 * Disabilita i click sui settori della mappa campagna e nasconde i bottoni azione.
 * Chiamato quando non è il turno del giocatore locale.
 */
function _cn_lockMapInteraction() {
    // Disabilita pointer-events su tutti i settori SVG
    const sectorsDiv = document.getElementById('map-sectors');
    if (sectorsDiv) sectorsDiv.style.pointerEvents = 'none';

    // Disabilita anche tutti gli overlay economici (+/− crediti)
    // che hanno pointer-events:auto e sovrascriverebbero il parent
    if (sectorsDiv) {
        sectorsDiv.querySelectorAll('.eco-html-overlay').forEach(el => {
            el.style.pointerEvents = 'none';
        });
    }

    // Nascondi CONFERMA e PASSA
    const actionsDiv = document.getElementById('campaign-actions');
    if (actionsDiv) actionsDiv.style.visibility = 'hidden';

    // Rimuovi pannello ordini dell'altro giocatore se visibile
    const ordersPanel = document.getElementById('eco-orders-panel');
    if (ordersPanel) ordersPanel.remove();
}

/**
 * Riabilita i click sui settori e mostra i bottoni azione.
 * Chiamato quando è il turno del giocatore locale.
 */
function _cn_unlockMapInteraction() {
    const sectorsDiv = document.getElementById('map-sectors');
    if (sectorsDiv) sectorsDiv.style.pointerEvents = '';

    const actionsDiv = document.getElementById('campaign-actions');
    if (actionsDiv) actionsDiv.style.visibility = 'visible';
}

/**
 * Corregge lo stato del bottone CONFERMA dopo renderCampaignMap.
 * Il codice base controlla pendingMoves[p], ma per i client online
 * gli ordini sono in pendingOrders[p]. Abilitiamo se ci sono ordini.
 */
function _cn_fixConfirmButtonState() {
    const actionsDiv = document.getElementById('campaign-actions');
    if (!actionsDiv) return;
    const confirmBtn = actionsDiv.querySelector('.action-btn:first-child');
    if (!confirmBtn) return;
    const p      = campaignState.currentPlayer;
    const orders = campaignState.pendingOrders?.[p] || [];
    // Abilitato se ci sono ordini oppure se c'è almeno un pendingMove
    const hasOrders = orders.length > 0 || (campaignState.pendingMoves?.[p] !== undefined);
    confirmBtn.disabled = !hasOrders;
}

// ─────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────

function _cn_hostSendCampaignStateTo(playerNum) {
    if (!isOnline || !isHost) return;
    const c = clientConns[playerNum];
    if (c && c.open) {
        try {
            c.send({
                type:  'CAMPAIGN_STATE_SYNC',
                state: _cn_buildCampaignSnapshot(),
            });
        } catch(e) {}
    }
}

// ─────────────────────────────────────────────────────────────
// AVVIO CAMPAGNA ONLINE — aggiunta bottone nel menu
// ─────────────────────────────────────────────────────────────

/**
 * Avvia la campagna in modalità multiplayer (2-4P online).
 * Chiamato dall'Host dopo che tutti i giocatori sono connessi.
 */
function startOnlineCampaign(numPlayers) {
    if (!isOnline || !isHost) {
        alert('Solo l\'Host può avviare la campagna online!');
        return;
    }
    isCampaignOnline   = true;
    campaignMyFaction  = myPlayerNumber; // = 1

    // Avvia lato host
    startCampaign(numPlayers || onlineTotalPlayers);
}

console.log('[campaign_network.js] Caricato — Campagna Multiplayer pronta.');

