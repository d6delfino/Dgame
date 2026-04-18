/* ============================================================
   campaign_mobile.js — v4
   Carica DOPO campaign.js, campaign_sectors.js, campaign_battles.js
   ============================================================ */
(function () {
    'use strict';

    const BREAK = 900; // px — soglia mobile
    function isMobile() { return window.innerWidth < BREAK; }

    /* ─────────────────────────────────────────────────────────
       CSS — iniettato una volta sola
    ───────────────────────────────────────────────────────── */
    function injectCSS() {
        if (document.getElementById('mob-css')) return;
        const s = document.createElement('style');
        s.id = 'mob-css';
        s.textContent = `
/* Nasconde elementi desktop inutili su mobile */
#camp-hide-desktop { display:none !important; }

/* HUD fisso in cima */
#mob-hud {
    position:fixed; top:0; left:0; right:0; z-index:100000;
    background:rgba(0,0,12,0.95);
    padding:4px 8px 3px; box-sizing:border-box;
    font-family:'Courier New',monospace; font-size:10px;
    border-bottom:1px solid rgba(255,255,255,0.12);
    pointer-events:none;
}
#mob-hud .r { display:flex; flex-wrap:wrap; gap:3px 8px; justify-content:center; }
#mob-hud .p { text-align:center; font-size:11px; font-weight:bold; color:#fff; margin-top:1px; }

/* Barra banca/azioni fissa in fondo */
#mob-bank {
    position:fixed; bottom:0; left:0; right:0; z-index:100000;
    background:rgba(0,0,12,0.96);
    border-top:1px solid rgba(255,255,255,0.12);
    padding:5px 8px 6px; box-sizing:border-box;
    font-family:'Courier New',monospace; font-size:10px;
}

.campaign-summary-overlay, #eco-income-overlay, #eco-credit-modal {
    z-index: 200000 !important; /* Più alto di HUD e BANK */
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    background: rgba(0,0,0,0.98) !important;
}

.campaign-summary-overlay > div, #eco-income-overlay > div, #eco-credit-modal > div {
    min-width: unset !important;
    width: 95vw !important;
    max-width: 95vw !important;
    padding: 20px 15px !important;
    box-sizing: border-box !important;
}

#mob-bank .chips {
    display:flex; flex-wrap:wrap; gap:3px; margin-bottom:4px;
}
#mob-bank .chip {
    display:flex; align-items:center; gap:3px;
    border-radius:4px; padding:2px 5px; font-size:10px;
    background:rgba(255,255,255,0.05);
}
#mob-bank .chip .x {
    background:none; border:none; color:#f44; cursor:pointer;
    font-size:13px; line-height:1; padding:0 1px;
}
#mob-bank .info {
    display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;
}
#mob-bank .btns { display:flex; gap:6px; flex-wrap:wrap; }
#mob-bank button {
    font-family:'Courier New',monospace; font-size:11px;
    padding:6px 12px; border-radius:4px; cursor:pointer;
    touch-action:manipulation;
}

/* Overlay scrollabili */
.mob-scroll {
    overflow-y:auto !important;
    align-items:flex-start !important;
    padding:12px 8px !important;
    box-sizing:border-box !important;
}
.mob-scroll > div {
    min-width:unset !important;
    max-width:calc(100vw - 16px) !important;
    width:calc(100vw - 16px) !important;
    padding:14px 12px !important;
    box-sizing:border-box !important;
}
.mob-scroll h1 { font-size:18px !important; margin:0 0 8px !important; }
.mob-scroll h2 { font-size:14px !important; }
.mob-scroll button { font-size:12px !important; padding:8px 12px !important; }
.mob-scroll input[type=range] { height:22px !important; margin-bottom:16px !important; }
.mob-scroll #eco-credit-val { font-size:28px !important; }
/* annulla font-size grandi inline */
.mob-scroll * { max-font-size:16px; }

@keyframes campPulse { from{opacity:.5} to{opacity:1} }
        `;
        document.head.appendChild(s);
    }

    /* ─────────────────────────────────────────────────────────
       Calcola raggio esagono in base alle dimensioni reali
       disponibili dopo HUD e barra banca
    ───────────────────────────────────────────────────────── */
    function hexRadius() {
        const hudH  = document.getElementById('mob-hud')?.offsetHeight  || 44;
        const bankH = document.getElementById('mob-bank')?.offsetHeight || 60;
        const vw = window.innerWidth;
        const vh = window.innerHeight - hudH - bankH;
        // I settori vanno da ~6% a ~94% → span ≈ 88%.
        // Distanza minima tra vicini ≈ 6% dello span.
        const minDist = Math.min(vw * 0.88 * 0.07, vh * 0.88 * 0.09);
        return Math.min(Math.max(minDist * 0.7, 15), 40);
    }

    /* ─────────────────────────────────────────────────────────
       Aggiusta il wrapper mappa tra HUD e barra banca
    ───────────────────────────────────────────────────────── */
    function fitWrapper() {
        const hudH  = document.getElementById('mob-hud')?.offsetHeight  || 44;
        const bankH = document.getElementById('mob-bank')?.offsetHeight || 60;
        const sw = document.getElementById('map-scaling-wrapper');
        if (!sw) return;
        sw.style.transform      = 'none';
        sw.style.transformOrigin= 'unset';
        sw.style.top            = hudH + 'px';
        sw.style.left           = '0';
        sw.style.width          = '100%';
        sw.style.height         = `calc(100% - ${hudH + bankH}px)`;
    }

    /* ─────────────────────────────────────────────────────────
       HUD in cima
    ───────────────────────────────────────────────────────── */
    function buildHUD() {
        document.getElementById('mob-hud')?.remove();
        
        // Verifica se l'overlay della campagna è visibile
        const target = document.getElementById('campaign-overlay');
        if (!target || target.style.display === 'none') return;

        const n     = campaignState.numPlayers;
        const currP = campaignState.currentPlayer;
        const pCol  = COLORS['p'+currP];
        const pName = players[currP]?.name || 'P'+currP;

        const owned = {};
        for (let p=1;p<=n;p++) owned[p]=0;
        campaignState.sectors.forEach(s=>{ if(s.owner>0&&s.owner<=n) owned[s.owner]++; });

        let row = '';
        for (let p=1;p<=n;p++) {
            const c=COLORS['p'+p], nm=players[p]?.name||'P'+p;
            row += `<span style="color:${c}">${nm}&nbsp;💰${campaignState.credits[p]}&nbsp;🏴${owned[p]}</span>`;
        }
        const phase = campaignState.phase==='PLANNING'
            ? `T${campaignState.turnCount||1} — <span style="color:${pCol}">${pName.toUpperCase()}</span>`
            : 'RISOLUZIONE IN CORSO...';

        const hud = document.createElement('div');
        hud.id = 'mob-hud';
        hud.innerHTML = `<div class="r">${row}</div><div class="p">${phase}</div>`;
        
        // FISSA: Appendiamo all'overlay, non al body
        target.appendChild(hud); 
    }

    /* ─────────────────────────────────────────────────────────
       Barra banca + bottoni azione in fondo
    ───────────────────────────────────────────────────────── */
    function buildBank() {
        document.getElementById('mob-bank')?.remove();
        
        const target = document.getElementById('campaign-overlay');
        // Se non siamo in PLANNING o l'overlay è nascosto (battaglia), non creare nulla
        if (campaignState.phase !== 'PLANNING' || !target || target.style.display === 'none') {
            return;
        }

        const p      = campaignState.currentPlayer;
        const pCol   = COLORS['p'+p];
        const pName  = players[p]?.name||'P'+p;
        const avail  = campaignState.credits[p]||0;
        const orders = campaignState.pendingOrders?.[p]||[];
        const spent  = orders.reduce((s,o)=>s+o.credits,0);

        let chips = '';
        orders.forEach(o => {
            const spec = campaignState.sectors[o.sectorId]?.specialization
                ? (typeof SECTOR_SPECIALIZATIONS!=='undefined'
                    ? SECTOR_SPECIALIZATIONS.find(s=>s.id===campaignState.sectors[o.sectorId].specialization)?.label?.split(' ')[0]||''
                    : '')
                : '';
            chips += `<div class="chip" style="border:1px solid ${pCol}55">
                <span style="color:${pCol}">S${o.sectorId}${spec?' '+spec:''}</span>
                <span style="color:#FFD700">💰${o.credits}</span>
                <button class="x" onclick="_eco_cancelOrder(${p},${o.sectorId})">✕</button>
            </div>`;
        });

        const bar = document.createElement('div');
        bar.id = 'mob-bank';

        const hasOrder = orders.length > 0;
        const confirmStyle = hasOrder
            ? `border:1px solid ${pCol};color:${pCol};background:rgba(0,0,0,.85);`
            : `border:1px solid #444;color:#555;background:rgba(0,0,0,.6);`;

        bar.innerHTML = `
            ${chips ? `<div class="chips">${chips}</div>` : ''}
            <div class="info">
                <span style="color:${pCol};font-weight:bold">${pName}</span>
                <span style="color:#FFD700">💰 Banca: ${avail}</span>
                ${spent>0?`<span style="color:#f84">💸 Invest: ${spent}</span>`:''}
            </div>
            <div class="btns">
                <button style="${confirmStyle}" id="mob-confirm-btn"
                    ${hasOrder?'':'disabled'}>CONFERMA ▶</button>
                <button style="border:1px solid #555;color:#888;background:rgba(0,0,0,.7);"
                    id="mob-skip-btn">PASSA</button>
            </div>`;

        // FISSA: Appendiamo all'overlay, non al body
        target.appendChild(bar);

        const confirmBtn = document.getElementById('mob-confirm-btn');
        const skipBtn    = document.getElementById('mob-skip-btn');

        function tap(btn, fn) {
            let tapped = false;
            btn.addEventListener('touchend', e => {
                e.preventDefault(); e.stopPropagation();
                if (!tapped) { tapped=true; fn(); setTimeout(()=>tapped=false,400); }
            }, { passive:false });
            btn.addEventListener('click', e => {
                e.stopPropagation();
                if (!tapped) fn();
            });
        }

        if (hasOrder) tap(confirmBtn, () => finishPlayerTurn());
        tap(skipBtn, () => skipPlayerTurn());
    }

    /* ─────────────────────────────────────────────────────────
       Ridisegna settori con raggio corretto
    ───────────────────────────────────────────────────────── */
    function rebuildMap() {
        const sectorsDiv = document.getElementById('map-sectors');
        const svgLinks   = document.getElementById('map-links');
        if (!sectorsDiv || !svgLinks) return;

        const r   = hexRadius();
        const pad = 2;
        const sz  = (r + pad) * 2;
        const cx  = sz/2, cy = sz/2;

        function hexPts(rad) {
            const a=[];
            for(let i=0;i<6;i++){
                const ang=Math.PI/180*(60*i-30);
                a.push((rad*Math.cos(ang)+cx)+','+(rad*Math.sin(ang)+cy));
            }
            return a.join(' ');
        }

        const hqSet = new Set(CAMPAIGN_HQ_POSITIONS[campaignState.numPlayers]||[]);
        sectorsDiv.innerHTML = '';

        campaignState.sectors.forEach(s => {

            /* ── BLOCCATO ── */
            if (s.blocked) {
                const w = document.createElement('div');
                w.style.cssText = `position:absolute;left:${s.x}%;top:${s.y}%;
                    transform:translate(-50%,-50%);pointer-events:none;`;
                w.innerHTML = `<svg width="${sz}" height="${sz}" style="overflow:visible;display:block;">
                    <polygon points="${hexPts(r)}"
                        fill="transparent" stroke="rgba(120,40,40,.8)" stroke-width="1.5"/>
                    <line x1="${cx-r*.4}" y1="${cy-r*.4}" x2="${cx+r*.4}" y2="${cy+r*.4}"
                        stroke="rgba(180,40,40,.9)" stroke-width="2" stroke-linecap="round"/>
                    <line x1="${cx+r*.4}" y1="${cy-r*.4}" x2="${cx-r*.4}" y2="${cy+r*.4}"
                        stroke="rgba(180,40,40,.9)" stroke-width="2" stroke-linecap="round"/>
                </svg>`;
                sectorsDiv.appendChild(w);
                return;
            }

            /* ── NORMALE ── */
            const allT = campaignState._allOrderedSectors?.[s.id]
                || Object.keys(campaignState.pendingMoves||{})
                    .filter(k=>campaignState.pendingMoves[k]===s.id).map(Number);

            const sc  = s.owner>0 ? COLORS['p'+s.owner] : 'rgba(180,200,255,.65)';
            const sw2 = s.owner>0 ? 3 : 2;
            const lbl = (hqSet.has(s.id)&&s.owner>0) ? 'HQ' : String(s.id);
            const fs  = Math.max(12, r*0.60);

            let dots='';
            if(allT.length>0){
                const dw=Math.min(r*.5,12),dh=Math.max(3,r*.14),gap=2;
                const tot=allT.length*dw+(allT.length-1)*gap;
                allT.forEach((pid,i)=>{
                    const c=COLORS['p'+pid];
                    const dx=cx-tot/2+i*(dw+gap), dy=cy-r*.27-dh/2;
                    dots+=`<rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" rx="2"
                        fill="${c}" style="filter:drop-shadow(0 0 2px ${c})"/>`;
                });
            }

            /* Contenitore del settore — pointer-events:none sull'SVG,
               il click è gestito solo sul div wrap */
            const wrap = document.createElement('div');
            wrap.style.cssText = `position:absolute;left:${s.x}%;top:${s.y}%;
                transform:translate(-50%,-50%);
                ${allT.length>0?'animation:campPulse .9s infinite alternate;':''}`;
            wrap.style.zIndex  = '5';

            /* SVG esagono — pointer-events:none così i touch non vengono "rubati" */
            const svgEl = document.createElementNS('http://www.w3.org/2000/svg','svg');
            svgEl.setAttribute('width',sz); svgEl.setAttribute('height',sz);
            svgEl.style.cssText = 'overflow:visible;display:block;pointer-events:none;';
            svgEl.innerHTML = `
                <polygon points="${hexPts(r)}"
                    fill="rgba(10,15,30,.25)" fill-opacity="${s.owner>0?.82:.7}"
                    stroke="${sc}" stroke-width="${sw2}"
                    style="filter:drop-shadow(0 1px 4px ${s.owner>0?COLORS['p'+s.owner]:'#000'});"/>
                ${dots}
                <text x="${cx}" y="${cy+(allT.length>0?r*.18:0)}"
                    text-anchor="middle" dominant-baseline="middle"
                    font-family="Courier New" font-size="${fs}" font-weight="bold"
                    fill="${s.owner>0?'#fff':'#cce'}">${lbl}</text>`;
            wrap.appendChild(svgEl);

            /* Badge rendita (sopra, pointer-events:none) */
            const spec = typeof SECTOR_SPECIALIZATIONS!=='undefined'
                ? SECTOR_SPECIALIZATIONS.find(sp=>sp.id===s.specialization) : null;
            const bfs = Math.max(14, r*0.50);
            const badge = document.createElement('div');
            badge.style.cssText = `position:absolute;top:1px;left:50%;
                transform:translateX(-50%);
                pointer-events:none;white-space:nowrap;
                font-family:'Courier New',monospace;font-size:${bfs}px;font-weight:bold;
                color:#FFD700;text-shadow:0 0 4px rgba(255,215,0,.9),0 1px 2px rgba(0,0,0,.9);
                z-index:6;`;
            badge.textContent = `+${s.income}💰`+(spec?' '+spec.label.split(' ')[0]:'');
            wrap.appendChild(badge);

            /* Bottoni +/− allocazione — SOLO per il giocatore corrente */
            const isCurr = s.owner===campaignState.currentPlayer
                           && campaignState.phase==='PLANNING';
            if (isCurr) {
                const alloc = campaignState.sectorCredits?.[s.id]?.[s.owner]||0;
                const c     = COLORS['p'+s.owner];
                const bSz   = Math.max(35, r*1.2);
                const bfs2  = Math.max(20, bSz*0.65);

                const aDiv = document.createElement('div');
                aDiv.style.cssText = `position:absolute;bottom:1px;left:50%;
                    transform:translateX(-50%);
                    display:flex;align-items:center;gap:2px;z-index:15;`;

                function makeBtn(lbl2, action) {
                    const btn = document.createElement('button');
                    btn.textContent = lbl2;
                    btn.style.cssText = `
                        background:rgba(0,0,12,.95);border:1.5px solid ${c};color:${c};
                        width:${bSz}px;height:${bSz}px;border-radius:3px;
                        font-weight:bold;font-size:${bfs2}px;line-height:1;padding:0;
                        cursor:pointer;touch-action:manipulation;
                        -webkit-tap-highlight-color:transparent;`;

                    /* Intercetta TUTTI gli eventi touch/mouse prima che arrivino al wrap */
                    ['touchstart','touchend','mousedown','mouseup','click'].forEach(ev => {
                        btn.addEventListener(ev, e => {
                            e.stopPropagation();
                            e.preventDefault();
                        }, { passive:false });
                    });
                    /* L'azione vera scatta su touchend (più reattivo su mobile) */
                    btn.addEventListener('touchend', e => {
                        e.stopPropagation(); e.preventDefault();
                        action();
                    }, { passive:false });
                    /* Fallback per mouse/desktop */
                    btn.addEventListener('click', e => { e.stopPropagation(); action(); });
                    return btn;
                }

                const valSpan = document.createElement('span');
                valSpan.style.cssText = `color:${c};min-width:14px;text-align:center;
                    font-family:'Courier New',monospace;font-size:${bfs}px;
                    pointer-events:none;`;
                valSpan.textContent = `💼${alloc}`;

                const bM = makeBtn('−', () => {
                    if (typeof window._cn_allocRemove==='function') { window._cn_allocRemove(s.id); return; }
                    const cur = campaignState.sectorCredits?.[s.id]?.[s.owner]||0;
                    if(cur>0){ campaignState.sectorCredits[s.id][s.owner]--; campaignState.credits[s.owner]++; renderCampaignMap(); }
                });
                const bP = makeBtn('+', () => {
                    if (typeof window._cn_allocAdd==='function') { window._cn_allocAdd(s.id); return; }
                    if(campaignState.credits[s.owner]>0){
                        if(!campaignState.sectorCredits[s.id]) campaignState.sectorCredits[s.id]={};
                        campaignState.sectorCredits[s.id][s.owner]=(campaignState.sectorCredits[s.id][s.owner]||0)+1;
                        campaignState.credits[s.owner]--;
                        renderCampaignMap();
                    } else { showTemporaryMessage('Banca vuota!'); }
                });

                aDiv.appendChild(bM);
                aDiv.appendChild(valSpan);
                aDiv.appendChild(bP);
                wrap.appendChild(aDiv);
            }

            /* Click sul wrap → handleSectorClick solo se non è un bottone */
            wrap.addEventListener('click', e => {
                if (e.target.tagName==='BUTTON') return;
                handleSectorClick(s.id);
            });
            wrap.addEventListener('touchend', e => {
                if (e.target.tagName==='BUTTON') return;
                e.preventDefault();
                handleSectorClick(s.id);
            }, { passive:false });

            sectorsDiv.appendChild(wrap);
        });

        /* ── Linee connessione ── */
        let lines='';
        for(let id in campaignState.adj){
            const s1=campaignState.sectors[id]; if(s1.blocked) continue;
            campaignState.adj[id].forEach(tid=>{
                if(id>=tid) return;
                const s2=campaignState.sectors[tid]; if(s2.blocked) return;
                lines+=`<line x1="${s1.x}%" y1="${s1.y}%" x2="${s2.x}%" y2="${s2.y}%"
                    stroke="rgba(255,255,255,.25)" stroke-width="1.2"/>`;
            });
        }
        svgLinks.innerHTML = lines;
    }

    /* ─────────────────────────────────────────────────────────
       Nasconde elementi desktop dentro #campaign-overlay
    ───────────────────────────────────────────────────────── */
    function hideDesktopUI() {
        const ov = document.getElementById('campaign-overlay');
        if (!ov) return;
        /* HUD desktop (primo figlio flex-direction:column) */
        ov.querySelectorAll('div').forEach(d => {
            if (d.style.flexDirection==='column' || d.style.display==='flex' && d.style.alignItems==='center') {
                d.id = 'camp-hide-desktop';
            }
        });
        /* Barra azioni originale */
        const act = document.getElementById('campaign-actions');
        if (act) act.style.display = 'none';
        /* Pulsante INFO (top:15px;left:15px) */
        ov.querySelectorAll('button').forEach(b => {
            if (b.style.top==='15px') b.style.display='none';
        });
    }

    /* ─────────────────────────────────────────────────────────
       Entry point — viene chiamato dopo ogni renderCampaignMap
    ───────────────────────────────────────────────────────── */
    function applyMobile() {
        const overlay = document.getElementById('campaign-overlay');
        
        // Se l'overlay della mappa è nascosto (Battaglia in corso)
        if (!overlay || overlay.style.display === 'none') {
            document.getElementById('mob-hud')?.remove();
            document.getElementById('mob-bank')?.remove();
            return;
        }

        injectCSS();
        hideDesktopUI();

        const oldPanel = document.getElementById('eco-orders-panel');
        if (oldPanel) oldPanel.remove();

        buildHUD();
        buildBank();          
        fitWrapper();         
        rebuildMap();         
    }

    /* ─────────────────────────────────────────────────────────
       Patch renderCampaignMap
    ───────────────────────────────────────────────────────── */
    const _orig = window.renderCampaignMap;
    window.renderCampaignMap = function () {
        _orig();
        if (isMobile()) applyMobile();
    };

    /* ─────────────────────────────────────────────────────────
       MutationObserver — rende scrollabili gli overlay dinamici
    ───────────────────────────────────────────────────────── */
    new MutationObserver(muts => {
    if (!isMobile()) return;
    muts.forEach(m => m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;

        // Controlla se è una schermata di riepilogo, reddito o crediti
        const isOverlay = node.classList.contains('campaign-summary-overlay') || 
                          node.id === 'eco-income-overlay' || 
                          node.id === 'eco-credit-modal' ||
                          node.id === 'campaign-info-modal';

        if (isOverlay) {
            // Forza lo scroll se il testo è lungo
            node.style.overflowY = 'auto';
            node.style.padding = '20px 0';
            
            // Cerca il div interno (quello con i bordi e il testo)
            const inner = node.querySelector('div');
            if (inner) {
                inner.style.minWidth = 'unset';
                inner.style.width = '92%';
                inner.style.margin = 'auto';
                
                // Rimpicciolisce i testi che su mobile occupano troppo spazio
                inner.querySelectorAll('h1, h2').forEach(h => {
                    h.style.fontSize = '22px';
                    h.style.lineHeight = '1.2';
                });
                
                inner.querySelectorAll('div, p').forEach(p => {
                    if (p.style.fontSize) p.style.fontSize = '14px';
                });

                // Trova il tasto AVANTI / INIZIA TURNO
                const btn = inner.querySelector('button');
                if (btn) {
                    btn.style.width = '100%';
                    btn.style.padding = '18px';
                    btn.style.fontSize = '20px';
                    btn.style.marginTop = '15px';
                }
            }
        }
    }));
}).observe(document.body, { childList: true, subtree: false });

    /* ─────────────────────────────────────────────────────────
       Resize
    ───────────────────────────────────────────────────────── */
    let _rTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(_rTimeout);
        _rTimeout = setTimeout(() => {
            if (!campaignState?.isActive) return;
            
            const ov = document.getElementById('campaign-overlay');
            // Se la mappa è nascosta, puliamo e usciamo
            if (!ov || ov.style.display==='none') {
                document.getElementById('mob-hud')?.remove();
                document.getElementById('mob-bank')?.remove();
                return;
            }

            if (isMobile()) {
                applyMobile();
            } else {
                // ... (codice per ripristino desktop resta uguale)
            }
        }, 150);
    });

    console.log('[campaign_mobile.js] v4 pronto.');
})();
