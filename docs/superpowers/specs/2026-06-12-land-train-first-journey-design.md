# Land Train: First Journey — Vertical Slice Spec

**Status:** Ready for prototype build
**Date:** 2026-06-12
**Target:** A single **3D game that runs in a web browser** (Node.js toolchain). **three.js** and **Phaser 4** are both libraries available to consider — three.js being the natural fit for a 3D scene — but the choice of what to use and how is entirely the implementer's. Critically: **both views described below are cameras on one shared 3D world.** Do not reach for separate engines or a separate 2D layer per view.
**Audience:** A model tasked with one-shotting a playable prototype.

> **Build directive.** Produce **one complete, runnable 3D browser prototype** that delivers the experience described here, **playable end-to-end** (start → arrive at the destination). Where this spec doesn't specify something, make a sensible, cozy-leaning choice and keep moving — a **coherent, complete, playable loop matters far more than fidelity, polish, or feature count.** It should run locally with minimal setup. Build the whole thing; don't stub or fake the hard parts (the view transition, the self-driving route-following, and the fog reveal especially).

> **How to read this document.** It describes *what the prototype must do and what experience it must deliver* — not how to build it. There are deliberately **no prescriptions about code architecture, file layout, state management, or engine integration patterns.** Where this spec is silent on a technical choice, that choice is yours. Where it is silent on a *design* choice, prefer the simplest thing that satisfies the stated experience, and keep it cozy.

---

## 1. Purpose of this prototype

This is the **first vertical slice** of a larger cozy life-sim about living aboard a land train that crawls across a wilderness (long-term pitch: *Mortal Engines* meets *Stardew Valley* and *Animal Crossing*). The full game has decoration, crew, cooking, farming, combat, upgrades, and an endgame — **none of which are in this slice.**

This slice exists to validate **one thing**: that it is **cozy and fun, on repeat,** to *fluidly shift the player's focus* between two embodiments —

- **"I am the land train"** — planning where it goes across the world, and
- **"I am a person on the train"** — walking through its spaces tending to it, or just being in them while the world rolls past.

If playing this slice for ~10 minutes makes a player feel *"it's pleasant to be here, and the rhythm of popping up to the cab, setting a route, and going back to potter around is soothing and I'd happily do it again"* — the prototype has succeeded. Everything below serves that question.

**North stars:**
- **FAR: Lone Sails / FAR: Changing Tides** — the side-on cutaway vehicle you walk around inside and operate from stations; the feeling of a vehicle as a walkable home.
- **Spiritfarer** — the gentle fog-of-war map travel, the unhurried coziness, the "set it going and go do something else" cadence.

---

## 2. Core experience pillars

1. **Embodiment-shift is the whole point.** The player constantly chooses *where they are* and *what their focus is*. Moving between "driving the whole vehicle" and "being a person somewhere on it" must feel fluid, natural, and never like fighting a menu.
2. **The world moves around you; you choose your place in it.** The train is self-driving once routed. The player is free to ignore the journey and just *be* aboard.
3. **Cozy, never punishing.** There are **no fail states, no death, no stranding, no hard resources.** Neglect makes the journey slower and slightly droopier — never lost.
4. **A bounded journey gives shape.** A single short trip to a visible destination bookends the slice, so the player has something to aim for and a clear "I arrived" payoff.

---

## 3. The two views

The prototype has exactly **two views**. Both are **cameras on the same single 3D world** — not different scenes, layers, or engines. The seam between them is the experience being tested.

