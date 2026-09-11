# Championship broadcast video

The clips played behind the championship watch page. The simulator puts one of
these on every fixture it creates, in turn, and the player loops whichever it
was given for as long as the match runs.

Vite copies this directory into the built client, so a file here is served by
the quiz itself at `/media/<name>` on whatever host the quiz is deployed to.
That is the whole reason it lives here: the watch page fetches the video from
the origin it was loaded from, so there is no third party CDN able to refuse
the request. The pool of public test streams this replaced was refused often
enough to be worth getting rid of.

## The format is mp4, not HLS

Deliberately. LiveboxMix, the mixer that renders the watch page for the
outgoing stream, decides what to do with a video by its address: an `.m3u8` or
`.mpd` is taken for a live stream, played from the address and left to end.
Anything else it takes for a clip, fetches to disk once and loops from there,
which is a join of tens of milliseconds instead of the two to five seconds a
fresh connection costs. A three minute clip behind a twenty minute match has to
loop, so a manifest here would show the video once and then show nothing.

The browser does its own looping, in `attachChampionshipHls`, which sets
`video.loop` and skips hls.js entirely for an address that is not a manifest.

## Adding another one

Encode it the same way, drop it in, and add a line to `CHAMPIONSHIP_VIDEOS` in
the simulator's `src/streams.ts`. Consecutive fixtures then play them in turn.

```bash
ffmpeg -i source.mp4 \
  -vf "scale=1280:720:flags=lanczos,fps=30" \
  -c:v libx264 -preset slow -crf 23 -profile:v high -level 4.0 \
  -maxrate 2200k -bufsize 4400k -g 60 -keyint_min 60 -sc_threshold 0 \
  -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ac 2 -ar 48000 \
  -movflags +faststart out.mp4
```

720p30 because the stage is a panel on the page, not the whole 1080p program,
and the file has to arrive inside the mixer's 60 second fetch timeout.
`+faststart` puts the index at the front so playback starts before the whole
file has arrived. A two second keyframe interval keeps the seek back to zero
cheap.

Keep an eye on the total size here. These are binaries in git and they never
get smaller. Once there are more than a handful, move them to a volume the
server mounts, or to a CDN, and point `CHAMPIONSHIP_VIDEOS` at that instead.

## What is here

| file | source | length |
|---|---|---|
| `hbtv-ai-cloud-gaming.mp4` | HBTV / AI Cloud Gaming Technology promo, supplied 4K50 | 3:12 |
