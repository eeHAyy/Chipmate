# ChipMate v0.2.1

修复 v0.2.0 安装包里的两个可用性问题。

## 修复

- **打包版烧录不可用**：后端在冻结（PyInstaller）模式下用 `sys.executable -m stcgal` 调起烧录，`sys.executable` 指向自身 exe，结果等于又启动了一个后端并因端口占用退出。现在改为通过 `--stcgal` 子进程入口调用内置 stcgal，打包版可正常进入串口烧录流程。
- **无 API Key 的提示误导**：原来提示“在项目根目录 .env 配置 DEEPSEEK_API_KEY”，但打包版没有 `.env`，普通用户无从下手。现在改为引导点右上角 ⚙ 打开「AI 设置」填入 Key。

## 变更

- PyInstaller 构建加入 `--collect-submodules stcgal`，确保冻结包里包含 stcgal 的协议与模型模块
- 版本号 0.2.1

## 已知限制

- 安装包未做代码签名，首次运行会有 SmartScreen 提示
- 未内置 API Key，首次使用需自行配置
