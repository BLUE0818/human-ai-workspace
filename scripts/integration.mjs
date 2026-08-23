import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createWorkspace, EXPECTED_FILES, ROOT_ENV, TEMPLATE_VERSION } from "../src/core.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "haiw-integration-"));
try {
  const result = await createWorkspace("真实下载测试", {
    env: { [ROOT_ENV]: root },
  });
  assert.equal(result.template_version, TEMPLATE_VERSION);
  for (const relativePath of Object.keys(EXPECTED_FILES)) {
    await readFile(path.join(result.workspace, ...relativePath.split("/")));
  }
  process.stdout.write(`${JSON.stringify({ ok: true, workspace: result.workspace, template_version: result.template_version })}\n`);
} finally {
  await rm(root, { recursive: true, force: true });
}
