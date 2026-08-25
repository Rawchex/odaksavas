// Procedural 3D Medal Generator Engine
window.BLUNK_MEDAL_3D = (function() {

  function createBumpMap(text, rank, seasonText) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Fill background with flat gray (base level)
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);

    // To fix sideways mapping on Cylinder top face, we can rotate the context
    ctx.translate(256, 256);
    ctx.rotate(-Math.PI / 2); // Rotate -90 degrees to align properly
    ctx.translate(-256, -256);

    // Draw outer ring (raised)
    ctx.strokeStyle = '#ffffff'; // White means raised in bump map
    ctx.lineWidth = 30;
    ctx.beginPath();
    ctx.arc(256, 256, 230, 0, Math.PI * 2);
    ctx.stroke();

    // Draw inner ring (lowered)
    ctx.strokeStyle = '#303030';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(256, 256, 200, 0, Math.PI * 2);
    ctx.stroke();

    // Draw text (raised)
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Fit text horizontally
    let fontSize = 64;
    ctx.font = `bold ${fontSize}px sans-serif`;
    while (ctx.measureText(text).width > 360 && fontSize > 20) {
      fontSize -= 2;
      ctx.font = `bold ${fontSize}px sans-serif`;
    }
    ctx.fillText(text, 256, 170);

    // Rank text
    ctx.font = 'bold 120px sans-serif';
    ctx.fillText(`#${rank}`, 256, 280);

    // Season text
    if (seasonText) {
      ctx.font = 'bold 36px sans-serif';
      ctx.fillText(seasonText, 256, 400);
    }

    // Star decorations
    ctx.font = '40px sans-serif';
    ctx.fillText('★', 256, 80);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  function createBackBumpMap(username = '') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);

    ctx.translate(256, 256);
    ctx.rotate(-Math.PI / 2); // Same rotation as front face
    ctx.translate(-256, -256);

    // Rings
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 30;
    ctx.beginPath(); ctx.arc(256, 256, 230, 0, Math.PI * 2); ctx.stroke();
    
    ctx.strokeStyle = '#303030';
    ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(256, 256, 200, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    if (username) {
      ctx.font = 'bold 80px sans-serif';
      ctx.fillText('BLUNK', 256, 200); // Shift up slightly more
      
      let uFontSize = 40;
      const uText = `@${username}`;
      ctx.font = `bold ${uFontSize}px sans-serif`;
      while (ctx.measureText(uText).width > 340 && uFontSize > 16) {
        uFontSize -= 2;
        ctx.font = `bold ${uFontSize}px sans-serif`;
      }
      ctx.fillText(uText, 256, 300);
    } else {
      ctx.font = 'bold 90px sans-serif';
      ctx.fillText('BLUNK', 256, 256);
    }

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  function getBaseMaterialArgs(rank) {
    let color = 0xffd700;
    let roughness = 0.2;
    if (rank === 1) { color = 0xffd700; roughness = 0.2; }
    else if (rank === 2) { color = 0xd0d4dc; roughness = 0.15; }
    else if (rank === 3) { color = 0xb06b42; roughness = 0.35; }

    return { color, metalness: 1.0, roughness, envMapIntensity: 1.0 };
  }

  function render(container, medal, options = {}) {
    if (!window.THREE) return null;

    const width = options.size || container.clientWidth || 200;
    const height = options.size || container.clientHeight || 200;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 15; // Moved back to fit the ribbon

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // --- Studio Lighting Setup ---
    // 1. Ambient Light (Genel Ortam): Yumuşak bir baz aydınlatma
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    // 2. Key Light (Ana Işık): Önden çapraz, bump map (yazı) detaylarını ortaya çıkarır
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.0);
    keyLight.position.set(5, 5, 10);
    scene.add(keyLight);
    
    // 3. Fill Light (Dolgu Işığı): Gölgeleri yumuşatmak için zıt çaprazdan gelir
    const fillLight = new THREE.DirectionalLight(0xe2e8f0, 1.5);
    fillLight.position.set(-8, 0, 8);
    scene.add(fillLight);

    // 4. Rim Light 1 (Kenar Işığı - Mor): CS2 hissiyatı için arkadan vuran e-spor moru
    const rimLight1 = new THREE.DirectionalLight(0xa855f7, 4.0);
    rimLight1.position.set(-10, 5, -5);
    scene.add(rimLight1);

    // 5. Rim Light 2 (Kenar Işığı - Mavi): Arkadan vuran soğuk mavi parıltı
    const rimLight2 = new THREE.DirectionalLight(0x3b82f6, 3.0);
    rimLight2.position.set(10, -5, -5);
    scene.add(rimLight2);
    
    // 6. Top Light (Tepe Işığı): Madalyanın üst çemberini ve ipi aydınlatır
    const topLight = new THREE.DirectionalLight(0xffffff, 2.0);
    topLight.position.set(0, 15, 2);
    scene.add(topLight);

    // Geometry
    const geometry = new THREE.CylinderGeometry(3.5, 3.5, 0.5, 64);
    geometry.rotateX(Math.PI / 2);

    // Materials [side, top(front), bottom(back)]
    const baseArgs = getBaseMaterialArgs(medal.rank);
    
    const earnedDate = medal.earned_at || medal.created_at ? new Date(medal.earned_at || medal.created_at) : new Date();
    const weekInMonth = Math.min(4, Math.ceil(earnedDate.getDate() / 7));
    const text = medal.league_name || 'Genel';
    const seasonText = medal.season_number ? `S${medal.season_number} W${medal.week_in_season || weekInMonth}` : '';
    
    const frontBump = createBumpMap(text, medal.rank, seasonText);
    const backBump = createBackBumpMap(medal.username);

    const sideMaterial = new THREE.MeshStandardMaterial(baseArgs);
    const frontMaterial = new THREE.MeshStandardMaterial({ ...baseArgs, bumpMap: frontBump, bumpScale: 0.02 });
    const backMaterial = new THREE.MeshStandardMaterial({ ...baseArgs, bumpMap: backBump, bumpScale: 0.02 });

    const coin = new THREE.Mesh(geometry, [sideMaterial, frontMaterial, backMaterial]);
    
    // Rim
    const rimGeometry = new THREE.TorusGeometry(3.5, 0.25, 16, 64);
    const rimMaterial = new THREE.MeshStandardMaterial({ ...baseArgs, roughness: 0.1 });
    const rim = new THREE.Mesh(rimGeometry, rimMaterial);
    
    const medalGroup = new THREE.Group();
    medalGroup.add(coin);
    medalGroup.add(rim);

    // --- Realistic Lanyard (Rope) System ---
    const ropeGroup = new THREE.Group();
    
    // Rope Color by Rank
    let ropeColor = 0xb91c1c; // Deep Red (Default / 1st)
    if (medal.rank === 2) ropeColor = 0x1d4ed8; // Royal Blue
    if (medal.rank === 3) ropeColor = 0x047857; // Emerald Green
    
    const ropeMat = new THREE.MeshStandardMaterial({
      color: ropeColor,
      roughness: 1.0, // Fabric-like
      metalness: 0.0,
      side: THREE.DoubleSide
    });
    
    // Connector Ring (attached to medal)
    const ringGeo = new THREE.TorusGeometry(0.35, 0.06, 16, 32);
    const ring = new THREE.Mesh(ringGeo, rimMaterial);
    ring.position.set(0, 3.8, 0);
    medalGroup.add(ring);
    
    // Realistic Knot (TorusKnot) tying the rope to the ring
    const knotGeo = new THREE.TorusKnotGeometry(0.18, 0.09, 64, 12, 1, 3);
    const knot = new THREE.Mesh(knotGeo, ropeMat);
    knot.position.set(0, 4.15, 0);
    ropeGroup.add(knot);
    
    // Left Rope
    const leftCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.15, 4.15, 0),
        new THREE.Vector3(-1.2, 7.5, -0.5),
        new THREE.Vector3(-2.8, 14, -1.5)
    ]);
    const leftRopeGeo = new THREE.TubeGeometry(leftCurve, 32, 0.12, 8, false);
    const leftRope = new THREE.Mesh(leftRopeGeo, ropeMat);
    ropeGroup.add(leftRope);
    
    // Right Rope
    const rightCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.15, 4.15, 0),
        new THREE.Vector3(1.2, 7.5, -0.5),
        new THREE.Vector3(2.8, 14, -1.5)
    ]);
    const rightRopeGeo = new THREE.TubeGeometry(rightCurve, 32, 0.12, 8, false);
    const rightRope = new THREE.Mesh(rightRopeGeo, ropeMat);
    ropeGroup.add(rightRope);
    
    // Pendulum physics setup
    const pivot = new THREE.Group();
    pivot.position.set(0, 14, 0); // High up out of screen
    
    const pendulum = new THREE.Group();
    pendulum.position.set(0, -14, 0); // Drop down to center
    
    pendulum.add(ropeGroup);
    pendulum.add(medalGroup);
    pivot.add(pendulum);
    
    // Shift whole assembly down slightly for framing
    pivot.position.y -= 1.5;
    
    scene.add(pivot);

    // Controls
    let controls = null;
    if (options.interactive && window.THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.enableZoom = options.enableZoom || false;
      controls.enablePan = false;
      let resumeTimeout = null;
      
      // Stop rotating when the user grabs the medal
      controls.addEventListener('start', () => {
        options.autoRotate = false;
        if (resumeTimeout) clearTimeout(resumeTimeout);
      });

      // Resume rotating 5 seconds after release
      controls.addEventListener('end', () => {
        if (resumeTimeout) clearTimeout(resumeTimeout);
        resumeTimeout = setTimeout(() => {
          options.autoRotate = true;
        }, 5000);
      });
    }

    let animationFrameId;
    function animate() {
      animationFrameId = requestAnimationFrame(animate);
      const t = Date.now() * 0.0015;
      
      // Realistic pendulum sway
      pivot.rotation.z = Math.sin(t) * 0.04;
      pivot.rotation.x = Math.cos(t * 0.8) * 0.02;

      if (options.autoRotate) {
        // Spin the medal independently of the rope
        medalGroup.rotation.y += 0.005;
      }

      if (controls) controls.update();
      renderer.render(scene, camera);
    }
    animate();

    return {
      destroy: () => {
        cancelAnimationFrame(animationFrameId);
        renderer.dispose();
        geometry.dispose();
        sideMaterial.dispose();
        frontMaterial.dispose();
        backMaterial.dispose();
        frontBump.dispose();
        backBump.dispose();
        rimGeometry.dispose();
        rimMaterial.dispose();
        ropeMat.dispose();
        ringGeo.dispose();
        knotGeo.dispose();
        leftRopeGeo.dispose();
        rightRopeGeo.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      },
      resize: (newWidth, newHeight) => {
        camera.aspect = newWidth / newHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(newWidth, newHeight);
      },
      group: pivot
    };
  }

  return { render };
})();
