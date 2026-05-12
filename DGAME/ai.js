/* ============================================================
   ai.js — Intelligenza Artificiale Strategica (V22 - Focus Kill + AP completi)
   ============================================================
   ESPONE: executeAITurn
   DIPENDE DA: constants.js, state.js, gamelogic.js,
               network_core.js, graphics.js

   ARCHITETTURA — invariata rispetto a V19 (3 fasi).
   NOVITA V20 rispetto a V19:

   1. getHuntingTarget(va, faction, virtualHP, claimedTargets)
      - Salta bersagli gia eliminati nel piano virtuale (virtualHP <= 0)
      - Focus fire: bonus extra su bersagli gia danneggiati nel virtuale
      - Distribuzione soft: penalita leggera su bersagli gia reclamati
        da altri agenti virtuali nello stesso turno

   2. _bfsDistToTarget(sq, sr, target, virtualOccupied)
      - BFS su mappa reale per calcolare la distanza aggirando ostacoli
      - Elimina il problema "AI si sbatte contro il muro": ora le mosse
        di aggiramento ricevono lo stesso bonus delle mosse in linea retta

   3. _planBestAction — 3 miglioramenti:
      - Usa distanza BFS invece di distanza hex per valutare avanzamento
      - Lookahead a 2 livelli: valuta combo muovi+muovi+spara
      - Riceve claimedTargets per coordinare gli agenti

   4. Loop di pianificazione:
      - Ordina gli agenti per priorita: chi e gia in range spara prima
        (focus fire piu efficace: A indebolisce, B finisce)
      - Traccia claimedTargets e li passa a _planBestAction e Blitz
   ============================================================ */


// ============================================================
// PUNTO DI INGRESSO
// ============================================================

