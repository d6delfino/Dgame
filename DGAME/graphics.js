/* ============================================================
   graphics.js — Rendering canvas, camera e disegno della mappa
   ============================================================ */

function hexToPixel(q, r) {
    return {
        x: HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3)/2 * r) + (window.innerWidth / 2) + offsetX,
        y: HEX_SIZE * (3/2 * r) + (window.innerHeight / 2) + offsetY
    };
}

function pixelToHex(x, y) {
    x -= (window.innerWidth / 2) + offsetX; y -= (window.innerHeight / 2) + offsetY;
    return hexRound((Math.sqrt(3)/3 * x - 1/3 * y) / HEX_SIZE, (2/3 * y) / HEX_SIZE);
}

function hexRound(q, r) {
    let s = -q - r; let rq = Math.round(q); let rr = Math.round(r); let rs = Math.round(s);
    let qDiff = Math.abs(rq - q); let rDiff = Math.abs(rr - r); let sDiff = Math.abs(rs - s);
    if (qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
    else if (rDiff > sDiff) rr = -rq - rs;
    return { q: rq, r: rr };
}

function autoFitMap() {
    const width = window.innerWidth; 
    const height = window.innerHeight;

    // Se lo schermo è più largo di 1024px (tipico PC), aumentiamo la scala del 50% (1.5)
    const zoomBoost = (width > 1024) ? 1.5 : 1.0;

    // Calcolo base per far stare tutto a schermo
    let baseSize = Math.min(
        (width * 0.8) / (Math.sqrt(3) * (GRID_RADIUS * 2)), 
        (height * 0.6) / (1.5 * (GRID_RADIUS * 2))
    );

    // Applichiamo lo zoom e impostiamo un valore minimo per non avere esagoni microscopici
    HEX_SIZE = Math.max(25, baseSize * zoomBoost);

    offsetX = 0; offsetY = 0; 
    drawGame();
}

function clampCamera() {
    const currentMapWidth = (GRID_RADIUS * 2) * (HEX_SIZE * Math.sqrt(3));
    const currentMapHeight = (GRID_RADIUS * 2) * (HEX_SIZE * 1.5);
    const margin = 300;
    const limitX = Math.max(0, (currentMapWidth - window.innerWidth) / 2) + margin;
    const limitY = Math.max(0, (currentMapHeight - window.innerHeight) / 2) + margin;
    offsetX = Math.max(-limitX, Math.min(limitX, offsetX));
    offsetY = Math.max(-limitY, Math.min(limitY, offsetY));
}

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1; const width = window.innerWidth; const height = window.innerHeight;
    canvas.width = width * dpr; canvas.height = height * dpr;
    ctx.scale(dpr, dpr); canvas.style.width = width + 'px'; canvas.style.height = height + 'px';
    if (width < 600) autoFitMap();
    if (state === 'PLAYING') drawGame();
}

