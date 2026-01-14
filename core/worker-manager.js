/**
 * WorkerManager - Manages Web Worker lifecycle and task execution
 *
 * Features:
 * - Worker pool management with automatic cleanup
 * - Task queuing with priority support
 * - Progress tracking and callbacks
 * - Error handling and retry logic
 * - Resource cleanup and memory management
 */

export class WorkerManager {
    constructor() {
        this.workers = new Map(); // workerId -> { worker, busy, task }
        this.taskQueue = [];
        this.nextWorkerId = 0;
        this.nextTaskId = 0;

        // Configuration
        this.maxWorkers = navigator.hardwareConcurrency || 4;
        this.workerTimeout = 60000; // 60 seconds
        this.maxRetries = 2;

        // Statistics
        this.stats = {
            tasksCompleted: 0,
            tasksFailed: 0,
            totalProcessingTime: 0,
            activeWorkers: 0
        };
    }

    /**
     * Execute a task in a web worker
     * @param {string} workerUrl - URL to worker script
     * @param {object} data - Data to send to worker
     * @param {object} options - Task options
     * @returns {Promise} Resolves with worker result
     */
    async executeTask(workerUrl, data, options = {}) {
        const task = {
            id: this.nextTaskId++,
            workerUrl,
            data,
            priority: options.priority || 0,
            retries: 0,
            maxRetries: options.maxRetries ?? this.maxRetries,
            timeout: options.timeout || this.workerTimeout,
            onProgress: options.onProgress,
            startTime: null,
            timeoutHandle: null
        };

        return new Promise((resolve, reject) => {
            task.resolve = resolve;
            task.reject = reject;

            // Add to queue
            this.taskQueue.push(task);

            // Sort by priority (higher priority first)
            this.taskQueue.sort((a, b) => b.priority - a.priority);

            // Try to execute immediately
            this.processQueue();
        });
    }

    /**
     * Process the task queue
     */
    processQueue() {
        // Get available worker or create new one
        while (this.taskQueue.length > 0 && this.stats.activeWorkers < this.maxWorkers) {
            const task = this.taskQueue.shift();
            this.executeTaskInWorker(task);
        }
    }

    /**
     * Execute a task in a worker
     * @param {object} task - Task to execute
     */
    async executeTaskInWorker(task) {
        let workerId = null;

        try {
            // Find or create worker
            workerId = this.getAvailableWorker(task.workerUrl);

            if (workerId === null) {
                // Create new worker
                workerId = this.createWorker(task.workerUrl);
            }

            const workerInfo = this.workers.get(workerId);
            workerInfo.busy = true;
            workerInfo.task = task;
            this.stats.activeWorkers++;

            task.startTime = performance.now();

            // Set up timeout
            task.timeoutHandle = setTimeout(() => {
                this.handleTaskTimeout(workerId, task);
            }, task.timeout);

            // Set up message handler
            const messageHandler = (e) => {
                this.handleWorkerMessage(workerId, task, e.data, messageHandler, errorHandler);
            };

            // Set up error handler
            const errorHandler = (error) => {
                this.handleWorkerError(workerId, task, error, messageHandler, errorHandler);
            };

            workerInfo.worker.addEventListener('message', messageHandler);
            workerInfo.worker.addEventListener('error', errorHandler);

            // Send task to worker
            workerInfo.worker.postMessage(task.data);

        } catch (error) {
            // Clean up on error
            if (task.timeoutHandle) {
                clearTimeout(task.timeoutHandle);
            }

            if (workerId !== null) {
                this.releaseWorker(workerId);
            }

            this.handleTaskFailure(task, error);
        }
    }

    /**
     * Handle worker message
     */
    handleWorkerMessage(workerId, task, data, messageHandler, errorHandler) {
        if (data.type === 'progress') {
            // Progress update
            if (task.onProgress) {
                task.onProgress(data);
            }
        } else if (data.type === 'complete') {
            // Task completed successfully
            this.handleTaskSuccess(workerId, task, data, messageHandler, errorHandler);
        } else if (data.type === 'error') {
            // Task failed
            this.handleTaskFailure(task, new Error(data.message), messageHandler, errorHandler);
        }
    }

    /**
     * Handle worker error
     */
    handleWorkerError(workerId, task, error, messageHandler, errorHandler) {
        console.error(`Worker ${workerId} error:`, error);

        // Clean up listeners
        const workerInfo = this.workers.get(workerId);
        if (workerInfo) {
            workerInfo.worker.removeEventListener('message', messageHandler);
            workerInfo.worker.removeEventListener('error', errorHandler);
        }

        // Terminate problematic worker
        this.terminateWorker(workerId);

        // Handle task failure (will retry if possible)
        this.handleTaskFailure(task, error);
    }

    /**
     * Handle task success
     */
    handleTaskSuccess(workerId, task, result, messageHandler, errorHandler) {
        // Clear timeout
        if (task.timeoutHandle) {
            clearTimeout(task.timeoutHandle);
        }

        // Clean up listeners
        const workerInfo = this.workers.get(workerId);
        if (workerInfo) {
            workerInfo.worker.removeEventListener('message', messageHandler);
            workerInfo.worker.removeEventListener('error', errorHandler);
        }

        // Update statistics
        const processingTime = performance.now() - task.startTime;
        this.stats.tasksCompleted++;
        this.stats.totalProcessingTime += processingTime;

        // Release worker
        this.releaseWorker(workerId);

        // Resolve promise
        task.resolve(result);

        // Process next task in queue
        this.processQueue();
    }

