// Pure screen-projection math for off-screen edge indicators.
// Inputs are normalized device coordinates from THREE.Vector3.project():
// ndcX, ndcY in [-1,1] with y up. `behind` is true when the target is behind
// the camera (project() mirrors such points, so we flip them). `inset` is the
// fraction of the half-extent at which markers ride the edge (0.9 ≈ 10% in).
// Returns screen fractions sx, sy in [0,1] with y DOWN (CSS convention) and the
// pointing angle in radians (0 = right, measured for a y-down screen).
export function edgePlacement(ndcX, ndcY, behind, inset = 0.9) {
  let x = ndcX;
  let y = ndcY;
  if (behind) {
    x = -x;
    y = -y;
  }
  const onScreen = !behind && Math.abs(x) <= inset && Math.abs(y) <= inset;

  // push the direction vector out to the inset rectangle edge
  const scale = inset / Math.max(Math.abs(x), Math.abs(y), 1e-6);
  const ex = Math.max(-inset, Math.min(inset, x * scale));
  const ey = Math.max(-inset, Math.min(inset, y * scale));

  // NDC (y up) -> screen fraction (y down)
  const sx = ex * 0.5 + 0.5;
  const sy = -ey * 0.5 + 0.5;
  // angle for a y-down screen: up is -y
  const angle = Math.atan2(-y, x);
  return { onScreen, sx, sy, angle };
}
