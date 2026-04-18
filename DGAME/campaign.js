/* ============================================================
   campaign.js — MODALITÀ CAMPAGNA GLOBALE
   ============================================================
   Completamente autonomo: aggancia i file esistenti via hook
   su window.* senza modificarli.

   FLUSSO:
     startCampaign(numPlayers)
       → renderCampaignMap()                 (fase PLANNING)
         → handleSectorClick()               (ogni giocatore sceglie)
         → finishPlayerTurn()                (passa al prossimo)
       → processConflicts()                  (fase RESOLVING)
         → settore libero → ownership diretta
         → settore conteso → battleQueue
       → runNextBattle()
         → startCampaignBattle(factions, sectorId)
           → setup normale → partita normale
         → [hook showGameOverlay] cattura vincitore
           → showBattleResults()             (riepilogo crediti)
           → runNextBattle() / startNextPlanningRound()
       → checkCampaignWin()                  → vittoria finale
   ============================================================ */

// ============================================================
// STATO CAMPAGNA
// ============================================================
let campaignState = {
    isActive:    false,
    numPlayers:  4,           // quanti umani giocano (2-4)
    currentPlayer: 1,
    credits:     {},          // credits[p] = crediti correnti
    victoryThreshold: 13,     // >50% di 25 settori
    phase:       'PLANNING',
    pendingMoves: {},         // pendingMoves[p] = sectorId scelto
    battleQueue:  [],
    currentBattleParticipants: [],
    targetSector: null,

    // ── 35 settori — distribuzione organica sull'intera mappa ──
    // Zone angolari allargate e distanziate per evitare sovrapposizioni.
    sectors: (() => {
        const raw = [
            // ── Zona NW — P1 Verde ──
            [0,   8, 10],   // HQ P1
            [1,  26,  6],   // nord
            [2,   6, 28],   // ovest
            [3,  24, 24],   // avanzato diag
            [4,  15, 39],   // avamposto S (spostato a destra e in alto)
            [5,  28, 40],   // verso centro

            // ── Zona NE — P4 Oro ──
            [6,  92, 10],   // HQ P4
            [7,  74,  6],   // nord
            [8,  94, 28],   // est
            [9,  76, 24],   // avanzato diag
            [10, 85, 39],   // avamposto S (spostato a sinistra e in alto)
            [11, 72, 40],   // verso centro

            // ── Zona SW — P2 Viola ──
            [12,  8, 90],   // HQ P2
            [13, 26, 94],   // sud
            [14,  6, 72],   // ovest
            [15, 24, 76],   // avanzato diag
            [16, 15, 61],   // avamposto N (spostato a destra e in basso)
            [17, 28, 60],   // verso centro

            // ── Zona SE — P3 Blu ──
            [18, 92, 90],   // HQ P3
            [19, 74, 94],   // sud
            [20, 94, 72],   // est
            [21, 76, 76],   // avanzato diag
            [22, 85, 61],   // avamposto N (spostato a sinistra e in basso)
            [23, 72, 60],   // verso centro

            // ── Fascia centrale ──
            [24, 42, 16],   // nodo NO centrale
            [25, 58, 16],   // nodo NE centrale
            [26, 38, 32],   // fianco NW
            [27, 62, 32],   // fianco NE
            [28, 50, 26],   // nodo nord
            [29, 50, 50],   // CENTRO
            [30, 38, 68],   // fianco SW
            [31, 62, 68],   // fianco SE
            [32, 50, 74],   // nodo sud
            [33, 42, 84],   // nodo SO centrale
            [34, 58, 84],   // nodo SE centrale
        ];
        return raw.map(([id, x, y]) => ({ id, owner: 0, x, y, blocked: false }));
    })(),

    // ── Adiacenze — rete fitta con molti ponti inter-zona ──
    adj: (() => {
        const a = {};
        for (let i = 0; i < 35; i++) a[i] = [];
        const add = (i, j) => {
            if (!a[i].includes(j)) a[i].push(j);
            if (!a[j].includes(i)) a[j].push(i);
        };

        // ── Zona NW interna ──
        add(0,1); add(0,2); add(1,2); add(1,3);
        add(2,3); add(2,4); add(3,4); add(3,5); add(4,5);

        // ── Zona NE interna ──
        add(6,7); add(6,8); add(7,8); add(7,9);
        add(8,9); add(8,10); add(9,10); add(9,11); add(10,11);

        // ── Zona SW interna ──
        add(12,13); add(12,14); add(13,14); add(13,15);
        add(14,15); add(14,16); add(15,16); add(15,17); add(16,17);

        // ── Zona SE interna ──
        add(18,19); add(18,20); add(19,20); add(19,21);
        add(20,21); add(20,22); add(21,22); add(21,23); add(22,23);

        // ── Centro interno ──
        add(24,25); add(24,28); add(25,28);
        add(26,28); add(27,28); add(26,29); add(27,29);
        add(28,29); add(29,30); add(29,31); add(29,32);
        add(30,32); add(31,32); add(30,29);
        add(32,33); add(32,34); add(33,34);
        add(24,26); add(25,27); add(30,33); add(31,34);

        // ── Uscite NW → centro (più uscite = meno collo di bottiglia) ──
        add(3,24);  // NW avanzato → nodo NO centrale
        add(5,26);  // NW verso centro → fianco NW
        add(5,28);  // NW → nodo nord
        add(1,24);  // NW nord → nodo NO centrale

        // ── Uscite NE → centro ──
        add(9,25);  // NE avanzato → nodo NE centrale
        add(11,27); // NE verso centro → fianco NE
        add(11,28); // NE → nodo nord
        add(7,25);  // NE nord → nodo NE centrale

        // ── Uscite SW → centro ──
        add(15,33); // SW avanzato → nodo SO centrale
        add(17,30); // SW verso centro → fianco SW
        add(17,32); // SW → nodo sud
        add(13,33); // SW sud → nodo SO centrale

        // ── Uscite SE → centro ──
        add(21,34); // SE avanzato → nodo SE centrale
        add(23,31); // SE verso centro → fianco SE
        add(23,32); // SE → nodo sud
        add(19,34); // SE sud → nodo SE centrale

        // ── Ponti inter-zona (strade trasversali che tagliano la mappa) ──
        add(1,7);   // Autostrada Nord: NW ↔ NE
        add(3,9);   // Secondaria nord: NW avanzato ↔ NE avanzato
        add(5,11);  // Trasversale nord-centro: NW ↔ NE
        add(13,19); // Autostrada Sud: SW ↔ SE
        add(15,21); // Secondaria sud: SW avanzato ↔ SE avanzato
        add(17,23); // Trasversale sud-centro: SW ↔ SE
        add(4,16);  // Asse Ovest: NW ↔ SW
        add(2,14);  // Costiera Ovest: NW bordo ↔ SW bordo
        add(10,22); // Asse Est: NE ↔ SE
        add(8,20);  // Costiera Est: NE bordo ↔ SE bordo

        // ── Diagonali lunghe (corsie strategiche cross-map) ──
        add(5,17);  // NW centro → SW centro (diagonale O)
        add(11,23); // NE centro → SE centro (diagonale E)
        add(26,30); // Fianco NW ↔ fianco SW (asse centrale ovest)
        add(27,31); // Fianco NE ↔ fianco SE (asse centrale est)

        return a;
    })()
};

