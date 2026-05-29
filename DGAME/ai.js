/* ============================================================
   ai.js — Intelligenza Artificiale Reattiva (V24 - RealTime & No Loops)
   ============================================================
   Questa versione abbandona la pianificazione virtuale a favore
   di un approccio "Greedy Real-Time": dopo ogni singola spesa di AP,
   l'IA rivaluta l'intera scacchiera.

   PRIORITÀ ASSOLUTE:
   1. Sparare ai nemici a tiro (Kill > Danno > HQ).
   2. Muoversi verso il nemico più vicino usando strade libere 
      (ricordando i passi fatti per non girare in tondo).
   3. Sfondare Muri SOLO se la strada è fisicamente bloccata.
   4. Carte usate come nella V23.
   ============================================================ */

/**
 * Esegue la Combo Letale (Airdrop + Blitz + Spara).
 * Restituisce 'true' se la combo è stata eseguita, 'false' altrimenti.
 */
async function _aiExecuteAirdropCombo(aiFaction) {
    // 1. Niente combo al primo turno
    if (turnCount < 2) return false;

    const pData = players[aiFaction];
    if (!pData || !pData.cards) return false;

    // 2. Verifica che ENTRAMBE le carte siano disponibili
    const dropSlot = pData.cards.findIndex((c, i) => c === 'C02' && !pData.usedCards?.[`slot_${i}`]);
    const blitzSlot = pData.cards.findIndex((c, i) => c === 'C01' && !pData.usedCards?.[`slot_${i}`]);

    if (dropSlot === -1 || blitzSlot === -1) return false;

    const myAgents = pData.agents.filter(a => a.hp > 0 && a.ap >= 3);
    if (myAgents.length === 0) return false;

    // 3. Cerca un bersaglio valido in tutta la mappa
    let comboTarget = null;
    let comboDropCell = null;
    let comboAgent = null;
    let bestScore = -1;

    for (const agent of myAgents) {
        grid.forEach(cell => {
            if (cell.type !== 'empty' || cell.entity) return;
            
            // Sicurezza: Non atterrare se ci sono più di 1 nemico vicino (evita suicidi inutili)
            if (_aiCountEnemiesNear(cell, aiFaction, agent.rng) > 1) return;

            // Simula di essere nella cella
            const fakeAgent = { ...agent, q: cell.q, r: cell.r };
            const shootTarget = _aiGetBestRealShootTarget(fakeAgent, aiFaction);

            // C'è un bersaglio e lo uccido? (La funzione _aiGetBestRealShootTarget calcola già coperture e muri)
            if (shootTarget) {
                const targetEntity = shootTarget.entity;
                
                // Controllo ferreo: no scudi, no hp > danno
                if (targetEntity.shielded > 0) return;
                if (targetEntity.hp > agent.dmg) return;

                // Gli agenti valgono 5000, l'HQ solo 1000. L'AI preferirà sempre saltare su un agente.
                let score = targetEntity.type === 'hq' ? 1000 : 5000;
                score += hexDistance(agent, cell) * 10; // Più salto lontano, meglio è

                if (score > bestScore) {
                    bestScore = score;
                    comboTarget = targetEntity;
                    comboDropCell = cell;
                    comboAgent = agent;
                }
            }
        });
    }

    // 4. Se abbiamo trovato la combo perfetta, ESEGUI!
    if (comboAgent && comboDropCell && comboTarget) {
        console.log(`[AI V24] Eseguo Combo Airdrop+Blitz su ${comboTarget.id}`);
        
        selectedAgent = comboAgent;

        // --- STEP A: AIRDROP ---
        pData.usedCards[`slot_${dropSlot}`] = true;
        grid.get(getKey(comboAgent.q, comboAgent.r)).entity = null;
        comboDropCell.entity = comboAgent;
        comboAgent.q = comboDropCell.q;
        comboAgent.r = comboDropCell.r;
        comboAgent.ap = 0; // Azzera AP

        const cpKey = getKey(comboAgent.q, comboAgent.r);
        if (controlPoints.has(cpKey) && controlPoints.get(cpKey).faction !== comboAgent.faction) {
            controlPoints.get(cpKey).faction = comboAgent.faction;
            if (typeof showCPCapture === 'function') showCPCapture(comboAgent);
        }

        playSpecialVFX(comboAgent, '#a0ff00', '🪂 INFILTRAZIONE!');
        if (isOnline) sendOnlineMessage({
            type: 'ACTION_CARD', cardId: 'C02', slotIndex: dropSlot,
            actingPlayer: aiFaction, targetAgentId: comboAgent.id,
            aiDropQ: comboAgent.q, aiDropR: comboAgent.r
        });
        
        drawGame();
        await delay(800); // Piccola pausa visiva

        // --- STEP B: BLITZ ---
        pData.usedCards[`slot_${blitzSlot}`] = true;
        CARD_DEFINITIONS['C01'].apply(aiFaction); // Dà +1 AP all'agente selezionato

        if (isOnline) sendOnlineMessage({
            type: 'ACTION_CARD', cardId: 'C01', slotIndex: blitzSlot,
            actingPlayer: aiFaction, targetAgentId: comboAgent.id
        });
        
        drawGame();
        await delay(500);

        // --- STEP C: SPARA ---
        validActionTargets = [{ 
            q: comboTarget.q, r: comboTarget.r, 
            target: comboTarget, isEnemy: true, isObstacle: false 
        }];
        currentActionMode = 'shoot';
        executeAction(grid.get(getKey(comboTarget.q, comboTarget.r)));
        
        drawGame();
        await delay(GAME.AI_STEP_DELAY_MS);
        
        return true;
    }

    return false;
}


