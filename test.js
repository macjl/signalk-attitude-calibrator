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

assert.strictEqual(
  captureSubscription({ noSourceFilterMode: 'all' }).sourcePolicy,
  'all',
  'all mode should subscribe to all sources'
);

assert.strictEqual(
  captureSubscription({ noSourceFilterMode: 'preferred' }).sourcePolicy,
  'preferred',
  'preferred mode should request the Signal K preferred source policy'
);

assert.strictEqual(
  captureSubscription({
    sourceFilter: 'signalk-attitude-converter.0',
    noSourceFilterMode: 'preferred'
  }).sourcePolicy,
  'all',
  'source filter should force all sources so the selected source is not missed'
);

console.log('All tests passed');
