/* ============================================================
   campaign_battle.js  —  CAMPAGNA: CONFLITTI, BATTAGLIE E RISULTATI
   ============================================================
   RESPONSABILITÀ:
   - Risoluzione conflitti al termine di ogni round di pianificazione
   - Avvio battaglie tattiche (startCampaignBattle, runNextBattle)
   - Override delle funzioni di gioco per il contesto campagna
     (freshSetupData, resetTurnState, confirmPlayerSetup, showGameOverlay)
   - Visualizzazione risultati battaglia e aggiornamento mappa
   - Controllo vittoria campagna (checkCampaignWin)
   - Stub funzioni network campagna

   ESPONE: processConflicts, runNextBattle, startCampaignBattle,
           showBattleResults, checkCampaignWin

   DIPENDE DA: constants.js (CAMPAIGN, GAME), state.js,
               campaign_map.js (campaignState, renderCampaignMap)
   CARICATO DOPO: campaign_map.js
   ============================================================ */

// ============================================================
// RISOLUZIONE CONFLITTI
// ============================================================

function processConflicts() {
    // 1. I Client si mettono in attesa, non calcolano nulla localmente.
    if (window.isCampaignOnline && !window.isHost) {
        console.log("[Campaign] Client in attesa di risoluzione dall'Host...");
        campaignState.phase = 'RESOLVING';
        renderCampaignMap();
        return; 
    }

    // =========================================================
    // DA QUI IN POI ESEGUE SOLO L'HOST (O IL GIOCO IN LOCALE)
    // =========================================================

    // --- FASE 1: ESECUZIONE SABOTAGGI ---
    // Vengono calcolati PRIMA degli attacchi. Così il settore si blocca
    // e gli attacchi successivi verso questo settore andranno a vuoto.
    for (let p = 1; p <= campaignState.numPlayers; p++) {
        const orders = campaignState.pendingOrders[p] || [];
        orders.forEach(order => {
            if (order.isSabotage) {
                // Esegue l'effetto reale sulla mappa! 
                // Costo 0 perché i crediti sono già stati scalati in fase di pianificazione.
                _applyNuclearize(order.sectorId, p, 0); 
            }
        });
    }

    // --- FASE 2: PREPARAZIONE BATTAGLIE E CONQUISTE ---
    campaignState.battleQueue = [];
    const orders = campaignState.pendingOrders || {};
    const sectorMap = {};
    campaignState.sectors.forEach(s => { sectorMap[s.id] = { attackers: [], defender: s.owner }; });

    for (let p = 1; p <= campaignState.numPlayers; p++) {
        (orders[p] || []).forEach(o => {
            // Salta i sabotaggi, sono già stati risolti nella FASE 1
            if (o.isSabotage) return; 
            if (sectorMap[o.sectorId]) sectorMap[o.sectorId].attackers.push({ p, credits: o.credits });
        });
    }

    // --- FASE 3: RISOLUZIONE DEI SETTORI ---
    campaignState.sectors.forEach(sector => {
        // Se il settore è bloccato (es. appena nuclearizzato nella FASE 1)
        if (sector.blocked) {
            const { attackers } = sectorMap[sector.id];
            if (attackers.length > 0) {
                // I crediti investiti dagli attaccanti si bruciano e l'attacco si annulla
                console.log(`Attacchi annullati su settore nuclearizzato (${sector.id}). Crediti bruciati.`);
            }
            return; 
        }

        const { attackers } = sectorMap[sector.id];
        if (attackers.length === 0) return;
        
        const participants = new Set(attackers.map(a => a.p));
        if (sector.owner > 0 && !participants.has(sector.owner)) participants.add(sector.owner);

        const bCredits = {};
        attackers.forEach(a => { bCredits[a.p] = a.credits; });
        
        if (sector.owner > 0) {
            let defCr = campaignState.sectorCredits[sector.id]?.[sector.owner] || 0;
            // Specializzazione FORTEZZA: aggiunge crediti dai settori adiacenti
            if (sector.specialization === 'FORTEZZA') {
                campaignState.adj[sector.id].forEach(adjId => {
                    const adj = campaignState.sectors[adjId];
                    if (adj?.owner === sector.owner) defCr += (campaignState.sectorCredits[adjId]?.[sector.owner] || 0);
                });
            }
            // Upgrade FORTEZZA: +crediti fissi in difesa
            if (sector.fortressUpgrade) {
                defCr += CAMPAIGN.UPGRADE_FORTRESS_COST / 2;   // es. 10/2 = +5
            }
            bCredits[sector.owner] = defCr;
        }

        // CAMPO MINATO: ferma gli attaccanti sul posto
        if (sector.mineField && sector.owner > 0 && attackers.length > 0) {
            sector.mineField = false;               // consumato
            sector._mineFieldJustTriggered = true;  // flag per mostrare notifica riepilogo
            return; 
        }

        // Condizione per avviare una battaglia campale
        if (participants.size > 1 && (sector.owner === 0 || (bCredits[sector.owner] || 0) >= 4)) {
            campaignState.battleQueue.push({ sectorId: sector.id, factions: Array.from(participants), battleCredits: bCredits });
        } else {
            // Conquista pacifica o automatica
            const winner = attackers[0].p;
            sector.owner = winner;
            if (!campaignState.sectorCredits[sector.id]) campaignState.sectorCredits[sector.id] = {};
            campaignState.sectorCredits[sector.id][winner] = (campaignState.sectorCredits[sector.id][winner] || 0) + (attackers[0].credits || 0);
        }
    });

    // Termine risoluzione: L'host avvisa i client
    if (window.isCampaignOnline && window.isHost) {
        if (typeof _net_broadcast === 'function') {
            _net_broadcast({ 
                type: 'CAMPAIGN_CONFLICT_SUMMARY', 
                campaignSnap: typeof _net_buildSnapshot === 'function' ? _net_buildSnapshot() : null 
            });
        }
        _showConflictSummary();
    } else {
        _showConflictSummary();
    }
}
window.processConflicts = processConflicts;

