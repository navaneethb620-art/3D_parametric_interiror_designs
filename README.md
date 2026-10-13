# Parametric 3D Interior Space Planner with Immersive VR & AI Texture Synthesis

A web-based, real-time 3D interior design platform. Enter a room's dimensions, furnish it with 3D models, drag and rotate furniture on the floor plan, and then walk through the finished space in first-person or in a VR headset.

> **Project status:** Phase 1 (3D room + furniture + VR) is complete. Phase 2 (Generative AI texture synthesis) is in progress.

Built as part of the **Code Unnati** program (SAP + Edunet Foundation).

---

## Features

### Phase 1: 3D Engine and Furniture (Complete)

- **Parametric room generation:** set Length, Width, and Height and the room is rebuilt instantly in code (floor, four walls, ceiling). No static room file is loaded.
- **Space constraint engine:** compares the room's floor area against the combined footprint of all furniture and warns the user if furniture exceeds 95% of the floor space.
- **3D furniture loading:** imports `.gltf` / `.glb` models and normalizes them to real-world dimensions, so models of any original scale fit correctly.
- **Drag and drop:** move furniture across the floor with the mouse, with boundary clamping so nothing can be dragged through a wall.
- **Rotation:** press `R` to rotate the selected item by 45 degrees. A highlight box shows which item is active.
- **Grouped furniture:** composite items (for example a TV unit with its TV and console) move together as one object.
- **Two interaction modes:**
  - *Arrange mode:* elevated isometric camera with orbit, pan, and zoom, ceiling hidden.
  - *Walk mode:* first-person eye-level view with `W A S D` movement and mouse look, ceiling enclosed.
- **WebXR VR support:** one-click VR mode for compatible headsets (e.g. Meta Quest) via the browser.

### Phase 2: Generative AI Texture Synthesis (In Progress)

- Prompt-to-texture generation for walls, floors, and ceilings (for example "dark oak herringbone wood").
- A FastAPI backend that sanitizes prompts so the model produces a flat, tileable material rather than a picture of a room.
- Generated textures are returned to the browser and applied to surfaces as tiling PBR materials.
- Solid color fallback when the AI backend is unavailable.

---

## How It Works

### Parametric room
The room is generated procedurally from `L x W x H`:
- Floor: `PlaneGeometry`, rotated flat onto the ground plane.
- Walls: four planes (N, S, E, W), positioned and rotated so their normals face inward.
- Ceiling: a thin box placed on top of the walls.

### Model normalization
Downloaded 3D models come in arbitrary scales. Each model's bounding box is measured with `Box3.setFromObject()`, then scaled by `target size / actual size` on each axis so it matches real-world dimensions. Loaded geometry is cached and reused with `.clone()` to avoid redundant loading and memory growth.

### Drag and drop
A `Raycaster` projects the mouse cursor into 3D space and intersects it with an invisible horizontal floor plane. The intersection point updates the furniture's `(x, z)` position while its height stays fixed. Positions are clamped to the room boundaries.

### Texture pipeline (Phase 2)
1. The user enters a prompt and picks a surface (walls, floor, or ceiling).
2. The frontend sends a request to the FastAPI `/generate-texture` endpoint.
3. The backend cleans the prompt and calls an image generation model.
4. The returned image is applied in Three.js with `RepeatWrapping` on a `MeshStandardMaterial`.

---

## Tech Stack

| Layer | Technology |
|---|---|
| 3D rendering | Three.js (r160), WebGL |
| VR | WebXR API (`VRButton`) |
| Model loading | `GLTFLoader` |
| Cameras | `OrbitControls` (arrange), `PointerLockControls` (walk) |
| Interaction math | Three.js `Raycaster` and `Plane` |
| Backend | FastAPI (Python) |
| Image handling | Pillow |
| Generative AI (Phase 2) | Stable Diffusion / Flux via a hosted API |

---

## Getting Started

### Prerequisites
- A modern browser with WebGL support (Chrome, Edge, Firefox)
- Python 3.9+ (only needed for the Phase 2 backend)
- A WebXR-capable headset, optional, for VR mode

### Run the frontend
Because the frontend uses ES modules, serve it from a local web server rather than opening `index.html` directly:

```bash
cd frontend
python -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

### Run the backend (Phase 2)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

If your texture provider needs an API key, set it as an environment variable and never commit it to the repository:

```bash
export REPLICATE_API_TOKEN=your_token_here
```

> Update the folder names and commands above to match your repository layout.

---

## Controls

| Action | Input |
|---|---|
| Rotate selected furniture | `R` |
| Move furniture (Arrange mode) | Click and drag |
| Orbit / pan / zoom (Arrange mode) | Mouse drag / right-click drag / scroll |
| Walk (Walk mode) | `W` `A` `S` `D` and mouse look |
| Enter VR | "Enter VR" button, in a WebXR-capable browser |

---

## Notes on VR

WebXR only works in a secure context. It runs on `localhost` during development, but any deployed version must be served over **HTTPS** or the "Enter VR" button will not activate.

---

## Limitations

- Rooms are rectangular boxes, so irregular or angled layouts are not supported.
- VR is look-around from a standing position, not a fully navigable experience with collision detection.
- Furniture-to-furniture collision is not yet implemented.
- Generated textures depend on the quality and tileability of the underlying image model.

---

## Roadmap

- Multi-room floor plans with parametric doorways
- Furniture collision detection
- Export of layouts to `.obj`, `.gltf`, or `.dwg`
- Seamless-texture generation tuned specifically for interior materials

---

## Team

- **Navaneeth B:** Phase 1, 3D engine, furniture system, VR
- **[Teammate name]:** Phase 2, AI texture generation and design pipeline

---

## Acknowledgements

Built under the **Code Unnati** program by **SAP** and **Edunet Foundation**.

3D models used in this project are subject to their original creators' licenses. Add attribution here for each asset you use.

---

## License

Add your preferred license here (for example MIT), or remove this section if the repository is for coursework only.
