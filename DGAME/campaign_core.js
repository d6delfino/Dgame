/* ============================================================
   campaign_core.js  —  CAMPAGNA: LOGICA + SETTORI + BATTAGLIE
   ============================================================
   Sostituisce: campaign.js, campaign_sectors.js, campaign_battles.js
   Dipende da : constants.js, state.js, graphics.js, map.js,
                network_core.js, setup.js, main.js
   ============================================================ */

// ============================================================
// COSTANTI MAPPA
// ============================================================

window.GRID_COLS = 9;
window.GRID_ROWS = 7;
window.HEX_SIZE  = 70;

const CAMPAIGN_HQ_POSITIONS = {
    2: [0, 54],
    3: [0, 54, 62],
    4: [0, 54, 62, 8],
};

const SECTOR_SPECIALIZATIONS = [
    { id: 'FORTEZZA',  label: '🏰 Fortezza',  desc: 'Difesa: usa anche i crediti dei settori adiacenti' },
    { id: 'ARSENALE',  label: '⚔️ Arsenale',  desc: 'I tuoi agenti partono con +1 Danno' },
    { id: 'FORGIA',    label: '🛡️ Forgia',    desc: 'I tuoi agenti partono con +1 Vita' },
    { id: 'TRASPORTI', label: '🚀 Trasporti', desc: 'Mobilità: puoi attaccare settori a distanza 4' },
    { id: 'ESPLOSIONE',label: '💥 Esplosione',desc: 'Sabotaggio: Distruggi i crediti di un settore nemico adiacente (Costo: 30💰)' },
];
window.SECTOR_SPECIALIZATIONS = SECTOR_SPECIALIZATIONS;

let mapScale = 1;
let mapOffsetX = 0;
let mapOffsetY = 0;
let lastTouchDist = 0;
let isPanning = false;
let startTouchX = 0;
let startTouchY = 0;
let hasMovedSignificantly = false;

// ============================================================
// STATO CAMPAGNA
// ============================================================

window.campaignState = {
    isActive:    false,
    numPlayers:  4,
    currentPlayer: 1,
    credits:     {},
    victoryThreshold: 32,
    phase:       'PLANNING',
    pendingMoves:  {},
    pendingOrders: {},
    sectorCredits: {},
    pendingAllocation: null,
    _allOrderedSectors: {},
    _currentBattle: null,
    battleQueue:   [],
    currentBattleParticipants: [],
    targetSector:  null,
    turnCount:     1,
    sectors:       [],
    adj:           {},
    _hasReceivedFirstIncome: {},
};

// ============================================================
// GENERAZIONE GRIGLIA
// ============================================================

function _initGrid() {
    const s = [], a = {}, matrix = [];
    let id = 0;
    
    // Calcolo distanze perfette per esagoni "Pointy Top"
    const horizDist = window.HEX_SIZE * Math.sqrt(3); // Distanza orizzontale tra colonne
    const vertDist  = window.HEX_SIZE * 1.5;         // Distanza verticale tra righe

    for (let r = 0; r < GRID_ROWS; r++) {
        matrix[r] = [];
        for (let c = 0; c < GRID_COLS; c++) {
            // Offset orizzontale: le righe dispari sono spostate di mezza larghezza esagono
            const xOffset = (r % 2 === 1) ? (horizDist / 2) : 0;
            const x = 60 + (c * horizDist) + xOffset;
            const y = 60 + (r * vertDist);
            
            matrix[r][c] = id;
            s.push({ id: id++, row: r, col: c, x, y, owner: 0, blocked: false });
        }
    }

    // Calcolo dei vicini (immutato per logica, ma integrato correttamente)
    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            const cid = matrix[r][c];
            a[cid] = [];
            const neighbors = (r % 2 === 0)
                ? [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1]]
                : [[0,-1],[0,1],[-1,0],[1,0],[-1,1],[1,1]];
            neighbors.forEach(([dr, dc]) => {
                const nr = r + dr, nc = c + dc;
                if (matrix[nr] && matrix[nr][nc] !== undefined) a[cid].push(matrix[nr][nc]);
            });
        }
    }
    campaignState.sectors = s;
    campaignState.adj     = a;
}
_initGrid();

// ============================================================
// AVVIO CAMPAGNA
// ============================================================

