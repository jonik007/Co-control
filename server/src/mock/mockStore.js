/**
 * In-memory mock backend that emulates the Docker Engine API surface used by
 * this app. Used automatically when a real Docker daemon isn't reachable
 * (e.g. this sandboxed environment) so the UI can still be built/tested end
 * to end, and can also be forced on via USE_MOCK=true.
 */

const crypto = require('crypto');

function randomId(len = 64) {
  return crypto.randomBytes(len / 2).toString('hex');
}

function shortId(id) {
  return id.slice(0, 12);
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function humanDuration(seconds) {
  if (seconds < 60) return `${seconds} seconds`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

const IMAGES = [
  { repo: 'nginx', tag: 'latest', size: 187 * 1024 * 1024 },
  { repo: 'postgres', tag: '16-alpine', size: 243 * 1024 * 1024 },
  { repo: 'redis', tag: '7-alpine', size: 41 * 1024 * 1024 },
  { repo: 'node', tag: '20-alpine', size: 176 * 1024 * 1024 },
  { repo: 'python', tag: '3.12-slim', size: 154 * 1024 * 1024 },
  { repo: 'alpine', tag: 'latest', size: 7 * 1024 * 1024 },
  { repo: 'traefik', tag: 'v3.0', size: 98 * 1024 * 1024 },
];

function buildImages() {
  return IMAGES.map((img) => {
    const id = 'sha256:' + randomId(64);
    return {
      Id: id,
      RepoTags: [`${img.repo}:${img.tag}`],
      RepoDigests: [],
      Created: now() - Math.floor(Math.random() * 60 * 60 * 24 * 30),
      Size: img.size,
      VirtualSize: img.size,
      Containers: 0,
      Labels: {},
    };
  });
}

let images = buildImages();

function findImage(repoTag) {
  return images.find((i) => i.RepoTags.includes(repoTag));
}

const initialContainers = [
  {
    name: 'nginx-web',
    image: 'nginx:latest',
    command: 'nginx -g "daemon off;"',
    state: 'running',
    ports: [{ PrivatePort: 80, PublicPort: 8080, Type: 'tcp' }],
  },
  {
    name: 'postgres-db',
    image: 'postgres:16-alpine',
    command: 'docker-entrypoint.sh postgres',
    state: 'running',
    ports: [{ PrivatePort: 5432, PublicPort: 5432, Type: 'tcp' }],
  },
  {
    name: 'redis-cache',
    image: 'redis:7-alpine',
    command: 'redis-server',
    state: 'exited',
    ports: [],
  },
  {
    name: 'api-backend',
    image: 'node:20-alpine',
    command: 'node server.js',
    state: 'paused',
    ports: [{ PrivatePort: 3000, PublicPort: 3000, Type: 'tcp' }],
  },
  {
    name: 'build-worker',
    image: 'python:3.12-slim',
    command: 'python worker.py',
    state: 'created',
    ports: [],
  },
];

let containers = [];
let containerCounter = 0;
const statsCache = new Map();

function makeContainer(spec) {
  containerCounter += 1;
  const id = randomId(64);
  const img = findImage(spec.image);
  const createdAt = now() - Math.floor(Math.random() * 60 * 60 * 24 * 5) - 60;
  const c = {
    Id: id,
    Names: [`/${spec.name}`],
    Image: spec.image,
    ImageID: img ? img.Id : 'sha256:' + randomId(64),
    Command: spec.command,
    Created: createdAt,
    State: spec.state,
    Status: statusText(spec.state, createdAt),
    Ports: (spec.ports || []).map((p) => ({ IP: '0.0.0.0', ...p })),
    Labels: {},
    HostConfig: { NetworkMode: 'bridge' },
    NetworkSettings: { Networks: { bridge: { IPAMConfig: null } } },
    Mounts: [],
    logs: seedLogs(spec.name),
    envVars: ['NODE_ENV=production'],
  };
  return c;
}

function statusText(state, createdAt) {
  const dur = humanDuration(now() - createdAt);
  switch (state) {
    case 'running':
      return `Up ${dur}`;
    case 'paused':
      return `Up ${dur} (Paused)`;
    case 'exited':
      return `Exited (0) ${dur} ago`;
    case 'created':
      return 'Created';
    default:
      return state;
  }
}

function seedLogs(name) {
  const lines = [];
  const base = Date.now() - 1000 * 60 * 30;
  const samples = [
    `Starting ${name}...`,
    'Listening on port',
    'Connected to network',
    'Ready to accept connections',
    'GET /health 200 OK',
    'Worker process spawned',
    'Cache warmed up',
  ];
  for (let i = 0; i < 12; i += 1) {
    const t = new Date(base + i * 90000).toISOString();
    lines.push(`${t} [${name}] ${samples[i % samples.length]}`);
  }
  return lines;
}

function resetStore() {
  images = buildImages();
  containers = initialContainers.map(makeContainer);
  statsCache.clear();
}

resetStore();

function toSummary(c) {
  return {
    Id: c.Id,
    Names: c.Names,
    Image: c.Image,
    ImageID: c.ImageID,
    Command: c.Command,
    Created: c.Created,
    State: c.State,
    Status: statusText(c.State, c.Created),
    Ports: c.Ports,
    Labels: c.Labels,
    HostConfig: c.HostConfig,
    NetworkSettings: c.NetworkSettings,
    Mounts: c.Mounts,
  };
}

function findContainer(id) {
  return containers.find((c) => c.Id === id || shortId(c.Id) === id || c.Names.includes(`/${id}`));
}

function pushLogLine(c, line) {
  c.logs.push(`${new Date().toISOString()} [${c.Names[0].slice(1)}] ${line}`);
  if (c.logs.length > 500) c.logs.shift();
}

module.exports = {
  ping: async () => true,
  version: async () => ({
    Version: 'mock-24.0.0',
    ApiVersion: '1.43',
    Os: 'linux',
    Arch: 'amd64',
    KernelVersion: 'mock',
    GoVersion: 'go1.22',
  }),
  info: async () => ({
    Containers: containers.length,
    ContainersRunning: containers.filter((c) => c.State === 'running').length,
    ContainersPaused: containers.filter((c) => c.State === 'paused').length,
    ContainersStopped: containers.filter((c) => c.State === 'exited' || c.State === 'created').length,
    Images: images.length,
    ServerVersion: 'mock-24.0.0',
    OperatingSystem: 'Docker Web Console Mock Mode',
    MemTotal: 8 * 1024 * 1024 * 1024,
    NCPU: 4,
  }),

  listContainers: async () => containers.map(toSummary),

  inspectContainer: async (id) => {
    const c = findContainer(id);
    if (!c) return null;
    return {
      Id: c.Id,
      Name: c.Names[0],
      Image: c.Image,
      Created: new Date(c.Created * 1000).toISOString(),
      Path: c.Command.split(' ')[0],
      Args: c.Command.split(' ').slice(1),
      State: {
        Status: c.State,
        Running: c.State === 'running',
        Paused: c.State === 'paused',
        StartedAt: new Date(c.Created * 1000).toISOString(),
      },
      Config: { Image: c.Image, Env: c.envVars, Cmd: c.Command.split(' ') },
      HostConfig: c.HostConfig,
      NetworkSettings: {
        Ports: Object.fromEntries(
          c.Ports.map((p) => [`${p.PrivatePort}/${p.Type}`, [{ HostIp: p.IP, HostPort: String(p.PublicPort) }]])
        ),
      },
      Mounts: c.Mounts,
    };
  },

  startContainer: async (id) => {
    const c = findContainer(id);
    if (!c) throw Object.assign(new Error('No such container'), { statusCode: 404 });
    if (c.State === 'running') throw Object.assign(new Error('Container already started'), { statusCode: 304 });
    c.State = 'running';
    c.Created = c.Created; // keep created time, status text recalculated on read
    c.startedAt = now();
    c.Status = statusText('running', c.startedAt);
    pushLogLine(c, 'Container started');
    return true;
  },

  stopContainer: async (id) => {
    const c = findContainer(id);
    if (!c) throw Object.assign(new Error('No such container'), { statusCode: 404 });
    if (c.State === 'exited') throw Object.assign(new Error('Container already stopped'), { statusCode: 304 });
    c.State = 'exited';
    c.stoppedAt = now();
    pushLogLine(c, 'Container stopped');
    statsCache.delete(c.Id);
    return true;
  },

  restartContainer: async (id) => {
    const c = findContainer(id);
    if (!c) throw Object.assign(new Error('No such container'), { statusCode: 404 });
    c.State = 'running';
    c.startedAt = now();
    pushLogLine(c, 'Container restarted');
    return true;
  },

  pauseContainer: async (id) => {
    const c = findContainer(id);
    if (!c) throw Object.assign(new Error('No such container'), { statusCode: 404 });
    if (c.State !== 'running') throw Object.assign(new Error('Container is not running'), { statusCode: 409 });
    c.State = 'paused';
    pushLogLine(c, 'Container paused');
    return true;
  },

  unpauseContainer: async (id) => {
    const c = findContainer(id);
    if (!c) throw Object.assign(new Error('No such container'), { statusCode: 404 });
    if (c.State !== 'paused') throw Object.assign(new Error('Container is not paused'), { statusCode: 409 });
    c.State = 'running';
    pushLogLine(c, 'Container unpaused');
    return true;
  },

  removeContainer: async (id, { force } = {}) => {
    const c = findContainer(id);
    if (!c) throw Object.assign(new Error('No such container'), { statusCode: 404 });
    if (c.State === 'running' && !force) {
      throw Object.assign(new Error('You cannot remove a running container. Stop it first or use force.'), {
        statusCode: 409,
      });
    }
    containers = containers.filter((x) => x.Id !== c.Id);
    statsCache.delete(c.Id);
    return true;
  },

  getContainerLogs: async (id, { tail = 200 } = {}) => {
    const c = findContainer(id);
    if (!c) throw Object.assign(new Error('No such container'), { statusCode: 404 });
    pushLogLine(c, `heartbeat ok (${c.State})`);
    return c.logs.slice(-tail).join('\n');
  },

  getContainerStats: async (id) => {
    const c = findContainer(id);
    if (!c) throw Object.assign(new Error('No such container'), { statusCode: 404 });
    if (c.State !== 'running') {
      return { cpuPercent: 0, memUsage: 0, memLimit: 512 * 1024 * 1024, memPercent: 0, netRx: 0, netTx: 0 };
    }
    const prev = statsCache.get(c.Id) || {
      cpuPercent: 2 + Math.random() * 10,
      memUsage: (40 + Math.random() * 100) * 1024 * 1024,
      netRx: Math.random() * 1024 * 1024,
      netTx: Math.random() * 1024 * 1024,
    };
    const drift = (v, min, max, step) => Math.min(max, Math.max(min, v + (Math.random() - 0.5) * step));
    const next = {
      cpuPercent: drift(prev.cpuPercent, 0.5, 95, 6),
      memUsage: drift(prev.memUsage, 20 * 1024 * 1024, 480 * 1024 * 1024, 8 * 1024 * 1024),
      memLimit: 512 * 1024 * 1024,
      netRx: prev.netRx + Math.random() * 50000,
      netTx: prev.netTx + Math.random() * 30000,
    };
    next.memPercent = (next.memUsage / next.memLimit) * 100;
    statsCache.set(c.Id, next);
    return next;
  },

  listImages: async () =>
    images.map((img) => ({
      ...img,
      Containers: containers.filter((c) => c.Image === img.RepoTags[0]).length,
    })),

  pullImage: async (repoTag) => {
    if (findImage(repoTag)) return findImage(repoTag);
    const [repo, tag = 'latest'] = repoTag.split(':');
    const img = {
      Id: 'sha256:' + randomId(64),
      RepoTags: [`${repo}:${tag}`],
      RepoDigests: [],
      Created: now(),
      Size: Math.floor(20 + Math.random() * 200) * 1024 * 1024,
      VirtualSize: 0,
      Containers: 0,
      Labels: {},
    };
    img.VirtualSize = img.Size;
    images.push(img);
    return img;
  },

  removeImage: async (id) => {
    const before = images.length;
    images = images.filter((i) => i.Id !== id && !i.RepoTags.includes(id));
    if (images.length === before) throw Object.assign(new Error('No such image'), { statusCode: 404 });
    return true;
  },

  createContainer: async ({ name, image, ports = [], env = [] }) => {
    if (!findImage(image)) {
      await module.exports.pullImage(image);
    }
    const finalName = name && name.trim() ? name.trim() : `${image.split(':')[0]}-${randomId(4)}`;
    if (containers.some((c) => c.Names.includes(`/${finalName}`))) {
      throw Object.assign(new Error(`Container name "/${finalName}" is already in use`), { statusCode: 409 });
    }
    const c = makeContainer({
      name: finalName,
      image,
      command: 'default command',
      state: 'created',
      ports: ports.map((p) => ({ PrivatePort: Number(p.container), PublicPort: Number(p.host), Type: 'tcp' })),
    });
    c.envVars = env.length ? env : c.envVars;
    containers.push(c);
    return toSummary(c);
  },

  __resetForTests: resetStore,
};
