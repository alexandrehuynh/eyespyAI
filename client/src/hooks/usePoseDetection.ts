import { useState, useEffect, useRef, useCallback } from "react";
import { Pose, Results } from "@mediapipe/pose";
import { Exercise } from "@/pages/home";

export interface PoseMetrics {
  formQuality: number;
  reps: number;
  sessionTime: string;
  isPersonDetected: boolean;
  isExercising: boolean;
  detectionQuality: 'Poor' | 'Good' | 'Excellent';
  trackingStatus: 'optimal' | 'too_close' | 'partial' | 'lost';
}

export interface PoseFeedback {
  type: 'success' | 'warning' | 'error';
  message: string;
  icon: string;
}

export function usePoseDetection(exercise: Exercise, isActive: boolean) {
  const [metrics, setMetrics] = useState<PoseMetrics>({
    formQuality: 0,
    reps: 0,
    sessionTime: '00:00',
    isPersonDetected: false,
    isExercising: false,
    detectionQuality: 'Poor',
    trackingStatus: 'lost'
  });
  
  const [feedback, setFeedback] = useState<PoseFeedback[]>([]);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  
  const poseRef = useRef<Pose | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  
  // Exercise-specific state
  const previousPositionsRef = useRef<any[]>([]);
  const repCounterRef = useRef(0);
  const lastRepTimeRef = useRef(0);
  const exerciseStateRef = useRef<'up' | 'down' | 'neutral'>('neutral');
  const repFlashRef = useRef(false);
  
  // Rep validation thresholds
  const REP_COOLDOWN_MS = 2000; // 2 seconds between reps
  const SQUAT_HEIGHT_THRESHOLD = 0.15; // Minimum hip height change for squat
  const PUSHUP_ANGLE_THRESHOLD = 30; // Minimum angle change for push-up
  const POSITION_STABILITY_FRAMES = 5; // Frames to confirm position

  // Session timer
  useEffect(() => {
    if (!isActive || !metrics.isPersonDetected) return;

    const timer = setInterval(() => {
      setSessionSeconds(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, metrics.isPersonDetected]);

  useEffect(() => {
    const minutes = Math.floor(sessionSeconds / 60);
    const seconds = sessionSeconds % 60;
    setMetrics(prev => ({
      ...prev,
      sessionTime: `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    }));
  }, [sessionSeconds]);

  // Calculate angle between three points
  const calculateAngle = useCallback((point1: any, point2: any, point3: any) => {
    const radians = Math.atan2(point3.y - point2.y, point3.x - point2.x) - 
                   Math.atan2(point1.y - point2.y, point1.x - point2.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) {
      angle = 360 - angle;
    }
    return angle;
  }, []);

  // Evaluate detection quality and tracking status
  const evaluateDetectionQuality = useCallback((landmarks: any[]) => {
    if (!landmarks || landmarks.length === 0) {
      return { detectionQuality: 'Poor' as const, trackingStatus: 'lost' as const };
    }

    // Key landmarks for evaluation
    const keyLandmarks = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]; // shoulders, elbows, wrists, hips, knees, ankles
    const visibleLandmarks = keyLandmarks.filter(idx => 
      landmarks[idx] && (landmarks[idx].visibility || 0) > 0.5
    );

    const visibilityRatio = visibleLandmarks.length / keyLandmarks.length;

    // Check if person is too close (landmarks near edges)
    const shoulderWidth = Math.abs(landmarks[11]?.x - landmarks[12]?.x) || 0;
    const isTooClose = shoulderWidth > 0.8 || landmarks.some(landmark => 
      landmark && (landmark.x < 0.05 || landmark.x > 0.95 || landmark.y < 0.05 || landmark.y > 0.95)
    );

    // Check if person is partially in frame
    const headVisible = landmarks[0] && (landmarks[0].visibility || 0) > 0.5;
    const feetVisible = landmarks[27] && landmarks[28] && 
      (landmarks[27].visibility || 0) > 0.5 && (landmarks[28].visibility || 0) > 0.5;
    const isPartial = !headVisible || !feetVisible;

    // Determine tracking status
    let trackingStatus: 'optimal' | 'too_close' | 'partial' | 'lost';
    if (isTooClose) {
      trackingStatus = 'too_close';
    } else if (isPartial) {
      trackingStatus = 'partial';
    } else if (visibilityRatio >= 0.8) {
      trackingStatus = 'optimal';
    } else {
      trackingStatus = 'lost';
    }

    // Determine detection quality
    let detectionQuality: 'Poor' | 'Good' | 'Excellent';
    if (visibilityRatio >= 0.9 && trackingStatus === 'optimal') {
      detectionQuality = 'Excellent';
    } else if (visibilityRatio >= 0.7 && trackingStatus !== 'lost') {
      detectionQuality = 'Good';
    } else {
      detectionQuality = 'Poor';
    }

    return { detectionQuality, trackingStatus };
  }, []);

  // Analyze squat form
  const analyzeSquat = useCallback((landmarks: any[]) => {
    if (!landmarks || landmarks.length < 33) return null;

    const leftHip = landmarks[23];
    const leftKnee = landmarks[25];
    const leftAnkle = landmarks[27];
    const rightHip = landmarks[24];
    const rightKnee = landmarks[26];
    const rightAnkle = landmarks[28];

    // Calculate knee angles
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    // Calculate hip height (Y coordinate - lower Y means higher position)
    const hipHeight = (leftHip.y + rightHip.y) / 2;

    // Store position history for stability check
    previousPositionsRef.current.push({
      hipHeight,
      kneeAngle: avgKneeAngle,
      timestamp: Date.now()
    });

    // Keep only recent positions (last 10 frames)
    if (previousPositionsRef.current.length > 10) {
      previousPositionsRef.current.shift();
    }

    // Determine squat position with strict validation
    let currentState = exerciseStateRef.current;
    const now = Date.now();
    let repDetected = false;

    // Only process if we have enough position history
    if (previousPositionsRef.current.length >= POSITION_STABILITY_FRAMES) {
      const recentPositions = previousPositionsRef.current.slice(-POSITION_STABILITY_FRAMES);
      const avgRecentHipHeight = recentPositions.reduce((sum, pos) => sum + pos.hipHeight, 0) / recentPositions.length;
      const avgRecentKneeAngle = recentPositions.reduce((sum, pos) => sum + pos.kneeAngle, 0) / recentPositions.length;

      // Check for significant hip height change (squat depth)
      if (currentState === 'neutral' || currentState === 'up') {
        // Check if person is going down (hip getting lower = higher Y value)
        if (avgRecentKneeAngle < 110 && avgRecentHipHeight > 0.6) {
          // Verify this is a stable squat position
          const isStableDown = recentPositions.every(pos => 
            pos.kneeAngle < 120 && pos.hipHeight > 0.55
          );
          
          if (isStableDown) {
            currentState = 'down';
            exerciseStateRef.current = 'down';
          }
        }
      } else if (currentState === 'down') {
        // Check if person is coming back up
        if (avgRecentKneeAngle > 140 && avgRecentHipHeight < 0.5) {
          // Verify this is a stable up position
          const isStableUp = recentPositions.every(pos => 
            pos.kneeAngle > 135 && pos.hipHeight < 0.55
          );
          
          if (isStableUp && (now - lastRepTimeRef.current) > REP_COOLDOWN_MS) {
            currentState = 'up';
            exerciseStateRef.current = 'up';
            repCounterRef.current += 1;
            lastRepTimeRef.current = now;
            repDetected = true;
            repFlashRef.current = true;
            
            // Clear flash after 1 second
            setTimeout(() => {
              repFlashRef.current = false;
            }, 1000);
          }
        }
      }
    }

    // Calculate form quality
    let formScore = 100;
    let feedbackMessages: PoseFeedback[] = [];

    // Add rep detected feedback
    if (repDetected) {
      feedbackMessages.push({
        type: 'success',
        message: 'Rep Detected! Great form!',
        icon: '🎯'
      });
    }

    // Check depth only when in down position
    if (currentState === 'down') {
      if (avgKneeAngle > 110) {
        formScore -= 20;
        feedbackMessages.push({
          type: 'warning',
          message: 'Squat deeper - knees should reach 90 degrees',
          icon: '⚠️'
        });
      } else if (avgKneeAngle <= 90) {
        feedbackMessages.push({
          type: 'success',
          message: 'Perfect squat depth!',
          icon: '✅'
        });
      }
    }

    // Calculate torso angle (torso lean)
    const leftShoulder = landmarks[11];
    const hipMidpoint = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2
    };
    const kneeMidpoint = {
      x: (leftKnee.x + rightKnee.x) / 2,
      y: (leftKnee.y + rightKnee.y) / 2
    };

    const torsoAngle = calculateAngle(leftShoulder, hipMidpoint, kneeMidpoint);

    // Check torso position
    if (torsoAngle < 70) {
      formScore -= 15;
      feedbackMessages.push({
        type: 'warning',
        message: 'Keep your torso more upright',
        icon: '⚠️'
      });
    } else if (torsoAngle > 85 && currentState === 'down') {
      feedbackMessages.push({
        type: 'success',
        message: 'Excellent torso position',
        icon: '✅'
      });
    }

    // Check knee tracking
    const kneeAlignment = Math.abs(leftKnee.x - rightKnee.x);
    if (kneeAlignment > 0.1) {
      formScore -= 10;
      feedbackMessages.push({
        type: 'warning',
        message: 'Keep knees aligned',
        icon: '⚠️'
      });
    }

    // Only consider exercising if in a clear squat position
    const isExercising = currentState === 'down' || (avgKneeAngle < 140 && hipHeight > 0.5);

    return {
      formQuality: Math.max(formScore, 0),
      reps: repCounterRef.current,
      feedback: feedbackMessages,
      isExercising
    };
  }, [calculateAngle]);

  // Analyze push-up form
  const analyzePushUp = useCallback((landmarks: any[]) => {
    if (!landmarks || landmarks.length < 33) return null;

    const leftShoulder = landmarks[11];
    const leftElbow = landmarks[13];
    const leftWrist = landmarks[15];
    const rightShoulder = landmarks[12];
    const rightElbow = landmarks[14];
    const rightWrist = landmarks[16];

    // Calculate elbow angles
    const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
    const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

    // Calculate torso height (shoulder Y position - lower Y means higher/up position)
    const shoulderHeight = (leftShoulder.y + rightShoulder.y) / 2;

    // Store position history for stability check
    previousPositionsRef.current.push({
      shoulderHeight,
      elbowAngle: avgElbowAngle,
      timestamp: Date.now()
    });

    // Keep only recent positions (last 10 frames)
    if (previousPositionsRef.current.length > 10) {
      previousPositionsRef.current.shift();
    }

    // Determine push-up position with strict validation
    let currentState = exerciseStateRef.current;
    const now = Date.now();
    let repDetected = false;

    // Check if person is in push-up position (horizontal body alignment required)
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const shoulder = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
    const hip = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
    
    // Check if body is roughly horizontal (push-up position)
    const bodyTilt = Math.abs(shoulder.y - hip.y);
    const isInPushUpPosition = bodyTilt < 0.3 && shoulder.y > 0.3; // Body horizontal and not standing

    // Only process if we have enough position history and in push-up position
    if (previousPositionsRef.current.length >= POSITION_STABILITY_FRAMES && isInPushUpPosition) {
      const recentPositions = previousPositionsRef.current.slice(-POSITION_STABILITY_FRAMES);
      const avgRecentShoulderHeight = recentPositions.reduce((sum, pos) => sum + pos.shoulderHeight, 0) / recentPositions.length;
      const avgRecentElbowAngle = recentPositions.reduce((sum, pos) => sum + pos.elbowAngle, 0) / recentPositions.length;

      // Check for significant elbow angle change (push-up depth)
      if (currentState === 'neutral' || currentState === 'up') {
        // Check if person is going down (elbows bending, shoulder getting lower)
        if (avgRecentElbowAngle < 110 && avgRecentShoulderHeight > 0.4) {
          // Verify this is a stable down position
          const isStableDown = recentPositions.every(pos => 
            pos.elbowAngle < 120 && pos.shoulderHeight > 0.35
          );
          
          if (isStableDown) {
            currentState = 'down';
            exerciseStateRef.current = 'down';
          }
        }
      } else if (currentState === 'down') {
        // Check if person is pushing back up
        if (avgRecentElbowAngle > 150 && avgRecentShoulderHeight < 0.4) {
          // Verify this is a stable up position
          const isStableUp = recentPositions.every(pos => 
            pos.elbowAngle > 145 && pos.shoulderHeight < 0.45
          );
          
          if (isStableUp && (now - lastRepTimeRef.current) > REP_COOLDOWN_MS) {
            currentState = 'up';
            exerciseStateRef.current = 'up';
            repCounterRef.current += 1;
            lastRepTimeRef.current = now;
            repDetected = true;
            repFlashRef.current = true;
            
            // Clear flash after 1 second
            setTimeout(() => {
              repFlashRef.current = false;
            }, 1000);
          }
        }
      }
    }

    // Calculate form quality
    let formScore = 100;
    let feedbackMessages: PoseFeedback[] = [];

    // Add rep detected feedback
    if (repDetected) {
      feedbackMessages.push({
        type: 'success',
        message: 'Rep Detected! Excellent push-up!',
        icon: '🎯'
      });
    }

    // Only give feedback if in push-up position
    if (!isInPushUpPosition) {
      feedbackMessages.push({
        type: 'warning',
        message: 'Get into push-up position to start analysis',
        icon: '💪'
      });
      formScore = 0;
    } else {
      // Check depth only when in down position
      if (currentState === 'down') {
        if (avgElbowAngle > 110) {
          formScore -= 20;
          feedbackMessages.push({
            type: 'warning',
            message: 'Lower yourself more - elbows should reach 90 degrees',
            icon: '⚠️'
          });
        } else if (avgElbowAngle <= 100) {
          feedbackMessages.push({
            type: 'success',
            message: 'Perfect push-up depth!',
            icon: '✅'
          });
        }
      }

      // Check body alignment
      const ankle = { x: (landmarks[27].x + landmarks[28].x) / 2, y: (landmarks[27].y + landmarks[28].y) / 2 };
      const bodyAlignment = Math.abs(shoulder.y - hip.y) + Math.abs(hip.y - ankle.y);
      
      if (bodyAlignment > 0.2) {
        formScore -= 15;
        feedbackMessages.push({
          type: 'warning',
          message: 'Keep your body in a straight line',
          icon: '⚠️'
        });
      } else if (currentState !== 'neutral') {
        feedbackMessages.push({
          type: 'success',
          message: 'Great body alignment',
          icon: '✅'
        });
      }
    }

    // Only consider exercising if in push-up position and moving
    const isExercising = isInPushUpPosition && (currentState === 'down' || avgElbowAngle < 160);

    return {
      formQuality: Math.max(formScore, 0),
      reps: repCounterRef.current,
      feedback: feedbackMessages,
      isExercising
    };
  }, [calculateAngle]);

  // Analyze plank form
  const analyzePlank = useCallback((landmarks: any[]) => {
    if (!landmarks || landmarks.length < 33) return null;

    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];

    // Calculate body alignment
    const shoulder = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
    const hip = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
    const ankle = { x: (leftAnkle.x + rightAnkle.x) / 2, y: (leftAnkle.y + rightAnkle.y) / 2 };
    const elbow = { x: (leftElbow.x + rightElbow.x) / 2, y: (leftElbow.y + rightElbow.y) / 2 };

    // Check if in plank position (shoulders, hips, ankles aligned and horizontal)
    const shoulderHipDiff = Math.abs(shoulder.y - hip.y);
    const hipAnkleDiff = Math.abs(hip.y - ankle.y);
    const totalAlignment = shoulderHipDiff + hipAnkleDiff;
    
    // Check if body is roughly horizontal (plank position)
    const isHorizontal = shoulder.y > 0.3 && hip.y > 0.3; // Not standing
    const isInPlankPosition = totalAlignment < 0.25 && isHorizontal;

    // Calculate form quality
    let formScore = 100;
    let feedbackMessages: PoseFeedback[] = [];

    // Only analyze if in plank position
    if (!isInPlankPosition) {
      feedbackMessages.push({
        type: 'warning',
        message: 'Get into plank position to start analysis',
        icon: '🧘'
      });
      formScore = 0;
    } else {
      // Check body alignment
      if (totalAlignment > 0.15) {
        formScore -= 30;
        if (hip.y < shoulder.y - 0.05) {
          feedbackMessages.push({
            type: 'warning',
            message: 'Lower your hips - avoid pike position',
            icon: '⚠️'
          });
        } else if (hip.y > shoulder.y + 0.05) {
          feedbackMessages.push({
            type: 'warning',
            message: 'Raise your hips - avoid sagging',
            icon: '⚠️'
          });
        }
      } else {
        feedbackMessages.push({
          type: 'success',
          message: 'Perfect plank alignment!',
          icon: '✅'
        });
      }

      // Check elbow position for forearm plank
      if (Math.abs(elbow.x - shoulder.x) > 0.1) {
        formScore -= 15;
        feedbackMessages.push({
          type: 'warning',
          message: 'Keep elbows under shoulders',
          icon: '⚠️'
        });
      } else {
        feedbackMessages.push({
          type: 'success',
          message: 'Great elbow placement',
          icon: '✅'
        });
      }

      // Check for core engagement (stable position)
      if (totalAlignment < 0.1) {
        feedbackMessages.push({
          type: 'success',
          message: 'Excellent core engagement!',
          icon: '💪'
        });
      }
    }

    return {
      formQuality: Math.max(formScore, 0),
      reps: 0, // Plank is time-based, not rep-based
      feedback: feedbackMessages,
      isExercising: isInPlankPosition // Person is in plank position
    };
  }, []);

  // Process pose results
  const processPoseResults = useCallback((results: Results) => {
    if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
      setMetrics(prev => ({
        ...prev,
        isPersonDetected: false,
        isExercising: false,
        formQuality: 0,
        detectionQuality: 'Poor',
        trackingStatus: 'lost'
      }));
      setFeedback([{
        type: 'warning',
        message: 'No person detected in frame',
        icon: '👤'
      }]);
      return;
    }

    // Evaluate detection quality first
    const { detectionQuality, trackingStatus } = evaluateDetectionQuality(results.poseLandmarks);

    // Generate tracking feedback based on status
    let trackingFeedback: PoseFeedback[] = [];
    switch (trackingStatus) {
      case 'too_close':
        trackingFeedback.push({
          type: 'warning',
          message: 'Move back for better tracking',
          icon: '⬅️'
        });
        break;
      case 'partial':
        trackingFeedback.push({
          type: 'warning',
          message: 'Stand fully in frame',
          icon: '📐'
        });
        break;
      case 'lost':
        trackingFeedback.push({
          type: 'error',
          message: 'Tracking lost - repositioning...',
          icon: '🔄'
        });
        break;
      case 'optimal':
        trackingFeedback.push({
          type: 'success',
          message: `Detection: ${detectionQuality}`,
          icon: '🎯'
        });
        break;
    }

    // Only analyze exercise if detection quality is Good or better
    let analysis = null;
    if (detectionQuality === 'Good' || detectionQuality === 'Excellent') {
      switch (exercise) {
        case 'squat':
          analysis = analyzeSquat(results.poseLandmarks);
          break;
        case 'pushup':
          analysis = analyzePushUp(results.poseLandmarks);
          break;
        case 'plank':
          analysis = analyzePlank(results.poseLandmarks);
          break;
      }
    }

    if (analysis) {
      setMetrics(prev => ({
        ...prev,
        isPersonDetected: true,
        isExercising: analysis.isExercising,
        formQuality: analysis.formQuality,
        reps: analysis.reps,
        detectionQuality,
        trackingStatus
      }));
      
      // Combine tracking feedback with exercise feedback
      const combinedFeedback = [...trackingFeedback];
      if (analysis.feedback.length > 0) {
        combinedFeedback.push(...analysis.feedback);
      } else if (!analysis.isExercising) {
        combinedFeedback.push({
          type: 'warning',
          message: `Get into ${exercise} position to start analysis`,
          icon: '💪'
        });
      }
      
      setFeedback(combinedFeedback);
    } else {
      // Poor detection quality - pause analysis
      setMetrics(prev => ({
        ...prev,
        isPersonDetected: true,
        isExercising: false,
        formQuality: 0,
        detectionQuality,
        trackingStatus
      }));
      
      const pausedFeedback = [...trackingFeedback];
      if (detectionQuality === 'Poor') {
        pausedFeedback.push({
          type: 'warning',
          message: 'Analysis paused - improve positioning for better tracking',
          icon: '⏸️'
        });
      }
      
      setFeedback(pausedFeedback);
    }
  }, [exercise, analyzeSquat, analyzePushUp, analyzePlank, evaluateDetectionQuality]);

  // Create a callback function to process pose results
  const processPoseResultsCallback = useCallback((results: Results) => {
    processPoseResults(results);
  }, [processPoseResults]);

  // Reset when exercise changes or analysis stops
  useEffect(() => {
    if (!isActive) {
      repCounterRef.current = 0;
      exerciseStateRef.current = 'neutral';
      lastRepTimeRef.current = 0;
      previousPositionsRef.current = []; // Clear position history
      repFlashRef.current = false;
      setSessionSeconds(0);
      setMetrics({
        formQuality: 0,
        reps: 0,
        sessionTime: '00:00',
        isPersonDetected: false,
        isExercising: false,
        detectionQuality: 'Poor',
        trackingStatus: 'lost'
      });
      setFeedback([]);
    }
  }, [isActive, exercise]);

  // Clear position history when exercise type changes
  useEffect(() => {
    previousPositionsRef.current = [];
    repCounterRef.current = 0;
    exerciseStateRef.current = 'neutral';
    lastRepTimeRef.current = 0;
    repFlashRef.current = false;
  }, [exercise]);

  return { metrics, feedback, processPoseResultsCallback, repFlash: repFlashRef.current };
}