# STL ExtrudeLab

A browser-based 3D mesh editor for creating pipe and tube extrusions from selected faces on existing 3D models.  
No installation required — runs entirely in your browser.

Free Live version available here: https://www.stlextrudelab.com/

---

## Why This Exists

Many 3D printing workflows involve making small modifications to existing STL files (adding holes, pipes, connectors, or pass-throughs).  
Traditional CAD tools are often overkill for these tasks.

**STL ExtrudeLab focuses on one thing:**  
**quickly extending and modifying existing meshes without needing full CAD software.**

---

## What This Tool Is (and Is Not)

### STL ExtrudeLab *is*:
- A focused mesh editing tool
- Designed for modifying existing STL files
- Optimized for practical 3D printing workflows
- Fully client-side (no uploads, no backend)

### STL ExtrudeLab *is not*:
- A full CAD system
- A parametric modeler
- A precision engineering tool
- A replacement for Blender, Fusion, or FreeCAD

---

## What It Does

STL ExtrudeLab lets you select faces on any 3D model and extrude pipes or tubes from them.

Common use cases:
- Changing Angles of mounts
- Increasing the size and position of backplates
- Lengthening parts
- Modifying downloaded STL files without CAD software

---

## Features

### Face Selection
- Click individual triangles to select or deselect
- **Auto-select**: Automatically selects all visible flat faces facing the camera
- Hold **Shift** for multi-select
- Press **R** to toggle selection mode (allows camera movement without selecting)
- Selected faces are highlighted in orange

### Extrusion Controls
- **Length**: How far the extrusion extends
- **Offset X / Y / Z**: Position the end face
- **Rotation X / Y / Z**: Rotate the end face (degrees)
- **Scale X / Y**: Scale the end face independently per axis
- **Segments**: Control smoothness (more segments = smoother curves)
- **Segment Splits**: Extra subdivisions at start/end for smoother transitions
- **Live Preview**: See changes in real time before committing

### Waypoints
Add intermediate control points along the extrusion path.  
Each waypoint supports position, rotation, and scale, enabling curved or multi-segment extrusions.

### Mesh Processing

**Simplification**
- Reduces triangle count using Quadric Error Metrics (QEM)
- Adjustable reduction from 10% to 90%
- Preserves overall shape

**Validation**
- Detects degenerate faces (zero-area triangles)
- Finds non-manifold edges and vertices
- Identifies holes and boundary edges
- Checks for inverted normals

**Repair**
- Removes degenerate faces
- Fixes inverted normals
- Welds duplicate vertices

### File Support
- **Import**: STL, OBJ, PLY, GLTF, GLB
- **Export**: Binary STL (optimized for 3D printing)
- Drag-and-drop or file picker
- 5MB file size limit

### 3D Viewer
- WebGL rendering via Three.js
- Orbit controls: left-click rotate, right-click pan, scroll zoom
- Wireframe overlay with color picker
- Flat or smooth shading toggle
- Grid and axis helpers

### Boundary Edge Tools
- Visualize boundary edges with numbered vertices
- Manually add or remove edges
- Auto-fix boundary issues
- Reorder vertices for clean loops
- Handles inner boundaries (holes)

### Memory Management
- Tracks GPU resource usage
- Manual cleanup option
- Automatic disposal of unused resources

---

## How to Use

### Basic Workflow

1. **Load a model**  
   Click “Load 3D Model” or drag and drop a file

2. **Select faces**  
   Click triangles or use “Select Visible Flat Faces”

3. **Create end face**  
   Click “Create End Face” in the Extrude panel

4. **Adjust parameters**  
   Set length, position, rotation, and scale

5. **Preview**  
   Enable “Show Live Preview” to inspect the result

6. **Generate**  
   Click “Generate Extrusion”

7. **Save**  
   Export the result as an STL file

### Tips
- Rotate the camera to look straight at a flat surface before using auto-select
- Use segment splits for smoother transitions where the pipe meets the model
- Enable wireframe mode to see individual triangles during selection
- Use flat shading to inspect raw geometry

---

## Security & Privacy

All processing happens locally in your browser.  
No files are uploaded to a server.

---

## Installation

### Development

```bash
git clone https://github.com/greaneagle/stlextrudelabapp.git
cd WebVersion
npm install
npm run dev
```

Runs at `http://localhost:5173`

### Production Build

```bash
npm run build
```

Build output is written to the `dist/` directory.
The app can be deployed to any static host (GitHub Pages, Netlify, Vercel, etc.).

---

## Technical Details

### Extrusion Algorithm

1. **Boundary extraction**
   Identifies edges belonging to only one selected face

2. **Loop ordering**
   Orders edges into connected loops, supporting multiple loops (outer + holes)

3. **Winding normalization**
   Ensures consistent vertex ordering (CCW for outer loops, CW for holes)

4. **Ring generation**
   Creates rings along the extrusion path, interpolating transforms between control points

5. **Mesh construction**
   Connects rings with triangles while maintaining correct face winding

6. **Integration**
   Removes selected faces, merges extrusion geometry, and welds vertices at seams

### Mesh Simplification

Uses the Quadric Error Metrics algorithm by Garland & Heckbert (1997):

- Computes error quadrics from incident face planes
- Iteratively collapses lowest-cost edges
- Updates affected quadrics after each collapse
- Stops when the target face count is reached

### Dependencies

- **Three.js** v0.157.0 — WebGL rendering
- **Vite** v5.4.21 — Build tooling
- **Terser** — JavaScript minification

Requires WebGL 2.0 and ES2020 support.

---

## Known Limitations

- Complex selections with many holes may produce unexpected results
- Boolean CSG operations are experimental (disabled by default)
- Undo / redo is not yet implemented

---

## Development Notes

This project was built as a solo side project with heavy AI-assisted coding.
The focus is on functionality, stability, and practical mesh workflows rather than architectural perfection.

---

## License

This project is licensed under the **Mozilla Public License 2.0 (MPL-2.0)**.

See LICENSE for the full license text.
https://github.com/greaneagle/stlextrudelabapp/blob/main/LICENSE

---

## Community

**Discord:** [https://discord.gg/EkTwScpc](https://discord.gg/EkTwScpc)
Get help, discuss workflows, and share feedback.

---

## Version

**Current version: 0.9.0 (Beta)**

This tool is maintained as a focused side project.
Bugs may exist — please report issues or suggestions via Discord
