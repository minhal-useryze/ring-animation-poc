import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

// ---- Models (add all 10 here) ----
const RING_MODELS = [
  "/models/ring1.glb",
  "/models/ring2.glb",
  "/models/ring3.glb",
  "/models/ring4.glb",
  "/models/ring5.glb",
  "/models/ring6.glb",
  "/models/ring7.glb",
  "/models/ring8.glb",
  "/models/ring9.glb",
  "/models/ring10.glb",
];

// ---- Metal presets ----
const METALS = {
  yellow: {
    label: "Yellow Gold",
    color: 0xe3bb5e,
    roughness: 0.1,
    envIntensity: 2.2,
  },
  white: {
    label: "White Gold",
    color: 0xc2c2c3,
    roughness: 0.1,
    envIntensity: 2.0,
  },
  rose: {
    label: "Rose Gold",
    color: 0xd9a483,
    roughness: 0.1,
    envIntensity: 2.1,
  },
};

const METAL_KEYS = Object.keys(METALS);

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function disposeMaterial(mat) {
  if (!mat) return;
  if (Array.isArray(mat)) return mat.forEach(disposeMaterial);
  Object.keys(mat).forEach((k) => {
    const v = mat[k];
    if (v && v.isTexture) v.dispose?.();
  });
  mat.dispose?.();
}

function isGreenish(color) {
  if (!color) return false;
  return color.g > 0.35 && color.r < 0.25 && color.b < 0.25;
}

function isBluish(color) {
  if (!color) return false;
  return color.b > 0.35 && color.r < 0.3 && color.g < 0.35;
}

export default function RingViewer({ height = 520 }) {
  const mountRef = useRef(null);

  // Random ring + random metal ONCE per mount
  const modelPath = useRef(pickRandom(RING_MODELS)).current;
  const metalKey = useRef(pickRandom(METAL_KEYS)).current;
  const metal = METALS[metalKey];

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ---- Scene ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    // ---- Camera ----
    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.01,
      1000,
    );
    camera.position.set(0, 0.6, 2.4);

    // ---- Renderer ----
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    // ✅ DULLER overall exposure
    renderer.toneMappingExposure = 0.95;

    renderer.physicallyCorrectLights = true;

    mount.appendChild(renderer.domElement);

    // ---- PMREM ----
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();

    // Metal env (NO HDR): RoomEnvironment
    const metalEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // Diamond env (HDR): created async below
    let diamondEnv = null;

    // Keep scene env null; set envMap per material
    scene.environment = null;

    // ---- Lights ----
    // ✅ DULLER lights (softer, less harsh)
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));

    const hemi = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.6);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(4, 6, 3);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xffffff, 0.9);
    rim.position.set(-2, 4, -6);
    scene.add(rim);

    // ---- Controls ----
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // ---- Loaders ----
    const gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://www.gstatic.com/draco/v1/decoders/");
    dracoLoader.setDecoderConfig({ type: "wasm" });
    gltfLoader.setDRACOLoader(dracoLoader);

    // ---- Materials ----
    // ✅ DULLER metal reflections
    const goldMat = new THREE.MeshStandardMaterial({
      color: metal.color,
      metalness: 1.0,
      roughness: metal.roughness + 0.05,
      envMapIntensity: metal.envIntensity * 0.75,
    });
    goldMat.envMap = metalEnv;
    goldMat.needsUpdate = true;

    const diamondMat = new THREE.MeshPhysicalMaterial({
      color: 0xA8A9AD,
      metalness: 0.99,
      roughness: 0.1, // adds facet contrast

      transmission: 0, // (kept same as your current code)
      ior: 2.417,
      thickness: 0.6,
      transparent: true,
      opacity: 1,

      // ✅ Slightly duller diamond reflections
      envMapIntensity: 5,

      emissive: new THREE.Color(0x3a3a3a),
      emissiveIntensity: 0.5,
    });

    // Load HDR ONLY for diamond material
    const rgbeLoader = new RGBELoader();
    rgbeLoader.load(
      "/hdr/brown_photostudio_02_4k.hdr",
      (hdr) => {
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        diamondEnv = pmrem.fromEquirectangular(hdr).texture;

        diamondMat.envMap = diamondEnv;
        diamondMat.needsUpdate = true;

        hdr.dispose();
      },
      undefined,
      () => {
        // fallback
        diamondMat.envMap = metalEnv;
        diamondMat.envMapIntensity = 6;
        diamondMat.needsUpdate = true;
      },
    );

    // ---- Load model ----
    let ringRoot = null;
    let rafId = 0;
    const clock = new THREE.Clock();

    gltfLoader.load(
      modelPath,
      (gltf) => {
        ringRoot = gltf.scene;
        scene.add(ringRoot);

        ringRoot.traverse((obj) => {
          if (!obj.isMesh) return;

          const oldMat = obj.material;
          const name = (obj.name || "").toLowerCase();

          const nameSuggestsGem =
            name.includes("gem") ||
            name.includes("stone") ||
            name.includes("diamond") ||
            name.includes("center") ||
            name.includes("mainstone");

          const oldColor = Array.isArray(oldMat)
            ? oldMat[0]?.color
            : oldMat?.color;

          const useGem = nameSuggestsGem || isBluish(oldColor);
          const useMetal = !useGem;

          if (useGem) {
            obj.material = diamondMat;
            obj.renderOrder = 2;
            obj.material.depthTest = true;
            obj.material.depthWrite = false;
          } else if (useMetal || isGreenish(oldColor)) {
            obj.material = goldMat;
            obj.renderOrder = 0;
          } else {
            obj.material = goldMat;
            obj.renderOrder = 0;
          }

          disposeMaterial(oldMat);
        });

        // Center model
        const box = new THREE.Box3().setFromObject(ringRoot);
        const center = box.getCenter(new THREE.Vector3());
        ringRoot.position.sub(center);

        // Fit camera
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        const radius = Math.max(0.001, sphere.radius);

        const dist =
          radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        camera.position.set(0, radius * 0.35, dist * 1.22);
        camera.near = Math.max(0.001, dist / 100);
        camera.far = dist * 100;
        camera.updateProjectionMatrix();

        controls.target.set(0, 0, 0);
        controls.update();
      },
      undefined,
      (err) => {
        console.error("Failed to load GLB:", modelPath, err);
      },
    );

    // ---- Animate ----
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const dt = clock.getDelta();
      if (ringRoot) ringRoot.rotation.y += dt * 0.35;
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // ---- Resize ----
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // ---- Cleanup ----
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafId);

      controls.dispose();
      dracoLoader.dispose();

      goldMat.dispose();
      diamondMat.dispose();

      metalEnv?.dispose?.();
      if (diamondEnv) diamondEnv.dispose?.();
      pmrem.dispose();

      scene.traverse((obj) => {
        if (!obj.isMesh) return;
        obj.geometry?.dispose?.();
      });

      renderer.dispose();
      renderer.domElement?.parentNode?.removeChild(renderer.domElement);
    };
  }, [modelPath, metalKey]);

  return (
    <div
      ref={mountRef}
      style={{
        width: "100%",
        height,
        borderRadius: 16,
        overflow: "hidden",
        background: "#f7f7f7",
      }}
    />
  );
}
