// Phone/tablet controls, synthesized into the same virtual keys the keyboard
// feeds. Left/right thirds walk; the middle column climbs (top) or descends
// (bottom) at ladders; the centre is E — tap to interact, hold to tend.

export function zoneCode(x, y) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (x < w / 3) return 'ArrowLeft';
  if (x > (2 * w) / 3) return 'ArrowRight';
  if (y < h / 3) return 'ArrowUp';
  if (y > (2 * h) / 3) return 'ArrowDown';
  return 'KeyE';
}

export function isCentreZone(x, y) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return x > w / 3 && x < (2 * w) / 3 && y > h / 3 && y < (2 * h) / 3;
}

// `canWalk` gates the zones to the walk modes: map taps lay waypoints and
// book drags orbit, so zone-keys would fight them there.
// The prompt is the E key you can press: tap it, or hold it to tend.
function bindPromptButton(input) {
  const el = document.getElementById('prompt');
  if (!el) return;
  const lift = () => input.release('KeyE');
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.press('KeyE');
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('pointerup', lift);
  window.addEventListener('pointercancel', lift);
}

export function bindTouchZones(canvas, input, canWalk) {
  const holds = new Map();
  bindPromptButton(input);

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    if (!canWalk()) return;
    const code = zoneCode(e.clientX, e.clientY);
    holds.set(e.pointerId, code);
    input.press(code);
  });

  function release(e) {
    const code = holds.get(e.pointerId);
    if (code === undefined) return;
    holds.delete(e.pointerId);
    // lift the key only when no other finger is holding the same zone
    for (const heldCode of holds.values()) {
      if (heldCode === code) return;
    }
    input.release(code);
  }
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
}
