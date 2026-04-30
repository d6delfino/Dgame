/* ============================================================
   credits.js — Sistema Crediti e Negozio In-Game
   ============================================================
   ARCHITETTURA:
   - I crediti vengono guadagnati all'inizio di ogni turno
     (1 per base viva + 1 per ogni CP posseduto).
   - Il pulsante "💰 Negozio" appare nel controls-panel durante
     il proprio turno se si hanno crediti.
   - Il negozio offre due sezioni:
       1. RECLUTA AGENTE: crea un nuovo agente con stat personalizzate.
          Costo: GAME.CREDIT_AGENT_BASE + punti stat extra.
          Richiede base viva e meno di 4 agenti attivi.
       2. RIMPIAZZA CARTA: sostituisce una carta già usata in questo
          turno. Costo: GAME.CREDIT_CARD_REPLACE per carta.

   ESPONE: initCreditShopUI, updateCreditShopBtn,
           showCreditIncome, showCPCapture,
           sendCPCaptureMessage, showNotificationBanner
   DIPENDE DA: constants.js (GAME), state.js, graphics.js,
               gamelogic.js (updateUI, drawGame),
               cards.js (CARD_DEFINITIONS, updateIngameCardsUI),
               multiplayer.js (isOnline, sendOnlineMessage)
   ============================================================ */

// ============================================================
// VFX / NOTIFICHE — utility centralizzata
// ============================================================

/**
 * Mostra un banner temporaneo animato sullo schermo.
 *
 * @param {string} html      - Contenuto del banner (testo o HTML).
 * @param {string} color     - Colore bordo, testo e glow.
 * @param {object} [opts]    - Opzioni di personalizzazione:
 *   @param {number}  [opts.duration=2200]  - Durata totale in ms.
 *   @param {string}  [opts.bottom='90px']  - Distanza dal basso (ignorata se top è fornito).
 *   @param {string}  [opts.top=null]       - Se fornito, posiziona il banner in alto al centro.
 *   @param {string}  [opts.fontSize='14px']
 *   @param {boolean} [opts.bold=true]
 *   @param {string}  [opts.right='20px']   - Distanza da destra (ignorata se top è fornito).
 *   @param {number}  [opts.borderWidth=2]  - Spessore bordo in px.
 *   @param {string}  [opts.padding='8px 16px']
 *   @param {number}  [opts.zIndex=9998]
 */
function showNotificationBanner(html, color, opts = {}) {
    const {
        duration    = 2200,
        bottom      = '90px',
        top         = null,
        right       = '20px',
        fontSize    = '14px',
        bold        = true,
        borderWidth = 2,
        padding     = '8px 16px',
        zIndex      = 9998,
    } = opts;

    _ensureCreditFadeStyle();

    // Se top è fornito il banner è centrato orizzontalmente (stile CP/Shop).
    // Altrimenti si posiziona in basso a destra (stile reddito/uccisione).
    const posCSS = top !== null
        ? `top:${top}; left:50%; transform:translateX(-50%);`
        : `bottom:${bottom}; right:${right};`;

    const msg = document.createElement('div');
    msg.style.cssText = `
        position:fixed; ${posCSS} z-index:${zIndex};
        background:rgba(5,5,15,0.92);
        border:${borderWidth}px solid ${color};
        border-radius:6px; padding:${padding};
        font-family:'Courier New',monospace; font-size:${fontSize};
        color:${color}; ${bold ? 'font-weight:bold;' : ''}
        box-shadow:0 0 12px ${color}66;
        animation:creditFade ${duration}ms ease-out forwards;
        pointer-events:none; text-align:center;
    `;
    msg.innerHTML = html;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), duration);
}

/**
 * Inietta il keyframe CSS dell'animazione creditFade una sola volta.
 * Necessario perché le animazioni CSS devono stare in un <style> globale.
 */
