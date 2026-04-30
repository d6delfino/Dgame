/* ============================================================
   state.js — Stato Globale della Partita (unica fonte di verità)
   ============================================================
   ESPONE: tutte le variabili mutabili di partita
   DIPENDE DA: niente (caricato per primo dopo config)

   REGOLA: nessun altro file dichiara queste variabili.
   Tutti gli altri moduli le leggono e scrivono direttamente
   (JS non ha moduli ES qui, ma la dichiarazione è centralizzata).
   ============================================================ */

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
// Struttura cell: { hq, agents[], color, colorFill, name, cards[], usedCards{} }
/*
let players = {
    1: { hq: null, agents: [], color: COLORS.p1, colorFill: COLORS.p1Fill, name: 'Verde', credits: 0 },
    2: { hq: null, agents: [], color: COLORS.p2, colorFill: COLORS.p2Fill, name: 'Viola', credits: 0 },
    3: { hq: null, agents: [], color: COLORS.p3, colorFill: COLORS.p3Fill, name: 'Blu',   credits: 0 },
    4: { hq: null, agents: [], color: COLORS.p4, colorFill: COLORS.p4Fill, name: 'Oro',   credits: 0 },
};
*/

let players = {
    1: { hq: null, agents: [], color: COLORS.p1, name: 'Verde', credits: 0 },
    2: { hq: null, agents: [], color: COLORS.p2, name: 'Viola', credits: 0 },
    3: { hq: null, agents: [], color: COLORS.p3, name: 'Blu',   credits: 0 },
    4: { hq: null, agents: [], color: COLORS.p4, name: 'Oro',   credits: 0 },
    5: { hq: null, agents: [], color: COLORS.p5, name: 'Rosso', credits: 0 },
    6: { hq: null, agents: [], color: COLORS.p6, name: 'Bianco',credits: 0 },
    7: { hq: null, agents: [], color: COLORS.p7, name: 'Grigio',credits: 0 },
    8: { hq: null, agents: [], color: COLORS.p8, name: 'Rosa',  credits: 0 },
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
let isDragging      = false;
let isPinching      = false;
let lastTouchX      = 0;
let lastTouchY      = 0;
let initialPinchDist = null;

// ============================================================
// HELPER: RESET GIOCATORI
// ============================================================
/**
 * Azzerata HQ e agenti di tutti i giocatori.
 * Usata da multiplayer.js nei tre punti in cui si ri-inizializza
 * la partita (locale, client online, host online).
 */
function resetPlayers() {
    for (let p = 1; p <= 8; p++) {
        players[p].hq     = null;
        players[p].agents = [];
    }
}

/**
 * Crea un oggetto setupData fresco con i punti iniziali.
 */
function freshSetupData() {
    return { points: GAME.SETUP_POINTS, agents: [] };
}

function fullResetForBattle() {
    // 1. Pulisce la griglia fisica (rimuove resti della vecchia mappa)
    if (grid && grid.clear) grid.clear();
    if (controlPoints && controlPoints.clear) controlPoints.clear();

    // 2. Pulisce le liste agenti e HQ dei giocatori
    resetPlayers();
    turnCount = 0;

    // 3. Svuota il "carrello" del setup (il mercato degli agenti)
    // Usiamo freshSetupData() per riavere i punti iniziali corretti
    setupData = freshSetupData(); 

    // 4. Fondamentale per l'Online: Ripristina la tua identità locale
    // Senza questo, il Giocatore 2 potrebbe trovarsi a fare il setup come Giocatore 1
    if (isOnline) {
        currentPlayer = myPlayerNumber; 
    }

    // 5. Pulisce eventuali rimasugli grafici sul canvas
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);

    console.log("[System] Stato resettato completamente per la nuova battaglia.");
}


markScriptAsLoaded('state.js');