function startCampaign(numPlayers) {
    numPlayers = numPlayers || 4;
    window.state = 'CAMPAIGN_MAP';

    ['setup-overlay','controls-panel','network-menu'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    Object.assign(campaignState, {
        isActive:    true,
        numPlayers:  numPlayers,
        currentPlayer: 1,
        phase:       'PLANNING',
        turnCount:   1,
        credits:     {},
        pendingMoves:  {},
        pendingOrders: {},
        sectorCredits: {},
        pendingAllocation: null,
        _allOrderedSectors: {},
        _currentBattle: null,
        battleQueue:   [],
        victoryThreshold: Math.floor(campaignState.sectors.length / 2) + 1,
    });

    // Forza le referenze in base allo stato online globale
    if (window.isCampaignOnline) {
        window.totalPlayers = numPlayers;
    }

    for (let p = 1; p <= numPlayers; p++) campaignState.credits[p] = 10;

    campaignState.sectors.forEach(s => {
        s.owner = 0;
        s.blocked = false;
        s.income = undefined;
        s.specialization = undefined;
    });

    const hqSlots = CAMPAIGN_HQ_POSITIONS[numPlayers] || CAMPAIGN_HQ_POSITIONS[4];
    hqSlots.forEach((sid, idx) => {
        if (campaignState.sectors[sid]) campaignState.sectors[sid].owner = idx + 1;
    });

    _generateBlockedSectors(hqSlots);
    _initSectorProperties();
    renderCampaignMap();

    // FIX CRITICO: In campagna online l'host fa broadcast immediato per sbloccare i client
    if (window.isCampaignOnline && window.isHost) {
        console.log("[Campaign] Host detected, broadcasting initial state...");
        setTimeout(() => {
            if (typeof _net_hostBroadcast === 'function') {
                _net_hostBroadcast();
            }
        }, 500);
    }
}
window.startCampaign = startCampaign;

// ============================================================
// SETTORI BLOCCATI
// ============================================================

function _generateBlockedSectors(hqSlots) {
    const hqSet = new Set(hqSlots);
    const totalToBlock = 12;
    const blocked = new Set();

    let candidates = campaignState.sectors.map(s => s.id).filter(id => !hqSet.has(id));
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    for (const id of candidates) {
        if (blocked.size >= totalToBlock) break;
        blocked.add(id);
        if (_mapIsFullyConnected(hqSlots, blocked)) {
            campaignState.sectors[id].blocked = true;
        } else {
            blocked.delete(id);
        }
    }
}

function _mapIsFullyConnected(hqSlots, blockedSet) {
    const total = campaignState.sectors.length - blockedSet.size;
    const visited = new Set([hqSlots[0]]);
    const queue = [hqSlots[0]];
    while (queue.length > 0) {
        const curr = queue.shift();
        for (const nb of (campaignState.adj[curr] || [])) {
            if (!visited.has(nb) && !blockedSet.has(nb)) {
                visited.add(nb); queue.push(nb);
            }
        }
    }
    return visited.size === total;
}

// ============================================================
// PROPRIETÀ SETTORI (rendita + specializzazioni)
// ============================================================

function _initSectorProperties() {
    const hqSlots = CAMPAIGN_HQ_POSITIONS[campaignState.numPlayers] || CAMPAIGN_HQ_POSITIONS[4];
    const hqSet   = new Set(hqSlots);

    campaignState.sectors.forEach(s => {
        s.specialization = null;
        if (!campaignState.sectorCredits[s.id]) campaignState.sectorCredits[s.id] = {};
        s.income = hqSet.has(s.id) ? 4 : 1 + Math.floor(Math.random() * 1);
    });

    function getDist(idA, idB) {
        if (idA === idB) return 0;
        const queue = [{id: idA, d: 0}], visited = new Set([idA]);
        while (queue.length) {
            const curr = queue.shift();
            if (curr.id === idB) return curr.d;
            for (const nb of (campaignState.adj[curr.id] || [])) {
                if (!visited.has(nb)) { visited.add(nb); queue.push({id: nb, d: curr.d + 1}); }
            }
        }
        return 99;
    }

    const midR = Math.floor(GRID_ROWS / 2), midC = Math.floor(GRID_COLS / 2);
    const quadrants = [
        campaignState.sectors.filter(s => s.row < midR && s.col < midC).map(s => s.id),
        campaignState.sectors.filter(s => s.row < midR && s.col >= midC).map(s => s.id),
        campaignState.sectors.filter(s => s.row >= midR && s.col < midC).map(s => s.id),
        campaignState.sectors.filter(s => s.row >= midR && s.col >= midC).map(s => s.id),
    ];

    const specs = ['FORTEZZA','ARSENALE','FORGIA','TRASPORTI','ESPLOSIONE'].sort(() => Math.random() - 0.5);
    const finalSelection = [];

    quadrants.forEach((quad, idx) => {
        let candidates = quad.filter(id => {
            const s = campaignState.sectors[id];
            return s && !s.blocked && !hqSet.has(id) && hqSlots.every(hqId => getDist(id, hqId) >= 3);
        }).sort(() => Math.random() - 0.5);

        const picked = candidates.find(cid => !finalSelection.some(sel => getDist(cid, sel) < 2)) || candidates[0];
        if (picked !== undefined && specs[idx]) {
            finalSelection.push(picked);
            campaignState.sectors[picked].specialization = specs[idx];
        }
    });
}

// ============================================================
// RENDERING MAPPA CAMPAGNA (desktop SVG)
// ============================================================

function renderCampaignMap() {
    const overlay = document.getElementById('campaign-overlay');
    overlay.style.cssText = `
    display:block; position:fixed; top:0; left:0; width:100%; height:100%;
    overflow:hidden; z-index:100000; font-family:'Courier New',monospace;
    background-color:#020205; 
    `;

    const n = campaignState.numPlayers;
    const currP = campaignState.currentPlayer;
    const pColor = COLORS['p' + currP];

    if (campaignState.pendingOrders[currP]?.length > 0) {
        const last = campaignState.pendingOrders[currP][campaignState.pendingOrders[currP].length - 1];
        campaignState.pendingMoves[currP] = last.sectorId;
    }

    let creditsHtml = '';
    for (let p = 1; p <= n; p++) {
        const c = COLORS['p' + p];
        const isEliminated = !campaignState.sectors.some(s => s.owner === p);
        const ownedCnt = campaignState.sectors.filter(s => s.owner === p).length;
        
        // Ogni riga rappresenta un giocatore
        creditsHtml += `
            <div style="color:${c}; margin-bottom:4px; font-weight:bold; font-size:14px; 
                        display:flex; flex-direction:row; align-items:center; gap:10px; 
                        background:rgba(0,0,0,0.75); padding:6px 12px; border-left:4px solid ${c}; 
                        border-radius:0 6px 6px 0; text-shadow:1px 1px 2px #000;
                        white-space:nowrap; pointer-events:auto; ${isEliminated ? 'opacity:0.3;' : ''}">
                
                <!-- Nome Giocatore (troncato se troppo lungo) -->
                <span style="min-width:70px; max-width:100px; overflow:hidden; text-overflow:ellipsis;">
                    ${players[p]?.name || 'P' + p}
                </span>

                <!-- Crediti -->
                <span style="color:#FFD700; display:flex; align-items:center; gap:2px;">
                    💰${campaignState.credits[p]}
                </span>

                <!-- Settori Posseduti -->
                <span style="color:#fff; opacity:0.9; display:flex; align-items:center; gap:2px;">
                    🏴${ownedCnt}
                </span>
            </div>`;
    }

    const phaseLabel = campaignState.phase === 'PLANNING'
        ? `<div style="color:#FFD700; font-size:14px; margin-bottom:5px;">ROUND ${campaignState.turnCount}</div>
           <div style="color:${pColor}; font-weight:bold; text-shadow:0 0 10px ${pColor}">TURNO: ${(players[currP]?.name || 'P' + currP).toUpperCase()}</div>`
        : `<div style="color:#FFD700;">ROUND ${campaignState.turnCount}</div><div style="color:#fff;">RISOLUZIONE...</div>`;

    overlay.innerHTML = `
        <div style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.3); z-index:0; pointer-events:none;"></div>
        <div style="position:absolute; top:5px; left:0; z-index:100; pointer-events:none; display:flex; flex-direction:column;">
            <div style="margin-bottom:5px; padding-left:10px; pointer-events:auto;">${creditsHtml}</div>
            <div style="background:rgba(0,0,0,0.8); padding:10px 15px; border-radius:0 10px 10px 0; border:1px solid rgba(255,255,255,0.1); border-left:none; pointer-events:auto;">${phaseLabel}</div>
        </div>
        <div style="position:absolute; top:5px; right:5px; z-index:100001; display:flex; flex-direction:column; gap:5px; align-items:flex-end;">
            <button id="campaign-info-btn" style="background:rgba(0,0,0,0.8); color:#00ff88; border:1px solid #00ff88; padding:10px 20px; cursor:pointer; font-family:'Courier New'; font-weight:bold; border-radius:5px; font-size:14px;">ⓘ INFO</button>
            <button id="camp-music-btn" style="background:rgba(0,0,0,0.8); color:#fff; border:1px solid #555; padding:8px 18px; cursor:pointer; font-family:'Courier New'; font-size:12px; border-radius:5px;">🎵 MUSICA</button>
            <button id="camp-reset-zoom" style="background:rgba(0,0,0,0.8); color:#aaa; border:1px solid #555; padding:6px 12px; cursor:pointer; font-family:'Courier New'; font-size:10px; border-radius:3px;">RESET ZOOM</button>
        </div>
        <div id="map-area" style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; z-index:2; overflow:hidden; touch-action:none; cursor:grab;">
            <svg id="map-svg" viewBox="0 0 1000 750" style="width:98vw; height:95vh; overflow:visible; transition: transform 0.05s linear; transform-origin: center; will-change: transform;" preserveAspectRatio="xMidYMid meet"></svg>
        </div>
        <div id="campaign-actions" style="position:absolute; bottom:30px; left:25px; z-index:100; display:flex; flex-direction:column; align-items:flex-start; gap:12px; pointer-events:none;"></div>
    `;

    const musicBtn = document.getElementById('camp-music-btn');
    const isMuted = (typeof bgMusic !== 'undefined' && bgMusic.muted) || !musicPlaying;
    musicBtn.style.color = isMuted ? '#ff4444' : '#00ff88';
    musicBtn.onclick = () => { if (typeof toggleMusic === 'function') { toggleMusic(); renderCampaignMap(); } };
    document.getElementById('campaign-info-btn').onclick = e => { e.stopPropagation(); showCampaignInfoModal(); };

    _renderMapSVG();
    
    if (campaignState.phase === 'PLANNING') {
        const actDiv = document.getElementById('campaign-actions');
        const hasOrder = (campaignState.pendingMoves[currP] !== undefined);
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'action-btn';
        confirmBtn.style.cssText = `border:3px solid ${pColor}; color:${pColor}; background:rgba(0,0,0,0.9); pointer-events:auto; font-size:20px; padding:15px 40px; cursor:pointer; font-weight:bold; box-shadow:0 0 20px ${pColor}55; border-radius:8px; min-width:250px; text-align:center;`;
        confirmBtn.innerText = 'CONFERMA ORDINE';
        confirmBtn.disabled = !hasOrder;
        confirmBtn.onclick = () => finishPlayerTurn();
        actDiv.appendChild(confirmBtn);
        const skipBtn = document.createElement('button');
        skipBtn.className = 'action-btn';
        skipBtn.style.cssText = `border:1px solid #555; color:#888; background:rgba(0,0,0,0.8); pointer-events:auto; font-size:14px; padding:8px 20px; cursor:pointer; border-radius:6px; min-width:120px; text-align:center;`;
        skipBtn.innerText = 'PASSA TURNO';
        skipBtn.onclick = () => skipPlayerTurn();
        actDiv.appendChild(skipBtn);
    }

    _decorateSectors();
    if (window.isCampaignOnline) _net_applyTurnState();

    // --- AGGIUNTA LOGICA ZOOM (ORA DENTRO LA FUNZIONE) ---
    const mapArea = document.getElementById('map-area');
    const mapSvg = document.getElementById('map-svg');
    if (mapArea && mapSvg) {
        const updateMapTransform = () => {
            // Calcolo del limite dinamico: stretto a zoom 1x, largo quando zoomato
            const limitX = 150 + (mapScale - 1) * 350;
            const limitY = 100 + (mapScale - 1) * 250;
            
            // Applica il "muro" (clamping) alle coordinate di panning
            mapOffsetX = Math.max(-limitX, Math.min(limitX, mapOffsetX));
            mapOffsetY = Math.max(-limitY, Math.min(limitY, mapOffsetY));

            mapSvg.style.transform = `translate(${mapOffsetX}px, ${mapOffsetY}px) scale(${mapScale})`;
        };
        updateMapTransform(); // Applica lo stato attuale subito

        mapArea.addEventListener('touchstart', (e) => {
            hasMovedSignificantly = false;
            if (e.touches.length === 1) {
                isPanning = true;
                startTouchX = e.touches[0].clientX - mapOffsetX;
                startTouchY = e.touches[0].clientY - mapOffsetY;
            } else if (e.touches.length === 2) {
                isPanning = false;
                lastTouchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            }
        }, { passive: false });

        mapArea.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 1 && isPanning) {
                const dx = e.touches[0].clientX - startTouchX;
                const dy = e.touches[0].clientY - startTouchY;
                if (Math.abs(dx - mapOffsetX) > 5 || Math.abs(dy - mapOffsetY) > 5) hasMovedSignificantly = true;
                
                mapOffsetX = dx; 
                mapOffsetY = dy;
                updateMapTransform();
                
                // Anti-Sticking: riallinea il punto di partenza del tocco se abbiamo sbattuto contro il muro
                startTouchX = e.touches[0].clientX - mapOffsetX;
                startTouchY = e.touches[0].clientY - mapOffsetY;
            } else if (e.touches.length === 2) {
                const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                const delta = dist / lastTouchDist;
                mapScale = Math.min(Math.max(1, mapScale * delta), 4);
                lastTouchDist = dist;
                hasMovedSignificantly = true;
                updateMapTransform();
            }
        }, { passive: false });

        mapArea.addEventListener('touchend', () => { isPanning = false; }, { passive: false });

        mapArea.onwheel = (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 0.9 : 1.1;
            mapScale = Math.min(Math.max(1, mapScale * delta), 4);
            updateMapTransform();
        };

        document.getElementById('camp-reset-zoom').onclick = () => {
            mapScale = 1; mapOffsetX = 0; mapOffsetY = 0;
            updateMapTransform();
        };
    }
}
window.renderCampaignMap = renderCampaignMap;


