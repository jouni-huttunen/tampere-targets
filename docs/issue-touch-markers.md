# Open issue: map markers on touch screens

_Opened 2026-11-12, parked by the user ("revert for now"). Not part of the spec: when this is settled, move the outcome into [03-design.md](03-design.md) (Hover sync, Target lock, Phone layout) and delete this file._

## 1. What the user saw

On the hosted copy (1.6.2) on their Android phone: after closing a target profile, one map marker stayed **big and white** (hover or selected styling) although nothing was hovered or selected. Screenshot from 2026-11-12: phone layout, map zoomed in on Ranta-Tampellan katu, one marker enlarged with the white hover stroke, the list below showing "2 in view · 380 targets".

The user's request: no hover on map markers on phones, no "Target locked" on the map on phones, and no marker size change on phones, "to avoid glitching".

## 2. Why it happens (1.6.2 code, which is current again)

A touch screen has no real hover, but the browser fakes one on each tap: `mouseover`, `mousedown`, `mouseup`, `click`, and focus moves to the tapped element. The app treats these as hover:

- **Marker tap** (`ListingMarkers` in `MapView.jsx`): `mouseover` calls `onHover(id, 'map')`, so the marker grows from radius 6.5 to 10 (`R` in MapView), gets `is-hover`, the list re-renders, and Leaflet opens the marker tooltip (it also opens it on `click` on touch devices). No `mouseout` ever comes, so the hover stays. On closing a profile opened from the map in the phone layout, App clears the hover (`setHover({ id: null, … })` in the `selectedId` effect), which drops it.
- **List row tap** (`ListingCard.jsx`): `onMouseEnter` and `onFocus` call `onHover(id, 'list')`. No `mouseleave` comes on touch. **Most likely cause of the screenshot:** when the profile closes, `DetailDrawer` gives focus back to the element that had it (`returnFocus`), which is the tapped row, so its `onFocus` sets the hover again, and the marker is big and white with the profile closed. App's clean-up only runs when the profile was opened from the map, not from the list.
- **Target lock:** on phones (≤ 900 px) the profile covers the whole map, and since 1.6.0 no lock is drawn then (`visibleArea().hidden`). On wider touch screens (tablets) the lock is drawn beside the profile.

## 3. What was tried: 1.6.3 (reverted)

Release 1.6.3 (commit `c484bac`, deployed 2026-11-12) did all of this on devices without a real hover (`(hover: hover) and (pointer: fine)` false; the same test InfraLayer uses for its tooltips, moved to a shared `web/src/lib/pointer.js`):

- markers: no `mouseover` / `mouseout` listeners and no tooltip;
- list rows: no `onMouseEnter` / `onMouseLeave` / `onFocus` / `onBlur` hover;
- no lock reticle;
- markers never change size, also when selected (the selected one only lights up);
- App's clean-up of the leftover hover on close removed.

Checked in the browser pane at phone size with touch emulation and synthetic taps: no tooltip, no lock, every marker stays 14 px, nothing highlighted after closing. Desktop unchanged.

**Result on the user's phone:** "It is no longer sensitive as it used to on map. Touches are not detected as easily as before." Reverted the same day; the code is back to 1.6.2. To look at the 1.6.3 code: `git show c484bac`.

## 4. Why taps may have felt worse (not confirmed)

The tap area did not change: a marker's SVG circle is about 13 px across (radius 6.5 plus stroke), in 1.6.2 and in 1.6.3. Candidates:

1. **No feedback at touch.** In 1.6.2 the fake `mouseover` grows the marker at once; in 1.6.3 nothing changed until the profile slid in, so a working tap could feel missed.
2. **Chrome's touch adjustment.** Chrome on Android moves a slightly-off tap onto a nearby element it considers tappable. `bindTooltip` adds per-element `focus` / `blur` DOM listeners to each marker path (Leaflet `_addFocusListenersOnLayer`); Leaflet's mouse listeners are on the map container, not on the paths. Whether those listeners made Chrome treat markers as tap targets is unverified, and the browser pane cannot reproduce Chrome's touch adjustment.
3. **The target is just small.** 13 px is far below a finger; the common minimum is 44–48 px. Near-misses were probably always there.

How to check on the phone: tap just beside a marker (a few px off) in 1.6.2 and in a build with only the listeners removed, and compare.

## 5. Options for next time

Pick one or combine; each is touch-only, desktop stays as it is.

- **A. Fix only the stuck marker (smallest).** Clear the hover whenever a profile closes on a touch screen (not only for map taps), and ignore the `onFocus` hover when focus comes back from the profile. Keeps the tap feel of 1.6.2 exactly; the fake hover on tap stays.
- **B. Bigger tap reach.** On a map tap that misses every marker, open the nearest marker within ~22 px of the finger (a 44 px target): one `click` listener on the map, distances from `latLngToContainerPoint`, no extra DOM. Skip it when the tap only closes a night-vision intel card. Fixes near-misses whatever their cause.
- **C. Invisible hit circles.** A transparent, larger circle per marker on touch screens (about 380 more SVG paths on a phone). Picks the topmost, not the nearest, in dense spots; costlier than B.
- **D. Then redo 1.6.3** (no hover, tooltip, lock or size change on touch) on top of B, and keep some instant feedback at touch (for example a brief highlight without a size change), so a tap does not feel ignored.

Proposed when it was parked: B, then D. Test on the real phone, not only in the pane.
