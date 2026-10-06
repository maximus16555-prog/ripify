export function icon(name: string) {
  const paths: Record<string, string> = {
    settings: '<path d="m9 3 .6 2a7 7 0 0 1 4.8 0l.6-2 3 1.7-1.4 1.6a7 7 0 0 1 2.4 4.1l2 .6v3l-2 .6a7 7 0 0 1-2.4 4.1l1.4 1.6-3 1.7-.6-2a7 7 0 0 1-4.8 0L9 21l-3-1.7 1.4-1.6A7 7 0 0 1 5 13.6l-2-.6v-3l2-.6a7 7 0 0 1 2.4-4.1L6 4.7z"/><circle cx="12" cy="11.5" r="2.5"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M12 6v12m3-10h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9"/>',
    pack: '<path d="M6 3h12v18H6zM6 6h12M6 18h12"/><path d="m12 9 2 3-2 3-2-3z"/>',
    binder: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 3v18m3-14h5m-5 4h5m-5 4h5"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    home: '<path d="m3 11 9-8 9 8M5 9v12h14V9m-10 12v-7h6v7"/>',
    sound: '<path d="M4 9h4l5-5v16l-5-5H4zM16 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2l-1.5 1v2m0 3v.1"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.arrow}</svg>`;
}
