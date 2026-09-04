# Docker Web Console

A web-based console for managing Docker containers and images — think **Docker Desktop, but in your browser**. The frontend is a React app built with `react-scripts` (Create React App); the backend is a small Express API that talks to the Docker Engine through [`dockerode`](https://github.com/apocas/dockerode).

## Features

- **Containers view** — list all containers with live status, ports, and creation time. Start, stop, restart, pause/unpause, and remove containers with one click.
- **Container details drawer** — inspect metadata, tail live logs, and watch live CPU/memory/network stats with a CPU history sparkline.
- **Run a new container** — pick (or type) an image, optional name, a host↔container port mapping, and environment variables.
- **Images view** — list local images with size/age/usage, pull new images by name, remove unused ones, or launch a container straight from an image.
- **Live sidebar summary** — running/paused/stopped counts and Docker engine version, auto-refreshed.
- **Works without Docker installed** — if no Docker daemon is reachable, the backend automatically serves realistic **mock data** so the UI is fully explorable/demoable.

## Project structure

```
.
├── client/   # React app (react-scripts / Create React App)
└── server/   # Express API backed by dockerode (or the in-memory mock)
```

## Requirements

- Node.js 18+
- Docker Engine running locally, with the socket accessible to the server process (optional — the app falls back to mock mode automatically)

## Getting started

Install dependencies for both apps:

```bash
npm run install:all
```

### Development (hot reload)

Runs the API on port `4000` and the React dev server on port `3000` (proxying `/api` to the backend):

```bash
npm run dev
```

Then open http://localhost:3000.

### Production-style run (single server)

Builds the React app and serves it from the Express server on one port:

```bash
npm start
```

Then open http://localhost:4000.

## Docker backend modes

The server decides how to talk to Docker via the `USE_MOCK` environment variable:

| `USE_MOCK` | Behavior |
| --- | --- |
| unset / `auto` (default) | Tries to reach the local Docker daemon; falls back to the mock backend if it can't. |
| `true` | Always use the in-memory mock backend (useful for demos/tests without Docker). |
| `false` | Always use the real Docker daemon; fails to start if it can't connect. |

Example — force mock mode:

```bash
USE_MOCK=true npm run dev:server
```

By default, `dockerode` connects to the local Docker socket (`/var/run/docker.sock` on Linux/macOS, or the named pipe on Windows). To connect to a remote engine, set the standard `DOCKER_HOST` (and related `DOCKER_*` TLS) environment variables before starting the server.

## API overview

All endpoints are served under `/api` by the Express app in `server/`:

| Method & path | Description |
| --- | --- |
| `GET /api/system/info` | Docker engine info/version + current backend mode |
| `GET /api/containers` | List all containers |
| `GET /api/containers/:id` | Inspect one container |
| `GET /api/containers/:id/logs` | Fetch recent logs (`?tail=`) |
| `GET /api/containers/:id/stats` | One-shot CPU/memory/network stats |
| `POST /api/containers` | Create a container `{ image, name?, ports?, env? }` |
| `POST /api/containers/:id/start` | Start a container |
| `POST /api/containers/:id/stop` | Stop a container |
| `POST /api/containers/:id/restart` | Restart a container |
| `POST /api/containers/:id/pause` | Pause a container |
| `POST /api/containers/:id/unpause` | Unpause a container |
| `DELETE /api/containers/:id` | Remove a container (`?force=true`) |
| `GET /api/images` | List local images |
| `POST /api/images/pull` | Pull an image `{ repoTag }` |
| `DELETE /api/images/:id` | Remove an image |

## Notes

- The browser cannot talk to the Docker Engine API directly (no CORS/auth support, and it would expose the socket to the network), so this project always goes through the Express backend.
- The mock backend simulates realistic container/image data and state transitions, so the whole UI can be developed and tested in any environment, with or without Docker installed.
