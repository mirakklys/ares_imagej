# Crop Stack Subsets

## Overview

`Crop_Stack_Subsets.js` creates a cropped duplicate from the current image, stack, or hyperstack. It is designed for the common situation where you want the same spatial crop, but not always the same dimensional scope.

The script gives users two independent checkboxes:

- `Include all slices/frames in stack`
- `Include all channels`

That makes it possible to keep the crop spatially consistent while deciding how much of the dataset to keep.

## What The Two Checkboxes Mean

### `Include all slices/frames in stack`

If checked:

- the cropped output keeps every z-slice and every time frame from the current image.

If unchecked:

- the output keeps only the current z-slice and current time frame.

For ordinary stacks, that means:

- checked = crop the whole stack,
- unchecked = crop only the current plane.

### `Include all channels`

If checked:

- the cropped output keeps every channel.

If unchecked:

- the output keeps only the current channel.

## Practical Combinations

With the two checkboxes, the script covers four common workflows:

| All slices/frames | All channels | Result |
| --- | --- | --- |
| On | On | Crop the full dataset |
| On | Off | Crop only the current channel through the whole stack |
| Off | On | Crop all channels at the current stack position |
| Off | Off | Crop only the current plane |

## Crop Region Sources

The crop region can be defined in several ways:

- Rectangle selection
- Oval selection
- Freehand selection
- Polygon selection
- Brush selection
- Use existing ROI
- Type coordinates (Rectangle)
- Type coordinates (Oval)

For coordinate entry, the script asks for:

- `x`
- `y`
- `width`
- `height`

Coordinates are 0-indexed and must stay within the image bounds.

## Important Behavior For Non-Rectangular Selections

This script uses ImageJ's duplicate/crop behavior under the hood. That means:

- rectangle selections crop exactly as drawn,
- non-rectangular selections are converted to their bounding box for the final spatial crop.

So if you draw an oval or freehand ROI, the resulting image will still be rectangular, using the smallest rectangle that encloses the ROI.

That is usually what users want for downstream stack handling, because stack planes must all keep the same width and height.

## Output Behavior

The script creates a new image named with the original title plus `_crop`.

It does not delete or overwrite the source image.

It also logs a short summary to the ImageJ log window that includes:

- crop bounds,
- selected channel range,
- selected slice range,
- and selected frame range.

## Example Workflows

### Crop every channel and every frame

1. Open the hyperstack.
2. Run `Crop_Stack_Subsets.js`.
3. Draw a rectangle around the region of interest.
4. Leave both checkboxes on.
5. The result is a cropped duplicate of the entire dataset.

### Crop one channel through the whole movie

1. Navigate to the channel you want.
2. Run the script.
3. Define the crop region.
4. Leave `Include all slices/frames in stack` on.
5. Turn `Include all channels` off.
6. The result keeps the current channel only, across the whole stack.

### Crop only the current plane with exact coordinates

1. Navigate to the desired channel, z-slice, and time frame.
2. Run the script.
3. Choose `Type coordinates (Rectangle)` or `Type coordinates (Oval)`.
4. Turn both checkboxes off.
5. The result is a cropped single-plane image.

## Limits And Notes

- The script requires an area ROI. Point and line selections are rejected.
- The output width and height are fixed by the crop bounds, so mixed-size planes are not possible.
- Because the script creates a duplicate, it is safe to use repeatedly without destroying the original image.

## Troubleshooting

### `No ROI selected`

You clicked OK without drawing a crop ROI, or asked to use an existing ROI when none was present.

### `The crop region must be an area ROI`

Use a rectangle, oval, freehand, polygon, brush, or typed coordinates. Point and line tools are not valid crop regions.

### `Crop region extends beyond the image bounds`

Typed coordinates must stay inside the image. Check the current image size in `Image > Properties`.

### Output is rectangular even though I drew an oval

That is expected. The script crops to the bounding box of the ROI so the result remains a valid stack or hyperstack.

## Related Files

- Main script: [../Crop_Stack_Subsets.js](../Crop_Stack_Subsets.js)
