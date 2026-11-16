import test from "node:test";
import assert from "node:assert/strict";

import {
  HUMANIZE_PRESETS,
  Humanizer,
  humanizerFromEnv,
  keyForCharacter,
  mousePath,
  seededRandom,
  typeLikeHuman,
} from "../dist/src/humanize.js";
import { clickInPage, fillInPage } from "../dist/src/driver/page-actions.js";
import { PageKeyboardController as PageKeyboard } from "../dist/src/driver/page-keyboard.js";
import { RefMap } from "../dist/src/ref-map.js";

const config = HUMANIZE_PRESETS.default;
const humanizer = (seed = 7) => new Humanizer(config, seededRandom(seed));

test("KAMI_HUMANIZE selects the pace; off disables it", () => {
  assert.equal(humanizerFromEnv({ KAMI_HUMANIZE: "off" }), null);
  assert.equal(humanizerFromEnv({}).config, HUMANIZE_PRESETS.default);
  assert.equal(
    humanizerFromEnv({ KAMI_HUMANIZE: "careful" }).config,
    HUMANIZE_PRESETS.careful,
  );
  const a = humanizerFromEnv({ KAMI_HUMANIZE_SEED: "5" });
  const b = humanizerFromEnv({ KAMI_HUMANIZE_SEED: "5" });
  assert.deepEqual(
    [a.clickOffset(), a.ms([0, 100])],
    [b.clickOffset(), b.ms([0, 100])],
  );
});

test("the pointer path is curved and ends exactly on the target", () => {
  const random = seededRandom(1);
  for (let i = 0; i < 50; i += 1) {
    const from = { x: random() * 1000, y: random() * 800 };
    const to = { x: random() * 1000, y: random() * 800 };
    const path = mousePath(from, to, config, random);
    assert.deepEqual(path.at(-1), to);
    if (Math.hypot(to.x - from.x, to.y - from.y) >= 1) {
      assert.ok(path.length >= config.moveMinSteps);
      assert.ok(path.length <= config.moveMaxSteps);
    }
  }
  const straight = mousePath(
    { x: 0, y: 0 },
    { x: 600, y: 0 },
    config,
    seededRandom(3),
  );
  assert.ok(
    straight.some((point) => Math.abs(point.y) > 2),
    "not a straight line",
  );
});

test("click offsets stay in the middle of the box", () => {
  const human = humanizer();
  for (let i = 0; i < 200; i += 1) {
    const { fx, fy } = human.clickOffset();
    for (const f of [fx, fy]) {
      assert.ok(
        f >= 0.5 - config.clickZone / 2 && f <= 0.5 + config.clickZone / 2,
      );
    }
  }
});

test("US keyboard mapping for key-by-key typing", () => {
  assert.deepEqual(keyForCharacter("a"), {
    key: "a",
    code: "KeyA",
    vk: 65,
    text: "a",
    shift: false,
  });
  assert.deepEqual(keyForCharacter("Q"), {
    key: "Q",
    code: "KeyQ",
    vk: 81,
    text: "Q",
    shift: true,
  });
  assert.deepEqual(keyForCharacter("@"), {
    key: "@",
    code: "Digit2",
    vk: 50,
    text: "@",
    shift: true,
  });
  assert.deepEqual(keyForCharacter("?"), {
    key: "?",
    code: "Slash",
    vk: 191,
    text: "?",
    shift: true,
  });
  assert.equal(keyForCharacter("中"), null);
});

function recordingServices(respond = () => ({})) {
  const calls = [];
  const slept = [];
  return {
    calls,
    slept,
    async cdp(method, params = {}, sessionId) {
      calls.push([method, params, sessionId]);
      return respond(method, params) ?? {};
    },
    async sleep(ms) {
      slept.push(ms);
    },
    async showAgentMousePosition() {},
    async showAgentTaskState() {},
  };
}

const keyEvents = (calls) =>
  calls
    .filter(
      ([method]) =>
        method === "Input.dispatchKeyEvent" || method === "Input.insertText",
    )
    .map(([method, params]) =>
      method === "Input.insertText"
        ? `text:${params.text}`
        : `${params.type}:${params.key}`,
    );

test("typeLikeHuman: one key per character, Shift held across capitals, IME text via insertText", async () => {
  const services = recordingServices();
  await typeLikeHuman(services, humanizer(), "s1", "AB c中\n!");
  assert.deepEqual(keyEvents(services.calls), [
    "rawKeyDown:Shift",
    "keyDown:A",
    "keyUp:A",
    "keyDown:B",
    "keyUp:B",
    "keyUp:Shift",
    "keyDown: ",
    "keyUp: ",
    "keyDown:c",
    "keyUp:c",
    "text:中",
    "text:\n",
    "rawKeyDown:Shift",
    "keyDown:!",
    "keyUp:!",
    "keyUp:Shift",
  ]);
  assert.equal(services.calls[1][1].modifiers, 8);
  assert.ok(services.slept.length >= 8);
});

