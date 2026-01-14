/**
 * Web Worker for mesh simplification using Quadric Error Metrics (QEM)
 * Based on the algorithm by Garland & Heckbert (1997)
 *
 * This worker runs mesh simplification in a separate thread to avoid blocking the UI.
 *
 * Message Protocol:
 * - Input: { positions: Float32Array, targetReduction: number }
 * - Output: { type: 'progress'|'complete'|'error', ... }
 */

// Quadric Error Metric class
class Quadric {
    constructor() {
        // Symmetric 4x4 matrix representation
        this.a11 = 0; this.a12 = 0; this.a13 = 0; this.a14 = 0;
        this.a22 = 0; this.a23 = 0; this.a24 = 0;
        this.a33 = 0; this.a34 = 0;
        this.a44 = 0;
    }

    fromPlane(a, b, c, d) {
        // Construct quadric from plane equation ax + by + cz + d = 0
        this.a11 = a * a; this.a12 = a * b; this.a13 = a * c; this.a14 = a * d;
        this.a22 = b * b; this.a23 = b * c; this.a24 = b * d;
        this.a33 = c * c; this.a34 = c * d;
        this.a44 = d * d;
    }

    add(q) {
        this.a11 += q.a11; this.a12 += q.a12; this.a13 += q.a13; this.a14 += q.a14;
        this.a22 += q.a22; this.a23 += q.a23; this.a24 += q.a24;
        this.a33 += q.a33; this.a34 += q.a34;
        this.a44 += q.a44;
    }

    copy(q) {
        this.a11 = q.a11; this.a12 = q.a12; this.a13 = q.a13; this.a14 = q.a14;
        this.a22 = q.a22; this.a23 = q.a23; this.a24 = q.a24;
        this.a33 = q.a33; this.a34 = q.a34;
        this.a44 = q.a44;
    }

    multiplyScalar(s) {
        this.a11 *= s; this.a12 *= s; this.a13 *= s; this.a14 *= s;
        this.a22 *= s; this.a23 *= s; this.a24 *= s;
        this.a33 *= s; this.a34 *= s;
        this.a44 *= s;
    }

    evaluate(x, y, z) {
        // Compute quadric error: [x y z 1] * Q * [x y z 1]^T
        return this.a11 * x * x + 2 * this.a12 * x * y + 2 * this.a13 * x * z + 2 * this.a14 * x
             + this.a22 * y * y + 2 * this.a23 * y * z + 2 * this.a24 * y
             + this.a33 * z * z + 2 * this.a34 * z
             + this.a44;
    }
}

// Simple Vector3 implementation (no dependency on Three.js)
class Vector3 {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    set(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }

    copy(v) {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z;
        return this;
    }

    subVectors(a, b) {
        this.x = a.x - b.x;
        this.y = a.y - b.y;
        this.z = a.z - b.z;
        return this;
    }

    addVectors(a, b) {
        this.x = a.x + b.x;
        this.y = a.y + b.y;
        this.z = a.z + b.z;
        return this;
    }

    multiplyScalar(s) {
        this.x *= s;
        this.y *= s;
        this.z *= s;
        return this;
    }

    crossVectors(a, b) {
        const ax = a.x, ay = a.y, az = a.z;
        const bx = b.x, by = b.y, bz = b.z;

        this.x = ay * bz - az * by;
        this.y = az * bx - ax * bz;
        this.z = ax * by - ay * bx;

        return this;
    }

    dot(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    normalize() {
        const len = this.length();
        if (len > 0) {
            this.multiplyScalar(1 / len);
        }
        return this;
    }
}

// Mesh Simplifier
class MeshSimplifier {
    constructor() {
        this.vertices = [];
        this.faces = [];
        this.edges = [];
        this.vertexQuadrics = [];
    }

