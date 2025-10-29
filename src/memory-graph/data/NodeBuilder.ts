/**
 * NodeBuilder
 *
 * Builds graph nodes from context data with enhanced labels and metadata.
 */

import { Context, GraphNode } from "../types.js";

export class NodeBuilder {
  /**
   * Build a graph node from a context
   *
   * @param context - The context to convert to a node
   * @returns A graph node with enhanced label and metadata
   */
  build(context: Context): GraphNode {
    return {
      id: context.id,
      label: this.buildLabel(context),
      content: context.content,
      type: context.type,
      importance: context.quality_score,
      tags: this.parseTags(context.tags),
      created_at: context.created_at,
      file_path: context.file_path,
    };
  }

  /**
   * Build an enhanced label for the node
   * Format: [Icon] [Quality%] [FileInfo] [TimeLabel]
   *
   * @param context - The context to build label for
   * @returns Enhanced label string
   */
  private buildLabel(context: Context): string {
    const icon = this.getTypeIcon(context.type);
    const quality = Math.round(context.quality_score * 100);
    const fileInfo = this.getFileInfo(context);
    const timeLabel = this.getTimeLabel(context.created_at);

    return `${icon} ${quality}% ${fileInfo} ${timeLabel}`;
  }

  /**
   * Get icon for context type
   *
   * @param type - Context type
   * @returns Emoji icon representing the type
   */
  private getTypeIcon(type: string): string {
    const iconMap: Record<string, string> = {
      code: "💻",
      code_create: "💻",
      code_modify: "💻",
      code_delete: "💻",
      code_refactor: "💻",
      code_optimize: "💻",
      documentation: "📚",
      bug_fix: "🐛",
      bug_report: "🐛",
      feature: "✨",
      feature_add: "✨",
      feature_update: "✨",
      feature_remove: "✨",
      conversation: "💬",
      error: "❌",
      solution: "✅",
      test: "🧪",
      testing: "🧪",
      configuration: "⚙️",
      commit: "📝",
    };

    return iconMap[type] || "📄";
  }

  /**
   * Get file information or content preview
   *
   * @param context - The context
   * @returns File path or content preview
   */
  private getFileInfo(context: Context): string {
    if (context.file_path) {
      return `📄 ${this.truncatePath(context.file_path)}`;
    }

    // For contexts without file path, show content preview
    const preview = context.content.replace(/\n/g, " ").trim().substring(0, 30);

    return `💭 ${preview}${context.content.length > 30 ? "..." : ""}`;
  }

  /**
   * Truncate file path for display
   *
   * @param path - Full file path
   * @returns Truncated path
   */
  private truncatePath(path: string): string {
    const parts = path.split(/[/\\]/);

    if (parts.length <= 2) {
      return path;
    }

    // Show last 2 parts: folder/file.ext
    return `.../${parts.slice(-2).join("/")}`;
  }

  /**
   * Get relative time label
   *
   * @param dateString - ISO date string
   * @returns Relative time label (e.g., "今天", "2天前")
   */
  private getTimeLabel(dateString: string): string {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "今天";
    } else if (diffDays === 1) {
      return "昨天";
    } else if (diffDays < 7) {
      return `${diffDays}天前`;
    } else if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7);
      return `${weeks}周前`;
    } else if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      return `${months}个月前`;
    } else {
      const years = Math.floor(diffDays / 365);
      return `${years}年前`;
    }
  }

  /**
   * Parse tags from comma-separated string
   *
   * @param tagsString - Comma-separated tags string
   * @returns Array of tags
   */
  private parseTags(tagsString: string | null | undefined): string[] {
    if (!tagsString) {
      return [];
    }

    return tagsString
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }
}
