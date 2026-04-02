# Intensity Measure

## Overview

`Intensity_measure.js` measures one ROI through the current image stack and writes the result to an ImageJ Results table. It is intended for experiments where signal changes over time or through a stack and you want a repeatable measurement workflow without manually stepping through every plane.

Typical use cases:

- photobleaching and FRAP,
- calcium imaging,
- drug or stimulation response experiments,
- expression or reporter tracking through time,
- and general fluorescence quantification from a fixed ROI.

## What The Script Asks For

The script walks through three decisions before it calculates anything:

1. Choose a normalization method.
2. Choose how to define the background reference.
3. Choose how to define the target ROI.

After that, it measures every plane in the stack using the same ROI and reports the values.

## Normalization Methods

### `F/F0`

Formula:

```text
F/F0 = F(t) / F(t0)
```

Use this when you want every point expressed relative to the first frame. It is usually the safest default for photobleaching and FRAP-style measurements.

Interpretation:

- `1.0` means equal to the first frame,
- `0.5` means 50% of the first frame,
- `1.5` means 150% of the first frame.

### `dF/F0`

Formula:

```text
dF/F0 = (F(t) - F(t0)) / F(t0)
```

Use this when a zero baseline is more intuitive than a one baseline, especially in calcium imaging or stimulus-response experiments.

Interpretation:

- `0.0` means baseline,
- `1.0` means a 100% increase over baseline,
- `-0.5` means a 50% decrease from baseline.

### `Background subtraction only`

Formula:

```text
F_corrected = Raw_Mean - Background
```

Use this when you want an absolute, background-corrected signal but do not want any normalization to the first frame.

### `Percent of maximum`

Formula:

```text
Percent_Max = ((F - Fmin) / (Fmax - Fmin)) * 100
```

Use this when you want a convenient 0-100 range for display or for comparing traces from different experiments on the same scale.

### `Z-score normalization`

Formula:

```text
Z = (F - mean(F)) / std(F)
```

Use this when the question is statistical rather than biological magnitude, for example when comparing deviations from the average trace.

### `Raw values`

This leaves the mean ROI intensity unnormalized. It is useful when you want untouched measurements and will process them later in R, Python, MATLAB, or Excel.

## Background Selection

The script offers three background workflows.

### Click to select

Use the point tool to click a background pixel. The script reads that same `(x, y)` location from every frame.

Best when:

- you want a fast manual workflow,
- the image is stable,
- and you can see a clearly dark reference location.

### Type coordinates

Type exact `x` and `y` coordinates.

Best when:

- you want repeatability across multiple datasets,
- or you already know the preferred reference point.

### No background correction

Use this if your images are already background-corrected elsewhere or if you explicitly want raw ROI intensities.

## ROI Selection

The script supports several ways to define the target ROI:

- Rectangle
- Oval
- Freehand
- Polygon
- Brush
- Use existing ROI
- Type coordinates (Rectangle)
- Type coordinates (Oval)

All of these are measured in every plane of the current stack. The ROI does not move between frames, so the script is best suited to objects that stay inside the selected region. If your sample drifts, run `Align_Stack.js` first or re-open the data after alignment.

## Output Columns

The Results table can contain the following columns:

| Column | Meaning |
| --- | --- |
| `Slice` | 1-indexed plane number in the current stack |
| `Raw_Mean` | Mean intensity inside the ROI before correction |
| `Background` | Pixel value at the chosen background reference |
| `F_corrected` | `Raw_Mean - Background` |
| `F/F0`, `dF/F0`, `Percent_Max`, `Z_score`, or `Raw_Mean` | The method-specific normalized output |
| `CTCF` | Corrected Total Cell Fluorescence |

## CTCF In This Release

CTCF is calculated as:

```text
CTCF = (ROI_Area * ROI_Mean) - (ROI_Area * Background)
```

In this release, the ROI area comes from the actual measured ROI statistics rather than the bounding box. That matters for oval, freehand, polygon, and brush selections, because the bounding box can be much larger than the true ROI.

## Recommended Workflow

1. Open the stack in Fiji.
2. If the sample drifts, run `Align_Stack.js` first.
3. Run `Intensity_measure.js`.
4. Pick the normalization method that matches the question you are asking.
5. Define a background strategy.
6. Define the target ROI.
7. Review the Results table.
8. Save the results as CSV if needed.

## Practical Advice

- Pick a background point that stays dark for the whole sequence.
- Keep the ROI as consistent as possible across comparable experiments.
- Avoid using `F/F0` or `dF/F0` if the first frame is not a real baseline.
- If the object moves outside the ROI, the script will still measure the original location, not the object itself.
- For irregular biological shapes, use freehand, polygon, or brush rather than a loose rectangle.

## Troubleshooting

### `No image open`

Open an image before running the script.

### `Initial ROI intensity is <= background`

This means the first background-corrected frame is zero or negative, so `F/F0` and `dF/F0` are not defined. Try one of these:

- choose a darker background point,
- pick a brighter ROI,
- or switch to `Background subtraction only` or `Raw values`.

### `Coordinates out of image bounds`

Typed coordinates must stay within the current image width and height.

### Unexpected values

Check the following:

- the ROI actually contains the structure of interest,
- the background point is not inside a dim signal region,
- the first frame is a good baseline,
- and the sample did not drift substantially during the stack.

## Related Files

- Main script: [../Intensity_measure.js](../Intensity_measure.js)
- Long-form LaTeX documentation source: [../Intensity_measure_documentation.tex](../Intensity_measure_documentation.tex)
