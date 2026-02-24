/**
 * ConversationHistoryService Test Suite
 * 
 * Comprehensive test coverage for conversation validation, cleaning, and management
 * Tests based on original ChatInterfaceSimple.tsx validation logic
 */

import { ConversationHistoryService } from '../ConversationHistoryService'
import { IConversationHistoryService } from '../interfaces/IConversationHistoryService'
import { 
  ChatMessage,
  ConversationHistory,
  ServiceConfiguration,
  TOOL_EXECUTION_CONSTANTS
} from '../types/ToolExecutionTypes'
import { ExternalDependencies } from '../types/ServiceDependencies'
import { 
  createMockExternalDependencies,
  createMockErrorLogger
} from './fixtures/mockDependencies'

// Test utilities
const createTestService = (
  overrides: Partial<ExternalDependencies> = {},
  config: Partial<ServiceConfiguration> = {}
): ConversationHistoryService => {
  const defaultDependencies = createMockExternalDependencies(overrides)
  const defaultConfig: ServiceConfiguration = {
    maxRetries: 3,
    cacheExpiryMs: TOOL_EXECUTION_CONSTANTS.TOOL_CACHE_EXPIRY_MS,
    conversationHistoryLimit: TOOL_EXECUTION_CONSTANTS.MAX_CONVERSATION_HISTORY,
    enablePerformanceMonitoring: true,
    enableMemoryTracking: true,
    ...config
  }

  return new ConversationHistoryService(defaultDependencies, defaultConfig)
}

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

const createToolCall = (id: string, name: string, parameters: any = {}) => ({
  id,
  name,
  parameters,
  status: 'completed' as const
})

