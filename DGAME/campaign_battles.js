/* ============================================================
   campaign_battles.js — ORDINI, CONFLITTI, BATTAGLIE
   ============================================================
   Carico ordine: campaign.js → campaign_sectors.js → campaign_battles.js

   Responsabilità:
     • Override handleSectorClick — multi-ordine con credit selector
     • Override finishPlayerTurn / skipPlayerTurn
     • Override processConflicts — gestione multi-ordine e battleCredits
     • Override runNextBattle / startCampaignBattle
     • Override freshSetupData — crediti specifici per battaglia
     • Override showBattleResults — allocazione post-vittoria
     • UI: credit selector, conflict summary, allocation panel, results
   ============================================================ */

// ============================================================
// OVERRIDE: handleSectorClick — multi-ordine
// ============================================================
window.handleSectorClick = function(targetId) {
    if (campaignState.phase !== 'PLANNING') return;
    const p      = campaignState.currentPlayer;
    const target = campaignState.sectors[targetId];

    if (target.owner === p) {
        showTemporaryMessage('Controlli già questo settore!');
        return;
    }

    // --- LOGICA TRASPORTI ---
    const hasTrasporti = campaignState.sectors.some(s => s.owner === p && s.specialization === 'TRASPORTI');
    
    // Verifica raggiungibilità
    let reachable = false;
    
    // Controllo Distanza 1 (Adiacenza diretta)
    const isAdjacent = campaignState.adj[targetId].some(id => campaignState.sectors[id].owner === p);
    
    if (isAdjacent) {
        reachable = true;
    } 
    // Controllo Distanza 2 (se ha il bonus Trasporti)
    else if (hasTrasporti) {
        // Un settore è a distanza 2 se uno dei suoi vicini è adiacente a un mio settore
        reachable = campaignState.adj[targetId].some(neighborId => {
            // Salta i settori bloccati nel percorso
            if (campaignState.sectors[neighborId].blocked) return false;
            // Verifica se questo vicino tocca un mio settore
            return campaignState.adj[neighborId].some(id2 => campaignState.sectors[id2].owner === p);
        });
    }

    if (!reachable) {
        const msg = hasTrasporti ? 'Settore troppo lontano (max dist 2)!' : 'Settore non raggiungibile!';
        showTemporaryMessage(msg);
        playSFX('click');
        return;
    }
    // --- FINE LOGICA TRASPORTI ---

    // Click su settore già ordinato → annulla ordine e rimborsa
    const orders   = campaignState.pendingOrders[p] || [];
    const existing = orders.find(o => o.sectorId === targetId);
    if (existing) {
        campaignState.pendingOrders[p] = orders.filter(o => o.sectorId !== targetId);
        campaignState.credits[p] += existing.credits;
        renderCampaignMap();
        return;
    }

    playSFX('click');
    _bat_showCreditSelector(p, targetId);
};

