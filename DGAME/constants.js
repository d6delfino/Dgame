/* ============================================================
   constants.js — Costanti globali (immutabili a runtime)
   ============================================================
   ESPONE: COLORS, SFX, SPRITE_POOLS, hexDirections, GRID_RADIUS,
           GAME, getKey, hexDistance, shuffleArray, getRandomSprite,
           isAIActive, delay, MARGIN
   DIPENDE DA: niente (caricato per primo)
   ============================================================ */

// --- GRIGLIA ---
const GRID_RADIUS = 9;
const MARGIN      = 150;

// --- BILANCIAMENTO PARTITA ---
// Tutti i numeri magici del gioco sono qui.
// Modificare questi valori cambia le regole senza toccare la logica.
const GAME = {
    SETUP_POINTS:     30,    // punti disponibili nella fase di setup
    AGENT_COST:        4,    // costo per reclutare un agente
    AP_PER_TURN:       3,    // action points per agente per turno
    HQ_HP:            30,    // HP iniziali di ogni quartier generale
    BARRICADE_HP:      2,    // HP di una barricata costruita
    WALL_HP_MIN:       5,    // HP minimo di un muro procedurale
    WALL_HP_RANGE:     6,    // HP muro = WALL_HP_MIN + random(WALL_HP_RANGE)
    WALL_DENSITY:   0.18,    // probabilita che una cella vuota diventi muro
    TURN_TIMER_SEC:   90,    // secondi per turno prima del passaggio automatico
    AI_DELAY_MS:    1200,    // ms di attesa prima che l AI inizi il suo turno
    AI_STEP_DELAY_MS: 800,   // ms tra ogni azione animata dell AI

    // --- SISTEMA CREDITI ---
    CP_COUNT:            4,    // numero di punti di controllo sulla mappa
    CREDIT_PER_CP:       1,    // crediti per punto di controllo posseduto
    CREDIT_PER_BASE:     1,    // crediti bonus se la propria base è viva
    CREDIT_AGENT_BASE:   4,    // costo base per reclutare un agente (+ stat extra)
    CREDIT_CARD_REPLACE: 10,   // costo per rimpiazzare una carta già usata

    // --- CARTE ---
    FORTINO_BUILDS:  4,    // numero di barricate costruibili con la carta Fortino
    MEDIKIT_HEAL:    3,    // HP massimi curati da un Medikit automatico
};

// --- COSTANTI CAMPAGNA ---
// Separate da GAME perché si riferiscono alla mappa strategica, non alla partita tattica.
const CAMPAIGN = {
    GRID_COLS:         9,
    GRID_ROWS:         7,
    HEX_SIZE:         70,   // dimensione esagoni nella mappa campagna (diversa da HEX_SIZE di gioco)
    VICTORY_THRESHOLD: 32,
    UPGRADE_MINE_COST:     10,   // costo Miniera (+2 rendita permanente)
    UPGRADE_MINEFIELD_COST: 20,   // costo Campo Minato (ferma l'attaccante)
    UPGRADE_FORTRESS_COST: 10,   // costo Fortezza Migliorata (+4 crediti difesa in battaglia)
    UPGRADE_BONIFICA_COST: 30,   // costo per sbloccare un settore bloccato
    NUCLEARIZE_COST:       40,   // costo Nuclearizzazione (distrugge settore → bloccato 1 turno)
    UPGRADE_HANGAR_COST:     40,
    UPGRADE_LEGLAB_COST:     30,
    UPGRADE_ARMLAB_COST:     10,
    UPGRADE_ARMORLAB_COST:   20,
    UPGRADE_WEAPONLAB_COST:  20,
    UPGRADE_ICBM_COST:       80,
    UPGRADE_ARTILLERY_COST:  20,
    UPGRADE_NUKE_UNLOCK_COST: 80,
    // COSTANTI MECCANICHE
    ARTILLERY_RANGE:         3,
    ARTILLERY_CREDIT_DMG_PERCENT: 0.25,
};

