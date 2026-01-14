// STL Loader Utilities
// Wrapper around Three.js STLLoader with additional helpers

class STLLoaderUtils {
    static async loadFromFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                try {
                    const loader = new THREE.STLLoader();
                    const geometry = loader.parse(e.target.result);
                    resolve(geometry);
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            
            reader.readAsArrayBuffer(file);
        });
    }
    
    static async loadFromURL(url) {
        return new Promise((resolve, reject) => {
            const loader = new THREE.STLLoader();
            
            loader.load(
                url,
                (geometry) => resolve(geometry),
                (progress) => {
                    console.log(`Loading: ${(progress.loaded / progress.total * 100).toFixed(2)}%`);
                },
                (error) => reject(error)
            );
        });
    }
    
    static exportToSTL(geometry, binary = false) {
        const exporter = new THREE.STLExporter();
        return exporter.parse(geometry, { binary });
    }
    
    static downloadSTL(geometry, filename = 'model.stl', binary = false) {
        const stlString = this.exportToSTL(geometry, binary);
        
        const blob = binary 
            ? new Blob([stlString], { type: 'application/octet-stream' })
            : new Blob([stlString], { type: 'text/plain' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        
        // Cleanup
        setTimeout(() => URL.revokeObjectURL(link.href), 100);
    }
    
    static getSTLInfo(geometry) {
        const position = geometry.attributes.position;
        const vertexCount = position.count;
        const faceCount = vertexCount / 3;
        
        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        geometry.boundingBox.getSize(size);
        
        return {
            vertices: vertexCount,
            faces: faceCount,
            size: {
                x: size.x.toFixed(2),
                y: size.y.toFixed(2),
                z: size.z.toFixed(2)
            },
            volume: this.calculateVolume(geometry)
        };
    }
    
    static calculateVolume(geometry) {
        // Calculate volume using signed tetrahedron method
        const positions = geometry.attributes.position.array;
        let volume = 0;
        
        for (let i = 0; i < positions.length; i += 9) {
            const v1 = new THREE.Vector3(positions[i], positions[i+1], positions[i+2]);
            const v2 = new THREE.Vector3(positions[i+3], positions[i+4], positions[i+5]);
            const v3 = new THREE.Vector3(positions[i+6], positions[i+7], positions[i+8]);
            
            // Signed volume of tetrahedron formed by origin and triangle
            volume += v1.dot(new THREE.Vector3().crossVectors(v2, v3)) / 6;
        }
        
        return Math.abs(volume).toFixed(2);
    }
    
    static centerGeometry(geometry) {
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox.getCenter(center);
        geometry.translate(-center.x, -center.y, -center.z);
        return geometry;
    }
    
    static scaleToFit(geometry, targetSize = 100) {
        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        geometry.boundingBox.getSize(size);
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = targetSize / maxDim;
        
        geometry.scale(scale, scale, scale);
        return geometry;
    }
}

// ES module export
export { STLLoaderUtils };
