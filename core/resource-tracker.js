/**
 * ResourceTracker - Tracks and manages Three.js resources to prevent memory leaks
 *
 * Three.js objects like geometries, materials, textures, and render targets need
 * explicit disposal to free GPU memory. This class helps track and manage these
 * resources automatically.
 *
 * Usage:
 * const tracker = new ResourceTracker();
 * const geometry = tracker.track(new THREE.BoxGeometry());
 * const material = tracker.track(new THREE.MeshBasicMaterial());
 * // Later, dispose all tracked resources:
 * tracker.dispose();
 */

export class ResourceTracker {
    constructor() {
        this.resources = new Set();
        this.stats = {
            geometries: 0,
            materials: 0,
            textures: 0,
            renderTargets: 0,
            other: 0,
            totalDisposed: 0
        };
    }

    /**
     * Track a Three.js resource
     * @param {Object} resource - Resource to track
     * @returns {Object} The same resource (for chaining)
     */
    track(resource) {
        if (!resource) {
            return resource;
        }

        // Track the resource
        this.resources.add(resource);

        // Update statistics
        this._updateStats(resource, 1);

        // If it's an Object3D, track its geometry and material recursively
        if (resource.isObject3D) {
            this._trackObject3D(resource);
        }

        return resource;
    }

    /**
     * Untrack a resource (without disposing it)
     * @param {Object} resource - Resource to untrack
     */
    untrack(resource) {
        if (this.resources.has(resource)) {
            this.resources.delete(resource);
            this._updateStats(resource, -1);
        }
    }

