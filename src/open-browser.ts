import { spawn } from "node:child_process";
import process from "node:process";

export function openInBrowser(url: string): Promise<void> {
  const platform = process.platform;

  let command: string;
  let args: string[];

  if (platform === "darwin") {
    command = "open";
    args = [url];
  } else if (platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", url];
  } else {
    command = "xdg-open";
    args = [url];
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });

    child.once("error", (error) => {
      reject(
        new Error(`Unable to open browser: ${String(error.message || error)}`),
      );
    });

    child.once("exit", () => {
      resolve();
    });
  });
}
