# Bazaar 自动检查整改实施计划

> **面向执行者：** 必须使用 `superpowers:executing-plans`，按任务逐项执行并在每个检查点复核。所有步骤均使用复选框追踪。

**目标：** 生成并发布符合思源笔记集市五项自动检查要求的 `siyuan-plugin-image-hub` v0.1.1。

**实现方式：** 先用可重复命令证明当前文件违反规则，再对清单、版本、更新日志和图标做最小修改。使用现有 Webpack 配置构建 `package.zip`，独立校验源文件与压缩包，最后提交、推送并发布 GitHub Release。

**技术栈：** JSON、Markdown、PNG、Node.js 22、pnpm、Webpack、Git、GitHub Release。

## 全局约束

* 三个平台字段必须严格等于 `["all"]`。
* `funding.custom` 不得包含占位地址；没有真实地址时使用空数组。
* 源文件及压缩包内的 `icon.png` 必须小于 20 KB，且保持 PNG 格式和原有视觉内容。
* 两份清单版本必须同时为 `0.1.1`。
* 发布标签必须为 `v0.1.1`，Release 必须包含新 `package.zip` 并成为 Latest。
* 不修改无关业务代码，不主动修改 Bazaar 拉取请求。

---

### 任务一：建立整改前失败基线

**文件：** 检查 `plugin.json`、`package.json`、`icon.png` 和 `package.zip`。

* [ ] 运行清单规则断言：

  ```bash
  node -e 'const p=require("./plugin.json"); const f=["kernels","backends","frontends"]; if (!f.every(k => JSON.stringify(p[k]) === "[\"all\"]") || (p.funding?.custom||[]).includes("https://ld246.com/sponsor")) process.exit(1)'
  ```

  预期退出码为 1，因为当前清单违反规则。

* [ ] 运行 `test "$(stat -f %z icon.png)" -lt 20480`，预期退出码为 1，因为当前图标约为 2 MB。

### 任务二：修改清单、版本和更新日志

**文件：** 修改 `plugin.json`、`package.json` 和 `CHANGELOG.md`。

* [ ] 将 `kernels`、`backends`、`frontends` 均改成 `["all"]`，将 `funding.custom` 改成 `[]`，将两份清单版本改成 `0.1.1`，并在更新日志顶部添加 `v0.1.1` 的合规整改记录。

* [ ] 运行以下验证，预期退出码为 0：

  ```bash
  node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync("plugin.json")); const n=JSON.parse(fs.readFileSync("package.json")); const f=["kernels","backends","frontends"]; if (p.version!=="0.1.1" || n.version!=="0.1.1" || !f.every(k => JSON.stringify(p[k]) === "[\"all\"]") || (p.funding?.custom||[]).includes("https://ld246.com/sponsor")) process.exit(1)'
  ```

### 任务三：优化图标并重新构建

**文件：** 修改 `icon.png`；生成 `dist/icon.png`、`dist/plugin.json` 和 `package.zip`。

* [ ] 将图标等比例缩至适合插件列表的尺寸；如 128×128 PNG 仍超过 20,480 字节，则降低至 96×96 或 64×64。用 `file icon.png` 确认仍为 PNG。

* [ ] 运行 `test "$(stat -f %z icon.png)" -lt 20480 && file icon.png`，预期退出码为 0 且输出包含 `PNG image data`。

* [ ] 运行 `pnpm run format:check` 和 `pnpm run build`，预期退出码均为 0，并生成新 `package.zip`。

* [ ] 运行以下独立验证：

  ```bash
  unzip -t package.zip
  unzip -p package.zip plugin.json | node -e 'let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s); const f=["kernels","backends","frontends"]; if(p.version!=="0.1.1" || !f.every(k=>JSON.stringify(p[k])==="[\"all\"]") || (p.funding?.custom||[]).includes("https://ld246.com/sponsor")) process.exit(1)})'
  unzip -p package.zip icon.png > /tmp/siyuan-plugin-image-hub-icon.png
  test "$(stat -f %z /tmp/siyuan-plugin-image-hub-icon.png)" -lt 20480
  ```

  预期 ZIP 完整、内部清单合规、内部图标小于 20 KB。

### 任务四：提交、推送并发布 v0.1.1

**文件：** 提交整改及构建产物；推送 `origin/main`；创建 `v0.1.1` Release。

* [ ] 运行 `git diff --check`、`git status --short` 和 `git diff --stat` 复核差异，只暂存本次整改文件，然后提交为 `fix: satisfy bazaar release checks`。

* [ ] 运行 `git push origin main`，创建带注释标签 `v0.1.1` 并推送标签。预期二者均推送到 `jeefeng/siyuan-plugin-image-hub`。

* [ ] 通过可用的 GitHub 身份验证通道创建 `v0.1.1` Release，标题为 `v0.1.1`，上传 `package.zip`，设置为非草稿、非预发布并标记 Latest。

* [ ] 读取 Release 信息，确认标签为 `v0.1.1`、附件名为 `package.zip`、`draft=false`、`prerelease=false`，且 `/releases/latest` 指向该版本。

* [ ] 重新下载远端 `package.zip` 到临时目录，重复任务三的 ZIP、清单和图标验证。只有远端附件也通过时才报告完成。