async function executeAITurn() {
    if (state !== 'PLAYING' || (!isHostAITurn() && !isCurrentPlayerAI())) return;

    const aiFaction = currentPlayer;
    const myAgents  = players[aiFaction].agents.filter(a => a.hp > 0);
    if (myAgents.length === 0) { endTurn(); return; }

    console.log(`[AI V19] Fazione ${players[aiFaction].name}: Piano Fluido attivo`);

    // ── FASE 0: CARTE PRE-PIANO ───────────────────────────────
    // Blitz (C01) escluso: viene valutato post-piano.
    _aiEvaluateAndPlayCards(aiFaction);
    drawGame();
    await delay(GAME.AI_STEP_DELAY_MS);

    // ── FASE 1: PIANIFICAZIONE VIRTUALE ──────────────────────
    const { virtualOccupied, virtualHP } = _buildVirtualState();

    // Ordina gli agenti per prioritita: chi e gia in range spara prima,
    // cosi il focus fire funziona meglio (A spara → B vede il bersaglio indebolito)
    const sortedAgents = [...myAgents].sort((a, b) => {
        const aInRange = _aiHasEnemiesInRange(a, aiFaction) ? 0 : 1;
        const bInRange = _aiHasEnemiesInRange(b, aiFaction) ? 0 : 1;
        return aInRange - bInRange;
    });

    const vAgents = sortedAgents.map(a => ({
        ref:         a,
        q:           a.q,
        r:           a.r,
        ap:          GAME.AP_PER_TURN,
        visited:     new Set([getKey(a.q, a.r)]),
        ghostTarget: a._aiSpettroMoveTarget ?? null,
    }));

    myAgents.forEach(a => { delete a._aiSpettroMoveTarget; });

    // claimedTargets: chiavi dei bersagli gia assegnati ad altri agenti virtuali.
    // Consente una distribuzione soft dei bersagli senza vietare il focus fire.
    const claimedTargets = new Set();

    const masterPlan   = [];
    let totalApToSpend = vAgents.length * GAME.AP_PER_TURN;
    let iterations     = 0;
    const MAX_ITER     = 90;

    while (totalApToSpend > 0 && iterations < MAX_ITER) {
        iterations++;
        let anyActionFound = false;

        for (const va of vAgents) {
            if (va.ap <= 0) continue;

            const action = _planBestAction(va, aiFaction, virtualOccupied, virtualHP, claimedTargets);
            if (!action) {
                // Agente bloccato: azzera visited come ultima risorsa
                if (va.ap > 0 && va.visited.size > 1) {
                    va.visited = new Set([getKey(va.q, va.r)]);
                }
                continue;
            }

            masterPlan.push({ agent: va.ref, ...action });
            va.ap          -= action.cost;
            totalApToSpend -= action.cost;
            anyActionFound  = true;

            _applyVirtualAction(va, action, virtualOccupied, virtualHP);

            if (action.type === 'shoot' && action.subType === 'agent') {
                claimedTargets.add(getKey(action.q, action.r));
            }
        }

        if (!anyActionFound) break;
    }

    // ── POST-PIANO: VALUTAZIONE BLITZ ─────────────────────────
    _aiTryBlitzPostPlan(aiFaction, vAgents, masterPlan, virtualOccupied, virtualHP, claimedTargets);

    // ── FASE 2: ESECUZIONE ANIMATA ────────────────────────────
    for (const step of masterPlan) {
        if (state !== 'PLAYING' || currentPlayer !== aiFaction) break;

        selectedAgent = step.agent;
        if (selectedAgent.hp <= 0 || selectedAgent.ap < step.cost) continue;

        // ── Step CARTA ───────────────────────────────────────
        if (step.type === 'card') {
            _aiExecuteCardStep(step, aiFaction);
            drawGame();
            await delay(GAME.AI_STEP_DELAY_MS);
            continue;
        }

        // ── Step NORMALE (move / shoot) ──────────────────────

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
            continue; // l'AI non usa mai la cura attiva

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
// POST-PIANO — Valutazione Blitz (C01)
// ============================================================

/**
 * Valuta Blitz DOPO che il masterPlan è costruito.
 *
 * Per ogni agente virtuale con ap = 0, chiede a _planBestAction
 * cosa farebbe con 1 AP extra. Se l'azione vale >= BLITZ_MIN_SCORE,
 * inserisce nel masterPlan [BLITZ, azione_extra] subito dopo
 * l'ultimo step dell'agente.
 *
 * Esempio risultante:
 *   [muovi, muovi, BLITZ, spara]   ← kill che prima mancava di 1 AP
 *
 * Modifica masterPlan in-place. Blitz è monouso: si ferma al primo
 * agente che ne beneficia.
 */
function _aiTryBlitzPostPlan(aiFaction, vAgents, masterPlan, virtualOccupied, virtualHP, claimedTargets) {
    const pData = players[aiFaction];
    if (!pData?.cards?.length) return;

    // Trova lo slot Blitz disponibile
    let blitzSlot = -1;
    for (let i = 0; i < pData.cards.length; i++) {
        const slotKey = `slot_${i}`;
        if (pData.cards[i] === 'C01' && !pData.usedCards?.[slotKey]) {
            blitzSlot = i;
            break;
        }
    }
    if (blitzSlot === -1) return;

    // Soglia abbassata: include mosse di avvicinamento con lookahead (90000+),
    // tiri generici (120000+), HQ (68000+) e anche setup offensivi (35000+).
    // 55000 era troppo alto: escludeva Blitz nei turni di puro movimento,
    // che sono i più comuni a inizio/metà partita.
    const BLITZ_MIN_SCORE = 35000;

    for (const va of vAgents) {
        if (va.ap > 0) continue; // ha ancora AP: Blitz non serve

        // Cosa farebbe con 1 AP extra?
        const vaExtra  = { ...va, ap: 1 };
        const extraAct = _planBestAction(vaExtra, aiFaction, virtualOccupied, virtualHP, claimedTargets ?? new Set());
        if (!extraAct) continue;

        // Calcola lo score dell'azione extra
        const extraScore = _scoreAction(vaExtra, extraAct, aiFaction, virtualOccupied, virtualHP, claimedTargets ?? new Set());
        if (extraScore < BLITZ_MIN_SCORE) continue;

        // Blitz conviene: inseriscilo dopo l'ultimo step di questo agente
        const agentRef    = va.ref;
        const insertAt    = _lastStepIndexForAgent(masterPlan, agentRef) + 1;

        const blitzStep = {
            agent:     agentRef,
            type:      'card',
            cardId:    'C01',
            slotIndex: blitzSlot,
            cost:      0,
        };

        const extraStep = { agent: agentRef, cost: 1, ...extraAct };

        masterPlan.splice(insertAt, 0, blitzStep, extraStep);

        // Aggiorna stato virtuale per coerenza (altri agenti già elaborati
        // nel loop non vengono rivisitati, ma è buona norma mantenerlo coerente)
        _applyVirtualAction(vaExtra, extraAct, virtualOccupied, virtualHP);
        // Fix: aggiorna visited per evitare che altri agenti virtuali
        // pianifichino la stessa cella di destinazione (collisione silenziosa)
        if (extraAct.type === 'move') {
            va.visited.add(getKey(extraAct.q, extraAct.r));
        }

        console.log(`[AI V19] Blitz post-piano: agente → ${extraAct.type} score=${extraScore}`);
        break; // una sola carta Blitz per turno
    }
}

/**
 * Calcola lo score di un'azione proposta per un agente virtuale.
 * Usato da _aiTryBlitzPostPlan per valutare il guadagno di Blitz.
 */
function _scoreAction(va, action, faction, virtualOccupied, virtualHP, claimedTargets) {
    if (action.type === 'shoot') {
        const key         = getKey(action.q, action.r);
        const effectiveHp = virtualHP.get(key) ?? 999;
        const cell        = grid.get(key);
        if (!cell) return 0;
        const adjHp = cell.terrain === 'copertura' ? effectiveHp + 1 : effectiveHp;

        // Bonus se bersaglio gia danneggiato nel virtuale (focus kill)
        const realEntityHp   = cell?.entity?.hp ?? adjHp;
        const vhpNow         = virtualHP.get(key);
        const alreadyDamaged = vhpNow !== undefined && vhpNow < realEntityHp;

        if (action.subType === 'hq') {
            return adjHp <= va.ref.dmg ? 148000 : 68000;
        } else if (action.subType === 'agent') {
            const liveFaction   = players[faction].agents.filter(a => a.hp > 0);
            const avgFactionDmg = liveFaction.length > 0
                ? liveFaction.reduce((s, a) => s + a.dmg, 0) / liveFaction.length
                : va.ref.dmg;
            if (adjHp <= va.ref.dmg)
                return alreadyDamaged ? 220000 : 200000;
            if (adjHp <= Math.ceil(avgFactionDmg) + va.ref.dmg)
                return alreadyDamaged ? 175000 : 160000;
            return 120000 + Math.floor((va.ref.dmg / adjHp) * 20000);
        } else {
            return action.subType === 'barricade' ? 65000 : 50000;
        }
    }

    if (action.type === 'move') {
        // Usa BFS coerentemente con _planBestAction
        const navTarget = getHuntingTarget(va, faction, virtualHP, claimedTargets ?? new Set());
        if (!navTarget) return 5000;
        const currentBFS = _bfsDistToTarget(va.q, va.r, navTarget, virtualOccupied);
        const newBFS     = _bfsDistToTarget(action.q, action.r, navTarget, virtualOccupied);
        const gain       = currentBFS - newBFS;
        if (gain > 0)  return 90000 + gain * 4000;
        if (gain === 0) return 20000;
        return 5000;
    }

    return 0;
}

/**
 * Indice dell'ultimo step nel masterPlan che appartiene all'agente.
 * Restituisce masterPlan.length - 1 se l'agente non ha step (append in coda).
 */
function _lastStepIndexForAgent(masterPlan, agentRef) {
    let last = -1;
    for (let i = 0; i < masterPlan.length; i++) {
        if (masterPlan[i].agent === agentRef) last = i;
    }
    return last === -1 ? masterPlan.length - 1 : last;
}

/**
 * Esegue fisicamente uno step carta (solo C01 Blitz per ora).
 */
function _aiExecuteCardStep(step, aiFaction) {
    const pData   = players[aiFaction];
    const slotKey = `slot_${step.slotIndex}`;

    if (pData.usedCards?.[slotKey]) return; // doppia guardia
    if (!pData.usedCards) pData.usedCards = {};
    pData.usedCards[slotKey] = true;

    selectedAgent = step.agent;

    if (step.cardId === 'C01') {
        selectedAgent.ap += 1;
        playSpecialVFX(selectedAgent, CARD_DEFINITIONS.C01.color, '⚡ +1 AP!');
        updateUI();
        showCardMessage(aiFaction, 'C01');

        if (isOnline) {
            sendOnlineMessage({
                type:          'ACTION_CARD',
                cardId:        'C01',
                slotIndex:     step.slotIndex,
                actingPlayer:  aiFaction,
                targetAgentId: selectedAgent.id,
            });
        }
    }
}


// ============================================================
// FASE 0 — CARTE PRE-PIANO (invariata da V17, C01 escluso)
// ============================================================

function _aiEvaluateAndPlayCards(aiFaction) {
    const pData = players[aiFaction];
    if (!pData?.cards?.length) return;

    const myAgents = pData.agents.filter(a => a.hp > 0);
    if (!myAgents.length) return;

    pData.cards.forEach((cardId, slotIndex) => {
        const slotKey = `slot_${slotIndex}`;
        if (pData.usedCards?.[slotKey]) return;
        if (!cardId) return;
        if (cardId === 'C01') return; // gestito da _aiTryBlitzPostPlan

        const card = CARD_DEFINITIONS[cardId];
        if (!card) return;

        let chosenAgent = null;
        let shouldPlay  = false;

        switch (cardId) {

            case 'C03': { // Cecchino — raddoppia gittata + perfora
                // Attiva SOLO se il raddoppio di gittata sblocca qualcosa
                // che non era possibile a gittata normale: un kill, un HQ
                // raggiungibile, o un secondo bersaglio perforabile.
                // Soglia alta per evitare sprechi quando il nemico era gia in range.
                let bestScore = 0;
                myAgents.forEach(a => {
                    const normalRng = a.rng;
                    const doubleRng = a.rng * 2;
                    let normalScore = 0, doubleScore = 0;

                    hexDirections.forEach(dir => {
                        let targetsHit = 0;
                        for (let d = 1; d <= doubleRng; d++) {
                            const c = grid.get(getKey(a.q + dir.q * d, a.r + dir.r * d));
                            if (!c) break;
                            if (c.entity) {
                                if (c.entity.faction !== aiFaction && targetsHit < 2) {
                                    const val = c.entity.hp <= a.dmg ? 600
                                              : c.entity.type === 'hq' ? 350
                                              : 120;
                                    if (d <= normalRng) normalScore += val;
                                    else                doubleScore  += val;
                                    targetsHit++;
                                    if (targetsHit < 2) continue; // perfora, cerca secondo
                                }
                                break;
                            }
                            if (c.type === 'wall' || c.type === 'barricade') break;
                        }
                    });

                    // Vale la pena solo se il raddoppio aggiunge valore concreto
                    const addedValue = doubleScore + (normalScore > 0 ? normalScore * 0.5 : 0);
                    if (addedValue > bestScore) { bestScore = addedValue; chosenAgent = a; }
                });
                // Soglia: deve sbloccare almeno un bersaglio fuori range normale (>= 300)
                // oppure perforare e colpire un secondo bersaglio (>= 240)
                if (bestScore >= 240) shouldPlay = true;
                break;
            }

            case 'C05': { // Esplosivo — danno raddoppiato + splash
                // Attiva se: kill garantito su target normalmente non killabile,
                // oppure kill + splash su almeno un adiacente.
                // Non attivare se il danno base era gia sufficiente a killare.
                let bestExplosiveScore = 0;
                myAgents.forEach(a => {
                    if (a.ap < 1) return;
                    const bonusDmg  = a.originalDmg || a.dmg;
                    const totalDmg  = a.dmg + bonusDmg;
                    const splashDmg = Math.ceil(totalDmg / 2);
                    grid.forEach(cell => {
                        if (!cell.entity || cell.entity.faction === aiFaction) return;
                        if (hexDistance(a, cell) > a.rng) return;
                        const target = cell.entity;
                        let scenarioScore = 0;

                        const killWithExplosive  = target.hp <= totalDmg;
                        const killWithoutExplosive = target.hp <= a.dmg;

                        if (killWithExplosive && !killWithoutExplosive) {
                            // Il valore sta nel kill aggiuntivo
                            scenarioScore += target.type === 'hq' ? 1200 : 800;
                        } else if (killWithExplosive) {
                            // Kill che avveniva gia: valore solo nello splash
                            scenarioScore += 200;
                        } else {
                            scenarioScore += Math.floor((totalDmg / target.hp) * 300);
                        }

                        hexDirections.forEach(dir => {
                            const adjCell = grid.get(getKey(cell.q + dir.q, cell.r + dir.r));
                            if (adjCell?.entity && adjCell.entity.faction !== aiFaction) {
                                scenarioScore += adjCell.entity.hp <= splashDmg ? 400 : 180;
                            }
                        });

                        if (scenarioScore > bestExplosiveScore) {
                            bestExplosiveScore = scenarioScore;
                            chosenAgent = a;
                        }
                    });
                });
                // Soglia: kill aggiuntivo (800+) o kill + almeno uno splash (600+)
                if (bestExplosiveScore >= 600) shouldPlay = true;
                break;
            }

            case 'C07': { // Scudo
                // Priorita: agente piu minacciato e piu prezioso tatticamente.
                // "Minacciato" = nemici vicini che possono ucciderlo.
                // "Prezioso" = alto dmg o in posizione offensiva chiave.
                let bestScore = -1;
                myAgents.forEach(a => {
                    if (a.shielded > 0) return; // inutile scudare chi ha gia lo scudo
                    let score = 0;

                    // Valore tattico base
                    score += a.dmg * 60 + a.rng * 10;

                    // Minaccia reale: nemici che possono colpirlo
                    let threatScore = 0;
                    grid.forEach(cell => {
                        const e = cell.entity;
                        if (!e || e.faction === aiFaction || e.type !== 'agent') return;
                        if (hexDistance(a, cell) <= e.rng) {
                            threatScore += e.dmg * 80;
                            if (e.dmg >= a.hp) threatScore += 300; // puo ucciderlo in un colpo
                        }
                    });
                    score += threatScore;

                    // Bonus se e ferito (lo scudo lo rende piu resistente)
                    const missingHp = a.maxHp - a.hp;
                    if (missingHp > 0) score += missingHp * 50;

                    // Penalita se e gia in posizione sicura (nessuna minaccia)
                    if (threatScore === 0) score -= 200;

                    if (score > bestScore) { bestScore = score; chosenAgent = a; }
                });
                // Attiva solo se c'e una minaccia reale, non in modo preventivo passivo
                if (chosenAgent && bestScore > 200) shouldPlay = true;
                break;
            }

            case 'C04': { // EMP — disabilita scudi e riduce AP
                // Valore principale: rimuovere scudi nemici.
                // Valore secondario: nemici in range senza scudo.
                // Non sprecare se nessun nemico ha scudo e il conteggio e basso.
                let bestScore = 0;
                myAgents.forEach(a => {
                    let score = 0;
                    let shieldedEnemies = 0;
                    grid.forEach(cell => {
                        const t = cell.entity;
                        if (t?.type === 'agent' && t.faction !== aiFaction
                                && hexDistance(a, cell) <= 5) {
                            if (t.shielded > 0) { score += 600; shieldedEnemies++; }
                            else                  score += 150;
                        }
                    });
                    // Bonus se siamo in svantaggio numerico (EMP livella il campo)
                    const myLive  = myAgents.length;
                    let enemies = 0;
                    for (let p = 1; p <= totalPlayers; p++) {
                        if (!players[p] || p === aiFaction) continue;
                        enemies += players[p].agents.filter(x => x.hp > 0).length;
                    }
                    if (enemies > myLive) score += 200;
                    if (score > bestScore) { bestScore = score; chosenAgent = a; }
                });
                // Attiva se c'e almeno uno scudato (600+) o tre nemici non scudati (450)
                if (bestScore >= 450) shouldPlay = true;
                break;
            }

            case 'C09': { // Medikit — cura un agente
                // Logica: dare il medikit all'agente piu in pericolo che ha ancora
                // valore tattico. NON all'agente piu forte se e al sicuro.
                let bestScore = -1;
                myAgents.forEach(a => {
                    if (a.medikitBuff) return;

                    // Pericolo: nemici che possono raggiungerlo e danneggiarlo
                    let danger = 0;
                    grid.forEach(cell => {
                        const e = cell.entity;
                        if (!e || e.faction === aiFaction || e.type !== 'agent') return;
                        if (hexDistance(a, cell) <= e.rng + e.mov) {
                            danger += e.dmg;
                            if (e.dmg >= a.hp) danger += 200; // puo ucciderlo
                        }
                    });

                    // Valore tattico: quanto contribuisce al piano offensivo
                    const offensiveValue = a.dmg * 50 + a.rng * 15;
                    const hpRatio        = a.hp / a.maxHp;

                    // Score: premiamo chi e sia minacciato sia prezioso
                    // Un agente a 1 HP con danger alto e il candidato perfetto
                    let score = danger * (1 - hpRatio) + offensiveValue * (1 - hpRatio);

                    // Penalita forte se e a piena salute (medikit sprecato)
                    if (a.hp >= a.maxHp) score = -999;

                    if (score > bestScore) { bestScore = score; chosenAgent = a; }
                });
                if (chosenAgent && bestScore > 50) shouldPlay = true;
                break;
            }

            case 'C10': { // Upgrade stat permanente
                // Sceglie l'agente con piu turni attesi davanti (hp alta, valore offensivo).
                // Sceglie l'upgrade piu utile in base alla situazione di gioco:
                // - dmg se il danno base e basso o ci sono nemici coriacei
                // - rng se l'agente e spesso fuori gittata (mov basso o mappa grande)
                // - hp se l'agente e fragile rispetto alla minaccia
                // - mov se e lento e i nemici lo evitano
                let best    = null;
                let bestFit = -1;
                myAgents.forEach(a => {
                    if (a.hp <= 1) return; // non sprecare su un agente quasi morto
                    // Valore atteso: hp rimanente * valore offensivo
                    const f = (a.hp / a.maxHp) * (a.dmg * 30 + a.rng * 10 + a.mov * 5);
                    if (f > bestFit) { bestFit = f; best = a; }
                });
                if (best) {
                    chosenAgent = best;
                    shouldPlay  = true;

                    // Scelta upgrade contestuale
                    let u = { hp: 0, mov: 0, rng: 0, dmg: 0 };
                    let enemyMaxHp = 1;
                    for (let p = 1; p <= totalPlayers; p++) {
                        if (!players[p] || p === aiFaction) continue;
                        players[p].agents.forEach(e => { if (e.hp > enemyMaxHp) enemyMaxHp = e.hp; });
                    }
                    const canKillHardest = chosenAgent.dmg >= enemyMaxHp;
                    const isRanged       = chosenAgent.rng >= 3;
                    const isSlow         = chosenAgent.mov <= 2;
                    const isFragile      = chosenAgent.hp <= 2;

                    if (isFragile)          u.hp  = 1;        // fragile: sopravvivi
                    else if (!canKillHardest) u.dmg = 1;      // non riesci a killare: piu danno
                    else if (!isRanged)     u.rng = 1;        // corpo a corpo: estendi gittata
                    else if (isSlow)        u.mov = 1;        // lento: piu mobilita
                    else                    u.dmg = 1;        // default: piu danno e sempre utile

                    chosenAgent._aiUpgradeChoice = u;
                }
                break;
            }

            case 'C06': { // Spettro — attraversa ostacoli
                // Attiva solo se la posizione ghost sblocca un kill o un tiro
                // su un bersaglio non raggiungibile in modo normale.
                // Soglia alta per evitare usi tatticamente vuoti.
                let bestScore = 0;
                myAgents.forEach(a => {
                    if (a.spectreBuff || a.ap < 1) return;
                    const gs = _aiGetGhostShootingSpots(a, aiFaction);
                    if (!gs) return;

                    // Verifica che la posizione ghost non sia gia raggiungibile normalmente
                    const alreadyReachable = getVirtualMoves(
                        { ...a, ref: a }, new Set()
                    ).some(m => m.q === gs.cell.q && m.r === gs.cell.r);

                    let score = gs.score;
                    if (gs.killable)         score += 15000;
                    if (!alreadyReachable)   score += 8000;  // vero vantaggio ghost
                    else                     score -= 6000;  // inutile: ci arrivavo gia
                    score += a.dmg * 600;
                    if (a.hp <= 1)           score -= 10000; // non rischiare chi sta per morire

                    a._aiSpettroMoveTarget = gs.cell;
                    if (score > bestScore) { bestScore = score; chosenAgent = a; }
                });
                // Soglia piu alta: deve sbloccare qualcosa di concreto
                if (bestScore >= 12000) shouldPlay = true;
                break;
            }

            case 'C02': { // Airdrop — disponibile solo dal turno 2
                if (turnCount < 2) break;
                let bestAction = null;
                let bestScore  = 0;
                myAgents.forEach(a => {
                   if (a.ap < 3) return;
                    const ds = _aiFindGlobalBestDrop(aiFaction, a);
                    if (!ds) return;

                    // Verifica che non si possa raggiungere lo stesso risultato muovendosi
                    const normalMoveDist = hexDistance(a, ds.cell);
                    const reachableNormally = normalMoveDist <= a.mov;

                    let score = ds.score;
                    if (reachableNormally) score -= 600; // inutile: ci arrivo gia
                    if (a.hp <= 2)         score -= 400; // non teletrasportare chi sta per morire
                    if (a.ap > 3)          score += 300; // ha AP extra da usare dopo

                    if (score > bestScore) {
                        bestScore  = score;
                        bestAction = { agent: a, cell: ds.cell };
                    }
                });
                // Soglia alzata: deve valere il costo di 3 AP
                if (bestAction && bestScore >= 700) {
                    chosenAgent = bestAction.agent;
                    chosenAgent._aiDropTarget = bestAction.cell;
                    shouldPlay = true;
                }
                break;
            }

            case 'C08': { // Fortino — difesa area
                // Attiva SOLO in situazioni di vera difficolta:
                // - sotto attacco diretto (nemici adiacenti)
                // - in svantaggio numerico netto con nemici vicini
                // Non attivare in modo preventivo o quando si e in vantaggio.
                const myLive = myAgents.length;
                let enemies  = 0;
                for (let p = 1; p <= totalPlayers; p++) {
                    if (!players[p] || p === aiFaction) continue;
                    enemies += players[p].agents.filter(a => a.hp > 0).length;
                }
                const underAttack = myAgents.some(a => _aiCountEnemiesNear(a, aiFaction, 2) > 0);
                const nearbyPressure = myAgents.filter(a => _aiCountEnemiesNear(a, aiFaction, 3) > 0).length;

                // Attiva solo se: sotto attacco diretto E in svantaggio,
                // oppure piu di meta degli agenti sono sotto pressione ravvicinata
                const shouldFortify = (underAttack && enemies >= myLive)
                                   || (nearbyPressure >= 2 && enemies > myLive);
                if (shouldFortify) {
                    let most = null; let maxExp = -1;
                    myAgents.forEach(a => {
                        const e = _aiCountEnemiesNear(a, aiFaction, 3);
                        if (e > maxExp) { maxExp = e; most = a; }
                    });
                    chosenAgent = most || myAgents[0];
                    shouldPlay  = true;
                }
                break;
            }
        }

        if (!shouldPlay || !chosenAgent) return;
        if (card.apCost > 0 && chosenAgent.ap < card.apCost) return;

        selectedAgent = chosenAgent;
        if (!pData.usedCards) pData.usedCards = {};
        pData.usedCards[slotKey] = true;

        if (cardId === 'C10') {
            finalizeAsyncCard(slotIndex, cardId, chosenAgent._aiUpgradeChoice);
            delete chosenAgent._aiUpgradeChoice;

        } else if (cardId === 'C02') {
            const dropTarget = chosenAgent._aiDropTarget;
            delete chosenAgent._aiDropTarget;
            if (dropTarget) {
                const tc = grid.get(getKey(dropTarget.q, dropTarget.r));
                if (tc && tc.type === 'empty' && !tc.entity) {
                    playSFX('move');
                    grid.get(getKey(chosenAgent.q, chosenAgent.r)).entity = null;
                    tc.entity      = chosenAgent;
                    chosenAgent.q  = tc.q;
                    chosenAgent.r  = tc.r;
                    chosenAgent.ap -= 3;
                    const cpKey = getKey(chosenAgent.q, chosenAgent.r);
                    if (controlPoints.has(cpKey)) {
                        const cp = controlPoints.get(cpKey);
                        if (cp.faction !== chosenAgent.faction) {
                            cp.faction = chosenAgent.faction;
                            if (typeof showCPCapture === 'function') showCPCapture(chosenAgent);
                        }
                    }
                    playSpecialVFX(chosenAgent, '#a0ff00', '🪂 AIRDROP!');
                    if (isOnline) sendOnlineMessage({
                        type: 'ACTION_CARD', cardId: 'C02', slotIndex,
                        actingPlayer: aiFaction, targetAgentId: chosenAgent.id,
                        aiDropQ: chosenAgent.q, aiDropR: chosenAgent.r,
                    });
                }
            }

        } else {
            card.apply(aiFaction);
        }

        console.log(`[AI V19] Pre-piano — carta: ${card.name}`);
    });
}


// ============================================================
// PIANIFICAZIONE — helper privati (invariati da V17)
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
 * Distanza BFS reale tra (sq, sr) e target, aggirandoo ostacoli e celle occupate.
 * Usata da _planBestAction per valutare correttamente le mosse di aggiramento:
 * la distanza hex in linea d'aria ignora i muri, portando l'AI a sbattersi
 * contro gli ostacoli invece di aggirarli.
 * Restituisce Infinity se non raggiungibile (target irraggiungibile o gia morto).
 */
function _bfsDistToTarget(sq, sr, target, virtualOccupied) {
    const tKey = getKey(target.q, target.r);
    const startKey = getKey(sq, sr);
    if (startKey === tKey) return 0;

    const visited = new Set([startKey]);
    const queue   = [{ q: sq, r: sr, d: 0 }];

    while (queue.length > 0) {
        const curr = queue.shift();
        for (const dir of hexDirections) {
            const nq  = curr.q + dir.q;
            const nr  = curr.r + dir.r;
            const key = getKey(nq, nr);
            if (visited.has(key)) continue;
            visited.add(key);

            if (key === tKey) return curr.d + 1;

            const cell = grid.get(key);
            if (!cell) continue;
            // Celle transitabili: vuote e non occupate nel virtuale
            // (non controlliamo la cella bersaglio perche e quella di destinazione)
            if (cell.type === 'empty' && !virtualOccupied.has(key)) {
                queue.push({ q: nq, r: nr, d: curr.d + 1 });
            }
        }
        // Limite pratico: non espandere oltre 30 celle (prestazioni)
        if (queue.length > 0 && queue[0].d > 30) break;
    }

    // Non raggiungibile via BFS: fallback alla distanza hex
    return hexDistance({ q: sq, r: sr }, target);
}


function _planBestAction(va, faction, virtualOccupied, virtualHP, claimedTargets) {
    const candidates = [];

    // Passa virtualHP e claimedTargets: getHuntingTarget ora salta bersagli
    // gia morti nel virtuale e distribuisce gli agenti su bersagli diversi
    const navTarget = getHuntingTarget(va, faction, virtualHP, claimedTargets);
    if (!navTarget) return null;

    // Caso CP
    if (navTarget.type === 'cp') {
        const moves    = getVirtualMoves(va, virtualOccupied);
        let bestCPMove = null;
        let bestCPDist = hexDistance({ q: va.q, r: va.r }, navTarget);
        for (const m of moves) {
            if (va.visited.has(getKey(m.q, m.r))) continue;
            const d = hexDistance(m, navTarget);
            if (d < bestCPDist) { bestCPDist = d; bestCPMove = m; }
        }
        if (bestCPMove) return { type: 'move', q: bestCPMove.q, r: bestCPMove.r, cost: 1 };
        // Gia sul CP o non puo avvicinarsi: non sprecare AP, muoviti verso qualcosa
        // di utile (nemico piu vicino) invece di restituire null
        for (const m of moves) {
            if (!va.visited.has(getKey(m.q, m.r)))
                return { type: 'move', q: m.q, r: m.r, cost: 1 };
        }
        return null;
    }

    const liveFaction   = players[faction].agents.filter(a => a.hp > 0);
    const avgFactionDmg = liveFaction.length > 0
        ? liveFaction.reduce((s, a) => s + a.dmg, 0) / liveFaction.length
        : va.ref.dmg;

    // Distanza BFS reale al bersaglio (aggira muri): usata per la sezione B
    // cosi le mosse di aggiramento ricevono lo stesso bonus di avvicinamento
    // delle mosse in linea retta, eliminando il blocco muri del vecchio heuristic.
    const currentDistBFS = _bfsDistToTarget(va.q, va.r, navTarget, virtualOccupied);
    const currentDistHex = hexDistance({ q: va.q, r: va.r }, navTarget);
    const moves          = getVirtualMoves(va, virtualOccupied);

    // A0. Ghost target
    if (va.ghostTarget) {
        const gt    = va.ghostTarget;
        const gtKey = getKey(gt.q, gt.r);
        if (!virtualOccupied.has(gtKey) && !va.visited.has(gtKey)) {
            const simulatedVA = { ...va, q: gt.q, r: gt.r };
            const tfg         = getVirtualTargets(simulatedVA, faction, virtualHP, false);
            let ghostScore    = 95000;
            for (const t of tfg) {
                const ehp = virtualHP.get(getKey(t.q, t.r)) ?? t.hp;
                if (t.type !== 'hq') {
                    ghostScore = Math.max(ghostScore, ehp <= va.ref.dmg ? 190000 : 130000);
                } else {
                    ghostScore = Math.max(ghostScore, 100000);
                }
            }
            candidates.push({ score: ghostScore, action: { type: 'move', q: gt.q, r: gt.r, cost: 1 } });
            va.ghostTarget = null;
        }
    }

    // A. Attacco nemici dalla posizione corrente
    const combatTargets = getVirtualTargets(va, faction, virtualHP, false);
    for (const t of combatTargets) {
        const cell      = grid.get(getKey(t.q, t.r));
        let effectiveHp = virtualHP.get(getKey(t.q, t.r)) ?? t.hp;
        if (cell?.terrain === 'copertura') effectiveHp += 1;

        // HP reali dell'entita prima di qualsiasi danno virtuale di questo turno.
        // t.hp e gia l'HP virtuale (da getVirtualTargets), quindi usiamo
        // cell.entity.hp come riferimento "pre-piano" per rilevare danni virtuali.
        const realEntityHp   = cell?.entity?.hp ?? t.hp;
        const vhpNow         = virtualHP.get(getKey(t.q, t.r));
        const alreadyDamaged = (vhpNow !== undefined && vhpNow < realEntityHp);

        let score;
        if (t.type === 'hq') {
            score = effectiveHp <= va.ref.dmg ? 148000 : 68000;
        } else {
            if (effectiveHp <= va.ref.dmg) {
                // Kill garantito: massima priorita, bonus extra se il nemico era
                // gia stato danneggiato (completa il focus fire)
                score = alreadyDamaged ? 220000 : 200000;
            } else if (effectiveHp <= Math.ceil(avgFactionDmg) + va.ref.dmg) {
                // Un altro colpo lo finisce: alta priorita
                score = 160000 + Math.max(0, (6 - effectiveHp)) * 4000;
                if (alreadyDamaged) score += 15000; // bonus: stiamo gia lavorando su questo
            } else {
                // Danno parziale: priorita bassa, scoraggiato se ci sono kill migliori
                score = 120000 + Math.floor((va.ref.dmg / effectiveHp) * 20000);
                if (alreadyDamaged) score += 8000; // leggero bonus per continuita
            }
        }
        candidates.push({ score, action: { type: 'shoot', q: t.q, r: t.r, cost: 1, targetRef: t.targetRef, subType: t.type } });
    }

    // B. Avvicinamento con lookahead a 2 livelli
    // Usa distanza BFS per valutare le mosse: cosi le mosse di aggiramento
    // (che in hex non avvicinano al target) vengono premiate correttamente.
    for (const m of moves) {
        if (va.visited.has(getKey(m.q, m.r))) continue;

        // Distanza BFS dalla cella candidata al target
        const mDistBFS = _bfsDistToTarget(m.q, m.r, navTarget, virtualOccupied);
        const mDistHex = hexDistance(m, navTarget);

        // Avanzamento reale misurato in BFS (non in linea d'aria)
        const bfsGain = currentDistBFS - mDistBFS;

        // Lookahead livello 1: cosa posso fare dalla nuova cella?
        const sVA  = { ...va, q: m.q, r: m.r };
        const tft  = getVirtualTargets(sVA, faction, virtualHP, false);
        let lookaheadScore = 0;

        for (const t of tft) {
            const ehp        = virtualHP.get(getKey(t.q, t.r)) ?? t.hp;
            const realHpEnt  = t.targetRef?.hp ?? t.hp;   // HP reali pre-piano
            const wasHit     = ehp < realHpEnt;           // gia colpito nel virtuale
            if (t.type !== 'hq') {
                if (ehp <= va.ref.dmg) {
                    // Kill garantito: se era gia ferito e' la mossa piu urgente in assoluto
                    lookaheadScore = Math.max(lookaheadScore, wasHit ? 110000 : 85000);
                } else if (ehp <= Math.ceil(avgFactionDmg) + va.ref.dmg) {
                    lookaheadScore = Math.max(lookaheadScore, wasHit ? 82000 : 72000);
                } else {
                    lookaheadScore = Math.max(lookaheadScore, wasHit ? 65000 : 55000);
                }
            } else {
                lookaheadScore = Math.max(lookaheadScore, 40000);
            }
        }

        // Lookahead livello 2: sempre attivo (non solo quando L1=0).
        // Valuta combo muovi+muovi+spara: utile quando nessun nemico e
        // raggiungibile in 1 mossa ma lo e in 2.
        // Se L1 ha gia trovato un kill su ferito (>= 100000), L2 non aggiunge nulla.
        if (lookaheadScore < 100000) {
            const movesFromM = getVirtualMoves(sVA, virtualOccupied);
            for (const m2 of movesFromM) {
                const m2key = getKey(m2.q, m2.r);
                if (va.visited.has(m2key) || m2key === getKey(m.q, m.r)) continue;
                const sVA2 = { ...sVA, q: m2.q, r: m2.r };
                const tft2 = getVirtualTargets(sVA2, faction, virtualHP, false);
                for (const t2 of tft2) {
                    const ehp2       = virtualHP.get(getKey(t2.q, t2.r)) ?? t2.hp;
                    const realHp2    = t2.targetRef?.hp ?? t2.hp;
                    const wasHit2    = ehp2 < realHp2;
                    if (t2.type !== 'hq') {
                        if (ehp2 <= va.ref.dmg)
                            lookaheadScore = Math.max(lookaheadScore, wasHit2 ? 78000 : 60000);
                        else if (ehp2 <= Math.ceil(avgFactionDmg) + va.ref.dmg)
                            lookaheadScore = Math.max(lookaheadScore, wasHit2 ? 60000 : 48000);
                        else
                            lookaheadScore = Math.max(lookaheadScore, wasHit2 ? 42000 : 35000);
                    } else {
                        lookaheadScore = Math.max(lookaheadScore, 28000);
                    }
                }
            }
        }

        // Punteggio base: avanzamento BFS premiato, con bonus per avanzamenti maggiori
        // Se bfsGain <= 0 (mossa laterale o che allontana in BFS) prende solo il lookahead
        let baseScore = 0;
        if (bfsGain > 0) {
            baseScore = 90000 + bfsGain * 4000;
        } else if (mDistHex === currentDistHex) {
            baseScore = 20000; // laterale in hex: valore basso ma non zero
        }

        const score = Math.max(baseScore, lookaheadScore);
        if (score > 0) {
            candidates.push({ score, action: { type: 'move', q: m.q, r: m.r, cost: 1 } });
        }
    }

    // C. Assedio ostacoli bloccanti
    const obstacles = getVirtualTargets(va, faction, virtualHP, true);
    for (const obs of obstacles) {
        const distObsToTarget = hexDistance({ q: obs.q, r: obs.r }, navTarget);
        const isAdjacent      = hexDistance({ q: va.q, r: va.r }, obs) === 1;
        if (!isAdjacent || distObsToTarget >= currentDistHex) continue;

        const obsHp = virtualHP.get(getKey(obs.q, obs.r)) ?? obs.hp;
        let score   = obs.type === 'barricade' ? 65000 : 50000;
        if (obsHp <= va.ref.dmg) score += 15000;
        candidates.push({ score, action: { type: 'shoot', q: obs.q, r: obs.r, cost: 1, targetRef: obs.targetRef, subType: obs.type } });
    }

    // D. Movimento laterale (fallback se B non ha trovato avanzamenti BFS)
    if (!candidates.some(c => c.action.type === 'move')) {
        for (const m of moves) {
            if (va.visited.has(getKey(m.q, m.r))) continue;
            if (hexDistance(m, navTarget) === currentDistHex)
                candidates.push({ score: 20000, action: { type: 'move', q: m.q, r: m.r, cost: 1 } });
        }
    }

    // E. Fallback garantito: non sprecare AP.
    // Prima prova celle non visitate, poi — se tutte sono visitate — accetta
    // qualsiasi cella libera nel raggio di movimento (ignora visited).
    // Questo evita che l'agente rimanga fermo con AP rimasti solo perche
    // ha gia visitato tutte le celle vicine.
    if (candidates.length === 0) {
        // Tentativo 1: celle non visitate
        for (const m of moves) {
            if (!va.visited.has(getKey(m.q, m.r))) {
                candidates.push({ score: 5000, action: { type: 'move', q: m.q, r: m.r, cost: 1 } });
                break;
            }
        }
        // Tentativo 2: qualsiasi cella libera (ignora visited)
        if (candidates.length === 0) {
            for (const m of moves) {
                const key = getKey(m.q, m.r);
                if (!virtualOccupied.has(key) || key === getKey(va.q, va.r)) {
                    candidates.push({ score: 1000, action: { type: 'move', q: m.q, r: m.r, cost: 1 } });
                    break;
                }
            }
        }
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].action;
}

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
}


// ============================================================
// UTILS AI — bersaglio e movimento (invariati da V17)
// ============================================================

/**
 * V20 — getHuntingTarget ora accetta virtualHP per saltare bersagli gia morti
 * nel piano virtuale, e distribuisce gli agenti della fazione su bersagli
 * diversi per evitare che tutti convergano sullo stesso punto.
 *
 * @param {object} va             - agente virtuale corrente
 * @param {number} faction        - fazione dell'AI
 * @param {Map}    virtualHP      - HP virtuali aggiornati dal piano in corso
 * @param {Set}    claimedTargets - chiavi gia reclamate da altri agenti virtuali
 */
function getHuntingTarget(va, faction, virtualHP, claimedTargets) {
    const THREAT_RADIUS = 8;
    virtualHP      = virtualHP      ?? new Map();
    claimedTargets = claimedTargets ?? new Set();

    // Fase 1: agente nemico piu appetibile (ancora vivo nel virtuale)
    // PRIORITA KILL: bersagli quasi morti ricevono un bonus di distanza molto
    // elevato, cosi l'AI finisce sempre i bersagli indeboliti prima di
    // disperdere danni su target nuovi (fix "ferisce molti, uccide pochi").
    let closestAgent = null;
    let minAgentDist = Infinity;

    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === faction) continue;
        players[p].agents.forEach(enemy => {
            if (enemy.hp <= 0) return;
            const vhp = virtualHP.get(getKey(enemy.q, enemy.r));
            if (vhp !== undefined && vhp <= 0) return; // gia eliminato nel virtuale

            const rawDist = hexDistance({ q: va.q, r: va.r }, enemy);

            // HP effettivi: usa virtualHP se disponibile (tiene conto dei danni
            // gia pianificati da altri agenti dello stesso turno)
            const effectiveHp = vhp !== undefined ? vhp : enemy.hp;

            // Bonus distanza in base alla "vicinanza alla morte":
            // - nemico killabile da questo agente al prossimo tiro: bonus enorme
            // - nemico killabile da qualsiasi alleato (avgFactionDmg): bonus alto
            // - nemico ferito: bonus proporzionale ai danni subiti
            const liveFaction   = players[faction].agents.filter(a => a.hp > 0);
            const avgFactionDmg = liveFaction.length > 0
                ? liveFaction.reduce((s, a) => s + a.dmg, 0) / liveFaction.length
                : va.ref.dmg;

            let killBonus = 0;
            if (effectiveHp <= va.ref.dmg) {
                // Killabile da me al prossimo tiro: priorita assoluta.
                // Se il bersaglio e stato gia danneggiato nel virtuale (da un
                // agente alleato pianificato prima), questo e IL bersaglio da finire.
                const alreadyHit = vhp !== undefined && vhp < enemy.hp;
                killBonus = alreadyHit ? 18 : 10; // 18 = quasi certamente il piu vicino
            } else if (effectiveHp <= avgFactionDmg) {
                killBonus = 7;
            } else if (effectiveHp < enemy.maxHp) {
                killBonus = Math.min(4, Math.floor((enemy.maxHp - effectiveHp) / enemy.maxHp * 6));
            }

            // claimedTargets: penalita solo se il bersaglio e integro (non ferito).
            // Se e ferito nel virtuale, il secondo agente DEVE convergere, non fuggire.
            const alreadyHitInVirtual = vhp !== undefined && vhp < enemy.hp;
            const claimPen = (!alreadyHitInVirtual && claimedTargets.has(getKey(enemy.q, enemy.r))) ? 2 : 0;

            const d = rawDist - killBonus + claimPen;
            if (d < minAgentDist) { minAgentDist = d; closestAgent = enemy; }
        });
    }

    // Fase 2: minaccia nel raggio tattico?
    let threatExists = false;
    outer: for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === faction) continue;
        for (const e of players[p].agents) {
            if (e.hp > 0 && hexDistance({ q: va.q, r: va.r }, e) <= THREAT_RADIUS) {
                const vhp = virtualHP.get(getKey(e.q, e.r));
                if (vhp !== undefined && vhp <= 0) continue; // gia morto nel virtuale
                threatExists = true; break outer;
            }
        }
    }

    if (threatExists && closestAgent) return closestAgent;

    // Fase 3: HQ nemico con penalita ridotta
    let closestHQ = null;
    let minHQDist = Infinity;
    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === faction) continue;
        if (players[p].hq?.hp > 0) {
            const vhp = virtualHP.get(getKey(players[p].hq.q, players[p].hq.r));
            if (vhp !== undefined && vhp <= 0) continue;
            const dHQ = hexDistance({ q: va.q, r: va.r }, players[p].hq) + 3;
            if (dHQ < minHQDist) { minHQDist = dHQ; closestHQ = players[p].hq; }
        }
    }

    if (closestAgent && minAgentDist <= minHQDist) return closestAgent;
    if (closestHQ) return closestHQ;

    // Fase 4: CP non controllato
    let closestCP = null;
    let minCPDist = Infinity;
    controlPoints.forEach(cp => {
        if (cp.faction === faction) return;
        const d = hexDistance({ q: va.q, r: va.r }, cp) + 15;
        if (d < minCPDist) {
            minCPDist = d;
            closestCP = { q: cp.q, r: cp.r, type: 'cp', hp: 999, faction: cp.faction };
        }
    });

    return closestCP;
}

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
                targets.push({ q, r, type: cell.entity.type === 'hq' ? 'hq' : 'agent', hp: virtualHP.get(key) ?? cell.entity.hp, targetRef: cell.entity });
                break;
            }
            if (cell.type === 'wall' || cell.type === 'barricade') {
                if (!includeObstacles) break;
                targets.push({ q, r, type: cell.type, hp: virtualHP.get(key) ?? cell.hp, targetRef: cell });
                break;
            }
        }
    });

    return targets;
}

