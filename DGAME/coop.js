/* ============================================================
   coop.js — Modalità COOPERATIVA Online/Locale (Versione Definitiva NATIVA)
   ============================================================
   Aggiunge la modalità "COOP" al menu principale.
   Tutti i giocatori (fazioni 1-N) cooperano contro i mostri
   viola (fazione 9, AI nativa) con l'obiettivo di raggiungere e
   sconfiggere il BOSS sul lato opposto della mappa o uscire.

   DIPENDENZE: constants.js, core.js, gamelogic.js, map.js, ai.js, 
               setup.js, network_core.js, network_sync.js, main.js
   ============================================================ */

// ============================================================
// COSTANTI COOP
// ============================================================
const COOP = {
    FOG_ALPHA:          0.99,   // opacità del velo nero (0=trasparente, 1=opaco)
    FOG_ALPHA_EXPLORED: 0.55,   // opacità celle già visitate ma fuori visuale
    STARTING_CREDITS:    10,    // crediti da spendere nel setup iniziale

    VILLAGE_COUNT:        5,    // numero di villaggi sulla mappa
    VILLAGE_MIN_HQ_DIST:  8,    // distanza minima dallo spawn
    VILLAGE_RECRUIT_COST: 4,    // crediti per reclutare un agente in un villaggio
    VILLAGE_MAX_AGENTS:   3,    // massimo agenti reclutabili per villaggio

    QUEST_COUNT:          4,    // numero di quest attive contemporaneamente

    LAIR_COUNT:           6,    // numero di tane sulla mappa
    LAIR_MIN_HQ_DIST:     6,    // distanza minima dallo spawn
    LAIR_SPAWN_INTERVAL:  3,    // ogni quanti turni la tana spawna un mostro
    LAIR_MAX_MONSTERS_BASE: 1,  // Base fissa per tana
    LAIR_MAX_MONSTERS_PER_PLAYER: 2, // Moltiplicatore per giocatore
    LAIR_REWARD_KILL:     4,    // crediti guadagnati uccidendo un mostro

    MONSTER_HP_MIN:       2,
    MONSTER_HP_MAX:       5,
    MONSTER_MOV:          2,
    MONSTER_RNG_MIN:      2,
    MONSTER_RNG_MAX:      4,
    MONSTER_DMG_MIN:      1,
    MONSTER_DMG_MAX:      3,
    MONSTER_CARDS_TURN:  11,    // turno da cui i mostri usano le carte (11)

    BOSS_HP_MULT:         5,    // moltiplicatore HP rispetto a un mostro normale
    BOSS_MOV_MULT:        2,    // moltiplicatore Passi
    BOSS_RNG_MULT:        2,    // moltiplicatore Gittata
    BOSS_DMG_MULT:        2,    // moltiplicatore Danno
    BOSS_AP:              4,    // AP del boss per turno
    BOSS_REWARD:         20,    // crediti guadagnati sconfiggendo il boss

    MONSTER_FACTION:      9,    // Fazione AI che controlla i mostri
};

// ============================================================
// STATO COOP
// ============================================================
window.coopState = {
    active:        false,
    villages:      [],
    lairs:         [],
    quests:        [],
    bossSpawned:   false,
    bossAgent:     null,
    exitZone:      [],
    playersInExit: new Set(),
    turnCount:     0,
    monstersKilled: 0,
    cellsExplored: new Set(),
    lairsDestroyed: 0,
    villagesFound: 0,
    bigMonstersKilled: 0,
    bossesDefeated: 0,      // <--- AGGIUNTO: quanti boss sono morti
    totalBossesToKill: 0,   // <--- AGGIUNTO: quanti boss totali devono spawnare
    survivor:      null, // {q, r, carrierId: null}
    drone:         null, // {q, r, analyzerId: null, turns: 0}
};

//const _COOP_MONSTER_SPRITES = SPRITE_POOLS[2] || ['👾','🤖','👹'];

const _COOP_QUEST_DEFS = [
    { id: 'kill_monsters',  text: 'Elimina 15 mostri', type: 'kill', target: 15, reward: 10 },
    { id: 'explore_cells',  text: 'Esplora 300 celle', type: 'explore', target: 300, reward: 8 },
    { id: 'reach_center',   text: 'Raggiungi il centro della mappa', type: 'position', target: 3, reward: 8 },
    { id: 'kill_lair',      text: 'Distruggi 5 tane di mostri', type: 'kill_lair', target: 5, reward: 20 },
    { id: 'kill_big',       text: 'Elimina 5 mostri elite (5+ HP)', type: 'kill_big', target: 5, reward: 15 },
    { id: 'explore_all',    text: 'Scopri tutti i villaggi', type: 'explore_village', target: COOP.VILLAGE_COUNT, reward: 10 },
    { id: 'kill_4_one_turn',text: 'Uccidi 4 mostri in un turno con un solo agente', type: 'kill_4_one_turn', target: 4, reward: 20, progress: 0, _turnKills: {} },
    { id: 'recruit_2',      text: 'Recluta 2 agenti nei villaggi', type: 'recruit_village', target: 2, reward: 12 },
    { id: 'control_3_cp',   text: 'Controlla 3 punti di controllo contemporaneamente', type: 'control_3cp', target: 3, reward: 15 },
    { id: 'explore_corners', text: 'Esplora i 4 angoli della mappa', type: 'explore_corners', target: 4, reward: 15, _cornersFound: new Set() },
    { id: 'rescue_survivor',text: 'Salva il sopravvissuto e portalo all\'uscita o in un villaggio', type: 'rescue', target: 1, reward: 25 },
    { id: 'recover_data',   text: 'Analizza il drone: resta adiacente 2 turni senza subire danni', type: 'data', target: 2, reward: 15 },
    { id: 'infect_lair', text: 'Inietta il virus in una Tana (cliccaci stando adiacente)', type: 'infect', target: 1, reward: 10 },
    { id: 'tame_monster', text: 'Cura un mostro ferito: diventa tuo alleato', type: 'tame', target: 1, reward: 10 },
];

// ============================================================
// HOOK DI INTEGRAZIONE MOTORE NATIVO
// ============================================================

/** 1. Fa credere al motore che la fazione 9 sia controllata dall'AI */
(function _installCoopAIHook() {
    const _origIsAI = window.isCurrentPlayerAI;
    window.isCurrentPlayerAI = function() {
        if (coopState.active && currentPlayer === COOP.MONSTER_FACTION) return true;
        if (_origIsAI) return _origIsAI();
        return false;
    };
})();

/** 2. Disabilita la vittoria per eliminazione HQ e instaura la logica Coop */
(function _installCoopWinHook() {
    const _origCheckWin = window.checkWinConditions;
    window.checkWinConditions = function() {
        if (coopState.active) {
            _coopCheckExitVictory();
            
            // Check Sconfitta: Tutti gli umani morti
            let allDead = true;
            for (let p = 1; p <= window._coopHumanPlayers; p++) {
                if (players[p] && Array.isArray(players[p].agents) && players[p].agents.some(a => a.hp > 0)) {
                    allDead = false;
                }
            }
            if (allDead) _coopDefeat();
            return;
        }
        if (_origCheckWin) _origCheckWin();
    };
})();

/** 3. Hook standard per turno e rendering */
function _coopRegisterHooks() {
    // Esegue lo spawn e l'aggiornamento solo all'inizio del giro (Primo giocatore umano vivo)
    registerTurnResetHook(function () {
        if (!coopState.active) return;

        // Trova il primo giocatore umano ancora in partita
        let firstAliveHuman = 1;
        for (let p = 1; p <= window._coopHumanPlayers; p++) {
            if ((players[p].agents || []).some(a => a.hp > 0)) {
                firstAliveHuman = p;
                break;
            }
        }

        // --- LOGICA INIZIO ROUND ---
        if (currentPlayer === firstAliveHuman) {
            // Gestione indipendente e sicura del turno Coop (risolve il blocco se P1 muore)
            coopState.turnCount++; 
            
            // Esegui lo spawn in modalità sicura
            try {
                _coopSpawnMonsters();
            } catch (e) {
                console.error("[Coop Crash] Errore durante lo spawn mostri:", e);
            }
            
            _coopUpdatePositionQuests();
            _coopCheckExitVictory();
            _coopCheckControlPointQuest();

            // --- NUOVO: RENDITA VILLAGGI SCOPERTI ---
            if (coopState.villagesFound > 0) {
                const villageBonus = coopState.villagesFound * 2;
                
                for (let p = 1; p <= window._coopHumanPlayers; p++) {
                    if (players[p]) {
                        players[p].credits = (players[p].credits || 0) + villageBonus;
                    }
                }

                // Notifica visiva della rendita
                if (typeof showNotificationBanner === 'function') {
                    showNotificationBanner(`🏘️ Supporto Villaggi: +${villageBonus} crediti`, "#00ff88", {
                        duration: 3000,
                        bottom: '140px' 
                    });
                }
            }
        }

        // --- LOGICA TURNO MOSTRI (Fazione 9) ---
        if (currentPlayer === COOP.MONSTER_FACTION) {
            const monsterData = players[COOP.MONSTER_FACTION];

            // 1. ATTIVAZIONE CARTE (dal Turno 11)
            if (coopState.turnCount >= COOP.MONSTER_CARDS_TURN) {
                if (monsterData.cards.length === 0) {
                    monsterData.cards = ['C04', 'C07', 'C05'];
                    if (typeof showNotificationBanner === 'function') {
                        showNotificationBanner("⚠️ ATTENZIONE: I mostri hanno evoluto nuove capacità!", players[COOP.MONSTER_FACTION].color, {duration: 4000});
                    }
                }
                
            }

            // 2. RENDITA ECONOMICA (Basata sulle Tane e sul Boss)
            let income = 0;
            // +1 per ogni tana integra
            coopState.lairs.forEach(lair => {
                const cell = grid.get(getKey(lair.q, lair.r));
                if (cell && cell.entity && cell.entity._isLair) income += 1;
            });
            // +2 se il Boss è vivo
            if (coopState.bossAgent && coopState.bossAgent.hp > 0) income += 2;

            monsterData.credits = (monsterData.credits || 0) + income;
            
            // Log in console per debug
            console.log(`[Coop] Rendita Mostri: +${income} cr (Totale: ${monsterData.credits})`);
        }
    });

    registerDrawHook(function () {
        if (!coopState.active) return;
        _coopDrawFog();
        _coopDrawSpecialCells();
    });
}

/** 4. Intercetta morti per gestire quest, taglie e vittoria boss */
(function _installCoopDeathHook() {
    const _origDeath = window.handleEntityDeath || function(){};
    window.handleEntityDeath = function (entity, killerFaction) {

        // --- NUOVO: SALVA STATISTICHE PRIMA CHE SPARILE ---
        if (coopState.active && entity.type === 'agent' && entity.faction >= 1 && entity.faction <= window._coopHumanPlayers) {
            if (!coopState.lastDeadStats) coopState.lastDeadStats = {};
            coopState.lastDeadStats[entity.faction] = {
                maxHp: entity.maxHp,
                mov: entity.mov,
                rng: entity.rng,
                dmg: entity.dmg,
                sprite: entity.sprite,
                customSpriteId: entity.customSpriteId
            };
        }
        // --------------------------------------------------

        _origDeath(entity, killerFaction);

        if (!coopState.active) return;
        
        // Se muore una tana
        if (entity._isLair) {
            if (typeof showNotificationBanner === 'function') {
                showNotificationBanner('💥 Tana distrutta!', '#ff8800', { top: '80px', duration: 3000 });
            }
            // Marca la tana come distrutta nello stato coop
            const deadLair = coopState.lairs.find(l => l.q === entity.q && l.r === entity.r);
            if (deadLair) deadLair.destroyed = true;
            // Rimuove l'entità dalla cella della griglia
            const lairCell = grid.get(getKey(entity.q, entity.r));
            if (lairCell) { lairCell.entity = null; lairCell._coopLair = false; }
            // Rimuove la tana dall'array agents dei mostri così non viene ritrasmessa dal sync
            const lairIdx = players[COOP.MONSTER_FACTION].agents.findIndex(a => a.id === entity.id);
            if (lairIdx !== -1) players[COOP.MONSTER_FACTION].agents.splice(lairIdx, 1);
            // Sincronizza il client
            if (typeof isOnline !== 'undefined' && isOnline && typeof broadcastToClients === 'function') {
                broadcastToClients({ type: 'COOP_LAIR_DESTROYED', q: entity.q, r: entity.r });
            }
            _coopProgressLairQuest();
        }

        if (entity._isMonster) {
            // Rimosso l'accredito manuale: il motore base (credits.js) 
            // assegna già +2 crediti e mostra il banner per ogni uccisione.

            _coopProgressKillQuest(entity);

            if (entity._isBoss) {
            coopState.bossesDefeated++; // Incrementa il numero di boss uccisi
            coopState.bossAgent = null;

            if (coopState.bossesDefeated < coopState.totalBossesToKill) {
                // --- CASO: CI SONO ALTRI BOSS IN CODA ---
                const bossRestanti = coopState.totalBossesToKill - coopState.bossesDefeated;
                
                if (typeof showNotificationBanner === 'function') {
                    showNotificationBanner(
                        `💀 BOSS ABBATTUTO!<br><span style="color:#ff3333">ATTENZIONE: Un nuovo predatore sta arrivando!</span><br>(${bossRestanti} rimanenti)`,
                        '#ff8800', { top: '50px', duration: 5000, fontSize: '18px' }
                    );
                }
                
                // Facciamo spawnare il prossimo boss dopo un breve ritardo (2 secondi)
                setTimeout(() => {
                    _coopSpawnBoss();
                    drawGame();
                }, 2000);

            } else {
                // --- CASO: ULTIMO BOSS SCONFITTO ---
                _coopBossDefeated(killerFaction);
            }
            return;
        }

            const idx = players[COOP.MONSTER_FACTION].agents.findIndex(m => m.id === entity.id);
            if (idx !== -1) players[COOP.MONSTER_FACTION].agents.splice(idx, 1);
        }

        _coopUpdateHUD();
    };
})();

