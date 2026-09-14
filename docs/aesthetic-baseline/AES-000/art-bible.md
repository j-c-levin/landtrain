# Land Train Aesthetic Art Bible

## North Star

Land Train is a warm, handmade home crossing an immense storybook wilderness. Preserve cozy low-poly construction, selective flat shading, painterly atmosphere, readable silhouettes, continuous camera geography, gentle stakes, deterministic procedural scenery, and an offline build. Add richness through shape, composition, tactile contrast, motion, and sound rather than realism or indiscriminate detail.

## Palette

These anchors are sampled from current runtime materials and CSS. Use exact anchors for shared identity; derive local variants by modest value/saturation shifts rather than introducing unrelated hues.

### Train and Interface

| Role | Hex | Existing source | Rule |
|---|---|---|---|
| Rust hull | `#b5573c` | Train hull, CSS `--rust` | Primary exterior mass and important warm accent |
| Dark rust | `#96452f` | Train hull shadow | Undercuts, roof edges, mass separation |
| Cream | `#f2e3c6` | Train exterior | Large quiet panels; do not tint to pure white |
| Parchment | `#efdcba` | CSS `--parchment` | Cards and soft UI surfaces |
| Inner wall | `#e9d3ac` | Train interior | Warm interior planes |
| Ink | `#3d2f28` | CSS `--ink` | Text and dark warm linework |
| Mid wood | `#9a6b4f` | Train fixtures | Furniture and structural warmth |
| Dark wood | `#7c5238` | Train fixtures | Frames, undersides, contrast edges |
| Iron | `#4a3f3a` | Train mechanics | Wheels, treads, mechanical anchors |
| Brass | `#c9913e` | Train trim, CSS `--brass` | Sparse focal hardware and UI rules |
| Sage | `#8a9a6b` | Blanket, CSS `--sage` | Quiet textile/plant counterpoint |
| Plum | `#241d2e` | CSS `--plum` | Overlays, vignette, deepest chromatic dark |
| Warm practical | `#ffd9a0` | Train glow | Visible lamp surface |
| Warm emission | `#ffb35c` | Train glow emissive | Halo/emission, never a broad base color |

Target distribution on the train is approximately 55-70% cream/inner-wall quiet mass, 20-30% rust and wood structure, 5-12% iron/dark anchors, and at most 3-5% brass plus emissive accents. Brass is punctuation, not paneling.

### Prairie

| Role | Hex | Existing source |
|---|---|---|
| Dry grass ground | `#c9af72` | Prairie ground |
| Meadow olive | `#b8a868` | Meadow patch |
| Sage olive | `#a9a673` | Meadow patch |
| Deep olive | `#9d9c66` | Meadow patch |
| Warm straw | `#d0b376` | Meadow patch |
| Dust gold | `#bfa05f` | Meadow patch |
| Warm rock | `#8d7f72` | Rock cluster |
| Dark rock | `#6f6258` | Rock cluster |
| Distant hill | `#b3a584` | Prairie hills |
| Great Tree trunk | `#6e4a33` | Prairie landmark |
| Great Tree leaf | `#9fae5e` | Prairie landmark |
| Mesa rust | `#a5765a` | Prairie landmark |

Prairie accents should stay dusty, sun-bleached, and low-to-medium saturation so the train remains the warm authored focal point. Avoid generic vivid green.

### Grassland and Water

| Role | Hex | Existing source |
|---|---|---|
| Grass field | `#6a9148` | Grassland ground |
| Light meadow | `#7fae5c` | Meadow patch |
| Deep meadow | `#55803c` | Meadow patch |
| Pale meadow | `#9cc078` | Meadow patch |
| Wet mud | `#4f5a34` | River bank floor |
| Shore highlight | `#79a35b` | River lip |
| River blue | `#5b93a8` | Water surface |
| Moss stone | `#6f7a5c` | Boulder |
| Dark moss stone | `#586349` | Boulder shadow |
| Causeway wood | `#9c6b3f` | Bridge deck |
| Silver leaf | `#a9c0dc` | Grassland landmark |
| Blossom highlight | `#e8f0fa` | Grassland landmark |
| Cool lantern | `#d6ecff` | Grassland landmark |

