import * as THREE from 'three';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { spreads } from './book-content.js';

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const controllers = [];
const dialog = document.querySelector('#focus-dialog');
let pendingOpen = false;

function pageHTML(page) {
  return '<span class="paper-label">' + page.label + '</span><h3>' + page.title.replaceAll('\n', '<br>') + '</h3>' +
    (page.subtitle ? '<p class="paper-author">' + page.subtitle + '</p>' : '') +
    page.paragraphs.map(text => '<p>' + text + '</p>').join('') + '<span class="paper-number">' + page.number + '</span>';
}
function showContent(index) {
  document.querySelector('[data-paper="left"]').innerHTML = pageHTML(spreads[index][0]);
  document.querySelector('[data-paper="right"]').innerHTML = pageHTML(spreads[index][1]);
  document.querySelector('.mobile-reading').innerHTML = spreads[index].map(page => '<article>' + pageHTML(page) + '</article>').join('');
}
showContent(0);
const textures = spreads.map(spread => spread.map(createPageTexture));

document.addEventListener('book-reader-state', event => { pendingOpen = event.detail.open; });
try {
  const model = (await new GLTFLoader().loadAsync('./furniture-odyssey.glb')).scene;
  for (const host of document.querySelectorAll('[data-viewer]')) {
    try { controllers.push(createViewer(host, model.clone(true))); }
    catch (error) { console.warn('3D view unavailable:', error); }
  }
  if (!controllers.length) throw new Error('No 3D rendering context available');
} catch (error) {
  console.warn('Keeping the original render:', error);
  dialog.classList.add('reader-fallback');
  document.addEventListener('book-reader-state', event => {
    if (event.detail.open) { showContent(0); document.querySelector('.mobile-reading').hidden = false; document.dispatchEvent(new Event('book-reader-ready')); }
  });
  document.addEventListener('book-turn-page', event => {
    showContent(event.detail.spread);
    document.dispatchEvent(new Event('book-turn-complete'));
  });
}

