/**
 * Tool Execution Service Factory
 * 
 * Creates and configures all tool execution services with dependency injection
 */

import type { 
  ServiceContainer,
  ExternalDependencies,
  ServiceConfiguration,
  ServiceFactoryConfiguration 
} from '../types/ServiceDependencies'

import type { IToolResultProcessor } from '../interfaces/IToolResultProcessor'
import type { IToolServerMappingService } from '../interfaces/IToolServerMappingService' 
import type { IConversationHistoryService } from '../interfaces/IConversationHistoryService'
import type { IToolRetryService } from '../interfaces/IToolRetryService'
import type { IToolExecutionService } from '../interfaces/IToolExecutionService'

import { TOOL_EXECUTION_CONSTANTS } from '../types/ToolExecutionTypes'

// Service implementations
import { ToolResultProcessor } from '../ToolResultProcessor'
import { ToolServerMappingService } from '../ToolServerMappingService'
import { ConversationHistoryService } from '../ConversationHistoryService'
import { ToolRetryService } from '../ToolRetryService'
import { ToolExecutionService } from '../ToolExecutionService'

/**
 * Default service configuration
 */
export const DEFAULT_SERVICE_CONFIGURATION: ServiceConfiguration = {
  maxRetries: TOOL_EXECUTION_CONSTANTS.MAX_RETRY_ATTEMPTS,
  cacheExpiryMs: TOOL_EXECUTION_CONSTANTS.TOOL_CACHE_EXPIRY_MS,
  conversationHistoryLimit: TOOL_EXECUTION_CONSTANTS.MAX_CONVERSATION_HISTORY,
  enablePerformanceMonitoring: true,
  enableMemoryTracking: true
}

/**
 * Service Factory Class
 * Handles creation and lifecycle management of all services
 */
export class ToolExecutionServiceFactory {
  private static instance: ToolExecutionServiceFactory | null = null
  private serviceContainer: ServiceContainer | null = null

  private constructor() {}

  /**
   * Get singleton factory instance
   */
  static getInstance(): ToolExecutionServiceFactory {
    if (!ToolExecutionServiceFactory.instance) {
      ToolExecutionServiceFactory.instance = new ToolExecutionServiceFactory()
    }
    return ToolExecutionServiceFactory.instance
  }

  /**
   * Create complete service container with all dependencies
   */
  createServiceContainer(config: ServiceFactoryConfiguration): ServiceContainer {
    const {
      externalDependencies,
      serviceConfiguration,
      enableMocking = false,
      testMode = false
    } = config

    // Create individual services with dependencies
    const toolResultProcessor = this.createToolResultProcessor(
      externalDependencies,
      serviceConfiguration,
      enableMocking
    )

    const toolServerMappingService = this.createToolServerMappingService(
      externalDependencies,
      serviceConfiguration,
      enableMocking
    )

    const conversationHistoryService = this.createConversationHistoryService(
      externalDependencies,
      serviceConfiguration,
      enableMocking
    )

    const toolRetryService = this.createToolRetryService(
      externalDependencies,
      serviceConfiguration,
      enableMocking
    )

    const toolExecutionService = this.createToolExecutionService({
      toolResultProcessor,
      toolServerMappingService,
      conversationHistoryService,
      toolRetryService,
      externalDependencies,
      configuration: serviceConfiguration
    })

    // Create service container
    const container: ServiceContainer = {
      toolResultProcessor,
      toolServerMappingService,
      conversationHistoryService,
      toolRetryService,
      toolExecutionService,

      dispose: () => {
        // Cleanup all services
        if ('dispose' in toolResultProcessor) {
          (toolResultProcessor as any).dispose()
        }
        if ('dispose' in toolServerMappingService) {
          (toolServerMappingService as any).dispose()
        }
        if ('dispose' in conversationHistoryService) {
          (conversationHistoryService as any).dispose()
        }
        if ('dispose' in toolRetryService) {
          (toolRetryService as any).dispose()
        }
        if ('dispose' in toolExecutionService) {
          (toolExecutionService as any).dispose()
        }
      },

      reset: () => {
        // Reset all services to initial state
        if ('reset' in toolResultProcessor) {
          (toolResultProcessor as any).reset()
        }
        if ('reset' in toolServerMappingService) {
          (toolServerMappingService as any).reset()
        }
        if ('reset' in conversationHistoryService) {
          (conversationHistoryService as any).reset()
        }
        if ('reset' in toolRetryService) {
          (toolRetryService as any).reset()
        }
        if ('reset' in toolExecutionService) {
          (toolExecutionService as any).reset()
        }
      },

      configure: (newConfiguration: Partial<ServiceConfiguration>) => {
        const updatedConfig = { ...serviceConfiguration, ...newConfiguration }
        
        // Update configuration for all services
        if ('configure' in toolResultProcessor) {
          (toolResultProcessor as any).configure(updatedConfig)
        }
        if ('configure' in toolServerMappingService) {
          (toolServerMappingService as any).configure(updatedConfig)
        }
        if ('configure' in conversationHistoryService) {
          (conversationHistoryService as any).configure(updatedConfig)
        }
        if ('configure' in toolRetryService) {
          (toolRetryService as any).configure(updatedConfig)
        }
        if ('configure' in toolExecutionService) {
          (toolExecutionService as any).configure(updatedConfig)
        }
      }
    }

    this.serviceContainer = container
    return container
  }

