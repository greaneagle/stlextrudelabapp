// Geometry Utilities
// Additional geometry helper functions

class GeometryUtils {
    static simplifyMesh(geometry, targetReduction) {
        // Placeholder for mesh simplification
        // In production, use algorithms like Quadric Error Metrics
        // or integrate libraries like three-simplify
        
        console.warn('Mesh simplification not yet implemented');
        console.warn('Use external tools like MeshLab or Blender for mesh reduction');
        
        return geometry;
    }
    
    static computeFaceNormal(v1, v2, v3) {
        const edge1 = new THREE.Vector3().subVectors(v2, v1);
        const edge2 = new THREE.Vector3().subVectors(v3, v1);
        return new THREE.Vector3().crossVectors(edge1, edge2).normalize();
    }
    
    static computeFaceCenter(v1, v2, v3) {
        return new THREE.Vector3()
            .add(v1)
            .add(v2)
            .add(v3)
            .multiplyScalar(1/3);
    }
    
    static isPointInTriangle(p, v1, v2, v3) {
        // Barycentric coordinate test
        const v0 = new THREE.Vector3().subVectors(v3, v1);
        const v1p = new THREE.Vector3().subVectors(v2, v1);
        const v2p = new THREE.Vector3().subVectors(p, v1);
        
        const dot00 = v0.dot(v0);
        const dot01 = v0.dot(v1p);
        const dot02 = v0.dot(v2p);
        const dot11 = v1p.dot(v1p);
        const dot12 = v1p.dot(v2p);
        
        const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
        const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
        const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
        
        return (u >= 0) && (v >= 0) && (u + v < 1);
    }
    
    static mergeVertices(geometry, tolerance = 0.0001) {
        // Merge duplicate vertices within tolerance
        // This is built into BufferGeometry.mergeVertices() in newer Three.js versions

        if (geometry.mergeVertices) {
            geometry.mergeVertices();
        }

        return geometry;
    }

    static cleanGeometry(geometry) {
        // Remove degenerate triangles and clean up geometry
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        geometry.computeVertexNormals();

        return geometry;
    }

 /**
     * Weld vertices in a geometry by merging duplicates within tolerance.
     * Works for BOTH indexed and non-indexed BufferGeometry.
     * Returns a new geometry with welded vertices and correct indices.
     */
    static weldVertices(geometry, tolerance = 0.0001) {
        const positionAttr = geometry.attributes.position;
        if (!positionAttr) return geometry;

        const positions = positionAttr.array;
        const hasIndex = geometry.index !== null;
        const vertexCount = positions.length / 3;

        // Map rounded coordinate key -> list of unique vertex indices
        const vertexMap = new Map();
        const uniqueVertices = [];
        const indexMapping = new Array(vertexCount);

        const toleranceSq = tolerance * tolerance;

        // Build mapping from old vertex index -> welded vertex index
        for (let v = 0; v < vertexCount; v++) {
            const i = v * 3;
            const x = positions[i];
            const y = positions[i + 1];
            const z = positions[i + 2];

            // Quantize to reduce floating point noise
            const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;

            let weldedIndex = undefined;

            if (vertexMap.has(key)) {
                const candidates = vertexMap.get(key);
                // Check actual distance to handle near-but-not-identical points
                for (let c = 0; c < candidates.length; c++) {
                    const idx = candidates[c];
                    const cx = uniqueVertices[idx * 3];
                    const cy = uniqueVertices[idx * 3 + 1];
                    const cz = uniqueVertices[idx * 3 + 2];

                    const dx = x - cx;
                    const dy = y - cy;
                    const dz = z - cz;
                    const distSq = dx * dx + dy * dy + dz * dz;

                    if (distSq < toleranceSq) {
                        weldedIndex = idx;
                        break;
                    }
                }
            }

            // No close match found → create a new unique vertex
            if (weldedIndex === undefined) {
                weldedIndex = uniqueVertices.length / 3;
                uniqueVertices.push(x, y, z);

                if (!vertexMap.has(key)) {
                    vertexMap.set(key, []);
                }
                vertexMap.get(key).push(weldedIndex);
            }

            indexMapping[v] = weldedIndex;
        }

        // Build new geometry with welded vertices
        const newGeometry = new THREE.BufferGeometry();
        newGeometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(uniqueVertices, 3)
        );

        // Rebuild index buffer correctly
        const indices = [];

        if (hasIndex) {
            // Use the original index buffer topology, remapped through indexMapping
            const srcIndices = geometry.index.array;
            for (let i = 0; i < srcIndices.length; i++) {
                const oldIdx = srcIndices[i];
                indices.push(indexMapping[oldIdx]);
            }
        } else {
            // Non-indexed: triangles are in sequence (0,1,2), (3,4,5), ...
            for (let i = 0; i < indexMapping.length; i++) {
                indices.push(indexMapping[i]);
            }
        }

        newGeometry.setIndex(indices);

