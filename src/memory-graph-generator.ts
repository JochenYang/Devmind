import { Context, Relationship, Project } from './types.js';
import { DatabaseManager } from './database.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export type GraphFormat = 'mermaid' | 'html' | 'json';

export interface GraphNode {
  id: string;
  label: string;
  content: string;        // 完整内容
  type: string;
  importance: number;
  tags: string[];
  created_at: string;
  file_path?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  relation: string;
  strength: number;
}

export interface MemoryGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  metadata: {
    project_name: string;
    total_contexts: number;
    total_relationships: number;
    generated_at: string;
  };
}

export class MemoryGraphGenerator {
  constructor(private db: DatabaseManager) {}

  /**
   * 生成记忆图谱
   */
  async generateGraph(
    projectId: string,
    format: GraphFormat = 'mermaid',
    options: {
      max_nodes?: number;
      focus_type?: string;
      output_path?: string;
    } = {}
  ): Promise<{ content: string; file_path?: string }> {
    // 获取图谱数据
    const graphData = this.extractGraphData(projectId, options);

    // 根据格式生成输出
    switch (format) {
      case 'mermaid':
        return { content: this.generateMermaid(graphData) };
      case 'html':
        return this.generateHTML(graphData, options.output_path);
      case 'json':
        return this.generateJSON(graphData, options.output_path);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * 从数据库提取图谱数据
   */
  private extractGraphData(
    projectId: string,
    options: { max_nodes?: number; focus_type?: string }
  ): MemoryGraphData {
    const project = this.db.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    // 获取contexts
    let contexts = this.db.getContextsByProject(projectId);

    // 过滤类型
    if (options.focus_type && options.focus_type !== 'all') {
      contexts = contexts.filter(c => c.type === options.focus_type);
    }

    // 限制节点数量（选择最重要的）
    // max_nodes=0 表示显示所有，默认也是显示所有
    const maxNodes = options.max_nodes || 0;
    if (maxNodes > 0 && contexts.length > maxNodes) {
      contexts = contexts
        .sort((a, b) => b.quality_score - a.quality_score)
        .slice(0, maxNodes);
    }

    // 构建节点
    const nodes: GraphNode[] = contexts.map(context => ({
      id: context.id,
      label: this.truncateLabel(context.content),
      content: context.content,  // 保存完整内容
      type: context.type,
      importance: context.quality_score,
      tags: context.tags ? context.tags.split(',').filter(t => t) : [],
      created_at: context.created_at,
      file_path: context.file_path
    }));

    // 获取关系
    const contextIds = new Set(contexts.map(c => c.id));
    const edges: GraphEdge[] = [];

    contexts.forEach(context => {
      const related = this.db.getRelatedContexts(context.id);
      related.forEach((rel: any) => {
        // 只包含在节点集合中的关系
        if (contextIds.has(rel.to_context_id)) {
          edges.push({
            from: rel.from_context_id,
            to: rel.to_context_id,
            relation: rel.type,
            strength: rel.strength
          });
        }
      });
    });

    return {
      nodes,
      edges,
      metadata: {
        project_name: project.name,
        total_contexts: contexts.length,
        total_relationships: edges.length,
        generated_at: new Date().toISOString()
      }
    };
  }

  /**
   * 生成Mermaid格式
   */
  private generateMermaid(data: MemoryGraphData): string {
    let mermaid = '```mermaid\n';
    mermaid += 'graph TD\n';
    mermaid += `  %% ${data.metadata.project_name} - Memory Graph\n`;
    mermaid += `  %% Generated: ${data.metadata.generated_at}\n\n`;

    // 添加节点（带样式）
    data.nodes.forEach(node => {
      const shape = this.getMermaidShape(node.type);
      const label = node.label.replace(/"/g, "'"); // 转义引号
      
      mermaid += `  ${node.id}${shape[0]}"${label}"${shape[1]}\n`;
    });

    mermaid += '\n';

    // 添加关系
    const relationStyles = {
      depends_on: '-->',
      related_to: '-.->',
      fixes: '==>',
      implements: '-->',
      tests: '-.->',
      documents: '-->'
    };

    data.edges.forEach(edge => {
      const style = relationStyles[edge.relation as keyof typeof relationStyles] || '-->';
      const label = edge.relation.replace(/_/g, ' ');
      mermaid += `  ${edge.from} ${style}|${label}| ${edge.to}\n`;
    });

    // 添加样式定义
    mermaid += '\n  %% Styles\n';
    mermaid += '  classDef solution fill:#4ade80,stroke:#22c55e,stroke-width:2px\n';
    mermaid += '  classDef error fill:#f87171,stroke:#ef4444,stroke-width:2px\n';
    mermaid += '  classDef code fill:#60a5fa,stroke:#3b82f6,stroke-width:2px\n';
    mermaid += '  classDef doc fill:#a78bfa,stroke:#8b5cf6,stroke-width:2px\n';

    // 应用样式
    const typeClasses: Record<string, string[]> = {
      solution: [],
      error: [],
      code: [],
      documentation: []
    };

    data.nodes.forEach(node => {
      if (typeClasses[node.type]) {
        typeClasses[node.type].push(node.id);
      }
    });

    Object.entries(typeClasses).forEach(([type, ids]) => {
      if (ids.length > 0) {
        mermaid += `  class ${ids.join(',')} ${type}\n`;
      }
    });

    mermaid += '```\n';

    return mermaid;
  }

  /**
   * 生成HTML格式（交互式可视化）
   */
  private generateHTML(
    data: MemoryGraphData,
    outputPath?: string
  ): { content: string; file_path: string } {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.metadata.project_name} - Memory Graph</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      overflow: hidden;
    }
    #graph { width: 100vw; height: 100vh; }
    .controls {
      position: absolute;
      top: 20px;
      left: 20px;
      background: rgba(30, 41, 59, 0.95);
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      z-index: 1000;
    }
    .controls h2 {
      margin-bottom: 15px;
      font-size: 18px;
      color: #60a5fa;
    }
    .controls input {
      width: 100%;
      padding: 8px 12px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      color: #e2e8f0;
      font-size: 14px;
    }
    .stats {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(30, 41, 59, 0.95);
      padding: 15px 20px;
      border-radius: 8px;
      font-size: 12px;
      z-index: 1000;
    }
    .stats div { margin: 4px 0; }
    .legend {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(30, 41, 59, 0.95);
      padding: 15px;
      border-radius: 8px;
      font-size: 12px;
      z-index: 1000;
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin: 6px 0;
    }
    .legend-color {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      margin-right: 8px;
    }
    .node { cursor: pointer; }
    .node:hover { opacity: 0.8; }
    .link { stroke: #475569; stroke-opacity: 0.6; }
    .node-label {
      fill: #e2e8f0;
      font-size: 11px;
      pointer-events: none;
      text-anchor: middle;
    }
  </style>
</head>
<body>
  <div class="controls">
    <h2>🔍 Search</h2>
    <input type="text" id="search" placeholder="Search nodes...">
  </div>

  <div class="legend">
    <h3 style="margin-bottom: 10px;">Node Types</h3>
    <div class="legend-item">
      <div class="legend-color" style="background: #4ade80;"></div>
      <span>Solution</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #f87171;"></div>
      <span>Error</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #60a5fa;"></div>
      <span>Code</span>
    </div>
    <div class="legend-item">
      <div class="legend-color" style="background: #a78bfa;"></div>
      <span>Documentation</span>
    </div>
  </div>

  <div class="stats">
    <div><strong>${data.metadata.project_name}</strong></div>
    <div>📊 Nodes: ${data.metadata.total_contexts}</div>
    <div>🔗 Relationships: ${data.metadata.total_relationships}</div>
    <div>📅 Generated: ${new Date(data.metadata.generated_at).toLocaleString()}</div>
  </div>

  <svg id="graph"></svg>

  <script>
    const data = ${JSON.stringify(data, null, 2)};
    
    // D3.js 可视化
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    const svg = d3.select("#graph")
      .attr("width", width)
      .attr("height", height);
    
    const g = svg.append("g");
    
    // 缩放
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => g.attr("transform", event.transform));
    
    svg.call(zoom);
    
    // 颜色映射
    const colorMap = {
      solution: "#4ade80",
      error: "#f87171",
      code: "#60a5fa",
      documentation: "#a78bfa",
      conversation: "#fbbf24",
      test: "#34d399",
      configuration: "#f472b6",
      commit: "#818cf8"
    };
    
    // 力导向布局
    const simulation = d3.forceSimulation(data.nodes)
      .force("link", d3.forceLink(data.edges).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(40));
    
    // 绘制连线
    const link = g.append("g")
      .selectAll("line")
      .data(data.edges)
      .join("line")
      .attr("class", "link")
      .attr("stroke-width", d => Math.sqrt(d.strength) * 2);
    
    // 绘制节点
    const node = g.append("g")
      .selectAll("circle")
      .data(data.nodes)
      .join("circle")
      .attr("class", "node")
      .attr("r", d => 5 + d.importance * 15)
      .attr("fill", d => colorMap[d.type] || "#64748b")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));
    
