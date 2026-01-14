// Pipe Generator - Generates pipe geometry from selected faces
class PipeGenerator {
    constructor(app) {
        this.app = app;
    }
    
	
	generatePipe(params, isPreview = false) {
		if (this.app.selectedFaces.size === 0) {
			return null;
		}
		
		try {
			const selectedGeometry = this.extractSelectedFaces();
			if (!selectedGeometry) return null;

			// FIXED: Use stored boundary consistently
			// Only use edge editor if user explicitly clicked "Reorder Boundary"
			let boundary;

			if (this.app.boundaryData) {
				// Use the boundary stored from createEndLocation
				this.app.log('✔ Using stored boundary data');
				boundary = this.app.boundaryData;
			} else if (this.app.edgeEditor && this.app.edgeEditor.currentBoundary) {
				// Fallback to edge editor only if no stored boundary
				boundary = this.app.edgeEditor.currentBoundary; // DON'T reorder
				this.app.log('✔ Using edge editor boundary');
			} else {
				// Last resort: extract fresh
				boundary = this.extractBoundaryFromGeometry(selectedGeometry);
				this.app.log('✔ Extracted fresh boundary');
			}

			if (!boundary || boundary.loops.length === 0) {
				this.app.log('⚠️ No boundary found, using simple extrusion');
				return this.simpleExtrusion(selectedGeometry, params);
			}

			// Calculate centroid and normal
			const centroid = this.calculateCentroid(selectedGeometry);
			const normal = this.calculateAverageNormal(selectedGeometry);

            // Build control points (start, waypoints, end)
            const controlPoints = this.buildControlPoints(params);

            // Build SHARED local coordinate frame for consistent transformations
            // This frame is used by both pipe rings AND end face to ensure perfect alignment
            const localZ = normal.clone().normalize();
            const arbitrary = Math.abs(localZ.z) < 0.9
                ? new THREE.Vector3(0, 0, 1)
                : new THREE.Vector3(1, 0, 0);
            const localX = new THREE.Vector3().crossVectors(arbitrary, localZ).normalize();
            const localY = new THREE.Vector3().crossVectors(localZ, localX).normalize();

            // Generate pipe with waypoints (using shared coordinate frame)
            const pipeResult = this.generatePipeWithWaypoints(
                boundary, centroid, normal, controlPoints, params.segments, params.finalSegmentSplit || 0,
                localX, localY, localZ, params.firstSegmentSplit || 0
            );

            const pipeGeometry = pipeResult.geometry;
            const finalRings = pipeResult.finalRings;  // Store final ring for end cap
            const firstRings = pipeResult.firstRings;   // Store first ring for potential future use

            if (params.firstSegmentSplit > 0) {
                this.app.log(`  First segment split into ${params.firstSegmentSplit} extra rings for smoother start transition`);
            }
            if (params.finalSegmentSplit > 0) {
                this.app.log(`  Final segment split into ${params.finalSegmentSplit} extra rings for smoother end transition`);
            }
            
            // Create meshes for preview or final
            const pipeMaterial = new THREE.MeshPhongMaterial({
                color: isPreview ? 0x00ff00 : 0x87CEEB,
                transparent: isPreview,
                opacity: isPreview ? 0.4 : 1.0,
                side: THREE.DoubleSide,
                wireframe: isPreview
            });
            
            const pipeMesh = new THREE.Mesh(pipeGeometry, pipeMaterial);
            
            if (isPreview) {
				// --- existing preview end-face code ---
				const endFaceGeometry = this.createTransformedFace(
					selectedGeometry, centroid, normal, params, 1.0, localX, localY, localZ
				);
				const endFaceMaterial = new THREE.MeshPhongMaterial({
					color: 0xff00ff,
					transparent: true,
					opacity: 0.8,
					side: THREE.DoubleSide
				});
				const endFaceMesh = new THREE.Mesh(endFaceGeometry, endFaceMaterial);
				
				// Create waypoint previews
				const waypointMeshes = [];
				const colors = [0x00ffff, 0xffff00, 0xff00ff, 0x00ff00, 0xff8800];

				const totalLength = params.length || 0;

				this.app.waypoints.forEach((wp, idx) => {
					const t = totalLength > 0 ? Math.min(Math.max(wp.length / totalLength, 0), 1) : 0;

					// Use global length for depth, but waypoint's own transform & scale
					const wpParams = {
						// base: overall end settings
						...params,
						// override with waypoint-specific transform
						length: params.length,      // overall length for depth
						offsetX: wp.offsetX,
						offsetY: wp.offsetY,
						offsetZ: wp.offsetZ,
						rotX: wp.rotX,
						rotY: wp.rotY,
						rotZ: wp.rotZ,
						scaleX: wp.scaleX,
						scaleY: wp.scaleY
					};

					const wpGeometry = this.createTransformedFace(
						selectedGeometry,
						centroid,
						normal,
						wpParams,
						t,
						localX,
						localY,
						localZ
					);

					const wpMaterial = new THREE.MeshPhongMaterial({
						color: colors[idx % colors.length],
						transparent: true,
						opacity: 0.8,
						side: THREE.DoubleSide
					});

					waypointMeshes.push(new THREE.Mesh(wpGeometry, wpMaterial));
				});
				
				
				
				

				return {
					pipe: pipeMesh,
					endFace: endFaceMesh,
					waypoints: waypointMeshes
				};
			} else {
				// --- CREATE END CAP USING ORIGINAL FACE GEOMETRY ---
				// Use createTransformedFace with t=1.0 to preserve original triangulation
				// This ensures the end cap matches the selected face exactly
				this.app.log('  Creating end cap from original face geometry...');
				const endFaceGeometry = this.createTransformedFace(
					selectedGeometry, centroid, normal, params, 1.0, localX, localY, localZ
				);
				const endFaceMaterial = new THREE.MeshPhongMaterial({
					color: 0x87CEEB,
					side: THREE.DoubleSide
				});
				const endFaceMesh = new THREE.Mesh(endFaceGeometry, endFaceMaterial);

				return {
					pipe: pipeMesh,
					endFace: endFaceMesh
				};
			}
            
        } catch (error) {
            this.app.log(`✗ Pipe generation error: ${error.message}`);
            console.error(error);
            return null;
        }
    }
    
