/* ============================================================
   campaign_map.js  —  CAMPAGNA: STATO, MAPPA STRATEGICA E TURNI
   ============================================================
   RESPONSABILITÀ:
   - Costanti e stato globale campagna (campaignState)
   - Generazione griglia esagonale strategica
   - Rendering SVG della mappa e decorazioni settori
   - Interazione click sui settori (attacco/difesa)
   - Allocazione crediti per settore
   - Turni di pianificazione (finishPlayerTurn, skipPlayerTurn, _advanceTurn)
   - Menu campagna e modale info

   ESPONE: campaignState, startCampaign, renderCampaignMap,
           handleSectorClick, showCreditSelector, finishPlayerTurn,
           skipPlayerTurn, showCampaignMenu, showCampaignInfoModal

   DIPENDE DA: constants.js (CAMPAIGN, GAME), state.js, graphics.js
   CARICATO PRIMA DI: campaign_battle.js
   ============================================================ */

// Le costanti GRID_COLS, GRID_ROWS, HEX_SIZE e VICTORY_THRESHOLD
// per la mappa campagna sono definite in constants.js nell'oggetto CAMPAIGN.
// Aliasati qui come variabili locali per leggibilità nel resto del file.
const GRID_COLS = CAMPAIGN.GRID_COLS;
const GRID_ROWS = CAMPAIGN.GRID_ROWS;
// NOTA: CAMPAIGN.HEX_SIZE è usato solo per il rendering della mappa strategica.
// Non sovrascrive più HEX_SIZE globale di state.js, che rimane per il gioco tattico.

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
    { id: 'ESPLOSIONE',label: '💥 Esplosivi', desc: 'Logistica: Dimezza il costo del Attacco Nucleare (20💰 invece di 40💰)' },
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
    victoryThreshold: CAMPAIGN.VICTORY_THRESHOLD,
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
    const horizDist = CAMPAIGN.HEX_SIZE * Math.sqrt(3); // Distanza orizzontale tra colonne
    const vertDist  = CAMPAIGN.HEX_SIZE * 1.5;         // Distanza verticale tra righe

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
        // Inizializza snapshot pre-turno al momento della prima azione
        campaignState._creditsAtRoundStart = JSON.parse(JSON.stringify(campaignState.credits));
        campaignState._sectorCreditsAtRoundStart = JSON.parse(JSON.stringify(campaignState.sectorCredits || {}));
        campaignState._sectorsAtRoundStart = {};
        campaignState.sectors.forEach(s => {
            campaignState._sectorsAtRoundStart[s.id] = {
                mineUpgrade:     s.mineUpgrade,
                mineField:       s.mineField,
                fortressUpgrade: s.fortressUpgrade,
            };
        });
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
    const currP = (window.isCampaignOnline && window.myPlayerNumber)
        ? window.myPlayerNumber
        : campaignState.currentPlayer;
    const pColor = players[currP]?.color || COLORS['p' + currP];

    if (campaignState.pendingOrders[currP]?.length > 0) {
        const last = campaignState.pendingOrders[currP][campaignState.pendingOrders[currP].length - 1];
        campaignState.pendingMoves[currP] = last.sectorId;
    }

    let creditsHtml = '';
    for (let p = 1; p <= n; p++) {
        const c = players[p].color || COLORS['p' + p];
        const nameLabel = players[p].name || ('P' + p);
        const isEliminated = !campaignState.sectors.some(s => s.owner === p);
        const ownedCnt = campaignState.sectors.filter(s => s.owner === p).length;
        
        // NUOVO: Nascondi crediti avversari sulla UI
        let displayCredits = campaignState.credits[p];
        if (window.isCampaignOnline && campaignState.phase === 'PLANNING' && p !== window.myPlayerNumber) {
            displayCredits = campaignState._creditsAtRoundStart?.[p] ?? campaignState.credits[p];
        }

        // Ogni riga rappresenta un giocatore
        creditsHtml += `
            <div style="color:${c}; margin-bottom:4px; font-weight:bold; font-size:14px; 
                        display:flex; flex-direction:row; align-items:center; gap:10px; 
                        background:rgba(0,0,0,0.75); padding:6px 12px; border-left:4px solid ${c}; 
                        border-radius:0 6px 6px 0; text-shadow:1px 1px 2px #000;
                        white-space:nowrap; pointer-events:auto; ${isEliminated ? 'opacity:0.3;' : ''}">
                
                <!-- Nome Giocatore (troncato se troppo lungo) -->
                <span style="min-width:70px; max-width:100px; overflow:hidden; text-overflow:ellipsis;">
                    ${nameLabel}
                </span>

                <!-- Crediti -->
                <span style="color:#FFD700; display:flex; align-items:center; gap:2px;">
                    💰${displayCredits}
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

    const myP = (window.isCampaignOnline && window.myPlayerNumber) 
        ? window.myPlayerNumber 
        : campaignState.currentPlayer;
    const myPColor = players[myP]?.color || COLORS['p' + myP];
    
    if (campaignState.phase === 'PLANNING') {
        const actDiv = document.getElementById('campaign-actions');
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'action-btn';
        confirmBtn.style.cssText = `border:3px solid ${pColor}; color:${pColor}; background:rgba(0,0,0,0.9); pointer-events:auto; font-size:20px; padding:15px 40px; cursor:pointer; font-weight:bold; box-shadow:0 0 20px ${pColor}55; border-radius:8px; min-width:250px; text-align:center;`;
        confirmBtn.innerText = 'CONFERMA ORDINI';
        confirmBtn.onclick = () => finishPlayerTurn();
        actDiv.appendChild(confirmBtn);
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
    }
}
window.renderCampaignMap = renderCampaignMap;


function _renderMapSVG() {
    const svg  = document.getElementById('map-svg');
    if (!svg) return;
    svg.innerHTML = ''; // Pulisce prima di ridisegnare
    
    // --- SFONDO ANCORATO ---
    const bgImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    bgImage.setAttributeNS(null, 'href', 'img/sfondocamp1.png');
    bgImage.setAttributeNS(null, 'x', '-260');
    bgImage.setAttributeNS(null, 'y', '-50');
    bgImage.setAttributeNS(null, 'width', '1500');
    bgImage.setAttributeNS(null, 'height', '850');
    bgImage.setAttributeNS(null, 'preserveAspectRatio', 'xMidYMid slice');
    bgImage.style.pointerEvents = 'none';
    bgImage.style.opacity = '0.7';
    svg.appendChild(bgImage);

    const HEX_R = CAMPAIGN.HEX_SIZE;
    const hqSet = new Set(CAMPAIGN_HQ_POSITIONS[campaignState.numPlayers] || []);

    function hexPts(cx, cy) {
        let pts = '';
        const drawR = HEX_R * 0.97;
        for (let i = 0; i < 6; i++) {
            const a = Math.PI / 180 * (60 * i - 30);
            pts += `${cx + drawR * Math.cos(a)},${cy + drawR * Math.sin(a)} `;
        }
        return pts.trim();
    }

    campaignState.sectors.forEach(s => {
        const cx = s.x, cy = s.y;
        const pts = hexPts(cx, cy);
        const isHQ = hqSet.has(s.id);
        
        let allT = campaignState._allOrderedSectors?.[s.id] || [];
        if (window.isCampaignOnline && campaignState.phase === 'PLANNING') {
            allT = allT.filter(pid => pid === window.myPlayerNumber);
        }

        // --- FIX CRITICO: VARIABILI MANCANTI REINSERITE QUI ---
        const myP = (window.isCampaignOnline && window.myPlayerNumber) ? window.myPlayerNumber : campaignState.currentPlayer;
        const isSabotagedByMe = (campaignState.pendingOrders[myP] || []).some(o => o.sectorId === s.id && o.isSabotage);
        const isEffectivelyBlocked = s.blocked || isSabotagedByMe;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.style.cursor = isEffectivelyBlocked ? 'not-allowed' : 'pointer';

        if (isEffectivelyBlocked) {
            // Sfondo esagono rosso scuro
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', pts);
            poly.setAttribute('fill', 'rgba(40,10,10,0.85)');
            poly.setAttribute('stroke', '#ff4444');
            poly.setAttribute('stroke-width', '2');
            g.appendChild(poly);
            
            // Grossa Emoji Nucleare perfettamente centrata e pulsante
            const nukeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            nukeIcon.setAttribute('x', cx);
            nukeIcon.setAttribute('y', cy); 
            nukeIcon.setAttribute('text-anchor', 'middle');
            nukeIcon.setAttribute('dominant-baseline', 'middle');
            nukeIcon.setAttribute('style', `
                font-size: 60px; 
                font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Android Emoji", sans-serif;
                pointer-events: none;
                filter: drop-shadow(0 0 12px rgba(255, 68, 68, 0.9));
            `);
            nukeIcon.textContent = '☢️';
            // Pulsazione lenta
            nukeIcon.style.animation = 'campPulse 1.2s infinite alternate';
            g.appendChild(nukeIcon);
            
            // La parte relativa alla creazione dell'elemento 'text' (INNESCATA/CONTAMINATO) è stata rimossa.

        } else {
            const ownerColor = s.owner > 0 ? (players[s.owner].color || COLORS['p' + s.owner]) : null;
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

            if (isHQ && s.owner > 0) {
                const imgSize = HEX_R * 1.5;
                const hqImg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
                const cosmeticId = players[s.owner]._cosmeticFaction || s.owner;
                hqImg.setAttributeNS(null, 'href', `img/HQ${cosmeticId}.png`);
                hqImg.setAttributeNS(null, 'x', cx - imgSize / 2);
                hqImg.setAttributeNS(null, 'y', cy - imgSize / 2);
                hqImg.setAttributeNS(null, 'width', imgSize);
                hqImg.setAttributeNS(null, 'height', imgSize);
                hqImg.setAttribute('pointer-events', 'none');
                hqImg.setAttribute('opacity', '0.9');
                g.appendChild(hqImg);
            }

            if (allT.length > 0) {
                const dw = 26, dh = 14, gap = 4;
                const tot = allT.length * (dw + gap) - gap;
                allT.forEach((pid, i) => {
                    const dc = players[pid].color || COLORS['p' + pid];
                    const isSabotage = (campaignState.pendingOrders[pid] || []).some(o => o.sectorId === s.id && o.isSabotage);

                    if (isSabotage) {
                        const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        txt.setAttribute('x', cx - tot/2 + i*(dw+gap) + dw/2);
                        txt.setAttribute('y', cy - HEX_R * 0.55);
                        txt.setAttribute('text-anchor', 'middle');
                        txt.setAttribute('font-size', '20');
                        txt.setAttribute('fill', dc);
                        txt.style.filter = `drop-shadow(0 0 3px ${dc})`;
                        txt.textContent = '☢️';
                        g.appendChild(txt);
                    } else {
                        const rc = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        rc.setAttribute('x', cx - tot/2 + i*(dw+gap));
                        rc.setAttribute('y', cy - HEX_R * 0.62);
                        rc.setAttribute('width', dw); rc.setAttribute('height', dh); rc.setAttribute('rx', 3);
                        rc.setAttribute('fill', dc);
                        rc.setAttribute('stroke', 'rgba(255,255,255,0.4)');
                        rc.setAttribute('stroke-width', '1');
                        g.appendChild(rc);
                    }
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

    const HEX_R = CAMPAIGN.HEX_SIZE;
    const hqSet   = new Set(CAMPAIGN_HQ_POSITIONS[campaignState.numPlayers] || []);
    
    // MODIFICA CRITICA: il giocatore da valutare per i bottoni + e -
    const p = window.isCampaignOnline ? window.myPlayerNumber : campaignState.currentPlayer;

    campaignState.sectors.forEach(s => {
        if (s.blocked) return;
        
        const cx = s.x, cy = s.y;
        const spec = s.specialization ? SECTOR_SPECIALIZATIONS.find(sp => sp.id === s.specialization) : null;

        // Valori reali (quelli che il client riceve dall'host filtrati o meno)
        let alloc = campaignState.sectorCredits[s.id]?.[s.owner] || 0;
        let hasMine = s.mineUpgrade;
        let hasMinefield = s.mineField;
        let hasFortress = s.fortressUpgrade;

        // Se siamo in PLANNING e il settore non è mio, devo usare i dati "congelati" a inizio round
        if (window.isCampaignOnline && campaignState.phase === 'PLANNING' && s.owner !== window.myPlayerNumber) {
            if (campaignState._sectorCreditsAtRoundStart?.[s.id]) {
                alloc = campaignState._sectorCreditsAtRoundStart[s.id][s.owner] || 0;
            } else {
                alloc = 0;
            }
            
            const pre = campaignState._sectorsAtRoundStart?.[s.id];
            if (pre) {
                hasMine = pre.mineUpgrade;
                hasMinefield = pre.mineField;
                hasFortress = pre.fortressUpgrade;
            }
        }
        
        const allT = campaignState._allOrderedSectors?.[s.id] || [];
        // Rimosso il blocco buggato che disattivava i bottoni in multiplayer
        let isCurrP = (s.owner === p && campaignState.phase === 'PLANNING');
        
        const ownerColor = s.owner > 0 ? (players[s.owner].color || COLORS['p' + s.owner]) : null;

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
            etxt.setAttribute('x', cx + 38); etxt.setAttribute('y', cy - 2);
            etxt.setAttribute('text-anchor','middle'); 
            etxt.setAttribute('dominant-baseline','middle');
            etxt.setAttribute('style', `
                font-size: 32px; 
                font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Android Emoji", sans-serif;
                fill: #fff; 
                pointer-events: none;
            `);
            etxt.textContent = emoji;
            g.appendChild(etxt);
        }

        // Badge upgrade
        const upgradeIcons = [];
        if (hasMine)      upgradeIcons.push('⛏️');
        if (hasMinefield) upgradeIcons.push('💣');
        if (hasFortress)  upgradeIcons.push('🏰');
        if (upgradeIcons.length > 0) {
            upgradeIcons.forEach((icon, idx) => {
                const utxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                utxt.setAttribute('x', cx - 35 + idx * 32);
                utxt.setAttribute('y', cy + HEX_R * -0.28);
                utxt.setAttribute('text-anchor', 'middle');
                utxt.setAttribute('dominant-baseline', 'middle');
                utxt.setAttribute('font-size', '22');
                utxt.setAttribute('pointer-events', 'none');
                utxt.textContent = icon;
                g.appendChild(utxt);
            });
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


// --- LOGICA ECONOMICA CENTRALIZZATA ---
/** Calcola il valore in crediti di un qualsiasi ordine (Attacco o Sabotaggio) */
function _eco_getOrderCost(order) {
    if (!order) return 0;
    return order.isSabotage ? (order.sabotageCost || 0) : (order.credits || 0);
}

/** Rimborsa una lista di ordini alla banca di un giocatore */
function _eco_refundOrders(playerFaction, ordersList) {
    if (!ordersList || ordersList.length === 0) return;
    ordersList.forEach(order => {
        campaignState.credits[playerFaction] += _eco_getOrderCost(order);
    });
    console.log(`[Eco] Rimborsati ${ordersList.length} ordini a P${playerFaction}`);
}

/** Riscrive la funzione di cancellazione singola usando i nuovi helper */
function _cancelOrder(playerFaction, sectorId) {
    const orders = campaignState.pendingOrders[playerFaction] || [];
    const orderIndex = orders.findIndex(o => o.sectorId === sectorId);
    
    if (orderIndex === -1) return;

    const order = orders[orderIndex];
    // Esegue il rimborso
    campaignState.credits[playerFaction] += _eco_getOrderCost(order);
    
    // Rimuove l'ordine
    orders.splice(orderIndex, 1);
    delete campaignState.pendingMoves[playerFaction];

    // Pulisce l'interfaccia (i pallini colorati)
    if (campaignState._allOrderedSectors[sectorId]) {
        campaignState._allOrderedSectors[sectorId] = campaignState._allOrderedSectors[sectorId].filter(pid => pid !== playerFaction);
        if (campaignState._allOrderedSectors[sectorId].length === 0) delete campaignState._allOrderedSectors[sectorId];
    }
}
window._eco_cancelOrder = _cancelOrder;

function allocSectorCredit(sectorId, delta, fromNetPlayer = null) {
    // In campagna online: il client delega all'host
    if (window.isCampaignOnline && !window.isHost) {
        _net_clientSend(delta > 0 ? 'ADD_SECTOR_CREDIT' : 'REMOVE_SECTOR_CREDIT', { sectorId });
        return;
    }
    
    // MODIFICA CRITICA: Se sei host e fromNetPlayer è null (azione locale), usa il tuo ID.
    // Altrimenti usa quello passato dalla rete, altrimenti usa il currentPlayer (locale)
    const p = fromNetPlayer !== null 
        ? fromNetPlayer 
        : (window.isCampaignOnline ? window.myPlayerNumber : campaignState.currentPlayer);

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
}

// Alias usati dal codice mobile e da altri file
window._cn_allocAdd    = sectorId => allocSectorCredit(sectorId, +1);
window._cn_allocRemove = sectorId => allocSectorCredit(sectorId, -1);

// ============================================================
// CLICK SU SETTORE
// ============================================================

function handleSectorClick(targetId) {
    // 1. PRIMA COSA: Riproduci il suono (Firefox lo accetta solo se è istantaneo)
    if (typeof playSFX === 'function') playSFX('click');

    if (hasMovedSignificantly) {
        hasMovedSignificantly = false;
        return;
    }

    if (campaignState.phase !== 'PLANNING') return;
    
    const p = window.isCampaignOnline ? window.myPlayerNumber : campaignState.currentPlayer;
    const iamHost = (window.isHost === true);
    const target = campaignState.sectors[targetId];

    if (!window.isCampaignOnline && p !== campaignState.currentPlayer) {
        showTemporaryMessage('Non è il tuo turno!'); 
        return;
    }

    // CONTROLLO SABOTAGGIO LOCALE
    const isSabotagedByMe = (campaignState.pendingOrders[p] || []).some(o => o.sectorId === targetId && o.isSabotage);

    if (target.blocked || isSabotagedByMe) {
        if (target._nuclearCooldown > 0 || isSabotagedByMe) {
            showTemporaryMessage('☢️ Settore nuclearizzato — inaccessibile!');
            return;
        }
        showBonificaPanel(p, targetId);
        return;
    }

    if (target.owner === p) {
        showSectorUpgradePanel(p, targetId);
        return;
    }

    if (window.isCampaignOnline && !iamHost) {
        if (typeof _net_clientSend === 'function') {
            _net_clientSend('SECTOR_CLICK', { sectorId: targetId });
        }
        return;
    }

    if (!_isSectorReachable(targetId, p)) {
        const hasTrasporti = campaignState.sectors.some(s => s.owner === p && s.specialization === 'TRASPORTI');
        showTemporaryMessage(`Settore troppo lontano! Gittata massima: ${hasTrasporti ? 4 : 2} esagoni.`);
        return;
    }

    const orders   = campaignState.pendingOrders[p] || [];
    const existing = orders.find(o => o.sectorId === targetId);
    
    if (existing) {
        _cancelOrder(p, targetId);
        renderCampaignMap();
        return;
    }

    showCreditSelector(p, targetId);
}
window.handleSectorClick = handleSectorClick;

// ============================================================
// UI: BONIFICA SETTORE BLOCCATO
// ============================================================
// Permette di sbloccare permanentemente un settore bloccato
// spendendo CAMPAIGN.UPGRADE_BONIFICA_COST crediti.

function _gui_createModalBase(playerFaction, title, subtitle, contentHtml, buttons = []) {
    const pColor = players[playerFaction]?.color || COLORS['p' + playerFaction];
    
    const modal = document.createElement('div');
    modal.className = 'campaign-ui-modal';
    modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);
        z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Courier New;padding:10px;box-sizing:border-box;`;

    let buttonsHtml = buttons.map(btn => `
        <button id="${btn.id}" class="action-btn" style="width:100%;padding:14px;font-size:18px;font-weight:bold;border-radius:8px;cursor:pointer;
            ${btn.primary ? `border:3px solid ${pColor};color:${pColor};background:${pColor}22;` : `border:2px solid #555;color:#888;background:transparent;margin-top:8px;`}"
            ${btn.disabled ? 'disabled style="opacity:0.3;cursor:not-allowed;"' : ''}>${btn.label}</button>
    `).join('');

    modal.innerHTML = `
        <div style="background:rgba(5,10,20,0.98);border:4px solid ${pColor};border-radius:15px;padding:22px;width:100%;max-width:500px;text-align:center;box-shadow:0 0 40px rgba(0,0,0,1);box-sizing:border-box;max-height:95vh;overflow-y:auto;">
            <h1 style="color:${pColor};margin:0 0 8px;font-size:26px;letter-spacing:2px;text-transform:uppercase;">${title}</h1>
            <div style="color:#aaa;font-size:14px;margin-bottom:20px;text-transform:uppercase;">${subtitle}</div>
            <div id="modal-content-area" style="margin-bottom:20px;">${contentHtml}</div>
            <div id="modal-button-area">${buttonsHtml}</div>
        </div>`;

    document.body.appendChild(modal);
    
    // Ritorna il modal per permettere l'aggancio degli eventi
    return modal;
}

function showBonificaPanel(playerFaction, sectorId) {
    const cost = CAMPAIGN.UPGRADE_BONIFICA_COST;
    const isAdjacent = campaignState.adj[sectorId]?.some(nbId => campaignState.sectors[nbId]?.owner === playerFaction);
    
    if (!isAdjacent) return showTemporaryMessage('🚧 Bonifica possibile solo su settori adiacenti!');

    const canBuy = (campaignState.credits[playerFaction] || 0) >= cost;
    const content = `<div style="background:rgba(255,255,255,0.05);padding:15px;border-radius:10px;text-align:left;color:#ccc;font-size:14px;">
        Bonifica questa zona per renderla un settore neutrale conquistabile.
        <div style="color:#FFD700;font-size:20px;margin-top:10px;font-weight:bold;text-align:center;">Costo: 💰${cost}</div>
    </div>`;

    const modal = _gui_createModalBase(playerFaction, "🏗️ BONIFICA", `Settore ${sectorId}`, content, [
        { id: 'btn-confirm', label: `ESEGUI BONIFICA`, primary: true, disabled: !canBuy },
        { id: 'btn-cancel', label: 'ANNULLA', primary: false }
    ]);

    modal.querySelector('#btn-confirm').onclick = () => {
        modal.remove();
        if (window.isCampaignOnline && !window.isHost) {
            _net_clientSend('SECTOR_UPGRADE', { sectorId, upgradeKey: 'bonifica', cost });
        } else {
            campaignState.credits[playerFaction] -= cost;
            const s = campaignState.sectors[sectorId];
            s.blocked = false; s.owner = 0; s.income = 1;
            renderCampaignMap(); saveCampaignSnapshot();
        }
    };
    modal.querySelector('#btn-cancel').onclick = () => modal.remove();
}
window.showBonificaPanel = showBonificaPanel;

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

function _isNukeReachable(targetId, p) {
    const s = campaignState.sectors[targetId];
    if (s.owner === p) return true;
    return campaignState.adj[targetId].some(nbId => campaignState.sectors[nbId]?.owner === p);
}

// ============================================================
// UI: PANNELLO MIGLIORAMENTI SETTORE
// ============================================================
// Aperto cliccando su un settore già alleato in fase PLANNING.
// Permette di acquistare: Miniera, Campo Minato, Fortezza.

function showSectorUpgradePanel(playerFaction, sectorId) {
    const avail = campaignState.credits[playerFaction] || 0;
    const s = campaignState.sectors[sectorId];
    const isAlreadyUpgraded = s.mineUpgrade || s.mineField || s.fortressUpgrade;

    const items = [
        { key: 'mine', icon: '⛏️', name: 'Miniera', cost: CAMPAIGN.UPGRADE_MINE_COST, owned: s.mineUpgrade, desc: "+2 rendita." },
        { key: 'minefield', icon: '💣', name: 'Campo Minato', cost: CAMPAIGN.UPGRADE_MINEFIELD_COST, owned: s.mineField, desc: "Ferma il nemico." },
        { key: 'fortress', icon: '🏰', name: 'Fortezza', cost: CAMPAIGN.UPGRADE_FORTRESS_COST, owned: s.fortressUpgrade, desc: "Difesa +5 cr." }
    ];

    const contentHtml = items.map(item => {
        const canBuy = !isAlreadyUpgraded && avail >= item.cost;
        return `<div style="display:flex;align-items:center;gap:10px;padding:12px;background:rgba(255,255,255,0.04);border:1px solid #333;border-radius:8px;margin-bottom:8px; opacity:${(isAlreadyUpgraded && !item.owned) ? '0.4' : '1'}">
            <span style="font-size:24px;">${item.icon}</span>
            <div style="flex:1;text-align:left;"><b style="color:#fff;">${item.name}</b><br><small style="color:#888;">${item.desc}</small></div>
            ${item.owned ? '<b style="color:#00ff88;">ATTIVO</b>' : `<button class="action-btn upg-buy" data-key="${item.key}" data-cost="${item.cost}" style="padding:6px 12px;cursor:pointer;border:2px solid #555;color:#ccc;background:transparent;" ${!canBuy ? 'disabled' : ''}>${isAlreadyUpgraded ? '---' : `💰${item.cost}`}</button>`}
        </div>`;
    }).join('');

    const modal = _gui_createModalBase(playerFaction, "🛠️ UPGRADE", `Settore ${sectorId} | Disponibili: 💰${avail}`, contentHtml, [{ id: 'btn-close', label: 'CHIUDI', primary: false }]);

    modal.querySelectorAll('.upg-buy').forEach(btn => {
        btn.onclick = () => {
            const key = btn.dataset.key; const cost = parseInt(btn.dataset.cost);
            modal.remove();
            if (window.isCampaignOnline && !window.isHost) {
                _net_clientSend('SECTOR_UPGRADE', { sectorId, upgradeKey: key, cost });
            } else {
                campaignState.credits[playerFaction] -= cost;
                if(key==='mine'){ s.mineUpgrade=true; s.income+=2; }
                if(key==='minefield') s.mineField=true;
                if(key==='fortress') s.fortressUpgrade=true;
                playSFX('build'); renderCampaignMap(); saveCampaignSnapshot();
            }
        };
    });
    modal.querySelector('#btn-close').onclick = () => modal.remove();
}
window.showSectorUpgradePanel = showSectorUpgradePanel;

// ============================================================
// UI: SELETTORE CREDITI
// ============================================================

function showCreditSelector(playerFaction, targetSectorId) {
    const avail = campaignState.credits[playerFaction] || 0;
    const sector = campaignState.sectors[targetSectorId];
    const hasExplosion = campaignState.sectors.some(s => s.owner === playerFaction && s.specialization === 'ESPLOSIONE');
    const nukeCost = hasExplosion ? 20 : 40;
    const canNuke = _isNukeReachable(targetSectorId, playerFaction) && avail >= nukeCost;

    const content = `
        <div style="background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;color:#888;margin-bottom:15px;">
            ${sector.owner > 0 ? `Difensore: 🏦 ${campaignState.sectorCredits[targetSectorId]?.[sector.owner] || 0} cr` : 'Settore Neutrale'}
        </div>
        <div style="color:#fff;font-size:18px;margin-bottom:10px;">INVESTIMENTO: <span id="cr-val" style="color:#00ff88;font-weight:bold;font-size:24px;">4</span></div>
        <input type="range" id="cr-slider" min="${Math.min(4, avail)}" max="${avail}" value="${Math.min(4, avail)}" style="width:100%;accent-color:#00ff88;">
        <div style="color:#888;font-size:12px;margin-top:5px;">In Banca: 💰${avail}</div>
    `;

    const modal = _gui_createModalBase(playerFaction, "⚔️ ORDINE ATTACCO", `Bersaglio: Settore ${targetSectorId}`, content, [
        { id: 'btn-attack', label: 'INVIA ATTACCO', primary: true, disabled: avail < 4 },
        { id: 'btn-nuke', label: `☢️ NUCLEARIZZA (💰${nukeCost})`, primary: true, disabled: !canNuke },
        { id: 'btn-cancel', label: 'ANNULLA', primary: false }
    ]);

    const slider = modal.querySelector('#cr-slider');
    slider.oninput = () => modal.querySelector('#cr-val').textContent = slider.value;

    modal.querySelector('#btn-attack').onclick = () => {
        const val = parseInt(slider.value); modal.remove();
        if (window.isCampaignOnline && !window.isHost) _net_clientSend('CONFIRM_CREDIT_ORDER', { sectorId: targetSectorId, credits: val });
        else { _applyOrderWithCredits(targetSectorId, val, playerFaction); renderCampaignMap(); }
    };

    modal.querySelector('#btn-nuke').onclick = () => {
        const confirmMsg = `☢️ ATTENZIONE: NUCLEARIZZAZIONE\n\nEffetti:\n1. Il settore sarà BLOCCATO per l'intero turno successivo.\n2. Verranno distrutti tutti i crediti e gli upgrade in difesa.\n3. Se i nemici attaccano qui, perderanno i loro crediti nel vuoto!\n\nVuoi procedere con l'invio dell'ordine?`;
        if (!confirm(confirmMsg)) return;
        
        modal.remove();
        if (window.isCampaignOnline && !window.isHost) _net_clientSend('SABOTAGE', { sectorId: targetSectorId });
        else { _orderNuclearize(targetSectorId, playerFaction, nukeCost); renderCampaignMap(); }
    };
    modal.querySelector('#btn-cancel').onclick = () => modal.remove();
}
window.showCreditSelector = showCreditSelector;

