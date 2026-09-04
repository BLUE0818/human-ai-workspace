import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
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
const execFileAsync = promisify(execFile);
const fakeCommit = "0123456789abcdef0123456789abcdef01234567";

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

function successfulGitRunner(calls = []) {
  return async (args, options) => {
    calls.push({ args, cwd: options.cwd });
    const command = args.join(" ");
    if (command === "--version") {
      return { code: 0, stdout: "git version 2.55.0", stderr: "" };
    }
    if (command === "rev-parse --verify HEAD") {
      return { code: 0, stdout: fakeCommit, stderr: "" };
    }
    if (command === "symbolic-ref --short HEAD") {
      return { code: 0, stdout: "main", stderr: "" };
    }
    return { code: 0, stdout: "", stderr: "" };
  };
}

const testGitIdentity = {
  ...process.env,
  GIT_AUTHOR_NAME: "Human-AI Workspace Test",
  GIT_AUTHOR_EMAIL: "haiw-test@example.invalid",
  GIT_COMMITTER_NAME: "Human-AI Workspace Test",
  GIT_COMMITTER_EMAIL: "haiw-test@example.invalid",
};

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
  for (const name of ["foo/bar", "foo\\bar", "2026-08-23-测试项目", "2026-08-23_测试项目"]) {
    await assert.rejects(
      createWorkspace(name, { env: {}, now: fixedDate }),
      (error) => ["INVALID_PROJECT_NAME", "PROJECT_NAME_INCLUDES_DATE"].includes(error.code),
    );
  }
});

test("成功创建日期目录并返回结构化结果", async () => withRoot(async (root) => {
  const gitCalls = [];
  const result = await createWorkspace("测试项目", {
    env: { [ROOT_ENV]: root },
    now: fixedDate,
    downloader: copyTemplate,
    gitRunner: successfulGitRunner(gitCalls),
  });
  assert.equal(result.workspace, path.join(root, "2026-08-23_测试项目"));
  assert.equal(result.template_version, TEMPLATE_VERSION);
  assert.deepEqual(result.created_files, Object.keys(EXPECTED_FILES));
  assert.equal(result.git_initialized, true);
  assert.equal(result.git_branch, "main");
  assert.equal(result.git_commit, fakeCommit);
  assert.deepEqual((await readdir(result.workspace)).sort(), [".gitignore", "AGENTS.md", "for_ai", "for_human"]);
  assert.deepEqual(
    gitCalls.map(({ args }) => args),
    [
      ["--version"],
      ["init", "--initial-branch=main"],
      ["add", "--all"],
      ["commit", "--message", "chore: initialize Human-AI Workspace"],
      ["rev-parse", "--verify", "HEAD"],
      ["symbolic-ref", "--short", "HEAD"],
      ["status", "--porcelain"],
    ],
  );
}));

test("真实 Git 初始提交干净，for_human 只跟踪 Markdown", async () => withRoot(async (root) => {
  const result = await createWorkspace("Git 项目", {
    env: { [ROOT_ENV]: root },
    now: fixedDate,
    downloader: copyTemplate,
    gitEnv: testGitIdentity,
  });
  const git = (...args) => execFileAsync("git", ["-C", result.workspace, ...args], {
    encoding: "utf8",
    env: testGitIdentity,
  });

  assert.equal((await git("branch", "--show-current")).stdout.trim(), "main");
  assert.equal((await git("rev-list", "--count", "HEAD")).stdout.trim(), "1");
  assert.equal((await git("status", "--porcelain")).stdout, "");
  assert.equal((await git("rev-parse", "HEAD")).stdout.trim(), result.git_commit);

  const tracked = (await git("ls-files")).stdout.trim().split(/\r?\n/u).sort();
  assert.deepEqual(tracked, Object.keys(EXPECTED_FILES).sort());

  await writeFile(path.join(result.workspace, "for_human", "release.zip"), "binary");
  await mkdir(path.join(result.workspace, "for_human", "notes"));
  await writeFile(path.join(result.workspace, "for_human", "notes", "iteration.md"), "# iteration\n");
  await writeFile(path.join(result.workspace, "for_ai", "generated.bin"), "binary");
  const status = (await git("status", "--short", "--untracked-files=all")).stdout.replaceAll("\\", "/");
  assert.doesNotMatch(status, /for_human\/release\.zip/u);
  assert.match(status, /for_human\/notes\/iteration\.md/u);
  assert.match(status, /for_ai\/generated\.bin/u);
}));

test("Git 不可用时在下载前失败且不留下工作区", async () => withRoot(async (root) => {
  let downloaded = false;
  await assert.rejects(
    createWorkspace("没有 Git", {
      env: { [ROOT_ENV]: root },
      now: fixedDate,
      downloader: async () => { downloaded = true; },
      gitRunner: async () => {
        const error = new Error("spawn git ENOENT");
        error.code = "ENOENT";
        throw error;
      },
    }),
    (error) => error instanceof WorkspaceError && error.code === "GIT_NOT_FOUND",
  );
  assert.equal(downloaded, false);
  assert.deepEqual(await readdir(root), []);
}));

test("Git 初始提交失败时清理临时目录且不留下正式工作区", async () => withRoot(async (root) => {
  const runner = successfulGitRunner();
  await assert.rejects(
    createWorkspace("提交失败", {
      env: { [ROOT_ENV]: root },
      now: fixedDate,
      downloader: copyTemplate,
      gitRunner: async (args, options) => args[0] === "commit"
        ? { code: 128, stdout: "", stderr: "Author identity unknown" }
        : runner(args, options),
    }),
    (error) => error instanceof WorkspaceError && error.code === "GIT_COMMIT_FAILED",
  );
  assert.deepEqual(await readdir(root), []);
}));

test("目标已存在时拒绝覆盖且不调用下载器", async () => withRoot(async (root) => {
  const target = path.join(root, "2026-08-23_测试项目");
  await mkdir(target);
  let called = false;
  await assert.rejects(
    createWorkspace("测试项目", {
      env: { [ROOT_ENV]: root },
      now: fixedDate,
      downloader: async () => { called = true; },
      gitRunner: successfulGitRunner(),
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
      gitRunner: successfulGitRunner(),
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
      gitRunner: successfulGitRunner(),
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
      gitRunner: successfulGitRunner(),
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
    gitRunner: successfulGitRunner(),
    gitEnv: testGitIdentity,
    stdout: stdout.stream,
    stderr: stderr.stream,
  });
  assert.equal(successCode, 0);
  assert.match(stdout.read(), /^[\x00-\x7f]+$/u);
  const success = JSON.parse(stdout.read());
  assert.equal(success.ok, true);
  assert.match(success.workspace, /2026-08-23_命令测试$/u);
  assert.equal(success.git_initialized, true);
  assert.equal(success.git_branch, "main");
  assert.equal(success.git_commit, fakeCommit);
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
