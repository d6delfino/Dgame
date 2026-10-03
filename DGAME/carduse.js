/* ============================================================
   carduse.js — Meccaniche carta: registra handler nella pipeline
   ============================================================
   RESPONSABILITÀ:
   - Calcolo mosse alternative  → registerMoveCalculator()
   - Calcolo target alternativi → registerTargetCalculator()
   - Azioni carta custom        → registerActionHandler()
   - Intercettazione sparo      → registerActionHandler('shoot', …)
   - Difese passive             → registerDamageModifier()
   - Pulizia buff a fine turno  → registerTurnResetHook()
   - Effetti grafici extra      → registerDrawHook()

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
    if (!agent?.infiltrateBuff && !agent?.spectreBuff) return null;   // delega al calcolo standard

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
// bersaglio lungo la linea di tiro, rendendo bersagliabili anche le celle vuote.

registerTargetCalculator(function (agent) {
    if (!agent?.sniperBuff) return null; 

    const targets    = [];
    const maxTargets = 1 + (agent.pierceCount || 0); // Bersaglio base + perforazioni

    let currentRng   = agent.rng;
    const originCell = grid.get(getKey(agent.q, agent.r));
    if (originCell && originCell.terrain === 'altura') currentRng += 1;

    hexDirections.forEach(dir => {
        let targetsHit = 0;

        for (let d = 1; d <= currentRng; d++) {
            const cell = grid.get(getKey(
                agent.q + dir.q * d,
                agent.r + dir.r * d
            ));
            if (!cell) break;

            // Controlliamo se c'è un'entità o un muro fisico
            if (cell.type === 'wall' || cell.type === 'barricade' || cell.entity) {
                
                // --- FIX NEBBIA ---
                // Se l'ostacolo/nemico è nascosto nella nebbia (distanza > 1 e senza EMP),
                // il Cecchino non può vederlo per mirarlo, quindi la linea si ferma.
                const isHiddenFog = cell.terrain === 'nebbia' && d > 1 && !(cell.entity && cell.entity.empFogRevealed);
                if (isHiddenFog) {
                    break;
                }

                // Se è un nemico o un ostacolo VISIBILE, contalo come bersaglio colpito
                if (cell.type === 'wall' || cell.type === 'barricade' || (cell.entity && cell.entity.faction !== currentPlayer)) {
                    targetsHit++;
                    targets.push({ 
                        q: cell.q, r: cell.r, 
                        isEnemy:    !!cell.entity, 
                        isObstacle: !cell.entity, 
                        target:     cell.entity || cell 
                    });
                    
                    // Se abbiamo raggiunto il limite di bersagli perforabili, il proiettile si ferma
                    if (targetsHit >= maxTargets) break;
                } else if (cell.entity && cell.entity.faction === currentPlayer) {
                    // Un alleato blocca sempre la linea di tiro
                    break;
                }
            } else {
                // --- Cella Vuota ---
                // Se la cella è vuota (anche se c'è nebbia!), il proiettile passa oltre
                // e la aggiungiamo alla lista per permettere l'Airburst.
                targets.push({ q: cell.q, r: cell.r, target: cell });
            }
        }
    });

    return targets;
});


// ============================================================
// ACTION HANDLER — Airdrop (C08)   mode: 'card_airdrop'
// ============================================================
// Quando setActionMode('card_airdrop') viene chiamato, questo
// handler intercetta la chiamata a fn(null, false) in setActionMode
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
    playSFX('airdrop');
    grid.get(getKey(selectedAgent.q, selectedAgent.r)).entity = null;
    targetCell.entity = selectedAgent;
    selectedAgent.q   = targetCell.q;
    selectedAgent.r   = targetCell.r;
    playSpecialVFX(selectedAgent, '#a0ff00', '🪂 ATTERRATO!');

    const airdropKey = getKey(selectedAgent.q, selectedAgent.r);
    if (controlPoints.has(airdropKey)) {
        const cp = controlPoints.get(airdropKey);
        if (cp.faction !== selectedAgent.faction) {
            cp.faction = selectedAgent.faction;
            if (!fromNetwork && typeof showCPCapture === 'function') showCPCapture(selectedAgent);
        }
    }
    return { success: true, actionCost: 3 };
});


// ============================================================
// ACTION HANDLER — Fortino (C02)   mode: 'card_build'
// ============================================================

registerActionHandler('card_build', function (targetCell, fromNetwork) {
    // Chiamata da setActionMode → popola i target (celle vuote O barricata esistente)
    if (targetCell === null) {
        grid.forEach(cell => {
            if (!cell.entity && (cell.type === 'empty' || cell.type === 'barricade'))
                validActionTargets.push({ q: cell.q, r: cell.r });
        });
        return { success: false, actionCost: 0 };
    }

    // Esegui costruzione / rinforzo gratuito
    playSFX('build');
    if (targetCell.type === 'barricade') {
        // Rinforza la barricata esistente sommando gli HP
        targetCell.hp    += GAME.BARRICADE_HP;
        targetCell.maxHp += GAME.BARRICADE_HP;
    } else {
        // Costruisce una nuova barricata su cella vuota
        targetCell.type           = 'barricade';
        targetCell.hp             = GAME.BARRICADE_HP;
        targetCell.maxHp          = GAME.BARRICADE_HP;
        targetCell.sprite         = getRandomSprite(SPRITE_POOLS.barricades);
        targetCell.customSpriteId = typeof getFactionBarricadeId === 'function' 
                                        ? getFactionBarricadeId(selectedAgent.faction) 
                                        : THEME_BARRICADE_ID;
    }
    invalidateStaticLayer();

    if (selectedAgent.fortinoActive && selectedAgent.fortinoBuilds > 0) {
        selectedAgent.fortinoBuilds--;
        playSpecialVFX(targetCell, '#00aaff', `🏰 ${selectedAgent.fortinoBuilds} rimaste`);
        if (selectedAgent.fortinoBuilds <= 0) selectedAgent.fortinoActive = false;
    }

    // Mantieni card_build attiva se rimangono costruzioni.
    // executeAction gestirà già il ricalcolo dei target perché
    // currentActionMode.startsWith('card_') — nessuna azione extra necessaria.
    if (!fromNetwork && (!selectedAgent.fortinoActive || selectedAgent.fortinoBuilds <= 0)) {
        selectedAgent.fortinoActive = false;
        // cancelAction verrà chiamato da executeAction automaticamente
    }

    return { success: true, actionCost: 0 };
});


// ============================================================
// ACTION HANDLER — Sparo con modificatori (intercetta 'shoot')
// ============================================================
// Gestisce: Demolizione (splash) e Cecchino piercing.
// Se nessun modificatore è attivo, delega al gestore standard
// ritornando null.
// Nota: lo Scudo Elettronico NON è più gestito qui — è un
// modificatore passivo registrato sotto come registerDamageModifier.

registerActionHandler('shoot', function (targetCell, fromNetwork) {
    if (targetCell === null) return null;

    const hasMods = selectedAgent.demoBuff || selectedAgent.sniperBuff;
    if (!hasMods) return null;

    // Calcola la distanza per il suono
    const dist = hexDistance(selectedAgent, targetCell);
    if (dist === 1) playSFX('melee');
    else playSFX(Math.random() < 0.30 ? 'uzi' : 'laser');
    
    const maxT            = 1 + (selectedAgent.pierceCount || 0);
    const mainLineTargets = [];
    
    if (selectedAgent.sniperBuff) {
        const dq   = targetCell.q - selectedAgent.q;
        const dr   = targetCell.r - selectedAgent.r;
        const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
        const stepQ = dq / dist;
        const stepR = dr / dist;
        
        let hits = 0;
        for (let s = 1; s <= dist; s++) {
            const q    = Math.round(selectedAgent.q + stepQ * s);
            const r    = Math.round(selectedAgent.r + stepR * s);
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

        // --- FIX AIRBURST PER CECCHINO ---
        // Se il punto cliccato (targetCell) non è stato incluso perché era vuoto,
        // aggiungiamolo ora per permettere l'esplosione tattica a mezz'aria.
        const targetAlreadyIncluded = mainLineTargets.some(t => t.cell.q === targetCell.q && t.cell.r === targetCell.r);
        if (!targetAlreadyIncluded) {
            mainLineTargets.push({ target: targetCell, cell: targetCell });
        }
        // ---------------------------------

    } else {
        // Solo demoBuff senza cecchino: bersaglio singolo standard
        const targetData  = validActionTargets.find(t => t.q === targetCell.q && t.r === targetCell.r);
        let finalTarget = targetData ? targetData.target : (targetCell.entity || targetCell);
        
        // FIX: Se c'è un ostacolo fisico, questo assorbe sempre il colpo diretto, 
        // proteggendo l'agente all'interno (anche se l'IA mirava l'agente)
        if (targetCell.type === 'wall' || targetCell.type === 'barricade') {
            finalTarget = targetCell;
        }

        mainLineTargets.push({ target: finalTarget, cell: targetCell });
    }

    // Costruisce la mappa danni
    const damageMap = new Map();
    const mainDmg   = selectedAgent.dmg;
    const splashDmg = Math.ceil(mainDmg / 2);

    mainLineTargets.forEach(item => {
        damageMap.set(item.target, (damageMap.get(item.target) || 0) + mainDmg);

        if (selectedAgent.demoBuff) {
                playSFX('boom');
                playSpecialVFX(item.cell, '#ff8800', '💥 BOOM!');
                hexDirections.forEach(dir => {
                    const adjCell = grid.get(getKey(item.cell.q + dir.q, item.cell.r + dir.r));
                    if (adjCell) {
                        // --- LOGICA DANNO (Solo se c'è un bersaglio valido) ---
                        if (adjCell.type === 'wall' || adjCell.type === 'barricade') {
                            damageMap.set(adjCell, (damageMap.get(adjCell) || 0) + splashDmg);
                        } else if (adjCell.entity) {
                            damageMap.set(adjCell.entity, (damageMap.get(adjCell.entity) || 0) + splashDmg);
                        }

                        // --- LOGICA GRAFICA (Sempre, anche su celle vuote) ---
                        if (typeof drawMeleeSlash === 'function') {
                            // Assegniamo all'esplosione la fazione dell'agente che ha sparato!
                            const centerExplosion = { q: item.cell.q, r: item.cell.r, faction: selectedAgent.faction };
                            drawMeleeSlash(centerExplosion, adjCell);
                        }
                    }
                });
            }
    });

    resolveCombatDamage(damageMap, selectedAgent);
    
    // Calcola la distanza per l'effetto grafico
    if (dist === 1) drawMeleeSlash(selectedAgent, targetCell);
    else drawLaserBeam(selectedAgent, targetCell);
    
    return { success: true, actionCost: 1 };
});


// ============================================================
// DAMAGE MODIFIER — Scudo Elettronico (C04)
// ============================================================
// Annulla completamente il danno se il bersaglio ha lo scudo
// attivo. Lo scudo perde un "carica" per ogni attacco bloccato.
// Registrato qui (non in gamelogic.js) perché è una meccanica
// introdotta da questa carta: gamelogic.js non deve sapere
// dell'esistenza dello scudo.

registerDamageModifier(function (dmg, target) {
    if (!target.shielded) return dmg;

    target.shielded--;
    if (target.shielded === 0) target.shielded = null;
    playSpecialVFX(target, '#00ffff', '🛡️ ATTACCO ANNULLATO!');
    return 0;   // danno azzerato
});


// ============================================================
// DAMAGE MODIFIER — Immunità Primo Turno
// ============================================================
// Gli agenti/HQ appena schierati sono immuni al danno fino a che
// non tocca a loro il primo turno. Questo modifier li protegge
// indipendentemente dalla fonte del danno (sparo standard,
// splash, cecchino, carte nemiche, ecc.).

registerDamageModifier(function (dmg, target) {
    if (!target.firstTurnImmune) return dmg;

    playSpecialVFX(target, '#00ffff', '🛡️ IMMUNE AL PRIMO TURNO!');
    return 0;   // danno azzerato
});


// ============================================================
// TURN RESET HOOK — pulizia buff/debuff
// ============================================================
// Eseguito all'inizio di ogni resetTurnState, PRIMA del reset AP
// (vedi commento in gamelogic.js, FASE 2).
// In questo modo l'EMP sottrae AP dal valore che sta PER essere
// ripristinato, e il giocatore parte già penalizzato.

registerTurnResetHook(function () {
        // Pulisce i buff di TUTTI i giocatori (non solo del corrente),
        // così buff come sniperBuff scadono al cambio turno anche se
        // il giocatore che li aveva è diverso dall'attuale.
        for (let p = 1; p <= totalPlayers; p++) {
            if (!players[p]) continue;
            
            // Uniamo l'HQ (se esiste) e l'array degli agenti in un unico array temporaneo da scansionare
            const allEntities = [...players[p].agents];
            if (players[p].hq) allEntities.push(players[p].hq);

            allEntities.forEach(a => {
                
                // RIMOZIONE BUFF TRAMITE SOTTRAZIONE (Fix Combinazioni e Upgrade C10)
                if (a.medikitTempBuff) {
                    if (a.type !== 'hq') a.mov = Math.max(1, a.mov - 1); // HQ non ha bonus ai passi
                    a.rng   = Math.max(1, a.rng - 1);
                    a.dmg   = Math.max(1, a.dmg - 1);
                    a.maxHp = Math.max(1, a.maxHp - 1);
                    a.hp    = Math.min(a.hp, a.maxHp);
                    
                    a.medikitTempBuff   = false;
                    a._medikitOrigMov   = undefined;
                    a._medikitOrigRng   = undefined;
                    a._medikitOrigDmg   = undefined;
                    a._medikitOrigMaxHp = undefined;
                }

                if (a.sniperBuff) { 
                    a.rng = Math.max(1, a.rng - (a.originalRng * (a.pierceCount || 1))); 
                    a.sniperBuff = false; 
                    a.sniperPierce = false; 
                }

                if (a.demoBuff) { 
                    // FIX: Moltiplica la sottrazione per il numero di carte esplosivo usate
                    a.dmg = Math.max(1, a.dmg - (a.originalDmg * (a.demoCount || 1))); 
                    a.demoBuff = false; 
                    a.demoCount = 0;
                }

                a.infiltrateBuff = false;
                a.fortinoActive  = false;
                a.fortinoBuilds  = 0;
                a.pierceCount    = 0;
            // Nota: shielded ed empDebuff persistono deliberatamente
            // oltre il cambio turno — vengono consumati al momento
            // dell'attacco (shielded) o qui sotto (empDebuff).
        });
    }

    // Applica EMP al giocatore che sta PER iniziare.
    // L'AP viene ridotto ora, prima che gamelogic.js lo ripristini
    // a GAME.AP_PER_TURN nella FASE 3 di resetTurnState.
    players[currentPlayer]?.agents.forEach(a => {
      if (a.empDebuff > 0) {
        const loss  = a.empDebuff;
        a.empDebuff = 0;
        a.empFogRevealed = false;
        setTimeout(() => {
            a.ap = Math.max(0, a.ap - loss);
            playSpecialVFX(a, '#ff00cc', `⚡ -${loss} AP (EMP)`);
        }, 0);
      }
    });
});


// ============================================================
// DRAW HOOK — Effetti grafici su entità (Scudo, Medikit, Spettro)
// ============================================================
registerDrawHook(function () {
    const now = Date.now();
    
    grid.forEach(cell => {
        const entity = cell.entity;
        if (!entity) return;

        // --- CALCOLO POSIZIONE SINCRONIZZATA CON IL MOVIMENTO ---
        const p = hexToPixel(cell.q, cell.r);
        let drawX = p.x;
        let drawY = p.y;

        // Se l'agente si sta muovendo (animazione di 300ms)
        if (entity._moveTime && (now - entity._moveTime < 300)) {
            const progress = (now - entity._moveTime) / 300;
            const oldP = hexToPixel(entity._lastQ, entity._lastR);
            // Calcola la posizione intermedia esatta per questo frame
            drawX = oldP.x + (p.x - oldP.x) * progress;
            drawY = oldP.y + (p.y - oldP.y) * progress;
        }

        // --- DISEGNO EFFETTI SULLE COORDINATE DINAMICHE ---

        // 1. Anello Scudo Elettronico
        if (entity.shielded) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(drawX, drawY, HEX_SIZE * 0.95, 0, Math.PI * 2);
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth   = 3;
            ctx.setLineDash([8, 6]);
            //ctx.shadowBlur  = 15;
            //ctx.shadowColor = '#00ffff';
            ctx.stroke();
            ctx.restore();
        }

        // 2. Icona Medikit Equipaggiato (Croce verde)
        if (entity.medikitBuff) {
            ctx.save();
            ctx.fillStyle   = '#00ff88';
            ctx.font        = `bold ${Math.round(HEX_SIZE * 0.4)}px Arial`;
            ctx.textAlign   = 'center';
            //ctx.shadowBlur  = 8;
            //ctx.shadowColor = '#00ff88';
            // Legata a drawX/drawY con offset fisso rispetto al centro agente
            ctx.fillText('✚', drawX - HEX_SIZE * 0.45, drawY - HEX_SIZE * 0.45);
            ctx.restore();
        }

        // 3. Icona Spettro permanente (fantasma viola)
        if (entity.spectreBuff) {
            ctx.save();
            ctx.fillStyle   = '#cc00ff';
            ctx.font        = `bold ${Math.round(HEX_SIZE * 0.38)}px Arial`;
            ctx.textAlign   = 'center';
            //ctx.shadowBlur  = 10;
            //ctx.shadowColor = '#cc00ff';
            // Legata a drawX/drawY con offset fisso
            ctx.fillText('👻', drawX + HEX_SIZE * 0.45, drawY - HEX_SIZE * 0.45);
            ctx.restore();
        }
    });
});


markScriptAsLoaded('carduse.js');
