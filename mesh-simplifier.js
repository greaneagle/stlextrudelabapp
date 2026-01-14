// Mesh Simplification using Quadric Error Metrics (QEM)
// Based on the algorithm by Garland & Heckbert (1997)

class MeshSimplifier {
    constructor() {
        this.vertices = [];
        this.faces = [];
        this.edges = [];
        this.vertexQuadrics = [];
    }
    
    /**
     * Simplify a BufferGeometry by reducing triangle count
     * @param {THREE.BufferGeometry} geometry - Input geometry
     * @param {number} targetReduction - Fraction of faces to remove (0.0 to 1.0)
     * @returns {THREE.BufferGeometry} Simplified geometry
     */
    simplify(geometry, targetReduction) {
        console.log('Starting mesh simplification...');
        
        // Extract mesh data
        this.extractMeshData(geometry);
        
        const originalFaceCount = this.faces.length;
        const targetFaceCount = Math.max(4, Math.floor(originalFaceCount * (1 - targetReduction)));
        
        console.log(`Original faces: ${originalFaceCount}, Target: ${targetFaceCount}`);
        
        // Build edge list
        this.buildEdges();
        
        // Compute quadric error metrics for each vertex
        this.computeQuadrics();
        
        // Compute error for each edge collapse
        this.computeEdgeCosts();
        
        // Iteratively collapse edges with lowest error
        let collapsed = 0;
        const maxIterations = originalFaceCount;
        let iteration = 0;

        // Helper function to count non-deleted faces
        const countActiveFaces = () => this.faces.filter(f => !f.deleted).length;

        while (countActiveFaces() > targetFaceCount && iteration < maxIterations) {
            const edge = this.getMinimumCostEdge();

            if (!edge || edge.cost === Infinity) {
                console.log('No more collapsible edges');
                break;
            }

            this.collapseEdge(edge);
            collapsed++;
            iteration++;

            // Progress update
            if (collapsed % 100 === 0) {
                console.log(`Collapsed ${collapsed} edges, ${countActiveFaces()} faces remaining`);
            }
        }
        
        const finalFaceCount = countActiveFaces();
        console.log(`Simplification complete: ${originalFaceCount} -> ${finalFaceCount} faces`);
        console.log(`Reduction: ${((1 - finalFaceCount / originalFaceCount) * 100).toFixed(1)}%`);
        
        // Build new geometry
        return this.buildGeometry();
    }
    
    extractMeshData(geometry) {
        const positions = geometry.attributes.position.array;
        this.vertices = [];
        this.faces = [];
        
        // Extract vertices (with duplicate handling)
        const vertexMap = new Map();
        const getVertexIndex = (x, y, z) => {
            const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
            if (vertexMap.has(key)) {
                return vertexMap.get(key);
            }
            const index = this.vertices.length;
            this.vertices.push({
                position: new THREE.Vector3(x, y, z),
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
        
        console.log(`Extracted ${this.vertices.length} unique vertices, ${this.faces.length} faces`);
    }
    
    computeFaceNormal(face) {
        const v0 = this.vertices[face.vertices[0]].position;
        const v1 = this.vertices[face.vertices[1]].position;
        const v2 = this.vertices[face.vertices[2]].position;
        
        const edge1 = new THREE.Vector3().subVectors(v1, v0);
        const edge2 = new THREE.Vector3().subVectors(v2, v0);
        
        face.normal = new THREE.Vector3().crossVectors(edge1, edge2);
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
        
        console.log(`Built ${this.edges.length} edges`);
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
            
            // Add weighted by area
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
            
            // Find optimal position (simplified: use midpoint)
            const target = new THREE.Vector3()
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

        // First, we need to process faces that contain BOTH v0 and v1
        // These will become degenerate when we replace v1 with v0
        const sharedFaces = v0.faces.filter(fIdx => v1.faces.includes(fIdx));
        sharedFaces.forEach(fIndex => {
            if (!this.faces[fIndex].deleted) {
                this.faces[fIndex].deleted = true;
            }
        });

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
        
        // Mark edge as deleted
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
                
                const target = new THREE.Vector3()
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
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        
        return geometry;
    }
}

// Quadric Error Metric class
class Quadric {
    constructor() {
        // Represents the matrix:
        // [ a11 a12 a13 a14 ]
        // [ a12 a22 a23 a24 ]
        // [ a13 a23 a33 a34 ]
        // [ a14 a24 a34 a44 ]
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

// ES module exports
export { MeshSimplifier, Quadric };
