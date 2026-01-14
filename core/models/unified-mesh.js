/**
 * UnifiedMesh - Internal mesh representation compatible with all formats
 * Provides a standardized interface for mesh data from STL, OBJ, PLY, GLTF/GLB
 */
export class UnifiedMesh {
    constructor() {
        // Core geometry (always present)
        this.vertices = [];        // [[x,y,z], ...] Float array
        this.faces = [];          // [[i1,i2,i3], ...] Index triads
        this.normals = null;      // [[nx,ny,nz], ...] Optional, computed if missing

        // Metadata
        this.sourceFormat = '';   // 'STL' | 'OBJ' | 'PLY' | 'GLTF' | 'GLB'
        this.originalFileName = '';
        this.faceCount = 0;
        this.vertexCount = 0;

        // Integrity info
        this.isManifold = null;   // true/false/null (not checked)
        this.hasHoles = false;
        this.hasDegenerateFaces = false;

        // Bounds
        this.boundingBox = {
            min: [Infinity, Infinity, Infinity],
            max: [-Infinity, -Infinity, -Infinity]
        };

        // Import timestamp
        this.importedAt = Date.now();
    }

    /**
     * Create from Three.js BufferGeometry
     */
    static fromBufferGeometry(geometry, sourceFormat = 'UNKNOWN', fileName = '') {
        const mesh = new UnifiedMesh();
        mesh.sourceFormat = sourceFormat;
        mesh.originalFileName = fileName;

        const positions = geometry.attributes.position.array;
        const indices = geometry.index ? geometry.index.array : null;

        // Extract vertices
        for (let i = 0; i < positions.length; i += 3) {
            mesh.vertices.push([
                positions[i],
                positions[i + 1],
                positions[i + 2]
            ]);
        }
        mesh.vertexCount = mesh.vertices.length;

        // Extract faces
        if (indices) {
            for (let i = 0; i < indices.length; i += 3) {
                mesh.faces.push([
                    indices[i],
                    indices[i + 1],
                    indices[i + 2]
                ]);
            }
        } else {
            // Non-indexed geometry
            for (let i = 0; i < mesh.vertexCount; i += 3) {
                mesh.faces.push([i, i + 1, i + 2]);
            }
        }
        mesh.faceCount = mesh.faces.length;

        // Extract or compute normals
        if (geometry.attributes.normal) {
            const normals = geometry.attributes.normal.array;
            mesh.normals = [];
            for (let i = 0; i < normals.length; i += 3) {
                mesh.normals.push([
                    normals[i],
                    normals[i + 1],
                    normals[i + 2]
                ]);
            }
        } else {
            mesh.computeNormals();
        }

        mesh.computeBounds();
        return mesh;
    }

    /**
     * Convert to Three.js BufferGeometry
     */
    toBufferGeometry() {
        const geometry = new THREE.BufferGeometry();

        // Flatten vertices
        const positions = new Float32Array(this.vertices.flat());
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        // Flatten faces
        const indices = new Uint32Array(this.faces.flat());
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));

        // Add normals if available
        if (this.normals) {
            const normals = new Float32Array(this.normals.flat());
            geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        } else {
            geometry.computeVertexNormals();
        }

        return geometry;
    }

    /**
     * Compute face normals
     */
    computeNormals() {
        this.normals = new Array(this.vertices.length).fill(null).map(() => [0, 0, 0]);

        this.faces.forEach(face => {
            const [i1, i2, i3] = face;
            const v1 = this.vertices[i1];
            const v2 = this.vertices[i2];
            const v3 = this.vertices[i3];

            // Compute face normal
            const u = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
            const v = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];

            const normal = [
                u[1] * v[2] - u[2] * v[1],
                u[2] * v[0] - u[0] * v[2],
                u[0] * v[1] - u[1] * v[0]
            ];

            // Normalize
            const length = Math.sqrt(normal[0]**2 + normal[1]**2 + normal[2]**2);
            if (length > 0) {
                normal[0] /= length;
                normal[1] /= length;
                normal[2] /= length;
            }

            // Accumulate to vertex normals
            [i1, i2, i3].forEach(idx => {
                this.normals[idx][0] += normal[0];
                this.normals[idx][1] += normal[1];
                this.normals[idx][2] += normal[2];
            });
        });

        // Normalize vertex normals
        this.normals = this.normals.map(n => {
            const length = Math.sqrt(n[0]**2 + n[1]**2 + n[2]**2);
            return length > 0 ? [n[0]/length, n[1]/length, n[2]/length] : [0, 0, 1];
        });
    }

    /**
     * Compute bounding box
     */
    computeBounds() {
        this.boundingBox.min = [Infinity, Infinity, Infinity];
        this.boundingBox.max = [-Infinity, -Infinity, -Infinity];

        this.vertices.forEach(v => {
            this.boundingBox.min[0] = Math.min(this.boundingBox.min[0], v[0]);
            this.boundingBox.min[1] = Math.min(this.boundingBox.min[1], v[1]);
            this.boundingBox.min[2] = Math.min(this.boundingBox.min[2], v[2]);

            this.boundingBox.max[0] = Math.max(this.boundingBox.max[0], v[0]);
            this.boundingBox.max[1] = Math.max(this.boundingBox.max[1], v[1]);
            this.boundingBox.max[2] = Math.max(this.boundingBox.max[2], v[2]);
        });
    }

    /**
     * Get size
     */
    getSize() {
        return [
            this.boundingBox.max[0] - this.boundingBox.min[0],
            this.boundingBox.max[1] - this.boundingBox.min[1],
            this.boundingBox.max[2] - this.boundingBox.min[2]
        ];
    }

    /**
     * Serialize for JSON
     */
    toJSON() {
        return {
            vertices: this.vertices,
            faces: this.faces,
            normals: this.normals,
            sourceFormat: this.sourceFormat,
            originalFileName: this.originalFileName,
            faceCount: this.faceCount,
            vertexCount: this.vertexCount,
            boundingBox: this.boundingBox,
            isManifold: this.isManifold,
            hasHoles: this.hasHoles,
            hasDegenerateFaces: this.hasDegenerateFaces,
            importedAt: this.importedAt
        };
    }

    /**
     * Create from JSON
     */
    static fromJSON(data) {
        const mesh = new UnifiedMesh();
        Object.assign(mesh, data);
        return mesh;
    }

    /**
     * Clone this mesh
     */
    clone() {
        return UnifiedMesh.fromJSON(this.toJSON());
    }

    /**
     * Get memory size estimate in bytes
     */
    getMemorySize() {
        // Rough estimate: vertices + faces + normals
        const vertexBytes = this.vertices.length * 3 * 8; // 8 bytes per float64
        const faceBytes = this.faces.length * 3 * 4; // 4 bytes per int32
        const normalBytes = this.normals ? this.normals.length * 3 * 8 : 0;
        return vertexBytes + faceBytes + normalBytes;
    }
}
