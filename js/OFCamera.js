const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const canvasCtx = canvasElement.getContext('2d');
let prevGrayImageData;
let lastFlow; // Variable to store the last processed flow
let videoDevices = [];
let selectedDevice = null;

// Modal elements
const cameraModal = document.getElementById('camera-modal');
const closeModalButton = cameraModal.querySelector('.close');
const cameraSelect = document.getElementById('camera-select');
const startButton = document.getElementById('start-button');
const selectCameraButton = document.getElementById('select-camera-btn');

// Open camera selection modal
selectCameraButton.addEventListener('click', async () => {
    await requestCameraPermissions();
    await getVideoDevices(); // Get the list of video devices
    populateCameraSelect();
    cameraModal.style.display = 'flex';
});

// Close modal
closeModalButton.addEventListener('click', () => {
    cameraModal.style.display = 'none';
});

// Populate camera select dropdown
function populateCameraSelect() {
    cameraSelect.innerHTML = '';
    videoDevices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Camera ${device.deviceId}`;
        cameraSelect.appendChild(option);
    });
    selectedDevice = cameraSelect.value; // Set the initial selected device
}

// Request camera permissions
async function requestCameraPermissions() {
    try {
        await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (error) {
        console.error("Camera permissions not granted.", error);
        alert("Unable to access your camera. Please check your permissions.");
    }
}

// Get video devices
async function getVideoDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        videoDevices = devices.filter(device => device.kind === 'videoinput');
        if (videoDevices.length === 0) {
            alert("No cameras found.");
        }
    } catch (error) {
        console.error("Error enumerating devices.", error);
    }
}

// Start processing with the selected camera
startButton.addEventListener('click', async () => {
    selectedDevice = cameraSelect.value; // Update selected device
    await setupCamera(selectedDevice);
    cameraModal.style.display = 'none'; // Close the modal
    videoElement.play();
    main();
});

// Set up the camera with the selected device
async function setupCamera(deviceId) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: deviceId }, width: 960, height: 540 }
        });
        videoElement.srcObject = stream;
    } catch (error) {
        console.error("Error accessing the camera.", error);
        alert("Unable to access the selected camera. Please select another one.");
    }
}

// Convert frame to grayscale
function toGrayScale(frame) {
    const gray = new ImageData(frame.width, frame.height);
    for (let i = 0; i < frame.data.length; i += 4) {
        const avg = (frame.data[i] + frame.data[i + 1] + frame.data[i + 2]) / 3;
        gray.data[i] = avg;     // R
        gray.data[i + 1] = avg; // G
        gray.data[i + 2] = avg; // B
        gray.data[i + 3] = 255;  // A
    }
    return gray;
}

// Calculate optical flow
function calculateOpticalFlow(prevGray, currentGray) {
    const width = currentGray.width;
    const height = currentGray.height;

    const flow = new Array(height).fill(0).map(() => new Array(width).fill(0).map(() => [0, 0]));

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const I_x = (prevGray.data[((y) * width + (x + 1)) * 4] - prevGray.data[((y) * width + (x - 1)) * 4]) / 2;
            const I_y = (prevGray.data[((y + 1) * width + x) * 4] - prevGray.data[((y - 1) * width + x) * 4]) / 2;
            const I_t = (currentGray.data[(y * width + x) * 4] - prevGray.data[(y * width + x) * 4]);

            // Simple implementation of Lucas-Kanade
            const determinant = I_x * I_x + I_y * I_y;
            if (determinant !== 0) {
                const u = (I_y * -I_t) / determinant;
                const v = (I_x * -I_t) / determinant;
                flow[y][x] = [u, v];
            }
        }
    }
    return flow;
}

// Draw optical flow on canvas
function drawOpticalFlow(flow, width, height) {
    const hsv = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const [u, v] = flow[y][x];
            const magnitude = Math.sqrt(u * u + v * v);
            const angle = Math.atan2(v, u);

            // Map angle to hue (0 to 360 degrees)
            const hue = (angle + Math.PI) * (180 / Math.PI) / 2;
            const saturation = 255;
            const value = Math.min(255, Math.floor(magnitude * 5)); // Adjust scale as necessary

            const index = (y * width + x) * 4;
            hsv[index] = hue;                // H
            hsv[index + 1] = saturation;     // S
            hsv[index + 2] = value;          // V
            hsv[index + 3] = 255;            // Alpha
        }
    }

    // Convert HSV to RGB for drawing
    const rgb = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < hsv.length; i += 4) {
        const h = hsv[i] / 255;
        const s = hsv[i + 1] / 255;
        const v = hsv[i + 2] / 255;
        const c = v * s;
        const x = c * (1 - Math.abs((h * 6) % 2 - 1));
        const m = v - c;

        let r, g, b;
        if (0 <= h && h < 1 / 6) {
            r = c; g = x; b = 0;
        } else if (1 / 6 <= h && h < 1 / 3) {
            r = x; g = c; b = 0;
        } else if (1 / 3 <= h && h < 1 / 2) {
            r = 0; g = c; b = x;
        } else if (1 / 2 <= h && h < 2 / 3) {
            r = 0; g = x; b = c;
        } else if (2 / 3 <= h && h < 5 / 6) {
            r = x; g = 0; b = c;
        } else {
            r = c; g = 0; b = x;
        }

        rgb[i] = (r + m) * 255;
        rgb[i + 1] = (g + m) * 255;
        rgb[i + 2] = (b + m) * 255;
        rgb[i + 3] = 255; // Alpha
    }

    // Draw on canvas
    const imageData = new ImageData(rgb, width, height);
    canvasCtx.putImageData(imageData, 0, 0);
}

// Main processing function
async function main() {
    const processVideo = async () => {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
        const currentImageData = canvasCtx.getImageData(0, 0, canvasElement.width, canvasElement.height);
        const currentGray = toGrayScale(currentImageData);

        if (prevGrayImageData) {
            lastFlow = calculateOpticalFlow(prevGrayImageData, currentGray);
            drawOpticalFlow(lastFlow, canvasElement.width, canvasElement.height);
        }

        prevGrayImageData = currentGray;

        requestAnimationFrame(processVideo);
    };

    processVideo();
}

// Initialize camera modal functionality
cameraModal.style.display = 'none'; // Hide modal on load
