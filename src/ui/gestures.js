const TAP_SLOP = 6;

// One finger (or the mouse) drags; two fingers pinch. Pointers are tracked
// per-id so a second finger can't double-feed the drag. A press that never
// travelled past TAP_SLOP ends as a tap.
export function bindSceneGestures(canvas, { canStart, onDrag, onPinch, onTap }) {
  const pointers = new Map();
  let dragMoved = 0;
  let pinchGap = 0;

  function pinchGapNow() {
    const values = pointers.values();
    const a = values.next().value;
    const b = values.next().value;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    if (!canStart()) return;
    if (pointers.size === 0) dragMoved = 0;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      pinchGap = pinchGapNow();
      dragMoved += 999; // a pinch is never a tap
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    prev.x = e.clientX;
    prev.y = e.clientY;
    dragMoved += Math.abs(dx) + Math.abs(dy);

    if (pointers.size >= 2) {
      const gap = pinchGapNow();
      if (pinchGap > 0 && gap > 0) onPinch(pinchGap / gap);
      pinchGap = gap;
    } else {
      onDrag(dx, dy, dragMoved > TAP_SLOP);
    }
  });

  window.addEventListener('pointerup', (e) => {
    const wasTracked = pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchGap = 0;
    if (!wasTracked) return;
    if (pointers.size > 0) return;
    if (dragMoved > TAP_SLOP || e.button === 2) return;
    onTap(e);
  });
  window.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchGap = 0;
  });
}
