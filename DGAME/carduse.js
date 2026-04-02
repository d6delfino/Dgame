/* ============================================================
   carduse.js — Implementazione Reale Effetti Carte Strategiche
   ============================================================
   Questo script va aggiunto nell'HTML dopo 'cards.js' e 'gamelogic.js'.
   Esegue l'overriding delle logiche e funzioni base per iniettare gli 
   effetti reali delle carte, l'interazione sul campo e le animazioni.
   ============================================================ */

// --- UTILITY VFX ANIMAZIONI ---
function playSpecialVFX(target, color, text) {
    if (!target) return;
    const p = hexToPixel(target.q, target.r);
    const floatText = document.createElement('div');
    floatText.innerText = text;
    floatText.style.cssText = `
        position: absolute;
        left: ${p.x}px;
        top: ${p.y - 20}px;
        transform: translate(-50%, -50%);
        color: ${color};
        font-weight: bold;
        font-size: 22px;
        font-family: 'Courier New', monospace;
        text-shadow: 0 0 12px ${color}, 0 0 4px #000;
        pointer-events: none;
        z-index: 10000;
        animation: floatUpFade 2.5s ease-out forwards;
    `;
    document.body.appendChild(floatText);
    setTimeout(() => floatText.remove(), 2500);

    if (!document.getElementById('card-vfx-style')) {
        const style = document.createElement('style');
        style.id = 'card-vfx-style';
        style.innerHTML = `
            @keyframes floatUpFade {
                0% { opacity: 1; transform: translate(-50%, -50%) scale(0.8); }
                20% { transform: translate(-50%, -50%) scale(1.1); }
                100% { opacity: 0; transform: translate(-50%, -150%) scale(1.3); }
            }
        `;
        document.head.appendChild(style);
    }
}

function getAdjacentEnemies(agent) {
    let enemies = [];
    hexDirections.forEach(dir => {
        let c = grid.get(getKey(agent.q + dir.q, agent.r + dir.r));
        if (c && c.entity && c.entity.faction !== agent.faction) enemies.push(c.entity);
    });
    return enemies;
}

function getMostDamagedAdjacentAlly(agent) {
    let allies = [];
    hexDirections.forEach(dir => {
        let c = grid.get(getKey(agent.q + dir.q, agent.r + dir.r));
        if (c && c.entity && c.entity.faction === agent.faction && c.entity.type === 'agent') allies.push(c.entity);
    });
    if (allies.length === 0) return null;
    allies.sort((a,b) => a.hp - b.hp);
    return allies[0];
}

// --- OVERRIDE UI E MESSAGGI CARTE ---
window.showCardMessage = function(faction, cardId) {
    const card = CARD_DEFINITIONS[cardId];
    if (!card) return;

    const msg = document.createElement('div');
    msg.style.cssText = `
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%); z-index: 10000;
        background: rgba(5,5,15,0.95); border: 3px solid ${card.color};
        border-radius: 8px; padding: 20px 30px; text-align: center;
        font-family: 'Courier New', monospace;
        box-shadow: 0 0 30px ${card.color}88; pointer-events: none;
        animation: cardPopupAnim 2s ease-out forwards;
    `;
    msg.innerHTML = `
        <div style="font-size:36px; margin-bottom:8px;">${card.icon}</div>
        <div style="color:${card.color}; font-size:18px; font-weight:bold; text-transform:uppercase;">${card.name}</div>
        <div style="color:#ddd; font-size:14px; margin-top:6px;">Abilità Attivata!</div>
    `;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 2000);

    if (!document.getElementById('card-popup-anim')) {
        const style = document.createElement('style');
        style.id = 'card-popup-anim';
        style.innerHTML = `
            @keyframes cardPopupAnim {
                0% { opacity: 0; transform: translate(-50%, -40%) scale(0.8); }
                15% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
                30% { transform: translate(-50%, -50%) scale(1); }
                80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
                100% { opacity: 0; transform: translate(-50%, -60%) scale(0.9); }
            }
        `;
        document.head.appendChild(style);
    }
};

