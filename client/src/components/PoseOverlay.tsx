import { useRef, useEffect } from "react";
import { Results } from "@mediapipe/pose";

// Global interface declaration for MediaPipe loaded via CDN
declare global {
  interface Window {
    Pose: any;
  }
}

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

  // Load MediaPipe script dynamically from CDN
  const loadMediaPipeScript = (): Promise<any> => {
    return new Promise((resolve, reject) => {
      // Check if MediaPipe is already loaded
      if (window.Pose) {
        console.log('MediaPipe Pose already loaded from global window');
        resolve(window.Pose);
        return;
      }

      console.log('Loading MediaPipe Pose script from CDN...');
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js';
      script.async = true;
      
      script.onload = () => {
        console.log('MediaPipe script loaded successfully');
        if (window.Pose) {
          resolve(window.Pose);
        } else {
          reject(new Error('MediaPipe Pose not available on window after script load'));
        }
      };
      
      script.onerror = (error) => {
        console.error('Failed to load MediaPipe script:', error);
        reject(new Error('Failed to load MediaPipe script from CDN'));
      };
      
      document.head.appendChild(script);
    });
  };

  useEffect(() => {
    if (!isActive || !videoElement || !canvasRef.current) return;

    const initializePose = async () => {
      try {
        console.log('Initializing MediaPipe Pose with CDN script loading...');
        
        // Load MediaPipe from CDN
        const PoseConstructor = await loadMediaPipeScript();
        
        const pose = new PoseConstructor({
          locateFile: (file: string) => {
            console.log(`Loading MediaPipe file: ${file}`);
            return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`;
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

        console.log('MediaPipe Pose initialized successfully');
        poseRef.current = pose;
        processFrame();
      } catch (error) {
        console.error('Error initializing MediaPipe Pose:', error);
        const errorObj = error as Error;
        console.error('Error details:', {
          message: errorObj.message || 'Unknown error',
          stack: errorObj.stack || 'No stack trace',
          name: errorObj.name || 'Unknown error type'
        });
        
        // Try alternative CDN approach with different version
        try {
          console.log('Attempting alternative CDN initialization...');
          
          // Try loading different version as fallback
          const fallbackScript = document.createElement('script');
          fallbackScript.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1635989137/pose.js';
          fallbackScript.async = true;
          
          fallbackScript.onload = () => {
            try {
              if (window.Pose) {
                const pose = new window.Pose({
                  locateFile: (file: string) => {
                    return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1635989137/${file}`;
                  }
                });
                
                pose.setOptions({
                  modelComplexity: 0, // Lower complexity for better compatibility
                  smoothLandmarks: true,
                  enableSegmentation: false,
                  smoothSegmentation: false,
                  minDetectionConfidence: 0.3,
                  minTrackingConfidence: 0.3
                });

                pose.onResults((results: Results) => {
                  drawPose(results);
                  if (onPoseResults) {
                    onPoseResults(results);
                  }
                });

                console.log('Alternative MediaPipe Pose initialized successfully');
                poseRef.current = pose;
                processFrame();
              }
            } catch (innerError) {
              console.error('Alternative MediaPipe initialization failed:', innerError);
            }
          };
          
          document.head.appendChild(fallbackScript);
        } catch (fallbackError) {
          console.error('Alternative script loading also failed:', fallbackError);
        }
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

      // Detect mobile device for enhanced coordinate handling
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const devicePixelRatio = window.devicePixelRatio || 1;
      
      // Set canvas size to match displayed video dimensions with proper mobile handling
      const rect = videoElement.getBoundingClientRect();
      const displayWidth = rect.width;
      const displayHeight = rect.height;
      
      // For mobile devices, account for device pixel ratio
      if (isMobile) {
        canvas.width = displayWidth * devicePixelRatio;
        canvas.height = displayHeight * devicePixelRatio;
        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;
        ctx.scale(devicePixelRatio, devicePixelRatio);
        console.log('Mobile device detected - DPR:', devicePixelRatio, 'Canvas size:', canvas.width, 'x', canvas.height);
      } else {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Transform normalized coordinates to canvas coordinates with proper mobile support
      const transformLandmark = (landmark: any) => {
        // Get actual video dimensions from the stream
        const actualVideoWidth = videoElement.videoWidth;
        const actualVideoHeight = videoElement.videoHeight;
        const actualVideoAspectRatio = actualVideoWidth / actualVideoHeight;
        
        // Get displayed video element dimensions
        const videoRect = videoElement.getBoundingClientRect();
        const displayedWidth = videoRect.width;
        const displayedHeight = videoRect.height;
        const displayedAspectRatio = displayedWidth / displayedHeight;
        
        // Get canvas dimensions (use display dimensions for coordinate calculation)
        const canvasWidth = isMobile ? displayWidth : canvas.width;
        const canvasHeight = isMobile ? displayHeight : canvas.height;
        const canvasAspectRatio = canvasWidth / canvasHeight;
        
        // Debug logging (reduced frequency)
        if (Math.random() < 0.1) { // Log only 10% of frames
          console.log('Video AR:', actualVideoAspectRatio.toFixed(3), 'Canvas AR:', canvasAspectRatio.toFixed(3), 'Mobile:', isMobile);
        }
        
        let x = landmark.x;
        let y = landmark.y;

        // Determine if video is being cropped or letterboxed based on aspect ratios
        if (actualVideoAspectRatio > canvasAspectRatio) {
          // Video is wider than canvas - video is cropped horizontally (left/right sides cut off)
          const visibleWidthFraction = canvasAspectRatio / actualVideoAspectRatio;
          const cropFromEachSide = (1 - visibleWidthFraction) / 2;
          
          if (Math.random() < 0.05) { // Reduced logging
            console.log('Horizontal crop - visible fraction:', visibleWidthFraction.toFixed(3), 'crop from sides:', cropFromEachSide.toFixed(3));
          }
          
          // Transform x-coordinate to account for horizontal cropping
          if (landmark.x >= cropFromEachSide && landmark.x <= (1 - cropFromEachSide)) {
            x = (landmark.x - cropFromEachSide) / visibleWidthFraction;
          } else {
            x = landmark.x < cropFromEachSide ? 0 : 1;
          }
          // Y coordinate maps directly
          
        } else if (actualVideoAspectRatio < canvasAspectRatio) {
          // Video is taller than canvas - video is letterboxed vertically (top/bottom bars)
          const visibleHeightFraction = actualVideoAspectRatio / canvasAspectRatio;
          const letterboxFromTopBottom = (1 - visibleHeightFraction) / 2;
          
          if (Math.random() < 0.05) { // Reduced logging
            console.log('Vertical letterbox - visible fraction:', visibleHeightFraction.toFixed(3), 'letterbox from top/bottom:', letterboxFromTopBottom.toFixed(3));
          }
          
          // Transform y-coordinate to account for vertical letterboxing
          if (landmark.y >= letterboxFromTopBottom && landmark.y <= (1 - letterboxFromTopBottom)) {
            y = (landmark.y - letterboxFromTopBottom) / visibleHeightFraction;
          } else {
            y = landmark.y < letterboxFromTopBottom ? 0 : 1;
          }
          // X coordinate maps directly
          
        }
        // If aspect ratios match exactly, no transformation needed

        return {
          x: x * canvasWidth,
          y: y * canvasHeight,
          visibility: landmark.visibility
        };
      };

      // Draw connections
      ctx.lineWidth = 3;
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
            4, // radius
            0,
            2 * Math.PI
          );
          ctx.fill();
          
          // Add small white border for better visibility
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1;
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