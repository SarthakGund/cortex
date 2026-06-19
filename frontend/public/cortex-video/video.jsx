// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// animations.jsx
// Reusable animation starter: Stage, Timeline, Sprite, easing helpers.
// Exports (to window): Stage, Sprite, PlaybackBar, TextSprite, ImageSprite, RectSprite,
//   useTime, useTimeline, useSprite, Easing, interpolate, animate, clamp.
//
// Usage (in an HTML file that loads React + Babel):
//
//   <Stage width={1280} height={720} duration={10} background="#f6f4ef">
//     <MyScene />
//   </Stage>
//
// <Stage> auto-scales to the viewport and provides the scrubber, play/pause,
// ←/→ seek, space, and 0-to-reset controls, and persists the playhead.
// Inside <Stage>, any child can call useTime() to read the current
// playhead (seconds). Or wrap content in <Sprite start={1} end={4}>...</Sprite>
// to only render during that window -- children receive a `localTime` and
// `progress` via the useSprite() hook. Use Easing + interpolate()/animate()
// for tweens; TextSprite / ImageSprite / RectSprite have built-in entry/exit.
// Build YOUR scenes by composing Sprites inside a Stage.
/* END USAGE */
// ─────────────────────────────────────────────────────────────────────────────

// ── Easing functions (hand-rolled, Popmotion-style) ─────────────────────────
// All easings take t ∈ [0,1] and return eased t ∈ [0,1] (may overshoot for back/elastic).
const Easing = {
  linear: (t) => t,

  // Quad
  easeInQuad:    (t) => t * t,
  easeOutQuad:   (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),

  // Cubic
  easeInCubic:    (t) => t * t * t,
  easeOutCubic:   (t) => (--t) * t * t + 1,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),

  // Quart
  easeInQuart:    (t) => t * t * t * t,
  easeOutQuart:   (t) => 1 - (--t) * t * t * t,
  easeInOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t),

  // Expo
  easeInExpo:  (t) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  easeOutExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  easeInOutExpo: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    if (t < 0.5) return 0.5 * Math.pow(2, 20 * t - 10);
    return 1 - 0.5 * Math.pow(2, -20 * t + 10);
  },

  // Sine
  easeInSine:    (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine:   (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,

  // Back (overshoot)
  easeOutBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeInBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  easeInOutBack: (t) => {
    const c1 = 1.70158, c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },

  // Elastic
  easeOutElastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
};

// ── Core interpolation helpers ──────────────────────────────────────────────

// Clamp a value to [min, max]
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// interpolate([0, 0.5, 1], [0, 100, 50], ease?) -> fn(t)
// Popmotion-style: linearly maps t across input keyframes to output values,
// with optional easing per segment (single fn or array of fns).
function interpolate(input, output, ease = Easing.linear) {
  return (t) => {
    if (t <= input[0]) return output[0];
    if (t >= input[input.length - 1]) return output[output.length - 1];
    for (let i = 0; i < input.length - 1; i++) {
      if (t >= input[i] && t <= input[i + 1]) {
        const span = input[i + 1] - input[i];
        const local = span === 0 ? 0 : (t - input[i]) / span;
        const easeFn = Array.isArray(ease) ? (ease[i] || Easing.linear) : ease;
        const eased = easeFn(local);
        return output[i] + (output[i + 1] - output[i]) * eased;
      }
    }
    return output[output.length - 1];
  };
}

// animate({from, to, start, end, ease})(t) — simpler single-segment tween.
// Returns `from` before `start`, `to` after `end`.
function animate({ from = 0, to = 1, start = 0, end = 1, ease = Easing.easeInOutCubic }) {
  return (t) => {
    if (t <= start) return from;
    if (t >= end) return to;
    const local = (t - start) / (end - start);
    return from + (to - from) * ease(local);
  };
}

// ── Timeline context ────────────────────────────────────────────────────────

const TimelineContext = React.createContext({ time: 0, duration: 10, playing: false });

const useTime = () => React.useContext(TimelineContext).time;
const useTimeline = () => React.useContext(TimelineContext);

// ── Sprite ──────────────────────────────────────────────────────────────────
// Renders children only when the playhead is inside [start, end]. Provides
// a sub-context with `localTime` (seconds since start) and `progress` (0..1).
//
//   <Sprite start={2} end={5}>
//     {({ localTime, progress }) => <Thing x={progress * 100} />}
//   </Sprite>
//
// Or as a plain wrapper — children can call useSprite() themselves.

const SpriteContext = React.createContext({ localTime: 0, progress: 0, duration: 0 });
const useSprite = () => React.useContext(SpriteContext);

function Sprite({ start = 0, end = Infinity, children, keepMounted = false }) {
  const { time } = useTimeline();
  const visible = time >= start && time <= end;
  if (!visible && !keepMounted) return null;

  const duration = end - start;
  const localTime = Math.max(0, time - start);
  const progress = duration > 0 && isFinite(duration)
    ? clamp(localTime / duration, 0, 1)
    : 0;

  const value = { localTime, progress, duration, visible };

  return (
    <SpriteContext.Provider value={value}>
      {typeof children === 'function' ? children(value) : children}
    </SpriteContext.Provider>
  );
}

// ── Sample sprite components ────────────────────────────────────────────────

// TextSprite: fades/slides text in on entry, holds, then fades out on exit.
// Props: text, x, y, size, color, font, entryDur, exitDur, align
function TextSprite({
  text,
  x = 0, y = 0,
  size = 48,
  color = '#111',
  font = 'Inter, system-ui, sans-serif',
  weight = 600,
  entryDur = 0.45,
  exitDur = 0.35,
  entryEase = Easing.easeOutBack,
  exitEase = Easing.easeInCubic,
  align = 'left',
  letterSpacing = '-0.01em',
}) {
  const { localTime, duration } = useSprite();
  const exitStart = Math.max(0, duration - exitDur);

  let opacity = 1;
  let ty = 0;

  if (localTime < entryDur) {
    const t = entryEase(clamp(localTime / entryDur, 0, 1));
    opacity = t;
    ty = (1 - t) * 16;
  } else if (localTime > exitStart) {
    const t = exitEase(clamp((localTime - exitStart) / exitDur, 0, 1));
    opacity = 1 - t;
    ty = -t * 8;
  }

  const translateX = align === 'center' ? '-50%' : align === 'right' ? '-100%' : '0';

  return (
    <div style={{
      position: 'absolute',
      left: x, top: y,
      transform: `translate(${translateX}, ${ty}px)`,
      opacity,
      fontFamily: font,
      fontSize: size,
      fontWeight: weight,
      color,
      letterSpacing,
      whiteSpace: 'pre',
      lineHeight: 1.1,
      willChange: 'transform, opacity',
    }}>
      {text}
    </div>
  );
}

// ImageSprite: scales + fades in; optional Ken Burns drift during hold.
function ImageSprite({
  src,
  x = 0, y = 0,
  width = 400, height = 300,
  entryDur = 0.6,
  exitDur = 0.4,
  kenBurns = false,
  kenBurnsScale = 1.08,
  radius = 12,
  fit = 'cover',
  placeholder = null, // {label: string} for striped placeholder
}) {
  const { localTime, duration } = useSprite();
  const exitStart = Math.max(0, duration - exitDur);

  let opacity = 1;
  let scale = 1;

  if (localTime < entryDur) {
    const t = Easing.easeOutCubic(clamp(localTime / entryDur, 0, 1));
    opacity = t;
    scale = 0.96 + 0.04 * t;
  } else if (localTime > exitStart) {
    const t = Easing.easeInCubic(clamp((localTime - exitStart) / exitDur, 0, 1));
    opacity = 1 - t;
    scale = (kenBurns ? kenBurnsScale : 1) + 0.02 * t;
  } else if (kenBurns) {
    const holdSpan = exitStart - entryDur;
    const holdT = holdSpan > 0 ? (localTime - entryDur) / holdSpan : 0;
    scale = 1 + (kenBurnsScale - 1) * holdT;
  }

  const content = placeholder ? (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'repeating-linear-gradient(135deg, #e9e6df 0 10px, #dcd8cf 10px 20px)',
      color: '#6b6458',
      fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      fontSize: 13,
      letterSpacing: '0.04em',
      textTransform: 'uppercase',
    }}>
      {placeholder.label || 'image'}
    </div>
  ) : (
    <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }} />
  );

  return (
    <div style={{
      position: 'absolute',
      left: x, top: y,
      width, height,
      opacity,
      transform: `scale(${scale})`,
      transformOrigin: 'center',
      borderRadius: radius,
      overflow: 'hidden',
      willChange: 'transform, opacity',
    }}>
      {content}
    </div>
  );
}

