#!/usr/bin/env bun
// ============================================================================
// org/cli/org.ts — ORG 命令行（设计目标接口的 v0.1 实现）
// ----------------------------------------------------------------------------
//   org run --task "..."          团队模式派单（监督回路全流程）
//   org demo                      三连跑演示：铸专家 → 复用+补丁 → 验证蓝绿
//   org ask <expert> "<question>" 直连指定专家（记账 + 纪要回写）
//   org status                    库 / 池 / 资产状态
//   org score [--axis a]          模型评分卡与证据来源
//   org replay --run <dir>        确定性重放某次历史运行（journal 时间线）
//   org check                     dhv check 全部 HSL 源
//
// 前置：HSL 工具链（dhv-ts）。解析顺序：$DHV_TS → 兄弟目录 → ORG_ROOT 旁的
// harness-specification-language。
// ============================================================================

import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..");
const HSL_ENTRY = path.join(ROOT, "org.hsl");
const DIRECT_ENTRY = path.join(ROOT, "pool/direct.hsl");
const STOCK_FIXTURE = path.join(ROOT, "fixtures/run-notices.json");

// ---- 工具链解析 ----
function resolveDhv(): string {
  const candidates = [
    process.env.DHV_TS,
    path.resolve(ROOT, "../hsl/toolchain/dhv-ts/src/main.ts"),
    path.resolve(ROOT, "../harness-specification-language/toolchain/dhv-ts/src/main.ts"),
    path.resolve(ROOT, "harness-specification-language/toolchain/dhv-ts/src/main.ts"),
  ].filter((c): c is string => Boolean(c));
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  console.error(
    "✗ 找不到 HSL 工具链（dhv-ts）。三选一：\n" +
    "  1) export DHV_TS=/path/to/hsl/toolchain/dhv-ts/src/main.ts\n" +
    "  2) 把 harness-specification-language 仓库 clone 到本仓库的兄弟目录\n" +
    "  3) bun scripts/setup-hsl.ts（自动 clone）",
  );
  process.exit(2);
}

const DHV = resolveDhv();

// ---- 参数解析 ----
interface Args {
  cmd: string;
  task: string;
  workspace: string;
  fixture: string;
  model: string;
  out: string;
  runDir: string;
  axis: string;
  rest: string[];
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    cmd: argv[0] ?? "help",
    task: "",
    workspace: path.join(ROOT, "demo-run"),
    fixture: STOCK_FIXTURE,
    model: "scripted",
    out: "",
    runDir: "",
    axis: "",
    rest: [],
  };
  let i = 1;
  while (i < argv.length) {
    const v = argv[i]!;
    if (v === "--task") a.task = argv[++i] ?? "";
    else if (v === "--workspace") a.workspace = path.resolve(argv[++i] ?? ".");
    else if (v === "--fixture") a.fixture = path.resolve(argv[++i] ?? ".");
    else if (v === "--model") a.model = argv[++i] ?? "scripted";
    else if (v === "--out") a.out = path.resolve(argv[++i] ?? ".");
    else if (v === "--run") a.runDir = path.resolve(argv[++i] ?? ".");
    else if (v === "--axis") a.axis = argv[++i] ?? "";
    else a.rest.push(v);
    i++;
  }
  return a;
}

// ---- 基础执行 ----
async function runHsl(entry: string, opts: {
  workspace: string; task: string; model: string; fixture: string; out: string;
  env?: Record<string, string>;
}): Promise<{ ok: boolean; out: string }> {
  const env = { ...process.env, DHV_TS: DHV, ...opts.env };
  const args = [
    "run", entry,
    "--workspace", opts.workspace,
    "--task", opts.task,
    "--model", opts.model,
    "--fixture", opts.fixture,
    "--out", opts.out,
    "--allow", "bun,node,ls,cat,grep,diff,git",
  ];
  const proc = Bun.spawnSync(["bun", DHV, ...args], { env, stdout: "pipe", stderr: "pipe" });
  const out = proc.stdout.toString() + proc.stderr.toString();
  return { ok: proc.exitCode === 0, out };
}

async function checkFile(file: string): Promise<boolean> {
  const proc = Bun.spawnSync(["bun", DHV, "check", file], {
    env: { ...process.env, DHV_TS: DHV }, stdout: "pipe", stderr: "pipe",
  });
  const text = proc.stdout.toString() + proc.stderr.toString();
  const ok = proc.exitCode === 0;
  const tag = ok ? "✓" : "✗";
  const rel = path.relative(ROOT, file);
  console.log(`  ${tag} ${rel}${ok ? "" : "\n" + text.split("\n").slice(-8).join("\n")}`);
  return ok;
}

