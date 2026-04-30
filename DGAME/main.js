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
    // Identifichiamo le risorse
    const imageKeys = Object.keys(customSpriteFiles);
    const audioKeys = Object.keys(SFX);
    totalExpectedAssets = 1 + imageKeys.length + audioKeys.length; 

    // Monitoriamo lo sfondo
    monitorAsset(mapBackground);

    // Monitoriamo le immagini e le creiamo se necessario
    imageKeys.forEach(key => {
        if (!customImages[key]) {
            customImages[key] = new Image();
            customImages[key].src = customSpriteFiles[key];
        }
        monitorAsset(customImages[key]);
    });

    // Monitoriamo l'audio
    audioKeys.forEach(key => {
        const audio = SFX[key];
        if (audio.readyState >= 3) assetItemProcessed();
        else {
            audio.oncanplaythrough = assetItemProcessed;
            audio.onerror = assetItemProcessed;
        }
    });

    // --- NUOVO SISTEMA DI ATTESA ROBUSTO ---
    let attempts = 0;
    const maxAttempts = 15; // Massimo 15 secondi di attesa per server lenti

    const checkStatus = setInterval(() => {
        attempts++;
        const scriptStatus = areScriptsReady();
        
        // Se tutto è pronto, avviamo
        if (scriptStatus && assetsProcessed >= totalExpectedAssets) {
            clearInterval(checkStatus);
            showStartButton();
        } 
        // Se abbiamo raggiunto il tempo massimo (Hard Timeout)
        else if (attempts >= maxAttempts) {
            clearInterval(checkStatus);
            showStartButton(); // Questo mostrerà l'errore specifico
        }
        // Altrimenti, continua a mostrare il progresso nella loading screen
        else {
            assetItemProcessed(); 
        }
    }, 2000);
};

function monitorAsset(asset) {
    if (asset.complete) {
        assetItemProcessed();
    } else {
        asset.onload = assetItemProcessed;
        asset.onerror = assetItemProcessed; 
    }
}

function isStyleReady() {
    // Prova a leggere una variabile definita nel tuo style.css (:root)
    const neonColor = getComputedStyle(document.documentElement)
                        .getPropertyValue('--p1-neon').trim();
    
    // Se la variabile non è vuota, il CSS è stato applicato
    if (neonColor !== "") {
        markScriptAsLoaded('style.css');
        return true;
    }
    return false;
}

function areScriptsReady() {
    isStyleReady();
    const ready = window.requiredScripts.every(script => {
        const isLoaded = window.loadedScripts.has(script);
        // Logga in console solo se lo script non è ancora arrivato (per debug)
        if (!isLoaded) console.log(`[Loading] In attesa di: ${script}...`);
        return isLoaded;
    });
    return ready;
}

function assetItemProcessed() {
    assetsProcessed++;
    const scriptStatus = areScriptsReady();
    
    // Calcolo progresso (pesiamo gli script come 50% e gli asset come 50%)
    const scriptProgress = (window.loadedScripts.size / window.requiredScripts.length) * 100;
    const assetProgress = Math.min(100, Math.floor((assetsProcessed / totalExpectedAssets) * 100));
    
    const totalProgress = Math.floor((scriptProgress + assetProgress) / 2);
    
    const txt = document.getElementById('loading-text');
    if (txt) {
        if (!scriptStatus) {
            txt.innerText = `CARICAMENTO LOGICA: ${Math.floor(scriptProgress)}%`;
            txt.style.color = "#cc00ff"; // Viola per la logica
        } else {
            txt.innerText = `RISORSE: ${assetProgress}%`;
            txt.style.color = "#00ff88"; // Verde per le immagini
        }
    }

    if (scriptStatus && assetsProcessed >= totalExpectedAssets) {
        showStartButton();
    }
}

