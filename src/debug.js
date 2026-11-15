import { WORLD } from './constants.js';
import { isCentreZone } from './ui/touch-zones.js';

function warpShortOfGoal(train, journey) {
  const goal = journey.goalPos;
  train.reset({ x: goal.x - 150, z: goal.z, heading: 0 });
  return goal;
}

// Three centre taps within a second, standing under the rear car, warp the train short of the goal.
export function bindSecretWarp({ rig, player, train, ui, journey }) {
  const tapTimes = [];
  window.addEventListener('pointerup', (e) => {
    if ((rig.mode !== 'inhabit' && rig.mode !== 'cabin') || rig.busy) return;
    if (!isCentreZone(e.clientX, e.clientY)) return;
    if (player.level !== 'under' || player.x > -21) return;

    const now = performance.now();
    tapTimes.push(now);
    while (tapTimes.length && now - tapTimes[0] > 1000) tapTimes.shift();

    if (tapTimes.length >= 3) {
      tapTimes.length = 0;
      warpShortOfGoal(train, journey);
      ui.toast('warped to tree');
    }
  });
}

// The verification handle the capture harness and tests drive.
export function installDebugHandle({ train, player, rig, fog, state, sky, camera, journey, quality }) {
  window.__game = {
    train, player, rig, fog, state, sky, camera, WORLD, quality,
    get grassland() { return journey.grassland; },
    get obstacles() { return journey.obstacles; },
    get goalPos() { return journey.goalPos; },
    warpToTree: () => {
      const goal = warpShortOfGoal(train, journey);
      return `warped to (${Math.round(train.pos.x)}, ${Math.round(train.pos.z)}); goal at (${goal.x}, ${goal.z}). Route cleared — drive in from the cab, or run __game.driveToTree().`;
    },
    driveToTree: () => {
      const goal = warpShortOfGoal(train, journey);
      train.addWaypoint(goal.x, goal.z);
      return `driving into goal at (${goal.x}, ${goal.z})…`;
    },
  };
}