// ---- 命令 ----
async function cmdRun(a: Args): Promise<number> {
  if (!a.task) { console.error("✗ --task 必填"); return 2; }
  if (!fs.existsSync(a.workspace)) {
    console.log(`ℹ 初始化工作区（模板 demo-ws → ${path.relative(ROOT, a.workspace)}）`);
    fs.cpSync(path.join(ROOT, "demo-ws"), a.workspace, { recursive: true });
    gitInit(a.workspace);
  }
  const out = a.out || path.join(a.workspace, "out-latest");
  const r = await runHsl(HSL_ENTRY, {
    workspace: a.workspace, task: a.task, model: a.model,
    fixture: a.fixture, out,
  });
  process.stdout.write(r.out);
  return r.ok ? 0 : 1;
}

async function cmdDemo(a: Args): Promise<number> {
  const ws = a.workspace;
  const task = "抓取某站点近一周公告，输出结构化表格";
  console.log("╔════════════════════════════════════════════════════════════════╗");
  console.log("║ ORG 三连跑演示：子智能体可生成、可验收、可复用、可演进           ║");
  console.log("╚════════════════════════════════════════════════════════════════╝");
  console.log(`  工作区 ${ws}（git 注册表） · 任务「${task}」 · 模式 ${a.model}\n`);

  // 工作区重置（演示可重复）
  fs.rmSync(ws, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, "demo-ws"), ws, { recursive: true });
  gitInit(ws);

  const t0 = Date.now();
  const phases: Array<{ id: string; label: string; out: string }> = [
    { id: "A", label: "run A · 现场铸专家（工厂闸门）+ 过程审查（返工）+ 固化起步", out: path.join(ws, "out-a") },
    { id: "B", label: "run B · 复用资产（零工厂）+ 意见复发 → 补丁合入", out: path.join(ws, "out-b") },
    { id: "C", label: "run C · 蓝绿验证（补丁版 v1.0.1 上岗）", out: path.join(ws, "out-c") },
  ];
  for (const phase of phases) {
    console.log(`── ${phase.label} ${"─".repeat(Math.max(0, 46 - phase.label.length))}`);
    const r = await runHsl(HSL_ENTRY, {
      workspace: ws, task, model: a.model, fixture: a.fixture, out: phase.out,
    });
    process.stdout.write(r.out.split("\n").map((l) => "  " + l).join("\n") + "\n");
    if (!r.ok) { console.error(`✗ run ${phase.id} 失败`); return 1; }
  }

  // ---- 叙事总结（从产物提取关键事件） ----
  console.log("\n╔════════════════════════ 走读摘要 ═════════════════════════╗");
  const narrative: Array<[string, string]> = [
    summarizeRun(path.join(ws, "out-a"), "A"),
    summarizeRun(path.join(ws, "out-b"), "B"),
    summarizeRun(path.join(ws, "out-c"), "C"),
  ];
  for (const [tag, line] of narrative) console.log(`  ${tag} ${line}`);
  const gitLog = gitLogOf(ws);
  if (gitLog.length > 0) {
    console.log("\n  git 注册表历史（registry 资产层）：");
    for (const l of gitLog.slice(0, 6)) console.log(`    ${l}`);
  }
  console.log(`\n  总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s · 产物 ${ws}/out-{a,b,c}\n`);
  return 0;
}

function summarizeRun(outDir: string, id: string): [string, string] {
  try {
    const events = fs.readFileSync(path.join(outDir, "events.jsonl"), "utf-8")
      .split("\n").filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as { name: string; data?: Record<string, unknown> });
    const hits = events.filter((e) => e.name === "crystallize_hit").length;
    const frozen = events.filter((e) => e.name === "crystallize_frozen").length;
    const patched = events.some(
      (e) => e.name === "journal" && (e.data as Record<string, unknown>)?.name === "patch"
        && String((e.data as Record<string, unknown>)?.detail ?? "").includes("升级补丁提案"),
    );
    const runJson = JSON.parse(fs.readFileSync(path.join(outDir, "run.json"), "utf-8")) as { ok: boolean; elapsed_ms?: number };
    const bits: string[] = [`ok=${runJson.ok}`];
    if (runJson.elapsed_ms !== undefined) bits.push(`${(runJson.elapsed_ms / 1000).toFixed(1)}s`);
    if (frozen > 0) bits.push(`冻结 ${frozen} 条判定映射`);
    if (hits > 0) bits.push(`固化命中 ${hits} 次（零模型调用）`);
    if (patched) bits.push("补丁合入（意见复发→专家本体升级）");
    return [id, bits.join(" · ")];
  } catch {
    return [id, "(产物缺失)"];
  }
}

