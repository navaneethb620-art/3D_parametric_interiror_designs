import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class RoomGenerator {
    constructor(scene) {
        this.scene = scene;
        this.roomGroup = new THREE.Group();
        this.scene.add(this.roomGroup);
        
        // Default materials for each wall and surface
        this.wallMaterials = {
            left: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.85, side: THREE.DoubleSide }),
            right: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.85, side: THREE.DoubleSide }),
            north: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.85, side: THREE.DoubleSide }),
            south: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.85, side: THREE.DoubleSide })
        };
        this.wallMaterial = this.wallMaterials.north; // Fallback reference
        this.floorMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.7, side: THREE.DoubleSide });
        this.ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xfff0e5, roughness: 0.9, side: THREE.DoubleSide });
        
        this.meshes = { 
            walls: [], 
            wallLeft: null,   // Wall 1
            wallRight: null,  // Wall 2
            wallNorth: null,  // Wall 3
            wallSouth: null,  // Wall 4
            floor: null,      // Surface 6
            ceiling: null     // Surface 5
        };
        
        // 3D Asset Loader
        this.gltfLoader = new GLTFLoader();
        this.loadedModels = {};
    }

    generate(length, width, height, category='living', selectedItems=[], options={}) {
        // 0. Preserve transforms of any existing objects that were moved or rotated by user
        if (!this.savedUserTransforms) this.savedUserTransforms = {};
        if (this.roomGroup && this.roomGroup.children) {
            for (let child of this.roomGroup.children) {
                if (child.userData && child.userData.userTransformed && (child.userData.furnitureId || child.userData.name)) {
                    const fid = child.userData.furnitureId || child.userData.name;
                    this.saveUserTransform(fid, child);
                }
            }
        }

        this.currentRoomWidth = width;
        this.currentRoomLength = length;
        this.currentRoomHeight = height;
        this.currentRoomLimits = {
            maxX: width / 2 - 0.25,
            maxZ: length / 2 - 0.25
        };

        // Clear old room
        while(this.roomGroup.children.length > 0){ 
            let child = this.roomGroup.children[0];
            this.roomGroup.remove(child); 
        }
        this.meshes.walls = [];

        // 1. Floor (Surface 6)
        const floorGeo = new THREE.PlaneGeometry(width, length);
        floorGeo.rotateX(-Math.PI / 2);
        this.meshes.floor = new THREE.Mesh(floorGeo, this.floorMaterial);
        this.roomGroup.add(this.meshes.floor);

        // 2. Ceiling (Surface 5)
        this.ceilingGroup = new THREE.Group();
        this.roomGroup.add(this.ceilingGroup);
        this.meshes.ceiling = this.ceilingGroup;

        // Base upper ceiling plane (Upper Tray)
        const ceilingGeo = new THREE.BoxGeometry(width, 0.08, length);
        this.ceilingUpperMesh = new THREE.Mesh(ceilingGeo, this.ceilingMaterial);
        this.ceilingUpperMesh.position.y = height + 0.04;
        this.ceilingGroup.add(this.ceilingUpperMesh);

        // Reset active dynamic ceiling fixtures
        this.ceilingFanBlades = null;

        // Build procedural ceiling architecture based on options.blueprint or options.ceilingType
        if (options.blueprint) {
            this.ceilingStyle = options.blueprint.primaryShape || 'modern_tray';
            this.buildCeilingFromBlueprint(options.blueprint, width, length, height);
        } else {
            const ceilingStyle = options.ceilingType || this.ceilingStyle || 'modern_tray';
            this.ceilingStyle = ceilingStyle;
            this.buildCeilingArchitecture(ceilingStyle, width, length, height, options);
        }

        // 3. Doors & Windows (Parametric & Auto-Resizing)
        if (this.doorGroup) this.roomGroup.remove(this.doorGroup);
        if (this.windowGroup) this.roomGroup.remove(this.windowGroup);
        this.doorGroup = new THREE.Group();
        this.windowGroup = new THREE.Group();
        this.roomGroup.add(this.doorGroup);
        this.roomGroup.add(this.windowGroup);

        const winCutout = this.buildParametricWindow(length, width, height, options.windowOpts);
        const doorCutout = this.buildParametricDoor(length, width, height, options.doorOpts);

        const getCutoutForWall = (wallKey) => {
            if (winCutout && winCutout.wall === wallKey) return winCutout;
            if (doorCutout && doorCutout.wall === wallKey) return doorCutout;
            return null;
        };

        // 4. Individual Walls (with Architectural Openings)
        // Wall 3: North Wall (Straight back wall facing camera)
        const wallN = this.buildWallSection('north', width, height, getCutoutForWall('north'));
        wallN.position.set(0, 0, -length / 2);
        this.roomGroup.add(wallN);
        this.meshes.wallNorth = wallN;

        // Wall 4: South Wall (Front wall behind sofa and camera)
        const wallS = this.buildWallSection('south', width, height, getCutoutForWall('south'));
        wallS.position.set(0, 0, length / 2);
        wallS.rotateY(Math.PI);
        this.roomGroup.add(wallS);
        this.meshes.wallSouth = wallS;

        // Wall 2: East Wall (Right wall)
        const wallE = this.buildWallSection('right', length, height, getCutoutForWall('east'));
        wallE.position.set(width / 2, 0, 0);
        wallE.rotateY(-Math.PI / 2);
        this.roomGroup.add(wallE);
        this.meshes.wallRight = wallE;

        // Wall 1: West Wall (Left wall)
        const wallW = this.buildWallSection('left', length, height, getCutoutForWall('west'));
        wallW.position.set(-width / 2, 0, 0);
        wallW.rotateY(Math.PI / 2);
        this.roomGroup.add(wallW);
        this.meshes.wallLeft = wallW;

        // Maintain array of all walls
        this.meshes.walls = [wallW, wallE, wallN, wallS];
        
        // 4. Furniture based on category
        this.generateFurniture(length, width, height, category, selectedItems, options);
    }

    generateFurniture(length, width, height, category, selectedItems, options) {
        const hasItem = (id) => selectedItems.includes(id);

        // Materials
        const tvMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
        const screenMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1 });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.8 });
        const fabricMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
        const rugMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 1.0 });
        const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.2 });

        const getRandomModel = (models) => models[Math.floor(Math.random() * models.length)];

        // Random Asset Pools
        const sofaModels = [
            'models/sofa/sofa_03_4k.gltf',
            'models/sofa/vintage_day_bed_4k.gltf',
            'models/sofa/painted_wooden_sofa_4k.gltf/painted_wooden_sofa_4k.gltf'
        ];
        
        const chairModels = [
            'models/chair/mid_century_lounge_chair_4k.gltf',
            'models/chair/ArmChair_01_4k.gltf',
            'models/chair/modern_arm_chair_01_4k.gltf',
            'models/chair/painted_wooden_chair_02_4k.gltf'
        ];
        
        const cabinetModels = [
            'models/dress_table/vintage_cabinet_01_4k.gltf',
            'models/dress_table/GothicCabinet_01_4k.gltf'
        ];

        // const decorModels = [
        //    'models/antic_peace/carved_wooden_elephant_4k.gltf',
        //    'models/antic_peace/bronze_whale_statue_4k.gltf',
        //    'models/antic_peace/bull_head_4k.gltf',
        //    'models/antic_peace/lion_head_4k.gltf'
        // ];

        const paintingModels = [
            'models/wall_paintings/hanging_picture_frame_03_4k.gltf',
            'models/wall_paintings/fancy_picture_frame_01_4k.gltf'
        ];

        if (category === 'living') {
            const isWindowOnNorth = (options.windowOpts && options.windowOpts.enabled !== false && (options.windowOpts.wall || 'north') === 'north');
            const activeWallSpan = isWindowOnNorth ? length : width;
            const panelWidth = Math.max(2.4, Math.min(activeWallSpan * 0.72, activeWallSpan - 0.7));
            const sofaWidth = Math.min(width * 0.6, 3.0);
            const sofaZ = length * 0.25; 

            // --- Core Seating & Furniture ---
            if (hasItem('tv_unit')) {
                const tvUnitGroup = new THREE.Group();
                if (isWindowOnNorth) {
                    // Mount against West wall (left wall), matching the user's uploaded photo!
                    tvUnitGroup.position.set(-width / 2 + 0.05, 0, -length * 0.08);
                    tvUnitGroup.rotation.y = Math.PI / 2;
                } else {
                    tvUnitGroup.position.set(0, 0, -length / 2 + 0.05);
                }
                tvUnitGroup.userData.isDraggable = true;
                tvUnitGroup.userData.name = "TV Wall Unit";
                tvUnitGroup.userData.furnitureId = "tv_unit";
                this.applyTransformIfSaved(tvUnitGroup, "tv_unit");
                this.roomGroup.add(tvUnitGroup);

                this.buildArchitecturalTVDecor(panelWidth, height, activeWallSpan, options.tvOpts || {}, hasItem('tv'), tvUnitGroup);
            } else if (hasItem('tv')) {
                // Standalone Wall TV
                const tvWidth = 1.5;
                const tvHeight = tvWidth * (9/16);
                const tvGeo = new THREE.BoxGeometry(tvWidth, tvHeight, 0.05);
                const tvMesh = new THREE.Mesh(tvGeo, tvMat);
                if (isWindowOnNorth) {
                    tvMesh.position.set(-width / 2 + 0.06, height * 0.5, -length * 0.08);
                    tvMesh.rotation.y = Math.PI / 2;
                } else {
                    tvMesh.position.set(0, height * 0.5, -length / 2 + 0.05);
                }
                tvMesh.userData.isDraggable = true;
                tvMesh.userData.name = "TV";
                tvMesh.userData.furnitureId = "tv";
                this.applyTransformIfSaved(tvMesh, "tv");
                this.roomGroup.add(tvMesh);
            }
            if (hasItem('sofa')) {
                const sofaGroup = new THREE.Group();
                if (isWindowOnNorth) {
                    // Place along East side facing the TV unit
                    sofaGroup.position.set(width * 0.18, 0, length * 0.05);
                    sofaGroup.rotation.y = -Math.PI / 2;
                } else {
                    sofaGroup.position.set(0, 0, sofaZ);
                }
                sofaGroup.userData.isDraggable = true;
                sofaGroup.userData.name = "Sofa";
                sofaGroup.userData.furnitureId = "sofa";
                this.applyTransformIfSaved(sofaGroup, "sofa");
                this.roomGroup.add(sofaGroup);

                // Photorealistic Sofa Model (Randomly selected)
                this.loadDynamicModel(
                    getRandomModel(sofaModels), 
                    new THREE.Vector3(0, 0, 0), 
                    new THREE.Euler(0, Math.PI, 0),
                    sofaWidth, 
                    0.8,       
                    0.9,
                    sofaGroup
                );

                if (hasItem('cushions')) {
                    // Sofa Cushions attached to sofaGroup
                    for(let i=0; i<3; i++) {
                        const cushGeo = new THREE.BoxGeometry(0.4, 0.4, 0.1);
                        const cushMesh = new THREE.Mesh(cushGeo, whiteMat);
                        cushMesh.rotation.x = Math.PI / 8;
                        cushMesh.position.set(-sofaWidth/3 + (i * sofaWidth/3), 0.5, 0.25);
                        sofaGroup.add(cushMesh);
                    }
                }
            }
            if (hasItem('armchair')) {
                // Accent Armchair (Randomly selected)
                this.loadDynamicModel(
                    getRandomModel(chairModels),
                    new THREE.Vector3(-width/3, 0, sofaZ - 1.0),
                    new THREE.Euler(0, Math.PI / 4, 0),
                    0.8, // Width
                    0.9, // Height
                    0.8, // Depth
                    this.roomGroup,
                    'armchair',
                    'Armchair'
                );
            }
            if (hasItem('coffee_table')) {
                // Gothic Coffee Table
                const coffeePos = isWindowOnNorth ? new THREE.Vector3(-width * 0.05, 0, length * 0.05) : new THREE.Vector3(0, 0, sofaZ - 1.2);
                const coffeeRot = isWindowOnNorth ? new THREE.Euler(0, Math.PI / 2, 0) : new THREE.Euler(0, 0, 0);
                this.loadDynamicModel(
                    'models/table/gothic_coffee_table_4k.gltf',
                    coffeePos,
                    coffeeRot,
                    1.4, // Width
                    0.4, // Height
                    0.8, // Depth
                    this.roomGroup,
                    'coffee_table',
                    'Coffee Table'
                );
            }
            if (hasItem('side_table')) {
                const sideGroup = new THREE.Group();
                if (isWindowOnNorth) {
                    sideGroup.position.set(width * 0.18, 0, length * 0.05 + sofaWidth / 2 + 0.35);
                } else {
                    sideGroup.position.set(sofaWidth/2 + 0.4, 0, sofaZ);
                }
                sideGroup.userData.isDraggable = true;
                sideGroup.userData.name = "Side Table";
                sideGroup.userData.furnitureId = "side_table";
                this.applyTransformIfSaved(sideGroup, "side_table");
                this.roomGroup.add(sideGroup);

                const sideGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.5, 16);
                const sideMesh = new THREE.Mesh(sideGeo, woodMat);
                sideMesh.position.set(0, 0.25, 0);
                sideGroup.add(sideMesh);

                if (hasItem('table_lamp')) {
                    const tLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.2), whiteMat);
                    tLamp.position.set(0, 0.6, 0);
                    sideGroup.add(tLamp);
                }
            }
            if (hasItem('bookshelf')) {
                // Bookshelf (Randomly selected Cabinet)
                this.loadDynamicModel(
                    getRandomModel(cabinetModels),
                    new THREE.Vector3(-width/2 + 0.4, 0, 0),
                    new THREE.Euler(0, Math.PI / 2, 0),
                    0.8, // Width
                    2.0, // Height
                    0.4, // Depth
                    this.roomGroup,
                    'bookshelf',
                    'Bookshelf'
                );
            }
            if (hasItem('shoe_rack')) {
                // Photorealistic Shoe Cabinet
                this.loadDynamicModel(
                    'models/shoe_rack/modern_wooden_cabinet_4k.gltf',
                    new THREE.Vector3(width/2 - 0.5, 0.4, length/2 - 0.3), 
                    new THREE.Euler(0, Math.PI, 0),
                    1.0, // Width
                    0.8, // Height
                    0.4, // Depth
                    this.roomGroup,
                    'shoe_rack',
                    'Shoe Cabinet'
                );
            }
            if (hasItem('wall_shelves')) {
                // Dynamically distribute selected amount of shelves across East and West walls
                const totalShelves = options.numShelves || 4;
                const shelvesPerWall = Math.ceil(totalShelves / 2);
                const westCount = Math.floor(totalShelves / 2);
                const shelfMat = woodMat || new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.75 });
                const bracketMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 });

                // East Wall (+X)
                for (let i = 0; i < shelvesPerWall; i++) {
                    const shelfGroup = new THREE.Group();
                    const yPos = 1.1 + i * 0.38;
                    const zOffset = (shelvesPerWall > 1) ? (i - (shelvesPerWall - 1) / 2) * 0.45 : 0;
                    shelfGroup.position.set(width / 2 - 0.12, yPos, -length * 0.15 + zOffset);
                    shelfGroup.rotation.y = -Math.PI / 2;
                    shelfGroup.userData.isDraggable = true;
                    shelfGroup.userData.name = `Wall Shelf ${i + 1}`;
                    const shelfId = `shelf_east_${i}`;
                    shelfGroup.userData.furnitureId = shelfId;
                    shelfGroup.userData.isWallItem = true;

                    // Wooden shelf plank
                    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.22), shelfMat);
                    plank.castShadow = true;
                    plank.receiveShadow = true;
                    shelfGroup.add(plank);

                    // Support brackets underneath
                    for (let bx of [-0.32, 0.32]) {
                        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.18), bracketMat);
                        bracket.position.set(bx, -0.04, 0.01);
                        shelfGroup.add(bracket);
                    }

                    this.applyTransformIfSaved(shelfGroup, shelfId);
                    this.roomGroup.add(shelfGroup);
                }

                // West Wall (-X)
                for (let i = 0; i < westCount; i++) {
                    const shelfGroup = new THREE.Group();
                    const yPos = 1.1 + i * 0.38;
                    const zOffset = (westCount > 1) ? (i - (westCount - 1) / 2) * 0.45 : 0;
                    shelfGroup.position.set(-width / 2 + 0.12, yPos, length * 0.15 + zOffset);
                    shelfGroup.rotation.y = Math.PI / 2;
                    shelfGroup.userData.isDraggable = true;
                    shelfGroup.userData.name = `Wall Shelf ${shelvesPerWall + i + 1}`;
                    const shelfId = `shelf_west_${i}`;
                    shelfGroup.userData.furnitureId = shelfId;
                    shelfGroup.userData.isWallItem = true;

                    // Wooden shelf plank
                    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.22), shelfMat);
                    plank.castShadow = true;
                    plank.receiveShadow = true;
                    shelfGroup.add(plank);

                    // Support brackets underneath
                    for (let bx of [-0.32, 0.32]) {
                        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.08, 0.18), bracketMat);
                        bracket.position.set(bx, -0.04, 0.01);
                        shelfGroup.add(bracket);
                    }

                    this.applyTransformIfSaved(shelfGroup, shelfId);
                    this.roomGroup.add(shelfGroup);
                }
            }

            // --- Electronics ---
            if (hasItem('speakers')) {
                // Two tall speakers next to TV
                for(let i of [-1, 1]) {
                    const spkGeo = new THREE.BoxGeometry(0.2, 1.0, 0.25);
                    const spkMesh = new THREE.Mesh(spkGeo, tvMat);
                    spkMesh.userData.isDraggable = true;
                    spkMesh.userData.name = i < 0 ? "Left Speaker" : "Right Speaker";
                    const spkId = `speaker_${i < 0 ? 'left' : 'right'}`;
                    spkMesh.userData.furnitureId = spkId;
                    if (isWindowOnNorth) {
                        spkMesh.position.set(-width / 2 + 0.22, 0.5, -length * 0.08 + i * (panelWidth / 2 + 0.3));
                        spkMesh.rotation.y = Math.PI / 2;
                    } else {
                        spkMesh.position.set(i * (panelWidth/2 + 0.3), 0.5, -length/2 + 0.2);
                    }
                    this.applyTransformIfSaved(spkMesh, spkId);
                    this.roomGroup.add(spkMesh);
                }
            }
            if (hasItem('router')) {
                const routerGroup = new THREE.Group();
                routerGroup.userData.isDraggable = true;
                routerGroup.userData.name = "Router";
                routerGroup.userData.furnitureId = "router";
                routerGroup.position.set(0.4, 0.65, -length/2 + 0.2);
                this.applyTransformIfSaved(routerGroup, "router");
                this.roomGroup.add(routerGroup);

                const routerGeo = new THREE.BoxGeometry(0.2, 0.05, 0.15);
                const routerMesh = new THREE.Mesh(routerGeo, whiteMat);
                routerGroup.add(routerMesh);
                
                // Antenna
                const antGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.1);
                const antMesh = new THREE.Mesh(antGeo, whiteMat);
                antMesh.position.set(0.05, 0.06, -0.05);
                routerGroup.add(antMesh);
            }
            if (hasItem('ac')) {
                const acGeo = new THREE.BoxGeometry(1.0, 0.3, 0.2);
                const acMesh = new THREE.Mesh(acGeo, whiteMat);
                acMesh.userData.nonDraggable = true;
                acMesh.position.set(width/2 - 0.1, height - 0.4, 0); // East wall
                this.roomGroup.add(acMesh);
            }

            // --- Lighting ---
            const isFalseCeiling = options.ceilingType !== 'flat';
            if (!isFalseCeiling && (hasItem('ceiling_fan') || hasItem('ceiling_light'))) {
                const ceilingLightGroup = new THREE.Group();
                ceilingLightGroup.userData.nonDraggable = true;
                this.roomGroup.add(ceilingLightGroup);

                // Photorealistic Chandelier
                this.loadDynamicModel(
                    'models/Lights/Chandelier_01_4k.gltf',
                    new THREE.Vector3(0, height - 0.8, 0),
                    new THREE.Euler(0, 0, 0),
                    1.0, // Width
                    0.8, // Height
                    1.0, // Depth
                    ceilingLightGroup
                );
                
                // Add a glowing bulb/light source inside the room to illuminate the ceiling and furniture
                const pointLight = new THREE.PointLight(0xfff0dd, 1.2, 12);
                pointLight.position.set(0, height - 0.8, 0);
                ceilingLightGroup.add(pointLight);
            }
            if (hasItem('floor_lamp')) {
                const lampGroup = new THREE.Group();
                lampGroup.userData.isDraggable = true;
                lampGroup.userData.name = "Floor Lamp";
                lampGroup.userData.furnitureId = "floor_lamp";
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6), metalMat);
                pole.position.set(0, 0.8, 0);
                lampGroup.add(pole);
                const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.3), whiteMat);
                shade.position.set(0, 1.6, 0);
                lampGroup.add(shade);
                lampGroup.position.set(sofaWidth/2 + 0.6, 0, sofaZ + 0.5);
                this.applyTransformIfSaved(lampGroup, "floor_lamp");
                this.roomGroup.add(lampGroup);
            }
            if (hasItem('wall_lights')) {
                for(let i of [-1, 1]) {
                    const wLight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.1), whiteMat);
                    wLight.userData.nonDraggable = true;
                    wLight.position.set(i * (width/2 - 0.05), 1.8, sofaZ);
                    this.roomGroup.add(wLight);
                }
            }

            // --- Decor ---
            if (hasItem('rug')) {
                const rugGeo = isWindowOnNorth ? new THREE.PlaneGeometry(2.0, sofaWidth * 1.2) : new THREE.PlaneGeometry(sofaWidth * 1.2, 2.0);
                rugGeo.rotateX(-Math.PI/2);
                const rugMesh = new THREE.Mesh(rugGeo, rugMat);
                rugMesh.userData.isDraggable = true;
                rugMesh.userData.name = "Rug";
                rugMesh.userData.furnitureId = "rug";
                rugMesh.position.set(isWindowOnNorth ? -width * 0.05 : 0, 0.01, isWindowOnNorth ? length * 0.05 : sofaZ - 1.0);
                this.applyTransformIfSaved(rugMesh, "rug");
                this.roomGroup.add(rugMesh);
            }
            if (hasItem('wall_art')) {
                const wallArtGroup = new THREE.Group();
                wallArtGroup.position.set(0, 1.6, length / 2 - 0.05);
                wallArtGroup.rotation.set(0, Math.PI, 0);
                wallArtGroup.userData.isDraggable = true;
                wallArtGroup.userData.name = "Wall Art";
                wallArtGroup.userData.furnitureId = "wall_art";
                wallArtGroup.userData.isWallItem = true;
                this.applyTransformIfSaved(wallArtGroup, "wall_art");
                this.roomGroup.add(wallArtGroup);

                // Load 3D painting model relative to wallArtGroup
                this.loadDynamicModel(
                    getRandomModel(paintingModels),
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Euler(0, 0, 0),
                    1.2, // Width
                    0.8, // Height
                    0.05, // Depth
                    wallArtGroup
                );
            }
            if (hasItem('clock')) {
                const clockGroup = new THREE.Group();
                clockGroup.position.set(0, height * 0.75, -length / 2 + 0.05);
                clockGroup.rotation.set(0, 0, 0);
                clockGroup.userData.isDraggable = true;
                clockGroup.userData.name = "Antique Wall Clock";
                clockGroup.userData.furnitureId = "clock";
                clockGroup.userData.isWallItem = true;
                this.applyTransformIfSaved(clockGroup, "clock");
                this.roomGroup.add(clockGroup);

                // Load 3D clock model relative to clockGroup
                this.loadDynamicModel(
                    'models/clock/wall_clock_4k.gltf',
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Euler(0, 0, 0),
                    0.45, 0.45, 0.1,
                    clockGroup
                );
            }
            if (hasItem('plants')) {
                const plantGroup = new THREE.Group();
                plantGroup.userData.isDraggable = true;
                plantGroup.userData.name = "Plant";
                plantGroup.userData.furnitureId = "plant";
                const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4), whiteMat);
                pot.position.set(0, 0.2, 0);
                plantGroup.add(pot);
                const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: 0x228B22 }));
                leaves.position.set(0, 0.6, 0);
                plantGroup.add(leaves);
                plantGroup.position.set(-panelWidth/2 - 0.4, 0, -length/2 + 0.4); // Next to TV
                this.applyTransformIfSaved(plantGroup, "plant");
                this.roomGroup.add(plantGroup);
            }
        }
        else if (category === 'bedroom') {
            if (hasItem('bed')) {
                const bedWidth = 1.8;
                const bedLength = 2.0;
                const bedGroup = new THREE.Group();
                bedGroup.userData.isDraggable = true;
                bedGroup.userData.name = "Bed";
                bedGroup.userData.furnitureId = "bed";
                // Mattress
                const mattressGeo = new THREE.BoxGeometry(bedWidth, 0.5, bedLength);
                const mattress = new THREE.Mesh(mattressGeo, whiteMat);
                mattress.position.set(0, 0.25, 0);
                bedGroup.add(mattress);
                // Headboard
                const headGeo = new THREE.BoxGeometry(bedWidth + 0.2, 1.2, 0.1);
                const headboard = new THREE.Mesh(headGeo, woodMat);
                headboard.position.set(0, 0.6, -bedLength/2);
                bedGroup.add(headboard);
                
                bedGroup.position.set(0, 0, -length/2 + bedLength/2 + 0.1); // North wall
                this.applyTransformIfSaved(bedGroup, "bed");
                this.roomGroup.add(bedGroup);
            }
            if (hasItem('wardrobe')) {
                const wardGeo = new THREE.BoxGeometry(2.0, height - 0.2, 0.6);
                const wardMesh = new THREE.Mesh(wardGeo, woodMat);
                wardMesh.userData.isDraggable = true;
                wardMesh.userData.name = "Wardrobe";
                wardMesh.userData.furnitureId = "wardrobe";
                wardMesh.position.set(-width/2 + 0.3, (height-0.2)/2, 0); // West wall
                this.applyTransformIfSaved(wardMesh, "wardrobe");
                this.roomGroup.add(wardMesh);
            }
            // Add other bedroom items...
        }
        else if (category === 'kitchen') {
            if (hasItem('counters')) {
                const countGeo = new THREE.BoxGeometry(width, 0.9, 0.6);
                const countMesh = new THREE.Mesh(countGeo, metalMat);
                countMesh.userData.isDraggable = true;
                countMesh.userData.name = "Counters";
                countMesh.userData.furnitureId = "counters";
                countMesh.position.set(0, 0.45, -length/2 + 0.3); // North wall
                this.applyTransformIfSaved(countMesh, "counters");
                this.roomGroup.add(countMesh);
            }
            if (hasItem('island')) {
                const islGeo = new THREE.BoxGeometry(2.0, 0.9, 1.0);
                const islMesh = new THREE.Mesh(islGeo, woodMat);
                islMesh.userData.isDraggable = true;
                islMesh.userData.name = "Kitchen Island";
                islMesh.userData.furnitureId = "island";
                islMesh.position.set(0, 0.45, 0); // Center
                this.applyTransformIfSaved(islMesh, "island");
                this.roomGroup.add(islMesh);
            }
            if (hasItem('fridge')) {
                const fridgeGeo = new THREE.BoxGeometry(0.8, 2.0, 0.8);
                const fridgeMesh = new THREE.Mesh(fridgeGeo, whiteMat);
                fridgeMesh.userData.isDraggable = true;
                fridgeMesh.userData.name = "Refrigerator";
                fridgeMesh.userData.furnitureId = "fridge";
                fridgeMesh.position.set(width/2 - 0.4, 1.0, -length/2 + 0.4); // Corner
                this.applyTransformIfSaved(fridgeMesh, "fridge");
                this.roomGroup.add(fridgeMesh);
            }
        }
    }

    applyTexture(base64Data, surfaceType, repeatX = 2, repeatY = 2) {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(base64Data, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            
            // repeating to maintain scale
            texture.repeat.set(repeatX, repeatY);

            const newMat = new THREE.MeshStandardMaterial({ 
                map: texture, 
                side: THREE.DoubleSide
            });

            if (surfaceType === 'floor' && this.meshes.floor) {
                this.meshes.floor.material = newMat;
            } else if (surfaceType === 'ceiling' && this.meshes.ceiling) {
                this.meshes.ceiling.material = newMat;
            } else if (surfaceType === 'left' || surfaceType === 'wall1') {
                this.wallMaterials.left = newMat;
                this.applyMaterialToWall(this.meshes.wallLeft, newMat);
            } else if (surfaceType === 'right' || surfaceType === 'wall2') {
                this.wallMaterials.right = newMat;
                this.applyMaterialToWall(this.meshes.wallRight, newMat);
            } else if (surfaceType === 'north' || surfaceType === 'wall3') {
                this.wallMaterials.north = newMat;
                this.applyMaterialToWall(this.meshes.wallNorth, newMat);
            } else if (surfaceType === 'south' || surfaceType === 'wall4') {
                this.wallMaterials.south = newMat;
                this.applyMaterialToWall(this.meshes.wallSouth, newMat);
            } else if (surfaceType === 'wall' || surfaceType === 'walls' || surfaceType === 'all-walls') {
                ['left', 'right', 'north', 'south'].forEach(w => this.wallMaterials[w] = newMat);
                this.meshes.walls.forEach(w => this.applyMaterialToWall(w, newMat));
            }
        });
    }

    applyMaterialToWall(wallObj, material) {
        if (!wallObj) return;
        if (wallObj.isMesh) {
            wallObj.material = material;
        } else if (wallObj.traverse) {
            wallObj.traverse((child) => {
                if (child.isMesh && child.userData && child.userData.isWallPatch) {
                    child.material = material;
                }
            });
        }
    }

    setTextureRepeat(surfaceType, repeatX, repeatY) {
        const updateMat = (target) => {
            if (!target) return;
            const applyToMesh = (m) => {
                if (m && m.material && m.material.map) {
                    m.material.map.repeat.set(repeatX, repeatY);
                    m.material.map.needsUpdate = true;
                }
            };
            if (target.isMesh) {
                applyToMesh(target);
            } else if (target.traverse) {
                target.traverse((child) => {
                    if (child.isMesh && child.userData && child.userData.isWallPatch) {
                        applyToMesh(child);
                    }
                });
            }
        };
        if (surfaceType === 'floor' && this.meshes.floor) {
            updateMat(this.meshes.floor);
        } else if (surfaceType === 'ceiling' && this.meshes.ceiling) {
            updateMat(this.meshes.ceiling);
        } else if (surfaceType === 'left' || surfaceType === 'wall1') {
            updateMat(this.meshes.wallLeft);
        } else if (surfaceType === 'right' || surfaceType === 'wall2') {
            updateMat(this.meshes.wallRight);
        } else if (surfaceType === 'north' || surfaceType === 'wall3') {
            updateMat(this.meshes.wallNorth);
        } else if (surfaceType === 'south' || surfaceType === 'wall4') {
            updateMat(this.meshes.wallSouth);
        } else if (surfaceType === 'wall' || surfaceType === 'walls' || surfaceType === 'all-walls') {
            this.meshes.walls.forEach(w => updateMat(w));
        }
    }

    applyColor(hexColor, surfaceType) {
        const color = new THREE.Color(hexColor);
        const makeMat = (roughness = 0.85) => new THREE.MeshStandardMaterial({ 
            color: color, 
            roughness: roughness,
            side: THREE.DoubleSide 
        });

        const target = (surfaceType || '').toLowerCase().trim();

        if (target === 'floor' || target === '6') {
            this.floorMaterial = makeMat(0.7);
            if (this.meshes.floor) this.meshes.floor.material = this.floorMaterial;
        } else if (target === 'ceiling' || target === '5') {
            this.ceilingMaterial = makeMat(0.9);
            if (this.ceilingUpperMesh) this.ceilingUpperMesh.material = this.ceilingMaterial;
            if (this.ceilingGroup && this.ceilingStyle === 'flat') {
                this.ceilingGroup.traverse((child) => {
                    if (child.isMesh && child.userData.isCeilingSoffit) {
                        child.material = this.ceilingMaterial;
                    }
                });
            }
        } else if (target === 'left' || target === 'wall1' || target === 'wall-left' || target === '1') {
            this.wallMaterials.left = makeMat(0.85);
            this.applyMaterialToWall(this.meshes.wallLeft, this.wallMaterials.left);
        } else if (target === 'right' || target === 'wall2' || target === 'wall-right' || target === '2') {
            this.wallMaterials.right = makeMat(0.85);
            this.applyMaterialToWall(this.meshes.wallRight, this.wallMaterials.right);
        } else if (target === 'north' || target === 'wall3' || target === 'wall-north' || target === 'straight' || target === '3') {
            this.wallMaterials.north = makeMat(0.85);
            this.applyMaterialToWall(this.meshes.wallNorth, this.wallMaterials.north);
        } else if (target === 'south' || target === 'wall4' || target === 'wall-south' || target === 'behind' || target === '4') {
            this.wallMaterials.south = makeMat(0.85);
            this.applyMaterialToWall(this.meshes.wallSouth, this.wallMaterials.south);
        } else if (target === 'wall' || target === 'walls' || target === 'all-walls') {
            ['left', 'right', 'north', 'south'].forEach(w => {
                this.wallMaterials[w] = makeMat(0.85);
            });
            this.applyMaterialToWall(this.meshes.wallLeft, this.wallMaterials.left);
            this.applyMaterialToWall(this.meshes.wallRight, this.wallMaterials.right);
            this.applyMaterialToWall(this.meshes.wallNorth, this.wallMaterials.north);
            this.applyMaterialToWall(this.meshes.wallSouth, this.wallMaterials.south);
        }
    }

    applyRoomPalette(palette) {
        if (!palette) return;
        if (palette.left) this.applyColor(palette.left.hex || palette.left, 'left');
        if (palette.right) this.applyColor(palette.right.hex || palette.right, 'right');
        if (palette.north) this.applyColor(palette.north.hex || palette.north, 'north');
        if (palette.south) this.applyColor(palette.south.hex || palette.south, 'south');
        if (palette.ceiling) this.applyColor(palette.ceiling.hex || palette.ceiling, 'ceiling');
        if (palette.floor) this.applyColor(palette.floor.hex || palette.floor, 'floor');
    }

    buildCeilingFromBlueprint(blueprint, width, length, height) {
        if (!blueprint) return;
        const style = blueprint.primaryShape || 'modern_tray';
        const coveColor = blueprint.outerCoveColor || '#ffd54f';
        const innerCoveColor = blueprint.innerCoveColor || blueprint.outerCoveColor || '#ffd27d';
        const trayColor = blueprint.ceilingTrayPaintColor || '#f6f6f2';
        const fixture = blueprint.fixture || 'ceiling_fan';
        const slatCount = blueprint.rafterBeamCount || 3;

        this.buildCeilingArchitecture(style, width, length, height, {
            coveColor,
            innerCoveColor,
            trayColor,
            fixture,
            slatCount,
            blueprint
        });
    }

    buildCeilingArchitecture(style, width, length, height, options = {}) {
        const opts = (typeof options === 'string') ? { coveColor: options } : (options || {});
        const coveColorHex = opts.coveColor || '#ffd54f';
        switch(style) {
            case 'circular_ring':
                this.buildCircularRingCeiling(width, length, height, opts);
                break;
            case 'coffered_grid':
                this.buildCofferedCeiling(width, length, height, opts);
                break;
            case 'wooden_slats':
                this.buildWoodenSlatsCeiling(width, length, height, opts);
                break;
            case 'floating_island':
                this.buildFloatingIslandCeiling(width, length, height, opts);
                break;
            case 'minimal_spots':
                this.buildMinimalSpotsCeiling(width, length, height, opts);
                break;
            case 'flat':
                // Base flat upper ceiling only
                break;
            case 'modern_tray':
            case 'rectangular_tray':
            case 'false_ceiling':
            case 'tray_cove':
            default:
                this.buildModernFalseCeiling(width, length, height, opts);
                break;
        }
    }

    buildCircularRingCeiling(width, length, height, options = {}) {
        const dropDepth = 0.15; // 15cm step drop
        const borderWidth = Math.max(0.35, Math.min(0.55, Math.min(width, length) * 0.15));
        const soffitY = height - dropDepth / 2;

        const coveColorHex = options.coveColor || '#ffd54f';
        const innerCoveColorHex = options.innerCoveColor || '#00e5ff';
        const trayColorHex = options.trayColor || '#83a9b8';

        // 1. Tint Upper Ceiling Tray with detected pastel paint color
        const trayMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(trayColorHex),
            roughness: 0.88,
            side: THREE.DoubleSide
        });
        if (this.ceilingUpperMesh) {
            this.ceilingUpperMesh.material = trayMat;
        }

        // Crisp white matte gypsum material for architectural false-ceiling soffits, ring, and rafter bars
        const gypsumMat = new THREE.MeshStandardMaterial({
            color: 0xfcfcfc,
            roughness: 0.45,
            metalness: 0.05
        });

        const spotRingMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.3 });
        const spotLensMat = new THREE.MeshBasicMaterial({ color: 0xfffcf0 });

        const makeSoffit = (geo) => {
            const m = new THREE.Mesh(geo, gypsumMat);
            m.userData.isCeilingSoffit = true;
            return m;
        };

        // --- 2. Dropped Soffit Perimeter Beams ---
        // North beam
        const northSoffit = makeSoffit(new THREE.BoxGeometry(width, dropDepth, borderWidth));
        northSoffit.position.set(0, soffitY, -length / 2 + borderWidth / 2);
        this.ceilingGroup.add(northSoffit);

        // South beam
        const southSoffit = makeSoffit(new THREE.BoxGeometry(width, dropDepth, borderWidth));
        southSoffit.position.set(0, soffitY, length / 2 - borderWidth / 2);
        this.ceilingGroup.add(southSoffit);

        // East beam
        const sideLength = Math.max(0.1, length - borderWidth * 2);
        const eastSoffit = makeSoffit(new THREE.BoxGeometry(borderWidth, dropDepth, sideLength));
        eastSoffit.position.set(width / 2 - borderWidth / 2, soffitY, 0);
        this.ceilingGroup.add(eastSoffit);

        // West beam
        const westSoffit = makeSoffit(new THREE.BoxGeometry(borderWidth, dropDepth, sideLength));
        westSoffit.position.set(-width / 2 + borderWidth / 2, soffitY, 0);
        this.ceilingGroup.add(westSoffit);

        // Outer cove lighting around perimeter
        const stripHeight = 0.025;
        const stripThick = 0.015;
        const coveY = height - 0.02;
        const innerW = width - borderWidth * 2;
        const innerL = length - borderWidth * 2;

        const coveGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(coveColorHex) });

        if (innerW > 0.4 && innerL > 0.4) {
            const cNorth = new THREE.Mesh(new THREE.BoxGeometry(innerW, stripHeight, stripThick), coveGlowMat);
            cNorth.position.set(0, coveY, -innerL / 2 + stripThick / 2);
            this.ceilingGroup.add(cNorth);

            const cSouth = new THREE.Mesh(new THREE.BoxGeometry(innerW, stripHeight, stripThick), coveGlowMat);
            cSouth.position.set(0, coveY, innerL / 2 - stripThick / 2);
            this.ceilingGroup.add(cSouth);

            const cEast = new THREE.Mesh(new THREE.BoxGeometry(stripThick, stripHeight, innerL), coveGlowMat);
            cEast.position.set(innerW / 2 - stripThick / 2, coveY, 0);
            this.ceilingGroup.add(cEast);

            const cWest = new THREE.Mesh(new THREE.BoxGeometry(stripThick, stripHeight, innerL), coveGlowMat);
            cWest.position.set(-innerW / 2 + stripThick / 2, coveY, 0);
            this.ceilingGroup.add(cWest);

            // Perimeter warm light wash
            const coveLight1 = new THREE.PointLight(new THREE.Color(coveColorHex), 0.75, 5.0);
            coveLight1.position.set(0, coveY, -innerL / 3);
            this.ceilingGroup.add(coveLight1);

            const coveLight2 = new THREE.PointLight(new THREE.Color(coveColorHex), 0.75, 5.0);
            coveLight2.position.set(0, coveY, innerL / 3);
            this.ceilingGroup.add(coveLight2);
        }

        // Perimeter spotlights
        const spotY = height - dropDepth - 0.005;
        const addSpotlight = (x, z) => {
            const spotGroup = new THREE.Group();
            spotGroup.position.set(x, spotY, z);
            spotGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 16), spotRingMat));
            spotGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16), spotLensMat));
            this.ceilingGroup.add(spotGroup);
        };
        const numSpotsX = Math.max(2, Math.floor(width / 1.6));
        const stepX = (width - borderWidth * 2.2) / (numSpotsX - 1 || 1);
        const startX = -(width - borderWidth * 2.2) / 2;
        for (let i = 0; i < numSpotsX; i++) {
            const x = startX + i * stepX;
            addSpotlight(x, -length / 2 + borderWidth / 2);
            addSpotlight(x, length / 2 - borderWidth / 2);
        }

        // --- 3. Central Suspended Circular Ring False Ceiling (Medallion) ---
        const outerRadius = Math.min(width, length) * 0.28;
        const innerRadius = outerRadius * 0.70;
        const ringDepth = 0.14; // 14cm drop

        // Extrude smooth circular ring shape with bevel
        const ringShape = new THREE.Shape();
        ringShape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
        const ringHole = new THREE.Path();
        ringHole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
        ringShape.holes.push(ringHole);

        const ringExtrudeSettings = {
            depth: ringDepth,
            bevelEnabled: true,
            bevelSegments: 3,
            steps: 1,
            bevelSize: 0.015,
            bevelThickness: 0.015,
            curveSegments: 64
        };
        const ringGeo = new THREE.ExtrudeGeometry(ringShape, ringExtrudeSettings);
        ringGeo.rotateX(Math.PI / 2);
        const ringMesh = new THREE.Mesh(ringGeo, gypsumMat);
        ringMesh.position.set(0, height, 0);
        ringMesh.userData.isCeilingSoffit = true;
        this.ceilingGroup.add(ringMesh);

        // --- 4. Dual Cove Lighting on Ring ---
        // A. Outer Warm Golden Cove Strip & Glow (Backlighting the outer rim of the ring)
        const outerGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(coveColorHex), side: THREE.DoubleSide });
        const outerGlowRing = new THREE.Mesh(new THREE.RingGeometry(outerRadius - 0.02, outerRadius + 0.04, 64), outerGlowMat);
        outerGlowRing.rotateX(-Math.PI / 2);
        outerGlowRing.position.set(0, height - 0.005, 0);
        this.ceilingGroup.add(outerGlowRing);

        const outerRingLight = new THREE.PointLight(new THREE.Color(coveColorHex), 1.0, 4.5);
        outerRingLight.position.set(0, height - 0.02, 0);
        this.ceilingGroup.add(outerRingLight);

        // B. Inner Glowing Cyan / Ice-Blue Cove LED Ribbon & Wash (Lining the inner rim)
        const cyanColor = new THREE.Color(innerCoveColorHex);
        const innerGlowMat = new THREE.MeshBasicMaterial({ color: cyanColor, side: THREE.DoubleSide });
        const innerGlowCylinder = new THREE.Mesh(
            new THREE.CylinderGeometry(innerRadius + 0.005, innerRadius + 0.005, 0.035, 64, 1, true),
            innerGlowMat
        );
        innerGlowCylinder.position.set(0, height - 0.025, 0);
        this.ceilingGroup.add(innerGlowCylinder);

        // Cyan wash point light illuminating the recessed sky-blue tray inside the ring
        const cyanWashLight = new THREE.PointLight(cyanColor, 1.2, 3.5);
        cyanWashLight.position.set(0, height - 0.03, 0);
        this.ceilingGroup.add(cyanWashLight);

        // --- 5. Stepped Accent Rafter Bars (3 Parallel Beams) ---
        // As seen in the photo, 3 parallel stepped vertical rafter bars span between the ring and perimeter soffits
        const rafterWidth = 0.15;
        const rafterDepth = 0.08;
        const rafterSpacing = 0.26;
        const rafterZStart = outerRadius - 0.05;
        const rafterZEnd = length / 2 - borderWidth;
        const rafterLength = Math.max(0.2, rafterZEnd - rafterZStart);
        const rafterCenterZ = (rafterZStart + rafterZEnd) / 2;
        const rafterY = height - rafterDepth / 2;

        const offsets = [-rafterSpacing, 0, rafterSpacing];
        offsets.forEach(ox => {
            // North side rafter bar
            const barGeoN = new THREE.BoxGeometry(rafterWidth, rafterDepth, rafterLength);
            const barNorth = new THREE.Mesh(barGeoN, gypsumMat);
            barNorth.position.set(ox, rafterY, -rafterCenterZ);
            barNorth.userData.isCeilingSoffit = true;
            this.ceilingGroup.add(barNorth);

            // Mini recessed spot on North rafter bar
            const spotGroupN = new THREE.Group();
            spotGroupN.position.set(ox, height - rafterDepth - 0.004, -rafterCenterZ);
            spotGroupN.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 16), spotRingMat));
            spotGroupN.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 16), spotLensMat));
            this.ceilingGroup.add(spotGroupN);

            // South side symmetric rafter bar
            const barGeoS = new THREE.BoxGeometry(rafterWidth, rafterDepth, rafterLength);
            const barSouth = new THREE.Mesh(barGeoS, gypsumMat);
            barSouth.position.set(ox, rafterY, rafterCenterZ);
            barSouth.userData.isCeilingSoffit = true;
            this.ceilingGroup.add(barSouth);

            // Mini recessed spot on South rafter bar
            const spotGroupS = new THREE.Group();
            spotGroupS.position.set(ox, height - rafterDepth - 0.004, rafterCenterZ);
            spotGroupS.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 16), spotRingMat));
            spotGroupS.add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.01, 16), spotLensMat));
            this.ceilingGroup.add(spotGroupS);
        });

        // --- 6. Center Fixture: Modern 3-Blade White Ceiling Fan ---
        this.buildModernCeilingFan(height);
    }

    buildModernCeilingFan(height, fanColorHex = '#1c1c1c') {
        const fanGroup = new THREE.Group();
        fanGroup.position.set(0, height + 0.01, 0);

        const fanColor = new THREE.Color(fanColorHex);
        const fanMat = new THREE.MeshStandardMaterial({ color: fanColor, roughness: 0.38, metalness: 0.15 });
        const accentRingMat = new THREE.MeshBasicMaterial({ color: 0xfff8ee }); // Warm white LED ring on motor
        const rodColor = (fanColorHex === '#ffffff' || fanColorHex === '#fcfcfc') ? 0xeeeeee : 0x222222;
        const rodMat = new THREE.MeshStandardMaterial({ color: rodColor, roughness: 0.3, metalness: 0.5 });

        // Ceiling canopy
        const canopyGeo = new THREE.CylinderGeometry(0.07, 0.05, 0.06, 24);
        const canopy = new THREE.Mesh(canopyGeo, fanMat);
        canopy.position.set(0, -0.03, 0);
        fanGroup.add(canopy);

        // Downrod
        const downrodLen = 0.34;
        const rodGeo = new THREE.CylinderGeometry(0.014, 0.014, downrodLen, 16);
        const rod = new THREE.Mesh(rodGeo, rodMat);
        rod.position.set(0, -0.03 - downrodLen / 2, 0);
        fanGroup.add(rod);

        // Motor housing
        const motorY = -0.03 - downrodLen - 0.04;
        const motorGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.08, 32);
        const motor = new THREE.Mesh(motorGeo, fanMat);
        motor.position.set(0, motorY, 0);
        fanGroup.add(motor);

        // Integrated accent LED ring on motor bottom
        const ledRingGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.015, 24);
        const ledRing = new THREE.Mesh(ledRingGeo, accentRingMat);
        ledRing.position.set(0, motorY - 0.045, 0);
        fanGroup.add(ledRing);

        // Rotating Blade Assembly
        const bladesGroup = new THREE.Group();
        bladesGroup.position.set(0, motorY, 0);

        const bladeCount = 3;
        const bladeLen = 0.52;
        const bladeWidth = 0.12;
        for (let i = 0; i < bladeCount; i++) {
            const angle = (i * Math.PI * 2) / bladeCount;
            const bladeArm = new THREE.Group();
            bladeArm.rotation.y = angle;

            // Blade holder arm
            const armGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.08, 12);
            armGeo.rotateZ(Math.PI / 2);
            const arm = new THREE.Mesh(armGeo, rodMat);
            arm.position.set(0.10, 0, 0);
            bladeArm.add(arm);

            // Aerodynamic Blade
            const bladeGeo = new THREE.BoxGeometry(bladeLen, 0.008, bladeWidth);
            const blade = new THREE.Mesh(bladeGeo, fanMat);
            blade.position.set(0.10 + bladeLen / 2, 0, 0);
            blade.rotation.x = 0.12; // Aerodynamic pitch angle
            bladeArm.add(blade);

            bladesGroup.add(bladeArm);
        }

        fanGroup.add(bladesGroup);
        this.ceilingFanBlades = bladesGroup; // Reference for gentle continuous spin in animation loop!

        this.ceilingGroup.add(fanGroup);
    }

    buildModernFalseCeiling(width, length, height, options = {}) {
        const opts = (typeof options === 'string') ? { coveColor: options } : (options || {});
        const dropDepth = 0.16; // 16cm step drop
        const borderWidth = Math.max(0.35, Math.min(0.55, Math.min(width, length) * 0.16));
        const soffitY = height - dropDepth / 2;

        const trayColorHex = opts.trayColor;
        if (trayColorHex && this.ceilingUpperMesh) {
            this.ceilingUpperMesh.material = new THREE.MeshStandardMaterial({
                color: new THREE.Color(trayColorHex),
                roughness: 0.88,
                side: THREE.DoubleSide
            });
        }

        const soffitMat = this.ceilingMaterial;
        const coveColorHex = opts.coveColor || '#ffd54f';
        const coveColor = new THREE.Color(coveColorHex);
        const coveGlowMat = new THREE.MeshBasicMaterial({ color: coveColor }); // Warm golden LED cove strip
        const spotRingMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.3 });
        const spotLensMat = new THREE.MeshBasicMaterial({ color: 0xfffcf0 }); // Emissive spot lens

        const makeSoffit = (geo) => {
            const m = new THREE.Mesh(geo, soffitMat);
            m.userData.isCeilingSoffit = true;
            return m;
        };

        // --- 1. Dropped Soffit Perimeter Beams ---
        // North beam
        const northSoffit = makeSoffit(new THREE.BoxGeometry(width, dropDepth, borderWidth));
        northSoffit.position.set(0, soffitY, -length / 2 + borderWidth / 2);
        this.ceilingGroup.add(northSoffit);

        // South beam
        const southSoffit = makeSoffit(new THREE.BoxGeometry(width, dropDepth, borderWidth));
        southSoffit.position.set(0, soffitY, length / 2 - borderWidth / 2);
        this.ceilingGroup.add(southSoffit);

        // East beam
        const sideLength = Math.max(0.1, length - borderWidth * 2);
        const eastSoffit = makeSoffit(new THREE.BoxGeometry(borderWidth, dropDepth, sideLength));
        eastSoffit.position.set(width / 2 - borderWidth / 2, soffitY, 0);
        this.ceilingGroup.add(eastSoffit);

        // West beam
        const westSoffit = makeSoffit(new THREE.BoxGeometry(borderWidth, dropDepth, sideLength));
        westSoffit.position.set(-width / 2 + borderWidth / 2, soffitY, 0);
        this.ceilingGroup.add(westSoffit);

        // --- 2. Hidden Warm Golden LED Cove Strips & Glow ---
        const stripHeight = 0.025;
        const stripThick = 0.015;
        const coveY = height - 0.02;
        const innerW = width - borderWidth * 2;
        const innerL = length - borderWidth * 2;

        if (innerW > 0.4 && innerL > 0.4) {
            // North cove strip
            const cNorth = new THREE.Mesh(new THREE.BoxGeometry(innerW, stripHeight, stripThick), coveGlowMat);
            cNorth.position.set(0, coveY, -innerL / 2 + stripThick / 2);
            this.ceilingGroup.add(cNorth);

            // South cove strip
            const cSouth = new THREE.Mesh(new THREE.BoxGeometry(innerW, stripHeight, stripThick), coveGlowMat);
            cSouth.position.set(0, coveY, innerL / 2 - stripThick / 2);
            this.ceilingGroup.add(cSouth);

            // East cove strip
            const cEast = new THREE.Mesh(new THREE.BoxGeometry(stripThick, stripHeight, innerL), coveGlowMat);
            cEast.position.set(innerW / 2 - stripThick / 2, coveY, 0);
            this.ceilingGroup.add(cEast);

            // West cove strip
            const cWest = new THREE.Mesh(new THREE.BoxGeometry(stripThick, stripHeight, innerL), coveGlowMat);
            cWest.position.set(-innerW / 2 + stripThick / 2, coveY, 0);
            this.ceilingGroup.add(cWest);

            // Warm ambient cove lights washing across the upper ceiling
            const coveLight1 = new THREE.PointLight(coveColor, 0.9, 4.0);
            coveLight1.position.set(0, coveY, -innerL / 3);
            this.ceilingGroup.add(coveLight1);

            const coveLight2 = new THREE.PointLight(coveColor, 0.9, 4.0);
            coveLight2.position.set(0, coveY, innerL / 3);
            this.ceilingGroup.add(coveLight2);
        }

        // --- 3. Circular Recessed LED Spotlights / Pot Lights ---
        const spotY = height - dropDepth - 0.005;
        const addSpotlight = (x, z) => {
            const spotGroup = new THREE.Group();
            spotGroup.position.set(x, spotY, z);

            const ringGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.01, 16);
            const ring = new THREE.Mesh(ringGeo, spotRingMat);
            spotGroup.add(ring);

            const lensGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16);
            const lens = new THREE.Mesh(lensGeo, spotLensMat);
            spotGroup.add(lens);

            this.ceilingGroup.add(spotGroup);
        };

        // Distribute spots along North & South borders
        const numSpotsX = Math.max(2, Math.floor(width / 1.6));
        const stepX = (width - borderWidth * 2.2) / (numSpotsX - 1 || 1);
        const startX = -(width - borderWidth * 2.2) / 2;
        for (let i = 0; i < numSpotsX; i++) {
            const x = startX + i * stepX;
            addSpotlight(x, -length / 2 + borderWidth / 2); // North
            addSpotlight(x, length / 2 - borderWidth / 2);  // South
        }

        // Distribute spots along East & West borders
        const numSpotsZ = Math.max(2, Math.floor(length / 1.8));
        const stepZ = (length - borderWidth * 2.5) / (numSpotsZ + 1 || 1);
        const startZ = -(length - borderWidth * 2.5) / 2;
        for (let j = 1; j <= numSpotsZ; j++) {
            const z = startZ + j * stepZ;
            addSpotlight(width / 2 - borderWidth / 2, z);  // East
            addSpotlight(-width / 2 + borderWidth / 2, z); // West
        }

        // --- 4. Central Fixture (Fan or Chandelier based on blueprint/photo) ---
        if (opts.fixture === 'ceiling_fan') {
            this.buildModernCeilingFan(height);
        } else if (opts.fixture !== 'spots_only') {
            this.buildModernPendantChandelier(height);
        }
    }

    buildCofferedCeiling(width, length, height, options = {}) {
        const opts = (typeof options === 'string') ? { coveColor: options } : (options || {});
        const beamDepth = 0.12;
        const beamWidth = 0.12;
        const beamY = height - beamDepth / 2;
        const beamMat = this.ceilingMaterial;

        const makeBeam = (w, h, d, x, y, z) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), beamMat);
            mesh.position.set(x, y, z);
            mesh.userData.isCeilingSoffit = true;
            this.ceilingGroup.add(mesh);
        };

        // Perimeter frame
        makeBeam(width, beamDepth, beamWidth, 0, beamY, -length / 2 + beamWidth / 2);
        makeBeam(width, beamDepth, beamWidth, 0, beamY, length / 2 - beamWidth / 2);
        makeBeam(beamWidth, beamDepth, length, -width / 2 + beamWidth / 2, beamY, 0);
        makeBeam(beamWidth, beamDepth, length, width / 2 - beamWidth / 2, beamY, 0);

        // 2 longitudinal interior beams along Z
        const numBeamsX = 2;
        const stepX = (width - beamWidth * 2) / (numBeamsX + 1);
        for (let i = 1; i <= numBeamsX; i++) {
            const x = -width / 2 + beamWidth + i * stepX;
            makeBeam(beamWidth, beamDepth, length - beamWidth * 2, x, beamY, 0);
        }

        // 2 transverse interior beams along X
        const numBeamsZ = 2;
        const stepZ = (length - beamWidth * 2) / (numBeamsZ + 1);
        for (let j = 1; j <= numBeamsZ; j++) {
            const z = -length / 2 + beamWidth + j * stepZ;
            makeBeam(width - beamWidth * 2, beamDepth, beamWidth, 0, beamY, z);
        }

        // Soft ambient warm light
        const cofferLight = new THREE.PointLight(0xffedd0, 1.2, 8);
        cofferLight.position.set(0, height - 0.25, 0);
        this.ceilingGroup.add(cofferLight);

        if (opts.fixture === 'ceiling_fan') {
            this.buildModernCeilingFan(height, '#1c1c1c');
        } else if (opts.fixture !== 'spots_only') {
            this.buildModernPendantChandelier(height);
        }
    }

    buildWoodenSlatsCeiling(width, length, height, options = {}) {
        const opts = (typeof options === 'string') ? { coveColor: options } : (options || {});
        const slatMat = new THREE.MeshStandardMaterial({ color: 0x825438, roughness: 0.75 }); // Rich oak wood
        const ledStripMat = new THREE.MeshBasicMaterial({ color: 0xfff0dd }); // Bright warm white LED
        const slatThickness = 0.05;
        const slatDepth = 0.07;
        const slatSpacing = 0.18;
        const slatY = height - slatDepth / 2;

        const numSlats = Math.floor(width / slatSpacing);
        const startX = -(numSlats - 1) * slatSpacing / 2;

        for (let i = 0; i < numSlats; i++) {
            const x = startX + i * slatSpacing;
            const slatGeo = new THREE.BoxGeometry(slatThickness, slatDepth, length);
            const slatMesh = new THREE.Mesh(slatGeo, slatMat);
            slatMesh.position.set(x, slatY, 0);
            this.ceilingGroup.add(slatMesh);
        }

        // 2 Linear LED light strips running along length embedded between slats
        const stripOffsets = [-width * 0.22, width * 0.22];
        stripOffsets.forEach(sx => {
            const ledGeo = new THREE.BoxGeometry(0.02, 0.015, length * 0.85);
            const ledMesh = new THREE.Mesh(ledGeo, ledStripMat);
            ledMesh.position.set(sx, height - slatDepth - 0.005, 0);
            this.ceilingGroup.add(ledMesh);

            const linearLight = new THREE.PointLight(0xfff3e0, 1.1, 6.5);
            linearLight.position.set(sx, height - 0.2, 0);
            this.ceilingGroup.add(linearLight);
        });

        if (opts.fixture === 'ceiling_fan') {
            this.buildModernCeilingFan(height, '#1c1c1c');
        } else if (opts.fixture !== 'spots_only') {
            this.buildModernPendantChandelier(height);
        }
    }

    buildFloatingIslandCeiling(width, length, height, options = {}) {
        const opts = (typeof options === 'string') ? { coveColor: options } : (options || {});
        const coveColorHex = opts.coveColor || '#ffd27d';
        const innerCoveColorHex = opts.innerCoveColor || coveColorHex;
        const trayColorHex = opts.trayColor || '#f6f6f2';
        const fixtureType = opts.fixture || 'ceiling_fan';

        // 1. Tint Base Upper Ceiling Plane with clean tray color
        if (this.ceilingUpperMesh) {
            this.ceilingUpperMesh.material = new THREE.MeshStandardMaterial({
                color: new THREE.Color(trayColorHex),
                roughness: 0.88,
                side: THREE.DoubleSide
            });
        }

        const dropDepth = 0.15; // 15cm perimeter step drop
        const borderWidth = Math.max(0.35, Math.min(0.52, Math.min(width, length) * 0.14));
        const soffitY = height - dropDepth / 2;

        const gypsumMat = new THREE.MeshStandardMaterial({
            color: 0xfcfcfc,
            roughness: 0.45,
            metalness: 0.05,
            side: THREE.DoubleSide
        });
        const spotRingMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 });
        const spotLensMat = new THREE.MeshBasicMaterial({ color: 0xfffcf0 });

        const makeSoffit = (geo) => {
            const m = new THREE.Mesh(geo, gypsumMat);
            m.userData.isCeilingSoffit = true;
            return m;
        };

        // 2. Outer Perimeter Dropped Gypsum False Ceiling (Soffits)
        // North beam
        const northSoffit = makeSoffit(new THREE.BoxGeometry(width, dropDepth, borderWidth));
        northSoffit.position.set(0, soffitY, -length / 2 + borderWidth / 2);
        this.ceilingGroup.add(northSoffit);

        // South beam
        const southSoffit = makeSoffit(new THREE.BoxGeometry(width, dropDepth, borderWidth));
        southSoffit.position.set(0, soffitY, length / 2 - borderWidth / 2);
        this.ceilingGroup.add(southSoffit);

        // East beam
        const sideLength = Math.max(0.1, length - borderWidth * 2);
        const eastSoffit = makeSoffit(new THREE.BoxGeometry(borderWidth, dropDepth, sideLength));
        eastSoffit.position.set(width / 2 - borderWidth / 2, soffitY, 0);
        this.ceilingGroup.add(eastSoffit);

        // West beam
        const westSoffit = makeSoffit(new THREE.BoxGeometry(borderWidth, dropDepth, sideLength));
        westSoffit.position.set(-width / 2 + borderWidth / 2, soffitY, 0);
        this.ceilingGroup.add(westSoffit);

        // Outer Cove LED Glow along perimeter soffits
        const stripHeight = 0.025;
        const stripThick = 0.015;
        const coveY = height - 0.02;
        const innerW = width - borderWidth * 2;
        const innerL = length - borderWidth * 2;
        const outerCoveGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(coveColorHex) });

        if (innerW > 0.4 && innerL > 0.4) {
            const cNorth = new THREE.Mesh(new THREE.BoxGeometry(innerW, stripHeight, stripThick), outerCoveGlowMat);
            cNorth.position.set(0, coveY, -innerL / 2 + stripThick / 2);
            this.ceilingGroup.add(cNorth);

            const cSouth = new THREE.Mesh(new THREE.BoxGeometry(innerW, stripHeight, stripThick), outerCoveGlowMat);
            cSouth.position.set(0, coveY, innerL / 2 - stripThick / 2);
            this.ceilingGroup.add(cSouth);

            const cEast = new THREE.Mesh(new THREE.BoxGeometry(stripThick, stripHeight, innerL), outerCoveGlowMat);
            cEast.position.set(innerW / 2 - stripThick / 2, coveY, 0);
            this.ceilingGroup.add(cEast);

            const cWest = new THREE.Mesh(new THREE.BoxGeometry(stripThick, stripHeight, innerL), outerCoveGlowMat);
            cWest.position.set(-innerW / 2 + stripThick / 2, coveY, 0);
            this.ceilingGroup.add(cWest);

            // Perimeter warm light wash
            const coveLight1 = new THREE.PointLight(new THREE.Color(coveColorHex), 0.8, 5.0);
            coveLight1.position.set(0, coveY, -innerL / 3);
            this.ceilingGroup.add(coveLight1);

            const coveLight2 = new THREE.PointLight(new THREE.Color(coveColorHex), 0.8, 5.0);
            coveLight2.position.set(0, coveY, innerL / 3);
            this.ceilingGroup.add(coveLight2);
        }

        // Perimeter recessed pot lights (spotlights)
        const spotY = height - dropDepth - 0.005;
        const addSpotlight = (x, z) => {
            const spotGroup = new THREE.Group();
            spotGroup.position.set(x, spotY, z);
            spotGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 16), spotRingMat));
            spotGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 16), spotLensMat));
            this.ceilingGroup.add(spotGroup);
        };
        const numSpotsX = Math.max(2, Math.floor(width / 1.5));
        const stepX = (width - borderWidth * 2.2) / (numSpotsX - 1 || 1);
        const startX = -(width - borderWidth * 2.2) / 2;
        for (let i = 0; i < numSpotsX; i++) {
            const x = startX + i * stepX;
            addSpotlight(x, -length / 2 + borderWidth / 2);
            addSpotlight(x, length / 2 - borderWidth / 2);
        }
        const numSpotsZ = Math.max(2, Math.floor(length / 1.8));
        const stepZ = (length - borderWidth * 2.5) / (numSpotsZ + 1 || 1);
        const startZ = -(length - borderWidth * 2.5) / 2;
        for (let j = 1; j <= numSpotsZ; j++) {
            const z = startZ + j * stepZ;
            addSpotlight(width / 2 - borderWidth / 2, z);
            addSpotlight(-width / 2 + borderWidth / 2, z);
        }

        // 3. Central Suspended Wooden Floating Island Panel with Inner Stadium Cutout
        const islandW = Math.max(1.8, Math.min(width - borderWidth * 2.4, width * 0.62));
        const islandL = Math.max(2.2, Math.min(length - borderWidth * 2.4, length * 0.68));
        const islandThick = 0.12;
        const islandRadius = 0.08; // soft outer corners

        // Inner rounded stadium cutout
        const cutoutW = islandW * 0.54;
        const cutoutL = islandL * 0.58;
        const cutoutRadius = Math.min(cutoutW, cutoutL) * 0.22; // rounded stadium corners

        const halfW = islandW / 2;
        const halfL = islandL / 2;
        const r = islandRadius;

        // Outer shape (counter-clockwise)
        const islandShape = new THREE.Shape();
        islandShape.moveTo(-halfW + r, -halfL);
        islandShape.lineTo(halfW - r, -halfL);
        islandShape.absarc(halfW - r, -halfL + r, r, -Math.PI / 2, 0, false);
        islandShape.lineTo(halfW, halfL - r);
        islandShape.absarc(halfW - r, halfL - r, r, 0, Math.PI / 2, false);
        islandShape.lineTo(-halfW + r, halfL);
        islandShape.absarc(-halfW + r, halfL - r, r, Math.PI / 2, Math.PI, false);
        islandShape.lineTo(-halfW, -halfL + r);
        islandShape.absarc(-halfW + r, -halfL + r, r, Math.PI, Math.PI * 1.5, false);

        // Inner hole (clockwise)
        const innerHalfW = cutoutW / 2;
        const innerHalfL = cutoutL / 2;
        const ir = cutoutRadius;
        const islandHole = new THREE.Path();
        islandHole.moveTo(-innerHalfW, -innerHalfL + ir);
        islandHole.lineTo(-innerHalfW, innerHalfL - ir);
        islandHole.absarc(-innerHalfW + ir, innerHalfL - ir, ir, Math.PI, Math.PI / 2, true);
        islandHole.lineTo(innerHalfW - ir, innerHalfL);
        islandHole.absarc(innerHalfW - ir, innerHalfL - ir, ir, Math.PI / 2, 0, true);
        islandHole.lineTo(innerHalfW, -innerHalfL + ir);
        islandHole.absarc(innerHalfW - ir, -innerHalfL + ir, ir, 0, -Math.PI / 2, true);
        islandHole.lineTo(-innerHalfW + ir, -innerHalfL);
        islandHole.absarc(-innerHalfW + ir, -innerHalfL + ir, ir, -Math.PI / 2, -Math.PI, true);
        islandShape.holes.push(islandHole);

        const islandExtrudeSettings = {
            depth: islandThick,
            bevelEnabled: true,
            bevelSegments: 3,
            steps: 1,
            bevelSize: 0.012,
            bevelThickness: 0.012,
            curveSegments: 32
        };
        const islandGeo = new THREE.ExtrudeGeometry(islandShape, islandExtrudeSettings);
        islandGeo.rotateX(Math.PI / 2);

        // Warm architectural teak / walnut wood finish for the island
        const woodIslandMat = new THREE.MeshStandardMaterial({
            color: 0x7a5b42,
            roughness: 0.62,
            metalness: 0.05,
            side: THREE.DoubleSide
        });
        const islandMesh = new THREE.Mesh(islandGeo, woodIslandMat);
        islandMesh.position.set(0, height, 0);
        islandMesh.userData.isCeilingSoffit = true;
        this.ceilingGroup.add(islandMesh);

        // 4. Backlight Halo around Island Outer Perimeter (washing onto base ceiling)
        const haloGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(coveColorHex), side: THREE.DoubleSide });
        const haloY = height - 0.02;
        const hNorth = new THREE.Mesh(new THREE.BoxGeometry(islandW * 0.95, 0.02, 0.02), haloGlowMat);
        hNorth.position.set(0, haloY, -islandL / 2 + 0.03);
        this.ceilingGroup.add(hNorth);
        const hSouth = new THREE.Mesh(new THREE.BoxGeometry(islandW * 0.95, 0.02, 0.02), haloGlowMat);
        hSouth.position.set(0, haloY, islandL / 2 - 0.03);
        this.ceilingGroup.add(hSouth);
        const hEast = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, islandL * 0.95), haloGlowMat);
        hEast.position.set(islandW / 2 - 0.03, haloY, 0);
        this.ceilingGroup.add(hEast);
        const hWest = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, islandL * 0.95), haloGlowMat);
        hWest.position.set(-islandW / 2 + 0.03, haloY, 0);
        this.ceilingGroup.add(hWest);

        // 5. Inner Stadium Hidden Cove LED Strip & Ambient Warm Glow
        const innerCoveMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(innerCoveColorHex), side: THREE.DoubleSide });
        const innerCoveY = height - islandThick + 0.02;
        // Inner cove strips along 4 sides of the cutout
        const icNorth = new THREE.Mesh(new THREE.BoxGeometry(cutoutW - ir, 0.025, 0.015), innerCoveMat);
        icNorth.position.set(0, innerCoveY, -innerHalfL + 0.01);
        this.ceilingGroup.add(icNorth);

        const icSouth = new THREE.Mesh(new THREE.BoxGeometry(cutoutW - ir, 0.025, 0.015), innerCoveMat);
        icSouth.position.set(0, innerCoveY, innerHalfL - 0.01);
        this.ceilingGroup.add(icSouth);

        const icEast = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.025, cutoutL - ir), innerCoveMat);
        icEast.position.set(innerHalfW - 0.01, innerCoveY, 0);
        this.ceilingGroup.add(icEast);

        const icWest = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.025, cutoutL - ir), innerCoveMat);
        icWest.position.set(-innerHalfW + 0.01, innerCoveY, 0);
        this.ceilingGroup.add(icWest);

        // Luxurious warm inner cove point light casting glow into the recessed tray
        const innerPointLight = new THREE.PointLight(new THREE.Color(innerCoveColorHex), 1.4, 4.0);
        innerPointLight.position.set(0, innerCoveY - 0.02, 0);
        this.ceilingGroup.add(innerPointLight);

        // 6. Dual Embedded Black Linear Magnetic Track Lights
        const trackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35, metalness: 0.8 });
        const miniLensMat = new THREE.MeshBasicMaterial({ color: 0xfff5ea });
        const trackXOffset = (islandW / 2 + cutoutW / 2) / 2; // centered on the wood panel margins
        const trackLength = cutoutL * 0.95;
        const trackY = height - islandThick - 0.006;

        [-trackXOffset, trackXOffset].forEach(tx => {
            // Track rail channel
            const railGeo = new THREE.BoxGeometry(0.035, 0.012, trackLength);
            const rail = new THREE.Mesh(railGeo, trackMat);
            rail.position.set(tx, trackY, 0);
            this.ceilingGroup.add(rail);

            // Integrated mini spotlight heads along the rail
            const numMiniSpots = 3;
            const spotStepZ = (trackLength * 0.7) / (numMiniSpots - 1);
            const startSpotZ = -(trackLength * 0.7) / 2;
            for (let k = 0; k < numMiniSpots; k++) {
                const sz = startSpotZ + k * spotStepZ;
                const spotHead = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 12), trackMat);
                spotHead.position.set(tx, trackY - 0.018, sz);
                this.ceilingGroup.add(spotHead);

                const spotLens = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.005, 12), miniLensMat);
                spotLens.position.set(tx, trackY - 0.034, sz);
                this.ceilingGroup.add(spotLens);
            }
        });

        // 7. Central Fixture: Modern Matte Black 3-Blade Ceiling Fan (Matching Photo!)
        if (fixtureType === 'ceiling_fan') {
            this.buildModernCeilingFan(height, '#1c1c1c');
        } else if (fixtureType === 'chandelier') {
            this.buildModernPendantChandelier(height);
        }
    }

    buildMinimalSpotsCeiling(width, length, height) {
        const spotRingMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.3 });
        const spotLensMat = new THREE.MeshBasicMaterial({ color: 0xfffcf0 });
        const spotY = height + 0.005;

        // 2x3 grid of flush downlights
        const gridX = [-width * 0.3, 0, width * 0.3];
        const gridZ = [-length * 0.28, length * 0.28];

        gridX.forEach(gx => {
            gridZ.forEach(gz => {
                const spotGroup = new THREE.Group();
                spotGroup.position.set(gx, spotY, gz);
                spotGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 16), spotRingMat));
                spotGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.012, 16), spotLensMat));
                this.ceilingGroup.add(spotGroup);

                const spotLight = new THREE.PointLight(0xfff5ea, 0.8, 4.0);
                spotLight.position.set(gx, height - 0.1, gz);
                this.ceilingGroup.add(spotLight);
            });
        });

        this.buildModernPendantChandelier(height);
    }

    buildModernPendantChandelier(height) {
        const chandelierGroup = new THREE.Group();
        chandelierGroup.position.set(0, height + 0.02, 0);

        const darkMetal = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.2 });
        const brassMat = new THREE.MeshStandardMaterial({ color: 0xcca050, metalness: 0.8, roughness: 0.3 });
        const glassMat = new THREE.MeshPhysicalMaterial({ 
            color: 0xfff2df, 
            transparent: true, 
            opacity: 0.65, 
            roughness: 0.08, 
            transmission: 0.8,
            ior: 1.5
        });
        const filamentMat = new THREE.MeshBasicMaterial({ color: 0xffe6aa });

        // 1. Black circular ceiling mount
        const canopyGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.02, 24);
        const canopy = new THREE.Mesh(canopyGeo, darkMetal);
        chandelierGroup.add(canopy);

        // 2. Three staggered teardrop pendant drops (matching the photo)
        const drops = [
            { angle: 0, rad: 0.08, dropLen: 0.55 },
            { angle: (2 * Math.PI) / 3, rad: 0.09, dropLen: 0.70 },
            { angle: (4 * Math.PI) / 3, rad: 0.08, dropLen: 0.62 }
        ];

        drops.forEach(({ angle, rad, dropLen }) => {
            const px = Math.cos(angle) * rad;
            const pz = Math.sin(angle) * rad;

            // Cord
            const cordGeo = new THREE.CylinderGeometry(0.003, 0.003, dropLen, 8);
            const cord = new THREE.Mesh(cordGeo, darkMetal);
            cord.position.set(px, -dropLen / 2, pz);
            chandelierGroup.add(cord);

            // Brass socket cap
            const capGeo = new THREE.CylinderGeometry(0.022, 0.025, 0.04, 16);
            const cap = new THREE.Mesh(capGeo, brassMat);
            cap.position.set(px, -dropLen - 0.02, pz);
            chandelierGroup.add(cap);

            // Teardrop glass shade
            const glassGeo = new THREE.SphereGeometry(0.09, 18, 18);
            glassGeo.scale(1.0, 1.35, 1.0); // Elongated teardrop
            const glassShade = new THREE.Mesh(glassGeo, glassMat);
            glassShade.position.set(px, -dropLen - 0.12, pz);
            chandelierGroup.add(glassShade);

            // Glowing bulb inside
            const bulbGeo = new THREE.SphereGeometry(0.032, 12, 12);
            const bulb = new THREE.Mesh(bulbGeo, filamentMat);
            bulb.position.set(px, -dropLen - 0.12, pz);
            chandelierGroup.add(bulb);
        });

        // Warm ambient light emitted from chandelier
        const centerLight = new THREE.PointLight(0xffe0a3, 1.4, 7.5);
        centerLight.position.set(0, -0.65, 0);
        chandelierGroup.add(centerLight);

        this.ceilingGroup.add(chandelierGroup);
    }

    // Helper to load and place a realistic 3D model (.glb)
    loadModel(url, position, rotation, scale = 1.0) {
        // Check if we already loaded it to save bandwidth
        if (this.loadedModels[url]) {
            const clone = this.loadedModels[url].scene.clone();
            clone.position.copy(position);
            clone.rotation.set(rotation.x, rotation.y, rotation.z);
            clone.scale.set(scale, scale, scale);
            this.roomGroup.add(clone);
            return;
        }

        this.gltfLoader.load(url, (gltf) => {
            this.loadedModels[url] = gltf; // Cache it
            const model = gltf.scene;
            model.position.copy(position);
            model.rotation.set(rotation.x, rotation.y, rotation.z);
            model.scale.set(scale, scale, scale);
            this.roomGroup.add(model);
        }, undefined, (error) => {
            console.error(`Failed to load realistic model from ${url}`, error);
        });
    }

    setCeilingVisible(visible) {
        if (this.ceilingGroup) {
            this.ceilingGroup.visible = visible;
        } else if (this.meshes && this.meshes.ceiling) {
            this.meshes.ceiling.visible = visible;
        }
    }

    saveUserTransform(id, obj) {
        if (!id || !obj) return;
        if (!this.savedUserTransforms) this.savedUserTransforms = {};
        this.savedUserTransforms[id] = {
            position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
            rotation: { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
            userMoved: true
        };
    }

    applyTransformIfSaved(obj, id) {
        if (!obj || !id || !this.savedUserTransforms) return false;
        const saved = this.savedUserTransforms[id];
        if (!saved || !saved.userMoved) return false;

        if (saved.rotation) {
            obj.rotation.set(saved.rotation.x, saved.rotation.y, saved.rotation.z);
        }

        if (saved.position) {
            let px = saved.position.x;
            let py = saved.position.y;
            let pz = saved.position.z;

            const isWall = !!(obj.userData && obj.userData.isWallItem);
            const margin = isWall ? 0.04 : 0.25;
            const roomW = this.currentRoomWidth || 4;
            const roomL = this.currentRoomLength || 5;
            const roomH = this.currentRoomHeight || 2.8;

            const limitX = (roomW / 2) - margin;
            const limitZ = (roomL / 2) - margin;
            px = Math.max(-limitX, Math.min(limitX, px));
            pz = Math.max(-limitZ, Math.min(limitZ, pz));

            if (isWall) {
                py = Math.max(0.35, Math.min(roomH - 0.25, py));
            }
            obj.position.set(px, py, pz);
        }

        obj.userData.userTransformed = true;
        return true;
    }

    clearSavedTransforms() {
        this.savedUserTransforms = {};
    }

    // Advanced Helper: Loads a realistic model and dynamically squishes/stretches it to fit exact parametric dimensions
    async loadDynamicModel(url, position, rotation, targetWidth, targetHeight, targetDepth, parentGroup = this.roomGroup, furnitureId = null, name = null) {
        if (!this.modelPromises) this.modelPromises = {};
        
        if (!this.modelPromises[url]) {
            this.modelPromises[url] = new Promise((resolve, reject) => {
                this.gltfLoader.load(url, (gltf) => {
                    resolve(gltf.scene);
                }, undefined, reject);
            });
        }

        try {
            const originalScene = await this.modelPromises[url];
            const model = originalScene.clone(); // Re-use geometry and materials
            
            // 1. Reset scale and rotation to compute true bounding box
            model.scale.set(1, 1, 1);
            model.rotation.set(0, 0, 0);
            
            // 2. Compute the original bounding box of the imported 3D model
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            
            // Prevent division by zero
            if (size.x === 0) size.x = 1;
            if (size.y === 0) size.y = 1;
            if (size.z === 0) size.z = 1;

            // 3. Calculate dynamic scale factors to force it into our parametric dimensions
            const scaleX = targetWidth / size.x;
            const scaleY = targetHeight / size.y;
            const scaleZ = targetDepth / size.z;
            
            // 4. Apply the dynamic scaling
            model.scale.set(scaleX, scaleY, scaleZ);
            
            // 5. Apply intended rotation and position
            model.rotation.set(rotation.x, rotation.y, rotation.z);
            model.position.copy(position);
            if (!parentGroup || parentGroup === this.roomGroup) {
                model.userData.isDraggable = true;
            }
            if (name) model.userData.name = name;
            if (furnitureId) {
                model.userData.furnitureId = furnitureId;
                this.applyTransformIfSaved(model, furnitureId);
            }
            (parentGroup || this.roomGroup).add(model);
        } catch (error) {
            console.error(`Failed to dynamically load model from ${url}`, error);
        }
    }

    buildWallSection(wallKey, wallSpan, height, cutout) {
        const wallGroup = new THREE.Group();
        const mat = this.wallMaterials[wallKey] || this.wallMaterial;

        // If no cutout, build a single solid wall panel
        if (!cutout || cutout.width <= 0.05 || cutout.height <= 0.05) {
            const geo = new THREE.PlaneGeometry(wallSpan, height);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(0, height / 2, 0);
            mesh.userData.isWallPatch = true;
            wallGroup.add(mesh);
            return wallGroup;
        }

        // We have a cutout: subdivide into 4 seamless planar patches (left, right, bottom sill, top header)
        const uMin = Math.max(-wallSpan / 2, cutout.centerU - cutout.width / 2);
        const uMax = Math.min(wallSpan / 2, cutout.centerU + cutout.width / 2);
        const vMin = Math.max(0, cutout.bottomY);
        const vMax = Math.min(height, cutout.bottomY + cutout.height);

        const createPatch = (u0, u1, v0, v1) => {
            const w = u1 - u0;
            const h = v1 - v0;
            if (w < 0.005 || h < 0.005) return null;

            const geo = new THREE.PlaneGeometry(w, h);
            // Seamlessly normalize UVs to map the whole wall canvas without distortion
            const normU0 = (u0 + wallSpan / 2) / wallSpan;
            const normU1 = (u1 + wallSpan / 2) / wallSpan;
            const normV0 = v0 / height;
            const normV1 = v1 / height;

            const uv = geo.attributes.uv;
            uv.setXY(0, normU0, normV1);
            uv.setXY(1, normU1, normV1);
            uv.setXY(2, normU0, normV0);
            uv.setXY(3, normU1, normV0);
            uv.needsUpdate = true;

            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set((u0 + u1) / 2, (v0 + v1) / 2, 0);
            mesh.userData.isWallPatch = true;
            wallGroup.add(mesh);
            return mesh;
        };

        // 1. Left patch (from -wallSpan/2 to uMin)
        createPatch(-wallSpan / 2, uMin, 0, height);

        // 2. Right patch (from uMax to wallSpan/2)
        createPatch(uMax, wallSpan / 2, 0, height);

        // 3. Bottom sill patch (from uMin to uMax, under opening)
        if (vMin > 0.005) {
            createPatch(uMin, uMax, 0, vMin);
        }

        // 4. Top lintel / header patch (from uMin to uMax, above opening)
        if (height - vMax > 0.005) {
            createPatch(uMin, uMax, vMax, height);
        }

        return wallGroup;
    }

    buildParametricWindow(length, width, height, windowOpts = {}) {
        if (windowOpts && windowOpts.enabled === false) {
            return null;
        }

        const opts = windowOpts || {};
        let wall = (opts.wall || 'north').toLowerCase().trim();
        if (wall === 'right') wall = 'east';
        if (wall === 'left') wall = 'west';

        const style = opts.style || 'balcony_sliding';
        const wallSpan = (wall === 'north' || wall === 'south') ? width : length;

        // Auto-resizing parametric scale calculation
        const scalePreset = opts.scale || 'auto';
        let ratio = 0.70;
        if (scalePreset === 'large') ratio = 0.78;
        else if (scalePreset === 'medium') ratio = 0.55;
        else if (scalePreset === 'compact') ratio = 0.38;
        else {
            ratio = (style === 'balcony_sliding') ? 0.72 : 0.60;
        }

        let winW, winH, sillY;
        if (style === 'balcony_sliding') {
            // Floor-to-ceiling balcony sliding glass doors
            winW = Math.max(1.6, Math.min(wallSpan * ratio, wallSpan - 0.5));
            winH = Math.min(height - 0.22, height * 0.90);
            sillY = 0; // Starts right at floor level
        } else {
            // Panoramic picture window or double casement with sill
            winH = Math.max(1.1, Math.min(height * 0.52, height - 0.85));
            sillY = Math.max(0.75, (height - winH) * 0.42);
            winW = Math.max(1.2, Math.min(wallSpan * ratio, wallSpan - 0.6));
        }

        const centerU = 0; // Centered along the selected wall

        // Create the window group and orient it to the wall
        const winGroup = new THREE.Group();
        winGroup.userData.isWindowAssembly = true;

        if (wall === 'north') {
            winGroup.position.set(0, 0, -length / 2);
        } else if (wall === 'south') {
            winGroup.position.set(0, 0, length / 2);
            winGroup.rotateY(Math.PI);
        } else if (wall === 'east') {
            winGroup.position.set(width / 2, 0, 0);
            winGroup.rotateY(-Math.PI / 2);
        } else if (wall === 'west') {
            winGroup.position.set(-width / 2, 0, 0);
            winGroup.rotateY(Math.PI / 2);
        }

        // Materials
        const darkFrameMat = new THREE.MeshStandardMaterial({ 
            color: 0x202124, 
            metalness: 0.7, 
            roughness: 0.35 
        });
        const glassMat = new THREE.MeshStandardMaterial({ 
            color: 0xe8f4f8, 
            roughness: 0.05, 
            metalness: 0.15, 
            transparent: true, 
            opacity: 0.32 
        });
        const brassMat = new THREE.MeshStandardMaterial({ 
            color: 0xd4af37, 
            metalness: 0.85, 
            roughness: 0.25 
        });
        const chromeMat = new THREE.MeshStandardMaterial({ 
            color: 0xdddddd, 
            metalness: 0.9, 
            roughness: 0.15 
        });
        const sillWoodMat = new THREE.MeshStandardMaterial({ 
            color: 0x3d2b1f, 
            roughness: 0.5 
        });

        // 1. Outer Master Architectural Frame
        const frameThick = 0.045;
        const frameDepth = 0.11;
        // Left jamb
        const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(frameThick, winH, frameDepth), darkFrameMat);
        leftJamb.position.set(centerU - winW / 2 + frameThick / 2, sillY + winH / 2, 0);
        winGroup.add(leftJamb);

        // Right jamb
        const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(frameThick, winH, frameDepth), darkFrameMat);
        rightJamb.position.set(centerU + winW / 2 - frameThick / 2, sillY + winH / 2, 0);
        winGroup.add(rightJamb);

        // Top lintel / header
        const topHeader = new THREE.Mesh(new THREE.BoxGeometry(winW, frameThick, frameDepth), darkFrameMat);
        topHeader.position.set(centerU, sillY + winH - frameThick / 2, 0);
        winGroup.add(topHeader);

        // Bottom sill / threshold
        if (style === 'balcony_sliding') {
            // Recessed flush threshold track
            const threshGeo = new THREE.BoxGeometry(winW, 0.025, frameDepth + 0.04);
            const threshMesh = new THREE.Mesh(threshGeo, darkFrameMat);
            threshMesh.position.set(centerU, 0.012, 0);
            winGroup.add(threshMesh);
        } else {
            // Interior projecting window sill ledge (wood / marble)
            const sillGeo = new THREE.BoxGeometry(winW + 0.08, 0.035, 0.18);
            const sillMesh = new THREE.Mesh(sillGeo, sillWoodMat);
            sillMesh.position.set(centerU, sillY + 0.018, 0.04);
            winGroup.add(sillMesh);
        }

        // 2. Sashes and Glass Panels
        const innerW = winW - frameThick * 2;
        const innerH = winH - frameThick * (style === 'balcony_sliding' ? 1.5 : 2.0);
        const innerY = sillY + (style === 'balcony_sliding' ? 0.025 : frameThick) + innerH / 2;

        if (style === 'balcony_sliding') {
            // Modern Sliding Glass Balcony Doors
            const panelCount = (winW >= 3.2) ? 3 : 2;
            const panelW = (innerW / panelCount) + 0.025; // slight overlap at interlocks
            const sashThick = 0.035;

            for (let i = 0; i < panelCount; i++) {
                const sashGroup = new THREE.Group();
                const uPos = centerU - innerW / 2 + (i + 0.5) * (innerW / panelCount);
                // Stagger along Z track
                const zOffset = (i % 2 === 0) ? -0.022 : 0.022;
                sashGroup.position.set(uPos, innerY, zOffset);

                // Sash perimeter border (left, right, top, bottom)
                const sTop = new THREE.Mesh(new THREE.BoxGeometry(panelW, sashThick, 0.035), darkFrameMat);
                sTop.position.set(0, innerH / 2 - sashThick / 2, 0);
                sashGroup.add(sTop);

                const sBot = new THREE.Mesh(new THREE.BoxGeometry(panelW, sashThick, 0.035), darkFrameMat);
                sBot.position.set(0, -innerH / 2 + sashThick / 2, 0);
                sashGroup.add(sBot);

                const sLeft = new THREE.Mesh(new THREE.BoxGeometry(sashThick, innerH, 0.035), darkFrameMat);
                sLeft.position.set(-panelW / 2 + sashThick / 2, 0, 0);
                sashGroup.add(sLeft);

                const sRight = new THREE.Mesh(new THREE.BoxGeometry(sashThick, innerH, 0.035), darkFrameMat);
                sRight.position.set(panelW / 2 - sashThick / 2, 0, 0);
                sashGroup.add(sRight);

                // Main Glass Pane
                const glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(panelW - sashThick * 2, innerH - sashThick * 2), glassMat);
                sashGroup.add(glassMesh);

                // Add Architectural Pull Handle to the active sliding sash
                if (i === 1 || (panelCount === 3 && i === 1)) {
                    const handleGroup = new THREE.Group();
                    handleGroup.position.set(panelW / 2 - 0.055, 1.05 - innerY, 0.025);
                    const rodMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.42, 12), brassMat);
                    handleGroup.add(rodMesh);
                    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.03, 8), brassMat);
                    post1.rotation.x = Math.PI / 2;
                    post1.position.set(0, 0.16, -0.015);
                    handleGroup.add(post1);
                    const post2 = post1.clone();
                    post2.position.set(0, -0.16, -0.015);
                    handleGroup.add(post2);
                    sashGroup.add(handleGroup);
                }

                winGroup.add(sashGroup);
            }
        } else if (style === 'panoramic_picture') {
            // Modern Panoramic Picture Window with 2 slim side mullions
            const glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(innerW, innerH), glassMat);
            glassMesh.position.set(centerU, innerY, 0);
            winGroup.add(glassMesh);

            // Slim vertical architectural mullions
            for (let frac of [-0.28, 0.28]) {
                const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.03, innerH, 0.05), darkFrameMat);
                mullion.position.set(centerU + innerW * frac, innerY, 0);
                winGroup.add(mullion);
            }
        } else {
            // Double Casement Window with Transom Bar
            const glassMesh = new THREE.Mesh(new THREE.PlaneGeometry(innerW, innerH), glassMat);
            glassMesh.position.set(centerU, innerY, 0);
            winGroup.add(glassMesh);

            // Center vertical mullion
            const centerMullion = new THREE.Mesh(new THREE.BoxGeometry(0.04, innerH, 0.06), darkFrameMat);
            centerMullion.position.set(centerU, innerY, 0);
            winGroup.add(centerMullion);

            // Upper horizontal transom bar
            const transom = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.035, 0.06), darkFrameMat);
            transom.position.set(centerU, innerY + innerH * 0.25, 0);
            winGroup.add(transom);
        }

        // 3. Outdoor Balcony Terrace & Scenic Daylight View (Outside at -Z)
        if (style === 'balcony_sliding' && opts.showBalcony !== false) {
            const balconyGroup = new THREE.Group();
            const terraceW = winW + 1.2;
            const terraceDepth = 1.8;

            // Terrace Wood Planks Deck
            const deckMat = new THREE.MeshStandardMaterial({ 
                color: 0x826c59, 
                roughness: 0.85 
            });
            const deck = new THREE.Mesh(new THREE.BoxGeometry(terraceW, 0.12, terraceDepth), deckMat);
            deck.position.set(centerU, -0.06, -terraceDepth / 2);
            balconyGroup.add(deck);

            // Balcony Glass Railing
            const railH = 1.05;
            const railZ = -terraceDepth + 0.05;
            const railGlassMat = new THREE.MeshStandardMaterial({ 
                color: 0xddeeff, 
                transparent: true, 
                opacity: 0.28, 
                roughness: 0.1 
            });

            // Outer front glass panel
            const frontRailGlass = new THREE.Mesh(new THREE.BoxGeometry(terraceW - 0.1, railH - 0.1, 0.015), railGlassMat);
            frontRailGlass.position.set(centerU, railH / 2, railZ);
            balconyGroup.add(frontRailGlass);

            // Top stainless steel handrail
            const frontHandrail = new THREE.Mesh(new THREE.BoxGeometry(terraceW, 0.04, 0.04), chromeMat);
            frontHandrail.position.set(centerU, railH, railZ);
            balconyGroup.add(frontHandrail);

            // Posts
            for (let frac of [-0.48, 0, 0.48]) {
                const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, railH, 0.04), chromeMat);
                post.position.set(centerU + terraceW * frac, railH / 2, railZ);
                balconyGroup.add(post);
            }

            // Left and Right return glass railings
            for (let side of [-1, 1]) {
                const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.015, railH - 0.1, terraceDepth - 0.1), railGlassMat);
                sideGlass.position.set(centerU + side * (terraceW / 2 - 0.05), railH / 2, -terraceDepth / 2);
                balconyGroup.add(sideGlass);

                const sideHandrail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, terraceDepth), chromeMat);
                sideHandrail.position.set(centerU + side * (terraceW / 2 - 0.05), railH, -terraceDepth / 2);
                balconyGroup.add(sideHandrail);
            }

            // Modern Balcony Planter with Potted Foliage
            const planterMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
            const planter = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.35), planterMat);
            planter.position.set(centerU - terraceW / 2 + 0.6, 0.22, -terraceDepth + 0.3);
            balconyGroup.add(planter);

            // Lush Foliage Leaves
            const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d6338, roughness: 0.65 });
            for (let p = -2; p <= 2; p++) {
                const plantBlade = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.55, 5), leafMat);
                plantBlade.position.set(centerU - terraceW / 2 + 0.6 + p * 0.14, 0.55 + Math.abs(p) * 0.04, -terraceDepth + 0.3);
                plantBlade.rotation.z = p * 0.12;
                balconyGroup.add(plantBlade);
            }

            // Procedural Sunny Sky & Horizon Backdrop Canvas
            const skyCanvas = document.createElement('canvas');
            skyCanvas.width = 512;
            skyCanvas.height = 256;
            const sCtx = skyCanvas.getContext('2d');
            const skyGrad = sCtx.createLinearGradient(0, 0, 0, 256);
            skyGrad.addColorStop(0, '#589fff');   // Vivid clear azure blue sky
            skyGrad.addColorStop(0.55, '#c8e2fb'); // Soft daylight horizon haze
            skyGrad.addColorStop(0.85, '#e4effa'); // Warm sun-kissed mist
            skyGrad.addColorStop(1.0, '#a5b9cb');  // Distant subtle mountain/city horizon
            sCtx.fillStyle = skyGrad;
            sCtx.fillRect(0, 0, 512, 256);

            // Add distant subtle architectural silhouette on horizon
            sCtx.fillStyle = '#9cb1c2';
            for (let b = 0; b < 18; b++) {
                const bx = b * 30 + (b % 3) * 6;
                const bw = 16 + (b % 4) * 5;
                const bh = 25 + ((b * 13) % 45);
                sCtx.fillRect(bx, 256 - bh, bw, bh);
            }

            const skyTex = new THREE.CanvasTexture(skyCanvas);
            const skyMat = new THREE.MeshBasicMaterial({ map: skyTex });
            const skyBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(terraceW + 5.0, height * 1.6), skyMat);
            skyBackdrop.position.set(centerU, height * 0.5, -terraceDepth - 1.2);
            balconyGroup.add(skyBackdrop);

            // Outdoor Directional Sunlight beaming into room through window
            const sunLight = new THREE.DirectionalLight(0xfffaed, 1.35);
            sunLight.position.set(centerU + 1.2, height + 1.2, -terraceDepth - 0.5);
            sunLight.target.position.set(centerU, 0.3, 1.8);
            balconyGroup.add(sunLight);
            balconyGroup.add(sunLight.target);

            winGroup.add(balconyGroup);
        }

        // 4. Sheer Architectural Pleated Drapes / Curtains (Inside at +Z)
        if (opts.showCurtains !== false) {
            const curtainTrackY = Math.min(height - 0.04, sillY + winH + 0.10);
            const curtainH = curtainTrackY;
            const curtainTrack = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, winW + 0.6, 12), darkFrameMat);
            curtainTrack.rotation.z = Math.PI / 2;
            curtainTrack.position.set(centerU, curtainTrackY, 0.12);
            winGroup.add(curtainTrack);

            const curtainMat = new THREE.MeshStandardMaterial({ 
                color: 0xfaf9f6, 
                roughness: 0.95, 
                transparent: true, 
                opacity: 0.82, 
                side: THREE.DoubleSide 
            });

            const drapeW = Math.max(0.48, winW * 0.22);
            const buildPleatedDrape = (centerX) => {
                const drapeGeo = new THREE.PlaneGeometry(drapeW, curtainH, 16, 1);
                const posAttr = drapeGeo.attributes.position;
                for (let v = 0; v < posAttr.count; v++) {
                    const uVal = posAttr.getX(v);
                    // Gentle vertical sinusoidal ripples
                    const ripple = Math.sin((uVal / drapeW) * Math.PI * 5) * 0.035;
                    posAttr.setZ(v, ripple);
                }
                drapeGeo.computeVertexNormals();
                const drapeMesh = new THREE.Mesh(drapeGeo, curtainMat);
                drapeMesh.position.set(centerX, curtainH / 2, 0.12);
                return drapeMesh;
            };

            // Left Drapery Panel
            const leftDrape = buildPleatedDrape(centerU - winW / 2 + drapeW * 0.3);
            winGroup.add(leftDrape);

            // Right Drapery Panel
            const rightDrape = buildPleatedDrape(centerU + winW / 2 - drapeW * 0.3);
            winGroup.add(rightDrape);
        }

        this.windowGroup.add(winGroup);

        return {
            wall: wall,
            centerU: centerU,
            width: winW,
            bottomY: sillY,
            height: winH
        };
    }

    buildParametricDoor(length, width, height, doorOpts = {}) {
        if (doorOpts && doorOpts.enabled === false) {
            return null;
        }

        const opts = doorOpts || {};
        let wall = (opts.wall || 'south').toLowerCase().trim();
        if (wall === 'right') wall = 'east';
        if (wall === 'left') wall = 'west';

        const style = opts.style || 'modern_wood';
        const wallSpan = (wall === 'north' || wall === 'south') ? width : length;

        // Auto-resizing parametric dimensions (adheres to architectural standards)
        const doorH = Math.max(1.95, Math.min(2.30, height * 0.72));
        const doorW = Math.max(0.82, Math.min(0.98, wallSpan * 0.22));
        const sillY = 0; // Doors always start from floor

        // Position along the wall
        const posPreset = opts.position || 'right_corner';
        const cornerMargin = 0.35;
        let centerU = 0;
        if (posPreset === 'left_corner') {
            centerU = -wallSpan / 2 + cornerMargin + doorW / 2;
        } else if (posPreset === 'right_corner') {
            centerU = wallSpan / 2 - cornerMargin - doorW / 2;
        } else {
            centerU = 0; // Centered
        }

        // Create door assembly group and orient to the wall
        const doorGrp = new THREE.Group();
        doorGrp.userData.isDoorAssembly = true;

        if (wall === 'north') {
            doorGrp.position.set(0, 0, -length / 2);
        } else if (wall === 'south') {
            doorGrp.position.set(0, 0, length / 2);
            doorGrp.rotateY(Math.PI);
        } else if (wall === 'east') {
            doorGrp.position.set(width / 2, 0, 0);
            doorGrp.rotateY(-Math.PI / 2);
        } else if (wall === 'west') {
            doorGrp.position.set(-width / 2, 0, 0);
            doorGrp.rotateY(Math.PI / 2);
        }

        // Materials
        const darkFrameMat = new THREE.MeshStandardMaterial({ 
            color: 0x1f2023, 
            metalness: 0.6, 
            roughness: 0.35 
        });
        const walnutMat = new THREE.MeshStandardMaterial({ 
            color: 0x422d20, 
            roughness: 0.65 
        });
        const whiteLacquerMat = new THREE.MeshStandardMaterial({ 
            color: 0xf5f5f7, 
            roughness: 0.35 
        });
        const charcoalMat = new THREE.MeshStandardMaterial({ 
            color: 0x222326, 
            roughness: 0.55 
        });
        const frostedGlassMat = new THREE.MeshStandardMaterial({ 
            color: 0xe6edf5, 
            roughness: 0.3, 
            transparent: true, 
            opacity: 0.45 
        });
        const metalInlayMat = new THREE.MeshStandardMaterial({ 
            color: 0xc8c8c8, 
            metalness: 0.85, 
            roughness: 0.25 
        });
        const brassHandleMat = new THREE.MeshStandardMaterial({ 
            color: 0xd4af37, 
            metalness: 0.85, 
            roughness: 0.2 
        });
        const chromeHandleMat = new THREE.MeshStandardMaterial({ 
            color: 0xdddddd, 
            metalness: 0.9, 
            roughness: 0.15 
        });

        // 1. Door Frame & Architrave Casing (left jamb, right jamb, head casing)
        const frameW = 0.055;
        const frameDepth = 0.12;
        const architraveFace = 0.05;

        // Left jamb
        const leftJamb = new THREE.Mesh(new THREE.BoxGeometry(frameW, doorH, frameDepth), darkFrameMat);
        leftJamb.position.set(centerU - doorW / 2 + frameW / 2, doorH / 2, 0);
        doorGrp.add(leftJamb);

        // Right jamb
        const rightJamb = new THREE.Mesh(new THREE.BoxGeometry(frameW, doorH, frameDepth), darkFrameMat);
        rightJamb.position.set(centerU + doorW / 2 - frameW / 2, doorH / 2, 0);
        doorGrp.add(rightJamb);

        // Top header
        const topHeader = new THREE.Mesh(new THREE.BoxGeometry(doorW + architraveFace * 2, frameW, frameDepth), darkFrameMat);
        topHeader.position.set(centerU, doorH + frameW / 2, 0);
        doorGrp.add(topHeader);

        // Floor threshold strip
        const thresh = new THREE.Mesh(new THREE.BoxGeometry(doorW, 0.015, frameDepth), metalInlayMat);
        thresh.position.set(centerU, 0.007, 0);
        doorGrp.add(thresh);

        // 2. Door Leaf (Hinged ajar into the room for high-end 3D architectural depth)
        const leafW = doorW - frameW * 2 + 0.02;
        const leafH = doorH - 0.02;
        const leafThick = 0.045;

        // Pivot group placed at the hinge edge
        const hingeX = centerU - doorW / 2 + frameW;
        const leafGroup = new THREE.Group();
        leafGroup.position.set(hingeX, 0, 0);
        // Ajar angle: ~13 degrees (0.23 rad) open inward into room
        leafGroup.rotation.y = (opts.isOpen !== false) ? 0.23 : 0;

        // Select leaf material based on chosen door style
        let leafMat = walnutMat;
        if (style === 'white_minimal') leafMat = whiteLacquerMat;
        else if (style === 'groove_panel') leafMat = charcoalMat;
        else if (style === 'glass_interior') leafMat = darkFrameMat;

        // Leaf slab
        const leafMesh = new THREE.Mesh(new THREE.BoxGeometry(leafW, leafH, leafThick), leafMat);
        leafMesh.position.set(leafW / 2, leafH / 2, 0);
        leafGroup.add(leafMesh);

        // Style details on leaf
        if (style === 'modern_wood') {
            // Horizontal brushed stainless steel inlay stripes
            for (let s = 1; s <= 4; s++) {
                const stripeY = leafH * (s / 5);
                const stripe = new THREE.Mesh(new THREE.BoxGeometry(leafW - 0.04, 0.008, leafThick + 0.002), metalInlayMat);
                stripe.position.set(leafW / 2, stripeY, 0);
                leafGroup.add(stripe);
            }
        } else if (style === 'groove_panel') {
            // Vertical architectural shadow grooves
            for (let g of [-0.25, 0, 0.25]) {
                const groove = new THREE.Mesh(new THREE.BoxGeometry(0.012, leafH - 0.1, leafThick + 0.002), darkFrameMat);
                groove.position.set(leafW / 2 + leafW * g, leafH / 2, 0);
                leafGroup.add(groove);
            }
        } else if (style === 'glass_interior') {
            // Fluted frosted glass vertical inset panel
            const glassPanel = new THREE.Mesh(new THREE.BoxGeometry(leafW * 0.55, leafH * 0.78, 0.02), frostedGlassMat);
            glassPanel.position.set(leafW / 2, leafH / 2, 0);
            leafGroup.add(glassPanel);
        }

        // 3. Ergonomic Lever Handle at Standard Height (0.98m)
        const handleY = 0.98;
        const handleX = leafW - 0.065;
        const handleMat = (style === 'modern_wood' || style === 'white_minimal') ? brassHandleMat : chromeHandleMat;

        for (let side of [-1, 1]) {
            const hGroup = new THREE.Group();
            hGroup.position.set(handleX, handleY, side * (leafThick / 2 + 0.003));

            // Backplate (escutcheon)
            const escutcheon = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.15, 0.006), handleMat);
            hGroup.add(escutcheon);

            // Spindle neck
            const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.045, 12), handleMat);
            neck.rotation.x = Math.PI / 2;
            neck.position.set(0, 0.03, side * 0.02);
            hGroup.add(neck);

            // Horizontal ergonomic lever
            const lever = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.016, 0.016), handleMat);
            lever.position.set(-0.045, 0.03, side * 0.045);
            hGroup.add(lever);

            // Keyhole / thumbturn indicator
            const keyhole = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.008), darkFrameMat);
            keyhole.position.set(0, -0.035, side * 0.002);
            hGroup.add(keyhole);

            leafGroup.add(hGroup);
        }

        // Hinges on jamb side
        for (let hFrac of [0.15, 0.5, 0.85]) {
            const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.065, 12), handleMat);
            hinge.position.set(0, leafH * hFrac, 0);
            leafGroup.add(hinge);
        }

        doorGrp.add(leafGroup);

        // 4. Inviting Hallway Corridor Beyond Door (Outside at -Z)
        const hallDepth = 0.9;
        const hallW = doorW + 0.4;
        const hallGroup = new THREE.Group();

        // Hallway floor
        const hallFloorMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 });
        const hallFloor = new THREE.Mesh(new THREE.PlaneGeometry(hallW, hallDepth), hallFloorMat);
        hallFloor.rotateX(-Math.PI / 2);
        hallFloor.position.set(centerU, 0.005, -hallDepth / 2);
        hallGroup.add(hallFloor);

        // Hallway ceiling
        const hallCeil = new THREE.Mesh(new THREE.PlaneGeometry(hallW, hallDepth), this.ceilingMaterial);
        hallCeil.rotateX(Math.PI / 2);
        hallCeil.position.set(centerU, doorH + 0.15, -hallDepth / 2);
        hallGroup.add(hallCeil);

        // Hallway back wall
        const hallWallMat = new THREE.MeshStandardMaterial({ color: 0xdfdfd9, roughness: 0.9 });
        const hallBackWall = new THREE.Mesh(new THREE.PlaneGeometry(hallW, doorH + 0.15), hallWallMat);
        hallBackWall.position.set(centerU, (doorH + 0.15) / 2, -hallDepth);
        hallGroup.add(hallBackWall);

        // Warm hallway ambient light visible through open door
        const hallLight = new THREE.PointLight(0xffeedd, 0.85, 3.8);
        hallLight.position.set(centerU, doorH * 0.85, -hallDepth * 0.6);
        hallGroup.add(hallLight);

        doorGrp.add(hallGroup);

        this.doorGroup.add(doorGrp);

        return {
            wall: wall,
            centerU: centerU,
            width: doorW,
            bottomY: 0,
            height: doorH
        };
    }

    createMarbleCanvasTexture(baseColor = '#f6f5f1', veinColor = '#7a7671') {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Base stone gradient
        const grad = ctx.createLinearGradient(0, 0, 512, 512);
        grad.addColorStop(0, baseColor);
        grad.addColorStop(0.4, '#eeebe4');
        grad.addColorStop(0.7, '#f4f2ec');
        grad.addColorStop(1, baseColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);

        // Soft cloudiness
        for (let i = 0; i < 24; i++) {
            const cx = Math.random() * 512;
            const cy = Math.random() * 512;
            const cr = 60 + Math.random() * 120;
            const cGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, cr);
            cGrad.addColorStop(0, 'rgba(225, 220, 210, 0.45)');
            cGrad.addColorStop(1, 'rgba(225, 220, 210, 0)');
            ctx.fillStyle = cGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, cr, 0, Math.PI * 2);
            ctx.fill();
        }

        // Organic natural marble veins
        const drawVein = (startX, startY, endX, endY, width, alpha) => {
            ctx.strokeStyle = veinColor;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            let currX = startX;
            let currY = startY;
            const steps = 15;
            for (let s = 1; s <= steps; s++) {
                const targetX = startX + (endX - startX) * (s / steps) + (Math.random() - 0.5) * 35;
                const targetY = startY + (endY - startY) * (s / steps) + (Math.random() - 0.5) * 35;
                const cpX = (currX + targetX) / 2 + (Math.random() - 0.5) * 25;
                const cpY = (currY + targetY) / 2 + (Math.random() - 0.5) * 25;
                ctx.quadraticCurveTo(cpX, cpY, targetX, targetY);
                currX = targetX;
                currY = targetY;

                // Small branching tributary
                if (Math.random() > 0.65 && s > 2 && s < steps - 2) {
                    ctx.save();
                    ctx.lineWidth = width * 0.45;
                    ctx.globalAlpha = alpha * 0.55;
                    ctx.beginPath();
                    ctx.moveTo(currX, currY);
                    ctx.lineTo(currX + (Math.random() - 0.5) * 60, currY + (Math.random() - 0.5) * 60);
                    ctx.stroke();
                    ctx.restore();
                }
            }
            ctx.stroke();
        };

        drawVein(20, 40, 480, 470, 3.8, 0.42);
        drawVein(60, 10, 500, 380, 2.2, 0.30);
        drawVein(10, 280, 400, 500, 2.6, 0.34);
        drawVein(240, 10, 500, 240, 1.8, 0.25);
        ctx.globalAlpha = 1.0;

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    createWoodCanvasTexture(finish = 'walnut') {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        let baseHex, darkHex, grainHex;
        if (finish === 'natural_oak') {
            baseHex = '#c4a682';
            darkHex = '#b08f68';
            grainHex = '#94724d';
        } else if (finish === 'charcoal') {
            baseHex = '#27282b';
            darkHex = '#1c1d1f';
            grainHex = '#35363b';
        } else { // walnut
            baseHex = '#483122';
            darkHex = '#352115';
            grainHex = '#5c3e2b';
        }

        const grad = ctx.createLinearGradient(0, 0, 512, 0);
        grad.addColorStop(0, baseHex);
        grad.addColorStop(0.35, darkHex);
        grad.addColorStop(0.7, baseHex);
        grad.addColorStop(1, darkHex);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 512, 512);

        // Wood grain pores & streaks
        ctx.strokeStyle = grainHex;
        for (let x = 0; x < 512; x += 3) {
            if (Math.random() > 0.4) {
                ctx.globalAlpha = 0.12 + Math.random() * 0.18;
                ctx.lineWidth = 1 + Math.random() * 1.5;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                const midShift = (Math.random() - 0.5) * 8;
                ctx.quadraticCurveTo(x + midShift, 256, x + (Math.random() - 0.5) * 4, 512);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1.0;

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    buildArchitecturalTVDecor(decorW, roomH, wallSpan, tvOpts = {}, includeTV = true, parentGroup) {
        const style = tvOpts.style || 'fluted_marble_shelf';
        const woodFinish = tvOpts.woodFinish || 'walnut';
        const consoleType = tvOpts.consoleType || 'floating';
        const decorH = Math.min(roomH - 0.12, roomH * 0.88);

        // Materials
        const marbleTex = this.createMarbleCanvasTexture('#f7f6f2', '#78746f');
        const marbleMat = new THREE.MeshStandardMaterial({
            map: marbleTex,
            roughness: 0.16,
            metalness: 0.08
        });

        const woodTex = this.createWoodCanvasTexture(woodFinish);
        const woodMat = new THREE.MeshStandardMaterial({
            map: woodTex,
            roughness: 0.58,
            metalness: 0.05
        });

        const darkAcousticMat = new THREE.MeshStandardMaterial({
            color: 0x161719,
            roughness: 0.95
        });

        const darkMetalMat = new THREE.MeshStandardMaterial({
            color: 0x222325,
            metalness: 0.75,
            roughness: 0.25
        });

        const brassMat = new THREE.MeshStandardMaterial({
            color: 0xd4af37,
            metalness: 0.85,
            roughness: 0.2
        });

        const tvBezelMat = new THREE.MeshStandardMaterial({
            color: 0x111214,
            metalness: 0.8,
            roughness: 0.2
        });

        const oledScreenMat = new THREE.MeshStandardMaterial({
            color: 0x07080a,
            metalness: 0.1,
            roughness: 0.04
        });

        const warmLedMat = new THREE.MeshBasicMaterial({
            color: 0xffe2a4
        });

        const ceramicMat = new THREE.MeshStandardMaterial({
            color: 0xf5f3ee,
            roughness: 0.35
        });

        const foliageMat = new THREE.MeshStandardMaterial({
            color: 0x2a5933,
            roughness: 0.65
        });

        const slateCabinetMat = new THREE.MeshStandardMaterial({
            color: 0x3d4b53,
            roughness: 0.5
        });

        const whiteMat = new THREE.MeshStandardMaterial({
            color: 0xf8f8fa,
            roughness: 0.35
        });

        // Helper: Build a fluted vertical timber acoustic slat wall panel
        const buildFlutedSlats = (spanW, spanH, parent, centerOffset = 0) => {
            const slatGroup = new THREE.Group();
            const felt = new THREE.Mesh(new THREE.PlaneGeometry(spanW, spanH), darkAcousticMat);
            felt.position.set(centerOffset, spanH / 2, 0.005);
            slatGroup.add(felt);

            const slatW = 0.032;
            const slatD = 0.020;
            const slatGap = 0.020;
            const step = slatW + slatGap;
            const count = Math.floor(spanW / step);
            const startX = centerOffset - ((count - 1) * step) / 2;

            const slatGeo = new THREE.BoxGeometry(slatW, spanH, slatD);
            for (let i = 0; i < count; i++) {
                const slatMesh = new THREE.Mesh(slatGeo, woodMat);
                slatMesh.position.set(startX + i * step, spanH / 2, 0.01 + slatD / 2);
                slatGroup.add(slatMesh);
            }
            parent.add(slatGroup);
            return slatGroup;
        };

        // Helper: Build an illuminated open shelving niche tower
        const buildShelvingTower = (towerW, towerH, shelfCount = 4, parent, centerX = 0) => {
            const towerGroup = new THREE.Group();
            const frameThick = 0.035;
            const towerD = 0.30;

            const leftSide = new THREE.Mesh(new THREE.BoxGeometry(frameThick, towerH, towerD), woodMat);
            leftSide.position.set(centerX - towerW / 2 + frameThick / 2, towerH / 2, towerD / 2);
            towerGroup.add(leftSide);

            const rightSide = new THREE.Mesh(new THREE.BoxGeometry(frameThick, towerH, towerD), woodMat);
            rightSide.position.set(centerX + towerW / 2 - frameThick / 2, towerH / 2, towerD / 2);
            towerGroup.add(rightSide);

            const topCasing = new THREE.Mesh(new THREE.BoxGeometry(towerW, frameThick, towerD), woodMat);
            topCasing.position.set(centerX, towerH - frameThick / 2, towerD / 2);
            towerGroup.add(topCasing);

            const backPanel = new THREE.Mesh(new THREE.PlaneGeometry(towerW - frameThick * 2, towerH - frameThick), woodMat);
            backPanel.position.set(centerX, towerH / 2, 0.01);
            towerGroup.add(backPanel);

            const innerW = towerW - frameThick * 2;
            const shelfSpacing = (towerH - 0.45) / (shelfCount + 1);

            for (let s = 1; s <= shelfCount; s++) {
                const shelfY = 0.35 + s * shelfSpacing;
                const shelfMesh = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.025, towerD - 0.02), woodMat);
                shelfMesh.position.set(centerX, shelfY, towerD / 2);
                towerGroup.add(shelfMesh);

                const ledStrip = new THREE.Mesh(new THREE.BoxGeometry(innerW - 0.04, 0.008, 0.015), warmLedMat);
                ledStrip.position.set(centerX, shelfY + 0.015, towerD / 2 + 0.02);
                towerGroup.add(ledStrip);

                const shelfLight = new THREE.PointLight(0xffdf99, 0.45, 1.8);
                shelfLight.position.set(centerX, shelfY + 0.14, towerD * 0.7);
                towerGroup.add(shelfLight);

                if (s === 1) {
                    // Stack of design books
                    for (let b = 0; b < 3; b++) {
                        const bookColor = (b % 2 === 0) ? 0x222222 : 0xc2a67a;
                        const bookMat = new THREE.MeshStandardMaterial({ color: bookColor, roughness: 0.8 });
                        const book = new THREE.Mesh(new THREE.BoxGeometry(0.18 - b * 0.015, 0.025, 0.14), bookMat);
                        book.position.set(centerX, shelfY + 0.025 + b * 0.025, towerD / 2);
                        towerGroup.add(book);
                    }
                } else if (s === 2) {
                    // Potted succulent plant in ceramic pot
                    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.07, 16), ceramicMat);
                    pot.position.set(centerX, shelfY + 0.048, towerD / 2);
                    towerGroup.add(pot);
                    for (let l = 0; l < 5; l++) {
                        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.09, 5), foliageMat);
                        leaf.position.set(centerX + (Math.random() - 0.5) * 0.03, shelfY + 0.11, towerD / 2 + (Math.random() - 0.5) * 0.03);
                        leaf.rotation.z = (l - 2) * 0.15;
                        towerGroup.add(leaf);
                    }
                } else if (s === 3) {
                    // Modern ceramic art vase
                    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.055, 0.16, 16), ceramicMat);
                    vase.position.set(centerX, shelfY + 0.09, towerD / 2);
                    towerGroup.add(vase);
                } else {
                    // Brass decorative sphere on pedestal
                    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.03, 12), darkMetalMat);
                    base.position.set(centerX, shelfY + 0.028, towerD / 2);
                    towerGroup.add(base);
                    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), brassMat);
                    sphere.position.set(centerX, shelfY + 0.088, towerD / 2);
                    towerGroup.add(sphere);
                }
            }
            parent.add(towerGroup);
            return towerGroup;
        };

        // Helper: Build Low-profile Media Console (Credenza)
        const buildCredenza = (consoleW, consoleH = 0.38, consoleD = 0.42, isFloating = true, credenzaStyle = 'slate', parent, centerX = 0) => {
            const credGroup = new THREE.Group();
            const baseY = isFloating ? 0.12 : 0.10;

            if (isFloating) {
                // Recessed plinth base with warm under-glow
                const plinthMesh = new THREE.Mesh(new THREE.BoxGeometry(consoleW * 0.9, 0.06, consoleD * 0.65), darkMetalMat);
                plinthMesh.position.set(centerX, 0.06, consoleD * 0.4);
                credGroup.add(plinthMesh);

                const underLight = new THREE.PointLight(0xffdf99, 0.85, 1.8);
                underLight.position.set(centerX, 0.06, consoleD * 0.6);
                credGroup.add(underLight);
            } else {
                // 4 slim metal peg legs
                for (let lx of [-consoleW / 2 + 0.08, consoleW / 2 - 0.08]) {
                    for (let lz of [0.08, consoleD - 0.06]) {
                        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.012, 0.10, 12), darkMetalMat);
                        leg.position.set(centerX + lx, 0.05, lz);
                        credGroup.add(leg);
                    }
                }
            }

            // Cabinet carcass
            let cabinetMat = (credenzaStyle === 'slate') ? slateCabinetMat : ((credenzaStyle === 'white') ? woodMat : woodMat);
            const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(consoleW, consoleH, consoleD), cabinetMat);
            bodyMesh.position.set(centerX, baseY + consoleH / 2, consoleD / 2);
            credGroup.add(bodyMesh);

            // Front drawer faces
            const drawerCount = Math.max(3, Math.min(5, Math.round(consoleW / 0.75)));
            const drawerW = (consoleW - 0.04) / drawerCount;
            const drawerH = consoleH - 0.04;
            let faceMat = (credenzaStyle === 'white') ? whiteMat : ((credenzaStyle === 'slate') ? slateCabinetMat : woodMat);

            for (let d = 0; d < drawerCount; d++) {
                const dX = centerX - consoleW / 2 + 0.02 + (d + 0.5) * drawerW;
                const dMesh = new THREE.Mesh(new THREE.BoxGeometry(drawerW - 0.008, drawerH, 0.02), faceMat);
                dMesh.position.set(dX, baseY + consoleH / 2, consoleD + 0.005);
                credGroup.add(dMesh);

                // Minimalist horizontal bar handle (brass or dark metal)
                const handleBar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.015), (credenzaStyle === 'slate') ? brassMat : darkMetalMat);
                handleBar.position.set(dX, baseY + consoleH - 0.05, consoleD + 0.018);
                credGroup.add(handleBar);
            }

            // Accessories on Credenza Top:
            // 1. Sleek Modern Soundbar
            const sbarW = Math.min(1.05, consoleW * 0.45);
            const soundbar = new THREE.Mesh(new THREE.BoxGeometry(sbarW, 0.055, 0.075), darkMetalMat);
            soundbar.position.set(centerX, baseY + consoleH + 0.028, consoleD / 2 - 0.06);
            credGroup.add(soundbar);

            const powerDot = new THREE.Mesh(new THREE.SphereGeometry(0.003, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
            powerDot.position.set(centerX, baseY + consoleH + 0.028, consoleD / 2 - 0.022);
            credGroup.add(powerDot);

            // 2. Ceramic Vase with Decorative Foliage
            const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.065, 0.22, 16), ceramicMat);
            vase.position.set(centerX - consoleW * 0.38, baseY + consoleH + 0.11, consoleD / 2);
            credGroup.add(vase);

            for (let f = -1; f <= 1; f++) {
                const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.28, 6), foliageMat);
                stem.position.set(centerX - consoleW * 0.38 + f * 0.025, baseY + consoleH + 0.25, consoleD / 2);
                stem.rotation.z = f * 0.18;
                credGroup.add(stem);
            }

            parent.add(credGroup);
            return credGroup;
        };

        // Helper: Build Flush OLED Smart TV
        const buildOLEDTV = (tvW, centerY, parent, centerX = 0) => {
            const tvGroup = new THREE.Group();
            const tvH = tvW * (9 / 16);
            const tvD = 0.025;

            // Titanium / dark slim bezel
            const bezel = new THREE.Mesh(new THREE.BoxGeometry(tvW, tvH, tvD), tvBezelMat);
            bezel.position.set(centerX, centerY, 0.06);
            tvGroup.add(bezel);

            // Glossy OLED Display Screen
            const screen = new THREE.Mesh(new THREE.PlaneGeometry(tvW - 0.015, tvH - 0.015), oledScreenMat);
            screen.position.set(centerX, centerY, 0.073);
            tvGroup.add(screen);

            // Wall mounting bracket
            const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.03), darkMetalMat);
            bracket.position.set(centerX, centerY, 0.03);
            tvGroup.add(bracket);

            parent.add(tvGroup);
            return tvGroup;
        };

        // --- ASSEMBLE STYLES ---

        if (style === 'fluted_marble_shelf') {
            // === STYLE 1: PHOTO 1 MATCH ===
            // Left flank: Fluted timber acoustic slats + 4-tier illuminated open shelf tower
            // Center/Right: Large Calacatta marble slab with warm LED perimeter halo glow
            // Bottom: Full-width floating media console in matte slate grey with gold bar handles

            const leftSpan = Math.min(1.15, decorW * 0.34);
            const slatSpan = leftSpan * 0.52;
            const towerSpan = leftSpan * 0.48;

            // 1. Left Fluted Wood Slats
            buildFlutedSlats(slatSpan, decorH, parentGroup, -decorW / 2 + slatSpan / 2);

            // 2. Left Shelving Tower with warm downlights & decor
            buildShelvingTower(towerSpan, decorH, 4, parentGroup, -decorW / 2 + slatSpan + towerSpan / 2);

            // 3. Center/Right Luxury Marble Feature Panel
            const marbleW = decorW - leftSpan - 0.04;
            const marbleX = -decorW / 2 + leftSpan + 0.02 + marbleW / 2;

            // Warm LED Halo Backlight Plane
            const haloPlate = new THREE.Mesh(new THREE.BoxGeometry(marbleW + 0.08, decorH + 0.06, 0.01), warmLedMat);
            haloPlate.position.set(marbleX, decorH / 2, 0.008);
            parentGroup.add(haloPlate);

            const haloLight = new THREE.PointLight(0xffdf99, 1.25, 4.5);
            haloLight.position.set(marbleX, decorH * 0.55, 0.06);
            parentGroup.add(haloLight);

            // Marble Slab
            const marbleSlab = new THREE.Mesh(new THREE.BoxGeometry(marbleW, decorH, 0.03), marbleMat);
            marbleSlab.position.set(marbleX, decorH / 2, 0.025);
            parentGroup.add(marbleSlab);

            // 4. Centered OLED TV on Marble Slab
            if (includeTV) {
                const tvW = Math.max(1.4, Math.min(marbleW * 0.72, 2.0));
                buildOLEDTV(tvW, Math.max(1.15, decorH * 0.52), parentGroup, marbleX);
            }

            // 5. Floating Media Console (Credenza)
            const isFloat = (consoleType !== 'floor_legs');
            buildCredenza(decorW, 0.38, 0.42, isFloat, 'slate', parentGroup, 0);

        } else if (style === 'walnut_fireplace') {
            // === STYLE 2: PHOTO 2 MATCH ===
            // Symmetrical luxury: Symmetrical walnut open bookcases on left & right
            // Center: Luxury marble slab with warm halo lighting
            // Lower: Linear electric fireplace with glowing crystal amber ember bed
            // Upper: Centered OLED TV

            const towerW = Math.min(0.72, decorW * 0.22);

            // 1. Left & Right Symmetrical Shelving Towers
            buildShelvingTower(towerW, decorH, 5, parentGroup, -decorW / 2 + towerW / 2);
            buildShelvingTower(towerW, decorH, 5, parentGroup, decorW / 2 - towerW / 2);

            // 2. Center Marble Feature Panel
            const marbleW = decorW - towerW * 2 - 0.04;

            // Halo glow
            const haloPlate = new THREE.Mesh(new THREE.BoxGeometry(marbleW + 0.08, decorH + 0.06, 0.01), warmLedMat);
            haloPlate.position.set(0, decorH / 2, 0.008);
            parentGroup.add(haloPlate);

            const haloLight = new THREE.PointLight(0xffdf99, 1.25, 4.5);
            haloLight.position.set(0, decorH * 0.55, 0.06);
            parentGroup.add(haloLight);

            // Marble Slab
            const marbleSlab = new THREE.Mesh(new THREE.BoxGeometry(marbleW, decorH, 0.03), marbleMat);
            marbleSlab.position.set(0, decorH / 2, 0.025);
            parentGroup.add(marbleSlab);

            // 3. Built-in Linear Electric Fireplace
            const fireW = Math.min(1.65, marbleW * 0.85);
            const fireH = 0.32;
            const fireY = 0.52;

            // Dark stone / walnut fireplace frame
            const fireFrame = new THREE.Mesh(new THREE.BoxGeometry(fireW + 0.08, fireH + 0.08, 0.16), darkMetalMat);
            fireFrame.position.set(0, fireY, 0.09);
            parentGroup.add(fireFrame);

            // Firebox cavity
            const cavity = new THREE.Mesh(new THREE.BoxGeometry(fireW, fireH, 0.14), darkAcousticMat);
            cavity.position.set(0, fireY, 0.10);
            parentGroup.add(cavity);

            // Tinted glass front
            const fireGlass = new THREE.Mesh(new THREE.PlaneGeometry(fireW, fireH), new THREE.MeshStandardMaterial({
                color: 0x0a0a0a,
                transparent: true,
                opacity: 0.55,
                roughness: 0.1
            }));
            fireGlass.position.set(0, fireY, 0.175);
            parentGroup.add(fireGlass);

            // Glowing amber crystal ember bed
            const emberMat = new THREE.MeshStandardMaterial({
                color: 0xff6600,
                emissive: 0xff5500,
                emissiveIntensity: 1.8,
                roughness: 0.3
            });
            const embers = new THREE.Mesh(new THREE.BoxGeometry(fireW - 0.06, 0.04, 0.10), emberMat);
            embers.position.set(0, fireY - fireH / 2 + 0.025, 0.10);
            parentGroup.add(embers);

            // Warm flickering fire light
            const fireLight = new THREE.PointLight(0xff7722, 1.5, 3.8);
            fireLight.position.set(0, fireY + 0.04, 0.16);
            parentGroup.add(fireLight);

            // 4. Centered OLED TV above Fireplace
            if (includeTV) {
                const tvW = Math.max(1.4, Math.min(marbleW * 0.72, 1.95));
                buildOLEDTV(tvW, 1.35, parentGroup, 0);
            }

            // 5. Lower Walnut Hearth Bench between towers
            const benchMesh = new THREE.Mesh(new THREE.BoxGeometry(marbleW, 0.32, 0.42), woodMat);
            benchMesh.position.set(0, 0.16, 0.21);
            parentGroup.add(benchMesh);

        } else {
            // === STYLE 3: PHOTO 3 MATCH ===
            // Full-width vertical fluted acoustic wood slat wall from floor to ceiling
            // Left & Right vertical LED floor-to-ceiling light channels
            // Long Scandinavian low-profile credenza on metal peg legs
            // Centered OLED TV with horizontal soundbar

            // 1. Full-width Fluted Wood Slats
            buildFlutedSlats(decorW, decorH, parentGroup, 0);

            // 2. Vertical Floor-to-Ceiling LED Light Strip Channels on Outer Flanks
            for (let side of [-1, 1]) {
                const lightStrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, decorH, 0.015), warmLedMat);
                lightStrip.position.set(side * (decorW / 2 - 0.03), decorH / 2, 0.035);
                parentGroup.add(lightStrip);

                const stripLight = new THREE.PointLight(0xffdf99, 0.75, 2.5);
                stripLight.position.set(side * (decorW / 2 - 0.03), decorH / 2, 0.08);
                parentGroup.add(stripLight);
            }

            // 3. Centered OLED TV
            if (includeTV) {
                const tvW = Math.max(1.5, Math.min(decorW * 0.58, 2.1));
                buildOLEDTV(tvW, Math.max(1.15, decorH * 0.52), parentGroup, 0);
            }

            // 4. Scandinavian Media Credenza
            const isFloat = (consoleType === 'floating');
            buildCredenza(decorW * 0.88, 0.40, 0.42, isFloat, 'white', parentGroup, 0);
        }
    }
}