// RectSprite: simple rectangle that animates position/size/color via props.
// Useful demo primitive — takes a `render` fn for per-frame customization.
function RectSprite({
  x = 0, y = 0,
  width = 100, height = 100,
  color = '#111',
  radius = 8,
  entryDur = 0.4,
  exitDur = 0.3,
  render, // optional: (ctx) => style overrides
}) {
  const spriteCtx = useSprite();
  const { localTime, duration } = spriteCtx;
  const exitStart = Math.max(0, duration - exitDur);

  let opacity = 1;
  let scale = 1;

  if (localTime < entryDur) {
    const t = Easing.easeOutBack(clamp(localTime / entryDur, 0, 1));
    opacity = clamp(localTime / entryDur, 0, 1);
    scale = 0.4 + 0.6 * t;
  } else if (localTime > exitStart) {
    const t = Easing.easeInQuad(clamp((localTime - exitStart) / exitDur, 0, 1));
    opacity = 1 - t;
    scale = 1 - 0.15 * t;
  }

  const overrides = render ? render(spriteCtx) : {};

  return (
    <div style={{
      position: 'absolute',
      left: x, top: y,
      width, height,
      background: color,
      borderRadius: radius,
      opacity,
      transform: `scale(${scale})`,
      transformOrigin: 'center',
      willChange: 'transform, opacity',
      ...overrides,
    }} />
  );
}