function _orderNuclearize(sectorId, playerFaction, cost) {
    if (campaignState.credits[playerFaction] < cost) return;
    
    campaignState.credits[playerFaction] -= cost;
    
    if (!campaignState.pendingOrders[playerFaction]) campaignState.pendingOrders[playerFaction] = [];
    
    // Aggiungiamo un flag "isSabotage" per distinguerlo dagli attacchi normali
    campaignState.pendingOrders[playerFaction].push({ 
        sectorId, 
        credits: 0, 
        isSabotage: true, 
        sabotageCost: cost 
    });

    if (!campaignState._allOrderedSectors[sectorId]) campaignState._allOrderedSectors[sectorId] = [];
    campaignState._allOrderedSectors[sectorId].push(playerFaction);
    
    showTemporaryMessage("☢️ Ordine di Sabotaggio registrato!");
}

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

// ============================================================
// NUCLEARIZZAZIONE
// ============================================================
// Distrugge un settore nemico: azzera crediti e upgrade,
// lo rende bloccato per il turno corrente.
// Il prossimo turno (startNextPlanningRound) lo ripristina neutrale.

function _applyNuclearize(sectorId, playerFaction, cost = CAMPAIGN.NUCLEARIZE_COST) {
    const sector = campaignState.sectors[sectorId];
    if (cost > 0) campaignState.credits[playerFaction] -= cost;
    
    // Azzera tutti i crediti sul settore
    campaignState.sectorCredits[sectorId] = {};
    // Distrugge tutti gli upgrade
    sector.mineUpgrade    = false;
    sector.mineField      = false;
    sector.fortressUpgrade = false;
    sector.income         = 1;
    
    // Rende bloccato e imposta un timer di 2 round (scatta a 1 al prossimo round, a 0 in quello dopo)
    sector.owner          = 0;
    sector.blocked        = true;
    sector._nuclearCooldown = 2; // MODIFICA: Cooldown per gestire il blocco prolungato
    delete sector._nuclearized;  // Pulizia vecchia variabile se presente
    
    playSFX('explosion');
    showTemporaryMessage(`☢️ Settore ${sectorId} nuclearizzato!`);
}
window._applyNuclearize = _applyNuclearize;