function _ensureCreditFadeStyle() {
    if (document.getElementById('credit-fade-style')) return;
    const style = document.createElement('style');
    style.id    = 'credit-fade-style';
    // Nota: la trasformazione usa translateX(-50%) per i banner centrati (top).
    // I banner posizionati a destra (bottom) non usano transform CSS, quindi
    // l'animazione risulta correttamente in un semplice fade verticale.
    style.innerHTML = `
        @keyframes creditFade {
            0%   { opacity:0; transform:translateY(6px)  translateX(-50%); }
            15%  { opacity:1; transform:translateY(0)    translateX(-50%); }
            75%  { opacity:1; }
            100% { opacity:0; transform:translateY(-8px) translateX(-50%); }
        }
    `;
    document.head.appendChild(style);
}

// ============================================================
// INIZIALIZZAZIONE UI
// ============================================================

/**
 * Inietta il pulsante negozio e il pannello nel controls-panel.
 * Chiamata una volta da main.js dopo startActiveGameUI.
 */
function initCreditShopUI() {
    // Evita doppioni se chiamata più volte
    if (document.getElementById('credit-shop-btn')) return;

    const controlsPanel = document.getElementById('controls-panel');
    if (!controlsPanel) return;

    // --- Riga crediti + pulsante negozio ---
    const creditRow = document.createElement('div');
    creditRow.id = 'credit-row';
    creditRow.style.cssText = `
        display:flex; justify-content:space-between; align-items:center;
        border-top:1px solid #333; margin-top:8px; padding-top:8px; gap:8px;
    `;
    creditRow.innerHTML = `
        <span id="credits-display" style="font-size:16px; font-weight:bold; color:#888;">💰 0</span>
        <button id="credit-shop-btn" class="action-btn"
                style="flex:1; font-size:13px; padding:7px 6px; border-color:#888; color:#888; opacity:0.4; cursor:not-allowed;"
                onclick="toggleCreditShop()" disabled>
            🛒 Negozio
        </button>
    `;

    // Inserisce prima del pulsante Passa Turno
    const endTurnBtn = document.getElementById('btn-end-turn');
    controlsPanel.insertBefore(creditRow, endTurnBtn);

    // --- Pannello negozio a tendina ---
    const shopPanel = document.createElement('div');
    shopPanel.id = 'credit-shop-panel';
    shopPanel.style.cssText = `
        display:none;
        background:rgba(5,5,15,0.97);
        border:2px solid #888;
        border-radius:6px;
        padding:12px;
        margin-bottom:8px;
        max-height:65vh;
        overflow-y:auto;
    `;
    controlsPanel.insertBefore(shopPanel, endTurnBtn);
}

// ============================================================
// AGGIORNA PULSANTE NEGOZIO
// ============================================================

function updateCreditShopBtn() {
    const btn = document.getElementById('credit-shop-btn');
    if (!btn) return;

    const pData     = players[currentPlayer];
    const credits   = pData?.credits || 0;
    const canAct    = canLocalPlayerAct();
    const hasBase   = pData?.hq?.hp > 0;
    const canAfford = credits >= Math.min(GAME.CREDIT_AGENT_BASE, GAME.CREDIT_CARD_REPLACE);
    const enabled   = canAct && (credits > 0);

    btn.disabled = !enabled;
    btn.style.opacity     = enabled ? '1' : '0.4';
    btn.style.cursor      = enabled ? 'pointer' : 'not-allowed';
    btn.style.borderColor = enabled ? players[currentPlayer].color : '#888';
    btn.style.color       = enabled ? players[currentPlayer].color : '#888';
}

function toggleCreditShop() {
    const panel = document.getElementById('credit-shop-panel');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    if (isOpen) {
        panel.style.display = 'none';
        _shopOwnerFaction = null;   // reset fazione proprietaria alla chiusura
    } else {
        _shopOwnerFaction = currentPlayer;  // snapshot: chi ha aperto il negozio
        panel.style.display = 'block';
        renderCreditShop();
    }
    playSFX('click');
}

function closeCreditShop() {
    const panel = document.getElementById('credit-shop-panel');
    if (panel) panel.style.display = 'none';
    _shopOwnerFaction = null;   // reset fazione proprietaria alla chiusura
}

// ============================================================
// RENDERING PANNELLO NEGOZIO
// ============================================================

