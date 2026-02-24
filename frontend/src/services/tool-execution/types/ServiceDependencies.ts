/**
 * Service Dependencies and Dependency Injection Types
 * 
 * Defines the dependency structure for all tool execution services
 */

import type { IToolResultProcessor } from '../interfaces/IToolResultProcessor'
import type { IToolServerMappingService } from '../interfaces/IToolServerMappingService'
import type { IConversationHistoryService } from '../interfaces/IConversationHistoryService'
import type { IToolRetryService } from '../interfaces/IToolRetryService'
import type { IToolExecutionService } from '../interfaces/IToolExecutionService'
import type { ServiceConfiguration } from './ToolExecutionTypes'

// External dependencies (imported from existing codebase)
export interface ExternalDependencies {
  api: {
    getMCPServers: (abortSignal?: AbortSignal) => Promise<Array<{ id: number; name: string }>>
    getMCPServerWithTools: (serverId: number, abortSignal?: AbortSignal) => Promise<{
      tools: Array<{ name: string; is_enabled: boolean }>
    }>
    callTool: (params: {
      tool_name: string
      parameters: any
      server_id: number
    }, abortSignal?: AbortSignal) => Promise<{
      success: boolean
      result?: any
      error?: string
    }>
    chat: (params: {
      message: string
      conversation_history: any[]
      llm_config_id: string
      exclude_tools?: boolean
    }, abortSignal?: AbortSignal) => Promise<{
      response: string
      tool_calls?: any[]
    }>
  }
  
  store: {
    messages: any[]
    addMessage: (message: any) => string
    updateMessage: (id: string, updates: any) => void
  }
  
  toast: {
    toast: (options: {
      title: string
      description: string
      variant?: 'default' | 'destructive'
    }) => void
  }
  
  memoryManager: {
    registerCleanupTask: (task: any) => void
    addMemoryPressureListener: (threshold: number, callback: (usage: number) => void) => void
    getMemoryStats: () => any
  }
  
  performanceMonitor: {
    startToolExecution: () => any
    recordMetric: (name: string, value: number, unit: string) => void
  }
  
  errorLogger: {
    logError: (message: string, error: Error, category?: string) => void
    logWarning: (message: string) => void
  }
  
  safeJson: {
    safeJsonParseWithDefault: (text: string, defaultValue: any) => any
  }
  
  messageManager: {
    safeAddMessage: (message: any) => string
    safeUpdateMessage: (id: string, updates: any) => void
    getMessages: () => any[]
  }
  
  llmConfigManager: {
    getActiveLLMConfig: () => { id: string } | null
  }
}

// Service dependencies for dependency injection
export interface ServiceDependencies {
  toolResultProcessor: IToolResultProcessor
  toolServerMappingService: IToolServerMappingService
  conversationHistoryService: IConversationHistoryService
  toolRetryService: IToolRetryService
  externalDependencies: ExternalDependencies
  configuration: ServiceConfiguration
}

// Factory function types
export type ToolResultProcessorFactory = (
  externalDependencies: ExternalDependencies,
  configuration: ServiceConfiguration
) => IToolResultProcessor

export type ToolServerMappingServiceFactory = (
  externalDependencies: ExternalDependencies,
  configuration: ServiceConfiguration
) => IToolServerMappingService

export type ConversationHistoryServiceFactory = (
  externalDependencies: ExternalDependencies,
  configuration: ServiceConfiguration
) => IConversationHistoryService

export type ToolRetryServiceFactory = (
  externalDependencies: ExternalDependencies,
  configuration: ServiceConfiguration
) => IToolRetryService

export type ToolExecutionServiceFactory = (
  dependencies: ServiceDependencies
) => IToolExecutionService

// Service container for dependency injection
export interface ServiceContainer {
  toolResultProcessor: IToolResultProcessor
  toolServerMappingService: IToolServerMappingService
  conversationHistoryService: IConversationHistoryService
  toolRetryService: IToolRetryService
  toolExecutionService: IToolExecutionService
  
  // Utility methods
  dispose(): void
  reset(): void
  configure(newConfiguration: Partial<ServiceConfiguration>): void
}

// Service factory configuration
export interface ServiceFactoryConfiguration {
  externalDependencies: ExternalDependencies
  serviceConfiguration: ServiceConfiguration
  enableMocking?: boolean
  testMode?: boolean
}