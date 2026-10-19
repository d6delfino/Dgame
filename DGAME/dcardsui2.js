/* ============================================================
   dcardsui.js — Carte tattica: SOLO INTERFACCIA
   ============================================================
   Scelta delle 3 carte, menu "Carte tattica", banner di attivazione, segni sulla mappa.
   Le regole delle carte (effetti, danno, difesa...) stanno in drules.js.
   Qui non si cambia mai lo stato di gioco direttamente (e online agisce solo chi è di turno: isMine()): si costruisce un'azione e la si
   manda con send() (definita in DawnlorD-MP1.html).

   CARICAMENTO: dopo drules.js e prima dello script principale.
   ============================================================ */

// ---------- STATO LOCALE (solo interfaccia) ----------
let cardSel = [], cardInfo = null;     // scelta carte in corso (fase "carte")
let cardMode = null;                   // carta in attesa: Airdrop/Fortino (aspetta l'esagono) o Upgrade (aspetta i punti): {slot}
let upg = null;                        // punti dell'Upgrade in assegnazione
const newUpg = () => ({left:1, alloc:{vita:0,passi:0,gittata:0,attacco:0}});
let ncSlot = null, ncPick = null;      // nuova carta tattica: carta da sostituire e nuova carta scelta
function resetCardsUI(){ cardSel = []; cardInfo = null; cardMode = null; upg = null; ncSlot = ncPick = null; }

// ---------- STILI E ELEMENTI (creati qui: il modulo è autonomo) ----------
(function(){
  const st = document.createElement('style');
  st.textContent = `
  #cardpick{display:none;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(560px,94%);max-height:94%;overflow-y:auto;padding:16px;background:rgba(10,12,22,.97);border:2px solid #475569;border-radius:12px;z-index:5}
  #cardpick h2{margin:0 0 10px;font-size:18px}
  .cgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px}
  .cbtn{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 4px;margin:0;background:rgba(0,0,0,.5);border:2px solid #333;border-radius:6px}
  .cbtn b{font-size:10px;text-transform:uppercase;text-align:center;line-height:1.1}
  .cinfo{min-height:52px;font-size:13px;line-height:1.4;color:#cbd5e1;margin-bottom:8px}
  .cslots{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:8px 0 12px}
  .cslot{display:flex;align-items:center;gap:6px;padding:4px 10px;border:2px solid #333;border-radius:6px;font-size:12px;cursor:pointer}
  .cslot.empty{border-style:dashed;color:#475569;cursor:default;padding:4px 18px}
  #cardmsg{display:none;position:absolute;top:12px;left:50%;transform:translateX(-50%);padding:10px 22px;background:rgba(5,5,15,.95);border:3px solid #fff;border-radius:8px;white-space:nowrap;z-index:6;pointer-events:none;font-size:15px}
  @keyframes cardPop{0%{opacity:0;transform:translateX(-50%) translateY(-8px) scale(.9)}15%{opacity:1;transform:translateX(-50%) scale(1.04)}30%{transform:translateX(-50%) scale(1)}75%{opacity:1}100%{opacity:0}}`;
  document.head.appendChild(st);
  const main = document.querySelector('main');
  main.insertAdjacentHTML('beforeend','<div id="cardpick"></div><div id="cardmsg"></div>');
  document.getElementById('cardpick').addEventListener('click',e=>{
    const c = e.target.closest('[data-cid]'), rm = e.target.closest('[data-rm]');
    if(c){ toggleCard(c.dataset.cid); cardInfo = c.dataset.cid; renderCardPicker(); }
    else if(rm){ cardSel.splice(+rm.dataset.rm,1); renderCardPicker(); }
    else if(e.target.id==='cardok') confirmCards();
  });
})();