// Stato temporaneo del reclutamento in corso nel negozio
let _shopAgentStats = null;
// Fazione che ha aperto il negozio (snapshot al momento dell'apertura).
// Usato per invalidare acquisti se il turno è cambiato prima della conferma.
let _shopOwnerFaction = null;

function renderCreditShop() {
    const panel = document.getElementById('credit-shop-panel');
    if (!panel) return;

    const pData   = players[currentPlayer];
    const credits = pData?.credits || 0;
    const color   = pData?.color || '#00ff88';

    panel.style.borderColor = color;
    panel.innerHTML = '';

    // --- Header ---
    const header = document.createElement('div');
    header.style.cssText = `display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;`;
    header.innerHTML = `
        <span style="color:${color}; font-weight:bold; font-size:14px; text-transform:uppercase; letter-spacing:1px;">
            🛒 Negozio
        </span>
        <span style="color:${color}; font-size:16px; font-weight:bold;">💰 ${credits} crediti</span>
    `;
    panel.appendChild(header);

    // ── SEZIONE 1: RECLUTA AGENTE ──────────────────────────────
    _renderRecruitSection(panel, pData, credits, color);

    // ── SEZIONE 2: RIMPIAZZA CARTA ─────────────────────────────
    _renderCardReplaceSection(panel, pData, credits, color);
}

// ── SEZIONE RECLUTAMENTO ──────────────────────────────────────

function _renderRecruitSection(panel, pData, credits, color) {
    const section = document.createElement('div');
    section.style.cssText = `border:1px solid #333; border-radius:4px; padding:10px; margin-bottom:10px;`;

    const hasBase    = pData?.hq?.hp > 0;
    const agentCount = pData?.agents?.length || 0;
    const maxReached = agentCount >= 4;
    const baseCost   = GAME.CREDIT_AGENT_BASE;

    // Inizializza le stat temporanee se non esistono
    if (!_shopAgentStats) {
        _shopAgentStats = { hp: 1, mov: 1, rng: 1, dmg: 1 };
    }

    const extraCost  = (_shopAgentStats.hp - 1) + (_shopAgentStats.mov - 1) +
                       (_shopAgentStats.rng - 1) + (_shopAgentStats.dmg - 1);
    const totalCost  = baseCost + extraCost;
    const canRecruit = hasBase && !maxReached && credits >= totalCost;

    const title = document.createElement('div');
    title.style.cssText = `color:${color}; font-size:12px; font-weight:bold; text-transform:uppercase; margin-bottom:8px;`;
    title.innerText = `👤 Recluta Agente — Costo base: ${baseCost} cr`;
    section.appendChild(title);

    if (!hasBase) {
        const msg = document.createElement('div');
        msg.style.cssText = `color:#555; font-size:12px; font-style:italic;`;
        msg.innerText = 'Base distrutta — reclutamento non disponibile.';
        section.appendChild(msg);
        panel.appendChild(section);
        return;
    }
    if (maxReached) {
        const msg = document.createElement('div');
        msg.style.cssText = `color:#555; font-size:12px; font-style:italic;`;
        msg.innerText = 'Massimo 4 agenti per fazione.';
        section.appendChild(msg);
        panel.appendChild(section);
        return;
    }

    // Stat sliders
    const statTypes = [
        { id: 'hp',  label: 'Vita',  max: 5 },
        { id: 'mov', label: 'Passi', max: 3 },
        { id: 'rng', label: 'Tiro',  max: 9 },
        { id: 'dmg', label: 'Danno', max: 4 },
    ];

    const statsRow = document.createElement('div');
    statsRow.style.cssText = `display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;`;

    statTypes.forEach(stat => {
        const item = document.createElement('div');
        item.style.cssText = `display:flex; align-items:center; background:#0a0a10; border:1px solid #333; padding:4px 6px; border-radius:4px; gap:4px;`;
        item.innerHTML = `
            <span style="font-size:10px; color:#888; text-transform:uppercase; width:32px;">${stat.label}</span>
            <button class="stat-btn" onclick="_shopStatChange('${stat.id}',-1)" ${_shopAgentStats[stat.id] <= 1 ? 'disabled' : ''}>-</button>
            <span id="shop-stat-${stat.id}" style="font-size:16px; font-weight:bold; color:#fff; width:18px; text-align:center;">${_shopAgentStats[stat.id]}</span>
            <button class="stat-btn" onclick="_shopStatChange('${stat.id}',1)" ${_shopAgentStats[stat.id] >= stat.max ? 'disabled' : ''}>+</button>
        `;
        statsRow.appendChild(item);
    });
    section.appendChild(statsRow);

    // Costo totale + pulsante
    const footer = document.createElement('div');
    footer.style.cssText = `display:flex; justify-content:space-between; align-items:center;`;
    footer.innerHTML = `
        <span style="color:${canRecruit ? color : '#555'}; font-size:13px;">
            Costo totale: <strong>${totalCost} cr</strong>
            ${credits < totalCost ? `<span style="color:#ff3333; font-size:11px;"> (mancano ${totalCost - credits})</span>` : ''}
        </span>
    `;
    const recruitBtn = document.createElement('button');
    recruitBtn.className = 'action-btn';
    recruitBtn.style.cssText = `font-size:12px; padding:6px 12px; border-color:${canRecruit ? color : '#444'}; color:${canRecruit ? color : '#444'}; ${canRecruit ? '' : 'opacity:0.5; cursor:not-allowed;'}`;
    recruitBtn.disabled  = !canRecruit;
    recruitBtn.innerText = '✔ Recluta';
    recruitBtn.onclick   = () => _recruitAgentFromShop();
    footer.appendChild(recruitBtn);
    section.appendChild(footer);

    panel.appendChild(section);
}

