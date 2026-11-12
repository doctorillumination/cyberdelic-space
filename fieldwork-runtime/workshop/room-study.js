const TAU = Math.PI * 2;

function ease(time, start, end) {
  const t = Math.min(1, Math.max(0, (time - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

function gesture(time, start, arrive, leave, end) {
  return ease(time, start, arrive) * (1 - ease(time, leave, end));
}

export function roomAt(seconds) {
  const leftFuller = gesture(seconds % 51, 7.7, 10.5, 10.5, 15.5);
  const rightFuller = gesture(seconds % 67, 27.2, 30.8, 30.8, 36.4);
  const left = .0028 * Math.sin(TAU * seconds / 6.7 + .13 * Math.sin(TAU * seconds / 23));
  const right = .0035 * Math.sin(TAU * seconds / 8.2 + 1.9 + .17 * Math.sin(TAU * seconds / 31));
  const leftPose = seconds % 61;
  const rightPose = seconds % 79;
  const lightTime = seconds % 94;

  return {
    breath: [
      left * (1 - .55 * leftFuller) + .0082 * leftFuller,
      right * (1 - .55 * rightFuller) + .0090 * rightFuller,
    ],
    headTurns: [
      .115 * gesture(leftPose, 13.3, 16.5, 17.8, 21.2),
      .142 * gesture(rightPose, 28.0, 31.5, 33.0, 36.9),
    ],
    shoulderRolls: [
      .054 * gesture(leftPose, 2.6, 3.7, 3.7, 5.1)
        - .038 * gesture(leftPose, 19.0, 20.7, 20.7, 23.1),
      -.064 * gesture(rightPose, 24.6, 26.5, 28.0, 32.0),
    ],
    weightShift: gesture(rightPose, 24.5, 27.5, 33.6, 38.7),
    fingerFlexes: [
      gesture(seconds % 47, 1.8, 3.5, 4.1, 5.8),
      gesture(seconds % 59, 7.1, 8.7, 9.3, 11.2),
      gesture(seconds % 67, 17.6, 18.8, 19.2, 21.3),
      gesture(seconds % 73, 26.1, 27.4, 27.9, 30.0),
    ],
    releaseFlex: gesture(seconds % 53, 12.5, 14.0, 14.5, 16.8),
    lightDips: [
      .52 * gesture(lightTime, 1.2, 9.5, 12.2, 24.3),
      .45 * gesture(lightTime, 3.5, 12.0, 14.6, 28.2),
    ],
  };
}

export const roomStudyShader = /* glsl */ `
  uniform vec2 breaths;
  uniform vec2 headTurns;
  uniform vec2 shoulderRolls;
  uniform float weightShift;
  uniform vec4 fingerFlexes;
  uniform float releaseFlex;

  float region(vec2 p, vec2 center, vec2 size, float full) {
    float radius = length((p - center) / size);
    return 1.0 - smoothstep(full, 1.0, radius);
  }

  vec2 yawOffset(vec2 point, float angle) {
    float s = sin(angle), c = cos(angle) - 1.0;
    return vec2(c * point.x - s * point.y, s * point.x + c * point.y);
  }

  vec3 figureMotion(vec3 p) {
    if (p.x < 0.0) {
      float torso = region(p.xz, vec2(-.68, 1.36), vec2(.34, .31), .33);
      float shoulder = region(p.xz, vec2(-.68, 1.42), vec2(.31, .17), .42);
      float head = region(p.xz, vec2(-.69, 1.62), vec2(.175, .185), .65);
      vec2 face = vec2(p.x + .69, -.038 - .064 * head);
      vec2 turn = yawOffset(face, headTurns.x) * head;
      float lift = breaths.x * torso + shoulderRolls.x * (p.x + .68) * shoulder;
      return vec3(turn, lift - .015 * headTurns.x * head);
    }
    float torso = region(p.xz, vec2(1.07, 1.43), vec2(.26, .34), .33);
    float shoulder = region(p.xz, vec2(1.08, 1.48), vec2(.30, .19), .42);
    float head = region(p.xz, vec2(1.075, 1.75), vec2(.183, .174), .65);
    vec2 face = vec2(p.x - 1.09, -.042 - .062 * head);
    vec2 turn = yawOffset(face, headTurns.y) * head;
    float lift = breaths.y * torso + shoulderRolls.y * (p.x - 1.01) * shoulder;
    float body = region(p.xz, vec2(1.09, 1.24), vec2(.32, .83), .65);
    // Feather the shift into the planted hand and the foreground counter.
    float shift = weightShift * body * smoothstep(.78, .98, p.x) * smoothstep(.54, .76, p.z);
    return vec3(turn, lift + .013 * headTurns.y * head) + vec3(-.016, -.009, .004) * shift;
  }

  float digit(vec2 p, vec2 root, vec2 tip, float radius) {
    vec2 span = tip - root;
    float along = clamp(dot(p - root, span) / dot(span, span), 0.0, 1.0);
    float distanceToDigit = distance(p, root + along * span);
    return smoothstep(.14, .92, along) * (1.0 - smoothstep(radius * .44, radius, distanceToDigit));
  }

  vec3 fingerMotion(vec3 p) {
    if (p.x < 0.0) {
      // The index and middle fingers lie across the other hand, above the two outer fingers.
      float indexFinger = fingerFlexes.x * digit(p.xz, vec2(-.672, .957), vec2(-.721, .955), .014);
      float middle = fingerFlexes.y * digit(p.xz, vec2(-.678, .935), vec2(-.725, .919), .014);
      float ring = fingerFlexes.z * digit(p.xz, vec2(-.672, .919), vec2(-.691, .885), .013);
      float pinky = fingerFlexes.w * digit(p.xz, vec2(-.649, .915), vec2(-.673, .875), .013);
      return indexFinger * vec3(.0050, -.001, .012) + middle * vec3(.0046, -.0011, .010)
        + ring * vec3(-.0020, .0, .005) + pinky * vec3(.0023, .0, .004);
    }
    float upper = digit(p.xz, vec2(.792, 1.171), vec2(.765, 1.167), .014);
    float lower = digit(p.xz, vec2(.808, 1.130), vec2(.771, 1.121), .016);
    float release = smoothstep(.014, .023, distance(p.xz, vec2(.754, 1.145)));
    return releaseFlex * release * (upper * vec3(.0032, .0, -.0081) + lower * vec3(-.0032, .0, .0084));
  }
`;
