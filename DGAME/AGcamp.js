'use strict';
/* AIRGRUNT · AGcamp.js — campagna dinamica (modalità storia).
   Strato SOPRA le missioni: non ne cambia le regole, decide solo quale missione giocare (e con quali parametri) e ascolta l'esito.
   - Stato di campagna (CAMP): seed, difficoltà base, lunghezza, esiti [missione, 1 vittoria / 0 sconfitta], flag narrativi, piano del capitolo (pl).
     Tutto il resto si ricalcola da qui: è questo che si salva (localStorage) e che viaggia in rete (welcome / init / over).
   - Grafo narrativo = tabella dati CM (ruoli, flag, testi). Il regista (campPick/campPlan) sceglie il capitolo dopo con un generatore seminato: deterministico.
   - Regole: al massimo 3 sconfitte (la 4ª chiude la campagna); l'ultimo capitolo va vinto (se perso, la campagna è persa).
   - Decide solo l'host (o il singolo): finish() chiama campFinish(); i client ricevono lo stato e mostrano solo briefing/debriefing (HTML locale). */
const CAMP_KEY='airgrunt_campaign',CAMP_VER=1,CAMP_MAXLOST=3;
// pl = piano del capitolo in corso (durante la partita) o del prossimo (dopo la fine di un capitolo): {m missione, d difficoltà, p profilo mappa, w meteo, s seed}
const CAMP={on:0,want:0,sd:0,d0:1,len:7,res:[],fl:[],pl:null,done:0,ov:0,br:0,sh:'',tm:0};   // done: 0 in corso · 1 campagna vinta · 2 campagna persa

// ===== nomi (dal seed di campagna) e frammenti di testo =====
const CN_OP1=['Falco','Melo','Lupo','Gufo','Squalo','Titano','Cinghiale','Drago'],CN_OP2=['Grigio','Nero','Rosso','Silente','Spettrale','Cremisi','d’Acciaio','di Cenere'];
const CN_CMD=['il colonnello Voss','il generale Kessler','il maggiore Drax','il colonnello Spawn','il generale Helios','il maggiore Dlegion'];
const CN_VIP=['l’ingegner Dolf','la dottoressa Veruska','il dottor Sirus','la professoressa Alina','lo scienziato Catellani','la scienziata Aniah'];
const CN_INTRO=['{Cmd} ha occupato la regione e la resistenza locale è all’ultima spiaggia. L’operazione {op} è l’ultima possibilità di riprendere la regione.','{Cmd} controlla ormai quasi tutta la regione. L’operazione {op} deve ribaltare le sorti della guerra o perderemo la regione.'];
let _nm=null;
function campNm(){if(!_nm||_nm.sd!==CAMP.sd){const R=rng((CAMP.sd^0x51ED)>>>0),pk=a=>a[R()*a.length|0];_nm={sd:CAMP.sd,op:pk(CN_OP1)+' '+pk(CN_OP2),cmd:pk(CN_CMD),vip:pk(CN_VIP),i:R()<.5?0:1}}return _nm}
function campT(s){const n=campNm(),U=x=>x.charAt(0).toUpperCase()+x.slice(1);
 return s.replace(/\{op\}/g,n.op).replace(/\{Cmd\}/g,U(n.cmd)).replace(/\{cmd\}/g,n.cmd).replace(/\{Vip\}/g,U(n.vip)).replace(/\{vip\}/g,n.vip)}

