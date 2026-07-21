# Bazaar 自动检查整改设计

## 目标

准备 `siyuan-plugin-image-hub` 0.1.1 版本，使发布产物通过思源笔记集市自动检查提出的五项要求。

## 修改内容

* 将 `plugin.json` 中的 `kernels`、`backends` 和 `frontends` 均设为 `["all"]`。
* 删除占位赞助地址 `https://ld246.com/sponsor`。由于未提供真实赞助地址，保留空的 `custom` 数组。
* 在保持原有外观和 PNG 格式的前提下缩小并优化 `icon.png`，使最终文件小于 20 KB。
* 将 `plugin.json` 和 `package.json` 中的发布版本从 0.1.0 升级至 0.1.1，并在 `CHANGELOG.md` 中添加对应记录。
* 运行项目现有的生产构建，使用现有构建配置重新生成根目录下的 `package.zip`。
* 提交并推送整改内容，创建 `v0.1.1` Git 标签及 GitHub Release，上传新的 `package.zip`，并确认该 Release 被标记为 Latest。

## 验证方式

* 解析两份 JSON 清单，确认版本均为 0.1.1。
* 确认三个平台字段的值均严格等于 `["all"]`，且占位赞助地址已不存在。
* 确认源文件 `icon.png` 和 `package.zip` 内的 `icon.png` 均小于 20 KB。
* 检查 ZIP 文件列表，确认发布所需文件均位于压缩包根目录。
* 运行项目的格式检查和生产构建；如存在与本次整改无关的原有错误，则单独记录。
* 检查 GitHub Release 的标签、附件和 Latest 状态，确认 `v0.1.1` 已取代 `v0.1.0` 成为最新版本。

## 工作范围

本次工作包括修改本地仓库、生成发布压缩包、提交并推送代码，以及创建 `v0.1.1` GitHub Release 并将其标记为 Latest。除非自动检查在新 Release 发布后自行更新，否则不主动修改 Bazaar 拉取请求或回复评论。
