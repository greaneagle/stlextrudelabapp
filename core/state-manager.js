import { AppState } from './models/app-state.js';

/**
 * StateManager - Manages undo/redo history and state transitions
 * Provides centralized state management with time-travel debugging capabilities
 */
export class StateManager {
    constructor(app) {
        this.app = app;
        this.currentState = new AppState();
        this.history = [];
        this.historyIndex = -1;

        // Configuration
        this.maxHistorySize = 50;                    // Max number of states to keep
        this.maxHistoryBytes = 500 * 1024 * 1024;   // 500MB max memory usage

        // Debouncing for rapid changes
        this.pendingPushTimeout = null;
        this.debounceDelay = 300; // ms

        // Track unsaved changes
        this.lastSavedIndex = -1; // Index of the last saved state
    }

    /**
     * Push new state to history
     * @param {string} description - Human-readable description of the change
     * @param {boolean} immediate - If true, bypass debouncing
     */
    pushState(description = 'Change', immediate = false) {
        // Clear any pending debounced push
        if (this.pendingPushTimeout) {
            clearTimeout(this.pendingPushTimeout);
            this.pendingPushTimeout = null;
        }

        if (!immediate && this.debounceDelay > 0) {
            // Debounce rapid changes (e.g., slider adjustments)
            this.pendingPushTimeout = setTimeout(() => {
                this._doPushState(description);
            }, this.debounceDelay);
        } else {
            this._doPushState(description);
        }
    }

    /**
     * Internal method to actually push state
     */
    _doPushState(description) {
        // Capture current app state
        const snapshot = AppState.fromApp(this.app);
        snapshot.description = description;

        // Remove any states after current index (branching timeline)
        this.history = this.history.slice(0, this.historyIndex + 1);

        // Add new state
        this.history.push(snapshot);
        this.historyIndex++;

        // Update current state reference
        this.currentState = snapshot;

        // Enforce size limits
        this.enforceHistoryLimits();

        // Log
        if (this.app.log) {
            this.app.log(`📝 ${description}`);
        }

        // Update UI
        this.updateUI();
    }

    /**
     * Undo to previous state
     */
    undo() {
        if (!this.canUndo()) {
            if (this.app.log) {
                this.app.log('⚠️ Nothing to undo');
            }
            return false;
        }

        this.historyIndex--;
        const state = this.history[this.historyIndex];
        this.restoreState(state);

        if (this.app.log) {
            this.app.log(`↶ Undo: ${state.description}`);
        }

        this.updateUI();
        return true;
    }

    /**
     * Redo to next state
     */
    redo() {
        if (!this.canRedo()) {
            if (this.app.log) {
                this.app.log('⚠️ Nothing to redo');
            }
            return false;
        }

        this.historyIndex++;
        const state = this.history[this.historyIndex];
        this.restoreState(state);

        if (this.app.log) {
            this.app.log(`↷ Redo: ${state.description}`);
        }

        this.updateUI();
        return true;
    }

    /**
     * Check if undo is available
     */
    canUndo() {
        return this.historyIndex > 0;
    }

    /**
     * Check if redo is available
     */
    canRedo() {
        return this.historyIndex < this.history.length - 1;
    }

    /**
     * Restore a specific state
     */
    restoreState(state) {
        // Update current state reference
        this.currentState = state.clone();

        // Apply state to app (this handles all cleanup and restoration)
        state.applyToApp(this.app);

        // Re-render scene
        if (this.app.render) {
            this.app.render();
        }

        // Update preview if enabled (give the scene time to settle)
        if (this.app.uiController && state.settings.previewEnabled) {
            setTimeout(() => {
                if (this.app.uiController.updatePreview) {
                    this.app.uiController.updatePreview();
                }
            }, 100);
        }
    }

    /**
     * Enforce history size limits
     */
    enforceHistoryLimits() {
        // Check count limit
        if (this.history.length > this.maxHistorySize) {
            const removeCount = this.history.length - this.maxHistorySize;
            this.history.splice(0, removeCount);
            this.historyIndex -= removeCount;

            if (this.app.log) {
                this.app.log(`⚠️ History trimmed to ${this.history.length} states (count limit)`);
            }
        }

        // Check memory limit
        let totalBytes = 0;
        for (let i = this.history.length - 1; i >= 0; i--) {
            totalBytes += this.history[i].getSize();

            if (totalBytes > this.maxHistoryBytes && i < this.history.length - 10) {
                // Keep at least last 10 states
                this.history.splice(0, i);
                this.historyIndex -= i;

                if (this.app.log) {
                    this.app.log(`⚠️ History trimmed to ${this.history.length} states (memory limit)`);
                }
                break;
            }
        }
    }

