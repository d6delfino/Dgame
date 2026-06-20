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
           showCardMessage, _activateIngameCard, finalizeAsyncCard,
           receiveRemoteCardAction
   DIPENDE DA: constants.js, state.js, graphics.js (playSpecialVFX),
               gamelogic.js (updateUI, cancelAction, setActionMode, applyMedikit),
               credits.js (showNotificationBanner),
               multiplayer.js (isOnline, sendOnlineMessage, myPlayerNumber)
   ============================================================ */

// ============================================================
// DEFINIZIONE CARTE
// ============================================================

const CARD_DEFINITIONS = {

    C01: {
        id: 'C01', name: 'Blitz', icon: '⚡', color: '#FFD700',
        needsAgent: true,
        description: 'Un tuo agente ottiene subito +1 AP.',
        apply(faction) {
            selectedAgent.ap += 1;
            playSpecialVFX(selectedAgent, this.color, '⚡ +1 AP!');
            playSFX('heal');
            updateUI();
            showCardMessage(faction, this.id);
        },
    },

    C02: {
        id: 'C02', name: 'Airdrop', icon: '🪂', color: '#a0ff00',
        needsAgent: true,
        apCost: 3,
        description: 'Trasporta un tuo agente in qualsiasi cella libera (consuma 3 AP).',
        apply(faction) {
            setActionMode('card_airdrop');
            showCardMessage(faction, this.id);
        },
    },

    C03: {
        id: 'C03', name: 'Cecchino', icon: '🎯', color: '#ff3333',
        needsAgent: true,
        description: '+100% gittata base ed aggiunge +1 perforazione del bersaglio, colpendo anche quello successivo.',
        apply(faction) {
            if (!selectedAgent.sniperBuff) {
                selectedAgent.originalRng = selectedAgent.rng;
                selectedAgent.sniperBuff  = true;
                selectedAgent.pierceCount = 0;
            }
            // Incrementa il numero di perforazioni
            selectedAgent.pierceCount += 1;

            // Aggiunge gittata (pari alla gittata base originale)
            selectedAgent.rng += selectedAgent.originalRng;

            // Calcola quanti bersagli totali può colpire (1 base + N perforazioni)
            const totalTargets = 1 + selectedAgent.pierceCount;

            playSpecialVFX(selectedAgent, this.color, `🎯 PERFORAZIONE x${totalTargets}!`);
            playSFX('cards4');

            // --- FIX AGGIORNAMENTO GRAFICO ISTANTANEO ---
            // Se eravamo già in modalità sparo, svuota i target vecchi e ricalcola i nuovi
            if (currentActionMode === 'shoot') {
                validActionTargets = [];
                calculateValidTargets();
            }
            
            updateUI();
            // Forza anche il ridisegno della griglia per mostrare subito le nuove celle rosse
            drawGame();
            showCardMessage(faction, this.id);
        },
    },

    C04: {
        id: 'C04', name: 'EMP', icon: '📡', color: '#ff00cc',
        needsAgent: true,
        description: `Tutti i nemici a distanza 5 perdono ${GAME.EMP_DEBUFF_AP} AP, gli scudi, il buff Spettro e la copertura della nebbia.`,
        apply(faction) {
            let found = false;
            grid.forEach(cell => {
                if (cell.entity?.type === 'agent' && cell.entity.faction !== currentPlayer && hexDistance(selectedAgent, cell.entity) <= 5) {
                    cell.entity.empDebuff = (cell.entity.empDebuff || 0) + GAME.EMP_DEBUFF_AP;
                    cell.entity.empFogRevealed = true; // nebbia ignorata questo turno
                    let effects = [];
                    if (cell.entity.shielded) {
                        cell.entity.shielded = 0;
                        effects.push('SCUDO');
                    }
                    if (cell.entity.spectreBuff) {
                        cell.entity.spectreBuff = false;
                        effects.push('SPETTRO');
                    }
                    const vfxMsg = effects.length
                        ? `📡 EMP! ${effects.join('+')} DOWN!`
                        : '📡 EMP SHOCK!';
                    playSpecialVFX(cell.entity, this.color, vfxMsg);
                    found = true;
                }
            });
            playSFX('emp');
            if (!found) playSpecialVFX(selectedAgent, this.color, 'Nessun bersaglio EMP');
            else drawGame();
            showCardMessage(faction, this.id);
        },
    },


    C05: {
        id: 'C05', name: 'Esplosivo', icon: '💣', color: '#ff8800',
        needsAgent: true,
        description: '+100% del tuo Danno base e 50% del danno totale alle caselle adiacenti.',
        apply(faction) {
            if (!selectedAgent.demoBuff) {
                selectedAgent.originalDmg = selectedAgent.dmg;
                selectedAgent.demoBuff    = true;
            }
            selectedAgent.dmg += selectedAgent.originalDmg;
            const multiplier = selectedAgent.dmg / selectedAgent.originalDmg;
            playSpecialVFX(selectedAgent, this.color, `💣 DANNO x${multiplier}!`);
            playSFX('cards4');
            updateUI();
            showCardMessage(faction, this.id);
        },
    },

    C06: {
        id: 'C06', name: 'Spettro', icon: '👤', color: '#cc00ff',
        needsAgent: true,
        description: 'Buff permanente: l\'agente può sempre muoversi dentro ostacoli e ignorare coperture nemiche. Rimane attivo finché l\'agente è vivo (o viene rimosso da EMP).',
        apply(faction) {
            selectedAgent.spectreBuff = true;
            playSpecialVFX(selectedAgent, this.color, '👻 SPETTRO PERMANENTE!');
            playSFX('airdrop');
            updateUI();
            drawGame();
            showCardMessage(faction, this.id);
        },
    },

    C07: {
        id: 'C07', name: 'Scudo', icon: '🛡️', color: '#00ffff',
        needsAgent: true,
        description: 'Annulla il prossimo attacco subito dal tuo agente, resta anche nei turni successivi ed è cumulabile.',
        apply(faction) {
            selectedAgent.shielded = (selectedAgent.shielded || 0) + 1;
            playSpecialVFX(selectedAgent, this.color, '🛡️ SCUDO POTENZIATO!');
            playSFX('shield');
            drawGame();
            showCardMessage(faction, this.id);
        },
    },

    C08: {
        id: 'C08', name: 'Fortino', icon: '🏰', color: '#00aaff',
        needsAgent: true,
        description: 'Costruisci 4 barricate ovunque sulla mappa (costo 0 AP).',
        apply(faction) {
            selectedAgent.fortinoBuilds = GAME.FORTINO_BUILDS;
            selectedAgent.fortinoActive = true;
            setActionMode('card_build');
            playSpecialVFX(selectedAgent, this.color, '🏰 FORTINO x4!');
            playSFX('cards4');
            showCardMessage(faction, this.id);
        },
    },

    C09: {
      id: 'C09', name: 'MediBuff', icon: '💉', color: '#00ff88',
      needsAgent: true,
      description: 'Medikit permanente, al primo danno subito (o se già ferito), cura automaticamente fino a 3 HP. Nel turno di attivazione: +1 a tutte le statistiche. Non cumulabile.',
      apply(faction) {
        const target = _getMostDamagedAdjacentAlly(selectedAgent) || selectedAgent;
        target.medikitBuff = true;

        // --- NUOVO: boost temporaneo per questo turno ---
        // Salviamo i valori originali solo se il boost non è già attivo
        // (difesa contro doppia attivazione in edge case multiplayer)
        if (!target.medikitTempBuff) {
            target.medikitTempBuff   = true;
            target._medikitOrigMov   = target.mov;
            target._medikitOrigRng   = target.rng;
            target._medikitOrigDmg   = target.dmg;
            target._medikitOrigMaxHp = target.maxHp;
            target.mov    += 1;
            target.rng    += 1;
            target.dmg    += 1;
            target.maxHp  += 1;
            target.hp     += 1;   // la vita attuale cresce insieme al massimo
        }
        // --- FINE NUOVO ---

        playSpecialVFX(target, this.color, '💉 MEDIKIT +1 A TUTTO!');
        playSFX('heal');

        if (target.hp < target.maxHp) {
            setTimeout(() => {
                applyMedikit(target);
                updateUI();
                drawGame();
            }, 800);
        }

        updateUI(); drawGame();
        showCardMessage(faction, this.id);
      },
    },

    C10: {
        id: 'C10', name: 'Upgrade', icon: '🧬', color: '#ffaa00',
        needsAgent: true,
        isAsync: true, // Apre il menu invece di attivarsi subito
        description: 'Assegna permanentemente 1 punto statistica a scelta all\'agente selezionato. Permette di superare i limiti base!',
        startAsyncSelection(slotIndex, cardId) {
            showUpgradeStatUI(slotIndex, cardId);
        },
        apply(faction, payload) {
            if (!payload) return;

            if (!selectedAgent) return;
            if (payload.hp > 0) {
                selectedAgent.maxHp += payload.hp;
                selectedAgent.hp    += payload.hp;
            }
            if (payload.mov > 0) selectedAgent.mov += payload.mov;
            if (payload.rng > 0) selectedAgent.rng += payload.rng;
            if (payload.dmg > 0) selectedAgent.dmg += payload.dmg;

            playSpecialVFX(selectedAgent, this.color, '🧬 UPGRADE COMPLETATO!');
            playSFX('heal');
            updateUI();
            drawGame();
            showCardMessage(faction, this.id);
        },
    },
};