function Stage({
  width = 1280,
  height = 720,
  duration = 10,
  background = '#f6f4ef',
  fps = 60,
  loop = true,
  autoplay = true,
  persistKey = 'animstage',
  children,
}) {
  const [time, setTime] = React.useState(() => {
    try {
      const v = parseFloat(localStorage.getItem(persistKey + ':t') || '0');
      return isFinite(v) ? clamp(v, 0, duration) : 0;
    } catch { return 0; }
  });
  const [playing, setPlaying] = React.useState(autoplay);
  const [hoverTime, setHoverTime] = React.useState(null);
  const [scale, setScale] = React.useState(1);

  const stageRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  const rafRef = React.useRef(null);
  const lastTsRef = React.useRef(null);

  // Persist playhead
  React.useEffect(() => {
    try { localStorage.setItem(persistKey + ':t', String(time)); } catch {}
  }, [time, persistKey]);

  // Auto-scale to fit viewport
  React.useEffect(() => {
    if (!stageRef.current) return;
    const el = stageRef.current;
    const measure = () => {
      const barH = 0; // playback bar hidden — use full height
      const s = Math.min(
        el.clientWidth / width,
        (el.clientHeight - barH) / height
      );
      setScale(Math.max(0.05, s));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [width, height]);

  // Animation loop
  React.useEffect(() => {
    if (!playing) {
      lastTsRef.current = null;
      return;
    }
    const step = (ts) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = (ts - lastTsRef.current) / 1000;
      lastTsRef.current = ts;
      setTime((t) => {
        let next = t + dt;
        if (next >= duration) {
          if (loop) next = next % duration;
          else { next = duration; setPlaying(false); }
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [playing, duration, loop]);

  // Keyboard: space = play/pause, ← → = seek
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying(p => !p);
      } else if (e.code === 'ArrowLeft') {
        setTime(t => clamp(t - (e.shiftKey ? 1 : 0.1), 0, duration));
      } else if (e.code === 'ArrowRight') {
        setTime(t => clamp(t + (e.shiftKey ? 1 : 0.1), 0, duration));
      } else if (e.key === '0' || e.code === 'Home') {
        setTime(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [duration]);

  const displayTime = hoverTime != null ? hoverTime : time;

  const ctxValue = React.useMemo(
    () => ({ time: displayTime, duration, playing, setTime, setPlaying }),
    [displayTime, duration, playing]
  );

  return (
    <div
      ref={stageRef}
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        background: '#0a0a0a',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* Canvas area — vertically centered in remaining space */}
      <div style={{
        flex: 1,
        width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        <div
          ref={canvasRef}
          style={{
            width, height,
            background,
            position: 'relative',
            transform: `scale(${scale})`,
            transformOrigin: 'center',
            flexShrink: 0,
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            overflow: 'hidden',
          }}
        >
          <TimelineContext.Provider value={ctxValue}>
            {children}
          </TimelineContext.Provider>
        </div>
      </div>

      {/* Playback bar hidden — splash plays automatically, Skip button dismisses */}
    </div>
  );
}

// ── Playback bar ────────────────────────────────────────────────────────────
// Play/pause, return-to-begin, scrub track, time display.
// Uses fixed-width time fields so layout doesn't thrash.

function PlaybackBar({ time, duration, playing, onPlayPause, onReset, onSeek, onHover }) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);

  const timeFromEvent = React.useCallback((e) => {
    const rect = trackRef.current.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    return x * duration;
  }, [duration]);

  const onTrackMove = (e) => {
    if (!trackRef.current) return;
    const t = timeFromEvent(e);
    if (dragging) {
      onSeek(t);
    } else {
      onHover(t);
    }
  };

  const onTrackLeave = () => {
    if (!dragging) onHover(null);
  };

  const onTrackDown = (e) => {
    setDragging(true);
    const t = timeFromEvent(e);
    onSeek(t);
    onHover(null);
  };

  React.useEffect(() => {
    if (!dragging) return;
    const onUp = () => setDragging(false);
    const onMove = (e) => {
      if (!trackRef.current) return;
      const t = timeFromEvent(e);
      onSeek(t);
    };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
    };
  }, [dragging, timeFromEvent, onSeek]);

  const pct = duration > 0 ? (time / duration) * 100 : 0;
  const fmt = (t) => {
    const total = Math.max(0, t);
    const m = Math.floor(total / 60);
    const s = Math.floor(total % 60);
    const cs = Math.floor((total * 100) % 100);
    return `${String(m).padStart(1, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  const mono = 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '8px 16px',
      background: 'rgba(20,20,20,0.92)',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      width: '100%',
      maxWidth: 680,
      alignSelf: 'center',

      borderRadius: 8,
      color: '#f6f4ef',
      fontFamily: 'Inter, system-ui, sans-serif',
      userSelect: 'none',
      flexShrink: 0,
    }}>
      <IconButton onClick={onReset} title="Return to start (0)">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 2v10M12 2L5 7l7 5V2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
        </svg>
      </IconButton>
      <IconButton onClick={onPlayPause} title="Play/pause (space)">
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="3" y="2" width="3" height="10" fill="currentColor"/>
            <rect x="8" y="2" width="3" height="10" fill="currentColor"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 2l9 5-9 5V2z" fill="currentColor"/>
          </svg>
        )}
      </IconButton>

      {/* Current time: fixed width so it doesn't thrash */}
      <div style={{
        fontFamily: mono,
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
        width: 64, textAlign: 'right',
        color: '#f6f4ef',
      }}>
        {fmt(time)}
      </div>

      {/* Scrub track */}
      <div
        ref={trackRef}
        onMouseMove={onTrackMove}
        onMouseLeave={onTrackLeave}
        onMouseDown={onTrackDown}
        style={{
          flex: 1,
          height: 22,
          position: 'relative',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center',
        }}
      >
        <div style={{
          position: 'absolute',
          left: 0, right: 0, height: 4,
          background: 'rgba(255,255,255,0.12)',
          borderRadius: 2,
        }}/>
        <div style={{
          position: 'absolute',
          left: 0, width: `${pct}%`, height: 4,
          background: 'oklch(72% 0.12 250)',
          borderRadius: 2,
        }}/>
        <div style={{
          position: 'absolute',
          left: `${pct}%`, top: '50%',
          width: 12, height: 12,
          marginLeft: -6, marginTop: -6,
          background: '#fff',
          borderRadius: 6,
          boxShadow: '0 2px 4px rgba(0,0,0,0.4)',
        }}/>
      </div>

      {/* Duration: fixed width */}
      <div style={{
        fontFamily: mono,
        fontSize: 12,
        fontVariantNumeric: 'tabular-nums',
        width: 64, textAlign: 'left',
        color: 'rgba(246,244,239,0.55)',
      }}>
        {fmt(duration)}
      </div>
    </div>
  );
}

function IconButton({ children, onClick, title }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 28, height: 28,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hover ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 6,
        color: '#f6f4ef',
        cursor: 'pointer',
        padding: 0,
        transition: 'background 120ms',
      }}
    >
      {children}
    </button>
  );
}


Object.assign(window, {
  Easing, interpolate, animate, clamp,
  TimelineContext, useTime, useTimeline,
  Sprite, SpriteContext, useSprite,
  TextSprite, ImageSprite, RectSprite,
  Stage, PlaybackBar,
});



// ===== CORTEX SCENES =====

// cortex_scenes.jsx — Cortex product video scenes.
// Depends on the animation engine globals (Stage, Sprite, useTime, useSprite,
// Easing, interpolate, animate, clamp) which are concatenated ahead of this file.
// Registers window.CortexVideo (a React component rendering the full Stage).

const C = {
  bg: "#ffffff",
  fg: "#0a0a0a",
  red: "#dc0000",
  ring: "#e60000",
  amber: "#ffbf00",
  border: "#e2e8f0",
  muted: "#f5f5f5",
  mutedFg: "#6b7280",
  green: "#476b47",
  brown: "#8f583d",
  blue: "#2563a8",
  font: "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif",
  mono: "'SF Mono','SFMono-Regular','Courier New',monospace",
};

const W = 1920, H = 1080;
const HEADER_H = 70, SIDEBAR_W = 264;
const CONTENT_X = SIDEBAR_W, CONTENT_Y = HEADER_H;
const CONTENT_W = W - SIDEBAR_W, CONTENT_H = H - HEADER_H;

// ── tiny stroke-icon set (lucide-flavored) ─────────────────────────────
function Icon({ name, size = 18, color = "currentColor", sw = 1.8 }) {
  const p = {
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /></>,
    message: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M7 20l3-3" /></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5" /></>,
    branch: <><circle cx="6" cy="5" r="2.4" /><circle cx="6" cy="19" r="2.4" /><circle cx="18" cy="7" r="2.4" /><path d="M6 7.4v9.2M18 9.4c0 4-6 2.6-6 7" /></>,
    folder: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></>,
    network: <><circle cx="12" cy="5" r="2.4" /><circle cx="5" cy="18" r="2.4" /><circle cx="19" cy="18" r="2.4" /><path d="M10.4 6.9 6.6 16M13.6 6.9 17.4 16M7.4 18h9.2" /></>,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.2v.2" /></>,
    sparkles: <><path d="M12 3.5 13.7 9 19 10.7 13.7 12.4 12 18l-1.7-5.6L5 10.7 10.3 9Z" /><path d="M18.5 4v3M20 5.5h-3" /></>,
    activity: <><path d="M3 12h4l3 8 4-16 3 8h4" /></>,
    shield: <><path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6Z" /><path d="m9 12 2 2 4-4" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></>,
    check: <><path d="m4 12 5 5L20 6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    minus: <><path d="M5 12h14" /></>,
    compare: <><path d="M6 4v16M18 4v16" /><path d="m3 8 3-4 3 4M21 16l-3 4-3-4" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    bolt: <><path d="M13 3 4 14h6l-1 7 9-11h-6Z" /></>,
    file: <><path d="M6 3h8l4 4v14H6Z" /><path d="M14 3v4h4" /></>,
    git: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M8 10l4-3 4 3" /></>,
  }[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0 }}>
      {p}
    </svg>
  );
}

// dotted grid background like .bg-grid
function GridBG({ opacity = 1 }) {
  return (
    <div style={{
      position: "absolute", inset: 0, opacity,
      backgroundImage:
        "linear-gradient(rgba(0,0,0,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.05) 1px,transparent 1px)",
      backgroundSize: "34px 34px",
    }} />
  );
}

// ── App chrome (header + sidebar) ──────────────────────────────────────
const NAV = [
  { key: "home", label: "Home", icon: "home" },
  { key: "chat", label: "Q&A Chat", icon: "message" },
  { key: "ingest", label: "Ingest & Sync", icon: "database" },
  { key: "commits", label: "Commit Logs", icon: "branch" },
  { key: "explorer", label: "Repo Explorer", icon: "folder" },
  { key: "graph", label: "Graph", icon: "network" },
  { key: "impact", label: "What-If", icon: "alert" },
  { key: "scaffold", label: "Scaffold", icon: "sparkles" },
  { key: "timeline", label: "Timeline", icon: "activity" },
  { key: "health", label: "Health", icon: "shield" },
  { key: "search", label: "Search", icon: "search" },
];

function Chrome({ active, cursorTo }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: C.bg, fontFamily: C.font, color: C.fg, letterSpacing: "-0.02em" }}>
      <GridBG opacity={0.7} />
      {/* header */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: HEADER_H,
        borderBottom: `1px solid ${C.border}`, background: C.bg, zIndex: 5,
        display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 8, background: C.muted,
            border: `1px solid ${C.border}`, boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon name="network" size={22} color={C.fg} sw={2} />
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1 }}>Cortex</div>
            <div style={{ fontSize: 11.5, color: C.mutedFg, marginTop: 4, lineHeight: 1, fontWeight: 500 }}>Knowledge Graph Intelligence</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 11, color: C.mutedFg, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Repo</span>
          <div style={{
            minWidth: 230, height: 40, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg,
            display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px",
            fontSize: 13.5, fontWeight: 600, boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name="git" size={15} color={C.fg} />acme / payments-api
            </span>
            <span style={{ color: C.mutedFg, fontSize: 11 }}>▾</span>
          </div>
          <div style={{
            height: 40, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg,
            display: "flex", alignItems: "center", gap: 8, padding: "0 14px", fontSize: 13, fontWeight: 600,
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: C.fg, color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>S</div>
            Sign out
          </div>
        </div>
      </div>
      {/* sidebar */}
      <div style={{
        position: "absolute", top: HEADER_H, left: 0, bottom: 0, width: SIDEBAR_W,
        borderRight: `1px solid ${C.border}`, background: C.bg, zIndex: 4, padding: "16px 14px",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", color: C.mutedFg, textTransform: "uppercase", padding: "6px 12px 12px" }}>Navigation</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV.map((n) => {
            const on = n.key === active;
            return (
              <div key={n.key} style={{
                display: "flex", alignItems: "center", gap: 13, padding: "11px 13px", borderRadius: 7,
                fontSize: 14.5, fontWeight: on ? 700 : 500,
                background: on ? C.red : "transparent",
                color: on ? "#fff" : C.mutedFg,
                boxShadow: on ? "0 2px 8px rgba(220,0,0,0.28)" : "none",
                transition: "background 200ms, color 200ms",
              }}>
                <Icon name={n.icon} size={18} color={on ? "#fff" : C.mutedFg} sw={on ? 2 : 1.8} />
                <span>{n.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      {/* moving cursor */}
      {cursorTo && <Cursor pos={cursorTo} />}
    </div>
  );
}

function Cursor({ pos }) {
  return (
    <div style={{ position: "absolute", left: pos.x, top: pos.y, zIndex: 40, transition: "none", pointerEvents: "none", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.3))" }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
        <path d="M5 3l14 7-6 1.6 3.6 6.4-2.7 1.5-3.5-6.3L5 16Z" fill="#fff" stroke="#0a0a0a" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── lower-third caption ────────────────────────────────────────────────
function Caption({ index, total, title, sub, localTime, duration, accent = C.red }) {
  const enter = Easing.easeOutCubic(clamp(localTime / 0.5, 0, 1));
  const exitStart = duration - 0.45;
  const exit = localTime > exitStart ? Easing.easeInCubic(clamp((localTime - exitStart) / 0.45, 0, 1)) : 0;
  const o = enter * (1 - exit);
  const ty = (1 - enter) * 24 + exit * -14;
  return (
    <div style={{
      position: "absolute", left: CONTENT_X + 44, bottom: 46, zIndex: 30,
      opacity: o, transform: `translateY(${ty}px)`,
      display: "flex", alignItems: "flex-end", gap: 18,
    }}>
      <div style={{
        background: accent, color: "#fff", fontFamily: C.mono, fontWeight: 700, fontSize: 15,
        padding: "8px 12px", borderRadius: 7, letterSpacing: "0.02em",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      }}>
        {String(index).padStart(2, "0")}<span style={{ opacity: 0.6 }}> / {String(total).padStart(2, "0")}</span>
      </div>
      <div style={{
        background: "rgba(10,10,10,0.92)", color: "#fff", borderRadius: 9, padding: "13px 20px",
        boxShadow: "0 12px 36px rgba(0,0,0,0.26)", backdropFilter: "blur(4px)",
      }}>
        <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</div>
        <div style={{ fontSize: 15, color: "rgba(255,255,255,0.72)", marginTop: 4, fontWeight: 500, maxWidth: 560 }}>{sub}</div>
      </div>
    </div>
  );
}

function ContentArea({ children, pad = 48 }) {
  return (
    <div style={{
      position: "absolute", left: CONTENT_X, top: CONTENT_Y, width: CONTENT_W, height: CONTENT_H,
      padding: pad, boxSizing: "border-box", overflow: "hidden",
    }}>
      {children}
    </div>
  );
}

function reveal(localTime, at, dur = 0.45, ease = Easing.easeOutCubic) {
  return ease(clamp((localTime - at) / dur, 0, 1));
}

// ════════════════════════════════════════════════════════════════════════
// SCENE 0 — WELCOME
// ════════════════════════════════════════════════════════════════════════
function WelcomeScene() {
  return (
    <Sprite start={0} end={4.2}>
      {({ localTime, duration }) => {
        const exit = localTime > duration - 0.5 ? clamp((localTime - (duration - 0.5)) / 0.5, 0, 1) : 0;
        const logoIn = Easing.easeOutBack(clamp(localTime / 0.7, 0, 1));
        const ringPulse = 1 + 0.5 * Math.sin(localTime * 2);
        return (
          <div style={{ position: "absolute", inset: 0, background: C.bg, fontFamily: C.font, color: C.fg, opacity: 1 - exit }}>
            <GridBG opacity={0.6} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `translateY(${exit * -20}px)` }}>
              <div style={{ position: "relative", marginBottom: 38 }}>
                <div style={{
                  position: "absolute", inset: -18, borderRadius: 28, border: `2px solid ${C.red}`,
                  opacity: 0.25 * (1 - (ringPulse - 0.5)), transform: `scale(${ringPulse})`,
                }} />
                <div style={{
                  width: 120, height: 120, borderRadius: 26, background: C.fg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transform: `scale(${logoIn})`, boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
                }}>
                  <Icon name="network" size={64} color="#fff" sw={1.8} />
                </div>
              </div>
              <div style={{ fontSize: 30, fontWeight: 600, color: C.mutedFg, letterSpacing: "0.04em", opacity: reveal(localTime, 0.5), transform: `translateY(${(1 - reveal(localTime, 0.5)) * 14}px)` }}>Welcome to</div>
              <div style={{ fontSize: 104, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1, marginTop: 6, opacity: reveal(localTime, 0.7), transform: `translateY(${(1 - reveal(localTime, 0.7)) * 18}px)` }}>Cortex</div>
              <div style={{
                marginTop: 22, fontSize: 24, fontWeight: 500, color: C.mutedFg, letterSpacing: "-0.01em",
                opacity: reveal(localTime, 1.0), transform: `translateY(${(1 - reveal(localTime, 1.0)) * 14}px)`,
              }}>
                Understand any codebase. <span style={{ color: C.fg, fontWeight: 700 }}>Instantly.</span>
              </div>
            </div>
          </div>
        );
      }}
    </Sprite>
  );
}

// ════════════════════════════════════════════════════════════════════════
// SCENE 1 — PROBLEM
// ════════════════════════════════════════════════════════════════════════
function ProblemScene() {
  return (
    <Sprite start={4.0} end={7.8}>
      {({ localTime, duration }) => {
        const exit = localTime > duration - 0.5 ? clamp((localTime - (duration - 0.5)) / 0.5, 0, 1) : 0;
        const enter = clamp(localTime / 0.4, 0, 1);
        // scattered nodes that drift
        const nodes = [
          [320, 240], [560, 180], [820, 320], [1120, 220], [1400, 340], [1620, 240],
          [420, 480], [700, 560], [980, 500], [1280, 560], [1540, 520],
          [360, 760], [640, 820], [960, 760], [1240, 820], [1520, 760],
        ];
        return (
          <div style={{ position: "absolute", inset: 0, background: C.bg, fontFamily: C.font, color: C.fg, opacity: enter * (1 - exit) }}>
            <GridBG opacity={0.5} />
            {/* tangled chaotic edges */}
            <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
              {nodes.map((a, i) =>
                nodes.slice(i + 1).map((b, j) => {
                  if ((i + j) % 3 !== 0) return null;
                  const draw = clamp((localTime - 0.2) / 1.2, 0, 1);
                  return <line key={i + "-" + j} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="rgba(220,0,0,0.16)" strokeWidth="1.2" strokeDasharray="1400" strokeDashoffset={1400 * (1 - draw)} />;
                })
              )}
            </svg>
            {nodes.map((n, i) => {
              const dx = Math.sin(localTime * 1.3 + i) * 6, dy = Math.cos(localTime * 1.1 + i) * 6;
              const pop = Easing.easeOutBack(clamp((localTime - 0.1 - i * 0.03) / 0.4, 0, 1));
              return <div key={i} style={{ position: "absolute", left: n[0] - 7, top: n[1] - 7, width: 14, height: 14, borderRadius: "50%", background: i % 4 === 0 ? C.red : C.fg, opacity: 0.5 * pop, transform: `translate(${dx}px,${dy}px) scale(${pop})` }} />;
            })}
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `translateY(${exit * -16}px)` }}>
              <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: "-0.03em", textAlign: "center", lineHeight: 1.08, opacity: reveal(localTime, 0.3), maxWidth: 1100 }}>
                Every codebase is a maze of<br />
                <span style={{ color: C.red }}>hidden connections.</span>
              </div>
              <div style={{ fontSize: 22, color: C.mutedFg, marginTop: 24, fontWeight: 500, textAlign: "center", maxWidth: 760, opacity: reveal(localTime, 0.9) }}>
                One change ripples across services, schemas and APIs you forgot existed. Cortex maps them all.
              </div>
            </div>
          </div>
        );
      }}
    </Sprite>
  );
}

// ════════════════════════════════════════════════════════════════════════
// FEATURE TOUR (persistent chrome 7.6 – 41.8)
// ════════════════════════════════════════════════════════════════════════
const TOUR_START = 7.6, TOUR_END = 42.0;
const FEAT = {
  ingest:   { start: 8.2,  end: 14.0, nav: "ingest" },
  graph:    { start: 14.0, end: 20.6, nav: "graph" },
  chat:     { start: 20.6, end: 27.2, nav: "chat" },
  whatif:   { start: 27.2, end: 33.2, nav: "impact" },
  spec:     { start: 33.2, end: 38.0, nav: "impact" },
  scaffold: { start: 38.0, end: 41.8, nav: "scaffold" },
};

function AppTour() {
  return (
    <Sprite start={TOUR_START} end={TOUR_END}>
      {({ localTime, duration }) => {
        const t = TOUR_START + localTime; // absolute stage time
        const enter = Easing.easeOutCubic(clamp(localTime / 0.5, 0, 1));
        const exit = localTime > duration - 0.45 ? clamp((localTime - (duration - 0.45)) / 0.45, 0, 1) : 0;
        // active nav by time
        let active = "ingest";
        for (const k in FEAT) if (t >= FEAT[k].start && t < FEAT[k].end) active = FEAT[k].nav;
        return (
          <div style={{ position: "absolute", inset: 0, opacity: enter * (1 - exit), transform: `scale(${0.985 + 0.015 * enter})`, transformOrigin: "center" }}>
            <Chrome active={active} />
            <ContentArea>
              <IngestScene t={t} />
              <GraphScene t={t} />
              <ChatScene t={t} />
              <WhatIfScene t={t} />
              <SpecScene t={t} />
              <ScaffoldScene t={t} />
            </ContentArea>
          </div>
        );
      }}
    </Sprite>
  );
}

// helper: render content only within [start,end] with internal cross-fade
function FeatureWrap({ feat, t, children }) {
  const { start, end } = FEAT[feat];
  if (t < start - 0.05 || t > end + 0.05) return null;
  const lt = t - start;
  const inO = Easing.easeOutCubic(clamp(lt / 0.4, 0, 1));
  const outO = t > end - 0.4 ? clamp((t - (end - 0.4)) / 0.4, 0, 1) : 0;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: inO * (1 - outO), transform: `translateY(${(1 - inO) * 12 - outO * 10}px)` }}>
      {typeof children === "function" ? children(lt) : children}
    </div>
  );
}

function PanelHeader({ icon, title, accent = C.fg, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: C.muted, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={icon} size={20} color={accent} sw={2} />
        </div>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{title}</div>
        </div>
      </div>
      {right}
    </div>
  );
}

const card = { background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.05)" };

// ── INGEST ──────────────────────────────────────────────────────────────
function IngestScene({ t }) {
  return (
    <FeatureWrap feat="ingest" t={t}>
      {(lt) => {
        const steps = [
          { label: "Cloning repository", detail: "git clone acme/payments-api" },
          { label: "Parsing 1,284 source files", detail: "Python · TypeScript · YAML" },
          { label: "Extracting symbols & call graph", detail: "8,902 symbols" },
          { label: "Building knowledge graph", detail: "14,308 nodes · 31,640 edges" },
        ];
        const stepDur = 1.05, base = 1.2;
        const btnPress = lt > 0.5 && lt < 0.9;
        return (
          <div style={{ maxWidth: 980, margin: "0 auto", paddingTop: 8 }}>
            <PanelHeader icon="database" title="Ingest & Sync" accent={C.fg} />
            <div style={{ ...card, padding: 28 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: C.mutedFg, textTransform: "uppercase", marginBottom: 10 }}>GitHub Repository URL</div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1, height: 54, borderRadius: 8, border: `1px solid ${C.border}`, background: C.muted, display: "flex", alignItems: "center", gap: 10, padding: "0 16px", fontFamily: C.mono, fontSize: 16, fontWeight: 500 }}>
                  <Icon name="git" size={18} color={C.mutedFg} />
                  https://github.com/acme/payments-api
                </div>
                <div style={{
                  height: 54, borderRadius: 8, background: C.red, color: "#fff", display: "flex", alignItems: "center", gap: 9,
                  padding: "0 24px", fontSize: 16, fontWeight: 700, transform: `scale(${btnPress ? 0.96 : 1})`,
                  boxShadow: "0 6px 18px rgba(220,0,0,0.3)", transition: "transform 120ms",
                }}>
                  <Icon name="bolt" size={18} color="#fff" sw={2} />Ingest
                </div>
              </div>
            </div>

            {lt > base - 0.2 && (
              <div style={{ ...card, padding: 24, marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: C.mutedFg, textTransform: "uppercase", marginBottom: 16 }}>Pipeline</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {steps.map((s, i) => {
                    const sStart = base + i * stepDur;
                    const prog = clamp((lt - sStart) / stepDur, 0, 1);
                    const done = prog >= 1;
                    const active = lt >= sStart && !done;
                    const visible = lt >= sStart - 0.1;
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, opacity: visible ? 1 : 0.32, transition: "opacity 200ms" }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                          background: done ? C.green : active ? "#fff" : C.muted,
                          border: `2px solid ${done ? C.green : active ? C.red : C.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {done ? <Icon name="check" size={16} color="#fff" sw={2.6} />
                            : active ? <div style={{ width: 12, height: 12, border: `2px solid ${C.red}`, borderTopColor: "transparent", borderRadius: "50%", transform: `rotate(${lt * 540}deg)` }} /> : null}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                            <span style={{ fontSize: 16, fontWeight: 600 }}>{s.label}</span>
                            <span style={{ fontFamily: C.mono, fontSize: 13, color: C.mutedFg }}>{s.detail}</span>
                          </div>
                          <div style={{ height: 5, borderRadius: 3, background: C.muted, marginTop: 7, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${prog * 100}%`, background: done ? C.green : C.red, borderRadius: 3 }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {lt > base + steps.length * stepDur && (
                  <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 10, color: C.green, fontWeight: 700, fontSize: 16 }}>
                    <Icon name="check" size={18} color={C.green} sw={2.4} /> Knowledge graph ready — repo is now queryable.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      }}
    </FeatureWrap>
  );
}

// ── GRAPH ───────────────────────────────────────────────────────────────
function GraphScene({ t }) {
  return (
    <FeatureWrap feat="graph" t={t}>
      {(lt) => {
        const cx = 720, cy = 430;
        const nodes = [
          { id: "PaymentService", x: cx, y: cy, r: 30, c: C.red, big: true },
          { id: "UserService", x: cx - 250, y: cy - 150, r: 24, c: C.fg },
          { id: "AuthGateway", x: cx + 250, y: cy - 160, r: 22, c: C.fg },
          { id: "User", x: cx - 360, y: cy + 60, r: 20, c: C.amber, kind: "schema" },
          { id: "Invoice", x: cx + 330, y: cy + 80, r: 20, c: C.amber, kind: "schema" },
          { id: "ledger.py", x: cx - 150, y: cy + 200, r: 17, c: C.green, kind: "file" },
          { id: "webhooks.ts", x: cx + 160, y: cy + 210, r: 17, c: C.green, kind: "file" },
          { id: "Stripe API", x: cx + 120, y: cy - 250, r: 18, c: C.brown, kind: "ext" },
          { id: "Notifier", x: cx - 120, y: cy - 250, r: 18, c: C.fg },
        ];
        const edges = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [2, 7], [1, 8], [1, 3], [2, 4]];
        const idx = (n) => nodes[n];
        const drift = (i) => ({ dx: Math.sin(lt * 0.9 + i) * 5, dy: Math.cos(lt * 0.75 + i * 1.3) * 5 });
        return (
          <div style={{ position: "absolute", inset: 0 }}>
            <PanelHeader icon="network" title="Living Knowledge Graph" accent={C.red}
              right={<div style={{ display: "flex", gap: 10 }}>{[["Service", C.red], ["Module", C.fg], ["Schema", C.amber], ["File", C.green], ["External", C.brown]].map(([l, c]) => (
                <div key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: C.mutedFg }}>
                  <span style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />{l}
                </div>
              ))}</div>} />
            <div style={{ position: "relative", height: 720 }}>
              <svg width={CONTENT_W - 96} height={720} style={{ position: "absolute", inset: 0 }}>
                {edges.map(([a, b], i) => {
                  const A = idx(a), B = idx(b); const da = drift(a), db = drift(b);
                  const draw = clamp((lt - 0.3 - i * 0.05) / 0.7, 0, 1);
                  const len = Math.hypot(B.x - A.x, B.y - A.y);
                  return <line key={i} x1={A.x + da.dx} y1={A.y + da.dy} x2={B.x + db.dx} y2={B.y + db.dy}
                    stroke={a === 0 || b === 0 ? "rgba(220,0,0,0.35)" : "rgba(10,10,10,0.18)"} strokeWidth={a === 0 || b === 0 ? 2 : 1.4}
                    strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />;
                })}
              </svg>
              {nodes.map((n, i) => {
                const pop = Easing.easeOutBack(clamp((lt - 0.2 - i * 0.06) / 0.5, 0, 1));
                const d = drift(i);
                const pulse = n.big ? 1 + 0.04 * Math.sin(lt * 3) : 1;
                return (
                  <div key={n.id} style={{ position: "absolute", left: n.x + d.dx, top: n.y + d.dy, transform: `translate(-50%,-50%) scale(${pop * pulse})`, opacity: pop, display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
                    <div style={{ width: n.r * 2, height: n.r * 2, borderRadius: "50%", background: n.c, boxShadow: n.big ? "0 0 0 8px rgba(220,0,0,0.12),0 8px 22px rgba(0,0,0,0.18)" : "0 4px 12px rgba(0,0,0,0.14)", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {n.big && <Icon name="bolt" size={26} color="#fff" sw={2} />}
                    </div>
                    <div style={{ fontSize: n.big ? 15 : 13, fontWeight: n.big ? 800 : 600, fontFamily: n.kind === "file" || n.kind === "ext" ? C.mono : C.font, color: C.fg, background: "rgba(255,255,255,0.85)", padding: "1px 6px", borderRadius: 5, whiteSpace: "nowrap" }}>{n.id}</div>
                  </div>
                );
              })}
              {/* detail popover */}
              {lt > 1.6 && (() => {
                const o = Easing.easeOutBack(clamp((lt - 1.6) / 0.5, 0, 1));
                return (
                  <div style={{ position: "absolute", right: 10, top: 40, width: 300, ...card, padding: 18, opacity: clamp(o, 0, 1), transform: `translateX(${(1 - o) * 20}px)` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
                      <span style={{ width: 12, height: 12, borderRadius: "50%", background: C.red }} />
                      <span style={{ fontSize: 17, fontWeight: 800 }}>PaymentService</span>
                    </div>
                    {[["Type", "Service"], ["Language", "Python"], ["Dependents", "23 nodes"], ["Calls out", "Stripe API, Ledger"]].map(([k, v]) => (
                      <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "6px 0", borderTop: `1px solid ${C.border}` }}>
                        <span style={{ color: C.mutedFg }}>{k}</span><span style={{ fontWeight: 600, fontFamily: C.mono, fontSize: 13 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      }}
    </FeatureWrap>
  );
}

// ── CHAT (RAG) ──────────────────────────────────────────────────────────
function ChatScene({ t }) {
  return (
    <FeatureWrap feat="chat" t={t}>
      {(lt) => {
        const answer = "If you change the User schema, three services break: PaymentService (reads user.email for receipts), AuthGateway (validates user.id type), and Notifier. The user.id type change from string to integer is a breaking change.";
        const typeStart = 1.6, cps = 52;
        const shown = lt > typeStart ? answer.slice(0, Math.floor((lt - typeStart) * cps)) : "";
        const typing = shown.length < answer.length && lt > typeStart;
        const citations = [
          { f: "payment_service.py", l: "L142" },
          { f: "auth/gateway.ts", l: "L88" },
          { f: "schemas/user.py", l: "L12" },
        ];
        return (
          <div style={{ maxWidth: 1000, margin: "0 auto" }}>
            <PanelHeader icon="message" title="Q&A Chat" accent={C.fg}
              right={<div style={{ fontSize: 13, fontWeight: 600, color: C.mutedFg, display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} />Grounded in your graph</div>} />
            {/* user question */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18, opacity: reveal(lt, 0.1) }}>
              <div style={{ background: C.fg, color: "#fff", padding: "15px 20px", borderRadius: "14px 14px 4px 14px", fontSize: 18, fontWeight: 500, maxWidth: 620 }}>
                Which services break if I change the <span style={{ color: C.amber, fontWeight: 700 }}>User</span> schema?
              </div>
            </div>
            {/* AI answer */}
            {lt > 0.9 && (
              <div style={{ display: "flex", gap: 14, opacity: reveal(lt, 0.9) }}>
                <div style={{ width: 40, height: 40, borderRadius: 9, background: C.red, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 12px rgba(220,0,0,0.28)" }}>
                  <Icon name="network" size={22} color="#fff" sw={2} />
                </div>
                <div style={{ ...card, padding: "20px 24px", flex: 1 }}>
                  {lt < typeStart ? (
                    <div style={{ display: "flex", gap: 6, padding: "6px 0" }}>
                      {[0, 1, 2].map((i) => <span key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: C.mutedFg, opacity: 0.3 + 0.7 * Math.abs(Math.sin(lt * 4 - i * 0.6)) }} />)}
                    </div>
                  ) : (
                    <div style={{ fontSize: 18, lineHeight: 1.7, fontWeight: 450 }}>
                      {renderAnswer(shown)}
                      {typing && <span style={{ display: "inline-block", width: 9, height: 20, background: C.red, marginLeft: 2, transform: "translateY(3px)", opacity: Math.sin(lt * 8) > 0 ? 1 : 0.2 }} />}
                    </div>
                  )}
                  {!typing && lt > typeStart && (
                    <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", opacity: reveal(lt, typeStart + answer.length / cps + 0.1) }}>
                      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: C.mutedFg, textTransform: "uppercase" }}>Sources</span>
                      {citations.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 11px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.muted, fontFamily: C.mono, fontSize: 13, fontWeight: 600 }}>
                          <Icon name="file" size={13} color={C.red} />{c.f} <span style={{ color: C.mutedFg }}>{c.l}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      }}
    </FeatureWrap>
  );
}
function renderAnswer(text) {
  // bold the service names
  const names = ["PaymentService", "AuthGateway", "Notifier", "string to integer", "breaking change"];
  const parts = [];
  let rest = text, key = 0;
  while (rest.length) {
    let hitIdx = -1, hitName = null;
    for (const n of names) { const k = rest.indexOf(n); if (k !== -1 && (hitIdx === -1 || k < hitIdx)) { hitIdx = k; hitName = n; } }
    if (hitIdx === -1) { parts.push(<span key={key++}>{rest}</span>); break; }
    if (hitIdx > 0) parts.push(<span key={key++}>{rest.slice(0, hitIdx)}</span>);
    const bold = rest.slice(hitIdx, hitIdx + hitName.length);
    parts.push(<strong key={key++} style={{ color: C.red, fontWeight: 700 }}>{bold}</strong>);
    rest = rest.slice(hitIdx + hitName.length);
  }
  return parts;
}

// ── WHAT-IF (blast radius) ──────────────────────────────────────────────
function WhatIfScene({ t }) {
  return (
    <FeatureWrap feat="whatif" t={t}>
      {(lt) => {
        const ring = clamp((lt - 0.6) / 1.4, 0, 1);
        const impacted = [
          { f: "PaymentService.create_charge", sev: "critical" },
          { f: "AuthGateway.validateToken", sev: "high" },
          { f: "ledger.record_entry", sev: "high" },
          { f: "Notifier.send_receipt", sev: "medium" },
          { f: "webhooks.handleStripe", sev: "medium" },
          { f: "admin/users.list", sev: "low" },
        ];
        const sevColor = { critical: C.red, high: "#e07b00", medium: C.amber, low: C.green };
        return (
          <div style={{ position: "absolute", inset: 0, display: "flex", gap: 28 }}>
            {/* left: selection + radial */}
            <div style={{ width: 560, display: "flex", flexDirection: "column" }}>
              <PanelHeader icon="alert" title="What-If Analysis" accent={C.red} />
              <div style={{ ...card, padding: 18, marginBottom: 18 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: C.mutedFg, textTransform: "uppercase", marginBottom: 9 }}>Change target</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: C.mono, fontSize: 16, fontWeight: 700 }}>
                  <span style={{ width: 11, height: 11, borderRadius: "50%", background: C.red }} />User.id <span style={{ color: C.mutedFg, fontWeight: 500 }}>· string → integer</span>
                </div>
              </div>
              {/* radial blast */}
              <div style={{ ...card, flex: 1, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {[1, 2, 3].map((r) => (
                  <div key={r} style={{
                    position: "absolute", borderRadius: "50%", border: `2px solid ${C.red}`,
                    width: r * 150 * ring, height: r * 150 * ring, opacity: (1 - r * 0.25) * ring * 0.5,
                  }} />
                ))}
                <div style={{ position: "absolute", width: 64, height: 64, borderRadius: "50%", background: C.red, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 6px rgba(220,0,0,0.18)" }}>
                  <Icon name="bolt" size={30} color="#fff" sw={2} />
                </div>
                {impacted.slice(0, 6).map((n, i) => {
                  const ang = (i / 6) * Math.PI * 2 - Math.PI / 2;
                  const rad = 165 * ring;
                  const o = clamp((lt - 0.8 - i * 0.12) / 0.4, 0, 1);
                  return <div key={i} style={{ position: "absolute", transform: `translate(${Math.cos(ang) * rad}px,${Math.sin(ang) * rad}px) scale(${o})`, width: 16, height: 16, borderRadius: "50%", background: sevColor[n.sev], border: "2px solid #fff", opacity: o, boxShadow: "0 3px 8px rgba(0,0,0,0.2)" }} />;
                })}
              </div>
            </div>
            {/* right: stats + list */}
            <div style={{ flex: 1, paddingTop: 76 }}>
              <div style={{ display: "flex", gap: 14, marginBottom: 18 }}>
                {[["23", "Nodes affected", C.red], ["3", "Services", C.fg], ["6", "Critical paths", "#e07b00"]].map(([v, l, c], i) => (
                  <div key={l} style={{ ...card, padding: "16px 20px", flex: 1, opacity: reveal(lt, 0.3 + i * 0.12) }}>
                    <div style={{ fontSize: 38, fontWeight: 800, color: c, lineHeight: 1, fontFamily: C.mono }}>{Math.round(Number(v) * clamp((lt - 0.3 - i * 0.12) / 0.6, 0, 1))}</div>
                    <div style={{ fontSize: 13, color: C.mutedFg, marginTop: 6, fontWeight: 600 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ ...card, padding: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: C.mutedFg, textTransform: "uppercase", padding: "12px 14px 8px" }}>Impacted nodes — blast radius</div>
                {impacted.map((n, i) => {
                  const o = clamp((lt - 1.0 - i * 0.14) / 0.4, 0, 1);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: i ? `1px solid ${C.border}` : "none", opacity: o, transform: `translateX(${(1 - o) * 16}px)` }}>
                      <span style={{ fontFamily: C.mono, fontSize: 15, fontWeight: 600, flex: 1 }}>{n.f}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#fff", background: sevColor[n.sev], padding: "4px 10px", borderRadius: 999 }}>{n.sev}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      }}
    </FeatureWrap>
  );
}

// ── SPEC DIFF ───────────────────────────────────────────────────────────
function SpecScene({ t }) {
  return (
    <FeatureWrap feat="spec" t={t}>
      {(lt) => {
        const sev = [["critical", 1, C.red], ["high", 1, "#e07b00"], ["medium", 1, C.amber], ["low", 0, C.green]];
        const breaking = [
          { m: "GET", p: "/users/{id}", d: "Param id type changed string → integer", s: "critical" },
          { m: "GET", p: "/users/{id}", d: "Operation marked deprecated", s: "medium" },
          { m: "—", p: "User.email", d: "Field is now required", s: "high" },
        ];
        const sc = { critical: C.red, high: "#e07b00", medium: C.amber, low: C.green };
        return (
          <div style={{ position: "absolute", inset: 0 }}>
            <PanelHeader icon="compare" title="OpenAPI Spec Diff" accent={C.red} />
            <div style={{ display: "flex", gap: 18 }}>
              {/* spec panes */}
              {[["v1.0.0 — old", ["type: string", "required: [id, name]", "—"]], ["v2.0.0 — new", ["type: integer", "required: [id, name, email]", "deprecated: true"]]].map(([title, lines], pi) => (
                <div key={pi} style={{ ...card, flex: 1, padding: 0, overflow: "hidden", opacity: reveal(lt, 0.1 + pi * 0.12) }}>
                  <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700, background: C.muted, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: pi ? C.red : C.mutedFg }} />{title}
                  </div>
                  <div style={{ padding: 16, fontFamily: C.mono, fontSize: 14, lineHeight: 1.9 }}>
                    <div style={{ color: C.mutedFg }}>paths:</div>
                    <div style={{ color: C.mutedFg, paddingLeft: 16 }}>/users/&#123;id&#125;:</div>
                    {lines.map((l, i) => (
                      <div key={i} style={{ paddingLeft: 32, background: l !== "—" && pi ? "rgba(220,0,0,0.08)" : pi === 0 && l !== "—" ? "rgba(0,0,0,0.04)" : "transparent", color: l === "—" ? "transparent" : pi ? C.red : C.fg, fontWeight: pi && l !== "—" ? 700 : 500, borderLeft: l !== "—" ? `3px solid ${pi ? C.red : "transparent"}` : "3px solid transparent", paddingRight: 8 }}>
                        {pi && l !== "—" ? "~ " : ""}{l}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {/* results */}
            {lt > 1.1 && (
              <div style={{ display: "flex", gap: 18, marginTop: 18, opacity: reveal(lt, 1.1) }}>
                <div style={{ width: 360 }}>
                  <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                    {[["3", "Breaking", C.red], ["2", "Endpoints", C.fg]].map(([v, l, c]) => (
                      <div key={l} style={{ ...card, padding: "14px 18px", flex: 1 }}>
                        <div style={{ fontSize: 32, fontWeight: 800, color: c, fontFamily: C.mono, lineHeight: 1 }}>{v}</div>
                        <div style={{ fontSize: 12.5, color: C.mutedFg, marginTop: 5, fontWeight: 600 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ ...card, padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.mutedFg, textTransform: "uppercase", marginBottom: 12 }}>Severity breakdown</div>
                    {sev.map(([label, count, c], i) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 9 }}>
                        <span style={{ width: 66, fontSize: 12, fontWeight: 700, color: c, textTransform: "capitalize" }}>{label}</span>
                        <div style={{ flex: 1, height: 8, background: C.muted, borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${(count ? 33 : 0) * clamp((lt - 1.3) / 0.6, 0, 1)}%`, background: c, borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 13, color: C.mutedFg, width: 14, textAlign: "right", fontFamily: C.mono }}>{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ ...card, flex: 1, padding: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px 10px" }}>
                    <Icon name="alert" size={15} color={C.red} /><span style={{ fontSize: 13, fontWeight: 700 }}>Breaking changes</span>
                  </div>
                  {breaking.map((b, i) => {
                    const o = clamp((lt - 1.5 - i * 0.16) / 0.4, 0, 1);
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderTop: `1px solid ${C.border}`, opacity: o, transform: `translateY(${(1 - o) * 10}px)` }}>
                        <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 800, color: C.red, width: 38 }}>{b.m}</span>
                        <span style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 600 }}>{b.p}</span>
                        <span style={{ fontSize: 13.5, color: C.mutedFg, flex: 1 }}>{b.d}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: "#fff", background: sc[b.s], padding: "3px 9px", borderRadius: 999 }}>{b.s}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      }}
    </FeatureWrap>
  );
}

