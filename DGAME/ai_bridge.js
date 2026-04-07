/**
 * ai_bridge.js
 * Collega il modello DeepAI allenato al sistema di gioco.
 */

let deepAI = null;

async function initDeepAI() {
    try {
        console.log("🔄 Caricamento modello da model_output/...");
        
        // Carica il file model.json come TESTO
        const modelResponse = await fetch('model_output/model.json');
        if (!modelResponse.ok) throw new Error(`HTTP ${modelResponse.status}`);
        const modelText = await modelResponse.text();
        const modelConfig = JSON.parse(modelText);
        
        console.log("✅ model.json caricato");
        console.log("   Type:", typeof modelConfig);
        console.log("   Keys principali:", Object.keys(modelConfig).slice(0, 10));
        console.log("   Struttura:", JSON.stringify(modelConfig).substring(0, 300));
        
        // DEBUG: Stampa la struttura completa
        if (modelConfig.config) {
            console.log("   ✅ Ha 'config'");
            console.log("   config.layers:", modelConfig.config.layers ? modelConfig.config.layers.length : "non esiste");
        } else if (modelConfig.layers) {
            console.log("   ✅ Ha 'layers' (direttamente)");
            console.log("   layers count:", modelConfig.layers.length);
        } else {
            console.log("   ❌ Non ha né 'config' né 'layers'");
            console.log("   Contenuto completo:", modelConfig);
        }
        
        // Carica il file model.weights.bin
        const weightsResponse = await fetch('model_output/model.weights.bin');
        if (!weightsResponse.ok) throw new Error(`HTTP ${weightsResponse.status}`);
        const weightsBuffer = await weightsResponse.arrayBuffer();
        
        console.log(`✅ model.weights.bin caricato (${weightsBuffer.byteLength} bytes)`);
        
        // Determina dove sono i layers
        const layersArray = modelConfig.config?.layers || modelConfig.layers;
        if (!layersArray) {
            throw new Error("Non riesco a trovare i layers nel modello");
        }
        
        // Ricrea il modello layer per layer
        console.log("🔄 Ricreazione modello...");
        deepAI = new DeepAI();
        
        const layers = [];
        for (let i = 0; i < layersArray.length; i++) {
            const layerConfig = layersArray[i];
            
            if (layerConfig.class_name === 'Dense') {
                layers.push(tf.layers.dense({
                    units: layerConfig.config.units,
                    activation: layerConfig.config.activation,
                    inputShape: layerConfig.config.batch_input_shape ? 
                        [layerConfig.config.batch_input_shape[1]] : undefined
                }));
                console.log(`   ✅ Dense layer (${layerConfig.config.units} unità)`);
            } else if (layerConfig.class_name === 'Dropout') {
                layers.push(tf.layers.dropout({
                    rate: layerConfig.config.rate
                }));
                console.log(`   ✅ Dropout layer (rate=${layerConfig.config.rate})`);
            }
        }
        
        // Crea il modello Sequential
        deepAI.model = tf.sequential({ layers });
        console.log("✅ Modello creato");
        
        // Carica i pesi
        console.log("🔄 Caricamento pesi...");
        const float32Array = new Float32Array(weightsBuffer);
        const modelWeights = deepAI.model.getWeights();
        console.log(`   Pesi nel modello: ${modelWeights.length}`);
        
        const newWeights = [];
        let offset = 0;
        
        for (let i = 0; i < modelWeights.length; i++) {
            const w = modelWeights[i];
            const size = w.size;
            const slice = float32Array.slice(offset, offset + size);
            newWeights.push(tf.tensor(slice, w.shape));
            offset += size;
        }
        
        deepAI.model.setWeights(newWeights);
        newWeights.forEach(w => w.dispose());
        console.log("✅ Pesi caricati");
        
        // Compila il modello
        deepAI.model.compile({
            optimizer: tf.train.adam(0.0005),
            loss: 'meanSquaredError'
        });
        deepAI.epsilon = 0;
        
        console.log("✅✅✅ AI CARICATA CORRETTAMENTE ✅✅✅");
        return;
        
    } catch (err) {
        console.error("❌ Errore caricamento modello:", err.message);
        console.error("   Stack:", err.stack);
    }

    console.log("⚠️ Nessun modello trovato — uso AI regola-based");
    deepAI = null;
}

async function executeDeepAITurn() {
    if (!deepAI) return false;

    const agent = players[currentPlayer]?.agents.find(a => a.hp > 0 && a.ap > 0);
    if (!agent) return false;

    selectedAgent = agent;
    const stateVec = deepAI.getState();
    const action   = deepAI.chooseAction(stateVec);

    if (action === 2) {
        endTurn();
        return true;
    }

    if (action === 0) setActionMode('move');
    if (action === 1) setActionMode('shoot');

    if (validActionTargets.length > 0) {
        const target = validActionTargets[Math.floor(Math.random() * validActionTargets.length)];
        const cell   = grid.get(getKey(target.q, target.r));
        if (cell) executeAction(cell);
    }

    return true;
}

window.addEventListener('load', () => {
    if (typeof initDeepAI === 'function') {
        initDeepAI().catch(err => console.error("❌ Errore AI:", err));
    }
});