    // 节点标签
    const label = g.append("g")
      .selectAll("text")
      .data(data.nodes)
      .join("text")
      .attr("class", "node-label")
      .attr("dy", -15)
      .text(d => d.label.substring(0, 30) + (d.label.length > 30 ? "..." : ""));
    
    // 提示信息 - 显示完整内容
    node.append("title")
      .text(d => {
        const contentPreview = d.content.substring(0, 500) + (d.content.length > 500 ? '...' : '');
        const separator = '\\n\\n---\\n';
        const typeInfo = 'Type: ' + d.type;
        const importanceInfo = 'Importance: ' + (d.importance * 100).toFixed(0) + '%';
        const createdInfo = 'Created: ' + d.created_at;
        const fileInfo = d.file_path ? '\\nFile: ' + d.file_path : '';
        return contentPreview + separator + typeInfo + '\\n' + importanceInfo + '\\n' + createdInfo + fileInfo;
      });
    
    // 更新位置
    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
      
      node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);
      
      label
        .attr("x", d => d.x)
        .attr("y", d => d.y);
    });
    
    // 拖拽
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    
    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    
    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
    
    // 搜索功能
    document.getElementById("search").addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase();
      node.attr("opacity", d => 
        d.label.toLowerCase().includes(query) || d.tags.some(t => t.toLowerCase().includes(query)) ? 1 : 0.1
      );
      label.attr("opacity", d => 
        d.label.toLowerCase().includes(query) || d.tags.some(t => t.toLowerCase().includes(query)) ? 1 : 0.1
      );
    });
  </script>
