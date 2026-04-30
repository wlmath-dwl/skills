---
name: realsee-pano-to-vr
description: 使用如视开放平台 API，将一组全景图（2:1，Equirectangular Panorama）自动处理成可在互联网访问的在线 VR 空间。当你被要求“使用如视平台将全景图转为 VR 空间”或者类似需求时使用该技能。
license: MIT
metadata:
  author: trae
  version: "1.0"
  api_base: https://app-gateway.realsee.ai
  tags:
    - vr
    - panorama
    - 3d
    - realsee
---

# realsee-pano-to-vr

**Description:** 使用如视开放平台 API，将一组全景图（2:1，Equirectangular Panorama）自动处理成可在互联网访问的在线 VR 空间。

**Details:** 

当你被要求“使用如视平台将全景图转为 VR 空间”或者类似需求时，请按照以下步骤执行：

### 1. 准备工作环境
- 创建虚拟环境并安装必要的依赖：`python-dotenv` 和 `requests`（如果网络不佳，建议使用国内镜像源如清华源安装）。确保用户系统有 Node.js 以便使用 `npx`，以及 `sips`（macOS 自带）用于处理非 `.jpg` 图片。
- **优先直接调用**本技能目录下的 `.agents/skills/realsee-pano-to-vr/main_template.py` 执行任务。该脚本已经包含了处理如视 API 调用、代理规避、Token 刷新和上传等全部经过验证的健壮逻辑。**如果直接执行该脚本失败，可将其复制到用户工作区（如 `src/main.py`）中进行 debug 和修改。**
- **必须主动询问用户**输入全景图所在的文件夹路径，而不是自行猜测或使用默认值。获取到路径后，将其配置到 `.env` 中的 `PANO_DIR`。
- 确保有一个用于生成中间产物的工作区目录（默认为 `./workspace`，可通过 `.env` 中的 `WORKSPACE_DIR` 配置）。
- 如果没有 `.env`，**必须主动询问用户**以下信息，然后再创建 `.env`：
  1. 如视开放平台的 `APP_KEY` 和 `APP_SECRET`。
  2. **账号的所属区域是中国国内还是国际**。
  获取信息后，根据区域配置相应的 `BASE_URL`（国内区为 `https://app-gateway.realsee.cn`，国际区为 `https://app-gateway.realsee.ai`）：
  ```env
  APP_KEY="xxx"
  APP_SECRET="xxx"
  BASE_URL="https://app-gateway.realsee.ai" # 或者 https://app-gateway.realsee.cn
  PANO_DIR="./pano"
  WORKSPACE_DIR="./workspace"
  ```

### 2. 核心执行逻辑说明（参考 `main_template.py`）
作为 AI 助手，在生成或修改脚本时请务必理解以下被固化在 `main_template.py` 中的 A 到 G 核心步骤，并在必要时向用户解释或做细微适配（如修改源图目录、文件名前缀等），但 **不要改变底层的接口调用方式**。

**A. 准备工作 (Workspace Preparation)**
1. 创建一个工作目录（如 `./workspace`）。
2. 在工作目录下创建 `images/` 文件夹。将输入的图片复制到该文件夹中。
   - 目标格式必须为 `.jpg`。如果原图是 `.png` 等格式，使用 `sips -s format jpeg <输入> --out <输出>` 或者 Python 图像库进行转换。
   - 图片命名格式为：`IMG_[YYYYMMDD]_[INDEX].jpg`（如 `IMG_20260413_000.jpg`）。
3. 在工作目录下生成 `manifest.json`：
   ```json
   {
     "version": "1.0",
     "project_name": "pano-to-3d-demo-[TIMESTAMP]",
     "scan_list": [
       { "id": "IMG_20260413_000", "floor": 0 },
       { "id": "IMG_20260413_001", "floor": 0 }
     ],
     "floor_map": {
       "0": 0
     }
   }
   ```
   *注意：`scan_list` 中的 `id` 不带后缀。*
