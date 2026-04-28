/* ============================================================
   ai.js — Intelligenza Artificiale Strategica (V16 - Cacciatore)
   ============================================================
   ESPONE: executeAITurn
   DIPENDE DA: constants.js  (hexDirections, hexDistance, getKey,
                              delay, GAME, SPRITE_POOLS)
               state.js      (players, grid, currentPlayer,
                              totalPlayers, selectedAgent,
                              validActionTargets, currentActionMode,
                              state)
               gamelogic.js  (endTurn, executeAction,
                              isCurrentPlayerAI, isHostAITurn)
               network_core.js (isOnline, isHost, onlineAIFactions)
               graphics.js   (drawGame)
               deep_ai.js    (executeDeepAITurn) — opzionale

   ARCHITETTURA — PIPELINE IN DUE FASI:
   1. PIANIFICAZIONE (virtuale, sincrona):
      Simula mosse su stato virtuale (virtualOccupied, virtualHP)
      senza toccare lo stato reale. Produce masterPlan[].
   2. ESECUZIONE (reale, animata, asincrona):
      Esegue ogni step del piano con executeAction() e delay tra
      un'azione e l'altra per l'effetto visivo animato.

   PRIORITÀ AZIONI — tutte valutate in parallelo, vince il massimo:
     200.000  Kill garantito agente nemico
     150.000  Kill garantito HQ nemico
     120.000  Attaccare agente nemico (non kill) + bonus ferito
      90.000  Avvicinarsi al bersaglio (+4000 per cella guadagnata)
      70.000  Attaccare HQ nemico (non kill)
      60.000  Assedio barricata bloccante (+15000 se distruzione immediata)
      45.000  Assedio muro bloccante (+15000 se distruzione immediata)
      35.000  Cura alleato ferito (+3000 per HP mancante, min 2 HP mancanti)
      20.000  Movimento laterale (stessa distanza dal target)
       5.000  Fallback garantito: qualsiasi mossa non visitata

   NOTA CHIAVE — nessuna categoria si esclude a vicenda:
     Tutte le categorie A-F vengono sempre valutate. Ogni candidato
     va in un array comune; vince sempre il massimo. Il fallback (F)
     garantisce che se ci sono AP rimasti e mosse disponibili,
     viene sempre prodotta un'azione — l'AI non si ferma mai.

   BERSAGLIO DI CACCIA (getHuntingTarget):
     Agenti nemici feriti: distanza - bonus (fino a -4 per HP mancanti)
     → spinge l'AI a finire i bersagli già danneggiati
     Agenti nemici integri: distanza reale
     HQ nemici: distanza + 10 (priorità inferiore agli agenti)

   TERRENI SUPPORTATI:
     fango     → BFS limitato a distanza 1 in getVirtualMoves()
     altura    → +1 gittata in getVirtualTargets()
     nebbia    → tiro bloccato oltre distanza 1 in getVirtualTargets()
     copertura → HP percepito +1 nel calcolo del punteggio attacco

   INVARIANTI:
   - Lo stato reale non viene mai modificato durante la pianificazione.
   - _planBestAction() restituisce SEMPRE un'azione se l'agente ha
     mosse o bersagli disponibili (fallback garantito).
   - La fase di esecuzione controlla state e currentPlayer prima
     di ogni step: se qualcuno ha vinto o il turno è cambiato,
     l'esecuzione si interrompe.
   - MAX_ITER (90) previene loop infiniti nel pianificatore.
   ============================================================ */


// ============================================================
// PUNTO DI INGRESSO
// ============================================================