// ===== grafo narrativo: una voce per missione =====
// b = briefing · bv = varianti del briefing [flag, testo] (vale la prima i cui flag esistono) · bf / bfv = briefing e varianti se è il capitolo FINALE (facoltativi) · w / l = conseguenza di vittoria / sconfitta
// sw / sl = flag impostati da vittoria / sconfitta · fw / fl = testi se è il capitolo FINALE (epilogo) · fwv = varianti dell'epilogo di vittoria [flag, testo] (vale la prima i cui flag esistono)
// Flag: sup/noSup scorte · vip/noVip tecnico · sab/hard difese nemiche · cmd/cmdLive comandante · fwd/noFwd base avanzata · ally/noAlly alleati · held/baseLost base · pilots/pilotsLost superstiti · ship/noShip nave spaziale
const CM={
 0:{b:'Il nemico presidia il settore con forze notevoli, si crede al sicuro. Stermina ogni nemico come atto dimostrativo, fagli capire che non importa quanti soldati schiera, noi possiamo spazzarli via tutti.',
  bv:[['cmd','Senza {cmd} l’esercito nemico è nel panico, ma presidia ancora il settore con forze notevoli e si crede al sicuro. Stermina ogni nemico come atto dimostrativo: fagli capire che nemmeno senza il loro capo hanno scampo.'],
   ['sab','Con le difese del settore a pezzi il nemico è più vulnerabile, ma presidia ancora l’area con forze notevoli. Stermina ogni nemico come atto dimostrativo, fagli capire che non importa quanti soldati schiera, noi possiamo spazzarli via tutti.'],
   ['fwd','Dalla nostra base avanzata il settore è sotto controllo, ma il nemico presidia ancora l’area con forze notevoli e si crede al sicuro. Stermina ogni nemico come atto dimostrativo, fagli capire che non importa quanti soldati schiera, noi possiamo spazzarli via tutti.']],
  bf:'Il nemico ha ritirato ogni forza rimasta nel settore: è la sua ultima resistenza, non ha più riserve né rinforzi. Stermina ogni nemico e distruggi le caserme: quando l’ultimo soldato cade, la guerra è vinta.',
  bfv:[['cmd','Senza {cmd} il comando nemico è allo sbando, ma i suoi ultimi soldati si sono asserragliati nel settore in un’ultima resistenza disperata. Stermina ogni nemico e distruggi le caserme: quando l’ultimo soldato cade, la guerra è vinta.'],
   ['sab','Le difese nemiche sono a pezzi e i suoi ultimi soldati si sono asserragliati nel settore in un’ultima resistenza disperata, senza riserve né rinforzi. Stermina ogni nemico e distruggi le caserme: quando l’ultimo soldato cade, la guerra è vinta.'],
   ['ally','Gli alleati hanno isolato il nemico: i suoi ultimi soldati si sono asserragliati nel settore in un’ultima resistenza disperata, senza riserve né rinforzi. Stermina ogni nemico e distruggi le caserme: quando l’ultimo soldato cade, la guerra è vinta.']],
  w:'Il settore è stato pacificato...e abbiamo mandato un chiaro messaggio al nemico: ci siamo divertiti nel farlo!',l:'Forse avevamo sottovalutato la forza del nemico. Questo fallimento ci sia di lezione.',sw:[],sl:[],
  fw:'Non resta un solo soldato nemico nel settore: l’ultima resistenza è stata spezzata e le caserme sono macerie. Il nemico non ha più un esercito, la guerra è vinta.',fl:'L’ultima resistenza nemica ha tenuto: i suoi soldati hanno respinto i nostri attacchi e ora hanno le forze per riprendersi la regione. La resistenza locale non ha più uomini né mezzi, è finita.'},
 1:{b:'Un convoglio di rifornimenti deve attraversare territorio nemico per raggiungere un avamposto, ma bisogna passare via terra per evitare la possente difesa anti-aerea nemica. Aprigli la strada e scortalo fino a destinazione.',
  bv:[['hard','Le difese nemiche del settore sono state rinforzate: il convoglio dovrà aprirsi la strada tra imboscate e blocchi stradali ancora più letali.']],
  w:'Il convoglio è arrivato al nostro avamposto: ora l’avamposto ha armi sufficienti per difendere l’area e lanciare missioni offensive.',l:'Il convoglio è stato distrutto: le scorte dell’avamposto sono ridotte al minimo, riusciranno a malapena a difendersi ma non per molto, e di certo non ad aiutarci.',sw:['sup'],sl:['noSup']},
 2:{b:'{Vip}, un tecnico chiave della resistenza, ha sottratto al nemico una preziosa nuova tecnologia oltre ad informazioni vitali, ma ora è bloccato in un edificio nemico. Recuperalo e scortalo all’estrazione. Questa volta... vivo magari.',
  bv:[['noSup','Senza rifornimenti la resistenza locale è allo stremo e {vip} è l’ultima speranza di recuperare nuove risorse e non essere spazzati via. Recuperalo e portalo via.']],
  w:'{Vip} è in salvo e ha consegnato i piani del nemico ed una preziosa nuova tecnologia.',l:'{Vip} è nelle mani del nemico: la resistenza è cieca senza informazioni vitali.',sw:['vip'],sl:['noVip']},
 3:{b:'Alcune strutture chiave sono essenziali per le difese nemiche. Senza queste strutture le difese nemiche perderanno molta della loro efficacia e coordinazione. Distruggile tutte.',
  bv:[['sup','Con i rifornimenti arrivati all’avamposto ora puoi colpire più a fondo: distruggi le strutture chiave che alimentano le difese nemiche.'],['vip','{Vip} ha individuato i punti deboli della difesa nemica: distruggi le strutture chiave che alimentano difese nemiche e la loro efficacia crollerà drasticamente.']],
  w:'Le difese nemiche del settore sono a pezzi: il nemico ora è più vulnerabile.',l:'Il sabotaggio è fallito: il nemico ora ha rinforzato e decentralizzato i punti deboli che alimentano le sue difese, sarà più difficile indebolire le difese nemiche.',sw:['sab'],sl:['hard']},
 4:{b:'{Cmd} si muove tra le città del settore, seminando distruzione e gravi perdite tra le nostre difese. Pare che abbia una nuova tecnologia ed armi efficacissime. Sta seminando il terrore tra le nostre difese, ma la sua leggenda finisce qua. Trovalo ed eliminalo, in modo spettacolare se possibile.',
  bv:[['vip','{Vip} ha scoperto dove si trova {cmd}: è il momento di prendere l’iniziativa e colpirlo quando non se lo aspetta. Questa volta invece di subire i suoi attacchi saremo noi ad attaccarlo.'],['pilots','I superstiti hanno visto dove si trova il terrore delle nostre difese: {cmd}: è il momento di colpirlo mentre non se lo aspetta invece di subire sempre la sua offensiva.']],
  w:'{Cmd} è caduto: l’esercito nemico è nel panico per la brutale eliminazione della sua leggenda. Ora sono facili prede dei nostri attacchi.',l:'{Cmd} è sfuggito al tentativo di assassinio, mantenendo l’aura leggendaria che lo avvolge, e ora è più cauto e più pericoloso, ed i suoi soldati ancora più motivati.',sw:['cmd'],sl:['cmdLive']},
 5:{b:'Ci servono avamposti per organizzare le nostre difese nella zona e far partire attacchi verso il nemico. Al tempo stesso dobbiamo indebolire il nemico: occupa gli avamposti nemici e difendili dal contrattacco nemico finché non sono in sicurezza.',
  bv:[['sab','Le difese indebolite del nemico ti permettono di occupare facilmente gli avamposti nemici: conquistali e difendili dai contrattacchi finchè non sono in sicurezza.']],
  w:'Gli avamposti nemici ora sono nostri: la resistenza locale ora ha una base avanzata da cui può far partire attacchi verso il nemico.',l:'L’assalto agli avamposti nemici è stato respinto: non siamo riusciti ad insediarci nella zona ed il nemico è libero di contrattaccare con ancora maggior forza.',sw:['fwd'],sl:['noFwd']},
 6:{b:'Sappiamo che il nemico utilizza dispositivi nucleari, e ora sappiamo dove si trovano. Anche se la loro difesa anti-aerea blocca ogni nostro bombardamento, praticamente hanno una bomba nucleare già pronta dietro le loro linee, basta solo farla esplodere. Conquista il sito, innesca la detonazione e raggiungi l’estrazione prima che esploda.',
  bv:[['cmdLive','{Cmd} è sempre più agguerrito e intenzionato ad usare il suo arsenale nucleare... ma solo se questo non esplode prima! Conquista il sito nucleare, innesca la detonazione e raggiungi l’estrazione prima che esploda.'],
   ['ship','La nave spaziale che abbiamo rubato ci dà il controllo dell’orbita, ma l’antiaerea nemica blocca comunque ogni bombardamento: comunque l’arsenale nucleare nemico è come una bomba già pronta dietro le loro linee, basta solo farla esplodere. Conquista il sito, innesca la detonazione e raggiungi l’estrazione prima che esploda.'],
   ['noShip','Il nemico ha ripreso la sua nave spaziale e ci sovrasta dall’orbita, tuttavia l’arsenale nucleare nemico è come una bomba già pronta dietro le loro linee: basta solo farla esplodere. Conquista il sito, innesca la detonazione e raggiungi l’estrazione prima che esploda.']],
  w:'L’arsenale nemico non esiste più, è stato spazzato via ed ora non restano che ceneri e rimasugli di quello che era un grande esercito.',l:'L’arsenale nucleare è rimasto saldamente nelle mani del nemico, ed ora sicuramente lo userà contro le nostre difese, con effetti devastanti.',sw:[],sl:[],
  fw:'L’arsenale nemico non esiste più: {cmd} ha perso la sua arma finale ed il suo esercito, la guerra è vinta.',
  fwv:[['cmd','L’arsenale nemico non esiste più: con {cmd} già caduto, il nemico non ha più né un capo né un’arma finale, e il suo esercito è allo sbando. La guerra è vinta.']],
  fl:'L’arsenale nucleare è rimasto intatto sotto il controllo nemico: la resistenza locale è stata spazzata via, non possiamo più opporci al nemico, è finita.'},
 7:{b:'Un’opportunità rara: una nave spaziale del nemico è in cantiere per riparazioni e rifornimenti. Rubare quella nave significa di colpo una nave in più per noi ed una in meno per il nemico. Conquista la centrale energetica che la alimenta e il cantiere spaziale che la trattiene, poi raggiungi la nave e imbarcati: decolla e lascia il settore.',
  bv:[['vip','{Vip} conosce i sistemi della nave spaziale nemica ferma in cantiere e sa come rubarla: conquista la centrale energetica e il cantiere, poi imbarcati e fai decollare la nave.'],
   ['pilots','I superstiti dello schianto sanno pilotare le navi nemiche: una nave spaziale è ferma in cantiere per riparazioni, e si può rubare. Conquista la centrale energetica e il cantiere, poi imbarcati e fai decollare la nave.'],
   ['sab','Con le difese del settore a pezzi puoi tentare il colpo: una nave spaziale nemica è ferma in cantiere per riparazioni. Conquista la centrale energetica e il cantiere, poi imbarcati: la nave sarà un’arma decisiva per la resistenza.'],
   ['hard','Il nemico ha rinforzato le difese del settore, ma la sua nave spaziale in cantiere vale ogni rischio. Conquista la centrale energetica e il cantiere, poi imbarcati e fai decollare la nave prima che finiscano le riparazioni.']],
  w:'La nave spaziale del nemico ora è nostra: ha lasciato il settore ed è in orbita sotto il nostro controllo, e i suoi sistemi di puntamento ci permettono di guidare attacchi nucleari sui bersagli che marchiamo. Il nemico ci ha fatto proprio un bel regalo.',l:'La nave spaziale è rimasta a terra in mano al nemico, che sta completando le riparazioni. Non capiterà più un’opportunità simile.',sw:['ship'],sl:['noShip'],
  fw:'La nave spaziale che abbiamo sottratto al nemico è in orbita: la resistenza locale ora ha un’arma decisiva, con il supporto orbitale il nemico è spacciato. La guerra è vinta.',fl:'La nave spaziale è rimasta a terra in mano al nemico che ha terminato le riparazioni. Ora sta tornando in orbita per bombardare le nostre difese, che non reggeranno. Non c’è più alcuna possibilità per la resistenza locale, è finita, il nemico ha vinto.'},
 8:{b:'Dieci delegati delle regioni nostre alleate raggiungono un vertice segreto, uno alla volta, in furgoni blindati. Discuteranno e decideranno se supportare la nostra causa oppure no. Difendi l’edificio del meeting e non lasciare che il nemico uccida i delegati.',
  bv:[['fwd','Dalla base avanzata la resistenza ospita un vertice segreto per discutere con i delegati di regioni alleate se darci maggior supporto: dieci delegati alleati arrivano uno alla volta in furgoni blindati. Difendi l’edificio del meeting e non lasciare che il nemico uccida i delegati.']],
  w:'Il vertice si è svolto: la sicurezza che gli abbiamo garantito li ha convinti a fornirci supporto.',l:'Le gravi perdite hanno fatto saltare il vertice. Gli alleati hanno perso fiducia nelle nostre capacità militari e ci hanno negato ogni supporto.',sw:['ally'],sl:['noAlly'],
  fw:'Il vertice dei delegati ha firmato l’armistizio: {cmd} è isolato ed in inferiorità assoluta, ha deciso di arrendersi prima di capitolare ed essere eliminato. La guerra è finita.',
  fwv:[['cmd','Il vertice dei delegati ha firmato l’armistizio: con {cmd} caduto il comando nemico è allo sbando, le sue forze sono isolate ed in inferiorità assoluta e si arrendono senza condizioni. La guerra è finita.']],
  fl:'Il vertice è fallito: gli alleati erano la nostra unica speranza, molti sono rimasti neutrali ed alcuni si sono alleati con il nemico. La resistenza locale è spacciata, dobbiamo arrenderci al nemico.'},
 9:{b:'Un attacco nemico ad una nostra base è imminente. Il nemico ha forze ingenti ed assalterà incessantemente in modo frontale e diretto, contando sui suoi numeri. Dobbiamo dimostrargli che il numero non basta. Difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.',
  bv:[['noFwd','Dopo il fallimento nella conquista degli avamposti il nemico contrattacca pesantemente mirando direttamente alla nostra base: difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.'],['fwd','Il nemico vuole riprendersi i territori perduti e attacca direttamente la nostra base con forze soverchianti: difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.'],
   ['ship','Il nemico non ha perdonato il furto della nave spaziale e attacca direttamente la nostra base con forze soverchianti, deciso a vendicarsi. Difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.'],
   ['noShip','Il nemico ha riparato la sua nave spaziale e, forte del supporto orbitale, attacca direttamente la nostra base con forze soverchianti: difendi l’edificio principale della base ad ogni costo, rimpiazza le torrette che vengono distrutte.']],
  w:'La nostra base ha respinto le ondate nemiche ed è ancora operativa: il nemico ha perso l’iniziativa.',l:'La nostra base è stata distrutta: la resistenza locale è in ritirata ed abbiamo ceduto molto territorio al nemico.',sw:['held'],sl:['baseLost'],
  fw:'La nostra base ha resistito all’ultimo devastante assalto nemico: ci hanno mandato contro tutto quello che avevano, e noi lo abbiamo ridotto in poltiglia. Ora l’offensiva nemica è spezzata, non gli rimane più un esercito, la guerra è vinta.',fl:'La nostra ultima base nel settore è stata travolta dalle ondate nemiche: non abbiamo più possibilità nè mezzi per contrastare il nemico. La regione è persa.'},
 10:{b:'Una dropship alleata è stata abbattuta dall’antiaerea nemica ed ha fatto un atterraggio di emergenza nel settore. Trova il relitto in territorio nemico e porta in salvo i superstiti.',
  bv:[['noVip','La resistenza locale ha già perso {vip} ed ora l’antiaerea nemica ha abbattuto una dropship con a bordo altri componenti chiave della resistenza locale. Non possiamo permetterci di perdere altri elementi essenziali. Trova il relitto in territorio nemico e porta in salvo i superstiti.']],
  w:'I superstiti dello schianto sono in salvo: i loro racconti svelano le mosse del nemico, dandoci un notevole vantaggio.',l:'I superstiti dello schianto sono andati perduti: la resistenza locale ha subito un altra grave perdita oggi.',sw:['pilots'],sl:['pilotsLost']}
};

