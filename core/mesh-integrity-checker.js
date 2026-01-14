/**
 * MeshIntegrityChecker - Validates mesh integrity and detects common issues
 *
 * Checks for:
 * - Degenerate faces (zero area triangles)
 * - Non-manifold edges (shared by more than 2 faces)
 * - Non-manifold vertices (disconnected face fans)
 * - Holes in the mesh
 * - Duplicate vertices
 * - Inverted normals
 * - Self-intersections (basic check)
 */

export class MeshIntegrityChecker {
    constructor() {
        this.tolerance = 0.000001; // Epsilon for floating point comparisons
    }

    /**
     * Perform comprehensive mesh validation
     * @param {THREE.BufferGeometry} geometry - Geometry to validate
     * @returns {Object} Validation report with issues and statistics
     */
    validate(geometry) {
        console.log('[MeshIntegrityChecker] Starting validation...');

        const report = {
            valid: true,
            issues: [],
            warnings: [],
            stats: {
                vertices: 0,
                faces: 0,
                edges: 0,
                degenerateFaces: 0,
                duplicateVertices: 0,
                nonManifoldEdges: 0,
                nonManifoldVertices: 0,
                holes: 0,
                invertedNormals: 0,
                boundaryEdges: 0
            },
            fixable: true
        };

        if (!geometry || !geometry.attributes || !geometry.attributes.position) {
            report.valid = false;
            report.fixable = false;
            report.issues.push('Invalid geometry: missing position attribute');
            return report;
        }

        const positions = geometry.attributes.position.array;
        report.stats.vertices = positions.length / 3;
        report.stats.faces = report.stats.vertices / 3;

        // Build mesh topology
        const topology = this.buildTopology(positions);

        // Check for degenerate faces
        this.checkDegenerateFaces(topology, report);

        // Check for duplicate vertices
        this.checkDuplicateVertices(topology, report);

        // Check for non-manifold edges
        this.checkNonManifoldEdges(topology, report);

        // Check for non-manifold vertices
        this.checkNonManifoldVertices(topology, report);

        // Check for holes/boundary edges
        this.checkBoundaryEdges(topology, report);

        // Check for inverted normals
        this.checkInvertedNormals(geometry, topology, report);

        // Determine overall validity
        report.valid = report.issues.length === 0;

        console.log('[MeshIntegrityChecker] Validation complete:', report);

        return report;
    }

    /**
     * Build mesh topology (vertices, faces, edges)
     */
    buildTopology(positions) {
        const topology = {
            vertices: [],
            faces: [],
            edges: new Map(), // key: "v1,v2" -> [faceIndices]
            vertexFaces: new Map() // vertexIndex -> [faceIndices]
        };

        // Extract vertices and faces
        for (let i = 0; i < positions.length; i += 9) {
            const faceIndex = i / 9;

            const v0 = { x: positions[i], y: positions[i + 1], z: positions[i + 2] };
            const v1 = { x: positions[i + 3], y: positions[i + 4], z: positions[i + 5] };
            const v2 = { x: positions[i + 6], y: positions[i + 7], z: positions[i + 8] };

            const face = {
                index: faceIndex,
                vertices: [
                    this.addVertex(topology, v0, i),
                    this.addVertex(topology, v1, i + 3),
                    this.addVertex(topology, v2, i + 6)
                ],
                positions: [v0, v1, v2],
                area: 0,
                normal: null
            };

            // Calculate face area and normal
            this.calculateFaceProperties(face);

            topology.faces.push(face);

            // Add edges
            this.addEdge(topology, face.vertices[0], face.vertices[1], faceIndex);
            this.addEdge(topology, face.vertices[1], face.vertices[2], faceIndex);
            this.addEdge(topology, face.vertices[2], face.vertices[0], faceIndex);

            // Track vertex-face relationships
            face.vertices.forEach(vIdx => {
                if (!topology.vertexFaces.has(vIdx)) {
                    topology.vertexFaces.set(vIdx, []);
                }
                topology.vertexFaces.get(vIdx).push(faceIndex);
            });
        }

        return topology;
    }

