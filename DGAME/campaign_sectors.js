/* ============================================================
   campaign_sectors.js — SETTORI, RENDITA, MAPPA
   ============================================================
   Carico ordine: campaign.js → campaign_sectors.js → campaign_battles.js

   Responsabilità:
     • Patch stato campagna (campi condivisi con battles.js)
     • Definizione SECTOR_SPECIALIZATIONS (usata anche da battles.js)
     • Inizializzazione rendita e specializzazioni per settore
     • Hook startCampaign — reset + init proprietà settori
     • Hook startNextPlanningRound — riscossione rendita
     • Override renderCampaignMap — decorazione esagoni
     • Selettore crediti inline (+/−) per settori posseduti
     • Pannello ordini correnti (sidebar)
   ============================================================ */

// ============================================================
// PATCH STATO CAMPAGNA
// Campi condivisi con campaign_battles.js
// ============================================================
(function patchCampaignState() {
    campaignState.pendingOrders   = {};  // { p: [{sectorId, credits}] }
    campaignState.sectorCredits   = {};  // { sectorId: { faction: N } }
    campaignState.pendingAllocation = null;
    campaignState._allOrderedSectors = {};
    campaignState._currentBattle  = null;
})();

// ============================================================
// SPECIALIZZAZIONI — condiviso con campaign_battles.js
// ============================================================
const SECTOR_SPECIALIZATIONS = [
    { id: 'FORTEZZA', label: '🏰 Fortezza', desc: 'Difesa: usa anche i crediti dei settori adiacenti' },
    { id: 'ARSENALE', label: '⚔️ Arsenale', desc: 'I tuoi agenti partono con +1 Tiro' },
    { id: 'OSPEDALE', label: '🏥 Ospedale', desc: 'I tuoi agenti partono con +1 Vita' },
];

// ============================================================
// INIT PROPRIETÀ SETTORI — rendita casuale e specializzazione
// ============================================================
function _eco_initSectorProperties() {
    campaignState.sectors.forEach(s => {
        if (s.income === undefined)
            s.income = 4 + Math.floor(Math.random() * 7); // 4..10

        if (s.specialization === undefined)
            s.specialization = Math.random() < 0.60
                ? SECTOR_SPECIALIZATIONS[Math.floor(Math.random() * SECTOR_SPECIALIZATIONS.length)].id
                : null;

        if (!campaignState.sectorCredits[s.id])
            campaignState.sectorCredits[s.id] = {};
    });
}

// ============================================================
// HOOK: startCampaign
// ============================================================
const _sec_origStartCampaign = window.startCampaign;
window.startCampaign = function(numPlayers) {
    if (campaignState.sectors) {
        campaignState.sectors.forEach(s => {
            s.income = undefined;
            s.specialization = undefined;
        });
    }
    campaignState.sectorCredits     = {};
    campaignState.pendingOrders     = {};
    campaignState.pendingAllocation = null;
    campaignState._currentBattle    = null;

    _sec_origStartCampaign(numPlayers);
    _eco_initSectorProperties();
};