// ============================================================
// UI: selettore crediti per un ordine (VERSIONE GIGANTE)
// ============================================================
function _bat_showCreditSelector(playerFaction, targetSectorId) {
    const avail   = campaignState.credits[playerFaction] || 0;
    const minCost = 4;
    
    // Riferimenti al settore bersaglio
    const sector = campaignState.sectors[targetSectorId];
    const targetOwner = sector.owner;
    const pColor = COLORS['p' + playerFaction];
    const pName  = players[playerFaction]?.name || 'P' + playerFaction;
    
    // Calcolo crediti del difensore nel settore
    const defCredits = targetOwner > 0 ? (campaignState.sectorCredits[targetSectorId]?.[targetOwner] || 0) : 0;

    // --- LOGICA BONUS ESPLOSIONE ---
    const hasExplosion = campaignState.sectors.some(s => s.owner === playerFaction && s.specialization === 'ESPLOSIONE');
    // Si può sabotare solo se: hai il bonus, il settore è nemico, ha più di 0 monete, hai almeno 30 monete in banca
    const canSabotage = hasExplosion && targetOwner > 0 && targetOwner !== playerFaction && defCredits > 0 && avail >= 30;
    // -------------------------------

    const spec = sector.specialization
        ? SECTOR_SPECIALIZATIONS.find(s => s.id === sector.specialization)
        : null;

    // Linee informative UI
    const defLine = targetOwner > 0
        ? `<div style="color:#aaa; font-size:24px; margin-top:15px;">
               Difensore: 🏦 ${defCredits} crediti allocati
           </div>`
        : `<div style="color:#888; font-size:24px; margin-top:15px;">Settore Neutro</div>`;
    
    const specLine = spec
        ? `<div style="color:#FFD700; font-size:24px; margin-top:15px;">${spec.label} — ${spec.desc}</div>`
        : '';

    // HTML del tasto Sabotaggio (appare solo se i requisiti canSabotage sono true)
    const sabotageBtnHtml = canSabotage 
        ? `<button class="action-btn" id="eco-sabotage-btn"
                style="border:3px solid #ff4444; color:#ff4444; padding:25px 40px; font-size:32px; font-weight:bold; background:rgba(255,0,0,0.1); cursor:pointer;">
                SABOTAGGIO 💥 (30💰)
           </button>` 
        : '';

    const modal = document.createElement('div');
    modal.id = 'eco-credit-modal';
    modal.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.90); z-index:999999;
        display:flex; align-items:center; justify-content:center; font-family:Courier New;`;
    
    modal.innerHTML = `
        <div style="background:rgba(5,10,20,0.98); border:4px solid ${pColor}; border-radius:20px;
                    padding:60px 80px; min-width:700px; text-align:center; box-shadow:0 0 60px rgba(0,0,0,1);">
            
            <h1 style="color:${pColor}; margin:0 0 20px; font-size:48px; letter-spacing:3px;">ORDINE DI ATTACCO</h1>
            
            <div style="color:#fff; font-size:32px; margin-bottom:10px; font-weight:bold;">
                ${pName} → Settore ${targetSectorId}
            </div>
            
            ${defLine}
            ${specLine}
            
            <hr style="border-color:#444; margin:40px 0;">
            
            <div style="color:#aaa; font-size:28px; margin-bottom:20px;">
                Crediti in Banca: <span style="color:#FFD700;">${avail}</span>
            </div>
            
            <div style="color:#fff; font-size:32px; margin-bottom:30px;">
                Investimento Attacco:
                <span id="eco-credit-val" style="color:#00ff88; font-size:60px; font-weight:bold; text-shadow:0 0 20px #00ff88;">${Math.min(minCost, avail)}</span>
            </div>
            
            <input type="range" id="eco-credit-slider"
                min="${Math.min(minCost, avail)}" max="${avail}" value="${Math.min(minCost, avail)}" step="1"
                style="width:100%; height:40px; cursor:pointer; accent-color:${pColor}; margin-bottom:50px;">
            
            <div style="display:flex; gap:30px; justify-content:center; flex-wrap:wrap;">
                <button class="action-btn" id="eco-confirm-order"
                    style="border:3px solid ${pColor}; color:${pColor}; padding:25px 50px; font-size:32px; font-weight:bold; background:transparent; cursor:pointer;">
                    INVIA ORDINE ✓
                </button>

                ${sabotageBtnHtml}

                <button class="action-btn"
                    style="border:3px solid #666; color:#888; padding:25px 40px; font-size:32px; background:transparent; cursor:pointer;"
                    onclick="document.getElementById('eco-credit-modal').remove();">
                    ANNULLA
                </button>
            </div>
        </div>`;
    
    document.body.appendChild(modal);

    const slider  = modal.querySelector('#eco-credit-slider');
    const valDisp = modal.querySelector('#eco-credit-val');
    
    // Se non hai nemmeno i crediti minimi, lo slider sarà bloccato
    if (avail < minCost) {
        valDisp.style.color = "#ff4444";
        modal.querySelector('#eco-confirm-order').disabled = true;
        modal.querySelector('#eco-confirm-order').style.opacity = "0.3";
        modal.querySelector('#eco-confirm-order').style.cursor = "not-allowed";
    }

    slider.oninput = () => { valDisp.textContent = slider.value; };

    // --- AZIONE: CONFERMA ATTACCO ---
    modal.querySelector('#eco-confirm-order').onclick = () => {
        const chosen = parseInt(slider.value);
        modal.remove();

        if (typeof isCampaignOnline !== 'undefined' && isCampaignOnline &&
            typeof isHost !== 'undefined' && !isHost) {
            if (typeof campaignSendAction === 'function') {
                campaignSendAction('CONFIRM_CREDIT_ORDER', { sectorId: targetSectorId, credits: chosen });
            }
            return;
        }

        campaignState.credits[playerFaction] -= chosen;
        if (!campaignState.pendingOrders[playerFaction]) campaignState.pendingOrders[playerFaction] = [];
        campaignState.pendingOrders[playerFaction].push({ sectorId: targetSectorId, credits: chosen });
        campaignState.pendingMoves[playerFaction] = targetSectorId;

        if (!campaignState._allOrderedSectors) campaignState._allOrderedSectors = {};
        if (!campaignState._allOrderedSectors[targetSectorId]) campaignState._allOrderedSectors[targetSectorId] = [];
        if (!campaignState._allOrderedSectors[targetSectorId].includes(playerFaction)) {
            campaignState._allOrderedSectors[targetSectorId].push(playerFaction);
        }

        renderCampaignMap();
    };

    // --- AZIONE: SABOTAGGIO (Se presente) ---
    if (canSabotage) {
        modal.querySelector('#eco-sabotage-btn').onclick = () => {
            const confirmMsg = `SABOTAGGIO \uD83D\uDCA5\n\nStai per azzerare i ${defCredits} crediti nemici nel Settore ${targetSectorId}.\nCosto: 30 crediti.\n\nProcedere?`;
            if (confirm(confirmMsg)) {
                modal.remove();
                if (typeof isCampaignOnline !== 'undefined' && isCampaignOnline &&
                    typeof isHost !== 'undefined' && !isHost) {
                    if (typeof campaignSendAction === 'function') {
                        campaignSendAction('SABOTAGE', { sectorId: targetSectorId });
                    }
                    return;
                }
                campaignState.credits[playerFaction] -= 30;
                campaignState.sectorCredits[targetSectorId][targetOwner] = 0;
                if (typeof playSFX === 'function') playSFX('click');
                showTemporaryMessage('BOOM! Difese nemiche nel settore ' + targetSectorId + ' neutralizzate!');
                renderCampaignMap();
            }
        };
    }
}

// ============================================================
// OVERRIDE: finishPlayerTurn
// ============================================================
const _bat_origFinishPlayerTurn = window.finishPlayerTurn;
window.finishPlayerTurn = function() {
    const p      = campaignState.currentPlayer;
    const orders = campaignState.pendingOrders[p] || [];
    if (orders.length > 0)
        campaignState.pendingMoves[p] = orders[0].sectorId;
    else
        delete campaignState.pendingMoves[p];

    const panel = document.getElementById('eco-orders-panel');
    if (panel) panel.remove();

    _bat_origFinishPlayerTurn();
};

// ============================================================
// OVERRIDE: skipPlayerTurn
// ============================================================
const _bat_origSkipPlayerTurn = window.skipPlayerTurn;
window.skipPlayerTurn = function() {
    const p      = campaignState.currentPlayer;
    const orders = campaignState.pendingOrders[p] || [];
    orders.forEach(o => { campaignState.credits[p] = (campaignState.credits[p] || 0) + o.credits; });
    campaignState.pendingOrders[p] = [];
    delete campaignState.pendingMoves[p];

    const panel = document.getElementById('eco-orders-panel');
    if (panel) panel.remove();

    finishPlayerTurn();
};

// ============================================================
// OVERRIDE: processConflicts — multi-ordine + battleCredits
// ============================================================
const _bat_origProcessConflicts = window.processConflicts;
window.processConflicts = function() {
    campaignState.phase = 'RESOLVING';
    campaignState.battleQueue = [];

    // Costruisce sectorMap da pendingOrders
    const sectorMap = {};
    campaignState.sectors.forEach(s => { sectorMap[s.id] = { attackers: [], defender: s.owner }; });

    const n = campaignState.numPlayers;
    for (let p = 1; p <= n; p++) {
        (campaignState.pendingOrders[p] || []).forEach(o => {
            sectorMap[o.sectorId].attackers.push({ p, credits: o.credits });
        });
    }

    campaignState.sectors.forEach(sector => {
        const { attackers } = sectorMap[sector.id];
        if (attackers.length === 0) return;

        const participants = new Set(attackers.map(a => a.p));
        if (sector.owner > 0 && !participants.has(sector.owner))
            participants.add(sector.owner);

        // Calcola crediti per ogni partecipante
        const battleCredits = {};
        attackers.forEach(a => { battleCredits[a.p] = a.credits; });

        if (sector.owner > 0) {
            let defCr = campaignState.sectorCredits[sector.id]?.[sector.owner] || 0;

            // Non azzeriamo sectorCredits qui: la mappa deve mostrare i crediti
            // depositati fino a quando la battaglia non inizia davvero.
            // Li azzeriamo in startCampaignBattle, usando battleCredits come fonte.

            // FORTEZZA: aggiunge crediti settori adiacenti posseduti
            const fortressAdjacent = [];
            if (sector.specialization === 'FORTEZZA') {
                campaignState.adj[sector.id].forEach(adjId => {
                    const adj = campaignState.sectors[adjId];
                    if (adj.owner === sector.owner) {
                        let adjCr = campaignState.sectorCredits[adjId]?.[sector.owner] || 0;
                        defCr += adjCr;
                        if (adjCr > 0) fortressAdjacent.push(adjId);
                        // Non azzerare qui — solo al momento della battaglia
                    }
                });
            }
            
            /*
            // Fallback: preleva minimo dalla banca se il settore non ha depositi (e la fortezza non ha aiutato)
            if (defCr === 0) {
                const bank = campaignState.credits[sector.owner] || 0;
                defCr = Math.max(4, Math.min(bank, 4));
                campaignState.credits[sector.owner] = Math.max(0, bank - defCr);
            }
            */

 
            battleCredits[sector.owner] = defCr;
        }

        if (participants.size > 1 && (sector.owner === 0 || battleCredits[sector.owner] > 3)) {
        campaignState.battleQueue.push({
            sectorId: sector.id,
            factions: Array.from(participants),
            battleCredits,
            fortressAdjacentZeroed: fortressAdjacent,
        });
        } else {
            // Conquista pacifica — i crediti investiti restano nel settore
            const attacker = Array.from(participants)[0];
            sector.owner = attacker;
            if (!campaignState.sectorCredits[sector.id]) campaignState.sectorCredits[sector.id] = {};
            const invested = battleCredits[attacker] || 0;
            campaignState.sectorCredits[sector.id][attacker] =
                (campaignState.sectorCredits[sector.id][attacker] || 0) + invested;
        }
    });

    _bat_showConflictSummary();
};

function _bat_showConflictSummary() {
    const n       = campaignState.numPlayers;
    const battles = campaignState.battleQueue;

    // Conquiste pacifiche
    const peaceful = [];
    campaignState.sectors.forEach(s => {
        for (let p = 1; p <= n; p++) {
            (campaignState.pendingOrders[p] || []).forEach(o => {
                if (o.sectorId === s.id && s.owner === p
                    && !battles.some(b => b.sectorId === s.id))
                    peaceful.push({ p, sid: s.id });
            });
        }
    });

    let html = `<div style="font-family:Courier New;color:#fff;padding:40px;background:rgba(10,15,25,0.95);border:2px solid #555;border-radius:12px;
                            max-width:900px;text-align:left;width:90%;box-shadow:0 0 40px rgba(0,0,0,0.8);">
        <h1 style="color:#fff;text-align:center;margin-top:0;font-size:36px;letter-spacing:2px;border-bottom:1px solid #444;padding-bottom:15px;">RIEPILOGO ORDINI</h1>`;

    if (peaceful.length > 0) {
        html += `<p style="color:#aaa;font-size:22px;margin-bottom:12px;font-weight:bold;text-transform:uppercase;">CONQUISTE PACIFICHE:</p>`;
        peaceful.forEach(({ p, sid }) => {
            const c = COLORS['p' + p];
            html += `<div style="color:${c};font-size:24px;margin-bottom:8px;padding-left:15px;border-left:4px solid ${c};">
                → ${players[p]?.name || 'P'+p} conquista il Settore ${sid}</div>`;
        });
    }

    if (battles.length > 0) {
        html += `<p style="color:#ff4444;font-size:22px;margin-top:30px;margin-bottom:12px;font-weight:bold;text-transform:uppercase;">⚔️ BATTAGLIE IMMINENTI:</p>`;
        battles.forEach(b => {
            const spec = campaignState.sectors[b.sectorId].specialization
                ? SECTOR_SPECIALIZATIONS.find(s => s.id === campaignState.sectors[b.sectorId].specialization)?.label || ''
                : '';
            const names = b.factions.map(pid => {
                const c  = COLORS['p' + pid];
                const cr = b.battleCredits[pid] ?? '?';
                return `<span style="color:${c}">${players[pid]?.name || 'P'+pid} (💰${cr})</span>`;
            }).join(' vs ');
            html += `<div style="font-size:24px;margin-bottom:12px;background:rgba(255,50,50,0.1);padding:10px;border-radius:8px;">
                <strong>Settore ${b.sectorId} ${spec}:</strong> <br>${names}</div>`;
        });
    }

    if (!peaceful.length && !battles.length)
        html += `<p style="color:#888;text-align:center;font-size:24px;margin:30px 0;">Nessun movimento questo turno.</p>`;

    html += `<button class="action-btn"
        style="width:100%;margin-top:40px;border-color:#00ff88;color:#00ff88;font-size:28px;padding:15px;font-weight:bold;"
        onclick="this.closest('.campaign-summary-overlay').remove(); runNextBattle();">
        AVANTI ▶
    </button></div>`;

    const overlay = document.createElement('div');
    overlay.className = 'campaign-summary-overlay';
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.92);z-index:99999;
        display:flex;align-items:center;justify-content:center;`;
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
}

