# Open WebUI 0.13.4 audio port

The base is upstream tag `v0.13.4` (`0666e59d26a4d056e0bacee41742486badd71cf8`),
confirmed as the latest release on November 19, 2026.
See https://github.com/open-webui/open-webui/releases/tag/v0.13.4.

Upstream still provides a message-level read-aloud button, but does not provide
this fork's persistent player above the composer. The custom player from
`origin/krsche-player` was retained, including play/pause, elapsed time,
15-second seek controls, speed selection, and stop. Upstream's autoplay gesture
unlock, playback-error handling, visible-response extraction, and notification
sounds were retained. Browser speech synthesis does not support seeking;
the seek buttons remain disabled for that engine.

## Playback fixes

- Distinguish pending synthesis from the end of playback. Paragraphs generated
  after earlier audio finishes resume the same queue instead of ending the
  read-aloud session. Previously played chunks remain available for seeking.
- Resuming while waiting for the next paragraph no longer invokes play on the
  already completed chunk, which can repeat it from the start.
- Cancelled voice polling and speech completion callbacks cannot start or finish
  another session. Cancellation is also checked after reading the audio response
  body, so stale requests cannot enqueue audio into a newer session.
- Use one metadata handler for the current source instead of accumulating seek
  callbacks, and ignore play failures from superseded sources.
- Clean up playback on synthesis errors, including worker initialization and
  response-body failures.

## Validation

`src/lib/utils/audio.test.ts` exercises delayed generation, pause/resume during
buffering, queued audio while paused, completion after a generation gap,
ordered sentence playback, source changes during seeking, and stale play errors.

Automated checks used Node 22:

- Frontend suite: 24 tests passed, including seven synthesis-gap regressions
  and 13 restored playback-control/rate tests.
- Focused ESLint check for the audio utilities, regression tests, and player: passed.
- Direct Svelte client compilation of all seven added/changed components: passed.
- Upstream encryption artifact verification: passed.
- Full type checking is not clean in upstream `v0.13.4` either (5,374 errors and
  195 warnings in the untouched release). The audio-port validation reported 5,368 errors
  and the same 195 warnings, with no new diagnostic messages after normalizing
  checkout paths.
- The production Vite build exceeded the 4 GiB JavaScript heap limit in this
  environment and could not be completed. Run the regular production build in
  the deployment/build environment before release.

For an authenticated browser smoke test with the deployed TTS engine:

1. Enable automatic response playback and paragraph splitting. Generate at least
   three paragraphs, with a short first paragraph and long later paragraphs.
   Check that every paragraph plays once, even when synthesis is slower than playback.
2. Repeat with punctuation splitting. Pause/resume during playback and during a
   gap; check that the previous sentence is not replayed.
3. Seek backward/forward across generated chunks and change speed. Stop while
   synthesis is pending, then play a different response; old audio must not return.
4. Repeat with browser Kokoro if used, and check native browser speech separately
   for play/pause/stop and switching responses while voices are loading.

No running deployment or stored chat database was modified by this code update.

## Docker build attempt

The standard full image build was attempted with Docker Engine 29.7.2 on the
7.7 GiB host, tagging the intended image `open-webui:agent-0.13.4-audio`.
It stopped before compilation because access to
`ghcr.io/astral-sh/uv:0.12.10` returned HTTP 403.

A temporary Dockerfile outside the repository tried installing the same pinned
`uv` version from PyPI. That attempt also stopped before compilation: direct
package downloads timed out, and explicitly forwarding the environment's proxy
returned HTTP 403 for the Alpine and Debian package repositories. No final
application image was produced. The repository Dockerfile was not modified.

The earlier host-only Vite attempt explicitly used a 4 GiB Node heap limit to
leave memory for concurrent checking and non-heap allocations. The upstream
`npm run build` command instead explicitly sets `--max-old-space-size=12288`.
That command-line option overrides a 4096 setting in `NODE_OPTIONS`, even if the
commented Dockerfile environment setting is enabled. The heap limit is not a
reservation or a limit on total process memory; the Docker attempt did not get
far enough to measure actual frontend build memory requirements.

## Development container

The Node 22 frontend devcontainer and playback-control tests from commit
`444be6dde` on `origin/krsche-player` were ported to the updated branch. The
container forwards ports 5173, 5050, and 8080 and includes the Svelte, ESLint,
and Prettier VS Code extensions. Setup uses the lockfile with `npm ci` and skips
ONNX Runtime's unused CUDA download, matching the frontend Docker build.
This is a frontend development environment; run the backend separately and set
`WEBUI_BACKEND_URL` when it is not reachable at `http://localhost:8080` from
inside the container.

The old branch's Docker `NODE_OPTIONS=--max-old-space-size=4096` change was not
ported, because the current build script explicitly sets its Vite heap limit.
The Vite test configuration change was also unnecessary: the current test runner
already discovers both the restored tests and the synthesis-gap regressions.

After the devcontainer port, all 24 frontend tests and focused ESLint checks for
the restored tests pass. The devcontainer JSON and setup settings were validated;
the devcontainer itself was not launched.
