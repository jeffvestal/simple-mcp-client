/**
 * Mock Conversations for Testing
 * 
 * Provides mock conversation data for testing conversation history services
 */

import { ChatMessage } from '../../types/ToolExecutionTypes'

export const mockSimpleConversation: ChatMessage[] = [
  {
    id: 'user_1',
    role: 'user',
    content: 'Search for documents about AI',
    timestamp: new Date('2023-12-01T10:00:00Z')
  },
  {
    id: 'assistant_1',
    role: 'assistant',
    content: 'I\'ll search for documents about AI for you.',
    tool_calls: [
      {
        id: 'tool_call_1',
        name: 'search_documents',
        parameters: { query: 'AI', limit: 10 },
        status: 'completed'
      }
    ],
    timestamp: new Date('2023-12-01T10:00:01Z')
  },
  {
    id: 'tool_1',
    role: 'tool',
    content: 'Found 5 documents about AI',
    tool_call_id: 'tool_call_1',
    timestamp: new Date('2023-12-01T10:00:02Z')
  },
  {
    id: 'assistant_2',
    role: 'assistant',
    content: 'I found 5 documents about AI. Here are the results...',
    timestamp: new Date('2023-12-01T10:00:03Z')
  }
]

export const mockConversationWithOrphans: ChatMessage[] = [
  {
    id: 'user_1',
    role: 'user',
    content: 'Help me with something',
    timestamp: new Date('2023-12-01T10:00:00Z')
  },
  {
    id: 'assistant_1',
    role: 'assistant',
    content: 'Sure! Let me help you.',
    tool_calls: [
      {
        id: 'tool_call_1',
        name: 'helper_tool',
        parameters: { action: 'help' },
        status: 'completed'
      }
    ],
    timestamp: new Date('2023-12-01T10:00:01Z')
  },
  // Orphaned tool message - no corresponding tool_call_id in assistant message
  {
    id: 'orphan_tool',
    role: 'tool',
    content: 'This tool result has no corresponding tool call',
    tool_call_id: 'nonexistent_tool_call',
    timestamp: new Date('2023-12-01T10:00:02Z')
  },
  {
    id: 'tool_1',
    role: 'tool',
    content: 'Helper tool executed successfully',
    tool_call_id: 'tool_call_1',
    timestamp: new Date('2023-12-01T10:00:03Z')
  },
  {
    id: 'assistant_2',
    role: 'assistant',
    content: 'I\'ve completed the help task.',
    timestamp: new Date('2023-12-01T10:00:04Z')
  }
]

export const mockLongConversation: ChatMessage[] = Array.from({ length: 60 }, (_, i) => {
  const isUser = i % 4 === 0
  const isAssistant = i % 4 === 1
  const isTool = i % 4 === 2
  const isFinalAssistant = i % 4 === 3
  
  if (isUser) {
    return {
      id: `user_${i}`,
      role: 'user' as const,
      content: `User message ${i}`,
      timestamp: new Date(`2023-12-01T${10 + Math.floor(i/4)}:${i%4*15}:00Z`)
    }
  } else if (isAssistant) {
    return {
      id: `assistant_${i}`,
      role: 'assistant' as const,
      content: `Assistant message ${i}`,
      tool_calls: [
        {
          id: `tool_call_${i}`,
          name: 'test_tool',
          parameters: { index: i },
          status: 'completed' as const
        }
      ],
      timestamp: new Date(`2023-12-01T${10 + Math.floor(i/4)}:${i%4*15}:01Z`)
    }
  } else if (isTool) {
    return {
      id: `tool_${i}`,
      role: 'tool' as const,
      content: `Tool result ${i}`,
      tool_call_id: `tool_call_${i-1}`,
      timestamp: new Date(`2023-12-01T${10 + Math.floor(i/4)}:${i%4*15}:02Z`)
    }
  } else {
    return {
      id: `assistant_final_${i}`,
      role: 'assistant' as const,
      content: `Final assistant message ${i}`,
      timestamp: new Date(`2023-12-01T${10 + Math.floor(i/4)}:${i%4*15}:03Z`)
    }
  }
})

