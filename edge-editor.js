// Edge Editor - Manual boundary edge manipulation
class EdgeEditor {
    constructor(app) {
        this.app = app;
        this.edgeMap = new Map(); // Map of edge keys to edge data
        this.pointMap = new Map(); // Map of point indices to coordinates
        this.adjacencyMap = new Map(); // Point adjacency for quick lookups
        this.currentBoundary = null;
    }
    
    /**
     * Initialize edge editor with current boundary data
     */
    initializeFromBoundary(boundary) {
        if (!boundary || boundary.loops.length === 0) {
            this.app.log('✗ No boundary data to initialize edge editor');
            return false;
        }
        
        this.currentBoundary = boundary;
        this.edgeMap.clear();
        this.pointMap.clear();
        this.adjacencyMap.clear();
        
        let globalPointIndex = 0;
        
        // Process each loop
        boundary.loops.forEach((loop, loopIndex) => {
            loop.forEach((point, localIndex) => {
                // Store point
                this.pointMap.set(globalPointIndex, {
                    position: point.clone(),
                    loopIndex: loopIndex,
                    localIndex: localIndex
                });
                
                // Initialize adjacency list
                this.adjacencyMap.set(globalPointIndex, new Set());
                
                globalPointIndex++;
            });
        });
        
        // Build edges
        globalPointIndex = 0;
        boundary.loops.forEach((loop, loopIndex) => {
            for (let i = 0; i < loop.length; i++) {
                const currentIdx = globalPointIndex + i;
                const nextIdx = globalPointIndex + ((i + 1) % loop.length);
                
                this.addEdgeInternal(currentIdx, nextIdx);
            }
            globalPointIndex += loop.length;
        });
        
        this.app.log(`✓ Edge editor initialized: ${this.pointMap.size} points, ${this.edgeMap.size} edges`);
        return true;
    }
    
    /**
     * Add an edge between two points
     */
    addEdgeInternal(pointA, pointB) {
        const key = this.makeEdgeKey(pointA, pointB);
        
        if (!this.edgeMap.has(key)) {
            this.edgeMap.set(key, {
                pointA: Math.min(pointA, pointB),
                pointB: Math.max(pointA, pointB),
                removed: false
            });
            
            // Update adjacency
            this.adjacencyMap.get(pointA).add(pointB);
            this.adjacencyMap.get(pointB).add(pointA);
        }
    }
    
    /**
     * Remove an edge between two points
     */
    removeEdge(pointA, pointB) {
        if (!this.pointMap.has(pointA) || !this.pointMap.has(pointB)) {
            this.app.log(`✗ Invalid point indices: ${pointA}, ${pointB}`);
            return false;
        }
        
        const key = this.makeEdgeKey(pointA, pointB);
        
        if (!this.edgeMap.has(key)) {
            this.app.log(`✗ Edge ${pointA}-${pointB} does not exist`);
            return false;
        }
        
        // Check if removing this edge would disconnect the graph
        if (!this.canRemoveEdgeSafely(pointA, pointB)) {
            this.app.log(`✗ Cannot remove edge ${pointA}-${pointB}: would disconnect boundary`);
            return false;
        }
        
        const edge = this.edgeMap.get(key);
        edge.removed = true;
        
        // Update adjacency
        this.adjacencyMap.get(pointA).delete(pointB);
        this.adjacencyMap.get(pointB).delete(pointA);
        
        this.app.log(`✓ Removed edge ${pointA}-${pointB}`);
        return true;
    }
    