async function executeAITurn() {

    if (typeof executeDeepAITurn === 'function') {
        const used = await executeDeepAITurn();
        if (used) return;
    }

    if (state !== 'PLAYING' || (!isHostAITurn() && !isCurrentPlayerAI())) return;

    const aiFaction = currentPlayer;
    const myAgents  = players[aiFaction].agents.filter(a => a.hp > 0);
    if (myAgents.length === 0) { endTurn(); return; }

    console.log(`[AI V16] Fazione ${players[aiFaction].name}: Protocollo Cacciatore attivo`);

    // ── FASE 1: PIANIFICAZIONE VIRTUALE ──────────────────────

    const { virtualOccupied, virtualHP } = _buildVirtualState();

    const vAgents = myAgents.map(a => ({
        ref:     a,
        q:       a.q,
        r:       a.r,
        ap:      GAME.AP_PER_TURN,
        visited: new Set([getKey(a.q, a.r)]),
    }));

    const masterPlan   = [];
    let totalApToSpend = vAgents.length * GAME.AP_PER_TURN;
    let iterations     = 0;
    const MAX_ITER     = 90;

    while (totalApToSpend > 0 && iterations < MAX_ITER) {
        let actionFoundThisPass = false;
        iterations++;

        for (const va of vAgents) {
            if (va.ap <= 0) continue;

            const action = _planBestAction(va, aiFaction, virtualOccupied, virtualHP);
            if (!action) continue;

            masterPlan.push({ agent: va.ref, ...action });
            va.ap          -= action.cost;
            totalApToSpend -= action.cost;
            actionFoundThisPass = true;

            _applyVirtualAction(va, action, virtualOccupied, virtualHP);
        }

        if (!actionFoundThisPass) break;
    }

    // ── FASE 2: ESECUZIONE ANIMATA ────────────────────────────

    for (const step of masterPlan) {
        if (state !== 'PLAYING' || currentPlayer !== aiFaction) break;

        selectedAgent = step.agent;
        if (selectedAgent.hp <= 0 || selectedAgent.ap < step.cost) continue;

        const targetCell = grid.get(getKey(step.q, step.r));
        if (!targetCell) continue;

        if (step.type === 'shoot') {
            const isStillValid = targetCell.entity
                || targetCell.type === 'wall'
                || targetCell.type === 'barricade';
            if (!isStillValid || targetCell.entity?.faction === aiFaction) continue;

            validActionTargets = [{
                q:          step.q,
                r:          step.r,
                target:     step.targetRef,
                isEnemy:    (step.subType === 'agent' || step.subType === 'hq'),
                isObstacle: (step.subType === 'wall'  || step.subType === 'barricade'),
            }];

        } else if (step.type === 'heal') {
            if (!targetCell.entity || targetCell.entity.faction !== aiFaction) continue;
            if (targetCell.entity.hp >= targetCell.entity.maxHp) continue;
            validActionTargets = [targetCell];

        } else {
            // move
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
// PIANIFICAZIONE — helper privati
// ============================================================

function _buildVirtualState() {
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

    return { virtualOccupied, virtualHP };
}

/**
 * Sceglie la migliore azione per un agente virtuale.
 *
 * Tutte le categorie A-F vengono SEMPRE valutate senza esclusioni.
 * I candidati competono per score — vince il massimo.
 * Il fallback F garantisce che l'agente non sprechi mai AP se ha mosse.
 */
function _planBestAction(va, faction, virtualOccupied, virtualHP) {
    const candidates = [];

    const navTarget   = getHuntingTarget(va, faction);
    if (!navTarget) return null;

    const currentDist = hexDistance({ q: va.q, r: va.r }, navTarget);
    const moves       = getVirtualMoves(va, virtualOccupied);

    // --- A. ATTACCO NEMICI ---
    const combatTargets = getVirtualTargets(va, faction, virtualHP, false);
    for (const t of combatTargets) {
        const cell      = grid.get(getKey(t.q, t.r));
        let effectiveHp = t.hp;
        if (cell?.terrain === 'copertura') effectiveHp += 1;

        let score;
        if (t.type === 'hq') {
            score = effectiveHp <= va.ref.dmg ? 150000 : 70000;
        } else {
            // Kill garantito: priorità assoluta
            if (effectiveHp <= va.ref.dmg) {
                score = 200000;
            } else {
                // Non kill: bonus proporzionale ai danni inflitti
                score = 120000 + Math.max(0, (4 - effectiveHp)) * 5000;
            }
        }

        candidates.push({
            score,
            action: {
                type:      'shoot',
                q:         t.q,
                r:         t.r,
                cost:      1,
                targetRef: t.targetRef,
                subType:   t.type,
            },
        });
    }

    // --- B. AVVICINAMENTO AL BERSAGLIO ---
    for (const m of moves) {
        if (va.visited.has(getKey(m.q, m.r))) continue;
        const mDist = hexDistance(m, navTarget);
        if (mDist < currentDist) {
            // Bonus extra se dalla nuova posizione si può già sparare al target
            const wouldBeInRange = mDist <= va.ref.rng;
            const score = 90000 + (currentDist - mDist) * 4000 + (wouldBeInRange ? 8000 : 0);
            candidates.push({
                score,
                action: { type: 'move', q: m.q, r: m.r, cost: 1 },
            });
        }
    }

    // --- C. ASSEDIO: ostacoli bloccanti ---
    const obstacles = getVirtualTargets(va, faction, virtualHP, true);
    for (const obs of obstacles) {
        const distObsToTarget = hexDistance({ q: obs.q, r: obs.r }, navTarget);
        const isAdjacent      = hexDistance({ q: va.q, r: va.r }, obs) === 1;
        const isBlocking      = isAdjacent && distObsToTarget < currentDist;
        if (!isBlocking) continue;

        let score = obs.type === 'barricade' ? 60000 : 45000;
        if (obs.hp <= va.ref.dmg) score += 15000;

        candidates.push({
            score,
            action: {
                type:      'shoot',
                q:         obs.q,
                r:         obs.r,
                cost:      1,
                targetRef: obs.targetRef,
                subType:   obs.type,
            },
        });
    }

    // --- D. CURA ALLEATO (costa 2 AP) ---
    if (va.ap >= 2) {
        hexDirections.forEach(dir => {
            const nq   = va.q + dir.q;
            const nr   = va.r + dir.r;
            const cell = grid.get(getKey(nq, nr));
            if (!cell?.entity) return;
            const ally = cell.entity;
            if (ally.faction !== faction || ally.hp >= ally.maxHp) return;

            const missingHP = ally.maxHp - ally.hp;
            // Cura solo se significativa (≥ 2 HP mancanti)
            if (missingHP < 2) return;

            // Score più alto se l'alleato è quasi morto
            const urgency = ally.hp <= 1 ? 15000 : 0;
            const score   = 35000 + missingHP * 3000 + urgency;
            candidates.push({
                score,
                action: {
                    type:      'heal',
                    q:         nq,
                    r:         nr,
                    cost:      2,
                    targetRef: ally,
                    subType:   'ally',
                },
            });
        });
    }

    // --- E. MOVIMENTO LATERALE ---
    for (const m of moves) {
        if (va.visited.has(getKey(m.q, m.r))) continue;
        if (hexDistance(m, navTarget) === currentDist) {
            candidates.push({
                score:  20000,
                action: { type: 'move', q: m.q, r: m.r, cost: 1 },
            });
        }
    }

    // --- F. FALLBACK GARANTITO ---
    // Se nessuna categoria ha prodotto candidati (agente completamente
    // circondato o tutti i bersagli fuori range), prende qualsiasi
    // mossa non visitata. Impedisce AP sprecati a stare fermi.
    if (candidates.length === 0) {
        for (const m of moves) {
            if (!va.visited.has(getKey(m.q, m.r))) {
                candidates.push({
                    score:  5000,
                    action: { type: 'move', q: m.q, r: m.r, cost: 1 },
                });
                break;
            }
        }
    }

    if (candidates.length === 0) return null;

    // Vince il candidato con score più alto
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].action;
}

/**
 * Aggiorna lo stato virtuale dopo aver pianificato un'azione.
 */
function _applyVirtualAction(va, action, virtualOccupied, virtualHP) {
    const tKey = getKey(action.q, action.r);

    if (action.type === 'move') {
        virtualOccupied.delete(getKey(va.q, va.r));
        va.q = action.q;
        va.r = action.r;
        virtualOccupied.add(tKey);
        va.visited.add(tKey);
    } else if (action.type === 'shoot') {
        const newHP = (virtualHP.get(tKey) || 0) - va.ref.dmg;
        virtualHP.set(tKey, newHP);
        if (newHP <= 0) virtualOccupied.delete(tKey);
    }
    // heal: nessuna modifica allo stato virtuale (HP reali non cambiano qui)
}


// ============================================================
// UTILS AI — bersaglio e movimento
// ============================================================

/**
 * Restituisce il bersaglio più prioritario da cacciare.
 *
 * Novità V16: gli agenti feriti sembrano "più vicini" al pianificatore
 * (distanza penalizzata fino a -4 per HP mancanti). Questo spinge
 * l'AI a finire i bersagli già danneggiati invece di cambiare target.
 */
function getHuntingTarget(va, faction) {
    let closest = null, minDist = Infinity;

    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === faction) continue;

        players[p].agents.forEach(enemy => {
            if (enemy.hp <= 0) return;
            const rawDist    = hexDistance({ q: va.q, r: va.r }, enemy);
            const woundBonus = Math.min(4, enemy.maxHp - enemy.hp);
            const d          = rawDist - woundBonus;
            if (d < minDist) { minDist = d; closest = enemy; }
        });

        if (players[p].hq?.hp > 0) {
            const dHQ = hexDistance({ q: va.q, r: va.r }, players[p].hq) + 10;
            if (dHQ < minDist) { minDist = dHQ; closest = players[p].hq; }
        }
    }

    return closest;
}