    /**
     * Simplify mesh geometry
     * @param {Float32Array} positions - Vertex positions
     * @param {number} targetReduction - Fraction to reduce (0.0 to 1.0)
     * @param {function} progressCallback - Progress callback
     * @returns {Float32Array} Simplified positions
     */
    simplify(positions, targetReduction, progressCallback) {
        // Extract mesh data
        this.extractMeshData(positions);

        const originalFaceCount = this.faces.length;
        const targetFaceCount = Math.max(4, Math.floor(originalFaceCount * (1 - targetReduction)));

        console.log(`[Simplifier] Original faces: ${originalFaceCount}, Target faces: ${targetFaceCount}, Reduction: ${(targetReduction * 100).toFixed(0)}%`);
        progressCallback({ type: 'progress', progress: 0.05, message: `Target: ${targetFaceCount} faces (${(targetReduction * 100).toFixed(0)}% reduction)`, log: `[Simplifier] Original: ${originalFaceCount}, Target: ${targetFaceCount}` });

        progressCallback({ type: 'progress', progress: 0.1, message: 'Building edge structure...' });

        // Build edge list
        this.buildEdges();

        progressCallback({ type: 'progress', progress: 0.2, message: 'Computing quadric errors...' });

        // Compute quadric error metrics
        this.computeQuadrics();
        this.computeEdgeCosts();

        progressCallback({ type: 'progress', progress: 0.3, message: 'Collapsing edges...' });

        // Iteratively collapse edges
        let collapsed = 0;
        const maxIterations = originalFaceCount;
        let iteration = 0;

        // Helper function to count non-deleted faces
        const countActiveFaces = () => this.faces.filter(f => !f.deleted).length;

        let totalFacesDeleted = 0;
        const initialActiveFaces = countActiveFaces();
        console.log(`[Simplifier] Starting edge collapse loop. Initial active faces: ${initialActiveFaces}`);
        progressCallback({ type: 'progress', progress: 0.3, message: 'Collapsing edges...', log: `[Simplifier] Initial: ${initialActiveFaces} faces, Target: ${targetFaceCount}` });

        while (countActiveFaces() > targetFaceCount && iteration < maxIterations) {
            const facesBefore = countActiveFaces();

            const edge = this.getMinimumCostEdge();

            if (!edge || edge.cost === Infinity) {
                const msg = `[Simplifier] No more collapsible edges. Stopped at ${facesBefore} faces (target was ${targetFaceCount})`;
                console.log(msg);
                progressCallback({ type: 'progress', progress: 0.9, message: 'No more edges to collapse', log: msg });
                break;
            }

            // Add debug ID for first few collapses
            edge.debugId = collapsed;

            this.collapseEdge(edge);
            collapsed++;
            iteration++;

            const facesAfter = countActiveFaces();
            const facesDeletedThisIteration = facesBefore - facesAfter;
            totalFacesDeleted += facesDeletedThisIteration;

            // Log every 10 collapses for detailed tracking
            if (collapsed <= 10 || collapsed % 100 === 0) {
                const msg = `[Simplifier] Collapse #${collapsed}: Deleted ${facesDeletedThisIteration} faces (${facesAfter} remaining, avg ${(totalFacesDeleted / collapsed).toFixed(2)} faces/collapse)`;
                console.log(msg);
                progressCallback({ type: 'progress', progress: 0.3 + (0.6 * Math.min(1, collapsed / ((originalFaceCount - targetFaceCount) / 2))), message: `${collapsed} collapses...`, log: msg });
            }

            // Progress update every 100 collapses
            if (collapsed % 100 === 0) {
                const progress = 0.3 + (0.6 * (collapsed / (originalFaceCount - targetFaceCount)));
                const remaining = countActiveFaces();
                progressCallback({
                    type: 'progress',
                    progress: Math.min(0.9, progress),
                    message: `Collapsed ${collapsed} edges (${remaining} faces remaining)...`
                });
            }
        }

        const finalFaceCount = countActiveFaces();
        console.log(`[Simplifier] Collapsed ${collapsed} edges, Final faces: ${finalFaceCount} (target was ${targetFaceCount})`);

        progressCallback({ type: 'progress', progress: 0.95, message: 'Building output geometry...' });

        // Build new geometry
        const result = this.buildGeometry();

        return result;
    }

    extractMeshData(positions) {
        this.vertices = [];
        this.faces = [];

        const vertexMap = new Map();
        const getVertexIndex = (x, y, z) => {
            const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
            if (vertexMap.has(key)) {
                return vertexMap.get(key);
            }
            const index = this.vertices.length;
            this.vertices.push({
                position: new Vector3(x, y, z),
                faces: [],
                edges: [],
                quadric: null,
                deleted: false
            });
            vertexMap.set(key, index);
            return index;
        };

        // Extract faces
        for (let i = 0; i < positions.length; i += 9) {
            const v0 = getVertexIndex(positions[i], positions[i+1], positions[i+2]);
            const v1 = getVertexIndex(positions[i+3], positions[i+4], positions[i+5]);
            const v2 = getVertexIndex(positions[i+6], positions[i+7], positions[i+8]);

            // Skip degenerate faces
            if (v0 === v1 || v1 === v2 || v2 === v0) continue;

            const face = {
                vertices: [v0, v1, v2],
                deleted: false,
                normal: null,
                area: 0
            };

            this.computeFaceNormal(face);
            this.faces.push(face);

            const faceIndex = this.faces.length - 1;
            this.vertices[v0].faces.push(faceIndex);
            this.vertices[v1].faces.push(faceIndex);
            this.vertices[v2].faces.push(faceIndex);
        }

        console.log(`[Simplifier] extractMeshData: Extracted ${this.vertices.length} unique vertices, ${this.faces.length} faces from ${positions.length / 9} input triangles`);
    }