// ============================================================
// STATO LOCALE SELEZIONE CARTE
// ============================================================
let cardSelectionData = { selected: [] };

// ============================================================
// UI — PANNELLO SELEZIONE CARTE (fase setup)
// ============================================================
function initCardSelectionUI() {
    document.getElementById('card-selection-panel')?.remove();
    document.getElementById('card-toggle-btn')?.remove();
    if (!cardSelectionData.selected || cardSelectionData.selected.length === 0) {
        cardSelectionData.selected = [];
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.id        = 'card-toggle-btn';
    toggleBtn.className = 'action-btn';
    
    // Identico al padding del PRONTO. Il colore arriverà dal p-theme di default
    toggleBtn.style.cssText = 'width:100%; margin-bottom:10px; font-size:18px; padding:12px 20px; text-align:left; line-height:1; min-height:auto; display:flex; align-items:center;';

    // Funzione centrale per mantenere l'emoji allineata a sinistra
    const updateToggleHTML = () => {
        const n = cardSelectionData.selected.length;
        const color = n === 3 ? '#00ff88' : '#888';
        const arrow = document.getElementById('card-selection-panel')?.style.display !== 'none' ? '▲' : '▼';
        
        toggleBtn.innerHTML = `
            <span style="font-size: 3.2em; line-height: 0; margin-right: 15px; position: relative; top: 5px;">🃏</span>
            <span style="text-transform:uppercase; font-weight:bold;">Carte Strategiche</span> 
            <span id="card-selection-count" style="color:${color}; font-size:14px; margin-left:auto; margin-right:10px;">(${n}/3)</span> 
            <span>${arrow}</span>
        `;
    };

    updateToggleHTML(); // inizializzazione

    const panel = document.createElement('div');
    panel.id = 'card-selection-panel';
    panel.style.cssText = `display:none; margin-bottom:12px; border:1px solid #444; border-radius:6px; background:rgba(0,0,0,0.4); padding:12px;`;

    panel.innerHTML = `
        <div id="card-grid" style="display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:10px;"></div>
        <div id="card-selected-slots" style="display:flex; gap:8px; justify-content:center; margin-top:8px; min-height:44px; align-items:center;">
            <span style="color:#555; font-size:13px; font-style:italic;">Nessuna carta selezionata</span>
        </div>
    `;

    toggleBtn.addEventListener('click', () => {
        const open = panel.style.display !== 'none';
        panel.style.display = open ? 'none' : 'block';
        
        updateToggleHTML();   // ← forza sempre l'emoji grande
        
        if (!open) { 
            _renderCardGrid(); 
            _renderSelectedSlots(); 
        }
        playSFX('click');
    });

    // Aggiorna anche quando si seleziona una carta
    window._cardToggleUpdateFn = updateToggleHTML;

    // Nella funzione base _toggleCardSelection (riga 412):
    function _toggleCardSelection(cardId) {
    if (cardSelectionData.selected.length < 3) {
        cardSelectionData.selected.push(cardId);
    } else {
        const idx = cardSelectionData.selected.indexOf(cardId);
        if (idx !== -1) cardSelectionData.selected.splice(idx, 1);
        else { cardSelectionData.selected.shift(); cardSelectionData.selected.push(cardId); }
    }
    _renderCardGrid(); _renderSelectedSlots(); _updateCardCount();
    if (typeof window._cardToggleUpdateFn === 'function') window._cardToggleUpdateFn(); // ← unica chiamata
    }

    const footer = document.getElementById('setup-footer');
    if (footer) {
        footer.parentNode.insertBefore(panel, footer);
        footer.parentNode.insertBefore(toggleBtn, panel);
    } else {
        // Fallback per sicurezza
        const confirmBtn = document.getElementById('confirm-setup-btn');
        if (confirmBtn) {
            confirmBtn.parentNode.insertBefore(panel, confirmBtn);
            confirmBtn.parentNode.insertBefore(toggleBtn, panel);
        }
    }
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

        // Touch: tap breve = seleziona, pressione lunga = tooltip
        let _touchTimer = null;
        let _touchMoved = false;
        btn.addEventListener('touchstart', (e) => {
            _touchMoved = false;
            _touchTimer = setTimeout(() => { _touchTimer = null; _showCardTooltip(card, btn); }, 400);
        }, { passive: true });
        btn.addEventListener('touchmove', () => {
            _touchMoved = true;
            clearTimeout(_touchTimer); _touchTimer = null;
        }, { passive: true });
        btn.addEventListener('touchend', (e) => {
            if (_touchTimer !== null) {
                // Tap breve: cancella il timer e seleziona
                clearTimeout(_touchTimer); _touchTimer = null;
                if (!_touchMoved) {
                    e.preventDefault(); // blocca il click sintetico del browser
                    _hideCardTooltip();
                    _toggleCardSelection(card.id);
                    playSFX('click');
                }
            }
            // Se _touchTimer è null = long-press già scattato → non fare nulla, il tooltip è visibile
        });

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
        slot.style.cssText = `border:2px solid ${card.color}; border-radius:4px; padding:2px 10px; background:${card.color}22; display:flex; align-items:center; gap:6px; cursor:pointer; transition:all 0.15s;`;
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
    
    if (el) { 
        el.innerText = `carte (${n}/3)`; 
        el.style.color = color; 
    }

    // Forza aggiornamento completo del pulsante
    const btn = document.getElementById('card-toggle-btn');
    if (btn) {
        const open = document.getElementById('card-selection-panel')?.style.display !== 'none';
        const arrow = open ? '▲' : '▼';
        
        btn.innerHTML = `
            <span style="font-size: 3.2em; line-height: 0; margin-right: 15px; position: relative; top: 5px;">🃏</span>
            <span style="text-transform:uppercase; font-weight:bold;">Carte Strategiche</span> 
            <span id="card-selection-count" style="color:${color}; font-size:14px; margin-left:auto; margin-right:10px;">(${n}/3)</span> 
            <span>${arrow}</span>
        `;
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
    const isMobile = window.innerWidth <= 768;
    tip.style.cssText = `position:fixed; z-index:9999; background:#0a0a18; border:2px solid ${card.color}; border-radius:6px; padding:${isMobile ? '10px 14px' : '20px 28px'}; max-width:${isMobile ? '220px' : '440px'}; pointer-events:auto; cursor:pointer; font-family:'Courier New',monospace; box-shadow:0 0 15px ${card.color}66;`;
    tip.innerHTML = `
        <div style="font-size:${isMobile ? '22px' : '44px'};margin-bottom:${isMobile ? '4px' : '8px'};text-align:center;">${card.icon}</div>
        <div style="color:${card.color};font-weight:bold;font-size:${isMobile ? '13px' : '26px'};text-transform:uppercase;margin-bottom:${isMobile ? '6px' : '12px'};text-align:center;">${card.name}</div>
        <div style="color:#bbb;font-size:${isMobile ? '12px' : '24px'};line-height:1.4;">${card.description}</div>
        <div style="color:#555;font-size:${isMobile ? '10px' : '20px'};margin-top:${isMobile ? '6px' : '12px'};text-align:right;font-style:italic;">Uso singolo per partita</div>
    `;
    document.body.appendChild(tip);
    _tooltipEl = tip;
    tip.addEventListener('click',    _hideCardTooltip);
    tip.addEventListener('touchend', (e) => { e.preventDefault(); _hideCardTooltip(); });

    tip.style.top   = '10px';
    tip.style.left  = '10px';
    tip.style.right = 'auto';
}

function _hideCardTooltip() {
    _tooltipEl?.remove(); _tooltipEl = null;
    document.getElementById('card-tooltip')?.remove();
}

// ============================================================
// UI ASINCRONA — MENU UPGRADE AGENTE (C10)
// ============================================================
function showUpgradeStatUI(slotIndex, cardId) {
    let pointsLeft = 1;
    const alloc = { hp: 0, mov: 0, rng: 0, dmg: 0 };
    const baseStats = {
        hp:  selectedAgent.maxHp,
        mov: selectedAgent.mov,
        rng: selectedAgent.rng,
        dmg: selectedAgent.dmg,
    };

    // ── Inietta l'HTML dell'overlay direttamente come template ──
    // Molto più leggibile di 120 righe di createElement/appendChild.
    const overlay = document.createElement('div');
    overlay.id = 'upgrade-card-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;pointer-events:auto;';
    overlay.addEventListener('pointerdown', e => e.stopPropagation());
    overlay.addEventListener('click',       e => e.stopPropagation());

    overlay.innerHTML = `
        <div style="background:#111118;border:2px solid #ffaa00;padding:20px;border-radius:8px;
                    text-align:center;color:#fff;box-shadow:0 0 30px #ffaa0044;
                    min-width:320px;max-width:90vw;">
            <h2 style="color:#ffaa00;margin:0 0 5px 0;text-transform:uppercase;font-size:24px;">
                🧬 UPGRADE AGENTE
            </h2>
            <div style="margin-bottom:20px;font-size:14px;color:#aaa;">
                Punti disponibili:
                <strong id="upgrade-pts" style="color:#00ff88;font-size:22px;">${pointsLeft}</strong>
            </div>
            <div id="upgrade-stats" style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px;">
                ${['hp:Vita Max', 'mov:Passi', 'rng:Tiro', 'dmg:Danno'].map(s => {
                    const [id, label] = s.split(':');
                    return `
                    <div style="display:flex;align-items:center;justify-content:space-between;
                                background:#0a0a10;padding:10px 15px;border:1px solid #333;border-radius:4px;">
                        <span style="width:80px;text-align:left;color:#888;font-weight:bold;
                                     text-transform:uppercase;font-size:14px;">${label}</span>
                        <div style="display:flex;align-items:center;gap:15px;">
                            <button data-stat="${id}" data-delta="-1"
                                    style="background:#333;color:#fff;border:none;width:38px;height:38px;
                                           cursor:pointer;border-radius:4px;font-weight:bold;font-size:20px;
                                           pointer-events:auto;">−</button>
                            <span id="upgrade-val-${id}"
                                  style="font-size:20px;font-weight:bold;width:40px;text-align:center;">
                                ${baseStats[id]}
                            </span>
                            <button data-stat="${id}" data-delta="1"
                                    style="background:#333;color:#fff;border:none;width:38px;height:38px;
                                           cursor:pointer;border-radius:4px;font-weight:bold;font-size:20px;
                                           pointer-events:auto;">+</button>
                        </div>
                    </div>`;
                }).join('')}
            </div>
            <div style="display:flex;gap:15px;justify-content:center;">
                <button id="upgrade-cancel"
                        style="border-color:#522;color:#f88;padding:12px;flex:1;font-size:16px;
                               pointer-events:auto;" class="action-btn">ANNULLA</button>
                <button id="upgrade-confirm"
                        style="border-color:#ffaa00;color:#ffaa00;padding:12px;flex:1;font-size:16px;
                               opacity:0.3;cursor:not-allowed;pointer-events:auto;" class="action-btn"
                        disabled>CONFERMA</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // ── Riferimenti DOM (dopo l'iniezione del template) ──────
    const confirmBtn = overlay.querySelector('#upgrade-confirm');
    const cancelBtn  = overlay.querySelector('#upgrade-cancel');

    // ── Listener delegato sui pulsanti +/- ──────────────────
    overlay.querySelector('#upgrade-stats').addEventListener('click', e => {
        const btn = e.target.closest('[data-stat]');
        if (!btn) return;
        e.stopPropagation(); e.preventDefault();

        const id    = btn.dataset.stat;
        const delta = parseInt(btn.dataset.delta);

        if (delta < 0 && alloc[id] <= 0) return;
        if (delta > 0 && pointsLeft <= 0) return;

        playSFX('click');
        alloc[id]   += delta;
        pointsLeft  -= delta;
        _updateUpgradeView(overlay, baseStats, alloc, pointsLeft, confirmBtn);
    });

    cancelBtn.onclick = e => {
        e.stopPropagation();
        overlay.remove();
        playSFX('click');
    };

    confirmBtn.onclick = e => {
        e.stopPropagation();
        if (pointsLeft !== 0) return;
        overlay.remove();
        playSFX('click');
        finalizeAsyncCard(slotIndex, cardId, alloc);
    };

    // Rendering iniziale
    _updateUpgradeView(overlay, baseStats, alloc, pointsLeft, confirmBtn);
}

/**
 * Aggiorna i valori visualizzati e lo stato dei pulsanti nel menu Upgrade.
 * Estratta da showUpgradeStatUI per evitare la closure su 120 righe.
 */
function _updateUpgradeView(overlay, baseStats, alloc, pointsLeft, confirmBtn) {
    const ptsLabel = overlay.querySelector('#upgrade-pts');
    if (ptsLabel) {
        ptsLabel.innerText   = pointsLeft;
        ptsLabel.style.color = pointsLeft > 0 ? '#00ff88' : '#ff3333';
    }

    for (const id of ['hp', 'mov', 'rng', 'dmg']) {
        const valEl = overlay.querySelector(`#upgrade-val-${id}`);
        if (valEl) {
            const current = baseStats[id] + alloc[id];
            valEl.innerHTML = alloc[id] > 0
                ? `<span style="color:#ffaa00;text-shadow:0 0 8px #ffaa00;">${current}</span>`
                : String(current);
        }

        // Abilita/disabilita i pulsanti − e + per questa stat
        overlay.querySelectorAll(`[data-stat="${id}"]`).forEach(btn => {
            const delta    = parseInt(btn.dataset.delta);
            const disabled = (delta < 0 && alloc[id] <= 0) || (delta > 0 && pointsLeft <= 0);
            btn.disabled       = disabled;
            btn.style.opacity  = disabled ? '0.3' : '1';
            btn.style.cursor   = disabled ? 'not-allowed' : 'pointer';
        });
    }

    confirmBtn.disabled      = pointsLeft > 0;
    confirmBtn.style.opacity = pointsLeft > 0 ? '0.3' : '1';
    confirmBtn.style.cursor  = pointsLeft > 0 ? 'not-allowed' : 'pointer';
}

// ============================================================
// ATTIVAZIONE IN-GAME
// ============================================================
function _activateIngameCard(slotIndex, cardId) {
    const card    = CARD_DEFINITIONS[cardId];
    const pData   = players[currentPlayer];
    const slotKey = `slot_${slotIndex}`;

    if (card?.needsAgent && (!selectedAgent || selectedAgent.faction !== currentPlayer || selectedAgent.type !== 'agent')) {
        playSpecialVFX({ q: 0, r: 0 }, '#ff3333', 'SELEZIONA UN AGENTE!');
        return;
    }

    const cost = card.apCost || 0;
    if (card?.needsAgent && selectedAgent && selectedAgent.ap < cost) {
        playSpecialVFX(selectedAgent, '#ff3333', `SERVE ${cost} AP!`);
        return;
    }

    if (!pData || pData.usedCards?.[slotKey]) return;

    if (card.isAsync) {
        // FIX: Evita di aprire menu multipli se si clicca molto velocemente (o si fa doppio tap su mobile)
        if (document.getElementById('upgrade-card-overlay')) return;
        
        card.startAsyncSelection(slotIndex, cardId);
        return;
    }

    // DOPO
    const isDeferred = (cardId === 'C02' || cardId === 'C08');

    if (!isDeferred) {
    if (!pData.usedCards) pData.usedCards = {};
    pData.usedCards[slotKey] = true;
    }

    card?.apply(currentPlayer);

    if (!isDeferred) {
    if (isOnline) {
        sendOnlineMessage({
            type: 'ACTION_CARD', cardId, slotIndex,
            actingPlayer:  currentPlayer,
            targetAgentId: selectedAgent?.id ?? null,
        });
    }
    updateIngameCardsUI();
    } else {
    // Salva il contesto sulla carta in pending sull'agente.
    // executeAction lo leggerà quando l'azione avrà successo.
    selectedAgent._pendingCard = { slotIndex, cardId, slotKey };
    updateIngameCardsUI();
    }
}

function finalizeAsyncCard(slotIndex, cardId, payload) {
    const card    = CARD_DEFINITIONS[cardId];
    const pData   = players[currentPlayer];
    const slotKey = `slot_${slotIndex}`;

    if (pData.usedCards && pData.usedCards[slotKey]) return;
    // --- FIX ASYNC: Salviamo l'ID dell'agente per garantire che la rete 
    // riceva il bersaglio esatto, anche se la selezione UI dovesse saltare
    const targetIdToSync = selectedAgent ? selectedAgent.id : null;

    if (!pData.usedCards) pData.usedCards = {};
    pData.usedCards[slotKey] = true;

    card?.apply(currentPlayer, payload);

    if (isOnline) {
        sendOnlineMessage({
            type: 'ACTION_CARD', cardId, slotIndex,
            actingPlayer:  currentPlayer,
            targetAgentId: targetIdToSync, // <--- Usa la variabile salvata
            payload,
        });
    }
    updateIngameCardsUI();
}

function receiveRemoteCardAction(data) {
    const pData   = players[data.actingPlayer];
    const slotKey = `slot_${data.slotIndex}`;
    if (!pData) return;
    if (!pData.usedCards) pData.usedCards = {};
    
    let previousAgent = selectedAgent;

    // RICERCA AGENTE PIÙ ROBUSTA
    if (data.targetAgentId) {
        const agent = pData.agents.find(a => a.id === data.targetAgentId);
        if (agent) {
            selectedAgent = agent;
        } else {
            console.warn(`[Host] Agente ${data.targetAgentId} non trovato. Tento fallback sul primo agente vivo.`);
            selectedAgent = pData.agents.find(a => a.hp > 0) || previousAgent;
        }
    }

    // SICUREZZA: Se l'agente è ancora nullo e la carta lo richiede, abortisci PRIMA di bruciare la carta
    const cardDef = CARD_DEFINITIONS[data.cardId];
    if (cardDef?.needsAgent && !selectedAgent) {
        console.warn(`[Host] Ignorata carta ${data.cardId} da P${data.actingPlayer}: nessun bersaglio valido.`);
        selectedAgent = previousAgent;
        return;
    }

    // Ora è sicuro segnare la carta come usata sull'Host
    pData.usedCards[slotKey] = true;

    // Caso speciale: Airdrop eseguito dall'AI.
    if (data.cardId === 'C02' && data.aiDropQ !== undefined && selectedAgent) {
        const targetCell = grid.get(getKey(data.aiDropQ, data.aiDropR));
        if (targetCell && targetCell.type === 'empty' && !targetCell.entity) {
            grid.get(getKey(selectedAgent.q, selectedAgent.r)).entity = null;
            targetCell.entity  = selectedAgent;
            selectedAgent.q    = data.aiDropQ;
            selectedAgent.r    = data.aiDropR;
            selectedAgent.ap   = Math.max(0, selectedAgent.ap - 3);
            const cpKey = getKey(selectedAgent.q, selectedAgent.r);
            if (controlPoints.has(cpKey)) {
                const cp = controlPoints.get(cpKey);
                if (cp.faction !== selectedAgent.faction) cp.faction = selectedAgent.faction;
            }
            playSpecialVFX(selectedAgent, '#a0ff00', '🪂 AIRDROP!');
        }
        updateIngameCardsUI();
        drawGame();
        
        selectedAgent = previousAgent;
        return; 
    }

    // Caso speciale: Fortino costruito dall'AI (ha già le coordinate della barricata)
    if (data.cardId === 'C08' && data.buildQ !== undefined) {
        const cell = grid.get(getKey(data.buildQ, data.buildR));
        if (cell && cell.type === 'empty' && !cell.entity) {
            cell.type = 'barricade';
            invalidateStaticLayer();
            cell.hp = cell.maxHp = GAME.BARRICADE_HP;
            cell.sprite = getRandomSprite(SPRITE_POOLS.barricades);
            cell.customSpriteId = typeof getFactionBarricadeId === 'function' 
                                      ? getFactionBarricadeId(data.actingPlayer) 
                                      : (typeof THEME_BARRICADE_ID !== 'undefined' ? THEME_BARRICADE_ID : 'barricade');
            invalidateStaticLayer();
        }
        updateIngameCardsUI();
        drawGame();
        selectedAgent = previousAgent;
        return;
    }

    // C02 (Airdrop) e C08 (Fortino) non chiamano apply() sui client remoti:
    // il loro effetto reale è già arrivato tramite il messaggio ACTION separato.
    // Chiamare apply() qui imposterebbe setActionMode sul client, mostrando
    // le celle valide in modo errato.
    if (data.cardId !== 'C02' && data.cardId !== 'C08') {
        cardDef?.apply(data.actingPlayer, data.payload);
    }

    // Ripristina l'agente che l'Host stava eventualmente guardando
    selectedAgent = previousAgent;

    updateIngameCardsUI();
    drawGame();
}

// ============================================================
// UI IN-GAME — PANNELLO CARTE
// ============================================================
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
        const slotKey  = `slot_${slotIndex}`;
        const isUsed   = !!usedCards[slotKey];
        const cost     = card.apCost || 0;
        const missingAP = (card.needsAgent && selectedAgent && selectedAgent.faction === currentPlayer && selectedAgent.ap < cost);

        const btn = document.createElement('button');
        btn.className = 'action-btn';

        if (isUsed) {
            btn.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:2px 4px;min-height:0;border:2px solid #333;background:rgba(0,0,0,0.3);opacity:0.35;cursor:not-allowed;border-radius:4px;`;
            btn.disabled = true;
            btn.title    = `${card.name} — già usata`;
        } else if (!isMyTurn) {
            btn.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:2px 4px;min-height:0;border:2px solid ${card.color}55;background:rgba(0,0,0,0.3);opacity:0.5;cursor:not-allowed;border-radius:4px;`;
            btn.disabled = true;
            btn.title    = card.description;
        } else if (missingAP) {
            btn.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:2px 4px;min-height:0;border:2px solid #555;background:rgba(0,0,0,0.5);opacity:0.6;cursor:not-allowed;border-radius:4px;`;
            btn.disabled = true;
            btn.title    = `Richiede ${cost} AP. ${card.description}`;
        } else {
            btn.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:2px 4px;min-height:0;border:2px solid ${card.color};background:${card.color}18;cursor:pointer;border-radius:4px;transition:all 0.15s;box-shadow:0 0 6px ${card.color}44;`;
            btn.title = card.description;
            btn.addEventListener('mouseenter', () => { btn.style.background = card.color + '33'; _showCardTooltip(card, btn); });
            btn.addEventListener('mouseleave', () => { btn.style.background = card.color + '18'; _hideCardTooltip(); });
            btn.addEventListener('touchstart', _hideCardTooltip, { passive: true });
            btn.addEventListener('touchend', (e) => {
                e.preventDefault(); // blocca il click sintetico ritardato che fallisce sui pieghevoli
                playSFX('click');
                _activateIngameCard(slotIndex, cardId);
            });
            btn.onclick = () => { playSFX('click'); _activateIngameCard(slotIndex, cardId); };
        }

        btn.innerHTML = `
            <span style="font-size:18px;line-height:1;">${isUsed ? '✓' : card.icon}</span>
            <span style="font-size:9px;color:${isUsed ? '#444' : (missingAP ? '#888' : card.color)};text-transform:uppercase;font-weight:bold;text-align:center;line-height:1.1;">${card.name}</span>
        `;
        slotsEl.appendChild(btn);
    });
}

// ============================================================
// NOTIFICA ATTIVAZIONE CARTA
// ============================================================
/**
 * Mostra il banner "Carta — Attivata!" in cima allo schermo.
 *
 * Usa showNotificationBanner (credits.js) come tutti gli altri
 * banner del gioco, con due differenze rispetto ai banner standard:
 *  - Animazione "pop" con scala invece di fade verticale: ottenuta
 *    iniettando una volta sola il keyframe cardPopupAnim.
 *  - Cliccabile/tappabile per chiudersi prima dello scadere.
 *  - Mostra icona + nome della carta, non solo testo.
 */
function showCardMessage(faction, cardId) {
    const card = CARD_DEFINITIONS[cardId];
    if (!card) return;

    // Rimuove l'eventuale banner precedente (evita sovrapposizioni
    // se il giocatore attiva due carte in rapida successione)
    document.getElementById('card-activation-msg')?.remove();

    // Inietta il keyframe pop una sola volta nel documento
    if (!document.getElementById('card-popup-anim')) {
        const style     = document.createElement('style');
        style.id        = 'card-popup-anim';
        style.innerHTML = `
            @keyframes cardPopupAnim {
                0%   { opacity:0; transform:translateX(-50%) translateY(-8px) scale(0.9); }
                15%  { opacity:1; transform:translateX(-50%) translateY(0)    scale(1.04); }
                30%  { transform:translateX(-50%) translateY(0) scale(1); }
                75%  { opacity:1; }
                100% { opacity:0; transform:translateX(-50%) translateY(-4px) scale(0.95); }
            }
        `;
        document.head.appendChild(style);
    }

    const duration = 1400;
    const msg      = document.createElement('div');
    msg.id         = 'card-activation-msg';

    // Stile identico a showNotificationBanner con top centrato,
    // più la box-shadow glow e l'animazione pop specifica delle carte.
    msg.style.cssText = `
        position:fixed; top:12px; left:50%; transform:translateX(-50%);
        z-index:10000;
        background:rgba(5,5,15,0.95);
        border:3px solid ${card.color};
        border-radius:8px;
        padding:10px 22px;
        font-family:'Courier New',monospace;
        box-shadow:0 0 20px ${card.color}88;
        pointer-events:auto; cursor:pointer;
        animation:cardPopupAnim ${duration}ms ease-out forwards;
        display:flex; align-items:center; gap:10px; white-space:nowrap;
    `;
    msg.innerHTML = `
        <span style="font-size:24px;line-height:1;">${card.icon}</span>
        <span style="color:${card.color};font-size:14px;font-weight:bold;text-transform:uppercase;">${card.name} — Attivata!</span>
        <span style="color:#666;font-size:12px;margin-left:4px;">✕</span>
    `;

    const dismiss = () => { clearTimeout(timer); msg.remove(); };
    msg.addEventListener('click',    dismiss);
    msg.addEventListener('touchend', e => { e.preventDefault(); dismiss(); });
    document.body.appendChild(msg);
    const timer = setTimeout(dismiss, duration);
}

// ============================================================
// MULTIPLAYER E AI HELPERS
// ============================================================
function getFinalCardSelection() {
    // 1. Caso Umano: ha selezionato delle carte
    let sel = [...cardSelectionData.selected];
    
    // 2. Caso AI: l'array è vuoto perché non ha interagito con l'UI.
    // Generiamo 3 carte uniche casuali.
    if (sel.length === 0 && (isAIActive() && currentPlayer > 1)) {
        const allCardIds = Object.keys(CARD_DEFINITIONS);
        
        // Mischia l'array degli ID delle carte
        for (let i = allCardIds.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allCardIds[i], allCardIds[j]] = [allCardIds[j], allCardIds[i]];
        }
        
        // Prendi le prime 3
        sel = [allCardIds[0], allCardIds[1], allCardIds[2]];
        return sel;
    }

    // 3. Fallback di sicurezza: se l'umano ne ha scelte meno di 3, riempie col Blitz
    while (sel.length < 3) sel.push('C01');
    
    return sel;
}

function applyReceivedCards(playerCards) {
    if (!playerCards) return;
    for (const [p, cards] of Object.entries(playerCards)) {
        const pNum = parseInt(p);
        if (players[pNum]) { players[pNum].cards = cards; players[pNum].usedCards = {}; }
    }
}

// ============================================================
// UTILITY PRIVATE
// ============================================================

/**
 * Restituisce l'alleato adiacente con meno HP (per il Medikit C04).
 * Ritorna null se non ci sono alleati adiacenti feriti.
 */
function _getMostDamagedAdjacentAlly(agent) {
    const allies = hexDirections
        .map(dir => grid.get(getKey(agent.q + dir.q, agent.r + dir.r)))
        .filter(c => c?.entity && c.entity.faction === agent.faction && c.entity.type === 'agent')
        .map(c => c.entity);
    return allies.length ? allies.sort((a, b) => a.hp - b.hp)[0] : null;
}

// Nota: _getAdjacentEnemies è stata rimossa — non era usata da nessuna carta
// né da nessun altro modulo. Se in futuro una carta ne avrà bisogno,
// basterà aggiungere qui:
//   function _getAdjacentEnemies(agent) {
//       return hexDirections
//           .map(dir => grid.get(getKey(agent.q + dir.q, agent.r + dir.r)))
//           .filter(c => c?.entity && c.entity.faction !== agent.faction)
//           .map(c => c.entity);
//   }


markScriptAsLoaded('cards.js');
