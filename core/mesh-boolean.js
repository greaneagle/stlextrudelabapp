/**
 * Mesh Boolean Operations using CSG
 *
 * This module provides robust boolean operations (union, subtract, intersect)
 * for Three.js meshes using a CSG library. It handles the conversion between
 * Three.js geometry and the CSG representation, and produces watertight,
 * manifold meshes suitable for 3D printing.
 *
 * This is especially important for curved regions and holes, where manual
 * vertex welding and degenerate face removal can destroy valid geometry.
 */

import { GeometryUtils } from '../geometry-utils.js';

class MeshBoolean {
    /**
     * Perform a union operation between two meshes
     * @param {THREE.Mesh} meshA - First mesh
     * @param {THREE.Mesh} meshB - Second mesh
     * @param {Object} options - Options for the operation
     * @returns {THREE.Mesh} - Result mesh with unified geometry
     */
    static union(meshA, meshB, options = {}) {
        console.log('[MeshBoolean] Performing union operation...');

        // Validate inputs
        if (!meshA || !meshB) {
            throw new Error('Both meshes must be provided');
        }

        if (!meshA.geometry || !meshB.geometry) {
            throw new Error('Both meshes must have valid geometry');
        }

        try {
            // Check if CSG library is available
            if (typeof CSGJS === 'undefined') {
                console.warn('[MeshBoolean] CSG library not available, falling back to manual merge');
                return this._fallbackMerge(meshA, meshB);
            }

            const startTime = performance.now();

            // Convert meshes to CSG format
            console.log('  Converting meshes to CSG...');
            const csgA = this._meshToCSG(meshA);
            const csgB = this._meshToCSG(meshB);

            // Perform union
            console.log('  Computing union...');
            const resultCSG = csgA.union(csgB);

            // Convert back to Three.js mesh
            console.log('  Converting back to Three.js...');
            const resultMesh = this._csgToMesh(resultCSG, meshA.material);

            const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`[MeshBoolean] Union complete in ${elapsed}s`);
            console.log(`  Result: ${resultMesh.geometry.attributes.position.count} vertices`);

