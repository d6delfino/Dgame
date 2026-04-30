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

markScriptAsLoaded('state.js');


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
];

// --- VARIABILI TEMA ATTIVO ---
let SELECTED_BG_ID     = null;
let THEME_WALL_PREFIX  = null;
let THEME_WALL_COUNT   = 0;
let THEME_BARRICADE_ID = null;

// --- IMMAGINE DI SFONDO ---
const mapBackground = new Image();

// --- CATALOGO SPRITE ---
const customSpriteFiles = {
    'HQ1': 'img/HQ1.png', 'HQ2': 'img/HQ2.png',
    'HQ3': 'img/HQ3.png', 'HQ4': 'img/HQ4.png',
    'HQ5': 'img/HQ5.png', 'HQ6': 'img/HQ6.png',
    'HQ7': 'img/HQ7.png', 'HQ8': 'img/HQ8.png',
};
const customImages = {};

function applyTheme(themeObj) {
    SELECTED_BG_ID    = themeObj.id;
    THEME_WALL_PREFIX = themeObj.prefix;
    THEME_WALL_COUNT  = themeObj.count;
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
            img.onload = () => { customImages[key] = img; };
        }
    }
}

function preloadFixedSprites() {
    // 1. Precarica HQ
    Object.entries(customSpriteFiles).forEach(([key, url]) => {
        if (!customImages[key]) {
            const img  = new Image();
            img.src    = url;
            img.onload = () => { customImages[key] = img; };
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
}

// Tema casuale all'avvio
const initialTheme = bgOptions[Math.floor(Math.random() * bgOptions.length)];
applyTheme(initialTheme);
preloadFixedSprites();

markScriptAsLoaded('assets.js');


// ============================================================
// SEZIONE 3 — GRAPHICS.JS
// Rendering canvas. Dipende da state (grid, players, ecc.),
// assets (customImages, mapBackground) e constants (COLORS).
// TERRAINS viene referenziato solo dentro le funzioni → sicuro
// anche se la const è dichiarata più avanti nel file.
// ============================================================

function hexToPixel(q, r) {
    return {
        x: HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r) + (window.innerWidth / 2) + offsetX,
        y: HEX_SIZE * (3 / 2 * r) + (window.innerHeight / 2) + offsetY,
    };
}

function pixelToHex(x, y) {
    x -= (window.innerWidth / 2) + offsetX;
    y -= (window.innerHeight / 2) + offsetY;
    return hexRound(
        (Math.sqrt(3) / 3 * x - 1 / 3 * y) / HEX_SIZE,
        (2 / 3 * y) / HEX_SIZE
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

    const baseSize = Math.min(
        (width * 0.8) / (Math.sqrt(3) * (GRID_RADIUS * 2)),
        (height * 0.6) / (1.5 * (GRID_RADIUS * 2))
    );

    HEX_SIZE = Math.max(25, baseSize * zoomBoost);
    offsetX = 0;
    offsetY = 0;
    if (typeof drawGame === 'function') drawGame();
}

function clampCamera() {
    const currentMapWidth  = (GRID_RADIUS * 2) * (HEX_SIZE * Math.sqrt(3));
    const currentMapHeight = (GRID_RADIUS * 2) * (HEX_SIZE * 1.5);
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
    ctx.scale(dpr, dpr);
    canvas.style.width  = width  + 'px';
    canvas.style.height = height + 'px';

    if (width < 600) autoFitMap();
    if (typeof state !== 'undefined' && state === 'PLAYING') drawGame();
}

function drawGame() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (mapBackground && mapBackground.complete && mapBackground.naturalWidth > 0) {
        const bgScale = HEX_SIZE / 20;
        const bgW = mapBackground.width  * bgScale;
        const bgH = mapBackground.height * bgScale;
        const bgX = (window.innerWidth  / 2) + offsetX - bgW / 2;
        const bgY = (window.innerHeight / 2) + offsetY - bgH / 2;
        ctx.drawImage(mapBackground, bgX, bgY, bgW, bgH);
    } else {
        ctx.fillStyle = COLORS.bg || '#000';
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    grid.forEach(cell => {
        let fill   = null;
        let stroke = 'rgba(110, 110, 110, 0.3)';

        if (cell.type === 'wall')      fill = '#777';
        else if (cell.type === 'barricade') fill = '#bbb';
        else if (cell.terrain && typeof TERRAINS !== 'undefined' && TERRAINS[cell.terrain]) {
            fill   = TERRAINS[cell.terrain].color;
            stroke = 'rgba(255, 255, 255, 0.1)';
        }

        drawHex(cell.q, cell.r, stroke, fill, 1);

        if (cell.type === 'wall' || cell.type === 'barricade') {
            const p = hexToPixel(cell.q, cell.r);
            if (cell.customSpriteId && customImages[cell.customSpriteId]?.complete) {
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

    validActionTargets.forEach(t => {
        let stroke = COLORS.atkNeon, fill = COLORS.atkFill;
        if (currentActionMode === 'move' || currentActionMode === 'card_airdrop') {
            stroke = COLORS.moveNeon; fill = COLORS.moveFill;
        } else if (currentActionMode === 'build' || currentActionMode === 'card_build') {
            stroke = COLORS.buildNeon; fill = COLORS.buildFill;
        }
        drawHex(t.q, t.r, stroke, fill);
    });

    controlPoints.forEach(cp => {
        const cpColor = (players && players[cp.faction]) ? players[cp.faction].color : '#888888';
        const p = hexToPixel(cp.q, cp.r);
        ctx.save();
        ctx.setLineDash([8, 6]);
        ctx.shadowBlur  = cp.faction > 0 ? 12 : 4;
        ctx.shadowColor = cpColor;
        drawHex(cp.q, cp.r, cpColor, cpColor + '11', cp.faction > 0 ? 2.5 : 1.5);
        ctx.restore();

        const size = HEX_SIZE * 0.38;
        ctx.save();
        ctx.strokeStyle = cpColor;
        ctx.lineWidth   = cp.faction > 0 ? 4 : 2;
        ctx.lineCap     = 'round';
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

    grid.forEach(cell => {
        if (!cell.entity) return;
        const p          = hexToPixel(cell.q, cell.r);
        const faction    = cell.entity.faction;
        const isSelected = (typeof selectedAgent !== 'undefined' && selectedAgent === cell.entity);
        const color      = players[faction].color;

        ctx.save();
        if (cell.entity.type === 'agent') {
            const thickness = isSelected ? 7 : 4;
            if (isSelected) { ctx.shadowBlur = 15; ctx.shadowColor = color; }
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth   = thickness;
            const r = HEX_SIZE * 0.85;
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i + Math.PI / 6;
                const x = p.x + r * Math.cos(angle);
                const y = p.y + r * Math.sin(angle);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fill();
        } else if (cell.entity.type === 'hq') {
            ctx.beginPath();
            ctx.arc(p.x, p.y, HEX_SIZE * 0.8, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth   = 3;
            ctx.stroke();
        }
        ctx.restore();

        const img = customImages[cell.entity.customSpriteId];
        if (img?.complete && img.naturalWidth !== 0) {
            const mult    = cell.entity.type === 'hq' ? 1.5 : 1.2;
            const imgSize = HEX_SIZE * mult;
            ctx.drawImage(img, p.x - imgSize / 2, p.y - imgSize / 2, imgSize, imgSize);
        } else {
            ctx.font      = `${cell.entity.type === 'hq' ? Math.round(HEX_SIZE * 1.15) : Math.round(HEX_SIZE * 0.75)}px Arial`;
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff';
            ctx.fillText(cell.entity.sprite || '', p.x, p.y + (cell.entity.type === 'hq' ? HEX_SIZE * 0.25 : HEX_SIZE * 0.17));
        }

        ctx.fillStyle = '#fff';
        ctx.font      = `bold ${Math.round(HEX_SIZE * 0.4)}px Courier New`;
        ctx.textAlign = 'center';
        ctx.fillText(cell.entity.hp, p.x, p.y - HEX_SIZE * 0.62);
    });

    // HP ostacoli e icone terreni
    grid.forEach(cell => {
        const p = hexToPixel(cell.q, cell.r);
        if (cell.hp > 0 && cell.type !== 'empty') {
            const xOff = cell.entity ? HEX_SIZE * 0.38 : 0;
            const yOff = cell.entity ? HEX_SIZE * 0.55 : HEX_SIZE * 0.62;
            ctx.fillStyle = '#fff';
            ctx.font      = `bold ${Math.round(HEX_SIZE * 0.45)}px Courier New`;
            ctx.fillText(cell.hp, p.x + xOff, p.y + yOff);
        }
        if (cell.terrain && typeof TERRAINS !== 'undefined' && TERRAINS[cell.terrain]) {
            const xOff = cell.entity ? HEX_SIZE * 0.45 : 0;
            const yOff = cell.entity ? HEX_SIZE * 0.65 : HEX_SIZE * 0.20;
            ctx.save();
            ctx.globalAlpha = 0.95;
            ctx.font        = `${Math.round(HEX_SIZE * 0.6)}px Arial`;
            ctx.fillText(TERRAINS[cell.terrain].icon, p.x + xOff, p.y + yOff);
            ctx.restore();
        }
    });
}

function drawHex(q, r, stroke, fill, width = 1) {
    const p = hexToPixel(q, r);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i + Math.PI / 6;
        const x = p.x + HEX_SIZE * Math.cos(angle);
        const y = p.y + HEX_SIZE * Math.sin(angle);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function drawLaserBeam(attacker, victim) {
    const p1 = hexToPixel(attacker.q, attacker.r);
    const p2 = hexToPixel(victim.q,   victim.r);
    let opacity    = 1.0;
    const STEPS    = 20;
    const INTERVAL = 400 / STEPS;

    const fadeInterval = setInterval(() => {
        opacity -= 1.0 / STEPS;
        if (opacity <= 0) {
            clearInterval(fadeInterval);
            drawGame();
            return;
        }
        drawGame();
        ctx.save();
        ctx.globalAlpha  = opacity;
        ctx.strokeStyle  = '#ff0000'; ctx.lineWidth = 8;
        ctx.shadowColor  = '#ff0000'; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        ctx.strokeStyle  = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        ctx.restore();
    }, INTERVAL);
}

function showDisconnectOverlay(title, message) {
    if (document.getElementById('disconnect-overlay')) return;
    if (typeof turnTimerInterval !== 'undefined') clearInterval(turnTimerInterval);

    const overlay = document.createElement('div');
    overlay.id = 'disconnect-overlay';
    overlay.style.cssText = `
        position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(5,5,9,0.98); z-index:99999;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        font-family:'Courier New',monospace; text-align:center; padding:20px;
    `;
    overlay.innerHTML = `
        <h1 style="color:#ff3333;text-shadow:0 0 15px #ff3333;font-size:2.5em;margin-bottom:15px;text-transform:uppercase;">${title}</h1>
        <p style="color:#a0a0b0;font-size:1.2em;max-width:600px;margin-bottom:30px;line-height:1.5;">${message}</p>
        <button class="action-btn" onclick="location.reload()"
                style="padding:15px 40px;border:2px solid #ff3333;color:#ff3333;background:transparent;cursor:pointer;font-weight:bold;font-size:1.1em;">
            TORNA AL MENU
        </button>
    `;
    document.body.appendChild(overlay);
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
    clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(() => { el.style.opacity = '0'; }, duration);
}

// VFX — Testo flottante animato sopra un'entità/cella
function playSpecialVFX(target, color, text) {
    if (!target) return;
    const p  = hexToPixel(target.q, target.r);
    const el = document.createElement('div');
    el.innerText   = text;
    el.style.cssText = `position:absolute; left:${p.x}px; top:${p.y - 20}px; transform:translate(-50%,-50%); color:${color}; font-weight:bold; font-size:22px; font-family:'Courier New',monospace; text-shadow:0 0 12px ${color},0 0 4px #000; pointer-events:none; z-index:10000; animation:floatUpFade 2.5s ease-out forwards;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);

    if (!document.getElementById('card-vfx-style')) {
        const style = document.createElement('style');
        style.id    = 'card-vfx-style';
        style.innerHTML = `@keyframes floatUpFade { 0%{opacity:1;transform:translate(-50%,-50%) scale(0.8)} 20%{transform:translate(-50%,-50%) scale(1.1)} 100%{opacity:0;transform:translate(-50%,-150%) scale(1.3)} }`;
        document.head.appendChild(style);
    }
}

markScriptAsLoaded('graphics.js');


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
    nebbia:    { id: 'nebbia',    icon: '🌫️', color: 'rgba(100, 100, 150, 0.01)', name: 'Nebbia',    prob: 0.08 },
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

markScriptAsLoaded('terreni.js');


// ============================================================
// FINE core.js
// ============================================================
markScriptAsLoaded('core.js');