// ===== regista =====
const campLost=r=>r.filter(x=>!x[1]).length;
function campPick(n,len,F,res,R){   // sceglie la missione del capitolo n (0 = primo, len-1 = finale); mai una missione già giocata
 const used=new Set(res.map(r=>r[0])),last=res.length?res[res.length-1]:null,lf=!!(last&&!last[1]),lost=campLost(res),has=f=>F.indexOf(f)>=0;
 let W;
 if(n<2)W={1:3,5:3,2:2,3:2};                                                  // apertura: missioni "leggere"
 else if(n>=len-1)W={0:1+(has('cmd')?2:0)+(has('sab')?2:0),6:1+(has('cmdLive')?2:0)+(has('hard')?2:0)+(has('noFwd')?1:0),7:1+(has('vip')?3:0)+(has('sab')?2:0),8:1+(has('cmd')?3:0)+(has('ally')?2:0),9:1+(has('fwd')?3:0)+(lost>=2?3:0)};   // finale: dipende da ciò che è successo
 else W={0:has('sab')||has('cmd')?3:lf?1:2,1:has('noSup')?4:1,2:lf?2:1,3:has('sup')?3:2,4:has('vip')||has('pilots')?4:1,5:1,7:has('vip')||has('sab')?3:1,8:has('fwd')||has('sup')?3:1,9:last&&last[0]==5&&lf?8:has('fwd')?2:1,10:has('noVip')||lf?3:1};   // sviluppo: reagisce all'ultimo esito
 let c=Object.keys(W).map(Number).filter(k=>!used.has(k)&&W[k]>0);
 if(!c.length)c=[0,1,2,3,4,5,6,7,8,9,10].filter(k=>!used.has(k));
 if(!c.length)return 0;
 let t=0;for(const k of c)t+=W[k];let x=R()*t;
 for(const k of c){x-=W[k];if(x<0)return k}
 return c[c.length-1]}
