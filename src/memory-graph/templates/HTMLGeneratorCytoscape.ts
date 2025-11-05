/**
 * HTMLGeneratorCytoscape
 *
 * Cytoscape.js-based graph visualization with enhanced stability and performance.
 * Replaces D3.js implementation to fix intermittent drag/click issues.
 */

import { GraphData, GenerateResult, FileOperationError } from "../types.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname, isAbsolute } from "path";

export class HTMLGeneratorCytoscape {
  /**
   * Generate HTML file from graph data
   */
  generate(data: GraphData, outputPath?: string): GenerateResult {
    try {
      const html = this.renderTemplate(data);
      const filePath = this.resolveOutputPath(
        data.metadata.project_path,
        outputPath
      );
      this.writeFile(html, filePath);

      return {
        content: html,
        file_path: filePath,
      };
    } catch (error) {
      throw new FileOperationError(
        `Failed to generate HTML: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error : undefined
      );
    }
  }

  private renderTemplate(data: GraphData): string {
    const nodesJson = JSON.stringify(data.nodes);
    const edgesJson = JSON.stringify(data.edges);
    const metadataJson = JSON.stringify(data.metadata);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(data.metadata.project_name)} - Memory Graph</title>
  <script src="https://unpkg.com/cytoscape@3.28.1/dist/cytoscape.min.js"></script>
  ${this.getStyles()}
</head>
<body>
  ${this.getControls()}
  <div id="cy"></div>
  ${this.getStats()}
  ${this.getLegend()}
  ${this.getScript(nodesJson, edgesJson, metadataJson)}
</body>
</html>`;
  }

  private getStyles(): string {
    return `<style>
    * { 
      margin: 0; 
      padding: 0; 
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #000;
      color: #e2e8f0;
      overflow: hidden;
      position: relative;
      cursor: default;
    }
    /* 渐变光效背景 */
    body::before {
      content: '';
      position: fixed;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: 
        radial-gradient(circle at 20% 30%, rgba(139, 92, 246, 0.15) 0%, transparent 25%),
        radial-gradient(circle at 80% 20%, rgba(236, 72, 153, 0.12) 0%, transparent 25%),
        radial-gradient(circle at 40% 70%, rgba(59, 130, 246, 0.1) 0%, transparent 25%),
        radial-gradient(circle at 70% 80%, rgba(168, 85, 247, 0.08) 0%, transparent 25%);
      animation: gradientShift 20s ease-in-out infinite alternate;
      pointer-events: none;
      z-index: 0;
    }
    /* 几何网格图案 */
    body::after {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-image: 
        linear-gradient(rgba(139, 92, 246, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(139, 92, 246, 0.03) 1px, transparent 1px);
      background-size: 50px 50px;
      pointer-events: none;
      z-index: 0;
    }
    @keyframes gradientShift {
      0% { transform: translate(0, 0) rotate(0deg); }
      100% { transform: translate(5%, 5%) rotate(5deg); }
    }
    #cy { 
      width: 100vw; 
      height: 100vh;
      position: relative;
      z-index: 1;
    }
    #cy:focus { outline: none !important; }
    #cy canvas { 
      outline: none !important;
      border: none !important;
      box-shadow: none !important;
    }
    #cy canvas:focus,
    #cy canvas:active {
      outline: none !important;
      border: none !important;
      box-shadow: none !important;
    }
    #cy *, #cy *:focus, #cy *:active, #cy *::selection {
      outline: none !important;
      border: none !important;
      box-shadow: none !important;
      -webkit-tap-highlight-color: transparent !important;
    }
    .controls {
      position: absolute;
      top: 20px;
      left: 20px;
      background: rgba(0, 0, 0, 0.9);
      backdrop-filter: blur(20px);
      padding: 20px;
      border-radius: 16px;
      width: 200px;
      z-index: 1000;
      border: 1px solid rgba(139, 92, 246, 0.3);
      box-shadow: 0 8px 32px rgba(139, 92, 246, 0.3);
      transition: transform 0.3s ease, opacity 0.3s ease;
    }
    .controls.collapsed {
      transform: translateX(-220px);
      opacity: 0;
      pointer-events: none;
    }
    .toggle-controls {
      position: absolute;
      top: 30px;
      left: 240px;
      background: rgba(0, 0, 0, 0.9);
      backdrop-filter: blur(20px);
      padding: 10px 14px;
      border-radius: 8px;
      cursor: pointer;
      z-index: 1001;
      border: 1px solid rgba(139, 92, 246, 0.3);
      color: #a78bfa;
      font-size: 16px;
      font-weight: bold;
      transition: all 0.3s ease;
      line-height: 1;
      user-select: none;
    }
    .toggle-controls:hover {
      background: rgba(139, 92, 246, 0.2);
      color: #c4b5fd;
      transform: scale(1.05);
      border-color: #8b5cf6;
    }
    .toggle-controls.collapsed {
      left: 20px;
    }
    .controls h2 {
      margin-bottom: 15px;
      font-size: 18px;
      color: #a78bfa;
      text-shadow: 0 0 10px rgba(139, 92, 246, 0.3);
    }
    .controls input, .controls select {
      width: 100%;
      padding: 8px 12px;
      background: rgba(20, 20, 20, 0.95);
      border: 1px solid rgba(139, 92, 246, 0.2);
      border-radius: 6px;
      color: #e2e8f0;
      font-size: 14px;
      user-select: text;
      -webkit-user-select: text;
      cursor: text;
      transition: border-color 0.2s;
    }
    .controls input:focus, .controls select:focus {
      outline: none;
      border-color: #8b5cf6;
      box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.1);
    }
    .control-group {
      margin-bottom: 15px;
    }
    .control-label {
      display: block;
      margin-bottom: 6px;
      font-size: 12px;
      color: #94a3b8;
      font-weight: 500;
    }
    .radio-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .radio-label, .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #e2e8f0;
      cursor: pointer;
      transition: color 0.2s;
      padding: 6px 0;
    }
    .radio-label input[type="radio"],
    .checkbox-label input[type="checkbox"] {
      width: auto;
      margin: 0;
      cursor: pointer;
      accent-color: #8b5cf6;
    }
    .radio-label:hover, .checkbox-label:hover {
      color: #a78bfa;
    }
    .btn {
      width: 100%;
      padding: 10px 16px;
      background: linear-gradient(135deg, #8b5cf6, #a855f7);
      color: white;
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      margin-top: 8px;
      transition: all 0.2s;
      font-size: 14px;
    }
    .btn:hover {
      background: linear-gradient(135deg, #7c3aed, #9333ea);
      border-color: #8b5cf6;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(139, 92, 246, 0.5);
    }
    .btn:active {
      transform: translateY(0);
    }
    .stats {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(0, 0, 0, 0.9);
      backdrop-filter: blur(20px);
      padding: 15px;
      border-radius: 16px;
      border: 1px solid rgba(139, 92, 246, 0.3);
      font-size: 13px;
      z-index: 1000;
      box-shadow: 0 8px 32px rgba(139, 92, 246, 0.3);
    }
    .stats > div {
      margin-bottom: 6px;
    }
    .stats > div:last-child {
      margin-bottom: 0;
    }
    .legend {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(0, 0, 0, 0.9);
      backdrop-filter: blur(20px);
      padding: 15px;
      border-radius: 16px;
      border: 1px solid rgba(139, 92, 246, 0.3);
      font-size: 12px;
      z-index: 1000;
      box-shadow: 0 8px 32px rgba(139, 92, 246, 0.3);
    }
    .legend > div {
      margin-bottom: 4px;
    }
    .custom-tooltip {
      position: absolute;
      background: #0a0a0a;  /* 更深的黑色 */
      backdrop-filter: blur(20px);
      border: 1px solid rgba(139, 92, 246, 0.4);
      border-radius: 12px;
      padding: 16px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 2000;
      max-width: 500px;
      max-height: 500px;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(139, 92, 246, 0.2);
      user-select: text;
      -webkit-user-select: text;
      cursor: auto;
    }
    .custom-tooltip.visible {
      opacity: 1;
      pointer-events: auto; /* 仅可见时接收事件 */
    }
    .custom-tooltip.pinned {
      border: 2px solid #8b5cf6;
      box-shadow: 0 12px 48px rgba(139, 92, 246, 0.5);
      pointer-events: auto;
    }
    .tooltip-title {
      font-weight: 600;
      color: #a78bfa;
      margin-bottom: 12px;
      font-size: 14px;
      text-shadow: 0 0 10px rgba(139, 92, 246, 0.3);
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(139, 92, 246, 0.2);
    }
    .tooltip-content {
      color: #d1d5db;
      font-size: 13px;
      line-height: 1.6;
      margin-bottom: 12px;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      max-height: 300px;
      overflow-y: auto;
    }
    .tooltip-meta {
      font-size: 11px;
      color: #9ca3af;
      background: rgba(139, 92, 246, 0.05);
      border-radius: 6px;
      padding: 10px;
      margin-top: 12px;
      line-height: 1.8;
    }
    .tooltip-meta > div {
      margin-bottom: 4px;
    }
    .tooltip-meta > div:last-child {
      margin-bottom: 0;
    }
    .tooltip-hint {
      font-size: 10px;
      color: #94a3b8;
      padding: 6px 0 0 0;
      border-top: 1px solid rgba(148, 163, 184, 0.1);
      margin-top: 6px;
    }
    /* 自定义滚动条 */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    ::-webkit-scrollbar-track {
      background: rgba(20, 20, 20, 0.5);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(139, 92, 246, 0.3);
      border-radius: 4px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(139, 92, 246, 0.5);
    }
    /* Zone labels overlay - remove, will use Cytoscape elements instead */
  </style>`;
  }

  private getControls(): string {
    return `<div class="toggle-controls" id="toggleControls" title="Hide Controls Panel">&lt;</div>
  <div class="controls" id="controlsPanel">
    <h2 id="controlsTitle">Controls</h2>
    <div class="control-group">
      <label class="control-label" id="searchLabel">Search Nodes</label>
      <input type="text" id="search" placeholder="Search...">
    </div>
    <div class="control-group">
      <label class="control-label" id="filterLabel">Filter by Zone</label>
      <select id="typeFilter">
        <option value="all" id="optionAll">All Zones</option>
        <option value="conversation">💬 Conversation</option>
        <option value="solution">✨ Solution</option>
        <option value="code">💻 Code</option>
        <option value="documentation">📚 Documentation</option>
        <option value="error">🐛 Error</option>
        <option value="configuration">⚙️ Configuration</option>
      </select>
    </div>
    <div class="control-group">
      <label class="control-label" id="displayModeLabel">Display Mode</label>
      <div class="radio-group">
        <label class="radio-label">
          <input type="radio" name="displayMode" value="preview" id="modePreview">
          <span id="modePreviewText">Preview (50)</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="displayMode" value="standard" id="modeStandard" checked>
          <span id="modeStandardText">Standard (100)</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="displayMode" value="full" id="modeFull">
          <span id="modeFullText">Full (All)</span>
        </label>
      </div>
    </div>
    <button class="btn" id="langToggle">🌐 中文</button>
    <button class="btn" id="resetLayout">🔄 Reset Layout</button>
  </div>
  
  <div class="custom-tooltip" id="customTooltip">
    <div class="tooltip-title" id="tooltipTitle"></div>
    <div class="tooltip-content" id="tooltipContent"></div>
    <div class="tooltip-meta" id="tooltipMeta"></div>
    <div class="tooltip-hint" id="tooltipHint">💡 Click node to pin this window</div>
  </div>`;
  }

  private getStats(): string {
    return `<div class="stats">
    <div id="displayingText"><strong>Displaying:</strong> <span id="nodeCount">0</span>/<span id="totalNodes">0</span></div>
    <div id="visibleText"><strong>Visible:</strong> <span id="visibleCount">0</span></div>
    <div id="performanceText"><strong>Performance:</strong> <span id="performanceStatus" style="color: #34d399;">Good</span></div>
  </div>`;
  }

  private getLegend(): string {
    return `<div class="legend">
    <div><strong id="legendTitle">Legend</strong></div>
    <div style="margin-top: 8px;">
      <div>💬 <span id="legendConversation">Conversation</span></div>
      <div>✨ <span id="legendSolution">Solution</span></div>
      <div>💻 <span id="legendCode">Code</span></div>
      <div>📚 <span id="legendDocumentation">Documentation</span></div>
      <div>🐛 <span id="legendError">Error</span></div>
      <div>⚙️ <span id="legendConfiguration">Configuration</span></div>
    </div>
  </div>`;
  }

  private getScript(
    nodesJson: string,
    edgesJson: string,
    metadataJson: string
  ): string {
    const safeNodesJson = this.escapeJsonForScript(nodesJson);
    const safeEdgesJson = this.escapeJsonForScript(edgesJson);
    const safeMetadataJson = this.escapeJsonForScript(metadataJson);

    return `<script>
    const graphData = {
      nodes: ${safeNodesJson},
      edges: ${safeEdgesJson},
      metadata: ${safeMetadataJson}
    };
    
    // Language state early for labels
    let currentLang = 'en';
    
    // 显示模式配置（标签始终显示）
    const displayModes = {
      preview: { limit: 30, labels: true },
      standard: { limit: 100, labels: true },
      full: { limit: 0, labels: true }
    };
    let currentMode = 'standard';
    let currentFilter = 'all';
    let searchQuery = '';
    const totalNodeCount = graphData.nodes.length;
    
    // Zone color mapping - 优化配色方案
    const zoneColors = {
      conversation: '#fbbf24',  // 温暖的金色
      solution: '#10b981',     // 清新的绿色
      code: '#3b82f6',        // 明亮的蓝色
      documentation: '#8b5cf6', // 高雅的紫色
      error: '#ef4444',       // 鲜明的红色
      configuration: '#ec4899' // 活力的粉色
    };
    
    // Type to zone mapping
    const typeToZone = {
      conversation: 'conversation',
      documentation: 'documentation',
      solution: 'solution',
      code: 'code',
      test: 'code',
      error: 'error',
      bug_fix: 'error',
      bug_report: 'error',
      configuration: 'configuration',
      commit: 'configuration',
      code_create: 'code',
      code_modify: 'code',
      code_delete: 'code',
      code_refactor: 'code',
      code_optimize: 'code',
      feature: 'solution',
      feature_add: 'solution',
      feature_update: 'solution',
      feature_remove: 'solution'
    };
    
    // Prepare Cytoscape data with zone assignments
    // 标签截断，避免过长导致布局拥挤
    function truncateLabel(str, max = 36) {
      const s = (str || '').trim();
      return s.length <= max ? s : s.slice(0, max) + '…';
    }

    const cytoscapeNodes = graphData.nodes.map(node => {
      const zone = typeToZone[node.type] || 'code';
      const color = zoneColors[zone] || '#60a5fa';
      const importance = node.quality_score || 50;
      const baseLabel = node.label || node.id;
      const displayLabel = truncateLabel(baseLabel, 36);
      
      return {
        data: {
          id: node.id,
          label: baseLabel,
          display_label: displayLabel,
          zone: zone,
          type: node.type,
          color: color,
          importance: importance,
          content: node.content || '',
          created_at: node.created_at || '',
          tags: node.tags || [],
          file_path: node.file_path || ''
        }
      };
    });
    
    // D3-style vertical zone layout (6 columns with fixed spacing)
    const zones = ['conversation', 'solution', 'code', 'documentation', 'error', 'configuration'];
    // 优化的Zone布局参数
    const zoneWidth = 300;
    const nodeSpacing = 80;
    const labelHeight = 30;    // 标签高度
    const topMargin = 50;      // 顶部边距
    const nodeStartY = topMargin + labelHeight + 40; // 节点起始Y位置
    const startX = 50;         // 左边距
    
    // Group nodes by zone and sort by created_at (newest first)
    const nodesByZone = {};
    zones.forEach(z => nodesByZone[z] = []);
    cytoscapeNodes.forEach(node => {
      const zone = node.data.zone;
      nodesByZone[zone].push(node);
    });
    
    // Sort nodes within each zone by created_at (newest first)
    zones.forEach(zone => {
      nodesByZone[zone].sort((a, b) => {
        const dateA = new Date(a.data.created_at || 0).getTime();
        const dateB = new Date(b.data.created_at || 0).getTime();
        return dateB - dateA; // newest first
      });
    });
    
    // Calculate fixed positions for each node (D3 style)
    const nodePositions = {};
    zones.forEach((zone, zoneIdx) => {
      const nodesInZone = nodesByZone[zone];
      const zoneX = startX + (zoneIdx * zoneWidth) + (zoneWidth / 2);
      
      nodesInZone.forEach((node, nodeIdx) => {
        nodePositions[node.data.id] = {
          x: zoneX,
          y: nodeStartY + (nodeIdx * nodeSpacing)
        };
      });
    });
    
    // Zone labels data for initial text
    const zoneLabelsData = {
      conversation: { en: '💬 Conversation', zh: '💬 对话' },
      solution: { en: '✨ Solution', zh: '✨ 解决方案' },
      code: { en: '💻 Code', zh: '💻 代码' },
      documentation: { en: '📚 Documentation', zh: '📚 文档' },
      error: { en: '🐛 Error', zh: '🐛 错误' },
      configuration: { en: '⚙️ Configuration', zh: '⚙️ 配置' }
    };

    // Add zone label nodes (as special Cytoscape nodes)
    const zoneLabelNodes = zones.map((zone, idx) => {
      const zoneX = startX + (idx * zoneWidth) + (zoneWidth / 2);
      const count = (nodesByZone[zone] || []).length;
      const initialLabel = zoneLabelsData[zone].en + ' (' + count + ')';
      return {
        data: {
          id: 'zone-label-' + zone,
          label: initialLabel, // non-null initial label
          zone: zone,
          type: 'zone-label',
          color: zoneColors[zone],
          importance: 0,
          content: '',
          created_at: '',
          tags: [],
          file_path: '',
          isZoneLabel: true
        },
        position: { x: zoneX, y: topMargin + 15 },
        locked: true,
        grabbable: false,
        selectable: false,
        pannable: false  // 不阻挡画布拖拽
      };
    });
    
    const cytoscapeEdges = graphData.edges.map(edge => ({
      data: {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label || ''
      }
    }));
    
    // Initialize Cytoscape
    const cy = cytoscape({
      container: document.getElementById('cy'),
      elements: [...zoneLabelNodes, ...cytoscapeNodes, ...cytoscapeEdges],
      
      style: [
        {
          selector: 'core',
          style: {
'active-bg-opacity': 0,
            'active-bg-color': 'rgba(0,0,0,0)',
            'selection-box-opacity': 0,
            'selection-box-color': 'rgba(0,0,0,0)',
            'selection-box-border-color': 'rgba(0,0,0,0)',
            'selection-box-border-width': 0
          }
        },
        {
          selector: 'node',
          style: {
            // 根据质量分级显示颜色（设计文档）
            'background-color': ele => {
              const importance = ele.data('importance') || 50;
              if (importance >= 80) return '#f472b6';  // 高质量 - 粉红色
              if (importance >= 60) return '#a78bfa';  // 中质量 - 紫色
              return '#60a5fa';                         // 低质量 - 蓝色
            },
            'label': (ele) => (ele.data('display_label') || ele.data('label') || ''),
            // 根据质量调整大小
            'width': ele => {
              const importance = ele.data('importance') || 50;
              return Math.max(20, Math.min(50, 20 + importance / 2));
            },
            'height': ele => {
              const importance = ele.data('importance') || 50;
              return Math.max(20, Math.min(50, 20 + importance / 2));
            },
            'color': '#d1d5db',  // 柔和的浅灰色，不刺眼
            'text-outline-color': 'rgba(0, 0, 0, 0.8)',
            'text-outline-width': 2,
            'font-size': '10px',
            'text-valign': 'top',
            'text-halign': 'center',
            'text-margin-y': -15,
            'text-max-width': '150px',
            'text-wrap': 'none',       // 单行标签，超长由我们手动截断
            'text-events': 'no',       // 关键：文本不拦截鼠标事件，允许背景拖拽
            'border-width': 1,
            'border-color': 'rgba(255, 255, 255, 0.2)',
            'overlay-opacity': 0,
            'transition-property': 'background-color, border-color, border-width',
            'transition-duration': '200ms'
          }
        },
        {
          selector: 'node:selected',
          style: {
            // 禁用选中边框与覆盖层，避免拖拽时出现边框
            'border-width': 0,
            'overlay-opacity': 0
          }
        },
        {
          selector: 'node.highlighted',
          style: {
            'border-width': 3,
            'border-color': '#60a5fa',
            'z-index': 999
          }
        },
        {
          selector: 'node.dragging',
          style: {
            'opacity': 0.8
          }
        },
        {
          selector: 'node.filtered',
          style: {
            'opacity': 0,
            'text-opacity': 0,
            'display': 'none'
          }
        },
        {
          selector: 'node[type="zone-label"]',
          style: {
            'background-opacity': 0,
            'border-width': 0,
            'label': (ele) => (ele.data('label') || ''),
            'color': 'data(color)',  // 区域标签保持彩色
            'font-size': '14px',
            'font-weight': 'bold',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-outline-width': 0,
            'width': 1,  // 极小的宽度，减少点击区域
            'height': 1,
            'events': 'no'  // 完全不响应事件
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 1,
            'line-color': '#444',
            'target-arrow-color': '#444',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'opacity': 0.3,
            'transition-property': 'line-color, opacity',
            'transition-duration': '0.2s'
          }
        },
        {
          selector: 'edge.highlighted',
          style: {
            'line-color': '#4ade80',
            'target-arrow-color': '#4ade80',
            'opacity': 0.8,
            'width': 2
          }
        },
        {
          selector: 'edge.filtered',
          style: {
            'opacity': 0.1
          }
        }
      ],
      
      layout: {
        name: 'preset',
        animate: true,
        animationDuration: 500,
        fit: true,
        padding: 50,
        positions: function(node) {
          return nodePositions[node.id()] || { x: 0, y: 0 };
        }
      },
      
      minZoom: 0.2,
      maxZoom: 4,
      motionBlur: true,
      motionBlurOpacity: 0.2,
      hideEdgesOnViewport: true,
      textureOnViewport: true,
      pixelRatio: 1,
      
      // 优化交互：禁止节点拖动，只能拖拽画布
      autoungrabify: true,  // 禁止节点拖动
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
      selectionType: 'single',
      touchTapThreshold: 8,
      desktopTapThreshold: 4
    });
    
    // i18n support (declare early for zone labels)
    // currentLang declared earlier
    
    // Zone labels data (already used for initial labels above)
    // const zoneLabelsData declared earlier
    
    function updateZoneLabels() {
      zones.forEach(zone => {
        const count = nodesByZone[zone].length;
        const labelText = (currentLang === 'zh' ? zoneLabelsData[zone].zh : zoneLabelsData[zone].en) + ' (' + count + ')';
        const labelNode = cy.getElementById('zone-label-' + zone);
        if (labelNode.length > 0) {
          labelNode.data('label', labelText);
          // 强制更新样式，确保显示
          labelNode.style('label', labelText);
        }
      });
    }
    
    // Initial render
    updateZoneLabels();

    // 彻底关闭所有选中功能与边框
    cy.nodes().unselectify();
    cy.edges().unselectify();
    cy.boxSelectionEnabled(false);
    
    // 禁用所有可能触发选择框的事件
    cy.off('boxstart');
    cy.off('boxend');
    cy.off('boxselect');
    cy.off('select');
    cy.off('unselect');
    
    // 自定义平滑缩放（替代默认缩放，更丝滑）
    cy.userZoomingEnabled(false);
    const container = cy.container();
    let zoomRAF = null;
    function smoothZoom(targetLevel, renderedPosition, duration = 140) {
      const start = performance.now();
      const startLevel = cy.zoom();
      const min = cy.minZoom();
      const max = cy.maxZoom();
      const goal = Math.max(min, Math.min(max, targetLevel));
      if (zoomRAF) cancelAnimationFrame(zoomRAF);
      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
      const step = () => {
        const now = performance.now();
        const p = Math.min(1, (now - start) / duration);
        const z = startLevel + (goal - startLevel) * easeOutCubic(p);
        cy.zoom({ level: z, renderedPosition });
        if (p < 1) zoomRAF = requestAnimationFrame(step);
      };
      zoomRAF = requestAnimationFrame(step);
    }
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const renderedPosition = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const factor = Math.pow(1.0015, -e.deltaY);
      const target = cy.zoom() * factor;
      smoothZoom(target, renderedPosition);
    }, { passive: false });
    
    // 延迟清除 canvas 边框（等待 Cytoscape 完全初始化）
    setTimeout(() => {
      const canvas = container.querySelector('canvas');
      if (canvas) {
        const clearBorder = () => {
          canvas.style.outline = 'none';
          canvas.style.border = 'none';
          canvas.style.boxShadow = 'none';
        };
        // 初始清除
        clearBorder();
        // 监听拖拽事件，实时清除
        container.addEventListener('mousedown', clearBorder);
        container.addEventListener('mousemove', clearBorder);
        container.addEventListener('mouseup', clearBorder);
        // 监听 canvas 本身的焦点事件
        canvas.addEventListener('focus', clearBorder);
        canvas.addEventListener('blur', clearBorder);
      }
    }, 200);
    
    // Tooltip handling
    const tooltip = document.getElementById('customTooltip');
    const tooltipTitle = document.getElementById('tooltipTitle');
    const tooltipContent = document.getElementById('tooltipContent');
    const tooltipMeta = document.getElementById('tooltipMeta');
    let tooltipPinned = false;
    let currentTooltipNode = null;
    
    function showTooltip(node, x, y) {
      const data = node.data();
      
      // Skip zone labels
      if (data.isZoneLabel) return;
      
      tooltipTitle.textContent = data.label;
      tooltipContent.textContent = data.content; // 显示完整内容
      
      // 使用 HTML 分行显示元数据
      const metaInfo = [];
      metaInfo.push(\`<div><strong>Type:</strong> \${data.type}</div>\`);
      if (data.importance) metaInfo.push(\`<div><strong>Quality:</strong> \${data.importance.toFixed(0)}%</div>\`);
      if (data.created_at) metaInfo.push(\`<div><strong>Created:</strong> \${new Date(data.created_at).toLocaleString()}\`);
      if (data.tags && data.tags.length > 0) metaInfo.push(\`<div><strong>Tags:</strong> \${data.tags.join(', ')}</div>\`);
      if (data.file_path) metaInfo.push(\`<div><strong>File:</strong> \${data.file_path}</div>\`);
      
      tooltipMeta.innerHTML = metaInfo.join('');
      
      // 边界检测：确保tooltip不超出视口
      const tooltipWidth = 600; // max-width
      const tooltipHeight = 500; // max-height
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let tooltipX = x + 20;
      let tooltipY = y + 20;
      
      // 右边界检测：如果超出右边，显示在节点左侧
      if (tooltipX + tooltipWidth > viewportWidth) {
        tooltipX = Math.max(10, x - tooltipWidth - 20);
      }
      
      // 底部边界检测：如果超出底部，向上调整
      if (tooltipY + tooltipHeight > viewportHeight) {
        tooltipY = Math.max(10, viewportHeight - tooltipHeight - 20);
      }
      
      // 左边界检测
      if (tooltipX < 10) {
        tooltipX = 10;
      }
      
      // 顶部边界检测
      if (tooltipY < 10) {
        tooltipY = 10;
      }
      
      tooltip.style.left = tooltipX + 'px';
      tooltip.style.top = tooltipY + 'px';
      tooltip.classList.add('visible');
      currentTooltipNode = node;
    }
    
    function hideTooltip() {
      if (!tooltipPinned) {
        tooltip.classList.remove('visible');
        currentTooltipNode = null;
      }
    }
    
    // Node events (exclude zone labels)
    cy.on('tap', 'node[type!="zone-label"]', function(evt) {
      const node = evt.target;
      const pos = node.renderedPosition();
      
      if (tooltipPinned && currentTooltipNode === node) {
        tooltipPinned = false;
        tooltip.classList.remove('pinned');
        hideTooltip();
      } else {
        tooltipPinned = true;
        tooltip.classList.add('pinned');
        showTooltip(node, pos.x, pos.y);
      }
    });
    
    cy.on('mouseover', 'node[type!="zone-label"]', function(evt) {
      const node = evt.target;
      const pos = node.renderedPosition();
      
      // 如果tooltip已pin且不是当前节点，取消pin
      if (tooltipPinned && currentTooltipNode !== node) {
        tooltipPinned = false;
        tooltip.classList.remove('pinned');
      }
      
      // 总是显示tooltip
      showTooltip(node, pos.x, pos.y);
      node.addClass('highlighted');
      
      // Highlight connected edges
      node.connectedEdges().addClass('highlighted');
    });
    
    cy.on('mouseout', 'node[type!="zone-label"]', function(evt) {
      if (!tooltipPinned) {
        hideTooltip();
        evt.target.removeClass('highlighted');
        evt.target.connectedEdges().removeClass('highlighted');
      }
    });
    
    // 拖拽事件（根据设计文档）
    cy.on('dragstart', 'node[type!="zone-label"]', function(evt) {
      const node = evt.target;
      node.addClass('dragging');
      // 临时隐藏连线，提升性能
      node.connectedEdges().style('opacity', 0.1);
    });
    
    cy.on('dragend', 'node[type!="zone-label"]', function(evt) {
      const node = evt.target;
      node.removeClass('dragging');
      // 恢复连线显示
      setTimeout(() => {
        node.connectedEdges().style('opacity', 0.4);
      }, 100);
    });
    
    // Background click
    cy.on('tap', function(evt) {
      if (evt.target === cy && tooltipPinned) {
        tooltipPinned = false;
        tooltip.classList.remove('pinned');
        hideTooltip();
      }
    });
    
    // Filtering and search
    function applyFilters() {
      const mode = displayModes[currentMode];
      const limit = mode.limit || totalNodeCount;
      
      const zoneLabels = cy.nodes('[type="zone-label"]');
      let filteredNodes = cy.nodes('[type!="zone-label"]'); // 排除区域标签
      
      // Zone filter
      if (currentFilter !== 'all') {
        filteredNodes = filteredNodes.filter(node => node.data('zone') === currentFilter);
      }
      
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredNodes = filteredNodes.filter(node => {
          const label = (node.data('label') || '').toLowerCase();
          const display = (node.data('display_label') || '').toLowerCase();
          const content = (node.data('content') || '').toLowerCase();
          const tags = (node.data('tags') || []).join(' ').toLowerCase();
          const filePath = (node.data('file_path') || '').toLowerCase();
          return label.includes(query) || display.includes(query) || content.includes(query) || tags.includes(query) || filePath.includes(query);
        });
      }
      
      // Apply limit（不包含 zone label）
      const limitedNodes = filteredNodes.slice(0, limit);
      
      // Update visibility
      cy.nodes().addClass('filtered');
      cy.edges().addClass('filtered');
      limitedNodes.removeClass('filtered');
      zoneLabels.removeClass('filtered'); // 区域标签始终可见
      
      // Show edges connected to visible nodes
      limitedNodes.connectedEdges().removeClass('filtered');
      
      // Toggle labels（只对内容节点；区域标签始终显示）
      if (mode.labels) {
        limitedNodes.style('label', ele => ele.data('display_label'));
      } else {
        limitedNodes.style('label', '');
      }
      // 区域标签始终显示，不受 Show Labels 影响
      zoneLabels.style('label', ele => (ele.data('label') || ''));
      
      updateStats();
    }
    
    function updateStats() {
      // 只计算非 zone-label 节点
      const visible = cy.nodes('[type!="zone-label"]').not('.filtered').length;
      
      document.getElementById('nodeCount').textContent = visible;
      document.getElementById('totalNodes').textContent = totalNodeCount;
      document.getElementById('visibleCount').textContent = visible;
      
      // Performance indicator
      const perfStatus = document.getElementById('performanceStatus');
      if (visible > 200) {
        perfStatus.textContent = 'Slow';
        perfStatus.style.color = '#fbbf24';
      } else {
        perfStatus.textContent = 'Good';
        perfStatus.style.color = '#34d399';
      }
    }
    
    // Controls
    document.querySelectorAll('input[name="displayMode"]').forEach(radio => {
      radio.addEventListener('change', function() {
        currentMode = this.value;
        applyFilters();
      });
    });
    
    document.getElementById('typeFilter').addEventListener('change', function() {
      currentFilter = this.value;
      applyFilters();
    });
    
    document.getElementById('search').addEventListener('input', function() {
      searchQuery = this.value;
      applyFilters();
    });
    
    
    document.getElementById('resetLayout').addEventListener('click', function() {
      // 恢复到初始的preset布局
      cy.nodes().forEach(node => {
        const id = node.id();
        const pos = nodePositions[id];
        if (pos) {
          node.position(pos);
        }
      });
      
      // 平滑动画过渡
      cy.animate({
        fit: {
          eles: cy.nodes(),
          padding: 50
        },
        duration: 500,
        easing: 'ease-out'
      });
    });
    
    // i18n translations
    const translations = {
      en: {
        controls: 'Controls',
        search: 'Search Nodes',
        filter: 'Filter by Zone',
        allZones: 'All Zones',
        displayMode: 'Display Mode',
        preview: 'Preview (30)',
        standard: 'Standard (100)',
        full: 'Full (All)',
        legend: 'Legend',
        conversation: 'Conversation',
        solution: 'Solution',
        code: 'Code',
        documentation: 'Documentation',
        error: 'Error',
        configuration: 'Configuration',
        displaying: 'Displaying:',
        edges: 'Edges:',
        visible: 'Visible:',
        performance: 'Performance:',
        resetLayout: '🔄 Reset Layout'
      },
      zh: {
        controls: '控制面板',
        search: '搜索节点',
        filter: '按区域筛选',
        allZones: '所有区域',
        displayMode: '显示模式',
        preview: '预览 (30)',
        standard: '标准 (100)',
        full: '完整 (全部)',
        legend: '图例',
        conversation: '对话',
        solution: '解决方案',
        code: '代码',
        documentation: '文档',
        error: '错误',
        configuration: '配置',
        displaying: '显示:',
        edges: '连线:',
        visible: '可见:',
        performance: '性能:',
        resetLayout: '🔄 重置布局'
      }
    };
    
    function updateLanguage() {
      const t = translations[currentLang];
      document.getElementById('controlsTitle').textContent = t.controls;
      document.getElementById('searchLabel').textContent = t.search;
      document.getElementById('search').setAttribute('placeholder', currentLang === 'zh' ? '搜索...' : 'Search...');
      document.getElementById('filterLabel').textContent = t.filter;
      document.getElementById('optionAll').textContent = t.allZones;
      document.getElementById('displayModeLabel').textContent = t.displayMode;
      document.getElementById('modePreviewText').textContent = t.preview;
      document.getElementById('modeStandardText').textContent = t.standard;
      document.getElementById('modeFullText').textContent = t.full;
      document.getElementById('legendTitle').textContent = t.legend;
      document.getElementById('legendConversation').textContent = t.conversation;
      document.getElementById('legendSolution').textContent = t.solution;
      document.getElementById('legendCode').textContent = t.code;
      document.getElementById('legendDocumentation').textContent = t.documentation;
      document.getElementById('legendError').textContent = t.error;
      document.getElementById('legendConfiguration').textContent = t.configuration;
      document.getElementById('displayingText').innerHTML = \`<strong>\${t.displaying}</strong> <span id="nodeCount">0</span>/<span id="totalNodes">0</span>\`;
      document.getElementById('visibleText').innerHTML = \`<strong>\${t.visible}</strong> <span id="visibleCount">0</span>\`;
      document.getElementById('performanceText').innerHTML = \`<strong>\${t.performance}</strong> <span id="performanceStatus" style="color: #34d399;">Good</span>\`;
      document.getElementById('resetLayout').textContent = t.resetLayout;
      
      updateStats();
    }
    
    document.getElementById('langToggle').addEventListener('click', function() {
      currentLang = currentLang === 'en' ? 'zh' : 'en';
      this.textContent = currentLang === 'en' ? '🌐 中文' : '🌐 English';
      updateLanguage();
      updateZoneLabels(); // Update zone labels when language changes
    });
    
    // 控制面板切换功能
    const controlsPanel = document.getElementById('controlsPanel');
    const toggleBtn = document.getElementById('toggleControls');
    let controlsVisible = true;
    
    toggleBtn.addEventListener('click', function() {
      controlsVisible = !controlsVisible;
      if (controlsVisible) {
        controlsPanel.classList.remove('collapsed');
        toggleBtn.classList.remove('collapsed');
        toggleBtn.innerHTML = '&lt;'; // < hide
      } else {
        controlsPanel.classList.add('collapsed');
        toggleBtn.classList.add('collapsed');
        toggleBtn.innerHTML = '&gt;'; // > show
      }
    });
    
    // Initial setup
    applyFilters();
    // 默认视图：简单 fit 即可
    setTimeout(() => {
      cy.fit(null, 60);
    }, 100);
  </script>`;
  }

  private resolveOutputPath(projectPath: string, outputPath?: string): string {
    if (outputPath) {
      // 如果是相对路径，重定向到 memory/ 文件夹并使用默认文件名
      if (!isAbsolute(outputPath)) {
        return join(projectPath, "memory", "knowledge-graph.html");
      }
      return outputPath;
    }
    return join(projectPath, "memory", "knowledge-graph.html");
  }

  private writeFile(content: string, filePath: string): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, content, "utf-8");
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  private escapeJsonForScript(json: string): string {
    // JSON.stringify already handles most escaping correctly.
    // We only need to prevent breaking HTML context.
    return json
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  }
}
