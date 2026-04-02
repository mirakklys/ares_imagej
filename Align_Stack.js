/*
 * Stack Aligner - ImageJ ROI Alignment Script
 * Version 1.0.0
 *
 * Author: Radmir Sarsenov
 * License: MIT License
 *
 * A script for fixing position shifts in image stacks.
 * Features both manual (hand-guided) and automated (center-of-mass) alignment.
 * Perfect for time-lapse stacks that shifted halfway through an experiment.
 * Supports hyperstacks (multiple channels/Z-slices) - aligns all C/Z together per frame.
 */

importPackage(Packages.ij);
importPackage(Packages.ij.gui);
importPackage(Packages.ij.measure);
importPackage(Packages.ij.process);

var imp = IJ.getImage();
if (imp == null) {
    IJ.error("No image open.");
    throw "exit";
}
if (imp.getStackSize() < 2) {
    IJ.error("This script requires an image stack (multiple slices).");
    throw "exit";
}

// Get hyperstack dimensions
var nChannels = imp.getNChannels();
var nSlices = imp.getNSlices();
var nFrames = imp.getNFrames();
var isHyperstack = imp.isHyperStack() || (nChannels > 1 || nSlices > 1 || nFrames > 1);

// For alignment, we work along the "time" axis (frames)
// If no time dimension, we use Z-slices as the alignment axis
var alignAxis = (nFrames > 1) ? "frame" : "slice";
var alignDim = (nFrames > 1) ? nFrames : nSlices;

// Get current position as default (where user navigated to = likely where shift is)
var currentPos = (nFrames > 1) ? imp.getFrame() : imp.getSlice();
var defaultShiftPos = (currentPos >= 2 && currentPos <= alignDim) ? currentPos : Math.floor(alignDim / 2) + 1;

if (isHyperstack) {
    IJ.log("Hyperstack detected: " + nChannels + " channels, " + nSlices + " Z-slices, " + nFrames + " frames");
    IJ.log("Aligning along " + alignAxis + " axis (" + alignDim + " positions)");
}

// ============================================
// 1. Method Selection
// ============================================
var methods = [
    "Hand-guided (Point-and-click to fix a jump)",
    "Hand-guided (Enter X/Y shift manually)",
    "Auto (Fix single jump via Center of Mass)",
    "Auto (Align ALL positions continuously)"
];

var gd = new GenericDialog("Stack Alignment");
gd.addChoice("Alignment Method:", methods, methods[0]);
gd.addSlider("Shift starts at " + alignAxis + ":", 2, alignDim, defaultShiftPos);
gd.addCheckbox("Propagate shift to all subsequent " + alignAxis + "s", true);
if (isHyperstack && nChannels > 1) {
    gd.addNumericField("Use channel for alignment:", 1, 0);
}
gd.addMessage("Tip: Navigate to the " + alignAxis + " where the shift occurred before running this script.\n" +
              "The current " + alignAxis + " (" + currentPos + ") is used as the default." +
              (isHyperstack ? "\nHyperstack: All channels/Z-slices will be shifted together." : ""));
gd.showDialog();

if (gd.wasCanceled()) throw "exit";

var method = gd.getNextChoice();
var startPos = Math.round(gd.getNextNumber());
var propagateToAll = gd.getNextBoolean();
var alignChannel = (isHyperstack && nChannels > 1) ? Math.round(gd.getNextNumber()) : 1;

// Calculate end position based on propagation checkbox
var endPos = propagateToAll ? alignDim : startPos;

if (alignChannel < 1 || alignChannel > nChannels) alignChannel = 1;
if (startPos < 2 || startPos > alignDim) {
    startPos = 2; // Prevent out-of-bounds errors
    endPos = propagateToAll ? alignDim : startPos;
}

