// KaTiAi hero: a glass cat-eye lens hovers over a sheet of paper; its slit pupil follows the cursor,
// a mint scan beam sweeps the sheet and letters of many alphabets lift off it. Pauses when off-screen.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const canvas = document.getElementById("scene");
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = matchMedia("(max-width: 900px)").matches;

function webglOK() {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); }
  catch { return false; }
}

if (!canvas || !webglOK()) {
  document.documentElement.classList.add("no-webgl");
} else {
  start();
}

function start() {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 0.3, 9);

  const rig = new THREE.Group();
  scene.add(rig);

  // ---------- paper sheet with "text" ----------
  const paperTex = (() => {
    const c = document.createElement("canvas"); c.width = 768; c.height = 1024;
    const g = c.getContext("2d");
    g.fillStyle = "#F6F3EE"; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#2A2540"; g.font = "700 46px Tektur, Onest, sans-serif"; g.fillText("Договор · Invoice · 合同", 60, 110);
    let y = 190;
    for (let i = 0; i < 17; i++) {
      const w = 420 + ((i * 97) % 220);
      g.fillStyle = i % 6 === 5 ? "rgba(155,123,255,.55)" : "rgba(42,37,64,.42)";
      g.beginPath(); g.roundRect(60, y, w, 16, 8); g.fill();
      y += i % 6 === 5 ? 62 : 42;
    }
    g.strokeStyle = "rgba(255,94,126,.65)"; g.lineWidth = 5; g.beginPath();
    for (let x = 0; x <= 260; x += 4) g.lineTo(440 + x, 940 + Math.sin(x / 14) * 14);
    g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return tex;
  })();
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 4.4, 24, 24),
    new THREE.MeshStandardMaterial({ map: paperTex, roughness: 0.85, metalness: 0 }));
  { // gentle page curl
    const pos = paper.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.pow(pos.getX(i) / 1.65, 2) * 0.12 + Math.sin(pos.getY(i) * 0.8) * 0.04);
    paper.geometry.computeVertexNormals();
  }
  const sheet = new THREE.Group();
  sheet.add(paper);
  sheet.rotation.set(-0.42, -0.38, 0.12);
  sheet.position.set(2.0, -0.6, -0.4);
  rig.add(sheet);

  // a second, blurred sheet behind for depth
  const back = paper.clone();
  back.material = paper.material.clone(); back.material.transparent = true; back.material.opacity = 0.35;
  back.position.set(-0.8, 0.5, -0.9); back.rotation.z = -0.2;
  sheet.add(back);

  // ---------- scan beam ----------
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x3df5c8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.035), beamMat);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.45),
    new THREE.MeshBasicMaterial({ color: 0x3df5c8, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.z = halo.position.z = 0.09;
  sheet.add(beam, halo);
  const beamLight = new THREE.PointLight(0x3df5c8, 6, 4, 2);
  sheet.add(beamLight);

  // ---------- glass cat-eye lens ----------
  const eye = new THREE.Group();
  const lens = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.MeshPhysicalMaterial({
    color: 0xf3edff, metalness: 0, roughness: 0.06, transmission: 1, thickness: 0.9, ior: 1.42,
    iridescence: 0.7, iridescenceIOR: 1.3, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true, opacity: 1,
  }));
  lens.scale.set(1.45, 0.78, 0.42);
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.62, 64), new THREE.MeshBasicMaterial({
    map: (() => {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const g = c.getContext("2d");
      const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
      grd.addColorStop(0, "#3DF5C8"); grd.addColorStop(0.5, "#9B7BFF"); grd.addColorStop(0.85, "#FF5E7E"); grd.addColorStop(1, "#14121F");
      g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })(),
  }));
  iris.position.z = 0.05;
  const pupil = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.62, 8, 24),
    new THREE.MeshStandardMaterial({ color: 0x0b0a12, roughness: 0.3, emissive: 0x3df5c8, emissiveIntensity: 0.18 }));
  pupil.position.z = 0.12;
  const look = new THREE.Group();
  look.add(iris, pupil);
  eye.add(look, lens);
  eye.position.set(1.0, 1.45, 1.6);
  eye.scale.setScalar(0.72);
  rig.add(eye);

  // ears: two soft glass triangles — the "cat" in KaTiAi
  const earGeo = new THREE.ConeGeometry(0.36, 0.62, 3, 1);
  const earMat = new THREE.MeshPhysicalMaterial({ color: 0xff5e7e, roughness: 0.25, transmission: 0.55, thickness: 0.4, clearcoat: 1 });
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, earMat);
    ear.position.set(side * 0.95, 0.78, -0.15); ear.rotation.z = side * -0.38; ear.scale.z = 0.35;
    eye.add(ear);
  }

  // ---------- lights ----------
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 4, 5); scene.add(key);
  const rim = new THREE.PointLight(0x9b7bff, 30, 12, 2); rim.position.set(-3, 2, 2); scene.add(rim);
  const warm = new THREE.PointLight(0xff5e7e, 18, 10, 2); warm.position.set(4, -2, 3); scene.add(warm);

  let t = 0, beamT = 0;
  function beamY() { return Math.sin(beamT) * 1.9; }

  // ---------- glyphs lifting off the page ----------
  const CHARS = ["A", "Я", "文", "ع", "Ñ", "ß", "Ж", "あ", "Ω", "ü", "字", "ش", "K", "Ä", "한", "Ё", "é", "א", "ç", "ы"];
  const COLORS = ["#F6F3EE", "#3DF5C8", "#9B7BFF", "#FF5E7E"];
  const glyphTex = new Map();
  function texFor(ch, color) {
    const k = ch + color;
    if (glyphTex.has(k)) return glyphTex.get(k);
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    g.font = "700 92px Tektur, 'Noto Sans SC', 'Noto Kufi Arabic', Onest, sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle"; g.shadowColor = color; g.shadowBlur = 18;
    g.fillStyle = color; g.fillText(ch, 64, 70);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    glyphTex.set(k, tex); return tex;
  }
  const glyphs = [];
  const COUNT = small ? 16 : 34;
  for (let i = 0; i < COUNT; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
    sprite.userData = { life: Math.random(), speed: 0.12 + Math.random() * 0.18 };
    respawn(sprite, true);
    rig.add(sprite);
    glyphs.push(sprite);
  }
  function respawn(s, initial = false) {
    const ch = CHARS[(Math.random() * CHARS.length) | 0];
    s.material.map = texFor(ch, COLORS[(Math.random() * COLORS.length) | 0]);
    s.material.needsUpdate = true;
    const local = new THREE.Vector3((Math.random() - 0.5) * 3, beamY(), 0.15);
    const world = sheet.localToWorld(local.clone());
    rig.worldToLocal(world);
    s.position.copy(world);
    s.userData.drift = new THREE.Vector3((Math.random() - 0.5) * 0.25, 0.6 + Math.random() * 0.5, 0.35 + Math.random() * 0.35);
    s.userData.life = initial ? Math.random() : 0;
    const size = 0.22 + Math.random() * 0.26;
    s.scale.set(size, size, 1);
  }

  // ---------- interaction ----------
  const pointer = new THREE.Vector2(0, 0);
  const target = new THREE.Vector2(0, 0);
  addEventListener("pointermove", (e) => { pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); }, { passive: true });
  let scrollK = 0;
  addEventListener("scroll", () => { scrollK = Math.min(1, scrollY / innerHeight); }, { passive: true });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const narrow = w < 900;
    const rtl = document.documentElement.dir === "rtl";
    if (narrow) { rig.position.set(-1.55, 0.25, 0); rig.scale.setScalar(0.92); }
    else { rig.position.set(rtl ? -3.6 : 0, 0, 0); rig.scale.setScalar(1); }
  }
  document.addEventListener("katiai:lang", resize);
  new ResizeObserver(resize).observe(canvas);
  resize();

  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible && !reduce) loop(); }).observe(canvas);

  const clock = new THREE.Clock();
  let raf = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    beamT += dt * 0.9;
    target.lerp(pointer, 0.06);

    const y = beamY();
    beam.position.y = halo.position.y = beamLight.position.y = y;
    beamMat.opacity = 0.75 + Math.sin(t * 8) * 0.15;

    eye.position.y = 1.45 + Math.sin(t * 1.3) * 0.12;
    eye.rotation.y = target.x * 0.35 - 0.15;
    eye.rotation.x = -target.y * 0.25;
    look.position.set(target.x * 0.38, target.y * 0.16, 0);
    pupil.scale.x = 1 + Math.max(0, Math.sin(t * 0.7)) * 0.6; // the slit opens and narrows

    sheet.rotation.y = -0.38 + target.x * 0.08;
    rig.rotation.x = target.y * 0.04;
    camera.position.y = 0.3 - scrollK * 1.2;
    camera.lookAt(0, -scrollK * 0.6, 0);

    for (const s of glyphs) {
      const d = s.userData;
      d.life += dt * d.speed;
      if (d.life >= 1) { respawn(s); continue; }
      s.position.addScaledVector(d.drift, dt * 0.9);
      s.material.opacity = Math.sin(d.life * Math.PI) * 0.95;
      s.material.rotation = Math.sin(t + d.speed * 20) * 0.2;
    }
    renderer.render(scene, camera);
  }
  function loop() {
    cancelAnimationFrame(raf);
    const tick = () => { if (!visible) return; frame(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
  }
  if (reduce) { frame(); } else { loop(); }
  canvas.dataset.ready = "1";
}
