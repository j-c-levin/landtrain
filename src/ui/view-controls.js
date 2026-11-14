import { pickGround } from '../map/map-view.js';
import { bindSceneGestures } from './gestures.js';

// Pointer, wheel, button and hotkey control of the map and book views.
export function bindViewControls({ canvas, camera, rig, train, player, ui, audio }) {
  const viewing = () => (rig.mode === 'map' || rig.mode === 'book') && !rig.busy;
  const planning = () => rig.mode === 'map' && !rig.busy;

  bindSceneGestures(canvas, {
    canStart: viewing,
    onPinch(factor) {
      // fingers apart pulls the view closer
      if (rig.mode === 'map') rig.zoomMap(factor);
      else rig.orbitZoom(factor);
    },
    onDrag(dx, dy, pastSlop) {
      if (rig.mode === 'map' && pastSlop) rig.panMap(dx, dy, window.innerHeight);
      else if (rig.mode === 'book') rig.orbitDrag(dx, dy);
    },
    onTap(e) {
      if (!planning()) return;
      const hit = pickGround(camera, e.clientX, e.clientY);
      if (hit && train.addWaypoint(hit.x, hit.z)) audio.chime('waypoint');
    },
  });

  function toggleOrbitView() {
    if (rig.mode !== 'book' || rig.busy) return;
    const on = rig.toggleAutoOrbit();
    ui.toast(on ? 'gentle orbit' : 'view held', 1600);
  }

  ui.bindViewButtons({
    onOrbit: toggleOrbitView,
    onUndo: () => {
      if (planning()) train.undoWaypoint();
    },
    onClear: () => {
      if (planning()) train.clearRoute();
    },
    onExit: () => {
      if (rig.busy) return;
      if (rig.mode === 'book') {
        player.stand();
        rig.exitBook();
      } else if (rig.mode === 'map') {
        rig.exitMap();
        audio.chime('soft');
      }
    },
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      if (rig.mode === 'map') {
        e.preventDefault();
        rig.zoomMap(Math.exp(e.deltaY * 0.0011));
      } else if (rig.mode === 'book') {
        e.preventDefault();
        rig.orbitZoom(Math.exp(e.deltaY * 0.0011));
      }
    },
    { passive: false }
  );

  return {
    updateHotkeys(input) {
      if (input.pressed('KeyM')) ui.setMuted(audio.toggleMute());
      if (planning()) {
        if (input.pressed('KeyZ') || input.pressed('Backspace')) train.undoWaypoint();
        if (input.pressed('KeyC')) train.clearRoute();
      }
      if (input.pressed('KeyO')) toggleOrbitView();
    },
  };
}
