/*
 * Intensity Measure - ImageJ ROI Intensity Analysis Script
 * Version 2.1
 *
 * Author: Radmir Sarsenov
 * License: MIT License
 *
 * A script for measuring fluorescence intensity across image stacks
 * with multiple normalization methods.
 *
 * ============================================================================
 * NORMALIZATION METHODS:
 * ============================================================================
 * 
 * 1. F/F0 (Normalize to first frame)
 *    Formula: F/F0 = F(t) / F(t0)
 *    - Output starts at 1.0 and changes relative to initial
 *    - Standard for: Photobleaching, FRAP, general time-lapse
 *    - Interpretation: 0.5 = 50% of initial intensity
 *
 * 2. dF/F0 (Fold change from baseline)
 *    Formula: dF/F0 = (F(t) - F(t0)) / F(t0)
 *    - Output starts at 0.0 (baseline)
 *    - Standard for: Calcium imaging, stimulus-response experiments
 *    - Interpretation: 1.0 = 100% increase (doubled), -0.5 = 50% decrease
 *
 * 3. Background subtraction only
 *    Formula: F_corrected = F(t) - F_background(t)
 *    - Returns absolute intensity values (background-corrected)
 *    - Good for: Comparing intensities within same experiment
 *
 * 4. Percent of maximum
 *    Formula: % = ((F - F_min) / (F_max - F_min)) × 100
 *    - Scales data to 0-100% range
 *    - Good for: Normalizing across different experiments
 *
 * 5. Z-score normalization
 *    Formula: Z = (F - μ) / σ
 *    - Mean becomes 0, standard deviation becomes 1
 *    - Good for: Statistical comparisons, outlier detection
 *
 * 6. Raw values (no normalization)
 *    - Returns original mean intensity values
 *    - Use when: You need unprocessed data
 *
 * ============================================================================
 * ROI SELECTION TOOLS:
 * ============================================================================
 *
 * - Rectangle: Draw a rectangular selection (best for regular shapes)
 * - Oval: Draw an elliptical selection (good for cells, nuclei)
 * - Freehand: Draw a freeform closed shape (for irregular structures)
 * - Polygon: Click vertices to create a polygon (precise boundaries)
 * - Brush: Paint the selection (for complex/fragmented regions)
 * - Use existing ROI: Use a previously drawn ROI on the image
 * - Type coordinates: Enter exact X, Y, Width, Height values
 *
 * ============================================================================
 * OUTPUT COLUMNS:
 * ============================================================================
 *
 * - Slice: Frame number (1-indexed)
 * - Raw_Mean: Uncorrected mean intensity within ROI (original pixel values)
 * - Background: Background value at reference point for this frame
 *               (only shown if background correction is used)
 * - F_corrected: Background-subtracted mean intensity = Raw_Mean - Background
 *                (only shown if background correction is used)
 * - [Normalized]: The normalized value - column name depends on method:
 *                 F/F0, dF/F0, Percent_Max, Z_score, F_corrected, or Raw_Mean
 * - CTCF: Corrected Total Cell Fluorescence
 *         Formula: (ROI_Area × ROI_Mean) - (ROI_Area × Background)
 *         Use for: Comparing absolute fluorescence across different-sized ROIs
 *
 * ============================================================================
 */

importPackage(Packages.ij);
importPackage(Packages.ij.gui);
importPackage(Packages.ij.measure);

var imp = WindowManager.getCurrentImage();
if (imp == null) {
    IJ.error("No image open.");
    throw "exit";
}
var stackSize = imp.getStackSize();
var imgWidth = imp.getWidth();
var imgHeight = imp.getHeight();

// ============================================
// 1. Normalization Method Selection
// ============================================
var normMethods = [
    "F/F0 (Normalize to first frame)",
    "dF/F0 (Fold change from baseline)",
    "Background subtraction only",
    "Percent of maximum",
    "Z-score normalization",
    "Raw values (no normalization)"
];
var gd0 = new GenericDialog("Normalization Method");
gd0.addChoice("Select normalization method:", normMethods, normMethods[0]);
gd0.addMessage("F/F0: Standard for time-lapse (starts at 1.0)\n" +
               "dF/F0: Fold change (starts at 0.0)\n" +
               "Background subtraction: Simple correction\n" +
               "Percent of max: Scale 0-100%\n" +
               "Z-score: Statistical normalization\n" +
               "Raw: No processing");
