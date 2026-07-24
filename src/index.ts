import {
    IProtyle,
    Plugin,
    Setting,
    fetchPost,
    getFrontend,
    showMessage,
} from "siyuan";
import "./index.scss";
import {
    type ArticleImage,
    type ImageBedSettings,
    type ImageBedStorage,
    type PasteDetail,
    type ProviderType,
    type StorageConfig,
    type UploadResult,
    AUTO_UPLOAD_DELAY,
    DEFAULT_SETTINGS,
    IMAGE_EXTENSIONS,
    PASTE_UPLOAD_DELAY,
    STORAGE_NAME,
} from "./types";
import {pickImageFile} from "./ui";
import {getOrThrow} from "./provider";
import {ManagerDialog} from "./views/ManagerDialog";

export default class ImageBedPlugin extends Plugin {
    storageData: ImageBedStorage = this.createDefaultStorage();
    private settingsData: StorageConfig = this.storageData.configs[0];
    private isMobile = false;
    private autoUploadTimer = 0;
    private pasteUploadTimers = new Map<string, number>();
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

    // ── 对话框 ──────────────────────────────────

    private async openManagerDialog() {
        new ManagerDialog(
            this,
            this.isMobile,
            this.i18n.managerTitle,
            this.isMobile ? "92vw" : "1046px",
            this.isMobile ? "84vh" : "668px",
        );
    }

    // ── 注册 ────────────────────────────────────

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

    // ── 配置管理 ────────────────────────────────

    getActiveConfig(): StorageConfig {
        const c = this.storageData.configs.find((i) => i.id === this.storageData.activeConfigId) || this.storageData.configs[0];
        if (!c) {
            const fallback = this.createStorageConfig(this.i18n.defaultConfigName || "Aliyun OSS");
            this.storageData.configs = [fallback];
            this.storageData.activeConfigId = fallback.id;
            return fallback;
        }
        return c;
    }

    private syncActiveSettings() {
        this.settingsData = this.getActiveConfig();
    }

    async saveStorage() {
        this.syncActiveSettings();
        await this.saveData(STORAGE_NAME, this.storageData);
    }

    private createDefaultStorage(): ImageBedStorage {
        const config = this.createStorageConfig("Aliyun OSS");
        return {activeConfigId: config.id, configs: [config]};
    }

    createStorageConfig(name: string): StorageConfig {
        return {id: this.genId(), name, provider: "aliyun-oss", enabled: false, ...DEFAULT_SETTINGS};
    }

