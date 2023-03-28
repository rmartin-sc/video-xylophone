let detector;

const estimationConfig = { flipHorizontal: true };

onmessage = async (event) => {
    const msg = event.data;

    switch ( msg.type ) {
        case 'load':
            console.log("Loading tensorflow scripts...");
            importScripts("//cdn.jsdelivr.net/npm/@tensorflow/tfjs-core",
                            "//cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter",
                            "//cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl",
                            "//cdn.jsdelivr.net/npm/@tensorflow-models/hand-pose-detection");
            // importScripts("//cdn.jsdelivr.net/npm/@mediapipe/hands",
            //                 "//cdn.jsdelivr.net/npm/@tensorflow/tfjs-core",
            //                 "//cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl",
            //                 "//cdn.jsdelivr.net/npm/@tensorflow-models/hand-pose-detection");
            console.log("...done loading tensorflow scripts");

            console.log("Initializing tensorflow model...");
            const model = handPoseDetection.SupportedModels.MediaPipeHands;
            const detectorConfig = {
                runtime: 'tfjs', // 'mediapipe',
                // solutionPath: '//cdn.jsdelivr.net/npm/@mediapipe/hands',
                modelType: 'full',
            };
            detector = await handPoseDetection.createDetector(model, detectorConfig);
            console.log("...done initializing tensorflow model");
            postMessage({type: "loaded"});
        case 'detect':
            if ( detector ) {

                const hands = await detector.estimateHands(msg.image, estimationConfig);

                postMessage({
                    type: "detected",
                    hands: hands
                });
            } else {
                console.log("An attempt was made to detect hands before the model was loaded.");
            }
    }
}