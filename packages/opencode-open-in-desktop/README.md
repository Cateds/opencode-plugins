# OpenCode Open in Desktop

[![npm version](https://img.shields.io/npm/v/opencode-open-in-desktop?style=flat-square)](https://www.npmjs.com/package/opencode-open-in-desktop)
[![license](https://img.shields.io/npm/l/opencode-open-in-desktop?style=flat-square)](https://github.com/Cateds/opencode-plugins/blob/main/packages/opencode-open-in-desktop/LICENSE)

Open current project directory in [OpenCode Desktop](https://opencode.ai) app.

## Installation

```bash
# npm
npm i -g opencode-open-in-desktop

# bun
bun i -g opencode-open-in-desktop

# pnpm
pnpm i -g opencode-open-in-desktop
```

## Usage

### CLI

```bash
# Open current directory
oc-desktop

# Open specific directory
oc-desktop /path/to/project
```

### TUI Plugin

If you're using OpenCode TUI, this plugin registers a `/desktop` command:

```txt
/desktop
```

Or use the alias:

```txt
/desk
```

## How it works

This tool constructs an `opencode://open-project?directory=...` URL and opens it using the system default handler:

| Platform | Command        |
| -------- | -------------- |
| macOS    | `open`         |
| Linux    | `xdg-open`     |
| Windows  | `cmd /c start` |

## Requirements

- [OpenCode Desktop](https://opencode.ai/download) installed
- Bun runtime (for CLI usage)

## License

MIT