const originalActivateIngameCard = window._activateIngameCard;
window._activateIngameCard = function(slotIndex, cardId) {
    const needsAgent = ['C01','C02','C03','C04','C05','C06','C07','C08','C09','C10'];
    if (needsAgent.includes(cardId)) {
        if (!selectedAgent || selectedAgent.faction !== currentPlayer || selectedAgent.type !== 'agent') {
            // Disegna errore al centro se nessun agente è selezionato
            playSpecialVFX({q: 0, r: 0}, '#ff3333', 'SELEZIONA UN AGENTE!');
            return;
        }
    }

    const pData = players[currentPlayer];
    const slotKey = `slot_${slotIndex}`;
    if (!pData || pData.usedCards?.[slotKey]) return;

    pData.usedCards[slotKey] = true;
    const card = CARD_DEFINITIONS[cardId];
    if (card) card.apply(currentPlayer);

    // Invia informazione di Rete estesa con l'Agente Target!
    if (isOnline) {
        sendOnlineMessage({
            type: 'ACTION_CARD',
            cardId: cardId,
            slotIndex: slotIndex,
            actingPlayer: currentPlayer,
            targetAgentId: selectedAgent ? selectedAgent.id : null
        });
    }
    updateIngameCardsUI();
};

window.receiveRemoteCardAction = function(data) {
    const pData = players[data.actingPlayer];
    const slotKey = `slot_${data.slotIndex}`;
    if (!pData) return;
    if (!pData.usedCards) pData.usedCards = {};
    pData.usedCards[slotKey] = true;

    // Forza selezione agente remoto
    if (data.targetAgentId) {
        const agent = pData.agents.find(a => a.id === data.targetAgentId);
        if (agent) selectedAgent = agent;
    }

    const card = CARD_DEFINITIONS[data.cardId];
    // Le carte C02 e C08 richiedono interazione (setActionMode) che non va eseguita
    // sul client remoto: l'azione vera arriverà come messaggio ACTION separato.
    // Per tutte le altre carte applichiamo normalmente l'effetto (buff/debuff immediati).
    const INTERACTIVE_CARDS = ['C02', 'C08'];
    if (card && !INTERACTIVE_CARDS.includes(data.cardId)) {
        card.apply(data.actingPlayer);
    } else if (card && INTERACTIVE_CARDS.includes(data.cardId)) {
        // Applica solo la notifica visiva senza aprire la modalità azione
        showCardMessage(data.actingPlayer, data.cardId);
    }

    updateIngameCardsUI();
    drawGame();
};

