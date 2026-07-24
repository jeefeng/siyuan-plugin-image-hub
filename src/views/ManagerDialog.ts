import {Dialog, fetchPost, showMessage} from "siyuan";
import {
    type ArticleImage,
    type ManagerView,
    type PluginActions,
    type ProviderType,
    type StorageConfig,
    type UploadResult,
} from "../types";
import {findCurrentDocIdFromDom, showInlineResult} from "../ui";
import * as C from "./components";

/**
 * 图床管理器对话框。
 *
 * 职责：
 *  - 创建 Dialog
 *  - 渲染文章 / 配置两个视图
 *  - 事件委托处理所有用户交互
 *  - 业务逻辑回调到 PluginActions
 */
export class ManagerDialog {
    private dialog: Dialog;
    private container: HTMLElement;
    private view: ManagerView = "article";
    private plugin: PluginActions;
    private isMobile: boolean;

    constructor(plugin: PluginActions, isMobile: boolean, title: string, width: string, height: string) {
        this.plugin = plugin;
        this.isMobile = isMobile;
        this.dialog = new Dialog({
            title,
            content: `<div class="b3-dialog__content image-bed-manager-dialog"></div>`,
            width,
            height,
        });
        const c = this.dialog.element.querySelector<HTMLElement>(".image-bed-manager-dialog");
        if (!c) throw new Error("dialog container not found");
        this.container = c;

        // 单次事件委托
        this.container.addEventListener("click", this.handleClick);
        this.container.addEventListener("change", this.handleChange);
        this.render().catch((err) => plugin.showError(err));
    }

    // ── 渲染入口 ──────────────────────────────────

    private async render(): Promise<void> {
        const docId = this.plugin.storageData.activeConfigId
            ? this.plugin.getCurrentDocId() || findCurrentDocIdFromDom()
            : "";
        const images = docId ? this.plugin.extractImages(await this.plugin.getDocumentMarkdown(docId)) : [];
        const config = this.plugin.getActiveConfig();
        const i18n = this.plugin.i18n;

        const navs = [
            {view: "article" as ManagerView, label: i18n.articleHome, active: this.view === "article"},
            {view: "settings" as ManagerView, label: i18n.storageConfigs, active: this.view === "settings"},
        ];

        const main = this.view === "article"
            ? this.renderMainArticle(images, Boolean(docId), config, i18n)
            : this.renderMainConfig(config, i18n);

        this.container.innerHTML = C.managerLayout(
            C.sidebar(i18n.managerTitle, navs),
            C.header(
                this.view === "article" ? i18n.articleHome : i18n.storageConfigs,
                this.subtitle(config, i18n),
                this.plugin.storageData.configs,
                this.plugin.storageData.activeConfigId,
                i18n,
            ) + main,
            i18n,
        );
    }

    private renderMainArticle(
        images: ArticleImage[],
        hasDoc: boolean,
        config: StorageConfig,
        i18n: Record<string, string>,
    ): string {
        return C.articleView(images, hasDoc, config, i18n);
    }

    private renderMainConfig(config: StorageConfig, i18n: Record<string, string>): string {
        return C.configView(
            this.plugin.storageData.configs,
            config,
            (p: ProviderType) => this.providerLabel(p, i18n),
            i18n,
        );
    }

    private subtitle(config: StorageConfig, i18n: Record<string, string>): string {
        return `${this.providerLabel(config.provider, i18n)} / ${config.bucket || i18n.bucketNotSet}`;
    }

    private providerLabel(provider: ProviderType, i18n: Record<string, string>): string {
        const map: Record<ProviderType, string> = {
            "aliyun-oss": i18n.aliyunOss,
            "tencent-cos": i18n.tencentCos,
            qiniu: i18n.qiniu,
            s3: i18n.s3Compatible,
        };
        return map[provider] || i18n.aliyunOss;
    }

    // ── 事件委托 ──────────────────────────────────

    private handleClick = (e: MouseEvent): void => {
        const target = e.target as HTMLElement;

        // 侧边栏导航切换（data-view）
        const viewBtn = target.closest<HTMLElement>("[data-view]");
        if (viewBtn) {
            this.switchView(viewBtn.dataset.view as ManagerView);
            return;
        }

        // 其他按钮操作（data-action）
        const actionBtn = target.closest<HTMLElement>("[data-action]");
        if (!actionBtn) return;
        const action = actionBtn.dataset.action;
        switch (action) {
            case "toggle-secret":
                this.toggleSecret(actionBtn);
                return;
            case "refresh-manager":
                this.render().catch((err) => this.plugin.showError(err));
                return;
            case "upload-image":
                this.handleUploadImage(actionBtn).catch((err) => this.plugin.showError(err));
                return;
            case "upload-current":
                this.handleUploadCurrent().catch((err) => this.plugin.showError(err));
                return;
            case "select-config":
                this.selectConfig(actionBtn.dataset.id || "");
                return;
            case "add-config":
                this.addConfig();
                return;
            case "duplicate-config":
                this.duplicateConfig();
                return;
            case "save-config":
                this.saveConfig();
                return;
            case "test-config":
                this.testConfig();
                return;
            case "delete-config":
                this.deleteConfig();
                return;
        }
    };

    private handleChange = (e: Event): void => {
        const target = e.target as HTMLElement;
        const action = target.dataset.action;
        if (action === "switch-active-config") {
            this.switchConfig(target as HTMLSelectElement);
        }
    };

    // ── 视图切换 ──────────────────────────────────

    private switchView(view: ManagerView): void {
        if (view === this.view) return;
        this.view = view;
        this.render().catch((err) => this.plugin.showError(err));
    }

