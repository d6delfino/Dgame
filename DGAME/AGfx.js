'use strict';
/* AIRGRUNT · AGfx.js — effetti visivi (particelle con attrito) e suoni.
   Tutto è LOCALE: in rete non passa mai grafica, ogni client genera i propri effetti dagli eventi. */
// ===== particelle =====
const FXS=30,FX_STEP=1/15;const fxP=[];
const fxCap=big=>(G.q>=2?150:G.q==1?90:50)*(big?2:1);   // tetto in base alla qualità
const fxVis=v=>G.fog<.02||v==null||v>.3;               // niente effetti su ciò che la nebbia nasconde
function fxSpawn(x,y,color,n,big,s){s=s||FXS;const cap=fxCap(big);
 for(let i=0;i<n&&fxP.length<cap;i++){const a=Math.random()*TAU,sp=Math.random()*s*(big?.4:.2);
  fxP.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,decay:Math.random()*.04+.03,color,size:s*(Math.random()*.25+.15)})}}
// fumo di crollo: blob grigi persistenti (vita 4–10 s), che salgono piano e si espandono — stile "fiamma" ma grigio
function collapseSmoke(x,y,s,big){s=s||FXS;const cap=fxCap(true);
 const cols=['#7a7570','#8a8580','#666361','#9a9590','#5a5754','#adaba6'];
 const n=big?12:8;
 for(let i=0;i<n&&fxP.length<cap;i++){
  const a=Math.random()*TAU,sp=Math.random()*s*(big?.14:.09);
  fxP.push({x:x+(Math.random()-.5)*s*.35,y:y+(Math.random()-.5)*s*.35,
   vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-s*.05,      // leggero bias verso l'alto alla nascita
   life:1,decay:.008+Math.random()*.010,           // vita ≈ 4–10 s (era 1–2 s)
   color:cols[Math.random()*cols.length|0],
   size:s*(.28+Math.random()*.32),                 // 8–18 px iniziali, come le fiamme
   rise:.4+Math.random()*.9,                       // 6–19 px/s verso l'alto (costante, indipendente dall'attrito)
   grow:.10+Math.random()*.30                      // +1.5–6 px/s di diametro (crescita "nuvola")
  })}}
function fxBoom(x,y,kind,s){
 if(kind=='tree'){fxSpawn(x,y,'#4f8f3f',10,true,s);return}
 fxSpawn(x,y,'#ff8800',15,true,s);fxSpawn(x,y,'#ff3333',10,true,s);
 if(kind=='struct')collapseSmoke(x,y,s||FXS,true)}
function fxStep(dt){const k=dt/FX_STEP,f=Math.pow(.85,k);
 for(let i=fxP.length-1;i>=0;i--){const p=fxP[i];p.x+=p.vx*k;p.y+=p.vy*k;if(p.rise)p.y-=p.rise*k;if(p.grow)p.size+=p.grow*k;p.vx*=f;p.vy*=f;p.life-=p.decay*k;if(p.life<=0){fxP[i]=fxP[fxP.length-1];fxP.pop()}}}
function fxDraw(ctx){ctx.lineCap='round';let last='';
 for(const p of fxP){if(p.color!==last){ctx.strokeStyle=last=p.color}ctx.globalAlpha=p.life;ctx.lineWidth=p.size;ctx.beginPath();ctx.moveTo(p.x-p.vx,p.y-p.vy);ctx.lineTo(p.x,p.y);ctx.stroke()}
 ctx.globalAlpha=1}
const FL_COLS=['#fff3a0','#ffb02e','#ff6a1a','#e63a12'],FL_MUZZLE=76;
function flameFx(x,y,a,w){const sp=(w.range-FL_MUZZLE)/5.7,cap=fxCap(true);
 for(let i=0;i<5&&fxP.length<cap;i++){const d=a+(Math.random()-.5)*w.arc*2,v=sp*(.55+Math.random()*.45);
  fxP.push({x:x+Math.cos(a)*FL_MUZZLE,y:y+Math.sin(a)*FL_MUZZLE,vx:Math.cos(d)*v,vy:Math.sin(d)*v,life:1,decay:.03+Math.random()*.03,color:FL_COLS[Math.random()*4|0],size:5+Math.random()*8})}}
