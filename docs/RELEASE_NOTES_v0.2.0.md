# ChipMate v0.2.0

首个可直接分发的 Windows 版本。

## 新增

- Windows 免环境安装包 `ChipMate-Setup-0.2.0.exe`（NSIS，内置打包后的后端，安装后无需 Python / Node）
- GitHub Actions：后端单元测试 + 前端类型检查与构建

## 修复

- 串口面板“定时发送”按钮文字未渲染，界面会显示成原始调用串（`t("serial.timed")`），现已正常显示“定时 开/关”
- 内部文件名残留 AI 工具备份后缀 `--codex`，已统一清理并同步修正所有引用

## 变更

- 后端版本号同步为 0.2.0
- README 补齐四张真实运行截图（主界面 / 串口与模拟 / 烧录 / AI 设置）

## 已知限制

- 安装包未做代码签名，首次运行 Windows SmartScreen 会提示“未知发布者”，选择“仍要运行”即可
- 未内置 API Key，首次使用需在「设置」里填入自己的模型服务 Key
- 烧录功能依赖 `stcgal`，安装包已内置后端依赖，开发模式下需自行 `pip install stcgal`
