/* ============================================================
   ai_bridge.js - VERSIONE INTEGRATA (Diagnosi, Loop e Puntamento)
   ============================================================ */

let deepAI = null;

// ============================================================
// 1. CARICAMENTO MODELLO
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

        deepAI = new DeepAI(); 
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
        
        // Epsilon basso per il gioco reale: 2% di mosse casuali, 98% rete neurale
        deepAI.epsilon = 0.02; 

        console.log("✅ DEEP AI CARICATA E PRONTA!");
    } catch (err) {
        console.error("❌ Errore caricamento AI:", err);
    }
}

// ============================================================
// 2. ESECUZIONE TURNO CONTINUO (Loop In-Game)
// ============================================================
async function executeDeepAITurn() {
    if (!deepAI || !deepAI.model) return false;
    console.log(`[DeepAI] Turno Fazione ${currentPlayer} - Inizio`);

    let safetyCounter = 0;
    const MAX_ACTIONS_PER_TURN = 15; // Limite per evitare loop infiniti

    while (state === 'PLAYING' && safetyCounter < MAX_ACTIONS_PER_TURN) {
        safetyCounter++;

        // 1. Filtra agenti che possono ancora agire
        const myAgents = players[currentPlayer]?.agents.filter(a => a.hp > 0 && a.ap > 0);
        if (!myAgents || myAgents.length === 0) {
            console.log("[DeepAI] Nessun agente con AP rimasti. Fine turno.");
            break;
        }

        const stateVec = deepAI.getState();
        const logits = tf.tidy(() => deepAI.model.predict(tf.tensor2d([stateVec])).dataSync());
        let action = deepAI.chooseAction(stateVec);

        console.log(`[DeepAI] Logits: M:${logits[0].toFixed(1)} S:${logits[1].toFixed(1)} E:${logits[2].toFixed(1)} -> Scelta: ${action}`);

        // Scelta di terminare il turno
        if (action === 2) {
            // Impediamo di chiudere il turno se tutti gli agenti hanno AP pieni (forziamo l'esplorazione)
            if (myAgents.every(a => a.ap >= 2)) {
                action = logits[0] > logits[1] ? 0 : 1; 
                console.log(`[DeepAI] Override: Impedisco Fine Turno prematuro, forzo azione ${action}`);
            } else {
                break; 
            }
        }

        // Seleziona l'agente con più AP
        selectedAgent = myAgents.reduce((best, a) => a.ap > best.ap ? a : best, myAgents[0]);
        const mode = action === 0 ? 'move' : 'shoot';
        setActionMode(mode);

        await new Promise(r => setTimeout(r, 50)); // Attesa calcolo validActionTargets

        if (validActionTargets.length > 0) {
            const chosenTarget = validActionTargets[Math.floor(Math.random() * validActionTargets.length)];
            const cell = grid.get(getKey(chosenTarget.q, chosenTarget.r));
            if (cell) {
                executeAction(cell);
                drawGame();
                await new Promise(r => setTimeout(r, 600)); 
            }
        } else {
            // Se l'azione scelta non ha bersagli, non chiudiamo il turno!
            // Riduciamo gli AP dell'agente corrente per "passare" a un altro o un'altra azione
            console.warn(`[DeepAI] Agente ${selectedAgent.id} non può fare ${mode}. Cambio...`);
            selectedAgent.ap -= 1; 
        }
    }

    endTurn();
    return true;
}

// ============================================================
// 3. INIT
// ============================================================
window.addEventListener('load', () => {
    initDeepAI().catch(err => console.error('[DeepAI] Errore init:', err));
});