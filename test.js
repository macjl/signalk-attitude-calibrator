'use strict';

const assert = require('assert');
const packageJson = require('./package.json');
const pluginFactory = require('./');

function captureSubscription (options) {
  let subscription;

  const app = {
    debug: () => {},
    error: err => {
      throw new Error(err);
    },
    handleMessage: () => {},
    subscriptionmanager: {
      subscribe: command => {
        subscription = command;
      }
    }
  };

  pluginFactory(app).start(options);

  return subscription;
}

function runDelta (options, delta) {
  let callback;
  const messages = [];
  const errors = [];

  const app = {
    debug: () => {},
    error: err => {
      errors.push(err);
    },
    handleMessage: (id, message) => {
      messages.push({ id, message });
    },
    subscriptionmanager: {
      subscribe: (command, unsubscribes, errorCallback, subscribeCallback) => {
        callback = subscribeCallback;
      }
    }
  };

  pluginFactory(app).start(options);
  callback(delta);

  return { messages, errors };
}

function createRouterHarness (options) {
  let callback;
  let savedOptions = null;
  const routes = {};
  const messages = [];
  const app = {
    debug: () => {},
    error: () => {},
    readPluginOptions: () => options,
    savePluginOptions: (nextOptions, done) => {
      savedOptions = nextOptions;
      done();
    },
    handleMessage: (id, message) => {
      messages.push({ id, message });
    },
    subscriptionmanager: {
      subscribe: (command, unsubscribes, errorCallback, subscribeCallback) => {
        callback = subscribeCallback;
      }
    }
  };
  const router = {
    get: (path, handler) => { routes[`GET ${path}`] = handler; },
    put: (path, handler) => { routes[`PUT ${path}`] = handler; },
    post: (path, handler) => { routes[`POST ${path}`] = handler; }
  };
  const plugin = pluginFactory(app);
  plugin.registerWithRouter(router);
  plugin.start(options);

  function callRoute (method, path, body) {
    let statusCode = 200;
    let payload;
    const res = {
      status: code => {
        statusCode = code;
        return res;
      },
      json: value => {
        payload = value;
      }
    };
    routes[`${method} ${path}`]({ body }, res);
    return { statusCode, payload };
  }

  return {
    callRoute,
    get savedOptions () { return savedOptions; },
    messages,
    pushDelta: delta => callback(delta)
  };
}

const schema = pluginFactory({
  debug: () => {},
  error: () => {},
  handleMessage: () => {},
  subscriptionmanager: { subscribe: () => {} }
}).schema;

assert.strictEqual(
  packageJson.signalk.appIcon,
  './icon.svg',
  'webapp icon should use the Signal K appIcon field relative to public/'
);

assert(
  schema.description.includes('/signalk-attitude-calibrator/'),
  'configuration panel should point users to the calibration webapp'
);

assert.deepStrictEqual(
  schema.properties.source.properties.mode.enum,
  ['all', 'preferred', 'specific'],
  'source mode should expose all, preferred and specific choices'
);

assert(
  schema.properties.source.dependencies.mode.oneOf
    .some(option => option.properties.specificSource),
  'specific source field should be shown conditionally by the source mode dependency'
);

assert.strictEqual(
  schema.properties.source.dependencies.mode.oneOf[2].properties.specificSource.minLength,
  1,
  'specific source should not allow an empty source identifier'
);

assert.strictEqual(
  captureSubscription({ source: { mode: 'all' } }).sourcePolicy,
  'all',
  'all mode should subscribe to all sources'
);

assert.strictEqual(
  captureSubscription({ source: { mode: 'preferred' } }).sourcePolicy,
  'preferred',
  'preferred mode should request the Signal K preferred source policy'
);

assert.strictEqual(
  captureSubscription({
    source: {
      mode: 'specific',
      specificSource: 'signalk-attitude-converter.0'
    }
  }).sourcePolicy,
  'all',
  'source filter should force all sources so the selected source is not missed'
);

assert.strictEqual(
  captureSubscription({ noSourceFilterMode: 'preferred' }).sourcePolicy,
  'preferred',
  'legacy preferred mode should still work'
);

