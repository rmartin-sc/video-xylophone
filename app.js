const video = document.getElementById('webcam');
let vw, vh; // Video width and height

const audioElements = document.querySelectorAll('audio');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayCtx = overlay.getContext('2d');
const diffCanvas = document.getElementById('diff');
const diffCtx = diffCanvas.getContext('2d');

let detectionMode = 'videodiff';

let handDetectionWorker;
let readyToDetect = false;
let detectedHands = [];

let keys = [];
let particles = [];

let lastPosture = { left: "closed", right: "closed" };
const THUMB_TIP = 4;
const INDEX_FINGER_TIP = 8;

async function init() {

    document.getElementById('detection-mode').onchange = e => {
        detectionMode = e.target.value;
        e.target.dataset.chosen = e.target.value;

        if ( detectionMode == 'tensorflow' && ! handDetectionWorker ) {
            initHandDetectionWorker();
        }
    }

    initPointerHandler();
 
    await initVideo();
}
init();

function initPointerHandler() {
    overlay.onpointerdown = e => {
        tryKeyPress(e.offsetX, e.offsetY);
    }
}

function initHandDetectionWorker() {

    handDetectionWorker = new Worker("hand-detection-worker.js");
    handDetectionWorker.onmessage = e => {
        const msg = e.data;

        switch ( msg.type ) {
            case "loaded":
                readyToDetect = true;
                break;
            case "detected":
                readyToDetect = true;
                detectedHands = msg.hands;
                break;
        }
    }
    handDetectionWorker.postMessage({type:"load"});
}


async function initVideo() {

    if ( navigator.mediaDevices && navigator.mediaDevices.getUserMedia ) {
        let stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
        video.srcObject = stream;
        video.onloadeddata = () => {
            vw = video.videoWidth;
            vh = video.videoHeight;

            initKeys();
    
            canvas.width = vw;
            canvas.height = vh;
            overlay.width = vw;
            overlay.height = vh;
            diffCanvas.width = vw;
            diffCanvas.height= vh;
    
            // mirror the source canvas so users can play the xylphone as though it were in a mirror
            ctx.translate(vw, 0);
            ctx.scale(-1, 1);

            previousVideoFrame = grayscale(ctx.getImageData(0, 0, vw, vh));
    
            update();
        }
    } else {
        alert('nope');
    }
}

function initKeys() {

    const n = audioElements.length;
    for ( let i = 0 ; i < n ; ++i ) {
        const sound = audioElements[i];
        let keyInfo = {
            id : (i+1),
            sound : sound,
            play: function() { 
                // Clone so we can play the same note multiple times 
                // before one note sound is done playing
                sound.cloneNode().play()
            },
            width : (vw-100)/n - 10,
            height: 150,
            x: i*((vw-100)/n) + 50,
            y: 0,
            diffPressed: false      // True if this key was pressed by the video diff algorithm
        }

        keys.push(keyInfo);
    }

}

let lastUpdateTime;
let fps;
async function update(now) {

    if ( ! lastUpdateTime ) { lastUpdateTime = now; }
    const dt = now - lastUpdateTime;
    lastUpdateTime = now;

    fps = Math.round(1000/dt);

    ctx.drawImage(video, 0, 0, vw, vh);

    if ( detectionMode == 'tensorflow' ) {
        if ( readyToDetect ) {
            readyToDetect = false;
            const image = await createImageBitmap(ctx.getImageData(0, 0, vw, vh));
            handDetectionWorker.postMessage({
                type: "detect", 
                image: image
            },
            [image]);
        }
    }

    if ( detectionMode == 'videodiff' ) {
        const videoFrame = grayscale(ctx.getImageData(0, 0, vw, vh));
        
        const d = diff(videoFrame, previousVideoFrame);
        
        diffCtx.putImageData(d, 0, 0);

        checkKeyDiffs();

        previousVideoFrame = videoFrame;
    }
    
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);

    drawKeys(overlayCtx);

    overlayCtx.fillStyle = "red";
    overlayCtx.font = "normal 12px sans-serif";
    overlayCtx.fillText("FPS: " + fps, 10, 20);

    // handle detected hands
    if ( detectionMode == 'tensorflow' ) {
        for ( const hand of detectedHands ) {

            updateHand(hand);
            drawHand(overlayCtx, hand);

        }  
    }

    updateParticles(dt);
    drawParticles(overlayCtx);

    requestAnimationFrame(update);
}

function drawKeys(ctx) {
    // draw keys
    ctx.fillStyle = 'black';
    for ( const k of keys ) {
        ctx.beginPath();
        ctx.rect(k.x, k.y, k.width, k.height);
        ctx.fill();    
    }
}

