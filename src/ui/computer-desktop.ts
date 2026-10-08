import './computer.css';
import { APPS, ComputerApp, type AppId } from './computer-apps';
import type { ComputerServices } from '../core/computer';
import { gameTime, gameDate } from '../core/computer-state';
import type { GameStore } from '../core/store';
import { escapeHtml } from '../assets/cards';
type WindowState = { app: ComputerApp; el: HTMLElement; minimized: boolean; maximized: boolean; position: { x: number; y: number }; dirty: boolean };
/** Only the foreground application mounts its content; dormant windows retain navigation, not DOM/images/charts. */
export class ComputerDesktop {
  private windows = new Map<AppId, WindowState>();
  private active?: AppId;
  private timer: number;
  private unsubscribe: () => void;
  private abort = new AbortController();
  private refreshFrame = 0;
  private disposed = false;
  private forceRefresh = false;
  constructor(private root: HTMLElement, private store: GameStore, private services: ComputerServices, close: () => void, initial?: AppId) {
    root.className = 'modal-root computer-modal';
    root.innerHTML = `<section class="pc-monitor" role="dialog" aria-modal="true" aria-label="Bedroom computer"><div class="pc-screen"><div class="pc-wallpaper"><span>RIPIFY</span><small>A place for your collection.</small></div><div class="pc-shortcuts">${(Object.keys(APPS) as AppId[]).map(id => `<button data-app="${id}" aria-label="Open ${APPS[id].title}">${this.icon(id)}<span>${APPS[id].title}</span></button>`).join('')}</div><div class="pc-window-layer"></div><footer class="pc-taskbar"><button class="pc-start" aria-label="Desktop">▦</button><div data-tasks></div><small>RIPIFY OS</small><time data-pc-clock></time><button data-pc-exit aria-label="Exit computer">⏻</button></footer></div><div class="pc-bezel"><span>RIPIFY</span><i></i></div></section>`;
    root.querySelectorAll<HTMLButtonElement>('[data-app]').forEach(b => { b.onclick = () => this.open(b.dataset.app as AppId); });
    root.querySelector<HTMLButtonElement>('[data-pc-exit]')!.onclick = close;
    root.querySelector<HTMLButtonElement>('.pc-start')!.onclick = () => { for (const w of this.windows.values()) w.minimized = true; this.activate(undefined); };
    this.unsubscribe = store.subscribe(() => { for (const w of this.windows.values()) w.dirty = true; this.scheduleRefresh(); });
    this.timer = window.setInterval(() => {
      const clock = root.querySelector('time')!; clock.textContent = gameTime(store.state.computer!.minute); clock.setAttribute('title', gameDate(store.state.computer!.minute));
      const w = this.active && this.windows.get(this.active);
      // Only live stock and submission countdowns need polling. The grading
      // collection changes through store notifications, never the clock.
      const timedView = w && ((this.active === 'store' && ['home', 'orders'].includes(w.app.route)) || (this.active === 'grading' && w.app.route === 'orders'));
      if (w && timedView && !root.contains(document.activeElement?.closest('input, select, textarea') ?? null)) { w.dirty = true; this.scheduleRefresh(); }
    }, 1000);
    root.querySelector('time')!.textContent = gameTime(store.state.computer!.minute);
    if (initial) this.open(initial);
  }
  private icon(id: AppId) { return `<span class="pc-icon" style="--icon-color:${APPS[id].color}">${id === 'collectr' ? '<img src="/computer/collectr.png" alt=""/>' : APPS[id].symbol}</span>`; }
  open(id: AppId) {
    let w = this.windows.get(id);
    if (!w) {
      const el = document.createElement('section'); el.className = 'pc-window'; el.dataset.window = id; el.setAttribute('aria-label', `${APPS[id].title} window`);
      el.innerHTML = `<header class="pc-titlebar">${this.icon(id)}<span>${escapeHtml(APPS[id].title)}</span><div><button data-minimize aria-label="Minimize ${APPS[id].title}">−</button><button data-maximize aria-label="Maximize ${APPS[id].title}">□</button><button data-window-close aria-label="Close ${APPS[id].title}">×</button></div></header><div class="pc-app-content"></div>`;
      w = { el, app: new ComputerApp(id, this.store, this.services, () => { w!.dirty = true; this.forceRefresh = true; this.scheduleRefresh(); }), minimized: false, maximized: false, position: { x: 60 + this.windows.size * 12, y: 24 + this.windows.size * 9 }, dirty: true };
      this.windows.set(id, w); this.root.querySelector('.pc-window-layer')!.append(el);
      el.querySelector<HTMLButtonElement>('[data-minimize]')!.onclick = () => { w!.minimized = true; this.activate(this.foreground(id)); };
      el.querySelector<HTMLButtonElement>('[data-maximize]')!.onclick = () => { w!.maximized = !w!.maximized; this.position(w!); };
      el.querySelector<HTMLButtonElement>('[data-window-close]')!.onclick = () => { w!.app.suspend(); el.remove(); this.windows.delete(id); this.activate(this.foreground(id)); };
      this.drag(w);
    }
    w.minimized = false; this.activate(id);
  }
  private foreground(exclude: AppId) { return [...this.windows.entries()].reverse().find(([id, w]) => id !== exclude && !w.minimized)?.[0]; }
  private activate(id?: AppId) {
    this.active = id;
    for (const [key, w] of this.windows) {
      const visible = key === id && !w.minimized; w.el.hidden = !visible;
      if (!visible) { w.app.suspend(); w.el.querySelector('.pc-app-content')!.replaceChildren(); w.dirty = true; }
      else this.position(w);
    }
    this.tasks(); this.refresh();
  }
  private tasks() {
    const bar = this.root.querySelector('[data-tasks]')!;
    bar.innerHTML = [...this.windows.keys()].map(id => `<button data-task="${id}" class="${this.active === id ? 'active' : ''}" aria-label="Restore ${APPS[id].title}">${this.icon(id)}<span>${APPS[id].title}</span></button>`).join('');
    bar.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.onclick = () => { const id = b.dataset.task as AppId, w = this.windows.get(id)!; if (this.active === id) { w.minimized = true; this.activate(this.foreground(id)); } else this.open(id); }; });
  }
  private position(w: WindowState) { w.el.classList.toggle('maximized', w.maximized); w.el.style.left = `${w.position.x}px`; w.el.style.top = `${w.position.y}px`; }
  private drag(w: WindowState) {
    const title = w.el.querySelector<HTMLElement>('.pc-titlebar')!; let drag: { id: number; x: number; y: number; left: number; top: number } | undefined;
    const opts = { signal: this.abort.signal };
    title.addEventListener('dblclick', e => { if (!(e.target as Element).closest('button')) { w.maximized = !w.maximized; this.position(w); } }, opts);
    title.addEventListener('pointerdown', e => { if ((e.target as Element).closest('button') || w.maximized || e.button !== 0) return; e.preventDefault(); drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: w.position.x, top: w.position.y }; title.setPointerCapture(e.pointerId); }, opts);
    title.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; const screen = this.root.querySelector('.pc-screen')!.getBoundingClientRect(); w.position.x = Math.max(0, Math.min(screen.width - 160, drag.left + e.clientX - drag.x)); w.position.y = Math.max(0, Math.min(screen.height - 100, drag.top + e.clientY - drag.y)); this.position(w); }, opts);
    const release = () => { drag = undefined; }; title.addEventListener('pointerup', release, opts); title.addEventListener('pointercancel', release, opts);
  }
  private scheduleRefresh() { if (!this.refreshFrame && !this.disposed) this.refreshFrame = requestAnimationFrame(() => { this.refreshFrame = 0; this.refresh(); }); }
  private refresh() {
    if (this.disposed || !this.active) return;
    const w = this.windows.get(this.active); if (!w?.dirty) return;
    // Store notifications never tear down a focused input while the player edits it.
    if (!this.forceRefresh && w.el.contains(document.activeElement) && document.activeElement?.matches('input, select, textarea')) return;
    this.forceRefresh = false;
    w.dirty = false; const content = w.el.querySelector<HTMLElement>('.pc-app-content')!, top = content.scrollTop;
    w.app.render(content); w.app.bindTrade(content); content.scrollTop = top;
  }
  dispose() { this.disposed = true; clearInterval(this.timer); cancelAnimationFrame(this.refreshFrame); this.abort.abort(); this.unsubscribe(); this.windows.forEach(w => w.app.suspend()); this.windows.clear(); }
}
