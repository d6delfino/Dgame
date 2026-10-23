/* ============================================================
   dquests.js — QUEST DI FAZIONE della modalità cooperativa
   ============================================================
   Ogni fazione ha 6 quest che raccontano la sua storia con le meccaniche di gioco (le voci di COOP_QUESTS con campo fac):
     EC = 🟢 Verde, i Tecnologici · ME = 🔵 Blu (e Rosa), i Paladini · GU = 🟡 Giallo, l'Esercito Moderno
     HE = 🔴 Rosso, i Demoni · AL = ⚪ Bianco, gli Alieni Abissali · RO = 🔘 Grigio, Skynet · ZE = 🟣 Viola, lo Sciame
   A inizio partita (vedi coopPickQuests in dcoop.js) si pesca a caso 1 quest per ogni fazione presente (con 5-6 giocatori umani si
   scelgono 4 giocatori a caso) e si completa fino a 4 con le quest generiche di dcoop.js. Le quest NON sbloccano più silo e nucleare:
   servono (3 su 4) a far cadere lo scudo infinito della base finale (che cade anche solo con i boss abbattuti E 3 quest fatte).

   CARICAMENTO: subito dopo dcoop.js (prima di dai.js).
   Come dcoop.js, NON modifica drules.js e dai.js: avvolge (wrapper) le loro funzioni da quInstallHooks(), chiamata da coopInstallHooks().
   Tutto lo stato sta in COOP (COOP.st.*, COOP.relic, COOP.medevac, COOP.veglia) e in flag sulle unità: finisce nel salvataggio
   (snapshot) e viaggia online. Le funzioni val() leggono solo lo stato (così funzionano anche sul client).

   Una quest = {fac, e, name(), reward, val() -> [attuale, obiettivo], txt()?, story, epilogo, risk?, uses?, avail(C)?, setup(C,x,owner)?, fails(q)?}
     owner = il giocatore che ha scelto quella fazione (q.owner): serve alle quest che parlano "dello sciame" (Viola).
     uses  = meccanismo condiviso con una quest generica: le due non possono uscire insieme.
   ============================================================ */

// ================== COSTANTI (cambiale a piacere) ==================
// 🟢 Verde
const QU_EMP_TARGETS = 3;                       // Blackout Neurale: mostri colpiti da un solo EMP
const QU_CYBER_PLUS = 2;                        // Cyber-prototipo: punti oltre il massimo normale in TUTTE e 4 le abilità
const QU_SAT_CORNERS = 3, QU_SAT_RADIUS = 3;    // Sorveglianza Satellitare: angoli diversi con un Top-tech, e raggio (caselle) dall'angolo
const QU_OC_ACTIONS = 6, QU_OC_KILLS = 2;       // Overclock Letale: azioni da avere nello stesso turno (Blitz) e mostri da uccidere in quel turno
// 🔵 Blu
const QU_SANT_DIST = 12, QU_SANT_IMG = 'ME16.png';   // Santuari Magici: distanza minima tra i santuari e dalle basi dei giocatori; immagine (img/)
const QU_RELIC_DIST = 20;                       // Ricerca della Reliquia: distanza minima dalle basi dei giocatori
const QU_PRIEST_STATS = {vita:2, passi:2, gittata:2, attacco:2};   // il Sacerdote (non può usare carte)
const QU_TAME_TARGET = 3;                       // Luce del Chierico: mostri da addomesticare
const QU_VEGLIA_DIST = 16, QU_VEGLIA_RAIDERS = 6, QU_VEGLIA_SPAWN_DIST = 10;   // La Lunga Veglia: fortezza ad almeno 16 caselle da ogni tua base; 6 mostri elite a distanza 10+
const QU_RAIDER_STATS = {vita:4, passi:3, gittata:6, attacco:8};               // ...con tutte le abilità al massimo e danno 8
const QU_SIEGE_BUNKERS = 4, QU_SIEGE_RADIUS = 3;   // Assedio: bunker entro 3 caselle da una base nemica
// 🟡 Giallo
const QU_DROP_UNITS = 2;                        // Rinforzi dal cielo: unità paracadutate accanto alla base finale e sopravvissute
const QU_STEEL_KILLS = 6;                       // Pioggia d'Acciaio: mostri uccisi solo da Artiglieria o Silo
const QU_MEDEVAC_TURNS = 8, QU_MEDEVAC_MIN_DIST = 12, QU_MEDEVAC_MAX_DIST = 26;   // Medevac: giri a disposizione e distanza del segnale dalla base più vicina
const QU_HERO_KILLS = 4;                        // Sacrificio dell'Eroe: mostri uccisi (più 1 unità alleata) da un solo colpo nucleare
// 🔴 Rosso
const QU_NUKE_SACRIFICES = 2;                   // Apocalisse Infernale: colpi nucleari che distruggono almeno 1 unità alleata
const QU_TERRA_TARGET = 10;                     // Terra infernale: foreste o acque demolite
const QU_ASH_ROUNDS = 1;                        // Risorto dalle Ceneri: giri (oltre a quello in cui scende a 1 vita) per curarsi e uccidere. 0 = stesso identico giro (i mostri giocano per ultimi: se il danno lo fanno loro, in pratica impossibile)
// ⚪ Bianco
const QU_FOG_KILLS = 6;                         // Predatori della Nebbia: mostri uccisi sparando da una casella di nebbia
const QU_STASIS_UNITS = 2, QU_STASIS_ROUNDS = 0;   // Bolla di Stasi: mostri con tutte le azioni tolte (3 EMP) da distruggere entro lo stesso giro (0 = stesso giro)
const QU_OBS_TURNS = 5, QU_OBS_DIST = 2;        // Osservatore Occulto: turni immobile nella nebbia a questa distanza da una base nemica
const QU_ABD_TURNS = 2, QU_ABD_DIST = 2;        // Rapimento alieno: giri con un boss entro questa distanza da una tua fortezza
// 🔘 Grigio
const QU_TANK_DAMAGE = 10;                      // Macchine Inarrestabili: danni da incassare (armatura top-tech + MediBuff)
const QU_BUNKER_KILLS = 3;                      // Difesa Automatizzata: mostri uccisi dai bunker
const QU_ELITE_UNITS = 4;                       // Superiorità tecnologica: unità con tutte le abilità al massimo, vive insieme
const QU_PERFECT_PLUS = 3;                      // Sacro Codice Incarnato: punti oltre il massimo normale in tutte le abilità (più armatura al massimo)
const QU_WEAPONS_LABS = 3, QU_WEAPONS_PLUS = 3; // Armi superiori: laboratori armi da costruire e punti di attacco oltre il massimo normale
// 🟣 Viola
const QU_SWARM_ROUNDS = 5;                      // Sciame Inarrestabile: giri di fila con il limite di unità raggiunto
const QU_BIO_UNITS = 5;                         // Biomassa: unità diverse che raccolgono risorse nello stesso turno
const QU_ABOM = {vita:5, passi:3, attacco:5, gittata:1};   // Mutazione Alfa: minimi di vita, passi, attacco e MASSIMO di gittata
const QU_AMBUSH_HP = 4;                         // Agguato Sotterraneo: vita minima del mostro vicino al quale si emerge
const QU_SURROUND_UNITS = 4;                    // Sciame Insaziabile: unità dello sciame adiacenti al mostro ucciso
const QU_HIVE_UNITS = 4;                        // Rete dell'Alveare: unità che sbucano dall'hangar nello stesso turno
const QU_RELIC_EMOJI = '🏺', QU_MEDEVAC_EMOJI = '🚁', QU_PRIEST_EMOJI = '🙏', QU_CHAMPION_EMOJI = '⚔️', QU_RAIDER_EMOJI = '🔥';

// ================== AIUTI ==================
const quOn = () => !!COOP && !!COOP.built;
const quQ = id => COOP ? COOP.quests.find(q=>q.id===id) : null;
const quOwner = id => { const q = quQ(id); return q ? q.owner : undefined; };       // giocatore che ha scelto la fazione di quella quest
const quMon = () => players[COOP.mon];
const quHumanUnits = () => coopHumans().flatMap(i=>players[i].units.filter(u=>!u.survivor));
const quHumanBases = () => coopHumans().flatMap(i=>players[i].bases);
const quHumanStructs = type => coopHumans().flatMap(i=>players[i].structs.filter(s=>s.type===type));
const quFind = id => { for(const p of players){ const v = p.units.find(e=>e.id===id) || p.bases.find(e=>e.id===id) || p.structs.find(e=>e.id===id); if(v) return v; } return null; };
const quBool = f => () => [f() ? 1 : 0, 1];
const quSay = m => { COOP.say = (COOP.say||'') + m; };            // messaggio in coda: lo mostra coopCheckQuests (l'outLog dell'azione in corso lo sovrascriverebbe)
const quStat = k => (COOP.st[k]||0);
function quPerm(u,id){                          // abilità "vera" dell'unità: senza i bonus di una carta che dura solo il turno (MediBuff, Cecchino, Esplosivo)
  let v = u.st[id];
  if(u.medTemp) v -= 1;
  if(id==='gittata' && u.sniperBuff) v -= (u.originalRng||0)*(u.pierceCount||1);
  if(id==='attacco' && u.demoBuff) v -= (u.originalDmg||0)*(u.demoCount||1);
  return v;
}
const quExcess = (u,id) => quPerm(u,id) - statBaseMax(id);                        // punti oltre il massimo normale
const quSpawnMonster = (c,r,st,extra) => { const mp = quMon(), u = {id:nextId++,c,r,actions:NEW_UNIT_ACTIONS,st:{...st},hp:st.vita,...extra}; mp.units.push(u); mp.hadUnits = true; return u; };
const quPriest = () => { for(const i of coopHumans()){ const u = players[i].units.find(u=>u.priest); if(u) return u; } return null; };

