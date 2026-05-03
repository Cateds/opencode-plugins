#!/usr/bin/env bun
import Bun from "bun";
import path from "path";
import { generateOpenCommand } from ".";

function main() {
  const dir = process.argv[2] || process.cwd();
  const abs_dir = path.resolve(dir);
  const cmd = generateOpenCommand(abs_dir);
  if (!cmd) {
    console.error("Unsupported platform for open-in-desktop plugin");
    process.exit(1);
  }
  Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
}

if (import.meta.main) {
  main();
}