function showStartButton() {
    const ready = areScriptsReady();
    
    // Se non è pronto mostriamo l'errore (chiamato solo dopo il timeout di 15s dall'onload)
    if (!ready) {
        const missing = window.requiredScripts.filter(s => !window.loadedScripts.has(s));
        console.error("Script ancora mancanti dopo attesa prolungata:", missing);
        
        const txt = document.getElementById('loading-text');
        if (txt) {
            txt.innerHTML = `ERRORE DI RETE (Slow Server)<br>
                             <span style="font-size:11px; color:#ff4444;">
                             Impossibile caricare: ${missing.join(', ')}
                             </span><br>
                             <button onclick="location.reload()" style="margin-top:10px; padding:5px; background:#444; color:#fff; border:none; cursor:pointer;">RIPROVA</button>`;
            txt.style.color = "#ff3333";
        }
        return; 
    }

    if (loadingFinalized) return;
    loadingFinalized = true;

    const spinner = document.querySelector('.loading-spinner');
    const txt = document.getElementById('loading-text');
    const btn = document.getElementById('start-game-btn');

    if (spinner) spinner.style.display = 'none';
    if (txt) {
        txt.innerText = "SISTEMA OPERATIVO PRONTO";
        txt.style.color = "#00ff88";
    }
    if (btn) {
        btn.style.display = 'block';
        btn.style.animation = 'pulse-purple 1.5s infinite';
    }
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

    // --- PAN CON MOUSE (Desktop) ---
let isMouseDragging = false;
let mouseHasMoved = false;
let mouseStartX = 0, mouseStartY = 0;
let lastMouseX = 0, lastMouseY = 0;
const MOUSE_MOVE_THRESHOLD = 5;

canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 2) return; // solo tasto destro
    isMouseDragging = true;
    mouseHasMoved = false;
    mouseStartX = lastMouseX = e.clientX;
    mouseStartY = lastMouseY = e.clientY;
});

canvas.addEventListener('mousemove', (e) => {
    if (!isMouseDragging) return;
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    offsetX += dx;
    offsetY += dy;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    if (Math.hypot(e.clientX - mouseStartX, e.clientY - mouseStartY) > MOUSE_MOVE_THRESHOLD) {
        mouseHasMoved = true;
    }
    clampCamera();
    drawGame();
});

canvas.addEventListener('mouseup', (e) => {
    if (!isMouseDragging) return;
    isMouseDragging = false;
    // Se non c'è stato movimento reale, lasciamo che 'click' gestisca l'evento
    // (il browser sparerà 'click' automaticamente dopo mouseup senza drag)
    if (mouseHasMoved) {
        e.stopImmediatePropagation(); // blocca il 'click' se era un drag
    }
});

canvas.addEventListener('mouseleave', () => {
    isMouseDragging = false;
});

    canvas.addEventListener('mousemove', handleCanvasHover);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;

    // Posizione del cursore relativa al centro dello schermo
    const mouseX = e.clientX - window.innerWidth / 2;
    const mouseY = e.clientY - window.innerHeight / 2;

    // Prima dello zoom, la posizione del cursore nel mondo è:
    // worldX = (mouseX - offsetX) / HEX_SIZE
    // Dopo lo zoom vogliamo che worldX rimanga invariato, quindi
    // aggiustiamo offsetX/Y di conseguenza.
    offsetX = mouseX - (mouseX - offsetX) * factor;
    offsetY = mouseY - (mouseY - offsetY) * factor;

    HEX_SIZE = Math.max(22, Math.min(100, HEX_SIZE * factor));
    clampCamera();
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

    let startingPlayer;
    if (typeof campaignState !== 'undefined' && campaignState.isActive) {
        const parts = campaignState.currentBattleParticipants;
        startingPlayer = parts[Math.floor(Math.random() * parts.length)];
    } else {
        startingPlayer = Math.floor(Math.random() * totalPlayers) + 1;
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

    // --- NUOVO: Mostra elementi UI battaglia ---
    if (timerUI) timerUI.style.display = 'block';
    document.getElementById('audio-toggle').style.display = 'block';
    document.getElementById('legend-toggle-btn').style.display = 'block';

    currentPlayer = startingPlayer;
    _firstPlayerOfGame = startingPlayer;
    if (typeof initCreditShopUI === 'function') initCreditShopUI();
    resetTurnState();
    autoFitMap();
    drawGame();
}


markScriptAsLoaded('main.js');