// ============================================================
// OVERRIDE: runNextBattle — salva _currentBattle prima di avviarla
// ============================================================
window.runNextBattle = function() {
    if (campaignState.battleQueue.length === 0) {
        startNextPlanningRound();
        return;
    }
    const battle = campaignState.battleQueue.shift();
    campaignState._currentBattle = battle;
    startCampaignBattle(battle.factions, battle.sectorId);
};

// ============================================================
// OVERRIDE: startCampaignBattle
// Setta il contatore a 2: campaign.js chiama resetTurnState due
// volte all'avvio (una dentro startActiveGameLocal, una esplicita).
// Entrambe devono essere bloccate dal reddito.
// ============================================================
const _bat_origStartCampaignBattle = window.startCampaignBattle;
window.startCampaignBattle = function(factions, sectorId) {
    // Inizializziamo un oggetto per tracciare chi ha già "saltato" la rendita omaggio iniziale
    campaignState._hasReceivedFirstIncome = {};
    factions.forEach(f => { campaignState._hasReceivedFirstIncome[f] = false; });

    // ORA è il momento giusto per azzerare i sectorCredits del settore conteso.
    // processConflicts ha già calcolato battleCredits con i valori corretti.
    const battle = campaignState._currentBattle;
    if (battle?.battleCredits && sectorId != null) {
        // Azzera i crediti del settore difeso (sono entrati in battaglia)
        if (!campaignState.sectorCredits[sectorId]) campaignState.sectorCredits[sectorId] = {};
        factions.forEach(p => {
            // Solo il difensore (chi possedeva il settore) viene azzerato
            const sector = campaignState.sectors[sectorId];
            if (sector && sector.owner === p) {
                campaignState.sectorCredits[sectorId][p] = 0;
            }
            // Azzera anche i settori FORTEZZA adiacenti già conteggiati
            if (battle.fortressAdjacentZeroed) {
                battle.fortressAdjacentZeroed.forEach(adjId => {
                    if (campaignState.sectorCredits[adjId]) {
                        campaignState.sectorCredits[adjId][p] = 0;
                    }
                });
            }
        });
    }

    _bat_origStartCampaignBattle(factions, sectorId);

    // Allineamento iniziale crediti con i fondi di battaglia
    if (battle?.battleCredits) {
        factions.forEach(p => {
            if (battle.battleCredits[p] !== undefined) {
                players[p].credits = battle.battleCredits[p];
            }
        });
        if (battle.battleCredits[currentPlayer] !== undefined) {
            setupData.points = battle.battleCredits[currentPlayer];
        }
    }
};

