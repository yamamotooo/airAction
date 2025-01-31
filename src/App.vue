<template>
  
    <video id="input_video" width="640px" height="480px" autoplay style="display:none"></video>  
    <canvas id="output_canvas"  width="640px" height="480px"></canvas>
  
  <div :class="['animate', animationClass]">
    <span v-for="(char, index) in displayText" :key="index">{{ char === ' ' ? '\u00A0' : char }}</span>
  </div>
</template>

<script setup>
import pose_landmarker_task from "./assets/pose_landmarker_lite.task";
import { ref, onMounted } from "@vue/runtime-core";
import { PoseLandmarker, DrawingUtils, FilesetResolver } from "@mediapipe/tasks-vision";
let windowFrame = 64;
let predectionFlg = true;
let poseLandmarker;
let buffer = [];
const dataCollector = collectData(windowFrame);

let displayText = ref(null);
let animationClass = ref(null);

function restartTextAnimation(actionText) {
  displayText.value = actionText;
  animationClass.value = "";
    setTimeout(() => {
      animationClass.value = "seven";
    }, 20);
}

function clearPredectionFlg() {
  predectionFlg = true;
}

function exec(s, p) {
  if(window.FileMaker != null) {
      window.FileMaker.PerformScriptWithOption(s, p, 5);
  } else {
      setTimeout(exec, 100, s, p); // 1s = 1000ms
  };
}

function generateSecondData() {
  const data = [];
  for (let i = 0; i < 18; i++) {
    data.push({
      x: `x ${i}: ${ Math.random() * 100}`,
      y: `y ${i}: ${ Math.random() * 100}`,
      z: `z ${i}: ${ Math.random() * 100}`,
      visibility: `visibility ${i}: ${ Math.random() * 100}`,
    });
  }
  return data;
}

function collectData( seconds = windowFrame ) {
  return {
    addSecondData: (secondData) => {
      buffer.push(secondData);
      if (buffer.length > seconds) {
        buffer.shift();
      }
    },
    processBuffer: () => {
      const result = [];
      buffer.forEach((secondData) => {
        secondData.forEach((data) => {
          result.push(data.x);
          // x座標マイナスを補正
          // result.push(Math.max(0, Math.min(data.x, 1)));
        });
        secondData.forEach((data) => {
          // y座標を vison 用に変換
          result.push(1 - data.y);
        });
        secondData.forEach((data) => {
          result.push(data.visibility);
          // result.push(1.0);
        });
      });
      return result;        
    },
  };
}

function setup(){
  const videoElement = document.getElementById("input_video");
  const canvasElement = document.getElementById("output_canvas");
  const canvasCtx = canvasElement.getContext("2d");
  const drawingUtils = new DrawingUtils(canvasCtx);
  enableWebcam();

  function enableWebcam(event) {
    const constraints = {
      video: { 
        frameRate: { min: 30 },
      },
    };
    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      videoElement.srcObject = stream;
      videoElement.play();
      videoElement.addEventListener("loadeddata", predictWebcam);
    });
  };

  let lastVideoTime = -1;
  async function predictWebcam() {
    let transformedLandmarks = [];
    function calculateMidPoint(pointA, pointB) {
      return {
        x: (pointA.x + pointB.x) / 2,
        y: (pointA.y + pointB.y) / 2,
        z: (pointA.z + pointB.z) / 2,
        visibility: (pointA.visibility + pointB.visibility) / 2,
      };
    };
    let startTimeMs = performance.now();
    if (lastVideoTime !== videoElement.currentTime) {
      lastVideoTime = videoElement.currentTime;
      // canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      canvasCtx.drawImage(videoElement, 0, 0, videoElement.width, videoElement.height);
      poseLandmarker.detectForVideo(videoElement, startTimeMs, (result) => {
        //
        if (!result || !result.landmarks || result.landmarks.length === 0) {
          // result が空の場合は buffer を初期化
          buffer = [];
          return;
        } else {
          let landmarks = result.landmarks[0];
          landmarks.push(calculateMidPoint(landmarks[11], landmarks[12])); //neck (calculated as the midpoint of left shoulder and right shoulder)
          const transform = [
            0, // 0:nose
            33, // 1:neck (calculated as the midpoint of left shoulder and right shoulder)
            12, // 2:right shoulder
            14, // 3:right elbow
            16, // 4:right wrist
            11, // 5:left shoulder
            13, // 6:left elbow
            15, // 7:left wrist
            24, // 8:right hip
            26, // 9:right knee
            28, // 10:right ankle
            23, // 11:left hip
            25, // 12:left knee
            27, // 13:left ankle
            5, // 14:right eye
            2, // 16:left eye
            8, // 16:right ear
            7, // 17:left ear
          ];
          transformedLandmarks = transform.map((index) => landmarks[index]);
          dataCollector.addSecondData(transformedLandmarks);
          if (buffer.length >= windowFrame){
            if (predectionFlg ) {
              predectionFlg = false;
              const finalArray = dataCollector.processBuffer();
              exec( 'prediction', finalArray );
            }
          }
        }
        canvasCtx.save();
        
        for (const landmark of result.landmarks) {          
          drawingUtils.drawLandmarks(/*[
              landmark[15], //右手首
              landmark[16], //左手首
              landmark[27], //左足首
              landmark[30], //右足首
            ]*/ transformedLandmarks, {
            radius: (data) => DrawingUtils.lerp(data.from.z, -0.5, 0.5, 5, 2.5),
            color: 'white',
          });
          const ARM_CONNECTIONS = [
            { "start":2, "end":3 }, // 右肩から右肘
            { "start":3, "end":4 }, // 右肘から右手首
            { "start":5, "end":6 }, // 左肩から左肘
            { "start":6, "end":7 }, // 左肘から左手首
          ];
          const LEG_CONNECTIONS = [
            { "start":8, "end":9 }, // 右腰から右膝
            { "start":9, "end":10 }, // 右膝から右足首
            { "start":11, "end":12 }, // 左腰から左膝
            { "start":12, "end":13 }, // 左膝から左足首
          ];
          drawingUtils.drawConnectors(transformedLandmarks, ARM_CONNECTIONS, {
            color: 'green',
            lineWidth: 5
          });
          drawingUtils.drawConnectors(transformedLandmarks, LEG_CONNECTIONS, {
            color: 'red',
            lineWidth: 5
          });
        }
        canvasCtx.restore();
      });
    }
    window.requestAnimationFrame(predictWebcam);
  };
}

onMounted(() => {
  const createPoseLandmarker = async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    );
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
        delegate: "GPU",
      },
      modelComplexity: 1, // 複雑度: 0 (高速), 1 (高精度)
      enableSegmentation: false,
      minPoseDetectionConfidence: 0.9,
      minPosePresenceConfidence: 0.9,
      minTrackingConfidence: 0.9,
      runningMode: "VIDEO",
      numPoses: 1
    });
    setup();
  };
  createPoseLandmarker();
})

window.clearPredectionFlg = clearPredectionFlg;
window.restartTextAnimation = restartTextAnimation;
</script>

<style scoped>
</style>
