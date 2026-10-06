import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Product, Settings } from '../core/types';
import { PhysicalContainer, type ContainerPhase } from '../game/physical-container';

let parkedRenderer: THREE.WebGLRenderer | undefined;
export function disposeContainerResources() {
  parkedRenderer?.dispose(); parkedRenderer?.forceContextLoss(); parkedRenderer=undefined;
}

/** One reusable context, no idle animation loop, no retained product textures.
 * Dragging raycasts the real active component; camera orbit uses right-drag.
 * Each committed gesture finishes physically before its inventory callback. */
export class ContainerView {
  readonly model:PhysicalContainer;
  readonly canvas:HTMLCanvasElement;
  private renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(34,1,.05,50);
  private raycaster=new THREE.Raycaster();
  private observer:ResizeObserver;
  private abort=new AbortController();
  private frame=0;
  private disposed=false;
  private yaw=.22;
  private elevation=.65;
  private phase:ContainerPhase;
  private progress=0;
  private drag?:{id:number;x:number;y:number;orbit:boolean;start:number;axisX:number;axisY:number;span:number};
  private animation?:{from:number;to:number;started:number;duration:number;commit:boolean};
  private lastSound=0;
  private renders=0;
  private table:THREE.Mesh;
  private mat:THREE.Mesh;
  private shadowLight:THREE.DirectionalLight;