// Posizioni HQ — IDs fissi negli angoli della mappa organica (vedi sectors[])
// P1=Verde(NW,0)  P2=Viola(SW,12)  P3=Blu(SE,18)  P4=Oro(NE,6)
const CAMPAIGN_HQ_POSITIONS = {
    2: [0, 12],
    3: [0, 12, 18],
    4: [0, 12, 18, 6]
};

// ============================================================
// AVVIO CAMPAGNA
// ============================================================
function startCampaign(numPlayers) {
    numPlayers = numPlayers || 4;
    document.getElementById('network-menu').style.display = 'none';

    campaignState.isActive     = true;
    campaignState.numPlayers   = numPlayers;
    campaignState.currentPlayer = 1;
    campaignState.phase        = 'PLANNING';
    campaignState.turnCount    = 1;
    campaignState.pendingMoves = {};
    campaignState.battleQueue  = [];
    campaignState.victoryThreshold = Math.floor(35 / 2) + 1; // 18

    // Crediti iniziali
    campaignState.credits = {};
    for (let p = 1; p <= numPlayers; p++) campaignState.credits[p] = 10;

    // Reset settori
    campaignState.sectors.forEach(s => { s.owner = 0; s.blocked = false; });
    const hqSlots = CAMPAIGN_HQ_POSITIONS[numPlayers] || CAMPAIGN_HQ_POSITIONS[4];
    hqSlots.forEach((sid, idx) => { campaignState.sectors[sid].owner = idx + 1; });

    // ── Genera 4 settori bloccati casuali ──────────────────────────
    _generateBlockedSectors(hqSlots);

    renderCampaignMap();
}

// ============================================================
// SETTORI BLOCCATI — 1 per quadrante
// ============================================================
function _generateBlockedSectors(hqSlots) {
    const hqSet = new Set(hqSlots);

    // Un settore bloccato per quadrante
    const quadrants = [
        [1, 2, 3, 4, 5, 24, 26],       // NW
        [7, 8, 9, 10, 11, 25, 27],     // NE
        [13, 14, 15, 16, 17, 30, 33],  // SW
        [19, 20, 21, 22, 23, 31, 34]   // SE
    ];

    const chosen = [];

    for (let q = 0; q < quadrants.length; q++) {
        const quad = quadrants[q];
        // Escludiamo l'HQ per sicurezza
        const candidates = quad.filter(id => !hqSet.has(id));

        // Fisher-Yates shuffle standard per compatibilità
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = candidates[i];
            candidates[i] = candidates[j];
            candidates[j] = temp;
        }

        // Troviamo il primo settore del quadrante che non rompe la connettività
        for (let i = 0; i < candidates.length; i++) {
            const cid = candidates[i];
            chosen.push(cid);
            if (_mapIsConnected(hqSlots, new Set(chosen))) {
                break; // Manteniamo questo settore e passiamo al prossimo quadrante
            } else {
                chosen.pop(); // Spezza la mappa, proviamo un altro del quadrante
            }
        }
    }

    chosen.forEach(id => { campaignState.sectors[id].blocked = true; });
}

