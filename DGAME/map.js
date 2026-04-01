/* ============================================================
   map.js — Generazione procedurale e Sincronizzazione Tema
   ============================================================ */

function generateProceduralMap() {
    grid.clear();
    for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
        for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
            if (Math.abs(q + r) <= GRID_RADIUS) grid.set(getKey(q, r), { type: 'empty', q, r, entity: null, hp: 0, maxHp: 0 });
        }
    }

    const allHqPositions = [
        { q: -GRID_RADIUS + 1, r: GRID_RADIUS - 1 }, { q: GRID_RADIUS - 1, r: -GRID_RADIUS + 1 },
        { q: GRID_RADIUS - 1, r: 0 }, { q: -GRID_RADIUS + 1, r: 0 }
    ];
    const hqPositions = allHqPositions.slice(0, totalPlayers);
    hqPositions.forEach((pos, i) => { placeEntityAt(createHQ(i + 1), pos.q, pos.r); });

    // GENERAZIONE MURI CON TEMA DINAMICO
    grid.forEach(cell => {
        if (cell.type === 'empty' && !cell.entity) {
            const farFromAll = hqPositions.every(hq => hexDistance(cell, hq) > 2);
            if (farFromAll && Math.random() < 0.18) {
                cell.type = 'wall';
                let randomHp = Math.floor(Math.random() * 6) + 5;
                cell.hp = randomHp; cell.maxHp = randomHp;
                cell.sprite = getRandomSprite(SPRITE_POOLS.walls);
                
                // Selezione sprite basata sul tema corrente
                const randomId = Math.floor(Math.random() * THEME_WALL_COUNT) + 1;
                cell.customSpriteId = THEME_WALL_PREFIX + randomId;
            }
        }
    });

    hqPositions.forEach((pos, i) => placePlayerAgents(i + 1, pos));
}

function createHQ(faction) {
    const hq = { id: `hq_${faction}`, type: 'hq', faction, sprite: SPRITE_POOLS.hqs[faction-1], customSpriteId: 'HQ' + faction, hp: 20, maxHp: 20, q:0, r:0 };
    players[faction].hq = hq; return hq;
}

function placeEntityAt(entity, q, r) {
    const cell = grid.get(getKey(q, r));
    if (cell) { cell.entity = entity; entity.q = q; entity.r = r; }
}

function placePlayerAgents(faction, hqPos) {
    const agents = players[faction].agents; const availableCells = [];
    hexDirections.forEach(dir => {
        for(let d=1; d<=2; d++) {
            let cell = grid.get(getKey(hqPos.q + dir.q*d, hqPos.r + dir.r*d));
            if(cell && cell.type === 'empty' && !cell.entity) availableCells.push(cell);
        }
    });
    shuffleArray(availableCells); availableCells.sort((a, b) => a.q !== b.q ? a.q - b.q : a.r - b.r); shuffleArray(availableCells);
    agents.forEach((agent, i) => { if (i < availableCells.length) placeEntityAt(agent, availableCells[i].q, availableCells[i].r); });
}

function receiveGameState(netState) {
    // SINCRONIZZAZIONE TEMA CLIENT
    if (netState.theme) {
        applyTheme({
            id: netState.theme.id,
            prefix: netState.theme.prefix,
            count: netState.theme.count,
            path: 'img/' + netState.theme.path
        });
    }

    if (netState.players) {
        totalPlayers = netState.totalPlayers || 2;
        for (let p = 1; p <= totalPlayers; p++) { if (netState.players[p]) players[p] = netState.players[p]; }
    }

    grid.clear();
    for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
        for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) { if (Math.abs(q + r) <= GRID_RADIUS) grid.set(getKey(q, r), { type: 'empty', q, r, entity: null, hp: 0, maxHp: 0 }); }
    }

    netState.walls.forEach(w => {
        let cell = grid.get(getKey(w.q, w.r));
        if (cell) { cell.type = w.type; cell.hp = w.hp; cell.maxHp = w.maxHp; cell.sprite = w.sprite; cell.customSpriteId = w.customSpriteId; }
    });

    for (let f = 1; f <= totalPlayers; f++) {
        if (players[f] && players[f].hq) placeEntityAt(players[f].hq, players[f].hq.q, players[f].hq.r);
        if (players[f] && players[f].agents) players[f].agents.forEach(a => placeEntityAt(a, a.q, a.r));
    }
}