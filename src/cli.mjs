import { createWorkspace, ROOT_ENV, WorkspaceError } from "./core.mjs";

export const CLI_VERSION = "0.2.0";

const HELP = `用法：haiw "项目名称"

从固定版本模板创建 YYYY-MM-DD_项目名称 工作区，
并在工作区根目录创建 main 分支和初始 Git 提交。
必须预先设置环境变量 ${ROOT_ENV}，并安装、配置 Git。`;

function jsonLine(value) {
  return JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

export async function runCli(
  argv = process.argv.slice(2),
  options = {},
) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;

  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    stdout.write(`${HELP}\n`);
    return 0;
  }
  if (argv.length === 1 && (argv[0] === "--version" || argv[0] === "-v")) {
    stdout.write(`${CLI_VERSION}\n`);
    return 0;
  }
  if (argv.length !== 1) {
    stderr.write(`${jsonLine({
      ok: false,
      error: "INVALID_ARGUMENT_COUNT",
      message: "只需提供一个项目名称。用法：haiw \"项目名称\"",
    })}\n`);
    return 1;
  }

  try {
    const result = await createWorkspace(argv[0], {
      env: options.env,
      now: options.now,
      downloader: options.downloader,
      gitRunner: options.gitRunner,
      gitEnv: options.gitEnv,
    });
    stdout.write(`${jsonLine(result)}\n`);
    return 0;
  } catch (error) {
    const known = error instanceof WorkspaceError;
    stderr.write(`${jsonLine({
      ok: false,
      error: known ? error.code : "UNEXPECTED_ERROR",
      message: known ? error.message : "发生未预期错误。未确认创建结果。",
    })}\n`);
    return 1;
  }
}
