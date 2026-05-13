/* ============================================================
   ai.js — Intelligenza Artificiale Strategica (V23 - Carte Corrette)
   ============================================================
   ESPONE: executeAITurn
   DIPENDE DA: constants.js, state.js, gamelogic.js,
               network_core.js, graphics.js

   NOVITA V23 rispetto a V22:

   C01 Blitz — usato SOLO se l'azione extra e un tiro offensivo
     che produce un kill o danno grave (score >= 160000).
     Non piu usato per semplici movimenti.

   C02 Airdrop — usato SOLO se:
     1) L'AI ha anche Blitz disponibile e non usato
     2) Dalla cella di drop puo sparare e killare un nemico
        con l'AP rimasto (0 AP dopo drop + 1 AP da Blitz)
     3) Nessun nemico adiacente alla cella di drop
     Altrimenti non viene mai giocato.

   C06 Spettro — attivato al primo turno utile sul miglior agente
     offensivo (dmg * rng massimo), senza aspettare situazioni
     ghost specifiche. E un buff permanente: prima si attiva meglio e.

   C07 Scudo — attivato al primo turno sul miglior agente offensivo
     non ancora scudato. Come Spettro: valore permanente, meglio
     presto che tardi.

   C08 Fortino — fix esecuzione: le 4 barricate vengono ora piazzate
     automaticamente dall AI in posizioni tatticamente utili
     (adiacenti agli agenti, o vicino all HQ sotto pressione).
   ============================================================ */


// ============================================================
// PUNTO DI INGRESSO
// ============================================================