function _renderMapSVG() {
    const svg  = document.getElementById('map-svg');
    if (!svg) return;
    svg.innerHTML = ''; // Pulisce prima di ridisegnare
    
    // --- AGGIUNTA SFONDO ANCORATO ---
    const bgImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    bgImage.setAttributeNS(null, 'href', 'img/sfondocamp1.png');
    
    // Posizioniamo lo sfondo in modo che copra ampiamente l'area di gioco
    // Usiamo coordinate negative per assicurarci che copra i bordi durante il pan
    bgImage.setAttributeNS(null, 'x', '-260');    // Spostamento orizzontale (meno negativo = più a destra)
    bgImage.setAttributeNS(null, 'y', '-50');    // Spostamento verticale (meno negativo = più in basso)
    bgImage.setAttributeNS(null, 'width', '1500'); // Larghezza (più vicina a 1000 = sfondo più piccolo)
    bgImage.setAttributeNS(null, 'height', '850'); // Altezza (più vicina a 750 = sfondo più piccolo)
    
    bgImage.setAttributeNS(null, 'preserveAspectRatio', 'xMidYMid slice');
    bgImage.style.pointerEvents = 'none'; // Importante: non deve bloccare i click sui settori
    bgImage.style.opacity = '0.7'; // Opzionale: regola l'intensità dello sfondo
    svg.appendChild(bgImage);
    // --------------------------------

    const HEX_R = window.HEX_SIZE;
    const hqSet = new Set(CAMPAIGN_HQ_POSITIONS[campaignState.numPlayers] || []);

    // Funzione calcolo punti con raggio leggermente ridotto (0.97) per evitare sovrapposizioni visive dei bordi
    function hexPts(cx, cy) {
        let pts = '';
        const drawR = HEX_R * 0.97; // Un piccolo margine evita l'effetto accavallamento
        for (let i = 0; i < 6; i++) {
            const a = Math.PI / 180 * (60 * i - 30);
            pts += `${cx + drawR * Math.cos(a)},${cy + drawR * Math.sin(a)} `;
        }
        return pts.trim();
    }

    campaignState.sectors.forEach(s => {
        const cx = s.x, cy = s.y;
        const pts = hexPts(cx, cy);
        // ... (il resto della logica di creazione 'g', 'polygon', 'text' rimane uguale a prima)
        const isHQ = hqSet.has(s.id);
        const allT = campaignState._allOrderedSectors?.[s.id] || [];

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.style.cursor = s.blocked ? 'not-allowed' : 'pointer';

        if (s.blocked) {
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', pts);
            poly.setAttribute('fill', 'rgba(40,10,10,0.8)');
            poly.setAttribute('stroke', '#ff4444');
            poly.setAttribute('stroke-width', '1.5');
            g.appendChild(poly);
            const sL = HEX_R * 0.35;
            [[cx-sL,cy-sL,cx+sL,cy+sL],[cx+sL,cy-sL,cx-sL,cy+sL]].forEach(c => {
                const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                l.setAttribute('x1',c[0]); l.setAttribute('y1',c[1]);
                l.setAttribute('x2',c[2]); l.setAttribute('y2',c[3]);
                l.setAttribute('stroke','#ff4444'); l.setAttribute('stroke-width','2');
                g.appendChild(l);
            });
        } else {
            const ownerColor  = s.owner > 0 ? COLORS['p' + s.owner] : null;
            const strokeColor = allT.length > 0 ? (ownerColor || '#fff') : (ownerColor || 'rgba(180,210,255,0.8)');
            const strokeW     = allT.length > 0 ? 3 : (ownerColor ? 2 : 1);
            const fillColor   = ownerColor ? ownerColor + '44' : 'rgba(10,15,35,0.15)';

            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', pts);
            poly.setAttribute('fill', fillColor);
            poly.setAttribute('stroke', strokeColor);
            poly.setAttribute('stroke-width', strokeW);
            if (ownerColor) poly.style.filter = `drop-shadow(0 0 5px ${ownerColor})`;
            if (allT.length > 0) g.style.animation = 'campPulse 0.8s infinite alternate';
            g.appendChild(poly);

            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            txt.setAttribute('x', cx); txt.setAttribute('y', cy + 2);
            txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('dominant-baseline', 'middle');
            txt.setAttribute('font-family', 'Courier New'); txt.setAttribute('font-size', '24');
            txt.setAttribute('font-weight', 'bold'); txt.setAttribute('pointer-events', 'none');
            txt.setAttribute('fill', ownerColor ? '#ffffff' : '#e0e0e0');
            txt.setAttribute('fill-opacity', '0.5');
            txt.textContent = (isHQ && s.owner > 0) ? 'HQ' : s.id;
            g.appendChild(txt);

            if (allT.length > 0) {
                const dw = 18, dh = 9, gap = 2;
                const tot = allT.length * (dw + gap) - gap;
                allT.forEach((pid, i) => {
                    const dc = COLORS['p' + pid];
                    const rc = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    rc.setAttribute('x', cx - tot/2 + i*(dw+gap));
                    rc.setAttribute('y', cy - HEX_R * 0.55);
                    rc.setAttribute('width', dw); rc.setAttribute('height', dh); rc.setAttribute('rx', 2);
                    rc.setAttribute('fill', dc);
                    g.appendChild(rc);
                });
            }
        }
        g.onclick = () => handleSectorClick(s.id);
        svg.appendChild(g);
    });
}

// ============================================================
// DECORAZIONI ECONOMICHE (badge rendita, crediti settore, pallini)
// ============================================================

function _decorateSectors() {
    const svg = document.getElementById('map-svg');
    if (!svg) return;
    svg.querySelectorAll('.eco-badge').forEach(el => el.remove());

    const HEX_R = window.HEX_SIZE;
    const hqSet   = new Set(CAMPAIGN_HQ_POSITIONS[campaignState.numPlayers] || []);
    const p       = campaignState.currentPlayer;

    campaignState.sectors.forEach(s => {
        if (s.blocked) return;
        const cx = s.x, cy = s.y;
        const spec       = s.specialization ? SECTOR_SPECIALIZATIONS.find(sp => sp.id === s.specialization) : null;
        const alloc      = campaignState.sectorCredits[s.id]?.[s.owner] || 0;
        const allT       = campaignState._allOrderedSectors?.[s.id] || [];
        let isCurrP = s.owner === p && campaignState.phase === 'PLANNING';
            // Se siamo online, permetti di mostrare i pulsanti + e - SOLO se è effettivamente il tuo turno
            if (window.isCampaignOnline && p !== window.myPlayerNumber) {
            isCurrP = false; 
            }
        const ownerColor = s.owner > 0 ? COLORS['p' + s.owner] : null;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('eco-badge');

        // Rendita
        if (s.income !== undefined) {
            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            txt.setAttribute('x', cx); txt.setAttribute('y', cy - HEX_R * 0.65);
            txt.setAttribute('text-anchor','middle'); txt.setAttribute('dominant-baseline','middle');
            txt.setAttribute('font-family','Courier New'); txt.setAttribute('font-size','20');
            txt.setAttribute('font-weight','bold'); txt.setAttribute('fill','#FFD700');
            txt.setAttribute('pointer-events','none');
            txt.textContent = `+${s.income}`;
            g.appendChild(txt);
        }

        // Emoji specializzazione
        if (spec) {
            const emoji = spec.label.split(' ')[0];
            const etxt  = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            etxt.setAttribute('x', cx + 40); etxt.setAttribute('y', cy - 4);
            etxt.setAttribute('text-anchor','middle'); etxt.setAttribute('dominant-baseline','middle');
            etxt.setAttribute('font-size','35'); etxt.setAttribute('fill-opacity','0.95');
            etxt.setAttribute('pointer-events','none');
            etxt.textContent = emoji;
            g.appendChild(etxt);
        }

        // Bottoni allocazione crediti settore (+/−)
        if (s.owner > 0 && (isCurrP || alloc > 0)) {
            const allocY = cy + HEX_R * 0.25;
            if (isCurrP) {
                const fo = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
                fo.setAttribute('x', cx - 60); fo.setAttribute('y', allocY - 10);
                fo.setAttribute('width', '120'); fo.setAttribute('height', '40');
                fo.setAttribute('pointer-events', 'all');
                const div = document.createElement('div');
                div.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:1px;';
                const btnS = `background:rgba(0,0,0,0.9);border:1px solid ${ownerColor};color:${ownerColor};width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:18px;line-height:1;padding:0;font-weight:bold;`;
                const bMinus = document.createElement('button');
                bMinus.style.cssText = btnS; bMinus.textContent = '−';
                bMinus.onclick = e => { e.stopPropagation(); allocSectorCredit(s.id, -1); };
                const val = document.createElement('span');
                val.style.cssText = 'color:#ffffff;font-size:20px;font-weight:bold;font-family:Courier New;min-width:20px;text-align:center;text-shadow:0 0 3px #000;';
                val.textContent = `💼${alloc}`;
                const bPlus = document.createElement('button');
                bPlus.style.cssText = btnS; bPlus.textContent = '+';
                bPlus.onclick = e => { e.stopPropagation(); allocSectorCredit(s.id, +1); };
                div.appendChild(bMinus); div.appendChild(val); div.appendChild(bPlus);
                fo.appendChild(div); g.appendChild(fo);
            } else if (alloc > 0) {
                const atxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                atxt.setAttribute('x', cx); atxt.setAttribute('y', cy + HEX_R * 0.5);
                atxt.setAttribute('text-anchor','middle'); atxt.setAttribute('dominant-baseline','middle');
                atxt.setAttribute('font-family','Courier New'); atxt.setAttribute('font-size','20');
                atxt.setAttribute('font-weight','bold'); atxt.setAttribute('fill','#ffffff');
                atxt.setAttribute('pointer-events','none');
                atxt.textContent = `💼${alloc}`;
                g.appendChild(atxt);
            }
        }

        svg.appendChild(g);
    });
}