function campPlan(n){const C=CAMP,F=C.fl,lost=campLost(C.res),R=rng((C.sd^Math.imul(n+1,0x9E3779B1))>>>0),m=campPick(n,C.len,F,C.res,R);
 let d=C.d0+(n>=C.len-2?1:0)+(F.indexOf('hard')>=0?1:0)-(F.indexOf('sab')>=0?1:0);
 if(lost>=2)d=Math.min(d,C.d0);                                               // "ultima occasione": la difficoltà non sale
 const v=R(),w=v<.5?0:v<.7?1:v<.85?2:3,p=R()<.5?0:1+(R()*PROFILES.length|0);
 return{m,d:clamp(d,1,10),p,w,s:(R()*1e5)|0}}

// ===== stato: nuova campagna, esito di un capitolo, applicazione dei parametri =====
function campNew(d0){const C=CAMP;C.on=1;C.done=0;C.ov=0;C.sd=(Math.random()*1e9)|0;C.d0=clamp(d0|0||1,1,10);C.res=[];C.fl=[];C.len=7+(rng(C.sd)()<.5?0:1);C.pl=campPlan(0);campSave()}
function campFinish(v){const C=CAMP;if(!C.on||C.done||G.mode==1)return;   // solo l'host (o il singolo) arriva qui: finish() è autorevole
 const m=G.mt||C.pl.m,win=v==2?1:0,fin=C.res.length>=C.len-1,e=CM[m]||CM[0];
 C.res.push([m,win]);for(const f of win?e.sw:e.sl)if(C.fl.indexOf(f)<0)C.fl.push(f);
 if(fin)C.done=win?1:2;else if(campLost(C.res)>CAMP_MAXLOST)C.done=2;        // finale perso o 4ª sconfitta: campagna persa
 if(!C.done)C.pl=campPlan(C.res.length);                                      // da qui pl è il piano del PROSSIMO capitolo
 campSave()}
