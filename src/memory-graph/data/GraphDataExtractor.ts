/**
 * GraphDataExtractor
 *
 * Extracts and processes graph data from the database.
 */

import { DatabaseManager } from "../../database.js";
import {
  Context,
  Relationship,
  GraphData,
  ExtractOptions,
  ProjectNotFoundError,
  NoContextsError,
} from "../types.js";
import { NodeBuilder } from "./NodeBuilder.js";
import { EdgeBuilder } from "./EdgeBuilder.js";

export class GraphDataExtractor {
  private nodeBuilder: NodeBuilder;
  private edgeBuilder: EdgeBuilder;

  constructor(private db: DatabaseManager) {
    this.nodeBuilder = new NodeBuilder();
    this.edgeBuilder = new EdgeBuilder();
  }

  /**
   * Extract graph data for a project
   *
   * @param projectId - The project ID
   * @param options - Extraction options
   * @returns Complete graph data
   * @throws {ProjectNotFoundError} If project is not found
   * @throws {NoContextsError} If no contexts are found
   */
  extract(projectId: string, options: ExtractOptions = {}): GraphData {
    // Get project
    const project = this.db.getProject(projectId);
    if (!project) {
      throw new ProjectNotFoundError(projectId);
    }

    // Get contexts
    const contexts = this.getContexts(projectId, options);
    if (contexts.length === 0) {
      throw new NoContextsError(projectId);
    }

    // Build nodes
    const nodes = contexts.map((context) => this.nodeBuilder.build(context));

    // Get relationships
    const contextIds = new Set(contexts.map((c) => c.id));
    const relationships = this.getRelationships(contexts);

    // Build edges
    const edges = this.edgeBuilder.buildMany(relationships, contextIds);

    // Build metadata
    const metadata = this.buildMetadata(project.name, project.path, contexts, edges.length);

    return {
      nodes,
      edges,
      metadata,
    };
  }

  /**
   * Get and filter contexts for a project
   *
   * @param projectId - The project ID
   * @param options - Filter options
   * @returns Filtered contexts
   */
  private getContexts(projectId: string, options: ExtractOptions): Context[] {
    // Get all contexts for the project
    let contexts = this.db.getContextsByProject(projectId);

    // Filter by type
    if (options.focus_type && options.focus_type !== "all") {
      contexts = contexts.filter((c) => c.type === options.focus_type);
    }

    // Filter by quality
    if (options.min_quality !== undefined && options.min_quality > 0) {
      contexts = contexts.filter(
        (c) => c.quality_score >= options.min_quality!
      );
    }

    // Sort by time (newest first) - ensures recent contexts are shown first
    contexts.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // Limit number of nodes
    const maxNodes = options.max_nodes || 0;
    if (maxNodes > 0 && contexts.length > maxNodes) {
      contexts = contexts.slice(0, maxNodes);
    }

    return contexts;
  }

  /**
   * Get relationships for contexts
   *
   * @param contexts - Array of contexts
   * @returns Array of relationships
   */
  private getRelationships(contexts: Context[]): Relationship[] {
    const relationships: Relationship[] = [];
    const contextIds = new Set(contexts.map((c) => c.id));

    // Get relationships for each context
    contexts.forEach((context) => {
      const related = this.db.getRelatedContexts(context.id);

      related.forEach((rel: any) => {
        // Only include relationships where both contexts are in our set
        if (
          contextIds.has(rel.from_context_id) &&
          contextIds.has(rel.to_context_id)
        ) {
          relationships.push({
            id: rel.id,
            from_context_id: rel.from_context_id,
            to_context_id: rel.to_context_id,
            type: rel.type,
            strength: rel.strength,
            created_at: rel.created_at,
          });
        }
      });
    });

    // Remove duplicates (same relationship might be found from both ends)
    const uniqueRelationships = new Map<string, Relationship>();
    relationships.forEach((rel) => {
      const key = `${rel.from_context_id}-${rel.to_context_id}-${rel.type}`;
      if (!uniqueRelationships.has(key)) {
        uniqueRelationships.set(key, rel);
      }
    });

    return Array.from(uniqueRelationships.values());
  }

  /**
   * Build graph metadata
   *
   * @param projectName - Project name
   * @param projectPath - Project file path
   * @param contexts - Array of contexts
   * @param edgeCount - Number of edges
   * @returns Graph metadata
   */
  private buildMetadata(
    projectName: string,
    projectPath: string,
    contexts: Context[],
    edgeCount: number
  ) {
    return {
      project_name: projectName,
      project_path: projectPath,
      total_contexts: contexts.length,
      total_relationships: edgeCount,
      generated_at: new Date().toISOString(),
    };
  }
}