    /**
     * Clear all history
     */
    clearHistory() {
        const currentSnapshot = AppState.fromApp(this.app);
        currentSnapshot.description = 'Current state';

        this.history = [currentSnapshot];
        this.historyIndex = 0;
        this.currentState = currentSnapshot;

        if (this.app.log) {
            this.app.log('🗑️ History cleared');
        }

        this.updateUI();
    }

    /**
     * Update UI undo/redo buttons
     */
    updateUI() {
        const undoBtn = document.getElementById('undo-btn');
        const redoBtn = document.getElementById('redo-btn');

        if (undoBtn) {
            undoBtn.disabled = !this.canUndo();
            undoBtn.title = this.canUndo() ?
                `Undo: ${this.history[this.historyIndex - 1].description}` :
                'Nothing to undo';
        }

        if (redoBtn) {
            redoBtn.disabled = !this.canRedo();
            redoBtn.title = this.canRedo() ?
                `Redo: ${this.history[this.historyIndex + 1].description}` :
                'Nothing to redo';
        }

        // Update history info
        const historyInfo = document.getElementById('history-info');
        if (historyInfo) {
            historyInfo.textContent =
                `${this.historyIndex + 1} / ${this.history.length}`;
        }
    }

    /**
     * Get history statistics
     */
    getStats() {
        const totalBytes = this.history.reduce((sum, state) => sum + state.getSize(), 0);
        return {
            count: this.history.length,
            currentIndex: this.historyIndex,
            totalBytes: totalBytes,
            totalMB: (totalBytes / (1024 * 1024)).toFixed(2),
            canUndo: this.canUndo(),
            canRedo: this.canRedo()
        };
    }

    /**
     * Export current state to JSON file
     */
    exportState() {
        const state = AppState.fromApp(this.app);
        const json = JSON.stringify(state.toJSON(), null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `pipe-project-${Date.now()}.json`;
        link.click();

        URL.revokeObjectURL(url);

        // Mark as saved
        this.markAsSaved();

        if (this.app.log) {
            this.app.log('💾 Project state exported');
        }
    }

    /**
     * Import state from JSON file
     */
    async importState(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            const state = AppState.fromJSON(data);

            // Apply imported state
            this.restoreState(state);

            // Clear history and start fresh
            this.history = [state];
            this.historyIndex = 0;
            this.currentState = state;

            // Reset saved state tracking (imported state is considered saved)
            this.resetSavedState();

            if (this.app.log) {
                this.app.log('📂 Project state imported');
            }

            this.updateUI();
            return true;
        } catch (error) {
            if (this.app.log) {
                this.app.log(`✗ Import failed: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Get list of recent history items
     */
    getHistoryList(maxItems = 10) {
        const start = Math.max(0, this.historyIndex - maxItems);
        const end = Math.min(this.history.length, this.historyIndex + maxItems + 1);

        return this.history.slice(start, end).map((state, idx) => ({
            index: start + idx,
            description: state.description,
            timestamp: state.timestamp,
            isCurrent: (start + idx) === this.historyIndex
        }));
    }

    /**
     * Check if there are unsaved changes
     * @returns {boolean} True if there are unsaved changes
     */
    hasUnsavedChanges() {
        // No changes if history is empty or only has initial state
        if (this.history.length <= 1) {
            return false;
        }

        // Check if current state is different from last saved state
        return this.historyIndex !== this.lastSavedIndex;
    }

    /**
     * Mark current state as saved
     */
    markAsSaved() {
        this.lastSavedIndex = this.historyIndex;
        if (this.app.log) {
            this.app.log('💾 Changes marked as saved');
        }
    }

    /**
     * Reset saved state tracking (e.g., when loading a new file)
     */
    resetSavedState() {
        this.lastSavedIndex = this.historyIndex;
    }
}