// BFS per verificare che tutti gli HQ siano ancora raggiungibili tra loro
function _mapIsConnected(hqSlots, blockedSet) {
    if (hqSlots.length < 2) return true;
    const start = hqSlots[0];
    const visited = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
        const curr = queue.shift();
        (campaignState.adj[curr] || []).forEach(nb => {
            if (!visited.has(nb) && !blockedSet.has(nb)) {
                visited.add(nb);
                queue.push(nb);
            }
        });
    }
    return hqSlots.every(hid => visited.has(hid));
}


function renderCampaignMap() {
    const overlay = document.getElementById('campaign-overlay');
    overlay.style.display = 'block';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundImage = "url('img/sfondocamp.png')";
    overlay.style.backgroundSize  = 'cover';
    overlay.style.backgroundPosition = 'center';
    overlay.style.overflow = 'hidden';

    const n     = campaignState.numPlayers;
    const currP = campaignState.currentPlayer;
    const pColor = COLORS['p' + currP];

    // Conta settori per giocatore
    const owned = {};
    for (let p = 1; p <= n; p++) owned[p] = 0;
    campaignState.sectors.forEach(s => { if (s.owner > 0 && s.owner <= n) owned[s.owner]++; });

    // Barra crediti tutti i giocatori
    let creditsBar = '';
    for (let p = 1; p <= n; p++) {
        const c = COLORS['p' + p];
        creditsBar += `<span style="color:${c}; margin:0 10px;">
            ${players[p]?.name || 'P' + p}
            💰${campaignState.credits[p]}
            🏴${owned[p]}/${campaignState.victoryThreshold}
        </span>`;
    }

    const phaseLabel = campaignState.phase === 'PLANNING'
        ? `ORDINI: <span style="color:${pColor}">${players[currP]?.name?.toUpperCase() || 'P' + currP}</span>`
        : 'RISOLUZIONE BATTAGLIE...';

    overlay.innerHTML = `
        <div style="position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(30, 30, 30, 0.4);z-index:0;pointer-events:none;"></div>

        <!-- HUD in cima (Raddoppiato) -->
        <div style="position:absolute;top:0;left:0;width:100%;z-index:10;pointer-events:none;
                    display:flex;flex-direction:column;align-items:center;padding-top:15px;gap:10px;">
            <h1 style="color:#fff;text-shadow:0 0 15px #fff;margin:0;font-family:Courier New;
                        font-size:clamp(1.5em,3.5vw,2.5em);letter-spacing:3px;display:flex;align-items:center;gap:18px;">
                SYNDICATE: GLOBAL WAR
                <span style="font-size:0.55em;color:#aaa;letter-spacing:2px;font-weight:normal;opacity:0.85;">TURNO&nbsp;${campaignState.turnCount || 1}</span>
            </h1>
            <div style="background:rgba(0,0,0,0.85);padding:12px 30px;border-radius:12px;
                        text-align:center;font-family:Courier New;font-size:clamp(16px,2.5vw,22px);
                        border:2px solid rgba(255,255,255,0.2);">
                ${creditsBar}
            </div>
            <div style="color:#aaa;font-family:Courier New;font-size:clamp(16px,2.5vw,24px);font-weight:bold;">
                FASE: ${phaseLabel}
            </div>
        </div>

        <!-- WRAPPER SCALATO: Rimpicciolisce la mappa e la sposta in basso per fare spazio all'HUD -->
        <div id="map-scaling-wrapper" style="position:absolute; top:16%; left:0; width:100%; height:84%; transform: scale(0.86); transform-origin: center top;">
            <!-- SVG links -->
            <svg id="map-links" style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;"></svg>

            <!-- Settori -->
            <div id="map-sectors" style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:2;"></div>
        </div>

        <!-- Bottoni azione in basso -->
        <div id="campaign-actions" style="position:absolute;bottom:18px;left:0;width:100%;z-index:10;
                    display:flex;gap:15px;flex-wrap:wrap;justify-content:center;"></div>
    `;

    // ── Linee di connessione ──────────────────────────────────────
    const svgLinks = document.getElementById('map-links');
    let lines = '';

    for (let id in campaignState.adj) {
        const s1 = campaignState.sectors[id];
        if (s1.blocked) continue;
        campaignState.adj[id].forEach(tid => {
            if (id >= tid) return;
            const s2 = campaignState.sectors[tid];
            if (s2.blocked) return;

            // Stile unico per tutti i collegamenti: linea bianca/grigia continua
            const stroke  = 'rgba(255,255,255,0.4)'; 
            const strokeW = 2.5;
            const dash    = ''; // Stringa vuota = linea continua
            const glow    = '';

            lines += `<line x1="${s1.x}%" y1="${s1.y}%" x2="${s2.x}%" y2="${s2.y}%"
                stroke="${stroke}" stroke-width="${strokeW}" ${dash} style="${glow}"/>`;
        });
    }
    svgLinks.innerHTML = lines;

    // ── Settori come esagoni ──────────────────────────────────────
    // Genera i punti di un esagono flat-top centrato in (0,0) con raggio r (px)
    function hexPoints(r) {
        const pts = [];
        for (let i = 0; i < 6; i++) {
            const angle = Math.PI / 180 * (60 * i - 30); // pointy-top
            pts.push(`${r * Math.cos(angle)},${r * Math.sin(angle)}`);
        }
        return pts.join(' ');
    }

    const sectorsDiv = document.getElementById('map-sectors');
    const hqSet = new Set((CAMPAIGN_HQ_POSITIONS[campaignState.numPlayers] || []));

    campaignState.sectors.forEach(s => {
        // ── Settore BLOCCATO — trasparente all'interno, croce rossa ────────────────────
        if (s.blocked) {
            const r = 80;
            const svgSize = (r + 6) * 2;
            const cx = svgSize / 2, cy = svgSize / 2;
            const pts = hexPoints(r);

            const wrap = document.createElement('div');
            wrap.style.cssText = `position:absolute;left:${s.x}%;top:${s.y}%;
                transform:translate(-50%,-50%);cursor:not-allowed;`;
            wrap.innerHTML = `
                <svg width="${svgSize}" height="${svgSize}" style="overflow:visible;display:block;">
                    <polygon points="${pts.replace(/(\S+),(\S+)/g,
                        (_, px, py) => `${+px+cx},${+py+cy}`)}"
                        fill="transparent"
                        stroke="rgba(120,40,40,0.85)" stroke-width="3"/>
                    <line x1="${cx - r*0.5}" y1="${cy - r*0.5}" x2="${cx + r*0.5}" y2="${cy + r*0.5}"
                        stroke="rgba(180,40,40,0.90)" stroke-width="8" stroke-linecap="round"/>
                    <line x1="${cx + r*0.5}" y1="${cy - r*0.5}" x2="${cx - r*0.5}" y2="${cy + r*0.5}"
                        stroke="rgba(180,40,40,0.90)" stroke-width="8" stroke-linecap="round"/>
                    <text x="${cx}" y="${cy + r*0.68}" text-anchor="middle"
                        font-family="Courier New" font-size="15" font-weight="bold"
                        fill="rgba(200,60,60,0.95)">ZONA ESCLUSA</text>
                </svg>`;
            sectorsDiv.appendChild(wrap);
            return;
        }

        const targeters = Object.keys(campaignState.pendingMoves)
            .filter(k => campaignState.pendingMoves[k] === s.id).map(Number);
        const isHQ = hqSet.has(s.id);
        const r = 80;  // HQ e normali hanno lo stesso raggio

        // Colore di riempimento
        let fillColor, strokeColor, strokeW;
        if (s.owner > 0) {
            fillColor   = 'rgba(10,15,30,0.25)';
            strokeColor = COLORS['p' + s.owner];
            strokeW     = 4;
        } else {
            fillColor   = 'rgba(10,15,30,0.25)';
            strokeColor = 'rgba(180,200,255,0.70)';
            strokeW     = 3; // L'esagono neutrale ora ha il bordo continuo come richiesto
        }
        if (targeters.length > 0) {
            strokeColor = s.owner > 0 ? COLORS['p' + s.owner] : '#ffffff';
            strokeW     = 4;
        }

        // Testo
        let labelLines = [];
        if (isHQ && s.owner > 0) {
            const pName = players[s.owner]?.name || 'P' + s.owner;
            labelLines = [`HQ ${pName.toUpperCase()}`]; 
        } else {
            // Settori normali (conquistati o neutrali) mostrano solo l'ID
            labelLines = [String(s.id)];
        }

        const animStyle = targeters.length > 0 ? 'animation:campPulse 0.9s infinite alternate;' : '';

        const svgSize = (r + 6) * 2;
        const cx = svgSize / 2, cy = svgSize / 2;
        const pts = hexPoints(r);

        const fontSize  = 18;
        const lineH     = fontSize + 4;
        const textOffsetY = targeters.length > 0 ? r * 0.25 : 0;
        const textYBase = cy + textOffsetY - (labelLines.length - 1) * lineH / 2;
        const textSvg   = labelLines.map((line, i) =>
            `<text x="${cx}" y="${textYBase + i * lineH}" text-anchor="middle"
             dominant-baseline="middle"
             font-family="Courier New" font-size="${fontSize}" font-weight="bold"
             fill="${s.owner > 0 ? '#fff' : '#cce'}">${line}</text>`
        ).join('');

        let intentDots = '';
        if (targeters.length > 0) {
            const dotW = 40, dotH = 16, dotGap = 8;
            const totalDotsW = targeters.length * dotW + (targeters.length - 1) * dotGap;
            targeters.forEach((pid, i) => {
                const c = COLORS['p' + pid];
                const dx = cx - totalDotsW / 2 + i * (dotW + dotGap);
                const dy = cy - r * 0.32 - dotH / 2;
                intentDots += `<rect x="${dx}" y="${dy}" width="${dotW}" height="${dotH}" rx="5"
                    fill="${c}" style="filter:drop-shadow(0 0 6px ${c})"/>`;
            });
        }

        const wrap = document.createElement('div');
        wrap.style.cssText = `position:absolute;left:${s.x}%;top:${s.y}%;
            transform:translate(-50%,-50%);cursor:pointer;${animStyle}`;

        wrap.innerHTML = `
            <svg width="${svgSize}" height="${svgSize}"
                 style="overflow:visible;display:block;">
                <polygon points="${pts.replace(/(\S+),(\S+)/g,
                    (_, px, py) => `${+px+cx},${+py+cy}`)}"
                    fill="${fillColor}" fill-opacity="${s.owner > 0 ? 0.82 : 0.7}"
                    stroke="${strokeColor}" stroke-width="${strokeW}"
                    style="filter:drop-shadow(0 2px 10px ${s.owner > 0 ? COLORS['p' + s.owner] : '#000'});"/>
                ${textSvg}
                ${intentDots}
            </svg>`;

        wrap.onclick = () => handleSectorClick(s.id);
        sectorsDiv.appendChild(wrap);
    });

    // ── Bottoni azione / skip ─────────────────────────────────────
    const actionsDiv = document.getElementById('campaign-actions');
    if (campaignState.phase === 'PLANNING') {
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'action-btn';
        confirmBtn.style.cssText = `border-color:${pColor};color:${pColor};background:rgba(0,0,0,0.85);`;
        confirmBtn.innerText = `CONFERMA ORDINE ${players[currP]?.name?.toUpperCase() || 'P'+currP}`;
        confirmBtn.disabled = campaignState.pendingMoves[currP] === undefined;
        confirmBtn.onclick = finishPlayerTurn;
        actionsDiv.appendChild(confirmBtn);

        const skipBtn = document.createElement('button');
        skipBtn.className = 'action-btn';
        skipBtn.style.cssText = `border-color:#555;color:#888;background:rgba(0,0,0,0.6);font-size:12px;padding:8px 16px;`;
        skipBtn.innerText = 'PASSA (nessun ordine)';
        skipBtn.onclick = skipPlayerTurn;
        actionsDiv.appendChild(skipBtn);
    }

    // Keyframe animazione (iniettato una volta sola)
    if (!document.getElementById('campaign-anim')) {
        const style = document.createElement('style');
        style.id = 'campaign-anim';
        style.innerHTML = `@keyframes campPulse { from { opacity:0.55; } to { opacity:1; } }`;
        document.head.appendChild(style);
    }

    // --- AGGIUNTA TASTO INFO ---
    const infoBtn = document.createElement('button');
    infoBtn.innerText = "ⓘ INFO";
    infoBtn.style.cssText = `
        position: fixed; top: 15px; left: 15px; z-index: 1000;
        background: rgba(0,0,0,0.7); color: #00ff88; border: 1px solid #00ff88;
        padding: 8px 15px; cursor: pointer; font-family: 'Courier New', monospace;
        font-weight: bold; border-radius: 5px; box-shadow: 0 0 10px rgba(0,255,136,0.3);
    `;
    infoBtn.onclick = showCampaignInfoModal;
    overlay.appendChild(infoBtn);

}

