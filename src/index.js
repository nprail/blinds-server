import app from './app.js';
import config from './config/index.js';
import logger from './utils/logger.js';

const { port, host } = config;

app.listen(port, host, () => {
  logger.info(`blinds-server listening on http://${host}:${port}`);
  logger.info(`Environment : ${config.nodeEnv}`);
  logger.info(`RF frequency: ${(config.rf.frequencyHz / 1e6).toFixed(2)} MHz`);
});