            return resultMesh;

        } catch (error) {
            console.error('[MeshBoolean] CSG operation failed:', error);
            console.warn('  Falling back to manual merge');
            return this._fallbackMerge(meshA, meshB);
        }
    }

    /**
     * Perform a subtraction operation (A - B)
     * @param {THREE.Mesh} meshA - Base mesh
     * @param {THREE.Mesh} meshB - Mesh to subtract
     * @returns {THREE.Mesh} - Result mesh
     */
    static subtract(meshA, meshB) {
        console.log('[MeshBoolean] Performing subtract operation...');

        try {
            if (typeof CSGJS === 'undefined') {
                throw new Error('CSG library not available for subtract operation');
            }

            const csgA = this._meshToCSG(meshA);
            const csgB = this._meshToCSG(meshB);
            const resultCSG = csgA.subtract(csgB);
            const resultMesh = this._csgToMesh(resultCSG, meshA.material);

            console.log('[MeshBoolean] Subtract complete');
            return resultMesh;

        } catch (error) {
            console.error('[MeshBoolean] Subtract failed:', error);
            throw error;
        }
    }

    /**
     * Perform an intersection operation
     * @param {THREE.Mesh} meshA - First mesh
     * @param {THREE.Mesh} meshB - Second mesh
     * @returns {THREE.Mesh} - Result mesh
     */
    static intersect(meshA, meshB) {
        console.log('[MeshBoolean] Performing intersect operation...');

        try {
            if (typeof CSGJS === 'undefined') {
                throw new Error('CSG library not available for intersect operation');
            }

            const csgA = this._meshToCSG(meshA);
            const csgB = this._meshToCSG(meshB);
            const resultCSG = csgA.intersect(csgB);
            const resultMesh = this._csgToMesh(resultCSG, meshA.material);

            console.log('[MeshBoolean] Intersect complete');
            return resultMesh;

        } catch (error) {
            console.error('[MeshBoolean] Intersect failed:', error);
            throw error;
        }
    }

    /**
     * Convert Three.js mesh to CSG representation
     * @private
     */
    static _meshToCSG(mesh) {
        // Ensure we're working with world-space coordinates
        mesh.updateMatrixWorld(true);

        const geometry = mesh.geometry;
        const isIndexed = geometry.index !== null;
        const positions = geometry.attributes.position.array;

        const polygons = [];

        if (isIndexed) {
            const indices = geometry.index.array;

            for (let i = 0; i < indices.length; i += 3) {
                const i1 = indices[i];
                const i2 = indices[i + 1];
                const i3 = indices[i + 2];

                const vertices = [
                    this._makeVertex(positions, i1, mesh),
                    this._makeVertex(positions, i2, mesh),
                    this._makeVertex(positions, i3, mesh)
                ];

                polygons.push(new CSGJS.Polygon(vertices));
            }
        } else {
            for (let i = 0; i < positions.length; i += 9) {
                const vertices = [
                    this._makeVertexFromArray(positions, i, mesh),
                    this._makeVertexFromArray(positions, i + 3, mesh),
                    this._makeVertexFromArray(positions, i + 6, mesh)
                ];

                polygons.push(new CSGJS.Polygon(vertices));
            }
        }

        return CSGJS.fromPolygons(polygons);
    }

    /**
     * Create CSG vertex from indexed position
     * @private
     */
    static _makeVertex(positions, index, mesh) {
        const i = index * 3;
        const vertex = new THREE.Vector3(
            positions[i],
            positions[i + 1],
            positions[i + 2]
        );

        // Apply mesh transforms
        vertex.applyMatrix4(mesh.matrixWorld);

        return new CSGJS.Vertex(
            new CSGJS.Vector(vertex.x, vertex.y, vertex.z)
        );
    }

    /**
     * Create CSG vertex from position array offset
     * @private
     */
    static _makeVertexFromArray(positions, offset, mesh) {
        const vertex = new THREE.Vector3(
            positions[offset],
            positions[offset + 1],
            positions[offset + 2]
        );

        // Apply mesh transforms
        vertex.applyMatrix4(mesh.matrixWorld);

        return new CSGJS.Vertex(
            new CSGJS.Vector(vertex.x, vertex.y, vertex.z)
        );
    }

    /**
     * Convert CSG result back to Three.js mesh
     * @private
     */
    static _csgToMesh(csg, material) {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const polygons = csg.toPolygons();

        for (let i = 0; i < polygons.length; i++) {
            const polygon = polygons[i];
            const vertices = polygon.vertices;

            // Triangulate polygon (CSG might return non-triangular faces)
            for (let j = 2; j < vertices.length; j++) {
                const v1 = vertices[0].pos;
                const v2 = vertices[j - 1].pos;
                const v3 = vertices[j].pos;

                positions.push(v1.x, v1.y, v1.z);
                positions.push(v2.x, v2.y, v2.z);
                positions.push(v3.x, v3.y, v3.z);
            }
        }

        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );

        // Compute normals for proper lighting
        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        return new THREE.Mesh(geometry, material);
    }

    /**
     * Fallback to manual merge if CSG is not available
     * @private
     */
    static _fallbackMerge(meshA, meshB) {
        console.log('[MeshBoolean] Using fallback manual merge');

        // Import GeometryUtils if available
        if (typeof GeometryUtils === 'undefined') {
            throw new Error('Neither CSG library nor GeometryUtils available');
        }

        // Convert to non-indexed for easier merging
        const g1 = meshA.geometry.index ? meshA.geometry.toNonIndexed() : meshA.geometry;
        const g2 = meshB.geometry.index ? meshB.geometry.toNonIndexed() : meshB.geometry;

        const mergedGeometry = new THREE.BufferGeometry();

        const positions1 = g1.getAttribute('position').array;
        const positions2 = g2.getAttribute('position').array;

        // Concatenate positions
        const totalPositions = new Float32Array(positions1.length + positions2.length);
        totalPositions.set(positions1);
        totalPositions.set(positions2, positions1.length);

        mergedGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(totalPositions, 3)
        );

        // Gentle weld: mostly exact duplicates & tiny noise
        const weldedGeometry = GeometryUtils.weldVertices(mergedGeometry, 1e-6);

        // Only remove truly degenerate faces (auto epsilon)
        const cleanGeometry = GeometryUtils.removeDegenerateFaces(weldedGeometry, 0);

        // Recompute normals for smooth shading
        cleanGeometry.computeVertexNormals();

        return new THREE.Mesh(cleanGeometry, meshA.material);
    }

    /**
     * Check if CSG library is available
     */
    static isAvailable() {
        return typeof CSGJS !== 'undefined';
    }

    /**
     * Get information about the CSG library
     */
    static getInfo() {
        if (this.isAvailable()) {
            return {
                available: true,
                library: 'csg.js',
                operations: ['union', 'subtract', 'intersect']
            };
        } else {
            return {
                available: false,
                library: 'none',
                fallback: 'Manual merge with GeometryUtils'
            };
        }
    }
}

// ES module export
export { MeshBoolean };
