import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createWorkspace,
  EXPECTED_FILES,
  ROOT_ENV,
  TEMPLATE_VERSION,
  WorkspaceError,
} from "../src/core.mjs";
import { runCli } from "../src/cli.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateRoot = path.join(repoRoot, "template");
const fixedDate = new Date(2026, 7, 23, 12, 0, 0);

async function withRoot(callback) {
  const root = await mkdtemp(path.join(os.tmpdir(), "haiw-test-"));
  try {
    return await callback(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function copyTemplate(_source, options) {
  for (const relativePath of Object.keys(EXPECTED_FILES)) {
    const segments = relativePath.split("/");
    const source = path.join(templateRoot, ...segments);
    const destination = path.join(options.dir, ...segments);
    const content = (await readFile(source, "utf8")).replaceAll("\r\n", "\n");
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
}

function capture() {
  let value = "";
  return {
    stream: { write(chunk) { value += chunk; } },
    read() { return value; },
  };
}

test("未设置根目录时，在下载和写入前失败", async () => {
  let called = false;
  await assert.rejects(
    createWorkspace("测试项目", {
      env: {},
      now: fixedDate,
      downloader: async () => { called = true; },
    }),
    (error) => error instanceof WorkspaceError && error.code === "WORKSPACE_ROOT_NOT_SET",
  );
  assert.equal(called, false);
});

test("根目录必须是已存在的绝对目录", async () => {
  await assert.rejects(
    createWorkspace("测试项目", { env: { [ROOT_ENV]: "relative" }, now: fixedDate }),
    (error) => error.code === "WORKSPACE_ROOT_NOT_ABSOLUTE",
  );
  await assert.rejects(
    createWorkspace("测试项目", { env: { [ROOT_ENV]: path.join(os.tmpdir(), "haiw-does-not-exist") }, now: fixedDate }),
    (error) => error.code === "WORKSPACE_ROOT_NOT_FOUND",
  );
});

test("项目名称不能是路径或包含日期前缀", async () => {
  for (const name of ["foo/bar", "foo\\bar", "2026-08-23-测试项目"]) {
    await assert.rejects(
      createWorkspace(name, { env: {}, now: fixedDate }),
      (error) => ["INVALID_PROJECT_NAME", "PROJECT_NAME_INCLUDES_DATE"].includes(error.code),
    );
  }
});

test("成功创建日期目录并返回结构化结果", async () => withRoot(async (root) => {
  const result = await createWorkspace("测试项目", {
    env: { [ROOT_ENV]: root },
    now: fixedDate,
    downloader: copyTemplate,
  });
  assert.equal(result.workspace, path.join(root, "2026-08-23-测试项目"));
  assert.equal(result.template_version, TEMPLATE_VERSION);
  assert.deepEqual(result.created_files, Object.keys(EXPECTED_FILES));
  assert.deepEqual((await readdir(result.workspace)).sort(), ["AGENTS.md", "for_ai", "for_human"]);
}));

test("目标已存在时拒绝覆盖且不调用下载器", async () => withRoot(async (root) => {
  const target = path.join(root, "2026-08-23-测试项目");
  await mkdir(target);
  let called = false;
  await assert.rejects(
    createWorkspace("测试项目", {
      env: { [ROOT_ENV]: root },
      now: fixedDate,
      downloader: async () => { called = true; },
    }),
    (error) => error.code === "TARGET_ALREADY_EXISTS",
  );
  assert.equal(called, false);
}));

test("下载失败时清理临时目录且不留下正式工作区", async () => withRoot(async (root) => {
  await assert.rejects(
    createWorkspace("失败项目", {
      env: { [ROOT_ENV]: root },
      now: fixedDate,
      downloader: async () => { throw new Error("network down"); },
    }),
    (error) => error.code === "DOWNLOAD_FAILED",
  );
  assert.deepEqual(await readdir(root), []);
}));

test("模板校验失败时拒绝创建并清理临时目录", async () => withRoot(async (root) => {
  await assert.rejects(
    createWorkspace("损坏模板", {
      env: { [ROOT_ENV]: root },
      now: fixedDate,
      downloader: async (_source, options) => {
        await mkdir(options.dir, { recursive: true });
        await writeFile(path.join(options.dir, "AGENTS.md"), "broken");
      },
    }),
    (error) => error.code === "TEMPLATE_INTEGRITY_FAILED",
  );
  assert.deepEqual(await readdir(root), []);
}));

test("模板包含额外文件时拒绝创建", async () => withRoot(async (root) => {
  await assert.rejects(
    createWorkspace("额外文件", {
      env: { [ROOT_ENV]: root },
      now: fixedDate,
      downloader: async (source, options) => {
        await copyTemplate(source, options);
        await writeFile(path.join(options.dir, "unexpected.txt"), "unexpected");
      },
    }),
    (error) => error.code === "TEMPLATE_INTEGRITY_FAILED",
  );
  assert.deepEqual(await readdir(root), []);
}));

test("CLI 成功和失败都输出单行 JSON", async () => withRoot(async (root) => {
  const stdout = capture();
  const stderr = capture();
  const successCode = await runCli(["命令测试"], {
    env: { [ROOT_ENV]: root },
    now: fixedDate,
    downloader: copyTemplate,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });
  assert.equal(successCode, 0);
  assert.match(stdout.read(), /^[\x00-\x7f]+$/u);
  const success = JSON.parse(stdout.read());
  assert.equal(success.ok, true);
  assert.match(success.workspace, /2026-08-23-命令测试$/u);
  assert.equal(stderr.read(), "");

  const failed = capture();
  const failureCode = await runCli(["另一个项目"], {
    env: {},
    now: fixedDate,
    stdout: stdout.stream,
    stderr: failed.stream,
  });
  assert.equal(failureCode, 1);
  assert.match(failed.read(), /^[\x00-\x7f]+$/u);
  assert.equal(JSON.parse(failed.read()).error, "WORKSPACE_ROOT_NOT_SET");
}));
