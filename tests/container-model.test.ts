import { describe,it,expect,vi,afterEach } from 'vitest';
import * as THREE from 'three';
import { PhysicalContainer } from '../src/game/physical-container';
import { createPhysicalCard } from '../src/game/physical-card';
import { CONTAINER_PROFILES,photoFaceUV } from '../src/data/container-models';
import { PRODUCT_BY_ID } from '../src/data/products';
// Geometry checks do not need network, DOM drawing or a WebGL context.
class ImageFixture { crossOrigin='';onload:(()=>void)|null=null;onerror:(()=>void)|null=null;set src(_:string){queueMicrotask(()=>this.onload?.());} }
const textures={face:()=>new THREE.Texture(),label:()=>new THREE.Texture()};
const model=(id:string)=>{vi.stubGlobal('Image',ImageFixture);return new PhysicalContainer(PRODUCT_BY_ID.get(id)!,card=>createPhysicalCard(card,textures));};
afterEach(()=>vi.unstubAllGlobals());
describe('physical sealed product geometry',()=>{
  it('maps each photographed face to its exact quad without corner wrapping',()=>{
    for(const profile of Object.values(CONTAINER_PROFILES))for(const quad of [profile.front,profile.left]) {
      [[0,0],[1,0],[1,1],[0,1]].forEach(([x,y],i)=>{
        const uv=photoFaceUV(quad,x,y);expect(uv[0]).toBeCloseTo(quad[i*2],6);expect(uv[1]).toBeCloseTo(1-quad[i*2+1],6);
      });
      expect(photoFaceUV(quad,.5,.5).every(Number.isFinite)).toBe(true);
    }
  });
  it.each(['151-etb','151-upc'])('%s contains one physical pack per manifest entry and only exact promo definitions',async id=>{
    const item=model(id),p=PRODUCT_BY_ID.get(id)!;
    await item.ready;
    expect(item.packs.children).toHaveLength(p.manifest.packs.reduce((n,e)=>n+e.quantity,0));
    expect(item.packs.children.every(pack=>Math.abs(pack.userData.width/pack.userData.height-.553)<.00001)).toBe(true);
    expect(item.promos.children.map(c=>[c.userData.cardId,c.userData.finish])).toEqual(p.manifest.cards.flatMap(e=>Array.from({length:e.quantity},()=>[e.cardId,e.finish])));
    const imageFaces:THREE.Object3D[]=[];item.group.traverse(o=>{if(o.userData.artwork===p.artwork)imageFaces.push(o);});
    expect(imageFaces.map(o=>o.name).sort()).toEqual(id==='151-etb'?['verified-front']:['verified-cover','verified-left']);
    expect(item.promos.children.every(o=>o.userData.previewOnly)).toBe(true);
    item.dispose();item.dispose();
  });
  it('keeps the UPC rear hinge fixed and splits sixteen packs into eight/eight banks',async()=>{
    const item=model('151-upc');await item.ready;const pivot=item.lid.position.clone();
    for(const p of [0,.2,.5,.8,1]){item.setProgress('lid',p);expect(item.lid.position.equals(pivot)).toBe(true);expect(item.lid.rotation.x).toBeCloseTo(-p*1.92);}
    expect(item.packs.children.filter(o=>o.position.x<0)).toHaveLength(8);expect(item.packs.children.filter(o=>o.position.x>0)).toHaveLength(8);
    expect(item.promos.parent).toBe(item.lid);item.dispose();
  });
  it('clears the ETB rim before parking its lid or sliding contents across the front wall',async()=>{
    const item=model('151-etb');await item.ready;const rim=item.profile.height-.65;
    for(let i=1;i<=20;i++){
      const p=i/20;item.setProgress('lid',p);item.group.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(item.lid);
      if(bounds.max.x>-item.profile.width/2)expect(bounds.min.y).toBeGreaterThanOrEqual(rim-.04);
    }
    item.restoreOpen();
    for(let i=1;i<=20;i++){
      item.setProgress('contents',i/20);item.group.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(item.packs);
      if(bounds.max.z>item.profile.depth/2)expect(bounds.min.y).toBeGreaterThan(rim);
    }
    item.group.updateMatrixWorld(true);expect(new THREE.Box3().setFromObject(item.sleeve).min.y).toBeGreaterThanOrEqual(0);
    item.dispose();
  });
});
