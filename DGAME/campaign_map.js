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
   - Persistenza campagna (save/load snapshot)
   - Menu campagna e modale info

   ESPONE: campaignState, startCampaign, renderCampaignMap,
           handleSectorClick, finishPlayerTurn, skipPlayerTurn,
           saveCampaignSnapshot, loadCampaignSnapshot, clearCampaignSave,
           showCampaignMenu, showCampaignInfoModal

   DIPENDE DA: constants.js (CAMPAIGN, GAME), state.js, graphics.js
   CARICATO PRIMA DI: campaign_upgrades.js, campaign_battle.js
   ============================================================ */

// Le costanti GRID_COLS, GRID_ROWS, HEX_SIZE e VICTORY_THRESHOLD
// per la mappa campagna sono definite in constants.js nell'oggetto CAMPAIGN.
// Aliasati qui come variabili locali per leggibilità nel resto del file.
const GRID_COLS = CAMPAIGN.GRID_COLS;
const GRID_ROWS = CAMPAIGN.GRID_ROWS;
// NOTA: CAMPAIGN.HEX_SIZE è usato solo per il rendering della mappa strategica.
// Non sovrascrive più HEX_SIZE globale di state.js, che rimane per il gioco tattico.

const CAMPAIGN_HQ_POSITIONS = {
    2: [1, 55],
    3: [1, 55, 61],
    4: [1, 55, 61, 7],
};

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
    hqSlots:     [],
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
    units:         [],   // NUOVO: unità persistenti { id, owner, sectorId, value, type, hasActedThisTurn }
    _nextUnitId:   1,
    pendingUnitMoves: {}, // { [player]: [{unitId, destSectorId}] } — ordini in attesa, applicati insieme a fine turno
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

    // Calcolo dei vicini (CORRETTO per griglia Pointy Top con offset sulle righe dispari)
    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            const cid = matrix[r][c];
            a[cid] = [];
            const neighbors = (r % 2 === 0)
                ? [[0,-1],[0,1],[-1,-1],[-1,0],[1,-1],[1,0]] // Riga Pari
                : [[0,-1],[0,1],[-1,0],[-1,1],[1,0],[1,1]];  // Riga Dispari
                
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
    const audioBtn = document.getElementById('audio-toggle');
    if (audioBtn) { audioBtn.style.display = 'block'; audioBtn.style.zIndex = '100002'; }

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
        victoryThreshold: CAMPAIGN.VICTORY_THRESHOLD,
        units:       [],
        _nextUnitId: 1,
        pendingUnitMoves: {},
    });

    // Forza le referenze in base allo stato online globale
    if (window.isCampaignOnline) {
        window.totalPlayers = numPlayers;
    }

    // Costruisce la mappa hqId per fazione PRIMA del proxy
    // MODIFICA: Creiamo una copia dell'array e lo mescoliamo casualmente
    const allSlotsPool = [...CAMPAIGN_HQ_POSITIONS[4]]; 
    shuffleArray(allSlotsPool);
    campaignState.hqSlots = allSlotsPool.slice(0, numPlayers);
    
    const _hqIdByPlayer = {};
    for (let p = 1; p <= numPlayers; p++) {
        _hqIdByPlayer[p] = campaignState.hqSlots[p - 1];
        const hqId = _hqIdByPlayer[p];
        if (!campaignState.sectorCredits[hqId]) campaignState.sectorCredits[hqId] = {};
        campaignState.sectorCredits[hqId][p] = CAMPAIGN.STARTING_CREDITS;
    }

