/*
 * Crop Stack Subsets - ImageJ/Fiji Spatial Crop Helper
 * Version 1.0.0
 *
 * Author: Radmir Sarsenov
 * License: MIT License
 *
 * Creates a cropped duplicate of the current image, stack, or hyperstack.
 * Users can define the crop region with an interactive ROI tool or exact
 * coordinates, then choose whether to keep all stack positions and/or all
 * channels via two checkboxes.
 *
 * Notes:
 * - Unchecked stack positions: only the current Z/T position is kept.
 * - Unchecked channels: only the current channel is kept.
 * - Non-rectangular selections are cropped by their bounding box, matching
 *   ImageJ's duplicate/crop behavior.
 */

importPackage(Packages.ij);
importPackage(Packages.ij.gui);
importPackage(Packages.ij.plugin);

var imp = WindowManager.getCurrentImage();
if (imp == null) {
    IJ.error("No image open.");
    throw "exit";
}

var imgWidth = imp.getWidth();
var imgHeight = imp.getHeight();
var stackSize = imp.getStackSize();
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

var gd = new GenericDialog("Crop Stack Subsets");
gd.addChoice("Crop region source:", selectionMethods, selectionMethods[0]);
gd.addCheckbox("Include all slices/frames in stack", stackSize > 1);
gd.addCheckbox("Include all channels", nChannels > 1);
gd.addMessage(
    "Unchecked stack positions keep only the current Z/T position.\n" +
    "Unchecked channels keep only the current channel.\n" +
    "Non-rectangular selections crop their bounding box.\n" +
    "Current position: C" + currentChannel + "  Z" + currentSlice + "  T" + currentFrame
);
gd.showDialog();
if (gd.wasCanceled()) throw "exit";

var selectionMethod = gd.getNextChoice();
var includeAllStackPositions = gd.getNextBoolean();
var includeAllChannels = gd.getNextBoolean();

var cropRoi = getCropRoi(selectionMethod);
validateCropRoi(cropRoi);

imp.setRoi(cropRoi);

var c1 = includeAllChannels ? 1 : currentChannel;
var c2 = includeAllChannels ? nChannels : currentChannel;
var z1 = includeAllStackPositions ? 1 : currentSlice;
var z2 = includeAllStackPositions ? nSlices : currentSlice;
var t1 = includeAllStackPositions ? 1 : currentFrame;
var t2 = includeAllStackPositions ? nFrames : currentFrame;

var croppedImp = new Duplicator().run(imp, c1, c2, z1, z2, t1, t2);
if (croppedImp == null) {
    IJ.error("Cropping failed.");
    throw "exit";
}

croppedImp.setTitle(imp.getShortTitle() + "_crop");
croppedImp.show();
croppedImp.setPosition(1, 1, 1);

var bounds = cropRoi.getBounds();
IJ.log(
    "Created crop: " + croppedImp.getTitle() +
    " | ROI x=" + bounds.x + ", y=" + bounds.y +
    ", width=" + bounds.width + ", height=" + bounds.height +
    " | Channels " + c1 + "-" + c2 +
    " | Slices " + z1 + "-" + z2 +
    " | Frames " + t1 + "-" + t2
);

function getCropRoi(method) {
    if (method == "Rectangle selection") {
        return promptForAreaRoi("rectangle", "Draw a rectangular crop region, then click OK.");
    } else if (method == "Oval selection") {
        return promptForAreaRoi("oval", "Draw an oval crop region, then click OK.");
    } else if (method == "Freehand selection") {
        return promptForAreaRoi("freehand", "Draw a freehand crop region, then click OK.");
    } else if (method == "Polygon selection") {
        return promptForAreaRoi("polygon", "Draw a polygon crop region, then click OK.");
    } else if (method == "Brush selection") {
        return promptForAreaRoi("brush", "Paint a crop region with the brush tool, then click OK.");
    } else if (method == "Use existing ROI") {
        return imp.getRoi();
    } else if (method == "Type coordinates (Rectangle)") {
        return promptForCoordinateRoi("Rectangle Coordinates", false);
    } else if (method == "Type coordinates (Oval)") {
        return promptForCoordinateRoi("Oval Coordinates", true);
    }

    IJ.error("Unsupported crop method: " + method);
    throw "exit";
}

function promptForAreaRoi(toolName, instructions) {
    IJ.setTool(toolName);
    new WaitForUserDialog("Crop Region", instructions).show();
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
        IJ.error("Invalid crop coordinates. X/Y must be >= 0 and width/height must be > 0.");
        throw "exit";
    }
    if (x + width > imgWidth || y + height > imgHeight) {
        IJ.error("Crop region extends beyond the image bounds.");
        throw "exit";
    }

    return oval ? new OvalRoi(x, y, width, height) : new Roi(x, y, width, height);
}

function validateCropRoi(roi) {
    if (roi == null) {
        IJ.error("No ROI selected.");
        throw "exit";
    }
    if (!roi.isArea()) {
        IJ.error("The crop region must be an area ROI, not a point or line selection.");
        throw "exit";
    }

    var bounds = roi.getBounds();
    if (bounds.width <= 0 || bounds.height <= 0) {
        IJ.error("The crop region is empty.");
        throw "exit";
    }
    if (bounds.x >= imgWidth || bounds.y >= imgHeight || bounds.x + bounds.width <= 0 || bounds.y + bounds.height <= 0) {
        IJ.error("The crop region does not overlap the image.");
        throw "exit";
    }
}
