import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../load-tests/game.js', import.meta.url), 'utf8');
const transformed = source
  .replace("import http from 'k6/http';", '')
  .replace("import { check, sleep } from 'k6';", '')
  .replace("import { Counter, Trend } from 'k6/metrics';", '')
  .replace('export const options =', 'const options =')
  .replace('export default function () {', 'function workload() {')
  .replace('export function handleSummary(data) {', 'function handleSummary(data) {')
  + '\nreturn { options, handleSummary, workload };';

if (/\bexport\b/.test(transformed)) {
  throw new Error('Unable to isolate k6 module exports for the local summary test.');
}

class Metric {
  constructor(name) {
    this.name = name;
  }

  add() {
  }
}

const factory = new Function(
  '__ENV',
  'http',
  'check',
  'sleep',
  'Counter',
  'Trend',
  transformed,
);
const { options, handleSummary } = factory(
  {
    TARGET_BASE_URL: 'http://127.0.0.1',
    RUN_ID: 'summary-test',
    RUN_SET_ID: 'local-validation',
    K6_SCENARIO: 'measured',
  },
  {
    get() {
      throw new Error('The local summary test must not issue HTTP requests.');
    },
    post() {
      throw new Error('The local summary test must not issue HTTP requests.');
    },
  },
  () => true,
  () => {},
  Metric,
  Metric,
);

assert.equal(options.scenarios.complete_game.vus, 5);
assert.equal(options.scenarios.complete_game.duration, '2m');
assert.equal(options.thresholds.http_req_failed[0], 'rate<=0.01');
assert.equal(options.thresholds.game_flow_failures[0], 'count==0');

const outputs = handleSummary({ metrics: {} });
const summaryPath = 'evidence/day2/benchmarks/summary-test-summary.json';
assert.deepEqual(Object.keys(outputs).sort(), [summaryPath, 'stdout'].sort());

const summary = JSON.parse(outputs[summaryPath]);
assert.equal(summary.test_config.run_id, 'summary-test');
assert.equal(summary.test_config.run_set_id, 'local-validation');
assert.equal(summary.test_config.scenario, 'measured');
assert.equal(summary.test_config.vus, 5);
assert.equal(summary.test_config.duration, '2m');
assert.equal(summary.test_config.pause_seconds, 1);

const serializedSummary = JSON.stringify(summary);
assert.doesNotMatch(
  serializedSummary,
  /127\.0\.0\.1|https?:\/\/|session|latitude|longitude|response|token|catalog|client.?ip/i,
);
assert.equal(summary.metrics.games_completed.count, null);
assert.equal(summary.metrics.request_duration_ms.p50, null);
assert.equal(summary.thresholds.all_checks_passed, false);

const failedChecks = [];
let getCount = 0;
let postCount = 0;
const invalidImageWorkload = factory(
  {
    TARGET_BASE_URL: 'http://127.0.0.1',
    RUN_ID: 'invalid-image-test',
    RUN_SET_ID: 'local-validation',
    K6_SCENARIO: 'smoke',
  },
  {
    get() {
      getCount += 1;
      return {
        status: 200,
        json() {
          return {
            completed: false,
            round_number: 1,
            image_url: '',
          };
        },
      };
    },
    post() {
      postCount += 1;
      if (postCount !== 1) {
        throw new Error('The invalid-image flow must stop before submitting a guess.');
      }
      return {
        status: 201,
        json() {
          return {
            session_id: 'a'.repeat(64),
            difficulty: 'medium',
            max_rounds: 5,
            current_round: 1,
            outside_only: false,
            leaderboard_mode: false,
          };
        },
      };
    },
  },
  (value, checks) => Object.entries(checks).every(([name, predicate]) => {
    const passed = predicate(value);
    if (!passed) {
      failedChecks.push(name);
    }
    return passed;
  }),
  () => {},
  Metric,
  Metric,
);

invalidImageWorkload.workload();
assert.equal(getCount, 1);
assert.equal(postCount, 1);
assert.deepEqual(
  failedChecks,
  ['round image is valid', 'complete game flow is valid'],
);

const metricSamples = new Map();
class RecordingMetric extends Metric {
  constructor(name) {
    super(name);
    metricSamples.set(name, []);
  }

  add(value) {
    metricSamples.get(this.name).push(value);
  }
}

const sessionId = 'b'.repeat(64);
const roundScores = [101, 202, 303, 404, 505];
let randomImageCount = 0;
let guessCount = 0;
let fullFlowGetCount = 0;
let fullFlowPostCount = 0;
const fullFlowFailedChecks = [];
const fullFlow = factory(
  {
    TARGET_BASE_URL: 'http://127.0.0.1',
    RUN_ID: 'full-flow-test',
    RUN_SET_ID: 'local-validation',
    K6_SCENARIO: 'smoke',
  },
  {
    get(url) {
      fullFlowGetCount += 1;
      if (url.includes('/random-image?')) {
        randomImageCount += 1;
        return {
          status: 200,
          json() {
            return {
              completed: false,
              round_number: randomImageCount,
              image_url: 'http://127.0.0.1/image',
            };
          },
        };
      }
      if (url.includes('/results')) {
        return {
          status: 200,
          json() {
            return {
              session_id: sessionId,
              difficulty: 'medium',
              total_score: roundScores.reduce((total, score) => total + score, 0),
              rounds_played: 5,
              rounds: roundScores.map((score, index) => ({
                round_number: index + 1,
                distance_meters: index + 1,
                score,
              })),
            };
          },
        };
      }
      throw new Error('Unexpected GET path in full-flow mock.');
    },
    post(url, serializedBody) {
      fullFlowPostCount += 1;
      if (url.endsWith('/session')) {
        return {
          status: 201,
          json() {
            return {
              session_id: sessionId,
              difficulty: 'medium',
              max_rounds: 5,
              current_round: 1,
              outside_only: false,
              leaderboard_mode: false,
            };
          },
        };
      }
      if (url.endsWith('/guess')) {
        guessCount += 1;
        const body = JSON.parse(serializedBody);
        assert.equal(body.session_id, sessionId);
        assert.equal(body.round_number, guessCount);
        return {
          status: 200,
          json() {
            return {
              round_number: guessCount,
              distance_meters: guessCount,
              score: roundScores[guessCount - 1],
              total_score: roundScores
                .slice(0, guessCount)
                .reduce((total, score) => total + score, 0),
              game_complete: guessCount === 5,
              next_round_number: guessCount === 5 ? null : guessCount + 1,
            };
          },
        };
      }
      throw new Error('Unexpected POST path in full-flow mock.');
    },
  },
  (value, checks) => Object.entries(checks).every(([name, predicate]) => {
    const passed = predicate(value);
    if (!passed) {
      fullFlowFailedChecks.push(name);
    }
    return passed;
  }),
  () => {},
  RecordingMetric,
  RecordingMetric,
);

fullFlow.workload();
assert.equal(fullFlowGetCount, 6);
assert.equal(fullFlowPostCount, 6);
assert.equal(randomImageCount, 5);
assert.equal(guessCount, 5);
assert.deepEqual(fullFlowFailedChecks, []);
assert.deepEqual(metricSamples.get('games_completed'), [0, 1]);
assert.deepEqual(metricSamples.get('game_flow_failures'), [0]);
assert.deepEqual(metricSamples.get('http_429s'), [0]);
assert.equal(metricSamples.get('full_game_duration_ms').length, 1);

console.log(
  'PASS: k6 initialization, aggregate summary, failure handling, and full five-round flow validated locally.',
);
