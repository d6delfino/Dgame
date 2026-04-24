/* ============================================================
   terreni.js — Modulo Terreni Speciali
   ============================================================
   1) ALTURA: +1 Gittata
   2) NEBBIA: Può essere colpita solo da distanza 1
   3) FANGO: Movimento limitato a 1 passo
   4) COPERTURA: Riduce il danno subito di 1 (minimo 1)

   DIPENDE DA: gamelogic.js (registerMoveCalculator)
   DEVE essere caricato DOPO gamelogic.js in index.html
   ============================================================ */

const TERRAINS = {
    altura:    { id: 'altura',    icon: '⛰️', color: 'rgba(200, 200, 200, 0.15)', name: 'Altura',    prob: 0.08 },
    nebbia:    { id: 'nebbia',    icon: '🌫️', color: 'rgba(100, 100, 150, 0.25)', name: 'Nebbia',    prob: 0.08 },
    fango:     { id: 'fango',     icon: '🟤', color: 'rgba(80, 50, 20, 0.3)',     name: 'Fango',     prob: 0.08 },
    copertura: { id: 'copertura', icon: '🛡️', color: 'rgba(0, 200, 100, 0.15)',   name: 'Copertura', prob: 0.08 }
};

/**
 * Assegna i terreni alle celle vuote della griglia.
 * Chiamata alla fine della generazione procedurale.
 */
function generateTerrains() {
    grid.forEach(cell => {
        if (cell.type === 'empty' && !cell.entity && !controlPoints.has(getKey(cell.q, cell.r))) {
            const rand = Math.random();
            let threshold = 0;
            for (const key in TERRAINS) {
                threshold += TERRAINS[key].prob;
                if (rand < threshold) {
                    cell.terrain = TERRAINS[key].id;
                    break;
                }
            }
        }
    });
}

// ============================================================
// LOGICA TERRENI (Meccaniche)
// ============================================================

// --- FANGO (Restrizione Movimento) ---
// Se l'agente si trova su fango, può muoversi di 1 solo passo
// indipendentemente dal suo valore mov.
// Questo file DEVE essere caricato DOPO gamelogic.js (e carduse.js)
// affinché registerMoveCalculator esista già.
registerMoveCalculator(function(agent) {
    const agentCell = grid.get(getKey(agent.q, agent.r));
    if (!agentCell || agentCell.terrain !== 'fango') return null;

    const targets = [];
    hexDirections.forEach(function(dir) {
        const nq   = agent.q + dir.q;
        const nr   = agent.r + dir.r;
        const cell = grid.get(getKey(nq, nr));
        if (cell && cell.type === 'empty' && !cell.entity) {
            targets.push({ q: nq, r: nr });
        }
    });
    return targets;   // array (anche vuoto) → blocca il calcolo standard
});

// --- COPERTURA (Helper Riduzione Danno) ---
// Riduce di 1 il danno (minimo 1) solo per gli AGENTI.
// Chiamata da gamelogic.js e carduse.js tramite typeof check.
function calculateDamageWithTerrain(baseDmg, targetEntity) {
    if (!targetEntity || targetEntity.type !== 'agent' || typeof targetEntity.q === 'undefined') {
        return baseDmg;
    }
    const cell = grid.get(getKey(targetEntity.q, targetEntity.r));
    if (cell && cell.terrain === 'copertura') {
        playSpecialVFX(targetEntity, '#00ff88', 'COPERTO!');
        return Math.max(0, baseDmg - 1);
    }
    return baseDmg;
}


markScriptAsLoaded('terreni.js');