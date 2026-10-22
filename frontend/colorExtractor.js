/**
 * RoomColorExtractor
 * Analyzes uploaded 2D room photos, filters out foreground furniture/decorations,
 * and extracts individual wall, ceiling, and floor paint colors.
 */
export class RoomColorExtractor {
    constructor() {
        this.analysisWidth = 360; // Standard resolution for fast, noise-resistant processing
    }

    /**
     * Extracts colors for Wall 1 (Left), Wall 2 (Right), Wall 3 (North/Straight),
     * Wall 4 (South/Behind), Surface 5 (Ceiling), and Surface 6 (Floor).
     * @param {HTMLImageElement|string} imageSource - Image element or Data URL
     * @returns {Promise<Object>} Palette with hex colors and metadata
     */
    async extractPalette(imageSource) {
        const img = await this._ensureImage(imageSource);
        
        // Draw to offscreen canvas
        const canvas = document.createElement('canvas');
        const aspect = (img.naturalHeight || img.height || 300) / (img.naturalWidth || img.width || 400);
        const width = this.analysisWidth;
        const height = Math.max(100, Math.round(width * aspect));
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, width, height);
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;

        // 1. Compute edge / gradient map to detect furniture, frames, pillows, high-contrast objects
        const edgeMap = this._computeEdgeMap(data, width, height);

        // 2. Define standard architectural zones (expressed as fraction of width and height)
        // Walls and surfaces are located in distinct regions of perspective photos:
        const zones = {
            ceiling: { // 5: Ceiling
                name: 'Surface 5 (Ceiling)',
                id: 'ceiling',
                xMin: 0.15, xMax: 0.85,
                yMin: 0.02, yMax: 0.18,
                pinX: 0.50, pinY: 0.10
            },
            left: { // 1: Left Wall
                name: 'Wall 1 (Left Wall)',
                id: 'left',
                xMin: 0.03, xMax: 0.28,
                yMin: 0.16, yMax: 0.58,
                pinX: 0.15, pinY: 0.35
            },
            right: { // 2: Right Wall
                name: 'Wall 2 (Right Wall)',
                id: 'right',
                xMin: 0.72, xMax: 0.97,
                yMin: 0.16, yMax: 0.58,
                pinX: 0.85, pinY: 0.35
            },
            north: { // 3: North / Straight Wall
                name: 'Wall 3 (North / Straight Wall)',
                id: 'north',
                xMin: 0.30, xMax: 0.70,
                yMin: 0.16, yMax: 0.46, // Upper center wall, above sofa / TV / headboard
                pinX: 0.50, pinY: 0.30
            },
            floor: { // 6: Floor
                name: 'Surface 6 (Floor)',
                id: 'floor',
                xMin: 0.25, xMax: 0.75,
                yMin: 0.80, yMax: 0.97, // Lower floor zone
                pinX: 0.50, pinY: 0.88
            }
        };

        const result = {};

        // 3. Extract dominant smooth color for each zone while ignoring furniture edges
        for (const [key, zone] of Object.entries(zones)) {
            const hex = this._extractZoneColor(data, edgeMap, width, height, zone);
            result[key] = {
                id: zone.id,
                name: zone.name,
                hex: hex,
                pin: { x: zone.pinX, y: zone.pinY }
            };
        }

        // 4. Wall 4: South Wall (the wall behind camera / sofa)
        // In real interior architecture, Wall 4 shares the primary wall paint tone with Wall 3 (North wall)
        // or provides a harmonious cohesive finish.
        result.south = {
            id: 'south',
            name: 'Wall 4 (South / Behind Sofa)',
            hex: result.north.hex, // Default to North Wall color
            pin: { x: 0.50, y: 0.65 } // Movable pin on the photo
        };

        // 5. Dynamic Ceiling Feature & Architecture Detection from Photo
        result.ceilingFeatures = this.detectCeilingFeatures(data, width, height, edgeMap);

        // If a specific ceiling tray paint color was detected, assign it to Surface 5 (Ceiling)
        if (result.ceilingFeatures && result.ceilingFeatures.trayColor) {
            result.ceiling.hex = result.ceilingFeatures.trayColor;
        }