Grassland is cooler, fresher, and denser than prairie, but warm wood bridges and the rust train must remain the navigational contrast. Water stays muted teal-blue, not tropical cyan.

### Map

Use the same world colors under fog rather than a detached UI palette. Route and selection marks use parchment `#f7ead2` and muted gold `#ecd9a0`; controls use translucent plum. Markers must remain legible at a glance without turning into neon HUD elements.

### Time of Day

| Phase | Zenith | Upper | Lower | Horizon/Fog | Practical-light relationship |
|---|---|---|---|---|---|
| Prairie day | `#1d5cb8` | `#3f88d6` | `#93c4ec` | `#dcebd8` / `#d4e4d4` | Present but subordinate |
| Prairie dusk | `#2c4a82` | `#6a6fa0` | `#e08f6e` | `#ff9e54` / `#e89a66` | Warm windows begin to lead |
| Prairie night | `#060b1c` | `#0b1530` | `#122044` | `#1b2c52` | Warm windows and lanterns are primary focal lights |
| Grassland day | `#1c64a8` | `#4a98c4` | `#a6dcd4` | `#d4eede` / `#bfe3da` | Cool environment, warm train contrast |
| Grassland dusk | `#285a86` | `#5c84a4` | `#9cc8b0` | `#c6dcaa` / `#c2dcb2` | Restrained green-gold transition |
| Grassland night | `#050c1a` | `#0a162c` | `#10243e` | `#173050` | Cool landmark and warm train form separate glow families |

Interpolate through authored dusk/dawn keys. Do not replace the timeline with a simple day-blue to black blend.

## Silhouette Rules

- The complete train must read as three articulated, unequal domestic volumes on a long tracked base: raised front cab, lower engine stack, and tall rear home. Preserve this rhythm in every train pass.
- Keep rooflines, coupler gaps, ladders, chimney, front lamp, and wheel/tread mass readable against sky or ground. Do not fill the profile with evenly distributed greebles.
- Use 2-4 large shape layers before medium detail: terrain mass, landmark mass, train mass, then accents. Every hero object needs a recognizable black-fill silhouette.
- Prairie landmarks favor broad low horizons punctuated by rocks/ridges and one enormous tree. Grassland favors horizontal water bands, vertical reeds/willows, bridges, and the silver tree island.
- Hero trees retain asymmetry: a dominant crown plus offset secondary blobs, visible trunk, grounded knoll, and sparse orbiting lights.
- From map height, route, train, destination, barriers, water, and crossings outrank decorative flora. Decoration must not imitate route or marker shapes.
- In inhabit mode, preserve the dollhouse cutaway and room-to-room rhythm. Occluding wall treatment must reveal the occupied space without dissolving the train's overall shell.

## Readable Detail Scale

Use CSS pixels at the final viewport as the authority, not world units alone.

- Critical silhouette feature: at least 8 px in its narrow dimension at the intended camera; aim for 12 px on touch/mobile.
- Interactive prop or navigation cue: at least 12 px and distinguishable by shape plus value, not color alone.
- Decorative repeated detail: at least 3 px; below 3 px, merge it into vertex color, material variation, or a larger cluster.
- Lines that carry navigation meaning: at least 2 CSS px at DPR 1 and visually continuous after antialiasing.
- Text: preserve the existing 16 px root/body neighborhood; do not reduce essential mobile labels below 14 px. Touch hit areas remain at least 44 x 44 CSS px.
- Test every critical cue at 390 x 844 and 844 x 390. If it cannot meet the minimum, simplify or substitute a lower-cost, larger cue rather than adding density.

## Material Language

| Family | Roughness | Metalness | Treatment |
|---|---:|---:|---|
| Painted hull / cream panels | 0.72-0.90 | 0.00-0.05 | Broad matte planes, restrained value variation, no automotive clearcoat |
| Interior plaster/paper | 0.90-1.00 | 0.00 | Soft, warm, quiet backdrop |
| Wood | 0.82-0.95 | 0.00 | Shape and value imply grain; avoid expensive high-frequency maps |
| Iron / tread hardware | 0.52-0.72 | 0.25-0.45 | Dark, weighty, selectively edge-readable |
| Brass | 0.32-0.48 | 0.50-0.70 | Small authored accents at controls, lamps, and joins |
| Stone / soil / foliage | 0.82-1.00 | 0.00 | Flat shading or vertex-color variation preferred |
| Water | 0.20-0.35 | 0.05-0.15 | Muted color, animated normals, layered sparingly; no mirror requirement |
| Lamp surface | 0.40-0.60 | 0.00 | Emissive focal core with restrained halo |

