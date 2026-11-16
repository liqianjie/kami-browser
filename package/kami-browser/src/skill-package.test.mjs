import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile, readlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const outDir = fileURLToPath(new URL("../dist/out/", import.meta.url));
const guideSource = fileURLToPath(
  new URL("../skill-body/SKILL.md", import.meta.url),
);

const codeFences = (markdown) => markdown.match(/^```[^\n]*\n[\s\S]*?^```$/gm);
const words = (markdown) => markdown.split(/\s+/).filter(Boolean);

test("the bundled usage guide is the unwrapped source guide between version and end markers", async () => {
  const bundled = await readFile(join(outDir, "kami-browser/SKILL.md"), "utf8");
  const source = await readFile(guideSource, "utf8");
  const version = /^version: "([^"]+)"$/m.exec(source)[1];
  const lines = bundled.trimEnd().split("\n");

  assert.deepEqual(await readdir(join(outDir, "kami-browser")), ["SKILL.md"]);
  assert.equal(
    lines[0],
    `[kami-browser:skill] kami-browser usage guide v${version}`,
  );
  assert.equal(lines.at(-1), `[kami-browser:skill] end of guide v${version}`);
  const body = source.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
  const bundledBody = lines.slice(2, -2).join("\n");
  assert.deepEqual(words(bundledBody), words(body));
  assert.deepEqual(codeFences(bundledBody), codeFences(body));
  assert.ok(bundledBody.split("\n").length < body.split("\n").length);
  assert.ok(!/^ {2,}\S/m.test(bundledBody.replace(/^```[\s\S]*?^```$/gm, "")));
  assert.ok(bundled.length <= 25_000);
});

test("the bundled entry Skill matches the published entry Skill", async () => {
  const entry = join(outDir, "agent-skills/kami-browser");
  assert.deepEqual((await readdir(entry)).sort(), [
    "SKILL.md",
    "agents",
    "assets",
    "learnings",
    "references",
    "scripts",
  ]);
  assert.deepEqual((await readdir(join(entry, "references"))).sort(), [
    "clearing-state.md",
    "install.md",
  ]);
  assert.equal(
    await readFile(join(entry, "SKILL.md"), "utf8"),
    await readFile(join(repoRoot, "skills/kami-browser/SKILL.md"), "utf8"),
  );
  assert.deepEqual(
    (await readdir(join(entry, "learnings"))).sort(),
    (await readdir(join(repoRoot, "skills/kami-browser/learnings"))).sort(),
  );
});

test("the entry Skill defers usage to kami-browser skill", async () => {
  const entry = await readFile(
    join(repoRoot, "skills/kami-browser/SKILL.md"),
    "utf8",
  );
  assert.match(entry, /^\s+bootstrap: "true"$/m);
  assert.match(entry, /^kami-browser skill$/m);
  assert.match(entry, /\[kami-browser:skill\] end of guide/);
  assert.match(entry, /references\/install\.md/);
  assert.match(entry, /references\/clearing-state\.md/);
});

test("project Agent and Codex entries share the canonical Skill", async () => {
  for (const directory of [".agents", ".codex"]) {
    // Windows reports the link target with backslashes.
    const target = await readlink(
      join(repoRoot, directory, "skills/kami-browser"),
    );
    assert.equal(target.replaceAll("\\", "/"), "../../skills/kami-browser");
  }
});
