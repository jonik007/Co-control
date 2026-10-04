const express = require('express');
const { getService } = require('../services');

const router = express.Router();

function handleError(res, err) {
  const status = err.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : 500;
  res.status(status >= 100 && status < 600 ? status : 500).json({ error: err.message || 'Unexpected error' });
}

router.get('/', async (req, res) => {
  try {
    const images = await getService().listImages();
    res.json(images);
  } catch (err) {
    handleError(res, err);
  }
});

router.post('/pull', async (req, res) => {
  try {
    const { repoTag } = req.body || {};
    if (!repoTag || !String(repoTag).trim()) {
      return res.status(400).json({ error: 'repoTag is required, e.g. "nginx:latest"' });
    }
    const image = await getService().pullImage(repoTag.trim());
    res.status(201).json(image);
  } catch (err) {
    handleError(res, err);
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await getService().removeImage(decodeURIComponent(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