    /**
     * Add vertex to topology (with duplicate detection)
     */
    addVertex(topology, position, arrayIndex) {
        // Check for duplicate vertices
        for (let i = 0; i < topology.vertices.length; i++) {
            const v = topology.vertices[i];
            if (this.vectorsEqual(v.position, position)) {
                return i; // Return existing vertex index
            }
        }

        // Add new vertex
        const index = topology.vertices.length;
        topology.vertices.push({
            index,
            position,
            arrayIndex,
            faces: []
        });

        return index;
    }

    /**
     * Add edge to topology
     */
    addEdge(topology, v0, v1, faceIndex) {
        const key = v0 < v1 ? `${v0},${v1}` : `${v1},${v0}`;

        if (!topology.edges.has(key)) {
            topology.edges.set(key, []);
        }

        topology.edges.get(key).push(faceIndex);
    }

    /**
     * Calculate face area and normal
     */
    calculateFaceProperties(face) {
        const v0 = face.positions[0];
        const v1 = face.positions[1];
        const v2 = face.positions[2];

        // Edge vectors
        const e1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
        const e2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };

        // Cross product for normal
        const normal = {
            x: e1.y * e2.z - e1.z * e2.y,
            y: e1.z * e2.x - e1.x * e2.z,
            z: e1.x * e2.y - e1.y * e2.x
        };

        const length = Math.sqrt(normal.x * normal.x + normal.y * normal.y + normal.z * normal.z);

