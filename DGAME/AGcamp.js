'use strict';
/* AIRGRUNT · AGcamp.js — CAMPAGNA (storia): nomi e testi dal seed di campagna, grafo narrativo delle missioni, regista,
   stato e salvataggio, sblocco degli upgrade, lobby, briefing e debriefing.
   Prima stava in fondo ad AGsim.js: si carica subito dopo (AGcore.html) e il resto del gioco lo usa solo dentro funzioni (campFinish, campPack, campBoot...). */

const CAMP_KEY='airgrunt_campaign',CAMP_VER=1,CAMP_MAXLOST=3;
// pl = piano del capitolo in corso (durante la partita) o del prossimo (dopo la fine di un capitolo): {m missione, d difficoltà, p profilo mappa, w meteo, s seed}
const CAMP={on:0,want:0,sd:0,d0:1,len:7,res:[],fl:[],pl:null,done:0,ov:0,br:0,sh:'',tm:0,ac:null,al:null};   // ac / al = colori dell'AI nemica e alleata, fissi per tutta la campagna (null = da scegliere)   // done: 0 in corso · 1 campagna vinta · 2 campagna persa

// ===== nomi (dal seed di campagna) e frammenti di testo =====
const CN_OP1=['Falco','Melo','Lupo','Gufo','Squalo','Titano','Cinghiale','Drago'],CN_OP2=['Grigio','Nero','Rosso','Silente','Spettrale','Cremisi','d’Acciaio','di Cenere'];
const CN_CMD=['il colonnello Voss','il generale Patrick','il maggiore Drax','il colonnello Spawn','il generale Helios','il maggiore Dlegion'];
const CN_VIP=['l’ingegner Dolf','la dottoressa Veruska','il dottor Sirus','la professoressa Alina','lo scienziato Catellani','la scienziata Aniah'];
const CN_INTRO=['{Cmd} ha occupato la regione e la resistenza locale è all’ultima spiaggia. L’operazione {op} è l’ultima possibilità di riprendere la regione.','{Cmd} controlla ormai quasi tutta la regione. L’operazione {op} deve ribaltare le sorti della guerra o perderemo la regione.'];
let _nm=null;
function campNm(){if(!_nm||_nm.sd!==CAMP.sd){const R=rng((CAMP.sd^0x51ED)>>>0),pk=a=>a[R()*a.length|0];_nm={sd:CAMP.sd,op:pk(CN_OP1)+' '+pk(CN_OP2),cmd:pk(CN_CMD),vip:pk(CN_VIP),i:R()<.5?0:1}}return _nm}
function campT(s){const n=campNm(),U=x=>x.charAt(0).toUpperCase()+x.slice(1);
 return s.replace(/\{op\}/g,n.op).replace(/\{Cmd\}/g,U(n.cmd)).replace(/\{cmd\}/g,n.cmd).replace(/\{Vip\}/g,U(n.vip)).replace(/\{vip\}/g,n.vip)}

// ===== grafo narrativo: campo camp di ogni missione (blocchi delle missioni in AGmis.js) =====
// b = briefing · bv = varianti del briefing [flag, testo] (vale la prima i cui flag esistono) · bf / bfv = briefing e varianti se è il capitolo FINALE (facoltativi) · w / l = conseguenza di vittoria / sconfitta
// sw / sl = flag impostati da vittoria / sconfitta · fw / fl = testi se è il capitolo FINALE (epilogo) · fwv = varianti dell'epilogo di vittoria [flag, testo] (vale la prima i cui flag esistono)
// Flag: sup/noSup scorte · vip/noVip tecnico · sab/hard difese nemiche · cmd/cmdLive comandante · fwd/noFwd base avanzata · ally/noAlly alleati · held/baseLost base · pilots/pilotsLost superstiti · ship/noShip nave spaziale · navy/fleet flotta nemica (affondata / ancora in mare)
const campE=m=>(MIS[m]&&MIS[m].camp)||MIS[0].camp;   // testi di campagna della missione m

