import { markHardStop } from "./output-sink.js";

export const STALE_SKILL_PREFIX = "[kami-browser:skill-stale]";

// These are the public top-level members exposed by the formal 1.3 Skill. Keep
// the guard narrow: 1.2.3 globals remain supported, while unpublished beta
// namespaces do not become a new compatibility surface.
const KAMI_BROWSER_13_MEMBERS = new Set([
  "helper",
  "site",
  "showTaskState",
  "snapshot",
  "listProfile",
  "listTaskSpace",
  "newTaskSpace",
  "switchTaskSpace",
  "claimTaskSpace",
  "handOffTaskSpace",
  "takeOverTaskSpace",
  "waitForAgentControlTaskSpace",
  "completeTaskSpace",
  "closeTaskSpace",
]);

export class KamiBrowserSkillStaleError extends Error {
  constructor(member: string) {
    super(
      [
        `${STALE_SKILL_PREFIX} This script uses the old kamiBrowser.${member} API.`,
        "Run `kami-browser skill` to read the current usage guide, then retry with the TaskSpace/Page API. Start with:",
        "  const task = await taskSpace(nameOrId)",
      ].join("\n"),
    );
    this.name = "KamiBrowserSkillStaleError";
  }
}

/** Create the migration-only namespace installed in place of the 1.3 facade. */
export function createStaleKamiBrowserGuard(): Record<string, unknown> {
  return new Proxy(Object.create(null), {
    get(_target, property) {
      if (
        typeof property !== "string" ||
        !KAMI_BROWSER_13_MEMBERS.has(property)
      ) {
        return undefined;
      }
      const error = new KamiBrowserSkillStaleError(property);
      // A stale Skill is a round-level mismatch. Mark it even if the script
      // catches the Error so unrelated business output cannot hide the remedy.
      markHardStop(error.message);
      throw error;
    },
  });
}

/** Install the guard for SDK hosts that expose helpers directly on globalThis. */
export function installStaleKamiBrowserGuard(
  target: Record<string, unknown>,
): void {
  Object.defineProperty(target, "kamiBrowser", {
    value: createStaleKamiBrowserGuard(),
    writable: true,
    configurable: true,
    enumerable: false,
  });
}