        return newGeometry;
    }




    /**
     * Remove truly degenerate faces (zero-area or duplicate-vertex triangles)
     * Tolerance is scale-aware: by default it only removes faces that are
     * numerically indistinguishable from zero area.
     */
    static removeDegenerateFaces(geometry, tolerance = 0) {
        const positions = geometry.attributes.position.array;
        const hasIndex = geometry.index !== null;

        // --- derive a safe epsilon based on mesh size ---
        let epsAreaSq;
        if (tolerance > 0) {
            // caller explicitly gave something – interpret as *area*, square it
            epsAreaSq = tolerance * tolerance;
        } else {
            // auto: use a tiny fraction of the bounding-box diagonal
            geometry.computeBoundingBox();
            const bb = geometry.boundingBox;
            const diag = bb.max.clone().sub(bb.min).length() || 1.0;

            // area roughly scales with diag^2; this is EXTREMELY conservative
            // Using 1e-16 to only catch truly degenerate faces (near floating-point precision)
            const epsArea = (diag * diag) * 1e-16;
            epsAreaSq = epsArea * epsArea;
        }

        const tmp1 = new THREE.Vector3();
        const tmp2 = new THREE.Vector3();
        const v1 = new THREE.Vector3();
        const v2 = new THREE.Vector3();
        const v3 = new THREE.Vector3();

        if (hasIndex) {
            const indices = Array.from(geometry.index.array);
            const cleanIndices = [];

            for (let i = 0; i < indices.length; i += 3) {
                const i1 = indices[i];
                const i2 = indices[i + 1];
                const i3 = indices[i + 2];

                // 1) identical indices → degenerate
                if (i1 === i2 || i2 === i3 || i3 === i1) continue;

                // 2) compute area^2
                v1.set(
                    positions[i1 * 3],
                    positions[i1 * 3 + 1],
                    positions[i1 * 3 + 2]
                );
                v2.set(
                    positions[i2 * 3],
                    positions[i2 * 3 + 1],
                    positions[i2 * 3 + 2]
                );
                v3.set(
                    positions[i3 * 3],
                    positions[i3 * 3 + 1],
                    positions[i3 * 3 + 2]
                );

                tmp1.subVectors(v2, v1);
                tmp2.subVectors(v3, v1);
                tmp1.cross(tmp2);

                const areaSq = tmp1.lengthSq() * 0.25; // (|cross|/2)^2

                if (areaSq > epsAreaSq) {
                    cleanIndices.push(i1, i2, i3);
                }
            }

            geometry.setIndex(cleanIndices);
        } else {
            const cleanPositions = [];

            for (let i = 0; i < positions.length; i += 9) {
                v1.set(positions[i],     positions[i + 1], positions[i + 2]);
                v2.set(positions[i + 3], positions[i + 4], positions[i + 5]);
                v3.set(positions[i + 6], positions[i + 7], positions[i + 8]);

                tmp1.subVectors(v2, v1);
                tmp2.subVectors(v3, v1);
                tmp1.cross(tmp2);

                const areaSq = tmp1.lengthSq() * 0.25;

                if (areaSq > epsAreaSq) {
                    cleanPositions.push(
                        v1.x, v1.y, v1.z,
                        v2.x, v2.y, v2.z,
                        v3.x, v3.y, v3.z
                    );
                }
            }

            geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(cleanPositions, 3)
            );
        }

        return geometry;
    }

    /**
     * Prepare geometry for STL export.
     * Very conservative: we only weld almost-identical vertices
     * and remove truly zero-area faces.
     */
    static prepareForExport(geometry, weldTolerance = 0.001) {
        console.log('[GeometryUtils] Preparing geometry for export...');

        const startVertices = geometry.attributes.position.count;
        const startFaces = geometry.index ? geometry.index.count / 3 : startVertices / 3;

        // Step 1: Weld with same tolerance as mesh generation (0.001)
        let cleanGeometry = this.weldVertices(geometry, weldTolerance);
        console.log(
            `  Welded vertices: ${startVertices} → ${cleanGeometry.attributes.position.count}`
        );

        // Step 2: SKIP degenerate face removal - it was deleting valid tiny triangles on curves
        // Just keep all faces after welding
        console.log(`  Faces preserved: ${startFaces} (no degenerate removal)`);

        // Step 3: Recompute normals and bounds
        cleanGeometry.computeVertexNormals();
        cleanGeometry.computeBoundingBox();
        cleanGeometry.computeBoundingSphere();

        console.log('[GeometryUtils] Export preparation complete');

        return cleanGeometry;
    }

    /**
     * Remove specific faces from geometry by face indices
     */
    static removeFaces(geometry, faceIndicesToRemove) {
        const positions = geometry.attributes.position.array;
        const hasIndex = geometry.index !== null;

        const removeSet = new Set(faceIndicesToRemove);

        if (hasIndex) {
            // Indexed geometry
            const indices = Array.from(geometry.index.array);
            const newIndices = [];

            for (let i = 0; i < indices.length / 3; i++) {
                if (!removeSet.has(i)) {
                    newIndices.push(
                        indices[i * 3],
                        indices[i * 3 + 1],
                        indices[i * 3 + 2]
                    );
                }
            }

            geometry.setIndex(newIndices);
        } else {
            // Non-indexed geometry
            const newPositions = [];

            for (let i = 0; i < positions.length / 9; i++) {
                if (!removeSet.has(i)) {
                    const offset = i * 9;
                    for (let j = 0; j < 9; j++) {
                        newPositions.push(positions[offset + j]);
                    }
                }
            }

            geometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
        }

        return geometry;
    }
}

// ES module export
export { GeometryUtils };
