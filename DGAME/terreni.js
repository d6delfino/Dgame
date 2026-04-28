/* ============================================================
   terreni.js — Modulo Terreni Speciali
   ============================================================
   1) ALTURA:    +1 Gittata di tiro
   2) NEBBIA:    Può essere colpita solo da distanza 1
   3) FANGO:     Movimento limitato a 1 passo
   4) COPERTURA: Riduce il danno subito di 1 (minimo 0)

   DIPENDE DA: gamelogic.js (registerMoveCalculator,
                              registerDamageModifier)
   DEVE essere caricato DOPO gamelogic.js in index.html.

   Nota: calculateDamageWithTerrain è stata rimossa — la logica
   di copertura è ora registrata come registerDamageModifier, in
   linea con il pattern usato da carduse.js per scudo e immunità.
   Nessun altro file deve chiamare calculateDamageWithTerrain.
   ============================================================ */

const TERRAINS = {
    altura:    { id: 'altura',    icon: '⛰️', color: 'rgba(200, 200, 200, 0.01)', name: 'Altura',    prob: 0.08 },
    nebbia:    { id: 'nebbia',    icon: '🌫️', color: 'rgba(100, 100, 150, 0.01)', name: 'Nebbia',    prob: 0.08 },
    fango:     { id: 'fango',     icon: '🟤', color: 'rgba(80, 50, 20, 0.01)',    name: 'Fango',     prob: 0.08 },
    copertura: { id: 'copertura', icon: '🛡️', color: 'rgba(0, 200, 100, 0.01)',  name: 'Copertura', prob: 0.08 },
};

/**
 * Assegna i terreni alle celle vuote della griglia.
 * Chiamata alla fine della generazione procedurale (map.js).
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
// MOVE CALCULATOR — Fango (restrizione movimento)
// ============================================================
// Se l'agente si trova su fango, può muoversi di 1 solo passo
// indipendentemente dal suo valore mov.
// Registrato tramite la pipeline standard: non sovrascrive
// calculateValidMoves, ma viene chiamato prima di esso.

registerMoveCalculator(function (agent) {
    const agentCell = grid.get(getKey(agent.q, agent.r));
    if (!agentCell || agentCell.terrain !== 'fango') return null;  // delega

    const targets = [];
    hexDirections.forEach(function (dir) {
        const nq   = agent.q + dir.q;
        const nr   = agent.r + dir.r;
        const cell = grid.get(getKey(nq, nr));
        if (cell && cell.type === 'empty' && !cell.entity) {
            targets.push({ q: nq, r: nr });
        }
    });
    return targets;   // array (anche vuoto) → blocca il calcolo BFS standard
});


// ============================================================
// DAMAGE MODIFIER — Copertura (riduzione danno)
// ============================================================
// Riduce di 1 il danno ricevuto (minimo 0) solo per gli AGENTI
// che si trovano su una cella di tipo 'copertura'.
// Registrato qui — gamelogic.js non conosce l'esistenza di
// questo terreno e non va modificato quando si aggiungono
// nuovi terreni difensivi.

registerDamageModifier(function (dmg, target) {
    // Solo agenti (non HQ, non muri/barricate)
    if (!target || target.type !== 'agent') return dmg;

    const cell = grid.get(getKey(target.q, target.r));
    if (!cell || cell.terrain !== 'copertura') return dmg;

    playSpecialVFX(target, '#00ff88', 'COPERTO!');
    return Math.max(0, dmg - 1);
});


markScriptAsLoaded('terreni.js');
