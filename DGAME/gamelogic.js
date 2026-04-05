/* ============================================================
   gamelogic.js — Logica di gioco: turni, azioni e vittoria
   ============================================================
   ESPONE: initTimerUI, startTimer, endTurn, resetTurnState,
           updateUI, setActionMode, cancelAction,
           calculateValidMoves, calculateValidBuilds,
           calculateValidTargets, calculateValidHeals,
           handleCanvasClick, handleCanvasHover,
           executeRemoteAction, executeAction,
           handleEntityDeath, checkWinConditions
   DIPENDE DA: constants.js, state.js, graphics.js, map.js,
               multiplayer.js (sendOnlineMessage, isOnline, …),
               ai.js (executeAITurn),
               cards.js (updateIngameCardsUI)
   ============================================================ */


// ============================================================
// HELPER: GUARDIE TURNO
// ============================================================
// Questi helper centralizzano le condizioni che si ripetono in
// endTurn, resetTurnState, handleCanvasClick, executeAction.
// Se la logica cambia (es. nuova modalità spettatore) si tocca
// solo qui.

/** true se il turno corrente è gestito da una AI (locale o online) */
function isCurrentPlayerAI() {
    return (currentPlayer > 1 && isAIActive() && !isOnline)
        || (isOnline && onlineAIFactions.has(currentPlayer));
}

/** true se il giocatore locale può interagire in questo turno */
function canLocalPlayerAct() {
    if (isOnline) return currentPlayer === myPlayerNumber && !onlineAIFactions.has(currentPlayer);
    return !isCurrentPlayerAI();
}

/** true se questo client è l'host e il turno appartiene a una fazione AI */
function isHostAITurn() {
    return isOnline && isHost && onlineAIFactions.has(currentPlayer);
}

// ============================================================
// TIMER TURNO
// ============================================================

function initTimerUI() {
    const commonStyle = `
        position:fixed; font-weight:bold; padding:8px 16px;
        background:rgba(0,0,0,0.85); border:3px solid #fff;
        border-radius:10px; z-index:9999; color:white;
        font-family:'Courier New',monospace; display:none;
        text-shadow:0 0 10px rgba(0,0,0,1);
    `;

    // Timer del turno (destra, accanto al pulsante musica)
    timerUI = document.createElement('div');
    timerUI.id = 'turn-timer-display';
    timerUI.style.cssText = commonStyle + 'top:10px; right:140px; font-size:22px;';
    document.body.appendChild(timerUI);

    // Contatore round (in alto a destra, sotto il timer)
    turnCounterUI = document.createElement('div');
    turnCounterUI.id = 'turn-counter-display';
    turnCounterUI.style.cssText = commonStyle + `
        top:55px; right:10px; font-size:18px; min-width:100px; 
        text-align:center; cursor:pointer; pointer-events:auto;
        transition: all 0.2s ease;
    `;

    turnCounterUI.innerHTML = `
        <div id="round-number" style="font-weight:bold;">ROUND 1</div>
        <div id="turn-hint" style="font-size:10px; opacity:0.7; font-style:italic;">passa turno</div>
    `;

    turnCounterUI.onclick = () => {
        if (canLocalPlayerAct()) {
            endTurn();
        }
    };

    document.body.appendChild(turnCounterUI);
}

/** Aggiorna il colore dei bordi dei widget UI in base alla fazione attiva */
function updateActivePlayerBorders() {
    const activeColor = players[currentPlayer].color;

    const audioBtn = document.getElementById('audio-toggle');
    if (audioBtn) {
        audioBtn.style.borderColor = activeColor;
        audioBtn.style.boxShadow   = `0 0 12px ${activeColor}`;
    }
    if (turnCounterUI) {
        turnCounterUI.style.borderColor = activeColor;
        turnCounterUI.style.boxShadow   = `0 0 12px ${activeColor}`;
    }
}

function startTimer() {
    clearInterval(turnTimerInterval);
    timeLeft = GAME.TURN_TIMER_SEC;
    timerUI.style.display     = 'block';
    if (turnCounterUI) turnCounterUI.style.display = 'block';

    turnTimerInterval = setInterval(() => {
        if (state !== 'PLAYING') return;
        timeLeft--;
        timerUI.innerText          = `⏳ ${timeLeft}s`;
        timerUI.style.borderColor  = players[currentPlayer].color;
        timerUI.style.color        = timeLeft <= 10 ? '#ff3333' : '#fff';
        timerUI.style.boxShadow    = `0 0 15px ${players[currentPlayer].color}`;
        drawGame();
        if (timeLeft <= 0) { clearInterval(turnTimerInterval); autoPassTurn(); }
    }, 1000);
}