export const mockConversationWithoutUserStart: ChatMessage[] = [
  {
    id: 'assistant_1',
    role: 'assistant',
    content: 'This conversation starts with assistant message',
    timestamp: new Date('2023-12-01T10:00:00Z')
  },
  {
    id: 'user_1',
    role: 'user',
    content: 'Now user responds',
    timestamp: new Date('2023-12-01T10:00:01Z')
  }
]

export const mockConversationWithMultipleToolCalls: ChatMessage[] = [
  {
    id: 'user_1',
    role: 'user',
    content: 'I need weather and document search',
    timestamp: new Date('2023-12-01T10:00:00Z')
  },
  {
    id: 'assistant_1',
    role: 'assistant',
    content: 'I\'ll get the weather and search documents for you.',
    tool_calls: [
      {
        id: 'tool_call_1',
        name: 'get_weather',
        parameters: { location: 'San Francisco' },
        status: 'completed'
      },
      {
        id: 'tool_call_2',
        name: 'search_documents',
        parameters: { query: 'weather reports', limit: 5 },
        status: 'completed'
      }
    ],
    timestamp: new Date('2023-12-01T10:00:01Z')
  },
  {
    id: 'tool_1',
    role: 'tool',
    content: 'Weather in San Francisco: 20°C, sunny',
    tool_call_id: 'tool_call_1',
    timestamp: new Date('2023-12-01T10:00:02Z')
  },
  {
    id: 'tool_2',
    role: 'tool',
    content: 'Found 3 weather-related documents',
    tool_call_id: 'tool_call_2',
    timestamp: new Date('2023-12-01T10:00:03Z')
  },
  {
    id: 'assistant_2',
    role: 'assistant',
    content: 'Here\'s the weather information and related documents...',
    timestamp: new Date('2023-12-01T10:00:04Z')
  }
]

export const mockInvalidConversation: ChatMessage[] = [
  {
    id: 'user_1',
    role: 'user',
    content: 'Start conversation',
    timestamp: new Date('2023-12-01T10:00:00Z')
  },
  {
    id: 'assistant_1',
    role: 'assistant',
    content: 'Response with broken tool calls',
    tool_calls: [
      {
        id: 'tool_call_1',
        name: 'broken_tool',
        parameters: { invalid: 'data' },
        status: 'error'
      }
    ],
    timestamp: new Date('2023-12-01T10:00:01Z')
  },
  // Missing tool message for tool_call_1
  {
    id: 'user_2',
    role: 'user',
    content: 'Continue conversation without tool result',
    timestamp: new Date('2023-12-01T10:00:02Z')
  }
]

// Helper functions for creating dynamic conversations
export function createMockMessage(
  role: 'user' | 'assistant' | 'tool',
  content: string,
  additionalProps: Partial<ChatMessage> = {}
): ChatMessage {
  return {
    id: `${role}_${Date.now()}_${Math.random()}`,
    role,
    content,
    timestamp: new Date(),
    ...additionalProps
  }
}

export function createMockConversation(messageCount: number): ChatMessage[] {
  const messages: ChatMessage[] = []
  
  for (let i = 0; i < messageCount; i += 2) {
    // User message
    messages.push(createMockMessage('user', `User message ${i/2 + 1}`))
    
    // Assistant response
    if (i + 1 < messageCount) {
      messages.push(createMockMessage('assistant', `Assistant response ${i/2 + 1}`))
    }
  }
  
  return messages
}

export function createMockConversationWithTools(toolCount: number): ChatMessage[] {
  const messages: ChatMessage[] = [
    createMockMessage('user', 'Please execute some tools')
  ]
  
  const toolCalls = Array.from({ length: toolCount }, (_, i) => ({
    id: `tool_call_${i}`,
    name: `test_tool_${i}`,
    parameters: { index: i },
    status: 'completed' as const
  }))
  
  messages.push(createMockMessage('assistant', 'Executing tools...', {
    tool_calls: toolCalls
  }))
  
  // Add tool result messages
  toolCalls.forEach((toolCall, i) => {
    messages.push(createMockMessage('tool', `Tool ${i} result`, {
      tool_call_id: toolCall.id
    }))
  })
  
  messages.push(createMockMessage('assistant', 'Tools executed successfully'))
  
  return messages
}