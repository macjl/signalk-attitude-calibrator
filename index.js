'use strict';

module.exports = function (app) {
  let plugin = {};
  let unsubscribes = [];
  let sourceDiscoveryUnsubscribes = [];
  let currentOptions = {};
  let restartPlugin = null;
  let isRunning = false;
  let lastSource = null;
  let lastSourceSample = null;
  let lastCalibratedSample = null;
  let lastIgnoredSource = null;
  let lastError = null;
  let observedSources = new Map();

  plugin.id = 'signalk-attitude-calibrator';
  plugin.name = 'Attitude Calibrator';
  plugin.description = 'Applies fixed offsets (in radians) to navigation.attitude pitch, roll and yaw values';

  plugin.uiSchema = {};

  plugin.schema = {
    type: 'object',
    description: 'The calibration workflow is easier from the webapp: open Apps → Attitude Calibrator, or go to /signalk-attitude-calibrator/. This configuration panel remains available for manual fallback settings.',
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

  function numberOrZero (value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  function normalizeOptions (options) {
    const normalizedSource = options.source && typeof options.source === 'object'
      ? {
          mode: options.source.mode,
          specificSource: options.source.specificSource || ''
        }
      : options.source;

    return {
      ...options,
      source: normalizedSource,
      pitchOffset: numberOrZero(options.pitchOffset),
      rollOffset: numberOrZero(options.rollOffset),
      yawOffset: numberOrZero(options.yawOffset)
    };
  }

  function sourceFromUpdate (update) {
    return update.$source || (update.source && update.source.label) || null;
  }

  function rememberSource (update) {
    const source = sourceFromUpdate(update);
    if (!source || source === plugin.id) return;

    const hasAttitude = Array.isArray(update.values) && update.values.some(item => item.path === 'navigation.attitude');
    if (!hasAttitude) return;

    observedSources.set(source, {
      id: source,
      lastSeen: update.timestamp || new Date().toISOString()
    });
  }

  function getObservedSources () {
    return Array.from(observedSources.values())
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  function getSourceOptionsFromRequest (body) {
    const mode = body && body.mode;
    const specificSource = body && body.specificSource ? String(body.specificSource).trim() : '';

    if (!['all', 'preferred', 'specific'].includes(mode)) {
      return { error: 'Source mode must be all, preferred or specific' };
    }

    if (mode === 'specific' && !specificSource) {
      return { error: 'Specific source mode requires a non-empty source identifier' };
    }

    return {
      value: {
        mode,
        specificSource: mode === 'specific' ? specificSource : ''
      }
    };
  }

  function getStoredOptions () {
    if (typeof app.readPluginOptions !== 'function') return {};
    const stored = app.readPluginOptions() || {};
    return stored.configuration || stored || {};
  }

  function saveOptions (options, callback) {
    currentOptions = normalizeOptions(options);

    if (typeof app.savePluginOptions === 'function') {
      app.savePluginOptions(currentOptions, err => {
        if (err) {
          lastError = `Error saving plugin options: ${err.message || err}`;
          app.error(lastError);
          if (callback) callback(err);
          return;
        }
        if (callback) callback(null);
      });
      return;
    }

    if (typeof restartPlugin === 'function') {
      restartPlugin(currentOptions);
      if (callback) callback(null);
      return;
    }

    if (callback) callback(new Error('Plugin option persistence is not available on this Signal K server'));
  }

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

  function getState () {
    const sourceConfig = getSourceConfiguration(currentOptions);
    return {
      id: plugin.id,
      name: plugin.name,
      isRunning,
      source: {
        mode: sourceConfig.mode,
        specificSource: sourceConfig.sourceFilter,
        policy: sourceConfig.sourcePolicy,
        hasValidSourceFilter: sourceConfig.hasValidSourceFilter,
        last: lastSource,
        lastIgnored: lastIgnoredSource,
        available: getObservedSources()
      },
      offsets: {
        pitch: numberOrZero(currentOptions.pitchOffset),
        roll: numberOrZero(currentOptions.rollOffset),
        yaw: numberOrZero(currentOptions.yawOffset)
      },
      samples: {
        source: lastSourceSample,
        calibrated: lastCalibratedSample
      },
      error: lastError
    };
  }

  function updateOffsets (offsets, callback) {
    const nextOptions = {
      ...currentOptions,
      pitchOffset: offsets.pitchOffset,
      rollOffset: offsets.rollOffset,
      yawOffset: offsets.yawOffset
    };

    saveOptions(nextOptions, callback);
  }

  function updateSourceOptions (sourceOptions, callback) {
    const nextOptions = {
      ...currentOptions,
      source: sourceOptions
    };

    saveOptions(nextOptions, err => {
      if (err) {
        if (callback) callback(err);
        return;
      }
      resubscribe();
      if (callback) callback(null);
    });
  }

  function resetSamplesForSourceChange () {
    lastSource = null;
    lastSourceSample = null;
    lastCalibratedSample = null;
    lastIgnoredSource = null;
    lastError = null;
  }

  function unsubscribe () {
    unsubscribes.forEach(f => f());
    unsubscribes = [];
  }

  function unsubscribeSourceDiscovery () {
    sourceDiscoveryUnsubscribes.forEach(f => f());
    sourceDiscoveryUnsubscribes = [];
  }

  function resubscribe () {
    if (!isRunning) return;
    unsubscribe();
    resetSamplesForSourceChange();
    subscribeToAttitude();
  }

  plugin.registerWithRouter = function (router) {
    currentOptions = normalizeOptions({
      ...currentOptions,
      ...getStoredOptions()
    });

    router.get('/api/state', (req, res) => {
      res.json(getState());
    });

    router.put('/api/offsets', (req, res) => {
      const body = req.body || {};
      const nextOffsets = {
        pitchOffset: 'pitchOffset' in body ? Number(body.pitchOffset) : numberOrZero(currentOptions.pitchOffset),
        rollOffset: 'rollOffset' in body ? Number(body.rollOffset) : numberOrZero(currentOptions.rollOffset),
        yawOffset: 'yawOffset' in body ? Number(body.yawOffset) : numberOrZero(currentOptions.yawOffset)
      };

      if (!Object.values(nextOffsets).every(Number.isFinite)) {
        return res.status(400).json({ error: 'Offsets must be finite numbers' });
      }

      updateOffsets(nextOffsets, err => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(getState());
      });
    });

    router.put('/api/source', (req, res) => {
      const parsed = getSourceOptionsFromRequest(req.body || {});
      if (parsed.error) return res.status(400).json({ error: parsed.error });

      updateSourceOptions(parsed.value, err => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(getState());
      });
    });

    router.post('/api/zero', (req, res) => {
      const body = req.body || {};
      const zeroPitch = body.pitch !== false;
      const zeroRoll = body.roll !== false;

      if (!lastSourceSample || !lastSourceSample.value) {
        return res.status(409).json({ error: 'No source attitude sample has been received yet' });
      }

      const sourceValue = lastSourceSample.value;
      const nextOffsets = {
        pitchOffset: zeroPitch && typeof sourceValue.pitch === 'number'
          ? -sourceValue.pitch
          : numberOrZero(currentOptions.pitchOffset),
        rollOffset: zeroRoll && typeof sourceValue.roll === 'number'
          ? -sourceValue.roll
          : numberOrZero(currentOptions.rollOffset),
        yawOffset: numberOrZero(currentOptions.yawOffset)
      };

      updateOffsets(nextOffsets, err => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(getState());
      });
    });
  };

  plugin.start = function (options, restart) {
    restartPlugin = restart;
    currentOptions = normalizeOptions(options || {});

    isRunning = true;
    resetSamplesForSourceChange();

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

    subscribeToAttitude();
  };

  function subscribeToAttitude () {
    const pitchOffset  = () => numberOrZero(currentOptions.pitchOffset);
    const rollOffset   = () => numberOrZero(currentOptions.rollOffset);
    const yawOffset    = () => numberOrZero(currentOptions.yawOffset);
    const sourceConfig = getSourceConfiguration(currentOptions);
    const sourceFilter = sourceConfig.sourceFilter;

    app.debug(`Starting — offsets: pitch=${pitchOffset()} roll=${rollOffset()} yaw=${yawOffset()} rad, sourceMode=${sourceConfig.mode}, source=${sourceFilter || '(all)'}, sourcePolicy=${sourceConfig.sourcePolicy}`);

    if (!sourceConfig.hasValidSourceFilter) {
      lastError = 'Specific source mode requires a non-empty source identifier';
      app.error(lastError);
    }

    if (sourceConfig.sourcePolicy === 'preferred') {
      subscribeToSourceDiscovery();
    } else {
      unsubscribeSourceDiscovery();
    }

    const subscription = {
      context: 'vessels.self',
      sourcePolicy: sourceConfig.sourcePolicy,
      subscribe: [{ path: 'navigation.attitude' }]
    };
    if (sourceConfig.sourcePolicy === 'preferred') {
      subscription.excludeSelf = true;
    }

    app.subscriptionmanager.subscribe(
      subscription,
      unsubscribes,
      err => app.error('Subscription error: ' + err),
      delta => {
        delta.updates.forEach(update => {
          rememberSource(update);

          // Ignore our own output to prevent feedback loop
          if (update.source && update.source.label === plugin.id) return;

          // Apply source filter if configured ($source matches what the Data Browser displays)
          if (!sourceConfig.hasValidSourceFilter) return;
          if (sourceFilter && update.$source !== sourceFilter) {
            lastIgnoredSource = update.$source || null;
            return;
          }

          update.values.forEach(item => {
            if (item.path === 'navigation.attitude' && item.value) {
              const src = item.value;
              const calibrated = {};

              if (typeof src.pitch === 'number') calibrated.pitch = src.pitch + pitchOffset();
              if (typeof src.roll  === 'number') calibrated.roll  = src.roll  + rollOffset();
              if (typeof src.yaw   === 'number') calibrated.yaw   = src.yaw   + yawOffset();

              if (Object.keys(calibrated).length === 0) return;

              lastSource = sourceFromUpdate(update);
              lastSourceSample = {
                source: lastSource,
                timestamp: update.timestamp || new Date().toISOString(),
                value: { ...src }
              };
              lastCalibratedSample = {
                source: plugin.id,
                timestamp: lastSourceSample.timestamp,
                value: { ...calibrated }
              };

              app.handleMessage(plugin.id, {
                updates: [{
                  source: { label: plugin.id },
                  timestamp: lastCalibratedSample.timestamp,
                  values: [{ path: 'navigation.attitude', value: calibrated }]
                }]
              });

              app.debug(`Calibrated: pitch=${calibrated.pitch} roll=${calibrated.roll} yaw=${calibrated.yaw}`);
            }
          });
        });
      }
    );
  }

  function subscribeToSourceDiscovery () {
    if (sourceDiscoveryUnsubscribes.length > 0) return;

    app.subscriptionmanager.subscribe(
      {
        context: 'vessels.self',
        sourcePolicy: 'all',
        subscribe: [{ path: 'navigation.attitude' }]
      },
      sourceDiscoveryUnsubscribes,
      err => app.error('Source discovery subscription error: ' + err),
      delta => {
        delta.updates.forEach(update => rememberSource(update));
      }
    );
  }

  plugin.stop = function () {
    unsubscribe();
    unsubscribeSourceDiscovery();
    isRunning = false;
    app.debug('Attitude Calibrator stopped');
  };

  return plugin;
};
