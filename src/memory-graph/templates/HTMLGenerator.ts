/**
 * HTMLGenerator
 *
 * Generates HTML visualization from graph data.
 *
 * Note: This is a transitional implementation that reuses the existing
 * HTML generation logic. Future versions will use separate template files.
 */

import { GraphData, GenerateResult, FileOperationError } from "../types.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";

export class HTMLGenerator {
  /**
   * Generate HTML file from graph data
   *
   * @param data - Complete graph data
   * @param outputPath - Optional output path
   * @returns Generation result with content and file path
   * @throws {FileOperationError} If file operations fail
   */
  generate(data: GraphData, outputPath?: string): GenerateResult {
    try {
      // Generate HTML content
      const html = this.renderTemplate(data);

      // Determine output path
      const filePath = this.resolveOutputPath(
        data.metadata.project_name,
        outputPath
      );

      // Write file
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

  /**
   * Render HTML template with data
   *
   * @param data - Graph data
   * @returns Complete HTML string
   */
  private renderTemplate(data: GraphData): string {
    // For now, we inline the template
    // TODO: Extract to separate template files in future versions

    const nodesJson = JSON.stringify(data.nodes);
    const edgesJson = JSON.stringify(data.edges);
    const metadataJson = JSON.stringify(data.metadata);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(data.metadata.project_name)} - Memory Graph</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  ${this.getStyles()}
</head>
<body>
  ${this.getControls()}
  <svg id="graph"></svg>
  ${this.getStats()}
  ${this.getLegend()}
  ${this.getScript(nodesJson, edgesJson, metadataJson)}
</body>
</html>`;
  }

  /**
   * Get inline styles
   */
  private getStyles(): string {
    return `<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0a0e27;
      color: #e2e8f0;
      overflow: hidden;
      position: relative;
    }
    body::before {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: 
        radial-gradient(circle at 20% 30%, rgba(96, 165, 250, 0.15) 0%, transparent 50%),
        radial-gradient(circle at 80% 70%, rgba(168, 85, 247, 0.15) 0%, transparent 50%),
        radial-gradient(circle at 50% 50%, rgba(34, 211, 238, 0.1) 0%, transparent 50%);
      pointer-events: none;
      z-index: 0;
    }
    body::after {
      content: '';
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-image: 
        linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
      background-size: 50px 50px;
      pointer-events: none;
      z-index: 0;
    }
    #graph { 
      width: 100vw; 
      height: 100vh;
      position: relative;
      z-index: 1;
    }
    .controls {
      position: absolute;
      top: 20px;
      left: 20px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(16px);
      padding: 20px;
      border-radius: 16px;
      border: 1px solid rgba(96, 165, 250, 0.2);
      box-shadow: 
        0 8px 32px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      z-index: 1000;
      min-width: 260px;
    }
    .controls h2 {
      margin-bottom: 15px;
      font-size: 18px;
      color: #60a5fa;
    }
    .controls input, .controls select {
      width: 100%;
      padding: 8px 12px;
      background: rgba(30, 41, 59, 0.9);
      border: 1px solid #334155;
      border-radius: 6px;
      color: #e2e8f0;
      font-size: 14px;
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
    .stats {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(16px);
      padding: 15px 20px;
      border-radius: 12px;
      border: 1px solid rgba(96, 165, 250, 0.2);
      box-shadow: 
        0 4px 16px rgba(0, 0, 0, 0.3),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      font-size: 12px;
      z-index: 1000;
    }
    .legend {
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(16px);
      padding: 15px;
      border-radius: 12px;
      border: 1px solid rgba(96, 165, 250, 0.2);
      box-shadow: 
        0 4px 16px rgba(0, 0, 0, 0.3),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset;
      font-size: 12px;
      z-index: 1000;
    }
    .node { 
      cursor: pointer; 
      transition: opacity 0.2s ease, filter 0.2s ease;
      will-change: opacity, filter;
    }
    .node:hover { 
      opacity: 0.8; 
      filter: brightness(1.2) drop-shadow(0 0 8px currentColor);
    }
    .node.filtered-out { opacity: 0.1 !important; }
    .link { stroke: #475569; stroke-opacity: 0.6; }
    .link.filtered-out { opacity: 0.1 !important; }
    .node-label {
      fill: #e2e8f0;
      font-size: 11px;
      pointer-events: none;
      text-anchor: middle;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
    }
    .btn {
      padding: 10px 18px;
      background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
      border: none;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 2px 8px rgba(96, 165, 250, 0.3);
    }
    .btn:hover {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(96, 165, 250, 0.4);
    }
    .btn:active {
      transform: translateY(0);
      box-shadow: 0 2px 4px rgba(96, 165, 250, 0.3);
    }
    .custom-tooltip {
      position: absolute;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 8px;
      padding: 12px 16px;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 2000;
      max-width: 600px;
      max-height: 500px;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }
    .custom-tooltip.visible {
      opacity: 1;
    }
    .custom-tooltip.pinned {
      border: 2px solid #60a5fa;
      box-shadow: 0 12px 48px rgba(96, 165, 250, 0.3);
    }
    .tooltip-title {
      font-weight: 600;
      color: #60a5fa;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .tooltip-content {
      color: #cbd5e1;
      font-size: 12px;
      line-height: 1.6;
      margin-bottom: 8px;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    }
    .tooltip-meta {
      font-size: 11px;
      color: #94a3b8;
      border-top: 1px solid rgba(148, 163, 184, 0.2);
      padding-top: 8px;
      margin-top: 8px;
    }
    .tooltip-hint {
      font-size: 10px;
      color: #94a3b8;
      text-anchor: center;
      padding: 6px 0 0 0;
      border-top: 1px solid rgba(148, 163, 184, 0.1);
      margin-top: 6px;
    }
  </style>`;
  }

  /**
   * Get controls HTML
   */
  private getControls(): string {
    return `<div class="controls">
    <h2 id="controlsTitle">🔍 Controls</h2>
    <div class="control-group">
      <label class="control-label" id="searchLabel">Search Nodes</label>
      <input type="text" id="search" placeholder="Search...">
    </div>
    <div class="control-group">
      <label class="control-label" id="filterLabel">Filter by Type</label>
      <select id="typeFilter">
        <option value="all" id="optionAll">All Types</option>
        <option value="code">Code</option>
        <option value="documentation">Documentation</option>
        <option value="bug_fix">Bug Fix</option>
        <option value="feature">Feature</option>
        <option value="conversation">Conversation</option>
      </select>
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

  /**
   * Get stats HTML
   */
  private getStats(): string {
    return `<div class="stats">
    <div><strong>Nodes:</strong> <span id="nodeCount">0</span></div>
    <div><strong>Edges:</strong> <span id="edgeCount">0</span></div>
    <div><strong>Visible:</strong> <span id="visibleCount">0</span></div>
  </div>`;
  }

  /**
   * Get legend HTML
   */
  private getLegend(): string {
    return `<div class="legend">
    <div><strong>Legend</strong></div>
    <div style="margin-top: 8px;">
      <div>💻 Code</div>
      <div>📚 Documentation</div>
      <div>🐛 Bug Fix</div>
      <div>✨ Feature</div>
      <div>💬 Conversation</div>
    </div>
  </div>`;
  }

  /**
   * Get script with data
   */
  private getScript(
    nodesJson: string,
    edgesJson: string,
    metadataJson: string
  ): string {
    // Escape JSON for safe embedding in HTML script tag
    const safeNodesJson = this.escapeJsonForScript(nodesJson);
    const safeEdgesJson = this.escapeJsonForScript(edgesJson);
    const safeMetadataJson = this.escapeJsonForScript(metadataJson);

    return `<script>
    const graphData = {
      nodes: ${safeNodesJson},
      edges: ${safeEdgesJson},
      metadata: ${safeMetadataJson}
    };
    
    // Initialize D3 visualization with zoom and pan
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    const svg = d3.select('#graph')
      .attr('width', width)
      .attr('height', height);
    
    const g = svg.append('g');
    
    // Add zoom behavior with performance optimization
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .filter(event => {
        // Allow all mouse events for panning and zooming
        // Only prevent double-click zoom
        if (event.type === 'dblclick') return false;
        return true;
      })
      .on('zoom', (event) => {
        // Use transform for better performance
        g.attr('transform', event.transform);
      });
    
    svg.call(zoom);
    
    // Optimize rendering performance
    svg.style('will-change', 'transform');
    
    // Click background to unpin tooltip
    svg.on('click', () => {
      if (tooltipPinned) {
        tooltipPinned = false;
        tooltip.classed('pinned', false);
        tooltip.classed('visible', false);
      }
    });
    
    // Type to color mapping
    const typeColors = {
      conversation: '#fbbf24',
      documentation: '#a78bfa',
      solution: '#4ade80',
      code: '#60a5fa',
      test: '#60a5fa',
      error: '#f87171',
      bug_fix: '#f87171',
      configuration: '#f472b6',
      commit: '#f472b6',
      code_create: '#60a5fa',
      code_modify: '#60a5fa',
      code_delete: '#60a5fa',
      code_refactor: '#60a5fa',
      code_optimize: '#60a5fa',
      bug_report: '#f87171',
      feature: '#34d399',
      feature_add: '#34d399',
      feature_update: '#34d399',
      feature_remove: '#34d399'
    };
    
    // Type to zone mapping for layout
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
    
    // Group nodes by zone and sort by time within each zone
    const nodesByZone = {};
    graphData.nodes.forEach(node => {
      const zone = typeToZone[node.type] || 'default';
      if (!nodesByZone[zone]) {
        nodesByZone[zone] = [];
      }
      nodesByZone[zone].push(node);
    });
    
    // Sort nodes within each zone by time (newest first)
    Object.keys(nodesByZone).forEach(zone => {
      nodesByZone[zone].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });
    
    // Define zone positions with wider spacing
    const margin = 80;
    const labelSpace = 35; // Space for zone labels
    const topY = margin + labelSpace + 30; // Extra space between label and first node
    const bottomY = height - margin;
    const zoneWidth = 350; // Fixed width per zone for better spacing
    const startX = 200; // Start position
    
    // Zone labels with i18n support
    const zoneLabels = {
      conversation: { en: '💬 Conversation', zh: '💬 对话' },
      solution: { en: '✨ Solution', zh: '✨ 解决方案' },
      code: { en: '💻 Code', zh: '💻 代码' },
      documentation: { en: '📚 Documentation', zh: '📚 文档' },
      error: { en: '🐛 Error', zh: '🐛 错误' },
      configuration: { en: '⚙️ Configuration', zh: '⚙️ 配置' }
    };
    
    const zonePositions = {
      conversation: { x: startX + zoneWidth * 0 },
      solution: { x: startX + zoneWidth * 1 },
      code: { x: startX + zoneWidth * 2 },
      documentation: { x: startX + zoneWidth * 3 },
      error: { x: startX + zoneWidth * 4 },
      configuration: { x: startX + zoneWidth * 5 }
    };
    
    // Calculate required height based on max nodes in any zone
    const maxNodesInZone = Math.max(...Object.values(nodesByZone).map(nodes => nodes.length));
    const nodeSpacing = 80; // Fixed spacing between nodes
    const requiredHeight = topY + (maxNodesInZone * nodeSpacing) + margin;
    
    // Assign fixed positions to nodes within each zone (no force simulation)
    Object.keys(nodesByZone).forEach(zone => {
      const nodes = nodesByZone[zone];
      const zoneX = zonePositions[zone]?.x || width / 2;
      
      nodes.forEach((node, index) => {
        node.x = zoneX;
        node.y = topY + (index * nodeSpacing);
        node.zone = zone;
        node.timeIndex = index;
        node.fx = zoneX; // Fix X position
        node.fy = topY + (index * nodeSpacing); // Fix Y position
      });
    });
    
    // Time formatting function
    function formatTimeLabel(date) {
      const now = new Date();
      const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return '今天';
      if (diffDays === 1) return '昨天';
      if (diffDays < 7) return diffDays + '天前';
      if (diffDays < 30) return Math.floor(diffDays / 7) + '周前';
      if (diffDays < 365) return Math.floor(diffDays / 30) + '个月前';
      return Math.floor(diffDays / 365) + '年前';
    }
    
    // Language state (default: English)
    let currentLang = 'en';
    
    // UI text translations
    const i18n = {
      en: {
        controls: 'Controls',
        searchLabel: 'Search Nodes',
        searchPlaceholder: 'Search...',
        filterLabel: 'Filter by Type',
        allTypes: 'All Types',
        resetLayout: 'Reset Layout',
        langToggle: '中文',
        tooltipHint: 'Click node to pin this window',
        nodes: 'Nodes',
        edges: 'Edges',
        visible: 'Visible'
      },
      zh: {
        controls: '控制面板',
        searchLabel: '搜索节点',
        searchPlaceholder: '搜索...',
        filterLabel: '按类型筛选',
        allTypes: '所有类型',
        resetLayout: '重置布局',
        langToggle: 'English',
        tooltipHint: '点击节点固定此窗口',
        nodes: '节点',
        edges: '边',
        visible: '可见'
      }
    };
    
    // Draw zone backgrounds and timelines
    const zoneGroup = g.append('g').attr('class', 'zones');
    const timeAxisGroup = g.append('g').attr('class', 'time-axis');
    
    // Store zone label elements for language switching
    const zoneLabelElements = {};
    
    Object.keys(zonePositions).forEach(zone => {
      const pos = zonePositions[zone];
      const nodes = nodesByZone[zone] || [];
      
      if (nodes.length === 0) return;
      
      // Draw zone background
      const bgWidth = 280;
      zoneGroup.append('rect')
        .attr('x', pos.x - bgWidth / 2)
        .attr('y', topY)
        .attr('width', bgWidth)
        .attr('height', bottomY - topY)
        .attr('fill', '#1e293b')
        .attr('opacity', 0.05)
        .attr('stroke', '#475569')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '5,5')
        .attr('stroke-opacity', 0.3);
      
      // Draw zone label (default English)
      zoneLabelElements[zone] = zoneGroup.append('text')
        .attr('x', pos.x)
        .attr('y', margin + labelSpace)
        .attr('text-anchor', 'middle')
        .attr('fill', '#60a5fa')
        .attr('font-size', '14px')
        .attr('font-weight', '600')
        .style('pointer-events', 'none')
        .text(zoneLabels[zone].en + ' (' + nodes.length + ')');
      
      // Draw vertical timeline for this zone
      timeAxisGroup.append('line')
        .attr('x1', pos.x)
        .attr('y1', topY)
        .attr('x2', pos.x)
        .attr('y2', bottomY)
        .attr('stroke', '#64748b')
        .attr('stroke-width', 2)
        .attr('opacity', 0.4);
      
      // Add time markers for this zone
      const timeStep = Math.max(60, (bottomY - topY) / Math.min(nodes.length, 8));
      for (let i = 0; i < nodes.length && i < 8; i++) {
        const node = nodes[i];
        const y = node.y;
        
        // Time tick
        timeAxisGroup.append('line')
          .attr('x1', pos.x - 8)
          .attr('y1', y)
          .attr('x2', pos.x + 8)
          .attr('y2', y)
          .attr('stroke', '#64748b')
          .attr('stroke-width', 1.5)
          .attr('opacity', 0.5);
        
        // Time label (only show for first few)
        if (i % 2 === 0) {
          timeAxisGroup.append('text')
            .attr('x', pos.x + 15)
            .attr('y', y + 4)
            .attr('text-anchor', 'start')
            .attr('fill', '#94a3b8')
            .attr('font-size', '10px')
            .style('pointer-events', 'none')
            .text(formatTimeLabel(new Date(node.created_at)));
        }
      }
    });
    
    // No force simulation - use fixed positions for clarity
    // Nodes are already positioned in their zones with fixed spacing
    
    // Tooltip setup
    const tooltip = d3.select('#customTooltip');
    let tooltipPinned = false;
    let tooltipTimeout;
    
    function showTooltip(d, event) {
      clearTimeout(tooltipTimeout);
      const contentPreview = d.content.length > 1000 ? d.content.substring(0, 1000) + '\\n\\n...(truncated)' : d.content;
      
      tooltip.select('#tooltipTitle').text(d.label);
      tooltip.select('#tooltipContent').text(contentPreview);
      
      let metaHTML = '<div><strong>Type:</strong> ' + d.type + '</div>';
      metaHTML += '<div><strong>Importance:</strong> ' + (d.importance * 100).toFixed(0) + '%</div>';
      metaHTML += '<div><strong>Created:</strong> ' + new Date(d.created_at).toLocaleString() + '</div>';
      if (d.file_path) {
        metaHTML += '<div><strong>File:</strong> ' + d.file_path + '</div>';
      }
      if (d.tags && d.tags.length > 0) {
        metaHTML += '<div><strong>Tags:</strong> ' + d.tags.join(', ') + '</div>';
      }
      
      tooltip.select('#tooltipMeta').html(metaHTML);
      tooltip.classed('visible', true);
      
      if (event) {
        const tooltipWidth = 600;
        const tooltipHeight = 500;
        let left = event.pageX + 15;
        let top = event.pageY + 15;
        
        if (left + tooltipWidth > window.innerWidth) {
          left = event.pageX - tooltipWidth - 15;
        }
        if (top + tooltipHeight > window.innerHeight) {
          top = event.pageY - tooltipHeight - 15;
        }
        
        tooltip
          .style('left', left + 'px')
          .style('top', top + 'px');
      }
    }
    
    // Draw nodes with fixed positions
    const node = g.append('g')
      .selectAll('circle')
      .data(graphData.nodes)
      .enter().append('circle')
      .attr('class', 'node')
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('r', d => 5 + d.importance * 10)
      .attr('fill', d => typeColors[d.type] || '#94a3b8')
      .on('mouseenter', function(event, d) {
        if (!tooltipPinned) {
          showTooltip(d, event);
        }
      })
      .on('mousemove', function(event) {
        if (!tooltipPinned) {
          const tooltipWidth = 600;
          const tooltipHeight = 500;
          let left = event.pageX + 15;
          let top = event.pageY + 15;
          
          if (left + tooltipWidth > window.innerWidth) {
            left = event.pageX - tooltipWidth - 15;
          }
          if (top + tooltipHeight > window.innerHeight) {
            top = event.pageY - tooltipHeight - 15;
          }
          
          tooltip
            .style('left', left + 'px')
            .style('top', top + 'px');
        }
      })
      .on('mouseleave', function() {
        if (!tooltipPinned) {
          tooltipTimeout = setTimeout(() => {
            tooltip.classed('visible', false);
          }, 300);
        }
      })
      .on('click', function(event, d) {
        event.stopPropagation();
        if (tooltipPinned) {
          tooltipPinned = false;
          tooltip.classed('pinned', false);
          tooltip.classed('visible', false);
        } else {
          tooltipPinned = true;
          tooltip.classed('pinned', true);
          showTooltip(d, event);
        }
      });
    
    // Draw labels with fixed positions
    const label = g.append('g')
      .selectAll('text')
      .data(graphData.nodes)
      .enter().append('text')
      .attr('class', 'node-label')
      .attr('x', d => d.x)
      .attr('y', d => d.y - 15)
      .text(d => d.label);
    
    // Search functionality
    d3.select('#search').on('input', function() {
      const searchTerm = this.value.toLowerCase();
      node.classed('filtered-out', d => 
        !d.label.toLowerCase().includes(searchTerm) &&
        !d.content.toLowerCase().includes(searchTerm)
      );
      label.classed('filtered-out', d => 
        !d.label.toLowerCase().includes(searchTerm) &&
        !d.content.toLowerCase().includes(searchTerm)
      );
      link.classed('filtered-out', d =>
        (!d.source.label.toLowerCase().includes(searchTerm) &&
         !d.source.content.toLowerCase().includes(searchTerm)) ||
        (!d.target.label.toLowerCase().includes(searchTerm) &&
         !d.target.content.toLowerCase().includes(searchTerm))
      );
      updateVisibleCount();
    });
    
    // Type filter
    d3.select('#typeFilter').on('change', function() {
      const selectedType = this.value;
      if (selectedType === 'all') {
        node.classed('filtered-out', false);
        label.classed('filtered-out', false);
        link.classed('filtered-out', false);
      } else {
        node.classed('filtered-out', d => d.type !== selectedType);
        label.classed('filtered-out', d => d.type !== selectedType);
        link.classed('filtered-out', d => 
          d.source.type !== selectedType || d.target.type !== selectedType
        );
      }
      updateVisibleCount();
    });
    
    // Language toggle
    d3.select('#langToggle').on('click', () => {
      currentLang = currentLang === 'en' ? 'zh' : 'en';
      const t = i18n[currentLang];
      
      // Update all UI text
      d3.select('#controlsTitle').text('🔍 ' + t.controls);
      d3.select('#searchLabel').text(t.searchLabel);
      d3.select('#search').attr('placeholder', t.searchPlaceholder);
      d3.select('#filterLabel').text(t.filterLabel);
      d3.select('#optionAll').text(t.allTypes);
      d3.select('#langToggle').text('🌐 ' + t.langToggle);
      d3.select('#resetLayout').text('🔄 ' + t.resetLayout);
      d3.select('#tooltipHint').text('💡 ' + t.tooltipHint);
      
      // Update zone labels
      Object.keys(zoneLabelElements).forEach(zone => {
        const nodes = nodesByZone[zone] || [];
        zoneLabelElements[zone].text(
          zoneLabels[zone][currentLang] + ' (' + nodes.length + ')'
        );
      });
    });
    
    // Reset layout (just reset zoom since positions are fixed)
    d3.select('#resetLayout').on('click', () => {
      svg.transition().duration(750).call(
        zoom.transform,
        d3.zoomIdentity
      );
    });
    
    // Update visible count
    function updateVisibleCount() {
      const visibleNodes = graphData.nodes.filter((d, i) => 
        !node.nodes()[i].classList.contains('filtered-out')
      );
      d3.select('#visibleCount').text(visibleNodes.length);
    }
    
    // Initialize stats
    d3.select('#nodeCount').text(graphData.nodes.length);
    d3.select('#edgeCount').text(graphData.edges.length);
    d3.select('#visibleCount').text(graphData.nodes.length);
  </script>`;
  }

  /**
   * Resolve output file path
   */
  private resolveOutputPath(projectName: string, outputPath?: string): string {
    if (outputPath) {
      // Validate path to prevent directory traversal
      const normalized = join(outputPath);
      if (normalized.includes("..")) {
        throw new Error("Invalid output path: directory traversal not allowed");
      }
      return normalized;
    }

    // Default: memory/memory-graph.html in current directory
    return join(process.cwd(), "memory", "memory-graph.html");
  }

  /**
   * Write HTML to file
   */
  private writeFile(html: string, filePath: string): void {
    // Ensure directory exists
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Write file
    writeFileSync(filePath, html, "utf-8");
  }

  /**
   * Escape HTML special characters
   */
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

  /**
   * Escape JSON string for safe embedding in HTML script tag
   *
   * JSON.stringify() already handles most escaping correctly.
   * We only need to escape characters that could break HTML context.
   */
  private escapeJsonForScript(json: string): string {
    return json
      .replace(/<\/script>/gi, "<\\/script>") // Prevent </script> tag injection
      .replace(/<!--/g, "<\\!--"); // Prevent HTML comment injection
  }
}