function _shopStatChange(statId, delta) {
    if (!_shopAgentStats) return;
    const maxes = { hp: 5, mov: 3, rng: 9, dmg: 4 };
    const newVal = _shopAgentStats[statId] + delta;
    if (newVal < 1 || newVal > maxes[statId]) return;
    _shopAgentStats[statId] = newVal;
    renderCreditShop();   // re-render to update costs and button states
}

function _recruitAgentFromShop() {
    // Sicurezza: il negozio deve essere stato aperto da chi ha il turno corrente.
    // Questo blocca l'acquisto se il timer è scaduto e il turno è passato ad un
    // altro giocatore mentre il pannello era ancora aperto.
    if (_shopOwnerFaction === null || _shopOwnerFaction !== currentPlayer) {
        closeCreditShop();
        _showShopMsg('Turno scaduto — acquisto annullato.', '#ff3333');
        return;
    }

    const pData   = players[currentPlayer];
    const stats   = _shopAgentStats;
    const extra   = (stats.hp - 1) + (stats.mov - 1) + (stats.rng - 1) + (stats.dmg - 1);
    const cost    = GAME.CREDIT_AGENT_BASE + extra;

    if ((pData.credits || 0) < cost) return;
    if ((pData.agents?.length || 0) >= 4) return;
    if (!pData.hq?.hp) return;

    pData.credits -= cost;
    _shopAgentStats = null;   // reset per il prossimo reclutamento

    // Crea il nuovo agente
    const idx        = pData.agents.length;
    const sprOffset  = (currentPlayer - 1) * 4;
    const newAgent   = {
        id:            crypto.randomUUID(),
        type:          'agent',
        faction:       currentPlayer,
        sprite:        getRandomSprite(SPRITE_POOLS[currentPlayer]),
        customSpriteId:`AG${Math.min(idx + 1, 4) + sprOffset}`,
        hp:   stats.hp, maxHp: stats.hp,
        mov:  stats.mov,
        rng:  stats.rng,
        dmg:  stats.dmg,
        ap:   0,         // nessun AP nel turno in cui è reclutato
        q: 0, r: 0,
    };

    // Piazza adiacente all'HQ se possibile
    const hq        = pData.hq;
    let placed      = false;
    for (const dir of hexDirections) {
        for (let d = 1; d <= 2; d++) {
            const cell = grid.get(getKey(hq.q + dir.q * d, hq.r + dir.r * d));
            if (cell && cell.type === 'empty' && !cell.entity) {
                cell.entity  = newAgent;
                newAgent.q   = cell.q;
                newAgent.r   = cell.r;
                placed       = true;
                break;
            }
        }
        if (placed) break;
    }

    if (!placed) {
        // Nessuna cella libera vicino all'HQ — rimborso
        pData.credits += cost;
        _showShopMsg('Nessuna cella libera vicino alla base!', '#ff3333');
        return;
    }

    pData.agents.push(newAgent);

    // Sincronizzazione multiplayer
    if (isOnline) {
        sendOnlineMessage({
            type:        'SHOP_RECRUIT',
            agent:       newAgent,
            faction:     currentPlayer,
            creditCost:  cost,
        });
    }

    playSFX('build');
    _showShopMsg(`Agente reclutato! (-${cost} cr)`, players[currentPlayer].color);
    closeCreditShop();
    updateUI();
    drawGame();
}