function getVirtualMoves(va, virtualOccupied) {
    const moves      = [];
    const originCell = grid.get(getKey(va.q, va.r));
    const isGhost    = !!(va.ref?.spectreBuff || va.ref?.infiltrateBuff);

    if (originCell?.terrain === 'fango') {
        hexDirections.forEach(dir => {
            const nq  = va.q + dir.q, nr = va.r + dir.r;
            const key = getKey(nq, nr);
            const c   = grid.get(key);
            if (c && c.type === 'empty' && !virtualOccupied.has(key)) moves.push({ q: nq, r: nr });
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
                const nq  = curr.q + dir.q, nr = curr.r + dir.r;
                const key = getKey(nq, nr);
                const c   = grid.get(key);
                if (!c || visited.has(key)) return;
                if (isGhost) { if (c.entity) return; }
                else         { if (c.type !== 'empty' || virtualOccupied.has(key)) return; }
                visited.add(key);
                queue.push({ q: nq, r: nr, dist: curr.dist + 1 });
            });
        }
    }

    return moves;
}


// ============================================================
// UTILS AI — helper specifici (invariati da V17)
// ============================================================

function _aiIsTargetNearAnyOfMyAgents(targetCell, myFaction) {
    let near = false;
    players[myFaction].agents.forEach(a => {
        if (a.hp > 0 && hexDistance(a, targetCell) <= 3) near = true;
    });
    return near;
}