function campApply(){const p=CAMP.pl;G.sel=p.m||-1;G.diff=p.d;G.profile=p.p;G.weatherMode=p.w;return p.s}   // imposta i parametri del capitolo e restituisce il seed della mappa (missione 0 = sterminio = G.sel -1; G.sel 0 significherebbe "casuale")
function campNext(){if(CAMP.done)campNew(CAMP.d0);return campApply()}         // chiamata da restartGame (solo host/singolo)
function campBoot(){const sv=$('lobCampSel').value=='1'?campLoad():null;if(sv){campUnpack(sv);CAMP.ov=0}else campNew(G.diff);return campApply()}
function firstSeed(){if(!CAMP.want){CAMP.on=0;return newSeed()}return campBoot()}   // seed della prima partita dalla lobby (campagna o missione normale)

// ===== rete e salvataggio: lo stato è piccolo (pochi numeri e stringhe) =====
const campPack=()=>CAMP.on?{sd:CAMP.sd,d0:CAMP.d0,len:CAMP.len,res:CAMP.res,fl:CAMP.fl,pl:CAMP.pl,dn:CAMP.done,ov:G.over?1:0}:0;
function campUnpack(o){const C=CAMP;if(!o||!o.pl){C.on=0;return}
 Object.assign(C,{on:1,sd:o.sd|0,d0:(o.d0|0)||1,len:(o.len|0)||7,res:o.res||[],fl:o.fl||[],pl:o.pl,done:o.dn|0,ov:o.ov|0})}
