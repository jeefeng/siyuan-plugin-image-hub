import {
    Dialog,
    IProtyle,
    Plugin,
    Setting,
    fetchPost,
    getFrontend,
    showMessage,
} from "siyuan";
import "./index.scss";

const STORAGE_NAME = "image-bed-config";
const AUTO_UPLOAD_DELAY = 1200;
const PASTE_UPLOAD_DELAY = 1800;

type ImageKind = "markdown" | "html";
type ProviderType = "aliyun-oss" | "tencent-cos" | "qiniu" | "s3";
type ManagerView = "article" | "settings";

interface ImageBedSettings {
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    endpoint: string;
    directoryTemplate: string;
    customDomain: string;
    autoUploadOnPaste: boolean;
    autoUploadOnSwitch: boolean;
}

interface StorageConfig extends ImageBedSettings {
    id: string;
    name: string;
    provider: ProviderType;
    enabled: boolean;
}

interface ImageBedStorage {
    activeConfigId: string;
    configs: StorageConfig[];
}

interface ArticleImage {
    source: string;
    displayUrl: string;
    fileName: string;
    kind: ImageKind;
    isLocal: boolean;
    isManagedRemote: boolean;
    objectKey?: string;
}

interface UploadResult {
    image: ArticleImage;
    remoteUrl?: string;
    error?: string;
}

const DEFAULT_SETTINGS: ImageBedSettings = {
    accessKeyId: "",
    accessKeySecret: "",
    bucket: "",
    endpoint: "oss-cn-hangzhou.aliyuncs.com",
    directoryTemplate: "siyuan/{docId}/{filename}",
    customDomain: "",
    autoUploadOnPaste: true,
    autoUploadOnSwitch: false,
};

const IMAGE_EXTENSIONS = new Set([
    "apng",
    "avif",
    "bmp",
    "gif",
    "jpeg",
    "jpg",
    "png",
    "svg",
    "webp",
]);

export default class ImageBedPlugin extends Plugin {
    private storageData: ImageBedStorage = this.createDefaultStorage();
    private settingsData: StorageConfig = this.storageData.configs[0];
    private isMobile = false;
    private autoUploadTimer = 0;
    private pasteUploadTimers = new Map<string, number>();
    private currentDocId = "";
    private managerView: ManagerView = "article";
    private uploadingDocs = new Set<string>();

    async onload() {
        const frontend = getFrontend();
        this.isMobile = frontend === "mobile" || frontend === "browser-mobile";
        await this.loadSettings();
        this.registerCommands();
        this.createSettingPanel();
        this.eventBus.on("loaded-protyle-dynamic", this.handleProtyleChanged);
        this.eventBus.on("switch-protyle", this.handleProtyleChanged);
        this.eventBus.on("paste", this.handlePaste);
    }

    onLayoutReady() {
        this.addTopBar({
            icon: "iconImage",
            title: this.i18n.topBarTitle,
            position: "right",
            callback: () => {
                this.openManagerDialog().catch((error) => this.showError(error));
            },
        });
    }

    onunload() {
        window.clearTimeout(this.autoUploadTimer);
        this.pasteUploadTimers.forEach((timer) => window.clearTimeout(timer));
        this.pasteUploadTimers.clear();
        this.eventBus.off("loaded-protyle-dynamic", this.handleProtyleChanged);
        this.eventBus.off("switch-protyle", this.handleProtyleChanged);
        this.eventBus.off("paste", this.handlePaste);
    }

    private async openManagerDialog() {
        const dialog = new Dialog({
            title: this.i18n.managerTitle,
            content: "<div class=\"b3-dialog__content image-bed-manager-dialog\"></div>",
            width: this.isMobile ? "94vw" : "1080px",
            height: this.isMobile ? "86vh" : "760px",
        });
        const container = dialog.element.querySelector<HTMLElement>(".image-bed-manager-dialog");
        if (!container) {
            throw new Error(this.i18n.managerTitle);
        }
        await this.renderManager(container);
    }

    private registerCommands() {
        this.addCommand({
            langKey: "openManager",
            callback: () => {
                this.openManagerDialog().catch((error) => this.showError(error));
            },
        });
        this.addCommand({
            langKey: "uploadCurrentDocImages",
            callback: () => {
                this.uploadCurrentDocumentImages().catch((error) => this.showError(error));
            },
        });
    }

    private createSettingPanel() {
        const button = document.createElement("button");
        button.className = "b3-button b3-button--text";
        button.textContent = this.i18n.openManager;
        button.addEventListener("click", () => {
            this.openManagerDialog().catch((error) => this.showError(error));
        });
        this.setting = new Setting({});
        this.setting.addItem({
            title: this.i18n.managerTitle,
            description: this.i18n.managerDesc,
            actionElement: button,
        });
    }

    private async renderManager(element: HTMLElement) {
        const docId = this.currentDocId || this.findCurrentDocIdFromDom();
        const images = docId ? this.extractImages(await this.getDocumentMarkdown(docId)) : [];
        const config = this.getActiveConfig();
        element.innerHTML = `<div class="image-bed-manager">
    <aside class="image-bed-manager__sidebar">
        <div class="image-bed-manager__brand">
            <svg><use xlink:href="#iconImage"></use></svg>
            <span>${this.escapeHtml(this.i18n.managerTitle)}</span>
        </div>
        <button class="image-bed-manager__nav ${this.managerView === "article" ? "is-active" : ""}" data-view="article">${this.escapeHtml(this.i18n.articleHome)}</button>
        <button class="image-bed-manager__nav ${this.managerView === "settings" ? "is-active" : ""}" data-view="settings">${this.escapeHtml(this.i18n.storageConfigs)}</button>
    </aside>
    <main class="image-bed-manager__main">
        ${this.renderManagerHeader(config)}
        ${this.managerView === "article" ? this.renderArticleHome(images, Boolean(docId), config) : this.renderConfigManager(config)}
    </main>
</div>`;
        this.bindManagerEvents(element);
    }

