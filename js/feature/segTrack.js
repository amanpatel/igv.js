/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2014 Broad Institute
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import FeatureSource from './featureSource.js';
import TrackBase from "../trackBase.js";
import IGVGraphics from "../igv-canvas.js";
import {IGVMath} from "../../node_modules/igv-utils/src/index.js";
import {createCheckbox} from "../igv-icons.js";
import {GradientColorScale} from "../util/colorScale.js";
import {isSimpleType} from "../util/igvUtils.js";
import {ColorTable} from "../util/colorPalletes.js";

class SegTrack extends TrackBase {

    constructor(config, browser) {
        super(config, browser);
    }

    init(config) {
        super.init(config);

        this.type = config.type || "seg";
        this.isLog = config.isLog;
        this.displayMode = config.displayMode || "SQUISHED"; // EXPANDED | SQUISHED
        this.maxHeight = config.maxHeight || 500;
        this.squishedRowHeight = config.sampleSquishHeight || config.squishedRowHeight || 2;
        this.expandedRowHeight = config.sampleExpandHeight || config.expandedRowHeight || 13;
        this.sampleHeight = this.squishedRowHeight;      // Initial value, will get overwritten when rendered

        if(config.color) {
            this.color = config.color;
        } else {
            // Color scales for "seg" (copy number) tracks.
            this.posColorScale = config.posColorScale ||
                new GradientColorScale({
                    low: 0.1,
                    lowR: 255,
                    lowG: 255,
                    lowB: 255,
                    high: 1.5,
                    highR: 255,
                    highG: 0,
                    highB: 0
                });
            this.negColorScale = config.negColorScale ||
                new GradientColorScale({
                    low: -1.5,
                    lowR: 0,
                    lowG: 0,
                    lowB: 255,
                    high: -0.1,
                    highR: 255,
                    highG: 255,
                    highB: 255
                });

            // Color table for mutation (mut and maf) tracks
            this.colorTable = new ColorTable(config.colorTable);
        }

        if (config.samples) {
            this.sampleKeys = config.samples;
            this.explicitSamples = true;
        } else {
            this.sampleKeys = [];
        }


        //   this.featureSource = config.sourceType === "bigquery" ?
        //       new igv.BigQueryFeatureSource(this.config) :
        this.featureSource = FeatureSource(this.config, this.browser.genome);

        this.initialSort = config.sort;
    }

    async postInit() {
        if (typeof this.featureSource.getHeader === "function") {
            this.header = await this.featureSource.getHeader();
        }
        // Set properties from track line
        if (this.header) {
            this.setTrackProperties(this.header)
        }
    }


    menuItemList() {

        const self = this;

        const menuItems = [];
        const lut =
            {
                "SQUISHED": "Squish",
                "EXPANDED": "Expand",
                "FILL": "Fill",
            };

        menuItems.push("<hr/>");
        menuItems.push("Sample Height");

        ["SQUISHED", "EXPANDED", "FILL"].forEach(function (displayMode) {
            menuItems.push(
                {
                    object: createCheckbox(lut[displayMode], displayMode === self.displayMode),
                    click: function () {
                        self.displayMode = displayMode;
                        self.config.displayMode = displayMode;
                        self.trackView.checkContentHeight();
                        self.trackView.repaintViews();
                    }
                });
        })

        return menuItems;

    }

    getSamples() {
        return {
            names: this.sampleKeys,
            height: this.sampleHeight
        }
    }

    async getFeatures(chr, start, end) {
        const features = await this.featureSource.getFeatures({chr, start, end});
        if (this.initialSort) {
            const sort = this.initialSort;
            this.sortSamples(sort.chr, sort.start, sort.end, sort.direction, features);
            this.initialSort = undefined;  // Sample order is sorted,
        }
        return features;
    }


