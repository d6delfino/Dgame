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
        7: 'rgba(68,68,68,0.2)',   // Grigio Scuro
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

// Dati di ogni fazione: tutte e 8 le opzioni disponibili.
const _FACTION_DEFS = [
    { slot: 1, name: 'Verde',  color: COLORS.p1, spritePool: SPRITE_POOLS[1] },
    { slot: 2, name: 'Viola',  color: COLORS.p2, spritePool: SPRITE_POOLS[2] },
    { slot: 3, name: 'Blu',    color: COLORS.p3, spritePool: SPRITE_POOLS[3] },
    { slot: 4, name: 'Oro',    color: COLORS.p4, spritePool: SPRITE_POOLS[4] },
    { slot: 5, name: 'Rosso',  color: COLORS.p5, spritePool: SPRITE_POOLS[5] },
    { slot: 6, name: 'Bianco', color: COLORS.p6, spritePool: SPRITE_POOLS[6] },
    { slot: 7, name: 'Grigio', color: COLORS.p7, spritePool: SPRITE_POOLS[7] },
    { slot: 8, name: 'Rosa',   color: COLORS.p8, spritePool: SPRITE_POOLS[8] },
];

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

    players[currentPlayer]._cosmeticFaction = factionSlot;
    players[currentPlayer].color            = def.color;
    players[currentPlayer].name             = def.name;

    // Riassegna gli sprite degli agenti già nel mercato
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

    if (window.isOnline) {

        if (window.isOnline || window.isCampaignOnline) {
        const row = document.getElementById('faction-selector-row');
        if (row) row.remove();
        return; 
        }

        const existingRow = document.getElementById('faction-selector-row');
        if (existingRow) existingRow.remove();
        return; // ESCI SUBITO: nell'online decide l'Host, non i pallini!
    }

    // Rimuovi selettore precedente se esiste
    document.getElementById('faction-selector-row')?.remove();

    const taken   = _getTakenFactions();
    const current = players[currentPlayer]._cosmeticFaction ?? currentPlayer;

    const row = document.createElement('div');
    row.id = 'faction-selector-row';
    row.style.cssText = `
        display:flex; align-items:center; gap:8px;
        margin:10px 0 6px; padding:8px 10px;
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

    // Mostra il nome della fazione corrente accanto ai pallini
    const nameTag = document.createElement('span');
    nameTag.style.cssText = `color:${players[currentPlayer].color}; font-weight:bold; font-size:13px; margin-left:4px;`;
    nameTag.textContent = players[currentPlayer].name.toUpperCase();
    row.appendChild(nameTag);

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
    titleEl.innerText  = `Fase Setup: Fazione ${pData.name}`;
    titleEl.className  = textClass;

    // Aggiorna i punti
    document.getElementById('pts-count').innerText = setupData.points;

    // Aggiorna i bottoni generici nel setup
    box.querySelectorAll('button.action-btn').forEach(b => {
        if (b.id !== 'confirm-setup-btn') {
            b.className = `action-btn ${themeClass}`;
        }
    });
    
    // Aggiorna il bottone di conferma finale
    const confirmBtn = document.getElementById('confirm-setup-btn');
    confirmBtn.className = `action-btn ${themeClass}`;
    confirmBtn.style.borderColor = pData.color;
    confirmBtn.style.color = pData.color;

    renderFactionSelector();
    renderAgentMarket();
    initCardSelectionUI();
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

        const topRow = document.createElement('div');
        topRow.style.display = 'flex';
        topRow.style.justifyContent = 'space-between';
        topRow.style.alignItems = 'center';
        topRow.style.marginBottom = '12px';
        topRow.style.paddingBottom = '8px';
        topRow.style.borderBottom = '1px solid rgba(255,255,255,0.1)';

        const pColor = players[currentPlayer].color;

        // Slot corrente (es: se è "EUR3", diventa 3)
        const currentSlot = agent.customSpriteId && agent.customSpriteId.startsWith(prefix)
            ? parseInt(agent.customSpriteId.replace(prefix, ''))
            : 1;

        function buildSpriteContent(slot) {
            const id  = `${prefix}${slot}`;
            const url = customSpriteFiles[id];
            if (url) {
                return `<img src="${url}"
                    style="width:44px;height:44px;object-fit:contain;display:block;pointer-events:none;"
                    onerror="this.style.display='none'">`;
            }
            return `<span style="font-size:32px;line-height:1;">${agent.sprite}</span>`;
        }

        const btnStyle = `background:none;border:none;color:${pColor};font-size:24px;
            cursor:pointer;padding:0 5px;line-height:1;`;

        const pickerDiv  = document.createElement('div');
        pickerDiv.style.cssText = 'display:flex;align-items:center;gap:2px;';

        const prevBtn = document.createElement('button');
        prevBtn.style.cssText = btnStyle; prevBtn.innerHTML = '&#8249;';

        const spriteWrap = document.createElement('div');
        spriteWrap.style.cssText = `width:50px;height:50px;display:flex;align-items:center;
            justify-content:center;cursor:pointer;border-radius:6px;border:2px solid ${pColor}55;`;
        spriteWrap.innerHTML = buildSpriteContent(currentSlot);

        const nextBtn = document.createElement('button');
        nextBtn.style.cssText = btnStyle; nextBtn.innerHTML = '&#8250;';

        function applySlot(slot) {
            agent.customSpriteId = `${prefix}${slot}`;
            spriteWrap.innerHTML = buildSpriteContent(slot);
        }

        prevBtn.onclick = (e) => {
            e.stopPropagation();
            const cur = parseInt(agent.customSpriteId.replace(prefix, '')) || 1;
            applySlot(cur <= 1 ? maxSprites : cur - 1);
        };
        nextBtn.onclick = (e) => {
            e.stopPropagation();
            const cur = parseInt(agent.customSpriteId.replace(prefix, '')) || 1;
            applySlot(cur >= maxSprites ? 1 : cur + 1);
        };
        spriteWrap.onclick = (e) => { e.stopPropagation(); nextBtn.click(); };

        pickerDiv.appendChild(prevBtn);
        pickerDiv.appendChild(spriteWrap);
        pickerDiv.appendChild(nextBtn);

        const agentInfo = document.createElement('div');
        agentInfo.style.cssText = 'display:flex;align-items:center;gap:12px;';
        agentInfo.appendChild(pickerDiv);

        const namePart = document.createElement('div');
        namePart.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;';
        namePart.innerHTML = `
            <div style="width:12px;height:12px;border-radius:50%;background:${pColor};
                        margin-bottom:4px;box-shadow:0 0 8px ${pColor}"></div>
            <div style="font-weight:bold;font-size:15px;color:#fff;">Op. ${index + 1}</div>`;
        agentInfo.appendChild(namePart);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'action-btn';
        removeBtn.style.cssText = 'border-color:#522;color:#f88;padding:6px 12px;font-size:11px;cursor:pointer;';
        removeBtn.textContent = 'RIMUOVI';
        removeBtn.onclick = () => removeAgentFromMarket(index);

        topRow.appendChild(agentInfo);
        topRow.appendChild(removeBtn);
        card.appendChild(topRow);

        const statsConfig = document.createElement('div');
        statsConfig.className = 'agent-stats-config';

        const statTypes = [
            { id: 'hp',  label: 'Vita',   max: 5 }, { id: 'mov', label: 'Passi',  max: 3 },
            { id: 'rng', label: 'Tiro',   max: 9 }, { id: 'dmg', label: 'Danno',  max: 4 },
        ];

        statTypes.forEach(stat => {
            const item = document.createElement('div');
            item.className = 'stat-config-item';
            item.style.flex = '1'; item.style.justifyContent = 'space-evenly';
            item.innerHTML = `
                <span class="stat-label">${stat.label}</span>
                <button class="stat-btn" onclick="tuneStat(${index},'${stat.id}',-1)" ${agent[stat.id] <= 1 ? 'disabled' : ''}>-</button>
                <span class="stat-value">${agent[stat.id]}</span>
                <button class="stat-btn" onclick="tuneStat(${index},'${stat.id}',1)" ${agent[stat.id] >= stat.max || setupData.points <= 0 ? 'disabled' : ''}>+</button>
            `;
            statsConfig.appendChild(item);
        });
        card.appendChild(statsConfig);
        container.appendChild(card);
    });
}


function addNewAgentToMarket() {
    if (setupData.agents.length >= 4) return alert('Massimo 4 agenti.');
    if (setupData.points < GAME.AGENT_COST) return alert('Punti insufficienti.');

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
    const colors = ['', '#00ff88', '#cc00ff', '#00aaff', '#FFD700'];
    const missing = [];
    for (let p = 1; p <= onlineTotalPlayers; p++) {
        if (!playersReady[p])
            missing.push(`<span style="color:${colors[p]}">${players[p].name}</span>`);
    }
    return missing.length === 0
        ? 'Tutti pronti! Avvio partita...'
        : `In attesa di: ${missing.join(', ')}`;
}

/** Inietta il toggle AI nella schermata di setup (modalità locale) */
function initAIToggleUI() {
    const setupBox    = document.getElementById('setup-box');
    const aiToggleDiv = document.createElement('div');
    aiToggleDiv.style.cssText = `
        margin:15px 0; text-align:center; border:1px solid #444;
        padding:10px; background:rgba(0,0,0,0.3); border-radius:5px;
    `;
    aiToggleDiv.innerHTML = `
        <label style="color:var(--p2-neon);cursor:pointer;font-size:16px;font-weight:bold;
            display:flex;align-items:center;justify-content:center;">
            <input type="checkbox" id="ai-active" style="transform:scale(1.5);margin-right:12px;">
            MODALITÀ IA (CPU per tutti i bot) ATTIVA
        </label>
    `;
    setupBox.insertBefore(aiToggleDiv, document.getElementById('confirm-setup-btn'));
}

function confirmPlayerSetup() {
    playSFX('click');
    if (setupData.agents.length === 0) return alert('Devi reclutare almeno un agente.');

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
                    for (let i = 0; i < 3; i++) {
                        const hp = Math.floor(Math.random() * 4) + 2;
                        const aiCosmeticFaction = players[currentPlayer]._cosmeticFaction ?? currentPlayer;
                        const factionData = FACTION_PREFIXES[aiCosmeticFaction];
                        
                        // Assicuriamo di non eccedere il max count
                        const slot = (i % factionData.count) + 1;
                        
                        setupData.agents.push({
                            id: crypto.randomUUID(), type: 'agent', faction: currentPlayer,
                            sprite: getRandomSprite(SPRITE_POOLS[aiCosmeticFaction] || SPRITE_POOLS[currentPlayer]),
                            customSpriteId: `${factionData.prefix}${slot}`,
                            hp, maxHp: hp,
                            mov: Math.floor(Math.random() * 2) + 2,
                            rng: Math.floor(Math.random() * 3) + 2,
                            dmg: Math.floor(Math.random() * 4) + 1,
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