describe('ConversationHistoryService', () => {
  let service: ConversationHistoryService
  let mockErrorLogger: ReturnType<typeof createMockErrorLogger>

  beforeEach(() => {
    mockErrorLogger = createMockErrorLogger()
    service = createTestService({
      errorLogger: mockErrorLogger
    })
  })

  describe('Interface Implementation', () => {
    test('implements IConversationHistoryService interface', () => {
      expect(service).toBeInstanceOf(ConversationHistoryService)
      
      const interfaceMethods: (keyof IConversationHistoryService)[] = [
        'validateAndCleanHistory',
        'limitConversationHistory', 
        'validateHistoryForToolExecution',
        'cleanOrphanedToolMessages',
        'ensureConversationFlow',
        'getConversationStats',
        'prepareForLLMApi',
        'addMessageWithValidation'
      ]
      
      interfaceMethods.forEach(method => {
        expect(typeof service[method]).toBe('function')
      })
    })

    test('provides additional utility methods', () => {
      const utilityMethods = [
        'getConversationSummary',
        'configure',
        'reset'
      ]
      
      utilityMethods.forEach(method => {
        expect(service).toHaveProperty(method)
        expect(typeof (service as any)[method]).toBe('function')
      })
    })
  })

  describe('Message Validation and Cleaning', () => {
    test('validates and keeps user messages', () => {
      const messages = [
        createMessage('user', 'Hello'),
        createMessage('user', 'How are you?')
      ]
      
      const result = service.validateAndCleanHistory(messages)
      
      expect(result).toHaveLength(2)
      expect(result[0].role).toBe('user')
      expect(result[1].role).toBe('user')
    })

    test('validates and keeps assistant messages', () => {
      const messages = [
        createMessage('assistant', 'I am doing well'),
        createMessage('assistant', 'How can I help?', {
          tool_calls: [createToolCall('tc1', 'search_tool')]
        })
      ]
      
      const result = service.validateAndCleanHistory(messages)
      
      expect(result).toHaveLength(2)
      expect(result[0].role).toBe('assistant')
      expect(result[1].role).toBe('assistant')
      expect(result[1].tool_calls).toHaveLength(1)
    })

    test('validates tool messages against assistant tool calls', () => {
      const messages = [
        createMessage('assistant', 'Let me search for that', {
          tool_calls: [
            createToolCall('tc1', 'search_tool'),
            createToolCall('tc2', 'analyze_tool')
          ]
        }),
        createMessage('tool', 'Search results...', { tool_call_id: 'tc1' }),
        createMessage('tool', 'Analysis complete', { tool_call_id: 'tc2' })
      ]
      
      const result = service.validateAndCleanHistory(messages)
      
      expect(result).toHaveLength(3)
      expect(result[1].role).toBe('tool')
      expect(result[2].role).toBe('tool')
    })

    test('removes orphaned tool messages', () => {
      const messages = [
        createMessage('assistant', 'Let me search for that', {
          tool_calls: [createToolCall('tc1', 'search_tool')]
        }),
        createMessage('tool', 'Valid tool result', { tool_call_id: 'tc1' }),
        createMessage('tool', 'Orphaned tool result', { tool_call_id: 'tc_orphan' })
      ]
      
      const result = service.validateAndCleanHistory(messages)
      
      expect(result).toHaveLength(2)
      expect(result[1].tool_call_id).toBe('tc1')
      expect(mockErrorLogger.logWarning).toHaveBeenCalledWith(
        expect.stringContaining('Orphaned tool message excluded')
      )
    })

    test('removes tool messages without tool_call_id', () => {
      const messages = [
        createMessage('assistant', 'Let me help'),
        createMessage('tool', 'Tool result without ID')
      ]
      
      const result = service.validateAndCleanHistory(messages)
      
      expect(result).toHaveLength(1)
      expect(result[0].role).toBe('assistant')
    })

    test('resets tool call tracking on user messages', () => {
      const messages = [
        createMessage('assistant', 'Using tools', {
          tool_calls: [createToolCall('tc1', 'search_tool')]
        }),
        createMessage('user', 'New question'),
        createMessage('tool', 'Late tool result', { tool_call_id: 'tc1' })
      ]
      
      const result = service.validateAndCleanHistory(messages)
      
      expect(result).toHaveLength(2) // Assistant + User, tool message excluded
      expect(result[1].role).toBe('user')
    })

    test('handles duplicate tool call IDs', () => {
      const messages = [
        createMessage('assistant', 'Using tools', {
          tool_calls: [createToolCall('tc1', 'search_tool')]
        }),
        createMessage('tool', 'First result', { tool_call_id: 'tc1' }),
        createMessage('tool', 'Duplicate result', { tool_call_id: 'tc1' })
      ]
      
      const result = service.validateAndCleanHistory(messages)
      
      expect(result).toHaveLength(2) // Assistant + first tool, duplicate excluded
      expect(result[1].tool_call_id).toBe('tc1')
    })
  })

  describe('Conversation History Limiting', () => {
    test('returns messages unchanged when under limit', () => {
      const messages = Array.from({ length: 10 }, (_, i) => 
        createMessage('user', `Message ${i}`)
      )
      
      const result = service.limitConversationHistory(messages)
      
      expect(result).toHaveLength(10)
      expect(result).toEqual(messages)
    })

    test('limits messages when over MAX_CONVERSATION_HISTORY', () => {
      const messageCount = TOOL_EXECUTION_CONSTANTS.MAX_CONVERSATION_HISTORY + 10
      const messages = Array.from({ length: messageCount }, (_, i) => 
        createMessage('user', `Message ${i}`)
      )
      
      const result = service.limitConversationHistory(messages)
      
      expect(result).toHaveLength(TOOL_EXECUTION_CONSTANTS.MAX_CONVERSATION_HISTORY)
      // Should keep the most recent messages
      expect(result[0].content).toBe(`Message ${10}`)
      expect(result[result.length - 1].content).toBe(`Message ${messageCount - 1}`)
    })

    test('trims orphaned messages at beginning when limiting', () => {
      const messageCount = TOOL_EXECUTION_CONSTANTS.MAX_CONVERSATION_HISTORY + 5
      const messages = [
        // These will be at the start after limiting and should be removed
        createMessage('assistant', 'Assistant at start'),
        createMessage('tool', 'Orphaned tool'),
        createMessage('user', 'First user message'),
        ...Array.from({ length: messageCount - 3 }, (_, i) => 
          createMessage('user', `Message ${i}`)
        )
      ]
      
      const result = service.limitConversationHistory(messages)
      
      expect(result).toHaveLength(TOOL_EXECUTION_CONSTANTS.MAX_CONVERSATION_HISTORY - 2)
      expect(result[0].role).toBe('user')
      expect(result[0].content).toBe('First user message')
    })

    test('handles edge case where no user messages exist in limited range', () => {
      const messageCount = TOOL_EXECUTION_CONSTANTS.MAX_CONVERSATION_HISTORY + 5
      const messages = Array.from({ length: messageCount }, (_, i) => 
        createMessage('assistant', `Assistant ${i}`)
      )
      
      const result = service.limitConversationHistory(messages)
      
      expect(result).toHaveLength(TOOL_EXECUTION_CONSTANTS.MAX_CONVERSATION_HISTORY)
      expect(result.every(msg => msg.role === 'assistant')).toBe(true)
    })
  })

  describe('Conversation Flow Validation', () => {
    test('maintains conversation when it starts with user message', () => {
      const messages = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi there'),
        createMessage('user', 'How are you?')
      ]
      
      const result = service.ensureConversationFlow(messages)
      
      expect(result).toEqual(messages)
    })

    test('removes messages before first user message', () => {
      const messages = [
        createMessage('assistant', 'Orphaned assistant'),
        createMessage('tool', 'Orphaned tool'),
        createMessage('user', 'First user message'),
        createMessage('assistant', 'Response')
      ]
      
      const result = service.ensureConversationFlow(messages)
      
      expect(result).toHaveLength(2)
      expect(result[0].content).toBe('First user message')
      expect(result[1].content).toBe('Response')
    })

    test('handles conversation with no user messages', () => {
      const messages = [
        createMessage('assistant', 'Assistant only'),
        createMessage('tool', 'Tool only')
      ]
      
      const result = service.ensureConversationFlow(messages)
      
      expect(result).toEqual(messages)
    })

    test('handles empty conversation', () => {
      const result = service.ensureConversationFlow([])
      expect(result).toEqual([])
    })
  })

  describe('Orphaned Tool Message Cleaning', () => {
    test('identifies and removes orphaned tool messages', () => {
      const messages = [
        createMessage('assistant', 'Using tools', {
          tool_calls: [createToolCall('tc1', 'valid_tool')]
        }),
        createMessage('tool', 'Valid result', { tool_call_id: 'tc1' }),
        createMessage('tool', 'Orphaned result', { tool_call_id: 'tc_orphan' }),
        createMessage('user', 'Next question'),
        createMessage('tool', 'Another orphan') // No tool_call_id
      ]
      
      const result = service.cleanOrphanedToolMessages(messages)
      
      expect(result.cleanedMessages).toHaveLength(3)
      expect(result.removedCount).toBe(2)
      expect(result.warnings).toHaveLength(2)
      expect(result.warnings[0]).toContain('tc_orphan')
      expect(result.warnings[1]).toContain('without proper context')
    })

    test('tracks tool calls correctly across multiple assistant messages', () => {
      const messages = [
        createMessage('assistant', 'First tools', {
          tool_calls: [
            createToolCall('tc1', 'tool1'),
            createToolCall('tc2', 'tool2')
          ]
        }),
        createMessage('tool', 'Result 1', { tool_call_id: 'tc1' }),
        createMessage('assistant', 'Second tools', {
          tool_calls: [createToolCall('tc3', 'tool3')]
        }),
        createMessage('tool', 'Result 2', { tool_call_id: 'tc2' }), // Should be orphaned
        createMessage('tool', 'Result 3', { tool_call_id: 'tc3' })
      ]
      
      const result = service.cleanOrphanedToolMessages(messages)
      
      expect(result.cleanedMessages).toHaveLength(4)
      expect(result.removedCount).toBe(1)
      expect(result.warnings[0]).toContain('tc2')
    })

    test('handles conversation with no orphaned messages', () => {
      const messages = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Using tool', {
          tool_calls: [createToolCall('tc1', 'search')]
        }),
        createMessage('tool', 'Search result', { tool_call_id: 'tc1' }),
        createMessage('assistant', 'Here is the result')
      ]
      
      const result = service.cleanOrphanedToolMessages(messages)
      
      expect(result.cleanedMessages).toEqual(messages)
      expect(result.removedCount).toBe(0)
      expect(result.warnings).toHaveLength(0)
    })
  })

  describe('Conversation Statistics', () => {
    test('calculates correct statistics for mixed conversation', () => {
      const messages = [
        createMessage('user', 'Question 1'),
        createMessage('assistant', 'Answer with tools', {
          tool_calls: [
            createToolCall('tc1', 'tool1'),
            createToolCall('tc2', 'tool2')
          ]
        }),
        createMessage('tool', 'Tool result 1', { tool_call_id: 'tc1' }),
        createMessage('tool', 'Tool result 2', { tool_call_id: 'tc2' }),
        createMessage('assistant', 'Final answer'),
        createMessage('user', 'Question 2'),
        createMessage('tool', 'Orphaned tool result', { tool_call_id: 'tc_orphan' })
      ]
      
      const stats = service.getConversationStats(messages)
      
      expect(stats).toEqual({
        totalMessages: 7,
        userMessages: 2,
        assistantMessages: 2,
        toolMessages: 3,
        toolCalls: 2,
        orphanedToolMessages: 1
      })
    })

    test('handles empty conversation', () => {
      const stats = service.getConversationStats([])
      
      expect(stats).toEqual({
        totalMessages: 0,
        userMessages: 0,
        assistantMessages: 0,
        toolMessages: 0,
        toolCalls: 0,
        orphanedToolMessages: 0
      })
    })

    test('correctly counts multiple tool calls in single message', () => {
      const messages = [
        createMessage('assistant', 'Multiple tools', {
          tool_calls: [
            createToolCall('tc1', 'tool1'),
            createToolCall('tc2', 'tool2'),
            createToolCall('tc3', 'tool3')
          ]
        })
      ]
      
      const stats = service.getConversationStats(messages)
      
      expect(stats.toolCalls).toBe(3)
      expect(stats.assistantMessages).toBe(1)
    })
  })

  describe('LLM API Preparation', () => {
    test('prepares valid conversation for LLM API', () => {
      const messages = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Using tool', {
          tool_calls: [createToolCall('tc1', 'search_tool', { query: 'test' })]
        }),
        createMessage('tool', 'Search results', { tool_call_id: 'tc1' }),
        createMessage('assistant', 'Here are the results')
      ]
      
      const result = service.prepareForLLMApi(messages)
      
      expect(result).toHaveLength(4)
      expect(result[0]).toEqual({
        role: 'user',
        content: 'Hello'
      })
      expect(result[1]).toHaveProperty('tool_calls')
      expect(result[1].tool_calls[0]).toEqual({
        id: 'tc1',
        type: 'function',
        function: {
          name: 'search_tool',
          arguments: JSON.stringify({ query: 'test' })
        }
      })
      expect(result[2]).toEqual({
        role: 'tool',
        content: 'Search results',
        tool_call_id: 'tc1'
      })
    })

    test('excludes tools when requested', () => {
      const messages = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Using tool', {
          tool_calls: [createToolCall('tc1', 'search_tool')]
        }),
        createMessage('tool', 'Search results', { tool_call_id: 'tc1' }),
        createMessage('assistant', 'Here are the results')
      ]
      
      const result = service.prepareForLLMApi(messages, true)
      
      expect(result).toHaveLength(2)
      expect(result[0].role).toBe('user')
      expect(result[1].role).toBe('assistant')
      expect(result[1]).not.toHaveProperty('tool_calls')
    })

    test('handles string parameters in tool calls', () => {
      const messages = [
        createMessage('assistant', 'Using tool', {
          tool_calls: [createToolCall('tc1', 'search_tool', '{"query": "test"}')]
        })
      ]
      
      const result = service.prepareForLLMApi(messages)
      
      expect(result[0].tool_calls[0].function.arguments).toBe('{"query": "test"}')
    })

    test('cleans orphaned messages before API preparation', () => {
      const messages = [
        createMessage('assistant', 'Using tool', {
          tool_calls: [createToolCall('tc1', 'search_tool')]
        }),
        createMessage('tool', 'Valid result', { tool_call_id: 'tc1' }),
        createMessage('tool', 'Orphaned result', { tool_call_id: 'tc_orphan' })
      ]
      
      const result = service.prepareForLLMApi(messages)
      
      expect(result).toHaveLength(2) // Assistant + valid tool message only
      expect(result[1].tool_call_id).toBe('tc1')
    })
  })

  describe('Message Addition with Validation', () => {
    test('adds valid user message', () => {
      const existingMessages = [
        createMessage('user', 'Hello')
      ]
      const newMessage = createMessage('assistant', 'Hi there')
      
      const result = service.addMessageWithValidation(existingMessages, newMessage)
      
      expect(result.isValid).toBe(true)
      expect(result.updatedMessages).toHaveLength(2)
      expect(result.warnings).toHaveLength(0)
    })

    test('rejects message without role or content', () => {
      const existingMessages: ChatMessage[] = []
      const invalidMessage = { content: 'Missing role' } as ChatMessage
      
      const result = service.addMessageWithValidation(existingMessages, invalidMessage)
      
      expect(result.isValid).toBe(false)
      expect(result.updatedMessages).toEqual(existingMessages)
      expect(result.warnings).toContain('Message missing required role or content')
    })

    test('adds unique ID and timestamp to message', () => {
      const existingMessages: ChatMessage[] = []
      const messageWithoutId = createMessage('user', 'Hello', { id: undefined })
      delete messageWithoutId.id
      delete messageWithoutId.timestamp
      
      const result = service.addMessageWithValidation(existingMessages, messageWithoutId)
      
      expect(result.isValid).toBe(true)
      expect(result.updatedMessages[0]).toHaveProperty('id')
      expect(result.updatedMessages[0]).toHaveProperty('timestamp')
    })

    test('validates tool message context', () => {
      const existingMessages = [
        createMessage('assistant', 'Using tool', {
          tool_calls: [createToolCall('tc1', 'search_tool')]
        })
      ]
      const validToolMessage = createMessage('tool', 'Result', { tool_call_id: 'tc1' })
      
      const result = service.addMessageWithValidation(existingMessages, validToolMessage)
      
      expect(result.isValid).toBe(true)
      expect(result.warnings).toHaveLength(0)
    })

    test('warns about tool message without matching tool call', () => {
      const existingMessages = [
        createMessage('assistant', 'No tools used')
      ]
      const orphanedToolMessage = createMessage('tool', 'Result', { tool_call_id: 'tc_nonexistent' })
      
      const result = service.addMessageWithValidation(existingMessages, orphanedToolMessage)
      
      expect(result.warnings).toContain(
        expect.stringContaining('has no matching assistant tool call')
      )
    })

    test('rejects tool message without tool_call_id', () => {
      const existingMessages: ChatMessage[] = []
      const invalidToolMessage = createMessage('tool', 'Result')
      
      const result = service.addMessageWithValidation(existingMessages, invalidToolMessage)
      
      expect(result.isValid).toBe(false)
      expect(result.warnings).toContain('Tool message missing tool_call_id')
    })
  })

  describe('Complete Validation Pipeline', () => {
    test('validateHistoryForToolExecution applies full pipeline', () => {
      const messages = [
        // Start with some orphaned messages
        createMessage('assistant', 'Orphaned at start'),
        createMessage('tool', 'Orphaned tool'),
        // Valid conversation flow
        createMessage('user', 'Real conversation starts'),
        createMessage('assistant', 'Using tools', {
          tool_calls: [createToolCall('tc1', 'search_tool')]
        }),
        createMessage('tool', 'Valid result', { tool_call_id: 'tc1' }),
        createMessage('tool', 'Orphaned result', { tool_call_id: 'tc_orphan' }),
        createMessage('assistant', 'Final answer')
      ]
      
      const result = service.validateHistoryForToolExecution(messages)
      
      expect(result.isValid).toBe(true) // No fatal errors
      expect(result.messages).toHaveLength(4) // Cleaned and flow-validated
      expect(result.messages[0].content).toBe('Real conversation starts')
      expect(result.warnings).toContain('Conversation flow adjusted')
    })

    test('handles empty conversation', () => {
      const result = service.validateHistoryForToolExecution([])
      
      expect(result.isValid).toBe(false)
      expect(result.messages).toHaveLength(0)
      expect(result.warnings).toContain('Empty conversation history')
    })

    test('reports missing tool responses', () => {
      const messages = [
        createMessage('user', 'Question'),
        createMessage('assistant', 'Using tools', {
          tool_calls: [
            createToolCall('tc1', 'tool1'),
            createToolCall('tc2', 'tool2')
          ]
        }),
        createMessage('tool', 'Only one result', { tool_call_id: 'tc1' })
        // Missing result for tc2
      ]
      
      const result = service.validateHistoryForToolExecution(messages)
      
      expect(result.warnings).toContain(
        expect.stringContaining('Missing tool responses: 1 tool calls without responses')
      )
    })
  })

  describe('Utility Methods', () => {
    test('getConversationSummary provides comprehensive overview', () => {
      const messages = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Using tool', {
          tool_calls: [createToolCall('tc1', 'search')]
        }),
        createMessage('tool', 'Result', { tool_call_id: 'tc1' }),
        createMessage('tool', 'Orphaned', { tool_call_id: 'tc_orphan' })
      ]
      
      const summary = service.getConversationSummary(messages)
      
      expect(summary).toContain('Total messages: 4')
      expect(summary).toContain('User: 1, Assistant: 1, Tool: 2')
      expect(summary).toContain('Tool calls: 1, Orphaned: 1')
    })

    test('configure updates configuration', () => {
      const newConfig = { conversationHistoryLimit: 100 }
      expect(() => service.configure(newConfig)).not.toThrow()
    })

    test('reset completes without error', () => {
      expect(() => service.reset()).not.toThrow()
    })
  })

  describe('Error Handling', () => {
    test('handles validation errors gracefully', () => {
      // Mock a validation error
      const originalConsoleLog = console.log
      console.log = jest.fn(() => {
        throw new Error('Validation failed')
      })
      
      const messages = [createMessage('user', 'Hello')]
      const result = service.validateHistoryForToolExecution(messages)
      
      expect(result.isValid).toBe(false)
      expect(result.warnings).toContain('Validation failed due to error')
      expect(mockErrorLogger.logError).toHaveBeenCalled()
      
      // Restore console.log
      console.log = originalConsoleLog
    })

    test('handles message addition errors gracefully', () => {
      // Force an error during validation
      const service = createTestService()
      const originalMethod = service.validateHistoryForToolExecution
      service.validateHistoryForToolExecution = jest.fn(() => {
        throw new Error('Validation error')
      })
      
      const result = service.addMessageWithValidation([], createMessage('user', 'Hello'))
      
      expect(result.isValid).toBe(false)
      expect(result.warnings).toContain('Failed to add message due to error')
      
      // Restore method
      service.validateHistoryForToolExecution = originalMethod
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

    test('logs validation progress with emoji formatting', () => {
      const messages = [
        createMessage('user', 'Hello'),
        createMessage('assistant', 'Hi')
      ]
      
      service.validateAndCleanHistory(messages)
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '🔍 VALIDATION: Starting validation of', 2, 'messages'
      )
      expect(consoleSpy).toHaveBeenCalledWith('🔍 VALIDATION: Keeping user message')
      expect(consoleSpy).toHaveBeenCalledWith('🔍 VALIDATION: Finished validation, returning', 2, 'messages')
    })

    test('logs conversation flow adjustments', () => {
      const messages = [
        createMessage('assistant', 'Orphaned'),
        createMessage('user', 'First user message')
      ]
      
      service.ensureConversationFlow(messages)
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '📝 Removing 1 messages before first user message for proper flow'
      )
    })

    test('logs service reset', () => {
      service.reset()
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '🔄 ConversationHistoryService reset (stateless service)'
      )
    })
  })
})