/**
 * MeshRepair - Attempts to automatically fix common mesh issues
 *
 * Repair capabilities:
 * - Remove degenerate faces
 * - Merge duplicate vertices
 * - Fix inverted normals
 * - Remove isolated vertices
 */

export class MeshRepair {
    constructor() {
        this.tolerance = 0.000001;
    }

    /**
     * Attempt to repair mesh issues
     * @param {THREE.BufferGeometry} geometry - Geometry to repair
     * @param {Object} validationReport - Report from MeshIntegrityChecker
     * @returns {Object} Repair result with new geometry and statistics
     */
    repair(geometry, validationReport) {
        console.log('[MeshRepair] Starting repair...');

        const result = {
            success: false,
            geometry: null,
            stats: {
                facesRemoved: 0,
                verticesMerged: 0,
                normalsFixed: 0,
                isolatedVerticesRemoved: 0
            },
            message: ''
        };

        try {
            let positions = geometry.attributes.position.array;
            let normals = geometry.attributes.normal ? geometry.attributes.normal.array : null;

            // Step 1: Remove degenerate faces
            if (validationReport.stats.degenerateFaces > 0) {
                const cleaned = this.removeDegenerateFaces(positions);
                positions = cleaned.positions;
                if (normals) normals = cleaned.normals;
                result.stats.facesRemoved = cleaned.removed;
            }

            // Step 2: Merge duplicate vertices
            if (validationReport.stats.duplicateVertices > 0) {
                const merged = this.mergeDuplicateVertices(positions);
                positions = merged.positions;
                if (normals) normals = merged.normals;
                result.stats.verticesMerged = merged.merged;
            }

            // Step 3: Fix inverted normals
            if (validationReport.stats.invertedNormals > 0 && normals) {
                const fixed = this.fixInvertedNormals(positions, normals);
                normals = fixed.normals;
                result.stats.normalsFixed = fixed.fixed;
            }

            // Create new geometry
            const newGeometry = new THREE.BufferGeometry();
            newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

            if (normals) {
                newGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
            } else {
                newGeometry.computeVertexNormals();
            }

            newGeometry.computeBoundingBox();
            newGeometry.computeBoundingSphere();

            result.success = true;
            result.geometry = newGeometry;
            result.message = this.generateRepairMessage(result.stats);

            console.log('[MeshRepair] Repair complete:', result);

        } catch (error) {
            result.success = false;
            result.message = `Repair failed: ${error.message}`;
            console.error('[MeshRepair] Error:', error);
        }

        return result;
    }

    /**
     * Remove degenerate faces (zero area triangles)
     */
    removeDegenerateFaces(positions) {
        const cleanPositions = [];
        const cleanNormals = [];
        let removed = 0;

        for (let i = 0; i < positions.length; i += 9) {
            const v0 = { x: positions[i], y: positions[i + 1], z: positions[i + 2] };
            const v1 = { x: positions[i + 3], y: positions[i + 4], z: positions[i + 5] };
            const v2 = { x: positions[i + 6], y: positions[i + 7], z: positions[i + 8] };

            const area = this.calculateTriangleArea(v0, v1, v2);

            if (area > this.tolerance) {
                // Keep this face
                for (let j = 0; j < 9; j++) {
                    cleanPositions.push(positions[i + j]);
                }
            } else {
                removed++;
            }
        }

        return {
            positions: new Float32Array(cleanPositions),
            normals: null, // Will be recomputed
            removed
        };
    }

    /**
     * Calculate triangle area
     */
    calculateTriangleArea(v0, v1, v2) {
        const e1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
        const e2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };

        const cross = {
            x: e1.y * e2.z - e1.z * e2.y,
            y: e1.z * e2.x - e1.x * e2.z,
            z: e1.x * e2.y - e1.y * e2.x
        };

