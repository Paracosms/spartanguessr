import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

/*
 * Day 2 complete-game workload.
 *
 * This script deliberately keeps session IDs, response bodies, image URLs,
 * and coordinates in memory only. handleSummary writes aggregates and test
 * configuration only.
 */

const SCENARIOS = {
  smoke: {
    vus: 1,
    duration: '30s',
    pauseSeconds: 1,
  },
  measured: {
    vus: 5,
    duration: '2m',
    pauseSeconds: 1,
  },
};

function requiredEnvironment(name, pattern) {
  const value = __ENV[name] || '';
  if (!pattern.test(value)) {
    throw new Error(name + ' is missing or invalid.');
  }
  return value;
}

function positiveIntegerEnvironment(name, fallback) {
  const raw = __ENV[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new Error(name + ' must be a positive integer.');
  }
  return Number(raw);
}

function durationEnvironment(name, fallback) {
  const raw = __ENV[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (!/^[1-9][0-9]*(?:\.[0-9]+)?(?:ms|s|m|h)$/.test(raw)) {
    throw new Error(name + ' must be a positive k6 duration such as 30s or 2m.');
  }
  return raw;
}

function pauseEnvironment(name, fallback) {
  const raw = __ENV[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(raw)) {
    throw new Error(name + ' must be a non-negative number of seconds.');
  }
  return Number(raw);
}

const scenarioName = __ENV.K6_SCENARIO || 'smoke';
if (!Object.prototype.hasOwnProperty.call(SCENARIOS, scenarioName)) {
  throw new Error('K6_SCENARIO must be smoke or measured.');
}

const scenarioDefaults = SCENARIOS[scenarioName];
const targetBaseUrl = requiredEnvironment(
  'TARGET_BASE_URL',
  /^https?:\/\/[^/?#\s@]+(?:\/[^\s?#]*)?$/i,
).replace(/\/+$/, '');
const runId = requiredEnvironment('RUN_ID', /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
const evidenceSet = __ENV.EVIDENCE_SET || 'day2';
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(evidenceSet)) {
  throw new Error('EVIDENCE_SET is missing or invalid.');
}
const vus = positiveIntegerEnvironment('K6_VUS', scenarioDefaults.vus);
const duration = durationEnvironment('K6_DURATION', scenarioDefaults.duration);
const pauseSeconds = pauseEnvironment('K6_PAUSE_SECONDS', scenarioDefaults.pauseSeconds);

const completedGames = new Counter('games_completed');
const gameFlowFailures = new Counter('game_flow_failures');

export const options = {
  scenarios: {
    complete_game: {
      executor: 'constant-vus',
      vus,
      duration,
      gracefulStop: '15s',
    },
  },
  thresholds: {
    checks: ['rate==1'],
    http_req_failed: ['rate<=0.01'],
    games_completed: ['count>=1'],
    game_flow_failures: ['count==0'],
  },
  summaryTrendStats: ['min', 'avg', 'med', 'max', 'p(95)'],
};

function safeJson(response) {
  try {
    return response.json();
  } catch (_) {
    return null;
  }
}

function validInteger(value) {
  return typeof value === 'number' && Number.isInteger(value);
}

function validNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function validHttpUrl(value) {
  return typeof value === 'string'
    && /^https?:\/\/[^/?#\s@]+(?:\/[^\s]*)?$/i.test(value);
}

function flowCheck(name, passed) {
  return check(null, {
    [name]: function () {
      return passed;
    },
  });
}

function request(method, path, body, operation) {
  const parameters = {
    headers: {
      'Content-Type': 'application/json',
    },
    tags: {
      operation,
    },
  };
  const response = method === 'GET'
    ? http.get(targetBaseUrl + path, parameters)
    : http.post(targetBaseUrl + path, JSON.stringify(body), parameters);

  sleep(pauseSeconds);
  return response;
}

function failFlow() {
  gameFlowFailures.add(1);
  flowCheck('complete game flow is valid', false);
}

export default function () {
  let flowIsValid = true;

  const sessionResponse = request(
    'POST',
    '/session',
    {
      difficulty: 'medium',
      max_rounds: 5,
      outside_only: false,
      leaderboard_mode: false,
    },
    'create_session',
  );
  const session = safeJson(sessionResponse);
  const sessionId = session && session.session_id;

  flowIsValid = flowCheck(
    'normal session is created',
    sessionResponse.status === 201
      && typeof sessionId === 'string'
      && /^[0-9a-f]{64}$/.test(sessionId)
      && session.difficulty === 'medium'
      && session.max_rounds === 5
      && session.current_round === 1
      && session.outside_only === false
      && session.leaderboard_mode === false,
  ) && flowIsValid;

  if (!flowIsValid) {
    failFlow();
    return;
  }

  const roundScores = [];
  let finalGuessTotal = null;
  for (let roundNumber = 1; roundNumber <= 5; roundNumber += 1) {
    const imageResponse = request(
      'GET',
      '/random-image?session_id=' + encodeURIComponent(sessionId),
      null,
      'get_round_image',
    );
    const image = safeJson(imageResponse);
    flowIsValid = flowCheck(
      'round image is valid',
      imageResponse.status === 200
        && image
        && image.completed !== true
        && image.round_number === roundNumber
        && validHttpUrl(image.image_url),
    ) && flowIsValid;

    if (!flowIsValid) {
      failFlow();
      return;
    }

    const guessResponse = request(
      'POST',
      '/guess',
      {
        session_id: sessionId,
        round_number: roundNumber,
        guess_latitude: 500,
        guess_longitude: 600,
      },
      'submit_guess',
    );
    const guess = safeJson(guessResponse);
    const expectedComplete = roundNumber === 5;
    flowIsValid = flowCheck(
      'round score is valid',
      guessResponse.status === 200
        && guess
        && guess.round_number === roundNumber
        && validInteger(guess.score)
        && validInteger(guess.total_score)
        && validNumber(guess.distance_meters)
        && guess.game_complete === expectedComplete
        && (expectedComplete
          ? guess.next_round_number === null
          : guess.next_round_number === roundNumber + 1),
    ) && flowIsValid;

    if (!flowIsValid) {
      failFlow();
      return;
    }

    roundScores.push(guess.score);
    finalGuessTotal = guess.total_score;
  }

  const resultsResponse = request(
    'GET',
    '/session/' + encodeURIComponent(sessionId) + '/results',
    null,
    'get_results',
  );
  const results = safeJson(resultsResponse);
  const computedTotal = roundScores.reduce(function (total, score) {
    return total + score;
  }, 0);
  const resultRoundsAreConsistent = results
    && Array.isArray(results.rounds)
    && results.rounds.length === 5
    && results.rounds.every(function (round, index) {
      return round
        && round.round_number === index + 1
        && validInteger(round.score)
        && round.score === roundScores[index]
        && validNumber(round.distance_meters);
    });

  flowIsValid = flowCheck(
    'results reconcile all five rounds',
    resultsResponse.status === 200
      && results
      && results.session_id === sessionId
      && results.difficulty === 'medium'
      && results.rounds_played === 5
      && validInteger(results.total_score)
      && results.total_score === computedTotal
      && results.total_score === finalGuessTotal
      && resultRoundsAreConsistent,
  ) && flowIsValid;

  if (!flowIsValid) {
    failFlow();
    return;
  }

  completedGames.add(1);
  flowCheck('complete game flow is valid', true);
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metricValues(data, metricName) {
  const metric = data.metrics[metricName];
  return metric && metric.values ? metric.values : {};
}

function metricNumber(data, metricName, valueName) {
  return numberOrNull(metricValues(data, metricName)[valueName]);
}

function thresholdPassed(data, metricName, expression) {
  const metric = data.metrics[metricName];
  const threshold = metric
    && metric.thresholds
    && metric.thresholds[expression];
  return Boolean(threshold && threshold.ok === true);
}

export function handleSummary(data) {
  const gamesPerSecond = metricNumber(data, 'games_completed', 'rate');
  const sanitizedSummary = {
    schema_version: 1,
    test_config: {
      scenario: scenarioName,
      vus,
      duration,
      pause_seconds: pauseSeconds,
    },
    metrics: {
      completed_games_per_minute: gamesPerSecond === null ? null : gamesPerSecond * 60,
      request_p95_ms: metricNumber(data, 'http_req_duration', 'p(95)'),
      http_failure_rate: metricNumber(data, 'http_req_failed', 'rate'),
    },
    thresholds: {
      all_checks_passed: thresholdPassed(data, 'checks', 'rate==1'),
      http_failure_rate_at_most_one_percent: thresholdPassed(
        data,
        'http_req_failed',
        'rate<=0.01',
      ),
      at_least_one_game_completed: thresholdPassed(
        data,
        'games_completed',
        'count>=1',
      ),
      no_game_flow_failures: thresholdPassed(
        data,
        'game_flow_failures',
        'count==0',
      ),
    },
  };

  return {
    ['evidence/' + evidenceSet + '/benchmarks/' + runId + '-summary.json']:
      JSON.stringify(sanitizedSummary, null, 2) + '\n',
    stdout: 'Sanitized summary written for run ' + runId + '.\n',
  };
}
