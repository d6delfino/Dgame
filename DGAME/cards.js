/* ============================================================
   cards.js — Sistema Carte Strategiche (completo)
   ============================================================
   ARCHITETTURA:
   - CARD_DEFINITIONS: ogni carta ha metadati + apply() con effetto reale
   - Per aggiungere una carta: copia il TEMPLATE in fondo e modifica
   - carduse.js gestisce solo gli override di movimento/azione/rendering
     che richiedono di agganciare funzioni di gamelogic.js

   ESPONE: CARD_DEFINITIONS, cardSelectionData,
           initCardSelectionUI, getFinalCardSelection,
           applyReceivedCards, updateIngameCardsUI,
           showCardMessage, _activateIngameCard,
           receiveRemoteCardAction, playSpecialVFX
   DIPENDE DA: constants.js, state.js, graphics.js,
               gamelogic.js (updateUI, cancelAction, setActionMode),
               multiplayer.js (isOnline, sendOnlineMessage, myPlayerNumber)
   ============================================================ */

// ============================================================
// DEFINIZIONE CARTE
// ============================================================
// Struttura di ogni carta:
//   id          — stringa univoca (es. 'C01')
//   name        — nome leggibile
//   icon        — emoji visualizzata nella UI
//   color       — colore neon esadecimale
//   description — testo regola mostrato nel tooltip
//   needsAgent  — true se apply() richiede un agente selezionato
//   apply(faction) — effetto reale eseguito all'attivazione

