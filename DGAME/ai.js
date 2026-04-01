/* ============================================================
   ai.js — Intelligenza Artificiale Strategica (V15 - Demolitore)
   ============================================================ */

async function executeAITurn() {
    if (state !== 'PLAYING' || currentPlayer <= 1 || !isAIActive()) return;

    const aiFaction = currentPlayer;
    const myAgents = players[aiFaction].agents.filter(a => a.hp > 0);
    if (myAgents.length === 0) { endTurn(); return; }

    console.log(`[AI V15] Fazione ${players[aiFaction].name}: Avvio Protocollo Assedio...`);

    // --- 1. SIMULAZIONE STATO VIRTUALE ---
    const virtualOccupied = new Set();
    const virtualHP = new Map();

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
        ref: a, q: a.q, r: a.r, ap: 3, 
        visited: new Set([getKey(a.q, a.r)]) 
    }));
    
    let masterPlan = [];
    let totalApToSpend = vAgents.length * 3;
    let iterations = 0;
    const maxIterations = 60;

    // --- 2. GENERAZIONE DEL PIANO ---
    while (totalApToSpend > 0 && iterations < maxIterations) {
        let actionFoundInThisPass = false;
        iterations++;

        for (let va of vAgents) {
            if (va.ap <= 0) continue;

            let bestAction = null;
            let maxScore = -Infinity;
            const navTarget = getHuntingTarget(va, aiFaction);

            // --- A. PRIORITÀ: ATTACCO NEMICI (AGENTI > HQ) ---
            const combatTargets = getVirtualTargets(va, aiFaction, virtualHP, false);
            for (let t of combatTargets) {
                let score = (t.type === 'agent') ? 120000 : 40000;
                if (t.hp <= va.ref.dmg) score += 80000; 

                if (score > maxScore) {
                    maxScore = score;
                    bestAction = { type: 'shoot', q: t.q, r: t.r, cost: 1, targetRef: t.targetRef, subType: t.type };
                }
            }

            // --- B. PRIORITÀ: MOVIMENTO DI AVVICINAMENTO ---
            const moves = getVirtualMoves(va, virtualOccupied);
            let currentDist = hexDistance({q: va.q, r: va.r}, navTarget);
            let canGetCloser = false;

            for (let m of moves) {
                if (va.visited.has(getKey(m.q, m.r))) continue; 
                let mDist = hexDistance(m, navTarget);

                if (mDist < currentDist) {
                    let moveScore = 80000 + (currentDist - mDist) * 3000;
                    if (moveScore > maxScore) {
                        maxScore = moveScore;
                        bestAction = { type: 'move', q: m.q, r: m.r, cost: 1 };
                        canGetCloser = true;
                    }
                }
            }

            // --- C. PRIORITÀ: ASSEDIO (DISTRUZIONE OSTACOLI BLOCCANTI) ---
            // Se non può sparare a nemici e non può AVVICINARSI, deve distruggere ciò che ha davanti
            if (!canGetCloser && va.ap > 0) {
                const obstacles = getVirtualTargets(va, aiFaction, virtualHP, true);
                for (let obs of obstacles) {
                    let distWallToTarget = hexDistance({q: obs.q, r: obs.r}, navTarget);
                    
                    // Se l'ostacolo è adiacente e "blocca" (è più vicino al target di me)
                    if (hexDistance({q: va.q, r: va.r}, obs) === 1 && distWallToTarget < currentDist) {
                        // PUNTEGGIO ASSEDIO: deve essere superiore al movimento laterale (50k - 60k)
                        let siegeScore = (obs.type === 'barricade') ? 60000 : 45000;
                        if (obs.hp <= va.ref.dmg) siegeScore += 10000; // Bonus distruzione immediata

                        if (siegeScore > maxScore) {
                            maxScore = siegeScore;
                            bestAction = { type: 'shoot', q: obs.q, r: obs.r, cost: 1, targetRef: obs.targetRef, subType: obs.type };
                        }
                    }
                }
            }

            // --- D. PRIORITÀ: MOVIMENTO LATERALE (SOLO SE NON PUÒ ASSEDIARE) ---
            if (bestAction === null || (bestAction.type === 'move' && !canGetCloser)) {
                for (let m of moves) {
                    if (va.visited.has(getKey(m.q, m.r))) continue;
                    if (hexDistance(m, navTarget) === currentDist) {
                        let lateralScore = 30000; 
                        if (lateralScore > maxScore) {
                            maxScore = lateralScore;
                            bestAction = { type: 'move', q: m.q, r: m.r, cost: 1 };
                        }
                    }
                }
            }

            // --- REGISTRAZIONE ---
            if (bestAction) {
                masterPlan.push({ agent: va.ref, ...bestAction });
                va.ap -= bestAction.cost;
                totalApToSpend -= bestAction.cost;
                actionFoundInThisPass = true;

                const tKey = getKey(bestAction.q, bestAction.r);
                if (bestAction.type === 'move') {
                    virtualOccupied.delete(getKey(va.q, va.r));
                    va.q = bestAction.q; va.r = bestAction.r;
                    virtualOccupied.add(tKey);
                    va.visited.add(tKey);
                } else if (bestAction.type === 'shoot') {
                    let newHP = (virtualHP.get(tKey) || 0) - va.ref.dmg;
                    virtualHP.set(tKey, newHP);
                    if (newHP <= 0) virtualOccupied.delete(tKey);
                }
            }
        }
        if (!actionFoundInThisPass) break;
    }

    // --- 3. ESECUZIONE ---
    for (const step of masterPlan) {
        if (state !== 'PLAYING' || currentPlayer !== aiFaction) break;
        selectedAgent = step.agent;
        if (selectedAgent.hp <= 0 || selectedAgent.ap < step.cost) continue;

        const targetCell = grid.get(getKey(step.q, step.r));
        if (!targetCell) continue;

        if (step.type === 'shoot') {
            const isStillValid = targetCell.entity || targetCell.type === 'wall' || targetCell.type === 'barricade';
            if (!isStillValid || (targetCell.entity && targetCell.entity.faction === aiFaction)) continue;
            
            validActionTargets = [{ 
                q: step.q, r: step.r, target: step.targetRef, 
                isEnemy: (step.subType === 'agent' || step.subType === 'hq'),
                isObstacle: (step.subType === 'wall' || step.subType === 'barricade')
            }];
        } else {
            validActionTargets = [{ q: step.q, r: step.r }];
        }

        currentActionMode = step.type;
        executeAction(targetCell);
        drawGame();
        await delay(800);
    }

    if (currentPlayer === aiFaction) endTurn();
}