// Proxy: credits[p] legge e scrive sempre sectorCredits[hqId][p]
campaignState.credits = new Proxy({}, {
    get(_, p) {
        const hqId = _hqIdByPlayer[+p];
        if (!hqId) return 0;
        return campaignState.sectorCredits[hqId]?.[+p] || 0;
    },
    set(_, p, value) {
        const hqId = _hqIdByPlayer[+p];
        if (!hqId) return true;
        if (!campaignState.sectorCredits[hqId]) campaignState.sectorCredits[hqId] = {};
        campaignState.sectorCredits[hqId][+p] = value;
        return true;
    }
});

    campaignState.sectors.forEach(s => {
        s.owner = 0;
        s.blocked = false;
        s.income = undefined;
        s.specialization = undefined;
        // Reset upgrade: pulizia completa prima di rigenerare
        if (window.CAMPAIGN_UPGRADE_KEYS) {
            window.CAMPAIGN_UPGRADE_KEYS.forEach(key => { s[key] = false; });
        }
    });

    // MODIFICA: Riutilizziamo l'array appena mescolato per assegnare la proprietà visiva
    const hqSlots = campaignState.hqSlots; 
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
        campaignState._creditsAtRoundStart = {};
        for (let p = 1; p <= numPlayers; p++) {
            campaignState._creditsAtRoundStart[p] = campaignState.credits[p] || 0;
        }
        campaignState._sectorCreditsAtRoundStart = JSON.parse(JSON.stringify(campaignState.sectorCredits || {}));
        campaignState._sectorsAtRoundStart = {};
        campaignState.sectors.forEach(s => {
            let snapObj = {};
            snapObj.income = s.income;
            // Usa la lista dinamica di tutti gli upgrade disponibili
            if (window.CAMPAIGN_UPGRADE_KEYS) {
                window.CAMPAIGN_UPGRADE_KEYS.forEach(k => {
                    snapObj[k] = s[k] || false;
                });
            } else {
                // Fallback di sicurezza
                snapObj.mineUpgrade     = s.mineUpgrade || false;
                snapObj.mineField       = s.mineField || false;
                snapObj.fortressUpgrade = s.fortressUpgrade || false;
            }
            campaignState._sectorsAtRoundStart[s.id] = snapObj;
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
    const totalToBlock = CAMPAIGN.BLOCKED_SECTORS_COUNT;
    const blocked = new Set();

    // 1. Creiamo un Set di settori "sicuri" che non possono essere bloccati.
    // Inizializziamo il Set con gli ID degli HQ.
    const safeSectors = new Set(hqSlots);
    
    // 2. Aggiungiamo ai settori sicuri anche tutti i vicini immediati degli HQ
    hqSlots.forEach(hqId => {
        const neighbors = campaignState.adj[hqId] || [];
        neighbors.forEach(nbId => safeSectors.add(nbId));
    });

    // 3. I candidati per diventare settori bloccati sono tutti i settori 
    // della mappa TRANNE quelli presenti nel Set "safeSectors"
    let candidates = campaignState.sectors.map(s => s.id).filter(id => !safeSectors.has(id));
    
    // Shuffle dei candidati per renderli casuali
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    // 4. Assegnazione dei settori bloccati controllando che la mappa resti connessa
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
    const hqSlots = campaignState.hqSlots;
    const hqSet   = new Set(hqSlots);

    // Inizializza rendita e terreno
    campaignState.sectors.forEach(s => {
        if (!campaignState.sectorCredits[s.id]) campaignState.sectorCredits[s.id] = {};
        s.income = hqSet.has(s.id) ? CAMPAIGN.HQ_INCOME : 1 + Math.floor(Math.random() * 1);
        s.terrain = CAMPAIGN_TERRAIN_DEFS[Math.floor(Math.random() * CAMPAIGN_TERRAIN_DEFS.length)].key;
    });

    // --- 1. CREIAMO LA ZONA DI ESCLUSIONE (HQ + Adiacenti) ---
    // Come per i settori bloccati, non vogliamo upgrade gratuiti subito fuori dalla base.
    const safeSectors = new Set(hqSlots);
    hqSlots.forEach(hqId => {
        const neighbors = campaignState.adj[hqId] || [];
        neighbors.forEach(nbId => safeSectors.add(nbId));
    });

    // --- UPGRADE CASUALI SU SETTORI NEUTRALI ---
    // Candidati: settori non bloccati, non già posseduti e NON PRESENTI nella zona sicura
    const candidates = campaignState.sectors
        .filter(s => !s.blocked && !safeSectors.has(s.id) && s.owner === 0)
        .map(s => s.id);

    // Shuffle candidati
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    // Costruisce pool pesato inversamente al costo
    const upgradePool = window.CAMPAIGN_UPGRADE_DEFS.filter(d =>
        !['nukeUnlockUpgrade', 'icbmUpgrade', 'revoltUpgrade', 'hangarUpgrade'].includes(d.key)
    );

    const weights = upgradePool.map(d => 1 / d.cost());
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    function pickRandomUpgrade() {
        let r = Math.random() * totalWeight;
        for (let i = 0; i < upgradePool.length; i++) {
            r -= weights[i];
            if (r <= 0) return upgradePool[i];
        }
        return upgradePool[upgradePool.length - 1];
    }

    // Piazzerà fino al numero massimo consentito, in base alle celle effettivamente rimaste valide
    const count = Math.min(CAMPAIGN.NEUTRAL_UPGRADES_COUNT, candidates.length);
    const placed = candidates.slice(0, count);

    placed.forEach(sectorId => {
        const s = campaignState.sectors[sectorId];
        const upg = pickRandomUpgrade();
        s[upg.key] = true;
        // Effetto immediato miniera
        if (upg.key === 'mineUpgrade') s.income += CAMPAIGN.UPGRADE_MINE_INCOME;
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

    // --- 1. Generazione Lista Crediti (In alto a sinistra) ---
    let creditsHtml = '';
    for (let p = 1; p <= n; p++) {
        const c = players[p].color || COLORS['p' + p];
        const isConfirmed = (campaignState._confirmedList || []).includes(p);
        const isLiveConnected = !window.isCampaignOnline || p === 1 || (typeof clientConns !== 'undefined' && clientConns[p]) || (typeof window.myPlayerNumber !== 'undefined' && p === window.myPlayerNumber);
        const isAI = typeof onlineAIFactions !== 'undefined' && onlineAIFactions.has(p);

        let statusIcon = isConfirmed ? ' ✅' : '';
        if (isAI) statusIcon = ' 🤖';
        else if (players[p].isDisconnected && !isLiveConnected) statusIcon = ' <span style="color:#ff3333;">❌</span>';
        
        const nameLabel = (players[p].name || ('P' + p)) + statusIcon;
        const isEliminated = !campaignState.sectors.some(s => s.owner === p);
        const ownedCnt = campaignState.sectors.filter(s => s.owner === p).length;
        
        let displayCredits = campaignState.credits[p];
        if (window.isCampaignOnline && campaignState.phase === 'PLANNING' && p !== window.myPlayerNumber) {
            displayCredits = campaignState._creditsAtRoundStart?.[p] ?? campaignState.credits[p];
        }

        // NUOVO: rendita totale (somma income dei settori posseduti) e upkeep totale
        // (numero unità possedute × costo unitario) del giocatore p.
        const totalIncome = campaignState.sectors.reduce((sum, s) => s.owner === p ? sum + (s.income ?? 1) : sum, 0);
        const totalUpkeep = campaignState.units.filter(u => u.owner === p).length * CAMPAIGN.UNIT_UPKEEP;

        creditsHtml += `
            <div style="color:${c}; margin-bottom:2px; font-weight:bold; font-size:12px; 
                        display:flex; flex-direction:row; align-items:center; gap:6px; 
                        background:rgba(0,0,0,0.75); padding:3px 8px; border-left:3px solid ${c}; 
                        border-radius:0 4px 4px 0; text-shadow:1px 1px 2px #000;
                        white-space:nowrap; pointer-events:auto; ${isEliminated ? 'opacity:0.3;' : ''}">
                <span style="min-width:70px; max-width:100px; overflow:hidden; text-overflow:ellipsis;">${nameLabel}</span>
                <span id="top-credits-${p}" style="color:#FFD700;">💰${displayCredits}</span>
                <span style="color:#4CFF4C;" title="Rendita">+${totalIncome}</span>
                <span style="color:#FF5C5C;" title="Mantenimento unità">-${totalUpkeep}</span>
                <span style="display:inline-flex; align-items:center; gap:3px; color:#fff; opacity:0.9;">
                    <svg width="12" height="12" viewBox="0 0 12 12" style="flex-shrink:0;">
                        <rect x="1" y="0" width="1.4" height="12" fill="#ccc"/>
                        <path d="M2.4 1 L11 3.2 L2.4 5.4 Z" fill="${c}"/>
                    </svg>${ownedCnt}
                </span>
            </div>`;
    }

    // --- 2. Definizione del Pulsante Unificato (In basso a sinistra) ---
    const isPlanning = campaignState.phase === 'PLANNING';
    const combinedButtonHtml = isPlanning
        ? `<button class="action-btn" onclick="if(typeof playSFX === 'function') playSFX('airdrop'); this.disabled=true; this.style.opacity='0.5'; finishPlayerTurn()" 
            style="border:3px solid ${pColor}; color:${pColor}; background:rgba(5,10,20,0.95); pointer-events:auto; padding:12px 30px; cursor:pointer; font-weight:bold; box-shadow:0 0 25px ${pColor}66; border-radius:12px; text-align:center; min-width:240px; transition: transform 0.1s; font-family:'Courier New';">
                <div style="font-size:18px; text-transform:uppercase; letter-spacing:1px;">TURNO ${campaignState.turnCount}</div>
                <div style="font-size:18px; opacity:0.8; letter-spacing:2px; margin-top:2px; border-top:1px solid ${pColor}44; padding-top:2px; font-weight:normal;">CONFERMA ORDINI</div>
           </button>`
        : `<div style="border:3px solid #555; color:#aaa; background:rgba(5,10,20,0.95); padding:12px 30px; font-weight:bold; border-radius:12px; text-align:center; min-width:240px; opacity:0.8;">
                <div style="font-size:26px; text-transform:uppercase; letter-spacing:1px;">ROUND ${campaignState.turnCount}</div>
                <div style="font-size:11px; opacity:0.6; letter-spacing:2px; margin-top:2px; border-top:1px solid #555; padding-top:2px; font-weight:normal;">RISOLUZIONE...</div>
           </div>`;

    // --- 3. Costruzione Layout HTML Finale ---
    overlay.innerHTML = `
        <!-- Sfondo scurito -->
        <div style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.3); z-index:0; pointer-events:none;"></div>
        
        <!-- UI Superiore Sinistra: Crediti -->
        <div style="position:absolute; top:5px; left:0; z-index:100; pointer-events:none; display:flex; flex-direction:column;">
            <div style="margin-bottom:5px; padding-left:10px; pointer-events:auto;">${creditsHtml}</div>
        </div>

        <!-- UI Superiore Destra: Info e Musica -->
        <div style="position:absolute; top:45px; right:5px; z-index:100001; display:flex; flex-direction:column; gap:5px; align-items:flex-end;">
            <button id="campaign-info-btn" style="background:rgba(0,0,0,0.8); color:${pColor}; border:1px solid ${pColor}; padding:8px 6px; cursor:pointer; font-family:'Courier New'; font-weight:bold; border-radius:5px; font-size:14px;">ⓘ INFO</button>
        </div>

        <!-- Area Mappa (SVG con Zoom/Pan) -->
        <div id="map-area" style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; z-index:2; overflow:hidden; touch-action:none; cursor:grab;">
            <svg id="map-svg" viewBox="0 0 1000 750" style="width:98vw; height:95vh; overflow:visible; transition: transform 0.05s linear; transform-origin: center; will-change: transform;" preserveAspectRatio="xMidYMid meet"></svg>
        </div>

        <!-- UI Inferiore Sinistra: Pulsante Turno/Conferma -->
        <div id="campaign-actions" style="position:absolute; bottom:10px; left:10px; z-index:1001; display:flex; flex-direction:column; align-items:flex-start; pointer-events:none;">
            ${combinedButtonHtml}
        </div>
    `;

    // --- 4. Inizializzazione Eventi e Grafica ---
    
    // Bottone Musica
    
    // Bottone Info
    document.getElementById('campaign-info-btn').onclick = e => { e.stopPropagation(); showCampaignInfoModal(); };
    const _ab = document.getElementById('audio-toggle');
    if (_ab) { _ab.style.borderColor = pColor; _ab.style.boxShadow = `0 0 12px ${pColor}`; }

    // Rendering Mappa e Badge
    _renderMapSVG();
    _decorateSectors();
    _decorateUnits();
    
    // Sincronizzazione Multiplayer
    if (window.isCampaignOnline) _net_applyTurnState();

    // --- 5. Gestione Zoom e Pan ---
    const mapArea = document.getElementById('map-area');
    const mapSvg = document.getElementById('map-svg');
    if (mapArea && mapSvg) {
        const updateMapTransform = () => {
            // Limiti allargati per permettere di esplorare i bordi comodamente
            const limitX = 450 + (mapScale - 1) * 600;
            const limitY = 300 + (mapScale - 1) * 450;
            mapOffsetX = Math.max(-limitX, Math.min(limitX, mapOffsetX));
            mapOffsetY = Math.max(-limitY, Math.min(limitY, mapOffsetY));
            mapSvg.style.transform = `translate(${mapOffsetX}px, ${mapOffsetY}px) scale(${mapScale})`;
        };
        
        updateMapTransform();

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

        // --- INIZIO NUOVO: PAN CON MOUSE (Desktop) ---
        let isMouseDragging = false;
        let lastMouseX = 0, lastMouseY = 0;

        mapArea.addEventListener('mousedown', (e) => {
            isMouseDragging = true;
            hasMovedSignificantly = false; // Evita di cliccare i settori se si sta trascinando
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
        });

        mapArea.addEventListener('mousemove', (e) => {
            if (!isMouseDragging) return;
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            
            // Soglia minima per distinguere un click da un trascinamento
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMovedSignificantly = true;
            
            mapOffsetX += dx;
            mapOffsetY += dy;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            updateMapTransform();
        });

        mapArea.addEventListener('mouseup', () => { isMouseDragging = false; });
        mapArea.addEventListener('mouseleave', () => { isMouseDragging = false; });

        // Blocca il menu del tasto destro sulla mappa della campagna
        mapArea.addEventListener('contextmenu', (e) => { e.preventDefault(); });
        
        // --- FINE NUOVO ---
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
    bgImage.style.opacity = '0.30'; // <-- Abbassato da 0.7 per aumentare la trasparenza
    svg.appendChild(bgImage);

    const HEX_R = CAMPAIGN.HEX_SIZE;
    const hqSet = new Set(campaignState.hqSlots || []);

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
        const isSecretlyBlocked = s._bonifiedThisRoundBy && s._bonifiedThisRoundBy !== myP && campaignState.phase === 'PLANNING';
        const isEffectivelyBlocked = s.blocked || isSabotagedByMe || isSecretlyBlocked;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.style.cursor = isEffectivelyBlocked ? 'not-allowed' : 'pointer';

        if (isEffectivelyBlocked) {
            // Sfondo esagono rosso scuro
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', pts);
            poly.setAttribute('fill', 'rgba(40,10,10,0.085)');
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
                font-size: 30px; 
                font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Android Emoji", sans-serif;
                pointer-events: none;
                filter: drop-shadow(0 0 12px rgba(255, 68, 68, 0.9));
            `);
            
            // MODIFICATO: Logica di selezione icona
            const isNuclear = (s._nuclearCooldown > 0) || isSabotagedByMe;
            nukeIcon.textContent = isNuclear ? '☢️' : '❌';
            
            // Pulsazione lenta
            nukeIcon.style.animation = 'campPulse 1.2s infinite alternate';
            g.appendChild(nukeIcon);
            
            // La parte relativa alla creazione dell'elemento 'text' (INNESCATA/CONTAMINATO) è stata rimossa.

        } else {
            const ownerColor = s.owner > 0 ? (players[s.owner].color || COLORS['p' + s.owner]) : null;
            const strokeColor = allT.length > 0 ? (ownerColor || '#fff') : (ownerColor || 'rgba(180,210,255,0.8)');
            const strokeW     = allT.length > 0 ? 3 : (ownerColor ? 2 : 1);
            
            // Aumentata l'opacità esadecimale da '44' a '77' per un colore molto più intenso
            const fillColor   = ownerColor ? ownerColor + '99' : 'rgba(10,15,35,0.15)';

            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', pts);
            poly.setAttribute('fill', 'rgba(10,15,35,0.15)'); // parte sempre dal neutro
            poly.setAttribute('stroke', strokeColor);
            poly.setAttribute('stroke-width', strokeW);
            poly.style.transition = 'fill 0.8s ease, filter 0.8s ease';
            
            // Aumentato il bagliore dell'ombra da 5px a 10px per farla "spiccare" di più
            if (ownerColor) poly.style.filter = `drop-shadow(0 0 10px ${ownerColor})`;
            // Applica il colore finale al frame successivo per triggerare la transizione
            requestAnimationFrame(() => { poly.setAttribute('fill', fillColor); });
            if (allT.length > 0) g.style.animation = 'campPulse 0.8s infinite alternate';
            g.appendChild(poly);

            
// --- INIZIO NUOVO CODICE: WATERMARK TERRENO ---
            if (s.terrain) {
                const terrainDef = CAMPAIGN_TERRAIN_DEFS.find(d => d.key === s.terrain);
                
                // Mappatura tra le chiavi del terreno e i file immagine
                const terrainImgMap = {
                    'forest':   'img/camp-forest.png',
                    'desert':   'img/camp-sand.png',
                    'mountain': 'img/camp-mountain.png',
                    'sea':      'img/camp-sea.png'
                };

                if (terrainImgMap[s.terrain]) {
                    // --- 1. CREA LA MASCHERA ESAGONALE ---
                    const clipId = 'clip-hex-' + s.id;
                    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                    const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
                    clipPath.setAttribute('id', clipId);
                    
                    const clipPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                    clipPoly.setAttribute('points', pts); // "pts" è già calcolato per l'esagono
                    
                    clipPath.appendChild(clipPoly);
                    defs.appendChild(clipPath);
                    g.appendChild(defs);

                    // --- 2. INSERISCI L'IMMAGINE MASCHERATA E SPECCHIATA CASUALMENTE ---
                    
                    // Creiamo un gruppo per applicare la maschera senza che venga influenzata dalla rotazione
                    const imgGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    imgGroup.setAttribute('clip-path', `url(#${clipId})`);
                    
                    const bgImg = document.createElementNS('http://www.w3.org/2000/svg', 'image');
                    bgImg.setAttributeNS(null, 'href', terrainImgMap[s.terrain]);
                    bgImg.setAttribute('x', cx - HEX_R);
                    bgImg.setAttribute('y', cy - HEX_R);
                    bgImg.setAttribute('width', HEX_R * 2);
                    bgImg.setAttribute('height', HEX_R * 2);
                    bgImg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
                    bgImg.setAttribute('opacity', '0.60'); 
                    bgImg.setAttribute('pointer-events', 'none');
                    
                    // Pseudo-casualità basata sulla Riga e Colonna della mappa campagna
                    const shouldFlip = ((s.row * 11 + s.col * 17) % 2 === 0);
                    
                    if (shouldFlip) {
                        // Specchia l'immagine orizzontalmente usando il centro dell'esagono (cx) come perno
                        bgImg.setAttribute('transform', `translate(${cx * 2}, 0) scale(-1, 1)`);
                    }
                    
                    imgGroup.appendChild(bgImg);
                    g.appendChild(imgGroup);

                } else if (terrainDef) {
                    // --- FALLBACK (Se manca l'immagine, usa l'emoji) ---
                    const bgEmoji = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    bgEmoji.setAttribute('x', cx);
                    bgEmoji.setAttribute('y', cy + (HEX_R * 0.08)); 
                    bgEmoji.setAttribute('text-anchor', 'middle');
                    bgEmoji.setAttribute('dominant-baseline', 'middle');
                    bgEmoji.setAttribute('font-size', (HEX_R * 1.35).toString());
                    bgEmoji.setAttribute('opacity', '0.25'); 
                    bgEmoji.setAttribute('pointer-events', 'none');
                    bgEmoji.setAttribute('font-family', '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif');
                    bgEmoji.textContent = terrainDef.icon;
                    g.appendChild(bgEmoji);
                }
            }
// --- FINE NUOVO CODICE ---
            

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

            // ARTIGLIERIA: mostra 💥 solo al giocatore che ha già ordinato il colpo
            const myP2 = (window.isCampaignOnline && window.myPlayerNumber) ? window.myPlayerNumber : campaignState.currentPlayer;
            const isArtilleryTarget = (campaignState._roundLog || []).some(
                entry => entry.type === 'ARTILLERY' && entry.sid === s.id && entry.p === myP2
            );
            if (isArtilleryTarget) {
                const boom = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                boom.setAttribute('x', cx + HEX_R * 0.45);
                boom.setAttribute('y', cy + HEX_R * 0.55);
                boom.setAttribute('text-anchor', 'middle');
                boom.setAttribute('dominant-baseline', 'middle');
                boom.setAttribute('style', `
                    font-size: 28px;
                    font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
                    pointer-events: none;
                    filter: drop-shadow(0 0 6px rgba(255, 140, 0, 0.9));
                `);
                boom.textContent = '💥';
                boom.style.animation = 'campPulse 0.7s infinite alternate';
                g.appendChild(boom);
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
    const hqSet   = new Set(campaignState.hqSlots || []);
    
    // MODIFICA CRITICA: il giocatore da valutare per i bottoni + e -
    const p = window.isCampaignOnline ? window.myPlayerNumber : campaignState.currentPlayer;

    campaignState.sectors.forEach(s => {
        
        const cx = s.x, cy = s.y;
        const spec = null;

        // Valori reali (quelli che il client riceve dall'host filtrati o meno)
        let alloc = campaignState.sectorCredits[s.id]?.[s.owner] || 0;
        const useSnapshot = (window.isCampaignOnline && campaignState.phase === 'PLANNING' && s.owner !== window.myPlayerNumber);
        
        if (useSnapshot) {
            alloc = campaignState._sectorCreditsAtRoundStart?.[s.id]?.[s.owner] || 0;
        }

        // 2. Lettura DINAMICA degli upgrade per i Badge
        // Ogni badge è { type: 'emoji', value } oppure { type: 'image', href, fallback }.
        const upgradeBadges = [];
        const pre = campaignState._sectorsAtRoundStart?.[s.id];

        if (window.CAMPAIGN_UPGRADE_DEFS) {
            window.CAMPAIGN_UPGRADE_DEFS.forEach(def => {
                if (def.key === 'artilleryUpgrade') return; // ora rappresentata solo dal pallino mobile, niente badge fisso
                let isUpgraded = useSnapshot && pre ? pre[def.key] : s[def.key];
                if (!isUpgraded) return;

                // MODIFICA: Se è una fortezza, ha un proprietario E il settore NON è un HQ base, usa l'immagine.
                // Altrimenti (se è neutrale o se è l'HQ principale del giocatore), usa l'emoji.
                if (def.key === 'fortressUpgrade' && s.owner > 0 && !hqSet.has(s.id)) {
                    const cosmeticId = players[s.owner]._cosmeticFaction || s.owner;
                    upgradeBadges.push({ type: 'image', href: `img/HQ${cosmeticId}.png`, fallback: def.icon });
                } else {
                    upgradeBadges.push({ type: 'emoji', value: def.icon });
                }
            });
        }

        // --- RIMOZIONE CODICE OBSOLETO FINITA ---
        // (Qui sotto continua la logica standard: allT, isCurrP, ownerColor, etc.)
        const allT = campaignState._allOrderedSectors?.[s.id] || [];
        const isConfirmed = typeof window._clientLockedRound !== 'undefined' && 
                    window._clientLockedRound === campaignState.turnCount;
                    
        let isCurrP = (s.owner === p && campaignState.phase === 'PLANNING' && !isConfirmed);
        const ownerColor = s.owner > 0 ? (players[s.owner].color || COLORS['p' + s.owner]) : null;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.classList.add('eco-badge');

        // Determina quale rendita mostrare in base alla Nebbia di Guerra
        let displayIncome = s.income;
        if (useSnapshot && pre && pre.income !== undefined) {
            displayIncome = pre.income;
        }

        // Rendita
        if (displayIncome !== undefined && !s.blocked) {
            const incomeY = cy - HEX_R * 0.65;
            const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            txt.setAttribute('x', cx); txt.setAttribute('y', incomeY);
            txt.setAttribute('text-anchor','middle'); txt.setAttribute('dominant-baseline','middle');
            txt.setAttribute('font-family','Courier New'); txt.setAttribute('font-size','20');
            txt.setAttribute('font-weight','bold'); txt.setAttribute('fill','#FFD700');
            txt.setAttribute('pointer-events','none');
            txt.textContent = displayIncome >= 0 ? `+${displayIncome}` : `${displayIncome}`;
            g.appendChild(txt);

            
            // NUOVO: emoji del terreno subito a fianco della rendita
            if (s.terrain) {
                const terrainDef = CAMPAIGN_TERRAIN_DEFS.find(d => d.key === s.terrain);
                if (terrainDef) {
                    const terr = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    terr.setAttribute('x', cx + 22); terr.setAttribute('y', incomeY);
                    terr.setAttribute('text-anchor', 'middle'); terr.setAttribute('dominant-baseline', 'middle');
                    terr.setAttribute('font-size', '14');
                    terr.setAttribute('pointer-events', 'none');
                    terr.setAttribute('opacity', '0.85');
                    terr.textContent = terrainDef.icon;
                    g.appendChild(terr);
                }
            }
            
        }
        
        // Rendering centrato dinamico degli Upgrade (evita fuoriuscite se sono tanti)
        if (upgradeBadges.length > 0) {
            const gap = 20; // distanza tra un'icona e l'altra
            const totalWidth = (upgradeBadges.length - 1) * gap;
            const startX = cx - (totalWidth / 2); // Centra il blocco di icone sull'asse X
            const badgeY = cy + HEX_R * -0.34;

            upgradeBadges.forEach((badge, idx) => {
                const bx = startX + (idx * gap);

                if (badge.type === 'image') {
                    const size = 44; // 22 * 3 — tripla dimensione rispetto all'emoji originale
                    const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
                    img.setAttributeNS(null, 'href', badge.href);
                    img.setAttributeNS(null, 'x', bx - size / 2);
                    img.setAttributeNS(null, 'y', badgeY - size / 2);
                    img.setAttributeNS(null, 'width', size);
                    img.setAttributeNS(null, 'height', size);
                    img.setAttribute('pointer-events', 'none');

                    // Fallback: se img/HQ{n}.png non si carica, torna all'emoji 🏰 originale
                    img.onerror = () => {
                        img.remove();
                        const utxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                        utxt.setAttribute('x', bx);
                        utxt.setAttribute('y', badgeY);
                        utxt.setAttribute('text-anchor', 'middle');
                        utxt.setAttribute('dominant-baseline', 'middle');
                        utxt.setAttribute('font-size', '24');
                        utxt.setAttribute('pointer-events', 'none');
                        utxt.textContent = badge.fallback;
                        g.appendChild(utxt);
                    };
                    g.appendChild(img);
                } else {
                    const utxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    utxt.setAttribute('x', bx);
                    utxt.setAttribute('y', badgeY);
                    utxt.setAttribute('text-anchor', 'middle');
                    utxt.setAttribute('dominant-baseline', 'middle');
                    utxt.setAttribute('font-size', '24'); // Leggermente più piccole per farne stare di più
                    utxt.setAttribute('pointer-events', 'none');
                    utxt.textContent = badge.value;
                    g.appendChild(utxt);
                }
            });
        }

        // Il vecchio sistema di allocazione crediti (+/−) sui settori normali non esiste più:
        // gli attacchi sono ora gestiti dalle unità mobili. Il valore in crediti resta visibile
        // solo sulla propria base (HQ).
        const hqSlotsAlloc = campaignState.hqSlots;
        const isMyHQ = isCurrP && hqSlotsAlloc[s.owner - 1] === s.id;
        if (isMyHQ && alloc > 0) {
            const atxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            atxt.id = `hq-alloc-val-${s.id}`;
            atxt.setAttribute('x', cx); atxt.setAttribute('y', cy + HEX_R * 0.5);
            atxt.setAttribute('text-anchor','middle'); atxt.setAttribute('dominant-baseline','middle');
            atxt.setAttribute('font-family','Courier New'); atxt.setAttribute('font-size','20');
            atxt.setAttribute('font-weight','bold'); atxt.setAttribute('fill','#ffffff');
            atxt.setAttribute('pointer-events','none');
            atxt.textContent = `💼${alloc}`;
            g.appendChild(atxt);
        }
        svg.appendChild(g);
    });
}

// ============================================================
// RENDERING UNITÀ PERSISTENTI SULLA MAPPA
// ============================================================

function _decorateUnits() {
    const svg = document.getElementById('map-svg');
    if (!svg) return;
    svg.querySelectorAll('.unit-token').forEach(el => el.remove());

    const HEX_R  = CAMPAIGN.HEX_SIZE;
    const localP = window.isCampaignOnline ? window.myPlayerNumber : campaignState.currentPlayer;
    const selectedUnitId = campaignState._pendingUnitMove || campaignState._pendingUnitFire || null;

    // Le mie mosse in sospeso: le vedo subito applicate solo io (anteprima locale),
    // lo stato condiviso resta invariato per tutti finché non si risolve il round.
    const myPendingDest = {};
    ((campaignState.pendingUnitMoves && campaignState.pendingUnitMoves[localP]) || []).forEach(order => {
        myPendingDest[order.unitId] = order.destSectorId;
    });

    const bySector = {};
    campaignState.units.forEach(u => {
        const visualSectorId = (u.owner === localP && myPendingDest[u.id] !== undefined)
            ? myPendingDest[u.id]
            : u.sectorId;
        (bySector[visualSectorId] = bySector[visualSectorId] || []).push(u);
    });

    Object.entries(bySector).forEach(([sectorIdStr, units]) => {
        const sectorId = parseInt(sectorIdStr);
        const s = campaignState.sectors[sectorId];
        if (!s) return;

        // Nuove dimensioni scalate (+50%)
        const baseR = 25;   
        const ringR = 33;   

        // Costanti per l'impaginazione a griglia
        const maxPerRow = 4;
        const offsetStepX = baseR * 1.1; // Sfasamento orizzontale
        
        // Ridotto da 2.2 a 1.35 per far salire la seconda riga e sovrapporla parzialmente (effetto "pila")
        const offsetStepY = baseR * 0.85; 
        
        // Calcolo righe totali per centratura verticale
        const totalRows = Math.ceil(units.length / maxPerRow);
        const totalStackHeight = (totalRows - 1) * offsetStepY;
        
        // Abbassato il punto di partenza (da +5 a +35). 
        // Ora la prima riga parte esattamente dove prima si creava la riga inferiore.
        const startY = s.y + 25 - (totalStackHeight / 2);

        // 1. Calcoliamo la geometria di posizionamento per ciascun elemento
        const unitsToDraw = units.map((u, i) => {
            const row = Math.floor(i / maxPerRow);
            const col = i % maxPerRow;

            let itemsInThisRow = maxPerRow;
            if (row === totalRows - 1) {
                itemsInThisRow = (units.length % maxPerRow) || maxPerRow;
            }

            const rowWidth = (itemsInThisRow - 1) * offsetStepX;
            const startX = s.x - (rowWidth / 2);

            const cx = startX + (col * offsetStepX);
            const cy = startY + (row * offsetStepY);

            return {
                u,
                cx,
                cy,
                row,
                isSelected: u.id === selectedUnitId
            };
        });

        // 2. Ordiniamo l'ordine di disegno SVG (Z-Index):
        // - Prima disegnamo la riga sotto (row = 1) in modo che rimanga nello sfondo.
        // - Poi disegnamo la riga sopra (row = 0) in modo che copra parzialmente la riga sotto.
        // - Infine l'unità selezionata (isSelected) viene disegnata per ultima per stare in primo piano.
        unitsToDraw.sort((a, b) => {
            if (a.isSelected) return 1;
            if (b.isSelected) return -1;
            return b.row - a.row; // row = 1 viene disegnato prima di row = 0
        });

        // 3. Eseguiamo il ciclo di disegno effettivo sulla lista ordinata
        unitsToDraw.forEach(({ u, cx, cy, isSelected }) => {
            const ownerColor  = players[u.owner]?.color || COLORS['p' + u.owner];
            const icon        = u.type === 'artillery' ? '🎯' : '👤';
            const canCommand  = campaignState.phase === 'PLANNING' && u.owner === localP && !u.hasActedThisTurn;

            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.classList.add('unit-token');

            if (canCommand) {
                g.style.pointerEvents = 'all';
                g.style.cursor = 'pointer';
                g.onclick = (e) => {
                    e.stopPropagation();
                    if (typeof playSFX === 'function') playSFX('click');
                    showUnitActionMenu(localP, u.id);
                };
            } else {
                g.style.pointerEvents = 'none';
            }

            // Anello tratteggiato (Selezione) - Effetto bordatura nera tramite doppio layer
            if (isSelected) {
                // 1. Layer inferiore: Spesso e Nero (Crea il bordo)
                const ringShadow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                ringShadow.setAttribute('cx', cx);
                ringShadow.setAttribute('cy', cy);
                ringShadow.setAttribute('r', ringR);
                ringShadow.setAttribute('fill', 'none');
                ringShadow.setAttribute('stroke', '#000000');
                ringShadow.setAttribute('stroke-width', '10'); // Molto spesso
                ringShadow.setAttribute('stroke-dasharray', '12 12'); 
                ringShadow.setAttribute('stroke-linecap', 'round'); // Arrotonda le punte del tratteggio
                g.appendChild(ringShadow);

                // 2. Layer superiore: Colore della Fazione
                const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                ring.setAttribute('cx', cx);
                ring.setAttribute('cy', cy);
                ring.setAttribute('r', ringR);
                ring.setAttribute('fill', 'none');
                // FIX: Sostituito '#FFD700' con il colore della fazione del giocatore
                ring.setAttribute('stroke', ownerColor);
                ring.setAttribute('stroke-width', '5'); // Più sottile del nero per far emergere i bordi
                ring.setAttribute('stroke-dasharray', '12 12'); 
                ring.setAttribute('stroke-linecap', 'round'); // Arrotonda le punte
                g.appendChild(ring);
            }

            // Contorno nero esterno del cerchio base
            const outline = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            outline.setAttribute('cx', cx);
            outline.setAttribute('cy', cy);
            outline.setAttribute('r', baseR);
            outline.setAttribute('fill', 'none');
            outline.setAttribute('stroke', '#000');
            outline.setAttribute('stroke-width', (isSelected ? 8 : (canCommand ? 5 : 3)) + 2.5);
            if (u.hasActedThisTurn) outline.setAttribute('opacity', '0.5');
            g.appendChild(outline);

            // Sfondo colorato della fazione
            const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            bg.setAttribute('cx', cx);
            bg.setAttribute('cy', cy);
            bg.setAttribute('r', baseR);
            bg.setAttribute('fill', 'rgba(0,0,0,0.85)');
            // FIX: Mantiene sempre il colore della fazione (ownerColor) invece di diventare giallo
            bg.setAttribute('stroke', ownerColor);
            bg.setAttribute('stroke-width', isSelected ? '8' : (canCommand ? '5' : '3'));
            if (u.hasActedThisTurn) bg.setAttribute('opacity', '0.5');
            g.appendChild(bg);

            // --- LOGICA IMMAGINE VS EMOJI ---
            let useImage = false;
            let imgHref = '';

            // L'artiglieria mantiene sempre il mirino. Solo gli agenti provano a caricare lo sprite.
            if (u.type === 'agent') {
                const cosmeticId = players[u.owner]?._cosmeticFaction || u.owner;
                const fData = FACTION_PREFIXES[cosmeticId];
                if (fData) {
                    // Sceglie uno sprite tra i primi 10 (o il massimo disponibile se sono meno di 10)
                    // Usa l'ID univoco dell'unità con operatore modulo (%) per garantire che la faccia 
                    // sia "casuale" ma rimanga coerente e non sfarfalli durante i ridisegni della mappa.
                    const maxLimit = Math.min(10, fData.count);
                    const spriteIndex = (u.id % maxLimit) + 1;
                    const spriteId = `${fData.prefix}${spriteIndex}`;
                    
                    // Controlliamo se l'immagine è stata precaricata con successo
                    if (customImages[spriteId] && customImages[spriteId].complete && customImages[spriteId].naturalWidth !== 0) {
                        useImage = true;
                        imgHref = customImages[spriteId].src;
                    }
                }
            }

            if (useImage) {
                // Calcola la dimensione dell'immagine per farla stare bene dentro il cerchio
                const imgSize = baseR * 1.5; 
                const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
                img.setAttributeNS(null, 'href', imgHref);
                img.setAttribute('x', cx - imgSize / 2);
                // La alziamo leggermente per fare spazio al testo dei crediti in basso
                img.setAttribute('y', cy - imgSize / 2 - 3); 
                img.setAttribute('width', imgSize);
                img.setAttribute('height', imgSize);
                img.setAttribute('pointer-events', 'none');
                if (u.hasActedThisTurn) img.setAttribute('opacity', '0.4');
                g.appendChild(img);
            } else {
                // Fallback classico: Emoji
                const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                txt.setAttribute('x', cx);
                txt.setAttribute('y', cy - 1);
                txt.setAttribute('text-anchor', 'middle');
                txt.setAttribute('dominant-baseline', 'middle');
                txt.setAttribute('font-size', baseR); // Ingrandito a 25px
                txt.textContent = icon;
                if (u.hasActedThisTurn) txt.setAttribute('opacity', '0.5');
                g.appendChild(txt);
            }

            // Valore in crediti (solo per gli Agenti)
            if (u.type !== 'artillery') {
                const valTxt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                valTxt.setAttribute('x', cx);
                // Posizionato in basso a sfiorare il bordo del cerchio
                valTxt.setAttribute('y', cy + baseR * 0.75); 
                valTxt.setAttribute('text-anchor', 'middle');
                valTxt.setAttribute('font-family', 'Courier New');
                valTxt.setAttribute('font-size', '16'); // Ingrandito da 12 a 16
                valTxt.setAttribute('font-weight', 'bold');
                valTxt.setAttribute('fill', '#FFD700');
                // Aggiunta un'ombra scura per renderlo leggibile anche se l'immagine dell'agente ha colori chiari
                valTxt.setAttribute('style', 'filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.9)); pointer-events: none;');
                valTxt.textContent = u.value;
                g.appendChild(valTxt);
            }

            svg.appendChild(g);
        });
    });
}

// ============================================================
// COMANDO UNITÀ: pannello, mosse valide, movimento/attacco
// ============================================================

/** Ritorna gli id dei settori raggiungibili (non bloccati). Supporta il Trasporto Aereo (Hangar). */
function getUnitValidMoves(unit) {
    const bonuses = getPlayerCampaignBonuses(unit.owner);
    // Movimento base 1, +1 per OGNI Hangar posseduto in qualsiasi settore!
    const maxDist = 1 + bonuses.extraRange; 

    const validMoves = new Set();
    const queue = [{ id: unit.sectorId, d: 0 }];
    const visited = new Set([unit.sectorId]);

    // Algoritmo di espansione (Breadth-First Search) per calcolare la distanza
    while (queue.length > 0) {
        const curr = queue.shift();

        // Aggiunge la cella come valida se non è il punto di partenza e non è bloccata
        if (curr.d > 0) {
            const sector = campaignState.sectors[curr.id];
            if (sector && !sector.blocked) {
                validMoves.add(curr.id);
            }
        }

        // FIX: un settore bloccato non può essere attraversato.
        // Non espandiamo i suoi vicini (a meno che non sia il punto di partenza stesso,
        // che per definizione è dove si trova già l'unità).
        const currSector = campaignState.sectors[curr.id];
        const isBlocked = curr.d > 0 && currSector && currSector.blocked;
        if (isBlocked) continue;

        // Continua a cercare nei vicini solo se non abbiamo superato la distanza massima
        if (curr.d < maxDist) {
            for (const nbId of (campaignState.adj[curr.id] || [])) {
                if (!visited.has(nbId)) {
                    visited.add(nbId);
                    queue.push({ id: nbId, d: curr.d + 1 });
                }
            }
        }
    }

    return Array.from(validMoves);
}
window.getUnitValidMoves = getUnitValidMoves;

/** Piccolo menu per la singola unità cliccata: mostra le sue info e il pulsante "Muovi". */
function showUnitActionMenu(playerFaction, unitId) {
    const unit = campaignState.units.find(u => u.id === unitId);
    if (!unit || unit.hasActedThisTurn || unit.owner !== playerFaction) return;

    const icon = unit.type === 'artillery' ? '🎯' : '👤';
    const valueLine = unit.type === 'artillery' ? '' : `<div style="color:#FFD700;font-size:20px;font-weight:bold;margin-top:6px;">💰${unit.value}</div>`;
    const contentHtml = `<div style="text-align:center;padding:6px 0 14px;">
        <span style="font-size:32px;">${icon}</span>
        ${valueLine}
        <div style="color:#888;font-size:24px;">${unit.type === 'artillery' ? 'Artiglieria' : 'Agente'} — Settore ${unit.sectorId}</div>
    </div>`;

    const buttons = [{
        id: 'btn-move',
        // Emoji raddoppiata (36px vs i 18px del testo) — line-height fisso a 18px
        // mantiene invariata l'altezza di riga del pulsante, quindi non ne cambia le dimensioni
        label: '<span style="font-size:36px;line-height:18px;vertical-align:middle;display:inline-block;">👣</span> MUOVI',
        primary: true
    }];
    
    // Controlla se il giocatore ha l'upgrade Infiltrati da qualche parte
    const hasInfiltrati = campaignState.sectors.some(s => s.owner === playerFaction && s.infiltratiUpgrade);
    if (unit.type === 'agent' && hasInfiltrati) {
        buttons.push({ id: 'btn-infiltra', label: `🕵️ INFILTRA (Mappa Globale)`, primary: true });
    }
    
    if (unit.type === 'artillery') {
        const rangeLabel = _getArtilleryRange(playerFaction) === Infinity ? 'GLOBALE' : CAMPAIGN.ARTILLERY_RANGE;
        // Emoji raddoppiata (36px vs i 18px del testo) — line-height fisso a 18px
        // mantiene invariata l'altezza di riga del pulsante, quindi non ne cambia le dimensioni
        buttons.push({
            id: 'btn-fire',
            label: `<span style="font-size:36px;line-height:18px;vertical-align:middle;display:inline-block;">🎯</span> SPARA (gittata ${rangeLabel})`,
            primary: true
        });
    }
    buttons.push({ id: 'btn-close', label: 'CHIUDI', primary: false });

    // 1. Creiamo e istanziamo la modale
    const modal = _gui_createModalBase(playerFaction, "👤 AGENTE", "", contentHtml, buttons);

    // 2. Colleghiamo gli eventi onclick dopo che l'oggetto "modal" esiste in memoria
    if (modal.querySelector('#btn-infiltra')) {
        modal.querySelector('#btn-infiltra').onclick = () => {
            modal.remove();
            campaignState._pendingUnitInfiltra = unitId;
            showTemporaryMessage('🕵️ Seleziona qualsiasi settore bersaglio (NO Fortezze)');
            renderCampaignMap();
        };
    }

    modal.querySelector('#btn-move').onclick = () => {
        // Riproduce l'effetto dei passi (sfx-move.mp3) all'attivazione dello spostamento
        if (typeof playSFX === 'function') playSFX('move');
        
        modal.remove();
        campaignState._pendingUnitMove = unitId;
        showTemporaryMessage('🎯 Seleziona il settore di destinazione sulla mappa', 3000, true); // silent: suona già sfx-move.mp3
        renderCampaignMap();
    };

    if (unit.type === 'artillery' && modal.querySelector('#btn-fire')) {
        modal.querySelector('#btn-fire').onclick = () => {
            // Riproduce 'click' invece del suono di default 'shield' di showTemporaryMessage
            if (typeof playSFX === 'function') playSFX('heal');

            modal.remove();
            campaignState._pendingUnitFire = unitId;
            const rangeMsg = _getArtilleryRange(playerFaction) === Infinity
                ? '🎯 Seleziona un bersaglio qualsiasi sulla mappa (gittata globale)'
                : `🎯 Seleziona il bersaglio entro ${CAMPAIGN.ARTILLERY_RANGE} settori`;
            showTemporaryMessage(rangeMsg, 3000, true); // silent: suona già sfx-click.mp3
            renderCampaignMap();
        };
    }
    
    modal.querySelector('#btn-close').onclick = () => modal.remove();
}
window.showUnitActionMenu = showUnitActionMenu;

/** Distanza BFS tra due settori sulla griglia della campagna (stesso schema di _isArtilleryReachable). */
function _campaignHexDistance(fromId, toId) {
    if (fromId === toId) return 0;
    const queue = [{ id: fromId, d: 0 }];
    const visited = new Set([fromId]);
    while (queue.length > 0) {
        const curr = queue.shift();
        for (const nbId of (campaignState.adj[curr.id] || [])) {
            if (nbId === toId) return curr.d + 1;
            if (!visited.has(nbId)) { visited.add(nbId); queue.push({ id: nbId, d: curr.d + 1 }); }
        }
    }
    return Infinity;
}
window._campaignHexDistance = _campaignHexDistance;

/** Applica lo sparo dell'unità Artiglieria verso un settore entro la sua gittata attuale. */
function fireCampaignUnitArtillery(unitId, targetSectorId, fromNetPlayer = null) {
    const unit = campaignState.units.find(u => u.id === unitId);
    if (!unit || unit.type !== 'artillery' || unit.hasActedThisTurn) return;

    const owner = fromNetPlayer !== null ? fromNetPlayer : unit.owner;
    if (unit.owner !== owner) return;

    const charges = (campaignState.artilleryCharges && campaignState.artilleryCharges[owner]) || 0;
    if (charges <= 0) return;
    // FIX: con l'ICBM la gittata è globale, non più fissa a CAMPAIGN.ARTILLERY_RANGE.
    if (_campaignHexDistance(unit.sectorId, targetSectorId) > _getArtilleryRange(owner)) return;

    campaignState.artilleryCharges[owner]--;
    unit.hasActedThisTurn = true;

    // Registra solo l'intenzione: il danno vero e l'animazione arrivano a fine turno,
    // esattamente come il vecchio sistema (processConflicts FASE 0 / FASE 1b)
    if (!campaignState._roundLog) campaignState._roundLog = [];
    campaignState._roundLog.push({ type: 'ARTILLERY', p: owner, sid: targetSectorId, fromSectorId: unit.sectorId });

    renderCampaignMap();
    saveCampaignSnapshot();
}
window.fireCampaignUnitArtillery = fireCampaignUnitArtillery;

/**
 * Esegue il movimento (o l'attacco) di un'unità verso un settore adiacente.
 * Se il settore non ha difensori nemici, si sposta/conquista automaticamente.
 * Se ha difensori nemici, per ora mostra un placeholder: l'aggancio alla
 * battaglia tattica vera e propria arriva con la Fase 4.
 */
function moveCampaignUnit(unitId, destSectorId, fromNetPlayer = null) {
    const unit = campaignState.units.find(u => u.id === unitId);
    if (!unit || unit.hasActedThisTurn) return;

    const owner = fromNetPlayer !== null ? fromNetPlayer : unit.owner;
    if (unit.owner !== owner) return; // il chiamante non è il proprietario dell'unità

    const validMoves = getUnitValidMoves(unit);
    if (!validMoves.includes(destSectorId)) return;

    // L'unità NON si sposta subito: l'ordine resta nascosto agli altri giocatori
    // (come i vecchi ordini di attacco) e viene applicato insieme a tutti gli
    // altri a fine turno in processConflicts(), prima di risolvere i conflitti.
    if (!campaignState.pendingUnitMoves) campaignState.pendingUnitMoves = {};
    if (!campaignState.pendingUnitMoves[owner]) campaignState.pendingUnitMoves[owner] = [];
    campaignState.pendingUnitMoves[owner].push({ unitId, destSectorId });

    unit.hasActedThisTurn = true;

    renderCampaignMap();
    saveCampaignSnapshot();
}
window.moveCampaignUnit = moveCampaignUnit;


/** Esegue l'infiltrazione globale, consuma l'upgrade e imposta l'animazione */
function infiltrateCampaignUnit(unitId, destSectorId, fromNetPlayer = null) {
    const unit = campaignState.units.find(u => u.id === unitId);
    if (!unit || unit.hasActedThisTurn) return;

    const owner = fromNetPlayer !== null ? fromNetPlayer : unit.owner;
    if (unit.owner !== owner) return;

    // Cerca una base che ha l'upgrade e lo consuma (monouso)
    const sourceSector = campaignState.sectors.find(s => s.owner === owner && s.infiltratiUpgrade);
    if (!sourceSector) return; 
    sourceSector.infiltratiUpgrade = false;

    // 1. Applica il movimento fisico (identico a moveCampaignUnit)
    if (!campaignState.pendingUnitMoves) campaignState.pendingUnitMoves = {};
    if (!campaignState.pendingUnitMoves[owner]) campaignState.pendingUnitMoves[owner] = [];
    campaignState.pendingUnitMoves[owner].push({ unitId, destSectorId });

    // 2. Crea un ordine fittizio SOLO per far partire la bella animazione in processConflicts!
    if (!campaignState.pendingOrders) campaignState.pendingOrders = {};
    if (!campaignState.pendingOrders[owner]) campaignState.pendingOrders[owner] = [];
    campaignState.pendingOrders[owner].push({
        sectorId: destSectorId,
        isInfiltrati: true, // Questo farà partire _playInfiltratiAnimation
        fromX: unit.sectorId ? campaignState.sectors[unit.sectorId].x : sourceSector.x,
        fromY: unit.sectorId ? campaignState.sectors[unit.sectorId].y : sourceSector.y
    });

    unit.hasActedThisTurn = true;
    renderCampaignMap();
    saveCampaignSnapshot();
}
window.infiltrateCampaignUnit = infiltrateCampaignUnit;


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



// ============================================================
// UNITÀ PERSISTENTI DI CAMPAGNA (Fase 1: fondamenta)
// ============================================================

/** Crea una nuova unità persistente nel settore indicato e la registra nello stato. */
function createCampaignUnit(sectorId, owner, value, type = 'agent') {
    const unit = {
        id:                campaignState._nextUnitId++,
        owner,
        sectorId,
        value,
        type,                    // 'agent' | 'artillery'
        hasActedThisTurn: false,
    };
    campaignState.units.push(unit);
    return unit;
}
window.createCampaignUnit = createCampaignUnit;

/** Ritorna tutte le unità presenti in un dato settore (opzionalmente filtrate per proprietario). */
function getUnitsAt(sectorId, owner = null) {
    return campaignState.units.filter(u => u.sectorId === sectorId && (owner === null || u.owner === owner));
}
window.getUnitsAt = getUnitsAt;

/** Rimuove un'unità dalla mappa (morte in battaglia, upkeep non pagato, ecc). */
function removeCampaignUnit(unitId) {
    const idx = campaignState.units.findIndex(u => u.id === unitId);
    if (idx !== -1) campaignState.units.splice(idx, 1);
}
window.removeCampaignUnit = removeCampaignUnit;

/** Reset dei flag "ha agito" a inizio turno di un giocatore. */
function resetUnitActionFlags(owner) {
    campaignState.units.forEach(u => { if (u.owner === owner) u.hasActedThisTurn = false; });
}
window.resetUnitActionFlags = resetUnitActionFlags;

// ============================================================
// CLICK SU SETTORE
// ============================================================

function handleSectorClick(targetId) {
    if (typeof playSFX === 'function') playSFX('click');
    if (hasMovedSignificantly) { hasMovedSignificantly = false; return; }
    if (campaignState.phase !== 'PLANNING') return;
    
    // Online: blocca i click se il giocatore ha già confermato questo round
    if (window.isCampaignOnline) {
        const alreadyConfirmed =
            typeof window._clientLockedRound !== 'undefined' &&
            window._clientLockedRound === campaignState.turnCount;
        if (alreadyConfirmed) return;
    }

    // --- Un'unità Artiglieria è "in attesa di bersaglio": questo click completa lo sparo ---
    if (campaignState._pendingUnitFire) {
        const unitId = campaignState._pendingUnitFire;
        campaignState._pendingUnitFire = null;

        if (window.isCampaignOnline && !window.isHost) {
            _net_clientSend('UNIT_ARTILLERY_FIRE', { unitId, targetSectorId: targetId });
        } else {
            const unit = campaignState.units.find(u => u.id === unitId);
            if (unit && _campaignHexDistance(unit.sectorId, targetId) <= _getArtilleryRange(unit.owner)) {
                fireCampaignUnitArtillery(unitId, targetId);
            } else {
                showTemporaryMessage('🚧 Bersaglio fuori gittata — sparo annullato');
                renderCampaignMap();
            }
        }
        return;
    }

    // --- Un'unità è "in attesa di destinazione": questo click la completa ---
    if (campaignState._pendingUnitMove) {
        const unitId = campaignState._pendingUnitMove;

        if (window.isCampaignOnline && !window.isHost) {
            campaignState._pendingUnitMove = null;
            _net_clientSend('MOVE_UNIT', { unitId, destSectorId: targetId });
            renderCampaignMap();
            return;
        }

        const unit  = campaignState.units.find(u => u.id === unitId);
        const valid = unit && getUnitValidMoves(unit).includes(targetId);
        campaignState._pendingUnitMove = null;

        if (valid) {
            moveCampaignUnit(unitId, targetId);
        } else {
            showTemporaryMessage('🚧 Destinazione non valida — movimento annullato');
            renderCampaignMap();
        }
        return;
    }

    // --- Un'unità è in attesa di INFILTRAZIONE GLOBALE ---
    if (campaignState._pendingUnitInfiltra) {
        const unitId = campaignState._pendingUnitInfiltra;
        campaignState._pendingUnitInfiltra = null;
        
        const targetSector = campaignState.sectors[targetId];

        if (targetSector.fortressUpgrade) {
            showTemporaryMessage('🏰 Infiltrazione bloccata dalla Fortezza nemica!');
            renderCampaignMap();
            return;
        }

        if (window.isCampaignOnline && !window.isHost) {
            _net_clientSend('INFILTRATE_UNIT', { unitId, destSectorId: targetId });
            renderCampaignMap();
            return;
        }

        infiltrateCampaignUnit(unitId, targetId);
        return;
    }

    const p = window.isCampaignOnline ? window.myPlayerNumber : campaignState.currentPlayer;
    const target = campaignState.sectors[targetId];

    const isSabotagedByMe = (campaignState.pendingOrders[p] || []).some(o => o.sectorId === targetId && o.isSabotage);
    const isSecretlyBlockedForMe = target._bonifiedThisRoundBy && target._bonifiedThisRoundBy !== p && campaignState.phase === 'PLANNING';
    
    if (target.blocked || isSabotagedByMe || isSecretlyBlockedForMe) {
        if (target._nuclearCooldown > 0 || isSabotagedByMe || isSecretlyBlockedForMe) {
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

    // --- LOGICA DI ACCESSO AL MENU ---
    const nukeReachable        = _isNukeReachable(targetId, p); 
    const infiltratiReachable  = _isInfiltratiReachable(targetId, p);
    const bonuses              = getPlayerCampaignBonuses(p);

    const canAction = nukeReachable || infiltratiReachable;

    if (!canAction) {
        // Messaggio dinamico per aiutare il giocatore
        if (bonuses.nukeUnlocked && !bonuses.icbmUnlocked) {
            showTemporaryMessage("Settore troppo lontano! Il Silo Nucleare colpisce solo i settori adiacenti.");
        } else {
            showTemporaryMessage("Settore fuori portata!");
        }
        return;
    }

    if (window.isCampaignOnline && !window.isHost) {
        _net_clientSend('SECTOR_CLICK', { sectorId: targetId });
        return;
    }

    // <-- SOSTITUISCI CON QUESTO
    const orders = campaignState.pendingOrders[p] || [];
    // Filtra l'annullamento: permette di cancellare solo gli attacchi standard.
    // Gli ordini di Infiltrazione (isInfiltrati) e Nuke (isSabotage) non possono essere annullati.
    if (orders.find(o => o.sectorId === targetId && !o.isInfiltrati && !o.isSabotage)) {
        _cancelOrder(p, targetId);
        renderCampaignMap();
        return;
    }

    showCreditSelector(targetId);
}
window.handleSectorClick = handleSectorClick;

// --- GESTIONE TURNI ---

function finishPlayerTurn() {
    if (campaignState.phase !== 'PLANNING') return;
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
    if (window.isCampaignOnline && !window.isHost) return; 
    if (!campaignState.isActive) return;

    try {

        // Legge i valori reali dal Proxy prima di serializzare
        const hqSlotsSnap = CAMPAIGN_HQ_POSITIONS[campaignState.numPlayers] || CAMPAIGN_HQ_POSITIONS[4];
        const creditsSnapshot = {};
        for (let p = 1; p <= campaignState.numPlayers; p++) {
            creditsSnapshot[p] = campaignState.credits[p] || 0;
        }

        const snapshot = {
            numPlayers:     campaignState.numPlayers,
            hqSlots:        campaignState.hqSlots,
            currentPlayer:  campaignState.currentPlayer,
            credits:        creditsSnapshot,
            turnCount:      campaignState.turnCount,
            phase:          campaignState.phase,
            sectorCredits:  campaignState.sectorCredits,
            _allOrderedSectors: campaignState._allOrderedSectors,
            // CORREZIONE QUI: Usiamo le graffe { } invece delle tonde ( )
            sectors: campaignState.sectors.map(s => {
                let sectorData = {
                    id:               s.id,
                    owner:            s.owner,
                    blocked:          s.blocked,
                    income:           s.income,
                    terrain:          s.terrain,
                    _nuclearized:     s._nuclearized || false,
                    _nuclearCooldown: s._nuclearCooldown || 0
                };

                // AGGIUNTA DINAMICA: Salva tutti gli upgrade presenti nel dizionario
                if (window.CAMPAIGN_UPGRADE_KEYS) {
                    window.CAMPAIGN_UPGRADE_KEYS.forEach(key => {
                        sectorData[key] = s[key] || false;
                    });
                }
                return sectorData;
            }),
            artilleryCharges: campaignState.artilleryCharges || {},
            _roundLog:        campaignState._roundLog        || [],
            pendingOrders:    campaignState.pendingOrders    || {},
            units:            campaignState.units            || [],
            _nextUnitId:      campaignState._nextUnitId       || 1,
            pendingUnitMoves: campaignState.pendingUnitMoves  || {},
            // Snapshot dei giocatori (nome + colore cosmetico)
            playerNames:  Object.fromEntries(
            Object.entries(players).map(([k, v]) => [k, {
                name:             v.name,
                color:            v.color,
                _cosmeticFaction: v._cosmeticFaction,
                _colorConfirmed:  v._colorConfirmed, // FIX: Salva il blocco del colore
            }])
        ),
            savedAt: Date.now(),
        };
        localStorage.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify(snapshot));
        console.log('[Campaign] Snapshot salvato.');
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
    ['setup-overlay','controls-panel','network-menu'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const audioBtn = document.getElementById('audio-toggle');
    if (audioBtn) { audioBtn.style.display = 'block'; audioBtn.style.zIndex = '100002'; }

    // Ripristina dati giocatori (cosmetici)
    if (snapshot.playerNames) {
        Object.entries(snapshot.playerNames).forEach(([k, v]) => {
            if (players[k]) {
                players[k].name             = v.name;
                players[k].color            = v.color;
                players[k]._cosmeticFaction = v._cosmeticFaction;
                players[k]._colorConfirmed  = v._colorConfirmed ?? true; // FIX: Ripristina il blocco
            }
        });
    }

    // Ripristina campi campagna
    const restoredSectorCredits = snapshot.sectorCredits || {};

    Object.assign(campaignState, {
        isActive:           true,
        numPlayers:         snapshot.numPlayers,
        hqSlots:            snapshot.hqSlots || CAMPAIGN_HQ_POSITIONS[snapshot.numPlayers],
        currentPlayer:      snapshot.currentPlayer,
        turnCount:          snapshot.turnCount,
        phase:              'PLANNING',
        sectorCredits:      restoredSectorCredits,
        pendingOrders:      snapshot.pendingOrders      || {},
        pendingMoves:       {},
        _allOrderedSectors: snapshot._allOrderedSectors || {},
        _roundLog:          snapshot._roundLog          || [],
        _currentBattle:     null,
        battleQueue:        [],
        victoryThreshold:   CAMPAIGN.VICTORY_THRESHOLD,
        artilleryCharges:   snapshot.artilleryCharges   || {},
        units:              snapshot.units              || [],
        _nextUnitId:        snapshot._nextUnitId         || 1,
        pendingUnitMoves:   snapshot.pendingUnitMoves    || {},
    });
    window.totalPlayers = snapshot.numPlayers;

    // Ricostruisce il Proxy credits → sectorCredits[hqId]
    const hqSlotsLoad = campaignState.hqSlots;
    const _hqIdByPlayerLoad = {};
    for (let p = 1; p <= snapshot.numPlayers; p++) {
        _hqIdByPlayerLoad[p] = hqSlotsLoad[p - 1];
        // Ripristina i crediti salvati dentro sectorCredits
        const hqId = _hqIdByPlayerLoad[p];
        if (!restoredSectorCredits[hqId]) restoredSectorCredits[hqId] = {};
        restoredSectorCredits[hqId][p] = snapshot.credits?.[p] || 0;
    }
    campaignState.credits = new Proxy({}, {
        get(_, p) {
            const hqId = _hqIdByPlayerLoad[+p];
            if (!hqId) return 0;
            return campaignState.sectorCredits[hqId]?.[+p] || 0;
        },
        set(_, p, value) {
            const hqId = _hqIdByPlayerLoad[+p];
            if (!hqId) return true;
            if (!campaignState.sectorCredits[hqId]) campaignState.sectorCredits[hqId] = {};
            campaignState.sectorCredits[hqId][+p] = value;
            return true;
        }
    });

    // Ripristina settori
    snapshot.sectors.forEach(saved => {
        const live = campaignState.sectors[saved.id];
        if (!live) return;
        
        live.owner          = saved.owner;
        live.blocked        = saved.blocked;
        live.income         = saved.income;
        // Fallback per salvataggi vecchi (pre-terreno): assegna un terreno casuale se mancante
        live.terrain        = saved.terrain || CAMPAIGN_TERRAIN_DEFS[Math.floor(Math.random() * CAMPAIGN_TERRAIN_DEFS.length)].key;
        live._nuclearized    = saved._nuclearized || false;
        live._nuclearCooldown = saved._nuclearCooldown || 0;

        // AGGIUNTA DINAMICA: Carica tutti gli upgrade dal file salvato
        if (window.CAMPAIGN_UPGRADE_KEYS) {
            window.CAMPAIGN_UPGRADE_KEYS.forEach(key => {
                live[key] = saved[key] || false;
            });
        }
    });

    renderCampaignMap();
    console.log('[Campaign] Snapshot caricato. Turno:', snapshot.turnCount);
}
window.loadCampaignSnapshot = loadCampaignSnapshot;

markScriptAsLoaded('campaign_map.js');