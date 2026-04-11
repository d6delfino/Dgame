/* ============================================================
   ai_bridge.js — Riscrittura pulita
   - Niente setActionMode/validActionTargets per le decisioni
   - Target calcolati localmente e in modo sincrono
   - HEAL rimosso (action=2 → move, compatibile col training)
   ============================================================ */

let deepAI = null;

// ============================================================
// 1. CARICAMENTO MODELLO
// ============================================================
async function initDeepAI() {
    console.log("[DeepAI] Caricamento modello neurale...");
    try {
        const loadedModel = await tf.loadLayersModel('model_output/model.json');
        deepAI = new DeepAI(loadedModel);
        deepAI.epsilon = 0.02;
        console.log("✅ DEEP AI CARICATA E PRONTA!");
    } catch (err) {
        console.error("❌ Errore caricamento modello:", err.message || err);
        console.warn("⚠️ Uso AI con pesi casuali (fallback).");
        deepAI = new DeepAI();
        deepAI.epsilon = 0.8;
    }
}

// ============================================================
// 2. CALCOLO TARGET LOCALE (sincrono, non tocca variabili globali)
// Replica la logica di calculateValidTargets / calculateValidMoves
// sull'agente passato, senza modificare selectedAgent o validActionTargets.
// ============================================================

function _localCalcShootTargets(agent) {
    const targets = [];
    let rng = agent.rng ?? 3;
    const originCell = grid.get(getKey(agent.q, agent.r));
    if (originCell?.terrain === 'altura') rng += 1;

    hexDirections.forEach(dir => {
        const path = [];
        for (let d = 1; d <= rng; d++) {
            const cell = grid.get(getKey(agent.q + dir.q * d, agent.r + dir.r * d));
            if (!cell) break;
            path.push({ q: cell.q, r: cell.r });

            if (cell.type === 'wall' || cell.type === 'barricade') {
                if (cell.terrain === 'nebbia' && d > 1) break;
                path.forEach(p => targets.push({ ...p, isObstacle: true, isEnemy: false, target: cell }));
                break;
            }
            if (cell.entity) {
                if (cell.terrain === 'nebbia' && d > 1) break;
                if (cell.entity.faction !== currentPlayer) {
                    path.forEach(p => targets.push({ ...p, isEnemy: true, isObstacle: false, target: cell.entity }));
                }
                break;
            }
        }
    });
    return targets;
}

function _localCalcMoveTargets(agent) {
    const targets = [];
    const visited = new Set([getKey(agent.q, agent.r)]);
    const queue   = [{ q: agent.q, r: agent.r, dist: 0 }];
    while (queue.length > 0) {
        const curr = queue.shift();
        if (curr.dist > 0) targets.push({ q: curr.q, r: curr.r });
        if (curr.dist < (agent.mov ?? 2)) {
            hexDirections.forEach(dir => {
                const nq = curr.q + dir.q, nr = curr.r + dir.r;
                const nKey = getKey(nq, nr);
                const cell = grid.get(nKey);
                if (cell && !visited.has(nKey) && cell.type === 'empty' && !cell.entity) {
                    visited.add(nKey);
                    queue.push({ q: nq, r: nr, dist: curr.dist + 1 });
                }
            });
        }
    }
    return targets;
}

// ============================================================
// 3. SELEZIONE MIGLIORE TARGET
// ============================================================

function _pickBestShootTarget(targets) {
    if (!targets.length) return null;
    // Preferisce: agente nemico quasi morto > agente nemico > HQ nemico > barricata (HP bassa) > muro
    return targets.slice().sort((a, b) => {
        const score = t => {
            if (t.isEnemy) {
                if (t.target?.type === 'agent') return 1000 + Math.max(0, 5 - (t.target.hp ?? 5)) * 100;
                if (t.target?.type === 'hq')    return 600;
            }
            if (t.isObstacle) {
                const cell = grid.get(getKey(t.q, t.r));
                const hp   = cell?.hp ?? 10;
                return cell?.type === 'barricade' ? 400 - hp * 10 : 200 - hp * 5;
            }
            return 0;
        };
        return score(b) - score(a);
    })[0];
}

function _pickBestMoveTarget(targets, agent) {
    if (!targets.length) return null;

    const enemyPositions = [];
    Object.values(players).forEach(p => {
        if (p === players[currentPlayer] || p.isDisconnected) return;
        if (p.hq?.hp > 0) enemyPositions.push(p.hq);
        (p.agents || []).forEach(a => { if (a.hp > 0) enemyPositions.push(a); });
    });
    if (!enemyPositions.length) return targets[0];

    return targets.slice().sort((a, b) => {
        const dA = Math.min(...enemyPositions.map(e => hexDistance(a, e)));
        const dB = Math.min(...enemyPositions.map(e => hexDistance(b, e)));
        if (dA !== dB) return dA - dB;
        // A parità, preferisce la cella più lontana dall'agente (sfrutta tutti i passi BFS)
        return hexDistance(agent, b) - hexDistance(agent, a);
    })[0];
}

