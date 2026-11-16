/**
 * Human-like pacing for Page input. Every event stays a real CDP input event;
 * this module only chooses the path, timing and order a person's pointer and
 * keyboard would produce:
 *   - pointer: travels from where it last was along a curved path with small
 *     jitter and occasional overshoot, aims briefly, holds the button;
 *   - click point: a random spot in the middle of the element (still
 *     hit-tested), not its exact centre;
 *   - keyboard: uneven key spacing and hold times, a real Shift for shifted
 *     characters;
 *   - wheel: uneven gaps between wheel steps.
 *
 * KAMI_HUMANIZE=default|careful|off selects the pace (default: default);
 * KAMI_HUMANIZE_SEED=<integer> replays the same random choices.
 * The same model is used by the KamiBrowser MCP server (kami/mcp/humanize.mjs).
 */

export type Range = [number, number];

export type HumanizeConfig = {
  moveStepPx: number;
  moveMinSteps: number;
  moveMaxSteps: number;
  moveStepMs: Range;
  curve: number;
  jitterPx: number;
  overshootChance: number;
  overshootPx: Range;
  aimMs: Range;
  holdMs: Range;
  afterClickMs: Range;
  clickZone: number;
  keyMs: Range;
  keyHoldMs: Range;
  pauseChance: number;
  pauseMs: Range;
  shiftMs: Range;
  humanTypeMax: number;
  wheelMs: Range;
};

export const HUMANIZE_PRESETS: Record<"default" | "careful", HumanizeConfig> = {
  default: {
    moveStepPx: 18,
    moveMinSteps: 8,
    moveMaxSteps: 40,
    moveStepMs: [7, 14],
    curve: 0.18,
    jitterPx: 1.2,
    overshootChance: 0.2,
    overshootPx: [4, 12],
    aimMs: [70, 180],
    holdMs: [55, 120],
    afterClickMs: [40, 110],
    clickZone: 0.55,
    keyMs: [45, 135],
    keyHoldMs: [25, 75],
    pauseChance: 0.04,
    pauseMs: [180, 450],
    shiftMs: [25, 60],
    humanTypeMax: 300,
    wheelMs: [14, 40],
  },
  careful: {
    moveStepPx: 14,
    moveMinSteps: 12,
    moveMaxSteps: 60,
    moveStepMs: [9, 18],
    curve: 0.22,
    jitterPx: 1.5,
    overshootChance: 0.3,
    overshootPx: [5, 14],
    aimMs: [140, 320],
    holdMs: [70, 150],
    afterClickMs: [80, 200],
    clickZone: 0.5,
    keyMs: [80, 210],
    keyHoldMs: [35, 95],
    pauseChance: 0.07,
    pauseMs: [250, 700],
    shiftMs: [35, 80],
    humanTypeMax: 300,
    wheelMs: [25, 60],
  },
};

export type Random = (() => number) & {
  range(range: Range): number;
  centered(): number;
};

/** mulberry32: a small seeded PRNG so tests can replay a sequence. */
export function seededRandom(
  seed = Math.floor(Math.random() * 2 ** 32),
): Random {
  let state = seed >>> 0;
  const next = (() => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Random;
  next.range = ([low, high]) => low + (high - low) * next();
  // Roughly normal in (-1, 1): the mean of three uniforms.
  next.centered = () => (next() + next() + next()) / 1.5 - 1;
  return next;
}

type Point = { x: number; y: number };

const round = (value: number) => Math.round(value * 100) / 100;
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** Points along a cubic Bezier from `from` to `to`, ending exactly on `to`. */
export function mousePath(
  from: Point,
  to: Point,
  config: HumanizeConfig,
  random: Random,
): Point[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) return [{ x: round(to.x), y: round(to.y) }];
  const steps = Math.max(
    config.moveMinSteps,
    Math.min(config.moveMaxSteps, Math.round(distance / config.moveStepPx)),
  );
  const nx = -dy / distance;
  const ny = dx / distance;
  const bend = () => random.centered() * distance * config.curve;
  const c1 = {
    x: from.x + dx * 0.3 + nx * bend(),
    y: from.y + dy * 0.3 + ny * bend(),
  };
  const c2 = {
    x: from.x + dx * 0.7 + nx * bend(),
    y: from.y + dy * 0.7 + ny * bend(),
  };
  const points: Point[] = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = easeInOut(i / steps);
    const u = 1 - t;
    let x =
      u ** 3 * from.x +
      3 * u * u * t * c1.x +
      3 * u * t * t * c2.x +
      t ** 3 * to.x;
    let y =
      u ** 3 * from.y +
      3 * u * u * t * c1.y +
      3 * u * t * t * c2.y +
      t ** 3 * to.y;
    if (i < steps) {
      x += random.centered() * config.jitterPx;
      y += random.centered() * config.jitterPx;
    }
    points.push({ x: round(x), y: round(y) });
  }
  points[points.length - 1] = { x: to.x, y: to.y };
  return points;
}

