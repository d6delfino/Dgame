/* ============================================================
   cards.js — Sistema Carte Strategiche (V1 - Placeholder)
   ============================================================
   
   ARCHITETTURA:
   - Ogni giocatore sceglie 3 carte durante il setup (anche duplicate).
   - Le carte sono memorizzate in players[p].cards = [id, id, id].
   - Gli effetti sono stub (placeholder): ogni carta ha una funzione
     applyCardEffect(cardId, faction) pronta per essere implementata.
   - La selezione avviene in un pannello modale aggiunto al setup-box.
   - In multiplayer le carte sono incluse nel payload SETUP_DONE e GAME_STATE.
   ============================================================ */

// ============================================================
// DEFINIZIONE CARTE
// ============================================================

const CARD_DEFINITIONS = {
    C01: {
        id: 'C01',
        name: 'Blitz',
        icon: '⚡',
        color: '#FFD700',
        description: 'Una volta a partita, un tuo agente ottiene +2 AP in questo turno.',
        // PLACEHOLDER — implementare in gamelogic.js
        apply: (faction) => {
            console.log(`[CARTA C01 - Blitz] Placeholder. Fazione: ${faction}`);
            showCardMessage(faction, 'C01');
        }
    },
    C02: {
        id: 'C02',
        name: 'Fortino',
        icon: '🏰',
        color: '#00aaff',
        description: 'Una volta a partita, costruisci 3 barricate ovunque sulla mappa, (costo 0 AP).',
        apply: (faction) => {
            console.log(`[CARTA C02 - Fortino] Placeholder. Fazione: ${faction}`);
            showCardMessage(faction, 'C02');
        }
    },
    C03: {
        id: 'C03',
        name: 'Cecchino',
        icon: '🎯',
        color: '#ff3333',
        description: 'Una volta a partita, un tuo agente attacca a portata doppia per 1 turno.',
        apply: (faction) => {
            console.log(`[CARTA C03 - Cecchino] Placeholder. Fazione: ${faction}`);
            showCardMessage(faction, 'C03');
        }
    },
    C04: {
        id: 'C04',
        name: 'Medico di Campo',
        icon: '💉',
        color: '#00ff88',
        description: 'Una volta a partita, ripristina 3 HP a un agente adiacente (costo 0 AP).',
        apply: (faction) => {
            console.log(`[CARTA C04 - Medico di Campo] Placeholder. Fazione: ${faction}`);
            showCardMessage(faction, 'C04');
        }
    },
    C05: {
        id: 'C05',
        name: 'Demolizione',
        icon: '💣',
        color: '#ff8800',
        description: 'Una volta a partita, un attacco infligge danno doppio.',
        apply: (faction) => {
            console.log(`[CARTA C05 - Demolizione] Placeholder. Fazione: ${faction}`);
            showCardMessage(faction, 'C05');
        }
    },
    C06: {
        id: 'C06',
        name: 'Infiltrazione',
        icon: '👻',
        color: '#cc00ff',
        description: 'Una volta a partita, muovi un agente attraverso un ostacolo ignorandolo.',
        apply: (faction) => {
            console.log(`[CARTA C06 - Infiltrazione] Placeholder. Fazione: ${faction}`);
            showCardMessage(faction, 'C06');
        }
    },
    C07: {
        id: 'C07',
        name: 'Scudo Elettronico',
        icon: '🛡️',
        color: '#00ffff',
        description: 'Una volta a partita, annulla il prossimo attacco subito da un tuo agente.',
        apply: (faction) => {
            console.log(`[CARTA C07 - Scudo Elettronico] Placeholder. Fazione: ${faction}`);
            showCardMessage(faction, 'C07');
        }
    },
    C08: {
        id: 'C08',
        name: 'Airdrop',
        icon: '🪂',
        color: '#a0ff00',
        description: 'Una volta a partita, trasporta un tuo agente in qualsiasi cella libera.',
        apply: (faction) => {
            console.log(`[CARTA C08 - Airdrop] Placeholder. Fazione: ${faction}`);
            showCardMessage(faction, 'C08');
        }
    },
    C09: {
        id: 'C09',
        name: 'EMP',
        icon: '📡',
        color: '#ff00cc',
        description: "Una volta a partita, rallenta i nemici fino a 3 caselle di distanza: perdono 1 AP nel prossimo turno.",
        apply: (faction) => {
            console.log(`[CARTA C09 - EMP] Placeholder. Fazione: ${faction}`);
            showCardMessage(faction, 'C09');
        }
    },
    C10: {
        id: 'C10',
        name: 'Contrabbandiere',
        icon: '🎲',
        color: '#ffaa00',
        description: 'Una volta a partita, ruba 1 punto statistiche (HP/MOV/RNG/DMG) da un agente nemico adiacente.',
        apply: (faction) => {
            console.log(`[CARTA C10 - Contrabbandiere] Placeholder. Fazione: ${faction}`);
            showCardMessage(faction, 'C10');
        }
    }
};

