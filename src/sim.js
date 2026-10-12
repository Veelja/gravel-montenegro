import { CFG } from './config.js';

export function createState() {
  return {
    x: 0,
    v: 0,
    crank: CFG.overrun, // revolutions; whole numbers are top dead centre
    strokeStart: 0,    // crank position where the current stroke began
    strokeEnd: 0,      // crank position (a top) where the current stroke finishes
    coasting: true,    // legs are still; the next tap has to get them going again
    overrunTime: 0,    // seconds since the last stroke finished without a new tap
    strokeEnergy: 0,   // joules of the current stroke; sets how hard the push is
    sure: false,       // the current stroke was timed perfectly
    idleTurns: 0,      // revolutions the legs have turned on their own, for the animation
    pushing: false,    // legs are driving the wheel
    stalled: 0,        // seconds spent pushing without the bike moving
    power: 0,          // watts currently reaching the wheel
    gear: CFG.startGear,
    stamina: 100,
    bonked: false,
    started: false,
    finished: false,
    time: 0,
    feedback: null,    // { text, kind, age }
  };
}

export function development(gear) {
  return CFG.devMin * (CFG.devMax / CFG.devMin) ** ((gear - 1) / (CFG.gears - 1));
}

// Cadence the legs need to match the wheel in this gear.
export function rawCadence(state) {
  return state.v / development(state.gear);
}

export function step(state, course, dt) {
  if (state.feedback) state.feedback.age += dt;
  if (state.finished) return;

  // A stroke pushes through the gear until the pedal is back at the top, so the push at
  // the wheel is energy / development: strong and short in a low gear, weak and long in a
  // high one.
  state.pushing = !state.coasting && state.crank < state.strokeEnd;
  let drive = state.pushing ? state.strokeEnergy / development(state.gear) : 0;

  const grade = course.gradeAt(state.x);
  const weight = CFG.mass * CFG.g;
  // A perfect stroke in first gear always brings the pedal round, however steep the road
  // or tired the rider: below a crawl it pushes at least a little harder than the slope.
  if (state.pushing && state.sure && state.gear === 1 && rawCadence(state) < CFG.crawlCadence) {
    drive = Math.max(drive, (grade + CFG.crr) * weight * CFG.crawlMargin);
  }
  const rolling = state.v > 0 ? CFG.crr * weight : 0;
  const force = weight * grade + rolling + CFG.aero * state.v * state.v - drive;
  state.v = Math.max(0, state.v - (force / CFG.mass) * dt);
  // Once under way the rider never stops: with no input, or too little for the slope, the
  // legs keep turning over slowly and the bike holds a crawl
  if (state.started && state.v <= CFG.idleSpeed) {
    state.v = CFG.idleSpeed;
    if (state.coasting) state.idleTurns += CFG.idleCadence * dt;
  }

  state.x += state.v * dt;
  state.power = drive * state.v;

  // Pushing a gear too hard for the slope gets nowhere; give the stroke up so the
  // rider can shift down and try again.
  state.stalled = state.pushing && state.v === 0 ? state.stalled + dt : 0;
  if (state.stalled > CFG.stallTime) {
    state.coasting = true;
    state.stalled = 0;
  }

  // The crank is locked to the wheel while pushing. With no new tap it runs on a little
  // past the top, which is the late window, and then the legs stop with the pedals level.
  if (!state.coasting) {
    state.crank += Math.min(CFG.maxRingCadence, rawCadence(state)) * dt;
    state.overrunTime = state.crank >= state.strokeEnd ? state.overrunTime + dt : 0;
    if (state.crank >= state.strokeEnd + CFG.overrun) {
      state.crank = state.strokeEnd + CFG.overrun;
      state.coasting = true;
    } else if (state.overrunTime > CFG.overrunMaxTime) {
      state.coasting = true;
    }
  }

  state.stamina = Math.min(100, state.stamina + CFG.staminaRegen * dt);
  if (state.bonked && state.stamina >= CFG.bonkRecover) state.bonked = false;

  if (state.started) state.time += dt;
  if (state.x >= course.length) state.finished = true;
}

// Returns 'perfect' | 'good' | 'weak' | 'miss'.
export function pedal(state) {
  if (state.finished) return 'miss';
  state.started = true;

  let kind = 'miss';
  let text = 'TOO SOON';
  let quality = 0;
  let end = state.strokeEnd;

  const grade = (off) => {
    if (off <= CFG.perfect) {
      kind = 'perfect';
      text = 'PERFECT';
      quality = 1;
    } else if (off <= CFG.good) {
      kind = 'good';
      text = 'GOOD';
      quality = CFG.goodQuality;
    }
    return kind !== 'miss';
  };

  if (state.coasting) {
    // Getting the legs going again costs power, unless the bike is stopped anyway
    if (state.v < CFG.pushOffSpeed) {
      kind = 'perfect';
      text = 'PUSH OFF';
      quality = 1;
    } else {
      kind = 'weak';
      text = 'RESTART';
      quality = CFG.restartQuality;
    }
    end = Math.ceil(state.crank);
    if (end - state.crank < 0.5) end += 1;
  } else if (state.crank >= state.strokeEnd) {
    // Past the top: the late window
    if (!grade(state.crank - state.strokeEnd)) {
      kind = 'weak';
      text = 'LATE';
      quality = CFG.restartQuality;
    }
    end = state.strokeEnd + 1;
  } else if (state.crank - state.strokeStart >= CFG.tooSoon) {
    // Still pushing the previous stroke
    const early = state.strokeEnd - state.crank;
    if (!grade(early)) {
      kind = 'weak';
      text = 'EARLY';
      quality = CFG.weakQuality;
    }
    if (early <= 0.5) end = state.strokeEnd + 1;
  }

  // A bonked rider has nothing left to spend, so tapping can't hold off the recovery
  const spend = state.bonked ? 0 : 1;
  if (kind === 'miss') {
    state.stamina -= CFG.missCost * spend;
  } else {
    const cad = rawCadence(state);
    // 1 at a standstill, 0 once the legs are turning at a comfortable cadence
    const grind = Math.max(0, (CFG.grindBelow - cad) / CFG.grindBelow);
    const stand = 1 + (CFG.standBoost - 1) * grind;
    const spin = cad <= CFG.spinStart
      ? 1
      : Math.max(
          CFG.spinFloor,
          1 - ((cad - CFG.spinStart) / (CFG.spinEnd - CFG.spinStart)) * (1 - CFG.spinFloor),
        );
    const bonk = state.bonked ? CFG.bonkFactor : 1;
    // This replaces whatever was left of the previous stroke, so tapping early wastes it
    state.strokeEnergy = CFG.strokeEnergy * quality * spin * bonk * stand;
    state.sure = kind === 'perfect';
    state.strokeStart = state.crank;
    state.strokeEnd = end;
    state.coasting = false;
    state.overrunTime = 0;

    state.stamina -= (CFG.strokeCost + CFG.grindCost * grind) * spend;
  }

  if (state.stamina <= 0) {
    state.stamina = 0;
    state.bonked = true;
  }
  state.feedback = { text, kind, age: 0 };
  return kind;
}

export function shift(state, delta) {
  const gear = Math.min(CFG.gears, Math.max(1, state.gear + delta));
  const changed = gear !== state.gear;
  state.gear = gear;
  return changed;
}
