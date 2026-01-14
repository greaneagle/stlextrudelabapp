// UI Controller - Handles all UI interactions
import { GeometryUtils } from './geometry-utils.js';
import { MeshSimplifier } from './mesh-simplifier.js';
import { EdgeEditor } from './edge-editor.js';
import { MeshBoolean } from './core/mesh-boolean.js';

class UIController {
    constructor(app) {
        this.app = app;
        this.init();
    }
    
    init() {
        this.setupCollapsibleSections();
        this.setupButtons();
        this.setupInputs();
        this.setupPresets();
        // this.setupHistoryControls(); // DISABLED - undo/redo too complex for this version
    }
    
    setupCollapsibleSections() {
        const headers = document.querySelectorAll('.section-header');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const section = header.parentElement;
                section.classList.toggle('collapsed');
            });
        });
    }
    
    setupButtons() {
        // Beta donate button - DISABLED (will be added back later)
        // const donateButton = document.getElementById('beta-donate-button');
        // if (donateButton) {
        //     donateButton.addEventListener('click', () => {
        //         // TODO: replace with real link once you choose a provider
        //         // Example:
        //         // window.open('https://buymeacoffee.com/YOUR_NAME', '_blank');

        //         this.app.log('Donate button clicked (placeholder). Configure real link later.');
        //         alert('Support link coming soon! This is a beta placeholder.');
        //     });
        // }

        // Save STL
        document.getElementById('save-stl-btn').addEventListener('click', () => {
            this.saveSTL();
        });
        
        // Selection buttons
        document.getElementById('select-visible-btn').addEventListener('click', () => {
            this.app.faceSelector.selectVisibleFlatFaces();
        });
        
        document.getElementById('clear-selection-btn').addEventListener('click', () => {
            this.app.faceSelector.clearSelection();
        });

        // DISABLED: Weld triangles button (for future use)
        // document.getElementById('weld-triangles-btn').addEventListener('click', () => {
        //     this.weldSelectedTriangles();
        // });

        // Simplify
        document.getElementById('simplify-btn').addEventListener('click', () => {
            this.simplifyMesh();
        });

        // Memory management
        document.getElementById('check-memory-btn').addEventListener('click', () => {
            this.checkMemoryUsage();
        });

        document.getElementById('cleanup-btn').addEventListener('click', () => {
            this.cleanupResources();
        });

        // Mesh validation and repair
        document.getElementById('validate-mesh-btn').addEventListener('click', () => {
            this.validateMesh();
        });

        document.getElementById('repair-mesh-btn').addEventListener('click', () => {
            this.repairMesh();
        });

        // Create end face
        document.getElementById('create-end-btn').addEventListener('click', () => {
            this.createEndFace();
        });
        
        // Boundary buttons
        document.getElementById('show-boundary-btn').addEventListener('click', () => {
            this.showBoundary();
        });
        
        document.getElementById('remove-edge-btn').addEventListener('click', () => {
            this.removeEdge();
        });
        
        document.getElementById('add-edge-btn').addEventListener('click', () => {
            this.addEdge();
        });
        
        document.getElementById('reorder-boundary-btn').addEventListener('click', () => {
            this.reorderBoundary();
        });
        
        // Waypoint buttons
        document.getElementById('add-waypoint-btn').addEventListener('click', () => {
            this.addWaypoint();
        });
        
        document.getElementById('remove-waypoint-btn').addEventListener('click', () => {
            this.removeWaypoint();
        });
        
        document.getElementById('update-waypoint-btn').addEventListener('click', () => {
            this.updateWaypoint();
        });
        
        // Generate pipe
        document.getElementById('generate-pipe-btn').addEventListener('click', () => {
            this.generatePipe();
        });

		// Fix boundaries button
		document.getElementById('fix-boundaries-btn').addEventListener('click', () => {
			this.fixBoundaries();
		});

		// Project state persistence - DISABLED (undo/redo disabled)
		// document.getElementById('save-project-btn')?.addEventListener('click', () => {
		// 	if (this.app.stateManager) {
		// 		this.app.stateManager.exportState();
		// 	} else {
		// 		alert('State manager not initialized');
		// 	}
		// });

		// document.getElementById('load-project-btn')?.addEventListener('click', () => {
		// 	// Trigger the hidden file input
		// 	document.getElementById('project-file-input')?.click();
		// });

		// document.getElementById('project-file-input')?.addEventListener('change', async (e) => {
		// 	const file = e.target.files[0];
		// 	if (file && this.app.stateManager) {
		// 		// Check file size FIRST before loading project
		// 		if (!this.app.checkFileSize(file, 5)) {
		// 			e.target.value = ''; // Clear input so user can try again
		// 			return;
		// 		}

		// 		// Check for unsaved changes before loading
		// 		if (this.app.stateManager.hasUnsavedChanges()) {
		// 			const choice = await this.app.confirmUnsavedChanges();

		// 			if (choice === 'cancel') {
		// 				this.app.log('Load project cancelled by user');
		// 				e.target.value = '';
		// 				return;
		// 			}

		// 			if (choice === 'save') {
		// 				// Save current project before loading new project
		// 				this.app.stateManager.exportState();
		// 				this.app.log('Project saved before loading new project');
		// 			}
		// 		}

		// 		try {
		// 			await this.app.stateManager.importState(file);
		// 			this.app.log('✔ Project loaded successfully');
		// 		} catch (error) {
		// 			this.app.log(`✗ Failed to load project: ${error.message}`);
		// 			alert(`Failed to load project: ${error.message}`);
		// 		}
		// 	}
		// 	// Reset file input so same file can be loaded again
		// 	e.target.value = '';
		// });
    }
    
	setupInputs() {
		// Wire weld tolerance to config
		const weldToleranceInput = document.getElementById('weld-tolerance');
		if (weldToleranceInput && this.app.config) {
			weldToleranceInput.value = this.app.config.weldTolerance;
			weldToleranceInput.addEventListener('change', () => {
				const v = parseFloat(weldToleranceInput.value);
				if (!isNaN(v) && v > 0) {
					this.app.config.weldTolerance = v;
					this.app.log(`Weld tolerance set to ${v}`);
				}
			});
		}

		// Reduction slider
		const slider = document.getElementById('reduction-slider');
		const valueDisplay = document.getElementById('reduction-value');
		slider.addEventListener('input', (e) => {
			valueDisplay.textContent = Math.round(e.target.value * 100) + '%';
		});
		
		// THROTTLE preview updates to prevent lag
		let previewTimeout = null;
		const throttledPreviewUpdate = () => {
			if (previewTimeout) {
				clearTimeout(previewTimeout);
			}
			previewTimeout = setTimeout(() => {
				if (document.getElementById('show-preview').checked) {
					this.updatePreview();
				}
			}, 300); // Wait 300ms after last change before updating
		};
		
		// All numeric inputs trigger preview update (THROTTLED)
		const inputs = [
			'length', 'offset-x', 'offset-y', 'offset-z',
			'rot-x', 'rot-y', 'rot-z', 'scale-x', 'scale-y', 'segments',
			'first-segment-split', 'final-segment-split'
		];
		
		inputs.forEach(id => {
			const input = document.getElementById(id);
			input.addEventListener('input', throttledPreviewUpdate);
		});
		
		// Preview checkbox
		document.getElementById('show-preview').addEventListener('change', (e) => {
			if (e.target.checked) {
				this.updatePreview();
			} else {
				this.app.clearPreview();
			}
		});
		
		// Waypoint list selection
		document.getElementById('waypoint-list').addEventListener('change', (e) => {
			this.loadWaypointSettings(e.target.selectedIndex);
		});
	}
    
    setupPresets() {
        const presetButtons = document.querySelectorAll('.preset-btn');
        presetButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const axis = btn.dataset.axis;
                const value = parseFloat(btn.dataset.value);

                // Set offset based on axis and direction
                const offsetAmount = 50 * value;
                document.getElementById(`offset-${axis}`).value = offsetAmount;

                if (document.getElementById('show-preview').checked) {
                    this.updatePreview();
                }
            });
        });
    }

    /**
     * Setup undo/redo controls and keyboard shortcuts - DISABLED (too complex for this version)
     */
    // setupHistoryControls() {
    //     // Button click handlers
    //     const undoBtn = document.getElementById('undo-btn');
    //     const redoBtn = document.getElementById('redo-btn');

    //     if (undoBtn) {
    //         undoBtn.addEventListener('click', () => {
    //             if (this.app.stateManager) {
    //                 this.app.stateManager.undo();
    //             }
    //         });
    //     }

    //     if (redoBtn) {
    //         redoBtn.addEventListener('click', () => {
    //             if (this.app.stateManager) {
    //                 this.app.stateManager.redo();
    //             }
    //         });
    //     }

    //     // Keyboard shortcuts
    //     document.addEventListener('keydown', (e) => {
    //         if (!this.app.stateManager) return;

    //         // Ctrl+Z / Cmd+Z - Undo
    //         if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    //             e.preventDefault();
    //             this.app.stateManager.undo();
    //         }

    //         // Ctrl+Y / Cmd+Shift+Z - Redo
    //         if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    //             e.preventDefault();
    //             this.app.stateManager.redo();
    //         }
    //     });
    // }

    /**
     * Called by StateManager when state is restored - DISABLED
     */
    // onStateRestored() {
    //     // Update selection count
    //     this.updateSelectionCount();

    //     // Re-apply waypoint list
    //     this.refreshWaypointList();

    //     // Update file info if mesh exists
    //     if (this.app.mesh && this.app.mesh.geometry) {
    //         const vertices = this.app.mesh.geometry.attributes.position.count;
    //         const faces = vertices / 3;

    //         const fileInfoEl = document.getElementById('file-info');
    //         if (fileInfoEl && fileInfoEl.textContent) {
    //             // Preserve filename and format if available
    //             const lines = fileInfoEl.textContent.split('\n');
    //             if (lines.length > 1) {
    //                 fileInfoEl.textContent = `${lines[0]}\n${lines[1]}\nVertices: ${vertices}\nFaces: ${faces}`;
    //             }
    //         }
    //     }
    // }

    /**
     * Refresh waypoint list UI
     */
    refreshWaypointList() {
        const list = document.getElementById('waypoint-list');
        if (!list) return;

        // Clear existing options
        list.innerHTML = '';

        // Add waypoints from app state
        this.app.waypoints.forEach((wp, idx) => {
            const option = document.createElement('option');
            option.textContent = `WP${idx+1}: L=${wp.length.toFixed(1)}, Scale=(${wp.scaleX.toFixed(2)},${wp.scaleY.toFixed(2)})`;
            list.appendChild(option);
        });
    }

    updateSelectionCount() {
        const count = this.app.selectedFaces.size;
        document.getElementById('selected-count').textContent = count;

        // Enable/disable weld button based on selection count
        const weldBtn = document.getElementById('weld-triangles-btn');
        if (weldBtn) {
            weldBtn.disabled = count !== 2;
            weldBtn.title = count === 2 ? 'Weld these 2 triangles at nearest edge' : 'Select exactly 2 triangles to weld';
        }
    }


	createEndFace() {
		try {
			if (this.app.selectedFaces.size === 0) {
				alert('Please select faces first');
				return;
			}

			// Extract and store boundary once
			if (!this.app.boundaryData) {
				const boundary = this.app.pipeGenerator.extractBoundary();
				if (boundary) {
					this.app.boundaryData = boundary;
					this.app.log('✔ Boundary extracted and stored');
					this.app.log(`  ${boundary.loops.length} loop(s), ${boundary.totalPoints} total points`);
				} else {
					alert('Failed to extract boundary. Try selecting different faces.');
					return;
				}
			}

			const endLocationStatus = document.getElementById('end-location-status');
			if (endLocationStatus) {
				endLocationStatus.textContent = '✔ End face created. Adjust position/rotation below.';
			}

			this.app.log('✔ End face created with consistent vertex ordering');

			if (document.getElementById('show-preview')?.checked) {
				this.updatePreview();
			}

			// Push state to history - DISABLED
			// if (this.app.stateManager) {
			// 	this.app.stateManager.pushState('Created end face', true);
			// }
		} catch (error) {
			this.app.log(`✗ Error in createEndFace: ${error.message}`);
			console.error('createEndFace error:', error);
			alert(`Error creating end face: ${error.message}`);
		}
	}

    addRotationVisualization(endFaceMesh, params) {
        // Get center of end face
        endFaceMesh.geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        endFaceMesh.geometry.boundingBox.getCenter(center);
        
        // Add yellow sphere at rotation center
        const sphereGeom = new THREE.SphereGeometry(2, 16, 16);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const sphere = new THREE.Mesh(sphereGeom, sphereMat);
        sphere.position.copy(center);

        // Track resources
        this.app.resourceTracker.track(sphere);

        this.app.scene.add(sphere);

        // Store for cleanup
        if (!this.app.rotationVisuals) this.app.rotationVisuals = [];
        this.app.rotationVisuals.push(sphere);
        
        // Calculate rotated axes
        const axisLength = 15;
        
        // Start with standard axes
        let xAxis = new THREE.Vector3(1, 0, 0);
        let yAxis = new THREE.Vector3(0, 1, 0);
        let zAxis = new THREE.Vector3(0, 0, 1);
        
        // Apply rotations in same order as the end face
        const rotateVector = (vec, angleX, angleY, angleZ) => {
            const v = vec.clone();
            
            // Rotate X
            if (angleX !== 0) {
                const rad = angleX * Math.PI / 180;
                const y = v.y * Math.cos(rad) - v.z * Math.sin(rad);
                const z = v.y * Math.sin(rad) + v.z * Math.cos(rad);
                v.y = y;
                v.z = z;
            }
            
            // Rotate Y
            if (angleY !== 0) {
                const rad = angleY * Math.PI / 180;
                const x = v.x * Math.cos(rad) + v.z * Math.sin(rad);
                const z = -v.x * Math.sin(rad) + v.z * Math.cos(rad);
                v.x = x;
                v.z = z;
            }
            
            // Rotate Z
            if (angleZ !== 0) {
                const rad = angleZ * Math.PI / 180;
                const x = v.x * Math.cos(rad) - v.y * Math.sin(rad);
                const y = v.x * Math.sin(rad) + v.y * Math.cos(rad);
                v.x = x;
                v.y = y;
            }
            
            return v;
        };
        
        xAxis = rotateVector(xAxis, params.rotX, params.rotY, params.rotZ);
        yAxis = rotateVector(yAxis, params.rotX, params.rotY, params.rotZ);
        zAxis = rotateVector(zAxis, params.rotX, params.rotY, params.rotZ);
        
        // Create arrows for each axis
        const createArrow = (direction, color) => {
            const arrowHelper = new THREE.ArrowHelper(
                direction.normalize(),
                center,
                axisLength,
                color,
                axisLength * 0.2,
                axisLength * 0.15
            );

            // Track arrow resources
            this.app.resourceTracker.track(arrowHelper);

            this.app.scene.add(arrowHelper);
            this.app.rotationVisuals.push(arrowHelper);
        };
        
        // X axis - Red
        createArrow(xAxis, 0xff0000);
        
        // Y axis - Green
        createArrow(yAxis, 0x00ff00);
        
        // Z axis - Blue
        createArrow(zAxis, 0x0000ff);
    }
    