function _aiFindGlobalBestDrop(faction, agent) {
    let bestCell  = null;
    let bestScore = -1000;

    grid.forEach(cell => {
        if (cell.type !== 'empty' || cell.entity) return;
        let score = 0;
        const distFromCurrent = hexDistance(agent, cell);
        let enemiesInRange = 0, killableFromHere = false;

        for (const dir of hexDirections) {
            for (let d = 1; d <= agent.rng; d++) {
                const c = grid.get(getKey(cell.q + dir.q * d, cell.r + dir.r * d));
                if (!c) break;
                if (c.entity) {
                    if (c.entity.faction !== faction && c.entity.type === 'agent') {
                        enemiesInRange++;
                        if (c.entity.hp <= agent.dmg) killableFromHere = true;
                    }
                    break;
                }
                if (c.type === 'wall' || c.type === 'barricade') break;
            }
        }

        if (killableFromHere)        score += 1200;
        else if (enemiesInRange > 0) score += 600 + enemiesInRange * 150;

        if (_aiCountEnemiesNear(cell, faction, 1) > 0 && agent.ap <= 3) score -= 500;
        if (distFromCurrent >= 5) score += distFromCurrent * 8;
        if (enemiesInRange === 0 && _aiDistToNearestEnemyHQ(cell, faction) <= 2) score += 300;

        if (score > bestScore) { bestScore = score; bestCell = cell; }
    });

    return bestCell ? { cell: bestCell, score: bestScore } : null;
}

