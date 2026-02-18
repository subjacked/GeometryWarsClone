// @ts-nocheck
import * as THREE from "three";

export class Background3D {
  constructor(width = 1280, height = 720) {
    this.canvas = document.createElement("canvas");
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.tubeGroup = null;
    this.wire = null;
    this.outerWire = null;
    this.rippleMeshes = [];
    this.time = 0;
    this.width = width;
    this.height = height;
    this.ready = false;
    this.currentThemeLevel = -1;

    this.bodyMaterial = null;
    this.wireMaterial = null;
    this.outerWireMaterial = null;
    this.glowMaterial = null;
    this.stars = null;
    this.planetGroup = null;
    this.planetCore = null;
    this.planetRim = null;
    this.meteorGroup = null;
    this.neonRingGroup = null;

    this.init();
  }

  init() {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2.2));
      this.renderer.setClearColor(0x021424, 1);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.06;

      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.Fog(0x031526, 12, 34);

      this.camera = new THREE.PerspectiveCamera(44, this.width / this.height, 0.1, 70);
      this.camera.position.set(0, 0.14, 9.6);
      this.camera.lookAt(0, 0, 0);

      const ambient = new THREE.AmbientLight(0x7eefff, 0.38);
      const key = new THREE.PointLight(0x8df8ff, 1.2, 28, 2);
      key.position.set(2.6, 1.6, 4.6);
      const fill = new THREE.PointLight(0x66a8ff, 0.52, 26, 2.3);
      fill.position.set(-3.9, -1.2, 3.8);
      this.scene.add(ambient, key, fill);

      this.tubeGroup = new THREE.Group();
      this.tubeGroup.rotation.x = -0.075;
      this.tubeGroup.rotation.z = -0.06;
      this.scene.add(this.tubeGroup);

      const capsuleGeo = new THREE.CapsuleGeometry(2.18, 5.55, 16, 48);
      this.bodyMaterial = new THREE.MeshPhongMaterial({
        color: 0x06273a,
        emissive: 0x0a3d57,
        transparent: true,
        opacity: 0.72,
        shininess: 108,
        specular: 0xa5ffff,
      });
      const body = new THREE.Mesh(capsuleGeo, this.bodyMaterial);
      body.rotation.z = Math.PI / 2;
      this.tubeGroup.add(body);

      this.wireMaterial = new THREE.LineBasicMaterial({
        color: 0x66f3ff,
        transparent: true,
        opacity: 0.56,
      });
      this.wire = new THREE.LineSegments(new THREE.WireframeGeometry(capsuleGeo), this.wireMaterial);
      this.wire.rotation.z = Math.PI / 2;
      this.tubeGroup.add(this.wire);

      const outerGeo = new THREE.CapsuleGeometry(2.34, 5.82, 10, 30);
      this.outerWireMaterial = new THREE.LineBasicMaterial({
        color: 0xb6ffff,
        transparent: true,
        opacity: 0.2,
      });
      this.outerWire = new THREE.LineSegments(new THREE.WireframeGeometry(outerGeo), this.outerWireMaterial);
      this.outerWire.rotation.z = Math.PI / 2;
      this.tubeGroup.add(this.outerWire);

      const glow = new THREE.Mesh(
        new THREE.CapsuleGeometry(2.72, 6.24, 12, 20),
        new THREE.MeshBasicMaterial({
          color: 0x4be4ff,
          transparent: true,
          opacity: 0.085,
          depthWrite: false,
        })
      );
      this.glowMaterial = glow.material;
      glow.rotation.z = Math.PI / 2;
      this.tubeGroup.add(glow);

      this.createStars();
      this.createPlanetVariant();
      this.createMeteorVariant();
      this.createNeonRingVariant();

      this.resize(this.width, this.height);
      this.applyLevelTheme(0);
      this.ready = true;
    } catch {
      this.ready = false;
    }
  }

  createStars() {
    const starsGeom = new THREE.BufferGeometry();
    const starCount = 300;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 28;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 16;
      positions[i * 3 + 2] = -4.5 - Math.random() * 11;
    }
    starsGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(
      starsGeom,
      new THREE.PointsMaterial({
        color: 0x98f6ff,
        size: 0.038,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
      })
    );
    this.scene.add(this.stars);
  }

  createPlanetVariant() {
    this.planetGroup = new THREE.Group();
    this.planetGroup.position.set(-4.8, 2.25, -5.6);

    this.planetCore = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 32, 32),
      new THREE.MeshPhongMaterial({
        color: 0x2d90ff,
        emissive: 0x183a70,
        shininess: 80,
        specular: 0x84e1ff,
      })
    );
    this.planetGroup.add(this.planetCore);

    this.planetRim = new THREE.Mesh(
      new THREE.SphereGeometry(1.54, 28, 24),
      new THREE.MeshBasicMaterial({
        color: 0x59dcff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      })
    );
    this.planetGroup.add(this.planetRim);
    this.scene.add(this.planetGroup);
  }

  createMeteorVariant() {
    this.meteorGroup = new THREE.Group();
    this.scene.add(this.meteorGroup);
    for (let i = 0; i < 9; i++) {
      const length = 0.52 + Math.random() * 0.5;
      const meteor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, length, 6),
        new THREE.MeshBasicMaterial({
          color: 0x7cf2ff,
          transparent: true,
          opacity: 0.82,
        })
      );
      meteor.userData = {
        angle: Math.random() * Math.PI * 2,
        radius: 4.3 + Math.random() * 2.9,
        speed: 0.35 + Math.random() * 0.48,
        yDrift: -2 + Math.random() * 4.2,
        roll: Math.random() * Math.PI * 2,
      };
      this.meteorGroup.add(meteor);
    }
  }

  createNeonRingVariant() {
    this.neonRingGroup = new THREE.Group();
    this.tubeGroup.add(this.neonRingGroup);
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(2.84 + i * 0.36, 0.012 + i * 0.006, 8, 80),
        new THREE.MeshBasicMaterial({
          color: 0x78fbff,
          transparent: true,
          opacity: 0.28 - i * 0.06,
        })
      );
      ring.rotation.y = i * 0.58;
      ring.rotation.x = Math.PI / 2 + i * 0.28;
      this.neonRingGroup.add(ring);
    }
  }

  applyLevelTheme(levelIndex) {
    if (!this.ready || levelIndex === this.currentThemeLevel) return;
    this.currentThemeLevel = levelIndex;

    const hue = (186 + levelIndex * 19) % 360;
    const bgColor = new THREE.Color().setHSL(hue / 360, 0.72, 0.12);
    const wireColor = new THREE.Color().setHSL(hue / 360, 0.96, 0.72);
    const outerColor = new THREE.Color().setHSL((hue + 24) / 360, 0.9, 0.82);
    const glowColor = new THREE.Color().setHSL((hue + 10) / 360, 0.9, 0.6);

    this.renderer.setClearColor(bgColor, 1);
    this.scene.fog.color.copy(bgColor);
    this.wireMaterial.color.copy(wireColor);
    this.outerWireMaterial.color.copy(outerColor);
    this.glowMaterial.color.copy(glowColor);
    this.bodyMaterial.emissive.copy(glowColor).multiplyScalar(0.35);

    if (this.planetCore) {
      this.planetCore.material.color.setHSL((hue + 38) / 360, 0.64, 0.52);
      this.planetCore.material.emissive.setHSL((hue + 12) / 360, 0.6, 0.24);
    }
    if (this.planetRim) {
      this.planetRim.material.color.setHSL((hue + 18) / 360, 0.84, 0.64);
    }
    if (this.stars) {
      this.stars.material.color.setHSL((hue + 8) / 360, 0.76, 0.74);
    }

    const variant = levelIndex % 5;
    const showPlanet = variant === 0 || variant === 3 || variant === 4;
    const showMeteors = variant === 1 || variant === 3 || variant === 4;
    const showNeonRings = variant === 2 || variant === 4;
    this.planetGroup.visible = showPlanet;
    this.meteorGroup.visible = showMeteors;
    this.neonRingGroup.visible = showNeonRings;
  }

  resize(width, height) {
    if (!this.ready) return;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  spawnRipple(x, y, power = 1) {
    if (!this.ready) return;
    const nx = (x / Math.max(1, this.width)) * 2 - 1;
    const ny = 1 - (y / Math.max(1, this.height)) * 2;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.11, 0.15, 64),
      new THREE.MeshBasicMaterial({
        color: 0xa6feff,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    ring.position.set(nx * 3.45, ny * 2.15, 2.25);
    ring.rotation.x = 0.32;
    this.scene.add(ring);
    this.rippleMeshes.push({ mesh: ring, life: 1, speed: 1.8 + power * 0.3 });
    if (this.rippleMeshes.length > 20) {
      const oldest = this.rippleMeshes.shift();
      this.scene.remove(oldest.mesh);
      oldest.mesh.geometry.dispose();
      oldest.mesh.material.dispose();
    }
  }

  update(dt, levelIndex, activeRipples) {
    if (!this.ready) return;
    this.applyLevelTheme(levelIndex);

    this.time += dt;
    const pulse = 1 + Math.sin(this.time * 1.2 + levelIndex * 0.6) * 0.008;
    this.tubeGroup.scale.set(pulse, pulse, pulse);
    this.tubeGroup.rotation.y += dt * 0.045;
    this.tubeGroup.rotation.x = -0.075 + Math.sin(this.time * 0.32) * 0.012;
    this.wire.material.opacity = 0.5 + Math.sin(this.time * 0.9) * 0.04 + Math.min(0.14, activeRipples * 0.012);
    this.outerWire.material.opacity = 0.17 + Math.sin(this.time * 0.62) * 0.02;

    if (this.neonRingGroup.visible) {
      this.neonRingGroup.rotation.x += dt * 0.035;
      this.neonRingGroup.rotation.z -= dt * 0.028;
    }

    if (this.planetGroup.visible) {
      this.planetGroup.rotation.y += dt * 0.07;
      this.planetGroup.position.x = -4.8 + Math.sin(this.time * 0.18) * 0.24;
      this.planetGroup.position.y = 2.25 + Math.sin(this.time * 0.22) * 0.11;
    }

    if (this.meteorGroup.visible) {
      for (let i = 0; i < this.meteorGroup.children.length; i++) {
        const meteor = this.meteorGroup.children[i];
        const d = meteor.userData;
        d.angle += dt * d.speed * 0.42;
        const x = Math.cos(d.angle) * d.radius;
        const y = Math.sin(d.angle * 0.72) * 1.5 + d.yDrift * 0.24;
        const z = -4.2 + Math.sin(d.angle * 1.2 + i) * 2.3;
        meteor.position.set(x, y, z);
        meteor.rotation.z = d.roll + d.angle * 0.7;
        meteor.rotation.x = 1.22;
      }
    }

    for (let i = this.rippleMeshes.length - 1; i >= 0; i--) {
      const ripple = this.rippleMeshes[i];
      ripple.life -= dt * 0.8;
      ripple.mesh.scale.multiplyScalar(1 + dt * ripple.speed);
      ripple.mesh.material.opacity = Math.max(0, ripple.life) * 0.76;
      if (ripple.life <= 0) {
        this.scene.remove(ripple.mesh);
        ripple.mesh.geometry.dispose();
        ripple.mesh.material.dispose();
        this.rippleMeshes.splice(i, 1);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }
}
