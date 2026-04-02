# Radial Line Intensity

## Overview

`Radial_Line_Intensity.js` measures per-pixel channel intensities along radial lines that start at the center of one area ROI and stop at the ROI boundary. It is designed for cases where you want to outline a cluster of cells, spheroid, colony, or other roughly central structure and then rebuild one plot per line with multiple channel traces.

The script works on:

- a single image,
- the current slice of a stack,
- or the current `Z/T` position of a hyperstack.

It always measures all channels at that same geometry, so channel comparisons stay spatially matched.

## What The Script Asks For

The dialog asks for:

1. how to define the ROI,
2. the angular increment in degrees,
3. the start angle,
4. the sector span in degrees,
5. optional channel labels,
6. and whether to draw the rays as an overlay.

After that, the script waits for the ROI if you chose an interactive selection mode.

## ROI Options

The cluster outline can come from:

- Rectangle selection
- Oval selection
- Freehand selection
- Polygon selection
- Brush selection
- Use existing ROI
- Type coordinates (Rectangle)
- Type coordinates (Oval)

The ROI must be an area ROI. Point and line selections are rejected.

## How The Center Is Defined

The script uses the geometric centroid of the ROI pixels, not the brightest pixel and not the center of mass of image intensity.

If the centroid falls outside an irregular ROI, the script snaps it to the nearest pixel that is still inside the ROI. That snapped pixel becomes the start of every measured line.

## Angle Convention

Angles follow a math-style convention in image coordinates:

- `0 deg` points to the right,
- `90 deg` points upward,
- `180 deg` points left,
- `270 deg` points downward.

The sector starts at `Start angle` and sweeps counterclockwise through `Sector span`.

Important detail:

- the sector end is exclusive.

So:

- `Start angle = 0`, `Sector span = 90`, `Increment = 2` gives `45` lines,
- not `46`.

Examples:

- `Start angle = 0`, `Sector span = 360` measures the full circle.
- `Start angle = -45`, `Sector span = 90` measures the upper-right quadrant.
- `Start angle = 180`, `Sector span = 180` measures the left half of the ROI.

## What Gets Measured

For each angle, the script:

1. starts at the ROI center,
2. walks outward until it reaches the ROI boundary,
3. samples every pixel that lies on that line inside the ROI,
4. reads the pixel intensity for every channel at each of those pixels,
5. and writes the result into a wide table.

Because the line stops at the ROI edge, different angles can have different line lengths.

## Output Tables

The script creates two Results tables.

### `*_Radial_Line_Metadata`

One row per line.

Columns include:

- `Line_Index`
- `Angle_deg`
- `Center_X`, `Center_Y`
- `End_X`, `End_Y`
- `Pixel_Count`
- `Euclidean_Length_px`
- channel mean columns such as `Green_Mean`, `Red_Mean` or `Ch1_Mean`, `Ch2_Mean`

Use this table to match each wide-table column group to its angle and line length.

### `*_Radial_Pixel_Profiles`

This is the main output table.

Columns include:

- `Pixel_Index`
- `Distance_From_Center_px`
- one column per line/channel pair, for example:
- `Line_1_Green`
- `Line_1_Red`
- `Line_2_Green`
- `Line_2_Red`
- final average columns across all valid lines, for example:
- `Average_lines(1-45)_Green`
- `Average_lines(1-45)_Red`

Each row is the next pixel step away from the center. If a line is shorter than the longest line, its remaining cells stay blank in lower rows.

The average columns use only the lines that still have a pixel value at that row, so short lines do not contribute blank values to deeper distances.

This is the table to export when you want to recreate one plot per line with multiple channel traces in Prism, R, Python, MATLAB, or Excel.

## Overlay Behavior

If `Draw radial overlay` is enabled, the script appends the measured rays to the current image overlay and adds the center point.

That overlay is visual only. It does not modify image pixels.

## Recommended Workflow

1. Open the image, stack, or hyperstack in Fiji.
2. Move to the `Z/T` position you want to analyze.
3. Run `Radial_Line_Intensity.js`.
4. Choose the ROI source and angle settings.
5. Draw or confirm the ROI around the cluster.
6. Review the metadata table and the wide per-pixel table.
7. Save the Results tables as CSV if needed.

## Practical Advice

- Freehand or brush ROIs usually work best for biological clusters with irregular edges.
- Keep the angular increment small enough to capture structure, but not so small that you create more lines than you need.
- If you only care about one part of the cluster, use a smaller sector instead of the full `360 deg`.
- Use the `Channel labels` field if you want columns like `Line_1_Green` and `Line_1_Red` instead of `Line_1_Ch1` and `Line_1_Ch2`.
- Very irregular or non-star-shaped ROIs can create some very short rays in certain directions. That is expected because the script stops at the first boundary it meets.

## Troubleshooting

### `No ROI selected`

You clicked OK before drawing the ROI, or chose `Use existing ROI` when no ROI was present.

### `The cluster ROI must be an area ROI`

Use a rectangle, oval, freehand, polygon, brush, or typed area ROI.

### `No valid radial lines were generated inside the selected ROI`

This usually means the ROI is extremely small or does not contain a usable interior center for the requested geometry.

### The overlay appears on more than one channel

The measurement is still performed only for the current `Z/T` position. The overlay is just a visual guide and can be cleared from the image overlay tools if needed.

## Related Files

- Main script: [../Radial_Line_Intensity.js](../Radial_Line_Intensity.js)
- Repository overview: [../README.md](../README.md)
