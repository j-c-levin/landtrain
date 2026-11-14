import { WORLD, clamp } from '../constants.js';
import { CHART } from '../look.js';
import { createChartPen } from './chart-pen.js';
import { createChartFurniture } from './chart-furniture.js';
import { pickGround } from './map-view.js';
import { setChartView, setRouteGhost } from './route-display.js';

const HOME_HEIGHT = 330;

export function createChart({ renderer, canvas, train, fog }) {
  const furniture = createChartFurniture();
  let pen = null;
  let hover = false;
  let hoverX = 0;
  let hoverY = 0;

  canvas.addEventListener('pointermove', (e) => {
    hover = e.pointerType === 'mouse';
    hoverX = e.clientX;
    hoverY = e.clientY;
  });
  canvas.addEventListener('pointerleave', () => {
    hover = false;
  });

  return {
    update(rig, camera, night, goal, obstacles) {
      setChartView(train, clamp(rig.mapHeight / HOME_HEIGHT, 0.5, 2.1), night, goal, obstacles, fog);
      const hit = hover && rig.mode === 'map' && !rig.busy ? pickGround(camera, hoverX, hoverY) : null;
      if (hit) {
        setRouteGhost(
          train, true,
          clamp(hit.x, WORLD.minX + 40, WORLD.maxX - 40),
          clamp(hit.z, WORLD.minZ + 40, WORLD.maxZ - 40)
        );
      } else {
        setRouteGhost(train, false);
      }
      furniture.update(rig.mapBlend, rig.mapHeight, camera.fov, train.pos, goal);
    },
    // false when the frame needs no pen, so the caller draws it plainly
    render(scene, camera) {
      if (CHART.uChart.value <= 0) return false;
      pen ??= createChartPen(renderer);
      pen.render(scene, camera);
      return true;
    },
    dispose() {
      pen?.dispose();
      pen = null;
    },
  };
}