    extractSelectedFaces() {
        const positions = this.app.mesh.geometry.attributes.position.array;
        const selectedPositions = [];
        
        this.app.selectedFaces.forEach(faceIndex => {
            const i = faceIndex * 9;
            for (let j = 0; j < 9; j++) {
                selectedPositions.push(positions[i + j]);
            }
        });
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', 
            new THREE.Float32BufferAttribute(selectedPositions, 3));
        geometry.computeVertexNormals();
        
        return geometry;
    }
    
    extractBoundary() {
        const selectedGeometry = this.extractSelectedFaces();
        return this.extractBoundaryFromGeometry(selectedGeometry);
    }
    
    extractBoundaryFromGeometry(geometry) {
        // Find boundary edges (edges that belong to only one face)
        const positions = geometry.attributes.position.array;
        const faceCount = positions.length / 9;
        
        const edgeMap = new Map();
        
        // Build edge map
        for (let i = 0; i < faceCount; i++) {
            const i0 = i * 9;
            
            const v1 = [positions[i0], positions[i0+1], positions[i0+2]];
            const v2 = [positions[i0+3], positions[i0+4], positions[i0+5]];
            const v3 = [positions[i0+6], positions[i0+7], positions[i0+8]];
            
            const edges = [
                [v1, v2],
                [v2, v3],
                [v3, v1]
            ];
            
            edges.forEach(([a, b]) => {
                const key = this.makeEdgeKey(a, b);
                edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
            });
        }
        
        // Find boundary edges (count === 1)
        const boundaryEdges = [];
        edgeMap.forEach((count, key) => {
            if (count === 1) {
                const [a, b] = key.split('|').map(s => s.split(',').map(Number));
                boundaryEdges.push([
                    new THREE.Vector3(a[0], a[1], a[2]),
                    new THREE.Vector3(b[0], b[1], b[2])
                ]);
            }
        });
        
        if (boundaryEdges.length === 0) {
            return null;
        }
        
        // Order edges into loops
        const loops = this.orderEdgesIntoLoops(boundaryEdges);
        
        return {
            loops: loops,
            totalPoints: loops.reduce((sum, loop) => sum + loop.length, 0)
        };
    }
    
    makeEdgeKey(a, b) {
        // Make consistent key regardless of vertex order
        const keyA = a.map(v => v.toFixed(6)).join(',');
        const keyB = b.map(v => v.toFixed(6)).join(',');
        return keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
    }
    
	orderEdgesIntoLoops(edges) {
		const loops = [];
		const used = new Set();
		
		while (used.size < edges.length) {
			// Find an unused edge
			let startEdge = null;
			for (let i = 0; i < edges.length; i++) {
				if (!used.has(i)) {
					startEdge = i;
					break;
				}
			}
			
			if (startEdge === null) break;
			
			const loop = [edges[startEdge][0].clone()];
			let current = edges[startEdge][1].clone();
			used.add(startEdge);
			
			// Follow the chain
			let found = true;
			let iterations = 0;
			const maxIterations = edges.length;
			
			while (found && !current.equals(loop[0]) && iterations < maxIterations) {
				found = false;
				iterations++;

				for (let i = 0; i < edges.length; i++) {
					if (used.has(i)) continue;

					const tolerance = this.app.config?.weldTolerance || 0.001;
					
					if (edges[i][0].distanceTo(current) < tolerance) {
						loop.push(current.clone());
						current = edges[i][1].clone();
						used.add(i);
						found = true;
						break;
					} else if (edges[i][1].distanceTo(current) < tolerance) {
						loop.push(current.clone());
						current = edges[i][0].clone();
						used.add(i);
						found = true;
						break;
					}
				}
			}
			
			// Only add loops with at least 3 points
			if (loop.length >= 3) {
				loops.push(loop);
				this.app.log(`    Traced loop: ${loop.length} vertices, ${iterations} iterations`);
			} else {
				this.app.log(`    ⚠️ Skipped invalid loop: only ${loop.length} vertices`);
			}
		}
		
		// Sort loops by size (largest first = outer loop)
		loops.sort((a, b) => b.length - a.length);
		
		return loops;
	}
    
    calculateCentroid(geometry) {
        const positions = geometry.attributes.position.array;
        const centroid = new THREE.Vector3();
        
        for (let i = 0; i < positions.length; i += 3) {
            centroid.x += positions[i];
            centroid.y += positions[i+1];
            centroid.z += positions[i+2];
        }
        
        centroid.divideScalar(positions.length / 3);
        return centroid;
    }
    
    calculateAverageNormal(geometry) {
        const normals = geometry.attributes.normal.array;
        const normal = new THREE.Vector3();
        
        for (let i = 0; i < normals.length; i += 3) {
            normal.x += normals[i];
            normal.y += normals[i+1];
            normal.z += normals[i+2];
        }
        
        normal.normalize();
        return normal;
    }
    
    buildControlPoints(params) {
        const controlPoints = [];
        
        // Start point
        controlPoints.push({
            t: 0,
            length: 0,
            offsetX: 0, offsetY: 0, offsetZ: 0,
            rotX: 0, rotY: 0, rotZ: 0,
            scaleX: 1, scaleY: 1
        });
        
        // Waypoints
        this.app.waypoints.forEach(wp => {
            const t = params.length > 0 ? wp.length / params.length : 0;
            controlPoints.push({ t, ...wp });
        });
        
        // End point
        controlPoints.push({
            t: 1,
            ...params
        });
        
        controlPoints.sort((a, b) => a.t - b.t);
        
        return controlPoints;
    }

