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
// OVERRIDE: CALCOLO TARGET (CECCHINO — PIERCING)
// ============================================================
// La carta Cecchino (C03) aggiunge sniperPierce: il colpo
// attraversa il PRIMO ostacolo (muro, barricata, scudo) e
// colpisce il primo agente nemico valido dietro di esso.

const _origCalculateValidTargets = window.calculateValidTargets;
window.calculateValidTargets = function () {
    if (!selectedAgent?.sniperPierce) {
        _origCalculateValidTargets();
        return;
    }

    hexDirections.forEach(dir => {
        let targetsHit = 0;   // Conta quanti bersagli (nemici o ostacoli) abbiamo attraversato
        let path       = [];

        for (let d = 1; d <= selectedAgent.rng; d++) {
            const cell = grid.get(getKey(
                selectedAgent.q + dir.q * d,
                selectedAgent.r + dir.r * d
            ));
            if (!cell) break; // Fine mappa
            path.push({ q: cell.q, r: cell.r });

            // È un ostacolo inanimato?
            if (cell.type === 'wall' || cell.type === 'barricade') {
                targetsHit++;
                validActionTargets.push(...path.map(p => ({ ...p, isObstacle: true, target: cell })));
                
                if (targetsHit >= 2) break; // Ferma il raggio al secondo ostacolo
                continue;                   // Altrimenti prosegui
            }

            // È un'entità?
            if (cell.entity) {
                // Gli alleati bloccano sempre il colpo per evitare friendly fire
                if (cell.entity.faction === currentPlayer) break;

                // Nemico colpito
                targetsHit++;
                validActionTargets.push(...path.map(p => ({ ...p, isEnemy: true, target: cell.entity })));
                
                if (targetsHit >= 2) break; // Ferma il raggio al secondo nemico
                continue;                   // Altrimenti prosegui
            }
        }
    });
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
// - Modalità card_build   (barricata gratuita + logica Fortino x4)
// - Modificatore Demolizione (danno x2)
// - Modificatore Scudo Elettronico (annulla danno)

window.executeAction = function (targetCell, fromNetwork = false) {
    if (isOnline && !fromNetwork && !canLocalPlayerAct() && !isHostAITurn()) return;

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
        actionCost = 1; success = true;
        playSpecialVFX(selectedAgent, '#a0ff00', '🪂 ATTERRATO!');
        // Controlla cattura CP dopo airdrop
        const airdropKey = getKey(selectedAgent.q, selectedAgent.r);
        if (controlPoints.has(airdropKey)) {
            const cp = controlPoints.get(airdropKey);
            if (cp.faction !== selectedAgent.faction) {
                cp.faction = selectedAgent.faction;
                if (typeof showCPCapture === 'function') showCPCapture(selectedAgent);
            }
        }

    // --- COSTRUZIONE FORTINO (carta C02) ---
    } else if (currentActionMode === 'card_build') {
        playSFX('build');
        targetCell.type         = 'barricade';
        targetCell.hp = GAME.BARRICADE_HP; targetCell.maxHp = GAME.BARRICADE_HP;
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
        // Controlla cattura CP dopo il movimento
        const movedKey = getKey(selectedAgent.q, selectedAgent.r);
        if (controlPoints.has(movedKey)) {
            const cp = controlPoints.get(movedKey);
            if (cp.faction !== selectedAgent.faction) {
                cp.faction = selectedAgent.faction;
                if (typeof showCPCapture === 'function') showCPCapture(selectedAgent);
            }
        }

    // --- SPARO (con modificatori Demolizione, Scudo e Cecchino) ---
    } else if (currentActionMode === 'shoot') {
        playSFX('laser');
        const targetData = validActionTargets.find(t => t.q === targetCell.q && t.r === targetCell.r);
        
        if (targetData || fromNetwork) {
            // Il danno totale è già calcolato in selectedAgent.dmg (modificato dalla carta Demolizione)
            const mainDmg   = selectedAgent.dmg;
            // Il danno ad area è sempre la metà del danno principale (arrotondato per eccesso)
            const splashDmg = Math.ceil(mainDmg / 2);

            // Effetto sonoro esplosione se Demolizione è attiva
            if (selectedAgent.demoBuff) {
                playSFX('explosion');
            }

            // Raccogli tutti i bersagli colpiti direttamente sulla linea di tiro
            let mainLineTargets = [];
            
            const dq = targetCell.q - selectedAgent.q;
            const dr = targetCell.r - selectedAgent.r;
            const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
            const stepQ = dq / dist;
            const stepR = dr / dist;

            if (selectedAgent.sniperPierce) {
                for (let s = 1; s <= dist; s++) {
                    const q = Math.round(selectedAgent.q + stepQ * s);
                    const r = Math.round(selectedAgent.r + stepR * s);
                    const cell = grid.get(getKey(q, r));
                    
                    if (cell) {
                        if (cell.entity && cell.entity.faction !== currentPlayer) {
                            mainLineTargets.push({ target: cell.entity, cell: cell });
                        } else if (cell.type === 'wall' || cell.type === 'barricade') {
                            mainLineTargets.push({ target: cell, cell: cell });
                        }
                    }
                }
            } else {
                const finalTarget = targetData ? targetData.target : (targetCell.entity || targetCell);
                mainLineTargets.push({ target: finalTarget, cell: targetCell });
            }

            // Mappa per sommare i danni (utile se un bersaglio subisce sia colpo diretto che splash da un altro)
            // Map: target_ref -> totale_danni
            const damageMap = new Map();

            // Applica danno diretto ed eventuale splash damage
            mainLineTargets.forEach(item => {
                // Danno diretto
                damageMap.set(item.target, (damageMap.get(item.target) || 0) + mainDmg);

                // Danno ad area (Splash) se Demolizione è attiva
                if (selectedAgent.demoBuff) {
                    playSpecialVFX(item.cell, '#ff8800', '💥 BOOM!');
                    
                    hexDirections.forEach(dir => {
                        const adjQ = item.cell.q + dir.q;
                        const adjR = item.cell.r + dir.r;
                        const adjCell = grid.get(getKey(adjQ, adjR));
                        
                        if (adjCell) {
                            // Non fa splash damage agli alleati o a se stesso
                            if (adjCell.entity && adjCell.entity.faction !== currentPlayer) {
                                damageMap.set(adjCell.entity, (damageMap.get(adjCell.entity) || 0) + splashDmg);
                            } else if (adjCell.type === 'wall' || adjCell.type === 'barricade') {
                                damageMap.set(adjCell, (damageMap.get(adjCell) || 0) + splashDmg);
                            }
                        }
                    });
                }
            });

            // Risolvi i danni e gestisci gli scudi
            damageMap.forEach((totalDmg, actualTarget) => {
                let finalDmg = totalDmg;

                // Gestione Scudo Elettronico
                if (actualTarget.shielded) {
                    actualTarget.shielded = false;
                    
                    // Il cecchino bypassa lo scudo SOLO se il bersaglio è stato colpito direttamente dal raggio
                    const isMainTarget = mainLineTargets.some(m => m.target === actualTarget);
                    
                    if (selectedAgent.sniperPierce && isMainTarget) {
                        playSpecialVFX(actualTarget, '#ff3333', '🎯 SCUDO PERFORATO!');
                    } else {
                        // Se colpito solo dallo splash (o se non c'è cecchino), lo scudo blocca tutto il danno
                        finalDmg = 0;
                        playSpecialVFX(actualTarget, '#00ffff', '🛡️ ATTACCO ANNULLATO!');
                    }
                }

                if (finalDmg > 0) {
                    actualTarget.hp -= finalDmg;
                }

                // Controllo morte/distruzione
                if (actualTarget.hp <= 0) {
                    // È un muro o barricata
                    if (actualTarget.q !== undefined && (actualTarget.type === 'wall' || actualTarget.type === 'barricade')) {
                        const cell = grid.get(getKey(actualTarget.q, actualTarget.r));
                        if (cell) { cell.type = 'empty'; cell.hp = 0; }
                    } 
                    // È un agente o HQ
                    else if (actualTarget.type) {
                        handleEntityDeath(actualTarget);
                    }
                }
            });

            drawLaserBeam(selectedAgent, targetCell);
            success = true;
        }

    // --- BARRICATA NORMALE (2 AP) ---
    } else if (currentActionMode === 'build') {
        playSFX('build');
        targetCell.type         = 'barricade';
        targetCell.hp = GAME.BARRICADE_HP; targetCell.maxHp = GAME.BARRICADE_HP;
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


// Helper: cerca agenti nemici con scudo sul percorso tra sparante e bersaglio
// e consuma lo scudo (il cecchino lo attraversa senza essere fermato).
function _consumePiercedShield(attacker, targetCell) {
    // Calcola la direzione verso il bersaglio
    const dq = targetCell.q - attacker.q;
    const dr = targetCell.r - attacker.r;
    const steps = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
    if (steps <= 1) return;   // adiacenti: nessun "in mezzo"

    const stepQ = dq / steps;
    const stepR = dr / steps;

    for (let s = 1; s < steps; s++) {
        const q = Math.round(attacker.q + stepQ * s);
        const r = Math.round(attacker.r + stepR * s);
        const cell = grid.get(getKey(q, r));
        if (!cell) continue;
        if (cell.entity?.shielded && cell.entity.faction !== attacker.faction) {
            cell.entity.shielded = false;
            playSpecialVFX(cell.entity, '#00ffff', '🛡️ Scudo perforato!');
        }
    }
}

// ============================================================
// OVERRIDE: RESET TURNO — pulizia buff/debuff
// ============================================================
// Eseguito a ogni cambio turno:
// 1. Rimuove i buff del giocatore che ha appena giocato
// 2. Chiama il reset standard (AP, contatore round, timer)
// 3. Applica i debuff EMP al giocatore che inizia ora

const _origResetTurnState = window.resetTurnState;
window.resetTurnState = function () {
    // --- Pulizia buff di TUTTI i giocatori ---
    // (siccome endTurn ha già cambiato currentPlayer, puliamo tutti per sicurezza)
    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p]) continue;
        
        players[p].agents.forEach(a => {
            // Ripristina gittata Cecchino
            if (a.sniperBuff) { 
                a.rng = a.originalRng; 
                a.sniperBuff = false; 
                a.sniperPierce = false; 
            }
            
            // Ripristina danno Demolizione
            if (a.demoBuff) { 
                a.dmg = a.originalDmg; 
                a.demoBuff = false; 
            }
            
            // Rimuovi buff temporanei di movimento
            a.infiltrateBuff = false;
            
            // Fortino: sempre azzerato a fine turno
            a.fortinoActive = false;
            a.fortinoBuilds = 0;
        });
    }

    // --- Reset standard (AP, timer, contatore round, reddito crediti) ---
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