function createPageTexture(page) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 1536;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ede6d5'; ctx.fillRect(0, 0, 1024, 1536);
  const gradient = ctx.createLinearGradient(0, 0, 1024, 0);
  gradient.addColorStop(0, '#74645126'); gradient.addColorStop(.12, '#74645100');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 1536);
  ctx.fillStyle = '#9d593b'; ctx.font = '27px Arial'; ctx.fillText(page.label, 105, 140);
  ctx.fillStyle = '#302923'; ctx.font = '84px Georgia';
  let y = 300;
  page.title.split('\n').forEach(line => { ctx.fillText(line, 100, y); y += 92; });
  y += 45;
  if (page.subtitle) { ctx.font = '42px Georgia'; ctx.fillText(page.subtitle, 105, y); y += 95; }
  ctx.font = '42px Georgia';
  for (const paragraph of page.paragraphs) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? line + ' ' + word : word;
      if (ctx.measureText(candidate).width > 810 && line) { ctx.fillText(line, 105, y); y += 60; line = word; }
      else line = candidate;
    }
    if (line) { ctx.fillText(line, 105, y); y += 60; }
    y += 36;
  }
  ctx.fillStyle = '#8d715d'; ctx.font = '30px Arial'; ctx.fillText(page.number, 105, 1440);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createViewer(host, book) {
  const isReader = host.hasAttribute('data-reader-viewer');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = .8;
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture; scene.environmentIntensity = .35;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5c5350, .8));
  for (const [color, strength, xyz] of [[0xffeee0, 2.2, [-3.5, 6, 5]], [0xe7eeff, .8, [4, 2, 4]], [0xffffff, 1.8, [-2, 4, -3]]]) {
    const light = new THREE.DirectionalLight(color, strength); light.position.set(...xyz); scene.add(light);
  }
  const bounds = new THREE.Box3().setFromObject(book), size = bounds.getSize(new THREE.Vector3());
  book.position.sub(bounds.getCenter(new THREE.Vector3()));
  const pivot = new THREE.Group(); pivot.add(book); scene.add(pivot);
  const root = book.getObjectByName('FO_Book_ROOT');
  const frontCover = book.getObjectByName('FO_FrontCover');
  const endpaper = book.getObjectByName('FO_FrontEndpaper');
  const pageBlock = book.getObjectByName('FO_PageBlock');
  if (!root || !frontCover || !endpaper || !pageBlock) throw new Error('Book is missing a cover, endpaper, or page block');
  // Measure the exported model so its hinge and reading surfaces follow its actual proportions.
  book.updateMatrixWorld(true);
  const inverseRoot = root.matrixWorld.clone().invert();
  function boundsInRoot(part) {
    const box = new THREE.Box3();
    part.traverse(object => {
      if (!object.isMesh) return;
      object.geometry.computeBoundingBox();
      box.union(object.geometry.boundingBox.clone().applyMatrix4(inverseRoot.clone().multiply(object.matrixWorld)));
    });
    return box;
  }
  const coverBounds = boundsInRoot(frontCover), pageBounds = boundsInRoot(pageBlock);
  const endpaperBounds = boundsInRoot(endpaper);
  const coverCenter = coverBounds.getCenter(new THREE.Vector3());
  const pageCenter = pageBounds.getCenter(new THREE.Vector3());
  const pageSize = pageBounds.getSize(new THREE.Vector3());
  const closedQuaternion = root.quaternion.clone();
  const openQuaternion = new THREE.Quaternion();
  const hinge = new THREE.Group(); hinge.position.set(coverBounds.min.x, coverCenter.y, coverCenter.z); root.add(hinge);
  for (const object of [frontCover, endpaper]) {
    hinge.add(object); object.position.sub(hinge.position);
  }
  const pw = pageSize.x, ph = pageSize.y;
  const paperMaterial = texture => new THREE.MeshBasicMaterial({ map: texture, color: 0xffffff, side: THREE.FrontSide });
  const right = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), paperMaterial(textures[0][1]));
  right.position.set(pageCenter.x, pageCenter.y, pageBounds.max.z + .002); root.add(right);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), paperMaterial(textures[0][0]));
  left.position.set(pageCenter.x, pageCenter.y, endpaperBounds.min.z - .002); left.rotation.y = Math.PI;
  hinge.add(left); left.position.sub(hinge.position);
  const leaf = new THREE.Group(); leaf.position.set(pageBounds.min.x, pageCenter.y, right.position.z + .005); root.add(leaf); leaf.visible = false;
  const leafFront = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph, 20, 1), paperMaterial(textures[0][1]));
  const leafBack = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph, 20, 1), paperMaterial(textures[0][0]));
  leafFront.position.set(pw / 2, 0, .001);
  leafBack.position.set(pw / 2, 0, -.001); leafBack.rotation.y = Math.PI;
  leaf.add(leafFront, leafBack);
  book.traverse(object => {
    if (object.isMesh && object.material?.map) object.material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  });
  const camera = new THREE.PerspectiveCamera(28, 1, .1, 100);
  let closedDistance = 10, openDistance = 13;
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    closedDistance = Math.max(size.y / (2 * tangent), size.x / (2 * tangent * camera.aspect)) * 1.28;
    openDistance = Math.max(ph / (2 * tangent), pw * 2.1 / (2 * tangent * camera.aspect)) * 1.13;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  host.append(renderer.domElement); resize();
  let targetX = 0, targetY = 0, drag = null, last = performance.now(), phase = 0, idleTimer;
  let openTarget = isReader && pendingOpen ? 1 : 0, openProgress = 0, currentSpread = 0, turn = null;
  let wasReady = false;
  const clamp = THREE.MathUtils.clamp;
  const reset = () => { targetX = 0; targetY = 0; };
  const requestOpen = () => document.dispatchEvent(new CustomEvent('book-open-request', { detail: { host } }));
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  host.addEventListener('pointerdown', event => {
    if (event.button !== 0 || openTarget) return;
    const rect = host.getBoundingClientRect();
    mouse.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(mouse, camera);
    if (!ray.intersectObject(book, true).length) return;
    clearTimeout(idleTimer); host.setPointerCapture(event.pointerId); host.focus({ preventScroll: true });
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: targetX, startY: targetY, moved: false };
    host.classList.add('dragging');
  });
  host.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    targetY = clamp(drag.startY + dx * .006, -.9, .9);
    targetX = clamp(drag.startX + dy * .004, -.28, .28);
  });
  const release = event => {
    if (!drag || event.pointerId !== drag.id) return;
    const click = !drag.moved && event.type === 'pointerup';
    drag = null; host.classList.remove('dragging'); idleTimer = setTimeout(reset, 1100);
    if (click) requestOpen();
  };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) host.addEventListener(name, release);
  host.addEventListener('keydown', event => {
    if (openTarget) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); requestOpen(); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault(); clearTimeout(idleTimer);
    if (event.key === 'ArrowLeft') targetY = clamp(targetY - .15, -.9, .9);
    if (event.key === 'ArrowRight') targetY = clamp(targetY + .15, -.9, .9);
    if (event.key === 'ArrowUp') targetX = clamp(targetX - .08, -.28, .28);
    if (event.key === 'ArrowDown') targetX = clamp(targetX + .08, -.28, .28);
    if (event.key === 'Home') reset();
  });
  if (isReader) {
    document.addEventListener('book-reader-state', event => {
      openTarget = event.detail.open ? 1 : 0; reset(); resize();
      if (!openTarget && turn) { turn = null; leaf.visible = false; document.dispatchEvent(new Event('book-turn-complete')); }
      host.querySelector('.reader-pages').hidden = true;
      if (openTarget) {
        currentSpread = 0; left.material.map = textures[0][0]; right.material.map = textures[0][1];
        showContent(0);
      }
    });
    document.addEventListener('book-turn-page', event => {
      if (!openTarget || turn) return;
      const { spread: next, direction } = event.detail;
      showContent(next);
      leaf.visible = true;
      if (direction > 0) {
        leafFront.material.map = textures[currentSpread][1]; leafBack.material.map = textures[next][0];
        right.material.map = textures[next][1]; leaf.rotation.y = 0;
      } else {
        leafFront.material.map = textures[next][1]; leafBack.material.map = textures[currentSpread][0];
        left.material.map = textures[next][0]; leaf.rotation.y = -Math.PI;
      }
      turn = { next, direction, progress: 0 };
      dialog.classList.remove('pages-ready'); host.querySelector('.reader-pages').hidden = true;
    });
  }
  function positionPaper(object, side) {
    const element = host.querySelector('[data-paper="' + side + '"]');
    const a = new THREE.Vector3(-pw / 2, ph / 2, 0).applyMatrix4(object.matrixWorld).project(camera);
    const b = new THREE.Vector3(pw / 2, -ph / 2, 0).applyMatrix4(object.matrixWorld).project(camera);
    const w = host.clientWidth, h = host.clientHeight;
    const x = (Math.min(a.x, b.x) + 1) / 2 * w, y = (1 - Math.max(a.y, b.y)) / 2 * h;
    const width = Math.abs(b.x - a.x) / 2 * w, height = Math.abs(b.y - a.y) / 2 * h;
    Object.assign(element.style, { left: x + 'px', top: y + 'px', width: width + 'px', height: height + 'px', fontSize: width * .052 + 'px' });
  }
  let visible = true;
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }).observe(host);
  renderer.setAnimationLoop(now => {
    const dt = Math.min((now - last) / 1000, .05); last = now;
    if (!visible || document.hidden || (isReader && !dialog.open)) return;
    if (!document.body.classList.contains('paused') && !reducedMotion.matches) phase += dt;
    const t = phase * Math.PI / 3;
    const smooth = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * (drag ? 16 : 5));
    openProgress = reducedMotion.matches ? openTarget : THREE.MathUtils.damp(openProgress, openTarget, 5, dt);
    if (Math.abs(openProgress - openTarget) < .008) openProgress = openTarget;
    hinge.rotation.y = -Math.PI * openProgress;
    root.quaternion.copy(closedQuaternion).slerp(openQuaternion, openProgress);
    pivot.rotation.x += (targetX - pivot.rotation.x) * smooth;
    pivot.rotation.y += (targetY - pivot.rotation.y) * smooth;
    pivot.position.x = -coverBounds.min.x * openProgress;
    pivot.position.y = reducedMotion.matches ? 0 : .055 * Math.sin(t) * (1 - openProgress);
    pivot.rotation.z = reducedMotion.matches ? 0 : .008 * Math.sin(t) * (1 - openProgress);
    const distance = THREE.MathUtils.lerp(closedDistance, openDistance, openProgress);
    camera.position.set(0, distance * .196 * (1 - openProgress), distance);
    camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    if (turn) {
      turn.progress = reducedMotion.matches ? 1 : Math.min(1, turn.progress + dt / .85);
      const u = turn.progress, eased = u * u * (3 - 2 * u);
      leaf.rotation.y = turn.direction > 0 ? -Math.PI * eased : -Math.PI * (1 - eased);
      if (u === 1) {
        currentSpread = turn.next;
        left.material.map = textures[currentSpread][0]; right.material.map = textures[currentSpread][1];
        leaf.visible = false; turn = null;
        document.dispatchEvent(new Event('book-turn-complete'));
      }
    }
    scene.updateMatrixWorld(); renderer.render(scene, camera);
    if (isReader) {
      const ready = openProgress === 1 && !turn;
      host.querySelector('.reader-pages').hidden = !ready;
      dialog.classList.toggle('pages-ready', ready);
      if (ready) {
        positionPaper(left, 'left'); positionPaper(right, 'right');
        document.querySelector('.mobile-reading').hidden = false;
        if (!wasReady) document.dispatchEvent(new Event('book-reader-ready'));
      }
      wasReady = ready;
    }
  });
  host.classList.add('is-3d');
  return { reset };
}

