# OpenCode PTY

[![npm version](https://img.shields.io/npm/v/@cateds/opencode-pty?style=flat-square)](https://www.npmjs.com/package/@cateds/opencode-pty)
[![license](https://img.shields.io/npm/l/@cateds/opencode-pty?style=flat-square)](https://github.com/Cateds/opencode-plugins/blob/main/packages/opencode-pty/LICENSE)

Interactive PTY management plugin for [OpenCode](https://opencode.ai). Run background processes, send input, read output with regex filtering.

> This is a fork of [opencode-pty](https://github.com/shekohex/opencode-pty) by shekohex, rewritten for Node.js compatibility.

## Installation

```bash
# npm
npm i @cateds/opencode-pty

# bun
bun i @cateds/opencode-pty

# pnpm
pnpm i @cateds/opencode-pty
```

## Usage

### OpenCode Plugin

Add to your `opencode.json`:

```json
{
  "plugin": [
    "@cateds/opencode-pty"
  ]
}
```

### Tools

The plugin provides 6 tools:

| Tool | Description |
| ---- | ----------- |
| `pty_spawn` | Spawn a new PTY session to run a command |
| `pty_read` | Read output with pagination and regex filtering |
| `pty_write` | Send input to an active session |
| `pty_list` | List all PTY sessions |
| `pty_kill` | Terminate a session |
| `pty_await` | Wait for a session to exit (with optional timeout) |

### Slash Command

```txt
/pty-manage-page
```

Opens the PTY Sessions Web Interface in your browser for real-time monitoring.

## How it works

The plugin uses runtime-conditional imports to support both Bun and Node.js:

| Runtime | PTY Library | Environment |
| ------- | ----------- | ----------- |
| Bun | `bun-pty` | CLI/TUI |
| Node.js | `@lydell/node-pty` | Desktop/Electron |

The web interface is built with React and xterm.js, providing real-time terminal monitoring via WebSocket.

## Requirements

- OpenCode >= 1.3.13
- Node.js >= 22.0.0 (for Desktop) or Bun (for CLI/TUI)

## License

MIT
