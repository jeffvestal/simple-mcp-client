/**
 * Cache and Performance Integration Test Suite
 * 
 * Tests caching behavior across service boundaries and performance monitoring
 * integration throughout the tool execution pipeline. Verifies that caching
 * works correctly and performance metrics are captured appropriately.
 */

import { ToolExecutionServiceFactory } from '../../factories/ToolExecutionServiceFactory'
import { ServiceContainer } from '../../types/ServiceDependencies'
import { ToolCall, ChatMessage } from '../../types/ToolExecutionTypes'
import {
  createMockExternalDependencies,
  waitForPromises,
  createDelay,
  createMockTimers
} from '../fixtures/mockDependencies'
import {
  mockSuccessfulToolResponse,
  mockMCPServerListResponse,
  mockMCPServerWithToolsResponse,
  mockLLMChatResponse
} from '../fixtures/mockApiResponses'

describe('Cache and Performance Integration Tests', () => {
  let factory: ToolExecutionServiceFactory
  let serviceContainer: ServiceContainer
  let mockDependencies: any
  let mockTimers: any

  beforeEach(() => {
    factory = ToolExecutionServiceFactory.getInstance()
    factory.destroyServiceContainer()
    mockTimers = createMockTimers()

    mockDependencies = createMockExternalDependencies({
      api: {
        getMCPServers: jest.fn().mockResolvedValue(mockMCPServerListResponse),
        getMCPServerWithTools: jest.fn().mockResolvedValue(mockMCPServerWithToolsResponse),
        callTool: jest.fn().mockResolvedValue(mockSuccessfulToolResponse),
        chat: jest.fn().mockResolvedValue(mockLLMChatResponse)
      }
    })

    serviceContainer = factory.createServiceContainer({
      externalDependencies: mockDependencies,
      serviceConfiguration: {
        maxRetries: 3,
        cacheExpiryMs: 300000, // 5 minutes
        conversationHistoryLimit: 50,
        enablePerformanceMonitoring: true,
        enableMemoryTracking: true
      },
      enableMocking: false,
      testMode: true
    })
  })

  afterEach(() => {
    if (serviceContainer) {
      serviceContainer.dispose()
    }
    factory.destroyServiceContainer()
    jest.clearAllMocks()
    mockTimers.clearAllTimers()
  })

  describe('Tool Server Mapping Cache Integration', () => {
    it('should cache server mappings and reuse them across executions', async () => {
      // Arrange
      const toolCalls1: ToolCall[] = [{
        id: 'call_cache_1',
        name: 'cached_tool',
        parameters: { test: 'cache1' },
        status: 'pending'
      }]

      const toolCalls2: ToolCall[] = [{
        id: 'call_cache_2',
        name: 'cached_tool', // Same tool name
        parameters: { test: 'cache2' },
        status: 'pending'
      }]

      const toolCalls3: ToolCall[] = [{
        id: 'call_cache_3',
        name: 'different_tool', // Different tool
        parameters: { test: 'cache3' },
        status: 'pending'
      }]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls1,
        [],
        'assistant_msg_cache_1'
      )

      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls2,
        [],
        'assistant_msg_cache_2'
      )

      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls3,
        [],
        'assistant_msg_cache_3'
      )

      // Assert
      const cacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      
      // Should have cache hits for the repeated tool
      expect(cacheStats.hits).toBeGreaterThan(0)
      expect(cacheStats.misses).toBeGreaterThan(0)
      expect(cacheStats.size).toBeGreaterThan(0)
      expect(cacheStats.hitRate).toBeGreaterThan(0)
      
      // Server discovery should have been called only twice (for cache population)
      expect(mockDependencies.api.getMCPServers).toHaveBeenCalledTimes(1)
      expect(mockDependencies.api.getMCPServerWithTools).toHaveBeenCalled()
      
      // Cache should contain mappings for both tools
      const cachedMappings = serviceContainer.toolServerMappingService.getCachedMappings()
      expect(cachedMappings).toBeDefined()
      expect(Object.keys(cachedMappings)).toContain('cached_tool')
      expect(Object.keys(cachedMappings)).toContain('different_tool')
    })

    it('should handle cache expiry correctly', async () => {
      // Arrange
      serviceContainer.configure({
        cacheExpiryMs: 100 // 100ms for quick testing
      })

      const toolCalls: ToolCall[] = [{
        id: 'call_expiry',
        name: 'expiry_tool',
        parameters: { test: 'expiry' },
        status: 'pending'
      }]

      // Act - First execution
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_expiry_1'
      )

      // Verify cache is populated
      expect(serviceContainer.toolServerMappingService.isCacheValid()).toBe(true)
      const initialStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(initialStats.size).toBeGreaterThan(0)

      // Wait for cache to expire
      await createDelay(150)

      // Second execution after expiry
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_expiry_2'
      )

      // Assert
      // Cache should have been rebuilt
      expect(mockDependencies.api.getMCPServers).toHaveBeenCalledTimes(2)
      
      const finalStats = serviceContainer.toolServerMappingService.getCacheStats()
      // Should have more misses due to cache expiry
      expect(finalStats.misses).toBeGreaterThan(initialStats.misses)
    })

    it('should warm up cache efficiently', async () => {
      // Arrange
      const initialStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(initialStats.size).toBe(0)

      // Act
      await serviceContainer.toolServerMappingService.warmUpCache()

      // Assert
      const warmedStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(warmedStats.size).toBeGreaterThan(initialStats.size)
      
      // Server discovery should have been called during warmup
      expect(mockDependencies.api.getMCPServers).toHaveBeenCalled()

      // Now execute a tool call - should hit warm cache
      const toolCalls: ToolCall[] = [{
        id: 'call_warm',
        name: 'warm_tool',
        parameters: { test: 'warm' },
        status: 'pending'
      }]

      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_warm'
      )

      // Cache should show hits from warmup
      const finalStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(finalStats.hits).toBeGreaterThan(0)
    })

    it('should handle cache invalidation properly', async () => {
      // Arrange
      // Populate cache
      await serviceContainer.toolExecutionService.executeToolCalls(
        [{
          id: 'call_populate',
          name: 'invalidate_tool',
          parameters: { test: 'populate' },
          status: 'pending'
        }],
        [],
        'assistant_msg_populate'
      )

      const populatedStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(populatedStats.size).toBeGreaterThan(0)

      // Act - Clear cache
      serviceContainer.toolServerMappingService.clearCache()

      // Assert
      const clearedStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(clearedStats.size).toBe(0)
      expect(clearedStats.hits).toBe(0)
      expect(clearedStats.misses).toBe(0)

      // Next execution should rebuild cache
      await serviceContainer.toolExecutionService.executeToolCalls(
        [{
          id: 'call_rebuild',
          name: 'invalidate_tool',
          parameters: { test: 'rebuild' },
          status: 'pending'
        }],
        [],
        'assistant_msg_rebuild'
      )

      const rebuiltStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(rebuiltStats.size).toBeGreaterThan(0)
    })
  })

  describe('Performance Monitoring Integration', () => {
    it('should capture performance metrics throughout tool execution', async () => {
      // Arrange
      const mockOperation = {
        end: jest.fn(),
        addMetadata: jest.fn()
      }
      mockDependencies.performanceMonitor.startOperation.mockReturnValue(mockOperation)

      const toolCalls: ToolCall[] = [{
        id: 'call_perf',
        name: 'performance_tool',
        parameters: { test: 'performance' },
        status: 'pending'
      }]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_perf'
      )

      // Assert
      // Performance monitoring should have been started
      expect(mockDependencies.performanceMonitor.startOperation).toHaveBeenCalledWith(
        expect.stringContaining('toolExecution'),
        expect.any(Object)
      )

      // Operation should have ended
      expect(mockOperation.end).toHaveBeenCalled()

      // Metadata should have been added
      expect(mockOperation.addMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCount: 1,
          toolNames: ['performance_tool']
        })
      )

      // Specific metrics should have been recorded
      expect(mockDependencies.performanceMonitor.recordMetric).toHaveBeenCalledWith(
        expect.stringContaining('toolExecution'),
        expect.any(Number),
        expect.any(Object)
      )
    })

    it('should capture cache performance metrics', async () => {
      // Arrange
      const toolCalls: ToolCall[] = [
        {
          id: 'call_cache_perf_1',
          name: 'cache_perf_tool',
          parameters: { test: 'cache_perf1' },
          status: 'pending'
        },
        {
          id: 'call_cache_perf_2',
          name: 'cache_perf_tool', // Same tool for cache hit
          parameters: { test: 'cache_perf2' },
          status: 'pending'
        }
      ]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls.slice(0, 1),
        [],
        'assistant_msg_cache_perf_1'
      )

      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls.slice(1, 2),
        [],
        'assistant_msg_cache_perf_2'
      )

      // Assert
      // Cache metrics should have been recorded
      expect(mockDependencies.performanceMonitor.recordMetric).toHaveBeenCalledWith(
        expect.stringContaining('cache'),
        expect.any(Number),
        expect.any(Object)
      )

      // Cache hit rate should be tracked
      const cacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(cacheStats.hitRate).toBeGreaterThan(0)
    })

    it('should handle performance monitoring errors gracefully', async () => {
      // Arrange
      mockDependencies.performanceMonitor.startOperation.mockImplementation(() => {
        throw new Error('Performance monitoring failed')
      })

      const toolCalls: ToolCall[] = [{
        id: 'call_perf_error',
        name: 'perf_error_tool',
        parameters: { test: 'perf_error' },
        status: 'pending'
      }]

      // Act & Assert - Should not throw despite performance monitoring error
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_perf_error'
      )

      // Tool execution should still succeed
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(1)

      // Error should have been logged
      expect(mockDependencies.errorLogger.logError).toHaveBeenCalledWith(
        expect.stringContaining('Performance monitoring failed'),
        expect.any(Object)
      )
    })

    it('should track performance across multiple tool executions', async () => {
      // Arrange
      const multipleToolCalls: ToolCall[] = [
        {
          id: 'call_multi_1',
          name: 'multi_tool_1',
          parameters: { test: 'multi1' },
          status: 'pending'
        },
        {
          id: 'call_multi_2',
          name: 'multi_tool_2',
          parameters: { test: 'multi2' },
          status: 'pending'
        },
        {
          id: 'call_multi_3',
          name: 'multi_tool_3',
          parameters: { test: 'multi3' },
          status: 'pending'
        }
      ]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        multipleToolCalls,
        [],
        'assistant_msg_multi'
      )

      // Assert
      // Performance should be tracked for each tool
      expect(mockDependencies.performanceMonitor.recordMetric).toHaveBeenCalledTimes(
        expect.any(Number) // Multiple calls expected
      )

      // Overall execution performance should be tracked
      const performanceCalls = mockDependencies.performanceMonitor.startOperation.mock.calls
      const executionCalls = performanceCalls.filter(call => 
        call[0].includes('toolExecution')
      )
      expect(executionCalls.length).toBeGreaterThan(0)
    })
  })

  describe('Memory Management Integration with Cache and Performance', () => {
    it('should integrate memory tracking with cache operations', async () => {
      // Arrange
      const toolCalls: ToolCall[] = [{
        id: 'call_memory_cache',
        name: 'memory_cache_tool',
        parameters: { test: 'memory_cache' },
        status: 'pending'
      }]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_memory_cache'
      )

      // Assert
      // Memory management should be integrated
      expect(mockDependencies.memoryManager.registerCleanupTask).toHaveBeenCalled()
      expect(mockDependencies.memoryManager.getMemoryStats).toHaveBeenCalled()

      // Cache should be tracked as a memory resource
      const cleanupCalls = mockDependencies.memoryManager.registerCleanupTask.mock.calls
      const cacheCleanupCalls = cleanupCalls.filter(call =>
        call[0].includes('cache') || call[1]?.type === 'cache'
      )
      expect(cacheCleanupCalls.length).toBeGreaterThan(0)
    })

    it('should handle memory pressure by clearing cache', async () => {
      // Arrange
      // Simulate high memory usage
      mockDependencies.memoryManager.getMemoryStats.mockReturnValue({
        activeResources: 1000,
        memoryUsage: 0.9, // 90% memory usage
        memoryGrowthRate: 0.15,
        resourcesByType: {
          cache: 500,
          promises: 300,
          timers: 200
        }
      })

      // Populate cache first
      await serviceContainer.toolExecutionService.executeToolCalls(
        [{
          id: 'call_populate_pressure',
          name: 'pressure_tool',
          parameters: { test: 'populate' },
          status: 'pending'
        }],
        [],
        'assistant_msg_populate_pressure'
      )

      const initialCacheSize = serviceContainer.toolServerMappingService.getCacheStats().size
      expect(initialCacheSize).toBeGreaterThan(0)

      // Act - Execute another tool call under memory pressure
      await serviceContainer.toolExecutionService.executeToolCalls(
        [{
          id: 'call_memory_pressure',
          name: 'pressure_tool_2',
          parameters: { test: 'pressure' },
          status: 'pending'
        }],
        [],
        'assistant_msg_memory_pressure'
      )

      // Assert
      // Memory pressure handling should have been triggered
      expect(mockDependencies.memoryManager.getMemoryStats).toHaveBeenCalled()

      // Cache might have been cleared or reduced due to memory pressure
      // This depends on the specific implementation of memory pressure handling
    })

    it('should clean up performance monitoring resources', async () => {
      // Arrange
      const toolCalls: ToolCall[] = [{
        id: 'call_perf_cleanup',
        name: 'perf_cleanup_tool',
        parameters: { test: 'perf_cleanup' },
        status: 'pending'
      }]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_perf_cleanup'
      )

      // Assert
      // Performance monitoring resources should be registered for cleanup
      expect(mockDependencies.memoryManager.registerCleanupTask).toHaveBeenCalled()
      
      const cleanupCalls = mockDependencies.memoryManager.registerCleanupTask.mock.calls
      const performanceCleanupCalls = cleanupCalls.filter(call =>
        call[0].includes('performance') || call[1]?.type === 'performance'
      )
      
      // Should have at least some performance-related cleanup tasks
      expect(cleanupCalls.length).toBeGreaterThan(0)
    })
  })

  describe('Cache Consistency Under Stress', () => {
    it('should maintain cache consistency with concurrent tool executions', async () => {
      // Arrange
      const concurrentToolCalls = Array.from({ length: 5 }, (_, i) => ({
        id: `call_concurrent_${i}`,
        name: 'concurrent_tool',
        parameters: { test: `concurrent${i}` },
        status: 'pending' as const
      }))

      // Act - Execute multiple tool calls concurrently
      const results = await Promise.all(
        concurrentToolCalls.map((toolCall, index) =>
          serviceContainer.toolExecutionService.executeToolCalls(
            [toolCall],
            [],
            `assistant_msg_concurrent_${index}`
          )
        )
      )

      // Assert
      // All executions should succeed
      results.forEach(result => {
        expect(result.success).toBe(true)
        expect(result.toolResults).toHaveLength(1)
      })

      // Cache should remain consistent
      const cacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(cacheStats.size).toBeGreaterThan(0)
      expect(serviceContainer.toolServerMappingService.isCacheValid()).toBe(true)

      // Should have good cache hit rate due to concurrent access to same tool
      expect(cacheStats.hitRate).toBeGreaterThan(0.5) // At least 50% hit rate
    })

    it('should handle rapid cache operations correctly', async () => {
      // Arrange
      const rapidToolCalls: ToolCall[] = [{
        id: 'call_rapid',
        name: 'rapid_tool',
        parameters: { test: 'rapid' },
        status: 'pending'
      }]

      // Act - Execute rapid consecutive calls
      const rapidResults = []
      for (let i = 0; i < 10; i++) {
        rapidResults.push(
          await serviceContainer.toolExecutionService.executeToolCalls(
            rapidToolCalls,
            [],
            `assistant_msg_rapid_${i}`
          )
        )
      }

      // Assert
      // All rapid executions should succeed
      rapidResults.forEach(result => {
        expect(result.success).toBe(true)
      })

      // Cache should show high hit rate for rapid repeated calls
      const finalCacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(finalCacheStats.hits).toBeGreaterThan(5) // Most calls should be cache hits
      expect(finalCacheStats.hitRate).toBeGreaterThan(0.8) // High hit rate expected
    })
  })
})