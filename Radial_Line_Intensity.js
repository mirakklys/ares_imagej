/*
 * Radial Line Intensity - ImageJ/Fiji Radial Pixel Profiler
 * Version 1.2.0
 *
 * Author: Radmir Sarsenov
 * License: MIT License
 *
 * Measures per-pixel intensities along radial lines from the center of one
 * area ROI to the ROI boundary on the current slice/frame. All channels are
 * sampled along the same lines so users can rebuild channel-distribution plots
 * for each line outside Fiji.
 *
 * Outputs:
 * - one metadata row per radial line,
 * - and one wide per-pixel table where rows are pixel steps from the center
 *   and columns are Line_X_ChannelLabel plus average-per-channel columns.
 */

importPackage(Packages.ij);
importPackage(Packages.ij.gui);
importPackage(Packages.ij.measure);
importClass(Packages.java.awt.Color);

var imp = WindowManager.getCurrentImage();
if (imp == null) {
    IJ.error("No image open.");
    throw "exit";
}

var imgWidth = imp.getWidth();
var imgHeight = imp.getHeight();
var stack = imp.getStack();
var nChannels = imp.getNChannels();
var nSlices = imp.getNSlices();
var nFrames = imp.getNFrames();
var currentChannel = (nChannels > 1) ? imp.getChannel() : 1;
var currentSlice = (nSlices > 1) ? imp.getSlice() : 1;
var currentFrame = (nFrames > 1) ? imp.getFrame() : 1;

var selectionMethods = [
    "Rectangle selection",
    "Oval selection",
    "Freehand selection",
    "Polygon selection",
    "Brush selection",
    "Use existing ROI",
    "Type coordinates (Rectangle)",
    "Type coordinates (Oval)"
];

var gd = new GenericDialog("Radial Line Intensity");
gd.addChoice("Cluster ROI source:", selectionMethods, selectionMethods[2]);
gd.addNumericField("Angle increment (deg):", 2, 2);
gd.addNumericField("Start angle (deg):", 0, 2);
gd.addNumericField("Sector span (deg):", 360, 2);
gd.addStringField("Channel labels:", getDefaultChannelLabelText(nChannels), 24);
gd.addCheckbox("Draw radial overlay", true);
gd.addMessage(
    "Per-pixel output: rows = pixel steps from the center, columns = line/channel pairs.\n" +
    "Sector end is exclusive, so 0-90 with 2 deg gives 45 lines.\n" +
    "Current position: C" + currentChannel + "  Z" + currentSlice + "  T" + currentFrame
);
gd.showDialog();
if (gd.wasCanceled()) throw "exit";

var selectionMethod = gd.getNextChoice();
var angleIncrement = gd.getNextNumber();
var startAngle = gd.getNextNumber();
var sectorSpan = gd.getNextNumber();
var channelLabels = parseChannelLabels(gd.getNextString(), nChannels);
var drawOverlay = gd.getNextBoolean();

validateSettings(angleIncrement, sectorSpan);

var measurementRoi = getMeasurementRoi(selectionMethod);
validateMeasurementRoi(measurementRoi);
imp.setRoi(measurementRoi);

var center = getRoiCenterPixel(measurementRoi);
var angles = buildAngles(startAngle, sectorSpan, angleIncrement);
if (angles.length === 0) {
    IJ.error("No radial angles were generated. Check the increment and sector settings.");
    throw "exit";
}

var lineData = [];
var overlayEndpoints = [];
var skippedAngles = 0;
var maxPixelCount = 0;

for (var i = 0; i < angles.length; i++) {
    var angle = angles[i];
    var pixelPath = traceLinePixelsInsideRoi(measurementRoi, center.x, center.y, angle);
    if (pixelPath.length === 0) {
        skippedAngles++;
        continue;
    }

    var endpoint = pixelPath[pixelPath.length - 1];
    var lineEntry = {
        index: lineData.length + 1,
        angle: normalizeAngle(angle),
        endX: endpoint.x,
        endY: endpoint.y,
        pixelPath: pixelPath,
        euclideanLength: distance(center.x + 0.5, center.y + 0.5, endpoint.x + 0.5, endpoint.y + 0.5),
        channelSamples: []
    };

    for (var channel = 1; channel <= nChannels; channel++) {
        var ip = getProcessorForPosition(channel, currentSlice, currentFrame);
        lineEntry.channelSamples.push(samplePixelPath(ip, pixelPath));
    }

    lineData.push(lineEntry);
    overlayEndpoints.push({x: endpoint.x + 0.5, y: endpoint.y + 0.5});
    if (pixelPath.length > maxPixelCount) {
        maxPixelCount = pixelPath.length;
    }
}