test("typeLikeHuman inserts long text at once, like a paste", async () => {
  const services = recordingServices();
  await typeLikeHuman(
    services,
    humanizer(),
    "s1",
    "x".repeat(config.humanTypeMax + 1),
  );
  assert.deepEqual(
    services.calls.map(([method]) => method),
    ["Input.insertText"],
  );
});

function clickServices(human) {
  const services = recordingServices((method, params) => {
    if (method === "Runtime.evaluate") {
      return params.returnByValue === false
        ? { result: { objectId: "button-1" } }
        : { result: { value: 1 } };
    }
    if (method === "Runtime.callFunctionOn") {
      const value = params.functionDeclaration.includes("setTimeout(finish")
        ? { x: 400, y: 300 }
        : { ok: true };
      return { result: { value } };
    }
  });
  services.humanize = human;
  return services;
}

test("humanized page.click travels to a jittered point, aims, and holds the button", async () => {
  const human = humanizer(11);
  human.setCursor("session:page", { x: 40, y: 50 });
  const services = clickServices(human);

  await clickInPage(services, "session:page", new RefMap(), "#button");

  const pointCall = services.calls.find(
    ([method, params]) =>
      method === "Runtime.callFunctionOn" &&
      params.functionDeclaration.includes("setTimeout(finish"),
  );
  assert.match(pointCall[1].functionDeclaration, /jitter\.fx/);
  assert.equal(pointCall[1].arguments.length, 1);
  assert.ok("fx" in pointCall[1].arguments[0].value);

  const mouse = services.calls
    .filter(([method]) => method === "Input.dispatchMouseEvent")
    .map(([, p]) => p);
  const types = mouse.map((p) => p.type);
  assert.deepEqual(types.slice(-2), ["mousePressed", "mouseReleased"]);
  const moves = mouse.filter((p) => p.type === "mouseMoved");
  assert.ok(moves.length >= config.moveMinSteps, `${moves.length} moves`);
  assert.deepEqual([moves.at(-1).x, moves.at(-1).y], [400, 300]);
  assert.ok(
    Math.hypot(moves[0].x - 40, moves[0].y - 50) < 80,
    "starts near the last position",
  );
  const [aim, hold] = services.slept.slice(-2);
  assert.ok(aim >= config.aimMs[0] && aim <= config.aimMs[1], `aim ${aim}`);
  assert.ok(
    hold >= config.holdMs[0] && hold <= config.holdMs[1],
    `hold ${hold}`,
  );
  assert.deepEqual(human.cursor("session:page"), { x: 400, y: 300 });
});

test("an explicit position is clicked exactly, still with travel and hold", async () => {
  const services = clickServices(humanizer());
  await clickInPage(services, "session:page", new RefMap(), "#button", {
    position: { x: 3, y: 4 },
  });
  const pointCall = services.calls.find(
    ([method, params]) =>
      method === "Runtime.callFunctionOn" &&
      params.functionDeclaration.includes("setTimeout(finish"),
  );
  assert.doesNotMatch(pointCall[1].functionDeclaration, /jitter\.fx/);
  assert.deepEqual(pointCall[1].arguments, [{ value: { x: 3, y: 4 } }]);
  assert.ok(
    services.calls.filter(([, p]) => p.type === "mouseMoved").length > 1,
  );
});

test("humanized page.fill clicks into a text field and types key by key", async () => {
  let value = "old";
  const services = recordingServices((method, params) => {
    if (method === "Runtime.evaluate") {
      return params.returnByValue === false
        ? { result: { objectId: "field-1" } }
        : { result: { value: 1 } };
    }
    if (method === "Input.dispatchKeyEvent" && params.type === "keyDown")
      value += params.text;
    if (method !== "Runtime.callFunctionOn") return;
    const source = params.functionDeclaration;
    if (source.includes("resolveFillTargetForAction"))
      return { result: { objectId: "field-1" } };
    if (source.includes("isTextFillTarget")) return { result: { value: true } };
    if (source.includes("fillPreparation")) {
      value = "";
      return {
        result: {
          value: {
            status: "needsinput",
            kind: "input",
            cursorPoint: { x: 200, y: 100 },
            before: "old",
          },
        },
      };
    }
    if (source.includes("readFilledValue"))
      return { result: { value: { actual: value, type: "text" } } };
    if (
      source.includes("setTimeout(finish") ||
      source.includes("async function")
    ) {
      return { result: { value: { x: 200, y: 100 } } };
    }
    return { result: { value: { ok: true } } };
  });
  services.humanize = humanizer(3);

  await fillInPage(services, "session:page", new RefMap(), "#q", "Hi!");

  const methods = services.calls.map(([method, params]) =>
    method === "Input.dispatchMouseEvent" ? params.type : method,
  );
  const pressed = methods.indexOf("mousePressed");
  const firstKey = methods.indexOf("Input.dispatchKeyEvent");
  assert.ok(
    pressed > 0 && pressed < firstKey,
    "clicks into the field before typing",
  );
  assert.ok(
    !methods.includes("Input.insertText"),
    "no insertText when typing is accepted",
  );
  assert.deepEqual(keyEvents(services.calls), [
    "rawKeyDown:Shift",
    "keyDown:H",
    "keyUp:H",
    "keyUp:Shift",
    "keyDown:i",
    "keyUp:i",
    "rawKeyDown:Shift",
    "keyDown:!",
    "keyUp:!",
    "keyUp:Shift",
  ]);
  assert.equal(value, "Hi!");

  // Appending keeps the caret where focus put it: no click, plain insertText.
  services.calls.length = 0;
  await fillInPage(services, "session:page", new RefMap(), "#q", "?", {
    clearFirst: false,
  });
  assert.ok(
    !services.calls.some(([, params]) => params.type === "mousePressed"),
  );
  assert.ok(services.calls.some(([method]) => method === "Input.insertText"));
});

