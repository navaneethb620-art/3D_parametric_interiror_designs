# Parametric 3D Interior Space Planner with Immersive VR & AI Texture Synthesis

A browser-based interior design application for creating and exploring a customizable 3D living space. Users can configure room dimensions and architectural elements, view furniture in the scene, and explore the room using a first-person walkthrough. The project also includes a backend for AI-assisted texture generation and an optional ceiling-blueprint analysis endpoint.

Developed as part of the **Code Unnati** program by **SAP** and **Edunet Foundation**.

## Project Status

The current application demonstrates a working 3D room scene, architectural customization controls, first-person Walk Mode, and a ceiling-analysis result panel. The backend includes a texture-generation endpoint and an optional ceiling-image analysis endpoint. Availability of AI providers and WebXR depends on configuration, connectivity, browser support, and compatible hardware; these features should be tested in the target environment before being described as fully operational.

## Features

### 3D room and furniture

- **Parametric room dimensions:** Configure room length, width, and height to build the room from geometry rather than loading a fixed room model.
- **Procedural room geometry:** Create a floor, four walls, and a ceiling.
- **3D furniture models:** Load `.gltf` and `.glb` assets and normalize their scale for use in the scene.
- **Furniture placement:** Arrange furniture in the room using mouse interaction, with placement constrained by room boundaries where implemented.
- **Furniture rotation:** Rotate the selected item using the `R` key.
- **Arrange and Walk modes:** Use a camera-based arrangement view or first-person navigation with `W`, `A`, `S`, `D` and mouse look.

### Architectural customization

The interface includes controls for ceiling architecture and lighting, and for enabling and configuring architectural windows and doors. Available options include window style, wall location, size scale, door style, and door position. The exact options depend on the controls available in the current frontend.

### AI-assisted ceiling analysis

The backend exposes `POST /analyze-ceiling-blueprint` for an uploaded image. When a Gemini API key is configured, the endpoint attempts to use Gemini vision to return a structured ceiling-design description. If no key is supplied or the model request fails, the endpoint falls back to a computer-vision routine that estimates ceiling characteristics from image colors. The fallback is heuristic and should not be treated as a precise architectural measurement or a substitute for professional assessment.

### Texture generation

The backend exposes `POST /generate-texture`. It accepts a prompt and surface type, and returns the generated image as a base64 data URL for the frontend to use.

- `USE_MOCK=True` (the current default) returns a generated placeholder texture for development and testing.
- `USE_MOCK=False` attempts to request an image from the Pollinations image endpoint. If the request fails, the backend falls back to a mock texture.
- The published texture-generation code does **not** currently call Replicate, despite an unused `replicate` import. Do not configure or describe Replicate as the active provider unless the implementation is changed and tested.

## How It Works

### Procedural room generation

The room is built from the configured dimensions using Three.js geometry. The scene includes a floor, four walls, and a ceiling, with the furniture and architectural elements rendered in the same 3D environment.

### Furniture model handling

The frontend loads GLTF/GLB models. Model bounds can be measured with `Box3.setFromObject()` and used to normalize model scale. The loaded models are then positioned in the room.

### Furniture interaction

Three.js raycasting can be used to translate pointer interaction into a 3D position. In the current interaction design, furniture movement is constrained to the floor plane and room boundaries. The `R` key rotates the selected furniture item.

### Texture-generation flow

1. The user supplies a texture prompt and selects a surface type.
2. The frontend sends the request to the FastAPI `/generate-texture` endpoint.
3. The backend either returns a development placeholder (`USE_MOCK=True`) or attempts to fetch an image from Pollinations (`USE_MOCK=False`).
4. The returned image is encoded as a data URL for the frontend.
5. The frontend can apply the image to a Three.js material. Confirm the complete generation-and-application flow in the running version before presenting it as fully working.

### Ceiling-analysis flow

1. The client uploads an image to `/analyze-ceiling-blueprint`.
2. The backend uses a supplied `gemini_api_key` form field or the `GEMINI_API_KEY` environment variable, if available.
3. If the Gemini request succeeds, the endpoint returns the model's structured result. Otherwise, it attempts the computer-vision fallback.
4. The response identifies the analysis source and includes the resulting blueprint data.

## Technology Stack

| Area | Technology |
|---|---|
| 3D rendering | Three.js, WebGL |
| 3D asset loading | `GLTFLoader`, `.gltf` / `.glb` models |
| Arrange camera | `OrbitControls` |
| First-person navigation | `PointerLockControls` |
| 3D interaction | Three.js `Raycaster` and geometry/planes |
| Backend API | Python, FastAPI |
| Image processing | Pillow; NumPy for the computer-vision fallback |
| Texture image source | Pollinations endpoint when `USE_MOCK=False` |
| Optional image understanding | Gemini API when configured |
| Optional VR | WebXR API / `VRButton`, where supported |

## Getting Started

### Prerequisites

