# Round-change sound

Drop a short (~2 second) audio clip here named exactly:

```
round-change.mp3
```

`main.js`'s `showRoundTransition()` tries to play `audio/round-change.mp3` every time the
"ROUND N" overlay appears (match start and every round after). If the file isn't here, the
`Audio.play()` call just fails silently (caught and ignored) — the visual overlay still works
fine either way, so this is entirely optional and can be added at any time without touching code.

Any browser-supported format works (`.mp3`, `.ogg`, `.wav`) — if you use a different extension,
update the path in `showRoundTransition()` in `app/js/main.js` to match.