/** 5. Clic su mappa per Villaggi (Le Tane ora vengono gestite solo dai danni) */
(function _installCoopClickHook() {
    setTimeout(() => {
        const _actualOrigClick = window.handleCanvasClick;
        window.handleCanvasClick = function (e) {
            if (!coopState.active) { _actualOrigClick(e); return; }

            const rect  = canvas.getBoundingClientRect();
            const cX    = (e.clientX || e.pageX) - rect.left;
            const cY    = (e.clientY || e.pageY) - rect.top;
            const hex   = pixelToHex(cX, cY);
            const cell  = grid.get(getKey(hex.q, hex.r));

            const actingPlayer = (typeof isOnline !== 'undefined' && isOnline && !isHost) ? myPlayerNumber : currentPlayer;

            if (!cell || !selectedAgent || selectedAgent.faction !== actingPlayer || currentPlayer !== actingPlayer) {
                _actualOrigClick(e); return;
            }

            const dist = hexDistance(selectedAgent, cell);

            /// --- VILLAGGIO ---
            const isVillage = coopState.villages.some(v => v.q === hex.q && v.r === hex.r);
            const villageOccupiedByEnemy = cell.entity && cell.entity.faction !== actingPlayer;
            if (isVillage && dist <= 1 && !villageOccupiedByEnemy) {
                _coopEnterVillage(actingPlayer, { q: cell.q, r: cell.r });
                return;
            }

            // --- INFEZIONE VIRALE (QUEST) ---
            const isLair = cell.entity && cell.entity._isLair;
            const infectQuest = coopState.quests.find(q => q.type === 'infect' && !q.completed);
            
            if (isLair && infectQuest && dist <= 1) {
                if (typeof isOnline !== 'undefined' && isOnline && !isHost) {
                    sendOnlineMessage({ type: 'COOP_INFECT_REQ', q: cell.q, r: cell.r, faction: actingPlayer });
                } else {
                    _coopApplyInfection(cell.q, cell.r, actingPlayer);
                }
                return;
            }

            _actualOrigClick(e);
        };
    }, 500);
})();

// Funzione Helper per applicare l'infezione
function _coopApplyInfection(q, r, faction) {
    const lair = coopState.lairs.find(l => l.q === q && l.r === r);
    if (!lair || lair.destroyed) return;

    // Blocca lo spawn della tana per 5 turni
    lair.infectedTurns = 5;
    
    if (typeof playSFX === 'function') playSFX('heal');
    if (typeof showNotificationBanner === 'function') {
        showNotificationBanner('🦠 Tana Infettata! (Spawn bloccato per 5 turni)', '#00ff88', { top: '80px', duration: 4000 });
    }

    const quest = coopState.quests.find(q => q.type === 'infect');
    if (quest && !quest.completed) {
        quest.progress = 1;
        _coopCompleteQuest(quest);
    }

    if (typeof isOnline !== 'undefined' && isOnline && isHost) {
        broadcastToClients({ type: 'COOP_INFECT_SYNC', q, r });
    }
    drawGame();
}

// ============================================================
// ADDOMESTICAMENTO MOSTRI
// ============================================================

function _coopTameMonster(monster, tamerFaction) {
    if (!monster || monster.faction !== COOP.MONSTER_FACTION) return;

    // 1. Rimuovi dalla fazione mostri
    const monsterIdx = players[COOP.MONSTER_FACTION].agents.findIndex(a => a.id === monster.id);
    if (monsterIdx !== -1) players[COOP.MONSTER_FACTION].agents.splice(monsterIdx, 1);

    // 2. Cambia fazione e colore cosmético
    monster.faction        = tamerFaction;
    monster._isMonster     = false;   // non conta più come mostro per l'AI
    monster._isTamed       = true;    // flag per identificarlo visivamente
    monster.ap             = GAME.AP_PER_TURN;
    monster.firstTurnImmune = false;

    // 3. Aggiungilo alla fazione del curatore
    players[tamerFaction].agents.push(monster);

    // 4. Effetto visivo
    playSpecialVFX(monster, players[tamerFaction].color, '🐾 ALLEATO!');
    playSFX('heal');
    if (typeof showNotificationBanner === 'function') {
        showNotificationBanner(
            `🐾 Mostro addomesticato da ${players[tamerFaction].name}!`,
            players[tamerFaction].color,
            { top: '80px', duration: 4000 }
        );
    }

    // 5. Completa la quest se attiva
    const quest = coopState.quests.find(q => q.type === 'tame' && !q.completed);
    if (quest) {
        quest.progress = 1;
        _coopCompleteQuest(quest);
    }

    // 6. Sincronizzazione online (solo host)
    if (typeof isOnline !== 'undefined' && isOnline && isHost) {
        broadcastToClients({
            type:         'COOP_TAME_SYNC',
            monsterId:    monster.id,
            tamerFaction: tamerFaction,
        });
    }

    _coopUpdateHUD();
    drawGame();
}

// Hook sull'azione heal: intercetta la cura di un mostro in coop
(function _installCoopTameHook() {
    setTimeout(() => {
        if (typeof registerActionHandler !== 'function') return;

        registerActionHandler('heal', function (targetCell, fromNetwork) {
            if (!coopState.active) return null;
            if (!targetCell) return null;

            const target = targetCell.entity;
            if (!target || target.type !== 'agent') return null;
            if (target.faction !== COOP.MONSTER_FACTION) return null;
            if (target._isLair) return null;
            if (target.hp >= target.maxHp) return null; // non è ferito, cura normale

            // Il mostro è ferito: addomesticalo invece di curarlo
            _coopTameMonster(target, currentPlayer);
            return { success: true, actionCost: 2 };
        });
    }, 600);
})();


// ============================================================
// AVVIO MODALITÀ COOP
// ============================================================

/** 6. Intercetta i danni per resettare la quest del Drone */
(function _installCoopDamageHook() {
    setTimeout(() => {
        if (typeof registerDamageModifier === 'function') {
            registerDamageModifier(function (dmg, target) {
                if (!coopState.active || dmg <= 0 || !target || target.type !== 'agent') return dmg;
                
                // Se l'agente che subisce danno stava analizzando il drone, la procedura si resetta!
                if (coopState.drone && coopState.drone.analyzerId === target.id) {
    
                    // Controlla se la quest del drone è ancora attiva
                    const dataQuest = coopState.quests.find(q => q.type === 'data' && !q.completed);
    
                    if (dataQuest) {
                    // Solo se la quest NON è completata → reset e messaggio
                    coopState.drone.turns = 0;
                    if (typeof showNotificationBanner === 'function') {
                        showNotificationBanner('⚠️ Analisi Dati Interrotta! (Danno subito)', '#ff3333', { top: '100px', duration: 3000 });
                    }
                } else {
                    // Quest già completata → puliamo l'analyzerId per sicurezza
                    coopState.drone.analyzerId = null;
                }
}
                return dmg;
            });
        }
    }, 600);
})();

function startCoopGame(numPlayers) {
    if (typeof campaignState !== 'undefined') campaignState.isActive = false;
    numPlayers = numPlayers || 2;
    window._coopHumanPlayers = numPlayers; 
    
    // LA MAGIA E' QUI: Impostiamo i giocatori totali a 9.
    // 1-8 sono slot per gli umani (ne useremo solo numPlayers). Il 9 è l'AI Mostri.
    // Questo forza generateProceduralMap() a fare la mappa gigante in automatico.
    totalPlayers   = COOP.MONSTER_FACTION; 
    isOnline       = false;
    myPlayerNumber = 0;
    currentPlayer  = 1;

    resetPlayers();

    // Inizializza il profilo fazione 9 (Mostri)
    players[COOP.MONSTER_FACTION] = {
        hq: null, agents: [],
        color: COLORS.p2, name: 'Mostri', 
        credits: 0, // Partono con 0 crediti per il primo acquisto carte al T6
        _cosmeticFaction: 2,
        cards: [] 
    };

    const networkMenu = document.getElementById('network-menu');
    if (networkMenu) networkMenu.style.display = 'none';

    setupData = { points: COOP.STARTING_CREDITS, agents: [] };
    coopState.active = false;

    _coopRegisterHooks();
    updateSetupUI();

    window._origConfirmPlayerSetup = window.confirmPlayerSetup;
    window.confirmPlayerSetup = function () {
        if (!window._coopHumanPlayers) {
            window._origConfirmPlayerSetup();
            return;
        }
        
        playSFX('click');
        const cosmeticFaction = players[currentPlayer]._cosmeticFaction ?? currentPlayer;
        playFactionMusic(cosmeticFaction);
        if (setupData.agents.length === 0) {
            showTemporaryMessage('⚠️ DEVI RECLUTARE ALMENO UN AGENTE!', 3000);
            return;
        }
        
        players[currentPlayer].agents    = JSON.parse(JSON.stringify(setupData.agents));
        players[currentPlayer].cards     = typeof getFinalCardSelection === 'function' ? getFinalCardSelection() : [];
        players[currentPlayer].usedCards = {};
        players[currentPlayer].credits   = setupData.points || 0;

        // Limita il loop del setup solo ai giocatori UMANI reali
        if (currentPlayer < window._coopHumanPlayers) {
            currentPlayer++;
            setupData = { points: COOP.STARTING_CREDITS, agents: [] };
            if (typeof cardSelectionData !== 'undefined') cardSelectionData.selected = [];
            updateSetupUI();
        } else {
            window.confirmPlayerSetup = window._origConfirmPlayerSetup;
            _coopLaunch();
        }
    };
}

// ============================================================
// ASSEGNAZIONE COLORE CASUALE MOSTRI
// ============================================================
function _coopAssignRandomMonsterFaction() {
    const taken = new Set();
    // 1. Raccoglie i colori (cosmeticFaction) scelti dai giocatori umani
    for (let p = 1; p <= window._coopHumanPlayers; p++) {
        if (players[p]) {
            taken.add(players[p]._cosmeticFaction || p);
        }
    }
    
    // 2. Trova quali colori (da 1 a 8) sono ancora liberi
    const available = [];
    for (let i = 1; i <= 8; i++) {
        if (!taken.has(i)) available.push(i);
    }
    
    // 3. Ne sceglie uno a caso (o fallback se per qualche motivo assurdo fossero tutti presi)
    const chosen = available.length > 0 
        ? available[Math.floor(Math.random() * available.length)] 
        : Math.floor(Math.random() * 8) + 1;
    
    // 4. Assegna i metadati alla fazione dei mostri
    const def = _FACTION_DEFS[chosen - 1]; // _FACTION_DEFS viene da constants.js
    
    if (!players[COOP.MONSTER_FACTION]) players[COOP.MONSTER_FACTION] = {};
    players[COOP.MONSTER_FACTION]._cosmeticFaction = chosen;
    players[COOP.MONSTER_FACTION].color = def.color;
    players[COOP.MONSTER_FACTION].name = 'Mostri';
}

/**
 * Sostituisce temporaneamente autoFitMap con una versione che,
 * invece di centrare la mappa intera, zooma sul primo agente della fazione.
 * Si autoripristina dopo la prima chiamata.
 */
function _coopPatchAutoFitForSpawn(playerFaction) {
    const _origAutoFit = window.autoFitMap;
    window.autoFitMap = function() {
        // Ripristina subito l'originale
        window.autoFitMap = _origAutoFit;

        // Imposta uno zoom ravvicinato
        HEX_SIZE = 65;

        // Trova il primo agente vivo della fazione
        const agent = (players[playerFaction]?.agents || []).find(a => a.hp > 0);
        if (agent) {
            // Calcola offset puro senza usare hexToPixel (che dipende da offsetX/Y)
            offsetX = -(HEX_SIZE * (Math.sqrt(3) * agent.q + Math.sqrt(3) / 2 * agent.r));
            offsetY = -(HEX_SIZE * (3 / 2 * agent.r));
            clampCamera();
        } else {
            offsetX = 0;
            offsetY = 0;
        }
    };
}