// ============================================================
// RENDITA — riscossa a inizio turno
// ============================================================
function _eco_collectIncome() {
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
// HOOK: startNextPlanningRound — mostra riepilogo rendita
// ============================================================
const _sec_origStartNextPlanningRound = window.startNextPlanningRound;
window.startNextPlanningRound = function() {
    campaignState.pendingOrders = {};

    const earned = _eco_collectIncome();
    const n = campaignState.numPlayers;

    let incomeHtml = '';
    for (let p = 1; p <= n; p++) {
        if (_isPlayerEliminated(p)) continue;
        const c    = COLORS['p' + p];
        const name = players[p]?.name || 'P' + p;
        incomeHtml += `<div style="color:${c};margin:4px 0;font-size:14px;">
            ${name}: +${earned[p]} rendita → 💰 ${campaignState.credits[p]} totali
        </div>`;
    }

    const overlay = document.createElement('div');
    overlay.id = 'eco-income-overlay';
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.88);z-index:99999;
        display:flex;align-items:center;justify-content:center;font-family:Courier New;`;
    overlay.innerHTML = `
        <div style="text-align:center;padding:30px 40px;border:1px solid #333;
                    border-radius:12px;background:rgba(0,0,10,0.95);min-width:320px;">
            <h2 style="color:#FFD700;margin:0 0 16px;">💰 RENDITA DI TURNO</h2>
            ${incomeHtml}
            <button class="action-btn"
                style="margin-top:20px;border-color:#00ff88;color:#00ff88;padding:10px 30px;"
                onclick="document.getElementById('eco-income-overlay').remove();
                         _sec_origStartNextPlanningRound();">
                INIZIA TURNO ▶
            </button>
        </div>`;
    document.body.appendChild(overlay);
};

// ============================================================
// OVERRIDE: renderCampaignMap
// ============================================================
const _sec_origRenderCampaignMap = window.renderCampaignMap;
window.renderCampaignMap = function() {
    // 1. Sincronizziamo i sistemi: Se c'è un ordine in pendingOrders, 
    // facciamolo vedere a campaign.js tramite pendingMoves
    const p = campaignState.currentPlayer;
    if (campaignState.pendingOrders[p] && campaignState.pendingOrders[p].length > 0) {
        // Prendiamo l'ultimo settore ordinato come "move" principale per attivare il bottone
        campaignState.pendingMoves[p] = campaignState.pendingOrders[p][campaignState.pendingOrders[p].length - 1].sectorId;
    }

    // 2. Costruisce _allOrderedSectors per la visualizzazione dei pallini sulla mappa
    campaignState._allOrderedSectors = {};
    Object.keys(campaignState.pendingOrders).forEach(pid => {
        (campaignState.pendingOrders[pid] || []).forEach(o => {
            if (!campaignState._allOrderedSectors[o.sectorId])
                campaignState._allOrderedSectors[o.sectorId] = [];
            campaignState._allOrderedSectors[o.sectorId].push(Number(pid));
        });
    });

    // 3. Eseguiamo la funzione originale (ora vedrà i pendingMoves e abiliterà il bottone)
    _sec_origRenderCampaignMap();

    // 4. Decoriamo con i badge economici e il pannello laterale
    _eco_decorateSectors();

    if (campaignState.phase === 'PLANNING')
        _eco_renderOrdersPanel();
};

// ============================================================
// DECORAZIONE SETTORI — badge rendita, spec, segnalini extra, selettore allocazione
// ============================================================
function _eco_decorateSectors() {
    const sectorsDiv = document.getElementById('map-sectors');
    if (!sectorsDiv) return;

    campaignState.sectors.forEach(s => {
        const wrap = sectorsDiv.children[s.id];
        if (!wrap) return;

        const spec = s.specialization
            ? SECTOR_SPECIALIZATIONS.find(sp => sp.id === s.specialization)
            : null;

        wrap.querySelectorAll('.eco-badge').forEach(el => el.remove());

        // ── Riga 1: rendita + specializzazione (bottom:-36px) ──
        const badge = document.createElement('div');
        badge.className = 'eco-badge';
        badge.style.cssText = `
            position:absolute; bottom:-36px; left:50%; transform:translateX(-50%);
            white-space:nowrap; font-family:Courier New;
            display:flex; gap:5px; align-items:center;
            pointer-events:none; z-index:5;`;

        const incomeSpan = document.createElement('span');
        incomeSpan.style.cssText = `
            background:rgba(0,0,0,0.82); border:1px solid #FFD70099;
            color:#FFD700; padding:3px 8px; border-radius:6px;
            font-size:14px; font-weight:bold;`;
        incomeSpan.textContent = `+${s.income}💰`;
        badge.appendChild(incomeSpan);

        if (spec) {
            const specSpan = document.createElement('span');
            specSpan.style.cssText = `
                background:rgba(0,0,0,0.82); border:1px solid #ffffff55;
                color:#fff; padding:3px 8px; border-radius:6px; font-size:14px;`;
            specSpan.textContent = spec.label;
            specSpan.title = spec.desc;
            badge.appendChild(specSpan);
        }

        wrap.appendChild(badge);

        // ── Selettore allocazione crediti — dentro l'SVG via foreignObject ──
        const alloc = campaignState.sectorCredits[s.id]?.[s.owner] || 0;
        if (s.owner > 0) {
            const c            = COLORS['p' + s.owner];
            const isCurrPlayer = s.owner === campaignState.currentPlayer
                                 && campaignState.phase === 'PLANNING';
            const svg = wrap.querySelector('svg');
            if (svg) {
                // Rimuovi foreignObject già presenti
                svg.querySelectorAll('foreignObject.eco-alloc-fo').forEach(el => el.remove());

                const svgW = parseFloat(svg.getAttribute('width'));
                const svgH = parseFloat(svg.getAttribute('height'));
                const foW  = 110, foH = 28;
                const foX  = svgW / 2 - foW / 2;
                // Posizionato nella metà inferiore dell'esagono (sotto il testo nome)
                const foY  = svgH / 2 + 18;

                const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
                fo.setAttribute('x', foX);
                fo.setAttribute('y', foY);
                fo.setAttribute('width',  foW);
                fo.setAttribute('height', foH);
                fo.classList.add('eco-alloc-fo');

                const inner = document.createElement('div');
                inner.style.cssText = `
                    display:flex; align-items:center; justify-content:center; gap:3px;
                    height:100%; font-family:Courier New; font-size:12px;`;

                if (isCurrPlayer) {
                    const btnStyle = `
                        background:rgba(0,0,0,0.9); border:1px solid ${c}; color:${c};
                        width:22px; height:22px; border-radius:4px; cursor:pointer;
                        font-size:15px; font-weight:bold; line-height:1;
                        padding:0; flex-shrink:0;`;

                    const btnMinus = document.createElement('button');
                    btnMinus.textContent = '−';
                    btnMinus.style.cssText = btnStyle;
                    btnMinus.onclick = (e) => {
                        e.stopPropagation();
                        const cur = campaignState.sectorCredits[s.id]?.[s.owner] || 0;
                        if (cur <= 0) return;
                        campaignState.sectorCredits[s.id][s.owner] = cur - 1;
                        campaignState.credits[s.owner] = (campaignState.credits[s.owner] || 0) + 1;
                        renderCampaignMap();
                    };

                    const valSpan = document.createElement('span');
                    valSpan.style.cssText = `
                        background:rgba(0,0,0,0.9); border:1px solid ${c}88;
                        color:${c}; padding:1px 6px; border-radius:4px;
                        font-size:12px; font-weight:bold;
                        min-width:36px; text-align:center; white-space:nowrap;`;
                    valSpan.textContent = `🏦${alloc}`;

                    const btnPlus = document.createElement('button');
                    btnPlus.textContent = '+';
                    btnPlus.style.cssText = btnStyle;
                    btnPlus.onclick = (e) => {
                        e.stopPropagation();
                        const bank = campaignState.credits[s.owner] || 0;
                        if (bank <= 0) { showTemporaryMessage('Nessun credito in banca!'); return; }
                        if (!campaignState.sectorCredits[s.id]) campaignState.sectorCredits[s.id] = {};
                        campaignState.sectorCredits[s.id][s.owner] = (campaignState.sectorCredits[s.id][s.owner] || 0) + 1;
                        campaignState.credits[s.owner] = bank - 1;
                        renderCampaignMap();
                    };

                    inner.appendChild(btnMinus);
                    inner.appendChild(valSpan);
                    inner.appendChild(btnPlus);
                } else if (alloc > 0) {
                    const valSpan = document.createElement('span');
                    valSpan.style.cssText = `
                        background:rgba(0,0,0,0.82); border:1px solid ${c}88;
                        color:${c}; padding:1px 8px; border-radius:4px; font-size:12px;`;
                    valSpan.textContent = `🏦${alloc}`;
                    inner.appendChild(valSpan);
                }

                if (isCurrPlayer || alloc > 0) {
                    fo.appendChild(inner);
                    svg.appendChild(fo);
                }
            }
        }

        // ── Segnalini ordini: tutti i giocatori che puntano a questo settore ──
        const allTargeters = campaignState._allOrderedSectors?.[s.id] || [];
        if (allTargeters.length > 0) {
            const svg = wrap.querySelector('svg');
            if (svg) {
                // Rimuovi segnalini già presenti (da render precedente o dal base)
                svg.querySelectorAll('rect.eco-dot').forEach(el => el.remove());

                const dotW  = 40, dotH = 16, dotGap = 8;
                const svgCx = parseFloat(svg.getAttribute('width'))  / 2;
                const svgCy = parseFloat(svg.getAttribute('height')) / 2;
                const r     = s.id !== undefined ? (new Set((CAMPAIGN_HQ_POSITIONS[campaignState.numPlayers]||[])).has(s.id) ? 100 : 80) : 80;
                const totalW = allTargeters.length * dotW + (allTargeters.length - 1) * dotGap;
                const dy     = svgCy - r * 0.32 - dotH / 2;

                allTargeters.forEach((pid, i) => {
                    const c  = COLORS['p' + pid];
                    const dx = svgCx - totalW / 2 + i * (dotW + dotGap);

                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rect.setAttribute('x', dx);
                    rect.setAttribute('y', dy);
                    rect.setAttribute('width',  dotW);
                    rect.setAttribute('height', dotH);
                    rect.setAttribute('rx', 5);
                    rect.setAttribute('fill', c);
                    rect.classList.add('eco-dot');
                    rect.style.filter = `drop-shadow(0 0 6px ${c})`;
                    svg.appendChild(rect);
                });

                // Anima il bordo dell'esagono se conteso
                wrap.style.animation = 'campPulse 0.9s infinite alternate';
            }
        } else {
            wrap.style.animation = '';
        }
    });
}

