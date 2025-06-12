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

  // Improved rep validation thresholds
  const REP_COOLDOWN_MS = 500; // Reduced from 750ms for more responsive detection
  const POSITION_STABILITY_FRAMES = 3; // Reduced from 5 for natural movement
  const VELOCITY_HISTORY_FRAMES = 4;

  // Reset counters when exercise changes
  useEffect(() => {
    repCounterRef.current = 0;
    exerciseStateRef.current = "neutral";
    previousPositionsRef.current = [];
    lastRepTimeRef.current = 0;
    setSessionSeconds(0);
  }, [exercise]);

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

  // Improved exercise configurations with relaxed, realistic thresholds
  const exerciseConfigs = {
    squat: {
      perfectKneeAngle: { min: 70, max: 100 }, // Relaxed from 80-95
      acceptableKneeAngle: { min: 60, max: 120 }, // Relaxed from 70-110
      targetHipDepth: 0.15,
      maxTorsoLean: 25, // Relaxed from 20
      // New rep detection thresholds
      downStateKneeAngle: 100, // Relaxed from 110
      upStateKneeAngle: 130, // Relaxed from 140
      minMovementRange: 25, // Minimum angle change for valid rep
    },
    pushup: {
      perfectElbowAngle: { min: 60, max: 100 }, // Relaxed from 70-90
      acceptableElbowAngle: { min: 45, max: 120 }, // Relaxed from 60-110
      maxBodySag: 0.07, // Relaxed from 0.05
      minRangeOfMotion: 20, // Relaxed from 25
      // New rep detection thresholds
      downStateElbowAngle: 100, // More realistic threshold
      upStateElbowAngle: 140, // More realistic threshold
      minMovementRange: 30, // Minimum angle change for valid rep
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

      // Analyze knee angle with perfect and acceptable ranges
      const { min: perfectMinKnee, max: perfectMaxKnee } = exerciseConfigs.squat.perfectKneeAngle;
      const { min: acceptableMinKnee, max: acceptableMaxKnee } = exerciseConfigs.squat.acceptableKneeAngle;
      
      if (avgKneeAngle >= perfectMinKnee && avgKneeAngle <= perfectMaxKnee) {
        feedbackList.push({ type: "success", message: "Perfect squat depth!", icon: "✓" });
      } else if (avgKneeAngle >= acceptableMinKnee && avgKneeAngle <= acceptableMaxKnee) {
        feedbackList.push({ type: "success", message: "Good squat form - keep it up!", icon: "👍" });
      } else if (avgKneeAngle > acceptableMaxKnee) {
        feedbackList.push({ type: "warning", message: "Go deeper - bend your knees more", icon: "⬇️" });
        formScore -= 25;
      } else if (avgKneeAngle < acceptableMinKnee) {
        feedbackList.push({ type: "warning", message: "Don't go too deep - protect your knees", icon: "⚠️" });
        formScore -= 15;
      }

      // Analyze hip depth
      if (hipDepth < exerciseConfigs.squat.targetHipDepth - 0.05) {
        feedbackList.push({ type: "warning", message: "Lower your hips below knee level", icon: "📐" });
        formScore -= 20;
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

      if (previousPositionsRef.current.length >= POSITION_STABILITY_FRAMES) {
        const recentPositions = previousPositionsRef.current.slice(-POSITION_STABILITY_FRAMES);
        const avgRecentKneeAngle = recentPositions.reduce((sum, pos) => sum + pos.kneeAngle, 0) / recentPositions.length;
        
        // Detect movement completion using velocity near zero
        const recentVelocities = movementVelocityRef.current.slice(-2);
        const avgVelocity = recentVelocities.length > 0 ? 
          recentVelocities.reduce((sum, v) => sum + Math.abs(v), 0) / recentVelocities.length : 0;
        const isMovementSlowing = avgVelocity < 20; // degrees/sec threshold

        if (currentState === "neutral" || currentState === "up") {
          // Detect transition to down position with relaxed thresholds
          if (avgRecentKneeAngle < config.downStateKneeAngle) {
            const validDownFrames = recentPositions.filter(pos => pos.kneeAngle < config.downStateKneeAngle + 15).length;
            if (validDownFrames >= 2) {
              currentState = "down";
              exerciseStateRef.current = "down";
            }
          }
        } else if (currentState === "down") {
          // Detect completion of rep (return to up position)
          if (avgRecentKneeAngle > config.upStateKneeAngle && isMovementSlowing) {
            const validUpFrames = recentPositions.filter(pos => pos.kneeAngle > config.upStateKneeAngle - 15).length;
            
            // Check minimum movement range was achieved
            const minKneeAngleInHistory = Math.min(...previousPositionsRef.current.map(p => p.kneeAngle));
            const movementRange = avgRecentKneeAngle - minKneeAngleInHistory;
            
            if (validUpFrames >= 2 && 
                movementRange >= config.minMovementRange && 
                now - lastRepTimeRef.current > REP_COOLDOWN_MS) {
              currentState = "up";
              exerciseStateRef.current = "up";
              repCounterRef.current += 1;
              lastRepTimeRef.current = now;
              repDetected = true;
              repFlashRef.current = true;

              setTimeout(() => {
                repFlashRef.current = false;
              }, 1000);
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

      // Analyze elbow angle with perfect and acceptable ranges
      const { min: perfectMinElbow, max: perfectMaxElbow } = exerciseConfigs.pushup.perfectElbowAngle;
      const { min: acceptableMinElbow, max: acceptableMaxElbow } = exerciseConfigs.pushup.acceptableElbowAngle;
      
      if (avgElbowAngle >= perfectMinElbow && avgElbowAngle <= perfectMaxElbow) {
        feedbackList.push({ type: "success", message: "Perfect push-up depth!", icon: "✓" });
      } else if (avgElbowAngle >= acceptableMinElbow && avgElbowAngle <= acceptableMaxElbow) {
        feedbackList.push({ type: "success", message: "Good push-up form - keep it up!", icon: "👍" });
      } else if (avgElbowAngle > acceptableMaxElbow) {
        feedbackList.push({ type: "warning", message: "Lower your chest more", icon: "⬇️" });
        formScore -= 25;
      } else if (avgElbowAngle < acceptableMinElbow) {
        feedbackList.push({ type: "warning", message: "Don't lower too much - maintain control", icon: "⚠️" });
        formScore -= 15;
      }

      // Body alignment check
      if (bodySag > exerciseConfigs.pushup.maxBodySag + 0.03) {
        feedbackList.push({ type: "warning", message: "Keep body straight - engage core", icon: "📏" });
        formScore -= 20;
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

      if (previousPositionsRef.current.length >= POSITION_STABILITY_FRAMES) {
        const recentPositions = previousPositionsRef.current.slice(-POSITION_STABILITY_FRAMES);
        const avgRecentElbowAngle = recentPositions.reduce((sum, pos) => sum + pos.elbowAngle, 0) / recentPositions.length;
        
        // Detect movement completion using velocity near zero
        const recentVelocities = movementVelocityRef.current.slice(-2);
        const avgVelocity = recentVelocities.length > 0 ? 
          recentVelocities.reduce((sum, v) => sum + Math.abs(v), 0) / recentVelocities.length : 0;
        const isMovementSlowing = avgVelocity < 25; // degrees/sec threshold for push-ups

        // Detect down position (chest lowered, smaller elbow angle) with relaxed thresholds
        if (currentState === "neutral" || currentState === "up") {
          if (avgRecentElbowAngle < config.downStateElbowAngle) {
            const validDownFrames = recentPositions.filter(pos => pos.elbowAngle < config.downStateElbowAngle + 15).length;
            if (validDownFrames >= 2) {
              currentState = "down";
              exerciseStateRef.current = "down";
            }
          }
        } 
        // Detect completion of rep (return to up position)
        else if (currentState === "down") {
          if (avgRecentElbowAngle > config.upStateElbowAngle && isMovementSlowing) {
            const validUpFrames = recentPositions.filter(pos => pos.elbowAngle > config.upStateElbowAngle - 15).length;
            
            // Check minimum movement range was achieved
            const minElbowAngleInHistory = Math.min(...previousPositionsRef.current.map(p => p.elbowAngle));
            const movementRange = avgRecentElbowAngle - minElbowAngleInHistory;
            
            if (validUpFrames >= 2 && 
                movementRange >= config.minMovementRange && 
                now - lastRepTimeRef.current > REP_COOLDOWN_MS) {
              currentState = "up";
              exerciseStateRef.current = "up";
              repCounterRef.current += 1;
              lastRepTimeRef.current = now;
              repDetected = true;
              repFlashRef.current = true;

              setTimeout(() => {
                repFlashRef.current = false;
              }, 1000);
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