import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

const appWidth = 1120;
const appHeight = 920;
const cardWidth = 1220;
const cardScale = cardWidth / appWidth;
const cardHeight = appHeight * cardScale;
const cardX = 610;
const cardY = 40;

const ink = "#ecfbf5";
const muted = "#a9bdb5";
const quiet = "#70837b";
const accent = "#78d8b2";
const warning = "#f3c969";
const panel = "#111b18";
const panelSoft = "#17231f";
const border = "rgba(198, 226, 216, 0.2)";

type WalkthroughShot = {
  src: string;
  start: number;
  end: number;
};

type CursorPoint = {
  frame: number;
  x: number;
  y: number;
};

type StepCopy = {
  start: number;
  end: number;
  eyebrow: string;
  title: string;
  body: string;
  metric: string;
};

const shots: WalkthroughShot[] = [
  { src: "screens/walkthrough/01-sessions.png", start: 54, end: 132 },
  { src: "screens/walkthrough/02-expanded-session.png", start: 122, end: 228 },
  { src: "screens/walkthrough/03-analytics.png", start: 218, end: 330 },
  { src: "screens/walkthrough/04-work-review.png", start: 320, end: 426 },
  { src: "screens/walkthrough/05-settings.png", start: 416, end: 518 },
];

const steps: StepCopy[] = [
  {
    start: 54,
    end: 132,
    eyebrow: "Step 1",
    title: "Watch live agent sessions",
    body: "Running, waiting, completed and restored sessions stay grouped by project in one floating panel.",
    metric: "6 sessions",
  },
  {
    start: 122,
    end: 228,
    eyebrow: "Step 2",
    title: "Open the session context",
    body: "Expand a row to inspect recent activity, tool calls, requests, context pressure and estimated cost.",
    metric: "Context 74%",
  },
  {
    start: 218,
    end: 330,
    eyebrow: "Step 3",
    title: "Check usage and cost",
    body: "Switch to Analytics for local token trends by project, model, agent and token type.",
    metric: "596K tokens",
  },
  {
    start: 320,
    end: 426,
    eyebrow: "Step 4",
    title: "Review the work day",
    body: "Daily Work Review turns observed sessions into a project-grouped operations memory.",
    metric: "6 items today",
  },
  {
    start: 416,
    end: 518,
    eyebrow: "Step 5",
    title: "Repair local integrations",
    body: "Settings keeps diagnostics, Provider Gateway status and agent repair actions explicit and local.",
    metric: "Local only",
  },
];

const cursorPath: CursorPoint[] = [
  { frame: 42, x: 130, y: 74 },
  { frame: 86, x: 438, y: 390 },
  { frame: 120, x: 438, y: 390 },
  { frame: 172, x: 515, y: 535 },
  { frame: 208, x: 151, y: 73 },
  { frame: 248, x: 598, y: 590 },
  { frame: 314, x: 245, y: 73 },
  { frame: 364, x: 688, y: 500 },
  { frame: 426, x: 1068, y: 30 },
  { frame: 470, x: 800, y: 256 },
];

const clickFrames = [96, 210, 316, 428];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function ease(frame: number, start: number, duration: number): number {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
}