// A move ack slower than this means the window is not rendering promptly.
const SLOW_ACK_MS = 150;
const SLOW_WINDOW_MS = 5_000;
const now = () => performance.now();

type MoveServices = {
  cdp(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string,
    timeoutMs?: number,
  ): Promise<any>;
  sleep(ms: number): Promise<void>;
};

/** Per-SDK-process pacing state; the pointer position is kept per page session. */
export class Humanizer {
  readonly config: HumanizeConfig;
  readonly random: Random;
  readonly #cursors = new Map<string, Point>();
  readonly #slowUntil = new Map<string, number>();

  constructor(config: HumanizeConfig, random: Random = seededRandom()) {
    this.config = config;
    this.random = random;
  }

  /** Milliseconds drawn from a range. */
  ms(range: Range): number {
    return Math.round(this.random.range(range));
  }

  wait(services: { sleep(ms: number): Promise<void> }, range: Range) {
    return services.sleep(this.ms(range));
  }

  /** Fractions of the element box for a click point near its middle. */
  clickOffset(): { fx: number; fy: number } {
    const half = this.config.clickZone / 2;
    return {
      fx: round(0.5 + this.random.centered() * half),
      fy: round(0.5 + this.random.centered() * half),
    };
  }

  cursor(sessionId: string): Point {
    let cursor = this.#cursors.get(sessionId);
    if (!cursor) {
      // The page has never seen this pointer: start somewhere plausible.
      cursor = {
        x: round(this.random.range([360, 840])),
        y: round(this.random.range([200, 480])),
      };
      this.#cursors.set(sessionId, cursor);
    }
    return cursor;
  }

  setCursor(sessionId: string, point: Point): void {
    if (Number.isFinite(point?.x) && Number.isFinite(point?.y)) {
      this.#cursors.set(sessionId, { x: point.x, y: point.y });
    }
  }

