/* ============================================================
   setup.js — Fase di setup: mercato agenti e configurazione stats
   ============================================================
   ESPONE: getPlayerTheme, updateSetupUI, renderFactionSelector,
           renderAgentMarket,
           addNewAgentToMarket, removeAgentFromMarket, tuneStat,
           buildWaitMessage, initAIToggleUI, confirmPlayerSetup
   DIPENDE DA: constants.js, assets.js, state.js,
               multiplayer.js (isOnline, isHost, myPlayerNumber,
                               onlineTotalPlayers, playersReady,
                               sendOnlineMessage, tryHostStart),
               cards.js (initCardSelectionUI, getFinalCardSelection),
               main.js (startActiveGameLocal)
   ============================================================ */

function getPlayerTheme(pNum) {
    const chosenFaction = (players[pNum] && players[pNum]._cosmeticFaction) ? players[pNum]._cosmeticFaction : pNum;
    const themes = { 
        1: 'p1-theme', 2: 'p2-theme', 3: 'p3-theme', 4: 'p4-theme',
        5: 'p5-theme', 6: 'p6-theme', 7: 'p7-theme', 8: 'p8-theme' 
    };
    const texts  = { 
        1: 'text-p1',  2: 'text-p2',  3: 'text-p3',  4: 'text-p4',
        5: 'text-p5',  6: 'text-p6',  7: 'text-p7',  8: 'text-p8'  
    };
    const glows  = {
        1: 'rgba(0,255,136,0.2)', 2: 'rgba(204,0,255,0.2)',
        3: 'rgba(0,170,255,0.2)', 4: 'rgba(255,215,0,0.2)',
        5: 'rgba(255,51,51,0.2)',  // Rosso
        6: 'rgba(255,255,255,0.2)', // Bianco
        7: 'rgba(168,168,168,0.2)',   // Grigio Scuro
        8: 'rgba(255,105,180,0.2)', // Rosa
    };
    return { themeClass: themes[chosenFaction], textClass: texts[chosenFaction], glow: glows[chosenFaction] };
}

// ============================================================
// SELETTORE FAZIONE COSMETICA
// ============================================================
// Il numero di slot (currentPlayer) rimane fisso.
// La "fazione cosmetica" cambia solo color, name e sprite degli agenti,
// senza toccare la logica di turno o la posizione HQ.
// NOTA: _FACTION_DEFS è definito centralmente in constants.js

/**
 * Restituisce i numeri-slot fazione già scelti dagli altri giocatori
 * (in locale: chi ha già confermato il setup; in multiplayer: gli altri slot online).
 */
function _getTakenFactions() {
    const taken = new Set();
    for (let p = 1; p <= totalPlayers; p++) {
        if (p === currentPlayer) continue;
        // In locale: il giocatore ha già confermato se ha agenti assegnati
        if (players[p].agents && players[p].agents.length > 0) {
            taken.add(players[p]._cosmeticFaction ?? p);
        }
        // In multiplayer: tutti gli altri slot connessi sono occupati
        if (window.isOnline && p !== currentPlayer) {
            taken.add(players[p]._cosmeticFaction ?? p);
        }
    }
    return taken;
}

/**
 * Applica la fazione cosmetica scelta al giocatore corrente:
 * aggiorna color, name su players[currentPlayer], e riassegna
 * gli sprite degli agenti già reclutati al pool della nuova fazione.
 */