    private renderManagerHeader(config: StorageConfig) {
        const options = this.storageData.configs.map((item) =>
            `<option value="${this.escapeAttribute(item.id)}" ${item.id === config.id ? "selected" : ""}>${this.escapeHtml(item.name)}</option>`
        ).join("");
        return `<header class="image-bed-manager__header">
    <div>
        <div class="image-bed-manager__title">${this.escapeHtml(this.managerView === "article" ? this.i18n.articleHome : this.i18n.storageConfigs)}</div>
        <div class="image-bed-manager__subtitle">${this.escapeHtml(this.providerLabel(config.provider))} / ${this.escapeHtml(config.bucket || this.i18n.bucketNotSet)}</div>
    </div>
    <div class="image-bed-manager__header-actions">
        <select class="b3-select" data-action="switch-active-config">${options}</select>
        <button class="b3-button b3-button--outline" data-action="refresh-manager">${this.escapeHtml(this.i18n.refreshImages)}</button>
        <button class="b3-button b3-button--text" data-action="upload-current">${this.escapeHtml(this.i18n.uploadCurrentDocImages)}</button>
    </div>
</header>`;
    }

    private renderArticleHome(images: ArticleImage[], hasDocument: boolean, config: StorageConfig) {
        const localCount = images.filter((item) => item.isLocal).length;
        const managedCount = images.filter((item) => item.isManagedRemote).length;
        return `<section class="image-bed-manager__view">
    <div class="image-bed-manager__stats">
        ${this.renderStat(this.i18n.totalImages, String(images.length))}
        ${this.renderStat(this.i18n.localImages, String(localCount))}
        ${this.renderStat(this.i18n.uploadedImages, String(managedCount))}
        ${this.renderStat(this.i18n.activeStorage, config.name)}
    </div>
    <pre class="image-bed__result fn__none"></pre>
    ${hasDocument ? "" : `<div class="image-bed-manager__notice">${this.escapeHtml(this.i18n.openDocumentFirst)}</div>`}
    <div class="image-bed__list">${this.renderImageList(images)}</div>
</section>`;
    }

    private renderStat(label: string, value: string) {
        return `<div class="image-bed-manager__stat">
    <span>${this.escapeHtml(label)}</span>
    <strong>${this.escapeHtml(value)}</strong>
</div>`;
    }

    private renderConfigManager(activeConfig: StorageConfig) {
        const configList = this.storageData.configs.map((config) => {
            const isActive = config.id === activeConfig.id;
            return `<button class="image-bed-config-card ${isActive ? "is-active" : ""}" data-action="select-config" data-id="${this.escapeAttribute(config.id)}">
    <span>${this.escapeHtml(config.name)}</span>
    <small>${this.escapeHtml(this.providerLabel(config.provider))} / ${this.escapeHtml(config.bucket || this.i18n.bucketNotSet)}</small>
</button>`;
        }).join("");
        return `<section class="image-bed-manager__view image-bed-manager__config-view">
    <div class="image-bed-manager__config-list">
        <div class="image-bed-manager__config-actions">
            <button class="b3-button b3-button--text" data-action="add-config">${this.escapeHtml(this.i18n.addConfig)}</button>
            <button class="b3-button b3-button--outline" data-action="duplicate-config">${this.escapeHtml(this.i18n.duplicateConfig)}</button>
        </div>
        ${configList}
    </div>
    <form class="image-bed-manager__form">
        ${this.renderConfigForm(activeConfig)}
        <div class="image-bed-manager__form-actions">
            <button class="b3-button b3-button--text" type="button" data-action="save-config">${this.escapeHtml(this.i18n.saveConfig)}</button>
            <button class="b3-button b3-button--outline" type="button" data-action="test-config">${this.escapeHtml(this.i18n.testConnection)}</button>
            <button class="b3-button b3-button--outline" type="button" data-action="delete-config">${this.escapeHtml(this.i18n.deleteConfig)}</button>
        </div>
        <div class="image-bed-manager__hint">${this.escapeHtml(this.i18n.multiProviderHint)}</div>
    </form>
</section>`;
    }