- A modern browser with WebGL support.
- Python installed for the backend (Python 3.9 or later is a reasonable baseline; use the version supported by the dependencies in `backend/requirements.txt`).
- Internet access for external image-generation or Gemini requests.
- A compatible WebXR browser and headset for VR testing. VR is optional.

### 1. Start the frontend

Serve the frontend through a local web server rather than opening `index.html` directly, because the application uses JavaScript modules.

```bash
cd frontend
python -m http.server 5500
```

Open `http://localhost:5500` in your browser. If your frontend is configured to use a different port, use that port instead.

### 2. Start the backend

Open a second terminal:

```bash
cd backend
python -m venv .venv
```

Activate the environment:

**Windows PowerShell**

```powershell
.venv\Scripts\Activate.ps1
```

**macOS / Linux**

```bash
source .venv/bin/activate
```

Install dependencies and start FastAPI:

```bash
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API documentation should be available at `http://127.0.0.1:8000/docs` while the backend is running.

If port `8000` is already occupied, stop the process using it or start the backend on another port and update the frontend API URL to match.

### 3. Configure optional AI services

The backend reads a `.env` file in the `backend` directory when present. Create `backend/.env` with the settings you need:

```dotenv
USE_MOCK=True
GEMINI_API_KEY=
```

- Keep `USE_MOCK=True` for predictable local testing of the texture endpoint.
- Set `USE_MOCK=False` to attempt the Pollinations-based image request.
- Add your Gemini API key to `GEMINI_API_KEY` only if you want the optional Gemini ceiling-analysis path.
- **Never commit `backend/.env` or API keys to GitHub.** Ensure `.env` is listed in `.gitignore`.

The ceiling-analysis code currently requests the model identifier `gemini-3.8-flash`. Verify that this identifier is available to your Gemini API account and update it if necessary. The analysis endpoint may use the computer-vision fallback if the API key is missing, the model is unavailable, or the request fails.

## Controls

| Action | Input |
|---|---|
| Rotate selected furniture | `R` |
| Move furniture in Arrange mode | Click and drag, where supported |
| Orbit / pan / zoom in Arrange mode | Mouse controls and scroll, depending on the active control |
| Walk in Walk mode | `W`, `A`, `S`, `D` and mouse look |
| Release pointer lock | `Esc` |
| Enter VR | The VR button, only in a compatible WebXR environment |

## VR and Browser Compatibility

WebXR requires a supported browser/device combination and a secure context. `localhost` is generally suitable for local development; a deployed site normally needs HTTPS. The current screenshots show **“VR NOT SUPPORTED”**, so VR should be described as an intended/optional capability until it has been successfully tested on a compatible headset and browser. First-person Walk Mode is separate from VR and can work without a headset.

## Limitations and Notes

- The room model is based on a rectangular layout; irregular room outlines are not established as supported.
- Furniture-to-furniture collision handling is not established as complete.
- First-person navigation should not be described as collision-safe unless wall and furniture collision behavior has been tested.
- The computer-vision ceiling fallback uses image heuristics and may produce approximate or incorrect classifications.
- Texture output depends on the external image endpoint when mock mode is disabled and falls back to a placeholder if generation fails.
- The current published backend uses permissive CORS settings and the texture request code disables TLS certificate verification. These are development concerns that should be corrected before production deployment.
- Verify the actual frontend-to-backend URL and confirm that generated images are applied to the selected surfaces before claiming end-to-end AI texture synthesis is complete.

## Future Improvements

- Verify and improve seamless/tileable texture generation for interior materials.
- Add furniture-to-furniture and room-boundary collision handling where needed.
- Improve ceiling-image analysis and validate the Gemini model configuration.
- Test and document the VR experience on supported hardware.
- Consider multi-room layouts and export formats after the current workflows are stable.

## Team

| Module | Member | Files Owned | Key Responsibilities |
|---|---|---|---|
| **Module 1 — 3D Room & Furniture** | **Navaneeth B** | `room.js` | Add the TV, sofa, doors, and windows in Three.js. |
| **Module 2 — AI Texture Backend** | **Nandan Kumar J V** | `generation.py`, `main.py` | Fix the free image-generation API integration and add seamless texture tiling. |
| **Module 3 — VR & Camera** | **Mohan K** | `main.js` | VR controller support, camera modes, lighting, and screenshots. |
| **Module 4 — UI & Save/Load** | **Bhanushree CV** | `index.html`, `style.css` | Redesign the UI panel, save/load rooms as JSON, and export as `.glb`. |

### Integration Dependencies

- **Module 1** must finalize and document its public API — `generate()`, `applyTexture()`, and `applyColor()` — before Modules 3 and 4 integrate with it.
- **Module 2's** `POST /generate-texture` endpoint is another key integration contract used by the team.


## Acknowledgements

Developed under the **Code Unnati** program by **SAP** and **Edunet Foundation**.