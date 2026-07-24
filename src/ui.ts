/** HTML 转义 */
export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;",
    }[char]));
}

/** HTML 属性值转义（复用 escapeHtml） */
export function escapeAttribute(value: string): string {
    return escapeHtml(value);
}

/** 从页面 DOM 中查找当前文档 ID */
export function findCurrentDocIdFromDom(): string {
    const activeEditor = document.querySelector<HTMLElement>(
        ".layout-tab-container:not(.fn__none) .protyle:not(.fn__none)",
    ) || document.querySelector<HTMLElement>(".protyle:not(.fn__none)");
    return activeEditor?.querySelector<HTMLElement>(".protyle-wysiwyg [data-node-id]")?.dataset.nodeId || "";
}

/** 弹出文件选择对话框，仅接受图片类型 */
export function pickImageFile(): Promise<File | null> {
    return new Promise((resolve) => {
        const inputElement = document.createElement("input");
        let settled = false;
        const cleanup = () => {
            window.removeEventListener("focus", handleFocus);
            inputElement.remove();
        };
        const finish = (file: File | null) => {
            if (settled) return;
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

/** 在管理器内部显示结果文本 */
export function showInlineResult(element: HTMLElement, text: string, showMessage: (msg: string) => void) {
    const resultElement = element.querySelector<HTMLElement>(".image-bed__result");
    if (!resultElement) {
        showMessage(text);
        return;
    }
    resultElement.textContent = text;
    resultElement.classList.remove("fn__none");
}
