/* ============================================================
   map.js — Generazione procedurale della mappa e posizionamento entità
   ============================================================ */

function generateProceduralMap() {
    grid.clear();
    for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
        for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
            if (Math.abs(q + r) <= GRID_RADIUS) grid.set(getKey(q, r), { type: 'empty', q, r, entity: null, hp: 0, maxHp: 0 });
        }
    }

    // 4 posizioni HQ negli angoli della mappa esagonale
    const allHqPositions = [
        { q: -GRID_RADIUS + 1, r: GRID_RADIUS - 1 },  // angolo basso-sinistra  (P1 Verde)
        { q: GRID_RADIUS - 1,  r: -GRID_RADIUS + 1 }, // angolo alto-destra     (P2 Viola)
        { q: GRID_RADIUS - 1,  r: 0 },                // lato destro            (P3 Blu)
        { q: -GRID_RADIUS + 1, r: 0 }                 // lato sinistro          (P4 Oro)
    ];
    const hqPositions = allHqPositions.slice(0, totalPlayers);

    hqPositions.forEach((pos, i) => {
        placeEntityAt(createHQ(i + 1), pos.q, pos.r);
    });

    grid.forEach(cell => {
        if (cell.type === 'empty' && !cell.entity) {
            const farFromAll = hqPositions.every(hq => hexDistance(cell, hq) > 2);
            if (farFromAll && Math.random() < 0.18) {
                cell.type = 'wall'; let randomHp = Math.floor(Math.random() * 6) + 5;
                cell.hp = randomHp; cell.maxHp = randomHp;
                cell.sprite = getRandomSprite(SPRITE_POOLS.walls);
                cell.customSpriteId = 'OB' + (Math.floor(Math.random() * 18) + 1);
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
    // Supporta sia il vecchio formato {p1,p2} sia il nuovo {players:{1:..,2:..,3:..,4:..}}
    if (netState.players) {
        totalPlayers = netState.totalPlayers || 2;
        for (let p = 1; p <= totalPlayers; p++) {
            if (netState.players[p]) players[p] = netState.players[p];
        }
    } else {
        players[1] = netState.p1; players[2] = netState.p2; totalPlayers = 2;
    }

    grid.clear();
    for (let q = -GRID_RADIUS; q <= GRID_RADIUS; q++) {
        for (let r = -GRID_RADIUS; r <= GRID_RADIUS; r++) {
            if (Math.abs(q + r) <= GRID_RADIUS) grid.set(getKey(q, r), { type: 'empty', q, r, entity: null, hp: 0, maxHp: 0 });
        }
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
