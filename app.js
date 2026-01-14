// ES Module imports
import { FaceSelector } from './face-selector.js';
import { PipeGenerator } from './pipe-generator.js';
import { UIController } from './ui-controller.js';
import { GeometryUtils } from './geometry-utils.js';
import { MeshSimplifier } from './mesh-simplifier.js';
import { EdgeEditor } from './edge-editor.js';
import { STLLoaderUtils } from './stl-loader.js';
import { MeshBoolean } from './core/mesh-boolean.js';
import { MeshImporter } from './core/importers/mesh-importer.js';
// import { StateManager } from './core/state-manager.js'; // DISABLED - undo/redo too complex for this version
import { SimplificationWorkerManager } from './core/worker-manager.js';
import { ResourceTracker } from './core/resource-tracker.js';
import { MeshIntegrityChecker } from './core/mesh-integrity-checker.js';
import { MeshRepair } from './core/mesh-repair.js';

// Main Application Controller
class STLExtrudeLabApp {
    constructor() {
        // Version number
        this.version = '0.9.0';

        // Configuration
        this.config = {
            weldTolerance: 0.001  // Central weld tolerance for all geometry operations
        };

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.mesh = null;
        this.originalGeometry = null;
        
        this.faceSelector = null;
        this.pipeGenerator = null;
        this.uiController = null;
        
        this.selectedFaces = new Set();
        this.waypoints = [];
        this.boundaryData = null;

        // Wireframe
        this.wireframeMesh = null;

        // View mode
        this.rawViewMode = false;

        // Grid helper reference
        this.gridHelper = null;

        // State
        this.previewMesh = null;
        this.previewEndFace = null;
        this.previewWaypoints = [];
        this.boundaryVisuals = [];
        this.selectionModeEnabled = true;
        this.edgeEditor = null;

        // Importer
        this.meshImporter = null; // Initialized after init()

        // State Manager for undo/redo - DISABLED (too complex for this version)
        // this.stateManager = null; // Initialized after init()

        // Worker Manager for mesh simplification
        this.simplificationWorkerManager = null; // Initialized after init()

        // Resource Tracker for memory management
        this.resourceTracker = null; // Initialized after init()

        // Mesh integrity checker and repair
        this.meshIntegrityChecker = null; // Initialized after init()
        this.meshRepair = null; // Initialized after init()

        this.init();
    }
    
    init() {
        this.setupThreeJS();
        this.setupLights();
        this.setupEventListeners();
        this.setupKeyboardControls();

        // Initialize modules (using ES imports)
        this.faceSelector = new FaceSelector(this);
        this.pipeGenerator = new PipeGenerator(this);
        this.uiController = new UIController(this);

        // Update beta banner with version
        this.updateBetaBanner();

        // Initialize mesh importer
        this.meshImporter = new MeshImporter(this);

        // Initialize state manager - DISABLED (too complex for this version)
        // this.stateManager = new StateManager(this);

        // Initialize simplification worker manager
        this.simplificationWorkerManager = new SimplificationWorkerManager();

        // Initialize resource tracker
        this.resourceTracker = new ResourceTracker();

        // Initialize mesh integrity checker and repair
        this.meshIntegrityChecker = new MeshIntegrityChecker();
        this.meshRepair = new MeshRepair();

        // Setup periodic memory monitoring
        this.setupMemoryMonitoring();

        // Initialize UI to clean state
        this.initializeCleanState();

        // Apply default checkbox states
        this.applyDefaultCheckboxStates();

        // Push initial state - DISABLED
        // this.stateManager.pushState('Initial state', true);

        this.animate();

        this.log('✔ STL ExtrudeLab Ready');
        this.log('📂 Load a 3D model to begin (STL, OBJ, PLY, GLTF, GLB)');
    }

