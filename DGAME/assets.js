/* ============================================================
   assets.js — Caricamento immagini e gestione temi visivi
   ============================================================
   ESPONE: customImages, customSpriteFiles, mapBackground,
           bgOptions, applyTheme,
           SELECTED_BG_ID, THEME_WALL_PREFIX, THEME_WALL_COUNT,
           THEME_BARRICADE_ID
   DIPENDE DA: constants.js (getRandomSprite, SPRITE_POOLS)
   ============================================================ */

// --- TEMI DISPONIBILI ---
// Ogni tema ha: id univoco, path dello sfondo, prefix sprite muri, conteggio sprite
const bgOptions = [
    { id: 'S1', path: 'img/sfondo1.jpg', prefix: 'HE', count: 20 },
    { id: 'S2', path: 'img/sfondo2.jpg', prefix: 'ZE', count: 20 },
    { id: 'S3', path: 'img/sfondo3.jpg', prefix: 'EC', count: 22 },
];

// --- VARIABILI TEMA ATTIVO ---
let SELECTED_BG_ID      = null;
let THEME_WALL_PREFIX   = null;
let THEME_WALL_COUNT    = 0;
let THEME_BARRICADE_ID  = null;   // sprite usato per le barricate costruite in-game

// --- IMMAGINE DI SFONDO ---
const mapBackground = new Image();

// --- CATALOGO SPRITE ---
// customSpriteFiles: mappa key → path (usata per <img> nel setup)
// customImages:      mappa key → HTMLImageElement caricato
const customSpriteFiles = {
    'HQ1': 'img/HQ1.png', 'HQ2': 'img/HQ2.png',
    'HQ3': 'img/HQ3.png', 'HQ4': 'img/HQ4.png',
    'HQ5': 'img/HQ5.png', 'HQ6': 'img/HQ6.png', 
    'HQ7': 'img/HQ7.png', 'HQ8': 'img/HQ8.png'
};
const customImages = {};

// ============================================================
// FUNZIONI
// ============================================================

/**
 * Applica un tema: imposta sfondo, carica gli sprite dei muri
 * e aggiorna le variabili globali del tema attivo.
 * @param {Object} themeObj - uno degli oggetti in bgOptions
 */
function applyTheme(themeObj) {
    SELECTED_BG_ID     = themeObj.id;
    THEME_WALL_PREFIX  = themeObj.prefix;
    THEME_WALL_COUNT   = themeObj.count;
    mapBackground.src  = themeObj.path;

    // Il primo sprite della serie tematica è usato per le barricate costruite
    THEME_BARRICADE_ID = THEME_WALL_PREFIX + '1';

    console.log(`[Assets] Tema applicato: ${SELECTED_BG_ID} (barricata: ${THEME_BARRICADE_ID})`);

    // Registra e precarica gli sprite dei muri del tema
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

/**
 * Precarica tutti gli sprite fissi (HQ e Agenti).
 * Chiamata una volta all'avvio.
 */
function preloadFixedSprites() {
    // 1. Precarica HQ
    Object.entries(customSpriteFiles).forEach(([key, url]) => {
        if (!customImages[key]) {
            const img  = new Image();
            img.src    = url;
            img.onload = () => { customImages[key] = img; };
        }
    });

    // 2. Precarica Agenti dinamicamente in base alla configurazione
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

// --- INIZIALIZZAZIONE ---
// Tema casuale al primo caricamento (per Host / Single Player)
const initialTheme = bgOptions[Math.floor(Math.random() * bgOptions.length)];
applyTheme(initialTheme);
preloadFixedSprites();



markScriptAsLoaded('assets.js');