// --- LOGICHE EFFETTI CARTE ---
if (typeof CARD_DEFINITIONS !== 'undefined') {
    CARD_DEFINITIONS['C01'].apply = function() {
        selectedAgent.ap += 2;
        playSpecialVFX(selectedAgent, '#FFD700', '⚡ +2 AP!');
        updateUI();
        showCardMessage(currentPlayer, 'C01');
    };

    CARD_DEFINITIONS['C02'].apply = function() {
    selectedAgent.fortinoBuilds = 3;
    selectedAgent.fortinoActive = true;

    setActionMode('card_build');

    playSpecialVFX(selectedAgent, '#00aaff', '🏰 FORTINO x3!');
    showCardMessage(currentPlayer, 'C02');
};

    CARD_DEFINITIONS['C03'].apply = function() {
        selectedAgent.sniperBuff = true;
        selectedAgent.originalRng = selectedAgent.rng;
        selectedAgent.rng *= 2;
        playSpecialVFX(selectedAgent, '#ff3333', '🎯 GITTATA x2!');
        updateUI();
        showCardMessage(currentPlayer, 'C03');
    };

    CARD_DEFINITIONS['C04'].apply = function() {
        let target = getMostDamagedAdjacentAlly(selectedAgent);
        if (!target) target = selectedAgent;
        target.hp = Math.min(target.hp + 3, target.maxHp);
        playSpecialVFX(target, '#00ff88', '💉 +3 HP!');
        playSFX('heal');
        updateUI(); drawGame();
        showCardMessage(currentPlayer, 'C04');
    };

    CARD_DEFINITIONS['C05'].apply = function() {
        selectedAgent.demoBuff = true;
        playSpecialVFX(selectedAgent, '#ff8800', '💣 DEMOLIZIONE!');
        showCardMessage(currentPlayer, 'C05');
    };

    CARD_DEFINITIONS['C06'].apply = function() {
        selectedAgent.infiltrateBuff = true;
        playSpecialVFX(selectedAgent, '#cc00ff', '🥷 INFILTRAZIONE ATTIVA!');
        updateUI();
        showCardMessage(currentPlayer, 'C06');
    };

    CARD_DEFINITIONS['C07'].apply = function() {
        selectedAgent.shielded = true;
        playSpecialVFX(selectedAgent, '#00ffff', '🛡️ SCUDO ATTIVO!');
        drawGame();
        showCardMessage(currentPlayer, 'C07');
    };

    CARD_DEFINITIONS['C08'].apply = function() {
        setActionMode('card_airdrop');
        showCardMessage(currentPlayer, 'C08');
    };

    CARD_DEFINITIONS['C09'].apply = function() {
        let enemies = [];
        grid.forEach(cell => {
            if (cell.entity && cell.entity.type === 'agent' && cell.entity.faction !== currentPlayer) {
                if (hexDistance(selectedAgent, cell.entity) <= 3) {
                    enemies.push(cell.entity);
                }
            }
        });
        enemies.forEach(e => {
            e.empDebuff = (e.empDebuff || 0) + 1;
            playSpecialVFX(e, '#ff00cc', '📡 EMP SHOCK!');
        });
        if(enemies.length === 0) playSpecialVFX(selectedAgent, '#ff00cc', 'Nessun bersaglio EMP');
        showCardMessage(currentPlayer, 'C09');
    };

    CARD_DEFINITIONS['C10'].apply = function() {
        let enemies = getAdjacentEnemies(selectedAgent);
        if (enemies.length > 0) {
            enemies.sort((a,b) => a.hp - b.hp);
            let enemy = enemies[0];
            let stats = ['maxHp', 'mov', 'dmg', 'rng'];
            let stat = stats[Math.floor(Math.random() * stats.length)];
            
            if (stat === 'maxHp') {
                selectedAgent.maxHp += 1;
                selectedAgent.hp += 1;
                playSpecialVFX(selectedAgent, '#ffaa00', '💚 +1 VITA MAX!');
                if (enemy.maxHp > 1) {
                    enemy.maxHp -= 1;
                    enemy.hp = Math.min(enemy.hp, enemy.maxHp);
                    playSpecialVFX(enemy, '#ff3333', '💔 -1 VITA MAX');
                } else {
                    playSpecialVFX(enemy, '#888', 'Vita al minimo');
                }
            } else {
                selectedAgent[stat] += 1;
                playSpecialVFX(selectedAgent, '#ffaa00', `🔼 +1 ${stat.toUpperCase()}!`);
                if (enemy[stat] > 1) {
                    enemy[stat] -= 1;
                    playSpecialVFX(enemy, '#ff3333', `🔽 -1 ${stat.toUpperCase()}`);
                } else {
                    playSpecialVFX(enemy, '#888', 'Statistica al minimo');
                }
            }
        } else {
            playSpecialVFX(selectedAgent, '#888', 'Nessun nemico adiacente');
        }
        updateUI(); drawGame();
        showCardMessage(currentPlayer, 'C10');
    };
}

// --- OVERRIDE CALCOLO MOVIMENTO (PER INFILTRAZIONE) ---
const originalCalculateValidMoves = window.calculateValidMoves;
window.calculateValidMoves = function() {
    if (selectedAgent && selectedAgent.infiltrateBuff) {
        let visited = new Set([getKey(selectedAgent.q, selectedAgent.r)]);
        let queue = [{ q: selectedAgent.q, r: selectedAgent.r, dist: 0 }];
        while (queue.length > 0) {
            let curr = queue.shift();
            if (curr.dist > 0) validActionTargets.push({ q: curr.q, r: curr.r });
            if (curr.dist < selectedAgent.mov) {
                hexDirections.forEach(dir => {
                    let nq = curr.q + dir.q, nr = curr.r + dir.r;
                    let nKey = getKey(nq, nr), nCell = grid.get(nKey);
                    // Entra anche nei muri e barricate, basta che non ci sia già un'entità
                    if (nCell && !visited.has(nKey) && !nCell.entity) {
                        visited.add(nKey); 
                        queue.push({ q: nq, r: nr, dist: curr.dist + 1 });
                    }
                });
            }
        }
    } else {
        originalCalculateValidMoves();
    }
};

