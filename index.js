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
      source: {
        type: 'object',
        title: 'Source',
        properties: {
          mode: {
            type: 'string',
            title: 'Source mode',
            description: 'Choose which navigation.attitude source updates to calibrate.',
            enum: ['all', 'preferred', 'specific'],
            enumNames: ['All sources', 'Preferred source only', 'Specific source'],
            default: 'all'
          }
        },
        dependencies: {
          mode: {
            oneOf: [
              {
                properties: {
                  mode: {
                    enum: ['all']
                  }
                }
              },
              {
                properties: {
                  mode: {
                    enum: ['preferred']
                  }
                }
              },
              {
                properties: {
                  mode: {
                    enum: ['specific']
                  },
                  specificSource: {
                    type: 'string',
                    title: 'Specific source',
                    description: 'Full source identifier as shown in the Data Browser (e.g. "signalk-attitude-converter.0").',
                    minLength: 1,
                    default: ''
                  }
                },
                required: ['specificSource']
              }
            ]
          }
        },
        default: {
          mode: 'all'
        }
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

  function getSourceConfiguration (options) {
    const legacySourceFilter = options.sourceFilter ? options.sourceFilter.trim() : '';
    const configuredMode = options.source && options.source.mode;
    const legacyMode =
      options.noSourceFilterMode === 'preferred' || options.noSourceFilterMode === 'priority'
        ? 'preferred'
        : 'all';

    let mode = configuredMode || (legacySourceFilter ? 'specific' : legacyMode);

    if (!['all', 'preferred', 'specific'].includes(mode)) {
      mode = 'all';
    }

    const specificSource =
      options.source && options.source.specificSource
        ? options.source.specificSource.trim()
        : legacySourceFilter;

    return {
      mode,
      sourceFilter: mode === 'specific' ? specificSource : '',
      hasValidSourceFilter: mode !== 'specific' || Boolean(specificSource),
      sourcePolicy: mode === 'preferred' ? 'preferred' : 'all'
    };
  }

  plugin.start = function (options) {
    const pitchOffset  = options.pitchOffset  || 0;
    const rollOffset   = options.rollOffset   || 0;
    const yawOffset    = options.yawOffset    || 0;
    const sourceConfig = getSourceConfiguration(options);
    const sourceFilter = sourceConfig.sourceFilter;

    app.debug(`Starting — offsets: pitch=${pitchOffset} roll=${rollOffset} yaw=${yawOffset} rad, sourceMode=${sourceConfig.mode}, source=${sourceFilter || '(all)'}, sourcePolicy=${sourceConfig.sourcePolicy}`);

    if (!sourceConfig.hasValidSourceFilter) {
      app.error('Specific source mode requires a non-empty source identifier');
    }

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
      sourcePolicy: sourceConfig.sourcePolicy,
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

          // Apply source filter if configured ($source matches what the Data Browser displays)
          if (!sourceConfig.hasValidSourceFilter) return;
          if (sourceFilter && update.$source !== sourceFilter) return;

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
