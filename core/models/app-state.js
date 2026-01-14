import { UnifiedMesh } from './unified-mesh.js';

/**
 * AppState - Complete snapshot of application state for undo/redo
 * Contains all data needed to restore the application to a specific point in time
 */
export class AppState {
    constructor() {
        // Core mesh
        this.mesh = null;                // UnifiedMesh instance

        // Selection
        this.selectedFaces = [];         // Array of face indices

        // Boundaries
        this.boundaryData = null;        // { loops: [...], totalPoints: N }
        this.edgeEdits = [];            // EdgeEditor modifications

        // Transforms
        this.endTransform = {
            length: 50,
            offsetX: 0, offsetY: 0, offsetZ: 0,
            rotX: 0, rotY: 0, rotZ: 0,
            scaleX: 1.0, scaleY: 1.0
        };

        // Waypoints
        this.waypoints = [];

        // Settings
        this.settings = {
            segments: 20,
            previewEnabled: true,  // Enable preview by default
            wireframeEnabled: false
        };

        // Camera (optional - not currently implemented)
        this.camera = null;              // Camera position/target

        // Metadata
        this.timestamp = Date.now();
        this.description = '';           // Human-readable description of this state
    }

    /**
     * Create deep clone of this state
     */
    clone() {
        const state = new AppState();

        // Deep clone mesh
        if (this.mesh) {
            state.mesh = this.mesh.clone();
        }

        // Clone arrays/objects
        state.selectedFaces = [...this.selectedFaces];

        // Deep clone boundaryData with proper Vector3 cloning
        if (this.boundaryData && this.boundaryData.loops) {
            state.boundaryData = {
                loops: this.boundaryData.loops.map(loop =>
                    loop.map(v => v.clone())
                ),
                totalPoints: this.boundaryData.totalPoints
            };
        } else {
            state.boundaryData = null;
        }

        state.edgeEdits = JSON.parse(JSON.stringify(this.edgeEdits));
        state.endTransform = { ...this.endTransform };
        state.waypoints = JSON.parse(JSON.stringify(this.waypoints));
        state.settings = { ...this.settings };
        state.camera = this.camera ? { ...this.camera } : null;
        state.description = this.description;

        return state;
    }

    /**
     * Get state size in bytes (approximate)
     */
    getSize() {
        const json = JSON.stringify(this.toJSON());
        return new Blob([json]).size;
    }

    /**
     * Serialize to JSON
     */
    toJSON() {
        // Convert boundaryData Vector3 objects to plain objects for JSON
        let boundaryDataJSON = null;
        if (this.boundaryData && this.boundaryData.loops) {
            boundaryDataJSON = {
                loops: this.boundaryData.loops.map(loop =>
                    loop.map(v => ({ x: v.x, y: v.y, z: v.z }))
                ),
                totalPoints: this.boundaryData.totalPoints
            };
        }

        return {
            mesh: this.mesh ? this.mesh.toJSON() : null,
            selectedFaces: this.selectedFaces,
            boundaryData: boundaryDataJSON,
            edgeEdits: this.edgeEdits,
            endTransform: this.endTransform,
            waypoints: this.waypoints,
            settings: this.settings,
            camera: this.camera,
            timestamp: this.timestamp,
            description: this.description
        };
    }

    /**
     * Deserialize from JSON
     */
    static fromJSON(data) {
        const state = new AppState();
        state.mesh = data.mesh ? UnifiedMesh.fromJSON(data.mesh) : null;
        state.selectedFaces = data.selectedFaces || [];

        // Convert boundaryData plain objects back to Vector3
        if (data.boundaryData && data.boundaryData.loops) {
            state.boundaryData = {
                loops: data.boundaryData.loops.map(loop =>
                    loop.map(v => new THREE.Vector3(v.x, v.y, v.z))
                ),
                totalPoints: data.boundaryData.totalPoints
            };
        } else {
            state.boundaryData = null;
        }

        state.edgeEdits = data.edgeEdits || [];
        state.endTransform = data.endTransform || state.endTransform;
        state.waypoints = data.waypoints || [];
        state.settings = data.settings || state.settings;
        state.camera = data.camera;
        state.timestamp = data.timestamp || Date.now();
        state.description = data.description || '';
        return state;
    }

    /**
     * Create state from current app instance
     */
    static fromApp(app) {
        const state = new AppState();

        // Capture mesh if exists
        if (app.mesh && app.mesh.geometry) {
            state.mesh = UnifiedMesh.fromBufferGeometry(
                app.mesh.geometry,
                'STL', // Will be updated when multi-format is implemented
                'current'
            );
        }

        // Capture selection
        state.selectedFaces = Array.from(app.selectedFaces || []);

        // Capture boundary data
        state.boundaryData = app.boundaryData ? JSON.parse(JSON.stringify(app.boundaryData)) : null;

        // Capture waypoints
        state.waypoints = app.waypoints ? JSON.parse(JSON.stringify(app.waypoints)) : [];

        // Capture transform settings from UI
        if (typeof document !== 'undefined') {
            const getVal = (id, defaultVal) => {
                const el = document.getElementById(id);
                return el ? (parseFloat(el.value) || defaultVal) : defaultVal;
            };

            state.endTransform = {
                length: getVal('length', 50),
                offsetX: getVal('offset-x', 0),
                offsetY: getVal('offset-y', 0),
                offsetZ: getVal('offset-z', 0),
                rotX: getVal('rot-x', 0),
                rotY: getVal('rot-y', 0),
                rotZ: getVal('rot-z', 0),
                scaleX: getVal('scale-x', 1.0),
                scaleY: getVal('scale-y', 1.0)
            };

            state.settings = {
                segments: getVal('segments', 20),
                previewEnabled: document.getElementById('show-preview')?.checked || false,
                wireframeEnabled: document.getElementById('show-wireframe')?.checked || false
            };
        }

        return state;
    }

