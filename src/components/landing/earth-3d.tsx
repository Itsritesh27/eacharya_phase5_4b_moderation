"use client";

import { useEffect, useRef, useState } from "react";
import { GlobeIllustration } from "./globe-illustration";

/**
 * Interactive 3D Earth (three.js). Auto-rotates, drag to spin.
 * Falls back to the SVG illustration if WebGL is unavailable.
 */
export function Earth3D({ className }: { className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      try {
        const THREE = await import("three");
        if (disposed) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        mount.appendChild(renderer.domElement);
        renderer.domElement.style.touchAction = "pan-y";
        renderer.domElement.style.cursor = "grab";

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
        camera.position.z = 5.2;

        const sun = new THREE.DirectionalLight(0xffffff, 2.6);
        sun.position.set(-3, 2, 4);
        scene.add(sun, new THREE.AmbientLight(0x6f8fb0, 0.9));

        const small = window.innerWidth < 640;
        const tex = await new THREE.TextureLoader().loadAsync(
          small ? "/textures/earth-2k.jpg" : "/textures/earth-4k.jpg",
        );
        if (disposed) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

        const earth = new THREE.Mesh(
          new THREE.SphereGeometry(1.5, 96, 96),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 }),
        );
        earth.rotation.z = THREE.MathUtils.degToRad(23.4); // axial tilt
        const spin = new THREE.Group();
        spin.add(earth);
        scene.add(spin);

        // Soft atmosphere rim
        const atmosphere = new THREE.Mesh(
          new THREE.SphereGeometry(1.5 * 1.045, 64, 64),
          new THREE.ShaderMaterial({
            transparent: true,
            side: THREE.BackSide,
            blending: THREE.NormalBlending,
            depthWrite: false,
            vertexShader:
              "varying vec3 n; void main(){ n = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ",
            fragmentShader:
              "varying vec3 n; void main(){ float i = pow(0.72 - dot(n, vec3(0.,0.,1.)), 3.0); gl_FragColor = vec4(0.30,0.62,0.95, clamp(i,0.0,1.0)*0.75); }",
          }),
        );
        scene.add(atmosphere);

        const resize = () => {
          const w = mount.clientWidth;
          renderer.setSize(w, w);
        };
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(mount);

        // Drag to rotate
        let dragging = false;
        let lastX = 0;
        let velocity = 0;
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const el = renderer.domElement;
        const down = (e: PointerEvent) => {
          dragging = true;
          lastX = e.clientX;
          el.setPointerCapture(e.pointerId);
          el.style.cursor = "grabbing";
        };
        const move = (e: PointerEvent) => {
          if (!dragging) return;
          velocity = (e.clientX - lastX) * 0.006;
          spin.rotation.y += velocity;
          lastX = e.clientX;
        };
        const up = () => {
          dragging = false;
          el.style.cursor = "grab";
        };
        el.addEventListener("pointerdown", down);
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
        el.addEventListener("pointercancel", up);

        // Only render while visible
        let visible = true;
        const io = new IntersectionObserver((entries) => (visible = entries[0]?.isIntersecting ?? true));
        io.observe(mount);

        let raf = 0;
        const tick = () => {
          raf = requestAnimationFrame(tick);
          if (!visible) return;
          if (!dragging) {
            velocity *= 0.95;
            spin.rotation.y += velocity + (reduce ? 0 : 0.0018);
          }
          renderer.render(scene, camera);
        };
        tick();
        setReady(true);

        cleanup = () => {
          cancelAnimationFrame(raf);
          ro.disconnect();
          io.disconnect();
          el.removeEventListener("pointerdown", down);
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          el.removeEventListener("pointercancel", up);
          tex.dispose();
          earth.geometry.dispose();
          (earth.material as import("three").Material).dispose();
          atmosphere.geometry.dispose();
          (atmosphere.material as import("three").Material).dispose();
          renderer.dispose();
          el.remove();
        };
      } catch {
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  if (failed) return <GlobeIllustration className={className} />;

  return (
    <div className={className} role="img" aria-label="Interactive 3D Earth. Drag to rotate.">
      <div ref={mountRef} className="aspect-square w-full" />
      {!ready && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <GlobeIllustration className="h-auto w-full max-w-[460px] opacity-60" />
        </div>
      )}
    </div>
  );
}