function _showConflictSummary() {
    const n = campaignState.numPlayers;
    const battles = campaignState.battleQueue;
    const peaceful = [];
    const minefieldsTriggered = [];
    const nuclearStrikes = []; // Registro sabotaggi
    const artilleryStrikes = campaignState._roundLog || []; // Registro artiglieria

    campaignState.sectors.forEach(s => {
        for (let p = 1; p <= n; p++) {
            (campaignState.pendingOrders[p] || []).forEach(o => {
                // Se è un attacco normale ed è finito in conquista pacifica
                if (o.sectorId === s.id && s.owner === p && !o.isSabotage && !battles.some(b => b.sectorId === s.id))
                    peaceful.push({ p, sid: s.id });
                
                // Se è un sabotaggio nucleare (viene risolto in Fase 1 di processConflicts)
                if (o.sectorId === s.id && o.isSabotage)
                    nuclearStrikes.push({ p, sid: s.id });
            });
        }
        if (!s.mineField && s._mineFieldJustTriggered) {
            minefieldsTriggered.push(s.id);
            delete s._mineFieldJustTriggered;
        }
    });

    let html = `<div style="font-family:Courier New;color:#fff;padding:40px;background:rgba(10,15,25,0.95);
                    border:2px solid #555;border-radius:12px;max-width:900px;text-align:left;width:90%;box-shadow:0 0 40px rgba(0,0,0,0.8);
                    margin:auto;">
        <h1 style="color:#fff;text-align:center;margin-top:0;font-size:36px;letter-spacing:2px;border-bottom:1px solid #444;padding-bottom:15px;">RIEPILOGO ORDINI</h1>`;

    // AGGIUNTA: Sezione Sabotaggi e Artiglieria
    if (nuclearStrikes.length > 0 || artilleryStrikes.length > 0) {
        html += `<p style="color:#ff4444;font-size:22px;margin-top:20px;margin-bottom:12px;font-weight:bold;text-transform:uppercase;">☢️ ATTACCHI SPECIALI:</p>`;
        
        nuclearStrikes.forEach(hit => {
            const c = players[hit.p]?.color || COLORS['p' + hit.p];
            html += `<div style="color:${c};font-size:22px;margin-bottom:8px;padding-left:15px;border-left:4px solid #ff4444;">
                ☢️ ${players[hit.p]?.name || 'P'+hit.p} ha NUCLEARIZZATO il Settore ${hit.sid}</div>`;
        });

        artilleryStrikes.forEach(hit => {
            const c = players[hit.p]?.color || COLORS['p' + hit.p];
            html += `<div style="color:${c};font-size:22px;margin-bottom:8px;padding-left:15px;border-left:4px solid #00ff88;">
                🎯 ${players[hit.p]?.name || 'P'+hit.p} ha colpito con l'ARTIGLIERIA il Settore ${hit.sid}</div>`;
        });
    }

    if (peaceful.length > 0) {
        html += `<p style="color:#aaa;font-size:22px;margin-top:20px;margin-bottom:12px;font-weight:bold;text-transform:uppercase;">CONQUISTE PACIFICHE:</p>`;
        peaceful.forEach(({ p, sid }) => {
            const c = players[p]?.color || COLORS['p' + p];
            html += `<div style="color:${c};font-size:24px;margin-bottom:8px;padding-left:15px;border-left:4px solid ${c};">→ ${players[p]?.name || 'P'+p} conquista il Settore ${sid}</div>`;
        });
    }

    if (minefieldsTriggered.length > 0) {
        html += `<p style="color:#ff8800;font-size:22px;margin-top:30px;margin-bottom:12px;font-weight:bold;text-transform:uppercase;">🛸 DRONI-MINA ATTIVATI:</p>`;
        minefieldsTriggered.forEach(sid => {
            html += `<div style="font-size:22px;margin-bottom:10px;background:rgba(255,136,0,0.1);padding:10px;border-radius:8px;border-left:4px solid #ff8800;">
                💥 Settore ${sid}: gli attaccanti sono stati eliminati dalle mine!</div>`;
        });
    }

    if (battles.length > 0) {
        html += `<p style="color:#ff4444;font-size:22px;margin-top:30px;margin-bottom:12px;font-weight:bold;text-transform:uppercase;">⚔️ BATTAGLIE IMMINENTI:</p>`;
        battles.forEach(b => {
            const spec  = campaignState.sectors[b.sectorId].specialization
                ? SECTOR_SPECIALIZATIONS.find(s => s.id === campaignState.sectors[b.sectorId].specialization)?.label || '' : '';
            const names = b.factions.map(pid => {
                const c = players[pid]?.color || COLORS['p' + pid];
                const cr = b.battleCredits[pid] ?? '?';
                return `<span style="color:${c}">${players[pid]?.name || 'P'+pid} (💰${cr})</span>`;
            }).join(' vs ');
            html += `<div style="font-size:24px;margin-bottom:12px;background:rgba(255,50,50,0.1);padding:10px;border-radius:8px;">
                <strong>Settore ${b.sectorId} ${spec}:</strong><br>${names}</div>`;
        });
    }
    
    if (!peaceful.length && !battles.length && !minefieldsTriggered.length && !nuclearStrikes.length && !artilleryStrikes.length)
        html += `<p style="color:#888;text-align:center;font-size:24px;margin:30px 0;">Nessun movimento questo turno.</p>`;

    const btnAction = (window.isCampaignOnline && !window.isHost)
        ? `this.closest('.campaign-summary-overlay').remove(); if(typeof _net_clientSend==='function') _net_clientSend('SYNC_REQUEST',{}); if(typeof _prepareMapDOM==='function') _prepareMapDOM(); renderCampaignMap();`
        : `this.closest('.campaign-summary-overlay').remove(); runNextBattle();`;

    html += `<button class="action-btn"
        style="width:100%;margin-top:40px;border-color:#00ff88;color:#00ff88;font-size:28px;padding:15px;font-weight:bold;"
        onclick="${btnAction}">
        AVANTI ▶
    </button></div>`;

    const overlay = document.createElement('div');
    overlay.className = 'campaign-summary-overlay';
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.92);z-index:999999;display:flex;align-items:flex-start;justify-content:center;
        overflow-y:auto;padding:20px 0;box-sizing:border-box;`;
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
}

// ============================================================
// RENDITA
// ============================================================

function _collectIncome() {
    const n = campaignState.numPlayers;
    const earned = {};
    for (let p = 1; p <= n; p++) earned[p] = 0;
    campaignState.sectors.forEach(s => {
        if (s.owner > 0 && s.owner <= n) {
            campaignState.credits[s.owner] = (campaignState.credits[s.owner] || 0) + s.income;
            earned[s.owner] += s.income;
        }
    });
    return earned;
}

// ============================================================
// PROSSIMO ROUND DI PIANIFICAZIONE
// ============================================================

function startNextPlanningRound() {
    // Il client non guida mai questo flusso: aspetta lo snapshot dall'host
    if (window.isCampaignOnline && !window.isHost) {
        _net_clientSend('SYNC_REQUEST', {});
        return;
    }

    campaignState.pendingOrders = {};
    _collectIncome();

    // Procede direttamente al prossimo round (locale e online).
    // In multiplayer l'host chiama _doStartNextPlanningRound che fa broadcast
    // dello snapshot aggiornato; i client si sincronizzano via CAMPAIGN_STATE_SYNC
    // senza schermata di rendita intermedia, eliminando la race condition.
    _doStartNextPlanningRound();
}
window.startNextPlanningRound = startNextPlanningRound;

function _doStartNextPlanningRound() {
    // Ripristina i settori nuclearizzati usando il cooldown
    campaignState.sectors.forEach(s => {
        if (s._nuclearCooldown !== undefined && s._nuclearCooldown > 0) {
            s._nuclearCooldown--;
            // Si sblocca solo quando arriva a 0
            if (s._nuclearCooldown === 0) {
                s.blocked      = false;
                s.owner        = 0;
                s.income       = 1;
                if (!campaignState.sectorCredits[s.id]) campaignState.sectorCredits[s.id] = {};
            }
        }
    });
    
    campaignState.turnCount = (campaignState.turnCount || 1) + 1;
    campaignState.phase        = 'PLANNING';
    campaignState.currentPlayer = 1;
    campaignState._roundLog = [];
    campaignState.pendingMoves  = {};
    campaignState._allOrderedSectors = {};

    // Ripristina cariche artiglieria calcolando quanti edifici possiede ciascuno
    campaignState.artilleryCharges = {};
    for(let p = 1; p <= campaignState.numPlayers; p++) {
        const bonuses = getPlayerCampaignBonuses(p);
        campaignState.artilleryCharges[p] = bonuses.artilleryCount;
    }

    // --- NUOVO: SNAPSHOT INIZIO ROUND ---
    campaignState._creditsAtRoundStart = JSON.parse(JSON.stringify(campaignState.credits));
    campaignState._sectorCreditsAtRoundStart = JSON.parse(JSON.stringify(campaignState.sectorCredits || {}));
    campaignState._sectorsAtRoundStart = {};
    campaignState.sectors.forEach(s => {
        let snapObj = {};
        if (window.CAMPAIGN_UPGRADE_KEYS) {
            // Se esiste il dizionario dinamico, copiali tutti in automatico
            window.CAMPAIGN_UPGRADE_KEYS.forEach(k => {
                snapObj[k] = s[k] || false;
            });
        } else {
            // Fallback (non dovrebbe mai accadere, ma salva dai crash)
            snapObj.mineUpgrade     = s.mineUpgrade;
            snapObj.mineField       = s.mineField;
            snapObj.fortressUpgrade = s.fortressUpgrade;
        }
        campaignState._sectorsAtRoundStart[s.id] = snapObj;
    });
    // ------------------------------------

    while (campaignState.currentPlayer <= campaignState.numPlayers &&
           !campaignState.sectors.some(s => s.owner === campaignState.currentPlayer)) {
        campaignState.currentPlayer++;
    }
    if (checkCampaignWin()) return;

    saveCampaignSnapshot();
    
    if (window.isCampaignOnline && window.isHost) {
        if (typeof _net_hostBroadcast === 'function') _net_hostBroadcast();
    }
    
    renderCampaignMap();
}
window._doStartNextPlanningRound = _doStartNextPlanningRound;

// ============================================================
// GESTIONE BATTAGLIE
// ============================================================

function runNextBattle() {
    // Se un client preme "Avanti" sul riepilogo, chiede l'aggiornamento all'host e torna in attesa sulla mappa
    if (window.isCampaignOnline && !window.isHost) {
        if (typeof _net_clientSend === 'function') _net_clientSend('SYNC_REQUEST', {});
        if (typeof _prepareMapDOM === 'function') _prepareMapDOM();
        renderCampaignMap();
        return;
    }

    if (campaignState.battleQueue.length === 0) {
        startNextPlanningRound(); 
        return;
    }

    // Se siamo online e siamo l'host, usiamo la funzione di rete dedicata
    if (window.isCampaignOnline && window.isHost) {
        if (typeof _hostRunNextBattle === 'function') {
            _hostRunNextBattle(); 
            return;
        }
    }

    // Logica Locale (Hotseat o Fallback)
    const battle = campaignState.battleQueue.shift();
    campaignState._currentBattle = battle;
    startCampaignBattle(battle.factions, battle.sectorId);
}
window.runNextBattle = runNextBattle;

function startCampaignBattle(factions, sectorId) {
    // Segna chi riceve la rendita omaggio iniziale (deve essere bloccata al primo turno)
    campaignState._hasReceivedFirstIncome = {};
    factions.forEach(f => { campaignState._hasReceivedFirstIncome[f] = false; });

    // Azzera sectorCredits difensore (sono entrati in battaglia)
    const battle = campaignState._currentBattle;
    if (battle?.battleCredits && sectorId != null) {
        if (!campaignState.sectorCredits[sectorId]) campaignState.sectorCredits[sectorId] = {};
        factions.forEach(p => {
            if (campaignState.sectors[sectorId]?.owner === p)
                campaignState.sectorCredits[sectorId][p] = 0;
            (battle.fortressAdjacentZeroed || []).forEach(adjId => {
                if (campaignState.sectorCredits[adjId]) campaignState.sectorCredits[adjId][p] = 0;
            });
        });
    }

    campaignState.targetSector              = sectorId;
    campaignState.currentBattleParticipants = factions.slice().sort((a, b) => a - b);

    totalPlayers = 4;
    fullResetForBattle();
    turnCount = 0;

    for (let p = 1; p <= 4; p++) {
        players[p].isDisconnected = !factions.includes(p);
        if (factions.includes(p)) {
            const bc = battle?.battleCredits?.[p];
            players[p].credits = bc !== undefined ? bc : (campaignState.credits[p] ?? 10);
        }
    }

    // Allinea credits dal battle
    if (battle?.battleCredits) {
        factions.forEach(p => {
            if (battle.battleCredits[p] !== undefined) players[p].credits = battle.battleCredits[p];
        });
    }

    if (timerUI) timerUI.style.display = 'none';
    document.getElementById('audio-toggle').style.display = 'none';
    document.getElementById('legend-toggle-btn').style.display = 'none';

    document.getElementById('campaign-overlay').style.display = 'none';
    state = 'SETUP_P1';
    document.getElementById('setup-overlay').style.display = 'flex';
    currentPlayer = campaignState.currentBattleParticipants[0];
    setupData = freshSetupData();
    if (battle?.battleCredits?.[currentPlayer] !== undefined)
        setupData.points = battle.battleCredits[currentPlayer];
    updateSetupUI();
}
window.startCampaignBattle = startCampaignBattle;

// ============================================================
// OVERRIDE freshSetupData — usa battleCredits specifici
// ============================================================

const _core_origFreshSetupData = window.freshSetupData;
window.freshSetupData = function() {
    const data = _core_origFreshSetupData ? _core_origFreshSetupData() : { points: GAME.SETUP_POINTS, agents: [] };
    if (!campaignState.isActive) return data;
    const battle = campaignState._currentBattle;
    if (battle?.battleCredits?.[currentPlayer] !== undefined) {
        data.points = battle.battleCredits[currentPlayer];
        players[currentPlayer].credits = battle.battleCredits[currentPlayer];
    } else {
        data.points = campaignState.credits[currentPlayer] ?? 10;
    }
    return data;
};

// ============================================================
// OVERRIDE resetTurnState — blocca rendita al primo turno battaglia
// ============================================================

const _core_origResetTurnState = window.resetTurnState;
window.resetTurnState = function() {
    if (campaignState.isActive) {
        const saved = players[currentPlayer]?.credits ?? 0;
        _core_origResetTurnState();
        if (campaignState._hasReceivedFirstIncome && !campaignState._hasReceivedFirstIncome[currentPlayer]) {
            players[currentPlayer].credits = saved;
            campaignState._hasReceivedFirstIncome[currentPlayer] = true;
            if (typeof updateUI === 'function') updateUI();
        }
    } else {
        _core_origResetTurnState();
    }
};

// ============================================================
// OVERRIDE confirmPlayerSetup — flusso campagna
// ============================================================

const _core_origConfirmPlayerSetup = window.confirmPlayerSetup;
window.confirmPlayerSetup = function() {
    if (!campaignState.isActive) {
        if (_core_origConfirmPlayerSetup) _core_origConfirmPlayerSetup();
        return;
    }

    if (!setupData.agents || setupData.agents.length === 0) {
        showTemporaryMessage('ERRORE: Devi reclutare almeno un agente per scendere in campo!');
        playSFX('click'); return;
    }

    players[currentPlayer].agents    = JSON.parse(JSON.stringify(setupData.agents));
    players[currentPlayer].credits   = setupData.points;
    players[currentPlayer].cards     = typeof getFinalCardSelection === 'function' ? getFinalCardSelection() : [];
    players[currentPlayer].usedCards = {};

    // Bonus specializzazioni settore e UPGRADES LABS
    const bonuses = getPlayerCampaignBonuses(currentPlayer);
    
    players[currentPlayer].agents.forEach(agent => {
        // Applica Lab Upgrades
        if (bonuses.hp > 0) { agent.maxHp += bonuses.hp; agent.hp += bonuses.hp; }
        if (bonuses.mov > 0) agent.mov += bonuses.mov;
        if (bonuses.rng > 0) agent.rng += bonuses.rng;
        if (bonuses.dmg > 0) agent.dmg += bonuses.dmg;
    });

    campaignState.sectors.forEach(s => {
        if (s.owner === currentPlayer && s.specialization) {
            players[currentPlayer].agents.forEach(agent => {
                if (s.specialization === 'ARSENALE') agent.dmg += 1;
                else if (s.specialization === 'FORGIA') { agent.maxHp += 1; agent.hp += 1; }
            });
        }
    });

    // In campagna online: usa il flusso di rete (gestito in campaign_multiplayer.js)
    if (window.isCampaignOnline) {
        _net_handleConfirmSetup();
        return;
    }

    // Locale: avanza al prossimo partecipante o avvia la partita
    const participants = campaignState.currentBattleParticipants;
    const idx = participants.indexOf(currentPlayer);
    if (idx + 1 < participants.length) {
        currentPlayer = participants[idx + 1];
        setupData = freshSetupData();
        if (typeof cardSelectionData !== 'undefined') cardSelectionData.selected = [];
        updateSetupUI();
    } else {
        startActiveGameLocal();
        drawGame();
    }
};

// ============================================================
// OVERRIDE showGameOverlay — reindirizza a showBattleResults
// ============================================================

const _core_origShowGameOverlay = window.showGameOverlay;
window.showGameOverlay = function(title, message, color) {
    if (!campaignState.isActive) {
        if (_core_origShowGameOverlay) _core_origShowGameOverlay(title, message, color);
        return;
    }
    let winnerFaction = campaignState.currentBattleParticipants[0];
    for (let p = 1; p <= 4; p++) {
        if (players[p] && players[p].color === color) { winnerFaction = p; break; }
    }
    showBattleResults(winnerFaction);
};

// ============================================================
// RISULTATI BATTAGLIA
// ============================================================

function showBattleResults(winnerFaction) {
    const participants = campaignState.currentBattleParticipants;
    const sectorId     = campaignState.targetSector;

    if (!campaignState.sectorCredits[sectorId]) campaignState.sectorCredits[sectorId] = {};

    const results = {};
    participants.forEach(faction => {
        const shopResidual  = Math.max(0, players[faction]?.credits || 0);
        const survivorValue = _agentSurvivorValue(faction);
        results[faction] = { shopResidual, survivorValue, total: shopResidual + survivorValue };
    });

    const sector = campaignState.sectors.find(s => s.id === sectorId);
    const previousOwner = sector.owner;
    sector.owner = winnerFaction;

    participants.forEach(faction => {
        const { total } = results[faction];
        if (faction === winnerFaction) {
            const prev = campaignState.sectorCredits[sectorId][faction] || 0;
            campaignState.sectorCredits[sectorId][faction] = prev + total;
        } else {
            campaignState.credits[faction] = (campaignState.credits[faction] || 0) + total;
            delete campaignState.sectorCredits[sectorId][faction];
        }
    });

    // In campagna online: host fa broadcast e mostra UI; client aspetta CAMPAIGN_BATTLE_RESULT
    if (window.isCampaignOnline) {
        if (window.isHost) {
            _net_broadcast({
                type:         'CAMPAIGN_BATTLE_RESULT',
                winnerFaction,
                sectorId,
                results,
                campaignSnap: _net_buildSnapshot(),
            });
            _showBattleResultsUI(winnerFaction, sectorId, results);
        } else {
            // Client: nasconde gameover locale e aspetta il messaggio
            const go = document.getElementById('gameover-overlay');
            if (go) go.style.display = 'none';
        }
        return;
    }

    _showBattleResultsUI(winnerFaction, sectorId, results);
}
window.showBattleResults = showBattleResults;

function _showBattleResultsUI(winnerFaction, sectorId, results) {
    const participants = campaignState.currentBattleParticipants;
    const n            = campaignState.numPlayers;
    const winnerColor  = players[winnerFaction]?.color || COLORS['p' + winnerFaction];
    const winnerName   = players[winnerFaction]?.name || 'P' + winnerFaction;

    const creditsHtml = participants.map(faction => {
        const c    = players[faction]?.color || COLORS['p' + faction];
        const name = players[faction]?.name || 'P' + faction;
        const r    = results[faction];
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
        const c   = players[p]?.color || COLORS['p' + p];
        return `<span style="color:${c}; margin:4px 10px; font-weight:bold; font-size:14px; white-space:nowrap;">${players[p]?.name || 'P'+p}: 🏴${cnt}</span>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'battle-results-overlay';
    overlay.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.94); z-index:2000000;
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

            <button class="action-btn" id="results-continue-btn"
                style="padding:15px; border:3px solid ${winnerColor}; color:${winnerColor}; background:rgba(0,0,0,0.5); 
                       cursor:pointer; font-size:22px; font-weight:bold; width:100%; border-radius:10px; text-transform:uppercase;">
                AVANTI ▶
            </button>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#results-continue-btn').onclick = () => {
        overlay.remove();
        if (typeof grid !== 'undefined') grid.clear();
        if (typeof controlPoints !== 'undefined') controlPoints.clear();
        state = 'SETUP_P1';
        document.getElementById('controls-panel').style.display = 'none';
        document.getElementById('setup-overlay').style.display  = 'none';
        if (typeof ctx !== 'undefined') ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (checkCampaignWin()) return;
        runNextBattle();
    };
}
window._showBattleResultsUI = _showBattleResultsUI;

