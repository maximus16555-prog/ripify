export class Input {
  keys = new Set<string>();
  lookX = 0; lookY = 0;
  enabled = true;
  private dragging = false;
  private cleanups: (() => void)[] = [];
  constructor(private canvas: HTMLCanvasElement, private interact: () => void, private escape: () => void, private activate: () => void, private currencyBonus: () => void = () => {}, private devPack?: (slot: 1 | 2) => void) {
    this.on(window, 'keydown', (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (this.devPack && (e.code === 'Digit1' || e.code === 'Digit2') && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && !/INPUT|SELECT|TEXTAREA/.test(target?.tagName ?? '') && !target?.isContentEditable) {
        e.preventDefault();
        if (!e.repeat) this.devPack(e.code === 'Digit1' ? 1 : 2);
        return;
      }
      if (e.code === 'KeyX' && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && !/INPUT|SELECT|TEXTAREA/.test(target?.tagName ?? '') && !target?.isContentEditable) {
        e.preventDefault();
        if (!e.repeat) this.currencyBonus();
        return;
      }
      if (e.code === 'Escape') { this.keys.clear(); this.escape(); return; }
      if (!this.enabled || /INPUT|SELECT|TEXTAREA|BUTTON/.test((e.target as HTMLElement)?.tagName)) return;
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
      if (e.code !== 'Space' || !e.repeat) this.keys.add(e.code);
      if (e.code === 'KeyE' && !e.repeat) this.interact();
    });
    this.on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    this.on(window, 'blur', () => this.clear());
    this.on(document, 'visibilitychange', () => { if (document.hidden) this.clear(); });
    this.on(canvas, 'pointerdown', (e: PointerEvent) => { if (!this.enabled) return; this.activate(); if (e.button === 0) { try { const p = canvas.requestPointerLock(); if (p) void p.catch(() => {}); } catch { /* Drag camera remains available. */ } } this.dragging = true; });
    this.on(window, 'pointerup', () => { this.dragging = false; });
    this.on(window, 'pointermove', (e: PointerEvent) => { if (this.enabled && (document.pointerLockElement === canvas || this.dragging)) { this.lookX += e.movementX; this.lookY += e.movementY; } });
    this.on(canvas, 'contextmenu', (e: Event) => e.preventDefault());
  }
  private on<T extends Event>(target: EventTarget, event: string, handler: (e: T) => void) { target.addEventListener(event, handler as EventListener); this.cleanups.push(() => target.removeEventListener(event, handler as EventListener)); }
  clear() { this.keys.clear(); this.lookX = 0; this.lookY = 0; this.dragging = false; }
  pause() { this.enabled = false; this.clear(); if (document.pointerLockElement) document.exitPointerLock(); }
  resume() { this.enabled = true; this.clear(); }
  dispose() { this.cleanups.forEach(fn => fn()); }
}
