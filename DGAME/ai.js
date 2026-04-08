/* ============================================================
   ai.js — Intelligenza Artificiale Strategica (V15 - Demolitore)
   ============================================================
   ESPONE: executeAITurn
   DIPENDE DA: constants.js (hexDirections, hexDistance, getKey, delay),
               state.js (players, grid, currentPlayer, totalPlayers,
                         selectedAgent, validActionTargets, currentActionMode,
                         state),
               gamelogic.js (endTurn, executeAction, drawGame),
               multiplayer.js (isOnline, isHost, onlineAIFactions)
   ============================================================ */

async function executeAITurn() {


    if (typeof executeDeepAITurn === "function") {
    const used = await executeDeepAITurn();
    if (used) return;
    }

    // Modalità locale: richiede checkbox attivo e fazione > 1
    // Modalità online: basta che la fazione corrente sia nella lista AI dell'host
    if (state !== 'PLAYING' || (!isHostAITurn() && !isCurrentPlayerAI())) return;

    const aiFaction = currentPlayer;
    const myAgents  = players[aiFaction].agents.filter(a => a.hp > 0);
    if (myAgents.length === 0) { endTurn(); return; }

    console.log(`[AI V15] Fazione ${players[aiFaction].name}: Avvio Protocollo Assedio...`);

    // --- 1. SIMULAZIONE STATO VIRTUALE ---
    // Clona occupazione e HP per pianificare senza modificare lo stato reale
    const virtualOccupied = new Set();
    const virtualHP       = new Map();

    grid.forEach(cell => {
        const key = getKey(cell.q, cell.r);
        if (cell.entity) {
            virtualOccupied.add(key);
            virtualHP.set(key, cell.entity.hp);
        } else if (cell.type === 'wall' || cell.type === 'barricade') {
            virtualOccupied.add(key);
            virtualHP.set(key, cell.hp);
        }
    });

    const vAgents = myAgents.map(a => ({
        ref: a, q: a.q, r: a.r, ap: GAME.AP_PER_TURN,
        visited: new Set([getKey(a.q, a.r)]),
    }));

    let masterPlan     = [];
    let totalApToSpend = vAgents.length * 3;
    let iterations     = 0;
    const maxIterations = 60;

    // --- 2. GENERAZIONE DEL PIANO ---
    while (totalApToSpend > 0 && iterations < maxIterations) {
        let actionFoundInThisPass = false;
        iterations++;

        for (const va of vAgents) {
            if (va.ap <= 0) continue;

            let bestAction = null;
            let maxScore   = -Infinity;
            const navTarget = getHuntingTarget(va, aiFaction);

            // --- A. PRIORITÀ: ATTACCO NEMICI (agenti prima degli HQ) ---
            const combatTargets = getVirtualTargets(va, aiFaction, virtualHP, false);
            for (const t of combatTargets) {

    // 🔴 PRENDI LA CELLA DEL TARGET
    const cell = grid.get(getKey(t.q, t.r));

    // 🔴 CALCOLA HP "PERCEPITI"
    let effectiveHp = t.hp;

    // 🔴 COPERTURA: simula riduzione danno
    if (cell && cell.terrain === 'copertura') {
        effectiveHp += 1;
    }

    let score = t.type === 'agent' ? 120000 : 40000;

    // 🔴 USA effectiveHp invece di t.hp
    if (effectiveHp <= va.ref.dmg) score += 80000;
            
                if (score > maxScore) {
                    maxScore   = score;
                    bestAction = { type: 'shoot', q: t.q, r: t.r, cost: 1, targetRef: t.targetRef, subType: t.type };
                }
            }

            // --- B. PRIORITÀ: AVVICINAMENTO AL BERSAGLIO ---
            const moves       = getVirtualMoves(va, virtualOccupied);
            const currentDist = hexDistance({ q: va.q, r: va.r }, navTarget);
            let canGetCloser  = false;

            for (const m of moves) {
                if (va.visited.has(getKey(m.q, m.r))) continue;
                const mDist = hexDistance(m, navTarget);
                if (mDist < currentDist) {
                    const moveScore = 80000 + (currentDist - mDist) * 3000;
                    if (moveScore > maxScore) {
                        maxScore      = moveScore;
                        bestAction    = { type: 'move', q: m.q, r: m.r, cost: 1 };
                        canGetCloser  = true;
                    }
                }
            }

            // --- C. PRIORITÀ: ASSEDIO (distrugge ostacoli bloccanti sul percorso) ---
            // Attivato solo quando non può né sparare né avvicinarsi
            if (!canGetCloser && va.ap > 0) {
                const obstacles = getVirtualTargets(va, aiFaction, virtualHP, true);
                for (const obs of obstacles) {
                    const distWallToTarget = hexDistance({ q: obs.q, r: obs.r }, navTarget);
                    // L'ostacolo blocca il cammino: è adiacente e più vicino al target di quanto lo sia l'AI
                    if (hexDistance({ q: va.q, r: va.r }, obs) === 1 && distWallToTarget < currentDist) {
                        let siegeScore = obs.type === 'barricade' ? 60000 : 45000;
                        if (obs.hp <= va.ref.dmg) siegeScore += 10000; // bonus distruzione immediata

                        if (siegeScore > maxScore) {
                            maxScore   = siegeScore;
                            bestAction = { type: 'shoot', q: obs.q, r: obs.r, cost: 1, targetRef: obs.targetRef, subType: obs.type };
                        }
                    }
                }
            }

            // --- D. PRIORITÀ: MOVIMENTO LATERALE (solo se non può assediare) ---
            if (bestAction === null || (bestAction.type === 'move' && !canGetCloser)) {
                for (const m of moves) {
                    if (va.visited.has(getKey(m.q, m.r))) continue;
                    if (hexDistance(m, navTarget) === currentDist) {
                        const lateralScore = 30000;
                        if (lateralScore > maxScore) {
                            maxScore   = lateralScore;
                            bestAction = { type: 'move', q: m.q, r: m.r, cost: 1 };
                        }
                    }
                }
            }

            // --- REGISTRAZIONE AZIONE NEL PIANO ---
            if (bestAction) {
                masterPlan.push({ agent: va.ref, ...bestAction });
                va.ap          -= bestAction.cost;
                totalApToSpend -= bestAction.cost;
                actionFoundInThisPass = true;

                const tKey = getKey(bestAction.q, bestAction.r);
                if (bestAction.type === 'move') {
                    virtualOccupied.delete(getKey(va.q, va.r));
                    va.q = bestAction.q; va.r = bestAction.r;
                    virtualOccupied.add(tKey);
                    va.visited.add(tKey);
                } else if (bestAction.type === 'shoot') {
                    const newHP = (virtualHP.get(tKey) || 0) - va.ref.dmg;
                    virtualHP.set(tKey, newHP);
                    if (newHP <= 0) virtualOccupied.delete(tKey);
                }
            }
        }
        if (!actionFoundInThisPass) break;
    }

    // --- 3. ESECUZIONE ANIMATA ---
    for (const step of masterPlan) {
        if (state !== 'PLAYING' || currentPlayer !== aiFaction) break;
        selectedAgent = step.agent;
        if (selectedAgent.hp <= 0 || selectedAgent.ap < step.cost) continue;

        const targetCell = grid.get(getKey(step.q, step.r));
        if (!targetCell) continue;

        if (step.type === 'shoot') {
            const isStillValid = targetCell.entity || targetCell.type === 'wall' || targetCell.type === 'barricade';
            if (!isStillValid || targetCell.entity?.faction === aiFaction) continue;

            validActionTargets = [{
                q: step.q, r: step.r, target: step.targetRef,
                isEnemy:   (step.subType === 'agent' || step.subType === 'hq'),
                isObstacle:(step.subType === 'wall'  || step.subType === 'barricade'),
            }];
        } else {
            validActionTargets = [{ q: step.q, r: step.r }];
        }

        currentActionMode = step.type;
        executeAction(targetCell);
        drawGame();
        await delay(GAME.AI_STEP_DELAY_MS);
    }

    if (currentPlayer === aiFaction) endTurn();
}

