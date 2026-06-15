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
           registerDrawHook, registerDamageModifier
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
     del reset AP. Utile per pulire buff/debuff (es. EMP che
     sottrae AP PRIMA che vengano ripristinati).

   registerDrawHook(fn)
     fn() chiamata alla fine di ogni drawGame (via override
     centralizzato). Utile per disegnare effetti extra (scudi, ecc).

   registerDamageModifier(fn)
     fn(dmg, target) → number
     Chiamata in catena su ogni bersaglio prima di applicare i danni.
     Ritornare 0 azzera il danno (es. scudo, immunità).
     Ritornare un numero ridotto applica resistenza (es. copertura).
     Il valore non può scendere sotto 0 — è clampato automaticamente.
     I moduli si registrano autonomamente senza toccare questo file:
       // In carduse.js:
       registerDamageModifier((dmg, target) => { ... return newDmg; });
       // In terreni.js:
       registerDamageModifier((dmg, target) => { ... return newDmg; });
   ============================================================ */

// ============================================================
// PIPELINE — registri interni
// ============================================================

const _moveCalculators   = [];   // fn(agent) → targets | null
const _targetCalculators = [];   // fn(agent) → targets | null
const _actionHandlers    = [];   // { mode, fn(targetCell, fromNetwork) → {success,actionCost}|null }
const _turnResetHooks    = [];   // fn()
const _drawHooks         = [];   // fn()
const _damageModifiers   = [];   // fn(dmg, target) → number

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

/** Registra un hook eseguito all'inizio di ogni resetTurnState,
 *  PRIMA del reset AP. Utile per EMP e altri debuff che modificano l'AP. */
function registerTurnResetHook(fn) { _turnResetHooks.push(fn); }

/**
 * Registra un hook eseguito dopo ogni drawGame.
 * Utile per sovrapporre effetti grafici (scudi, aure, ecc.).
 */
function registerDrawHook(fn) { _drawHooks.push(fn); }

/**
 * Registra un modificatore di danno nella pipeline di combattimento.
 *
 * La funzione viene chiamata in catena su ogni bersaglio dentro
 * resolveCombatDamage, nell'ordine in cui è stata registrata.
 *
 * @param {Function} fn  fn(dmg, target) → number
 *   - dmg:    danno corrente (già modificato dai modifiers precedenti)
 *   - target: l'entità o la cella bersaglio
 *   - ritorna il danno finale (0 = blocca completamente il danno,
 *     ma la catena continua per permettere effetti visivi successivi)
 *
 * Esempio di uso in carduse.js o terreni.js:
 *   registerDamageModifier((dmg, target) => {
 *       if (!target.shielded) return dmg;
 *       target.shielded--;
 *       playSpecialVFX(target, '#00ffff', '🛡️ ATTACCO ANNULLATO!');
 *       return 0;
 *   });
 */
function registerDamageModifier(fn) { _damageModifiers.push(fn); }


// ============================================================
// OVERRIDE CENTRALIZZATO DI drawGame
// ============================================================
// Eseguito una sola volta al caricamento: avvolge drawGame
// in modo che chiami tutti i _drawHooks dopo il rendering base.
// Nessun modulo esterno deve più sovrascrivere drawGame direttamente.


// ============================================================
// HELPER: GUARDIE TURNO
// ============================================================

/** true se il turno corrente è gestito da una AI (locale o online) */
function isCurrentPlayerAI() {
    return (currentPlayer > 1 && isAIActive() && !isOnline)
        || (isOnline && onlineAIFactions.has(currentPlayer))
        || (typeof coopState !== 'undefined' && coopState.active && currentPlayer === COOP.MONSTER_FACTION);
}

/** true se il giocatore locale può interagire in questo turno */
function canLocalPlayerAct() {
    if (isOnline) return currentPlayer === myPlayerNumber && !onlineAIFactions.has(currentPlayer);
    return !isCurrentPlayerAI();
}

