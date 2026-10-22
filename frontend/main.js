import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { RoomGenerator } from './room.js?v=36';
import { RoomColorExtractor } from './colorExtractor.js?v=36';

let camera, scene, renderer, controls, orbitControls, roomGen;
let currentMode = 'arrange'; // 'arrange' (Drag & Drop) or 'walk' (WASD)

// Style & Material state
let currentStyleMode = 'photo'; // 'photo', 'ai', or 'color'
let uploadedImageDataUrl = null;
let uploadedImageElement = null;
let currentPalette = null;
let currentCeilingBlueprint = null;
const colorExtractor = new RoomColorExtractor();

// Drag and drop state
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const planeIntersect = new THREE.Vector3();
const dragOffset = new THREE.Vector3();

let selectedObject = null;
let isDragging = false;
let selectionBoxHelper = null;

// Movement state
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();

try {
    init();
} catch (e) {
    console.error("CRITICAL INIT ERROR:", e);
    window.__initError = e.toString() + "\n" + (e.stack || '');
}

function init() {
    const container = document.getElementById('canvas-container');

    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Sky blue background

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // Camera (Player)
    camera = new THREE.PerspectiveCamera(70, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 1.7, 3.6); 

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.xr.enabled = true; // Enable WebXR
    container.appendChild(renderer.domElement);

    // Add VR Button to UI
    document.getElementById('ui-container').appendChild(VRButton.createButton(renderer));

    // OrbitControls for Arrange / Design Mode
    orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.05;
    orbitControls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't dip below floor
    orbitControls.minDistance = 0.5;
    orbitControls.maxDistance = 20;
    orbitControls.target.set(0, 1.8, 0);
    orbitControls.update();

    // FPS Controls (GTA style)
    controls = new PointerLockControls(camera, renderer.domElement);
    
    // Click on canvas to lock mouse when in Walk mode
    const requestWalkLock = () => {
        if (currentMode === 'walk' && controls && !controls.isLocked) {
            try {
                controls.lock();
            } catch (err) {
                console.log("Pointer lock defer:", err);
            }
        }
    };
    container.addEventListener('click', requestWalkLock);
    renderer.domElement.addEventListener('click', requestWalkLock);

    controls.addEventListener('lock', () => {
        const hud = document.getElementById('mode-hud');
        if (hud) hud.innerHTML = '🚶 <b>Walk Mode (FPS Mouse Locked):</b> Move mouse to look around | <b>[W][A][S][D]</b> to walk | Press <b>[ESC]</b> to show cursor.';
        document.getElementById('status-msg').innerText = "Walk Mode active! Move mouse to look, W,A,S,D to walk. ESC to unlock cursor.";
    });
    
    controls.addEventListener('unlock', () => {
        if (currentMode === 'walk') {
            const hud = document.getElementById('mode-hud');
            if (hud) hud.innerHTML = '🚶 <b>Walk Mode:</b> <b>[W][A][S][D]</b> to walk | Drag canvas to look | Click 3D view to lock mouse.';
            document.getElementById('status-msg').innerText = "Walk Mode active (Cursor free). Press W,A,S,D to walk, or click 3D view to lock mouse.";
        }
    });

    // Support drag-to-look when in Walk mode without pointer lock
    let isWalkDragging = false;
    let walkLastX = 0;
    let walkLastY = 0;
    const walkEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    renderer.domElement.addEventListener('pointerdown', (e) => {
        if (currentMode === 'walk' && !controls.isLocked) {
            isWalkDragging = true;
            walkLastX = e.clientX;
            walkLastY = e.clientY;
        }
    });

    window.addEventListener('pointermove', (e) => {
        if (currentMode === 'walk' && isWalkDragging && !controls.isLocked) {
            const dx = e.clientX - walkLastX;
            const dy = e.clientY - walkLastY;
            walkLastX = e.clientX;
            walkLastY = e.clientY;

            walkEuler.setFromQuaternion(camera.quaternion);
            walkEuler.y -= dx * 0.003;
            walkEuler.x -= dy * 0.003;
            walkEuler.x = Math.max(-Math.PI / 2 + 0.08, Math.min(Math.PI / 2 - 0.08, walkEuler.x));
            camera.quaternion.setFromEuler(walkEuler);
        }
    });

    window.addEventListener('pointerup', () => {
        isWalkDragging = false;
    });

    scene.add(controls.getObject());

    // Keyboard listeners for walking
    const onKeyDown = function ( event ) {
        switch ( event.code ) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = true;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = true;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = true;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = true;
                break;
        }
    };

    const onKeyUp = function ( event ) {
        switch ( event.code ) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = false;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = false;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = false;
                break;
        }
    };

    document.addEventListener( 'keydown', onKeyDown );
    document.addEventListener( 'keyup', onKeyUp );

    // Room
    roomGen = new RoomGenerator(scene);

    // Resize handler
    window.addEventListener('resize', onWindowResize);
    
    // UI Event Listeners
    document.getElementById('update-room-btn').addEventListener('click', updateRoomGeometry);
    document.getElementById('generate-btn').addEventListener('click', handleGenerateTexture);

    const showCeilingCb = document.getElementById('show-ceiling-checkbox');
    if (showCeilingCb) {
        showCeilingCb.addEventListener('change', (e) => {
            if (roomGen) {
                roomGen.setCeilingVisible(e.target.checked || currentMode === 'walk');
            }
        });
    }

    const ceilingStyleEl = document.getElementById('ceiling-style');
    if (ceilingStyleEl) {
        ceilingStyleEl.addEventListener('change', () => {
            updateRoomGeometry();
        });
    }

    // Door & Window Controls
    const winCb = document.getElementById('enable-window-checkbox');
    const winOptsContainer = document.getElementById('window-options-container');
    if (winCb) {
        winCb.addEventListener('change', (e) => {
            if (winOptsContainer) winOptsContainer.style.display = e.target.checked ? 'block' : 'none';
            updateRoomGeometry();
        });
    }
    ['window-style', 'window-wall', 'window-scale'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateRoomGeometry);
    });

    const doorCb = document.getElementById('enable-door-checkbox');
    const doorOptsContainer = document.getElementById('door-options-container');
    if (doorCb) {
        doorCb.addEventListener('change', (e) => {
            if (doorOptsContainer) doorOptsContainer.style.display = e.target.checked ? 'block' : 'none';
            updateRoomGeometry();
        });
    }
    ['door-style', 'door-wall', 'door-position'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateRoomGeometry);
    });

    // TV Wall Decor Controls
    ['tv-decor-style', 'tv-wood-finish', 'tv-console-type'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateRoomGeometry);
    });
    
    // Style preset handler
    const stylePreset = document.getElementById('style-preset');
    const stylePrompt = document.getElementById('style-prompt');
    stylePreset.addEventListener('change', (e) => {
        if (e.target.value !== 'custom') {
            stylePrompt.value = e.target.value;
        } else {
            stylePrompt.value = '';
            stylePrompt.focus();
        }
    });

    // Style Mode Tabs & Handlers
    const tabPhotoBtn = document.getElementById('tab-photo-btn');
    const tabAiBtn = document.getElementById('tab-ai-btn');
    const tabColorBtn = document.getElementById('tab-color-btn');

    const photoSec = document.getElementById('photo-style-section');
    const aiSec = document.getElementById('ai-style-section');
    const solidSec = document.getElementById('solid-color-section');

    function setStyleMode(mode) {
        currentStyleMode = mode;
        const activeBg = '#28a745';
        const activeColor = '#ffffff';
        const inactiveBg = '#495057';
        const inactiveColor = '#adb5bd';

        if (tabPhotoBtn) {
            tabPhotoBtn.style.background = mode === 'photo' ? activeBg : inactiveBg;
            tabPhotoBtn.style.color = mode === 'photo' ? activeColor : inactiveColor;
        }
        if (tabAiBtn) {
            tabAiBtn.style.background = mode === 'ai' ? activeBg : inactiveBg;
            tabAiBtn.style.color = mode === 'ai' ? activeColor : inactiveColor;
        }
        if (tabColorBtn) {
            tabColorBtn.style.background = mode === 'color' ? activeBg : inactiveBg;
            tabColorBtn.style.color = mode === 'color' ? activeColor : inactiveColor;
        }

        if (photoSec) photoSec.style.display = mode === 'photo' ? 'block' : 'none';
        if (aiSec) aiSec.style.display = mode === 'ai' ? 'block' : 'none';
        if (solidSec) solidSec.style.display = mode === 'color' ? 'block' : 'none';
    }

    if (tabPhotoBtn) tabPhotoBtn.addEventListener('click', () => setStyleMode('photo'));
    if (tabAiBtn) tabAiBtn.addEventListener('click', () => setStyleMode('ai'));
    if (tabColorBtn) tabColorBtn.addEventListener('click', () => setStyleMode('color'));

    // Reference Image (Room Photo) & Wall Palette Extraction handlers
    const refImageInput = document.getElementById('ref-image');
    const photoPreviewContainer = document.getElementById('photo-preview-container');
    const photoCanvas = document.getElementById('photo-preview-canvas');
    const photoFilename = document.getElementById('photo-filename');
    const clearPhotoBtn = document.getElementById('clear-photo-btn');
    const paletteCardsContainer = document.getElementById('palette-cards-container');
    const applyAllPaletteBtn = document.getElementById('apply-all-palette-btn');

    const apiKeyInput = document.getElementById('gemini-api-key-input');
    if (apiKeyInput) {
        const savedKey = localStorage.getItem('gemini_api_key');
        if (savedKey) apiKeyInput.value = savedKey;
        apiKeyInput.addEventListener('input', () => {
            localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
        });
    }

    const pickerLeft = document.getElementById('picker-left');
    const pickerRight = document.getElementById('picker-right');
    const pickerNorth = document.getElementById('picker-north');
    const pickerSouth = document.getElementById('picker-south');
    const pickerCeiling = document.getElementById('picker-ceiling');
    const pickerFloor = document.getElementById('picker-floor');

    const hexLeft = document.getElementById('hex-left');
    const hexRight = document.getElementById('hex-right');
    const hexNorth = document.getElementById('hex-north');
    const hexSouth = document.getElementById('hex-south');
    const hexCeiling = document.getElementById('hex-ceiling');
    const hexFloor = document.getElementById('hex-floor');

    const cleanPhotoCanvas = document.createElement('canvas');
    const cleanPhotoCtx = cleanPhotoCanvas.getContext('2d', { willReadFrequently: true });

    const PHOTO_PINS = [
        { id: '1', key: 'left', name: 'Wall 1 (Left)', defaultPos: { x: 0.14, y: 0.45 }, pickerId: 'picker-left', hexId: 'hex-left' },
        { id: '2', key: 'right', name: 'Wall 2 (Right)', defaultPos: { x: 0.86, y: 0.45 }, pickerId: 'picker-right', hexId: 'hex-right' },
        { id: '3', key: 'north', name: 'Wall 3 (North)', defaultPos: { x: 0.50, y: 0.35 }, pickerId: 'picker-north', hexId: 'hex-north' },
        { id: '4', key: 'south', name: 'Wall 4 (South)', defaultPos: { x: 0.50, y: 0.65 }, pickerId: 'picker-south', hexId: 'hex-south' },
        { id: '5', key: 'ceiling', name: 'Ceiling', defaultPos: { x: 0.50, y: 0.12 }, pickerId: 'picker-ceiling', hexId: 'hex-ceiling' },
        { id: '6', key: 'floor', name: 'Floor', defaultPos: { x: 0.50, y: 0.88 }, pickerId: 'picker-floor', hexId: 'hex-floor' }
    ];

    let activeDraggedPin = null;
    let hoveredPin = null;

    function sampleColorFromCleanPhoto(normX, normY) {
        if (!cleanPhotoCanvas || !cleanPhotoCtx || cleanPhotoCanvas.width === 0) return '#cccccc';
        const px = Math.max(0, Math.min(cleanPhotoCanvas.width - 1, Math.round(normX * cleanPhotoCanvas.width)));
        const py = Math.max(0, Math.min(cleanPhotoCanvas.height - 1, Math.round(normY * cleanPhotoCanvas.height)));
        const pSize = 5;
        const startX = Math.max(0, px - 2);
        const startY = Math.max(0, py - 2);
        const w = Math.min(cleanPhotoCanvas.width - startX, pSize);
        const h = Math.min(cleanPhotoCanvas.height - startY, pSize);
        if (w <= 0 || h <= 0) return '#cccccc';
        const imgData = cleanPhotoCtx.getImageData(startX, startY, w, h).data;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let i = 0; i < imgData.length; i += 4) {
            rSum += imgData[i];
            gSum += imgData[i + 1];
            bSum += imgData[i + 2];
            count++;
        }
        if (count === 0) return '#cccccc';
        const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
        return '#' + toHex(rSum / count) + toHex(gSum / count) + toHex(bSum / count);
    }

    function syncPaletteToUI(pinConfig, hex) {
        if (!currentPalette) currentPalette = {};
        if (!currentPalette[pinConfig.key]) currentPalette[pinConfig.key] = {};
        currentPalette[pinConfig.key].hex = hex;

        const pEl = document.getElementById(pinConfig.pickerId);
        const hEl = document.getElementById(pinConfig.hexId);
        if (pEl) pEl.value = hex;
        if (hEl) hEl.innerText = hex;

        roomGen.applyColor(hex, pinConfig.key);
    }

    function getPinAt(canvasX, canvasY) {
        if (!currentPalette || !photoCanvas) return null;
        for (let i = PHOTO_PINS.length - 1; i >= 0; i--) {
            const p = PHOTO_PINS[i];
            const pinPos = currentPalette[p.key]?.pin || p.defaultPos;
            const px = pinPos.x * photoCanvas.width;
            const py = pinPos.y * photoCanvas.height;
            const dist = Math.hypot(canvasX - px, canvasY - py);
            if (dist <= 18) {
                return p;
            }
        }
        return null;
    }

    function drawPhotoWithPins(img, palette) {
        if (!photoCanvas || !img) return;
        const ctx = photoCanvas.getContext('2d');
        const aspect = (img.naturalHeight || img.height || 300) / (img.naturalWidth || img.width || 400);
        
        if (photoCanvas.width !== 400 || photoCanvas.height !== Math.round(400 * aspect)) {
            photoCanvas.width = 400;
            photoCanvas.height = Math.round(400 * aspect);
        }

        // Keep clean canvas in sync with full image
        if (cleanPhotoCanvas.width !== photoCanvas.width || cleanPhotoCanvas.height !== photoCanvas.height) {
            cleanPhotoCanvas.width = photoCanvas.width;
            cleanPhotoCanvas.height = photoCanvas.height;
            cleanPhotoCtx.drawImage(img, 0, 0, cleanPhotoCanvas.width, cleanPhotoCanvas.height);
        }

        // Draw clean image onto preview canvas
        ctx.drawImage(cleanPhotoCanvas, 0, 0, photoCanvas.width, photoCanvas.height);

        if (!palette) return;

        // Visual draggable badges on the photo (Pins 1, 2, 3, 4, 5, 6)
        PHOTO_PINS.forEach((p) => {
            const pinPos = palette[p.key]?.pin || p.defaultPos;
            const hex = palette[p.key]?.hex || '#ffffff';
            const x = pinPos.x * photoCanvas.width;
            const y = pinPos.y * photoCanvas.height;

            const isDragged = (activeDraggedPin && activeDraggedPin.key === p.key);
            const isHovered = (hoveredPin && hoveredPin.key === p.key);

            ctx.save();

            // Glow / Highlight ring if dragged or hovered
            if (isDragged || isHovered) {
                ctx.beginPath();
                ctx.arc(x, y, 19, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 255, 136, 0.35)';
                ctx.fill();
                ctx.lineWidth = 2.5;
                ctx.strokeStyle = '#00ff88';
                ctx.stroke();
            }

            // Drop shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;

            // Pin body
            const radius = (isDragged || isHovered) ? 15 : 13;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = hex || '#ffffff';
            ctx.fill();

            // Outer crisp border
            ctx.shadowColor = 'transparent';
            ctx.lineWidth = (isDragged || isHovered) ? 3 : 2;
            ctx.strokeStyle = (isDragged || isHovered) ? '#00ff88' : '#ffffff';
            ctx.stroke();

            // Outer dark ring
            ctx.beginPath();
            ctx.arc(x, y, radius + (isDragged ? 1.5 : 1), 0, Math.PI * 2);
            ctx.lineWidth = 1;
            ctx.strokeStyle = '#000000';
            ctx.stroke();

            // Pin Number badge text (1, 2, 3, 4, 5, 6)
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = '#000000';
            ctx.strokeText(p.id, x, y);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(p.id, x, y);

            ctx.restore();
        });
    }

    if (refImageInput) {
        refImageInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            // Reset previous blueprints and detections immediately
            currentCeilingBlueprint = null;
            const badge = document.getElementById('detected-ceiling-badge');
            if (badge) badge.style.display = 'none';

            document.getElementById('status-msg').innerText = "Analyzing room photo, removing foreground furniture, and extracting wall colors...";
            const reader = new FileReader();
            reader.onload = async (event) => {
                uploadedImageDataUrl = event.target.result;
                const img = new Image();
                img.onload = async () => {
                    uploadedImageElement = img;
                    if (photoFilename) photoFilename.innerText = file.name;
                    if (photoPreviewContainer) photoPreviewContainer.style.display = 'block';

                    try {
                        currentPalette = await colorExtractor.extractPalette(img);

                        // Populate UI swatches and hex labels
                        if (pickerLeft && currentPalette.left) { pickerLeft.value = currentPalette.left.hex; hexLeft.innerText = currentPalette.left.hex; }
                        if (pickerRight && currentPalette.right) { pickerRight.value = currentPalette.right.hex; hexRight.innerText = currentPalette.right.hex; }
                        if (pickerNorth && currentPalette.north) { pickerNorth.value = currentPalette.north.hex; hexNorth.innerText = currentPalette.north.hex; }
                        if (pickerSouth && currentPalette.south) { pickerSouth.value = currentPalette.south.hex; hexSouth.innerText = currentPalette.south.hex; }
                        if (pickerCeiling && currentPalette.ceiling) { pickerCeiling.value = currentPalette.ceiling.hex; hexCeiling.innerText = currentPalette.ceiling.hex; }
                        if (pickerFloor && currentPalette.floor) { pickerFloor.value = currentPalette.floor.hex; hexFloor.innerText = currentPalette.floor.hex; }

                        if (paletteCardsContainer) paletteCardsContainer.style.display = 'block';

                        // Draw image with sampling badges
                        drawPhotoWithPins(img, currentPalette);

                        // Automatically paint 3D room with extracted palette
                        roomGen.applyRoomPalette(currentPalette);

                        // Query AI Vision Blueprint Engine for deep architectural ceiling decomposition
                        document.getElementById('status-msg').innerText = "Decomposing ceiling architecture via AI Vision Blueprint Engine...";
                        try {
                            const formData = new FormData();
                            formData.append('image', file);
                            const apiKeyInput = document.getElementById('gemini-api-key-input');
                            if (apiKeyInput && apiKeyInput.value.trim()) {
                                formData.append('gemini_api_key', apiKeyInput.value.trim());
                            }

                            const res = await fetch("http://" + window.location.hostname + ":8000/analyze-ceiling-blueprint", {
                                method: 'POST',
                                body: formData
                            });
                            if (res.ok) {
                                const data = await res.json();
                                if (data.blueprint) {
                                    currentCeilingBlueprint = data.blueprint;
                                    currentCeilingBlueprint.source = data.source || 'AI';
                                }
                            }
                        } catch (apiErr) {
                            console.log("AI Vision endpoint unavailable, utilizing in-browser CV blueprint:", apiErr);
                        }

                        // Configure 3D ceiling from AI Vision Blueprint (or fallback to colorExtractor ceilingFeatures)
                        const bp = currentCeilingBlueprint;
                        if (bp) {
                            if (bp.primaryShape === 'rectangular_tray' || bp.primaryShape === 'tray') {
                                bp.primaryShape = 'modern_tray';
                            }
                            const ceilingStyleEl = document.getElementById('ceiling-style');
                            if (ceilingStyleEl) ceilingStyleEl.value = bp.primaryShape;
                            const badgeEl = document.getElementById('detected-ceiling-badge');
                            if (badgeEl) {
                                const srcLabel = bp.source && bp.source.startsWith('gemini') ? '🤖 Google Gemini 3.8 Flash Vision' : '⚡ AI Computer Vision';
                                badgeEl.innerHTML = `✨ <b>${srcLabel}:</b> ${bp.description}`;
                                badgeEl.style.display = 'block';
                            }
                            if (pickerCeiling && bp.ceilingTrayPaintColor) {
                                pickerCeiling.value = bp.ceilingTrayPaintColor;
                                if (hexCeiling) hexCeiling.innerText = bp.ceilingTrayPaintColor;
                                if (currentPalette && currentPalette.ceiling) {
                                    currentPalette.ceiling.hex = bp.ceilingTrayPaintColor;
                                }
                            }
                            const showCeilingCb = document.getElementById('show-ceiling-checkbox');
                            if (showCeilingCb) showCeilingCb.checked = true;
                            updateRoomGeometry();
                            if (roomGen) roomGen.setCeilingVisible(true);
                            roomGen.applyRoomPalette(currentPalette);
                            document.getElementById('status-msg').innerText = `Constructed 3D architecture via ${bp.source || 'AI'}!`;
                        } else if (currentPalette.ceilingFeatures) {
                            const feat = currentPalette.ceilingFeatures;
                            const ceilingStyleEl = document.getElementById('ceiling-style');
                            if (ceilingStyleEl) {
                                ceilingStyleEl.value = feat.style;
                            }
                            const badgeEl = document.getElementById('detected-ceiling-badge');
                            if (badgeEl) {
                                badgeEl.innerText = `✨ Auto-Matched to Photo: ${feat.name}`;
                                badgeEl.style.display = 'block';
                            }
                            updateRoomGeometry();
                            roomGen.applyRoomPalette(currentPalette);
                            document.getElementById('status-msg').innerText = "Extracted Wall 1-4, Ceiling, Floor colors & matched 3D ceiling architecture to photo!";
                        }
                    } catch (err) {
                        console.error("Color extraction failed:", err);
                        document.getElementById('status-msg').innerText = "Failed to extract colors from image.";
                    }
                };
                img.src = uploadedImageDataUrl;
            };
            reader.readAsDataURL(file);
        });
    }

    // Interactive Moveable Sampling Pins (1, 2, 3, 4, 5, 6) & Eyedropper on Photo Canvas
    if (photoCanvas) {
        photoCanvas.addEventListener('pointerdown', (e) => {
            if (!uploadedImageElement || !currentPalette) return;
            const rect = photoCanvas.getBoundingClientRect();
            const canvasX = (e.clientX - rect.left) * (photoCanvas.width / rect.width);
            const canvasY = (e.clientY - rect.top) * (photoCanvas.height / rect.height);

            const hit = getPinAt(canvasX, canvasY);
            if (hit) {
                activeDraggedPin = hit;
                try { photoCanvas.setPointerCapture(e.pointerId); } catch(err) {}
                photoCanvas.style.cursor = 'grabbing';
                drawPhotoWithPins(uploadedImageElement, currentPalette);
            } else {
                // Clicked an area with no pin: move the currently selected surface pin there!
                const surfaceSelect = document.getElementById('surface-type');
                let targetKey = surfaceSelect ? surfaceSelect.value : 'all-walls';
                if (targetKey === 'all-walls') targetKey = 'north';
                const targetPin = PHOTO_PINS.find(p => p.key === targetKey) || PHOTO_PINS[2];

                const normX = Math.max(0.02, Math.min(0.98, canvasX / photoCanvas.width));
                const normY = Math.max(0.02, Math.min(0.98, canvasY / photoCanvas.height));

                if (!currentPalette[targetPin.key]) currentPalette[targetPin.key] = {};
                currentPalette[targetPin.key].pin = { x: normX, y: normY };

                const hex = sampleColorFromCleanPhoto(normX, normY);
                syncPaletteToUI(targetPin, hex);

                activeDraggedPin = targetPin;
                try { photoCanvas.setPointerCapture(e.pointerId); } catch(err) {}
                photoCanvas.style.cursor = 'grabbing';
                drawPhotoWithPins(uploadedImageElement, currentPalette);
                document.getElementById('status-msg').innerText = "Pin " + targetPin.id + " (" + targetPin.name + ") set to " + hex;
            }
        });

        photoCanvas.addEventListener('pointermove', (e) => {
            if (!uploadedImageElement || !currentPalette) return;
            const rect = photoCanvas.getBoundingClientRect();
            const canvasX = (e.clientX - rect.left) * (photoCanvas.width / rect.width);
            const canvasY = (e.clientY - rect.top) * (photoCanvas.height / rect.height);

            if (activeDraggedPin) {
                const normX = Math.max(0.02, Math.min(0.98, canvasX / photoCanvas.width));
                const normY = Math.max(0.02, Math.min(0.98, canvasY / photoCanvas.height));

                if (!currentPalette[activeDraggedPin.key]) currentPalette[activeDraggedPin.key] = {};
                currentPalette[activeDraggedPin.key].pin = { x: normX, y: normY };

                const hex = sampleColorFromCleanPhoto(normX, normY);
                syncPaletteToUI(activeDraggedPin, hex);

                drawPhotoWithPins(uploadedImageElement, currentPalette);
                document.getElementById('status-msg').innerText = "Sampling Pin " + activeDraggedPin.id + " (" + activeDraggedPin.name + "): " + hex;
            } else {
                const hit = getPinAt(canvasX, canvasY);
                if (hit !== hoveredPin) {
                    hoveredPin = hit;
                    photoCanvas.style.cursor = hit ? 'grab' : 'crosshair';
                    drawPhotoWithPins(uploadedImageElement, currentPalette);
                }
            }
        });

        const handlePointerEnd = (e) => {
            if (activeDraggedPin) {
                try { photoCanvas.releasePointerCapture(e.pointerId); } catch(err) {}
                const p = activeDraggedPin;
                activeDraggedPin = null;
                photoCanvas.style.cursor = hoveredPin ? 'grab' : 'crosshair';
                drawPhotoWithPins(uploadedImageElement, currentPalette);
                const hex = currentPalette[p.key]?.hex || '';
                document.getElementById('status-msg').innerText = "Pin " + p.id + " (" + p.name + ") placed: " + hex + " applied to 3D room!";
            }
        };

        photoCanvas.addEventListener('pointerup', handlePointerEnd);
        photoCanvas.addEventListener('pointercancel', handlePointerEnd);
    }

    // Individual swatch change listeners
    const bindPicker = (picker, hexLabel, surfaceId) => {
        if (!picker) return;
        picker.addEventListener('input', (e) => {
            const hex = e.target.value;
            if (hexLabel) hexLabel.innerText = hex;
            roomGen.applyColor(hex, surfaceId);
        });
    };
    bindPicker(pickerLeft, hexLeft, 'left');
    bindPicker(pickerRight, hexRight, 'right');
    bindPicker(pickerNorth, hexNorth, 'north');
    bindPicker(pickerSouth, hexSouth, 'south');
    bindPicker(pickerCeiling, hexCeiling, 'ceiling');
    bindPicker(pickerFloor, hexFloor, 'floor');

    if (applyAllPaletteBtn) {
        applyAllPaletteBtn.addEventListener('click', () => {
            const pal = {
                left: pickerLeft ? pickerLeft.value : '#eeeeee',
                right: pickerRight ? pickerRight.value : '#eeeeee',
                north: pickerNorth ? pickerNorth.value : '#eeeeee',
                south: pickerSouth ? pickerSouth.value : '#eeeeee',
                ceiling: pickerCeiling ? pickerCeiling.value : '#fff0e5',
                floor: pickerFloor ? pickerFloor.value : '#aaaaaa'
            };
            roomGen.applyRoomPalette(pal);
            document.getElementById('status-msg').innerText = "Re-applied palette to Wall 1, 2, 3, 4, Ceiling, and Floor!";
        });
    }

    if (clearPhotoBtn) {
        clearPhotoBtn.addEventListener('click', () => {
            if (refImageInput) refImageInput.value = '';
            uploadedImageDataUrl = null;
            uploadedImageElement = null;
            currentPalette = null;
            currentCeilingBlueprint = null;
            const badge = document.getElementById('detected-ceiling-badge');
            if (badge) badge.style.display = 'none';
            if (photoPreviewContainer) photoPreviewContainer.style.display = 'none';
            if (paletteCardsContainer) paletteCardsContainer.style.display = 'none';
            document.getElementById('status-msg').innerText = 'Room photo removed.';
        });
    }

    // Room Category logic
    const categorySelect = document.getElementById('room-category');
    const furnitureOptions = document.getElementById('furniture-options');
    
    const categoryFurniture = {
        'living': [
            { id: 'sofa', label: '3-Seater Sofa', area: 3.5, checked: true },
            { id: 'armchair', label: 'Accent Armchair', area: 1.5, checked: false },
            { id: 'coffee_table', label: 'Coffee Table', area: 1.5, checked: true },
            { id: 'side_table', label: 'End Table', area: 0.5, checked: false },
            { id: 'tv_unit', label: 'TV Entertainment Console', area: 2.0, checked: true },
            { id: 'bookshelf', label: 'Bookshelf', area: 1.0, checked: false },
            { id: 'shoe_rack', label: 'Shoe Rack', area: 0.8, checked: false },
            { id: 'wall_shelves', label: 'Wall Shelves', area: 0.0, checked: true },
            { id: 'tv', label: 'Flat Screen TV', area: 0.0, checked: true },
            { id: 'speakers', label: 'Sound System', area: 0.5, checked: false },
            { id: 'router', label: 'Wi-Fi Router', area: 0.0, checked: false },
            { id: 'ceiling_light', label: 'Ceiling Chandelier', area: 0.0, checked: false },
            { id: 'floor_lamp', label: 'Floor Lamp', area: 0.2, checked: false },
            { id: 'rug', label: 'Floor Rug', area: 0.0, checked: true },
            { id: 'wall_art', label: 'Wall Art', area: 0.0, checked: true },
            { id: 'clock', label: 'Antique Wall Clock', area: 0.0, checked: true },
            { id: 'plants', label: 'Indoor Plant', area: 0.5, checked: false },
            { id: 'cushions', label: 'Sofa Cushions', area: 0.0, checked: true }
        ],
        'bedroom': [
            { id: 'bed', label: 'King Size Bed', area: 4.0, checked: true },
            { id: 'wardrobe', label: 'Wardrobe', area: 2.5, checked: true },
            { id: 'nightstands', label: 'Nightstands (x2)', area: 1.0, checked: true },
            { id: 'ac', label: 'Wall AC', area: 0.5, checked: true },
            { id: 'ceiling_light', label: 'Ceiling Light', area: 0.0, checked: true }
        ],
        'kitchen': [
            { id: 'island', label: 'Kitchen Island', area: 3.5, checked: true },
            { id: 'counters', label: 'L-Shape Counters', area: 4.0, checked: true },
            { id: 'fridge', label: 'Refrigerator', area: 1.0, checked: true },
            { id: 'dining', label: 'Dining Table', area: 3.0, checked: false },
            { id: 'ceiling_light', label: 'Ceiling Light', area: 0.0, checked: true }
        ]
    };

    function populateFurniture() {
        const cat = categorySelect.value;
        const items = categoryFurniture[cat];
        furnitureOptions.innerHTML = '';
        items.forEach(item => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '5px';
            label.style.cursor = 'pointer';
            label.style.marginBottom = '2px';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = item.id;
            checkbox.dataset.area = item.area;
            checkbox.checked = item.checked;
            checkbox.addEventListener('change', () => {
                updateRoomGeometry();
            });
            
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(item.label + (item.area > 0 ? ` (${item.area}m²)` : '')));
            if (item.id === "wall_shelves") {
                const qtyInput = document.createElement("input");
                qtyInput.type = "number";
                qtyInput.id = "shelf-quantity";
                qtyInput.min = 2;
                qtyInput.max = 20;
                qtyInput.step = 2;
                qtyInput.value = 4;
                qtyInput.style.width = "40px";
                qtyInput.style.marginLeft = "10px";
                qtyInput.style.display = checkbox.checked ? "inline-block" : "none";
                checkbox.addEventListener("change", (e) => {
                    qtyInput.style.display = e.target.checked ? "inline-block" : "none";
                });
                qtyInput.addEventListener("input", () => {
                    updateRoomGeometry();
                });
                label.appendChild(qtyInput);
            }
            furnitureOptions.appendChild(label);
        });
    }

    categorySelect.addEventListener('change', () => {
        populateFurniture();
        updateRoomGeometry();
    });

    setupDragAndDrop(renderer.domElement);
    setupModeSwitcher();
    setMode('arrange');

    populateFurniture(); // Initial populate of all checkboxes
    try {
        updateRoomGeometry(); // Initial room generation with all default checked furniture!
    } catch (e) {
        console.error("Initial updateRoomGeometry error:", e);
    }

    renderer.setAnimationLoop(render);
    window.roomGen = roomGen;
    window.__mainReady = true;
}