/** Calcola il valore in crediti di un qualsiasi ordine (Attacco o Sabotaggio) */
function _eco_getOrderCost(order) {
    if (!order) return 0;
    return order.isSabotage ? (order.sabotageCost || 0) : (order.credits || 0);
}

/** Rimborsa una lista di ordini alla banca di un giocatore */
function _eco_refundOrders(playerFaction, ordersList) {
    if (!ordersList || ordersList.length === 0) return;
    ordersList.forEach(order => {
        campaignState.credits[playerFaction] += _eco_getOrderCost(order);
    });
    console.log(`[Eco] Rimborsati ${ordersList.length} ordini a P${playerFaction}`);
}

/** Cancella un ordine specifico su un settore rimborsando il costo */
function _cancelOrder(playerFaction, sectorId) {
    const orders = campaignState.pendingOrders[playerFaction] || [];
    const orderIndex = orders.findIndex(o => o.sectorId === sectorId);
    
    if (orderIndex === -1) return;

    const order = orders[orderIndex];
    // Esegue il rimborso usando la logica centralizzata
    campaignState.credits[playerFaction] += _eco_getOrderCost(order);
    
    // Rimuove l'ordine
    orders.splice(orderIndex, 1);
    delete campaignState.pendingMoves[playerFaction];

    // Pulisce l'interfaccia (i pallini colorati sulla mappa)
    if (campaignState._allOrderedSectors[sectorId]) {
        campaignState._allOrderedSectors[sectorId] = campaignState._allOrderedSectors[sectorId].filter(pid => pid !== playerFaction);
        if (campaignState._allOrderedSectors[sectorId].length === 0) delete campaignState._allOrderedSectors[sectorId];
    }
}
window._eco_cancelOrder = _cancelOrder;