assert.strictEqual(
  captureSubscription({ sourceFilter: 'signalk-attitude-converter.0' }).sourcePolicy,
  'all',
  'legacy source filter should still force all sources'
);

const emptySpecificSourceResult = runDelta(
  { source: { mode: 'specific', specificSource: '' } },
  {
    updates: [{
      $source: 'sensor.1',
      values: [{
        path: 'navigation.attitude',
        value: { pitch: 1 }
      }]
    }]
  }
);

assert(
  emptySpecificSourceResult.errors.some(message => message.includes('Specific source mode requires')),
  'empty specific source should be reported as a configuration error'
);

assert.strictEqual(
  emptySpecificSourceResult.messages.length,
  1,
  'empty specific source should only publish startup metadata'
);

const harness = createRouterHarness({
  source: { mode: 'all' },
  pitchOffset: 0,
  rollOffset: 0,
  yawOffset: 0
});

harness.pushDelta({
  updates: [{
    $source: 'sensor.1',
    timestamp: '2026-05-19T10:00:00.000Z',
    values: [{
      path: 'navigation.attitude',
      value: { pitch: 0.1, roll: -0.2, yaw: 0.3 }
    }]
  }]
});

let stateResponse = harness.callRoute('GET', '/api/state');
assert.strictEqual(
  stateResponse.payload.source.last,
  'sensor.1',
  'state API should expose the last accepted source'
);
assert.deepStrictEqual(
  stateResponse.payload.samples.calibrated.value,
  { pitch: 0.1, roll: -0.2, yaw: 0.3 },
  'state API should expose the last calibrated sample'
);

const zeroResponse = harness.callRoute('POST', '/api/zero', { pitch: true, roll: true });
assert.strictEqual(zeroResponse.statusCode, 200, 'zero API should accept a valid source sample');
assert.deepStrictEqual(
  harness.savedOptions,
  {
    source: { mode: 'all', specificSource: '' },
    pitchOffset: -0.1,
    rollOffset: 0.2,
    yawOffset: 0
  },
  'zero API should persist pitch and roll offsets from the latest source sample'
);

harness.pushDelta({
  updates: [{
    $source: 'sensor.1',
    values: [{
      path: 'navigation.attitude',
      value: { pitch: 0.1, roll: -0.2, yaw: 0.3 }
    }]
  }]
});

const latestMessage = harness.messages[harness.messages.length - 1];
assert.deepStrictEqual(
  latestMessage.message.updates[0].values[0].value,
  { pitch: 0, roll: 0, yaw: 0.3 },
  'saved offsets should be applied immediately without waiting for a restart'
);

stateResponse = harness.callRoute('GET', '/api/state');
assert.deepStrictEqual(
  stateResponse.payload.source.available.map(source => source.id),
  ['sensor.1'],
  'state API should expose observed attitude sources'
);

const sourceResponse = harness.callRoute('PUT', '/api/source', {
  mode: 'specific',
  specificSource: 'sensor.2'
});
assert.strictEqual(sourceResponse.statusCode, 200, 'source API should accept a specific source');
assert.deepStrictEqual(
  harness.savedOptions.source,
  { mode: 'specific', specificSource: 'sensor.2' },
  'source API should persist source mode and selected source'
);

const messageCountBeforeIgnoredSource = harness.messages.length;
harness.pushDelta({
  updates: [{
    $source: 'sensor.1',
    values: [{
      path: 'navigation.attitude',
      value: { pitch: 2 }
    }]
  }]
});
assert.strictEqual(
  harness.messages.length,
  messageCountBeforeIgnoredSource,
  'after source update, samples from non-selected sources should be ignored'
);

harness.pushDelta({
  updates: [{
    $source: 'sensor.2',
    values: [{
      path: 'navigation.attitude',
      value: { pitch: 2 }
    }]
  }]
});
assert.deepStrictEqual(
  harness.messages[harness.messages.length - 1].message.updates[0].values[0].value,
  { pitch: 1.9 },
  'after source update, samples from the selected source should be calibrated'
);

console.log('All tests passed');
