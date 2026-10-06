import './opening.css';
import { cardMarkup, installImageFallback, ownedMarkup, packMarkup } from '../assets/cards';
import { CARD_BY_ID, PRODUCTS } from '../data/cards';
import { money, ownedRawMarketValue } from '../core/economy';
import type { GameStore } from '../core/store';
import { PackImageCache } from './pack-image-cache';
import { SEAM, bodyClip, stripClip, clamp } from './tear-seam';
import type { Opening } from '../core/types';
import type { GameAudio } from '../game/audio';

/** Gestures commit immediately. Animation delays only presentation, never inventory. */
export class PackOpening {
  private cleanup?: () => void;
  private animation = 0;
  private busy = false;
  private alive = true;
  private images?: PackImageCache;
  private packUid = '';
  private motions = new Set<Animation>();
  constructor(private root: HTMLElement, private store: GameStore, private audio: GameAudio, private close: () => void, private notify: (text: string) => void) {
    if (!store.state.opening && store.state.packs.length === 1) store.startOpening(store.state.packs[0].uid);
    this.render();
  }
  render() {
    this.cleanup?.(); this.cleanup = undefined; this.busy = false;
    const state = this.store.state; const opening = state.opening;
    this.root.className = 'modal-root opening-root';
    if (opening && this.packUid !== opening.pack.uid) {
      this.images?.dispose(); this.packUid = opening.pack.uid; this.images = new PackImageCache(opening);
    }
    if (!opening) {
      this.root.innerHTML = `<section class="game-panel pack-picker" role="dialog" aria-modal="true" aria-label="Opening desk"><header class="panel-header"><h1>Choose a pack <span class="small-count">${state.packs.length} unopened</span></h1><button class="close-button" data-close aria-label="Close">&times;</button></header>${state.packs.length ? `<div class="pack-choices">${state.packs.map(pack => { const p = PRODUCTS.find(p => p.code === pack.productId)!; return `<button class="pack-choice" data-pack="${pack.uid}">${packMarkup(p)}<b>${p.name}</b><span>${pack.price === 0 ? 'Starter pack' : `${money(pack.price)} coins`}</span></button>`; }).join('')}</div>` : '<div class="empty-state"><h2>No unopened packs</h2><p>Pick one up at the card shop.</p></div>'}</section>`;
      this.root.querySelectorAll<HTMLButtonElement>('[data-pack]').forEach(b => { b.onclick = () => { this.audio.unlock(); this.audio.play('click'); if (this.store.startOpening(b.dataset.pack!)) this.render(); }; });
    } else if (opening.stage === 'complete') {
      const total = opening.cards.reduce((n, c) => n + ownedRawMarketValue(c, state.marketSeed), 0);
      this.root.innerHTML = `<section class="game-panel pack-summary" role="dialog" aria-modal="true" aria-label="Pack complete"><header class="panel-header"><div><span class="eyebrow">${PRODUCTS.find(p => p.code === opening.pack.productId)!.name}</span><h1>Pack complete <span class="check-mark">&#10003;</span></h1></div><button class="close-button" data-close aria-label="Close">&times;</button></header><div class="summary-cards">${opening.cards.map(c => `<div>${ownedMarkup(c, true)}<b>${CARD_BY_ID.get(c.cardId)!.name}</b></div>`).join('')}</div><footer class="panel-footer"><span>${opening.cards.length} cards &middot; ${money(total)} estimated raw value</span><button class="primary-button" data-collect>Place in binder <span>&rarr;</span></button></footer></section>`;
      this.root.querySelector<HTMLButtonElement>('[data-collect]')!.onclick = () => { const count = opening.cards.length; if (this.store.collect()) { this.audio.play('buy'); this.notify(`${count} cards added to your binder`); this.close(); } };
      installImageFallback(this.root);
    } else {
      const p = PRODUCTS.find(p => p.code === opening.pack.productId)!;
      const waiting = opening.stage === 'cards' && !this.images!.ready;
      const sealed = opening.stage === 'sealed' || waiting; const c = CARD_BY_ID.get(opening.cards[opening.index].cardId)!;
      const last = opening.index === opening.cards.length - 1;
      this.root.innerHTML = `<section class="opening-stage ${sealed ? 'is-sealed' : ''} ${last && !sealed ? 'final-pull' : ''}" role="dialog" aria-modal="true" aria-label="${sealed ? 'Rip wrapper' : 'Card reveal'}">
        <header class="opening-header"><div><span class="eyebrow">OPENING DESK</span><h1>${p.name}</h1></div><div class="opening-progress"><span>${sealed ? 'Sealed' : `${opening.index + 1} / ${opening.cards.length}`}</span><div class="reveal-dots">${opening.cards.map((_, i) => `<i class="${!sealed && i <= opening.index ? 'seen' : ''}"></i>`).join('')}</div></div><button class="text-button" data-close>Back <kbd>Esc</kbd></button></header>
        <div class="desk-playmat" aria-hidden="true"></div>
        <div class="tactile-space">${sealed ? `<div class="wrapper-object" data-wrapper><div class="wrapper-inner card-back" aria-hidden="true"></div><div class="wrapper-body">${packMarkup(p, true)}</div><div class="tear-strip progressive-strip" aria-hidden="true">${packMarkup(p, true)}</div><div class="loose-foil" aria-hidden="true">${SEAM.slice(1).map((_, i) => `<div class="tear-foil" data-foil="${i}">${packMarkup(p, true)}</div>`).join('')}</div><button class="tear-handle" aria-label="Drag the seam to rip the pack" data-tear><span>&larr;</span><span>Pull the seam</span><span>&rarr;</span></button></div><div class="gesture-caption">${waiting ? 'Preparing cards...' : 'Drag across the top to rip'}</div><button class="gesture-alternative" data-rip-key ${waiting ? 'hidden' : ''}>Hold <kbd>R</kbd></button>` : `<div class="card-stack">${this.stackMarkup(opening)}</div><div class="gesture-caption">Swipe to ${last ? 'finish' : 'reveal the next card'}</div><button class="gesture-alternative" data-next>${last ? 'Finish pack' : 'Next card'} <kbd>&rarr;</kbd></button>`}</div>
        ${sealed ? '' : `<aside class="pull-info"><span class="rarity-label">${c.rarity}</span><h2>${c.name}</h2><span class="pull-set">${c.set} &middot; ${c.number}</span><div class="pull-value"><small>EST. RAW VALUE</small><b>${money(ownedRawMarketValue(opening.cards[opening.index], state.marketSeed))}<span> coins</span></b></div>${last ? '<span class="last-card-note">Final pull</span>' : ''}</aside>`}
      </section>`;
      if (waiting) { this.busy = true; void this.images!.settled.then(() => { if (this.alive && this.store.state.opening?.pack.uid === opening.pack.uid) this.render(); }); }
      else if (sealed) this.bindRip(); else this.bindSwipe();
      this.images!.apply(this.root); installImageFallback(this.root);
    }
    this.root.querySelector<HTMLButtonElement>('[data-close]')!.onclick = this.close;
  }
  private cachedCardMarkup(cardId: string, owned: Opening['cards'][number]) {
    return cardMarkup(CARD_BY_ID.get(cardId)!, owned).replace(' src=', ' data-pack-src=');
  }
  private stackMarkup(o: Opening) {
    return o.cards.slice(o.index, o.index + 3).map((owned, offset) => {
      const c = CARD_BY_ID.get(owned.cardId)!;
      return `<div class="${offset === 0 ? 'draggable-card' : 'stack-card under-' + offset}" ${offset === 0 ? `data-card tabindex="0" role="button" aria-label="Swipe ${c.name}"` : 'data-under-card aria-hidden="true"'} data-index="${o.index + offset}">${this.cachedCardMarkup(c.id, owned)}</div>`;
    }).reverse().join('');
  }
  private motion(el: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
    const animation = el.animate(frames, options); this.motions.add(animation);
    void animation.finished.then(() => this.motions.delete(animation), () => this.motions.delete(animation)); return animation;
  }
  private bindRip() {
    const handle = this.root.querySelector<HTMLButtonElement>('[data-tear]')!;
    const wrapper = this.root.querySelector<HTMLElement>('[data-wrapper]')!;
    const strip = wrapper.querySelector<HTMLElement>('.tear-strip')!;
    const foil = [...wrapper.querySelectorAll<HTMLElement>('[data-foil]')];
    const body = wrapper.querySelector<HTMLElement>('.wrapper-body')!;
    let pointer: number | undefined; let held = false; let progress = 0; let direction = 1;
    let startY = 0; let edge = 0; let opposite = 0; let holdFrame = 0; let holdStart = 0; let holdProgress = 0; let lastCrinkle = 0;
    const draw = (p: number, vertical = 0) => {
      const previous = progress; progress = Math.max(progress, clamp(p));
      const frontier = (direction > 0 ? progress : 1-progress) * 100;
      body.style.clipPath = bodyClip(progress, direction);
      strip.style.clipPath = direction > 0 ? stripClip(frontier, 100) : stripClip(0, frontier);
      foil.forEach((el, i) => {
        const left = SEAM[i][0], right = SEAM[i+1][0];
        const lo = direction > 0 ? left : Math.max(left, frontier), hi = direction > 0 ? Math.min(right, frontier) : right;
        el.hidden = hi <= lo; if (el.hidden) return;
        el.style.clipPath = stripClip(Math.max(0, lo-.06), Math.min(100, hi+.06));
        const weight = clamp((direction > 0 ? frontier-(lo+hi)/2 : (lo+hi)/2-frontier) / 85);
        el.style.transformOrigin = `${frontier}% 8%`;
        el.style.transform = `translate3d(${direction*weight*weight*2}px,${-18*Math.sin(weight*Math.PI/2)+clamp(vertical,-40,40)*weight*.06}px,${weight*10}px) rotateX(${-weight*22}deg) rotateZ(${direction*weight*weight*3}deg)`;
        el.style.setProperty('--foil-light', `${38+weight*28}%`);
      });
      wrapper.style.transform = `translateY(${progress*1.5}px) rotateZ(${-direction*progress*.6}deg)`;
      handle.style.setProperty('--tear-progress', `${progress*100}%`); handle.style.setProperty('--tear-frontier', `${frontier}%`);
      wrapper.dataset.tearProgress = progress.toFixed(3); wrapper.dataset.tearDirection = String(direction);
      if (progress > previous+.003 && performance.now()-lastCrinkle > 90) { this.audio.play('crinkle'); lastCrinkle = performance.now(); }
    };
    const complete = () => {
      if (this.busy || !this.store.rip()) return;
      this.busy = true; held = false; pointer = undefined; cancelAnimationFrame(holdFrame); this.audio.play('rip'); wrapper.classList.add('ripped');
      foil.forEach((el, i) => this.motion(el, [{ transform: el.style.transform, opacity: 1 }, { transform: `translate3d(${direction*(55+i*.8)}px,25px,14px) rotateX(-45deg) rotateZ(${direction*12}deg)`, opacity: 1, offset: .65 }, { transform: `translate3d(${direction*(85+i)}px,90px,0) rotateX(-65deg) rotateZ(${direction*23}deg)`, opacity: 0 }], { duration: 330, easing: 'ease-in', fill: 'forwards' }));
      // Keep the existing wrapper view until this pack's images have decoded (or failed cleanly).
      const pause = new Promise<void>(resolve => { this.animation = window.setTimeout(resolve, 340); });
      void Promise.all([pause, this.images!.settled]).then(() => { if (this.alive) this.render(); });
      if (!this.images!.ready) this.root.querySelector('.gesture-caption')!.textContent = 'Preparing cards...';
    };
    const settle = () => {
      held = false; pointer = undefined; cancelAnimationFrame(holdFrame);
      if (!this.busy) { wrapper.classList.remove('dragging'); draw(progress); }
    };
    handle.onpointerdown = e => {
      if (this.busy || pointer !== undefined || held || e.button !== 0 || !e.isPrimary) return;
      const bounds = handle.getBoundingClientRect(); const x = clamp((e.clientX-bounds.left)/bounds.width);
      if (progress === 0) { if (x > .16 && x < .84) return; direction = x < .5 ? 1 : -1; edge = e.clientX; opposite = bounds.left+bounds.width*(direction > 0 ? .94 : .06); }
      else if (Math.abs(x-(direction > 0 ? progress : 1-progress)) > .16) return;
      e.preventDefault(); this.audio.unlock(); startY = e.clientY; pointer = e.pointerId; wrapper.classList.add('dragging'); handle.setPointerCapture(e.pointerId); draw(progress);
    };
    handle.onpointermove = e => {
      if (pointer !== e.pointerId || this.busy) return;
      draw((e.clientX-edge)/(opposite-edge), e.clientY-startY); if (progress >= 1) complete();
    };
    handle.onpointerup = handle.onpointercancel = handle.onlostpointercapture = e => { if (pointer === e.pointerId) settle(); };
    const holdTick = (time: number) => { if (!held || this.busy) return; draw(holdProgress+(time-holdStart)/650); if (progress >= 1) complete(); else holdFrame = requestAnimationFrame(holdTick); };
    const startHold = () => {
      if (this.busy || held || pointer !== undefined) return;
      // A partial keyboard rip may be continued with the mouse. Establish the
      // horizontal distance now, even when no pointer gesture started the tear.
      if (opposite === edge) { const bounds = handle.getBoundingClientRect(); edge = bounds.left; opposite = bounds.right; }
      this.audio.unlock(); held = true; wrapper.classList.add('dragging'); holdStart = performance.now(); holdProgress = progress; holdFrame = requestAnimationFrame(holdTick);
    };
    const down = (e: KeyboardEvent) => { if (e.code === 'KeyR' && !e.repeat) { e.preventDefault(); startHold(); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'KeyR') settle(); };
    const button = this.root.querySelector<HTMLButtonElement>('[data-rip-key]')!;
    button.onpointerdown = e => { if (e.button !== 0 || !e.isPrimary) return; e.preventDefault(); startHold(); button.setPointerCapture(e.pointerId); };
    button.onpointerup = button.onpointercancel = button.onlostpointercapture = settle;
    const hide = () => { if (document.hidden) settle(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', settle); document.addEventListener('visibilitychange', hide);
    draw(0);
    this.cleanup = () => { held = false; cancelAnimationFrame(holdFrame); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', settle); document.removeEventListener('visibilitychange', hide); };
  }
  private updateReveal(o: Opening) {
    const c = CARD_BY_ID.get(o.cards[o.index].cardId)!; const last = o.index === o.cards.length-1;
    this.root.querySelector('.opening-stage')!.classList.toggle('final-pull', last);
    this.root.querySelector('.opening-progress > span')!.textContent = `${o.index+1} / ${o.cards.length}`;
    this.root.querySelectorAll('.reveal-dots > i').forEach((dot, i) => dot.classList.toggle('seen', i <= o.index));
    this.root.querySelector('.gesture-caption')!.textContent = `Swipe to ${last ? 'finish' : 'reveal the next card'}`;
    this.root.querySelector('[data-next]')!.innerHTML = `${last ? 'Finish pack' : 'Next card'} <kbd>&rarr;</kbd>`;
    this.root.querySelector('.pull-info')!.innerHTML = `<span class="rarity-label">${c.rarity}</span><h2>${c.name}</h2><span class="pull-set">${c.set} &middot; ${c.number}</span><div class="pull-value"><small>EST. RAW VALUE</small><b>${money(ownedRawMarketValue(o.cards[o.index], this.store.state.marketSeed))}<span> coins</span></b></div>${last ? '<span class="last-card-note">Final pull</span>' : ''}`;
  }
  private async promote(card: HTMLElement) {
    if (!this.alive) return;
    const o = this.store.state.opening!;
    if (o.stage === 'complete') { this.render(); return; }
    this.cleanup?.(); this.cleanup = undefined;
    const stack = this.root.querySelector<HTMLElement>('.card-stack')!;
    const next = stack.querySelector<HTMLElement>(`[data-under-card][data-index="${o.index}"]`)!;
    const pose = getComputedStyle(next).transform;
    card.remove(); next.className = 'draggable-card stack-promoted'; next.removeAttribute('data-under-card'); next.removeAttribute('aria-hidden');
    next.setAttribute('data-card', ''); next.setAttribute('tabindex', '0'); next.setAttribute('role', 'button'); next.setAttribute('aria-label', `Swipe ${CARD_BY_ID.get(o.cards[o.index].cardId)!.name}`);
    next.style.animation = 'none'; this.updateReveal(o);
    const under = stack.querySelector<HTMLElement>('[data-under-card]');
    if (under) {
      const previous = getComputedStyle(under).transform; under.className = 'stack-card under-1';
      this.motion(under, [{ transform: previous }, { transform: 'translate(3px,4px) rotate(2deg)' }], { duration: 140, easing: 'ease-out' });
    }
    if (o.index+2 < o.cards.length) {
      const owned = o.cards[o.index+2]; const el = document.createElement('div'); el.className = 'stack-card under-2'; el.dataset.underCard = ''; el.dataset.index = String(o.index+2); el.setAttribute('aria-hidden', 'true'); el.innerHTML = this.cachedCardMarkup(owned.cardId, owned); stack.prepend(el); this.images!.apply(el); installImageFallback(el);
    }
    if (o.index === o.cards.length-1) this.audio.play('rare');
    try { await this.motion(next, [{ transform: pose }, { transform: 'none' }], { duration: 140, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished; } catch { return; }
    if (!this.alive) return;
    this.busy = false; this.root.querySelector<HTMLButtonElement>('[data-next]')!.disabled = false; this.bindSwipe();
  }
  private bindSwipe() {
    const card = this.root.querySelector<HTMLElement>('[data-card]')!;
    const button = this.root.querySelector<HTMLButtonElement>('[data-next]')!;
    let startX = 0, startY = 0, dx = 0, dy = 0, baseX = 0, baseY = 0, travelX = 0, travelY = 0;
    let lastX = 0, lastY = 0, lastTime = 0, vx = 0, vy = 0; let pointer: number | undefined; let returning: Animation | undefined;
    const advance = (direction = 1) => {
      if (this.busy || pointer !== undefined || !this.store.swipe()) return;
      this.busy = true; button.disabled = true; this.audio.unlock(); this.audio.play('swipe');
      const from = getComputedStyle(card).transform; returning?.cancel(); card.classList.remove('dragging'); card.style.animation = 'none'; card.setAttribute('aria-disabled', 'true');
      const duration = clamp(300-Math.abs(vx)*35, 210, 300);
      const exit = this.motion(card, [{ transform: from, opacity: 1 }, { transform: `translate3d(${direction*Math.max(650,innerWidth*.55)}px,${dy+clamp(vy*45,-80,80)-35}px,20px) rotateZ(${direction*26}deg)`, opacity: 1, offset: .85 }, { transform: `translate3d(${direction*Math.max(680,innerWidth*.6)}px,${dy-45}px,20px) rotateZ(${direction*28}deg)`, opacity: 0 }], { duration, easing: 'cubic-bezier(.22,.65,.35,1)', fill: 'forwards' });
      void exit.finished.then(() => this.promote(card), () => {});
    };
    const settle = () => {
      pointer = undefined;
      if (!this.busy) {
        const from = getComputedStyle(card).transform; returning?.cancel(); card.classList.remove('dragging'); card.style.animation = 'none'; card.style.transform = '';
        returning = this.motion(card, [{ transform: from }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
      }
    };
    card.onpointerdown = e => {
      if (this.busy || pointer !== undefined || e.button !== 0 || !e.isPrimary) return;
      e.preventDefault(); this.audio.unlock();
      const from = getComputedStyle(card).transform; const pose = new DOMMatrixReadOnly(from); baseX = pose.m41; baseY = pose.m42; returning?.cancel(); card.style.transform = from;
      pointer = e.pointerId; startX = lastX = e.clientX; startY = lastY = e.clientY; lastTime = performance.now(); dx = baseX; dy = baseY; travelX = travelY = vx = vy = 0;
      card.classList.add('dragging'); card.style.animation = 'none'; card.setPointerCapture(e.pointerId);
    };
    card.onpointermove = e => {
      if (pointer !== e.pointerId || this.busy) return;
      travelX = e.clientX-startX; travelY = e.clientY-startY; dx = baseX+travelX; dy = baseY+travelY;
      const now = performance.now(), elapsed = Math.max(8, now-lastTime); vx = (e.clientX-lastX)/elapsed; vy = (e.clientY-lastY)/elapsed; lastX = e.clientX; lastY = e.clientY; lastTime = now;
      card.style.transform = `translate3d(${dx}px,${dy}px,24px) rotateZ(${dx*.055}deg) rotateY(${clamp(dx*.04,-12,12)}deg) rotateX(${clamp(-dy*.04,-8,8)}deg)`;
      card.style.setProperty('--foil-light', `${50+clamp(dx*.1,-40,40)}%`);
    };
    card.onpointerup = e => { if (pointer !== e.pointerId) return; pointer = undefined; if (Math.hypot(travelX,travelY) >= Math.max(85,card.clientWidth*.3)) advance(dx < 0 ? -1 : 1); else settle(); };
    card.onpointercancel = card.onlostpointercapture = e => { if (pointer === e.pointerId) settle(); };
    button.onclick = () => advance();
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'ArrowRight' || e.code === 'ArrowLeft' || ((e.code === 'Space' || e.code === 'Enter') && document.activeElement === card)) { e.preventDefault(); advance(e.code === 'ArrowLeft' ? -1 : 1); }
    };
    const hide = () => { if (document.hidden) settle(); };
    window.addEventListener('keydown', key); window.addEventListener('blur', settle); document.addEventListener('visibilitychange', hide);
    this.cleanup = () => { returning?.cancel(); window.removeEventListener('keydown', key); window.removeEventListener('blur', settle); document.removeEventListener('visibilitychange', hide); };
  }
  dispose() { this.alive = false; clearTimeout(this.animation); this.cleanup?.(); this.images?.dispose(); this.motions.forEach(a => a.cancel()); this.motions.clear(); this.root.replaceChildren(); }
}
