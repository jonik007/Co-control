const path = require('path');
const express = require('express');
const cors = require('cors');

const services = require('./services');
const containersRouter = require('./routes/containers');
const imagesRouter = require('./routes/images');
const systemRouter = require('./routes/system');

const PORT = process.env.PORT || 4000;
const CLIENT_BUILD_DIR = path.join(__dirname, '..', '..', 'client', 'build');

async function main() {
  const mode = await services.init();

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ ok: true, mode: services.getMode() }));
  app.use('/api/containers', containersRouter);
  app.use('/api/images', imagesRouter);
  app.use('/api/system', systemRouter);

  // Serve the built React app in production, if present.
  app.use(express.static(CLIENT_BUILD_DIR));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(CLIENT_BUILD_DIR, 'index.html'), (err) => {
      if (err) next();
    });
  });

  app.listen(PORT, () => {
    console.log(`Docker Web Console server listening on port ${PORT} [docker backend: ${mode}]`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