// ── SEZIONE RIMPIAZZA CARTA ───────────────────────────────────
// Stato temporaneo: slot selezionato e nuova carta scelta
let _replaceSlotIndex = null;
let _replaceNewCardId = null;

function _renderCardReplaceSection(panel, pData, credits, color) {
    const section = document.createElement('div');
    section.style.cssText = `border:1px solid #333; border-radius:4px; padding:10px;`;

    const title = document.createElement('div');
    title.style.cssText = `color:${color}; font-size:12px; font-weight:bold; text-transform:uppercase; margin-bottom:8px;`;
    title.innerText = `🔄 Rimpiazza Carta — Costo: ${GAME.CREDIT_CARD_REPLACE} cr`;
    section.appendChild(title);

    const cards     = pData?.cards     || [];
    const usedCards = pData?.usedCards || {};
    const usedSlots = Object.keys(usedCards);
    const canAfford = credits >= GAME.CREDIT_CARD_REPLACE;

    if (usedSlots.length === 0) {
        const msg = document.createElement('div');
        msg.style.cssText = `color:#555; font-size:12px; font-style:italic;`;
        msg.innerText = 'Nessuna carta usata da rimpiazzare.';
        section.appendChild(msg);
        panel.appendChild(section);
        return;
    }

    // Step 1 — scegli quale slot rimpiazzare
    const step1 = document.createElement('div');
    step1.style.cssText = `color:#888; font-size:11px; margin-bottom:6px;`;
    step1.innerText = '1. Scegli lo slot da rimpiazzare:';
    section.appendChild(step1);

    const slotsRow = document.createElement('div');
    slotsRow.style.cssText = `display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;`;
    usedSlots.forEach(slotKey => {
        const slotIndex = parseInt(slotKey.replace('slot_', ''));
        const cardId    = cards[slotIndex];
        const card      = CARD_DEFINITIONS?.[cardId];
        if (!card) return;

        const isSelected = _replaceSlotIndex === slotIndex;
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.style.cssText = `
            display:flex; flex-direction:column; align-items:center; gap:2px;
            padding:6px 8px; border-radius:4px; font-size:10px; cursor:pointer;
            border:2px solid ${isSelected ? color : '#555'};
            background:${isSelected ? color + '22' : 'transparent'};
            color:${isSelected ? color : '#888'};
        `;
        btn.innerHTML = `<span style="font-size:16px;">${card.icon}</span><span>${card.name}</span><span style="color:#ff5555;font-size:9px;">usata</span>`;
        btn.onclick = () => { _replaceSlotIndex = slotIndex; _replaceNewCardId = null; renderCreditShop(); };
        slotsRow.appendChild(btn);
    });
    section.appendChild(slotsRow);

    // Step 2 — scegli la nuova carta (tutte le 10 disponibili)
    if (_replaceSlotIndex !== null) {
        const step2 = document.createElement('div');
        step2.style.cssText = `color:#888; font-size:11px; margin-bottom:6px;`;
        step2.innerText = '2. Scegli la nuova carta:';
        section.appendChild(step2);

        const cardGrid = document.createElement('div');
        cardGrid.style.cssText = `display:grid; grid-template-columns:repeat(5,1fr); gap:5px; margin-bottom:8px;`;

        Object.values(CARD_DEFINITIONS).forEach(card => {
            const isSelected = _replaceNewCardId === card.id;
            const btn = document.createElement('button');
            btn.className = 'action-btn';
            btn.title = card.description;
            btn.style.cssText = `
                display:flex; flex-direction:column; align-items:center; gap:2px;
                padding:6px 4px; border-radius:4px; font-size:9px; cursor:pointer;
                border:2px solid ${isSelected ? card.color : card.color + '44'};
                background:${isSelected ? card.color + '22' : 'rgba(0,0,0,0.4)'};
                color:${card.color};
            `;
            btn.innerHTML = `<span style="font-size:16px;">${card.icon}</span><span style="text-transform:uppercase;font-weight:bold;line-height:1.1;text-align:center;">${card.name}</span>`;
            btn.onclick = () => { _replaceNewCardId = card.id; renderCreditShop(); };
            cardGrid.appendChild(btn);
        });
        section.appendChild(cardGrid);

        // Pulsante conferma
        const canConfirm = canAfford && _replaceNewCardId !== null;
        const footer = document.createElement('div');
        footer.style.cssText = `display:flex; justify-content:space-between; align-items:center;`;
        footer.innerHTML = `
            <span style="color:${canAfford ? color : '#555'}; font-size:12px;">
                Costo: <strong>${GAME.CREDIT_CARD_REPLACE} cr</strong>
                ${!canAfford ? '<span style="color:#ff3333;font-size:10px;"> (insufficienti)</span>' : ''}
            </span>
        `;
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'action-btn';
        confirmBtn.style.cssText = `font-size:12px; padding:6px 12px; border-color:${canConfirm ? color : '#444'}; color:${canConfirm ? color : '#444'}; ${canConfirm ? '' : 'opacity:0.5;cursor:not-allowed;'}`;
        confirmBtn.disabled = !canConfirm;
        confirmBtn.innerText = '✔ Conferma';
        confirmBtn.onclick = () => _replaceCard(_replaceSlotIndex, _replaceNewCardId);
        footer.appendChild(confirmBtn);
        section.appendChild(footer);
    }

    panel.appendChild(section);
}

