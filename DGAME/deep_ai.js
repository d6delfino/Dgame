/**
 * deep_ai.js  (versione browser) — DEFINITIVA SISTEMATA
 * 
 * RISOLVE: Errore conflict naming (dense_Dense1/kernel_1)
 * SINCRONIZZATO: getState() 50 valori con divisori costanti
 */

const STATE_SIZE  = 50;
const ACTION_SIZE = 3;
const GRID_R      = 9;
const MAX_AGENTS  = 3;

class DeepAI {
    constructor(existingModel = null) {
        // Se passiamo un modello caricato da file, usiamo quello.
        // Altrimenti ne creiamo uno nuovo (necessario per il training).
        this.model = existingModel || this.createModel();
        
        // Il targetModel serve solo per l'addestramento. 
        // In gioco lo impostiamo a null se stiamo usando un modello caricato.
        this.targetModel = existingModel ? null : this.createModel();
        
        if (!existingModel) {
            this._syncTarget();
        }

        this.memory       = [];
        this.gamma        = 0.95;
        this.epsilon      = 0.02; // Default basso per il gioco
        this.epsilonMin   = 0.10;
        this.epsilonDecay = 0.9995;
        this.batchSize    = 64;
        this.memoryLimit  = 20000;
        this.stepCount    = 0;
        this.targetUpdateFreq = 300;
    }

    createModel() {
        const model = tf.sequential();
        model.add(tf.layers.dense({ units: 256, inputShape: [STATE_SIZE], activation: 'relu' }));
        model.add(tf.layers.dropout({ rate: 0.2 }));
        model.add(tf.layers.dense({ units: 256, activation: 'relu' }));
        model.add(tf.layers.dropout({ rate: 0.2 }));
        model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
        model.add(tf.layers.dropout({ rate: 0.1 }));
        model.add(tf.layers.dense({ units: 64,  activation: 'relu' }));
        model.add(tf.layers.dense({ units: ACTION_SIZE, activation: 'linear' }));
        
        // Optimizer e Loss devono corrispondere a quelli del training
        model.compile({
            optimizer: tf.train.adam(0.0003),
            loss: 'meanSquaredError'
        });
        return model;
    }

    _syncTarget() {
        if (this.targetModel && this.model) {
            this.targetModel.setWeights(this.model.getWeights());
        }
    }

    /**
     * Stato a 50 valori.
     * Legge i dati dai globali: players, currentPlayer, controlPoints, grid.
     */
    getState() {
        const vec     = Array(STATE_SIZE).fill(0);
        const faction = currentPlayer;

        const hd = (a, b) =>
            (Math.abs(a.q-b.q) + Math.abs(a.q+a.r-b.q-b.r) + Math.abs(a.r-b.r)) / 2;

        const myAgents = (players[faction]?.agents ?? [])
            .filter(a => a.hp > 0)
            .sort((a, b) => b.hp - a.hp);

        const enemyAgents = Object.values(players)
            .filter(p => p.agents)
            .flatMap(p => p.agents)
            .filter(a => a.faction !== faction && a.hp > 0)
            .sort((a, b) => a.hp - b.hp);

        if (myAgents.length === 0) return vec;

        // [0-17] Miei agenti (max 3 x 6)
        for (let i = 0; i < Math.min(myAgents.length, MAX_AGENTS); i++) {
            const a = myAgents[i], off = i * 6;
            vec[off+0] = a.q  / GRID_R;
            vec[off+1] = a.r  / GRID_R;
            vec[off+2] = a.hp / 5;
            vec[off+3] = a.ap / 3;
            vec[off+4] = (a.rng ?? 3) / 9;
            vec[off+5] = (a.dmg ?? 1) / 4;
        }

        // [18-32] Agenti nemici (max 3 x 5)
        for (let i = 0; i < Math.min(enemyAgents.length, MAX_AGENTS); i++) {
            const a = enemyAgents[i], off = 18 + i * 5;
            vec[off+0] = a.q  / GRID_R;
            vec[off+1] = a.r  / GRID_R;
            vec[off+2] = a.hp / 5;
            vec[off+3] = (a.rng ?? 3) / 9;
            vec[off+4] = (a.dmg ?? 1) / 4;
        }

        // [33] HQ mio - Normalizzato su 30 (HP iniziali HQ)
        const myHQ = players[faction]?.hq;
        vec[33] = myHQ ? (myHQ.hp / 30) : 0;

        // [34-36] HQ nemico
        const enemyHQ = Object.values(players)
            .filter(p => p.hq && p.faction !== faction && !p.isDisconnected)
            .map(p => p.hq)
            .find(hq => hq && hq.hp > 0);
        if (enemyHQ) {
            vec[34] = enemyHQ.q / GRID_R;
            vec[35] = enemyHQ.r / GRID_R;
            vec[36] = enemyHQ.hp / 30;
        }

        // [37-44] CP
        let cpIdx = 0;
        if (typeof controlPoints !== 'undefined') {
            controlPoints.forEach(cp => {
                if (cpIdx >= 4) return;
                const off  = 37 + cpIdx * 2;
                const minD = Math.min(...myAgents.map(a => hd(a, cp)));
                vec[off+0] = minD / 20;
                vec[off+1] = cp.faction === 0 ? 0 : (cp.faction === faction ? 0.5 : 1.0);
                cpIdx++;
            });
        }

        // [45-47] Contesto
        vec[45] = Math.min((players[faction]?.credits ?? 0) / 10, 1);
        let myCPs = 0, enemyCPs = 0;
        if (typeof controlPoints !== 'undefined') {
            controlPoints.forEach(cp => {
                if (cp.faction === faction) myCPs++;
                else if (cp.faction !== 0)  enemyCPs++;
            });
        }
        vec[46] = myCPs    / 4;
        vec[47] = enemyCPs / 4;

        // [48-49] Distanze chiave
        if (myAgents.length > 0 && enemyAgents.length > 0) {
            vec[48] = Math.min(...myAgents.flatMap(m => enemyAgents.map(e => hd(m, e)))) / 20;
        } else {
            vec[48] = 1.0;
        }
        if (myAgents.length > 0 && enemyHQ) {
            vec[49] = Math.min(...myAgents.map(a => hd(a, enemyHQ))) / 20;
        } else {
            vec[49] = 1.0;
        }

        return vec;
    }

    chooseAction(stateVec) {
        if (Math.random() < this.epsilon) return Math.floor(Math.random() * ACTION_SIZE);
        return tf.tidy(() => {
            const input = tf.tensor2d([stateVec]);
            const prediction = this.model.predict(input);
            return prediction.argMax(1).dataSync()[0];
        });
    }

    // Le funzioni remember e replay sono presenti per completezza se volessi 
    // abilitare l'apprendimento "on-the-fly" nel browser, ma non sono necessarie per giocare.
}