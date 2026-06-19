/* ============================================================
   core.js — Modulo Unificato
   ============================================================
   Fusione di: state.js → assets.js → graphics.js → terreni.js

   ORDINE INTERNO (non modificare):
     1. state.js    — variabili mutabili di partita (dipende solo da constants.js)
     2. assets.js   — immagini e temi visivi (dipende da constants.js)
     3. graphics.js — rendering canvas (dipende da state + assets + constants)
     4. terreni.js  — terreni speciali (dipende da gamelogic.js per
                       registerMoveCalculator / registerDamageModifier)

   POSIZIONE IN index.html:
     - DOPO:  constants.js, gamelogic.js, cards.js
     - PRIMA: carduse.js, ai.js, credits.js, network_core.js,
              network_sync.js, setup.js, map.js, main.js

   MODIFICHE RICHIESTE IN ALTRI FILE:
     - constants.js → requiredScripts: sostituire
         'assets.js', 'state.js', 'graphics.js', 'terreni.js'
       con un solo 'core.js'
   ============================================================ */


// ============================================================
// SEZIONE 1 — STATE.JS
// Stato globale della partita (unica fonte di verità).
// Nessuna dipendenza oltre a constants.js (già caricato prima).
// ============================================================

// --- STATO MOTORE ---
let state        = 'SETUP_P1';   // 'SETUP_P1' | 'PLAYING' | 'GAME_OVER'
let currentPlayer = 1;
let totalPlayers  = 2;
let turnCount     = 0;

// --- SETUP ---
let setupData = { points: GAME.SETUP_POINTS, agents: [] };

// --- GRIGLIA ---
let grid = new Map();           // getKey(q,r) → cell

// --- PUNTI DI CONTROLLO ---
// Map: getKey(q,r) → { q, r, faction }  (faction=0 = neutrale)
let controlPoints = new Map();

// --- GIOCATORI ---
let players = {
    1: { hq: null, agents: [], color: COLORS.p1, name: 'Verde',  credits: 0 },
    2: { hq: null, agents: [], color: COLORS.p2, name: 'Viola',  credits: 0 },
    3: { hq: null, agents: [], color: COLORS.p3, name: 'Blu',    credits: 0 },
    4: { hq: null, agents: [], color: COLORS.p4, name: 'Oro',    credits: 0 },
    5: { hq: null, agents: [], color: COLORS.p5, name: 'Rosso',  credits: 0 },
    6: { hq: null, agents: [], color: COLORS.p6, name: 'Bianco', credits: 0 },
    7: { hq: null, agents: [], color: COLORS.p7, name: 'Grigio', credits: 0 },
    8: { hq: null, agents: [], color: COLORS.p8, name: 'Rosa',   credits: 0 },
};

// --- PRIMO GIOCATORE (usato per saltare il reddito al primissimo turno) ---
let _firstPlayerOfGame = 1;

// --- AZIONE CORRENTE ---
let selectedAgent      = null;   // riferimento all'agente selezionato
let currentActionMode  = null;   // 'move' | 'shoot' | 'build' | 'heal' | 'card_airdrop' | 'card_build'
let validActionTargets = [];     // array di { q, r, ... }

// --- TIMER TURNO ---
let turnTimerInterval = null;
let timeLeft          = 60;
let timerUI           = null;    // elemento DOM iniettato da gamelogic.js
let turnCounterUI     = null;    // elemento DOM iniettato da gamelogic.js

// --- CAMERA / CANVAS ---
let canvas, ctx;
let HEX_SIZE  = 30;
let offsetX   = 0;
let offsetY   = 0;

// --- INPUT ---
let isDragging       = false;
let isPinching       = false;
let lastTouchX       = 0;
let lastTouchY       = 0;
let initialPinchDist = null;