// ============================================================
// ALLOCAZIONE CREDITI SETTORE (+/−)
// ============================================================

function allocSectorCredit(sectorId, delta, fromNetPlayer = null) {
    // In campagna online: il client delega all'host
    if (window.isCampaignOnline && !window.isHost) {
        _net_clientSend(delta > 0 ? 'ADD_SECTOR_CREDIT' : 'REMOVE_SECTOR_CREDIT', { sectorId });
        return;
    }
    
    // Il giocatore bersaglio: se arriva da rete è fromNetPlayer, altrimenti è il currentPlayer
    const p = fromNetPlayer !== null ? fromNetPlayer : campaignState.currentPlayer;

    // SICUREZZA HOST: se l'host tenta un'esecuzione locale (fromNetPlayer === null) 
    // durante il turno di un client, blocca l'operazione.
    if (window.isCampaignOnline && window.isHost && fromNetPlayer === null) {
        if (p !== window.myPlayerNumber) return;
    }

    if (!campaignState.sectorCredits[sectorId]) campaignState.sectorCredits[sectorId] = {};
    if (delta > 0) {
        if (campaignState.credits[p] <= 0) return;
        campaignState.sectorCredits[sectorId][p] = (campaignState.sectorCredits[sectorId][p] || 0) + 1;
        campaignState.credits[p]--;
    } else {
        if ((campaignState.sectorCredits[sectorId][p] || 0) <= 0) return;
        campaignState.sectorCredits[sectorId][p]--;
        campaignState.credits[p]++;
    }
    renderCampaignMap();
    if (window.isCampaignOnline && window.isHost) _net_hostBroadcast();
}

// Alias usati dal codice mobile e da altri file
window._cn_allocAdd    = sectorId => allocSectorCredit(sectorId, +1);
window._cn_allocRemove = sectorId => allocSectorCredit(sectorId, -1);

// ============================================================
// CLICK SU SETTORE
// ============================================================

function handleSectorClick(targetId) {

    if (hasMovedSignificantly) {
        hasMovedSignificantly = false;
        return;
    }

    if (campaignState.phase !== 'PLANNING') return;
    const p = campaignState.currentPlayer;
    
    // Variabile sicura per verificare se siamo l'host
    const iamHost = (window.isHost === true);

    // In campagna online: i client delegano all'host
    if (window.isCampaignOnline && !iamHost) {
        if (campaignState.currentPlayer !== window.myPlayerNumber) {
            showTemporaryMessage('Non è il tuo turno!'); 
            return;
        }
        if (typeof _net_clientSend === 'function') {
            _net_clientSend('SECTOR_CLICK', { sectorId: targetId });
        }
        return;
    }

    // Blocca clic se non è il mio turno (host online)
    if (window.isCampaignOnline && iamHost && campaignState.currentPlayer !== window.myPlayerNumber) {
        showTemporaryMessage('Non è il tuo turno!'); 
        return;
    }

    const target = campaignState.sectors[targetId];
    if (target.blocked) { showTemporaryMessage('Settore inagibile — zona di esclusione!'); return; }
    if (target.owner === p) { showTemporaryMessage('Controlli già questo settore!'); return; }

    if (!_isSectorReachable(targetId, p)) {
        const hasTrasporti = campaignState.sectors.some(s => s.owner === p && s.specialization === 'TRASPORTI');
        showTemporaryMessage(`Settore troppo lontano! Gittata massima: ${hasTrasporti ? 4 : 2} esagoni.`);
        if (typeof playSFX === 'function') playSFX('click'); 
        return;
    }

    const orders   = campaignState.pendingOrders[p] || [];
    const existing = orders.find(o => o.sectorId === targetId);
    if (existing) {
        campaignState.pendingOrders[p] = orders.filter(o => o.sectorId !== targetId);
        campaignState.credits[p] += existing.credits;
        delete campaignState.pendingMoves[p];
        renderCampaignMap();
        if (window.isCampaignOnline && iamHost) {
            if (typeof _net_hostBroadcast === 'function') _net_hostBroadcast();
        }
        return;
    }

    if (typeof playSFX === 'function') playSFX('click');
    showCreditSelector(p, targetId);
}
window.handleSectorClick = handleSectorClick;

function _isSectorReachable(targetId, p) {
    const hasTrasporti = campaignState.sectors.some(s => s.owner === p && s.specialization === 'TRASPORTI');
    if (campaignState.adj[targetId].some(id => campaignState.sectors[id].owner === p)) return true;
    const isDist2 = campaignState.adj[targetId].some(nb => {
        if (campaignState.sectors[nb].blocked) return false;
        return campaignState.adj[nb].some(id2 => campaignState.sectors[id2].owner === p);
    });
    if (isDist2) return true;
    if (!hasTrasporti) return false;
    // Distanze 3 e 4
    for (const nb1 of campaignState.adj[targetId]) {
        if (campaignState.sectors[nb1].blocked) continue;
        for (const nb2 of campaignState.adj[nb1]) {
            if (campaignState.sectors[nb2].blocked) continue;
            if (campaignState.adj[nb2].some(id => campaignState.sectors[id].owner === p)) return true;
            for (const nb3 of campaignState.adj[nb2]) {
                if (campaignState.sectors[nb3].blocked) continue;
                if (campaignState.adj[nb3].some(id => campaignState.sectors[id].owner === p)) return true;
            }
        }
    }
    return false;
}

// ============================================================
// UI: SELETTORE CREDITI
// ============================================================

function showCreditSelector(playerFaction, targetSectorId) {
    const avail   = campaignState.credits[playerFaction] || 0;
    const minCost = 4;
    const sector  = campaignState.sectors[targetSectorId];
    const defCredits = sector.owner > 0 ? (campaignState.sectorCredits[targetSectorId]?.[sector.owner] || 0) : 0;
    const pColor  = COLORS['p' + playerFaction];
    const pName   = players[playerFaction]?.name || 'P' + playerFaction;

    const hasExplosion = campaignState.sectors.some(s => s.owner === playerFaction && s.specialization === 'ESPLOSIONE');
    const canSabotage  = hasExplosion && sector.owner > 0 && sector.owner !== playerFaction && defCredits > 0 && avail >= 30;

    const spec    = sector.specialization ? SECTOR_SPECIALIZATIONS.find(s => s.id === sector.specialization) : null;
    const defLine = sector.owner > 0
        ? `<div style="color:#aaa;font-size:24px;margin-top:15px;">Difensore: 🏦 ${defCredits} crediti allocati</div>`
        : `<div style="color:#888;font-size:24px;margin-top:15px;">Settore Neutro</div>`;
    const specLine = spec
        ? `<div style="color:#FFD700;font-size:24px;margin-top:15px;">${spec.label} — ${spec.desc}</div>` : '';
    const sabHtml = canSabotage
        ? `<button class="action-btn" id="eco-sabotage-btn"
               style="border:3px solid #ff4444;color:#ff4444;padding:25px 40px;font-size:32px;font-weight:bold;background:rgba(255,0,0,0.1);cursor:pointer;">
               SABOTAGGIO 💥 (30💰)
           </button>` : '';

    const modal = document.createElement('div');
    modal.id = 'eco-credit-modal';
    modal.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.92); z-index:999999;
        display:flex; align-items:center; justify-content:center; font-family:Courier New; padding:10px; box-sizing:border-box;`;
    
    modal.innerHTML = `
        <div style="background:rgba(5,10,20,0.98); border:4px solid ${pColor}; border-radius:15px;
                    padding:20px; width:100%; max-width:600px; max-height:95vh; overflow-y:auto; 
                    text-align:center; box-shadow:0 0 40px rgba(0,0,0,1); box-sizing:border-box;">
            
            <h1 style="color:${pColor}; margin:0 0 10px; font-size:clamp(24px, 6vw, 40px); letter-spacing:2px; text-transform:uppercase;">ORDINE ATTACCO</h1>
            <div style="color:#fff; font-size:clamp(16px, 4vw, 24px); margin-bottom:5px; font-weight:bold;">${pName} → Settore ${targetSectorId}</div>
            
            <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; margin:10px 0;">
                ${defLine}
                ${specLine}
            </div>

            <div style="color:#aaa; font-size:18px; margin:15px 0 5px;">
                In Banca: <span style="color:#FFD700; font-weight:bold;">${avail}💰</span>
            </div>
            
            <div style="color:#fff; font-size:20px; margin-bottom:10px;">
                Investimento: <br>
                <span id="eco-credit-val" style="color:#00ff88; font-size:48px; font-weight:bold; text-shadow:0 0-15px #00ff88;">${Math.min(minCost, avail)}</span>
            </div>

            <input type="range" id="eco-credit-slider"
                min="${Math.min(minCost, avail)}" max="${avail}" value="${Math.min(minCost, avail)}" step="1"
                style="width:100%; height:30px; cursor:pointer; accent-color:${pColor}; margin-bottom:25px;">

            <div style="display:flex; gap:10px; flex-direction:column; align-items:stretch;">
                <button class="action-btn" id="eco-confirm-order"
                    style="border:3px solid ${pColor}; color:${pColor}; padding:15px; font-size:22px; font-weight:bold; background:rgba(0,0,0,0.5); cursor:pointer; border-radius:8px;">
                    INVIA ORDINE ✓
                </button>
                ${sabHtml}
                <button class="action-btn"
                    style="border:2px solid #666; color:#888; padding:10px; font-size:18px; background:transparent; cursor:pointer; border-radius:8px;"
                    onclick="document.getElementById('eco-credit-modal').remove();">
                    ANNULLA
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const slider  = modal.querySelector('#eco-credit-slider');
    const valDisp = modal.querySelector('#eco-credit-val');
    if (avail < minCost) {
        valDisp.style.color = '#ff4444';
        const cb = modal.querySelector('#eco-confirm-order');
        cb.disabled = true; cb.style.opacity = '0.3'; cb.style.cursor = 'not-allowed';
    }
    slider.oninput = () => { valDisp.textContent = slider.value; };

    modal.querySelector('#eco-confirm-order').onclick = () => {
        const chosen = parseInt(slider.value);
        modal.remove();
        // Online client: manda all'host
        if (window.isCampaignOnline && !window.isHost) {
            _net_clientSend('CONFIRM_CREDIT_ORDER', { sectorId: targetSectorId, credits: chosen });
            return;
        }
        _applyOrderWithCredits(targetSectorId, chosen, playerFaction);
        renderCampaignMap();
        if (window.isCampaignOnline && window.isHost) _net_hostBroadcast();
    };

    if (canSabotage) {
        modal.querySelector('#eco-sabotage-btn').onclick = () => {
            const confirmMsg = `SABOTAGGIO 💥\n\nStai per azzerare i ${defCredits} crediti nemici nel Settore ${targetSectorId}.\nCosto: 30 crediti.\n\nProcedere?`;
            if (confirm(confirmMsg)) {
                modal.remove();
                if (window.isCampaignOnline && !window.isHost) {
                    _net_clientSend('SABOTAGE', { sectorId: targetSectorId }); return;
                }
                campaignState.credits[playerFaction] -= 30;
                campaignState.sectorCredits[targetSectorId][sector.owner] = 0;
                playSFX('click');
                showTemporaryMessage('BOOM! Difese nemiche nel settore ' + targetSectorId + ' neutralizzate!');
                renderCampaignMap();
                if (window.isCampaignOnline && window.isHost) _net_hostBroadcast();
            }
        };
    }
}
window.showCreditSelector = showCreditSelector;