// --- GESTIONE TURNI ---

function finishPlayerTurn() {
    const p = campaignState.currentPlayer;

    // Online: il client invia l'azione all'host
    if (window.isCampaignOnline && !window.isHost) {
        if (p !== window.myPlayerNumber) return;
        const hasOrders = (campaignState.pendingOrders?.[p] || []).length > 0;
        _net_clientSend(hasOrders ? 'CONFIRM_ORDER' : 'SKIP_TURN', {});
        _net_showOrderSentOverlay();
        return;
    }

    // Locale / Host: gestisce la conferma o il rimborso per skip
    const orders = campaignState.pendingOrders[p] || [];
    if (orders.length > 0) {
        campaignState.pendingMoves[p] = orders[0].sectorId;
    } else {
        // Se premo conferma senza ordini, rimborsa tutto (per sicurezza) e pulisce
        _eco_refundOrders(p, orders);
        campaignState.pendingOrders[p] = [];
        delete campaignState.pendingMoves[p];
    }

    document.getElementById('eco-orders-panel')?.remove();
    _advanceTurn();
}
window.finishPlayerTurn = finishPlayerTurn;

// skipPlayerTurn rimane per compatibilità con codice esistente (network, campaign_multiplayer)
function skipPlayerTurn() { finishPlayerTurn(); }
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
        saveCampaignSnapshot();
        renderCampaignMap();
    }
}

