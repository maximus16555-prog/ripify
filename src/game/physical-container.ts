import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { OwnedCard, Product } from '../core/types';
import { PRODUCT_BY_ID } from '../data/products';
import artwork from '../data/verified/artwork.json' with { type: 'json' };
import { CONTAINER_PROFILES, photoFaceUV, type FaceQuad } from '../data/container-models';
import { createPhysicalCard } from './physical-card';

export type ContainerPhase = 'sleeve' | 'lid' | 'contents';
type PhysicalCard = ReturnType<typeof createPhysicalCard>;

/** Presentation only. Inventory ownership and fulfillment remain in GameStore.
 * Components have real wall thickness and open interiors, not photo-covered cubes. */
export class PhysicalContainer {
  readonly group = new THREE.Group();
  readonly sleeve = new THREE.Group();
  readonly lid = new THREE.Group();
  readonly contents = new THREE.Group();
  readonly packs = new THREE.Group();
  readonly promos = new THREE.Group();
  readonly profile;
  readonly ready: Promise<unknown>;
  readonly missingAssets: string[] = [];
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private cards: PhysicalCard[] = [];
  private loads: Promise<unknown>[] = [];
  private disposed = false;
  private sleeveProgress = 0;
  private lidProgress = 0;
  private takeProgress = 0;
  private textureByUrl = new Map<string, THREE.Texture>();
  private cancelLoads = new Set<()=>void>();

