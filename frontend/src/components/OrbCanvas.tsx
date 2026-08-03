import { useEffect, useRef } from "react";

// A self-contained WebGL orb: a shaded 3D-looking sphere with emerald/pink
// plasma swirling over a dark core, a fresnel rim, and a moving sheen. No
// external 3D library — one fragment shader on a full-screen triangle.

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;

float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i+vec2(1.0,0.0)), c = hash(i+vec2(0.0,1.0)), d = hash(i+vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.0; a*=0.5; } return v; }

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*u_res) / min(u_res.x, u_res.y);
  float r = length(uv);
  float R = 0.46;
  float t = u_time*0.18;

  vec2 sph = uv / R;
  float zz = 1.0 - dot(sph, sph);
  float z = sqrt(max(0.0, zz));           // fake sphere depth

  // swirling domain-warped plasma
  vec2 q = sph*1.5;
  q += 0.5*vec2(fbm(q + vec2(0.0, t)), fbm(q + vec2(t, 3.0)));
  float n = fbm(q*1.3 - t*0.8);

  vec3 emerald = vec3(0.16, 0.82, 0.52);
  vec3 pink    = vec3(0.96, 0.42, 0.73);
  vec3 col = mix(emerald, pink, smoothstep(0.25, 0.75, n));

  // a brighter wisp drifting through
  float wisp = pow(smoothstep(0.55, 1.0, fbm(q*2.2 - t*1.7)), 2.0);
  col += wisp*0.5*mix(pink, emerald, 0.4);

  // dark core — colours glow toward the rim
  float core = smoothstep(0.0, 0.82, r/R);
  col *= mix(0.05, 1.0, core);

  // fresnel rim light + a moving specular sheen for the 3D read
  float fres = pow(1.0 - z, 3.0);
  col += fres*0.5*vec3(0.9, 1.0, 0.95);
  vec3 nrm = normalize(vec3(sph, z));
  float sheen = pow(max(0.0, dot(nrm, normalize(vec3(-0.4, 0.55, 0.75)))), 12.0);
  col += sheen*0.45;

  float a = smoothstep(R, R-0.012, r);   // soft antialiased edge
  gl_FragColor = vec4(col, a);
}`;

export function OrbCanvas({ size = 176, className }: { size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: true });
    if (!gl) return; // no WebGL → the CSS glow behind still shows

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let raf = 0;
    const render = (now: number) => {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, reduce ? 6.0 : (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(raf);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [size]);

  return <canvas ref={ref} style={{ width: size, height: size }} className={className} aria-hidden />;
}