// ---- misure "dal vivo" (usate da val()) ----
const quCyberBest = () => Math.max(0,...quHumanUnits().map(u=>Math.min(...STATS.map(s=>quExcess(u,s.id)))));
function quCornersTech(){                       // angoli della mappa con un Top-tech dei giocatori entro QU_SAT_RADIUS caselle
  const W = COOP.W, H = COOP.H, ts = quHumanStructs('topTech');
  return [[0,0],[W-1,0],[0,H-1],[W-1,H-1]].filter(cc=>ts.some(s=>hexDist([s.c,s.r],cc)<=QU_SAT_RADIUS)).length;
}
const quSiegeBest = () => Math.max(0,...quMon().bases.map(b=>quHumanStructs('bunker').filter(s=>hexDist([s.c,s.r],[b.c,b.r])<=QU_SIEGE_RADIUS).length));
function quTrenchScore(s){                      // bunker s: caselle di fango intorno (max 6) + montagne a distanza 2 sulle 6 linee di tiro (max 6)
  let n = neighbors(s.c,s.r).filter(([c,r])=>terr(c,r)==='fango').length;
  const [q0,r0] = toCube(s.c,s.r);
  DIRS.forEach(([dq,dr])=>{ const r2 = r0+dr*2, c2 = (q0+dq*2)+(r2-(r2&1))/2; if(exists(c2,r2) && terr(c2,r2)==='montagne') n++; });
  return n;
}
const quTrenchBest = () => Math.max(0,...quHumanStructs('bunker').map(quTrenchScore));
const quWaterScore = b => terr(b.c,b.r)==='acqua' ? neighbors(b.c,b.r).filter(([c,r])=>terr(c,r)==='acqua').length : 0;   // fortezza sull'acqua: caselle d'acqua intorno (servono 6)
const quWaterBest = () => Math.max(0,...quHumanBases().filter(b=>b.fort).map(quWaterScore));
const quTankBest = () => Math.max(0,...quHumanUnits().filter(u=>(u.techArmor||0)>=1 && u.mediUsed).map(u=>u.dmgTaken||0));
const quIsMaxed = (u,plus) => STATS.every(s=>quPerm(u,s.id)>=statBaseMax(s.id)+plus);
const quEliteCount = () => quHumanUnits().filter(u=>quIsMaxed(u,0)).length;
const quPerfectBest = () => Math.max(0,...quHumanUnits().map(u=>STATS.filter(s=>quExcess(u,s.id)>=QU_PERFECT_PLUS).length + ((u.techArmor||0)>=TECH_ARMOR_MAX ? 1 : 0)));
const quWeaponsExcess = () => Math.max(0,...quHumanUnits().map(u=>quExcess(u,'attacco')));
const quBuildTypes = () => Object.keys(BUILDINGS).filter(k=>BUILDINGS[k].struct || k==='fortezza');   // "ogni edificio": tutti gli edifici con vita propria + la fortezza (barricata e miniera sono terreno)
const quBuiltCount = () => quBuildTypes().filter(k=>(COOP.st.built||{})[k]).length;
const quIsAbom = u => quPerm(u,'vita')>=QU_ABOM.vita && quPerm(u,'passi')>=QU_ABOM.passi && quPerm(u,'attacco')>=QU_ABOM.attacco && quPerm(u,'gittata')<=QU_ABOM.gittata;
const quAbomination = () => { const o = quOwner('ze_mutazione'); return o!==undefined && players[o].units.some(quIsAbom); };
const quSwarmUnits = () => { const o = quOwner('ze_sciame'); return o===undefined ? 0 : players[o].units.length; };
const quSiegeFort = () => { const V = COOP.veglia; return V ? (quHumanBases().find(b=>b.id===V.id) || null) : null; };
const quRaidersAlive = () => { const V = COOP.veglia; return V ? V.ids.filter(id=>quMon().units.some(u=>u.id===id)).length : QU_VEGLIA_RAIDERS; };
const quMedevacLeft = () => (COOP.medevac ? Math.max(0,COOP.medevac.until-coopRound()) : 0);