    /**
     * Apply this state to app instance
     */
    applyToApp(app) {
        // Restore mesh
        if (this.mesh) {
            // Remove old mesh
            if (app.mesh) {
                app.scene.remove(app.mesh);
                if (app.mesh.geometry) app.mesh.geometry.dispose();
                if (app.mesh.material) app.mesh.material.dispose();
            }

            // Create new mesh from state
            const geometry = this.mesh.toBufferGeometry();
            const material = new THREE.MeshPhongMaterial({
                color: 0x87CEEB,
                side: THREE.DoubleSide,
                flatShading: false
            });

            app.mesh = new THREE.Mesh(geometry, material);
            app.scene.add(app.mesh);
        } else {
            // No mesh in state - remove current mesh
            if (app.mesh) {
                app.scene.remove(app.mesh);
                if (app.mesh.geometry) app.mesh.geometry.dispose();
                if (app.mesh.material) app.mesh.material.dispose();
                app.mesh = null;
            }
        }

        // Restore selection
        app.selectedFaces = new Set(this.selectedFaces);

        // Restore boundary data - CRITICAL: Do NOT use JSON stringify/parse as it destroys Vector3 objects!
        if (this.boundaryData && this.boundaryData.loops) {
            // Deep clone the loops to avoid reference issues
            app.boundaryData = {
                loops: this.boundaryData.loops.map(loop =>
                    loop.map(v => v.clone())
                ),
                totalPoints: this.boundaryData.totalPoints
            };
        } else {
            app.boundaryData = null;
        }

        // Restore waypoints
        app.waypoints = JSON.parse(JSON.stringify(this.waypoints));

        // Rebuild waypoint list UI
        if (typeof document !== 'undefined') {
            const waypointList = document.getElementById('waypoint-list');
            if (waypointList) {
                // Clear existing options
                waypointList.innerHTML = '';

                // Rebuild waypoint options
                this.waypoints.forEach((waypoint, idx) => {
                    const option = document.createElement('option');
                    option.textContent = `WP${idx + 1}: L=${waypoint.length.toFixed(1)}, Scale=(${waypoint.scaleX.toFixed(2)},${waypoint.scaleY.toFixed(2)})`;
                    waypointList.appendChild(option);
                });
            }
        }

        // Restore UI settings
        if (typeof document !== 'undefined') {
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.value = val;
            };

            setVal('length', this.endTransform.length);
            setVal('offset-x', this.endTransform.offsetX);
            setVal('offset-y', this.endTransform.offsetY);
            setVal('offset-z', this.endTransform.offsetZ);
            setVal('rot-x', this.endTransform.rotX);
            setVal('rot-y', this.endTransform.rotY);
            setVal('rot-z', this.endTransform.rotZ);
            setVal('scale-x', this.endTransform.scaleX);
            setVal('scale-y', this.endTransform.scaleY);
            setVal('segments', this.settings.segments);

            const previewCheckbox = document.getElementById('show-preview');
            if (previewCheckbox) previewCheckbox.checked = this.settings.previewEnabled;

            const wireframeCheckbox = document.getElementById('show-wireframe');
            if (wireframeCheckbox) wireframeCheckbox.checked = this.settings.wireframeEnabled;
        }

        // Clear wireframe first before potentially re-enabling it
        if (app.wireframeMesh) {
            app.scene.remove(app.wireframeMesh);
            if (app.wireframeMesh.geometry) app.wireframeMesh.geometry.dispose();
            if (app.wireframeMesh.material) app.wireframeMesh.material.dispose();
            app.wireframeMesh = null;
        }

        // Re-enable wireframe if it was enabled in the saved state
        if (this.settings.wireframeEnabled && app.toggleWireframe) {
            app.toggleWireframe(true);
        }

        // Clear any preview meshes and visuals (includes previewEndFace and waypoints)
        if (app.clearPreview) {
            app.clearPreview();
        }

        // Clear boundary visuals using the app's method if available
        if (app.clearBoundaryVisuals) {
            app.clearBoundaryVisuals();
        } else if (app.boundaryVisuals && app.boundaryVisuals.length > 0) {
            // Fallback if method doesn't exist
            app.boundaryVisuals.forEach(visual => {
                app.scene.remove(visual);
                if (visual.geometry) visual.geometry.dispose();
                if (visual.material) visual.material.dispose();
            });
            app.boundaryVisuals = [];
        }

        // Clear rotation visuals if they exist
        if (app.rotationVisuals && app.rotationVisuals.length > 0) {
            app.rotationVisuals.forEach(visual => {
                app.scene.remove(visual);
                if (visual.geometry) visual.geometry.dispose();
                if (visual.material) visual.material.dispose();
            });
            app.rotationVisuals = [];
        }

        // Reset edge editor
        if (app.edgeEditor) {
            app.edgeEditor = null;
        }

        // Update face selection visualization
        if (app.faceSelector) {
            app.faceSelector.visualizeSelection();
        }

        // Trigger UI updates
        if (app.uiController) {
            app.uiController.updateSelectionCount();
        }

        // Update end location status message
        if (typeof document !== 'undefined') {
            const endLocationStatus = document.getElementById('end-location-status');
            if (endLocationStatus) {
                if (this.boundaryData && this.boundaryData.loops && this.boundaryData.loops.length > 0) {
                    endLocationStatus.textContent = '✔ End location created. Adjust position/rotation below.';
                } else {
                    endLocationStatus.textContent = 'No end location created';
                }
            }
        }
    }
}
