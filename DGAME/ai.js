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

    if (state !== 'PLAYING' || (!isHostAITurn() && !isCurrentPlayerAI())) return;

    const aiFaction = currentPlayer;
    const myAgents  = players[aiFaction].agents.filter(a => a.hp > 0);
    if (myAgents.length === 0) { endTurn(); return; }

    console.log(`[AI V17] Fazione ${players[aiFaction].name}: Protocollo Cacciatore attivo`);

    // ── NUOVO: Usa le carte prima di pianificare ──────────────
    _aiEvaluateAndPlayCards(aiFaction);
    drawGame();
    await delay(GAME.AI_STEP_DELAY_MS);
    // ─────────────────────────────────────────────────────────


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
            // L'AI non usa mai la cura — AP sprecati. Saltiamo sempre.
            continue;

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

// ============================================================
// CARTE AI — valutazione e attivazione
// ============================================================

// ============================================================
// CARTE AI — Valutazione Dinamica ed Euristica
// ============================================================

function _aiEvaluateAndPlayCards(aiFaction) {
    const pData = players[aiFaction];
    if (!pData?.cards?.length) return;

    const myAgents = pData.agents.filter(a => a.hp > 0);
    if (!myAgents.length) return;

    pData.cards.forEach((cardId, slotIndex) => {
        const slotKey = `slot_${slotIndex}`;
        if (pData.usedCards?.[slotKey]) return; // già usata
        if (!cardId) return;

        const card = CARD_DEFINITIONS[cardId];
        if (!card) return;

        let chosenAgent = null;
        let shouldPlay  = false;

        // Analizza tutti gli agenti per trovare il candidato perfetto per QUESTA carta
        switch (cardId) {

            case 'C01': // Blitz (+1 AP)
                // Logica: dare l'AP extra a chi può usarla per sparare o per sbloccare
                // la combo muovi→spara. L'AI non cura, quindi il caso B originale
                // (cure/barricate) viene rimappato su utilità offensiva reale.
                let bestBlitzScore = 0;

                myAgents.forEach(a => {
                    let score = 0;

                    // CASO A: agente a 0 AP — sblocca un'azione completa
                    if (a.ap === 0) {
                        if (_aiHasEnemiesInRange(a, aiFaction)) {
                            score += 600; // può sparare subito
                            if (_aiCanKillSomeone(a, aiFaction)) score += 400; // kill garantito
                        } else {
                            score += 150; // almeno si riposiziona
                        }
                    }

                    // CASO B: agente a 1 AP — con +1 può muoversi E sparare nello stesso turno
                    if (a.ap === 1) {
                        const enemiesNearby = _aiCountEnemiesNear(a, aiFaction, a.rng + a.mov);
                        if (enemiesNearby > 0) {
                            score += 500; // combo muovi+spara sbloccata
                            if (_aiCanKillSomeone(a, aiFaction)) score += 300;
                        } else {
                            score += 100;
                        }
                    }

                    // CASO C: agente a 2 AP — il +1 aggiunge una seconda azione offensiva
                    if (a.ap === 2) {
                        score += 200 + (_aiHasEnemiesInRange(a, aiFaction) ? 150 : 0);
                    }

                    // Preferisci sempre l'agente più letale
                    score += a.dmg * 25;

                    if (score > bestBlitzScore) {
                        bestBlitzScore = score;
                        chosenAgent = a;
                    }
                });

                // Soglia bassa: quasi sempre conviene usarla se c'è un nemico nei paraggi
                if (bestBlitzScore >= 150) shouldPlay = true;
                break;

            case 'C02': // Fortino (4 barricate gratis)
                // Valore difensivo: piazza barricate tra i propri agenti e i nemici.
                // L'AI le usa se ha agenti in posizione esposta o se è in svantaggio numerico.
                {
                    const myLiveAgents  = myAgents.length;
                    let totalEnemyCount = 0;
                    for (let p = 1; p <= totalPlayers; p++) {
                        if (!players[p] || p === aiFaction) continue;
                        totalEnemyCount += players[p].agents.filter(a => a.hp > 0).length;
                    }

                    // Conta agenti propri con nemici adiacenti (in pericolo immediato)
                    let exposedCount = 0;
                    myAgents.forEach(a => {
                        if (_aiCountEnemiesNear(a, aiFaction, 2) > 0) exposedCount++;
                    });

                    // Usa il Fortino se siamo in svantaggio numerico O abbiamo agenti esposti
                    const inDisadvantage = totalEnemyCount > myLiveAgents;
                    if (inDisadvantage || exposedCount >= 2) {
                        // Scegli l'agente più in pericolo come fulcro delle barricate
                        let mostExposed = null;
                        let maxExposure = -1;
                        myAgents.forEach(a => {
                            const exposure = _aiCountEnemiesNear(a, aiFaction, 3);
                            if (exposure > maxExposure) { maxExposure = exposure; mostExposed = a; }
                        });
                        chosenAgent = mostExposed || myAgents[0];
                        shouldPlay  = true;
                    }
                }
                break;

            case 'C03': // Cecchino (Raddoppia raggio e perfora)
                let bestSniperScore = 0;
                
                myAgents.forEach(a => {
                    // Un cecchino deve avere almeno 1 AP per sparare dopo il buff
                    if (a.ap < 1) return;

                    // Simuliamo la gittata raddoppiata
                    const simulatedRange = a.rng * 2;
                    let agentScore = 0;

                    // Controlliamo tutte e 6 le direzioni di tiro
                    hexDirections.forEach(dir => {
                        let targetsInLine = 0;
                        let potentialDamage = 0;

                        for (let d = 1; d <= simulatedRange; d++) {
                            const targetCell = grid.get(getKey(a.q + dir.q * d, a.r + dir.r * d));
                            if (!targetCell) break;

                            if (targetCell.entity) {
                                if (targetCell.entity.faction !== aiFaction) {
                                    targetsInLine++;
                                    // Punteggio: 100 per un agente, 300 per HQ, 500 se è un Kill garantito
                                    let val = (targetCell.entity.type === 'hq' ? 300 : 100);
                                    if (targetCell.entity.hp <= a.dmg) val += 200;
                                    potentialDamage += val;
                                } else {
                                    // Alleato nel mezzo? Linea di tiro bloccata
                                    break;
                                }
                            } else if (targetCell.type === 'wall' || targetCell.type === 'barricade') {
                                // Il cecchino perfora un ostacolo, ma il secondo ostacolo ferma il proiettile
                                targetsInLine++;
                                potentialDamage += 20; // Valore basso per i muri
                            }

                            // Il cecchino perfora solo UN bersaglio extra (colpisce max 2 entità/muri)
                            if (targetsInLine >= 2) break;
                        }

                        // Se in questa direzione colpiamo almeno un nemico e siamo oltre la gittata base, 
                        // o se colpiamo due bersagli (perforazione), è un ottimo tiro.
                        if (targetsInLine > 0) {
                            agentScore = Math.max(agentScore, potentialDamage);
                        }
                    });

                    if (agentScore > bestSniperScore) {
                        bestSniperScore = agentScore;
                        chosenAgent = a;
                    }
                });

                // Se il punteggio è alto (abbiamo trovato un bersaglio valido o un allineamento)
                if (bestSniperScore >= 100) shouldPlay = true;
                break;


            case 'C05': // Esplosivo (Danno raddoppiato + Splash)
                let bestExplosiveScore = 0;

                myAgents.forEach(a => {
                    if (a.ap < 1) return; // Deve poter sparare ora

                    // Identifichiamo il danno potenziale
                    const bonusDmg = a.originalDmg || a.dmg;
                    const totalDmg = a.dmg + bonusDmg;
                    const splashDmg = Math.ceil(totalDmg / 2);

                    // Scansioniamo tutti i bersagli possibili nel raggio attuale
                    grid.forEach(cell => {
                        // Consideriamo solo entità nemiche come bersagli primari
                        if (!cell.entity || cell.entity.faction === aiFaction) return;
                        if (hexDistance(a, cell) > a.rng) return;

                        let scenarioScore = 0;
                        const target = cell.entity;

                        // 1. VALUTAZIONE BERSAGLIO PRIMARIO (Aggressiva)
                        if (target.hp <= totalDmg) {
                            // È un KILL garantito!
                            scenarioScore += (target.type === 'hq' ? 1000 : 600);
                            
                            // BONUS CHIAVE: Se il danno base (a.dmg) NON sarebbe bastato a ucciderlo, 
                            // questa carta è fondamentale. Usiamola assolutamente!
                            if (target.hp > a.dmg) {
                                scenarioScore += 400; 
                            }
                        } else {
                            // Non muore, ma gli facciamo molto male
                            scenarioScore += (totalDmg * 20);
                        }

                        // 2. VALUTAZIONE SPLASH (Danni ad area)
                        hexDirections.forEach(dir => {
                            const adjCell = grid.get(getKey(cell.q + dir.q, cell.r + dir.r));
                            if (adjCell) {
                                if (adjCell.entity && adjCell.entity.faction !== aiFaction) {
                                    // Colpiamo un altro nemico!
                                    scenarioScore += (adjCell.entity.hp <= splashDmg ? 300 : 150);
                                } else if (adjCell.type === 'wall' || adjCell.type === 'barricade') {
                                    // Rompiamo coperture nemiche
                                    scenarioScore += 50;
                                }
                            }
                        });

                        if (scenarioScore > bestExplosiveScore) {
                            bestExplosiveScore = scenarioScore;
                            chosenAgent = a;
                        }
                    });
                });

                // Se lo scenario migliore ha un punteggio alto (abbiamo un kill o un botto multiplo)
                if (bestExplosiveScore >= 500) shouldPlay = true;
                break;

            case 'C07': // Scudo (Protezione permanente)
                // Logica aggressiva: lo scudo va sull'agente più letale che sia anche
                // sotto tiro nemico. Non sprechiamo lo scudo su chi non rischia nulla.
                {
                    let bestShieldScore = -1;

                    myAgents.forEach(a => {
                        // Base: quanto fa male questo agente (è lui che vogliamo tenere in vita)
                        let score = a.dmg * 80 + a.rng * 15;

                        // Bonus esposizione: quanti nemici lo possono raggiungere?
                        const enemiesInThreat = _aiCountEnemiesNear(a, aiFaction, 6);
                        score += enemiesInThreat * 120;

                        // Bonus se è ferito (scudo che previene il prossimo colpo fatale)
                        const missingHp = a.maxHp - a.hp;
                        if (missingHp > 0 && a.hp <= a.dmg) score += 200; // quasi morto ma prezioso

                        // Malus forte se ha già uno scudo (diversifica la protezione)
                        if (a.shielded > 0) score -= 300;

                        if (score > bestShieldScore) {
                            bestShieldScore = score;
                            chosenAgent = a;
                        }
                    });

                    // Usa sempre se c'è almeno un nemico che minaccia qualcuno
                    if (chosenAgent && bestShieldScore > 0) shouldPlay = true;
                }
                break;

            case 'C09': // EMP (Paralisi d'area - Raggio 5)
                let bestEMPScore = 0;

                myAgents.forEach(a => {
                    let currentScore = 0;

                    // Scansioniamo tutta la mappa per vedere chi cade nel raggio di questo agente
                    grid.forEach(cell => {
                        const target = cell.entity;
                        // Colpiamo solo agenti nemici (gli HQ non usano AP né scudi)
                        if (target && target.type === 'agent' && target.faction !== aiFaction) {
                            const dist = hexDistance(a, cell);
                            
                            if (dist <= 5) {
                                // 1. VALORE BASE: -1 AP è sempre utile
                                currentScore += 200;

                                // 2. VALORE ANTI-DIFESA: Togliere lo scudo è una priorità assoluta
                                if (target.shielded > 0) {
                                    currentScore += 400; 
                                }

                                // 3. VALORE TATTICO: Se il nemico è vicino ai miei, 
                                // togliergli AP gli impedirà di scappare o di curarsi dopo il mio attacco
                                if (_aiIsTargetNearAnyOfMyAgents(cell, aiFaction)) {
                                    currentScore += 150;
                                }
                            }
                        }
                    });

                    if (currentScore > bestEMPScore) {
                        bestEMPScore = currentScore;
                        chosenAgent = a;
                    }
                });

                // Soglia di attivazione: 
                // 400 = Almeno 2 nemici semplici o 1 nemico scudato importante
                if (bestEMPScore >= 400) shouldPlay = true;
                break;

            case 'C04': // Medikit (buffer HP automatico)
                // L'AI non cura attivamente, ma il Medikit è un buffer passivo prezioso.
                // Logica: darlo all'agente con più danno che non lo ha già,
                // ignorando completamente la logica "cura subito i feriti" (non è un'azione di cura).
                {
                    let bestMedikitScore = -1;

                    myAgents.forEach(a => {
                        if (a.medikitBuff) return; // già equipaggiato, spreco totale

                        // Valore: agente letale che vale la pena proteggere
                        let score = a.dmg * 60 + a.rng * 10;

                        // Bonus se è l'agente più pericoloso che sia anche sotto tiro
                        score += _aiCountEnemiesNear(a, aiFaction, a.rng) * 40;

                        // Malus se quasi morto: rischia di morire prima che il buff sia utile
                        if (a.hp <= 1) score -= 200;

                        if (score > bestMedikitScore) {
                            bestMedikitScore = score;
                            chosenAgent = a;
                        }
                    });

                    // Usa sempre se c'è un candidato valido (il Medikit non costa AP)
                    if (chosenAgent && bestMedikitScore > 0) shouldPlay = true;
                }
                break;

            case 'C10': // Upgrade (Punto Stat permanente)
                let bestCandidate = null;
                let highestFitness = -1;

                myAgents.forEach(a => {
                    // EVITA SPRECHI: Non diamo l'upgrade a chi ha solo 1 HP (rischio morte immediata)
                    if (a.hp <= 1) return;

                    // Calcoliamo la "idoneità" dell'agente
                    // Uniamo vita attuale (sopravvivenza) e danno (potenziale carry)
                    let fitness = (a.hp * 20) + (a.dmg * 10);
                    
                    // Bonus se ha uno scudo
                    if (a.shielded) fitness += 100;

                    if (fitness > highestFitness) {
                        highestFitness = fitness;
                        bestCandidate = a;
                    }
                });

                if (bestCandidate) {
                    chosenAgent = bestCandidate;
                    shouldPlay = true;

                    // DECISIONE DELLA STATISTICA (Logica Dinamica)
                    let upgradeTarget = { hp: 0, mov: 0, rng: 0, dmg: 0 };
                    
                    if (chosenAgent.dmg <= 2) {
                        // Priorità 1: Se fa poco danno, portiamolo a un livello decente
                        upgradeTarget.dmg = 1;
                    } else if (chosenAgent.rng <= 4) {
                        // Priorità 2: Se fa danno ma è "miope", aumentiamo il tiro
                        upgradeTarget.rng = 1;
                    } else if (chosenAgent.maxHp <= 3) {
                        // Priorità 3: Se è troppo fragile, aumentiamo la vita massima
                        upgradeTarget.hp = 1;
                    } else {
                        // Fallback: Aumentiamo il danno ulteriormente o il movimento
                        if (Math.random() > 0.5) upgradeTarget.dmg = 1;
                        else upgradeTarget.mov = 1;
                    }

                    // Memorizziamo la scelta per l'attivazione asincrona
                    chosenAgent._aiUpgradeChoice = upgradeTarget;
                }
                break;

            case 'C06': // Spettro (Attraversa muri / Infiltrazione)
                let bestSpettroScore = 0;

                myAgents.forEach(a => {
                    // Se l'agente è già uno "spettro" o non ha punti per muoversi, salta
                    if (a.infiltrateBuff || a.ap < 1) return;

                    let agentScore = 0;
                    const huntingTarget = getHuntingTarget({ q: a.q, r: a.r, ref: a }, aiFaction);
                    
                    if (huntingTarget) {
                        const distReal = hexDistance(a, huntingTarget);
                        const hasLOS = _aiHasLineOfSight(a, huntingTarget);

                        // SCENARIO 1: L'IMBOSCATA (Visuale bloccata)
                        // Se il nemico è vicino (distanza 2 o 3) ma c'è un muro nel mezzo
                        if (distReal <= 3 && !hasLOS) {
                            agentScore += 600; // Priorità alta: spuntiamo dal muro e spariamo
                        }

                        // SCENARIO 2: LA PRIGIONE (Agente intrappolato)
                        // Se l'agente è circondato da ostacoli e non può muoversi verso il target
                        if (_aiIsBlockedByObstacles(a)) {
                            agentScore += 500;
                        }

                        // SCENARIO 3: ACCORCIATOIA
                        // Se il movimento spettro sblocca una posizione di tiro che il movimento normale non raggiunge
                        const normalMoves = _aiGetReachableCount(a, false);
                        const ghostMoves  = _aiGetReachableCount(a, true);
                        if (ghostMoves > normalMoves) {
                            agentScore += (ghostMoves - normalMoves) * 30;
                        }
                    }

                    if (agentScore > bestSpettroScore) {
                        bestSpettroScore = agentScore;
                        chosenAgent = a;
                    }
                });

                // Se l'azione ha un valore tattico (imboscata o sblocco movimento)
                if (bestSpettroScore >= 300) shouldPlay = true;
                break;

            

            case 'C08': // Airdrop (Teletrasporto Globale - Costo 3 AP)
                let bestAirdropAction = null;
                let maxAirdropScore = 0;

                myAgents.forEach(a => {
                    // L'agente DEVE avere 3 AP per usare questa carta
                    if (a.ap < 3) return;

                    // Cerchiamo il punto di atterraggio migliore sulla mappa
                    const dropSpot = _aiFindGlobalBestDrop(aiFaction, a);
                    
                    if (dropSpot) {
                        let score = dropSpot.score;

                        // Bonus: se l'agente ha 4 AP (grazie a Blitz), lo score schizza 
                        // perché può teletrasportarsi E sparare nello stesso turno!
                        if (a.ap > 3) score += 500;

                        // Malus: se l'agente è ferito, è rischioso mandarlo dietro le linee
                        if (a.hp <= 2) score -= 300;

                        if (score > maxAirdropScore) {
                            maxAirdropScore = score;
                            bestAirdropAction = { agent: a, cell: dropSpot.cell };
                        }
                    }
                });

                if (bestAirdropAction && maxAirdropScore >= 400) {
                    chosenAgent = bestAirdropAction.agent;
                    chosenAgent._aiDropTarget = bestAirdropAction.cell;
                    shouldPlay = true;
                }
                break;
        }

        if (!shouldPlay || !chosenAgent) return;
        
        // Verifica costo AP (eccetto C08 che lo gestisce internamente)
        if (card.apCost > 0 && chosenAgent.ap < card.apCost && cardId !== 'C08') return;

        // Attiva la carta
        selectedAgent = chosenAgent;
        if (!pData.usedCards) pData.usedCards = {};
        pData.usedCards[slotKey] = true;
        
        // Gestione speciale per Upgrade Asincrono (C10)
        if (cardId === 'C10') {
            // L'AI invia direttamente la sua scelta pre-calcolata
            finalizeAsyncCard(slotIndex, cardId, chosenAgent._aiUpgradeChoice);
            delete chosenAgent._aiUpgradeChoice; // Pulizia
        } else {
            card.apply(aiFaction);

            // AGGIUNTA CHIRURGICA PER AIRDROP
            if (cardId === 'C08' && chosenAgent._aiDropTarget) {
                const target = chosenAgent._aiDropTarget;
                setTimeout(() => {
                    executeAction(grid.get(getKey(target.q, target.r)));
                    delete chosenAgent._aiDropTarget;
                    drawGame();
                }, 600);
            }

        }

        console.log(`[AI V17] Ha usato la carta: ${card.name} sull'agente Op.${myAgents.indexOf(chosenAgent)+1}`);
    });
}