    draw({context, renderSVG, pixelTop, pixelWidth, pixelHeight, features, bpPerPixel, bpStart}) {

        IGVGraphics.fillRect(context, 0, 0, pixelWidth, pixelHeight, {'fillStyle': "rgb(255, 255, 255)"});

        if (features && features.length > 0) {

            this.checkForLog(features);

            // New segments could conceivably add new samples
            this.updateSampleKeys(features);

            // Create a map for fast id -> row lookup
            const samples = {};
            this.sampleKeys.forEach(function (id, index) {
                samples[id] = index;
            })

            let border;
            switch (this.displayMode) {
                case "FILL":
                    this.sampleHeight = pixelHeight / this.sampleKeys.length;
                    border = 0
                    break;

                case "SQUISHED":
                    this.sampleHeight = this.squishedRowHeight;
                    border = 0;
                    break;

                default:   // EXPANDED
                    this.sampleHeight = this.expandedRowHeight;
                    border = 1;
            }
            const rowHeight = this.sampleHeight;


            // this.featureMap = new Map()

            for (let segment of features) {
                segment.pixelRect = undefined;   // !important, reset this in case segment is not drawn
            }

            const pixelBottom = pixelTop + pixelHeight;
            const bpEnd = bpStart + pixelWidth * bpPerPixel + 1;
            const xScale = bpPerPixel;

            this.sampleYStart = undefined
            for (let f of features) {

                if (f.end < bpStart) continue;
                if (f.start > bpEnd) break;

                const sampleKey = f.sampleKey || f.sample
                f.row = samples[sampleKey];
                const y = f.row * rowHeight + border;

                if (undefined === this.sampleYStart) {
                    this.sampleYStart = y
                }

                const bottom = y + rowHeight;

                if (bottom < pixelTop || y > pixelBottom) {
                    continue;
                }

                const segmentStart = Math.max(f.start, bpStart);
                // const segmentStart = segment.start;
                let x = Math.round((segmentStart - bpStart) / xScale);

                const segmentEnd = Math.min(f.end, bpEnd);
                // const segmentEnd = segment.end;
                const x1 = Math.round((segmentEnd - bpStart) / xScale);
                let w = Math.max(1, x1 - x);

                let color;
                if(this.color) {
                    if(typeof this.color === "function") {
                        color = this.color(f);
                    } else {
                        color = this.color;
                    }
                }
                else if("mut" === this.type) {
                    color = this.colorTable.getColor(f.value);
                } else {
                    // Assume seg track
                    let value = f.value;
                    if (!this.isLog) {
                        value = IGVMath.log2(value / 2);
                    }
                    if (value < -0.1) {
                        color = this.negColorScale.getColor(value);
                    } else if (value > 0.1) {
                        color = this.posColorScale.getColor(value);
                    } else {
                        color = "white";
                    }
                }


                let h;
                if("mut" === this.type) {
                    h = rowHeight - 2*border;
                    if(w < 3) {
                        w = 3;
                        x -= 1;
                    }
                } else {
                    // Assume seg track
                    let sh = rowHeight;
                    if (rowHeight < 0.25) {
                        const f = 0.1 + 2 * Math.abs(value);
                        sh = Math.min(1, f * rowHeight);
                    }
                    h = sh - 2 * border
                }

                f.pixelRect = { x, y, w, h };

                // Use for diagnostic rendering
                // context.fillStyle = randomRGB(180, 240)
                // context.fillStyle = randomGrey(200, 255)
                context.fillStyle = color;
                context.fillRect(x, y, w, h);
            }

        } else {
            console.log("No feature list");
        }

    }

    checkForLog(features) {
        if (this.isLog === undefined) {
            this.isLog = false;
            for (let feature of features) {
                if (feature.value < 0) {
                    this.isLog = true;
                    return;
                }
            }
        }
    }

    /**
     * Optional method to compute pixel height to accomodate the list of features.  The implementation below
     * has side effects (modifiying the samples hash).  This is unfortunate, but harmless.
     *
     * @param features
     * @returns {number}
     */
    computePixelHeight(features) {

        if (!features) return 0;

        const sampleHeight = ("SQUISHED" === this.displayMode) ? this.squishedRowHeight : this.expandedRowHeight;
        this.updateSampleKeys(features);
        return this.sampleKeys.length * sampleHeight;
    }

