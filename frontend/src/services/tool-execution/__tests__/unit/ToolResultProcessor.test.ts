/**
 * Unit Tests for ToolResultProcessor Service
 * 
 * Tests the tool result processing, content extraction, and formatting functionality
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ToolResultProcessor } from '../../ToolResultProcessor'
import { ToolExecutionResult, ServiceConfiguration } from '../../types/ToolExecutionTypes'
import { ExternalDependencies } from '../../types/ServiceDependencies'
import { 
  mockSuccessfulToolResults, 
  mockFailedToolResults, 
  mockNestedToolResult,
  mockComplexToolCall 
} from '../fixtures/mockToolCalls'

// Mock external dependencies
const mockExternalDependencies: ExternalDependencies = {
  api: {
    getMCPServers: async () => [],
    getMCPServerWithTools: async () => ({ tools: [] }),
    callTool: async () => ({ success: true }),
    chat: async () => ({ response: 'Mock response' })
  },
  store: {
    messages: [],
    addMessage: () => 'mock_id',
    updateMessage: () => {}
  },
  toast: {
    toast: () => {}
  },
  memoryManager: {
    registerCleanupTask: () => {},
    addMemoryPressureListener: () => {},
    getMemoryStats: () => ({})
  },
  performanceMonitor: {
    startToolExecution: () => ({}),
    recordMetric: () => {}
  },
  errorLogger: {
    logError: () => {}
  },
  safeJson: {
    safeJsonParseWithDefault: (text: string, defaultValue: any) => {
      try {
        return JSON.parse(text)
      } catch {
        return defaultValue
      }
    }
  }
}

const mockConfiguration: ServiceConfiguration = {
  maxRetries: 3,
  cacheExpiryMs: 300000,
  conversationHistoryLimit: 50,
  enablePerformanceMonitoring: true,
  enableMemoryTracking: true
}

describe('ToolResultProcessor', () => {
  let processor: ToolResultProcessor

  beforeEach(() => {
    processor = new ToolResultProcessor(mockExternalDependencies, mockConfiguration)
  })

  describe('extractAndCleanToolContent', () => {
    it('should extract content from successful tool results', () => {
      const toolResult: ToolExecutionResult = {
        success: true,
        result: {
          content: [
            {
              type: 'text',
              text: 'This is the tool result content'
            }
          ]
        }
      }

      const result = processor.extractAndCleanToolContent(toolResult, 'test_tool')
      expect(result).toBe('This is the tool result content')
    })

    it('should handle nested MCP result structures', () => {
      const toolResult: ToolExecutionResult = {
        success: true,
        result: {
          result: {
            content: [
              {
                type: 'text',
                text: 'Nested content'
              }
            ]
          }
        }
      }

      const result = processor.extractAndCleanToolContent(toolResult, 'test_tool')
      expect(result).toBe('Nested content')
    })

    it('should extract error messages from failed results', () => {
      const toolResult: ToolExecutionResult = {
        success: false,
        result: {
          jsonrpc: '2.0',
          error: {
            message: 'Tool execution failed'
          }
        }
      }

      const result = processor.extractAndCleanToolContent(toolResult, 'test_tool')
      expect(result).toContain('Tool test_tool encountered an error: Tool execution failed')
    })

    it('should format list_indices results correctly', () => {
      const toolResult: ToolExecutionResult = {
        success: true,
        result: {
          indices: [
            {
              index: 'documents',
              status: 'open',
              docsCount: 1000,
              'store.size': '5MB',
              health: 'green'
            },
            {
              index: 'logs',
              status: 'open',
              docsCount: 5000,
              'store.size': '20MB',
              health: 'yellow'
            }
          ]
        }
      }

      const result = processor.extractAndCleanToolContent(toolResult, 'list_indices')
      expect(result).toContain('Found 2 Elasticsearch indices')
      expect(result).toContain('**documents** (open)')
      expect(result).toContain('Documents: 1000')
      expect(result).toContain('Size: 5MB')
      expect(result).toContain('Health: green')
    })

    it('should format search results correctly', () => {
      const toolResult: ToolExecutionResult = {
        success: true,
        result: {
          hits: {
            total: { value: 3 },
            hits: [
              { _source: { title: 'Document 1', content: 'Content 1' }},
              { _source: { title: 'Document 2', content: 'Content 2' }},
              { _source: { title: 'Document 3', content: 'Content 3' }}
            ]
          }
        }
      }

      const result = processor.extractAndCleanToolContent(toolResult, 'search_documents')
      expect(result).toContain('Found 3 results')
      expect(result).toContain('Document 1')
      expect(result).toContain('Content 1')
    })

    it('should handle search results with no hits', () => {
      const toolResult: ToolExecutionResult = {
        success: true,
        result: {
          hits: {
            total: { value: 0 },
            hits: []
          }
        }
      }

      const result = processor.extractAndCleanToolContent(toolResult, 'search_documents')
      expect(result).toBe('No results found for the search query.')
    })

    it('should format mapping results correctly', () => {
      const toolResult: ToolExecutionResult = {
        success: true,
        result: {
          'documents': {
            mappings: {
              properties: {
                title: { type: 'text' },
                content: { type: 'text' },
                date: { type: 'date' },
                tags: { type: 'keyword' }
              }
            }
          }
        }
      }

      const result = processor.extractAndCleanToolContent(toolResult, 'get_mapping')
      expect(result).toContain('Index mappings')
      expect(result).toContain('**documents**')
      expect(result).toContain('Fields: title, content, date, tags')
    })

    it('should handle array data generically', () => {
      const toolResult: ToolExecutionResult = {
        success: true,
        result: ['item1', 'item2', 'item3', 'item4']
      }

      const result = processor.extractAndCleanToolContent(toolResult, 'generic_tool')
      expect(result).toContain('Found 4 items')
      expect(result).toContain('1. item1')
      expect(result).toContain('2. item2')
      expect(result).toContain('3. item3')
    })

    it('should handle object data generically', () => {
      const toolResult: ToolExecutionResult = {
        success: true,
        result: {
          name: 'Test Object',
          value: 42,
          active: true
        }
      }

      const result = processor.extractAndCleanToolContent(toolResult, 'generic_tool')
      expect(result).toContain('**name**: Test Object')
      expect(result).toContain('**value**: 42')
      expect(result).toContain('**active**: true')
    })
  })

  describe('processToolResult', () => {
    it('should process successful tool results with metadata', () => {
      const toolResult: ToolExecutionResult = mockSuccessfulToolResults[0]
      
      const result = processor.processToolResult(toolResult, 'search_documents', 150, 0)
      
      expect(result.isValid).toBe(true)
      expect(result.content).toContain('Found 5 relevant documents')
      expect(result.metadata?.toolName).toBe('search_documents')
      expect(result.metadata?.executionTime).toBe(150)
      expect(result.metadata?.retryCount).toBe(0)
    })

    it('should handle processing errors gracefully', () => {
      const invalidToolResult = null as any
      
      const result = processor.processToolResult(invalidToolResult, 'broken_tool', 100, 1)
      
      expect(result.isValid).toBe(false)
      expect(result.content).toContain('Error processing tool result')
      expect(result.metadata?.toolName).toBe('broken_tool')
    })
  })

  describe('formatToolResultForConversation', () => {
    it('should format tool results for conversation history', () => {
      const toolResult: ToolExecutionResult = mockSuccessfulToolResults[0]
      
      const result = processor.formatToolResultForConversation(
        toolResult, 
        'search_documents', 
        'tool_call_123'
      )
      
      expect(result.role).toBe('tool')
      expect(result.tool_call_id).toBe('tool_call_123')
      expect(result.content).toContain('Found 5 relevant documents')
    })
  })

  describe('validateToolResult', () => {
    it('should validate correct tool results', () => {
      const validResult = {
        success: true,
        result: { content: 'Some content' }
      }
      
      const validation = processor.validateToolResult(validResult)
      
      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)
      expect(validation.cleanedResult).toBeDefined()
      expect(validation.cleanedResult?.success).toBe(true)
    })

    it('should validate failed tool results with errors', () => {
      const validFailedResult = {
        success: false,
        error: 'Tool execution failed'
      }
      
      const validation = processor.validateToolResult(validFailedResult)
      
      expect(validation.isValid).toBe(true)
      expect(validation.errors).toHaveLength(0)
      expect(validation.cleanedResult?.success).toBe(false)
      expect(validation.cleanedResult?.error).toBe('Tool execution failed')
    })

    it('should reject invalid tool results', () => {
      const invalidResult = {
        // Missing success field
        result: 'some content'
      }
      
      const validation = processor.validateToolResult(invalidResult)
      
      expect(validation.isValid).toBe(false)
      expect(validation.errors).toContain('Tool result must have a boolean success field')
      expect(validation.cleanedResult).toBeUndefined()
    })

    it('should reject null or undefined results', () => {
      const validation1 = processor.validateToolResult(null)
      const validation2 = processor.validateToolResult(undefined)
      
      expect(validation1.isValid).toBe(false)
      expect(validation1.errors).toContain('Tool result is null or undefined')
      
      expect(validation2.isValid).toBe(false)
      expect(validation2.errors).toContain('Tool result is null or undefined')
    })

    it('should require error field for failed results', () => {
      const invalidFailedResult = {
        success: false
        // Missing error field
      }
      
      const validation = processor.validateToolResult(invalidFailedResult)
      
      expect(validation.isValid).toBe(false)
      expect(validation.errors).toContain('Failed tool result must have an error field')
    })

    it('should require result field for successful results', () => {
      const invalidSuccessResult = {
        success: true
        // Missing result field
      }
      
      const validation = processor.validateToolResult(invalidSuccessResult)
      
      expect(validation.isValid).toBe(false)
      expect(validation.errors).toContain('Successful tool result must have a result field')
    })
  })

  describe('getToolSpecificFormatter', () => {
    it('should return formatter for list_indices tool', () => {
      const formatter = processor.getToolSpecificFormatter('list_indices')
      expect(formatter).toBeDefined()
    })

    it('should return formatter for search tools', () => {
      const formatter1 = processor.getToolSpecificFormatter('search_documents')
      const formatter2 = processor.getToolSpecificFormatter('search_logs')
      
      expect(formatter1).toBeDefined()
      expect(formatter2).toBeDefined()
    })

    it('should return formatter for mapping tools', () => {
      const formatter = processor.getToolSpecificFormatter('get_mapping')
      expect(formatter).toBeDefined()
    })

    it('should return null for unknown tools', () => {
      const formatter = processor.getToolSpecificFormatter('unknown_tool')
      expect(formatter).toBeNull()
    })
  })

  describe('service lifecycle methods', () => {
    it('should handle configuration updates', () => {
      const newConfig = { maxRetries: 5 }
      expect(() => processor.configure(newConfig)).not.toThrow()
    })

    it('should handle reset', () => {
      expect(() => processor.reset()).not.toThrow()
    })

    it('should handle disposal', () => {
      expect(() => processor.dispose()).not.toThrow()
    })
  })
})