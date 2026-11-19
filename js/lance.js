// ============================================================================
// 3D 朗基努斯之槍（兩階段漸進 LOD 加載 + 阻尼慣性拖拽 + 滾動聯動）
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const desktopQuery = window.matchMedia('(min-width: 1024px)');
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let initialized = false;

function initThreeScene() {
  if (initialized || !desktopQuery.matches) return;
  initialized = true;

  const container = document.getElementById('threejs-cross');
  if (!container) return;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 0, 29);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const resizeRenderer = () => {
    const rect = container.getBoundingClientRect();
    const size = Math.max(240, Math.round(Math.min(rect.width, rect.height)));
    renderer.setSize(size, size, false);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
  };
  resizeRenderer();
  new ResizeObserver(resizeRenderer).observe(container);

  // 燈光：主光 + 輪廓背光 + 柔和環境光，突出金屬螺旋質感
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
  keyLight.position.set(6, 12, 10);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xffccd2, 1.55);
  rimLight.position.set(-10, -4, -8);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
  fillLight.position.set(-6, 6, 8);
  scene.add(fillLight);

  const ambient = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambient);

  // 朗基努斯深紅金屬材質
  const lanceMaterial = new THREE.MeshStandardMaterial({
    color: 0x850918,
    emissive: 0x1c0205,
    metalness: 0.42,
    roughness: 0.42,
  });

  const pivot = new THREE.Group();
  pivot.rotation.z = -0.14;
  scene.add(pivot);

  let modelLoaded = false;
  let activeModel = null;
  let sharedCenter = null;

  const prepareModel = (model) => {
    model.traverse((child) => {
      if (child.isMesh) {
        child.geometry.computeVertexNormals();
        child.material = lanceMaterial;
      }
    });

    // 粗模與細模共用同一個中心偏移量，替換時零位移跳動
    if (!sharedCenter) {
      const box = new THREE.Box3().setFromObject(model);
      sharedCenter = box.getCenter(new THREE.Vector3());
    }
    model.position.sub(sharedCenter);
    model.scale.setScalar(1.55);
    return model;
  };

  const mountModel = (nextModel) => {
    const prevModel = activeModel;
    pivot.add(nextModel);
    activeModel = nextModel;

    if (prevModel) {
      pivot.remove(prevModel);
      prevModel.traverse((child) => {
        if (child.isMesh && child.geometry) {
          child.geometry.dispose();
        }
      });
    }

    if (!modelLoaded) {
      modelLoaded = true;
      container.classList.add('is-ready');
    }
  };

  const loader = new GLTFLoader();

  const loadHighDetail = () => {
    if (navigator.connection && navigator.connection.saveData) return;
    loader.load('resource/lance-of-longinus-high.glb', (gltf) => {
      mountModel(prepareModel(gltf.scene));
    });
  };

  // 兩階段漸進加載：先秒開 69KB 粗模，再於背景靜默下載 3.1MB 精模並無縫替換
  loader.load(
    'resource/lance-of-longinus-low.glb',
    (gltf) => {
      mountModel(prepareModel(gltf.scene));
      loadHighDetail();
    },
    undefined,
    () => {
      loadHighDetail();
    }
  );

  // 阻尼慣性拖拽 + 滾動聯動
  let isDragging = false;
  let prevX = 0;
  let prevY = 0;
  let velX = 0;
  let velY = 0;
  let userRotX = 0;
  let userRotY = 0;
  let autoSpinY = 0;
  let autoRotate = true;
  let resumeTimer = null;
  let targetScrollRatio = 0;
  let smoothScrollRatio = 0;

  const updateScrollTarget = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    targetScrollRatio = scrollable > 0 ? window.scrollY / scrollable : 0;
  };
  window.addEventListener('scroll', updateScrollTarget, { passive: true });
  updateScrollTarget();

  container.addEventListener('pointerdown', (e) => {
    isDragging = true;
    autoRotate = false;
    clearTimeout(resumeTimer);
    prevX = e.clientX;
    prevY = e.clientY;
    velX = 0;
    velY = 0;
    container.classList.add('is-dragging');
    container.setPointerCapture(e.pointerId);
  });

  container.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - prevX;
    const dy = e.clientY - prevY;
    prevX = e.clientX;
    prevY = e.clientY;

    velY = dx * 0.009;
    velX = dy * 0.009;
    userRotY += velY;
    userRotX += velX;
  });

  const endDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    container.classList.remove('is-dragging');
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      if (!isDragging) autoRotate = true;
    }, 1200);
  };

  container.addEventListener('pointerup', endDrag);
  container.addEventListener('pointercancel', endDrag);

  const animate = () => {
    requestAnimationFrame(animate);
    if (!modelLoaded || !desktopQuery.matches) return;

    const reduceMotion = reducedMotionQuery.matches;

    if (!isDragging) {
      userRotY += velY;
      userRotX += velX;
      velX *= 0.93;
      velY *= 0.93;

      if (autoRotate && !reduceMotion) {
        autoSpinY += 0.0045;
      }
    }

    if (!reduceMotion) {
      smoothScrollRatio += (targetScrollRatio - smoothScrollRatio) * 0.08;
    }

    const scrollTwistY = reduceMotion ? 0 : smoothScrollRatio * Math.PI * 1.1;
    const scrollTiltZ = reduceMotion ? -0.14 : -0.14 + smoothScrollRatio * 0.28;

    pivot.rotation.y = autoSpinY + userRotY + scrollTwistY;
    pivot.rotation.x = userRotX + (reduceMotion ? 0 : Math.sin(autoSpinY * 0.6) * 0.08);
    pivot.rotation.z = scrollTiltZ;

    renderer.render(scene, camera);
  };
  animate();
}

initThreeScene();
desktopQuery.addEventListener('change', initThreeScene);
