import test from "node:test";
import assert from "node:assert/strict";

import {
  STALE_SKILL_PREFIX,
  createStaleKamiBrowserGuard,
  installStaleKamiBrowserGuard,
} from "../dist/src/skill-migration.js";

test("the 1.3 kamiBrowser namespace stops with current API guidance", () => {
  const kamiBrowser = createStaleKamiBrowserGuard();

  for (const method of ["newTaskSpace", "switchTaskSpace", "helper", "site"]) {
    assert.throws(
      () => kamiBrowser[method],
      (error) => {
        assert.equal(error.name, "KamiBrowserSkillStaleError");
        assert.ok(error.message.startsWith(STALE_SKILL_PREFIX));
        assert.match(error.message, new RegExp(`kamiBrowser\\.${method}`));
        assert.match(error.message, /Run `kami-browser skill`/);
        assert.match(error.message, /taskSpace\(nameOrId\)/);
        return true;
      },
    );
  }
});

test("the stale-skill guard does not invent unrelated namespace members", () => {
  const kamiBrowser = createStaleKamiBrowserGuard();

  assert.equal(kamiBrowser.unknownFutureMethod, undefined);
  assert.equal(kamiBrowser.then, undefined);
  assert.equal(kamiBrowser[Symbol.toStringTag], undefined);
  assert.deepEqual(Object.keys(kamiBrowser), []);
});

test("the SDK guard is non-enumerable and leaves 1.2.3 globals alone", () => {
  const legacyClick = () => {};
  const target = { click: legacyClick };

  installStaleKamiBrowserGuard(target);

  assert.equal(target.click, legacyClick);
  assert.equal(
    Object.prototype.propertyIsEnumerable.call(target, "kamiBrowser"),
    false,
  );
  assert.throws(() => target.kamiBrowser.newTaskSpace, /skill-stale/);
});
