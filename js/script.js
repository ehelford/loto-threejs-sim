import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Renderer color management
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Default lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
hemi.position.set(0, 2, 0);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(3, 5, 4);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.5);
fill.position.set(-4, 2, -2);
scene.add(fill);

// --- Picking setup
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let INTERSECTED = null;
const interactiveTargets = [];

// State machine for logic gating
const loto = {
    step: 1, // 1=ShutDown, 2=OpenBreakerBox, 3=FlipSwitch, 4=LockTag, 5=Verify
    done: { shutdown: false, door: false, switch: false, lock: false, verify: false }
};

function toast(msg) { console.log(msg); }

// Load the GLB model
const loader = new GLTFLoader();
let model, cameraNodes = {};
let drillBit = null;
let lockTagDevice = null;
let sceneCenter = new THREE.Vector3();

loader.load(
    './models/my-model.glb', // YOUR WORKING FILE PATH
    function (gltf) {
        model = gltf.scene;
        scene.add(model);

        cameraNodes = {};
        model.traverse((node) => {
            if (node.isCamera) {
                cameraNodes[node.name || node.uuid] = node;
            }
        });
        window.__cameraNodes = cameraNodes;

        const initialCamera = cameraNodes['Camera_Main'];
        if (initialCamera) {
            initialCamera.updateWorldMatrix(true, false);
            camera.position.setFromMatrixPosition(initialCamera.matrixWorld);
            const q = new THREE.Quaternion();
            initialCamera.getWorldQuaternion(q);
            camera.quaternion.copy(q);
            if (initialCamera.isPerspectiveCamera) {
                camera.fov = initialCamera.fov;
                camera.near = initialCamera.near;
                camera.far = initialCamera.far;
            }
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            sceneCenter.copy(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()));
            controls.target.copy(sceneCenter);
        }

        drillBit = model.getObjectByName('drill_bit');
        if (drillBit) drillBit.userData = { isRotating: true }; // Initialize rotation state
        lockTagDevice = model.getObjectByName('Lock_Tag_Device');
        if (lockTagDevice) lockTagDevice.visible = false;

        const drillPressButton = model.getObjectByName('DrillPress_Button');
        const breakerBox = model.getObjectByName('Breaker_Box');
        const breakerBoxDoor = model.getObjectByName('Breaker_Box_Door');
        const breakerBoxSwitch = model.getObjectByName('Breaker_Box_Switch');

        // Debug initial rotation from Blender
        if (breakerBoxSwitch) {
            console.log('Initial breaker rotation from Blender:', breakerBoxSwitch.rotation.x * (180 / Math.PI)); // Debug initial rotation in degrees
        }

        [drillPressButton, breakerBox, breakerBoxDoor, breakerBoxSwitch].forEach(obj => {
            if (!obj) return;
            if (obj.isMesh) interactiveTargets.push(obj);
            else obj.traverse(n => { if (n.isMesh) interactiveTargets.push(n); });
        });

        if (drillPressButton) drillPressButton.userData.role = 'button';
        if (breakerBox) breakerBox.userData.role = 'breaker_box';
        if (breakerBoxDoor) breakerBoxDoor.userData.role = 'door';
        if (breakerBoxSwitch) breakerBoxSwitch.userData.role = 'switch';

        controls.update();
        updateChecklist();
    },
    (progress) => console.log('Loading progress:', `${(progress.loaded / progress.total * 100).toFixed(0)}%`),
    (error) => console.error('Error loading GLB:', error)
);

// --- Camera tween helper ---
let _camTween = null;

function switchCameraSmooth(cameraName, ms = 800, onComplete = null, ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) {
    const node = cameraNodes[cameraName];
    if (!node) {
        console.warn(`Camera node '${cameraName}' not found`);
        return;
    }

    node.updateWorldMatrix(true, false);
    const startPos = camera.position.clone();
    const startQ = camera.quaternion.clone();
    const endPos = new THREE.Vector3().setFromMatrixPosition(node.matrixWorld);
    const endQ = new THREE.Quaternion().setFromRotationMatrix(node.matrixWorld);

    if (node.isPerspectiveCamera) {
        camera.fov = node.fov;
        camera.near = node.near;
        camera.far = node.far;
    }
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    if (_camTween && _camTween.cancel) _camTween.cancel();
    let start = null, cancelled = false;
    _camTween = { cancel: () => cancelled = true };

    function step(ts) {
        if (cancelled) return;
        if (start === null) start = ts;
        const t = Math.min(1, (ts - start) / ms);
        const k = ease(t);
        camera.position.lerpVectors(startPos, endPos, k);
        camera.quaternion.slerpQuaternions(startQ, endQ, k);

        if (t < 1) {
            requestAnimationFrame(step);
        } else {
            controls.target.copy(sceneCenter); // Reset target to scene center
            if (onComplete) onComplete();
        }
    }
    requestAnimationFrame(step);
}