    /**
     * Add a new edge between two points
     */
    addEdge(pointA, pointB) {
        if (!this.pointMap.has(pointA) || !this.pointMap.has(pointB)) {
            this.app.log(`✗ Invalid point indices: ${pointA}, ${pointB}`);
            return false;
        }
        
        if (pointA === pointB) {
            this.app.log(`✗ Cannot create edge to same point`);
            return false;
        }
        
        const key = this.makeEdgeKey(pointA, pointB);
        
        // Check if edge already exists and is not removed
        if (this.edgeMap.has(key)) {
            const edge = this.edgeMap.get(key);
            if (!edge.removed) {
                this.app.log(`✗ Edge ${pointA}-${pointB} already exists`);
                return false;
            } else {
                // Re-enable removed edge
                edge.removed = false;
                this.adjacencyMap.get(pointA).add(pointB);
                this.adjacencyMap.get(pointB).add(pointA);
                this.app.log(`✓ Re-enabled edge ${pointA}-${pointB}`);
                return true;
            }
        }
        
        // Check if adding this edge would create an invalid topology
        const degreeA = this.adjacencyMap.get(pointA).size;
        const degreeB = this.adjacencyMap.get(pointB).size;
        
        if (degreeA >= 2 || degreeB >= 2) {
            this.app.log(`⚠️ Warning: Point ${degreeA >= 2 ? pointA : pointB} will have more than 2 connections`);
            this.app.log(`   This may create a non-manifold boundary`);
        }
        
        // Add the edge
        this.addEdgeInternal(pointA, pointB);
        this.app.log(`✓ Added edge ${pointA}-${pointB}`);
        return true;
    }
    
