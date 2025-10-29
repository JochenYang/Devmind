/**
 * EdgeBuilder
 *
 * Builds graph edges from relationship data with strength calculation.
 */

import { Relationship, GraphEdge } from "../types.js";

export class EdgeBuilder {
  /**
   * Build a graph edge from a relationship
   *
   * @param relationship - The relationship to convert to an edge
   * @param contextIds - Set of valid context IDs in the graph
   * @returns A graph edge, or null if the target context is not in the graph
   */
  build(relationship: Relationship, contextIds: Set<string>): GraphEdge | null {
    // Only include edges where both nodes are in the graph
    if (!contextIds.has(relationship.to_context_id)) {
      return null;
    }

    return {
      from: relationship.from_context_id,
      to: relationship.to_context_id,
      relation: relationship.type,
      strength: this.calculateStrength(relationship),
    };
  }

  /**
   * Calculate relationship strength
   *
   * Strength is based on:
   * - Relationship type (some types are stronger than others)
   * - Explicit strength value if available
   *
   * @param relationship - The relationship
   * @returns Strength value between 0 and 1
   */
  private calculateStrength(relationship: Relationship): number {
    // If relationship has explicit strength, use it
    if (relationship.strength !== undefined && relationship.strength !== null) {
      return Math.max(0, Math.min(1, relationship.strength));
    }

    // Otherwise, calculate based on type
    const strengthMap: Record<string, number> = {
      depends_on: 0.9, // Strong dependency
      implements: 0.8, // Implementation relationship
      fixes: 0.7, // Bug fix relationship
      tests: 0.6, // Testing relationship
      documents: 0.5, // Documentation relationship
      related_to: 0.4, // General relation
      references: 0.3, // Weak reference
    };

    return strengthMap[relationship.type] || 0.5;
  }

  /**
   * Build multiple edges from relationships
   *
   * @param relationships - Array of relationships
   * @param contextIds - Set of valid context IDs
   * @returns Array of graph edges (filtered)
   */
  buildMany(
    relationships: Relationship[],
    contextIds: Set<string>
  ): GraphEdge[] {
    return relationships
      .map((rel) => this.build(rel, contextIds))
      .filter((edge): edge is GraphEdge => edge !== null);
  }
}
