/**
 * Tool Server Mapping Service Interface
 * 
 * Handles server discovery, caching, and tool-to-server mapping
 */

import type { ToolServerMapping, ServerDetails, CacheStats } from '../types/ToolExecutionTypes'

export interface IToolServerMappingService {
  /**
   * Find the server ID for a given tool name
   * Uses caching with 5-minute expiry
   */
  findServerForTool(
    toolName: string,
    abortSignal?: AbortSignal
  ): Promise<number | null>

  /**
   * Build and cache tool server mappings
   * Mirrors the existing buildToolServerCache function
   */
  buildToolServerCache(abortSignal?: AbortSignal): Promise<void>

  /**
   * Check if cache is valid (not expired)
   */
  isCacheValid(): boolean

  /**
   * Get current cache statistics
   */
  getCacheStats(): CacheStats

  /**
   * Clear the cache (useful for testing and memory pressure)
   */
  clearCache(): void

  /**
   * Get all cached tool mappings
   */
  getCachedMappings(): ToolServerMapping

  /**
   * Manually set cache entry (useful for testing)
   */
  setCacheEntry(toolName: string, serverId: number): void

  /**
   * Get cache expiry timestamp
   */
  getCacheExpiryTime(): number

  /**
   * Handle memory pressure by clearing cache
   * Integrates with the memory management system
   */
  handleMemoryPressure(): void

  /**
   * Warm up cache by pre-loading common tools
   */
  warmUpCache(abortSignal?: AbortSignal): Promise<void>
}