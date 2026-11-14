// Stations live at train-local X positions on a given storey. One verb: E.
// Cab and book are taps; engine / treads / plants are gentle hold-to-tend.
export const STATIONS = [
  { id: 'cab', x: 20.5, level: 'roof', radius: 3.0, label: 'take the wheel & plot the route' },
  { id: 'engine', x: -0.8, level: 'deck', radius: 3.2, label: 'tend the engine' },
  { id: 'plants', x: -12.4, level: 'deck', radius: 2.6, label: 'water the plants' },
  { id: 'book', x: -20.2, level: 'deck', radius: 2.6, label: 'sit & read awhile' },
  { id: 'rest', x: 20.1, level: 'deck', radius: 2.6, label: 'rest in the bunk' },
  { id: 'tread', x: 16.6, level: 'under', radius: 5.2, label: 'repair the treads' },
  { id: 'tread2', x: -16.6, level: 'under', radius: 5.2, label: 'repair the treads' },
];

// Both rest spots share the outside view; each has its own pose and verse.
export const REST_SPOTS = {
  book: {
    pose: null, // player default: the reading chair
    line: '… the plains roll by, page after page …',
    exit: 'set the book down',
  },
  rest: {
    pose: { x: 20.1, y: 2.5, z: -1.05 },
    line: '… the carriages rumble on, somewhere beneath sleep …',
    exit: 'rise from the bunk',
  },
};