// ============================================================
// GESTIONE CLICK SETTORE
// ============================================================
function handleSectorClick(targetId) {
    if (campaignState.phase !== 'PLANNING') return;
    const p = campaignState.currentPlayer;
    const target = campaignState.sectors[targetId];

    // Settore bloccato — inagibile
    if (target.blocked) {
        showTemporaryMessage('Settore inagibile — zona di esclusione!');
        return;
    }

    // Non puoi attaccare un settore che già controlli
    if (target.owner === p) {
        showTemporaryMessage('Controlli già questo settore!');
        return;
    }

    // Deve essere adiacente a un settore che controlli (ignorando i bloccati)
    const reachable = campaignState.adj[targetId].some(id => {
        const nb = campaignState.sectors[id];
        return !nb.blocked && nb.owner === p;
    });
    if (!reachable) {
        showTemporaryMessage('Settore non raggiungibile! Devi avanzare da un settore adiacente.');
        playSFX('click');
        return;
    }

    playSFX('click');
    campaignState.pendingMoves[p] = targetId;
    renderCampaignMap();
}

// ============================================================
// GESTIONE TURNI PLANNING
// ============================================================
function finishPlayerTurn() {
    const n = campaignState.numPlayers;
    // Vai al prossimo giocatore attivo
    let next = campaignState.currentPlayer + 1;
    while (next <= n) {
        // Salta giocatori eliminati (0 settori E non hanno HQ di partenza)
        if (_isPlayerEliminated(next)) { next++; continue; }
        break;
    }
    if (next > n) {
        processConflicts();
    } else {
        campaignState.currentPlayer = next;
        renderCampaignMap();
    }
}