// ================== LE QUEST ==================
Object.assign(COOP_QUESTS, {
  // ---------- 🟢 VERDE: Tecnologici (cyberpunk / megacorporazioni) ----------
  ec_blackout: {fac:'EC', e:'📡', reward:15, name:()=>`Blackout Neurale: colpisci ${QU_EMP_TARGETS}+ mostri con un solo EMP`,
    val:()=>[quStat('empBest'), QU_EMP_TARGETS],
    story:"La rete biologica dei mostri è una sola mente alveare: un impulso elettromagnetico ben piazzato può confonderla e \"hackerare\" i loro scudi. Lancia la carta EMP in mezzo a loro.",
    epilogo:"Rete neurale in tilt: i mostri brancolano nel buio."},
  ec_cyber: {fac:'EC', e:'🦾', reward:20, name:()=>`Cyber-prototipo: un'unità con tutte e 4 le abilità +${QU_CYBER_PLUS} oltre il massimo normale`,
    val:()=>[Math.min(QU_CYBER_PLUS,quCyberBest()), QU_CYBER_PLUS],
    story:"La corporazione vuole testare un nuovo cyborg inarrestabile: potenzia un'unica unità (laboratori, carta Upgrade) fino a superare di 2 punti il massimo normale di vita, passi, gittata e attacco.",
    epilogo:"Prototipo approvato: il consiglio di amministrazione è entusiasta."},
  ec_vip: {fac:'EC', e:'🧪', reward:25, risk:true, uses:'survivor', name:()=>"Estrazione VIP: scorta lo scienziato fino a una tua base",
    val:()=>[COOP.st.rescued ? 1 : 0, 1],
    txt:()=>COOP.st.rescued ? '1/1' : (COOP.survivor && COOP.survivor.taken ? 'in scorta' : 'da trovare'),
    setup:(C,x,o)=>COOP_QUESTS.rescue_survivor.setup(C,x,o),
    fails:()=>!!COOP.survivorDead && !COOP.st.rescued,
    story:"Uno scienziato corporativo è fuggito portando con sé dati vitali. Trovalo, raggiungilo (basta andargli accanto) e riportalo adiacente a una tua base. Se muore, i dati sono persi.",
    epilogo:"Dati salvi: la corporazione ti ringrazia."},
  ec_sabotaggio: {fac:'EC', e:'👻', reward:25, name:()=>"Sabotaggio Fantasma: demolisci il Top-tech nemico con un'unità Spettro",
    val:quBool(()=>COOP.st.ghostDown),
    txt:()=>COOP.st.ghostDown ? '1/1' : 'Top-tech da trovare',
    setup:(C,x)=>quSetupGhost(C,x),
    story:"Accanto a una tana mostruosa sorge un Top-tech nemico, protetto da uno scudo infinito e da due bunker. Solo l'azione Demolizione di un'unità con la carta Spettro (occultamento) può abbatterlo.",
    epilogo:"Nessuno ti ha visto: il sabotaggio è perfetto."},
  ec_sorveglianza: {fac:'EC', e:'🛰️', reward:20, name:()=>`Sorveglianza Satellitare: Top-tech in ${QU_SAT_CORNERS} angoli diversi (entro ${QU_SAT_RADIUS} caselle)`,
    val:()=>[Math.min(QU_SAT_CORNERS,quCornersTech()), QU_SAT_CORNERS],
    story:"Una rete di potenti sensori deve coprire la mappa: costruisci un Top-tech vicino a ciascuno di tre angoli diversi (il tuo angolo di partenza conta).",
    epilogo:"Rete di sorveglianza attiva: niente sfugge ai sensori."},
  ec_overclock: {fac:'EC', e:'⚡', reward:25, name:()=>`Overclock Letale: ${QU_OC_ACTIONS} azioni in un turno (Blitz) e ${QU_OC_KILLS} mostri uccisi nello stesso turno`,
    val:quBool(()=>COOP.st.overclock),
    story:"Un impianto neurale spinto oltre i limiti: porta una sola unità ad avere 6 azioni nello stesso turno (servono 3 carte Blitz) e fai strage con quella.",
    epilogo:"L'impianto è fuso, ma ne è valsa la pena."},

  // ---------- 🔵 BLU: i Paladini (fantasy medievale) ----------
  me_santuari: {fac:'ME', e:'⛪', reward:20, uses:'mono', name:()=>`Santuari Magici: attiva i ${COOP_MONO_COUNT} santuari insieme (un'unità accanto a ciascuno)`,
    val:()=>[Math.max(COOP.st.monoBest||0, coopMonoActive()), COOP_MONO_COUNT],
    txt:()=>`${coopMonoActive()}/${COOP_MONO_COUNT} attivi ora`,
    setup:(C,x)=>quSetupSantuari(C,x),
    story:"Quei monoliti non sono rocce aliene ma antichi santuari magici, lontani tra loro e dalle basi. Schierando contemporaneamente un'unità accanto a ciascuno purificherete l'area dall'influenza mostruosa.",
    epilogo:"I santuari risplendono: l'oscurità arretra."},
  me_duello: {fac:'ME', e:'⚔️', reward:25, risk:true, name:()=>"Duello d'Onore: uccidi il Campione con una sola unità, solo corpo a corpo, senza carte né artiglieria",
    val:quBool(()=>COOP.st.duel),
    txt:()=>COOP.st.duel ? '1/1' : (quMon().units.some(u=>u.champion) ? (quMon().units.some(u=>u.champion && coopExpl(u.c,u.r)) ? 'avvistato' : 'da trovare') : '—'),
    fails:()=>!!COOP.st.duelFail && !COOP.st.duel,
    setup:(C,x)=>quSetupDuello(C,x),
    story:"I veri cavalieri guardano il nemico negli occhi. Un Campione mostruoso (tutte le abilità al massimo) vi sfida: uccidilo con UNA sola unità, sempre da distanza 1, senza carte, artiglieria, silo, bunker o aiuti (può durare più turni). Se qualcuno lo ferisce diversamente, il duello è nullo.",
    epilogo:"Duello vinto: onore al cavaliere."},
  me_reliquia: {fac:'ME', e:'🏺', reward:25, risk:true, name:()=>"Ricerca della Reliquia: scorta il Sacerdote fino alla reliquia (adiacente)",
    val:quBool(()=>COOP.st.relic),
    txt:()=>COOP.st.relic ? '1/1' : (COOP.relic && coopExpl(COOP.relic.c,COOP.relic.r) ? 'reliquia avvistata' : 'reliquia da trovare'),
    fails:()=>!!COOP.relic && !COOP.st.relic && !quPriest(),
    setup:(C,x,o)=>quSetupRelic(C,x,o),
    story:"Una reliquia sacra giace nascosta lontano (almeno 20 caselle dalle basi). Il Sacerdote (tutte le abilità a 2, non può usare carte) deve raggiungerla vivo: scortalo! Se muore, la reliquia è perduta.",
    epilogo:"La reliquia è tua: i paladini sono benedetti."},
  me_luce: {fac:'ME', e:'✨', reward:20, uses:'tame', name:()=>`Luce del Chierico: addomestica ${QU_TAME_TARGET} mostri curandoli`,
    val:()=>[Math.min(QU_TAME_TARGET,COOP.st.tamed||0), QU_TAME_TARGET],
    story:"Mostrando pietà, i maghi blu curano i mostri feriti e li convertono alla causa: usa l'azione Cura su 3 mostri feriti (non boss).",
    epilogo:"Le creature dell'oscurità si inginocchiano alla luce."},
  me_veglia: {fac:'ME', e:'🏰', reward:30, risk:true, name:()=>`La Lunga Veglia: fortezza a ${QU_VEGLIA_DIST}+ caselle dalle tue basi, poi respingi ${QU_VEGLIA_RAIDERS} mostri elite`,
    val:()=>[COOP.veglia ? QU_VEGLIA_RAIDERS-quRaidersAlive() : 0, QU_VEGLIA_RAIDERS],
    txt:()=>!COOP.veglia ? 'costruisci la fortezza' : `${QU_VEGLIA_RAIDERS-quRaidersAlive()}/${QU_VEGLIA_RAIDERS} mostri abbattuti`,
    fails:()=>!!COOP.veglia && !quSiegeFort(),
    story:"I castelli blu non cedono alle orde. Costruisci una fortezza lontana da tutto: appena sorge, 6 mostri elite (danno 8) marciano solo per distruggerla. Abbattili tutti senza perdere la fortezza.",
    epilogo:"La fortezza ha retto: l'orda è spezzata."},
  me_assedio: {fac:'ME', e:'🏹', reward:20, name:()=>`Assedio: circonda una base nemica con ${QU_SIEGE_BUNKERS} bunker entro ${QU_SIEGE_RADIUS} caselle`,
    val:()=>[Math.min(QU_SIEGE_BUNKERS,quSiegeBest()), QU_SIEGE_BUNKERS],
    story:"Il dominio sul campo si conquista stringendo il nemico in una morsa: costruisci 4 bunker nel raggio di 3 caselle da una stessa base nemica.",
    epilogo:"La base è assediata: non ha più via di scampo."},

  // ---------- 🟡 GIALLI: l'Esercito Moderno (realismo tattico) ----------
  gu_rinforzi: {fac:'GU', e:'🪂', reward:25, name:()=>`Rinforzi dal cielo: ${QU_DROP_UNITS} unità con l'Airdrop accanto alla base finale, vive per un turno`,
    val:()=>[Math.min(QU_DROP_UNITS,quStat('dropBest')), QU_DROP_UNITS],
    story:"Dietro le linee nemiche serve un colpo di mano: con la carta Airdrop paracaduta due unità in caselle adiacenti alla base obiettivo (già esplorata) e falle sopravvivere almeno un giro intero.",
    epilogo:"Paracadutisti a terra: la testa di ponte regge."},
  gu_pioggia: {fac:'GU', e:'☄️', reward:20, name:()=>`Pioggia d'Acciaio: ${QU_STEEL_KILLS} mostri uccisi solo da Artiglieria o Silo (nessun colpo diretto)`,
    val:()=>[quStat('steelKills'), QU_STEEL_KILLS],
    story:"Dimostrazione di forza bruta ed efficienza: elimina 6 mostri usando esclusivamente Artiglieria o Silo Missili. Un mostro colpito anche da fanteria, basi o bunker non vale.",
    epilogo:"Tiro di sbarramento perfetto."},
  gu_medevac: {fac:'GU', e:'🚁', reward:25, risk:true, uses:'sos', name:()=>`Operazione Medevac: salva il pilota (SOS) e portalo a una base entro ${QU_MEDEVAC_TURNS} turni`,
    val:quBool(()=>COOP.st.medevacDone),
    txt:()=>COOP.st.medevacDone ? '1/1' : (COOP.medevac && COOP.medevac.taken ? `da scortare · ${quMedevacLeft()} turni` : `${quMedevacLeft()} turni`),
    fails:()=>!!COOP.medevac && !!COOP.medevac.failed && !COOP.st.medevacDone,
    setup:(C,x)=>quSetupMedevac(C,x),
    story:"Un pilota è caduto in territorio nemico: segnale SOS. Costruisci una rete di Hangar (si salta da uno all'altro con 1 passo) per coprire la distanza, raggiungilo e riportalo adiacente a una tua base entro 8 giri.",
    epilogo:"Pilota in salvo: nessuno viene lasciato indietro."},
  gu_trincea: {fac:'GU', e:'🛡️', reward:25, name:()=>"Guerra di Trincea: un bunker con 6 caselle di fango intorno e 6 montagne a distanza 2 sulle linee di tiro",
    val:()=>[quTrenchBest(), 12],
    story:"Bisogna mettere in sicurezza un settore: i genieri creano la linea difensiva perfetta. Un bunker circondato da fango su tutti i lati e, a distanza 2 lungo le 6 rette di tiro, 6 montagne.",
    epilogo:"Linea difensiva completata."},
  gu_fuoco: {fac:'GU', e:'🔀', reward:20, uses:'crossfire', name:()=>`Fuoco Incrociato: ${COOP_CROSSFIRE_UNITS} unità diverse feriscono lo stesso mostro nello stesso giro e l'ultima lo abbatte`,
    val:quBool(()=>COOP.st.xfireKill),
    story:"La perfetta coordinazione di squadra: tre unità diverse devono colpire lo stesso mostro nello stesso giro (anche di giocatori alleati) e il colpo di grazia deve venire dalla terza.",
    epilogo:"Bersaglio neutralizzato: coordinazione da manuale."},
  gu_eroe: {fac:'GU', e:'☢️', reward:30, name:()=>`Sacrificio dell'Eroe: un solo colpo nucleare uccide ${QU_HERO_KILLS} mostri e 1 tua unità`,
    val:quBool(()=>COOP.st.hero),
    story:"Uno scout circondato dai nemici, sapendosi spacciato, ha chiesto un attacco nucleare sulla propria posizione. Con un singolo colpo nucleare elimina almeno 4 mostri e 1 unità alleata.",
    epilogo:"L'eroe è caduto, ma l'ondata è spezzata."},

  // ---------- 🔴 ROSSI: i Demoni Infernali ----------
  he_apocalisse: {fac:'HE', e:'🌋', reward:30, name:()=>`Apocalisse Infernale: ${QU_NUKE_SACRIFICES} colpi nucleari, ognuno con almeno 1 tua unità sacrificata`,
    val:()=>[Math.min(QU_NUKE_SACRIFICES,quStat('nukeSac')), QU_NUKE_SACRIFICES],
    story:"I demoni vogliono trasformare il mondo in un inferno, aprendo portali di fuoco. Lancia due colpi nucleari: ognuno richiede il sacrificio di almeno un'unità alleata per il signore oscuro e lascia un cratere vulcanico.",
    epilogo:"Il mondo brucia: il signore oscuro è soddisfatto."},
  he_sangue: {fac:'HE', e:'🩸', reward:20, name:()=>"Sangue e Caos: un'unità con Esplosivo muore nell'esplosione uccidendo un nemico",
    val:quBool(()=>COOP.st.cultist),
    story:"Per dimostrare fiducia nell'oscuro signore, un cultista compie l'estremo gesto: con la carta Esplosivo attiva spara a un nemico adiacente con vita così bassa da morire nella propria esplosione, portandolo con sé.",
    epilogo:"Un sacrificio di sangue: il caos regna."},
  he_terra: {fac:'HE', e:'🔥', reward:15, name:()=>`Terra infernale: demolisci ${QU_TERRA_TARGET} foreste o acque`,
    val:()=>[Math.min(QU_TERRA_TARGET,quStat('terra')), QU_TERRA_TARGET],
    avail:C=>coopCountTerr('copertura')+coopCountTerr('acqua')>=QU_TERRA_TARGET+6,
    story:"I demoni odiano la natura e le costruzioni umane. Usa ripetutamente Demolisci per radere al suolo foreste e acque, lasciando solo terra desolata.",
    epilogo:"Solo cenere e terra bruciata."},
  he_portale: {fac:'HE', e:'🌀', reward:20, name:()=>"Portale del Caos: costruisci una fortezza accanto a una base nemica",
    val:quBool(()=>COOP.st.portal),
    story:"I demoni aprono un portale infernale nel cuore del territorio nemico: costruisci una Fortezza (nuova base) in una casella adiacente a una base dei mostri.",
    epilogo:"Il portale è aperto: l'inferno è arrivato."},
  he_risorto: {fac:'HE', e:'🔥', reward:25, name:()=>"Risorto dalle Ceneri: un'unità scende a 1 vita, si cura al massimo e uccide un mostro",
    val:quBool(()=>COOP.st.phoenix),
    txt:()=>COOP.st.phoenix ? '1/1' : (quHumanUnits().some(u=>u.ash && !u.ash.healed) ? 'ferita a 1 vita: cura e colpisci!' : 'in attesa'),
    story:"Un demone sconfitto si rigenera e torna dall'inferno per eliminare il suo avversario: un'unità (vita massima 2+) scende a 1 punto vita, si cura fino al massimo e poi uccide un mostro, tutto entro lo stesso giro (o il giro seguente).",
    epilogo:"Risorto dalle ceneri più forte di prima."},
  he_sanguinario: {fac:'HE', e:'👑', reward:30, name:()=>"Sanguinario Supremo: una sola unità uccide da sola un Boss, senza carte nei turni in cui lo ferisce",
    val:quBool(()=>COOP.st.supreme),
    story:"C'è spazio per un solo Re Demone. Il Cavaliere Solitario deve ingaggiare e uccidere da solo un Boss dei mostri: nessun altro deve mai ferirlo e, nei turni in cui lo colpisce, non può usare carte.",
    epilogo:"Un solo Re Demone sul trono."},

  // ---------- ⚪ BIANCHI: gli Alieni Abissali (piovre tech) ----------
  al_impero: {fac:'AL', e:'🐙', reward:25, name:()=>"Impero Abissale: una fortezza sull'acqua circondata da 6 caselle d'acqua",
    val:()=>[quWaterBest(), 6],
    story:"Gli alieni prosperano nell'acqua e vogliono terraformare il territorio: costruisci una Fortezza direttamente su una casella d'acqua e circondala di acqua su tutti e 6 i lati (l'acqua si può costruire).",
    epilogo:"L'impero abissale sorge dalle onde."},
  al_assimilazione: {fac:'AL', e:'🧠', reward:25, name:()=>"Assimilazione Mentale: addomestica un mostro e usalo subito per uccidere un altro mostro",
    val:quBool(()=>COOP.st.assim),
    story:"Assimila un mostro ferito curandolo e usalo, nello stesso turno, per dare il colpo di grazia a un altro mostro della sua ex-specie. (L'assimilato ha 0 azioni: dategli un Blitz!)",
    epilogo:"La mente alveare ora lavora per voi."},
  al_predatori: {fac:'AL', e:'🌫️', reward:20, name:()=>`Predatori della Nebbia: elimina ${QU_FOG_KILLS} mostri sparando da una casella di nebbia`,
    val:()=>[Math.min(QU_FOG_KILLS,quStat('fogKills')), QU_FOG_KILLS],
    story:"Gli alieni colpiscono da dove non si vede: uccidi 6 mostri con unità ferme in una casella di nebbia (naturale o creata da un fumogeno).",
    epilogo:"Nessuno ha visto da dove arrivava la morte."},
  al_stasi: {fac:'AL', e:'⏳', reward:25, name:()=>`Bolla di Stasi: con ${ACTIONS_PER_TURN} EMP lascia ${QU_STASIS_UNITS} mostri a 0 azioni e distruggili nello stesso giro`,
    val:quBool(()=>COOP.st.stasisDone),
    story:"Gli alieni sembrano manipolare il tempo: colpisci gli stessi due mostri con 3 EMP in modo da lasciarli a 0 azioni, poi distruggili entrambi nello stesso giro.",
    epilogo:"Il tempo si è fermato per loro."},
  al_osservatore: {fac:'AL', e:'👁️', reward:20, name:()=>`Osservatore Occulto: ${QU_OBS_TURNS} turni fermo nella nebbia a distanza ${QU_OBS_DIST} da una base nemica`,
    val:()=>[Math.min(QU_OBS_TURNS,quStat('obsBest')), QU_OBS_TURNS],
    story:"Piazza (o usa) una nebbia entro 2 caselle da una base nemica e resta con un'unità dentro, immobile (senza sparare né muoverti), per 5 turni di fila.",
    epilogo:"Hai osservato tutto, non visto da nessuno."},
  al_rapimento: {fac:'AL', e:'🛸', reward:30, name:()=>`Rapimento alieno: un boss entro ${QU_ABD_DIST} caselle da una tua fortezza per ${QU_ABD_TURNS} giri`,
    val:()=>[Math.min(QU_ABD_TURNS,quStat('abdBest')), QU_ABD_TURNS],
    story:"Gli alieni hanno trovato un esemplare speciale e vogliono studiarlo: porta un boss nemico entro 2 caselle da una tua fortezza e fai in modo che ci resti per 2 giri di fila.",
    epilogo:"L'esemplare è in laboratorio."},

  // ---------- 🔘 GRIGI: Skynet (intelligenza artificiale) ----------
  ro_macchine: {fac:'RO', e:'⚙️', reward:25, name:()=>`Macchine Inarrestabili: un'unità con armatura top-tech e MediBuff incassa ${QU_TANK_DAMAGE} danni senza morire`,
    val:()=>[Math.min(QU_TANK_DAMAGE,quTankBest()), QU_TANK_DAMAGE],
    story:"L'intelligenza artificiale non costruisce fanteria ma carri armati inarrestabili: dai a un'unità almeno 1 armatura dal Top-tech e la carta MediBuff, poi falle incassare 10 danni complessivi senza mai morire (contano i danni subiti dopo averle date entrambe).",
    epilogo:"Calcolo completato: la macchina è indistruttibile."},
  ro_fabbriche: {fac:'RO', e:'🏭', reward:30, name:()=>`Fabbriche e laboratori: costruisci almeno 1 copia di ogni edificio`,
    val:()=>[quBuiltCount(), quBuildTypes().length],
    txt:()=>`${quBuiltCount()}/${quBuildTypes().length} tipi`,
    story:"L'AI investe in truppe ma anche in sviluppo: costruisci almeno un esemplare di ogni edificio (hangar, forgia, bunker, 4 laboratori, artiglieria, fabbrica, silo, top-tech, armi nucleari, shield dome e fortezza).",
    epilogo:"Il complesso industriale è completo."},
  ro_bunker: {fac:'RO', e:'🤖', reward:15, uses:'bunker', name:()=>`Difesa Automatizzata: elimina ${QU_BUNKER_KILLS} mostri con i bunker`,
    val:()=>[Math.min(QU_BUNKER_KILLS,COOP.st.bunkerKills||0), QU_BUNKER_KILLS],
    story:"L'AI automatizza anche il campo di battaglia: i bunker (anche a mano, potenziati dalle carte) devono eliminare 3 mostri.",
    epilogo:"Le torrette non sbagliano mai."},
  ro_armi: {fac:'RO', e:'💥', reward:25, name:()=>`Armi superiori: ${QU_WEAPONS_LABS} laboratori armi e un'unità con attacco +${QU_WEAPONS_PLUS} oltre il massimo`,
    val:()=>[Math.min(QU_WEAPONS_LABS,quStat('labArmi'))+Math.min(QU_WEAPONS_PLUS,quWeaponsExcess()), QU_WEAPONS_LABS+QU_WEAPONS_PLUS],
    txt:()=>`lab ${Math.min(QU_WEAPONS_LABS,quStat('labArmi'))}/${QU_WEAPONS_LABS} · attacco +${Math.min(QU_WEAPONS_PLUS,quWeaponsExcess())}/${QU_WEAPONS_PLUS}`,
    story:"L'AI ha progettato armi devastanti con cui vaporizza i nemici: costruisci 3 laboratori armi e crea un'unità con 3 punti di attacco oltre il massimo normale.",
    epilogo:"Arma definitiva: i nemici vengono vaporizzati."},
  ro_superiorita: {fac:'RO', e:'🧬', reward:30, name:()=>`Superiorità tecnologica: ${QU_ELITE_UNITS} unità con tutte le abilità al massimo, vive insieme`,
    val:()=>[Math.min(QU_ELITE_UNITS,quEliteCount()), QU_ELITE_UNITS],
    story:"L'AI supera le altre fazioni in qualità: costruisci 4 unità elite con tutte le abilità al massimo e tienile vive contemporaneamente.",
    epilogo:"Quattro unità perfette: superiorità schiacciante."},
  ro_codice: {fac:'RO', e:'💾', reward:35, name:()=>`Sacro Codice Incarnato: un'unità con tutte le abilità +${QU_PERFECT_PLUS} oltre il massimo e armatura ${TECH_ARMOR_MAX}`,
    val:()=>[quPerfectBest(), STATS.length+1],
    txt:()=>`${quPerfectBest()}/${STATS.length+1} requisiti`,
    story:"L'AI aspira a costruire l'essere definitivo: il corpo porterà il suo sacro codice. Crea l'unità perfetta: tutte le abilità al massimo +3 (3 laboratori per tipo) e armatura 3 dal Top-tech.",
    epilogo:"L'essere definitivo è nato."},

  // ---------- 🟣 VIOLA: lo Sciame (mostri stile zerg) ----------
  ze_sciame: {fac:'ZE', e:'🐝', reward:25, name:()=>`Sciame Inarrestabile: ${MAX_UNITS} unità vive per ${QU_SWARM_ROUNDS} giri di fila`,
    val:()=>[Math.min(QU_SWARM_ROUNDS,quStat('swarm')), QU_SWARM_ROUNDS],
    txt:()=>`${Math.min(QU_SWARM_ROUNDS,quStat('swarm'))}/${QU_SWARM_ROUNDS} giri · ${quSwarmUnits()}/${MAX_UNITS} unità`,
    story:"Lo sciame è sempre numeroso e cresce in fretta: il giocatore viola deve arrivare al limite massimo di unità (6/6) e mantenerle tutte vive per 5 giri di fila (si conta a fine del suo turno).",
    epilogo:"Lo sciame è una marea inarrestabile."},
  ze_biomassa: {fac:'ZE', e:'🧫', reward:20, name:()=>`Biomassa per lo sciame: ${QU_BIO_UNITS} unità diverse raccolgono risorse nello stesso turno`,
    val:()=>[Math.min(QU_BIO_UNITS,quStat('bioBest')), QU_BIO_UNITS],
    story:"Lo sciame prospera grazie alle risorse raccolte dai suoi lavoratori: con l'azione Raccogli (le miniere non contano), 5 unità diverse del giocatore viola raccolgono risorse nello stesso turno.",
    epilogo:"Biomassa in abbondanza per lo sciame."},
  ze_mutazione: {fac:'ZE', e:'🧬', reward:25, name:()=>`Mutazione Alfa: un abominio con vita ${QU_ABOM.vita}+, gittata ${QU_ABOM.gittata}, passi ${QU_ABOM.passi}+, attacco ${QU_ABOM.attacco}+`,
    val:quBool(quAbomination),
    story:"L'evoluzione guidata crea un organismo specializzato: genera (o potenzia) un'unità con vita 5 o più, gittata 1 (non oltre), passi 3 o più e attacco 5 o più.",
    epilogo:"L'abominio ruggisce: la mutazione è riuscita."},
  ze_agguato: {fac:'ZE', e:'🕳️', reward:25, name:()=>`Agguato Sotterraneo: Airdrop a distanza 1 da un mostro con ${QU_AMBUSH_HP}+ vita e distruggilo nello stesso turno`,
    val:quBool(()=>COOP.st.ambush),
    story:"Lo sciame non vola: scava. Con la carta Airdrop (l'emergere dal sottosuolo) un'unità viola compare accanto a un mostro con almeno 4 di vita e lo distrugge nello stesso turno.",
    epilogo:"È emerso dal nulla: la preda non ha avuto scampo."},
  ze_insaziabile: {fac:'ZE', e:'🦷', reward:20, name:()=>`Sciame Insaziabile: uccidi un mostro circondato da ${QU_SURROUND_UNITS} unità dello sciame`,
    val:quBool(()=>COOP.st.swarmKill),
    story:"Ogni cadavere è cibo per tutti: circonda un mostro con 4 unità del giocatore viola (caselle adiacenti) e distruggilo.",
    epilogo:"Nulla è rimasto: lo sciame è sazio."},
  ze_alveare: {fac:'ZE', e:'🪱', reward:30, name:()=>`Rete dell'Alveare: ${QU_HIVE_UNITS} unità sbucano da un hangar accanto a una base nemica e la distruggono nello stesso turno`,
    val:quBool(()=>COOP.st.hiveDone),
    txt:()=>COOP.st.hiveDone ? '1/1' : `${(COOP.st.hive && COOP.st.hive.step===step) ? COOP.st.hive.ids.length : 0}/${QU_HIVE_UNITS} sbucate ora`,
    story:"Lo sciame si muove sopra e sotto la terra: costruisci un Hangar (enormi budelli sotterranei) adiacente a una base nemica, fai sbucare 4 tue unità dall'hangar nello stesso turno (saltando da un altro hangar) e distruggi quella base prima della fine del turno.",
    epilogo:"L'alveare ha inghiottito la base nemica."}
});
// le quest generiche che usano gli stessi oggetti/contatori di una quest di fazione non escono insieme a lei
[['rescue_survivor','survivor'],['monoliths','mono'],['sos','sos'],['tame_monster','tame'],['bunker_tower','bunker'],['crossfire','crossfire']].forEach(([id,u])=>{ if(COOP_QUESTS[id]) COOP_QUESTS[id].uses = u; });

