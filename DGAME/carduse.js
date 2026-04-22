/* ============================================================
   carduse.js — Meccaniche carta: registra handler nella pipeline
   ============================================================
   RESPONSABILITÀ:
   - Calcolo mosse alternative  → registerMoveCalculator()
   - Calcolo target alternativi → registerTargetCalculator()
   - Azioni carta custom        → registerActionHandler()
   - Intercettazione sparo      → registerActionHandler('shoot', …)
   - Pulizia buff a fine turno  → registerTurnResetHook()
   - Effetti grafici extra       → registerDrawHook()

   NON usa più il pattern  window.fn = function(){ _orig(); }
   Tutto avviene tramite la pipeline di gamelogic.js.

   ESPONE: (nessuna funzione pubblica)
   DIPENDE DA: constants.js, state.js, graphics.js,
               gamelogic.js (register*),
               cards.js (playSpecialVFX, CARD_DEFINITIONS)
   ============================================================ */


// ============================================================
// CALCOLO MOSSE — Infiltrazione (C06)
// ============================================================
// BFS che ignora il tipo della cella: l'agente può attraversare
// muri e barricate se ha il buff infiltrateBuff attivo.

registerMoveCalculator(function (agent) {
    if (!agent?.infiltrateBuff) return null;   // delega al calcolo standard

    const targets = [];
    const visited = new Set([getKey(agent.q, agent.r)]);
    const queue   = [{ q: agent.q, r: agent.r, dist: 0 }];

    while (queue.length > 0) {
        const curr = queue.shift();
        if (curr.dist > 0) targets.push({ q: curr.q, r: curr.r });
        if (curr.dist < agent.mov) {
            hexDirections.forEach(dir => {
                const nq  = curr.q + dir.q, nr = curr.r + dir.r;
                const key = getKey(nq, nr), cell = grid.get(key);
                if (cell && !visited.has(key) && !cell.entity) {
                    visited.add(key);
                    queue.push({ q: nq, r: nr, dist: curr.dist + 1 });
                }
            });
        }
    }
    return targets;
});


// ============================================================
// CALCOLO TARGET — Cecchino piercing (C03)
// ============================================================
// Il colpo attraversa il primo ostacolo e colpisce il secondo
// bersaglio lungo la linea di tiro.

registerTargetCalculator(function (agent) {
    if (!agent?.sniperBuff) return null; 

    const targets = [];
    const maxTargets = 1 + (agent.pierceCount || 0); // Bersaglio base + perforazioni

    let currentRng = agent.rng;
    const originCell = grid.get(getKey(agent.q, agent.r));
    if (originCell && originCell.terrain === 'altura') currentRng += 1;

    hexDirections.forEach(dir => {
        let targetsHit = 0;
        const path     = [];

        for (let d = 1; d <= currentRng; d++) {
            const cell = grid.get(getKey(
                agent.q + dir.q * d,
                agent.r + dir.r * d
            ));
            if (!cell) break;
            path.push({ q: cell.q, r: cell.r });

            if (cell.type === 'wall' || cell.type === 'barricade' || cell.entity) {
                // Logica nebbia
                if (cell.terrain === 'nebbia' && d > 1) break;
                
                // Se è un nemico o un ostacolo, contalo come bersaglio colpito
                if (cell.type === 'wall' || cell.type === 'barricade' || (cell.entity && cell.entity.faction !== currentPlayer)) {
                    targetsHit++;
                    targets.push(...path.map(p => ({ 
                        ...p, 
                        isEnemy: !!cell.entity, 
                        isObstacle: !cell.entity, 
                        target: cell.entity || cell 
                    })));
                    
                    // Se abbiamo raggiunto il limite di bersagli perforabili per questa linea, fermati
                    if (targetsHit >= maxTargets) break;
                } else if (cell.entity && cell.entity.faction === currentPlayer) {
                    // Alleato blocca sempre la linea
                    break;
                }
            }
        }
    });

    return targets;
});


// ============================================================
// ACTION HANDLER — Airdrop (C08)   mode: 'card_airdrop'
// ============================================================
// Quando setActionMode('card_airdrop') viene chiamato, questo
// handler intercetta il chiamata a fn(null, false) in setActionMode
// e popola validActionTargets con tutte le celle vuote.
// Quando executeAction chiama l'handler con targetCell valido,
// esegue il teletrasporto.