function _applyOrderWithCredits(sectorId, credits, playerFaction) {
    const avail = campaignState.credits[playerFaction] || 0;
    if (credits > avail) return;
    campaignState.credits[playerFaction] -= credits;
    if (!campaignState.pendingOrders[playerFaction]) campaignState.pendingOrders[playerFaction] = [];
    campaignState.pendingOrders[playerFaction].push({ sectorId, credits });
    campaignState.pendingMoves[playerFaction] = sectorId;
    if (!campaignState._allOrderedSectors[sectorId]) campaignState._allOrderedSectors[sectorId] = [];
    if (!campaignState._allOrderedSectors[sectorId].includes(playerFaction))
        campaignState._allOrderedSectors[sectorId].push(playerFaction);
}

function _cancelOrder(playerFaction, sectorId) {
    const orders = campaignState.pendingOrders[playerFaction] || [];
    const order  = orders.find(o => o.sectorId === sectorId);
    if (!order) return;
    campaignState.credits[playerFaction] += order.credits;
    campaignState.pendingOrders[playerFaction] = orders.filter(o => o.sectorId !== sectorId);
    delete campaignState.pendingMoves[playerFaction];
}
window._eco_cancelOrder = _cancelOrder;

// ============================================================
// TURNO: CONFERMA / PASSA / AVANZAMENTO
// ============================================================

function finishPlayerTurn() {
    const p = campaignState.currentPlayer;

    // Online: il client che non è host invia l'azione
    if (window.isCampaignOnline && !window.isHost) {
        if (p !== window.myPlayerNumber) return;
        const panel = document.getElementById('eco-orders-panel');
        if (panel) panel.remove();
        _net_clientSend('CONFIRM_ORDER', {});
        _net_showOrderSentOverlay();
        return;
    }

    // Sincronizzo pendingMoves con primo ordine (per compatibilità)
    const orders = campaignState.pendingOrders[p] || [];
    if (orders.length > 0)
        campaignState.pendingMoves[p] = orders[0].sectorId;
    else
        delete campaignState.pendingMoves[p];

    const panel = document.getElementById('eco-orders-panel');
    if (panel) panel.remove();

    _advanceTurn();
}
window.finishPlayerTurn = finishPlayerTurn;

function skipPlayerTurn() {
    const p = campaignState.currentPlayer;

    if (window.isCampaignOnline && !window.isHost) {
        if (p !== window.myPlayerNumber) return;
        _net_clientSend('SKIP_TURN', {});
        return;
    }

    // Rimborso ordini pendenti
    (campaignState.pendingOrders[p] || []).forEach(o => {
        campaignState.credits[p] = (campaignState.credits[p] || 0) + o.credits;
    });
    campaignState.pendingOrders[p] = [];
    delete campaignState.pendingMoves[p];

    const panel = document.getElementById('eco-orders-panel');
    if (panel) panel.remove();

    _advanceTurn();
}
window.finishPlayerTurn = finishPlayerTurn;
window.skipPlayerTurn   = skipPlayerTurn;
// Alias usato da campaign.js originale
window.skipPlayerTurn = skipPlayerTurn;

function _advanceTurn() {
    const n = campaignState.numPlayers;
    let next = campaignState.currentPlayer + 1;
    while (next <= n && !campaignState.sectors.some(s => s.owner === next)) next++;

    if (next > n) {
        processConflicts();
    } else {
        campaignState.currentPlayer = next;
        if (window.isCampaignOnline && window.isHost) _net_hostBroadcast();
        renderCampaignMap();
    }
}

// ============================================================
// RISOLUZIONE CONFLITTI
// ============================================================

function processConflicts() {
    // Solo l'Host calcola i conflitti in multiplayer
    if (window.isOnline && !window.isHost) {
        console.log("[Campaign] Client in attesa di risoluzione dall'Host...");
        campaignState.phase = 'RESOLVING';
        renderCampaignMap();
        return; 
    }

    campaignState.phase = 'RESOLVING';
    campaignState.battleQueue = [];

    const orders = campaignState.pendingOrders || {};
    const sectorMap = {};
    campaignState.sectors.forEach(s => { sectorMap[s.id] = { attackers: [], defender: s.owner }; });

    for (let p = 1; p <= campaignState.numPlayers; p++) {
        (orders[p] || []).forEach(o => {
            if (sectorMap[o.sectorId]) sectorMap[o.sectorId].attackers.push({ p, credits: o.credits });
        });
    }

    campaignState.sectors.forEach(sector => {
        const { attackers } = sectorMap[sector.id];
        if (attackers.length === 0) return;
        const participants = new Set(attackers.map(a => a.p));
        if (sector.owner > 0 && !participants.has(sector.owner)) participants.add(sector.owner);

        const bCredits = {};
        attackers.forEach(a => { bCredits[a.p] = a.credits; });
        if (sector.owner > 0) {
            let defCr = campaignState.sectorCredits[sector.id]?.[sector.owner] || 0;
            if (sector.specialization === 'FORTEZZA') {
                campaignState.adj[sector.id].forEach(adjId => {
                    const adj = campaignState.sectors[adjId];
                    if (adj?.owner === sector.owner) defCr += (campaignState.sectorCredits[adjId]?.[sector.owner] || 0);
                });
            }
            bCredits[sector.owner] = defCr;
        }

        if (participants.size > 1 && (sector.owner === 0 || (bCredits[sector.owner] || 0) >= 4)) {
            campaignState.battleQueue.push({ sectorId: sector.id, factions: Array.from(participants), battleCredits: bCredits });
        } else {
            const winner = attackers[0].p;
            sector.owner = winner;
            if (!campaignState.sectorCredits[sector.id]) campaignState.sectorCredits[sector.id] = {};
            campaignState.sectorCredits[sector.id][winner] = (campaignState.sectorCredits[sector.id][winner] || 0) + (attackers[0].credits || 0);
        }
    });

    if (window.isCampaignOnline && window.isHost) {
        // L'host invia il resoconto dei conflitti a tutti i client
        if (typeof _net_broadcast === 'function') {
            _net_broadcast({ type: 'CAMPAIGN_CONFLICT_SUMMARY', campaignSnap: typeof _net_buildSnapshot === 'function' ? _net_buildSnapshot() : null });
        }
        _showConflictSummary();
    } else {
        _showConflictSummary();
    }
}
window.processConflicts = processConflicts;

