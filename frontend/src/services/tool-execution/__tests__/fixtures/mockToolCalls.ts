/**
 * Mock Tool Calls for Testing
 * 
 * Provides comprehensive mock data for testing tool execution services
 */

import { ToolCall, ToolExecutionResult } from '../../types/ToolExecutionTypes'

export const mockToolCalls: ToolCall[] = [
  {
    id: 'tool_call_1',
    name: 'search_documents',
    parameters: {
      query: 'test query',
      limit: 10
    },
    status: 'pending'
  },
  {
    id: 'tool_call_2',
    name: 'get_weather',
    parameters: {
      location: 'San Francisco',
      units: 'celsius'
    },
    status: 'pending'
  },
  {
    id: 'tool_call_3',
    name: 'calculate',
    parameters: {
      expression: '2 + 2'
    },
    status: 'pending'
  }
]

export const mockSuccessfulToolResults: ToolExecutionResult[] = [
  {
    success: true,
    result: {
      content: [
        {
          type: 'text',
          text: 'Found 5 relevant documents matching your query.'
        }
      ]
    }
  },
  {
    success: true,
    result: {
      content: [
        {
          type: 'text',
          text: 'Current weather in San Francisco: 18°C, cloudy'
        }
      ]
    }
  },
  {
    success: true,
    result: {
      content: [
        {
          type: 'text',
          text: 'The result of 2 + 2 is 4'
        }
      ]
    }
  }
]

export const mockFailedToolResults: ToolExecutionResult[] = [
  {
    success: false,
    error: 'Tool not found or disabled'
  },
  {
    success: false,
    error: 'Invalid arguments: missing required parameter "location"'
  },
  {
    success: false,
    error: 'MCP Error: Validation failed - expression must be a valid mathematical expression'
  }
]

export const mockValidationErrors = {
  missingParameter: 'Invalid arguments: missing required parameter "location"',
  wrongType: 'Invalid arguments: expected string but got number for parameter "query"',
  mcpValidation: 'MCP Error -32602: Invalid params - indices parameter must be an array',
  serverError: 'Tool execution failed: Internal server error'
}

export const mockComplexToolCall: ToolCall = {
  id: 'complex_tool_call',
  name: 'complex_search',
  parameters: {
    query: 'complex search query',
    filters: {
      date_range: {
        start: '2023-01-01',
        end: '2023-12-31'
      },
      categories: ['documents', 'emails']
    },
    limit: 50,
    sort_by: 'relevance'
  },
  status: 'pending'
}

export const mockNestedToolResult: ToolExecutionResult = {
  success: true,
  result: {
    jsonrpc: '2.0',
    result: {
      content: [
        {
          type: 'text',
          text: 'Search completed successfully'
        }
      ],
      structuredContent: {
        results: [
          { id: 1, title: 'Document 1', score: 0.95 },
          { id: 2, title: 'Document 2', score: 0.87 }
        ],
        totalResults: 2,
        queryTime: 123
      }
    }
  }
}

export const mockRetryableToolCall: ToolCall = {
  id: 'retryable_tool_call',
  name: 'search_indices',
  parameters: {
    index_name: 'documents' // This will cause a validation error that can be corrected to indices: ['documents']
  },
  status: 'pending'
}

export const mockServerMappings = {
  'search_documents': 1,
  'get_weather': 2,
  'calculate': 3,
  'complex_search': 1,
  'search_indices': 1
}

export const mockServers = [
  {
    id: 1,
    name: 'document-server',
    tools: [
      { name: 'search_documents', is_enabled: true },
      { name: 'complex_search', is_enabled: true },
      { name: 'search_indices', is_enabled: true }
    ]
  },
  {
    id: 2,
    name: 'weather-server',
    tools: [
      { name: 'get_weather', is_enabled: true }
    ]
  },
  {
    id: 3,
    name: 'calculator-server',
    tools: [
      { name: 'calculate', is_enabled: true }
    ]
  }
]

// Helper functions for creating dynamic mock data
export function createMockToolCall(
  name: string,
  parameters: any = {},
  status: 'pending' | 'completed' | 'error' = 'pending'
): ToolCall {
  return {
    id: `tool_call_${Date.now()}_${Math.random()}`,
    name,
    parameters,
    status
  }
}

export function createMockToolResult(
  success: boolean,
  content?: string,
  error?: string
): ToolExecutionResult {
  if (success) {
    return {
      success: true,
      result: {
        content: [
          {
            type: 'text',
            text: content || 'Mock successful result'
          }
        ]
      }
    }
  } else {
    return {
      success: false,
      error: error || 'Mock error'
    }
  }
}

export function createMockToolCalls(count: number, prefix: string = 'test_tool'): ToolCall[] {
  return Array.from({ length: count }, (_, i) => 
    createMockToolCall(`${prefix}_${i}`, { param: `value_${i}` })
  )
}