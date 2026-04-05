/* ============================================================
   gamelogic.js — Logica di gioco: turni, azioni e vittoria
   ============================================================
   ESPONE: initTimerUI, startTimer, endTurn, resetTurnState,
           updateUI, setActionMode, cancelAction,
           calculateValidMoves, calculateValidBuilds,
           calculateValidTargets, calculateValidHeals,
           handleCanvasClick, handleCanvasHover,
           executeRemoteAction, executeAction,
           handleEntityDeath, checkWinConditions,
           registerMoveCalculator, registerTargetCalculator,
           registerActionHandler, registerTurnResetHook,
           registerDrawHook
   DIPENDE DA: constants.js, state.js, graphics.js, map.js,
               multiplayer.js (sendOnlineMessage, isOnline, …),
               ai.js (executeAITurn),
               cards.js (updateIngameCardsUI)

   ── SISTEMA PIPELINE ────────────────────────────────────────
   Invece di sovrascrivere funzioni con il pattern _orig/window.*,
   i moduli registrano handler tramite queste API:

   registerMoveCalculator(fn)
     fn(agent) → array di {q,r} celle raggiungibili, oppure null
     per delegare al calcolo standard. La prima fn che restituisce
     un valore non-null vince.

   registerTargetCalculator(fn)
     fn(agent) → array di target, oppure null per delegare.

   registerActionHandler(mode, fn)
     fn(targetCell, fromNetwork) → { success, actionCost }
     oppure null per delegare al gestore successivo.
     Permette di aggiungere nuove modalità azione (es. 'card_airdrop')
     o di intercettare modalità esistenti (es. 'shoot') senza
     riscrivere executeAction.

   registerTurnResetHook(fn)
     fn() chiamata all'inizio di ogni resetTurnState, prima
     di qualunque logica standard. Utile per pulire buff/debuff.

   registerDrawHook(fn)
     fn() chiamata alla fine di ogni drawGame (via override
     centralizzato). Utile per disegnare effetti extra (scudi, ecc).
   ============================================================ */


// ============================================================
// PIPELINE — registri interni
// ============================================================

const _moveCalculators   = [];   // fn(agent) → targets | null
const _targetCalculators = [];   // fn(agent) → targets | null
const _actionHandlers    = [];   // { mode, fn(targetCell, fromNetwork) → {success,actionCost}|null }
const _turnResetHooks    = [];   // fn()
const _drawHooks         = [];   // fn()

/** Registra un calcolatore di mosse alternativo (es. Infiltrazione). */
function registerMoveCalculator(fn) { _moveCalculators.push(fn); }

/** Registra un calcolatore di target alternativo (es. Cecchino piercing). */
function registerTargetCalculator(fn) { _targetCalculators.push(fn); }

/**
 * Registra un handler per una modalità azione.
 * @param {string|null} mode - modalità specifica ('card_airdrop', 'shoot', …)
 *   oppure null per intercettare tutte le modalità non gestite prima.
 * @param {Function} fn - (targetCell, fromNetwork) → {success, actionCost} | null
 */
function registerActionHandler(mode, fn) { _actionHandlers.push({ mode, fn }); }

/** Registra un hook eseguito all'inizio di ogni resetTurnState. */
function registerTurnResetHook(fn) { _turnResetHooks.push(fn); }

/**
 * Registra un hook eseguito dopo ogni drawGame.
 * Utile per sovrapporre effetti grafici (scudi, aure, ecc.).
 */
function registerDrawHook(fn) { _drawHooks.push(fn); }


// ============================================================
// OVERRIDE CENTRALIZZATO DI drawGame
// ============================================================
// Eseguito una sola volta al caricamento: avvolge drawGame
// in modo che chiami tutti i _drawHooks dopo il rendering base.
// Nessun modulo esterno deve più sovrascrivere drawGame direttamente.

(function _installDrawHookRunner() {
    const _origDraw = window.drawGame;
    window.drawGame = function () {
        _origDraw();
        _drawHooks.forEach(fn => fn());
    };
})();


// ============================================================
// HELPER: GUARDIE TURNO
// ============================================================

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

    timerUI = document.createElement('div');
    timerUI.id = 'turn-timer-display';
    timerUI.style.cssText = commonStyle + 'top:10px; right:140px; font-size:22px;';
    document.body.appendChild(timerUI);

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
    turnCounterUI.onclick = () => { if (canLocalPlayerAct()) endTurn(); };
    document.body.appendChild(turnCounterUI);
}