// Add checklist to the DOM
function updateChecklist() {
    let checklistHTML = `
        <div id="checklist" style="position: absolute; left: 20px; top: 20px; background: rgba(0, 0, 0, 0.7); color: white; padding: 10px; border-radius: 5px; font-family: Arial, sans-serif; pointer-events:none;">
            <h3>Checklist</h3>
            <ul>
                <li style="color: ${loto.done.shutdown ? '#7CFC00' : 'white'}">1. Turn Off the Machine</li>
                <li style="color: ${loto.done.door ? '#7CFC00' : 'white'}">2. Open the Breaker Box</li>
                <li style="color: ${loto.done.switch ? '#7CFC00' : 'white'}">3. Flip the Main Breaker Switch</li>
                <li style="color: ${loto.done.lock ? '#7CFC00' : 'white'}">4. Apply Lock and Tag</li>
                <li style="color: ${loto.done.verify ? '#7CFC00' : 'white'}">5. Verify Zero Energy</li>
            </ul>
        </div>
    `;
    const checklist = document.getElementById('checklist');
    if (checklist) {
        checklist.innerHTML = new DOMParser().parseFromString(checklistHTML, 'text/html').body.firstChild.innerHTML;
    } else {
        document.body.insertAdjacentHTML('afterbegin', checklistHTML);
    }
}

// Pointer helpers
function setPointerFromEvent(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

// Add OrbitControls (but disabled for fixed camera)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;

// Click listeners
renderer.domElement.addEventListener('click', (e) => {
    setPointerFromEvent(e);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(interactiveTargets, true);
    if (!hits.length) {
        console.log('No hits detected');
        return;
    }

    let node = hits[0].object;
    while (node && !node.userData.role && node.parent) node = node.parent;

    if (!node || !node.userData.role) {
        console.log('No valid role found on hit object');
        return;
    }

    console.log('Clicked object role:', node.userData.role);
    if (node.userData.role === 'button') pressButton(node);
    if (node.userData.role === 'breaker_box') clickBreakerBox(node);
    if (node.userData.role === 'door') toggleDoor(node);
    if (node.userData.role === 'switch') toggleSwitch(node);
});

// Simple action handlers with logic gating
let buttonPressed = false;
function pressButton(node) {
    if (loto.step === 1 && !loto.done.shutdown) {
        buttonPressed = !buttonPressed;
        node.position.z += 0.02 * (buttonPressed ? -1 : 1);

        loto.done.shutdown = true;
        loto.step = 2;
        updateChecklist();
        toast("Powered down. Returning to main view.");

        switchCameraSmooth('Off_Switch_Camera', 700, () => {
            setTimeout(() => {
                switchCameraSmooth('Camera_Main', 800);
            }, 500); // 0.5-second pause before returning
        });

    } else if (loto.step === 5 && loto.done.lock && !loto.done.verify) {
        buttonPressed = !buttonPressed;
        node.position.z += 0.02 * (buttonPressed ? -1 : 1);

        loto.done.verify = true;
        toast("Verification complete — zero energy. Procedure finished.");
        updateChecklist();
        onSimulationComplete();
    } else {
        toast("This is not the correct step for this action.");
    }
}

function clickBreakerBox(node) {
    if (loto.step !== 2) { toast("You must turn off the machine first."); return; }
    toast("Click the breaker box door to open it.");
    switchCameraSmooth('Breaker_Box_Camera', 700);
}

let doorOpen = false;
function toggleDoor(node) {
    if (loto.step < 2 || loto.step > 3) { toast("This is not the correct step for this action."); return; }

    doorOpen = !doorOpen;
    node.rotation.y = doorOpen ? Math.PI / 2 : 0;

    if (doorOpen && !loto.done.door) {
        loto.done.door = true;
        loto.step = 3;
        toast("Door open. Flip the main breaker to isolate.");
        switchCameraSmooth('Breaker_Switch_Camera', 700, updateChecklist);
    }
}

let switchDown = false;
function toggleSwitch(node) {
    if (loto.step !== 3) {
        toast("You must open the breaker door first.");
        console.log('Step mismatch:', loto.step);
        return;
    }

    console.log('Toggling switch, removing breaker');
    switchDown = !switchDown;
    if (switchDown && !loto.done.switch) {
        if (node.parent) {
            node.parent.remove(node); // Remove the breaker from its parent
        } else {
            scene.remove(node); // Remove directly if no parent
        }
        if (lockTagDevice) lockTagDevice.visible = true; // Reveal the lock and tag
        loto.done.switch = true;
        loto.step = 4;
        toast("Energy isolated. Applying lock and tag...");
        if (drillBit) drillBit.userData.isRotating = false;
        updateChecklist();

        setTimeout(() => {
            loto.done.lock = true;
            toast("Lock and tag applied.");
            setTimeout(() => {
                loto.step = 5;
                toast("Return to the machine to verify zero energy.");
                switchCameraSmooth('Camera_Main', 800, updateChecklist);
            }, 3000); // 3-second pause after lock and tag
        }, 3000); // 3-second pause after switch
    }
}

// Simulation completion
function onSimulationComplete() {
    try {
        const player = window.parent && window.parent.GetPlayer ? window.parent.GetPlayer() : null;
        if (player) {
            player.SetVar('SimComplete', true);
            toast("Reported completion to Storyline.");
        } else {
            toast("Storyline player not found; using postMessage fallback.");
            window.parent.postMessage({ type: 'SIM_COMPLETE' }, '*');
        }
    } catch (e) {
        console.warn("Storyline SetVar failed; using postMessage fallback.", e);
        window.parent.postMessage({ type: 'SIM_COMPLETE' }, '*');
    }
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    if (drillBit && drillBit.userData.isRotating) {
        drillBit.rotation.y += 0.05;
    }
    renderer.render(scene, camera);
}
animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});