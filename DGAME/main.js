/* ============================================================
   main.js — Inizializzazione, input e avvio partita
   ============================================================ */

window.onload = function() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // --- TOUCH (mobile) ---
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isDragging = true; lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
            handleCanvasClick(e.touches[0]);
        } else if (e.touches.length === 2) {
            isDragging = false; isPinching = true;
            initialPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (isDragging && e.touches.length === 1) {
            offsetX += e.touches[0].clientX - lastTouchX; offsetY += e.touches[0].clientY - lastTouchY;
            clampCamera(); lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY; drawGame();
        } else if (isPinching && e.touches.length === 2) {
            let currentDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            HEX_SIZE = Math.max(15, Math.min(60, HEX_SIZE * (currentDist / initialPinchDist)));
            initialPinchDist = currentDist; drawGame();
        }
    }, { passive: false });

    canvas.addEventListener('touchend', () => { isDragging = false; isPinching = false; });

    // --- MOUSE (desktop) ---
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleCanvasHover);
    window.addEventListener('contextmenu', (e) => { e.preventDefault(); cancelAction(); });

    // --- ZOOM rotella mouse ---
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.08 : 0.93;
        HEX_SIZE = Math.max(30, Math.min(100, HEX_SIZE * zoomFactor));
        clampCamera();
        drawGame();
    }, { passive: false });

    // --- PAN tasto centrale o tasto destro trascinato ---
    let isMousePanning = false;
    let panStartX = 0, panStartY = 0;

    canvas.addEventListener('mousedown', (e) => {
        if (e.button === 1 || e.button === 2) {   // centrale o destro
            e.preventDefault();
            isMousePanning = true;
            panStartX = e.clientX;
            panStartY = e.clientY;
            canvas.style.cursor = 'grabbing';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isMousePanning) return;
        offsetX += e.clientX - panStartX;
        offsetY += e.clientY - panStartY;
        panStartX = e.clientX;
        panStartY = e.clientY;
        clampCamera();
        drawGame();
    });

    window.addEventListener('mouseup', (e) => {
        if (e.button === 1 || e.button === 2) {
            isMousePanning = false;
            canvas.style.cursor = 'crosshair';
        }
    });

// --- AGGIUNTA: Suono automatico per tutti i bottoni del menu ---
    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', () => {
            if (typeof playSFX === 'function') {
                playSFX('click');
            }
        });
    });

    // --- SETUP UI ---
    initTimerUI();
    initAIToggleUI();
    updateSetupUI();
};

// --- AVVIO PARTITA ---
function startActiveGameLocal() {
    playSFX('click');
    generateProceduralMap();
    startActiveGameUI(Math.random() < 0.5 ? 1 : 2);
}

function startActiveGameUI(startingPlayer) {
    state = 'PLAYING';
    document.getElementById('setup-overlay').style.display = 'none';
    document.getElementById('controls-panel').style.display = 'block';
    currentPlayer = startingPlayer;
    resetTurnState(); autoFitMap(); drawGame();
}
