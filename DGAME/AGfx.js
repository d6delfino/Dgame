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
function fxBoom(x,y,kind,s){
 if(kind=='tree'){fxSpawn(x,y,'#4f8f3f',10,true,s);return}
 fxSpawn(x,y,'#ff8800',15,true,s);fxSpawn(x,y,'#ff3333',10,true,s);if(kind=='struct')fxSpawn(x,y,'#777777',10,true,s)}
function fxStep(dt){const k=dt/FX_STEP,f=Math.pow(.85,k);
 for(let i=fxP.length-1;i>=0;i--){const p=fxP[i];p.x+=p.vx*k;p.y+=p.vy*k;p.vx*=f;p.vy*=f;p.life-=p.decay*k;if(p.life<=0){fxP[i]=fxP[fxP.length-1];fxP.pop()}}}
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
function wreckFx(o){if(o.ind)return;const b=o.t=='b';fxBoom(o.x,o.y,b?'struct':'tree',b?Math.min(60,Math.max(FXS,o.r*.8)):FXS*.8);if(b)sfxAt(SFX_LIST.crash,.8,o.x,o.y,80)}
function blastFx(u){fxBoom(u.x,u.y,'unit',u.k==0?42:FXS);sfxAt(SFX_LIST.boom,.8,u.x,u.y,80)}

// ===== audio: piccolo pool di elementi per sovrapporre più volte lo stesso suono =====
const SFX={},ear={x:0,y:0},SFX_R=1500,sfxT={};
const SFX_MAX=3;   // massimo elementi audio per ogni suono, creati solo se servono
function sfxPool(src){let a=SFX[src];if(!a){a=SFX[src]={p:[],i:0};a.p.push(new Audio(src))}return a}
// Web Audio: ogni file è decodificato UNA volta in memoria e suonato con nodi leggeri (niente scatti, niente elementi <audio> in più).
// OGNI suono, anche quelli aggiunti in futuro, passa da sfx() e riceve una variazione casuale: tono/velocità, volume e timbro.
// La musica (playBgm) è separata e non viene toccata. Il pool qui sopra resta come ripiego (file:// o decodifica non riuscita).
let AC=null;const SB={},SLAST={},SV_MAX=24;let svAct=0;       // contesto audio, buffer decodificati, ultima velocità di ogni suono, voci attive e loro tetto
const SV_DEF={r:.16,g:.22,t:1};                                // variazione di base: tono/velocità ±16%, volume fino a −22%, timbro casuale
const SFX_VAR={[WEAPONS[W_MG].sfx]:{r:.04,g:.06,t:.25}};   // mitraglia: effetti dimezzati                                              // facoltativo, per un suono particolare: SFX_VAR['sfx/x.mp3']={r:.05,g:.1,t:0}
function audioCtx(){if(AC===null){try{const C=window.AudioContext||window.webkitAudioContext;AC=C?new C({latencyHint:'interactive'}):0}catch(_){AC=0}}return AC}
['pointerdown','keydown','touchstart'].forEach(t=>addEventListener(t,()=>{const c=audioCtx();if(c&&c.state=='suspended')c.resume()},{passive:true}));
function sfxLoad(src){if(SB[src]!==undefined)return SB[src];SB[src]=0;const c=audioCtx();if(!c){SB[src]=-1;return -1}
 fetch(src).then(r=>{if(!r.ok)throw 0;return r.arrayBuffer()}).then(b=>new Promise((ok,ko)=>c.decodeAudioData(b,ok,ko))).then(buf=>{SB[src]=buf}).catch(()=>{SB[src]=-1});return 0}
function sfxVar(src){const d=SFX_VAR[src]||SV_DEF,l=SLAST[src]||1,lo=1-d.r,hi=1+d.r,m=d.r*.35,a=Math.max(lo,l-m),w=Math.max(0,Math.min(hi,l+m)-a);   // zona da evitare: vicino all'ultima velocità usata
 let rate=lo+Math.random()*(hi-lo-w);if(rate>=a)rate+=w;   // mai quasi uguale alla volta prima
 SLAST[src]=rate;return{rate,gain:1-d.g*Math.random(),cut:d.t?22000-d.t*(17500-Math.random()*13500):0}}
function sfx(src,vol,pan){if(!src)return;const b=sfxLoad(src);   // 0 = ancora in caricamento, -1 = Web Audio non disponibile: in entrambi i casi si usa l'elemento <audio>
 const v=sfxVar(src),g0=clamp(vol==null?1:vol,0,1)*v.gain;
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
function walkSnd(on){if(!walkAu){if(!on)return;walkAu=new Audio(SFX_LIST.move);walkAu.loop=true;walkAu.volume=.35;walkAu.preservesPitch=false}
 try{if(on){if(walkAu.paused){walkAu.playbackRate=.85+Math.random()*.3;const r=walkAu.play();if(r&&r.catch)r.catch(()=>{})}}else if(!walkAu.paused)walkAu.pause()}catch(_){}}
const preloadSfx=()=>{[...new Set([...WEAPONS.map(w=>w.sfx),...Object.values(SFX_LIST)].filter(Boolean))].forEach((f,i)=>setTimeout(()=>sfxLoad(f),i*120))};

let bgmPlayers = [new Audio('sfx/AGmusic.mp3'), new Audio('sfx/AGmusic.mp3')];
let activeBgm = 0;
let bgmInterval = null;

function playBgm() {
  if (bgmInterval) return;
  
  const p1 = bgmPlayers[0];
  p1.volume = 0.35;
  p1.currentTime = 0;
  p1.play().catch(() => {});

  // Controlla costantemente la riproduzione per avviare la sovrapposizione
  bgmInterval = setInterval(() => {
    const current = bgmPlayers[activeBgm];
    const next = bgmPlayers[1 - activeBgm];

    // Quando mancano circa 1 secondo alla fine (a ~13.1s su 14.14s), fa partire la traccia successiva
    if (current.duration && current.currentTime >= current.duration - 1.0) {
      if (next.paused) {
        next.volume = 0;
        next.currentTime = 0;
        next.play().catch(() => {});

        // Effetto sfumatura incrociata (Crossfade) della durata di circa 400ms
        let steps = 0;
        let fadeTimer = setInterval(() => {
          steps++;
          if (steps <= 10) {
            current.volume = Math.max(0, 0.35 * (1 - steps / 10)); // Sfiamma la corrente
            next.volume = Math.min(0.35, 0.35 * (steps / 10));     // Accende la successiva
          } else {
            current.pause();
            current.volume = 0.35;
            clearInterval(fadeTimer);
          }
        }, 40);

        activeBgm = 1 - activeBgm; // Scambia il lettore attivo
      }
    }
  }, 250);
}

let bgmMuted = false;
function toggleBgm() {
  bgmMuted = !bgmMuted;
  bgmPlayers.forEach(p => p.muted = bgmMuted);
  const btn = document.getElementById('bgmToggle');
  if (btn) btn.textContent = bgmMuted ? '🔇' : '🔊';
  return bgmMuted;
}
