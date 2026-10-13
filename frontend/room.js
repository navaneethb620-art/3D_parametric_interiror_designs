import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class RoomGenerator {
    constructor(scene) {
        this.scene = scene;
        this.roomGroup = new THREE.Group();
        this.scene.add(this.roomGroup);
        
        // Default materials
        this.wallMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeee, side: THREE.DoubleSide });
        this.floorMaterial = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, side: THREE.DoubleSide });
        this.ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xfff0e5, side: THREE.DoubleSide });
        
        this.meshes = { walls: [], floor: null, ceiling: null };
        
        // 3D Asset Loader
        this.gltfLoader = new GLTFLoader();
        this.loadedModels = {};
    }

    generate(length, width, height, category='living', selectedItems=[], options={}) {
        // Clear old room
        while(this.roomGroup.children.length > 0){ 
            let child = this.roomGroup.children[0];
            this.roomGroup.remove(child); 
        }
        this.meshes.walls = [];

        // 1. Floor
        const floorGeo = new THREE.PlaneGeometry(width, length);
        floorGeo.rotateX(-Math.PI / 2);
        this.meshes.floor = new THREE.Mesh(floorGeo, this.floorMaterial);
        this.roomGroup.add(this.meshes.floor);

        // 2. Ceiling (now properly enclosed box)
        const ceilingGeo = new THREE.BoxGeometry(width, 0.1, length);
        this.meshes.ceiling = new THREE.Mesh(ceilingGeo, this.ceilingMaterial);
        this.meshes.ceiling.position.y = height + 0.05; // Sit on top of walls
        this.roomGroup.add(this.meshes.ceiling);

        // 3. Walls
        const wallNGeo = new THREE.PlaneGeometry(width, height);
        const wallN = new THREE.Mesh(wallNGeo, this.wallMaterial);
        wallN.position.set(0, height/2, -length/2);
        this.roomGroup.add(wallN);
        this.meshes.walls.push(wallN);

        const wallSGeo = new THREE.PlaneGeometry(width, height);
        wallSGeo.rotateY(Math.PI);
        const wallS = new THREE.Mesh(wallSGeo, this.wallMaterial);
        wallS.position.set(0, height/2, length/2);
        this.roomGroup.add(wallS);
        this.meshes.walls.push(wallS);

        const wallEGeo = new THREE.PlaneGeometry(length, height);
        wallEGeo.rotateY(-Math.PI/2);
        const wallE = new THREE.Mesh(wallEGeo, this.wallMaterial);
        wallE.position.set(width/2, height/2, 0);
        this.roomGroup.add(wallE);
        this.meshes.walls.push(wallE);

        const wallWGeo = new THREE.PlaneGeometry(length, height);
        wallWGeo.rotateY(Math.PI/2);
        const wallW = new THREE.Mesh(wallWGeo, this.wallMaterial);
        wallW.position.set(-width/2, height/2, 0);
        this.roomGroup.add(wallW);
        this.meshes.walls.push(wallW);
        
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
            const panelWidth = Math.min(width * 0.6, 3.5);
            const sofaWidth = Math.min(width * 0.6, 3.0);
            const sofaZ = length * 0.25; 
            
            // --- Core Seating & Furniture ---
            if (hasItem('tv_unit')) {
                const tvUnitGroup = new THREE.Group();
                tvUnitGroup.position.set(0, 0, -length/2 + 0.2);
                tvUnitGroup.userData.isDraggable = true;
                tvUnitGroup.userData.name = "TV Unit";
                this.roomGroup.add(tvUnitGroup);

                // TV Panel Wall Unit
                const panelHeight = height * 0.8;
                const panelGeo = new THREE.BoxGeometry(panelWidth, panelHeight, 0.02);
                const panelMesh = new THREE.Mesh(panelGeo, woodMat);
                panelMesh.position.set(0, panelHeight/2, -0.18);
                tvUnitGroup.add(panelMesh);
                
                this.loadDynamicModel(
                    getRandomModel(cabinetModels),
                    new THREE.Vector3(0, 0, 0),
                    new THREE.Euler(0, 0, 0),
                    panelWidth, // Scale to full panel width
                    0.6,        // Height
                    0.5,        // Depth
                    tvUnitGroup
                );

                if (hasItem('tv')) {
                    // Flat Screen TV attached to tvUnitGroup
                    const tvWidth = panelWidth * 0.6 || 1.5;
                    const tvHeight = tvWidth * (9/16);
                    const tvGeo = new THREE.BoxGeometry(tvWidth, tvHeight, 0.05);
                    const tvMesh = new THREE.Mesh(tvGeo, tvMat);
                    tvMesh.position.set(0, height * 0.5, -0.15);
                    tvUnitGroup.add(tvMesh);
                }
            } else if (hasItem('tv')) {
                // Standalone Wall TV
                const tvWidth = 1.5;
                const tvHeight = tvWidth * (9/16);
                const tvGeo = new THREE.BoxGeometry(tvWidth, tvHeight, 0.05);
                const tvMesh = new THREE.Mesh(tvGeo, tvMat);
                tvMesh.position.set(0, height * 0.5, -length/2 + 0.05);
                this.roomGroup.add(tvMesh);
            }
            if (hasItem('sofa')) {
                const sofaGroup = new THREE.Group();
                sofaGroup.position.set(0, 0, sofaZ);
                sofaGroup.userData.isDraggable = true;
                sofaGroup.userData.name = "Sofa";
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
                    0.8  // Depth
                );
            }
            if (hasItem('coffee_table')) {
                // Gothic Coffee Table
                this.loadDynamicModel(
                    'models/table/gothic_coffee_table_4k.gltf',
                    new THREE.Vector3(0, 0, sofaZ - 1.2),
                    new THREE.Euler(0, 0, 0),
                    1.4, // Width
                    0.4, // Height
                    0.8  // Depth
                );
            }
            if (hasItem('side_table')) {
                const sideGroup = new THREE.Group();
                sideGroup.position.set(sofaWidth/2 + 0.4, 0, sofaZ);
                sideGroup.userData.isDraggable = true;
                sideGroup.userData.name = "Side Table";
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
                    0.4  // Depth
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
                    0.4  // Depth
                );
            }
            if (hasItem('wall_shelves')) {
                // Dynamically distribute selected amount of shelves symmetrically across East and West walls
                const totalShelves = options.numShelves || 4;
                const shelvesPerWall = Math.ceil(totalShelves / 2);
                const shelfGeo = new THREE.BoxGeometry(1.0, 0.05, 0.2);
                
                // East Wall (+X)
                for(let i=0; i < shelvesPerWall; i++) {
                    const yPos = 1.2 + i*0.4;
                    const shelf = new THREE.Mesh(shelfGeo, woodMat);
                    shelf.userData.nonDraggable = true;
                    shelf.position.set(width/2 - 0.1, yPos, -length/4);
                    this.roomGroup.add(shelf);
                }
                
                // West Wall (-X)
                for(let i=0; i < Math.floor(totalShelves / 2); i++) {
                    const yPos = 1.2 + i*0.4;
                    const shelf = new THREE.Mesh(shelfGeo, woodMat);
                    shelf.userData.nonDraggable = true;
                    shelf.position.set(-width/2 + 0.1, yPos, length/4);
                    this.roomGroup.add(shelf);
                }
            }

            // --- Electronics ---
            if (hasItem('speakers')) {
                // Two tall speakers next to TV
                for(let i of [-1, 1]) {
                    const spkGeo = new THREE.BoxGeometry(0.2, 1.0, 0.25);
                    const spkMesh = new THREE.Mesh(spkGeo, tvMat);
                    spkMesh.userData.isDraggable = true;
                    spkMesh.userData.name = "Speaker";
                    spkMesh.position.set(i * (panelWidth/2 + 0.3), 0.5, -length/2 + 0.2);
                    this.roomGroup.add(spkMesh);
                }
            }
            if (hasItem('router')) {
                const routerGroup = new THREE.Group();
                routerGroup.userData.isDraggable = true;
                routerGroup.userData.name = "Router";
                routerGroup.position.set(0.4, 0.65, -length/2 + 0.2);
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
            if (hasItem('ceiling_fan') || hasItem('ceiling_light')) {
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
                const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6), metalMat);
                pole.position.set(0, 0.8, 0);
                lampGroup.add(pole);
                const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.3), whiteMat);
                shade.position.set(0, 1.6, 0);
                lampGroup.add(shade);
                lampGroup.position.set(sofaWidth/2 + 0.6, 0, sofaZ + 0.5);
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
                const rugGeo = new THREE.PlaneGeometry(sofaWidth*1.2, 2.0);
                rugGeo.rotateX(-Math.PI/2);
                const rugMesh = new THREE.Mesh(rugGeo, rugMat);
                rugMesh.userData.isDraggable = true;
                rugMesh.userData.name = "Rug";
                rugMesh.position.set(0, 0.01, sofaZ - 1.0); // Under coffee table
                this.roomGroup.add(rugMesh);
            }
            if (hasItem('curtains')) {
                // Simulate closed curtains on the West wall
                const curtainGeo = new THREE.PlaneGeometry(length*0.8, height);
                const curtainMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 1.0, side: THREE.DoubleSide });
                const curtainMesh = new THREE.Mesh(curtainGeo, curtainMat);
                curtainMesh.userData.nonDraggable = true;
                curtainMesh.rotation.y = Math.PI/2;
                curtainMesh.position.set(-width/2 + 0.1, height/2, 0);
                this.roomGroup.add(curtainMesh);
            }
            if (hasItem('wall_art')) {
                const wallArtGroup = new THREE.Group();
                wallArtGroup.userData.nonDraggable = true;
                this.roomGroup.add(wallArtGroup);

                // Wall Art
                this.loadDynamicModel(
                    getRandomModel(paintingModels),
                    new THREE.Vector3(0, 1.6, length/2 - 0.05), // Snapped to South wall
                    new THREE.Euler(0, Math.PI, 0),
                    1.2, // Width
                    0.8, // Height
                    0.05, // Depth
                    wallArtGroup
                );
            }
            if (hasItem('clock')) {
                const clockGroup = new THREE.Group();
                clockGroup.userData.nonDraggable = true;
                this.roomGroup.add(clockGroup);

                // Add Clock on the North wall (above TV console area)
                this.loadDynamicModel(
                    'models/clock/wall_clock_4k.gltf',
                    new THREE.Vector3(0, height * 0.85, -length/2 + 0.05), // Snapped to North wall
                    new THREE.Euler(0, 0, 0),
                    0.4, 0.4, 0.1,
                    clockGroup
                );
            }
            if (hasItem('plants')) {
                const plantGroup = new THREE.Group();
                plantGroup.userData.isDraggable = true;
                plantGroup.userData.name = "Plant";
                const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4), whiteMat);
                pot.position.set(0, 0.2, 0);
                plantGroup.add(pot);
                const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: 0x228B22 }));
                leaves.position.set(0, 0.6, 0);
                plantGroup.add(leaves);
                plantGroup.position.set(-panelWidth/2 - 0.4, 0, -length/2 + 0.4); // Next to TV
                this.roomGroup.add(plantGroup);
            }
        }
        else if (category === 'bedroom') {
            if (hasItem('bed')) {
                const bedWidth = 1.8;
                const bedLength = 2.0;
                const bedGroup = new THREE.Group();
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
                this.roomGroup.add(bedGroup);
            }
            if (hasItem('wardrobe')) {
                const wardGeo = new THREE.BoxGeometry(2.0, height - 0.2, 0.6);
                const wardMesh = new THREE.Mesh(wardGeo, woodMat);
                wardMesh.position.set(-width/2 + 0.3, (height-0.2)/2, 0); // West wall
                this.roomGroup.add(wardMesh);
            }
            // Add other bedroom items...
        }
        else if (category === 'kitchen') {
            if (hasItem('counters')) {
                const countGeo = new THREE.BoxGeometry(width, 0.9, 0.6);
                const countMesh = new THREE.Mesh(countGeo, metalMat);
                countMesh.position.set(0, 0.45, -length/2 + 0.3); // North wall
                this.roomGroup.add(countMesh);
            }
            if (hasItem('island')) {
                const islGeo = new THREE.BoxGeometry(2.0, 0.9, 1.0);
                const islMesh = new THREE.Mesh(islGeo, woodMat);
                islMesh.position.set(0, 0.45, 0); // Center
                this.roomGroup.add(islMesh);
            }
            if (hasItem('fridge')) {
                const fridgeGeo = new THREE.BoxGeometry(0.8, 2.0, 0.8);
                const fridgeMesh = new THREE.Mesh(fridgeGeo, whiteMat);
                fridgeMesh.position.set(width/2 - 0.4, 1.0, -length/2 + 0.4); // Corner
                this.roomGroup.add(fridgeMesh);
            }
        }
    }

    applyTexture(base64Data, surfaceType) {
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load(base64Data, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            
            // basic repeating to maintain scale
            texture.repeat.set(2, 2);

            const newMat = new THREE.MeshStandardMaterial({ 
                map: texture, 
                side: THREE.DoubleSide
            });

            if (surfaceType === 'floor' && this.meshes.floor) {
                this.meshes.floor.material = newMat;
            } else if (surfaceType === 'ceiling' && this.meshes.ceiling) {
                this.meshes.ceiling.material = newMat;
            } else if (surfaceType === 'wall') {
                this.wallMaterial = newMat; // Update base reference
                this.meshes.walls.forEach(w => w.material = newMat);
            }
        });
    }

    applyColor(hexColor, surfaceType) {
        const newMat = new THREE.MeshStandardMaterial({ 
            color: new THREE.Color(hexColor),
            side: THREE.DoubleSide 
        });

        if (surfaceType === 'floor' && this.meshes.floor) {
            this.meshes.floor.material = newMat;
        } else if (surfaceType === 'ceiling' && this.meshes.ceiling) {
            this.meshes.ceiling.material = newMat;
        } else if (surfaceType === 'wall') {
            this.wallMaterial = newMat;
            this.meshes.walls.forEach(w => w.material = newMat);
        }
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
        if (this.meshes && this.meshes.ceiling) {
            this.meshes.ceiling.visible = visible;
        }
    }

    // Advanced Helper: Loads a realistic model and dynamically squishes/stretches it to fit exact parametric dimensions
    async loadDynamicModel(url, position, rotation, targetWidth, targetHeight, targetDepth, parentGroup = this.roomGroup) {
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
            (parentGroup || this.roomGroup).add(model);
        } catch (error) {
            console.error(`Failed to dynamically load model from ${url}`, error);
        }
    }
}