function gitLogOf(ws: string): string[] {
  try {
    const out = Bun.spawnSync(["git", "-C", ws, "log", "--oneline", "--all"], { stdout: "pipe" });
    return out.stdout.toString().split("\n").filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
}

function gitInit(ws: string): void {
  for (const args of [
    ["git", "init", "-q"],
    ["git", "config", "user.email", "org@local"],
    ["git", "config", "user.name", "org-registry"],
  ] as const) {
    Bun.spawnSync(args as unknown as string[], { cwd: ws, stdout: "ignore", stderr: "ignore" });
  }
  Bun.spawnSync(["git", "add", "-A"], { cwd: ws, stdout: "ignore", stderr: "ignore" });
  Bun.spawnSync(["git", "commit", "-q", "-m", "registry template (notice-parser@1.0.0)"],
    { cwd: ws, stdout: "ignore", stderr: "ignore" });
}

async function cmdAsk(a: Args): Promise<number> {
  const expert = a.rest[0] ?? "";
  const question = a.rest.slice(1).join(" ");
  if (!expert || !question) {
    console.error('用法：org ask <expert> "<question>"');
    return 2;
  }
  if (!fs.existsSync(a.workspace)) {
    fs.cpSync(path.join(ROOT, "demo-ws"), a.workspace, { recursive: true });
    gitInit(a.workspace);
  }
  const out = a.out || path.join(a.workspace, "out-ask");
  const r = await runHsl(DIRECT_ENTRY, {
    workspace: a.workspace, task: `(direct) ${question}`, model: a.model,
    fixture: a.fixture, out,
    env: { ORG_ASK_EXPERT: expert, ORG_ASK_QUESTION: question },
  });
  process.stdout.write(r.out);
  return r.ok ? 0 : 1;
}

async function cmdStatus(a: Args): Promise<number> {
  const ws = a.workspace;
  console.log(`ORG status · 工作区 ${ws}\n`);
  // 注册表
  const index = path.join(ws, "registry/index.json");
  if (fs.existsSync(index)) {
    const experts = JSON.parse(fs.readFileSync(index, "utf-8")) as Array<Record<string, string>>;
    console.log("registry（磁盘资产层）：");
    for (const m of experts) {
      console.log(`  ${m.name}@${m.version} [${m.source}] eval=${m.eval_score} uses=${m.uses} entry=${m.entry}`);
    }
  } else {
    console.log("registry：空（未初始化工作区）");
  }
  // 资产
  const memos = path.join(ws, "registry/memos/notice-parser.json");
  if (fs.existsSync(memos)) {
    const memo = JSON.parse(fs.readFileSync(memos, "utf-8")) as Record<string, string>;
    console.log(`\n固化 memo（notice-parser）：${Object.keys(memo).length} 条冻结映射`);
  }
  const recurrence = path.join(ws, "runtime/recurrence.json");
  if (fs.existsSync(recurrence)) {
    const rec = JSON.parse(fs.readFileSync(recurrence, "utf-8")) as Record<string, number>;
    if (Object.keys(rec).length > 0) {
      console.log(`复发计数（补丁判据）：${JSON.stringify(rec)}`);
    }
  }
  // git 历史
  const log = gitLogOf(ws);
  if (log.length > 0) {
    console.log(`\ngit 注册表历史（${log.length} commits）：`);
    for (const l of log.slice(0, 8)) console.log(`  ${l}`);
  }
  // 运行产物
  const runDirs = ["out-a", "out-b", "out-c", "out-latest", "out-ask"]
    .map((d) => path.join(ws, d))
    .filter((d) => fs.existsSync(path.join(d, "run.json")));
  if (runDirs.length > 0) {
    console.log("\n历史运行：");
    for (const d of runDirs) {
      const rj = JSON.parse(fs.readFileSync(path.join(d, "run.json"), "utf-8")) as { ok: boolean; task?: string; elapsed_ms?: number };
      console.log(`  ${path.basename(d)} ok=${rj.ok} ${(rj.elapsed_ms ?? 0) / 1000 | 0}s ${(rj.task ?? "").slice(0, 40)}`);
    }
  }
  return 0;
}

async function cmdScore(a: Args): Promise<number> {
  const ws = a.workspace;
  const candidates = ["out-c", "out-b", "out-a", "out-latest"]
    .map((d) => path.join(ws, d, "scorecard.json"))
    .filter((p) => fs.existsSync(p));
  if (candidates.length === 0) {
    console.log("尚无评分卡（先跑 org demo / org run）");
    return 0;
  }
  const card = JSON.parse(fs.readFileSync(candidates[0]!, "utf-8")) as {
    model: string; evidence_count: number; cells: Array<{ cell: string; score: number; confidence: number }>;
  };
  console.log(`scorecard · model=${card.model} · evidence=${card.evidence_count}（来源 ${path.relative(ROOT, candidates[0]!)}）`);
  const cells = a.axis ? card.cells.filter((c) => c.cell.startsWith(a.axis + "|")) : card.cells;
  for (const c of cells) {
    console.log(`  ${c.cell.padEnd(38)} score=${c.score.toFixed(3)} confidence(n)=${c.confidence}`);
  }
  console.log("\n证据分级：客观行为信号（verdict/budget/crystallize/direct）权重 1.0；裁判档 0.5（v1 未采集）。");
  return 0;
}

async function cmdReplay(a: Args): Promise<number> {
  if (!a.runDir || !fs.existsSync(path.join(a.runDir, "journal.jsonl"))) {
    console.error("✗ --run <dir> 需指向含 journal.jsonl 的运行产物目录（如 demo-run/out-a）");
    return 2;
  }
  const lines = fs.readFileSync(path.join(a.runDir, "journal.jsonl"), "utf-8")
    .split("\n").filter((l) => l.trim().length > 0);
  console.log(`replay · ${path.relative(ROOT, a.runDir)}（${lines.length} 条期刊记录，时间线重演）\n`);
  let lastPhase = "";
  for (const l of lines) {
    const parts = l.split("|");
    if (parts.length < 6) continue;
    const [, , phase, actor, action, detail] = parts;
    if (phase !== lastPhase) {
      console.log(`\n[阶段 ${phase}]`);
      lastPhase = phase;
    }
    console.log(`  ${actor.padEnd(10)} ${action.padEnd(14)} ${detail.slice(0, 90)}`);
  }
  console.log("\n（确定性重放 = journal + 代码版本；scripted 剧本即当时的模型响应录制）");
  return 0;
}

async function cmdCheck(): Promise<number> {
  console.log(`dhv check · ORG 全源码（解释器 ${path.relative(ROOT, DHV)}）\n`);
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".hsl")) files.push(p);
    }
  };
  walk(ROOT);
  // 顺序：入口优先（其 import 链最先建立），stock 与 probe 随后
  files.sort((x, y) => {
    const rank = (p: string): number =>
      p.endsWith("org.hsl") ? 0 : p.includes("probe/") ? 2 : 1;
    return rank(x) - rank(y) || x.localeCompare(y);
  });
  let failed = 0;
  for (const f of files) {
    const ok = await checkFile(f);
    if (!ok) failed += 1;
  }
  console.log(`\n${failed === 0 ? "✓" : "✗"} ${files.length} 个 HSL 模块（${failed} 失败）`);
  return failed === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  const a = parseArgs([cmd ?? "help", ...rest]);
  switch (a.cmd) {
    case "run": return cmdRun(a);
    case "demo": return cmdDemo(a);
    case "ask": return cmdAsk(a);
    case "status": return cmdStatus(a);
    case "score": return cmdScore(a);
    case "replay": return cmdReplay(a);
    case "check": return cmdCheck();
    default:
      console.log(`ORG — Organization Harness v0.1.0（基于 HSL · BNF v1.5.0）

用法：
  org run --task "..." [--workspace DIR] [--model scripted|deepseek] [--fixture FILE]
      团队模式派单：分解 → 路由 → 派单 → 审查 → 汇总 → 资产沉淀
  org demo [--workspace DIR]
      三连跑演示：A 现场铸专家 / B 复用+补丁 / C 蓝绿验证
  org ask <expert> "<question>"
      直连指定专家（事件上总线 · 花销记账 · 纪要回写）
  org status [--workspace DIR]
      库 / 池 / memo / 复发计数 / git 注册表历史
  org score [--axis structured_output] 
      模型评分卡（证据归因聚合）
  org replay --run <run-dir>
      确定性重放（journal 时间线重演）
  org check
      dhv check 全部 HSL 源码

工具链：${path.relative(ROOT, DHV)}`);
      return 0;
  }
}

process.exit(await main());
