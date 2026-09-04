# Human-AI Workspace

[简体中文](./README.md) | **English**

> A human–AI project collaboration solution designed for non-technical beginners.

Many people know what they want AI to build, but cannot understand all the code, configuration, tests, and logs inside a project. That should not prevent anyone from creating and maintaining real projects with AI.

**Human-AI Workspace** separates a project into two clear collaboration spaces:

- `for_human`: contains only the information that humans and AI need to understand, discuss, or decide together, written in plain language.
- `for_ai`: contains the actual project, source code, tests, configuration, technical documentation, and verification evidence for AI to understand and maintain.

The goal is not to turn technology into an unauditable black box. Instead, AI must translate important progress, risks, choices, and verification results into information that people can understand.

## What problem does it solve?

Non-technical users often face these problems when building projects with AI:

- They do not know how far the project has actually progressed.
- AI says something is “finished,” but they cannot tell whether it was really tested.
- There are too many technical options, such as APIs, SDKs, MCP, and CLIs.
- AI asks specialist questions, but users do not know which decisions genuinely require them.
- Important decisions are scattered across chat history and may be lost when switching sessions or models.
- The project keeps growing while the information people can understand and control keeps shrinking.

This template gives every project a stable **human collaboration interface**. People do not need to understand all the code to know:

- what the project is trying to achieve;
- what currently works and what does not;
- what has been completed and verified;
- what remains unfinished;
- which decisions require human input;
- why AI believes the project is ready to use.

## Directory structure

```text
project/
├── .gitignore
├── AGENTS.md
├── for_human/
│   ├── PROJECT.md
│   ├── STATUS.md
│   └── DECISIONS.md
└── for_ai/
    ├── AGENTS.md
    ├── src/
    ├── tests/
    └── ...
```

`for_human` is divided by the reason a person needs to read the information:

- `PROJECT.md`: what the project is, how it will be used, and what outcome is expected;
- `STATUS.md`: what works now, how far the project has progressed, and what has actually been verified;
- `DECISIONS.md`: what requires a human decision and what has already been decided.

The initial template keeps only five necessary collaboration entry files and uses concise wording to reduce model context usage. Acceptance criteria belong in `PROJECT.md`, current acceptance results belong in `STATUS.md`, and detailed technical evidence remains in `for_ai`.

## How humans and AI divide responsibilities

### Humans are responsible for

- explaining the desired outcome and real usage scenario;
- deciding personal preferences, costs, risk tolerance, and permission boundaries;
- authorizing important actions such as local writes, external publication, and production changes;
- performing final acceptance based on real usage experience.

### AI is responsible for

- reading the code, documentation, and actual environment;
- comparing technical approaches and choosing the best overall implementation;
- defining necessary safety boundaries, tests, and professional acceptance criteria;
- making professional technical decisions instead of asking users to choose unexplained technologies;
- translating user-impacting risks and trade-offs into plain language;
- proving results with tests and reviewable evidence instead of merely claiming completion.

## Core collaboration principles

1. **Humans define the goal; AI is responsible for the technical implementation.**
2. **AI investigates and decides purely technical matters. If a choice affects experience, cost, risk, or permissions, AI explains the consequences, gives a recommendation, and asks the human to decide.**
3. **AI proactively discovers important requirements the human may not have considered, but asks only high-information questions that could materially change the project.**
4. **`for_human` must remain understandable in plain language and must not become a storage area for logs, code, or unexplained jargon.**
5. **AI must not declare completion without evidence. AI proves professional acceptance; the human performs final user acceptance.**
6. **Creating a local workspace requires explicit user authorization. Ordinary conversation must never automatically create local files.**

## Try the template now

Node.js 20 or later and Git with `user.name` and `user.email` already configured are required. Install the CLI first:

```powershell
npm install --global human-ai-workspace-cli
```

Set the workspace root environment variable. The CLI never guesses or creates this root automatically; it refuses to download if the variable is missing, the path does not exist, or the path is not absolute:

```powershell
[Environment]::SetEnvironmentVariable(
    "HUMAN_AI_WORKSPACE_ROOT",
    "D:\ZM\qwenpaw_job",
    "User"
)
```

Open a new terminal or restart the AI agent, then run only:

```powershell
haiw "Project name"
```

The CLI creates:

```text
D:\ZM\qwenpaw_job\YYYY-MM-DD_Project name
```

It uses the fixed template version `template-v0.2.0`, verifies the file list and SHA-256 hashes, and never overwrites an existing directory. During creation, it initializes a `main` branch at the workspace root, stages the template files, and creates this initial commit:

```text
chore: initialize Human-AI Workspace
```

The root `.gitignore` contains only one Human-AI Workspace default: at any depth under `for_human`, Git tracks Markdown files only. Files elsewhere are trackable by default, and each project may extend `.gitignore` for its own stack. The CLI does not modify global or repository Git configuration. If download, verification, Git initialization, or the initial commit fails, no final workspace is left behind.

After creation, ask the AI agent to open the new directory and read the root `AGENTS.md` first.

## Current stage

This is the first version of the Chinese-first template. The current focus is validating:

- whether the `for_human` and `for_ai` structure truly lowers the barrier to understanding projects;
- whether different AI agents can follow the same collaboration model;
- whether human-readable project status stays consistent with the real implementation over time;
- which parts should become stable template conventions and which should be generated for each project.

## Roadmap

- Improve the CLI based on real-world feedback.
- Add template variants for projects of different sizes.
- Provide a Cloudflare Streamable HTTP MCP entry point when needed.
- Add cross-agent usage examples and collaboration evaluations.

## Feedback and contributions

This project is for ordinary users who do not want to become programmers before they can meaningfully control AI-built projects. You are welcome to open an Issue and share:

- which parts are still difficult to understand;
- which questions AI should proactively ask;
- which project states are most useful in `for_human`;
- compatibility problems encountered with different AI agents.

## License

This project is licensed under the [MIT License](./LICENSE).
