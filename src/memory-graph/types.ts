/**
 * Memory Graph Types
 *
 * Type definitions for the memory graph generator module.
 */

import { Context, Relationship } from "../types.js";

/**
 * Graph node representing a context in the memory graph
 */
export interface GraphNode {
  /** Unique identifier */
  id: string;
  /** Display label with icon, quality, file info, and time */
  label: string;
  /** Full content of the context */
  content: string;
  /** Context type (code, documentation, bug_fix, etc.) */
  type: string;
  /** Importance score (0-1) based on quality */
  importance: number;
  /** Quality score (0-1, same as importance, for Cytoscape compatibility) */
  quality_score?: number;
  /** Associated tags */
  tags: string[];
  /** Creation timestamp */
  created_at: string;
  /** Optional file path */
  file_path?: string;
}

/**
 * Graph edge representing a relationship between contexts
 */
export interface GraphEdge {
  /** Edge unique identifier */
  id: string;
  /** Source context ID */
  source: string;
  /** Target context ID */
  target: string;
  /** Optional edge label */
  label?: string;
  /** Relationship type */
  relation?: string;
  /** Relationship strength (0-1) */
  strength?: number;
}

/**
 * Metadata about the generated graph
 */
export interface GraphMetadata {
  /** Project name */
  project_name: string;
  /** Project file path */
  project_path: string;
  /** Total number of contexts in the graph */
  total_contexts: number;
  /** Total number of relationships in the graph */
  total_relationships: number;
  /** Generation timestamp */
  generated_at: string;
}

/**
 * Complete graph data structure
 */
export interface GraphData {
  /** All nodes in the graph */
  nodes: GraphNode[];
  /** All edges in the graph */
  edges: GraphEdge[];
  /** Graph metadata */
  metadata: GraphMetadata;
}

/**
 * Options for extracting graph data from database
 */
export interface ExtractOptions {
  /** Maximum number of nodes to include (0 = unlimited) */
  max_nodes?: number;
  /** Filter by context type ('all' or specific type) */
  focus_type?: string;
  /** Minimum quality score threshold (0-1) */
  min_quality?: number;
}

/**
 * Options for generating the complete graph
 */
export interface GenerateOptions extends ExtractOptions {
  /** Output file path (optional, defaults to memory/memory-graph.html) */
  output_path?: string;
}

/**
 * Result of graph generation
 */
export interface GenerateResult {
  /** Generated HTML content */
  content: string;
  /** Path to the generated file */
  file_path: string;
}

/**
 * Base error class for graph generation errors
 */
export class GraphGenerationError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = "GraphGenerationError";

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GraphGenerationError);
    }
  }
}

/**
 * Error thrown when a project is not found
 */
export class ProjectNotFoundError extends GraphGenerationError {
  constructor(projectId: string) {
    super(`Project not found: ${projectId}`);
    this.name = "ProjectNotFoundError";
  }
}

/**
 * Error thrown when no contexts are found for a project
 */
export class NoContextsError extends GraphGenerationError {
  constructor(projectId: string) {
    super(`No contexts found for project: ${projectId}`);
    this.name = "NoContextsError";
  }
}

/**
 * Error thrown when template operations fail
 */
export class TemplateError extends GraphGenerationError {
  constructor(message: string, cause?: Error) {
    super(`Template error: ${message}`, cause);
    this.name = "TemplateError";
  }
}

/**
 * Error thrown when file operations fail
 */
export class FileOperationError extends GraphGenerationError {
  constructor(message: string, cause?: Error) {
    super(`File operation error: ${message}`, cause);
    this.name = "FileOperationError";
  }
}

/**
 * Re-export Context and Relationship types for convenience
 */
export type { Context, Relationship };
