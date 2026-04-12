/* ============================================================
   map.js — Generazione procedurale mappa e sincronizzazione tema
   ============================================================
   ESPONE: generateProceduralMap, createHQ, placeEntityAt,
           placePlayerAgents, receiveGameState, placeControlPoints
   DIPENDE DA: constants.js, assets.js, state.js
   ============================================================ */

function generateProceduralMap() {
    grid.clear();

    // DETERMINA IL RAGGIO DINAMICO
    // Se i giocatori sono più di 4, aumentiamo il raggio del 60% (quasi raddoppia l'area)
    const effectiveRadius = totalPlayers > 4 ? Math.round(GRID_RADIUS * 1.6) : GRID_RADIUS;
    
    // --- Forma della griglia (Rettangolare adattiva) ---
    const RQ = effectiveRadius;
    const RR = Math.round(effectiveRadius * 0.85);
    
    for (let r = -RR; r <= RR; r++) {
        const qOffset = Math.floor(r / 2);
        for (let q = -RQ - qOffset; q <= RQ - qOffset; q++) {
            grid.set(getKey(q, r), { type: 'empty', q, r, entity: null, hp: 0, maxHp: 0 });
        }
    }

    // --- Posizioni HQ ---
    const hqPositions = _buildHQPositions(effectiveRadius);
    hqPositions.forEach((pos, i) => {
        if (i < totalPlayers) {
            placeEntityAt(createHQ(i + 1), pos.q, pos.r);
        }
    });

    // --- Muri procedurali ---
    grid.forEach(cell => {
        if (cell.type !== 'empty' || cell.entity) return;
        const farFromAll = hqPositions.every(hq => hexDistance(cell, hq) > 2);
        if (farFromAll && Math.random() < GAME.WALL_DENSITY) {
            cell.type = 'wall';
            const hp = GAME.WALL_HP_MIN + Math.floor(Math.random() * GAME.WALL_HP_RANGE);
            cell.hp = hp; cell.maxHp = hp;
            cell.sprite = getRandomSprite(SPRITE_POOLS.walls);
            const idx = Math.floor(Math.random() * THEME_WALL_COUNT) + 1;
            cell.customSpriteId = THEME_WALL_PREFIX + idx;
        }
    });

    hqPositions.forEach((pos, i) => {
        if (i < totalPlayers) placePlayerAgents(i + 1, pos);
    });
    
    placeControlPoints(hqPositions);
    if (typeof generateTerrains === 'function') generateTerrains();
}

// --- HELPER PRIVATO: calcola posizioni HQ in base al numero di giocatori ---
function _buildHQPositions(R) {
    const RQ = R;
    const RR = Math.round(R * 0.85);
    
    const rMin = -RR + 1; // Riga in alto (Nord)
    const rMax =  RR - 1; // Riga in basso (Sud)

    // Calcolo degli angoli (P1-P4)
    const qStartTop = -RQ - Math.floor(rMin / 2) + 1;
    const qEndTop   =  RQ - Math.floor(rMin / 2) - 1;
    const qStartBot = -RQ - Math.floor(rMax / 2) + 1;
    const qEndBot   =  RQ - Math.floor(rMax / 2) - 1;

    // Centri dei lati (P5-P8)
    // Per centrare q su una riga r, la formula è: -floor(r/2)
    const qCenterTop = -Math.floor(rMin / 2);
    const qCenterBot = -Math.floor(rMax / 2);

    return [
        { q: qStartBot, r: rMax },   // P1 Verde  (Angolo Sud-Ovest)
        { q: qEndTop,   r: rMin },   // P2 Viola  (Angolo Nord-Est)
        { q: qEndBot,   r: rMax },   // P3 Blu    (Angolo Sud-Est)
        { q: qStartTop, r: rMin },   // P4 Oro    (Angolo Nord-Ovest)
        
        { q: qCenterBot, r: rMax },  // P5 Rosso  (Centro SUD) - CORRETTO
        { q: qCenterTop, r: rMin },  // P6 Bianco (Centro NORD) - CORRETTO
        
        { q: -RQ, r: 0 },            // P7 Grigio (Centro OVEST)
        { q:  RQ, r: 0 }             // P8 Rosa   (Centro EST)
    ];
}

// --- ENTITÀ ---

function createHQ(faction) {
    const hq = {
        id: `hq_${faction}`, type: 'hq', faction,
        sprite: SPRITE_POOLS.hqs[faction - 1],
        customSpriteId: 'HQ' + faction,
        hp: GAME.HQ_HP, maxHp: GAME.HQ_HP, q: 0, r: 0,
    };
    players[faction].hq = hq;
    return hq;
}

function placeEntityAt(entity, q, r) {
    const cell = grid.get(getKey(q, r));
    if (cell) { cell.entity = entity; entity.q = q; entity.r = r; }
}

function placePlayerAgents(faction, hqPos) {
    const agents         = players[faction].agents;
    const availableCells = [];

    hexDirections.forEach(dir => {
        for (let d = 1; d <= 2; d++) {
            const cell = grid.get(getKey(hqPos.q + dir.q * d, hqPos.r + dir.r * d));
            if (cell && cell.type === 'empty' && !cell.entity) availableCells.push(cell);
        }
    });

    // Due shuffle + sort per distribuzione semi-casuale ma riproducibile
    shuffleArray(availableCells);
    availableCells.sort((a, b) => a.q !== b.q ? a.q - b.q : a.r - b.r);
    shuffleArray(availableCells);

    agents.forEach((agent, i) => {
        if (i < availableCells.length) placeEntityAt(agent, availableCells[i].q, availableCells[i].r);
    });
}


// --- PUNTI DI CONTROLLO ---