// ============================================================
// PERSISTENZA CAMPAGNA (localStorage)
// ============================================================

const CAMPAIGN_SAVE_KEY = 'syndicate_campaign_save';

/**
 * Serializza lo stato corrente della campagna e lo salva in localStorage.
 * Chiamata automaticamente dopo ogni azione significativa (fine turno,
 * fine battaglia, acquisto upgrade).
 * NON viene chiamata dai client online — solo da host e locale.
 */
function saveCampaignSnapshot() {
    if (window.isCampaignOnline && !window.isHost) return; // i client non salvano mai
    if (!campaignState.isActive) return;

    try {
        const snapshot = {
            numPlayers:     campaignState.numPlayers,
            currentPlayer:  campaignState.currentPlayer,
            credits:        campaignState.credits,
            turnCount:      campaignState.turnCount,
            phase:          campaignState.phase,
            sectorCredits:  campaignState.sectorCredits,
            _allOrderedSectors: campaignState._allOrderedSectors,
            sectors: campaignState.sectors.map(s => ({
                id:               s.id,
                owner:            s.owner,
                blocked:          s.blocked,
                income:           s.income,
                specialization:   s.specialization,
                mineUpgrade:      s.mineUpgrade,
                mineField:        s.mineField,
                fortressUpgrade:  s.fortressUpgrade,
                _nuclearized:     s._nuclearized || false,
            })),
            // Snapshot dei giocatori (nome + colore cosmetico)
            playerNames:  Object.fromEntries(
                Object.entries(players).map(([k, v]) => [k, {
                    name:             v.name,
                    color:            v.color,
                    _cosmeticFaction: v._cosmeticFaction,
                }])
            ),
            savedAt: Date.now(),
        };
        localStorage.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(snapshot));
        console.log('[Campaign] Snapshot salvato. Turno:', campaignState.turnCount);
    } catch (e) {
        console.warn('[Campaign] Impossibile salvare snapshot:', e);
    }
}
window.saveCampaignSnapshot = saveCampaignSnapshot;