4. 将 `manifest.json` 和 `images/` 目录打包压缩成 `pano-to-3d-demo-[TIMESTAMP].zip`。

**API 请求注意事项 (Critical)**
- **代理问题**：发送请求时，为了避免本地终端代理导致连接如视服务器失败（如 `ProxyError`），请在所有的 `requests` 调用中显式禁用代理：`proxies={"http": "", "https": ""}`。
- **状态校验**：如视 API 返回的成功标志为 `status == "success"`，而不是判断 `code`（`code` 通常是数字 `0` 表示成功）。务必使用 `resp.get("status") == "success"` 来校验响应。

**B & C. 获取鉴权 ACCESS_TOKEN**
调用 `POST {BASE_URL}/auth/access_token`，传入 `app_key` 和 `app_secret` (x-www-form-urlencoded)，获取 `access_token`。

**D. 获取文件临时上传凭证 UPLOAD_TOKEN**
携带 `access_token` 调用 `GET {BASE_URL}/open/v1/pano/file/token`。获取到的字典（包含 `prefix`, `bucket`, `region` 及临时密钥等）作为 `upload_token.json` 保存到本地。

**E. 上传 ZIP 压缩包**
使用 Node.js 工具 `@realsee/universal-uploader` 将 ZIP 文件上传到云端：
```bash
# 注意：`-p` 参数需根据 BASE_URL 动态决定。如果是 `realsee.ai` 则使用 `aws`，如果是 `realsee.cn` 则使用 `cos`。
npx @realsee/universal-uploader upload -p [aws|cos] -t ./workspace/upload_token.json -k pano-to-3d-demo-[TIMESTAMP].zip --file ./workspace/pano-to-3d-demo-[TIMESTAMP].zip --json
```

**F. 发起 VR 空间处理任务**
向 `{BASE_URL}/open/v1/pano/task/submit` 发起 POST 请求，携带 JSON body：
```json
{
  "project_name": "pano-to-3d-demo-[TIMESTAMP]",
  "private_cos_key": "<prefix>/pano-to-3d-demo-[TIMESTAMP].zip"
}
```
*注意：`private_cos_key` 需要将 UPLOAD_TOKEN 中的 `prefix` 与 `zip_name` 拼接。*

**G. 轮询查看任务状态**
获取到 `task_code` 后，每隔 10 秒通过 `GET {BASE_URL}/open/v1/pano/task/status?task_code={task_code}` 查询任务状态。
- 当返回的 `status` 包含 `success`, `complete` 或 `done`（忽略大小写）时：
  停止轮询，并向用户展示以下结果：
  - `task_code`
  - `project_id`
  - `vr_url` (从 `vr_url` / `view_url` / `url` 中获取)
- **工作区隔离与断点续传**：为了防止由于排队时间过长导致终端断开，同时也为了隔离不同任务的中间产物，`main_template.py` 脚本会自动在指定的 `WORKSPACE_DIR` 下为每个任务创建独立的子目录（以 `task_code` 命名），并将提交任务时获取到的 `task_code` 保存至该子目录的 `task_code.txt` 中。如果在轮询期间意外退出，下次直接运行脚本时它会自动扫描 `WORKSPACE_DIR`，读取未完成的任务文件并跳过前期步骤，直接恢复查询。你也可以在执行脚本时通过命令行参数强制查询特定任务：`python main_template.py [task_code]`。
- **Token 过期处理**：由于空间生成可能需要较长时间，轮询过程中 `access_token` 可能会过期（表现为 `code == -3` 或 `status` 包含 `expired`）。脚本必须捕获该错误，自动重新调用获取鉴权接口刷新 `access_token`，然后再继续轮询。

### 3. 注意事项
- 在脚本执行时，使用清晰的终端输出（如 `=== Step A: Prepare Workspace ===` 等）来让用户了解进度。
- 处理完成后，务必使用醒目的格式向用户打印最终生成的 VR 链接。