function skipPlayerTurn() {
    // Rimuove eventuale ordine già dato e passa
    delete campaignState.pendingMoves[campaignState.currentPlayer];
    finishPlayerTurn();
}

function _isPlayerEliminated(p) {
    const hasSectors = campaignState.sectors.some(s => s.owner === p);
    return !hasSectors;
}

// ============================================================
// RISOLUZIONE CONFLITTI
// ============================================================
function processConflicts() {
    campaignState.phase = 'RESOLVING';
    campaignState.battleQueue = [];
    const moves = campaignState.pendingMoves;

    campaignState.sectors.forEach(sector => {
        // Chi punta a questo settore?
        const attackers = Object.keys(moves)
            .filter(pid => moves[pid] === sector.id).map(Number);
        if (attackers.length === 0) return;

        // Raccoglie tutti i partecipanti: attaccanti + difensore (se esiste)
        const participants = new Set(attackers);
        if (sector.owner > 0 && !participants.has(sector.owner)) {
            participants.add(sector.owner); // il difensore combatte automaticamente
        }

        if (participants.size > 1) {
            // Battaglia!
            campaignState.battleQueue.push({
                sectorId: sector.id,
                factions: Array.from(participants)
            });
        } else {
            // Conquista pacifica (settore neutro, un solo attaccante)
            sector.owner = Array.from(participants)[0];
        }
    });

    // Mostra un riepilogo degli ordini prima di iniziare le battaglie
    _showConflictSummary();
}

