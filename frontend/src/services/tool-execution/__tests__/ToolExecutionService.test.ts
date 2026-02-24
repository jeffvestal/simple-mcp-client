/**
 * ToolExecutionService Test Suite
 * 
 * Comprehensive test coverage for the main orchestrator service
 * Tests based on original ChatInterfaceSimple.tsx executeToolCalls function
 */

import { ToolExecutionService } from '../ToolExecutionService'
import { ToolResultProcessor } from '../ToolResultProcessor'
import { ToolServerMappingService } from '../ToolServerMappingService'
import { ConversationHistoryService } from '../ConversationHistoryService'
import { ToolRetryService } from '../ToolRetryService'
import { IToolExecutionService } from '../interfaces/IToolExecutionService'
import { 
  ToolCall,
  ToolExecutionContext,
  ServiceConfiguration,
  TOOL_EXECUTION_CONSTANTS
} from '../types/ToolExecutionTypes'
import { ExternalDependencies } from '../types/ServiceDependencies'
import { 
  createMockExternalDependencies,
  createMockApi,
  createMockMessageManager,
  createMockLLMConfigManager,
  createMockErrorLogger
} from './fixtures/mockDependencies'
import { 
  mockSuccessfulToolResponse,
  mockFailedToolResponse,
  mockLLMChatResponse,
  mockLLMRetryResponse,
  mockMCPServerListResponse,
  mockMCPServerWithToolsResponse
} from './fixtures/mockApiResponses'

// Test utilities
const createToolCall = (
  id: string, 
  name: string, 
  parameters: any = {},
  status: 'pending' | 'completed' | 'error' = 'pending'
): ToolCall => ({
  id,
  name,
  parameters,
  status
})

const createTestService = (
  overrides: Partial<ExternalDependencies> = {},
  config: Partial<ServiceConfiguration> = {}
): {
  service: ToolExecutionService
  mocks: {
    api: ReturnType<typeof createMockApi>
    messageManager: ReturnType<typeof createMockMessageManager>
    llmConfigManager: ReturnType<typeof createMockLLMConfigManager>
    errorLogger: ReturnType<typeof createMockErrorLogger>
  }
  subServices: {
    toolResultProcessor: ToolResultProcessor
    serverMappingService: ToolServerMappingService
    conversationHistoryService: ConversationHistoryService
    toolRetryService: ToolRetryService
  }
} => {
  const mockApi = createMockApi()
  const mockMessageManager = createMockMessageManager()
  const mockLLMConfigManager = createMockLLMConfigManager()
  const mockErrorLogger = createMockErrorLogger()
  
  const externalDependencies = createMockExternalDependencies({
    api: mockApi,
    messageManager: mockMessageManager,
    llmConfigManager: mockLLMConfigManager,
    errorLogger: mockErrorLogger,
    ...overrides
  })

  const serviceConfig: ServiceConfiguration = {
    maxRetries: TOOL_EXECUTION_CONSTANTS.MAX_RETRY_ATTEMPTS,
    cacheExpiryMs: TOOL_EXECUTION_CONSTANTS.TOOL_CACHE_EXPIRY_MS,
    conversationHistoryLimit: TOOL_EXECUTION_CONSTANTS.MAX_CONVERSATION_HISTORY,
    enablePerformanceMonitoring: true,
    enableMemoryTracking: true,
    ...config
  }

  // Create sub-services
  const toolResultProcessor = new ToolResultProcessor(externalDependencies, serviceConfig)
  const serverMappingService = new ToolServerMappingService(externalDependencies, serviceConfig)
  const conversationHistoryService = new ConversationHistoryService(externalDependencies, serviceConfig)
  const toolRetryService = new ToolRetryService(externalDependencies, serviceConfig)

  // Create main service
  const service = new ToolExecutionService(
    externalDependencies,
    serviceConfig,
    toolResultProcessor,
    serverMappingService,
    conversationHistoryService,
    toolRetryService
  )

  return {
    service,
    mocks: {
      api: mockApi,
      messageManager: mockMessageManager,
      llmConfigManager: mockLLMConfigManager,
      errorLogger: mockErrorLogger
    },
    subServices: {
      toolResultProcessor,
      serverMappingService,
      conversationHistoryService,
      toolRetryService
    }
  }
}

