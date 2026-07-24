import CosSdk from "cos-js-sdk-v5";
import {type ImageBedSettings, type ProviderType} from "./types";

// 检查 SDK 已正确加载
if (!CosSdk || !CosSdk.getAuthorization) {
    console.warn("[Image Hub] cos-js-sdk-v5 loaded but getAuthorization missing");
}

// ── Provider 接口 ────────────────────────────

export interface UploadProvider {
    /** provider 类型标识 */
    type: ProviderType;

    /** 上传文件并返回远程 URL */
    upload(
        settings: ImageBedSettings,
        blob: Blob,
        objectKey: string,
        contentType: string,
    ): Promise<string>;

    /** 根据设置生成公开 URL */
    publicUrl(settings: ImageBedSettings, objectKey: string): string;

    /** 判断 source 是否是当前 provider 管理的远程对象，返回 objectKey（或空） */
    getManagedKey(settings: ImageBedSettings, source: string): string;
}

// ── Provider 注册表 ─────────────────────────

const providers = new Map<ProviderType, UploadProvider>();

export function registerProvider(p: UploadProvider): void {
    providers.set(p.type, p);
}

export function getProvider(type: ProviderType): UploadProvider | undefined {
    return providers.get(type);
}

export function getOrThrow(type: ProviderType): UploadProvider {
    const p = providers.get(type);
    if (!p) throw new Error(`Unsupported provider: ${type}`);
    return p;
}

// ── 工具函数 ────────────────────────────────

function encodeKey(key: string): string {
    return key.split("/").map((p) => encodeURIComponent(p)).join("/");
}

function protocol(): string {
    // 图床公网地址固定 https，勿跟随思源本地 http://127.0.0.1
    return "https";
}

// ── 阿里云 OSS ──────────────────────────────

function normalizeOssEndpoint(ep: string): string {
    return ep.trim()
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "")
        .replace(/^(oss-[\w-]+)$/, "$1.aliyuncs.com");
}

async function signHmacSha1(message: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(secret),
        {name: "HMAC", hash: "SHA-1"}, false, ["sign"],
    );
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
    let bin = "";
    new Uint8Array(sig).forEach((b) => {bin += String.fromCharCode(b);});
    return btoa(bin);
}

registerProvider({
    type: "aliyun-oss",

    async upload(settings, blob, objectKey, contentType): Promise<string> {
        const endpoint = normalizeOssEndpoint(settings.endpoint);
        const bucket = settings.bucket;
        const ossDate = new Date().toUTCString();
        const resource = `/${bucket}/${objectKey}`;
        const stringToSign = ["PUT", "", contentType, ossDate, `x-oss-date:${ossDate}\n${resource}`].join("\n");
        const signature = await signHmacSha1(stringToSign, settings.accessKeySecret);
        const url = `${protocol()}://${bucket}.${endpoint}/${encodeKey(objectKey)}`;
        const response = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: `OSS ${settings.accessKeyId}:${signature}`,
                "Content-Type": contentType,
                "x-oss-date": ossDate,
            },
            body: blob,
        });
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(formatOssError(text, response));
        }
        return this.publicUrl(settings, objectKey);
    },

    publicUrl(settings, objectKey): string {
        const domain = normalizeDomain(settings.customDomain);
        if (domain) return `${domain}/${encodeKey(objectKey)}`;
        return `${protocol()}://${settings.bucket}.${normalizeOssEndpoint(settings.endpoint)}/${encodeKey(objectKey)}`;
    },

    getManagedKey(settings, source): string {
        try {
            const url = new URL(source, location.origin);
            const endpoint = normalizeOssEndpoint(settings.endpoint);
            const hosts = new Set([`${settings.bucket}.${endpoint}`]);
            const domain = normalizeDomain(settings.customDomain);
            if (domain) hosts.add(new URL(domain).host);
            return hosts.has(url.host) ? decodeURIComponent(url.pathname.replace(/^\/+/, "")) : "";
        } catch {return "";}
    },
});