    private renderConfigForm(config: StorageConfig) {
        return `${this.renderManagerInput("name", this.i18n.configName, config.name)}
<label class="image-bed-panel__field">
    <span>${this.escapeHtml(this.i18n.provider)}</span>
    <select class="b3-select" data-field="provider">
        <option value="aliyun-oss" ${config.provider === "aliyun-oss" ? "selected" : ""}>${this.escapeHtml(this.i18n.aliyunOss)}</option>
        <option value="tencent-cos" disabled>${this.escapeHtml(this.i18n.tencentCosSoon)}</option>
        <option value="qiniu" disabled>${this.escapeHtml(this.i18n.qiniuSoon)}</option>
        <option value="s3" disabled>${this.escapeHtml(this.i18n.s3Soon)}</option>
    </select>
</label>
${this.renderManagerInput("accessKeyId", this.i18n.accessKeyId, config.accessKeyId)}
${this.renderManagerInput("accessKeySecret", this.i18n.accessKeySecret, config.accessKeySecret, "password")}
${this.renderManagerInput("bucket", this.i18n.bucket, config.bucket)}
${this.renderManagerInput("endpoint", this.i18n.endpoint, config.endpoint)}
${this.renderManagerInput("directoryTemplate", this.i18n.directoryTemplate, config.directoryTemplate)}
${this.renderManagerInput("customDomain", this.i18n.customDomain, config.customDomain)}
<label class="image-bed-panel__switch">
    <input type="checkbox" data-field="autoUploadOnPaste" ${config.autoUploadOnPaste ? "checked" : ""}>
    <span>${this.escapeHtml(this.i18n.autoUploadOnPaste)}</span>
</label>
<label class="image-bed-panel__switch">
    <input type="checkbox" data-field="autoUploadOnSwitch" ${config.autoUploadOnSwitch ? "checked" : ""}>
    <span>${this.escapeHtml(this.i18n.autoUploadOnSwitch)}</span>
</label>`;
    }

    private renderManagerInput(key: string, label: string, value: string, type = "text") {
        if (key === "accessKeySecret") {
            return `<label class="image-bed-panel__field">
    <span>${this.escapeHtml(label)}</span>
    <div class="image-bed-panel__secret">
        <input class="b3-text-field fn__block" type="${this.escapeAttribute(type)}" data-field="${this.escapeAttribute(key)}" value="${this.escapeAttribute(value)}">
        <button class="b3-button b3-button--outline image-bed-panel__secret-toggle" type="button" data-action="toggle-secret" data-target="${this.escapeAttribute(key)}" title="${this.escapeAttribute(this.i18n.showSecret)}" aria-label="${this.escapeAttribute(this.i18n.showSecret)}" aria-pressed="false">
            ${this.renderSecretIcon(false)}
        </button>
    </div>
</label>`;
        }
        return `<label class="image-bed-panel__field">
    <span>${this.escapeHtml(label)}</span>
    <input class="b3-text-field fn__block" type="${this.escapeAttribute(type)}" data-field="${this.escapeAttribute(key)}" value="${this.escapeAttribute(value)}">
</label>`;
    }