// ============================================================
// TURNI
// ============================================================

function endTurn(fromNetwork = false) {
    if (isOnline && currentPlayer !== myPlayerNumber && !fromNetwork && !isHostAITurn()) return;

    playSFX('click');

    if (!fromNetwork) {
        let next = currentPlayer;
        do { next = (next % totalPlayers) + 1; }
        while (next !== currentPlayer && isPlayerEliminated(next));

        currentPlayer = next;
        if (isOnline) sendOnlineMessage({ type: 'END_TURN', nextPlayer: currentPlayer });
    }

    resetTurnState();
    drawGame();
}

function isPlayerEliminated(p) {
    return !players[p].hq && players[p].agents.length === 0;
}

function autoPassTurn() {
    if (state !== 'PLAYING') return;
    if (!canLocalPlayerAct() && !isHostAITurn()) return;
    endTurn();
}

function resetTurnState() {
    selectedAgent      = null;
    currentActionMode  = null;
    validActionTargets = [];

    // Incrementa round quando ricomincia dal Giocatore 1
    if (currentPlayer === 1) {
        turnCount++;
        const roundNumEl = document.getElementById('round-number');
        if (roundNumEl) roundNumEl.innerText = `ROUND ${turnCount}`;
    }
    // Ripristina AP degli agenti del giocatore corrente
    players[currentPlayer].agents.forEach(a => { if (a.hp > 0) a.ap = GAME.AP_PER_TURN; });

    // --- REDDITO CREDITI ---
    // Base viva: +CREDIT_PER_BASE. Ogni CP posseduto: +CREDIT_PER_CP.
    if (players[currentPlayer].hq && players[currentPlayer].hq.hp > 0) {
        let income = GAME.CREDIT_PER_BASE;
        controlPoints.forEach(cp => {
            if (cp.faction === currentPlayer) income += GAME.CREDIT_PER_CP;
        });
        players[currentPlayer].credits = (players[currentPlayer].credits || 0) + income;
        if (typeof showCreditIncome === 'function') showCreditIncome(currentPlayer, income);
    }

    updateUI();
    updateActivePlayerBorders();

    if (state === 'PLAYING') {
        startTimer();
        // AI locale (modalità offline)
        if (isCurrentPlayerAI()) setTimeout(executeAITurn, GAME.AI_DELAY_MS);
    }
}

// ============================================================
// UI CONTROLLI
// ============================================================

function updateUI() {
    const pData       = players[currentPlayer];
    const activeColor = pData.color;

    document.documentElement.style.setProperty('--active-faction-color', activeColor);

    // Blocca i pulsanti se è il turno dell'AI o di un altro giocatore online
    if (turnCounterUI) {
        turnCounterUI.style.opacity = canLocalPlayerAct() ? "1" : "0.5";
    }
    document.getElementById('current-turn-text').innerText = `Turno ${pData.name}`;

    const infoPanel = document.getElementById('selected-agent-info');
    const apDisplay = document.getElementById('action-points-display');
    const msgBoard  = document.getElementById('game-message-board');

    if (selectedAgent && selectedAgent.faction === currentPlayer && selectedAgent.type === 'agent') {
        infoPanel.style.display = 'block';
        document.getElementById('info-hp').innerText  = `${selectedAgent.hp}/${selectedAgent.maxHp}`;
        document.getElementById('info-mov').innerText = selectedAgent.mov;
        document.getElementById('info-rng').innerText = selectedAgent.rng;
        document.getElementById('info-dmg').innerText = selectedAgent.dmg;
        apDisplay.innerText = `AP: ${selectedAgent.ap}/3`;
        msgBoard.innerText  = selectedAgent.ap > 0 ? "Scegli un'azione..." : 'Punti azione esauriti.';
    } else {
        infoPanel.style.display = 'none';
        apDisplay.innerText     = 'AP: --';
        msgBoard.innerText      = 'Seleziona un tuo agente.';
    }

    // Aggiorna display crediti
    const creditsEl = document.getElementById('credits-display');
    if (creditsEl) {
        const cr = players[currentPlayer].credits || 0;
        creditsEl.innerText = `💰 ${cr}`;
        creditsEl.style.color = players[currentPlayer].color;
    }
    if (typeof updateCreditShopBtn === 'function') updateCreditShopBtn();

    const isActiveAgent = !!(selectedAgent && selectedAgent.faction === currentPlayer);
    document.getElementById('btn-move').disabled   =
    document.getElementById('btn-shoot').disabled  = !(isActiveAgent && selectedAgent.ap > 0);
    document.getElementById('btn-build').disabled  =
    document.getElementById('btn-heal').disabled   = !(isActiveAgent && selectedAgent.ap >= 2);

    updateActivePlayerBorders();

    // Pannello carte in-game (definito in cards.js)
    if (typeof updateIngameCardsUI === 'function') updateIngameCardsUI();
}

