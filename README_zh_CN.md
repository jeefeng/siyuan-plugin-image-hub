# OSS 图床

一个用于思源笔记的阿里云 OSS 图床插件。它可以识别当前文章中的本地静态图片，上传到 OSS 后自动把本地链接替换为远程链接；上传失败的图片会保留原本的本地链接。

## 功能

- 预览当前文章中的静态图片。
- 一键上传当前文章全部本地图片，并在成功后替换链接。
- 单张图片手动上传。
- 已由当前图床管理的远程图片支持再次上传覆盖。
- 可选择在打开或切换文章时自动上传本地图片。
- 支持自定义 OSS 对象路径模板和自定义访问域名。

## 配置

在思源插件设置中填写：

- `AccessKey ID`
- `AccessKey Secret`
- `Bucket`
- `Endpoint`，例如 `oss-cn-hangzhou.aliyuncs.com`，也可以填写 `oss-cn-hangzhou`
- `对象路径模板`，默认 `siyuan/{docId}/{filename}`
- `自定义访问域名`，可选，例如 `https://img.example.com`
- `打开或切换文章时自动上传`，可选

对象路径模板支持：

- `{docId}` 当前文章块 ID
- `{filename}` 原文件名
- `{name}` 不含扩展名的文件名
- `{ext}` 扩展名
- `{yyyy}`、`{mm}`、`{dd}` 当前日期

## 本地启用

思源插件不是启动一个单独的网站服务，而是由思源从工作空间的插件目录加载。插件目录名必须和 `plugin.json` 里的 `name` 一致；当前项目还是模板名，所以目录名是 `plugin-sample`。

### 开发模式

1. 找到你的思源工作空间目录。
2. 把本项目放到 `{工作空间}/data/plugins/plugin-sample`。
3. 在项目目录执行：

```bash
pnpm install
pnpm run dev
```

4. 打开或重启思源。
5. 进入 `设置 -> 集市 -> 已下载`，启用 `OSS 图床`。
6. 修改代码后 `pnpm run dev` 会持续生成根目录的 `index.js`、`index.css`、`kernel.js` 和 `i18n/`。回到思源禁用再启用插件，或重启思源即可加载新版本。

### 打包安装

1. 在项目目录执行：

```bash
pnpm run build
```

2. 构建完成后会生成 `package.zip` 和 `dist/`。
3. 将 `dist/` 里的文件放到 `{工作空间}/data/plugins/plugin-sample`，或使用 `package.zip` 作为发布包。
4. 重启思源后在 `设置 -> 集市 -> 已下载` 启用插件。

## 阿里云 OSS 要求

插件使用浏览器端 `PUT Object` 上传。Bucket 需要允许思源客户端来源进行跨域上传，否则浏览器会拦截请求。

建议在 OSS Bucket 的 CORS 规则中允许：

- 来源：思源桌面端或浏览器端实际来源；开发/自用时也可按需放宽。
- 方法：`PUT`、`GET`、`HEAD`
- 允许 Header：`Authorization`、`Content-Type`、`x-oss-date`
- 暴露 Header：`ETag`

请优先使用权限受限的 RAM 用户 AccessKey，只授予目标 Bucket 必要的上传/覆盖权限。

## 使用

打开一篇文章后，点击顶栏图床按钮：

- `预览当前文章图片`：查看文章中的图片、上传单张图片或手动选择本地文件上传。
- `上传当前文章本地图片`：自动识别本地图片，逐张上传。成功的图片会替换为远程 URL，失败的图片继续使用本地 URL。
- `打开设置`：修改 OSS 配置。

第一次试用建议：

1. 先在 OSS Bucket 配好 CORS。
2. 在插件设置里保存 OSS 配置。
3. 新建一篇测试文章，插入一张本地图片。
4. 点击顶栏图床按钮，先选择 `预览当前文章图片` 确认图片能被识别。
5. 点击 `上传并替换` 或 `上传当前文章本地图片`。
6. 上传成功后，文章里的本地图片链接会变成 OSS 远程链接；上传失败时链接不会被替换。

## 构建

```bash
pnpm install
pnpm run build
```