// ============================================================
// OVERRIDE: resetTurnState
// Mentre _skipIncomeCount > 0, salva i crediti prima della chiamata
// e li ripristina dopo, annullando il reddito aggiunto.
// ============================================================
const _bat_origResetTurnState = window.resetTurnState;
window.resetTurnState = function() {
    if (campaignState.isActive) {
        // 1. Salviamo i crediti attuali (quelli post-setup o del turno precedente)
        const savedCredits = players[currentPlayer]?.credits ?? 0;

        // 2. Eseguiamo la logica originale (che aggiunge la rendita HQ/CP)
        _bat_origResetTurnState();

        // 3. Se è la PRIMA VOLTA che questo giocatore riceve il turno in questa battaglia
        if (campaignState._hasReceivedFirstIncome && !campaignState._hasReceivedFirstIncome[currentPlayer]) {
            // Annulliamo la rendita omaggio e ripristiniamo i crediti del setup
            players[currentPlayer].credits = savedCredits;
            // Segnamo che dal prossimo giro potrà ricevere la rendita normalmente
            campaignState._hasReceivedFirstIncome[currentPlayer] = true;
            
            // Aggiorna l'interfaccia per mostrare il valore corretto (es. 0)
            if (typeof updateUI === 'function') updateUI();
        }
    } else {
        _bat_origResetTurnState();
    }
};