function updateRoomGeometry() {
    try {
        const prevSelectedId = (selectedObject && selectedObject.userData && selectedObject.userData.userTransformed)
            ? (selectedObject.userData.furnitureId || selectedObject.userData.name)
            : null;
        if (selectedObject && selectedObject.userData && selectedObject.userData.userTransformed && prevSelectedId && roomGen) {
            roomGen.saveUserTransform(prevSelectedId, selectedObject);
        }
        deselectObject();

        const l = Math.max(2.0, parseFloat(document.getElementById('room-length')?.value) || 5.0);
        const w = Math.max(2.0, parseFloat(document.getElementById('room-width')?.value) || 4.0);
        const h = Math.max(2.0, parseFloat(document.getElementById('room-height')?.value) || 2.8);
        
        // Check available space
        const totalArea = l * w;
        let usedArea = 0;
        const selectedItems = [];
        
        const checkboxes = document.querySelectorAll('#furniture-options input[type="checkbox"]:checked');
        checkboxes.forEach(cb => {
            usedArea += parseFloat(cb.dataset.area || 0);
            selectedItems.push(cb.value);
        });

        const warningEl = document.getElementById('space-warning');
        if (warningEl) {
            if (usedArea > totalArea * 0.95) {
                warningEl.innerText = `Note: Selected furniture needs ${usedArea.toFixed(1)}m² (Room area: ${totalArea.toFixed(1)}m²). Furniture may be closely packed.`;
                warningEl.style.display = 'block';
            } else {
                warningEl.style.display = 'none';
            }
        }

        const category = document.getElementById('room-category')?.value || 'living';
        let numShelves = 4;
        const shelfInput = document.getElementById('shelf-quantity');
        if (shelfInput && selectedItems.includes('wall_shelves')) {
            numShelves = parseInt(shelfInput.value) || 4;
        }
        const ceilingStyleEl = document.getElementById('ceiling-style');
        const ceilingType = ceilingStyleEl ? ceilingStyleEl.value : 'modern_tray';
        const feat = currentPalette?.ceilingFeatures;
        const bp = currentCeilingBlueprint;

        const ceilingOpts = {
            numShelves,
            ceilingType,
            blueprint: (bp && (bp.primaryShape === ceilingType || (bp.primaryShape === 'rectangular_tray' && ceilingType === 'modern_tray'))) ? bp : null,
            coveColor: bp?.outerCoveColor || feat?.coveColor || '#ffd54f',
            innerCoveColor: bp?.innerCoveColor || feat?.innerCoveColor || '#00e5ff',
            trayColor: bp?.ceilingTrayPaintColor || feat?.trayColor || currentPalette?.ceiling?.hex || (document.getElementById('picker-ceiling')?.value) || '#83a9b8',
            fixture: bp?.fixture || feat?.fixture || (ceilingType === 'circular_ring' ? 'ceiling_fan' : 'chandelier'),
            slatCount: bp?.rafterBeamCount || feat?.slatCount || 3
        };

        const enableWindow = document.getElementById('enable-window-checkbox')?.checked ?? true;
        const windowStyle = document.getElementById('window-style')?.value || 'balcony_sliding';
        const windowWall = document.getElementById('window-wall')?.value || 'north';
        const windowScale = document.getElementById('window-scale')?.value || 'auto';

        const enableDoor = document.getElementById('enable-door-checkbox')?.checked ?? true;
        const doorStyle = document.getElementById('door-style')?.value || 'modern_wood';
        const doorWall = document.getElementById('door-wall')?.value || 'south';
        const doorPosition = document.getElementById('door-position')?.value || 'right_corner';

        const tvStyle = document.getElementById('tv-decor-style')?.value || 'fluted_marble_shelf';
        const tvWoodFinish = document.getElementById('tv-wood-finish')?.value || 'walnut';
        const tvConsoleType = document.getElementById('tv-console-type')?.value || 'floating';

        const roomOpts = {
            ...ceilingOpts,
            tvOpts: {
                style: tvStyle,
                woodFinish: tvWoodFinish,
                consoleType: tvConsoleType
            },
            windowOpts: {
                enabled: enableWindow,
                style: windowStyle,
                wall: windowWall,
                scale: windowScale,
                showCurtains: true,
                showBalcony: true
            },
            doorOpts: {
                enabled: enableDoor,
                style: doorStyle,
                wall: doorWall,
                position: doorPosition,
                isOpen: true
            }
        };

        roomGen.generate(l, w, h, category, selectedItems, roomOpts);
        if (roomGen) {
            const showCeiling = document.getElementById('show-ceiling-checkbox')?.checked || (currentMode === 'walk');
            roomGen.setCeilingVisible(showCeiling);

            if (prevSelectedId && roomGen.roomGroup) {
                let reselected = null;
                for (let child of roomGen.roomGroup.children) {
                    if (child.userData && (child.userData.furnitureId === prevSelectedId || child.userData.name === prevSelectedId)) {
                        reselected = child;
                        break;
                    }
                }
                if (reselected) {
                    selectedObject = reselected;
                    updateSelectionVisual(selectedObject);
                }
            }
        }
        const statusEl = document.getElementById('status-msg');
        if (statusEl && (!statusEl.innerText || statusEl.innerText.includes('updated') || statusEl.innerText.includes('Reset'))) {
            statusEl.innerText = `Room geometry updated (${l}m × ${w}m × ${h}m).`;
        }
    } catch (err) {
        console.error("Error in updateRoomGeometry:", err);
        const statusEl = document.getElementById('status-msg');
        if (statusEl) statusEl.innerText = "Notice: Error updating room - " + err.message;
    }
}