// --- OVERRIDE SET ACTION MODE E TARGETING ---
const originalSetActionMode = window.setActionMode;
window.setActionMode = function(mode) {
    if (['card_airdrop', 'card_build'].includes(mode)) {
        playSFX('click');
        currentActionMode = mode;
        validActionTargets = [];

        if (mode === 'card_airdrop') {
            grid.forEach(cell => {
                if (cell.type === 'empty' && !cell.entity) validActionTargets.push({q: cell.q, r: cell.r});
            });
        } else if (mode === 'card_build') {
            grid.forEach(cell => {
                if (cell.type === 'empty' && !cell.entity) validActionTargets.push({ q: cell.q, r: cell.r });
            });
        }
        updateUI(); drawGame();
        return;
    }
    originalSetActionMode(mode);
};

// --- OVERRIDE ESECUZIONE AZIONI E MODIFICATORI DANNO ---
window.executeAction = function(targetCell, fromNetwork = false) {
    const isOnlineAITurn = isOnline && isHost && onlineAIFactions.has(currentPlayer);
    if (isOnline && !fromNetwork && currentPlayer !== myPlayerNumber && !isOnlineAITurn) return;

    let success = false;
    let actionCost = 1;
    const originQ = selectedAgent.q;
    const originR = selectedAgent.r;

    if (currentActionMode === 'card_airdrop') {
        playSFX('move');
        grid.get(getKey(selectedAgent.q, selectedAgent.r)).entity = null;
        targetCell.entity = selectedAgent;
        selectedAgent.q = targetCell.q;
        selectedAgent.r = targetCell.r;
        success = true;
        actionCost = 0;
        playSpecialVFX(selectedAgent, '#a0ff00', '🪂 ATTERRATO!');
    }
    else if (currentActionMode === 'card_build') {
    playSFX('build');

    targetCell.type = 'barricade';
    targetCell.hp = 2;
    targetCell.maxHp = 2;
    targetCell.sprite = getRandomSprite(SPRITE_POOLS.barricades);
    targetCell.customSpriteId = THEME_BARRICADE_ID;

    success = true;

    // 🔥 LOGICA FORTINO
    if (selectedAgent.fortinoActive && selectedAgent.fortinoBuilds > 0) {
        selectedAgent.fortinoBuilds--;

        playSpecialVFX(targetCell, '#00aaff', `🏰 ${selectedAgent.fortinoBuilds} rimaste`);

        if (selectedAgent.fortinoBuilds <= 0) {
                selectedAgent.fortinoActive = false;
            } else {
                validActionTargets = validActionTargets.filter(t => t.q !== targetCell.q || t.r !== targetCell.r);
            }
            actionCost = 0;
        } else {
            // fallback sicurezza
            actionCost = 0;
        }
}
    else if (currentActionMode === 'heal') {
        if (selectedAgent.ap < 2) { cancelAction(); return; }
        if (targetCell.entity && targetCell.entity.faction === currentPlayer) {
            targetCell.entity.hp = Math.min(targetCell.entity.maxHp, targetCell.entity.hp + 1);
            actionCost = 2;
            success = true;
            playSFX('heal');
        }
    } else if (currentActionMode === 'move') {
        playSFX('move');
        grid.get(getKey(selectedAgent.q, selectedAgent.r)).entity = null;
        targetCell.entity = selectedAgent;
        selectedAgent.q = targetCell.q;
        selectedAgent.r = targetCell.r;
        success = true;
    } else if (currentActionMode === 'shoot') {
        playSFX('laser');
        const targetData = validActionTargets.find(t => t.q === targetCell.q && t.r === targetCell.r);
        if (targetData || fromNetwork) {
            let actualTarget = targetData ? targetData.target : (targetCell.entity || targetCell);
            let dmgToDeal = selectedAgent.dmg;

            // EFFETTO CARTA: C05 Demolizione
            if (selectedAgent.demoBuff) {
                dmgToDeal *= 2;
                playSpecialVFX(targetCell, '#ff8800', '💥 DANNO DOPPIO!');
            }

            // EFFETTO CARTA: C07 Scudo Elettronico
            if (actualTarget.shielded) {
                dmgToDeal = 0;
                actualTarget.shielded = false;
                playSpecialVFX(actualTarget, '#00ffff', '🛡️ ATTACCO ANNULLATO!');
            }

            actualTarget.hp -= dmgToDeal;
            drawLaserBeam(selectedAgent, targetCell);

            if (actualTarget.hp <= 0) {
                if (targetCell.type === 'wall' || targetCell.type === 'barricade') {
                    targetCell.type = 'empty';
                    targetCell.hp = 0;
                } else if (actualTarget.type) {
                    handleEntityDeath(actualTarget);
                }
            }
            success = true;
        }
    } else if (currentActionMode === 'build') {
        playSFX('build');
        targetCell.type = 'barricade';
        targetCell.hp = 2;
        targetCell.maxHp = 2;
        targetCell.sprite = getRandomSprite(SPRITE_POOLS.barricades);
        targetCell.customSpriteId = THEME_BARRICADE_ID;
        success = true;
        actionCost = 2;
    }

    if (success) {
        if (isOnline && !fromNetwork) {
            sendOnlineMessage({
                type: 'ACTION',
                tQ: targetCell.q,
                tR: targetCell.r,
                sQ: originQ,
                sR: originR,
                mode: currentActionMode,
                actingPlayer: currentPlayer
            });
        }
        selectedAgent.ap -= actionCost;
        checkWinConditions();
        if (!fromNetwork) {
            // Se il fortino è in uso e ci sono cariche, aggira la cancellazione
            if (currentActionMode === 'card_build' && selectedAgent.fortinoActive && selectedAgent.fortinoBuilds > 0) {
                updateUI();
                drawGame();
            } else {
                cancelAction();
            }
        }
    }
};

