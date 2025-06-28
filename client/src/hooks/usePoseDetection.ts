import { useState, useEffect, useRef, useCallback } from "react";
import { Pose, Results } from "@mediapipe/pose";
import { Exercise } from "@/pages/home";

export interface PoseMetrics {
  formQuality: number;
  reps: number;
  sessionTime: string;
  isPersonDetected: boolean;
  isExercising: boolean;
  detectionQuality: "poor" | "good" | "excellent";
  trackingStatus:
    | "optimal"
    | "too_close"
    | "partial"
    | "lost"
    | "repositioning";
  currentAngles?: {
    angles: Array<{
      name: string;
      value: number;
    }>;
  };
}

export interface PoseFeedback {
  type: "success" | "warning" | "error";
  message: string;
  icon: string;
}

export function usePoseDetection(exercise: Exercise, isActive: boolean) {
  const [metrics, setMetrics] = useState<PoseMetrics>({
    formQuality: 0,
    reps: 0,
    sessionTime: "00:00",
    isPersonDetected: false,
    isExercising: false,
    detectionQuality: "poor",
    trackingStatus: "lost",
    currentAngles: undefined,
  });

  const [feedback, setFeedback] = useState<PoseFeedback[]>([]);
  const [sessionSeconds, setSessionSeconds] = useState(0);

  // Exercise-specific state
  const previousPositionsRef = useRef<any[]>([]);
  const repCounterRef = useRef(0);
  const lastRepTimeRef = useRef(0);
  const exerciseStateRef = useRef<"up" | "down" | "neutral">("neutral");
  const repFlashRef = useRef(false);
  const movementVelocityRef = useRef<number[]>([]);

  // Adaptive threshold learning refs
  const userAngleHistory = useRef<number[]>([]);
  const adaptiveThresholds = useRef<{[key: string]: {down: number, up: number}}>({});
  const learningStartTime = useRef<number>(0);
  const detectionLossTime = useRef<number>(0);
  const lastDetectionTime = useRef<number>(Date.now());

  // Much more responsive rep detection thresholds
  const REP_COOLDOWN_MS = 300; // Even faster rep detection
  const POSITION_STABILITY_FRAMES = 2; // Reduced from 3 to 2 for faster response
  const VELOCITY_HISTORY_FRAMES = 3;
  const BRIEF_OCCLUSION_THRESHOLD = 2000; // 2 seconds = brief occlusion
  const SUSTAINED_ABSENCE_THRESHOLD = 5000; // 5 seconds = intentional exit

  // Reset counters when exercise changes and initialize adaptive learning
  useEffect(() => {
    repCounterRef.current = 0;
    exerciseStateRef.current = "neutral";
    previousPositionsRef.current = [];
    lastRepTimeRef.current = 0;
    setSessionSeconds(0);
    
    // Initialize adaptive learning for new exercise
    userAngleHistory.current = [];
    adaptiveThresholds.current = {};
    learningStartTime.current = Date.now();
    console.log(`🏋️ [ADAPTIVE_DEBUG] Starting ${exercise} with adaptive learning`);
  }, [exercise]);

  // Adaptive threshold learning function
  const updateAdaptiveThresholds = useCallback((angle: number, exerciseType: string) => {
    userAngleHistory.current.push(angle);
    
    // Keep only recent history (last 50 angles)
    if (userAngleHistory.current.length > 50) {
      userAngleHistory.current.shift();
    }
    
    const learningDuration = (Date.now() - learningStartTime.current) / 1000;
    
    // Start adapting after 10 seconds and at least 20 data points
    if (learningDuration > 10 && userAngleHistory.current.length >= 20) {
      const sortedAngles = [...userAngleHistory.current].sort((a, b) => a - b);
      
      // Use 20th and 80th percentiles for more personalized thresholds
      const percentile20 = sortedAngles[Math.floor(sortedAngles.length * 0.2)];
      const percentile80 = sortedAngles[Math.floor(sortedAngles.length * 0.8)];
      
      // Calculate adaptive thresholds with safety margins
      const rangeSize = percentile80 - percentile20;
      const adaptiveDown = percentile20 + rangeSize * 0.3; // 30% from min
      const adaptiveUp = percentile80 - rangeSize * 0.2; // 20% from max
      
      // Get default thresholds based on exercise type
      let defaultDown = 95, defaultUp = 135; // Squat defaults
      if (exerciseType === 'pushup') {
        defaultDown = 90;
        defaultUp = 140;
      }
      
      // Apply safety bounds to prevent extreme values
      const minDown = Math.min(defaultDown, adaptiveDown);
      const maxUp = Math.max(defaultUp, adaptiveUp);
      
      adaptiveThresholds.current[exerciseType] = {
        down: Math.max(minDown, percentile20 + 10), // At least 10° buffer
        up: Math.min(maxUp, percentile80 - 10)
      };
      
      console.log(`🎯 [ADAPTIVE_DEBUG] ${exerciseType} learned range: ${percentile20.toFixed(1)}°-${percentile80.toFixed(1)}°, Thresholds: down=${adaptiveThresholds.current[exerciseType].down.toFixed(1)}°, up=${adaptiveThresholds.current[exerciseType].up.toFixed(1)}°`);
    }
  }, [learningStartTime]);

  // Session timer
  useEffect(() => {
    if (!isActive || !metrics.isPersonDetected) return;

    const timer = setInterval(() => {
      setSessionSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, metrics.isPersonDetected]);

  useEffect(() => {
    const minutes = Math.floor(sessionSeconds / 60);
    const seconds = sessionSeconds % 60;
    setMetrics((prev) => ({
      ...prev,
      sessionTime: `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
    }));
  }, [sessionSeconds]);

  // Calculate angle between three points
  const calculateAngle = useCallback(
    (point1: any, point2: any, point3: any) => {
      const radians =
        Math.atan2(point3.y - point2.y, point3.x - point2.x) -
        Math.atan2(point1.y - point2.y, point1.x - point2.x);
      let angle = Math.abs((radians * 180.0) / Math.PI);
      if (angle > 180.0) {
        angle = 360 - angle;
      }
      return angle;
    },
    [],
  );

  // Adaptive exercise configurations with relaxed thresholds and user learning
  const exerciseConfigs = {
    squat: {
      perfectKneeAngle: { min: 60, max: 90 },
      acceptableKneeAngle: { min: 45, max: 140 },
      targetHipDepth: 0.05,
      maxTorsoLean: 35,
      // CRITICAL FIX: Much more relaxed rep detection thresholds
      downStateKneeAngle: 95, // Relaxed from 110° to 95° (40° range)
      upStateKneeAngle: 135, // Relaxed from 120° to 135° 
      minMovementRange: 10, // Reduced from 20° to 10° for partial reps
      adaptiveThresholds: true, // Enable adaptive learning
      learningFrames: 30, // Learn user range for 30 seconds
    },
    pushup: {
      perfectElbowAngle: { min: 45, max: 90 },
      acceptableElbowAngle: { min: 30, max: 130 },
      maxBodySag: 0.12,
      minRangeOfMotion: 15,
      // CRITICAL FIX: Much more relaxed rep detection thresholds
      downStateElbowAngle: 90, // Relaxed from 110° to 90° (50° range)
      upStateElbowAngle: 140, // Relaxed from 130° to 140°
      minMovementRange: 10, // Reduced from 20° to 10° for partial reps
      adaptiveThresholds: true, // Enable adaptive learning
      learningFrames: 30, // Learn user range for 30 seconds
    },
    plank: {
      perfectBodyLine: { min: 170, max: 185 },
      acceptableBodyLine: { min: 160, max: 195 },
      maxHipSag: 0.03,
      shoulderAlignment: 0.02
    }
  };

  // Unified squat analysis
  const analyzeSquat = useCallback(
    (landmarks: any[]) => {
      if (!landmarks || landmarks.length < 33) return null;

      const leftHip = landmarks[23];
      const leftKnee = landmarks[25];
      const leftAnkle = landmarks[27];
      const rightHip = landmarks[24];
      const rightKnee = landmarks[26];
      const rightAnkle = landmarks[28];
      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];

      // Calculate angles
      const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
      const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
      const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

      // Form analysis
      const hipHeight = (leftHip.y + rightHip.y) / 2;
      const shoulderHeight = (leftShoulder.y + rightShoulder.y) / 2;
      const hipDepth = shoulderHeight - hipHeight;

      const feedbackList: PoseFeedback[] = [];
      let formScore = 100;

      // Much more encouraging and realistic feedback system
      const { min: perfectMinKnee, max: perfectMaxKnee } = exerciseConfigs.squat.perfectKneeAngle;
      const { min: acceptableMinKnee, max: acceptableMaxKnee } = exerciseConfigs.squat.acceptableKneeAngle;
      
      // Focus on positive feedback and realistic expectations
      if (avgKneeAngle >= perfectMinKnee && avgKneeAngle <= perfectMaxKnee) {
        feedbackList.push({ type: "success", message: "Excellent squat depth!", icon: "✓" });
      } else if (avgKneeAngle >= acceptableMinKnee && avgKneeAngle <= acceptableMaxKnee) {
        feedbackList.push({ type: "success", message: "Great squat form!", icon: "👍" });
      } else if (avgKneeAngle > acceptableMaxKnee) {
        // Only suggest going deeper if they're standing too upright
        if (avgKneeAngle > 150) {
          feedbackList.push({ type: "warning", message: "Try bending your knees more", icon: "⬇️" });
          formScore -= 15;
        } else {
          feedbackList.push({ type: "success", message: "Good movement - keep it consistent!", icon: "👍" });
        }
      } else if (avgKneeAngle < acceptableMinKnee) {
        // Encourage deep squats - don't penalize depth!
        feedbackList.push({ type: "success", message: "Impressive depth! Great flexibility!", icon: "🔥" });
      }

      // Remove restrictive hip depth feedback - let people squat deep
      // Only check for obviously poor form (too upright)
      if (hipDepth < -0.1) {
        feedbackList.push({ type: "warning", message: "Sit back more into the squat", icon: "📐" });
        formScore -= 10;
      }

      // Improved rep counting with velocity-based detection
      const currentPosition = {
        hipHeight,
        kneeAngle: avgKneeAngle,
        timestamp: Date.now(),
      };
      previousPositionsRef.current.push(currentPosition);

      if (previousPositionsRef.current.length > 8) {
        previousPositionsRef.current.shift();
      }

      // Calculate movement velocity
      let angleVelocity = 0;
      if (previousPositionsRef.current.length >= 2) {
        const prev = previousPositionsRef.current[previousPositionsRef.current.length - 2];
        const current = previousPositionsRef.current[previousPositionsRef.current.length - 1];
        const timeDiff = current.timestamp - prev.timestamp;
        if (timeDiff > 0) {
          angleVelocity = (current.kneeAngle - prev.kneeAngle) / timeDiff * 1000; // degrees per second
        }
      }

      // Track velocity history for movement direction detection
      movementVelocityRef.current.push(angleVelocity);
      if (movementVelocityRef.current.length > VELOCITY_HISTORY_FRAMES) {
        movementVelocityRef.current.shift();
      }

      let currentState = exerciseStateRef.current;
      const now = Date.now();
      let repDetected = false;
      const config = exerciseConfigs.squat;

      // CRITICAL FIX: Adaptive rep detection with user-learned thresholds
      updateAdaptiveThresholds(avgKneeAngle, 'squat');
      
      if (previousPositionsRef.current.length >= POSITION_STABILITY_FRAMES) {
        const current = avgKneeAngle;
        
        // Use adaptive thresholds if available, otherwise use relaxed defaults
        const downThreshold = adaptiveThresholds.current.squat?.down || config.downStateKneeAngle;
        const upThreshold = adaptiveThresholds.current.squat?.up || config.upStateKneeAngle;
        
        console.log(`🏋️ [SQUAT_DEBUG] State: ${currentState}, Knee: ${current.toFixed(1)}°, Thresholds: down=${downThreshold.toFixed(1)}°, up=${upThreshold.toFixed(1)}°, Reps: ${repCounterRef.current}`);
        
        if (currentState === "neutral" || currentState === "up") {
          // Detect going down - adaptive threshold
          if (current < downThreshold) {
            console.log(`⬇️ [SQUAT_REP] Going DOWN: ${current.toFixed(1)}° < ${downThreshold.toFixed(1)}° (threshold)`);
            currentState = "down";
            exerciseStateRef.current = "down";
          }
        } else if (currentState === "down") {
          // Detect coming back up with relaxed stability checks
          if (current > upThreshold && 
              now - lastRepTimeRef.current > REP_COOLDOWN_MS) {
            
            // RELAXED STABILITY CHECK: Only require 2 frames within 75° tolerance
            const hasStableTracking = previousPositionsRef.current.length >= POSITION_STABILITY_FRAMES;
            const recentTrackingStable = previousPositionsRef.current.slice(-POSITION_STABILITY_FRAMES).every(p => 
              Math.abs(p.kneeAngle - current) < 75 // Increased from 50° to 75°
            );
            
            if (hasStableTracking && recentTrackingStable) {
              // Much simpler movement range check
              const recentAngles = previousPositionsRef.current.slice(-6).map(p => p.kneeAngle);
              const minRecentAngle = Math.min(...recentAngles);
              const movementRange = current - minRecentAngle;
              
              // Very lenient rep validation with reduced minimum range
              if (movementRange >= config.minMovementRange) {
                console.log(`🎯 [SQUAT_REP] REP DETECTED! Up: ${current.toFixed(1)}° > ${upThreshold.toFixed(1)}°, Range: ${movementRange.toFixed(1)}°`);
                currentState = "up";
                exerciseStateRef.current = "up";
                repCounterRef.current += 1;
                lastRepTimeRef.current = now;
                repDetected = true;
                repFlashRef.current = true;

                setTimeout(() => {
                  repFlashRef.current = false;
                }, 800);
              }
            } else {
              console.log(`⚠️ [SQUAT_DEBUG] Unstable tracking detected, waiting for stability`);
            }
          }
        }
      }

      if (repDetected) {
        feedbackList.push({
          type: "success",
          message: "Rep Detected! Great form!",
          icon: "🎯",
        });
      }

      const isExercising = currentState !== 'neutral' || (avgKneeAngle < 150 && hipHeight > 0.4);

      // Ensure positive feedback when exercising with decent form
      if (isExercising && feedbackList.length === 0) {
        feedbackList.push({ type: "success", message: "Keep going - you're doing great!", icon: "💪" });
      }

      // Calculate hip angle (shoulder-hip-knee)
      const hipMidpoint = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
      const shoulderMidpoint = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
      const kneeMidpoint = { x: (leftKnee.x + rightKnee.x) / 2, y: (leftKnee.y + rightKnee.y) / 2 };
      const hipAngle = calculateAngle(shoulderMidpoint, hipMidpoint, kneeMidpoint);

      // Calculate torso angle (vertical reference to torso lean)
      const verticalReference = { x: shoulderMidpoint.x, y: shoulderMidpoint.y + 0.2 };
      const torsoAngle = calculateAngle(hipMidpoint, shoulderMidpoint, verticalReference);

      return {
        formQuality: Math.max(formScore, 0),
        reps: repCounterRef.current,
        feedback: feedbackList,
        isExercising,
        currentAngles: {
          angles: [
            { name: "Knee", value: avgKneeAngle },
            { name: "Hip", value: hipAngle },
            { name: "Torso", value: torsoAngle }
          ]
        }
      };
    },
    [calculateAngle],
  );

  // Unified push-up analysis with rep counting
  const analyzePushUp = useCallback(
    (landmarks: any[]) => {
      if (!landmarks || landmarks.length < 33) return null;

      const leftShoulder = landmarks[11];
      const leftElbow = landmarks[13];
      const leftWrist = landmarks[15];
      const rightShoulder = landmarks[12];
      const rightElbow = landmarks[14];
      const rightWrist = landmarks[16];
      const leftHip = landmarks[23];
      const rightHip = landmarks[24];

      // Calculate elbow angles
      const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
      const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
      const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

      // Form analysis
      const shoulderHeight = (leftShoulder.y + rightShoulder.y) / 2;
      const hipHeight = (leftHip.y + rightHip.y) / 2;
      const bodySag = Math.abs(shoulderHeight - hipHeight);

      const feedbackList: PoseFeedback[] = [];
      let formScore = 100;

      // More encouraging push-up feedback system
      const { min: perfectMinElbow, max: perfectMaxElbow } = exerciseConfigs.pushup.perfectElbowAngle;
      const { min: acceptableMinElbow, max: acceptableMaxElbow } = exerciseConfigs.pushup.acceptableElbowAngle;
      
      // Focus on positive feedback and realistic expectations
      if (avgElbowAngle >= perfectMinElbow && avgElbowAngle <= perfectMaxElbow) {
        feedbackList.push({ type: "success", message: "Excellent push-up depth!", icon: "✓" });
      } else if (avgElbowAngle >= acceptableMinElbow && avgElbowAngle <= acceptableMaxElbow) {
        feedbackList.push({ type: "success", message: "Great push-up form!", icon: "👍" });
      } else if (avgElbowAngle > acceptableMaxElbow) {
        // Only suggest going lower if they're barely bending arms
        if (avgElbowAngle > 150) {
          feedbackList.push({ type: "warning", message: "Try lowering your chest more", icon: "⬇️" });
          formScore -= 15;
        } else {
          feedbackList.push({ type: "success", message: "Good movement - keep it consistent!", icon: "👍" });
        }
      } else if (avgElbowAngle < acceptableMinElbow) {
        // Don't penalize deep push-ups
        feedbackList.push({ type: "success", message: "Great range of motion!", icon: "🔥" });
      }

      // More lenient body alignment check
      if (bodySag > exerciseConfigs.pushup.maxBodySag + 0.05) {
        feedbackList.push({ type: "warning", message: "Try to keep body straighter", icon: "📏" });
        formScore -= 10;
      }

      // Improved push-up rep counting with velocity-based detection
      const currentPosition = {
        shoulderHeight,
        elbowAngle: avgElbowAngle,
        timestamp: Date.now(),
      };
      previousPositionsRef.current.push(currentPosition);

      if (previousPositionsRef.current.length > 8) {
        previousPositionsRef.current.shift();
      }

      // Calculate elbow angle velocity
      let angleVelocity = 0;
      if (previousPositionsRef.current.length >= 2) {
        const prev = previousPositionsRef.current[previousPositionsRef.current.length - 2];
        const current = previousPositionsRef.current[previousPositionsRef.current.length - 1];
        const timeDiff = current.timestamp - prev.timestamp;
        if (timeDiff > 0) {
          angleVelocity = (current.elbowAngle - prev.elbowAngle) / timeDiff * 1000; // degrees per second
        }
      }

      // Track velocity history for movement direction detection
      movementVelocityRef.current.push(angleVelocity);
      if (movementVelocityRef.current.length > VELOCITY_HISTORY_FRAMES) {
        movementVelocityRef.current.shift();
      }

      let currentState = exerciseStateRef.current;
      const now = Date.now();
      let repDetected = false;
      const config = exerciseConfigs.pushup;

      // CRITICAL FIX: Adaptive push-up rep detection with user-learned thresholds
      updateAdaptiveThresholds(avgElbowAngle, 'pushup');
      
      if (previousPositionsRef.current.length >= POSITION_STABILITY_FRAMES) {
        const current = avgElbowAngle;
        
        // Use adaptive thresholds if available, otherwise use relaxed defaults
        const downThreshold = adaptiveThresholds.current.pushup?.down || config.downStateElbowAngle;
        const upThreshold = adaptiveThresholds.current.pushup?.up || config.upStateElbowAngle;
        
        console.log(`💪 [PUSHUP_DEBUG] State: ${currentState}, Elbow: ${current.toFixed(1)}°, Thresholds: down=${downThreshold.toFixed(1)}°, up=${upThreshold.toFixed(1)}°, Reps: ${repCounterRef.current}`);
        
        if (currentState === "neutral" || currentState === "up") {
          // Detect going down - adaptive threshold
          if (current < downThreshold) {
            console.log(`⬇️ [PUSHUP_REP] Going DOWN: ${current.toFixed(1)}° < ${downThreshold.toFixed(1)}° (threshold)`);
            currentState = "down";
            exerciseStateRef.current = "down";
          }
        } else if (currentState === "down") {
          // Detect coming back up with adaptive thresholds and relaxed stability checks
          if (current > upThreshold && 
              now - lastRepTimeRef.current > REP_COOLDOWN_MS) {
            
            // RELAXED STABILITY CHECK: Only require 2 frames within 75° tolerance
            const hasStableTracking = previousPositionsRef.current.length >= POSITION_STABILITY_FRAMES;
            const recentTrackingStable = previousPositionsRef.current.slice(-POSITION_STABILITY_FRAMES).every(p => 
              Math.abs(p.elbowAngle - current) < 75 // Increased from 50° to 75°
            );
            
            if (hasStableTracking && recentTrackingStable) {
              // Much simpler movement range check
              const recentAngles = previousPositionsRef.current.slice(-6).map(p => p.elbowAngle);
              const minRecentAngle = Math.min(...recentAngles);
              const movementRange = current - minRecentAngle;
              
              // Very lenient rep validation with reduced minimum range
              if (movementRange >= config.minMovementRange) {
                console.log(`🎯 [PUSHUP_REP] REP DETECTED! Up: ${current.toFixed(1)}° > ${upThreshold.toFixed(1)}°, Range: ${movementRange.toFixed(1)}°`);
                currentState = "up";
                exerciseStateRef.current = "up";
                repCounterRef.current += 1;
                lastRepTimeRef.current = now;
                repDetected = true;
                repFlashRef.current = true;

                setTimeout(() => {
                  repFlashRef.current = false;
                }, 800);
              }
            } else {
              console.log(`⚠️ [PUSHUP_DEBUG] Unstable tracking detected, waiting for stability`);
            }
          }
        }
      }

      if (repDetected) {
        feedbackList.push({
          type: "success",
          message: "Push-up Rep Detected! Great form!",
          icon: "🎯",
        });
      }

      const isInPushUpPosition = bodySag < 0.3 && shoulderHeight > 0.2;
      const isExercising = currentState !== 'neutral' || (avgElbowAngle < 160 && shoulderHeight > 0.2);

      // Ensure positive feedback when exercising with decent form
      if (isExercising && feedbackList.length === 0) {
        feedbackList.push({ type: "success", message: "Keep going - you're doing great!", icon: "💪" });
      }

      // Calculate body line angle for push-up form
      const shoulderMidpoint = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
      const hipMidpoint = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
      const leftKnee = landmarks[25];
      const rightKnee = landmarks[26];
      const kneeMidpoint = { x: (leftKnee.x + rightKnee.x) / 2, y: (leftKnee.y + rightKnee.y) / 2 };
      const bodyLineAngle = calculateAngle(shoulderMidpoint, hipMidpoint, kneeMidpoint);

      return {
        formQuality: Math.max(formScore, 0),
        reps: repCounterRef.current,
        feedback: feedbackList,
        isExercising,
        currentAngles: {
          angles: [
            { name: "Elbow", value: avgElbowAngle },
            { name: "Body Line", value: bodyLineAngle }
          ]
        }
      };
    },
    [calculateAngle],
  );

  // Unified plank analysis with improved position detection
  const analyzePlank = useCallback(
    (landmarks: any[]) => {
      if (!landmarks || landmarks.length < 33) return null;

      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];
      const leftElbow = landmarks[13];
      const rightElbow = landmarks[14];
      const leftWrist = landmarks[15];
      const rightWrist = landmarks[16];
      const leftHip = landmarks[23];
      const rightHip = landmarks[24];
      const leftKnee = landmarks[25];
      const rightKnee = landmarks[26];
      const leftAnkle = landmarks[27];
      const rightAnkle = landmarks[28];

      // Calculate body line angle (shoulder to hip to knee)
      const shoulderPoint = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
      const hipPoint = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
      const kneePoint = { x: (leftKnee.x + rightKnee.x) / 2, y: (leftKnee.y + rightKnee.y) / 2 };
      const anklePoint = { x: (leftAnkle.x + rightAnkle.x) / 2, y: (leftAnkle.y + rightAnkle.y) / 2 };

      const bodyLineAngle = calculateAngle(shoulderPoint, hipPoint, kneePoint);
      
      // Calculate shoulder alignment for proper support
      const elbowPoint = { x: (leftElbow.x + rightElbow.x) / 2, y: (leftElbow.y + rightElbow.y) / 2 };
      const wristPoint = { x: (leftWrist.x + rightWrist.x) / 2, y: (leftWrist.y + rightWrist.y) / 2 };
      
      const feedbackList: PoseFeedback[] = [];
      let formScore = 100;

      // Analyze body line alignment with perfect and acceptable ranges
      const { min: perfectMinAngle, max: perfectMaxAngle } = exerciseConfigs.plank.perfectBodyLine;
      const { min: acceptableMinAngle, max: acceptableMaxAngle } = exerciseConfigs.plank.acceptableBodyLine;
      
      if (bodyLineAngle >= perfectMinAngle && bodyLineAngle <= perfectMaxAngle) {
        feedbackList.push({ type: "success", message: "Perfect plank alignment!", icon: "✓" });
      } else if (bodyLineAngle >= acceptableMinAngle && bodyLineAngle <= acceptableMaxAngle) {
        feedbackList.push({ type: "success", message: "Good plank position - hold steady!", icon: "👍" });
      } else if (bodyLineAngle < acceptableMinAngle) {
        feedbackList.push({ type: "warning", message: "Lower your hips - straighten body", icon: "📐" });
        formScore -= 25;
      } else if (bodyLineAngle > acceptableMaxAngle) {
        feedbackList.push({ type: "warning", message: "Lift your hips - don't sag", icon: "⬆️" });
        formScore -= 25;
      }

      // Check shoulder alignment (elbows should be under shoulders)
      const shoulderElbowAlignment = Math.abs(shoulderPoint.x - elbowPoint.x);
      if (shoulderElbowAlignment > exerciseConfigs.plank.shoulderAlignment + 0.03) {
        feedbackList.push({ type: "warning", message: "Position elbows under shoulders", icon: "📍" });
        formScore -= 15;
      }

      // Check for hip sag
      const hipSag = Math.abs(shoulderPoint.y - hipPoint.y);
      if (hipSag > exerciseConfigs.plank.maxHipSag + 0.05) {
        feedbackList.push({ type: "warning", message: "Engage core - prevent hip sag", icon: "💪" });
        formScore -= 20;
      }

      // Position stability tracking for plank
      previousPositionsRef.current.push({
        bodyLineAngle,
        hipHeight: hipPoint.y,
        shoulderHeight: shoulderPoint.y,
        timestamp: Date.now(),
      });

      if (previousPositionsRef.current.length > 10) {
        previousPositionsRef.current.shift();
      }

      // Determine if in proper plank position
      const isInPlankReady = shoulderPoint.y > 0.2 && shoulderPoint.y < 0.7; // Reasonable height range
      const hasGoodAlignment = Math.abs(shoulderPoint.y - hipPoint.y) < 0.15; // Body relatively straight
      const isGrounded = anklePoint.y > shoulderPoint.y; // Feet are lower than shoulders (on ground)
      const hasStability = previousPositionsRef.current.length >= 3;

      const isInPlankPosition = isInPlankReady && hasGoodAlignment && isGrounded;
      const isExercising = isInPlankPosition && hasStability;

      // Add position guidance if not in plank
      if (!isInPlankPosition && isInPlankReady) {
        feedbackList.push({ type: "warning", message: "Get into plank position", icon: "🧘" });
      }

      // Ensure positive feedback when exercising with decent form
      if (isExercising && feedbackList.length === 0) {
        feedbackList.push({ type: "success", message: "Keep holding - you're doing great!", icon: "💪" });
      }

      // Calculate hip angle for plank position analysis
      const hipAngle = calculateAngle(shoulderPoint, hipPoint, kneePoint);

      return {
        formQuality: Math.max(formScore, 0),
        reps: 0, // Planks don't count reps, they measure hold time
        feedback: feedbackList,
        isExercising,
        currentAngles: {
          angles: [
            { name: "Body Line", value: bodyLineAngle },
            { name: "Hip", value: hipAngle }
          ]
        }
      };
    },
    [calculateAngle],
  );

  // Assess pose detection quality
  const assessPoseQuality = useCallback((results: Results) => {
    if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
      return {
        detectionQuality: "poor" as const,
        trackingStatus: "lost" as const,
        confidence: 0,
        completeness: 0,
      };
    }

    const landmarks = results.poseLandmarks;
    const visibleLandmarks = landmarks.filter(landmark => (landmark.visibility || 0) > 0.5);
    const avgVisibility = visibleLandmarks.length > 0
      ? visibleLandmarks.reduce((sum, landmark) => sum + (landmark.visibility || 0), 0) / visibleLandmarks.length
      : 0;

    const keyLandmarks = [11, 12, 23, 24, 25, 26, 13, 14];
    const visibleKeyLandmarks = keyLandmarks.filter(index => landmarks[index] && (landmarks[index].visibility || 0) > 0.5);
    const completeness = visibleKeyLandmarks.length / keyLandmarks.length;

    let trackingStatus: "optimal" | "too_close" | "partial" | "lost" | "repositioning";
    let detectionQuality: "poor" | "good" | "excellent";

    if (completeness < 0.5) {
      trackingStatus = "lost";
    } else if (completeness < 0.75) {
      trackingStatus = "partial";
    } else if (avgVisibility < 0.7) {
      trackingStatus = "repositioning";
    } else {
      trackingStatus = "optimal";
    }

    if (avgVisibility >= 0.8 && completeness >= 0.9 && trackingStatus === "optimal") {
      detectionQuality = "excellent";
    } else if (avgVisibility >= 0.6 && completeness >= 0.75) {
      detectionQuality = "good";
    } else {
      detectionQuality = "poor";
    }

    return { detectionQuality, trackingStatus, confidence: avgVisibility, completeness };
  }, []);

  // Process pose results
  const processPoseResults = useCallback(
    (results: Results) => {
      const quality = assessPoseQuality(results);

      if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
        console.log(`🔍 [POSE_DEBUG] No person detected - preserving exercise state`);
        
        // CRITICAL FIX: Don't reset exercise state during temporary detection loss
        // Only reset position tracking data, preserve rep counting state
        previousPositionsRef.current = [];
        movementVelocityRef.current = [];
        
        setMetrics((prev) => ({
          ...prev,
          isPersonDetected: false,
          isExercising: false,
          formQuality: 0,
          detectionQuality: quality.detectionQuality,
          trackingStatus: quality.trackingStatus,
        }));
        setFeedback([{ type: "warning", message: "No person detected", icon: "👤" }]);
        return;
      }

      // CRITICAL FIX: Intelligent detection recovery - differentiate brief occlusion vs intentional exit
      const wasDetectionLost = !metrics.isPersonDetected;
      const now = Date.now();
      
      if (wasDetectionLost && (quality.detectionQuality === "good" || quality.detectionQuality === "excellent")) {
        const detectionLossDuration = detectionLossTime.current > 0 ? now - detectionLossTime.current : 0;
        
        if (detectionLossDuration < BRIEF_OCCLUSION_THRESHOLD) {
          // Brief occlusion (<2s) - preserve state, minimal reset
          console.log(`🔄 [RECOVERY_DEBUG] Brief occlusion recovery (${(detectionLossDuration/1000).toFixed(1)}s) for ${exercise} - preserving state`);
          
          // Only clear recent position data, preserve state machine
          if (previousPositionsRef.current.length > 3) {
            previousPositionsRef.current = previousPositionsRef.current.slice(-2); // Keep last 2 positions
          }
          
          // Add minimal grace period (500ms) not full cooldown
          lastRepTimeRef.current = Math.max(lastRepTimeRef.current, now - REP_COOLDOWN_MS + 500);
          
        } else if (detectionLossDuration >= SUSTAINED_ABSENCE_THRESHOLD) {
          // Sustained absence (>5s) - full reset
          console.log(`🔄 [RECOVERY_DEBUG] Sustained absence recovery (${(detectionLossDuration/1000).toFixed(1)}s) for ${exercise} - full reset`);
          
          exerciseStateRef.current = "neutral";
          previousPositionsRef.current = [];
          movementVelocityRef.current = [];
          lastRepTimeRef.current = now;
          
        } else {
          // Medium absence (2-5s) - partial reset with caution
          console.log(`🔄 [RECOVERY_DEBUG] Medium absence recovery (${(detectionLossDuration/1000).toFixed(1)}s) for ${exercise} - cautious reset`);
          
          // Reset to neutral but keep some position history
          exerciseStateRef.current = "neutral";
          previousPositionsRef.current = previousPositionsRef.current.slice(-1); // Keep last position
          lastRepTimeRef.current = now;
        }
        
        detectionLossTime.current = 0; // Reset loss timer
      }
      
      // Track detection state for loss duration calculation
      if (!results.poseLandmarks || results.poseLandmarks.length === 0) {
        if (detectionLossTime.current === 0) {
          detectionLossTime.current = now;
        }
      } else {
        lastDetectionTime.current = now;
      }

      // Only perform exercise analysis if detection quality is good or better
      let analysis = null;
      if (quality.detectionQuality === "good" || quality.detectionQuality === "excellent") {
        switch (exercise) {
          case "squat":
            analysis = analyzeSquat(results.poseLandmarks);
            break;
          case "pushup":
            analysis = analyzePushUp(results.poseLandmarks);
            break;
          case "plank":
            analysis = analyzePlank(results.poseLandmarks);
            break;
        }
      }

      if (analysis) {
        setMetrics((prev) => ({
          ...prev,
          isPersonDetected: true,
          isExercising: analysis.isExercising,
          formQuality: analysis.formQuality,
          reps: analysis.reps,
          detectionQuality: quality.detectionQuality,
          trackingStatus: quality.trackingStatus,
          currentAngles: analysis.currentAngles,
        }));

        if (analysis.feedback.length > 0) {
          setFeedback(analysis.feedback);
        } else if (!analysis.isExercising) {
          setFeedback([{
            type: "warning",
            message: `Get into ${exercise} position to start analysis`,
            icon: "💪",
          }]);
        }
      } else {
        setMetrics((prev) => ({
          ...prev,
          isPersonDetected: true,
          isExercising: false,
          formQuality: 0,
          detectionQuality: quality.detectionQuality,
          trackingStatus: quality.trackingStatus,
        }));
        setFeedback([{ type: "warning", message: "Improve camera position for better tracking", icon: "⚠️" }]);
      }
    },
    [exercise, analyzeSquat, analyzePushUp, analyzePlank, assessPoseQuality],
  );

  const processPoseResultsCallback = useCallback(processPoseResults, [processPoseResults]);

  return {
    metrics,
    feedback,
    processPoseResultsCallback,
    repFlash: repFlashRef.current,
  };
}