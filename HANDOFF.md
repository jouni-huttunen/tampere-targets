# Tampere Targets — at release 1.9.1

- Released: 1.9.1 — 2026-11-13, mobile responsiveness fixes.
- Hosted copy: release 1.9.1 deployed and HTTP-verified on 2026-11-13; hosted HTML and JS/CSS match the local build.
- Passive pointer gestures preserve native vertical scrolling and pinch zoom; gallery gestures remain native.
- Successful listing details are cached for this page session (100-entry bound); revisits render immediately.
- Distant unloaded gallery slides use static placeholders.
- Validation: synthetic gallery checked at 384×740 and 832×330, including cached revisits and photo navigation. All 139 release tests passed; production build passed.
- Physical S24 Chrome touch/GPU behavior has not been tested.