gd0.showDialog();
if (gd0.wasCanceled()) throw "exit";

var normMethod = gd0.getNextChoice();

// ============================================
// 2. Background Point Selection
// ============================================
var bgMethods = ["Click to select", "Type coordinates", "No background correction"];
var gd1 = new GenericDialog("Background Point Method");
gd1.addChoice("How to set background point:", bgMethods, bgMethods[0]);
gd1.showDialog();
if (gd1.wasCanceled()) throw "exit";

var bgMethod = gd1.getNextChoice();
var refX = -1, refY = -1;
var useBackground = (bgMethod != "No background correction");

if (bgMethod == "Click to select") {
    IJ.setTool("point");
    new WaitForUserDialog("Background Selection", "Select the BACKGROUND pixel, then click OK.").show();
    var bgRoi = imp.getRoi();
    if (bgRoi == null || bgRoi.getType() != Roi.POINT) {
        IJ.error("Please use the Point Tool to select a background pixel.");
        throw "exit";
    }
    var bgPoint = bgRoi.getContainedPoints()[0];
    refX = bgPoint.x;
    refY = bgPoint.y;
} else if (bgMethod == "Type coordinates") {
    var gd1b = new GenericDialog("Background Point Coordinates");
    gd1b.addNumericField("X coordinate:", 0, 0);
    gd1b.addNumericField("Y coordinate:", 0, 0);
    gd1b.showDialog();
    if (gd1b.wasCanceled()) throw "exit";
    
    refX = Math.round(gd1b.getNextNumber());
    refY = Math.round(gd1b.getNextNumber());
    
    // Validate coordinates
    if (refX < 0 || refX >= imgWidth || refY < 0 || refY >= imgHeight) {
        IJ.error("Coordinates out of image bounds (0-" + (imgWidth-1) + ", 0-" + (imgHeight-1) + ")");
        throw "exit";
    }
}

// ============================================
// 3. Target ROI Selection
// ============================================
// ROI Tools available:
// - Rectangle/Oval: For regular geometric shapes
// - Freehand: Draw irregular shapes by dragging
// - Polygon: Click vertices for precise boundaries
// - Brush: Paint selection for complex regions
// - Use existing: Reuse a previously defined ROI
// - Type coordinates: Enter exact numeric values
// ============================================
var roiTools = ["Rectangle", "Oval", "Freehand", "Polygon", "Brush", "Use existing ROI", "Type coordinates (Rectangle)", "Type coordinates (Oval)"];
var gd2 = new GenericDialog("Target ROI Method");
gd2.addChoice("ROI selection method:", roiTools, roiTools[0]);
gd2.showDialog();
if (gd2.wasCanceled()) throw "exit";

var roiMethod = gd2.getNextChoice();
var targetRoi, bounds;