function smokeFx(x,y,vx,vy){if(fxP.length<fxCap(false)&&Math.random()<.6)fxP.push({x,y,vx:-vx*.08+(Math.random()-.5)*4,vy:-vy*.08+(Math.random()-.5)*4,life:1,decay:.04+Math.random()*.02,color:'#b8b8b8',size:4+Math.random()*3})}
// spray delle cascate: pallini bianchi continui (stile impatto), con delay casuale per cascata
function fallSpray(dt){
  if(!M||!M.falls||!M.falls.length)return;
  const cap=fxCap(false);
  for(const f of M.falls){
    // solo cascate vicine alla camera (evita spreco fuori schermo)
    if(f.x<camX-200||f.x>camX+W/zoom+200||f.y<camY-200||f.y>camY+H/zoom+200)continue;
    f._st=(f._st==null?Math.random()*.12:f._st)-dt;   // timer per cascata
    if(f._st>0)continue;
    f._st=.04+Math.random()*.14;                      // delay casuale 40–180 ms
    if(fxP.length>=cap)continue;
    // punto di impatto in fondo al salto (lungo la direzione della cascata)
    const ca=Math.cos(f.a),sa=Math.sin(f.a), half=f.w/2+4;
    const bx=f.x+ca*22, by=f.y+sa*22;                 // base del salto
    const n=1+(Math.random()*2|0);                    // 1–2 pallini per tick
    for(let i=0;i<n&&fxP.length<cap;i++){
      const side=(Math.random()-.5)*half*1.6;
      const x=bx-sa*side+(Math.random()-.5)*6;
      const y=by+ca*side+(Math.random()-.5)*6;
      const a=f.a+(Math.random()-.5)*1.4;             // ventaglio intorno alla direzione
      const sp=8+Math.random()*22;
      fxP.push({
        x,y,
        vx:Math.cos(a)*sp,
        vy:Math.sin(a)*sp,
        life:1,
        decay:.05+Math.random()*.05,
        color:Math.random()<.55?'#ffffff':'#d8eef8',  // bianco / azzurro chiaro
        size:2+Math.random()*7                        // dimensioni varie (stile impatto)
      });
    }
  }
}
const IMPACT_COLS=['#ffe14d','#999999','#ff8800'];
const fxImpact=(x,y,n,big,s)=>{s=s||FXS;const cap=fxCap(big);
 for(let i=0;i<n&&fxP.length<cap;i++){const a=Math.random()*TAU,sp=Math.random()*s*(big?.4:.2),color=IMPACT_COLS[Math.random()*IMPACT_COLS.length|0];
  fxP.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,decay:Math.random()*.04+.03,color,size:s*(Math.random()*.25+.15)})}};
const impact=(x,y,big,s)=>{fxImpact(x,y,8,big,s);sfxAt(SFX_LIST.hit,1,x,y,60)};
function wreckFx(o){if(o.ind)return;const b=o.t=='b';
 // edificio distrutto: cratere bruciato permanente, stesso raggio di quello lasciato dal lanciarazzi.
 // Eccezione: se l'edificio si trova sull'acqua (navi, piattaforme, portaerei, incrociatori) niente cratere.
 if(b&&!inWater(o.x,o.y,0))craterAdd(o.x,o.y,WEAPONS[W_RKT].ex);
 fxBoom(o.x,o.y,b?'struct':'tree',b?Math.min(60,Math.max(FXS,o.r*.8)):FXS*.8);if(b)sfxAt(SFX_LIST.crash,.8,o.x,o.y,80)}
function blastFx(u){
 if(u.k>=UK_HUM){fxSpawn(u.x,u.y,'#c01818',10,true,45);sfxAt(SFX_LIST.boom,.7,u.x,u.y,60);return}   // omini: sangue + esplosione (come i nemici AI)
 fxBoom(u.x,u.y,'unit',u.k==0?42:FXS);sfxAt(SFX_LIST.boom,.8,u.x,u.y,80)}