// ============================================================
// OVERRIDE: freshSetupData — usa battleCredits specifici per questa battaglia
// ============================================================
const _bat_origFreshSetupData = window.freshSetupData;
window.freshSetupData = function() {
    const data = _bat_origFreshSetupData();
    if (!campaignState.isActive) return data;

    const battle = campaignState._currentBattle;
    if (battle?.battleCredits?.[currentPlayer] !== undefined) {
        data.points = battle.battleCredits[currentPlayer];
        // Fondamentale: allinea players[currentPlayer].credits
        // così il negozio in-game vede solo i crediti della battaglia, non della banca
        players[currentPlayer].credits = battle.battleCredits[currentPlayer];
        return data;
    }

    // Registra bonus specializzazione (ARSENALE / OSPEDALE) per uso futuro
    const sectorId = campaignState.targetSector;
    if (sectorId != null) {
        const sector = campaignState.sectors[sectorId];
        if (sector?.specialization) {
            campaignState._battleBonus = {
                faction:  currentPlayer,
                sectorId: sectorId,
                type:     sector.specialization
            };
        }
    }

    return data;
};

// ============================================================
// HELPER: valore in crediti degli agenti ancora vivi
// Da setup.js: le stat sono hp, mov, rng, dmg (base 1 ciascuna = costo 4)
// Valore agente = (hp-1) + (mov-1) + (rng-1) + (dmg-1) + AGENT_COST
// cioè: esattamente come removeAgentFromMarket calcola il rimborso
// ============================================================
function _bat_agentSurvivorValue(faction) {
    const agents = players[faction]?.agents || [];
    let total = 0;
    agents.forEach(agent => {
        if (!agent) return;
        // Costo base agente + punti extra investiti in ogni stat
        const base = typeof GAME !== 'undefined' && GAME.AGENT_COST ? GAME.AGENT_COST : 4;
        const extraHp  = (agent.hp  || 1) - 1;
        const extraMov = (agent.mov || 1) - 1;
        const extraRng = (agent.rng || 1) - 1;
        const extraDmg = (agent.dmg || 1) - 1;
        total += base + extraHp + extraMov + extraRng + extraDmg;
    });
    return total;
}

