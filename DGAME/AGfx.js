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
const impact=(x,y,col)=>{fxSpawn(x,y,col,8);sfxAt(SFX_LIST.hit,1,x,y,60)};
function wreckFx(o){if(o.ind)return;const b=o.t=='b';fxBoom(o.x,o.y,b?'struct':'tree',b?Math.min(60,Math.max(FXS,o.r*.8)):FXS*.8);if(b)sfxAt(SFX_LIST.crash,.8,o.x,o.y,80)}
function blastFx(u){fxBoom(u.x,u.y,'unit',u.k==0?42:FXS);sfxAt(SFX_LIST.boom,.8,u.x,u.y,80)}

// ===== audio: piccolo pool di elementi per sovrapporre più volte lo stesso suono =====
const SFX={},ear={x:0,y:0},SFX_R=1500,sfxT={};
const SFX_MAX=3;   // massimo elementi audio per ogni suono, creati solo se servono
function sfxPool(src){let a=SFX[src];if(!a){a=SFX[src]={p:[],i:0};a.p.push(new Audio(src))}return a}
function sfx(src,vol){try{const a=sfxPool(src);let e=a.p.find(x=>x.paused);   // elemento libero
 if(!e){if(a.p.length<SFX_MAX){e=new Audio(src);a.p.push(e)}else e=a.p[a.i++%a.p.length]}
 e.volume=clamp(vol==null?1:vol,0,1);e.currentTime=0;const r=e.play();if(r&&r.catch)r.catch(()=>{})}catch(_){}}
function sfxAt(src,vol,x,y,gap){const d=Math.hypot(x-ear.x,y-ear.y);if(d>SFX_R)return;const n=performance.now();if(sfxT[src]>n)return;sfxT[src]=n+(gap||0);sfx(src,vol*(1-d/SFX_R*.8))}
let walkAu=null;
function walkSnd(on){if(!walkAu){if(!on)return;walkAu=new Audio(SFX_LIST.move);walkAu.loop=true;walkAu.volume=.35}
 try{if(on){if(walkAu.paused){const r=walkAu.play();if(r&&r.catch)r.catch(()=>{})}}else if(!walkAu.paused)walkAu.pause()}catch(_){}}
const preloadSfx=()=>{[...new Set([...WEAPONS.map(w=>w.sfx),...Object.values(SFX_LIST)].filter(Boolean))].forEach((f,i)=>setTimeout(()=>sfxPool(f),i*120))};
