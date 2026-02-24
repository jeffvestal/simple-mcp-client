/**
 * Mock API Responses for Testing
 * 
 * Provides mock responses from external APIs (MCP servers, LLM APIs)
 */

// Mock MCP Server responses
export const mockMCPServerListResponse = [
  {
    id: 1,
    name: 'document-server',
    status: 'connected',
    url: 'http://localhost:3001'
  },
  {
    id: 2,
    name: 'weather-server',
    status: 'connected', 
    url: 'http://localhost:3002'
  },
  {
    id: 3,
    name: 'calculator-server',
    status: 'connected',
    url: 'http://localhost:3003'
  }
]

export const mockMCPServerWithToolsResponse = {
  id: 1,
  name: 'document-server',
  tools: [
    {
      name: 'search_documents',
      description: 'Search through document collection',
      is_enabled: true,
      parameters: {
        query: { type: 'string', required: true },
        limit: { type: 'number', required: false }
      }
    },
    {
      name: 'get_document',
      description: 'Retrieve a specific document',
      is_enabled: true,
      parameters: {
        id: { type: 'string', required: true }
      }
    },
    {
      name: 'disabled_tool',
      description: 'This tool is disabled',
      is_enabled: false
    }
  ]
}

// Mock tool execution responses
export const mockSuccessfulToolResponse = {
  success: true,
  result: {
    jsonrpc: '2.0',
    result: {
      content: [
        {
          type: 'text',
          text: 'Tool executed successfully with this result'
        }
      ],
      metadata: {
        execution_time: 156,
        server_id: 1
      }
    }
  }
}

export const mockFailedToolResponse = {
  success: false,
  error: 'Tool execution failed: Invalid parameters provided',
  details: {
    parameter_errors: [
      'Missing required parameter: query',
      'Invalid type for parameter limit: expected number, got string'
    ]
  }
}

export const mockValidationErrorResponse = {
  success: false,
  error: 'MCP Error -32602: Invalid params - index_name parameter should be indices array',
  code: -32602
}

export const mockTimeoutResponse = {
  success: false,
  error: 'Tool execution timeout after 30 seconds'
}

export const mockServerUnavailableResponse = {
  success: false,
  error: 'MCP server not available or disconnected'
}

// Mock LLM API responses
export const mockLLMChatResponse = {
  response: 'Based on the tool results, here is my response...',
  tool_calls: [],
  model: 'gpt-4',
  usage: {
    prompt_tokens: 150,
    completion_tokens: 75,
    total_tokens: 225
  }
}

export const mockLLMChatWithToolCallsResponse = {
  response: 'I need to use some tools to help you.',
  tool_calls: [
    {
      id: 'tool_call_abc123',
      type: 'function',
      function: {
        name: 'search_documents',
        arguments: '{"query": "AI research", "limit": 10}'
      }
    }
  ],
  model: 'gpt-4',
  usage: {
    prompt_tokens: 200,
    completion_tokens: 45,
    total_tokens: 245
  }
}

export const mockLLMRetryResponse = {
  response: 'Let me fix the parameters and try again.',
  tool_calls: [
    {
      id: 'tool_call_retry_456',
      type: 'function', 
      function: {
        name: 'search_documents',
        arguments: '{"indices": ["documents"], "query": "corrected query", "limit": 5}'
      }
    }
  ],
  model: 'gpt-4',
  usage: {
    prompt_tokens: 300,
    completion_tokens: 55,
    total_tokens: 355
  }
}

export const mockLLMErrorResponse = {
  error: 'LLM API error: Rate limit exceeded',
  code: 'rate_limit_exceeded'
}

// Mock complex tool responses with nested content
export const mockComplexToolResponse = {
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
          {
            id: 'doc_1',
            title: 'AI Research Paper',
            score: 0.95,
            summary: 'Comprehensive overview of AI techniques',
            metadata: {
              author: 'Dr. Smith',
              date: '2023-11-15',
              category: 'research'
            }
          },
          {
            id: 'doc_2', 
            title: 'Machine Learning Basics',
            score: 0.87,
            summary: 'Introduction to ML concepts',
            metadata: {
              author: 'Prof. Johnson',
              date: '2023-10-20',
              category: 'educational'
            }
          }
        ],
        pagination: {
          total: 2,
          page: 1,
          limit: 10
        },
        query_metadata: {
          original_query: 'AI research',
          processed_query: 'artificial intelligence research',
          execution_time: 234
        }
      }
    }
  }
}

// Mock responses for different error scenarios
export const mockErrorResponses = {
  networkError: {
    success: false,
    error: 'Network error: Unable to connect to MCP server'
  },
  
  timeoutError: {
    success: false,
    error: 'Request timeout: Tool execution took too long'
  },
  
  validationError: {
    success: false,
    error: 'Invalid arguments: missing required parameter "query"'
  },
  
  serverError: {
    success: false,
    error: 'Internal server error: Tool execution failed'
  },
  
  authError: {
    success: false,
    error: 'Authentication failed: Invalid or expired credentials'
  }
}

// Helper functions for creating dynamic mock responses
export function createMockToolResponse(
  success: boolean,
  content?: string,
  error?: string,
  metadata?: any
) {
  if (success) {
    return {
      success: true,
      result: {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'text',
              text: content || 'Mock successful response'
            }
          ],
          ...(metadata && { metadata })
        }
      }
    }
  } else {
    return {
      success: false,
      error: error || 'Mock error response'
    }
  }
}

export function createMockLLMResponse(
  response: string,
  toolCalls: any[] = []
) {
  return {
    response,
    tool_calls: toolCalls,
    model: 'gpt-4',
    usage: {
      prompt_tokens: Math.floor(Math.random() * 200) + 100,
      completion_tokens: Math.floor(Math.random() * 100) + 50,
      total_tokens: 0
    }
  }
}

// Mock responses for testing retry scenarios
export const mockRetryScenarios = {
  parameterCorrection: {
    original: {
      success: false,
      error: 'Invalid arguments: index_name parameter should be indices array'
    },
    corrected: {
      success: true,
      result: {
        content: [{ type: 'text', text: 'Search completed with corrected parameters' }]
      }
    }
  },
  
  temporaryFailure: {
    first: {
      success: false,
      error: 'Temporary server error, please retry'
    },
    second: {
      success: true,
      result: {
        content: [{ type: 'text', text: 'Tool executed successfully on retry' }]
      }
    }
  }
}