// --- OVERRIDE RESET TURNO (PULIZIA BUFF E DEBUFF) ---
const originalResetTurnState = window.resetTurnState;
window.resetTurnState = function() {
    // Pulisci Buff del giocatore che ha appena finito il turno (tutti per sicurezza)
    for(let p=1; p<=totalPlayers; p++) {
        if(!players[p]) continue;
        players[p].agents.forEach(a => {
            if (a.sniperBuff && p === currentPlayer) {
                a.rng = a.originalRng;
                a.sniperBuff = false;
            }
            if (p === currentPlayer) {
                a.demoBuff = false;
                a.infiltrateBuff = false;
            }
        });
    }
    
    for(let p=1; p<=totalPlayers; p++) {
        if(!players[p]) continue;
        players[p].agents.forEach(a => {
            a.fortinoActive = false;
            a.fortinoBuilds = 0;
        });
    }

    originalResetTurnState();
    
    // Applica Debuff EMP per il giocatore che INIZIA il turno ora
    if (players[currentPlayer] && players[currentPlayer].agents) {
        players[currentPlayer].agents.forEach(a => {
            if (a.empDebuff && a.empDebuff > 0) {
    const loss = a.empDebuff;
    a.ap = Math.max(0, a.ap - loss);

    playSpecialVFX(a, '#ff00cc', `⚡ -${loss} AP (EMP)`);

    a.empDebuff = 0;
}
        });
    }
    updateUI();
};

// --- OVERRIDE DISEGNO MAPPA (RENDER SCUDI E STATI) ---
const originalDrawGame = window.drawGame;
window.drawGame = function() {
    originalDrawGame();

    // Disegna Alone Scudo Elettronico
    grid.forEach(cell => {
        if (cell.entity && cell.entity.shielded) {
            let p = hexToPixel(cell.q, cell.r);
            ctx.save();
            ctx.beginPath();
            ctx.arc(p.x, p.y, HEX_SIZE * 0.95, 0, Math.PI * 2);
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 6]);
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00ffff';
            ctx.stroke();
            ctx.restore();
        }
    });
};