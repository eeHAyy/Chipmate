# ChipMate v0.4.1

把 API Key 从明文落盘改成 Windows 凭据级加密，其余行为不变。

## 安全

- **API Key 用 DPAPI 加密存储**：`settings.json` 里不再出现明文 Key，改存 `api_key_enc`（Windows `CryptProtectData` 密文，绑定当前用户账号）。换用户、换机器都解不开，只能重新填
- **老数据自动迁移**：旧版本明文保存的 Key，第一次加载时就地加密并抹掉明文，其他字段不受影响
- 设置页「清除 Key」会同时删除密文字段

## 说明

- 加解密走系统 API，无第三方依赖；非 Windows 平台退化为带前缀的明文（本项目只发布 Windows 包）
- 安装包仍未代码签名；首次安装若被杀软拦截，重试一次即可
- 静默升级时旧版必须先退出