const CARD_DEFINITIONS = {

    C01: {
        id: 'C01', name: 'Blitz', icon: '⚡', color: '#FFD700',
        needsAgent: true,
        description: 'Una volta a partita, un tuo agente ottiene +2 AP in questo turno.',
        apply(faction) {
            selectedAgent.ap += 2;
            playSpecialVFX(selectedAgent, this.color, '⚡ +2 AP!');
            updateUI();
            showCardMessage(faction, this.id);
        },
    },

    C02: {
        id: 'C02', name: 'Fortino', icon: '🏰', color: '#00aaff',
        needsAgent: true,
        description: 'Una volta a partita, costruisci 3 barricate ovunque sulla mappa (costo 0 AP).',
        apply(faction) {
            selectedAgent.fortinoBuilds = 3;
            selectedAgent.fortinoActive = true;
            setActionMode('card_build');
            playSpecialVFX(selectedAgent, this.color, '🏰 FORTINO x3!');
            showCardMessage(faction, this.id);
        },
    },

    C03: {
        id: 'C03', name: 'Cecchino', icon: '🎯', color: '#ff3333',
        needsAgent: true,
        description: 'Una volta a partita, un tuo agente attacca a portata doppia per 1 turno.',
        apply(faction) {
            selectedAgent.sniperBuff  = true;
            selectedAgent.originalRng = selectedAgent.rng;
            selectedAgent.rng        *= 2;
            playSpecialVFX(selectedAgent, this.color, '🎯 GITTATA x2!');
            updateUI();
            showCardMessage(faction, this.id);
        },
    },

    C04: {
        id: 'C04', name: 'Medico di Campo', icon: '💉', color: '#00ff88',
        needsAgent: true,
        description: 'Una volta a partita, ripristina 3 HP a un agente adiacente (costo 0 AP).',
        apply(faction) {
            // Cura l'alleato più danneggiato adiacente, altrimenti se stesso
            const target = _getMostDamagedAdjacentAlly(selectedAgent) || selectedAgent;
            target.hp    = Math.min(target.hp + 3, target.maxHp);
            playSpecialVFX(target, this.color, '💉 +3 HP!');
            playSFX('heal');
            updateUI(); drawGame();
            showCardMessage(faction, this.id);
        },
    },

    C05: {
        id: 'C05', name: 'Demolizione', icon: '💣', color: '#ff8800',
        needsAgent: true,
        description: 'Una volta a partita, un attacco infligge danno doppio.',
        apply(faction) {
            selectedAgent.demoBuff = true;
            playSpecialVFX(selectedAgent, this.color, '💣 DEMOLIZIONE!');
            showCardMessage(faction, this.id);
        },
    },

    C06: {
        id: 'C06', name: 'Infiltrazione', icon: '👤', color: '#cc00ff',
        needsAgent: true,
        description: 'Una volta a partita, muovi un agente attraverso ostacoli ignorandoli.',
        apply(faction) {
            selectedAgent.infiltrateBuff = true;
            playSpecialVFX(selectedAgent, this.color, '🥷 INFILTRAZIONE ATTIVA!');
            updateUI();
            showCardMessage(faction, this.id);
        },
    },

    C07: {
        id: 'C07', name: 'Scudo Elettronico', icon: '🛡️', color: '#00ffff',
        needsAgent: true,
        description: 'Una volta a partita, annulla il prossimo attacco subito da un tuo agente.',
        apply(faction) {
            selectedAgent.shielded = true;
            playSpecialVFX(selectedAgent, this.color, '🛡️ SCUDO ATTIVO!');
            drawGame();
            showCardMessage(faction, this.id);
        },
    },

    C08: {
        id: 'C08', name: 'Airdrop', icon: '🪂', color: '#a0ff00',
        needsAgent: true,
        description: 'Una volta a partita, trasporta un tuo agente in qualsiasi cella libera.',
        apply(faction) {
            setActionMode('card_airdrop');
            showCardMessage(faction, this.id);
        },
    },

    C09: {
        id: 'C09', name: 'EMP', icon: '📡', color: '#ff00cc',
        needsAgent: true,
        description: 'Una volta a partita, rallenta i nemici entro 3 caselle: perdono 1 AP al prossimo turno.',
        apply(faction) {
            let found = false;
            grid.forEach(cell => {
                if (
                    cell.entity?.type === 'agent' &&
                    cell.entity.faction !== currentPlayer &&
                    hexDistance(selectedAgent, cell.entity) <= 3
                ) {
                    cell.entity.empDebuff = (cell.entity.empDebuff || 0) + 1;
                    playSpecialVFX(cell.entity, this.color, '📡 EMP SHOCK!');
                    found = true;
                }
            });
            if (!found) playSpecialVFX(selectedAgent, this.color, 'Nessun bersaglio EMP');
            showCardMessage(faction, this.id);
        },
    },

    C10: {
        id: 'C10', name: 'Contrabbandiere', icon: '🎲', color: '#ffaa00',
        needsAgent: true,
        description: 'Una volta a partita, ruba 1 punto statistiche da un agente nemico adiacente.',
        apply(faction) {
            const enemies = _getAdjacentEnemies(selectedAgent);
            if (!enemies.length) {
                playSpecialVFX(selectedAgent, '#888', 'Nessun nemico adiacente');
                showCardMessage(faction, this.id);
                return;
            }
            enemies.sort((a, b) => a.hp - b.hp);
            const enemy = enemies[0];
            const stats = ['maxHp', 'mov', 'dmg', 'rng'];
            const stat  = stats[Math.floor(Math.random() * stats.length)];

            if (stat === 'maxHp') {
                selectedAgent.maxHp++; selectedAgent.hp++;
                playSpecialVFX(selectedAgent, this.color, '💚 +1 VITA MAX!');
                if (enemy.maxHp > 1) {
                    enemy.maxHp--; enemy.hp = Math.min(enemy.hp, enemy.maxHp);
                    playSpecialVFX(enemy, '#ff3333', '💔 -1 VITA MAX');
                } else { playSpecialVFX(enemy, '#888', 'Vita al minimo'); }
            } else {
                selectedAgent[stat]++;
                playSpecialVFX(selectedAgent, this.color, `🔼 +1 ${stat.toUpperCase()}!`);
                if (enemy[stat] > 1) {
                    enemy[stat]--;
                    playSpecialVFX(enemy, '#ff3333', `🔽 -1 ${stat.toUpperCase()}`);
                } else { playSpecialVFX(enemy, '#888', 'Statistica al minimo'); }
            }
            updateUI(); drawGame();
            showCardMessage(faction, this.id);
        },
    },

    /* ----------------------------------------------------------
       TEMPLATE PER NUOVA CARTA — copia e incolla questo blocco,
       poi cambia id, name, icon, color, description e apply().
       ----------------------------------------------------------
    CXX: {
        id: 'CXX', name: 'NomeCarta', icon: '🔥', color: '#ffffff',
        needsAgent: true,   // false se non richiede agente selezionato
        description: 'Descrizione regola mostrata nel tooltip.',
        apply(faction) {
            // Variabili disponibili: selectedAgent, currentPlayer, grid,
            //   players, hexDistance, hexDirections, getKey,
            //   playSFX, playSpecialVFX, updateUI, drawGame,
            //   showCardMessage, setActionMode
            showCardMessage(faction, this.id);
        },
    },
    ---------------------------------------------------------- */
};