        return result;
    }

    /**
     * Analyzes ceiling lighting, dual cove LED glow, spotlights, chandelier, fan, and architectural false-ceiling style.
     */
    detectCeilingFeatures(data, width, height, edgeMap = null) {
        const ceilH = Math.max(10, Math.floor(height * 0.32));
        
        let warmCoveCount = 0;
        let warmCoveR = 0, warmCoveG = 0, warmCoveB = 0;

        let cyanCoveCount = 0;
        let cyanCoveR = 0, cyanCoveG = 0, cyanCoveB = 0;

        let bluePaintCount = 0;
        let bluePaintR = 0, bluePaintG = 0, bluePaintB = 0;

        let brightSpotCount = 0;
        let darkCenterCount = 0;
        let woodToneCount = 0;

        for (let y = 0; y < ceilH; y++) {
            const rowOffset = y * width;
            for (let x = 0; x < width; x++) {
                const idx = (rowOffset + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                // 1. Warm golden cove LED light pixels (strong warm amber hue)
                if (r > 175 && g > 130 && b < 160 && (r - b > 25)) {
                    warmCoveCount++;
                    warmCoveR += r;
                    warmCoveG += g;
                    warmCoveB += b;
                }

                // 2. Cyan / Ice-Blue cove LED glow pixels
                if (b > 140 && g > 130 && (b > r + 15)) {
                    cyanCoveCount++;
                    cyanCoveR += r;
                    cyanCoveG += g;
                    cyanCoveB += b;
                }

                // 3. Pastel Sky / Slate Blue ceiling paint pixels
                if (r > 90 && r < 180 && g > 120 && g < 210 && b > 140 && (b > r + 10)) {
                    bluePaintCount++;
                    bluePaintR += r;
                    bluePaintG += g;
                    bluePaintB += b;
                }

                // 4. High-brightness spotlight / pot light pixels
                if (r > 225 && g > 225 && b > 210) {
                    brightSpotCount++;
                }

                // 5. Center hanging fixture / canopy / fan / chandelier
                const normX = x / width;
                const normY = y / ceilH;
                if (normX >= 0.35 && normX <= 0.65 && normY >= 0.30) {
                    if (r < 55 && g < 55 && b < 55) {
                        darkCenterCount++;
                    }
                }

                // 6. Wood tones (slats)
                if (r > 120 && r < 205 && g > 65 && g < 145 && b < 95 && (r > g + 25)) {
                    woodToneCount++;
                }
            }
        }

        const totalCeilPixels = ceilH * width;
        const woodRatio = woodToneCount / totalCeilPixels;
        const cyanRatio = cyanCoveCount / totalCeilPixels;
        const blueRatio = bluePaintCount / totalCeilPixels;
        const coveRatio = warmCoveCount / totalCeilPixels;

        // Extract Cove Colors
        let coveColor = '#ffd54f';
        if (warmCoveCount > 50) {
            const avgR = Math.min(255, Math.round(warmCoveR / warmCoveCount) + 10);
            const avgG = Math.min(255, Math.round(warmCoveG / warmCoveCount) + 8);
            const avgB = Math.round(warmCoveB / warmCoveCount);
            coveColor = this._rgbToHex(avgR, avgG, avgB);
        }

        let innerCoveColor = '#00e5ff';
        if (cyanCoveCount > 50) {
            const avgR = Math.round(cyanCoveR / cyanCoveCount);
            const avgG = Math.min(255, Math.round(cyanCoveG / cyanCoveCount) + 15);
            const avgB = Math.min(255, Math.round(cyanCoveB / cyanCoveCount) + 20);
            innerCoveColor = this._rgbToHex(avgR, avgG, avgB);
        }

        let trayColor = '#83a9b8';
        if (bluePaintCount > 50) {
            const avgR = Math.round(bluePaintR / bluePaintCount);
            const avgG = Math.round(bluePaintG / bluePaintCount);
            const avgB = Math.round(bluePaintB / bluePaintCount);
            trayColor = this._rgbToHex(avgR, avgG, avgB);
        }

        let detectedStyle = 'modern_tray';
        let detectedName = 'Modern Tray (Cove LEDs, Spots & Pendant - Like Photo)';
        let fixture = 'chandelier';

        // 7. Grid Edge Analysis for Coffered Ceilings & Floating Islands
        let gridCrossCount = 0;
        let centralIslandEdges = 0;
        if (edgeMap) {
            for (let y = 4; y < ceilH - 4; y++) {
                const row = y * width;
                for (let x = 4; x < width - 4; x++) {
                    if (edgeMap[row + x] === 1) {
                        const hasVert = edgeMap[(y - 1) * width + x] === 1 || edgeMap[(y + 1) * width + x] === 1;
                        const hasHoriz = edgeMap[row + x - 1] === 1 || edgeMap[row + x + 1] === 1;
                        if (hasVert && hasHoriz) gridCrossCount++;

                        const normX = x / width;
                        const normY = y / ceilH;
                        if (normX >= 0.22 && normX <= 0.78 && normY >= 0.25 && normY <= 0.85) {
                            centralIslandEdges++;
                        }
                    }
                }
            }
        }

        // Dynamic Ceiling Style Classification:
        // 1. Circular Ring false ceiling with Dual-tone Cove & Slat Accents (exact photo match)
        if (cyanRatio > 0.03 || (blueRatio > 0.04 && coveRatio > 0.02)) {
            detectedStyle = 'circular_ring';
            detectedName = 'Modern Circular Ring with Dual Warm/Cyan Cove & Slat Accents (Photo Match)';
            fixture = 'ceiling_fan';
        }
        // 2. Linear Wooden Slats ceiling with LED channels
        else if (woodRatio > 0.12) {
            detectedStyle = 'wooden_slats';
            detectedName = 'Modern Linear Wooden Slats with LED Channels';
            fixture = 'linear_led';
        }
        // 3. Coffered Grid Ceiling (prominent intersecting grid beams)
        else if (gridCrossCount > 800 && woodRatio < 0.08) {
            detectedStyle = 'coffered_grid';
            detectedName = 'Luxury Coffered Grid Ceiling';
            fixture = 'chandelier';
        }
        // 4. Floating Island Ceiling with 360-degree halo
        else if (centralIslandEdges > 2200 && coveRatio > 0.08 && woodRatio < 0.08) {
            detectedStyle = 'floating_island';
            detectedName = 'Floating Island Ceiling with 360° Halo Glow';
            fixture = 'chandelier';
        }
        // 5. Classic Dropped Soffit Tray with Cove LEDs & Spotlights
        else if (coveRatio > 0.03) {
            detectedStyle = 'modern_tray';
            detectedName = 'Modern Tray (Cove LEDs, Spots & Pendant - Like Photo)';
            fixture = darkCenterCount > 25 ? 'chandelier' : 'ceiling_fan';
        }
        // 6. Minimalist Recessed Spotlights Grid
        else if (brightSpotCount > 100) {
            detectedStyle = 'minimal_spots';
            detectedName = 'Minimalist Recessed Spotlights Grid';
            fixture = 'spots_only';
        }
        // 7. Default fallback to Modern Tray
        else {
            detectedStyle = 'modern_tray';
            detectedName = 'Modern Tray (Cove LEDs, Spots & Pendant - Like Photo)';
            fixture = 'chandelier';
        }

        return {
            style: detectedStyle,
            name: detectedName,
            coveColor: coveColor,
            innerCoveColor: innerCoveColor,
            trayColor: (bluePaintCount > 50) ? trayColor : null,
            hasCoveLight: warmCoveCount > 50,
            hasSpotlights: brightSpotCount > 30,
            hasChandelier: detectedStyle !== 'circular_ring' && darkCenterCount > 25,
            hasFan: detectedStyle === 'circular_ring' || fixture === 'ceiling_fan',
            fixture: fixture,
            slatCount: 3
        };
    }

    _computeEdgeMap(data, width, height) {
        const edgeMap = new Uint8Array(width * height);
        // Sobel-like edge / gradient detector
        for (let y = 0; y < height - 1; y++) {
            const rowOffset = y * width;
            const nextRowOffset = (y + 1) * width;
            for (let x = 0; x < width - 1; x++) {
                const idx = (rowOffset + x) * 4;
                const idxR = (rowOffset + x + 1) * 4;
                const idxD = (nextRowOffset + x) * 4;

                const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                const rR = data[idxR], gR = data[idxR + 1], bR = data[idxR + 2];
                const rD = data[idxD], gD = data[idxD + 1], bD = data[idxD + 2];

                // Difference magnitude
                const diffX = Math.abs(r - rR) + Math.abs(g - gR) + Math.abs(b - bR);
                const diffY = Math.abs(r - rD) + Math.abs(g - gD) + Math.abs(b - bD);
                const grad = (diffX + diffY) / 6;

                // Mark edge pixels (belonging to furniture contours, shelves, frames, cushions)
                edgeMap[rowOffset + x] = grad > 13 ? 1 : 0;
            }
        }
        return edgeMap;
    }

    _extractZoneColor(data, edgeMap, width, height, zone) {
        const startX = Math.floor(zone.xMin * width);
        const endX = Math.floor(zone.xMax * width);
        const startY = Math.floor(zone.yMin * height);
        const endY = Math.floor(zone.yMax * height);

        const candidates = [];
        const fallbackPixels = [];

        for (let y = startY; y < endY; y++) {
            const rowOffset = y * width;
            for (let x = startX; x < endX; x++) {
                const idx = (rowOffset + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                
                // Luminance
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                fallbackPixels.push([r, g, b]);

                // Filter 1: Ignore high-contrast edges (furniture silhouettes, cushions, frames, shelf corners)
                if (edgeMap[rowOffset + x] === 1) continue;

                // Filter 2: Ignore deep shadows (under furniture) or blown highlights (lamp glare)
                if (lum < 32 || lum > 250) continue;

                candidates.push([r, g, b]);
            }
        }

        // Use smooth wall candidates if sufficient, otherwise fall back to all pixels
        const pool = candidates.length >= 25 ? candidates : (fallbackPixels.length > 0 ? fallbackPixels : [[220, 220, 220]]);

        return this._findDominantColor(pool);
    }

    _findDominantColor(pixels) {
        const bins = {};
        const binStep = 20; // 20-step buckets in RGB space

        for (let i = 0; i < pixels.length; i++) {
            const [r, g, b] = pixels[i];
            const binKey = `${Math.floor(r / binStep)},${Math.floor(g / binStep)},${Math.floor(b / binStep)}`;
            if (!bins[binKey]) {
                bins[binKey] = { rSum: 0, gSum: 0, bSum: 0, count: 0 };
            }
            bins[binKey].rSum += r;
            bins[binKey].gSum += g;
            bins[binKey].bSum += b;
            bins[binKey].count += 1;
        }

        let maxCount = -1;
        let bestBin = null;
        for (const key in bins) {
            if (bins[key].count > maxCount) {
                maxCount = bins[key].count;
                bestBin = bins[key];
            }
        }

        if (bestBin && bestBin.count > 0) {
            const avgR = Math.round(bestBin.rSum / bestBin.count);
            const avgG = Math.round(bestBin.gSum / bestBin.count);
            const avgB = Math.round(bestBin.bSum / bestBin.count);
            return this._rgbToHex(avgR, avgG, avgB);
        }

        return '#cccccc';
    }

    /**
     * Sample exact pixel or small neighborhood at normalized coordinates (0 to 1)
     */
    async samplePixel(imageSource, normX, normY) {
        const img = await this._ensureImage(imageSource);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 400;
        canvas.height = img.naturalHeight || img.height || 300;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const px = Math.max(0, Math.min(canvas.width - 1, Math.round(normX * canvas.width)));
        const py = Math.max(0, Math.min(canvas.height - 1, Math.round(normY * canvas.height)));

        // Sample 5x5 patch
        const pSize = 5;
        const startX = Math.max(0, px - 2);
        const startY = Math.max(0, py - 2);
        const width = Math.min(canvas.width - startX, pSize);
        const height = Math.min(canvas.height - startY, pSize);

        const imgData = ctx.getImageData(startX, startY, width, height).data;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;

        for (let i = 0; i < imgData.length; i += 4) {
            rSum += imgData[i];
            gSum += imgData[i + 1];
            bSum += imgData[i + 2];
            count++;
        }

        if (count > 0) {
            return this._rgbToHex(Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count));
        }
        return '#cccccc';
    }

    _rgbToHex(r, g, b) {
        const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    _ensureImage(source) {
        if (source instanceof HTMLImageElement && source.complete && source.naturalWidth > 0) {
            return Promise.resolve(source);
        }
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = (e) => reject(new Error('Failed to load image for color extraction'));
            img.src = typeof source === 'string' ? source : (source.src || '');
        });
    }
}
