import * as THREE from 'three';
import type { OwnedCard } from '../core/types';
import { createPhysicalCard, CARD_SIZE, type PhysicalCard } from './physical-card';
export const SLAB_FRACTURES = [.28, .43, .56] as const;
function clipped(source: THREE.BufferGeometry, keepCorner: boolean, ox = 0, oy = 0, mirrored = false) {
  const triangles = source.index ? source.toNonIndexed() : source;
  const pos = triangles.getAttribute('position'), uv = triangles.getAttribute('uv'), out: number[] = [], uvs: number[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    let poly = [0, 1, 2].map(n => [pos.getX(i+n), pos.getY(i+n), pos.getZ(i+n), uv?.getX(i+n) ?? 0, uv?.getY(i+n) ?? 0]);
    const result: number[][] = [], distance = (v: number[]) => (keepCorner ? 1 : -1) * ((mirrored ? -v[0] : v[0]) + ox + v[1] + oy - .435);
    for (let j = 0; j < poly.length; j++) { const a = poly[j], b = poly[(j+1)%poly.length], da = distance(a), db = distance(b); if (da >= 0) result.push(a); if ((da >= 0) !== (db >= 0)) { const t = da / (da-db); result.push(a.map((x,k) => x+(b[k]-x)*t)); } }
    poly = result;
    for (let j = 1; j+1 < poly.length; j++) for (const v of [poly[0],poly[j],poly[j+1]]) { const x = v[0] + (Math.abs(distance(v)) < 1e-6 ? Math.sin((v[1]+oy)*417)*.0016 : 0); out.push(x,v[1],v[2]); uvs.push(...v.slice(3)); }
  }
  if (triangles !== source) triangles.dispose();
  const g = new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(out,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); g.computeVertexNormals(); return g;
}
/** Pre-fractured rigid plastic. Saved inventory/condition is never touched by presentation. */
export class SlabCrackPresentation {
  readonly raw: PhysicalCard;
  private front = new THREE.Group(); private rear = new THREE.Group();
  private fragments: THREE.Group[] = []; private cracks: THREE.Line[] = []; private intact: THREE.Object3D[] = []; private broken: THREE.Object3D[] = [];
  private failed: boolean; private contact?: THREE.Mesh;
  private tool = new THREE.Group();
  constructor(private slab: PhysicalCard, owned: OwnedCard, factories?: Parameters<typeof createPhysicalCard>[1]) {
    this.raw = createPhysicalCard(owned, factories); this.raw.group.visible = false;
    this.failed = owned.crackHistory?.at(-1)?.outcome === 'damaged';
    const rim = slab.group.getObjectByName('slab-rim') as THREE.Mesh;
    for (const sign of [-1,1]) {
      const parent = sign > 0 ? this.front : this.rear, half = new THREE.Mesh(rim.geometry.clone(),rim.material);
      half.geometry.scale(1,1,.5); half.geometry.translate(0,0,sign*slab.size.depth/4); parent.add(half); this.intact.push(half);
      const main = new THREE.Mesh(clipped(half.geometry,false),half.material), chip = new THREE.Mesh(clipped(half.geometry,true),half.material);
      parent.add(main); this.broken.push(main); const shard = new THREE.Group(); shard.name = 'broken-slab-corner'; shard.add(chip); parent.add(shard); this.fragments.push(shard); this.broken.push(shard);
    }
    rim.removeFromParent(); rim.geometry.dispose();
    for (const name of ['slab-cover-front','slab-label-front','slab-cover-back','slab-label-back','slab-insert']) {
      const part = slab.group.getObjectByName(name)! as THREE.Mesh, parent = name.endsWith('front') ? this.front : this.rear;
      part.removeFromParent(); parent.add(part);
      if (name !== 'slab-insert') {
        this.intact.push(part);
        const mirrored = Math.abs(part.rotation.y) > 1;
        const main = new THREE.Mesh(clipped(part.geometry,false,part.position.x,part.position.y,mirrored),part.material), chip = new THREE.Mesh(clipped(part.geometry,true,part.position.x,part.position.y,mirrored),part.material);
        main.position.copy(part.position); main.rotation.copy(part.rotation); chip.position.copy(part.position); chip.rotation.copy(part.rotation);
        parent.add(main); this.broken.push(main); this.fragments[parent === this.front ? 1 : 0].add(chip);
      }
    }
    // Jagged fracture ridge gives the exposed plastic an irregular edge, rather than a tidy shell joint.
    const ridge = [[.118,.316],[.131,.297],[.123,.280],[.157,.281],[.167,.261],[.196,.239]].map(([x,y])=>new THREE.Vector3(x,y,.014));
    const jagged = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ridge),20,.0014,3,false),new THREE.MeshStandardMaterial({color:'#b1c5ca',roughness:.4,transparent:true,opacity:.75})); this.front.add(jagged); this.broken.push(jagged);
    const routes = [ [[.197,.305],[.174,.281],[.148,.286],[.124,.25],[.113,.211],[.078,.187],[.086,.149],[.043,.113],[-.003,.101],[-.055,.053],[-.097,.027],[-.14,-.02]], [[.124,.25],[.086,.263],[.065,.239],[.036,.232]], [[.086,.149],[.126,.118],[.117,.074],[.141,.03]], [[.043,.113],[.003,.15],[-.04,.146],[-.086,.16]] ];
    routes.forEach((route,i)=> { const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(route.map(([x,y])=>new THREE.Vector3(x,y,.0155))),new THREE.LineBasicMaterial({color:i?'#a1b6be':'#647b86',transparent:true,opacity:i?.8:.95})); line.name='slab-fracture'; line.userData.branch=i; this.front.add(line); this.cracks.push(line); });
    // Two restrained jaws visibly build pressure on the upper corner.
    for (const y of [-.007,.007]) { const jaw = new THREE.Mesh(new THREE.BoxGeometry(.047,.009,.02),new THREE.MeshStandardMaterial({color:'#535e63',metalness:.6,roughness:.35})); jaw.position.y=y; this.tool.add(jaw); }
    this.tool.position.set(.208,.312,.02); this.tool.rotation.z=.6; slab.group.add(this.tool);
    if (this.failed) {
      const d=owned.crackHistory!.at(-1)!.damage[0];
      this.contact=new THREE.Mesh(new THREE.ConeGeometry(.009,.029,3),new THREE.MeshPhysicalMaterial({color:'#bed0d3',transparent:true,opacity:.65,roughness:.3}));
      this.contact.position.set((d.x-.5)*CARD_SIZE.width,(.5-d.y)*CARD_SIZE.height-.05,.027); this.contact.rotation.z=-.6; slab.group.add(this.contact);
    }
    slab.group.add(this.front,this.rear); this.update(0);
  }
  update(progress: number) {
    const smooth=(a:number,b:number)=> {const t=THREE.MathUtils.clamp((progress-a)/(b-a),0,1);return t*t*(3-2*t);};
    const stress=smooth(.05,.28), first=smooth(.28,.43), release=smooth(.56,.8), pull=smooth(.72,1);
    this.slab.group.userData.fractureState=progress<.1?'intact':progress<.28?'stressed':progress<.43?'initial':progress<.56?'major':'broken';
    this.front.scale.z=1+stress*.04; this.front.rotation.x=-.012*stress-.32*release; this.front.rotation.z=-.13*release;
    this.front.position.set(.23*release,-.035*release,.006*stress+.1*release);
    this.rear.position.set(-.2*pull,0,-.06*release); this.rear.rotation.z=.08*pull;
    this.tool.scale.y=1-stress*.27; this.tool.position.z=.02+release*.15; this.tool.visible=progress<.79;
    for (const o of this.intact) o.visible=progress<.43; for (const o of this.broken) o.visible=progress>=.43;
    this.fragments.forEach((g,i)=>{g.position.set((.025+.03*i)*first,.018*first,.02*first*(i?1:-1));g.rotation.z=(i?-.24:.16)*first;g.rotation.x=(i?.3:-.2)*first;});
    this.cracks.forEach(line=>{ const start=.28+Number(line.userData.branch)*.045; line.geometry.setDrawRange(0,Math.floor(line.geometry.getAttribute('position').count*smooth(start,.56)));line.visible=progress>=start; });
    if(this.contact){this.contact.visible=progress>.43&&progress<.76;this.contact.position.z=.027-.026*smooth(.43,.57)+.045*pull;}
    for(const name of ['cardstock','card-front','card-back'])this.slab.group.getObjectByName(name)!.visible=pull===0;
    this.raw.group.visible=pull>0;this.raw.group.position.set(0,-.05*(1-pull),.035+.14*pull);this.raw.group.rotation.z=-.025*Math.sin(pull*Math.PI);
  }
  dispose(){this.raw.dispose();}
}