// ============================================================
// STATO LOCALE SELEZIONE CARTE (reset a ogni setup giocatore)
// ============================================================

let cardSelectionData = { selected: [] };  // array di max 3 cardId (duplicati permessi)

// ============================================================
// UI — PANNELLO SELEZIONE CARTE (fase setup)
// ============================================================

/**
 * Inietta il pannello selezione carte nel setup-box.
 * Chiamata da updateSetupUI() in setup.js.
 */
function initCardSelectionUI() {
    document.getElementById('card-selection-panel')?.remove();
    document.getElementById('card-toggle-btn')?.remove();
    cardSelectionData.selected = [];

    const toggleBtn = document.createElement('button');
    toggleBtn.id        = 'card-toggle-btn';
    toggleBtn.className = 'action-btn';
    toggleBtn.style.cssText = 'width:100%; margin-bottom:6px; font-size:13px; padding:10px 20px;';
    toggleBtn.innerHTML = `🃏 Carte Strategiche &nbsp;<span id="card-selection-count" style="color:#888;font-size:12px;">Seleziona 3 carte (0/3)</span> &nbsp;▼`;

    const panel = document.createElement('div');
    panel.id = 'card-selection-panel';
    panel.style.cssText = `display:none; margin-bottom:15px; border:1px solid #444; border-radius:6px; background:rgba(0,0,0,0.4); padding:12px;`;
    panel.innerHTML = `
        <div id="card-grid" style="display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:10px;"></div>
        <div id="card-selected-slots" style="display:flex; gap:8px; justify-content:center; margin-top:8px; min-height:44px; align-items:center;">
            <span style="color:#555; font-size:13px; font-style:italic;">Nessuna carta selezionata</span>
        </div>
    `;

    toggleBtn.addEventListener('click', () => {
        const open = panel.style.display !== 'none';
        panel.style.display = open ? 'none' : 'block';
        const countEl = document.getElementById('card-selection-count');
        toggleBtn.innerHTML = `🃏 Carte Strategiche &nbsp;${countEl?.outerHTML ?? ''} &nbsp;${open ? '▼' : '▲'}`;
        if (!open) { _renderCardGrid(); _renderSelectedSlots(); }
        playSFX('click');
    });

    const confirmBtn = document.getElementById('confirm-setup-btn');
    confirmBtn.parentNode.insertBefore(panel,     confirmBtn);
    confirmBtn.parentNode.insertBefore(toggleBtn, panel);
}

function _renderCardGrid() {
    const container = document.getElementById('card-grid');
    if (!container) return;
    container.innerHTML = '';
    Object.values(CARD_DEFINITIONS).forEach(card => {
        const isSelected = cardSelectionData.selected.includes(card.id);
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.title     = card.description;
        btn.style.cssText = `
            display:flex; flex-direction:column; align-items:center; justify-content:center;
            gap:3px; padding:8px 4px; cursor:pointer; border-radius:4px; transition:all 0.15s;
            border:2px solid ${isSelected ? card.color : card.color + '44'};
            background:${isSelected ? card.color + '22' : 'rgba(0,0,0,0.5)'};
            ${isSelected ? `box-shadow:0 0 8px ${card.color}88;` : ''}
        `;
        btn.innerHTML = `
            <span style="font-size:20px;">${card.icon}</span>
            <span style="font-size:10px;color:${card.color};text-transform:uppercase;font-weight:bold;line-height:1.1;text-align:center;">${card.name}</span>
        `;
        btn.addEventListener('mouseenter', () => _showCardTooltip(card, btn));
        btn.addEventListener('mouseleave', _hideCardTooltip);
        btn.addEventListener('click', () => { _hideCardTooltip(); _toggleCardSelection(card.id); playSFX('click'); });
        container.appendChild(btn);
    });
}

