# Transition sounds

Drop short (~2 second) audio clips here named exactly:

```
round-change.mp3   — plays when the "ROUND N" overlay appears (match start and every round after)
match-sold.mp3     — plays when the "SOLD TO ..." overlay appears (a match concludes with a winner)
```

`main.js`'s `showTransitionOverlay()` tries to play the matching file every time either overlay
appears. If a file isn't here, the `Audio.play()` call just fails silently (caught and ignored) —
the visual overlay still works fine either way, so both are entirely optional and can be added at
any time without touching code.

Any browser-supported format works (`.mp3`, `.ogg`, `.wav`) — if you use a different extension,
update the matching `showTransitionOverlay(...)` call site in `app/js/main.js` (search for
`audio/round-change` / `audio/match-sold`) to match.
