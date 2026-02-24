/**
 * ToolRetryService Test Suite
 * 
 * Comprehensive test coverage for retry logic, validation error detection, and LLM-powered retries
 * Tests based on original ChatInterfaceSimple.tsx retry logic
 */

import { ToolRetryService } from '../ToolRetryService'
import { IToolRetryService } from '../interfaces/IToolRetryService'
import { 
  ToolCall,
  ToolExecutionResult,
  RetryContext,
  ValidationError,
  ChatMessage,
  ServiceConfiguration,
  TOOL_EXECUTION_CONSTANTS
} from '../types/ToolExecutionTypes'
import { ExternalDependencies } from '../types/ServiceDependencies'
import { 
  createMockExternalDependencies,
  createMockApi,
  createMockErrorLogger
} from './fixtures/mockDependencies'
import { 
  mockLLMRetryResponse,
  mockLLMChatWithToolCallsResponse,
  createMockLLMResponse
} from './fixtures/mockApiResponses'

// Test utilities
const createTestService = (
  overrides: Partial<ExternalDependencies> = {},
  config: Partial<ServiceConfiguration> = {}
): ToolRetryService => {
  const defaultDependencies = createMockExternalDependencies(overrides)
  const defaultConfig: ServiceConfiguration = {
    maxRetries: TOOL_EXECUTION_CONSTANTS.MAX_RETRY_ATTEMPTS,
    cacheExpiryMs: TOOL_EXECUTION_CONSTANTS.TOOL_CACHE_EXPIRY_MS,
    conversationHistoryLimit: TOOL_EXECUTION_CONSTANTS.MAX_CONVERSATION_HISTORY,
    enablePerformanceMonitoring: true,
    enableMemoryTracking: true,
    ...config
  }

  return new ToolRetryService(defaultDependencies, defaultConfig)
}

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

const createToolResult = (
  success: boolean,
  error?: string,
  result?: any
): ToolExecutionResult => ({
  success,
  error,
  result
})

const createMessage = (
  role: 'user' | 'assistant' | 'tool',
  content: string,
  options: {
    id?: string
    tool_calls?: any[]
    tool_call_id?: string
    timestamp?: Date
  } = {}
): ChatMessage => ({
  id: options.id || `msg_${Date.now()}_${Math.random()}`,
  role,
  content,
  timestamp: options.timestamp || new Date(),
  ...options
})

