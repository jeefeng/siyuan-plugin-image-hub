# Image Hub

A SiYuan Note image-bed plugin. Upload local document images to Aliyun OSS / Tencent COS, replace links on success, and keep local links on failure.

[简体中文](README_zh_CN.md) | **English**

## Changelog

### v0.1.1 2026-07-21

* Optimize plugin icon and Bazaar manifest fields.
* Add Tencent COS support, config enable/disable, and manager UI tweaks.

Full history: [CHANGELOG.md](CHANGELOG.md).

---

## Quick start

1. Open **Settings → Marketplace → Downloaded** and enable **Image Hub**.
2. Click the **Image Hub** button on the editor top bar to open the manager.
3. Switch to **Storage Config**, pick a provider (Aliyun OSS / Tencent COS), fill credentials, save, and enable.
4. Back on **Current Article**, click **Upload Current Document Local Images**.

---

## Features

| Feature | Description |
|------|------|
| **Manager** | One dialog for images and configs |
| **Batch upload** | Upload all local images in the current doc |
| **Single upload** | Upload one image at a time |
| **Overwrite** | Re-upload and overwrite a managed remote object |
| **Multi-config** | Add / duplicate / switch / delete / enable configs |
| **Paste auto-upload** | Auto upload after paste (on by default) |
| **Switch auto-upload** | Auto upload when opening/switching docs (off by default) |
| **Path template** | Control object key with template variables |
| **Custom domain** | Use your CDN / domain in replaced links |
| **Command palette** | Run actions without opening the top bar |

### Providers

| Provider | Status |
|----------|--------|
| Aliyun OSS | ✅ Supported |
| Tencent COS | ✅ Supported |
| Qiniu | 📋 Planned |
| S3-compatible | 📋 Planned |

> Only `assets/` local images are uploaded. Widget/plugin paths (e.g. `kmind/kmind.svg`) are ignored.

---

## Usage

### Open the manager

1. Click the **Image Hub** top-bar button.
2. **Settings → Marketplace → Downloaded → Image Hub**.
3. Command palette: **Open Image Bed Manager**.

### Storage config

| Field | Description |
|------|------|
| Name | Display name for multi-config |
| Provider | Aliyun OSS / Tencent COS |
| AccessKey ID | Used to sign upload requests |
| AccessKey Secret | **Stored only in local plugin settings** |
| Bucket | Target bucket name |
| Endpoint | OSS e.g. `oss-cn-hangzhou.aliyuncs.com`; COS e.g. `cos.ap-guangzhou.myqcloud.com` or `ap-guangzhou` |
| Object key template | Default `siyuan/{docId}/{filename}` |
| Custom domain | Optional, e.g. `https://img.example.com` |
| Auto upload on paste | Upload and replace after paste |
| Auto upload on switch | Upload local images when switching docs |

Only one config can be enabled at a time.

#### Template variables

| Variable | Meaning |
|------|------|
| `{docId}` | Current document block ID |
| `{filename}` | Original file name |
| `{name}` | File name without extension |
| `{ext}` | Extension |
| `{yyyy}` `{mm}` `{dd}` | Current date |

### Image actions

On **Current Article**:

1. **Upload Current Document Local Images** — batch upload.
2. **Upload and Replace** — single image.
3. **Upload Again to Overwrite** — overwrite a managed remote object.

Successful uploads become remote URLs; failures keep local links.

### Commands

| Command | Action |
|------|------|
| Open Image Bed Manager | Open the manager |
| Upload Current Document Local Images | Upload local images in the current doc |

---

## Installation

### From Marketplace

**Settings → Marketplace → Plugins**, search **Image Hub**.

### Manual

1. Download the latest `package.zip` from [Releases](https://github.com/jeefeng/siyuan-plugin-image-hub/releases).
2. Extract to `{workspace}/data/plugins/siyuan-plugin-image-hub/`.
3. Restart SiYuan and enable the plugin.

> Folder name must match `plugin.json` `name`: `siyuan-plugin-image-hub`.

---

## Cloud setup

Uploads use browser `PUT Object`. Configure CORS on the bucket.

### Suggested CORS

| Setting | Recommended |
|------|------|
| Allowed Origins | Your SiYuan desktop / browser origin |
| Allowed Methods | `PUT`, `GET`, `HEAD` |
| Allowed Headers | `Authorization`, `Content-Type`, `x-oss-date` (OSS) |
| Expose Headers | `ETag` |

### Security

- Use a least-privilege AccessKey with object read/write on the target bucket only.
- AccessKey Secret stays in local plugin settings only.

---

## Recommended first test

1. Configure bucket CORS.
2. Save and enable a storage config in Image Hub.
3. Create a test doc and insert a local image.
4. Open the manager and confirm it appears under **Current Article**.
5. Run batch or single upload.
6. On success the link becomes a remote URL; on failure it stays local.

---

## Feedback

Open an [issue](https://github.com/jeefeng/siyuan-plugin-image-hub/issues) or email [jeefeng99@gmail.com](mailto:jeefeng99@gmail.com).

---

## License

MIT