// --- COLORI FAZIONI E UI ---
const COLORS = {
    bg:        '#050509',
    grid:      '#1a1a25',
    wall:      '#3a3a50',
    p1:        '#00ff88', p1Fill: 'rgba(0, 255, 136, 0.15)',
    p2:        '#cc00ff', p2Fill: 'rgba(204, 0, 255, 0.15)',
    p3:        '#00aaff', p3Fill: 'rgba(0, 170, 255, 0.15)',
    p4:        '#FFD700', p4Fill: 'rgba(255, 215, 0, 0.15)',
    
    p5: '#ff3333', p5Fill: 'rgba(255, 51, 51, 0.15)', // Rosso
    p6: '#ffffff', p6Fill: 'rgba(255, 255, 255, 0.15)', // Bianco
    p7: '#444444', p7Fill: 'rgba(68, 68, 68, 0.15)', // Grigio Scuro
    p8: '#ff69b4', p8Fill: 'rgba(255, 105, 180, 0.15)', // Rosa
 
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
    5: ['🧨','👺','🥊','🎯','🚩'],
    6: ['🧊','🏐','🦢','💎','🏳️'],
    7: ['🌑','💣','⛓️','🕶️','🏴'],
    8: ['🌸','🎀','🍭','🦄','🧠'],
    hqs: ['🏯','🛰️','🏰','🗼','🛖','🏢','🏭','🏠'],
    walls:      ['🧱','🗿','⛰️','🏛️'],
    barricades: ['🚧','📦','🗑️','⚙️'],
};

// --- DIREZIONI ESAGONALI (pointy-top) ---
const hexDirections = [
    { q:  1, r:  0 }, { q: 1, r: -1 }, { q:  0, r: -1 },
    { q: -1, r:  0 }, { q:-1, r:  1 }, { q:  0, r:  1 },
];


// --- PREFISSI IMMAGINI AGENTI ---
// Definisce il prefisso e il numero totale di immagini disponibili per fazione.
// Se vuoi aggiungere più immagini (es. da 4 a 11), basta cambiare il "count" qui
// e aggiungere i file (es. EUR5.png ... EUR11.png) nella cartella "img/".
const FACTION_PREFIXES = {
    1: { prefix: 'EUR', count: 16 }, // Verdi
    2: { prefix: 'ZER', count: 16 }, // Viola
    3: { prefix: 'MED', count: 16 }, // Blu
    4: { prefix: 'GUA', count: 16 }, // Oro
    5: { prefix: 'DEM', count: 16 }, // Rossi
    6: { prefix: 'ALI', count: 16 }, // Bianchi
    7: { prefix: 'ROB', count: 16 }, // Grigi
    8: { prefix: 'UNI', count: 16 }  // Rosa
};

// Dati di ogni fazione: tutte e 8 le opzioni disponibili.
const _FACTION_DEFS = [
    { slot: 1, name: 'Verde',  color: COLORS.p1, spritePool: SPRITE_POOLS[1] },
    { slot: 2, name: 'Viola',  color: COLORS.p2, spritePool: SPRITE_POOLS[2] },
    { slot: 3, name: 'Blu',    color: COLORS.p3, spritePool: SPRITE_POOLS[3] },
    { slot: 4, name: 'Oro',    color: COLORS.p4, spritePool: SPRITE_POOLS[4] },
    { slot: 5, name: 'Rosso',  color: COLORS.p5, spritePool: SPRITE_POOLS[5] },
    { slot: 6, name: 'Bianco', color: COLORS.p6, spritePool: SPRITE_POOLS[6] },
    { slot: 7, name: 'Grigio', color: COLORS.p7, spritePool: SPRITE_POOLS[7] },
    { slot: 8, name: 'Rosa',   color: COLORS.p8, spritePool: SPRITE_POOLS[8] },
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
        // Forza il reset del file audio
        SFX[effect].pause();
        SFX[effect].currentTime = 0;
        
        // Firefox richiede la gestione della Promise restituita da play()
        const playPromise = SFX[effect].play();
        
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.warn(`[Audio] Riproduzione bloccata per l'effetto: ${effect}. Richiesta interazione utente.`);
            });
        }
    }
}

function toggleLegend() {
    document.getElementById('legend-panel').classList.toggle('visible');
    playSFX('click');
}

// REGISTRO CARICAMENTO SCRIPT
window.requiredScripts = [
    'constants.js', 'style.css', 'core.js',
    'map.js', 'network_core.js', 'network_sync.js', 'gamelogic.js', 
    'ai.js', 'cards.js', 'setup.js', 'credits.js', 'carduse.js', 
    'main.js', 'campaign_upgrades.js', 'campaign_map.js', 'campaign_battle.js', 
    'campaign_multiplayer.js'
];
window.loadedScripts = new Set();

function markScriptAsLoaded(name) {
    window.loadedScripts.add(name);
    console.log(`[System] Script caricato: ${name}`);
}

// Segnala subito se stesso
markScriptAsLoaded('constants.js');