function _showConflictSummary() {
    const n = campaignState.numPlayers;
    const moves = campaignState.pendingMoves;
    const battles = campaignState.battleQueue;

    let html = '<div style="font-family:Courier New;color:#fff;padding:50px 60px;max-width:900px;min-width:640px;text-align:left;">';
    html += '<h2 style="color:#fff;text-align:center;margin-top:0;font-size:2em;letter-spacing:2px;margin-bottom:30px;">RIEPILOGO ORDINI</h2>';

    // Conquiste pacifiche
    const peaceful = [];
    for (let p = 1; p <= n; p++) {
        const sid = moves[p];
        if (sid === undefined) continue;
        const isBattle = battles.some(b => b.sectorId === sid && b.factions.includes(p));
        if (!isBattle) {
            peaceful.push({ p, sid });
        }
    }
    if (peaceful.length > 0) {
        html += '<p style="color:#aaa;font-size:18px;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px;">Conquiste Pacifiche:</p>';
        peaceful.forEach(({ p, sid }) => {
            const c = COLORS['p' + p];
            html += `<div style="color:${c};font-size:20px;margin-bottom:8px;padding:6px 0;border-left:4px solid ${c};padding-left:14px;">
                → ${players[p]?.name || 'P'+p} conquista il Settore ${sid}
            </div>`;
        });
    }

    // Battaglie
    if (battles.length > 0) {
        html += '<p style="color:#ff4444;font-size:18px;margin-top:20px;margin-bottom:10px;text-transform:uppercase;letter-spacing:1px;">⚔️ Battaglie:</p>';
        battles.forEach(b => {
            const names = b.factions.map(pid => {
                const c = COLORS['p' + pid];
                return `<span style="color:${c};font-weight:bold;">${players[pid]?.name || 'P'+pid}</span>`;
            }).join(' <span style="color:#888">vs</span> ');
            html += `<div style="font-size:20px;margin-bottom:8px;padding:6px 0;border-left:4px solid #ff4444;padding-left:14px;">Settore ${b.sectorId}: ${names}</div>`;
        });
    }

    if (peaceful.length === 0 && battles.length === 0) {
        html += '<p style="color:#888;text-align:center;font-size:18px;">Nessun movimento questo turno.</p>';
    }

    html += `<button class="action-btn" style="width:100%;margin-top:30px;border-color:#00ff88;color:#00ff88;font-size:22px;padding:18px 0;"
        onclick="this.closest('.campaign-summary-overlay').remove(); runNextBattle();">
        AVANTI ▶
    </button></div>`;

    const overlay = document.createElement('div');
    overlay.className = 'campaign-summary-overlay';
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;`;
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
}

// ============================================================
// CODA BATTAGLIE
// ============================================================
function runNextBattle() {
    if (campaignState.battleQueue.length === 0) {
        startNextPlanningRound();
        return;
    }
    const battle = campaignState.battleQueue.shift();
    startCampaignBattle(battle.factions, battle.sectorId);
}

function startNextPlanningRound() {
    campaignState.turnCount = (campaignState.turnCount || 1) + 1;
    campaignState.phase        = 'PLANNING';
    campaignState.currentPlayer = 1;
    campaignState.pendingMoves  = {};

    // Salta giocatori eliminati come primo giocatore
    while (campaignState.currentPlayer <= campaignState.numPlayers &&
           _isPlayerEliminated(campaignState.currentPlayer)) {
        campaignState.currentPlayer++;
    }

    if (checkCampaignWin()) return;
    renderCampaignMap();
}

// ============================================================
// AVVIO BATTAGLIA
// ============================================================
function startCampaignBattle(factions, sectorId) {
    document.getElementById('campaign-overlay').style.display = 'none';
    campaignState.targetSector              = sectorId;
    campaignState.currentBattleParticipants = factions.slice().sort((a, b) => a - b);

    // Usiamo le fazioni reali come slot — nessun remapping.
    // totalPlayers = 4 sempre, i non-partecipanti sono marcati isDisconnected.
    // Questo garantisce che Verde sia sempre Verde, Oro sia sempre Oro, ecc.
    totalPlayers = 4;
    resetPlayers();

    for (let p = 1; p <= 4; p++) {
        players[p].isDisconnected = !factions.includes(p);
        // Ripristina i crediti campagna per i partecipanti
        if (factions.includes(p)) {
            players[p].credits = campaignState.credits[p] ?? GAME.SETUP_POINTS;
        }
    }

    state = 'SETUP_P1';
    document.getElementById('setup-overlay').style.display = 'flex';
    // Il setup inizia dal primo partecipante (in ordine di fazione)
    currentPlayer = campaignState.currentBattleParticipants[0];
    setupData = freshSetupData();
    updateSetupUI();
}

// ============================================================
// SCHERMATA RISULTATI BATTAGLIA
// ============================================================
function showBattleResults(winnerFaction) {
    const participants = campaignState.currentBattleParticipants;
    const n = campaignState.numPlayers;

    // Salva crediti residui — ora currentPlayer==fazione reale, slot e fazione coincidono
    participants.forEach(faction => {
        const residualCredits = players[faction]?.credits || 0;
        campaignState.credits[faction] = Math.max(4, residualCredits);
    });

    // Assegna il settore al vincitore
    campaignState.sectors.find(s => s.id === campaignState.targetSector).owner = winnerFaction;

    const winnerColor = COLORS['p' + winnerFaction];
    const winnerName  = players[winnerFaction]?.name || ('P' + winnerFaction);

    // Costruisce il riepilogo crediti
    let creditsHtml = '';
    participants.forEach(faction => {
        const c    = COLORS['p' + faction];
        const name = players[faction]?.name || ('P' + faction);
        creditsHtml += `<div style="color:${c};font-size:14px;margin:4px 0;">
            ${name}: 💰 ${campaignState.credits[faction]} crediti → prossima battaglia
        </div>`;
    });

    // Conta settori aggiornati
    let ownedHtml = '';
    for (let p = 1; p <= n; p++) {
        const cnt   = campaignState.sectors.filter(s => s.owner === p).length;
        const c     = COLORS['p' + p];
        ownedHtml += `<span style="color:${c};margin:0 8px;">${players[p]?.name || 'P'+p}: 🏴${cnt}</span>`;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
        background:rgba(0,0,0,0.96);z-index:99999;
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-family:Courier New,monospace;text-align:center;padding:20px;`;
    overlay.innerHTML = `
        <h1 style="color:${winnerColor};text-shadow:0 0 15px ${winnerColor};margin-bottom:8px;">
            ⚔️ BATTAGLIA CONCLUSA
        </h1>
        <h2 style="color:${winnerColor};margin-bottom:16px;">
            VINCITORE: ${winnerName.toUpperCase()}
        </h2>
        <div style="background:rgba(255,255,255,0.05);border:1px solid #333;border-radius:8px;
                    padding:16px 30px;margin-bottom:16px;min-width:300px;">
            <p style="color:#aaa;font-size:12px;margin:0 0 10px;text-transform:uppercase;letter-spacing:1px;">
                Crediti Residui (portati alla prossima battaglia)
            </p>
            ${creditsHtml}
        </div>
        <div style="background:rgba(255,255,255,0.03);border:1px solid #222;border-radius:8px;
                    padding:10px 20px;margin-bottom:20px;font-size:13px;">
            <p style="color:#666;margin:0 0 6px;font-size:11px;">CONTROLLO SETTORI</p>
            ${ownedHtml}
        </div>
        <button class="action-btn"
            style="padding:15px 50px;border:2px solid ${winnerColor};color:${winnerColor};
                   background:transparent;cursor:pointer;font-size:16px;">
            AVANTI ▶
        </button>
    `;

    overlay.querySelector('button').onclick = () => {
        overlay.remove();
        // Pulizia stato di gioco
        grid.clear();
        controlPoints.clear();
        state = 'SETUP_P1';
        document.getElementById('controls-panel').style.display  = 'none';
        document.getElementById('setup-overlay').style.display   = 'none';
        if (typeof ctx !== 'undefined') ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Controlla vittoria campagna prima di andare avanti
        if (checkCampaignWin()) return;
        runNextBattle();
    };

    document.body.appendChild(overlay);
}

