/* ============================================================
   constants.js — Costanti globali (immutabili a runtime)
   ============================================================
   ESPONE: COLORS, SFX, SPRITE_POOLS, hexDirections, GRID_RADIUS,
           getKey, hexDistance, shuffleArray, getRandomSprite,
           isAIActive, delay, MARGIN
   DIPENDE DA: niente (caricato per primo)
   ============================================================ */

// --- GRIGLIA ---
const GRID_RADIUS = 9;
const MARGIN      = 150;

// --- COLORI FAZIONI E UI ---
const COLORS = {
    bg:        '#050509',
    grid:      '#1a1a25',
    wall:      '#3a3a50',
    p1:        '#00ff88', p1Fill: 'rgba(0, 255, 136, 0.15)',
    p2:        '#cc00ff', p2Fill: 'rgba(204, 0, 255, 0.15)',
    p3:        '#00aaff', p3Fill: 'rgba(0, 170, 255, 0.15)',
    p4:        '#FFD700', p4Fill: 'rgba(255, 215, 0, 0.15)',
    moveNeon:  '#00ffff', moveFill:  'rgba(0, 255, 255, 0.25)',
    atkNeon:   '#ff3333', atkFill:   'rgba(255, 51, 51, 0.3)',
    buildNeon: '#FFD700', buildFill: 'rgba(255, 215, 0, 0.3)',
};

// --- AUDIO ---
const SFX = {
    laser:   new Audio('sfx/sfx-laser.mp3'),
    move:    new Audio('sfx/sfx-move.mp3'),
    build:   new Audio('sfx/sfx-build.mp3'),
    heal:    new Audio('sfx/sfx-heal.mp3'),
    click:   new Audio('sfx/sfx-click.mp3'),
    explosion: new Audio('sfx/sfx-explosion.mp3'),
    bgMusic: new Audio('sfx/sfx-bg_music.mp3'),
};
SFX.bgMusic.loop   = true;
SFX.bgMusic.volume = 0.4;
let musicPlaying = false;

// --- SPRITE POOLS (emoji fallback) ---
const SPRITE_POOLS = {
    1:          ['🕵️','🥷','🧤','👮','👽'],
    2:          ['🤖','🦾','👾','👹','💀'],
    3:          ['🧬','🦅','🪖','🛡️','🤺'],
    4:          ['🐉','🦁','⚔️','🏹','🔱'],
    hqs:        ['🏯','🛰️','🏰','🗼'],
    walls:      ['🧱','🗿','⛰️','🏛️'],
    barricades: ['🚧','📦','🗑️','⚙️'],
};

// --- DIREZIONI ESAGONALI (pointy-top) ---
const hexDirections = [
    { q:  1, r:  0 }, { q: 1, r: -1 }, { q:  0, r: -1 },
    { q: -1, r:  0 }, { q:-1, r:  1 }, { q:  0, r:  1 },
];

// ============================================================
// UTILITY PURE (nessun effetto collaterale sullo stato)
// ============================================================

/** Chiave stringa per la Map della griglia */
function getKey(q, r) { return `${q},${r}`; }

/** Distanza in esagoni tra due coordinate assiali */
function hexDistance(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

/** Fisher-Yates shuffle (modifica l'array in-place, lo restituisce) */
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/** Estrae un elemento casuale da un pool */
const getRandomSprite = (pool) => pool[Math.floor(Math.random() * pool.length)];

/** Legge lo stato del checkbox IA nel setup */
const isAIActive = () => document.getElementById('ai-active')?.checked;

/** Promise-based delay per le sequenze animate dell'AI */
const delay = ms => new Promise(res => setTimeout(res, ms));

// ============================================================
// AUDIO
// ============================================================

function toggleMusic() {
    const btn = document.getElementById('audio-toggle');
    if (!musicPlaying) {
        SFX.bgMusic.play().catch(() => {});
        btn.innerText  = '🔊 Musica: ON';
        musicPlaying   = true;
    } else {
        SFX.bgMusic.pause();
        btn.innerText  = '🔈 Musica: OFF';
        musicPlaying   = false;
    }
}

function playSFX(effect) {
    if (SFX[effect]) {
        SFX[effect].currentTime = 0;
        SFX[effect].play().catch(() => {});
    }
}

function toggleLegend() {
    document.getElementById('legend-panel').classList.toggle('visible');
    playSFX('click');
}