// ============================================================
// HELPER: crediti accumulati durante la partita (negozio ecc.)
// players[p].credits dopo la partita = crediti residui del negozio
// I crediti iniziali della battaglia erano battleCredits[p]
// Crediti "guadagnati in gioco" = residui - (battleCredits - spesi per agenti)
// In pratica: tutto quello che è in players[p].credits alla fine è
// ciò che rimane dopo aver acquistato agenti. Non lo possiamo separare
// dai "guadagnati", quindi trattiamo players[p].credits come totale residuo.
// ============================================================

// ============================================================
// OVERRIDE: showBattleResults
// ============================================================
const _bat_origShowBattleResults = window.showBattleResults;
window.showBattleResults = function(winnerFaction) {
    const participants = campaignState.currentBattleParticipants;
    const sectorId     = campaignState.targetSector;
    const battle       = campaignState._currentBattle || {};

    if (!campaignState.sectorCredits[sectorId])
        campaignState.sectorCredits[sectorId] = {};

    // Per ogni partecipante calcola i crediti finali:
    //   shopResidual  = crediti rimasti nel negozio (players[p].credits)
    //   survivorValue = valore in crediti degli agenti ancora vivi
    //   totalEarned   = shopResidual + survivorValue
    const results = {};
    participants.forEach(faction => {
        const shopResidual  = Math.max(0, players[faction]?.credits || 0);
        const survivorValue = _bat_agentSurvivorValue(faction);
        results[faction] = {
            shopResidual,
            survivorValue,
            total: shopResidual + survivorValue
        };
    });

    // Assegna il settore al vincitore
    const sector = campaignState.sectors.find(s => s.id === sectorId);
    sector.owner = winnerFaction;

    // Distribuisci i crediti:
    participants.forEach(faction => {
        const { total } = results[faction];
        if (faction === winnerFaction) {
            // VINCITORE: i crediti totali restano nel settore
            // (si aggiungono a quelli già depositati)
            const prev = campaignState.sectorCredits[sectorId][faction] || 0;
            campaignState.sectorCredits[sectorId][faction] = prev + total;
            // La banca non viene toccata ora (il giocatore potrà spostare
            // crediti dal settore alla banca tramite il selettore +/-)
        } else {
            // PERDENTE: i crediti totali vanno in banca
            campaignState.credits[faction] = (campaignState.credits[faction] || 0) + total;
            // I crediti che aveva nel settore (se difendeva) rimangono nel settore
            // ma ora il settore è del vincitore — azzerali per questo giocatore
            if (campaignState.sectorCredits[sectorId][faction])
                delete campaignState.sectorCredits[sectorId][faction];
        }
    });

    _bat_showBattleResultsUI(winnerFaction, sectorId, results);
};