// ============================================================
// VERIFICA VITTORIA CAMPAGNA
// ============================================================
function checkCampaignWin() {
    let winner = null;
    for (let p = 1; p <= campaignState.numPlayers; p++) {
        const cnt = campaignState.sectors.filter(s => s.owner === p).length;
        if (cnt >= campaignState.victoryThreshold) { winner = p; break; }
    }
    if (!winner) return false;

    const color = COLORS['p' + winner];
    const name  = players[winner]?.name || ('P' + winner);
    const cnt   = campaignState.sectors.filter(s => s.owner === winner).length;

    const overlay = document.getElementById('campaign-overlay');
    overlay.style.display = 'flex';
    overlay.innerHTML = `
        <div style="text-align:center;color:${color};padding:50px;
                    border:3px solid ${color};background:rgba(0,0,0,0.95);
                    border-radius:12px;max-width:500px;font-family:Courier New;">
            <div style="font-size:3em;margin-bottom:10px;">🏆</div>
            <h1 style="color:${color};text-shadow:0 0 20px ${color};margin:0 0 10px;">
                DOMINATORE GLOBALE
            </h1>
            <h2 style="margin:0 0 16px;">${name.toUpperCase()}</h2>
            <p style="color:#aaa;margin-bottom:24px;">
                Conquista ${cnt}/${campaignState.sectors.length} settori — Vittoria Totale!
            </p>
            <button class="action-btn"
                style="border:2px solid ${color};color:${color};background:transparent;
                       padding:15px 40px;cursor:pointer;font-size:16px;"
                onclick="location.reload()">
                NUOVA PARTITA
            </button>
        </div>
    `;
    return true;
}