    computeFaceNormal(face) {
        const v0 = this.vertices[face.vertices[0]].position;
        const v1 = this.vertices[face.vertices[1]].position;
        const v2 = this.vertices[face.vertices[2]].position;

        const edge1 = new Vector3().subVectors(v1, v0);
        const edge2 = new Vector3().subVectors(v2, v0);

        face.normal = new Vector3().crossVectors(edge1, edge2);
        face.area = face.normal.length() / 2;

        if (face.area > 0.0001) {
            face.normal.normalize();
        }
    }

    buildEdges() {
        this.edges = [];
        const edgeMap = new Map();

        for (let f = 0; f < this.faces.length; f++) {
            const face = this.faces[f];
            if (face.deleted) continue;

            const pairs = [
                [face.vertices[0], face.vertices[1]],
                [face.vertices[1], face.vertices[2]],
                [face.vertices[2], face.vertices[0]]
            ];

            pairs.forEach(([v0, v1]) => {
                const key = v0 < v1 ? `${v0},${v1}` : `${v1},${v0}`;

                if (!edgeMap.has(key)) {
                    const edge = {
                        v0: Math.min(v0, v1),
                        v1: Math.max(v0, v1),
                        faces: [],
                        cost: 0,
                        target: null,
                        deleted: false
                    };
                    edgeMap.set(key, edge);
                    this.edges.push(edge);

                    this.vertices[v0].edges.push(edge);
                    this.vertices[v1].edges.push(edge);
                }

                edgeMap.get(key).faces.push(f);
            });
        }

        console.log(`[Simplifier] buildEdges: Built ${this.edges.length} edges`);
    }

    computeQuadrics() {
        // Initialize quadrics
        this.vertices.forEach(v => {
            v.quadric = new Quadric();
        });

        // Add contribution from each face
        this.faces.forEach(face => {
            if (face.deleted || !face.normal) return;

            const v0 = this.vertices[face.vertices[0]].position;
            const n = face.normal;
            const d = -n.dot(v0);

            const q = new Quadric();
            q.fromPlane(n.x, n.y, n.z, d);
            q.multiplyScalar(face.area);

            face.vertices.forEach(vIndex => {
                this.vertices[vIndex].quadric.add(q);
            });
        });
    }

    computeEdgeCosts() {
        this.edges.forEach(edge => {
            if (edge.deleted) return;

            const v0 = this.vertices[edge.v0];
            const v1 = this.vertices[edge.v1];

            if (v0.deleted || v1.deleted) {
                edge.cost = Infinity;
                return;
            }

            // Compute combined quadric
            const q = new Quadric();
            q.copy(v0.quadric);
            q.add(v1.quadric);

            // Use midpoint as target
            const target = new Vector3()
                .addVectors(v0.position, v1.position)
                .multiplyScalar(0.5);

            edge.target = target;
            edge.cost = q.evaluate(target.x, target.y, target.z);

            // Penalize boundary edges
            if (edge.faces.length < 2) {
                edge.cost *= 10;
            }
        });
    }

    getMinimumCostEdge() {
        let minEdge = null;
        let minCost = Infinity;

        for (const edge of this.edges) {
            if (edge.deleted) continue;
            if (this.vertices[edge.v0].deleted || this.vertices[edge.v1].deleted) continue;

            if (edge.cost < minCost) {
                minCost = edge.cost;
                minEdge = edge;
            }
        }

        return minEdge;
    }

