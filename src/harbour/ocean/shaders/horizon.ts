export const OCEAN_HORIZON = /* glsl */ `  float hz = smoothstep(uHorizonDist * 0.84, uHorizonDist * 0.998, fwdD);
  if (hz > 0.0) {
    float thV = degrees(wrapPi(atan(vd.x, -vd.z) - uFwdAz));
    vec3 hazeC = band(thV, -0.05, 0.0);
    hz = pow(hz, 3.2);
    col = mix(col, hazeC, clamp(hz, 0.0, 1.0));
  }

  if (uDebug > 0.5 && uDebug < 1.5) col = vec3(trail, live.r, live.g);
  if (uDebug > 1.5 && uDebug < 2.5) col = vec3(sdf.r, sdf.g, sdf.b);
  if (uDebug > 2.5 && uDebug < 3.5) col = body;
  if (uDebug > 3.5 && uDebug < 4.5) col = sky;
  if (uDebug > 4.5 && uDebug < 5.5) col = vec3(F * 4.0, hz, foam);
  if (uDebug > 5.5 && uDebug < 6.5) col = glint + beam;
  if (uDebug > 6.5 && uDebug < 7.5) col = vec3(live.a, live.b, zm.a);
  if (uDebug > 7.5 && uDebug < 8.5) col = vec3(sunSh);
  if (uDebug > 8.5 && uDebug < 9.5) col = vec3(clamp(dbgViewPath * 0.06, 0.0, 1.0), dbgT.g, dbgT.b);
  if (uDebug > 9.5 && uDebug < 10.5) col = vec3(dbgCaus, clamp(1.0 - fftJMin, 0.0, 1.0), mirrorCov);
  gl_FragColor = vec4(col, 1.0);
}`;