function _renderSelectedSlots() {
    const container = document.getElementById('card-selected-slots');
    if (!container) return;
    container.innerHTML = '';

    if (!cardSelectionData.selected.length) {
        container.innerHTML = `<span style="color:#555;font-size:13px;font-style:italic;">Nessuna carta selezionata</span>`;
        return;
    }
    cardSelectionData.selected.forEach((cardId, slotIndex) => {
        const card = CARD_DEFINITIONS[cardId];
        const slot = document.createElement('div');
        slot.style.cssText = `border:2px solid ${card.color}; border-radius:4px; padding:6px 10px; background:${card.color}22; display:flex; align-items:center; gap:6px; cursor:pointer; transition:all 0.15s;`;
        slot.title     = `Rimuovi: ${card.name}`;
        slot.innerHTML = `<span style="font-size:18px;">${card.icon}</span><span style="font-size:11px;color:${card.color};font-weight:bold;">${card.name}</span><span style="font-size:10px;color:#ff3333;margin-left:4px;">✕</span>`;
        slot.onclick   = () => { playSFX('click'); cardSelectionData.selected.splice(slotIndex, 1); _renderCardGrid(); _renderSelectedSlots(); _updateCardCount(); };
        container.appendChild(slot);
    });
    for (let i = cardSelectionData.selected.length; i < 3; i++) {
        const empty = document.createElement('div');
        empty.style.cssText = `border:2px dashed #333; border-radius:4px; padding:6px 18px; color:#333; font-size:20px; display:flex; align-items:center; justify-content:center;`;
        empty.innerHTML = '?';
        container.appendChild(empty);
    }
}

function _toggleCardSelection(cardId) {
    if (cardSelectionData.selected.length < 3) {
        cardSelectionData.selected.push(cardId);
    } else {
        const idx = cardSelectionData.selected.indexOf(cardId);
        if (idx !== -1) cardSelectionData.selected.splice(idx, 1);
        else { cardSelectionData.selected.shift(); cardSelectionData.selected.push(cardId); }
    }
    _renderCardGrid(); _renderSelectedSlots(); _updateCardCount();
}

function _updateCardCount() {
    const n     = cardSelectionData.selected.length;
    const color = n === 3 ? '#00ff88' : '#888';
    const el    = document.getElementById('card-selection-count');
    if (el) { el.innerText = `Seleziona 3 carte (${n}/3)`; el.style.color = color; }
    const panel = document.getElementById('card-selection-panel');
    const btn   = document.getElementById('card-toggle-btn');
    if (btn && panel) {
        const open = panel.style.display !== 'none';
        btn.innerHTML = `🃏 Carte Strategiche &nbsp;<span id="card-selection-count" style="color:${color};font-size:12px;">Seleziona 3 carte (${n}/3)</span> &nbsp;${open ? '▲' : '▼'}`;
    }
}

// ============================================================
// TOOLTIP
// ============================================================

let _tooltipEl = null;

function _showCardTooltip(card, anchor) {
    _hideCardTooltip();
    const tip = document.createElement('div');
    tip.id = 'card-tooltip';
    tip.style.cssText = `position:fixed; z-index:9999; background:#0a0a18; border:2px solid ${card.color}; border-radius:6px; padding:10px 14px; max-width:220px; pointer-events:auto; cursor:pointer; font-family:'Courier New',monospace; box-shadow:0 0 15px ${card.color}66;`;
    tip.innerHTML = `
        <div style="font-size:22px;margin-bottom:4px;text-align:center;">${card.icon}</div>
        <div style="color:${card.color};font-weight:bold;font-size:13px;text-transform:uppercase;margin-bottom:6px;text-align:center;">${card.name}</div>
        <div style="color:#bbb;font-size:12px;line-height:1.4;">${card.description}</div>
        <div style="color:#555;font-size:10px;margin-top:6px;text-align:right;font-style:italic;">Uso singolo per partita</div>
    `;
    document.body.appendChild(tip);
    _tooltipEl = tip;
    tip.addEventListener('click',    _hideCardTooltip);
    tip.addEventListener('touchend', (e) => { e.preventDefault(); _hideCardTooltip(); });

    const counter = document.getElementById('turn-counter-display');
    if (counter && counter.style.display !== 'none') {
        const r = counter.getBoundingClientRect();
        tip.style.top = (r.bottom + 8) + 'px'; tip.style.right = '10px'; tip.style.left = 'auto';
    } else {
        const r = anchor.getBoundingClientRect();
        let top = r.bottom + 6, left = r.left;
        if (left + 230 > window.innerWidth)  left = window.innerWidth  - 240;
        if (top  + 160 > window.innerHeight) top  = r.top - 165;
        tip.style.top = top + 'px'; tip.style.left = left + 'px';
    }
}

function _hideCardTooltip() {
    _tooltipEl?.remove(); _tooltipEl = null;
    document.getElementById('card-tooltip')?.remove();
}

// ============================================================
// ATTIVAZIONE IN-GAME
// ============================================================

/**
 * Attiva una carta durante il gioco.
 * Verifica prerequisiti, segna usata e chiama apply().
 */