async function handleGenerateTexture() {
    const surfaceType = document.getElementById('surface-type').value;
    const statusMsg = document.getElementById('status-msg');

    if (currentStyleMode === 'photo') {
        if (currentPalette) {
            if (surfaceType === 'all-walls') {
                roomGen.applyRoomPalette(currentPalette);
                statusMsg.innerText = "Applied extracted palette to all 4 walls, ceiling, and floor!";
            } else {
                const col = currentPalette[surfaceType] ? (currentPalette[surfaceType].hex || currentPalette[surfaceType]) : null;
                if (col) {
                    roomGen.applyColor(col, surfaceType);
                    statusMsg.innerText = `Applied extracted color (${col}) to ${surfaceType}.`;
                } else {
                    roomGen.applyRoomPalette(currentPalette);
                    statusMsg.innerText = "Applied extracted palette to 3D room!";
                }
            }
        } else {
            statusMsg.innerText = "Please upload a room photo first to extract wall colors.";
        }
        return;
    }

    if (currentStyleMode === 'color') {
        const hex = document.getElementById('solid-color-picker').value;
        roomGen.applyColor(hex, surfaceType);
        statusMsg.innerText = `Solid color (${hex}) applied to ${surfaceType}.`;
        return;
    }

    if (currentStyleMode === 'ai') {
        const prompt = document.getElementById('style-prompt').value;
        const seed = document.getElementById('style-seed').value;
        
        if (!prompt) {
            statusMsg.innerText = "Please enter a custom pattern prompt.";
            return;
        }
        
        statusMsg.innerText = "Generating flat material... (This may take a while)";
        
        const formData = new FormData();
        formData.append('prompt', prompt);
        formData.append('surface_type', surfaceType);
        formData.append('seed', seed);
        
        try {
            // Assume API is hosted at same hostname on port 8000
            const backendUrl = "http://" + window.location.hostname + ":8000/generate-texture";
            const response = await fetch(backendUrl, {
                method: 'POST',
                body: formData
            });
            
            if(!response.ok) {
                throw new Error("API error: " + response.statusText);
            }
            
            const data = await response.json();
            
            if (data.texture) {
                const repeatSlider = document.getElementById('texture-repeat-slider');
                const repeatVal = repeatSlider ? parseInt(repeatSlider.value, 10) || 2 : 2;
                roomGen.applyTexture(data.texture, surfaceType, repeatVal, repeatVal);
                statusMsg.innerText = "Material texture applied successfully!";
            } else if (data.error) {
                statusMsg.innerText = "Error: " + data.error;
            }
            
        } catch(err) {
            console.error(err);
            statusMsg.innerText = "Failed to generate texture. Ensure backend is running.";
        }
    }
}