// --- UTILS ---

function getHuntingTarget(va, faction) {
    let closest = null, minDist = Infinity;
    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === faction) continue;
        players[p].agents.forEach(enemy => {
            if (enemy.hp > 0) {
                let d = hexDistance({q: va.q, r: va.r}, enemy);
                if (d < minDist) { minDist = d; closest = enemy; }
            }
        });
        if (players[p].hq && players[p].hq.hp > 0) {
            let dHQ = hexDistance({q: va.q, r: va.r}, players[p].hq) + 12;
            if (dHQ < minDist) { minDist = dHQ; closest = players[p].hq; }
        }
    }
    return closest;
}

function getVirtualTargets(va, faction, virtualHP, getObstacles) {
    let res = [];
    hexDirections.forEach(dir => {
        for (let d = 1; d <= va.ref.rng; d++) {
            let nq = va.q + (dir.q * d), nr = va.r + (dir.r * d);
            const key = getKey(nq, nr);
            let cell = grid.get(key);
            if (!cell) break;
            let vhp = virtualHP.get(key);
            if (cell.entity) {
                if (vhp > 0 && cell.entity.faction !== faction && !getObstacles) {
                    res.push({ type: cell.entity.type, q: nq, r: nr, hp: vhp, targetRef: cell.entity });
                }
                if (vhp > 0) break; else continue;
            }
            if (cell.type === 'wall' || cell.type === 'barricade') {
                if (vhp > 0 && getObstacles) {
                    res.push({ type: cell.type, q: nq, r: nr, hp: vhp, targetRef: cell });
                }
                if (vhp > 0) break; else continue;
            }
        }
    });
    return res;
}

function getVirtualMoves(va, virtualOccupied) {
    let moves = [];
    let visited = new Set([getKey(va.q, va.r)]);
    let queue = [{ q: va.q, r: va.r, d: 0 }];
    while (queue.length > 0) {
        let curr = queue.shift();
        if (curr.d > 0) moves.push({ q: curr.q, r: curr.r });
        if (curr.d < va.ref.mov) {
            hexDirections.forEach(dir => {
                let nq = curr.q + dir.q, nr = curr.r + dir.r;
                let key = getKey(nq, nr), cell = grid.get(key);
                if (cell && cell.type === 'empty' && !cell.entity && !virtualOccupied.has(key) && !visited.has(key)) {
                    visited.add(key); queue.push({ q: nq, r: nr, d: curr.d + 1 });
                }
            });
        }
    }
    return moves;
}