// All tuning knobs live here. Units: metres, seconds, kg, joules; cadence in crank rev/s.
export const CFG = {
  // Rider + bike physics
  mass: 85,
  g: 9.81,
  crr: 0.01,   // rolling resistance (gravel)
  aero: 0.24,  // 0.5 * air density * CdA

  // Gearing: metres travelled per crank revolution, spaced geometrically
  gears: 12,
  devMin: 1.8,
  devMax: 9.0,
  startGear: 4,

  // Pedal stroke
  strokeEnergy: 200,  // joules from one perfect stroke
  standBoost: 1.5,    // extra stroke energy from standing on the pedals at a standstill
  stallTime: 0.6,     // seconds of pushing a stopped bike before the stroke is given up
  maxRingCadence: 3,

  // Timing zones, as a fraction of a revolution either side of the top
  perfect: 0.06,
  good: 0.13,
  goodQuality: 0.6,
  weakQuality: 0.25,     // tapping early, while the previous stroke is still going
  tooSoon: 0.25,         // a tap this soon after the last one is a miss
  overrun: 0.25,         // how far past the top the crank runs on before the legs stop
  overrunMaxTime: 1.5,   // seconds; the legs also stop if the crank dawdles past the top
  restartQuality: 0.5,   // tapping late, or getting the legs going again after coasting
  pushOffSpeed: 0.5,     // m/s; below this a restart is a full-power push-off

  // Spinning out: above spinStart the legs deliver less and less per stroke
  spinStart: 1.6,
  spinEnd: 2.6,
  spinFloor: 0.3,

  // Grinding: below this cadence the rider stands, and each stroke costs extra stamina
  grindBelow: 0.9,

  // Stamina (0..100)
  staminaRegen: 1.3,  // per second
  strokeCost: 1.25,
  grindCost: 3,       // extra cost per stroke at zero cadence, scales down to 0 at grindBelow
  missCost: 2.5,
  bonkFactor: 0.35,   // stroke energy multiplier while bonked
  bonkRecover: 20,    // stamina needed to recover from a bonk
};