    // ── 配置操作 ──────────────────────────────────

    private switchConfig(select: HTMLSelectElement): void {
        this.plugin.storageData.activeConfigId = select.value;
        this.render().catch((err) => this.plugin.showError(err));
    }

    private selectConfig(id: string): void {
        this.plugin.storageData.activeConfigId = id;
        this.render().catch((err) => this.plugin.showError(err));
    }

    private async addConfig(): Promise<void> {
        const config = this.plugin.createStorageConfig(this.plugin.i18n.newConfigName);
        this.plugin.storageData.configs.push(config);
        this.plugin.storageData.activeConfigId = config.id;
        await this.plugin.saveStorage();
        await this.render();
    }

    private async duplicateConfig(): Promise<void> {
        const active = this.plugin.getActiveConfig();
        const clone: StorageConfig = {...active, id: this.genId(), name: `${active.name} Copy`};
        this.plugin.storageData.configs.push(clone);
        this.plugin.storageData.activeConfigId = clone.id;
        await this.plugin.saveStorage();
        await this.render();
    }

    private async saveConfig(): Promise<void> {
        this.plugin.updateActiveConfigFromForm(this.container);
        await this.plugin.saveStorage();
        showMessage(this.plugin.i18n.settingsSaved);
        await this.render();
    }

    private testConfig(): void {
        this.plugin.updateActiveConfigFromForm(this.container);
        this.plugin.assertSettingsReady();
        showMessage(this.plugin.i18n.configLooksReady);
    }

    private async deleteConfig(): Promise<void> {
        if (this.plugin.storageData.configs.length <= 1) {
            showMessage(this.plugin.i18n.keepOneConfig, 5000, "error");
            return;
        }
        if (!window.confirm(this.plugin.i18n.confirmDeleteConfig)) return;
        const id = this.plugin.storageData.activeConfigId;
        this.plugin.storageData.configs = this.plugin.storageData.configs.filter((c) => c.id !== id);
        this.plugin.storageData.activeConfigId = this.plugin.storageData.configs[0].id;
        await this.plugin.saveStorage();
        await this.render();
    }

    // ── 上传操作 ──────────────────────────────────

    private async handleUploadCurrent(): Promise<void> {
        const btn = this.container.querySelector<HTMLButtonElement>("[data-action='upload-current']");
        if (btn) {
            btn.disabled = true;
            btn.textContent = this.plugin.i18n.uploading;
        }
        try {
            const results = await this.plugin.uploadCurrentDocumentImages();
            showInlineResult(this.container, this.plugin.formatUploadSummary(results), showMessage);
            await this.render();
        } finally {
            if (btn?.isConnected) {
                btn.disabled = false;
                btn.textContent = this.plugin.i18n.uploadCurrentDocImages;
            }
        }
    }

    private async handleUploadImage(btn: HTMLElement): Promise<void> {
        const label = btn.dataset.label || this.plugin.i18n.uploadAndReplace;
        btn.disabled = true;
        btn.textContent = this.plugin.i18n.uploading;
        try {
            const docId = this.plugin.getCurrentDocId();
            const markdown = await this.plugin.getDocumentMarkdown(docId);
            const image = this.plugin.extractImages(markdown).find((img) => img.source === btn.dataset.source);
            if (!image) throw new Error(this.plugin.i18n.imageNoLongerExists);

            if (image.isManagedRemote && !image.isLocal) {
                await this.overwriteImage(image, btn);
                return;
            }

            const result = await this.doUploadImage(docId, image);
            showInlineResult(this.container, result.remoteUrl || this.plugin.i18n.uploadDone, showMessage);
            await this.render();
        } catch (e) {
            this.plugin.showError(e);
        } finally {
            if (btn.isConnected) {
                btn.disabled = false;
                btn.textContent = label;
            }
        }
    }

    private async overwriteImage(image: ArticleImage, btn: HTMLElement): Promise<void> {
        if (!image.objectKey) throw new Error(this.plugin.i18n.imageNoLongerExists);
        const file = await this.plugin.pickImageFile();
        if (!file) {
            btn.disabled = false;
            btn.textContent = btn.dataset.label || this.plugin.i18n.reuploadOverwrite;
            return;
        }
        const url = await this.plugin.uploadBlob(file, image.objectKey, file.type || this.plugin.getMimeType(file.name));
        showInlineResult(this.container, url, showMessage);
        await this.render();
    }

    private async doUploadImage(docId: string, image: ArticleImage): Promise<UploadResult> {
        const blob = await this.plugin.fetchImageBlob(image);
        const objectKey = image.objectKey || this.plugin.createObjectKey(docId, image.fileName);
        const remoteUrl = await this.plugin.uploadBlob(blob, objectKey, blob.type || this.plugin.getMimeType(image.fileName));
        if (remoteUrl && image.isLocal) {
            await this.plugin.replaceImageInDocument(docId, image.source, remoteUrl);
        }
        return {image, remoteUrl};
    }

    // ── 工具 ──────────────────────────────────────

    private toggleSecret(btn: HTMLElement): void {
        const key = btn.dataset.target || "";
        const input = this.container.querySelector<HTMLInputElement>(`[data-field='${key}']`);
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        const label = show ? this.plugin.i18n.hideSecret : this.plugin.i18n.showSecret;
        btn.title = label;
        btn.setAttribute("aria-label", label);
        btn.setAttribute("aria-pressed", String(show));
        btn.innerHTML = C.secretIcon(show);
    }

    private genId(): string {
        return `cfg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
}