    private genId() {
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
            id: this.genId(),
            name: raw?.bucket ? `Aliyun OSS - ${raw.bucket}` : "Aliyun OSS",
            provider: "aliyun-oss" as ProviderType,
        };
        return {activeConfigId: legacy.id, configs: [legacy]};
    }

    updateActiveConfigFromForm(formElement: HTMLElement) {
        const active = this.getActiveConfig();
        const read = (key: string) => formElement.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-field='${key}']`)?.value.trim() || "";
        active.name = read("name") || active.name;
        active.provider = (read("provider") || "aliyun-oss") as ProviderType;
        active.accessKeyId = read("accessKeyId");
        active.accessKeySecret = read("accessKeySecret");
        active.bucket = read("bucket");
        active.endpoint = read("endpoint");
        active.directoryTemplate = read("directoryTemplate") || DEFAULT_SETTINGS.directoryTemplate;
        active.customDomain = read("customDomain");
        active.autoUploadOnPaste = Boolean(formElement.querySelector<HTMLInputElement>("[data-field='autoUploadOnPaste']")?.checked);
        active.autoUploadOnSwitch = Boolean(formElement.querySelector<HTMLInputElement>("[data-field='autoUploadOnSwitch']")?.checked);
        this.syncActiveSettings();
    }

    assertSettingsReady() {
        // 必须有启用中的配置
        if (!this.storageData.configs.some((c) => c.enabled)) {
            throw new Error(this.i18n.noEnabledConfig);
        }
        const missing = [
            ["accessKeyId", this.i18n.accessKeyId],
            ["accessKeySecret", this.i18n.accessKeySecret],
            ["bucket", this.i18n.bucket],
            ["endpoint", this.i18n.endpoint],
        ].filter(([k]) => !this.settingsData[k as keyof ImageBedSettings]);
        if (missing.length > 0) {
            throw new Error(`${this.i18n.missingSettings}: ${missing.map(([, l]) => l).join(", ")}`);
        }
    }

    // ── 上传流程 ────────────────────────────────

    async uploadCurrentDocumentImages(docId?: string, notify = true): Promise<UploadResult[]> {
        const id = docId || this.getCurrentDocId();
        this.assertSettingsReady();
        if (this.uploadingDocs.has(id)) return [];
        this.uploadingDocs.add(id);
        try {
            const markdown = await this.getDocumentMarkdown(id);
            const localImages = this.extractImages(markdown).filter((i) => i.isLocal);
            if (localImages.length === 0) {
                if (notify) showMessage(this.i18n.noLocalImagesFound);
                return [];
            }
            const results: UploadResult[] = [];
            const handled = new Set<string>();
            for (const image of localImages) {
                if (handled.has(image.source)) continue;
                handled.add(image.source);
                try {
                    const result = await this.uploadSingleImage(id, image);
                    results.push(result);
                    if (result.remoteUrl) await this.replaceImageInDocument(id, image.source, result.remoteUrl);
                } catch (error) {
                    results.push({image, error: this.toErrorMessage(error)});
                }
            }
            if (notify) showMessage(this.formatUploadSummary(results));
            return results;
        } finally {
            this.uploadingDocs.delete(id);
        }
    }

    private async uploadSingleImage(docId: string, image: ArticleImage): Promise<UploadResult> {
        this.assertSettingsReady();
        const blob = await this.fetchImageBlob(image);
        const key = image.objectKey || this.createObjectKey(docId, image.fileName);
        const url = await this.uploadBlob(blob, key, blob.type || this.getMimeType(image.fileName));
        return {image, remoteUrl: url};
    }

    async uploadBlob(blob: Blob, objectKey: string, contentType: string): Promise<string> {
        const provider = getOrThrow(this.settingsData.provider);
        const url = await provider.upload(this.settingsData, blob, objectKey, contentType);
        if (!url?.trim()) {
            throw new Error("Upload succeeded but public URL is empty. Check bucket / endpoint / custom domain.");
        }
        return url;
    }

    pickImageFile(): Promise<File | null> {
        return pickImageFile();
    }

    async fetchImageBlob(image: ArticleImage): Promise<Blob> {
        const response = await fetch(this.toFetchableUrl(image.source));
        if (!response.ok) throw new Error(`${this.i18n.readImageFailed}: ${image.source}`);
        return response.blob();
    }

    async replaceImageInDocument(docId: string, source: string, remoteUrl: string): Promise<void> {
        // 只替换本地 assets 图片；勿整篇 update 文档根块（会重解析挂件等并触发 invalid ID）
        if (!this.isLocalImage(source)) return;
        if (!remoteUrl?.trim()) throw new Error("remoteUrl is empty");

        const patterns = this.imageSourcePatterns(source);
        const blockIds = await this.findBlocksContainingImage(docId, patterns);
        if (blockIds.length === 0) {
            console.warn(`[${this.name}] no block found containing image: ${source}`);
            return;
        }

        let replaced = 0;
        for (const blockId of blockIds) {
            try {
                const data = await this.post<{kramdown: string}>("/api/block/getBlockKramdown", {id: blockId});
                const md = data?.kramdown || "";
                const next = this.replaceImageSources(md, patterns, remoteUrl);
                if (next === md) continue;
                await this.post("/api/block/updateBlock", {
                    id: blockId,
                    dataType: "markdown",
                    data: next,
                });
                replaced++;
            } catch (e) {
                console.warn(`[${this.name}] block replace failed for ${blockId}:`, e);
                throw e;
            }
        }
        if (replaced === 0) {
            throw new Error(`Failed to replace image link: ${source}`);
        }
    }

    /** 收集同一图片在文档中可能出现的路径写法 */
    private imageSourcePatterns(source: string): string[] {
        const patterns = new Set<string>();
        const add = (v: string) => {
            const s = v.trim();
            if (!s) return;
            patterns.add(s);
            try {patterns.add(decodeURIComponent(s));} catch {/* ignore */}
            try {patterns.add(encodeURI(s));} catch {/* ignore */}
        };
        add(source);
        add(source.replace(/^\.?\/+/, ""));
        add(`/${source.replace(/^\.?\/+/, "")}`);
        return [...patterns];
    }

    private replaceImageSources(markdown: string, patterns: string[], remoteUrl: string): string {
        let next = markdown;
        for (const p of patterns) {
            if (!p || !next.includes(p)) continue;
            // 优先替换 markdown / HTML 图片上下文，避免误伤其它文本
            next = next.split(`](${p})`).join(`](${remoteUrl})`);
            next = next.split(`](<${p}>)`).join(`](${remoteUrl})`);
            next = next.split(`src="${p}"`).join(`src="${remoteUrl}"`);
            next = next.split(`src='${p}'`).join(`src='${remoteUrl}'`);
            next = next.split(`src="${encodeURI(p)}"`).join(`src="${remoteUrl}"`);
            if (next.includes(p)) {
                next = next.split(p).join(remoteUrl);
            }
        }
        return next;
    }

    private async findBlocksContainingImage(docId: string, patterns: string[]): Promise<string[]> {
        const ids = new Set<string>();
        try {
            const likes = patterns
                .map((p) => `markdown LIKE '%${this.escapeSql(p)}%'`)
                .join(" OR ");
            const rows = await this.post<Array<{id: string}>>("/api/query/sql", {
                stmt: `SELECT id FROM blocks WHERE root_id = '${this.escapeSql(docId)}' AND type != 'd' AND (${likes})`,
            });
            for (const row of rows || []) {
                if (row?.id) ids.add(row.id);
            }
        } catch (err) {
            console.warn(`[${this.name}] sql lookup failed, walking child blocks:`, err);
        }
        if (ids.size > 0) return [...ids];
        return this.findBlocksContainingByWalk(docId, patterns);
    }

    private async findBlocksContainingByWalk(docId: string, patterns: string[]): Promise<string[]> {
        const ids: string[] = [];
        const walk = async (parentId: string) => {
            const children = await this.post<Array<{id: string; type?: string}>>("/api/block/getChildBlocks", {id: parentId});
            for (const child of children || []) {
                if (!child?.id) continue;
                try {
                    const data = await this.post<{kramdown: string}>("/api/block/getBlockKramdown", {id: child.id});
                    const md = data?.kramdown || "";
                    if (patterns.some((p) => md.includes(p))) ids.push(child.id);
                } catch {/* skip unreadable blocks */}
                await walk(child.id);
            }
        };
        await walk(docId);
        return ids;
    }

    private escapeSql(value: string): string {
        return value.replace(/'/g, "''");
    }

    // ── 图片分析 ────────────────────────────────

    extractImages(markdown: string): ArticleImage[] {
        const images: ArticleImage[] = [];
        const seen = new Set<string>();
        const push = (source: string, kind: "markdown" | "html") => {
            const s = source.trim();
            if (!s || seen.has(s) || !this.looksLikeImage(s)) return;
            seen.add(s);
            const key = this.getManagedObjectKey(s);
            images.push({
                source: s,
                displayUrl: this.toDisplayUrl(s),
                fileName: this.getFileName(s),
                kind,
                isLocal: this.isLocalImage(s),
                isManagedRemote: Boolean(key),
                objectKey: key,
            });
        };
        let m: RegExpExecArray | null;
        const imgRe = /!\[[^\]]*]\(([^)\n]+)\)/g;
        while ((m = imgRe.exec(markdown)) !== null) push(this.extractMarkdownUrl(m[1]), "markdown");
        const htmlRe = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
        while ((m = htmlRe.exec(markdown)) !== null) push(m[1], "html");
        return images;
    }

    private extractMarkdownUrl(target: string): string {
        const t = target.trim();
        if (t.startsWith("<")) {const e = t.indexOf(">"); if (e > 1) return t.slice(1, e);}
        const title = t.match(/\s+["'(]/);
        if (title?.index) return t.slice(0, title.index);
        return t.split(/\s+/)[0] || "";
    }

    private looksLikeImage(source: string): boolean {
        return IMAGE_EXTENSIONS.has(this.getExtension(source));
    }

    private isLocalImage(source: string): boolean {
        if (/^(https?:)?\/\//i.test(source)) return false;
        if (/^(data|blob|mailto|javascript|file):/i.test(source)) return false;
        // 仅处理思源文档资源 assets/，排除挂件/插件路径（如 kmind/kmind.svg）
        const path = source.replace(/^\.?\/+/, "").split("?")[0].split("#")[0];
        return path === "assets" || path.startsWith("assets/");
    }

    private toDisplayUrl(source: string): string {
        if (/^(https?:)?\/\//i.test(source) || /^(data|blob|file):/i.test(source)) return source;
        return source.startsWith("/") ? source : `/${source}`;
    }

    private toFetchableUrl(source: string): string {
        if (/^https?:\/\//i.test(source)) return source;
        if (/^\/\//.test(source)) return `${location.protocol}${source}`;
        if (/^file:\/\//i.test(source)) return source;
        return encodeURI(`${location.origin}${source.startsWith("/") ? source : `/${source}`}`);
    }

    // ── 对象键 ──────────────────────────────────

    createObjectKey(docId: string, fileName: string): string {
        const safe = this.sanitizeFileName(fileName);
        const now = new Date();
        const r: Record<string, string> = {
            "{docId}": docId,
            "{filename}": safe,
            "{name}": safe.replace(/\.[^.]+$/, ""),
            "{ext}": this.getExtension(safe),
            "{yyyy}": String(now.getFullYear()),
            "{mm}": this.pad2(now.getMonth() + 1),
            "{dd}": this.pad2(now.getDate()),
        };
        let key = this.settingsData.directoryTemplate || DEFAULT_SETTINGS.directoryTemplate;
        Object.keys(r).forEach((k) => {key = key.split(k).join(r[k]);});
        return key.replace(/^\/+/, "").replace(/\/{2,}/g, "/");
    }

    private pad2(v: number) {return v < 10 ? `0${v}` : String(v);}
    private sanitizeFileName(fileName: string) {return (fileName || `image-${Date.now()}.png`).replace(/[\\/:*?"<>|#\s]+/g, "-");}

    private getManagedObjectKey(source: string): string {
        const provider = getOrThrow(this.settingsData.provider);
        return provider.getManagedKey(this.settingsData, source);
    }

    // ── 文档 ID ─────────────────────────────────

    getCurrentDocId(): string {
        const id = this.currentDocId || this.findCurrentDocIdFromDom();
        if (!id) throw new Error(this.i18n.openDocumentFirst);
        return id;
    }

    private findCurrentDocIdFromDom(): string {
        const editor = document.querySelector<HTMLElement>(".layout-tab-container:not(.fn__none) .protyle:not(.fn__none)")
            || document.querySelector<HTMLElement>(".protyle:not(.fn__none)");
        return editor?.querySelector<HTMLElement>(".protyle-wysiwyg [data-node-id]")?.dataset.nodeId || "";
    }

    // ── API ──────────────────────────────────────

    async getDocumentMarkdown(docId: string): Promise<string> {
        const data = await this.post<{kramdown: string}>("/api/block/getBlockKramdown", {id: docId});
        return data.kramdown || "";
    }

    private post<T = any>(url: string, payload: any): Promise<T> {
        return new Promise((resolve, reject) => {
            fetchPost(url, payload, (response: any) => {
                if (response.code === 0) resolve(response.data as T);
                else reject(new Error(response.msg || `${url} failed`));
            });
        });
    }

    // ── 事件 ─────────────────────────────────────

    private handleProtyleChanged = ({detail}: CustomEvent<{protyle?: IProtyle}>) => {
        const docId = detail?.protyle?.block?.rootID;
        if (docId) this.currentDocId = docId;
        if (!this.settingsData.autoUploadOnSwitch) return;
        window.clearTimeout(this.autoUploadTimer);
        this.autoUploadTimer = window.setTimeout(() => {
            this.uploadCurrentDocumentImages(undefined, false).catch((err) => console.warn(`[${this.name}] auto upload failed`, err));
        }, AUTO_UPLOAD_DELAY);
    };

    private handlePaste = ({detail}: CustomEvent<PasteDetail>) => {
        const docId = detail?.protyle?.block?.rootID || this.currentDocId || this.findCurrentDocIdFromDom();
        if (docId) this.currentDocId = docId;
        if (!docId || !this.settingsData.autoUploadOnPaste || !this.hasPastedImage(detail)) return;
        this.schedulePasteUpload(docId);
    };

    private schedulePasteUpload(docId: string) {
        const prev = this.pasteUploadTimers.get(docId);
        if (prev) window.clearTimeout(prev);
        const timer = window.setTimeout(() => {
            this.pasteUploadTimers.delete(docId);
            if (!this.settingsData.autoUploadOnPaste) return;
            if (this.uploadingDocs.has(docId)) {this.schedulePasteUpload(docId); return;}
            this.uploadCurrentDocumentImages(docId, false).catch((err) => this.showError(err));
        }, PASTE_UPLOAD_DELAY);
        this.pasteUploadTimers.set(docId, timer);
    }

    private hasPastedImage(detail?: PasteDetail): boolean {
        if (!detail) return false;
        if (detail.localFiles?.some((f) => this.looksLikeImage(f.path))) return true;
        if (detail.files && Array.from(detail.files as ArrayLike<File | DataTransferItem>).some((i) =>
            i.type?.startsWith("image/") || ("name" in i && this.looksLikeImage(i.name)),
        )) return true;
        return [detail.textHTML, detail.siyuanHTML].some((h) => Boolean(h && /<img\b/i.test(h)))
            || Boolean(detail.textPlain && this.looksLikeImage(detail.textPlain.trim()));
    }

    // ── 持久化 ──────────────────────────────────

    private async loadSettings() {
        await this.loadData(STORAGE_NAME).catch((err) => console.warn(`[${this.name}] load settings failed`, err));
        this.storageData = this.migrateStorage(this.data[STORAGE_NAME]);
        this.syncActiveSettings();
    }

    // ── 工具函数 ────────────────────────────────

    formatUploadSummary(results: UploadResult[]): string {
        const ok = results.filter((r) => r.remoteUrl).length;
        const fail = results.filter((r) => r.error).length;
        if (results.length === 0) return this.i18n.noLocalImagesFound;
        return this.i18n.uploadSummary.replace("${success}", String(ok)).replace("${failed}", String(fail));
    }

    getMimeType(fileName: string): string {
        switch (this.getExtension(fileName)) {
            case "avif": return "image/avif";
            case "bmp": return "image/bmp";
            case "gif": return "image/gif";
            case "jpg": case "jpeg": return "image/jpeg";
            case "svg": return "image/svg+xml";
            case "webp": return "image/webp";
            default: return "image/png";
        }
    }

    private getFileName(source: string): string {
        const s = source.split("#")[0].split("?")[0];
        return decodeURIComponent(s.split("/").filter(Boolean).pop() || "") || `image-${Date.now()}.png`;
    }

    private getExtension(source: string): string {
        const match = this.getFileName(source).toLowerCase().match(/\.([a-z0-9]+)$/);
        return match ? match[1] : "";
    }

    showError(error: unknown) {
        showMessage(this.toErrorMessage(error), 6000, "error");
    }

    private toErrorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