// --- HELPER AGGIUNTIVI PER L'AI ---


// Verifica se una cella è vicina a uno qualunque degli agenti della mia fazione
function _aiIsTargetNearAnyOfMyAgents(targetCell, myFaction) {
    let near = false;
    players[myFaction].agents.forEach(a => {
        if (a.hp > 0 && hexDistance(a, targetCell) <= 3) near = true;
    });
    return near;
}

function _aiFindGlobalBestDrop(faction, agent) {
    let bestCell = null;
    let bestScore = -1000;

    grid.forEach(cell => {
        if (cell.type !== 'empty' || cell.entity) return;

        let score = 0;
        const distFromCurrent = hexDistance(agent, cell);

        // 1. PRIORITÀ ASSOLUTA: agenti nemici nel raggio di tiro dalla posizione di atterraggio.
        // L'Airdrop serve a posizionarsi per colpire, non ad avvicinarsi all'HQ.
        let enemiesInRange  = 0;
        let killableFromHere = false;
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

        // 2. SICUREZZA: non atterrare circondati da nemici senza AP residui per sparare
        const enemiesAdjacent = _aiCountEnemiesNear(cell, faction, 1);
        if (enemiesAdjacent > 0 && agent.ap <= 3) score -= 500;

        // 3. DISTANZA: preferisci posizioni lontane dalla corrente (massimizza il valore del salto)
        if (distFromCurrent >= 5) score += distFromCurrent * 8;

        // 4. HQ nemico: solo come obiettivo secondario quando non ci sono agenti da colpire
        if (enemiesInRange === 0) {
            const distToEnemyHQ = _aiDistToNearestEnemyHQ(cell, faction);
            if (distToEnemyHQ <= 2) score += 300;
        }

        if (score > bestScore) {
            bestScore = score;
            bestCell  = cell;
        }
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

// Controlla se c'è visuale libera tra due punti (ignora gli agenti, guarda solo i muri)
function _aiHasLineOfSight(start, end) {
    const dq = end.q - start.q;
    const dr = end.r - start.r;
    const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
    
    for (let i = 1; i < dist; i++) {
        const q = Math.round(start.q + dq * (i / dist));
        const r = Math.round(start.r + dr * (i / dist));
        const cell = grid.get(getKey(q, r));
        if (cell && (cell.type === 'wall' || cell.type === 'barricade')) return false;
    }
    return true;
}

// Conta quante celle può raggiungere l'agente (standard vs spettro)
function _aiGetReachableCount(agent, isGhost) {
    let count = 0;
    const visited = new Set();
    const queue = [{ q: agent.q, r: agent.r, d: 0 }];
    
    while (queue.length > 0) {
        const curr = queue.shift();
        const key = getKey(curr.q, curr.r);
        if (visited.has(key)) continue;
        visited.add(key);
        if (curr.d > 0) count++;
        
        if (curr.d < agent.mov) {
            hexDirections.forEach(dir => {
                const nq = curr.q + dir.q, nr = curr.r + dir.r;
                const cell = grid.get(getKey(nq, nr));
                if (cell && !cell.entity) {
                    // Se non è fantasma, i muri bloccano la strada
                    if (!isGhost && (cell.type === 'wall' || cell.type === 'barricade')) return;
                    queue.push({ q: nq, r: nr, d: curr.d + 1 });
                }
            });
        }
    }
    return count;
}

// Controlla se l'agente può uccidere qualcuno nel suo raggio con un colpo solo
function _aiCanKillSomeone(agent, faction) {
    let canKill = false;
    grid.forEach(cell => {
        if (cell.entity && cell.entity.faction !== faction && hexDistance(agent, cell) <= agent.rng) {
            if (cell.entity.hp <= agent.dmg) canKill = true;
        }
    });
    return canKill;
}

// Conta quanti alleati feriti ci sono nel raggio indicato
function _aiCountWoundedAlliesNear(agent, faction, radius) {
    let count = 0;
    grid.forEach(cell => {
        if (cell.entity && cell.entity.faction === faction && cell.entity !== agent) {
            if (hexDistance(agent, cell) <= radius && cell.entity.hp < cell.entity.maxHp) {
                count++;
            }
        }
    });
    return count;
}

// Conta quanti nemici ci sono entro un raggio "radius" scavalcando i muri (raggio aereo)
function _aiCountEnemiesNear(agent, faction, radius) {
    let count = 0;
    grid.forEach(cell => {
        if (cell.entity && cell.entity.faction !== faction && hexDistance(agent, cell) <= radius) {
            count++;
        }
    });
    return count;
}

// Valuta la bontà di un attacco esplosivo (Splash) calcolando i nemici vicini tra loro
function _aiEvaluateSplashPotential(agent, faction) {
    let bestScore = 0;
    // Controlla bersagli nel raggio normale (incluso movimento futuro stimato)
    grid.forEach(cell => {
        if (cell.entity && cell.entity.faction !== faction && hexDistance(agent, cell) <= agent.rng + agent.mov) {
            let splashCount = 1; // Il bersaglio stesso
            hexDirections.forEach(dir => {
                const adjCell = grid.get(getKey(cell.q + dir.q, cell.r + dir.r));
                if (adjCell && adjCell.entity && adjCell.entity.faction !== faction) splashCount++;
            });
            if (splashCount > bestScore) bestScore = splashCount;
        }
    });
    return bestScore;
}

// Verifica se l'agente è circondato da ostacoli
function _aiIsBlockedByObstacles(agent) {
    let blockedCount = 0;
    hexDirections.forEach(dir => {
        const cell = grid.get(getKey(agent.q + dir.q, agent.r + dir.r));
        if (cell && (cell.type === 'wall' || cell.type === 'barricade')) blockedCount++;
    });
    return blockedCount >= 3; // Se ha 3 muri intorno, è tatticamente bloccato
}

// Trova la casella migliore dove fare Airdrop (vicino all'HQ nemico o a gruppi di nemici)
function _aiFindBestAirdropSpot(faction) {
    let bestSpot = null;
    let bestScore = 0;

    grid.forEach(cell => {
        if (cell.type === 'empty' && !cell.entity) {
            let score = 0;
            // Controlla cosa c'è adiacente
            hexDirections.forEach(dir => {
                const adj = grid.get(getKey(cell.q + dir.q, cell.r + dir.r));
                if (adj && adj.entity && adj.entity.faction !== faction) {
                    if (adj.entity.type === 'hq') score += 100; // Preferenza assoluta per l'HQ nemico
                    else score += 20; // Altrimenti preferisce agenti
                }
            });
            if (score > bestScore) {
                bestScore = score;
                bestSpot = cell;
            }
        }
    });
    return bestSpot;
}

// Helper: l'agente ha nemici sparabili nella posizione corrente?
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
                if (c.entity.faction !== faction) return true;
                break;
            }
            if (c.type === 'wall' || c.type === 'barricade') break;
        }
    }
    return false;
}