// ===== audio: piccolo pool di elementi per sovrapporre più volte lo stesso suono =====
const SFX={},ear={x:0,y:0},SFX_R=1500,sfxT={};// Volumi separati (0..1): uno per la musica, uno per tutti gli effetti.
let MUSIC_VOL=1, SFX_VOL=1;
// Audio ambientali (pioggia, vento): due player per suono alternati con crossfade di 0,1 s.
// Non usano Audio.loop (i browser producono un piccolo gap a ogni iterazione): il player successivo
// parte in anticipo mentre il precedente sta ancora suonando, con volumi incrociati.
const AMB_XF=0.10;    // durata del crossfade (s)
const AMB_POLL=100;   // ms tra un controllo di fine traccia e l'altro
const AMB={
 rain:{src:'sfx/AGrain.mp3',players:null,idx:0,vol:.5, active:false,timer:null,fadeId:0},
 wind:{src:'sfx/AGwind.mp3',players:null,idx:0,vol:.45,active:false,timer:null,fadeId:0}
};
// Musica: applica subito ai due lettori in riproduzione
function setMusicVolume(v){MUSIC_VOL=clamp(+v||0,0,1);
 const bv=0.35*MUSIC_VOL;for(const p of bgmPlayers){if(p.muted)p.muted=false;p.volume=bv}}
// Effetti: passi del mech (gli altri effetti usano SFX_VOL dentro sfx())
function setSfxVolume(v){SFX_VOL=clamp(+v||0,0,1);
 if(typeof walkAu!=='undefined'&&walkAu)walkAu.volume=.35*SFX_VOL;
 for(const k in AMB){const A=AMB[k];if(!A.players)continue;const cur=A.players[A.idx];if(cur)cur.volume=A.vol*SFX_VOL}}
// Retro-compatibilità: imposta entrambi (utile se qualche vecchio codice chiama setMasterVolume)
function setMasterVolume(v){setMusicVolume(v);setSfxVolume(v)}
const SFX_MAX=3;   // massimo elementi audio per ogni suono, creati solo se servono
function sfxPool(src){let a=SFX[src];if(!a){a=SFX[src]={p:[],i:0};a.p.push(new Audio(src))}return a}
// Web Audio: ogni file è decodificato UNA volta in memoria e suonato con nodi leggeri (niente scatti, niente elementi <audio> in più).
// OGNI suono, anche quelli aggiunti in futuro, passa da sfx() e riceve una variazione casuale: tono/velocità, volume e timbro.
// La musica (playBgm) è separata e non viene toccata. Il pool qui sopra resta come ripiego (file:// o decodifica non riuscita).
let AC=null;const SB={},SLAST={},SV_MAX=24;let svAct=0;       // contesto audio, buffer decodificati, ultima velocità di ogni suono, voci attive e loro tetto
const SV_DEF={r:.16,g:.22,t:1};                                // variazione di base: tono/velocità ±16%, volume fino a −22%, timbro casuale
const SFX_VAR={[WEAPONS[W_MG].sfx]:{r:.04,g:.06,t:.25}};   // mitraglia: effetti dimezzati                                              // facoltativo, per un suono particolare: SFX_VAR['sfx/x.mp3']={r:.05,g:.1,t:0}
function audioCtx(){if(AC===null){try{const C=window.AudioContext||window.webkitAudioContext;AC=C?new C({latencyHint:'interactive'}):0}catch(_){AC=0}}return AC}
['pointerdown','keydown','touchstart'].forEach(t=>addEventListener(t,()=>{const c=audioCtx();if(c&&c.state=='suspended')c.resume();
 for(const k in AMB){const A=AMB[k];if(!A.players||!A.active)continue;
  if((k==='rain'&&!WX.rain)||(k==='wind'&&!WX.sand))continue;
  const cur=A.players[A.idx];if(cur&&cur.paused){const r=cur.play();if(r&&r.catch)r.catch(()=>{})}}
},{passive:true}));
function sfxLoad(src){if(SB[src]!==undefined)return SB[src];SB[src]=0;const c=audioCtx();if(!c){SB[src]=-1;return -1}
 fetch(src).then(r=>{if(!r.ok)throw 0;return r.arrayBuffer()}).then(b=>new Promise((ok,ko)=>c.decodeAudioData(b,ok,ko))).then(buf=>{SB[src]=buf}).catch(()=>{SB[src]=-1});return 0}
