# signalk-attitude-calibrator

SignalK plugin that applies fixed offsets (in radians) to `navigation.attitude` pitch, roll and yaw values.

The calibrated values are republished on `navigation.attitude` with the plugin as source, so both the original and calibrated values coexist in SignalK with distinct sources.

## Configuration

| Option | Description | Default |
|--------|-------------|---------|
| Pitch offset (rad) | Value added to pitch. Positive = bow up. | `0` |
| Roll offset (rad) | Value added to roll. Positive = starboard down. | `0` |
| Yaw offset (rad) | Value added to yaw. | `0` |

## Installation

```sh
npm install --prefix ~/.signalk signalk-attitude-calibrator
```

Restart SignalK after installation, then configure via **Server → Plugin Config → Attitude Calibrator**.

## License

MIT — Jean-Laurent Girod
