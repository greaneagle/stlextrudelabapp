// Face Selector - Handles face selection via clicking
class FaceSelector {
    constructor(app) {
        this.app = app;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.selectionMaterial = new THREE.MeshPhongMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        const canvas = document.getElementById('viewer');
        
        canvas.addEventListener('click', (e) => this.onMouseClick(e));
    }
    
    onMouseClick(event) {
        if (!this.app.mesh) return;
        
        // Check if selection mode is enabled
        if (!this.app.selectionModeEnabled) {
            return; // Don't select, just allow camera orbit
        }
        
        const canvas = document.getElementById('viewer');
        const rect = canvas.getBoundingClientRect();
        
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this.raycaster.setFromCamera(this.mouse, this.app.camera);
        
        const intersects = this.raycaster.intersectObject(this.app.mesh);
        
        if (intersects.length > 0) {
            const faceIndex = intersects[0].faceIndex;
            
            if (this.app.selectedFaces.has(faceIndex)) {
                this.app.selectedFaces.delete(faceIndex);
            } else {
                this.app.selectedFaces.add(faceIndex);
            }
            
            this.updateSelection();
        }
    }
    
    updateSelection() {
        // Update the mesh to show selection
        this.visualizeSelection();
        this.app.uiController.updateSelectionCount();
    }
    
    visualizeSelection() {
        // Remove old selection visualization
        const oldSelection = this.app.scene.getObjectByName('selection-overlay');
        if (oldSelection) {
            this.app.scene.remove(oldSelection);
            this.app.resourceTracker.disposeResource(oldSelection);
        }

        if (this.app.selectedFaces.size === 0) return;

        // Create geometry for selected faces
        const positions = this.app.mesh.geometry.attributes.position.array;
        const selectedPositions = [];

        this.app.selectedFaces.forEach(faceIndex => {
            const i = faceIndex * 9; // 3 vertices * 3 components
            for (let j = 0; j < 9; j++) {
                selectedPositions.push(positions[i + j]);
            }
        });

        const selectionGeometry = new THREE.BufferGeometry();
        selectionGeometry.setAttribute('position',
            new THREE.Float32BufferAttribute(selectedPositions, 3));
        selectionGeometry.computeVertexNormals();

        const selectionMesh = new THREE.Mesh(selectionGeometry, this.selectionMaterial);
        selectionMesh.name = 'selection-overlay';

        // Track resources
        this.app.resourceTracker.track(selectionGeometry);
        this.app.resourceTracker.track(selectionMesh);

        this.app.scene.add(selectionMesh);
    }
    
    selectVisibleFlatFaces() {
        if (!this.app.mesh) {
            alert('Load a mesh first');
            return;
        }
        
        this.app.showLoading('Selecting visible flat faces...');
        
        setTimeout(() => {
            const geometry = this.app.mesh.geometry;
            const positions = geometry.attributes.position.array;
            
            // Compute face normals if not already computed
            if (!geometry.attributes.normal) {
                geometry.computeVertexNormals();
            }
            
            const faceCount = positions.length / 9;
            const cameraDirection = new THREE.Vector3();
            this.app.camera.getWorldDirection(cameraDirection);
            cameraDirection.normalize();
            
            let addedCount = 0;
            const PERPENDICULAR_THRESHOLD = 0.966; // cos(15°) - faces within 15° of perpendicular
            
            // First pass: identify candidate faces
            const candidates = [];
            
            for (let i = 0; i < faceCount; i++) {
                const i0 = i * 9;
                
                const v1 = new THREE.Vector3(positions[i0], positions[i0+1], positions[i0+2]);
                const v2 = new THREE.Vector3(positions[i0+3], positions[i0+4], positions[i0+5]);
                const v3 = new THREE.Vector3(positions[i0+6], positions[i0+7], positions[i0+8]);
                
                // Compute face normal
                const edge1 = new THREE.Vector3().subVectors(v2, v1);
                const edge2 = new THREE.Vector3().subVectors(v3, v1);
                const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2);
                
                if (faceNormal.length() < 0.0001) continue; // Degenerate face
                faceNormal.normalize();
                
                // Check if face is perpendicular to camera (flat from camera's view)
                // We want faces whose normal is perpendicular to the camera direction
                const dot = Math.abs(faceNormal.dot(cameraDirection));
                
                if (dot > PERPENDICULAR_THRESHOLD) {
                    const center = new THREE.Vector3()
                        .add(v1).add(v2).add(v3)
                        .multiplyScalar(1/3);
                    
                    candidates.push({
                        index: i,
                        center: center,
                        normal: faceNormal,
                        distance: this.app.camera.position.distanceTo(center)
                    });
                }
            }
            
            // Second pass: check visibility with raycasting
            candidates.forEach(candidate => {
                const directionToFace = new THREE.Vector3()
                    .subVectors(candidate.center, this.app.camera.position)
                    .normalize();
                
                this.raycaster.set(this.app.camera.position, directionToFace);
                this.raycaster.near = 0.1;
                this.raycaster.far = candidate.distance + 1;
                
                const intersects = this.raycaster.intersectObject(this.app.mesh);
                
                if (intersects.length > 0) {
                    const closestIntersect = intersects[0];
                    const distanceDiff = Math.abs(closestIntersect.distance - candidate.distance);
                    
                    // If the raycast hits very close to our candidate face, it's visible
                    if (distanceDiff < 1.0) {
                        if (!this.app.selectedFaces.has(candidate.index)) {
                            this.app.selectedFaces.add(candidate.index);
                            addedCount++;
                        }
                    }
                }
            });
            
            this.updateSelection();

            if (addedCount > 0) {
                this.app.log(`✓ Selected ${addedCount} visible flat faces`);
                this.app.log(`  Total selected: ${this.app.selectedFaces.size}`);
            } else {
                this.app.log(`⚠️ No suitable faces found. Try:
  1. Rotate camera to look straight at a flat surface
  2. Zoom closer to the area you want to select
  3. Ensure the surface is perpendicular to your view`);
            }

            // Push state to history - DISABLED
            // if (this.app.stateManager && addedCount > 0) {
            //     this.app.stateManager.pushState(`Selected ${addedCount} visible faces`, true);
            // }

            this.app.hideLoading();
        }, 100);
    }
    
    clearSelection() {
        const hadSelection = this.app.selectedFaces.size > 0;
        this.app.selectedFaces.clear();
        this.updateSelection();
        this.app.log('Selection cleared');

        // Push state to history - DISABLED
        // if (this.app.stateManager && hadSelection) {
        //     this.app.stateManager.pushState('Cleared selection', true);
        // }
    }
}

// ES module export
export { FaceSelector };