function applyFactionCosmetic(factionSlot) {
    const def = _FACTION_DEFS[factionSlot - 1];
    if (!def) return;

    playFactionMusic(factionSlot);

    // --- NUOVO CONTROLLO ANTI-DUPLICATI ---
    for (let p = 1; p <= totalPlayers; p++) {
        if (p === currentPlayer) continue;

        // Se un altro giocatore ha lo stesso colore (anche di default)
        let otherCosmetic = players[p]._cosmeticFaction ?? p;
        if (otherCosmetic === factionSlot) {
            // Trova il primo colore veramente libero per l'altro giocatore
            const taken = new Set();
            // Consideriamo "preso" il colore che il giocatore attuale sta per scegliere
            taken.add(factionSlot); 
            // E i colori già confermati o usati dagli altri
            for (let p2 = 1; p2 <= totalPlayers; p2++) {
                if (p2 === p) continue;
                taken.add(players[p2]._cosmeticFaction ?? p2);
            }
            
            // Assegna il primo slot libero (1-8)
            for (let s = 1; s <= 8; s++) {
                if (!taken.has(s)) {
                    players[p]._cosmeticFaction = s;
                    players[p].color = _FACTION_DEFS[s-1].color;
                    players[p].name = _FACTION_DEFS[s-1].name;
                    break;
                }
            }
        }
    }

    // Applica il colore al giocatore attuale
    players[currentPlayer]._cosmeticFaction = factionSlot;
    players[currentPlayer].color            = def.color;
    players[currentPlayer].name             = def.name;

    // Riassegna gli sprite degli agenti
    const factionData = FACTION_PREFIXES[factionSlot];
    const prefix = factionData.prefix;
    const maxCount = factionData.count;
    
    let nextSlot = 1;
    setupData.agents.forEach(agent => {
        agent.sprite         = getRandomSprite(def.spritePool);
        agent.customSpriteId = `${prefix}${nextSlot}`;
        nextSlot = nextSlot < maxCount ? nextSlot + 1 : 1;
    });

    updateSetupUI();
}

/**
 * Renderizza la riga del selettore fazione nell'header del setup box.
 * Va chiamata da updateSetupUI dopo aver aggiornato il titolo.
 */
function renderFactionSelector() {

    if (window.isOnline || window.isCampaignOnline) {
        const row = document.getElementById('faction-selector-row');
        if (row) row.remove();
        return; 
    }

    // Rimuovi selettore precedente se esiste
    document.getElementById('faction-selector-row')?.remove();

    const taken   = _getTakenFactions();
    const current = players[currentPlayer]._cosmeticFaction ?? currentPlayer;

    const row = document.createElement('div');
    row.id = 'faction-selector-row';
    row.style.cssText = `
        display:flex; align-items:center; justify-content:center; gap:8px;
        width:fit-content; margin:10px auto 6px auto; padding:8px 10px;
        background:rgba(0,0,0,0.25); border-radius:8px;
        border:1px solid rgba(255,255,255,0.08);
    `;

    const label = document.createElement('span');
    label.style.cssText = 'color:#888; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin-right:4px; flex-shrink:0;';
    label.textContent = 'Fazione:';
    row.appendChild(label);

    _FACTION_DEFS.forEach(def => {
        const isCurrent = (def.slot === current);
        const isTaken   = taken.has(def.slot);

        const btn = document.createElement('button');
        btn.title = isTaken ? `${def.name} — già presa` : def.name;
        btn.disabled = isTaken;

        const baseStyle = `
            width:28px; height:28px; border-radius:50%; cursor:pointer;
            border:3px solid transparent; padding:0; transition:all 0.15s;
            background:${def.color}; position:relative;
        `;
        if (isCurrent) {
            btn.style.cssText = baseStyle + `
                border-color:#fff;
                box-shadow:0 0 0 2px ${def.color}, 0 0 10px ${def.color};
                transform:scale(1.2);
            `;
        } else if (isTaken) {
            btn.style.cssText = baseStyle + `
                opacity:0.2; cursor:not-allowed; filter:grayscale(1);
            `;
        } else {
            btn.style.cssText = baseStyle + `
                border-color:transparent;
                box-shadow:0 0 4px ${def.color}88;
            `;
            btn.onmouseenter = () => { btn.style.transform = 'scale(1.15)'; btn.style.borderColor = '#fff9'; };
            btn.onmouseleave = () => { btn.style.transform = ''; btn.style.borderColor = 'transparent'; };
            btn.onclick = () => { playSFX('click'); applyFactionCosmetic(def.slot); };
        }

        row.appendChild(btn);
    });

    // Inserisce il selettore subito dopo il titolo setup
    const setupHeader = document.getElementById('setup-header');
    if (setupHeader) {
        // Dopo l'ultimo elemento del header (prima dei figli fuori dall'header)
        setupHeader.appendChild(row);
    }
}

