"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIER_LABELS = void 0;
exports.tierForModel = tierForModel;
exports.classifyGpu = classifyGpu;
/**
 * GPU -> tier classification.
 *
 * Rules (from the arena design):
 *   Tier 1  = NVIDIA RTX 20-series and older (GTX 16/10, etc.)
 *   Tier 2  = NVIDIA RTX 30-series and newer (40/50-series, etc.)
 *
 * AMD / Intel are mapped to the nearest equivalent generation so the pools
 * stay roughly fair even for non-NVIDIA hardware.
 *
 * IMPORTANT: this runs on the model string the *agent detected from hardware*
 * (e.g. via `nvidia-smi`), never on a value the user typed. Self-reported tiers
 * are rejected server-side; only an agent-signed GpuInfo is trusted.
 */
function detectVendor(name) {
    const n = name.toLowerCase();
    if (n.includes("nvidia") || /\b(rtx|gtx)\b/.test(n))
        return "nvidia";
    if (n.includes("amd") || n.includes("radeon") || /\brx\s?\d/.test(n))
        return "amd";
    if (n.includes("intel") || n.includes("arc"))
        return "intel";
    return "unknown";
}
function normalizeModel(name) {
    return name
        .replace(/nvidia|geforce|amd|radeon|intel\(r\)|intel|\(r\)|\(tm\)/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}
/**
 * Returns the tier for a given raw GPU model string.
 * Conservative default: unknown hardware lands in Tier 1 (weaker pool) so a
 * spoofed/unrecognized card can never sneak into the stronger pool.
 */
function tierForModel(rawName) {
    const vendor = detectVendor(rawName);
    const n = rawName.toLowerCase();
    if (vendor === "nvidia") {
        // RTX / GTX series: "rtx 3060", "gtx 1660", "rtx 4090", "rtx 5080"
        const rtx = n.match(/rtx\s?(\d{3,4})/);
        if (rtx) {
            const num = parseInt(rtx[1], 10);
            // 4-digit models: leading digit is the series (30/40/50 -> >=3000).
            const series = num >= 2000 ? Math.floor(num / 1000) : num;
            return series >= 30 || num >= 3000 ? 2 : 1;
        }
        // Any GTX (16/10/9-series) is Tier 1.
        if (/gtx/.test(n))
            return 1;
        // Datacenter / workstation cards newer than Ampere -> Tier 2.
        if (/\b(a100|h100|h200|l40|l4|a40|a10|rtx a\d{4})\b/.test(n))
            return 2;
        return 1;
    }
    if (vendor === "amd") {
        // RX 6000/7000/9000 -> Tier 2; RX 5000 and older -> Tier 1.
        const rx = n.match(/rx\s?(\d{3,4})/);
        if (rx) {
            const num = parseInt(rx[1], 10);
            const series = Math.floor(num / 1000);
            return series >= 6 ? 2 : 1;
        }
        return 1;
    }
    if (vendor === "intel") {
        // Intel Arc A/B-series are recent -> Tier 2.
        if (/\barc\b/.test(n))
            return 2;
        return 1;
    }
    return 1;
}
/** Build a trusted GpuInfo from an agent-detected raw model string. */
function classifyGpu(rawName, memoryMb) {
    const vendor = detectVendor(rawName);
    const model = normalizeModel(rawName);
    const tier = tierForModel(rawName);
    return { rawName, vendor, model, memoryMb, tier };
}
exports.TIER_LABELS = {
    1: "Tier 1 · Pool Alpha",
    2: "Tier 2 · Pool Omega",
};
