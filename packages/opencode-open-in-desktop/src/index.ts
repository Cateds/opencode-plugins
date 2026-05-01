import type { TuiPluginModule } from "@opencode-ai/plugin/tui";
import Bun from "bun";

const OPEN_COMMANDS: Record<string, string[]> = {
  darwin: ["open"],
  linux: ["xdg-open"],
  win32: ["cmd", "/c", "start", ""],
};

const plugin: TuiPluginModule = {
  id: "open-in-desktop",
  tui: async (api) => {
    api.command.register(() => [
      {
        title: "Open in Desktop",
        value: "plugin.desktop.open",
        category: "Plugin",
        description: "Open current project in opencode-desktop",
        slash: {
          name: "desktop",
          aliases: ["desk"],
        },
        onSelect: () => {
          const dir = api.state.path.directory;
          const url = `opencode://open-project?directory=${encodeURIComponent(dir)}`;
          const cmd = OPEN_COMMANDS[process.platform];
          if (!cmd) return;
          Bun.spawn([...cmd, url], { stdout: "ignore", stderr: "ignore" });
        },
      },
    ]);
  },
};

export default plugin;