Keep materials tactile through silhouette, roughness contrast, flat facets, and low-frequency color variation. Do not use noisy photoreal textures. Share materials and geometry where repeated.

## Brass And Glow

- Brass appears where hands touch, mechanisms join, or a focal edge needs punctuation. Do not use brass on broad cladding, terrain, or every trim edge.
- Glow hierarchy: destination landmark first at long range; route/crossing lantern second when navigation is needed; train windows and headlamp third as home/vehicle identity; firebox and interaction feedback fourth; decorative sparkles last.
- Only one glow family should dominate a composition. Prairie/train glow is amber (`#ffb35c`); the second tree may use cool blue (`#9fd4ff`) but must not neutralize the train's warm-home contrast.
- Prefer emissive material plus sprite halo. New dynamic shadow-casting lights require profiling evidence; decorative lights should not cast shadows.
- Avoid clipped white cores and large opaque bloom fields. Glows must retain a colored core and readable source object.

## Composition By View

- Inhabit: occupied room is the focal third; retain adjacent-car context and moving wilderness. Keep the player and current station clear of window-frame tangencies.
- Cab: frame interior controls/window as foreground, route direction as middle ground, and destination/horizon as background. Forward readability outranks cabin ornament.
- Map: route and crossings create the primary path; destination and train are the endpoints; biome texture remains subordinate. Controls must not cover the route or each other in portrait.
- Book: train occupies roughly half the frame at default travel angle and landscape occupies the other half. Preserve a low rear-quarter sense of travel and allow manual framing to stick.
- Intro/arrival/ending: cards are pauses over the continuous world. Maintain parchment/rust identity, short line lengths, and visible atmospheric context without reducing text contrast.

## Motion Limits

Motion should feel handmade and alive, never unstable or urgent.

- Train suspension baseline maxima are approximately roll 0.0105 rad (0.60 degrees), pitch 0.0055 rad (0.32 degrees), and bob 0.024 world units. Later passes should remain within 1.5x these maxima unless a brief authored event clearly warrants more.
- Player idle bob remains around 0.015 world units; walking bob around 0.07 and body sway around 0.05 rad. Interaction motions should stay comparable to walking amplitude, not exceed the character's silhouette width.
- Book auto-orbit is 0.03 rad/s. Ambient camera drift must remain slower than deliberate player camera input and stop under reduced motion.
- Existing camera transitions range from 1.6 to 2.4 seconds with smooth easing. Preserve continuity between inhabit, cab, map, and book.
- Map train ring pulses +/-12% at 2.4 rad/s; destination beacon pulses +/-10% at 1.7 rad/s. Do not stack additional pulsing at similar prominence.
- Smoke is pooled, speed-responsive, and expands from 1.4 to 6.5 world units. Continuous new effects must use fixed-size pools and avoid per-frame allocations.
- Ambient flora, cloth, lantern, water, and character motion should use distinct low frequencies. Avoid synchronized sine motion across a whole biome.
- Honor `prefers-reduced-motion`: disable ornamental orbit/pulse/sway where practical while retaining essential state feedback without motion.

## Review Checklist

- Does the scene strengthen “warm handmade home in immense storybook wilderness” at both phone orientations and desktop?
- Are rust, cream, parchment, wood, iron, brass, plum, and sage still the shared identity?
- Does the silhouette read before surface detail?
- Are critical cues above minimum screen-space size and distinguishable without color alone?
- Are brass and glow sparse and hierarchically assigned?
- Are material values within the family ranges, with no unnecessary realism/noise?
- Is motion gentle, asynchronous, reduced-motion aware, and within amplitude limits?
- Is procedural placement deterministic and offline-compatible?
- Are repeated details instanced/merged and all owned GPU resources disposable?
- Has the change been checked at 390 x 844, 844 x 390, 1024 x 768, and 1440 x 900 with measured performance evidence where relevant?
