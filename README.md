# Hoople Play — Snakes

A portrait-first web prototype based on the Hoople Play Snakes GDD.

## Current prototype

- 60 × 50 tile world with a portrait zoomed-in camera
- Swipe / slide directional control, plus keyboard controls for desktop testing
- Retro grid movement with smooth visual interpolation
- Uses the supplied stylized snake Head / Body / Tail assets
- Player starts with Head + Tail; Apple adds one Body segment
- Beige, White, Green, and Red player skins
- Apple: +10 score, +1 length
- 5-Apple combo triggers a 25-Star global Star Rush for 30 seconds
- Star: +20 score, +2 length
- Black Box opens a 15-second quiz
- Correct Black Box quiz grants one of: Slow, Fire, Grapple Tongue, Venom Trail, Spike Skin
- 8-second post-quiz invisibility effect
- 2-minute match timer
- Two local AI snakes to make the competitive mechanics testable before networking
- Collision mode currently follows the GDD's second option: bump + tail loss
- Dynamic camera look-ahead and zoom based on snake length / Star Rush state
- End panel shows Score and Highest Combo

## Important

The AI opponents are local simulation only. Real multiplayer networking, lobby/session sync, host parameters, CMS quiz content, analytics, audio, and production persistence are not implemented yet.

`COMBO_WINDOW_MS` is currently a prototype tuning value because the GDD defines the 5-Apple combo condition but does not specify the exact combo-window duration.

## Run

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.
