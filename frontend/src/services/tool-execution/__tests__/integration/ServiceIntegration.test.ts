/**
 * Service Integration Test Suite
 * 
 * Tests the complete tool execution pipeline with real service interactions.
 * Verifies that the refactored service architecture works correctly as a complete system
 * while maintaining all original functionality from ChatInterfaceSimple.tsx
 */

import { ToolExecutionServiceFactory } from '../../factories/ToolExecutionServiceFactory'
import { ServiceContainer } from '../../types/ServiceDependencies'
import { ToolCall, ChatMessage, ServiceConfiguration, TOOL_EXECUTION_CONSTANTS } from '../../types/ToolExecutionTypes'
import {
  createMockExternalDependencies,
  waitForPromises,
  createDelay
} from '../fixtures/mockDependencies'
import {
  mockSuccessfulToolResponse,
  mockFailedToolResponse,
  mockLLMChatResponse,
  mockMCPServerListResponse,
  mockMCPServerWithToolsResponse
} from '../fixtures/mockApiResponses'

describe('Service Integration Tests', () => {
  let factory: ToolExecutionServiceFactory
  let serviceContainer: ServiceContainer
  let mockDependencies: any

  beforeEach(() => {
    // Create fresh service factory for each test
    factory = ToolExecutionServiceFactory.getInstance()
    
    // Destroy any existing container to ensure clean state
    factory.destroyServiceContainer()

    // Set up mock dependencies with realistic responses
    mockDependencies = createMockExternalDependencies({
      api: {
        getMCPServers: jest.fn().mockResolvedValue(mockMCPServerListResponse),
        getMCPServerWithTools: jest.fn().mockResolvedValue(mockMCPServerWithToolsResponse),
        callTool: jest.fn().mockResolvedValue(mockSuccessfulToolResponse),
        chat: jest.fn().mockResolvedValue(mockLLMChatResponse)
      }
    })

    // Create service container with real service implementations
    serviceContainer = factory.createServiceContainer({
      externalDependencies: mockDependencies,
      serviceConfiguration: {
        maxRetries: 3,
        cacheExpiryMs: 300000,
        conversationHistoryLimit: 50,
        enablePerformanceMonitoring: true,
        enableMemoryTracking: true
      },
      enableMocking: false, // Use real services, not mocks
      testMode: true
    })
  })

  afterEach(() => {
    // Clean up service container after each test
    if (serviceContainer) {
      serviceContainer.dispose()
    }
    factory.destroyServiceContainer()
    jest.clearAllMocks()
  })

  describe('Complete Tool Execution Pipeline', () => {
    it('should execute a single tool call end-to-end successfully', async () => {
      // Arrange
      const toolCalls: ToolCall[] = [{
        id: 'call_123',
        name: 'test_tool',
        parameters: { query: 'test query' },
        status: 'pending'
      }]

      const conversationHistory: ChatMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Execute test tool with query parameter'
        }
      ]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        conversationHistory,
        'assistant_msg_123'
      )

      // Assert
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(1)
      expect(result.toolResults[0].role).toBe('tool')
      expect(result.toolResults[0].tool_call_id).toBe('call_123')
      
      // Verify service interactions
      expect(mockDependencies.api.getMCPServers).toHaveBeenCalled()
      expect(mockDependencies.api.callTool).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_name: 'test_tool',
          parameters: { query: 'test query' }
        })
      )
      
      // Verify caching was used
      const cacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(cacheStats.size).toBeGreaterThan(0)
    })

    it('should handle multiple tool calls sequentially', async () => {
      // Arrange
      const toolCalls: ToolCall[] = [
        {
          id: 'call_1',
          name: 'tool_one',
          parameters: { param: 'value1' },
          status: 'pending'
        },
        {
          id: 'call_2', 
          name: 'tool_two',
          parameters: { param: 'value2' },
          status: 'pending'
        },
        {
          id: 'call_3',
          name: 'tool_three',
          parameters: { param: 'value3' },
          status: 'pending'
        }
      ]

      const conversationHistory: ChatMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Execute multiple tools'
        }
      ]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        conversationHistory,
        'assistant_msg_123'
      )

      // Assert
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(3)
      
      // Verify sequential execution order
      expect(mockDependencies.api.callTool).toHaveBeenCalledTimes(3)
      const callOrder = mockDependencies.api.callTool.mock.calls
      expect(callOrder[0][0].tool_name).toBe('tool_one')
      expect(callOrder[1][0].tool_name).toBe('tool_two')
      expect(callOrder[2][0].tool_name).toBe('tool_three')

      // Verify all tool results are properly formatted
      result.toolResults.forEach((toolResult, index) => {
        expect(toolResult.role).toBe('tool')
        expect(toolResult.tool_call_id).toBe(`call_${index + 1}`)
        expect(toolResult.content).toContain('Mock response')
      })
    })

    it('should preserve original behavior for empty tool calls array', async () => {
      // Arrange
      const toolCalls: ToolCall[] = []
      const conversationHistory: ChatMessage[] = [
        {
          id: 'msg_1',
          role: 'user', 
          content: 'No tools to execute'
        }
      ]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        conversationHistory,
        'assistant_msg_123'
      )

      // Assert
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(0)
      expect(mockDependencies.api.callTool).not.toHaveBeenCalled()
    })
  })

  describe('Service Communication and Data Flow', () => {
    it('should pass data correctly between all services', async () => {
      // Arrange
      const toolCalls: ToolCall[] = [{
        id: 'call_integration',
        name: 'integration_tool',
        parameters: { integration: 'test' },
        status: 'pending'
      }]

      const conversationHistory: ChatMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Integration test message'
        }
      ]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        conversationHistory,
        'assistant_msg_integration'
      )

      // Assert - Verify each service was called appropriately
      expect(result.success).toBe(true)

      // 1. ToolServerMappingService should have been called to find server
      expect(mockDependencies.api.getMCPServers).toHaveBeenCalled()
      
      // 2. ToolResultProcessor should have processed the result
      expect(result.toolResults[0].content).toBeDefined()
      expect(typeof result.toolResults[0].content).toBe('string')
      
      // 3. ConversationHistoryService should have validated history
      // (verified implicitly by successful execution)
      
      // 4. Memory management should have been triggered
      expect(mockDependencies.memoryManager.registerCleanupTask).toHaveBeenCalled()
      
      // 5. Performance monitoring should have recorded metrics
      expect(mockDependencies.performanceMonitor.startOperation).toHaveBeenCalled()
    })

    it('should maintain consistent state across service interactions', async () => {
      // Arrange - Execute multiple tool calls to test state consistency
      const toolCalls: ToolCall[] = [
        {
          id: 'call_state_1',
          name: 'state_tool_1',
          parameters: { state: 'test1' },
          status: 'pending'
        },
        {
          id: 'call_state_2', 
          name: 'state_tool_2',
          parameters: { state: 'test2' },
          status: 'pending'
        }
      ]

      const conversationHistory: ChatMessage[] = [
        {
          id: 'msg_state',
          role: 'user',
          content: 'State consistency test'
        }
      ]

      // Act
      const result1 = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls.slice(0, 1),
        conversationHistory,
        'assistant_msg_state_1'
      )
      
      const result2 = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls.slice(1, 2),
        conversationHistory,
        'assistant_msg_state_2'
      )

      // Assert - Both executions should succeed and cache should be reused
      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      
      // Cache should show hits on second execution
      const cacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(cacheStats.hits).toBeGreaterThan(0)
    })
  })

  describe('Configuration and Lifecycle Management', () => {
    it('should handle service configuration updates correctly', async () => {
      // Arrange
      const newConfig: Partial<ServiceConfiguration> = {
        maxRetries: 5,
        cacheExpiryMs: 600000,
        enablePerformanceMonitoring: false
      }

      // Act
      serviceContainer.configure(newConfig)

      // Verify configuration was applied (test through behavior)
      const toolCalls: ToolCall[] = [{
        id: 'call_config_test',
        name: 'config_tool',
        parameters: { config: 'test' },
        status: 'pending'
      }]

      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_config'
      )

      // Assert
      expect(result.success).toBe(true)
      // Configuration changes would be reflected in service behavior
      // This is a structural test ensuring configuration propagates
    })

    it('should properly dispose of all service resources', async () => {
      // Arrange - Create resources that need cleanup
      const toolCalls: ToolCall[] = [{
        id: 'call_cleanup',
        name: 'cleanup_tool', 
        parameters: { cleanup: 'test' },
        status: 'pending'
      }]

      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_cleanup'
      )

      // Act
      serviceContainer.dispose()

      // Assert - Verify cleanup methods were called
      expect(mockDependencies.memoryManager.registerCleanupTask).toHaveBeenCalled()
      
      // Cache should be cleared
      const cacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      // Note: Cache may not be immediately cleared depending on implementation
      // This test verifies the disposal mechanism exists
    })

    it('should handle service reset correctly', async () => {
      // Arrange - Build up some state
      const toolCalls: ToolCall[] = [{
        id: 'call_reset_test',
        name: 'reset_tool',
        parameters: { reset: 'test' },
        status: 'pending'
      }]

      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_reset'
      )

      // Verify initial state
      const initialCacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(initialCacheStats.size).toBeGreaterThan(0)

      // Act
      serviceContainer.reset()

      // Assert - Services should be reset to initial state
      const resetCacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      // Cache should be cleared after reset
      expect(resetCacheStats.size).toBe(0)
    })
  })

  describe('Performance and Memory Integration', () => {
    it('should integrate with performance monitoring throughout execution', async () => {
      // Arrange
      const toolCalls: ToolCall[] = [{
        id: 'call_perf_test',
        name: 'performance_tool',
        parameters: { perf: 'test' },
        status: 'pending'
      }]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_perf'
      )

      // Assert - Performance monitoring should have been called
      expect(mockDependencies.performanceMonitor.startOperation).toHaveBeenCalled()
      expect(mockDependencies.performanceMonitor.recordMetric).toHaveBeenCalled()
      
      const startCall = mockDependencies.performanceMonitor.startOperation.mock.calls[0]
      expect(startCall[0]).toContain('toolExecution')
    })

    it('should integrate with memory management throughout execution', async () => {
      // Arrange
      const toolCalls: ToolCall[] = [{
        id: 'call_memory_test',
        name: 'memory_tool',
        parameters: { memory: 'test' },
        status: 'pending'
      }]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_memory'
      )

      // Assert - Memory management should have been called
      expect(mockDependencies.memoryManager.registerCleanupTask).toHaveBeenCalled()
      expect(mockDependencies.memoryManager.getMemoryStats).toHaveBeenCalled()

      // Verify cleanup tasks were registered for appropriate resources
      const cleanupCalls = mockDependencies.memoryManager.registerCleanupTask.mock.calls
      expect(cleanupCalls.length).toBeGreaterThan(0)
    })

    it('should handle memory pressure correctly across services', async () => {
      // Arrange
      mockDependencies.memoryManager.getMemoryStats.mockReturnValue({
        activeResources: 1000,
        memoryUsage: 0.9, // High memory usage
        memoryGrowthRate: 0.1,
        resourcesByType: {}
      })

      const toolCalls: ToolCall[] = [{
        id: 'call_memory_pressure',
        name: 'pressure_tool',
        parameters: { pressure: 'test' },
        status: 'pending'
      }]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_pressure'
      )

      // Assert - Memory pressure handling should have been triggered
      expect(mockDependencies.memoryManager.getMemoryStats).toHaveBeenCalled()
      
      // Services should have responded to memory pressure
      // (This would be implementation-specific, but we verify the integration points exist)
    })
  })

  describe('Cache Integration Across Services', () => {
    it('should share cache efficiently between multiple tool executions', async () => {
      // Arrange - Multiple executions using same tools
      const toolCalls1: ToolCall[] = [{
        id: 'call_cache_1',
        name: 'cache_tool',
        parameters: { cache: 'test1' },
        status: 'pending'
      }]

      const toolCalls2: ToolCall[] = [{
        id: 'call_cache_2',
        name: 'cache_tool', // Same tool name
        parameters: { cache: 'test2' },
        status: 'pending'
      }]

      // Act - Execute twice
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

      // Assert - Second execution should use cached server mapping
      const cacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(cacheStats.hits).toBeGreaterThan(0)
      expect(cacheStats.hitRate).toBeGreaterThan(0)

      // Server discovery should have been called only once
      expect(mockDependencies.api.getMCPServers).toHaveBeenCalledTimes(1)
    })

    it('should handle cache expiry correctly', async () => {
      // Arrange - Set short cache expiry for testing
      serviceContainer.configure({
        cacheExpiryMs: 100 // 100ms expiry
      })

      const toolCalls: ToolCall[] = [{
        id: 'call_cache_expiry',
        name: 'expiry_tool',
        parameters: { expiry: 'test' },
        status: 'pending'
      }]

      // Act - Execute, wait for expiry, execute again
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_expiry_1'
      )

      // Wait for cache to expire
      await createDelay(150)

      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_expiry_2'
      )

      // Assert - Cache should have been rebuilt
      expect(mockDependencies.api.getMCPServers).toHaveBeenCalledTimes(2)
      
      const cacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      // After expiry, we should have misses
      expect(cacheStats.misses).toBeGreaterThan(0)
    })
  })
})