// ============================================================
// STATO LOCALE SELEZIONE CARTE
// (viene resettato a ogni setup di giocatore)
// ============================================================

let cardSelectionData = {
    selected: []   // array di max 3 cardId (duplicati permessi)
};

// ============================================================
// UI — PANNELLO SELEZIONE CARTE
// (chiamata da setup.js tramite initCardSelectionUI)
// ============================================================

/**
 * Inietta il pannello di selezione carte nel setup-box,
 * sopra il pulsante "Conferma Operativi".
 * Chiamata da updateSetupUI() in setup.js dopo il rendering degli agenti.
 */
function initCardSelectionUI() {
    // Rimuovi pannello precedente se esiste (cambio giocatore)
    const old = document.getElementById('card-selection-panel');
    if (old) old.remove();

    cardSelectionData.selected = [];

    const panel = document.createElement('div');
    panel.id = 'card-selection-panel';
    panel.style.cssText = `
        margin: 10px 0 15px 0;
        border: 1px solid #444;
        border-radius: 6px;
        background: rgba(0,0,0,0.4);
        padding: 12px;
    `;

    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="color:#fff; font-weight:bold; font-size:15px; text-transform:uppercase; letter-spacing:1px;">
                🃏 Carte Strategiche
            </span>
            <span id="card-selection-count" style="color:#888; font-size:13px;">Seleziona 3 carte (0/3)</span>
        </div>
        <div id="card-grid" style="
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
            margin-bottom: 10px;
        "></div>
        <div id="card-selected-slots" style="
            display: flex;
            gap: 8px;
            justify-content: center;
            margin-top: 8px;
            min-height: 54px;
            align-items: center;
        ">
            <span style="color:#555; font-size:13px; font-style:italic;">Nessuna carta selezionata</span>
        </div>
    `;

    const confirmBtn = document.getElementById('confirm-setup-btn');
    confirmBtn.parentNode.insertBefore(panel, confirmBtn);

    _renderCardGrid();
    _renderSelectedSlots();
}

function _renderCardGrid() {
    const grid = document.getElementById('card-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const faction = currentPlayer;
    const activeColor = players[faction].color;

    Object.values(CARD_DEFINITIONS).forEach(card => {
        const btn = document.createElement('button');
        btn.className = 'action-btn';
        btn.title = card.description;
        btn.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            padding: 8px 4px;
            border: 2px solid ${card.color}44;
            background: rgba(0,0,0,0.5);
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.15s;
        `;

        // Conta quante volte questa carta è già selezionata
        const countSelected = cardSelectionData.selected.filter(id => id === card.id).length;
        if (countSelected > 0) {
            btn.style.borderColor = card.color;
            btn.style.background = card.color + '22';
            btn.style.boxShadow = `0 0 8px ${card.color}88`;
        }

        btn.innerHTML = `
            <span style="font-size:20px;">${card.icon}</span>
            <span style="font-size:10px; color:${card.color}; text-transform:uppercase; font-weight:bold; line-height:1.1; text-align:center;">${card.name}</span>
        `;

        btn.onclick = () => {
            if (typeof playSFX === 'function') playSFX('click');
            _toggleCardSelection(card.id);
        };

        // Tooltip al hover: mostra descrizione
        btn.addEventListener('mouseenter', () => {
            _showCardTooltip(card, btn);
        });
        btn.addEventListener('mouseleave', () => {
            _hideCardTooltip();
        });

        grid.appendChild(btn);
    });
}