function campSave(){try{if(!CAMP.on||CAMP.done)localStorage.removeItem(CAMP_KEY);else localStorage.setItem(CAMP_KEY,JSON.stringify(Object.assign({v:CAMP_VER},campPack())))}catch(_){}}
function campLoad(){try{const o=JSON.parse(localStorage.getItem(CAMP_KEY)||'null');
 if(o&&o.v===CAMP_VER&&Array.isArray(o.res)&&Array.isArray(o.fl)&&o.pl&&o.len>2&&!o.dn&&o.res.length<o.len)return o}catch(_){}return null}

// ===== sblocco upgrade (solo campagna): missione vinta → upgrade sbloccato =====
// PER AGGIUNGERNE UNO basta una riga: id missione → [id upgrade di AGconf.js]. Gli upgrade non in tabella sono sempre disponibili.
const CAMP_UNLOCK={0:['pierce'],1:['grlm'],2:['shield'],3:['grenade'],4:['plasma'],5:['turret'],7:['nuke'],8:['revive'],9:['gdr'],10:['radar']};
// bonus raro "Slow motion": vincendo un recupero VIP (missioni 2 e 10) dalla metà campagna in poi c'è il 25% di ottenerlo, in più all'upgrade della missione.
// Deterministico da seed e risultati (stessa logica del regista): niente da salvare né da inviare in rete.
const CAMP_VIPM=[2,10],CAMP_SLOW_P=.25;
const campSlowWin=i=>{const C=CAMP,r=C.res[i];return !!(r&&r[1]&&CAMP_VIPM.indexOf(r[0])>=0&&i>=(C.len>>1)&&rng((C.sd^Math.imul(i+1,0x2545F491))>>>0)()<CAMP_SLOW_P)};   // i = capitolo (0 = primo)
function campUpMis(id){for(const m in CAMP_UNLOCK)if(CAMP_UNLOCK[m].indexOf(id)>=0)return +m;return -1}   // missione che sblocca l'upgrade (-1 = sempre disponibile)
const upLocked=id=>{if(!CAMP.on)return false;if(id==='slowmo')return !CAMP.res.some((r,i)=>campSlowWin(i));const m=campUpMis(id);return m>=0&&!CAMP.res.some(r=>r[0]===m&&r[1])}   // bloccato = in campagna e missione non ancora vinta (slowmo: solo col bonus raro)
const campLockTxt=id=>id==='slowmo'?'   Bonus raro ('+Math.round(CAMP_SLOW_P*100)+'%): vincendo '+MIS_NAMES[2]+' o '+MIS_NAMES[10]+' dopo metà campagna':'   Si sblocca vincendo: '+(MIS_NAMES[campUpMis(id)]||'?')+' (campagna)';
const campUpNames=m=>(CAMP_UNLOCK[m]||[]).map(id=>{const u=UPGRADES.find(x=>x.id===id);return u?u.n:id}).join(', ');
const campUnlockLine=m=>CAMP_UNLOCK[m]?'<div style="color:#ffd23f;margin:4px 0">🔓 Upgrade sbloccato: <b>'+campUpNames(m)+'</b></div>':'';
const campRewardLine=m=>CAMP_UNLOCK[m]?'<div style="color:#9bd3a1;margin:4px 0">🎁 Ricompensa: <b>'+campUpNames(m)+'</b></div>':'';
const campSlowLine=i=>campSlowWin(i)?'<div style="color:#b27dff;margin:4px 0">✨ Bonus raro: <b>Slow motion</b> (tecnologia sperimentale portata in salvo con il VIP)</div>':'';
// toglie dalle caselle gli upgrade ancora bloccati (nuova campagna: si riparte da zero)
function campClampLoadout(){if(!CAMP.on)return;for(let i=0;i<loadout.length;i++){const s=loadout[i];if(s&&s[0]=='u'&&upLocked(s.slice(2)))loadout[i]=null}}