    /**
     * Track an Object3D and all its children
     */
    _trackObject3D(obj) {
        if (obj.geometry) {
            this.track(obj.geometry);
        }

        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(mat => this.track(mat));
            } else {
                this.track(obj.material);
            }
        }

        // Track children recursively
        if (obj.children) {
            obj.children.forEach(child => {
                if (child.isObject3D) {
                    this._trackObject3D(child);
                }
            });
        }
    }

    /**
     * Update resource statistics
     */
    _updateStats(resource, delta) {
        if (resource.isBufferGeometry || resource.isGeometry) {
            this.stats.geometries += delta;
        } else if (resource.isMaterial) {
            this.stats.materials += delta;
        } else if (resource.isTexture) {
            this.stats.textures += delta;
        } else if (resource.isWebGLRenderTarget) {
            this.stats.renderTargets += delta;
        } else {
            this.stats.other += delta;
        }
    }

    /**
     * Dispose a specific resource
     * @param {Object} resource - Resource to dispose
     */
    disposeResource(resource) {
        if (!resource) return;

        // Remove from tracking
        this.untrack(resource);

        // Dispose based on type
        if (resource.isObject3D) {
            this._disposeObject3D(resource);
        } else if (resource.dispose && typeof resource.dispose === 'function') {
            resource.dispose();
            this.stats.totalDisposed++;
        }
    }

    /**
     * Dispose an Object3D and all its resources
     */
    _disposeObject3D(obj) {
        // Dispose geometry
        if (obj.geometry) {
            obj.geometry.dispose();
            this.stats.totalDisposed++;
        }

        // Dispose material(s)
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(mat => {
                    this._disposeMaterial(mat);
                });
            } else {
                this._disposeMaterial(obj.material);
            }
        }

        // Dispose children recursively
        if (obj.children) {
            obj.children.forEach(child => {
                if (child.isObject3D) {
                    this._disposeObject3D(child);
                }
            });
        }
    }

    /**
     * Dispose a material and its textures
     */
    _disposeMaterial(material) {
        if (!material) return;

        // Dispose textures
        const textureProperties = [
            'map', 'lightMap', 'bumpMap', 'normalMap', 'specularMap',
            'envMap', 'alphaMap', 'aoMap', 'displacementMap', 'emissiveMap',
            'gradientMap', 'metalnessMap', 'roughnessMap'
        ];

        textureProperties.forEach(prop => {
            if (material[prop] && material[prop].dispose) {
                material[prop].dispose();
                this.stats.totalDisposed++;
            }
        });

        // Dispose material
        material.dispose();
        this.stats.totalDisposed++;
    }

    /**
     * Dispose all tracked resources
     */
    dispose() {
        const resourceArray = Array.from(this.resources);

        resourceArray.forEach(resource => {
            this.disposeResource(resource);
        });

        this.resources.clear();
        this._resetStats();
    }

    /**
     * Reset statistics counters
     */
    _resetStats() {
        this.stats.geometries = 0;
        this.stats.materials = 0;
        this.stats.textures = 0;
        this.stats.renderTargets = 0;
        this.stats.other = 0;
        // Keep totalDisposed cumulative
    }

    /**
     * Get current statistics
     */
    getStats() {
        return {
            ...this.stats,
            totalTracked: this.resources.size
        };
    }

    /**
     * Get memory estimate (rough approximation)
     * Returns estimated memory usage in bytes
     */
    getMemoryEstimate() {
        let totalBytes = 0;

        this.resources.forEach(resource => {
            if (resource.isBufferGeometry) {
                // Count attribute data
                const attributes = resource.attributes;
                for (const key in attributes) {
                    const attr = attributes[key];
                    if (attr.array) {
                        totalBytes += attr.array.byteLength;
                    }
                }

                // Count index data
                if (resource.index && resource.index.array) {
                    totalBytes += resource.index.array.byteLength;
                }
            } else if (resource.isTexture && resource.image) {
                // Rough estimate for textures
                const width = resource.image.width || 0;
                const height = resource.image.height || 0;
                totalBytes += width * height * 4; // RGBA
            }
        });

        return totalBytes;
    }

    /**
     * Get formatted memory estimate
     */
    getFormattedMemory() {
        const bytes = this.getMemoryEstimate();

        if (bytes < 1024) {
            return `${bytes} B`;
        } else if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(2)} KB`;
        } else {
            return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
        }
    }

    /**
     * Check for potential memory leaks
     * Returns warnings about tracked resources
     */
    checkForLeaks() {
        const warnings = [];

        if (this.resources.size > 1000) {
            warnings.push(`High resource count: ${this.resources.size} resources tracked`);
        }

        const memory = this.getMemoryEstimate();
        if (memory > 500 * 1024 * 1024) { // 500MB
            warnings.push(`High memory usage: ${this.getFormattedMemory()}`);
        }

        if (this.stats.geometries > 100) {
            warnings.push(`Many geometries tracked: ${this.stats.geometries}`);
        }

        if (this.stats.materials > 100) {
            warnings.push(`Many materials tracked: ${this.stats.materials}`);
        }

        return {
            hasLeaks: warnings.length > 0,
            warnings,
            stats: this.getStats(),
            memory: this.getFormattedMemory()
        };
    }

    /**
     * Get detailed report
     */
    getReport() {
        const stats = this.getStats();
        const memory = this.getFormattedMemory();
        const leaks = this.checkForLeaks();

        return {
            stats,
            memory,
            memoryBytes: this.getMemoryEstimate(),
            leaks: leaks.hasLeaks,
            warnings: leaks.warnings,
            resourceBreakdown: {
                geometries: this.stats.geometries,
                materials: this.stats.materials,
                textures: this.stats.textures,
                renderTargets: this.stats.renderTargets,
                other: this.stats.other
            }
        };
    }
}

/**
 * GlobalResourceTracker - Singleton for tracking all resources in the app
 */
export class GlobalResourceTracker {
    static instance = null;

    static getInstance() {
        if (!GlobalResourceTracker.instance) {
            GlobalResourceTracker.instance = new ResourceTracker();
        }
        return GlobalResourceTracker.instance;
    }

    static reset() {
        if (GlobalResourceTracker.instance) {
            GlobalResourceTracker.instance.dispose();
            GlobalResourceTracker.instance = null;
        }
    }
}