registerActionHandler('card_airdrop', function (targetCell, fromNetwork) {
    // Chiamata da setActionMode (targetCell === null) → popola i target
    if (targetCell === null) {
        grid.forEach(cell => {
            if (cell.type === 'empty' && !cell.entity)
                validActionTargets.push({ q: cell.q, r: cell.r });
        });
        return { success: false, actionCost: 0 };   // non è un'azione reale, solo setup
    }

    // Chiamata da executeAction → esegui teletrasporto
    playSFX('move');
    grid.get(getKey(selectedAgent.q, selectedAgent.r)).entity = null;
    targetCell.entity = selectedAgent;
    selectedAgent.q   = targetCell.q;
    selectedAgent.r   = targetCell.r;
    playSpecialVFX(selectedAgent, '#a0ff00', '🪂 ATTERRATO!');

    captureControlPoint(selectedAgent);
    return { success: true, actionCost: 1 };
});


// ============================================================
// ACTION HANDLER — Fortino (C02)   mode: 'card_build'
// ============================================================

registerActionHandler('card_build', function (targetCell, fromNetwork) {
    // Chiamata da setActionMode → popola i target (qualsiasi cella vuota)
    if (targetCell === null) {
        grid.forEach(cell => {
            if (cell.type === 'empty' && !cell.entity)
                validActionTargets.push({ q: cell.q, r: cell.r });
        });
        return { success: false, actionCost: 0 };
    }

    // Esegui costruzione gratuita
    playSFX('build');
    targetCell.type           = 'barricade';
    targetCell.hp             = GAME.BARRICADE_HP;
    targetCell.maxHp          = GAME.BARRICADE_HP;
    targetCell.sprite         = getRandomSprite(SPRITE_POOLS.barricades);
    targetCell.customSpriteId = THEME_BARRICADE_ID;

    if (selectedAgent.fortinoActive && selectedAgent.fortinoBuilds > 0) {
        selectedAgent.fortinoBuilds--;
        playSpecialVFX(targetCell, '#00aaff', `🏰 ${selectedAgent.fortinoBuilds} rimaste`);
        if (selectedAgent.fortinoBuilds <= 0) selectedAgent.fortinoActive = false;
    }

    // Mantieni card_build attiva se rimangono costruzioni
    if (!fromNetwork && selectedAgent.fortinoActive && selectedAgent.fortinoBuilds > 0) {
        // executeAction gestirà già il ricalcolo dei target perché
        // currentActionMode.startsWith('card_') — nessuna azione extra necessaria
    } else if (!fromNetwork && (!selectedAgent.fortinoActive || selectedAgent.fortinoBuilds <= 0)) {
        // Fortino esaurito: cancelAction sarà chiamato da executeAction
        selectedAgent.fortinoActive = false;
    }

    return { success: true, actionCost: 0 };
});


// ============================================================
// ACTION HANDLER — Sparo con modificatori (intercetta 'shoot')
// ============================================================
// Gestisce: Demolizione (splash), Scudo Elettronico, Cecchino piercing.
// Se nessun modificatore è attivo, delega al gestore standard
// ritornando null.