if (lineData.length === 0) {
    IJ.error("No valid radial lines were generated inside the selected ROI.");
    throw "exit";
}

var metadataRt = new ResultsTable();
for (var lineIdx = 0; lineIdx < lineData.length; lineIdx++) {
    var line = lineData[lineIdx];
    metadataRt.incrementCounter();
    metadataRt.addValue("Line_Index", line.index);
    metadataRt.addValue("Angle_deg", line.angle);
    metadataRt.addValue("Center_X", center.x);
    metadataRt.addValue("Center_Y", center.y);
    metadataRt.addValue("End_X", line.endX);
    metadataRt.addValue("End_Y", line.endY);
    metadataRt.addValue("Pixel_Count", line.pixelPath.length);
    metadataRt.addValue("Euclidean_Length_px", line.euclideanLength);

    for (var channel = 1; channel <= nChannels; channel++) {
        metadataRt.addValue(channelLabels[channel - 1] + "_Mean", meanOfArray(line.channelSamples[channel - 1]));
    }
}

var pixelRt = new ResultsTable();
for (var row = 0; row < maxPixelCount; row++) {
    pixelRt.incrementCounter();
    pixelRt.addValue("Pixel_Index", row + 1);
    pixelRt.addValue("Distance_From_Center_px", row);
}

for (var lineNumber = 0; lineNumber < lineData.length; lineNumber++) {
    var currentLine = lineData[lineNumber];

    for (var ch = 1; ch <= nChannels; ch++) {
        var columnName = buildLineChannelColumnName(currentLine.index, channelLabels[ch - 1]);
        var values = currentLine.channelSamples[ch - 1];

        for (var sampleIndex = 0; sampleIndex < values.length; sampleIndex++) {
            pixelRt.setValue(columnName, sampleIndex, values[sampleIndex]);
        }
    }
}

var firstLineIndex = lineData[0].index;
var lastLineIndex = lineData[lineData.length - 1].index;
for (var avgChannel = 1; avgChannel <= nChannels; avgChannel++) {
    var averageColumnName = buildAverageColumnName(firstLineIndex, lastLineIndex, channelLabels[avgChannel - 1]);

    for (var avgRow = 0; avgRow < maxPixelCount; avgRow++) {
        var sum = 0;
        var count = 0;

        for (var avgLine = 0; avgLine < lineData.length; avgLine++) {
            var avgValues = lineData[avgLine].channelSamples[avgChannel - 1];
            if (avgRow < avgValues.length) {
                sum += avgValues[avgRow];
                count++;
            }
        }

        if (count > 0) {
            pixelRt.setValue(averageColumnName, avgRow, sum / count);
        }
    }
}

metadataRt.show(imp.getShortTitle() + "_Radial_Line_Metadata");
pixelRt.show(imp.getShortTitle() + "_Radial_Pixel_Profiles");

if (drawOverlay) {
    appendRadialOverlay(imp, center, overlayEndpoints);
}

imp.setRoi(measurementRoi);
imp.updateAndDraw();

IJ.log(
    "Radial Line Intensity: " + imp.getTitle() +
    " | Channels 1-" + nChannels +
    " | Current position C" + currentChannel + " Z" + currentSlice + " T" + currentFrame +
    " | Center pixel (" + center.x + ", " + center.y + ")" +
    " | Lines " + lineData.length +
    " | Skipped " + skippedAngles +
    " | Increment " + angleIncrement + " deg" +
    " | Sector " + sectorSpan + " deg" +
    " | Max pixels per line " + maxPixelCount
);

function validateSettings(angleIncrement, sectorSpan) {
    if (isNaN(angleIncrement) || angleIncrement <= 0) {
        IJ.error("Angle increment must be greater than 0.");
        throw "exit";
    }
    if (isNaN(sectorSpan) || sectorSpan <= 0 || sectorSpan > 360) {
        IJ.error("Sector span must be greater than 0 and at most 360 degrees.");
        throw "exit";
    }
}

function getMeasurementRoi(method) {
    if (method == "Rectangle selection") {
        return promptForAreaRoi("rectangle", "Draw a rectangle around the cluster, then click OK.");
    } else if (method == "Oval selection") {
        return promptForAreaRoi("oval", "Draw an oval around the cluster, then click OK.");
    } else if (method == "Freehand selection") {
        return promptForAreaRoi("freehand", "Circle the cluster of cells with a freehand ROI, then click OK.");
    } else if (method == "Polygon selection") {
        return promptForAreaRoi("polygon", "Draw a polygon around the cluster, then click OK.");
    } else if (method == "Brush selection") {
        return promptForAreaRoi("brush", "Paint the cluster area with the brush tool, then click OK.");
    } else if (method == "Use existing ROI") {
        return imp.getRoi();
    } else if (method == "Type coordinates (Rectangle)") {
        return promptForCoordinateRoi("Rectangle Coordinates", false);
    } else if (method == "Type coordinates (Oval)") {
        return promptForCoordinateRoi("Oval Coordinates", true);
    }

    IJ.error("Unsupported ROI method: " + method);
    throw "exit";
}