describe('ToolExecutionService', () => {
  let testSetup: ReturnType<typeof createTestService>

  beforeEach(() => {
    testSetup = createTestService()
    
    // Setup default API mocks
    testSetup.mocks.api.getMCPServers.mockResolvedValue(mockMCPServerListResponse)
    testSetup.mocks.api.getMCPServerWithTools.mockResolvedValue(mockMCPServerWithToolsResponse)
    testSetup.mocks.api.callTool.mockResolvedValue(mockSuccessfulToolResponse)
    testSetup.mocks.api.chat.mockResolvedValue(mockLLMChatResponse)
  })

  afterEach(() => {
    testSetup.service.cleanup()
  })

  describe('Interface Implementation', () => {
    test('implements IToolExecutionService interface', () => {
      expect(testSetup.service).toBeInstanceOf(ToolExecutionService)
      
      const interfaceMethods: (keyof IToolExecutionService)[] = [
        'executeToolCalls',
        'executeSingleTool',
        'processToolResults',
        'handleToolExecutionError',
        'updateToolExecutionStatus',
        'sendConversationToLLM',
        'getExecutionMetrics',
        'cancelExecution',
        'isExecuting',
        'getCurrentContext',
        'validateToolCalls',
        'cleanup'
      ]
      
      interfaceMethods.forEach(method => {
        expect(typeof testSetup.service[method]).toBe('function')
      })
    })

    test('provides additional utility methods', () => {
      const utilityMethods = ['configure', 'reset']
      
      utilityMethods.forEach(method => {
        expect(testSetup.service).toHaveProperty(method)
        expect(typeof (testSetup.service as any)[method]).toBe('function')
      })
    })
  })

  describe('Tool Call Validation', () => {
    test('validates proper tool calls', () => {
      const toolCalls = [
        createToolCall('tc1', 'search_tool', { query: 'test' }),
        createToolCall('tc2', 'analyze_tool', { data: 'sample' })
      ]
      
      const result = testSetup.service.validateToolCalls(toolCalls)
      
      expect(result.isValid).toBe(true)
      expect(result.validToolCalls).toHaveLength(2)
      expect(result.invalidToolCalls).toHaveLength(0)
    })

    test('identifies tool calls missing ID', () => {
      const toolCalls = [
        { name: 'search_tool', parameters: {}, status: 'pending' } as ToolCall // Missing ID
      ]
      
      const result = testSetup.service.validateToolCalls(toolCalls)
      
      expect(result.isValid).toBe(false)
      expect(result.invalidToolCalls).toHaveLength(1)
      expect(result.invalidToolCalls[0].reason).toContain('Missing tool call ID')
    })

    test('identifies tool calls missing name', () => {
      const toolCalls = [
        { id: 'tc1', parameters: {}, status: 'pending' } as ToolCall // Missing name
      ]
      
      const result = testSetup.service.validateToolCalls(toolCalls)
      
      expect(result.isValid).toBe(false)
      expect(result.invalidToolCalls[0].reason).toContain('Missing tool name')
    })

    test('identifies tool calls missing parameters', () => {
      const toolCalls = [
        { id: 'tc1', name: 'search_tool', status: 'pending' } as ToolCall // Missing parameters
      ]
      
      const result = testSetup.service.validateToolCalls(toolCalls)
      
      expect(result.isValid).toBe(false)
      expect(result.invalidToolCalls[0].reason).toContain('Missing parameters')
    })

    test('validates tool name format', () => {
      const toolCalls = [
        createToolCall('tc1', 'invalid-tool-name!', {}), // Invalid characters
        createToolCall('tc2', 'valid_tool_name', {}),
        createToolCall('tc3', '123invalid', {}) // Starts with number
      ]
      
      const result = testSetup.service.validateToolCalls(toolCalls)
      
      expect(result.validToolCalls).toHaveLength(1)
      expect(result.invalidToolCalls).toHaveLength(2)
      expect(result.invalidToolCalls.every(tc => tc.reason.includes('Invalid tool name format'))).toBe(true)
    })
  })

  describe('Single Tool Execution', () => {
    test('executes single tool successfully', async () => {
      const toolCall = createToolCall('tc1', 'search_documents', { query: 'test' })
      const context: ToolExecutionContext = {
        assistantMessageId: 'msg1',
        retryCount: 0,
        toolCalls: [toolCall]
      }

      const result = await testSetup.service.executeSingleTool(toolCall, context)

      expect(result.success).toBe(true)
      expect(result.updatedToolCall.status).toBe('completed')
      expect(testSetup.mocks.api.callTool).toHaveBeenCalledWith({
        tool_name: 'search_documents',
        parameters: { query: 'test' },
        server_id: expect.any(Number)
      }, undefined)
    })

    test('handles tool not found scenario', async () => {
      // Mock server mapping to return null (tool not found)
      jest.spyOn(testSetup.subServices.serverMappingService, 'findServerForTool')
        .mockResolvedValue(null)

      const toolCall = createToolCall('tc1', 'nonexistent_tool', {})
      const context: ToolExecutionContext = {
        assistantMessageId: 'msg1',
        retryCount: 0,
        toolCalls: [toolCall]
      }

      const result = await testSetup.service.executeSingleTool(toolCall, context)

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found or disabled')
      expect(result.updatedToolCall.status).toBe('error')
    })

    test('handles tool execution API errors', async () => {
      testSetup.mocks.api.callTool.mockResolvedValue(mockFailedToolResponse)

      const toolCall = createToolCall('tc1', 'search_documents', { query: 'test' })
      const context: ToolExecutionContext = {
        assistantMessageId: 'msg1',
        retryCount: 0,
        toolCalls: [toolCall]
      }

      const result = await testSetup.service.executeSingleTool(toolCall, context)

      expect(result.success).toBe(false)
      expect(result.error).toBe(mockFailedToolResponse.error)
      expect(result.updatedToolCall.status).toBe('error')
    })

    test('respects abort signal', async () => {
      const abortController = new AbortController()
      abortController.abort()

      const toolCall = createToolCall('tc1', 'search_documents', {})
      const context: ToolExecutionContext = {
        assistantMessageId: 'msg1',
        retryCount: 0,
        toolCalls: [toolCall],
        abortSignal: abortController.signal
      }

      const result = await testSetup.service.executeSingleTool(toolCall, context)

      expect(result.success).toBe(false)
      expect(result.error).toContain('cancelled')
    })
  })

  describe('Main Tool Execution Flow', () => {
    test('executes empty tool calls without error', async () => {
      await expect(testSetup.service.executeToolCalls([], 'msg1')).resolves.toBeUndefined()
      expect(testSetup.mocks.api.callTool).not.toHaveBeenCalled()
    })

    test('prevents infinite retry loops', async () => {
      const toolCalls = [createToolCall('tc1', 'search_tool', {})]
      
      // Should not execute and should add error messages
      await testSetup.service.executeToolCalls(
        toolCalls, 
        'msg1', 
        undefined, 
        undefined, 
        TOOL_EXECUTION_CONSTANTS.MAX_RETRY_ATTEMPTS // At max retry limit
      )

      expect(testSetup.mocks.messageManager.safeAddMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'tool',
          content: expect.stringContaining('Maximum retry attempts exceeded')
        })
      )
      
      expect(testSetup.mocks.messageManager.safeAddMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('maximum retry limit')
        })
      )
    })

    test('executes successful tool calls and gets LLM response', async () => {
      const toolCalls = [
        createToolCall('tc1', 'search_documents', { query: 'AI research' })
      ]

      await testSetup.service.executeToolCalls(toolCalls, 'msg1')

      // Verify tool execution
      expect(testSetup.mocks.api.callTool).toHaveBeenCalledTimes(1)
      
      // Verify LLM call with tools enabled (iterative loop)
      expect(testSetup.mocks.api.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          exclude_tools: false
        }),
        undefined
      )

      // Verify final assistant message
      expect(testSetup.mocks.messageManager.safeAddMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.any(String)
        })
      )
    })

    test('handles validation failures with LLM retry', async () => {
      // Mock tool failure with validation error
      testSetup.mocks.api.callTool.mockResolvedValue({
        success: false,
        error: 'Invalid parameter: missing required field'
      })
      
      // Mock successful LLM retry
      testSetup.mocks.api.chat.mockResolvedValue(mockLLMRetryResponse)

      const toolCalls = [createToolCall('tc1', 'search_documents', { query: 'test' })]

      await testSetup.service.executeToolCalls(toolCalls, 'msg1')

      // Should have attempted retry
      expect(testSetup.mocks.api.chat).toHaveBeenCalledTimes(1)
      
      // Should have called executeToolCalls recursively for retry
      expect(testSetup.mocks.messageManager.safeAddMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('corrected parameters')
        })
      )
    })

    test('handles abort signal during execution', async () => {
      const abortController = new AbortController()
      
      // Abort after a short delay
      setTimeout(() => abortController.abort(), 10)

      const toolCalls = [createToolCall('tc1', 'search_documents', {})]

      await expect(
        testSetup.service.executeToolCalls(toolCalls, 'msg1', undefined, abortController.signal)
      ).rejects.toThrow('cancelled')
    })

    test('tracks execution state correctly', async () => {
      const toolCalls = [createToolCall('tc1', 'search_documents', {})]
      
      expect(testSetup.service.isExecuting()).toBe(false)
      expect(testSetup.service.getCurrentContext()).toBeNull()

      const executionPromise = testSetup.service.executeToolCalls(toolCalls, 'msg1')
      
      // During execution
      expect(testSetup.service.isExecuting()).toBe(true)
      expect(testSetup.service.getCurrentContext()).not.toBeNull()

      await executionPromise

      // After execution
      expect(testSetup.service.isExecuting()).toBe(false)
      expect(testSetup.service.getCurrentContext()).toBeNull()
    })
  })

  describe('Tool Result Processing', () => {
    test('processes successful tool results', async () => {
      const toolCalls = [
        { ...createToolCall('tc1', 'search_tool'), status: 'completed' as const, result: mockSuccessfulToolResponse.result },
        { ...createToolCall('tc2', 'analyze_tool'), status: 'completed' as const, result: mockSuccessfulToolResponse.result }
      ]
      
      const context: ToolExecutionContext = {
        assistantMessageId: 'msg1',
        retryCount: 0,
        toolCalls
      }

      const result = await testSetup.service.processToolResults(toolCalls, context)

      expect(result.hasValidResults).toBe(true)
      expect(result.processedCount).toBe(2)
      expect(result.toolResults).toHaveLength(2)
      
      // Verify tool messages were added
      expect(testSetup.mocks.messageManager.safeAddMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'tc1'
        })
      )
    })

    test('handles failed tool results', async () => {
      const toolCalls = [
        { ...createToolCall('tc1', 'search_tool'), status: 'error' as const, result: 'Tool execution failed' }
      ]
      
      const context: ToolExecutionContext = {
        assistantMessageId: 'msg1',
        retryCount: 0,
        toolCalls
      }

      const result = await testSetup.service.processToolResults(toolCalls, context)

      expect(result.hasValidResults).toBe(false)
      expect(result.processedCount).toBe(0)
      
      // Verify error message was added
      expect(testSetup.mocks.messageManager.safeAddMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'tool',
          content: expect.stringContaining('Error executing search_tool'),
          tool_call_id: 'tc1'
        })
      )
    })

    test('handles mixed success and failure results', async () => {
      const toolCalls = [
        { ...createToolCall('tc1', 'search_tool'), status: 'completed' as const, result: mockSuccessfulToolResponse.result },
        { ...createToolCall('tc2', 'analyze_tool'), status: 'error' as const, result: 'Analysis failed' }
      ]
      
      const context: ToolExecutionContext = {
        assistantMessageId: 'msg1',
        retryCount: 0,
        toolCalls
      }

      const result = await testSetup.service.processToolResults(toolCalls, context)

      expect(result.hasValidResults).toBe(true)
      expect(result.processedCount).toBe(1)
      
      // Should have added both success and error messages
      expect(testSetup.mocks.messageManager.safeAddMessage).toHaveBeenCalledTimes(2)
    })
  })

  describe('LLM Communication', () => {
    test('sends conversation to LLM with tools disabled', async () => {
      const conversationHistory = [
        {
          id: 'user1',
          role: 'user' as const,
          content: 'Search for something',
          timestamp: new Date()
        }
      ]

      const result = await testSetup.service.sendConversationToLLM(
        conversationHistory,
        'llm-config-1',
        true // excludeTools
      )

      expect(result.success).toBe(true)
      expect(result.response).toBe(mockLLMChatResponse.response)
      
      expect(testSetup.mocks.api.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          exclude_tools: true
        }),
        undefined
      )
    })

    test('sends conversation to LLM with tools enabled and returns tool_calls', async () => {
      testSetup.mocks.api.chat.mockResolvedValue({
        response: '',
        tool_calls: [{ id: 'tc1', name: 'search_tool', arguments: '{"q":"test"}' }]
      })

      const result = await testSetup.service.sendConversationToLLM(
        [],
        'llm-config-1',
        false // tools enabled
      )

      expect(result.success).toBe(true)
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls![0].name).toBe('search_tool')

      expect(testSetup.mocks.api.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          exclude_tools: false
        }),
        undefined
      )
    })

    test('handles LLM API errors with retry', async () => {
      testSetup.mocks.api.chat
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Another error'))
        .mockResolvedValueOnce(mockLLMChatResponse)

      const result = await testSetup.service.sendConversationToLLM([], 'llm-config-1', true)

      expect(result.success).toBe(true)
      expect(testSetup.mocks.api.chat).toHaveBeenCalledTimes(3)
    })

    test('fails after max retry attempts', async () => {
      testSetup.mocks.api.chat.mockRejectedValue(new Error('Persistent error'))

      const result = await testSetup.service.sendConversationToLLM([], 'llm-config-1', true)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Persistent error')
      expect(testSetup.mocks.api.chat).toHaveBeenCalledTimes(TOOL_EXECUTION_CONSTANTS.MAX_RETRY_ATTEMPTS)
    })

    test('strips tool calls when excludeTools is true', async () => {
      testSetup.mocks.api.chat.mockResolvedValue({
        response: 'Here is my response',
        tool_calls: [{ id: 'tc1', name: 'unexpected_tool', arguments: '{}' }]
      })

      const result = await testSetup.service.sendConversationToLLM([], 'llm-config-1', true)

      expect(result.success).toBe(true)
      expect(result.response).toBe('Here is my response')
      expect(result.toolCalls).toEqual([])
    })
  })

  describe('Execution State Management', () => {
    test('cancellation works correctly', () => {
      const toolCalls = [createToolCall('tc1', 'search_tool')]
      
      // Start execution in background
      testSetup.service.executeToolCalls(toolCalls, 'msg1')
      
      expect(testSetup.service.isExecuting()).toBe(true)
      
      testSetup.service.cancelExecution('User requested cancellation')
      
      expect(testSetup.service.isExecuting()).toBe(false)
    })

    test('cleanup clears execution state', () => {
      expect(testSetup.service.isExecuting()).toBe(false)
      
      testSetup.service.cleanup()
      
      expect(testSetup.service.isExecuting()).toBe(false)
      expect(testSetup.service.getCurrentContext()).toBeNull()
    })

    test('provides execution metrics', async () => {
      const context: ToolExecutionContext = {
        assistantMessageId: 'msg1',
        retryCount: 0,
        toolCalls: [createToolCall('tc1', 'test_tool')]
      }

      const metrics = testSetup.service.getExecutionMetrics(context)
      
      expect(metrics).toHaveProperty('startTime')
      expect(metrics).toHaveProperty('toolCount', 1)
      expect(metrics).toHaveProperty('retryCount', 0)
      expect(metrics).toHaveProperty('memoryBefore')
      expect(metrics).toHaveProperty('cacheHitRate')
    })
  })

  describe('Error Handling', () => {
    test('handles critical execution errors gracefully', async () => {
      // Force an error by making server mapping throw
      jest.spyOn(testSetup.subServices.serverMappingService, 'findServerForTool')
        .mockRejectedValue(new Error('Critical server mapping error'))

      const toolCalls = [createToolCall('tc1', 'search_tool')]

      await testSetup.service.executeToolCalls(toolCalls, 'msg1')

      // Should add recovery message
      expect(testSetup.mocks.messageManager.safeAddMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('unexpected difficulties')
        })
      )

      expect(testSetup.mocks.errorLogger.logError).toHaveBeenCalled()
    })

    test('handles message manager errors during execution', async () => {
      testSetup.mocks.messageManager.safeAddMessage.mockImplementation(() => {
        throw new Error('Message manager error')
      })

      const toolCalls = [createToolCall('tc1', 'search_tool')]

      // Should not crash despite message manager errors
      await expect(
        testSetup.service.executeToolCalls(toolCalls, 'msg1')
      ).resolves.toBeUndefined()
    })

    test('handles errors during tool result processing', async () => {
      // Mock tool result processor to throw
      jest.spyOn(testSetup.subServices.toolResultProcessor, 'processToolResult')
        .mockImplementation(() => {
          throw new Error('Result processing error')
        })

      const toolCalls = [
        { ...createToolCall('tc1', 'search_tool'), status: 'completed' as const, result: 'some result' }
      ]
      
      const context: ToolExecutionContext = {
        assistantMessageId: 'msg1',
        retryCount: 0,
        toolCalls
      }

      const result = await testSetup.service.processToolResults(toolCalls, context)

      // Should handle error gracefully
      expect(result.processedCount).toBe(0)
      expect(testSetup.mocks.errorLogger.logError).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process result'),
        expect.any(Error)
      )
    })
  })

  describe('Configuration and Reset', () => {
    test('configure updates service configuration', () => {
      const newConfig = { maxRetries: 5 }
      expect(() => testSetup.service.configure(newConfig)).not.toThrow()
    })

    test('reset clears state and calls cleanup', () => {
      const cleanupSpy = jest.spyOn(testSetup.service, 'cleanup')
      
      testSetup.service.reset()
      
      expect(cleanupSpy).toHaveBeenCalled()
    })
  })

  describe('Integration with Sub-Services', () => {
    test('coordinates with all sub-services during execution', async () => {
      // Spy on sub-service methods
      const serverMappingSpy = jest.spyOn(testSetup.subServices.serverMappingService, 'findServerForTool')
      const resultProcessorSpy = jest.spyOn(testSetup.subServices.toolResultProcessor, 'processToolResult')
      const conversationHistorySpy = jest.spyOn(testSetup.subServices.conversationHistoryService, 'prepareForLLMApi')

      const toolCalls = [createToolCall('tc1', 'search_documents', { query: 'test' })]

      await testSetup.service.executeToolCalls(toolCalls, 'msg1')

      // Verify all sub-services were used
      expect(serverMappingSpy).toHaveBeenCalled()
      expect(resultProcessorSpy).toHaveBeenCalled()
      expect(conversationHistorySpy).toHaveBeenCalled()
    })

    test('passes correct parameters to sub-services', async () => {
      const serverMappingSpy = jest.spyOn(testSetup.subServices.serverMappingService, 'findServerForTool')
      
      const toolCalls = [createToolCall('tc1', 'search_documents', { query: 'test' })]

      await testSetup.service.executeToolCalls(toolCalls, 'msg1')

      expect(serverMappingSpy).toHaveBeenCalledWith('search_documents', undefined)
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

    test('logs tool execution progress with emoji formatting', async () => {
      const toolCalls = [createToolCall('tc1', 'search_documents')]

      await testSetup.service.executeToolCalls(toolCalls, 'msg1')

      expect(consoleSpy).toHaveBeenCalledWith(
        '🔧 Executing tool 1/1: search_documents'
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        '✅ Tool search_documents completed successfully'
      )
    })

    test('logs retry attempts', async () => {
      const toolCalls = [createToolCall('tc1', 'search_tool')]

      await testSetup.service.executeToolCalls(toolCalls, 'msg1', undefined, undefined, 1)

      expect(consoleSpy).toHaveBeenCalledWith(
        `🔄 Retry attempt 1/${TOOL_EXECUTION_CONSTANTS.MAX_RETRY_ATTEMPTS} for tool execution`
      )
    })

    test('logs cleanup operations', () => {
      testSetup.service.cleanup()

      expect(consoleSpy).toHaveBeenCalledWith('🧹 Cleaning up ToolExecutionService resources')
    })
  })
})