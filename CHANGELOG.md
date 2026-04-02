# Changelog

All notable changes to this repository will be documented in this file.

## [1.0.0] - 2026-04-02

### Added

- Repo-level `README.md` covering all tools instead of only `Intensity_measure.js`.
- `Crop_Stack_Subsets.js`, a new crop helper for stacks and hyperstacks with ROI-tool and coordinate modes.
- `Radial_Line_Intensity.js`, a radial channel profiler that measures per-line and averaged radial intensities for the current Z/T position.
- Detailed markdown manuals in `docs/` for intensity measurement, stack alignment, and stack cropping.
- A dedicated markdown guide for radial line intensity profiling.
- `CITATION.cff` for software citation metadata.
- `.gitignore` for LaTeX build artifacts and common generated files.

### Changed

- `Intensity_measure.js` updated to version `2.1`.
- CTCF in `Intensity_measure.js` now uses the measured ROI area, which keeps oval and freehand selections accurate.
- `Intensity_measure.js` now exits cleanly if no image is open.
- `Align_Stack.js` now includes version, author, and license metadata in the script header.
- `Radial_Line_Intensity.js` now exports wide per-pixel line profiles with one column per line/channel pair and treats the sector end as exclusive.
