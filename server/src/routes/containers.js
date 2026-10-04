const express = require('express');
const { getService } = require('../services');

const router = express.Router();

function handleError(res, err) {
  const status = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
  res.status(status >= 100 && status < 600 ? status : 500).json({ error: err.message || 'Unexpected error' });
}

router.get('/', async (req, res) => {
  try {
    const containers = await getService().listContainers();
    res.json(containers);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const data = await getService().inspectContainer(req.params.id);
    if (!data) return res.status(404).json({ error: 'No such container' });
    res.json(data);
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/:id/logs', async (req, res) => {
  try {
    const tail = req.query.tail ? Number(req.query.tail) : 200;
    const logs = await getService().getContainerLogs(req.params.id, { tail });
    res.json({ logs });
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/:id/stats', async (req, res) => {
  try {
    const stats = await getService().getContainerStats(req.params.id);
    res.json(stats);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, image, ports, env } = req.body || {};
    if (!image || !String(image).trim()) {
      return res.status(400).json({ error: 'Image is required' });
    }
    const created = await getService().createContainer({ name, image, ports, env });
    res.status(201).json(created);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/:id/start', async (req, res) => {
  try {
    await getService().startContainer(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/:id/stop', async (req, res) => {
  try {
    await getService().stopContainer(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/:id/restart', async (req, res) => {
  try {
    await getService().restartContainer(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/:id/pause', async (req, res) => {
  try {
    await getService().pauseContainer(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/:id/unpause', async (req, res) => {
  try {
    await getService().unpauseContainer(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    await getService().removeContainer(req.params.id, { force });
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