function _showConflictSummary() {
    const n       = campaignState.numPlayers;
    const battles = campaignState.battleQueue;
    const peaceful = [];

    campaignState.sectors.forEach(s => {
        for (let p = 1; p <= n; p++) {
            (campaignState.pendingOrders[p] || []).forEach(o => {
                if (o.sectorId === s.id && s.owner === p && !battles.some(b => b.sectorId === s.id))
                    peaceful.push({ p, sid: s.id });
            });
        }
    });

    let html = `<div style="font-family:Courier New;color:#fff;padding:40px;background:rgba(10,15,25,0.95);
                    border:2px solid #555;border-radius:12px;max-width:900px;text-align:left;width:90%;box-shadow:0 0 40px rgba(0,0,0,0.8);">
        <h1 style="color:#fff;text-align:center;margin-top:0;font-size:36px;letter-spacing:2px;border-bottom:1px solid #444;padding-bottom:15px;">RIEPILOGO ORDINI</h1>`;

    if (peaceful.length > 0) {
        html += `<p style="color:#aaa;font-size:22px;margin-bottom:12px;font-weight:bold;text-transform:uppercase;">CONQUISTE PACIFICHE:</p>`;
        peaceful.forEach(({ p, sid }) => {
            const c = COLORS['p' + p];
            html += `<div style="color:${c};font-size:24px;margin-bottom:8px;padding-left:15px;border-left:4px solid ${c};">→ ${players[p]?.name || 'P'+p} conquista il Settore ${sid}</div>`;
        });
    }
    if (battles.length > 0) {
        html += `<p style="color:#ff4444;font-size:22px;margin-top:30px;margin-bottom:12px;font-weight:bold;text-transform:uppercase;">⚔️ BATTAGLIE IMMINENTI:</p>`;
        battles.forEach(b => {
            const spec  = campaignState.sectors[b.sectorId].specialization
                ? SECTOR_SPECIALIZATIONS.find(s => s.id === campaignState.sectors[b.sectorId].specialization)?.label || '' : '';
            const names = b.factions.map(pid => {
                const c  = COLORS['p' + pid];
                const cr = b.battleCredits[pid] ?? '?';
                return `<span style="color:${c}">${players[pid]?.name || 'P'+pid} (💰${cr})</span>`;
            }).join(' vs ');
            html += `<div style="font-size:24px;margin-bottom:12px;background:rgba(255,50,50,0.1);padding:10px;border-radius:8px;">
                <strong>Settore ${b.sectorId} ${spec}:</strong><br>${names}</div>`;
        });
    }
    if (!peaceful.length && !battles.length)
        html += `<p style="color:#888;text-align:center;font-size:24px;margin:30px 0;">Nessun movimento questo turno.</p>`;

    // FIX: il client online non deve guidare la progressione — torna semplicemente alla mappa
    const btnAction = (window.isCampaignOnline && !window.isHost)
        ? `this.closest('.campaign-summary-overlay').remove(); if(typeof _net_clientSend==='function') _net_clientSend('SYNC_REQUEST',{}); if(typeof _prepareMapDOM==='function') _prepareMapDOM(); renderCampaignMap();`
        : `this.closest('.campaign-summary-overlay').remove(); runNextBattle();`;

    html += `<button class="action-btn"
        style="width:100%;margin-top:40px;border-color:#00ff88;color:#00ff88;font-size:28px;padding:15px;font-weight:bold;"
        onclick="${btnAction}">
        AVANTI ▶
    </button></div>`;

    const overlay = document.createElement('div');
    overlay.className = 'campaign-summary-overlay';
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.92);z-index:999999;display:flex;align-items:center;justify-content:center;`;
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
}

// ============================================================
// RENDITA
// ============================================================

function _collectIncome() {
    const n = campaignState.numPlayers;
    const earned = {};
    for (let p = 1; p <= n; p++) earned[p] = 0;
    campaignState.sectors.forEach(s => {
        if (s.owner > 0 && s.owner <= n) {
            campaignState.credits[s.owner] = (campaignState.credits[s.owner] || 0) + s.income;
            earned[s.owner] += s.income;
        }
    });
    return earned;
}

// ============================================================
// PROSSIMO ROUND DI PIANIFICAZIONE
// ============================================================

function startNextPlanningRound() {
    // Seleziona esecuzione in base al ruolo: il client chiede un aggiornamento
    if (window.isCampaignOnline && !window.isHost) {
        if (typeof _net_clientSend === 'function') _net_clientSend('SYNC_REQUEST', {});
        return;
    }
    
    campaignState.pendingOrders = {};
    const earned = _collectIncome();
    const n      = campaignState.numPlayers;

    // In campagna online: l'host manda CAMPAIGN_INCOME_NOTICE ai client
    if (window.isCampaignOnline && window.isHost) {
        const earnedOut = {};
        for (let p = 1; p <= n; p++) earnedOut[p] = earned[p] || 0;
        if (typeof _net_broadcast === 'function') {
            _net_broadcast({
                type:         'CAMPAIGN_INCOME_NOTICE',
                earned:       earnedOut,
                campaignSnap: typeof _net_buildSnapshot === 'function' ? _net_buildSnapshot() : null,
            });
        }
        // L'host procede al prossimo round direttamente
        _doStartNextPlanningRound();
        return;
    }

    // Locale: mostra riepilogo rendita
    let incomeHtml = '';
    for (let p = 1; p <= n; p++) {
        if (!campaignState.sectors.some(s => s.owner === p)) continue;
        const c = COLORS['p' + p], name = players[p]?.name || 'P' + p;
        
        // Struttura a colonna per evitare fuoriuscite su schermi stretti
        incomeHtml += `
        <div style="color:${c}; margin:10px 0; font-size:clamp(14px, 4.5vw, 20px); font-weight:bold; border-left:4px solid ${c}; padding-left:10px; display:flex; flex-direction:column; gap:4px;">
            <div>${name}: <span style="color:#fff;">+${earned[p]}</span> <span style="color:#aaa; font-weight:normal; font-size:0.85em;">rendita</span></div>
            <div style="color:#FFD700; font-size:1.1em;">💰 Totale: ${campaignState.credits[p]}</div>
        </div>`;
    }

    const overlay = document.createElement('div');
    overlay.id = 'eco-income-overlay';
    overlay.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.92); z-index:999999; display:flex; align-items:center; 
        justify-content:center; font-family:Courier New; padding:15px; box-sizing:border-box;`;

    // Padding, font e bottoni resi flessibili con clamp()
    overlay.innerHTML = `
        <div style="background:rgba(0,0,10,0.98); border:3px solid #FFD700; border-radius:15px;
                    padding:clamp(15px, 5vw, 25px); width:100%; max-width:500px; max-height:95vh; overflow-y:auto; 
                    box-shadow:0 0 50px rgba(255,215,0,0.2); box-sizing:border-box; text-align:center;">
            
            <h1 style="color:#FFD700; margin:0 0 15px; font-size:clamp(22px, 6vw, 36px); text-shadow:0 0 15px rgba(255,215,0,0.5); letter-spacing:1px;">
                💰 RENDITA TURNO
            </h1>

            <div style="text-align:left; margin-bottom:20px; background:rgba(255,255,255,0.03); padding:clamp(10px, 3vw, 15px); border-radius:10px;">
                ${incomeHtml}
            </div>

            <button class="action-btn"
                style="width:100%; border:3px solid #00ff88; color:#00ff88; padding:clamp(12px, 4vw, 18px); 
                       font-size:clamp(18px, 5vw, 24px); font-weight:bold; background:rgba(0,0,0,0.5); cursor:pointer; border-radius:10px;"
                onclick="document.getElementById('eco-income-overlay').remove(); _doStartNextPlanningRound();">
                INIZIA ROUND ▶
            </button>
        </div>`;
    document.body.appendChild(overlay);
}
window.startNextPlanningRound = startNextPlanningRound;

function _doStartNextPlanningRound() {
    campaignState.turnCount = (campaignState.turnCount || 1) + 1;
    campaignState.phase        = 'PLANNING';
    campaignState.currentPlayer = 1;
    campaignState.pendingMoves  = {};
    campaignState._allOrderedSectors = {};

    while (campaignState.currentPlayer <= campaignState.numPlayers &&
           !campaignState.sectors.some(s => s.owner === campaignState.currentPlayer)) {
        campaignState.currentPlayer++;
    }
    if (checkCampaignWin()) return;
    
    // FIX: L'Host DEVE forzare l'aggiornamento ai client dopo aver cambiato round/turno!
    if (window.isCampaignOnline && window.isHost) {
        if (typeof _net_hostBroadcast === 'function') _net_hostBroadcast();
    }
    
    renderCampaignMap();
}
window._doStartNextPlanningRound = _doStartNextPlanningRound;

// ============================================================
// GESTIONE BATTAGLIE
// ============================================================

function runNextBattle() {
    // Se un client preme "Avanti" sul riepilogo, chiede l'aggiornamento all'host e torna in attesa sulla mappa
    if (window.isCampaignOnline && !window.isHost) {
        if (typeof _net_clientSend === 'function') _net_clientSend('SYNC_REQUEST', {});
        if (typeof _prepareMapDOM === 'function') _prepareMapDOM();
        renderCampaignMap();
        return;
    }

    if (campaignState.battleQueue.length === 0) {
        startNextPlanningRound(); 
        return;
    }

    // Se siamo online e siamo l'host, usiamo la funzione di rete dedicata
    if (window.isCampaignOnline && window.isHost) {
        if (typeof _hostRunNextBattle === 'function') {
            _hostRunNextBattle(); 
            return;
        }
    }

    // Logica Locale (Hotseat o Fallback)
    const battle = campaignState.battleQueue.shift();
    campaignState._currentBattle = battle;
    startCampaignBattle(battle.factions, battle.sectorId);
}
window.runNextBattle = runNextBattle;