    initializeCleanState() {
        // Set file info to default "no file loaded" message
        const fileInfo = document.getElementById('file-info');
        if (fileInfo) {
            fileInfo.textContent = 'No file loaded';
        }

        // Ensure history info shows initial state - DISABLED
        // const historyInfo = document.getElementById('history-info');
        // if (historyInfo) {
        //     historyInfo.textContent = '1 / 1';
        // }

        // Ensure selection count is 0
        const selectedCount = document.getElementById('selected-count');
        if (selectedCount) {
            selectedCount.textContent = '0';
        }

        // Ensure end location status is default
        const endLocationStatus = document.getElementById('end-location-status');
        if (endLocationStatus) {
            endLocationStatus.textContent = 'No end face created';
        }

        // Ensure boundary status is default
        const boundaryStatus = document.getElementById('boundary-status');
        if (boundaryStatus) {
            boundaryStatus.textContent = 'No boundary computed';
        }
    }

    applyDefaultCheckboxStates() {
        // Apply raw view mode (checked by default)
        const rawViewCheckbox = document.getElementById('raw-view-mode');
        if (rawViewCheckbox && rawViewCheckbox.checked) {
            this.setRawViewMode(true);
        }

        // Grid is visible by default (checked by default), no action needed
        // Wireframe will be applied when a mesh is loaded
    }
    