// ── SCAFFOLD ────────────────────────────────────────────────────────────
function ScaffoldScene({ t }) {
  return (
    <FeatureWrap feat="scaffold" t={t}>
      {(lt) => {
        const files = [
          { f: "middleware/rate_limit.py", tag: "new" },
          { f: "config/limits.yaml", tag: "new" },
          { f: "payment_service.py", tag: "edit" },
          { f: "tests/test_rate_limit.py", tag: "new" },
        ];
        const code = "@rate_limit(requests=100, window=\"1m\")\nasync def create_charge(payload: ChargeIn):\n    await ledger.reserve(payload.amount)\n    return await stripe.charge(payload)";
        const cps = 46, typeStart = 1.7;
        const shown = lt > typeStart ? code.slice(0, Math.floor((lt - typeStart) * cps)) : "";
        return (
          <div style={{ position: "absolute", inset: 0 }}>
            <PanelHeader icon="sparkles" title="AI Architecture Scaffold" accent={C.red} />
            {/* prompt */}
            <div style={{ ...card, padding: "16px 20px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12, opacity: reveal(lt, 0.05) }}>
              <Icon name="sparkles" size={20} color={C.red} sw={2} />
              <span style={{ fontSize: 18, fontWeight: 600 }}>Add rate limiting to the payments API</span>
              <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 700, color: "#fff", background: C.red, padding: "7px 16px", borderRadius: 7 }}>Generate</span>
            </div>
            <div style={{ display: "flex", gap: 18 }}>
              {/* plan / files */}
              <div style={{ width: 420, ...card, padding: 18, opacity: reveal(lt, 0.5) }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: C.mutedFg, textTransform: "uppercase", marginBottom: 14 }}>Generated plan</div>
                {files.map((f, i) => {
                  const o = clamp((lt - 0.7 - i * 0.22) / 0.4, 0, 1);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 12px", borderRadius: 8, background: i % 2 ? "transparent" : C.muted, opacity: o, transform: `translateX(${(1 - o) * 14}px)`, marginBottom: 4 }}>
                      <Icon name={f.tag === "new" ? "plus" : "compare"} size={15} color={f.tag === "new" ? C.green : "#e07b00"} sw={2.2} />
                      <span style={{ fontFamily: C.mono, fontSize: 14.5, fontWeight: 600, flex: 1 }}>{f.f}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", color: f.tag === "new" ? C.green : "#e07b00", border: `1px solid ${f.tag === "new" ? C.green : "#e07b00"}`, padding: "2px 8px", borderRadius: 999 }}>{f.tag}</span>
                    </div>
                  );
                })}
              </div>
              {/* code */}
              <div style={{ flex: 1, ...card, padding: 0, overflow: "hidden", opacity: reveal(lt, 1.4) }}>
                <div style={{ padding: "11px 16px", borderBottom: `1px solid ${C.border}`, background: C.muted, display: "flex", alignItems: "center", gap: 8, fontFamily: C.mono, fontSize: 13, fontWeight: 700 }}>
                  <span style={{ display: "flex", gap: 6 }}>
                    <span style={{ width: 11, height: 11, borderRadius: "50%", background: C.red }} />
                    <span style={{ width: 11, height: 11, borderRadius: "50%", background: C.amber }} />
                    <span style={{ width: 11, height: 11, borderRadius: "50%", background: C.green }} />
                  </span>
                  middleware/rate_limit.py
                </div>
                <div style={{ padding: 20, fontFamily: C.mono, fontSize: 15, lineHeight: 1.75, whiteSpace: "pre-wrap", minHeight: 200 }}>
                  {colorCode(shown)}
                  {shown.length < code.length && lt > typeStart && <span style={{ display: "inline-block", width: 8, height: 18, background: C.red, transform: "translateY(3px)", opacity: Math.sin(lt * 8) > 0 ? 1 : 0.2 }} />}
                </div>
              </div>
            </div>
          </div>
        );
      }}
    </FeatureWrap>
  );
}
function colorCode(text) {
  const lines = text.split("\n");
  return lines.map((ln, i) => {
    let el;
    if (ln.trim().startsWith("@")) el = <span style={{ color: C.red, fontWeight: 700 }}>{ln}</span>;
    else if (ln.includes("async def")) el = <span><span style={{ color: C.brown, fontWeight: 700 }}>async def </span><span style={{ color: C.blue, fontWeight: 700 }}>{ln.replace("async def ", "")}</span></span>;
    else if (ln.trim().startsWith("return") || ln.includes("await")) el = <span style={{ color: C.fg }}>{ln.replace(/(await|return)/g, "→§$1§").split("§").map((s, j) => s === "await" || s === "return" ? <span key={j} style={{ color: C.red, fontWeight: 700 }}>{s}</span> : <span key={j}>{s.replace("→", "")}</span>)}</span>;
    else el = <span>{ln}</span>;
    return <div key={i}>{el}</div>;
  });
}

