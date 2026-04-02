# Stack Aligner

## Overview

`Align_Stack.js` is meant for microscopy stacks that shift during acquisition. Instead of realigning every plane manually, the script applies one translation to the affected planes or estimates shifts automatically from a bright feature.

It works with:

- ordinary stacks,
- z-stacks,
- time series,
- and hyperstacks with multiple channels and z-slices.

When the image is a hyperstack, the script shifts all channels and z-slices together for each affected frame so the dataset stays internally aligned.

## Core Idea

The script aligns along one logical axis:

- if the image has time frames, alignment is done across frames,
- otherwise alignment is done across slices.

That makes it especially useful for datasets where the sample bumped, drifted, or jumped halfway through a recording.

## Alignment Modes

### Hand-guided: point and click

Use this when you can visually recognize the same landmark before and after the jump.

Workflow:

1. The script shows the plane before the shift.
2. You click a recognizable feature with the point tool.
3. The script shows the shifted plane.
4. You click the same feature again.
5. The script calculates `dx` and `dy` from the two points and translates the chosen range.

Best for:

- a single obvious jump,
- samples with a clear landmark,
- or datasets where you want direct manual control.

### Hand-guided: enter X/Y shift

Use this when you already know the translation in pixels, perhaps from a previous measurement or from a repeated acquisition setup.

Best for:

- repeated corrections across similar datasets,
- exact known offsets,
- or batch-like manual workflows.

### Auto: fix single jump via center of mass

Use this when there is one bright stable feature around the jump point.

Workflow:

1. Draw a ROI around the feature in the plane before the jump.
2. The script measures the center of mass before and after the jump.
3. The difference between those centers becomes the translation.

Best for:

- one discontinuity,
- strong high-contrast reference structures,
- and cases where manual clicking is too subjective.

### Auto: align all positions continuously

Use this when the stack drifts continuously rather than jumping once.

Workflow:

1. Draw a ROI around a bright stationary feature in the first aligned position.
2. The script measures its center of mass in each subsequent position.
3. Every position is translated so that feature matches the first one.

Best for:

- gradual drift,
- long time series,
- or mild stage movement through the experiment.

## Dialog Options

### `Shift starts at frame/slice`

This defines where the correction begins for single-jump workflows. The script uses the current position as the default if it looks reasonable, which makes it easy to jump to the problem area first and then run the tool.

### `Propagate shift to all subsequent frames/slices`

If checked, the same translation is applied from the chosen start position through the rest of the alignment axis.

If unchecked, only the chosen position is corrected.

### `Use channel for alignment`

When multiple channels exist, one channel is used to calculate the alignment reference. The resulting shift is still applied to all channels.

Use the channel with the clearest stationary structure.

## What Happens To Hyperstacks

For time-series hyperstacks:

- the script computes one shift per frame,
- then applies that shift to every channel and every z-slice in that frame.

For z-stacks without time:

- the script aligns across z-slices,
- and each chosen z position is translated across all channels.

This behavior is important because it prevents channels from drifting apart after correction.

## Recommended Workflow

1. Open the image and navigate to the point where the shift becomes obvious.
2. Run `Align_Stack.js`.
3. Pick the simplest alignment mode that matches the problem.
4. For automatic modes, choose a bright, stable feature that stays in view.
5. Inspect several positions after alignment.
6. If the result looks good, save the corrected image under a new name.

## Limitations

- The script performs translation only. It does not correct rotation, scaling, shearing, or nonlinear warping.
- Automatic modes depend on a stable bright feature. If the feature changes shape or disappears, the estimated shift can be wrong.
- The script edits the current image in place, so save a copy first if you want to preserve the original exactly as opened.
- Very large shifts that move the reference object outside the selected ROI can confuse center-of-mass alignment.

## Troubleshooting

### `No image open`

Open an image or stack first.

### `This script requires an image stack`

The tool is designed for multi-plane data. A single 2D image does not need stack alignment.

### `You must use the Point tool to select a reference pixel`

This happens in the hand-guided point mode if the selected ROI is not a point ROI. Re-run that mode and use the point tool exactly as requested.

### Automatic alignment looks wrong

Try these fixes:

- choose a tighter ROI around one bright feature,
- switch to a different channel,
- or use the hand-guided point mode for the jump.

## Related Files

- Main script: [../Align_Stack.js](../Align_Stack.js)
