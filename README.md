# signalk-attitude-calibrator

SignalK plugin that applies fixed offsets (in radians) to `navigation.attitude` pitch, roll and yaw values.

The calibrated values are republished on `navigation.attitude` with the plugin as source, so both the original and calibrated values coexist in SignalK with distinct sources.

A feedback loop guard prevents the plugin from processing its own output.

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| Source filter | Only calibrate values from this source label. Leave empty to calibrate all sources. | *(all)* |
| Pitch offset (rad) | Value added to pitch. Positive = bow up. | `0` |
| Roll offset (rad) | Value added to roll. Positive = starboard down. | `0` |
| Yaw offset (rad) | Value added to yaw. | `0` |

## How it works

At each update received on `navigation.attitude`:

1. The source label is checked — updates from the plugin itself are ignored (anti-loop guard)
2. If a source filter is configured, updates from other sources are skipped
3. The offsets are applied: `calibrated = source_value + offset`
4. The result is published on `navigation.attitude` with `source.label = signalk-attitude-calibrator`

## Units

All offsets are in **radians**. The plugin declares `units: rad` metadata for `navigation.attitude.pitch`, `.roll` and `.yaw` at startup.

## Typical use case

Chain with `signalk-attitude-converter` to expose calibrated individual paths:

1. **signalk-attitude-calibrator** — subscribes to `navigation.attitude` from your sensor source, applies offsets, republishes as `signalk-attitude-calibrator`
2. **signalk-attitude-converter** (mode `object-to-values`, source filter = `signalk-attitude-calibrator`) — splits the calibrated object into individual `pitch`, `roll`, `yaw` paths

## Installation

```sh
npm install --prefix ~/.signalk signalk-attitude-calibrator
```

Restart SignalK after installation, then configure via **Server → Plugin Config → Attitude Calibrator**.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT — Jean-Laurent Girod