// ---------- SELEZIONE DELLE 3 CARTE (fase "cards") ----------
function startCardSelection(){ cardSel = []; cardInfo = null; }
function toggleCard(id){                              // stessa logica dell'originale: fino a 3 si aggiunge (anche doppioni), poi si alterna/sostituisce
  if(cardSel.length < CARDS_PER_PLAYER) cardSel.push(id);
  else {
    const i = cardSel.indexOf(id);
    if(i !== -1) cardSel.splice(i,1); else { cardSel.shift(); cardSel.push(id); }
  }
}
function renderCardPicker(){
  const el = document.getElementById('cardpick');
  if(phase!=='cards' || !isMine()){ el.style.display = 'none'; return; }
  const p = curPlayer();
  const grid = Object.values(CARDS).map(c=>{
    const n = cardSel.filter(x=>x===c.id).length;
    return `<button class="cbtn" data-cid="${c.id}" style="border-color:${n?c.color:c.color+'44'};background:${n?c.color+'22':'rgba(0,0,0,.5)'}">
      <span style="font-size:22px">${c.icon}</span><b style="color:${c.color}">${c.name}${n>1?' ×'+n:''}</b></button>`;
  }).join('');
  const ci = cardInfo && CARDS[cardInfo];
  const info = ci ? `<b style="color:${ci.color}">${ci.icon} ${ci.name}</b>: ${ci.description}`
                  : 'Tocca una carta per leggerne l\'effetto e sceglierla (massimo 3, anche ripetute). Ogni carta si usa una sola volta per partita.';
  let slots = cardSel.map((id,i)=>`<div class="cslot" data-rm="${i}" style="border-color:${CARDS[id].color}">${CARDS[id].icon} <b style="color:${CARDS[id].color}">${CARDS[id].name}</b> ✕</div>`).join('');
  for(let i=cardSel.length;i<CARDS_PER_PLAYER;i++) slots += '<div class="cslot empty">?</div>';
  el.style.borderColor = p.color;
  el.innerHTML = `<h2 style="color:${p.color}">🃏 ${p.name}: scegli ${CARDS_PER_PLAYER} carte tattica</h2>
    <div class="cgrid">${grid}</div><div class="cinfo">${info}</div><div class="cslots">${slots}</div>
    <button id="cardok">✔ Conferma (${cardSel.length}/${CARDS_PER_PLAYER})</button>`;
  el.style.display = 'block';
}
function confirmCards(){ send({t:'confirmCards', cards:[...cardSel]}); }   // con meno di 3 carte il nucleo riempie con Blitz

// ---------- BANNER DI ATTIVAZIONE ----------
function cardBanner(c){
  const el = document.getElementById('cardmsg');
  el.innerHTML = `<span style="font-size:24px">${c.icon}</span> <b style="color:${c.color}">${c.name.toUpperCase()}</b> — Attivata!`;
  el.style.borderColor = c.color; el.style.boxShadow = `0 0 20px ${c.color}88`;
  el.style.display = 'block'; el.style.animation = 'none'; void el.offsetWidth;
  el.style.animation = 'cardPop 1.4s ease-out forwards';
}

