/**
 * Quality Gates Metrics Collector
 *
 * Persists and summarizes quality-gate run history for the `aiox metrics`
 * CLI commands (record, show, seed, cleanup).
 *
 * Storage: .aiox/data/quality-metrics.json (relative to CWD), shape:
 *   { version: '1.0', history: [{ timestamp, layer, passed, durationMs,
 *     findingsCount, metadata, coderabbit?, quinn? }, ...] }
 *
 * Layer summaries and trends are derived from `history` on every read
 * rather than stored redundantly, so there is a single source of truth.
 *
 * @module quality/metrics-collector
 * @version 1.0.0
 * @story 3.11a - Quality Gates Metrics Collector
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_RETENTION_DAYS = 30;

/**
 * Default on-disk location for the metrics store.
 * @returns {string}
 */
function defaultDataPath() {
  return path.join(process.cwd(), '.aiox', 'data', 'quality-metrics.json');
}

/**
 * Load the metrics store from disk, tolerating a missing file.
 * @param {string} dataPath
 * @returns {Promise<{version: string, history: object[]}>}
 */
async function loadStore(dataPath) {
  try {
    const raw = await fs.promises.readFile(dataPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.history)) parsed.history = [];
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { version: '1.0', history: [] };
    }
    throw error;
  }
}

/**
 * Persist the metrics store to disk, creating parent directories as needed.
 * @param {string} dataPath
 * @param {{version: string, history: object[]}} store
 * @returns {Promise<void>}
 */
