/* ============================================================
   carduse.js — Override di gamelogic.js per le meccaniche carte
   ============================================================
   RESPONSABILITÀ DI QUESTO FILE:
   - Override di calculateValidMoves  → aggiunge passaggio muri (Infiltrazione)
   - Override di setActionMode        → aggiunge modalità card_airdrop / card_build
   - Override di executeAction        → aggiunge card_airdrop, card_build,
                                         danno doppio (Demolizione), scudo (C07)
   - Override di resetTurnState       → pulizia buff/debuff a fine turno
   - Override di drawGame             → disegna alone scudo elettronico

   NON CONTIENE più: definizioni carte, effetti apply(), VFX, UI.
   Tutto quello è ora in cards.js.

   ESPONE: (nessuna funzione pubblica — solo override su window.*)
   DIPENDE DA: constants.js, state.js, graphics.js,
               gamelogic.js (tutte le funzioni che sovrascrive),
               cards.js (playSpecialVFX, CARD_DEFINITIONS)
   ============================================================ */

// ============================================================
// OVERRIDE: CALCOLO MOSSE VALIDE
// ============================================================
// La carta Infiltrazione (C06) permette di attraversare muri/barricate.
// Aggiunge questo comportamento senza toccare gamelogic.js.

const _origCalculateValidMoves = window.calculateValidMoves;
window.calculateValidMoves = function () {
    if (selectedAgent?.infiltrateBuff) {
        // BFS che ignora il tipo della cella (passa anche su muri e barricate)
        const visited = new Set([getKey(selectedAgent.q, selectedAgent.r)]);
        const queue   = [{ q: selectedAgent.q, r: selectedAgent.r, dist: 0 }];
        while (queue.length > 0) {
            const curr = queue.shift();
            if (curr.dist > 0) validActionTargets.push({ q: curr.q, r: curr.r });
            if (curr.dist < selectedAgent.mov) {
                hexDirections.forEach(dir => {
                    const nq  = curr.q + dir.q, nr = curr.r + dir.r;
                    const key = getKey(nq, nr), cell = grid.get(key);
                    // Passa su qualsiasi cella non occupata da un'entità
                    if (cell && !visited.has(key) && !cell.entity) {
                        visited.add(key);
                        queue.push({ q: nq, r: nr, dist: curr.dist + 1 });
                    }
                });
            }
        }
    } else {
        _origCalculateValidMoves();
    }
};

// ============================================================
// OVERRIDE: SET ACTION MODE
// ============================================================
// Aggiunge le modalità speciali 'card_airdrop' e 'card_build'
// che non esistono nella lista standard di gamelogic.js.

const _origSetActionMode = window.setActionMode;
window.setActionMode = function (mode) {
    if (mode === 'card_airdrop') {
        playSFX('click');
        currentActionMode  = mode;
        validActionTargets = [];
        // Airdrop: qualsiasi cella vuota sulla mappa
        grid.forEach(cell => {
            if (cell.type === 'empty' && !cell.entity)
                validActionTargets.push({ q: cell.q, r: cell.r });
        });
        updateUI(); drawGame();
        return;
    }
    if (mode === 'card_build') {
        playSFX('click');
        currentActionMode  = mode;
        validActionTargets = [];
        // Fortino: costruisci ovunque ci sia una cella vuota
        grid.forEach(cell => {
            if (cell.type === 'empty' && !cell.entity)
                validActionTargets.push({ q: cell.q, r: cell.r });
        });
        updateUI(); drawGame();
        return;
    }
    _origSetActionMode(mode);
};

// ============================================================
// OVERRIDE: EXECUTE ACTION
// ============================================================
// Estende executeAction con:
// - Modalità card_airdrop (teleport gratuito)
// - Modalità card_build   (barricata gratuita + logica Fortino x3)
// - Modificatore Demolizione (danno x2)
// - Modificatore Scudo Elettronico (annulla danno)