function onWindowResize() {
    const container = document.getElementById('canvas-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function render() {
    const time = performance.now();

    // Rotate ceiling fan blades if active in scene
    if (roomGen && roomGen.ceilingFanBlades) {
        roomGen.ceilingFanBlades.rotation.y += 0.035;
    }

    if (currentMode === 'arrange') {
        if (orbitControls) orbitControls.update();
    } else if (currentMode === 'walk') {
        const delta = Math.min(( time - prevTime ) / 1000, 0.1);

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number( moveForward ) - Number( moveBackward );
        direction.x = Number( moveRight ) - Number( moveLeft );
        direction.normalize(); // this ensures consistent movements in all directions

        const speed = 15.0; // Responsive walking speed

        if ( moveForward || moveBackward ) velocity.z -= direction.z * speed * delta;
        if ( moveLeft || moveRight ) velocity.x -= direction.x * speed * delta;

        controls.moveRight( - velocity.x * delta );
        controls.moveForward( - velocity.z * delta );
        
        // Lock player height at natural eye level (1.6m)
        controls.getObject().position.y = 1.6;

        // Keep player safely within room walls (prevent falling outside)
        const roomL = parseFloat(document.getElementById('room-length')?.value) || 5;
        const roomW = parseFloat(document.getElementById('room-width')?.value) || 4;
        const margin = 0.3;
        const maxPlayerX = Math.max(0.5, (roomW / 2) - margin);
        const maxPlayerZ = Math.max(0.5, (roomL / 2) - margin);
        controls.getObject().position.x = Math.max(-maxPlayerX, Math.min(maxPlayerX, controls.getObject().position.x));
        controls.getObject().position.z = Math.max(-maxPlayerZ, Math.min(maxPlayerZ, controls.getObject().position.z));
    }

    prevTime = time;
    renderer.render(scene, camera);
}

// --- Drag & Drop Furniture System ---

function getTopFurnitureObject(mesh) {
    if (!mesh || !roomGen || !roomGen.roomGroup) return null;
    let curr = mesh;
    while (curr.parent && curr.parent !== roomGen.roomGroup) {
        curr = curr.parent;
    }
    if (curr && curr.parent === roomGen.roomGroup) {
        if (curr === roomGen.meshes.floor || curr === roomGen.meshes.ceiling) return null;
        if (roomGen.meshes.walls && roomGen.meshes.walls.includes(curr)) return null;
        if (curr === roomGen.doorGroup || curr === roomGen.windowGroup) return null;
        if (curr.userData && curr.userData.nonDraggable) return null;
        return curr;
    }
    return null;
}

function updateSelectionVisual(obj) {
    if (selectionBoxHelper) {
        scene.remove(selectionBoxHelper);
        selectionBoxHelper.dispose();
        selectionBoxHelper = null;
    }
    if (obj) {
        selectionBoxHelper = new THREE.BoxHelper(obj, 0x00ff88);
        scene.add(selectionBoxHelper);

        const nameEl = document.getElementById('selected-item-name');
        if (nameEl) {
            const isWall = !!(obj.userData && obj.userData.isWallItem);
            nameEl.innerText = "Selected: " + (obj.userData.name || "Furniture") + (isWall ? " (Wall Mounted)" : "");
        }
        const selCtrl = document.getElementById('selection-controls');
        if (selCtrl) selCtrl.style.display = 'block';

        const heightCtrl = document.getElementById('height-controls-row');
        if (heightCtrl) {
            heightCtrl.style.display = 'flex';
        }
    } else {
        const selCtrl = document.getElementById('selection-controls');
        if (selCtrl) selCtrl.style.display = 'none';
    }
}

function deselectObject() {
    selectedObject = null;
    isDragging = false;
    updateSelectionVisual(null);
}

function adjustSelectedHeight(deltaY) {
    if (selectedObject) {
        const roomH = parseFloat(document.getElementById('room-height')?.value) || 2.8;
        const newY = Math.max(0.2, Math.min(roomH - 0.15, selectedObject.position.y + deltaY));
        selectedObject.position.y = newY;
        selectedObject.userData.userTransformed = true;
        const fid = selectedObject.userData.furnitureId || selectedObject.userData.name;
        if (fid && roomGen) {
            roomGen.saveUserTransform(fid, selectedObject);
        }
        if (selectionBoxHelper) selectionBoxHelper.update();
        const statusEl = document.getElementById('status-msg');
        if (statusEl) statusEl.innerText = `${selectedObject.userData.name} height: ${newY.toFixed(2)}m`;
    }
}

function rotateSelected(deltaRad) {
    if (selectedObject) {
        if (selectedObject.userData && selectedObject.userData.isWallItem) {
            // Wall-mounted item: cycle between the 4 walls!
            const roomL = parseFloat(document.getElementById('room-length')?.value) || 5;
            const roomW = parseFloat(document.getElementById('room-width')?.value) || 4;
            
            // 0: North wall (z = -roomL/2 + 0.05, rotY = 0)
            // 1: East wall  (x =  roomW/2 - 0.05, rotY = -Math.PI/2)
            // 2: South wall (z =  roomL/2 - 0.05, rotY = Math.PI)
            // 3: West wall  (x = -roomW/2 + 0.05, rotY = Math.PI/2)
            const curPos = selectedObject.position;
            let currentWall = 0;
            if (curPos.z <= -roomL/2 + 0.5) currentWall = 0;
            else if (curPos.x >= roomW/2 - 0.5) currentWall = 1;
            else if (curPos.z >= roomL/2 - 0.5) currentWall = 2;
            else if (curPos.x <= -roomW/2 + 0.5) currentWall = 3;
            else currentWall = (Math.abs(curPos.z) > Math.abs(curPos.x)) ? (curPos.z < 0 ? 0 : 2) : (curPos.x > 0 ? 1 : 3);

            const step = deltaRad > 0 ? 1 : -1;
            const nextWall = (currentWall + step + 4) % 4;
            const curY = selectedObject.position.y;

            if (nextWall === 0) { // North Wall
                selectedObject.position.set(0, curY, -roomL / 2 + 0.05);
                selectedObject.rotation.set(0, 0, 0);
                selectedObject.userData._isZWall = true;
            } else if (nextWall === 1) { // East Wall
                selectedObject.position.set(roomW / 2 - 0.05, curY, 0);
                selectedObject.rotation.set(0, -Math.PI / 2, 0);
                selectedObject.userData._isZWall = false;
            } else if (nextWall === 2) { // South Wall
                selectedObject.position.set(0, curY, roomL / 2 - 0.05);
                selectedObject.rotation.set(0, Math.PI, 0);
                selectedObject.userData._isZWall = true;
            } else { // West Wall
                selectedObject.position.set(-roomW / 2 + 0.05, curY, 0);
                selectedObject.rotation.set(0, Math.PI / 2, 0);
                selectedObject.userData._isZWall = false;
            }
            const wallNames = ['North Wall', 'East Wall', 'South Wall', 'West Wall'];
            document.getElementById('status-msg').innerText = `${selectedObject.userData.name} moved to ${wallNames[nextWall]}.`;
        } else {
            selectedObject.rotation.y += deltaRad;
        }
        selectedObject.userData.userTransformed = true;
        const fid = selectedObject.userData.furnitureId || selectedObject.userData.name;
        if (fid && roomGen) {
            roomGen.saveUserTransform(fid, selectedObject);
        }
        if (selectionBoxHelper) selectionBoxHelper.update();
    }
}

function setMode(newMode) {
    currentMode = newMode;
    const arrangeBtn = document.getElementById('mode-arrange-btn');
    const walkBtn = document.getElementById('mode-walk-btn');
    const modeHud = document.getElementById('mode-hud');

    if (newMode === 'arrange') {
        if (controls && controls.isLocked) controls.unlock();
        if (orbitControls) {
            orbitControls.enabled = true;
            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            orbitControls.target.copy(camera.position).addScaledVector(dir, 3.0);
            orbitControls.update();
        }
        const showCeiling = document.getElementById('show-ceiling-checkbox')?.checked || false;
        if (roomGen) roomGen.setCeilingVisible(showCeiling);

        if (arrangeBtn) {
            arrangeBtn.style.background = '#28a745';
            arrangeBtn.style.color = '#fff';
        }
        if (walkBtn) {
            walkBtn.style.background = '#495057';
            walkBtn.style.color = '#adb5bd';
        }
        if (modeHud) {
            modeHud.innerHTML = '🖐️ <b>Drag & Drop Mode:</b> Click & drag any furniture across the floor. Press <b>[R]</b> to rotate. Right-click to pan camera.';
        }
        document.getElementById('status-msg').innerText = "Drag & Drop Mode active. Click and drag any furniture.";
    } else {
        if (orbitControls) orbitControls.enabled = false;
        if (roomGen) roomGen.setCeilingVisible(true);

        if (arrangeBtn) {
            arrangeBtn.style.background = '#495057';
            arrangeBtn.style.color = '#adb5bd';
        }
        if (walkBtn) {
            walkBtn.style.background = '#007bff';
            walkBtn.style.color = '#fff';
        }
        if (modeHud) {
            modeHud.innerHTML = '🚶 <b>Walk Mode:</b> <b>[W][A][S][D]</b> / Arrows to walk | Drag to look | Click 3D view to lock mouse.';
        }
        document.getElementById('status-msg').innerText = "Walk Mode active! Walk with W,A,S,D. Click canvas for FPS mouse lock.";
        deselectObject();

        // Position camera inside room looking forward
        camera.position.set(0, 1.6, 2.0);
        camera.lookAt(0, 1.6, -2.0);

        try {
            controls.lock();
        } catch (e) {}
    }
}

function setupModeSwitcher() {
    const arrangeBtn = document.getElementById('mode-arrange-btn');
    const walkBtn = document.getElementById('mode-walk-btn');
    const rotLeftBtn = document.getElementById('rotate-left-btn');
    const rotRightBtn = document.getElementById('rotate-right-btn');
    const deselectBtn = document.getElementById('deselect-btn');
    const heightDownBtn = document.getElementById('height-down-btn');
    const heightUpBtn = document.getElementById('height-up-btn');

    if (arrangeBtn) arrangeBtn.addEventListener('click', () => setMode('arrange'));
    if (walkBtn) walkBtn.addEventListener('click', () => {
        setMode('walk');
        try {
            controls.lock();
        } catch (e) {}
    });
    if (rotLeftBtn) rotLeftBtn.addEventListener('click', () => rotateSelected(-Math.PI / 4));
    if (rotRightBtn) rotRightBtn.addEventListener('click', () => rotateSelected(Math.PI / 4));
    if (deselectBtn) deselectBtn.addEventListener('click', () => deselectObject());
    if (heightDownBtn) heightDownBtn.addEventListener('click', () => adjustSelectedHeight(-0.1));
    if (heightUpBtn) heightUpBtn.addEventListener('click', () => adjustSelectedHeight(0.1));

    const resetLayoutBtn = document.getElementById('reset-all-furniture-btn');
    if (resetLayoutBtn) {
        resetLayoutBtn.addEventListener('click', () => {
            if (roomGen) {
                roomGen.clearSavedTransforms();
                updateRoomGeometry();
                document.getElementById('status-msg').innerText = "All furniture layout and rotations reset to default.";
            }
        });
    }

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.key === 'r' || e.key === 'R') {
            if (currentMode === 'arrange' && selectedObject) {
                rotateSelected(e.shiftKey ? -Math.PI / 4 : Math.PI / 4);
            }
        }
        if (e.key === 'PageUp' || e.key === '+' || e.key === '=') {
            if (currentMode === 'arrange' && selectedObject) {
                adjustSelectedHeight(0.1);
            }
        }
        if (e.key === 'PageDown' || e.key === '-' || e.key === '_') {
            if (currentMode === 'arrange' && selectedObject) {
                adjustSelectedHeight(-0.1);
            }
        }
        if (e.key === 'Escape') {
            if (currentMode === 'arrange' && selectedObject) {
                deselectObject();
            }
        }
    });
}

