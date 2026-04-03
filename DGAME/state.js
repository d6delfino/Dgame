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
let setupData = { points: 30, agents: [] };

// --- GRIGLIA ---
let grid = new Map();           // getKey(q,r) → cell

// --- GIOCATORI ---
// Struttura cell: { hq, agents[], color, colorFill, name, cards[], usedCards{} }
let players = {
    1: { hq: null, agents: [], color: COLORS.p1, colorFill: COLORS.p1Fill, name: 'Verde' },
    2: { hq: null, agents: [], color: COLORS.p2, colorFill: COLORS.p2Fill, name: 'Viola' },
    3: { hq: null, agents: [], color: COLORS.p3, colorFill: COLORS.p3Fill, name: 'Blu'   },
    4: { hq: null, agents: [], color: COLORS.p4, colorFill: COLORS.p4Fill, name: 'Oro'   },
};

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