generatePipe() {
    if (!this.app.mesh || this.app.selectedFaces.size === 0) {
        alert('Please select faces first');
        return;
    }

    this.app.showLoading('Generating pipe...');

    setTimeout(() => {
        const params = this.getParameters();
        const result = this.app.pipeGenerator.generatePipe(params, false);

        if (result && result.pipe) {
            this.app.clearPreview();
            this.app.scene.remove(this.app.mesh);

            this.app.log('🔧 Building final mesh...');

            // Remove selected faces to create a hole
            const originalGeometry = this.app.mesh.geometry.clone();
            const cleanedOriginal = GeometryUtils.removeFaces(originalGeometry, Array.from(this.app.selectedFaces));
            this.app.log(`  Removed ${this.app.selectedFaces.size} selected faces from original`);

            // SIMPLER FIX: Use aggressive welding at the merge to close small gaps
            // This handles concave selections where vertices don't perfectly align
            this.app.log('🔧 Using aggressive welding for first ring connection...');

            const material = new THREE.MeshPhongMaterial({
                color: 0x87CEEB,
                side: THREE.DoubleSide,
                flatShading: false
            });

            // Check if CSG library is available for robust boolean operations
            // NOTE: CSG is currently disabled by default due to transform issues
            // Use improved manual merge which has much better tolerances now
            const useCSG = false; // Set to true to enable CSG (experimental)
            const csgAvailable = MeshBoolean.isAvailable();
            this.app.log(`  Merge method: ${useCSG ? 'CSG boolean (experimental)' : 'Manual merge (improved)'}`);
            if (csgAvailable && !useCSG) {
                this.app.log(`  Note: CSG available but disabled. Set useCSG=true to enable.`);
            }

            let finalMesh;

            if (useCSG && csgAvailable) {
                // Use CSG for robust, watertight merging
                this.app.log('  Using CSG union for watertight merge...');

                // Create base mesh
                const baseMesh = new THREE.Mesh(cleanedOriginal, material);
                baseMesh.position.set(0, 0, 0);
                baseMesh.rotation.set(0, 0, 0);
                baseMesh.scale.set(1, 1, 1);
                baseMesh.updateMatrixWorld(true);

                // Ensure pipe mesh has updated world matrix
                result.pipe.updateMatrixWorld(true);

                // Merge pipe with base using CSG union
                finalMesh = MeshBoolean.union(baseMesh, result.pipe);

                // If we have an end face, merge that too
                if (result.endFace) {
                    this.app.log('  Merging end face with CSG union...');
                    result.endFace.updateMatrixWorld(true);
                    const tempMesh = finalMesh;
                    finalMesh = MeshBoolean.union(tempMesh, result.endFace);
                    // Clean up temp mesh
                    this.app.resourceTracker.disposeResource(tempMesh.geometry);
                }

                // Update material reference
                finalMesh.material = material;

            } else {
                // Fallback to manual merge
                this.app.log('  Using manual merge...');

                let mergedGeometry = this.mergeMeshes(
                    cleanedOriginal,
                    result.pipe.geometry
                );

                // Merge end face if we got one
                if (result.endFace) {
                    this.app.log('  Merging end face...');
                    mergedGeometry = this.mergeMeshes(
                        mergedGeometry,
                        result.endFace.geometry
                    );
                }

                finalMesh = new THREE.Mesh(mergedGeometry, material);
            }

            // CRITICAL: Rebuild geometry to ensure clean face indexing
            // This makes the merged geometry behave like a freshly loaded mesh
            const finalGeometry = finalMesh.geometry;

            // Convert to non-indexed geometry for clean face selection
            let cleanGeometry;
            if (finalGeometry.index) {
                // Has index - convert to non-indexed
                cleanGeometry = finalGeometry.toNonIndexed();
                this.app.log('  Converting to non-indexed geometry for clean face selection');
            } else {
                // Already non-indexed - clone it
                cleanGeometry = finalGeometry.clone();
            }

            // Apply the same cleanup used for STL export (weld vertices, remove degenerate faces)
            this.app.log('  Cleaning geometry (welding vertices, removing degenerate faces)...');

            // CRITICAL FIX: Use 10x aggressive welding tolerance to close gaps from concave selections
            // This ensures the pipe's first ring welds to the hole edge even if not perfectly aligned
            const baseWeldTol = this.app.config?.weldTolerance || 0.001;
            const aggressiveWeldTol = baseWeldTol * 10; // 0.01 instead of 0.001
            this.app.log(`  Using aggressive weld tolerance: ${aggressiveWeldTol} (10x normal)`);

            cleanGeometry = GeometryUtils.prepareForExport(cleanGeometry, aggressiveWeldTol);

            // Ensure geometry is still non-indexed (prepareForExport might have changed it)
            if (cleanGeometry.index) {
                this.app.log('  Re-converting to non-indexed for face selection compatibility');
                cleanGeometry = cleanGeometry.toNonIndexed();
            }

            // Validate the cleaned geometry
            const cleanReport = this.app.meshIntegrityChecker.validate(cleanGeometry);
            if (cleanReport.valid) {
                this.app.log('  ✓ Geometry validated: clean and watertight');
            } else {
                this.app.log('  ⚠️ Geometry has minor issues (acceptable for continued work):');
                cleanReport.warnings.forEach(w => this.app.log(`    - ${w}`));
            }

            // Recompute bounding box
            cleanGeometry.computeBoundingBox();

            // Apply normals based on view mode
            if (!this.app.rawViewMode) {
                cleanGeometry.computeVertexNormals();
            }

            // Create fresh mesh with clean geometry
            this.app.mesh = new THREE.Mesh(cleanGeometry, material);

            // Track resources
            this.app.resourceTracker.track(cleanGeometry);
            this.app.resourceTracker.track(material);
            this.app.resourceTracker.track(this.app.mesh);

            this.app.scene.add(this.app.mesh);

            // RESET STATE for continued work on the new mesh
            // 1. Clear selection
            this.app.selectedFaces.clear();
            this.updateSelectionCount();

            // 2. Update original geometry reference to new mesh
            if (this.app.originalGeometry) {
                this.app.resourceTracker.disposeResource(this.app.originalGeometry);
            }
            this.app.originalGeometry = cleanGeometry.clone();
            this.app.resourceTracker.track(this.app.originalGeometry);

            // 3. Reset boundary data and waypoints
            this.app.boundaryData = null;
            this.app.waypoints = [];

            // 4. Clear waypoint UI
            const waypointList = document.getElementById('waypoint-list');
            if (waypointList) waypointList.innerHTML = '';

            // 5. Reset status displays
            const endLocationStatus = document.getElementById('end-location-status');
            if (endLocationStatus) endLocationStatus.textContent = 'No end face created';

            const boundaryStatus = document.getElementById('boundary-status');
            if (boundaryStatus) boundaryStatus.textContent = 'No boundary computed';

            // 6. Update file info
            const currentGeometry = this.app.mesh.geometry;
            const currentFaces = currentGeometry.attributes.position.count / 3;
            const fileInfo = document.getElementById('file-info');
            if (fileInfo) {
                const currentText = fileInfo.textContent;
                const lines = currentText.split('\n');
                // Keep the filename and format, update counts
                if (lines.length >= 2) {
                    fileInfo.textContent = `${lines[0]}\n${lines[1]}\nVertices: ${currentGeometry.attributes.position.count}\nFaces: ${currentFaces}`;
                } else {
                    fileInfo.textContent = `Current mesh\nVertices: ${currentGeometry.attributes.position.count}\nFaces: ${currentFaces}`;
                }
            }

            // 7. Apply view mode (normals already computed above)
            this.app.mesh.material.flatShading = this.app.rawViewMode;
            this.app.mesh.material.needsUpdate = true;

            // 8. Recreate wireframe if it was enabled
            const wireframeCheckbox = document.getElementById('show-wireframe');
            if (wireframeCheckbox && wireframeCheckbox.checked) {
                // Dispose old wireframe
                if (this.app.wireframeMesh) {
                    this.app.scene.remove(this.app.wireframeMesh);
                    this.app.resourceTracker.disposeResource(this.app.wireframeMesh);
                    this.app.wireframeMesh = null;
                }
                // Recreate wireframe for new mesh
                this.app.toggleWireframe(true);
            }

            this.app.log('✓ Extrusion generated successfully!');
            this.app.log(`  Final mesh: ${currentGeometry.attributes.position.count} vertices, ${currentFaces} faces`);
            this.app.log('✓ Mesh reset - ready for new selections');

            // Push state to history - DISABLED
            // if (this.app.stateManager) {
            //     this.app.stateManager.pushState('Generated pipe', true);
            // }

            this.app.hideLoading();
        } else {
            this.app.hideLoading();
            this.app.log('✗ Extrusion generation failed');
            alert('Failed to generate extrusion. Check the console for errors.');
        }
    }, 100);
}
    
   /* mergeMeshes(geo1, geo2) {
        const mergedGeometry = new THREE.BufferGeometry();
        
        const positions1 = geo1.attributes.position.array;
        const positions2 = geo2.attributes.position.array;
        
        const totalPositions = new Float32Array(positions1.length + positions2.length);
        totalPositions.set(positions1);
        totalPositions.set(positions2, positions1.length);
        
        mergedGeometry.setAttribute('position', new THREE.BufferAttribute(totalPositions, 3));
        mergedGeometry.computeVertexNormals();
        
        return mergedGeometry;
    }*/
	
	mergeMeshes(geo1, geo2) {
		// Convert to non-indexed for easier merging
		const g1 = geo1.index ? geo1.toNonIndexed() : geo1;
		const g2 = geo2.index ? geo2.toNonIndexed() : geo2;

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

		// Weld with configurable tolerance to connect adjacent rings properly
		const weldTol = this.app.config?.weldTolerance || 0.001;
		const weldedGeometry = GeometryUtils.weldVertices(mergedGeometry, weldTol);

		// Skip degenerate face removal to preserve all geometry including tiny triangles on curves
		// (Degenerate removal was deleting valid small faces on curved surfaces)

		// Recompute normals for smooth shading
		weldedGeometry.computeVertexNormals();

		this.app.log(`  Merged and welded: ${mergedGeometry.attributes.position.count} → ${weldedGeometry.attributes.position.count} vertices`);

		return weldedGeometry;
	}

		
    getParameters() {
        return {
            length: parseFloat(document.getElementById('length').value) || 50,
            offsetX: parseFloat(document.getElementById('offset-x').value) || 0,
            offsetY: parseFloat(document.getElementById('offset-y').value) || 0,
            offsetZ: parseFloat(document.getElementById('offset-z').value) || 0,
            rotX: parseFloat(document.getElementById('rot-x').value) || 0,
            rotY: parseFloat(document.getElementById('rot-y').value) || 0,
            rotZ: parseFloat(document.getElementById('rot-z').value) || 0,
            scaleX: parseFloat(document.getElementById('scale-x').value) || 1,
            scaleY: parseFloat(document.getElementById('scale-y').value) || 1,
            segments: parseInt(document.getElementById('segments').value) || 20,
            finalSegmentSplit: parseInt(document.getElementById('final-segment-split').value) || 0,
            firstSegmentSplit: parseInt(document.getElementById('first-segment-split').value) || 0
        };
    }
    
    async simplifyMesh() {
        if (!this.app.mesh) {
            alert('Load a mesh first');
            return;
        }

        // Validate reduction value
        const reduction = parseFloat(document.getElementById('reduction-slider').value);
        if (isNaN(reduction) || reduction < 0 || reduction > 1) {
            alert('Invalid reduction value. Please use slider to select a value between 0% and 100%');
            return;
        }

        const originalGeometry = this.app.mesh.geometry;
        const originalFaceCount = originalGeometry.attributes.position.count / 3;

        // Check if mesh is already very simple
        if (originalFaceCount < 10) {
            alert('Mesh is too simple to simplify (less than 10 faces)');
            return;
        }

        this.app.log(`Starting mesh simplification...`);
        this.app.log(`  Original: ${Math.floor(originalFaceCount)} faces`);
        this.app.log(`  Target reduction: ${Math.round(reduction * 100)}%`);

        // Show progress UI
        const progressContainer = document.getElementById('simplify-progress');
        const progressBar = document.getElementById('simplify-progress-bar');
        const progressText = document.getElementById('simplify-progress-text');
        const progressPercent = document.getElementById('simplify-progress-percent');
        const simplifyBtn = document.getElementById('simplify-btn');

        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = 'Starting worker thread...';
        progressPercent.textContent = '0%';
        simplifyBtn.disabled = true;

        const startTime = performance.now();

        try {
            // Run simplification in main thread using MeshSimplifier
            const simplifier = new MeshSimplifier();
            const simplifiedGeometry = simplifier.simplify(originalGeometry, reduction);

            // Show finalizing step
            progressBar.style.width = '100%';
            progressText.textContent = 'Finalizing geometry...';
            progressPercent.textContent = '100%';

            const newFaceCount = Math.floor(simplifiedGeometry.attributes.position.count / 3);
            const actualReduction = ((1 - newFaceCount / originalFaceCount) * 100).toFixed(1);
            const processingTime = ((performance.now() - startTime) / 1000).toFixed(2);

            // Update mesh - dispose old geometry through resource tracker
            this.app.resourceTracker.disposeResource(this.app.mesh.geometry);
            this.app.mesh.geometry = simplifiedGeometry;

            // Track new geometry
            this.app.resourceTracker.track(simplifiedGeometry);

            // Update wireframe if it's currently displayed
            if (this.app.wireframeMesh) {
                // Remove old wireframe
                this.app.scene.remove(this.app.wireframeMesh);
                this.app.resourceTracker.disposeResource(this.app.wireframeMesh);
                this.app.wireframeMesh = null;

                // Recreate wireframe with new geometry
                const wireframeCheckbox = document.getElementById('show-wireframe');
                if (wireframeCheckbox && wireframeCheckbox.checked) {
                    this.app.toggleWireframe(true);
                }
            }

            // Clear selection (face indices are now invalid after simplification)
            this.app.selectedFaces.clear();
            this.updateSelectionCount();

            this.app.log(`✓ Simplification complete in ${processingTime}s!`);
            this.app.log(`  New: ${newFaceCount} faces (reduced from ${Math.floor(originalFaceCount)})`);
            this.app.log(`  Actual reduction: ${actualReduction}%`);

            // Update file info
            const fileInfoEl = document.getElementById('file-info');
            const fileInfoLines = fileInfoEl.textContent.split('\n');
            fileInfoEl.textContent =
                (fileInfoLines[0] || 'Simplified mesh') + '\n' +
                (fileInfoLines[1] || '') + (fileInfoLines[1] ? '\n' : '') +
                `Vertices: ${simplifiedGeometry.attributes.position.count}\n` +
                `Faces: ${newFaceCount}`;

            // Push state to history - DISABLED
            // if (this.app.stateManager) {
            //     this.app.stateManager.pushState(`Simplified mesh (${actualReduction}% reduction)`, true);
            // }

            // Hide progress UI after short delay
            setTimeout(() => {
                progressContainer.style.display = 'none';
                simplifyBtn.disabled = false;
            }, 500);

        } catch (error) {
            this.app.log(`✗ Simplification failed: ${error.message}`);
            console.error('Simplification error:', error);

            let errorMsg = 'Simplification failed';
            if (error.message.includes('timeout')) {
                errorMsg = 'Simplification timed out. Try a smaller reduction percentage.';
            } else if (error.message.includes('worker')) {
                errorMsg = 'Worker thread error. Try refreshing the page.';
            } else {
                errorMsg = `Simplification failed: ${error.message}`;
            }

            alert(errorMsg);

            // Hide progress UI on error
            progressContainer.style.display = 'none';
            simplifyBtn.disabled = false;
        }
    }
    
    showBoundary() {
        this.app.log('🔍 Computing boundary edges...');
        const boundary = this.app.pipeGenerator.extractBoundary();
        
        if (boundary) {
            this.app.boundaryData = boundary;
            
            // Initialize edge editor
            if (!this.app.edgeEditor) {
                this.app.edgeEditor = new EdgeEditor(this.app);
            }
            
            const success = this.app.edgeEditor.initializeFromBoundary(boundary);
            
            if (!success) {
                this.app.log('✗ Failed to initialize edge editor');
                return;
            }
            
            this.app.clearBoundaryVisuals();
            this.refreshBoundaryVisualization();
            
            // Update point spinners max values
            const maxPoint = this.app.edgeEditor.pointMap.size - 1;
            document.getElementById('point-a').max = maxPoint;
            document.getElementById('point-b').max = maxPoint;
            
            document.getElementById('boundary-status').textContent = 
                `✓ ${boundary.loops.length} loops, ${boundary.totalPoints} points - Ready for editing`;
            
            this.app.log(`✓ Boundary computed: ${boundary.loops.length} loops, ${boundary.totalPoints} total points`);
            this.app.log(`  ${boundary.loops.length === 1 ? 'Simple edge' : `1 outer + ${boundary.loops.length - 1} inner holes`}`);
            this.app.log(`  Manual editing enabled: use Point A/B to add/remove edges`);
        } else {
            this.app.log('✗ No boundary found');
        }
    }
    
    createTextSprite(text, parameters = {}) {
        const fontface = parameters.fontface || 'Arial';
        const fontsize = parameters.fontsize || 18;
        const backgroundColor = parameters.backgroundColor || { r: 0, g: 0, b: 0, a: 1.0 };
        const textColor = parameters.textColor || { r: 255, g: 255, b: 255, a: 1.0 };
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 64;
        
        context.font = `Bold ${fontsize}px ${fontface}`;
        
        // Background
        context.fillStyle = `rgba(${backgroundColor.r},${backgroundColor.g},${backgroundColor.b},${backgroundColor.a})`;
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Text
        context.fillStyle = `rgba(${textColor.r},${textColor.g},${textColor.b},${textColor.a})`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(10, 5, 1);
        
        return sprite;
    }
    
    removeEdge() {
        const pointA = parseInt(document.getElementById('point-a').value);
        const pointB = parseInt(document.getElementById('point-b').value);

        if (isNaN(pointA) || isNaN(pointB)) {
            alert('Please enter valid point numbers');
            return;
        }

        if (!this.app.edgeEditor) {
            alert('Please show boundary edges first');
            return;
        }

        const success = this.app.edgeEditor.removeEdge(pointA, pointB);

        if (success) {
            // Refresh visualization
            this.refreshBoundaryVisualization();

            // Push state to history - DISABLED
            // if (this.app.stateManager) {
            //     this.app.stateManager.pushState(`Removed edge ${pointA}-${pointB}`, true);
            // }
        }
    }
    
    addEdge() {
        const pointA = parseInt(document.getElementById('point-a').value);
        const pointB = parseInt(document.getElementById('point-b').value);

        if (isNaN(pointA) || isNaN(pointB)) {
            alert('Please enter valid point numbers');
            return;
        }

        if (!this.app.edgeEditor) {
            alert('Please show boundary edges first');
            return;
        }

        const success = this.app.edgeEditor.addEdge(pointA, pointB);

        if (success) {
            // Refresh visualization
            this.refreshBoundaryVisualization();

            // Push state to history - DISABLED
            // if (this.app.stateManager) {
            //     this.app.stateManager.pushState(`Added edge ${pointA}-${pointB}`, true);
            // }
        }
    }
    
    reorderBoundary() {
        if (!this.app.edgeEditor) {
            alert('Please show boundary edges first');
            return;
        }

        // Validate topology first
        const validation = this.app.edgeEditor.validateTopology();

        if (!validation.valid) {
            this.app.log('⚠️ Topology validation warnings:');
            validation.issues.forEach(issue => this.app.log(`  - ${issue}`));

            const proceed = confirm(
                'Boundary has topology issues:\n\n' +
                validation.issues.join('\n') +
                '\n\nProceed with reordering anyway?'
            );

            if (!proceed) return;
        }

        const newBoundary = this.app.edgeEditor.reorderBoundary();

        if (newBoundary) {
            // Update app boundary data
            this.app.boundaryData = newBoundary;

            // Show statistics
            const stats = this.app.edgeEditor.getStatistics();
            this.app.log(`📊 Boundary statistics:`);
            this.app.log(`  Points: ${stats.points}`);
            this.app.log(`  Active edges: ${stats.activeEdges}`);
            this.app.log(`  Removed edges: ${stats.removedEdges}`);
            this.app.log(`  Degree distribution: ${JSON.stringify(stats.degreeDistribution)}`);

            // Refresh visualization
            this.refreshBoundaryVisualization();

            // Push state to history - DISABLED
            // if (this.app.stateManager) {
            //     this.app.stateManager.pushState('Reordered boundary', true);
            // }
        }
    }
    
    refreshBoundaryVisualization() {
        if (!this.app.edgeEditor) return;
        
        // Clear old visuals
        this.app.clearBoundaryVisuals();
        
        // Get current edges
        const edges = this.app.edgeEditor.getCurrentEdges();
        
        // Visualize points
        for (let i = 0; i < this.app.edgeEditor.pointMap.size; i++) {
            const info = this.app.edgeEditor.getPointInfo(i);
            if (!info) continue;
            
            // Color based on degree
            let color = 0xffff00; // Yellow = normal (degree 2)
            if (info.degree < 2) color = 0xff0000; // Red = dangling
            else if (info.degree > 2) color = 0xff00ff; // Magenta = non-manifold
            
            // Point sphere
            const sphereGeom = new THREE.SphereGeometry(1.5, 16, 16);
            const sphereMat = new THREE.MeshBasicMaterial({ color: color });
            const sphere = new THREE.Mesh(sphereGeom, sphereMat);
            sphere.position.copy(info.position);

            // Track resources
            this.app.resourceTracker.track(sphere);

            this.app.scene.add(sphere);
            this.app.boundaryVisuals.push(sphere);

            // Label
            const sprite = this.createTextSprite(i.toString(), {
                fontsize: 24,
                backgroundColor: { r: 0, g: 0, b: 0, a: 0.7 },
                textColor: { r: 255, g: 255, b: 0, a: 1.0 }
            });
            sprite.position.copy(info.position);
            sprite.position.y += 3;

            // Track sprite resources
            this.app.resourceTracker.track(sprite);

            this.app.scene.add(sprite);
            this.app.boundaryVisuals.push(sprite);
        }
        
        // Visualize edges
        edges.forEach((edge, idx) => {
            const points = [edge.posA, edge.posB];
            const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
            const lineMat = new THREE.LineBasicMaterial({
                color: idx % 2 === 0 ? 0x00ff00 : 0x00ffff,
                linewidth: 2
            });
            const line = new THREE.Line(lineGeom, lineMat);

            // Track line resources
            this.app.resourceTracker.track(line);

            this.app.scene.add(line);
            this.app.boundaryVisuals.push(line);
        });
        
        this.app.log(`🔄 Visualization refreshed: ${edges.length} edges`);
    }
    
    addWaypoint() {
        const params = this.getParameters();
        const waypoint = {
            length: params.length,
            offsetX: params.offsetX,
            offsetY: params.offsetY,
            offsetZ: params.offsetZ,
            rotX: params.rotX,
            rotY: params.rotY,
            rotZ: params.rotZ,
            scaleX: params.scaleX,
            scaleY: params.scaleY
        };

        this.app.waypoints.push(waypoint);

        const list = document.getElementById('waypoint-list');
        const option = document.createElement('option');
        option.textContent = `WP${this.app.waypoints.length}: L=${waypoint.length.toFixed(1)}, Scale=(${waypoint.scaleX.toFixed(2)},${waypoint.scaleY.toFixed(2)})`;
        list.appendChild(option);

        this.app.log(`➕ Added waypoint #${this.app.waypoints.length}`);

        if (document.getElementById('show-preview').checked) {
            this.updatePreview();
        }

        // Push state to history - DISABLED
        // if (this.app.stateManager) {
        //     this.app.stateManager.pushState(`Added waypoint #${this.app.waypoints.length}`, true);
        // }
    }
    
    removeWaypoint() {
        const list = document.getElementById('waypoint-list');
        const index = list.selectedIndex;

        if (index >= 0) {
            this.app.waypoints.splice(index, 1);
            list.remove(index);
            this.app.log(`➖ Removed waypoint #${index + 1}`);

            if (document.getElementById('show-preview').checked) {
                this.updatePreview();
            }

            // Push state to history - DISABLED
            // if (this.app.stateManager) {
            //     this.app.stateManager.pushState(`Removed waypoint #${index + 1}`, true);
            // }
        }
    }
    
    updateWaypoint() {
        const list = document.getElementById('waypoint-list');
        const index = list.selectedIndex;

        if (index >= 0) {
            const params = this.getParameters();
            this.app.waypoints[index] = {
                length: params.length,
                offsetX: params.offsetX,
                offsetY: params.offsetY,
                offsetZ: params.offsetZ,
                rotX: params.rotX,
                rotY: params.rotY,
                rotZ: params.rotZ,
                scaleX: params.scaleX,
                scaleY: params.scaleY
            };

            const wp = this.app.waypoints[index];
            list.options[index].textContent =
                `WP${index+1}: L=${wp.length.toFixed(1)}, Scale=(${wp.scaleX.toFixed(2)},${wp.scaleY.toFixed(2)})`;

            this.app.log(`🔄 Updated waypoint #${index + 1}`);

            if (document.getElementById('show-preview').checked) {
                this.updatePreview();
            }

            // Push state to history - DISABLED
            // if (this.app.stateManager) {
            //     this.app.stateManager.pushState(`Updated waypoint #${index + 1}`, true);
            // }
        }
    }
    
    loadWaypointSettings(index) {
        if (index >= 0 && index < this.app.waypoints.length) {
            const wp = this.app.waypoints[index];
            document.getElementById('length').value = wp.length;
            document.getElementById('offset-x').value = wp.offsetX;
            document.getElementById('offset-y').value = wp.offsetY;
            document.getElementById('offset-z').value = wp.offsetZ;
            document.getElementById('rot-x').value = wp.rotX;
            document.getElementById('rot-y').value = wp.rotY;
            document.getElementById('rot-z').value = wp.rotZ;
            document.getElementById('scale-x').value = wp.scaleX;
            document.getElementById('scale-y').value = wp.scaleY;
        }
    }
    
    saveSTL() {
        if (!this.app.mesh) {
            alert('No mesh to save');
            return;
        }

        this.app.showLoading('Preparing mesh for export...');

        setTimeout(() => {
            try {
                this.app.log('💾 Preparing STL export...');

                // Step 1: Validate mesh integrity
                const validationReport = this.app.meshIntegrityChecker.validate(this.app.mesh.geometry);

                if (!validationReport.valid) {
                    this.app.log('⚠️ Mesh validation warnings:');
                    validationReport.warnings.forEach(w => this.app.log(`  - ${w}`));

                    // Only prompt if there are fixable issues (degenerate faces, inverted normals)
                    const hasFixableIssues = validationReport.stats.degenerateFaces > 0 ||
                                            validationReport.stats.invertedNormals > 0;

                    if (hasFixableIssues) {
                        const shouldContinue = confirm(
                            'Mesh has validation warnings:\n\n' +
                            validationReport.warnings.join('\n') +
                            '\n\nWould you like to automatically clean the mesh before export?'
                        );

                        if (!shouldContinue) {
                            this.app.hideLoading();
                            return;
                        }
                    } else {
                        // Non-fixable issues - just warn but continue
                        this.app.log('  Note: These warnings are informational only and won\'t affect export');
                    }
                }

                // Step 2: Prepare geometry for export (weld vertices, remove degenerate faces)
                this.app.log('  Cleaning geometry for export...');
                const weldTol = this.app.config?.weldTolerance || 0.001;
                const exportGeometry = GeometryUtils.prepareForExport(this.app.mesh.geometry.clone(), weldTol);

                // Step 3: Final validation
                const finalReport = this.app.meshIntegrityChecker.validate(exportGeometry);
                if (finalReport.valid) {
                    this.app.log('  ✓ Export geometry validated successfully');
                } else {
                    this.app.log('  ⚠️ Some issues remain after cleanup:');
                    finalReport.warnings.forEach(w => this.app.log(`    - ${w}`));
                }

                // Step 4: Create temporary mesh with cleaned geometry for export
                const exportMesh = new THREE.Mesh(
                    exportGeometry,
                    this.app.mesh.material
                );

                // Step 5: Export to STL (binary format for better precision and smaller file size)
                const exporter = new THREE.STLExporter();
                const stlData = exporter.parse(exportMesh, { binary: true });

                // Step 5: Save file
                const blob = new Blob([stlData], { type: 'application/octet-stream' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = 'STLExtrudeLabFile.stl';
                link.click();

                const vertices = exportGeometry.attributes.position.count;
                const faces = exportGeometry.index ? exportGeometry.index.count / 3 : vertices / 3;

                this.app.log('✓ STL file saved successfully!');
                this.app.log(`  Format: Binary STL`);
                this.app.log(`  Vertices: ${vertices}, Faces: ${faces}`);

                this.app.hideLoading();

            } catch (error) {
                this.app.hideLoading();
                this.app.log(`✗ Export error: ${error.message}`);
                console.error('STL Export Error:', error);
                alert(`Failed to export STL: ${error.message}`);
            }
        }, 100);
    }
	
	
	fixBoundaries() {
		if (!this.app.boundaryData) {
			alert('Please click "Show Boundary Edges" first');
			return;
		}

		this.app.showLoading('Analyzing and fixing boundaries...');

		setTimeout(() => {
			const result = this.app.pipeGenerator.fixBoundaries();

			const statusDiv = document.getElementById('fix-status');

			if (result.success) {
				statusDiv.textContent = `✔ ${result.message}`;
				statusDiv.style.display = 'block';
				statusDiv.style.color = '#2e7d32';

				// Refresh visualization
				this.refreshBoundaryVisualization();

				// Update preview if enabled
				if (document.getElementById('show-preview').checked) {
					this.updatePreview();
				}

				this.app.log(result.message);

				// Push state to history - DISABLED
				// if (this.app.stateManager) {
				// 	this.app.stateManager.pushState('Auto-fixed boundaries', true);
				// }
			} else {
				statusDiv.textContent = `ℹ️ ${result.message}`;
				statusDiv.style.display = 'block';
				statusDiv.style.color = '#ff6600';

				this.app.log(result.message);
			}

			this.app.hideLoading();
		}, 100);
	}
	
	
	updatePreview() {
		if (!this.app.mesh || this.app.selectedFaces.size === 0) {
			return;
		}

		if (!this.app.boundaryData) {
			this.app.log('⚠️ Create end face first');
			return;
		}

		// Clear previews AND debug visuals
		this.app.clearPreview();

		// Clear debug visuals if any
		if (this.app.debugVisuals) {
			this.app.debugVisuals.forEach(obj => {
				this.app.scene.remove(obj);
				this.app.resourceTracker.disposeResource(obj);
			});
			this.app.debugVisuals = [];
		}

		const params = this.getParameters();

		// Generate preview
		const preview = this.app.pipeGenerator.generatePipe(params, true);

		if (preview) {
			this.app.previewMesh = preview.pipe;
			this.app.previewEndFace = preview.endFace;
			this.app.previewWaypoints = preview.waypoints || [];

			// Track preview resources
			if (preview.pipe) {
				this.app.resourceTracker.track(preview.pipe);
				this.app.scene.add(preview.pipe);
			}
			if (preview.endFace) {
				this.app.resourceTracker.track(preview.endFace);
				this.app.scene.add(preview.endFace);

				// Add rotation center and axes
				this.addRotationVisualization(preview.endFace, params);
			}
			preview.waypoints?.forEach(wp => {
				this.app.resourceTracker.track(wp);
				this.app.scene.add(wp);
			});
		}
	}

	/**
	 * Check memory usage and display statistics
	 */
	checkMemoryUsage() {
		const report = this.app.resourceTracker.getReport();

		// Update statistics display
		document.getElementById('stat-tracked').textContent = report.stats.totalTracked;
		document.getElementById('stat-geometries').textContent = report.stats.geometries;
		document.getElementById('stat-materials').textContent = report.stats.materials;
		document.getElementById('stat-textures').textContent = report.stats.textures;
		document.getElementById('stat-disposed').textContent = report.stats.totalDisposed;
		document.getElementById('stat-memory').textContent = report.memory;

		// Show statistics
		document.getElementById('memory-stats').style.display = 'block';

		// Handle warnings
		const warningsDiv = document.getElementById('memory-warnings');
		const warningsList = document.getElementById('warnings-list');

		if (report.leaks) {
			warningsList.innerHTML = report.warnings.map(w => `<div>• ${w}</div>`).join('');
			warningsDiv.style.display = 'block';
			this.app.log('⚠️ Memory warnings detected:');
			report.warnings.forEach(w => this.app.log(`  - ${w}`));
		} else {
			warningsDiv.style.display = 'none';
			this.app.log('✔ Memory usage is healthy');
		}

		// Log detailed report
		this.app.log(`📊 Memory Report:`);
		this.app.log(`  Tracked: ${report.stats.totalTracked} resources`);
		this.app.log(`  Geometries: ${report.stats.geometries}`);
		this.app.log(`  Materials: ${report.stats.materials}`);
		this.app.log(`  Textures: ${report.stats.textures}`);
		this.app.log(`  Disposed: ${report.stats.totalDisposed}`);
		this.app.log(`  Memory: ${report.memory} (${report.memoryBytes} bytes)`);
	}

	/**
	 * Clean up unused resources and idle workers
	 */
	cleanupResources() {
		this.app.log('🧹 Starting resource cleanup...');

		// Clean up idle workers
		const workersRemoved = this.app.simplificationWorkerManager.cleanup();
		if (workersRemoved > 0) {
			this.app.log(`  ✔ Terminated ${workersRemoved} idle worker(s)`);
		}

		// Get memory stats before cleanup
		const beforeMemory = this.app.resourceTracker.getMemoryEstimate();

		// Clean up temporary preview objects
		this.app.clearPreview();
		this.app.clearBoundaryVisuals();

		// Clean up selection overlay
		const selectionOverlay = this.app.scene.getObjectByName('selection-overlay');
		if (selectionOverlay) {
			this.app.scene.remove(selectionOverlay);
			this.app.resourceTracker.disposeResource(selectionOverlay);
		}

		// Get memory stats after cleanup
		const afterMemory = this.app.resourceTracker.getMemoryEstimate();
		const savedBytes = beforeMemory - afterMemory;

		this.app.log(`  ✔ Cleaned up preview and temporary objects`);

		if (savedBytes > 0) {
			const savedMB = (savedBytes / (1024 * 1024)).toFixed(2);
			this.app.log(`  ✔ Freed approximately ${savedMB} MB`);
		}

		// Update memory display
		this.checkMemoryUsage();

		this.app.log('✔ Cleanup complete!');
	}

	/**
	 * Validate mesh integrity
	 */
	validateMesh() {
		if (!this.app.mesh) {
			alert('Load a mesh first');
			return;
		}

		this.app.log('🔍 Validating mesh integrity...');

		const report = this.app.meshIntegrityChecker.validate(this.app.mesh.geometry);

		// Update UI with results
		document.getElementById('val-vertices').textContent = report.stats.vertices;
		document.getElementById('val-faces').textContent = report.stats.faces;
		document.getElementById('val-edges').textContent = report.stats.edges;
		document.getElementById('val-degenerate').textContent = report.stats.degenerateFaces;
		document.getElementById('val-nonmanifold-edges').textContent = report.stats.nonManifoldEdges;
		document.getElementById('val-boundary').textContent = report.stats.boundaryEdges;
		document.getElementById('val-holes').textContent = report.stats.holes;

		// Show validation status
		const statusDiv = document.getElementById('validation-status');
		if (report.valid) {
			statusDiv.innerHTML = '<div style="color: #4CAF50;">✔ Mesh is valid - no issues detected</div>';
		} else {
			const issuesList = report.warnings.map(w => `<div>• ${w}</div>`).join('');
			statusDiv.innerHTML = `<div style="color: #ff6600;">⚠️ Issues detected:</div>${issuesList}`;
		}

		document.getElementById('validation-results').style.display = 'block';
		document.getElementById('repair-results').style.display = 'none';

		// Log summary
		const summary = this.app.meshIntegrityChecker.getSummary(report);
		this.app.log(summary);

		// Log warnings
		if (report.warnings.length > 0) {
			this.app.log('⚠️ Warnings:');
			report.warnings.forEach(w => this.app.log(`  - ${w}`));
		}
	}

	/**
	 * Repair mesh automatically
	 */
	repairMesh() {
		if (!this.app.mesh) {
			alert('Load a mesh first');
			return;
		}

		this.app.log('🔧 Validating and repairing mesh...');
		this.app.showLoading('Repairing mesh...');

		setTimeout(() => {
			try {
				// First validate to get issues
				const validationReport = this.app.meshIntegrityChecker.validate(this.app.mesh.geometry);

				if (validationReport.valid) {
					this.app.hideLoading();
					alert('Mesh is already valid - no repairs needed');
					this.app.log('✔ Mesh is already valid');
					return;
				}

				// Attempt repair
				const repairResult = this.app.meshRepair.repair(this.app.mesh.geometry, validationReport);

				if (repairResult.success) {
					// Dispose old geometry
					this.app.resourceTracker.disposeResource(this.app.mesh.geometry);

					// Apply repaired geometry
					this.app.mesh.geometry = repairResult.geometry;

					// Track new geometry
					this.app.resourceTracker.track(repairResult.geometry);

					// Clear selection (indices may have changed)
					this.app.selectedFaces.clear();
					this.updateSelectionCount();

					// Update file info
					const vertices = repairResult.geometry.attributes.position.count;
					const faces = vertices / 3;

					document.getElementById('file-info').textContent =
						document.getElementById('file-info').textContent.split('\n')[0] +
						`\nVertices: ${vertices}\nFaces: ${faces}`;

					// Show repair results
					document.getElementById('repair-summary').innerHTML =
						`<div>${repairResult.message}</div>` +
						`<div style="margin-top: 4px;">Faces Removed: ${repairResult.stats.facesRemoved}</div>` +
						`<div>Normals Fixed: ${repairResult.stats.normalsFixed}</div>`;

					document.getElementById('repair-results').style.display = 'block';

					this.app.log('✔ Mesh repair complete!');
					this.app.log(`  ${repairResult.message}`);

					// Re-validate to confirm
					const newReport = this.app.meshIntegrityChecker.validate(this.app.mesh.geometry);
					if (newReport.valid) {
						this.app.log('  ✔ Mesh is now valid!');
					} else {
						this.app.log('  ⚠️ Some issues remain:');
						newReport.warnings.forEach(w => this.app.log(`    - ${w}`));
					}

					// Push state to history - DISABLED
					// if (this.app.stateManager) {
					// 	this.app.stateManager.pushState('Repaired mesh', true);
					// }

				} else {
					alert(`Repair failed: ${repairResult.message}`);
					this.app.log(`✗ Repair failed: ${repairResult.message}`);
				}

			} catch (error) {
				this.app.log(`✗ Repair error: ${error.message}`);
				console.error('Repair error:', error);
				alert(`Repair failed: ${error.message}`);
			}

			this.app.hideLoading();
		}, 100);
	}

	/**
	 * Extract the actual hole edge vertices from a geometry after faces have been removed.
	 * These are the vertices that form the boundary of the hole (from neighboring faces).
	 */
	extractHoleEdgeVertices(geometry) {
		// Ensure geometry is non-indexed for face iteration
		let workGeometry = geometry;
		if (geometry.index) {
			workGeometry = geometry.toNonIndexed();
		}

		const positions = workGeometry.attributes.position.array;
		const tolerance = this.app.config?.weldTolerance || 0.001;
		const toleranceSq = tolerance * tolerance;

		// Build edge map: edge -> count
		// Edges that appear only once are boundary edges (hole edges)
		const edgeMap = new Map();

		// Count how many times each edge appears
		for (let i = 0; i < positions.length; i += 9) {
			// Triangle vertices
			const v1 = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
			const v2 = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
			const v3 = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);

			// Three edges per triangle
			const edges = [
				[v1, v2],
				[v2, v3],
				[v3, v1]
			];

			edges.forEach(([a, b]) => {
				// Create a normalized edge key (order-independent)
				const key = this.makeEdgeKey(a, b);
				edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
			});
		}

		// Find boundary edges (count === 1) - these are the hole edges
		const boundaryEdges = [];
		edgeMap.forEach((count, key) => {
			if (count === 1) {
				const [a, b] = key.split('|').map(s => {
					const coords = s.split(',').map(Number);
					return new THREE.Vector3(coords[0], coords[1], coords[2]);
				});
				boundaryEdges.push([a, b]);
			}
		});

		if (boundaryEdges.length === 0) {
			this.app.log('⚠️ No boundary edges found in geometry');
			return null;
		}

		this.app.log(`  Found ${boundaryEdges.length} boundary edges`);

		// Order the boundary edges into a loop
		const orderedVertices = this.orderBoundaryEdges(boundaryEdges, tolerance);

		return orderedVertices;
	}

	/**
	 * Create a consistent edge key for edge mapping (order-independent)
	 */
	makeEdgeKey(a, b) {
		const keyA = `${a.x.toFixed(6)},${a.y.toFixed(6)},${a.z.toFixed(6)}`;
		const keyB = `${b.x.toFixed(6)},${b.y.toFixed(6)},${b.z.toFixed(6)}`;
		return keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
	}

	/**
	 * Order boundary edges into a connected loop
	 */
	orderBoundaryEdges(edges, tolerance) {
		if (edges.length === 0) return [];

		const toleranceSq = tolerance * tolerance;
		const used = new Set();
		const loop = [];

		// Start with first edge
		loop.push(edges[0][0].clone());
		let current = edges[0][1].clone();
		used.add(0);

		// Follow the chain
		let iterations = 0;
		const maxIterations = edges.length * 2;

		while (iterations < maxIterations && used.size < edges.length) {
			iterations++;
			let found = false;

			// Find an unused edge that connects to current
			for (let i = 0; i < edges.length; i++) {
				if (used.has(i)) continue;

				const distToStart = edges[i][0].distanceToSquared(current);
				const distToEnd = edges[i][1].distanceToSquared(current);

				if (distToStart < toleranceSq) {
					// Connect via start vertex
					loop.push(current.clone());
					current = edges[i][1].clone();
					used.add(i);
					found = true;
					break;
				} else if (distToEnd < toleranceSq) {
					// Connect via end vertex
					loop.push(current.clone());
					current = edges[i][0].clone();
					used.add(i);
					found = true;
					break;
				}
			}

			if (!found) {
				this.app.log(`⚠️ Boundary chain broken at iteration ${iterations}, vertices collected: ${loop.length}`);
				break;
			}

			// Check if we've closed the loop
			if (loop.length > 2 && current.distanceToSquared(loop[0]) < toleranceSq) {
				this.app.log(`  ✓ Closed loop with ${loop.length} vertices`);
				break;
			}
		}

		return loop;
	}

	/**
	 * Create bridging triangles between hole edge vertices and pipe first ring vertices.
	 * This fills gaps when the selected face is concave.
	 */
	createBridgingTriangles(holeEdgeVertices, pipeFirstRing) {
		if (!holeEdgeVertices || !pipeFirstRing || holeEdgeVertices.length === 0 || pipeFirstRing.length === 0) {
			return null;
		}

		const tolerance = this.app.config?.weldTolerance || 0.001;
		const toleranceSq = tolerance * tolerance;

		this.app.log(`  Bridging ${holeEdgeVertices.length} hole vertices to ${pipeFirstRing.length} pipe vertices`);

		// DEBUG: Check if vertex counts are similar
		if (Math.abs(holeEdgeVertices.length - pipeFirstRing.length) > pipeFirstRing.length * 0.5) {
			this.app.log(`  ⚠️ Large vertex count mismatch: hole=${holeEdgeVertices.length}, pipe=${pipeFirstRing.length}`);
			this.app.log(`  This suggests concave selection with interior vertices`);
		}

		// Create a mapping: for each hole edge vertex, find the closest pipe vertex
		const positions = [];

		// Strategy: For each consecutive pair of hole edge vertices,
		// find their closest pipe vertices and create triangles to bridge them

		for (let i = 0; i < holeEdgeVertices.length; i++) {
			const holeV1 = holeEdgeVertices[i];
			const holeV2 = holeEdgeVertices[(i + 1) % holeEdgeVertices.length];

			// Find closest pipe vertices to these hole vertices
			let closestPipe1 = this.findClosestVertex(holeV1, pipeFirstRing);
			let closestPipe2 = this.findClosestVertex(holeV2, pipeFirstRing);

			// Check if these hole vertices are already very close to pipe vertices (welded)
			const dist1Sq = holeV1.distanceToSquared(pipeFirstRing[closestPipe1]);
			const dist2Sq = holeV2.distanceToSquared(pipeFirstRing[closestPipe2]);

			// Skip if both are already welded (no gap to bridge)
			if (dist1Sq < toleranceSq && dist2Sq < toleranceSq && closestPipe1 === closestPipe2) {
				continue;
			}

			// Create bridging triangles
			const pipeV1 = pipeFirstRing[closestPipe1];
			const pipeV2 = pipeFirstRing[closestPipe2];

			// If the closest pipe vertices are different, create a quad (2 triangles)
			if (closestPipe1 !== closestPipe2) {
				// Triangle 1: holeV1, holeV2, pipeV1
				positions.push(
					holeV1.x, holeV1.y, holeV1.z,
					holeV2.x, holeV2.y, holeV2.z,
					pipeV1.x, pipeV1.y, pipeV1.z
				);

				// Triangle 2: holeV2, pipeV2, pipeV1
				positions.push(
					holeV2.x, holeV2.y, holeV2.z,
					pipeV2.x, pipeV2.y, pipeV2.z,
					pipeV1.x, pipeV1.y, pipeV1.z
				);
			} else {
				// Same pipe vertex for both - create one triangle
				positions.push(
					holeV1.x, holeV1.y, holeV1.z,
					holeV2.x, holeV2.y, holeV2.z,
					pipeV1.x, pipeV1.y, pipeV1.z
				);
			}
		}

		if (positions.length === 0) {
			this.app.log('  No bridging triangles needed (vertices already aligned)');
			return null;
		}

		// Create geometry from positions
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.computeVertexNormals();

		this.app.log(`  Created ${positions.length / 9} bridging triangles`);

		return geometry;
	}

	/**
	 * Find the index of the closest vertex in a vertex array to a target point
	 */
	findClosestVertex(target, vertexArray) {
		let closestIndex = 0;
		let minDistSq = Infinity;

		for (let i = 0; i < vertexArray.length; i++) {
			const distSq = target.distanceToSquared(vertexArray[i]);
			if (distSq < minDistSq) {
				minDistSq = distSq;
				closestIndex = i;
			}
		}

		return closestIndex;
	}

	/**
	 * Weld two selected triangles together at their nearest edge
	 */
	weldSelectedTriangles() {
		if (this.app.selectedFaces.size !== 2) {
			alert('Please select exactly 2 triangles to weld');
			return;
		}

		this.app.log('🔗 Welding 2 triangles...');

		try {
			const geometry = this.app.mesh.geometry;

			// Ensure non-indexed geometry
			let workGeometry = geometry;
			if (geometry.index) {
				workGeometry = geometry.toNonIndexed();
			}

			const positions = workGeometry.attributes.position.array;
			const faceIndices = Array.from(this.app.selectedFaces);

			if (faceIndices.length !== 2) {
				alert('Internal error: face count mismatch');
				return;
			}

			// Get the two triangles
			const face1Index = faceIndices[0];
			const face2Index = faceIndices[1];

			// Extract vertices for each triangle
			const tri1 = this.getTriangleVertices(positions, face1Index);
			const tri2 = this.getTriangleVertices(positions, face2Index);

			this.app.log(`  Triangle 1: Face ${face1Index}`);
			this.app.log(`  Triangle 2: Face ${face2Index}`);

			// Find the nearest edge between the two triangles
			const { edge1, edge2, distance } = this.findNearestEdges(tri1, tri2);

			this.app.log(`  Nearest edges found (distance: ${distance.toFixed(4)})`);
			this.app.log(`  Edge 1: vertices ${edge1.i1}, ${edge1.i2}`);
			this.app.log(`  Edge 2: vertices ${edge2.i1}, ${edge2.i2}`);

			// Create welded geometry
			const weldedGeometry = this.createWeldedGeometry(workGeometry, face1Index, face2Index, edge1, edge2);

			// Update mesh
			this.app.mesh.geometry.dispose();
			this.app.mesh.geometry = weldedGeometry;

			// Update original geometry
			if (this.app.originalGeometry) {
				this.app.resourceTracker.disposeResource(this.app.originalGeometry);
			}
			this.app.originalGeometry = weldedGeometry.clone();
			this.app.resourceTracker.track(this.app.originalGeometry);

			// Clear selection
			this.app.selectedFaces.clear();
			this.updateSelectionCount();

			// Update file info
			const currentFaces = weldedGeometry.attributes.position.count / 3;
			const fileInfo = document.getElementById('file-info');
			if (fileInfo) {
				const currentText = fileInfo.textContent;
				const lines = currentText.split('\n');
				if (lines.length >= 2) {
					fileInfo.textContent = `${lines[0]}\n${lines[1]}\nVertices: ${weldedGeometry.attributes.position.count}\nFaces: ${currentFaces}`;
				}
			}

			this.app.log('✔ Triangles welded successfully');
			this.app.log(`  Removed 2 triangles, added bridge quad (2 triangles) = same count`);

		} catch (error) {
			this.app.log(`✗ Weld failed: ${error.message}`);
			console.error('Weld error:', error);
			alert(`Failed to weld triangles: ${error.message}`);
		}
	}

	/**
	 * Get the three vertices of a triangle
	 */
	getTriangleVertices(positions, faceIndex) {
		const offset = faceIndex * 9;
		return [
			new THREE.Vector3(positions[offset], positions[offset + 1], positions[offset + 2]),
			new THREE.Vector3(positions[offset + 3], positions[offset + 4], positions[offset + 5]),
			new THREE.Vector3(positions[offset + 6], positions[offset + 7], positions[offset + 8])
		];
	}

	/**
	 * Find the nearest edges between two triangles
	 */
	findNearestEdges(tri1, tri2) {
		const edges1 = [
			{ i1: 0, i2: 1, v1: tri1[0], v2: tri1[1] },
			{ i1: 1, i2: 2, v1: tri1[1], v2: tri1[2] },
			{ i1: 2, i2: 0, v1: tri1[2], v2: tri1[0] }
		];

		const edges2 = [
			{ i1: 0, i2: 1, v1: tri2[0], v2: tri2[1] },
			{ i1: 1, i2: 2, v1: tri2[1], v2: tri2[2] },
			{ i1: 2, i2: 0, v1: tri2[2], v2: tri2[0] }
		];

		let minDistance = Infinity;
		let bestEdge1 = null;
		let bestEdge2 = null;

		// Check all edge pairs
		for (const e1 of edges1) {
			for (const e2 of edges2) {
				// Calculate average distance between edge midpoints
				const mid1 = e1.v1.clone().add(e1.v2).multiplyScalar(0.5);
				const mid2 = e2.v1.clone().add(e2.v2).multiplyScalar(0.5);
				const dist = mid1.distanceTo(mid2);

				if (dist < minDistance) {
					minDistance = dist;
					bestEdge1 = e1;
					bestEdge2 = e2;
				}
			}
		}

		return { edge1: bestEdge1, edge2: bestEdge2, distance: minDistance };
	}

	/**
	 * Create welded geometry by removing the two triangles and adding a bridge quad
	 */
	createWeldedGeometry(geometry, face1Index, face2Index, edge1, edge2) {
		const positions = geometry.attributes.position.array;
		const newPositions = [];

		// Copy all triangles except the two being welded
		const faceCount = positions.length / 9;
		for (let i = 0; i < faceCount; i++) {
			if (i === face1Index || i === face2Index) {
				continue; // Skip these faces
			}

			const offset = i * 9;
			for (let j = 0; j < 9; j++) {
				newPositions.push(positions[offset + j]);
			}
		}

		// Get the edge vertices
		const tri1 = this.getTriangleVertices(positions, face1Index);
		const tri2 = this.getTriangleVertices(positions, face2Index);

		// Get the 4 vertices of the bridge quad (the two edges)
		const v1 = tri1[edge1.i1];
		const v2 = tri1[edge1.i2];
		const v3 = tri2[edge2.i1];
		const v4 = tri2[edge2.i2];

		// Create a quad (2 triangles) to bridge the gap
		// Triangle 1: v1, v2, v3
		newPositions.push(v1.x, v1.y, v1.z);
		newPositions.push(v2.x, v2.y, v2.z);
		newPositions.push(v3.x, v3.y, v3.z);

		// Triangle 2: v2, v4, v3
		newPositions.push(v2.x, v2.y, v2.z);
		newPositions.push(v4.x, v4.y, v4.z);
		newPositions.push(v3.x, v3.y, v3.z);

		// Create new geometry
		const newGeometry = new THREE.BufferGeometry();
		newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
		newGeometry.computeVertexNormals();

		return newGeometry;
	}

}

// ES module export
export { UIController };