function _coopLaunch() {
    _coopAssignRandomMonsterFaction();
    GAME.REWARD_KILL = COOP.LAIR_REWARD_KILL;
    coopState.active       = true;
    coopState.lastDeadStats = {};
    coopState.villages     = [];
    coopState.lairs        = [];
    coopState.quests       = [];
    coopState.bossSpawned  = false;
    coopState.bossAgent    = null;
    coopState.exitCell     = null;  // <--- Unica cella
    coopState.exitExplored = false; // <--- Nascosta dalla nebbia
    coopState.bossDefeated = false; // <--- Condizione di sblocco
    coopState.playersInExit = new Set();
    coopState.turnCount    = 0;
    coopState.virtualLairTimer = 2;
    coopState.monstersKilled = 0;
    coopState.cellsExplored  = new Set();
    coopState.lairsDestroyed    = 0;
    coopState.villagesFound     = 0;
    coopState.bigMonstersKilled = 0;
    coopState.villageRecruited  = 0;
    coopState.cornersExplored   = new Set();
    coopState.totalBossesToKill = window._coopHumanPlayers; 
    coopState.bossesDefeated = 0;

    // Genera Mappa Gigante Nativamente (totalPlayers = 9 in questo momento)
    generateProceduralMap();

    _coopRepositionPlayers();
    _coopBuildExitZone();
    _coopPlaceVillages();
    _coopPlaceLairs();
    _coopInitQuests();
    _coopPlaceSpecials();

    // Rimuovi HQ virtuali generati dalla mappa procedurale, dato che in Coop non servono
    for (let p = 1; p <= totalPlayers; p++) {
        if (players[p] && players[p].hq) {
            const hqCell = grid.get(getKey(players[p].hq.q, players[p].hq.r));
            if (hqCell) hqCell.entity = null;
            players[p].hq = null;
        }
    }

    _coopPatchAutoFitForSpawn(1);
    startActiveGameUI(1);
    _coopRenderHUD();

    if (typeof showNotificationBanner === 'function') {
        showNotificationBanner(
            '⚔️ MODALITÀ COOP — Esplorate a Nord e sconfiggete il BOSS!',
            '#cc00ff', { top: '60px', duration: 5000, fontSize: '16px' }
        );
    }
    drawGame();
}

// ============================================================
// LOGICA MAPPA
// ============================================================

function _coopRepositionPlayers() {
    // Calcolo raggio per mappa gigante
    const effectiveRadius = Math.round(GRID_RADIUS * 1.6);
    const RR = Math.round(effectiveRadius * 0.85);
    const spawnRow = RR - 1; // Tutti partono dal fondo (SUD)
    let startQ = -Math.floor(spawnRow / 2);
    let placed  = 0;

    // Riposiziona SOLO i giocatori umani
    for (let p = 1; p <= window._coopHumanPlayers; p++) {
        const agents = players[p].agents;
        if (!agents || agents.length === 0) continue;

        for (const agent of agents) {
            let bestCell = null;
            for (let attempt = 0; attempt < 40 && !bestCell; attempt++) {
                const tq = startQ + placed + Math.floor(attempt / 2) * (attempt % 2 === 0 ? 1 : -1);
                const tr = spawnRow;
                const cell = grid.get(getKey(tq, tr));
                if (cell && cell.type === 'empty' && !cell.entity) {
                    bestCell = cell;
                }
            }
            if (bestCell) {
                const old = grid.get(getKey(agent.q, agent.r));
                if (old) old.entity = null;
                placeEntityAt(agent, bestCell.q, bestCell.r);
                placed++;
            }
        }
    }
}

function _coopBuildExitZone() {
    const effectiveRadius = Math.round(GRID_RADIUS * 1.6);
    const RR = Math.round(effectiveRadius * 0.85);
    
    // Identifica la riga più a Nord della mappa
    const topRow = -(RR - 1);
    
    const candidates = [];
    grid.forEach(cell => {
        // Seleziona solo celle vuote nella riga più settentrionale
        if (cell.type === 'empty' && cell.r === topRow) {
            candidates.push(cell);
        }
    });

    // Fallback: se la riga più a nord fosse tutta occupata da muri, 
    // prova quella subito sotto
    if (candidates.length === 0) {
        grid.forEach(cell => {
            if (cell.type === 'empty' && cell.r === topRow + 1) {
                candidates.push(cell);
            }
        });
    }

    shuffleArray(candidates);
    const exit = candidates[0];
    
    coopState.exitCell = { q: exit.q, r: exit.r };
    exit._coopExit = true;
}

function _coopPlaceVillages() {
    const effectiveRadius = Math.round(GRID_RADIUS * 1.6);
    const candidates = [];
    
    grid.forEach(cell => {
        if (cell.type !== 'empty' || cell.entity || cell._coopExit) return;
        const distFromEdge = hexDistance(cell, { q: 0, r: 0 });
        if (distFromEdge < 3 || distFromEdge > effectiveRadius - 2) return;

        let minPlayerDist = Infinity;
        for (let p = 1; p <= window._coopHumanPlayers; p++) {
            (players[p].agents || []).forEach(a => {
                minPlayerDist = Math.min(minPlayerDist, hexDistance(cell, a));
            });
        }
        if (minPlayerDist < COOP.VILLAGE_MIN_HQ_DIST) return;
        candidates.push(cell);
    });

    shuffleArray(candidates);
    const placed = [];
    for (const cell of candidates) {
        if (placed.length >= COOP.VILLAGE_COUNT) break;
        if (placed.some(v => hexDistance(cell, v) < 5)) continue;

        cell._coopVillage = true;
        placed.push(cell);
        coopState.villages.push({
            q: cell.q, r: cell.r,
            recruitsLeft: COOP.VILLAGE_MAX_AGENTS,
            explored: false,
        });
    }
}

function _coopPlaceLairs() {
    const effectiveRadius = Math.round(GRID_RADIUS * 1.6);
    const candidates = [];
    
    grid.forEach(cell => {
        if (cell.type !== 'empty' || cell.entity || cell._coopExit || cell._coopVillage) return;
        const distFromCenter = hexDistance(cell, { q: 0, r: 0 });
        if (distFromCenter < 4 || distFromCenter > effectiveRadius - 2) return;

        let minPlayerDist = Infinity;
        for (let p = 1; p <= window._coopHumanPlayers; p++) {
            (players[p].agents || []).forEach(a => {
                minPlayerDist = Math.min(minPlayerDist, hexDistance(cell, a));
            });
        }
        if (minPlayerDist < COOP.LAIR_MIN_HQ_DIST) return;
        candidates.push(cell);
    });

    shuffleArray(candidates);
    const placed = [];
    for (const cell of candidates) {
        if (placed.length >= COOP.LAIR_COUNT) break;
        if (placed.some(v => hexDistance(cell, v) < 4)) continue;

        placed.push(cell);
        
        // Crea l'entità Tana
        const lairEntity = {
            id: crypto.randomUUID(),
            type: 'lair', // Tipo custom, così non si muove come gli agenti
            faction: COOP.MONSTER_FACTION,
            sprite: '🕳️',
            hp: 15, maxHp: 15, // Gli HP visibili sulla mappa
            ap: 0, q: cell.q, r: cell.r,
            _isLair: true
        };
        cell.entity = lairEntity;
        players[COOP.MONSTER_FACTION].agents.push(lairEntity);
        coopState.lairs.push({
            id: lairEntity.id,
            q: cell.q, r: cell.r,
            turnsUntilSpawn: COOP.LAIR_SPAWN_INTERVAL,
            explored: false,
        });

        _coopSpawnMonsterAt(cell.q, cell.r);
    }
}

function _coopPlaceSpecials() {
    const effectiveRadius = Math.round(GRID_RADIUS * 1.6);
    
    // Controlla quali quest speciali sono attive
    const hasRescue = coopState.quests.some(q => q.type === 'rescue');
    const hasData   = coopState.quests.some(q => q.type === 'data');

    // Funzione helper per trovare un punto lontano
    const findDistantPoint = () => {
        let candidates = [];
        grid.forEach(cell => {
            // Cerchiamo celle vuote nella fascia esterna della mappa
            if (cell.type !== 'empty' || cell.entity || cell._coopExit || cell._coopVillage || cell._coopLair) return;
            const distFromCenter = hexDistance(cell, { q: 0, r: 0 });
            if (distFromCenter > effectiveRadius - 5 && distFromCenter < effectiveRadius - 1) {
                candidates.push(cell);
            }
        });
        
        // Fallback: se la mappa è troppo piena, prendi una cella vuota qualsiasi lontano dal centro
        if (candidates.length === 0) {
            grid.forEach(cell => {
                if (cell.type === 'empty' && !cell.entity && hexDistance(cell, {q:0, r:0}) > 5) candidates.push(cell);
            });
        }

        shuffleArray(candidates);
        return candidates.length > 0 ? candidates[0] : null;
    };

    if (hasRescue) {
        const cell = findDistantPoint();
        if (cell) coopState.survivor = { q: cell.q, r: cell.r, carrierId: null };
    }
    
    if (hasData) {
        const cell = findDistantPoint();
        if (cell) coopState.drone = { q: cell.q, r: cell.r, analyzerId: null, turns: 0 };
    }
}

// ============================================================
// SPAWN E BOSS
// ============================================================

function _coopCreateMonster(baseHp) {
    const hp  = baseHp || (COOP.MONSTER_HP_MIN + Math.floor(Math.random() * (COOP.MONSTER_HP_MAX - COOP.MONSTER_HP_MIN + 1)));
    const dmg = COOP.MONSTER_DMG_MIN + Math.floor(Math.random() * (COOP.MONSTER_DMG_MAX - COOP.MONSTER_DMG_MIN + 1));
    const faction = COOP.MONSTER_FACTION;
    
    // --- NUOVA LOGICA DINAMICA ---
    const cosmeticId = players[COOP.MONSTER_FACTION]._cosmeticFaction || 2;
    const fData = FACTION_PREFIXES[cosmeticId]; 
    const slot  = Math.floor(Math.random() * fData.count) + 1;
    const spritePool = SPRITE_POOLS[cosmeticId] || ['👾','🤖','👹'];

    const rng = COOP.MONSTER_RNG_MIN + Math.floor(Math.random() * (COOP.MONSTER_RNG_MAX - COOP.MONSTER_RNG_MIN + 1));
    return {
        id:            crypto.randomUUID(),
        type:          'agent',
        faction:       faction,
        sprite:        getRandomSprite(spritePool),
        customSpriteId: `${fData.prefix}${slot}`,
        hp, maxHp: hp, mov: COOP.MONSTER_MOV, rng,
        dmg, ap: GAME.AP_PER_TURN, q: 0, r: 0,
        firstTurnImmune: false,
        _isMonster: true,
    };
}

function _coopSpawnMonsterAt(lairQ, lairR) {
    const spawnCells = [];
    hexDirections.forEach(dir => {
        for (let d = 1; d <= 2; d++) {
            const cell = grid.get(getKey(lairQ + dir.q * d, lairR + dir.r * d));
            if (cell && cell.type === 'empty' && !cell.entity) spawnCells.push(cell);
        }
    });
    
    const lairCell = grid.get(getKey(lairQ, lairR));
    if (lairCell && lairCell.type === 'empty' && !lairCell.entity) spawnCells.unshift(lairCell);

    if (spawnCells.length === 0) return null;
    shuffleArray(spawnCells);

    const monster = _coopCreateMonster();
    placeEntityAt(monster, spawnCells[0].q, spawnCells[0].r);
    players[COOP.MONSTER_FACTION].agents.push(monster);
    return monster;
}

function _coopSpawnMonsters() {

    // --- NUOVO: LIMITE ASSOLUTO GLOBALE (HARD CAP) ---
    const monsterList = players[COOP.MONSTER_FACTION]?.agents || [];
    
    // Contiamo tutti gli agenti della Fazione 9 che sono vivi e NON sono tane
    const globalAliveCount = monsterList.filter(m => m.hp > 0 && !m._isLair).length;

    // Se ci sono 20 o più mostri in mappa, usciamo immediatamente senza spawnare nulla
    if (globalAliveCount >= 16) {
        return; 
    }
    // -------------------------------------------------

    let activeLairs = [];
    
    // 1. Recupera le tane ancora integre
    coopState.lairs.forEach(lair => {
        const cell = grid.get(getKey(lair.q, lair.r));
        if (cell && cell.entity && cell.entity._isLair) {
            activeLairs.push(lair);
        }
    });

    // Numero di umani (minimo 1 per evitare divisioni per zero o loop infiniti)
    const numHumans = Math.max(1, window._coopHumanPlayers || 1);
    const effectiveMax = COOP.LAIR_MAX_MONSTERS_BASE + (numHumans * COOP.LAIR_MAX_MONSTERS_PER_PLAYER);

    if (activeLairs.length > 0) {
        // --- LOGICA TANE FISICHE ---
        activeLairs.forEach(lair => {
            // Sicurezza: se la tana ha perso le coordinate, salta
            if (lair.q === undefined || lair.r === undefined) return;

            // --- GESTIONE INFEZIONE VIRALE ---
            if (lair.infectedTurns > 0) {
                lair.infectedTurns--;
                return; // Salta lo spawn finché è infetta!
            }

            const monsterList = players[COOP.MONSTER_FACTION]?.agents || [];
            const aliveNearby = monsterList.filter(m =>
                m.hp > 0 && hexDistance(m, lair) <= 5
            ).length;

            if (aliveNearby >= effectiveMax) return;

            lair.turnsUntilSpawn--;
            if (lair.turnsUntilSpawn <= 0) {
                lair.turnsUntilSpawn = COOP.LAIR_SPAWN_INTERVAL;
                
                // Spawn proporzionale al numero di giocatori
                for (let i = 0; i < numHumans; i++) {
                    // Ricontrolla il limite locale prima di ogni spawn nel ciclo
                    const currentCheck = monsterList.filter(m => m.hp > 0 && hexDistance(m, lair) <= 5).length;
                    if (currentCheck < effectiveMax) {
                        _coopSpawnMonsterAt(lair.q, lair.r);
                    } else {
                        break; 
                    }
                }
            }
        });
    } else {
        // --- LOGICA INVASIONE (Tane distrutte) ---
        coopState.virtualLairTimer--;
        if (coopState.virtualLairTimer <= 0) {
            coopState.virtualLairTimer = 2;
            const effectiveRadius = Math.round(GRID_RADIUS * 1.6);
            const candidates = [];
            grid.forEach(cell => {
                if (cell.type === 'empty' && !cell.entity) {
                    if (hexDistance({ q: 0, r: 0 }, cell) >= effectiveRadius - 1) candidates.push(cell);
                }
            });

            if (candidates.length > 0) {
                shuffleArray(candidates);
                const spawnCount = Math.min(candidates.length, numHumans * (2 + Math.floor(Math.random() * 2)));
                for(let i=0; i<spawnCount; i++) {
                    const monster = _coopCreateMonster();
                    placeEntityAt(monster, candidates[i].q, candidates[i].r);
                    players[COOP.MONSTER_FACTION].agents.push(monster);
                }
                if (typeof showNotificationBanner === 'function') {
                    showNotificationBanner(`⚠️ INVASIONE NEMICA DI MASSA!<br>(${spawnCount} nuovi contatti)`, '#ff0000', { duration: 5000, bold: true });
                }
            }
        }
    }
}

