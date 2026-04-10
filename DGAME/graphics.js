/* ============================================================
   graphics.js — Rendering canvas, camera e disegno della mappa
   ============================================================
   ESPONE: hexToPixel, pixelToHex, hexRound, autoFitMap,
           clampCamera, resizeCanvas, drawGame, drawHex,
           drawLaserBeam, showDisconnectOverlay
   DIPENDE DA: constants.js, assets.js, state.js
   ============================================================ */

function hexToPixel(q, r) {
    return {
        x: HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r) + (window.innerWidth  / 2) + offsetX,
        y: HEX_SIZE * (3 / 2 * r)                                + (window.innerHeight / 2) + offsetY,
    };
}

function pixelToHex(x, y) {
    x -= (window.innerWidth  / 2) + offsetX;
    y -= (window.innerHeight / 2) + offsetY;
    return hexRound(
        (Math.sqrt(3) / 3 * x - 1 / 3 * y) / HEX_SIZE,
        (2 / 3 * y) / HEX_SIZE
    );
}

function hexRound(q, r) {
    let s = -q - r;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
    const qDiff = Math.abs(rq - q), rDiff = Math.abs(rr - r), sDiff = Math.abs(rs - s);
    if      (qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
    else if (rDiff > sDiff)                  rr = -rq - rs;
    return { q: rq, r: rr };
}

// --- CAMERA ---

/**
 * Calcola HEX_SIZE per far stare tutta la mappa a schermo.
 * Su schermi > 1024 px applica uno zoom del 50% in più.
 */
function autoFitMap() {
    const width     = window.innerWidth;
    const height    = window.innerHeight;
    const zoomBoost = width > 1024 ? 1.5 : 1.0;

    const baseSize = Math.min(
        (width  * 0.8)  / (Math.sqrt(3) * (GRID_RADIUS * 2)),
        (height * 0.6)  / (1.5          * (GRID_RADIUS * 2))
    );

    HEX_SIZE = Math.max(25, baseSize * zoomBoost);
    offsetX  = 0;
    offsetY  = 0;
    drawGame();
}

/** Limita lo spostamento della camera per non uscire dalla mappa */
function clampCamera() {
    const currentMapWidth  = (GRID_RADIUS * 2) * (HEX_SIZE * Math.sqrt(3));
    const currentMapHeight = (GRID_RADIUS * 2) * (HEX_SIZE * 1.5);
    const margin = 300;
    const limitX = Math.max(0, (currentMapWidth  - window.innerWidth)  / 2) + margin;
    const limitY = Math.max(0, (currentMapHeight - window.innerHeight) / 2) + margin;
    offsetX = Math.max(-limitX, Math.min(limitX, offsetX));
    offsetY = Math.max(-limitY, Math.min(limitY, offsetY));
}

function resizeCanvas() {
    const dpr    = window.devicePixelRatio || 1;
    const width  = window.innerWidth;
    const height = window.innerHeight;

    canvas.width  = width  * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.width  = width  + 'px';
    canvas.style.height = height + 'px';

    if (width < 600) autoFitMap();
    if (state === 'PLAYING') drawGame();
}

// --- RENDERING PRINCIPALE ---

function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Sfondo (immagine o colore solido)
    if (mapBackground.complete && mapBackground.naturalWidth > 0) {
        const bgScale = HEX_SIZE / 20;
        const bgW = mapBackground.width  * bgScale;
        const bgH = mapBackground.height * bgScale;
        const bgX = (window.innerWidth  / 2) + offsetX - bgW / 2;
        const bgY = (window.innerHeight / 2) + offsetY - bgH / 2;
        ctx.drawImage(mapBackground, bgX, bgY, bgW, bgH);
    } else {
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }

    // 2. Velo semi-trasparente per aumentare il contrasto UI
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    // 3. Griglia, muri e barricate
    grid.forEach(cell => {
        let fill = null;
        if      (cell.type === 'wall')      fill = '#777';
        else if (cell.type === 'barricade') fill = '#bbb';
        else if (cell.terrain && typeof TERRAINS !== 'undefined') {
            fill = TERRAINS[cell.terrain].color;
            stroke = 'rgba(255, 255, 255, 0.05)'; // bordo più leggero per i terreni
        }

        drawHex(cell.q, cell.r, 'rgba(110, 110, 110, 0.3)', fill, 1);

        // Le icone terreno vengono disegnate al passo 5b, dopo le entità, per sovrapporsi sempre

        if (cell.type === 'wall' || cell.type === 'barricade') {
            const p = hexToPixel(cell.q, cell.r);
            if (cell.customSpriteId && customImages[cell.customSpriteId]?.complete) {
                const imgSize = HEX_SIZE * 1.9;
                ctx.drawImage(customImages[cell.customSpriteId], p.x - imgSize / 2, p.y - imgSize / 2, imgSize, imgSize);
            } else {
                ctx.font      = `${Math.round(HEX_SIZE * 0.5)}px Arial`;
                ctx.textAlign = 'center';
                ctx.fillText(cell.sprite, p.x, p.y + HEX_SIZE * 0.17);
            }
        }

    });

    // 4. Celle target azioni valide
    validActionTargets.forEach(t => {
        let stroke = COLORS.atkNeon,  fill = COLORS.atkFill;
        if      (currentActionMode === 'move'  || currentActionMode === 'card_airdrop') { stroke = COLORS.moveNeon;  fill = COLORS.moveFill;  }
        else if (currentActionMode === 'build' || currentActionMode === 'card_build')   { stroke = COLORS.buildNeon; fill = COLORS.buildFill; }
        drawHex(t.q, t.r, stroke, fill);
    });

    // 4b. Punti di controllo
    controlPoints.forEach(cp => {
        const cpColor = cp.faction > 0 ? players[cp.faction].color : '#888888';
        const p = hexToPixel(cp.q, cp.r);

        // Bordo esagonale tratteggiato (stile zona di cattura)
        const lineW = cp.faction > 0 ? 2.5 : 1.5;
        ctx.save();
        ctx.setLineDash([8, 6]); // Rende il bordo a trattini
        ctx.shadowBlur  = cp.faction > 0 ? 12 : 4;
        ctx.shadowColor = cpColor;
        drawHex(cp.q, cp.r, cpColor, cpColor + '11', lineW);
        ctx.restore();

        // Icona: Grande "X" incrociata al centro
        const size = HEX_SIZE * 0.38;
        ctx.save();
        ctx.strokeStyle = cpColor;
        ctx.lineWidth   = cp.faction > 0 ? 4 : 2;
        ctx.lineCap     = 'round';
        ctx.shadowBlur  = cp.faction > 0 ? 12 : 4;
        ctx.shadowColor = cpColor;

        ctx.beginPath();
        // Linea \
        ctx.moveTo(p.x - size, p.y - size);
        ctx.lineTo(p.x + size, p.y + size);
        // Linea /
        ctx.moveTo(p.x + size, p.y - size);
        ctx.lineTo(p.x - size, p.y + size);
        ctx.stroke();
        ctx.restore();

        // Etichetta crediti spostata più in basso per non coprire la X
        ctx.save();
        ctx.fillStyle = cpColor;
        ctx.font      = `bold ${Math.round(HEX_SIZE * 0.30)}px Courier New`;
        ctx.textAlign = 'center';
        ctx.shadowBlur = 0;
        ctx.fillText('+1', p.x, p.y + HEX_SIZE * 0.70);
        ctx.restore();
    });

    // 5. Entità (agenti e HQ)
    grid.forEach(cell => {
        if (!cell.entity) return;

        const p          = hexToPixel(cell.q, cell.r);
        const faction    = cell.entity.faction;
        const isSelected = selectedAgent === cell.entity;
        const color      = players[faction].color;

        ctx.save();
        if (cell.entity.type === 'agent') {
            const thickness = isSelected ? 5 : 2;
            if (isSelected) { ctx.shadowBlur = 15; ctx.shadowColor = color; }
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth   = thickness;
            const r = HEX_SIZE * 0.85;
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i + Math.PI / 6;
                const x = p.x + r * Math.cos(angle);
                const y = p.y + r * Math.sin(angle);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fill();
        } else if (cell.entity.type === 'hq') {
            ctx.beginPath();
            ctx.arc(p.x, p.y, HEX_SIZE * 0.8, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth   = 3;
            ctx.shadowBlur  = 10;
            ctx.shadowColor = color;
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fill();
        }
        ctx.restore();

        // Sprite dell'entità
        const img = customImages[cell.entity.customSpriteId];
        if (img?.complete && img.naturalWidth !== 0) {
            const mult    = cell.entity.type === 'hq' ? 1.5 : 1.2;
            const imgSize = HEX_SIZE * mult;
            ctx.drawImage(img, p.x - imgSize / 2, p.y - imgSize / 2, imgSize, imgSize);
        } else {
            const fontSize = cell.entity.type === 'hq'
                ? Math.round(HEX_SIZE * 0.75)
                : Math.round(HEX_SIZE * 0.5);
            ctx.font      = `${fontSize}px Arial`;
            ctx.textAlign = 'center';
            const yOff = cell.entity.type === 'hq' ? HEX_SIZE * 0.25 : HEX_SIZE * 0.17;
            ctx.fillText(cell.entity.sprite, p.x, p.y + yOff);
        }

        // HP sopra l'entità
        ctx.shadowBlur  = 0;
        ctx.fillStyle   = '#fff';
        ctx.font        = `bold ${Math.round(HEX_SIZE * 0.4)}px Courier New`;
        ctx.textAlign   = 'center';
        ctx.fillText(cell.entity.hp, p.x, p.y - HEX_SIZE * 0.62);
    });

    // 5b. HP ostacoli sovrapposti — disegnati dopo le entità così sono sempre visibili.
    //     Se c'è un agente spettro sulla casella, gli HP slittano in basso a destra.
    grid.forEach(cell => {
        if (!(cell.hp > 0 && cell.type !== 'empty')) return;
        const p      = hexToPixel(cell.q, cell.r);
        const xOff   = cell.entity ? HEX_SIZE * 0.38 : 0;
        const yOff   = cell.entity ? HEX_SIZE * 0.55 : HEX_SIZE * 0.62;
        ctx.fillStyle = '#fff';
        ctx.font      = `bold ${Math.round(HEX_SIZE * 0.45)}px Courier New`;
        ctx.textAlign = 'center';
        ctx.fillText(cell.hp, p.x + xOff, p.y + yOff);
    });

    // 5c. Icone terreno sovrapposte — disegnate per ultime così compaiono
    //     sopra gli agenti. Dimensione ridotta e posizionate in basso a destra
    //     quando c'è un'entità, per non coprire HP e sprite.
    grid.forEach(cell => {
        if (!cell.terrain || typeof TERRAINS === 'undefined') return;
        const p = hexToPixel(cell.q, cell.r);
        ctx.font        = `${Math.round(HEX_SIZE * 0.4)}px Arial`;
        ctx.textAlign   = 'center';
        // Con entità: sposta in basso a destra per non coprire HP (in alto) e sprite (centro)
        const xOff = cell.entity ? HEX_SIZE * 0.38 : 0;
        const yOff = cell.entity ? HEX_SIZE * 0.55 : HEX_SIZE * 0.15;
        ctx.fillText(TERRAINS[cell.terrain].icon, p.x + xOff, p.y + yOff);
        ctx.globalAlpha = 1.0;
    });
}

// --- PRIMITIVA HEX ---

function drawHex(q, r, stroke, fill, width = 1) {
    const p = hexToPixel(q, r);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i + Math.PI / 6;
        const x = p.x + HEX_SIZE * Math.cos(angle);
        const y = p.y + HEX_SIZE * Math.sin(angle);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (fill)   { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

// --- ANIMAZIONE LASER ---

function drawLaserBeam(attacker, victim) {
    const p1 = hexToPixel(attacker.q, attacker.r);
    const p2 = hexToPixel(victim.q,   victim.r);
    let opacity = 1.0;
    const STEPS    = 20;
    const INTERVAL = 400 / STEPS;   // durata totale 400 ms

    function renderFrame() {
        drawGame();
        ctx.save();
        ctx.globalAlpha = opacity;
        // Alone rosso esterno
        ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 8;
        ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        // Filo bianco centrale
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.shadowBlur = 6;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
        ctx.restore();
    }

    let step = 0;
    const fadeInterval = setInterval(() => {
        step++;
        opacity = 1.0 - step / STEPS;
        if (step >= STEPS) { clearInterval(fadeInterval); drawGame(); return; }
        renderFrame();
    }, INTERVAL);

    renderFrame();
}

// --- OVERLAY DISCONNESSIONE ---

function showDisconnectOverlay(title, message) {
    if (document.getElementById('disconnect-overlay')) return;
    if (turnTimerInterval) clearInterval(turnTimerInterval);

    const overlay = document.createElement('div');
    overlay.id = 'disconnect-overlay';
    overlay.style.cssText = `
        position:fixed; top:0; left:0; width:100%; height:100%;
        background:rgba(5,5,9,0.98); z-index:99999;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        font-family:'Courier New',monospace; text-align:center; padding:20px;
    `;
    overlay.innerHTML = `
        <h1 style="color:#ff3333;text-shadow:0 0 15px #ff3333;font-size:2.5em;margin-bottom:15px;text-transform:uppercase;">${title}</h1>
        <p style="color:#a0a0b0;font-size:1.2em;max-width:600px;margin-bottom:30px;line-height:1.5;">${message}</p>
        <button class="action-btn" onclick="location.reload()"
                style="padding:15px 40px;border:2px solid #ff3333;color:#ff3333;background:transparent;cursor:pointer;font-weight:bold;font-size:1.1em;">
            TORNA AL MENU
        </button>
    `;
    document.body.appendChild(overlay);
}

// --- OVERLAY DISCONNESSIONE ---

function showDisconnectOverlay(title, message) {
    // ... codice esistente, non toccare ...
}

// --- MESSAGGIO TEMPORANEO ---   ← aggiungi da qui in giù

function showTemporaryMessage(text, duration = 3000) {
    let el = document.getElementById('temp-message');
    if (!el) {
        el = document.createElement('div');
        el.id = 'temp-message';
        el.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(5,5,9,0.92);
            border: 1px solid #444;
            color: #fff;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 9999;
            text-align: center;
            pointer-events: none;
            transition: opacity 0.4s;
        `;
        document.body.appendChild(el);
    }

    el.innerText = text;
    el.style.opacity = '1';

    clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(() => {
        el.style.opacity = '0';
    }, duration);
}