// ================== PREPARAZIONE DELLA MAPPA (setup delle quest) ==================
function quSetupGhost(C,x){                      // 👻 Sabotaggio Fantasma: Top-tech nemico (scudo infinito) accanto a una tana + 2 bunker accanto al Top-tech
  const mp = players[C.mon];
  for(const b of coopShuf(mp.bases.filter(b=>!b.finalBase))){
    const ring = coopShuf(neighbors(b.c,b.r).filter(([c,r])=>terr(c,r)===null && !isSolid(c,r) && !occupied(c,r)));
    for(const [tc,tr] of ring){
      const spots = coopShuf(neighbors(tc,tr).filter(([c,r])=>!(c===b.c && r===b.r) && !occupied(c,r) && !BUNKER_BLOCKED_TERRAINS.includes(terr(c,r))));
      if(spots.length<2) continue;
      const t = newStruct('topTech',tc,tr); t.ghostTech = true; mp.structs.push(t);
      spots.slice(0,2).forEach(([c,r])=>{ const bk = newStruct('bunker',c,r); bk.ghostGuard = true; mp.structs.push(bk); });
      C.ghost = {id:t.id};
      return true;
    }
  }
  return false;
}
function quSetupSantuari(C,x){                   // ⛪ tre santuari lontani tra loro e dalle basi dei giocatori (se la mappa è stretta la distanza cala di 2 alla volta)
  for(let relax=0; relax<=2; relax++){
    const d = QU_SANT_DIST - relax*2; C.mono = [];
    let ok = true;
    for(let i=0;i<COOP_MONO_COUNT && ok;i++){ const f = x.freeSpot(d,5,C.mono,d); if(f) C.mono.push({c:f.c,r:f.r,img:QU_SANT_IMG}); else ok = false; }
    if(ok) return true;
  }
  C.mono = []; return false;
}
function quSetupDuello(C,x){                     // ⚔️ il Campione: mostro con tutte le abilità al massimo
  const f = x.freeSpot(10,3) || x.freeSpot(8,2);
  if(!f) return false;
  quSpawnMonster(f.c,f.r,Object.fromEntries(STATS.map(s=>[s.id,statBaseMax(s.id)])),{champion:true});
  return true;
}
function quSetupRelic(C,x,owner){                // 🏺 reliquia lontana + Sacerdote accanto alla base di chi ha scelto la fazione
  const pi = owner!==undefined ? owner : coopHumans()[0], b = players[pi] && players[pi].bases[0]; if(!b) return false;
  const spot = freeNeighbors(b.c,b.r).find(([c,r])=>terr(c,r)!=='risorse' && terr(c,r)!=='miniera'); if(!spot) return false;
  let f = null; for(let d=QU_RELIC_DIST; d>=14 && !f; d-=2) f = x.freeSpot(d,4);
  if(!f) return false;
  players[pi].units.push({id:nextId++,c:spot[0],r:spot[1],actions:0,st:{...QU_PRIEST_STATS},hp:QU_PRIEST_STATS.vita,priest:true}); players[pi].hadUnits = true;
  C.relic = {c:f.c,r:f.r};
  return true;
}
function quSetupMedevac(C,x){                    // 🚁 segnale SOS del pilota: lontano, con COOP_MEDEVAC giri a disposizione (i giri partono da 0 all'inizio del gioco)
  let f = null; for(let d=QU_MEDEVAC_MIN_DIST; d>=8 && !f; d-=2) f = x.freeSpot(d,5,null,5,QU_MEDEVAC_MAX_DIST);
  if(!f) return false;
  C.medevac = {c:f.c,r:f.r,until:QU_MEDEVAC_TURNS,taken:false,failed:false,vet:null};
  return true;
}
function quStartVeglia(nb){                      // 🏰 la fortezza è sorta lontano da tutto: arrivano i mostri elite
  const C = COOP;
  const cells = coopShuf(allHexes().filter(([c,r])=>walkable(c,r) && terr(c,r)!=='miniera' && terr(c,r)!=='risorse' && hexDist([c,r],[nb.c,nb.r])>=QU_VEGLIA_SPAWN_DIST));
  const near = cells.filter(([c,r])=>hexDist([c,r],[nb.c,nb.r])<=QU_VEGLIA_SPAWN_DIST+6), pool = near.length>=QU_VEGLIA_RAIDERS ? near : cells, ids = [];
  for(const [c,r] of pool){ if(ids.length>=QU_VEGLIA_RAIDERS) break; ids.push(quSpawnMonster(c,r,QU_RAIDER_STATS,{siege:true,siegeId:nb.id}).id); }
  C.veglia = {id:nb.id, ids, start:coopRound()};
  quSay(` 🏰 LA LUNGA VEGLIA! ${ids.length} mostri elite (danno ${QU_RAIDER_STATS.attacco}) marciano sulla fortezza: difendila!`);
}

