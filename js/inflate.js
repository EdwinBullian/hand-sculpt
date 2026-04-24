// Pure helpers for the inflate / deflate sculpt brush.
// inflateStep advances each vertex in `region` along its surface normal.
// sign: +1 = inflate (push outward), −1 = deflate (pull inward).
// posArray and normArray are raw Float32Array buffers, stride 3 (x, y, z per vertex).

export function inflateStep(posArray, normArray, region, amount, sign) {
  for (const { idx, weight } of region) {
    posArray[idx * 3]     += normArray[idx * 3]     * amount * weight * sign;
    posArray[idx * 3 + 1] += normArray[idx * 3 + 1] * amount * weight * sign;
    posArray[idx * 3 + 2] += normArray[idx * 3 + 2] * amount * weight * sign;
  }
}
