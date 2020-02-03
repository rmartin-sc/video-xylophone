/**
 * This code has been adapted from the example at https://www.adobe.com/devnet/archive/html5/articles/javascript-motion-detection.html
 */

const video = document.getElementById('webcam');
const audioElements = document.querySelectorAll('audio');
const source = document.getElementById('source');
const blended = document.getElementById('blended');
const sourceContext = source.getContext('2d');
const blendedContext = blended.getContext('2d');
let oldImage;

const keyElements = document.getElementsByClassName('key');

let keys = [];

const scratch = document.getElementById('scratch');
const scratchContext = scratch.getContext('2d');
// const neww = document.getElementById('new');
// const oldd = document.getElementById('old');
// const newContext = neww.getContext('2d');
// const oldContext = oldd.getContext('2d');

// mirror the source canvas so users can play the xylphone as though it were in a mirror
sourceContext.translate(source.width, 0);
sourceContext.scale(-1, 1);

function fastAbs(n) {
    //return Math.abs(n);
    return (n ^ (n >> 31)) - (n >> 31);
}

function threshold(n) {
    return ( n  > 0x15 ) ? 0xFF : 0;
}

function diff(target, data1, data2) {
    // blend mode difference
    if (data1.length != data2.length) return null;
    let i = 0;
    while (i < (data1.length * 0.25)) {

        const avg1 = (data1[4*i] + data1[4*i+1] + data1[4*i+2]) / 3;
        const avg2 = (data2[4*i] + data2[4*i+1] + data2[4*i+2]) / 3;
        const d = threshold(fastAbs(avg1 - avg2));
        target[4*i] = d;
        target[4*i+1] = d;
        target[4*i+2] = d;
        target[4*i+3] = 0xFF;
        ++i;
    }
}

function blend() {
    const w = source.width;
    const h = source.height;

    const newImage = sourceContext.getImageData(0, 0, w, h);
    // oldContext.putImageData(oldImage, 0, 0);
    // newContext.putImageData(newImage, 0, 0);

    const blendedImage = sourceContext.createImageData(w, h);

    diff(blendedImage.data, newImage.data, oldImage.data)

    blendedContext.putImageData(blendedImage, 0, 0);
    
    oldImage = newImage;
}

function checkKeyHit() {

    for ( const k of keys ) {

        const data = blendedContext.getImageData(k.rect.x, k.rect.y, k.rect.w, k.rect.h);
        scratchContext.putImageData(data, k.rect.x, 0);

        let whitePixels = 0;
        for ( let i = 0 ; i < data.data.length ; i += 4 ) {
            whitePixels += (data.data[i] ? 1 : 0);
        }

        // if more than 1/10th of the pixels are white we'll call it a key hit
        if ( whitePixels > data.data.length * 0.02 ) {
            console.log("playing key #" + k.id + " (w: " + whitePixels + ", L: " + data.data.length + ")");
            k.play();
        }

    }
}

function update() {
    
    // draw the video onto the source canvas
    sourceContext.drawImage(video, 0, 0, video.width, video.height);

    blend();
    checkKeyHit();
    timeout = setTimeout(update, 1000/24);
}

function init() {

    initKeys();

    initVideo();
}

function initKeys() {

    for ( let i = 0 ; i < audioElements.length ; ++i ) {
        const keyEl = keyElements[i];
        const sound = audioElements[i];
        let keyInfo = {
            id : (i+1),
            el : keyEl,
            sound : sound,
            lastHitTimestamp: Date.now(),
            play: function() { 
                const now = Date.now();
                if ( this.lastHitTimestamp < now - 500 ) {
                    sound.cloneNode().play(); 
                    this.lastHitTimestamp = now;
                    this.el.classList.add('played');
                    setTimeout(() => this.el.classList.remove('played'), 100);
                }
            },
            rect : { 
                x: keyEl.offsetLeft, 
                y: keyEl.offsetTop, 
                w: keyEl.clientWidth, 
                h: keyEl.clientHeight 
            }
        }

        keyEl.addEventListener('click', () => keyInfo.play());

        keys.push(keyInfo);
    }

}

function preventKeySmash() {
    for ( const k of keys ) {
        k.lastHitTimestamp = Date.now() + 2000;
    }
}

function initVideo() {

    if ( navigator.mediaDevices && navigator.mediaDevices.getUserMedia ) {
        navigator.mediaDevices.getUserMedia({ audio: false, video: true })
            .then((stream) => {
                video.srcObject = stream;

                // Get one frame of video before we start so that we have a prevImage to work with
                sourceContext.drawImage(video, 0, 0, video.width, video.height);
                oldImage = sourceContext.getImageData(0, 0, source.width, source.height);

                preventKeySmash();

                update();
            })
            .catch((err) => {
                alert(err);
                console.log(err);
            });
    } else {
        alert('nope');
    }
}

window.addEventListener('load', init);