function _renderSelectedSlots() {
    const container = document.getElementById('card-selected-slots');
    if (!container) return;
    container.innerHTML = '';

    if (cardSelectionData.selected.length === 0) {
        container.innerHTML = `<span style="color:#555; font-size:13px; font-style:italic;">Nessuna carta selezionata</span>`;
        return;
    }

    cardSelectionData.selected.forEach((cardId, slotIndex) => {
        const card = CARD_DEFINITIONS[cardId];
        const slot = document.createElement('div');
        slot.style.cssText = `
            border: 2px solid ${card.color};
            border-radius: 4px;
            padding: 6px 10px;
            background: ${card.color}22;
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            transition: all 0.15s;
            position: relative;
        `;
        slot.title = `Rimuovi: ${card.name}`;
        slot.innerHTML = `
            <span style="font-size:18px;">${card.icon}</span>
            <span style="font-size:11px; color:${card.color}; font-weight:bold;">${card.name}</span>
            <span style="font-size:10px; color:#ff3333; margin-left:4px;">✕</span>
        `;
        slot.onclick = () => {
            if (typeof playSFX === 'function') playSFX('click');
            cardSelectionData.selected.splice(slotIndex, 1);
            _renderCardGrid();
            _renderSelectedSlots();
            _updateCardCount();
        };
        container.appendChild(slot);
    });

    // Slot vuoti rimanenti
    const remaining = 3 - cardSelectionData.selected.length;
    for (let i = 0; i < remaining; i++) {
        const empty = document.createElement('div');
        empty.style.cssText = `
            border: 2px dashed #333;
            border-radius: 4px;
            padding: 6px 18px;
            color: #333;
            font-size: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        empty.innerHTML = '?';
        container.appendChild(empty);
    }
}

function _toggleCardSelection(cardId) {
    if (cardSelectionData.selected.length < 3) {
        cardSelectionData.selected.push(cardId);
    } else {
        // Già 3 carte: sostituisce la prima carta identica o la prima in assoluto
        const existingIdx = cardSelectionData.selected.indexOf(cardId);
        if (existingIdx !== -1) {
            cardSelectionData.selected.splice(existingIdx, 1);
        } else {
            // Rimpiazza la prima carta (FIFO)
            cardSelectionData.selected.shift();
            cardSelectionData.selected.push(cardId);
        }
    }
    _renderCardGrid();
    _renderSelectedSlots();
    _updateCardCount();
}

function _updateCardCount() {
    const el = document.getElementById('card-selection-count');
    if (el) {
        const n = cardSelectionData.selected.length;
        el.innerText = `Seleziona 3 carte (${n}/3)`;
        el.style.color = n === 3 ? '#00ff88' : '#888';
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
    tip.style.cssText = `
        position: fixed;
        z-index: 9999;
        background: #0a0a18;
        border: 2px solid ${card.color};
        border-radius: 6px;
        padding: 10px 14px;
        max-width: 220px;
        pointer-events: none;
        font-family: 'Courier New', monospace;
        box-shadow: 0 0 15px ${card.color}66;
    `;
    tip.innerHTML = `
        <div style="font-size:22px; margin-bottom:4px; text-align:center;">${card.icon}</div>
        <div style="color:${card.color}; font-weight:bold; font-size:13px; text-transform:uppercase; margin-bottom:6px; text-align:center;">${card.name}</div>
        <div style="color:#bbb; font-size:12px; line-height:1.4;">${card.description}</div>
        <div style="color:#555; font-size:10px; margin-top:6px; text-align:right; font-style:italic;">Uso singolo per partita</div>
    `;
    document.body.appendChild(tip);
    _tooltipEl = tip;

    // Posiziona vicino all'ancora
    const rect = anchor.getBoundingClientRect();
    let top = rect.bottom + 6;
    let left = rect.left;
    if (left + 230 > window.innerWidth) left = window.innerWidth - 240;
    if (top + 160 > window.innerHeight) top = rect.top - 165;
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
}

function _hideCardTooltip() {
    if (_tooltipEl) { _tooltipEl.remove(); _tooltipEl = null; }
    const old = document.getElementById('card-tooltip');
    if (old) old.remove();
}

// ============================================================
// INTEGRAZIONE MULTIPLAYER
// ============================================================

/**
 * Restituisce le carte selezionate per il giocatore corrente,
 * da includere nel payload SETUP_DONE o nella conferma locale.
 * Se il giocatore non ha selezionato 3 carte, completa con C01.
 */
function getFinalCardSelection() {
    const sel = [...cardSelectionData.selected];
    while (sel.length < 3) sel.push('C01');
    return sel;
}

/**
 * Applica le carte ricevute dalla rete a un giocatore.
 * Chiamata da receiveGameState() in map.js.
 */
function applyReceivedCards(playerCards) {
    // playerCards = { 1: ['C01','C03','C07'], 2: [...], ... }
    if (!playerCards) return;
    for (const [p, cards] of Object.entries(playerCards)) {
        const pNum = parseInt(p);
        if (players[pNum]) {
            players[pNum].cards = cards;
            players[pNum].usedCards = {};   // traccia carte già usate { cardId: true }
        }
    }
}

// ============================================================
// NOTIFICA IN-GAME (placeholder visivo)
// ============================================================

/**
 * Mostra un messaggio temporaneo quando una carta viene "usata".
 * Placeholder: verrà sostituito con la logica reale della carta.
 */
function showCardMessage(faction, cardId) {
    const card = CARD_DEFINITIONS[cardId];
    if (!card) return;

    const msg = document.createElement('div');
    msg.style.cssText = `
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        z-index: 10000;
        background: rgba(5,5,15,0.95);
        border: 3px solid ${card.color};
        border-radius: 8px;
        padding: 20px 30px;
        text-align: center;
        font-family: 'Courier New', monospace;
        box-shadow: 0 0 30px ${card.color}88;
        pointer-events: none;
    `;
    msg.innerHTML = `
        <div style="font-size:36px; margin-bottom:8px;">${card.icon}</div>
        <div style="color:${card.color}; font-size:18px; font-weight:bold; text-transform:uppercase;">${card.name}</div>
        <div style="color:#888; font-size:13px; margin-top:6px;">[EFFETTO PLACEHOLDER — DA IMPLEMENTARE]</div>
    `;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 2200);
}

// ============================================================
// UI IN-GAME — PANNELLO CARTE NEL CONTROLS PANEL
// Chiamata da updateUI() in gamelogic.js ad ogni aggiornamento.
// ============================================================

/**
 * Aggiorna il pannello carte in-game nel controls-panel.
 * Mostra le 3 carte del giocatore corrente, evidenzia quelle
 * già usate (grigie) e permette di attivare quelle ancora disponibili.
 */
function updateIngameCardsUI() {
    const slotsEl   = document.getElementById('ingame-card-slots');
    const labelEl   = document.getElementById('cards-used-label');
    if (!slotsEl) return;

    const pData = players[currentPlayer];

    // Nessuna carta definita per questo giocatore: nascondi il pannello
    if (!pData || !pData.cards || pData.cards.length === 0) {
        slotsEl.innerHTML = '<span style="color:#444; font-size:12px; font-style:italic;">—</span>';
        if (labelEl) labelEl.innerText = '';
        return;
    }

    const usedCards = pData.usedCards || {};
    const usedCount = Object.keys(usedCards).length;
    if (labelEl) {
        labelEl.innerText = usedCount > 0 ? `${usedCount}/3 usate` : '';
    }

    // Scopri se è il turno del giocatore locale (o locale hotseat)
    const isMyTurn = !isOnline
        ? (currentPlayer > 1 && isAIActive() ? false : true)  // locale: sempre sì tranne AI
        : (currentPlayer === myPlayerNumber);                  // online: solo il proprio turno

    slotsEl.innerHTML = '';

    pData.cards.forEach((cardId, slotIndex) => {
        const card    = CARD_DEFINITIONS[cardId];
        if (!card) return;

        // Una carta è "usata" se compare in usedCards con la chiave slotIndex
        const slotKey = `slot_${slotIndex}`;
        const isUsed  = !!usedCards[slotKey];

        const btn = document.createElement('button');
        btn.className = 'action-btn';

        if (isUsed) {
            // Carta già usata: grigia e disabilitata
            btn.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                padding: 6px 4px;
                border: 2px solid #333;
                background: rgba(0,0,0,0.3);
                opacity: 0.35;
                cursor: not-allowed;
                border-radius: 4px;
            `;
            btn.disabled = true;
            btn.title = `${card.name} — già usata`;
        } else if (!isMyTurn) {
            // Turno altrui: visibile ma non cliccabile
            btn.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                padding: 6px 4px;
                border: 2px solid ${card.color}55;
                background: rgba(0,0,0,0.3);
                opacity: 0.5;
                cursor: not-allowed;
                border-radius: 4px;
            `;
            btn.disabled = true;
            btn.title = card.description;
        } else {
            // Carta disponibile e turno corrente: piena interattività
            btn.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                padding: 6px 4px;
                border: 2px solid ${card.color};
                background: ${card.color}18;
                cursor: pointer;
                border-radius: 4px;
                transition: all 0.15s;
                box-shadow: 0 0 6px ${card.color}44;
            `;
            btn.title = card.description;

            btn.addEventListener('mouseenter', () => {
                if (!btn.disabled) btn.style.background = card.color + '33';
                _showCardTooltip(card, btn);
            });
            btn.addEventListener('mouseleave', () => {
                if (!btn.disabled) btn.style.background = card.color + '18';
                _hideCardTooltip();
            });

            btn.onclick = () => {
                playSFX('click');
                _activateIngameCard(slotIndex, cardId);
            };
        }

        btn.innerHTML = `
            <span style="font-size:18px; line-height:1;">${isUsed ? '✓' : card.icon}</span>
            <span style="font-size:9px; color:${isUsed ? '#444' : card.color}; text-transform:uppercase; font-weight:bold; text-align:center; line-height:1.1;">${card.name}</span>
        `;

        slotsEl.appendChild(btn);
    });
}

