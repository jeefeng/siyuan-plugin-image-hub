import {
    Dialog,
    Plugin,
    Setting,
    fetchPost,
    getFrontend,
    showMessage,
    IProtyle,
} from "siyuan";
import "./index.scss";

const STORAGE_NAME = "image-bed-config";
const AUTO_UPLOAD_DELAY = 1200;

type ImageKind = "markdown" | "html";

interface ImageBedSettings {
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    endpoint: string;
    directoryTemplate: string;
    customDomain: string;
    autoUploadOnSwitch: boolean;
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
    private settingsData: ImageBedSettings = {...DEFAULT_SETTINGS};
    private isMobile = false;
    private autoUploadTimer = 0;
    private currentDocId = "";
    private uploadingDocs = new Set<string>();

    async onload() {
        const frontend = getFrontend();
        this.isMobile = frontend === "mobile" || frontend === "browser-mobile";
        await this.loadSettings();
        this.registerCommands();
        this.createSettingPanel();
        this.eventBus.on("loaded-protyle-dynamic", this.handleProtyleChanged);
        this.eventBus.on("switch-protyle", this.handleProtyleChanged);
    }

    onLayoutReady() {
        this.addTopBar({
            icon: "iconImage",
            title: this.i18n.topBarTitle,
            position: "right",
            callback: () => {
                this.openControlDialog().catch((error) => this.showError(error));
            },
        });
    }

    onunload() {
        window.clearTimeout(this.autoUploadTimer);
        this.eventBus.off("loaded-protyle-dynamic", this.handleProtyleChanged);
        this.eventBus.off("switch-protyle", this.handleProtyleChanged);
    }

