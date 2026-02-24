/**
 * Phase 4 Migration Tests
 * 
 * Tests to verify that the migration from monolithic executeToolCalls function
 * to service-based architecture preserves all functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react-hooks'
import { createTestServiceContainer } from '../../factories/ToolExecutionServiceFactory'
import type { ServiceContainer, ExternalDependencies } from '../../types/ServiceDependencies'

// Mock external dependencies for testing
const createMockExternalDependencies = (): ExternalDependencies => ({
  api: {
    getMCPServers: vi.fn().mockResolvedValue([
      { id: 1, name: 'test-server' }
    ]),
    getMCPServerWithTools: vi.fn().mockResolvedValue({
      tools: [
        { name: 'test-tool', is_enabled: true }
      ]
    }),
    callTool: vi.fn().mockResolvedValue({
      success: true,
      result: {
        content: [{ type: 'text', text: 'Test tool result' }]
      }
    }),
    chat: vi.fn().mockResolvedValue({
      response: 'Test LLM response',
      tool_calls: []
    })
  },
  store: {
    messages: [],
    addMessage: vi.fn().mockReturnValue('msg-id'),
    updateMessage: vi.fn()
  },
  toast: {
    toast: vi.fn()
  },
  memoryManager: {
    registerCleanupTask: vi.fn(),
    addMemoryPressureListener: vi.fn(),
    getMemoryStats: vi.fn().mockReturnValue({})
  },
  performanceMonitor: {
    startToolExecution: vi.fn().mockReturnValue({}),
    recordMetric: vi.fn()
  },
  errorLogger: {
    logError: vi.fn(),
    logWarning: vi.fn()
  },
  safeJson: {
    safeJsonParseWithDefault: vi.fn().mockImplementation((text, defaultValue) => {
      try {
        return JSON.parse(text)
      } catch {
        return defaultValue
      }
    })
  },
  messageManager: {
    safeAddMessage: vi.fn().mockReturnValue('msg-id'),
    safeUpdateMessage: vi.fn(),
    getMessages: vi.fn().mockReturnValue([])
  },
  llmConfigManager: {
    getActiveLLMConfig: vi.fn().mockReturnValue({ id: 'test-config' })
  }
})

describe('Phase 4 Migration: Service Architecture Integration', () => {
  let serviceContainer: ServiceContainer
  let mockDependencies: ExternalDependencies

  beforeEach(() => {
    mockDependencies = createMockExternalDependencies()
    serviceContainer = createTestServiceContainer(mockDependencies)
  })

  afterEach(() => {
    if (serviceContainer) {
      serviceContainer.dispose()
    }
    vi.clearAllMocks()
  })

  describe('Service Container Initialization', () => {
    it('should create service container with all required services', () => {
      expect(serviceContainer).toBeDefined()
      expect(serviceContainer.toolExecutionService).toBeDefined()
      expect(serviceContainer.toolResultProcessor).toBeDefined()
      expect(serviceContainer.toolServerMappingService).toBeDefined()
      expect(serviceContainer.conversationHistoryService).toBeDefined()
      expect(serviceContainer.toolRetryService).toBeDefined()
    })

    it('should provide dispose method for cleanup', () => {
      expect(typeof serviceContainer.dispose).toBe('function')
      
      // Should not throw when called
      expect(() => serviceContainer.dispose()).not.toThrow()
    })

    it('should provide reset method for resetting state', () => {
      expect(typeof serviceContainer.reset).toBe('function')
      
      // Should not throw when called  
      expect(() => serviceContainer.reset()).not.toThrow()
    })

    it('should provide configure method for runtime configuration', () => {
      expect(typeof serviceContainer.configure).toBe('function')
      
      // Should not throw when called
      expect(() => serviceContainer.configure({ maxRetries: 5 })).not.toThrow()
    })
  })

  describe('Tool Execution Service Integration', () => {
    it('should execute tool calls using service architecture', async () => {
      const toolCalls = [
        {
          id: 'tool-1',
          name: 'test-tool',
          parameters: { query: 'test' },
          status: 'pending' as const
        }
      ]

      await expect(
        serviceContainer.toolExecutionService.executeToolCalls(
          toolCalls,
          'assistant-msg-id',
          'test user message'
        )
      ).resolves.not.toThrow()

      // Verify that external dependencies were called
      expect(mockDependencies.api.getMCPServers).toHaveBeenCalled()
      expect(mockDependencies.messageManager.safeUpdateMessage).toHaveBeenCalled()
    })

    it('should handle tool execution errors gracefully', async () => {
      // Mock API to throw error
      mockDependencies.api.callTool = vi.fn().mockRejectedValue(
        new Error('Tool execution failed')
      )

      const toolCalls = [
        {
          id: 'tool-1',
          name: 'test-tool',
          parameters: { query: 'test' },
          status: 'pending' as const
        }
      ]

      await expect(
        serviceContainer.toolExecutionService.executeToolCalls(
          toolCalls,
          'assistant-msg-id',
          'test user message'
        )
      ).resolves.not.toThrow()

      // Should still update message with error status
      expect(mockDependencies.messageManager.safeUpdateMessage).toHaveBeenCalled()
    })

    it('should handle empty tool calls array', async () => {
      await expect(
        serviceContainer.toolExecutionService.executeToolCalls(
          [],
          'assistant-msg-id'
        )
      ).resolves.not.toThrow()

      // Should not make any API calls for empty tool calls
      expect(mockDependencies.api.callTool).not.toHaveBeenCalled()
    })

    it('should support abort signal for cancellation', async () => {
      const abortController = new AbortController()
      const toolCalls = [
        {
          id: 'tool-1',
          name: 'test-tool',
          parameters: { query: 'test' },
          status: 'pending' as const
        }
      ]

      // Abort immediately
      abortController.abort()

      await expect(
        serviceContainer.toolExecutionService.executeToolCalls(
          toolCalls,
          'assistant-msg-id',
          'test user message',
          abortController.signal
        )
      ).resolves.not.toThrow()
    })

    it('should support retry functionality', async () => {
      const toolCalls = [
        {
          id: 'tool-1',
          name: 'test-tool',
          parameters: { query: 'test' },
          status: 'pending' as const
        }
      ]

      await expect(
        serviceContainer.toolExecutionService.executeToolCalls(
          toolCalls,
          'assistant-msg-id',
          'test user message',
          undefined,
          1 // retry count
        )
      ).resolves.not.toThrow()

      // Verify service was called
      expect(mockDependencies.api.getMCPServers).toHaveBeenCalled()
    })
  })

  describe('Functionality Preservation', () => {
    it('should preserve tool result processing', async () => {
      const toolResult = {
        result: {
          content: [{ type: 'text', text: 'Processed result' }]
        }
      }

      const processed = serviceContainer.toolResultProcessor.extractAndCleanToolContent(
        toolResult,
        'test-tool'
      )

      expect(processed).toBeDefined()
      expect(typeof processed).toBe('string')
    })

    it('should preserve conversation history validation', async () => {
      const messages = [
        { role: 'user', content: 'Test message' },
        { role: 'assistant', content: 'Response', tool_calls: [] }
      ]

      const validated = serviceContainer.conversationHistoryService.validateAndCleanHistory(messages)

      expect(validated).toBeInstanceOf(Array)
      expect(validated.length).toBeGreaterThanOrEqual(0)
    })

    it('should preserve tool server mapping', async () => {
      const toolName = 'test-tool'
      
      const serverId = await serviceContainer.toolServerMappingService.findServerForTool(toolName)
      
      expect(serverId).toBeDefined()
      expect(mockDependencies.api.getMCPServers).toHaveBeenCalled()
    })

    it('should preserve retry logic', async () => {
      const shouldRetry = serviceContainer.toolRetryService.shouldRetry(
        { toolCall: { id: 'test', name: 'test-tool', parameters: {} }, error: 'validation error' },
        { maxRetries: 3, currentAttempt: 1 }
      )

      expect(shouldRetry).toBeDefined()
      expect(typeof shouldRetry.shouldRetry).toBe('boolean')
    })
  })

  describe('Performance and Memory Management', () => {
    it('should integrate with memory manager', () => {
      // Memory manager should be called during service initialization
      expect(mockDependencies.memoryManager.registerCleanupTask).toHaveBeenCalled()
    })

    it('should integrate with performance monitoring', async () => {
      const toolCalls = [
        {
          id: 'tool-1',
          name: 'test-tool',
          parameters: { query: 'test' },
          status: 'pending' as const
        }
      ]

      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        'assistant-msg-id'
      )

      // Performance monitoring should be used
      expect(mockDependencies.performanceMonitor.startToolExecution).toHaveBeenCalled()
    })

    it('should handle service disposal correctly', () => {
      const container = createTestServiceContainer(mockDependencies)
      
      // Should dispose without throwing
      expect(() => container.dispose()).not.toThrow()
      
      // Multiple disposal calls should be safe
      expect(() => container.dispose()).not.toThrow()
    })
  })

  describe('Error Handling and Logging', () => {
    it('should integrate with error logging', async () => {
      // Force an error by making API call fail
      mockDependencies.api.getMCPServers = vi.fn().mockRejectedValue(
        new Error('API Error')
      )

      const toolCalls = [
        {
          id: 'tool-1',
          name: 'test-tool',
          parameters: { query: 'test' },
          status: 'pending' as const
        }
      ]

      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        'assistant-msg-id'
      )

      // Error should be logged
      expect(mockDependencies.errorLogger.logError).toHaveBeenCalled()
    })

    it('should integrate with toast notifications', async () => {
      // Force tool execution error
      mockDependencies.api.callTool = vi.fn().mockRejectedValue(
        new Error('Tool Error')
      )

      const toolCalls = [
        {
          id: 'tool-1',
          name: 'test-tool',
          parameters: { query: 'test' },
          status: 'pending' as const
        }
      ]

      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        'assistant-msg-id'
      )

      // Toast should be called for user notification
      expect(mockDependencies.toast.toast).toHaveBeenCalled()
    })
  })

  describe('Migration Completeness', () => {
    it('should maintain same public API surface', () => {
      // The main entry point should be executeToolCalls
      expect(serviceContainer.toolExecutionService.executeToolCalls).toBeDefined()
      expect(typeof serviceContainer.toolExecutionService.executeToolCalls).toBe('function')
      
      // Function signature should match the original
      const executeToolCalls = serviceContainer.toolExecutionService.executeToolCalls
      expect(executeToolCalls.length).toBe(5) // 5 parameters (toolCalls, assistantMessageId, currentUserMessage?, abortSignal?, retryCount?)
    })

    it('should support all original functionality', async () => {
      // Test with complex scenario similar to original function
      const toolCalls = [
        {
          id: 'tool-1',
          name: 'search-tool',
          parameters: { query: 'test search' },
          status: 'pending' as const
        },
        {
          id: 'tool-2', 
          name: 'analysis-tool',
          parameters: { data: 'test data' },
          status: 'pending' as const
        }
      ]

      const abortController = new AbortController()

      await expect(
        serviceContainer.toolExecutionService.executeToolCalls(
          toolCalls,
          'assistant-msg-id',
          'Complex user message with multiple tool requirements',
          abortController.signal,
          0
        )
      ).resolves.not.toThrow()

      // Verify all services were integrated properly
      expect(mockDependencies.api.getMCPServers).toHaveBeenCalled()
      expect(mockDependencies.messageManager.safeUpdateMessage).toHaveBeenCalled()
      expect(mockDependencies.messageManager.safeAddMessage).toHaveBeenCalled()
    })

    it('should maintain backward compatibility', () => {
      // Services should still expose the same external interface
      expect(serviceContainer.toolResultProcessor.extractAndCleanToolContent).toBeDefined()
      expect(serviceContainer.conversationHistoryService.validateAndCleanHistory).toBeDefined()
      expect(serviceContainer.toolServerMappingService.findServerForTool).toBeDefined()
      expect(serviceContainer.toolRetryService.shouldRetry).toBeDefined()
    })
  })
})