function promptForAreaRoi(toolName, instructions) {
    IJ.setTool(toolName);
    new WaitForUserDialog("Cluster ROI", instructions).show();
    return imp.getRoi();
}

function promptForCoordinateRoi(title, oval) {
    var gdCoords = new GenericDialog(title);
    gdCoords.addNumericField("X (top-left):", 0, 0);
    gdCoords.addNumericField("Y (top-left):", 0, 0);
    gdCoords.addNumericField("Width:", 100, 0);
    gdCoords.addNumericField("Height:", 100, 0);
    gdCoords.addMessage("Coordinates are 0-indexed and must stay inside the image.");
    gdCoords.showDialog();
    if (gdCoords.wasCanceled()) throw "exit";

    var x = Math.round(gdCoords.getNextNumber());
    var y = Math.round(gdCoords.getNextNumber());
    var width = Math.round(gdCoords.getNextNumber());
    var height = Math.round(gdCoords.getNextNumber());

    if (x < 0 || y < 0 || width <= 0 || height <= 0) {
        IJ.error("Invalid ROI coordinates. X/Y must be >= 0 and width/height must be > 0.");
        throw "exit";
    }
    if (x + width > imgWidth || y + height > imgHeight) {
        IJ.error("ROI extends beyond the image bounds.");
        throw "exit";
    }

    return oval ? new OvalRoi(x, y, width, height) : new Roi(x, y, width, height);
}

function validateMeasurementRoi(roi) {
    if (roi == null) {
        IJ.error("No ROI selected.");
        throw "exit";
    }
    if (!roi.isArea()) {
        IJ.error("The cluster ROI must be an area ROI, not a point or line selection.");
        throw "exit";
    }

    var bounds = roi.getBounds();
    if (bounds.width <= 0 || bounds.height <= 0) {
        IJ.error("The ROI is empty.");
        throw "exit";
    }
    if (bounds.x >= imgWidth || bounds.y >= imgHeight || bounds.x + bounds.width <= 0 || bounds.y + bounds.height <= 0) {
        IJ.error("The ROI does not overlap the image.");
        throw "exit";
    }
}

function getRoiCenterPixel(roi) {
    var bounds = roi.getBounds();
    var xStart = Math.max(0, bounds.x);
    var yStart = Math.max(0, bounds.y);
    var xEnd = Math.min(imgWidth - 1, bounds.x + bounds.width - 1);
    var yEnd = Math.min(imgHeight - 1, bounds.y + bounds.height - 1);

    var sumX = 0;
    var sumY = 0;
    var count = 0;

    for (var y = yStart; y <= yEnd; y++) {
        for (var x = xStart; x <= xEnd; x++) {
            if (roi.contains(x, y)) {
                sumX += x + 0.5;
                sumY += y + 0.5;
                count++;
            }
        }
    }

    if (count === 0) {
        IJ.error("The ROI does not contain any pixels.");
        throw "exit";
    }

    return snapPointInsideRoi(roi, sumX / count, sumY / count);
}

function snapPointInsideRoi(roi, xTarget, yTarget) {
    var bounds = roi.getBounds();
    var xStart = Math.max(0, bounds.x);
    var yStart = Math.max(0, bounds.y);
    var xEnd = Math.min(imgWidth - 1, bounds.x + bounds.width - 1);
    var yEnd = Math.min(imgHeight - 1, bounds.y + bounds.height - 1);

    var bestX = -1;
    var bestY = -1;
    var bestDistanceSq = Number.POSITIVE_INFINITY;

    for (var y = yStart; y <= yEnd; y++) {
        for (var x = xStart; x <= xEnd; x++) {
            if (!roi.contains(x, y)) continue;

            var distanceSq = squaredDistance(x + 0.5, y + 0.5, xTarget, yTarget);
            if (distanceSq < bestDistanceSq) {
                bestDistanceSq = distanceSq;
                bestX = x;
                bestY = y;
            }
        }
    }

    if (bestDistanceSq === Number.POSITIVE_INFINITY) {
        IJ.error("Unable to place the ROI center inside the selected area.");
        throw "exit";
    }

    return {x: bestX, y: bestY};
}