function _agentSurvivorValue(faction) {
    return (players[faction]?.agents || []).reduce((tot, a) => {
        if (!a) return tot;
        const base = GAME.AGENT_COST || 4;
        return tot + base + (a.hp || 1) - 1 + (a.mov || 1) - 1 + (a.rng || 1) - 1 + (a.dmg || 1) - 1;
    }, 0);
}
window._bat_agentSurvivorValue = _agentSurvivorValue;

// ============================================================
// VITTORIA CAMPAGNA
// ============================================================

function checkCampaignWin() {
    let winner = null;
    for (let p = 1; p <= campaignState.numPlayers; p++) {
        if (campaignState.sectors.filter(s => s.owner === p).length >= campaignState.victoryThreshold) {
            winner = p; break;
        }
    }
    if (!winner) return false;

    clearCampaignSave();

    // Online: solo l'host notifica tutti i client
    if (window.isCampaignOnline && window.isHost) {
        if (typeof broadcastToClients === 'function') {
            broadcastToClients({ type: 'CAMPAIGN_WIN', winner });
        }
    }

    _showCampaignWinUI(winner);
    return true;
}
window.checkCampaignWin = checkCampaignWin;

function _showCampaignWinUI(winner) {
    const color = COLORS['p' + winner] || '#ffffff';
    const name  = players[winner]?.name || 'P' + winner;
    const cnt   = campaignState.sectors.filter(s => s.owner === winner).length;

    // DISTRUGGIAMO (non solo nascondiamo) tutte le interfacce popup della campagna
    // per assicurarci che non interferiscano e non coprano la vittoria
    ['controls-panel', 'setup-overlay', 'battle-results-overlay', 'cn-result-overlay', 'eco-credit-modal', 'cn-order-sent-overlay', 'campaign-summary-overlay'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove(); 
    });

    // Creiamo un overlay di vittoria dedicato ad altissimo z-index, 
    // slegato dal campaign-overlay in modo che non venga sovrascritto dalla mappa
    let winOverlay = document.getElementById('campaign-win-overlay-final');
    if (!winOverlay) {
        winOverlay = document.createElement('div');
        winOverlay.id = 'campaign-win-overlay-final';
        document.body.appendChild(winOverlay);
    }

    winOverlay.style.cssText = `
        position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.98); z-index:9999999;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        font-family:Courier New, monospace; padding: 15px; box-sizing: border-box;
    `;

    winOverlay.innerHTML = `
        <div style="text-align:center;color:${color};padding:40px 20px;border:4px solid ${color};
                    background:rgba(10,15,25,0.95);border-radius:15px;max-width:550px;width:100%;
                    box-shadow:0 0 60px ${color}88; box-sizing: border-box;">
            <div style="font-size:4.5em;margin-bottom:10px;animation: pulse 2s infinite;">🏆</div>
            <h1 style="color:${color};text-shadow:0 0 20px ${color};margin:0 0 10px;font-size:clamp(24px, 6vw, 36px);">DOMINIO GLOBALE</h1>
            <h2 style="color:#fff;margin:0 0 20px;font-size:clamp(20px, 5vw, 28px);">${name.toUpperCase()}</h2>
            <p style="color:#aaa;margin-bottom:35px;font-size:18px;">Ha conquistato ${cnt}/${campaignState.sectors.length} settori — Vittoria Totale!</p>
            <button class="action-btn"
                style="border:3px solid ${color};color:${color};background:rgba(0,0,0,0.5);padding:15px;cursor:pointer;font-size:22px;font-weight:bold;width:100%;border-radius:8px;"
                onclick="location.reload()">TORNA AL MENU</button>
        </div>`;
}
window._showCampaignWinUI = _showCampaignWinUI;

