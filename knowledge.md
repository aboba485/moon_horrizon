# Knowledge

## 2026-11-14 — Horizons match

The IAU/SPICE passive matrix `R3(W) · R1(90−δ) · R3(90+α)` matches JPL Horizons airless apparent az/el from a lunar geodetic site. Astronomy Engine’s `RotationAxis` right ascension is in hours.

Earth must be topocentric. Surface parallax is about 0.26°. Sun parallax is negligible.

On 2026-11-14 00:00 UTC at Mons Mouton (−85.416, 31.851) Earth’s center is −0.805° and the limb radius is ~0.95°, so the limb is up while the center is down. DTE should use station altitude, not Earth-center altitude.

South-pole solar elevation tracks the negative of subsolar latitude. Positive subsolar latitude is south-pole winter. Peak |subsolar latitude| in a 2026 sample was 1.587°.

A vertical tracking array at a few degrees of elevation collects far more than a flat panel because cos(i) is cos(alt) versus sin(alt).

## Coordinates

Artemis points in `sites.js` come from Wueller et al. 2026 CLS tables (MMO01, MMP01, NR101, NR201, MMA01, dGR201, PCB01, SP01, CR05, PNS02, AR01). They are not official touchdown pins.

IM-1 is −80.13, 1.44. A listing at −84.9, 12.9 was rejected. IM-2 Athena is −84.7906, 29.1957 on Mons Mouton.

Faustini Rim A, Connecting Ridge Extension, and LCROSS were left out rather than given guessed coordinates.

## Performance

400 `atSite` calls ≈ 53 ms. One lunar day at 30 minutes ≈ 67 ms. Safe to recompute on the UI thread. Do not resample the whole mission on every animation frame.