function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // RIMOSSO: ctx.fillStyle = "#000000"; (Inutile, sovrascritto subito dopo)

    // 1. Disegno Sfondo (Immagine o Colore Tinta Unita)
    if (mapBackground.complete && mapBackground.naturalWidth > 0) {
        let bgScale = HEX_SIZE / 20; 
        let bgW = mapBackground.width * bgScale; 
        let bgH = mapBackground.height * bgScale;
        let bgX = (window.innerWidth / 2) + offsetX - (bgW / 2); 
        let bgY = (window.innerHeight / 2) + offsetY - (bgH / 2);
        ctx.drawImage(mapBackground, bgX, bgY, bgW, bgH);
    } else { 
        ctx.fillStyle = COLORS.bg; 
        // CORREZIONE: Usiamo window.innerWidth/Height per coprire lo schermo CSS logico
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight); 
    }

    // 2. CORREZIONE: IL VELO NERO SEMI-TRASPARENTE
    // Usiamo window.innerWidth/Height per assicurarci che copra ESATTAMENTE la viewport CSS
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; 
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    // 3. Disegno Griglia e Ostacoli
    grid.forEach(cell => {
        let fill = null;
        if (cell.type === 'wall') fill = '#777'; 
        else if (cell.type === 'barricade') fill = '#bbb';
        
        drawHex(cell.q, cell.r, "rgba(110, 110, 110, 0.3)", fill, 1);

        if (cell.type === 'wall' || cell.type === 'barricade') {
            let p = hexToPixel(cell.q, cell.r);
            if (cell.customSpriteId && customImages[cell.customSpriteId] && customImages[cell.customSpriteId].complete) {
                let imgSize = HEX_SIZE * 1.9; 
                ctx.drawImage(customImages[cell.customSpriteId], p.x - imgSize/2, p.y - imgSize/2, imgSize, imgSize);
            } else {
                // Testo proporzionale per icone/emoji dei muri
                ctx.font = `${Math.round(HEX_SIZE * 0.5)}px Arial`; 
                ctx.textAlign = "center"; 
                ctx.fillText(cell.sprite, p.x, p.y + (HEX_SIZE * 0.17));
            }
        }

        if(cell.hp > 0 && cell.type !== 'empty') {
            ctx.fillStyle = "#fff"; 
            // Testo proporzionale per HP dei muri
            ctx.font = `${Math.round(HEX_SIZE * 0.45)}px Arial`; 
            let p = hexToPixel(cell.q, cell.r); 
            ctx.textAlign = "center"; 
            ctx.fillText(cell.hp, p.x, p.y + (HEX_SIZE * 0.62));
        }
    });

    // 4. Disegno Target Azioni Valide
    validActionTargets.forEach(t => {
        let stroke = COLORS.atkNeon; 
        let fill = COLORS.atkFill;
        if (currentActionMode === 'move') { 
            stroke = COLORS.moveNeon; 
            fill = COLORS.moveFill; 
        } else if (currentActionMode === 'build') { 
            stroke = COLORS.buildNeon; 
            fill = COLORS.buildFill; 
        }
        drawHex(t.q, t.r, stroke, fill);
    });

    // 5. Disegno Entità (Agenti e HQ)
    grid.forEach(cell => {
        if (cell.entity) {
            let p = hexToPixel(cell.q, cell.r); 
            let faction = cell.entity.faction;
            let isSelected = (selectedAgent === cell.entity); 
            let color = players[faction].color;
            
            ctx.save();
            if (cell.entity.type === 'agent') {
                let borderThickness = isSelected ? 5 : 2;
                if (isSelected) { ctx.shadowBlur = 15; ctx.shadowColor = color; }
                ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = borderThickness;
                let agentHexRadius = HEX_SIZE * 0.85;
                for (let i = 0; i < 6; i++) {
                    let angle = (Math.PI / 3) * i + (Math.PI / 6);
                    let x = p.x + agentHexRadius * Math.cos(angle); 
                    let y = p.y + agentHexRadius * Math.sin(angle);
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath(); ctx.stroke(); ctx.fillStyle = "rgba(0, 0, 0, 0.4)"; ctx.fill();
            } else if (cell.entity.type === 'hq') {
                ctx.beginPath(); ctx.arc(p.x, p.y, HEX_SIZE * 0.8, 0, Math.PI * 2);
                ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.shadowBlur = 10; ctx.shadowColor = color;
                ctx.stroke(); ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; ctx.fill();
            }
            ctx.restore();

            let spriteId = cell.entity.customSpriteId; 
            let img = customImages[spriteId];
            if (img && img.complete && img.naturalWidth !== 0) {
                let sizeMultiplier = (cell.entity.type === 'hq') ? 1.5 : 1.2; 
                let imgSize = HEX_SIZE * sizeMultiplier;
                ctx.drawImage(img, p.x - imgSize/2, p.y - imgSize/2, imgSize, imgSize);
            } else {
                // Testo proporzionale per sprite testuali (HQ e Agenti)
                let fontSize = (cell.entity.type === 'hq') ? Math.round(HEX_SIZE * 0.75) : Math.round(HEX_SIZE * 0.5);
                ctx.font = `${fontSize}px Arial`; 
                ctx.textAlign = "center";
                ctx.fillText(cell.entity.sprite, p.x, p.y + (cell.entity.type === 'hq' ? HEX_SIZE * 0.25 : HEX_SIZE * 0.17));
            }

            ctx.shadowBlur = 0; 
            ctx.fillStyle = "#fff"; 
            // Testo proporzionale per HP degli agenti/basi
            ctx.font = `bold ${Math.round(HEX_SIZE * 0.4)}px Courier New`; 
            ctx.textAlign = "center";
            ctx.fillText(cell.entity.hp, p.x, p.y - (HEX_SIZE * 0.62));
        }
    });
}

function drawHex(q, r, stroke, fill, width = 1) {
    let p = hexToPixel(q, r); ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        let angle = (Math.PI / 3) * i + (Math.PI / 6);
        let x = p.x + HEX_SIZE * Math.cos(angle); let y = p.y + HEX_SIZE * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}

function drawLaserBeam(attacker, victim) {
    let p1 = hexToPixel(attacker.q, attacker.r), p2 = hexToPixel(victim.q, victim.r);
    let opacity = 1.0;
    const DURATION = 400;
    const STEPS = 20;
    const INTERVAL = DURATION / STEPS;

    function renderFrame() {
        drawGame();
        ctx.save();
        ctx.globalAlpha = opacity;
        // Alone rosso esterno
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 8;
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        // Linea bianca centrale brillante
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.restore();
    }

    let step = 0;
    const fadeInterval = setInterval(() => {
        step++;
        opacity = 1.0 - (step / STEPS);
        if (step >= STEPS) {
            clearInterval(fadeInterval);
            drawGame();
            return;
        }
        renderFrame();
    }, INTERVAL);

    renderFrame();
}

function showDisconnectOverlay(title, message) {
    if (document.getElementById('disconnect-overlay')) return;
    if (typeof turnTimerInterval !== 'undefined') clearInterval(turnTimerInterval);

    const overlay = document.createElement('div');
    overlay.id = 'disconnect-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(5, 5, 9, 0.98); z-index: 99999;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        font-family: 'Courier New', monospace; text-align: center; padding: 20px;
    `;
    overlay.innerHTML = `
        <h1 style="color: #ff3333; text-shadow: 0 0 15px #ff3333; font-size: 2.5em; margin-bottom: 15px; text-transform: uppercase;">${title}</h1>
        <p style="color: #a0a0b0; font-size: 1.2em; max-width: 600px; margin-bottom: 30px; line-height: 1.5;">${message}</p>
        <button class="action-btn" onclick="location.reload()" 
                style="padding: 15px 40px; border: 2px solid #ff3333; color: #ff3333; background: transparent; cursor: pointer; font-weight: bold; font-size: 1.1em; transition: all 0.3s;">
            TORNA AL MENU
        </button>
    `;
    document.body.appendChild(overlay);
}
