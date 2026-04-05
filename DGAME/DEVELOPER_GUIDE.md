# Syndicate Hex Wars — Guida per Sviluppatori
> Versione codebase: v0.244 — Aggiornare questo numero ad ogni modifica rilevante.

---

## Indice
1. [Filosofia del Progetto](#1-filosofia-del-progetto)
2. [Mappa dei File](#2-mappa-dei-file)
3. [Grafo delle Dipendenze](#3-grafo-delle-dipendenze)
4. [Stato Globale — Dove Vive Ogni Dato](#4-stato-globale--dove-vive-ogni-dato)
5. [Ordine di Caricamento Script](#5-ordine-di-caricamento-script)
6. [Ricette: Come Fare le Modifiche Comuni](#6-ricette-come-fare-le-modifiche-comuni)
7. [Il Sistema di Override (carduse.js)](#7-il-sistema-di-override-cardusejs)
8. [Flusso di un Turno — Passo per Passo](#8-flusso-di-un-turno--passo-per-passo)
9. [Flusso Multiplayer](#9-flusso-multiplayer)
10. [Trappole e Insidie Note](#10-trappole-e-insidie-note)

---

## 1. Filosofia del Progetto

Il progetto usa **JavaScript vanilla senza moduli ES** — tutto è globale.
Ogni file dichiara e modifica variabili globali direttamente. Questa è una
scelta deliberata per semplicità di deployment (basta aprire index.html).

**Regole fondamentali:**
- `state.js` è l'unica fonte di verità. Nessun altro file *dichiara* le variabili di stato.
- `constants.js` contiene tutti i numeri magici. Se vuoi cambiare il bilanciamento, tocca solo lì.
- Non toccare mai grafica o funzionalità esistenti senza aver letto questa guida.

---

## 2. Mappa dei File

| File | Responsabilità | Modifica quando... |
|------|---------------|-------------------|
| `constants.js` | Costanti di bilanciamento, colori, audio, utilità pure | Vuoi cambiare HP/AP/costi/colori |
| `state.js` | Dichiarazione di tutte le variabili mutabili | Aggiungi una nuova variabile di stato |
| `assets.js` | Caricamento immagini, temi visivi | Aggiungi un tema o uno sprite |
| `graphics.js` | Rendering canvas, camera, animazioni | Cambi come vengono disegnati hex/entità |
| `map.js` | Generazione procedurale mappa, HQ, agenti, CP | Cambi la forma della mappa o il posizionamento |
| `gamelogic.js` | Turni, azioni standard, calcolo target, input | Cambi una meccanica di gioco base |
| `ai.js` | Intelligenza artificiale | Cambi il comportamento della CPU |
| `cards.js` | Definizione carte, UI selezione, UI in-game | **Aggiungi/modifichi una carta** |
| `carduse.js` | Override delle meccaniche per le carte speciali | Carta che altera movimento/sparo/build |
| `credits.js` | Sistema crediti, negozio in-game | Cambi economia/negozio |
| `setup.js` | Fase di setup: mercato agenti | Cambi come i giocatori costruiscono il team |
| `multiplayer.js` | Networking P2P via PeerJS | Cambi sincronizzazione online |
| `main.js` | Inizializzazione, input canvas, avvio partita | Cambi i controlli o l'avvio |

---

## 3. Grafo delle Dipendenze

```
constants.js  ←── (nessuna dipendenza)
     ↓
assets.js     ←── constants.js
     ↓
state.js      ←── constants.js
     ↓
graphics.js   ←── constants.js, assets.js, state.js
map.js        ←── constants.js, assets.js, state.js
     ↓
multiplayer.js ←── constants.js, state.js, map.js, graphics.js, setup.js, cards.js, gamelogic.js
gamelogic.js  ←── constants.js, state.js, graphics.js, map.js, multiplayer.js, ai.js, cards.js
ai.js         ←── constants.js, state.js, gamelogic.js, multiplayer.js
cards.js      ←── constants.js, state.js, graphics.js, gamelogic.js, multiplayer.js
     ↓
setup.js      ←── constants.js, assets.js, state.js, multiplayer.js, cards.js, main.js
credits.js    ←── constants.js, state.js, graphics.js, gamelogic.js, cards.js, multiplayer.js
carduse.js    ←── constants.js, state.js, graphics.js, gamelogic.js, cards.js
     ↓
main.js       ←── tutto il resto
```

**Regola d'oro:** se devi usare una funzione di un file "più in basso" nel grafo,
stai per creare una dipendenza circolare. Risolvi estraendo la logica in un helper
in `constants.js` o `state.js`.

---

## 4. Stato Globale — Dove Vive Ogni Dato

### Dati di partita (state.js)

| Variabile | Tipo | Significato |
|-----------|------|-------------|
| `state` | string | `'SETUP_P1'` \| `'PLAYING'` \| `'GAME_OVER'` |
| `currentPlayer` | number | Fazione attiva (1–4) |
| `totalPlayers` | number | Numero totale di giocatori |
| `turnCount` | number | Numero di round completati |
| `grid` | Map | `getKey(q,r)` → `cell` |
| `controlPoints` | Map | `getKey(q,r)` → `{q,r,faction}` |
| `players[1..4]` | object | `{hq, agents[], color, credits, cards[], usedCards{}}` |
| `selectedAgent` | object\|null | Agente attualmente selezionato |
| `currentActionMode` | string\|null | Modalità azione attiva |
| `validActionTargets` | array | Celle cliccabili per l'azione corrente |

### Struttura di una `cell` (griglia)
```js
{
  q, r,           // coordinate assiali
  type,           // 'empty' | 'wall' | 'barricade'
  entity,         // null | agent | hq
  hp, maxHp,
  sprite,         // emoji fallback
  customSpriteId  // chiave in customImages
}
```

### Struttura di un `agent`
```js
{
  id,             // UUID univoco
  type,           // 'agent'
  faction,        // 1–4
  sprite,         // emoji fallback
  customSpriteId, // chiave in customImages
  hp, maxHp,
  mov,            // passi per turno
  rng,            // gittata di tiro
  dmg,            // danno per colpo
  ap,             // action points rimanenti nel turno
  q, r,           // posizione attuale
  // --- Buff temporanei (puliti da carduse.js a fine turno) ---
  shielded,       // bool — Scudo Potenziato (C07)
  sniperBuff,     // bool — Cecchino attivo (C03)
  sniperPierce,   // bool — colpo penetrante (C03)
  originalRng,    // rng prima del buff cecchino
  demoBuff,       // bool — Demolizione attiva (C05)
  originalDmg,    // dmg prima del buff demolizione
  infiltrateBuff, // bool — Infiltrazione attiva (C06)
  fortinoActive,  // bool — Fortino in costruzione (C02)
  fortinoBuilds,  // number — barricate Fortino rimaste
  empDebuff,      // number — AP da sottrarre al prossimo turno (C09)
}
```

---

## 5. Ordine di Caricamento Script

L'ordine in `index.html` è **critico** — ogni script usa variabili
dichiarate dai precedenti:

```html
constants.js   ← sempre primo
assets.js
state.js
graphics.js
map.js
multiplayer.js
gamelogic.js
ai.js
cards.js
setup.js
credits.js
carduse.js     ← sempre dopo gamelogic.js e cards.js (fa override)
main.js        ← sempre ultimo (esegue window.onload)
```

---

## 6. Ricette: Come Fare le Modifiche Comuni

---

### 6.1 — Cambiare un valore di bilanciamento

**File:** `constants.js`, oggetto `GAME`

Esempio: aumentare gli HP iniziali dell'HQ da 20 a 25:
```js
// constants.js
const GAME = {
    HQ_HP: 25,   // era 20
    ...
};
```
✅ Nessun altro file da toccare.

---

### 6.2 — Aggiungere una nuova carta

**File principale:** `cards.js`, oggetto `CARD_DEFINITIONS`

Copia il template già presente in fondo a `CARD_DEFINITIONS`:
```js
CXX: {
    id: 'CXX', name: 'NomeCarta', icon: '🔥', color: '#ffffff',
    needsAgent: true,
    description: 'Descrizione regola mostrata nel tooltip.',
    apply(faction) {
        // Variabili disponibili: selectedAgent, currentPlayer, grid,
        //   players, hexDistance, hexDirections, getKey,
        //   playSFX, playSpecialVFX, updateUI, drawGame,
        //   showCardMessage, setActionMode
        showCardMessage(faction, this.id);
    },
},
```

**Regole:**
- `id` deve essere univoco (`C11`, `C12`, ecc.)
- Se la carta altera il movimento o lo sparo, aggiungi l'override in `carduse.js`
  (vedi Sezione 7).
- Se `needsAgent: false`, la carta si attiva senza selezionare un agente.
- Per carte che costano AP: aggiungi `apCost: N` e la verifica è automatica
  in `_activateIngameCard`.

---

### 6.3 — Aggiungere una nuova azione standard (non-carta)

Le azioni standard sono: `move`, `shoot`, `build`, `heal`.

Per aggiungerne una nuova (es. `sabotage`):

1. **`gamelogic.js`** — aggiungi il pulsante in `updateUI` e il ramo in `setActionMode`:
   ```js
   // In setActionMode():
   else if (mode === 'sabotage') calculateValidSabotageTargets();
   ```

2. **`gamelogic.js`** — aggiungi `calculateValidSabotageTargets()`.

3. **`gamelogic.js`** — aggiungi il ramo in `executeAction()`:
   ```js
   } else if (currentActionMode === 'sabotage') {
       // logica...
       actionCost = 1; success = true;
   }
   ```

4. **`index.html`** — aggiungi il pulsante nell'`action-btn-group`.

5. **Multiplayer:** `executeRemoteAction` è già generico — funziona senza modifiche
   se rispetti i campi `sQ, sR, tQ, tR, mode, actingPlayer`.

---

### 6.4 — Aggiungere un nuovo tipo di entità (oltre agent e hq)

1. **`state.js`** — nessuna modifica necessaria (le entità sono dentro `cell.entity`).
2. **`graphics.js`** — aggiungi il ramo di rendering in `drawGame()`, nella sezione
   "Entità (agenti e HQ)".
3. **`gamelogic.js`** — `handleEntityDeath` gestisce la morte; aggiungi il ramo
   per il nuovo tipo.
4. **`gamelogic.js`** — `calculateValidTargets` vede già tutte le entità; verifica
   che la logica `isEnemy` sia corretta per il nuovo tipo.

---

### 6.5 — Aggiungere una nuova meccanica di crediti/negozio

**File:** `credits.js`

Il negozio è diviso in sezioni renderizzate da funzioni separate:
- `_renderRecruitSection` — sezione reclutamento agenti
- `_renderCardReplaceSection` — sezione sostituzione carte

Per aggiungere una sezione:
1. Crea `_renderMyNewSection(panel, pData, credits, color)`.
2. Chiamala da `renderCreditShop()` dopo le sezioni esistenti.
3. Se richiede sincronizzazione multiplayer, aggiungi un nuovo `type` di messaggio
   in `multiplayer.js` (vedi Sezione 9).

---

### 6.6 — Aggiungere un nuovo tema visivo

**File:** `assets.js`, array `bgOptions`

```js
{ id: 'S4', path: 'img/sfondo4.jpg', prefix: 'MY', count: 15 },
```

Poi aggiungi le immagini:
- `img/sfondo4.jpg` — sfondo mappa
- `img/MY1.png` … `img/MY15.png` — sprite muri

Il tema viene scelto casualmente all'avvio. Per forzarlo:
```js
applyTheme(bgOptions[3]); // indice 3 = S4
```

---

### 6.7 — Modificare la logica AI

**File:** `ai.js`, funzione `executeAITurn`

L'AI funziona in tre fasi:
1. **Simulazione virtuale** — clona HP e posizioni senza modificare lo stato reale.
2. **Generazione piano** — loop `while` che assegna azioni secondo priorità A→B→C→D.
3. **Esecuzione animata** — esegue il piano step-by-step con `delay()`.

Per cambiare le priorità, modifica i punteggi nella Fase 2:
```js
// Esempio: dare più priorità all'HQ nemico (abbassare la penalità +12)
const dHQ = hexDistance(...) + 6;  // era +12
```

Per aggiungere una nuova strategia AI, aggiungi un blocco `// --- E. ---` nel loop
seguendo il pattern degli esistenti.

---

### 6.8 — Aggiungere/modificare messaggi di rete (multiplayer)

**File:** `multiplayer.js`

Ogni tipo di messaggio ha:
- Una riga di invio (in chi lo genera, es. `sendOnlineMessage({ type: 'MY_MSG', ... })`)
- Un ramo in `handleHostReceivedData` (lato host)
- Un ramo in `handleClientReceivedData` (lato client)

Pattern minimo per un nuovo messaggio:
```js
// Nel file che genera il messaggio:
sendOnlineMessage({ type: 'MY_MSG', dato1: x, dato2: y });

// In multiplayer.js — handleHostReceivedData:
} else if (data.type === 'MY_MSG') {
    applyMyMsg(data);
    broadcastToClients(data, fromPlayer);  // propaga a tutti gli altri client

// In multiplayer.js — handleClientReceivedData:
} else if (data.type === 'MY_MSG') {
    applyMyMsg(data);
```

---

## 7. Il Sistema di Override (carduse.js)

`carduse.js` è caricato per ultimo (prima di `main.js`) e sovrascrive funzioni
di `gamelogic.js` e `graphics.js` usando il pattern:

```js
const _orig = window.nomeFunzione;
window.nomeFunzione = function(...args) {
    if (condizione_speciale) {
        // nuova logica
    } else {
        _orig(...args);  // comportamento originale
    }
};
```

### Override attivi in carduse.js

| Funzione sovrascritta | Perché | Carta |
|----------------------|--------|-------|
| `calculateValidMoves` | Aggiunge BFS attraverso muri | C06 Infiltrazione |
| `calculateValidTargets` | Aggiunge piercing del colpo | C03 Cecchino |
| `setActionMode` | Aggiunge modalità `card_airdrop`, `card_build` | C08 Airdrop, C02 Fortino |
| `executeAction` | Aggiunge danno splash, scudo, airdrop, fortino | C02, C03, C05, C07, C08 |
| `resetTurnState` | Pulisce tutti i buff; applica EMP | tutte |
| `drawGame` | Disegna alone scudo elettronico | C07 |

### Quando usare un override vs modificare gamelogic.js direttamente

- **Usa override** se la modifica riguarda solo una o più carte specifiche e
  non deve impattare il comportamento standard.
- **Modifica gamelogic.js** se la modifica è una regola universale del gioco.

---

## 8. Flusso di un Turno — Passo per Passo

```
resetTurnState()                     ← chiamata da endTurn() o all'inizio
    ├── carduse.js override:
    │   ├── Pulisce buff di tutti i giocatori (sniper, demo, infiltrate, fortino)
    │   ├── Chiama _origResetTurnState()
    │   └── Applica EMP debuff al giocatore che inizia ora
    └── _origResetTurnState() (gamelogic.js):
        ├── Ripristina AP degli agenti del giocatore corrente
        ├── Calcola reddito crediti (base viva + CP posseduti)
        ├── Incrementa turnCount se currentPlayer === 1
        ├── updateUI()
        ├── updateActivePlayerBorders()
        └── startTimer() → se AI: setTimeout(executeAITurn, delay)

--- Giocatore umano agisce ---

handleCanvasClick()
    ├── Seleziona agente → updateUI() + drawGame()
    └── Oppure esegue azione → executeAction(cell)

setActionMode(mode)
    ├── carduse.js override: gestisce card_airdrop, card_build
    └── Calcola validActionTargets → drawGame()

executeAction(targetCell)
    ├── carduse.js override (versione completa con carte)
    │   ├── card_airdrop → teletrasporto
    │   ├── card_build   → barricata gratuita (Fortino)
    │   ├── heal         → +1 HP alleato
    │   ├── move         → sposta agente, controlla cattura CP
    │   ├── shoot        → danno (con modificatori sniper/demo/shield)
    │   └── build        → barricata standard (2 AP)
    ├── Sottrae AP: selectedAgent.ap -= actionCost
    ├── checkWinConditions()
    └── cancelAction() o mantieni modalità carta

endTurn()
    ├── Calcola prossimo giocatore (salta eliminati)
    ├── Se online: sendOnlineMessage({ type: 'END_TURN', nextPlayer })
    └── resetTurnState()
```

---

## 9. Flusso Multiplayer

### Architettura
- **Host (P1):** genera mappa, valida azioni, propaga stato a tutti.
- **Client (P2–P4):** inviano solo le proprie azioni; ricevono e applicano tutto.
- **AI online:** eseguita solo sull'host, le azioni vengono poi broadcast.

### Messaggi di rete (tipi)

| type | Direzione | Significato |
|------|-----------|-------------|
| `ASSIGN_PLAYER` | Host → Client | Assegna numero fazione al client |
| `SETUP_DONE` | Client → Host | Agenti e carte del client pronti |
| `GAME_STATE` | Host → tutti | Snapshot mappa completo all'avvio |
| `ACTION` | Chiunque → Host → tutti | Azione di gioco (move/shoot/build/heal) |
| `ACTION_CARD` | Chiunque → Host → tutti | Attivazione carta strategica |
| `END_TURN` | Chiunque → Host → tutti | Fine turno, prossimo giocatore |
| `CP_CAPTURE` | Chiunque → Host → tutti | Conquista punto di controllo |
| `SHOP_RECRUIT` | Client → Host | Reclutamento agente dal negozio |
| `SHOP_CARD_REPLACE` | Client → Host | Sostituzione carta dal negozio |
| `PLAYER_DISCONNECTED` | Host → tutti | Notifica disconnessione |

### Aggiungere un nuovo messaggio di rete (checklist)

- [ ] Definire il formato: `{ type: 'MY_TYPE', campo1, campo2, ... }`
- [ ] Invio: chiamare `sendOnlineMessage(...)` nel file appropriato
- [ ] Host riceve: aggiungere ramo in `handleHostReceivedData` + `broadcastToClients`
- [ ] Client riceve: aggiungere ramo in `handleClientReceivedData`
- [ ] Scrivere `applyRemoteXxx(data)` che applica l'effetto localmente

---

## 10. Trappole e Insidie Note

### 1. carduse.js sovrascrive executeAction completamente
La versione in `carduse.js` è una **riscrittura totale** di `executeAction`,
non un wrapper. Se aggiungi una nuova azione in `gamelogic.js`, **devi aggiungere
lo stesso ramo anche in carduse.js**, altrimenti verrà ignorato in gioco.

### 2. resetTurnState è un override a catena
`carduse.js` sovrascrive `resetTurnState`. L'override chiama `_origResetTurnState()`
che è la versione di `gamelogic.js`. Se aggiungi logica in `resetTurnState` di
`gamelogic.js`, funzionerà correttamente. Se aggiungi logica nell'override di
`carduse.js`, scegli attentamente se metterla prima o dopo la chiamata a `_orig`.

### 3. Le carte vengono pulite a ogni fine turno
I buff (sniperBuff, demoBuff, infiltrateBuff, fortinoActive) vengono azzerati
in `carduse.js → resetTurnState override` per **tutti** i giocatori, non solo
per quello che ha appena giocato. Progetta le carte tenendo questo in mente.
Eccezione: `shielded` e `empDebuff` persistono tra i turni deliberatamente.

### 4. Coordinate hex assiali (pointy-top)
Le celle usano coordinate **assiali** `(q, r)`. La distanza tra due celle è
`hexDistance(a, b)` (in `constants.js`). Non confondere con le coordinate
pixel: usa sempre `hexToPixel(q, r)` e `pixelToHex(x, y)`.

### 5. La griglia non è sempre esagonale
Con 3–4 giocatori la griglia è **rettangolare** (vedi `generateProceduralMap`
in `map.js`). Algoritmi che assumono una forma esagonale falliranno per bordi
e angoli. Usa sempre `grid.has(getKey(q, r))` prima di accedere a una cella.

### 6. Doppio broadcast dei CP in multiplayer
In `handleHostReceivedData` c'è un blocco `CP_CAPTURE` duplicato (bug minore).
Non causa crash ma il secondo blocco è inutile. Da rimuovere se si tocca quel file.

### 7. validActionTargets non viene svuotato da executeAction in tutti i casi
Se `success === false`, `cancelAction()` non viene chiamato automaticamente.
L'utente deve fare click fuori da un target valido per resettare. Questo è
comportamento intenzionale per permettere di ritentare l'azione.

### 8. selectedAgent viene condiviso tra AI e logica umana
`executeAITurn` scrive su `selectedAgent` per simulare la selezione. Se il
giocatore umano ha un agente selezionato quando parte l'AI (teoricamente
impossibile, ma da tenere presente), il riferimento verrà sovrascritto.

---

## Appendice A — Aggiungere una carta: checklist completa

- [ ] Scegli id univoco (`C11`, `C12`, ...)
- [ ] Aggiungi la definizione in `CARD_DEFINITIONS` (cards.js) con template
- [ ] Scrivi `apply(faction)` — usa `showCardMessage(faction, this.id)` alla fine
- [ ] Se la carta altera movimento → override `calculateValidMoves` in carduse.js
- [ ] Se la carta altera tiro → override `calculateValidTargets` in carduse.js
- [ ] Se la carta aggiunge una nuova modalità di azione → override `setActionMode`
  e `executeAction` in carduse.js
- [ ] Se la carta aggiunge un buff persistente → aggiungilo alla pulizia buff
  in `carduse.js → resetTurnState override`
- [ ] Se il buff deve persistere tra i turni (come `shielded`) → **non** aggiungerlo
  alla pulizia
- [ ] Testare in locale con AI attiva
- [ ] Se online: verificare che `receiveRemoteCardAction` in cards.js gestisca
  correttamente lo stato dell'agente target

---

## Appendice B — Checklist per qualsiasi modifica

Prima di iniziare:
- [ ] Ho letto la sezione rilevante di questa guida?
- [ ] So in quale file vive la logica che voglio cambiare?
- [ ] La modifica tocca `executeAction`? → devo aggiornare anche `carduse.js`
- [ ] La modifica aggiunge stato? → lo aggiungo in `state.js`
- [ ] La modifica aggiunge un numero magico? → lo aggiungo in `constants.js`
- [ ] La modifica tocca la rete? → ho aggiornato entrambi i handler in multiplayer.js?

Dopo la modifica:
- [ ] Testato in locale 2 giocatori umani (hotseat)
- [ ] Testato con AI attiva
- [ ] Verificato che il multiplayer non sia rotto (almeno una connessione host/client)
- [ ] Aggiornato il numero di versione in `index.html` (`v0.XXX`)