/** true se questo client è l'host e il turno appartiene a una fazione AI */
function isHostAITurn() {
    return isOnline && isHost && (
        onlineAIFactions.has(currentPlayer) ||
        (typeof coopState !== 'undefined' && coopState.active && currentPlayer === COOP.MONSTER_FACTION)
    );
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
        top:5px; left:50%; transform:translateX(-50%);
        text-align:center; cursor:pointer; pointer-events:auto;
        transition: all 0.2s ease;
    `;

    timerUI = document.createElement('div');
    timerUI.id = 'turn-timer-display';
    timerUI.style.cssText = commonStyle;
    
    // Creiamo la struttura interna: Timer in alto, Round e testo al centro/basso
    timerUI.innerHTML = `
        <div id="timer-seconds" style="font-size:22px; margin-bottom:2px;">⏳ --s</div>
        <div id="round-number" style="font-size:12px; color:#aaa;">PASSA TURNO 1</div>        
    `;

    // Cliccando sul timer, si passa il turno (se si ha il permesso)
    timerUI.onclick = () => { 
        if (canLocalPlayerAct()) endTurn(); 
    };
    
    document.body.appendChild(timerUI);

    // Rimuoviamo i riferimenti al vecchio bottone dei round
    turnCounterUI = null;
}

function updateActivePlayerBorders() {
    const surrenderBtn = document.getElementById('btn-surrender');
    if (surrenderBtn) {
        const localPlayer = isOnline ? myPlayerNumber : currentPlayer;
        const isOfflineAITurn = !isOnline && isCurrentPlayerAI();
        const canSurrender = state === 'PLAYING' && !isPlayerEliminated(localPlayer) && !isOfflineAITurn;
        surrenderBtn.style.display     = canSurrender ? 'block' : 'none';
        surrenderBtn.style.borderColor = players[localPlayer]?.color || '#ffffff';
        surrenderBtn.style.color       = players[localPlayer]?.color || '#ffffff';
    }
    
    const activeColor = players[currentPlayer].color;
    const audioBtn    = document.getElementById('audio-toggle');
    if (audioBtn) {
        audioBtn.style.borderColor = activeColor;
        audioBtn.style.boxShadow   = `0 0 12px ${activeColor}`;
    }
    // Aggiorniamo i bordi del timer
    if (timerUI) {
        timerUI.style.borderColor = activeColor;
        timerUI.style.boxShadow   = `0 0 15px ${activeColor}`;
        // Rendiamo il timer "spento" se non è il nostro turno
        timerUI.style.opacity = canLocalPlayerAct() ? '1' : '0.5';
    }
}

function startTimer() {
    clearInterval(turnTimerInterval);
    timeLeft = GAME.TURN_TIMER_SEC;
    if (timerUI) {
        timerUI.style.display = (state === 'PLAYING') ? 'block' : 'none';
    }

    turnTimerInterval = setInterval(() => {
        // --- SICUREZZA: se non stiamo giocando, ferma il timer e nascondilo ---
        if (state !== 'PLAYING') {
            clearInterval(turnTimerInterval);
            if (timerUI) timerUI.style.display = 'none';
            return;
        }
        timeLeft--;
        
        // Aggiorniamo solo il div interno dei secondi
        const secDiv = document.getElementById('timer-seconds');
        if (secDiv) {
            secDiv.innerText = `⏳ ${timeLeft}s`;
            secDiv.style.color = timeLeft <= 10 ? '#ff3333' : '#fff';
        }
        
        drawGame();
        if (timeLeft <= 0) { clearInterval(turnTimerInterval); autoPassTurn(); }
    }, 1000);
}


// ============================================================
// TURNI
// ============================================================

function endTurn(fromNetwork = false, forceHost = false) {
    // Se sono online e sono un client, e sto cercando di passare il turno manualmente
    if (isOnline && !isHost && !fromNetwork) {
        // Verifica che sia effettivamente il mio turno prima di chiedere
        if (currentPlayer === myPlayerNumber) {
            playSFX('click');
            console.log("[Network] Richiesta fine turno inviata all'Host...");
            sendOnlineMessage({ type: 'END_TURN_REQUEST', fromPlayer: myPlayerNumber });
        }
        return; // IMPORTANTE: Il client NON cambia currentPlayer qui. Aspetta l'Host.
    }

    // Se sono l'Host o in modalità locale, procedo al calcolo
    if (!isOnline || isHost || fromNetwork) {
        if (!fromNetwork) playSFX('click');

        // Solo l'Host (o il gioco locale) calcola il giocatore successivo
        if (!fromNetwork) {
            let next = currentPlayer;
            do { 
                next = (next % totalPlayers) + 1; 
            } while (next !== currentPlayer && isPlayerEliminated(next));

            currentPlayer = next;

            if (isOnline && isHost) {
                // L'Host comunica a tutti chi è il nuovo giocatore di turno
                broadcastToClients({ type: 'TURN_CHANGED', nextPlayer: currentPlayer });
                // Invia sync completo per sicurezza
                setTimeout(() => {
                    if (typeof hostBroadcastTurnSync === 'function') hostBroadcastTurnSync();
                }, 300);
            }
        } else {
            // Se arriva da rete (Client riceve l'ordine dall'Host)
            // currentPlayer è già stato aggiornato dal messaggio ricevuto
        }

        resetTurnState();
        drawGame();
    }
}

function isPlayerEliminated(p) {
    // La fazione mostri (coop) non ha HQ ma non va mai considerata eliminata
    if (typeof coopState !== 'undefined' && coopState.active && p === COOP.MONSTER_FACTION) return false;
    return !players[p].hq && players[p].agents.length === 0;
}

function autoPassTurn() {
    if (state !== 'PLAYING') return;
    
    if (isOnline && isHost) {
        // L'Host forza SEMPRE il cambio turno se il timer scade, scavalcando la sicurezza
        endTurn(false, true); 
    } else if (canLocalPlayerAct() || isHostAITurn()) {
        endTurn();
    }
}

function resetTurnState() {
    // ── FASE 1: Pulizia stato UI ─────────────────────────────
    // Sempre prima di tutto: azzera la selezione corrente e
    // i target evidenziati, così i hook successivi partono puliti.
    selectedAgent      = null;
    currentActionMode  = null;
    validActionTargets = [];
    if (typeof closeCreditShop === 'function') closeCreditShop();

    // ── FASE 2: Hook di inizio turno (buff/debuff delle carte) ──
    // Eseguiti PRIMA del reset AP perché alcuni hook (es. EMP in
    // carduse.js) devono sottrarre AP dal valore che sta PER essere
    // ripristinato — in questo modo il giocatore parte già con AP
    // ridotti, che è il comportamento voluto.
    _turnResetHooks.forEach(fn => fn());

    // ── FASE 3: Ripristino AP agenti ─────────────────────────
    // Avviene DOPO gli hook così EMP & co. possono modificare a.ap
    // prima che venga sovrascritto con GAME.AP_PER_TURN.
    players[currentPlayer].agents.forEach(a => { if (a.hp > 0) a.ap = a._isBoss ? COOP.BOSS_AP : GAME.AP_PER_TURN; });

    // ── FASE 4: Rimozione immunità primo turno ───────────────
    // Appena tocca a questo giocatore, i suoi agenti e il suo HQ
    // diventano vulnerabili agli attacchi.
    players[currentPlayer].agents.forEach(a => { a.firstTurnImmune = false; });
    if (players[currentPlayer].hq) {
        players[currentPlayer].hq.firstTurnImmune = false;
    }

    // ── FASE 5: Contatore round e reddito crediti ────────────
    // turnCount viene incrementato solo quando tocca al primo
    // giocatore del round. Al primissimo resetTurnState vale 0,
    // quindi il turno inaugurale non genera reddito (i crediti
    // iniziali arrivano già dal setup).
  
    // Se il primo giocatore del round è stato eliminato, passa il "gettone contatore"
    // al giocatore successivo ancora vivo, così turnCount continua ad avanzare.
    if (isPlayerEliminated(_firstPlayerOfGame)) {
        for (let p = 1; p <= totalPlayers; p++) {
            const candidate = ((_firstPlayerOfGame - 1 + p) % totalPlayers) + 1;
            if (!isPlayerEliminated(candidate)) {
                _firstPlayerOfGame = candidate;
                break;
            }
        }
    }
    if (currentPlayer === _firstPlayerOfGame) {
        turnCount++;
        const roundNumEl = document.getElementById('round-number');
        if (roundNumEl) roundNumEl.innerText = `PASSA TURNO ${turnCount}`;
    }

    const isVeryFirstTurn = (turnCount <= 1 && currentPlayer === _firstPlayerOfGame);
    const isCoop = typeof coopState !== 'undefined' && coopState.active;
    const hasHQ = players[currentPlayer].hq && players[currentPlayer].hq.hp > 0;

    // Entra se hai l'HQ vivo, OPPURE se sei in modalità Coop (i mostri sono esclusi per via del currentPlayer)
    if (!isVeryFirstTurn && (hasHQ || (isCoop && currentPlayer <= totalPlayers))) {
        // In Coop non hai la base, quindi parti da 0. Nel gioco normale parti da GAME.CREDIT_PER_BASE (1)
        let income = hasHQ ? GAME.CREDIT_PER_BASE : 0; 
        
        controlPoints.forEach(cp => {
            if (cp.faction === currentPlayer) income += GAME.CREDIT_PER_CP;
        });
        
        // Assegna la rendita solo se hai effettivamente guadagnato qualcosa
        if (income > 0) {
            players[currentPlayer].credits = (players[currentPlayer].credits || 0) + income;
            if (typeof showCreditIncome === 'function') showCreditIncome(currentPlayer, income);
        }
    }

    // ── FASE 6: Aggiornamento UI e avvio timer ───────────────
    updateUI();
    updateActivePlayerBorders();

    if (state === 'PLAYING') {
        startTimer();
        // L'AI viene eseguita solo localmente (offline) o dall'Host (online).
        // I client non eseguono mai l'AI direttamente.
        const shouldRunAI = isCurrentPlayerAI() && (!isOnline || isHost);
    if (shouldRunAI) setTimeout(executeAITurn, GAME.AI_DELAY_MS);
}
}


// ============================================================
// UI CONTROLLI
// ============================================================

function updateUI() {
    const pData       = players[currentPlayer];
    const activeColor = pData.color;

    document.documentElement.style.setProperty('--active-faction-color', activeColor);

    document.getElementById('current-turn-text').innerText = ` ${pData.name}`;

    const infoPanel = document.getElementById('selected-agent-info');
    const apDisplay = document.getElementById('action-points-display');
    const msgBoard  = document.getElementById('game-message-board');

    if (selectedAgent && selectedAgent.faction === currentPlayer && selectedAgent.type === 'agent') {
        infoPanel.style.display = 'flex';
        document.getElementById('info-hp').innerText  = `${selectedAgent.hp}/${selectedAgent.maxHp}`;
        document.getElementById('info-mov').innerText = selectedAgent.mov;
        document.getElementById('info-rng').innerText = selectedAgent.rng;
        document.getElementById('info-dmg').innerText = selectedAgent.dmg;
        apDisplay.innerText = `AP: ${selectedAgent.ap}/3`;
        msgBoard.innerText  = selectedAgent.ap > 0 ? "Scegli un'azione..." : 'Punti azione esauriti.';
    } else if (selectedAgent && selectedAgent.faction !== currentPlayer && selectedAgent.type === 'agent') {
        // Agente nemico selezionato: mostra le stat in sola lettura
        infoPanel.style.display = 'flex';
        document.getElementById('info-hp').innerText  = `${selectedAgent.hp}/${selectedAgent.maxHp}`;
        document.getElementById('info-mov').innerText = selectedAgent.mov;
        document.getElementById('info-rng').innerText = selectedAgent.rng;
        document.getElementById('info-dmg').innerText = selectedAgent.dmg;
        apDisplay.innerText = 'AP: --';
        msgBoard.innerText  = `👁 ${players[selectedAgent.faction]?.name ?? 'Nemico'}`;
    } else {
        infoPanel.style.display = 'flex';
        document.getElementById('info-hp').innerText  = '';
        document.getElementById('info-mov').innerText = '';
        document.getElementById('info-rng').innerText = '';
        document.getElementById('info-dmg').innerText = '';
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

    // Glow dinamico sui pulsanti abilitati
    //const activeColor = players[currentPlayer]?.color || '#00ff88';
    ['btn-move', 'btn-shoot', 'btn-build', 'btn-heal'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        if (!btn.disabled) {
            btn.style.boxShadow = `0 0 10px ${activeColor}88, 0 0 20px ${activeColor}44`;
            btn.style.borderColor = activeColor;
            btn.style.color = activeColor;
            btn.style.animation = '';
        } else {
            btn.style.boxShadow = '';
            btn.style.borderColor = '';
            btn.style.animation = '';
        }
    });

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
        if (cell && !cell.entity && (cell.type === 'empty' || cell.type === 'barricade'))
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
                if (cell.terrain === 'nebbia' && d > 1 && !cell.entity?.empFogRevealed) { break; }
                validActionTargets.push({ q: cell.q, r: cell.r, isObstacle: true, target: cell });
                break;
            }
            if (cell.entity) {
                // --- NEBBIA: entità nella nebbia colpibili solo da distanza 1 ---
                if (cell.terrain === 'nebbia' && d > 1 && !cell.entity.empFogRevealed) { break; }
                if (cell.entity.faction !== currentPlayer) {
                    validActionTargets.push({ q: cell.q, r: cell.r, isEnemy: true, target: cell.entity });
                }
                break; // Un'entità (nemica o alleata) blocca sempre la linea di tiro
            }

            // --- FIX AIRBURST: La cella è vuota! Aggiungiamola come bersaglio valido ---
            validActionTargets.push({ q: cell.q, r: cell.r, target: cell });
        }
    });
}

function calculateValidHeals() {
    if (!selectedAgent || selectedAgent.ap < 2) return;
    grid.forEach(cell => {
        if (
            cell.entity &&
            cell.entity.type === 'agent' &&
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

    // Notifica gli altri giocatori online dell'agente selezionato
    if (isOnline && selectedAgent && selectedAgent.type === 'agent') {
        sendOnlineMessage({
            type: 'AGENT_SELECT',
            q: selectedAgent.q,
            r: selectedAgent.r,
            actingPlayer: currentPlayer,
        });
    }

    updateUI();
    drawGame();
}

function handleCanvasHover(e) {
    
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
        selectedAgent.pierceCount    = data.agentBuffs.pierceCount    || 0;
        selectedAgent.demoBuff       = data.agentBuffs.demoBuff       || false;
        selectedAgent.infiltrateBuff = data.agentBuffs.infiltrateBuff || false;
        selectedAgent.shielded       = data.agentBuffs.shielded       || 0;
        selectedAgent.medikitBuff    = data.agentBuffs.medikitBuff    || false;
        selectedAgent.spectreBuff    = data.agentBuffs.spectreBuff    || false;
        if (data.agentBuffs.dmg !== undefined) {
            selectedAgent.dmg         = data.agentBuffs.dmg;
            selectedAgent.originalDmg = data.agentBuffs.originalDmg;
        }
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
 * Mostra le statistiche di un agente selezionato da un altro giocatore.
 * Chiamata quando si riceve un messaggio AGENT_SELECT dalla rete.
 */
function showRemoteAgentStats(data) {
    const cell = grid.get(getKey(data.q, data.r));
    if (!cell?.entity || cell.entity.type !== 'agent') return;

    selectedAgent = cell.entity;

    const infoPanel = document.getElementById('selected-agent-info');
    const apDisplay = document.getElementById('action-points-display');
    if (infoPanel) infoPanel.style.display = 'flex';
    document.getElementById('info-hp').innerText  = `${selectedAgent.hp}/${selectedAgent.maxHp}`;
    document.getElementById('info-mov').innerText = selectedAgent.mov;
    document.getElementById('info-rng').innerText = selectedAgent.rng;
    document.getElementById('info-dmg').innerText = selectedAgent.dmg;
    if (apDisplay) apDisplay.innerText = `AP: ${selectedAgent.ap}/3`;

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
        // ACTION va inviato per primo: i client remoti devono aggiornare
        // lo stato dell'agente (posizione, ecc.) prima di ricevere ACTION_CARD.
        if (isOnline && !fromNetwork) {
            sendOnlineMessage({
                type: 'ACTION', tQ: targetCell.q, tR: targetCell.r,
                sQ: originQ, sR: originR, mode: currentActionMode,
                actingPlayer: currentPlayer,
                agentBuffs: {
                    sniperPierce:   selectedAgent.sniperPierce   || false,
                    pierceCount:    selectedAgent.pierceCount    || 0,
                    demoBuff:       selectedAgent.demoBuff       || false,
                    infiltrateBuff: selectedAgent.infiltrateBuff || false,
                    shielded:       selectedAgent.shielded       || 0,
                    medikitBuff:    selectedAgent.medikitBuff    || false,
                    spectreBuff:    selectedAgent.spectreBuff    || false,
                    dmg:            selectedAgent.dmg,
                    originalDmg:    selectedAgent.originalDmg   || selectedAgent.dmg,
                },
            });
        }

        // Conferma carta deferred (Airdrop / Fortino) se presente.
        // Eseguito dopo ACTION così i client remoti ricevono i messaggi nell'ordine corretto.
        if (selectedAgent._pendingCard && !fromNetwork) {
            const pc    = selectedAgent._pendingCard;
            const pData = players[currentPlayer];
            if (!pData.usedCards) pData.usedCards = {};
            pData.usedCards[pc.slotKey] = true;
            selectedAgent._pendingCard  = null;

            if (isOnline) {
                sendOnlineMessage({
                    type: 'ACTION_CARD', cardId: pc.cardId, slotIndex: pc.slotIndex,
                    actingPlayer:  currentPlayer,
                    targetAgentId: selectedAgent?.id ?? null,
                });
            }
            if (typeof updateIngameCardsUI === 'function') updateIngameCardsUI();
        }

        selectedAgent.ap -= actionCost;
        checkWinConditions();

        if (!fromNetwork) {
            // Se stiamo usando la carta Fortino e abbiamo ancora costruzioni, mantieni la modalità attiva
            if (currentActionMode === 'card_build' && selectedAgent.fortinoActive && selectedAgent.fortinoBuilds > 0) {
                validActionTargets = [];
                const handler = _actionHandlers.find(h => h.mode === 'card_build');
                if (handler) handler.fn(null, false);
                updateUI();
                drawGame();
            } else {
                // Per TUTTE le altre azioni (Airdrop, movimento, sparo, ecc.), chiudi l'azione.
                // cancelAction() svuoterà currentActionMode ed eviterà azioni a ripetizione o AP negativi.
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
        if (targetCell.entity?.type === 'agent' && targetCell.entity.hp < targetCell.entity.maxHp) {
            targetCell.entity.hp = Math.min(targetCell.entity.maxHp, targetCell.entity.hp + 1);
            actionCost = 2; success = true; playSFX('heal');
        }

    } else if (currentActionMode === 'move') {
    // Sicurezza: se la cella è occupata da un'altra entità (es. recluta appena piazzata),
    // blocca il movimento per evitare sovrascrittura silenziosa e desync.
    if (targetCell.entity && targetCell.entity !== selectedAgent) {
        console.warn('[Move] targetCell occupata da', targetCell.entity.id, '- movimento annullato');
        return { success: false, actionCost: 0 };
    }
    playSFX('move');
    selectedAgent._lastQ = selectedAgent.q;
    selectedAgent._lastR = selectedAgent.r;
    selectedAgent._moveTime = Date.now();

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
                // Evita il rimbalzo di pacchetti se il movimento arriva dalla rete
                if (!fromNetwork && typeof showCPCapture === 'function') showCPCapture(selectedAgent);
            }
        }

    } else if (currentActionMode === 'shoot') {
        // Calcola la distanza
        const dist = hexDistance(selectedAgent, targetCell);
        
        // Scegli il suono
        if (dist === 1) playSFX('melee');
        else playSFX(Math.random() < 0.30 ? 'uzi' : 'laser');

        const targetData = validActionTargets.find(t => t.q === targetCell.q && t.r === targetCell.r);
        if (targetData || fromNetwork) {
            const actualTarget = (targetCell.type === 'wall' || targetCell.type === 'barricade')
                ? targetCell
                : (targetData ? targetData.target : (targetCell.entity || targetCell));
            
            const damageMap = new Map();
            damageMap.set(actualTarget, selectedAgent.dmg);
            resolveCombatDamage(damageMap, selectedAgent);

            // Scegli l'effetto grafico
            if (dist === 1) drawMeleeSlash(selectedAgent, targetCell);
            else drawLaserBeam(selectedAgent, targetCell);
            
            success = true;
        }

    } else if (currentActionMode === 'build') {
        playSFX('build');
        if (targetCell.type === 'barricade') {
            // Rinforza la barricata esistente sommando gli HP
            targetCell.hp    += GAME.BARRICADE_HP;
            targetCell.maxHp += GAME.BARRICADE_HP;
        } else {
            // Costruisce una nuova barricata su cella vuota
            targetCell.type           = 'barricade';
            targetCell.hp             = GAME.BARRICADE_HP;
            targetCell.maxHp          = GAME.BARRICADE_HP;
            targetCell.sprite         = getRandomSprite(SPRITE_POOLS.barricades);
            targetCell.customSpriteId = THEME_BARRICADE_ID;
        }
        invalidateStaticLayer();
        actionCost = 2; success = true;
    }

    return { success, actionCost };
}

// ============================================================
// GESTIONE DANNI CENTRALIZZATA (Sparo normale & Carte)
// ============================================================

/**
 * Applica danni a una serie di bersagli passando ogni danno
 * attraverso la pipeline dei _damageModifiers registrati.
 *
 * Le meccaniche difensive (scudo, immunità, copertura) NON sono
 * hardcodate qui: vengono registrate autonomamente dai moduli
 * che le introducono (carduse.js, terreni.js) tramite
 * registerDamageModifier(). Questo file non va mai modificato
 * per aggiungere nuove meccaniche difensive.
 *
 * @param {Map}    damageMap  chiave: entità/cella bersaglio,
 *                            valore: danno base da infliggere
 * @param {Object} attacker   agente attaccante (per i premi kill)
 */
function resolveCombatDamage(damageMap, attacker) {
    damageMap.forEach((baseDmg, target) => {

        // ── Catena dei modificatori di danno ────────────────
        // Ogni modifier registrato riceve il danno corrente e il
        // bersaglio; può ridurlo, azzerarlo o lasciarlo invariato.
        // Il risultato è clampato a 0 per sicurezza.
        let finalDmg = baseDmg;
        for (const mod of _damageModifiers) {
            finalDmg = Math.max(0, mod(finalDmg, target));
        }

        // ── Applicazione danno ───────────────────────────────
        if (finalDmg > 0) {
            target.hp -= finalDmg;
            
            // --- INIZIO EFFETTO IMPATTO ---
            target._hitTime = Date.now();
            const pTarget = hexToPixel(target.q, target.r);
            // Genera scintille del colore della fazione attaccante (o bianco)
            const sparkColor = attacker ? players[attacker.faction].color : '#ffffff';
            if (typeof createParticles === 'function') {
                createParticles(pTarget.x, pTarget.y - 15, sparkColor, 8, false);
            }
            // --- FINE EFFETTO IMPATTO ---

            // Innesco Medikit automatico (solo agenti, solo se feriti)
            if (target.type === 'agent' && target.medikitBuff && target.hp < target.maxHp) {
                if (typeof applyMedikit === 'function') applyMedikit(target);
            }
        }

        // ── Gestione morte ───────────────────────────────────
        if (target.hp <= 0) {
            // Controlla se è un muro o una barricata
            if (target.q !== undefined && (target.type === 'wall' || target.type === 'barricade')) {
                const cell = grid.get(getKey(target.q, target.r));
                if (cell) { cell.type = 'empty'; cell.hp = 0; invalidateStaticLayer(); }
                playSFX('crollo'); // Suono per distruzione ostacolo
                // Genera particelle per l'ostacolo
                const pDeath = hexToPixel(target.q, target.r);
                if (typeof createParticles === 'function') createParticles(pDeath.x, pDeath.y, '#777', 10, true);
                
            } else if (target.type === 'agent' || target.type === 'hq' || target.type === 'lair') {
                // Se è un'unità o una Tana, chiama la funzione morte (che fa sfx-explosion)
                handleEntityDeath(target, attacker.faction);
            }
            // NOTA: Se il tipo è 'empty', non succede nulla. Niente suono, niente morte.
        }
    });
}

function handleEntityDeath(entity, killerFaction = null) {
    playSFX('explosion');
    
    // --- INIZIO EFFETTO ESPLOSIONE MORTE ---
    const pDeath = hexToPixel(entity.q, entity.r);
    if (typeof createParticles === 'function') {
        // Esplosione massiccia arancione/rossa
        createParticles(pDeath.x, pDeath.y, '#ff8800', 15, true);
        createParticles(pDeath.x, pDeath.y, '#ff3333', 10, true);
    }
    // --- FINE EFFETTO ESPLOSIONE MORTE ---
    
    const deathCell = grid.get(getKey(entity.q, entity.r));
    if (deathCell) deathCell.entity = null;

    const owner = players[entity.faction];
    if (!owner) return; 

    if (entity.type === 'agent') {
        if (killerFaction && typeof awardKillReward === 'function') {
            awardKillReward(killerFaction);
        }
        const list = owner.agents;
        const idx  = list.findIndex(a => a.id === entity.id);
        if (idx !== -1) list.splice(idx, 1);
    } else if (entity.type === 'hq') {
        if (killerFaction && typeof awardBaseDestroyReward === 'function') {
            awardBaseDestroyReward(killerFaction);
        }
        owner.hq = null;
    }
}


// ============================================================
// OVERLAY DI FINE PARTITA
// ============================================================

function showGameOverlay(title, message, color) {
    color = color || '#00ff88';
    clearInterval(turnTimerInterval);
    if (timerUI) timerUI.style.display = 'none';

    const overlay = document.createElement('div');
    overlay.id = 'gameover-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;box-sizing:border-box;background:rgba(5,5,9,0.97);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Courier New,monospace;text-align:center;padding:20px;';

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
    btn.onclick   = function () {
        sessionStorage.clear(); // Pulizia prima del reload volontario
        location.reload();
    };

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
    // ── CONDIZIONE 1: rimane una sola fazione con agenti vivi ─
    const factionsWithAgents = [];
    for (let p = 1; p <= totalPlayers; p++) {
        const hasLivingAgent = players[p].agents.some(agent => agent.hp > 0);
        if (hasLivingAgent) factionsWithAgents.push(p);
    }

    if (factionsWithAgents.length === 1) {
        const winner = players[factionsWithAgents[0]];
        state = 'GAME_OVER';
        setTimeout(() => showGameOverlay('OPERAZIONE COMPLETATA!', `La fazione ${winner.name.toUpperCase()} ha vinto!`, winner.color), 300);
        return;
    }

    // ── CONDIZIONE 2: rimane una sola base in piedi ──────────
    const stillAlive = [];
    for (let p = 1; p <= totalPlayers; p++) {
        if (players[p]?.hq?.hp > 0) stillAlive.push(p);
    }

    if (stillAlive.length === 1) {
        const winner = players[stillAlive[0]];
        state = 'GAME_OVER';
        setTimeout(() => showGameOverlay('OPERAZIONE COMPLETATA!', `La fazione ${winner.name.toUpperCase()} ha vinto!`, winner.color), 300);
    } else if (stillAlive.length === 0) {
        state = 'GAME_OVER';
        setTimeout(() => showGameOverlay('OPERAZIONE COMPLETATA!', 'Nessuna base è rimasta in piedi. Pareggio.', '#ff3333'), 300);
    }
}

// ============================================================
// AUTO-HEAL (MEDIKIT TRIGGER)
// ============================================================
function applyMedikit(agent) {
    if (!agent || !agent.medikitBuff) return;
    if (agent.hp >= agent.maxHp) return; // Non serve curare

    const missingHp  = agent.maxHp - agent.hp;
    const healAmount = Math.min(GAME.MEDIKIT_HEAL, missingHp);

    agent.hp         += healAmount;
    agent.medikitBuff = false; // Il medikit viene consumato

    if (typeof playSpecialVFX === 'function') {
        playSpecialVFX(agent, '#00ff88', `💉 AUTO-CURA +${healAmount}!`);
    }
    if (typeof playSFX === 'function') playSFX('heal');
}

// ============================================================
// RESA
// ============================================================

function surrenderCurrentPlayer() {
    const surrenderingPlayer = isOnline ? myPlayerNumber : currentPlayer;
    const pName = players[surrenderingPlayer]?.name || 'P' + surrenderingPlayer;
    
    showCustomConfirm(
        "🏳️ CONFERMA RESA", 
        `Confermi la resa di ${pName}?`, 
        "MI ARRENDO", 
        () => {
            playSFX('explosion');

            if (isOnline && !isHost) {
                sendOnlineMessage({ type: 'SURRENDER', faction: surrenderingPlayer });
                return;
            }
            _applySurrender(surrenderingPlayer);
        }, 
        '#ff3333' // Colore rosso pericolo
    );
}

function _applySurrender(faction) {
    (players[faction]?.agents || []).forEach(a => { 
        a.hp = 0; 
        const agentCell = grid.get(getKey(a.q, a.r));
        if (agentCell) agentCell.entity = null;
    });
    players[faction].agents = [];

    if (players[faction]?.hq) {
        const hqCell = grid.get(getKey(players[faction].hq.q, players[faction].hq.r));
        if (hqCell) hqCell.entity = null;
        players[faction].hq = null;
    }

    drawGame();
    checkWinConditions();

    // Se siamo online come host, sincronizza tutti i client
    if (isOnline && isHost) {
        if (typeof hostBroadcastTurnSync === 'function') hostBroadcastTurnSync();

        // FIX: Se l'Host si arrende (o applica la resa di un client) e la partita finisce,
        // calcola il vincitore e notifica attivamente tutti i client.
        if (state === 'GAME_OVER') {
            let w = null;
            const stillAlive = [];
            for (let p = 1; p <= totalPlayers; p++) {
                if (players[p]?.hq?.hp > 0) stillAlive.push(p);
            }
            if (stillAlive.length === 1) w = stillAlive[0];
            else if (stillAlive.length === 0) w = 0; // Pareggio
            else {
                const withAgents = [];
                for (let p = 1; p <= totalPlayers; p++) {
                    if (players[p]?.agents?.some(a => a.hp > 0)) withAgents.push(p);
                }
                if (withAgents.length === 1) w = withAgents[0];
            }

            if (w !== null && typeof sendOnlineMessage === 'function') {
                const title   = 'OPERAZIONE COMPLETATA!';
                const message = w === 0 ? 'Nessuna base è rimasta in piedi. Pareggio.' : `La fazione ${players[w]?.name?.toUpperCase()} ha vinto!`;
                const color   = w === 0 ? '#ff3333' : (players[w]?.color || '#00ff88');
                sendOnlineMessage({ type: 'GAME_OVER', title, message, color });
            }
        }
    }
}
window.surrenderCurrentPlayer = surrenderCurrentPlayer;


markScriptAsLoaded('gamelogic.js');