function _coopSpawnBoss() {
    if (!coopState.exitCell) return;

    let spawnCell = null;
    
    // --- NUOVA RICERCA PROGRESSIVA ---
    // Partiamo dall'uscita e ci espandiamo a cerchi concentrici
    const visited = new Set();
    const queue = [{ q: coopState.exitCell.q, r: coopState.exitCell.r }];
    visited.add(getKey(coopState.exitCell.q, coopState.exitCell.r));

    let maxAttempts = 100; // Limite di sicurezza per evitare loop infiniti
    while (queue.length > 0 && maxAttempts > 0) {
        maxAttempts--;
        const curr = queue.shift();
        const cell = grid.get(getKey(curr.q, curr.r));
        
        // Se troviamo una cella vuota, usiamo questa e fermiamo la ricerca
        if (cell && cell.type === 'empty' && !cell.entity) {
            spawnCell = cell;
            break;
        }
        
        // Altrimenti, aggiungiamo i vicini alla coda per esplorarli
        for (const dir of hexDirections) {
            const nq = curr.q + dir.q;
            const nr = curr.r + dir.r;
            const key = getKey(nq, nr);
            
            if (!visited.has(key)) {
                visited.add(key);
                queue.push({ q: nq, r: nr });
            }
        }
    }

    if (!spawnCell) return; // Se per assurdo la mappa è piena al 100%, esce.

    // --- 1. SPAWN DEL BOSS ---
    const baseHp = COOP.MONSTER_HP_MAX;
    const hp     = baseHp * COOP.BOSS_HP_MULT;
    const cosmeticId = players[COOP.MONSTER_FACTION]._cosmeticFaction || 2;
    const fData  = FACTION_PREFIXES[cosmeticId];

    const boss = {
        id: 'coop_boss', type: 'agent', faction: COOP.MONSTER_FACTION,
        sprite: '💀', customSpriteId: `${fData.prefix}${fData.count}`,
        hp, maxHp: hp, mov: COOP.MONSTER_MOV * COOP.BOSS_MOV_MULT,
        rng: COOP.MONSTER_RNG_MAX * COOP.BOSS_RNG_MULT,
        dmg: COOP.MONSTER_DMG_MAX * COOP.BOSS_DMG_MULT,
        ap: COOP.BOSS_AP, q: spawnCell.q, r: spawnCell.r,
        firstTurnImmune: false, _isBoss: true, _isMonster: true,
    };

    placeEntityAt(boss, spawnCell.q, spawnCell.r);
    players[COOP.MONSTER_FACTION].agents.push(boss);
    coopState.bossSpawned = true;
    coopState.bossAgent   = boss;

    // --- NOTIFICA NUMERO BOSS ---
    const bossCorrente = coopState.bossesDefeated + 1;
    if (typeof showNotificationBanner === 'function') {
        showNotificationBanner(
            `⚠️ BOSS ${bossCorrente} di ${coopState.totalBossesToKill} RILEVATO!`,
            '#ff0000', { top: '80px', duration: 5000, bold: true }
        );
    }

    // --- 2. SPAWN DELLA SCORTA (4 Mostri) ---
    let guardsSpawned = 0;
    // Cerca tra tutte le direzioni intorno alla posizione del Boss
    for (const dir of hexDirections) {
        if (guardsSpawned >= 4) break; 

        const nq = spawnCell.q + dir.q;
        const nr = spawnCell.r + dir.r;
        const adjCell = grid.get(getKey(nq, nr));

        if (adjCell && adjCell.type === 'empty' && !adjCell.entity) {
            const guard = _coopCreateMonster();
            placeEntityAt(guard, nq, nr);
            players[COOP.MONSTER_FACTION].agents.push(guard);
            guardsSpawned++;
        }
    }
}

// ============================================================
// SISTEMA QUEST
// ============================================================

function _coopInitQuests() {
    const pool = shuffleArray([..._COOP_QUEST_DEFS]);
    coopState.quests = pool.slice(0, COOP.QUEST_COUNT).map(def => ({
        ...def, progress: 0, completed: false,
    }));
}

function _coopUpdatePositionQuests() {
    // Questa logica di stato avanzata va eseguita solo dall'Host o in Locale
    const isMaster = !(typeof isOnline !== 'undefined' && isOnline && !isHost);

    // --- LOGICA SOPRAVVISSUTO ISOLATO ---
    if (isMaster && coopState.survivor) {
        const s = coopState.survivor;
        const rescueQuest = coopState.quests.find(q => q.type === 'rescue');

        if (rescueQuest && !rescueQuest.completed) {
            if (!s.carrierId) {
                // Controllo Pickup: C'è un umano adiacente?
                for (let p = 1; p <= window._coopHumanPlayers; p++) {
                    const agent = (players[p].agents || []).find(a => a.hp > 0 && hexDistance(a, s) <= 1);
                    if (agent) {
                        s.carrierId = agent.id;
                        if (typeof showNotificationBanner === 'function') showNotificationBanner('🧑‍🔧 Sopravvissuto recuperato! Scortalo al sicuro!', '#00aaff', { top: '80px', duration: 4000 });
                        break;
                    }
                }
            } else {
                // L'agente che lo trasporta esiste ancora?
                let carrier = null;
                for (let p = 1; p <= window._coopHumanPlayers; p++) {
                    carrier = (players[p].agents || []).find(a => a.id === s.carrierId);
                    if (carrier) break;
                }

                if (!carrier || carrier.hp <= 0) {
                    // Carrier morto, il sopravvissuto cade a terra
                    s.carrierId = null;
                    if (carrier) { s.q = carrier.q; s.r = carrier.r; }
                    if (typeof showNotificationBanner === 'function') showNotificationBanner('⚠️ Il sopravvissuto è stato lasciato cadere!', '#ff3333', { top: '80px', duration: 3000 });
                } else {
                    // Aggiorna posizione del sopravvissuto (segue il carrier)
                    s.q = carrier.q; s.r = carrier.r;

                    // Controllo Consegna: È adiacente all'uscita o a un villaggio esplorato?
                    let safe = false;
                    if (coopState.exitCell && hexDistance(carrier, coopState.exitCell) <= 1) safe = true;
                    if (!safe) {
                        const village = coopState.villages.find(v => v.explored && hexDistance(carrier, v) <= 1);
                        if (village) safe = true;
                    }

                    if (safe) {
                        s.carrierId = 'SAVED'; // Rimuove dalla mappa visivamente
                        rescueQuest.progress = 1;
                        _coopCompleteQuest(rescueQuest);
                    }
                }
            }
        }
    }

    // --- LOGICA RECUPERO DATI (DRONE) ---
    if (isMaster && coopState.drone) {
        const d = coopState.drone;
        const dataQuest = coopState.quests.find(q => q.type === 'data');

        if (dataQuest && !dataQuest.completed) {
            let currentAnalyzer = null;

            // Se avevamo un analizzatore, controlliamo se è ancora vivo e adiacente
            if (d.analyzerId) {
                for (let p = 1; p <= window._coopHumanPlayers; p++) {
                    currentAnalyzer = (players[p].agents || []).find(a => a.id === d.analyzerId && a.hp > 0 && hexDistance(a, d) <= 1);
                    if (currentAnalyzer) break;
                }
            }

            if (currentAnalyzer) {
                // Tutto ok, progredisce!
                d.turns++;
                dataQuest.progress = d.turns;
                if (typeof showNotificationBanner === 'function' && d.turns === 1) {
                    showNotificationBanner('📡 Analisi Drone in corso (1/2 turni)... Difendilo!', '#FFD700', { top: '80px', duration: 3000 });
                }
                
                if (d.turns >= 2) {
                    _coopCompleteQuest(dataQuest);
                }
            } else {
                // Nessuno lo sta analizzando. C'è qualcuno di nuovo?
                d.analyzerId = null;
                d.turns = 0;
                dataQuest.progress = 0;
                
                for (let p = 1; p <= window._coopHumanPlayers; p++) {
                    const newAgent = (players[p].agents || []).find(a => a.hp > 0 && hexDistance(a, d) <= 1);
                    if (newAgent) {
                        d.analyzerId = newAgent.id;
                        if (typeof showNotificationBanner === 'function') showNotificationBanner('📡 Inizio download dati dal Drone...', '#00aaff', { top: '80px', duration: 3000 });
                        break;
                    }
                }
            }
        }
    }

    // Original position logic
    coopState.quests.forEach(q => {
        if (q.completed) return;
        if (q.type === 'position') {
            let reached = false;
            for (let p = 1; p <= window._coopHumanPlayers; p++) {
                (players[p].agents || []).forEach(a => {
                    if (hexDistance(a, { q: 0, r: 0 }) <= q.target) reached = true;
                });
            }
            if (reached) _coopCompleteQuest(q);
        }
        if (q.type === 'explore_village') {
            q.progress = coopState.villagesFound;
            if (q.progress >= q.target) _coopCompleteQuest(q);
        }
    });

    if (isMaster) _coopBroadcastStateIfHost();
}

function _coopProgressKillQuest(monster) {
    // Incrementa i contatori una sola volta per uccisione, fuori dal loop delle quest
    if (isOnline && !isHost) return;
    coopState.monstersKilled++;
    if (monster && monster.maxHp >= 5) coopState.bigMonstersKilled++;

    // Quest: 4 uccisioni in un turno con un solo agente
    if (selectedAgent && selectedAgent.faction <= window._coopHumanPlayers) {
        const killKey = `${turnCount}_${selectedAgent.id}`;
        coopState.quests.forEach(q => {
            if (q.completed || q.type !== 'kill_4_one_turn') return;
            if (!q._turnKills) q._turnKills = {};
            q._turnKills[killKey] = (q._turnKills[killKey] || 0) + 1;
            q.progress = Math.max(q.progress || 0, q._turnKills[killKey]);
            if (q.progress >= q.target) _coopCompleteQuest(q);
        });
    }

    coopState.quests.forEach(q => {
        if (q.completed) return;
        if (q.type === 'kill') {
            q.progress = coopState.monstersKilled;
            if (q.progress >= q.target) _coopCompleteQuest(q);
        }
        if (q.type === 'kill_big') {
            q.progress = coopState.bigMonstersKilled;
            if (q.progress >= q.target) _coopCompleteQuest(q);
        }
    });
    _coopUpdateHUD();
}

function _coopProgressLairQuest() {
    // FIX: Se siamo online e non siamo l'Host, non incrementare mai!
    if (typeof isOnline !== 'undefined' && isOnline && !isHost) return;

    coopState.lairsDestroyed++;
    coopState.quests.forEach(q => {
        if (q.completed || q.type !== 'kill_lair') return;
        q.progress = coopState.lairsDestroyed;
        if (q.progress >= q.target) _coopCompleteQuest(q);
    });
    _coopUpdateHUD();
}

function _coopProgressExploreQuest(newCells) {
    newCells.forEach(key => coopState.cellsExplored.add(key));
    coopState.quests.forEach(q => {
        if (q.completed || q.type !== 'explore') return;
        q.progress = coopState.cellsExplored.size;
        if (q.progress >= q.target) _coopCompleteQuest(q);
    });

    // Check angoli
    const corners = _coopGetCornerCells();
    coopState.quests.forEach(q => {
        if (q.completed || q.type !== 'explore_corners') return;
        corners.forEach(corner => {
            const key = getKey(corner.q, corner.r);
            if (newCells.includes(key) || coopState.cellsExplored.has(key)) {
                coopState.cornersExplored.add(key);
            }
        });
        q.progress = coopState.cornersExplored.size;
        if (q.progress >= q.target) _coopCompleteQuest(q);
    });

    // Check CP
    _coopCheckControlPointQuest();
    _coopUpdateHUD();
}

function _coopGetCornerCells() {
    const effectiveRadius = Math.round(GRID_RADIUS * 1.6);
    const RQ = effectiveRadius;
    const RR = Math.round(effectiveRadius * 0.85);
    const rMin = -RR + 1;
    const rMax =  RR - 1;
    return [
        { q: -RQ - Math.floor(rMin / 2) + 1, r: rMin }, // Nord-Ovest
        { q:  RQ - Math.floor(rMin / 2) - 1, r: rMin }, // Nord-Est
        { q: -RQ - Math.floor(rMax / 2) + 1, r: rMax }, // Sud-Ovest
        { q:  RQ - Math.floor(rMax / 2) - 1, r: rMax }, // Sud-Est
    ];
}

