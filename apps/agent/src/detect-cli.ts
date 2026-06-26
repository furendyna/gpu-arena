import { classifyGpu, TIER_LABELS } from "@gpu-arena/shared";
import { detectGpu } from "./gpu-detect.js";

const d = await detectGpu();
const gpu = classifyGpu(d.rawName, d.memoryMb);
console.log("Detected GPU:", gpu.rawName);
console.log("Vendor:      ", gpu.vendor);
console.log("Model:       ", gpu.model);
console.log("VRAM:        ", gpu.memoryMb ? `${gpu.memoryMb} MB` : "unknown");
console.log("Pool:        ", TIER_LABELS[gpu.tier]);
