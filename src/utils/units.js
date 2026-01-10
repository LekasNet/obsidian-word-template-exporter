// src/utils/units.js

// 1 inch = 25.4 mm
// 1 twip = 1/1440 inch
function mmToTwips(mm) {
    return Math.round((mm / 25.4) * 1440);
}

function cmToTwips(cm) {
    return mmToTwips(cm * 10);
}

// docx либы часто ждут half-points (pt * 2)
function ptToHalfPoints(pt) {
    return Math.round(pt * 2);
}

module.exports = {
    mmToTwips,
    cmToTwips,
    ptToHalfPoints
};