// ============================================
// 2. Execute Method
// ============================================
if (method == "Hand-guided (Point-and-click to fix a jump)") {
    
    // Navigate to slice BEFORE the shift
    setPosition(imp, alignChannel, 1, startPos - 1);
    imp.updateAndDraw();
    IJ.setTool("point");
    new WaitForUserDialog("Reference Point", "Now at " + alignAxis + " " + (startPos - 1) + " (BEFORE the shift).\nClick a distinct feature, then click OK.").show();
    var roi1 = imp.getRoi();
    if (roi1 == null || roi1.getType() != Roi.POINT) {
        IJ.error("You must use the Point tool to select a reference pixel."); throw "exit";
    }
    var p1 = roi1.getContainedPoints()[0];
    
    // Navigate to slice AFTER the shift
    setPosition(imp, alignChannel, 1, startPos);
    imp.updateAndDraw();
    new WaitForUserDialog("Shifted Point", "Now at " + alignAxis + " " + startPos + " (AFTER the shift).\nClick the EXACT SAME feature, then click OK.").show();
    var roi2 = imp.getRoi();
    if (roi2 == null || roi2.getType() != Roi.POINT) {
        IJ.error("You must use the Point tool to select the shifted pixel."); throw "exit";
    }
    var p2 = roi2.getContainedPoints()[0];
    
    // Calculate delta and apply
    var dx = p1.x - p2.x;
    var dy = p1.y - p2.y;
    
    applyTranslationHyperstack(imp, startPos, endPos, dx, dy);
    
} else if (method == "Hand-guided (Enter X/Y shift manually)") {
    
    var gd2 = new GenericDialog("Manual Shift");
    gd2.addNumericField("X shift (pixels):", 0, 0);
    gd2.addNumericField("Y shift (pixels):", 0, 0);
    gd2.showDialog();
    if (gd2.wasCanceled()) throw "exit";
    
    var dx = gd2.getNextNumber();
    var dy = gd2.getNextNumber();
    
    applyTranslationHyperstack(imp, startPos, endPos, dx, dy);
    
} else if (method == "Auto (Fix single jump via Center of Mass)") {
    
    // Navigate to slice BEFORE the shift
    setPosition(imp, alignChannel, 1, startPos - 1);
    imp.updateAndDraw();
    IJ.setTool("rectangle");
    new WaitForUserDialog("Select Region", "Now at " + alignAxis + " " + (startPos-1) + " (BEFORE the shift).\nDraw a ROI around a bright feature that spans both " + alignAxis + "s.\nMake sure the ROI contains the feature in BOTH positions.\nClick OK when done.").show();
    var roi = imp.getRoi();
    if (roi == null) { IJ.error("No ROI selected."); throw "exit"; }
    
    // Measure Center of Mass right before the shift
    setPosition(imp, alignChannel, 1, startPos - 1);
    imp.setRoi(roi);
    var stats1 = imp.getStatistics(Measurements.CENTER_OF_MASS);
    
    // Measure Center of Mass at the start of the shift
    setPosition(imp, alignChannel, 1, startPos);
    imp.setRoi(roi);
    var stats2 = imp.getStatistics(Measurements.CENTER_OF_MASS);
    
    var dx = stats1.xCenterOfMass - stats2.xCenterOfMass;
    var dy = stats1.yCenterOfMass - stats2.yCenterOfMass;
    
    applyTranslationHyperstack(imp, startPos, endPos, dx, dy);
    
} else if (method == "Auto (Align ALL positions continuously)") {
    
    setPosition(imp, alignChannel, 1, 1);
    IJ.setTool("rectangle");
    new WaitForUserDialog("Select Region", "Draw a ROI around a bright, stationary feature.\nClick OK when done.").show();
    var roi = imp.getRoi();
    if (roi == null) { IJ.error("No ROI selected."); throw "exit"; }
    var bounds = roi.getBounds();
    
    imp.setRoi(roi);
    var statsRef = imp.getStatistics(Measurements.CENTER_OF_MASS);
    var refX = statsRef.xCenterOfMass;
    var refY = statsRef.yCenterOfMass;
    
    IJ.showStatus("Aligning stack...");
    for (var i = 2; i <= alignDim; i++) {
        IJ.showProgress(i, alignDim);
        setPosition(imp, alignChannel, 1, i);
        
        // We assume the selected feature hasn't left the original ROI bounds
        imp.setRoi(roi);
        
        var stats = imp.getStatistics(Measurements.CENTER_OF_MASS);
        var dx = refX - stats.xCenterOfMass;
        var dy = refY - stats.yCenterOfMass;
        
        applyTranslationHyperstack(imp, i, i, dx, dy); // Shift position by position
    }
    IJ.log("Aligned all " + alignAxis + "s to " + alignAxis + " 1.");
}

// Helper function to set position in hyperstack or regular stack
function setPosition(imp, c, z, t) {
    if (nFrames > 1) {
        // Time series - t is the alignment axis
        imp.setPosition(c, z, t);
    } else if (nSlices > 1) {
        // Z-stack only - z is the alignment axis, t parameter is actually z position
        imp.setPosition(c, t, 1);
    } else {
        // Simple stack or single channel
        imp.setSlice(t);
    }
}

// Apply translation to hyperstack (shifts all channels and Z-slices for given frame range)
function applyTranslationHyperstack(imp, startPos, endPos, dx, dy) {
    var stack = imp.getStack();
    
    for (var pos = startPos; pos <= endPos; pos++) {
        for (var c = 1; c <= nChannels; c++) {
            if (nFrames > 1) {
                // Time series - pos is frame, shift all Z-slices
                for (var z = 1; z <= nSlices; z++) {
                    var idx = imp.getStackIndex(c, z, pos);
                    var ip = stack.getProcessor(idx);
                    ip.setInterpolationMethod(ImageProcessor.BILINEAR);
                    ip.setBackgroundValue(0);
                    ip.translate(dx, dy);
                }
            } else {
                // Z-stack - pos is Z-slice
                var idx = imp.getStackIndex(c, pos, 1);
                var ip = stack.getProcessor(idx);
                ip.setInterpolationMethod(ImageProcessor.BILINEAR);
                ip.setBackgroundValue(0);
                ip.translate(dx, dy);
            }
        }
    }
    
    imp.deleteRoi();
    setPosition(imp, 1, 1, startPos);
    imp.updateAndDraw();
    if (startPos != endPos) {
        IJ.log("Applied shift: X = " + dx.toFixed(2) + ", Y = " + dy.toFixed(2) + " from " + alignAxis + " " + startPos + " to " + endPos);
    } else {
        IJ.log("Applied shift: X = " + dx.toFixed(2) + ", Y = " + dy.toFixed(2) + " at " + alignAxis + " " + startPos);
    }
}