/**
 * Ritorna il salvataggio esistente (oggetto parsed) oppure null.
 */
function getCampaignSave() {
    try {
        const raw = localStorage.getItem(CAMPAIGN_SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}
window.getCampaignSave = getCampaignSave;

/**
 * Cancella il salvataggio campagna.
 */
function clearCampaignSave() {
    localStorage.removeItem(CAMPAIGN_SAVE_KEY);
    console.log('[Campaign] Salvataggio cancellato.');
}
window.clearCampaignSave = clearCampaignSave;

/**
 * Carica uno snapshot e ripristina campaignState + settori + players.
 * Chiamata solo da host/locale quando l'utente sceglie "Carica Campagna".
 */
function loadCampaignSnapshot(snapshot) {
    window.state = 'CAMPAIGN_MAP';

    // Nascondi menu e overlay di gioco
    ['setup-overlay', 'controls-panel', 'network-menu'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Ripristina dati giocatori (cosmetici)
    if (snapshot.playerNames) {
        Object.entries(snapshot.playerNames).forEach(([k, v]) => {
            if (players[k]) {
                players[k].name             = v.name;
                players[k].color            = v.color;
                players[k]._cosmeticFaction = v._cosmeticFaction;
            }
        });
    }

    // Ripristina campi campagna
    Object.assign(campaignState, {
        isActive:           true,
        numPlayers:         snapshot.numPlayers,
        currentPlayer:      snapshot.currentPlayer,
        credits:            snapshot.credits,
        turnCount:          snapshot.turnCount,
        phase:              'PLANNING',  // riparte sempre in fase planning
        sectorCredits:      snapshot.sectorCredits || {},
        pendingOrders:      {},
        pendingMoves:       {},
        _allOrderedSectors: snapshot._allOrderedSectors || {},
        _currentBattle:     null,
        battleQueue:        [],
        victoryThreshold:   Math.floor(campaignState.sectors.length / 2) + 1,
    });
    window.totalPlayers = snapshot.numPlayers;

    // Ripristina settori
    snapshot.sectors.forEach(saved => {
        const live = campaignState.sectors[saved.id];
        if (!live) return;
        live.owner          = saved.owner;
        live.blocked        = saved.blocked;
        live.income         = saved.income;
        live.specialization = saved.specialization;
        live.mineUpgrade    = saved.mineUpgrade;
        live.mineField      = saved.mineField;
        live.fortressUpgrade = saved.fortressUpgrade;
        live._nuclearized    = saved._nuclearized || false;
    });

    renderCampaignMap();
    console.log('[Campaign] Snapshot caricato. Turno:', snapshot.turnCount);
}
window.loadCampaignSnapshot = loadCampaignSnapshot;

markScriptAsLoaded('campaign_map.js');