function formatOssError(text: string, response: Response): string {
    const err = parseOssXml(text);
    if (err.code === "AccessDenied" && err.endpoint) {
        return `Bucket ${err.bucket || ""} 的地域 Endpoint 不匹配，请把 Endpoint 改为 ${err.endpoint} 后重试。`;
    }
    if (err.code === "AccessDenied" && err.message?.indexOf("valid Date") > -1) {
        return "OSS 没有收到有效日期。请在 Bucket CORS 的允许 Header 中加入 x-oss-date，然后重试。";
    }
    return [
        `Upload failed: ${response.status} ${response.statusText}`.trim(),
        err.code ? `Code: ${err.code}` : "",
        err.message ? `Message: ${err.message}` : "",
        err.requestId ? `RequestId: ${err.requestId}` : "",
        !err.code && text ? text : "",
    ].filter(Boolean).join("\n");
}

function parseOssXml(text: string): {bucket: string; code: string; endpoint: string; message: string; requestId: string} {
    const empty = {bucket: "", code: "", endpoint: "", message: "", requestId: ""};
    if (!text.trim().startsWith("<")) return empty;
    try {
        const doc = new DOMParser().parseFromString(text, "application/xml");
        const r = (n: string) => doc.querySelector(n)?.textContent?.trim() || "";
        return {bucket: r("Bucket"), code: r("Code"), endpoint: r("Endpoint"), message: r("Message"), requestId: r("RequestId")};
    } catch {return empty;}
}

// ── 腾讯云 COS ──────────────────────────────

function normalizeCosEndpoint(endpoint: string): string {
    // 用户可填 cos.ap-guangzhou.myqcloud.com 或 ap-guangzhou
    const ep = endpoint.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    if (ep.includes(".")) return ep;
    return `cos.${ep}.myqcloud.com`;
}

registerProvider({
    type: "tencent-cos",

    async upload(settings, blob, objectKey, contentType): Promise<string> {
        const endpoint = normalizeCosEndpoint(settings.endpoint);
        const bucket = settings.bucket;
        const region = endpoint.replace(/^cos\./, "").replace(/\.myqcloud\.com$/, "");
        const keyPath = encodeKey(objectKey);

        // 使用官方 SDK 计算签名
        const auth = CosSdk.getAuthorization({
            SecretId: settings.accessKeyId,
            SecretKey: settings.accessKeySecret,
            Method: "PUT",
            Pathname: `/${keyPath}`,
            Key: keyPath,
            Bucket: bucket,
            Region: region,
            Expires: 900,
        });

        const url = `${protocol()}://${bucket}.${endpoint}/${keyPath}`;
        const response = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: auth,
                "Content-Type": contentType,
            },
            body: blob,
        });
        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`COS upload failed: ${response.status} ${response.statusText}\n${text}`);
        }
        return this.publicUrl(settings, objectKey);
    },

    publicUrl(settings, objectKey): string {
        const domain = normalizeDomain(settings.customDomain);
        if (domain) return `${domain}/${encodeKey(objectKey)}`;
        return `${protocol()}://${settings.bucket}.${normalizeCosEndpoint(settings.endpoint)}/${encodeKey(objectKey)}`;
    },

    getManagedKey(settings, source): string {
        try {
            const url = new URL(source, location.origin);
            const hosts = new Set([`${settings.bucket}.${normalizeCosEndpoint(settings.endpoint)}`]);
            const domain = normalizeDomain(settings.customDomain);
            if (domain) hosts.add(new URL(domain).host);
            return hosts.has(url.host) ? decodeURIComponent(url.pathname.replace(/^\/+/, "")) : "";
        } catch {return "";}
    },
});

// ── 公共工具 ────────────────────────────────

function normalizeDomain(domain: string): string {
    const v = domain.trim().replace(/\/+$/, "");
    if (!v) return "";
    return /^https?:\/\//i.test(v) ? v : `${protocol()}://${v}`;
}

// ── Qiniu ───────────────────────────────────
// 预留

// ── S3 ─────────────────────────────────────
// 预留
