import { createRequire } from "node:module";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch { ({ chromium } = require(path.join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"))); }
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "evidence/ui-redesign");
await mkdir(output, { recursive: true });
const chrome = process.env.STUDIO_CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
page.setDefaultTimeout(15_000);
const errors = [];
const checks = [];
page.on("pageerror", error => errors.push(error.message));
const nav = () => page.getByRole("navigation", { name: "主要功能" });
const open = label => nav().getByRole("button", { name: label, exact: true }).click();
async function projectAction(name) {
  if (!await page.locator(".project-switcher").evaluate(menu => menu.open)) await page.locator(".project-switcher > summary").click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
}
const screenshot = name => page.screenshot({ path: path.join(output, `${name}.png`), animations: "disabled" });
async function fit(label) {
  const sizes = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, document: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, shell: document.querySelector(".app-shell")?.scrollWidth ?? innerWidth, shellHeight: document.querySelector(".app-shell")?.getBoundingClientRect().height ?? innerHeight, headerTop: document.querySelector(".workspace-header")?.getBoundingClientRect().top ?? 0 }));
  assert.ok(sizes.document <= sizes.width + 1 && sizes.shell <= sizes.width + 1, `${label}: horizontal overflow ${JSON.stringify(sizes)}`);
  assert.ok(sizes.documentHeight <= sizes.height + 1 && sizes.shellHeight <= sizes.height + 1 && sizes.headerTop >= -1, `${label}: app frame overflow ${JSON.stringify(sizes)}`);
  checks.push({ label, ...sizes });
}
async function theme(label) {
  await page.locator(".editor-preferences > summary").click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.keyboard.press("Escape");
}
try {
  await page.goto(process.env.STUDIO_UI_URL ?? "http://127.0.0.1:5173");
  await screenshot("actual-projects");
  await page.getByLabel("导入工程 ZIP").setInputFiles(path.join(root, "evidence/authoring/rainy-promise-conditions.zip"));
  await page.getByTestId("workspace-shell").waitFor();
  assert.equal(await page.getByRole("region", { name: "工程状态" }).count(), 0);
  checks.push({ label: "import opens writing directly without status or structure gate", passed: true });
  await projectAction("章节与角色");
  for (const section of ["章节与场景", "角色", "变量"]) {
    await page.getByRole("navigation", { name: "项目结构分区" }).getByRole("button", { name: section, exact: true }).click();
    await screenshot(`actual-structure-${section === "角色" ? "characters" : section === "变量" ? "variables" : "scenes"}`);
  }
  await page.getByRole("button", { name: "返回创作", exact: true }).click();
  await page.getByTestId("workspace-shell").waitFor();
  await page.locator(".statement-card--dialogue").first().click();
  await screenshot("actual-writer-light");
  const editor = page.getByLabel("对白内容", { exact: true });
  const original = await editor.inputValue();
  await editor.fill(`${original}（真实界面验证）`);
  await editor.blur();
  await page.waitForFunction(text => document.querySelector(".statement-card.is-active .statement-copy")?.textContent?.includes(text), "真实界面验证");
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  assert.equal(await editor.inputValue(), original, "Undo restores the actual dialogue");
  await page.getByRole("button", { name: "重做", exact: true }).click();
  assert.ok((await editor.inputValue()).includes("真实界面验证"));
  await page.locator(".local-save-button").click();
  await page.waitForFunction(() => /已保存|已自动保存/.test(document.querySelector(".local-save-button")?.textContent ?? ""));
  checks.push({ label: "edit, undo, redo and save real dialogue", passed: true });
  // A real round trip checks both lifecycle files and the editor snapshot.
  await projectAction("所有项目");
  await page.getByRole("main", { name: "项目首页" }).waitFor();
  for (const title of ["星海来信", "月下列车"]) {
    await page.getByRole("button", { name: "新建项目", exact: true }).click();
    await page.getByLabel("项目名称", { exact: true }).fill(title);
    if (title === "星海来信") await screenshot("project-create");
    await page.getByRole("button", { name: "创建并开始写作", exact: true }).click();
    await page.getByTestId("workspace-shell").waitFor();
    assert.equal(await page.locator(".project-switcher h1").innerText(), title);
    assert.equal(await page.getByRole("main", { name: "项目结构管理" }).count(), 0);
    await projectAction("所有项目");
    await page.getByRole("main", { name: "项目首页" }).waitFor();
  }
  checks.push({ label: "two named projects enter writing directly and save before returning", passed: true });
  await page.getByRole("button", { name: "新建项目", exact: true }).click();
  assert.equal(await page.getByLabel("项目名称", { exact: true }).evaluate(input => input === document.activeElement), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog", { name: "开启一个新故事" }).isVisible(), false);
  assert.equal(await page.getByRole("button", { name: "新建项目", exact: true }).evaluate(button => button === document.activeElement), true);
  checks.push({ label: "native create dialog restores keyboard focus on Escape", passed: true });
  await page.locator(".project-home__hero h1").click();
  await screenshot("actual-projects");
  await screenshot("project-library");
  for (const label of ["石墨", "暖纸", "清亮"]) {
    await page.locator(".home-theme > summary").click();
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.locator(".home-theme > summary").click();
    await screenshot(`project-library-${label === "石墨" ? "dark" : label === "暖纸" ? "paper" : "light"}`);
  }
  for (const width of [736, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (width === 390) await page.screenshot({ path: path.join(output, "project-library-mobile.png"), fullPage: true, animations: "disabled" });
    checks.push({ label: `project library fits ${width}px`, passed: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("搜索项目", { exact: true }).fill("雨后");
  assert.equal(await page.locator(".home-project-card").count(), 1);
  await page.getByLabel("搜索项目", { exact: true }).fill("");
  await page.reload();
  await page.getByLabel("雨后的约定的更多选项", { exact: true }).click();
  await page.getByRole("button", { name: "快速查看 雨后的约定 Route", exact: true }).click();
  const partialDialog = page.getByRole("dialog", { name: "大项目分场景编辑", exact: true });
  await partialDialog.getByRole("button", { name: /^编辑场景 / }).first().click();
  const partialSource = partialDialog.getByLabel("单场景权威脚本编辑器");
  await partialSource.fill((await partialSource.inputValue()) + "\nscene broken\n");
  await partialSource.press("Tab");
  for (const label of ["加载完整工程", "关闭"]) assert.equal(await partialDialog.getByRole("button", { name: label, exact: true }).isEnabled(), false);
  assert.equal(await partialDialog.getByRole("button", { name: /^编辑场景 / }).first().isEnabled(), false);
  await page.keyboard.press("Escape");
  assert.equal(await partialDialog.isVisible(), true);
  await partialDialog.getByRole("button", { name: "放弃修改并关闭", exact: true }).click();
  await partialDialog.waitFor({ state: "detached" });
  checks.push({ label: "partial scene draft survives blocked navigation and Escape until deliberate discard", passed: true });
  await page.getByRole("button", { name: "打开项目：雨后的约定", exact: true }).click();
  await page.getByTestId("workspace-shell").waitFor();
  await page.locator(".statement-card--dialogue").first().click();
  assert.ok((await page.getByLabel("对白内容", { exact: true }).inputValue()).includes("真实界面验证"));
  checks.push({ label: "one-click project reopen after reload preserves the saved dialogue", passed: true });
  await page.locator(".project-switcher > summary").click();
  await screenshot("project-menu");
  const projectDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /导出工程 ZIP/ }).click();
  const projectDownload = await projectDownloadPromise;
  assert.equal(projectDownload.suggestedFilename(), "雨后的约定.zip");
  const projectZip = path.join(output, "verified-project.zip");
  await projectDownload.saveAs(projectZip);
  const archive = await readFile(projectZip);
  assert.ok(archive.byteLength > 1024 && archive.subarray(0, 2).toString() === "PK");
  const exportedFiles = unzipSync(archive);
  assert.ok(Object.entries(exportedFiles).some(([name, bytes]) => name.startsWith("scripts/") && strFromU8(bytes).includes("真实界面验证")));
  assert.ok(Object.keys(exportedFiles).some(name => name.startsWith(".world-assets/blobs/")));
  checks.push({ label: "project menu saves and exports a real portable ZIP", passed: true });
  await page.locator(".project-switcher").waitFor({ state: "visible" });
  await page.waitForFunction(() => !document.querySelector(".project-switcher")?.open);
  await page.getByRole("navigation", { name: "故事工作区" }).getByRole("button", { name: "脚本", exact: true }).click();
  const script = page.getByLabel("权威脚本编辑器", { exact: true });
  const committedScript = await script.inputValue();
  await script.fill(`${committedScript}\nthis is an invalid statement`);
  await script.blur();
  await page.locator(".project-draft-notice").waitFor();
  await page.locator(".project-switcher > summary").click();
  for (const name of [/所有项目/, /章节与角色/, /导出工程 ZIP/]) assert.equal(await page.getByRole("button", { name }).isEnabled(), false);
  await page.keyboard.press("Escape");
  await script.fill(committedScript);
  await script.blur();
  await page.locator(".project-draft-notice").waitFor({ state: "hidden" });
  await page.getByRole("navigation", { name: "故事工作区" }).getByRole("button", { name: "写作", exact: true }).click();
  checks.push({ label: "invalid script draft blocks project switching and export until repaired", passed: true });


  await open("素材");
  await page.locator(".asset-library-card img").first().waitFor();
  await screenshot("actual-assets");
  assert.equal(await page.locator(".localization-production:visible").count(), 0);
  const firstAsset = page.locator(".asset-library-card").first();
  const assetName = await firstAsset.locator("strong").innerText();
  await firstAsset.click();
  await page.getByRole("dialog", { name: "素材管理" }).waitFor();
  assert.equal(await page.getByLabel("资源显示名称").inputValue(), assetName);
  await page.locator(".asset-detail-preview img").waitFor();
  await screenshot("actual-asset-detail");
  await page.getByLabel("资源显示名称").fill(`${assetName} · 校验`);
  await page.getByRole("button", { name: "仅保存资源名称", exact: true }).click();
  await page.locator(".asset-detail-overview h3").filter({ hasText: `${assetName} · 校验` }).waitFor();
  await page.locator(".asset-repair-details > summary").click();
  await page.getByRole("button", { name: "撤销最近资源更新", exact: true }).click();
  await page.waitForFunction(name => document.querySelector(".asset-detail-overview h3")?.textContent === name, assetName);
  await page.getByRole("button", { name: "重做最近资源更新", exact: true }).click();
  await page.waitForFunction(name => document.querySelector(".asset-detail-overview h3")?.textContent === `${name} · 校验`, assetName);
  await page.getByRole("button", { name: "撤销最近资源更新", exact: true }).click();
  await page.waitForFunction(name => document.querySelector(".asset-detail-overview h3")?.textContent === name, assetName);
  checks.push({ label: "asset drawer loads real image, renames, undoes and redoes metadata", passed: true });
  await page.getByRole("button", { name: "关闭资源保险库", exact: true }).click();
  await page.getByRole("button", { name: "翻译与配音", exact: true }).click();
  assert.equal(await page.locator(".asset-library-grid:visible").count(), 0);
  await screenshot("actual-localization");
  await page.getByRole("button", { name: "附加内容", exact: true }).click();
  await screenshot("actual-collections");

  await open("检查");
  assert.equal(await page.getByTestId("debugger-session").isVisible(), false);
  await page.getByRole("button", { name: "运行正式 QA 检查", exact: true }).click();
  await screenshot("actual-checks");
  await page.getByRole("button", { name: "运行调试", exact: true }).click();
  assert.equal(await page.getByTestId("debugger-session").isVisible(), true);
  await screenshot("actual-debugger");

  await open("游戏外观");
  assert.equal(await page.getByTestId("preview-stage").count(), 0);
  await page.getByRole("combobox", { name: "设置分区" }).selectOption("audio");
  await page.getByRole("spinbutton", { name: "主音量", exact: true }).fill("0.75");
  await page.waitForFunction(() => document.querySelector('.studio-task-nav button:last-child')?.disabled === true);
  assert.equal(await nav().getByRole("button", { name: "发布", exact: true }).isEnabled(), false);
  await page.locator(".project-switcher > summary").click();
  assert.equal(await page.getByRole("button", { name: /所有项目/ }).isEnabled(), false);
  await page.keyboard.press("Escape");
  checks.push({ label: "unapplied appearance changes block leaving the project", passed: true });
  await page.getByRole("button", { name: "应用修改 · 1", exact: true }).click();
  await page.getByRole("combobox", { name: "设置分区" }).selectOption("text");
  await screenshot("actual-appearance");

  await open("发布");
  assert.equal(await page.getByTestId("preview-stage").count(), 0);
  await page.getByLabel("发布名称", { exact: true }).fill("雨后的约定 · 界面验证");
  await page.waitForFunction(() => document.querySelector('.studio-task-nav button:first-child')?.disabled === true);
  assert.equal(await nav().getByRole("button", { name: "故事", exact: true }).isEnabled(), false);
  await page.getByRole("button", { name: "应用发布设置", exact: true }).click();
  await screenshot("actual-publish-info");
  await page.getByRole("button", { name: "继续：导出方式 →", exact: true }).click();
  await screenshot("actual-publish-format");
  await page.getByRole("button", { name: "继续：生成游戏 →", exact: true }).click();
  await screenshot("actual-publish");
  await page.getByRole("button", { name: "构建试玩 HTML", exact: true }).click();
  await page.getByRole("link", { name: /^下载/ }).waitFor({ timeout: 60_000 });
  await screenshot("actual-publish-ready");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: /^下载/ }).click();
  const download = await downloadEvent;
  const exported = path.join(output, "verified-game.html");
  await download.saveAs(exported);
  const player = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  player.on("pageerror", error => errors.push(`export: ${error.message}`));
  await player.goto(`file:///${exported.replaceAll("\\", "/")}`);
  await player.getByRole("button", { name: /^开始故事/ }).waitFor();
  await player.screenshot({ path: path.join(output, "actual-exported-player.png"), animations: "disabled" });
  await player.getByRole("button", { name: /^开始故事/ }).click();
  await player.getByText(/真实界面验证/).waitFor();
  await player.close();
  checks.push({ label: "build, download and run standalone real game", passed: true });

  await open("故事");
  await page.getByRole("button", { name: "试玩完整流程", exact: true }).click();
  await page.getByRole("button", { name: "退出试玩", exact: true }).waitFor();
  const playingState = await page.locator(".playable-preview").getAttribute("class");
  await page.getByRole("button", { name: "收起预览", exact: true }).click();
  assert.equal(await page.getByTestId("preview-stage").isVisible(), false);
  await page.getByRole("button", { name: "打开预览", exact: true }).click();
  assert.equal(await page.locator(".playable-preview").getAttribute("class"), playingState);
  assert.equal(await page.getByRole("button", { name: "退出试玩", exact: true }).isVisible(), true);
  await page.getByRole("navigation", { name: "故事工作区" }).getByRole("button", { name: "路线", exact: true }).click();
  assert.equal(await page.getByTestId("preview-stage").isVisible(), false);
  await page.getByRole("button", { name: "打开预览", exact: true }).click();
  assert.equal(await page.locator(".playable-preview").getAttribute("class"), playingState);
  await page.getByRole("button", { name: "退出试玩", exact: true }).click();
  await page.getByRole("navigation", { name: "故事工作区" }).getByRole("button", { name: "写作", exact: true }).click();
  checks.push({ label: "hiding preview and switching to route retains the real runtime session", passed: true });
  for (const [label, id] of [["石墨", "dark"], ["暖纸", "paper"], ["清亮", "light"]]) {
    await theme(label);
    assert.equal(await page.locator("html").getAttribute("data-editor-theme"), id);
    await screenshot(`actual-writer-${id}`);
  }
  for (const width of [1440, 1024, 736, 390, 320]) {
    await page.setViewportSize({ width, height: width < 640 ? 844 : 1000 });
    for (const label of ["故事", "素材", "游戏外观", "检查", "发布"]) {
      await open(label);
      await fit(`${label} at ${width}px`);
      if (width === 390) await screenshot(`actual-mobile-${{故事:"writer",素材:"assets",游戏外观:"appearance",检查:"checks",发布:"publish"}[label]}`);
    }
    await open("故事");
    for (const label of ["演出", "路线", "脚本", "写作"]) {
      await page.getByRole("navigation", { name: "故事工作区" }).getByRole("button", { name: label, exact: true }).click();
      await fit(`${label} at ${width}px`);
      if (width === 1440 && label === "路线") {
        await page.getByRole("button", { name: "适应画布", exact: true }).click();
        await page.waitForFunction(() => {
          const rect = document.querySelector(".flow-grid")?.getBoundingClientRect();
          return rect && [...document.querySelectorAll(".route-node")].every(node => { const box = node.getBoundingClientRect(); return box.left >= rect.left - 1 && box.top >= rect.top - 1 && box.right <= rect.right + 1 && box.bottom <= rect.bottom + 1; });
        });
        const zoom = await page.locator(".route-canvas-controls output").innerText();
        await page.getByRole("button", { name: "放大路线图", exact: true }).click();
        assert.ok(parseInt(await page.locator(".route-canvas-controls output").innerText()) > parseInt(zoom));
        await page.getByRole("button", { name: "适应画布", exact: true }).click();
        assert.equal(await page.locator(".route-canvas-controls output").innerText(), zoom);
        checks.push({ label: "route overview fits every actual scene and zoom restores correctly", passed: true });
      }
      if (width === 1440 && label !== "写作") await screenshot(`actual-${{演出:"director",路线:"routes",脚本:"script"}[label]}`);
    }
  }
  await page.getByRole("button", { name: "场景列表", exact: true }).click();
  const scene = page.locator(".scene-rail").getByRole("button", { name: /海边/ });
  await scene.click();
  assert.equal(await page.getByTestId("workspace-shell").getAttribute("data-scenes-open"), "false");
  checks.push({ label: "mobile scene picker closes after selecting real scene", passed: true });
  await projectAction("章节与角色");
  await page.getByRole("navigation", { name: "项目结构分区" }).waitFor();
  checks.push({ label: "project structure is accessible from mobile editor", passed: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "返回创作", exact: true }).click();
  await open("素材");
  await page.getByRole("button", { name: "管理素材：海边夕色（测试背景）", exact: true }).click();
  await page.getByLabel("选择资源文件").setInputFiles(path.join(root, "docs/design/2026-10-12-system-redesign/images/sample-station.png"));
  await page.getByRole("button", { name: "更新此资源", exact: true }).click();
  await page.getByText("资源导入完成", { exact: true }).waitFor();
  await page.getByLabel("资源显示名称").fill("雨后的车站 · 示例素材");
  await page.getByRole("button", { name: "仅保存资源名称", exact: true }).click();
  await page.locator(".asset-detail-overview h3").filter({ hasText: "雨后的车站 · 示例素材" }).waitFor();
  await page.locator(".asset-detail-preview img").waitFor();
  await page.locator(".asset-dialog").evaluate(panel => { panel.scrollTop = 0; });
  await screenshot("actual-asset-detail-art");
  await page.getByRole("button", { name: "关闭资源保险库", exact: true }).click();
  await screenshot("actual-assets-art");
  await open("故事");
  await page.locator(".scene-rail").getByRole("button", { name: /海边/ }).click();
  await page.getByRole("navigation", { name: "故事工作区" }).getByRole("button", { name: "演出", exact: true }).click();
  if (await page.getByRole("button", { name: "打开预览", exact: true }).count()) await page.getByRole("button", { name: "打开预览", exact: true }).click();
  await page.locator(".stage-lane--background button.stage-cue").first().click();
  await page.locator(".stage-media-loading").waitFor({ state: "hidden" });
  await page.getByTestId("preview-stage").waitFor();
  await theme("石墨");
  await screenshot("actual-director-art");
  checks.push({ label: "import reference art through actual asset pipeline, replace and preview the real stage", passed: true });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "browser-checks.json"), JSON.stringify({ url: process.env.STUDIO_UI_URL ?? "http://127.0.0.1:5173", checkedAt: new Date().toISOString(), checks, errors, passed: true }, null, 2));
  console.log(JSON.stringify({ passed: true, checks: checks.length, errors, output }));
} catch (error) {
  await screenshot("failure").catch(() => {});
  await writeFile(path.join(output, "browser-checks.json"), JSON.stringify({ passed: false, checks, errors, failure: error.stack }, null, 2));
  throw error;
} finally { await browser.close(); }
