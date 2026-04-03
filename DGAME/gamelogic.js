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
        top:55px; right:10px; font-size:20px;
        min-width:85px; padding:6px 14px; text-align:center;
    `;
    turnCounterUI.innerText = 'ROUND 0';
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
    timeLeft = 60;
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
    const isOnlineAITurn = isOnline && isHost && onlineAIFactions.has(currentPlayer);
    if (isOnline && currentPlayer !== myPlayerNumber && !fromNetwork && !isOnlineAITurn) return;

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
    const isOnlineAITurn = isOnline && isHost && onlineAIFactions.has(currentPlayer);
    if (isOnline && currentPlayer !== myPlayerNumber && !isOnlineAITurn) return;
    endTurn();
}

function resetTurnState() {
    selectedAgent      = null;
    currentActionMode  = null;
    validActionTargets = [];

    // Incrementa round quando ricomincia dal Giocatore 1
    if (currentPlayer === 1) {
        turnCount++;
        if (turnCounterUI) turnCounterUI.innerText = `ROUND ${turnCount}`;
    }

    // Ripristina AP degli agenti del giocatore corrente
    players[currentPlayer].agents.forEach(a => { if (a.hp > 0) a.ap = 3; });

    updateUI();
    updateActivePlayerBorders();

    if (state === 'PLAYING') {
        startTimer();
        // AI locale (modalità offline)
        if (currentPlayer > 1 && isAIActive() && !isOnline) setTimeout(executeAITurn, 1200);
        // AI online: solo l'host esegue le fazioni marcate come AI
        if (isOnline && isHost && onlineAIFactions.has(currentPlayer)) setTimeout(executeAITurn, 1200);
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
    const isAITurn = (currentPlayer > 1 && isAIActive() && !isOnline)
                   || (isOnline && onlineAIFactions.has(currentPlayer));

    document.getElementById('btn-end-turn').disabled =
        isAITurn || (isOnline && currentPlayer !== myPlayerNumber);

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
    if (!isOnline && currentPlayer > 1 && isAIActive()) return;
    if (isOnline && currentPlayer !== myPlayerNumber) return;
    if (isOnline && onlineAIFactions.has(currentPlayer)) return;

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
    const isOnlineAITurn = isOnline && isHost && onlineAIFactions.has(currentPlayer);
    if (isOnline && !fromNetwork && currentPlayer !== myPlayerNumber && !isOnlineAITurn) return;

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
        selectedAgent.ap -= actionCost;
        checkWinConditions();
        if (!fromNetwork) cancelAction();
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
// VITTORIA
// ============================================================

function checkWinConditions() {
    const stillAlive = [];

    for (let p = 1; p <= totalPlayers; p++) {
        if (players[p]?.hq?.hp > 0) stillAlive.push(p);
    }

    if (stillAlive.length === 1) {
        const winnerName = players[stillAlive[0]].name.toUpperCase();
        setTimeout(() => {
            alert(`💥 MISSIONE COMPIUTA!\nLa fazione ${winnerName} vince la partita!`);
            state = 'GAME_OVER';
            clearInterval(turnTimerInterval);
            if (timerUI)       timerUI.style.display      = 'none';
            if (turnCounterUI) turnCounterUI.style.display = 'none';
            location.reload();
        }, 300);

    } else if (stillAlive.length === 0) {
        setTimeout(() => {
            alert('ANNIENTAMENTO TOTALE! Nessuna base è rimasta. Pareggio.');
            location.reload();
        }, 300);
    }
}
