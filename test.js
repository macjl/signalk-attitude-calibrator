'use strict';

const assert = require('assert');
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

const schema = pluginFactory({
  debug: () => {},
  error: () => {},
  handleMessage: () => {},
  subscriptionmanager: { subscribe: () => {} }
}).schema;

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

console.log('All tests passed');
