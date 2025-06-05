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
  const SQUAT_HEIGHT_THRESHOLD = 0.15; // Minimum hip height change for squat
  const PUSHUP_ANGLE_THRESHOLD = 30; // Minimum angle change for push-up
  const POSITION_STABILITY_FRAMES = 5; // Frames to confirm position

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

  // Smooth angle values to reduce jitter
  const smoothAngle = useCallback((currentAngle: number, history: number[]) => {
    history.push(currentAngle);
    if (history.length > 5) history.shift(); // Keep last 5 readings
    return history.reduce((sum, val) => sum + val, 0) / history.length;
  }, []);



  // Exercise Ready State Detection
  const isInExerciseReadyPosition = useCallback(
    (landmarks: any[], exercise: Exercise) => {
      if (!landmarks || landmarks.length < 33) return false;

      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];
      const leftHip = landmarks[23];
      const rightHip = landmarks[24];
      const leftKnee = landmarks[25];
      const rightKnee = landmarks[26];
      const leftAnkle = landmarks[27];
      const rightAnkle = landmarks[28];

      switch (exercise) {
        case "squat":
          // Must be standing upright and ready
          const avgKneeAngle =
            (calculateAngle(leftHip, leftKnee, leftAnkle) +
              calculateAngle(rightHip, rightKnee, rightAnkle)) /
            2;
          const hipHeight = (leftHip.y + rightHip.y) / 2;
          const shoulderHeight = (leftShoulder.y + rightShoulder.y) / 2;

          return (
            avgKneeAngle > 150 && // Legs mostly straight
            hipHeight < 0.55 && // Standing height
            shoulderHeight < 0.45 && // Upright posture
            Math.abs(leftHip.y - rightHip.y) < 0.1
          ); // Level hips

        case "pushup":
          // Support multiple push-up positions: floor, inclined, wall
          const leftElbow = landmarks[13];
          const rightElbow = landmarks[14];
          const leftWrist = landmarks[15];
          const rightWrist = landmarks[16];

          const shoulder = {
            x: (leftShoulder.x + rightShoulder.x) / 2,
            y: (leftShoulder.y + rightShoulder.y) / 2,
          };
          const hip = {
            x: (leftHip.x + rightHip.x) / 2,
            y: (leftHip.y + rightHip.y) / 2,
          };
          const wrist = {
            x: (leftWrist.x + rightWrist.x) / 2,
            y: (leftWrist.y + rightWrist.y) / 2,
          };

          // Check if hands are in supporting position (below shoulders)
          const handsSupporting = wrist.y > shoulder.y + 0.1;

          // Check body alignment (can be angled for inclined push-ups)
          const bodyAlignment = Math.abs(shoulder.y - hip.y);

          // Allow range of angles: horizontal (floor) to 45-degree incline (table/wall)
          const validAngle = bodyAlignment < 0.4; // More lenient for different positions

          return (
            handsSupporting &&
            validAngle &&
            shoulder.y > 0.2 && // Not standing upright
            wrist.x > 0.1 &&
            wrist.x < 0.9
          ); // Hands in frame

        case "plank":
          // Must be actively supporting body weight
          const leftElbowPlank = landmarks[13];
          const rightElbowPlank = landmarks[14];

          const shoulderPlank = {
            x: (leftShoulder.x + rightShoulder.x) / 2,
            y: (leftShoulder.y + rightShoulder.y) / 2,
          };
          const hipPlank = {
            x: (leftHip.x + rightHip.x) / 2,
            y: (leftHip.y + rightHip.y) / 2,
          };
          const elbowPlank = {
            x: (leftElbowPlank.x + rightElbowPlank.x) / 2,
            y: (leftElbowPlank.y + rightElbowPlank.y) / 2,
          };

          // Check if person is supporting themselves (elbows/hands down)
          const isSupported = elbowPlank.y > shoulderPlank.y + 0.05;

          // Check body is roughly aligned and not standing
          const bodyAlign = Math.abs(shoulderPlank.y - hipPlank.y);
          const notStanding = shoulderPlank.y > 0.3;

          return (
            isSupported &&
            bodyAlign < 0.2 &&
            notStanding &&
            elbowPlank.x > 0.1 &&
            elbowPlank.x < 0.9
          ); // Support points in frame

        default:
          return false;
      }
    },
    [calculateAngle],
  );

  // Analyze squat form (unified analysis with rep counting)
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

      // Calculate knee angles
      const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
      const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
      const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

      // Form analysis calculations
      const hipHeight = (leftHip.y + rightHip.y) / 2;
      const shoulderHeight = (leftShoulder.y + rightShoulder.y) / 2;
      const hipDepth = shoulderHeight - hipHeight;

      // Torso lean calculation
      const torsoAngle = calculateAngle(
        { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 },
        { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 },
        { x: (leftShoulder.x + rightShoulder.x) / 2, y: 0 }
      );

      // Enhanced form scoring
      const feedback: PoseFeedback[] = [];
      let formScore = 100;

      // Analyze knee angle using config
      const { min: minKnee, max: maxKnee } = exerciseConfigs.squat.targetKneeAngle;
      if (avgKneeAngle > maxKnee + 20) {
        feedback.push({ type: "warning", message: "Go deeper - bend your knees more", icon: "⬇️" });
        formScore -= 25;
      } else if (avgKneeAngle < minKnee - 10) {
        feedback.push({ type: "warning", message: "Don't go too deep - protect your knees", icon: "⚠️" });
        formScore -= 15;
      } else if (avgKneeAngle >= minKnee && avgKneeAngle <= maxKnee) {
        feedback.push({ type: "success", message: "Perfect squat depth!", icon: "✓" });
      }

      // Analyze hip depth
      if (hipDepth < exerciseConfigs.squat.targetHipDepth - 0.05) {
        feedback.push({ type: "warning", message: "Lower your hips below knee level", icon: "📐" });
        formScore -= 20;
      }

      // Analyze torso lean
      if (torsoAngle < 90 - exerciseConfigs.squat.maxTorsoLean) {
        feedback.push({ type: "warning", message: "Keep chest up - less forward lean", icon: "⬆️" });
        formScore -= 15;
      } else if (torsoAngle >= 70 && torsoAngle <= 90) {
        feedback.push({ type: "success", message: "Good chest position", icon: "💪" });
      }

      // Check knee alignment
      const kneeAlignment = Math.abs(leftKneeAngle - rightKneeAngle);
      if (kneeAlignment > 15) {
        feedback.push({ type: "warning", message: "Keep knees even and aligned", icon: "⚖️" });
        formScore -= 10;
      }

      // Store position history for stability check
      previousPositionsRef.current.push({
        hipHeight,
        kneeAngle: avgKneeAngle,
        timestamp: Date.now(),
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
        const recentPositions = previousPositionsRef.current.slice(
          -POSITION_STABILITY_FRAMES,
        );
        const avgRecentHipHeight =
          recentPositions.reduce((sum, pos) => sum + pos.hipHeight, 0) /
          recentPositions.length;
        const avgRecentKneeAngle =
          recentPositions.reduce((sum, pos) => sum + pos.kneeAngle, 0) /
          recentPositions.length;

        // Check for significant hip height change (squat depth)
        if (currentState === "neutral" || currentState === "up") {
          // Check if person is going down (hip getting lower = higher Y value)
          if (avgRecentKneeAngle < 110 && avgRecentHipHeight > 0.6) {
            // Verify this is a stable squat position
            const validDownFrames = recentPositions.filter(
              (pos) => pos.kneeAngle < 120 && pos.hipHeight > 0.55,
            ).length;
            const isStableDown = validDownFrames >= 3;

            if (isStableDown) {
              currentState = "down";
              exerciseStateRef.current = "down";
            }
          }
        } else if (currentState === "down") {
          // Check if person is coming back up
          if (avgRecentKneeAngle > 140 && avgRecentHipHeight < 0.5) {
            // Verify this is a stable up position
            const validUpFrames = recentPositions.filter(
              (pos) => pos.kneeAngle > 135 && pos.hipHeight < 0.55,
            ).length;
            const isStableUp = validUpFrames >= 3;

            if (isStableUp && now - lastRepTimeRef.current > REP_COOLDOWN_MS) {
              currentState = "up";
              exerciseStateRef.current = "up";
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
          type: "success",
          message: "Rep Detected! Great form!",
          icon: "🎯",
        });
      }

      // Check depth only when in down position
      if (currentState === "down") {
        if (avgKneeAngle > 110) {
          formScore -= 20;
          feedbackMessages.push({
            type: "warning",
            message: "Squat deeper - knees should reach 90 degrees",
            icon: "⚠️",
          });
        } else if (avgKneeAngle <= 90) {
          feedbackMessages.push({
            type: "success",
            message: "Perfect squat depth!",
            icon: "✅",
          });
        }
      }

      // Calculate torso angle (torso lean)
      const leftShoulder = landmarks[11];
      const hipMidpoint = {
        x: (leftHip.x + rightHip.x) / 2,
        y: (leftHip.y + rightHip.y) / 2,
      };
      const kneeMidpoint = {
        x: (leftKnee.x + rightKnee.x) / 2,
        y: (leftKnee.y + rightKnee.y) / 2,
      };

      const torsoAngle = calculateAngle(
        leftShoulder,
        hipMidpoint,
        kneeMidpoint,
      );

      // Check torso position
      if (torsoAngle < 70) {
        formScore -= 15;
        feedbackMessages.push({
          type: "warning",
          message: "Keep your torso more upright",
          icon: "⚠️",
        });
      } else if (torsoAngle > 85 && currentState === "down") {
        feedbackMessages.push({
          type: "success",
          message: "Excellent torso position",
          icon: "✅",
        });
      }

      // Check knee tracking
      const kneeAlignment = Math.abs(leftKnee.x - rightKnee.x);
      if (kneeAlignment > 0.1) {
        formScore -= 10;
        feedbackMessages.push({
          type: "warning",
          message: "Keep knees aligned",
          icon: "⚠️",
        });
      }

      // Check if person is in exercise ready position first
      const isInReadyPosition = isInExerciseReadyPosition(landmarks, exercise);

      // Consider exercising if in ready position AND in squat movement
      const isExercising =
        isInReadyPosition &&
        (currentState !== "neutral" || (avgKneeAngle < 150 && hipHeight > 0.4));

      return {
        formQuality: Math.max(formScore, 0),
        reps: repCounterRef.current,
        feedback: feedbackMessages,
        isExercising,
      };
    },
    [calculateAngle],
  );

  // Analyze push-up form
  const analyzePushUp = useCallback(
    (landmarks: any[]) => {
      if (!landmarks || landmarks.length < 33) return null;

      const leftShoulder = landmarks[11];
      const leftElbow = landmarks[13];
      const leftWrist = landmarks[15];
      const rightShoulder = landmarks[12];
      const rightElbow = landmarks[14];
      const rightWrist = landmarks[16];

      // Calculate elbow angles
      const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
      const rightElbowAngle = calculateAngle(
        rightShoulder,
        rightElbow,
        rightWrist,
      );
      const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

      // Calculate torso height (shoulder Y position - lower Y means higher/up position)
      const shoulderHeight = (leftShoulder.y + rightShoulder.y) / 2;

      // Store position history for stability check
      previousPositionsRef.current.push({
        shoulderHeight,
        elbowAngle: avgElbowAngle,
        timestamp: Date.now(),
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
      const shoulder = {
        x: (leftShoulder.x + rightShoulder.x) / 2,
        y: (leftShoulder.y + rightShoulder.y) / 2,
      };
      const hip = {
        x: (leftHip.x + rightHip.x) / 2,
        y: (leftHip.y + rightHip.y) / 2,
      };

      // Check if body is roughly horizontal (push-up position)
      const bodyTilt = Math.abs(shoulder.y - hip.y);
      const isInPushUpPosition = bodyTilt < 0.3 && shoulder.y > 0.3; // Body horizontal and not standing

      // Only process if we have enough position history and in push-up position
      if (
        previousPositionsRef.current.length >= POSITION_STABILITY_FRAMES &&
        isInPushUpPosition
      ) {
        const recentPositions = previousPositionsRef.current.slice(
          -POSITION_STABILITY_FRAMES,
        );
        const avgRecentShoulderHeight =
          recentPositions.reduce((sum, pos) => sum + pos.shoulderHeight, 0) /
          recentPositions.length;
        const avgRecentElbowAngle =
          recentPositions.reduce((sum, pos) => sum + pos.elbowAngle, 0) /
          recentPositions.length;

        // Check for significant elbow angle change (push-up depth)
        if (currentState === "neutral" || currentState === "up") {
          // Check if person is going down (elbows bending, shoulder getting lower)
          if (avgRecentElbowAngle < 110 && avgRecentShoulderHeight > 0.4) {
            // Verify this is a stable down position
            const validDownFrames = recentPositions.filter(
              (pos) => pos.elbowAngle < 120 && pos.shoulderHeight > 0.35,
            ).length;
            const isStableDown = validDownFrames >= 3;

            if (isStableDown) {
              currentState = "down";
              exerciseStateRef.current = "down";
            }
          }
        } else if (currentState === "down") {
          // Check if person is pushing back up
          if (avgRecentElbowAngle > 150 && avgRecentShoulderHeight < 0.4) {
            // Verify this is a stable up position
            const validUpFrames = recentPositions.filter(
              (pos) => pos.elbowAngle > 145 && pos.shoulderHeight < 0.45,
            ).length;
            const isStableUp = validUpFrames >= 3;

            if (isStableUp && now - lastRepTimeRef.current > REP_COOLDOWN_MS) {
              currentState = "up";
              exerciseStateRef.current = "up";
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
          type: "success",
          message: "Rep Detected! Excellent push-up!",
          icon: "🎯",
        });
      }

      // Only give feedback if in push-up position
      if (!isInPushUpPosition) {
        feedbackMessages.push({
          type: "warning",
          message: "Get into push-up position to start analysis",
          icon: "💪",
        });
        formScore = 0;
      } else {
        // Check depth only when in down position
        if (currentState === "down") {
          if (avgElbowAngle > 110) {
            formScore -= 20;
            feedbackMessages.push({
              type: "warning",
              message: "Lower yourself more - elbows should reach 90 degrees",
              icon: "⚠️",
            });
          } else if (avgElbowAngle <= 100) {
            feedbackMessages.push({
              type: "success",
              message: "Perfect push-up depth!",
              icon: "✅",
            });
          }
        }

        // Check body alignment
        const ankle = {
          x: (landmarks[27].x + landmarks[28].x) / 2,
          y: (landmarks[27].y + landmarks[28].y) / 2,
        };
        const bodyAlignment =
          Math.abs(shoulder.y - hip.y) + Math.abs(hip.y - ankle.y);

        if (bodyAlignment > 0.2) {
          formScore -= 15;
          feedbackMessages.push({
            type: "warning",
            message: "Keep your body in a straight line",
            icon: "⚠️",
          });
        } else if (currentState !== "neutral") {
          feedbackMessages.push({
            type: "success",
            message: "Great body alignment",
            icon: "✅",
          });
        }
      }

      // Check if person is in exercise ready position first
      const isInReadyPosition = isInExerciseReadyPosition(landmarks, exercise);

      // Consider exercising if in ready position AND in push-up position
      const isExercising = isInReadyPosition && isInPushUpPosition;

      return {
        formQuality: Math.max(formScore, 0),
        reps: repCounterRef.current,
        feedback: feedbackMessages,
        isExercising,
      };
    },
    [calculateAngle],
  );

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
    const shoulder = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
    };
    const hip = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
    };
    const ankle = {
      x: (leftAnkle.x + rightAnkle.x) / 2,
      y: (leftAnkle.y + rightAnkle.y) / 2,
    };
    const elbow = {
      x: (leftElbow.x + rightElbow.x) / 2,
      y: (leftElbow.y + rightElbow.y) / 2,
    };

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
        type: "warning",
        message: "Get into plank position to start analysis",
        icon: "🧘",
      });
      formScore = 0;
    } else {
      // Check body alignment
      if (totalAlignment > 0.15) {
        formScore -= 30;
        if (hip.y < shoulder.y - 0.05) {
          feedbackMessages.push({
            type: "warning",
            message: "Lower your hips - avoid pike position",
            icon: "⚠️",
          });
        } else if (hip.y > shoulder.y + 0.05) {
          feedbackMessages.push({
            type: "warning",
            message: "Raise your hips - avoid sagging",
            icon: "⚠️",
          });
        }
      } else {
        feedbackMessages.push({
          type: "success",
          message: "Perfect plank alignment!",
          icon: "✅",
        });
      }

      // Check elbow position for forearm plank
      if (Math.abs(elbow.x - shoulder.x) > 0.1) {
        formScore -= 15;
        feedbackMessages.push({
          type: "warning",
          message: "Keep elbows under shoulders",
          icon: "⚠️",
        });
      } else {
        feedbackMessages.push({
          type: "success",
          message: "Great elbow placement",
          icon: "✅",
        });
      }

      // Check for core engagement (stable position)
      if (totalAlignment < 0.1) {
        feedbackMessages.push({
          type: "success",
          message: "Excellent core engagement!",
          icon: "💪",
        });
      }
    }

    // Check if person is in exercise ready position first
    const isInReadyPosition = isInExerciseReadyPosition(landmarks, exercise);

    return {
      formQuality: Math.max(formScore, 0),
      reps: 0, // Plank is time-based, not rep-based
      feedback: feedbackMessages,
      isExercising: isInReadyPosition && isInPlankPosition, // Person is in ready position AND plank position
    };
  }, []);

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

    // Calculate average visibility
    const visibleLandmarks = landmarks.filter(
      (landmark) => (landmark.visibility || 0) > 0.5,
    );
    const avgVisibility =
      visibleLandmarks.length > 0
        ? visibleLandmarks.reduce(
            (sum, landmark) => sum + (landmark.visibility || 0),
            0,
          ) / visibleLandmarks.length
        : 0;

    // Check completeness - key body parts should be visible
    const keyLandmarks = [11, 12, 23, 24, 25, 26, 13, 14]; // shoulders, hips, knees, elbows
    const visibleKeyLandmarks = keyLandmarks.filter(
      (index) => landmarks[index] && (landmarks[index].visibility || 0) > 0.5,
    );
    const completeness = visibleKeyLandmarks.length / keyLandmarks.length;

    // Check if person is too close (landmarks spread too wide)
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const shoulderWidth =
      leftShoulder && rightShoulder
        ? Math.abs(leftShoulder.x - rightShoulder.x)
        : 0;

    // Check if person is partially in frame
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];
    const isPartiallyVisible =
      !leftAnkle ||
      !rightAnkle ||
      leftAnkle.x < 0.05 ||
      rightAnkle.x > 0.95 ||
      leftAnkle.y > 0.95 ||
      rightAnkle.y > 0.95;

    // Determine tracking status
    let trackingStatus:
      | "optimal"
      | "too_close"
      | "partial"
      | "lost"
      | "repositioning";

    if (completeness < 0.5) {
      trackingStatus = "lost";
    } else if (shoulderWidth > 0.6) {
      trackingStatus = "too_close";
    } else if (isPartiallyVisible || completeness < 0.75) {
      trackingStatus = "partial";
    } else if (avgVisibility < 0.7) {
      trackingStatus = "repositioning";
    } else {
      trackingStatus = "optimal";
    }

    // Determine detection quality
    let detectionQuality: "poor" | "good" | "excellent";

    if (
      avgVisibility >= 0.8 &&
      completeness >= 0.9 &&
      trackingStatus === "optimal"
    ) {
      detectionQuality = "excellent";
    } else if (avgVisibility >= 0.6 && completeness >= 0.75) {
      detectionQuality = "good";
    } else {
      detectionQuality = "poor";
    }

    return {
      detectionQuality,
      trackingStatus,
      confidence: avgVisibility,
      completeness,
    };
  }, []);

  // Get tracking feedback message
  const getTrackingMessage = useCallback((status: string) => {
    switch (status) {
      case "optimal":
        return "Perfect tracking - continue exercise";
      case "too_close":
        return "Move back for better tracking";
      case "partial":
        return "Stand fully in frame";
      case "lost":
        return "No person detected";
      case "repositioning":
        return "Tracking lost - repositioning...";
      default:
        return "Adjusting tracking...";
    }
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
        setFeedback([
          {
            type: "warning",
            message: getTrackingMessage(quality.trackingStatus),
            icon: "👤",
          },
        ]);
        return;
      }

      // Only perform exercise analysis if detection quality is good or better
      let analysis = null;
      if (
        quality.detectionQuality === "good" ||
        quality.detectionQuality === "excellent"
      ) {
        switch (exercise) {
          case "squat":
            const squatForm = analyzeSquatForm(results.poseLandmarks);
            const squatReps = analyzeSquat(results.poseLandmarks);
            analysis = {
              formQuality: squatForm.score,
              feedback: squatForm.feedback,
              reps: squatReps?.reps || repCounterRef.current,
              isExercising: squatReps?.isExercising || false
            };
            break;
          case "pushup":
            const pushupForm = analyzePushupForm(results.poseLandmarks);
            const pushupReps = analyzePushUp(results.poseLandmarks);
            analysis = {
              formQuality: pushupForm.score,
              feedback: pushupForm.feedback,
              reps: pushupReps?.reps || repCounterRef.current,
              isExercising: pushupReps?.isExercising || false
            };
            break;
          case "plank":
            const plankForm = analyzePlankForm(results.poseLandmarks);
            const plankPosition = analyzePlank(results.poseLandmarks);
            analysis = {
              formQuality: plankForm.score,
              feedback: plankForm.feedback,
              reps: 0, // Plank is time-based
              isExercising: plankPosition?.isExercising || false
            };
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
        }));

        // Prioritize tracking feedback if poor quality
        if (
          quality.detectionQuality === "poor" ||
          quality.trackingStatus !== "optimal"
        ) {
          setFeedback([
            {
              type: "warning",
              message: getTrackingMessage(quality.trackingStatus),
              icon: "⚠️",
            },
          ]);
        } else if (analysis.feedback.length > 0) {
          setFeedback(analysis.feedback);
        } else if (!analysis.isExercising) {
          setFeedback([
            {
              type: "warning",
              message: `Get into ${exercise} position to start analysis`,
              icon: "💪",
            },
          ]);
        }
      } else {
        // Poor detection quality - pause analysis
        setMetrics((prev) => ({
          ...prev,
          isPersonDetected: true,
          isExercising: false,
          formQuality: 0,
          detectionQuality: quality.detectionQuality,
          trackingStatus: quality.trackingStatus,
        }));

        setFeedback([
          {
            type: "warning",
            message: getTrackingMessage(quality.trackingStatus),
            icon: "⚠️",
          },
        ]);
      }
    },
    [
      exercise,
      analyzeSquat,
      analyzePushUp,
      analyzePlank,
      assessPoseQuality,
      getTrackingMessage,
    ],
  );

  // Create a callback function to process pose results
  const processPoseResultsCallback = useCallback(
    (results: Results) => {
      processPoseResults(results);
    },
    [processPoseResults],
  );

  // Reset when exercise changes or analysis stops
  useEffect(() => {
    if (!isActive) {
      repCounterRef.current = 0;
      exerciseStateRef.current = "neutral";
      lastRepTimeRef.current = 0;
      previousPositionsRef.current = []; // Clear position history
      repFlashRef.current = false;
      setSessionSeconds(0);
      setMetrics({
        formQuality: 0,
        reps: 0,
        sessionTime: "00:00",
        isPersonDetected: false,
        isExercising: false,
        detectionQuality: "poor",
        trackingStatus: "lost",
      });
      setFeedback([]);
    }
  }, [isActive, exercise]);

  // Clear position history when exercise type changes
  useEffect(() => {
    previousPositionsRef.current = [];
    repCounterRef.current = 0;
    exerciseStateRef.current = "neutral";
    lastRepTimeRef.current = 0;
    repFlashRef.current = false;
  }, [exercise]);

  return {
    metrics,
    feedback,
    processPoseResultsCallback,
    repFlash: repFlashRef.current,
  };
}
