import test from "node:test";
import assert from "node:assert/strict";

import {
  kamiErrorCode,
  invokeKami,
  isKamiErrorCode,
  isKamiUserControlError,
  probeAgentControl,
  resolveKamiError,
} from "../dist/src/kami-errors.js";

test("probeAgentControl treats both native user-control shapes as waiting", async () => {
  assert.equal(
    await probeAgentControl(async () => ({
      error: "manual_takeover",
      error_code: "KAMI_TASK_SPACE_USER_IN_CONTROL",
    })),
    false,
  );
  assert.equal(
    await probeAgentControl(async () => {
      throw Object.assign(new Error("manual_takeover"), {
        error_code: "KAMI_TASK_SPACE_USER_IN_CONTROL",
      });
    }),
    false,
  );
});

test("probeAgentControl propagates non-user-control native errors", async () => {
  await assert.rejects(
    () =>
      probeAgentControl(async () => ({
        error: "renderer failed",
        error_code: "KAMI_SNAPSHOT_FAILED",
      })),
    /renderer failed/,
  );
});

test("invokeKami recognizes a permission reason from a resolved native error", async () => {
  await assert.rejects(
    () =>
      invokeKami("task.listTabs", () =>
        Promise.resolve({
          error: "location",
          error_code: "KAMI_TASK_SPACE_USER_IN_CONTROL",
        }),
      ),
    (error) => {
      assert.equal(error.error_code, "KAMI_TASK_SPACE_USER_IN_CONTROL");
      assert.match(
        error.message,
        /^task\.listTabs: A browser permission prompt/,
      );
      assert.match(error.message, /location access/);
      assert.match(error.message, /takeOverTaskSpace\(spaceId\)/);
      return true;
    },
  );
});

test("invokeKami recognizes a permission reason from a rejected native call", async () => {
  const nativeError = Object.assign(new Error("camera"), {
    error_code: "KAMI_TASK_SPACE_USER_IN_CONTROL",
  });
  await assert.rejects(
    () => invokeKami("snapshot", () => Promise.reject(nativeError)),
    (error) => {
      assert.equal(error.error_code, "KAMI_TASK_SPACE_USER_IN_CONTROL");
      assert.match(error.message, /^snapshot: A browser permission prompt/);
      assert.match(error.message, /camera access/);
      return true;
    },
  );
});

test("user-control reason lookup ignores inherited object properties", () => {
  const { message } = resolveKamiError({
    error: "constructor",
    error_code: "KAMI_TASK_SPACE_USER_IN_CONTROL",
  });
  assert.match(message, /Control of this task space is with the user/);
  assert.doesNotMatch(message, /constructor/);
});

test("unknown user-control reasons fall back without exposing the raw key", () => {
  const { message } = resolveKamiError({
    error: "future_permission_reason",
    error_code: "KAMI_TASK_SPACE_USER_IN_CONTROL",
  });
  assert.match(message, /Control of this task space is with the user/);
  assert.doesNotMatch(message, /future_permission_reason/);
});

test("the retired site-dialog handoff reason uses generic user-control guidance", () => {
  const { message } = resolveKamiError({
    error: "fallback_site_dialog_required_notice",
    error_code: "KAMI_TASK_SPACE_USER_IN_CONTROL",
  });
  assert.match(message, /Control of this task space is with the user/);
  assert.doesNotMatch(message, /dialog that requires review/);
  assert.doesNotMatch(message, /fallback_site_dialog_required_notice/);
});

test("invokeKami preserves non-user-control native failures", async () => {
  await assert.rejects(
    () =>
      invokeKami("snapshot", () =>
        Promise.reject(
          Object.assign(new Error("snapshot renderer failed"), {
            error_code: "KAMI_SNAPSHOT_FAILED",
          }),
        ),
      ),
    (error) => {
      assert.equal(error.error_code, "KAMI_SNAPSHOT_FAILED");
      assert.equal(error.message, "snapshot: snapshot renderer failed");
      return true;
    },
  );
});

test("kamiErrorCode extracts the code from every error shape", () => {
  // resolved { error, error_code } object
  assert.equal(
    kamiErrorCode({ error: "nope", error_code: "KAMI_BROWSER_UNAVAILABLE" }),
    "KAMI_BROWSER_UNAVAILABLE",
  );
  // rejected / thrown Error carrying .error_code
  const err = Object.assign(new Error("boom"), {
    error_code: "KAMI_SNAPSHOT_FAILED",
  });
  assert.equal(kamiErrorCode(err), "KAMI_SNAPSHOT_FAILED");
  // bare known code string (e.g. onSendCDPMessageError second arg)
  assert.equal(
    kamiErrorCode("KAMI_TASK_SPACE_USER_IN_CONTROL"),
    "KAMI_TASK_SPACE_USER_IN_CONTROL",
  );
  // future code this build does not know about is still returned
  assert.equal(
    kamiErrorCode({ error_code: "KAMI_FUTURE_CODE" }),
    "KAMI_FUTURE_CODE",
  );
  // no code present
  assert.equal(kamiErrorCode({ error: "plain message" }), undefined);
  assert.equal(kamiErrorCode("plain message"), undefined);
});

test("isKamiErrorCode narrows to known codes only", () => {
  assert.equal(isKamiErrorCode("KAMI_TASK_SPACE_NOT_FOUND"), true);
  assert.equal(isKamiErrorCode("KAMI_FUTURE_CODE"), false);
  assert.equal(isKamiErrorCode(undefined), false);
});

