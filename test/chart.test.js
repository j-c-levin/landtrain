import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearingName, goalLine, scaleBar } from '../src/map/chart-furniture.js';
import { LEAGUE, ARRIVE_RADIUS, leaguesToGo } from '../src/constants.js';

test('bearings read as the chart is drawn: +x east, -z north', () => {
  assert.equal(bearingName(100, 0), 'east');
  assert.equal(bearingName(0, -100), 'north');
  assert.equal(bearingName(-100, 0), 'west');
  assert.equal(bearingName(0, 100), 'south');
  assert.equal(bearingName(100, 100), 'south-east');
  assert.equal(bearingName(-100, -100), 'north-west');
});

test('goal line counts leagues to the arrival ring until the tree is reached', () => {
  assert.equal(goalLine(25 * LEAGUE + ARRIVE_RADIUS, 0), 'Great Tree · 25 leagues east');
  assert.equal(goalLine(0, -(ARRIVE_RADIUS + 170)), 'Great Tree · 1.7 leagues north');
  assert.equal(goalLine(300, 300), 'Great Tree · 2.6 leagues south-east');
  assert.equal(goalLine(60, 0), 'at the Great Tree');
  assert.equal(goalLine(ARRIVE_RADIUS + 100, 0, 'Silver Tree'), 'Silver Tree · 1 league east');
  assert.equal(goalLine(60, 0, 'Silver Tree'), 'at the Silver Tree');
});

test('the plaque and the chart print the same distance', () => {
  for (const d of [2440, 1200, 1159, 400, 165, 161]) {
    assert.ok(goalLine(d, 0).includes(` ${leaguesToGo(d)} `), `${d}`);
  }
  assert.equal(leaguesToGo(2440), '23 leagues');
  assert.equal(leaguesToGo(161), '0.1 leagues');
  assert.equal(leaguesToGo(100), '');
});

test('scale bar picks the longest bar that fits', () => {
  assert.equal(scaleBar(0.28), 5);
  assert.equal(scaleBar(0.65), 4);
  assert.equal(scaleBar(0.128), 6);
  assert.equal(scaleBar(9), 0);
  assert.equal(scaleBar(0.01), 6);
});