    setupThreeJS() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x2a2a2a);
        
        // Camera
        const container = document.getElementById('viewer-container');
        this.camera = new THREE.PerspectiveCamera(
            45,
            container.clientWidth / container.clientHeight,
            0.1,
            10000
        );
        this.camera.position.set(200, 200, 200);
        
        // Renderer
        const canvas = document.getElementById('viewer');
        this.renderer = new THREE.WebGLRenderer({ 
            canvas, 
            antialias: true 
        });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // Controls (using globally available THREE.OrbitControls)
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    setupLights() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        // Directional lights
        const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight1.position.set(1, 1, 1);
        this.scene.add(dirLight1);
        
        const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
        dirLight2.position.set(-1, -1, -1);
        this.scene.add(dirLight2);
        
        // Grid helper (store reference for toggling)
        this.gridHelper = new THREE.GridHelper(200, 20, 0x444444, 0x333333);
        this.scene.add(this.gridHelper);
        
        // Axes helper
        const axesHelper = new THREE.AxesHelper(50);
        this.scene.add(axesHelper);
    }
    
    setupEventListeners() {
        // File input
        document.getElementById('load-stl-btn').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });

        document.getElementById('file-input').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                // Check file size FIRST before loading
                if (!this.checkFileSize(file, 5)) {
                    e.target.value = ''; // Clear input so user can try again
                    return;
                }
                await this.loadMesh(file);
            }
            // Reset file input so same file can be loaded again
            e.target.value = '';
        });
        
        // Drag and drop
        const container = document.getElementById('viewer-container');
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        
        container.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                const fileName = file.name.toLowerCase();
                const supportedFormats = ['.stl', '.obj', '.ply', '.gltf', '.glb'];
                const isSupported = supportedFormats.some(ext => fileName.endsWith(ext));

                if (!isSupported) {
                    alert('Unsupported file format. Please use: STL, OBJ, PLY, GLTF, or GLB');
                    return;
                }

                // Check file size FIRST before loading
                if (!this.checkFileSize(file, 5)) {
                    return; // Silently reject oversized drop
                }

                await this.loadMesh(file);
            }
        });

        // Wireframe toggle
        document.getElementById('show-wireframe').addEventListener('change', (e) => {
            this.toggleWireframe(e.target.checked);
        });

        // Wireframe color picker
        document.getElementById('wireframe-color').addEventListener('input', (e) => {
            this.updateWireframeColor(e.target.value);
        });

        // Raw view mode toggle
        document.getElementById('raw-view-mode').addEventListener('change', (e) => {
            this.setRawViewMode(e.target.checked);
        });

        // Grid toggle
        document.getElementById('show-grid').addEventListener('change', (e) => {
            this.toggleGrid(e.target.checked);
        });
    }

    setupKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            // R key toggles selection mode
            if (e.key === 'r' || e.key === 'R') {
                this.toggleSelectionMode();
            }
        });
    }

    setupMemoryMonitoring() {
        // Periodic memory check (every 30 seconds)
        setInterval(() => {
            const leakCheck = this.resourceTracker.checkForLeaks();

            if (leakCheck.hasLeaks) {
                console.warn('[Memory Monitor] Potential memory issues detected:');
                leakCheck.warnings.forEach(w => console.warn(`  - ${w}`));
            }
        }, 30000);

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });

        // Periodic worker cleanup (every 2 minutes)
        setInterval(() => {
            const removed = this.simplificationWorkerManager.cleanup();
            if (removed > 0) {
                console.log(`[Memory Monitor] Cleaned up ${removed} idle worker(s)`);
            }
        }, 120000);
    }

    cleanup() {
        // Dispose all tracked resources
        this.resourceTracker.dispose();

        // Terminate all workers
        this.simplificationWorkerManager.destroy();

        console.log('[Cleanup] Application resources disposed');
    }
    
    toggleSelectionMode() {
        this.selectionModeEnabled = !this.selectionModeEnabled;
        
        const statusBox = document.getElementById('selection-status');
        const cameraMode = document.getElementById('camera-mode');
        
        if (this.selectionModeEnabled) {
            statusBox.textContent = 'Selection Mode: ENABLED (Click to select faces)';
            statusBox.className = 'status-box active';
            cameraMode.textContent = 'Mode: Selection (Press R to toggle)';
            this.log('🎯 Selection mode ENABLED');
        } else {
            statusBox.textContent = 'Selection Mode: DISABLED (Camera orbit only)';
            statusBox.className = 'status-box ready';
            cameraMode.textContent = 'Mode: Orbit (Press R to toggle)';
            this.log('🎥 Selection mode DISABLED - Camera orbit only');
        }
    }

    toggleWireframe(show) {
        if (!this.mesh) {
            return;
        }

        if (show) {
            // Create wireframe if it doesn't exist
            if (!this.wireframeMesh) {
                // Get color from color picker
                const colorPicker = document.getElementById('wireframe-color');
                const colorValue = colorPicker ? colorPicker.value : '#808080';

                const wireframeGeometry = new THREE.WireframeGeometry(this.mesh.geometry);
                const wireframeMaterial = new THREE.LineBasicMaterial({
                    color: colorValue,
                    linewidth: 1
                });
                this.wireframeMesh = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);

                // Copy mesh position, rotation, and scale
                this.wireframeMesh.position.copy(this.mesh.position);
                this.wireframeMesh.rotation.copy(this.mesh.rotation);
                this.wireframeMesh.scale.copy(this.mesh.scale);

                // Track wireframe resources
                this.resourceTracker.track(wireframeGeometry);
                this.resourceTracker.track(wireframeMaterial);
                this.resourceTracker.track(this.wireframeMesh);
            }

            this.scene.add(this.wireframeMesh);
            this.log('🔲 Wireframe edges enabled');
        } else {
            // Hide wireframe
            if (this.wireframeMesh) {
                this.scene.remove(this.wireframeMesh);
                this.log('🔲 Wireframe edges disabled');
            }
        }
    }

    toggleGrid(show) {
        if (!this.gridHelper) {
            return;
        }

        this.gridHelper.visible = show;
        this.log(show ? '⊞ Background grid enabled' : '⊞ Background grid disabled');
    }

    updateWireframeColor(colorValue) {
        if (!this.wireframeMesh || !this.wireframeMesh.material) {
            return;
        }

        // Update the material color
        this.wireframeMesh.material.color.set(colorValue);
        this.log(`🎨 Wireframe color changed to ${colorValue}`);
    }

    setRawViewMode(enabled) {
        this.rawViewMode = enabled;
        this.updateViewMode();
    }

    updateViewMode() {
        if (!this.mesh) return;

        // Update main mesh
        if (this.rawViewMode) {
            this.mesh.material.flatShading = true;
        } else {
            this.mesh.material.flatShading = false;
        }
        this.mesh.material.needsUpdate = true;

        // Update preview meshes if they exist
        if (this.previewMesh) {
            this.previewMesh.material.flatShading = this.rawViewMode;
            this.previewMesh.material.needsUpdate = true;
        }

        if (this.previewEndFace) {
            this.previewEndFace.material.flatShading = this.rawViewMode;
            this.previewEndFace.material.needsUpdate = true;
        }

        if (this.previewWaypoints && this.previewWaypoints.length > 0) {
            this.previewWaypoints.forEach(wp => {
                if (wp.material) {
                    wp.material.flatShading = this.rawViewMode;
                    wp.material.needsUpdate = true;
                }
            });
        }

        this.log(this.rawViewMode
            ? 'Raw geometry view enabled (flat shading)'
            : 'Smooth view enabled (interpolated normals)');
    }

    loadSTL(file) {
        if (!file) return;
        
        this.showLoading('Loading STL file...');
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const loader = new THREE.STLLoader();
                const geometry = loader.parse(e.target.result);

                // Center and scale geometry
                geometry.computeBoundingBox();

                // Compute smooth normals only if not in raw view mode
                if (!this.rawViewMode) {
                    geometry.computeVertexNormals();
                }
                
                const center = new THREE.Vector3();
                geometry.boundingBox.getCenter(center);
                geometry.translate(-center.x, -center.y, -center.z);
                
                // Scale to reasonable size
                const size = new THREE.Vector3();
                geometry.boundingBox.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z);
                const scale = 100 / maxDim;
                geometry.scale(scale, scale, scale);
                
                // Remove old mesh
                if (this.mesh) {
                    this.scene.remove(this.mesh);
                }
                
                // Create new mesh
                const material = new THREE.MeshPhongMaterial({
                    color: 0x87CEEB,
                    side: THREE.DoubleSide,
                    flatShading: false
                });
                
                this.mesh = new THREE.Mesh(geometry, material);
                this.scene.add(this.mesh);
                
                // Store original geometry
                this.originalGeometry = geometry.clone();
                
                // Clear selection
                this.selectedFaces.clear();
                this.boundaryData = null;
                this.waypoints = [];
                
                // Update UI
                this.uiController.updateSelectionCount();
                
                // Camera positioning
                this.camera.position.set(150, 150, 150);
                this.camera.lookAt(0, 0, 0);
                this.controls.target.set(0, 0, 0);
                this.controls.update();
                
                const vertices = geometry.attributes.position.count;
                const faces = vertices / 3;
                
                document.getElementById('file-info').textContent = 
                    `Loaded: ${file.name}\nVertices: ${vertices}\nFaces: ${faces}`;
                
                this.log(`✔ Loaded: ${file.name}`);
                this.log(`  Vertices: ${vertices}, Faces: ${faces}`);
                
                this.hideLoading();
            } catch (error) {
                this.hideLoading();
                this.log(`✗ Error loading STL: ${error.message}`);
                alert('Error loading STL file. Please try another file.');
            }
        };
        
        reader.readAsArrayBuffer(file);
    }

    /**
     * Show confirmation dialog for unsaved changes
     * @returns {Promise<string>} 'save', 'dont-save', or 'cancel'
     */
    async confirmUnsavedChanges() {
        return new Promise((resolve) => {
            // Create custom modal dialog
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            `;

            const dialog = document.createElement('div');
            dialog.style.cssText = `
                background: #2a2a2a;
                border: 2px solid #4a90e2;
                border-radius: 8px;
                padding: 24px;
                max-width: 400px;
                color: #e0e0e0;
                font-family: 'Segoe UI', sans-serif;
            `;

            dialog.innerHTML = `
                <h3 style="margin: 0 0 16px 0; color: #4a90e2; font-size: 18px;">Are you sure?</h3>
                <p style="margin: 0 0 24px 0; line-height: 1.5;">
                    You have unsaved changes. Do you want to save your project before loading a new file?
                </p>
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button id="dialog-cancel" style="
                        padding: 8px 16px;
                        border: 1px solid #666;
                        background: #3a3a3a;
                        color: #e0e0e0;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                    ">Cancel</button>
                    <button id="dialog-dont-save" style="
                        padding: 8px 16px;
                        border: 1px solid #666;
                        background: #3a3a3a;
                        color: #e0e0e0;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                    ">Continue</button>
                    <button id="dialog-save" style="
                        padding: 8px 16px;
                        border: 1px solid #4a90e2;
                        background: #4a90e2;
                        color: white;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: bold;
                    ">Save</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const cleanup = () => {
                document.body.removeChild(overlay);
            };

            document.getElementById('dialog-save').addEventListener('click', () => {
                cleanup();
                resolve('save');
            });

            document.getElementById('dialog-dont-save').addEventListener('click', () => {
                cleanup();
                resolve('dont-save');
            });

            document.getElementById('dialog-cancel').addEventListener('click', () => {
                cleanup();
                resolve('cancel');
            });

            // ESC key cancels
            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve('cancel');
                    document.removeEventListener('keydown', escHandler);
                }
            };
            document.addEventListener('keydown', escHandler);
        });
    }

    /**
     * Check if file size exceeds the limit
     * @param {File} file - The file to check
     * @param {number} maxMB - Maximum allowed size in MB (default: 5)
     * @returns {boolean} - True if file is within limit, false otherwise
     */
    checkFileSize(file, maxMB = 5) {
        const maxBytes = maxMB * 1024 * 1024; // Convert MB to bytes
        if (file.size > maxBytes) {
            const fileMB = (file.size / (1024 * 1024)).toFixed(1);
            this.showFileSizeError(fileMB, maxMB);
            return false;
        }
        return true;
    }

    /**
     * Show blocking popup for file size errors with pro-version teaser
     * @param {string} fileMB - File size in MB
     * @param {number} maxMB - Maximum allowed size in MB
     */
    showFileSizeError(fileMB, maxMB) {
        const message = `File too large: ${fileMB} MB (max ${maxMB} MB)

Pro version: Unlimited local file size
Follow Discord for updates → discord.gg/YOUR_LINK

Please simplify your mesh first.`;

        // Blocking popup - user must dismiss
        alert(message);

        this.log(`✗ File rejected: ${fileMB} MB > ${maxMB} MB limit`);
    }

    /**
     * Load mesh using new MeshImporter (supports multiple formats)
     */
    async loadMesh(file) {
        if (!file) return;

        // Check for unsaved changes before loading - DISABLED
        // if (this.stateManager && this.stateManager.hasUnsavedChanges()) {
        //     const choice = await this.confirmUnsavedChanges();

        //     if (choice === 'cancel') {
        //         this.log('Load cancelled by user');
        //         return;
        //     }

        //     if (choice === 'save') {
        //         // Save current project before loading new file
        //         this.stateManager.exportState();
        //         this.log('Project saved before loading new file');
        //     }
        // }

        try {
            // Show loading indicator
            this.showLoading(`Importing ${file.name}...`);

            // Import using MeshImporter
            const unifiedMesh = await this.meshImporter.import(file);

            // Convert UnifiedMesh to Three.js geometry
            const geometry = unifiedMesh.toBufferGeometry();

            // Track geometry
            this.resourceTracker.track(geometry);

            // Center and scale geometry
            geometry.computeBoundingBox();

            // Compute smooth normals only if not in raw view mode
            if (!this.rawViewMode) {
                geometry.computeVertexNormals();
            }

            const center = new THREE.Vector3();
            geometry.boundingBox.getCenter(center);
            geometry.translate(-center.x, -center.y, -center.z);

            // Scale to reasonable size
            const size = new THREE.Vector3();
            geometry.boundingBox.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 100 / maxDim;
            geometry.scale(scale, scale, scale);

            // COMPLETE RESET - Clear all existing state before loading new mesh

            // Remove old mesh
            if (this.mesh) {
                this.scene.remove(this.mesh);
                this.resourceTracker.disposeResource(this.mesh);
            }

            // Remove old wireframe
            if (this.wireframeMesh) {
                this.scene.remove(this.wireframeMesh);
                this.resourceTracker.disposeResource(this.wireframeMesh);
                this.wireframeMesh = null;
            }

            // Clear all preview meshes and visuals
            this.clearPreview();

            // Clear boundary visuals
            this.clearBoundaryVisuals();

            // Clear rotation visuals
            if (this.rotationVisuals && this.rotationVisuals.length > 0) {
                this.rotationVisuals.forEach(visual => {
                    this.scene.remove(visual);
                    this.resourceTracker.disposeResource(visual);
                });
                this.rotationVisuals = [];
            }

            // Reset edge editor
            this.edgeEditor = null;

            // Clear selection state
            this.selectedFaces.clear();
            this.boundaryData = null;
            this.waypoints = [];

            // Reset UI checkboxes and inputs
            const wireframeCheckbox = document.getElementById('show-wireframe');
            if (wireframeCheckbox) wireframeCheckbox.checked = true; // Keep wireframe enabled by default

            // Keep preview enabled by default when loading new meshes
            const previewCheckbox = document.getElementById('show-preview');
            if (previewCheckbox) previewCheckbox.checked = true;

            // Clear waypoint list
            const waypointList = document.getElementById('waypoint-list');
            if (waypointList) waypointList.innerHTML = '';

            // Reset transform inputs to defaults
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.value = val;
            };

            setVal('length', 50);
            setVal('offset-x', 0);
            setVal('offset-y', 0);
            setVal('offset-z', 0);
            setVal('rot-x', 0);
            setVal('rot-y', 0);
            setVal('rot-z', 0);
            setVal('scale-x', 1.0);
            setVal('scale-y', 1.0);
            setVal('segments', 20);

            // Clear status messages
            const endLocationStatus = document.getElementById('end-location-status');
            if (endLocationStatus) endLocationStatus.textContent = 'No end location created';

            const boundaryStatus = document.getElementById('boundary-status');
            if (boundaryStatus) boundaryStatus.textContent = 'No boundary computed';

            // Create new mesh
            const material = new THREE.MeshPhongMaterial({
                color: 0x87CEEB,
                side: THREE.DoubleSide,
                flatShading: false
            });

            this.mesh = new THREE.Mesh(geometry, material);

            // Track material and mesh
            this.resourceTracker.track(material);
            this.resourceTracker.track(this.mesh);

            this.scene.add(this.mesh);

            // Store original geometry
            this.originalGeometry = geometry.clone();
            this.resourceTracker.track(this.originalGeometry);

            // Update UI
            this.uiController.updateSelectionCount();

            // Camera positioning
            this.camera.position.set(150, 150, 150);
            this.camera.lookAt(0, 0, 0);
            this.controls.target.set(0, 0, 0);
            this.controls.update();

            // Update file info
            const vertices = geometry.attributes.position.count;
            const faces = vertices / 3;

            document.getElementById('file-info').textContent =
                `Loaded: ${file.name}\nFormat: ${unifiedMesh.sourceFormat}\nVertices: ${vertices}\nFaces: ${faces}`;

            this.log(`✔ Loaded: ${file.name} (${unifiedMesh.sourceFormat})`);
            this.log(`  Vertices: ${vertices}, Faces: ${faces}`);

            // Automatic mesh validation
            this.validateAndOfferRepair(geometry, file.name);

            // Apply wireframe if checkbox is checked (enabled by default)
            if (wireframeCheckbox && wireframeCheckbox.checked) {
                this.toggleWireframe(true);
            }

            // Push state to history and reset saved state tracking - DISABLED
            // this.stateManager.pushState(`Loaded ${file.name}`, true);
            // this.stateManager.resetSavedState();

            // Hide loading indicator
            this.hideLoading();

        } catch (error) {
            this.hideLoading();
            this.log(`✗ Error loading file: ${error.message}`);
            alert(`Error loading file: ${error.message}`);
            console.error('Load error:', error);
        }
    }

    /**
     * Validate mesh and offer automatic repair if issues are found
     */
    validateAndOfferRepair(geometry, fileName) {
        this.log('🔍 Validating mesh integrity...');

        const report = this.meshIntegrityChecker.validate(geometry);

        if (report.valid) {
            this.log('  ✔ Mesh is valid - no issues detected');
            return;
        }

        // Log warnings
        this.log('  ⚠️ Mesh validation warnings:');
        report.warnings.forEach(w => this.log(`    - ${w}`));

        // Only offer auto-repair for fixable issues
        if (report.fixable && (report.stats.degenerateFaces > 0 || report.stats.invertedNormals > 0)) {
            const issueTypes = [];
            if (report.stats.degenerateFaces > 0) issueTypes.push(`${report.stats.degenerateFaces} degenerate face(s)`);
            if (report.stats.invertedNormals > 0) issueTypes.push(`${report.stats.invertedNormals} inverted normal(s)`);

            const message =
                `Mesh validation detected:\n\n${issueTypes.join('\n')}\n\n` +
                `Would you like to automatically repair these issues?`;

            if (confirm(message)) {
                this.log('🔧 Auto-repairing mesh...');

                try {
                    const repairResult = this.meshRepair.repair(geometry, report);

                    if (repairResult.success) {
                        // Dispose old geometry
                        this.resourceTracker.disposeResource(this.mesh.geometry);

                        // Apply repaired geometry
                        this.mesh.geometry = repairResult.geometry;

                        // Track new geometry
                        this.resourceTracker.track(repairResult.geometry);

                        // Update file info
                        const vertices = repairResult.geometry.attributes.position.count;
                        const faces = vertices / 3;

                        document.getElementById('file-info').textContent =
                            `Loaded: ${fileName}\nVertices: ${vertices}\nFaces: ${faces}`;

                        this.log(`  ✔ Auto-repair complete: ${repairResult.message}`);

                        // Re-validate
                        const newReport = this.meshIntegrityChecker.validate(repairResult.geometry);
                        if (newReport.valid) {
                            this.log('  ✔ Mesh is now valid!');
                        }
                    } else {
                        this.log(`  ✗ Auto-repair failed: ${repairResult.message}`);
                    }
                } catch (error) {
                    this.log(`  ✗ Auto-repair error: ${error.message}`);
                    console.error('Auto-repair error:', error);
                }
            } else {
                this.log('  ℹ️ Auto-repair skipped. You can repair manually using Mesh Validation & Repair section.');
            }
        } else if (!report.fixable) {
            this.log('  ⚠️ Some issues cannot be automatically repaired. Use manual tools or external software.');
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Force render (used by state manager)
     */
    render() {
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    onWindowResize() {
        const container = document.getElementById('viewer-container');
        this.camera.aspect = container.clientWidth / container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(container.clientWidth, container.clientHeight);
    }
    
    log(message) {
        const logElement = document.getElementById('info-log');
        const entry = document.createElement('div');
        entry.textContent = message;
        logElement.appendChild(entry);
        logElement.scrollTop = logElement.scrollHeight;
    }

    updateBetaBanner() {
        const versionEl = document.getElementById('beta-version');
        if (versionEl && this.version) {
            versionEl.textContent = `v${this.version}`;
        }
    }

    showLoading(text = 'Processing...') {
        document.getElementById('loading-text').textContent = text;
        document.getElementById('loading-overlay').style.display = 'flex';
    }
    
    hideLoading() {
        document.getElementById('loading-overlay').style.display = 'none';
    }
    
    clearPreview() {
        if (this.previewMesh) {
            this.scene.remove(this.previewMesh);
            this.resourceTracker.disposeResource(this.previewMesh);
            this.previewMesh = null;
        }

        if (this.previewEndFace) {
            this.scene.remove(this.previewEndFace);
            this.resourceTracker.disposeResource(this.previewEndFace);
            this.previewEndFace = null;
        }

        this.previewWaypoints.forEach(wp => {
            this.scene.remove(wp);
            this.resourceTracker.disposeResource(wp);
        });
        this.previewWaypoints = [];

        // Clear rotation visuals (arrows and sphere)
        if (this.rotationVisuals) {
            this.rotationVisuals.forEach(obj => {
                this.scene.remove(obj);
                this.resourceTracker.disposeResource(obj);
            });
            this.rotationVisuals = [];
        }
    }
    
    clearBoundaryVisuals() {
        this.boundaryVisuals.forEach(obj => {
            this.scene.remove(obj);
            this.resourceTracker.disposeResource(obj);
        });
        this.boundaryVisuals = [];
    }
}

// Initialize app when DOM is loaded (or immediately if already loaded)
let app;

function initApp() {
    app = new STLExtrudeLabApp();
    window.app = app;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    // DOM already loaded, initialize immediately
    initApp();
}