function updateSetupUI() {
    const pNum = currentPlayer;
    const pData = players[pNum]; // Dati del giocatore corrente
    const { themeClass, textClass, glow } = getPlayerTheme(pNum);
    const box = document.getElementById('setup-box');

    // Applica le classi CSS dinamiche
    box.style.display  = 'flex';
    // Rimuove vecchie classi di tema e applica quella nuova
    box.className = themeClass; 
    box.style.boxShadow = `0 0 30px ${glow}`;
    box.style.borderColor = pData.color; // Forza il colore del bordo

    // Aggiorna il titolo con il nome della fazione scelta (es: "FAZIONE ROSSO")
    const titleEl = document.getElementById('setup-title');
    //titleEl.innerText  = `Fase Setup: Fazione ${pData.name}`;
    titleEl.innerText  = `${pData.name}: Fase Setup`;
    titleEl.className  = textClass;

    // Aggiorna i punti
    const ptsEl = document.getElementById('pts-count');
    if (ptsEl) {
        ptsEl.innerHTML = `💰 ${setupData.points}`;
        
        // Preserva il più possibile lo stile originale
        ptsEl.style.fontSize = '1.1em';           // solo leggero aumento
        ptsEl.style.display = 'inline-flex';
        ptsEl.style.alignItems = 'center';
        ptsEl.style.gap = '7px';
        // Non tocchiamo justifyContent per non rompere il centramento del contenitore padre
    }

    // Aggiorna i bottoni generici nel setup
    box.querySelectorAll('button.action-btn').forEach(b => {
        b.className = `action-btn ${themeClass}`;
    });
    
    // Aggiorna il bottone di conferma finale (PRONTO)
    const confirmBtn = document.getElementById('confirm-setup-btn');
    if (confirmBtn) {
        confirmBtn.className        = `action-btn ${themeClass}`;
        confirmBtn.style.borderColor = pData.color;
        confirmBtn.style.color       = pData.color;
        confirmBtn.style.padding     = '6px 20px';
        confirmBtn.style.fontSize    = '1.4em';
        confirmBtn.style.lineHeight  = '1';
        confirmBtn.style.minHeight   = 'auto';
        confirmBtn.style.textAlign   = 'left';
        confirmBtn.innerHTML = `<span style="font-size:1.8em; vertical-align:middle; line-height:1;">▶️</span> PRONTO`;
    }

    // --- NUOVO: IMMAGINE DI SFONDO FAZIONE ---
    const cosmeticFaction = players[pNum]._cosmeticFaction ?? pNum;
    const overlay = document.getElementById('setup-overlay');
    if (overlay) {
        // Applica l'immagine con un gradiente scuro sopra per garantire la leggibilità del testo
        overlay.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.1)), url('img/faction${cosmeticFaction}.png')`;
        overlay.style.backgroundSize = 'cover';
        overlay.style.backgroundPosition = 'center';
        overlay.style.transition = 'background-image 0.4s ease-in-out';
    }
    //// fine immagine sfondo

    if (typeof campaignState === 'undefined' || !campaignState?.isActive) {
        renderFactionSelector();
    } else {
        document.getElementById('faction-selector-row')?.remove();
    }
    renderAgentMarket();
    
    initCardSelectionUI();   // ← prima
    initAIToggleUI();        // ← dopo
}

function renderAgentMarket() {
    const container = document.getElementById('agents-market');
    container.innerHTML = '';

    const pTheme = getPlayerTheme(currentPlayer);
    const cosmeticFaction = players[currentPlayer]._cosmeticFaction ?? currentPlayer;
    const factionData = FACTION_PREFIXES[cosmeticFaction];
    const prefix = factionData.prefix;
    const maxSprites = factionData.count;

    setupData.agents.forEach((agent, index) => {
        const card = document.createElement('div');
        card.className = `market-agent-card ${pTheme.themeClass}`;
        card.style.display = 'block';
        card.style.padding = '3px';

        const pColor = players[currentPlayer].color;

        const currentSlot = agent.customSpriteId && agent.customSpriteId.startsWith(prefix)
            ? parseInt(agent.customSpriteId.replace(prefix, ''))
            : 1;

        function buildSpriteContent(slot) {
            const id  = `${prefix}${slot}`;
            const url = customSpriteFiles[id];
            if (url) {
                return `<img src="${url}"
                    style="width:130px;height:130px;object-fit:contain;display:block;pointer-events:none;"
                    onerror="this.style.display='none'">`;
            }
            return `<span style="font-size:72px;line-height:1;">${agent.sprite}</span>`;
        }

        function applySlot(slot) {
            agent.customSpriteId = `${prefix}${slot}`;
            spriteWrap.innerHTML = buildSpriteContent(slot);
        }

        // --- Layout principale: immagine a sinistra, stat a destra ---
        const mainRow = document.createElement('div');
        mainRow.style.cssText = 'display:flex;align-items:stretch;position:relative;overflow:hidden;';

        // Colonna sinistra: immagine che sborda, frecce in overlay
        const imgCol = document.createElement('div');
        imgCol.style.cssText = 'position:absolute;left:0;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;';

        const spriteWrap = document.createElement('div');
        // Rimosso il cursor:pointer e l'onclick. I click verranno catturati dai pulsanti sovrapposti.
        spriteWrap.style.cssText = 'display:flex;align-items:center;justify-content:center;overflow:visible;pointer-events:none;';
        spriteWrap.innerHTML = buildSpriteContent(currentSlot);

        // Aggiornato lo stile: occupa 100% in altezza e 50% in larghezza. Flexbox centra verticalmente.
        const arrowBtnStyle = `background:none;border:none;color:${pColor};font-size:22px;
            cursor:pointer;padding:0 3px;line-height:1;
            position:absolute;top:0;height:100%;width:50%;z-index:2;
            display:flex;align-items:center;pointer-events:auto;`;

        const prevBtn = document.createElement('button');
        // left:0 copre la metà sinistra. flex-start tiene la freccetta attaccata al bordo sinistro
        prevBtn.style.cssText = arrowBtnStyle + 'left:0;justify-content:flex-start;';
        prevBtn.innerHTML = '&#8249;';
        prevBtn.onclick = (e) => {
            e.stopPropagation();
            const cur = parseInt(agent.customSpriteId.replace(prefix, '')) || 1;
            applySlot(cur <= 1 ? maxSprites : cur - 1);
        };

        const nextBtn = document.createElement('button');
        // right:0 copre la metà destra. flex-end tiene la freccetta attaccata al bordo destro
        nextBtn.style.cssText = arrowBtnStyle + 'right:0;justify-content:flex-end;';
        nextBtn.innerHTML = '&#8250;';
        nextBtn.onclick = (e) => {
            e.stopPropagation();
            const cur = parseInt(agent.customSpriteId.replace(prefix, '')) || 1;
            applySlot(cur >= maxSprites ? 1 : cur + 1);
        };

        imgCol.appendChild(prevBtn);
        imgCol.appendChild(spriteWrap);
        imgCol.appendChild(nextBtn);

        // Colonna destra: 4 stat impilate verticalmente con EMOJI
        const statTypes = [
            { id: 'hp',  icon: '💚', label: 'Vita',  max: 5 },
            { id: 'mov', icon: '👣', label: 'Passi', max: 3 },
            { id: 'rng', icon: '🎯', label: 'Tiro',  max: 9 },
            { id: 'dmg', icon: '⚔️', label: 'Danno', max: 4 },
        ];

        const statsCol = document.createElement('div');
        statsCol.style.cssText = 'display:flex;flex-direction:column;justify-content:space-evenly;flex:1;gap:2px;padding-left:110px;';

        statTypes.forEach(stat => {
            const item = document.createElement('div');
            item.className = '';
            // Ho allargato leggermente il box (da 130px a 145px) per fare spazio all'emoji senza mandare a capo il testo
            item.style.cssText = `
                display:inline-flex; align-items:center; align-self:flex-end;
                background:#0a0a10; border:1px solid #2a2a35; border-radius:4px;
                padding:3px 8px; gap:8px; width:155px; box-sizing:border-box;
            `;
            item.innerHTML = `
                <span style="font-size:11px;text-transform:uppercase;color:#888;width:55px;flex-shrink:0;display:flex;align-items:center;gap:4px;">
                    <span style="font-size:13px;">${stat.icon}</span>${stat.label}
                </span>
                <button class="stat-btn" onclick="tuneStat(${index},'${stat.id}',-1)" ${agent[stat.id] <= 1 ? 'disabled' : ''}>-</button>
                <span style="font-size:18px;font-weight:bold;color:#fff;width:18px;text-align:center;flex-shrink:0;">${agent[stat.id]}</span>
                <button class="stat-btn" onclick="tuneStat(${index},'${stat.id}',1)" ${agent[stat.id] >= stat.max || setupData.points <= 0 ? 'disabled' : ''}>+</button>
            `;
            statsCol.appendChild(item);
        });

        // Pulsante X posizionato subito a destra dell'immagine, in alto
        const removeBtn = document.createElement('button');
        removeBtn.className = 'action-btn';
        removeBtn.style.cssText = `
            border-color:#522; color:#ff3333; font-size:14px; font-weight:bold;
            padding:4px 8px; cursor:pointer;
            position:absolute; top:0px; left:115px; /* Posizionato in alto a destra dell'immagine */
            line-height:1; min-width:0; z-index:10;
            background: rgba(0,0,0,0.4); border-radius: 4px;
        `;
        removeBtn.textContent = '✕';
        removeBtn.onclick = () => removeAgentFromMarket(index);

        mainRow.appendChild(imgCol);
        mainRow.appendChild(statsCol);

        // Wrapper relativo per posizionare la X
        const cardInner = document.createElement('div');
        cardInner.style.cssText = 'position:relative;';
        cardInner.appendChild(mainRow);
        cardInner.appendChild(removeBtn);
        card.appendChild(cardInner);

        // statsConfig vuoto (rimosso, le stat sono ora in statsCol)
        const statsConfig = document.createElement('div');
        statsConfig.className = 'agent-stats-config';
        container.appendChild(card);
    });
}


function addNewAgentToMarket() {
    if (setupData.agents.length >= GAME.MAX_AGENTS) {
        showTemporaryMessage(`⚠️ MASSIMO ${GAME.MAX_AGENTS} AGENTI.`, 3000);
        return;
    }
    if (setupData.points < GAME.AGENT_COST) {
        showTemporaryMessage('⚠️ PUNTI INSUFFICIENTI.', 3000);
        return;
    }

    playSFX('click');
    setupData.points -= GAME.AGENT_COST;

    const cosmeticFaction = players[currentPlayer]._cosmeticFaction ?? currentPlayer;
    const factionData = FACTION_PREFIXES[cosmeticFaction];
    const prefix = factionData.prefix;
    
    let availableSlot = 1;
    const usedSlots = setupData.agents.map(agent => {
        if (agent.customSpriteId && agent.customSpriteId.startsWith(prefix)) {
            return parseInt(agent.customSpriteId.replace(prefix, ''));
        }
        return -1;
    });

    while(usedSlots.includes(availableSlot)) {
        availableSlot++;
    }
    
    // Se sforiamo il numero massimo di sprite (es. abbiamo 5 agenti ma solo 4 sprite), ricicliamo.
    if (availableSlot > factionData.count) {
        availableSlot = (availableSlot % factionData.count) || factionData.count;
    }

    const spriteId = `${prefix}${availableSlot}`;

    setupData.agents.push({
        id: crypto.randomUUID(), type: 'agent', faction: currentPlayer,
        sprite: getRandomSprite(SPRITE_POOLS[cosmeticFaction] || SPRITE_POOLS[currentPlayer]),
        customSpriteId: spriteId,
        hp: 1, maxHp: 1, mov: 1, rng: 1, dmg: 1, ap: GAME.AP_PER_TURN, q: 0, r: 0,
        firstTurnImmune: true
    });

    updateSetupUI();
}

function removeAgentFromMarket(index) {
    playSFX('click');
    const agent = setupData.agents[index];
    setupData.points += GAME.AGENT_COST + (agent.hp - 1) + (agent.mov - 1) + (agent.rng - 1) + (agent.dmg - 1);
    setupData.agents.splice(index, 1);
    updateSetupUI();
}

function tuneStat(agentIndex, statId, amount) {
    playSFX('click');
    const agent = setupData.agents[agentIndex];
    if (amount > 0 && setupData.points > 0) {
        agent[statId]++; setupData.points--;
        if (statId === 'hp') agent.maxHp++;
    } else if (amount < 0 && agent[statId] > 1) {
        agent[statId]--; setupData.points++;
        if (statId === 'hp') agent.maxHp--;
    }
    updateSetupUI();
}

/** Costruisce il messaggio di attesa per i giocatori online non ancora pronti */
function buildWaitMessage() {
    const colors = ['', '#00ff88', '#cc00ff', '#00aaff', '#FFD700', '#ff3333', '#ffffff', '#444444', '#ff69b4'];
    const missing = [];
    for (let p = 1; p <= onlineTotalPlayers; p++) {
        if (!playersReady[p]) {
            const color = players[p].color || colors[p];
            missing.push(`<span style="color:${color}">${players[p].name}</span>`);
        }
    }
    return missing.length === 0
        ? 'Tutti pronti! Avvio partita...'
        : `In attesa di: ${missing.join(', ')}`;
}

/** Inietta il toggle AI nella schermata di setup (modalità locale) */
function initAIToggleUI() {
    // Non mostrare il toggle AI in modalità online: i bot si gestiscono dalla lobby host
    if (window.isOnline || window.isCampaignOnline) {
        document.getElementById('ai-toggle-container')?.remove();
        return;
    }

    // Rimuoviamo eventuali toggle precedenti
    document.getElementById('ai-toggle-container')?.remove();

    const aiToggleDiv = document.createElement('div');
    aiToggleDiv.id = 'ai-toggle-container';
    
    // Lo facciamo sembrare un action-btn ma senza i problemi di override CSS
    const pColor = players[currentPlayer]?.color || '#cc00ff';
    aiToggleDiv.style.cssText = `
        margin:0; border: 2px solid ${pColor}; padding: 0 15px; 
        background: rgba(0,0,0,0.3); border-radius: 5px;
        display: flex; align-items: center; justify-content: center;
        color: ${pColor};
    `;
    
    aiToggleDiv.innerHTML = `
        <label style="cursor:pointer; font-size: 18px; font-weight: bold; text-transform: uppercase;
            display: flex; align-items: center; margin: 0; line-height: 1;">
            <span style="font-size: 1.4em; margin-right: 8px; line-height: 1;">🤖</span>
            AI
            <input type="checkbox" id="ai-active" style="transform: scale(1.5); margin-left: 12px;">
        </label>
    `;

    // Lo inseriamo nel footer (accanto a PRONTO)
    const setupFooter = document.getElementById('setup-footer');
    if (setupFooter) {
        setupFooter.appendChild(aiToggleDiv);
    } else {
        const confirmBtn = document.getElementById('confirm-setup-btn');
        if (confirmBtn) confirmBtn.parentNode.insertBefore(aiToggleDiv, confirmBtn);
    }


    // === PRESERVA LO STATO DELL'AI ===
    const checkbox = document.getElementById('ai-active');
    if (checkbox) {
        // Usa la variabile globale usata dal gioco
        checkbox.checked = (typeof window.aiEnabled !== 'undefined') ? window.aiEnabled : false;
        
        checkbox.addEventListener('change', function() {
            window.aiEnabled = this.checked;
            console.log(`[AI Toggle] ${this.checked ? 'ATTIVATA' : 'DISATTIVATA'}`);
        });
    }
}

function confirmPlayerSetup() {
    playSFX('click');
    if (setupData.agents.length === 0) {
    showTemporaryMessage('⚠️ DEVI RECLUTARE ALMENO UN AGENTE!', 3000);
    playSFX('shield'); // Suono opzionale
    return;
}

    // Musica di fazione del giocatore che ha appena confermato (solo umani)
    if (!isAIActive() || currentPlayer === 1) {
        const cosmeticFaction = players[currentPlayer]._cosmeticFaction ?? currentPlayer;
    }

    players[currentPlayer].agents    = JSON.parse(JSON.stringify(setupData.agents));
    players[currentPlayer].cards     = getFinalCardSelection();
    players[currentPlayer].usedCards = {};

    // I punti setup non spesi diventano crediti iniziali nel negozio
    players[currentPlayer].credits   = (players[currentPlayer].credits || 0) + (setupData.points || 0);

    if (isOnline) {
        if (isHost) {
            playersReady[myPlayerNumber] = true;
            const waitMsg = buildWaitMessage();
            document.getElementById('setup-box').innerHTML =
                `<h2 style='color:white;text-align:center'>${waitMsg}</h2>`;
            tryHostStart();
        } else {
            sendOnlineMessage({
                type:             'SETUP_DONE',
                agents:           players[myPlayerNumber].agents,
                cards:            players[myPlayerNumber].cards,
                credits:          players[myPlayerNumber].credits,
                color:            players[myPlayerNumber].color,
                name:             players[myPlayerNumber].name,
                cosmeticFaction:  players[myPlayerNumber]._cosmeticFaction ?? myPlayerNumber,
            });
            const pColor = players[myPlayerNumber].color; // Prende il tuo colore scelto
            document.getElementById('setup-box').innerHTML = `
                <h2 style='color:${pColor}; text-align:center; text-shadow: 0 0 10px ${pColor}'>Setup inviato!<br>
                <span style='font-size:14px; color:#aaa'>Attendi che l'Host avvii la partita...</span></h2>
            `;
        }
    } else {
        if (currentPlayer < totalPlayers) {
            currentPlayer++;
            setupData = freshSetupData();
            cardSelectionData.selected = [];
            updateSetupUI();

            if (isAIActive()) {
                setTimeout(() => {
                    setupData.points = 0;
                    setupData.agents = [];
                    for (let i = 0; i < 4; i++) {
                        const hp = Math.floor(Math.random() * 3) + 3;   // hp: 3–6
                        const aiCosmeticFaction = players[currentPlayer]._cosmeticFaction ?? currentPlayer;
                        const factionData = FACTION_PREFIXES[aiCosmeticFaction];
                        
                        // Assicuriamo di non eccedere il max count
                        const slot = (i % factionData.count) + 1;
                        
                        setupData.agents.push({
                            id: crypto.randomUUID(), type: 'agent', faction: currentPlayer,
                            sprite: getRandomSprite(SPRITE_POOLS[aiCosmeticFaction] || SPRITE_POOLS[currentPlayer]),
                            customSpriteId: `${factionData.prefix}${slot}`,
                            hp, maxHp: hp,
                            mov: Math.floor(Math.random() * 2) + 2,          // mov: 2–3 (invariato)
                            rng: Math.floor(Math.random() * 4) + 3,          // rng: 3–6
                            dmg: Math.floor(Math.random() * 3) + 3,          // dmg: 3–5
                            ap: GAME.AP_PER_TURN, q: 0, r: 0,
                            firstTurnImmune: true
                        });
                    }
                    confirmPlayerSetup();
                }, 800);
            }
        } else {
            startActiveGameLocal();
        }
    }
}

markScriptAsLoaded('setup.js');