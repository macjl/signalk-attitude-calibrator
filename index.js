'use strict';

module.exports = function (app) {
  let plugin = {};
  let unsubscribes = [];

  plugin.id = 'signalk-attitude-calibrator';
  plugin.name = 'Attitude Calibrator';
  plugin.description = 'Applies fixed offsets (in radians) to navigation.attitude pitch, roll and yaw values';

  plugin.uiSchema = {};

  plugin.schema = {
    type: 'object',
    properties: {
      sourceFilter: {
        type: 'string',
        title: 'Source filter (optional)',
        description: 'Only calibrate values from this source label. Leave empty to calibrate all sources.',
        default: ''
      },
      pitchOffset: {
        type: 'number',
        title: 'Pitch offset (rad)',
        description: 'Value added to pitch. Positive = bow up.',
        default: 0
      },
      rollOffset: {
        type: 'number',
        title: 'Roll offset (rad)',
        description: 'Value added to roll. Positive = starboard down.',
        default: 0
      },
      yawOffset: {
        type: 'number',
        title: 'Yaw offset (rad)',
        description: 'Value added to yaw.',
        default: 0
      }
    }
  };

  plugin.start = function (options) {
    const pitchOffset  = options.pitchOffset  || 0;
    const rollOffset   = options.rollOffset   || 0;
    const yawOffset    = options.yawOffset    || 0;
    const sourceFilter = options.sourceFilter ? options.sourceFilter.trim() : '';

    app.debug(`Starting — offsets: pitch=${pitchOffset} roll=${rollOffset} yaw=${yawOffset} rad, source=${sourceFilter || '(all)'}`);

    // Declare units metadata
    app.handleMessage(plugin.id, {
      updates: [{
        meta: [
          { path: 'navigation.attitude.pitch', value: { units: 'rad', description: 'Pitch angle, +bow up' } },
          { path: 'navigation.attitude.roll',  value: { units: 'rad', description: 'Roll angle, +starboard down' } },
          { path: 'navigation.attitude.yaw',   value: { units: 'rad', description: 'Yaw angle' } }
        ]
      }]
    });

    const subscription = {
      context: 'vessels.self',
      subscribe: [{ path: 'navigation.attitude' }]
    };

    app.subscriptionmanager.subscribe(
      subscription,
      unsubscribes,
      err => app.error('Subscription error: ' + err),
      delta => {
        delta.updates.forEach(update => {
          // Ignore our own output to prevent feedback loop
          if (update.source && update.source.label === plugin.id) return;

          // Apply source filter if configured
          if (sourceFilter && update.source && update.source.label !== sourceFilter) return;

          update.values.forEach(item => {
            if (item.path === 'navigation.attitude' && item.value) {
              const src = item.value;
              const calibrated = {};

              if (typeof src.pitch === 'number') calibrated.pitch = src.pitch + pitchOffset;
              if (typeof src.roll  === 'number') calibrated.roll  = src.roll  + rollOffset;
              if (typeof src.yaw   === 'number') calibrated.yaw   = src.yaw   + yawOffset;

              if (Object.keys(calibrated).length === 0) return;

              app.handleMessage(plugin.id, {
                updates: [{
                  source: { label: plugin.id },
                  timestamp: update.timestamp || new Date().toISOString(),
                  values: [{ path: 'navigation.attitude', value: calibrated }]
                }]
              });

              app.debug(`Calibrated: pitch=${calibrated.pitch} roll=${calibrated.roll} yaw=${calibrated.yaw}`);
            }
          });
        });
      }
    );
  };

  plugin.stop = function () {
    unsubscribes.forEach(f => f());
    unsubscribes = [];
    app.debug('Attitude Calibrator stopped');
  };

  return plugin;
};