function _replaceCard(slotIndex, newCardId) {
    // Sicurezza: blocca se il turno è cambiato mentre il negozio era aperto
    if (_shopOwnerFaction === null || _shopOwnerFaction !== currentPlayer) {
        closeCreditShop();
        _showShopMsg('Turno scaduto — acquisto annullato.', '#ff3333');
        return;
    }

    const pData   = players[currentPlayer];
    const slotKey = `slot_${slotIndex}`;
    if ((pData.credits || 0) < GAME.CREDIT_CARD_REPLACE) return;
    if (!pData.usedCards?.[slotKey]) return;
    if (!CARD_DEFINITIONS?.[newCardId]) return;

    pData.credits -= GAME.CREDIT_CARD_REPLACE;
    // Sostituisce la carta nello slot con quella scelta
    pData.cards[slotIndex] = newCardId;
    delete pData.usedCards[slotKey];

    // Reset stato selezione
    _replaceSlotIndex = null;
    _replaceNewCardId = null;

    // Sincronizzazione multiplayer
    if (isOnline) {
        sendOnlineMessage({
            type:       'SHOP_CARD_REPLACE',
            faction:    currentPlayer,
            slotIndex,
            newCardId,
            creditCost: GAME.CREDIT_CARD_REPLACE,
        });
    }

    playSFX('heal');
    _showShopMsg(`Carta rimpiazzata! (-${GAME.CREDIT_CARD_REPLACE} cr)`, players[currentPlayer].color);
    renderCreditShop();
    updateIngameCardsUI();
    updateUI();
}

// ============================================================
// MESSAGGI RETE (ricevuti da multiplayer.js)
// ============================================================

/**
 * Applica un reclutamento dal negozio ricevuto via rete.
 */
