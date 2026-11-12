# Bug report and fix handoff

Reviewed: 2026-11-12, version 1.8.0.

Release update: the four fixes below are included in 1.8.1. This document preserves the original review and acceptance plan; see CHANGELOG.md and HANDOFF.md for implementation and validation status. The user subsequently authorized release and commit. Physical S24+ validation remains pending.

## Goal and scope

Improve mobile stability and responsiveness, especially when opening listings in Chrome on a Samsung Galaxy S24+. The user has experienced glitching there. Fix the concrete issues below without redesigning the app or spending time on minor polish.

The review made no source changes, commits, or deployments. The user permits local testing and edits but explicitly said not to commit. Do not treat this handoff as permission to publish changes; the current request is to prepare a fix plan.

## What was validated

- The production build succeeded and all 121 existing automated tests passed.
- The deployed asset names matched the local deployment output.
- Browser checks ran against a local preview at 384px and 412px viewport widths, with listing photos disabled according to the repository preview rules.
- These were desktop browser checks at phone sizes, not tests on a physical S24+. Actual touch gestures, photo decoding, and phone graphics performance remain unverified.
- The findings below explain concrete problems, but the exact cause of the user's S24+ stutter has not been established.

## Priority 1: Stop the page becoming wider than the phone

**Issue:** At a 384px viewport, the page measured 417px wide and allowed horizontal scrolling. This also occurred at the wider test size. The main page and the full-screen listing do not consistently fit the same screen width.

**Root cause:** The page layout allows its contents to dictate a minimum width larger than the available space. The narrow-screen layout does not sufficiently constrain those sections.

**What needs to be done:** Make the mobile page, header, map, and listing list fit the available width. Fix the sizing cause rather than just hiding content that overflows. Preserve readable text and usable controls. Avoid disabling user zoom as a workaround.

**Acceptance checks:** At 360px, 384px, 412px, and 430px widths, there is no unintended sideways page scrolling or clipped control. Opening and closing a listing does not change the apparent scale of the page. Check portrait-to-landscape-to-portrait rotation too. Overflow is a plausible contributor to the reported glitch, not a confirmed explanation of the physical phone's behavior.

## Priority 1: Keep the background stationary while a listing is open

**Issue:** Scrolling past the bottom of a full-screen listing scrolled the hidden page behind it by more than 1,600px in the local browser test. Closing the listing then snapped the page back.

**Root cause:** The listing has its own scrolling area, but the background page remains scrollable. Once the listing reaches an edge, further scrolling passes through to the background.

**What needs to be done:** Keep scrolling inside the full-screen listing and preserve the background position until it closes. Retain the intended return behavior: listings opened from the map return to the map; listings opened from the list return to the appropriate list position. Keep desktop behavior intact.

**Acceptance checks:** Scroll beyond both ends of a listing, including repeated gestures. The background must stay still. Verify closing with the close button and browser Back, opening from both map and list, and switching between listings. Check that rotating the phone or closing the drawer never leaves the main page unable to scroll.

## Priority 2: Restore navigation for listings outside the map view

**Issue:** Opening a listing under “Outside map view” on the phone layout removed both previous/next controls. The same condition disables listing swipes, leaving the user to close the profile to choose another listing.

**Root cause:** Listing navigation includes only targets inside the current map view. An outside target normally needs the map to bring it into view, but that movement is skipped when the full-screen profile hides the map. The selected target therefore never becomes eligible for navigation.

**What needs to be done:** Resolve this conflict so an outside target does not become a navigation dead end on mobile. Preserve the established navigation order and map-view behavior as far as possible; do not silently replace them with an unrelated ordering rule.

**Acceptance checks:** Open targets from both the in-view and outside-map sections. Verify previous/next controls and actual touch swipes, including wraparound. Also check a direct listing link, browser Back, and the case where only one target is available, where disabled navigation is legitimate.

## Priority 2: Load debugging data only when requested

**Issue:** Every listing detail response includes the raw source JSON even though “Raw intel” is normally closed. The drawer also formats that hidden data during rendering.

**Root cause:** Normal listing content and optional debugging information share the same loading and rendering path.

**Measured opportunity:** Across the 381 exported listings, excluding raw JSON reduced average compressed detail size from approximately 12.1 KB to 3.1 KB, a 74% reduction. This is a payload measurement, not a measured improvement in frame rate or total page load time.

**What needs to be done:** Fetch and format raw information only when the user opens “Raw intel.” Keep all ordinary listing information and photos available as before. Preserve the debugging feature and support both the local app and the hosted static site.

**Acceptance checks:** Opening a normal listing does not download or format the raw information. Opening “Raw intel” still works, with sensible loading and failure behavior. Switching listings must never show raw information from the previous target. Compare actual detail response sizes before and after.

## Suggested work order and completion criteria

1. Reproduce and fix the width and background-scrolling problems first.
2. Fix the outside-map navigation dead end.
3. Separate optional raw information from ordinary listing loading.
4. Run the existing tests and production build, and add focused regression coverage where useful. Existing passing tests alone do not validate mobile behavior.
5. Repeat the phone-width browser checks and desktop checks. Use synthetic photos for agent gallery testing, following repository rules.
6. Arrange validation on the user's S24+ Chrome for opening, scrolling, swiping, closing, and rotating. Clearly distinguish browser-emulated results from physical-device results. Do not declare the original stutter resolved without that evidence.

Report what changed, which issues were reproduced and fixed, what was tested, and anything still unverified. Keep the work uncommitted unless the user changes that instruction.