// ============================================================
// UTILS AI
// ============================================================

/**
 * Restituisce il bersaglio più vicino da cacciare per un agente virtuale.
 * Agenti nemici hanno priorità sugli HQ (distanza HQ penalizzata di +12).
 */
function getHuntingTarget(va, faction) {
    let closest = null, minDist = Infinity;

    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === faction) continue;

        players[p].agents.forEach(enemy => {
            if (enemy.hp > 0) {
                const d = hexDistance({ q: va.q, r: va.r }, enemy);
                if (d < minDist) { minDist = d; closest = enemy; }
            }
        });

        if (players[p].hq?.hp > 0) {
            const dHQ = hexDistance({ q: va.q, r: va.r }, players[p].hq) + 12;
            if (dHQ < minDist) { minDist = dHQ; closest = players[p].hq; }
        }
    }
    return closest;
}

/**
 * Restituisce le celle bersaglio sparabili dall'agente virtuale.
 * @param {boolean} getObstacles - true = restituisce muri/barricate; false = entità nemiche
 */
function getVirtualTargets(va, faction, virtualHP, includeObstacles) {
    const targets = [];
    const agent = va.ref;

    // 🔴 ALTURA: +1 range
    let currentRng = agent.rng;
    const originCell = grid.get(getKey(va.q, va.r));
    if (originCell && originCell.terrain === 'altura') {
        currentRng += 1;
    }

    hexDirections.forEach(dir => {
        for (let d = 1; d <= currentRng; d++) {
            const q = va.q + dir.q * d;
            const r = va.r + dir.r * d;
            const key = getKey(q, r);
            const cell = grid.get(key);

            if (!cell) break;

            // 🔴 NEBBIA: blocca oltre distanza 1
            if (cell.terrain === 'nebbia' && d > 1) break;

            // --- ENTITÀ ---
            if (cell.entity) {
                if (cell.entity.faction === faction) break;

                targets.push({
                    q, r,
                    type: 'agent',
                    hp: virtualHP.get(key) ?? cell.entity.hp,
                    targetRef: cell.entity
                });

                break;
            }

            // --- OSTACOLI ---
            if (cell.type === 'wall' || cell.type === 'barricade') {
                if (!includeObstacles) break;

                targets.push({
                    q, r,
                    type: cell.type,
                    hp: virtualHP.get(key) ?? cell.hp,
                    targetRef: cell
                });

                break;
            }
        }
    });

    return targets;
}

