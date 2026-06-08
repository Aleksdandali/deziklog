// lib/theme.ts — legacy alias surface. All design tokens live in ./constants.
// `RADII` and `SHADOWS` are aliases of the canonical RADIUS / SHADOW objects,
// so existing call-sites (RADII.lg, SHADOWS.card, …) keep resolving unchanged.
export { COLORS, RADIUS as RADII, SHADOW as SHADOWS } from './constants';