// ============================================================
// PUNTO DI INGRESSO PRINCIPALE
// ============================================================

async function executeAITurn() {
    if (state !== 'PLAYING' || (!isHostAITurn() && !isCurrentPlayerAI())) return;

    const aiFaction = currentPlayer;
    const myAgents  = players[aiFaction].agents.filter(a => a.hp > 0);
    if (myAgents.length === 0) { endTurn(); return; }

    console.log(`[AI V24] Fazione ${players[aiFaction].name}: Avvio IA Real-Time`);

    // ── FASE 1: ACQUISTO CARTE E BUFF PERMANENTI ───────────────
    _aiTryBuyCards(aiFaction);

    await _aiExecuteAirdropCombo(aiFaction);

    await _aiEvaluateAndPlayCards(aiFaction); // Usa TUTTE le carte disponibili
    drawGame();
    await delay(GAME.AI_STEP_DELAY_MS);

    // ── FASE 2: ESECUZIONE AZIONI (AGENTE PER AGENTE) ─────────
    // Ordina agenti: chi ha già nemici a tiro agisce per primo.
    myAgents.sort((a, b) => {
        const aTarget = _aiGetBestRealShootTarget(a, aiFaction) ? 0 : 1;
        const bTarget = _aiGetBestRealShootTarget(b, aiFaction) ? 0 : 1;
        return aTarget - bTarget;
    });

    for (const agent of myAgents) {
        if (state !== 'PLAYING' || currentPlayer !== aiFaction) break;
        if (agent.hp <= 0) continue;

        const visitedThisTurn = new Set([getKey(agent.q, agent.r)]);

        // Il ciclo continua finché ci sono AP
        while (agent.hp > 0 && state === 'PLAYING' && currentPlayer === aiFaction) {
            
            // A. Se ha 0 AP, prova a usare Blitz per ottenere l'ultimo colpo
            if (agent.ap === 0) {
                const blitzSuccess = await _aiTryBlitzRealtime(aiFaction, agent);
                if (!blitzSuccess) break; // Se non ha blitz o non serve, l'agente ha davvero finito
            }

            await _aiEvaluateAndPlayCards(aiFaction);
            
            const bestAction = _determineBestSingleAction(agent, aiFaction, visitedThisTurn);
            if (!bestAction) break; 

            selectedAgent = agent;
            const targetCell = grid.get(getKey(bestAction.q, bestAction.r));

            // --- ESECUZIONE FISICA DELL'AZIONE ---
            if (bestAction.type === 'shoot') {
                validActionTargets = [{
                    q: bestAction.q, r: bestAction.r,
                    target: bestAction.entity || targetCell,
                    isEnemy: !!bestAction.entity,
                    isObstacle: !bestAction.entity
                }];
                currentActionMode = 'shoot';
                executeAction(targetCell);

            } else if (bestAction.type === 'move') {
                visitedThisTurn.add(getKey(bestAction.q, bestAction.r)); // Aggiorna memoria
                validActionTargets = [{ q: bestAction.q, r: bestAction.r }];
                currentActionMode = 'move';
                executeAction(targetCell);
            }

            drawGame();
            
            // Gestione ritardo visivo (annullato se nella nebbia di guerra Coop)
            let currentDelay = GAME.AI_STEP_DELAY_MS;
            if (typeof coopState !== 'undefined' && coopState.active) {
                let isVisible = false;
                for (let p = 1; p <= window._coopHumanPlayers; p++) {
                    const humans = players[p]?.agents || [];
                    for (const h of humans) {
                        if (h.hp > 0 && hexDistance(h, agent) <= h.rng) {
                            isVisible = true; break;
                        }
                    }
                    if (isVisible) break;
                }
                if (!isVisible) currentDelay = 0; 
            }
            if (currentDelay > 0) await delay(currentDelay);
        }
    }

    // ── FASE 3: CARTE POST-AZIONE ─────────────────────────────
    await _aiTryBlitzRealtime(aiFaction, players[aiFaction].agents.find(a => a.hp > 0 && a.ap === 0) || players[aiFaction].agents.find(a => a.hp > 0));
    _aiTryFortinoRealtime(aiFaction);

    if (currentPlayer === aiFaction) endTurn();
}


// ============================================================
// CORE LOGIC: DETERMINA LA SINGOLA MOSSA MIGLIORE
// ============================================================

