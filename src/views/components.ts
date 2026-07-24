import {
    type ArticleImage,
    type ProviderType,
    type StorageConfig,
} from "../types";
import {escapeAttribute, escapeHtml} from "../ui";

// ── 图标 ──────────────────────────────────────────

/** 显示/隐藏密钥图标 */
export function secretIcon(isVisible: boolean): string {
    if (isVisible) {
        // 睁眼 — 密码可见
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
</svg>`;
    }
    // 闭眼 — 密码隐藏
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"></path>
</svg>`;
}

// ── 布局 ──────────────────────────────────────────

/** 完整管理器布局 */
export function managerLayout(
    sidebar: string,
    main: string,
    i18n: Record<string, string>,
): string {
    return `<div class="image-bed-manager" role="dialog" aria-label="${escapeHtml(i18n.managerTitle)}">
    <aside class="image-bed-manager__sidebar">${sidebar}</aside>
    <main class="image-bed-manager__main">${main}</main>
</div>`;
}

/** 侧边栏导航 */
export function sidebar(
    brand: string,
    navs: {view: string; label: string; active: boolean}[],
): string {
    const buttons = navs.map((n) =>
        `<button class="image-bed-manager__nav${n.active ? " is-active" : ""}" data-view="${n.view}">${escapeHtml(n.label)}</button>`
    ).join("\n        ");
    return `<div class="image-bed-manager__brand"><svg><use xlink:href="#iconImage"></use></svg><span>${escapeHtml(brand)}</span></div>
        ${buttons}`;
}

/** 头部（标题 + 配置切换 + 操作按钮） */
export function header(
    title: string,
    subtitle: string,
    i18n: Record<string, string>,
    hasEnabled: boolean,
    enabledName?: string,
): string {
    const statusLine = hasEnabled
        ? `${escapeHtml(enabledName || "")} / ${escapeHtml(subtitle)}`
        : `<span class="image-bed-manager__no-enabled">${escapeHtml(i18n.noEnabledConfig)}</span>`;
    return `<header class="image-bed-manager__header">
    <div>
        <div class="image-bed-manager__title">${escapeHtml(title)}</div>
        <div class="image-bed-manager__subtitle">${statusLine}</div>
    </div>
    <div class="image-bed-manager__header-actions">
        <button class="b3-button b3-button--outline" data-action="refresh-manager">${escapeHtml(i18n.refreshImages)}</button>
        <button class="b3-button b3-button--primary" data-action="upload-current">${escapeHtml(i18n.uploadCurrentDocImages)}</button>
    </div>
</header>`;
}

// ── 统计卡片 ──────────────────────────────────────

/** 单张统计卡片 */
export function statCard(label: string, value: string): string {
    return `<div class="image-bed-manager__stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

// ── 图片列表 ──────────────────────────────────────

/** 单条图片 */
export function imageItem(image: ArticleImage, i18n: Record<string, string>): string {
    const canUpload = image.isLocal || image.isManagedRemote;
    const btnLabel = image.isLocal ? i18n.uploadAndReplace : i18n.reuploadOverwrite;
    const status = image.isLocal ? i18n.localImage : image.isManagedRemote ? i18n.managedRemoteImage : i18n.remoteImage;
    return `<div class="image-bed__item">
    <div class="image-bed__thumb"><img src="${escapeAttribute(image.displayUrl)}" loading="lazy"></div>
    <div class="image-bed__meta">
        <div class="image-bed__name">${escapeHtml(image.fileName)}</div>
        <div class="image-bed__source" title="${escapeAttribute(image.source)}">${escapeHtml(image.source)}</div>
        <div class="image-bed__status">${escapeHtml(status)}</div>
        ${image.objectKey ? `<div class="image-bed__source">${escapeHtml(image.objectKey)}</div>` : ""}
    </div>
    <button class="b3-button b3-button--upload" data-action="upload-image" data-label="${escapeAttribute(btnLabel)}" data-source="${escapeAttribute(image.source)}"${canUpload ? "" : " disabled"}>${escapeHtml(btnLabel)}</button>
</div>`;
}

/** 图片列表容器 */
export function imageList(images: ArticleImage[], i18n: Record<string, string>): string {
    if (images.length === 0) {
        return `<div class="image-bed__empty">${escapeHtml(i18n.noImagesFound)}</div>`;
    }
    return images.map((img) => imageItem(img, i18n)).join("");
}

// ── 文章视图 ──────────────────────────────────────

/** 当前文章标签页 */
export function articleView(
    images: ArticleImage[],
    hasDoc: boolean,
    config: StorageConfig,
    i18n: Record<string, string>,
): string {
    const local = images.filter((i) => i.isLocal).length;
    const managed = images.filter((i) => i.isManagedRemote).length;
    return `<section class="image-bed-manager__view">
    <div class="image-bed-manager__stats">
        ${statCard(i18n.totalImages, String(images.length))}
        ${statCard(i18n.localImages, String(local))}
        ${statCard(i18n.uploadedImages, String(managed))}
        ${statCard(i18n.activeStorage, config.name)}
    </div>
    <pre class="image-bed__result fn__none"></pre>
    ${hasDoc ? "" : `<div class="image-bed-manager__notice">${escapeHtml(i18n.openDocumentFirst)}</div>`}
    <div class="image-bed__list">${imageList(images, i18n)}</div>
</section>`;
}

// ── 配置视图 ──────────────────────────────────────

/** 配置卡片（含启用状态指示） */
export function configCard(
    config: StorageConfig,
    active: boolean,
    label: (p: ProviderType) => string,
    i18n: Record<string, string>,
): string {
    const statusText = config.enabled ? i18n.enabledConfig : i18n.disableConfig;
    return `<button class="image-bed-config-card${active ? " is-active" : ""}${config.enabled ? "" : " is-disabled"}" data-action="select-config" data-id="${escapeAttribute(config.id)}">
    <span class="image-bed-config-card__name">${escapeHtml(config.name)}</span>
    <small>${escapeHtml(label(config.provider))} / ${escapeHtml(config.bucket || i18n.bucketNotSet)}</small>
    <span class="image-bed-config-card__enabled">${escapeHtml(statusText)}</span>
</button>`;
}

/** 配置列表区 */
export function configList(
    configs: StorageConfig[],
    activeId: string,
    label: (p: ProviderType) => string,
    i18n: Record<string, string>,
): string {
    return `<div class="image-bed-manager__config-actions">
    <button class="b3-button b3-button--small b3-button--text" data-action="add-config">+ ${escapeHtml(i18n.addConfig)}</button>
    <button class="b3-button b3-button--small b3-button--text" data-action="duplicate-config">${escapeHtml(i18n.duplicateConfig)}</button>
</div>
${configs.map((c) => configCard(c, c.id === activeId, label, i18n)).join("")}`;
}

/** 配置输入字段 */
export function configField(
    key: string,
    label: string,
    value: string,
    i18n: Record<string, string>,
    secret?: boolean,
): string {
    const type = secret ? "password" : "text";
    if (secret) {
        return `<label class="image-bed-panel__field">
    <span>${escapeHtml(label)}</span>
    <div class="image-bed-panel__secret">
        <input class="b3-text-field fn__block" type="password" data-field="${escapeAttribute(key)}" value="${escapeAttribute(value)}">
        <button class="b3-button b3-button--outline image-bed-panel__secret-toggle" type="button" data-action="toggle-secret" data-target="${escapeAttribute(key)}" title="${escapeHtml(i18n.showSecret)}" aria-label="${escapeHtml(i18n.showSecret)}" aria-pressed="false">${secretIcon(false)}</button>
    </div>
</label>`;
    }
    return `<label class="image-bed-panel__field">
    <span>${escapeHtml(label)}</span>
    <input class="b3-text-field fn__block" type="${type}" data-field="${escapeAttribute(key)}" value="${escapeAttribute(value)}">
</label>`;
}

/** 提供商下拉框 */
export function providerField(current: ProviderType, i18n: Record<string, string>): string {
    const items: [ProviderType, string, boolean][] = [
        ["aliyun-oss", i18n.aliyunOss, false],
        ["tencent-cos", i18n.tencentCos, false],
        ["qiniu", i18n.qiniuSoon, true],
        ["s3", i18n.s3Soon, true],
    ];
    const opts = items.map(([v, l, d]) =>
        `<option value="${v}"${current === v ? " selected" : ""}${d ? " disabled" : ""}>${escapeHtml(l)}</option>`
    ).join("");
    return `<label class="image-bed-panel__field"><span>${escapeHtml(i18n.provider)}</span><select class="b3-select" data-field="provider">${opts}</select></label>`;
}

/** 配置表单 */
export function configForm(config: StorageConfig, i18n: Record<string, string>): string {
    return `${configField("name", i18n.configName, config.name, i18n)}
${providerField(config.provider, i18n)}
${configField("accessKeyId", i18n.accessKeyId, config.accessKeyId, i18n)}
${configField("accessKeySecret", i18n.accessKeySecret, config.accessKeySecret, i18n, true)}
${configField("bucket", i18n.bucket, config.bucket, i18n)}
${configField("endpoint", i18n.endpoint, config.endpoint, i18n)}
${configField("directoryTemplate", i18n.directoryTemplate, config.directoryTemplate, i18n)}
${configField("customDomain", i18n.customDomain, config.customDomain, i18n)}
<label class="image-bed-panel__switch image-bed-panel__toggle-enabled" data-action="toggle-config-enabled">
    <input type="checkbox" data-field="enabled"${config.enabled ? " checked" : ""}>
    <span>${config.enabled ? escapeHtml(i18n.enabledConfig) : escapeHtml(i18n.disableConfig)}</span>
</label>
<label class="image-bed-panel__switch">
    <input type="checkbox" data-field="autoUploadOnPaste"${config.autoUploadOnPaste ? " checked" : ""}>
    <span>${escapeHtml(i18n.autoUploadOnPaste)}</span>
</label>
<label class="image-bed-panel__switch">
    <input type="checkbox" data-field="autoUploadOnSwitch"${config.autoUploadOnSwitch ? " checked" : ""}>
    <span>${escapeHtml(i18n.autoUploadOnSwitch)}</span>
</label>`;
}

/** 完整配置视图 */
export function configView(
    configs: StorageConfig[],
    active: StorageConfig,
    label: (p: ProviderType) => string,
    i18n: Record<string, string>,
): string {
    return `<section class="image-bed-manager__view image-bed-manager__config-view">
    <div class="image-bed-manager__config-list">
        ${configList(configs, active.id, label, i18n)}
    </div>
    <form class="image-bed-manager__form">
        ${configForm(active, i18n)}
        <div class="image-bed-manager__form-actions">
            <button class="b3-button b3-button--primary" type="button" data-action="save-config">${escapeHtml(i18n.saveConfig)}</button>
            <button class="b3-button b3-button--outline" type="button" data-action="test-config">${escapeHtml(i18n.testConnection)}</button>
            <button class="b3-button b3-button--danger" type="button" data-action="delete-config">${escapeHtml(i18n.deleteConfig)}</button>
        </div>
        <div class="image-bed-manager__hint">${escapeHtml(i18n.multiProviderHint)}</div>
    </form>
</section>`;
}