describe('ToolRetryService', () => {
  let service: ToolRetryService
  let mockApi: ReturnType<typeof createMockApi>
  let mockErrorLogger: ReturnType<typeof createMockErrorLogger>

  beforeEach(() => {
    mockApi = createMockApi()
    mockErrorLogger = createMockErrorLogger()
    
    service = createTestService({
      api: mockApi,
      errorLogger: mockErrorLogger
    })
  })

  describe('Interface Implementation', () => {
    test('implements IToolRetryService interface', () => {
      expect(service).toBeInstanceOf(ToolRetryService)
      
      const interfaceMethods: (keyof IToolRetryService)[] = [
        'isValidationError',
        'shouldRetry',
        'executeRetryWithLLM',
        'createRetryContext',
        'updateRetryContext',
        'hasExceededMaxRetries',
        'generateRetryConversationHistory',
        'parseValidationError',
        'applyAutomaticFixes',
        'getRetryStats'
      ]
      
      interfaceMethods.forEach(method => {
        expect(typeof service[method]).toBe('function')
      })
    })

    test('provides additional utility methods', () => {
      const utilityMethods = [
        'resetStats',
        'getRetrySummary',
        'configure',
        'reset'
      ]
      
      utilityMethods.forEach(method => {
        expect(service).toHaveProperty(method)
        expect(typeof (service as any)[method]).toBe('function')
      })
    })
  })

  describe('Validation Error Detection', () => {
    test('identifies validation errors correctly', () => {
      const validationErrors = [
        'Invalid parameter: missing required field',
        'Validation failed: incorrect type',
        'MCP Error -32602: Invalid params',
        'Required parameter missing',
        'Type mismatch in format'
      ]
      
      validationErrors.forEach(error => {
        expect(service.isValidationError(error)).toBe(true)
      })
    })

    test('does not identify non-validation errors as validation errors', () => {
      const nonValidationErrors = [
        'Network connection failed',
        'Timeout occurred',
        'Server is unavailable',
        'Rate limit exceeded',
        'Internal server error'
      ]
      
      nonValidationErrors.forEach(error => {
        expect(service.isValidationError(error)).toBe(false)
      })
    })

    test('handles empty and undefined errors', () => {
      expect(service.isValidationError('')).toBe(false)
      expect(service.isValidationError(undefined as any)).toBe(false)
    })

    test('is case insensitive', () => {
      expect(service.isValidationError('INVALID PARAMETER')).toBe(true)
      expect(service.isValidationError('validation FAILED')).toBe(true)
      expect(service.isValidationError('Required PARAMETER missing')).toBe(true)
    })
  })

  describe('Retry Decision Logic', () => {
    test('does not retry successful results', () => {
      const context = service.createRetryContext(0)
      const result = createToolResult(true)
      
      const decision = service.shouldRetry(result, context)
      
      expect(decision.shouldRetry).toBe(false)
      expect(decision.reason).toContain('successful')
    })

    test('does not retry when max attempts exceeded', () => {
      const context = service.createRetryContext(3, 3) // At max
      const result = createToolResult(false, 'Some error')
      
      const decision = service.shouldRetry(result, context)
      
      expect(decision.shouldRetry).toBe(false)
      expect(decision.reason).toContain('Maximum retry attempts')
    })

    test('retries validation errors immediately', () => {
      const context = service.createRetryContext(0)
      const result = createToolResult(false, 'Invalid parameter: missing required field')
      
      const decision = service.shouldRetry(result, context)
      
      expect(decision.shouldRetry).toBe(true)
      expect(decision.reason).toContain('Validation error')
      expect(decision.suggestedDelay).toBe(0)
    })

    test('retries network errors with exponential backoff', () => {
      const context = service.createRetryContext(1) // Second attempt
      const result = createToolResult(false, 'Network connection failed')
      
      const decision = service.shouldRetry(result, context)
      
      expect(decision.shouldRetry).toBe(true)
      expect(decision.reason).toContain('Network/timeout error')
      expect(decision.suggestedDelay).toBe(2000) // 1000 * 2^1
    })

    test('retries rate limit errors with extended delay', () => {
      const context = service.createRetryContext(0)
      const result = createToolResult(false, 'Rate limit exceeded')
      
      const decision = service.shouldRetry(result, context)
      
      expect(decision.shouldRetry).toBe(true)
      expect(decision.reason).toContain('Rate limit error')
      expect(decision.suggestedDelay).toBe(5000) // Base 5s delay
    })

    test('retries server errors with increasing delay', () => {
      const context = service.createRetryContext(1)
      const result = createToolResult(false, 'Internal server error')
      
      const decision = service.shouldRetry(result, context)
      
      expect(decision.shouldRetry).toBe(true)
      expect(decision.reason).toContain('Server error')
      expect(decision.suggestedDelay).toBe(4000) // 2000 * (1+1)
    })

    test('does not retry unknown error types', () => {
      const context = service.createRetryContext(0)
      const result = createToolResult(false, 'Unknown mysterious error')
      
      const decision = service.shouldRetry(result, context)
      
      expect(decision.shouldRetry).toBe(false)
      expect(decision.reason).toContain('Unknown error type')
    })

    test('caps exponential backoff at maximum value', () => {
      const context = service.createRetryContext(5) // High retry count
      const result = createToolResult(false, 'Network timeout')
      
      const decision = service.shouldRetry(result, context)
      
      expect(decision.shouldRetry).toBe(true)
      expect(decision.suggestedDelay).toBeLessThanOrEqual(8000) // Max cap
    })
  })

  describe('Retry Context Management', () => {
    test('creates retry context with defaults', () => {
      const context = service.createRetryContext()
      
      expect(context).toEqual({
        retryCount: 0,
        maxRetries: TOOL_EXECUTION_CONSTANTS.MAX_RETRY_ATTEMPTS,
        lastError: undefined,
        originalParameters: undefined
      })
    })

    test('creates retry context with custom values', () => {
      const context = service.createRetryContext(2, 5, 'Custom error', { param: 'value' })
      
      expect(context).toEqual({
        retryCount: 2,
        maxRetries: 5,
        lastError: 'Custom error',
        originalParameters: { param: 'value' }
      })
    })

    test('updates retry context after attempt', () => {
      const initialContext = service.createRetryContext(1)
      const result = createToolResult(false, 'New error occurred')
      
      const updatedContext = service.updateRetryContext(initialContext, result)
      
      expect(updatedContext.retryCount).toBe(2)
      expect(updatedContext.lastError).toBe('New error occurred')
      expect(updatedContext.maxRetries).toBe(initialContext.maxRetries)
    })

    test('does not update last error for successful results', () => {
      const initialContext = service.createRetryContext(1, 3, 'Previous error')
      const result = createToolResult(true)
      
      const updatedContext = service.updateRetryContext(initialContext, result)
      
      expect(updatedContext.retryCount).toBe(2)
      expect(updatedContext.lastError).toBe('Previous error') // Unchanged
    })

    test('correctly identifies max retries exceeded', () => {
      const withinLimit = service.createRetryContext(2, 3)
      const atLimit = service.createRetryContext(3, 3)
      const overLimit = service.createRetryContext(4, 3)
      
      expect(service.hasExceededMaxRetries(withinLimit)).toBe(false)
      expect(service.hasExceededMaxRetries(atLimit)).toBe(true)
      expect(service.hasExceededMaxRetries(overLimit)).toBe(true)
    })
  })

  describe('LLM Retry Execution', () => {
    beforeEach(() => {
      mockApi.chat.mockResolvedValue(mockLLMRetryResponse)
    })

    test('executes successful LLM retry', async () => {
      const toolCalls = [createToolCall('tc1', 'search_tool', { query: 'test' })]
      const failedResults = [createToolResult(false, 'Invalid parameter: missing required field')]
      const conversationHistory = [createMessage('user', 'Search for something')]
      
      const result = await service.executeRetryWithLLM(
        toolCalls,
        failedResults,
        conversationHistory,
        'llm-config-1'
      )
      
      expect(result.success).toBe(true)
      expect(result.updatedToolCalls).toHaveLength(1)
      expect(result.updatedToolCalls![0].name).toBe('search_documents')
      expect(result.errors).toHaveLength(0)
      expect(mockApi.chat).toHaveBeenCalledTimes(1)
    })

    test('handles LLM response without tool calls', async () => {
      mockApi.chat.mockResolvedValue({
        response: 'I cannot help with that request',
        tool_calls: []
      })
      
      const toolCalls = [createToolCall('tc1', 'search_tool')]
      const failedResults = [createToolResult(false, 'Validation error')]
      const conversationHistory = [createMessage('user', 'Test')]
      
      const result = await service.executeRetryWithLLM(
        toolCalls,
        failedResults,
        conversationHistory,
        'llm-config-1'
      )
      
      expect(result.success).toBe(false)
      expect(result.errors).toContain("LLM didn't provide tool calls for retry")
    })

    test('skips retry when no validation failures exist', async () => {
      const toolCalls = [createToolCall('tc1', 'search_tool')]
      const failedResults = [createToolResult(false, 'Network timeout')] // Not validation error
      const conversationHistory = [createMessage('user', 'Test')]
      
      const result = await service.executeRetryWithLLM(
        toolCalls,
        failedResults,
        conversationHistory,
        'llm-config-1'
      )
      
      expect(result.success).toBe(false)
      expect(result.errors).toContain('No validation failures found to retry with LLM')
      expect(mockApi.chat).not.toHaveBeenCalled()
    })

    test('handles API errors during retry', async () => {
      mockApi.chat.mockRejectedValue(new Error('API unavailable'))
      
      const toolCalls = [createToolCall('tc1', 'search_tool')]
      const failedResults = [createToolResult(false, 'Invalid parameter')]
      const conversationHistory = [createMessage('user', 'Test')]
      
      const result = await service.executeRetryWithLLM(
        toolCalls,
        failedResults,
        conversationHistory,
        'llm-config-1'
      )
      
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Failed to execute retry with LLM: API unavailable')
      expect(mockErrorLogger.logError).toHaveBeenCalled()
    })

    test('respects abort signal', async () => {
      const abortController = new AbortController()
      abortController.abort()
      
      const toolCalls = [createToolCall('tc1', 'search_tool')]
      const failedResults = [createToolResult(false, 'Invalid parameter')]
      const conversationHistory = [createMessage('user', 'Test')]
      
      const result = await service.executeRetryWithLLM(
        toolCalls,
        failedResults,
        conversationHistory,
        'llm-config-1',
        abortController.signal
      )
      
      expect(result.success).toBe(false)
      expect(result.errors).toContain('Failed to execute retry with LLM: Tool execution was cancelled')
    })

    test('updates retry statistics on success', async () => {
      const toolCalls = [createToolCall('tc1', 'search_tool')]
      const failedResults = [createToolResult(false, 'Invalid parameter')]
      const conversationHistory = [createMessage('user', 'Test')]
      
      const initialStats = service.getRetryStats()
      
      await service.executeRetryWithLLM(toolCalls, failedResults, conversationHistory, 'llm-config-1')
      
      const finalStats = service.getRetryStats()
      expect(finalStats.totalRetries).toBe(initialStats.totalRetries + 1)
      expect(finalStats.successfulRetries).toBe(initialStats.successfulRetries + 1)
    })
  })

  describe('Retry Conversation History Generation', () => {
    test('generates proper retry conversation history', () => {
      const originalHistory = [
        createMessage('user', 'Search for AI research'),
        createMessage('assistant', 'I will search for that', {
          tool_calls: [{ id: 'tc1', name: 'search_tool', parameters: { query: 'AI research' } }]
        })
      ]
      const toolCalls = [createToolCall('tc1', 'search_tool', { query: 'AI research' })]
      const failedResults = [createToolResult(false, 'Invalid parameter: missing indices array')]
      
      const retryHistory = service.generateRetryConversationHistory(
        originalHistory,
        toolCalls,
        failedResults
      )
      
      expect(retryHistory).toHaveLength(3) // Original 2 + retry context
      expect(retryHistory[2].role).toBe('user')
      expect(retryHistory[2].content).toContain('failed with validation errors')
      expect(retryHistory[2].content).toContain('search_tool')
      expect(retryHistory[2].content).toContain('Invalid parameter: missing indices array')
    })

    test('cleans tool calls in conversation history', () => {
      const originalHistory = [
        createMessage('assistant', 'Using tool', {
          tool_calls: [{
            id: 'tc1',
            name: 'search_tool',
            parameters: { query: 'test' },
            status: 'error', // This should be cleaned
            result: 'Error occurred' // This should be cleaned
          }]
        })
      ]
      const toolCalls = [createToolCall('tc1', 'search_tool')]
      const failedResults = [createToolResult(false, 'Validation error')]
      
      const retryHistory = service.generateRetryConversationHistory(
        originalHistory,
        toolCalls,
        failedResults
      )
      
      const assistantMessage = retryHistory[0]
      expect(assistantMessage.tool_calls![0]).toEqual({
        id: 'tc1',
        name: 'search_tool',
        parameters: { query: 'test' }
      })
      expect(assistantMessage.tool_calls![0]).not.toHaveProperty('status')
      expect(assistantMessage.tool_calls![0]).not.toHaveProperty('result')
    })

    test('handles multiple failed results', () => {
      const toolCalls = [
        createToolCall('tc1', 'search_tool'),
        createToolCall('tc2', 'analyze_tool')
      ]
      const failedResults = [
        createToolResult(false, 'Error 1'),
        createToolResult(false, 'Error 2')
      ]
      
      const retryHistory = service.generateRetryConversationHistory(
        [],
        toolCalls,
        failedResults
      )
      
      const retryMessage = retryHistory[0]
      expect(retryMessage.content).toContain('search_tool')
      expect(retryMessage.content).toContain('analyze_tool')
      expect(retryMessage.content).toContain('Error 1')
      expect(retryMessage.content).toContain('Error 2')
    })

    test('handles error in generation gracefully', () => {
      // Force an error by passing invalid data
      const originalHistory = null as any
      
      const retryHistory = service.generateRetryConversationHistory(
        originalHistory,
        [],
        []
      )
      
      expect(retryHistory).toHaveLength(1)
      expect(retryHistory[0].content).toContain('retry the failed tool calls')
      expect(mockErrorLogger.logError).toHaveBeenCalled()
    })
  })

  describe('Validation Error Parsing', () => {
    test('parses validation errors correctly', () => {
      const error = 'Invalid parameter: missing required field "query"'
      const result = service.parseValidationError(error)
      
      expect(result.isValidationError).toBe(true)
      expect(result.errorMessage).toBe(error)
    })

    test('provides suggestions for index_name errors', () => {
      const error = 'MCP Error -32602: Invalid params - index_name parameter should be indices array'
      const result = service.parseValidationError(error)
      
      expect(result.isValidationError).toBe(true)
      expect(result.suggestedFix).toContain('Convert index_name parameter to indices array')
    })

    test('provides suggestions for missing parameter errors', () => {
      const error = 'Missing required parameter: query'
      const result = service.parseValidationError(error)
      
      expect(result.isValidationError).toBe(true)
      expect(result.suggestedFix).toContain('Add required parameter: query')
    })

    test('provides suggestions for type errors', () => {
      const error = 'Invalid type for parameter limit'
      const result = service.parseValidationError(error)
      
      expect(result.isValidationError).toBe(true)
      expect(result.suggestedFix).toContain('Check parameter types')
    })

    test('handles non-validation errors', () => {
      const error = 'Network connection failed'
      const result = service.parseValidationError(error)
      
      expect(result.isValidationError).toBe(false)
      expect(result.errorMessage).toBe(error)
      expect(result.suggestedFix).toBeUndefined()
    })
  })

  describe('Automatic Parameter Fixes', () => {
    test('fixes index_name to indices conversion', () => {
      const toolCall = createToolCall('tc1', 'search_tool', {
        query: 'test',
        index_name: 'documents'
      })
      const validationError = service.parseValidationError(
        'index_name parameter should be indices array'
      )
      
      const fixedToolCall = service.applyAutomaticFixes(toolCall, validationError)
      
      expect(fixedToolCall).not.toBeNull()
      expect(fixedToolCall!.parameters).toEqual({
        query: 'test',
        indices: ['documents']
      })
      expect(fixedToolCall!.parameters).not.toHaveProperty('index_name')
    })

    test('fixes string numbers to actual numbers', () => {
      const toolCall = createToolCall('tc1', 'search_tool', {
        limit: '10',
        offset: '5'
      })
      const validationError = service.parseValidationError('Expected number but got string')
      
      const fixedToolCall = service.applyAutomaticFixes(toolCall, validationError)
      
      expect(fixedToolCall).not.toBeNull()
      expect(fixedToolCall!.parameters).toEqual({
        limit: 10,
        offset: 5
      })
    })

    test('fixes boolean strings to actual booleans', () => {
      const toolCall = createToolCall('tc1', 'search_tool', {
        enable_cache: 'true',
        verbose: 'false'
      })
      const validationError = service.parseValidationError('Expected boolean')
      
      const fixedToolCall = service.applyAutomaticFixes(toolCall, validationError)
      
      expect(fixedToolCall).not.toBeNull()
      expect(fixedToolCall!.parameters).toEqual({
        enable_cache: true,
        verbose: false
      })
    })

    test('handles index_name as array correctly', () => {
      const toolCall = createToolCall('tc1', 'search_tool', {
        index_name: ['doc1', 'doc2']
      })
      const validationError = service.parseValidationError(
        'index_name parameter should be indices array'
      )
      
      const fixedToolCall = service.applyAutomaticFixes(toolCall, validationError)
      
      expect(fixedToolCall).not.toBeNull()
      expect(fixedToolCall!.parameters).toEqual({
        indices: ['doc1', 'doc2']
      })
    })

    test('returns null for non-validation errors', () => {
      const toolCall = createToolCall('tc1', 'search_tool', { query: 'test' })
      const nonValidationError = service.parseValidationError('Network timeout')
      
      const fixedToolCall = service.applyAutomaticFixes(toolCall, nonValidationError)
      
      expect(fixedToolCall).toBeNull()
    })

    test('returns null when no fixes can be applied', () => {
      const toolCall = createToolCall('tc1', 'search_tool', { query: 'test' })
      const validationError = service.parseValidationError('Unknown validation error')
      
      const fixedToolCall = service.applyAutomaticFixes(toolCall, validationError)
      
      expect(fixedToolCall).toBeNull()
    })

    test('handles errors during fix application gracefully', () => {
      const toolCall = createToolCall('tc1', 'search_tool', { 
        // Circular reference that would cause JSON.stringify to fail
        circular: {} as any 
      })
      toolCall.parameters.circular.self = toolCall.parameters.circular
      
      const validationError = service.parseValidationError('Expected number')
      
      const fixedToolCall = service.applyAutomaticFixes(toolCall, validationError)
      
      expect(fixedToolCall).toBeNull()
      expect(mockErrorLogger.logError).toHaveBeenCalled()
    })
  })

  describe('Retry Statistics', () => {
    test('tracks retry statistics correctly', () => {
      // Initial state
      let stats = service.getRetryStats()
      expect(stats.totalRetries).toBe(0)
      expect(stats.successfulRetries).toBe(0)
      expect(stats.failedRetries).toBe(0)
      expect(stats.retrySuccessRate).toBe(0)
      expect(stats.commonErrors).toHaveLength(0)
      
      // Update context with failures (simulates internal tracking)
      const context1 = service.createRetryContext()
      const result1 = createToolResult(false, 'Validation error 1')
      service.updateRetryContext(context1, result1)
      
      const context2 = service.createRetryContext()
      const result2 = createToolResult(false, 'Validation error 1') // Same error
      service.updateRetryContext(context2, result2)
      
      const context3 = service.createRetryContext()
      const result3 = createToolResult(false, 'Network error')
      service.updateRetryContext(context3, result3)
      
      stats = service.getRetryStats()
      expect(stats.commonErrors).toHaveLength(2)
      expect(stats.commonErrors[0]).toEqual({
        error: 'Validation error 1',
        count: 2
      })
      expect(stats.commonErrors[1]).toEqual({
        error: 'Network error',
        count: 1
      })
    })

    test('calculates retry success rate correctly', async () => {
      // Mock successful retry
      mockApi.chat.mockResolvedValue(mockLLMRetryResponse)
      
      await service.executeRetryWithLLM(
        [createToolCall('tc1', 'test')],
        [createToolResult(false, 'Invalid parameter')],
        [],
        'llm-config-1'
      )
      
      // Mock failed retry
      mockApi.chat.mockResolvedValue({ response: 'No tools', tool_calls: [] })
      
      await service.executeRetryWithLLM(
        [createToolCall('tc2', 'test')],
        [createToolResult(false, 'Invalid parameter')],
        [],
        'llm-config-1'
      )
      
      const stats = service.getRetryStats()
      expect(stats.totalRetries).toBe(2)
      expect(stats.successfulRetries).toBe(1)
      expect(stats.failedRetries).toBe(1)
      expect(stats.retrySuccessRate).toBe(0.5)
    })

    test('limits common errors to top 10', () => {
      // Create more than 10 different errors
      for (let i = 0; i < 15; i++) {
        const context = service.createRetryContext()
        const result = createToolResult(false, `Error type ${i}`)
        service.updateRetryContext(context, result)
      }
      
      const stats = service.getRetryStats()
      expect(stats.commonErrors).toHaveLength(10)
    })

    test('resets statistics correctly', () => {
      // Generate some stats first
      const context = service.createRetryContext()
      const result = createToolResult(false, 'Test error')
      service.updateRetryContext(context, result)
      
      service.resetStats()
      
      const stats = service.getRetryStats()
      expect(stats.totalRetries).toBe(0)
      expect(stats.successfulRetries).toBe(0)
      expect(stats.failedRetries).toBe(0)
      expect(stats.commonErrors).toHaveLength(0)
    })
  })

  describe('Utility Methods', () => {
    test('provides retry summary', () => {
      // Generate some test data
      const context = service.createRetryContext()
      const result = createToolResult(false, 'Sample validation error for testing purposes')
      service.updateRetryContext(context, result)
      
      const summary = service.getRetrySummary()
      
      expect(summary).toContain('Retry Summary:')
      expect(summary).toContain('Total retries: 0') // No actual retries yet
      expect(summary).toContain('Success rate:')
      expect(summary).toContain('Top errors:')
    })

    test('configure updates configuration', () => {
      const newConfig = { maxRetries: 5 }
      expect(() => service.configure(newConfig)).not.toThrow()
    })

    test('reset clears state and statistics', () => {
      // Generate some stats
      const context = service.createRetryContext()
      const result = createToolResult(false, 'Test error')
      service.updateRetryContext(context, result)
      
      service.reset()
      
      const stats = service.getRetryStats()
      expect(stats.totalRetries).toBe(0)
      expect(stats.commonErrors).toHaveLength(0)
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

    test('logs automatic fixes with emoji formatting', () => {
      const toolCall = createToolCall('tc1', 'search_tool', { index_name: 'docs' })
      const validationError = service.parseValidationError('index_name should be indices array')
      
      service.applyAutomaticFixes(toolCall, validationError)
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '🔧 Applied automatic fix: index_name -> indices conversion'
      )
    })

    test('logs service reset', () => {
      service.reset()
      
      expect(consoleSpy).toHaveBeenCalledWith('🔄 ToolRetryService reset')
    })

    test('logs statistics reset', () => {
      service.resetStats()
      
      expect(consoleSpy).toHaveBeenCalledWith('🔄 Resetting retry statistics')
    })
  })

  describe('Error Handling', () => {
    test('handles abort signal correctly', async () => {
      const abortController = new AbortController()
      
      // Set up a delayed abort
      setTimeout(() => abortController.abort(), 10)
      
      const result = await service.executeRetryWithLLM(
        [createToolCall('tc1', 'test')],
        [createToolResult(false, 'Invalid parameter')],
        [],
        'llm-config-1',
        abortController.signal
      )
      
      expect(result.success).toBe(false)
      expect(result.errors[0]).toContain('cancelled')
    })

    test('handles API errors gracefully', async () => {
      mockApi.chat.mockRejectedValue(new Error('Connection refused'))
      
      const result = await service.executeRetryWithLLM(
        [createToolCall('tc1', 'test')],
        [createToolResult(false, 'Invalid parameter')],
        [],
        'llm-config-1'
      )
      
      expect(result.success).toBe(false)
      expect(result.errors[0]).toContain('Connection refused')
      expect(mockErrorLogger.logError).toHaveBeenCalledWith(
        'Failed to execute retry with LLM',
        expect.any(Error)
      )
    })
  })
})