// Test peak radiance in the explicitly masked emitter buffer. Using luminance
// would suppress blue and violet. Threshold each source texel before averaging
// so a narrow, bright edge survives the reduction without expanding its core.
export const emitterHighPass = /* glsl */`
  uniform sampler2D emitters;
  varying vec2 vUv;

  vec3 radiant(vec3 colour) {
    float peak = max(colour.r, max(colour.g, colour.b));
    return colour * smoothstep(.68, .96, peak);
  }

  vec3 extract(ivec2 pixel, ivec2 limit) {
    return radiant(texelFetch(emitters, clamp(pixel, ivec2(0), limit), 0).rgb);
  }

  void main() {
    ivec2 limit = textureSize(emitters, 0) - ivec2(1);
    ivec2 pixel = ivec2(gl_FragCoord.xy) * 2;
    const float weights[6] = float[6](1., 4., 7., 7., 4., 1.);
    vec3 halo = vec3(0.);
    for (int i = 0; i < 6; i++) {
      ivec2 tap = pixel + ivec2(i - 2, 0);
      halo += weights[i] * (extract(tap, limit) + extract(tap + ivec2(0, 1), limit));
    }
    gl_FragColor = vec4(halo / 48., 1.);
  }
`