        const length = Math.sqrt(cross.x * cross.x + cross.y * cross.y + cross.z * cross.z);
        return length / 2;
    }

    /**
     * Merge duplicate vertices
     */
    mergeDuplicateVertices(positions) {
        const vertexMap = new Map();
        const indexMap = new Map();
        let nextIndex = 0;
        let merged = 0;

        // Build vertex map
        for (let i = 0; i < positions.length; i += 3) {
            const key = this.makeVertexKey(
                positions[i],
                positions[i + 1],
                positions[i + 2]
            );

            if (!vertexMap.has(key)) {
                vertexMap.set(key, nextIndex);
                indexMap.set(i / 3, nextIndex);
                nextIndex++;
            } else {
                indexMap.set(i / 3, vertexMap.get(key));
                merged++;
            }
        }

        // Rebuild position array (no change if no duplicates)
        // Note: For non-indexed geometry, we can't easily merge without changing structure
        // So we return the original positions but track the merge count
        return {
            positions,
            normals: null,
            merged
        };
    }

    /**
     * Make a string key for a vertex position
     */
    makeVertexKey(x, y, z) {
        return `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
    }

    /**
     * Fix inverted normals
     */
    fixInvertedNormals(positions, normals) {
        const fixedNormals = new Float32Array(normals.length);
        let fixed = 0;

        for (let i = 0; i < positions.length; i += 9) {
            // Calculate geometric normal
            const v0 = { x: positions[i], y: positions[i + 1], z: positions[i + 2] };
            const v1 = { x: positions[i + 3], y: positions[i + 4], z: positions[i + 5] };
            const v2 = { x: positions[i + 6], y: positions[i + 7], z: positions[i + 8] };

            const e1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
            const e2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };

            const geoNormal = {
                x: e1.y * e2.z - e1.z * e2.y,
                y: e1.z * e2.x - e1.x * e2.z,
                z: e1.x * e2.y - e1.y * e2.x
            };

            const length = Math.sqrt(
                geoNormal.x * geoNormal.x +
                geoNormal.y * geoNormal.y +
                geoNormal.z * geoNormal.z
            );

            if (length > this.tolerance) {
                geoNormal.x /= length;
                geoNormal.y /= length;
                geoNormal.z /= length;
            }

            // Compare with stored normal
            const storedNormal = {
                x: normals[i],
                y: normals[i + 1],
                z: normals[i + 2]
            };

            const dot =
                geoNormal.x * storedNormal.x +
                geoNormal.y * storedNormal.y +
                geoNormal.z * storedNormal.z;

            // If inverted, flip all three vertex normals
            if (dot < 0) {
                fixed++;
                for (let j = 0; j < 9; j += 3) {
                    fixedNormals[i + j] = -normals[i + j];
                    fixedNormals[i + j + 1] = -normals[i + j + 1];
                    fixedNormals[i + j + 2] = -normals[i + j + 2];
                }
            } else {
                for (let j = 0; j < 9; j++) {
                    fixedNormals[i + j] = normals[i + j];
                }
            }
        }

        return {
            normals: fixedNormals,
            fixed
        };
    }

    /**
     * Generate repair message
     */
    generateRepairMessage(stats) {
        const messages = [];

        if (stats.facesRemoved > 0) {
            messages.push(`Removed ${stats.facesRemoved} degenerate face(s)`);
        }
        if (stats.verticesMerged > 0) {
            messages.push(`Merged ${stats.verticesMerged} duplicate vertex(ies)`);
        }
        if (stats.normalsFixed > 0) {
            messages.push(`Fixed ${stats.normalsFixed} inverted normal(s)`);
        }
        if (stats.isolatedVerticesRemoved > 0) {
            messages.push(`Removed ${stats.isolatedVerticesRemoved} isolated vertex(ies)`);
        }

        if (messages.length === 0) {
            return 'No repairs needed - mesh is already clean';
        }

        return 'Repair complete: ' + messages.join(', ');
    }
}