function applyRemoteShopRecruit(data) {
    const pData = players[data.faction];
    if (!pData) return;

    pData.credits = Math.max(0, (pData.credits || 0) - data.creditCost);
    const agent   = data.agent;
    const cell    = grid.get(getKey(agent.q, agent.r));
    if (cell) {
        cell.entity = agent;
        pData.agents.push(agent);
    }
    updateUI();
    drawGame();
}

/**
 * Applica la sostituzione di una carta ricevuta via rete.
 */
function applyRemoteShopCardReplace(data) {
    const pData   = players[data.faction];
    if (!pData) return;

    pData.credits = Math.max(0, (pData.credits || 0) - data.creditCost);
    const slotKey = `slot_${data.slotIndex}`;
    // Sostituisce la carta nello slot con quella scelta
    if (data.newCardId && pData.cards) pData.cards[data.slotIndex] = data.newCardId;
    delete pData.usedCards?.[slotKey];

    updateIngameCardsUI();
    updateUI();
}

// ============================================================
// VFX / NOTIFICHE — funzioni pubbliche (usano showNotificationBanner)
// ============================================================

/**
 * Mostra un banner temporaneo di reddito crediti all'inizio del turno.
 */
function showCreditIncome(faction, amount) {
    showNotificationBanner(
        `💰 +${amount} crediti`,
        players[faction].color
        // usa i default: bottom:'90px', duration:2200
    );
}

/**
 * Mostra un banner di cattura punto di controllo e sincronizza via rete.
 */
function showCPCapture(agent) {
    showNotificationBanner(
        '🏳 Punto di Controllo conquistato!',
        players[agent.faction].color,
        { top: '80px', duration: 2000 }
    );
    // Sincronizza cattura via rete
    if (isOnline) sendCPCaptureMessage(agent.q, agent.r, agent.faction);
}

/**
 * Invia un messaggio di cattura CP agli altri giocatori.
 */
function sendCPCaptureMessage(q, r, faction) {
    if (!isOnline) return;
    sendOnlineMessage({ type: 'CP_CAPTURE', q, r, faction });
}

/**
 * Banner di feedback per operazioni del negozio (centrato a schermo).
 */
function _showShopMsg(text, color) {
    showNotificationBanner(text, color, {
        top:         '50%',
        duration:    1800,
        zIndex:      10001,
        padding:     '12px 24px',
        borderWidth: 2,
        fontSize:    '15px',
    });
}

// ============================================================
// REWARD UCCISIONE AGENTE (+2 crediti immediati)
// ============================================================

/**
 * Assegna +2 crediti alla fazione che ha ucciso un agente.
 *
 * Chiamata da gamelogic.js → handleEntityDeath.
 * Multiplayer: non serve nessun messaggio extra — executeRemoteAction
 * viene eseguito sia dall'host che dai client, quindi i crediti vengono
 * aggiornati ovunque automaticamente.
 */
function awardKillReward(killerFaction) {
    if (!killerFaction || !players[killerFaction]) return;

    const reward = 2;
    players[killerFaction].credits = (players[killerFaction].credits || 0) + reward;

    showNotificationBanner(
        `💀 +${reward} crediti (uccisione)`,
        players[killerFaction].color
        // usa i default: bottom:'90px', duration:2200
    );

    updateUI();
}

// ============================================================
// REWARD UCCISIONE BASE (+8 crediti immediati)
// ============================================================

/**
 * Assegna +8 crediti alla fazione che ha distrutto una base nemica.
 *
 * Chiamata da gamelogic.js → handleEntityDeath.
 */
function awardBaseDestroyReward(killerFaction) {
    if (!killerFaction || !players[killerFaction]) return;

    const reward = 8;
    players[killerFaction].credits = (players[killerFaction].credits || 0) + reward;

    showNotificationBanner(
        `🏰 +${reward} CREDITI<br><span style="font-size:12px;opacity:0.8;">BASE NEMICA DISTRUTTA!</span>`,
        players[killerFaction].color,
        {
            duration:    2500,
            bottom:      '120px',
            fontSize:    '18px',
            borderWidth: 3,
            padding:     '12px 24px',
        }
    );

    updateUI();
}


markScriptAsLoaded('credits.js');
