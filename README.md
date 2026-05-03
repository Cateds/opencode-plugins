# opencode-plugins

A collection of plugins and tools for [OpenCode](https://opencode.ai).

## Packages

| Package | Description | Install |
|---------|-------------|---------|
| [opencode-open-in-desktop](./packages/opencode-open-in-desktop) | Open current project in OpenCode Desktop app | `npm i -g opencode-open-in-desktop` |

## Development

This is a monorepo managed with [Bun](https://bun.com) workspaces.

### Setup

```bash
bun install
```

### Run locally

```bash
# Run a specific package
bun run packages/opencode-open-in-desktop/src/cli.ts

# Link a package globally for testing
cd packages/opencode-open-in-desktop && bun link
```

### Project structure

```
opencode-plugins/
├── packages/
│   └── opencode-open-in-desktop/   # CLI + TUI plugin
├── package.json                    # Workspace config
└── README.md
```

## License

MIT
