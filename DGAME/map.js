/* ============================================================
   map.js — Generazione procedurale mappa e sincronizzazione tema
   ============================================================
   ESPONE: generateProceduralMap, createHQ, placeEntityAt,
           placePlayerAgents, receiveGameState, placeControlPoints
   DIPENDE DA: constants.js, assets.js, state.js
   ============================================================ */

function generateProceduralMap() {
    grid.clear();

    // --- Forma della griglia ---
    if (totalPlayers >= 3) {
        // Rettangolare (quasi quadrata) per 3-4 giocatori.
        // In coordinate assiali hex "pointy-top", un rettangolo si ottiene
        // iterando r liberamente e compensando q con floor(r/2).
        const RQ = GRID_RADIUS;
        const RR = Math.round(GRID_RADIUS * 0.85); // leggermente ridotta per avvicinarsi al quadrato
        for (let r = -RR; r <= RR; r++) {
            const qOffset = Math.floor(r / 2);
            for (let q = -RQ - qOffset; q <= RQ - qOffset; q++) {
                grid.set(getKey(q, r), { type: 'empty', q, r, entity: null, hp: 0, maxHp: 0 });
            }
        }
    } else {
        // Esagonale standard per 2 giocatori
        for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
            for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
                if (Math.abs(q + r) <= GRID_RADIUS)
                    grid.set(getKey(q, r), { type: 'empty', q, r, entity: null, hp: 0, maxHp: 0 });
            }
        }
    }

    // --- Posizioni HQ ---
    const hqPositions = _buildHQPositions();
    hqPositions.forEach((pos, i) => placeEntityAt(createHQ(i + 1), pos.q, pos.r));

    // --- Muri procedurali ---
    grid.forEach(cell => {
        if (cell.type !== 'empty' || cell.entity) return;
        const farFromAll = hqPositions.every(hq => hexDistance(cell, hq) > 2);
        if (farFromAll && Math.random() < GAME.WALL_DENSITY) {
            cell.type = 'wall';
            const hp   = GAME.WALL_HP_MIN + Math.floor(Math.random() * GAME.WALL_HP_RANGE);
            cell.hp    = hp; cell.maxHp = hp;
            cell.sprite = getRandomSprite(SPRITE_POOLS.walls);
            // Sprite tematico casuale
            const idx           = Math.floor(Math.random() * THEME_WALL_COUNT) + 1;
            cell.customSpriteId = THEME_WALL_PREFIX + idx;
        }
    });

    hqPositions.forEach((pos, i) => placePlayerAgents(i + 1, pos));
    placeControlPoints(hqPositions);
}

// --- HELPER PRIVATO: calcola posizioni HQ in base al numero di giocatori ---
function _buildHQPositions() {
    if (totalPlayers >= 3) {
        const RQ  = GRID_RADIUS;
        const RR  = Math.round(GRID_RADIUS * 0.85);
        const tR  = -RR + 1;
        const bR  =  RR - 1;
        const tlQ = -RQ - Math.floor(-RR / 2) + 1;
        const trQ =  RQ - Math.floor(-RR / 2) - 1;
        const blQ = -RQ - Math.floor( RR / 2) + 1;
        const brQ =  RQ - Math.floor( RR / 2) - 1;
        return [
            { q: blQ, r: bR },   // P1 Verde  — angolo basso-sinistra
            { q: trQ, r: tR },   // P2 Viola  — angolo alto-destra
            { q: brQ, r: bR },   // P3 Blu    — angolo basso-destra
            { q: tlQ, r: tR },   // P4 Oro    — angolo alto-sinistra
        ].slice(0, totalPlayers);
    }
    // Griglia esagonale: angoli opposti
    return [
        { q: -GRID_RADIUS + 1, r:  GRID_RADIUS - 1 },
        { q:  GRID_RADIUS - 1, r: -GRID_RADIUS + 1 },
        { q:  GRID_RADIUS - 1, r:  0 },
        { q: -GRID_RADIUS + 1, r:  0 },
    ].slice(0, totalPlayers);
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

    // Raggio target: circa metà tra centro e bordo della mappa
    const targetRadius = GRID_RADIUS * 0.5;
    const count        = GAME.CP_COUNT;
    const placed       = [];

    for (let i = 0; i < count; i++) {
        // Angolo ideale distribuito uniformemente
        const angle = (2 * Math.PI / count) * i + Math.PI / count;
        const idealQ = Math.round(targetRadius * Math.cos(angle));
        const idealR = Math.round(targetRadius * Math.sin(angle));

        // Cerca la cella empty più vicina al punto ideale che:
        // - non sia già un CP
        // - non sia adiacente a un HQ
        // - non abbia già un'entità
        let best = null, bestDist = Infinity;

        grid.forEach(cell => {
            if (cell.type !== 'empty' || cell.entity) return;
            const key = getKey(cell.q, cell.r);
            if (controlPoints.has(key)) return;
            // Non troppo vicino a nessun HQ
            const nearHQ = hqPositions.some(hq => hexDistance(cell, hq) < 3);
            if (nearHQ) return;
            // Non troppo vicino ai CP già piazzati
            const nearCP = placed.some(cp => hexDistance(cell, cp) < 3);
            if (nearCP) return;

            const d = hexDistance(cell, { q: idealQ, r: idealR });
            if (d < bestDist) { bestDist = d; best = cell; }
        });

        if (best) {
            const key = getKey(best.q, best.r);
            controlPoints.set(key, { q: best.q, r: best.r, faction: 0 });
            placed.push(best);
        }
    }
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
        for (let p = 1; p <= totalPlayers; p++) {
            if (netState.players[p]) players[p] = netState.players[p];
        }
    }

    // Ricostruisce la griglia vuota della stessa forma
    grid.clear();
    if (totalPlayers >= 3) {
        const RQ = GRID_RADIUS;
        const RR = Math.round(GRID_RADIUS * 0.85);
        for (let r = -RR; r <= RR; r++) {
            const qOffset = Math.floor(r / 2);
            for (let q = -RQ - qOffset; q <= RQ - qOffset; q++) {
                grid.set(getKey(q, r), { type: 'empty', q, r, entity: null, hp: 0, maxHp: 0 });
            }
        }
    } else {
        for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
            for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
                if (Math.abs(q + r) <= GRID_RADIUS)
                    grid.set(getKey(q, r), { type: 'empty', q, r, entity: null, hp: 0, maxHp: 0 });
            }
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

    // Piazza entità
    for (let f = 1; f <= totalPlayers; f++) {
        if (players[f]?.hq)     placeEntityAt(players[f].hq, players[f].hq.q, players[f].hq.r);
        if (players[f]?.agents) players[f].agents.forEach(a => placeEntityAt(a, a.q, a.r));
    }
}
