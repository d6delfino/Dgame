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
    { id: 'ARSENALE', label: '⚔️ Arsenale', desc: 'I tuoi agenti partono con +1 Danno' },
    { id: 'FORGIA',   label: '🛡️ Forgia',   desc: 'I tuoi agenti partono con +1 Vita' },
    { id: 'TRASPORTI', label: '🚀 Trasporti', desc: 'Mobilità: puoi attaccare settori a distanza 2' },
    { id: 'ESPLOSIONE', label: '💥 Esplosione', desc: 'Sabotaggio: Distruggi i crediti di un settore nemico adiacente (Costo: 30💰)' },
];

// ============================================================
// INIT PROPRIETÀ SETTORI — rendita casuale e specializzazione
// ============================================================
function _eco_initSectorProperties() {
    // 1. Setup sicuro delle costanti
    const hqSlots = CAMPAIGN_HQ_POSITIONS[campaignState.numPlayers] || [0, 12, 18, 6];
    const hqSet = new Set(hqSlots);

    // 2. Inizializzazione BASE (Garantisce che income non sia mai undefined)
    campaignState.sectors.forEach(s => {
        s.specialization = null;
        if (!campaignState.sectorCredits[s.id]) campaignState.sectorCredits[s.id] = {};
        
        // Nuova rendita: 4 per HQ, 2 o 3 (casuale) per gli altri
        if (hqSet.has(s.id)) {
            s.income = 4;
        } else {
            // Genera casualmente 2 o 3
            s.income = 2 + Math.floor(Math.random() * 2);
        }
    });

    // 3. Helper Distanza semplificato
    const getDist = (idA, idB) => {
        if (idA === idB) return 0;
        let queue = [{id: idA, d: 0}], visited = new Set([idA]);
        while(queue.length > 0) {
            let curr = queue.shift();
            if (curr.id === idB) return curr.d;
            let neighbors = campaignState.adj[curr.id] || [];
            for (let nb of neighbors) {
                if (!visited.has(nb)) {
                    visited.add(nb);
                    queue.push({id: nb, d: curr.d + 1});
                }
            }
        }
        return 99;
    };

    // 4. Quadranti (IDs dei settori divisi per zona)
    const quadrants = [
        [1, 2, 3, 4, 5, 24, 26],       // Nord-Ovest
        [7, 8, 9, 10, 11, 25, 27],     // Nord-Est
        [13, 14, 15, 16, 17, 30, 33],  // Sud-Ovest
        [19, 20, 21, 22, 23, 31, 34]   // Sud-Est
    ];

    const finalSelection = [];
    const specs = ['FORTEZZA', 'ARSENALE', 'FORGIA', 'TRASPORTI', 'ESPLOSIONE'].sort(() => Math.random() - 0.5);

    // 5. Selezione un settore per quadrante
    quadrants.forEach((quad, index) => {
        // Filtra: non HQ, non bloccato, distanza da HQ >= 2
        let candidates = quad.filter(id => {
            let s = campaignState.sectors[id];
            return s && !s.blocked && !hqSet.has(id) && hqSlots.every(hqId => getDist(id, hqId) >= 2);
        });

        // Mischia candidati
        candidates.sort(() => Math.random() - 0.5);

        // Prendi il primo che dista almeno 2 dai bonus già piazzati
        let picked = candidates.find(cid => 
            !finalSelection.some(selId => getDist(cid, selId) < 2)
        );

        // Fallback: se la dist 2 tra bonus è impossibile, prendi il primo candidato valido
        if (!picked && candidates.length > 0) picked = candidates[0];

        if (picked !== undefined) {
            finalSelection.push(picked);
            campaignState.sectors[picked].specialization = specs[index];
            console.log(`[Bonus] ${specs[index]} assegnato al settore ${picked}`);
        }
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
            s.blocked = false;
        });
    }
    campaignState.sectorCredits     = {};
    campaignState.pendingOrders     = {};
    campaignState.pendingAllocation = null;
    campaignState._currentBattle    = null;

    _sec_origStartCampaign(numPlayers);
    _eco_initSectorProperties();
    renderCampaignMap();
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
        incomeHtml += `<div style="color:${c}; margin:15px 0; font-size:26px; font-weight:bold; border-left:5px solid ${c}; padding-left:15px; background:rgba(255,255,255,0.03); padding-top:10px; padding-bottom:10px;">
            ${name}: <span style="color:#fff;">+${earned[p]}</span> rendita → <span style="color:#FFD700;">💰 ${campaignState.credits[p]}</span> totali
        </div>`;
    }

    const overlay = document.createElement('div');
    overlay.id = 'eco-income-overlay';
    overlay.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.92); z-index:99999;
        display:flex; align-items:center; justify-content:center; font-family:Courier New;`;

    // MODIFICA: Pannello raddoppiato (min-width 600px, padding 60px)
    overlay.innerHTML = `
        <div style="text-align:center; padding:60px 80px; border:3px solid #FFD700;
                    border-radius:15px; background:rgba(0,0,10,0.98); min-width:600px; box-shadow:0 0 50px rgba(255,215,0,0.2);">
            
            <h1 style="color:#FFD700; margin:0 0 30px; font-size:42px; text-shadow:0 0 20px rgba(255,215,0,0.5); letter-spacing:3px;">
                💰 RENDITA DI TURNO
            </h1>
            
            <div style="text-align:left; margin-bottom:40px;">
                ${incomeHtml}
            </div>

            <button class="action-btn"
                style="margin-top:20px; border:3px solid #00ff88; color:#00ff88; padding:20px 60px; font-size:32px; font-weight:bold; background:transparent; cursor:pointer; text-transform:uppercase;"
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

    if (campaignState.phase === 'PLANNING') {
        _eco_renderOrdersPanel();
    } else {
        // Se non siamo in pianificazione (es. siamo in battaglia), rimuovi il pannello
        const existing = document.getElementById('eco-orders-panel');
        if (existing) existing.remove();
    }
};

