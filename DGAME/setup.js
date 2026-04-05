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
    const themes = { 1: 'p1-theme', 2: 'p2-theme', 3: 'p3-theme', 4: 'p4-theme' };
    const texts  = { 1: 'text-p1',  2: 'text-p2',  3: 'text-p3',  4: 'text-p4'  };
    const glows  = {
        1: 'rgba(0,255,136,0.2)', 2: 'rgba(204,0,255,0.2)',
        3: 'rgba(0,170,255,0.2)', 4: 'rgba(255,215,0,0.2)',
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

    // Recuperiamo il tema in modo sicuro (corregge anche un piccolo bug del codice originale)
    const pTheme = getPlayerTheme(currentPlayer);

    setupData.agents.forEach((agent, index) => {
        const card = document.createElement('div');
        card.className = `market-agent-card ${pTheme.themeClass}`;
        
        // TRUCCO: Sovrascriviamo la griglia CSS impostando display su block via JS.
        // In questo modo il layout funziona perfettamente SENZA toccare style.css!
        card.style.display = 'block'; 

        // --- 1. RIGA SUPERIORE: Immagine, Nome e Tasto Rimuovi ---
        const topRow = document.createElement('div');
        topRow.style.display = 'flex';
        topRow.style.justifyContent = 'space-between';
        topRow.style.alignItems = 'center';
        topRow.style.marginBottom = '12px';
        topRow.style.paddingBottom = '8px';
        topRow.style.borderBottom = '1px solid rgba(255,255,255,0.1)';
        
        let spriteHtml = `<span class="sprite-preview" style="margin:0; font-size:32px;">${agent.sprite}</span>`;
        if (agent.customSpriteId && customSpriteFiles[agent.customSpriteId]) {
            spriteHtml = `<img src="${customSpriteFiles[agent.customSpriteId]}" 
                style="width:38px;height:38px;object-fit:contain;"
                onerror="this.outerHTML='<span class=\\'sprite-preview\\' style=\\'margin:0;font-size:32px;\\'>${agent.sprite}</span>'">`;
        }

        topRow.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px;">
                ${spriteHtml}
                <div style="display:flex; flex-direction:column; align-items:flex-start;">
                    <div style="width:12px; height:12px; border-radius:50%; background:${players[currentPlayer].color}; margin-bottom:4px; box-shadow:0 0 8px ${players[currentPlayer].color}"></div>
                    <div style="font-weight:bold; font-size:15px; color:#fff;">Op. ${index + 1}</div>
                </div>
            </div>
            <button class="action-btn" 
                style="border-color:#522; color:#f88; padding:6px 12px; font-size:11px; cursor:pointer;"
                onclick="removeAgentFromMarket(${index})">
                RIMUOVI
            </button>
        `;
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
            updateSetupUI();

            if (isAIActive()) {
                // Auto-genera il setup per il giocatore AI
                setTimeout(() => {
                    setupData.points = 0;
                    setupData.agents = [];
                    for (let i = 0; i < 3; i++) {
                        const hp           = Math.floor(Math.random() * 4) + 1;
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
