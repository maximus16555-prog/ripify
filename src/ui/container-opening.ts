import './opening.css';
import './container-opening.css';
import { escapeHtml } from '../assets/cards';
import { PRODUCT_BY_ID } from '../data/products';
import type { GameStore } from '../core/store';
import type { GameAudio } from '../game/audio';
import { ContainerView } from './container-view';
import type { ContainerPhase } from '../game/physical-container';

/** Physical presentation delegates all persistent ownership changes to GameStore. */
export class ContainerOpening {
  private view?: ContainerView;
  constructor(private root: HTMLElement, private store: GameStore, private audio: GameAudio, private close: () => void, private notify: (text: string) => void) {
    const opening=store.state.containerOpening;
    const owned=store.state.sealedProducts.find(p=>p.uid===opening?.productUid);
    const product=owned&&PRODUCT_BY_ID.get(owned.productId);
    if(!opening||!product){close();return;}
    root.className='modal-root opening-root';
    root.innerHTML=`<section class="opening-stage physical-container-stage" role="dialog" aria-modal="true" aria-label="Open sealed product"><header class="opening-header"><div><span class="eyebrow">OPENING DESK</span><h1>${escapeHtml(product.name)}</h1></div><button class="text-button" data-close>Back <kbd>Esc</kbd></button></header><div class="container-viewport"></div><footer class="container-controls"><div class="container-hint" aria-live="polite"></div><div><button class="text-button" data-orbit="-1" aria-label="View from left">↶</button><button class="gesture-alternative" data-action></button><button class="text-button" data-orbit="1" aria-label="View from right">↷</button></div><small data-container-info>${escapeHtml(product.subtitle)}</small><small class="container-warning" role="status"></small></footer></section>`;
    const changed=(phase:ContainerPhase)=>{
      root.querySelector('.container-hint')!.textContent=phase==='sleeve'?'Slide the sleeve to the right':phase==='lid'?'Lift the lid':product.type==='etb'?'Lift out the contents':'Pull the contents toward you';
      root.querySelector('[data-action]')!.textContent=phase==='sleeve'?'Slide sleeve':phase==='lid'?'Open lid':'Take contents';
      root.querySelector('[data-close]')!.innerHTML=`${store.state.containerOpening?.stage==='sealed'?'Keep sealed':'Back'} <kbd>Esc</kbd>`;
    };
    const packCount=product.manifest.packs.reduce((n,p)=>n+p.quantity,0),promoCount=product.manifest.cards.reduce((n,c)=>n+c.quantity,0);
    try {
      this.view=new ContainerView(root.querySelector('.container-viewport')!,product,store.state.settings,opening.stage==='contents',changed,phase=>{
        if(phase==='lid'){const lifted=store.liftLid();if(lifted)this.audio.play('crinkle');return lifted;}
        if(phase==='contents'&&store.takeContents()){
          this.audio.play('swipe');this.notify(`${packCount} unopened packs · ${promoCount} promo${promoCount===1?'':'s'} received`);this.close();return true;
        }
        return false;
      },()=>{this.audio.unlock();this.audio.play('crinkle');},text=>{root.querySelector('.container-warning')!.textContent=text;});
    } catch {
      root.querySelector('.container-hint')!.textContent='The 3D preview could not start. Close and try again.';
      (root.querySelector('[data-action]') as HTMLButtonElement).disabled=true;
    }
    root.querySelector<HTMLButtonElement>('[data-close]')!.onclick=()=>{if(store.state.containerOpening?.stage==='sealed')store.keepSealed();close();};
    root.querySelector<HTMLButtonElement>('[data-action]')!.onclick=()=>this.view?.complete();
    root.querySelectorAll<HTMLButtonElement>('[data-orbit]').forEach(button=>button.onclick=()=>this.view?.rotate(Number(button.dataset.orbit)));
  }
  dispose(){this.view?.dispose();this.view=undefined;this.root.replaceChildren();}
}