  /**
   * Get existing service container or throw error
   */
  getServiceContainer(): ServiceContainer {
    if (!this.serviceContainer) {
      throw new Error('Service container not created. Call createServiceContainer first.')
    }
    return this.serviceContainer
  }

  /**
   * Destroy current service container
   */
  destroyServiceContainer(): void {
    if (this.serviceContainer) {
      this.serviceContainer.dispose()
      this.serviceContainer = null
    }
  }

  // Private factory methods for individual services
  private createToolResultProcessor(
    externalDependencies: ExternalDependencies,
    configuration: ServiceConfiguration,
    enableMocking: boolean
  ): IToolResultProcessor {
    if (enableMocking) {
      return this.createMockToolResultProcessor()
    }
    
    // Create actual ToolResultProcessor
    return new ToolResultProcessor(externalDependencies, configuration)
  }

  private createToolServerMappingService(
    externalDependencies: ExternalDependencies,
    configuration: ServiceConfiguration,
    enableMocking: boolean
  ): IToolServerMappingService {
    if (enableMocking) {
      return this.createMockToolServerMappingService()
    }
    
    // Create actual ToolServerMappingService
    return new ToolServerMappingService(externalDependencies, configuration)
  }

  private createConversationHistoryService(
    externalDependencies: ExternalDependencies,
    configuration: ServiceConfiguration,
    enableMocking: boolean
  ): IConversationHistoryService {
    if (enableMocking) {
      return this.createMockConversationHistoryService()
    }
    
    // Create actual ConversationHistoryService
    return new ConversationHistoryService(externalDependencies, configuration)
  }

  private createToolRetryService(
    externalDependencies: ExternalDependencies,
    configuration: ServiceConfiguration,
    enableMocking: boolean
  ): IToolRetryService {
    if (enableMocking) {
      return this.createMockToolRetryService()
    }
    
    // Create actual ToolRetryService
    return new ToolRetryService(externalDependencies, configuration)
  }

  private createToolExecutionService(
    dependencies: {
      toolResultProcessor: IToolResultProcessor
      toolServerMappingService: IToolServerMappingService
      conversationHistoryService: IConversationHistoryService
      toolRetryService: IToolRetryService
      externalDependencies: ExternalDependencies
      configuration: ServiceConfiguration
    }
  ): IToolExecutionService {
    // Create actual ToolExecutionService with individual parameters
    return new ToolExecutionService(
      dependencies.externalDependencies,
      dependencies.configuration,
      dependencies.toolResultProcessor,
      dependencies.toolServerMappingService,
      dependencies.conversationHistoryService,
      dependencies.toolRetryService
    )
  }

