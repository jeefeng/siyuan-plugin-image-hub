# Image Hub

一个思源笔记图床插件，自动将文档中的本地图片上传到阿里云 OSS，上传成功后替换为远程链接，上传失败的保留本地链接。

[简体中文](README_zh_CN.md) | **English**

## Quick start

1. 打开 **设置 → 集市 → 已下载**，启用 **Image Hub**。
2. 点击编辑器顶栏的 **图床** 按钮（![](data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHJlY3QgeD0iMyIgeT0iMyIgd2lkdGg9IjE4IiBoZWlnaHQ9IjE4IiByeD0iMiIgcnk9IjIiLz48Y2lyY2xlIGN4PSI4LjUiIGN5PSI4LjUiIHI9IjEuNSIvPjxwb2x5bGluZSBwb2ludHM9IjIxIDE1IDE2IDEwIDUgMjEiLz48L3N2Zz4=) 图标），打开图床管理。
3. 切换到 **存储配置** 标签页，填写阿里云 OSS 账号信息并保存。
4. 回到 **当前文章** 标签页，点击 **替换当前文章中的本地图片**。

---

## Features

| 功能 | 说明 |
|------|------|
| **图床管理器** | 统一的对话框管理图片与配置，支持切换视图 |
| **批量上传** | 一键上传当前文档全部本地图片 |
| **单张上传** | 逐张选择图片上传 |
| **覆盖上传** | 对已上传的远程图片，重新选择本地文件覆盖 OSS 对象 |
| **多配置** | 新增、复制、切换、删除多组存储配置 |
| **粘贴自动上传** | 粘贴图片后自动上传并替换（默认开启） |
| **切换自动上传** | 打开或切换文档时自动上传本地图片（默认关闭） |
| **自定义路径** | 使用模板变量控制 OSS 对象键路径 |
| **自定义域名** | 替换链接使用自己的 CDN 或域名 |
| **命令面板** | 从思源命令面板执行操作，无需打开顶栏 |

### 已支持的提供商

| Provider | Status |
|----------|--------|
| Aliyun OSS | ✅ 已支持 |
| Tencent COS | 📋 计划中 |
| Qiniu | 📋 计划中 |
| S3-compatible | 📋 计划中 |

---

## Usage

### 打开图床管理器

三种方式：

1. 点击编辑器顶栏的 **图床** 按钮（图片图标）。
2. **设置 → 集市 → 已下载 → Image Hub → 打开图床管理**。
3. 命令面板执行 **Open Image Bed Manager**。

### 存储配置

在 **存储配置** 标签页管理 OSS 连接信息：

| 字段 | 说明 |
|------|------|
| 配置名称 | 显示用名称，便于多配置区分 |
| 上传方式 | 目前仅阿里云 OSS 可用 |
| AccessKey ID | 用于签名 OSS 请求 |
| AccessKey Secret | **仅保存在本地插件设置中**，不会发送到别处 |
| Bucket | 目标 OSS Bucket 名称 |
| Endpoint | 例如 `oss-cn-hangzhou.aliyuncs.com`，也可只填 `oss-cn-hangzhou` |
| 对象路径模板 | 默认 `siyuan/{docId}/{filename}` |
| 自定义访问域名 | 可选，例如 `https://img.example.com` |
| 粘贴图片后自动上传 | 粘贴图片时自动上传并替换 |
| 切换文档时自动上传 | 打开或切换文档时自动上传本地图片 |

支持多组配置，从页面顶部的下拉菜单切换当前生效的配置。

#### 对象键模板变量

| 变量 | 说明 |
|------|------|
| `{docId}` | 当前文档块 ID |
| `{filename}` | 原文件名 |
| `{name}` | 不含扩展名的文件名 |
| `{ext}` | 文件扩展名 |
| `{yyyy}` `{mm}` `{dd}` | 当前日期 |

### 图片操作

在 **当前文章** 标签页：

1. **替换当前文章中的本地图片** — 自动扫描并批量上传所有本地图片。
2. **上传并替换** — 单张图片逐个上传。
3. **再次上传覆盖** — 对已管理的远程图片，选择新本地文件覆盖原 OSS 对象。

上传完成后，成功替换的图片链接会变成 OSS 远程 URL，失败的保持本地链接不变。页面上方会显示汇总结果。

### 命令

| 命令 | 操作 |
|------|------|
| Open Image Bed Manager | 打开图床管理器 |
| Upload Current Document Local Images | 上传当前文档中的本地图片 |

---

## Installation

### 从集市安装

打开 **设置 → 集市 → 插件**，搜索 **Image Hub** 安装。

### 手动安装

1. 从 [Releases](https://github.com/jeefeng/siyuan-plugin-image-hub/releases) 下载最新 `package.zip`。
2. 解压到 `{工作空间}/data/plugins/siyuan-plugin-image-hub/`。
3. 重启思源，在 **设置 → 集市 → 已下载** 中启用插件。

> 插件目录名必须与 `plugin.json` 的 `name` 字段一致：`siyuan-plugin-image-hub`。

---

## Aliyun OSS Setup

插件使用浏览器端 `PUT Object` 请求上传。Bucket 必须允许思源客户端的跨域请求：

### CORS 规则建议

| 设置 | 推荐值 |
|------|--------|
| 允许来源 | 实际的思源桌面端或浏览器端来源（自用可适当放宽） |
| 允许方法 | `PUT`、`GET`、`HEAD` |
| 允许 Header | `Authorization`、`Content-Type`、`x-oss-date` |
| 暴露 Header | `ETag` |

### 安全建议

- 使用权限受限的 **RAM 用户 AccessKey**，仅授予目标 Bucket 必要的 `PutObject` / `GetObject` 权限。
- AccessKey Secret **仅保存在本地插件设置中**，不会被发送到插件以外的任何地方。

---

## Recommended first test

1. 在 OSS Bucket 配置好 CORS。
2. 打开 Image Hub，在 **存储配置** 中保存阿里云 OSS 配置。
3. 新建一篇测试文档，插入一张本地图片。
4. 打开图床管理器，确认图片出现在 **当前文章** 中。
5. 点击 **替换当前文章中的本地图片** 或单张 **上传并替换**。
6. 上传成功后文档链接变为 OSS 远程 URL；失败则链接不变。

---

## Feedback

For feature requests or bug reports, please open an [issue](https://github.com/jeefeng/siyuan-plugin-image-hub/issues) or email [jeefeng99@gmail.com](mailto:jeefeng99@gmail.com).

---

## License

MIT