async function saveStore(dataPath, store) {
  await fs.promises.mkdir(path.dirname(dataPath), { recursive: true });
  await fs.promises.writeFile(dataPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

/**
 * Summarize the runs for one layer.
 * @param {object[]} history
 * @param {number} layerNum
 * @returns {object}
 */
function summarizeLayer(history, layerNum) {
  const runs = history.filter((r) => r.layer === layerNum);

  if (runs.length === 0) {
    return { totalRuns: 0, passRate: null, avgTimeMs: null, lastRun: null };
  }

  const passedCount = runs.filter((r) => r.passed).length;
  const totalDuration = runs.reduce((sum, r) => sum + (r.durationMs || 0), 0);
  const lastRun = runs[runs.length - 1];

  const summary = {
    totalRuns: runs.length,
    passRate: passedCount / runs.length,
    avgTimeMs: Math.round(totalDuration / runs.length),
    lastRun: lastRun.timestamp,
  };

  if (layerNum === 2) {
    const withCoderabbit = runs.filter((r) => r.coderabbit?.active);
    const crFindings = withCoderabbit.reduce((s, r) => s + (r.coderabbit.findingsCount || 0), 0);
    const quinnRuns = runs.filter((r) => r.quinn);
    const quinnFindings = quinnRuns.reduce((s, r) => s + (r.quinn.findingsCount || 0), 0);
    const totalFindings = crFindings + quinnFindings;

    summary.autoCatchRate = totalFindings > 0 ? crFindings / totalFindings : null;

    if (withCoderabbit.length > 0) {
      summary.coderabbit = {
        active: true,
        findingsCount: crFindings,
        severityBreakdown: withCoderabbit.reduce(
          (acc, r) => {
            const sb = r.coderabbit.severityBreakdown || {};
            acc.critical += sb.critical || 0;
            acc.high += sb.high || 0;
            acc.medium += sb.medium || 0;
            acc.low += sb.low || 0;
            return acc;
          },
          { critical: 0, high: 0, medium: 0, low: 0 },
        ),
      };
    }

    if (quinnRuns.length > 0) {
      const categories = new Set();
      quinnRuns.forEach((r) => (r.quinn.topCategories || []).forEach((c) => categories.add(c)));
      summary.quinn = {
        findingsCount: quinnFindings,
        topCategories: [...categories],
      };
    }
  }

  return summary;
}

/**
 * Build daily trend series from history.
 * @param {object[]} history
 * @returns {{passRates: object[], autoCatchRate: object[]}}
 */
function buildTrends(history) {
  const byDate = new Map();
  for (const r of history) {
    const date = r.timestamp.substring(0, 10);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(r);
  }

  const dates = [...byDate.keys()].sort();

  const passRates = dates.map((date) => {
    const runs = byDate.get(date);
    const passed = runs.filter((r) => r.passed).length;
    return { date, value: passed / runs.length };
  });

  const autoCatchRate = dates
    .map((date) => {
      const runs = byDate.get(date).filter((r) => r.layer === 2);
      if (runs.length === 0) return null;
      const cr = runs.reduce((s, r) => s + (r.coderabbit?.findingsCount || 0), 0);
      const q = runs.reduce((s, r) => s + (r.quinn?.findingsCount || 0), 0);
      const total = cr + q;
      if (total === 0) return null;
      return { date, value: cr / total };
    })
    .filter(Boolean);

  return { passRates, autoCatchRate };
}

/**
 * Assemble the full metrics payload (as returned by getMetrics()) from a
 * flat history array. Exposed so seed-metrics.js can build the same shape
 * without touching disk.
 * @param {object[]} history
 * @param {number} retentionDays
 * @returns {object}
 */
function buildMetricsFromHistory(history, retentionDays) {
  return {
    lastUpdated: history.length ? history[history.length - 1].timestamp : null,
    retentionDays,
    history,
    layers: {
      layer1: summarizeLayer(history, 1),
      layer2: summarizeLayer(history, 2),
      layer3: summarizeLayer(history, 3),
    },
    trends: buildTrends(history),
  };
}

class MetricsCollector {
  /**
   * @param {{retentionDays?: number, dataPath?: string}} [options]
   */
  constructor(options = {}) {
    this.retentionDays = options.retentionDays || DEFAULT_RETENTION_DAYS;
    this.dataPath = options.dataPath || defaultDataPath();
  }

  /**
   * Record a Layer 1 or Layer 3 quality gate run.
   * @param {number} layer
   * @param {{passed?: boolean, durationMs?: number, findingsCount?: number, metadata?: object}} result
   * @returns {Promise<object>} the persisted run record
   */
  async recordRun(layer, result = {}) {
    const store = await loadStore(this.dataPath);
    const run = {
      timestamp: new Date().toISOString(),
      layer,
      passed: result.passed !== false,
      durationMs: result.durationMs || 0,
      findingsCount: result.findingsCount || 0,
      metadata: result.metadata || {},
    };
    store.history.push(run);
    await saveStore(this.dataPath, store);
    return run;
  }

  /**
   * Record a Layer 2 (PR automation) run, with optional CodeRabbit/Quinn detail.
   * @param {{passed?: boolean, durationMs?: number, findingsCount?: number, metadata?: object, coderabbit?: object, quinn?: object}} result
   * @returns {Promise<object>} the persisted run record
   */
  async recordPRReview(result = {}) {
    const store = await loadStore(this.dataPath);
    const run = {
      timestamp: new Date().toISOString(),
      layer: 2,
      passed: result.passed !== false,
      durationMs: result.durationMs || 0,
      findingsCount: result.findingsCount || 0,
      metadata: result.metadata || {},
    };
    if (result.coderabbit) run.coderabbit = { active: true, ...result.coderabbit };
    if (result.quinn) run.quinn = result.quinn;
    store.history.push(run);
    await saveStore(this.dataPath, store);
    return run;
  }

  /**
   * @returns {Promise<object>} full metrics payload (history, layers, trends)
   */
  async getMetrics() {
    const store = await loadStore(this.dataPath);
    return buildMetricsFromHistory(store.history, this.retentionDays);
  }

  /**
   * @param {'csv'} format
   * @returns {Promise<string>}
   */
  async export(format) {
    const { history } = await this.getMetrics();
    if (format === 'csv') {
      const header = 'timestamp,layer,passed,durationMs,findingsCount,storyId,branchName,commitHash';
      const rows = history.map((r) =>
        [
          r.timestamp,
          r.layer,
          r.passed,
          r.durationMs,
          r.findingsCount,
          r.metadata?.storyId || '',
          r.metadata?.branchName || '',
          r.metadata?.commitHash || '',
        ].join(','),
      );
      return [header, ...rows].join('\n');
    }
    throw new Error(`Unsupported export format: ${format}`);
  }

  /**
   * Remove records older than the retention window.
   * @returns {Promise<number>} count of removed records
   */
  async cleanup() {
    const store = await loadStore(this.dataPath);
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    const before = store.history.length;
    store.history = store.history.filter((r) => new Date(r.timestamp).getTime() > cutoff);
    const removed = before - store.history.length;
    if (removed > 0) await saveStore(this.dataPath, store);
    return removed;
  }
}

module.exports = {
  MetricsCollector,
  buildMetricsFromHistory,
  summarizeLayer,
  buildTrends,
  loadStore,
  saveStore,
  defaultDataPath,
  DEFAULT_RETENTION_DAYS,
};
