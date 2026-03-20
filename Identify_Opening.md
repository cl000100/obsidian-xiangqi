<%*
// ================= 配置区域 =================
// 请确保这里的 IP 和端口与你的群晖 NAS 一致
// 注意末尾带上 /api/identify
const API_URL = "http://192.168.50.159:5050/api/identify"; 

// 客户端版本号
const CLIENT_VER = "C1.1.0";
// ============================================

const activeView = app.workspace.getActiveViewOfType(tp.obsidian.MarkdownView);
if (!activeView) {
    new Notice("❌ 请先打开一个有效的棋谱笔记");
    return;
}

// 1. 获取内容：优先获取选中的文字，若无选中则获取全文
let pgnText = activeView.editor.getSelection();
if (!pgnText || pgnText.trim().length === 0) {
    pgnText = activeView.editor.getValue();
}

// 2. 预检：检查是否有坐标格式 (如 B2-B4)
if (!/[A-I][0-9]-[A-I][0-9]/i.test(pgnText)) {
    new Notice("⚠️ 未检测到有效坐标着法 (例如 B2-B4)");
    return;
}

new Notice("🔍 正在通过 NAS API 识别开局...");

try {
    // 3. 发起异步请求
    const response = await tp.obsidian.requestUrl({
        url: API_URL,
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({ pgn_text: pgnText })
    });

    // 4. 解析 JSON 数据
    const res = response.json;

    if (res.success) {
        // 5. 构建插入笔记的内容（包含 YAML 属性和展示框）
        // 我们将结果插入到笔记的最上方
        const resultHeader = `---
ecco_code: "${res.ecco}"
opening_name: "${res.opening}"
recognize_date: ${tp.date.now("YYYY-MM-DD HH:mm")}
engine_ver: "${res.version}"
script_ver: "${CLIENT_VER}"
---
> [!info] ♟️ 象棋开局自动识别
> - **开局名称**: ${res.opening}
> - **ECCO编号**: ${res.ecco}
> - **具体分支**: ${res.variation || "无"}
> - **推演码**: \`${res.wxf}\`

---
`;

        // 6. 执行插入操作（插入到文档第 0 行）
        activeView.editor.replaceRange(resultHeader, {line: 0, ch: 0});
        
        new Notice(`✅ 识别成功：${res.opening}`);
    } else {
        new Notice(`❌ 引擎识别失败: ${res.error || "未知错误"}`);
    }
} catch (err) {
    console.error("NAS Connection Error:", err);
    new Notice("🔥 无法连接到 NAS。请检查：1.内网IP是否变动；2.NAS容器是否启动。");
}
%>