function _determineBestSingleAction(agent, faction, visitedThisTurn) {
    
    // 1. PRIORITÀ ASSOLUTA: Posso sparare a un nemico?
    const shootTarget = _aiGetBestRealShootTarget(agent, faction);
    if (shootTarget) {
        return { type: 'shoot', q: shootTarget.q, r: shootTarget.r, entity: shootTarget.entity };
    }

    // 2. Troviamo il nostro obiettivo a lungo termine
    const globalTarget = _findBestGlobalTarget(agent, faction);
    if (!globalTarget) return null;

    // --- CONTROLLO FANGO E VELOCITÀ REALE ---
    const originCell = grid.get(getKey(agent.q, agent.r));
    const actualMov = (originCell && originCell.terrain === 'fango') ? 1 : agent.mov;

    let intendedStep = null;

    // 3. NAVIGAZIONE PULITA (Senza spaccare muri)
    const cleanPath = _findOptimalPath(agent, globalTarget, false);
    if (cleanPath && cleanPath.length > 0) {
        const maxJump = Math.min(actualMov, cleanPath.length);
        for (let i = maxJump - 1; i >= 0; i--) {
            const step = cleanPath[i];
            if (!visitedThisTurn.has(getKey(step.q, step.r))) {
                intendedStep = { type: 'move', q: step.q, r: step.r };
                break;
            }
        }
    }

    // 4. SFONDAMENTO (La strada pulita è bloccata)
    if (!intendedStep) {
        const smashPath = _findOptimalPath(agent, globalTarget, true);
        if (smashPath && smashPath.length > 0) {
            const maxJump = Math.min(actualMov, smashPath.length);
            let wallIndex = -1;
            for (let i = 0; i < smashPath.length; i++) {
                if (smashPath[i].isWall) { wallIndex = i; break; }
            }

            if (wallIndex === 0) {
                intendedStep = { type: 'shoot', q: smashPath[0].q, r: smashPath[0].r };
            } else if (wallIndex > 0 && wallIndex <= actualMov) {
                const stepBeforeWall = smashPath[wallIndex - 1];
                if (!visitedThisTurn.has(getKey(stepBeforeWall.q, stepBeforeWall.r))) {
                    intendedStep = { type: 'move', q: stepBeforeWall.q, r: stepBeforeWall.r };
                }
            } else {
                for (let i = maxJump - 1; i >= 0; i--) {
                    const step = smashPath[i];
                    if (!visitedThisTurn.has(getKey(step.q, step.r))) {
                        intendedStep = { type: 'move', q: step.q, r: step.r };
                        break;
                    }
                }
            }
        }
    }


    // --- POSIZIONAMENTO TATTICO: Fermati sul bordo della gittata ---
    // Attivo solo per agenti con rng > 1 e solo se abbiamo un passo pianificato
    if (intendedStep && intendedStep.type === 'move' && agent.rng > 1 && globalTarget) {

        // Costruisci la lista delle celle raggiungibili in questo AP
        // (tutte le celle lungo il percorso fino a actualMov passi)
        const cleanPath2 = _findOptimalPath(agent, globalTarget, false);
        const reachable = [];

        if (cleanPath2 && cleanPath2.length > 0) {
            const maxJump = Math.min(actualMov, cleanPath2.length);
            for (let i = 0; i < maxJump; i++) {
                const step = cleanPath2[i];
                if (!visitedThisTurn.has(getKey(step.q, step.r))) {
                    reachable.push(step);
                }
            }
        }

        // Tra le celle raggiungibili, trova quelle da cui posso già sparare al bersaglio
        let bestTacticalStep = null;
        let bestTacticalDist = -1;

        for (const step of reachable) {
            // Crea un agente fittizio in quella posizione
            const fakeAgent = { ...agent, q: step.q, r: step.r };
            const shootTarget = _aiGetBestRealShootTarget(fakeAgent, faction);

            // Può sparare a qualcuno da questa cella?
            if (shootTarget) {
                const distFromTarget = hexDistance(step, globalTarget);
                // Preferisce la cella più lontana dal bersaglio (massimizza distanza)
                // In parità, preferisce la cella meno minacciata
                const isThreatened = _aiIsCellThreatened(step, faction) ? 0 : 1;
                const score = distFromTarget * 10 + isThreatened;

                if (score > bestTacticalDist) {
                    bestTacticalDist = score;
                    bestTacticalStep = step;
                }
            }
        }

        // Se abbiamo trovato una cella tattica, sostituisce il passo normale
        if (bestTacticalStep) {
            intendedStep = { type: 'move', q: bestTacticalStep.q, r: bestTacticalStep.r };
        }
        // Se nessuna cella raggiungibile offre la linea di tiro, intendedStep rimane
        // invariato e l'AI continua ad avvicinarsi normalmente
    }

    // --- NUOVA LOGICA: ISTINTO DI SOPRAVVIVENZA (ULTIMA AZIONE) ---
    const pData = players[faction];
    const hasBlitz = pData.cards && pData.cards.some((c, i) => c === 'C01' && !pData.usedCards?.['slot_' + i]);

    // Se è il suo ultimo AP, non ha blitz, E ha pianificato di muoversi
    if (agent.ap === 1 && !hasBlitz && intendedStep && intendedStep.type === 'move') {
        
        // La cella dove vuole andare è sicura o è già nel mirino nemico?
        const isThreatened = _aiIsCellThreatened(intendedStep, faction);
        
        if (isThreatened) {
            // Se andare avanti è pericoloso, abbandona l'avanzata e cerca riparo
            const safeMove = _aiFindSafeMove(agent, faction, visitedThisTurn);
            if (safeMove) {
                return { type: 'move', q: safeMove.q, r: safeMove.r };
            } else {
                // Non ci sono posti sicuri. Meglio non muoversi e finire il turno qui.
                console.log(`[AI V24] Agente blocca l'avanzata per evitare il fuoco nemico.`);
                return null; 
            }
        }
    }

    // --- BONUS CP: se l'AI sta per muoversi, controlla se il passo pianificato
    // è un CP neutro/nemico, oppure se un CP è adiacente alla posizione attuale.
    // In entrambi i casi lo cattura senza allungare la strada di più di 1 passo.
    if (intendedStep && intendedStep.type === 'move') {
        // 1. Il passo pianificato è già su un CP? Nessun costo aggiuntivo.
        const stepKey = getKey(intendedStep.q, intendedStep.r);
        if (controlPoints.has(stepKey) && controlPoints.get(stepKey).faction !== faction) {
            return intendedStep; // Lo cattura gratis passandoci sopra
        }

        // 2. C'è un CP adiacente alla posizione ATTUALE non ancora nostro?
        //    Costa 1 passo extra ma vale la pena se siamo a portata.
        for (const dir of hexDirections) {
            const nq = agent.q + dir.q;
            const nr = agent.r + dir.r;
            const key = getKey(nq, nr);
            if (!controlPoints.has(key)) continue;
            if (controlPoints.get(key).faction === faction) continue;
            const cell = grid.get(key);
            if (!cell || cell.type !== 'empty' || cell.entity) continue;
            if (visitedThisTurn.has(key)) continue;
            // Deviazione accettata: è adiacente, quindi costa solo 1 AP
            return { type: 'move', q: nq, r: nr };
        }
    }

    return intendedStep; // Se non c'è pericolo, esegue l'avanzata normalmente
}