// ===== lobby: la modalità "Campagna" mostra Nuova/Continua e nasconde missione, mappa e meteo (li decide la campagna) =====
function campLobby(){const m=$('lobMode').value,c=m=='2';
 $('lobMisRow').style.display=m=='0'?'flex':'none';
 $('lobCampRow').style.display=c?'flex':'none';
 for(const id of ['lobProfile','lobWeather'])$(id).parentNode.style.display=c?'none':'flex';
 if(c){const sv=campLoad(),o=$('lobCampSel').options[1];o.disabled=!sv;
  o.textContent=sv?'Continua (cap. '+(sv.res.length+1)+'/'+sv.len+' · sconfitte '+campLost(sv.res)+'/'+CAMP_MAXLOST+')':'Continua (nessun salvataggio)';
  if(!sv)$('lobCampSel').value='0'}}

// ===== presentazione: briefing e debriefing sono HTML locale, non bloccano la partita (pointer-events:none) =====
const campTag=()=>'CAP. '+(CAMP.res.length+1)+'/'+CAMP.len+' · PERSE '+campLost(CAMP.res)+'/'+CAMP_MAXLOST+' · ';
function campStrip(cur){let s='';for(let i=0;i<CAMP.len;i++){const r=CAMP.res[i];
 s+=(r?'<b style="color:'+(r[1]?'#7dff8a':'#ff6a5a')+'">'+(r[1]?'✔':'✖')+'</b>':i===cur?'<b style="color:#ffd23f">▶</b>':'<span style="opacity:.5">'+(i==CAMP.len-1?'★':'·')+'</span>')+' '}
 return s}
function campLastText(){const C=CAMP,r=C.res[C.res.length-1];if(!r)return'';const e=CM[r[0]]||CM[0],fin=C.res.length>=C.len;
 let fw=fin&&e.fw;if(fw)for(const v of e.fwv||[])if(C.fl.indexOf(v[0])>=0){fw=v[1];break}   // epilogo di vittoria: vale la prima variante (fwv) i cui flag esistono
 return campT(r[1]?fw||e.w:(fin&&e.fl)||e.l)}
function campBrief(){const C=CAMP,p=C.pl,n=C.res.length,m=G.mt||p.m,e=CM[m]||CM[0],nm=campNm(),lost=campLost(C.res),fin=n>=C.len-1;
 let b=e.b,bv=e.bv;if(fin&&e.bf){b=e.bf;bv=e.bfv}   // capitolo finale: se la missione ha un briefing da finale (bf) usa quello e le sue varianti (bfv)
 for(const v of bv||[])if(C.fl.indexOf(v[0])>=0){b=v[1];break}
 const wx=WX.rain?'pioggia':WX.snow?'neve':WX.sand?'tempesta di sabbia':'sereno';
 return'<div class="k">OPERAZIONE '+nm.op.toUpperCase()+' · CAPITOLO '+(n+1)+' DI '+C.len+(fin?' · FINALE':'')+'</div>'
  +'<div class="t">'+MIS_NAMES[m]+'</div>'
  +'<div class="r">'+campT(n?campLastText():CN_INTRO[nm.i])+'</div>'
  +'<div>'+campT(b)+'</div>'+(fin?'':campRewardLine(m))+'<div class="s">'+campStrip(n)+'</div>'
  +'<div class="f">Difficoltà '+p.d+' · Meteo: '+wx+' · Sconfitte '+lost+'/'+CAMP_MAXLOST+(fin?' · l’ultimo capitolo va vinto':'')+'</div>'
  +'<div class="f" style="color:#ffd23f;font-weight:bold">'+(MOBILE?'Tocca per chiudere':'R chiudi il briefing')+'</div>'}
