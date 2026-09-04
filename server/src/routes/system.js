const express = require('express');
const { getService, getMode } = require('../services');

const router = express.Router();

router.get('/info', async (req, res) => {
  try {
    const [info, version] = await Promise.all([getService().info(), getService().version()]);
    res.json({ info, version, mode: getMode() });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Unexpected error' });
  }
});

module.exports = router;
