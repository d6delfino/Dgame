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
const _bat_origHandleSectorClick = window.handleSectorClick;
window.handleSectorClick = function(targetId) {
    if (campaignState.phase !== 'PLANNING') return;
    const p      = campaignState.currentPlayer;
    const target = campaignState.sectors[targetId];

    if (target.owner === p) {
        showTemporaryMessage('Controlli già questo settore!');
        return;
    }

    const reachable = campaignState.adj[targetId].some(id => campaignState.sectors[id].owner === p);
    if (!reachable) {
        showTemporaryMessage('Settore non raggiungibile!');
        playSFX('click');
        return;
    }

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
// UI: selettore crediti per un ordine
// ============================================================
function _bat_showCreditSelector(playerFaction, targetSectorId) {
    const avail   = campaignState.credits[playerFaction] || 0;
    const minCost = 4;
    if (avail < minCost) {
        showTemporaryMessage(`Crediti insufficienti! Servono almeno ${minCost}.`);
        return;
    }

    const sector = campaignState.sectors[targetSectorId];
    const pColor = COLORS['p' + playerFaction];
    const pName  = players[playerFaction]?.name || 'P' + playerFaction;
    const spec   = sector.specialization
        ? SECTOR_SPECIALIZATIONS.find(s => s.id === sector.specialization)
        : null;

    const defCredits = campaignState.sectorCredits[targetSectorId]?.[sector.owner] || 0;
    const defLine = sector.owner > 0
        ? `<div style="color:#aaa;font-size:12px;margin-top:6px;">
               Difensore: 🏦 ${defCredits} crediti allocati
           </div>`
        : '';
    const specLine = spec
        ? `<div style="color:#FFD700;font-size:12px;margin-top:6px;">${spec.label} — ${spec.desc}</div>`
        : '';

    const modal = document.createElement('div');
    modal.id = 'eco-credit-modal';
    modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.82);z-index:999999;
        display:flex;align-items:center;justify-content:center;font-family:Courier New;`;
    modal.innerHTML = `
        <div style="background:rgba(5,10,20,0.97);border:2px solid ${pColor};border-radius:12px;
                    padding:28px 36px;min-width:340px;text-align:center;">
            <h3 style="color:${pColor};margin:0 0 6px;">ORDINE DI ATTACCO</h3>
            <div style="color:#fff;font-size:14px;margin-bottom:4px;">
                ${pName} → Settore ${targetSectorId}
            </div>
            ${defLine}${specLine}
            <hr style="border-color:#333;margin:14px 0;">
            <div style="color:#aaa;font-size:13px;margin-bottom:8px;">
                Crediti disponibili: <span style="color:#FFD700;">${avail}</span>
            </div>
            <div style="color:#fff;font-size:13px;margin-bottom:10px;">
                Crediti da investire:
                <span id="eco-credit-val" style="color:#00ff88;font-size:18px;font-weight:bold;">${minCost}</span>
            </div>
            <input type="range" id="eco-credit-slider"
                min="${minCost}" max="${avail}" value="${minCost}" step="1"
                style="width:100%;accent-color:${pColor};margin-bottom:16px;">
            <div style="display:flex;gap:10px;justify-content:center;">
                <button class="action-btn" id="eco-confirm-order"
                    style="border-color:${pColor};color:${pColor};padding:10px 24px;">
                    CONFERMA ORDINE ✓
                </button>
                <button class="action-btn"
                    style="border-color:#555;color:#888;padding:10px 18px;"
                    onclick="document.getElementById('eco-credit-modal').remove();">
                    ANNULLA
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const slider  = modal.querySelector('#eco-credit-slider');
    const valDisp = modal.querySelector('#eco-credit-val');
    slider.oninput = () => { valDisp.textContent = slider.value; };

    modal.querySelector('#eco-confirm-order').onclick = () => {
        const chosen = parseInt(slider.value);
        modal.remove();
        campaignState.credits[playerFaction] -= chosen;
        if (!campaignState.pendingOrders[playerFaction]) campaignState.pendingOrders[playerFaction] = [];
        campaignState.pendingOrders[playerFaction].push({ sectorId: targetSectorId, credits: chosen });
        campaignState.pendingMoves[playerFaction] = targetSectorId; // compat base
        renderCampaignMap();
    };
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

            // FORTEZZA: aggiunge crediti settori adiacenti posseduti
            if (sector.specialization === 'FORTEZZA') {
                campaignState.adj[sector.id].forEach(adjId => {
                    const adj = campaignState.sectors[adjId];
                    if (adj.owner === sector.owner)
                        defCr += campaignState.sectorCredits[adjId]?.[sector.owner] || 0;
                });
            }

            // Fallback: preleva minimo dalla banca se il settore non ha depositi
            if (defCr === 0) {
                const bank = campaignState.credits[sector.owner] || 0;
                defCr = Math.max(4, Math.min(bank, 4));
                campaignState.credits[sector.owner] = Math.max(0, bank - defCr);
            }

            battleCredits[sector.owner] = defCr;
        }

        if (participants.size > 1) {
            campaignState.battleQueue.push({
                sectorId: sector.id,
                factions: Array.from(participants),
                battleCredits
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

    let html = `<div style="font-family:Courier New;color:#fff;padding:24px;
                            max-width:520px;text-align:left;width:100%;">
        <h2 style="color:#fff;text-align:center;margin-top:0;">RIEPILOGO ORDINI</h2>`;

    if (peaceful.length > 0) {
        html += `<p style="color:#aaa;font-size:13px;margin-bottom:6px;">CONQUISTE PACIFICHE:</p>`;
        peaceful.forEach(({ p, sid }) => {
            const c = COLORS['p' + p];
            html += `<div style="color:${c};font-size:14px;margin-bottom:4px;">
                → ${players[p]?.name || 'P'+p} conquista il Settore ${sid}</div>`;
        });
    }

    if (battles.length > 0) {
        html += `<p style="color:#ff4444;font-size:13px;margin-top:12px;margin-bottom:6px;">⚔️ BATTAGLIE:</p>`;
        battles.forEach(b => {
            const spec = campaignState.sectors[b.sectorId].specialization
                ? SECTOR_SPECIALIZATIONS.find(s => s.id === campaignState.sectors[b.sectorId].specialization)?.label || ''
                : '';
            const names = b.factions.map(pid => {
                const c  = COLORS['p' + pid];
                const cr = b.battleCredits[pid] ?? '?';
                return `<span style="color:${c}">${players[pid]?.name || 'P'+pid} (💰${cr})</span>`;
            }).join(' vs ');
            html += `<div style="font-size:14px;margin-bottom:4px;">
                Settore ${b.sectorId} ${spec}: ${names}</div>`;
        });
    }

    if (!peaceful.length && !battles.length)
        html += `<p style="color:#888;text-align:center;">Nessun movimento questo turno.</p>`;

    html += `<button class="action-btn"
        style="width:100%;margin-top:20px;border-color:#00ff88;color:#00ff88;"
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
// OVERRIDE: startCampaignBattle — battleCredits gestiti da freshSetupData
// ============================================================
const _bat_origStartCampaignBattle = window.startCampaignBattle;
window.startCampaignBattle = function(factions, sectorId) {
    // _currentBattle già impostato da runNextBattle
    _bat_origStartCampaignBattle(factions, sectorId);
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
// 1 credito per ogni punto statistica (move+shoot+hp+any other numeric stat)
// ============================================================
function _bat_agentSurvivorValue(faction) {
    const agents = players[faction]?.agents || [];
    let total = 0;
    agents.forEach(agent => {
        if (!agent) return;
        // Somma tutti i campi numerici che sembrano statistiche
        // Esclude id, owner, faction e simili (di solito <= 0 o stringhe)
        ['move','moves','spd','speed','shoot','shooting','atk','attack',
         'hp','life','lives','health','def','defense','stat1','stat2','stat3','stat4'].forEach(key => {
            if (typeof agent[key] === 'number' && agent[key] > 0)
                total += agent[key];
        });
        // Fallback: se nessun campo trovato, conta l'agente come valore base 4
        // (statistiche 1-1-1-1 di base)
    });
    // Se non abbiamo trovato nulla, stima 4 per agente vivo
    if (total === 0 && agents.length > 0) total = agents.length * 4;
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
        const bankVal     = campaignState.credits[faction] || 0;

        const destination = isWinner
            ? `→ 📦 Settore ${sectorId}: <b>${sectorAlloc}</b>`
            : `→ 🏦 Banca: <b>+${r.total}</b>`;

        return `<div style="color:${c};font-size:13px;margin:6px 0;
                            border-left:3px solid ${c};padding-left:8px;">
            <div style="font-weight:bold;">${name} ${isWinner ? '🏆' : '💀'}</div>
            <div style="color:#aaa;font-size:11px;margin-top:2px;">
                Negozio residuo: ${r.shopResidual} &nbsp;+&nbsp;
                Agenti vivi: ${r.survivorValue} &nbsp;=&nbsp;
                <span style="color:${c};">Totale: ${r.total}</span>
            </div>
            <div style="font-size:12px;margin-top:2px;">${destination}</div>
        </div>`;
    }).join('');

    const ownedHtml = Array.from({ length: n }, (_, i) => i + 1).map(p => {
        const cnt = campaignState.sectors.filter(s => s.owner === p).length;
        const c   = COLORS['p' + p];
        return `<span style="color:${c};margin:0 8px;">${players[p]?.name || 'P'+p}: 🏴${cnt}</span>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.96);z-index:99999;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-family:Courier New,monospace;text-align:center;padding:20px;`;
    overlay.innerHTML = `
        <h1 style="color:${winnerColor};text-shadow:0 0 15px ${winnerColor};margin-bottom:8px;">
            ⚔️ BATTAGLIA CONCLUSA
        </h1>
        <h2 style="color:${winnerColor};margin-bottom:16px;">VINCITORE: ${winnerName.toUpperCase()}</h2>
        <div style="background:rgba(255,255,255,0.05);border:1px solid #333;border-radius:8px;
                    padding:16px 30px;margin-bottom:16px;min-width:340px;text-align:left;">
            <p style="color:#aaa;font-size:11px;margin:0 0 10px;text-transform:uppercase;
                      letter-spacing:1px;text-align:center;">
                Crediti post-battaglia
            </p>
            ${creditsHtml}
        </div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid #222;border-radius:8px;
                    padding:10px 20px;margin-bottom:20px;font-size:13px;">
            <p style="color:#666;margin:0 0 6px;font-size:11px;">CONTROLLO SETTORI</p>
            ${ownedHtml}
        </div>
        <button class="action-btn"
            style="padding:15px 50px;border:2px solid ${winnerColor};color:${winnerColor};
                   background:transparent;cursor:pointer;font-size:16px;">
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