// ================== CONTROLLI A OGNI AZIONE (chiamati da coopCheckQuests) ==================
function quTickMedevac(rd){
  const C = COOP, M = C.medevac; if(!M || C.st.medevacDone || M.failed) return;
  if(!M.taken){
    const near = coopHumans().find(i=>players[i].units.some(u=>!u.survivor && hexDist([u.c,u.r],[M.c,M.r])<=1));
    if(near!==undefined){
      const v = coopSpawnVet(near,M.c,M.r);
      if(v){ v.medevac = true; M.taken = true; M.vet = v.id; outLog += ` 🚁 Pilota recuperato da ${players[near].name}! Riportalo accanto a una base entro ${Math.max(0,M.until-rd)} turni.`; return; }
    }
    if(rd>=M.until){ M.failed = true; outLog += ' 🚁 Il segnale SOS si è spento: pilota perduto.'; }
    return;
  }
  const v = quFind(M.vet);
  if(!v){ M.failed = true; outLog += ' 💀 Il pilota è morto.'; return; }
  if(quHumanBases().some(b=>hexDist([b.c,b.r],[v.c,v.r])<=1)){ C.st.medevacDone = true; return; }
  if(rd>=M.until){ M.failed = true; outLog += ' 🚁 Troppo tardi: il pilota è perduto.'; }
}
function quTickAsh(rd){                          // 🔥 Risorto dalle Ceneri: scende a 1 vita → si cura al massimo → uccide (dealDamage controlla ash.healed)
  if(!coopHasQuest('he_risorto')) return;
  quHumanUnits().forEach(u=>{
    const mx = maxHp(u);
    if(u.hp===1 && mx>=2){ if(!u.ashArmed){ u.ashArmed = true; u.ash = {rd,healed:false}; } }
    else if(u.hp>1) u.ashArmed = false;
    if(u.ash){
      if(rd-u.ash.rd>QU_ASH_ROUNDS) delete u.ash;
      else if(!u.ash.healed && u.hp>=mx && mx>=2) u.ash.healed = true;
    }
  });
}
function quTick(){
  const C = COOP, st = C.st, rd = coopRound();
  if(C.relic && !st.relic){ const pr = quPriest(); if(pr && hexDist([pr.c,pr.r],[C.relic.c,C.relic.r])<=1){ st.relic = true; outLog += ' 🏺 Il Sacerdote ha raggiunto la reliquia!'; } }
  quTickMedevac(rd);
  if(coopHasQuest('gu_rinforzi')){ const n = quHumanUnits().filter(u=>u.drop!==undefined && rd>u.drop).length; if(n>(st.dropBest||0)) st.dropBest = n; }   // unità paracadutate accanto alla base finale e sopravvissute a un giro intero
  quTickAsh(rd);
}
function quEndTurn(me){                          // a fine turno di "me" (dopo coopEndTurn di dcoop.js)
  const C = COOP, st = C.st, mp = quMon(), p = players[me];
  if(p.monster){                                 // fine del turno dei mostri: Rapimento alieno (un boss vicino a una tua fortezza)
    if(coopHasQuest('al_rapimento')){
      const forts = quHumanBases().filter(b=>b.fort);
      const near = mp.units.some(u=>u.boss && forts.some(b=>hexDist([u.c,u.r],[b.c,b.r])<=QU_ABD_DIST));
      st.abd = near ? (st.abd||0)+1 : 0; st.abdBest = Math.max(st.abdBest||0, st.abd);
    }
    return;
  }
  if(coopHasQuest('al_osservatore')) p.units.forEach(u=>{   // fermo (non si è mosso né ha sparato) in una casella di nebbia a distanza <= QU_OBS_DIST da una base nemica
    const ok = !u.survivor && !u.qAct && !!T(u.c,u.r).fog && mp.bases.some(b=>hexDist([u.c,u.r],[b.c,b.r])<=QU_OBS_DIST);
    u.obsT = ok ? (u.obsT||0)+1 : 0; if(u.obsT>(st.obsBest||0)) st.obsBest = u.obsT;
  });
  if(quOwner('ze_sciame')===me) st.swarm = p.units.length>=MAX_UNITS ? (st.swarm||0)+1 : 0;   // limite di unità raggiunto: un altro giro
  p.units.forEach(u=>{ u.qAct = false; });
}
function quAfterAction(a,actor,e,fromHangar){    // dopo ogni azione riuscita di un giocatore umano (e = entità che agisce)
  if(a.t==='endTurn' || !e) return;
  const st = COOP.st;
  if(a.t==='move' || a.t==='attack' || a.t==='airdrop') e.qAct = true;                                       // Osservatore Occulto: si è mosso o ha sparato
  if(a.t==='useCard' || a.t==='airdrop' || a.t==='fortino' || a.t==='upgrade'){ e.cardStep = step; if(e.bossStep===step) e.soloBroken = true; }   // Sanguinario Supremo: carta usata nel turno in cui ha ferito il boss
  players[actor].units.forEach(u=>{ if(u.actions>=QU_OC_ACTIONS && !(u.oc && u.oc.step===step)) u.oc = {step,kills:0}; });   // Overclock Letale: da ora e fino a fine turno conta le uccisioni
  if(a.t==='move' && fromHangar && quOwner('ze_alveare')===actor && hangarAt(e.c,e.r,actor) && quMon().bases.some(b=>hexDist([b.c,b.r],[e.c,e.r])<=1)){   // Rete dell'Alveare: sbucata da un hangar accanto a una base nemica
    let h = st.hive; if(!h || h.step!==step || h.hc!==e.c || h.hr!==e.r) h = st.hive = {step,hc:e.c,hr:e.r,ids:[]};
    if(!h.ids.includes(e.id)) h.ids.push(e.id);
  }
}
function quOnBuilt(u,pi,c,r,id){                 // un giocatore umano ha costruito un edificio
  const C = COOP, st = C.st;
  if(BUILDINGS[id].struct || id==='fortezza') (st.built = st.built || {})[id] = true;   // Fabbriche e laboratori: tipi già costruiti
  if(id==='labArmi') st.labArmi = (st.labArmi||0)+1;
  if(id!=='fortezza') return;
  const nb = players[pi].bases.find(b=>b.c===c && b.r===r); if(!nb) return;
  nb.fort = true;                                // fortezza (non una base iniziale): serve a Rapimento alieno e Impero Abissale
  if(coopHasQuest('he_portale') && quMon().bases.some(b=>hexDist([b.c,b.r],[c,r])<=1)) st.portal = true;
  if(coopHasQuest('me_veglia') && !C.veglia && quHumanBases().filter(b=>b!==nb).every(b=>hexDist([b.c,b.r],[c,r])>=QU_VEGLIA_DIST)) quStartVeglia(nb);
}
function quAfterHit(e,att,res,isMon,isHum){      // dopo ogni danno (dealDamage): taint dei duelli, conteggi delle uccisioni
  const C = COOP, st = C.st; if(!res) return;
  if(e.ghostTech && res.dead) st.ghostDown = true;
  if(isHum && !res.shield && res.dmg>0 && (e.techArmor||0)>=1 && e.mediUsed) e.dmgTaken = (e.dmgTaken||0)+res.dmg;   // Macchine Inarrestabili
  const ai = att ? ownerOf(att) : -1;
  if(!isMon || res.shield || !(res.dmg>0) || !att || ai<0 || players[ai].monster) return;   // da qui: un mostro (unità) ferito da un'entità dei giocatori
  const unitAtt = !att.isBase && !att.isStruct, rd = coopRound();
  const steel = !!att.isStruct && (att.type==='artiglieria' || att.type==='silo');
  if(!steel) e.qDirect = true;                                                    // Pioggia d'Acciaio: colpito da fanteria, base o bunker
  if(e.champion && (!unitAtt || hexDist([att.c,att.r],[e.c,e.r])>1 || att.impure)) e.duelBroken = true;   // Duello d'Onore: solo 1 unità, corpo a corpo, mai carte né cure
  if(e.boss && unitAtt){ if(att.cardStep===step) att.soloBroken = true; att.bossStep = step; }   // Sanguinario Supremo
  if(!res.dead) return;
  if(unitAtt && T(att.c,att.r).fog) st.fogKills = (st.fogKills||0)+1;            // Predatori della Nebbia
  if(steel && !e.qDirect) st.steelKills = (st.steelKills||0)+1;                    // Pioggia d'Acciaio
  if(unitAtt && e.xf && e.xf.rd===rd && e.xf.ids.length>=COOP_CROSSFIRE_UNITS) st.xfireKill = true;   // Fuoco Incrociato: l'ultimo colpo è della terza unità
  if(unitAtt && att.tamed && att.tameStep===step) st.assim = true;                // Assimilazione Mentale: l'addomesticato (stesso turno) uccide un altro mostro
  if(unitAtt && att.amb && att.amb.step===step && att.amb.ids.includes(e.id)) st.ambush = true;   // Agguato Sotterraneo
  const so = quOwner('ze_insaziabile');
  if(so!==undefined && players[so].units.filter(u=>hexDist([u.c,u.r],[e.c,e.r])<=1).length>=QU_SURROUND_UNITS) st.swarmKill = true;   // Sciame Insaziabile
  if(unitAtt && att.ash && att.ash.healed && rd-att.ash.rd<=QU_ASH_ROUNDS) st.phoenix = true;   // Risorto dalle Ceneri
  if(unitAtt && att.oc && att.oc.step===step){ att.oc.kills++; if(att.oc.kills>=QU_OC_KILLS) st.overclock = true; }   // Overclock Letale
  if(e.stasisRd!==undefined && rd-e.stasisRd<=QU_STASIS_ROUNDS){                  // Bolla di Stasi: mostri con tutte le azioni tolte e distrutti nel giro
    const k = (st.stasisK && st.stasisK.rd===e.stasisRd) ? st.stasisK : (st.stasisK = {rd:e.stasisRd,n:0});
    if(++k.n>=QU_STASIS_UNITS) st.stasisDone = true;
  }
  if(e.champion){ if(!e.duelBroken && unitAtt && !att.impure && e.atk && e.atk.every(id=>id===att.id)) st.duel = true; else st.duelFail = true; }   // Duello d'Onore
  if(e.boss && unitAtt && !att.soloBroken && e.atk && e.atk.every(id=>id===att.id)) st.supreme = true;   // Sanguinario Supremo
}