function campDebrief(){const C=CAMP,n=C.res.length,r=C.res[n-1];if(!r)return'';
 const win=r[1],lost=campLost(C.res),nm=campNm(),fin=n>=C.len;
 let h='<div class="k">OPERAZIONE '+nm.op.toUpperCase()+' · CAPITOLO '+n+' DI '+C.len+'</div>'
  +'<div class="t" style="color:'+(win?'#7dff8a':'#ff6a5a')+'">'+(win?'VITTORIA':'SCONFITTA')+' · '+MIS_NAMES[r[0]]+'</div>'
  +'<div>'+campLastText()+'</div>'+(win&&!C.done?campUnlockLine(r[0])+campSlowLine(n-1):'')+'<div class="s">'+campStrip(C.done?-1:n)+'</div>';
 if(C.done==1)h+='<div><b style="color:#7dff8a">CAMPAGNA COMPLETATA</b> · '+C.len+' capitoli, '+lost+' sconfitte</div>';
 else if(C.done==2)h+='<div><b style="color:#ff6a5a">CAMPAGNA PERDUTA</b> · '+(fin?'il capitolo finale andava vinto.':'quarta sconfitta: la resistenza non regge più.')+'</div>';
 else h+='<div>Prossimo capitolo: <b>'+MIS_NAMES[C.pl.m]+'</b>'+(n>=C.len-1?' · <b style="color:#ffd23f">CAPITOLO FINALE</b>':'')+'</div><div class="f">Sconfitte '+lost+'/'+CAMP_MAXLOST+(lost>=CAMP_MAXLOST?' · la prossima sconfitta chiude la campagna':'')+'</div>';
 return h+'<div class="f">'+(NET.on&&!NET.host?'In attesa dell’host…':(MOBILE?'Tocca lo schermo per ':'Premi R per ')+(C.done?'iniziare una nuova campagna':'continuare'))+'</div>'}
function campBox(){let b=document.getElementById('campBox');if(b)return b;
 const st=document.createElement('style');
 st.textContent='#campBox{position:fixed;left:50%;top:15%;transform:translateX(-50%);width:min(92vw,560px);max-height:70%;overflow:hidden;box-sizing:border-box;padding:14px 18px;background:rgba(8,14,8,.86);border:2px solid #3fae4a;border-radius:10px;color:#eee;font:14px/1.45 system-ui,sans-serif;z-index:6;pointer-events:none;display:none;opacity:0;transition:opacity .5s}'
  +'#campBox .k{color:#ffd23f;font-weight:bold;font-size:12px;letter-spacing:.06em}#campBox .t{font-size:20px;font-weight:bold;margin:4px 0 6px}#campBox .r{color:#9bd3a1;font-style:italic;margin:0 0 6px}#campBox .s{letter-spacing:.2em;margin:8px 0;font-size:15px}#campBox .f{font-size:12px;color:#c4d3c4;margin-top:6px}'
  +'@media (pointer:coarse){#campBox{top:12%;font:12px/1.4 system-ui,sans-serif;padding:8px 12px}#campBox .t{font-size:16px}}';
 document.head.appendChild(st);b=document.createElement('div');b.id='campBox';document.body.appendChild(b);return b}
function campShow(h,ms){const b=campBox();clearTimeout(CAMP.tm);b.innerHTML=h;b.dataset.h='0';b.style.display='block';void b.offsetWidth;b.style.opacity=1;if(ms)CAMP.tm=setTimeout(campHide,ms)}
function campHide(){const b=document.getElementById('campBox');CAMP.sh='';if(!b||b.style.display!=='block'||b.dataset.h==='1')return;
 clearTimeout(CAMP.tm);b.dataset.h='1';b.style.opacity=0;CAMP.tm=setTimeout(()=>{b.style.display='none'},500)}
// true se il briefing di campagna è attualmente mostrato (serve al tasto R in AGgame.js)
const campIsBriefing=()=>CAMP.on&&CAMP.sh==='b';
// a ogni nuova mappa (anche per chi entra in corsa): se la campagna è attiva il briefing compare quando la mappa è pronta; chi entra durante un debriefing non vede un briefing sbagliato
function campOnStart(){const C=CAMP;campHide();C.br=0;if(!C.on)return;if(C.ov){C.ov=0;return}C.br=1}
setInterval(()=>{const C=CAMP;
 if(!C.on||!G.started){campHide();return}
 if(G.over){const k='d'+C.res.length;if(C.sh!==k){C.sh=k;campShow(campDebrief())}return}
 if(C.br&&!G.baking){C.br=0;C.sh='b';campShow(campBrief(),46000)}},400);