window.executeAction = function (targetCell, fromNetwork = false) {
    const isOnlineAITurn = isOnline && isHost && onlineAIFactions.has(currentPlayer);
    if (isOnline && !fromNetwork && currentPlayer !== myPlayerNumber && !isOnlineAITurn) return;

    let success    = false;
    let actionCost = 1;
    const originQ  = selectedAgent.q;
    const originR  = selectedAgent.r;

    // --- AIRDROP (carta C08) ---
    if (currentActionMode === 'card_airdrop') {
        playSFX('move');
        grid.get(getKey(selectedAgent.q, selectedAgent.r)).entity = null;
        targetCell.entity = selectedAgent;
        selectedAgent.q   = targetCell.q;
        selectedAgent.r   = targetCell.r;
        actionCost = 0; success = true;
        playSpecialVFX(selectedAgent, '#a0ff00', '🪂 ATTERRATO!');

    // --- COSTRUZIONE FORTINO (carta C02) ---
    } else if (currentActionMode === 'card_build') {
        playSFX('build');
        targetCell.type         = 'barricade';
        targetCell.hp           = 2; targetCell.maxHp = 2;
        targetCell.sprite       = getRandomSprite(SPRITE_POOLS.barricades);
        targetCell.customSpriteId = THEME_BARRICADE_ID;
        actionCost = 0; success = true;

        if (selectedAgent.fortinoActive && selectedAgent.fortinoBuilds > 0) {
            selectedAgent.fortinoBuilds--;
            playSpecialVFX(targetCell, '#00aaff', `🏰 ${selectedAgent.fortinoBuilds} rimaste`);
            if (selectedAgent.fortinoBuilds <= 0) selectedAgent.fortinoActive = false;
        }

    // --- CURA ---
    } else if (currentActionMode === 'heal') {
        if (selectedAgent.ap < 2) { cancelAction(); return; }
        if (targetCell.entity?.faction === currentPlayer) {
            targetCell.entity.hp = Math.min(targetCell.entity.maxHp, targetCell.entity.hp + 1);
            actionCost = 2; success = true; playSFX('heal');
        }

    // --- MOVIMENTO ---
    } else if (currentActionMode === 'move') {
        playSFX('move');
        grid.get(getKey(selectedAgent.q, selectedAgent.r)).entity = null;
        targetCell.entity = selectedAgent;
        selectedAgent.q   = targetCell.q;
        selectedAgent.r   = targetCell.r;
        success = true;

    // --- SPARO (con modificatori Demolizione e Scudo) ---
    } else if (currentActionMode === 'shoot') {
        playSFX('laser');
        const targetData = validActionTargets.find(t => t.q === targetCell.q && t.r === targetCell.r);
        if (targetData || fromNetwork) {
            const actualTarget = targetData ? targetData.target : (targetCell.entity || targetCell);
            let dmg = selectedAgent.dmg;

            if (selectedAgent.demoBuff) {
                dmg *= 2;
                playSpecialVFX(targetCell, '#ff8800', '💥 DANNO DOPPIO!');
            }
            if (actualTarget.shielded) {
                dmg = 0;
                actualTarget.shielded = false;
                playSpecialVFX(actualTarget, '#00ffff', '🛡️ ATTACCO ANNULLATO!');
            }

            actualTarget.hp -= dmg;
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

    // --- BARRICATA NORMALE (2 AP) ---
    } else if (currentActionMode === 'build') {
        playSFX('build');
        targetCell.type         = 'barricade';
        targetCell.hp           = 2; targetCell.maxHp = 2;
        targetCell.sprite       = getRandomSprite(SPRITE_POOLS.barricades);
        targetCell.customSpriteId = THEME_BARRICADE_ID;
        actionCost = 2; success = true;
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

        if (!fromNetwork) {
            // Mantieni card_build attiva finché rimangono costruzioni Fortino
            if (currentActionMode === 'card_build' &&
                selectedAgent?.fortinoActive === true &&
                selectedAgent?.fortinoBuilds > 0) {
                setActionMode('card_build');
            } else {
                cancelAction();
            }
        }
    }
};

// ============================================================
// OVERRIDE: RESET TURNO — pulizia buff/debuff
// ============================================================
// Eseguito a ogni cambio turno:
// 1. Rimuove i buff del giocatore che ha appena giocato
// 2. Chiama il reset standard (AP, contatore round, timer)
// 3. Applica i debuff EMP al giocatore che inizia ora

const _origResetTurnState = window.resetTurnState;
window.resetTurnState = function () {
    // --- Pulizia buff del giocatore uscente ---
    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p]) continue;
        players[p].agents.forEach(a => {
            if (p === currentPlayer) {
                // Ripristina gittata cecchino
                if (a.sniperBuff) { a.rng = a.originalRng; a.sniperBuff = false; }
                // Rimuovi buff temporanei
                a.demoBuff       = false;
                a.infiltrateBuff = false;
            }
            // Fortino: sempre azzerato a fine turno (sicurezza)
            a.fortinoActive = false;
            a.fortinoBuilds = 0;
        });
    }

    // --- Reset standard (AP, timer, contatore round) ---
    _origResetTurnState();

    // --- Applica EMP al giocatore che INIZIA ora ---
    players[currentPlayer]?.agents.forEach(a => {
        if (a.empDebuff > 0) {
            const loss = a.empDebuff;
            a.ap = Math.max(0, a.ap - loss);
            playSpecialVFX(a, '#ff00cc', `⚡ -${loss} AP (EMP)`);
            a.empDebuff = 0;
        }
    });

    updateUI();
};

// ============================================================
// OVERRIDE: DRAW GAME — alone scudo elettronico
// ============================================================
// Disegna un bordo tratteggiato ciano sugli agenti con scudo attivo.

const _origDrawGame = window.drawGame;
window.drawGame = function () {
    _origDrawGame();

    grid.forEach(cell => {
        if (!cell.entity?.shielded) return;
        const p = hexToPixel(cell.q, cell.r);
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, HEX_SIZE * 0.95, 0, Math.PI * 2);
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth   = 3;
        ctx.setLineDash([8, 6]);
        ctx.shadowBlur  = 15;
        ctx.shadowColor = '#00ffff';
        ctx.stroke();
        ctx.restore();
    });
};