function startCampaignBattle(factions, sectorId) {
    // Segna chi riceve la rendita omaggio iniziale (deve essere bloccata al primo turno)
    campaignState._hasReceivedFirstIncome = {};
    factions.forEach(f => { campaignState._hasReceivedFirstIncome[f] = false; });

    // Azzera sectorCredits difensore (sono entrati in battaglia)
    const battle = campaignState._currentBattle;
    if (battle?.battleCredits && sectorId != null) {
        if (!campaignState.sectorCredits[sectorId]) campaignState.sectorCredits[sectorId] = {};
        factions.forEach(p => {
            if (campaignState.sectors[sectorId]?.owner === p)
                campaignState.sectorCredits[sectorId][p] = 0;
            (battle.fortressAdjacentZeroed || []).forEach(adjId => {
                if (campaignState.sectorCredits[adjId]) campaignState.sectorCredits[adjId][p] = 0;
            });
        });
    }

    campaignState.targetSector              = sectorId;
    campaignState.currentBattleParticipants = factions.slice().sort((a, b) => a - b);

    totalPlayers = 4;
    fullResetForBattle();

    for (let p = 1; p <= 4; p++) {
        players[p].isDisconnected = !factions.includes(p);
        if (factions.includes(p)) {
            const bc = battle?.battleCredits?.[p];
            players[p].credits = bc !== undefined ? bc : (campaignState.credits[p] ?? 10);
        }
    }

    // Allinea credits dal battle
    if (battle?.battleCredits) {
        factions.forEach(p => {
            if (battle.battleCredits[p] !== undefined) players[p].credits = battle.battleCredits[p];
        });
    }

    document.getElementById('campaign-overlay').style.display = 'none';
    state = 'SETUP_P1';
    document.getElementById('setup-overlay').style.display = 'flex';
    currentPlayer = campaignState.currentBattleParticipants[0];
    setupData = freshSetupData();
    if (battle?.battleCredits?.[currentPlayer] !== undefined)
        setupData.points = battle.battleCredits[currentPlayer];
    updateSetupUI();
}
window.startCampaignBattle = startCampaignBattle;

// ============================================================
// OVERRIDE freshSetupData — usa battleCredits specifici
// ============================================================

const _core_origFreshSetupData = window.freshSetupData;
window.freshSetupData = function() {
    const data = _core_origFreshSetupData ? _core_origFreshSetupData() : { points: GAME.SETUP_POINTS, agents: [] };
    if (!campaignState.isActive) return data;
    const battle = campaignState._currentBattle;
    if (battle?.battleCredits?.[currentPlayer] !== undefined) {
        data.points = battle.battleCredits[currentPlayer];
        players[currentPlayer].credits = battle.battleCredits[currentPlayer];
    } else {
        data.points = campaignState.credits[currentPlayer] ?? 10;
    }
    return data;
};

// ============================================================
// OVERRIDE resetTurnState — blocca rendita al primo turno battaglia
// ============================================================

const _core_origResetTurnState = window.resetTurnState;
window.resetTurnState = function() {
    if (campaignState.isActive) {
        const saved = players[currentPlayer]?.credits ?? 0;
        _core_origResetTurnState();
        if (campaignState._hasReceivedFirstIncome && !campaignState._hasReceivedFirstIncome[currentPlayer]) {
            players[currentPlayer].credits = saved;
            campaignState._hasReceivedFirstIncome[currentPlayer] = true;
            if (typeof updateUI === 'function') updateUI();
        }
    } else {
        _core_origResetTurnState();
    }
};

// ============================================================
// OVERRIDE confirmPlayerSetup — flusso campagna
// ============================================================

const _core_origConfirmPlayerSetup = window.confirmPlayerSetup;
window.confirmPlayerSetup = function() {
    if (!campaignState.isActive) {
        if (_core_origConfirmPlayerSetup) _core_origConfirmPlayerSetup();
        return;
    }

    if (!setupData.agents || setupData.agents.length === 0) {
        showTemporaryMessage('ERRORE: Devi reclutare almeno un agente per scendere in campo!');
        playSFX('click'); return;
    }

    players[currentPlayer].agents    = JSON.parse(JSON.stringify(setupData.agents));
    players[currentPlayer].credits   = setupData.points;
    players[currentPlayer].cards     = typeof getFinalCardSelection === 'function' ? getFinalCardSelection() : [];
    players[currentPlayer].usedCards = {};

    // Bonus specializzazioni settore
    campaignState.sectors.forEach(s => {
        if (s.owner === currentPlayer && s.specialization) {
            players[currentPlayer].agents.forEach(agent => {
                if (s.specialization === 'ARSENALE') agent.dmg += 1;
                else if (s.specialization === 'FORGIA') { agent.maxHp += 1; agent.hp += 1; }
            });
        }
    });

    // In campagna online: usa il flusso di rete (gestito in campaign_multiplayer.js)
    if (window.isCampaignOnline) {
        _net_handleConfirmSetup();
        return;
    }

    // Locale: avanza al prossimo partecipante o avvia la partita
    const participants = campaignState.currentBattleParticipants;
    const idx = participants.indexOf(currentPlayer);
    if (idx + 1 < participants.length) {
        currentPlayer = participants[idx + 1];
        setupData = freshSetupData();
        if (typeof cardSelectionData !== 'undefined') cardSelectionData.selected = [];
        updateSetupUI();
    } else {
        startActiveGameLocal();
        resetTurnState();
        drawGame();
    }
};

// ============================================================
// OVERRIDE showGameOverlay — reindirizza a showBattleResults
// ============================================================

const _core_origShowGameOverlay = window.showGameOverlay;
window.showGameOverlay = function(title, message, color) {
    if (!campaignState.isActive) {
        if (_core_origShowGameOverlay) _core_origShowGameOverlay(title, message, color);
        return;
    }
    let winnerFaction = campaignState.currentBattleParticipants[0];
    for (let p = 1; p <= 4; p++) {
        if (players[p] && players[p].color === color) { winnerFaction = p; break; }
    }
    showBattleResults(winnerFaction);
};

// ============================================================
// RISULTATI BATTAGLIA
// ============================================================

function showBattleResults(winnerFaction) {
    const participants = campaignState.currentBattleParticipants;
    const sectorId     = campaignState.targetSector;

    if (!campaignState.sectorCredits[sectorId]) campaignState.sectorCredits[sectorId] = {};

    const results = {};
    participants.forEach(faction => {
        const shopResidual  = Math.max(0, players[faction]?.credits || 0);
        const survivorValue = _agentSurvivorValue(faction);
        results[faction] = { shopResidual, survivorValue, total: shopResidual + survivorValue };
    });

    const sector = campaignState.sectors.find(s => s.id === sectorId);
    sector.owner = winnerFaction;

    participants.forEach(faction => {
        const { total } = results[faction];
        if (faction === winnerFaction) {
            const prev = campaignState.sectorCredits[sectorId][faction] || 0;
            campaignState.sectorCredits[sectorId][faction] = prev + total;
        } else {
            campaignState.credits[faction] = (campaignState.credits[faction] || 0) + total;
            delete campaignState.sectorCredits[sectorId][faction];
        }
    });

    // In campagna online: host fa broadcast e mostra UI; client aspetta CAMPAIGN_BATTLE_RESULT
    if (window.isCampaignOnline) {
        if (window.isHost) {
            _net_broadcast({
                type:         'CAMPAIGN_BATTLE_RESULT',
                winnerFaction,
                sectorId,
                results,
                campaignSnap: _net_buildSnapshot(),
            });
            _showBattleResultsUI(winnerFaction, sectorId, results);
        } else {
            // Client: nasconde gameover locale e aspetta il messaggio
            const go = document.getElementById('gameover-overlay');
            if (go) go.style.display = 'none';
        }
        return;
    }

    _showBattleResultsUI(winnerFaction, sectorId, results);
}
window.showBattleResults = showBattleResults;

