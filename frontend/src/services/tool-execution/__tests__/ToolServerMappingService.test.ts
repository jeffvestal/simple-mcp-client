/**
 * ToolServerMappingService Test Suite
 * 
 * Comprehensive test coverage for server discovery, caching, and tool-to-server mapping
 * Tests based on original ChatInterfaceSimple.tsx caching logic
 */

import { ToolServerMappingService } from '../ToolServerMappingService'
import { IToolServerMappingService } from '../interfaces/IToolServerMappingService'
import { 
  ServiceConfiguration, 
  TOOL_EXECUTION_CONSTANTS,
  CacheStats 
} from '../types/ToolExecutionTypes'
import { ExternalDependencies } from '../types/ServiceDependencies'
import { 
  mockMCPServerListResponse,
  mockMCPServerWithToolsResponse,
  mockErrorResponses,
  createMockToolResponse
} from './fixtures/mockApiResponses'
import { createMockApi, createMockMemoryManager, createMockErrorLogger } from './fixtures/mockDependencies'

// Test utilities
const createTestService = (
  overrides: Partial<ExternalDependencies> = {},
  config: Partial<ServiceConfiguration> = {}
): ToolServerMappingService => {
  const defaultDependencies: ExternalDependencies = {
    api: createMockApi(),
    memoryManager: createMockMemoryManager(),
    errorLogger: createMockErrorLogger(),
    ...overrides
  }

  const defaultConfig: ServiceConfiguration = {
    maxRetries: 3,
    cacheExpiryMs: TOOL_EXECUTION_CONSTANTS.TOOL_CACHE_EXPIRY_MS,
    conversationHistoryLimit: 50,
    enablePerformanceMonitoring: true,
    enableMemoryTracking: true,
    ...config
  }

  return new ToolServerMappingService(defaultDependencies, defaultConfig)
}

