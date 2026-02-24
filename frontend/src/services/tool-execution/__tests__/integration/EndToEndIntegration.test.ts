/**
 * End-to-End Integration Test Suite
 * 
 * Tests complete real-world scenarios that simulate actual user interactions
 * with the tool execution system. These tests verify that the entire service
 * architecture works correctly for complex, realistic use cases.
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
  mockSuccessfulToolResponse,
  mockFailedToolResponse,
  mockValidationErrorResponse,
  mockLLMChatResponse,
  mockLLMRetryResponse,
  mockMCPServerListResponse,
  mockMCPServerWithToolsResponse
} from '../fixtures/mockApiResponses'

describe('End-to-End Integration Tests', () => {
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
      },
      store: {
        messages: [],
        addMessage: jest.fn((message) => {
          const id = `msg_${Date.now()}_${Math.random()}`
          mockDependencies.store.messages.push({ ...message, id })
          return id
        }),
        updateMessage: jest.fn((id, updates) => {
          const messageIndex = mockDependencies.store.messages.findIndex(m => m.id === id)
          if (messageIndex >= 0) {
            mockDependencies.store.messages[messageIndex] = {
              ...mockDependencies.store.messages[messageIndex],
              ...updates
            }
          }
        })
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

  describe('Real-World User Scenarios', () => {
    it('should handle a typical user search and analysis workflow', async () => {
      // Arrange - Simulate user asking to search and analyze data
      const conversationHistory: ChatMessage[] = [
        {
          id: 'msg_user_1',
          role: 'user',
          content: 'Search for recent documents about project Alpha and analyze the key themes'
        }
      ]

      const toolCalls: ToolCall[] = [
        {
          id: 'call_search',
          name: 'search_documents',
          parameters: { 
            query: 'project Alpha',
            time_range: 'recent',
            limit: 10
          },
          status: 'pending'
        },
        {
          id: 'call_analyze',
          name: 'analyze_themes',
          parameters: {
            documents: ['doc1', 'doc2', 'doc3'],
            analysis_type: 'key_themes'
          },
          status: 'pending'
        }
      ]

      // Mock different responses for different tools
      mockDependencies.api.callTool
        .mockResolvedValueOnce({
          ...mockSuccessfulToolResponse,
          result: {
            jsonrpc: '2.0',
            result: {
              content: [{
                type: 'text',
                text: 'Found 3 documents: doc1.pdf, doc2.pdf, doc3.pdf'
              }]
            }
          }
        })
        .mockResolvedValueOnce({
          ...mockSuccessfulToolResponse,
          result: {
            jsonrpc: '2.0',
            result: {
              content: [{
                type: 'text',
                text: 'Key themes: Innovation (45%), Risk Management (30%), Timeline (25%)'
              }]
            }
          }
        })

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        conversationHistory,
        'assistant_msg_search_analyze'
      )

      // Assert
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(2)
      
      // Verify search tool result
      expect(result.toolResults[0].tool_call_id).toBe('call_search')
      expect(result.toolResults[0].content).toContain('Found 3 documents')
      
      // Verify analysis tool result
      expect(result.toolResults[1].tool_call_id).toBe('call_analyze')
      expect(result.toolResults[1].content).toContain('Key themes')
      
      // Both tools should have been called
      expect(mockDependencies.api.callTool).toHaveBeenCalledTimes(2)
      
      // Performance monitoring should track the complex workflow
      expect(mockDependencies.performanceMonitor.startOperation).toHaveBeenCalled()
      expect(mockDependencies.performanceMonitor.recordMetric).toHaveBeenCalled()
    })

    it('should handle multi-step data processing with dependencies', async () => {
      // Arrange - Simulate a complex data processing pipeline
      const conversationHistory: ChatMessage[] = [
        {
          id: 'msg_user_pipeline',
          role: 'user',
          content: 'Process the customer data: first extract it, then clean it, then generate a report'
        }
      ]

      const toolCalls: ToolCall[] = [
        {
          id: 'call_extract',
          name: 'extract_customer_data',
          parameters: { source: 'database', format: 'csv' },
          status: 'pending'
        },
        {
          id: 'call_clean',
          name: 'clean_data',
          parameters: { input_file: 'raw_data.csv', remove_duplicates: true },
          status: 'pending'
        },
        {
          id: 'call_report',
          name: 'generate_report',
          parameters: { 
            data_file: 'clean_data.csv',
            report_type: 'customer_summary',
            include_charts: true
          },
          status: 'pending'
        }
      ]

      // Mock sequential responses for the pipeline
      mockDependencies.api.callTool
        .mockResolvedValueOnce({
          ...mockSuccessfulToolResponse,
          result: {
            jsonrpc: '2.0',
            result: {
              content: [{
                type: 'text',
                text: 'Extracted 1,250 customer records to raw_data.csv'
              }]
            }
          }
        })
        .mockResolvedValueOnce({
          ...mockSuccessfulToolResponse,
          result: {
            jsonrpc: '2.0',
            result: {
              content: [{
                type: 'text',
                text: 'Cleaned data: removed 45 duplicates, final count: 1,205 records in clean_data.csv'
              }]
            }
          }
        })
        .mockResolvedValueOnce({
          ...mockSuccessfulToolResponse,
          result: {
            jsonrpc: '2.0',
            result: {
              content: [{
                type: 'text',
                text: 'Generated customer summary report with 5 charts analyzing 1,205 customers'
              }]
            }
          }
        })

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        conversationHistory,
        'assistant_msg_pipeline'
      )

      // Assert
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(3)
      
      // Verify sequential execution and results
      expect(result.toolResults[0].content).toContain('Extracted 1,250 customer records')
      expect(result.toolResults[1].content).toContain('Cleaned data: removed 45 duplicates')
      expect(result.toolResults[2].content).toContain('Generated customer summary report')
      
      // All tools should have been executed in order
      expect(mockDependencies.api.callTool).toHaveBeenCalledTimes(3)
      
      // Verify sequential execution order
      const callOrder = mockDependencies.api.callTool.mock.calls
      expect(callOrder[0][0].tool_name).toBe('extract_customer_data')
      expect(callOrder[1][0].tool_name).toBe('clean_data')
      expect(callOrder[2][0].tool_name).toBe('generate_report')
    })

    it('should handle mixed success and failure scenarios gracefully', async () => {
      // Arrange - Simulate a scenario where some tools succeed and others fail
      const toolCalls: ToolCall[] = [
        {
          id: 'call_success_1',
          name: 'backup_database',
          parameters: { database: 'production', location: 's3' },
          status: 'pending'
        },
        {
          id: 'call_failure',
          name: 'deploy_application',
          parameters: { version: '2.1.0', environment: 'production' },
          status: 'pending'
        },
        {
          id: 'call_success_2',
          name: 'send_notification',
          parameters: { message: 'Deployment attempted', recipients: ['admin@company.com'] },
          status: 'pending'
        }
      ]

      // Mock mixed responses
      mockDependencies.api.callTool
        .mockResolvedValueOnce({
          ...mockSuccessfulToolResponse,
          result: {
            jsonrpc: '2.0',
            result: {
              content: [{
                type: 'text',
                text: 'Database backup completed successfully to s3://backups/prod-backup-20250123.sql'
              }]
            }
          }
        })
        .mockRejectedValueOnce(new Error('Deployment failed: version 2.1.0 has critical bugs'))
        .mockResolvedValueOnce({
          ...mockSuccessfulToolResponse,
          result: {
            jsonrpc: '2.0',
            result: {
              content: [{
                type: 'text',
                text: 'Notification sent to admin@company.com about deployment attempt'
              }]
            }
          }
        })

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        [],
        'assistant_msg_mixed_scenario'
      )

      // Assert
      expect(result.success).toBe(false) // Overall failure due to one tool failing
      expect(result.errors).toBeDefined()
      expect(result.errors!).toHaveLength(1)
      expect(result.errors![0]).toContain('deploy_application')
      
      // Should have partial success - 2 successful tool results
      expect(result.toolResults).toHaveLength(2)
      expect(result.toolResults[0].tool_call_id).toBe('call_success_1')
      expect(result.toolResults[0].content).toContain('Database backup completed')
      expect(result.toolResults[1].tool_call_id).toBe('call_success_2')
      expect(result.toolResults[1].content).toContain('Notification sent')
      
      // All tools should have been attempted
      expect(mockDependencies.api.callTool).toHaveBeenCalledTimes(3)
      
      // Error should have been logged
      expect(mockDependencies.errorLogger.logError).toHaveBeenCalled()
    })

    it('should handle parameter validation and retry in complex scenarios', async () => {
      // Arrange - Simulate a tool that needs parameter correction
      const conversationHistory: ChatMessage[] = [
        {
          id: 'msg_user_validation',
          role: 'user',
          content: 'Create a new project with specific settings and invite team members'
        }
      ]

      const toolCalls: ToolCall[] = [
        {
          id: 'call_create_project',
          name: 'create_project',
          parameters: { 
            name: 'New AI Project',
            team_lead: 'john.doe@company.com',
            budget: '50000', // String instead of number - should trigger validation error
            timeline: '6 months'
          },
          status: 'pending'
        },
        {
          id: 'call_invite_members',
          name: 'invite_team_members',
          parameters: {
            project_id: 'project_12345',
            members: ['alice@company.com', 'bob@company.com', 'carol@company.com']
          },
          status: 'pending'
        }
      ]

      // Mock validation error then success for first tool
      mockDependencies.api.callTool
        .mockResolvedValueOnce({
          ...mockValidationErrorResponse,
          error: 'Validation error: budget must be a number, not string'
        })
        .mockResolvedValueOnce({
          ...mockSuccessfulToolResponse,
          result: {
            jsonrpc: '2.0',
            result: {
              content: [{
                type: 'text',
                text: 'Project "New AI Project" created with ID: project_12345, budget: $50,000'
              }]
            }
          }
        })
        .mockResolvedValueOnce({
          ...mockSuccessfulToolResponse,
          result: {
            jsonrpc: '2.0',
            result: {
              content: [{
                type: 'text',
                text: 'Invited 3 team members to project_12345: alice, bob, carol'
              }]
            }
          }
        })

      // Mock LLM retry response
      mockDependencies.api.chat.mockResolvedValue({
        ...mockLLMRetryResponse,
        tool_calls: [{
          id: 'retry_call_create_project',
          function: {
            name: 'create_project',
            arguments: JSON.stringify({
              name: 'New AI Project',
              team_lead: 'john.doe@company.com',
              budget: 50000, // Corrected to number
              timeline: '6 months'
            })
          }
        }]
      })

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        conversationHistory,
        'assistant_msg_validation_retry'
      )

      // Assert
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(2)
      
      // First tool should have succeeded after retry
      expect(result.toolResults[0].tool_call_id).toBe('call_create_project')
      expect(result.toolResults[0].content).toContain('Project "New AI Project" created')
      
      // Second tool should have succeeded normally
      expect(result.toolResults[1].tool_call_id).toBe('call_invite_members')
      expect(result.toolResults[1].content).toContain('Invited 3 team members')
      
      // Should have called the first tool twice (original + retry) plus second tool once
      expect(mockDependencies.api.callTool).toHaveBeenCalledTimes(3)
      
      // LLM should have been called for parameter correction
      expect(mockDependencies.api.chat).toHaveBeenCalled()
      
      // Performance monitoring should track retry overhead
      expect(mockDependencies.performanceMonitor.recordMetric).toHaveBeenCalledWith(
        expect.stringContaining('retry'),
        expect.any(Number),
        expect.any(Object)
      )
    })

    it('should maintain conversation history correctly through complex interactions', async () => {
      // Arrange - Build up conversation history through multiple interactions
      const initialHistory: ChatMessage[] = [
        {
          id: 'msg_history_1',
          role: 'user',
          content: 'What is the current status of Project Alpha?'
        },
        {
          id: 'msg_history_2',
          role: 'assistant',
          content: 'I\'ll check the project status for you.',
          tool_calls: [{
            id: 'prev_call_1',
            name: 'get_project_status',
            parameters: { project: 'Alpha' },
            status: 'completed'
          }]
        },
        {
          id: 'msg_history_3',
          role: 'tool',
          content: 'Project Alpha: Status=Active, Progress=75%, Next Milestone=Feb 15',
          tool_call_id: 'prev_call_1'
        },
        {
          id: 'msg_history_4',
          role: 'assistant',
          content: 'Project Alpha is currently active with 75% progress. The next milestone is February 15th.'
        }
      ]

      // New user request building on previous context
      const newHistory = [
        ...initialHistory,
        {
          id: 'msg_history_5',
          role: 'user',
          content: 'Great! Now update the budget allocation and notify the stakeholders about the progress.'
        }
      ]

      const toolCalls: ToolCall[] = [
        {
          id: 'call_update_budget',
          name: 'update_budget_allocation',
          parameters: { 
            project: 'Alpha',
            current_progress: 0.75,
            adjustment_type: 'progress_based'
          },
          status: 'pending'
        },
        {
          id: 'call_notify_stakeholders',
          name: 'notify_stakeholders',
          parameters: {
            project: 'Alpha',
            message_type: 'progress_update',
            progress_percentage: 75,
            next_milestone: '2025-02-15'
          },
          status: 'pending'
        }
      ]

      mockDependencies.api.callTool
        .mockResolvedValueOnce({
          ...mockSuccessfulToolResponse,
          result: {
            jsonrpc: '2.0',
            result: {
              content: [{
                type: 'text',
                text: 'Budget allocation updated for Project Alpha based on 75% progress. Remaining budget: $125,000'
              }]
            }
          }
        })
        .mockResolvedValueOnce({
          ...mockSuccessfulToolResponse,
          result: {
            jsonrpc: '2.0',
            result: {
              content: [{
                type: 'text',
                text: 'Notified 5 stakeholders about Project Alpha progress: 75% complete, next milestone Feb 15'
              }]
            }
          }
        })

      // Act
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        newHistory,
        'assistant_msg_history_complex'
      )

      // Assert
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(2)
      
      // Conversation history should have been validated and processed correctly
      // (This is verified implicitly by successful execution)
      
      // Tools should understand context from conversation history
      const budgetCall = mockDependencies.api.callTool.mock.calls[0][0]
      expect(budgetCall.parameters.project).toBe('Alpha')
      expect(budgetCall.parameters.current_progress).toBe(0.75)
      
      const notifyCall = mockDependencies.api.callTool.mock.calls[1][0]
      expect(notifyCall.parameters.project).toBe('Alpha')
      expect(notifyCall.parameters.progress_percentage).toBe(75)
    })
  })

  describe('Performance Under Load', () => {
    it('should handle multiple concurrent tool execution sessions', async () => {
      // Arrange
      const concurrentSessions = Array.from({ length: 5 }, (_, sessionId) => ({
        toolCalls: [{
          id: `call_concurrent_session_${sessionId}`,
          name: 'concurrent_tool',
          parameters: { session: sessionId, data: `test_data_${sessionId}` },
          status: 'pending' as const
        }],
        conversationHistory: [{
          id: `msg_session_${sessionId}`,
          role: 'user' as const,
          content: `Execute tool for session ${sessionId}`
        }],
        assistantMessageId: `assistant_msg_session_${sessionId}`
      }))

      // Act - Execute all sessions concurrently
      const results = await Promise.all(
        concurrentSessions.map(session =>
          serviceContainer.toolExecutionService.executeToolCalls(
            session.toolCalls,
            session.conversationHistory,
            session.assistantMessageId
          )
        )
      )

      // Assert
      // All sessions should succeed
      results.forEach((result, index) => {
        expect(result.success).toBe(true)
        expect(result.toolResults).toHaveLength(1)
        expect(result.toolResults[0].tool_call_id).toBe(`call_concurrent_session_${index}`)
      })

      // Total API calls should equal number of sessions
      expect(mockDependencies.api.callTool).toHaveBeenCalledTimes(5)

      // Performance monitoring should track all sessions
      expect(mockDependencies.performanceMonitor.startOperation).toHaveBeenCalledTimes(5)

      // Cache should show efficient reuse across sessions
      const cacheStats = serviceContainer.toolServerMappingService.getCacheStats()
      expect(cacheStats.hits).toBeGreaterThan(0)
      expect(cacheStats.hitRate).toBeGreaterThan(0.5)
    })

    it('should maintain performance with large conversation histories', async () => {
      // Arrange - Create large conversation history
      const largeHistory: ChatMessage[] = Array.from({ length: 100 }, (_, i) => ({
        id: `msg_large_${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i} in large conversation history`,
        ...(i % 4 === 1 ? {
          tool_calls: [{
            id: `tool_call_${i}`,
            name: `tool_${i}`,
            parameters: { index: i },
            status: 'completed' as const
          }]
        } : {}),
        ...(i % 4 === 3 ? {
          tool_call_id: `tool_call_${i - 2}`,
          role: 'tool' as const
        } : {})
      }))

      const toolCalls: ToolCall[] = [{
        id: 'call_large_history',
        name: 'process_with_large_history',
        parameters: { context: 'large_conversation' },
        status: 'pending'
      }]

      // Act
      const startTime = Date.now()
      const result = await serviceContainer.toolExecutionService.executeToolCalls(
        toolCalls,
        largeHistory,
        'assistant_msg_large_history'
      )
      const executionTime = Date.now() - startTime

      // Assert
      expect(result.success).toBe(true)
      expect(result.toolResults).toHaveLength(1)
      
      // Should complete within reasonable time despite large history
      expect(executionTime).toBeLessThan(5000) // Less than 5 seconds
      
      // Conversation history should have been processed correctly
      // (verified by successful execution)
      
      // Performance metrics should be recorded
      expect(mockDependencies.performanceMonitor.recordMetric).toHaveBeenCalledWith(
        expect.stringContaining('conversation'),
        expect.any(Number),
        expect.objectContaining({
          historySize: 100
        })
      )
    })
  })
})