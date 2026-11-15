// NDC in (y up), screen fractions out (y DOWN); project() mirrors points behind the camera, so those are flipped.
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
  return { onScreen, sx, sy, angle, px: x * 0.5 + 0.5, py: -y * 0.5 + 0.5 };
}