/**
 * Attiva una carta in-game: la segna come usata e chiama il suo effetto.
 * In multiplayer invia un messaggio ACTION_CARD all'host/client.
 */
function _activateIngameCard(slotIndex, cardId) {
    const pData   = players[currentPlayer];
    const slotKey = `slot_${slotIndex}`;

    if (!pData || pData.usedCards?.[slotKey]) return;  // già usata

    // Segna come usata localmente
    if (!pData.usedCards) pData.usedCards = {};
    pData.usedCards[slotKey] = true;

    // Esegui l'effetto (placeholder per ora)
    const card = CARD_DEFINITIONS[cardId];
    if (card) card.apply(currentPlayer);

    // Sincronizza in multiplayer
    if (isOnline) {
        sendOnlineMessage({
            type:        'ACTION_CARD',
            cardId:      cardId,
            slotIndex:   slotIndex,
            actingPlayer: currentPlayer
        });
    }

    // Aggiorna il pannello
    updateIngameCardsUI();
}

/**
 * Riceve ed applica l'attivazione di una carta da remoto.
 * Da chiamare in handleHostReceivedData / handleClientReceivedData
 * quando arriva un messaggio di tipo 'ACTION_CARD'.
 */
function receiveRemoteCardAction(data) {
    const pData   = players[data.actingPlayer];
    const slotKey = `slot_${data.slotIndex}`;
    if (!pData) return;
    if (!pData.usedCards) pData.usedCards = {};
    pData.usedCards[slotKey] = true;

    // Esegui l'effetto anche sul client remoto
    const card = CARD_DEFINITIONS[data.cardId];
    if (card) card.apply(data.actingPlayer);

    updateIngameCardsUI();
}
