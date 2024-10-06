const App = () => {
    return (
        <div>
            <h1>Optical Flow Visualization</h1>
            <div id="video-container">
                <video id="video" width="960" height="540" autoPlay muted></video>
                <canvas id="canvas" width="960" height="540"></canvas>
            </div>
            <div id="instructions">
                Allow camera access to see the optical flow in action!
            </div>
        </div>
    );
};

ReactDOM.render(<App />, document.getElementById('root'));

const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('canvas');
const canvasCtx = canvasElement.getContext('2d');
let prevGrayImageData;
let lastFlow; // Variable to store the last processed flow

async function setupCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 960, height: 540 }
    });
    videoElement.srcObject = stream;
}

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

async function main() {
    await setupCamera();
    videoElement.play();

    // Frame processing loop
    videoElement.addEventListener('playing', () => {
        const processFrame = () => {
            const startTime = performance.now(); // Start time for processing

            if (!videoElement.paused && !videoElement.ended) {
                canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
                
                const currentFrame = canvasCtx.getImageData(0, 0, canvasElement.width, canvasElement.height);
                const currentGray = toGrayScale(currentFrame);

                if (prevGrayImageData) {
                    const flow = calculateOpticalFlow(prevGrayImageData, currentGray);
                    drawOpticalFlow(flow, canvasElement.width, canvasElement.height);
                    lastFlow = flow; // Store last processed flow
                } else {
                    // Draw the last valid flow if it's not the first frame
                    if (lastFlow) {
                        drawOpticalFlow(lastFlow, canvasElement.width, canvasElement.height);
                    }
                }

                prevGrayImageData = currentGray;

                const endTime = performance.now(); // End time for processing
                const processingTime = endTime - startTime;

                // Display the last processed frame if processing takes too long
                if (processingTime > 100) { // Threshold in milliseconds
                    console.warn(`Frame processing took too long: ${processingTime} ms`);
                    // If processing took too long, draw the last valid flow again
                    if (lastFlow) {
                        drawOpticalFlow(lastFlow, canvasElement.width, canvasElement.height);
                    }
                }

                requestAnimationFrame(processFrame);
            }
        };
        processFrame();
    });
}

main();
