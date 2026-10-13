import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { RoomGenerator } from './room.js?v=24';

let camera, scene, renderer, controls, orbitControls, roomGen;
let currentMode = 'arrange'; // 'arrange' (Drag & Drop) or 'walk' (WASD)

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

init();

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
    camera.position.set(0, 3.4, 4.2); 

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
    orbitControls.minDistance = 1;
    orbitControls.maxDistance = 20;
    orbitControls.target.set(0, 0.6, 0);
    orbitControls.update();

    // FPS Controls (GTA style)
    controls = new PointerLockControls(camera, renderer.domElement);
    
    // Click on canvas to lock mouse ONLY when in Walk mode
    container.addEventListener('click', () => {
        if (currentMode === 'walk') {
            controls.lock();
        }
    });

    controls.addEventListener('lock', () => {
        document.getElementById('status-msg').innerText = "Walk Mode active! Use W,A,S,D to walk. Press ESC to unlock mouse.";
    });
    
    controls.addEventListener('unlock', () => {
        if (currentMode === 'walk') {
            document.getElementById('status-msg').innerText = "Walk Mode paused. Click the 3D view to resume walking.";
        }
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

    // Solid color toggle handler
    const useSolidColorToggle = document.getElementById('use-solid-color');
    const aiSection = document.getElementById('ai-style-section');
    const solidSection = document.getElementById('solid-color-section');
    useSolidColorToggle.addEventListener('change', (e) => {
        if(e.target.checked) {
            aiSection.style.display = 'none';
            solidSection.style.display = 'block';
        } else {
            aiSection.style.display = 'block';
            solidSection.style.display = 'none';
        }
    });

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
            { id: 'wall_shelves', label: 'Wall Shelves', area: 0.0, checked: false },
            { id: 'tv', label: 'Flat Screen TV', area: 0.0, checked: true },
            { id: 'speakers', label: 'Sound System', area: 0.5, checked: false },
            { id: 'router', label: 'Wi-Fi Router', area: 0.0, checked: false },
            { id: 'ceiling_fan', label: 'Ceiling Fan', area: 0.0, checked: true },
            { id: 'ceiling_light', label: 'Ceiling Chandelier', area: 0.0, checked: false },
            { id: 'floor_lamp', label: 'Floor Lamp', area: 0.2, checked: false },
            { id: 'curtains', label: 'Curtains', area: 0.5, checked: false },
            { id: 'rug', label: 'Floor Rug', area: 0.0, checked: true },
            { id: 'wall_art', label: 'Wall Art', area: 0.0, checked: false },
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
    populateFurniture(); // Initial populate of all checkboxes
    updateRoomGeometry(); // Initial room generation with all default checked furniture!

    setupDragAndDrop(renderer.domElement);
    setupModeSwitcher();
    setMode('arrange');

    renderer.setAnimationLoop(render);
}

function updateRoomGeometry() {
    deselectObject();
    const l = parseFloat(document.getElementById('room-length').value);
    const w = parseFloat(document.getElementById('room-width').value);
    const h = parseFloat(document.getElementById('room-height').value);
    
    // Check available space
    const totalArea = l * w;
    let usedArea = 0;
    const selectedItems = [];
    
    const checkboxes = document.querySelectorAll('#furniture-options input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
        usedArea += parseFloat(cb.dataset.area);
        selectedItems.push(cb.value);
    });

    const warningEl = document.getElementById('space-warning');
    // Allow max 60% of room to be filled with furniture, otherwise it's unlivable
    if (usedArea > totalArea * 0.95) {
        warningEl.innerText = `Warning: Selected items need ${usedArea.toFixed(1)}m², but room is only ${totalArea.toFixed(1)}m². It's too cramped! Please reduce items or increase room size.`;
        warningEl.style.display = 'block';
        return; // Halt generation
    } else {
        warningEl.style.display = 'none';
    }

    const category = document.getElementById('room-category').value;
    let numShelves = 4;
    const shelfInput = document.getElementById('shelf-quantity');
    if (shelfInput && selectedItems.includes('wall_shelves')) {
        numShelves = parseInt(shelfInput.value) || 4;
    }
    roomGen.generate(l, w, h, category, selectedItems, { numShelves });
    if (roomGen) {
        roomGen.setCeilingVisible(currentMode === 'walk');
    }
}