function _aiDistToNearestEnemyHQ(cell, myFaction) {
    let minDist = 99;
    for (let p = 1; p <= totalPlayers; p++) {
        if (p === myFaction || !players[p].hq) continue;
        const d = hexDistance(cell, players[p].hq);
        if (d < minDist) minDist = d;
    }
    return minDist;
}

function _aiHasLineOfSight(start, end) {
    const dq   = end.q - start.q;
    const dr   = end.r - start.r;
    const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
    for (let i = 1; i < dist; i++) {
        const q    = Math.round(start.q + dq * (i / dist));
        const r    = Math.round(start.r + dr * (i / dist));
        const cell = grid.get(getKey(q, r));
        if (cell && (cell.type === 'wall' || cell.type === 'barricade')) return false;
    }
    return true;
}

function _aiGetReachableCount(agent, isGhost) {
    let count = 0;
    const visited = new Set();
    const queue   = [{ q: agent.q, r: agent.r, d: 0 }];
    while (queue.length > 0) {
        const curr = queue.shift();
        const key  = getKey(curr.q, curr.r);
        if (visited.has(key)) continue;
        visited.add(key);
        if (curr.d > 0) count++;
        if (curr.d < agent.mov) {
            hexDirections.forEach(dir => {
                const nq = curr.q + dir.q, nr = curr.r + dir.r;
                const c  = grid.get(getKey(nq, nr));
                if (c && !c.entity) {
                    if (!isGhost && (c.type === 'wall' || c.type === 'barricade')) return;
                    queue.push({ q: nq, r: nr, d: curr.d + 1 });
                }
            });
        }
    }
    return count;
}