    private bindManagerEvents(element: HTMLElement) {
        element.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
            button.addEventListener("click", () => {
                this.managerView = button.dataset.view as ManagerView;
                this.renderManager(element).catch((error) => this.showError(error));
            });
        });

        element.querySelector<HTMLSelectElement>("[data-action='switch-active-config']")?.addEventListener("change", async (event) => {
            this.storageData.activeConfigId = (event.currentTarget as HTMLSelectElement).value;
            this.syncActiveSettings();
            await this.saveStorage();
            await this.renderManager(element);
        });

        element.querySelector<HTMLButtonElement>("[data-action='refresh-manager']")?.addEventListener("click", () => {
            this.renderManager(element).catch((error) => this.showError(error));
        });

        element.querySelectorAll<HTMLButtonElement>("[data-action='toggle-secret']").forEach((button) => {
            button.addEventListener("click", () => {
                const input = element.querySelector<HTMLInputElement>(`[data-field='${button.dataset.target || ""}']`);
                if (!input) {
                    return;
                }
                const shouldShow = input.type === "password";
                input.type = shouldShow ? "text" : "password";
                const label = shouldShow ? this.i18n.hideSecret : this.i18n.showSecret;
                button.title = label;
                button.setAttribute("aria-label", label);
                button.setAttribute("aria-pressed", String(shouldShow));
                button.innerHTML = this.renderSecretIcon(shouldShow);
            });
        });

        element.querySelector<HTMLButtonElement>("[data-action='upload-current']")?.addEventListener("click", async (event) => {
            const button = event.currentTarget as HTMLButtonElement;
            button.disabled = true;
            button.textContent = this.i18n.uploading;
            try {
                const results = await this.uploadCurrentDocumentImages(this.getCurrentDocId(), false);
                this.showInlineResult(element, this.formatUploadSummary(results));
                await this.renderManager(element);
            } catch (error) {
                this.showError(error);
            } finally {
                button.disabled = false;
                button.textContent = this.i18n.uploadCurrentDocImages;
            }
        });

        element.querySelectorAll<HTMLButtonElement>("[data-action='upload-image']").forEach((button) => {
            button.addEventListener("click", async () => {
                const label = button.dataset.label || this.i18n.uploadAndReplace;
                button.disabled = true;
                button.textContent = this.i18n.uploading;
                try {
                    const docId = this.getCurrentDocId();
                    const image = this.extractImages(await this.getDocumentMarkdown(docId)).find((item) => item.source === button.dataset.source);
                    if (!image) {
                        throw new Error(this.i18n.imageNoLongerExists);
                    }
                    if (image.isManagedRemote && !image.isLocal) {
                        await this.overwriteManagedImage(element, image, button);
                        return;
                    }
                    const result = await this.uploadArticleImage(docId, image);
                    if (result.remoteUrl && image.isLocal) {
                        await this.replaceImageInDocument(docId, image.source, result.remoteUrl);
                    }
                    this.showInlineResult(element, result.remoteUrl || this.i18n.uploadDone);
                    await this.renderManager(element);
                } catch (error) {
                    this.showError(error);
                } finally {
                    if (button.isConnected) {
                        button.disabled = false;
                        button.textContent = label;
                    }
                }
            });
        });

        element.querySelectorAll<HTMLButtonElement>("[data-action='select-config']").forEach((button) => {
            button.addEventListener("click", async () => {
                this.storageData.activeConfigId = button.dataset.id || this.storageData.activeConfigId;
                this.syncActiveSettings();
                await this.saveStorage();
                await this.renderManager(element);
            });
        });

        element.querySelector<HTMLButtonElement>("[data-action='add-config']")?.addEventListener("click", async () => {
            const config = this.createStorageConfig(this.i18n.newConfigName);
            this.storageData.configs.push(config);
            this.storageData.activeConfigId = config.id;
            this.syncActiveSettings();
            await this.saveStorage();
            await this.renderManager(element);
        });

        element.querySelector<HTMLButtonElement>("[data-action='duplicate-config']")?.addEventListener("click", async () => {
            const active = this.getActiveConfig();
            const config = {...active, id: this.createId(), name: `${active.name} Copy`};
            this.storageData.configs.push(config);
            this.storageData.activeConfigId = config.id;
            this.syncActiveSettings();
            await this.saveStorage();
            await this.renderManager(element);
        });

        element.querySelector<HTMLButtonElement>("[data-action='save-config']")?.addEventListener("click", async () => {
            this.updateActiveConfigFromForm(element);
            await this.saveStorage();
            showMessage(this.i18n.settingsSaved);
            await this.renderManager(element);
        });

        element.querySelector<HTMLButtonElement>("[data-action='test-config']")?.addEventListener("click", () => {
            this.updateActiveConfigFromForm(element);
            this.assertSettingsReady();
            showMessage(this.i18n.configLooksReady);
        });

        element.querySelector<HTMLButtonElement>("[data-action='delete-config']")?.addEventListener("click", async () => {
            if (this.storageData.configs.length <= 1) {
                showMessage(this.i18n.keepOneConfig, 5000, "error");
                return;
            }
            if (!window.confirm(this.i18n.confirmDeleteConfig)) {
                return;
            }
            const activeId = this.storageData.activeConfigId;
            this.storageData.configs = this.storageData.configs.filter((config) => config.id !== activeId);
            this.storageData.activeConfigId = this.storageData.configs[0].id;
            this.syncActiveSettings();
            await this.saveStorage();
            await this.renderManager(element);
        });
    }

    private async overwriteManagedImage(element: HTMLElement, image: ArticleImage, button: HTMLButtonElement) {
        if (!image.objectKey) {
            throw new Error(this.i18n.imageNoLongerExists);
        }
        const file = await this.pickImageFile();
        if (!file) {
            button.disabled = false;
            button.textContent = button.dataset.label || this.i18n.reuploadOverwrite;
            return;
        }
        const remoteUrl = await this.uploadBlob(file, image.objectKey, file.type || this.getMimeType(file.name));
        this.showInlineResult(element, remoteUrl);
        await this.renderManager(element);
    }

    private showInlineResult(element: HTMLElement, text: string) {
        const resultElement = element.querySelector<HTMLElement>(".image-bed__result");
        if (!resultElement) {
            showMessage(text);
            return;
        }
        resultElement.textContent = text;
        resultElement.classList.remove("fn__none");
    }

    private updateActiveConfigFromForm(element: HTMLElement) {
        const active = this.getActiveConfig();
        const readValue = (key: string) => element.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field='${key}']`)?.value.trim() || "";
        active.name = readValue("name") || active.name;
        active.provider = (readValue("provider") || "aliyun-oss") as ProviderType;
        active.accessKeyId = readValue("accessKeyId");
        active.accessKeySecret = readValue("accessKeySecret");
        active.bucket = readValue("bucket");
        active.endpoint = readValue("endpoint");
        active.directoryTemplate = readValue("directoryTemplate") || DEFAULT_SETTINGS.directoryTemplate;
        active.customDomain = readValue("customDomain");
        active.autoUploadOnPaste = Boolean(element.querySelector<HTMLInputElement>("[data-field='autoUploadOnPaste']")?.checked);
        active.autoUploadOnSwitch = Boolean(element.querySelector<HTMLInputElement>("[data-field='autoUploadOnSwitch']")?.checked);
        this.syncActiveSettings();
    }

    private getActiveConfig() {
        const config = this.storageData.configs.find((item) => item.id === this.storageData.activeConfigId) || this.storageData.configs[0];
        if (!config) {
            const fallback = this.createStorageConfig(this.i18n.defaultConfigName || "Aliyun OSS");
            this.storageData.configs = [fallback];
            this.storageData.activeConfigId = fallback.id;
            return fallback;
        }
        return config;
    }

    private syncActiveSettings() {
        this.settingsData = this.getActiveConfig();
    }

    private async saveStorage() {
        this.syncActiveSettings();
        await this.saveData(STORAGE_NAME, this.storageData);
    }

    private createDefaultStorage(): ImageBedStorage {
        const config = this.createStorageConfig("Aliyun OSS");
        return {
            activeConfigId: config.id,
            configs: [config],
        };
    }

    private createStorageConfig(name: string): StorageConfig {
        return {
            id: this.createId(),
            name,
            provider: "aliyun-oss",
            enabled: true,
            ...DEFAULT_SETTINGS,
        };
    }

    private createId() {
        return `cfg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    private migrateStorage(raw: any): ImageBedStorage {
        if (raw?.configs && Array.isArray(raw.configs)) {
            const configs = raw.configs.map((item: any) => ({
                ...this.createStorageConfig(item.name || "Aliyun OSS"),
                ...item,
                provider: item.provider || "aliyun-oss",
                enabled: item.enabled !== false,
                directoryTemplate: item.directoryTemplate || DEFAULT_SETTINGS.directoryTemplate,
            }));
            return {
                activeConfigId: raw.activeConfigId || configs[0]?.id || "",
                configs: configs.length > 0 ? configs : [this.createStorageConfig("Aliyun OSS")],
            };
        }
        const legacy = {
            ...this.createStorageConfig("Aliyun OSS"),
            ...(raw || {}),
            id: this.createId(),
            name: raw?.bucket ? `Aliyun OSS - ${raw.bucket}` : "Aliyun OSS",
            provider: "aliyun-oss" as ProviderType,
        };
        return {
            activeConfigId: legacy.id,
            configs: [legacy],
        };
    }

    private providerLabel(provider: ProviderType) {
        switch (provider) {
            case "tencent-cos":
                return this.i18n.tencentCos;
            case "qiniu":
                return this.i18n.qiniu;
            case "s3":
                return this.i18n.s3Compatible;
            case "aliyun-oss":
            default:
                return this.i18n.aliyunOss;
        }
    }

    private pickImageFile(): Promise<File | null> {
        return new Promise((resolve) => {
            const inputElement = document.createElement("input");
            let settled = false;
            const cleanup = () => {
                window.removeEventListener("focus", handleFocus);
                inputElement.remove();
            };
            const finish = (file: File | null) => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                resolve(file);
            };
            const handleFocus = () => {
                window.setTimeout(() => finish(inputElement.files?.[0] || null), 300);
            };
            inputElement.type = "file";
            inputElement.accept = "image/*";
            inputElement.className = "fn__none";
            inputElement.addEventListener("cancel", () => finish(null), {once: true});
            inputElement.addEventListener("change", () => {
                finish(inputElement.files?.[0] || null);
            }, {once: true});
            document.body.appendChild(inputElement);
            window.addEventListener("focus", handleFocus);
            inputElement.click();
        });
    }

    private renderSecretIcon(isVisible: boolean) {
        if (isVisible) {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="m2 2 20 20"></path>
    <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58"></path>
    <path d="M16.68 16.68A10.94 10.94 0 0 1 12 18C7 18 3.73 14.89 2 12c.8-1.34 1.89-2.62 3.21-3.67"></path>
    <path d="M9.88 5.09A10.72 10.72 0 0 1 12 5c5 0 8.27 3.11 10 7a13.15 13.15 0 0 1-2.54 3.33"></path>
</svg>`;
        }
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"></path>
    <circle cx="12" cy="12" r="3"></circle>
</svg>`;
    }

    private renderImageList(images: ArticleImage[]) {
        if (images.length === 0) {
            return `<div class="image-bed__empty">${this.escapeHtml(this.i18n.noImagesFound)}</div>`;
        }
        return images.map((image) => {
            const canUpload = image.isLocal || image.isManagedRemote;
            const label = image.isLocal ? this.i18n.uploadAndReplace : this.i18n.reuploadOverwrite;
            const status = image.isLocal
                ? this.i18n.localImage
                : image.isManagedRemote
                ? this.i18n.managedRemoteImage
                : this.i18n.remoteImage;
            return `<div class="image-bed__item">
    <div class="image-bed__thumb"><img src="${this.escapeAttribute(image.displayUrl)}" loading="lazy"></div>
    <div class="image-bed__meta">
        <div class="image-bed__name">${this.escapeHtml(image.fileName)}</div>
        <div class="image-bed__source" title="${this.escapeAttribute(image.source)}">${this.escapeHtml(image.source)}</div>
        <div class="image-bed__status">${this.escapeHtml(status)}</div>
        <div class="image-bed__source">${this.escapeHtml(image.objectKey || "")}</div>
    </div>
    <button class="b3-button b3-button--outline" data-action="upload-image" data-label="${this.escapeAttribute(label)}" data-source="${this.escapeAttribute(image.source)}" ${canUpload ? "" : "disabled"}>${this.escapeHtml(label)}</button>
</div>`;
        }).join("");
    }

    private async uploadCurrentDocumentImages(docId = this.getCurrentDocId(), notify = true) {
        this.assertSettingsReady();
        if (this.uploadingDocs.has(docId)) {
            return [];
        }
        this.uploadingDocs.add(docId);
        try {
            const markdown = await this.getDocumentMarkdown(docId);
            const localImages = this.extractImages(markdown).filter((image) => image.isLocal);
            if (localImages.length === 0) {
                if (notify) {
                    showMessage(this.i18n.noLocalImagesFound);
                }
                return [];
            }

            const results: UploadResult[] = [];
            const handledSources = new Set<string>();
            for (const image of localImages) {
                if (handledSources.has(image.source)) {
                    continue;
                }
                handledSources.add(image.source);
                try {
                    const result = await this.uploadArticleImage(docId, image);
                    results.push(result);
                    if (result.remoteUrl) {
                        await this.replaceImageInDocument(docId, image.source, result.remoteUrl);
                    }
                } catch (error) {
                    results.push({
                        image,
                        error: this.toErrorMessage(error),
                    });
                }
            }
            if (notify) {
                showMessage(this.formatUploadSummary(results));
            }
            return results;
        } finally {
            this.uploadingDocs.delete(docId);
        }
    }

    private async uploadArticleImage(docId: string, image: ArticleImage): Promise<UploadResult> {
        this.assertSettingsReady();
        const blob = await this.fetchImageBlob(image);
        const objectKey = image.objectKey || this.createObjectKey(docId, image.fileName);
        const remoteUrl = await this.uploadBlob(blob, objectKey, blob.type || this.getMimeType(image.fileName));
        return {image, remoteUrl};
    }

    private async uploadBlob(blob: Blob, objectKey: string, contentType: string) {
        if (this.settingsData.provider !== "aliyun-oss") {
            throw new Error(this.i18n.providerComingSoon);
        }
        const endpoint = this.normalizeEndpoint(this.settingsData.endpoint);
        const bucket = this.settingsData.bucket;
        const ossDate = new Date().toUTCString();
        const resource = `/${bucket}/${objectKey}`;
        const stringToSign = ["PUT", "", contentType, ossDate, `x-oss-date:${ossDate}\n${resource}`].join("\n");
        const signature = await this.signOssRequest(stringToSign, this.settingsData.accessKeySecret);
        const uploadUrl = `${this.protocol()}://${bucket}.${endpoint}/${this.encodeObjectKey(objectKey)}`;
        const response = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
                Authorization: `OSS ${this.settingsData.accessKeyId}:${signature}`,
                "Content-Type": contentType,
                "x-oss-date": ossDate,
            },
            body: blob,
        });
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(this.formatUploadError(response, text));
        }
        return this.publicUrl(objectKey);
    }

    private formatUploadError(response: Response, text: string) {
        const ossError = this.parseOssError(text);
        if (ossError.code === "AccessDenied" && ossError.endpoint) {
            return this.i18n.ossEndpointMismatch
                .replace("${endpoint}", ossError.endpoint)
                .replace("${bucket}", ossError.bucket || this.settingsData.bucket);
        }
        if (ossError.code === "AccessDenied" && ossError.message.indexOf("valid Date") > -1) {
            return this.i18n.ossInvalidDate;
        }
        const details = [
            `${this.i18n.uploadFailed}: ${response.status} ${response.statusText}`.trim(),
            ossError.code ? `Code: ${ossError.code}` : "",
            ossError.message ? `Message: ${ossError.message}` : "",
            ossError.requestId ? `RequestId: ${ossError.requestId}` : "",
            !ossError.code && text ? text : "",
        ].filter(Boolean);
        return details.join("\n");
    }

    private parseOssError(text: string) {
        const emptyError = {
            bucket: "",
            code: "",
            endpoint: "",
            message: "",
            requestId: "",
        };
        if (!text.trim().startsWith("<")) {
            return emptyError;
        }
        try {
            const doc = new DOMParser().parseFromString(text, "application/xml");
            const read = (name: string) => doc.querySelector(name)?.textContent?.trim() || "";
            return {
                bucket: read("Bucket"),
                code: read("Code"),
                endpoint: read("Endpoint"),
                message: read("Message"),
                requestId: read("RequestId"),
            };
        } catch {
            return emptyError;
        }
    }

    private async fetchImageBlob(image: ArticleImage) {
        const response = await fetch(this.toFetchableUrl(image.source));
        if (!response.ok) {
            throw new Error(`${this.i18n.readImageFailed}: ${image.source}`);
        }
        return response.blob();
    }

    private async replaceImageInDocument(docId: string, source: string, remoteUrl: string) {
        const markdown = await this.getDocumentMarkdown(docId);
        const nextMarkdown = this.replaceSource(markdown, source, remoteUrl);
        if (nextMarkdown !== markdown) {
            await this.updateDocumentMarkdown(docId, nextMarkdown);
        }
    }

    private replaceSource(markdown: string, source: string, remoteUrl: string) {
        return markdown.split(source).join(remoteUrl);
    }

    private extractImages(markdown: string): ArticleImage[] {
        const images: ArticleImage[] = [];
        const seen = new Set<string>();
        const pushImage = (source: string, kind: ImageKind) => {
            const cleanSource = source.trim();
            if (!cleanSource || seen.has(cleanSource) || !this.looksLikeImage(cleanSource)) {
                return;
            }
            seen.add(cleanSource);
            const objectKey = this.getManagedObjectKey(cleanSource);
            images.push({
                source: cleanSource,
                displayUrl: this.toDisplayUrl(cleanSource),
                fileName: this.getFileName(cleanSource),
                kind,
                isLocal: this.isLocalImage(cleanSource),
                isManagedRemote: Boolean(objectKey),
                objectKey,
            });
        };

        const markdownImageRegExp = /!\[[^\]]*]\(([^)\n]+)\)/g;
        let markdownMatch: RegExpExecArray | null;
        while ((markdownMatch = markdownImageRegExp.exec(markdown)) !== null) {
            const source = this.extractMarkdownUrl(markdownMatch[1]);
            pushImage(source, "markdown");
        }

        const htmlImageRegExp = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
        let htmlMatch: RegExpExecArray | null;
        while ((htmlMatch = htmlImageRegExp.exec(markdown)) !== null) {
            pushImage(htmlMatch[1], "html");
        }
        return images;
    }

    private extractMarkdownUrl(target: string) {
        const trimmed = target.trim();
        if (trimmed.startsWith("<")) {
            const end = trimmed.indexOf(">");
            if (end > 1) {
                return trimmed.slice(1, end);
            }
        }
        const titleMatch = trimmed.match(/\s+["'(]/);
        if (titleMatch?.index) {
            return trimmed.slice(0, titleMatch.index);
        }
        return trimmed.split(/\s+/)[0] || "";
    }

    private looksLikeImage(source: string) {
        const extension = this.getExtension(source);
        return IMAGE_EXTENSIONS.has(extension);
    }

    private isLocalImage(source: string) {
        if (/^(https?:)?\/\//i.test(source)) {
            return false;
        }
        if (/^(data|blob|mailto|javascript):/i.test(source)) {
            return false;
        }
        return true;
    }

    private toDisplayUrl(source: string) {
        if (/^(https?:)?\/\//i.test(source) || /^(data|blob|file):/i.test(source)) {
            return source;
        }
        return source.startsWith("/") ? source : `/${source}`;
    }

    private toFetchableUrl(source: string) {
        if (/^https?:\/\//i.test(source)) {
            return source;
        }
        if (/^\/\//.test(source)) {
            return `${location.protocol}${source}`;
        }
        if (/^file:\/\//i.test(source)) {
            return source;
        }
        const path = source.startsWith("/") ? source : `/${source}`;
        return encodeURI(`${location.origin}${path}`);
    }

    private createObjectKey(docId: string, fileName: string) {
        const safeFileName = this.sanitizeFileName(fileName);
        const now = new Date();
        const replacements: Record<string, string> = {
            "{docId}": docId,
            "{filename}": safeFileName,
            "{name}": safeFileName.replace(/\.[^.]+$/, ""),
            "{ext}": this.getExtension(safeFileName),
            "{yyyy}": String(now.getFullYear()),
            "{mm}": this.pad2(now.getMonth() + 1),
            "{dd}": this.pad2(now.getDate()),
        };
        let objectKey = this.settingsData.directoryTemplate || DEFAULT_SETTINGS.directoryTemplate;
        Object.keys(replacements).forEach((key) => {
            const value = replacements[key];
            objectKey = objectKey.split(key).join(value);
        });
        return objectKey.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
    }

    private pad2(value: number) {
        return value < 10 ? `0${value}` : String(value);
    }

    private sanitizeFileName(fileName: string) {
        const fallback = `image-${Date.now()}.png`;
        return (fileName || fallback).replace(/[\\/:*?"<>|#\s]+/g, "-");
    }

    private getManagedObjectKey(source: string) {
        try {
            const url = new URL(source, location.origin);
            const endpoint = this.normalizeEndpoint(this.settingsData.endpoint);
            const bucketHost = `${this.settingsData.bucket}.${endpoint}`;
            const customDomain = this.normalizeDomain(this.settingsData.customDomain);
            const managedHosts = new Set([bucketHost]);
            if (customDomain) {
                managedHosts.add(new URL(customDomain).host);
            }
            if (!managedHosts.has(url.host)) {
                return "";
            }
            return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
        } catch {
            return "";
        }
    }

    private publicUrl(objectKey: string) {
        const domain = this.normalizeDomain(this.settingsData.customDomain);
        if (domain) {
            return `${domain}/${this.encodeObjectKey(objectKey)}`;
        }
        const endpoint = this.normalizeEndpoint(this.settingsData.endpoint);
        return `${this.protocol()}://${this.settingsData.bucket}.${endpoint}/${this.encodeObjectKey(objectKey)}`;
    }

    private normalizeDomain(domain: string) {
        const value = domain.trim().replace(/\/+$/, "");
        if (!value) {
            return "";
        }
        return /^https?:\/\//i.test(value) ? value : `${this.protocol()}://${value}`;
    }

    private normalizeEndpoint(endpoint: string) {
        return endpoint.trim()
            .replace(/^https?:\/\//i, "")
            .replace(/\/.*$/, "")
            .replace(/^(oss-[\w-]+)$/, "$1.aliyuncs.com");
    }

    private protocol() {
        return location.protocol === "http:" ? "http" : "https";
    }

    private encodeObjectKey(objectKey: string) {
        return objectKey.split("/").map((part) => encodeURIComponent(part)).join("/");
    }

    private async signOssRequest(message: string, secret: string) {
        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(secret),
            {name: "HMAC", hash: "SHA-1"},
            false,
            ["sign"],
        );
        const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
        let binary = "";
        new Uint8Array(signature).forEach((item) => {
            binary += String.fromCharCode(item);
        });
        return btoa(binary);
    }

    private getCurrentDocId() {
        const docId = this.currentDocId || this.findCurrentDocIdFromDom();
        if (!docId) {
            throw new Error(this.i18n.openDocumentFirst);
        }
        return docId;
    }

    private findCurrentDocIdFromDom() {
        const activeEditor = document.querySelector<HTMLElement>(
            ".layout-tab-container:not(.fn__none) .protyle:not(.fn__none)",
        ) || document.querySelector<HTMLElement>(".protyle:not(.fn__none)");
        return activeEditor?.querySelector<HTMLElement>(".protyle-wysiwyg [data-node-id]")?.dataset.nodeId || "";
    }

    private async getDocumentMarkdown(docId: string) {
        const data = await this.post<{kramdown: string}>("/api/block/getBlockKramdown", {id: docId});
        return data.kramdown || "";
    }

    private async updateDocumentMarkdown(docId: string, markdown: string) {
        await this.post("/api/block/updateBlock", {
            id: docId,
            dataType: "markdown",
            data: markdown,
        });
    }

    private post<T = any>(url: string, payload: any): Promise<T> {
        return new Promise((resolve, reject) => {
            fetchPost(url, payload, (response) => {
                if (response.code === 0) {
                    resolve(response.data as T);
                    return;
                }
                reject(new Error(response.msg || `${url} failed`));
            });
        });
    }

    private handleProtyleChanged = ({detail}: CustomEvent<{protyle?: IProtyle}>) => {
        const docId = detail?.protyle?.block?.rootID;
        if (docId) {
            this.currentDocId = docId;
        }
        if (!this.settingsData.autoUploadOnSwitch) {
            return;
        }
        window.clearTimeout(this.autoUploadTimer);
        this.autoUploadTimer = window.setTimeout(() => {
            this.uploadCurrentDocumentImages(undefined, false).catch((error) => {
                console.warn(`[${this.name}] auto upload failed`, error);
            });
        }, AUTO_UPLOAD_DELAY);
    };

    private handlePaste = ({detail}: CustomEvent<{
        files?: FileList | DataTransferItemList,
        localFiles?: {path: string, size: number}[],
        protyle?: IProtyle,
        siyuanHTML?: string,
        textHTML?: string,
        textPlain?: string,
    }>) => {
        const docId = detail?.protyle?.block?.rootID || this.currentDocId || this.findCurrentDocIdFromDom();
        if (docId) {
            this.currentDocId = docId;
        }
        if (!docId || !this.settingsData.autoUploadOnPaste || !this.hasPastedImage(detail)) {
            return;
        }
        this.schedulePasteUpload(docId);
    };

    private schedulePasteUpload(docId: string) {
        const previousTimer = this.pasteUploadTimers.get(docId);
        if (previousTimer) {
            window.clearTimeout(previousTimer);
        }
        const timer = window.setTimeout(() => {
            this.pasteUploadTimers.delete(docId);
            if (!this.settingsData.autoUploadOnPaste) {
                return;
            }
            if (this.uploadingDocs.has(docId)) {
                this.schedulePasteUpload(docId);
                return;
            }
            this.uploadCurrentDocumentImages(docId, false).catch((error) => {
                this.showError(error);
            });
        }, PASTE_UPLOAD_DELAY);
        this.pasteUploadTimers.set(docId, timer);
    }

    private hasPastedImage(detail?: {
        files?: FileList | DataTransferItemList,
        localFiles?: {path: string}[],
        siyuanHTML?: string,
        textHTML?: string,
        textPlain?: string,
    }) {
        if (!detail) {
            return false;
        }
        if (detail.localFiles?.some((file) => this.looksLikeImage(file.path))) {
            return true;
        }
        if (detail.files && Array.from(detail.files as ArrayLike<File | DataTransferItem>).some((item) => {
            return item.type?.startsWith("image/") || ("name" in item && this.looksLikeImage(item.name));
        })) {
            return true;
        }
        return [detail.textHTML, detail.siyuanHTML].some((html) => Boolean(html && /<img\b/i.test(html)))
            || Boolean(detail.textPlain && this.looksLikeImage(detail.textPlain.trim()));
    }

    private async loadSettings() {
        await this.loadData(STORAGE_NAME).catch((error) => {
            console.warn(`[${this.name}] load settings failed`, error);
        });
        this.storageData = this.migrateStorage(this.data[STORAGE_NAME]);
        this.syncActiveSettings();
    }

    private assertSettingsReady() {
        const missing = [
            ["accessKeyId", this.i18n.accessKeyId],
            ["accessKeySecret", this.i18n.accessKeySecret],
            ["bucket", this.i18n.bucket],
            ["endpoint", this.i18n.endpoint],
        ].filter(([key]) => !this.settingsData[key as keyof ImageBedSettings]);
        if (missing.length > 0) {
            throw new Error(`${this.i18n.missingSettings}: ${missing.map(([, label]) => label).join(", ")}`);
        }
    }

    private formatUploadSummary(results: UploadResult[]) {
        const successCount = results.filter((result) => result.remoteUrl).length;
        const failedCount = results.filter((result) => result.error).length;
        if (results.length === 0) {
            return this.i18n.noLocalImagesFound;
        }
        return this.i18n.uploadSummary
            .replace("${success}", String(successCount))
            .replace("${failed}", String(failedCount));
    }

    private getFileName(source: string) {
        const cleanSource = source.split("#")[0].split("?")[0];
        const lastPart = decodeURIComponent(cleanSource.split("/").filter(Boolean).pop() || "");
        return lastPart || `image-${Date.now()}.png`;
    }

    private getExtension(source: string) {
        const fileName = this.getFileName(source).toLowerCase();
        const extension = fileName.match(/\.([a-z0-9]+)$/);
        return extension ? extension[1] : "";
    }

    private getMimeType(fileName: string) {
        switch (this.getExtension(fileName)) {
            case "avif":
                return "image/avif";
            case "bmp":
                return "image/bmp";
            case "gif":
                return "image/gif";
            case "jpg":
            case "jpeg":
                return "image/jpeg";
            case "svg":
                return "image/svg+xml";
            case "webp":
                return "image/webp";
            case "png":
            default:
                return "image/png";
        }
    }

    private escapeHtml(value: string) {
        return value.replace(/[&<>"']/g, (char) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;",
        }[char]));
    }

    private escapeAttribute(value: string) {
        return this.escapeHtml(value);
    }

    private showError(error: unknown) {
        showMessage(this.toErrorMessage(error), 6000, "error");
    }

    private toErrorMessage(error: unknown) {
        return error instanceof Error ? error.message : String(error);
    }
}
