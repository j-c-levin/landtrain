import { LADDERS } from '../constants.js';

const KEY = 'landtrain.guide';

function recall() {
  try {
    return localStorage.getItem(KEY) === 'done';
  } catch {
    return false;
  }
}

function remember() {
  try {
    localStorage.setItem(KEY, 'done');
  } catch {
    /* private mode: the guide simply shows again next visit */
  }
}

// First-run nudges, one at a time: walk, climb, find the cab, plot a route.
export function createOnboarding({ ui, rig, train, player }) {
  const text = ui.isTouch
    ? {
        walk: 'hold either side of the screen to walk',
        climb: 'hold the top of the screen at a ladder to climb to the roof',
        cab: 'the cab is up front — walk in and plot a route',
        plot: 'tap the chart to lay a route to the tree',
      }
    : {
        walk: 'A and D walk the train',
        climb: 'W climbs a ladder — head up to the roof',
        cab: 'the cab is up front — walk in and plot a route',
        plot: 'click the chart to lay a route to the tree',
      };
  let step = recall() ? 'done' : 'walk';
  let walked = 0;
  let lastX = player.x;

  function atLadder() {
    for (let i = 0; i < LADDERS.length; i++) {
      if (Math.abs(player.x - LADDERS[i].x) < 1.1) return true;
    }
    return false;
  }

  return {
    update() {
      if (step === 'done') return;
      const dx = Math.abs(player.x - lastX);
      lastX = player.x;
      if (dx < 0.5) walked += dx;

      if (train.route.length > 0) {
        step = 'done';
        remember();
        ui.setGuide('');
        ui.setCoach('');
        return;
      }
      if (step === 'walk' && walked > 3) step = 'climb';
      if (step === 'climb' && player.level === 'roof' && !player.climbing) step = 'cab';

      const inMap = rig.mapEngaged;
      ui.setGuide(inMap ? text.plot : rig.mode === 'book' ? '' : text[step]);
      const walking = rig.mode === 'inhabit' && !rig.busy;
      ui.setCoach(!walking ? '' : step === 'walk' ? 'walk' : step === 'climb' && atLadder() && !player.climbing ? 'climb' : '');
    },
  };
}