    collapseEdge(edge) {
        const v0Index = edge.v0;
        const v1Index = edge.v1;
        const v0 = this.vertices[v0Index];
        const v1 = this.vertices[v1Index];

        // Move v0 to target position
        v0.position.copy(edge.target);

        // Update quadric
        v0.quadric.add(v1.quadric);

        // Count faces before deletion for debugging
        let facesDeletedByThisCollapse = 0;

        // First, we need to process faces that contain BOTH v0 and v1
        // These will become degenerate when we replace v1 with v0
        const sharedFaces = v0.faces.filter(fIdx => v1.faces.includes(fIdx));

        // DEBUG: Log the first few collapses in detail
        const debugCollapse = edge.debugId !== undefined && edge.debugId < 10;
        if (debugCollapse) {
            console.log(`[CollapseEdge] v0=${v0Index}, v1=${v1Index}, v0.faces=${v0.faces.length}, v1.faces=${v1.faces.length}, sharedFaces=${sharedFaces.length}`);
        }

        sharedFaces.forEach(fIndex => {
            if (!this.faces[fIndex].deleted) {
                this.faces[fIndex].deleted = true;
                facesDeletedByThisCollapse++;
            }
        });

        if (debugCollapse) {
            console.log(`[CollapseEdge] Deleted ${facesDeletedByThisCollapse} shared faces`);
        }

        // Now transfer faces from v1 to v0 (excluding already deleted ones)
        v1.faces.forEach(fIndex => {
            const face = this.faces[fIndex];
            if (face.deleted) return;

            // Replace v1 with v0 in this face
            for (let i = 0; i < 3; i++) {
                if (face.vertices[i] === v1Index) {
                    face.vertices[i] = v0Index;
                }
            }

            // Update normal
            this.computeFaceNormal(face);
            if (!v0.faces.includes(fIndex)) {
                v0.faces.push(fIndex);
            }
        });

        // Mark v1 as deleted
        v1.deleted = true;
        edge.deleted = true;

        // Update costs of affected edges
        const affectedVertices = new Set([v0Index]);
        v0.faces.forEach(fIndex => {
            const face = this.faces[fIndex];
            if (!face.deleted) {
                face.vertices.forEach(vIndex => affectedVertices.add(vIndex));
            }
        });

        affectedVertices.forEach(vIndex => {
            const vertex = this.vertices[vIndex];
            if (vertex.deleted) return;

            vertex.edges.forEach(e => {
                if (e.deleted) return;

                const otherIndex = e.v0 === vIndex ? e.v1 : e.v0;
                const other = this.vertices[otherIndex];

                if (other.deleted) {
                    e.deleted = true;
                    return;
                }

                // Recompute cost
                const q = new Quadric();
                q.copy(vertex.quadric);
                q.add(other.quadric);

                const target = new Vector3()
                    .addVectors(vertex.position, other.position)
                    .multiplyScalar(0.5);

                e.target = target;
                e.cost = q.evaluate(target.x, target.y, target.z);

                // Count non-deleted faces for this edge
                const activeFaceCount = e.faces.filter(fIdx => !this.faces[fIdx].deleted).length;
                if (activeFaceCount < 2) {
                    e.cost *= 10;
                }
            });
        });
    }

    buildGeometry() {
        const positions = [];
        const vertexMap = new Map();
        let newIndex = 0;

        // Build vertex map
        this.vertices.forEach((vertex, oldIndex) => {
            if (!vertex.deleted && vertex.faces.some(f => !this.faces[f].deleted)) {
                vertexMap.set(oldIndex, newIndex++);
            }
        });

        // Build faces
        this.faces.forEach(face => {
            if (face.deleted) return;

            const v0 = vertexMap.get(face.vertices[0]);
            const v1 = vertexMap.get(face.vertices[1]);
            const v2 = vertexMap.get(face.vertices[2]);

            if (v0 === undefined || v1 === undefined || v2 === undefined) return;
            if (v0 === v1 || v1 === v2 || v2 === v0) return;

            const p0 = this.vertices[face.vertices[0]].position;
            const p1 = this.vertices[face.vertices[1]].position;
            const p2 = this.vertices[face.vertices[2]].position;

            positions.push(p0.x, p0.y, p0.z);
            positions.push(p1.x, p1.y, p1.z);
            positions.push(p2.x, p2.y, p2.z);
        });

        const outputFaceCount = positions.length / 9;
        console.log(`[Simplifier] buildGeometry: Output ${outputFaceCount} faces from ${positions.length / 3} vertices`);

        return new Float32Array(positions);
    }
}

// Worker message handler
self.onmessage = function(e) {
    const { positions, targetReduction } = e.data;

    try {
        const simplifier = new MeshSimplifier();

        const result = simplifier.simplify(
            positions,
            targetReduction,
            (update) => {
                // Send progress updates
                self.postMessage(update);
            }
        );

        // Send completion
        self.postMessage({
            type: 'complete',
            positions: result,
            originalFaces: positions.length / 9,
            simplifiedFaces: result.length / 9
        }, [result.buffer]); // Transfer ownership for performance

    } catch (error) {
        // Send error
        self.postMessage({
            type: 'error',
            message: error.message,
            stack: error.stack
        });
    }
};