function _aiGetGhostShootingSpots(agent, faction) {
    const visited = new Set([getKey(agent.q, agent.r)]);
    const queue   = [{ q: agent.q, r: agent.r, dist: 0 }];
    let bestSpot  = null, bestScore = 0;

    while (queue.length > 0) {
        const curr     = queue.shift();
        const currCell = grid.get(getKey(curr.q, curr.r));

        if (curr.dist > 0 && currCell?.type === 'empty' && !currCell.entity) {
            let spotScore = 0, killable = false;
            const rng = agent.rng + (currCell.terrain === 'altura' ? 1 : 0);

            hexDirections.forEach(dir => {
                for (let d = 1; d <= rng; d++) {
                    const tc = grid.get(getKey(curr.q + dir.q * d, curr.r + dir.r * d));
                    if (!tc) break;
                    if (tc.terrain === 'nebbia' && d > 1) break;
                    if (tc.entity) {
                        if (tc.entity.faction !== faction) {
                            const ehp = tc.terrain === 'copertura' ? tc.entity.hp + 1 : tc.entity.hp;
                            if (tc.entity.type === 'hq') {
                                spotScore += ehp <= agent.dmg ? 15000 : 6000;
                            } else {
                                if (ehp <= agent.dmg) { spotScore += 20000; killable = true; }
                                else spotScore += 8000 + Math.floor((agent.dmg / ehp) * 5000);
                            }
                        }
                        break;
                    }
                    if (tc.type === 'wall' || tc.type === 'barricade') break;
                }
            });

            if (_aiIsGhostOnlyCell(agent, curr.q, curr.r)) spotScore += 4000;
            if (spotScore > bestScore) { bestScore = spotScore; bestSpot = { cell: { q: curr.q, r: curr.r }, score: spotScore, killable }; }
        }

        if (curr.dist < agent.mov) {
            hexDirections.forEach(dir => {
                const nq = curr.q + dir.q, nr = curr.r + dir.r;
                const key = getKey(nq, nr);
                if (visited.has(key)) return;
                const nc = grid.get(key);
                if (!nc || nc.entity) return;
                visited.add(key);
                queue.push({ q: nq, r: nr, dist: curr.dist + 1 });
            });
        }
    }

    return bestSpot;
}