// ===== regista =====
const campLost=r=>r.filter(x=>!x[1]).length;
function campPick(n,len,F,res,R){   // sceglie la missione del capitolo n (0 = primo, len-1 = finale); mai una missione già giocata
 const used=new Set(res.map(r=>r[0])),last=res.length?res[res.length-1]:null,lf=!!(last&&!last[1]),lost=campLost(res),has=f=>F.indexOf(f)>=0;
 // pesi delle missioni: campo dir di ogni missione · open = apertura (missioni "leggere") · fin = finale (dipende da ciò che è successo) · dev = sviluppo (reagisce all'ultimo esito)
 const ph=n<2?'open':n>=len-1?'fin':'dev',h={has,lf,last,lost},W={};
 for(const D of MIS){if(!D||!D.dir||D.dir[ph]==null)continue;const v=D.dir[ph];W[D.id]=typeof v=='function'?v(h):v}
 let c=Object.keys(W).map(Number).filter(k=>!used.has(k)&&W[k]>0);
 if(!c.length)c=Array.from({length:MIS_N+1},(_,i)=>i).filter(k=>!used.has(k));
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
function campNew(d0){const C=CAMP;C.on=1;C.done=0;C.ov=0;C.sd=(Math.random()*1e9)|0;C.d0=clamp(d0|0||1,1,10);C.res=[];C.fl=[];C.ac=null;C.al=null;C.len=7+(rng(C.sd)()<.5?0:1);C.pl=campPlan(0);campSave()}   // colori delle AI: li sceglie aiColors() all'avvio del primo capitolo
function campFinish(v){const C=CAMP;if(!C.on||C.done||G.mode==1)return;   // solo l'host (o il singolo) arriva qui: finish() è autorevole
 const m=G.mt||C.pl.m,win=v==2?1:0,fin=C.res.length>=C.len-1,e=campE(m);
 C.res.push([m,win]);for(const f of win?e.sw:e.sl)if(C.fl.indexOf(f)<0)C.fl.push(f);
 if(fin)C.done=win?1:2;else if(campLost(C.res)>CAMP_MAXLOST)C.done=2;        // finale perso o 4ª sconfitta: campagna persa
 if(!C.done)C.pl=campPlan(C.res.length);                                      // da qui pl è il piano del PROSSIMO capitolo
 campSave()}
function campApply(){const p=CAMP.pl;G.sel=p.m||-1;G.diff=p.d;G.profile=p.p;G.weatherMode=p.w;return p.s}   // imposta i parametri del capitolo e restituisce il seed della mappa (missione 0 = sterminio = G.sel -1; G.sel 0 significherebbe "casuale")
function campNext(){if(CAMP.done)campNew(CAMP.d0);return campApply()}         // chiamata da restartGame (solo host/singolo)
function campBoot(){const sv=$('lobCampSel').value=='1'?campLoad():null;if(sv){campUnpack(sv);CAMP.ov=0}else campNew(G.diff);return campApply()}
function firstSeed(){if(!CAMP.want){CAMP.on=0;return newSeed()}return campBoot()}   // seed della prima partita dalla lobby (campagna o missione normale)

// ===== rete e salvataggio: lo stato è piccolo (pochi numeri e stringhe) =====
const campPack=()=>CAMP.on?{sd:CAMP.sd,d0:CAMP.d0,len:CAMP.len,res:CAMP.res,fl:CAMP.fl,pl:CAMP.pl,dn:CAMP.done,ov:G.over?1:0,ac:CAMP.ac,al:CAMP.al}:0;
function campUnpack(o){const C=CAMP;if(!o||!o.pl){C.on=0;return}
 Object.assign(C,{on:1,sd:o.sd|0,d0:(o.d0|0)||1,len:(o.len|0)||7,res:o.res||[],fl:o.fl||[],pl:o.pl,done:o.dn|0,ov:o.ov|0,ac:o.ac!=null?o.ac|0:null,al:o.al!=null?o.al|0:null})}
function campSave(){try{if(!CAMP.on||CAMP.done)localStorage.removeItem(CAMP_KEY);else localStorage.setItem(CAMP_KEY,JSON.stringify(Object.assign({v:CAMP_VER},campPack())))}catch(_){}}
function campLoad(){try{const o=JSON.parse(localStorage.getItem(CAMP_KEY)||'null');
 if(o&&o.v===CAMP_VER&&Array.isArray(o.res)&&Array.isArray(o.fl)&&o.pl&&o.len>2&&!o.dn&&o.res.length<o.len)return o}catch(_){}return null}

// ===== sblocco upgrade (solo campagna): missione vinta → upgrade sbloccato =====
// campo unlock di ogni missione: [id upgrade di AGconf.js, o 'w<n>' per un'arma]. Gli upgrade che nessuna missione sblocca sono sempre disponibili.
const campUnl=m=>(MIS[m]&&MIS[m].unlock)||null;
// bonus raro "Slow motion": vincendo una missione con vipBonus (recupero VIP: Estrazione VIP, Ricerca e recupero) dalla metà campagna in poi c'è il 25% di ottenerlo, in più all'upgrade della missione.
// Deterministico da seed e risultati (stessa logica del regista): niente da salvare né da inviare in rete.
const CAMP_SLOW_P=.25;
const campSlowWin=i=>{const C=CAMP,r=C.res[i];return !!(r&&r[1]&&MIS[r[0]]&&MIS[r[0]].vipBonus&&i>=(C.len>>1)&&rng((C.sd^Math.imul(i+1,0x2545F491))>>>0)()<CAMP_SLOW_P)};   // i = capitolo (0 = primo)
function campUpMis(id){for(const D of MIS)if(D&&D.unlock&&D.unlock.indexOf(id)>=0)return D.id;return -1}   // missione che sblocca l'upgrade (-1 = sempre disponibile)
const upLocked=id=>{if(!CAMP.on)return false;if(id==='slowmo')return !CAMP.res.some((r,i)=>campSlowWin(i));const m=campUpMis(id);return m>=0&&!CAMP.res.some(r=>r[0]===m&&r[1])}   // bloccato = in campagna e missione non ancora vinta (slowmo: solo col bonus raro)
const campLockTxt=id=>id==='slowmo'?'   Bonus raro ('+Math.round(CAMP_SLOW_P*100)+'%): vincendo '+MIS.filter(D=>D&&D.vipBonus).map(D=>D.name).join(' o ')+' dopo metà campagna':'   Si sblocca vincendo: '+(MIS_NAMES[campUpMis(id)]||'?')+' (campagna)';
const campUpNames=m=>(campUnl(m)||[]).map(id=>{const W=/^w\d+$/.test(id)?WEAPONS[+id.slice(1)]:null;if(W)return W.n.trim();const u=UPGRADES.find(x=>x.id===id);return u?u.n:id}).join(', ');
const campUnlockLine=m=>campUnl(m)?'<div style="color:#ffd23f;margin:4px 0">🔓 Upgrade sbloccato: <b>'+campUpNames(m)+'</b></div>':'';
const campRewardLine=m=>campUnl(m)?'<div style="color:#9bd3a1;margin:4px 0">🎁 Ricompensa: <b>'+campUpNames(m)+'</b></div>':'';
const campSlowLine=i=>campSlowWin(i)?'<div style="color:#b27dff;margin:4px 0">✨ Bonus raro: <b>Slow motion</b> (tecnologia sperimentale portata in salvo con il VIP)</div>':'';
// toglie dalle caselle gli upgrade ancora bloccati (nuova campagna: si riparte da zero)
// casella (arma 'w<n>' o upgrade 'u:<id>') → chiave del campo unlock delle missioni, e se è bloccata in campagna
const lockKey=id=>id[0]=='u'?id.slice(2):id;
const itemLocked=id=>!!id&&upLocked(lockKey(id));
function campClampLoadout(){if(!CAMP.on)return;for(let i=0;i<loadout.length;i++){const s=loadout[i];if(s&&itemLocked(s))loadout[i]=null}}

// ===== lobby: la modalità "Campagna" mostra Nuova/Continua e nasconde missione, mappa e meteo (li decide la campagna) =====
function campLobby(){const m=$('lobMode').value,c=m=='2',d=m=='3';
 $('lobMisRow').style.display=m=='0'?'flex':'none';
 $('lobCampRow').style.display=c?'flex':'none';
 if($('lobDuelRow'))$('lobDuelRow').style.display=d?'flex':'none';
 for(const id of ['lobProfile','lobWeather'])$(id).parentNode.style.display=c?'none':'flex';
 if(c){const sv=campLoad(),o=$('lobCampSel').options[1];o.disabled=!sv;
  o.textContent=sv?'Continua (cap. '+(sv.res.length+1)+'/'+sv.len+' · sconfitte '+campLost(sv.res)+'/'+CAMP_MAXLOST+')':'Continua (nessun salvataggio)';
  if(!sv)$('lobCampSel').value='0'}}

// ===== presentazione: briefing e debriefing sono HTML locale, non bloccano la partita (pointer-events:none) =====
const campTag=()=>'CAP. '+(CAMP.res.length+1)+'/'+CAMP.len+' · PERSE '+campLost(CAMP.res)+'/'+CAMP_MAXLOST+' · ';
function campStrip(cur){let s='';for(let i=0;i<CAMP.len;i++){const r=CAMP.res[i];
 s+=(r?'<b style="color:'+(r[1]?'#7dff8a':'#ff6a5a')+'">'+(r[1]?'✔':'✖')+'</b>':i===cur?'<b style="color:#ffd23f">▶</b>':'<span style="opacity:.5">'+(i==CAMP.len-1?'★':'·')+'</span>')+' '}
 return s}
function campLastText(){const C=CAMP,r=C.res[C.res.length-1];if(!r)return'';const e=campE(r[0]),fin=C.res.length>=C.len;
 let fw=fin&&e.fw;if(fw)for(const v of e.fwv||[])if(C.fl.indexOf(v[0])>=0){fw=v[1];break}   // epilogo di vittoria: vale la prima variante (fwv) i cui flag esistono
 return campT(r[1]?fw||e.w:(fin&&e.fl)||e.l)}
function campBrief(){const C=CAMP,p=C.pl,n=C.res.length,m=G.mt||p.m,e=campE(m),nm=campNm(),lost=campLost(C.res),fin=n>=C.len-1;
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