    /**
     * Check if an edge can be removed without disconnecting the graph
     */
    canRemoveEdgeSafely(pointA, pointB) {
        // Temporarily remove edge and check connectivity
        this.adjacencyMap.get(pointA).delete(pointB);
        this.adjacencyMap.get(pointB).delete(pointA);
        
        // Check if graph is still connected using BFS
        const visited = new Set();
        const queue = [pointA];
        visited.add(pointA);
        
        while (queue.length > 0) {
            const current = queue.shift();
            
            for (const neighbor of this.adjacencyMap.get(current)) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
        
        // Restore edge
        this.adjacencyMap.get(pointA).add(pointB);
        this.adjacencyMap.get(pointB).add(pointA);
        
        // Check if all points were reached
        return visited.size === this.pointMap.size;
    }
    
    /**
     * Reorder boundary points to follow edges correctly
     */
    reorderBoundary() {
        if (!this.currentBoundary) {
            this.app.log('✗ No boundary data to reorder');
            return null;
        }
        
        this.app.log('🔄 Reordering boundary loops...');
        
        // Find all connected components (loops)
        const visited = new Set();
        const newLoops = [];
        
        for (const [startPoint, _] of this.pointMap) {
            if (visited.has(startPoint)) continue;
            
            // Start a new loop from this point
            const loop = this.traceLoop(startPoint, visited);
            
            if (loop && loop.length >= 3) {
                newLoops.push(loop);
            }
        }
        
        if (newLoops.length === 0) {
            this.app.log('✗ No valid loops found after reordering');
            return null;
        }
        
        // Sort loops by size (largest first = outer loop)
        newLoops.sort((a, b) => b.length - a.length);
        
        // Convert point indices to positions
        const positionLoops = newLoops.map(loop => 
            loop.map(pointIdx => this.pointMap.get(pointIdx).position)
        );
        
        const totalPoints = positionLoops.reduce((sum, loop) => sum + loop.length, 0);
        
        this.app.log(`✓ Reordering complete: ${newLoops.length} loops, ${totalPoints} points`);
        
        return {
            loops: positionLoops,
            totalPoints: totalPoints
        };
    }
    
    /**
     * Trace a loop starting from a point
     */
    traceLoop(startPoint, visited) {
        const loop = [];
        let current = startPoint;
        let previous = null;
        
        while (true) {
            if (visited.has(current)) {
                // We've completed the loop
                break;
            }
            
            visited.add(current);
            loop.push(current);
            
            // Find next point
            const neighbors = Array.from(this.adjacencyMap.get(current));
            
            if (neighbors.length === 0) {
                // Dead end
                this.app.log(`⚠️ Point ${current} has no connections`);
                break;
            }
            
            // Choose next neighbor (not the one we came from)
            let next = null;
            for (const neighbor of neighbors) {
                if (neighbor !== previous) {
                    next = neighbor;
                    break;
                }
            }
            
            if (next === null) {
                // Only one neighbor and it's where we came from
                if (neighbors.length === 1 && neighbors[0] === previous) {
                    break;
                }
                next = neighbors[0];
            }
            
            // Check if we've returned to start
            if (next === startPoint) {
                break;
            }
            
            previous = current;
            current = next;
            
            // Safety check for infinite loops
            if (loop.length > this.pointMap.size) {
                this.app.log('⚠️ Loop tracing exceeded point count - possible error');
                break;
            }
        }
        
        return loop;
    }
    
    /**
     * Get current edge list for visualization
     */
    getCurrentEdges() {
        const edges = [];
        
        for (const [key, edge] of this.edgeMap) {
            if (!edge.removed) {
                const pointA = this.pointMap.get(edge.pointA);
                const pointB = this.pointMap.get(edge.pointB);
                
                if (pointA && pointB) {
                    edges.push({
                        pointA: edge.pointA,
                        pointB: edge.pointB,
                        posA: pointA.position,
                        posB: pointB.position
                    });
                }
            }
        }
        
        return edges;
    }
    
    /**
     * Get point information
     */
    getPointInfo(pointIndex) {
        if (!this.pointMap.has(pointIndex)) {
            return null;
        }
        
        const point = this.pointMap.get(pointIndex);
        const connections = Array.from(this.adjacencyMap.get(pointIndex));
        
        return {
            index: pointIndex,
            position: point.position,
            loopIndex: point.loopIndex,
            localIndex: point.localIndex,
            connections: connections,
            degree: connections.length
        };
    }
    
    /**
     * Validate current boundary topology
     */
    validateTopology() {
        const issues = [];
        
        // Check each point's degree (should be exactly 2 for manifold boundary)
        for (const [pointIdx, adjacency] of this.adjacencyMap) {
            const degree = adjacency.size;
            
            if (degree < 2) {
                issues.push(`Point ${pointIdx} has degree ${degree} (dangling edge)`);
            } else if (degree > 2) {
                issues.push(`Point ${pointIdx} has degree ${degree} (non-manifold)`);
            }
        }
        
        // Check for disconnected components
        const visited = new Set();
        let componentCount = 0;
        
        for (const [startPoint, _] of this.pointMap) {
            if (!visited.has(startPoint)) {
                // BFS to mark component
                const queue = [startPoint];
                visited.add(startPoint);
                componentCount++;
                
                while (queue.length > 0) {
                    const current = queue.shift();
                    
                    for (const neighbor of this.adjacencyMap.get(current)) {
                        if (!visited.has(neighbor)) {
                            visited.add(neighbor);
                            queue.push(neighbor);
                        }
                    }
                }
            }
        }
        
        if (componentCount > 1) {
            issues.push(`${componentCount} disconnected components (expected 1 or more closed loops)`);
        }
        
        return {
            valid: issues.length === 0,
            issues: issues,
            componentCount: componentCount
        };
    }
    
    /**
     * Create a consistent edge key
     */
    makeEdgeKey(pointA, pointB) {
        const min = Math.min(pointA, pointB);
        const max = Math.max(pointA, pointB);
        return `${min}-${max}`;
    }
    
    /**
     * Get statistics about current boundary
     */
    getStatistics() {
        const activeEdges = Array.from(this.edgeMap.values()).filter(e => !e.removed).length;
        const removedEdges = this.edgeMap.size - activeEdges;
        
        const degreeDistribution = new Map();
        for (const [_, adjacency] of this.adjacencyMap) {
            const degree = adjacency.size;
            degreeDistribution.set(degree, (degreeDistribution.get(degree) || 0) + 1);
        }
        
        return {
            points: this.pointMap.size,
            activeEdges: activeEdges,
            removedEdges: removedEdges,
            degreeDistribution: Object.fromEntries(degreeDistribution)
        };
    }
}

// ES module export
export { EdgeEditor };
