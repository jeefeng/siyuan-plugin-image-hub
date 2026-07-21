# Bazaar automated-check remediation

## Goal

Prepare version 0.1.1 of `siyuan-plugin-image-hub` so the release artifact satisfies the five issues reported by the SiYuan Bazaar automated check.

## Changes

- Set `kernels`, `backends`, and `frontends` to `["all"]` in `plugin.json`.
- Remove the placeholder `https://ld246.com/sponsor` funding URL. Keep an empty `custom` array because no real funding URL was provided.
- Resize and optimize `icon.png` while preserving its appearance and PNG format, with a final file size below 20 KB.
- Bump the release version from 0.1.0 to 0.1.1 in `plugin.json` and `package.json`, and add an entry to `CHANGELOG.md`.
- Run the existing production build and regenerate the root `package.zip` using the project's build configuration.

## Verification

- Parse both JSON manifests and confirm their versions are 0.1.1.
- Confirm each platform field is exactly `["all"]` and the placeholder funding URL is absent.
- Confirm both the source icon and the icon stored in `package.zip` are below 20 KB.
- Inspect the ZIP member list and verify required release files are at the archive root.
- Run the project's formatting check and production build, recording any pre-existing failures separately.

## Scope

This work modifies local repository files and the local release archive only. It does not commit, push, create a GitHub release, modify the Bazaar pull request, or mark a release as Latest.