if (roiMethod == "Rectangle") {
    IJ.setTool("rectangle");
    new WaitForUserDialog("Target Selection", "Draw a RECTANGLE around the target area, then click OK.").show();
    targetRoi = imp.getRoi();
    if (targetRoi == null) {
        IJ.error("No ROI selected.");
        throw "exit";
    }
    bounds = targetRoi.getBounds();
} else if (roiMethod == "Oval") {
    IJ.setTool("oval");
    new WaitForUserDialog("Target Selection", "Draw an OVAL around the target area, then click OK.").show();
    targetRoi = imp.getRoi();
    if (targetRoi == null) {
        IJ.error("No ROI selected.");
        throw "exit";
    }
    bounds = targetRoi.getBounds();
} else if (roiMethod == "Freehand") {
    IJ.setTool("freehand");
    new WaitForUserDialog("Target Selection", "Draw a FREEHAND selection around the target area, then click OK.").show();
    targetRoi = imp.getRoi();
    if (targetRoi == null) {
        IJ.error("No ROI selected.");
        throw "exit";
    }
    bounds = targetRoi.getBounds();
} else if (roiMethod == "Polygon") {
    IJ.setTool("polygon");
    new WaitForUserDialog("Target Selection", "Draw a POLYGON around the target area, then click OK.").show();
    targetRoi = imp.getRoi();
    if (targetRoi == null) {
        IJ.error("No ROI selected.");
        throw "exit";
    }
    bounds = targetRoi.getBounds();
} else if (roiMethod == "Brush") {
    IJ.setTool("brush");
    new WaitForUserDialog("Target Selection", "Paint the target area with BRUSH tool, then click OK.").show();
    targetRoi = imp.getRoi();
    if (targetRoi == null) {
        IJ.error("No ROI selected.");
        throw "exit";
    }
    bounds = targetRoi.getBounds();
} else if (roiMethod == "Use existing ROI") {
    targetRoi = imp.getRoi();
    if (targetRoi == null) {
        IJ.error("No existing ROI found on the image.");
        throw "exit";
    }
    bounds = targetRoi.getBounds();
} else if (roiMethod == "Type coordinates (Rectangle)") {
    var gd2b = new GenericDialog("Rectangle ROI Coordinates");
    gd2b.addNumericField("X (top-left):", 0, 0);
    gd2b.addNumericField("Y (top-left):", 0, 0);
    gd2b.addNumericField("Width:", 100, 0);
    gd2b.addNumericField("Height:", 100, 0);
    gd2b.showDialog();
    if (gd2b.wasCanceled()) throw "exit";
    
    var roiX = Math.round(gd2b.getNextNumber());
    var roiY = Math.round(gd2b.getNextNumber());
    var roiW = Math.round(gd2b.getNextNumber());
    var roiH = Math.round(gd2b.getNextNumber());
    
    if (roiX < 0 || roiY < 0 || roiW <= 0 || roiH <= 0) {
        IJ.error("Invalid ROI dimensions. All values must be positive.");
        throw "exit";
    }
    if (roiX + roiW > imgWidth || roiY + roiH > imgHeight) {
        IJ.error("ROI extends beyond image bounds.");
        throw "exit";
    }
    
    targetRoi = new Roi(roiX, roiY, roiW, roiH);
    bounds = targetRoi.getBounds();
} else if (roiMethod == "Type coordinates (Oval)") {
    var gd2c = new GenericDialog("Oval ROI Coordinates");
    gd2c.addNumericField("X (top-left of bounding box):", 0, 0);
    gd2c.addNumericField("Y (top-left of bounding box):", 0, 0);
    gd2c.addNumericField("Width:", 100, 0);
    gd2c.addNumericField("Height:", 100, 0);
    gd2c.showDialog();
    if (gd2c.wasCanceled()) throw "exit";
    
    var ovalX = Math.round(gd2c.getNextNumber());
    var ovalY = Math.round(gd2c.getNextNumber());
    var ovalW = Math.round(gd2c.getNextNumber());
    var ovalH = Math.round(gd2c.getNextNumber());
    
    if (ovalX < 0 || ovalY < 0 || ovalW <= 0 || ovalH <= 0) {
        IJ.error("Invalid ROI dimensions. All values must be positive.");
        throw "exit";
    }
    if (ovalX + ovalW > imgWidth || ovalY + ovalH > imgHeight) {
        IJ.error("ROI extends beyond image bounds.");
        throw "exit";
    }
    
    targetRoi = new OvalRoi(ovalX, ovalY, ovalW, ovalH);
    bounds = targetRoi.getBounds();
}

// 4. Process the stack
var rt = new ResultsTable();

// ============================================
// First pass: Collect all values for normalization calculations
// ============================================
var allMeans = [];
var allBgCorrected = [];
var allBackgrounds = [];

for (var i = 1; i <= stackSize; i++) {
    imp.setSlice(i);
    var ip = imp.getProcessor();
    
    var backgroundVal = useBackground ? ip.getPixelValue(refX, refY) : 0;
    
    imp.setRoi(targetRoi);
    var stats = imp.getStatistics(Measurements.MEAN);
    
    allMeans.push(stats.mean);
    allBackgrounds.push(backgroundVal);
    allBgCorrected.push(stats.mean - backgroundVal);
}

