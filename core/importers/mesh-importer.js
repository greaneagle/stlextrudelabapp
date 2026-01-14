import { UnifiedMesh } from '../models/unified-mesh.js';

/**
 * MeshImporter - Universal mesh importer supporting multiple 3D file formats
 * Handles STL, OBJ, PLY, GLTF, and GLB formats
 */
export class MeshImporter {
    constructor(app) {
        this.app = app;
        this.supportedFormats = ['stl', 'obj', 'ply', 'gltf', 'glb'];
    }

    /**
     * Detect file format from filename
     */
    detectFormat(file) {
        const ext = file.name.split('.').pop().toLowerCase();

        if (this.supportedFormats.includes(ext)) {
            return ext;
        }

        // Fallback: attempt to detect by file header (basic detection)
        // More sophisticated detection could be added here
        return null;
    }

    /**
     * Import file and return UnifiedMesh
     */
    async import(file) {
        const format = this.detectFormat(file);

        if (!format) {
            throw new Error(`Unsupported file format: ${file.name}`);
        }

        // Note: Loading indicator is now managed by caller (app.js)
        // This allows better control over loading state across the entire load process

        try {
            let geometry;

            switch(format) {
                case 'stl':
                    geometry = await this.importSTL(file);
                    break;
                case 'obj':
                    geometry = await this.importOBJ(file);
                    break;
                case 'ply':
                    geometry = await this.importPLY(file);
                    break;
                case 'gltf':
                case 'glb':
                    geometry = await this.importGLTF(file);
                    break;
                default:
                    throw new Error(`Format not implemented: ${format}`);
            }

            // Convert to unified mesh
            const mesh = UnifiedMesh.fromBufferGeometry(
                geometry,
                format.toUpperCase(),
                file.name
            );

            // Validate
            this.validateMesh(mesh);

            // Cleanup temporary geometry
            geometry.dispose();

            return mesh;

        } catch (error) {
            throw error;
        }
    }

    /**
     * Import STL file
     */
    async importSTL(file) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.STLLoader();
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const geometry = loader.parse(e.target.result);
                    geometry.computeVertexNormals();
                    resolve(geometry);
                } catch (error) {
                    reject(new Error(`STL parse error: ${error.message}`));
                }
            };

            reader.onerror = () => reject(new Error('Failed to read STL file'));

            // STL can be binary or ASCII
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Import OBJ file
     */
    async importOBJ(file) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.OBJLoader();
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const obj = loader.parse(e.target.result);

                    // OBJ can have multiple meshes - collect all geometries
                    const geometries = [];
                    obj.traverse(child => {
                        if (child.isMesh && child.geometry) {
                            // Convert to non-indexed if needed for consistent handling
                            let geom = child.geometry;
                            if (geom.index !== null) {
                                geom = geom.toNonIndexed();
                            }
                            geometries.push(geom);
                        }
                    });

                    if (geometries.length === 0) {
                        reject(new Error('OBJ contains no geometry'));
                        return;
                    }

                    // Merge all geometries into one
                    let merged;
                    if (geometries.length === 1) {
                        merged = geometries[0];
                    } else {
                        merged = THREE.BufferGeometryUtils.mergeGeometries(geometries, false);
                    }

                    // Cleanup individual geometries if we merged
                    if (geometries.length > 1) {
                        geometries.forEach(g => g.dispose());
                    }

                    // Cleanup OBJ scene
                    obj.traverse(child => {
                        if (child.geometry) child.geometry.dispose();
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(m => m.dispose());
                            } else {
                                child.material.dispose();
                            }
                        }
                    });

                    merged.computeVertexNormals();
                    resolve(merged);

                } catch (error) {
                    reject(new Error(`OBJ parse error: ${error.message}`));
                }
            };

            reader.onerror = () => reject(new Error('Failed to read OBJ file'));
            reader.readAsText(file);
        });
    }

    /**
     * Import PLY file
     */
    async importPLY(file) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.PLYLoader();
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const geometry = loader.parse(e.target.result);

                    // Check if it has faces (not just point cloud)
                    if (!geometry.index && geometry.attributes.position.count < 3) {
                        reject(new Error('PLY file is point-cloud only (no faces)'));
                        return;
                    }

                    // Ensure we have normals
                    if (!geometry.attributes.normal) {
                        geometry.computeVertexNormals();
                    }

                    resolve(geometry);

                } catch (error) {
                    reject(new Error(`PLY parse error: ${error.message}`));
                }
            };

            reader.onerror = () => reject(new Error('Failed to read PLY file'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Import GLTF/GLB file
     */
    async importGLTF(file) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.GLTFLoader();
            const reader = new FileReader();

            reader.onload = (e) => {
                const arrayBuffer = e.target.result;

                loader.parse(arrayBuffer, '', (gltf) => {
                    try {
                        // Extract all meshes from GLTF scene
                        const geometries = [];
                        gltf.scene.traverse(child => {
                            if (child.isMesh && child.geometry) {
                                let geom = child.geometry;
                                // Convert to non-indexed for consistent handling
                                if (geom.index !== null) {
                                    geom = geom.toNonIndexed();
                                }
                                geometries.push(geom);
                            }
                        });

                        if (geometries.length === 0) {
                            reject(new Error('GLTF contains no geometry'));
                            return;
                        }

                        // Merge geometries
                        let merged;
                        if (geometries.length === 1) {
                            merged = geometries[0];
                        } else {
                            merged = THREE.BufferGeometryUtils.mergeGeometries(geometries, false);
                        }

                        // Cleanup individual geometries if we merged
                        if (geometries.length > 1) {
                            geometries.forEach(g => g.dispose());
                        }

                        // Cleanup GLTF scene
                        gltf.scene.traverse(child => {
                            if (child.geometry) child.geometry.dispose();
                            if (child.material) {
                                if (Array.isArray(child.material)) {
                                    child.material.forEach(m => m.dispose());
                                } else {
                                    child.material.dispose();
                                }
                            }
                        });

                        merged.computeVertexNormals();
                        resolve(merged);

                    } catch (error) {
                        reject(new Error(`GLTF processing error: ${error.message}`));
                    }
                }, (error) => {
                    reject(new Error(`GLTF parse error: ${error.message}`));
                });
            };

            reader.onerror = () => reject(new Error('Failed to read GLTF file'));
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Validate imported mesh
     */
    validateMesh(mesh) {
        if (mesh.faceCount === 0) {
            throw new Error('Mesh has no faces');
        }

        if (mesh.vertexCount === 0) {
            throw new Error('Mesh has no vertices');
        }

        // Check for NaN/Infinity
        for (const vertex of mesh.vertices) {
            if (!isFinite(vertex[0]) || !isFinite(vertex[1]) || !isFinite(vertex[2])) {
                throw new Error('Mesh contains invalid vertex coordinates');
            }
        }

        // Check for degenerate bounding box
        const size = mesh.getSize();
        if (size[0] === 0 && size[1] === 0 && size[2] === 0) {
            throw new Error('Mesh has zero size (all vertices at same point)');
        }

        if (this.app.log) {
            this.app.log(`✓ Validated: ${mesh.faceCount} faces, ${mesh.vertexCount} vertices`);
            this.app.log(`  Format: ${mesh.sourceFormat}, Size: [${size[0].toFixed(2)}, ${size[1].toFixed(2)}, ${size[2].toFixed(2)}]`);
        }
    }

    /**
     * Get list of supported formats
     */
    getSupportedFormats() {
        return [...this.supportedFormats];
    }

    /**
     * Check if format is supported
     */
    isFormatSupported(format) {
        return this.supportedFormats.includes(format.toLowerCase());
    }
}