// ---------- MENU "CARTE TATTICA" ----------
function cardsMenuHtml(e,p,path,btn,note){
  if(path==='carte/upgrade'){
    let h = btn('back','◀ Annulla') + note(`🧬 Upgrade: punti da assegnare <b>${upg.left}</b> (permanente)`);
    STATS.forEach(s=>{
      const k = s.id, noMove = (k==='passi' && (e.isBase || e.isStruct));
      h += `<div class="mstat"><span>${s.e} ${s.label}</span><span>`
        + `<button class="sbtn" data-id="udec:${k}"${upg.alloc[k]<=0?' disabled':''}>−</button><b>${e.st[k]+upg.alloc[k]}</b>`
        + `<button class="sbtn" data-id="uinc:${k}"${upg.left<=0||noMove?' disabled':''}>+</button></span></div>`;
    });
    return h + btn('uconfirm','✔ Conferma',upg.left>0);
  }
  let h = btn('back','◀ Indietro') + note(`Carte usate: ${Object.keys(p.usedCards).length}/${p.cards.length}`);
  p.cards.forEach((id,slot)=>{
    const c = CARDS[id], why = cardBlock(e,p,slot);
    h += btn('card:'+slot, `${p.usedCards[slot]?'✓':c.icon} ${c.name}${c.apCost?` — ${c.apCost} az.`:''}`, !!why);
    h += note(p.usedCards[slot] ? 'Già usata.' : (why ? `<b>${why}</b> · ` : '') + c.description);
  });
  return h;
}
// ---------- AZIONE SPECIALE "NUOVA CARTA TATTICA" ----------
// Sostituisce una carta già usata (restano sempre CARDS_PER_PLAYER carte) con una nuova scelta al momento, al costo di NEW_CARD_COST risorse.
const usedSlots = p => p.cards.map((_,i)=>i).filter(i=>p.usedCards[i]);
function newCardMenuHtml(e,p,btn,note){
  const used = usedSlots(p);
  let h = btn('back','◀ Indietro') + note(`Sostituisce una carta già usata con una nuova, scelta ora. Costo <b>💰 ${NEW_CARD_COST}</b> (ne hai ${p.credits}).<br>Carte da sostituire: <b>${used.length}/${CARDS_PER_PLAYER}</b>`);
  if(!used.length) return h + note('<b>Nessuna carta già usata da sostituire.</b>');
  h += btn('ncok',`✔ Conferma (💰 ${NEW_CARD_COST})`, !ncPick || p.credits<NEW_CARD_COST);      // in alto, sopra la lista delle carte
  h += '<div class="leg"><b>Nuova carta</b></div>';
  Object.values(CARDS).forEach(c=>{ h += btn('ncc:'+c.id, `${ncPick===c.id?'▶ ':''}${c.icon} ${c.name}`); });
  const pc = ncPick && CARDS[ncPick];
  return h + note(pc ? `<b style="color:${pc.color}">${pc.icon} ${pc.name}</b>: ${pc.description}` : 'Tocca una carta per leggerne l\'effetto.');
}
function newCardBuyUI(){
  const p = curPlayer(), used = usedSlots(p), slot = used[0];     // la carta sostituita è la prima già usata
  if(phase!=='play' || slot===undefined || !ncPick || p.credits<NEW_CARD_COST) return;
  send({t:'newCard', slot, card:ncPick});            // se va a buon fine, handleResult chiude il sottomenu
}
function useCardUI(slot){
  const p = curPlayer(), e = selEntity();
  if(phase!=='play' || !e) return;
  const c = CARDS[p.cards[slot]];
  if(!c || cardBlock(e,p,slot)) return;
  if(c.async){ cardMode = {slot}; upg = newUpg(); menuPath = ['carte','upgrade']; return; }
  if(c.deferred){                                   // Airdrop e Fortino: prima si sceglie l'esagono, la carta si consuma lì
    cardMode = {slot}; mode = c.id==='C02' ? 'airdrop' : 'fortino';
    logMsg = c.id==='C08' ? `🏰 FORTINO x${FORTINO_BUILDS}!` : ''; cardBanner(c);
    if(c.id==='C08') playSFX('cards4');              // come nel vecchio gioco: il Fortino suona all'attivazione (poi build a ogni barricata); l'Airdrop suona solo all'atterraggio
    return;
  }
  send({t:'useCard', ent:sel, slot});               // il banner arriva con l'evento di risposta
}
function cardMenuAction(id){                          // true = clic gestito dal modulo
  if(id==='nuovacarta'){ ncSlot = ncPick = null; return false; }      // apre il sottomenu: lo gestisce il menu principale
  if(id.startsWith('ncc:')){ ncPick = id.slice(4); return true; }
  if(id==='ncok'){ newCardBuyUI(); return true; }
  if(id.startsWith('card:')){ useCardUI(+id.slice(5)); return true; }
  if(id==='back' && menuPath.join('/')==='carte/upgrade'){ cardMode = null; upg = null; menuPath.pop(); return true; }
  if(id.startsWith('uinc:') || id.startsWith('udec:')){
    const k = id.slice(5), d = id[1]==='i' ? 1 : -1, e = selEntity();
    if(!upg || !e) return true;
    if(d>0 && (upg.left<=0 || (k==='passi' && (e.isBase || e.isStruct)))) return true;
    if(d<0 && upg.alloc[k]<=0) return true;
    upg.alloc[k] += d; upg.left -= d; return true;
  }
  if(id==='uconfirm'){
    const e = selEntity(); if(!upg || upg.left!==0 || !e || !cardMode) return true;
    send({t:'upgrade', ent:sel, slot:cardMode.slot, alloc:{...upg.alloc}});   // se va a buon fine, handleResult chiude il menu
    return true;
  }
  return false;
}


// ---------- DISEGNO: scudo, medikit, spettro ----------
function cardMarks(e,x,y){
  if(e.shielded){ g.save(); g.beginPath(); g.arc(x,y,S*0.95,0,Math.PI*2); g.strokeStyle = '#00ffff'; g.lineWidth = 3; g.setLineDash([8,6]); g.stroke(); g.restore(); }
  if(e.medikitBuff){ g.save(); g.fillStyle = '#00ff88'; g.font = `bold ${Math.round(S*0.4)}px Arial`; g.textAlign = 'center'; g.fillText('✚',x-S*0.45,y-S*0.45); g.restore(); }
  if(e.spectreBuff){ g.save(); g.fillStyle = '#fff'; g.font = `bold ${Math.round(S*0.38)}px Arial`; g.textAlign = 'center'; g.fillText('👻',x+S*0.45,y-S*0.45); g.restore(); }
  if(e.defending){ g.save(); g.fillStyle = '#fff'; g.font = `bold ${Math.round(S*0.38)}px Arial`; g.textAlign = 'center'; g.fillText(DEFENSE_EMOJI,x+S*0.45,y+S*0.3); g.restore(); }   // segnale di difesa attiva
  if(COOP) coopMarks(e,x,y);   // coop: corona dei boss, scudo infinito della base finale, infezione...
  if(e.techArmor){ g.save(); g.fillStyle = '#38bdf8'; g.font = `bold ${Math.round(S*0.42)}px Arial`; g.textAlign = 'center'; g.fillText('🔰'+e.techArmor,x-S*0.45,y+S*0.3); g.restore(); }   // armatura del top-tech (permanente)
}
