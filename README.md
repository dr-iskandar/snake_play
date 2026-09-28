# Chain Play

Portrait-first, brandable chain-follow game prototype inspired by Snake.io-style movement.

## Features

- Smooth free-direction movement
- Portrait responsive layout
- Drag joystick plus WASD / arrow controls
- Dynamic camera look-ahead
- Automatic zoom in/out based on chain length and boost state
- Collectibles, speed boost, mystery rewards and obstacles
- Modular leader/head plus follower segment architecture
- Live theme switch between Snake Garden and Shopping Rush
- Shopping Rush demonstrates the brand-reskin concept: character leader plus product-like follower chain
- Theme definitions are separated in src/themes.js
- Prototype art is generated directly in Phaser, so it runs without external image assets

## Run locally

Serve the folder over HTTP:

    python3 -m http.server 8080

Then open:

    http://localhost:8080

## Main files

- index.html - page shell and Phaser loader
- style.css - portrait responsive container
- src/main.js - gameplay, movement, camera, collision and UI
- src/themes.js - modular brand/theme configuration

## Brand personalization

Add a new object in src/themes.js, then map its head, segment palette, collectibles and obstacle palette. The gameplay code stays the same.

For production, generated prototype textures can be replaced by PNG, WebP, SVG or sprite atlases without changing the gameplay architecture.

## Next recommended production steps

- Move map definitions into JSON
- Add real animated sprite atlases
- Add missions and levels
- Add sound and haptics
- Add analytics hooks
- Add leaderboard/backend only when needed
