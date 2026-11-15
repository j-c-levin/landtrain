import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearingName, goalLine, scaleBar, LEAGUE } from '../src/map/chart-furniture.js';

test('bearings read as the chart is drawn: +x east, -z north', () => {
  assert.equal(bearingName(100, 0), 'east');
  assert.equal(bearingName(0, -100), 'north');
  assert.equal(bearingName(-100, 0), 'west');
  assert.equal(bearingName(0, 100), 'south');
  assert.equal(bearingName(100, 100), 'south-east');
  assert.equal(bearingName(-100, -100), 'north-west');
});

test('goal line counts whole leagues until the tree is reached', () => {
  assert.equal(goalLine(25 * LEAGUE, 0), 'Great Tree · 25 leagues east');
  assert.equal(goalLine(0, -170), 'Great Tree · 2 leagues north');
  assert.equal(goalLine(200, 200), 'Great Tree · 3 leagues south-east');
  assert.equal(goalLine(60, 0), 'at the Great Tree');
  assert.equal(goalLine(200, 0, 'Silver Tree'), 'Silver Tree · 2 leagues east');
  assert.equal(goalLine(60, 0, 'Silver Tree'), 'at the Silver Tree');
});

test('scale bar picks the longest bar that fits', () => {
  assert.equal(scaleBar(0.28), 5);
  assert.equal(scaleBar(0.65), 4);
  assert.equal(scaleBar(0.128), 6);
  assert.equal(scaleBar(9), 0);
  assert.equal(scaleBar(0.01), 6);
});
