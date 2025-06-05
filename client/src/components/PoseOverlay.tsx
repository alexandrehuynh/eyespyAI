import { useRef, useEffect } from "react";
import { Results } from "@mediapipe/pose";

interface PoseOverlayProps {
  videoElement: HTMLVideoElement | null;
  isActive: boolean;
  onPoseResults?: (results: Results) => void;
  isPortraitMode?: boolean;
}

// MediaPipe pose connections
const POSE_CONNECTIONS = [
  // Face
  [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8],
  [9, 10],
  // Torso
  [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19],
  [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20],
  [11, 23], [12, 24], [23, 24],
  // Left arm
  [11, 13], [13, 15],
  // Right arm  
  [12, 14], [14, 16],
  // Left leg
  [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
  // Right leg
  [24, 26], [26, 28], [28, 30], [30, 32], [28, 32]
];

// Color mapping for different body parts
const getConnectionColor = (connection: number[]) => {
  const [start, end] = connection;
  
  // Arms (shoulders, elbows, wrists, hands)
  if ((start >= 11 && start <= 22) || (end >= 11 && end <= 22)) {
    if (start <= 16 || end <= 16) {
      return '#FF6B35'; // Orange for arms
    }
  }
  
  // Legs (hips, knees, ankles, feet)
  if ((start >= 23 && start <= 32) || (end >= 23 && end <= 32)) {
    return '#4CAF50'; // Green for legs
  }
  
  // Head and face
  if (start <= 10 || end <= 10) {
    return '#9C27B0'; // Purple for head
  }
  
  // Torso/core
  return '#9C27B0'; // Purple for torso/core
};

const getLandmarkColor = (index: number) => {
  // Arms (shoulders, elbows, wrists, hands)
  if (index >= 11 && index <= 22) {
    if (index <= 16) {
      return '#FF6B35'; // Orange for arms
    }
  }
  
  // Legs (hips, knees, ankles, feet)
  if (index >= 23 && index <= 32) {
    return '#4CAF50'; // Green for legs
  }
  
  // Head and torso
  return '#9C27B0'; // Purple for head/torso
};

export default function PoseOverlay({ videoElement, isActive, onPoseResults, isPortraitMode = true }: PoseOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive || !videoElement || !canvasRef.current) return;

    const initializePose = async () => {
      try {
        // Dynamically import MediaPipe Pose
        const { Pose } = await import('@mediapipe/pose');
        
        const pose = new Pose({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
          }
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        pose.onResults((results: Results) => {
          drawPose(results);
          if (onPoseResults) {
            onPoseResults(results);
          }
        });

        poseRef.current = pose;
        processFrame();
      } catch (error) {
        console.error('Error initializing MediaPipe Pose:', error);
      }
    };

    const processFrame = async () => {
      if (videoElement && poseRef.current && isActive && videoElement.readyState >= 2) {
        try {
          await poseRef.current.send({ image: videoElement });
        } catch (error) {
          console.error('Error processing frame:', error);
        }
      }
      
      if (isActive) {
        animationRef.current = requestAnimationFrame(processFrame);
      }
    };

    const drawPose = (results: Results) => {
      const canvas = canvasRef.current;
      if (!canvas || !results.poseLandmarks) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas size to match displayed video dimensions
      const rect = videoElement.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Transform normalized coordinates to canvas coordinates
      const transformLandmark = (landmark: any) => {
        let x = landmark.x;
        let y = landmark.y;

        if (isPortraitMode) {
          // In portrait mode, video is 1280x720 (16:9) but displayed in 3:4 container
          // CSS object-cover crops the video horizontally to fit 3:4 aspect ratio
          const videoAspect = 16 / 9; // Source video aspect ratio
          const containerAspect = 3 / 4; // Portrait container aspect ratio
          
          // Calculate the visible portion of the video width
          const visibleWidthRatio = containerAspect / videoAspect; // ~0.421875
          const cropOffset = (1 - visibleWidthRatio) / 2; // ~0.2890625
          
          // Transform x coordinate from full video to visible crop
          x = (landmark.x - cropOffset) / visibleWidthRatio;
          // Clamp to visible area
          x = Math.max(0, Math.min(1, x));
        }

        return {
          x: x * canvas.width,
          y: y * canvas.height,
          visibility: landmark.visibility
        };
      };

      // Draw connections
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      
      POSE_CONNECTIONS.forEach(connection => {
        const [startIdx, endIdx] = connection;
        const start = transformLandmark(results.poseLandmarks[startIdx]);
        const end = transformLandmark(results.poseLandmarks[endIdx]);
        
        if (start && end && (start.visibility || 0) > 0.5 && (end.visibility || 0) > 0.5) {
          ctx.globalAlpha = 0.8;
          ctx.strokeStyle = getConnectionColor(connection);
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
        }
      });

      // Draw landmarks
      results.poseLandmarks.forEach((landmark, index) => {
        const transformedLandmark = transformLandmark(landmark);
        if ((transformedLandmark.visibility || 0) > 0.5) {
          ctx.globalAlpha = 0.9;
          ctx.fillStyle = getLandmarkColor(index);
          ctx.beginPath();
          ctx.arc(
            transformedLandmark.x,
            transformedLandmark.y,
            6, // radius
            0,
            2 * Math.PI
          );
          ctx.fill();
          
          // Add small white border for better visibility
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      });
      
      ctx.globalAlpha = 1;
    };

    if (videoElement.readyState >= 2) {
      initializePose();
    } else {
      videoElement.addEventListener('loadeddata', initializePose);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (poseRef.current) {
        poseRef.current.close();
      }
      videoElement.removeEventListener('loadeddata', initializePose);
    };
  }, [isActive, videoElement, onPoseResults, isPortraitMode]);

  if (!isActive || !videoElement) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      style={{ zIndex: 10 }}
    />
  );
}