/**
 * Piazza GAME.CP_COUNT punti di controllo sulla mappa.
 * I CP vengono posizionati su celle empty, a distanza intermedia
 * dal centro e mediamente equidistanti tra loro.
 * Logica: campiona candidate distribuite angolarmente e sceglie
 * quella empty più vicina al punto ideale per ciascun slot.
 */
function placeControlPoints(hqPositions) {
    controlPoints.clear();

    // 1. Identifica il raggio della mappa attuale
    const currentRadius = totalPlayers > 4 ? Math.round(GRID_RADIUS * 1.6) : GRID_RADIUS;

    // 2. Determina il numero di CP (8 per mappe grandi, altrimenti valore base)
    const count = totalPlayers > 4 ? 8 : GAME.CP_COUNT;

    // 3. CALCOLO RAGGIO DI PIAZZAMENTO DINAMICO
    // Con un vincolo di 7 caselle dall'HQ su una mappa di raggio ~15-16, 
    // il raggio di piazzamento ottimale deve essere intorno al 50-55% 
    // per garantire che esistano celle che soddisfino entrambi i requisiti.
    const placementRadius = totalPlayers > 4 ? currentRadius * 0.50 : currentRadius * 0.60;

    const placed = [];
    const minSafetyFromHQ = totalPlayers > 4 ? 7 : 4; // 7 per 8P, 4 per 2-4P

    for (let i = 0; i < count; i++) {
        // Distribuzione angolare uniforme
        const angle = (2 * Math.PI / count) * i + (Math.PI / count);
        
        const idealQ = Math.round(placementRadius * Math.cos(angle));
        const idealR = Math.round(placementRadius * Math.sin(angle));

        let best = null, bestDist = Infinity;

        grid.forEach(cell => {
            if (cell.type !== 'empty' || cell.entity) return;
            const key = getKey(cell.q, cell.r);
            if (controlPoints.has(key)) return;

            // VINCOLO RICHIESTO: Almeno 7 caselle di distanza da ogni HQ
            const distFromNearestHQ = Math.min(...hqPositions.map(hq => hexDistance(cell, hq)));
            if (distFromNearestHQ < minSafetyFromHQ) return;

            // DISTRIBUZIONE: Almeno 4 caselle tra un CP e l'altro
            const minCPDist = totalPlayers > 4 ? 4 : 3;
            const nearCP = placed.some(cp => hexDistance(cell, cp) < minCPDist);
            if (nearCP) return;

            const d = hexDistance(cell, { q: idealQ, r: idealR });
            if (d < bestDist) {
                bestDist = d;
                best = cell;
            }
        });

        if (best) {
            const key = getKey(best.q, best.r);
            controlPoints.set(key, { q: best.q, r: best.r, faction: 0 });
            placed.push(best);
        }
    }

    // Nota: Se la mappa è troppo piccola per soddisfare i vincoli, 
    // alcuni CP potrebbero non apparire. Ma con il raggio raddoppiato per 8P,
    // lo spazio è ampiamente sufficiente.
}

// --- SINCRONIZZAZIONE MULTIPLAYER ---

/**
 * Ricostruisce lo stato mappa ricevuto dall'host.
 * Chiamata da multiplayer.js quando arriva un messaggio GAME_STATE.
 */
function receiveGameState(netState) {
    // Sincronizzazione tema visivo
    if (netState.theme) {
        applyTheme({
            id:     netState.theme.id,
            prefix: netState.theme.prefix,
            count:  netState.theme.count,
            path:   'img/' + netState.theme.path,
        });
    }

    if (netState.players) {
        totalPlayers = netState.totalPlayers || 2;
        for (let p = 1; p <= 8; p++) {
            if (netState.players[p]) players[p] = netState.players[p];
        }
    }

    // Ricostruisce la griglia vuota della stessa forma
    const effectiveRadius = totalPlayers > 4 ? Math.round(GRID_RADIUS * 1.6) : GRID_RADIUS;

    grid.clear();
    
    // Ricostruisce la griglia con le dimensioni corrette
    const RQ = effectiveRadius;
    const RR = Math.round(effectiveRadius * 0.85);
    for (let r = -RR; r <= RR; r++) {
        const qOffset = Math.floor(r / 2);
        for (let q = -RQ - qOffset; q <= RQ - qOffset; q++) {
            grid.set(getKey(q, r), { type: 'empty', q, r, entity: null, hp: 0, maxHp: 0 });
        }
    }
    

    // Ricostruisce punti di controllo
    controlPoints.clear();
    if (netState.controlPoints) {
        netState.controlPoints.forEach(cp => {
            controlPoints.set(getKey(cp.q, cp.r), { q: cp.q, r: cp.r, faction: cp.faction });
        });
    }

    // Applica muri e barricate ricevuti
    netState.walls.forEach(w => {
        const cell = grid.get(getKey(w.q, w.r));
        if (cell) {
            cell.type = w.type; cell.hp = w.hp; cell.maxHp = w.maxHp;
            cell.sprite = w.sprite; cell.customSpriteId = w.customSpriteId;
        }
    });

    // --- NUOVO: Applica terreni ricevuti dall'Host ---
    if (netState.terrains) {
        netState.terrains.forEach(t => {
            const cell = grid.get(getKey(t.q, t.r));
            if (cell) cell.terrain = t.terrain;
        });
    }

    // Piazza entità
    for (let f = 1; f <= totalPlayers; f++) {
        if (players[f]?.hq)     placeEntityAt(players[f].hq, players[f].hq.q, players[f].hq.r);
        if (players[f]?.agents) players[f].agents.forEach(a => placeEntityAt(a, a.q, a.r));
    }
}
