/**
 * Tool Server Mapping Service
 * 
 * Handles server discovery, caching, and tool-to-server mapping
 * Extracted from the original ChatInterfaceSimple.tsx caching logic
 */

import type { IToolServerMappingService } from './interfaces/IToolServerMappingService'
import type { 
  ToolServerMapping, 
  ServerDetails, 
  CacheStats,
  ServiceConfiguration
} from './types/ToolExecutionTypes'
import { TOOL_EXECUTION_CONSTANTS } from './types/ToolExecutionTypes'
import type { ExternalDependencies } from './types/ServiceDependencies'
import { trackAsyncOperation } from '../../lib/MemoryManager'
import { devLog, DevLogCategory } from '../../lib/developmentLogger'

export class ToolServerMappingService implements IToolServerMappingService {
  private toolServerCache = new Map<string, number>()
  private cacheTimestamp: number = 0
  private cacheStats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    hitRate: 0
  }

  // Use exact same cache expiry as original
  private readonly TOOL_CACHE_EXPIRY_MS = TOOL_EXECUTION_CONSTANTS.TOOL_CACHE_EXPIRY_MS

  constructor(
    private externalDependencies: ExternalDependencies,
    private configuration: ServiceConfiguration
  ) {
    this.setupMemoryIntegration()
  }

  /**
   * Find the server ID for a given tool name
   * Exact replication of original findServerForTool logic
   */
  async findServerForTool(
    toolName: string,
    abortSignal?: AbortSignal
  ): Promise<number | null> {
    // Check cache first - exact replication of original logic
    if (this.isCacheValid() && this.toolServerCache.has(toolName)) {
      const serverId = this.toolServerCache.get(toolName)!
      devLog.cache('Found tool in cache', {
        toolName,
        serverId
      })
      this.updateCacheStats(true) // Cache hit
      return serverId
    }

    this.updateCacheStats(false) // Cache miss

    // Cache is stale or doesn't have this tool, rebuild it
    if (!this.isCacheValid()) {
      devLog.cache('Tool cache expired, rebuilding')
      await this.buildToolServerCache(abortSignal)
    }

    // Check cache again after rebuild
    if (this.toolServerCache.has(toolName)) {
      const serverId = this.toolServerCache.get(toolName)!
      devLog.cache('Found tool after cache rebuild', {
        toolName,
        serverId
      })
      return serverId
    }

    devLog.cache('Tool not found in any server', { toolName })
    return null
  }

  /**
   * Build and cache tool server mappings
   * Exact replication of original buildToolServerCache logic
   */
  async buildToolServerCache(abortSignal?: AbortSignal): Promise<void> {
    try {
      devLog.cache('Building tool server mapping cache')
      
      const servers = await trackAsyncOperation(
        () => this.externalDependencies.api.getMCPServers(abortSignal),
        'Fetch MCP servers',
        abortSignal
      ).catch(error => {
        if (!abortSignal?.aborted) {
          devLog.error(DevLogCategory.API, 'Failed to fetch MCP servers', error)
        }
        throw error
      })

      const toolMapping = new Map<string, number>()

      for (const server of servers) {
        if (abortSignal?.aborted) throw new Error('Operation cancelled')

        const serverDetails = await trackAsyncOperation(
          () => this.externalDependencies.api.getMCPServerWithTools(server.id, abortSignal),
          `Fetch tools for server ${server.id}`,
          abortSignal
        ).catch(error => {
          if (!abortSignal?.aborted) {
            devLog.error(DevLogCategory.API, 'Failed to fetch tools for server', {
              serverId: server.id,
              error
            })
          }
          // Continue with other servers even if one fails - exact original behavior
          return { tools: [] }
        })

        for (const tool of serverDetails.tools || []) {
          if (tool.is_enabled) {
            toolMapping.set(tool.name, server.id)
          }
        }
      }

      this.toolServerCache = toolMapping
      this.cacheTimestamp = Date.now()
      this.updateCacheSize()
      
      devLog.cache('Tool server mapping cache built', {
        toolCount: toolMapping.size,
        serverCount: servers.length
      })

    } catch (error) {
      if (!abortSignal?.aborted) {
        devLog.error(DevLogCategory.CACHE, 'Failed to build tool server cache', error)
        this.externalDependencies.errorLogger.logError(
          'Failed to build tool server cache', 
          error as Error
        )
      }
      // Don't throw - return empty cache and let individual tool calls handle missing tools
      // This preserves the exact original behavior
      this.toolServerCache.clear()
      this.cacheTimestamp = Date.now()
      this.updateCacheSize()
    }
  }

  /**
   * Check if cache is valid (not expired)
   * Exact replication of original isCacheValid logic
   */
  isCacheValid(): boolean {
    const now = Date.now()
    return (now - this.cacheTimestamp) < this.TOOL_CACHE_EXPIRY_MS
  }

  /**
   * Get current cache statistics
   */
  getCacheStats(): CacheStats {
    return { ...this.cacheStats }
  }

  /**
   * Clear the cache (useful for testing and memory pressure)
   */
  clearCache(): void {
    devLog.cache('Clearing tool server cache')
    this.toolServerCache.clear()
    this.cacheTimestamp = 0
    this.updateCacheSize()
  }

  /**
   * Get all cached tool mappings
   */
  getCachedMappings(): ToolServerMapping {
    const mappings: ToolServerMapping = {}
    for (const [toolName, serverId] of this.toolServerCache.entries()) {
      mappings[toolName] = serverId
    }
    return mappings
  }

  /**
   * Manually set cache entry (useful for testing)
   */
  setCacheEntry(toolName: string, serverId: number): void {
    this.toolServerCache.set(toolName, serverId)
    this.cacheTimestamp = Date.now()
    this.updateCacheSize()
  }

  /**
   * Get cache expiry timestamp
   */
  getCacheExpiryTime(): number {
    return this.cacheTimestamp + this.TOOL_CACHE_EXPIRY_MS
  }

  /**
   * Handle memory pressure by clearing cache
   * Integrates with the memory management system
   */
  handleMemoryPressure(): void {
    devLog.memory('Memory pressure detected, clearing tool server cache')
    this.clearCache()
  }

  /**
   * Warm up cache by pre-loading common tools
   */
  async warmUpCache(abortSignal?: AbortSignal): Promise<void> {
    if (!this.isCacheValid()) {
      devLog.cache('Warming up tool server cache')
      await this.buildToolServerCache(abortSignal)
    }
  }

  // Private helper methods

  /**
   * Update cache statistics
   */
  private updateCacheStats(hit: boolean): void {
    if (hit) {
      this.cacheStats.hits++
    } else {
      this.cacheStats.misses++
    }

    const total = this.cacheStats.hits + this.cacheStats.misses
    this.cacheStats.hitRate = total > 0 ? this.cacheStats.hits / total : 0
    this.updateCacheSize()
  }

  /**
   * Update cache size in stats
   */
  private updateCacheSize(): void {
    this.cacheStats.size = this.toolServerCache.size
  }

  /**
   * Setup memory integration with MemoryManager
   */
  private setupMemoryIntegration(): void {
    // Register cleanup task with MemoryManager
    this.externalDependencies.memoryManager.registerCleanupTask({
      priority: 'high',
      description: 'ToolServerMappingService cache cleanup',
      execute: () => this.clearCache()
    })

    // Add memory pressure listener (matches original 0.8 threshold from ChatInterfaceSimple)
    this.externalDependencies.memoryManager.addMemoryPressureListener(0.8, (usage) => {
      if (usage > 0.8) {
        this.handleMemoryPressure()
      }
    })
  }

  /**
   * Configuration management (optional)
   */
  configure(newConfiguration: ServiceConfiguration): void {
    this.configuration = { ...this.configuration, ...newConfiguration }
  }

  /**
   * Reset service to initial state (optional)
   */
  reset(): void {
    this.clearCache()
    this.cacheStats = {
      hits: 0,
      misses: 0,
      size: 0,
      hitRate: 0
    }
  }

  /**
   * Dispose of service resources (optional)
   */
  dispose(): void {
    this.clearCache()
    // Note: MemoryManager cleanup tasks are automatically handled by MemoryManager
  }
}