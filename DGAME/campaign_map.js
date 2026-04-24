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
    { id: 'ESPLOSIONE',label: '💥 Esplosivi',desc: 'Distruggi tutti i crediti di un settore nemico adiacente (Costo: 30💰)' },
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
    const pColor = players[currP].color || COLORS['p' + currP];

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

    const HEX_R = CAMPAIGN.HEX_SIZE;
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

            // Immagine HQ di fazione sovrapposta al testo "HQ"
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
                const dw = 18, dh = 9, gap = 2;
                const tot = allT.length * (dw + gap) - gap;
                allT.forEach((pid, i) => {
                    const dc = players[pid].color || COLORS['p' + pid];
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

    const HEX_R = CAMPAIGN.HEX_SIZE;
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
            etxt.setAttribute('x', cx + 40); etxt.setAttribute('y', cy - 4);
            etxt.setAttribute('text-anchor','middle'); etxt.setAttribute('dominant-baseline','middle');
            etxt.setAttribute('font-size','35'); etxt.setAttribute('fill-opacity','0.95');
            etxt.setAttribute('pointer-events','none');
            etxt.textContent = emoji;
            g.appendChild(etxt);
        }

        // Badge upgrade: Miniera, Campo Minato, Fortezza
        // Mostrati in basso a sinistra del settore, uno accanto all'altro
        const upgradeIcons = [];
        if (s.mineUpgrade)      upgradeIcons.push('⛏️');
        if (s.mineField)        upgradeIcons.push('💣');
        if (s.fortressUpgrade)  upgradeIcons.push('🏰');
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
    if (target.owner === p) {
        // Click su settore già alleato → pannello miglioramenti
        showSectorUpgradePanel(p, targetId);
        return;
    }

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
// UI: PANNELLO MIGLIORAMENTI SETTORE
// ============================================================
// Aperto cliccando su un settore già alleato in fase PLANNING.
// Permette di acquistare: Miniera, Campo Minato, Fortezza.

function showSectorUpgradePanel(playerFaction, sectorId) {
    // Online: il client delega all'host
    if (window.isCampaignOnline && !window.isHost) {
        _net_clientSend('SECTOR_UPGRADE_PANEL', { sectorId });
        return;
    }

    const avail  = campaignState.credits[playerFaction] || 0;
    const sector = campaignState.sectors[sectorId];
    const pColor = COLORS['p' + playerFaction];
    const pName  = players[playerFaction]?.name || 'P' + playerFaction;

    // Stato corrente degli upgrade
    const hasMine      = !!sector.mineUpgrade;
    const hasMinefield = !!sector.mineField;
    const hasFortress  = !!sector.fortressUpgrade;

    const canMine      = !hasMine      && avail >= CAMPAIGN.UPGRADE_MINE_COST;
    const canMinefield = !hasMinefield && avail >= CAMPAIGN.UPGRADE_MINEFIELD_COST;
    const canFortress  = !hasFortress  && avail >= CAMPAIGN.UPGRADE_FORTRESS_COST;

    function upgradeRow(icon, name, desc, cost, owned, canBuy, upgradeKey) {
        const btnId = `upg-btn-${upgradeKey}`;
        if (owned) {
            return `<div style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:8px;
                        background:rgba(0,255,136,0.08);border:2px solid #00ff8855;margin-bottom:10px;">
                <span style="font-size:28px;">${icon}</span>
                <div style="flex:1;text-align:left;">
                    <div style="color:#00ff88;font-weight:bold;font-size:16px;">${name} <span style="font-size:13px;">✓ ATTIVO</span></div>
                    <div style="color:#888;font-size:12px;">${desc}</div>
                </div>
            </div>`;
        }
        const btnStyle = canBuy
            ? `border:2px solid ${pColor};color:${pColor};background:${pColor}15;cursor:pointer;padding:10px 18px;border-radius:6px;font-weight:bold;font-size:15px;white-space:nowrap;`
            : `border:2px solid #444;color:#555;background:transparent;cursor:not-allowed;padding:10px 18px;border-radius:6px;font-weight:bold;font-size:15px;white-space:nowrap;`;
        return `<div style="display:flex;align-items:center;gap:12px;padding:14px;border-radius:8px;
                    background:rgba(255,255,255,0.04);border:1px solid #333;margin-bottom:10px;">
            <span style="font-size:28px;">${icon}</span>
            <div style="flex:1;text-align:left;">
                <div style="color:#fff;font-weight:bold;font-size:16px;">${name}</div>
                <div style="color:#888;font-size:12px;">${desc}</div>
            </div>
            <button id="${btnId}" style="${btnStyle}" ${canBuy ? '' : 'disabled'}>
                💰${cost}
            </button>
        </div>`;
    }

    const modal = document.createElement('div');
    modal.id = 'sector-upgrade-modal';
    modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.92);z-index:999999;
        display:flex;align-items:center;justify-content:center;
        font-family:Courier New;padding:10px;box-sizing:border-box;`;

    modal.innerHTML = `
        <div style="background:rgba(5,10,20,0.98);border:4px solid ${pColor};border-radius:15px;
                    padding:22px;width:100%;max-width:520px;max-height:95vh;overflow-y:auto;
                    text-align:center;box-shadow:0 0 40px rgba(0,0,0,1);box-sizing:border-box;">

            <h1 style="color:${pColor};margin:0 0 4px;font-size:clamp(20px,5vw,30px);
                        letter-spacing:2px;text-transform:uppercase;">MIGLIORA SETTORE</h1>
            <div style="color:#aaa;font-size:14px;margin-bottom:16px;">
                ${pName} — Settore ${sectorId} &nbsp;|&nbsp;
                💰 Disponibili: <span style="color:#FFD700;font-weight:bold;">${avail}</span>
            </div>

            <div id="upgrade-rows">
                ${upgradeRow('⛏️', 'Miniera', `+1 rendita permanente (passa al nemico se conquista). Costo: ${CAMPAIGN.UPGRADE_MINE_COST}💰`,
                    CAMPAIGN.UPGRADE_MINE_COST, hasMine, canMine, 'mine')}
                ${upgradeRow('💣', 'Campo Minato', `Il primo attacco nemico su questo settore viene fermato qui (l'attaccante non conquista). Costo: ${CAMPAIGN.UPGRADE_MINEFIELD_COST}💰`,
                    CAMPAIGN.UPGRADE_MINEFIELD_COST, hasMinefield, canMinefield, 'minefield')}
                ${upgradeRow('🏰', 'Fortezza', `In difesa, il tuo esercito riceve +${CAMPAIGN.UPGRADE_FORTRESS_COST / 2} crediti extra in battaglia. Costo: ${CAMPAIGN.UPGRADE_FORTRESS_COST}💰`,
                    CAMPAIGN.UPGRADE_FORTRESS_COST, hasFortress, canFortress, 'fortress')}
            </div>

            <button style="width:100%;margin-top:8px;border:2px solid #555;color:#888;
                           padding:12px;font-size:16px;background:transparent;cursor:pointer;
                           border-radius:8px;font-family:Courier New;"
                    onclick="document.getElementById('sector-upgrade-modal').remove();">
                CHIUDI
            </button>
        </div>`;

    document.body.appendChild(modal);

    // Handler acquisto — usa closure su variabili già calcolate
    function _attachUpgradeBtn(btnId, upgradeKey, cost, onApply) {
        const btn = modal.querySelector(`#${btnId}`);
        if (!btn || btn.disabled) return;
        btn.onclick = () => {
            if ((campaignState.credits[playerFaction] || 0) < cost) return;
            // Online: client invia ordine all'host
            if (window.isCampaignOnline && !window.isHost) {
                modal.remove();
                _net_clientSend('SECTOR_UPGRADE', { sectorId, upgradeKey, cost });
                return;
            }
            campaignState.credits[playerFaction] -= cost;
            onApply();
            modal.remove();
            renderCampaignMap();
            if (window.isCampaignOnline && window.isHost) _net_hostBroadcast();
        };
    }

    _attachUpgradeBtn('upg-btn-mine', 'mine', CAMPAIGN.UPGRADE_MINE_COST, () => {
        sector.mineUpgrade = true;
        sector.income     += 1;
        playSFX('build');
        showTemporaryMessage(`⛏️ Miniera costruita nel Settore ${sectorId}! Rendita: +${sector.income}/turno`);
    });

    _attachUpgradeBtn('upg-btn-minefield', 'minefield', CAMPAIGN.UPGRADE_MINEFIELD_COST, () => {
        sector.mineField = true;
        playSFX('build');
        showTemporaryMessage(`💣 Campo Minato piazzato nel Settore ${sectorId}!`);
    });

    _attachUpgradeBtn('upg-btn-fortress', 'fortress', CAMPAIGN.UPGRADE_FORTRESS_COST, () => {
        sector.fortressUpgrade = true;
        playSFX('build');
        showTemporaryMessage(`🏰 Fortezza costruita nel Settore ${sectorId}! +${CAMPAIGN.UPGRADE_FORTRESS_COST / 2} crediti in difesa`);
    });
}
window.showSectorUpgradePanel = showSectorUpgradePanel;

