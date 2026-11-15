// Fed to the player while it should not be driving, so its rig still re-syncs onto the train.
export const NEUTRAL_INPUT = { down: () => false, pressed: () => false };

// One virtual key set, fed by the keyboard and by synthesized touch zones.
export function createInput() {
  const keys = new Set();
  const pressedThisFrame = new Set();

  window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (!keys.has(e.code)) pressedThisFrame.add(e.code);
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  return {
    down: (code) => keys.has(code),
    pressed: (code) => pressedThisFrame.has(code),
    press(code) {
      if (!keys.has(code)) pressedThisFrame.add(code);
      keys.add(code);
    },
    release: (code) => keys.delete(code),
    endFrame: () => pressedThisFrame.clear(),
  };
}