// ============================================================
// DECORAZIONE SETTORI (Badge Ingranditi e Centrati)
// ============================================================
function _eco_decorateSectors() {
    const sectorsDiv = document.getElementById('map-sectors');
    if (!sectorsDiv) return;

    // Recupera le posizioni HQ per sapere quanto è grande ogni esagono
    const hqSet = new Set((CAMPAIGN_HQ_POSITIONS[campaignState.numPlayers] || []));

    campaignState.sectors.forEach(s => {
        if (s.blocked) return; // i bloccati non hanno badge economici
        const wrap = sectorsDiv.children[s.id];
        if (!wrap) return;

        const svg = wrap.querySelector('svg');
        if (!svg) return;

        // Pulizia elementi vecchi (per evitare duplicati)
        wrap.querySelectorAll('.eco-html-overlay').forEach(el => el.remove());
        svg.querySelectorAll('rect.eco-dot').forEach(el => el.remove());

        const spec = s.specialization
            ? SECTOR_SPECIALIZATIONS.find(sp => sp.id === s.specialization)
            : null;

        const isHQ = hqSet.has(s.id);
        const r    = 80;
        const svgSize = (r + 6) * 2; 
        
        // --- FATTORE DI SCALA (Ingrandimento) ---
        // scale(1.6) equivale a +60% grandezza. Puoi impostare 2.0 se li vuoi enormi.
        const scaleFactor = 1.6; 
        
        // ── 1. RENDITA E SPECIALIZZAZIONE (In alto, ingrandito) ──
        // Modifichiamo il topOffset per evitare che l'ingrandimento copra il testo
        const topOffset = isHQ ? 35 : 25; 
        
        const badge = document.createElement('div');
        badge.className = 'eco-html-overlay';
        badge.style.cssText = `
            position:absolute; top:${topOffset}px; left:50%; 
            transform:translateX(-50%) scale(${scaleFactor});
            transform-origin: center top;
            display:flex; gap:4px; align-items:center; justify-content:center;
            z-index:10; pointer-events:none; white-space:nowrap; font-family:Courier New;
        `;

        const incSpan = document.createElement('span');
        incSpan.style.cssText = `
            color:#FFD700; font-size:13px; font-weight:bold;
            text-shadow:0 0 10px rgba(255,215,0,0.9), 0 1px 3px rgba(0,0,0,0.8);
        `;
        incSpan.textContent = `+${s.income}💰`;
        badge.appendChild(incSpan);

        if (spec) {
            const specSpan = document.createElement('span');
            specSpan.style.cssText = `
                color:#fff; font-size:12px;
                text-shadow:0 0 8px rgba(255,255,255,0.8), 0 1px 3px rgba(0,0,0,0.8);
            `;
            specSpan.textContent = spec.label;
            badge.appendChild(specSpan);
        }
        wrap.appendChild(badge);

        // ── 2. SELETTORE ALLOCAZIONE [Banca] (In basso, ingrandito) ──
        const alloc = campaignState.sectorCredits[s.id]?.[s.owner] || 0;
        if (s.owner > 0) {
            const botOffset = isHQ ? 35 : 25; 
            const allocDiv = document.createElement('div');
            allocDiv.className = 'eco-html-overlay';
            allocDiv.style.cssText = `
                position:absolute; bottom:${botOffset}px; left:50%; 
                transform:translateX(-50%) scale(${scaleFactor});
                transform-origin: center bottom;
                display:flex; align-items:center; justify-content:center; gap:4px;
                z-index:10; font-family:Courier New;
            `;

            const isCurrPlayer = s.owner === campaignState.currentPlayer && campaignState.phase === 'PLANNING';
            const c = COLORS['p' + s.owner];

            if (isCurrPlayer) {
                const btnStyle = `
                    background:rgba(0,0,0,0.9); border:1px solid ${c}; color:${c};
                    width:24px; height:24px; border-radius:4px; cursor:pointer;
                    font-weight:bold; font-size:16px; line-height:1; padding:0;
                    pointer-events:auto; box-shadow:0 0 5px rgba(0,0,0,0.8);
                `;
                
                const bMinus = document.createElement('button');
                bMinus.textContent = '−'; bMinus.style.cssText = btnStyle;
                bMinus.onclick = (e) => {
                    e.stopPropagation();
                    if (typeof window._cn_allocRemove === 'function') {
                        window._cn_allocRemove(s.id);
                    } else {
                        if (!campaignState.sectorCredits[s.id][s.owner]) campaignState.sectorCredits[s.id][s.owner] = 0;
                        const cur = campaignState.sectorCredits[s.id][s.owner];
                        if (cur > 0) {
                            campaignState.sectorCredits[s.id][s.owner]--;
                            campaignState.credits[s.owner]++;
                            renderCampaignMap();
                        }
                    }
                };

                const val = document.createElement('span');
                val.style.cssText = `
                    background:rgba(0,0,0,0.9); border:1px solid ${c}88; color:${c};
                    padding:2px 6px; border-radius:4px; font-size:12px; font-weight:bold;
                    min-width:32px; text-align:center; box-shadow:0 0 5px rgba(0,0,0,0.8);
                `;
                val.textContent = `💼${alloc}`;

                const bPlus = document.createElement('button');
                bPlus.textContent = '+'; bPlus.style.cssText = btnStyle;
                bPlus.onclick = (e) => {
                    e.stopPropagation();
                    if (typeof window._cn_allocAdd === 'function') {
                        window._cn_allocAdd(s.id);
                    } else {
                        if (!campaignState.sectorCredits[s.id][s.owner]) campaignState.sectorCredits[s.id][s.owner] = 0;
                        if (campaignState.credits[s.owner] > 0) {
                            campaignState.sectorCredits[s.id][s.owner]++;
                            campaignState.credits[s.owner]--;
                            renderCampaignMap();
                        } else {
                            showTemporaryMessage('Banca vuota!');
                        }
                    }
                };

                allocDiv.appendChild(bMinus);
                allocDiv.appendChild(val);
                allocDiv.appendChild(bPlus);
            } else if (alloc > 0) {
                const val = document.createElement('span');
                val.style.cssText = `
                    background:rgba(0,0,0,0.85); border:1px solid ${c}88; color:${c};
                    padding:2px 8px; border-radius:4px; font-size:12px;
                    box-shadow:0 0 5px rgba(0,0,0,0.8);
                `;
                val.textContent = `💼${alloc}`;
                allocDiv.appendChild(val);
            }

            if (isCurrPlayer || alloc > 0) {
                wrap.appendChild(allocDiv);
            }
        }

        // ── 3. SEGNALINI ORDINI (Pallini - Centrali) ──
        // (Questi non li ingrandisco con lo scale, ma lascio i pixel base un po' più grandi)
        const allTargeters = campaignState._allOrderedSectors?.[s.id] || [];
        if (allTargeters.length > 0) {
            const cx = svgSize / 2;
            const cy = svgSize / 2;
            const dotW = 40, dotH = 14, dotGap = 6;
            const totalW = allTargeters.length * dotW + (allTargeters.length - 1) * dotGap;
            
            // Posizionati leggermente sopra il nome testuale al centro
            const dy = cy - 10; 

            allTargeters.forEach((pid, i) => {
                const c = COLORS['p' + pid];
                const dx = cx - totalW / 2 + i * (dotW + dotGap);
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                rect.setAttribute('x', dx); rect.setAttribute('y', dy);
                rect.setAttribute('width', dotW); rect.setAttribute('height', dotH);
                rect.setAttribute('rx', 4); rect.setAttribute('fill', c);
                rect.classList.add('eco-dot');
                rect.style.filter = `drop-shadow(0 0 6px ${c})`;
                svg.appendChild(rect);
            });
            wrap.style.animation = 'campPulse 0.9s infinite alternate';
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

function showCampaignInfoModal() {
    if (typeof playSFX === 'function') playSFX('click');

    const modal = document.createElement('div');
    modal.id = 'campaign-info-modal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.9); z-index: 1000000;
        display: flex; align-items: center; justify-content: center;
        font-family: 'Courier New', monospace;
    `;

    // Costruiamo il contenuto ciclando sulle specializzazioni
    const bonusHtml = SECTOR_SPECIALIZATIONS.map(s => `
        <div style="margin-bottom: 25px; border-left: 4px solid #00ff88; padding-left: 15px;">
            <div style="font-size: 24px; color: #fff; font-weight: bold; margin-bottom: 5px;">${s.label}</div>
            <div style="font-size: 18px; color: #aaa; line-height: 1.4;">${s.desc}</div>
        </div>
    `).join('');

    modal.innerHTML = `
        <div style="background: #050a14; border: 2px solid #00ff88; padding: 40px; 
                    max-width: 600px; width: 90%; border-radius: 15px; box-shadow: 0 0 50px rgba(0,255,136,0.2);">
            
            <h1 style="color: #00ff88; text-align: center; margin-top: 0; letter-spacing: 2px;">MANUALE TATTICO</h1>
            
            <div style="margin: 30px 0;">
                ${bonusHtml}
                <div style="margin-bottom: 25px; border-left: 4px solid #FFD700; padding-left: 15px;">
                    <div style="font-size: 24px; color: #fff; font-weight: bold; margin-bottom: 5px;">💰 Rendita</div>
                    <div style="font-size: 18px; color: #aaa; line-height: 1.4;">Ogni settore fornisce crediti ad ogni turno. Gli HQ (+5💰) sono i più ricchi.</div>
                </div>
            </div>

            <button class="action-btn" 
                style="width: 100%; padding: 15px; border-color: #555; color: #888;"
                onclick="document.getElementById('campaign-info-modal').remove()">
                CHIUDI
            </button>
        </div>
    `;

    document.body.appendChild(modal);
}