// ============================================================
// PANNELLO ORDINI CORRENTI (sidebar destra)
// ============================================================
function _eco_renderOrdersPanel() {
    const p      = campaignState.currentPlayer;
    const pColor = COLORS['p' + p];
    const pName  = players[p]?.name || 'P' + p;
    const orders = campaignState.pendingOrders[p] || [];
    const avail  = campaignState.credits[p] || 0;

    const existing = document.getElementById('eco-orders-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'eco-orders-panel';
    panel.style.cssText = `
        position:fixed; right:16px; top:50%; transform:translateY(-50%);
        z-index:20; background:rgba(0,0,10,0.88); border:1px solid ${pColor}88;
        border-radius:10px; padding:14px 18px; min-width:220px; max-width:260px;
        font-family:Courier New; font-size:13px; color:#fff;`;

    let ordersHtml = orders.length === 0
        ? `<div style="color:#555;font-size:12px;text-align:center;">Nessun ordine</div>`
        : orders.map(o => {
            const sec  = campaignState.sectors[o.sectorId];
            const spec = sec.specialization
                ? SECTOR_SPECIALIZATIONS.find(sp => sp.id === sec.specialization)?.label.split(' ')[0]
                : '';
            return `
                <div style="display:flex;justify-content:space-between;align-items:center;
                            margin-bottom:6px;padding:4px 6px;background:rgba(255,255,255,0.05);
                            border-radius:5px;border-left:3px solid ${pColor};">
                    <span>Settore ${o.sectorId} ${spec}</span>
                    <span style="color:#FFD700;">💰${o.credits}</span>
                    <span style="color:#ff4444;cursor:pointer;font-size:16px;padding:0 4px;"
                        onclick="_eco_cancelOrder(${p},${o.sectorId})">✕</span>
                </div>`;
        }).join('');

    const totalSpent = orders.reduce((sum, o) => sum + o.credits, 0);

    panel.innerHTML = `
        <div style="color:${pColor};font-weight:bold;margin-bottom:10px;font-size:14px;">
            📋 ${pName} — Ordini
        </div>
        ${ordersHtml}
        <hr style="border-color:#333;margin:10px 0;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#aaa;">
            <span>Investiti:</span><span style="color:#ff8844;">💰${totalSpent}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#aaa;">
            <span>Disponibili:</span><span style="color:#00ff88;">💰${avail}</span>
        </div>`;

    document.body.appendChild(panel);
}

function _eco_cancelOrder(playerFaction, sectorId) {
    const orders = campaignState.pendingOrders[playerFaction] || [];
    const order  = orders.find(o => o.sectorId === sectorId);
    if (!order) return;
    campaignState.credits[playerFaction] += order.credits;
    campaignState.pendingOrders[playerFaction] = orders.filter(o => o.sectorId !== sectorId);
    renderCampaignMap();
}

console.log('[campaign_sectors.js] Caricato.');