  // Mock service creators for testing
  private createMockToolResultProcessor(): IToolResultProcessor {
    return {
      extractAndCleanToolContent: () => 'Mock extracted content',
      processToolResult: () => ({
        content: 'Mock processed content',
        isValid: true
      }),
      formatToolResultForConversation: (result, toolName, toolCallId) => ({
        role: 'tool',
        content: 'Mock formatted content',
        tool_call_id: toolCallId
      }),
      validateToolResult: () => ({
        isValid: true,
        errors: []
      }),
      getToolSpecificFormatter: () => null
    }
  }

  private createMockToolServerMappingService(): IToolServerMappingService {
    return {
      findServerForTool: async () => 1,
      buildToolServerCache: async () => {},
      isCacheValid: () => true,
      getCacheStats: () => ({ hits: 0, misses: 0, size: 0, hitRate: 0 }),
      clearCache: () => {},
      getCachedMappings: () => ({}),
      setCacheEntry: () => {},
      getCacheExpiryTime: () => Date.now() + 300000,
      handleMemoryPressure: () => {},
      warmUpCache: async () => {}
    }
  }

  private createMockConversationHistoryService(): IConversationHistoryService {
    return {
      validateAndCleanHistory: (messages) => messages,
      limitConversationHistory: (messages) => messages.slice(-50),
      validateHistoryForToolExecution: () => ({ messages: [], isValid: true, warnings: [] }),
      cleanOrphanedToolMessages: (messages) => ({ cleanedMessages: messages, removedCount: 0, warnings: [] }),
      ensureConversationFlow: (messages) => messages,
      getConversationStats: () => ({ 
        totalMessages: 0, userMessages: 0, assistantMessages: 0, 
        toolMessages: 0, toolCalls: 0, orphanedToolMessages: 0 
      }),
      prepareForLLMApi: () => [],
      addMessageWithValidation: (messages, newMessage) => ({ 
        updatedMessages: [...messages, newMessage], isValid: true, warnings: [] 
      })
    }
  }

  private createMockToolRetryService(): IToolRetryService {
    return {
      isValidationError: () => false,
      shouldRetry: () => ({ shouldRetry: false, reason: 'No retry needed' }),
      executeRetryWithLLM: async () => ({ success: true, errors: [] }),
      createRetryContext: () => ({ retryCount: 0, maxRetries: 3, originalParameters: {} }),
      updateRetryContext: (context) => context,
      hasExceededMaxRetries: () => false,
      generateRetryConversationHistory: () => [],
      parseValidationError: () => ({ isValidationError: false, errorMessage: '' }),
      applyAutomaticFixes: () => null,
      getRetryStats: () => ({ 
        totalRetries: 0, successfulRetries: 0, failedRetries: 0, 
        retrySuccessRate: 0, commonErrors: [] 
      })
    }
  }
}

/**
 * Convenience function to create service container with defaults
 */
export function createDefaultServiceContainer(
  externalDependencies: ExternalDependencies
): ServiceContainer {
  const factory = ToolExecutionServiceFactory.getInstance()
  return factory.createServiceContainer({
    externalDependencies,
    serviceConfiguration: DEFAULT_SERVICE_CONFIGURATION,
    enableMocking: false,
    testMode: false
  })
}

/**
 * Convenience function to create test service container with mocks
 */
export function createTestServiceContainer(
  externalDependencies?: Partial<ExternalDependencies>,
  serviceConfiguration?: Partial<ServiceConfiguration>
): ServiceContainer {
  const factory = ToolExecutionServiceFactory.getInstance()
  
  // Provide minimal mock external dependencies for testing
  const mockExternalDeps: ExternalDependencies = {
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
      safeJsonParseWithDefault: (text, defaultValue) => defaultValue
    },
    ...externalDependencies
  }
  
  return factory.createServiceContainer({
    externalDependencies: mockExternalDeps,
    serviceConfiguration: { ...DEFAULT_SERVICE_CONFIGURATION, ...serviceConfiguration },
    enableMocking: true,
    testMode: true
  })
}