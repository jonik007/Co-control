const mockStore = require('../mock/mockStore');

let selected = null;
let selectedMode = null;

/**
 * Decide once at startup whether to talk to a real Docker daemon or fall
 * back to the in-memory mock backend. Controlled by USE_MOCK:
 *  - "true"  -> always mock
 *  - "false" -> always real (throws if daemon unreachable)
 *  - unset/"auto" -> try real Docker, fall back to mock on failure
 */
async function init() {
  const mode = (process.env.USE_MOCK || 'auto').toLowerCase();

  if (mode === 'true') {
    selected = mockStore;
    selectedMode = 'mock';
    return selectedMode;
  }

  const realDocker = require('./realDocker');

  if (mode === 'false') {
    await realDocker.ping();
    selected = realDocker;
    selectedMode = 'real';
    return selectedMode;
  }

  try {
    await realDocker.ping();
    selected = realDocker;
    selectedMode = 'real';
  } catch (err) {
    console.warn(`[docker-web-console] Docker daemon unreachable (${err.message}). Falling back to mock mode.`);
    selected = mockStore;
    selectedMode = 'mock';
  }
  return selectedMode;
}

function getService() {
  if (!selected) {
    throw new Error('Docker service not initialized yet');
  }
  return selected;
}

function getMode() {
  return selectedMode;
}

module.exports = { init, getService, getMode };
