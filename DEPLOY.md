# 智刷星 · 后端部署方案（让公网也能用 AI 出题 / OCR）

`server.py` 是「静态站点 + API」一体的服务：**一个进程同时托管前端页面和
`/api/analyze`、`/api/gen-exam`、`/api/ocr`、`/api/parse-file` 四个后端接口**，
AI 出题与 OCR 都依赖它。要让公网也能用这两项功能，只需把这个进程跑在
一个公网可达、能运行 Python 的地方即可。

> CloudStudio 静态部署不支持后端，因此公网 AI 功能必须走下方任一方案。

---

## 0. 安全前置（部署公网前必做）

- **API Key 只存在服务端**（`.env` 或平台环境变量），绝不下发浏览器，已内置防护。
- **访问口令（强烈建议）**：在 `.env`（或平台环境变量）加
  `SITE_TOKEN=一串只有你自己知道的字符串`。
  开启后，所有 `/api/*` 接口必须带此口令，否则返回 403；
  前端首次使用会弹窗让你输入并记住（存 localStorage），不影响浏览页面。
- **限流已内置**：按客户端 IP 每分钟上限 `gen-exam 15 / analyze 30 / ocr 20 /
  parse-file 60`，防止链接泄露后被刷爆你的模型额度。
- **切勿把 `.env` 提交到公开仓库**；部署到云平台时请用「环境变量」注入 Key，而不是上传 `.env` 文件。

---

## 1. 方案 A：本机 + Cloudflare 隧道（推荐，Key 不出本机）

最省事、最安全：AI 功能跑在你自己的电脑上，Cloudflare 只做"公网转发"，Key 永远不离开你的机器。

**步骤（在你的电脑上）：**
1. 安装并启动服务（需要 Python 3.10+）：
   ```bash
   cd 智刷星
   python -m venv .venv && .venv\Scripts\activate      # Windows
   pip install -r requirements.txt
   # 确认 .env 里已配好 LLM_API_KEY / LLM_BASE_URL / LLM_MODEL（及可选 SITE_TOKEN）
   python server.py                                    # 默认 http://0.0.0.0:8123
   ```
2. 下载并安装 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)。
3. 开一条隧道（保持此窗口运行）：
   ```bash
   cloudflared tunnel --url http://localhost:8123
   ```
4. 终端会打印一个 `https://xxxx.trycloudflare.com` 的公网地址 → 手机/外地直接打开即可，
   AI 出题、OCR 全部可用。

**优缺点**：零第三方服务器、Key 不外露；但需要你的电脑保持开机且这两个进程在跑。

---

## 2. 方案 B：部署到云主机（Render 免费 Web Service）

适合"不想依赖自己电脑一直开着"。后端（AI 出题 + OCR）和前端一起跑在 Render，手机/外地 24/7 可达（免费档空闲会休眠，首次访问有约 30~50s 冷启动）。

### 仓库已就绪
代码已配置好 Render 部署所需的一切，可直接推到 GitHub：
- `server.py`：前端 + API 一体服务，已支持读取 `PORT` / `BIND_HOST=0.0.0.0` / `SITE_TOKEN`；
- `render.yaml`：一键建服务声明（构建/启动/健康检查 `/` / 环境变量模板）；
- `runtime.txt`：锁定 Python 3.11.9；
- `requirements.txt`：依赖清单；
- `.gitignore`：**已排除 `.env`**，密钥不会进仓库（服务端还会对 `.env` 返回 403 双重保险）。

### 部署步骤（约 5 分钟）
1. **推代码到 GitHub**（本目录已 `git init` 并提交干净版本，不含 `.env`）：
   ```bash
   cd 智刷星
   git remote add origin https://github.com/你的用户名/zhishuaxing.git
   git branch -M main
   git push -u origin main
   ```
2. 打开 [render.com](https://render.com) → 注册/登录 → **New → Blueprint** → 授权 GitHub
   → 选 `zhishuaxing` 仓库 → Render 自动按 `render.yaml` 建服务。
   （或 **New → Web Service** 手动建：Build `pip install -r requirements.txt`、Start
   `python server.py`、Health Path `/`。）
3. 在 Render 控制台 **Environment** 里「手动填」两个密钥变量：
   - `LLM_API_KEY` = 你的智谱 Key（即本地 `.env` 里那串 `8c997c...`）
   - `SITE_TOKEN` = 自设一个口令（**强烈建议**，防公网链接泄露被刷额度）
   - `LLM_BASE_URL` / `LLM_MODEL` 已在 `render.yaml` 预填为智谱，无需改。
4. 点 **Deploy**，等构建（装依赖含 rapidocr，可能 3~5 分钟）→ 成功后会拿到
   `https://zhishuaxing.onrender.com`。
5. 手机/外地浏览器打开该地址 → 导入题目 → **AI 生成模拟卷 / 上传 OCR 全部可用**。

### 风险与备选
- **OCR 依赖较重**：`rapidocr-onnxruntime` 会拉 onnx/onnxruntime/opencv 等，build 体积较大、可能偏慢。
  若 Render 构建失败或超时，把 `requirements.txt` 里的 `rapidocr-onnxruntime` 删掉即可
  （OCR 会自动回退为不可用，AI 出题不受影响）。
- **免费档休眠**：15 分钟无访问会休眠，下次首访需等待冷启动；付费档可常驻。
- **Key 在云端**：平台以加密环境变量保存，不进代码；务必设 `SITE_TOKEN` 防刷。

> 同类平台（Railway / Fly.io / PythonAnywhere / 阿里云函数计算等）思路一致：
> 装依赖 → 跑 `python server.py` → 注入 `PORT` + `LLM_*` + `SITE_TOKEN` 环境变量。

---

## 3. 环境变量速查

| 变量 | 说明 | 默认 |
|---|---|---|
| `LLM_API_KEY` | 大模型 Key（必填，启用 AI） | 空 |
| `LLM_BASE_URL` | OpenAI 兼容接口地址 | `https://api.openai.com/v1` |
| `LLM_MODEL` | 模型名 | `gpt-4o-mini` |
| `LLM_TIMEOUT` | 请求超时（秒） | `90` |
| `PORT` | 服务端口（云平台注入） | `8123` |
| `BIND_HOST` | 监听地址 | `0.0.0.0` |
| `SITE_TOKEN` | 公网访问口令（建议设） | 空（不启用） |

---

## 4. 本地纯浏览（不暴露公网）

只想在自家电脑用：`python server.py` 后浏览器开 `http://127.0.0.1:8123` 即可，
AI / OCR 全部可用，无需任何部署。