const waitForMs = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('ToolServerMappingService', () => {
  let service: ToolServerMappingService
  let mockApi: ReturnType<typeof createMockApi>
  let mockMemoryManager: ReturnType<typeof createMockMemoryManager>
  let mockErrorLogger: ReturnType<typeof createMockErrorLogger>

  beforeEach(() => {
    mockApi = createMockApi()
    mockMemoryManager = createMockMemoryManager()
    mockErrorLogger = createMockErrorLogger()
    
    service = createTestService({
      api: mockApi,
      memoryManager: mockMemoryManager,
      errorLogger: mockErrorLogger
    })
  })

  afterEach(() => {
    service.dispose()
  })

  describe('Interface Implementation', () => {
    test('implements IToolServerMappingService interface', () => {
      expect(service).toBeInstanceOf(ToolServerMappingService)
      
      // Verify all interface methods exist
      const interfaceMethods: (keyof IToolServerMappingService)[] = [
        'findServerForTool',
        'buildToolServerCache', 
        'isCacheValid',
        'getCacheStats',
        'clearCache',
        'getCachedMappings',
        'warmUpCache'
      ]
      
      interfaceMethods.forEach(method => {
        expect(typeof service[method]).toBe('function')
      })
    })

    test('provides all expected public methods', () => {
      const publicMethods = [
        'findServerForTool',
        'buildToolServerCache',
        'isCacheValid', 
        'getCacheStats',
        'clearCache',
        'getCachedMappings',
        'setCacheEntry',
        'getCacheExpiryTime',
        'handleMemoryPressure',
        'warmUpCache',
        'configure',
        'reset',
        'dispose'
      ]
      
      publicMethods.forEach(method => {
        expect(service).toHaveProperty(method)
        expect(typeof (service as any)[method]).toBe('function')
      })
    })
  })

  describe('Cache Validation Logic', () => {
    test('new service has invalid cache initially', () => {
      expect(service.isCacheValid()).toBe(false)
    })

    test('cache becomes valid after building', async () => {
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)

      await service.buildToolServerCache()
      expect(service.isCacheValid()).toBe(true)
    })

    test('cache expires after TOOL_CACHE_EXPIRY_MS', async () => {
      // Build cache
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      await service.buildToolServerCache()
      
      expect(service.isCacheValid()).toBe(true)
      
      // Fast-forward time to simulate expiry
      const originalNow = Date.now
      Date.now = jest.fn(() => originalNow() + TOOL_EXECUTION_CONSTANTS.TOOL_CACHE_EXPIRY_MS + 1)
      
      expect(service.isCacheValid()).toBe(false)
      
      // Restore Date.now
      Date.now = originalNow
    })

    test('getCacheExpiryTime returns correct timestamp', async () => {
      const beforeBuild = Date.now()
      
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      await service.buildToolServerCache()
      
      const afterBuild = Date.now()
      const expiryTime = service.getCacheExpiryTime()
      
      expect(expiryTime).toBeGreaterThanOrEqual(beforeBuild + TOOL_EXECUTION_CONSTANTS.TOOL_CACHE_EXPIRY_MS)
      expect(expiryTime).toBeLessThanOrEqual(afterBuild + TOOL_EXECUTION_CONSTANTS.TOOL_CACHE_EXPIRY_MS)
    })

    test('clearCache makes cache invalid', async () => {
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      
      await service.buildToolServerCache()
      expect(service.isCacheValid()).toBe(true)
      
      service.clearCache()
      expect(service.isCacheValid()).toBe(false)
    })
  })

  describe('Server Discovery', () => {
    test('buildToolServerCache fetches servers and tools', async () => {
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)

      await service.buildToolServerCache()

      expect(mockApi.getMCPServers).toHaveBeenCalledTimes(1)
      expect(mockApi.getMCPServerWithTools).toHaveBeenCalledTimes(mockMCPServerListResponse.length)
      
      // Verify each server was queried
      mockMCPServerListResponse.forEach(server => {
        expect(mockApi.getMCPServerWithTools).toHaveBeenCalledWith(server.id, undefined)
      })
    })

    test('buildToolServerCache maps enabled tools to servers', async () => {
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)

      await service.buildToolServerCache()
      
      const mappings = service.getCachedMappings()
      
      // Should map enabled tools only
      expect(mappings).toHaveProperty('search_documents', mockMCPServerWithToolsResponse.id)
      expect(mappings).toHaveProperty('get_document', mockMCPServerWithToolsResponse.id)
      expect(mappings).not.toHaveProperty('disabled_tool')
    })

    test('buildToolServerCache handles server fetch errors gracefully', async () => {
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      
      // Mock one server failing
      mockApi.getMCPServerWithTools
        .mockResolvedValueOnce(mockMCPServerWithToolsResponse)
        .mockRejectedValueOnce(new Error('Server unavailable'))
        .mockResolvedValueOnce({ tools: [] })

      await service.buildToolServerCache()

      // Should continue with other servers
      expect(mockApi.getMCPServerWithTools).toHaveBeenCalledTimes(3)
      expect(mockErrorLogger.logError).toHaveBeenCalledWith(
        'Failed to fetch tools for server 2:',
        expect.any(Error)
      )
    })

    test('buildToolServerCache handles complete API failure', async () => {
      mockApi.getMCPServers.mockRejectedValue(new Error('API unavailable'))

      await service.buildToolServerCache()

      expect(mockErrorLogger.logError).toHaveBeenCalledWith(
        'Failed to build tool server cache',
        expect.any(Error)
      )
      
      // Cache should be empty but valid (with timestamp)
      expect(service.getCachedMappings()).toEqual({})
      expect(service.isCacheValid()).toBe(true)
    })

    test('buildToolServerCache respects AbortSignal', async () => {
      const abortController = new AbortController()
      mockApi.getMCPServers.mockImplementation(async (signal) => {
        if (signal?.aborted) throw new Error('Operation cancelled')
        return mockMCPServerListResponse
      })

      // Abort immediately
      abortController.abort()

      await service.buildToolServerCache(abortController.signal)

      // Should not call subsequent API methods
      expect(mockApi.getMCPServerWithTools).not.toHaveBeenCalled()
    })

    test('buildToolServerCache aborts during server iteration', async () => {
      const abortController = new AbortController()
      
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockImplementation(async () => {
        // Abort during first server fetch
        abortController.abort()
        throw new Error('Operation cancelled')
      })

      await service.buildToolServerCache(abortController.signal)

      // Should stop processing servers
      expect(mockApi.getMCPServerWithTools).toHaveBeenCalledTimes(1)
    })
  })

  describe('Tool Lookup Operations', () => {
    beforeEach(async () => {
      // Setup cache with test data
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      await service.buildToolServerCache()
    })

    test('findServerForTool returns server ID for cached tool', async () => {
      const serverId = await service.findServerForTool('search_documents')
      expect(serverId).toBe(mockMCPServerWithToolsResponse.id)
    })

    test('findServerForTool returns null for unknown tool', async () => {
      const serverId = await service.findServerForTool('unknown_tool')
      expect(serverId).toBeNull()
    })

    test('findServerForTool rebuilds cache when expired', async () => {
      // Expire cache
      const originalNow = Date.now
      Date.now = jest.fn(() => originalNow() + TOOL_EXECUTION_CONSTANTS.TOOL_CACHE_EXPIRY_MS + 1)

      // Reset mock call counts
      mockApi.getMCPServers.mockClear()
      mockApi.getMCPServerWithTools.mockClear()

      const serverId = await service.findServerForTool('search_documents')

      expect(mockApi.getMCPServers).toHaveBeenCalledTimes(1)
      expect(serverId).toBe(mockMCPServerWithToolsResponse.id)

      // Restore Date.now
      Date.now = originalNow
    })

    test('findServerForTool handles cache rebuild failure', async () => {
      // Expire cache
      service.clearCache()
      
      // Mock API failure
      mockApi.getMCPServers.mockRejectedValue(new Error('API failure'))

      const serverId = await service.findServerForTool('search_documents')
      expect(serverId).toBeNull()
    })

    test('findServerForTool respects AbortSignal', async () => {
      const abortController = new AbortController()
      abortController.abort()

      // Clear cache to force rebuild
      service.clearCache()

      const serverId = await service.findServerForTool('search_documents', abortController.signal)
      expect(serverId).toBeNull()
    })
  })

  describe('Cache Statistics Tracking', () => {
    beforeEach(async () => {
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      await service.buildToolServerCache()
    })

    test('initial cache stats are zero', () => {
      const service = createTestService()
      const stats = service.getCacheStats()
      
      expect(stats).toEqual({
        hits: 0,
        misses: 0, 
        size: 0,
        hitRate: 0
      })
    })

    test('cache hit increments hit counter', async () => {
      await service.findServerForTool('search_documents')
      
      const stats = service.getCacheStats()
      expect(stats.hits).toBe(1)
      expect(stats.misses).toBe(0)
      expect(stats.hitRate).toBe(1)
    })

    test('cache miss increments miss counter', async () => {
      // Clear cache to force miss
      service.clearCache()
      
      await service.findServerForTool('search_documents')
      
      const stats = service.getCacheStats()
      expect(stats.hits).toBe(0)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBe(0)
    })

    test('hit rate calculation is accurate', async () => {
      // Generate mix of hits and misses
      await service.findServerForTool('search_documents') // hit
      
      service.clearCache()
      await service.findServerForTool('search_documents') // miss
      
      await service.findServerForTool('search_documents') // hit
      await service.findServerForTool('get_document') // hit
      
      const stats = service.getCacheStats()
      expect(stats.hits).toBe(3)
      expect(stats.misses).toBe(1)
      expect(stats.hitRate).toBe(0.75) // 3/4
    })

    test('cache size reflects number of cached tools', async () => {
      const stats = service.getCacheStats()
      expect(stats.size).toBe(2) // search_documents + get_document (enabled tools only)
    })
  })

  describe('Manual Cache Management', () => {
    test('setCacheEntry adds tool mapping', () => {
      service.setCacheEntry('custom_tool', 999)
      
      const mappings = service.getCachedMappings()
      expect(mappings).toHaveProperty('custom_tool', 999)
      expect(service.isCacheValid()).toBe(true)
    })

    test('setCacheEntry updates cache timestamp', () => {
      const beforeSet = Date.now()
      service.setCacheEntry('custom_tool', 999)
      const afterSet = Date.now()
      
      const expiryTime = service.getCacheExpiryTime()
      expect(expiryTime).toBeGreaterThanOrEqual(beforeSet + TOOL_EXECUTION_CONSTANTS.TOOL_CACHE_EXPIRY_MS)
      expect(expiryTime).toBeLessThanOrEqual(afterSet + TOOL_EXECUTION_CONSTANTS.TOOL_CACHE_EXPIRY_MS)
    })

    test('clearCache empties mappings and resets stats', async () => {
      // Build cache first
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      await service.buildToolServerCache()
      
      // Generate some stats
      await service.findServerForTool('search_documents')
      
      service.clearCache()
      
      expect(service.getCachedMappings()).toEqual({})
      expect(service.getCacheStats().size).toBe(0)
      expect(service.isCacheValid()).toBe(false)
    })
  })

  describe('Memory Integration', () => {
    test('registers cleanup task with MemoryManager', () => {
      createTestService()
      
      expect(mockMemoryManager.registerCleanupTask).toHaveBeenCalledWith({
        priority: 'high',
        description: 'ToolServerMappingService cache cleanup',
        execute: expect.any(Function)
      })
    })

    test('registers memory pressure listener', () => {
      createTestService()
      
      expect(mockMemoryManager.addMemoryPressureListener).toHaveBeenCalledWith(
        0.8,
        expect.any(Function)
      )
    })

    test('handleMemoryPressure clears cache', async () => {
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      await service.buildToolServerCache()
      
      expect(service.isCacheValid()).toBe(true)
      
      service.handleMemoryPressure()
      
      expect(service.isCacheValid()).toBe(false)
      expect(service.getCachedMappings()).toEqual({})
    })

    test('memory pressure listener triggers cleanup', () => {
      const service = createTestService()
      
      // Get the registered listener function
      const listenerCall = mockMemoryManager.addMemoryPressureListener.mock.calls[0]
      const listenerFunction = listenerCall[1]
      
      // Mock service methods
      const handleMemoryPressureSpy = jest.spyOn(service, 'handleMemoryPressure')
      
      // Trigger memory pressure above threshold
      listenerFunction(0.85)
      
      expect(handleMemoryPressureSpy).toHaveBeenCalled()
    })
  })

  describe('Cache Warm-up', () => {
    test('warmUpCache builds cache when invalid', async () => {
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      
      expect(service.isCacheValid()).toBe(false)
      
      await service.warmUpCache()
      
      expect(service.isCacheValid()).toBe(true)
      expect(mockApi.getMCPServers).toHaveBeenCalledTimes(1)
    })

    test('warmUpCache skips build when cache valid', async () => {
      // Build cache first
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      await service.buildToolServerCache()
      
      // Clear mock call counts
      mockApi.getMCPServers.mockClear()
      
      await service.warmUpCache()
      
      expect(mockApi.getMCPServers).not.toHaveBeenCalled()
    })

    test('warmUpCache respects AbortSignal', async () => {
      const abortController = new AbortController()
      abortController.abort()
      
      await service.warmUpCache(abortController.signal)
      
      expect(mockApi.getMCPServers).not.toHaveBeenCalled()
    })
  })

  describe('Service Configuration', () => {
    test('configure updates service configuration', () => {
      const newConfig: Partial<ServiceConfiguration> = {
        maxRetries: 5,
        enablePerformanceMonitoring: false
      }
      
      service.configure(newConfig)
      
      // Configuration is private, but we can test behavior changes would apply
      expect(() => service.configure(newConfig)).not.toThrow()
    })

    test('reset clears cache and statistics', async () => {
      // Build cache and generate stats
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      await service.buildToolServerCache()
      await service.findServerForTool('search_documents')
      
      service.reset()
      
      expect(service.isCacheValid()).toBe(false)
      expect(service.getCachedMappings()).toEqual({})
      expect(service.getCacheStats()).toEqual({
        hits: 0,
        misses: 0,
        size: 0,
        hitRate: 0
      })
    })

    test('dispose clears cache', async () => {
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      await service.buildToolServerCache()
      
      service.dispose()
      
      expect(service.isCacheValid()).toBe(false)
      expect(service.getCachedMappings()).toEqual({})
    })
  })

  describe('Error Handling and Resilience', () => {
    test('handles network errors during server discovery', async () => {
      mockApi.getMCPServers.mockRejectedValue(new Error('Network error'))
      
      await service.buildToolServerCache()
      
      expect(mockErrorLogger.logError).toHaveBeenCalledWith(
        'Failed to build tool server cache',
        expect.any(Error)
      )
      expect(service.getCachedMappings()).toEqual({})
    })

    test('handles malformed server responses', async () => {
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue({ 
        // Missing tools array
        id: 1,
        name: 'broken-server'
      } as any)
      
      await service.buildToolServerCache()
      
      // Should not crash, but log error
      expect(service.getCachedMappings()).toEqual({})
    })

    test('continues processing after individual server errors', async () => {
      const workingServer = { ...mockMCPServerWithToolsResponse, id: 3 }
      
      mockApi.getMCPServers.mockResolvedValue([
        { id: 1, name: 'broken-server' },
        { id: 2, name: 'another-broken-server' },
        { id: 3, name: 'working-server' }
      ])
      
      mockApi.getMCPServerWithTools
        .mockRejectedValueOnce(new Error('Server 1 error'))
        .mockRejectedValueOnce(new Error('Server 2 error'))
        .mockResolvedValueOnce(workingServer)
      
      await service.buildToolServerCache()
      
      // Should have mappings from working server only
      const mappings = service.getCachedMappings()
      expect(mappings).toHaveProperty('search_documents', 3)
      expect(mockErrorLogger.logError).toHaveBeenCalledTimes(2)
    })
  })

  describe('Console Logging', () => {
    let consoleSpy: jest.SpyInstance

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    })

    afterEach(() => {
      consoleSpy.mockRestore()
    })

    test('logs cache hits with emoji formatting', async () => {
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      await service.buildToolServerCache()
      
      await service.findServerForTool('search_documents')
      
      expect(consoleSpy).toHaveBeenCalledWith(
        `🎯 Found search_documents in cache -> server ${mockMCPServerWithToolsResponse.id}`
      )
    })

    test('logs cache rebuild with emoji formatting', async () => {
      service.clearCache()
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      
      await service.findServerForTool('search_documents')
      
      expect(consoleSpy).toHaveBeenCalledWith('🔄 Tool cache expired, rebuilding...')
    })

    test('logs cache building progress', async () => {
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      
      await service.buildToolServerCache()
      
      expect(consoleSpy).toHaveBeenCalledWith('🔧 Building tool server mapping cache...')
      expect(consoleSpy).toHaveBeenCalledWith(
        `🔧 Cached ${2} tools from ${mockMCPServerListResponse.length} servers`
      )
    })

    test('logs tool not found scenarios', async () => {
      mockApi.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
      mockApi.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
      await service.buildToolServerCache()
      
      await service.findServerForTool('nonexistent_tool')
      
      expect(consoleSpy).toHaveBeenCalledWith('❓ Tool nonexistent_tool not found in any server')
    })
  })
})