// ============================================================
// POPUP DI CONFERMA CUSTOM (Evita l'uscita dal Fullscreen)
// ============================================================
function showCustomConfirm(title, message, confirmText, onConfirmCallback, color = '#FFD700') {
    if (typeof playSFX === 'function') playSFX('shield');
    
    const overlay = document.createElement('div');
    overlay.id = 'custom-confirm-overlay';
    overlay.style.cssText = `
        position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(0,0,0,0.92); z-index:9999999;
        display:flex; align-items:center; justify-content:center;
        font-family:'Courier New',monospace; padding:15px; box-sizing:border-box;
    `;

    overlay.innerHTML = `
        <div style="background:rgba(5,10,20,0.98); border:3px solid ${color}; border-radius:12px;
                    padding:25px; max-width:450px; width:100%; text-align:center; box-shadow:0 0 30px ${color}66;">
            <h2 style="color:${color}; margin:0 0 15px; font-size:24px; text-transform:uppercase;">${title}</h2>
            <p style="color:#aaa; font-size:15px; margin:0 0 25px; line-height:1.4;">${message}</p>
            <div style="display:flex; gap:15px; justify-content:center;">
                <button id="btn-custom-cancel" class="action-btn" style="flex:1; padding:12px; font-size:14px; border:2px solid #555; color:#aaa; background:transparent; cursor:pointer;">
                    ANNULLA
                </button>
                <button id="btn-custom-confirm" class="action-btn" style="flex:1; padding:12px; font-size:14px; border:2px solid ${color}; color:${color}; background:${color}22; font-weight:bold; cursor:pointer;">
                    ${confirmText}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#btn-custom-cancel').onclick = () => {
        if (typeof playSFX === 'function') playSFX('click');
        overlay.remove();
    };

    overlay.querySelector('#btn-custom-confirm').onclick = () => {
        if (typeof playSFX === 'function') playSFX('click');
        overlay.remove();
        onConfirmCallback(); // Esegue l'azione desiderata!
    };
}


// ============================================================
// HELPER STATE — RESET GIOCATORI
// ============================================================

function resetPlayers() {
    for (let p = 1; p <= 8; p++) {
        players[p].hq     = null;
        players[p].agents = [];
    }
}

function freshSetupData() {
    return { points: GAME.SETUP_POINTS, agents: [] };
}

function fullResetForBattle() {
    if (grid && grid.clear) grid.clear();
    if (controlPoints && controlPoints.clear) controlPoints.clear();

    resetPlayers();
    turnCount = 0;

    setupData = freshSetupData();

    if (isOnline) {
        currentPlayer = myPlayerNumber;
    }

    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);

    console.log("[System] Stato resettato completamente per la nuova battaglia.");
}



// ============================================================
// SEZIONE 2 — ASSETS.JS
// Caricamento immagini e gestione temi visivi.
// Dipende da constants.js (FACTION_PREFIXES, SPRITE_POOLS).
// ============================================================

// --- TEMI DISPONIBILI ---
const bgOptions = [
    { id: 'S1', path: 'img/sfondo1.jpg', prefix: 'HE', count: 20 },
    { id: 'S2', path: 'img/sfondo2.jpg', prefix: 'ZE', count: 20 },
    { id: 'S3', path: 'img/sfondo3.jpg', prefix: 'EC', count: 22 },
    { id: 'S4', path: 'img/sfondo4.jpg', prefix: 'GU', count: 20 },
    { id: 'S5', path: 'img/sfondo5.jpg', prefix: 'ME', count: 18 },
    { id: 'S6', path: 'img/sfondo6.jpg', prefix: 'RO', count: 20 },
    { id: 'S7', path: 'img/sfondo7.jpg', prefix: 'AL', count: 19 },
];

// --- VARIABILI TEMA ATTIVO ---
let SELECTED_BG_ID     = null;
let THEME_WALL_PREFIX  = null;
let THEME_WALL_COUNT   = 0;
let THEME_BARRICADE_ID = null;

// --- IMMAGINE DI SFONDO ---
const mapBackground = new Image();
const bgOffscreen   = document.createElement('canvas');
const bgOffCtx      = bgOffscreen.getContext('2d');
let   bgOffscreenReady = false;

// --- STATIC LAYER CACHE ---
const _staticCanvas  = document.createElement('canvas');
const _staticCtx     = _staticCanvas.getContext('2d');
let   _staticDirty   = true;   // true = va ridisegnato al prossimo frame

// --- CATALOGO SPRITE ---
const customSpriteFiles = {
    'HQ1': 'img/HQ1.png', 'HQ2': 'img/HQ2.png',
    'HQ3': 'img/HQ3.png', 'HQ4': 'img/HQ4.png',
    'HQ5': 'img/HQ5.png', 'HQ6': 'img/HQ6.png',
    'HQ7': 'img/HQ7.png', 'HQ8': 'img/HQ8.png',
    'LAIR': 'img/tana.png',
};
const customImages = {};

function invalidateStaticLayer() {
    _staticDirty = true;
}

function applyTheme(themeObj) {
    SELECTED_BG_ID    = themeObj.id;
    THEME_WALL_PREFIX = themeObj.prefix;
    THEME_WALL_COUNT  = themeObj.count;
    bgOffscreenReady  = false;

    mapBackground.onload = () => {
        bgOffscreen.width  = mapBackground.width;
        bgOffscreen.height = mapBackground.height;
        bgOffCtx.filter    = 'blur(1px)';
        bgOffCtx.drawImage(mapBackground, 0, 0);
        bgOffCtx.filter    = 'none';
        bgOffscreenReady   = true;
    };
    mapBackground.src = themeObj.path;

    THEME_BARRICADE_ID = THEME_WALL_PREFIX + '1';

    console.log(`[Assets] Tema applicato: ${SELECTED_BG_ID} (barricata: ${THEME_BARRICADE_ID})`);

    for (let i = 1; i <= THEME_WALL_COUNT; i++) {
        const key = `${THEME_WALL_PREFIX}${i}`;
        const url = `img/${key}.png`;
        customSpriteFiles[key] = url;

        if (!customImages[key]) {
            const img  = new Image();
            img.src    = url;
            img.onload = () => { customImages[key] = img; invalidateStaticLayer(); };
        }
    }
}

function preloadFixedSprites() {
    // 1. Precarica HQ
    Object.entries(customSpriteFiles).forEach(([key, url]) => {
        if (!customImages[key]) {
            const img  = new Image();
            img.src    = url;
            img.onload = () => { customImages[key] = img; invalidateStaticLayer(); };
        }
    });

    // 2. Precarica Agenti
    Object.entries(FACTION_PREFIXES).forEach(([factionId, data]) => {
        for (let i = 1; i <= data.count; i++) {
            const key = `${data.prefix}${i}`;
            const url = `img/${key}.png`;
            customSpriteFiles[key] = url;

            if (!customImages[key]) {
                const img = new Image();
                img.src = url;
                img.onload = () => { customImages[key] = img; };
            }
        }
    });

    // --- NUOVO: 3. Precarica Sfondi Fazioni ---
    for (let i = 1; i <= 8; i++) {
        const key = `factionBg${i}`;
        const url = `img/faction${i}.png`;
        
        // Lo aggiungiamo all'elenco ufficiale così la schermata 
        // di caricamento iniziale aspetterà anche questi file!
        customSpriteFiles[key] = url; 

        if (!customImages[key]) {
            const img = new Image();
            img.src = url;
            img.onload = () => { customImages[key] = img; };
        }
    }
}

// Tema casuale all'avvio
const initialTheme = bgOptions[Math.floor(Math.random() * bgOptions.length)];
//const initialTheme = bgOptions[6];   // USA PER TESTARE LO SFONDO , PARTE DA 0
applyTheme(initialTheme);
preloadFixedSprites();


// ============================================================
// SEZIONE 3 — GRAPHICS.JS
// Rendering canvas. Dipende da state (grid, players, ecc.),
// assets (customImages, mapBackground) e constants (COLORS).
// TERRAINS viene referenziato solo dentro le funzioni → sicuro
// anche se la const è dichiarata più avanti nel file.
// ============================================================

const _SQRT3     = Math.sqrt(3);
const _SQRT3_2   = Math.sqrt(3) / 2;
const _SQRT3_3   = Math.sqrt(3) / 3;

function hexToPixel(q, r) {
    return {
        x: HEX_SIZE * (_SQRT3 * q + _SQRT3_2 * r) + (window.innerWidth / 2) + offsetX,
        y: HEX_SIZE * (1.5 * r) + (window.innerHeight / 2) + offsetY,
    };
}

function pixelToHex(x, y) {
    x -= (window.innerWidth / 2) + offsetX;
    y -= (window.innerHeight / 2) + offsetY;
    return hexRound(
        (_SQRT3_3 * x - 1/3 * y) / HEX_SIZE,
        (2/3 * y) / HEX_SIZE
    );
}

function hexRound(q, r) {
    let s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const qDiff = Math.abs(rq - q), rDiff = Math.abs(rr - r), sDiff = Math.abs(rs - s);
    if (qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
    else if (rDiff > sDiff) rr = -rq - rs;
    return { q: rq, r: rr };
}

function autoFitMap() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const zoomBoost = width > 1024 ? 1.5 : 1.0;

    const effectiveRadius = totalPlayers > 4 ? Math.round(GRID_RADIUS * 1.6) : GRID_RADIUS;
    const baseSize = Math.min(
        (width * 0.8) / (Math.sqrt(3) * (effectiveRadius * 2)),
        (height * 0.6) / (1.5 * (effectiveRadius * 2))
    );

    HEX_SIZE = Math.max(25, baseSize * zoomBoost);
    offsetX = 0;
    offsetY = 0;
    if (typeof drawGame === 'function') drawGame();
}

function clampCamera() {
    const effectiveRadius  = totalPlayers > 4 ? Math.round(GRID_RADIUS * 1.6) : GRID_RADIUS;
    const currentMapWidth  = (effectiveRadius * 2) * (HEX_SIZE * Math.sqrt(3));
    const currentMapHeight = (effectiveRadius * 2) * (HEX_SIZE * 1.5);
    const margin = 600;
    const limitX = Math.max(0, (currentMapWidth  - window.innerWidth)  / 2) + margin;
    const limitY = Math.max(0, (currentMapHeight - window.innerHeight) / 2) + margin;
    offsetX = Math.max(-limitX, Math.min(limitX, offsetX));
    offsetY = Math.max(-limitY, Math.min(limitY, offsetY));
}

function resizeCanvas() {
    const dpr    = window.devicePixelRatio || 1;
    const width  = window.innerWidth;
    const height = window.innerHeight;

    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);  // ← reset esplicito prima di scalare
    ctx.scale(dpr, dpr);
    canvas.style.width  = width  + 'px';
    canvas.style.height = height + 'px';

    if (width < 600) autoFitMap();
    if (typeof state !== 'undefined' && state === 'PLAYING') drawGame();
}

function drawGame() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- SFONDO ---
    if (bgOffscreenReady) {
        const bgScale = HEX_SIZE / 20;
        const bgW = bgOffscreen.width  * bgScale;
        const bgH = bgOffscreen.height * bgScale;
        const bgX = (window.innerWidth  / 2) + offsetX - bgW / 2;
        const bgY = (window.innerHeight / 2) + offsetY - bgH / 2;
        ctx.drawImage(bgOffscreen, bgX, bgY, bgW, bgH);
    } else {
        ctx.fillStyle = COLORS.bg || '#000';
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

// --- STATIC LAYER: ridisegna solo se invalidato ---
    if (_staticDirty) {
        _staticCanvas.width  = canvas.width;
        _staticCanvas.height = canvas.height;

        // Ridirigiamo temporaneamente drawHex sul contesto offscreen
        const _realCtx = ctx;
        ctx = _staticCtx;

        // FIX: Applica la scala del monitor al layer statico (essenziale per Mobile e Retina Display)
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        grid.forEach(cell => {
            let fill   = null;
            let stroke = 'rgba(110, 110, 110, 0.3)';

            if (cell.type === 'wall')           fill = '#777';
            else if (cell.type === 'barricade') fill = '#bbb';
            else if (cell.type === 'water')     fill = 'rgba(0, 150, 255, 0.2)';
            else if (cell.terrain && typeof TERRAINS !== 'undefined' && TERRAINS[cell.terrain]) {
                fill   = TERRAINS[cell.terrain].color;
                stroke = 'rgba(255, 255, 255, 0.1)';
            }

            drawHex(cell.q, cell.r, stroke, fill, 1);

            if (cell.type === 'wall' || cell.type === 'barricade') {
                const p = hexToPixel(cell.q, cell.r);
                if (cell.customSpriteId && customImages[cell.customSpriteId]?.complete
                    && customImages[cell.customSpriteId].naturalWidth !== 0) {
                    const imgSize = HEX_SIZE * 1.9;
                    ctx.drawImage(customImages[cell.customSpriteId], p.x - imgSize / 2, p.y - imgSize / 2, imgSize, imgSize);
                } else {
                    ctx.font      = `${Math.round(HEX_SIZE * 0.75)}px Arial`;
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#fff';
                    ctx.fillText(cell.sprite || '', p.x, p.y + HEX_SIZE * 0.27);
                }
            }
        });

        ctx = _realCtx;
        _staticDirty = false;
    }

    // Incolla il layer statico in una sola drawImage
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // FIX: Ignora la scala momentaneamente per incollare il canvas 1:1
    ctx.drawImage(_staticCanvas, 0, 0);
    ctx.restore();

    // L'acqua rimane qui perché è animata (onde cambiano ogni frame)
    const _now = Date.now();
    grid.forEach(cell => {
        if (cell.type !== 'water') return;
        const p     = hexToPixel(cell.q, cell.r);
        const wave  = Math.sin(_now / 900 + cell.q * 0.8 + cell.r * 0.5);
        const waveX = Math.sin(_now / 2200 + cell.r * 0.7 + cell.q * 0.3);
        const alpha  = 0.15 + wave * 0.10;
        const yOffset = wave  * HEX_SIZE * 0.12;
        const xOffset = waveX * HEX_SIZE * 0.08;

        ctx.save();
        ctx.globalAlpha = alpha * 3;
        drawHex(cell.q, cell.r, null, `rgba(0, 160, 255, 0.4)`, 0);
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.7 + wave * 0.15;
        ctx.font        = `${Math.round(HEX_SIZE * 0.75)}px Arial`;
        ctx.textAlign   = 'center';
        ctx.fillStyle   = '#fff';
        ctx.fillText('🌊', p.x + xOffset, p.y + HEX_SIZE * 0.27 + yOffset);
        ctx.restore();
    });

    validActionTargets.forEach(t => {
        let stroke = COLORS.atkNeon, fill = COLORS.atkFill;
        if (currentActionMode === 'move' || currentActionMode === 'card_airdrop') {
            stroke = COLORS.moveNeon; fill = COLORS.moveFill;
        } else if (currentActionMode === 'build' || currentActionMode === 'card_build') {
            stroke = COLORS.buildNeon; fill = COLORS.buildFill;
        }
        drawHex(t.q, t.r, stroke, fill);
    });

    const now = Date.now();
    controlPoints.forEach(cp => {
        const cpColor = (players && players[cp.faction]) ? players[cp.faction].color : '#888888';
        const p = hexToPixel(cp.q, cp.r);
        ctx.save();
        ctx.setLineDash([8, 6]);

        if (cp.faction === 0) {
            const pulse = 0.5 + Math.abs(Math.sin(now / 700 + cp.q * 0.5)) * 0.5;
            ctx.globalAlpha = 0.5 + pulse * 0.5;
        } else {
            ctx.lineWidth = 2.5;
        }

        drawHex(cp.q, cp.r, cpColor, cpColor + '11', cp.faction > 0 ? 2.5 : 1.5);
        ctx.restore();

        const pulse = cp.faction === 0
            ? 0.5 + Math.abs(Math.sin(now / 700 + cp.q * 0.5)) * 0.5
            : 1;
        const size = HEX_SIZE * (cp.faction === 0 ? 0.28 + pulse * 0.22 : 0.38);
        ctx.save();
        ctx.strokeStyle = cpColor;
        ctx.lineWidth   = cp.faction > 0 ? 4 : 1.5 + pulse * 3.5;
        ctx.lineCap     = 'round';
        if (cp.faction === 0) {
            ctx.globalAlpha = 0.3 + pulse * 0.7;
        }
        ctx.beginPath();
        ctx.moveTo(p.x - size, p.y - size); ctx.lineTo(p.x + size, p.y + size);
        ctx.moveTo(p.x + size, p.y - size); ctx.lineTo(p.x - size, p.y + size);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = cpColor;
        ctx.font      = `bold ${Math.round(HEX_SIZE * 0.30)}px Courier New`;
        ctx.textAlign = 'center';
        ctx.fillText('+1', p.x, p.y + HEX_SIZE * 0.70);
    });

    // --- DISEGNO ENTITÀ (Agenti e HQ) ---
    grid.forEach(cell => {
        if (!cell.entity) return;
        // Nascondi mostri coop nelle celle non visibili al momento
        if (typeof coopState !== 'undefined' && coopState.active &&
            typeof COOP !== 'undefined' && cell.entity.faction === COOP.MONSTER_FACTION) {
            const _key = getKey(cell.q, cell.r);
            if (!coopState.currentVisible || !coopState.currentVisible.has(_key)) return;
        }
        const p          = hexToPixel(cell.q, cell.r);
        const faction    = cell.entity.faction;
        const isSelected = (typeof selectedAgent !== 'undefined' && selectedAgent === cell.entity);
        const color      = players[faction].color;
        const img        = customImages[cell.entity.customSpriteId];
        const now        = Date.now();

        // 1. SCIA DI MOVIMENTO E INTERPOLAZIONE POSIZIONE
        let drawX = p.x;
        let drawY = p.y;
        
        if (cell.entity._moveTime && (now - cell.entity._moveTime < 300)) {
            const progress = (now - cell.entity._moveTime) / 300;
            const oldP = hexToPixel(cell.entity._lastQ, cell.entity._lastR);
            drawX = oldP.x + (p.x - oldP.x) * progress;
            drawY = oldP.y + (p.y - oldP.y) * progress;
        }

        ctx.save(); // INIZIO BLOCCO UNICO TRASFORMAZIONE

        // Scia di movimento (disegnata prima del translate, con coordinate globali)
        if (cell.entity._moveTime && (now - cell.entity._moveTime < 300)) {
            const progress = (now - cell.entity._moveTime) / 300;
            const oldP = hexToPixel(cell.entity._lastQ, cell.entity._lastR);
            if (img?.complete && img.naturalWidth !== 0) {
                const imgSize = HEX_SIZE * 1.2;
                ctx.globalAlpha = 0.3 * (1 - progress);
                ctx.drawImage(img, oldP.x - imgSize/2, oldP.y - imgSize/2, imgSize, imgSize);
                ctx.globalAlpha = 0.6 * (1 - progress);
                ctx.drawImage(img, drawX - (p.x - oldP.x)*0.1 - imgSize/2, drawY - (p.y - oldP.y)*0.1 - imgSize/2, imgSize, imgSize);
                ctx.globalAlpha = 1.0;
            }
        }

        // 2. Trasla il centro di disegno sulle coordinate dell'entità
        ctx.translate(drawX, drawY);

        // 3. Applica PULSAZIONE, RESPIRO e HIT FLASH
        if (cell.entity.type === 'agent') {
            const breathe = 1 + Math.sin(now / 300 + cell.entity.q) * 0.07;
            let scaleX = breathe;
            let scaleY = breathe;

            if (cell.entity === selectedAgent) {
                const pulse = 1.35 + Math.sin(now / 200) * 0.15;
                scaleX *= pulse;
                scaleY *= pulse;
                const fColor = players[cell.entity.faction]?.color || '#ffffff';
                ctx.shadowBlur  = 18 + Math.sin(now / 200) * 8;
                ctx.shadowColor = fColor;
            }
            
            if (cell.entity._hitTime && (now - cell.entity._hitTime < 600)) {
                ctx.filter = 'brightness(300%) sepia(100%) hue-rotate(300deg) saturate(500%)';
            }
            
            ctx.scale(scaleX, scaleY); // SCALA APPLICATA A TUTTO CIÒ CHE SEGUE
        }

        // 4. DISEGNA L'ESAGONO DI SELEZIONE (ora che siamo scalati e traslati)
        if (cell.entity.type === 'agent') {
            const thickness = isSelected ? 7 : 4;
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = cell.entity === selectedAgent ? thickness / 1.35 : thickness;
            const r = HEX_SIZE * 0.85;
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i + Math.PI / 6;
                const x = r * Math.cos(angle);
                const y = r * Math.sin(angle);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fill();
        } else if (cell.entity.type === 'hq') {
            ctx.beginPath();
            ctx.arc(0, 0, HEX_SIZE * 0.8, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth   = 3;
            ctx.stroke();
        }

        // 5. DISEGNA L'IMMAGINE
        if (img?.complete && img.naturalWidth !== 0) {
            const mult    = cell.entity.type === 'hq' ? 1.5 : 1.35;
            const imgSize = HEX_SIZE * mult;
            ctx.drawImage(img, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
        } else {
            ctx.font = `${cell.entity.type === 'hq' ? Math.round(HEX_SIZE * 1.15) : Math.round(HEX_SIZE * 0.75)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.fillText(cell.entity.sprite || '', 0, (cell.entity.type === 'hq' ? HEX_SIZE * 0.25 : HEX_SIZE * 0.17));
        }
        
        ctx.restore(); // FINE BLOCCO UNICO TRASFORMAZIONE

        // 6. DISEGNA GLI HP (fuori dal blocco di trasformazione, così non pulsano)
        ctx.fillStyle = '#fff';
        ctx.font      = `bold ${Math.round(HEX_SIZE * 0.4)}px Courier New`;
        ctx.textAlign = 'center';
        ctx.fillText(cell.entity.hp, drawX, drawY - HEX_SIZE * 0.62);
    });

    // HP ostacoli e icone terreni
    grid.forEach(cell => {
        const hasHpIcon      = cell.hp > 0 && cell.type !== 'empty';
        const hasTerrainIcon = cell.terrain && typeof TERRAINS !== 'undefined' && TERRAINS[cell.terrain];
        if (!hasHpIcon && !hasTerrainIcon) return; // nulla da disegnare: salta hexToPixel

        const p = hexToPixel(cell.q, cell.r);

        if (hasHpIcon) {
            const xOff = cell.entity ? HEX_SIZE * 0.38 : 0;
            const yOff = cell.entity ? HEX_SIZE * 0.55 : HEX_SIZE * 0.62;
            ctx.fillStyle = '#fff';
            ctx.font      = `bold ${Math.round(HEX_SIZE * 0.45)}px Courier New`;
            ctx.fillText(cell.hp, p.x + xOff, p.y + yOff);
        }
        if (hasTerrainIcon) {
            const xOff = cell.entity ? HEX_SIZE * 0.45 : 0;
            const yOff = cell.entity ? HEX_SIZE * 0.65 : HEX_SIZE * 0.20;
            ctx.save();
            ctx.globalAlpha = 0.95;
            ctx.font        = `${Math.round(HEX_SIZE * 0.6)}px Arial`;
            ctx.fillStyle   = '#ffffff'; // <--- FIX: Forza il colore pieno, altrimenti eredita opacità sbagliate!
            ctx.fillText(TERRAINS[cell.terrain].icon, p.x + xOff, p.y + yOff);
            ctx.restore();
        }
    });

    // Croce Medica
    if (currentActionMode === 'heal') {
        validActionTargets.forEach(t => {
            const p = hexToPixel(t.q, t.r);
            ctx.save();
            ctx.fillStyle = 'rgba(0, 255, 136, 0.95)';
            ctx.font = `bold ${Math.round(HEX_SIZE * 1.2)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle'; 
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00ff88'; 
            ctx.fillText('✚', p.x, p.y);
            ctx.restore();
        });
    }
    updateAndDrawParticles();
}

const _HEX_ANGLES = (() => {
    const offsets = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i + Math.PI / 6;
        offsets.push({ cos: Math.cos(angle), sin: Math.sin(angle) });
    }
    return offsets;
})();

function drawHex(q, r, stroke, fill, width = 1) {
    const p = hexToPixel(q, r);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const x = p.x + HEX_SIZE * _HEX_ANGLES[i].cos;
        const y = p.y + HEX_SIZE * _HEX_ANGLES[i].sin;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function drawLaserBeam(attacker, victim) {
    const p1 = hexToPixel(attacker.q, attacker.r);
    const p2 = hexToPixel(victim.q, victim.r);
    
    // Determina i colori in base al buff Cecchino
    const isSniper = !!attacker.sniperBuff;
    const bColor = isSniper ? '#ff3333' : '#ffcc00'; // Rosso vs Giallo
    const gColor = isSniper ? '#ff0000' : '#ffaa00'; // Glow Rosso vs Arancio
    const fColor = attacker.faction ? players[attacker.faction].color : '#ffffff';

    const bulletCount = 6;
    for (let i = 0; i < bulletCount; i++) {
        activeBullets.push({
            p1: { x: p1.x, y: p1.y },
            p2: { x: p2.x, y: p2.y },
            progress: 0 - (i * 0.18), 
            speed: 0.15 + (Math.random() * 0.06),
            bulletColor: bColor, // <--- Nuovo
            glowColor: gColor,   // <--- Nuovo
            factionColor: fColor // Per le particelle d'impatto
        });
    }
}

function drawMeleeSlash(attacker, victim) {
    const p1 = hexToPixel(attacker.q, attacker.r);
    const p2 = hexToPixel(victim.q, victim.r);
    const baseColor = attacker.faction ? players[attacker.faction].color : '#ff0000';

    // Genera un angolo completamente casuale (tra 0 e 360 gradi in radianti)
    const randomAngle = Math.random() * Math.PI * 2;

    // Singolo fendente con inclinazione casuale
    activeSlashes.push({
        x: p2.x, y: p2.y,
        angle: randomAngle, 
        progress: 0,
        color: baseColor,
        particlesSpawned: false
    });
}


function showTemporaryMessage(text, duration = 3000) {
    let el = document.getElementById('temp-message');
    if (!el) {
        el = document.createElement('div');
        el.id = 'temp-message';
        el.style.cssText = `
            position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
            background: rgba(5,5,9,0.92); border: 1px solid #444; color: #fff;
            font-family: 'Courier New', monospace; font-size: 14px; padding: 10px 20px;
            border-radius: 4px; z-index: 9999; text-align: center; pointer-events: none;
            transition: opacity 0.4s;
        `;
        document.body.appendChild(el);
    }
    el.innerText = text;
    el.style.opacity = '1';

    if (typeof playSFX === 'function') playSFX('shield');

    clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(() => { el.style.opacity = '0'; }, duration);
}

// VFX — Testo flottante animato sopra un'entità/cella
const _vfxPool    = [];
const _VFX_SIZE   = 10; // elementi pre-creati nel pool

function _initVFXPool() {
    // Inietta il keyframe CSS una volta sola
    if (!document.getElementById('card-vfx-style')) {
        const style = document.createElement('style');
        style.id    = 'card-vfx-style';
        style.innerHTML = `@keyframes floatUpFade { 0%{opacity:1;transform:translate(-50%,-50%) scale(0.8)} 20%{transform:translate(-50%,-50%) scale(1.1)} 100%{opacity:0;transform:translate(-50%,-150%) scale(1.3)} }`;
        document.head.appendChild(style);
    }
    for (let i = 0; i < _VFX_SIZE; i++) {
        const el = document.createElement('div');
        el.style.cssText = `position:absolute; font-weight:bold; font-size:22px; font-family:'Courier New',monospace; pointer-events:none; z-index:10000; display:none;`;
        document.body.appendChild(el);
        _vfxPool.push({ el, inUse: false });
    }
}

function playSpecialVFX(target, color, text) {
    if (!target) return;

    // Inizializza il pool al primo uso
    if (_vfxPool.length === 0) _initVFXPool();

    // Cerca un elemento libero nel pool
    const slot = _vfxPool.find(s => !s.inUse);
    if (!slot) return; // pool esaurito, salta silenziosamente

    const p  = hexToPixel(target.q, target.r);
    slot.inUse  = true;
    slot.el.innerText = text;
    slot.el.style.left      = p.x + 'px';
    slot.el.style.top       = (p.y - 20) + 'px';
    slot.el.style.color     = color;
    // Sostituito il bagliore con un'ombra netta e piatta per la leggibilità
    slot.el.style.textShadow = `2px 2px 0px #000, -1px -1px 0px #000, 1px -1px 0px #000, -1px 1px 0px #000, 1px 1px 0px #000`;
    slot.el.style.animation = 'none';
    slot.el.style.display   = 'block';

    // Forza il reflow minimo per riavviare l'animazione CSS
    void slot.el.offsetWidth;
    slot.el.style.animation = 'floatUpFade 2.5s ease-out forwards';

    setTimeout(() => {
        slot.el.style.display = 'none';
        slot.el.style.animation = 'none';
        slot.inUse = false;
    }, 2500);
}


// ============================================================
// SEZIONE 4 — TERRENI.JS
// Terreni speciali. Dipende da gamelogic.js per
// registerMoveCalculator e registerDamageModifier.
// Queste due funzioni vengono chiamate a livello top-level,
// quindi core.js DEVE essere posizionato DOPO gamelogic.js
// in index.html.
// ============================================================

const TERRAINS = {
    altura:    { id: 'altura',    icon: '⛰️', color: 'rgba(200, 200, 200, 0.01)', name: 'Altura',    prob: 0.08 },
    nebbia:    { id: 'nebbia',    icon: '☁️', color: 'rgba(100, 100, 150, 0.01)', name: 'Nebbia',    prob: 0.08 },
    fango:     { id: 'fango',     icon: '🟤', color: 'rgba(80, 50, 20, 0.01)',    name: 'Fango',     prob: 0.08 },
    copertura: { id: 'copertura', icon: '🛡️', color: 'rgba(0, 200, 100, 0.01)',  name: 'Copertura', prob: 0.08 },
};

/**
 * Assegna i terreni alle celle vuote della griglia.
 * Chiamata alla fine della generazione procedurale (map.js).
 */
function generateTerrains() {
    grid.forEach(cell => {
        if (cell.type === 'empty' && !cell.entity && !controlPoints.has(getKey(cell.q, cell.r))) {
            const rand = Math.random();
            let threshold = 0;
            for (const key in TERRAINS) {
                threshold += TERRAINS[key].prob;
                if (rand < threshold) {
                    cell.terrain = TERRAINS[key].id;
                    break;
                }
            }
        }
    });
}

// MOVE CALCULATOR — Fango (restrizione movimento a 1 passo)
registerMoveCalculator(function (agent) {
    const agentCell = grid.get(getKey(agent.q, agent.r));
    if (!agentCell || agentCell.terrain !== 'fango') return null;  // delega

    const targets = [];
    hexDirections.forEach(function (dir) {
        const nq   = agent.q + dir.q;
        const nr   = agent.r + dir.r;
        const cell = grid.get(getKey(nq, nr));
        if (cell && cell.type === 'empty' && !cell.entity) {
            targets.push({ q: nq, r: nr });
        }
    });
    return targets;
});

// DAMAGE MODIFIER — Copertura (riduzione danno di 1)
registerDamageModifier(function (dmg, target) {
    if (!target || target.type !== 'agent') return dmg;

    const cell = grid.get(getKey(target.q, target.r));
    if (!cell || cell.terrain !== 'copertura') return dmg;

    playSpecialVFX(target, '#00ff88', 'COPERTO!');
    return Math.max(0, dmg - 1);
});


// ============================================================
// GESTIONE FRAME E DISEGNO (MASTER ENGINE A 30 FPS)
// ============================================================

let _renderPending = false;

(function _installDrawHookRunner() {
    const _origDraw = drawGame;
    
    // Questa è la vera funzione che renderizza la scena
    window._executeDraw = function () {
        _origDraw(); // Pulisce e disegna mappa/agenti
        
        if (typeof _drawHooks !== 'undefined') {
            _drawHooks.forEach(fn => fn()); // Disegna scudi/buff
        }
        
        _drawVFXOverlay(); // Disegna laser e fendenti SOPRA TUTTO (evita che scompaiano)
        _renderPending = false;
    };

    // Sovrascriviamo l'accesso pubblico: gli eventi (es. mouse a 144hz) 
    // alzano solo la bandierina senza sforzare la CPU
    window.drawGame = function () {
        _renderPending = true;
    };
})();

// ============================================================
// VFX ENGINE: PARTICELLE, LASER E MELEE (Tarato per 15 FPS)
// ============================================================

let particles = [];
let activeBullets = [];
let activeSlashes = [];
let _frameTick = 0;

function createParticles(x, y, color, amount = 10, isExplosion = false) {
    for (let i = 0; i < amount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * (isExplosion ? 12 : 6);
        particles.push({
            x: x, y: y, px: x, py: y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1.0,
            // Decadimento aumentato per compensare i 15 FPS
            decay: Math.random() * 0.04 + 0.03,
            color: color,
            size: Math.random() * 8 + 4
        });
    }
}

// Chiamata direttamente da _origDraw() in graphics.js
function updateAndDrawParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.px = p.x; p.py = p.y;
        p.x += p.vx; p.y += p.vy;
        
        // Attrito più forte per 15 FPS
        p.vx *= 0.85; p.vy *= 0.85; 
        p.life -= p.decay;

        if (p.life <= 0) {
            particles.splice(i, 1);
        } else {
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.life); // Protezione alpha negativi
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size;
            ctx.lineCap = 'round';
            //ctx.shadowBlur = p.size * 1.5; 
            //ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.moveTo(p.px, p.py); 
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            ctx.restore();
        }
    }
}