// ============================================================
// UI: riepilogo risultati battaglia
// ============================================================
function _bat_showBattleResultsUI(winnerFaction, sectorId, results) {
    const participants = campaignState.currentBattleParticipants;
    const n            = campaignState.numPlayers;
    const winnerColor  = COLORS['p' + winnerFaction];
    const winnerName   = players[winnerFaction]?.name || 'P' + winnerFaction;

    const creditsHtml = participants.map(faction => {
        const c    = COLORS['p' + faction];
        const name = players[faction]?.name || 'P' + faction;
        const r    = results[faction];
        const isWinner = faction === winnerFaction;

        const sectorAlloc = campaignState.sectorCredits[sectorId]?.[faction] || 0;

        const destination = isWinner
            ? `→ 📦 Nel Settore ${sectorId}: <b>${sectorAlloc}</b>`
            : `→ 🏦 Alla Banca: <b>+${r.total}</b>`;

        // MODIFICA: Dimensioni font aumentate drasticamente
        return `<div style="color:${c};font-size:22px;margin:12px 0;
                            border-left:4px solid ${c};padding-left:12px;background:rgba(255,255,255,0.02);padding-top:8px;padding-bottom:8px;">
            <div style="font-weight:bold;font-size:26px;">${name} ${isWinner ? '🏆' : '💀'}</div>
            <div style="color:#aaa;font-size:16px;margin-top:6px;">
                Negozio: ${r.shopResidual} &nbsp;+&nbsp; Agenti vivi: ${r.survivorValue} &nbsp;=&nbsp;
                <span style="color:${c};font-weight:bold;">Totale: ${r.total}</span>
            </div>
            <div style="font-size:20px;margin-top:6px;">${destination}</div>
        </div>`;
    }).join('');

    const ownedHtml = Array.from({ length: n }, (_, i) => i + 1).map(p => {
        const cnt = campaignState.sectors.filter(s => s.owner === p).length;
        const c   = COLORS['p' + p];
        return `<span style="color:${c};margin:0 12px;font-weight:bold;">${players[p]?.name || 'P'+p}: 🏴${cnt}</span>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.96);z-index:99999;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-family:Courier New,monospace;text-align:center;padding:20px;`;
    
    // MODIFICA: Titoli giganti e padding più ampi
    overlay.innerHTML = `
        <h1 style="color:${winnerColor};text-shadow:0 0 25px ${winnerColor};margin-bottom:10px;font-size:42px;">
            ⚔️ BATTAGLIA CONCLUSA
        </h1>
        <h2 style="color:${winnerColor};margin-bottom:30px;font-size:32px;">VINCITORE: ${winnerName.toUpperCase()}</h2>
        
        <div style="background:rgba(255,255,255,0.05);border:2px solid #333;border-radius:12px;
                    padding:25px 40px;margin-bottom:25px;min-width:600px;text-align:left;">
            <p style="color:#aaa;font-size:18px;margin:0 0 15px;text-transform:uppercase;
                      letter-spacing:2px;text-align:center;font-weight:bold;">
                Resoconto Crediti
            </p>
            ${creditsHtml}
        </div>
        
        <div style="background:rgba(255,255,255,0.03);border:2px solid #222;border-radius:12px;
                    padding:15px 30px;margin-bottom:35px;font-size:22px;">
            <p style="color:#888;margin:0 0 10px;font-size:16px;text-transform:uppercase;">Controllo Globale</p>
            ${ownedHtml}
        </div>
        
        <button class="action-btn"
            style="padding:20px 80px;border:3px solid ${winnerColor};color:${winnerColor};
                   background:transparent;cursor:pointer;font-size:28px;font-weight:bold;">
            AVANTI ▶
        </button>`;

    overlay.querySelector('button').onclick = () => {
        overlay.remove();
        grid.clear();
        controlPoints.clear();
        state = 'SETUP_P1';
        document.getElementById('controls-panel').style.display = 'none';
        document.getElementById('setup-overlay').style.display  = 'none';
        if (typeof ctx !== 'undefined') ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (checkCampaignWin()) return;
        runNextBattle();
    };

    document.body.appendChild(overlay);
}

console.log('[campaign_battles.js] Caricato.');