    /**
     * Sort samples by the average value over the genomic range in the direction indicated (1 = ascending, -1 descending)
     */
    async sortSamples(chr, start, end, direction, featureList) {

        if (!featureList) {
            featureList = await this.featureSource.getFeatures({chr, start, end});
        }
        if (!featureList) return;

        this.updateSampleKeys(featureList);

        const scores = {};
        const bpLength = end - start + 1;

        // Compute weighted average score for each sample
        for (let segment of featureList) {

            if (segment.end < start) continue;
            if (segment.start > end) break;

            const min = Math.max(start, segment.start);
            const max = Math.min(end, segment.end);
            const f = (max - min) / bpLength;

            const sampleKey = segment.sampleKey || segment.sample
            const s = scores[sampleKey] || 0;
            scores[sampleKey] = s + f * segment.value;
        }

        // Now sort sample names by score
        const d2 = (direction === "ASC" ? 1 : -1);
        this.sampleKeys.sort(function (a, b) {
            let s1 = scores[a];
            let s2 = scores[b];
            if (!s1) s1 = d2 * Number.MAX_VALUE;
            if (!s2) s2 = d2 * Number.MAX_VALUE;
            if (s1 === s2) return 0;
            else if (s1 > s2) return d2;
            else return d2 * -1;
        });

        this.trackView.repaintViews();
        // self.trackView.$viewport.scrollTop(0);
    }

    clickedFeatures(clickState) {

        const allFeatures = super.clickedFeatures(clickState);
        return filterByRow(allFeatures, clickState.y);

        function filterByRow(features, y) {

            return features.filter(function (feature) {
                const rect = feature.pixelRect;
                return rect && y >= rect.y && y <= (rect.y + rect.h);
            });

        }
    }

    popupData(clickState, featureList) {

        if (!featureList) featureList = this.clickedFeatures(clickState);

        const items = [];

        for (let f of featureList) {
            extractPopupData(f, items)
        }

        return items;

        function extractPopupData(feature, data) {

            const filteredProperties = new Set(['row', 'color', 'sampleKey', 'uniqueSampleKey', 'uniquePatientKey']);

            // hack for whole genome properties
            let f
            if (feature.hasOwnProperty('realChr')) {
                f = Object.assign({}, feature);
                f.chr = feature.realChr;
                f.start = feature.realStart;
                f.end = feature.realEnd;
                delete f.realChr;
                delete f.realStart;
                delete f.realEnd;
            } else {
                f = feature;
            }


            for (let property of Object.keys(f)) {

                if (!filteredProperties.has(property) && isSimpleType(f[property])) {
                    data.push({name: property, value: f[property]});
                }
            }
        }
    }

    contextMenuItemList(clickState) {

        const referenceFrame = clickState.viewport.referenceFrame;
        const genomicLocation = clickState.genomicLocation;

        // Define a region 5 "pixels" wide in genomic coordinates
        const sortDirection = this.config.sort ?
            (this.config.sort.direction === "ASC" ? "DESC" : "ASC") :      // Toggle from previous sort
            "DESC";
        const bpWidth = referenceFrame.toBP(2.5);

        const sortHandler = (sort) => {
            const viewport = clickState.viewport;
            const features = viewport.getCachedFeatures();
            this.sortSamples(sort.chr, sort.start, sort.end, sort.direction, features);
        }

        return [
            {
                label: 'Sort by value', click: (e) => {


                    const sort = {
                        direction: sortDirection,
                        chr: clickState.viewport.referenceFrame.chr,
                        start: genomicLocation - bpWidth,
                        end: genomicLocation + bpWidth

                    };

                    sortHandler(sort);

                    this.config.sort = sort;

                }
            }];

    }

    supportsWholeGenome() {
        return (this.config.indexed === false || !this.config.indexURL) && this.config.supportsWholeGenome !== false
    }

    updateSampleKeys(featureList) {

        if (this.explicitSamples) return;

        const samples = new Set(this.sampleKeys);
        for (let feature of featureList) {
            const sampleKey = feature.sampleKey || feature.sample;
            if (!samples.has(sampleKey)) {
                samples.add(sampleKey);
                this.sampleKeys.push(sampleKey);
            }
        }
    }
}



export default SegTrack