/**
 * Restituisce tutte le celle raggiungibili dall'agente virtuale
 * usando un BFS limitato al suo raggio di movimento.
 */
function getVirtualMoves(va, virtualOccupied) {
    const moves = [];
    const originCell = grid.get(getKey(va.q, va.r));

    // 🔴 FANGO: movimento limitato a 1
    if (originCell && originCell.terrain === 'fango') {
        hexDirections.forEach(dir => {
            const nq = va.q + dir.q;
            const nr = va.r + dir.r;
            const key = getKey(nq, nr);
            const cell = grid.get(key);

            if (cell && cell.type === 'empty' && !virtualOccupied.has(key)) {
                moves.push({ q: nq, r: nr });
            }
        });

        return moves; // 🔒 blocca BFS normale
    }

    // --- BFS NORMALE ---
    const visited = new Set([getKey(va.q, va.r)]);
    const queue   = [{ q: va.q, r: va.r, dist: 0 }];

    while (queue.length > 0) {
        const curr = queue.shift();

        if (curr.dist > 0) {
            moves.push({ q: curr.q, r: curr.r });
        }

        if (curr.dist < va.ref.mov) {
            hexDirections.forEach(dir => {
                const nq = curr.q + dir.q;
                const nr = curr.r + dir.r;
                const key = getKey(nq, nr);
                const cell = grid.get(key);

                if (!cell || visited.has(key)) return;
                if (cell.type !== 'empty' || virtualOccupied.has(key)) return;

                visited.add(key);
                queue.push({ q: nq, r: nr, dist: curr.dist + 1 });
            });
        }
    }

    return moves;
}