// Calculate statistics needed for different normalization methods
var F0 = allBgCorrected[0];  // First frame (background-corrected)
var maxVal = Math.max.apply(null, allBgCorrected);
var minVal = Math.min.apply(null, allBgCorrected);

// Calculate mean and std for Z-score
var sum = 0;
for (var i = 0; i < allBgCorrected.length; i++) {
    sum += allBgCorrected[i];
}
var meanAll = sum / allBgCorrected.length;

var sumSq = 0;
for (var i = 0; i < allBgCorrected.length; i++) {
    sumSq += Math.pow(allBgCorrected[i] - meanAll, 2);
}
var stdAll = Math.sqrt(sumSq / allBgCorrected.length);

// Validation for methods that need F0 > 0
if ((normMethod.indexOf("F/F0") >= 0 || normMethod.indexOf("dF/F0") >= 0) && F0 <= 0) {
    IJ.error("Initial ROI intensity is <= background. Cannot use F/F0 normalization.\nTry 'Background subtraction only' or check your selections.");
    throw "exit";
}

if (normMethod.indexOf("Z-score") >= 0 && stdAll == 0) {
    IJ.error("Standard deviation is zero. Cannot use Z-score normalization.");
    throw "exit";
}

// ============================================
// Second pass: Calculate and record results
// ============================================
for (var i = 1; i <= stackSize; i++) {
    imp.setSlice(i);
    var ip = imp.getProcessor();
    
    var backgroundVal = allBackgrounds[i - 1];
    var rawMean = allMeans[i - 1];
    var F = allBgCorrected[i - 1];
    
    // Measure for CTCF
    imp.setRoi(targetRoi);
    var stats = imp.getStatistics(Measurements.MEAN + Measurements.INTEGRATED_DENSITY);
    var area = stats.area;
    var rawIntDen = stats.area * stats.mean;
    var CTCF = rawIntDen - (backgroundVal * area);
    
    // Calculate normalized value based on selected method
    var normalizedValue;
    var normColumnName;
    
    if (normMethod.indexOf("F/F0") >= 0 && normMethod.indexOf("dF/F0") < 0) {
        // F/F0: Normalize to first frame (starts at 1.0)
        normalizedValue = F / F0;
        normColumnName = "F/F0";
    } else if (normMethod.indexOf("dF/F0") >= 0) {
        // dF/F0: Fold change from baseline (starts at 0.0)
        normalizedValue = (F - F0) / F0;
        normColumnName = "dF/F0";
    } else if (normMethod.indexOf("Background subtraction") >= 0) {
        // Simple background subtraction
        normalizedValue = F;
        normColumnName = "F_corrected";
    } else if (normMethod.indexOf("Percent") >= 0) {
        // Percent of maximum
        normalizedValue = (maxVal != minVal) ? ((F - minVal) / (maxVal - minVal)) * 100 : 100;
        normColumnName = "Percent_Max";
    } else if (normMethod.indexOf("Z-score") >= 0) {
        // Z-score normalization
        normalizedValue = (F - meanAll) / stdAll;
        normColumnName = "Z_score";
    } else {
        // Raw values
        normalizedValue = rawMean;
        normColumnName = "Raw_Mean";
    }

    // Record Results
    // -------------------------------------------------------
    // Output columns explained:
    // - Slice: Current frame number
    // - Raw_Mean: Original mean intensity (no corrections)
    // - Background: Value at background reference point
    // - F_corrected: Raw_Mean minus Background
    // - [Normalized]: Depends on method (F/F0, dF/F0, etc.)
    // - CTCF: Corrected Total Cell Fluorescence for absolute quantification
    // -------------------------------------------------------
    rt.incrementCounter();
    rt.addValue("Slice", i);                    // Frame number (1 to N)
    rt.addValue("Raw_Mean", rawMean);           // Uncorrected mean intensity
    if (useBackground) {
        rt.addValue("Background", backgroundVal);   // Background at reference point
        rt.addValue("F_corrected", F);              // Background-subtracted intensity
    }
    rt.addValue(normColumnName, normalizedValue);   // Normalized value (method-dependent)
    rt.addValue("CTCF", CTCF);                      // Corrected Total Cell Fluorescence
}

rt.show("Intensity Measurement Results");