// ============================================================
// HOOK: freshSetupData
// Usa i crediti campagna come punti di setup
// ============================================================
const _campaign_origFreshSetupData = window.freshSetupData;
window.freshSetupData = function () {
    const data = _campaign_origFreshSetupData
        ? _campaign_origFreshSetupData()
        : { points: GAME.SETUP_POINTS, agents: [] };

    if (campaignState.isActive) {
        // currentPlayer è già la fazione reale (1..4), leggere direttamente
        data.points = campaignState.credits[currentPlayer] ?? 10;
    }
    return data;
};

// ============================================================
// HOOK: confirmPlayerSetup (campagna)
// ============================================================
const _campaign_origConfirmPlayerSetup = window.confirmPlayerSetup;
window.confirmPlayerSetup = function () {
    if (!campaignState.isActive) {
        return _campaign_origConfirmPlayerSetup
            ? _campaign_origConfirmPlayerSetup()
            : undefined;
    }

    // --- CONTROLLO: MINIMO 1 AGENTE ---
    if (!setupData.agents || setupData.agents.length === 0) {
        showTemporaryMessage("ERRORE: Devi reclutare almeno un agente per scendere in campo!");
        playSFX('click'); // Feedback sonoro errore
        return; // Blocca la conferma
    }

    // Salva agenti e carte per la fazione reale corrente
    players[currentPlayer].agents    = JSON.parse(JSON.stringify(setupData.agents));
    players[currentPlayer].credits   = setupData.points;
    players[currentPlayer].cards     = typeof getFinalCardSelection === 'function'
        ? getFinalCardSelection() : [];
    players[currentPlayer].usedCards = {};

    // ── APPLICA BONUS ARSENALE E FORGIA  ──
    if (campaignState.isActive) {
        campaignState.sectors.forEach(s => {
            // Se il settore è della fazione che sta facendo il setup ed è speciale...
            if (s.owner === currentPlayer && s.specialization) {
                
                players[currentPlayer].agents.forEach(agent => {
                    if (s.specialization === 'ARSENALE') {
                        agent.dmg += 1; // +1 Danno globale
                    } 
                    else if (s.specialization === 'FORGIA') {
                        agent.maxHp += 1; // +1 Vita globale
                        agent.hp += 1;
                    }
                });
                
            }
        });
    }
    // ───────────────────────────────────────────────────────────

    // Trova il prossimo partecipante nella lista (in ordine di fazione)
    const participants = campaignState.currentBattleParticipants;
    const currentIndex = participants.indexOf(currentPlayer);
    const nextIndex    = currentIndex + 1;

    if (nextIndex < participants.length) {
        // Prossimo partecipante al setup
        currentPlayer = participants[nextIndex];
        setupData = freshSetupData();
        if (typeof cardSelectionData !== 'undefined') cardSelectionData.selected = [];
        updateSetupUI();
    } else {
        // Tutti i partecipanti hanno fatto setup → avvia la partita
        startActiveGameLocal();
        resetTurnState();
        drawGame();
    }
};

// ============================================================
// HOOK: showGameOverlay (fine partita in modalità campagna)
// ============================================================
const _campaign_origShowGameOverlay = window.showGameOverlay;
window.showGameOverlay = function (title, message, color) {
    if (!campaignState.isActive) {
        return _campaign_origShowGameOverlay
            ? _campaign_origShowGameOverlay(title, message, color)
            : undefined;
    }

    // Identifica la fazione vincitore dal colore (cerca tra tutti e 4 gli slot)
    let winnerFaction = campaignState.currentBattleParticipants[0];
    for (let p = 1; p <= 4; p++) {
        if (players[p] && players[p].color === color) {
            winnerFaction = p;
            break;
        }
    }
    showBattleResults(winnerFaction);
};

// ============================================================
// HELPER: mostra il menu di selezione numero giocatori campagna
// (chiamato dall'HTML al posto di startCampaign() diretto)
// ============================================================
function showCampaignMenu() {
    if (typeof playSFX === 'function') playSFX('click');
    const menu = document.getElementById('network-menu');
    if (!menu) return; // Fail-safe se l'ID non esiste

    // Rimuovi eventuale menu campagna già aperto
    const existing = document.getElementById('campaign-num-players');
    if (existing) { existing.remove(); return; }

    const div = document.createElement('div');
    div.id = 'campaign-num-players';
    div.style.cssText = `margin-top:20px;text-align:center;border-top:1px solid #333;
        padding-top:16px;font-family:Courier New;`;
    div.innerHTML = `
        <p style="color:#aaa;margin-bottom:12px;">Numero di giocatori (Campagna):</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            <button class="action-btn" onclick="startCampaign(2)"
                style="border:2px solid #00ff88;color:#00ff88;background:transparent;">2 GIOCATORI</button>
            <button class="action-btn" onclick="startCampaign(3)"
                style="border:2px solid #00aaff;color:#00aaff;background:transparent;">3 GIOCATORI</button>
            <button class="action-btn" onclick="startCampaign(4)"
                style="border:2px solid #FFD700;color:#FFD700;background:transparent;">4 GIOCATORI</button>
        </div>
    `;
    menu.appendChild(div);
}