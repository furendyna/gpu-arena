import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);

export interface DetectedGpu {
  rawName: string;
  memoryMb?: number;
}

/**
 * Detect the real GPU from hardware, NOT user input.
 * Tries `nvidia-smi` first (NVIDIA), then falls back to platform tools.
 */
export async function detectGpu(): Promise<DetectedGpu> {
  const override = process.env.GPU_OVERRIDE?.trim();
  if (override) return { rawName: override };

  // NVIDIA
  try {
    const { stdout } = await pexec("nvidia-smi", [
      "--query-gpu=name,memory.total",
      "--format=csv,noheader,nounits",
    ]);
    const line = stdout.split("\n").map((l) => l.trim()).find(Boolean);
    if (line) {
      const [name, mem] = line.split(",").map((x) => x.trim());
      return { rawName: name, memoryMb: mem ? parseInt(mem, 10) : undefined };
    }
  } catch {
    // not an NVIDIA box, keep going
  }

  // Windows: WMIC / PowerShell CIM
  if (process.platform === "win32") {
    try {
      const { stdout } = await pexec("powershell", [
        "-NoProfile",
        "-Command",
        "(Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name)",
      ]);
      const name = stdout.trim();
      if (name) return { rawName: name };
    } catch {
      /* ignore */
    }
  }

  throw new Error("Could not detect a GPU. Set GPU_OVERRIDE to test, or install nvidia-smi.");
}
