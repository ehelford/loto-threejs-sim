// AT THE VERY TOP OF js/main.js

// INCORRECT ❌ (This is likely what you have)
// import * as THREE from 'three';
// import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// CORRECT ✅ (Replace the incorrect lines with these)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.module.js';

import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/loaders/GLTFLoader.js';

import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/controls/OrbitControls.js';

// ... the rest of your main.js code

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaaaaaa);

// Camera
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(2, 2, 4);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();

// Lighting
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(hemi);
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.position.set(3, 5, 2);
scene.add(dirLight);

// Load GLB
const loader = new GLTFLoader();
let drillButton, breakerDoor, breakerSwitch;

loader.load('./assets/drillpress_scene.glb', gltf => {
  const model = gltf.scene;
  scene.add(model);

  drillButton = model.getObjectByName('DrillPress_Button');
  breakerDoor = model.getObjectByName('BreakerBox_Door');
  breakerSwitch = model.getObjectByName('BreakerBox_Switch');
}, undefined, err => console.error(err));

// Raycaster
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', e => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects([drillButton, breakerDoor, breakerSwitch], true);
  if (intersects.length > 0) {
    const obj = intersects[0].object;
    if (obj === drillButton) pressButton();
    if (obj === breakerDoor) toggleDoor();
    if (obj === breakerSwitch) toggleSwitch();
  }
});

// Simple animations
let buttonDown = false;
function pressButton() {
  if (!drillButton) return;
  drillButton.position.z += buttonDown ? 0.02 : -0.02;
  buttonDown = !buttonDown;
}

let doorOpen = false;
function toggleDoor() {
  if (!breakerDoor) return;
  breakerDoor.rotation.y = doorOpen ? 0 : Math.PI / 2;
  doorOpen = !doorOpen;
}

let switchOn = false;
function toggleSwitch() {
  if (!breakerSwitch) return;
  breakerSwitch.rotation.x = switchOn ? 0 : -Math.PI / 4;
  switchOn = !switchOn;
}

// Animate
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