// ============================================================
// FUNZIONI DI SUPPORTO: VISIONE E PATHFINDING
// ============================================================

/**
 * Cerca il miglior bersaglio a cui sparare DALLA POSIZIONE ATTUALE.
 * Regole nebbia incluse.
 */
function _aiGetBestRealShootTarget(agent, faction) {
    let best = null;
    let bestScore = -1;

    let currentRng = agent.rng;
    const originCell = grid.get(getKey(agent.q, agent.r));
    if (originCell?.terrain === 'altura') currentRng += 1;

    // --- MODIFICA CRITICA: L'IA vede attraverso 1 ostacolo SOLO se ha il buff attivo o la carta ---
    const pData = players[faction];
    const hasSniperCard = pData.cards && pData.cards.some((c, i) => c === 'C03' && !pData.usedCards?.[`slot_${i}`]);
    const isSniper = !!agent.sniperBuff;
    
    const canPotentialPierce = isSniper || hasSniperCard;

    for (const dir of hexDirections) {
        let obstaclesHit = 0; 

        for (let d = 1; d <= currentRng; d++) {
            const q = agent.q + dir.q * d;
            const r = agent.r + dir.r * d;
            const cell = grid.get(getKey(q, r));
            
            if (!cell) break;
            if (cell.terrain === 'nebbia' && d > 1 && !cell.entity?.empFogRevealed) break;
            
            const isWallObstacle = (cell.type === 'wall' || cell.type === 'barricade');

            if (cell.entity) {
                if (cell.entity.faction === faction) break; 
                if (cell.entity.hp <= 0) break;

                // Calcolo punteggio
                let effectiveHp = cell.entity.hp + (cell.terrain === 'copertura' ? 1 : 0);
                let score = (cell.entity.type === 'hq') ? 5000 : 100000;
                if (effectiveHp <= agent.dmg) score += 100000;

                // === DECISIONE SE CONSIDERARE IL BERSAGLIO ===
                const canHitThisTarget = (obstaclesHit === 0) || canPotentialPierce;

                if (canHitThisTarget) {
                    if ((isWallObstacle || obstaclesHit > 0) && canPotentialPierce) {
                        score += 50000; // Bonus solo se stiamo usando la perforazione
                    }

                    if (score > bestScore) {
                        bestScore = score;
                        best = { q, r, entity: cell.entity };
                    }
                }

                // === GESTIONE DELLA LINEA DI TIRO (STOP) ===
                if (!canPotentialPierce) {
                    break; // Normale: si ferma al primo nemico o muro
                } else {
                    obstaclesHit++;
                    if (obstaclesHit > 1) break; // Cecchino: massimo 1 ostacolo
                }
                continue;
            }

            // Muro senza entità
            if (isWallObstacle) {
                if (!canPotentialPierce) {
                    break; // Muro blocca la vista
                } else {
                    obstaclesHit++;
                    if (obstaclesHit > 1) break;
                }
            }
        }
    }
    return best; 
}

/** Trova a chi puntare per camminare */
function _findBestGlobalTarget(agent, faction) {
    
    // 1. Coop Mostri -> Umano più vicino
    if (faction === 9 && typeof coopState !== 'undefined' && coopState.active) {
        let closestHuman = null;
        let minDist = Infinity;
        for (let p = 1; p <= 8; p++) {
            if (!players[p] || p === faction) continue;
            players[p].agents.forEach(h => {
                if (h.hp > 0) {
                    const d = hexDistance(agent, h);
                    if (d < minDist) { minDist = d; closestHuman = h; }
                }
            });
        }
        if (closestHuman) return closestHuman;
    }

    // 2. Giocatori normali -> Agente nemico più vicino
    let closestEnemy = null;
    let minEnemyDist = Infinity;
    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === faction) continue;
        players[p].agents.forEach(e => {
            if (e.hp > 0) {
                const d = hexDistance(agent, e);
                if (d < minEnemyDist) { minEnemyDist = d; closestEnemy = e; }
            }
        });
    }
    if (closestEnemy) return closestEnemy;

    // 3. Fallback -> HQ Nemico (solo se non ci sono agenti o sono davvero troppo lontani)
    let closestHQ = null;
    let minHQDist = Infinity;
    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === faction) continue;
        if (players[p].hq && players[p].hq.hp > 0) {
            // Aggiungiamo +20 alla distanza dell'HQ per "scoraggiarlo" 
            // finché c'è un qualsiasi agente anche lontano.
            const d = hexDistance(agent, players[p].hq) + 20; 
            if (d < minHQDist) { minHQDist = d; closestHQ = players[p].hq; }
        }
    }
    if (closestHQ) return closestHQ;

    // 4. Fallback -> Punti di Controllo
    let closestCP = null;
    let minCPDist = Infinity;
    controlPoints.forEach(cp => {
        if (cp.faction === faction) return;
        const d = hexDistance(agent, cp);
        if (d < minCPDist) { minCPDist = d; closestCP = cp; }
    });
    
    return closestCP;
}

