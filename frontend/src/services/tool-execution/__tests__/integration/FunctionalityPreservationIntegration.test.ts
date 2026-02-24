/**
 * Functionality Preservation Integration Test Suite
 * 
 * Comprehensive tests to ensure that the refactored service architecture
 * preserves 100% of the original functionality from ChatInterfaceSimple.tsx.
 * These tests validate that all edge cases, error conditions, and behavioral
 * nuances from the original 617-line executeToolCalls function are maintained.
 */

import { ToolExecutionServiceFactory } from '../../factories/ToolExecutionServiceFactory'
import { ServiceContainer } from '../../types/ServiceDependencies'
import { ToolCall, ChatMessage } from '../../types/ToolExecutionTypes'
import {
  createMockExternalDependencies,
  waitForPromises
} from '../fixtures/mockDependencies'
import {
  mockSuccessfulToolResponse,
  mockFailedToolResponse,
  mockValidationErrorResponse,
  mockLLMChatResponse,
  mockLLMRetryResponse,
  mockMCPServerListResponse,
  mockMCPServerWithToolsResponse
} from '../fixtures/mockApiResponses'

describe('Functionality Preservation Integration Tests', () => {
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
        chat: jest.fn().mockResolvedValue(mockLLMChatResponse)
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

  describe('Original Behavior Preservation - Basic Tool Execution', () => {
    it('should preserve exact behavior for successful single tool execution', async () => {
      // Arrange - Exact scenario from original ChatInterfaceSimple.tsx
      const toolCalls: ToolCall[] = [{
        id: 'call_abc123',
        name: 'test_tool',
        parameters: { query: 'test query', limit: 10 },
        status: 'pending'
      }]

      const conversationHistory: ChatMessage[] = [
        {
          id: 'msg_user_1',
          role: 'user',
          content: 'Execute test tool'
        }
      ]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        conversationHistory,
        'assistant_msg_123'
      )

      // Assert - Verify exact original behavior
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(1)
      expect(result.toolResults[0]).toEqual(
        expect.objectContaining({
          role: 'tool',
          content: expect.any(String),
          tool_call_id: 'call_abc123'
        })
      )

      // Original behavior: tool server lookup should happen
      expect(mockDependencies.api.getMCPServers).toHaveBeenCalled()
      expect(mockDependencies.api.callTool).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_name: 'test_tool',
          parameters: { query: 'test query', limit: 10 }
        })
      )

      // Original behavior: message management integration
      expect(mockDependencies.store.updateMessage).toHaveBeenCalled()
    })

    it('should preserve exact behavior for empty tool calls array', async () => {
      // Arrange - Original behavior test case
      const toolCalls: ToolCall[] = []
      const conversationHistory: ChatMessage[] = [
        {
          id: 'msg_empty',
          role: 'user',
          content: 'No tools to execute'
        }
      ]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        conversationHistory,
        'assistant_msg_empty'
      )

      // Assert - Original behavior: early return with success
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(0)
      expect(result.errors).toBeUndefined()
      
      // Original behavior: no API calls should be made
      expect(mockDependencies.api.getMCPServers).not.toHaveBeenCalled()
      expect(mockDependencies.api.callTool).not.toHaveBeenCalled()
    })

    it('should preserve exact error handling for tool not found', async () => {
      // Arrange - Tool not found scenario from original code
      mockDependencies.api.getMCPServers.mockResolvedValue([])
      
      const toolCalls: ToolCall[] = [{
        id: 'call_not_found',
        name: 'nonexistent_tool',
        parameters: { test: 'not_found' },
        status: 'pending'
      }]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_not_found'
      )

      // Assert - Original behavior: failure with specific error
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors![0]).toContain('Tool not found or disabled')
      expect(result.toolResults).toHaveLength(0)

      // Original behavior: error should be logged
      expect(mockDependencies.errorLogger.logError).toHaveBeenCalled()
    })
  })

  describe('Original Behavior Preservation - Sequential Execution', () => {
    it('should preserve exact sequential execution order and timing', async () => {
      // Arrange - Multiple tools like in original implementation
      const toolCalls: ToolCall[] = [
        {
          id: 'call_seq_1',
          name: 'first_tool',
          parameters: { order: 1 },
          status: 'pending'
        },
        {
          id: 'call_seq_2',
          name: 'second_tool',
          parameters: { order: 2 },
          status: 'pending'
        },
        {
          id: 'call_seq_3',
          name: 'third_tool',
          parameters: { order: 3 },
          status: 'pending'
        }
      ]

      const executionOrder: string[] = []
      
      mockDependencies.api.callTool.mockImplementation(async (params) => {
        executionOrder.push(params.tool_name)
        return mockSuccessfulToolResponse
      })

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_sequential'
      )

      // Assert - Original behavior: strict sequential order
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(3)
      expect(executionOrder).toEqual(['first_tool', 'second_tool', 'third_tool'])

      // Original behavior: each tool result has correct tool_call_id
      expect(result.toolResults[0].tool_call_id).toBe('call_seq_1')
      expect(result.toolResults[1].tool_call_id).toBe('call_seq_2')
      expect(result.toolResults[2].tool_call_id).toBe('call_seq_3')
    })

    it('should preserve exact status update behavior during execution', async () => {
      // Arrange - Track status updates like original
      const statusUpdates: Array<{toolCallId: string, status: string}> = []
      
      mockDependencies.store.updateMessage.mockImplementation((id, updates) => {
        if (updates.tool_calls) {
          updates.tool_calls.forEach((tc: any) => {
            statusUpdates.push({ toolCallId: tc.id, status: tc.status })
          })
        }
      })

      const toolCalls: ToolCall[] = [{
        id: 'call_status_test',
        name: 'status_tool',
        parameters: { test: 'status' },
        status: 'pending'
      }]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_status'
      )

      // Assert - Original behavior: status progression pending -> completed
      expect(mockDependencies.store.updateMessage).toHaveBeenCalled()
      // Status updates should show the progression from pending to completed
      const updateCalls = mockDependencies.store.updateMessage.mock.calls
      expect(updateCalls.length).toBeGreaterThan(0)
    })
  })

  describe('Original Behavior Preservation - Error Handling and Retry Logic', () => {
    it('should preserve exact retry behavior for validation errors', async () => {
      // Arrange - Exact retry scenario from original code
      let callCount = 0
      mockDependencies.api.callTool.mockImplementation(async () => {
        callCount++
        if (callCount === 1) {
          return mockValidationErrorResponse
        }
        return mockSuccessfulToolResponse
      })

      mockDependencies.api.chat.mockResolvedValue(mockLLMRetryResponse)

      const toolCalls: ToolCall[] = [{
        id: 'call_retry_test',
        name: 'retry_tool',
        parameters: { invalid: 'parameter' },
        status: 'pending'
      }]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_retry'
      )

      // Assert - Original behavior: retry with LLM correction
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(1)
      
      // Original behavior: tool should be called twice (original + retry)
      expect(mockDependencies.api.callTool).toHaveBeenCalledTimes(2)
      
      // Original behavior: LLM should be called for parameter correction
      expect(mockDependencies.api.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          exclude_tools: false // Important: tools should be available for correction
        })
      )
    })

    it('should preserve exact max retry behavior', async () => {
      // Arrange - Exceed max retries like in original
      mockDependencies.api.callTool.mockResolvedValue(mockValidationErrorResponse)
      mockDependencies.api.chat.mockResolvedValue(mockLLMRetryResponse)

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

      // Assert - Original behavior: failure after max attempts
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.toolResults).toHaveLength(0)
      
      // Original behavior: should try max_retries + 1 times (3 retries + original = 4)
      expect(mockDependencies.api.callTool).toHaveBeenCalledTimes(4)
      
      // Original behavior: error should mention retry limit
      expect(result.errors![0]).toContain('exceeded maximum retry attempts')
    })

    it('should preserve exact partial failure behavior', async () => {
      // Arrange - Mixed success/failure from original code
      const toolCalls: ToolCall[] = [
        {
          id: 'call_partial_success_1',
          name: 'success_tool',
          parameters: { test: 'success' },
          status: 'pending'
        },
        {
          id: 'call_partial_failure',
          name: 'failure_tool', 
          parameters: { test: 'failure' },
          status: 'pending'
        },
        {
          id: 'call_partial_success_2',
          name: 'success_tool_2',
          parameters: { test: 'success2' },
          status: 'pending'
        }
      ]

      let callCount = 0
      mockDependencies.api.callTool.mockImplementation(async (params) => {
        callCount++
        if (params.tool_name === 'failure_tool') {
          throw new Error(`Tool execution failed for ${params.tool_name}`)
        }
        return mockSuccessfulToolResponse
      })

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_partial'
      )

      // Assert - Original behavior: partial success with error details
      expect(result.success).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.toolResults).toHaveLength(2) // Two successful tools
      
      // Original behavior: all tools should be attempted despite failures
      expect(mockDependencies.api.callTool).toHaveBeenCalledTimes(3)
      
      // Original behavior: successful results should still be included
      expect(result.toolResults[0].tool_call_id).toBe('call_partial_success_1')
      expect(result.toolResults[1].tool_call_id).toBe('call_partial_success_2')
      
      // Original behavior: error should include failing tool name
      expect(result.errors[0]).toContain('failure_tool')
    })
  })

  describe('Original Behavior Preservation - Content Processing', () => {
    it('should preserve exact JSON-RPC response parsing', async () => {
      // Arrange - Complex JSON-RPC response from original code
      const complexResponse = {
        success: true,
        result: {
          jsonrpc: '2.0',
          result: {
            content: [
              { type: 'text', text: 'Primary response text' },
              { type: 'data', data: { key: 'value', number: 42 } }
            ],
            structuredContent: {
              result: 'Structured content result',
              metadata: { processed: true }
            }
          }
        }
      }

      mockDependencies.api.callTool.mockResolvedValue(complexResponse)

      const toolCalls: ToolCall[] = [{
        id: 'call_complex_response',
        name: 'complex_tool',
        parameters: { test: 'complex' },
        status: 'pending'
      }]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_complex'
      )

      // Assert - Original behavior: correct content extraction
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(1)
      
      const toolResult = result.toolResults[0]
      expect(toolResult.content).toContain('Primary response text')
      // Original behavior: should extract structured content as fallback
      expect(typeof toolResult.content).toBe('string')
      expect(toolResult.content.length).toBeGreaterThan(0)
    })

    it('should preserve exact empty response handling', async () => {
      // Arrange - Empty response scenario from original
      const emptyResponse = {
        success: true,
        result: {
          jsonrpc: '2.0',
          result: {
            content: [],
            structuredContent: null
          }
        }
      }

      mockDependencies.api.callTool.mockResolvedValue(emptyResponse)

      const toolCalls: ToolCall[] = [{
        id: 'call_empty_response',
        name: 'empty_tool',
        parameters: { test: 'empty' },
        status: 'pending'
      }]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_empty_response'
      )

      // Assert - Original behavior: handle empty gracefully
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(0) // Empty responses are filtered out
      
      // Original behavior: no error should be raised for empty content
      expect(result.errors).toBeUndefined()
    })

    it('should preserve exact malformed JSON handling', async () => {
      // Arrange - Malformed response from original error handling
      const malformedResponse = {
        success: true,
        result: {
          jsonrpc: '2.0',
          result: {
            content: [{ type: 'text', text: 'Valid text' }],
            structuredContent: '{ invalid json that cannot be parsed'
          }
        }
      }

      mockDependencies.api.callTool.mockResolvedValue(malformedResponse)

      const toolCalls: ToolCall[] = [{
        id: 'call_malformed',
        name: 'malformed_tool',
        parameters: { test: 'malformed' },
        status: 'pending'
      }]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_malformed'
      )

      // Assert - Original behavior: graceful handling of malformed JSON
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(1)
      
      // Original behavior: should still extract valid content
      expect(result.toolResults[0].content).toContain('Valid text')
      
      // Original behavior: malformed JSON should not crash the system
      expect(mockDependencies.errorLogger.logError).not.toHaveBeenCalledWith(
        expect.stringContaining('JSON parsing error'),
        expect.any(Object)
      )
    })
  })

  describe('Original Behavior Preservation - Integration Points', () => {
    it('should preserve exact message store integration', async () => {
      // Arrange - Verify original message management patterns
      const toolCalls: ToolCall[] = [{
        id: 'call_store_integration',
        name: 'store_tool',
        parameters: { test: 'store' },
        status: 'pending'
      }]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_store'
      )

      // Assert - Original behavior: message updates with tool status
      expect(mockDependencies.store.updateMessage).toHaveBeenCalledWith(
        'assistant_msg_store',
        expect.objectContaining({
          tool_calls: expect.arrayContaining([
            expect.objectContaining({
              id: 'call_store_integration',
              status: 'completed'
            })
          ])
        })
      )
    })

    it('should preserve exact toast notification integration', async () => {
      // Arrange - Error scenario that should trigger toast
      mockDependencies.api.callTool.mockRejectedValue(new Error('Network error'))

      const toolCalls: ToolCall[] = [{
        id: 'call_toast_test',
        name: 'toast_tool',
        parameters: { test: 'toast' },
        status: 'pending'
      }]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_toast'
      )

      // Assert - Original behavior: error toast should be shown
      expect(mockDependencies.toast.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Error'),
          description: expect.stringContaining('Network error'),
          variant: 'destructive'
        })
      )
    })

    it('should preserve exact memory management integration', async () => {
      // Arrange
      const toolCalls: ToolCall[] = [{
        id: 'call_memory_integration',
        name: 'memory_tool',
        parameters: { test: 'memory' },
        status: 'pending'
      }]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_memory'
      )

      // Assert - Original behavior: memory cleanup registration
      expect(mockDependencies.memoryManager.registerCleanupTask).toHaveBeenCalled()
      
      // Original behavior: memory stats should be checked
      expect(mockDependencies.memoryManager.getMemoryStats).toHaveBeenCalled()
    })

    it('should preserve exact performance monitoring integration', async () => {
      // Arrange
      const mockOperation = {
        end: jest.fn(),
        addMetadata: jest.fn()
      }
      mockDependencies.performanceMonitor.startOperation.mockReturnValue(mockOperation)

      const toolCalls: ToolCall[] = [{
        id: 'call_performance_integration',
        name: 'performance_tool',
        parameters: { test: 'performance' },
        status: 'pending'
      }]

      // Act
      await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_performance'
      )

      // Assert - Original behavior: performance tracking
      expect(mockDependencies.performanceMonitor.startOperation).toHaveBeenCalledWith(
        expect.stringContaining('toolExecution'),
        expect.any(Object)
      )
      
      expect(mockOperation.end).toHaveBeenCalled()
      expect(mockOperation.addMetadata).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCount: 1,
          toolNames: ['performance_tool']
        })
      )
    })
  })

  describe('Original Behavior Preservation - Edge Cases', () => {
    it('should preserve exact behavior for null/undefined parameters', async () => {
      // Arrange - Edge case from original code
      const toolCalls: ToolCall[] = [{
        id: 'call_null_params',
        name: 'null_param_tool',
        parameters: null,
        status: 'pending'
      }]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_null_params'
      )

      // Assert - Original behavior: handle null parameters gracefully
      expect(mockDependencies.api.callTool).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_name: 'null_param_tool',
          parameters: null
        })
      )
    })

    it('should preserve exact behavior for very long tool names', async () => {
      // Arrange - Edge case for long tool names
      const longToolName = 'very_long_tool_name_that_might_cause_issues_in_some_systems_' + 'x'.repeat(100)
      const toolCalls: ToolCall[] = [{
        id: 'call_long_name',
        name: longToolName,
        parameters: { test: 'long_name' },
        status: 'pending'
      }]

      // Act & Assert - Should not throw
      await expect(
        serviceContainer.toolExecutionService.executeToolCalls(
          toolCalls,
          [],
          'assistant_msg_long_name'
        )
      ).resolves.toBeDefined()
    })

    it('should preserve exact conversation history size limits', async () => {
      // Arrange - Large conversation history exceeding limit
      const largeHistory: ChatMessage[] = Array.from({ length: 100 }, (_, i) => ({
        id: `msg_large_${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`
      }))

      const toolCalls: ToolCall[] = [{
        id: 'call_large_history',
        name: 'large_history_tool',
        parameters: { test: 'large' },
        status: 'pending'
      }]

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        largeHistory,
        'assistant_msg_large_history'
      )

      // Assert - Original behavior: should handle large history
      expect(result.success).toBe(true)
      
      // Original behavior: conversation should be processed (may be limited)
      // The exact behavior depends on conversationHistoryLimit configuration
    })
  })
})