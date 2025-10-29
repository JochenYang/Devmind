import { DatabaseManager } from "./dist/database.js";
import { MemoryGraphGenerator } from "./dist/memory-graph/index.js";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 使用全局数据库（所有项目的记忆都在这里）
const dbPath = join(homedir(), ".devmind", "memory.db");
const db = new DatabaseManager(dbPath);
const graphGen = new MemoryGraphGenerator(db);

// 获取当前项目路径
const currentProjectPath = process.cwd();
console.log(`\n📂 当前项目路径: ${currentProjectPath}`);

// 获取所有项目
const projects = db.getAllProjects(100);

if (projects.length === 0) {
  console.log("❌ 没有找到任何项目记录");
  console.log("💡 提示：先使用 MCP 工具记录一些项目上下文");
  process.exit(1);
}

console.log(`\n📊 找到 ${projects.length} 个项目:\n`);
projects.forEach((p, i) => {
  const contexts = db.getContextsByProject(p.id);
  const isCurrent = p.path.toLowerCase() === currentProjectPath.toLowerCase();
  const marker = isCurrent ? " 👈 当前项目" : "";
  console.log(`${i + 1}. ${p.name} (${contexts.length} contexts)${marker}`);
});

// 优先选择当前项目（Windows 路径不区分大小写）
let projectWithContexts = projects.find(
  (p) => p.path.toLowerCase() === currentProjectPath.toLowerCase()
);

// 如果当前项目没有contexts，选择contexts最多的项目
if (
  !projectWithContexts ||
  db.getContextsByProject(projectWithContexts.id).length === 0
) {
  console.log("\n⚠️  当前项目没有上下文记录，选择contexts最多的项目...");
  projectWithContexts = projects
    .map((p) => ({
      ...p,
      contextCount: db.getContextsByProject(p.id).length,
    }))
    .filter((p) => p.contextCount > 0)
    .sort((a, b) => b.contextCount - a.contextCount)[0];
}

if (!projectWithContexts) {
  console.log("\n❌ 所有项目都没有上下文记录");
  console.log("💡 提示：先使用 MCP 工具记录一些项目上下文");
  process.exit(1);
}

console.log(`\n✅ 使用项目: ${projectWithContexts.name}`);
console.log(`📍 项目ID: ${projectWithContexts.id}`);

// 生成HTML图谱
console.log("\n🎨 生成HTML图谱...");
const htmlResult = await graphGen.generateGraph(projectWithContexts.id, {
  max_nodes: 0, // 显示所有节点
  focus_type: "all",
});

console.log(`\n✅ HTML图谱已生成: ${htmlResult.file_path}`);

// 关闭数据库
db.close();

// 打开HTML文件
console.log("\n🌐 正在打开HTML图谱...");
try {
  execSync(`start "" "${htmlResult.file_path}"`, { shell: true });
  console.log("\n✨ 测试检查清单 (v1.18.10 时间分层版):");
  console.log("  1. ✓ 查看渐变背景和毛玻璃效果");
  console.log("  2. ✓ 测试搜索功能");
  console.log("  3. ✓ 测试类型筛选下拉框");
  console.log('  4. ✓ 点击"中文"按钮切换语言');
  console.log("  5. ✓ 🎨 验证节点标签完整显示:");
  console.log("      • 图标 (💻📚✅🐛✨💬❌🧪)");
  console.log("      • 质量分数 (75% 85% 92%)");
  console.log("      • 文件信息 (📄 src/auth.ts) 或 内容预览 (💬 Use JWT...)");
  console.log("      • 无空白标签问题 - 所有标签都有意义");
  console.log("  6. ✓ 🕐 验证垂直时间轴布局:");
  console.log("      • 时间轴在页面中央垂直排列");
  console.log("      • 节点按时间顺序从上到下排列（最新在上）");
  console.log("      • 左侧区域：代码/解决方案/对话");
  console.log("      • 右侧区域：文档/错误/配置");
  console.log("      • 时间轴上显示刻度和标签（今天、昨天、X天前等）");
  console.log("      • 真正的按时间排序知识图谱");
  console.log("  7. ✓ 检查tooltip显示完整内容和快捷操作按钮");
  console.log("  8. ✓ 🖱️ 验证tooltip悬停逻辑:");
  console.log("      • 鼠标悬停300ms后才显示tooltip");
  console.log("      • 鼠标离开立即取消显示");
  console.log("      • 只有稳定悬停才触发tooltip");
  console.log("      • 避免意外显示和频繁切换");
  console.log('  9. ✓ 点击"🔍 查找相关"按钮测试标签搜索');
  console.log('  10. ✓ 点击"📋 复制内容"按钮测试内容复制');
  console.log('  11. ✓ 点击"Export JSON"按钮导出数据');
  console.log("  12. ✓ 测试拖拽和缩放功能\n");
} catch (error) {
  console.log(`\n手动打开文件: ${htmlResult.file_path}`);
}