// =================== SOSTITUISCI _findPathStep CON QUESTA ===================
/** 
 * Trova il percorso completo verso il bersaglio.
 * Restituisce un Array di passi: [{q, r}, {q, r, isWall: true}, ...]
 */
function _findOptimalPath(agent, target, allowSmashing) {
    const startKey = getKey(agent.q, agent.r);
    const isGhost = !!(agent.spectreBuff || agent.infiltrateBuff);

    // Salviamo l'intero percorso nella coda
    const queue = [{ q: agent.q, r: agent.r, path: [] }];
    const visited = new Set([startKey]);

    let maxSteps = 2000; // Sicurezza per evitare blocchi del browser

    while (queue.length > 0 && maxSteps > 0) {
        maxSteps--;
        const curr = queue.shift();

        // Ci fermiamo quando arriviamo adiacenti al bersaglio (per sparare) o sopra ad esso (es. Control Point)
        const isEntityTarget = target.hp !== undefined && target.type !== undefined;
        const stopDist = isEntityTarget ? 1 : 0;
        if (hexDistance(curr, target) <= stopDist) {
            return curr.path; // Ritorna l'intero array di mosse!
        }

        for (const dir of hexDirections) {
            const nq = curr.q + dir.q;
            const nr = curr.r + dir.r;
            const key = getKey(nq, nr);

            if (visited.has(key)) continue;

            const cell = grid.get(key);
            if (!cell) continue;

            let canPass = false;
            let isWall = false;

            // REGOLA VALICAMENTO (FIX ACQUA)
            if (isGhost) {
                // I fantasmi (Spettro/Infiltrati) ignorano acqua e muri, ma non camminano sulle persone
                if (!cell.entity) canPass = true;
            } else {
                // Agenti normali: camminano SOLO sulle celle "empty". L'Acqua è "water", quindi è bloccata!
                if (cell.type === 'empty') { 
                    if (!cell.entity) canPass = true;
                } else if (cell.type === 'wall' || cell.type === 'barricade') {
                    if (allowSmashing) {
                        canPass = true;
                        isWall = true;
                    }
                }
            }

            if (canPass) {
                visited.add(key);
                queue.push({
                    q: nq, r: nr, 
                    // Crea un nuovo array aggiungendo il nuovo passo
                    path: [...curr.path, { q: nq, r: nr, isWall }] 
                });
            }
        }
    }
    return null; // Nessuna strada trovata
}


// ============================================================
// GESTIONE CARTE (Riutilizzata e snellita)
// ============================================================

function _aiTryBuyCards(aiFaction) {
    const pData = players[aiFaction];
    while ((pData.credits || 0) >= GAME.CREDIT_CARD_REPLACE) {
        let slotToReplace = -1;
        for (let i = 0; i < (pData.cards?.length || 3); i++) {
            if (pData.usedCards && pData.usedCards[`slot_${i}`]) {
                slotToReplace = i; break;
            }
        }
        if (slotToReplace === -1) break;

        const allCardIds = Object.keys(CARD_DEFINITIONS);
        const randomCardId = allCardIds[Math.floor(Math.random() * allCardIds.length)];

        pData.credits -= GAME.CREDIT_CARD_REPLACE;
        pData.cards[slotToReplace] = randomCardId;
        delete pData.usedCards[`slot_${slotToReplace}`];

        if (isOnline && isHost) {
            sendOnlineMessage({
                type: 'SHOP_CARD_REPLACE', faction: aiFaction,
                slotIndex: slotToReplace, newCardId: randomCardId, creditCost: GAME.CREDIT_CARD_REPLACE
            });
        }
    }
}