// ============================================================
// MODALITÀ AZIONE
// ============================================================

function setActionMode(mode) {
    if (!selectedAgent || selectedAgent.ap <= 0) return;
    if (mode === 'build' && selectedAgent.ap < 2) return;

    playSFX('click');
    currentActionMode  = mode;
    validActionTargets = [];

    if      (mode === 'move')  calculateValidMoves();
    else if (mode === 'shoot') calculateValidTargets();
    else if (mode === 'build') calculateValidBuilds();
    else if (mode === 'heal')  calculateValidHeals();

    updateUI();
    drawGame();
}

function cancelAction() {
    playSFX('click');
    currentActionMode  = null;
    validActionTargets = [];
    drawGame();
    updateUI();
}

// ============================================================
// CALCOLO TARGET VALIDI
// ============================================================

function calculateValidMoves() {
    const visited = new Set([getKey(selectedAgent.q, selectedAgent.r)]);
    const queue   = [{ q: selectedAgent.q, r: selectedAgent.r, dist: 0 }];

    while (queue.length > 0) {
        const curr = queue.shift();
        if (curr.dist > 0) validActionTargets.push({ q: curr.q, r: curr.r });
        if (curr.dist < selectedAgent.mov) {
            hexDirections.forEach(dir => {
                const nq   = curr.q + dir.q, nr = curr.r + dir.r;
                const nKey = getKey(nq, nr);
                const nCell = grid.get(nKey);
                if (nCell && !visited.has(nKey) && nCell.type === 'empty' && !nCell.entity) {
                    visited.add(nKey);
                    queue.push({ q: nq, r: nr, dist: curr.dist + 1 });
                }
            });
        }
    }
}

function calculateValidBuilds() {
    hexDirections.forEach(dir => {
        const cell = grid.get(getKey(selectedAgent.q + dir.q, selectedAgent.r + dir.r));
        if (cell && cell.type === 'empty' && !cell.entity)
            validActionTargets.push({ q: cell.q, r: cell.r });
    });
}

function calculateValidTargets() {
    hexDirections.forEach(dir => {
        const path = [];
        for (let d = 1; d <= selectedAgent.rng; d++) {
            const cell = grid.get(getKey(
                selectedAgent.q + dir.q * d,
                selectedAgent.r + dir.r * d
            ));
            if (!cell) break;
            path.push({ q: cell.q, r: cell.r });

            if (cell.type === 'wall' || cell.type === 'barricade') {
                validActionTargets.push(...path.map(p => ({ ...p, isObstacle: true, target: cell })));
                break;
            }
            if (cell.entity) {
                if (cell.entity.faction !== currentPlayer)
                    validActionTargets.push(...path.map(p => ({ ...p, isEnemy: true, target: cell.entity })));
                break;
            }
        }
    });
}

function calculateValidHeals() {
    if (!selectedAgent || selectedAgent.ap < 2) return;
    grid.forEach(cell => {
        if (
            cell.entity &&
            cell.entity.faction === currentPlayer &&
            hexDistance(selectedAgent, cell.entity) <= 1 &&
            cell.entity.hp < cell.entity.maxHp
        ) {
            validActionTargets.push(cell);
        }
    });
}

// ============================================================
// INPUT CANVAS
// ============================================================