  constructor(readonly product: Product, private cardFactory: (owned:OwnedCard)=>PhysicalCard = createPhysicalCard) {
    const profile = CONTAINER_PROFILES[product.code];
    if (!profile) throw new Error('Physical construction is not available for this product');
    this.profile = profile;
    this.group.name = 'physical-container'; this.group.userData.productId = product.code;
    this.sleeve.name = 'outer-sleeve'; this.lid.name = 'box-lid';
    this.contents.name = 'product-contents'; this.packs.name = 'unopened-packs'; this.promos.name = 'exact-promos';
    this.group.add(this.sleeve, this.lid, this.contents);
    this.contents.add(this.packs);
    const { width:w, height:h, depth:d } = profile;
    const shell = this.material(profile.shell), lining = this.material(profile.lining);
    const seam = this.material('#a89c88');
    const wall = .035, trayHeight = profile.construction === 'sleeve-lift' ? h-.65 : h-.08;
    const base = new THREE.Group(); base.name = 'open-tray'; this.group.add(base);
    this.box(base, w, wall, d, 0, wall/2, 0, shell);
    this.box(base, w-wall*2, .012, d-wall*2, 0, wall+.006, 0, lining);
    this.box(base, w, trayHeight, wall, 0, trayHeight/2, d/2-wall/2, shell);
    this.box(base, w, trayHeight, wall, 0, trayHeight/2, -d/2+wall/2, shell);
    this.box(base, wall, trayHeight, d-wall*2, -w/2+wall/2, trayHeight/2, 0, shell);
    this.box(base, wall, trayHeight, d-wall*2, w/2-wall/2, trayHeight/2, 0, shell);
    // Inner liners and rolled cardboard rims provide thickness at an open edge.
    this.box(base, w-.09, .018, .018, 0, trayHeight, d/2-.04, seam);
    this.box(base, w-.09, .018, .018, 0, trayHeight, -d/2+.04, seam);
    this.box(base, .018, .018, d-.08, -w/2+.04, trayHeight, 0, seam);
    this.box(base, .018, .018, d-.08, w/2-.04, trayHeight, 0, seam);
    if (profile.construction === 'sleeve-lift') {
      // The printed outer sleeve is open at BOTH ends and slides along X.
      this.box(this.sleeve, w+.045, h, wall, 0, h/2, d/2+.03, lining);
      this.box(this.sleeve, w+.045, h, wall, 0, h/2, -d/2-.03, lining);
      this.box(this.sleeve, w+.045, wall, d+.09, 0, h+.012, 0, lining);
      this.box(this.sleeve, w+.045, wall, d+.09, 0, .012, 0, lining);
      this.artFace(this.sleeve, w+.045, h, [0,h/2,d/2+.05], [0,0,0], product.artwork, profile.front, 'verified-front');
      // Inner-box surface art is not verified by the outer retail photo;
      // keep it neutral instead of compressing the sleeve art onto the tray.
      this.lid.position.y = trayHeight-.025;
      this.box(this.lid, w+.055, .04, d+.055, 0, .675, 0, shell);
      this.box(this.lid, w+.055, .69, wall, 0, .345, d/2+.01, shell);
      this.box(this.lid, w+.055, .69, wall, 0, .345, -d/2-.01, shell);
      this.box(this.lid, wall, .69, d, -w/2-.01, .345, 0, shell);
      this.box(this.lid, wall, .69, d, w/2+.01, .345, 0, shell);
      // Neutral structural riser, not fabricated accessories.
      this.box(base, w-.15, .09, d-.15, 0, .085, 0, lining);
      this.addPacks(trayHeight-.15);
      this.contents.add(this.promos);
      const firstPack=this.packs.children[0];
      this.addPromos(firstPack.position.y+firstPack.userData.height/2-.016, false);
    } else {
      // 151 UPC: rear hinge, not a drawer and not a lift-off ETB lid.
      this.sleeve.visible = false;
      this.lid.position.set(0, h, -d/2);
      this.box(this.lid, w+.035, .065, d+.035, 0, .025, d/2, shell);
      // The retail photo shows the broad printed case face upright. On the
      // tabletop that face is the exterior TOP, not stretched onto a thin wall.
      this.artFace(this.lid, w, d, [0,.061,d/2], [-Math.PI/2,0,0], product.artwork, profile.front, 'verified-cover');
      this.artFace(base, d, h-.08, [-w/2-.002,(h-.08)/2,0], [0,-Math.PI/2,0], product.artwork, profile.left, 'verified-left');
      this.box(this.lid, w-.08, .018, d-.08, 0, -.017, d/2, lining);
      this.box(base, .045, h-.12, d-.08, -.49, (h-.12)/2+.05, 0, lining);
      this.box(base, .045, h-.12, d-.08, .49, (h-.12)/2+.05, 0, lining);
      // Spine covering the correct back pivot.
      this.box(base, w, .05, .06, 0, h-.02, -d/2, seam);
      this.addPacks(h-.18);
      this.lid.add(this.promos);
      this.addPromos(0, true);
    }
    this.ready = Promise.allSettled(this.loads);
    this.setProgress('sleeve', 0); this.setProgress('lid', 0);
  }