// ============================================================
// MENU CAMPAGNA E INFO
// ============================================================

function showCampaignMenu() {
    if (typeof playSFX === 'function') playSFX('click');
    const menu = document.getElementById('network-menu');
    if (!menu) return;
    const existing = document.getElementById('campaign-num-players');
    if (existing) { existing.remove(); return; }

    const save = typeof getCampaignSave === 'function' ? getCampaignSave() : null;

    const div = document.createElement('div');
    div.id = 'campaign-num-players';
    div.style.cssText = `margin-top:20px;text-align:center;border-top:1px solid #333;padding-top:16px;font-family:Courier New;`;

    // Se esiste un salvataggio, mostra prima il pannello di ripristino
    if (save) {
        const d = new Date(save.savedAt);
        const dateStr = d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        div.innerHTML = `
            <div style="border:2px solid #FFD700;border-radius:8px;padding:16px;margin-bottom:16px;background:rgba(255,215,0,0.05);">
                <p style="color:#FFD700;font-weight:bold;margin:0 0 6px;">💾 CAMPAGNA IN CORSO</p>
                <p style="color:#aaa;font-size:12px;margin:0 0 12px;">Round ${save.turnCount} — Salvata il ${dateStr}</p>
                <button class="action-btn" id="btn-load-campaign"
                    style="border:2px solid #FFD700;color:#FFD700;background:transparent;padding:12px 24px;font-size:15px;cursor:pointer;width:100%;">
                    ▶ RIPRENDI CAMPAGNA
                </button>
            </div>
            <p style="color:#888;font-size:12px;margin-bottom:10px;">— oppure inizia una nuova —</p>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;" id="new-campaign-btns">
                <button class="action-btn" id="btn-new-camp-2"
                    style="border:2px solid #00ff88;color:#00ff88;background:transparent;">2 GIOCATORI</button>
                <button class="action-btn" id="btn-new-camp-3"
                    style="border:2px solid #00aaff;color:#00aaff;background:transparent;">3 GIOCATORI</button>
                <button class="action-btn" id="btn-new-camp-4"
                    style="border:2px solid #FFD700;color:#FFD700;background:transparent;">4 GIOCATORI</button>
            </div>`;
        menu.appendChild(div);

        // Carica campagna esistente
        document.getElementById('btn-load-campaign').onclick = () => {
            div.remove();
            loadCampaignSnapshot(save);
        };

        // Nuova campagna: chiede conferma prima di sovrascrivere
        [2, 3, 4].forEach(n => {
            document.getElementById(`btn-new-camp-${n}`).onclick = () => {
                if (!confirm(`Attenzione: una campagna salvata esiste già (Round ${save.turnCount}).\nAvviare una nuova campagna cancellerà il salvataggio. Procedere?`)) return;
                clearCampaignSave();
                div.remove();
                startCampaign(n);
            };
        });

    } else {
        // Nessun salvataggio: mostra direttamente la scelta giocatori
        div.innerHTML = `
            <p style="color:#aaa;margin-bottom:12px;">Numero di giocatori (Campagna):</p>
            <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                <button class="action-btn" onclick="startCampaign(2)"
                    style="border:2px solid #00ff88;color:#00ff88;background:transparent;">2 GIOCATORI</button>
                <button class="action-btn" onclick="startCampaign(3)"
                    style="border:2px solid #00aaff;color:#00aaff;background:transparent;">3 GIOCATORI</button>
                <button class="action-btn" onclick="startCampaign(4)"
                    style="border:2px solid #FFD700;color:#FFD700;background:transparent;">4 GIOCATORI</button>
            </div>`;
        menu.appendChild(div);
    }
}
window.showCampaignMenu = showCampaignMenu;