### 3.1 Inhabit view (default — side-on cutaway camera)
- A **side-on (profile) camera** on the train, framed so the player sees *into* every car at once — the near-side walls cut away, like a doll's house / FAR. It **reads** like a 2D sidescroller, but it is **a camera on the 3D world**, achieved through framing and hiding the near walls — not a separate 2D presentation.
- The player controls **one character** who walks **left and right** along the length of the train, **climbs ladders** up onto the **rooftops** and down to the **underside**, and **crosses between cars**. (Gameplay movement is effectively constrained to the train's length axis — the "2.5D" feel of FAR.)
- The **wilderness slides past behind the train** (real 3D depth) while it's moving, so even from inside you feel the world going by.
- The character can **interact with stations** (the cab, the engine, the plants, the book, the tread) when standing at them, via a single context interaction.
- This is where the player spends **most** of their time.

### 3.2 Drive / Map view (entered from the cab — overhead camera)
- Entered by walking the character **into the cab and interacting**. The **same camera pulls back and up** off the side-on framing into an **overhead view** of the world — the train now a small token in a wider landscape. This is a camera move within the one 3D world, not a new scene.
- While in this view, **the train is paused.**
- The map shows **everything discovered so far**, with **fog of war** hiding everything ahead/unexplored.
- The player **clicks to lay down a sequence of waypoints** — a route the train will follow. They can clear/redo the route freely. Known (already-revealed) terrain is fully and freely routable; only forward ground is fogged.
- On **exiting the cab** (back to Inhabit view), **the train immediately begins driving the laid route on its own.** As it advances, **fog peels back** to reveal terrain ahead.
- Re-entering the cab at any time **pauses** the train again and shows the now-larger revealed map for re-planning.

**The transition between these two views — pull back into the map on entering the cab, drop back into the cutaway on leaving — is the single most important thing to get feeling smooth and pleasant.** Because it is all one 3D world, this should be a **continuous camera move** (a tween between the two framings), not a cut or a load — the player should feel the world is continuous and they are simply changing where they stand within it.

---

## 4. The train

Three cars plus exterior traversal, front to back. Each "where" exists because it gives the player a distinct reason to put their focus there.

| # | Car | What the player does there |
|---|-----|----------------------------|
| 1 | **Cab** (front) | Interact → enter **Drive/Map view** to plan the route. |
| 2 | **Engine car** | Perform an **engine-efficiency maintenance** interaction. |
| 3 | **Living car** | **Water the plants** (cozy) and **read the book** (cozy). |
| — | **Exterior** (rooftops + underside) | **Repair tread/wheel wear** from the underside. Reached via ladders between cars. |

- The cars are spaced so that **walking between them is a small, felt journey** — part of the point is the traversal, not just the destinations.
- Traversal includes **going outside**: up a ladder onto the rooftop, across, and down to the underside. Exterior traversal should feel a touch more deliberate/adventurous than strolling the interior corridor (e.g., you climb rather than walk).

---

## 5. Upkeep model

Four things to tend, spread across the train. **Two gently shape the journey; two are purely for the soul. None can fail.**

### 5.1 Engine efficiency *(functional)*
- A gauge that **slowly drifts down as the train travels.**
- The player walks to the **engine car** and performs a **maintenance interaction** to raise it back up.
- **Effect:** higher efficiency → the train **travels faster** along its route. Lower efficiency → it **crawls.** It never reaches a "stopped/stranded" state — there is always *some* forward motion.

### 5.2 Tread / wheel wear *(functional)*
- **Accrues with distance travelled.**
- Repaired from the **underside** (exterior traversal) via an interaction.
- **Effect:** worn treads impose a **gentle speed/drag penalty.** Like efficiency, it only ever slows you — never stops you. It also has a **visible worn appearance** that cleans up when repaired.

### 5.3 Plant happiness *(pure cozy — no mechanical effect)*
- Plants in the living car **slowly droop** if ignored.
- **Watering** them perks them back up.
- **Effect on gameplay: none.** This affects only the **visuals and vibe.** Plants never die.

### 5.4 Reading the book *(pure cozy — no gauge)*
- In the living car, the player can **sit and read.**
- This triggers a **camera move that pans back to reveal the land train rolling across the plains** — the signature "watch the world go by" cozy moment.
- No gauge, no effect, purely an inviting thing to *do nothing* with while the train drives itself.

> **Design intent of the upkeep model:** the player should feel a soft, optional pull to keep things tidy and humming, and should *feel the difference* between a well-kept train (glides, lush, tidy) and a neglected one (crawls, droopy, worn) — without ever being punished for choosing to just relax.

---

## 6. The world and the journey

- A **single bounded stretch of plains**, traversed start-to-finish in roughly **8–12 minutes** of relaxed play.
- A **destination landmark is visible on the horizon** from early on — the thing you're travelling toward. Reaching it **completes the slice** (a gentle arrival beat; the player may keep pottering afterward — no hard "game over" screen).
- **Fog of war:** the player can see only as far ahead as the train has revealed. Behind/around explored ground is permanently known and freely re-routable.
- **The "maze" is light:**
  - A **few scattered large obstacles** (e.g., rock formations) the route must go *around*.
  - Near the end, **a couple of large impassable walls / mountains**: if the player routes naively into them, the train arrives, can't pass, and the player **backtracks through known space and reroutes** another way. This is a mild "ah, go around" puzzle, not a challenge.
- **Cadence target:** the obstacles and the reveal radius should be tuned so the player naturally returns to the cab **every few minutes** to extend the route — frequent enough to feel a rhythm, sparse enough to never feel like work.

---

## 7. The moment-to-moment loop (the thing being validated)

1. In the **cab**, lay a route into the most recently revealed ground.
2. **Leave the cab** — the train starts rolling itself along the route; fog peels back ahead.
3. Go **be somewhere on the train**: tend the engine, climb out to fix a tread, water the plants, or sit and read while the camera shows the train gliding across the plains.
4. Every few minutes, the train nears the edge of your planned route (or bumps an obstacle) — **return to the cab**, extend/reroute, repeat.
5. **Arrive** at the horizon landmark → gentle payoff.

The prototype is a success if **this loop is pleasant to repeat** and the **view-shift feels good.**

---

## 8. Controls & platform

- **Target platform for the prototype:** desktop, **keyboard + mouse.**
  - **Mouse:** click to lay/clear waypoints on the map; click stations/interactions where natural.
  - **Keyboard:** walk the character left/right, climb ladders, and a single "interact" action at stations.
- Controls should be **minimal and discoverable** — a player should understand the whole verb set within the first minute.
- **Explicitly future, not in this slice:** phone tilt-to-steer, holding the sides of the screen to turn, and a "plane" variant of the vehicle. Do **not** build these.

---

## 9. Tone, look, and feel

- **Cozy, warm, unhurried.** Soft palette, gentle motion, readable silhouettes.
- The cutaway interior should feel **lived-in and inviting** even though it's nearly empty of "content" — warm light, a comfy chair, plants, the glow of the engine.
- The plains rolling past (in both the parallax background of the Inhabit view and the overhead Map view) should make **"watching the world go by" genuinely pleasant** — this is half of what's being tested.
- Audio (if included): ambient, soothing — the trundle of the train, wind over the plains, the crackle of the engine. No urgency stings, no alarms.
- **Fidelity is secondary to feel.** Placeholder/primitive art is fine if the *motion, pacing, and coziness* land. A beautiful static scene that isn't pleasant to *move through and shift focus within* would be a failure; an ugly one that nails the rhythm would be a success.

---

## 10. Success criteria (how we'll judge the prototype)

A reviewer playing for ~10 minutes should be able to, **without instruction beyond a one-line "drive your land train to the landmark, and look after it along the way":**

1. Walk the character through all three cars and out onto the rooftop/underside.
2. Enter the cab, watch the camera pull back to the map, lay a multi-waypoint route into fogged ground, and exit to watch the train **drive that route itself** while fog reveals ahead.
3. **Feel the embodiment-shift** between driving/planning and being-a-person, and find it smooth.
4. Tend the **engine** and a **tread**, and *notice the train travelling faster/smoother* as a result; ignore them and *notice it dragging* — without ever being stranded.
5. **Water the plants** and **read the book**, and have the book trigger the **pan-back "watch the world roll by"** moment.
6. Hit at least one **"route into a wall → back up and go around"** moment and resolve it via the known map.
7. **Arrive** at the destination landmark and get a gentle sense of completion.
8. Come away with a clear gut read on the central question: **"is this cozy, and would I happily do this loop again?"**

---

## 11. Explicitly out of scope

To protect the slice from ballooning, **none** of the following are in this prototype (they are later layers of the full game):

- Decorating or furnishing interiors; placing/arranging objects.
- Hiring, managing, or autonomous crew.
- Cooking; food-growing as a system (the plants here are cosmetic only).
- Combat, weapons, offence/defence.
- Scouting for resources; harvesting; any economy or inventory.
- Multiple/variable train sizes; adding, removing, or upgrading cars.
- Secondary engines, drilling, deployable bridges, found old-tech integration.
- Settlements to visit; other land trains to encounter.
- Temperature/cold hazards, cliffs, rockfalls, the cold-mountain endgame.
- Hard resources (fuel/diesel that can run out), fail states, death.
- Mobile/tilt controls; the plane variant.

If a feature isn't named in sections 3–9, assume it's out.

---

## 12. Decisions deliberately left open to the implementer

These are non-load-bearing; pick whatever best serves coziness and ship it:

- Exact art style and fidelity (primitives are acceptable).
- Exact gauge tuning (drift rates, repair amounts, speed multipliers) — tune by feel toward the cadence in §6.
- Precise interaction verb for maintenance (hold-to-service, a click, a tiny minigame) — keep it light and quick.
- Map projection details and how waypoints render — as long as routing is clear and clicky.
- How "arrival" is celebrated (a title card, a camera move, a gentle chime) — keep it warm and low-key.
- Whether the character has any idle charm (animations, looking out windows) — welcome but optional.
