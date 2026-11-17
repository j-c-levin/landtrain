import * as THREE from 'three';
import { SKY_LOOK } from '../look.js';

const ORDER = 9;
export const SOFTBOX_DIR = new THREE.Vector3(-0.45, 0.62, 0.55).normalize();
export const SOFTBOX_SHARPNESS = 26;

export function envZonal(y) {
  const { envZenith: Z, envHorizon: H, envGround: G } = SKY_LOOK;
  const sky = Math.pow(Math.max(0, y), 0.55);
  const ground = Math.min(1, Math.max(0, -y) * 4);
  return [0, 1, 2].map((c) => {
    const base = H[c] + (Z[c] - H[c]) * sky;
    return base + (G[c] - base) * ground;
  });
}

export function legendreCoefficients(order = ORDER, samples = 8192) {
  const coeffs = Array.from({ length: order }, () => [0, 0, 0]);
  for (let i = 0; i < samples; i++) {
    const y = -1 + (2 * (i + 0.5)) / samples;
    const f = envZonal(y);
    let p0 = 1;
    let p1 = y;
    for (let l = 0; l < order; l++) {
      let p;
      if (l === 0) p = 1;
      else if (l === 1) p = y;
      else {
        p = ((2 * l - 1) * y * p1 - (l - 1) * p0) / l;
        p0 = p1;
        p1 = p;
      }
      const w = ((2 * l + 1) / 2) * (2 / samples) * p;
      for (let c = 0; c < 3; c++) coeffs[l][c] += f[c] * w;
    }
  }
  return coeffs;
}

const vec3 = (v) => `vec3(${v.map((x) => x.toFixed(6)).join(', ')})`;

function analyticChunk() {
  const coeffs = legendreCoefficients();
  return /* glsl */ `
const vec3 ENV_ZONAL[${ORDER}] = vec3[${ORDER}](${coeffs.map(vec3).join(', ')});
const vec3 ENV_BOX_DIR = ${vec3(SOFTBOX_DIR.toArray())};
const vec3 ENV_BOX = ${vec3(SKY_LOOK.envSoftbox)};

vec3 envAnalytic( const in vec3 d, const in float sigma ) {
	float q = -0.5 * sigma * sigma;
	float p0 = 1.0;
	float p1 = d.y;
	vec3 c = ENV_ZONAL[ 0 ] + ENV_ZONAL[ 1 ] * p1 * exp( 2.0 * q );
	for ( int l = 2; l < ${ORDER}; l ++ ) {
		float fl = float( l );
		float p2 = ( ( 2.0 * fl - 1.0 ) * d.y * p1 - ( fl - 1.0 ) * p0 ) / fl;
		c += ENV_ZONAL[ l ] * p2 * exp( fl * ( fl + 1.0 ) * q );
		p0 = p1;
		p1 = p2;
	}
	float k = 1.0 / ( sigma * sigma );
	float lam = ${SOFTBOX_SHARPNESS.toFixed(1)} * k / ( ${SOFTBOX_SHARPNESS.toFixed(1)} + k );
	c += ENV_BOX * ( k / ( ${SOFTBOX_SHARPNESS.toFixed(1)} + k ) ) * exp( lam * ( dot( d, ENV_BOX_DIR ) - 1.0 ) );
	return max( c, vec3( 0.0 ) );
}

float envSigma( const in float roughness ) {
	float mip = roughness >= 0.8 ? ( 1.0 - roughness ) * 5.0 - 2.0 : ( 0.8 - roughness ) * 7.5 - 1.0;
	return mip < - 1.0 ? mix( 0.582, 0.526, mip + 2.0 ) : mip < 0.0 ? mix( 0.526, 0.446, mip + 1.0 ) : mix( 0.446, 0.35, mip );
}
`;
}

export const ANALYTIC_ROUGHNESS = 0.6;

const tap = (x, y) => `texture2DCompare( shadowMap, shadowCoord.xy + vec2( ${x}, ${y} ), shadowCoord.z )`;
const RING = [['0.0', 'dy0'], ['dx2', 'dy2'], ['0.0', 'dy2'], ['dx3', 'dy2'], ['dx0', '0.0'], ['dx2', '0.0'], ['dx3', '0.0'],
  ['dx1', '0.0'], ['dx2', 'dy3'], ['0.0', 'dy3'], ['dx3', 'dy3'], ['0.0', 'dy1']];

// Wholly lit or wholly shaded texels agree at the centre and the four corners, so only an edge pays for the rest.
const PCF_EARLY_OUT = /* glsl */ `float sCentre = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
			float sCorners = ${tap('dx0', 'dy0')} + ${tap('dx1', 'dy0')} + ${tap('dx0', 'dy1')} + ${tap('dx1', 'dy1')};
			shadow = sCentre;
			if ( sCorners != 4.0 * sCentre ) {
				shadow = ( sCentre + sCorners + ${RING.map(([x, y]) => tap(x, y)).join(' + ')} ) * ( 1.0 / 17.0 );
			}`;

// The -0.05 margin keeps the toon ramp's soft terminator, which still lights a hair past grazing.
const FACING = '\t\tdirectLight.visible = directLight.visible && directLight.color != vec3( 0.0 ) && dot( geometryNormal, directLight.direction ) > - 0.05;';

// Irradiance and rough reflections come from the studio sky's closed form; only glossy surfaces sample the map.
export function installLightChunks() {
  const chunk = THREE.ShaderChunk.envmap_physical_pars_fragment;
  if (chunk.includes('envAnalytic')) return;
  THREE.ShaderChunk.lights_fragment_begin = THREE.ShaderChunk.lights_fragment_begin
    .replace(/(get(?:Point|Spot|Directional)LightInfo\( \w+, (?:geometryPosition, )?directLight \);)/g, `$1\n${FACING}`)
    .replaceAll('\t\tRE_Direct( directLight,', '\t\tif ( directLight.visible ) RE_Direct( directLight,');
  THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment
    .replace(/(float getShadow\( sampler2D[^{]*\{\s*float shadow = 1\.0;)/, '$1\n\t\tif ( shadowIntensity <= 0.0 ) return 1.0;')
    .replace(/shadow = \(\s*texture2DCompare\( shadowMap, shadowCoord\.xy \+ vec2\( dx0, dy0 \)[\s\S]*?\) \* \( 1\.0 \/ 17\.0 \);/, PCF_EARLY_OUT);
  THREE.ShaderChunk.envmap_physical_pars_fragment = chunk
    .replace('#ifdef USE_ENVMAP', `#ifdef USE_ENVMAP\n#ifdef ENVMAP_TYPE_CUBE_UV\n${analyticChunk()}\n#endif`)
    .replace(
      /vec4 envMapColor = textureCubeUV\( envMap, envMapRotation \* worldNormal, 1\.0 \);\s*return PI \* envMapColor\.rgb \* envMapIntensity;/,
      'return PI * envAnalytic( envMapRotation * worldNormal, 0.582 ) * envMapIntensity;'
    )
    .replace(
      `reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
`,
      `reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			if ( roughness >= ${ANALYTIC_ROUGHNESS.toFixed(2)} ) return envAnalytic( envMapRotation * reflectVec, envSigma( roughness ) ) * envMapIntensity;
`
    );
}