function _activateIngameCard(slotIndex, cardId) {
    const card    = CARD_DEFINITIONS[cardId];
    const pData   = players[currentPlayer];
    const slotKey = `slot_${slotIndex}`;

    if (card?.needsAgent && (!selectedAgent || selectedAgent.faction !== currentPlayer || selectedAgent.type !== 'agent')) {
        playSpecialVFX({ q: 0, r: 0 }, '#ff3333', 'SELEZIONA UN AGENTE!');
        return;
    }
    if (!pData || pData.usedCards?.[slotKey]) return;

    if (!pData.usedCards) pData.usedCards = {};
    pData.usedCards[slotKey] = true;
    card?.apply(currentPlayer);

    if (isOnline) {
        sendOnlineMessage({
            type: 'ACTION_CARD', cardId, slotIndex,
            actingPlayer:  currentPlayer,
            targetAgentId: selectedAgent?.id ?? null,
        });
    }
    updateIngameCardsUI();
}

/** Riceve ed applica una carta da remoto */
function receiveRemoteCardAction(data) {
    const pData   = players[data.actingPlayer];
    const slotKey = `slot_${data.slotIndex}`;
    if (!pData) return;
    if (!pData.usedCards) pData.usedCards = {};
    pData.usedCards[slotKey] = true;

    if (data.targetAgentId) {
        const agent = pData.agents.find(a => a.id === data.targetAgentId);
        if (agent) selectedAgent = agent;
    }
    CARD_DEFINITIONS[data.cardId]?.apply(data.actingPlayer);
    updateIngameCardsUI();
    drawGame();
}

// ============================================================
// UI IN-GAME — PANNELLO CARTE NEL CONTROLS PANEL
// ============================================================

/** Aggiorna il pannello carte in-game. Chiamata da updateUI() in gamelogic.js */
function updateIngameCardsUI() {
    const slotsEl = document.getElementById('ingame-card-slots');
    const labelEl = document.getElementById('cards-used-label');
    if (!slotsEl) return;

    const pData = players[currentPlayer];
    if (!pData?.cards?.length) {
        slotsEl.innerHTML = `<span style="color:#444;font-size:12px;font-style:italic;">—</span>`;
        if (labelEl) labelEl.innerText = '';
        return;
    }

    const usedCards = pData.usedCards || {};
    const usedCount = Object.keys(usedCards).length;
    if (labelEl) labelEl.innerText = usedCount > 0 ? `${usedCount}/3 usate` : '';

    const isMyTurn = isOnline
        ? currentPlayer === myPlayerNumber
        : !(currentPlayer > 1 && isAIActive());

    slotsEl.innerHTML = '';
    pData.cards.forEach((cardId, slotIndex) => {
        const card    = CARD_DEFINITIONS[cardId];
        if (!card) return;
        const slotKey = `slot_${slotIndex}`;
        const isUsed  = !!usedCards[slotKey];
        const btn     = document.createElement('button');
        btn.className = 'action-btn';

        if (isUsed) {
            btn.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px;border:2px solid #333;background:rgba(0,0,0,0.3);opacity:0.35;cursor:not-allowed;border-radius:4px;`;
            btn.disabled = true; btn.title = `${card.name} — già usata`;
        } else if (!isMyTurn) {
            btn.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px;border:2px solid ${card.color}55;background:rgba(0,0,0,0.3);opacity:0.5;cursor:not-allowed;border-radius:4px;`;
            btn.disabled = true; btn.title = card.description;
        } else {
            btn.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 4px;border:2px solid ${card.color};background:${card.color}18;cursor:pointer;border-radius:4px;transition:all 0.15s;box-shadow:0 0 6px ${card.color}44;`;
            btn.title = card.description;
            btn.addEventListener('mouseenter', () => { btn.style.background = card.color + '33'; _showCardTooltip(card, btn); });
            btn.addEventListener('mouseleave', () => { btn.style.background = card.color + '18'; _hideCardTooltip(); });
            btn.addEventListener('touchstart', _hideCardTooltip, { passive: true });
            btn.onclick = () => { playSFX('click'); _activateIngameCard(slotIndex, cardId); };
        }

        btn.innerHTML = `
            <span style="font-size:18px;line-height:1;">${isUsed ? '✓' : card.icon}</span>
            <span style="font-size:9px;color:${isUsed ? '#444' : card.color};text-transform:uppercase;font-weight:bold;text-align:center;line-height:1.1;">${card.name}</span>
        `;
        slotsEl.appendChild(btn);
    });
}

// ============================================================
// NOTIFICA ATTIVAZIONE CARTA
// ============================================================