function buildAngles(startAngle, sectorSpan, increment) {
    var angles = [];
    var epsilon = 1e-9;

    for (var offset = 0; offset < sectorSpan - epsilon; offset += increment) {
        angles.push(startAngle + offset);
    }

    if (angles.length === 0) {
        angles.push(startAngle);
    }

    return angles;
}

function traceLinePixelsInsideRoi(roi, centerX, centerY, angleDeg) {
    var radians = angleDeg * Math.PI / 180.0;
    var maxDistance = Math.sqrt(imgWidth * imgWidth + imgHeight * imgHeight) + 2;
    var targetX = Math.round(centerX + Math.cos(radians) * maxDistance);
    var targetY = Math.round(centerY - Math.sin(radians) * maxDistance);
    var fullLine = rasterizeLine(centerX, centerY, targetX, targetY);
    var insidePixels = [];

    for (var i = 0; i < fullLine.length; i++) {
        var point = fullLine[i];
        if (pointInsideRoiPixel(roi, point.x, point.y)) {
            insidePixels.push(point);
        } else if (insidePixels.length > 0) {
            break;
        }
    }

    return insidePixels;
}

function rasterizeLine(x0, y0, x1, y1) {
    var points = [];
    var dx = Math.abs(x1 - x0);
    var dy = Math.abs(y1 - y0);
    var sx = (x0 < x1) ? 1 : -1;
    var sy = (y0 < y1) ? 1 : -1;
    var err = dx - dy;
    var x = x0;
    var y = y0;

    while (true) {
        points.push({x: x, y: y});
        if (x === x1 && y === y1) {
            break;
        }

        var e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            y += sy;
        }
    }

    return points;
}

function pointInsideRoiPixel(roi, x, y) {
    if (x < 0 || y < 0 || x >= imgWidth || y >= imgHeight) {
        return false;
    }
    return roi.contains(x, y);
}

function getProcessorForPosition(channel, z, t) {
    var stackIndex = imp.getStackIndex(channel, z, t);
    return stack.getProcessor(stackIndex);
}

function samplePixelPath(ip, pixelPath) {
    var samples = [];
    for (var i = 0; i < pixelPath.length; i++) {
        samples.push(ip.getPixelValue(pixelPath[i].x, pixelPath[i].y));
    }
    return samples;
}

function appendRadialOverlay(imp, center, endpoints) {
    var overlay = imp.getOverlay();
    if (overlay == null) {
        overlay = new Overlay();
    }

    for (var i = 0; i < endpoints.length; i++) {
        var endpoint = endpoints[i];
        var line = new Line(center.x + 0.5, center.y + 0.5, endpoint.x, endpoint.y);
        line.setStrokeColor(Color.cyan);
        overlay.add(line);
    }

    var centerPoint = new PointRoi(center.x, center.y);
    centerPoint.setStrokeColor(Color.red);
    overlay.add(centerPoint);
    imp.setOverlay(overlay);
}

function getDefaultChannelLabelText(channelCount) {
    var labels = [];
    for (var i = 1; i <= channelCount; i++) {
        labels.push("Ch" + i);
    }
    return labels.join(", ");
}

function parseChannelLabels(text, channelCount) {
    var fallback = [];
    for (var i = 1; i <= channelCount; i++) {
        fallback.push("Ch" + i);
    }

    if (text == null) {
        return fallback;
    }

    var parts = text.split(",");
    var labels = [];
    for (var j = 0; j < parts.length; j++) {
        var label = parts[j].replace(/^\s+|\s+$/g, "");
        if (label.length > 0) {
            labels.push(sanitizeLabel(label));
        }
    }

    if (labels.length !== channelCount) {
        IJ.log("Channel labels did not match channel count. Using default labels Ch1..Ch" + channelCount + ".");
        return fallback;
    }

    return labels;
}

function sanitizeLabel(label) {
    return label.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "");
}

function buildLineChannelColumnName(lineIndex, channelLabel) {
    return "Line_" + lineIndex + "_" + channelLabel;
}

function buildAverageColumnName(firstLineIndex, lastLineIndex, channelLabel) {
    return "Average_lines(" + firstLineIndex + "-" + lastLineIndex + ")_" + channelLabel;
}

function meanOfArray(values) {
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
        sum += values[i];
    }
    return sum / values.length;
}

function normalizeAngle(angle) {
    var normalized = angle % 360;
    if (normalized < 0) {
        normalized += 360;
    }
    return normalized;
}

function distance(x1, y1, x2, y2) {
    return Math.sqrt(squaredDistance(x1, y1, x2, y2));
}

function squaredDistance(x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    return dx * dx + dy * dy;
}