function _aiIsGhostOnlyCell(agent, tq, tr) {
    const visited = new Set([getKey(agent.q, agent.r)]);
    const queue   = [{ q: agent.q, r: agent.r, dist: 0 }];
    const target  = getKey(tq, tr);
    while (queue.length > 0) {
        const curr = queue.shift();
        if (getKey(curr.q, curr.r) === target) return false;
        if (curr.dist < agent.mov) {
            hexDirections.forEach(dir => {
                const nq = curr.q + dir.q, nr = curr.r + dir.r;
                const key = getKey(nq, nr);
                if (visited.has(key)) return;
                const nc = grid.get(key);
                if (!nc || nc.entity || nc.type !== 'empty') return;
                visited.add(key);
                queue.push({ q: nq, r: nr, dist: curr.dist + 1 });
            });
        }
    }
    return true;
}

function _aiCanKillSomeone(agent, faction) {
    let canKill = false;
    grid.forEach(cell => {
        if (cell.entity && cell.entity.faction !== faction
                && hexDistance(agent, cell) <= agent.rng
                && cell.entity.hp <= agent.dmg) canKill = true;
    });
    return canKill;
}

function _aiCountWoundedAlliesNear(agent, faction, radius) {
    let count = 0;
    grid.forEach(cell => {
        if (cell.entity && cell.entity.faction === faction && cell.entity !== agent
                && hexDistance(agent, cell) <= radius && cell.entity.hp < cell.entity.maxHp) count++;
    });
    return count;
}

