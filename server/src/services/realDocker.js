/**
 * Real backend, talking to the local Docker Engine via the Docker socket
 * (or DOCKER_HOST) using dockerode. Exposes the same async interface as
 * ../mock/mockStore so routes are backend-agnostic.
 */

const Docker = require('dockerode');

const docker = new Docker();

function resolve(id) {
  return docker.getContainer(id);
}

async function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Docker multiplexes stdout/stderr with an 8-byte header per frame when the
// container was not started with a TTY. Strip those headers so logs render
// as plain text.
function demuxLogBuffer(buffer) {
  let out = '';
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (start > buffer.length) break;
    out += buffer.slice(start, Math.min(end, buffer.length)).toString('utf8');
    offset = end;
  }
  return out || buffer.toString('utf8');
}

function calcCpuPercent(stats) {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const cpuCount = stats.cpu_stats.online_cpus || (stats.cpu_stats.cpu_usage.percpu_usage || [1]).length || 1;
  if (systemDelta > 0 && cpuDelta > 0) {
    return (cpuDelta / systemDelta) * cpuCount * 100;
  }
  return 0;
}

module.exports = {
  ping: async () => {
    await docker.ping();
    return true;
  },

  version: async () => docker.version(),

  info: async () => docker.info(),

  listContainers: async () => docker.listContainers({ all: true }),

  inspectContainer: async (id) => {
    try {
      return await resolve(id).inspect();
    } catch (err) {
      if (err.statusCode === 404) return null;
      throw err;
    }
  },

  startContainer: async (id) => {
    await resolve(id).start();
    return true;
  },

  stopContainer: async (id) => {
    await resolve(id).stop();
    return true;
  },

  restartContainer: async (id) => {
    await resolve(id).restart();
    return true;
  },

  pauseContainer: async (id) => {
    await resolve(id).pause();
    return true;
  },

  unpauseContainer: async (id) => {
    await resolve(id).unpause();
    return true;
  },

  removeContainer: async (id, { force } = {}) => {
    await resolve(id).remove({ force: !!force });
    return true;
  },

  getContainerLogs: async (id, { tail = 200 } = {}) => {
    const container = resolve(id);
    const stream = await container.logs({ stdout: true, stderr: true, tail, timestamps: true });
    const buffer = await streamToBuffer(stream);
    return demuxLogBuffer(buffer).trim();
  },

  getContainerStats: async (id) => {
    const container = resolve(id);
    const stats = await container.stats({ stream: false });
    const cpuPercent = calcCpuPercent(stats);
    const memUsage = stats.memory_stats.usage || 0;
    const memLimit = stats.memory_stats.limit || 1;
    const netIn = Object.values(stats.networks || {}).reduce((sum, n) => sum + (n.rx_bytes || 0), 0);
    const netOut = Object.values(stats.networks || {}).reduce((sum, n) => sum + (n.tx_bytes || 0), 0);
    return {
      cpuPercent,
      memUsage,
      memLimit,
      memPercent: (memUsage / memLimit) * 100,
      netRx: netIn,
      netTx: netOut,
    };
  },

  listImages: async () => docker.listImages(),

  pullImage: async (repoTag) =>
    new Promise((resolve, reject) => {
      docker.pull(repoTag, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err2) => {
          if (err2) return reject(err2);
          resolve({ RepoTags: [repoTag] });
        });
      });
    }),

  removeImage: async (id) => {
    await docker.getImage(id).remove({ force: true });
    return true;
  },

  createContainer: async ({ name, image, ports = [], env = [] }) => {
    const exposedPorts = {};
    const portBindings = {};
    ports.forEach((p) => {
      const key = `${p.container}/tcp`;
      exposedPorts[key] = {};
      portBindings[key] = [{ HostPort: String(p.host) }];
    });

    try {
      await docker.getImage(image).inspect();
    } catch {
      await module.exports.pullImage(image);
    }

    const container = await docker.createContainer({
      name: name && name.trim() ? name.trim() : undefined,
      Image: image,
      Env: env,
      ExposedPorts: exposedPorts,
      HostConfig: { PortBindings: portBindings },
    });
    return container.inspect();
  },
};
