# Tampere Targets — at release 1.10.1

- Released: 1.10.1 — 2026-11-13, phone target swipe fix.
- Hosted copy: release 1.10.1 deployed and HTTP-verified on 2026-11-13; hosted HTML and JS/CSS match the local build.
- Phone target swipe (`useSwipeStep` in DetailDrawer.jsx): `.drawer-body` (address to "Open on Oikotie") carries `touch-action: pan-y pinch-zoom` and reaches over the edges and gaps, so no strip hands a sideways swipe to the browser; the swipe/scroll decision is "more sideways than vertical", the browser's own rule; the next swipe works once the new target has slid in (200 ms). Gallery and raw JSON stay outside, free to scroll sideways. The gallery and RawIntel are neighbours with distinct React keys (`gallery-<id>`, `raw-<id>`; equal keys stacked old galleries, a test guards it).
- Target profile: the big numbers are Cost / month, Area and Built (price at a glance on the phone).
- Upright phones: the header is brand, then a compact Targets readout at the left with Params (icon and name) and NV at the right, right above the map; no Priority readout (the list's ★ chip does it).
- Desktop keys (`web/src/lib/keys.js`, one table for the handler and the manual): F fit, C works like Esc (closes the topmost: manual, intel card, slide-out parameters, profile), V or N night vision, R or M base map, Q / E panels, WASD targets, H the field manual. Tooltips name only F, C, V (the user's choice).
- Field manual (FR-50): H or the keyboard button after NV opens a modal with the keys drawn as a keyboard block, Esc included; pressing or pointing at a key lights it and describes it. Desktop only.
- Earlier (1.9.1): passive pointer gestures keep native scrolling and pinch zoom; listing details are cached per page session (100 entries); distant unloaded gallery slides use static placeholders.
- Validation: 143 tests passed; production build passed; profile layout checked unchanged at 384×780 and desktop; one gallery per target while stepping.
- Confirmed by the user on the S24 on 2026-11-13: target swipes work with 1.10.1.