async function _aiEvaluateAndPlayCards(aiFaction) {
    const pData = players[aiFaction];
    if (!pData?.cards?.length) return;
    const myAgents = pData.agents.filter(a => a.hp > 0);
    if (!myAgents.length) return;

    for (let slotIndex = 0; slotIndex < pData.cards.length; slotIndex++) {
        const cardId = pData.cards[slotIndex];
        const slotKey = `slot_${slotIndex}`;
        if (pData.usedCards?.[slotKey] || !cardId) continue;
        
        // FIX: Usa continue invece di return. Così ignora le carte gestite a parte, ma guarda le altre!
        if (cardId === 'C01' || cardId === 'C02' || cardId === 'C08') continue; 

        const card = CARD_DEFINITIONS[cardId];
        let chosenAgent = null;

        // --- C06 Spettro & C07 Scudo (Buff Permanenti - Usali subito sul migliore) ---
        if (cardId === 'C06' || cardId === 'C07') {
            let bestScore = -1;
            myAgents.forEach(a => {
                if (cardId === 'C06' && a.spectreBuff) return;
                if (cardId === 'C07' && a.shielded > 0) return;
                const score = a.dmg * 50 + a.rng * 20 + a.maxHp * 10; // Valuta quanto è forte l'agente
                if (score > bestScore) { bestScore = score; chosenAgent = a; }
            });
        }
        // --- C03 Cecchino (Logica Predittiva Combinata) ---
        else if (cardId === 'C03') {
            for (const a of myAgents) {
                if (a.ap < 1) continue;
                if (a.sniperBuff) continue; // Già attivo

                let normalRng = a.rng;
                const originCell = grid.get(getKey(a.q, a.r));
                if (originCell?.terrain === 'altura') normalRng += 1;
                let doubleRng = normalRng + a.rng;

                let shouldSnipe = false;

                for (const dir of hexDirections) {
                    if (shouldSnipe) break;

                    let objectsHit = 0;
                    
                    for (let d = 1; d <= doubleRng; d++) {
                        const cell = grid.get(getKey(a.q + dir.q * d, a.r + dir.r * d));
                        if (!cell) break;
                        
                        if (cell.terrain === 'nebbia' && d > 1 && !(cell.entity && cell.entity.empFogRevealed)) break;
                        
                        const isEnemy = cell.entity && cell.entity.faction !== aiFaction && cell.entity.hp > 0;
                        const isWallOrBarricade = (cell.type === 'wall' || cell.type === 'barricade');
                        const isAlly = cell.entity && cell.entity.faction === aiFaction;

                        if (isAlly) break;

                        if (isEnemy) {
                            if (d > normalRng) { shouldSnipe = true; break; }
                            if (objectsHit >= 1) { shouldSnipe = true; break; }
                            if (isWallOrBarricade) { shouldSnipe = true; break; }

                            objectsHit++;
                            if (objectsHit > 1) break;
                        } 
                        else if (isWallOrBarricade) {
                            objectsHit++;
                            if (objectsHit > 1) break;
                        }
                    }
                }

                if (shouldSnipe) { chosenAgent = a; break; }
            }
        }
        
        // --- C04 EMP (Raggio FISSO 5) ---
        else if (cardId === 'C04') {
            myAgents.forEach(a => {
                let valuableTargets = 0;
                grid.forEach(c => {
                    const t = c.entity;
                    if (t && t.faction !== aiFaction && t.hp > 0 && hexDistance(a, c) <= 5) {
                        valuableTargets += (t.shielded > 0) ? 2 : 1; 
                    }
                });
                if (valuableTargets >= 2) chosenAgent = a;
            });
        }

        // --- C05 Esplosivo (Logica Finisher + Danno ad Area) ---
        else if (cardId === 'C05') {
            for (const a of myAgents) {
                if (chosenAgent) break;      
                if (a.ap === 0) continue;    

                const targetInfo = _aiGetBestRealShootTarget(a, aiFaction);
                
                if (targetInfo) {
                    const target = targetInfo.entity;
                    const cell = grid.get(getKey(target.q, target.r));
                    
                    let effectiveHp = target.hp;
                    if (cell?.terrain === 'copertura') effectiveHp += 1;

                    const canKillNormally = effectiveHp <= a.dmg;
                    const canKillWithExplosive = effectiveHp <= (a.dmg * 2);

                    if (!canKillNormally && canKillWithExplosive) {
                        chosenAgent = a; break; 
                    }

                    let splashScore = 0;
                    hexDirections.forEach(dir => {
                        const adj = grid.get(getKey(target.q + dir.q, target.r + dir.r));
                        if (adj?.entity && adj.entity.faction !== aiFaction && adj.entity.hp > 0) {
                            splashScore++;
                        }
                    });

                    if (splashScore > 0) { chosenAgent = a; break; }
                }
            }
        }

        // --- C09 MediBuff (Cura o Difesa - Assicura di usarlo sempre) ---
        else if (cardId === 'C09') {
            let backupAgent = myAgents[0];
            myAgents.forEach(a => {
                if (a.hp < a.maxHp || _aiIsCellThreatened(a, aiFaction)) chosenAgent = a;
                // Salva l'agente più forte come ripiego nel caso in cui nessuno sia ferito
                if (!chosenAgent && a.maxHp > backupAgent.maxHp) backupAgent = a;
            });
            if (!chosenAgent) chosenAgent = backupAgent; // Forziamo l'utilizzo!
        }

        // --- C10 Upgrade (Invariata) ---
        else if (cardId === 'C10') {
            let best = null; let bestFit = -1;
            myAgents.forEach(a => {
                const f = (a.hp / a.maxHp) * (a.dmg * 30 + a.rng * 10 + a.mov * 5);
                if (f > bestFit) { bestFit = f; best = a; }
            });
            if (best) {
                chosenAgent = best;
                chosenAgent._aiUpgradeChoice = (best.hp <= 2) ? {hp:1, mov:0, rng:0, dmg:0} : {hp:0, mov:0, rng:0, dmg:1};
            }
        }

        // --- ESECUZIONE DELLA CARTA SCELTA ---
        if (chosenAgent) {
            selectedAgent = chosenAgent;
            // Fix: assicura che l'oggetto usedCards esista prima di scrivere
            if (!pData.usedCards) pData.usedCards = {}; 
            pData.usedCards[slotKey] = true;
            
            if (cardId === 'C10') {
                finalizeAsyncCard(slotIndex, cardId, chosenAgent._aiUpgradeChoice);
                delete chosenAgent._aiUpgradeChoice;
            } else {
                card.apply(aiFaction);
                if (isOnline) sendOnlineMessage({
                    type: 'ACTION_CARD', cardId, slotIndex,
                    actingPlayer: aiFaction, targetAgentId: chosenAgent.id
                });
            }
            console.log(`[AI V24] Giocata Carta: ${card.name} su ${chosenAgent.id}`);
            
            drawGame();
            await delay(400); // Piccola pausa visiva per mostrare l'attivazione prima della prossima carta
            
            continue; // FIX: Passa alla PROSSIMA carta, non uscire dalla funzione!
        }
    } 
}