async function executeAITurn() {
    if (state !== 'PLAYING' || (!isHostAITurn() && !isCurrentPlayerAI())) return;

    const aiFaction = currentPlayer;
    const myAgents  = players[aiFaction].agents.filter(a => a.hp > 0);
    if (myAgents.length === 0) { endTurn(); return; }

    console.log(`[AI V23] Fazione ${players[aiFaction].name}: Piano Fluido attivo`);

    // ── FASE ACQUISTO CARTE (Negozio) ──────────────────
    _aiTryBuyCards(aiFaction);

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

            let action = _planBestAction(va, aiFaction, virtualOccupied, virtualHP, claimedTargets);
            if (!action) {
                // Agente bloccato: azzera visited e riprova SUBITO nella stessa iterazione.
                // Se il retry avvenisse solo al giro successivo del while, il break su
                // !anyActionFound terminerebbe il loop prima che l'agente riprovi.
                if (va.ap > 0 && va.visited.size > 1) {
                    va.visited = new Set([getKey(va.q, va.r)]);
                    action = _planBestAction(va, aiFaction, virtualOccupied, virtualHP, claimedTargets);
                }
                if (!action) continue;
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
    _aiTryFortinoPostPlan(aiFaction, vAgents, masterPlan, virtualOccupied);

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

        } else if (step.type === 'move') {
            // FIX CRITICO: Evita che l'IA sovrascriva altre entità sulla griglia reale
            // qualora il piano virtuale abbia calcolato la morte di un bersaglio
            // che invece è sopravvissuto (es. perché aveva lo Scudo attivo).
            const isGhost = !!(selectedAgent.spectreBuff || selectedAgent.infiltrateBuff);
            
            if (targetCell.entity) {
                console.warn(`[AI V23] Divergenza realtà: cella occupata! Mossa abortita per evitare glitch.`);
                continue;
            }
            if (!isGhost && (targetCell.type === 'wall' || targetCell.type === 'barricade')) {
                console.warn(`[AI V23] Divergenza realtà: ostacolo non distrutto! Mossa abortita.`);
                continue;
            }
            validActionTargets = [{ q: step.q, r: step.r }];
            
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
// ACQUISTO CARTE IA (Negozio)
// ============================================================

function _aiTryBuyCards(aiFaction) {
    const pData = players[aiFaction];
    let boughtSomething = false;

    // Finché ha almeno 10 crediti, tenta di comprare
    while ((pData.credits || 0) >= GAME.CREDIT_CARD_REPLACE) {
        
        // 1. Trova uno slot carta vuoto/già usato
        let slotToReplace = -1;
        for (let i = 0; i < (pData.cards?.length || 3); i++) {
            const slotKey = `slot_${i}`;
            if (pData.usedCards && pData.usedCards[slotKey]) {
                slotToReplace = i;
                break;
            }
        }

        // Se non ha slot liberi, esce dal loop (deck pieno)
        if (slotToReplace === -1) break;

        // 2. Sceglie una carta a caso
        const allCardIds = Object.keys(CARD_DEFINITIONS);
        const randomCardId = allCardIds[Math.floor(Math.random() * allCardIds.length)];

        // 3. Esegue la transazione
        pData.credits -= GAME.CREDIT_CARD_REPLACE;
        pData.cards[slotToReplace] = randomCardId;
        delete pData.usedCards[`slot_${slotToReplace}`];
        boughtSomething = true;

        console.log(`[AI V23] Fazione ${pData.name} ha comprato la carta ${randomCardId} per lo slot ${slotToReplace}`);

        // 4. Sincronizza con i client in caso di partita Multiplayer
        if (isOnline && isHost) {
            sendOnlineMessage({
                type:       'SHOP_CARD_REPLACE',
                faction:    aiFaction,
                slotIndex:  slotToReplace,
                newCardId:  randomCardId,
                creditCost: GAME.CREDIT_CARD_REPLACE
            });
        }
    }

    // Se ha comprato almeno una carta, aggiorna UI e mostra il banner
    if (boughtSomething) {
        if (typeof showNotificationBanner === 'function') {
            showNotificationBanner(
                `L'IA ${pData.name.toUpperCase()} ha comprato nuove Carte!`, 
                pData.color
            );
        }
        if (typeof updateIngameCardsUI === 'function') updateIngameCardsUI();
        updateUI();
    }
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

    // Blitz vale la pena SOLO se sblocca un tiro offensivo significativo:
    // - kill garantito su agente (200000+) o ferito (220000+)
    // - kill su HQ (148000+)
    // - danno grave su agente quasi morto (160000+)
    // NON per semplici movimenti o danni marginali.
    const BLITZ_MIN_SCORE = 148000;

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

        console.log(`[AI V23] Blitz post-piano: agente → ${extraAct.type} score=${extraScore}`);
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
    else if (step.cardId === 'C08') {
        // Esegue le costruzioni fisiche calcolate nel Post-Piano
        playSpecialVFX(selectedAgent, CARD_DEFINITIONS.C08.color, '🏰 FORTINO DIFENSIVO!');
        showCardMessage(aiFaction, 'C08');
        
        step.builds.forEach(pos => {
            const cell = grid.get(getKey(pos.q, pos.r));
            if (!cell || cell.entity || cell.type !== 'empty') return;
            
            playSFX('build');
            cell.type           = 'barricade';
            cell.hp             = GAME.BARRICADE_HP;
            cell.maxHp          = GAME.BARRICADE_HP;
            cell.sprite         = getRandomSprite(SPRITE_POOLS.barricades);
            cell.customSpriteId = (typeof THEME_BARRICADE_ID !== 'undefined') ? THEME_BARRICADE_ID : 'barricade';
            
            playSpecialVFX(cell, '#00aaff', '🏰');
            
            if (isOnline) {
                sendOnlineMessage({
                    type: 'ACTION_CARD', cardId: 'C08', slotIndex: step.slotIndex,
                    actingPlayer: aiFaction, targetAgentId: selectedAgent.id,
                    buildQ: pos.q, buildR: pos.r,
                });
            }
        });
    }
}


/**
 * Valuta Fortino DOPO che il masterPlan è costruito.
 * Esamina la posizione finale (virtuale) degli agenti. Se un agente
 * si trova nel raggio di movimento+tiro di un nemico, piazza le barricate
 * sulle celle adiacenti all'agente che guardano verso il nemico.
 */

function _aiTryFortinoPostPlan(aiFaction, vAgents, masterPlan, virtualOccupied) {
    const pData = players[aiFaction];
    if (!pData?.cards?.length) return;

    // Trova lo slot Fortino disponibile
    let fortinoSlot = -1;
    for (let i = 0; i < pData.cards.length; i++) {
        if (pData.cards[i] === 'C08' && !pData.usedCards?.[`slot_${i}`]) {
            fortinoSlot = i; break;
        }
    }
    if (fortinoSlot === -1) return;

    const builds = [];
    const usedKeys = new Set();

    // Raccoglie tutti i nemici vivi sulla mappa
    const enemies = [];
    for (let p = 1; p <= totalPlayers; p++) {
        if (p === aiFaction || !players[p]) continue;
        players[p].agents.forEach(e => { if (e.hp > 0) enemies.push(e); });
    }

    // Per ogni agente (nella sua posizione finale stabilita dal piano)
    for (const va of vAgents) {
        // Ordina i nemici dal più vicino al più lontano
        enemies.sort((a, b) => hexDistance(va, a) - hexDistance(va, b));

        for (const enemy of enemies) {
            const dist = hexDistance(va, enemy);
            
            // Il nemico costituisce una minaccia concreta al prossimo turno?
            if (dist <= enemy.rng + enemy.mov + 1) { 
                
                // Cerca le celle libere adiacenti al mio agente
                for (const dir of hexDirections) {
                    const nq = va.q + dir.q;
                    const nr = va.r + dir.r;
                    const key = getKey(nq, nr);
                    const cell = grid.get(key);
                    
                    if (cell && cell.type === 'empty' && !virtualOccupied.has(key) && !usedKeys.has(key)) {
                        // GEOMETRIA ESAGONALE: Se questa cella è strettamente più vicina 
                        // al nemico rispetto alla mia posizione, significa che si trova 
                        // esattamente sulla linea di tiro tra me e lui. È il punto perfetto.
                        if (hexDistance({q: nq, r: nr}, enemy) < dist) {
                            builds.push({ q: nq, r: nr });
                            usedKeys.add(key);
                            virtualOccupied.add(key); // Evita sovrapposizioni logiche
                            if (builds.length >= GAME.FORTINO_BUILDS) break;
                        }
                    }
                }
            }
            if (builds.length >= GAME.FORTINO_BUILDS) break;
        }
        if (builds.length >= GAME.FORTINO_BUILDS) break;
    }

    // Se abbiamo trovato punti vitali da proteggere, aggiungi l'azione in coda
    if (builds.length > 0) {
        masterPlan.push({
            agent: vAgents[0].ref, // Usato solo come riferimento per il network
            type: 'card',
            cardId: 'C08',
            slotIndex: fortinoSlot,
            cost: 0,
            builds: builds
        });
        console.log(`[AI V23] Fortino post-piano: posizionate ${builds.length} barricate a difesa degli agenti.`);
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
        if (cardId === 'C01' || cardId === 'C08') return; // gestiti post-piano

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

            case 'C07': { // Scudo — buff difensivo permanente
                // Lo scudo persiste tra i turni ed e cumulabile: prima si usa meglio e.
                // Strategia: darlo subito all agente piu offensivo non ancora scudato,
                // proteggendo chi ha piu valore tattico per tutta la partita.
                // Non aspettare una minaccia specifica: l AI non la riconosce in tempo.
                let bestScore = -1;
                myAgents.forEach(a => {
                    if (a.shielded > 0) return; // gia scudato
                    if (a.hp <= 0)      return;
                    // Valore offensivo: premiamo chi spara di piu e da lontano
                    const offScore = a.dmg * 50 + a.rng * 15 + a.mov * 5;
                    // Bonus se e gia in zona calda
                    const nearEnemies = _aiCountEnemiesNear(a, aiFaction, 5);
                    const score = offScore + nearEnemies * 25;
                    if (score > bestScore) { bestScore = score; chosenAgent = a; }
                });
                // Attiva sempre se c'e un agente valido
                if (chosenAgent) shouldPlay = true;
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
                            if (t.shielded > 0) score += 600;
                            else                score += 200;
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
                if (bestScore >= 400) shouldPlay = true;
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

            case 'C06': { // Spettro — buff permanente di mobilita
                // Spettro e permanente per tutta la partita: prima si usa meglio e.
                // Strategia: darlo subito al miglior agente offensivo (dmg * rng)
                // che non lo ha gia. Non aspettare una situazione ghost specifica:
                // l AI non le riconosce bene e la carta resterebbe inutilizzata.
                let bestScore = -1;
                myAgents.forEach(a => {
                    if (a.spectreBuff) return; // gia attivo
                    if (a.hp <= 0)     return;
                    // Valore offensivo: dmg e rng sono le stat piu importanti
                    const offScore = a.dmg * 40 + a.rng * 20 + a.mov * 5;
                    // Bonus se e gia in zona di combattimento
                    const nearEnemies = _aiCountEnemiesNear(a, aiFaction, 6);
                    
                    let wallBonus = 0;
                    hexDirections.forEach(dir => {
                        const adj = grid.get(getKey(a.q + dir.q, a.r + dir.r));
                        if (adj && (adj.type === 'wall' || adj.type === 'barricade'))
                            wallBonus += 15;
                        });
                    const score = offScore + nearEnemies * 30 + wallBonus;
                    if (score > bestScore) { bestScore = score; chosenAgent = a; }
                });
                // Attiva sempre se c'e un agente valido (e un buff permanente,
                // non ha senso tenerlo in mano)
                if (chosenAgent) shouldPlay = true;
                break;
            }

            case 'C02': { // Airdrop — teletrasporto offensivo
                // REGOLA: Airdrop va usato SOLO se:
                // 1) Blitz e disponibile (non usato) — fornira l'AP per sparare
                // 2) Dalla cella di drop si puo killare un nemico con 1 colpo
                // 3) La cella di drop non ha nemici adiacenti (sopravvivenza)
                // Senza kill garantito + Blitz, l'agente atterra a 0 AP
                // e viene ucciso al turno successivo senza aver fatto nulla.
                if (turnCount < 2) break;

                // Verifica che Blitz sia disponibile e non usato
                const blitzAvail = pData.cards.some((cid, si) =>
                    cid === 'C01' && !pData.usedCards?.[`slot_${si}`]
                );
                if (!blitzAvail) break; // senza Blitz l'agente atterra a 0 AP inutilmente

                let bestAction = null;
                let bestScore  = 0;

                myAgents.forEach(a => {
                    if (a.ap < 3) return;

                    // Cerca cella da cui killare un nemico con 1 colpo
                    grid.forEach(cell => {
                        if (cell.type !== 'empty' || cell.entity) return;

                        // Sicurezza: nessun nemico adiacente alla cella di drop
                        const adjacentEnemies = hexDirections.some(dir => {
                            const adj = grid.get(getKey(cell.q + dir.q, cell.r + dir.r));
                            return adj?.entity && adj.entity.faction !== aiFaction
                                && adj.entity.type === 'agent';
                        });
                        if (adjacentEnemies) return;

                        // Distanza minima dal punto di partenza (inutile se gia vicino)
                        const dist = hexDistance(a, cell);
                        if (dist < 4) return; // raggiungibile normalmente

                        // Cerca kill garantito da questa cella
                        let killScore = 0;
                        for (const dir of hexDirections) {
                            for (let d = 1; d <= a.rng; d++) {
                                const tc = grid.get(getKey(cell.q + dir.q * d, cell.r + dir.r * d));
                                if (!tc) break;
                                if (tc.entity) {
                                    if (tc.entity.faction !== aiFaction) {
                                        const ehp = tc.terrain === 'copertura'
                                            ? tc.entity.hp + 1 : tc.entity.hp;
                                        if (ehp <= a.dmg) {
                                            // Kill garantito: e questo il requisito minimo
                                            killScore += tc.entity.type === 'hq' ? 1500 : 1200;
                                        }
                                        // Nessun kill = non interessante per Airdrop
                                    }
                                    break;
                                }
                                if (tc.type === 'wall' || tc.type === 'barricade') break;
                            }
                        }

                        if (killScore === 0) return; // kill non garantito: salta

                        // Bonus per distanza (teletrasporto piu utile se lontano)
                        const score = killScore + dist * 10;
                        if (score > bestScore) {
                            bestScore  = score;
                            bestAction = { agent: a, cell };
                        }
                    });
                });

                // Soglia: kill garantito (1200+) — nessun compromesso
                if (bestAction && bestScore >= 1200) {
                    chosenAgent = bestAction.agent;
                    chosenAgent._aiDropTarget = bestAction.cell;
                    shouldPlay = true;
                }
                break;
            }

            case 'C08': { // Fortino — costruisce 4 barricate ovunque
                // L AI non puo usare setActionMode (richiede click UI).
                // Piazza le 4 barricate automaticamente in posizioni utili:
                // priorita a celle adiacenti agli agenti propri (protezione)
                // o vicino all HQ se sotto pressione nemica.
                const myLive = myAgents.length;
                let enemies  = 0;
                for (let p = 1; p <= totalPlayers; p++) {
                    if (!players[p] || p === aiFaction) continue;
                    enemies += players[p].agents.filter(a => a.hp > 0).length;
                }
                const underPressure = myAgents.some(a => _aiCountEnemiesNear(a, aiFaction, 3) > 0)
                                   || (enemies >= myLive);

                if (underPressure) {
                    // Calcola le celle migliori dove costruire
                    const candidates = [];
                    grid.forEach(cell => {
                        if (cell.type !== 'empty' || cell.entity) return;
                        let score = 0;
                        // Adiacente a un agente proprio: protezione diretta
                        const adjToAlly = hexDirections.some(dir => {
                            const adj = grid.get(getKey(cell.q + dir.q, cell.r + dir.r));
                            return adj?.entity?.faction === aiFaction && adj.entity.type === 'agent';
                        });
                        if (adjToAlly) score += 100;
                        // Adiacente all HQ proprio: difesa base
                        if (players[aiFaction].hq) {
                            const dHQ = hexDistance(cell, players[aiFaction].hq);
                            if (dHQ <= 2) score += 80;
                        }
                        // Tra noi e il nemico piu vicino: valore difensivo
                        let nearEnemy = false;
                        hexDirections.forEach(dir => {
                            const adj = grid.get(getKey(cell.q + dir.q, cell.r + dir.r));
                            if (adj?.entity?.faction !== aiFaction && adj?.entity?.type === 'agent')
                                nearEnemy = true;
                        });
                        if (nearEnemy) score += 60;
                        if (score > 0) candidates.push({ cell, score });
                    });
                    candidates.sort((a, b) => b.score - a.score);

                    if (candidates.length > 0) {
                        chosenAgent = myAgents[0];
                        shouldPlay  = true;
                        // Salva le celle da costruire (max 4, uniche)
                        const builds = [];
                        const used   = new Set();
                        for (const c of candidates) {
                            const k = getKey(c.cell.q, c.cell.r);
                            if (!used.has(k)) { used.add(k); builds.push(c.cell); }
                            if (builds.length >= GAME.FORTINO_BUILDS) break;
                        }
                        chosenAgent._aiFortinoBuilds = builds;
                    }
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

        } else if (cardId === 'C08') {
            // Fortino: esegui le costruzioni automaticamente senza UI
            const builds = chosenAgent._aiFortinoBuilds ?? [];
            delete chosenAgent._aiFortinoBuilds;
            // Applica l'effetto base della carta (imposta fortinoActive ecc.)
            // ma NON chiamiamo setActionMode che richiederebbe click UI.
            // Costruiamo direttamente le barricate.
            playSpecialVFX(chosenAgent, CARD_DEFINITIONS.C08.color, '🏰 FORTINO x4!');
            showCardMessage(aiFaction, 'C08');
            builds.forEach(pos => {
                const cell = grid.get(getKey(pos.q, pos.r));
                if (!cell || cell.entity || cell.type !== 'empty') return;
                playSFX('build');
                cell.type           = 'barricade';
                cell.hp             = GAME.BARRICADE_HP;
                cell.maxHp          = GAME.BARRICADE_HP;
                cell.sprite         = getRandomSprite(SPRITE_POOLS.barricades);
                // THEME_BARRICADE_ID potrebbe non essere definito: usa fallback
                cell.customSpriteId = (typeof THEME_BARRICADE_ID !== 'undefined')
                    ? THEME_BARRICADE_ID : 'barricade';
                playSpecialVFX(cell, '#00aaff', '🏰');
                if (isOnline) sendOnlineMessage({
                    type: 'ACTION_CARD', cardId: 'C08', slotIndex,
                    actingPlayer: aiFaction, targetAgentId: chosenAgent.id,
                    buildQ: pos.q, buildR: pos.r,
                });
            });
            drawGame();

        } else {
            card.apply(aiFaction);
        }

        console.log(`[AI V23] Pre-piano — carta: ${card.name}`);
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

        let spettroWallBonus = 0;
        if (va.ref.spectreBuff) {
            const destCell = grid.get(getKey(m.q, m.r));
            if (destCell && (destCell.type === 'wall' || destCell.type === 'barricade'))
                spettroWallBonus = 12000;
        }
        const score = Math.max(baseScore, lookaheadScore) + spettroWallBonus;
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
        const newHP = (virtualHP.get(tKey) ?? (grid.get(tKey)?.entity?.hp ?? grid.get(tKey)?.hp ?? 0)) - va.ref.dmg;
        virtualHP.set(tKey, newHP);
        if (newHP <= 0) virtualOccupied.delete(tKey);

        // Simula lo splash di Esplosivo (demoBuff) sulle celle adiacenti:
        // senza questa simulazione il piano virtuale non sa che i nemici
        // adiacenti al bersaglio muoiono per splash, e pianifica tiri su
        // bersagli gia morti nella realta, sprecando AP.
        if (va.ref.demoBuff) {
            const splashDmg = Math.ceil(va.ref.dmg / 2);
            hexDirections.forEach(dir => {
                const adjKey  = getKey(action.q + dir.q, action.r + dir.r);
                const adjCell = grid.get(adjKey);
                if (!adjCell) return;
                // Applica splash solo a nemici o ostacoli, non ad alleati
                if (adjCell.entity && adjCell.entity.faction !== va.ref.faction) {
                    const adjCurHP = virtualHP.get(adjKey) ?? adjCell.entity.hp;
                    const adjNewHP = adjCurHP - splashDmg;
                    virtualHP.set(adjKey, adjNewHP);
                    if (adjNewHP <= 0) virtualOccupied.delete(adjKey);
                } else if (adjCell.type === 'wall' || adjCell.type === 'barricade') {
                    const adjCurHP = virtualHP.get(adjKey) ?? adjCell.hp;
                    const adjNewHP = adjCurHP - splashDmg;
                    virtualHP.set(adjKey, adjNewHP);
                    if (adjNewHP <= 0) virtualOccupied.delete(adjKey);
                }
            });
        }
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

/**
 * Sceglie il bersaglio "branco": il nemico più vantaggioso su cui
 * concentrare TUTTI gli agenti della fazione.
 * Criteri in ordine di peso:
 *  1. Isolamento: nemici di supporto entro r=4 dal bersaglio (meno = meglio)
 *  2. HP bassi (quasi morto = kill facile)
 *  3. Vicinanza media agli agenti propri (meno strada da fare)
 * Restituisce l'entità nemica scelta, o null se non ci sono nemici.
 */
function _aiPickPackTarget(faction, myAgents, virtualHP) {
    let bestTarget = null;
    let bestScore  = -Infinity;

    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === faction) continue;
        players[p].agents.forEach(enemy => {
            if (enemy.hp <= 0) return;
            const vhp = virtualHP.get(getKey(enemy.q, enemy.r));
            if (vhp !== undefined && vhp <= 0) return; // già morto nel virtuale

            const effectiveHp = vhp !== undefined ? vhp : enemy.hp;

            // 1. Isolamento: conta nemici alleati entro raggio 4
            //    Un nemico solo vale molto di più di uno protetto da altri 2
            let nearbyEnemyAllies = 0;
            for (let p2 = 1; p2 <= totalPlayers; p2++) {
                if (!players[p2] || p2 === faction || p2 === p) continue;
                players[p2].agents.forEach(e2 => {
                    if (e2.hp > 0 && hexDistance(enemy, e2) <= 4) nearbyEnemyAllies++;
                });
            }
            // Anche gli altri agenti della stessa fazione nemica contano
            players[p].agents.forEach(e2 => {
                if (e2 !== enemy && e2.hp > 0 && hexDistance(enemy, e2) <= 4) nearbyEnemyAllies++;
            });
            const isolationScore = (3 - nearbyEnemyAllies) * 40; // +40 per ogni nemico di supporto mancante

            // 2. HP bassi: quasi morto = kill rapido, libera il branco subito
            const hpScore = (1 - effectiveHp / enemy.maxHp) * 30;

            // 3. Vicinanza media ai nostri agenti: meno strada = meglio
            const liveAllies = myAgents.filter(a => a.hp > 0);
            const avgDist = liveAllies.length > 0
                ? liveAllies.reduce((s, a) => s + hexDistance(a, enemy), 0) / liveAllies.length
                : 99;
            const distScore = Math.max(0, 20 - avgDist) * 2; // bonus per bersagli vicini

            const score = isolationScore + hpScore + distScore;
            if (score > bestScore) { bestScore = score; bestTarget = enemy; }
        });
    }
    return bestTarget;
}

function getHuntingTarget(va, faction, virtualHP, claimedTargets) {
    const THREAT_RADIUS = 8;
    virtualHP      = virtualHP      ?? new Map();
    claimedTargets = claimedTargets ?? new Set();

    const liveFaction   = players[faction].agents.filter(a => a.hp > 0);
    const avgFactionDmg = liveFaction.length > 0
        ? liveFaction.reduce((s, a) => s + a.dmg, 0) / liveFaction.length
        : va.ref.dmg;

    // Fase 1 — BERSAGLIO BRANCO
    // Tutti gli agenti convergono sullo stesso bersaglio scelto centralmente:
    // il nemico più isolato, quasi morto e vicino al centroide del branco.
    // Eccezione: se il bersaglio branco è già killabile da questo agente
    // nella sua posizione attuale (sezione A di _planBestAction lo gestisce),
    // oppure se un bersaglio ferito è più urgente, si usa quello.
    const packTarget = _aiPickPackTarget(faction, liveFaction, virtualHP);

    let closestAgent = null;
    let minAgentDist = Infinity;

    // Prima controlla se c'è un bersaglio ferito nel virtuale killabile da me:
    // ha sempre priorità assoluta (completa il kill già iniziato).
    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === faction) continue;
        players[p].agents.forEach(enemy => {
            if (enemy.hp <= 0) return;
            const vhp = virtualHP.get(getKey(enemy.q, enemy.r));
            if (vhp !== undefined && vhp <= 0) return;
            const effectiveHp = vhp !== undefined ? vhp : enemy.hp;
            const alreadyHit  = vhp !== undefined && vhp < enemy.hp;
            // Bersaglio ferito nel virtuale E killabile da me = priorità assoluta
            if (alreadyHit && effectiveHp <= va.ref.dmg) {
                const d = hexDistance({ q: va.q, r: va.r }, enemy) - 18;
                if (d < minAgentDist) { minAgentDist = d; closestAgent = enemy; }
            }
        });
    }

    // Se non c'è un ferito da finire, usa il bersaglio branco
    if (!closestAgent && packTarget) {
        const vhp         = virtualHP.get(getKey(packTarget.q, packTarget.r));
        const effectiveHp = vhp !== undefined ? vhp : packTarget.hp;
        const alreadyHit  = vhp !== undefined && vhp < packTarget.hp;
        let killBonus = 0;
        if (effectiveHp <= va.ref.dmg)     killBonus = alreadyHit ? 18 : 10;
        else if (effectiveHp <= avgFactionDmg) killBonus = 7;
        else if (effectiveHp < packTarget.maxHp)
            killBonus = Math.min(4, Math.floor((packTarget.maxHp - effectiveHp) / packTarget.maxHp * 6));
        const d = hexDistance({ q: va.q, r: va.r }, packTarget) - killBonus;
        minAgentDist = d;
        closestAgent = packTarget;
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
                    // Salta entita gia morte nel piano virtuale (uccise da un agente precedente
                    // nello stesso turno): evita che altri agenti pianifichino tiri su bersagli
                    // gia eliminati, sprecando AP e bloccando la pianificazione successiva.
                    const vhp = virtualHP.get(key);
                    if (vhp !== undefined && vhp <= 0) break;
                    targets.push({ q, r, type: cell.entity.type === 'hq' ? 'hq' : 'agent', hp: vhp ?? cell.entity.hp, targetRef: cell.entity });
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