  constructor(host:HTMLElement,product:Product,settings:Settings,open:boolean,
    private changed:(phase:ContainerPhase)=>void,
    private commit:(phase:ContainerPhase)=>boolean,
    private sound:()=>void,private warning:(text:string)=>void) {
    if(parkedRenderer?.getContext().isContextLost())disposeContainerResources();
    this.renderer=parkedRenderer??new THREE.WebGLRenderer({antialias:true,alpha:true}); parkedRenderer=undefined;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure=1.2;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,settings.graphics==='Low'?1:1.5)*settings.renderScale);
    this.renderer.shadowMap.enabled=settings.graphics!=='Low'; this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.canvas=this.renderer.domElement; this.canvas.className='container-canvas'; this.canvas.tabIndex=0;
    for(const key of Object.keys(this.canvas.dataset))delete this.canvas.dataset[key];
    this.canvas.setAttribute('aria-label','Physical unboxing. Drag the packaging to open. Right-drag or arrow keys to rotate the view.');
    host.append(this.canvas);
    this.model=new PhysicalContainer(product); this.scene.add(this.model.group);
    this.phase=open?'contents':this.model.profile.construction==='sleeve-lift'?'sleeve':'lid';
    if(open)this.model.restoreOpen();
    this.table=new THREE.Mesh(new THREE.BoxGeometry(12,.09,9),new THREE.MeshStandardMaterial({color:'#8f7152',roughness:.92}));
    this.table.position.y=-.065; this.table.receiveShadow=true; this.scene.add(this.table);
    this.mat=new THREE.Mesh(new RoundedBoxGeometry(7,.024,4.8,3,.011),new THREE.MeshStandardMaterial({color:'#35483f',roughness:.98}));
    this.mat.position.set(0,-.008,0);this.mat.receiveShadow=true;this.scene.add(this.mat);
    this.scene.add(new THREE.HemisphereLight('#fff8ec','#646c60',2.1));
    this.shadowLight=new THREE.DirectionalLight('#fff2d6',2.8); this.shadowLight.position.set(-3,7,4); this.shadowLight.castShadow=true;
    this.shadowLight.shadow.mapSize.set(settings.graphics==='High'?1024:512,settings.graphics==='High'?1024:512);
    Object.assign(this.shadowLight.shadow.camera,{left:-6,right:6,top:5,bottom:-5,near:.5,far:16});
    this.shadowLight.shadow.bias=-.0003; this.shadowLight.shadow.normalBias=.02; this.scene.add(this.shadowLight);
    const fill=new THREE.DirectionalLight('#dcecff',.8); fill.position.set(4,3,-5); this.scene.add(fill);
    const options={signal:this.abort.signal};
    this.canvas.addEventListener('contextmenu',e=>e.preventDefault(),options);
    this.canvas.addEventListener('pointerdown',e=>this.down(e),options);
    this.canvas.addEventListener('pointermove',e=>this.move(e),options);
    this.canvas.addEventListener('pointerup',e=>this.up(e),options);
    const cancel=(e:PointerEvent)=>{if(this.drag?.id===e.pointerId)this.cancelDrag();};
    this.canvas.addEventListener('pointercancel',cancel,options);this.canvas.addEventListener('lostpointercapture',cancel,options);
    this.canvas.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(e.key))return;
      e.preventDefault();e.stopPropagation();
      if(e.key==='Enter'||e.key===' '){if(!e.repeat)this.complete();return;}
      if(e.key==='ArrowLeft')this.yaw-=.16;if(e.key==='ArrowRight')this.yaw+=.16;
      if(e.key==='ArrowUp')this.elevation=Math.min(1.25,this.elevation+.08);
      if(e.key==='ArrowDown')this.elevation=Math.max(.2,this.elevation-.08);
      this.invalidate();
    },options);
    window.addEventListener('blur',()=>this.cancelDrag(),options);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.cancelDrag();cancelAnimationFrame(this.frame);this.frame=0;}else {if(this.animation){this.animation.from=this.progress;this.animation.started=performance.now();}this.invalidate();}},options);
    this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.warning('Preview interrupted. Close and reopen the product.');},options);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.resize();
    this.changed(this.phase);
    void this.model.ready.then(()=>{if(this.disposed)return;if(this.model.missingAssets.length)this.warning('Some packaging artwork is unavailable.');else if(product.manifest.cards.some(card=>card.finish==='metal'))this.warning('Metal Mew ex artwork unavailable.');this.canvas.dataset.loaded='true';this.invalidate();});
  }
  private resize(){const w=this.canvas.clientWidth,h=this.canvas.clientHeight;if(!w||!h||this.disposed)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.invalidate();}
  private updateCamera(){
    const h=this.model.profile.height;
    const target=new THREE.Vector3(0,this.model.profile.construction==='sleeve-lift'?.9:1.25,0);
    const radius=Math.max(h===.82?8.5:7.1, 5.5/this.camera.aspect);
    this.camera.position.set(Math.sin(this.yaw)*Math.cos(this.elevation)*radius,target.y+Math.sin(this.elevation)*radius,Math.cos(this.yaw)*Math.cos(this.elevation)*radius);
    this.camera.lookAt(target);this.camera.updateMatrixWorld();
  }
  private down(e:PointerEvent){
    if(this.drag||this.animation||!e.isPrimary||!(e.button===0||e.button===2))return;
    const rect=this.canvas.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2),this.camera);
    if(e.button===0){
      const hits=this.raycaster.intersectObject(this.model.group,true);
      const active=this.model.activeObject(this.phase);
      const first=hits.find(hit=>hit.object.visible);
      if(import.meta.env.DEV)this.canvas.dataset.hit=first?.object.name||first?.object.parent?.name||'none';
      let object:THREE.Object3D|null=first?.object??null;
      while(object&&object!==active)object=object.parent;
      if(!object)return;
    }
    e.preventDefault();this.canvas.focus({preventScroll:true});this.canvas.setPointerCapture(e.pointerId);
    this.model.group.updateMatrixWorld(true);
    // Project the construction's real movement axis into the current camera.
    // Screen-pixel thresholds therefore remain meaningful at any viewport/angle.
    const origin=this.model.handle(this.phase);
    const delta=this.phase==='sleeve'?new THREE.Vector3(2.35,0,0):this.phase==='contents'?new THREE.Vector3(0,.85,2):new THREE.Vector3(0,1.7,0);
    const a=origin.clone().project(this.camera),b=origin.clone().add(delta).project(this.camera);
    // Contents lift over the rim before coming forward. Mapping this compound
    // path to a single projected vector can almost cancel its vertical axis;
    // keep the advertised "pull toward you" gesture stable while orbiting.
    const x=this.phase==='contents'?0:(b.x-a.x)*rect.width/2;
    const y=this.phase==='contents'?(this.model.profile.construction==='sleeve-lift'?-1:1):-(b.y-a.y)*rect.height/2;
    const span=this.phase==='contents'?THREE.MathUtils.clamp(rect.height*.3,140,220):Math.max(110,Math.hypot(x,y));
    const length=Math.hypot(x,y)||1;
    if(import.meta.env.DEV)this.canvas.dataset.dragAxis=`${x/length},${y/length},${span}`;
    this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,orbit:e.button===2,start:this.progress,axisX:x/length,axisY:y/length,span};
    this.canvas.classList.add('dragging');
  }
  private move(e:PointerEvent){
    const drag=this.drag;if(!drag||drag.id!==e.pointerId)return;
    if(drag.orbit){this.yaw-=(e.clientX-drag.x)*.007;this.elevation=THREE.MathUtils.clamp(this.elevation+(e.clientY-drag.y)*.005,.2,1.25);drag.x=e.clientX;drag.y=e.clientY;}
    else{
      this.progress=THREE.MathUtils.clamp(drag.start+((e.clientX-drag.x)*drag.axisX+(e.clientY-drag.y)*drag.axisY)/drag.span,0,1);
      this.model.setProgress(this.phase,this.progress);
      if(performance.now()-this.lastSound>130&&this.progress>.015){this.lastSound=performance.now();this.sound();}
    }
    this.invalidate();
  }
  private up(e:PointerEvent){
    if(this.drag?.id!==e.pointerId)return;
    const orbit=this.drag.orbit;this.release();
    if(!orbit)this.animate(this.progress>=.78?1:0,this.progress>=.78);
  }
  private release(){const id=this.drag?.id;this.drag=undefined;this.canvas.classList.remove('dragging');if(id!==undefined&&this.canvas.hasPointerCapture(id))this.canvas.releasePointerCapture(id);}
  private cancelDrag(){if(!this.drag)return;const orbit=this.drag.orbit;this.release();if(!orbit)this.animate(0,false);}
  private animate(to:number,commit:boolean){this.animation={from:this.progress,to,commit,started:performance.now(),duration:commit?450:240};this.invalidate();}
  complete(){if(this.animation||this.drag||this.disposed)return;this.sound();this.animate(1,true);}
  rotate(direction:number){if(this.drag)return;this.yaw+=direction*.35;this.invalidate();}
  private invalidate(){
    if(this.disposed||this.frame||document.hidden)return;
    this.frame=requestAnimationFrame(now=>{
      this.frame=0;if(this.disposed)return;
      const animation=this.animation;
      if(animation){const t=THREE.MathUtils.clamp((now-animation.started)/animation.duration,0,1),eased=1-Math.pow(1-t,3);this.progress=THREE.MathUtils.lerp(animation.from,animation.to,eased);this.model.setProgress(this.phase,this.progress);
        if(t===1){this.animation=undefined;if(animation.commit){
          const phase=this.phase;
          if(phase==='sleeve'){this.phase='lid';this.progress=0;this.changed(this.phase);}
          else if(this.commit(phase)&&!this.disposed){if(phase==='lid'){this.phase='contents';this.progress=0;this.changed(this.phase);}}
          else if(!this.disposed){this.progress=0;this.model.setProgress(phase,0);this.warning('Could not complete this interaction. Try again.');}
        }}
      }
      if(this.disposed)return;
      this.updateCamera();this.model.group.updateMatrixWorld(true);
      this.renderer.render(this.scene,this.camera);
      this.canvas.dataset.frames=String(++this.renders);
      const handle=this.model.handle(this.phase).project(this.camera);
      this.canvas.dataset.phase=this.phase;this.canvas.dataset.progress=String(this.progress);
      // Normalized physical handle projection also supports reproducible QA.
      this.canvas.dataset.handleX=String((handle.x+1)/2);this.canvas.dataset.handleY=String((1-handle.y)/2);
      this.canvas.dataset.construction=this.model.profile.construction;
      this.canvas.dataset.packCount=String(this.model.packs.children.length);this.canvas.dataset.promoCount=String(this.model.promos.children.length);
      this.canvas.dataset.lidAngle=String(this.model.lid.rotation.x);this.canvas.dataset.yaw=String(this.yaw);
      this.canvas.dataset.drawCalls=String(this.renderer.info.render.calls);
      if(this.animation)this.invalidate();
    });
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.abort.abort();this.observer.disconnect();cancelAnimationFrame(this.frame);this.release();
    this.model.dispose();this.table.geometry.dispose();(this.table.material as THREE.Material).dispose();this.mat.geometry.dispose();(this.mat.material as THREE.Material).dispose();this.shadowLight.shadow.map?.dispose();this.shadowLight.shadow.mapPass?.dispose();
    this.renderer.renderLists.dispose();this.canvas.remove();
    disposeContainerResources();parkedRenderer=this.renderer;
  }
}