/** Usa Blitz solo se, avendo esaurito gli AP, 1 AP extra gli permetterebbe di sparare a un nemico */
async function _aiTryBlitzRealtime(aiFaction, agent) {
    const pData = players[aiFaction];
    const blitzSlot = pData?.cards?.findIndex((c, i) => c === 'C01' && !pData.usedCards?.[`slot_${i}`]);
    
    // Se non abbiamo la carta o l'agente ha già AP, non fare nulla
    if (blitzSlot === -1 || blitzSlot === undefined || agent.ap > 0) return false;

    // L'IA usa Blitz SOLO se ha un bersaglio a cui sparare immediatamente
    const shootTarget = _aiGetBestRealShootTarget(agent, aiFaction);
    
    if (shootTarget) {
        console.log(`[AI V24] BLITZ! +1 AP a ${agent.id} per colpire ${shootTarget.entity.id}`);
        
        selectedAgent = agent; // Importante: seleziona l'agente prima di applicare la carta
        pData.usedCards[`slot_${blitzSlot}`] = true;

        // 1. Applica l'effetto (aggiunge AP all'agente selezionato)
        CARD_DEFINITIONS['C01'].apply(aiFaction);

        // 2. Feedback Visivo
        playSpecialVFX(agent, CARD_DEFINITIONS['C01'].color, '⚡ BLITZ!');
        
        // 3. Sincronizzazione Online
        if (isOnline) {
            sendOnlineMessage({
                type: 'ACTION_CARD', 
                cardId: 'C01', 
                slotIndex: blitzSlot,
                actingPlayer: aiFaction, 
                targetAgentId: agent.id
            });
        }

        drawGame();
        await delay(GAME.AI_STEP_DELAY_MS); 
        return true; // La carta è stata usata, il ciclo while principale continuerà
    }

    return false;
}

/** Usa Fortino per proteggere gli agenti a fine turno */
function _aiTryFortinoRealtime(aiFaction) {
    const pData = players[aiFaction];
    const fortinoSlot = pData?.cards?.findIndex((c, i) => c === 'C08' && !pData.usedCards?.[`slot_${i}`]);
    if (fortinoSlot === undefined || fortinoSlot === -1) return;

    // 1. Identifica il nemico più pericoloso/vicino
    let targetEnemy = null;
    let minDist = Infinity;

    // Cerchiamo tra tutti gli agenti nemici vivi
    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === aiFaction) continue;
        players[p].agents.forEach(e => {
            if (e.hp > 0) {
                // Calcola distanza media dai miei agenti
                let avgDist = 0;
                const myAgents = pData.agents.filter(a => a.hp > 0);
                if (myAgents.length === 0) return;
                
                myAgents.forEach(a => avgDist += hexDistance(a, e));
                avgDist /= myAgents.length;

                if (avgDist < minDist) {
                    minDist = avgDist;
                    targetEnemy = e;
                }
            }
        });
    }

    if (!targetEnemy) return;

    // 2. Trova spazi vuoti attorno al nemico per "ingabbiarlo"
    const builds = [];
    for (const dir of hexDirections) {
        const nq = targetEnemy.q + dir.q;
        const nr = targetEnemy.r + dir.r;
        const cell = grid.get(getKey(nq, nr));
        
        // Piazza solo su celle vuote, senza entità e che non siano acqua/muri
        if (cell && cell.type === 'empty' && !cell.entity) {
            builds.push({ q: nq, r: nr });
            if (builds.length >= 4) break; // Limite massimo della carta Fortino
        }
    }

    // 3. Esegui il piazzamento
    if (builds.length > 0) {
        console.log(`[AI V24] Uso Fortino per bloccare nemico ${targetEnemy.id} a dist ${minDist.toFixed(1)}`);
        
        pData.usedCards[`slot_${fortinoSlot}`] = true;
        // Seleziona un agente a caso per "firmare" l'azione
        const actingAgent = pData.agents.find(a => a.hp > 0) || {id: 0, q:0, r:0};
        
        playSpecialVFX(targetEnemy, CARD_DEFINITIONS.C08.color, '⛓️ TRAPPOLA DIFENSIVA!');

        builds.forEach(pos => {
            const cell = grid.get(getKey(pos.q, pos.r));
            cell.type = 'barricade';
            cell.hp = cell.maxHp = GAME.BARRICADE_HP;
            cell.sprite = getRandomSprite(SPRITE_POOLS.barricades);
            cell.customSpriteId = (typeof THEME_BARRICADE_ID !== 'undefined') ? THEME_BARRICADE_ID : 'barricade';
            
            // Sincronizzazione Online
            if (isOnline) {
                sendOnlineMessage({
                    type: 'ACTION_CARD', 
                    cardId: 'C08', 
                    slotIndex: fortinoSlot,
                    actingPlayer: aiFaction, 
                    targetAgentId: actingAgent.id, 
                    buildQ: pos.q, 
                    buildR: pos.r
                });
            }
        });
        
        drawGame();
    }
}