function handleCanvasClick(e) {
    if (state !== 'PLAYING') return;
    if (!canLocalPlayerAct()) return;

    const rect = canvas.getBoundingClientRect();
    const hex  = pixelToHex(e.clientX - rect.left, e.clientY - rect.top);
    const cell = grid.get(getKey(hex.q, hex.r));
    if (!cell) return;

    playSFX('click');

    if (currentActionMode) {
        const isTargeted = validActionTargets.some(t => t.q === hex.q && t.r === hex.r);
        if (isTargeted) executeAction(cell);
        else            cancelAction();
        return;
    }

    selectedAgent = cell.entity || null;
    updateUI();
    drawGame();
}

function handleCanvasHover(e) {
    if (state !== 'PLAYING') return;
    const rect = canvas.getBoundingClientRect();
    const hex  = pixelToHex(e.clientX - rect.left, e.clientY - rect.top);
    drawGame();
    drawHex(hex.q, hex.r, null, 'rgba(255,255,255,0.1)', 1);
}

// ============================================================
// ESECUZIONE AZIONI
// ============================================================

/**
 * Esegue un'azione ricevuta dalla rete (multiplayer).
 * Ricostruisce il contesto locale (agente, modalità, target validi)
 * e poi chiama executeAction come se fosse locale.
 */
function executeRemoteAction(data) {
    const sourceCell = grid.get(getKey(data.sQ, data.sR));
    const targetCell = grid.get(getKey(data.tQ, data.tR));
    if (!sourceCell?.entity || !targetCell) return;

    selectedAgent      = sourceCell.entity;
    currentActionMode  = data.mode;
    currentPlayer      = data.actingPlayer;
    validActionTargets = [];

    if      (data.mode === 'move')  calculateValidMoves();
    else if (data.mode === 'shoot') calculateValidTargets();
    else if (data.mode === 'build') calculateValidBuilds();
    else if (data.mode === 'heal')  calculateValidHeals();

    executeAction(targetCell, true);
    cancelAction();
    drawGame();
}

/**
 * Esegue un'azione sul gioco locale.
 * Se fromNetwork=false e siamo online, sincronizza con gli altri.
 */
function executeAction(targetCell, fromNetwork = false) {
    if (isOnline && !fromNetwork && !canLocalPlayerAct() && !isHostAITurn()) return;

    let success    = false;
    let actionCost = 1;
    const originQ  = selectedAgent.q;
    const originR  = selectedAgent.r;

    if (currentActionMode === 'heal') {
        if (selectedAgent.ap < 2) { cancelAction(); return; }
        if (targetCell.entity?.faction === currentPlayer) {
            targetCell.entity.hp = Math.min(targetCell.entity.maxHp, targetCell.entity.hp + 1);
            actionCost = 2; success = true; playSFX('heal');
        }

    } else if (currentActionMode === 'move') {
        playSFX('move');
        grid.get(getKey(selectedAgent.q, selectedAgent.r)).entity = null;
        targetCell.entity  = selectedAgent;
        selectedAgent.q    = targetCell.q;
        selectedAgent.r    = targetCell.r;
        success = true;
        // Controlla se l'agente è entrato su un punto di controllo
        const movedKey = getKey(selectedAgent.q, selectedAgent.r);
        if (controlPoints.has(movedKey)) {
            const cp = controlPoints.get(movedKey);
            if (cp.faction !== selectedAgent.faction) {
                cp.faction = selectedAgent.faction;
                if (typeof showCPCapture === 'function') showCPCapture(selectedAgent);
            }
        }

    } else if (currentActionMode === 'shoot') {
        playSFX('laser');
        const targetData = validActionTargets.find(t => t.q === targetCell.q && t.r === targetCell.r);
        if (targetData || fromNetwork) {
            const actualTarget = targetData ? targetData.target : (targetCell.entity || targetCell);
            actualTarget.hp -= selectedAgent.dmg;
            drawLaserBeam(selectedAgent, targetCell);
            if (actualTarget.hp <= 0) {
                if (targetCell.type === 'wall' || targetCell.type === 'barricade') {
                    targetCell.type = 'empty'; targetCell.hp = 0;
                } else if (actualTarget.type) {
                    handleEntityDeath(actualTarget);
                }
            }
            success = true;
        }

    } else if (currentActionMode === 'build') {
        playSFX('build');
        targetCell.type         = 'barricade';
        targetCell.hp           = 2;
        targetCell.maxHp        = 2;
        targetCell.sprite       = getRandomSprite(SPRITE_POOLS.barricades);
        targetCell.customSpriteId = THEME_BARRICADE_ID;
        success = true; actionCost = 2;
    }

    if (success) {
        if (isOnline && !fromNetwork) {
            sendOnlineMessage({
                type: 'ACTION', tQ: targetCell.q, tR: targetCell.r,
                sQ: originQ, sR: originR, mode: currentActionMode,
                actingPlayer: currentPlayer,
            });
        }
        
        // Sottrae gli AP (lato dati)
        selectedAgent.ap -= actionCost;
        checkWinConditions();

        if (!fromNetwork) {
            // Se è un'azione derivata da una carta (es. card_build per il Fortino)
            if (currentActionMode && currentActionMode.startsWith('card_')) {
                // 1. Svuota i target della vecchia posizione
                validActionTargets = [];

                // 2. Ricalcola i target dalla nuova posizione se necessario
                if (currentActionMode === 'card_move' || currentActionMode === 'card_airdrop') {
                    calculateValidMoves();
                } else if (currentActionMode === 'card_build') {
                    calculateValidBuilds();
                }
                
                // 3. Forza l'aggiornamento grafico senza resettare il currentActionMode
                updateUI();
                drawGame();
            } else {
                // Azione standard: chiude tutto e aggiorna la UI
                cancelAction();
            }
        }
    }
}