// ============================================================
// 4. HELPER: vale la pena abbattere l'ostacolo?
// BFS 5 passi su celle libere — abbatti se non c'è percorso
// aperto che avvicini almeno 2 celle al nemico più vicino.
// ============================================================
function _shouldBreakObstacle(agent) {
    const enemyPositions = [];
    Object.values(players).forEach(p => {
        if (p === players[currentPlayer] || p.isDisconnected) return;
        if (p.hq?.hp > 0) enemyPositions.push(p.hq);
        (p.agents || []).forEach(a => { if (a.hp > 0) enemyPositions.push(a); });
    });
    if (!enemyPositions.length) return false;

    const directDist = Math.min(...enemyPositions.map(e => hexDistance(agent, e)));
    const visited    = new Set([getKey(agent.q, agent.r)]);
    const queue      = [{ q: agent.q, r: agent.r, dist: 0 }];
    let bestOpenDist = directDist;

    while (queue.length) {
        const curr = queue.shift();
        if (curr.dist >= 5) continue;
        hexDirections.forEach(dir => {
            const nq = curr.q + dir.q, nr = curr.r + dir.r;
            const nKey = getKey(nq, nr);
            if (visited.has(nKey)) return;
            visited.add(nKey);
            const cell = grid.get(nKey);
            if (!cell || cell.type !== 'empty' || cell.entity) return;
            const d = Math.min(...enemyPositions.map(e => hexDistance({ q: nq, r: nr }, e)));
            if (d < bestOpenDist) bestOpenDist = d;
            queue.push({ q: nq, r: nr, dist: curr.dist + 1 });
        });
    }
    return bestOpenDist > directDist - 2;
}

// ============================================================
// 5. ESECUZIONE TURNO
// ============================================================
async function executeDeepAITurn() {
    if (!deepAI?.model) return false;
    if (players[currentPlayer]?.isDisconnected) return false;

    console.log(`[DeepAI] Turno Fazione ${currentPlayer} (${players[currentPlayer].name})`);

    let safety = 0;
    const MAX = 20;

    while (state === 'PLAYING' && safety < MAX) {
        safety++;
        try {

        const myAgents = (players[currentPlayer]?.agents || []).filter(a => a.hp > 0 && a.ap > 0);
        if (!myAgents.length) break;

        // Agente con più AP rimasti
        const agent = myAgents.slice().sort((a, b) => b.ap - a.ap)[0];

        // ── Calcola target in modo sincrono e locale ──────────────
        const shootTargets = _localCalcShootTargets(agent);
        const moveTargets  = _localCalcMoveTargets(agent);

        const directTargets   = shootTargets.filter(t => t.isEnemy);
        const obstacleTargets = shootTargets.filter(t => t.isObstacle);

        // ── Decisione ─────────────────────────────────────────────
        // La rete sceglie 0=move, 1=shoot, 2=heal(→move per compatibilità)
        const action = deepAI.chooseAction(deepAI.getState());
        // action=2 (heal) rimappato su move — nessun breaking change con il modello addestrato

        let mode;
        if (directTargets.length > 0) {
            // Nemico direttamente visibile → spara sempre, senza delegare alla rete.
            // La rete è usata solo per decidere se muoversi o sparare agli ostacoli,
            // non per ignorare un nemico già in linea di tiro.
            mode = 'shoot';
        } else if (obstacleTargets.length > 0 && _shouldBreakObstacle(agent)) {
            // Bloccato da un muro: abbattilo
            mode = 'shoot';
        } else {
            // Nessun target visibile: muoviti sempre
            mode = 'move';
        }

        // ── Esegue tramite le funzioni globali di gamelogic ───────
        let executed = false;

        if (mode === 'shoot') {
            const pool = directTargets.length ? directTargets : obstacleTargets;
            const best = _pickBestShootTarget(pool);
            if (best) {
                selectedAgent = agent;
                currentActionMode = 'shoot';
                validActionTargets = shootTargets;
                // Per gli ostacoli, executeAction deve ricevere la cella del muro/barricata
                // (best.target è la cella stessa per ostacoli, l'entità per i nemici).
                // Usiamo le coordinate del target reale, non del path intermedio.
                const targetCell = best.isObstacle
                    ? grid.get(getKey(best.target.q, best.target.r))
                    : grid.get(getKey(best.q, best.r));
                if (targetCell) { executeAction(targetCell); executed = true; }
            }
        }

        if (!executed) {
            // move
            const best = _pickBestMoveTarget(moveTargets, agent);
            if (best) {
                selectedAgent = agent;
                currentActionMode = 'move';
                validActionTargets = moveTargets;
                const cell = grid.get(getKey(best.q, best.r));
                if (cell) { executeAction(cell); executed = true; }
            }
        }

        if (!executed) {
            // Nessuna azione possibile per questo agente: svuota AP
            agent.ap = 0;
        }

        const shortId = agent.id?.split('-')[0] ?? agent.id;
        console.log(`[DeepAI] ${shortId} | ${mode.toUpperCase()} | shoot=${directTargets.length} obs=${obstacleTargets.length} move=${moveTargets.length} | executed=${executed}`);

        drawGame();
        await new Promise(r => setTimeout(r, 500));

        } catch(err) {
            console.error('[DeepAI] Errore nel loop, salto azione:', err.message || err);
            // Svuota AP dell'agente corrente per evitare loop infinito
            const stuck = (players[currentPlayer]?.agents || []).find(a => a.hp > 0 && a.ap > 0);
            if (stuck) stuck.ap = 0;
        }
    }

    console.log(`[DeepAI] Fine turno.`);
    endTurn();
    return true;
}

// Avvio caricamento
window.addEventListener('load', () => {
    initDeepAI().catch(err => console.error('[DeepAI] Errore inizializzazione:', err));
});