/**
 * Restituisce i bersagli sparabili nella posizione corrente dell'agente virtuale.
 * Per ogni direzione scansiona fino a rng celle; si ferma al primo ostacolo/entità.
 */
function getVirtualTargets(va, faction, virtualHP, includeObstacles) {
    const targets    = [];
    let   currentRng = va.ref.rng;

    const originCell = grid.get(getKey(va.q, va.r));
    if (originCell?.terrain === 'altura') currentRng += 1;

    hexDirections.forEach(dir => {
        for (let d = 1; d <= currentRng; d++) {
            const q    = va.q + dir.q * d;
            const r    = va.r + dir.r * d;
            const key  = getKey(q, r);
            const cell = grid.get(key);
            if (!cell) break;

            if (cell.terrain === 'nebbia' && d > 1) break;

            if (cell.entity) {
                if (cell.entity.faction === faction) break;
                targets.push({
                    q, r,
                    type:      cell.entity.type === 'hq' ? 'hq' : 'agent',
                    hp:        virtualHP.get(key) ?? cell.entity.hp,
                    targetRef: cell.entity,
                });
                break;
            }

            if (cell.type === 'wall' || cell.type === 'barricade') {
                if (!includeObstacles) break;
                targets.push({
                    q, r,
                    type:      cell.type,
                    hp:        virtualHP.get(key) ?? cell.hp,
                    targetRef: cell,
                });
                break;
            }
        }
    });

    return targets;
}

/**
 * Restituisce tutte le celle raggiungibili con BFS limitato al mov dell'agente.
 * Fango: solo celle adiacenti (mov = 1 forzato dal terreno).
 */
function getVirtualMoves(va, virtualOccupied) {
    const moves      = [];
    const originCell = grid.get(getKey(va.q, va.r));

    if (originCell?.terrain === 'fango') {
        hexDirections.forEach(dir => {
            const nq   = va.q + dir.q;
            const nr   = va.r + dir.r;
            const key  = getKey(nq, nr);
            const cell = grid.get(key);
            if (cell && cell.type === 'empty' && !virtualOccupied.has(key)) {
                moves.push({ q: nq, r: nr });
            }
        });
        return moves;
    }

    const visited = new Set([getKey(va.q, va.r)]);
    const queue   = [{ q: va.q, r: va.r, dist: 0 }];

    while (queue.length > 0) {
        const curr = queue.shift();
        if (curr.dist > 0) moves.push({ q: curr.q, r: curr.r });

        if (curr.dist < va.ref.mov) {
            hexDirections.forEach(dir => {
                const nq   = curr.q + dir.q;
                const nr   = curr.r + dir.r;
                const key  = getKey(nq, nr);
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


markScriptAsLoaded('ai.js');