    private registerCommands() {
        this.addCommand({
            langKey: "previewCurrentDocImages",
            callback: () => {
                this.openPreviewDialog().catch((error) => this.showError(error));
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
        const controls: Record<keyof ImageBedSettings, HTMLInputElement> = {} as Record<
            keyof ImageBedSettings,
            HTMLInputElement
        >;

        this.setting = new Setting({
            confirmCallback: () => {
                this.settingsData = {
                    accessKeyId: controls.accessKeyId.value.trim(),
                    accessKeySecret: controls.accessKeySecret.value.trim(),
                    bucket: controls.bucket.value.trim(),
                    endpoint: controls.endpoint.value.trim(),
                    directoryTemplate: controls.directoryTemplate.value.trim() || DEFAULT_SETTINGS.directoryTemplate,
                    customDomain: controls.customDomain.value.trim(),
                    autoUploadOnSwitch: controls.autoUploadOnSwitch.checked,
                };
                this.saveData(STORAGE_NAME, this.settingsData).then(() => {
                    showMessage(this.i18n.settingsSaved);
                }).catch((error) => this.showError(error));
            },
        });

        this.addTextSetting(
            controls,
            "accessKeyId",
            this.i18n.accessKeyId,
            this.i18n.accessKeyIdDesc,
        );
        this.addTextSetting(
            controls,
            "accessKeySecret",
            this.i18n.accessKeySecret,
            this.i18n.accessKeySecretDesc,
            "password",
        );
        this.addTextSetting(controls, "bucket", this.i18n.bucket, this.i18n.bucketDesc);
        this.addTextSetting(controls, "endpoint", this.i18n.endpoint, this.i18n.endpointDesc);
        this.addTextSetting(
            controls,
            "directoryTemplate",
            this.i18n.directoryTemplate,
            this.i18n.directoryTemplateDesc,
        );
        this.addTextSetting(controls, "customDomain", this.i18n.customDomain, this.i18n.customDomainDesc);

        const autoUploadElement = document.createElement("input");
        autoUploadElement.type = "checkbox";
        autoUploadElement.className = "b3-switch fn__flex-center";
        autoUploadElement.checked = this.settingsData.autoUploadOnSwitch;
        controls.autoUploadOnSwitch = autoUploadElement;
        this.setting.addItem({
            title: this.i18n.autoUploadOnSwitch,
            description: this.i18n.autoUploadOnSwitchDesc,
            actionElement: autoUploadElement,
        });
    }

    private addTextSetting(
        controls: Record<keyof ImageBedSettings, HTMLInputElement>,
        key: keyof ImageBedSettings,
        title: string,
        description: string,
        type = "text",
    ) {
        const inputElement = document.createElement("input");
        inputElement.className = "b3-text-field fn__block";
        inputElement.type = type;
        inputElement.value = String(this.settingsData[key] ?? "");
        controls[key] = inputElement;
        this.setting.addItem({
            title,
            description,
            createActionElement: () => inputElement,
        });
    }

    private async openPreviewDialog() {
        const docId = this.getCurrentDocId();
        const markdown = await this.getDocumentMarkdown(docId);
        const images = this.extractImages(markdown);
        const dialog = new Dialog({
            title: this.i18n.previewCurrentDocImages,
            content: this.renderPreviewDialog(images),
            width: this.isMobile ? "92vw" : "820px",
            height: this.isMobile ? "76vh" : "680px",
        });

        const contentElement = dialog.element.querySelector(".image-bed");
        const listElement = dialog.element.querySelector(".image-bed__list");
        const resultElement = dialog.element.querySelector(".image-bed__result");
        const fileInputElement = dialog.element.querySelector<HTMLInputElement>(".image-bed__file-input");
        const uploadAllButton = contentElement?.querySelector<HTMLButtonElement>("[data-action='upload-local-all']");
        const selectFilesButton = contentElement?.querySelector<HTMLButtonElement>("[data-action='select-files']");
        if (!contentElement || !listElement || !resultElement || !fileInputElement || !uploadAllButton || !selectFilesButton) {
            throw new Error(this.i18n.previewInitFailed);
        }

        const refresh = async () => {
            const nextMarkdown = await this.getDocumentMarkdown(docId);
            listElement.innerHTML = this.renderImageList(this.extractImages(nextMarkdown));
            bindImageActions();
        };

        const showInlineResult = (text: string) => {
            resultElement.textContent = text;
            resultElement.classList.remove("fn__none");
        };

        const overwriteManagedImage = async (image: ArticleImage, button: HTMLButtonElement) => {
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
            showInlineResult(remoteUrl);
            await refresh();
        };

        const bindImageActions = () => {
            listElement.querySelectorAll<HTMLButtonElement>("[data-action='upload-image']").forEach((button) => {
                button.addEventListener("click", async () => {
                    button.disabled = true;
                    button.textContent = this.i18n.uploading;
                    const source = button.dataset.source;
                    try {
                        const currentMarkdown = await this.getDocumentMarkdown(docId);
                        const image = this.extractImages(currentMarkdown).find((item) => item.source === source);
                        if (!image) {
                            throw new Error(this.i18n.imageNoLongerExists);
                        }
                        if (image.isManagedRemote && !image.isLocal) {
                            await overwriteManagedImage(image, button);
                            return;
                        }
                        const result = await this.uploadArticleImage(docId, image);
                        if (result.remoteUrl && image.isLocal) {
                            await this.replaceImageInDocument(docId, image.source, result.remoteUrl);
                        }
                        showInlineResult(result.remoteUrl || this.i18n.uploadDone);
                        await refresh();
                    } catch (error) {
                        this.showError(error);
                        button.disabled = false;
                        button.textContent = button.dataset.label;
                    }
                });
            });
        };

        uploadAllButton.addEventListener(
            "click",
            async (event) => {
                const button = event.currentTarget as HTMLButtonElement;
                button.disabled = true;
                button.textContent = this.i18n.uploading;
                try {
                    const results = await this.uploadCurrentDocumentImages(docId, false);
                    showInlineResult(this.formatUploadSummary(results));
                    await refresh();
                } finally {
                    button.disabled = false;
                    button.textContent = this.i18n.uploadAllLocalImages;
                }
            },
        );

        selectFilesButton.addEventListener(
            "click",
            () => fileInputElement.click(),
        );

        fileInputElement.addEventListener("change", async () => {
            const files = Array.from(fileInputElement.files || []);
            if (files.length === 0) {
                return;
            }
            try {
                this.assertSettingsReady();
                const urls: string[] = [];
                for (const file of files) {
                    const remoteUrl = await this.uploadBlob(
                        file,
                        this.createObjectKey(docId, file.name),
                        file.type || this.getMimeType(file.name),
                    );
                    urls.push(remoteUrl);
                }
                showInlineResult(urls.join("\n"));
            } catch (error) {
                this.showError(error);
            } finally {
                fileInputElement.value = "";
            }
        });

        bindImageActions();
    }

    private async openControlDialog() {
        const docId = this.currentDocId || this.findCurrentDocIdFromDom();
        const images = docId ? this.extractImages(await this.getDocumentMarkdown(docId)) : [];
        const dialog = new Dialog({
            title: this.i18n.controlPanelTitle,
            content: this.renderControlDialog(images, Boolean(docId)),
            width: this.isMobile ? "94vw" : "920px",
            height: this.isMobile ? "86vh" : "760px",
        });

        const panelElement = dialog.element.querySelector(".image-bed-panel");
        const listElement = dialog.element.querySelector(".image-bed__list");
        const resultElement = dialog.element.querySelector(".image-bed__result");
        const fileInputElement = dialog.element.querySelector<HTMLInputElement>(".image-bed__file-input");
        if (!panelElement || !listElement || !resultElement || !fileInputElement) {
            throw new Error(this.i18n.previewInitFailed);
        }

        const showInlineResult = (text: string) => {
            resultElement.textContent = text;
            resultElement.classList.remove("fn__none");
        };

        const saveSettingsFromPanel = async () => {
            this.settingsData = this.readSettingsFromElement(panelElement);
            await this.saveData(STORAGE_NAME, this.settingsData);
            showMessage(this.i18n.settingsSaved);
        };

        const refreshImages = async () => {
            const currentDocId = this.getCurrentDocId();
            const markdown = await this.getDocumentMarkdown(currentDocId);
            listElement.innerHTML = this.renderImageList(this.extractImages(markdown));
            bindImageActions();
        };

        const overwriteManagedImage = async (image: ArticleImage, button: HTMLButtonElement) => {
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
            showInlineResult(remoteUrl);
            await refreshImages();
        };

        const bindImageActions = () => {
            listElement.querySelectorAll<HTMLButtonElement>("[data-action='upload-image']").forEach((button) => {
                button.addEventListener("click", async () => {
                    button.disabled = true;
                    button.textContent = this.i18n.uploading;
                    try {
                        await saveSettingsFromPanel();
                        const currentDocId = this.getCurrentDocId();
                        const markdown = await this.getDocumentMarkdown(currentDocId);
                        const source = button.dataset.source;
                        const image = this.extractImages(markdown).find((item) => item.source === source);
                        if (!image) {
                            throw new Error(this.i18n.imageNoLongerExists);
                        }
                        if (image.isManagedRemote && !image.isLocal) {
                            await overwriteManagedImage(image, button);
                            return;
                        }
                        const result = await this.uploadArticleImage(currentDocId, image);
                        if (result.remoteUrl && image.isLocal) {
                            await this.replaceImageInDocument(currentDocId, image.source, result.remoteUrl);
                        }
                        showInlineResult(result.remoteUrl || this.i18n.uploadDone);
                        await refreshImages();
                    } catch (error) {
                        this.showError(error);
                        button.disabled = false;
                        button.textContent = button.dataset.label;
                    }
                });
            });
        };

        panelElement.querySelector<HTMLButtonElement>("[data-action='save-settings']")?.addEventListener(
            "click",
            async () => {
                try {
                    await saveSettingsFromPanel();
                } catch (error) {
                    this.showError(error);
                }
            },
        );

        panelElement.querySelector<HTMLButtonElement>("[data-action='refresh-images']")?.addEventListener(
            "click",
            async () => {
                try {
                    await refreshImages();
                    showInlineResult(this.i18n.previewRefreshed);
                } catch (error) {
                    this.showError(error);
                }
            },
        );

        panelElement.querySelector<HTMLButtonElement>("[data-action='upload-current']")?.addEventListener(
            "click",
            async (event) => {
                const button = event.currentTarget as HTMLButtonElement;
                button.disabled = true;
                button.textContent = this.i18n.uploading;
                try {
                    await saveSettingsFromPanel();
                    const results = await this.uploadCurrentDocumentImages(this.getCurrentDocId(), false);
                    showInlineResult(this.formatUploadSummary(results));
                    await refreshImages();
                } catch (error) {
                    this.showError(error);
                } finally {
                    button.disabled = false;
                    button.textContent = this.i18n.uploadCurrentDocImages;
                }
            },
        );

        panelElement.querySelector<HTMLButtonElement>("[data-action='select-files']")?.addEventListener(
            "click",
            () => fileInputElement.click(),
        );

        fileInputElement.addEventListener("change", async () => {
            const files = Array.from(fileInputElement.files || []);
            if (files.length === 0) {
                return;
            }
            try {
                await saveSettingsFromPanel();
                const currentDocId = this.currentDocId || this.findCurrentDocIdFromDom() || "manual";
                const urls: string[] = [];
                for (const file of files) {
                    const remoteUrl = await this.uploadBlob(
                        file,
                        this.createObjectKey(currentDocId, file.name),
                        file.type || this.getMimeType(file.name),
                    );
                    urls.push(remoteUrl);
                }
                showInlineResult(urls.join("\n"));
            } catch (error) {
                this.showError(error);
            } finally {
                fileInputElement.value = "";
            }
        });

        bindImageActions();
    }

    private renderControlDialog(images: ArticleImage[], hasDocument: boolean) {
        return `<div class="b3-dialog__content image-bed-panel">
    <div class="image-bed-panel__layout">
        <section class="image-bed-panel__settings">
            <div class="image-bed-panel__section-title">${this.escapeHtml(this.i18n.aliyunOssConfig)}</div>
            ${this.renderSettingInput("accessKeyId", this.i18n.accessKeyId, this.settingsData.accessKeyId)}
            ${this.renderSettingInput("accessKeySecret", this.i18n.accessKeySecret, this.settingsData.accessKeySecret, "password")}
            ${this.renderSettingInput("bucket", this.i18n.bucket, this.settingsData.bucket)}
            ${this.renderSettingInput("endpoint", this.i18n.endpoint, this.settingsData.endpoint)}
            ${this.renderSettingInput("directoryTemplate", this.i18n.directoryTemplate, this.settingsData.directoryTemplate)}
            ${this.renderSettingInput("customDomain", this.i18n.customDomain, this.settingsData.customDomain)}
            <label class="image-bed-panel__switch">
                <input type="checkbox" data-field="autoUploadOnSwitch" ${this.settingsData.autoUploadOnSwitch ? "checked" : ""}>
                <span>${this.escapeHtml(this.i18n.autoUploadOnSwitch)}</span>
            </label>
            <div class="image-bed-panel__actions">
                <button class="b3-button b3-button--text" data-action="save-settings">${this.escapeHtml(this.i18n.saveAndApply)}</button>
            </div>
            <div class="image-bed-panel__hint">${this.escapeHtml(this.i18n.controlPanelHint)}</div>
        </section>
        <section class="image-bed-panel__images">
            <div class="image-bed-panel__section-title">${this.escapeHtml(this.i18n.currentDocImages)}</div>
            <div class="image-bed__toolbar">
                <button class="b3-button b3-button--text" data-action="upload-current">${this.escapeHtml(
            this.i18n.uploadCurrentDocImages,
        )}</button>
                <button class="b3-button b3-button--outline" data-action="refresh-images">${this.escapeHtml(
            this.i18n.refreshImages,
        )}</button>
                <button class="b3-button b3-button--outline" data-action="select-files">${this.escapeHtml(
            this.i18n.selectImagesToUpload,
        )}</button>
                <input class="image-bed__file-input fn__none" type="file" accept="image/*" multiple>
            </div>
            <pre class="image-bed__result fn__none"></pre>
            ${hasDocument ? "" : `<div class="image-bed-panel__hint">${this.escapeHtml(this.i18n.openDocumentFirst)}</div>`}
            <div class="image-bed__list">${this.renderImageList(images)}</div>
        </section>
    </div>
</div>`;
    }

    private renderSettingInput(key: keyof ImageBedSettings, label: string, value: string, type = "text") {
        return `<label class="image-bed-panel__field">
    <span>${this.escapeHtml(label)}</span>
    <input class="b3-text-field fn__block" type="${this.escapeAttribute(type)}" data-field="${this.escapeAttribute(
            key,
        )}" value="${this.escapeAttribute(value)}">
</label>`;
    }

    private readSettingsFromElement(element: Element): ImageBedSettings {
        const readValue = (key: keyof ImageBedSettings) => {
            const input = element.querySelector<HTMLInputElement>(`[data-field='${key}']`);
            return input?.value.trim() || "";
        };
        return {
            accessKeyId: readValue("accessKeyId"),
            accessKeySecret: readValue("accessKeySecret"),
            bucket: readValue("bucket"),
            endpoint: readValue("endpoint"),
            directoryTemplate: readValue("directoryTemplate") || DEFAULT_SETTINGS.directoryTemplate,
            customDomain: readValue("customDomain"),
            autoUploadOnSwitch: Boolean(
                element.querySelector<HTMLInputElement>("[data-field='autoUploadOnSwitch']")?.checked,
            ),
        };
    }

    private pickImageFile(): Promise<File | null> {
        return new Promise((resolve) => {
            const inputElement = document.createElement("input");
            inputElement.type = "file";
            inputElement.accept = "image/*";
            inputElement.addEventListener("change", () => {
                resolve(inputElement.files?.[0] || null);
            }, {once: true});
            inputElement.click();
        });
    }

    private renderPreviewDialog(images: ArticleImage[]) {
        return `<div class="b3-dialog__content image-bed">
    <div class="image-bed__toolbar">
        <button class="b3-button b3-button--text" data-action="upload-local-all">${this.escapeHtml(
            this.i18n.uploadAllLocalImages,
        )}</button>
        <button class="b3-button b3-button--outline" data-action="select-files">${this.escapeHtml(
            this.i18n.selectImagesToUpload,
        )}</button>
        <input class="image-bed__file-input fn__none" type="file" accept="image/*" multiple>
    </div>
    <pre class="image-bed__result fn__none"></pre>
    <div class="image-bed__list">${this.renderImageList(images)}</div>
</div>`;
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
        <div class="image-bed__source" title="${this.escapeAttribute(image.source)}">${this.escapeHtml(
                image.source,
            )}</div>
        <div class="image-bed__status">${this.escapeHtml(status)}</div>
    </div>
    <button class="b3-button b3-button--outline" data-action="upload-image" data-label="${this.escapeAttribute(
                label,
            )}" data-source="${this.escapeAttribute(image.source)}" ${canUpload ? "" : "disabled"}>${this.escapeHtml(
                label,
            )}</button>
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

            let nextMarkdown = markdown;
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
                        nextMarkdown = this.replaceSource(nextMarkdown, image.source, result.remoteUrl);
                    }
                } catch (error) {
                    results.push({
                        image,
                        error: this.toErrorMessage(error),
                    });
                }
            }
            if (nextMarkdown !== markdown) {
                await this.updateDocumentMarkdown(docId, nextMarkdown);
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

    private async loadSettings() {
        await this.loadData(STORAGE_NAME).catch((error) => {
            console.warn(`[${this.name}] load settings failed`, error);
        });
        this.settingsData = {
            ...DEFAULT_SETTINGS,
            ...(this.data[STORAGE_NAME] || {}),
        };
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