function showCampaignInfoModal() {
    if (typeof playSFX === 'function') playSFX('click');
    const bonusHtml = SECTOR_SPECIALIZATIONS.map(s => `
        <div style="margin-bottom:20px;border-left:4px solid #00ff88;padding-left:15px;">
            <div style="font-size:20px;color:#fff;font-weight:bold;">${s.label}</div>
            <div style="font-size:14px;color:#aaa;">${s.desc}</div>
        </div>`).join('');
    const modal = document.createElement('div');
    modal.id = 'campaign-info-modal';
    modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.95);z-index:1000000;display:flex;align-items:center;justify-content:center;font-family:'Courier New',monospace;`;
    modal.innerHTML = `
        <div style="background:#050a14;border:2px solid #00ff88;padding:30px;max-width:500px;width:90%;border-radius:12px;box-shadow:0 0 40px rgba(0,255,136,0.3);">
            <h2 style="color:#00ff88;text-align:center;margin-top:0;">PROTOCOLLO DI GUERRA</h2>
            <div style="margin:20px 0;max-height:60vh;overflow-y:auto;padding-right:10px;">
                <div style="margin-bottom:20px;border-left:4px solid #FFD700;padding-left:15px;background:rgba(255,215,0,0.05);">
                    <div style="font-size:20px;color:#FFD700;font-weight:bold;">🏆 OBIETTIVO FINALE</div>
                    <div style="font-size:14px;color:#fff;">Conquista <b>32 settori</b> per ottenere il dominio totale.</div>
                </div>
                ${bonusHtml}
                
                <!-- SEZIONE AGGIORNATA: SETTORI CONTAMINATI -->
                <div style="margin-bottom:20px;border-left:4px solid #ff4444;padding-left:15px;background:rgba(255,68,68,0.05);">
                    <div style="font-size:20px;color:#ff4444;font-weight:bold;">☢️ Zone Contaminate</div>
                    <div style="font-size:14px;color:#aaa;">Settori <b>completamente inagibili</b> . Possono essere bonificati con 30 crediti.</div>
                </div>
            </div>
            <button class="action-btn" style="width:100%;padding:15px;border-color:#00ff88;color:#00ff88;"
                onclick="document.getElementById('campaign-info-modal').remove()">CHIUDI</button>
        </div>`;
    document.body.appendChild(modal);
}
window.showCampaignInfoModal = showCampaignInfoModal;

// ============================================================
// OVERRIDE isPlayerEliminated — salta non-partecipanti in battaglia
// ============================================================

const _core_origIsEliminated = window.isPlayerEliminated;
window.isPlayerEliminated = function(p) {
    if (campaignState.isActive) {
        const parts = campaignState.currentBattleParticipants || [];
        if (parts.length > 0 && !parts.includes(p)) return true;
    }
    return _core_origIsEliminated ? _core_origIsEliminated(p) : false;
};

// ============================================================
// OVERRIDE resetTurnState — pulizia HQ fantasma in campagna
// ============================================================

const _core_origResetForHQ = window.resetTurnState;
window.resetTurnState = (function() {
    // Catturiamo l'ultimo override (quello che blocca la rendita)
    // e ci aggiungiamo la pulizia HQ
    const prev = window.resetTurnState;
    return function() {
        if (campaignState.isActive) {
            const parts = campaignState.currentBattleParticipants || [];
            if (parts.length > 0) {
                grid.forEach(cell => {
                    if (cell.entity?.type === 'hq' && !parts.includes(cell.entity.faction))
                        cell.entity = null;
                });
                for (let p = 1; p <= 4; p++) {
                    if (!parts.includes(p) && players[p]) {
                        players[p].hq = null; players[p].agents = [];
                    }
                }
            }
        }
        prev();
    };
})();

// ============================================================
// STUB _net_* — queste funzioni vengono implementate da
// campaign_multiplayer.js quando la campagna è online.
// In modalità locale rimangono no-op.
// ============================================================

window._net_hostBroadcast    = window._net_hostBroadcast    || function() {};
window._net_broadcast        = window._net_broadcast        || function() {};
window._net_clientSend       = window._net_clientSend       || function() {};
window._net_buildSnapshot    = window._net_buildSnapshot    || function() { return {}; };
window._net_applyTurnState   = window._net_applyTurnState   || function() {};
window._net_showOrderSentOverlay = window._net_showOrderSentOverlay || function() {};
window._net_handleConfirmSetup   = window._net_handleConfirmSetup   || function() {};

console.log('[campaign_battle.js] Caricato.');


markScriptAsLoaded('campaign_battle.js');