// ================== GANCI (WRAPPER) ==================
let quHooked = false;
function quInstallHooks(){                       // chiamata da coopInstallHooks (dcoop.js), dopo i suoi ganci: qui si avvolgono anche quelli
  if(quHooked) return; quHooked = true;
  const on = quOn;
  if(typeof dealDamage==='function'){
    const orig = dealDamage;
    dealDamage = function(e,raw,att,opts){
      if(!on()) return orig(e,raw,att,opts);
      if(e && e.ghostTech && raw>0){             // Top-tech fantasma: scudo infinito, cade solo alla Demolizione di un'unità con Spettro
        const ok = !!(opts && opts.cover===false && att && !att.isBase && !att.isStruct && att.spectreBuff);
        if(!ok) return {dmg:0,shield:true,dead:false,healed:0};
      }
      const isMon = !e.isBase && !e.isStruct && players[COOP.mon].units.includes(e);
      const isHum = !e.isBase && !e.isStruct && !isMon;
      const res = orig(e,raw,att,opts);
      quAfterHit(e,att,res,isMon,isHum);
      return res;
    };
  }
  if(typeof playCard==='function'){
    const orig = playCard;
    playCard = function(e,slot){
      if(!on()) return orig(e,slot);
      const p = curPlayer(), cid = p.cards[slot], st = COOP.st;
      let hit = null;
      if(!p.monster){                            // i conteggi vanno aggiornati PRIMA: playCard chiama da sé afterAction (controllo quest)
        if(cid==='C09') e.mediUsed = true;       // Macchine Inarrestabili: ha avuto il Medikit
        if(cid==='C04'){                         // EMP: mostri colpiti (Blackout Neurale)
          hit = quMon().units.filter(u=>hexDist([u.c,u.r],[e.c,e.r])<=EMP_RANGE);
          st.empBest = Math.max(st.empBest||0, hit.length);
        }
      }
      const res = orig(e,slot);
      if(hit) hit.forEach(u=>{ if((u.empDebuff||0)>=ACTIONS_PER_TURN) u.stasisRd = coopRound(); });   // Bolla di Stasi: mostri con tutte le azioni tolte
      if(!p.monster) coopCheckQuests();          // playCard non chiama afterAction: senza questo la quest si completerebbe solo con l'azione successiva
      return res;
    };
  }
  if(typeof airdrop==='function'){
    const orig = airdrop;
    airdrop = function(e,c,r,slot){
      const res = orig(e,c,r,slot);
      if(!on()) return res;
      const ui = ownerOf(e);
      if(ui>=0 && !players[ui].monster){
        const fb = coopFinalBase();
        if(fb && hexDist([e.c,e.r],[fb.c,fb.r])<=1) e.drop = coopRound();      // Rinforzi dal cielo
        if(quOwner('ze_agguato')===ui) e.amb = {step, ids:quMon().units.filter(m=>hexDist([m.c,m.r],[e.c,e.r])<=1 && m.hp>=QU_AMBUSH_HP).map(m=>m.id)};   // Agguato Sotterraneo
      }
      return res;
    };
  }
  if(typeof cardBlock==='function'){ const orig = cardBlock; cardBlock = function(e,p,slot){ if(on() && e && e.priest) return 'Il Sacerdote non può usare carte'; return orig(e,p,slot); }; }
  if(typeof conqueror==='function'){ const orig = conqueror; conqueror = function(c,r,owner){ if(on() && quMon().structs.some(s=>s.ghostTech && s.c===c && s.r===r)) return -1; return orig(c,r,owner); }; }   // il Top-tech fantasma non si conquista
  if(typeof construct==='function'){
    const orig = construct;
    construct = function(u,c,r,build){
      const ui = on() ? ownerOf(u) : -1;
      const res = orig(u,c,r,build);
      if(ui>=0 && !players[ui].monster && build && build.type==='building') quOnBuilt(u,ui,c,r,build.id);
      return res;
    };
  }
  if(typeof demolish==='function'){              // Terra infernale: foresta o acqua demolita
    const orig = demolish;
    demolish = function(u,c,r){
      const ui = on() ? ownerOf(u) : -1, k = terr(c,r), cand = ui>=0 && !players[ui].monster && (k==='copertura' || k==='acqua') && !entitiesHere(c,r).length;
      const res = orig(u,c,r);
      if(cand && terr(c,r)!==k) COOP.st.terra = (COOP.st.terra||0)+1;
      return res;
    };
  }
  if(typeof collect==='function'){               // Biomassa: unità diverse che raccolgono nello stesso turno
    const orig = collect;
    collect = function(u,c,r){
      const ui = on() ? ownerOf(u) : -1, res = orig(u,c,r);
      if(ui>=0 && ui===quOwner('ze_biomassa')){ const st = COOP.st; if(!st.bio || st.bio.step!==step) st.bio = {step,ids:[]}; if(!st.bio.ids.includes(u.id)) st.bio.ids.push(u.id); st.bioBest = Math.max(st.bioBest||0, st.bio.ids.length); }
      return res;
    };
  }
  if(typeof heal==='function'){                  // Assimilazione Mentale: il turno in cui un mostro viene addomesticato
    const orig = heal;
    heal = function(u,c,r){ const ent = on() ? entityHere(c,r) : null, res = orig(u,c,r); if(ent && ent.tamed && ent.tameStep===undefined) ent.tameStep = step; return res; };
  }
  if(typeof fire==='function'){                  // Sangue e Caos: l'unità con Esplosivo muore nella propria esplosione e porta con sé un nemico
    const orig = fire;
    fire = function(a,c,r){
      if(!on() || !a.demoBuff || !coopHasQuest('he_sangue')) return orig(a,c,r);
      const mp = quMon(), before = [...mp.units,...mp.bases].map(v=>v.id), res = orig(a,c,r);
      if(ownerOf(a)<0){ const after = new Set([...mp.units,...mp.bases].map(v=>v.id)); if(before.some(id=>!after.has(id))){ COOP.st.cultist = true; quSay(' 🩸 Sacrificio di sangue!'); } }
      return res;
    };
  }
  if(typeof structFire==='function'){            // colpo nucleare: unità alleate e mostri distrutti dall'esplosione (Apocalisse Infernale, Sacrificio dell'Eroe)
    const orig = structFire;
    structFire = function(s,c,r,nuke,smk){
      if(!on() || !nuke) return orig(s,c,r,nuke,smk);
      const area = blastCells(c,r), inArea = v => area.some(([x,y])=>x===v.c && y===v.r);
      const monB = quMon().units.filter(inArea).map(u=>u.id), humB = quHumanUnits().filter(inArea).map(u=>u.id);
      const res = orig(s,c,r,nuke,smk), st = COOP.st;
      const monD = monB.filter(id=>!quMon().units.some(u=>u.id===id)).length, humD = humB.filter(id=>!coopHumans().some(i=>players[i].units.some(u=>u.id===id))).length;
      if(humD>=1) st.nukeSac = (st.nukeSac||0)+1;
      if(monD>=QU_HERO_KILLS && humD>=1) st.hero = true;
      return res;
    };
  }
  if(typeof coopOnDeath==='function'){           // Rete dell'Alveare: la base nemica accanto all'hangar cade nello stesso turno
    const orig = coopOnDeath;
    coopOnDeath = function(e,victim,killer,att,wasUnit){
      orig(e,victim,killer,att,wasUnit);
      if(!on() || victim!==COOP.mon || !e.isBase) return;
      const h = COOP.st.hive; if(h && h.step===step && h.ids.length>=QU_HIVE_UNITS && hexDist([e.c,e.r],[h.hc,h.hr])<=1) COOP.st.hiveDone = true;
    };
  }
  if(typeof coopObjAt==='function'){             // reliquia e segnale del pilota occupano la loro casella
    const orig = coopObjAt;
    coopObjAt = function(c,r){
      if(orig(c,r)) return true;
      if(!COOP) return false;
      const R = COOP.relic, M = COOP.medevac;
      return !!((R && !COOP.st.relic && R.c===c && R.r===r) || (M && !M.taken && !M.failed && M.c===c && M.r===r));
    };
  }
  if(typeof coopCheckQuests==='function'){ const orig = coopCheckQuests; coopCheckQuests = function(){ if(on()) quTick(); return orig(); }; }
  if(typeof coopEndTurn==='function'){ const orig = coopEndTurn; coopEndTurn = function(me){ orig(me); if(!on()) return; quEndTurn(me); coopCheckQuests(); }; }
  if(typeof runAction==='function'){
    const orig = runAction;
    runAction = function(a,actor){
      if(!on() || !a || typeof a.t!=='string' || phase!=='play' || actor!==step%NUM_PLAYERS) return orig(a,actor);
      const e = a.ent!==undefined ? findEnt(a.ent) : null, fromHangar = !!(e && a.t==='move' && hangarAt(e.c,e.r,actor));
      const err = orig(a,actor);
      if(!err && !players[actor].monster) quAfterAction(a,actor,e,fromHangar);
      return err;
    };
  }
  if(typeof giveBotStart==='function'){          // dai.js tira a caso le abilità di tutte le unità iniziali dei mostri: il Campione deve restare al massimo
    const orig = giveBotStart;
    giveBotStart = function(pi){
      orig(pi);
      if(on() && pi===COOP.mon) players[pi].units.filter(u=>u.champion).forEach(u=>{ u.st = Object.fromEntries(STATS.map(s=>[s.id,statBaseMax(s.id)])); u.hp = u.st.vita; });
    };
  }
  // ---- AI dei mostri: i raider della Lunga Veglia vanno solo alla fortezza ----
  if(typeof aiChooseAction==='function'){
    const orig = aiChooseAction;
    aiChooseAction = async function(e,st){
      if(!(on() && e && e.siege)) return orig(e,st);
      const f = quFind(e.siegeId);
      if(!f || !f.isBase){ e.siege = false; return orig(e,st); }                      // fortezza distrutta: tornano normali
      if(targets(e).some(h=>h.c===f.c && h.r===f.r)) return {t:'attack',ent:e.id,c:f.c,r:f.r};
      const reach = reachable(e);
      if(rangeOf(e)>1 && typeof aiTactical==='function'){ const t = await aiTactical(e,f,reach,st); if(t) return t; }
      return (typeof aiProgressMove==='function' ? aiProgressMove(e,f,reach,st) : null) || null;
    };
  }
  // ---- disegno ----
  if(typeof coopDrawObjects==='function'){
    const orig = coopDrawObjects;
    coopDrawObjects = function(){
      orig();
      if(!quOn() || typeof g==='undefined') return;
      const one = (o,em,always) => { if(!always && !coopExpl(o.c,o.r)) return; const [x,y] = ctr(o.c,o.r); if(x<-S*2||y<-S*2||x>CW+S*2||y>CH+S*2) return;
        g.save(); g.globalAlpha = 1; g.font = Math.round(S*0.95)+'px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.fillText(em,x,y+S*0.05); g.restore(); };
      const R = COOP.relic, M = COOP.medevac;
      if(R && !COOP.st.relic) one(R,QU_RELIC_EMOJI);
      if(M && !M.taken && !M.failed){               // segnale del pilota: si vede sempre, con i turni rimasti
        one(M,QU_MEDEVAC_EMOJI,true);
        const [x,y] = ctr(M.c,M.r); g.save(); g.font = `bold ${Math.round(S*0.42)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3;
        g.strokeText('⏱'+quMedevacLeft(),x,y+S*0.85); g.fillText('⏱'+quMedevacLeft(),x,y+S*0.85); g.restore();
      }
    };
  }
  if(typeof coopMarks==='function'){
    const orig = coopMarks;
    coopMarks = function(e,x,y){
      orig(e,x,y);
      if(!quOn() || typeof g==='undefined') return;
      const em = (t,dx,dy,sz) => { g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold ${Math.round(S*sz)}px Arial`; g.fillText(t,x+S*dx,y+S*dy); g.restore(); };
      if(e.ghostTech){ g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold ${Math.round(S*0.6)}px Arial`; g.fillStyle = '#facc15'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText('∞',x+S*0.55,y-S*0.6); g.fillText('∞',x+S*0.55,y-S*0.6); g.restore(); }
      if(e.priest) em(QU_PRIEST_EMOJI,-0.45,-0.1,0.4);
      if(e.champion) em(QU_CHAMPION_EMOJI,0,-0.8,0.5);
      if(e.siege) em(QU_RAIDER_EMOJI,0,-0.8,0.45);
      if(e.medevac) em('🆘',-0.45,-0.1,0.38);
    };
  }
}
