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

    // Comprehensive person detection validation to prevent false positives
    const validatePersonPresence = (landmarks: any[]) => {
      if (!landmarks || landmarks.length < 33) return false;

      // Key body landmarks that must be present for valid person detection
      const criticalLandmarks = [
        11, 12, // Left and right shoulders
        23, 24, // Left and right hips
        13, 14, // Left and right elbows
        25, 26, // Left and right knees
      ];

      // Check minimum visibility and confidence for critical landmarks
      let visibleCriticalCount = 0;
      let totalConfidence = 0;

      for (const index of criticalLandmarks) {
        const landmark = landmarks[index];
        if (landmark && landmark.visibility > 0.5) {
          visibleCriticalCount++;
          totalConfidence += landmark.visibility;
        }
      }

      // Require at least 6 out of 8 critical landmarks to be visible
      if (visibleCriticalCount < 6) return false;

      // Check average confidence of visible landmarks
      const averageConfidence = totalConfidence / visibleCriticalCount;
      if (averageConfidence < 0.6) return false;

      // Validate body structure coherence
      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];
      const leftHip = landmarks[23];
      const rightHip = landmarks[24];

      // All torso landmarks must be visible for structure validation
      if (!leftShoulder || !rightShoulder || !leftHip || !rightHip ||
          leftShoulder.visibility < 0.5 || rightShoulder.visibility < 0.5 ||
          leftHip.visibility < 0.5 || rightHip.visibility < 0.5) {
        return false;
      }

      // Validate reasonable body proportions
      const shoulderDistance = Math.abs(leftShoulder.x - rightShoulder.x);
      const hipDistance = Math.abs(leftHip.x - rightHip.x);
      const torsoHeight = Math.abs((leftShoulder.y + rightShoulder.y) / 2 - (leftHip.y + rightHip.y) / 2);

      // Check if landmarks form reasonable human proportions
      if (shoulderDistance < 0.05 || shoulderDistance > 0.5) return false;
      if (hipDistance < 0.05 || hipDistance > 0.5) return false;
      if (torsoHeight < 0.1 || torsoHeight > 0.6) return false;

      // Validate shoulders are above hips (normal human posture)
      const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
      const avgHipY = (leftHip.y + rightHip.y) / 2;
      if (avgShoulderY > avgHipY) return false; // Shoulders should be above hips

      // Check landmark distribution to avoid clustered random points
      const allVisibleLandmarks = landmarks.filter(lm => lm && lm.visibility > 0.3);
      if (allVisibleLandmarks.length < 10) return false;

      // Calculate bounding box of visible landmarks
      const xCoords = allVisibleLandmarks.map(lm => lm.x);
      const yCoords = allVisibleLandmarks.map(lm => lm.y);
      const xRange = Math.max(...xCoords) - Math.min(...xCoords);
      const yRange = Math.max(...yCoords) - Math.min(...yCoords);

      // Require reasonable spatial distribution (not all clustered in tiny area)
      if (xRange < 0.1 || yRange < 0.2) return false;

      return true;
    };

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

      // Comprehensive person detection validation before drawing
      if (!validatePersonPresence(results.poseLandmarks)) {
        // Clear canvas if no valid person detected
        const rect = videoElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      // Detect mobile device for enhanced coordinate handling
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const devicePixelRatio = window.devicePixelRatio || 1;
      const isProduction = import.meta.env.PROD || false;
      
      // Set canvas size to match displayed video dimensions with proper mobile handling
      const rect = videoElement.getBoundingClientRect();
      const displayWidth = rect.width;
      const displayHeight = rect.height;
      
      // Enhanced mobile device handling with production compatibility
      if (isMobile) {
        // Clamp device pixel ratio for production stability
        const safeDPR = Math.min(Math.max(devicePixelRatio, 1), 3);
        
        try {
          canvas.width = displayWidth * safeDPR;
          canvas.height = displayHeight * safeDPR;
          canvas.style.width = `${displayWidth}px`;
          canvas.style.height = `${displayHeight}px`;
          ctx.scale(safeDPR, safeDPR);
          
          if (isProduction && Math.random() < 0.01) {
            console.log('PROD Mobile - DPR:', safeDPR, 'Canvas:', canvas.width, 'x', canvas.height);
          }
        } catch (error) {
          console.warn('Canvas scaling failed, using direct dimensions:', error);
          canvas.width = displayWidth;
          canvas.height = displayHeight;
        }
      } else {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Transform normalized coordinates to canvas coordinates with production compatibility
      const transformLandmark = (landmark: any) => {
        // Production environment detection
        const isProduction = import.meta.env.PROD || false;
        
        // Get actual video dimensions with fallback for production
        let actualVideoWidth = videoElement.videoWidth;
        let actualVideoHeight = videoElement.videoHeight;
        
        // Production fallback if videoWidth/Height are 0
        if (!actualVideoWidth || !actualVideoHeight) {
          console.warn('Video dimensions not available, using fallback detection');
          // Use common mobile camera resolutions as fallback
          actualVideoWidth = 1280;
          actualVideoHeight = 720;
        }
        
        const actualVideoAspectRatio = actualVideoWidth / actualVideoHeight;
        
        // Get displayed video element dimensions with robust detection
        const videoRect = videoElement.getBoundingClientRect();
        let displayedWidth = videoRect.width;
        let displayedHeight = videoRect.height;
        
        // Fallback for production if getBoundingClientRect fails
        if (!displayedWidth || !displayedHeight) {
          displayedWidth = videoElement.offsetWidth || canvas.width;
          displayedHeight = videoElement.offsetHeight || canvas.height;
          console.warn('Using fallback dimensions:', displayedWidth, 'x', displayedHeight);
        }
        
        const displayedAspectRatio = displayedWidth / displayedHeight;
        
        // Enhanced canvas dimension detection for production
        let canvasWidth, canvasHeight;
        
        if (isMobile && isProduction) {
          // Production mobile: Use computed styles for more reliable dimensions
          const computedStyle = window.getComputedStyle(canvas);
          canvasWidth = parseFloat(computedStyle.width) || displayedWidth;
          canvasHeight = parseFloat(computedStyle.height) || displayedHeight;
        } else if (isMobile) {
          canvasWidth = displayedWidth;
          canvasHeight = displayedHeight;
        } else {
          canvasWidth = canvas.width;
          canvasHeight = canvas.height;
        }
        
        const canvasAspectRatio = canvasWidth / canvasHeight;
        
        // Production-specific debugging with environment context
        if (isProduction && Math.random() < 0.02) { // Reduced logging in production
          console.log('PROD - Video:', actualVideoWidth, 'x', actualVideoHeight, 'AR:', actualVideoAspectRatio.toFixed(3));
          console.log('PROD - Canvas:', canvasWidth, 'x', canvasHeight, 'AR:', canvasAspectRatio.toFixed(3));
          console.log('PROD - Mobile:', isMobile, 'DPR:', devicePixelRatio);
        } else if (!isProduction && Math.random() < 0.1) {
          console.log('DEV - Video AR:', actualVideoAspectRatio.toFixed(3), 'Canvas AR:', canvasAspectRatio.toFixed(3));
        }
        
        let x = landmark.x;
        let y = landmark.y;

        // Enhanced coordinate transformation with production fallbacks
        const aspectRatioDiff = Math.abs(actualVideoAspectRatio - canvasAspectRatio);
        
        // Production fallback: if aspect ratio calculation seems invalid, use simpler mapping
        if (isProduction && (aspectRatioDiff > 10 || !isFinite(actualVideoAspectRatio) || !isFinite(canvasAspectRatio))) {
          console.warn('PROD - Invalid aspect ratios detected, using direct coordinate mapping');
          // Direct coordinate mapping as fallback
          x = landmark.x;
          y = landmark.y;
        } else if (actualVideoAspectRatio > canvasAspectRatio) {
          // Video is wider than canvas - video is cropped horizontally
          const visibleWidthFraction = canvasAspectRatio / actualVideoAspectRatio;
          const cropFromEachSide = (1 - visibleWidthFraction) / 2;
          
          // Enhanced bounds checking for production
          if (isProduction && (cropFromEachSide < 0 || cropFromEachSide > 0.5)) {
            console.warn('PROD - Invalid crop calculation, using direct mapping');
            x = landmark.x;
          } else if (landmark.x >= cropFromEachSide && landmark.x <= (1 - cropFromEachSide)) {
            x = (landmark.x - cropFromEachSide) / visibleWidthFraction;
          } else {
            x = landmark.x < cropFromEachSide ? 0 : 1;
          }
          
        } else if (actualVideoAspectRatio < canvasAspectRatio) {
          // Video is taller than canvas - video is letterboxed vertically
          const visibleHeightFraction = actualVideoAspectRatio / canvasAspectRatio;
          const letterboxFromTopBottom = (1 - visibleHeightFraction) / 2;
          
          // Enhanced bounds checking for production
          if (isProduction && (letterboxFromTopBottom < 0 || letterboxFromTopBottom > 0.5)) {
            console.warn('PROD - Invalid letterbox calculation, using direct mapping');
            y = landmark.y;
          } else if (landmark.y >= letterboxFromTopBottom && landmark.y <= (1 - letterboxFromTopBottom)) {
            y = (landmark.y - letterboxFromTopBottom) / visibleHeightFraction;
          } else {
            y = landmark.y < letterboxFromTopBottom ? 0 : 1;
          }
        }

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