function fadeOpacity(frame: number, start: number, end: number): number {
  const fadeIn = interpolate(frame, [start, start + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [end - 12, end], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return Math.min(fadeIn, fadeOut);
}

function mapX(x: number): number {
  return cardX + x * cardScale;
}

function mapY(y: number): number {
  return cardY + y * cardScale;
}

function cursorPosition(frame: number): { x: number; y: number } {
  let previous = cursorPath[0];
  for (let index = 1; index < cursorPath.length; index += 1) {
    const next = cursorPath[index];
    if (frame <= next.frame) {
      const progress = interpolate(frame, [previous.frame, next.frame], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      });
      return {
        x: mapX(interpolate(progress, [0, 1], [previous.x, next.x])),
        y: mapY(interpolate(progress, [0, 1], [previous.y, next.y])),
      };
    }
    previous = next;
  }
  return { x: mapX(previous.x), y: mapY(previous.y) };
}

function activeStep(frame: number): StepCopy {
  return steps.find((step) => frame >= step.start && frame < step.end) ?? steps[steps.length - 1];
}

function clickPulse(frame: number): { opacity: number; scale: number } {
  const nearest = clickFrames
    .map((clickFrame) => Math.abs(frame - clickFrame))
    .reduce((min, distance) => Math.min(min, distance), Number.POSITIVE_INFINITY);
  const progress = clamp01(1 - nearest / 16);
  return {
    opacity: progress,
    scale: interpolate(progress, [0, 1], [1.85, 0.45]),
  };
}

function AppWalkthrough() {
  const frame = useCurrentFrame();
  const introLift = ease(frame, 34, 30);

  return (
    <AbsoluteFill>
      <div
        style={{
          background: panel,
          border: `1px solid ${border}`,
          borderRadius: 18,
          boxShadow: "0 36px 90px rgba(0, 0, 0, 0.48)",
          height: cardHeight + 20,
          left: cardX - 10,
          overflow: "hidden",
          padding: 10,
          position: "absolute",
          top: cardY - 10,
          transform: `translateY(${interpolate(introLift, [0, 1], [34, 0])}px)`,
          width: cardWidth + 20,
        }}
      >
        {shots.map((shot) => (
          <Img
            key={shot.src}
            src={staticFile(shot.src)}
            style={{
              borderRadius: 10,
              height: cardHeight,
              left: 10,
              objectFit: "cover",
              opacity: fadeOpacity(frame, shot.start, shot.end),
              position: "absolute",
              top: 10,
              width: cardWidth,
            }}
          />
        ))}
      </div>
      <Cursor />
    </AbsoluteFill>
  );
}

function Cursor() {
  const frame = useCurrentFrame();
  const { x, y } = cursorPosition(frame);
  const pulse = clickPulse(frame);
  const visible = ease(frame, 48, 18);

  return (
    <>
      <div
        style={{
          border: `3px solid ${accent}`,
          borderRadius: 999,
          height: 46,
          left: x - 17,
          opacity: pulse.opacity,
          position: "absolute",
          top: y - 15,
          transform: `scale(${pulse.scale})`,
          width: 46,
        }}
      />
      <div
        style={{
          background: ink,
          clipPath: "polygon(0 0, 0 34px, 10px 25px, 18px 43px, 27px 39px, 19px 22px, 34px 22px)",
          filter: "drop-shadow(0 8px 12px rgba(0, 0, 0, 0.5))",
          height: 43,
          left: x,
          opacity: visible,
          position: "absolute",
          top: y,
          width: 34,
        }}
      />
    </>
  );
}

function Sidebar() {
  const frame = useCurrentFrame();
  const step = activeStep(frame);
  const stepIndex = steps.indexOf(step);
  const progress = ease(frame, step.start, 18);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        left: 88,
        position: "absolute",
        top: 112,
        width: 430,
      }}
    >
      <div>
        <div
          style={{
            border: `1px solid ${accent}66`,
            borderRadius: 999,
            color: accent,
            display: "inline-flex",
            fontSize: 24,
            fontWeight: 820,
            letterSpacing: 0,
            padding: "10px 16px",
            textTransform: "uppercase",
          }}
        >
          {step.eyebrow}
        </div>
        <h1
          style={{
            color: ink,
            fontSize: 62,
            fontWeight: 860,
            letterSpacing: 0,
            lineHeight: 0.98,
            margin: "28px 0 22px",
            opacity: progress,
            transform: `translateY(${interpolate(progress, [0, 1], [18, 0])}px)`,
          }}
        >
          {step.title}
        </h1>
        <p
          style={{
            color: muted,
            fontSize: 27,
            lineHeight: 1.34,
            margin: 0,
            opacity: progress,
          }}
        >
          {step.body}
        </p>
      </div>
      <div
        style={{
          alignItems: "center",
          background: panelSoft,
          border: `1px solid ${border}`,
          borderRadius: 14,
          display: "flex",
          justifyContent: "space-between",
          padding: "20px 22px",
          width: 390,
        }}
      >
        <span style={{ color: quiet, fontSize: 19, fontWeight: 780, textTransform: "uppercase" }}>
          Current signal
        </span>
        <strong style={{ color: stepIndex === 2 ? warning : accent, fontSize: 28 }}>
          {step.metric}
        </strong>
      </div>
      <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
        {steps.map((item, index) => (
          <div
            key={item.eyebrow}
            style={{
              background: index <= stepIndex ? accent : "rgba(255, 255, 255, 0.12)",
              borderRadius: 999,
              height: 8,
              opacity: index === stepIndex ? 1 : 0.55,
              width: index === stepIndex ? 64 : 28,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Intro() {
  const frame = useCurrentFrame();
  const intro = ease(frame, 0, 28);
  const fade = interpolate(frame, [38, 52], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        opacity: Math.min(intro, fade),
        padding: 120,
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 1180 }}>
        <div
          style={{
            border: `1px solid ${accent}66`,
            borderRadius: 999,
            color: accent,
            display: "inline-flex",
            fontSize: 24,
            fontWeight: 840,
            padding: "10px 18px",
            textTransform: "uppercase",
          }}
        >
          CodePal walkthrough
        </div>
        <h1
          style={{
            color: ink,
            fontSize: 88,
            fontWeight: 880,
            letterSpacing: 0,
            lineHeight: 0.98,
            margin: "34px 0 22px",
          }}
        >
          A real local flow, using synthetic data.
        </h1>
        <p style={{ color: muted, fontSize: 32, lineHeight: 1.35, margin: 0 }}>
          The app is launched in an isolated profile, then clicked through like a normal CodePal session.
        </p>
      </div>
    </AbsoluteFill>
  );
}

function Outro() {
  const frame = useCurrentFrame();
  const progress = ease(frame, 510, 24);

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        opacity: progress,
        padding: 120,
        textAlign: "center",
      }}
    >
      <div
        style={{
          background: panelSoft,
          border: `1px solid ${border}`,
          borderRadius: 24,
          boxShadow: "0 36px 90px rgba(0, 0, 0, 0.42)",
          padding: "64px 76px",
          width: 1120,
        }}
      >
        <h2
          style={{
            color: ink,
            fontSize: 70,
            fontWeight: 860,
            letterSpacing: 0,
            lineHeight: 1.02,
            margin: "0 0 22px",
          }}
        >
          Observe the work. Keep control local.
        </h2>
        <p style={{ color: muted, fontSize: 30, lineHeight: 1.36, margin: 0 }}>
          CodePal watches, remembers and helps you jump back in without becoming an approval middleman or cloud analytics backend.
        </p>
      </div>
    </AbsoluteFill>
  );
}

export function CodePalPromo() {
  return (
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(135deg, #08110f 0%, #0d1715 46%, #13201d 100%)",
        backgroundSize: "48px 48px, 48px 48px, auto",
        fontFamily:
          '"Avenir Next", "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <Intro />
      <Sidebar />
      <AppWalkthrough />
      <Outro />
      <div
        style={{
          bottom: 36,
          color: quiet,
          fontSize: 20,
          fontWeight: 700,
          left: 88,
          position: "absolute",
        }}
      >
        Captured from CodePal with an isolated HOME and synthetic demo events.
      </div>
    </AbsoluteFill>
  );
}