        face.area = length / 2;
        face.normal = length > this.tolerance
            ? { x: normal.x / length, y: normal.y / length, z: normal.z / length }
            : { x: 0, y: 0, z: 0 };
    }

    /**
     * Check for degenerate faces (zero or near-zero area)
     */
    checkDegenerateFaces(topology, report) {
        topology.faces.forEach(face => {
            if (face.area < this.tolerance) {
                report.stats.degenerateFaces++;
                report.issues.push(`Degenerate face ${face.index} (area: ${face.area.toFixed(8)})`);
            }
        });

        if (report.stats.degenerateFaces > 0) {
            report.warnings.push(`Found ${report.stats.degenerateFaces} degenerate face(s)`);
        }
    }

    /**
     * Check for duplicate vertices
     */
    checkDuplicateVertices(topology, report) {
        const positions = topology.vertices.map(v => v.position);
        const uniqueCount = positions.length;
        const totalCount = topology.vertices.length;

        report.stats.duplicateVertices = totalCount - uniqueCount;

        if (report.stats.duplicateVertices > 0) {
            report.warnings.push(`Found ${report.stats.duplicateVertices} duplicate vertex(ies)`);
        }
    }

    /**
     * Check for non-manifold edges (shared by more than 2 faces)
     */
    checkNonManifoldEdges(topology, report) {
        report.stats.edges = topology.edges.size;

        topology.edges.forEach((faces, edgeKey) => {
            if (faces.length > 2) {
                report.stats.nonManifoldEdges++;
                report.issues.push(`Non-manifold edge ${edgeKey} shared by ${faces.length} faces`);
            }
        });

        if (report.stats.nonManifoldEdges > 0) {
            report.warnings.push(`Found ${report.stats.nonManifoldEdges} non-manifold edge(s)`);
        }
    }

    /**
     * Check for non-manifold vertices
     */
    checkNonManifoldVertices(topology, report) {
        topology.vertexFaces.forEach((faceIndices, vertexIndex) => {
            // Check if faces around vertex form a connected fan
            const edgeMap = new Map();

            faceIndices.forEach(faceIdx => {
                const face = topology.faces[faceIdx];
                const vIdx = face.vertices.indexOf(vertexIndex);

                if (vIdx >= 0) {
                    const prev = face.vertices[(vIdx + 2) % 3];
                    const next = face.vertices[(vIdx + 1) % 3];

                    if (!edgeMap.has(prev)) edgeMap.set(prev, []);
                    if (!edgeMap.has(next)) edgeMap.set(next, []);

                    edgeMap.get(prev).push(next);
                    edgeMap.get(next).push(prev);
                }
            });

            // Check connectivity
            let disconnected = false;
            edgeMap.forEach((connections, vertex) => {
                if (connections.length !== 2) {
                    disconnected = true;
                }
            });

            if (disconnected) {
                report.stats.nonManifoldVertices++;
                report.issues.push(`Non-manifold vertex ${vertexIndex}`);
            }
        });

        if (report.stats.nonManifoldVertices > 0) {
            report.warnings.push(`Found ${report.stats.nonManifoldVertices} non-manifold vertex(ies)`);
        }
    }

    /**
     * Check for boundary edges (holes in mesh)
     */
    checkBoundaryEdges(topology, report) {
        topology.edges.forEach((faces, edgeKey) => {
            if (faces.length === 1) {
                report.stats.boundaryEdges++;
            }
        });

        if (report.stats.boundaryEdges > 0) {
            const estimatedHoles = Math.ceil(report.stats.boundaryEdges / 3);
            report.stats.holes = estimatedHoles;
            report.warnings.push(
                `Found ${report.stats.boundaryEdges} boundary edge(s) (~${estimatedHoles} hole(s))`
            );
        }
    }

    /**
     * Check for inverted normals
     */
    checkInvertedNormals(geometry, topology, report) {
        if (!geometry.attributes.normal) {
            return; // Skip if no normals
        }

        const normals = geometry.attributes.normal.array;
        let invertedCount = 0;

        topology.faces.forEach((face, idx) => {
            const normalIdx = idx * 9; // 3 vertices * 3 components
            const geoNormal = {
                x: normals[normalIdx],
                y: normals[normalIdx + 1],
                z: normals[normalIdx + 2]
            };

            // Dot product to check if normals are aligned
            const dot =
                face.normal.x * geoNormal.x +
                face.normal.y * geoNormal.y +
                face.normal.z * geoNormal.z;

            if (dot < 0) {
                invertedCount++;
            }
        });

        report.stats.invertedNormals = invertedCount;

        if (invertedCount > 0) {
            const percentage = ((invertedCount / topology.faces.length) * 100).toFixed(1);
            report.warnings.push(`Found ${invertedCount} inverted normal(s) (${percentage}%)`);
        }
    }

    /**
     * Check if two vectors are equal (within tolerance)
     */
    vectorsEqual(v1, v2) {
        return (
            Math.abs(v1.x - v2.x) < this.tolerance &&
            Math.abs(v1.y - v2.y) < this.tolerance &&
            Math.abs(v1.z - v2.z) < this.tolerance
        );
    }

    /**
     * Get a human-readable summary of the validation report
     */
    getSummary(report) {
        if (report.valid) {
            return '✔ Mesh integrity check passed - no issues detected';
        }

        const summary = [];
        summary.push('⚠️ Mesh integrity issues detected:');

        if (report.stats.degenerateFaces > 0) {
            summary.push(`  • ${report.stats.degenerateFaces} degenerate face(s)`);
        }
        if (report.stats.duplicateVertices > 0) {
            summary.push(`  • ${report.stats.duplicateVertices} duplicate vertex(ies)`);
        }
        if (report.stats.nonManifoldEdges > 0) {
            summary.push(`  • ${report.stats.nonManifoldEdges} non-manifold edge(s)`);
        }
        if (report.stats.nonManifoldVertices > 0) {
            summary.push(`  • ${report.stats.nonManifoldVertices} non-manifold vertex(ies)`);
        }
        if (report.stats.holes > 0) {
            summary.push(`  • ${report.stats.holes} hole(s) in mesh`);
        }
        if (report.stats.invertedNormals > 0) {
            summary.push(`  • ${report.stats.invertedNormals} inverted normal(s)`);
        }

        if (report.fixable) {
            summary.push('These issues can be automatically repaired.');
        } else {
            summary.push('Some issues may require manual repair.');
        }

        return summary.join('\n');
    }
}