registerActionHandler('shoot', function (targetCell, fromNetwork) {
    if (targetCell === null) return null;

    // Aggiungiamo il controllo su sniperBuff
    const hasMods = selectedAgent.demoBuff || selectedAgent.sniperBuff;
    if (!hasMods) return null;

    playSFX('laser');
    
    // Il limite di bersagli colpibili
    const maxT = 1 + (selectedAgent.pierceCount || 0);
    const mainLineTargets = [];
    
    // Se è cecchino, ricalcoliamo la linea per prendere TUTTI i bersagli fino al limite maxT
    if (selectedAgent.sniperBuff) {
        const dq = targetCell.q - selectedAgent.q;
        const dr = targetCell.r - selectedAgent.r;
        const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
        const stepQ = dq / dist;
        const stepR = dr / dist;
        
        let hits = 0;
        for (let s = 1; s <= dist; s++) {
            const q = Math.round(selectedAgent.q + stepQ * s);
            const r = Math.round(selectedAgent.r + stepR * s);
            const cell = grid.get(getKey(q, r));
            
            if (cell) {
                if (cell.entity && cell.entity.faction !== currentPlayer) {
                    mainLineTargets.push({ target: cell.entity, cell });
                    hits++;
                } else if (cell.type === 'wall' || cell.type === 'barricade') {
                    mainLineTargets.push({ target: cell, cell });
                    hits++;
                }
                if (hits >= maxT) break;
            }
        }
    } else {
        // Logica standard (solo demoBuff senza cecchino)
        const targetData = validActionTargets.find(t => t.q === targetCell.q && t.r === targetCell.r);
        const finalTarget = targetData ? targetData.target : (targetCell.entity || targetCell);
        mainLineTargets.push({ target: finalTarget, cell: targetCell });
    }

    // Risoluzione danni (resta invariata)
    const damageMap = new Map();
    const mainDmg = selectedAgent.dmg;
    const splashDmg = Math.ceil(mainDmg / 2);

    mainLineTargets.forEach(item => {
        damageMap.set(item.target, (damageMap.get(item.target) || 0) + mainDmg);

        if (selectedAgent.demoBuff) {
            playSpecialVFX(item.cell, '#ff8800', '💥 BOOM!');
            hexDirections.forEach(dir => {
                const adjCell = grid.get(getKey(item.cell.q + dir.q, item.cell.r + dir.r));
                if (adjCell) {
                    if (adjCell.entity && adjCell.entity.faction !== currentPlayer)
                        damageMap.set(adjCell.entity, (damageMap.get(adjCell.entity) || 0) + splashDmg);
                    else if (adjCell.type === 'wall' || adjCell.type === 'barricade')
                        damageMap.set(adjCell, (damageMap.get(adjCell) || 0) + splashDmg);
                }
            });
        }
    });

    // 3. Risolve il combattimento usando la logica centralizzata!
    resolveCombatDamage(damageMap, selectedAgent);

    drawLaserBeam(selectedAgent, targetCell);
    return { success: true, actionCost: 1 };
});


// ============================================================
// TURN RESET HOOK — pulizia buff/debuff
// ============================================================
// Eseguito all'inizio di ogni resetTurnState (prima dell'AP refresh).

registerTurnResetHook(function () {
    // Pulisce i buff di TUTTI i giocatori
    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p]) continue;
        players[p].agents.forEach(a => {
            if (a.sniperBuff) { a.rng = a.originalRng; a.sniperBuff = false; a.sniperPierce = false; }
            if (a.demoBuff)   { a.dmg = a.originalDmg; a.demoBuff   = false; }
            a.infiltrateBuff = false;
            a.fortinoActive  = false;
            a.fortinoBuilds  = 0;
            a.pierceCount = 0;
            // Nota: shielded e empDebuff persistono deliberatamente
        });
    }

    // Applica EMP al giocatore che sta per iniziare
    players[currentPlayer]?.agents.forEach(a => {
        if (a.empDebuff > 0) {
            const loss = a.empDebuff;
            a.ap = Math.max(0, (a.ap || GAME.AP_PER_TURN) - loss);
            playSpecialVFX(a, '#ff00cc', `⚡ -${loss} AP (EMP)`);
            a.empDebuff = 0;
        }
    });
});


// ============================================================
// DRAW HOOK — Effetti grafici su entità (Scudo e Medikit)
// ============================================================

registerDrawHook(function () {
    grid.forEach(cell => {
        const entity = cell.entity;
        if (!entity) return;

        // Disegna anello Scudo Elettronico
        if (entity.shielded) {
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
        }

        // Disegna icona Medikit Equipaggiato (Croce verde)
        if (entity.medikitBuff) {
            const p = hexToPixel(cell.q, cell.r);
            ctx.save();
            ctx.fillStyle = '#00ff88';
            ctx.font = `bold ${Math.round(HEX_SIZE * 0.4)}px Arial`;
            ctx.textAlign = 'center';
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#00ff88';
            // Posizionata in alto a sinistra rispetto all'agente
            ctx.fillText('✚', p.x - HEX_SIZE * 0.45, p.y - HEX_SIZE * 0.45);
            ctx.restore();
        }
    });
});