// ============================================================
// LOGICA DI SOPRAVVIVENZA E RIPARO (Ultimo AP)
// ============================================================

/**
 * Helper: Controlla se una determinata cella è attualmente
 * sotto tiro da parte di un qualsiasi nemico.
 */
function _aiIsCellThreatened(cellPos, faction) {
    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === faction) continue;
        for (const e of players[p].agents) {
            if (e.hp > 0) {
                let eRng = e.rng;
                const eCell = grid.get(getKey(e.q, e.r));
                if (eCell?.terrain === 'altura') eRng += 1;
                
                // Se la distanza tra il nemico e la cella è <= Movimento + Sparo del nemico
                if (hexDistance(cellPos, e) <= (e.mov + eRng)) {
                    return true;
                }
            }
        }
    }
    return false;
}

/**
 * Trova la cella più sicura raggiungibile con 1 azione di movimento.
 * Cerca Nebbia, Coperture o (se Spettro) i Muri più resistenti.
 */
function _aiFindSafeMove(agent, faction, visitedThisTurn) {
    const originCell = grid.get(getKey(agent.q, agent.r));
    const actualMov = (originCell && originCell.terrain === 'fango') ? 1 : agent.mov;
    const isGhost = !!(agent.spectreBuff || agent.infiltrateBuff);

    const reachable = [];
    const queue = [{q: agent.q, r: agent.r, dist: 0}];
    const visited = new Set([getKey(agent.q, agent.r)]);
    
    // Includiamo la cella in cui siamo ORA (potrebbe essere il posto più sicuro)
    reachable.push({q: agent.q, r: agent.r});

    while(queue.length > 0) {
        const curr = queue.shift();
        if (curr.dist > 0) reachable.push({q: curr.q, r: curr.r});
        
        if (curr.dist < actualMov) {
            for (const dir of hexDirections) {
                const nq = curr.q + dir.q;
                const nr = curr.r + dir.r;
                const key = getKey(nq, nr);
                if (visited.has(key)) continue;
                
                const cell = grid.get(key);
                if (!cell) continue;

                let canPass = false;
                if (isGhost) {
                    if (!cell.entity) canPass = true; // Gli Spettri valutano i muri
                } else {
                    if (cell.type === 'empty' && !cell.entity) canPass = true;
                }

                if (canPass) {
                    visited.add(key);
                    queue.push({q: nq, r: nr, dist: curr.dist + 1});
                }
            }
        }
    }

    let bestCell = null;
    let bestScore = -Infinity;

    for (const cellPos of reachable) {
        if (visitedThisTurn.has(getKey(cellPos.q, cellPos.r)) && (cellPos.q !== agent.q || cellPos.r !== agent.r)) continue;

        const cellObj = grid.get(getKey(cellPos.q, cellPos.r));
        let score = 0;
        const isThreatened = _aiIsCellThreatened(cellPos, faction);

        if (isThreatened) {
            score -= 5000; // Penalità severa se sotto tiro
        } else {
            score += 5000; // Premio base se la cella è sicura
        }

        // --- GESTIONE SPETTRO ---
        if (isGhost && cellObj && (cellObj.type === 'wall' || cellObj.type === 'barricade')) {
            score += 2000; // Forte spinta a usare i muri come nascondiglio
            score += (cellObj.hp || 0) * 10; // Muri più resistenti valgono di più!
        }

        // --- GESTIONE TERRENI ---
        if (cellObj?.terrain === 'nebbia') score += 1000;
        if (cellObj?.terrain === 'copertura') score += 1000;
        
        // Evita il fango
        if (cellObj?.terrain === 'fango') score -= 800;

        if (score > bestScore) {
            bestScore = score;
            bestCell = cellPos;
        }
    }

    // Se l'opzione migliore trovata era stare fermi, restituisce null per fermare il loop dell'agente
    if (bestCell && bestCell.q === agent.q && bestCell.r === agent.r) {
        return null;
    }

    return bestCell;
}

// ============================================================
// FUNZIONI HELPER MANCANTI (Supporto Combo e Carte)
// ============================================================

/**
 * Conta quanti nemici ci sono entro un certo raggio da una cella.
 * Usata per valutare la sicurezza dell'atterraggio Airdrop.
 */
function _aiCountEnemiesNear(cellPos, faction, radius) {
    let count = 0;
    grid.forEach(cell => {
        if (cell.entity && cell.entity.faction !== faction && cell.entity.hp > 0) {
            if (hexDistance(cellPos, cell) <= radius) {
                count++;
            }
        }
    });
    return count;
}

/**
 * Verifica se un agente ha nemici nel suo raggio di tiro attuale.
 */
function _aiHasEnemiesInRange(agent, faction) {
    if (!agent) return false;
    let rng = agent.rng;
    const cell = grid.get(getKey(agent.q, agent.r));
    if (cell?.terrain === 'altura') rng += 1;

    for (const dir of hexDirections) {
        for (let d = 1; d <= rng; d++) {
            const c = grid.get(getKey(agent.q + dir.q * d, agent.r + dir.r * d));
            if (!c) break;
            if (c.entity) {
                if (c.entity.faction !== faction && c.entity.hp > 0) return true;
                break; 
            }
            if (c.type === 'wall' || c.type === 'barricade') break;
        }
    }
    return false;
}


markScriptAsLoaded('ai.js');