function setupDragAndDrop(domElement) {
    domElement.addEventListener('pointerdown', (e) => {
        if (currentMode !== 'arrange') return;
        if (e.button !== 0) return; // Only left click drags

        const rect = domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(roomGen.roomGroup.children, true);

        let hitFurniture = null;
        for (let hit of intersects) {
            const targetObj = getTopFurnitureObject(hit.object);
            if (targetObj) {
                hitFurniture = targetObj;
                break;
            }
        }

        if (hitFurniture) {
            e.stopImmediatePropagation();
            selectedObject = hitFurniture;
            isDragging = true;
            if (orbitControls) orbitControls.enabled = false;

            const isWall = !!(selectedObject.userData && selectedObject.userData.isWallItem);
            if (isWall) {
                const curPos = selectedObject.position;
                const isZWall = Math.abs(curPos.z) >= Math.abs(curPos.x);
                selectedObject.userData._isZWall = isZWall;

                if (isZWall) {
                    dragPlane.set(new THREE.Vector3(0, 0, 1), -curPos.z);
                    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
                        dragOffset.x = curPos.x - planeIntersect.x;
                        dragOffset.y = curPos.y - planeIntersect.y;
                    } else {
                        dragOffset.set(0, 0, 0);
                    }
                } else {
                    dragPlane.set(new THREE.Vector3(1, 0, 0), -curPos.x);
                    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
                        dragOffset.z = curPos.z - planeIntersect.z;
                        dragOffset.y = curPos.y - planeIntersect.y;
                    } else {
                        dragOffset.set(0, 0, 0);
                    }
                }
            } else {
                dragPlane.set(new THREE.Vector3(0, 1, 0), -selectedObject.position.y);
                if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
                    dragOffset.copy(selectedObject.position).sub(planeIntersect);
                } else {
                    dragOffset.set(0, 0, 0);
                }
            }

            updateSelectionVisual(selectedObject);
            domElement.style.cursor = 'grabbing';
        } else {
            const hitFloor = intersects.some(hit => hit.object === roomGen.meshes.floor);
            if (hitFloor && selectedObject) {
                deselectObject();
            }
        }
    }, { capture: true });

    domElement.addEventListener('pointermove', (e) => {
        if (currentMode !== 'arrange') return;

        const rect = domElement.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        if (isDragging && selectedObject) {
            const isWall = !!(selectedObject.userData && selectedObject.userData.isWallItem);
            const roomL = parseFloat(document.getElementById('room-length')?.value) || 5;
            const roomW = parseFloat(document.getElementById('room-width')?.value) || 4;
            const roomH = parseFloat(document.getElementById('room-height')?.value) || 2.8;

            if (isWall) {
                const isZWall = selectedObject.userData._isZWall;
                if (isZWall) {
                    dragPlane.set(new THREE.Vector3(0, 0, 1), -selectedObject.position.z);
                    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
                        const newX = planeIntersect.x + dragOffset.x;
                        const newY = planeIntersect.y + dragOffset.y;
                        const limitX = (roomW / 2) - 0.45;
                        selectedObject.position.x = Math.max(-limitX, Math.min(limitX, newX));
                        selectedObject.position.y = Math.max(0.35, Math.min(roomH - 0.25, newY));
                    }
                } else {
                    dragPlane.set(new THREE.Vector3(1, 0, 0), -selectedObject.position.x);
                    if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
                        const newZ = planeIntersect.z + dragOffset.z;
                        const newY = planeIntersect.y + dragOffset.y;
                        const limitZ = (roomL / 2) - 0.45;
                        selectedObject.position.z = Math.max(-limitZ, Math.min(limitZ, newZ));
                        selectedObject.position.y = Math.max(0.35, Math.min(roomH - 0.25, newY));
                    }
                }
            } else {
                dragPlane.set(new THREE.Vector3(0, 1, 0), -selectedObject.position.y);
                if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
                    const newX = planeIntersect.x + dragOffset.x;
                    const newZ = planeIntersect.z + dragOffset.z;

                    const limitX = (roomW / 2) - 0.25;
                    const limitZ = (roomL / 2) - 0.25;

                    selectedObject.position.x = Math.max(-limitX, Math.min(limitX, newX));
                    selectedObject.position.z = Math.max(-limitZ, Math.min(limitZ, newZ));
                }
            }

            selectedObject.userData.userTransformed = true;
            const fid = selectedObject.userData.furnitureId || selectedObject.userData.name;
            if (fid && roomGen) {
                roomGen.saveUserTransform(fid, selectedObject);
            }

            if (selectionBoxHelper) {
                selectionBoxHelper.update();
            }
        } else {
            const intersects = raycaster.intersectObjects(roomGen.roomGroup.children, true);
            let found = false;
            for (let hit of intersects) {
                if (getTopFurnitureObject(hit.object)) {
                    domElement.style.cursor = 'grab';
                    found = true;
                    break;
                }
            }
            if (!found) {
                domElement.style.cursor = 'default';
            }
        }
    });

    window.addEventListener('pointerup', () => {
        if (isDragging) {
            isDragging = false;
            if (selectedObject) {
                selectedObject.userData.userTransformed = true;
                const fid = selectedObject.userData.furnitureId || selectedObject.userData.name;
                if (fid && roomGen) {
                    roomGen.saveUserTransform(fid, selectedObject);
                }
            }
            if (orbitControls) orbitControls.enabled = true;
            domElement.style.cursor = 'grab';
        }
    });
}