// Helper: conta nemici adiacenti al target dell'attaccante (per Esplosivo)
function _aiEnemiesNearTarget(agent, faction) {
    if (!agent) return 0;
    const target = getHuntingTarget({ q: agent.q, r: agent.r, ref: agent }, faction);
    if (!target) return 0;
    let count = 0;
    hexDirections.forEach(dir => {
        const c = grid.get(getKey(target.q + dir.q, target.r + dir.r));
        if (c?.entity && c.entity.faction !== faction) count++;
    });
    return count + 1; // +1 per il target stesso
}

// Helper: conta nemici in range EMP (entro 5 celle)
function _aiEnemiesInEMPRange(agent, faction) {
    if (!agent) return 0;
    let count = 0;
    grid.forEach(cell => {
        if (cell.entity?.type === 'agent'
            && cell.entity.faction !== faction
            && hexDistance(agent, cell.entity) <= 5) {
            count++;
        }
    });
    return count;
}

//===============================
// fine carte
//===============================

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
/**
 * Sceglie la migliore azione per un agente virtuale (AI V17).
 *
 * NOVITÀ rispetto a V16:
 *  - CP target: se getHuntingTarget restituisce un CP, naviga verso di esso.
 *  - Lookahead move+shoot: valuta i bersagli raggiungibili dalla cella
 *    di destinazione prima di decidere se muoversi o sparare subito.
 *  - Score setup-kill: colpire un nemico portandolo a ≤ dmgMedio
 *    vale molto di più di un colpo generico (il prossimo agente finirà).
 *  - virtualHP già aggiornato: focus fire implicito senza strutture extra.
 *  - Cura rimossa completamente: nessun AP sprecato.
 */