function handleEntityDeath(entity) {
    playSFX('explosion');
    grid.get(getKey(entity.q, entity.r)).entity = null;
    if (entity.type === 'agent') {
        const list = players[entity.faction].agents;
        list.splice(list.findIndex(a => a.id === entity.id), 1);
    } else {
        players[entity.faction].hq = null;
    }
}


// ============================================================
// OVERLAY DI FINE PARTITA
// ============================================================

/**
 * Mostra un overlay neon di fine partita al posto del browser alert().
 * @param {string} title   - titolo principale (es. "VITTORIA!")
 * @param {string} message - messaggio secondario
 * @param {string} color   - colore neon (default verde)
 */
function showGameOverlay(title, message, color) {
    color = color || '#00ff88';
    clearInterval(turnTimerInterval);
    if (timerUI)       timerUI.style.display       = 'none';
    if (turnCounterUI) turnCounterUI.style.display  = 'none';

    const overlay = document.createElement('div');
    overlay.id = 'gameover-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(5,5,9,0.97);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Courier New,monospace;text-align:center;padding:20px;';

    const icon = document.createElement('div');
    icon.style.cssText = 'font-size:4em;margin-bottom:20px;';
    icon.innerText = '💥';

    const h1 = document.createElement('h1');
    h1.style.cssText = 'font-size:2.8em;margin-bottom:15px;text-transform:uppercase;color:' + color + ';text-shadow:0 0 20px ' + color + ';';
    h1.innerText = title;

    const p = document.createElement('p');
    p.style.cssText = 'color:#a0a0b0;font-size:1.3em;max-width:600px;margin-bottom:35px;line-height:1.6;';
    p.innerText = message;

    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.style.cssText = 'padding:15px 50px;border:2px solid ' + color + ';color:' + color + ';background:transparent;cursor:pointer;font-weight:bold;font-size:1.2em;text-transform:uppercase;letter-spacing:2px;';
    btn.innerText = 'NUOVA PARTITA';
    btn.onclick   = function() { location.reload(); };

    overlay.appendChild(icon);
    overlay.appendChild(h1);
    overlay.appendChild(p);
    overlay.appendChild(btn);
    document.body.appendChild(overlay);
}

// ============================================================
// VITTORIA
// ============================================================

function checkWinConditions() {
    const stillAlive = [];

    for (let p = 1; p <= totalPlayers; p++) {
        if (players[p]?.hq?.hp > 0) stillAlive.push(p);
    }

    if (stillAlive.length === 1) {
        const winner = players[stillAlive[0]];
        state = 'GAME_OVER';
        setTimeout(() => showGameOverlay(
            'MISSIONE COMPIUTA!',
            `La fazione ${winner.name.toUpperCase()} ha distrutto tutte le basi nemiche.`,
            winner.color
        ), 300);

    } else if (stillAlive.length === 0) {
        state = 'GAME_OVER';
        setTimeout(() => showGameOverlay(
            'ANNIENTAMENTO TOTALE',
            'Nessuna base è rimasta in piedi. La partita termina in pareggio.',
            '#ff3333'
        ), 300);
    }
}
