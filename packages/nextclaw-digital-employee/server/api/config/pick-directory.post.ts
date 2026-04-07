import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import { createError } from "h3";

/**
 * Opens the OS native folder-picker dialog on the server and returns the selected path.
 * This is only useful when the server and the browser are on the same machine (local dev / desktop).
 */
export default defineEventHandler(async () => {
  const os = platform();

  try {
    if (os === "darwin") {
      const raw = execFileSync("osascript", ["-e", "POSIX path of (choose folder)"], {
        encoding: "utf-8",
        timeout: 60_000
      }).trim();
      return { ok: true, data: { path: raw } };
    }

    if (os === "linux") {
      // zenity is available on most GNOME-based desktops
      const raw = execFileSync("zenity", ["--file-selection", "--directory"], {
        encoding: "utf-8",
        timeout: 60_000
      }).trim();
      return { ok: true, data: { path: raw } };
    }

    if (os === "win32") {
      // PowerShell one-liner that opens a FolderBrowseDialog
      const script = `Add-Type -AssemblyName System.Windows.Forms; $f=New-Object System.Windows.Forms.FolderBrowserDialog; $f.ShowDialog()|Out-Null; Write-Output $f.SelectedPath`;
      const raw = execFileSync("powershell", ["-NoProfile", "-Command", script], {
        encoding: "utf-8",
        timeout: 60_000
      }).trim();
      return { ok: true, data: { path: raw } };
    }

    throw createError({ statusCode: 501, statusMessage: `平台 "${os}" 暂不支持原生目录选择` });
  } catch (err: unknown) {
    const e = err as { status?: number; code?: number; message?: string };
    if (e?.status === 1 || e?.code === 1) {
      return { ok: false, data: { path: "" } };
    }
    throw createError({ statusCode: 500, statusMessage: e?.message ?? "无法打开目录选择框" });
  }
});
