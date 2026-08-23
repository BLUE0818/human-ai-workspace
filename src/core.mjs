import { createHash } from "node:crypto";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { downloadTemplate } from "giget";

export const ROOT_ENV = "HUMAN_AI_WORKSPACE_ROOT";
export const TEMPLATE_VERSION = "template-v0.1.0";
export const TEMPLATE_SOURCE =
  `gh:BLUE0818/human-ai-workspace/template#${TEMPLATE_VERSION}`;

export const EXPECTED_FILES = Object.freeze({
  "AGENTS.md": "80ea8e9b15e7be3608b2a72979803d69746509717bbc3805589f51749fcd4259",
  "for_human/PROJECT.md": "cb6c0d910cc2a7e425b5beee08163a27473c3c342f12b9cec042834031f3912a",
  "for_human/STATUS.md": "3cfa0b60d5dbdc414c971613004a1f3fa2decaf9c13ad1b4e3b83972e682c223",
  "for_human/DECISIONS.md": "881c173bbdc384e80483897fdaec5219d26435128ca0048c3ec1da64bff457eb",
  "for_ai/AGENTS.md": "6d7997ae1ccddb5f0528e7f86d3ed9edc6bb3e567a5c7b8980f9bc878e4a38ca",
});

export class WorkspaceError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "WorkspaceError";
    this.code = code;
  }
}

function fail(code, message, options) {
  throw new WorkspaceError(code, message, options);
}

function datePrefix(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    fail("INVALID_DATE", "无法取得有效的本机日期。未创建文件。");
  }

  const year = String(now.getFullYear()).padStart(4, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function validateProjectName(value) {
  if (typeof value !== "string" || value.length === 0) {
    fail("PROJECT_NAME_REQUIRED", "缺少项目名称。用法：haiw \"项目名称\"");
  }
  if (value !== value.trim()) {
    fail("INVALID_PROJECT_NAME", "项目名称不能以空格开头或结尾。未创建文件。");
  }
  if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}[-_]/u.test(value)) {
    fail("PROJECT_NAME_INCLUDES_DATE", "只需输入项目名称；日期由 CLI 自动生成。未创建文件。");
  }
  if (/[<>:"/\\|?*\u0000-\u001f]/u.test(value) || value.endsWith(".")) {
    fail("INVALID_PROJECT_NAME", "项目名称包含不能用于目录名的字符。未创建文件。");
  }
  if (value === "." || value === "..") {
    fail("INVALID_PROJECT_NAME", "项目名称无效。未创建文件。");
  }
  return value;
}

async function pathExists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function resolveRoot(env) {
  const raw = env?.[ROOT_ENV];
  if (typeof raw !== "string" || raw.trim() === "") {
    fail(
      "WORKSPACE_ROOT_NOT_SET",
      `未设置 ${ROOT_ENV}。未创建文件，也未开始下载。`,
    );
  }

  const root = raw.trim();
  if (!path.isAbsolute(root)) {
    fail("WORKSPACE_ROOT_NOT_ABSOLUTE", `${ROOT_ENV} 必须是绝对路径。未创建文件，也未开始下载。`);
  }

  let rootStat;
  try {
    rootStat = await stat(root);
  } catch (error) {
    if (error?.code === "ENOENT") {
      fail("WORKSPACE_ROOT_NOT_FOUND", `${ROOT_ENV} 指向的目录不存在。未创建文件，也未开始下载。`);
    }
    throw error;
  }
  if (!rootStat.isDirectory()) {
    fail("WORKSPACE_ROOT_NOT_DIRECTORY", `${ROOT_ENV} 必须指向目录。未创建文件，也未开始下载。`);
  }
  return path.resolve(root);
}

async function verifyTemplate(directory) {
  const actualFiles = [];
  const expectedDirectories = new Set(["for_ai", "for_human"]);

  async function walk(currentDirectory, relativeDirectory = "") {
    for (const entry of await readdir(currentDirectory, { withFileTypes: true })) {
      const relativePath = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name;
      if (entry.isSymbolicLink()) {
        fail("TEMPLATE_INTEGRITY_FAILED", `模板包含不允许的符号链接：${relativePath}。未创建正式工作区。`);
      }
      if (entry.isDirectory()) {
        if (!expectedDirectories.has(relativePath)) {
          fail("TEMPLATE_INTEGRITY_FAILED", `模板包含非预期目录：${relativePath}。未创建正式工作区。`);
        }
        await walk(path.join(currentDirectory, entry.name), relativePath);
      } else if (entry.isFile()) {
        actualFiles.push(relativePath);
      } else {
        fail("TEMPLATE_INTEGRITY_FAILED", `模板包含不支持的文件类型：${relativePath}。未创建正式工作区。`);
      }
    }
  }

  await walk(directory);
  const expectedFiles = Object.keys(EXPECTED_FILES).sort();
  actualFiles.sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    fail("TEMPLATE_INTEGRITY_FAILED", "模板文件清单与固定版本不一致。未创建正式工作区。");
  }

  for (const [relativePath, expectedHash] of Object.entries(EXPECTED_FILES)) {
    let content;
    try {
      content = await readFile(path.join(directory, ...relativePath.split("/")));
    } catch (error) {
      fail("TEMPLATE_INTEGRITY_FAILED", `模板缺少 ${relativePath}。未创建正式工作区。`, { cause: error });
    }
    const actualHash = createHash("sha256").update(content).digest("hex");
    if (actualHash !== expectedHash) {
      fail("TEMPLATE_INTEGRITY_FAILED", `模板文件 ${relativePath} 校验失败。未创建正式工作区。`);
    }
  }
}

export async function createWorkspace(projectName, options = {}) {
  const name = validateProjectName(projectName);
  const env = options.env ?? process.env;
  const now = options.now ?? new Date();
  const downloader = options.downloader ?? downloadTemplate;
  const root = await resolveRoot(env);
  const folder = `${datePrefix(now)}_${name}`;

  if (Buffer.byteLength(folder, "utf8") > 255) {
    fail("PROJECT_NAME_TOO_LONG", "项目名称过长，无法创建目录。未创建文件。");
  }
  const target = path.join(root, folder);
  if (process.platform === "win32" && target.length > 240) {
    fail("TARGET_PATH_TOO_LONG", "目标路径过长。请缩短项目名称或工作总目录。未创建文件。");
  }
  if (await pathExists(target)) {
    fail("TARGET_ALREADY_EXISTS", `目标工作区已存在：${target}。未覆盖任何内容。`);
  }

  let tempRoot;
  try {
    tempRoot = await mkdtemp(path.join(root, ".haiw-"));
  } catch (error) {
    fail("WORKSPACE_ROOT_NOT_WRITABLE", `无法在 ${ROOT_ENV} 中创建内容。未开始下载。`, { cause: error });
  }
  const staging = path.join(tempRoot, "workspace");

  try {
    await downloader(TEMPLATE_SOURCE, {
      dir: staging,
      force: false,
      install: false,
      silent: true,
    });
    await verifyTemplate(staging);
    if (await pathExists(target)) {
      fail("TARGET_ALREADY_EXISTS", `目标工作区已存在：${target}。未覆盖任何内容。`);
    }
    await rename(staging, target);
  } catch (error) {
    if (error instanceof WorkspaceError) throw error;
    fail("DOWNLOAD_FAILED", "模板下载或创建失败。未留下正式工作区。", { cause: error });
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  return {
    ok: true,
    workspace: target,
    template_version: TEMPLATE_VERSION,
    created_files: Object.keys(EXPECTED_FILES),
  };
}