function showCardMessage(faction, cardId) {
    const card = CARD_DEFINITIONS[cardId];
    if (!card) return;
    document.getElementById('card-activation-msg')?.remove();

    const msg = document.createElement('div');
    msg.id = 'card-activation-msg';
    msg.style.cssText = `position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:10000; background:rgba(5,5,15,0.95); border:3px solid ${card.color}; border-radius:8px; padding:10px 22px; font-family:'Courier New',monospace; box-shadow:0 0 20px ${card.color}88; pointer-events:auto; cursor:pointer; animation:cardPopupAnim 1.4s ease-out forwards; display:flex; align-items:center; gap:10px; white-space:nowrap;`;
    msg.innerHTML = `
        <span style="font-size:24px;line-height:1;">${card.icon}</span>
        <span style="color:${card.color};font-size:14px;font-weight:bold;text-transform:uppercase;">${card.name} — Attivata!</span>
        <span style="color:#666;font-size:12px;margin-left:4px;">✕</span>
    `;
    const dismiss = () => { clearTimeout(timer); msg.remove(); };
    msg.addEventListener('click',    dismiss);
    msg.addEventListener('touchend', (e) => { e.preventDefault(); dismiss(); });
    document.body.appendChild(msg);
    const timer = setTimeout(dismiss, 1400);

    if (!document.getElementById('card-popup-anim')) {
        const style = document.createElement('style');
        style.id    = 'card-popup-anim';
        style.innerHTML = `@keyframes cardPopupAnim { 0%{opacity:0;transform:translateX(-50%) translateY(-8px) scale(0.9)} 15%{opacity:1;transform:translateX(-50%) translateY(0) scale(1.04)} 30%{transform:translateX(-50%) translateY(0) scale(1)} 75%{opacity:1} 100%{opacity:0;transform:translateX(-50%) translateY(-4px) scale(0.95)} }`;
        document.head.appendChild(style);
    }
}

// ============================================================
// MULTIPLAYER HELPERS
// ============================================================

/** Restituisce le 3 carte selezionate, completando con C01 se mancano */
function getFinalCardSelection() {
    const sel = [...cardSelectionData.selected];
    while (sel.length < 3) sel.push('C01');
    return sel;
}

/** Applica le carte ricevute dalla rete */
function applyReceivedCards(playerCards) {
    if (!playerCards) return;
    for (const [p, cards] of Object.entries(playerCards)) {
        const pNum = parseInt(p);
        if (players[pNum]) { players[pNum].cards = cards; players[pNum].usedCards = {}; }
    }
}

// ============================================================
// VFX HELPER
// ============================================================

/**
 * Testo animato fluttuante sopra una cella hex.
 * Usato dai apply() delle carte e da carduse.js.
 */
function playSpecialVFX(target, color, text) {
    if (!target) return;
    const p = hexToPixel(target.q, target.r);
    const el = document.createElement('div');
    el.innerText = text;
    el.style.cssText = `position:absolute; left:${p.x}px; top:${p.y - 20}px; transform:translate(-50%,-50%); color:${color}; font-weight:bold; font-size:22px; font-family:'Courier New',monospace; text-shadow:0 0 12px ${color},0 0 4px #000; pointer-events:none; z-index:10000; animation:floatUpFade 2.5s ease-out forwards;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);

    if (!document.getElementById('card-vfx-style')) {
        const style = document.createElement('style');
        style.id = 'card-vfx-style';
        style.innerHTML = `@keyframes floatUpFade { 0%{opacity:1;transform:translate(-50%,-50%) scale(0.8)} 20%{transform:translate(-50%,-50%) scale(1.1)} 100%{opacity:0;transform:translate(-50%,-150%) scale(1.3)} }`;
        document.head.appendChild(style);
    }
}

// ============================================================
// UTILITY PRIVATE
// ============================================================

function _getAdjacentEnemies(agent) {
    return hexDirections
        .map(dir => grid.get(getKey(agent.q + dir.q, agent.r + dir.r)))
        .filter(c => c?.entity && c.entity.faction !== agent.faction)
        .map(c => c.entity);
}

function _getMostDamagedAdjacentAlly(agent) {
    const allies = hexDirections
        .map(dir => grid.get(getKey(agent.q + dir.q, agent.r + dir.r)))
        .filter(c => c?.entity && c.entity.faction === agent.faction && c.entity.type === 'agent')
        .map(c => c.entity);
    return allies.length ? allies.sort((a, b) => a.hp - b.hp)[0] : null;
}