function _updateVFXMath() {
    // Proiettili: velocità adattata ai 15 FPS
    for (let i = activeBullets.length - 1; i >= 0; i--) {
        let b = activeBullets[i];
        b.progress += b.speed * 1.6; 
        if (b.progress >= 1.0) {
            createParticles(b.p2.x, b.p2.y, b.factionColor, 4, false);
            activeBullets.splice(i, 1);
        }
    }

    // Fendenti melee: velocità adattata ai 15 FPS
    for (let i = activeSlashes.length - 1; i >= 0; i--) {
        let slash = activeSlashes[i];
        slash.progress += 0.14; 
        if (slash.progress >= 1.0) {
            activeSlashes.splice(i, 1);
        } else if (slash.progress > 0.3 && !slash.particlesSpawned) {
            createParticles(slash.x, slash.y, slash.color, 4, false); 
            slash.particlesSpawned = true;
        }
    }
}

function _drawVFXOverlay() {
    // Disegna la scia rovente dei proiettili
    for (let i = 0; i < activeBullets.length; i++) {
        let b = activeBullets[i];
        if (b.progress > 0) {
            const x = b.p1.x + (b.p2.x - b.p1.x) * b.progress;
            const y = b.p1.y + (b.p2.y - b.p1.y) * b.progress;
            const tailX = b.p1.x + (b.p2.x - b.p1.x) * Math.max(0, b.progress - 0.2);
            const tailY = b.p1.y + (b.p2.y - b.p1.y) * Math.max(0, b.progress - 0.2);

            ctx.save();
            ctx.strokeStyle = b.bulletColor; 
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            //ctx.shadowColor = b.glowColor;  
            //ctx.shadowBlur = 10;
            ctx.beginPath(); 
            ctx.moveTo(tailX, tailY); 
            ctx.lineTo(x, y); 
            ctx.stroke();
            
            ctx.strokeStyle = '#ffffff'; 
            ctx.lineWidth = 2;
            ctx.shadowBlur = 0;
            ctx.stroke();
            ctx.restore();
        }
    }

    // Disegna la mezzaluna dei colpi Melee
    for (let i = 0; i < activeSlashes.length; i++) {
        let slash = activeSlashes[i];
        if (slash.progress > 0) {
            ctx.save();
            ctx.translate(slash.x, slash.y);
            ctx.rotate(slash.angle);

            const fullLength = HEX_SIZE * 2.2;
            const head = -fullLength + (fullLength * 2 * Math.min(1, slash.progress * 1.5));
            const tail = -fullLength + (fullLength * 2 * Math.max(0, (slash.progress - 0.25) * 1.5));
            const alpha = Math.max(0, Math.sin(slash.progress * Math.PI));

            ctx.globalAlpha = alpha;
            ctx.lineCap = 'round';
            
            // 1. Linea esterna spessa (Colore Fazione)
            ctx.strokeStyle = slash.color;
            ctx.lineWidth = 14 * alpha; // Leggermente più spessa per compensare la mancanza di bagliore
            ctx.beginPath();
            ctx.moveTo(tail, 0);
            ctx.lineTo(head, 0);
            ctx.stroke();

            // 2. Anima centrale luminosa ("quasi bianca")
            ctx.globalCompositeOperation = 'lighter'; // Fonde i colori senza pesare sulla GPU
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'; // Bianco leggermente trasparente
            ctx.lineWidth = 5 * alpha;
            ctx.beginPath();
            ctx.moveTo(tail, 0);
            ctx.lineTo(head, 0);
            ctx.stroke();
            
            // Ripristina il metodo di disegno normale
            ctx.globalCompositeOperation = 'source-over';

            if (slash.progress > 0.2 && slash.progress < 0.5) {
                ctx.beginPath();
                ctx.arc(0, 0, HEX_SIZE * 0.8 * alpha, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.globalAlpha = alpha * 0.4;
                ctx.fill();
            }
            ctx.restore();
        }
    }
}

// ============================================================
// MASTER LOOP (Sincronizzazione logica e rendering a 15 FPS)
// ============================================================

let _lastEngineTime = 0;
const TARGET_FPS = 15; // Limite richiesto: 15 FPS per tutti
const FRAME_INTERVAL = 1000 / TARGET_FPS;

let _gameOverEnteredAt = null;
let _prevLoopState = null;

function masterEngineLoop(timestamp) {
    requestAnimationFrame(masterEngineLoop);

    const deltaTime = timestamp - _lastEngineTime;
    if (deltaTime < FRAME_INTERVAL) return;

    _lastEngineTime = timestamp - (deltaTime % FRAME_INTERVAL);
    _frameTick = timestamp;

    // Rileva l'istante esatto in cui si entra in GAME_OVER, per continuare
    // a renderizzare ancora un po' (esplosione/morte dell'ultimo agente)
    // prima che il loop si fermi del tutto.
    if (state === 'GAME_OVER' && _prevLoopState !== 'GAME_OVER') {
        _gameOverEnteredAt = timestamp;
    }
    _prevLoopState = state;

    const stillShowingDeath = state === 'GAME_OVER'
        && _gameOverEnteredAt !== null
        && (timestamp - _gameOverEnteredAt) < 3000;

    if (state === 'PLAYING' || state === 'CAMPAIGN_MAP' || stillShowingDeath) {
        
        // 1. Aggiorna la matematica delle animazioni in modo indipendente
        _updateVFXMath();
        
        // 2. Forza il rendering per mantenere vivi gli effetti d'acqua e respiro
        _renderPending = true; 

        // 3. Esegue il disegno solo a 15 FPS massimi
        if (_renderPending) {
            _executeDraw();
        }
    }
}

// Avvia il Master Engine
requestAnimationFrame(masterEngineLoop);

// ============================================================
// FINE core.js
// ============================================================
markScriptAsLoaded('core.js');