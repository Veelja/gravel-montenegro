# Montenegro Gravel

A small pixel-art cycling game for the browser, built for phones first. Tap the pedal in
rhythm, pick the right gear for the slope, and manage your stamina over a hilly gravel
course on the Montenegrin coast.

## Play

No build step. Serve the folder and open it:

```bash
python3 -m http.server 5173
```

Then visit http://localhost:5173 (or `http://<your-PC-IP>:5173` from a phone on the same Wi-Fi).

## Controls

| Action | Touch | Keyboard |
|---|---|---|
| Pedal | PEDAL button | Space |
| Harder gear | `+` | Up arrow |
| Easier gear | `-` | Down arrow |
| Restart | | R |

Tap as the dot on the ring reaches the green zone at the top. Too hard a gear grinds and
drains stamina; too easy a gear spins out.

## Project layout

- `src/config.js` - all tuning numbers
- `src/course.js` - course segments (length and gradient)
- `src/sim.js` - physics, strokes, gears, stamina
- `src/render.js`, `src/pix.js` - pixel-art drawing; the rider is the sprite sheet `assets/rider.webp`
- `src/backdrop.js` - scenery; one portrait painting per stage of the course, in `assets/bg/`
