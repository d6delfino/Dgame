/* ============================================================
   campaign_upgrades.js — Gestione Upgrades Settori Campagna
   ============================================================ */

// Definizione globale di tutti gli upgrade disponibili
const CAMPAIGN_UPGRADE_DEFS = [
    { key: 'mineUpgrade',      icon: '⛏️', name: 'Miniera',          cost: () => CAMPAIGN.UPGRADE_MINE_COST,      desc: '+2 rendita al settore.' },
    { key: 'mineField',        icon: '🛸', name: 'Droni-Mina',       cost: () => CAMPAIGN.UPGRADE_MINEFIELD_COST, desc: 'Droni-Mina che eliminano gli attaccanti.' },
    { key: 'fortressUpgrade',  icon: '🏰', name: 'Fortezza',         cost: () => CAMPAIGN.UPGRADE_FORTRESS_COST,  desc: '+5 crediti difesa in battaglia.' },
    { key: 'hangarUpgrade',    icon: '🛩️', name: 'Hangar',           cost: () => CAMPAIGN.UPGRADE_HANGAR_COST,    desc: '+1 Gittata per gli attacchi.' },
    { key: 'legLabUpgrade',    icon: '🦿', name: 'Lab. Gambe',       cost: () => CAMPAIGN.UPGRADE_LEGLAB_COST,    desc: 'Agenti base: +1 Passi.' },
    { key: 'armLabUpgrade',    icon: '🦾', name: 'Lab. Braccia',     cost: () => CAMPAIGN.UPGRADE_ARMLAB_COST,    desc: 'Agenti base: +1 Tiro.' },
    { key: 'armorLabUpgrade',  icon: '🦺', name: 'Lab. Armature',    cost: () => CAMPAIGN.UPGRADE_ARMORLAB_COST,  desc: 'Agenti base: +1 Vita.' },
    { key: 'weaponLabUpgrade', icon: '🔫', name: 'Lab. Armi',        cost: () => CAMPAIGN.UPGRADE_WEAPONLAB_COST, desc: 'Agenti base: +1 Danno.' },
    { key: 'artilleryUpgrade', icon: '🎯', name: 'Artiglieria',      cost: () => CAMPAIGN.UPGRADE_ARTILLERY_COST, desc: `1 attacco a turno a distanza ${CAMPAIGN.ARTILLERY_RANGE} che elimina il 25% dei crediti e ogni upgrade al settore.` },
    { key: 'nukeUnlockUpgrade',icon: '☢️', name: 'Silo Nucleare',    cost: () => CAMPAIGN.UPGRADE_NUKE_UNLOCK_COST, desc: 'procura armi nucleari che annientano un intero settore.' },
    { key: 'icbmUpgrade',      icon: '🚀', name: 'Missili ICBM',     cost: () => CAMPAIGN.UPGRADE_ICBM_COST,      desc: 'armi nucleari ed artiglieria hanno raggio globale.' }
];

// Esporta le chiavi per ottimizzare la rete (network_sync)
window.CAMPAIGN_UPGRADE_DEFS = CAMPAIGN_UPGRADE_DEFS;
window.CAMPAIGN_UPGRADE_KEYS = CAMPAIGN_UPGRADE_DEFS.map(d => d.key);

/**
 * Calcola i bonus cumulativi di un giocatore basati sugli upgrade dei suoi settori.
 */
function getPlayerCampaignBonuses(playerFaction) {
    const b = { extraRange: 0, nukeUnlocked: false, icbmUnlocked: false, artilleryCount: 0, hp:0, mov:0, rng:0, dmg:0 };
    campaignState.sectors.forEach(s => {
        if (s.owner !== playerFaction) return;
        if (s.hangarUpgrade)     b.extraRange++;
        if (s.nukeUnlockUpgrade) b.nukeUnlocked = true;
        if (s.icbmUpgrade)       b.icbmUnlocked = true;
        if (s.artilleryUpgrade)  b.artilleryCount++;
        if (s.legLabUpgrade)     b.mov++;
        if (s.armLabUpgrade)     b.rng++;
        if (s.armorLabUpgrade)   b.hp++;
        if (s.weaponLabUpgrade)  b.dmg++;
    });
    return b;
}
window.getPlayerCampaignBonuses = getPlayerCampaignBonuses;