</body>
</html>`;

    // 保存文件 - 使用项目路径而非当前工作目录
    const projectPath = this.getProjectPath(data.metadata.project_name);
    const filePath = outputPath || join(projectPath || process.cwd(), 'docs', 'memory-graph.html');
    
    // 确保目录存在
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(filePath, html, 'utf-8');

    return { content: html, file_path: filePath };
  }

  /**
   * 生成JSON格式
   */
  private generateJSON(
    data: MemoryGraphData,
    outputPath?: string
  ): { content: string; file_path: string } {
    const json = JSON.stringify(data, null, 2);

    // 保存文件 - 使用项目路径而非当前工作目录
    const projectPath = this.getProjectPath(data.metadata.project_name);
    const filePath = outputPath || join(projectPath || process.cwd(), 'docs', 'memory-graph.json');
    
    // 确保目录存在
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    writeFileSync(filePath, json, 'utf-8');

    return { content: json, file_path: filePath };
  }

  /**
   * 辅助方法：截断标签
   */
  private truncateLabel(text: string, maxLength: number = 40): string {
    text = text.replace(/\n/g, ' ').trim();
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  /**
   * 获取项目路径
   */
  private getProjectPath(projectName: string): string | null {
    try {
      // 从数据库查找项目路径
      const projects = this.db.getAllProjects(100);
      const project = projects.find(p => p.name === projectName);
      return project ? project.path : null;
    } catch {
      return null;
    }
  }

  /**
   * 辅助方法：获取Mermaid节点形状
   */
  private getMermaidShape(type: string): [string, string] {
    const shapes: Record<string, [string, string]> = {
      solution: ['[', ']'],      // 矩形
      error: ['([', '])'],        // 圆角矩形
      code: ['[[', ']]'],         // 子程序形状
      documentation: ['[(', ')]'], // 圆柱形
      conversation: ['>', ']'],   // 不对称形
      test: ['{', '}'],          // 菱形
      configuration: ['{{', '}}'], // 六边形
      commit: ['[/', '/]']        // 平行四边形
    };

    return shapes[type] || ['[', ']'];
  }
}
