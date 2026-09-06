# CHANGELOG

## v0.2.0（2026-09-06）

仓库工程化：**HSL 源码单列 + 编译产物入库 + CI/CD**。

### 变更

- **源码重组**：全部 27 个 `.hsl` 源模块从仓库根目录迁入 `hsl/`（内核 `hsl/org.hsl` +
  13 个域目录），相对 import 链原样保持；CLI 入口路径与文档引用同步更新。
- **编译产物入库**：新增 `dist/` 目录——`org demo` 结束时自动导出三连跑全量快照
  （`out-{a,b,c}` run/events/journal/评分卡、registry 专家注册表与固化 memo、
  factory mint/patch 产物、runtime 复发计数）与 `git-chain.json`（资产层 git 历史
  快照；嵌套 `.git` 不入库，链条以数据形式保存）。
  克隆即得可校验完整状态：`bun cli/org.ts check` 28 模块全过（hsl/ 源 27 +
  dist/ 铸出专家 1），`org status` 无本地运行时自动读 `dist/demo`。
- **CI**（`.github/workflows/ci.yml`，push/PR）：setup bun → 工具链自动安装
  （`scripts/setup-hsl.ts`，幂等）→ `dhv check` 28 模块 → 三连跑冒烟 → `status` 冒烟 →
  产物上传 workflow artifact → **dist/ 有变化自动回写提交**（`[skip ci]` 防循环）。
- **CD**（`.github/workflows/release.yml`，tag `v*`）：同套校验 → 打包源码 tar.gz +
  dist zip → 创建 GitHub Release（发布说明取 CHANGELOG 对应版本段落）。
- **新增 `scripts/setup-hsl.ts`**：dhv-ts 工具链自动安装（克隆到兄弟目录、幂等、
  未来有依赖时自动 `bun install`），本地与 CI 共用。
- **布局语义**：`hsl/` 源码层（人写）；`dist/` 编译产物层（机器生成，与源码同库演进）；
  `demo-run/` 本地构建目录（git 忽略，含嵌套 git 注册表）。

### 兼容性

- `org run / demo / ask` 行为不变；`status / score` 默认工作区增加 dist/demo 回退；
  `check` 走查范围新增 `dist/`（跳过 `.git / node_modules / .hsl-runs / demo-run`）。

## v0.1.0（2026-09-06）

首个可运行实现：**P0 + P1 + P2 + P3 + P4（轻档）+ P5（单轮直连）+ P6（知识补丁）+ P7（归因聚合）+ P8（精确匹配档固化）** 的最小闭环。

### 新增

- **信封契约**（`hsl/contracts/contract.hsl`）：`TaskSpec -> Result<StatusReport, ExpertError>`、
  四态裁决 `Accept/Revise/Reject/Escalate`、契约锻造（预算水位 + 返工上限）。
- **主控内核**（`hsl/org.hsl`）：监督回路 graph（分解 → 批量澄清 → 路由 → 派单 → 过程审查 →
  汇总 → 资产沉淀），microkernel 事件拓扑，`org run` / `org demo` 可运行。
- **路由器**（`hsl/router/policy.hsl`）：A 内联 / B 复用 / C 生成 / D 暖移交 四路径判定（纯函数）。
- **专家工厂**（`hsl/factory/pipeline.hsl`）：规格提取 → HSL 生成 → `dhv check`（真实结构闸门，
  嵌套解释器子进程）→ fixture 验收（run.json ok + acceptance 覆盖率双条件）→ 入库登记（git 提交）。
  补丁合入流水线同闸门（check + smoke + 失败回滚 + 版本 bump + provenance）。
- **专家库**（`hsl/registry/manifest.hsl`）：manifest schema（interface/capabilities/eval/version/stats/provenance）、
  磁盘注册表（index.json + 每专家 manifest）、能力交集 + 语义粗排检索。
- **智能体池**（`hsl/pool/lifecycle.hsl`）：实例生命周期状态机（入编/待命/派单/审查/直连）、
  会话隔离、并发额度；v1 双执行车道（进程内静态专家 / 嵌套解释器磁盘专家 = 蓝绿）。
- **固化管线**（`hsl/runtime/crystallize.hsl`）：判定节点观测账本（跨运行持久化）、
  稳定计数 → 冻结（精确匹配档）、命中监控、降级通道、memo 资产落盘。
- **模型评分卡**（`hsl/models/scorecard.hsl`）：能力轴 × 任务类、证据分级归因聚合
  （verdict 率 / 预算遵守 / 固化命中，客观档权重 1.0）。
- **直连前台**（`hsl/pool/direct.hsl`）：`org ask`——事件上总线、独立记账、纪要回写。
- **事件溯源**（`hsl/runtime/journal.hsl`）：journal.jsonl + events.jsonl 双留痕、
  `org replay` 时间线重演。
- **外部导入适配**（`hsl/adapters/bridge.hsl`）：subagent/MCP/A2A 描述文件探测、登记
  （执行接线为路线图项，登记不等于在岗）。
- **能力三态策略**（`hsl/policy/capability.hsl`）：auto/confirm/deny × 编排/直连模式、
  审计事件、天花板调升（仅用户）。
- **示例专家**：`notice-parser`（手写成熟：机械节点 + 判定节点固化演示）、
  `record-validator`（工厂生成物录制 + 人工抽查存档，全机械节点，返工零模型成本）。
- **CLI**（`cli/org.ts`）：`run / demo / ask / status / score / replay / check` 七命令。
- **三连跑演示**（`org demo`）：1.6s 内完成「铸专家 → 复用+补丁 → 蓝绿验证」全叙事。

### 实测记录（scripted 模式，CI 可复现）

| 轮次 | 耗时 | 结果 | 关键事件 |
|:---|:---|:---|:---|
| run A | ~0.5s | 3/3 子任务，1 次返工 | 工厂 mint record-validator@1.0.0（过 dhv check + fixture 验收）；固化 2 条日期映射 |
| run B | ~0.5s | 3/3 子任务，1 次返工 | 零工厂（复用资产）；固化命中 4 次；意见复发 → 补丁合入 1.0.1（git 留痕） |
| run C | ~0.2s | 3/3 子任务，**0 返工** | 判定节点 5/5 全命中（**零模型调用**）；补丁版首验即收（蓝绿生效） |

model_calls 衰减曲线：**5 → 1 → 0**（固化改变成本结构的直接证据）。

### 对 HSL 上游的修复（详见 BUGFIXES.md）

- `Vec::iter_mut` 缺失于解释器内建方法面（check 过 / run 崩的静默断层；nova 示例即中招）
- `String::push(char)` 缺失（Rust 对等 API）

### 已知边界（诚实声明）

- 池化重档（私有记忆工作台、并发写隔离）未实现，仅轻档（manifest + 任务历史索引）
- 补丁仅知识档（静态资源/规则行）；流程补丁（graph 拓扑）与能力变更闸门是路线图项
- 固化仅精确匹配档；语义等价判定是开放问题
- 评分卡裁判档（影子对比）未采集；静默更新检测是路线图项
- mint_hsl 剧本与 `hsl/factory/stock/` 逐字一致（人工抽查存档）——「生成器同时出题又答题」
  的结构性风险由人工抽查机制兜底，抽检比例待定案
