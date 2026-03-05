import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, stack }) =>
    stack
      ? `${ts} ${level}: ${message}\n${stack}`
      : `${ts} ${level}: ${message}`
  )
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: process.env.NODE_ENV === 'development' ? devFormat : prodFormat,
  transports: [new winston.transports.Console()],
});

export default logger;
