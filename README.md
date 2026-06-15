# Image Hub

An image bed plugin for [SiYuan](https://github.com/siyuan-note/siyuan). It detects local static images in the current document, uploads them to a configured storage provider, and replaces local links with remote URLs only after successful uploads. Failed uploads keep their original local links.

[中文说明](README_zh_CN.md)

## Features

- **Image Bed Manager** — open a unified dialog to manage document images and storage configs.
- **Current document overview** — view total, local, and managed image counts for the active document.
- **Batch upload** — upload all local images in the current document and replace links after success.
- **Single-image upload** — upload and replace one local image at a time.
- **Overwrite managed images** — re-upload a local file to overwrite an existing remote object on the active image bed.
- **Multiple storage configs** — create, duplicate, switch, and delete configs; pick the active one from the manager header.
- **Auto upload on paste** — optionally upload and replace images right after they are pasted into a document (enabled by default).
- **Auto upload on document switch** — optionally upload local images when opening or switching documents.
- **Custom object key template** — control remote file paths with template variables.
- **Custom public domain** — use your own CDN or domain for replacement links.
- **Command palette** — run actions from SiYuan commands without opening the top bar button.

### Supported providers

| Provider | Status |
| --- | --- |
| Aliyun OSS | Supported |
| Tencent COS | Planned |
| Qiniu | Planned |
| S3-compatible storage | Planned |

## Requirements

- SiYuan **3.6.4** or later
- Node.js **24+** and **pnpm** (for development and building only)

## Installation

### From the marketplace

Search for **Image Hub** in `Settings -> Marketplace` and install it.

### Manual install

1. Download the latest `package.zip` from [Releases](https://github.com/jeefeng/siyuan-plugin-image-hub/releases).
2. Install it through SiYuan's plugin marketplace, or extract the files into:

```text
{workspace}/data/plugins/siyuan-plugin-image-hub
```

3. Restart SiYuan and enable **Image Hub** under `Settings -> Marketplace -> Downloaded`.

The plugin directory name must match the `name` field in `plugin.json`: `siyuan-plugin-image-hub`.

## Usage

### Open the manager

You can open the Image Bed Manager in any of these ways:

1. Click the **Image Bed** button in the editor top bar.
2. Go to `Settings -> Marketplace -> Downloaded -> Image Hub -> Open Image Bed Manager`.
3. Run the **Open Image Bed Manager** command from the command palette.

### Current Document tab

Use this tab to inspect and upload images in the active document:

- Review image stats: total, local, managed, and the active storage config.
- Switch the active storage config from the header dropdown.
- Click **Refresh Images** to reload the image list.
- Click **Upload Current Document Local Images** to upload all local images in batch.
- Click **Upload and Replace** on a single local image to upload it individually.
- Click **Upload Again to Overwrite** on a managed remote image to replace the remote object with a newly selected local file.

Upload behavior:

- Successful uploads replace the document link with the remote URL.
- Failed uploads leave the original local link unchanged.
- A summary message is shown after batch uploads.

### Storage Configs tab

Use this tab to manage image bed settings:

- **Add Config** / **Duplicate** — create a new config or copy the current one.
- Fill in the provider and connection fields, then click **Save Config**.
- Click **Check Config** to verify required fields are filled.
- Click **Delete Config** to remove the current config (at least one config must remain).

Available settings:

| Field | Description |
| --- | --- |
| Config name | Display name for this storage config |
| Provider | Upload backend; only Aliyun OSS is available now |
| AccessKey ID | Used to sign Aliyun OSS upload requests |
| AccessKey Secret | Stored locally in plugin settings only |
| Bucket | Target OSS bucket name |
| Endpoint | For example `oss-cn-hangzhou.aliyuncs.com`; `oss-cn-hangzhou` is also accepted |
| Object key template | Default: `siyuan/{docId}/{filename}` |
| Custom public domain | Optional, for example `https://img.example.com` |
| Auto upload and replace pasted images | Upload pasted images automatically |
| Auto upload when opening or switching docs | Upload local images when the document changes |

Object key template variables:

- `{docId}` — current document block ID
- `{filename}` — original file name
- `{name}` — file name without extension
- `{ext}` — file extension
- `{yyyy}`, `{mm}`, `{dd}` — current date parts

### Commands

| Command | Action |
| --- | --- |
| Open Image Bed Manager | Open the manager dialog |
| Upload Current Document Local Images | Upload all local images in the current document |

## Aliyun OSS setup

The plugin uploads with browser-side `PUT Object` requests. Your bucket must allow cross-origin uploads from the SiYuan client origin, otherwise the browser blocks the request.

Recommended OSS CORS rule:

- **Allowed origins:** the actual SiYuan desktop or browser origin; relax only as needed for personal use
- **Allowed methods:** `PUT`, `GET`, `HEAD`
- **Allowed headers:** `Authorization`, `Content-Type`, `x-oss-date`
- **Exposed headers:** `ETag`

Security recommendations:

- Prefer a limited RAM user AccessKey with only the required upload/overwrite permissions for the target bucket.
- Keep AccessKey Secret in local plugin settings; it is not sent anywhere except to sign OSS requests from your client.

## Development

SiYuan plugins are loaded from the workspace plugin directory. They do not start a standalone web server.

1. Clone this repository.
2. Place or link it at:

```text
{workspace}/data/plugins/siyuan-plugin-image-hub
```

3. Install dependencies and start the dev watcher:

```bash
pnpm install
pnpm run dev
```

4. Open or restart SiYuan.
5. Enable **Image Hub** under `Settings -> Marketplace -> Downloaded`.

`pnpm run dev` continuously generates root-level `index.js`, `index.css`, `kernel.js`, and `i18n/`. Disable and re-enable the plugin, or restart SiYuan, to load new changes.

### Build

```bash
pnpm install
pnpm run build
```

This produces `dist/` and `package.zip`. Use either output for distribution or local installation.

### Scripts

| Script | Description |
| --- | --- |
| `pnpm run dev` | Watch and build frontend + kernel entry |
| `pnpm run build` | Production build and package |
| `pnpm run lint` | Run ESLint |
| `pnpm run format` | Format code with dprint |

## Recommended first test

1. Configure CORS on your OSS bucket.
2. Open **Image Hub** and save an Aliyun OSS config under **Storage Configs**.
3. Create a test document and insert a local image.
4. Open the manager and confirm the image appears under **Current Document**.
5. Click **Upload and Replace**, or use **Upload Current Document Local Images** for batch upload.
6. After success, the document link should become the remote OSS URL. If upload fails, the local link stays unchanged.

## License

MIT
