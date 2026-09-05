/**
 * Quality Gates Metrics Seeder
 *
 * Generates synthetic quality-gate run history for exercising the
 * `aiox metrics show --trends` dashboard without real CI data.
 *
 * @module quality/seed-metrics
 * @version 1.0.0
 * @story 3.11a - Quality Gates Metrics Collector
 */

const {
  buildMetricsFromHistory,
  loadStore,
  saveStore,
  defaultDataPath,
  DEFAULT_RETENTION_DAYS,
} = require('./metrics-collector');

const QUINN_CATEGORIES = ['correctness', 'simplification', 'efficiency', 'test-coverage', 'security'];

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
  return Math.round(randomBetween(min, max));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Build a synthetic history array without touching disk.
 * @param {{days?: number, runsPerDay?: number, weekendReduction?: boolean}} options
 * @returns {object[]}
 */
function generateHistory(options = {}) {
  const days = options.days ?? 30;
  const runsPerDay = options.runsPerDay ?? 8;
  const weekendReduction = options.weekendReduction !== false;

  const history = [];
  const now = Date.now();

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
    const dayDate = new Date(now - dayOffset * 86400000);
    const isWeekend = [0, 6].includes(dayDate.getDay());
    const dayRuns = Math.max(
      1,
      Math.round(runsPerDay * (isWeekend && weekendReduction ? 0.3 : 1) * randomBetween(0.6, 1.4)),
    );

    for (let i = 0; i < dayRuns; i++) {
      // Layer 1 (pre-commit) fires far more often than Layer 2/3.
      const layer = pick([1, 1, 1, 1, 2, 2, 3]);

      const timestamp = new Date(dayDate);
      timestamp.setHours(randomInt(8, 20), randomInt(0, 59), 0, 0);

      const baseline = layer === 1 ? 0.85 : layer === 2 ? 0.75 : 0.9;
      const passed = Math.random() < baseline;

      const durationMs =
        layer === 1
          ? randomInt(1500, 6000)
          : layer === 2
            ? randomInt(20000, 180000)
            : randomInt(60000, 900000);

      const findingsCount = passed ? randomInt(0, 2) : randomInt(1, 8);

      const run = {
        timestamp: timestamp.toISOString(),
        layer,
        passed,
        durationMs,
        findingsCount,
        metadata: { triggeredBy: 'seed' },
      };

      if (layer === 2) {
        const critical = randomInt(0, 1);
        const high = randomInt(0, 2);
        const medium = randomInt(0, 2);
        const low = randomInt(0, 2);
        run.coderabbit = {
          active: true,
          findingsCount: critical + high + medium + low,
          severityBreakdown: { critical, high, medium, low },
        };

        const quinnFindings = randomInt(0, 3);
        run.quinn = {
          findingsCount: quinnFindings,
          topCategories: quinnFindings > 0 ? [pick(QUINN_CATEGORIES)] : [],
        };
      }

      history.push(run);
    }
  }

  history.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return history;
}

/**
 * Generate seed data and return it in the same shape as
 * `MetricsCollector#getMetrics()`, without persisting anything (dry-run).
 * @param {{days?: number, runsPerDay?: number, weekendReduction?: boolean, retentionDays?: number}} options
 * @returns {object}
 */
function generateSeedData(options = {}) {
  const history = generateHistory(options);
  return buildMetricsFromHistory(history, options.retentionDays ?? DEFAULT_RETENTION_DAYS);
}

/**
 * Generate seed data and merge it into the on-disk metrics store.
 * @param {{days?: number, runsPerDay?: number, weekendReduction?: boolean, retentionDays?: number, dataPath?: string}} options
 * @returns {Promise<object>} metrics payload after saving
 */
async function seedMetrics(options = {}) {
  const dataPath = options.dataPath || defaultDataPath();
  const store = await loadStore(dataPath);
  const generated = generateHistory(options);

  store.history = [...store.history, ...generated].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  await saveStore(dataPath, store);

  return buildMetricsFromHistory(store.history, options.retentionDays ?? DEFAULT_RETENTION_DAYS);
}

module.exports = {
  generateSeedData,
  seedMetrics,
};
