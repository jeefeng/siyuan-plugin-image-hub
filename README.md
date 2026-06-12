# OSS Image Bed

An Aliyun OSS image bed plugin for SiYuan. It detects local static images in the current document, uploads them to OSS, and replaces local links with remote links only after successful uploads. Failed uploads keep their original local links.

## Features

- Preview static images in the current document.
- Upload all local images in the current document and replace links after success.
- Upload a single image manually.
- Re-upload managed remote images to overwrite the OSS object.
- Optionally auto upload when opening or switching documents.
- Customize OSS object key templates and public domains.

## Settings

Fill these fields in the plugin settings:

- `AccessKey ID`
- `AccessKey Secret`
- `Bucket`
- `Endpoint`, for example `oss-cn-hangzhou.aliyuncs.com`; `oss-cn-hangzhou` is also accepted.
- `Object key template`, default: `siyuan/{docId}/{filename}`
- `Custom public domain`, optional, for example `https://img.example.com`
- `Auto upload when opening or switching docs`, optional

Object key template variables:

- `{docId}` current document block ID
- `{filename}` original file name
- `{name}` file name without extension
- `{ext}` extension
- `{yyyy}`, `{mm}`, `{dd}` current date

## Local Enablement

A SiYuan plugin does not start a standalone web server. SiYuan loads it from the workspace plugin directory. The plugin directory name must match `name` in `plugin.json`; this project still uses the template name, so the directory is `plugin-sample`.

### Development Mode

1. Find your SiYuan workspace directory.
2. Put this project at `{workspace}/data/plugins/plugin-sample`.
3. Run these commands in the project directory:

```bash
pnpm install
pnpm run dev
```

4. Open or restart SiYuan.
5. Go to `Settings -> Marketplace -> Downloaded`, then enable `OSS Image Bed`.
6. `pnpm run dev` keeps generating root-level `index.js`, `index.css`, `kernel.js`, and `i18n/`. Disable and re-enable the plugin, or restart SiYuan, to load new changes.

### Packaged Install

1. Run:

```bash
pnpm run build
```

2. The build creates `package.zip` and `dist/`.
3. Put the files from `dist/` into `{workspace}/data/plugins/plugin-sample`, or use `package.zip` as the release package.
4. Restart SiYuan and enable the plugin from `Settings -> Marketplace -> Downloaded`.

## Aliyun OSS Requirements

The plugin uploads with browser-side `PUT Object` requests. Your bucket must allow cross-origin uploads from the SiYuan client origin, otherwise the browser blocks the request.

Recommended OSS CORS rule:

- Allowed origins: the actual SiYuan desktop or browser origin; relax only as needed for personal use.
- Allowed methods: `PUT`, `GET`, `HEAD`
- Allowed headers: `Authorization`, `Content-Type`, `x-oss-date`
- Exposed headers: `ETag`

Use a limited RAM user AccessKey whenever possible and grant only the required upload/overwrite permissions for the target bucket.

## Usage

Open a document, then click the image bed top bar button:

- `Preview Current Document Images`: view document images, upload one image, or manually select local files to upload.
- `Upload Current Document Local Images`: detect local images and upload them one by one. Successful images are replaced with remote URLs; failed images keep local URLs.
- `Open settings`: edit OSS settings.

Recommended first test:

1. Configure CORS on the OSS bucket.
2. Save OSS settings in the plugin settings panel.
3. Create a test document and insert one local image.
4. Click the image bed top bar button, then use `Preview Current Document Images` to confirm the image is detected.
5. Click `Upload and Replace` or `Upload Current Document Local Images`.
6. After success, the document image link becomes the OSS remote URL. If upload fails, the original local link remains unchanged.

## Build

```bash
pnpm install
pnpm run build
```