// ============================================================
// UI: SELETTORE CREDITI
// ============================================================

function showCreditSelector(playerFaction, targetSectorId) {
    const avail   = campaignState.credits[playerFaction] || 0;
    const minCost = 4;
    const sector  = campaignState.sectors[targetSectorId];
    const defCredits = sector.owner > 0 ? (campaignState.sectorCredits[targetSectorId]?.[sector.owner] || 0) : 0;
    const pColor  = players[playerFaction]?.color || COLORS['p' + playerFaction];
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

    // Online: il client invia l'azione all'host (sia con che senza ordini)
    if (window.isCampaignOnline && !window.isHost) {
        if (p !== window.myPlayerNumber) return;
        const panel = document.getElementById('eco-orders-panel');
        if (panel) panel.remove();
        // Se ha ordini conferma, altrimenti skippa — l'host gestisce entrambi
        const hasOrders = (campaignState.pendingOrders?.[p] || []).length > 0;
        _net_clientSend(hasOrders ? 'CONFIRM_ORDER' : 'SKIP_TURN', {});
        _net_showOrderSentOverlay();
        return;
    }

    // Locale / Host: rimborsa eventuali ordini annullati, poi avanza
    const orders = campaignState.pendingOrders[p] || [];
    if (orders.length > 0) {
        campaignState.pendingMoves[p] = orders[0].sectorId;
    } else {
        // Nessun ordine: comportamento equivalente a "passa turno"
        orders.forEach(o => {
            campaignState.credits[p] = (campaignState.credits[p] || 0) + o.credits;
        });
        campaignState.pendingOrders[p] = [];
        delete campaignState.pendingMoves[p];
    }

    const panel = document.getElementById('eco-orders-panel');
    if (panel) panel.remove();

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
        renderCampaignMap();
    }
}
