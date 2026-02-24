/**
 * Error Handling Integration Test Suite
 * 
 * Tests error propagation, recovery mechanisms, and retry logic
 * across the complete service architecture. Ensures that errors
 * are handled gracefully and recovery mechanisms work correctly.
 */

import { ToolExecutionServiceFactory } from '../../factories/ToolExecutionServiceFactory'
import { ServiceContainer } from '../../types/ServiceDependencies'
import { ToolCall, ChatMessage } from '../../types/ToolExecutionTypes'
import {
  createMockExternalDependencies,
  waitForPromises,
  createDelay
} from '../fixtures/mockDependencies'
import {
  mockFailedToolResponse,
  mockValidationErrorResponse,
  mockLLMRetryResponse,
  mockMCPServerListResponse,
  mockMCPServerWithToolsResponse,
  mockSuccessfulToolResponse
} from '../fixtures/mockApiResponses'

describe('Error Handling Integration Tests', () => {
  let factory: ToolExecutionServiceFactory
  let serviceContainer: ServiceContainer
  let mockDependencies: any

  beforeEach(() => {
    factory = ToolExecutionServiceFactory.getInstance()
    factory.destroyServiceContainer()

    mockDependencies = createMockExternalDependencies({
      api: {
        getMCPServers: jest.fn().mockResolvedValue(mockMCPServerListResponse),
        getMCPServerWithTools: jest.fn().mockResolvedValue(mockMCPServerWithToolsResponse),
        callTool: jest.fn().mockResolvedValue(mockSuccessfulToolResponse),
        chat: jest.fn().mockResolvedValue(mockLLMRetryResponse)
      }
    })

    serviceContainer = factory.createServiceContainer({
      externalDependencies: mockDependencies,
      serviceConfiguration: {
        maxRetries: 3,
        cacheExpiryMs: 300000,
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
  })

  describe('Tool Execution Error Handling', () => {
    it('should handle tool execution failure gracefully', async () => {
      // Arrange
      mockDependencies.api.callTool.mockResolvedValueOnce(mockFailedToolResponse)

      const toolCalls: ToolCall[] = [{
        id: 'call_fail',
        name: 'failing_tool',
        parameters: { test: 'fail' },
        status: 'pending'
      }]

      const conversationHistory: ChatMessage[] = [
        {
          id: 'msg_1',
          role: 'user',
          content: 'Execute failing tool'
        }
      ]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        conversationHistory,
        'assistant_msg_fail'
      )

      // Assert
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
      
      // Error should have been logged
      expect(mockDependencies.errorLogger.logError).toHaveBeenCalled()
      
      // Tool results should be empty for failed execution
      expect(result.toolResults).toHaveLength(0)
    })

    it('should handle network errors during tool execution', async () => {
      // Arrange
      const networkError = new Error('Network connection failed')
      mockDependencies.api.callTool.mockRejectedValueOnce(networkError)

      const toolCalls: ToolCall[] = [{
        id: 'call_network_error',
        name: 'network_tool',
        parameters: { test: 'network' },
        status: 'pending'
      }]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_network'
      )

      // Assert
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      
      // Network error should have been caught and logged
      expect(mockDependencies.errorLogger.logError).toHaveBeenCalledWith(
        expect.stringContaining('Network connection failed'),
        expect.any(Object)
      )
    })

    it('should handle server discovery failures', async () => {
      // Arrange
      const serverError = new Error('Failed to fetch MCP servers')
      mockDependencies.api.getMCPServers.mockRejectedValueOnce(serverError)

      const toolCalls: ToolCall[] = [{
        id: 'call_server_error',
        name: 'server_tool',
        parameters: { test: 'server' },
        status: 'pending'
      }]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_server'
      )

      // Assert
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      
      // Server error should have been handled gracefully
      expect(mockDependencies.errorLogger.logError).toHaveBeenCalled()
      
      // Cache should not be corrupted by the error
      const cacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(cacheStats).toBeDefined()
    })
  })

  describe('Retry Logic Integration', () => {
    it('should retry tool execution with parameter validation errors', async () => {
      // Arrange
      mockDependencies.api.callTool
        .mockResolvedValueOnce(mockValidationErrorResponse)
        .mockResolvedValueOnce(mockSuccessfulToolResponse)

      const toolCalls: ToolCall[] = [{
        id: 'call_retry',
        name: 'retry_tool',
        parameters: { invalid: 'parameter' },
        status: 'pending'
      }]

      const conversationHistory: ChatMessage[] = [
        {
          id: 'msg_retry',
          role: 'user',
          content: 'Execute tool with validation error'
        }
      ]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        conversationHistory,
        'assistant_msg_retry'
      )

      // Assert
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(1)
      
      // Tool should have been called twice (original + retry)
      expect(mockDependencies.api.callTool).toHaveBeenCalledTimes(2)
      
      // LLM should have been called for parameter correction
      expect(mockDependencies.api.chat).toHaveBeenCalled()
      
      // Retry context should have been created and updated
      // (verified through successful execution after retry)
    })

    it('should handle maximum retry attempts exceeded', async () => {
      // Arrange
      mockDependencies.api.callTool.mockResolvedValue(mockValidationErrorResponse)

      const toolCalls: ToolCall[] = [{
        id: 'call_max_retry',
        name: 'max_retry_tool',
        parameters: { always: 'fails' },
        status: 'pending'
      }]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_max_retry'
      )

      // Assert
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      
      // Should have attempted maximum retries (3 + original = 4 total)
      expect(mockDependencies.api.callTool).toHaveBeenCalledTimes(4)
      
      // Final error should indicate retry limit exceeded
      expect(result.errors![0]).toContain('exceeded maximum retry attempts')
    })

    it('should handle LLM errors during retry correction', async () => {
      // Arrange
      mockDependencies.api.callTool.mockResolvedValue(mockValidationErrorResponse)
      mockDependencies.api.chat.mockRejectedValue(new Error('LLM API error'))

      const toolCalls: ToolCall[] = [{
        id: 'call_llm_error',
        name: 'llm_error_tool',
        parameters: { test: 'llm_error' },
        status: 'pending'
      }]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_llm_error'
      )

      // Assert
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      
      // LLM error should have been logged
      expect(mockDependencies.errorLogger.logError).toHaveBeenCalledWith(
        expect.stringContaining('LLM API error'),
        expect.any(Object)
      )
    })
  })

  describe('Error Recovery and Cleanup', () => {
    it('should clean up resources after tool execution errors', async () => {
      // Arrange
      const cleanupError = new Error('Cleanup test error')
      mockDependencies.api.callTool.mockRejectedValue(cleanupError)

      const toolCalls: ToolCall[] = [{
        id: 'call_cleanup_error',
        name: 'cleanup_tool',
        parameters: { test: 'cleanup' },
        status: 'pending'
      }]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_cleanup'
      )

      // Assert
      // Memory cleanup should still be called even after errors
      expect(mockDependencies.memoryManager.registerCleanupTask).toHaveBeenCalled()
      
      // Performance monitoring should still complete
      expect(mockDependencies.performanceMonitor.startOperation).toHaveBeenCalled()
    })

    it('should maintain cache consistency after errors', async () => {
      // Arrange
      // First successful call to populate cache
      await serviceContainer.toolExecutionService.executeToolCalls(
        [{
          id: 'call_cache_populate',
          name: 'cache_tool',
          parameters: { test: 'populate' },
          status: 'pending'
        }],
        [],
        'assistant_msg_populate'
      )

      const initialCacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(initialCacheStats.size).toBeGreaterThan(0)

      // Now cause an error
      mockDependencies.api.callTool.mockRejectedValue(new Error('Cache consistency test error'))

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        [{
          id: 'call_cache_error',
          name: 'cache_tool',
          parameters: { test: 'error' },
          status: 'pending'
        }],
        [],
        'assistant_msg_cache_error'
      )

      // Assert
      // Cache should still be valid after error
      const finalCacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(finalCacheStats.size).toBe(initialCacheStats.size)
      expect(serviceContainer.toolServerMappingService.isCacheValid()).toBe(true)
    })

    it('should handle partial failures in multi-tool execution', async () => {
      // Arrange
      const toolCalls: ToolCall[] = [
        {
          id: 'call_success_1',
          name: 'success_tool_1',
          parameters: { test: 'success1' },
          status: 'pending'
        },
        {
          id: 'call_failure',
          name: 'failure_tool',
          parameters: { test: 'failure' },
          status: 'pending'
        },
        {
          id: 'call_success_2',
          name: 'success_tool_2',
          parameters: { test: 'success2' },
          status: 'pending'
        }
      ]

      // Mock responses: success, failure, success
      mockDependencies.api.callTool
        .mockResolvedValueOnce(mockSuccessfulToolResponse)
        .mockRejectedValueOnce(new Error('Middle tool failed'))
        .mockResolvedValueOnce(mockSuccessfulToolResponse)

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_partial'
      )

      // Assert
      expect(result.success).toBe(false) // Overall failure due to middle tool
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBe(1)
      
      // Should have attempted all tools despite middle failure
      expect(mockDependencies.api.callTool).toHaveBeenCalledTimes(3)
      
      // Should have two successful tool results
      expect(result.toolResults).toHaveLength(2)
      expect(result.toolResults[0].tool_call_id).toBe('call_success_1')
      expect(result.toolResults[1].tool_call_id).toBe('call_success_2')
      
      // Error should specify which tool failed
      expect(result.errors![0]).toContain('failure_tool')
    })
  })

  describe('Error Propagation and Context Preservation', () => {
    it('should preserve error context throughout service chain', async () => {
      // Arrange
      const contextError = new Error('Context preservation test')
      contextError.stack = 'Test stack trace'
      mockDependencies.api.callTool.mockRejectedValue(contextError)

      const toolCalls: ToolCall[] = [{
        id: 'call_context',
        name: 'context_tool',
        parameters: { context: 'test' },
        status: 'pending'
      }]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_context'
      )

      // Assert
      expect(result.success).toBe(false)
      
      // Error should have been logged with context
      expect(mockDependencies.errorLogger.logError).toHaveBeenCalledWith(
        expect.stringContaining('Context preservation test'),
        expect.objectContaining({
          toolName: 'context_tool',
          toolCallId: 'call_context'
        })
      )
    })

    it('should handle cascading errors gracefully', async () => {
      // Arrange
      // Set up a scenario where multiple services encounter errors
      mockDependencies.api.getMCPServers.mockRejectedValue(new Error('Server discovery failed'))
      mockDependencies.api.callTool.mockRejectedValue(new Error('Tool call failed'))
      mockDependencies.memoryManager.getMemoryStats.mockImplementation(() => {
        throw new Error('Memory stats failed')
      })

      const toolCalls: ToolCall[] = [{
        id: 'call_cascade',
        name: 'cascade_tool',
        parameters: { cascade: 'test' },
        status: 'pending'
      }]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_cascade'
      )

      // Assert
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      
      // Multiple errors should have been logged
      expect(mockDependencies.errorLogger.logError).toHaveBeenCalledTimes(1) // Primary error
      
      // Service should still complete gracefully despite cascading errors
      expect(result).toBeDefined()
      expect(result.toolResults).toHaveLength(0)
    })
  })

  describe('Abort Signal Integration', () => {
    it('should handle tool execution cancellation correctly', async () => {
      // Arrange
      const abortController = new AbortController()
      const toolCalls: ToolCall[] = [{
        id: 'call_abort',
        name: 'abort_tool',
        parameters: { test: 'abort' },
        status: 'pending'
      }]

      // Mock a delayed response
      mockDependencies.api.callTool.mockImplementation(() => 
        new Promise((resolve, reject) => {
          setTimeout(() => resolve(mockSuccessfulToolResponse), 1000)
          
          abortController.signal.addEventListener('abort', () => {
            reject(new Error('Operation was aborted'))
          })
        })
      )

      // Act
      const executionPromise = serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_abort',
        { abortSignal: abortController.signal }
      )

      // Abort after a short delay
      setTimeout(() => abortController.abort(), 100)

      const result = await executionPromise

      // Assert
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]).toContain('aborted')
      
      // Abort should trigger cleanup
      expect(mockDependencies.memoryManager.registerCleanupTask).toHaveBeenCalled()
    })
  })
})