/*	generatePipeWithWaypoints(boundary, centroid, normal, controlPoints, segments) {
		const positions = [];
		const indices = [];
		
		boundary.loops.forEach((loop, loopIndex) => {
			this.app.log(`  Processing loop ${loopIndex + 1}: ${loop.length} vertices`);
			
			// CRITICAL: Normalize the loop to start from a consistent point
			const normalizedLoop = this.normalizeLoopStartPoint(loop, centroid, normal);
			
			// DEBUG: Uncomment to visualize vertex ordering
			// if (loopIndex === 0) this.visualizeLoopOrdering(normalizedLoop, centroid, normal, loopIndex);
			
			const loopPositions = [];
			
			// Generate rings for this loop
			for (let seg = 0; seg <= segments; seg++) {
				const t = seg / segments;
				const params = this.interpolateParams(t, controlPoints, normal);
				
				// Transform loop points
				const ringPoints = normalizedLoop.map(point => {
					let p = point.clone().sub(centroid);
					
					// Apply scaling
					p = this.scalePointXY(p, params.scaleX, params.scaleY, normal);
					
					// Apply rotation
					p = this.rotatePoint(p, params.rotX, params.rotY, params.rotZ);
					
					// Apply translation
					p.add(centroid).add(params.translation);
					
					return p;
				});
				
				loopPositions.push(ringPoints);
			}
			
			// Connect rings with CONSISTENT vertex ordering
			const startIdx = positions.length / 3;
			
			// Add all points
			loopPositions.forEach(ring => {
				ring.forEach(p => {
					positions.push(p.x, p.y, p.z);
				});
			});
			
			// Create faces between rings with PROPER ordering
			const numVertices = normalizedLoop.length;
			
			for (let seg = 0; seg < segments; seg++) {
				const ring1Start = startIdx + seg * numVertices;
				const ring2Start = startIdx + (seg + 1) * numVertices;
				
				for (let i = 0; i < numVertices; i++) {
					const next = (i + 1) % numVertices;
					
					// CRITICAL: Maintain winding order for consistent normals
					// Create two triangles per quad
					
					// Triangle 1: v1 -> v1_next -> v2
					indices.push(
						ring1Start + i,
						ring1Start + next,
						ring2Start + i
					);
					
					// Triangle 2: v1_next -> v2_next -> v2
					indices.push(
						ring1Start + next,
						ring2Start + next,
						ring2Start + i
					);
				}
			}
			
			this.app.log(`  Connected ${segments} rings with ${numVertices} vertices each`);
		});
		
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setIndex(indices);
		geometry.computeVertexNormals();
		
		this.app.log(`✔ Pipe geometry created: ${positions.length / 3} vertices, ${indices.length / 3} faces`);
		
		return geometry;
	}*/
	
	
	generatePipeWithWaypoints(boundary, centroid, normal, controlPoints, segments, finalSegmentSplit = 0, localX, localY, localZ, firstSegmentSplit = 0) {
		const positions = [];
		const indices = [];

		// Arrays to store final and first rings for each loop (for watertight caps)
		const finalRings = [];
		const firstRings = [];

		// First pass: determine which loop is the outer boundary (largest area)
		const loopAreas = boundary.loops.map(loop => this.calculateLoopSignedArea(loop, normal));
		const maxAreaIndex = loopAreas.indexOf(Math.max(...loopAreas.map(Math.abs)));

		boundary.loops.forEach((loop, loopIndex) => {
			const isOuterBoundary = (loopIndex === maxAreaIndex);
			this.app.log(`  Processing loop ${loopIndex + 1}: ${loop.length} vertices ${isOuterBoundary ? '(OUTER)' : '(HOLE)'}`);

			// NORMALIZE WINDING DIRECTION
			// Outer boundary: CCW (positive area)
			// Holes: CW (negative area) - opposite to outer!
			const normalizedLoop = this.normalizeLoopWindingDirection(loop, normal, !isOuterBoundary);

			// PROJECT LOOP ONTO PLANE to remove height variations from curved surfaces
			// This prevents jagged edges when sweeping along curved boundaries
			const flattenedLoop = this.flattenLoopOntoPlane(normalizedLoop, centroid, normal);

			const loopPositions = [];

			// Use the SHARED local coordinate frame passed from the caller
			// This ensures perfect alignment between pipe rings and end face

			// Generate t values for all rings
			const tValues = [];

			// Handle first segment splitting
			if (firstSegmentSplit > 0) {
				// Subdivide first segment from 0 to 1/segments
				const tNext = 1 / segments;
				for (let i = 0; i <= firstSegmentSplit; i++) {
					const subT = i / firstSegmentSplit;
					tValues.push(tNext * subT);
				}
				// Then add remaining segments (1..segments-1)
				for (let seg = 1; seg < segments; seg++) {
					tValues.push(seg / segments);
				}
			} else {
				// Normal start: add all segments except the last
				for (let seg = 0; seg < segments; seg++) {
					tValues.push(seg / segments);
				}
			}

			// Handle final segment splitting
			if (finalSegmentSplit > 0) {
				// Subdivide the final segment (from segments-1 to segments)
				const tPrev = (segments - 1) / segments;
				const tNext = 1.0;
				for (let i = 1; i <= finalSegmentSplit; i++) {
					const subT = i / finalSegmentSplit;
					const t = tPrev + (tNext - tPrev) * subT;
					tValues.push(t);
				}
			} else {
				// Normal end: add the final segment
				tValues.push(1.0);
			}

			// Generate rings for all t values
			for (const t of tValues) {
				// CRITICAL FIX: For t=0 (first ring), use EXACT original boundary vertices
				// This ensures perfect welding with the removed faces
				if (t === 0) {
					// Use exact copies of the original boundary points
					const exactRingPoints = flattenedLoop.map(point => point.clone());
					loopPositions.push(exactRingPoints);
					continue; // Skip transformation for first ring
				}

				const params = this.interpolateParams(t, controlPoints, normal);

				// MATRIX-BASED TRANSFORMATION using the SHARED local coordinate frame

				// Transform each point: apply scaling in plane coords, then rotate, then translate
				const ringPoints = flattenedLoop.map(point => {
					// 1. Get point relative to centroid
					const p = point.clone().sub(centroid);

					// 2. Convert to local plane coordinates
					const localCoords = new THREE.Vector3(
						p.dot(localX),
						p.dot(localY),
						p.dot(localZ)
					);

					// 3. Apply scaling IN LOCAL COORDINATES (this preserves the circle shape)
					localCoords.x *= params.scaleX;
					localCoords.y *= params.scaleY;

					// 4. Convert back to world coordinates
					const scaled = new THREE.Vector3(
						localX.x * localCoords.x + localY.x * localCoords.y + localZ.x * localCoords.z,
						localX.y * localCoords.x + localY.y * localCoords.y + localZ.y * localCoords.z,
						localX.z * localCoords.x + localY.z * localCoords.y + localZ.z * localCoords.z
					);

					// 5. Apply rotation using matrix
					const rotationMatrix = new THREE.Matrix4();
					const euler = new THREE.Euler(
						THREE.MathUtils.degToRad(params.rotX),
						THREE.MathUtils.degToRad(params.rotY),
						THREE.MathUtils.degToRad(params.rotZ),
						'XYZ'
					);
					rotationMatrix.makeRotationFromEuler(euler);
					scaled.applyMatrix4(rotationMatrix);

					// 6. Translate to final position
					scaled.add(centroid).add(params.translation);

					return scaled;
				});

				loopPositions.push(ringPoints);
			}

			// Capture first and last ring for this loop (for watertight end caps)
			const numRings = loopPositions.length;
			firstRings.push(loopPositions[0]);     // First ring
			finalRings.push(loopPositions[numRings - 1]);  // Last ring

			// Connect rings
			const startIdx = positions.length / 3;
			
			// Add all points
			loopPositions.forEach(ring => {
				ring.forEach(p => {
					positions.push(p.x, p.y, p.z);
				});
			});
			
			// Create faces between rings
			const numVertices = flattenedLoop.length;

			// Connect all adjacent rings (not just 'segments' worth!)
			for (let seg = 0; seg < numRings - 1; seg++) {
				const ring1Start = startIdx + seg * numVertices;
				const ring2Start = startIdx + (seg + 1) * numVertices;

				for (let i = 0; i < numVertices; i++) {
					const next = (i + 1) % numVertices;

					// Two triangles per quad
					indices.push(
						ring1Start + i,
						ring1Start + next,
						ring2Start + i
					);

					indices.push(
						ring1Start + next,
						ring2Start + next,
						ring2Start + i
					);
				}
			}

			this.app.log(`  Connected ${numRings} rings with ${numVertices} vertices each`);
		});

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setIndex(indices);
		geometry.computeVertexNormals();

		this.app.log(`✔ Pipe geometry created: ${positions.length / 3} vertices, ${indices.length / 3} faces`);

		// Return geometry plus ring data for watertight end caps
		return {
			geometry: geometry,
			finalRings: finalRings,  // Array of final rings (one per loop)
			firstRings: firstRings   // Array of first rings (one per loop)
		};
	}



	/**
	 * Create end cap geometry from final ring positions
	 * Uses the actual ring vertex positions for perfect watertight alignment
	 * @param {Array<Array<THREE.Vector3>>} rings - Array of rings (one per loop), each ring is an array of Vector3
	 * @param {THREE.Vector3} normal - Face normal for proper winding
	 * @returns {THREE.BufferGeometry} - End cap geometry
	 */
	createEndCapFromRings(rings, normal) {
		if (!rings || rings.length === 0) {
			this.app.log('⚠️ No rings provided for end cap');
			return null;
		}

		// IMPORTANT: Only triangulate the OUTER ring (index 0)
		// Holes (index 1+) are already represented by the pipe walls - don't fill them!
		// For a production implementation with proper hole support, use a robust polygon triangulator like Earcut

		const positions = [];
		const indices = [];

		// Only process the outer ring (ringIndex === 0)
		const outerRing = rings[0];

		if (!outerRing || outerRing.length < 3) {
			this.app.log('⚠️ Invalid outer ring for end cap');
			return null;
		}

		// Calculate outer ring centroid
		const centroid = new THREE.Vector3();
		outerRing.forEach(p => centroid.add(p));
		centroid.divideScalar(outerRing.length);

		// Add centroid as first vertex
		const centroidIdx = positions.length / 3;
		positions.push(centroid.x, centroid.y, centroid.z);

		// Add outer ring vertices
		const ringStartIdx = positions.length / 3;
		outerRing.forEach(p => {
			positions.push(p.x, p.y, p.z);
		});

		// Create fan triangles from centroid to outer ring edges
		for (let i = 0; i < outerRing.length; i++) {
			const curr = ringStartIdx + i;
			const next = ringStartIdx + ((i + 1) % outerRing.length);

			// Normal winding for outer loop
			indices.push(centroidIdx, curr, next);
		}

		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
		geometry.setIndex(indices);
		geometry.computeVertexNormals();

		const holeCount = rings.length - 1;
		this.app.log(`  ✔ End cap created from outer ring: ${positions.length / 3} vertices, ${indices.length / 3} faces`);
		if (holeCount > 0) {
			this.app.log(`  ℹ️ Skipped ${holeCount} hole(s) - they remain open (as intended)`);
		}

		return geometry;
	}

	/**
	 * Project loops to 2D plane for triangulation
	 * @param {Array<Array<THREE.Vector3>>} rings - Array of rings
	 * @param {THREE.Vector3} normal - Plane normal
	 * @returns {Object} - {outer: [{x,y}...], holes: [[{x,y}...], ...]}
	 */
	projectLoopsTo2D(rings, normal) {
		if (!rings || rings.length === 0) return { outer: [], holes: [] };

		// Build local coordinate system
		const zAxis = normal.clone().normalize();
		let xAxis = new THREE.Vector3(1, 0, 0);
		if (Math.abs(zAxis.dot(xAxis)) > 0.9) {
			xAxis = new THREE.Vector3(0, 1, 0);
		}
		const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
		xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();

		// Project each ring
		const projected = {
			outer: [],
			holes: []
		};

		rings.forEach((ring, idx) => {
			const projected2D = ring.map(p => {
				return {
					x: p.dot(xAxis),
					y: p.dot(yAxis)
				};
			});

			if (idx === 0) {
				projected.outer = projected2D;
			} else {
				projected.holes.push(projected2D);
			}
		});

		return projected;
	}

	/**
	 * Normalize loop to start from a consistent vertex
	 * CRITICAL: Maintains sequential order, only rotates starting point
	 */
	normalizeLoopStartPoint(loop, centroid, normal) {
		if (loop.length < 3) return loop;
		
		// Build local coordinate system
		const zAxis = normal.clone().normalize();
		
		let xAxis;
		if (Math.abs(zAxis.z) < 0.99) {
			xAxis = new THREE.Vector3(-zAxis.y, zAxis.x, 0).normalize();
		} else {
			xAxis = new THREE.Vector3(1, 0, 0);
		}
		
		const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
		
		// Find vertex with minimum angle (this becomes our starting point)
		let minAngle = Infinity;
		let startIndex = 0;
		
		loop.forEach((point, idx) => {
			const relative = new THREE.Vector3().subVectors(point, centroid);
			const localX = relative.dot(xAxis);
			const localY = relative.dot(yAxis);
			const angle = Math.atan2(localY, localX);
			
			if (angle < minAngle) {
				minAngle = angle;
				startIndex = idx;
			}
		});
		
		// Rotate array to start from this index (MAINTAINS sequential order)
		const rotatedLoop = [
			...loop.slice(startIndex),
			...loop.slice(0, startIndex)
		];
		
		// Check winding direction
		const windingDir = this.computeWindingDirection(rotatedLoop, centroid, normal);
		
		if (windingDir < 0) {
			// Reverse if clockwise, but keep first vertex as start
			rotatedLoop.reverse();
			const first = rotatedLoop.pop();
			rotatedLoop.unshift(first);
		}
		
		return rotatedLoop;
	}
	


	/**
	 * Compute winding direction of loop
	 * Returns positive for counter-clockwise, negative for clockwise
	 */
	computeWindingDirection(loop, centroid, normal) {
		let signedArea = 0;
		
		// Project loop onto plane perpendicular to normal
		const zAxis = normal.clone().normalize();
		
		let xAxis;
		if (Math.abs(zAxis.z) < 0.99) {
			xAxis = new THREE.Vector3(-zAxis.y, zAxis.x, 0).normalize();
		} else {
			xAxis = new THREE.Vector3(1, 0, 0);
		}
		
		const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();
		
		// Convert to 2D coordinates
		const loop2D = loop.map(point => {
			const relative = new THREE.Vector3().subVectors(point, centroid);
			return {
				x: relative.dot(xAxis),
				y: relative.dot(yAxis)
			};
		});
		
		// Compute signed area using shoelace formula
		for (let i = 0; i < loop2D.length; i++) {
			const j = (i + 1) % loop2D.length;
			signedArea += loop2D[i].x * loop2D[j].y - loop2D[j].x * loop2D[i].y;
		}
		
		return signedArea;
	}


 
    interpolateParams(t, controlPoints, normal) {
        let prev = controlPoints[0];
        let next = controlPoints[controlPoints.length - 1];
        
        for (let i = 0; i < controlPoints.length - 1; i++) {
            if (controlPoints[i].t <= t && t <= controlPoints[i+1].t) {
                prev = controlPoints[i];
                next = controlPoints[i+1];
                break;
            }
        }
        
        const localT = prev.t === next.t ? 0 : (t - prev.t) / (next.t - prev.t);
        
        const lerp = (a, b) => a + (b - a) * localT;
        
        const offsetX = lerp(prev.offsetX || 0, next.offsetX || 0);
        const offsetY = lerp(prev.offsetY || 0, next.offsetY || 0);
        const offsetZ = lerp(prev.offsetZ || 0, next.offsetZ || 0);
        const length = lerp(prev.length || 0, next.length || 0);
        
        const translation = normal.clone()
            .multiplyScalar(length)
            .add(new THREE.Vector3(offsetX, offsetY, offsetZ));

        return {
            // RESTORE interpolation - we DO want the pipe to twist
            // The fix is to flatten each ring AFTER transformation (see generatePipeWithWaypoints)
            rotX: lerp(prev.rotX || 0, next.rotX || 0),
            rotY: lerp(prev.rotY || 0, next.rotY || 0),
            rotZ: lerp(prev.rotZ || 0, next.rotZ || 0),
            scaleX: lerp(prev.scaleX || 1, next.scaleX || 1),
            scaleY: lerp(prev.scaleY || 1, next.scaleY || 1),
            translation
        };
    }
    
    scalePointXY(point, scaleX, scaleY, normal) {
        if (scaleX === 1 && scaleY === 1) return point;
        
        // Build local coordinate system
        const zAxis = normal.clone().normalize();
        
        let xAxis;
        if (Math.abs(zAxis.z) < 0.99) {
            xAxis = new THREE.Vector3(-zAxis.y, zAxis.x, 0).normalize();
        } else {
            xAxis = new THREE.Vector3(1, 0, 0);
        }
        
        const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis);
        
        // Project onto local axes
        const localX = point.dot(xAxis);
        const localY = point.dot(yAxis);
        const localZ = point.dot(zAxis);
        
        // Scale X and Y
        const scaled = xAxis.clone().multiplyScalar(localX * scaleX)
            .add(yAxis.clone().multiplyScalar(localY * scaleY))
            .add(zAxis.clone().multiplyScalar(localZ));
        
        return scaled;
    }
    
    rotatePoint(point, rotX, rotY, rotZ) {
        const p = point.clone();
        
        if (rotX !== 0) {
            const rad = rotX * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const y = p.y * cos - p.z * sin;
            const z = p.y * sin + p.z * cos;
            p.y = y;
            p.z = z;
        }
        
        if (rotY !== 0) {
            const rad = rotY * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const x = p.x * cos + p.z * sin;
            const z = -p.x * sin + p.z * cos;
            p.x = x;
            p.z = z;
        }
        
        if (rotZ !== 0) {
            const rad = rotZ * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const x = p.x * cos - p.y * sin;
            const y = p.x * sin + p.y * cos;
            p.x = x;
            p.y = y;
        }
        
        return p;
    }
    
    createTransformedFace(geometry, centroid, normal, params, t, localX, localY, localZ) {
        const positions = geometry.attributes.position.array;

        // MATRIX-BASED TRANSFORMATION with plane-aligned scaling (like Python version)
        // Use the SHARED local coordinate frame passed from caller for perfect alignment

        // Calculate final translation
        const offset = new THREE.Vector3(
            params.offsetX || 0,
            params.offsetY || 0,
            params.offsetZ || 0
        );
        const lengthOffset = normal.clone().multiplyScalar((params.length || 0) * t);
        const finalPosition = centroid.clone().add(lengthOffset).add(offset);

        // Transform each point
        const transformed = [];
        for (let i = 0; i < positions.length; i += 3) {
            const point = new THREE.Vector3(positions[i], positions[i+1], positions[i+2]);

            // 1. Get point relative to centroid
            const p = point.clone().sub(centroid);

            // 2. Convert to local plane coordinates
            const localCoords = new THREE.Vector3(
                p.dot(localX),
                p.dot(localY),
                p.dot(localZ)
            );

            // 3. Apply scaling IN LOCAL COORDINATES
            localCoords.x *= (params.scaleX || 1);
            localCoords.y *= (params.scaleY || 1);

            // 4. Convert back to world coordinates
            const scaled = new THREE.Vector3(
                localX.x * localCoords.x + localY.x * localCoords.y + localZ.x * localCoords.z,
                localX.y * localCoords.x + localY.y * localCoords.y + localZ.y * localCoords.z,
                localX.z * localCoords.x + localY.z * localCoords.y + localZ.z * localCoords.z
            );

            // 5. Apply rotation
            const rotationMatrix = new THREE.Matrix4();
            const euler = new THREE.Euler(
                THREE.MathUtils.degToRad(params.rotX || 0),
                THREE.MathUtils.degToRad(params.rotY || 0),
                THREE.MathUtils.degToRad(params.rotZ || 0),
                'XYZ'
            );
            rotationMatrix.makeRotationFromEuler(euler);
            scaled.applyMatrix4(rotationMatrix);

            // 6. Translate to final position
            scaled.add(finalPosition);

            transformed.push(scaled.x, scaled.y, scaled.z);
        }

        const faceGeometry = new THREE.BufferGeometry();
        faceGeometry.setAttribute('position',
            new THREE.Float32BufferAttribute(transformed, 3));
        faceGeometry.computeVertexNormals();

        return faceGeometry;
    }
    
    simpleExtrusion(geometry, params) {
        const normal = this.calculateAverageNormal(geometry);
        const extrudeVector = normal.clone().multiplyScalar(params.length);
        
        // Simple extrusion - just translate geometry
        const positions = geometry.attributes.position.array;
        const extruded = [];
        
        for (let i = 0; i < positions.length; i += 3) {
            const p = new THREE.Vector3(
                positions[i],
                positions[i+1],
                positions[i+2]
            );
            
            extruded.push(p.x, p.y, p.z);
            
            const pEnd = p.clone().add(extrudeVector);
            extruded.push(pEnd.x, pEnd.y, pEnd.z);
        }
        
        const extrudedGeometry = new THREE.BufferGeometry();
        extrudedGeometry.setAttribute('position', 
            new THREE.Float32BufferAttribute(extruded, 3));
        extrudedGeometry.computeVertexNormals();
        
        const material = new THREE.MeshPhongMaterial({
            color: 0x87CEEB,
            side: THREE.DoubleSide
        });
        
        return { pipe: new THREE.Mesh(extrudedGeometry, material) };
    }
	
	
	/**
	 * Attempt to automatically fix boundary issues
	 * Tries multiple strategies and returns the best result
	 */
	fixBoundaries() {
		if (!this.app.boundaryData || this.app.boundaryData.loops.length === 0) {
			return { success: false, message: 'No boundary to fix. Click "Show Boundary Edges" first.' };
		}
		
		this.app.log('🔧 Attempting to auto-fix boundaries...');
		
		const originalLoops = this.app.boundaryData.loops.map(loop => [...loop]);
		const fixedLoops = [];
		let totalImprovements = 0;
		
		originalLoops.forEach((loop, loopIndex) => {
			if (loop.length < 3) {
				fixedLoops.push(loop);
				return;
			}
			
			// Try multiple strategies and pick the best
			const candidates = [];
			
			// Strategy 1: Original (baseline)
			candidates.push({
				loop: [...loop],
				score: this.scoreLoop(loop),
				method: 'original'
			});
			
			// Strategy 2: Reverse direction
			const reversed = [...loop].reverse();
			candidates.push({
				loop: reversed,
				score: this.scoreLoop(reversed),
				method: 'reversed'
			});
			
			// Strategy 3-7: Different starting points (try 5 different starts)
			const numStarts = Math.min(5, loop.length);
			for (let i = 1; i <= numStarts; i++) {
				const rotated = this.rotateLoop(loop, Math.floor(loop.length / numStarts * i));
				candidates.push({
					loop: rotated,
					score: this.scoreLoop(rotated),
					method: `rotated_${i}`
				});
			}
			
			// Strategy 8-12: Reversed + different starts
			for (let i = 1; i <= numStarts; i++) {
				const rotatedReversed = this.rotateLoop(reversed, Math.floor(loop.length / numStarts * i));
				candidates.push({
					loop: rotatedReversed,
					score: this.scoreLoop(rotatedReversed),
					method: `reversed_rotated_${i}`
				});
			}
			
			// Pick the best candidate
			candidates.sort((a, b) => b.score - a.score);
			const best = candidates[0];
			
			if (best.method !== 'original') {
				totalImprovements++;
				this.app.log(`  Loop ${loopIndex + 1}: Fixed using ${best.method} (score: ${best.score.toFixed(2)})`);
			}
			
			fixedLoops.push(best.loop);
		});
		
		if (totalImprovements === 0) {
			return { 
				success: false, 
				message: 'Boundaries already optimal. No improvements found.' 
			};
		}
		
		// Update the boundary data
		this.app.boundaryData = {
			loops: fixedLoops,
			totalPoints: fixedLoops.reduce((sum, loop) => sum + loop.length, 0)
		};
		
		// Update edge editor if it exists
		if (this.app.edgeEditor) {
			this.app.edgeEditor.initializeFromBoundary(this.app.boundaryData);
		}
		
		return { 
			success: true, 
			message: `Fixed ${totalImprovements} loop(s)`,
			improvements: totalImprovements
		};
	}

	/**
	 * Score a loop based on multiple quality metrics
	 * Higher score = better quality
	 */
	scoreLoop(loop) {
		if (loop.length < 3) return 0;
		
		let score = 100; // Start with perfect score
		
		// Metric 1: Total edge length (shorter is better - less twisting)
		let totalLength = 0;
		for (let i = 0; i < loop.length; i++) {
			const p1 = loop[i];
			const p2 = loop[(i + 1) % loop.length];
			totalLength += p1.distanceTo(p2);
		}
		const avgLength = totalLength / loop.length;
		
		// Penalize if edges are too long (sign of twisting)
		const lengthVariance = this.computeLengthVariance(loop, avgLength);
		score -= lengthVariance * 10;
		
		// Metric 2: Crossing detection (2D projection)
		const crossings = this.detectCrossings(loop);
		score -= crossings * 50; // Heavy penalty for crossings
		
		// Metric 3: Planarity (points should roughly be on a plane)
		const planarityScore = this.computePlanarity(loop);
		score += planarityScore * 20;
		
		// Metric 4: Convexity (prefer more convex shapes)
		const convexityScore = this.computeConvexity(loop);
		score += convexityScore * 10;
		
		return Math.max(0, score); // Ensure non-negative
	}

	/**
	 * Compute variance in edge lengths
	 */
	computeLengthVariance(loop, avgLength) {
		let variance = 0;
		for (let i = 0; i < loop.length; i++) {
			const p1 = loop[i];
			const p2 = loop[(i + 1) % loop.length];
			const length = p1.distanceTo(p2);
			const diff = length - avgLength;
			variance += diff * diff;
		}
		return Math.sqrt(variance / loop.length) / avgLength;
	}

	/**
	 * Detect edge crossings in 2D projection
	 */
	detectCrossings(loop) {
		// Project onto dominant plane
		const normal = this.computeLoopNormal(loop);
		const projected = this.projectLoop(loop, normal);
		
		let crossings = 0;
		
		// Check all edge pairs
		for (let i = 0; i < projected.length; i++) {
			const a1 = projected[i];
			const a2 = projected[(i + 1) % projected.length];
			
			for (let j = i + 2; j < projected.length; j++) {
				if (j === projected.length - 1 && i === 0) continue; // Skip adjacent edges
				
				const b1 = projected[j];
				const b2 = projected[(j + 1) % projected.length];
				
				if (this.edgesIntersect2D(a1, a2, b1, b2)) {
					crossings++;
				}
			}
		}
		
		return crossings;
	}

	/**
	 * Check if two 2D line segments intersect
	 */
	edgesIntersect2D(a1, a2, b1, b2) {
		const det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y);
		if (Math.abs(det) < 0.0001) return false; // Parallel
		
		const lambda = ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det;
		const gamma = ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det;
		
		return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
	}

	/**
	 * Compute how planar the loop is
	 */
	computePlanarity(loop) {
		if (loop.length < 4) return 1.0;
		
		const normal = this.computeLoopNormal(loop);
		const center = this.computeLoopCenter(loop);
		
		// Measure how far each point is from the plane
		let totalDeviation = 0;
		loop.forEach(point => {
			const toPoint = new THREE.Vector3().subVectors(point, center);
			const deviation = Math.abs(toPoint.dot(normal));
			totalDeviation += deviation;
		});
		
		const avgDeviation = totalDeviation / loop.length;
		
		// Compute average edge length for normalization
		let avgEdgeLength = 0;
		for (let i = 0; i < loop.length; i++) {
			avgEdgeLength += loop[i].distanceTo(loop[(i + 1) % loop.length]);
		}
		avgEdgeLength /= loop.length;
		
		const normalizedDeviation = avgDeviation / avgEdgeLength;
		return Math.max(0, 1.0 - normalizedDeviation * 2);
	}

	/**
	 * Compute convexity score
	 */
	computeConvexity(loop) {
		if (loop.length < 4) return 1.0;
		
		const normal = this.computeLoopNormal(loop);
		const projected = this.projectLoop(loop, normal);
		
		let concaveCount = 0;
		
		for (let i = 0; i < projected.length; i++) {
			const p1 = projected[(i - 1 + projected.length) % projected.length];
			const p2 = projected[i];
			const p3 = projected[(i + 1) % projected.length];
			
			const cross = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);
			
			if (cross < 0) concaveCount++;
		}
		
		return 1.0 - (concaveCount / projected.length);
	}

	/**
	 * Compute loop normal
	 */
	computeLoopNormal(loop) {
		const center = this.computeLoopCenter(loop);
		const normal = new THREE.Vector3();
		
		for (let i = 0; i < loop.length; i++) {
			const p1 = loop[i];
			const p2 = loop[(i + 1) % loop.length];
			
			const v1 = new THREE.Vector3().subVectors(p1, center);
			const v2 = new THREE.Vector3().subVectors(p2, center);
			
			const cross = new THREE.Vector3().crossVectors(v1, v2);
			normal.add(cross);
		}
		
		normal.normalize();
		return normal;
	}

	/**
	 * Compute loop center
	 */
	computeLoopCenter(loop) {
		const center = new THREE.Vector3();
		loop.forEach(p => center.add(p));
		center.divideScalar(loop.length);
		return center;
	}

	/**
	 * Project loop onto 2D plane perpendicular to normal
	 */
	projectLoop(loop, normal) {
		// Find two perpendicular axes to the normal
		let xAxis = new THREE.Vector3(1, 0, 0);
		if (Math.abs(normal.dot(xAxis)) > 0.9) {
			xAxis = new THREE.Vector3(0, 1, 0);
		}
		
		const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
		xAxis = new THREE.Vector3().crossVectors(yAxis, normal).normalize();
		
		const center = this.computeLoopCenter(loop);
		
		return loop.map(point => {
			const relative = new THREE.Vector3().subVectors(point, center);
			return {
				x: relative.dot(xAxis),
				y: relative.dot(yAxis)
			};
		});
	}

	/**
	 * Rotate loop to start at different vertex
	 */
	rotateLoop(loop, startIndex) {
		return [...loop.slice(startIndex), ...loop.slice(0, startIndex)];
	}
	
	
	/**
	 * Debug: Visualize vertex ordering on first and last ring
	 */
	debugRingConnections(boundary, centroid, normal, params, segments) {
		const loop = boundary.loops[0];
		const normalizedLoop = this.normalizeLoopStartPoint(loop, centroid, normal);
		
		// Create first ring (t=0)
		const firstRing = normalizedLoop.map(p => p.clone());
		
		// Create last ring (t=1)
		const lastParams = this.interpolateParams(1.0, this.buildControlPoints(params), normal);
		const lastRing = normalizedLoop.map(point => {
			let p = point.clone().sub(centroid);
			p = this.scalePointXY(p, lastParams.scaleX, lastParams.scaleY, normal);
			p = this.rotatePoint(p, lastParams.rotX, lastParams.rotY, lastParams.rotZ);
			p.add(centroid).add(lastParams.translation);
			return p;
		});
		
		// Visualize connections
		const debugGroup = new THREE.Group();
		
		// Draw lines connecting corresponding vertices
		for (let i = 0; i < Math.min(5, normalizedLoop.length); i++) {
			const color = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff][i];
			
			const points = [firstRing[i], lastRing[i]];
			const geometry = new THREE.BufferGeometry().setFromPoints(points);
			const material = new THREE.LineBasicMaterial({ color, linewidth: 3 });
			const line = new THREE.Line(geometry, material);
			debugGroup.add(line);
			
			// Add sphere at start point
			const sphereGeom = new THREE.SphereGeometry(2, 8, 8);
			const sphereMat = new THREE.MeshBasicMaterial({ color });
			const sphere = new THREE.Mesh(sphereGeom, sphereMat);
			sphere.position.copy(firstRing[i]);
			debugGroup.add(sphere);
		}
		
		this.app.scene.add(debugGroup);
		this.app.debugVisuals = debugGroup;
		
		this.app.log('🔍 Debug: Showing first 5 vertex connections');
	}
	
	
	/**
	 * DEBUG: Visualize loop vertex ordering
	 */
	visualizeLoopOrdering(loop, centroid, normal, loopIndex) {
		const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];
		
		// Show first 5 vertices with colored spheres
		for (let i = 0; i < Math.min(5, loop.length); i++) {
			const sphereGeom = new THREE.SphereGeometry(2, 8, 8);
			const sphereMat = new THREE.MeshBasicMaterial({ color: colors[i] });
			const sphere = new THREE.Mesh(sphereGeom, sphereMat);
			sphere.position.copy(loop[i]);
			this.app.scene.add(sphere);
			
			if (!this.app.debugVisuals) this.app.debugVisuals = [];
			this.app.debugVisuals.push(sphere);
			
			// Draw line from centroid to point
			const points = [centroid, loop[i]];
			const geometry = new THREE.BufferGeometry().setFromPoints(points);
			const material = new THREE.LineBasicMaterial({ color: colors[i], linewidth: 2 });
			const line = new THREE.Line(geometry, material);
			this.app.scene.add(line);
			this.app.debugVisuals.push(line);
		}
		
		this.app.log(`🔍 Loop ${loopIndex + 1}: Visualized first 5 vertices`);
	}

	/**
	 * Ensure all loops have consistent winding direction (counter-clockwise when viewed from normal)
	 */
	calculateLoopSignedArea(loop, normal) {
		if (loop.length < 3) return 0;

		// Calculate loop centroid
		const centroid = new THREE.Vector3();
		loop.forEach(p => centroid.add(p));
		centroid.divideScalar(loop.length);

		// Project onto plane perpendicular to normal
		const tangent = new THREE.Vector3();
		if (Math.abs(normal.z) < 0.9) {
			tangent.set(-normal.y, normal.x, 0).normalize();
		} else {
			tangent.set(1, 0, 0);
		}
		const bitangent = new THREE.Vector3().crossVectors(normal, tangent);

		// Calculate signed area using shoelace formula
		let signedArea = 0;
		for (let i = 0; i < loop.length; i++) {
			const p1 = loop[i].clone().sub(centroid);
			const p2 = loop[(i + 1) % loop.length].clone().sub(centroid);

			const x1 = p1.dot(tangent);
			const y1 = p1.dot(bitangent);
			const x2 = p2.dot(tangent);
			const y2 = p2.dot(bitangent);

			signedArea += (x1 * y2 - x2 * y1);
		}

		return signedArea;
	}

	normalizeLoopWindingDirection(loop, normal, shouldBeClockwise = false) {
		if (loop.length < 3) return loop;

		const signedArea = this.calculateLoopSignedArea(loop, normal);

		// Determine if we need to reverse based on what we want
		// signedArea > 0: counter-clockwise
		// signedArea < 0: clockwise
		const isClockwise = signedArea < 0;

		if (isClockwise !== shouldBeClockwise) {
			this.app.log(`    🔄 Reversing loop winding (${shouldBeClockwise ? 'CW' : 'CCW'} required)`);
			return [...loop].reverse();
		}

		return loop;
	}

	/**
	 * Project loop vertices onto a plane to remove height variations
	 * This fixes jagged edges when sweeping along curved boundaries
	 */
	flattenLoopOntoPlane(loop, planePoint, planeNormal) {
		if (loop.length === 0) return loop;

		// Create a plane at the centroid with the given normal
		const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(planeNormal, planePoint);

		// Calculate max deviation before flattening
		let maxDeviation = 0;
		loop.forEach(point => {
			const distance = Math.abs(plane.distanceToPoint(point));
			maxDeviation = Math.max(maxDeviation, distance);
		});

		// Project each point onto the plane
		const flattenedLoop = loop.map(point => {
			const projected = new THREE.Vector3();
			plane.projectPoint(point, projected);
			return projected;
		});

		this.app.log(`    📏 Flattened loop onto plane (max deviation removed: ${maxDeviation.toFixed(4)})`);

		return flattenedLoop;
	}

}

// ES module export
export { PipeGenerator };