function sfxVar(src){const d=SFX_VAR[src]||SV_DEF,l=SLAST[src]||1,lo=1-d.r,hi=1+d.r,m=d.r*.35,a=Math.max(lo,l-m),w=Math.max(0,Math.min(hi,l+m)-a);   // zona da evitare: vicino all'ultima velocità usata
 let rate=lo+Math.random()*(hi-lo-w);if(rate>=a)rate+=w;   // mai quasi uguale alla volta prima
 SLAST[src]=rate;return{rate,gain:1-d.g*Math.random(),cut:d.t?22000-d.t*(17500-Math.random()*13500):0}}
function sfx(src,vol,pan){if(!src)return;const b=sfxLoad(src);   // 0 = ancora in caricamento, -1 = Web Audio non disponibile: in entrambi i casi si usa l'elemento <audio>
 const v=sfxVar(src),g0=clamp(vol==null?1:vol,0,1)*v.gain*SFX_VOL;
 if(b===0||b===-1){try{const a=sfxPool(src);let e=a.p.find(x=>x.paused);   // elemento libero
  if(!e){if(a.p.length<SFX_MAX){e=new Audio(src);a.p.push(e)}else e=a.p[a.i++%a.p.length]}
  e.volume=clamp(g0,0,1);e.currentTime=0;e.preservesPitch=false;e.playbackRate=v.rate;const r=e.play();if(r&&r.catch)r.catch(()=>{})}catch(_){}return}
 if(svAct>=SV_MAX)return;   // tetto di voci contemporanee: il gioco resta fluido anche con molti spari
 try{const c=AC;if(c.state=='suspended')c.resume();
  const s=c.createBufferSource(),g=c.createGain();s.buffer=b;s.playbackRate.value=v.rate;g.gain.value=g0;s.connect(g);let o=g;const n=[s,g];
  if(v.cut){const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=v.cut;o.connect(f);o=f;n.push(f)}
  if(c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=clamp(pan||0,-1,1);o.connect(p);o=p;n.push(p)}
  o.connect(c.destination);svAct++;s.onended=()=>{svAct--;for(const x of n)try{x.disconnect()}catch(_){}};s.start()}catch(_){}}
function sfxAt(src,vol,x,y,gap){const d=Math.hypot(x-ear.x,y-ear.y);if(d>SFX_R)return;const n=performance.now();if(sfxT[src]>n)return;sfxT[src]=n+(gap||0);sfx(src,vol*(1-d/SFX_R*.8),(x-ear.x)/SFX_R*1.6)}
let walkAu=null;
function walkSnd(on){if(!walkAu){if(!on)return;walkAu=new Audio(SFX_LIST.move);walkAu.loop=true;walkAu.volume=.35*SFX_VOL;walkAu.preservesPitch=false}
 try{if(on){if(walkAu.paused){walkAu.playbackRate=.85+Math.random()*.3;const r=walkAu.play();if(r&&r.catch)r.catch(()=>{})}}else if(!walkAu.paused)walkAu.pause()}catch(_){}}
const preloadSfx=()=>{[...new Set([...WEAPONS.map(w=>w.sfx),...Object.values(SFX_LIST)].filter(Boolean))].forEach((f,i)=>setTimeout(()=>sfxLoad(f),i*120))};

let bgmPlayers = [new Audio('sfx/AGmusic.mp3'), new Audio('sfx/AGmusic.mp3')];
let activeBgm = 0;
let bgmInterval = null;

