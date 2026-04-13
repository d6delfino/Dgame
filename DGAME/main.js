/* ============================================================
   main.js — Inizializzazione, input canvas e avvio partita
   ============================================================
   ESPONE: startActiveGameLocal, startActiveGameUI
   DIPENDE DA: constants.js, state.js, graphics.js,
               gamelogic.js (initTimerUI, initAIToggleUI,
                              updateSetupUI, handleCanvasClick,
                              handleCanvasHover, cancelAction),
               map.js (generateProceduralMap)
   ============================================================ */

window.onload = function () {
    canvas = document.getElementById('gameCanvas');
    ctx    = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // --------------------------------------------------------
    // TOUCH (mobile)
    // --------------------------------------------------------
    // Soglia in pixel oltre la quale un touch è considerato drag e non tap.
    // Aumentata a 22 px per maggiore tolleranza sui dispositivi mobile.
    const TAP_MOVE_THRESHOLD = 22;
    let touchStartX = 0, touchStartY = 0;
    let touchHasMoved = false;

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isDragging    = true;
            touchHasMoved = false;
            touchStartX   = lastTouchX = e.touches[0].clientX;
            touchStartY   = lastTouchY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            isDragging        = false;
            isPinching        = true;
            initialPinchDist  = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (isDragging && e.touches.length === 1) {
            const dx = e.touches[0].clientX - touchStartX;
            const dy = e.touches[0].clientY - touchStartY;
            if (!touchHasMoved && Math.hypot(dx, dy) > TAP_MOVE_THRESHOLD) touchHasMoved = true;

            offsetX    += e.touches[0].clientX - lastTouchX;
            offsetY    += e.touches[0].clientY - lastTouchY;
            lastTouchX  = e.touches[0].clientX;
            lastTouchY  = e.touches[0].clientY;
            clampCamera();
            drawGame();
        } else if (isPinching && e.touches.length === 2) {
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            HEX_SIZE       = Math.max(15, Math.min(60, HEX_SIZE * (currentDist / initialPinchDist)));
            initialPinchDist = currentDist;
            drawGame();
        }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        // Esegui click solo se non c'è stato spostamento (tap vero)
        if (isDragging && !touchHasMoved && e.changedTouches.length === 1) {
            e.preventDefault(); // blocca il ghost click successivo
            handleCanvasClick(e.changedTouches[0]);
        }
        isDragging    = false;
        isPinching    = false;
        touchHasMoved = false;

    });

    // --------------------------------------------------------
    // MOUSE (desktop)
    // --------------------------------------------------------
    canvas.addEventListener('click',       handleCanvasClick);
    canvas.addEventListener('mousemove',   handleCanvasHover);
    window.addEventListener('contextmenu', (e) => { e.preventDefault(); cancelAction(); });

    // Zoom con rotella
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.08 : 0.93;
        HEX_SIZE = Math.max(30, Math.min(100, HEX_SIZE * factor));
        clampCamera();
        drawGame();
    }, { passive: false });

    // Pan con tasto centrale o destro trascinato
    let isMousePanning = false, panStartX = 0, panStartY = 0;

    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 1 || e.button === 2) {
            e.preventDefault();
            isMousePanning = true;
            panStartX = e.clientX; panStartY = e.clientY;
            canvas.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isMousePanning) return;
        offsetX   += e.clientX - panStartX;
        offsetY   += e.clientY - panStartY;
        panStartX  = e.clientX; panStartY = e.clientY;
        clampCamera();
        drawGame();
    });

    window.addEventListener('mouseup', (e) => {
        if (e.button === 1 || e.button === 2) {
            isMousePanning      = false;
            canvas.style.cursor = 'crosshair';
        }
    });

    // Suono click su tutti i bottoni del menu
    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', () => {
            if (typeof playSFX === 'function') playSFX('click');
        });
    });

    // --- SETUP UI ---
    initTimerUI();
    initAIToggleUI();
    updateSetupUI();

    // Esposto globalmente: reset stato touch dopo piazzamento carta Fortino
    window.resetTouchStateForCard = function () {
        isDragging    = false;
        touchHasMoved = false;
        touchStartX   = 0;
        touchStartY   = 0;
    };

    checkAutoReconnect();

};

// ============================================================
// AVVIO PARTITA
// ============================================================

function checkAutoReconnect() {
    const autoId = sessionStorage.getItem('RICONNETTITI');
    if (autoId) {
        console.log("[Auto-Reconnect] Trovato ID sessione precedente:", autoId);
        
        // 1. Prepariamo la UI mostrandola per un istante (opzionale)
        showOnlineMenu();
        showClientPanel();
        
        const input = document.getElementById('peer-id-input');
        if (input) input.value = autoId;

        const status = document.getElementById('connection-status');
        if (status) {
            status.innerText = "🔄 Ripristino partita in corso...";
            status.style.color = "#FFD700";
        }

        // 2. Lanciamo la connessione dopo un breve delay per assicurarci che PeerJS sia pronto
        setTimeout(() => {
            if (typeof connectToHost === 'function') {
                connectToHost();
            }
        }, 1000);
    }
}

function startActiveGameLocal() {
    playSFX('click');
    generateProceduralMap();
    const startingPlayer = Math.random() < 0.5 ? 1 : 2;
    startActiveGameUI(startingPlayer);

    // Immunità primo turno: protegge chi non gioca per primo  ← AGGIUNGI
    for (let p = 1; p <= totalPlayers; p++) {                 // ← AGGIUNGI
        const immune = (p !== startingPlayer);                // ← AGGIUNGI
        players[p].agents.forEach(a => { a.firstTurnImmune = immune; });  // ← AGGIUNGI
        if (players[p].hq) players[p].hq.firstTurnImmune = immune;        // ← AGGIUNGI
    }                                                         // ← AGGIUNGI
}

function startActiveGameUI(startingPlayer) {
    state = 'PLAYING';
    document.getElementById('setup-overlay').style.display  = 'none';
    document.getElementById('controls-panel').style.display = 'block';
    currentPlayer = startingPlayer;
    // Inizializza l'UI del negozio crediti (credits.js)
    if (typeof initCreditShopUI === 'function') initCreditShopUI();
    resetTurnState();
    autoFitMap();
    drawGame();
}