function replacedFieldServices(replacementValue) {
  // The field is swapped for a new focused input while keys are typed, as
  // Wikipedia's Vector 2022 search does. The injected read-back runs for real
  // against a detached original whose document focuses the replacement.
  const replacement = {
    nodeName: "INPUT",
    type: "search",
    isConnected: true,
    value: replacementValue,
  };
  const original = {
    nodeName: "INPUT",
    type: "search",
    isConnected: true,
    value: "",
    ownerDocument: { activeElement: replacement },
  };
  const services = recordingServices((method, params) => {
    if (method === "Runtime.evaluate") {
      return params.returnByValue === false
        ? { result: { objectId: "field-1" } }
        : { result: { value: 1 } };
    }
    if (method === "Input.dispatchKeyEvent" && params.type === "keyDown")
      original.isConnected = false;
    if (method !== "Runtime.callFunctionOn") return;
    const source = params.functionDeclaration;
    if (source.includes("resolveFillTargetForAction"))
      return { result: { objectId: "field-1" } };
    if (source.includes("isTextFillTarget")) return { result: { value: true } };
    if (source.includes("fillPreparation")) {
      return {
        result: {
          value: {
            status: "needsinput",
            kind: "input",
            cursorPoint: { x: 200, y: 100 },
            before: "",
          },
        },
      };
    }
    if (source.includes("readFilledValue")) {
      const read = new Function(`return (${source})`)();
      return { result: { value: read.call(original) } };
    }
    if (
      source.includes("setTimeout(finish") ||
      source.includes("async function")
    ) {
      return { result: { value: { x: 200, y: 100 } } };
    }
    return { result: { value: { ok: true } } };
  });
  services.humanize = humanizer(3);
  return services;
}

test("page.fill verifies the focused field that replaced a detached one", async () => {
  const services = replacedFieldServices("Hi!");
  await fillInPage(services, "session:page", new RefMap(), "#q", "Hi!");
});

test("page.fill does not retype into a replacement that lost the text", async () => {
  const services = replacedFieldServices("");
  await assert.rejects(
    () => fillInPage(services, "session:page", new RefMap(), "#q", "Hi!"),
    /the page replaced the field during input/,
  );
  assert.ok(
    !services.calls.some(([method]) => method === "Input.insertText"),
    "no second input after the field was replaced",
  );
});

test("humanized page.keyboard.type presses Shift itself and paces keys", async () => {
  const services = recordingServices();
  services.humanize = humanizer();
  const keyboard = new PageKeyboard(services, (operation) => operation("s1"));
  await keyboard.type("aB!");
  assert.deepEqual(keyEvents(services.calls), [
    "keyDown:a",
    "keyUp:a",
    "rawKeyDown:Shift",
    "keyDown:B",
    "keyUp:B",
    "keyDown:!",
    "keyUp:!",
    "keyUp:Shift",
  ]);
  assert.ok(services.slept.length >= 6 && services.slept.every((ms) => ms > 0));
  assert.equal(keyboard.modifierMask(), 0, "Shift released");

  const direct = recordingServices();
  direct.humanize = humanizer();
  await new PageKeyboard(direct, (operation) => operation("s1")).type("aB", {
    delay: 5,
  });
  assert.deepEqual(
    keyEvents(direct.calls),
    ["keyDown:a", "keyUp:a", "keyDown:B", "keyUp:B"],
    "an explicit delay keeps direct typing",
  );
});

test("a slow move ack ends the path and later approaches skip it for a while", async () => {
  const human = humanizer();
  human.setCursor("s1", { x: 0, y: 0 });
  let moves = 0;
  const slow = {
    async cdp() {
      moves += 1;
      await new Promise((resolve) => setTimeout(resolve, 170));
      return {};
    },
    async sleep() {},
  };
  await human.approach(slow, "s1", { x: 600, y: 400 });
  assert.equal(moves, 1, "stopped after the first slow ack");
  assert.deepEqual(human.cursor("s1"), { x: 600, y: 400 });
  await human.approach(slow, "s1", { x: 10, y: 10 });
  assert.equal(moves, 1, "skipped while the window is slow");
  assert.deepEqual(human.cursor("s1"), { x: 10, y: 10 });

  const fast = recordingServices();
  await human.approach(fast, "s2", { x: 600, y: 400 });
  assert.ok(
    fast.calls.length >= config.moveMinSteps - 1,
    "other pages keep the full path",
  );
});
