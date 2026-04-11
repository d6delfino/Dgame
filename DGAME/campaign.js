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

    // 25 settori in griglia 5×5 (coordinate percentuali per il rendering)
    sectors: (() => {
        const s = [];
        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                s.push({ id: row * 5 + col, owner: 0,
                         x: 12 + col * 19,   // 12%, 31%, 50%, 69%, 88%
                         y: 10 + row * 20 }); // 10%, 30%, 50%, 70%, 90%
            }
        }
        return s;
    })(),

    // Adiacenze griglia 5×5 — 8-connessa (ortogonali + diagonali)
    // + corsie veloci a lungo raggio per più dinamismo tattico
    adj: (() => {
        const a = {};
        for (let i = 0; i < 25; i++) a[i] = [];

        const add = (i, j) => {
            if (!a[i].includes(j)) a[i].push(j);
            if (!a[j].includes(i)) a[j].push(i);
        };

        for (let i = 0; i < 25; i++) {
            const r = Math.floor(i / 5), c = i % 5;
            // Ortogonali
            if (c < 4) add(i, i + 1);
            if (r < 4) add(i, i + 5);
            // Diagonali
            if (r < 4 && c < 4) add(i, i + 6);
            if (r < 4 && c > 0) add(i, i + 4);
        }

        // --- Corsie veloci (salto di 2 celle) ---
        // Bordo superiore e inferiore: collegano coppie a distanza 2
        [0, 20].forEach(rowStart => {
            for (let c = 0; c < 3; c++) add(rowStart + c, rowStart + c + 2);
        });
        // Bordo sinistro e destro
        [0, 4].forEach(colStart => {
            for (let r = 0; r < 3; r++) add(colStart + r * 5, colStart + (r + 2) * 5);
        });
        // Il centro (12) è connesso a tutti i settori a 2 passi lungo gli assi
        [2, 10, 14, 22].forEach(n => add(12, n));
        // Diagonali lunghe angolo-angolo passanti per il centro
        add(0, 12); add(12, 24);
        add(4, 12); add(12, 20);

        return a;
    })()
};

// Posizioni HQ iniziali per N giocatori (indici settori)
const CAMPAIGN_HQ_POSITIONS = {
    2: [0, 24],
    3: [0, 4, 20],
    4: [0, 4, 20, 24]
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
    campaignState.pendingMoves = {};
    campaignState.battleQueue  = [];
    campaignState.victoryThreshold = Math.floor(25 / 2) + 1; // 13

    // Crediti iniziali uguali ai punti di setup
    campaignState.credits = {};
    for (let p = 1; p <= numPlayers; p++) campaignState.credits[p] = GAME.SETUP_POINTS;

    // Reset settori
    campaignState.sectors.forEach(s => s.owner = 0);
    const hqSlots = CAMPAIGN_HQ_POSITIONS[numPlayers] || CAMPAIGN_HQ_POSITIONS[4];
    hqSlots.forEach((sid, idx) => { campaignState.sectors[sid].owner = idx + 1; });

    renderCampaignMap();
}

