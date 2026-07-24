/** 图片标记类型 */
export type ImageKind = "markdown" | "html";

/** 存储提供商类型 */
export type ProviderType = "aliyun-oss" | "tencent-cos" | "qiniu" | "s3";

/** 管理器视图 */
export type ManagerView = "article" | "settings";

/** 图床设置基础字段 */
export interface ImageBedSettings {
    accessKeyId: string;
    accessKeySecret: string;
    bucket: string;
    endpoint: string;
    directoryTemplate: string;
    customDomain: string;
    autoUploadOnPaste: boolean;
    autoUploadOnSwitch: boolean;
}

/** 存储配置（含标识字段） */
export interface StorageConfig extends ImageBedSettings {
    id: string;
    name: string;
    provider: ProviderType;
    enabled: boolean;
}

/** 持久化存储结构 */
export interface ImageBedStorage {
    activeConfigId: string;
    configs: StorageConfig[];
}

/** 文档中的图片信息 */
export interface ArticleImage {
    source: string;
    displayUrl: string;
    fileName: string;
    kind: ImageKind;
    isLocal: boolean;
    isManagedRemote: boolean;
    objectKey?: string;
}

/** 单张图片上传结果 */
export interface UploadResult {
    image: ArticleImage;
    remoteUrl?: string;
    error?: string;
}

/** paste 事件的 detail 结构 */
export interface PasteDetail {
    files?: FileList | DataTransferItemList;
    localFiles?: {path: string; size: number}[];
    protyle?: {block?: {rootID?: string}};
    siyuanHTML?: string;
    textHTML?: string;
    textPlain?: string;
}

/** 存储键名 */
export const STORAGE_NAME = "image-bed-config";

/** 切换文档自动上传延迟（毫秒） */
export const AUTO_UPLOAD_DELAY = 1200;

/** 粘贴自动上传延迟（毫秒） */
export const PASTE_UPLOAD_DELAY = 1800;

/** 默认设置 */
export const DEFAULT_SETTINGS: ImageBedSettings = {
    accessKeyId: "",
    accessKeySecret: "",
    bucket: "",
    endpoint: "oss-cn-hangzhou.aliyuncs.com",
    directoryTemplate: "siyuan/{docId}/{filename}",
    customDomain: "",
    autoUploadOnPaste: true,
    autoUploadOnSwitch: false,
};

/** 支持的图片扩展名集合 */
export const IMAGE_EXTENSIONS = new Set([
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

/** 对话框调用的插件方法接口（避免循环依赖） */
export interface PluginActions {
    readonly i18n: Record<string, string>;
    readonly name: string;
    readonly storageData: ImageBedStorage;

    getActiveConfig(): StorageConfig;
    getCurrentDocId(): string;
    saveStorage(): Promise<void>;

    uploadCurrentDocumentImages(docId?: string, notify?: boolean): Promise<UploadResult[]>;
    formatUploadSummary(results: UploadResult[]): string;

    getDocumentMarkdown(docId: string): Promise<string>;
    extractImages(markdown: string): ArticleImage[];
    getMimeType(fileName: string): string;
    pickImageFile(): Promise<File | null>;
    uploadBlob(blob: Blob, objectKey: string, contentType: string): Promise<string>;
    replaceImageInDocument(docId: string, source: string, remoteUrl: string): Promise<void>;
    fetchImageBlob(image: ArticleImage): Promise<Blob>;
    createObjectKey(docId: string, fileName: string): string;

    createStorageConfig(name: string): StorageConfig;
    updateActiveConfigFromForm(formElement: HTMLElement): void;
    assertSettingsReady(): void;

    showError(error: unknown): void;
}