// ════════════════════════════════════════════════════════════════════════
// CAPTIONS (rendered above tour, timed to features)
// ════════════════════════════════════════════════════════════════════════
function Captions() {
  const caps = [
    { feat: "ingest", i: 1, title: "Point it at any GitHub repo", sub: "Cortex clones, parses and builds a full knowledge graph in seconds.", accent: C.fg },
    { feat: "graph", i: 2, title: "A living map of your code", sub: "Services, schemas, files and APIs — every dependency, visualized.", accent: C.red },
    { feat: "chat", i: 3, title: "Ask anything, grounded in truth", sub: "RAG answers cite the exact files and lines they came from.", accent: C.fg },
    { feat: "whatif", i: 4, title: "See the blast radius before you ship", sub: "Pick a change and Cortex traces every node it could break.", accent: C.red },
    { feat: "spec", i: 5, title: "Catch breaking API changes", sub: "Diff OpenAPI specs and surface breaking changes by severity.", accent: C.red },
    { feat: "scaffold", i: 6, title: "Scaffold features with AI", sub: "Describe the change — get a graph-aware plan and code.", accent: C.red },
  ];
  return (
    <>
      {caps.map((c) => {
        const { start, end } = FEAT[c.feat];
        return (
          <Sprite key={c.feat} start={start + 0.1} end={end - 0.05}>
            {({ localTime, duration }) => <Caption index={c.i} total={6} title={c.title} sub={c.sub} localTime={localTime} duration={duration} accent={c.accent} />}
          </Sprite>
        );
      })}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════
// SCENE — OUTRO
// ════════════════════════════════════════════════════════════════════════
function OutroScene() {
  return (
    <Sprite start={41.9} end={46}>
      {({ localTime }) => {
        const logoIn = Easing.easeOutBack(clamp(localTime / 0.6, 0, 1));
        return (
          <div style={{ position: "absolute", inset: 0, background: C.fg, fontFamily: C.font, color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", inset: 0, opacity: 0.5, backgroundImage: "linear-gradient(rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.05) 1px,transparent 1px)", backgroundSize: "34px 34px" }} />
            <div style={{ width: 100, height: 100, borderRadius: 24, background: C.red, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${logoIn})`, boxShadow: "0 0 0 10px rgba(220,0,0,0.16),0 20px 50px rgba(220,0,0,0.4)" }}>
              <Icon name="network" size={56} color="#fff" sw={1.9} />
            </div>
            <div style={{ fontSize: 88, fontWeight: 800, letterSpacing: "-0.04em", marginTop: 30, opacity: reveal(localTime, 0.4), transform: `translateY(${(1 - reveal(localTime, 0.4)) * 16}px)` }}>Cortex</div>
            <div style={{ fontSize: 26, color: "rgba(255,255,255,0.7)", fontWeight: 500, marginTop: 8, opacity: reveal(localTime, 0.7) }}>Understand any codebase. Instantly.</div>
            <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 11, padding: "16px 30px", borderRadius: 999, background: C.red, fontSize: 19, fontWeight: 700, opacity: reveal(localTime, 1.1), transform: `scale(${0.9 + 0.1 * reveal(localTime, 1.1)})`, boxShadow: "0 14px 40px rgba(220,0,0,0.4)" }}>
              Pick a repo to get started <Icon name="arrow" size={20} color="#fff" sw={2.2} />
            </div>
          </div>
        );
      }}
    </Sprite>
  );
}

// ════════════════════════════════════════════════════════════════════════
function CortexVideo() {
  return (
    <Stage width={W} height={H} duration={46} background={C.bg} persistKey="cortexvid" fps={60}>
      <WelcomeScene />
      <ProblemScene />
      <AppTour />
      <Captions />
      <OutroScene />
    </Stage>
  );
}

window.CortexVideo = CortexVideo;
