# signalk-attitude-calibrator

SignalK plugin that applies fixed offsets (in radians) to `navigation.attitude` pitch, roll and yaw values.

The calibrated values are republished on `navigation.attitude` with the plugin as source, so both the original and calibrated values coexist in SignalK with distinct sources.

A feedback loop guard prevents the plugin from processing its own output.

## Configuration

The full calibration workflow is available in **Apps → Attitude Calibrator**. The plugin configuration panel also displays the webapp path and remains available as a manual fallback.

| Option | Description | Default |
|--------|-------------|---------|
| Source mode | Choose between all sources, the preferred source only, or a specific source. | `All sources` |
| Specific source | Full source identifier as shown in the Data Browser. Only shown and used when Source mode is `Specific source`. | *(empty)* |
| Pitch offset (rad) | Value added to pitch. Positive = bow up. | `0` |
| Roll offset (rad) | Value added to roll. Positive = starboard down. | `0` |
| Yaw offset (rad) | Value added to yaw. | `0` |

## How it works

At each update received on `navigation.attitude`:

1. The source label is checked — updates from the plugin itself are ignored (anti-loop guard)
2. If Source mode is `Specific source`, the subscription listens to all sources and updates from other sources are skipped
3. The offsets are applied: `calibrated = source_value + offset`
4. The result is published on `navigation.attitude` with `source.label = signalk-attitude-calibrator`

Source mode controls the subscription:

- `All sources`: subscribe with `sourcePolicy: 'all'`
- `Preferred source only`: subscribe with `sourcePolicy: 'preferred'`
- `Specific source`: subscribe with `sourcePolicy: 'all'`, then filter updates by `$source`

## Units

All offsets are in **radians**. The plugin declares `units: rad` metadata for `navigation.attitude.pitch`, `.roll` and `.yaw` at startup.

## Typical use case

Chain with `signalk-attitude-converter` to expose calibrated individual paths:

1. **signalk-attitude-calibrator** — subscribes to `navigation.attitude` from your sensor source, applies offsets, republishes as `signalk-attitude-calibrator`
2. **signalk-attitude-converter** (mode `object-to-values`, source filter = `signalk-attitude-calibrator`) — splits the calibrated object into individual `pitch`, `roll`, `yaw` paths

## Calibration webapp

The plugin includes a small Signal K webapp. Open **Apps → Attitude Calibrator** to monitor:

- the raw `navigation.attitude` sample received by the plugin
- the configured pitch, roll and yaw offsets
- the calibrated `navigation.attitude` value published by the plugin
- the configured source mode and source currently used by the plugin

Values are shown in radians and degrees. When the vessel is in its reference attitude, use:

- **Zero pitch** to set `pitchOffset = -current pitch`
- **Zero roll** to set `rollOffset = -current roll`
- **Zero pitch + roll** to set both at the same time

The webapp writes the new offsets through the plugin API using Signal K plugin options, so changes are applied immediately and persisted for the next restart when the server supports `savePluginOptions`.

The webapp also lists observed `navigation.attitude` sources and can save the plugin source mode:

- **All sources**
- **Preferred source only**
- **Specific source**

When **Specific source** is selected, choose one of the observed sources instead of copying the `$source` string manually.

### Webapp API

The webapp uses these plugin routes:

- `GET /plugins/signalk-attitude-calibrator/api/state`
- `PUT /plugins/signalk-attitude-calibrator/api/source`
- `PUT /plugins/signalk-attitude-calibrator/api/offsets`
- `POST /plugins/signalk-attitude-calibrator/api/zero`

## Installation

```sh
npm install --prefix ~/.signalk signalk-attitude-calibrator
```

Restart SignalK after installation, then configure via **Server → Plugin Config → Attitude Calibrator**.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT — Jean-Laurent Girod
