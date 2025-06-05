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
    primaryAngle: number;
    angleName: string;
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

  const poseRef = useRef<Pose | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // Exercise-specific state
  const previousPositionsRef = useRef<any[]>([]);
  const repCounterRef = useRef(0);
  const lastRepTimeRef = useRef(0);
  const exerciseStateRef = useRef<"up" | "down" | "neutral">("neutral");
  const repFlashRef = useRef(false);

  // Rep validation thresholds
  const REP_COOLDOWN_MS = 750; // 0.75 seconds between reps
  const SQUAT_HEIGHT_THRESHOLD = 0.15;
  const PUSHUP_ANGLE_THRESHOLD = 30;
  const POSITION_STABILITY_FRAMES = 5;

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

  // Exercise configurations for target ranges
  const exerciseConfigs = {
    squat: {
      targetKneeAngle: { min: 80, max: 95 },
      targetHipDepth: 0.15,
      maxTorsoLean: 20
    },
    pushup: {
      targetElbowAngle: { min: 70, max: 90 },
      maxBodySag: 0.05,
      minRangeOfMotion: 25
    },
    plank: {
      targetBodyLine: { min: 170, max: 185 },
      maxHipSag: 0.03,
      shoulderAlignment: 0.02
    }
  };

  // Unified squat analysis with form scoring and rep counting
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

      // Form analysis calculations
      const hipHeight = (leftHip.y + rightHip.y) / 2;
      const shoulderHeight = (leftShoulder.y + rightShoulder.y) / 2;
      const hipDepth = shoulderHeight - hipHeight;

      // Enhanced form scoring
      const feedbackList: PoseFeedback[] = [];
      let formScore = 100;

      // Analyze knee angle using config
      const { min: minKnee, max: maxKnee } = exerciseConfigs.squat.targetKneeAngle;
      if (avgKneeAngle > maxKnee + 20) {
        feedbackList.push({ type: "warning", message: "Go deeper - bend your knees more", icon: "⬇️" });
        formScore -= 25;
      } else if (avgKneeAngle < minKnee - 10) {
        feedbackList.push({ type: "warning", message: "Don't go too deep - protect your knees", icon: "⚠️" });
        formScore -= 15;
      } else if (avgKneeAngle >= minKnee && avgKneeAngle <= maxKnee) {
        feedbackList.push({ type: "success", message: "Perfect squat depth!", icon: "✓" });
      }

      // Store position history for rep counting
      previousPositionsRef.current.push({
        hipHeight,
        kneeAngle: avgKneeAngle,
        timestamp: Date.now(),
      });

      if (previousPositionsRef.current.length > 10) {
        previousPositionsRef.current.shift();
      }

      // Rep counting logic
      let currentState = exerciseStateRef.current;
      const now = Date.now();
      let repDetected = false;

      if (previousPositionsRef.current.length >= POSITION_STABILITY_FRAMES) {
        const recentPositions = previousPositionsRef.current.slice(-POSITION_STABILITY_FRAMES);
        const avgRecentHipHeight = recentPositions.reduce((sum, pos) => sum + pos.hipHeight, 0) / recentPositions.length;
        const avgRecentKneeAngle = recentPositions.reduce((sum, pos) => sum + pos.kneeAngle, 0) / recentPositions.length;

        if (currentState === "neutral" || currentState === "up") {
          if (avgRecentKneeAngle < 110 && avgRecentHipHeight > 0.6) {
            const validDownFrames = recentPositions.filter(pos => pos.kneeAngle < 120 && pos.hipHeight > 0.55).length;
            if (validDownFrames >= 3) {
              currentState = "down";
              exerciseStateRef.current = "down";
            }
          }
        } else if (currentState === "down") {
          if (avgRecentKneeAngle > 140 && avgRecentHipHeight < 0.5) {
            const validUpFrames = recentPositions.filter(pos => pos.kneeAngle > 135 && pos.hipHeight < 0.55).length;
            if (validUpFrames >= 3 && now - lastRepTimeRef.current > REP_COOLDOWN_MS) {
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

      return {
        formQuality: Math.max(formScore, 0),
        reps: repCounterRef.current,
        feedback: feedbackList,
        isExercising,
        currentAngles: {
          primaryAngle: avgKneeAngle,
          angleName: "Knee Angle"
        }
      };
    },
    [calculateAngle],
  );

  // Unified push-up analysis
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

      // Form scoring
      const feedbackList: PoseFeedback[] = [];
      let formScore = 100;

      // Analyze elbow angle
      const { min: minElbow, max: maxElbow } = exerciseConfigs.pushup.targetElbowAngle;
      if (avgElbowAngle > maxElbow + 30) {
        feedbackList.push({ type: "warning", message: "Lower your chest more", icon: "⬇️" });
        formScore -= 25;
      } else if (avgElbowAngle >= minElbow && avgElbowAngle <= maxElbow) {
        feedbackList.push({ type: "success", message: "Perfect push-up depth!", icon: "✓" });
      }

      // Body alignment check
      const shoulderHeight = (leftShoulder.y + rightShoulder.y) / 2;
      const hipHeight = (leftHip.y + rightHip.y) / 2;
      const bodySag = Math.abs(shoulderHeight - hipHeight);

      if (bodySag > exerciseConfigs.pushup.maxBodySag + 0.03) {
        feedbackList.push({ type: "warning", message: "Keep body straight - engage core", icon: "📏" });
        formScore -= 20;
      }

      const isInPushUpPosition = bodySag < 0.3 && shoulderHeight > 0.3;

      return {
        formQuality: Math.max(formScore, 0),
        reps: repCounterRef.current,
        feedback: feedbackList,
        isExercising: isInPushUpPosition,
        currentAngles: {
          primaryAngle: avgElbowAngle,
          angleName: "Elbow Angle"
        }
      };
    },
    [calculateAngle],
  );

  // Unified plank analysis
  const analyzePlank = useCallback(
    (landmarks: any[]) => {
      if (!landmarks || landmarks.length < 33) return null;

      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];
      const leftHip = landmarks[23];
      const rightHip = landmarks[24];
      const leftKnee = landmarks[25];
      const rightKnee = landmarks[26];

      // Calculate body line angle
      const shoulderPoint = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
      const hipPoint = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
      const kneePoint = { x: (leftKnee.x + rightKnee.x) / 2, y: (leftKnee.y + rightKnee.y) / 2 };

      const bodyLineAngle = calculateAngle(shoulderPoint, hipPoint, kneePoint);

      const feedbackList: PoseFeedback[] = [];
      let formScore = 100;

      // Analyze body line
      const { min: minAngle, max: maxAngle } = exerciseConfigs.plank.targetBodyLine;
      if (bodyLineAngle < minAngle - 10) {
        feedbackList.push({ type: "warning", message: "Lower your hips - straighten body", icon: "📐" });
        formScore -= 25;
      } else if (bodyLineAngle > maxAngle + 10) {
        feedbackList.push({ type: "warning", message: "Lift your hips - don't sag", icon: "⬆️" });
        formScore -= 25;
      } else if (bodyLineAngle >= minAngle && bodyLineAngle <= maxAngle) {
        feedbackList.push({ type: "success", message: "Perfect plank alignment!", icon: "✓" });
      }

      const isInPlankPosition = shoulderPoint.y > 0.3 && Math.abs(shoulderPoint.y - hipPoint.y) < 0.2;

      return {
        formQuality: Math.max(formScore, 0),
        reps: 0,
        feedback: feedbackList,
        isExercising: isInPlankPosition,
        currentAngles: {
          primaryAngle: bodyLineAngle,
          angleName: "Body Line"
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