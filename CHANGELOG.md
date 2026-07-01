# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.7.1] - 2026-07-01

### Fixed
- Declare the Signal K app icon at the mounted webapp root and include the same icon at the package root so both the Webapps list and App Store metadata checks resolve it.

## [0.7.0] - 2026-06-30

### Added
- Add App Store screenshots for the plugin configuration panel and calibration webapp.

### Changed
- Preferred-source mode now subscribes with `excludeSelf: true` so Signal K servers that support it can keep this plugin out of the preferred-source cascade while calibrating `navigation.attitude`.
- Keep all-source subscriptions for `All sources` and `Specific source` modes so non-preferred attitude sources can still be calibrated.
- Refresh Signal K plugin CI and npm publish workflows.

### Fixed
- Package the declared Signal K app icon and screenshots so App Store metadata checks can find them in the npm tarball.

## [0.6.1] - 2026-05-19

### Fixed
- Republish the webapp release from the completed `main` branch.

## [0.6.0] - 2026-05-19

### Added
- Add a Signal K webapp for live attitude calibration and pitch/roll zeroing.
- Add plugin API routes for live state, offset updates and zero calibration.
- Add webapp source mode configuration with a selector populated from observed attitude sources.
- Point the Signal K plugin configuration panel to the richer calibration webapp.
- Add an attitude-instrument icon for the webapp using Signal K's `appIcon` metadata.

## [0.5.0] - 2026-05-19

### Changed
- Replace the separate no-source-filter mode and source filter fields with a single Source mode selector: all sources, preferred source only, or specific source.
- Show the specific source field only when Source mode is set to `Specific source`.
- Keep compatibility with existing `sourceFilter` and `noSourceFilterMode` configurations.

## [0.4.0] - 2026-05-18

### Added
- Add a no-source-filter source mode: calibrate all `navigation.attitude` sources, or only the Signal K preferred source.

### Changed
- When a source filter is configured, the plugin always subscribes with `sourcePolicy: 'all'` so the selected non-preferred source can still be received.

## [0.3.0] - 2026-05-06

### Added
- Subscribe with `sourcePolicy: 'all'` to receive deltas from non-priority sources — allows calibrating attitude data from any sensor even when another source holds priority on `navigation.attitude`. The plugin's own calibrated output remains a priority source.

## [0.2.1] - 2025-04-01

### Changed
- Minimum Node.js version declared: `>=18`
- Standardized npm publish workflow

## [0.2.0] - 2025-03-01

### Fixed
- Source filter now correctly matches the `$source` identifier as displayed in the Signal K Data Browser (e.g. `signalk-attitude-converter.0`)

## [0.1.1] - 2025-01-15

### Added
- Optional source filter to limit calibration to a specific source label
- Anti-loop guard to prevent processing the plugin's own output

### Changed
- Improved package description

## [0.1.0] - 2025-01-01

### Added
- Initial release: pitch/roll/yaw offset calibration in radians
