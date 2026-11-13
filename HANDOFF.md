# Tampere Targets — at release 1.10.0

- Released: 1.10.0 — 2026-11-13, price first, keys and field manual.
- Hosted copy: release 1.10.0 deployed and HTTP-verified on 2026-11-13; hosted HTML and JS/CSS match the local build.
- Target profile: the big numbers are Cost / month, Area and Built (price at a glance on the phone).
- Upright phones: the header is brand, then a compact Targets readout at the left with Params (icon and name) and NV at the right, right above the map; no Priority readout (the list's ★ chip does it).
- Desktop keys (`web/src/lib/keys.js`, one table for the handler and the manual): F fit, C works like Esc (closes the topmost: manual, intel card, slide-out parameters, profile), V or N night vision, R or M base map, Q / E panels, WASD targets, H the field manual. Tooltips name only F, C, V (the user's choice).
- Field manual (FR-50): H or the keyboard button after NV opens a modal with the keys drawn as a keyboard block, Esc included; pressing or pointing at a key lights it and describes it. Desktop only.
- Earlier (1.9.1): passive pointer gestures keep native scrolling and pinch zoom; listing details are cached per page session (100 entries); distant unloaded gallery slides use static placeholders.
- Validation: 140 tests passed; production build passed; checked in the preview at 360×740, 384×780, 832×330, 1200×800 and 1440×900, both themes.
- Physical S24 Chrome touch/GPU behavior has not been tested.