function playBgm() {
  if (bgmInterval) return;
  
  const p1 = bgmPlayers[0];
  p1.volume = 0.35 * MUSIC_VOL;
  p1.currentTime = 0;
  p1.play().catch(() => {});

  bgmInterval = setInterval(() => {
    const current = bgmPlayers[activeBgm];
    const next = bgmPlayers[1 - activeBgm];

    if (current.duration && current.currentTime >= current.duration - 1.0) {
      if (next.paused) {
        next.volume = 0;
        next.currentTime = 0;
        next.play().catch(() => {});

        let steps = 0;
        let fadeTimer = setInterval(() => {
          steps++;
          if (steps <= 10) {
            current.volume = Math.max(0, 0.35 * MUSIC_VOL * (1 - steps / 10)); // Sfiamma la corrente
            next.volume = Math.min(0.35 * MUSIC_VOL, 0.35 * MUSIC_VOL * (steps / 10));     // Accende la successiva
          } else {
            current.pause();
            current.volume = 0.35 * MUSIC_VOL;
            clearInterval(fadeTimer);
          }
        }, 40);

        activeBgm = 1 - activeBgm;
      }
    }
  }, 250);
}

// ===== audio ambientali (crossfade 0,1 s): pioggia e tempesta di sabbia =====
// Per ogni meteo due player identici; quando il player attivo sta per finire, il secondo parte
// in anticipo di AMB_XF e i volumi si scambiano linearmente (fade-out del primo, fade-in del secondo).
// Nessun gap acustico tra un'iterazione e la successiva.
function ambEnsurePlayers(A){
 if(A.players)return;
 A.players=[new Audio(A.src),new Audio(A.src)];
 for(const p of A.players){p.loop=false;p.preservesPitch=false;p.volume=A.vol*SFX_VOL}
}
function ambTick(A){
 if(!A.active)return;
 const cur=A.players[A.idx];
 if(!cur||cur.paused)return;
 const dur=cur.duration;
 if(!isFinite(dur)||dur<=0)return;                                    // file non ancora caricato
 const remaining=dur-cur.currentTime;
 if(remaining>AMB_XF+0.05)return;                                     // non è ancora il momento
 const next=A.players[1-A.idx];
 if(!next.paused)return;                                              // già partito (tick ravvicinati)
 // avvia il successivo a volume 0 e fai crossfade
 next.currentTime=0;next.volume=0;
 const r=next.play();if(r&&r.catch)r.catch(()=>{});
 A.idx=1-A.idx;
 const startV=A.vol*SFX_VOL,t0=performance.now(),fid=++A.fadeId;
 const fade=()=>{
  if(!A.active||A.fadeId!==fid)return;                                // stop o altro crossfade nel frattempo
  const u=Math.min(1,(performance.now()-t0)/(AMB_XF*1000));
  next.volume=startV*u;cur.volume=startV*(1-u);
  if(u<1)requestAnimationFrame(fade);
  else{try{cur.pause();cur.currentTime=0;cur.volume=startV}catch(_){}}  // il vecchio è pronto per il prossimo giro
 };
 requestAnimationFrame(fade);
}
function ambStart(k){
 const A=AMB[k];if(!A)return;
 ambEnsurePlayers(A);
 A.active=true;
 if(!A.timer)A.timer=setInterval(()=>ambTick(A),AMB_POLL);
 const cur=A.players[A.idx];
 if(cur.paused){cur.currentTime=0;cur.volume=A.vol*SFX_VOL;const r=cur.play();if(r&&r.catch)r.catch(()=>{})}
}
function ambStop(k){
 const A=AMB[k];if(!A)return;
 A.active=false;A.fadeId=0;
 if(A.timer){clearInterval(A.timer);A.timer=null}
 if(A.players)for(const p of A.players){try{p.pause();p.currentTime=0;p.volume=A.vol*SFX_VOL}catch(_){}}
 A.idx=0;
}
const rainLoopStart=()=>ambStart('rain');
const rainLoopStop =()=>ambStop('rain');
const windLoopStart=()=>ambStart('wind');
const windLoopStop =()=>ambStop('wind');

