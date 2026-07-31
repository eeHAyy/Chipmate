# 🔌 ChipMate

**AI 驱动的嵌入式故障诊断工作站** — 连接串口，AI 帮你读懂芯片在说什么。

接上开发板，ChipMate 自动识别串口异常（HardFault / Watchdog / Stack Overflow...），结合芯片手册数据，让 AI 给出排查步骤和修复建议。支持 **STC 单片机一键烧录**，无需硬件也能用**模拟模式**完整体验。

> 🎯 核心闭环：`连接串口 → 捕获异常 → 识别故障 → 结合芯片手册 → AI 分析 → 输出排查报告`

---

## ✨ 功能亮点

| 功能 | 说明 |
|------|------|
| 🩺 **AI 故障诊断** | 串口日志自动识别 HardFault、BusFault、Watchdog、Timeout 等 10+ 种异常，点击错误行一键 AI 分析 |
| 📚 **芯片手册上下文** | 拖入 PDF 数据手册，AI 回答引用具体引脚和寄存器 |
| 🔥 **STC 一键烧录** | 加载 HEX 文件，选择芯片型号和串口，冷启动即可烧录 STC 89/12/15/8 全系列 |
| 🎮 **模拟演示模式** | 无需硬件，生成模拟串口日志，完整体验故障识别 + AI 诊断闭环 |
| ⚡ **流式输出** | AI 回复逐字显示，支持随时停止 |
| 🎨 **多模型支持** | DeepSeek / OpenAI / Ollama / 豆包，界面直接配置 API Key，无需改文件 |
| 🔍 **日志搜索过滤** | 关键字高亮 / 过滤模式，支持 TXT/CSV 导出 |
| 🖱️ **可拖拽布局** | 侧栏宽度、面板高度自由调整 |
| 🌗 **深色/浅色主题** | 一键切换，自动保存偏好 |
| 📊 **完整串口参数** | 数据位 / 停止位 / 校验位 / 定时发送 / 收发字节计数 |

---

## 🖼️ 截图

<!-- 在这里放你的截图：
![主界面](docs/screenshots/main.png)
![AI 故障诊断](docs/screenshots/diagnose.png)
![烧录界面](docs/screenshots/flash.png)
![模拟模式](docs/screenshots/simulate.png)
-->

> 📝 截图占位 —— 运行 `npm run dev` 后按需补充

---

## 🏗️ 架构

```
┌─────────────────────────┐        ┌──────────────────────────┐
│   Electron + React UI   │  HTTP  │      Python FastAPI      │
│                         │ ─────► │                          │
│  ChatPanel  SerialPanel │        │  /chat     AI 对话(流式)  │
│  ChipPanel  FlashPanel  │        │  /serial   串口管理       │
│  Settings  搜索/过滤     │        │  /flash    STC 烧录       │
│                         │        │  /datasheet 芯片手册解析   │
└─────────────────────────┘        └──────────┬───────────────┘
                                              │
                                    ┌─────────┴─────────┐
                                    │ DeepSeek/OpenAI/  │
                                    │ Ollama/豆包  API   │
                                    └───────────────────┘
```

---

## 🚀 快速开始

### 环境要求

- Python 3.10+
- Node.js 18+

### 1. 启动后端

```bash
cd backend
pip install -r requirements.txt
pip install stcgal        # STC 烧录工具（可选）
cp ../.env.example ../.env
python main.py            # 启动在 http://127.0.0.1:8720
```

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev               # 启动在 http://127.0.0.1:5174
```

### 3. 配置 AI

点击右上角 ⚙️ 设置：
- **DeepSeek**（推荐）：注册 [platform.deepseek.com](https://platform.deepseek.com) 送免费额度，填入 API Key
- **Ollama 本地**：完全免费，接口地址填 `http://127.0.0.1:11434/v1`
- 或点击预设按钮一键填入豆包 / OpenAI

### 4. 快速体验（无需硬件）

1. 点击顶部 **⚡ 串口** 打开串口面板
2. 点 **模拟** 按钮 —— 自动生成模拟嵌入式日志
3. 点击红色错误行（如 HardFault）→ AI 自动分析

### 5. 烧录 STC 单片机

1. 点击顶部 **🔥 烧录**
2. 拖入 Keil 生成的 HEX 文件
3. 选择芯片型号和串口
4. 点开始烧录，**给 MCU 断电再上电**，等待烧录完成

---

## 🛠️ 技术栈

- **前端**：Electron + React 18 + TypeScript + Vite
- **后端**：Python FastAPI + pyserial
- **AI**：OpenAI SDK（兼容 DeepSeek / OpenAI / Ollama / 豆包）
- **烧录**：stcgal（STC 全系列 ISP 协议）

---

## 🗺️ Roadmap

- [x] 流式 AI 对话 + 多轮上下文
- [x] 串口故障识别 + AI 诊断闭环
- [x] 模拟数据演示模式
- [x] STC 单片机烧录
- [x] 串口搜索 / 过滤 / 导出
- [ ] 芯片手册向量检索（RAG，带来源页码）
- [ ] Modbus 协议解析
- [ ] 嵌入式计算器（波特率 / 定时器 / CRC）
- [ ] Windows 安装包发布

---

## 📄 License

[MIT](LICENSE)