  /**
   * Move the pointer toward `target`, stopping one step short: the caller
   * sends the final move itself (with its own checks and cursor overlay).
   *
   * Chromium acknowledges a move once the page has rendered it. In an occluded
   * or background Space that takes about a second per move, and the SDK's CDP
   * relay delivers them one at a time, so a full path would cost seconds.
   * Nobody sees the pointer there and the page receives coalesced moves
   * anyway, so a slow ack ends the path and later actions skip it until
   * SLOW_WINDOW_MS has passed; a responsive window gets the whole path.
   */
  async approach(
    services: MoveServices,
    sessionId: string,
    target: Point,
    state: { buttons?: number; modifiers?: number } = {},
  ): Promise<void> {
    const from = this.cursor(sessionId);
    this.setCursor(sessionId, target);
    if (now() < (this.#slowUntil.get(sessionId) ?? 0)) return;
    const c = this.config;
    let path = mousePath(from, target, c, this.random);
    if (
      Math.hypot(target.x - from.x, target.y - from.y) > 120 &&
      this.random() < c.overshootChance
    ) {
      const angle = Math.atan2(target.y - from.y, target.x - from.x);
      const over = this.random.range(c.overshootPx);
      const beyond = {
        x: target.x + Math.cos(angle) * over,
        y: target.y + Math.sin(angle) * over,
      };
      path = [
        ...mousePath(from, beyond, c, this.random),
        ...mousePath(
          beyond,
          target,
          { ...c, moveMinSteps: 3, moveMaxSteps: 6 },
          this.random,
        ),
      ];
    }
    for (const point of path.slice(0, -1)) {
      const started = now();
      await services.cdp(
        "Input.dispatchMouseEvent",
        {
          type: "mouseMoved",
          x: point.x,
          y: point.y,
          button: "none",
          buttons: state.buttons ?? 0,
          modifiers: state.modifiers ?? 0,
        },
        sessionId,
      );
      const elapsed = now() - started;
      if (elapsed > SLOW_ACK_MS) {
        this.#slowUntil.set(sessionId, now() + SLOW_WINDOW_MS);
        return;
      }
      const gap = this.ms(c.moveStepMs) - elapsed;
      if (gap > 0) await services.sleep(Math.round(gap));
    }
  }

  /** Delay before the next character, with an occasional longer pause. */
  keyGap(): number {
    return this.ms(
      this.random() < this.config.pauseChance
        ? this.config.pauseMs
        : this.config.keyMs,
    );
  }
}

export function humanizeConfigFrom(value: unknown): HumanizeConfig | null {
  const name = String(value ?? "default").toLowerCase();
  if (name === "off" || name === "0" || name === "false") return null;
  return (
    HUMANIZE_PRESETS[name as "default" | "careful"] ?? HUMANIZE_PRESETS.default
  );
}

export function humanizerFromEnv(
  env: Record<string, string | undefined> = process.env,
): Humanizer | null {
  const config = humanizeConfigFrom(env.KAMI_HUMANIZE);
  if (!config) return null;
  const seed = env.KAMI_HUMANIZE_SEED;
  return new Humanizer(
    config,
    seed && /^[0-9]+$/.test(seed) ? seededRandom(Number(seed)) : seededRandom(),
  );
}

type KeySpec = {
  key: string;
  code: string;
  vk: number;
  text: string;
  shift: boolean;
};

// US layout for the characters fill types key by key; others use insertText.
const SHIFTED: Record<string, string> = {
  "!": "1",
  "@": "2",
  "#": "3",
  $: "4",
  "%": "5",
  "^": "6",
  "&": "7",
  "*": "8",
  "(": "9",
  ")": "0",
  _: "-",
  "+": "=",
  "{": "[",
  "}": "]",
  "|": "\\",
  ":": ";",
  '"': "'",
  "<": ",",
  ">": ".",
  "?": "/",
  "~": "`",
};
const PUNCTUATION: Record<string, [string, number]> = {
  "-": ["Minus", 189],
  "=": ["Equal", 187],
  "[": ["BracketLeft", 219],
  "]": ["BracketRight", 221],
  "\\": ["Backslash", 220],
  ";": ["Semicolon", 186],
  "'": ["Quote", 222],
  ",": ["Comma", 188],
  ".": ["Period", 190],
  "/": ["Slash", 191],
  "`": ["Backquote", 192],
};

export function keyForCharacter(char: string): KeySpec | null {
  if (char === " ")
    return { key: " ", code: "Space", vk: 32, text: " ", shift: false };
  if (/^[a-z]$/.test(char)) {
    const upper = char.toUpperCase();
    return {
      key: char,
      code: `Key${upper}`,
      vk: upper.charCodeAt(0),
      text: char,
      shift: false,
    };
  }
  if (/^[A-Z]$/.test(char)) {
    return {
      key: char,
      code: `Key${char}`,
      vk: char.charCodeAt(0),
      text: char,
      shift: true,
    };
  }
  if (/^[0-9]$/.test(char)) {
    return {
      key: char,
      code: `Digit${char}`,
      vk: char.charCodeAt(0),
      text: char,
      shift: false,
    };
  }
  const base = SHIFTED[char];
  if (base) {
    const [code, vk] = /^[0-9]$/.test(base)
      ? [`Digit${base}`, base.charCodeAt(0)]
      : PUNCTUATION[base];
    return { key: char, code, vk, text: char, shift: true };
  }
  const punctuation = PUNCTUATION[char];
  if (punctuation) {
    return {
      key: char,
      code: punctuation[0],
      vk: punctuation[1],
      text: char,
      shift: false,
    };
  }
  return null;
}

const SHIFT_KEY = {
  key: "Shift",
  code: "ShiftLeft",
  windowsVirtualKeyCode: 16,
};
const SHIFT_MODIFIER = 8;

/**
 * Type into the focused element one key per character. Text outside a US
 * keyboard and newlines go through insertText, as an IME commit or paste
 * would; text longer than `humanTypeMax` is inserted at once, like a paste.
 */
export async function typeLikeHuman(
  services: MoveServices,
  humanizer: Humanizer,
  sessionId: string,
  text: string,
): Promise<void> {
  const key = (params: Record<string, unknown>) =>
    services.cdp("Input.dispatchKeyEvent", params, sessionId);
  if ([...text].length > humanizer.config.humanTypeMax) {
    await services.cdp("Input.insertText", { text }, sessionId);
    return;
  }
  let shiftHeld = false;
  const releaseShift = async () => {
    if (!shiftHeld) return;
    shiftHeld = false;
    await key({ type: "keyUp", ...SHIFT_KEY, modifiers: 0 });
    await humanizer.wait(services, humanizer.config.shiftMs);
  };
  try {
    for (const char of text) {
      const spec =
        char === "\n" || char === "\r" ? null : keyForCharacter(char);
      if (spec?.shift && !shiftHeld) {
        await key({
          type: "rawKeyDown",
          ...SHIFT_KEY,
          modifiers: SHIFT_MODIFIER,
        });
        shiftHeld = true;
        await humanizer.wait(services, humanizer.config.shiftMs);
      } else if (!spec?.shift) {
        await releaseShift();
      }
      if (spec) {
        const base = {
          key: spec.key,
          code: spec.code,
          windowsVirtualKeyCode: spec.vk,
          modifiers: spec.shift ? SHIFT_MODIFIER : 0,
        };
        await key({
          type: "keyDown",
          ...base,
          text: spec.text,
          unmodifiedText: spec.text,
        });
        await humanizer.wait(services, humanizer.config.keyHoldMs);
        await key({ type: "keyUp", ...base });
      } else {
        await services.cdp("Input.insertText", { text: char }, sessionId);
      }
      await services.sleep(humanizer.keyGap());
    }
    await releaseShift();
  } finally {
    // After a failure, still try not to leave Shift held for later input.
    if (shiftHeld) await releaseShift().catch(() => {});
  }
}