// ============================================================
// RENDER MAPPA CAMPAGNA
// ============================================================
function renderCampaignMap() {
    const overlay = document.getElementById('campaign-overlay');
    overlay.style.display = 'flex';
    overlay.style.backgroundImage = "url('img/sfondocamp.png')";
    overlay.style.backgroundSize  = 'cover';
    overlay.style.backgroundPosition = 'center';

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
        <div style="position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);z-index:0;"></div>
        <h1 style="color:#fff;text-shadow:0 0 15px #fff;margin:0 0 4px;z-index:1;font-family:Courier New;font-size:clamp(1.2em,3vw,2em);">
            SYNDICATE: GLOBAL WAR
        </h1>
        <div style="z-index:1;background:rgba(0,0,0,0.8);padding:8px 20px;border-radius:8px;margin-bottom:8px;text-align:center;font-family:Courier New;font-size:clamp(11px,1.5vw,14px);">
            ${creditsBar}
        </div>
        <div style="z-index:1;color:#aaa;font-family:Courier New;font-size:clamp(12px,1.8vw,16px);margin-bottom:6px;">
            FASE: ${phaseLabel}
        </div>
        <div id="map-container" style="position:relative;width:min(85vw,700px);height:min(55vh,520px);
             background:rgba(10,10,25,0.7);border:1px solid #444;border-radius:12px;
             overflow:hidden;z-index:1;box-shadow:0 0 40px rgba(0,0,0,0.9);">
            <svg id="map-links" style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;pointer-events:none;"></svg>
            <div id="map-sectors" style="position:absolute;top:0;left:0;width:100%;height:100%;z-index:2;"></div>
        </div>
        <div id="campaign-actions" style="margin-top:10px;z-index:1;display:flex;gap:10px;flex-wrap:wrap;justify-content:center;"></div>
    `;

    // Linee di connessione
    const svgLinks = document.getElementById('map-links');
    let lines = '';
    // Classificazione visiva dei link:
    //   ortogonali  → linea piena sottile
    //   diagonali   → tratteggio leggero
    //   corsie veloci (distanza > 1 cella) → linea più luminosa con frecce
    const ORTHO_DIST = 19;   // distanza % tra celle ortogonali adiacenti
    const DIAG_DIST  = Math.round(Math.sqrt(2) * 19); // ~27%

    const dist2D = (a, b) => Math.round(Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2));

    for (let id in campaignState.adj) {
        const s1 = campaignState.sectors[id];
        campaignState.adj[id].forEach(tid => {
            if (id < tid) {
                const s2 = campaignState.sectors[tid];
                const d  = dist2D(s1, s2);
                let stroke, strokeW, dash, opacity;

                if (d <= ORTHO_DIST + 2) {
                    // Ortogonale
                    stroke = 'rgba(255,255,255,0.18)'; strokeW = 2; dash = ''; opacity = 1;
                } else if (d <= DIAG_DIST + 3) {
                    // Diagonale
                    stroke = 'rgba(255,255,255,0.10)'; strokeW = 1.5; dash = 'stroke-dasharray="4,4"'; opacity = 1;
                } else {
                    // Corsia veloce (lungo raggio)
                    stroke = 'rgba(255,200,50,0.30)'; strokeW = 2; dash = 'stroke-dasharray="6,3"'; opacity = 1;
                }

                lines += `<line x1="${s1.x}%" y1="${s1.y}%" x2="${s2.x}%" y2="${s2.y}%"
                    stroke="${stroke}" stroke-width="${strokeW}" ${dash} opacity="${opacity}"/>`;
            }
        });
    }
    svgLinks.innerHTML = lines;

    // Settori
    const sectorsDiv = document.getElementById('map-sectors');
    const hqSet = new Set((CAMPAIGN_HQ_POSITIONS[campaignState.numPlayers] || []));

    campaignState.sectors.forEach(s => {
        const targeters = Object.keys(campaignState.pendingMoves)
            .filter(k => campaignState.pendingMoves[k] === s.id).map(Number);
        const isHQ = hqSet.has(s.id);

        const wrap = document.createElement('div');
        wrap.style.cssText = `position:absolute;left:${s.x}%;top:${s.y}%;transform:translate(-50%,-50%);
            display:flex;flex-direction:column;align-items:center;cursor:pointer;`;

        // Indicatori di intento (barrette colorate sopra il settore)
        if (targeters.length > 0) {
            const dots = document.createElement('div');
            dots.style.cssText = 'display:flex;gap:2px;margin-bottom:2px;';
            targeters.forEach(pid => {
                const d = document.createElement('div');
                const c = COLORS['p' + pid];
                d.style.cssText = `width:14px;height:5px;background:${c};box-shadow:0 0 5px ${c};border-radius:2px;`;
                dots.appendChild(d);
            });
            wrap.appendChild(dots);
        }

        const btn = document.createElement('div');
        const ownerClass = s.owner === 0 ? 'neutral' : 'p' + s.owner;
        btn.className = `campaign-sector ${ownerClass}`;
        const sz = isHQ ? '44px' : '36px';
        btn.style.cssText = `width:${sz};height:${sz};font-size:${isHQ ? '11px' : '10px'};`;

        if (targeters.length > 0) {
            btn.style.border = '2px dashed #fff';
            btn.style.animation = 'campPulse 0.9s infinite alternate';
        }

        // Mostra iniziali giocatore se occupato, ID se neutro
        if (isHQ && s.owner > 0) {
            btn.innerHTML = `<span style="font-size:8px;opacity:0.7">HQ</span><br>${players[s.owner]?.name?.slice(0,3) || 'P'+s.owner}`;
        } else if (s.owner > 0) {
            btn.innerHTML = players[s.owner]?.name?.slice(0,3) || 'P'+s.owner;
        } else {
            btn.innerHTML = s.id;
        }

        btn.onclick = () => handleSectorClick(s.id);
        wrap.appendChild(btn);
        sectorsDiv.appendChild(wrap);
    });

    // Bottone azione / skip
    const actionsDiv = document.getElementById('campaign-actions');
    if (campaignState.phase === 'PLANNING') {
        // Bottone conferma ordine
        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'action-btn';
        confirmBtn.style.cssText = `border-color:${pColor};color:${pColor};background:rgba(0,0,0,0.8);`;
        confirmBtn.innerText = `CONFERMA ORDINE ${players[currP]?.name?.toUpperCase() || 'P'+currP}`;
        confirmBtn.disabled = campaignState.pendingMoves[currP] === undefined;
        confirmBtn.onclick = finishPlayerTurn;
        actionsDiv.appendChild(confirmBtn);

        // Bottone "passa senza muovere"
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
        style.innerHTML = `
            @keyframes campPulse { from { opacity:0.5; } to { opacity:1; } }
        `;
        document.head.appendChild(style);
    }
}

// ============================================================
// GESTIONE CLICK SETTORE
// ============================================================
function handleSectorClick(targetId) {
    if (campaignState.phase !== 'PLANNING') return;
    const p = campaignState.currentPlayer;
    const target = campaignState.sectors[targetId];

    // Non puoi attaccare un settore che già controlli
    if (target.owner === p) {
        showTemporaryMessage('Controlli già questo settore!');
        return;
    }

    // Deve essere adiacente a un settore che controlli
    const reachable = campaignState.adj[targetId].some(id => campaignState.sectors[id].owner === p);
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

    let html = '<div style="font-family:Courier New;color:#fff;padding:20px;max-width:500px;text-align:left;">';
    html += '<h2 style="color:#fff;text-align:center;margin-top:0;">RIEPILOGO ORDINI</h2>';

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
        html += '<p style="color:#aaa;font-size:13px;margin-bottom:6px;">CONQUISTE PACIFICHE:</p>';
        peaceful.forEach(({ p, sid }) => {
            const c = COLORS['p' + p];
            html += `<div style="color:${c};font-size:14px;margin-bottom:4px;">
                → ${players[p]?.name || 'P'+p} conquista il Settore ${sid}
            </div>`;
        });
    }

    // Battaglie
    if (battles.length > 0) {
        html += '<p style="color:#ff4444;font-size:13px;margin-top:12px;margin-bottom:6px;">⚔️ BATTAGLIE:</p>';
        battles.forEach(b => {
            const names = b.factions.map(pid => {
                const c = COLORS['p' + pid];
                return `<span style="color:${c}">${players[pid]?.name || 'P'+pid}</span>`;
            }).join(' vs ');
            html += `<div style="font-size:14px;margin-bottom:4px;">Settore ${b.sectorId}: ${names}</div>`;
        });
    }

    if (peaceful.length === 0 && battles.length === 0) {
        html += '<p style="color:#888;text-align:center;">Nessun movimento questo turno.</p>';
    }

    html += `<button class="action-btn" style="width:100%;margin-top:20px;border-color:#00ff88;color:#00ff88;"
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
        data.points = campaignState.credits[currentPlayer] ?? GAME.SETUP_POINTS;
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

    // Salva agenti e carte per la fazione reale corrente
    players[currentPlayer].agents    = JSON.parse(JSON.stringify(setupData.agents));
    players[currentPlayer].cards     = typeof getFinalCardSelection === 'function'
        ? getFinalCardSelection() : [];
    players[currentPlayer].usedCards = {};

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
        currentPlayer = participants[0];
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
    playSFX('click');
    const menu = document.getElementById('network-menu');

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