test("resolveKamiError overrides the native error message with the owned wording for an owned code", () => {
  const { code, message } = resolveKamiError({
    error: "Task space 7 is not assigned to an agent.",
    error_code: "KAMI_TASK_SPACE_INACTIVE",
  });
  assert.equal(code, "KAMI_TASK_SPACE_INACTIVE");
  // Owned id-less guidance replaces the native "Task space 7 ..." text.
  assert.match(message, /claimTaskSpace\(spaceId\)/);
  assert.doesNotMatch(message, /\b7\b/);
});

test("inactive guidance does not attribute an agent-finished task to the user", () => {
  // task.finish({ keep: [...] }) leaves the space user-owned; a later
  // takeOverTaskSpace() gets this code without any user action.
  const { message } = resolveKamiError("KAMI_TASK_SPACE_INACTIVE");
  assert.doesNotMatch(message, /user has taken control/i);
  assert.match(message, /task\.finish\(\)/);
  assert.match(message, /takeOverTaskSpace\(\) cannot resume/);
  assert.match(message, /claimTaskSpace\(spaceId\)/);
});

test("user-control guidance names both the agent handoff and a browser takeover", () => {
  const { message } = resolveKamiError("KAMI_TASK_SPACE_USER_IN_CONTROL");
  assert.doesNotMatch(message, /user has taken control/i);
  assert.match(message, /task\.handOff\(\)/);
  assert.match(message, /takeover in the browser/);
});

test("resolveKamiError keeps the native error message for an unknown future code", () => {
  assert.deepEqual(
    resolveKamiError({
      error: "Some build-specific detail",
      error_code: "KAMI_FUTURE_CODE",
    }),
    {
      code: "KAMI_FUTURE_CODE",
      message: "Some build-specific detail",
    },
  );
});

test("resolveKamiError defers to the native error message for a code kami-browser does not own", () => {
  // KAMI_OPERATION_FAILED is not owned: the client wording (e.g. which operation
  // failed) is more specific than any static line.
  assert.deepEqual(
    resolveKamiError({
      error: "Failed to create task space",
      error_code: "KAMI_OPERATION_FAILED",
    }),
    {
      code: "KAMI_OPERATION_FAILED",
      message: "Failed to create task space",
    },
  );
});

test("resolveKamiError falls back to the raw code for a bare non-owned code", () => {
  // kami-browser does not own NOT_SELECTED and a bare code carries no native error message,
  // so the stable code itself is the most specific thing to surface.
  assert.deepEqual(resolveKamiError("KAMI_TASK_SPACE_NOT_SELECTED"), {
    code: "KAMI_TASK_SPACE_NOT_SELECTED",
    message: "KAMI_TASK_SPACE_NOT_SELECTED",
  });
});

test("resolveKamiError uses the id-less guidance block for a bare user-control code", () => {
  const { code, message } = resolveKamiError("KAMI_TASK_SPACE_USER_IN_CONTROL");
  assert.equal(code, "KAMI_TASK_SPACE_USER_IN_CONTROL");
  assert.match(message, /Control of this task space is with the user/);
  assert.match(message, /takeOverTaskSpace\(spaceId\)/);
  assert.doesNotMatch(message, /<id>/);
});

test("resolveKamiError falls back to the raw code, then a generic message", () => {
  assert.deepEqual(resolveKamiError({ error_code: "KAMI_FUTURE_CODE" }), {
    code: "KAMI_FUTURE_CODE",
    message: "KAMI_FUTURE_CODE",
  });
  assert.deepEqual(resolveKamiError({}), {
    code: undefined,
    message: "Unknown kami error",
  });
});

test("isKamiUserControlError keys on the stable code, not wording", () => {
  assert.equal(
    isKamiUserControlError(
      Object.assign(new Error("anything at all"), {
        error_code: "KAMI_TASK_SPACE_USER_IN_CONTROL",
      }),
    ),
    true,
  );
  // wording that mentions user control but lacks the code is not a match
  assert.equal(
    isKamiUserControlError(new Error("the user is controlling this")),
    false,
  );
  assert.equal(
    isKamiUserControlError({ error_code: "KAMI_SNAPSHOT_FAILED" }),
    false,
  );
});

test("invokeKami resolves native error objects and attaches error_code", async () => {
  await assert.rejects(
    () =>
      invokeKami("listTabs", () => ({
        error: "Task space not selected",
        error_code: "KAMI_TASK_SPACE_NOT_SELECTED",
      })),
    (error) => {
      assert.equal(error.message, "listTabs: Task space not selected");
      assert.equal(error.error_code, "KAMI_TASK_SPACE_NOT_SELECTED");
      return true;
    },
  );
});

test("invokeKami normalizes synchronous native throws", async () => {
  const nativeError = Object.assign(new Error("native setup failed"), {
    error_code: "KAMI_OPERATION_FAILED",
  });
  await assert.rejects(
    () =>
      invokeKami("createTab", () => {
        throw nativeError;
      }),
    (error) => {
      assert.equal(error.message, "createTab: native setup failed");
      assert.equal(error.error_code, "KAMI_OPERATION_FAILED");
      return true;
    },
  );
});

test("invokeKami passes through successful results", async () => {
  const ok = { tabs: [] };
  assert.equal(await invokeKami("listTabs", () => ok), ok);
});
