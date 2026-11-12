/**
 * Whether the device has a real hover: a mouse or trackpad. Touch screens (phones, tablets) only
 * fake one on each tap, so they get no hover tooltips, no hover sync between the list and the
 * map and no target-lock reticle. Read once at load, like the other device checks.
 */
export const CAN_HOVER = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
