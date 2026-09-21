# clock-stability-service

钟的时频稳定度评估服务：提交一条等间隔采样的钟差（相位时间）或分数频率序列，
返回重叠 Allan 标准差曲线 σ_y(τ)，并在双对数图上按局部斜率标出每一段更像
白相位（white_pm）、白频率（white_fm）还是随机游走（random_walk_fm）。

## 运行

```bash
npm ci
npm start                 # 监听 :3000，数据落在 ./data/records.db
# 或
docker build -t clock-stability .
docker run -p 3000:3000 clock-stability
```

环境变量：`PORT`（默认 3000）、`DATA_DIR`（默认 `./data`）、`DB_PATH`（覆盖完整数据库路径）。

## HTTP 接口

### `POST /records` — 提交一份记录段

```json
{
  "kind": "phase | frequency",
  "tau0": 1.0,
  "series": [0.12, -0.03, ...],
  "label": "可选标签"
}
```

- `kind`：`phase` = 钟差/相位时间（重叠估计走二阶差分）；`frequency` = 分数频率
  （走相邻 τ 平均之差）。两者对同一物理过程在同一物理 τ 上给出一致的 σ_y。
- `tau0`：采样间隔，必须为正有限数。
- `series`：有限数值数组，至少 8 点（服务钉死的下限）。

响应 `201`：

```json
{ "id": 2, "status": "done", "kind": "phase", "tau0": 1.0, "points": 4096, "hasWhiteFM": true }
```

缺项、非有限数、`tau0` 非正、序列过短、或所有候选 τ 都超过 T/3 时，记录落盘为
失败态并写明原因，**不会**返回看似完整的假曲线：

```json
{ "id": 3, "status": "failed", "reason": "tau0 must be a positive finite number" }
```

### `GET /records` — 摘要列表

只给摘要：点数、`tau0`、状态、有没有识别出白频率段（`hasWhiteFM`）。

### `GET /records/:id` — 取回整条曲线

```json
{
  "id": 2, "status": "done", "kind": "phase", "tau0": 1.0, "points": 4096,
  "series": [...],
  "mList": [1, 2, 5, 10, ...],
  "curve": [
    { "m": 1, "tau": 1, "sigmaY": 1.0e-3, "slope": -0.51, "noiseType": "white_fm" },
    ...
  ],
  "slopeIntervals": { "white_pm": [-1.25, -0.75], "white_fm": [-0.75, -0.25],
                      "random_walk_fm": [0.25, 0.75] }
}
```

原始序列、种类声明、`tau0`、实际用到的 m 列表、每个 τ 的 σ_y 与类型、本次用的
斜率区间，全部随记录落盘（进程内 SQLite，无需外部数据库）。

## 方法约定

- **重叠估计**：τ = m·τ0 的分析窗以 1 个采样点的步长滑动（步长 < 块长 m），所有
  重叠块都进入 σ_y²(τ)。相位数据用二阶差分，频率数据用相邻 τ 平均之差；两条公式
  在 `y_i = (x_{i+1} − x_i)/τ0` 时代数等价。
- **τ 网格**：按 decade 取 1-2-5 步进的 m（1, 2, 5, 10, 20, 50, …），且只保留
  τ ≤ T/3 的点；全部超限时记录判失败。
- **噪声类型**：log τ–log σ_y 上相邻点的局部斜率落在钉死区间内才贴标签——
  约 −1 白相位、约 −1/2 白频率、约 +1/2 随机游走；落不进任何区间标 `unknown`，
  不足两个 τ 点时类型栏整列留空（`null`）。
- **预置记录**：服务启动时写入一条合成白频率记录（`label = "preset:white-fm"`），
  中段斜率 ≈ −1/2，类型栏标 `white_fm`。
- 估计器为纯函数，滑窗累加随调用结束即销毁，不会在记录之间残留。

## 代码结构

| 文件 | 职责 |
| --- | --- |
| `src/allan.js` | 重叠 Allan 估计（相位/频率）、decade τ 网格、T/3 上限 |
| `src/noise.js` | 局部斜率、钉死的斜率区间、噪声类型标注 |
| `src/compute.js` | 分析管线：网格 → 估计 → 斜率 → 类型 |
| `src/validate.js` | 入参检查（缺项、非有限、τ0、长度下限） |
| `src/storage.js` | 进程内 SQLite 记录存取 |
| `src/synthetic.js` / `src/seed.js` | 确定性合成序列与预置白频率记录 |
| `src/app.js` / `src/server.js` | Express 路由与服务入口 |

## 测试

```bash
npm test
```

覆盖：白频率中段斜率 ≈ −1/2、振幅加倍 σ_y 加倍且类型不变、全零序列 σ_y 恰为 0、
τ 超 T/3 被裁、钟差与分数频率在同一物理 τ 一致、独立重叠参考实现逐点比对
（卡住"非重叠冒充重叠"）、τ0 减半后同一物理 τ 仍一致、τ0 非正失败、过短序列
失败、缺项/非有限失败、记录间无滑窗残留、白相位/随机游走区段识别。
