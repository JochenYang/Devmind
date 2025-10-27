import { DatabaseManager } from "./dist/database.js";
import { MemoryGraphGenerator } from "./dist/memory-graph-generator.js";
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
  console.log("\n✨ 测试检查清单:");
  console.log("  1. ✓ 查看渐变背景和毛玻璃效果");
  console.log("  2. ✓ 测试搜索功能");
  console.log("  3. ✓ 测试类型筛选下拉框");
  console.log('  4. ✓ 点击"中文"按钮切换语言');
  console.log("  5. ✓ 悬停节点查看自定义tooltip（现在显示更多内容！）");
  console.log("  6. ✓ 检查tooltip是否显示完整的Markdown格式内容");
  console.log('  7. ✓ 点击"Export JSON"按钮导出数据');
  console.log("  8. ✓ 测试拖拽和缩放功能\n");
} catch (error) {
  console.log(`\n手动打开文件: ${htmlResult.file_path}`);
}