// ============================================================
// UI PANNELLI
// ============================================================

function showSectorUpgradePanel(playerFaction, sectorId) {
    const avail = campaignState.credits[playerFaction] || 0;
    const s = campaignState.sectors[sectorId];

    const contentHtml = CAMPAIGN_UPGRADE_DEFS.map(item => {
        const isOwned = s[item.key] === true;
        const cost = item.cost();
        const canBuy = !isOwned && avail >= cost;
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px;background:rgba(255,255,255,0.04);border:1px solid #333;border-radius:8px;margin-bottom:6px; opacity:${(s[item.key] !== undefined && !isOwned) ? '1' : (isOwned ? '0.5' : '1')}">
            <span style="font-size:24px;width:30px;text-align:center;">${item.icon}</span>
            <div style="flex:1;text-align:left;line-height:1.2;">
                <b style="color:#fff;font-size:14px;">${item.name}</b><br>
                <small style="color:#aaa;font-size:11px;">${item.desc}</small>
            </div>
            ${isOwned 
                ? '<b style="color:#00ff88;font-size:12px;">ATTIVO</b>' 
                : `<button class="action-btn upg-buy" data-key="${item.key}" data-cost="${cost}" style="padding:6px 12px;cursor:pointer;border:2px solid #555;color:#ccc;background:transparent;" ${!canBuy ? 'disabled' : ''}>💰${cost}</button>`}
        </div>`;
    }).join('');

    const modal = _gui_createModalBase(playerFaction, "🛠️ COSTRUISCI", `Settore ${sectorId} | Disponibili: 💰${avail}`, contentHtml, [{ id: 'btn-close', label: 'CHIUDI', primary: false }]);

    modal.querySelectorAll('.upg-buy').forEach(btn => {
        btn.onclick = () => {
            const key = btn.dataset.key; 
            const cost = parseInt(btn.dataset.cost);
            
            // VALIDAZIONE ECONOMICA: Impedisce il click se non ci sono fondi
            if (campaignState.credits[playerFaction] < cost) return;

            modal.remove();
            
            if (window.isCampaignOnline && !window.isHost) {
                // Il client chiede all'Host (l'Host sottrarrà i crediti)
                _net_clientSend('SECTOR_UPGRADE', { sectorId, upgradeKey: key, cost });
            } else {
                // Gioco Locale o Host: sottrae i crediti e applica
                campaignState.credits[playerFaction] -= cost;
                _applySectorUpgradeLocale(playerFaction, sectorId, key, cost);
            }
        };
    });
    modal.querySelector('#btn-close').onclick = () => modal.remove();
}
window.showSectorUpgradePanel = showSectorUpgradePanel;

function _applySectorUpgradeLocale(playerFaction, sectorId, upgradeKey, cost) {
    // NOTA: Sottrazione crediti rimossa da qui per evitare doppi addebiti in multiplayer
    const sector = campaignState.sectors[sectorId];
    sector[upgradeKey] = true;
    
    // Effetti immediati extra
    if(upgradeKey === 'mineUpgrade') sector.income += 2;
    if(upgradeKey === 'artilleryUpgrade') {
        if(!campaignState.artilleryCharges) campaignState.artilleryCharges = {};
        campaignState.artilleryCharges[playerFaction] = (campaignState.artilleryCharges[playerFaction] || 0) + 1;
    }

    if(typeof playSFX === 'function') playSFX('build'); 
    renderCampaignMap(); 
    saveCampaignSnapshot();
}
window._applySectorUpgradeLocale = _applySectorUpgradeLocale;

// Ricollocata qui per raggruppare le finestre
function showBonificaPanel(playerFaction, sectorId) {
    const cost = CAMPAIGN.UPGRADE_BONIFICA_COST;
    const isAdjacent = campaignState.adj[sectorId]?.some(nbId => campaignState.sectors[nbId]?.owner === playerFaction);
    if (!isAdjacent) return showTemporaryMessage('🚧 Bonifica possibile solo su settori adiacenti!');
    const canBuy = (campaignState.credits[playerFaction] || 0) >= cost;
    const content = `<div style="background:rgba(255,255,255,0.05);padding:15px;border-radius:10px;text-align:left;color:#ccc;font-size:14px;">
        Bonifica questa zona per renderla un settore neutrale conquistabile.<div style="color:#FFD700;font-size:20px;margin-top:10px;font-weight:bold;text-align:center;">Costo: 💰${cost}</div></div>`;
    const modal = _gui_createModalBase(playerFaction, "🏗️ BONIFICA", `Settore ${sectorId}`, content, [
        { id: 'btn-confirm', label: `ESEGUI`, primary: true, disabled: !canBuy },
        { id: 'btn-cancel', label: 'ANNULLA', primary: false }
    ]);
    modal.querySelector('#btn-confirm').onclick = () => {
        modal.remove();
        if (window.isCampaignOnline && !window.isHost) _net_clientSend('SECTOR_UPGRADE', { sectorId, upgradeKey: 'bonifica', cost });
        else {
            campaignState.credits[playerFaction] -= cost;
            const s = campaignState.sectors[sectorId];
            s.blocked = false; s.owner = 0; s.income = 1;
            renderCampaignMap(); saveCampaignSnapshot();
        }
    };
    modal.querySelector('#btn-cancel').onclick = () => modal.remove();
}
window.showBonificaPanel = showBonificaPanel;

// ============================================================
// UI: MODAL BASE (helper condiviso da tutti i pannelli)
// ============================================================

function _gui_createModalBase(playerFaction, title, subtitle, contentHtml, buttons = []) {
    const pColor = players[playerFaction]?.color || COLORS['p' + playerFaction];
    
    const modal = document.createElement('div');
    modal.className = 'campaign-ui-modal';
    modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);
        z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Courier New;padding:10px;box-sizing:border-box;`;

    let buttonsHtml = buttons.map(btn => `
        <button id="${btn.id}" class="action-btn" style="width:100%;padding:14px;font-size:18px;font-weight:bold;border-radius:8px;cursor:pointer;
            ${btn.primary ? `border:3px solid ${pColor};color:${pColor};background:${pColor}22;` : `border:2px solid #555;color:#888;background:transparent;margin-top:8px;`}"
            ${btn.disabled ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>${btn.label}</button>
    `).join('');

    modal.innerHTML = `
        <div style="background:rgba(5,10,20,0.98);border:4px solid ${pColor};border-radius:15px;padding:22px;width:100%;max-width:500px;text-align:center;box-shadow:0 0 40px rgba(0,0,0,1);box-sizing:border-box;max-height:95vh;overflow-y:auto;">
            <h1 style="color:${pColor};margin:0 0 8px;font-size:26px;letter-spacing:2px;text-transform:uppercase;">${title}</h1>
            <div style="color:#aaa;font-size:14px;margin-bottom:20px;text-transform:uppercase;">${subtitle}</div>
            <div id="modal-content-area" style="margin-bottom:20px;">${contentHtml}</div>
            <div id="modal-button-area">${buttonsHtml}</div>
        </div>`;

    document.body.appendChild(modal);
    return modal;
}

// ============================================================
// PORTATA: settori raggiungibili per attacco / artiglieria / nuke
// ============================================================

function _isSectorReachable(targetId, p) {
    const bonuses = getPlayerCampaignBonuses(p);
    const hasTrasporti = campaignState.sectors.some(s => s.owner === p && s.specialization === 'TRASPORTI');
    
    // Gittata massima: 2 base (4 con trasporti) + bonus Hangar
    let maxDist = hasTrasporti ? 4 : 2;
    maxDist += (bonuses.extraRange || 0);

    const mySectors = campaignState.sectors.filter(s => s.owner === p).map(s => s.id);
    if (mySectors.length === 0) return false;

    // --- LOGICA DI NAVIGAZIONE CON OSTACOLI ---
    // Partiamo dai miei settori e cerchiamo di raggiungere targetId
    // muovendoci solo attraverso settori NON bloccati.
    const queue = [];
    const visited = new Set();

    // Inizializziamo la coda con tutti i settori posseduti dal giocatore (distanza 0)
    mySectors.forEach(id => {
        queue.push({id: id, d: 0});
        visited.add(id);
    });

    while (queue.length > 0) {
        const curr = queue.shift();

        // Se abbiamo trovato il settore bersaglio, è raggiungibile!
        if (curr.id === targetId) return true;

        // Se non abbiamo ancora esaurito i passi disponibili, espandiamo la ricerca
        if (curr.d < maxDist) {
            for (const nbId of (campaignState.adj[curr.id] || [])) {
                const nbSector = campaignState.sectors[nbId];
                
                // CONDIZIONE CRITICA:
                // 1. Il settore non deve essere già stato visitato
                // 2. Il settore NON deve essere bloccato (agisce come un muro)
                // Nota: permettiamo il passaggio se il settore è il target finale (anche se bloccato),
                // ma il resto della logica di gioco impedisce comunque l'attacco ai bloccati.
                if (!visited.has(nbId)) {
                    // Se il settore è il bersaglio lo aggiungiamo a prescindere per validare la distanza.
                    // Se invece è un settore intermedio, deve essere NON bloccato per passarci attraverso.
                    if (nbId === targetId || !nbSector.blocked) {
                        visited.add(nbId);
                        queue.push({id: nbId, d: curr.d + 1});
                    }
                }
            }
        }
    }
    return false;
}
window._isSectorReachable = _isSectorReachable;

function _isNukeReachable(targetId, p) {
    const bonuses = getPlayerCampaignBonuses(p);
    if (!bonuses.nukeUnlocked) return false;
    if (bonuses.icbmUnlocked) return true;
    const mySectors = campaignState.sectors.filter(s => s.owner === p).map(s => s.id);
    return (campaignState.adj[targetId] || []).some(id => mySectors.includes(id));
}
window._isNukeReachable = _isNukeReachable;

function _isArtilleryReachable(targetId, p) {
    const maxDist = CAMPAIGN.ARTILLERY_RANGE;
    const artillerySources = campaignState.sectors.filter(s => s.owner === p && s.artilleryUpgrade === true);
    if (artillerySources.length === 0) return false;

    const bonuses = getPlayerCampaignBonuses(p);
    if (bonuses.icbmUnlocked) return true;

    for (const source of artillerySources) {
        if (source.id === targetId) return true;
        const queue = [{ id: source.id, d: 0 }];
        const visited = new Set([source.id]);
        while (queue.length > 0) {
            const curr = queue.shift();
            if (curr.id === targetId) return true;
            if (curr.d < maxDist) {
                for (const nbId of (campaignState.adj[curr.id] || [])) {
                    if (!visited.has(nbId)) { visited.add(nbId); queue.push({ id: nbId, d: curr.d + 1 }); }
                }
            }
        }
    }
    return false;
}
window._isArtilleryReachable = _isArtilleryReachable;

// ============================================================
// UI: SELETTORE CREDITI (attacco, artiglieria, nuke)
// ============================================================

function showCreditSelector(playerFaction, targetSectorId) {
    const avail = campaignState.credits[playerFaction] || 0;
    const sector = campaignState.sectors[targetSectorId];
    const bonuses = getPlayerCampaignBonuses(playerFaction);
    const hasExplosion = campaignState.sectors.some(s => s.owner === playerFaction && s.specialization === 'ESPLOSIONE');
    const canAttack = _isSectorReachable(targetSectorId, playerFaction);

    const nukeCost = hasExplosion ? (CAMPAIGN.NUCLEARIZE_COST / 2) : CAMPAIGN.NUCLEARIZE_COST;
    const nukePossible = _isNukeReachable(targetSectorId, playerFaction);
    const canNuke = nukePossible && avail >= nukeCost;

    const artCharges = (campaignState.artilleryCharges && campaignState.artilleryCharges[playerFaction]) || 0;
    const canArtillery = artCharges > 0 && _isArtilleryReachable(targetSectorId, playerFaction);

    const content = `
        <div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;color:#888;margin-bottom:15px;">
            ${sector.owner > 0 ? `Difensore: 🏦 ${campaignState.sectorCredits[targetSectorId]?.[sector.owner] || 0} cr` : 'Settore Neutrale'}
        </div>
        <div style="color:#fff;font-size:18px;margin-bottom:10px;">INVESTIMENTO: <span id="cr-val" style="color:#00ff88;font-weight:bold;font-size:24px;">4</span></div>
        <input type="range" id="cr-slider" min="${Math.min(4, avail)}" max="${avail}" value="${Math.min(4, avail)}" style="width:100%;accent-color:#00ff88;">
        <div style="color:#888;font-size:12px;margin-top:5px;">In Banca: 💰${avail}</div>
    `;

    const modal = _gui_createModalBase(playerFaction, "⚔️ ORDINE AZIONE", `Bersaglio: Settore ${targetSectorId}`, content, [
        { id: 'btn-attack',    label: canAttack ? 'INVIA ATTACCO' : 'FUORI PORTATA TRUPPE', primary: true,  disabled: !canAttack || avail < 4 },
        { id: 'btn-nuke',      label: `☢️ NUCLEARIZZA (💰${nukeCost})`,          primary: true,  disabled: !canNuke },
        { id: 'btn-artillery', label: `🎯 ARTIGLIERIA (Cariche: ${artCharges})`, primary: true,  disabled: !canArtillery },
        { id: 'btn-cancel',    label: 'ANNULLA',                                 primary: false }
    ]);

    const nukeBtn = modal.querySelector('#btn-nuke');
    if (!bonuses.nukeUnlocked)  nukeBtn.innerText = '☢️ NUCLEARIZZA (Richiede Silo)';
    else if (!nukePossible)     nukeBtn.innerText = '☢️ NUCLEARIZZA (Fuori Portata)';

    const slider = modal.querySelector('#cr-slider');
    slider.oninput = () => modal.querySelector('#cr-val').textContent = slider.value;

    modal.querySelector('#btn-attack').onclick = () => {
        const val = parseInt(slider.value); modal.remove();
        if (window.isCampaignOnline && !window.isHost) _net_clientSend('CONFIRM_CREDIT_ORDER', { sectorId: targetSectorId, credits: val });
        else { _applyOrderWithCredits(targetSectorId, val, playerFaction); renderCampaignMap(); }
    };

    modal.querySelector('#btn-nuke').onclick = () => {
        if (!confirm(`☢️ ATTENZIONE: NUCLEARIZZAZIONE\n\nEffetti:\n1. Il settore sarà BLOCCATO per l'intero turno successivo.\n2. Verranno distrutti tutti i crediti e gli upgrade in difesa.\n3. Se i nemici attaccano qui, perderanno i loro crediti nel vuoto!\n\nVuoi procedere con l'invio dell'ordine?`)) return;
        modal.remove();
        if (window.isCampaignOnline && !window.isHost) _net_clientSend('SABOTAGE', { sectorId: targetSectorId });
        else { _orderNuclearize(targetSectorId, playerFaction, nukeCost); renderCampaignMap(); }
    };

    modal.querySelector('#btn-artillery').onclick = () => {
        if (!confirm(`🎯 ATTACCO ARTIGLIERIA\nDanni immediati: -25% crediti nemici e distrugge le strutture. Confermi?`)) return;
        modal.remove();
        if (window.isCampaignOnline && !window.isHost) _net_clientSend('ARTILLERY_STRIKE', { sectorId: targetSectorId });
        else { _applyArtilleryStrikeLocale(targetSectorId, playerFaction); renderCampaignMap(); }
    };

    modal.querySelector('#btn-cancel').onclick = () => modal.remove();
}
window.showCreditSelector = showCreditSelector;

// ============================================================
// AZIONI OFFENSIVE: ordini, artiglieria, nuclearizzazione
// ============================================================

function _applyOrderWithCredits(sectorId, credits, playerFaction) {
    const avail = campaignState.credits[playerFaction] || 0;
    if (credits > avail) return;
    campaignState.credits[playerFaction] -= credits;
    if (!campaignState.pendingOrders[playerFaction]) campaignState.pendingOrders[playerFaction] = [];
    campaignState.pendingOrders[playerFaction].push({ sectorId, credits });
    campaignState.pendingMoves[playerFaction] = sectorId;
    if (!campaignState._allOrderedSectors[sectorId]) campaignState._allOrderedSectors[sectorId] = [];
    if (!campaignState._allOrderedSectors[sectorId].includes(playerFaction))
        campaignState._allOrderedSectors[sectorId].push(playerFaction);
}
window._applyOrderWithCredits = _applyOrderWithCredits;

function _orderNuclearize(sectorId, playerFaction, cost) {
    if (campaignState.credits[playerFaction] < cost) return;
    campaignState.credits[playerFaction] -= cost;
    if (!campaignState.pendingOrders[playerFaction]) campaignState.pendingOrders[playerFaction] = [];
    campaignState.pendingOrders[playerFaction].push({ sectorId, credits: 0, isSabotage: true, sabotageCost: cost });
    if (!campaignState._allOrderedSectors[sectorId]) campaignState._allOrderedSectors[sectorId] = [];
    campaignState._allOrderedSectors[sectorId].push(playerFaction);
    showTemporaryMessage("☢️ Ordine di Sabotaggio registrato!");
}
window._orderNuclearize = _orderNuclearize;

function _applyArtilleryStrikeLocale(sectorId, playerFaction) {
    if (!campaignState.artilleryCharges[playerFaction] || campaignState.artilleryCharges[playerFaction] <= 0) return;
    campaignState.artilleryCharges[playerFaction]--;

    const sector = campaignState.sectors[sectorId];
    const targetOwner = sector.owner;

    if (targetOwner > 0 && campaignState.sectorCredits[sectorId]?.[targetOwner]) {
        const creds = campaignState.sectorCredits[sectorId][targetOwner];
        campaignState.sectorCredits[sectorId][targetOwner] = Math.max(0, creds - Math.ceil(creds * CAMPAIGN.ARTILLERY_CREDIT_DMG_PERCENT));
    }

    // Distrugge tutti gli upgrade nel settore colpito
    window.CAMPAIGN_UPGRADE_KEYS.forEach(key => { sector[key] = false; });

    if (!campaignState._roundLog) campaignState._roundLog = [];
    campaignState._roundLog.push({ type: 'ARTILLERY', p: playerFaction, sid: sectorId });

    if (typeof playSFX === 'function') playSFX('explosion');
    showTemporaryMessage(`🎯 Artiglieria su Settore ${sectorId}! Strutture distrutte.`);
    saveCampaignSnapshot();
}
window._applyArtilleryStrikeLocale = _applyArtilleryStrikeLocale;

/**
 * Nuclearizza un settore: azzera crediti e upgrade, lo blocca per 2 round.
 * Chiamata sia da _orderNuclearize (fase risoluzione) che da campaign_battle.js.
 */
function _applyNuclearize(sectorId, playerFaction, cost = CAMPAIGN.NUCLEARIZE_COST) {
    const sector = campaignState.sectors[sectorId];
    if (cost > 0) campaignState.credits[playerFaction] -= cost;

    campaignState.sectorCredits[sectorId] = {};
    // Distrugge tutti gli upgrade dinamicamente
    window.CAMPAIGN_UPGRADE_KEYS.forEach(key => { sector[key] = false; });
    sector.income          = 1;
    sector.owner           = 0;
    sector.blocked         = true;
    sector._nuclearCooldown = 2;
    delete sector._nuclearized;

    playSFX('explosion');
    showTemporaryMessage(`☢️ Settore ${sectorId} nuclearizzato!`);
}
window._applyNuclearize = _applyNuclearize;

console.log("[campaign_upgrades.js] Caricato.");
markScriptAsLoaded('campaign_upgrades.js');