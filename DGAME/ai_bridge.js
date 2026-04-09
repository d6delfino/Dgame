/**
 * ai_bridge.js - VERSIONE INTEGRATA (Diagnosi + Puntamento)
 */

let deepAI = null;

// ============================================================
// 1. CARICAMENTO MODELLO (Mancava nel tuo ultimo file!)
// ============================================================
async function initDeepAI() {
    console.log("[DeepAI] Caricamento modello...");
    try {
        const modelResponse = await fetch('model_output/model.json');
        if (!modelResponse.ok) throw new Error("model.json non trovato");
        const modelConfig = await modelResponse.json();

        const weightsResponse = await fetch('model_output/model.weights.bin');
        const weightsBuffer = await weightsResponse.arrayBuffer();

        // Ricreazione automatica dell'architettura
        const layers = [];
        modelConfig.config.layers.forEach(l => {
            if (l.class_name === 'Dense') {
                layers.push(tf.layers.dense({
                    units: l.config.units,
                    activation: l.config.activation,
                    inputShape: l.config.batch_input_shape ? [l.config.batch_input_shape[1]] : undefined
                }));
            } else if (l.class_name === 'Dropout') {
                layers.push(tf.layers.dropout({ rate: l.config.rate }));
            }
        });

        deepAI = new DeepAI(); // Crea l'istanza della classe in deep_ai.js
        deepAI.model = tf.sequential({ layers });

        // Caricamento pesi
        const float32Array = new Float32Array(weightsBuffer);
        const modelWeights = deepAI.model.getWeights();
        const newWeights = [];
        let offset = 0;
        modelWeights.forEach(w => {
            const size = w.size;
            newWeights.push(tf.tensor(float32Array.slice(offset, offset + size), w.shape));
            offset += size;
        });

        deepAI.model.setWeights(newWeights);
        deepAI.model.compile({ optimizer: tf.train.adam(0.0005), loss: 'meanSquaredError' });
        deepAI.epsilon = 0.05; // 5% esplorazione, 95% intelligenza

        console.log("✅ AI CARICATA E PRONTA!");
    } catch (err) {
        console.error("❌ Errore caricamento AI:", err);
    }
}

// ============================================================
// 2. ESECUZIONE TURNO (Versione Unica con Diagnosi)
// ============================================================
async function executeDeepAITurn() {
    if (!deepAI) return false;

    // Trova agenti con AP
    const myAgents = players[currentPlayer]?.agents.filter(a => a.hp > 0 && a.ap > 0);
    if (!myAgents || myAgents.length === 0) {
        console.log("[AI Bridge] Nessun agente con AP. Passo.");
        endTurn();
        return true;
    }

    // 1. Snapshot dello stato
    const stateVec = deepAI.getState();
    
    // 2. Diagnosi: Cosa pensa la rete?
    const logits = tf.tidy(() => deepAI.model.predict(tf.tensor2d([stateVec])).dataSync());
    const action = deepAI.chooseAction(stateVec);
    
    console.log(`[AI] MOVE:${logits[0].toFixed(2)} | SHOOT:${logits[1].toFixed(2)} | END:${logits[2].toFixed(2)} -> Scelta: ${action}`);

    // 3. Esecuzione
    if (action === 2) {
        console.log("[AI] Decisione: Fine Turno");
        endTurn();
        return true;
    }

    // Sceglie l'agente con più AP (come nel training)
    selectedAgent = myAgents.reduce((best, a) => a.ap > best.ap ? a : best, myAgents[0]);

    const mode = action === 0 ? 'move' : 'shoot';
    setActionMode(mode);

    // Piccolo delay per permettere al gioco di popolare validActionTargets
    await new Promise(r => setTimeout(r, 20));

    if (validActionTargets.length === 0) {
        console.warn(`[AI] Azione ${mode} scelta ma 0 target! Provo alternativa...`);
        setActionMode(mode === 'move' ? 'shoot' : 'move');
        await new Promise(r => setTimeout(r, 20));
    }

    if (validActionTargets.length > 0) {
        let chosenTarget;
        if (currentActionMode === 'shoot') {
            // Logica puntamento intelligente: preferisce nemico con meno HP
            const agentTargets = validActionTargets.filter(t => t.isEnemy && !t.isObstacle && !t.isHQ);
            if (agentTargets.length > 0) {
                chosenTarget = agentTargets.reduce((best, t) => {
                    const hp = grid.get(getKey(t.q, t.r))?.entity?.hp ?? 99;
                    const bh = grid.get(getKey(best.q, best.r))?.entity?.hp ?? 99;
                    return hp < bh ? t : best;
                }, agentTargets[0]);
            } else {
                chosenTarget = validActionTargets[Math.floor(Math.random() * validActionTargets.length)];
            }
        } else {
            // Movimento: casuale tra le celle valide
            chosenTarget = validActionTargets[Math.floor(Math.random() * validActionTargets.length)];
        }

        const cell = grid.get(getKey(chosenTarget.q, chosenTarget.r));
        if (cell) {
            console.log(`[AI] Eseguo ${currentActionMode} su ${chosenTarget.q},${chosenTarget.r}`);
            executeAction(cell);
        }
    } else {
        console.log("[AI] Nessuna mossa possibile. Fine turno forzata.");
        endTurn();
    }

    return true;
}

// ============================================================
// 3. INIT
// ============================================================
window.addEventListener('load', () => {
    initDeepAI().catch(err => console.error('[DeepAI] Errore init:', err));
});