  private material(color: string, metalness = 0) {
    const material = new THREE.MeshStandardMaterial({color, roughness: metalness ? .48 : .83, metalness});
    this.materials.add(material); return material;
  }
  private box(parent: THREE.Object3D, w:number,h:number,d:number,x:number,y:number,z:number, material: THREE.Material) {
    const geometry = new RoundedBoxGeometry(w,h,d,1,Math.min(.012,w/4,h/4,d/4));
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry,material); mesh.position.set(x,y,z); mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }
  private texture(url?: string) {
    if (!url) return undefined;
    const existing = this.textureByUrl.get(url); if (existing) return existing;
    // Reuse each image once per product; late loads cannot resurrect disposed GPU resources.
    const texture = new THREE.Texture(); texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(texture); this.textureByUrl.set(url,texture);
    const loaded = new Promise<void>(resolve => {
      const image = new Image(); image.crossOrigin = 'anonymous';
      let finished = false;
      const done = (success:boolean) => {
        if (finished) return; finished = true; clearTimeout(timer); image.onload=image.onerror=null;this.cancelLoads.delete(cancel);
        if (!this.disposed) {
          if(success) {texture.image=image; texture.needsUpdate=true;}
          else { this.missingAssets.push(url); this.group.traverse(object=>{if(object.userData.artwork===url)object.visible=false;}); }
        }
        resolve();
      };
      const cancel=()=>{done(false);image.src='';};this.cancelLoads.add(cancel);
      const timer=setTimeout(()=>done(false),10000);
      image.onload=()=>done(true); image.onerror=()=>done(false); image.src=url;
    });
    this.loads.push(loaded); return texture;
  }
  private artFace(parent:THREE.Object3D, w:number,h:number, position:number[], rotation:number[], url:string|undefined, quad:FaceQuad|undefined, name:string) {
    const map=this.texture(url); if(!map) return;
    const geometry=new THREE.PlaneGeometry(w,h,16,16); this.geometries.add(geometry);
    const uv=geometry.attributes.uv;
    for(let i=0;i<uv.count;i++) {
      const [u,v] = quad ? photoFaceUV(quad,uv.getX(i),1-uv.getY(i)) : [uv.getX(i),uv.getY(i)];
      uv.setXY(i,u,v);
    }
    const material=new THREE.MeshStandardMaterial({map, roughness:.78, color:'#ffffff'}); this.materials.add(material);
    const mesh=new THREE.Mesh(geometry,material); mesh.name=name;
    mesh.position.fromArray(position); mesh.rotation.set(rotation[0],rotation[1],rotation[2]); mesh.receiveShadow=true;
    mesh.userData.artwork=url; mesh.userData.verifiedSurface=true; parent.add(mesh);
  }
  private addPacks(y:number) {
    const upc=this.profile.construction==='hinged-case';
    const packWidth=.79;
    const foil=this.material('#c9cecc',.3);
    const crimpGeometry=new THREE.BoxGeometry(.035,.043,.004);this.geometries.add(crimpGeometry);
    let index=0;
    for(const entry of this.product.manifest.packs) {
      const pack=PRODUCT_BY_ID.get(entry.productId)!;
      const asset=artwork.assets.find(asset=>asset.kind==='product'&&asset.id===pack.code);
      if(!asset)throw new Error('Verified pack surface dimensions unavailable');
      const packHeight=packWidth*asset.height/asset.width;
      for(let i=0;i<entry.quantity;i++,index++) {
        const group=new THREE.Group(); group.name='sealed-booster'; group.userData.productId=pack.code;
        group.userData.width=packWidth;group.userData.height=packHeight;
        this.box(group,packWidth,packHeight,.018,0,0,0,foil);
        this.artFace(group,packWidth,packHeight,[0,0,.010],[0,0,0],pack.artwork,undefined,'booster-front');
        const crimps=new THREE.InstancedMesh(crimpGeometry,foil,28);crimps.name='sealed-crimps';
        for(let j=0;j<28;j++)crimps.setMatrixAt(j,new THREE.Matrix4().makeTranslation(-.35+(j%14)*.054,(j<14?-1:1)*(packHeight/2-.024),.013));
        crimps.castShadow=true;group.add(crimps);
        group.rotation.x=upc?-Math.PI/2:0;
        const bank = upc ? index%2 : index<5?0:1;
        const level = upc ? Math.floor(index/2) : bank===0?index:index-5;
        group.position.set((bank===0?-1:1)*(upc?1.04:.53),upc?y-level*.027:packHeight/2+.13, upc?.05:-.25+level*.09);
        group.rotation.z=upc?(level%3-1)*.013:0;
        this.packs.add(group);
      }
    }
  }
  private addPromos(y:number,inLid:boolean) {
    let index=0;
    for(const entry of this.product.manifest.cards) for(let i=0;i<entry.quantity;i++,index++) {
      // A definition preview, not an awarded owned copy. Actual instances and
      // conditions are generated once by the existing atomic takeContents().
      const preview:OwnedCard={uid:`preview:${this.product.code}:${entry.cardId}:${i}`,cardId:entry.cardId,
        condition:{centering:100,corners:100,edges:100,surface:100,print:100},
        acquiredAt:0,source:this.product.code,favorite:false,status:'raw',owner:'local-player',finish:entry.finish,origin:'promo'};
      const card=this.cardFactory(preview); this.cards.push(card); this.loads.push(card.ready);
      card.group.userData.previewOnly=true; card.group.userData.cardId=entry.cardId; card.group.userData.finish=entry.finish;
      card.group.name='promo-card'; card.group.scale.setScalar(2.05);
      card.group.rotation.x=Math.PI/2;
      card.group.position.set(inLid?(index-1)*.99:0,inLid?-.044:y+.018,inLid?this.profile.depth*.52:0);
      if(!inLid) card.group.rotation.x=-Math.PI/2;
      this.promos.add(card.group);
    }
  }

  setProgress(phase:ContainerPhase,value:number) {
    const p=THREE.MathUtils.clamp(value,0,1);
    if(phase==='sleeve') this.sleeveProgress=p;
    if(phase==='lid') this.lidProgress=p;
    if(phase==='contents') this.takeProgress=p;
    const {width:w,height:h,depth:d,construction}=this.profile;
    // Slide clear first, then put the sleeve down on the desk, still visible.
    const s=this.sleeveProgress;
    const lay=Math.max(0,(s-.73)/.27)*Math.PI/2;
    this.sleeve.position.set(s*(w+1.05), Math.sin(lay)*(d/2+.08), -s*.38);
    this.sleeve.rotation.x=-lay;
    if(construction==='hinged-case') {
      this.lid.rotation.x=-this.lidProgress*1.92;
    } else {
      const l=this.lidProgress, side=THREE.MathUtils.clamp((l-.25)/.45,0,1);
      const baseHeight=h-.675;
      const lift=Math.min(1,l/.25)*.65, lower=Math.max(0,(l-.7)/.3)*(baseHeight+.65-.03);
      this.lid.position.set(-side*(w+.3),baseHeight+lift-lower,-side*.18);
    }
    const t=this.takeProgress;
    this.contents.position.set(0,Math.min(1,t/.4)*(construction==='sleeve-lift'?1.45:.6),Math.max(0,(t-.35)/.65)*(d+1));
    if(construction==='hinged-case') {
      // Promos start retained inside the actual lid and are pulled out with
      // the pack banks. Their original slot geometry never teleports.
      this.promos.position.set(0,-t*.75,t*.6);
    }
  }
  restoreOpen() { this.setProgress('sleeve',1); this.setProgress('lid',1); }
  activeObject(phase:ContainerPhase) { return phase==='sleeve'?this.sleeve:phase==='lid'?this.lid:this.contents; }
  handle(phase:ContainerPhase) {
    const {height:h,depth:d,construction}=this.profile;
    if(phase==='sleeve') return this.sleeve.localToWorld(new THREE.Vector3(0,h*.65,d/2+.06));
    if(phase==='lid') return this.lid.localToWorld(construction==='hinged-case'?new THREE.Vector3(0,.075,d*.75):new THREE.Vector3(0,.695,0));
    const first=this.packs.children[0];
    return construction==='sleeve-lift'?first.localToWorld(new THREE.Vector3(0,first.userData.height/2-.025,.018)):first.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.04,0));
  }
  dispose() {
    if(this.disposed)return; this.disposed=true;
    for(const cancel of [...this.cancelLoads])cancel();
    this.group.traverse(object=>{if(object instanceof THREE.InstancedMesh)object.dispose();});
    this.cards.forEach(card=>card.dispose()); this.geometries.forEach(g=>g.dispose());
    this.materials.forEach(m=>m.dispose()); this.textures.forEach(t=>t.dispose());
    this.group.removeFromParent();
  }
}