async function handleGenerateTexture() {
    const surfaceType = document.getElementById('surface-type').value;
    const statusMsg = document.getElementById('status-msg');
    const useSolidColor = document.getElementById('use-solid-color').checked;

    if (useSolidColor) {
        const hex = document.getElementById('solid-color-picker').value;
        roomGen.applyColor(hex, surfaceType);
        statusMsg.innerText = "Solid color applied immediately.";
        return;
    }

    const prompt = document.getElementById('style-prompt').value;
    const seed = document.getElementById('style-seed').value;
    const refFile = document.getElementById('ref-image').files[0];
    const sketchFile = document.getElementById('sketch-image').files[0];
    
    if (!prompt) {
        statusMsg.innerText = "Please enter a custom pattern prompt.";
        return;
    }
    
    statusMsg.innerText = "Generating flat material... (This may take a while)";
    
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('surface_type', surfaceType);
    formData.append('seed', seed);
    if(refFile) formData.append('reference_image', refFile);
    if(sketchFile) formData.append('sketch_image', sketchFile);
    
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
            roomGen.applyTexture(data.texture, surfaceType);
            statusMsg.innerText = "Material texture applied successfully!";
        } else if (data.error) {
            statusMsg.innerText = "Error: " + data.error;
        }
        
    } catch(err) {
        console.error(err);
        statusMsg.innerText = "Failed to generate texture. Ensure backend is running.";
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

    if (currentMode === 'arrange') {
        if (orbitControls) orbitControls.update();
    } else if ( controls.isLocked === true ) {
        const delta = ( time - prevTime ) / 1000;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number( moveForward ) - Number( moveBackward );
        direction.x = Number( moveRight ) - Number( moveLeft );
        direction.normalize(); // this ensures consistent movements in all directions

        const speed = 20.0; // Walking speed

        if ( moveForward || moveBackward ) velocity.z -= direction.z * speed * delta;
        if ( moveLeft || moveRight ) velocity.x -= direction.x * speed * delta;

        controls.moveRight( - velocity.x * delta );
        controls.moveForward( - velocity.z * delta );
        
        // Lock player height
        controls.getObject().position.y = 1.6;
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
            nameEl.innerText = "Selected: " + (obj.userData.name || "Furniture");
        }
        const selCtrl = document.getElementById('selection-controls');
        if (selCtrl) selCtrl.style.display = 'block';
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

function rotateSelected(deltaRad) {
    if (selectedObject) {
        selectedObject.rotation.y += deltaRad;
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
        if (orbitControls) orbitControls.enabled = true;
        if (roomGen) roomGen.setCeilingVisible(false);

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
            modeHud.innerHTML = '🚶 <b>Walk Mode:</b> Click anywhere in 3D view to lock mouse and walk with W,A,S,D. Press [ESC] to unlock.';
        }
        document.getElementById('status-msg').innerText = "Click the 3D view to enter GTA/WASD walk mode.";
        deselectObject();

        // Position camera inside room looking forward
        camera.position.set(0, 1.6, 2.0);
        camera.lookAt(0, 1.6, -2.0);
    }
}

function setupModeSwitcher() {
    const arrangeBtn = document.getElementById('mode-arrange-btn');
    const walkBtn = document.getElementById('mode-walk-btn');
    const rotLeftBtn = document.getElementById('rotate-left-btn');
    const rotRightBtn = document.getElementById('rotate-right-btn');
    const deselectBtn = document.getElementById('deselect-btn');

    if (arrangeBtn) arrangeBtn.addEventListener('click', () => setMode('arrange'));
    if (walkBtn) walkBtn.addEventListener('click', () => setMode('walk'));
    if (rotLeftBtn) rotLeftBtn.addEventListener('click', () => rotateSelected(-Math.PI / 4));
    if (rotRightBtn) rotRightBtn.addEventListener('click', () => rotateSelected(Math.PI / 4));
    if (deselectBtn) deselectBtn.addEventListener('click', () => deselectObject());

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.key === 'r' || e.key === 'R') {
            if (currentMode === 'arrange' && selectedObject) {
                rotateSelected(e.shiftKey ? -Math.PI / 4 : Math.PI / 4);
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

            dragPlane.constant = -selectedObject.position.y;
            if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
                dragOffset.copy(selectedObject.position).sub(planeIntersect);
            } else {
                dragOffset.set(0, 0, 0);
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
            dragPlane.constant = -selectedObject.position.y;
            if (raycaster.ray.intersectPlane(dragPlane, planeIntersect)) {
                const newX = planeIntersect.x + dragOffset.x;
                const newZ = planeIntersect.z + dragOffset.z;

                const roomL = parseFloat(document.getElementById('room-length').value) || 5;
                const roomW = parseFloat(document.getElementById('room-width').value) || 4;
                const limitX = (roomW / 2) - 0.25;
                const limitZ = (roomL / 2) - 0.25;

                selectedObject.position.x = Math.max(-limitX, Math.min(limitX, newX));
                selectedObject.position.z = Math.max(-limitZ, Math.min(limitZ, newZ));

                if (selectionBoxHelper) {
                    selectionBoxHelper.update();
                }
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
            if (orbitControls) orbitControls.enabled = true;
            domElement.style.cursor = 'grab';
        }
    });
}
