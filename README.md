# Adobe Premiere Pro 自动字幕插件 (Tencent Cloud Edition)

这是一个 Adobe Premiere Pro CEP 扩展插件，利用腾讯云 ASR（语音识别）服务，自动将序列中的音频转换为 SRT 字幕并导入回项目中。

## ✨ 功能特性

*   **一键生成**：自动导出当前序列音频，上传至云端识别。
*   **高精度识别**：基于腾讯云 ASR，支持中文、英文、粤语、日语、韩语等多种语言。
*   **自动对齐**：生成的 SRT 字幕时间码与剪辑序列完美匹配。
*   **高级配置**：支持热词表、数字转换模式、脏词过滤等高级选项。
*   **安全可靠**：密钥保存在本地，支持直接跳转腾讯云控制台管理资源。

## 🛠️ 开发与构建

如果你是从 GitHub 下载的源码，请按照以下步骤初始化：

1.  进入 `server` 目录：
    ```bash
    cd server
    ```
2.  安装依赖：
    ```bash
    npm install
    ```

## 📖 使用说明

### 1. 安装部署

### 步骤一：移动插件文件夹
将整个 `PR-Auto-Subtitles` 文件夹复制到 Adobe 的扩展目录中：

*   **Windows:** `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\`

### 步骤二：开启调试模式 (关键)
由于本插件未经过 Adobe 官方签名，必须开启调试模式才能加载。

**Windows:**
1.  按 `Win + R`，输入 `regedit` 打开注册表编辑器。
2.  找到路径：`HKEY_CURRENT_USER\Software\Adobe\CSXS.11` (对应 PR 2022/2023，如果是旧版本可能是 CSXS.9 或 CSXS.10)。
3.  右键空白处 -> 新建 -> **字符串值 (String Value)**。
4.  名称：`PlayerDebugMode`
5.  数值数据：`1`
6.  *(建议对 CSXS.9, CSXS.10, CSXS.11 都执行此操作以确保兼容)*

## 2. 使用方法

1.  **启动 Premiere Pro** 并打开一个项目，确保当前有一个**活动的序列 (Sequence)**。
2.  在顶部菜单栏选择：**窗口 (Window) -> 扩展 (Extensions) -> Auto Subtitles (Tencent)**。
3.  **配置腾讯云信息**：
    *   首次使用需输入 SecretId, SecretKey, Bucket Name 和 Region。
    *   界面提供了快捷链接（如“获取密钥”、“COS控制台”），点击可直接跳转到腾讯云对应页面。
    *   点击“保存配置”。
4.  **高级设置 (可选)**：
    *   **引擎模型**：根据视频语言选择（如中文、英语、粤语等）。
    *   **热词表 ID**：如有专有名词识别需求，可在腾讯云控制台创建热词表并填入 ID。
    *   **数字转换**：设置数字的显示格式（阿拉伯数字、中文数字等）。
5.  **开始生成**：
    *   点击“开始生成字幕”。插件将自动导出当前序列的**完整混音**进行识别。
    *   观察下方日志区域，等待进度完成。
    *   完成后，SRT 字幕文件（命名格式：`项目名_时间戳.srt`）将自动导入到项目素材箱中。
    *   **注意**：生成的字幕时间码从 00:00:00 开始，请将其拖入字幕轨道即可自动对齐。


## 4. 目录结构说明
```text
PR-Auto-Subtitles/
├── CSXS/manifest.xml       # 配置文件
├── client/                 # 前端界面
├── server/                 # 后端逻辑 (含 node_modules)
├── host/                   # PR 交互脚本
├── mp3.epr                 # 音频导出预设
└── .debug                  # 调试端口配置
```