function _planBestAction(va, faction, virtualOccupied, virtualHP) {
    const candidates = [];

    const navTarget = getHuntingTarget(va, faction);
    if (!navTarget) return null;

    // ── Caso speciale: navTarget è un CP (fallback residuale) ─
    if (navTarget.type === 'cp') {
        const moves = getVirtualMoves(va, virtualOccupied);
        let bestCPMove = null;
        let bestCPDist = hexDistance({ q: va.q, r: va.r }, navTarget);
        for (const m of moves) {
            if (va.visited.has(getKey(m.q, m.r))) continue;
            const d = hexDistance(m, navTarget);
            if (d < bestCPDist) { bestCPDist = d; bestCPMove = m; }
        }
        if (bestCPMove) return { type: 'move', q: bestCPMove.q, r: bestCPMove.r, cost: 1 };
        return null;
    }

    // ── Danno medio fazione (per soglia setup-kill) ───────────
    const liveFaction = players[faction].agents.filter(a => a.hp > 0);
    const avgFactionDmg = liveFaction.length > 0
        ? liveFaction.reduce((s, a) => s + a.dmg, 0) / liveFaction.length
        : va.ref.dmg;

    const currentDist = hexDistance({ q: va.q, r: va.r }, navTarget);
    const moves       = getVirtualMoves(va, virtualOccupied);

    // --- A. ATTACCO NEMICI (dalla posizione corrente) ---------
    const combatTargets = getVirtualTargets(va, faction, virtualHP, false);
    for (const t of combatTargets) {
        const cell      = grid.get(getKey(t.q, t.r));
        let effectiveHp = virtualHP.get(getKey(t.q, t.r)) ?? t.hp;
        if (cell?.terrain === 'copertura') effectiveHp += 1;

        let score;
        if (t.type === 'hq') {
            // HQ: kill garantito ha alta priorità ma inferiore al kill agente
            score = effectiveHp <= va.ref.dmg ? 148000 : 68000;
        } else {
            if (effectiveHp <= va.ref.dmg) {
                // Kill garantito → priorità assoluta
                score = 200000;
            } else if (effectiveHp <= Math.ceil(avgFactionDmg) + va.ref.dmg) {
                // Setup-kill: il prossimo agente potrà finirlo
                score = 160000 + Math.max(0, (6 - effectiveHp)) * 4000;
            } else {
                // Danno generico: proporzionale all'efficacia
                score = 120000 + Math.floor((va.ref.dmg / effectiveHp) * 20000);
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

    // --- B. AVVICINAMENTO CON LOOKAHEAD SHOOT ----------------
    // Per ogni mossa verso il bersaglio, simula i target raggiungibili
    // dalla nuova posizione e pesa il movimento di conseguenza.
    for (const m of moves) {
        if (va.visited.has(getKey(m.q, m.r))) continue;
        const mDist = hexDistance(m, navTarget);
        if (mDist >= currentDist) continue; // solo avvicinamenti reali

        // Simula posizione dopo il movimento
        const simulatedVA    = { ...va, q: m.q, r: m.r };
        const targetsFromThere = getVirtualTargets(simulatedVA, faction, virtualHP, false);

        let lookaheadScore = 0;
        for (const t of targetsFromThere) {
            const effectiveHp = virtualHP.get(getKey(t.q, t.r)) ?? t.hp;
            if (t.type !== 'hq') {
                if (effectiveHp <= va.ref.dmg)
                    lookaheadScore = Math.max(lookaheadScore, 85000);  // kill da lì
                else if (effectiveHp <= Math.ceil(avgFactionDmg) + va.ref.dmg)
                    lookaheadScore = Math.max(lookaheadScore, 72000);  // setup da lì
                else
                    lookaheadScore = Math.max(lookaheadScore, 55000);  // danno generico
            } else {
                lookaheadScore = Math.max(lookaheadScore, 40000);
            }
        }

        // Avvicinamento puro (senza tiro): base + bonus per ogni cella guadagnata
        const baseApproachScore = 90000 + (currentDist - mDist) * 4000;
        const score = Math.max(baseApproachScore, lookaheadScore);

        candidates.push({
            score,
            action: { type: 'move', q: m.q, r: m.r, cost: 1 },
        });
    }

    // --- C. ASSEDIO: ostacoli che bloccano il percorso --------
    const obstacles = getVirtualTargets(va, faction, virtualHP, true);
    for (const obs of obstacles) {
        const distObsToTarget = hexDistance({ q: obs.q, r: obs.r }, navTarget);
        const isAdjacent      = hexDistance({ q: va.q, r: va.r }, obs) === 1;
        const isBlocking      = isAdjacent && distObsToTarget < currentDist;
        if (!isBlocking) continue;

        const obsHp = virtualHP.get(getKey(obs.q, obs.r)) ?? obs.hp;
        let score   = obs.type === 'barricade' ? 60000 : 45000;
        if (obsHp <= va.ref.dmg) score += 15000;

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

    // --- D. MOVIMENTO LATERALE (stesso range dal target) ------
    for (const m of moves) {
        if (va.visited.has(getKey(m.q, m.r))) continue;
        if (hexDistance(m, navTarget) === currentDist) {
            candidates.push({
                score:  20000,
                action: { type: 'move', q: m.q, r: m.r, cost: 1 },
            });
        }
    }

    // --- E. FALLBACK GARANTITO --------------------------------
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
/**
 * Restituisce il bersaglio più prioritario da cacciare.
 *
 * PRIORITÀ:
 *   1. Agenti nemici — sempre preferiti agli HQ.
 *      Bersaglio ideale: ferito E vicino (woundBonus fino a -5).
 *   2. HQ nemico — solo se non ci sono agenti nemici entro
 *      THREAT_RADIUS. Se il campo è relativamente libero,
 *      l'HQ diventa bersaglio con penalità ridotta (+3 vs +10).
 *   3. CP non controllato (residuale) — solo se nessun altro
 *      bersaglio valido esiste nel raggio, con penalità +15.
 */
function getHuntingTarget(va, faction) {
    const THREAT_RADIUS = 8;

    // ── Fase 1: agente nemico più appetibile ─────────────────
    let closestAgent = null;
    let minAgentDist = Infinity;

    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === faction) continue;
        players[p].agents.forEach(enemy => {
            if (enemy.hp <= 0) return;
            const rawDist    = hexDistance({ q: va.q, r: va.r }, enemy);
            // Bonus ferito: fino a -5 (era -4 in V16)
            const woundBonus = Math.min(5, enemy.maxHp - enemy.hp);
            const d          = rawDist - woundBonus;
            if (d < minAgentDist) { minAgentDist = d; closestAgent = enemy; }
        });
    }

    // ── Fase 2: c'è una minaccia nel raggio tattico? ─────────
    let threatExists = false;
    outer: for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === faction) continue;
        for (const e of players[p].agents) {
            if (e.hp > 0 && hexDistance({ q: va.q, r: va.r }, e) <= THREAT_RADIUS) {
                threatExists = true;
                break outer;
            }
        }
    }

    // Se c'è minaccia → agente è l'unica opzione valida
    if (threatExists && closestAgent) return closestAgent;

    // ── Fase 3: campo libero → considera HQ con penalità ridotta
    let closestHQ  = null;
    let minHQDist  = Infinity;
    for (let p = 1; p <= totalPlayers; p++) {
        if (!players[p] || p === faction) continue;
        if (players[p].hq?.hp > 0) {
            const dHQ = hexDistance({ q: va.q, r: va.r }, players[p].hq) + 3;
            if (dHQ < minHQDist) { minHQDist = dHQ; closestHQ = players[p].hq; }
        }
    }

    // Anche a campo libero, se l'agente è più vicino dell'HQ lo preferiamo
    if (closestAgent && minAgentDist <= minHQDist) return closestAgent;
    if (closestHQ) return closestHQ;

    // ── Fase 4: fallback residuale → CP non controllato ──────
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

    return closestCP; // null → agente resta fermo (nessun bersaglio)
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