    /**
     * Handle task failure
     */
    handleTaskFailure(task, error, messageHandler, errorHandler) {
        // Clear timeout
        if (task.timeoutHandle) {
            clearTimeout(task.timeoutHandle);
        }

        // Clean up listeners if provided
        if (messageHandler && errorHandler) {
            const workerInfo = Array.from(this.workers.values()).find(w => w.task === task);
            if (workerInfo) {
                workerInfo.worker.removeEventListener('message', messageHandler);
                workerInfo.worker.removeEventListener('error', errorHandler);
            }
        }

        // Retry if possible
        if (task.retries < task.maxRetries) {
            task.retries++;
            console.warn(`Retrying task ${task.id} (attempt ${task.retries + 1}/${task.maxRetries + 1})`);

            // Add back to queue
            this.taskQueue.unshift(task);
            this.processQueue();
        } else {
            // No more retries - fail the task
            this.stats.tasksFailed++;
            task.reject(error);

            // Process next task
            this.processQueue();
        }
    }

    /**
     * Handle task timeout
     */
    handleTaskTimeout(workerId, task) {
        console.warn(`Task ${task.id} timed out after ${task.timeout}ms`);

        // Terminate worker
        this.terminateWorker(workerId);

        // Handle as failure
        this.handleTaskFailure(task, new Error(`Task timeout after ${task.timeout}ms`));
    }

    /**
     * Get available worker for a given worker URL
     */
    getAvailableWorker(workerUrl) {
        for (const [id, info] of this.workers.entries()) {
            if (info.workerUrl === workerUrl && !info.busy) {
                return id;
            }
        }
        return null;
    }

    /**
     * Create new worker
     */
    createWorker(workerUrl) {
        const workerId = this.nextWorkerId++;

        // Add cache-busting timestamp to worker URL
        const cacheBustedUrl = workerUrl + '?t=' + Date.now();
        const worker = new Worker(cacheBustedUrl, { type: 'module' });

        this.workers.set(workerId, {
            worker,
            workerUrl,
            busy: false,
            task: null,
            createdAt: Date.now()
        });

        return workerId;
    }

    /**
     * Release worker (mark as available)
     */
    releaseWorker(workerId) {
        const workerInfo = this.workers.get(workerId);
        if (workerInfo) {
            workerInfo.busy = false;
            workerInfo.task = null;
            this.stats.activeWorkers--;
        }
    }

    /**
     * Terminate worker
     */
    terminateWorker(workerId) {
        const workerInfo = this.workers.get(workerId);
        if (workerInfo) {
            workerInfo.worker.terminate();
            this.workers.delete(workerId);

            if (workerInfo.busy) {
                this.stats.activeWorkers--;
            }
        }
    }

    /**
     * Terminate all workers
     */
    terminateAllWorkers() {
        for (const [workerId, info] of this.workers.entries()) {
            info.worker.terminate();
        }

        this.workers.clear();
        this.stats.activeWorkers = 0;
    }

    /**
     * Clean up idle workers
     * @param {number} maxIdleTime - Max idle time in ms
     */
    cleanupIdleWorkers(maxIdleTime = 30000) {
        const now = Date.now();
        const toRemove = [];

        for (const [workerId, info] of this.workers.entries()) {
            if (!info.busy && (now - info.createdAt) > maxIdleTime) {
                toRemove.push(workerId);
            }
        }

        toRemove.forEach(workerId => this.terminateWorker(workerId));

        return toRemove.length;
    }

    /**
     * Get worker statistics
     */
    getStats() {
        return {
            ...this.stats,
            totalWorkers: this.workers.size,
            queuedTasks: this.taskQueue.length,
            averageProcessingTime: this.stats.tasksCompleted > 0
                ? this.stats.totalProcessingTime / this.stats.tasksCompleted
                : 0
        };
    }

    /**
     * Cancel all pending tasks
     */
    cancelPendingTasks() {
        const cancelled = this.taskQueue.length;

        this.taskQueue.forEach(task => {
            task.reject(new Error('Task cancelled'));
        });

        this.taskQueue = [];

        return cancelled;
    }

    /**
     * Destroy the manager and clean up all resources
     */
    destroy() {
        // Cancel pending tasks
        this.cancelPendingTasks();

        // Terminate all workers
        this.terminateAllWorkers();

        // Reset state
        this.stats = {
            tasksCompleted: 0,
            tasksFailed: 0,
            totalProcessingTime: 0,
            activeWorkers: 0
        };
    }
}

/**
 * SimplificationWorkerManager - Specialized manager for mesh simplification
 * Provides a convenient API for mesh simplification tasks
 */
export class SimplificationWorkerManager {
    constructor() {
        this.workerManager = new WorkerManager();
        // Add version parameter to force reload after bug fixes
        this.workerUrl = './core/workers/simplification-worker.js?v=2';
    }

    /**
     * Simplify a mesh using the worker
     * @param {Float32Array} positions - Vertex positions
     * @param {number} targetReduction - Target reduction (0.0 to 1.0)
     * @param {function} onProgress - Progress callback
     * @returns {Promise<Float32Array>} Simplified positions
     */
    async simplifyMesh(positions, targetReduction, onProgress) {
        try {
            const result = await this.workerManager.executeTask(
                this.workerUrl,
                { positions, targetReduction },
                {
                    onProgress,
                    timeout: 120000, // 2 minutes for large meshes
                    priority: 1
                }
            );

            if (result.type === 'complete') {
                return result.positions;
            } else {
                throw new Error('Unexpected worker result type');
            }

        } catch (error) {
            console.error('Mesh simplification failed:', error);
            throw error;
        }
    }

    /**
     * Clean up idle workers
     */
    cleanup() {
        return this.workerManager.cleanupIdleWorkers(30000);
    }

    /**
     * Get statistics
     */
    getStats() {
        return this.workerManager.getStats();
    }

    /**
     * Destroy and clean up
     */
    destroy() {
        this.workerManager.destroy();
    }
}