function _coopCheckControlPointQuest() {
    let humanCPs = 0;
    controlPoints.forEach(cp => {
        for (let p = 1; p <= window._coopHumanPlayers; p++) {
            if (cp.faction === p) { humanCPs++; break; }
        }
    });
    coopState.quests.forEach(q => {
        if (q.completed || q.type !== 'control_3cp') return;
        q.progress = humanCPs;
        if (q.progress >= q.target) _coopCompleteQuest(q);
    });
}

function _coopCompleteQuest(quest) {
    quest.completed = true;
    for (let p = 1; p <= window._coopHumanPlayers; p++) {
        if (players[p] && players[p].agents && players[p].agents.length > 0) {
            players[p].credits = (players[p].credits || 0) + quest.reward;
        }
    }
    if (typeof showNotificationBanner === 'function') {
        showNotificationBanner(
            `✅ QUEST: ${quest.text}<br>+${quest.reward} crediti per tutti!`,
            '#00ff88', { top: '70px', duration: 4000, fontSize: '15px' }
        );
    }
    _coopUpdateHUD();
}

// ============================================================
// INTERAZIONE: VILLAGGIO
// ============================================================

function _coopEnterVillage(playerFaction, agentRef) {
    const village = coopState.villages.find(v => v.q === agentRef.q && v.r === agentRef.r);
    if (!village) return;

    if (!village.explored) {
        village.explored = true;
        coopState.villagesFound++;
        if (typeof showNotificationBanner === 'function') {
            showNotificationBanner('🏘️ Villaggio scoperto!', '#FFD700', { top: '80px', duration: 3000 });
        }
    }

    if (village.recruitsLeft <= 0) {
        if (typeof showTemporaryMessage === 'function') showTemporaryMessage('Villaggio vuoto.', 3000);
        return;
    }

    const cost    = COOP.VILLAGE_RECRUIT_COST;
    const credits = players[playerFaction].credits || 0;
    if (credits < cost) {
        if (typeof showTemporaryMessage === 'function') showTemporaryMessage(`Servono ${cost} cr.`, 2500);
        return;
    }

    _coopShowRecruitPanel(playerFaction, village);
}

function _coopGetDeadAllies(myFaction) {
    const dead = [];
    for (let p = 1; p <= window._coopHumanPlayers; p++) {
        if (p === myFaction) continue;
        const agents = players[p].agents || [];
        const alive = agents.filter(a => a.hp > 0).length;
        if (alive === 0) dead.push(p);
    }
    return dead;
}

