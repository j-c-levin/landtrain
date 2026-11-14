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
        walk: '',
        climb: 'find a ladder and climb to the roof',
        cab: 'the cab is up front, along the roof',
      }
    : {
        walk: 'A and D walk the train',
        climb: 'find a ladder — W climbs to the roof',
        cab: 'the cab is up front, along the roof',
      };
  let step = recall() ? 'done' : 'walk';
  let walked = 0;
  let lastX = player.x;

  function ladderHere() {
    for (let i = 0; i < LADDERS.length; i++) {
      if (Math.abs(player.x - LADDERS[i].x) < 1.1) return LADDERS[i];
    }
    return null;
  }

  function ladderCoach() {
    const ladder = ladderHere();
    if (!ladder || player.climbing) return '';
    const at = ladder.levels.indexOf(player.level);
    if (at < 0) return '';
    return at === 0 ? 'up' : at === ladder.levels.length - 1 ? 'down' : 'up down';
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
      if (step !== 'cab' && player.level === 'roof' && !player.climbing) step = 'cab';

      const walking = rig.mode === 'inhabit' && !rig.busy;
      ui.setGuide(walking ? text[step] : '');
      ui.setCoach(!walking ? '' : (step !== 'cab' && ladderCoach()) || (step === 'walk' ? 'walk' : ''));
    },
  };
}