function updateHand(hand) {

    const whichHand = hand.handedness.toLowerCase();

    // Play note when hand changes from non-closed to closed posture
    if ( lastPosture[whichHand] !== "closed" && isHandClosed(hand) ) {
        lastPosture[whichHand] = "closed";
        const x = overlay.width - (hand.keypoints[THUMB_TIP].x + hand.keypoints[INDEX_FINGER_TIP].x)/2;
        const y = (hand.keypoints[THUMB_TIP].y + hand.keypoints[INDEX_FINGER_TIP].y)/2;
        
        tryKeyPress(x, y);
    } else if ( lastPosture[whichHand] === "closed" && !isHandClosed(hand) ) {
        lastPosture[whichHand] = "open";
    }
}

function isHandClosed(hand) {
    const thumbTip = hand.keypoints3D[THUMB_TIP];
    const indexTip = hand.keypoints3D[INDEX_FINGER_TIP];

    const dx = thumbTip.x - indexTip.x;
    const dy = thumbTip.y - indexTip.y;
    const dz = thumbTip.z - indexTip.z;
    const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
    // console.log(d);
    return d < 0.06;
}

function drawHand(ctx, hand) {
    ctx.fillStyle = 'red';
    const thumbTip = hand.keypoints[THUMB_TIP];
    const indexTip = hand.keypoints[INDEX_FINGER_TIP];
    ctx.beginPath();
    ctx.arc(overlay.width - thumbTip.x, thumbTip.y, 5, 0, Math.PI*2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(overlay.width - indexTip.x, indexTip.y, 5, 0, Math.PI*2);
    ctx.fill();
}

function tryKeyPress(x, y) {
    const k = getPressedKey(x, y);
    if ( k !== null ) {
        k.play()
        makeNoteParticles(x, y);
    }
}

function getPressedKey(x, y) {

    for ( const k of keys ) {
        if ( k.x <= x && x <= k.x+k.width && k.y <= y && y <= k.y+k.height ) {
            return k;
        }
    }
    return null;
}

function checkKeyDiffs() {
    for ( const k of keys ) {
        const image = diffCtx.getImageData(k.x, k.y, k.width, k.height);

        let whitePixels = 0;
        for ( let i = 0 ; i < image.data.length ; i += 4 ) {
            whitePixels += (image.data[i] ? 1 : 0);
        }

        // Check if the key was considered pressed in the previous diff check
        if ( k.diffPressed ) {
            // If it was, then wait until there's very little difference between frames to consider it unpressed
            if ( whitePixels < image.data.length * 0.002 ) {
                //console.log(`releasing key ${k.id}`);
                k.diffPressed = false;
            }
        } else {
            // If it wasn't then wait until there is a good proportion of difference between frames to consider it pressed
            if ( whitePixels > image.data.length * 0.02 ) {
                //console.log(`pressing key ${k.id}`);
                k.diffPressed = true;
                k.play();
                makeNoteParticles(k.x + k.width/2, k.y + k.height - 10);
            }
        }
    }
}

function makeNoteParticles(x, y) {
    // Generate some note particles
    const n = Math.random()*10 + 15;
    for ( let i = 0 ; i < n ; i += 1 ) {
        particles.push({
            x, y,
            // Velocities in pixels per second
            vx: (Math.random()*400 - 200)/1000,
            vy: (Math.random()*400 - 200)/1000,
            opacity: 100,
            hue: 360 * (x/vw)  - Math.random()*(360/keys.length)
        })
    }
}

function updateParticles(dt) {
    for ( const p of particles ) {
        p.x += p.vx * dt;
        p.vy += 0.01;
        p.y += p.vy * dt;
        p.opacity -= 2;
    }
    // Remove 'dead' particles
    particles = particles.filter(p => p.opacity > 0);

}
function drawParticles(ctx) {
    ctx.font = "30px serif";
    for ( const p of particles ) {        
        ctx.fillStyle = `hsl(${p.hue}, 100%, 50%, ${p.opacity}%)`;        
        ctx.fillText('♪', p.x, p.y);
    }
}

function fastAbs(n) {
    //return Math.abs(n);
    return (n ^ (n >> 31)) - (n >> 31);
}

function threshold(n) {
    return ( n  > 0x10 ) ? 0xFF : 0;
}

function grayscale(image) {
    const pixels = image.data;
    for ( var i = 0 ; i < pixels.length ; i += 4 ) {
        const avg = (pixels[i] + pixels[i+1] + pixels[i+2])/3;
        pixels[i] = avg;
        pixels[i+1] = avg;
        pixels[i+2] = avg;
    }

    return image;
}

function diff(image1, image2) {
    const pixels1 = image1.data;
    const pixels2 = image2.data;

    const d = diffCtx.createImageData(vw, vh);
    for ( var i = 0 ; i < pixels1.length ; i += 4 ) {
        const pd = threshold(fastAbs(pixels1[i] - pixels2[i]));

        d.data[i] = pd;
        d.data[i+1] = pd;
        d.data[i+2] = pd;
        d.data[i+3] = 255;
    }

    return d;
}