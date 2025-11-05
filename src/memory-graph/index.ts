/**
 * 记忆图谱生成器
 *
 * 生成项目记忆的可视化图谱，主入口模块
 * 协调数据提取、处理和HTML生成
 *
 * Memory Graph Generator
 * Main entry point for generating memory graph visualizations.
 * Coordinates data extraction, processing, and HTML generation.
 */

import { DatabaseManager } from "../database.js";
import { GraphDataExtractor } from "./data/GraphDataExtractor.js";
import { HTMLGeneratorCytoscape } from "./templates/HTMLGeneratorCytoscape.js";
import {
  GenerateOptions,
  GenerateResult,
  GraphGenerationError,
} from "./types.js";

/**
 * 记忆图谱生成器类
 *
 * 生成交互式HTML可视化的项目记忆图谱
 *
 * Memory Graph Generator
 * Generates interactive HTML visualizations of project memory graphs.
 *
 * @example
 * ```typescript
 * const db = new DatabaseManager();
 * const generator = new MemoryGraphGenerator(db);
 *
 * const result = await generator.generateGraph('project-id', {
 *   max_nodes: 100,
 *   focus_type: 'code',
 *   output_path: './output/graph.html'
 * });
 *
 * console.log(`Graph generated: ${result.file_path}`);
 * ```
 */
export class MemoryGraphGenerator {
  private extractor: GraphDataExtractor;
  private htmlGenerator: HTMLGeneratorCytoscape;

  /**
   * 创建记忆图谱生成器实例
   * Create a new MemoryGraphGenerator
   *
   * @param db - 数据库管理器实例 / Database manager instance
   */
  constructor(private db: DatabaseManager) {
    this.extractor = new GraphDataExtractor(db);
    this.htmlGenerator = new HTMLGeneratorCytoscape();
  }

  /**
   * 生成记忆图谱可视化
   * Generate a memory graph visualization
   *
   * @param projectId - 项目ID / The project ID to generate graph for
   * @param options - 生成选项 / Generation options
   * @returns 生成结果（包含内容和文件路径）/ Generation result with content and file path
   * @throws {ProjectNotFoundError} 项目未找到 / If project is not found
   * @throws {NoContextsError} 没有找到上下文 / If no contexts are found
   * @throws {GraphGenerationError} 生成失败 / If generation fails
   *
   * @example
   * ```typescript
   * // 使用默认选项生成图谱
   * const result = await generator.generateGraph('project-id');
   *
   * // 使用自定义选项生成图谱
   * const result = await generator.generateGraph('project-id', {
   *   max_nodes: 50,
   *   focus_type: 'bug_fix',
   *   min_quality: 0.7,
   *   output_path: './custom/path.html'
   * });
   * ```
   */
  async generateGraph(
    projectId: string,
    options: GenerateOptions = {}
  ): Promise<GenerateResult> {
    const startTime = Date.now();

    try {
      console.error(`[MemoryGraph] Generating graph for project: ${projectId}`);

      // Extract graph data from database
      console.error(`[MemoryGraph] Extracting data...`);
      const graphData = this.extractor.extract(projectId, options);
      console.error(
        `[MemoryGraph] Extracted ${graphData.nodes.length} nodes, ${graphData.edges.length} edges`
      );

      // Generate HTML visualization
      console.error(`[MemoryGraph] Generating HTML...`);
      const result = this.htmlGenerator.generate(
        graphData,
        options.output_path
      );

      const duration = Date.now() - startTime;
      console.error(
        `[MemoryGraph] Graph generated successfully in ${duration}ms`
      );
      console.error(`[MemoryGraph] Output: ${result.file_path}`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(
        `[MemoryGraph] Generation failed after ${duration}ms:`,
        error
      );

      if (error instanceof GraphGenerationError) {
        throw error;
      }

      throw new GraphGenerationError(
        `Failed to generate graph: ${
          error instanceof Error ? error.message : String(error)
        }`,
        error instanceof Error ? error : undefined
      );
    }
  }
}

// Re-export types for convenience
export * from "./types.js";