function _coopShowRecruitPanel(faction, village) {
    const existing = document.getElementById('coop-recruit-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'coop-recruit-panel';
    panel.style.cssText = `
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        background:rgba(5,5,15,0.97); border:2px solid #FFD700;
        border-radius:10px; padding:24px; z-index:20000;
        font-family:'Courier New',monospace; color:#fff; text-align:center;
        min-width:280px; box-shadow:0 0 30px #FFD70066;
    `;

    const fData = FACTION_PREFIXES[players[faction]._cosmeticFaction ?? faction];
    const tmpAgent = {
        id: crypto.randomUUID(), type: 'agent', faction,
        sprite: getRandomSprite(SPRITE_POOLS[players[faction]._cosmeticFaction ?? faction]),
        customSpriteId: `${fData.prefix}1`,
        hp: 1, maxHp: 1, mov: 1, rng: 1, dmg: 1, ap: GAME.AP_PER_TURN, q: 0, r: 0,
    };

    let extraPoints = 0;
    const renderStats = () => {
        const statsHtml = `
            <div style="display:flex;gap:8px;justify-content:center;margin:12px 0;">
                ${['hp','mov','rng','dmg'].map(s => `
                    <div style="text-align:center;">
                        <div style="color:#aaa;font-size:11px;">${s.toUpperCase()}</div>
                        <button onclick="window._coopRecAdjust('${s}',-1)" style="padding:2px 6px;background:#333;border:1px solid #555;color:#fff;cursor:pointer;">-</button>
                        <span id="coop-stat-${s}" style="display:inline-block;width:20px;text-align:center;">${tmpAgent[s]}</span>
                        <button onclick="window._coopRecAdjust('${s}',1)" style="padding:2px 6px;background:#333;border:1px solid #555;color:#fff;cursor:pointer;">+</button>
                    </div>
                `).join('')}
            </div>
            <div style="color:#FFD700;font-size:13px;">Punti extra: <b id="coop-extra-pts">${extraPoints}</b></div>
            <div style="color:#aaa;font-size:12px;">Costo totale: <b style="color:#fff">${COOP.VILLAGE_RECRUIT_COST + extraPoints} cr</b></div>
        `;
        document.getElementById('coop-recruit-stats').innerHTML = statsHtml;
    };

    window._coopRecAdjust = function(stat, delta) {
        const maxes = { hp: 6, mov: 4, rng: 8, dmg: 5 };
        const newVal = tmpAgent[stat] + delta;
        if (newVal < 1 || newVal > maxes[stat]) return;

        const totalCredits = players[faction].credits || 0;
        const totalCost    = COOP.VILLAGE_RECRUIT_COST + extraPoints + delta;
        if (delta > 0 && totalCost > totalCredits) {
            showTemporaryMessage('Crediti insufficienti!', 1500); return;
        }
        if (delta < 0 && extraPoints + delta < 0) return;

        tmpAgent[stat]  += delta;
        if (stat === 'hp') tmpAgent.maxHp = tmpAgent.hp;
        extraPoints     += delta;
        renderStats();
    };

    // --- NUOVO: SEZIONE RESURREZIONE ALLEATI ---
    const deadAllies = _coopGetDeadAllies(faction);
    let reviveHtml = '';
    if (deadAllies.length > 0) {
        reviveHtml = `
            <div style="margin-top:15px; border-top:1px solid #555; padding-top:12px;">
                <h4 style="color:#00ff88; margin:0 0 10px; font-size:14px; text-transform:uppercase;">⚰️ Resurrezione Alleati</h4>
                <div style="font-size:11px; color:#aaa; margin-bottom:8px;">(Costo fisso: 0 cr)</div>
                ${deadAllies.map(dp => `
                    <button onclick="window._coopRequestRevive(${faction}, ${dp}, ${village.q}, ${village.r})"
                            style="padding:8px 12px; border:2px solid ${players[dp].color}; color:${players[dp].color}; background:rgba(0,0,0,0.5); cursor:pointer; width:100%; margin-bottom:6px; font-weight:bold; border-radius:4px;">
                        SALVA ${players[dp].name.toUpperCase()}
                    </button>
                `).join('')}
            </div>
        `;
    }

    panel.innerHTML = `
        <h3 style="color:#FFD700;margin:0 0 8px;font-size:18px;">🏘️ Villaggio</h3>
        <p style="color:#aaa;font-size:13px;margin:0 0 10px;">Reclute base rimaste: <b>${village.recruitsLeft}</b></p>
        <div id="coop-recruit-stats"></div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:16px;">
            <button onclick="window._coopRequestRecruit(${faction}, ${village.q}, ${village.r})" style="padding:10px 20px;border:2px solid #00ff88;color:#00ff88;background:rgba(0,255,136,0.1);cursor:pointer;font-weight:bold;border-radius:4px;">✅ RECLUTA</button>
            <button onclick="document.getElementById('coop-recruit-panel').remove()" style="padding:10px 20px;border:2px solid #ff3333;color:#ff3333;background:rgba(255,51,51,0.1);cursor:pointer;border-radius:4px;">✖ ANNULLA</button>
        </div>
        ${reviveHtml}
    `;
    document.body.appendChild(panel);
    renderStats();

    // Funzione chiamata dal bottone per il reclutamento standard
    window._coopRequestRecruit = function(pFaction, vq, vr) {
        const totalCost = COOP.VILLAGE_RECRUIT_COST + extraPoints;
        if ((players[pFaction].credits || 0) < totalCost) {
            showTemporaryMessage('Crediti insufficienti!', 2000); return;
        }
        
        const agentData = Object.assign({}, tmpAgent, {
            id: crypto.randomUUID(), ap: GAME.AP_PER_TURN, firstTurnImmune: true,
        });

        document.getElementById('coop-recruit-panel').remove();

        if (isOnline && !isHost) {
            sendOnlineMessage({ type: 'COOP_RECRUIT_REQ', faction: pFaction, agent: agentData, cost: totalCost, vq, vr });
        } else {
            _coopApplyRecruit(pFaction, agentData, totalCost, vq, vr);
        }
    };

    // Funzione chiamata dal bottone per la Resurrezione
    window._coopRequestRevive = function(reviverFaction, deadFaction, vq, vr) {
        if ((players[reviverFaction].credits || 0) < 0) {
            showTemporaryMessage('Crediti insufficienti (servono 10 cr)!', 2000); return;
        }

        document.getElementById('coop-recruit-panel').remove();

        if (isOnline && !isHost) {
            sendOnlineMessage({ type: 'COOP_REVIVE_REQ', reviverFaction, deadFaction, vq, vr });
        } else {
            _coopApplyRevive(reviverFaction, deadFaction, vq, vr);
        }
    };
}

// Applica il reclutamento e sincronizza la rete
function _coopApplyRecruit(faction, agentData, cost, vq, vr) {
    const village = coopState.villages.find(v => v.q === vq && v.r === vr);
    if (!village) return;

    players[faction].credits -= cost;
    village.recruitsLeft--;

    const activeAgent = selectedAgent;
    let spawnCell = null;
    hexDirections.forEach(dir => {
        if (spawnCell) return;
        const c = grid.get(getKey((activeAgent?.q || vq) + dir.q, (activeAgent?.r || vr) + dir.r));
        if (c && c.type === 'empty' && !c.entity) spawnCell = c;
    });

    if (!spawnCell) { 
        players[faction].credits += cost; 
        village.recruitsLeft++;
        showTemporaryMessage('Nessuna cella libera attorno al villaggio!', 2500); 
        return; 
    }

    agentData.q = spawnCell.q;
    agentData.r = spawnCell.r;
    placeEntityAt(agentData, spawnCell.q, spawnCell.r);
    players[faction].agents.push(agentData);

    // Quest: recluta 2 agenti nei villaggi
    coopState.villageRecruited = (coopState.villageRecruited || 0) + 1;
    coopState.quests.forEach(q => {
        if (q.completed || q.type !== 'recruit_village') return;
        q.progress = coopState.villageRecruited;
        if (q.progress >= q.target) _coopCompleteQuest(q);
    });

    if (typeof showNotificationBanner === 'function') {
        showNotificationBanner('🪖 Nuova recluta unita al gruppo!', players[faction].color, { top: '80px', duration: 3000 });
    }
    drawGame();
    _coopUpdateHUD();
    updateUI();

    if (isOnline && isHost) {
        broadcastToClients({ type: 'COOP_RECRUIT_SYNC', faction, agent: agentData, cost, vq, vr });
    }
}

// Applica la resurrezione e sincronizza la rete
function _coopApplyRevive(reviverFaction, deadFaction, vq, vr) {
    players[reviverFaction].credits -= 0;

    let spawnCell = null;
    hexDirections.forEach(dir => {
        if (spawnCell) return;
        const c = grid.get(getKey(vq + dir.q, vr + dir.r));
        if (c && c.type === 'empty' && !c.entity) spawnCell = c;
    });

    if (!spawnCell) {
        players[reviverFaction].credits += 0;
        showTemporaryMessage('Nessuna cella libera attorno al villaggio!', 2500);
        return;
    }

    // --- NUOVA LOGICA RESURREZIONE CON MALUS ---
    const fData = FACTION_PREFIXES[players[deadFaction]._cosmeticFaction || deadFaction];
    
    // Recupera le vecchie statistiche (o usa un fallback di base se per qualche motivo mancano)
    const oldStats = (coopState.lastDeadStats && coopState.lastDeadStats[deadFaction]) || {
        maxHp: 3, mov: 2, rng: 3, dmg: 2,
        sprite: getRandomSprite(SPRITE_POOLS[players[deadFaction]._cosmeticFaction || deadFaction]),
        customSpriteId: `${fData.prefix}1`
    };

    // Applica le penalità (minimo 1 per evitare che il gioco si rompa con statistiche a 0)
    const newMov = Math.max(1, oldStats.mov - 1);
    const newRng = Math.max(1, oldStats.rng - 1);
    const newDmg = Math.max(1, oldStats.dmg - 1);

    const newAgent = {
        id: crypto.randomUUID(), 
        type: 'agent', 
        faction: deadFaction,
        sprite: oldStats.sprite,
        customSpriteId: oldStats.customSpriteId,
        hp: 1,                   // Risorge con 1 solo HP (ferito)
        maxHp: oldStats.maxHp,   // Mantiene il suo massimale originale
        mov: newMov,             // Passi -1
        rng: newRng,             // Tiro -1
        dmg: newDmg,             // Danno -1
        ap: GAME.AP_PER_TURN, 
        q: spawnCell.q, 
        r: spawnCell.r,
        firstTurnImmune: true
    };
    // -------------------------------------------

    placeEntityAt(newAgent, spawnCell.q, spawnCell.r);
    players[deadFaction].agents.push(newAgent);

    if (typeof showNotificationBanner === 'function') {
        showNotificationBanner(`✨ ${players[deadFaction].name.toUpperCase()} È TORNATO (FERITO)!`, players[deadFaction].color, { top: '80px', duration: 5000, fontSize: '18px' });
    }
    if (typeof playSFX === 'function') playSFX('heal');

    drawGame();
    updateUI();

    if (isOnline && isHost) {
        broadcastToClients({ type: 'COOP_REVIVE_SYNC', reviverFaction, deadFaction, agent: newAgent });
    }
}

// ============================================================
// NEBBIA E DISEGNI (draw hooks)
// ============================================================

function _coopDrawFog() {
    if (!ctx || !grid) return;
    const visible = new Set();
    coopState.currentVisible = visible; // esposto per core.js
    const newlyRevealed = [];

    // Consideriamo la vista di tutti gli agenti umani
    for (let p = 1; p <= window._coopHumanPlayers; p++) {
        (players[p].agents || []).forEach(agent => {
            if (agent.hp <= 0) return;
            // La visuale dell'agente è uguale alla sua gittata + 1 o +0
            const range = agent.rng + 0;
            grid.forEach(cell => {
                if (hexDistance(agent, cell) <= range) {
                    const key = getKey(cell.q, cell.r);
                    if (!visible.has(key) && !coopState.cellsExplored.has(key)) newlyRevealed.push(key);
                    visible.add(key);
                }
            });
        });
    }

    if (newlyRevealed.length > 0) _coopProgressExploreQuest(newlyRevealed);
    _coopCheckRevealSpecials(visible);

    ctx.save();
    grid.forEach(cell => {
        const key = getKey(cell.q, cell.r);
        if (!visible.has(key)) {
            const alpha = coopState.cellsExplored.has(key) ? COOP.FOG_ALPHA_EXPLORED : COOP.FOG_ALPHA;
            const p = hexToPixel(cell.q, cell.r);
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i + Math.PI / 6;
                const x = p.x + (HEX_SIZE + 1) * Math.cos(angle);
                const y = p.y + (HEX_SIZE + 1) * Math.sin(angle);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
            ctx.fill();
        }
    });
    ctx.restore();
}

function _coopCheckRevealSpecials(visibleSet) {
    // Svela l'uscita e fa spawnare il Boss
    if (!coopState.exitExplored && coopState.exitCell) {
        const exitKey = getKey(coopState.exitCell.q, coopState.exitCell.r);
        if (visibleSet.has(exitKey)) {
            coopState.exitExplored = true;
            
            // IL BOSS APPARE ORA!
            _coopSpawnBoss();
            
            if (typeof showNotificationBanner === 'function') {
                showNotificationBanner('🚪 Via di fuga individuata! ATTENZIONE AL BOSS!', '#ff3333', { top: '80px', duration: 5000 });
            }
            
            // Fai rumore per segnalare l'arrivo del boss
            if (typeof playSFX === 'function') playSFX('explosion');
        }
    }

    coopState.villages.forEach(v => {
        if (!v.explored && visibleSet.has(getKey(v.q, v.r))) {
            v.explored = true;
            coopState.villagesFound++;
            if (typeof showNotificationBanner === 'function') {
                showNotificationBanner('🏘️ Villaggio scoperto nelle vicinanze!', '#FFD700', { top: '80px', duration: 3000 });
            }
            _coopUpdateHUD();
        }
    });

    coopState.lairs.forEach(l => {
        if (!l.explored && !l.destroyed && visibleSet.has(getKey(l.q, l.r))) {
            l.explored = true;
            const cell = grid.get(getKey(l.q, l.r));
            if (typeof showNotificationBanner === 'function') {
                showNotificationBanner('⚠️ Tana di mostri rilevata!', players[COOP.MONSTER_FACTION].color, { top: '80px', duration: 3000 });
            }
        }
    });
}

function _coopDrawSpecialCells() {
    if (!ctx) return;
    ctx.save();
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // 1. Disegna l'Uscita (rispetta la nebbia perché exitExplored viene settata solo quando visibile)
    if (coopState.exitCell && coopState.exitExplored) {
        const p = hexToPixel(coopState.exitCell.q, coopState.exitCell.r);
        const color = coopState.bossDefeated ? 'rgba(255, 215, 0, 0.8)' : 'rgba(150, 150, 150, 0.5)';
        ctx.strokeStyle = color;
        ctx.lineWidth   = 3;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i + Math.PI / 6;
            const x = p.x + HEX_SIZE * Math.cos(angle);
            const y = p.y + HEX_SIZE * Math.sin(angle);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `${Math.round(HEX_SIZE * 0.7)}px Arial`;
        ctx.fillText(coopState.bossDefeated ? '🚪' : '🔒', p.x, p.y);
    }

    // 2. Disegna i Villaggi
    coopState.villages.forEach(v => {
        if (!v.explored) return;
        const p = hexToPixel(v.q, v.r);
        ctx.font = `${Math.round(HEX_SIZE * 0.7)}px Arial`;
        ctx.fillText(v.recruitsLeft > 0 ? '🏘️' : '🏚️', p.x, p.y + HEX_SIZE * 0.05);
    });

    // --- IL CODICE DELLE TANE È STATO RIMOSSO DA QUI ---
    // Il motore core.js disegnerà l'entità Tana automaticamente 
    // perché è nella lista agents dei mostri.

    // 3. Disegna l'effetto speciale del Boss (se visibile)
    const activeBoss = (players[COOP.MONSTER_FACTION]?.agents || []).find(a => a._isBoss && a.hp > 0);
    if (activeBoss) {
        // Controlla se la cella del boss è nella nebbia per il client
        // (opzionale, ma evita il bagliore attraverso la nebbia)
        const bp  = hexToPixel(activeBoss.q, activeBoss.r);
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
        ctx.font      = `${Math.round(HEX_SIZE * 0.8)}px Arial`; 
        ctx.globalAlpha = 0.6 + 0.4 * pulse;
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur  = 15 * pulse;
        ctx.fillText('💀', bp.x, bp.y + HEX_SIZE * 0.4); 
        ctx.globalAlpha = 1;
        ctx.shadowBlur  = 0;
    }

    // 4. Disegna Infezioni sulle Tane
    coopState.lairs.forEach(l => {
        if (!l.destroyed && l.infectedTurns > 0 && l.explored) {
            const p = hexToPixel(l.q, l.r);
            ctx.font = `${Math.round(HEX_SIZE * 0.6)}px Arial`;
            ctx.fillText('🦠', p.x + HEX_SIZE * 0.4, p.y - HEX_SIZE * 0.4);
        }
    });

    // 5. Disegna Sopravvissuto
    if (coopState.survivor && coopState.survivor.carrierId !== 'SAVED') {
        const s = coopState.survivor;
        const isExplored = coopState.cellsExplored.has(getKey(s.q, s.r));
        if (isExplored || s.carrierId) {
            const p = hexToPixel(s.q, s.r);
            ctx.font = `${Math.round(HEX_SIZE * 0.6)}px Arial`;
            
            if (s.carrierId) {
                // Disegna una piccola icona sopra l'agente che lo trasporta
                ctx.fillText('🧑‍🔧', p.x + HEX_SIZE * 0.4, p.y - HEX_SIZE * 0.5);
            } else {
                ctx.fillText('🧑‍🔧', p.x, p.y);
                ctx.font = `bold ${Math.round(HEX_SIZE * 0.3)}px Courier New`;
                ctx.fillStyle = '#00aaff';
                ctx.fillText('SOS', p.x, p.y + HEX_SIZE * 0.35);
            }
        }
    }

    // 6. Disegna Drone Abbattuto
    if (coopState.drone) {
        const d = coopState.drone;
        const isExplored = coopState.cellsExplored.has(getKey(d.q, d.r));
        if (isExplored) {
            const p = hexToPixel(d.q, d.r);
            ctx.font = `${Math.round(HEX_SIZE * 0.7)}px Arial`;
            ctx.fillText('📡', p.x, p.y);
            if (d.analyzerId) {
                ctx.font = `bold ${Math.round(HEX_SIZE * 0.3)}px Courier New`;
                ctx.fillStyle = '#FFD700';
                ctx.fillText(`${d.turns}/2`, p.x, p.y + HEX_SIZE * 0.35);
            }
        }
    }

    ctx.restore();
}

// ============================================================
// VITTORIA / SCONFITTA
// ============================================================

function _coopCheckExitVictory() {
    // La vittoria scatta SOLO se il boss è stato sconfitto
    if (!coopState.active || !coopState.bossDefeated || !coopState.exitCell) return;
    
    coopState.playersInExit.clear();

    for (let p = 1; p <= window._coopHumanPlayers; p++) {
        const agents = (players[p].agents || []).filter(a => a.hp > 0);
        agents.forEach(a => {
            // Conta come "nell'uscita" se è sopra la cella O adiacente (distanza <= 1)
            if (hexDistance(a, coopState.exitCell) <= 1) {
                coopState.playersInExit.add(p);
            }
        });
    }

    const activePlayers = [];
    for (let p = 1; p <= window._coopHumanPlayers; p++) {
        if ((players[p].agents || []).some(a => a.hp > 0)) activePlayers.push(p);
    }

    const allReached = activePlayers.length > 0 && activePlayers.every(p => coopState.playersInExit.has(p));
    if (allReached) _coopVictory('Tutti i giocatori hanno raggiunto la via di fuga!');
}

function _coopBossDefeated(killerFaction) {
    coopState.bossAgent = null;
    coopState.bossDefeated = true; // Sblocca la porta!

    for (let p = 1; p <= window._coopHumanPlayers; p++) {
        if (players[p] && players[p].agents && players[p].agents.length > 0) {
            players[p].credits = (players[p].credits || 0) + COOP.BOSS_REWARD;
        }
    }
    if (typeof showNotificationBanner === 'function') {
        showNotificationBanner(
            `💀 BOSS SCONFITTO!<br>Via di fuga sbloccata!`,
            '#FFD700', { top: '50px', duration: 6000, fontSize: '20px' }
        );
    }
    // Rimossa la vittoria immediata (setTimeout(() => _coopVictory...))
}

function _coopVictory(reason) {
    coopState.active = false;
    state = 'GAME_OVER';
    setTimeout(function() {
        if (typeof showGameOverlay === 'function') showGameOverlay('MISSIONE COMPLETATA! 🏆', reason, '#FFD700');
        if (typeof isOnline !== 'undefined' && isOnline && isHost && typeof sendOnlineMessage === 'function') {
            sendOnlineMessage({ type: 'GAME_OVER', title: 'MISSIONE COMPLETATA! 🏆', message: reason, color: '#FFD700' });
        }
    }, 2000);
}

function _coopDefeat() {
    coopState.active = false;
    state = 'GAME_OVER';
    setTimeout(function() {
        if (typeof showGameOverlay === 'function') showGameOverlay('MISSIONE FALLITA', 'Tutti gli agenti umani sono stati eliminati.', '#ff3333');
        if (typeof isOnline !== 'undefined' && isOnline && isHost && typeof sendOnlineMessage === 'function') {
            sendOnlineMessage({ type: 'GAME_OVER', title: 'MISSIONE FALLITA', message: 'Tutti gli agenti umani sono stati eliminati.', color: '#ff3333' });
        }
    }, 2000);
}

// ============================================================
// HUD COOP
// ============================================================

function _coopRenderHUD() {
    // Rimuove vecchi elementi se esistono
    document.getElementById('coop-hud')?.remove();
    document.getElementById('coop-hud-btn')?.remove();

    // Legge il colore della fazione attiva (fallback viola se non disponibile)
    const factionColor = players[currentPlayer]?.color || '#cc00ff';

    // 1. Crea il Pulsante Toggle (Posizionato sotto al tasto RESA)
    const btn = document.createElement('button');
    btn.id = 'coop-hud-btn';
    btn.innerHTML = '📜 COOP';
    btn.style.cssText = `
        position: fixed; 
        top: 45px; /* Sotto al tasto RESA (che è a top: 5px) */
        left: 5px; 
        z-index: 1000;
        background: rgba(0, 0, 0, 0.8); 
        border: 2px solid ${factionColor}; 
        color: ${factionColor};
        padding: 8px 12px; 
        border-radius: 4px; 
        font-size: 14px;
        font-family: 'Courier New', monospace; 
        cursor: pointer; 
        font-weight: bold;
        transition: all 0.3s;
    `;
    document.body.appendChild(btn);

    // 2. Crea il Pannello (Posizionato sotto al pulsante)
    const hud = document.createElement('div');
    hud.id = 'coop-hud';
    hud.style.cssText = `
        position: fixed; 
        top: 85px; /* Subito sotto al nuovo pulsante */
        left: 5px; 
        z-index: 5000;
        background: rgba(5,5,15,0.88); 
        border: 1px solid ${factionColor};
        border-radius: 8px; 
        padding: 12px 14px; 
        font-family: 'Courier New', monospace;
        color: #fff; 
        font-size: 12px; 
        min-width: 200px; 
        max-width: 240px;
        box-shadow: 0 0 15px ${factionColor}44; 
        pointer-events: none; /* Lascia passare i click verso la mappa */
        display: block; /* Parte visibile, il giocatore può chiuderlo */
    `;
    document.body.appendChild(hud);

    // 3. Logica Toggle: Apre/Chiude il pannello al click
    btn.onclick = () => {
        const isHidden = hud.style.display === 'none';
        hud.style.display = isHidden ? 'block' : 'none';
        // Effetto visivo sul pulsante quando il menu è aperto
        btn.style.background = isHidden ? `${factionColor}33` : 'rgba(0, 0, 0, 0.8)';
        if (typeof playSFX === 'function') playSFX('click');
    };

    // Popola subito i dati nel pannello
    _coopUpdateHUD();
}

function _coopUpdateHUD() {
    const hud = document.getElementById('coop-hud');
    if (!hud || !coopState.active) return;

    const questsHTML = coopState.quests.map(q => `
        <div style="display:flex;justify-content:space-between;align-items:center;
             margin-bottom:4px;padding:3px 6px;background:rgba(255,255,255,0.04);border-radius:4px;">
            <span style="color:${q.completed ? '#00ff88' : '#aaa'};font-size:11px;">
                ${q.completed ? '✅' : '⬜'} ${q.text}
            </span>
            <span style="color:#FFD700;font-size:10px;white-space:nowrap;margin-left:6px;">
                ${q.completed ? 'FATTO' : `${q.progress}/${q.target}`}
            </span>
        </div>
    `).join('');

    const bossHP = coopState.bossAgent
        ? `<div style="margin-bottom:8px;padding:6px;background:rgba(255,0,0,0.08);border-radius:4px;border:1px solid #ff3333;">
              💀 <span style="color:#ff3333;font-weight:bold;">BOSS:</span>
              <span style="color:#fff;">${coopState.bossAgent.hp}/${coopState.bossAgent.maxHp} HP</span>
           </div>`
        : '';

    const villagesHTML = `🏘️ Villaggi: <b>${coopState.villagesFound}/${COOP.VILLAGE_COUNT}</b>`;
    const bossProgressHTML = `💀 Boss: <b style="color:#ff3333">${coopState.bossesDefeated}/${coopState.totalBossesToKill}</b>`;
    const monstersHTML = `👾 Kill: <b>${coopState.monstersKilled}</b>`;

    hud.innerHTML = `
        <div style="color:#cc00ff;font-weight:bold;margin-bottom:8px;font-size:13px;
             text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #333;padding-bottom:6px;">
            ⚔️ MISSIONE COOP
        </div>
        ${bossHP}
        <div style="margin-bottom:8px;color:#aaa;font-size:11px;">
            ${bossProgressHTML} 
        </div>
        <div style="margin-bottom:8px;color:#aaa;font-size:11px;">
            ${monstersHTML} &nbsp;|&nbsp; ${villagesHTML}
        </div>
        <div style="color:#888;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">
            Quest attive
        </div>
        ${questsHTML}
        <div style="margin-top:8px;color:#FFD700;font-size:11px;border-top:1px solid #333;padding-top:6px;line-height:1.3;">
            ${coopState.bossDefeated ? '🚪 <b>FUGGITE!</b> Riunitevi all\'uscita!' : '🔒 <b>Obiettivo:</b> Trova l\'uscita e sconfiggi il Boss per aprirla!'}
        </div>
    `;
    _coopBroadcastStateIfHost();
}

function _coopBroadcastStateIfHost() {
    if (typeof isOnline !== 'undefined' && isOnline && isHost &&
        typeof broadcastToClients === 'function') {
        broadcastToClients({ type: 'COOP_STATE_SYNC', coopSnapshot: _coopSerializeState() });
    }
}

// ============================================================
// MENU LOCALE (Iniezione Bottone)
// ============================================================

function showCoopMenu() {
    const localOpts = document.getElementById('local-options');
    if (!localOpts) return;
    if (document.getElementById('coop-menu-block')) return;

    const block = document.createElement('div');
    block.id = 'coop-menu-block';
    block.style.cssText = 'margin-top:15px; text-align:center;';
    block.innerHTML = `
    <div style="border-top:1px solid #333; padding-top:20px; margin-top:15px;">
        <p style="color:#a0a0b0; margin-bottom:15px; font-size:13px; text-transform:uppercase; letter-spacing:1px;">
            <span style="display:inline-block; width:0; height:0; overflow:visible; position:relative;"><img src="img/coop.png" style="height:3.6em; position:absolute; top:-0.5em; left:-2em; transform:translateY(-50%); pointer-events:none;"></span><span style="margin-left:2.8em;"> cooperativa</span>
        </p>
        <div style="display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
            ${[1,2,3,4].map(n => `
                <button class="action-btn" onclick="startCoopGame(${n})"
                style="padding:10px 12px; border:2px solid #00aaff; color:#00aaff; cursor:pointer; background:rgba(0,170,255,0.08); border-radius:12px; box-shadow:0 0 10px #00aaff inset, 0 0 20px #00aaff, 0 0 45px #00aaff99;">
                ${n}P COOP
                </button>
                `).join('')}
            </div>
        </div>
    `;
    localOpts.appendChild(block);
}

(function _patchShowLocalMenu() {
    const _origShowLocal = window.showLocalMenu;
    if (!_origShowLocal) return;
    window.showLocalMenu = function () {
        _origShowLocal();
        showCoopMenu();
    };
})();

// ============================================================
// MODALITÀ COOP ONLINE
// ============================================================

/**
 * Chiamata dall'host quando preme "AVVIA COOP".
 * Replica hostStartGame() ma segna totalPlayers = 9 (fazione mostri)
 * e aggiunge la fazione 9 come AI online.
 */
function hostStartOnlineCoop() {
    if (!window.isHost || !window.isOnline) return;
    if (typeof campaignState !== 'undefined') campaignState.isActive = false;

    const numHumans = window.onlineTotalPlayers;
    window._coopHumanPlayers = numHumans;

    // 1. Avvisa i client: faranno setup coop
    broadcastToClients({ type: 'COOP_ONLINE_START', numHumanPlayers: numHumans });

    // 2. Imposta totalPlayers=9 e registra F9 come AI
    if (!window.onlineAIFactions) window.onlineAIFactions = new Set();
    window.onlineAIFactions.add(COOP.MONSTER_FACTION);
    onlineAIFactions.add(COOP.MONSTER_FACTION);   // ← aggiunge anche alla variabile locale usata da isHostAITurn()
    window.onlineTotalPlayers = COOP.MONSTER_FACTION;
    totalPlayers  = COOP.MONSTER_FACTION;
    currentPlayer = 1;

    // 3. Reset giocatori e inizializza slot mostri
    resetPlayers();
    players[COOP.MONSTER_FACTION] = {
        hq: null, agents: [], color: COLORS.p2,
        name: 'Mostri', credits: 0, _cosmeticFaction: 2, cards: [],
    };

    // 4. Registra hook coop
    coopState.active = false;
    _coopRegisterHooks();

    // Neutralizza tryHostStart durante la coop: i SETUP_DONE dei client
    // aggiornano playersReady ma non devono avviare il flusso normale.
    window._origTryHostStart = window.tryHostStart;
    window.tryHostStart = function() {};  // no-op durante il setup coop

    // 5. Patcha confirmPlayerSetup: l'host fa il suo setup,
    //    poi aspetta i SETUP_DONE dei client via polling su playersReady.
    window._origConfirmPlayerSetup = window.confirmPlayerSetup;
    window.confirmPlayerSetup = function() {
        playSFX('click');

        const cosmeticFaction = players[1]._cosmeticFaction ?? 1;
        playFactionMusic(cosmeticFaction);

        if (setupData.agents.length === 0) { alert('Devi reclutare almeno un agente.'); return; }

        players[1].agents    = JSON.parse(JSON.stringify(setupData.agents));
        players[1].cards     = typeof getFinalCardSelection === 'function' ? getFinalCardSelection() : [];
        players[1].usedCards = {};
        players[1].credits   = setupData.points || 0;

        window.confirmPlayerSetup = window._origConfirmPlayerSetup;
        window.tryHostStart = window._origTryHostStart; // ripristina

        // Schermata attesa per gli altri client
        document.getElementById('setup-overlay').style.display = 'none';
        let waitDiv = document.getElementById('coop-host-wait');
        if (!waitDiv) {
            waitDiv = document.createElement('div');
            waitDiv.id = 'coop-host-wait';
            waitDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#cc00ff;font-family:Courier New,monospace;font-size:1.4em;text-align:center;z-index:5000;';
            waitDiv.innerHTML = '👾 Setup inviato!<br><span style="font-size:0.7em;color:#aaa;">In attesa degli altri giocatori...</span>';
            document.body.appendChild(waitDiv);
        }

        // Polling: aspetta SETUP_DONE da tutti i client (slot 2..numHumans)
        const waitForClients = setInterval(() => {
            for (let p = 2; p <= numHumans; p++) {
                if (!playersReady[p]) return;
            }
            clearInterval(waitForClients);
            document.getElementById('coop-host-wait')?.remove();

            // Applica agenti di tutti i client dal buffer
            for (const [p, agents] of Object.entries(clientSetupBuffer || {})) {
                const pNum = parseInt(p);
                if (pNum >= 2 && pNum <= numHumans && players[pNum]) {
                    players[pNum].agents    = agents;
                    //players[pNum].credits   = COOP.STARTING_CREDITS;
                    players[pNum].usedCards = {};
                }
            }

            _coopLaunchOnline();
        }, 300);
    };

    // 6. Mostra setup host
    document.getElementById('network-menu').style.display = 'none';
    setupData = { points: COOP.STARTING_CREDITS, agents: [] };
    updateSetupUI();
}


/**
 * Versione online di _coopLaunch:
 * genera la mappa coop, poi invia GAME_STATE + COOP_STATE_SYNC ai client.
 */
function _coopLaunchOnline() {
    // Reset stato coop
    _coopAssignRandomMonsterFaction();
    GAME.REWARD_KILL = COOP.LAIR_REWARD_KILL;
    coopState.active        = true;
    coopState.villages      = [];
    coopState.lairs         = [];
    coopState.quests        = [];
    coopState.bossSpawned   = false;
    coopState.bossAgent     = null;
    coopState.exitCell      = null;
    coopState.exitExplored  = false;
    coopState.bossDefeated  = false;
    coopState.playersInExit = new Set();
    coopState.turnCount     = 0;
    coopState.virtualLairTimer   = 2;
    coopState.monstersKilled     = 0;
    coopState.cellsExplored      = new Set();
    coopState.lairsDestroyed    = 0;
    coopState.villagesFound     = 0;
    coopState.bigMonstersKilled = 0;
    coopState.villageRecruited  = 0;
    coopState.cornersExplored   = new Set();    
    coopState.stealthKills       = 0;
    coopState.villageRecruits    = 0;
    coopState.healsPerformed     = 0;
    coopState.killsThisTurn      = 0;
    coopState.pacifistRounds     = 0;
    coopState.monsterKilledThisRound = false;
    coopState.guardianKills      = 0;
    coopState.totalBossesToKill = window._coopHumanPlayers; 
    coopState.bossesDefeated = 0;

    // Genera la mappa procedurale grande (totalPlayers = 9 → mappa gigante)
    generateProceduralMap();
    _coopRepositionPlayers();
    _coopBuildExitZone();
    _coopPlaceVillages();
    _coopPlaceLairs();
    _coopInitQuests();
    _coopPlaceSpecials();

    // Rimuovi HQ virtuali
    for (let p = 1; p <= totalPlayers; p++) {
        if (players[p] && players[p].hq) {
            const hqCell = grid.get(getKey(players[p].hq.q, players[p].hq.r));
            if (hqCell) hqCell.entity = null;
            players[p].hq = null;
        }
    }

    // --- Costruisce e invia GAME_STATE (come tryHostStart normale) ---
    const startingPlayer = 1; // In coop inizia sempre P1
    const walls = [], terrains = [];
    grid.forEach(cell => {
        if (cell.type === 'wall' || cell.type === 'barricade' || cell.type === 'water') {
            walls.push({ q: cell.q, r: cell.r, type: cell.type,
                hp: cell.hp, maxHp: cell.maxHp,
                sprite: cell.sprite, customSpriteId: cell.customSpriteId });
        }
        if (cell.terrain) terrains.push({ q: cell.q, r: cell.r, terrain: cell.terrain });
    });

    const playersSnapshot = {};
    for (let p = 1; p <= totalPlayers; p++) {
        playersSnapshot[p] = {
            ...players[p],
            color:            players[p].color,
            name:             players[p].name,
            _cosmeticFaction: players[p]._cosmeticFaction ?? p,
        };
    }
    const playerCards = {};
    for (let p = 1; p <= totalPlayers; p++) playerCards[p] = players[p].cards || [];

    // Serializza lo stato coop per i client
    const coopSnapshot = _coopSerializeState();

    broadcastToClients({
        type: 'GAME_STATE',
        state: {
            themeId:           SELECTED_BG_ID,
            walls, terrains,
            players:           playersSnapshot,
            totalPlayers:      totalPlayers,
            startingPlayer,
            firstPlayerOfGame: startingPlayer,
            onlineAIFactions:  Array.from(window.onlineAIFactions),
            playerCards,
            controlPoints:     Array.from(controlPoints.values()),
            // Payload coop aggiuntivo
            isCoopMode:        true,
            coopSnapshot,
            coopHumanPlayers:  window._coopHumanPlayers,
        },
    });

    // Avvia localmente
    _coopPatchAutoFitForSpawn(1);
    startActiveGameUI(startingPlayer);
    _coopRenderHUD();
    if (typeof showNotificationBanner === 'function') {
        showNotificationBanner(
            '⚔️ MODALITÀ COOP — Esplorate a Nord e sconfiggete il BOSS!',
            '#cc00ff', { top: '60px', duration: 5000, fontSize: '16px' }
        );
    }

    // Centra la camera sull'agente DOPO autoFitMap, e imposta uno zoom ravvicinato
    const _firstAgent = players[1]?.agents?.find(a => a.hp > 0);
    if (_firstAgent) {
        HEX_SIZE = 65;
        offsetX = -(HEX_SIZE * (Math.sqrt(3) * _firstAgent.q + Math.sqrt(3) / 2 * _firstAgent.r));
        offsetY = -(HEX_SIZE * (3 / 2 * _firstAgent.r));
        clampCamera();
    }

    drawGame();

    // --- FIX CRITICO: DESYNC POSIZIONI ---
    // Forza una sincronizzazione completa per inviare ai client le posizioni 
    // esatte degli agenti appena calcolate da _coopRepositionPlayers
    setTimeout(() => {
        if (typeof window._hostSendFullSync === 'function') {
            window._hostSendFullSync();
        }
    }, 500);

}

/**
 * Serializza lo stato coop (celle speciali + quest) da inviare ai client.
 */
function _coopSerializeState() {
    return {
        villages:      coopState.villages,
        lairs:         coopState.lairs.map(l => ({ q: l.q, r: l.r, destroyed: l.destroyed || false, turnsUntilSpawn: l.turnsUntilSpawn })),
        exitCell:      coopState.exitCell,
        quests:        coopState.quests,
        bossDefeated:  coopState.bossDefeated,
        monstersKilled: coopState.monstersKilled,
        villagesFound: coopState.villagesFound,
        turnCount:     coopState.turnCount,
        totalBossesToKill: coopState.totalBossesToKill,
        bossesDefeated:   coopState.bossesDefeated,
        lairsDestroyed:   coopState.lairsDestroyed, // <--- FIX: Trasmette le tane distrutte
        survivor:      coopState.survivor,
        drone:         coopState.drone,
        bossAgentId:   coopState.bossAgent ? coopState.bossAgent.id : null,
    };
}

/**
 * Applica il payload coop ricevuto nel GAME_STATE (lato client).
 * Chiamata dopo receiveGameState() ma prima di startActiveGameUI().
 */
function _coopApplySnapshot(snapshot, numHumanPlayers) {
    if (!snapshot) return;

    window._coopHumanPlayers = numHumanPlayers;

    coopState.active        = true;
    GAME.REWARD_KILL        = COOP.LAIR_REWARD_KILL;
    coopState.villages      = snapshot.villages      || [];
    coopState.lairs         = snapshot.lairs         || [];
    coopState.exitCell      = snapshot.exitCell      || null;
    coopState.quests        = snapshot.quests        || [];
    coopState.bossDefeated  = snapshot.bossDefeated  || false;
    coopState.monstersKilled = snapshot.monstersKilled || 0;
    coopState.villagesFound = snapshot.villagesFound  || 0;
    coopState.turnCount     = snapshot.turnCount      || 0;
    coopState.totalBossesToKill = snapshot.totalBossesToKill || numHumanPlayers;
    coopState.bossesDefeated   = snapshot.bossesDefeated   || 0;
    coopState.bossSpawned   = false;
    coopState.bossAgent     = null;
    coopState.playersInExit = new Set();
    coopState.survivor      = snapshot.survivor      || null;
    coopState.drone         = snapshot.drone         || null;

    // Ricostruisce i flag sulle celle della griglia
    if (coopState.exitCell) {
        const c = grid.get(getKey(coopState.exitCell.q, coopState.exitCell.r));
        if (c) c._coopExit = true;
    }
    coopState.villages.forEach(v => {
        const c = grid.get(getKey(v.q, v.r));
        if (c) c._coopVillage = true;
    });
    coopState.lairs.forEach(l => {
        if (l.destroyed) return;
        const c = grid.get(getKey(l.q, l.r));
        if (c) c._coopLair = true;
    });

    // Il boss potrebbe essere già presente come agente nella fazione 9
    coopState.bossAgent   = null;
    coopState.bossSpawned = false;
    
    if (snapshot.bossAgentId && players[COOP.MONSTER_FACTION] && players[COOP.MONSTER_FACTION].agents) {
        const foundBoss = players[COOP.MONSTER_FACTION].agents.find(a => a.id === snapshot.bossAgentId);
        if (foundBoss) {
            coopState.bossAgent   = foundBoss;
            coopState.bossSpawned = true;
        }
    } else {
        // Fallback robusto per vecchi snapshot o primo avvio
        const fallbackBoss = (players[COOP.MONSTER_FACTION]?.agents || []).find(a => a._isBoss && a.hp > 0);
        if (fallbackBoss) {
            coopState.bossAgent   = fallbackBoss;
            coopState.bossSpawned = true;
        }
    }

    // Registra gli hook coop sul client
    _coopRegisterHooks();
    _coopPatchAutoFitForSpawn(myPlayerNumber || 1);
    _coopRenderHUD();
    _coopUpdateHUD();
    if (typeof updateIngameCardsUI === 'function') updateIngameCardsUI();
}

// ============================================================
// INTERCETTA GAME_STATE SUL CLIENT PER ATTIVARE LA COOP
// ============================================================

// Patcha handleClientReceivedData per intercettare GAME_STATE con isCoopMode
(function _installCoopGameStateHook() {
    // Aspettiamo che la funzione esista (è in network_sync.js, caricato prima)
    setTimeout(function() {
        if (typeof registerClientMessageHandler !== 'function') return;

        // Intercettiamo COOP_ONLINE_START: il client sa che arriverà una partita coop
        registerClientMessageHandler('COOP_ONLINE_START', function(data) {
            window._pendingCoopHumanPlayers = data.numHumanPlayers;
            document.getElementById('online-color-picker')?.remove();
            document.getElementById('network-menu').style.display = 'none';
            setupData = { points: COOP.STARTING_CREDITS, agents: [] };
            updateSetupUI();
        });

        // Patchiamo _applyFullStateSync (già definita in network_sync.js) per
        // riattivare la coop in caso di resync durante la partita
        const _origApplyFull = window._applyFullStateSync;
        if (_origApplyFull) {
            window._applyFullStateSync = function(st) {
                _origApplyFull(st);
                if (st && st.isCoopMode && st.coopSnapshot && !coopState.active) {
                    _coopApplySnapshot(st.coopSnapshot, st.coopHumanPlayers || window._coopHumanPlayers || 1);
                }
            };
        }
    }, 600);
})();

// Patcha receiveGameState (in map.js) per intercettare GAME_STATE con isCoopMode
(function _installCoopReceiveGameStateHook() {
    setTimeout(function() {
        const _origReceive = window.receiveGameState;
        if (!_origReceive) return;

        window.receiveGameState = function(netState) {
            _origReceive(netState);
            if (netState.isCoopMode && netState.coopSnapshot) {
                _coopApplySnapshot(netState.coopSnapshot, netState.coopHumanPlayers || window._pendingCoopHumanPlayers || 1);
            }
        };
    }, 700);
})();

// Patcha anche _hostSendFullSync per includere il payload coop nei sync successivi
(function _installCoopFullSyncHook() {
    setTimeout(function() {
        const _origSendFull = window._hostSendFullSync;
        if (!_origSendFull) return;

        window._hostSendFullSync = function(targetPlayerNum) {
            // Chiama l'originale
            _origSendFull(targetPlayerNum);

            // Se siamo in coop online, invia anche lo stato coop aggiornato
            if (coopState.active && window.isOnline && window.isHost) {
                const coopMsg = {
                    type: 'COOP_STATE_SYNC',
                    coopSnapshot:      _coopSerializeState(),
                    coopHumanPlayers:  window._coopHumanPlayers,
                };
                if (targetPlayerNum !== null) {
                    const c = clientConns[targetPlayerNum];
                    if (c && c.open) try { c.send(JSON.stringify(coopMsg)); } catch(e) {}
                } else {
                    broadcastToClients(coopMsg);
                }
            }
        };

        // Il client riceve COOP_STATE_SYNC per aggiornare quest/villaggi durante la partita
        if (typeof registerClientMessageHandler === 'function') {
            registerClientMessageHandler('COOP_STATE_SYNC', function(data) {
                if (!data.coopSnapshot) return;
                // Aggiornamento leggero: solo quest, boss, contatori
                const s = data.coopSnapshot;
                if (s.quests)         coopState.quests         = s.quests;
                if (s.bossDefeated !== undefined) coopState.bossDefeated = s.bossDefeated;
                if (s.monstersKilled !== undefined) coopState.monstersKilled = s.monstersKilled;
                if (s.villagesFound !== undefined)  coopState.villagesFound  = s.villagesFound;
                if (s.turnCount !== undefined)      coopState.turnCount      = s.turnCount;
                
                // IL CLIENT SI ALLINEA ALL'HOST
                if (s.lairsDestroyed !== undefined) {
                    coopState.lairsDestroyed = s.lairsDestroyed;
                    // Trova la quest delle tane e forza il progresso al valore ricevuto
                    const quest = coopState.quests.find(q => q.type === 'kill_lair');
                    if (quest) quest.progress = s.lairsDestroyed;
                }

                _coopUpdateHUD();
                if (s.lairsDestroyed !== undefined) coopState.lairsDestroyed = s.lairsDestroyed; // <--- FIX: Aggiorna il contatore interno
                _coopUpdateHUD();
            });
        }
    }, 700);
})();


// ============================================================
// GESTIONE EVENTI DI RETE COOP (Reclutamento, Resurrezione e Infezione)
// ============================================================
setTimeout(function() {
    if (typeof registerHostMessageHandler === 'function') {
        // HOST: Riceve la richiesta di reclutamento da un Client
        registerHostMessageHandler('COOP_RECRUIT_REQ', function(data, fromPlayer) {
            if (data.faction !== fromPlayer) return;
            if ((players[data.faction].credits || 0) < data.cost) return;
            const village = coopState.villages.find(v => v.q === data.vq && v.r === data.vr);
            if (!village || village.recruitsLeft <= 0) return;
            
            _coopApplyRecruit(data.faction, data.agent, data.cost, data.vq, data.vr);
        });

        // HOST: Riceve la richiesta di Resurrezione da un Client
        registerHostMessageHandler('COOP_REVIVE_REQ', function(data, fromPlayer) {
            if (data.reviverFaction !== fromPlayer) return;
            if ((players[data.reviverFaction].credits || 0) < 0) return;
            
            _coopApplyRevive(data.reviverFaction, data.deadFaction, data.vq, data.vr);
        });

        // --- NUOVO --- HOST: Riceve richiesta Infezione da un Client
        registerHostMessageHandler('COOP_INFECT_REQ', function(data, fromPlayer) {
            if (data.faction !== fromPlayer) return;
            _coopApplyInfection(data.q, data.r, fromPlayer);
        });
    }

    if (typeof registerClientMessageHandler === 'function') {
        // CLIENT: Riceve l'aggiornamento di un reclutamento
        registerClientMessageHandler('COOP_RECRUIT_SYNC', function(data) {
            players[data.faction].credits -= data.cost;
            const village = coopState.villages.find(v => v.q === data.vq && v.r === data.vr);
            if (village) village.recruitsLeft--;

            placeEntityAt(data.agent, data.agent.q, data.agent.r);
            players[data.faction].agents.push(data.agent);

            if (typeof showNotificationBanner === 'function') {
                showNotificationBanner('🪖 Nuova recluta unita al gruppo!', players[data.faction].color, { top: '80px', duration: 3000 });
            }
            _coopUpdateHUD();
            updateUI();
            drawGame();
        });

        // CLIENT: Riceve la distruzione di una tana
        registerClientMessageHandler('COOP_LAIR_DESTROYED', function(data) {
            const deadLair = coopState.lairs.find(l => l.q === data.q && l.r === data.r);
            if (deadLair) deadLair.destroyed = true;
            const lairCell = grid.get(getKey(data.q, data.r));
            if (lairCell) { lairCell.entity = null; lairCell._coopLair = false; }
            _coopUpdateHUD();
            drawGame();
        });

        // CLIENT: Riceve l'aggiornamento di una resurrezione
        registerClientMessageHandler('COOP_REVIVE_SYNC', function(data) {
            players[data.reviverFaction].credits -= 0;
            placeEntityAt(data.agent, data.agent.q, data.agent.r);
            players[data.deadFaction].agents.push(data.agent);

            if (typeof showNotificationBanner === 'function') {
                showNotificationBanner(`✨ ${players[data.deadFaction].name.toUpperCase()} È TORNATO IN VITA!`, players[data.deadFaction].color, { top: '80px', duration: 5000, fontSize: '18px' });
            }
            if (typeof playSFX === 'function') playSFX('heal');
            
            updateUI();
            drawGame();
        });


        // CLIENT: Riceve la conversione di un mostro addomesticato
        registerClientMessageHandler('COOP_TAME_SYNC', function(data) {
            // Cerca il mostro nella fazione 9
            const monsterIdx = players[COOP.MONSTER_FACTION].agents.findIndex(a => a.id === data.monsterId);
            if (monsterIdx === -1) return;
            const monster = players[COOP.MONSTER_FACTION].agents[monsterIdx];

            // Applica la stessa conversione dell'host (senza ribroadcast)
            players[COOP.MONSTER_FACTION].agents.splice(monsterIdx, 1);
            monster.faction     = data.tamerFaction;
            monster._isMonster  = false;
            monster._isTamed    = true;
            monster.ap          = GAME.AP_PER_TURN;
            players[data.tamerFaction].agents.push(monster);

            _coopUpdateHUD();
            drawGame();
        });

        // --- NUOVO --- CLIENT: Riceve e sincronizza l'Infezione inviata dall'Host
        registerClientMessageHandler('COOP_INFECT_SYNC', function(data) {
            _coopApplyInfection(data.q, data.r, null);
        });
    }
}, 800);

markScriptAsLoaded('coop.js');