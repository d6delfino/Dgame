/* ============================================================
   config.js — Costanti globali, dati statici e stato di gioco
   ============================================================ */

const mapBackground = new Image();
mapBackground.src = 'img/sfondo.jpg';
const zoomSpeed = 0.05;

let HEX_SIZE = 30;
let offsetX = 0; let offsetY = 0;
let isDragging = false; let isPinching = false;
let lastTouchX = 0; let lastTouchY = 0; let initialPinchDist = null;
const GRID_RADIUS = 9;
const MARGIN = 150;

const COLORS = {
    bg: '#050509', grid: '#1a1a25', wall: '#3a3a50',
    p1: '#00ff88', p1Fill: 'rgba(0, 255, 136, 0.15)',
    p2: '#cc00ff', p2Fill: 'rgba(204, 0, 255, 0.15)',
    p3: '#00aaff', p3Fill: 'rgba(0, 170, 255, 0.15)',
    p4: '#FFD700', p4Fill: 'rgba(255, 215, 0, 0.15)',
    moveNeon: '#00ffff', moveFill: 'rgba(0, 255, 255, 0.25)',
    atkNeon: '#ff3333', atkFill: 'rgba(255, 51, 51, 0.3)',
    buildNeon: '#FFD700', buildFill: 'rgba(255, 215, 0, 0.3)'
};

const SFX = {
    laser: new Audio('sfx/sfx-laser.mp3'), 
    move: new Audio('sfx/sfx-move.mp3'),
    build: new Audio('sfx/sfx-build.mp3'), 
    heal: new Audio('sfx/sfx-heal.mp3'),
    click: new Audio('sfx/sfx-click.mp3'), 
    explosion: new Audio('sfx/sfx-explosion.mp3'),
    bgMusic: new Audio('sfx/sfx-bg_music.mp3')
};
SFX.bgMusic.loop = true; SFX.bgMusic.volume = 0.4;
let musicPlaying = false;

const SPRITE_POOLS = {
    1: ['🕵️', '🥷', '🧤', '👮', '👽'], 2: ['🤖', '🦾', '👾', '👹', '💀'],
    3: ['🧬', '🦅', '🪖', '🛡️', '🤺'], 4: ['🐉', '🦁', '⚔️', '🏹', '🔱'],
    hqs: ['🏯', '🛰️', '🏰', '🗼'], walls: ['🧱', '🗿', '⛰️', '🏛️'], barricades: ['🚧', '📦', '🗑️', '⚙️']
};

const customImages = {};
const customSpriteFiles = {
    'HQ1': 'img/HQ1.png', 'HQ2': 'img/HQ2.png', 'HQ3': 'img/HQ3.png', 'HQ4': 'img/HQ4.png',
    'AG1': 'img/AG1.png', 'AG2': 'img/AG2.png', 'AG3': 'img/AG3.png', 'AG4': 'img/AG4.png',
    'AG5': 'img/AG5.png', 'AG6': 'img/AG6.png', 'AG7': 'img/AG7.png', 'AG8': 'img/AG8.png',
    'AG9': 'img/AG9.png', 'AG10': 'img/AG10.png', 'AG11': 'img/AG11.png', 'AG12': 'img/AG12.png',
    'AG13': 'img/AG13.png', 'AG14': 'img/AG14.png', 'AG15': 'img/AG15.png', 'AG16': 'img/AG16.png',
    'OB1': 'img/OB1.png', 'OB2': 'img/OB2.png', 'OB3': 'img/OB3.png','OB4': 'img/OB4.png', 'OB5': 'img/OB5.png',
    'OB6': 'img/OB6.png','OB7': 'img/OB7.png', 'OB8': 'img/OB8.png', 'OB9': 'img/OB9.png', 'OB10': 'img/OB10.png',
    'OB11': 'img/OB11.png', 'OB12': 'img/OB12.png', 'OB13': 'img/OB13.png', 'OB14': 'img/OB14.png',
    'OB15': 'img/OB15.png', 'OB16': 'img/OB16.png', 'OB17': 'img/OB17.png', 'OB18': 'img/OB18.png'
};

Object.entries(customSpriteFiles).forEach(([key, url]) => {
    const img = new Image(); img.src = url;
    img.onload = () => { customImages[key] = img; };
});

const getRandomSprite = (pool) => pool[Math.floor(Math.random() * pool.length)];

const hexDirections = [
    {q: 1, r: 0}, {q: 1, r: -1}, {q: 0, r: -1}, {q: -1, r: 0}, {q: -1, r: 1}, {q: 0, r: 1}
];

// --- STATO PARTITA ---
let turnCount = 0;
let turnCounterUI;
let totalPlayers = 2;
let state = 'SETUP_P1';
let currentPlayer = 1;
let setupData = { points: 30, agents: [] };
let players = {
    1: { hq: null, agents: [], color: COLORS.p1, colorFill: COLORS.p1Fill, name: "Verde" },
    2: { hq: null, agents: [], color: COLORS.p2, colorFill: COLORS.p2Fill, name: "Viola" },
    3: { hq: null, agents: [], color: COLORS.p3, colorFill: COLORS.p3Fill, name: "Blu" },
    4: { hq: null, agents: [], color: COLORS.p4, colorFill: COLORS.p4Fill, name: "Oro" }
};
let grid = new Map();
let canvas, ctx;
let selectedAgent = null; let currentActionMode = null; let validActionTargets = [];

// --- VARIABILI TIMER ---
let turnTimerInterval; let timeLeft = 60; let timerUI;

// --- HELPERS ---
function hexDistance(a, b) { return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2; }
function getKey(q, r) { return `${q},${r}`; }
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
const isAIActive = () => document.getElementById('ai-active')?.checked;
const delay = ms => new Promise(res => setTimeout(res, ms));

function toggleMusic() {
    const btn = document.getElementById('audio-toggle');
    if (!musicPlaying) { SFX.bgMusic.play().catch(()=>{}); btn.innerText = "🔊 Musica: ON"; musicPlaying = true; }
    else { SFX.bgMusic.pause(); btn.innerText = "🔈 Musica: OFF"; musicPlaying = false; }
}
function playSFX(effect) { if (SFX[effect]) { SFX[effect].currentTime = 0; SFX[effect].play().catch(()=>{}); } }
function toggleLegend() { document.getElementById('legend-panel').classList.toggle('visible'); playSFX('click'); }