function _aiCountEnemiesNear(agent, faction, radius) {
    let count = 0;
    grid.forEach(cell => {
        if (cell.entity && cell.entity.faction !== faction
                && hexDistance(agent, cell) <= radius) count++;
    });
    return count;
}

function _aiEvaluateSplashPotential(agent, faction) {
    let bestScore = 0;
    grid.forEach(cell => {
        if (cell.entity && cell.entity.faction !== faction
                && hexDistance(agent, cell) <= agent.rng + agent.mov) {
            let splashCount = 1;
            hexDirections.forEach(dir => {
                const adj = grid.get(getKey(cell.q + dir.q, cell.r + dir.r));
                if (adj?.entity && adj.entity.faction !== faction) splashCount++;
            });
            if (splashCount > bestScore) bestScore = splashCount;
        }
    });
    return bestScore;
}

function _aiIsBlockedByObstacles(agent) {
    let blockedCount = 0;
    hexDirections.forEach(dir => {
        const cell = grid.get(getKey(agent.q + dir.q, agent.r + dir.r));
        if (cell && (cell.type === 'wall' || cell.type === 'barricade')) blockedCount++;
    });
    return blockedCount >= 3;
}

function _aiFindBestAirdropSpot(faction) {
    let bestSpot = null, bestScore = 0;
    grid.forEach(cell => {
        if (cell.type === 'empty' && !cell.entity) {
            let score = 0;
            hexDirections.forEach(dir => {
                const adj = grid.get(getKey(cell.q + dir.q, cell.r + dir.r));
                if (adj?.entity && adj.entity.faction !== faction)
                    score += adj.entity.type === 'hq' ? 100 : 20;
            });
            if (score > bestScore) { bestScore = score; bestSpot = cell; }
        }
    });
    return bestSpot;
}

function _aiHasEnemiesInRange(agent, faction) {
    if (!agent) return false;
    let rng    = agent.rng;
    const cell = grid.get(getKey(agent.q, agent.r));
    if (cell?.terrain === 'altura') rng += 1;
    for (const dir of hexDirections) {
        for (let d = 1; d <= rng; d++) {
            const c = grid.get(getKey(agent.q + dir.q * d, agent.r + dir.r * d));
            if (!c) break;
            if (c.entity) { if (c.entity.faction !== faction) return true; break; }
            if (c.type === 'wall' || c.type === 'barricade') break;
        }
    }
    return false;
}

function _aiEnemiesNearTarget(agent, faction) {
    if (!agent) return 0;
    const target = getHuntingTarget({ q: agent.q, r: agent.r, ref: agent }, faction);
    if (!target) return 0;
    let count = 0;
    hexDirections.forEach(dir => {
        const c = grid.get(getKey(target.q + dir.q, target.r + dir.r));
        if (c?.entity && c.entity.faction !== faction) count++;
    });
    return count + 1;
}

function _aiEnemiesInEMPRange(agent, faction) {
    if (!agent) return 0;
    let count = 0;
    grid.forEach(cell => {
        if (cell.entity?.type === 'agent' && cell.entity.faction !== faction
                && hexDistance(agent, cell.entity) <= 5) count++;
    });
    return count;
}


markScriptAsLoaded('ai.js');