function updateActivePlayerBorders() {
    const activeColor = players[currentPlayer].color;
    const audioBtn    = document.getElementById('audio-toggle');
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
    timerUI.style.display = 'block';
    if (turnCounterUI) turnCounterUI.style.display = 'block';

    turnTimerInterval = setInterval(() => {
        if (state !== 'PLAYING') return;
        timeLeft--;
        timerUI.innerText         = `⏳ ${timeLeft}s`;
        timerUI.style.borderColor = players[currentPlayer].color;
        timerUI.style.color       = timeLeft <= 10 ? '#ff3333' : '#fff';
        timerUI.style.boxShadow   = `0 0 15px ${players[currentPlayer].color}`;
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

    // 2. Reset standard
    selectedAgent      = null;
    currentActionMode  = null;
    validActionTargets = [];

    if (currentPlayer === 1) {
        turnCount++;
        const roundNumEl = document.getElementById('round-number');
        if (roundNumEl) roundNumEl.innerText = `ROUND ${turnCount}`;
    }

    players[currentPlayer].agents.forEach(a => { if (a.hp > 0) a.ap = GAME.AP_PER_TURN; });

    // 1. Hook di pre-reset (pulizia buff, EMP, ecc.) — registrati da carduse.js
    _turnResetHooks.forEach(fn => fn());

    // --- Reddito crediti ---
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

    if (turnCounterUI) {
        turnCounterUI.style.opacity = canLocalPlayerAct() ? '1' : '0.5';
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

    const creditsEl = document.getElementById('credits-display');
    if (creditsEl) {
        const cr = players[currentPlayer].credits || 0;
        creditsEl.innerText   = `💰 ${cr}`;
        creditsEl.style.color = players[currentPlayer].color;
    }
    if (typeof updateCreditShopBtn === 'function') updateCreditShopBtn();

    const isActiveAgent = !!(selectedAgent && selectedAgent.faction === currentPlayer);
    document.getElementById('btn-move').disabled  =
    document.getElementById('btn-shoot').disabled = !(isActiveAgent && selectedAgent.ap > 0);
    document.getElementById('btn-build').disabled =
    document.getElementById('btn-heal').disabled  = !(isActiveAgent && selectedAgent.ap >= 2);

    updateActivePlayerBorders();

    if (typeof updateIngameCardsUI === 'function') updateIngameCardsUI();
}


// ============================================================
// MODALITÀ AZIONE
// ============================================================

function setActionMode(mode) {
    // Le modalità card_* non richiedono AP per essere attivate
    const isCardMode = mode && mode.startsWith('card_');
    if (!selectedAgent) return;
    if (!isCardMode && selectedAgent.ap <= 0) return;
    if (mode === 'build' && selectedAgent.ap < 2) return;

    playSFX('click');
    currentActionMode  = mode;
    validActionTargets = [];

    if      (mode === 'move')  calculateValidMoves();
    else if (mode === 'shoot') calculateValidTargets();
    else if (mode === 'build') calculateValidBuilds();
    else if (mode === 'heal')  calculateValidHeals();
    else {
        // Modalità custom: cerca un handler registrato che popoli i target.
        // L'handler deve popolare validActionTargets direttamente e poi
        // ritornare qualsiasi valore non-null per segnalare che ha gestito.
        const handler = _actionHandlers.find(h => h.mode === mode);
        if (handler) handler.fn(null, false);
    }

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
    // Controlla prima i calcolatori custom (es. Infiltrazione)
    for (const fn of _moveCalculators) {
        const result = fn(selectedAgent);
        if (result !== null && result !== undefined) {
            validActionTargets.push(...result);
            return;
        }
    }
    // Calcolo standard: BFS entro mov passi su celle empty senza entità
    const visited = new Set([getKey(selectedAgent.q, selectedAgent.r)]);
    const queue   = [{ q: selectedAgent.q, r: selectedAgent.r, dist: 0 }];
    while (queue.length > 0) {
        const curr = queue.shift();
        if (curr.dist > 0) validActionTargets.push({ q: curr.q, r: curr.r });
        if (curr.dist < selectedAgent.mov) {
            hexDirections.forEach(dir => {
                const nq    = curr.q + dir.q, nr = curr.r + dir.r;
                const nKey  = getKey(nq, nr);
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
    // Controlla prima i calcolatori custom (es. Cecchino piercing)
    for (const fn of _targetCalculators) {
        const result = fn(selectedAgent);
        if (result !== null && result !== undefined) {
            validActionTargets.push(...result);
            return;
        }
    }

    let currentRng = selectedAgent.rng;
    const originCell = grid.get(getKey(selectedAgent.q, selectedAgent.r));
    if (originCell && originCell.terrain === 'altura') {
        currentRng += 1;
    }

    // Calcolo standard: raggio di tiro per direzione, prima entità/ostacolo blocca
    hexDirections.forEach(dir => {
        const path = [];
        for (let d = 1; d <= currentRng; d++) {
            const cell = grid.get(getKey(
                selectedAgent.q + dir.q * d,
                selectedAgent.r + dir.r * d
            ));
            if (!cell) break;

            path.push({ q: cell.q, r: cell.r });

            if (cell.type === 'wall' || cell.type === 'barricade') {
                // --- NEBBIA: ostacoli nella nebbia colpibili solo da distanza 1 ---
                if (cell.terrain === 'nebbia' && d > 1) { break; }
                // La barricata/muro nasconde l'agente Spettro: va distrutta prima
                validActionTargets.push(...path.map(p => ({ ...p, isObstacle: true, target: cell })));
                break;
            }
            if (cell.entity) {
                // --- NEBBIA: entità nella nebbia colpibili solo da distanza 1 ---
                if (cell.terrain === 'nebbia' && d > 1) { break; }
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

    // Ripristina i buff al momento dell'azione per garantire calcoli identici all'host
    if (data.agentBuffs) {
        selectedAgent.sniperPierce   = data.agentBuffs.sniperPierce   || false;
        selectedAgent.demoBuff       = data.agentBuffs.demoBuff       || false;
        selectedAgent.infiltrateBuff = data.agentBuffs.infiltrateBuff || false;
        selectedAgent.shielded       = data.agentBuffs.shielded       || 0;
    }

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
 *
 * Scorre gli _actionHandlers registrati in ordine:
 *   - se l'handler ha mode === currentActionMode (o mode === null),
 *     lo chiama con (targetCell, fromNetwork)
 *   - il primo che ritorna { success, actionCost } vince
 *   - se nessuno gestisce, esegue la logica standard delle 4 azioni base
 *
 * Per aggiungere una nuova azione (es. in carduse.js):
 *   registerActionHandler('card_mia_mossa', (targetCell, fromNetwork) => {
 *       // ...logica...
 *       return { success: true, actionCost: 1 };
 *   });
 */
function executeAction(targetCell, fromNetwork = false) {
    if (isOnline && !fromNetwork && !canLocalPlayerAct() && !isHostAITurn()) return;

    const originQ = selectedAgent.q;
    const originR = selectedAgent.r;

    let success    = false;
    let actionCost = 1;
    let handled    = false;

    // --- Handler registrati (carte, meccaniche custom) ---
    for (const handler of _actionHandlers) {
        if (handler.mode !== null && handler.mode !== currentActionMode) continue;
        const result = handler.fn(targetCell, fromNetwork);
        if (result !== null && result !== undefined) {
            success    = result.success    ?? false;
            actionCost = result.actionCost ?? 1;
            handled    = true;
            break;
        }
    }

    // --- Logica standard se nessun handler ha gestito ---
    if (!handled) {
        const stdResult = _executeStandardAction(targetCell, fromNetwork);
        success    = stdResult.success;
        actionCost = stdResult.actionCost;
    }

    if (success) {
        if (isOnline && !fromNetwork) {
            sendOnlineMessage({
                type: 'ACTION', tQ: targetCell.q, tR: targetCell.r,
                sQ: originQ, sR: originR, mode: currentActionMode,
                actingPlayer: currentPlayer,
                // Snapshot buff attivi per garantire calcoli identici sul client
                agentBuffs: {
                    sniperPierce:   selectedAgent.sniperPierce   || false,
                    demoBuff:       selectedAgent.demoBuff       || false,
                    infiltrateBuff: selectedAgent.infiltrateBuff || false,
                    shielded:       selectedAgent.shielded       || 0,
                },
            });
        }

        selectedAgent.ap -= actionCost;
        checkWinConditions();

        if (!fromNetwork) {
            if (currentActionMode && currentActionMode.startsWith('card_')) {
                validActionTargets = [];
                if (currentActionMode === 'card_move' || currentActionMode === 'card_airdrop') {
                    calculateValidMoves();
                } else if (currentActionMode === 'card_build') {
                    // Resta in card_build solo se il fortino ha ancora costruzioni rimaste
                    if (selectedAgent.fortinoActive && selectedAgent.fortinoBuilds > 0) {
                        // Ripopola i target chiamando l'handler con targetCell=null
                        validActionTargets = [];
                        const handler = _actionHandlers.find(h => h.mode === 'card_build');
                        if (handler) handler.fn(null, false);
                    } else {
                        cancelAction();
                        return;
                    }
                }
                updateUI();
                drawGame();
            } else {
                cancelAction();
            }
        }
    }
}

/**
 * Logica delle 4 azioni standard: heal, move, shoot, build.
 * Separata da executeAction per chiarezza.
 * @returns {{ success: boolean, actionCost: number }}
 */
function _executeStandardAction(targetCell, fromNetwork) {
    let success    = false;
    let actionCost = 1;

    if (currentActionMode === 'heal') {
        if (selectedAgent.ap < 2) { cancelAction(); return { success: false, actionCost: 1 }; }
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
            // Se la cella è un ostacolo il target è sempre la struttura,
            // anche in fromNetwork (dove targetData è null) e anche se
            // c'è un agente Spettro infiltrato dentro.
            const actualTarget = (targetCell.type === 'wall' || targetCell.type === 'barricade')
                ? targetCell
                : (targetData ? targetData.target : (targetCell.entity || targetCell));
            
            // --- SCUDO: annulla l'attacco se il bersaglio è protetto ---
            if (actualTarget.shielded) {
                actualTarget.shielded--;
                if (actualTarget.shielded === 0) actualTarget.shielded = null;
                playSpecialVFX(actualTarget, '#00ffff', '🛡️ ATTACCO ANNULLATO!');
                drawLaserBeam(selectedAgent, targetCell);
                success = true;
            } else {
                // --- MODIFICA TERRENI: Calcola danno ridotto ---
                let finalDmg = selectedAgent.dmg;
                if (typeof calculateDamageWithTerrain === 'function') {
                    finalDmg = calculateDamageWithTerrain(selectedAgent.dmg, actualTarget);
                }
                actualTarget.hp -= finalDmg;

                drawLaserBeam(selectedAgent, targetCell);
                if (actualTarget.hp <= 0) {
                    if (targetCell.type === 'wall' || targetCell.type === 'barricade') {
                        targetCell.type = 'empty'; targetCell.hp = 0;
                        // Agente Spettro infiltrato: sopravvive alla barricata distrutta,
                        // ora è esposto sulla cella (che diventa empty con l'entità)
                        // targetCell.entity rimane intatto — l'agente è ancora lì
                    } else if (actualTarget.type) {
                        handleEntityDeath(actualTarget);
                    }
                }
                success = true;
            }
        }

    } else if (currentActionMode === 'build') {
        playSFX('build');
        targetCell.type           = 'barricade';
        targetCell.hp             = GAME.BARRICADE_HP;
        targetCell.maxHp          = GAME.BARRICADE_HP;
        targetCell.sprite         = getRandomSprite(SPRITE_POOLS.barricades);
        targetCell.customSpriteId = THEME_BARRICADE_ID;
        actionCost = 2; success = true;
    }

    return { success, actionCost };
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

function showGameOverlay(title, message, color) {
    color = color || '#00ff88';
    clearInterval(turnTimerInterval);
    if (timerUI)       timerUI.style.display      = 'none';
    if (turnCounterUI) turnCounterUI.style.display = 'none';

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
    btn.onclick   = function () { location.reload(); };

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
    // ── NUOVA CONDIZIONE ─────────────────────────────────────
    // Se in gioco ci sono solo agenti di 1 sola fazione → quella fazione vince
    const factionsWithAgents = [];
    for (let p = 1; p <= totalPlayers; p++) {
        const hasLivingAgent = players[p].agents.some(agent => agent.hp > 0);
        if (hasLivingAgent) {
            factionsWithAgents.push(p);
        }
    }

    if (factionsWithAgents.length === 1) {
        const winner = players[factionsWithAgents[0]];
        state = 'GAME_OVER';
        setTimeout(() => showGameOverlay(
            'ULTIMO REPARTO!',
            `La fazione ${winner.name.toUpperCase()} è l'ultima con agenti operativi.`,
            winner.color
        ), 300);
        return;                    // ← importante: esce subito, non controlla più gli HQ
    }

    // ── CONDIZIONI ORIGINALI (lasciate esattamente come erano) ──
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
