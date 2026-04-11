#!/usr/bin/env node
import process from "node:process";

import { run } from "@truyman/cli";

import { cli } from "./cli.js";

run(cli, process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[md] ${message}`);
  process.exit(1);
});
