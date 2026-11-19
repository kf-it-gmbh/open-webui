# Building and publishing this fork

Run these commands from the repository root on `agent/update-openwebui-audio`
(or a branch containing its changes). Pull the latest changes first:

```sh
git pull --ff-only
docker login
```

The examples use `krsche/open-webui:v0.13.4-krsche-player`. Update the version
in the tag for future releases. Publishing again to the same tag replaces what
that tag points to.

## Build on an Apple Silicon Mac for the Ryzen/x86 server

The server needs `linux/amd64`; an ordinary build on an M-series Mac produces
`linux/arm64`. Explicitly select the server platform and push directly:

```sh
docker buildx build \
  --platform linux/amd64 \
  --progress=plain \
  -t krsche/open-webui:v0.13.4-krsche-player \
  --push .
```

Docker Desktop normally provides emulation automatically. An amd64 build on
Apple Silicon can be substantially slower than a native build. `--push`
publishes the result; it does not load it into the local Docker image store.

To build the amd64 image locally without publishing, use `--load` instead:

```sh
docker buildx build \
  --platform linux/amd64 \
  --progress=plain \
  -t krsche/open-webui:v0.13.4-krsche-player \
  --load .
```

## Build directly on an amd64 machine

On the Ryzen server or another x86-64 build machine:

```sh
docker build --progress=plain \
  -t krsche/open-webui:v0.13.4-krsche-player .
docker push krsche/open-webui:v0.13.4-krsche-player
```

## Publish both architectures

If both the Mac and the server should use the same tag, publish a multi-platform
image instead of replacing the tag with each architecture separately:

```sh
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --progress=plain \
  -t krsche/open-webui:v0.13.4-krsche-player \
  --push .
```

This requires a builder supporting both platforms and builds both variants.

## Verify the published platform

```sh
docker buildx imagetools inspect krsche/open-webui:v0.13.4-krsche-player
```

For the server, confirm that `linux/amd64` is available. Pull the updated tag on
the server before recreating its Compose service.

## Memory and optional build settings

Check the memory available to Docker, which may be much less than the Mac's RAM:

```sh
docker info --format '{{.MemTotal}}'
```

On the 24 GB Mac, allocate about 12 GB to Docker Desktop under
Settings > Resources > Advanced > Memory, then apply and restart Docker.
The previously reported `4106604544` bytes is only about 3.82 GiB.

Docker builds default to a 5120 MiB Node heap and disabled source maps. Total
memory use exceeds that heap limit, particularly when backend steps run in
parallel. Override these settings by adding build arguments, for example:

```sh
docker buildx build \
  --platform linux/amd64 \
  --build-arg BUILD_NODE_HEAP_MB=5120 \
  --build-arg BUILD_SOURCEMAP=false \
  --progress=plain \
  -t krsche/open-webui:v0.13.4-krsche-player \
  --push .
```

Do not add `-m 8G` to these Buildx commands. For a smaller image, add
`--build-arg USE_SLIM=true` and use a distinct tag ending in `-slim`. That variant
omits the bundled local ML/audio/document-processing stack and model downloads;
check that your deployment does not need those capabilities before switching.

See [the audio upgrade notes](audio-upgrade.md) for validation results and the
build-context exclusions protecting local environment files, generated signing
keys, and application data. Build from the updated source tree before publishing.
