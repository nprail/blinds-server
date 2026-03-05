import pkg from '../../package.json' with { type: 'json' };
const { version } = pkg;

/**
 * GET /api/health
 * Returns a simple liveness payload that load-balancers / monitoring tools can poll.
 */
export function healthCheck(req, res) {
  res.json({
    success: true,
    data: {
      status: 'ok',
      version,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
}