function _showBattleResultsUI(winnerFaction, sectorId, results) {
    const participants = campaignState.currentBattleParticipants;
    const n            = campaignState.numPlayers;
    const winnerColor  = COLORS['p' + winnerFaction];
    const winnerName   = players[winnerFaction]?.name || 'P' + winnerFaction;

    const creditsHtml = participants.map(faction => {
        const c    = COLORS['p' + faction];
        const name = players[faction]?.name || 'P' + faction;
        const r    = results[faction];
        const isW  = faction === winnerFaction;
        const dest = isW
            ? `→ 📦 Nel Settore: <b>${campaignState.sectorCredits[sectorId]?.[faction] || 0}</b>`
            : `→ 🏦 Alla Banca: <b>+${r.total}</b>`;
        return `<div style="color:${c}; font-size:15px; margin:10px 0; border-left:3px solid ${c}; padding:5px 12px; background:rgba(255,255,255,0.03); border-radius:0 5px 5px 0;">
            <div style="font-weight:bold; font-size:18px;">${name} ${isW ? '🏆' : '💀'}</div>
            <div style="color:#aaa; font-size:13px; margin:4px 0;">Negozio: ${r.shopResidual} + Agenti vivi: ${r.survivorValue} = <b>${r.total}</b></div>
            <div style="font-size:14px; border-top:1px solid rgba(255,255,255,0.05); padding-top:4px;">${dest}</div>
        </div>`;
    }).join('');

    const ownedHtml = Array.from({ length: n }, (_, i) => i + 1).map(p => {
        const cnt = campaignState.sectors.filter(s => s.owner === p).length;
        const c   = COLORS['p' + p];
        return `<span style="color:${c}; margin:4px 10px; font-weight:bold; font-size:14px; white-space:nowrap;">${players[p]?.name || 'P'+p}: 🏴${cnt}</span>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'battle-results-overlay';
    overlay.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.94); z-index:2000000;
        display:flex; align-items:center; justify-content:center;
        font-family:Courier New,monospace; padding:10px; box-sizing:border-box;`;

    overlay.innerHTML = `
        <div style="background:rgba(10,15,30,0.98); border:3px solid ${winnerColor}; border-radius:15px;
                    padding:20px; width:100%; max-width:580px; max-height:95vh; overflow-y:auto; 
                    box-shadow:0 0 50px rgba(0,0,0,1); box-sizing:border-box; text-align:center;">
            
            <h1 style="color:${winnerColor}; text-shadow:0 0 15px ${winnerColor}; margin:0 0 10px; font-size:clamp(22px, 5vw, 32px); text-transform:uppercase;">⚔️ BATTAGLIA CONCLUSA</h1>
            <h2 style="color:#fff; margin:0 0 20px; font-size:clamp(16px, 4vw, 22px);">VINCITORE: <span style="color:${winnerColor}">${winnerName.toUpperCase()}</span></h2>
            
            <div style="background:rgba(0,0,0,0.3); border:1px solid #333; border-radius:10px; padding:10px; margin-bottom:20px; text-align:left;">
                <p style="color:#888; font-size:11px; margin:0 0 10px; text-transform:uppercase; text-align:center; letter-spacing:1px;">Resoconto Crediti</p>
                ${creditsHtml}
            </div>

            <div style="background:rgba(255,255,255,0.03); border:1px solid #222; border-radius:8px; padding:10px; margin-bottom:25px; display:flex; flex-wrap:wrap; justify-content:center;">
                ${ownedHtml}
            </div>

            <button class="action-btn" id="results-continue-btn"
                style="padding:15px; border:3px solid ${winnerColor}; color:${winnerColor}; background:rgba(0,0,0,0.5); 
                       cursor:pointer; font-size:22px; font-weight:bold; width:100%; border-radius:10px; text-transform:uppercase;">
                AVANTI ▶
            </button>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('#results-continue-btn').onclick = () => {
        overlay.remove();
        if (typeof grid !== 'undefined') grid.clear();
        if (typeof controlPoints !== 'undefined') controlPoints.clear();
        state = 'SETUP_P1';
        document.getElementById('controls-panel').style.display = 'none';
        document.getElementById('setup-overlay').style.display  = 'none';
        if (typeof ctx !== 'undefined') ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (checkCampaignWin()) return;
        runNextBattle();
    };
}
window._showBattleResultsUI = _showBattleResultsUI;

function _agentSurvivorValue(faction) {
    return (players[faction]?.agents || []).reduce((tot, a) => {
        if (!a) return tot;
        const base = GAME.AGENT_COST || 4;
        return tot + base + (a.hp || 1) - 1 + (a.mov || 1) - 1 + (a.rng || 1) - 1 + (a.dmg || 1) - 1;
    }, 0);
}
window._bat_agentSurvivorValue = _agentSurvivorValue;

// ============================================================
// VITTORIA CAMPAGNA
// ============================================================

function checkCampaignWin() {
    let winner = null;
    for (let p = 1; p <= campaignState.numPlayers; p++) {
        if (campaignState.sectors.filter(s => s.owner === p).length >= campaignState.victoryThreshold) {
            winner = p; break;
        }
    }
    if (!winner) return false;

    const color = COLORS['p' + winner];
    const name  = players[winner]?.name || 'P' + winner;
    const cnt   = campaignState.sectors.filter(s => s.owner === winner).length;

    const overlay = document.getElementById('campaign-overlay');
    overlay.style.display = 'flex';
    overlay.innerHTML = `
        <div style="text-align:center;color:${color};padding:50px;border:3px solid ${color};
                    background:rgba(0,0,0,0.95);border-radius:12px;max-width:500px;font-family:Courier New;">
            <div style="font-size:3em;margin-bottom:10px;">🏆</div>
            <h1 style="color:${color};text-shadow:0 0 20px ${color};margin:0 0 10px;">DOMINATORE GLOBALE</h1>
            <h2 style="margin:0 0 16px;">${name.toUpperCase()}</h2>
            <p style="color:#aaa;margin-bottom:24px;">Conquista ${cnt}/${campaignState.sectors.length} settori — Vittoria Totale!</p>
            <button class="action-btn"
                style="border:2px solid ${color};color:${color};background:transparent;padding:15px 40px;cursor:pointer;font-size:16px;"
                onclick="location.reload()">NUOVA PARTITA</button>
        </div>`;
    return true;
}
window.checkCampaignWin = checkCampaignWin;

// ============================================================
// MENU CAMPAGNA E INFO
// ============================================================

function showCampaignMenu() {
    if (typeof playSFX === 'function') playSFX('click');
    const menu     = document.getElementById('network-menu');
    if (!menu) return;
    const existing = document.getElementById('campaign-num-players');
    if (existing) { existing.remove(); return; }

    const div = document.createElement('div');
    div.id = 'campaign-num-players';
    div.style.cssText = `margin-top:20px;text-align:center;border-top:1px solid #333;padding-top:16px;font-family:Courier New;`;
    div.innerHTML = `
        <p style="color:#aaa;margin-bottom:12px;">Numero di giocatori (Campagna):</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <button class="action-btn" onclick="startCampaign(2)"
                style="border:2px solid #00ff88;color:#00ff88;background:transparent;">2 GIOCATORI</button>
            <button class="action-btn" onclick="startCampaign(3)"
                style="border:2px solid #00aaff;color:#00aaff;background:transparent;">3 GIOCATORI</button>
            <button class="action-btn" onclick="startCampaign(4)"
                style="border:2px solid #FFD700;color:#FFD700;background:transparent;">4 GIOCATORI</button>
        </div>`;
    menu.appendChild(div);
}
window.showCampaignMenu = showCampaignMenu;

function showCampaignInfoModal() {
    if (typeof playSFX === 'function') playSFX('click');
    const bonusHtml = SECTOR_SPECIALIZATIONS.map(s => `
        <div style="margin-bottom:20px;border-left:4px solid #00ff88;padding-left:15px;">
            <div style="font-size:20px;color:#fff;font-weight:bold;">${s.label}</div>
            <div style="font-size:14px;color:#aaa;">${s.desc}</div>
        </div>`).join('');
    const modal = document.createElement('div');
    modal.id = 'campaign-info-modal';
    modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.95);z-index:1000000;display:flex;align-items:center;justify-content:center;font-family:'Courier New',monospace;`;
    modal.innerHTML = `
        <div style="background:#050a14;border:2px solid #00ff88;padding:30px;max-width:500px;width:90%;border-radius:12px;box-shadow:0 0 40px rgba(0,255,136,0.3);">
            <h2 style="color:#00ff88;text-align:center;margin-top:0;">PROTOCOLLO DI GUERRA</h2>
            <div style="margin:20px 0;max-height:60vh;overflow-y:auto;padding-right:10px;">
                <div style="margin-bottom:20px;border-left:4px solid #FFD700;padding-left:15px;background:rgba(255,215,0,0.05);">
                    <div style="font-size:20px;color:#FFD700;font-weight:bold;">🏆 OBIETTIVO FINALE</div>
                    <div style="font-size:14px;color:#fff;">Conquista <b>32 settori</b> per ottenere il dominio totale.</div>
                </div>
                ${bonusHtml}
                <div style="margin-bottom:20px;border-left:4px solid #ff4444;padding-left:15px;">
                    <div style="font-size:20px;color:#fff;font-weight:bold;">🚫 Settori Bloccati</div>
                    <div style="font-size:14px;color:#aaa;">Zone instabili. Non è possibile attraversarle o occuparle.</div>
                </div>
            </div>
            <button class="action-btn" style="width:100%;padding:15px;border-color:#00ff88;color:#00ff88;"
                onclick="document.getElementById('campaign-info-modal').remove()">CHIUDI</button>
        </div>`;
    document.body.appendChild(modal);
}
window.showCampaignInfoModal = showCampaignInfoModal;

// ============================================================
// OVERRIDE isPlayerEliminated — salta non-partecipanti in battaglia
// ============================================================

const _core_origIsEliminated = window.isPlayerEliminated;
window.isPlayerEliminated = function(p) {
    if (campaignState.isActive) {
        const parts = campaignState.currentBattleParticipants || [];
        if (parts.length > 0 && !parts.includes(p)) return true;
    }
    return _core_origIsEliminated ? _core_origIsEliminated(p) : false;
};

// ============================================================
// OVERRIDE resetTurnState — pulizia HQ fantasma in campagna
// ============================================================

const _core_origResetForHQ = window.resetTurnState;
window.resetTurnState = (function() {
    // Catturiamo l'ultimo override (quello che blocca la rendita)
    // e ci aggiungiamo la pulizia HQ
    const prev = window.resetTurnState;
    return function() {
        if (campaignState.isActive) {
            const parts = campaignState.currentBattleParticipants || [];
            if (parts.length > 0) {
                grid.forEach(cell => {
                    if (cell.entity?.type === 'hq' && !parts.includes(cell.entity.faction))
                        cell.entity = null;
                });
                for (let p = 1; p <= 4; p++) {
                    if (!parts.includes(p) && players[p]) {
                        players[p].hq = null; players[p].agents = [];
                    }
                }
            }
        }
        prev();
    };
})();

// ============================================================
// STUB _net_* — queste funzioni vengono implementate da
// campaign_multiplayer.js quando la campagna è online.
// In modalità locale rimangono no-op.
// ============================================================

window._net_hostBroadcast    = window._net_hostBroadcast    || function() {};
window._net_broadcast        = window._net_broadcast        || function() {};
window._net_clientSend       = window._net_clientSend       || function() {};
window._net_buildSnapshot    = window._net_buildSnapshot    || function() { return {}; };
window._net_applyTurnState   = window._net_applyTurnState   || function() {};
window._net_showOrderSentOverlay = window._net_showOrderSentOverlay || function() {};
window._net_handleConfirmSetup   = window._net_handleConfirmSetup   || function() {};

console.log('[campaign_core.js] Caricato.');
