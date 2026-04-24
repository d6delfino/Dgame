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

let assetsProcessed = 0;
let totalExpectedAssets = 0;
let loadingFinalized = false;

window.onload = function () {
    // 1. Identifichiamo le risorse
    const imageKeys = Object.keys(customSpriteFiles);
    // Totale = Background + Immagini Fazioni/Muri + Suoni
    const audioKeys = Object.keys(SFX);
    totalExpectedAssets = 1 + imageKeys.length + audioKeys.length; 

    // Monitoriamo lo sfondo
    monitorAsset(mapBackground);

    // Monitoriamo le immagini GIA' inizializzate da assets.js
    imageKeys.forEach(key => {
        // Se assets.js non ha ancora creato l'immagine, la creiamo qui
        if (!customImages[key]) {
            customImages[key] = new Image();
            customImages[key].src = customSpriteFiles[key];
        }
        monitorAsset(customImages[key]);
    });

    // Monitoriamo l'audio (per il progresso visivo)
    audioKeys.forEach(key => {
        const audio = SFX[key];
        if (audio.readyState >= 3) {
            assetItemProcessed();
        } else {
            audio.oncanplaythrough = assetItemProcessed;
            audio.onerror = assetItemProcessed; // Non bloccare se l'audio fallisce
        }
    });

    // Timeout di sicurezza (4 secondi)
    setTimeout(showStartButton, 4000);
};

function monitorAsset(asset) {
    if (asset.complete) {
        assetItemProcessed();
    } else {
        asset.onload = assetItemProcessed;
        asset.onerror = assetItemProcessed; 
    }
}

function assetItemProcessed() {
    assetsProcessed++;
    const progress = Math.min(100, Math.floor((assetsProcessed / totalExpectedAssets) * 100));
    const txt = document.getElementById('loading-text');
    if (txt) txt.innerText = `SISTEMA: ${progress}%`;

    if (assetsProcessed >= totalExpectedAssets) {
        showStartButton();
    }
}

function showStartButton() {
    if (loadingFinalized) return;
    loadingFinalized = true;

    const spinner = document.querySelector('.loading-spinner');
    const txt = document.getElementById('loading-text');
    const btn = document.getElementById('start-game-btn');

    if (spinner) spinner.style.display = 'none';
    if (txt) txt.innerText = "SISTEMA PRONTO";
    if (btn) btn.style.display = 'block';
}

function initGameEngine() {
    const ls = document.getElementById('loading-screen');
    if (ls) ls.remove();

    // SBLOCCO AUDIO (Critico per Smartphone)
    if (typeof SFX !== 'undefined') {
        Object.values(SFX).forEach(audio => {
            // Su mobile, load() o play() silenzioso sblocca l'istanza
            audio.play().then(() => {
                audio.pause();
                audio.currentTime = 0;
            }).catch(e => console.log("Audio attende interazione"));
        });
    }

    // Inizializzazione Canvas
    canvas = document.getElementById('gameCanvas');
    ctx    = canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // --- GESTIONE INPUT ---
    const TAP_MOVE_THRESHOLD = 22;
    let touchStartX = 0, touchStartY = 0;
    let touchHasMoved = false;

    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isDragging = true;
            touchHasMoved = false;
            touchStartX = lastTouchX = e.touches[0].clientX;
            touchStartY = lastTouchY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            isDragging = false;
            isPinching = true;
            initialPinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (isDragging && e.touches.length === 1) {
            offsetX += e.touches[0].clientX - lastTouchX;
            offsetY += e.touches[0].clientY - lastTouchY;
            lastTouchX = e.touches[0].clientX;
            lastTouchY = e.touches[0].clientY;
            if (Math.hypot(e.touches[0].clientX - touchStartX, e.touches[0].clientY - touchStartY) > TAP_MOVE_THRESHOLD) {
                touchHasMoved = true;
            }
            clampCamera();
            drawGame();
        } else if (isPinching && e.touches.length === 2) {
            const currentDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            HEX_SIZE = Math.max(15, Math.min(60, HEX_SIZE * (currentDist / initialPinchDist)));
            initialPinchDist = currentDist;
            drawGame();
        }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        if (isDragging && !touchHasMoved && e.changedTouches.length === 1) {
            handleCanvasClick(e.changedTouches[0]);
        }
        isDragging = false; isPinching = false;
    });

    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', handleCanvasHover);
    window.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        HEX_SIZE = Math.max(15, Math.min(100, HEX_SIZE * factor));
        drawGame();
    }, { passive: false });

    document.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', () => { if (typeof playSFX === 'function') playSFX('click'); });
    });

    // Startup finale
    initTimerUI();
    initAIToggleUI();
    updateSetupUI();
    
    // Gestione riconnessione automatica (solo dopo ENTRA)
    checkAutoReconnect();
}

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

    // Se siamo in campagna, startingPlayer deve essere rigorosamente participants[0]
    let startingPlayer;
    if (typeof campaignState !== 'undefined' && campaignState.isActive) {
        startingPlayer = campaignState.currentBattleParticipants[0];
    } else {
        startingPlayer = Math.random() < 0.5 ? 1 : 2;
    }

    startActiveGameUI(startingPlayer);

    // Diamo l'immunità a tutti tranne al giocatore che inizia
    for (let p = 1; p <= totalPlayers; p++) {
        const immune = (p !== startingPlayer);
        // Proteggiamo solo se gli agenti/HQ esistono per questa fazione
        if (players[p] && players[p].agents) {
            players[p].agents.forEach(a => { a.firstTurnImmune = immune; });
        }
        if (players[p] && players[p].hq) {
            players[p].hq.firstTurnImmune = immune;
        }
    }
}

function startActiveGameUI(startingPlayer) {
    state = 'PLAYING';
    document.getElementById('setup-overlay').style.display  = 'none';
    document.getElementById('controls-panel').style.display = 'block';
    currentPlayer = startingPlayer;
    _firstPlayerOfGame = startingPlayer;
    // Inizializza l'UI del negozio crediti (credits.js)
    if (typeof initCreditShopUI === 'function') initCreditShopUI();
    resetTurnState();
    autoFitMap();
    drawGame();
}

