/* ============================================================
   setup.js — Fase di setup: mercato agenti e configurazione stats
   ============================================================
   ESPONE: getPlayerTheme, updateSetupUI, renderAgentMarket,
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
    return { themeClass: themes[pNum], textClass: texts[pNum], glow: glows[pNum] };
}

function updateSetupUI() {
    const pNum = currentPlayer;
    const { themeClass, textClass, glow } = getPlayerTheme(pNum);
    const box = document.getElementById('setup-box');

    box.style.display  = 'flex';
    box.className      = themeClass;
    box.style.boxShadow = `0 0 30px ${glow}`;

    document.getElementById('setup-title').innerText  = `Fase Setup: Fazione ${players[pNum].name}`;
    document.getElementById('setup-title').className  = textClass;
    document.getElementById('pts-count').innerText    = setupData.points;

    box.querySelectorAll('button.action-btn').forEach(b => {
        if (b.id !== 'confirm-setup-btn') b.className = `action-btn ${themeClass}`;
    });
    document.getElementById('confirm-setup-btn').className = `action-btn ${themeClass}`;

    renderAgentMarket();
    initCardSelectionUI();
}

function renderAgentMarket() {
    const container = document.getElementById('agents-market');
    container.innerHTML = '';

    const pTheme = getPlayerTheme(currentPlayer);
    const SPRITES_PER_FACTION = 4;

    setupData.agents.forEach((agent, index) => {
        const card = document.createElement('div');
        card.className = `market-agent-card ${pTheme.themeClass}`;
        card.style.display = 'block';

        // --- 1. RIGA SUPERIORE: Picker sprite, Nome, Tasto Rimuovi ---
        const topRow = document.createElement('div');
        topRow.style.display = 'flex';
        topRow.style.justifyContent = 'space-between';
        topRow.style.alignItems = 'center';
        topRow.style.marginBottom = '12px';
        topRow.style.paddingBottom = '8px';
        topRow.style.borderBottom = '1px solid rgba(255,255,255,0.1)';

        const pColor       = players[currentPlayer].color;
        const spriteOffset = (currentPlayer - 1) * SPRITES_PER_FACTION;

        // Slot corrente (1-4) ricavato dall'ID assegnato all'agente
        const currentSlot = agent.customSpriteId
            ? parseInt(agent.customSpriteId.replace('AG', '')) - spriteOffset
            : 1;

        // Restituisce l'HTML visivo per lo slot dato (immagine o emoji fallback)
        function buildSpriteContent(slot) {
            const id  = `AG${slot + spriteOffset}`;
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

        // Picker: ‹ [immagine] ›
        const pickerDiv  = document.createElement('div');
        pickerDiv.style.cssText = 'display:flex;align-items:center;gap:2px;';

        const prevBtn = document.createElement('button');
        prevBtn.style.cssText = btnStyle;
        prevBtn.innerHTML = '&#8249;';
        prevBtn.title = 'Sprite precedente';

        const spriteWrap = document.createElement('div');
        spriteWrap.style.cssText = `width:50px;height:50px;display:flex;align-items:center;
            justify-content:center;cursor:pointer;border-radius:6px;
            border:2px solid ${pColor}55;`;
        spriteWrap.title = 'Clicca per cambiare sprite';
        spriteWrap.innerHTML = buildSpriteContent(currentSlot);

        const nextBtn = document.createElement('button');
        nextBtn.style.cssText = btnStyle;
        nextBtn.innerHTML = '&#8250;';
        nextBtn.title = 'Sprite successivo';

        // Aggiorna customSpriteId sull'agente e ridisegna il wrap
        function applySlot(slot) {
            agent.customSpriteId = `AG${slot + spriteOffset}`;
            spriteWrap.innerHTML = buildSpriteContent(slot);
        }

        prevBtn.onclick = (e) => {
            e.stopPropagation();
            const cur  = parseInt(agent.customSpriteId.replace('AG', '')) - spriteOffset;
            applySlot(cur <= 1 ? SPRITES_PER_FACTION : cur - 1);
        };
        nextBtn.onclick = (e) => {
            e.stopPropagation();
            const cur  = parseInt(agent.customSpriteId.replace('AG', '')) - spriteOffset;
            applySlot(cur >= SPRITES_PER_FACTION ? 1 : cur + 1);
        };
        spriteWrap.onclick = (e) => { e.stopPropagation(); nextBtn.click(); };

        pickerDiv.appendChild(prevBtn);
        pickerDiv.appendChild(spriteWrap);
        pickerDiv.appendChild(nextBtn);

        // Parte sinistra: picker + nome agente
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

        // Pulsante rimuovi
        const removeBtn = document.createElement('button');
        removeBtn.className = 'action-btn';
        removeBtn.style.cssText = 'border-color:#522;color:#f88;padding:6px 12px;font-size:11px;cursor:pointer;';
        removeBtn.textContent = 'RIMUOVI';
        removeBtn.onclick = () => removeAgentFromMarket(index);

        topRow.appendChild(agentInfo);
        topRow.appendChild(removeBtn);
        card.appendChild(topRow);

        // --- 2. RIGA INFERIORE: Configurazione Statistiche ---
        const statsConfig = document.createElement('div');
        statsConfig.className = 'agent-stats-config';

        const statTypes = [
            { id: 'hp',  label: 'Vita',   max: 5 },
            { id: 'mov', label: 'Passi',  max: 3 },
            { id: 'rng', label: 'Tiro',   max: 9 },
            { id: 'dmg', label: 'Danno',  max: 4 },
        ];

        statTypes.forEach(stat => {
            const item = document.createElement('div');
            item.className = 'stat-config-item';
            item.style.flex = '1';
            item.style.justifyContent = 'space-evenly';
            item.innerHTML = `
                <span class="stat-label">${stat.label}</span>
                <button class="stat-btn" onclick="tuneStat(${index},'${stat.id}',-1)"
                    ${agent[stat.id] <= 1 ? 'disabled' : ''}>-</button>
                <span class="stat-value">${agent[stat.id]}</span>
                <button class="stat-btn" onclick="tuneStat(${index},'${stat.id}',1)"
                    ${agent[stat.id] >= stat.max || setupData.points <= 0 ? 'disabled' : ''}>+</button>
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

    const spriteOffset = (currentPlayer - 1) * 4;
    
    // ---------------------------------------------------------
    // NUOVA LOGICA: Trova il primo slot libero (da 1 a 4)
    // ---------------------------------------------------------
    let availableSlot = 1;
    // Creiamo una lista degli slot (1, 2, 3 o 4) attualmente occupati dai tuoi agenti
    const usedSlots = setupData.agents.map(agent => {
        // Estraiamo il numero base (es: da "AG5" diventa 1 per il P2)
        if (agent.customSpriteId) {
            return parseInt(agent.customSpriteId.replace('AG', '')) - spriteOffset;
        }
        return -1;
    });

    // Cerchiamo il primo numero da 1 a 4 che NON è nella lista degli occupati
    while(usedSlots.includes(availableSlot)) {
        availableSlot++;
    }

    // Ora assegnamo l'ID corretto, riempiendo il "buco" lasciato da quello rimosso
    const spriteId = `AG${availableSlot + spriteOffset}`;
    // ---------------------------------------------------------

    setupData.agents.push({
        id: crypto.randomUUID(), type: 'agent', faction: currentPlayer,
        sprite: getRandomSprite(SPRITE_POOLS[currentPlayer]),
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
                type:   'SETUP_DONE',
                agents: players[myPlayerNumber].agents,
                cards:  players[myPlayerNumber].cards,
                credits: players[myPlayerNumber].credits,
            });
            document.getElementById('setup-box').innerHTML = `
                <h2 style='color:white;text-align:center'>Setup inviato!<br>
                <span style='font-size:14px;color:#aaa'>Attendi che l'Host avvii la partita...</span></h2>
            `;
        }
    } else {
        if (currentPlayer < totalPlayers) {
            currentPlayer++;
            setupData = freshSetupData();
            cardSelectionData.selected = [];
            updateSetupUI();

            if (isAIActive()) {
                // Auto-genera il setup per il giocatore AI
                setTimeout(() => {
                    setupData.points = 0;
                    setupData.agents = [];
                    for (let i = 0; i < 3; i++) {
                        const hp           = Math.floor(Math.random() * 4) + 2;
                        const spriteOffset = (currentPlayer - 1) * 4;
                        setupData.agents.push({
                            id: crypto.randomUUID(), type: 'agent', faction: currentPlayer,
                            sprite: getRandomSprite(SPRITE_POOLS[currentPlayer]),
                            customSpriteId: `AG${i + 1 + spriteOffset}`,
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
