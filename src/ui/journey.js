import { createGrassland } from '../grassland/grassland.js';

// The progression: 'prairie' (driving to the first tree) → 'streaming' (the
// grassland builds behind the arrival card) → 'grassland' → 'done'. Each goal
// arrival fires exactly once.
export function createJourney({ scene, world, train, fog, ui, audio }) {
  let grassland = null;
  let obstacles = world.obstacles;
  let goalPos = world.landmarkPos;
  let stage = 'prairie';

  // Two rAFs so the browser has painted the arrival card before the main
  // thread blocks on a biome's worth of geometry; the card locks its own
  // dismiss for 600ms, well past this.
  function streamGrassland() {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        grassland = createGrassland(scene);
        world.disposeBefore();
        obstacles = world.obstacles.concat(grassland.obstacles);
        goalPos = grassland.landmarkPos;
        stage = 'grassland';
      })
    );
  }

  const LEAGUE = 400;
  let legStart = 0;
  let legGoal = null;
  let hudTick = 0;
  let shownTenths = -1;
  let shownName = '';
  let distText = '';

  function updateHud() {
    if (ui.cardUp || hudTick-- > 0) return;
    hudTick = 12;
    const d = Math.hypot(train.pos.x - goalPos.x, train.pos.z - goalPos.z);
    if (legGoal !== goalPos || d > legStart) {
      legGoal = goalPos;
      legStart = d;
    }
    const near = world.arriveRadius;
    const name = stage === 'grassland' || stage === 'done' ? 'the Silver Tree' : 'the Great Tree';
    const there = d < near || stage === 'done' || stage === 'streaming';
    const tenths = there ? 0 : Math.max(1, Math.round(((d - near) / LEAGUE) * 10));
    if (tenths !== shownTenths || name !== shownName) {
      shownTenths = tenths;
      shownName = name;
      distText = there ? `at ${name}` : `${(tenths / 10).toFixed(1)} leagues to ${name}`;
    }
    const status = train.blocked
      ? 'the way is blocked'
      : train.route.length === 0
        ? there ? 'at rest beneath the boughs' : 'at rest — no route plotted'
        : train.paused ? 'route plotted' : 'under way';
    ui.setJourney(
      there ? 1 : 1 - (d - near) / Math.max(1, legStart - near),
      distText,
      status
    );
  }

  train.onEvent = (name) => {
    if (name === 'blocked') {
      audio.chime('soft');
      ui.toast('The way ahead is blocked — head to the cab and plot a way around.');
    } else if (name === 'route-finished' && stage !== 'done') {
      ui.toast('End of the plotted route. The train rests — extend it from the cab.');
    }
  };

  return {
    get grassland() { return grassland; },
    get obstacles() { return obstacles; },
    get goalPos() { return goalPos; },
    get stage() { return stage; },

    update() {
      updateHud();
      if (stage === 'done' || stage === 'streaming') return;
      const d = Math.hypot(train.pos.x - goalPos.x, train.pos.z - goalPos.z);
      if (!(d < world.arriveRadius)) return;
      // clearing the route coasts the train to a stop at the tree
      train.clearRoute();
      audio.chime('arrive');
      if (stage === 'prairie') {
        audio.setBiome('grassland');
        ui.arrival();
        stage = 'streaming';
        streamGrassland();
      } else {
        fog.reveal(goalPos.x, goalPos.z, 220);
        setTimeout(() => ui.endBeat(), 1400);
        stage = 'done';
      }
    },
  };
}
