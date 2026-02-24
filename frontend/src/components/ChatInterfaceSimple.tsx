import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Send, Loader2, ChevronDown, ChevronRight, Wrench, Trash2 } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { useToast } from './ui/use-toast'
import ReactMarkdown from 'react-markdown'
import { safeJsonParseWithDefault } from '../lib/safeJson'
import { logError } from '../lib/errorLogger'
import { 
  getMemoryManager, 
  createManagedAbortController, 
  trackAsyncOperation 
} from '../lib/MemoryManager'
import { devLog, DevLogCategory } from '../lib/developmentLogger'
import { 
  createDefaultServiceContainer
} from '../services/tool-execution/factories/ToolExecutionServiceFactory'
import type { ServiceContainer, ExternalDependencies } from '../services/tool-execution/types/ServiceDependencies'

// Legacy helper functions removed - now handled by services:
// - isValidationError -> ToolRetryService 
// - extractAndCleanToolContent -> ToolResultProcessor
// - validateAndCleanConversationHistory -> ConversationHistoryService



interface ToolCallDisplayProps {
  toolCall: any
}

function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 p-2 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 w-full text-left">
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Wrench className="h-4 w-4" />
        <span>Tool: {toolCall.name}</span>
        <span className={`ml-auto px-2 py-1 rounded-full text-xs flex items-center gap-1 ${
          toolCall.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
          toolCall.status === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
        }`}>
          {toolCall.status === 'pending' && <Loader2 className="h-3 w-3 animate-spin" />}
          {toolCall.status}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-2">
        <div>
          <h4 className="text-sm font-medium mb-2">Request</h4>
          <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
            <code>{JSON.stringify(toolCall.parameters, null, 2)}</code>
          </pre>
        </div>
        {toolCall.result && (
          <div>
            <h4 className="text-sm font-medium mb-2">Response</h4>
            <pre className="bg-muted p-3 rounded-md text-sm overflow-x-auto">
              <code>{JSON.stringify(toolCall.result, null, 2)}</code>
            </pre>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

// Configuration constants (some moved to services)
const MAX_CONVERSATION_HISTORY = 50 // Maximum number of messages to keep in history
const TOOL_CACHE_EXPIRY_MS = 5 * 60 * 1000 // Cache tool server mappings for 5 minutes

export function ChatInterfaceSimple() {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const currentAbortController = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)
  const toolServerCache = useRef<{ [toolName: string]: number }>({})
  const cacheTimestamp = useRef<number>(0)
  const memoryManager = getMemoryManager()
  const { messages, isLoading, addMessage, updateMessage, setLoading, activeLLMConfig, clearMessages } = useStore()
  const { toast } = useToast()

  // Service container for tool execution - replaces monolithic executeToolCalls function
  const serviceContainerRef = useRef<ServiceContainer | null>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Safe state update helpers that check if component is still mounted
  const safeAddMessage = (message: Parameters<typeof addMessage>[0]) => {
    if (isMountedRef.current) {
      const messageId = addMessage(message)

      // DEBUG: Log when tool messages are added
      if (message.role === 'tool') {
        console.log('DEBUG: safeAddMessage added tool message', {
          messageId,
          role: message.role,
          toolCallId: message.tool_call_id,
          contentLength: message.content?.length,
          currentMessagesCount: messages.length
        })
      }

      return messageId
    }
    return ''
  }

  const safeUpdateMessage = (messageId: string, updates: Parameters<typeof updateMessage>[1]) => {
    if (isMountedRef.current) {
      updateMessage(messageId, updates)
    }
  }

  const safeSetLoading = (loading: boolean) => {
    if (isMountedRef.current) {
      setLoading(loading)
    }
  }

  // Initialize service container with external dependencies
  const initializeServiceContainer = (): ServiceContainer => {
    if (!serviceContainerRef.current) {
      // Temporary inline safe JSON parser to avoid import issues
      const inlineSafeJsonParseWithDefault = (text: string, defaultValue: any) => {
        try {
          return text ? JSON.parse(text) : defaultValue
        } catch {
          return defaultValue
        }
      }
      
      const externalDependencies: ExternalDependencies = {
        api,
        store: {
          messages,
          addMessage,
          updateMessage
        },
        toast: { toast },
        memoryManager: {
          registerCleanupTask: memoryManager.registerCleanupTask.bind(memoryManager),
          addMemoryPressureListener: memoryManager.addMemoryPressureListener.bind(memoryManager),
          getMemoryStats: memoryManager.getMemoryStats.bind(memoryManager)
        },
        performanceMonitor: {
          startToolExecution: () => ({}),  // Simplified for now
          recordMetric: () => {}
        },
        errorLogger: {
          logError,
          logWarning: (message: string) => {
            // Map to logError since logWarning doesn't exist
            logError(message, undefined, 'UNKNOWN' as any)  // Need to fix category
          }
        },
        safeJson: {
          safeJsonParseWithDefault: inlineSafeJsonParseWithDefault
        },
        messageManager: {
          safeAddMessage,
          safeUpdateMessage,
          getMessages: () => {
            // Get fresh messages from store to avoid React state lag
            const currentMessages = useStore.getState().messages
            devLog.conversation('Getting messages from store', {
              messageCount: currentMessages.length,
              reactStateCount: messages.length
            })
            return currentMessages
          }
        },
        llmConfigManager: {
          getActiveLLMConfig: () => activeLLMConfig ? { id: String(activeLLMConfig.id) } : null
        }
      }

      serviceContainerRef.current = createDefaultServiceContainer(externalDependencies)
      devLog.memory('Service container initialized')
    }
    return serviceContainerRef.current
  }

  // Get service container (initialize if needed)
  const getServiceContainer = (): ServiceContainer => {
    return initializeServiceContainer()
  }

  // Helper function to limit conversation history to prevent memory growth
  const limitConversationHistory = (messages: any[]) => {
    if (messages.length <= MAX_CONVERSATION_HISTORY) {
      return messages
    }
    
    // Keep the most recent messages, but ensure we maintain conversation context
    // Always keep user-assistant pairs together
    const limitedMessages = messages.slice(-MAX_CONVERSATION_HISTORY)
    
    // If we cut off in the middle of a conversation, try to start from a user message
    const firstUserIndex = limitedMessages.findIndex(msg => msg.role === 'user')
    if (firstUserIndex > 0) {
      return limitedMessages.slice(firstUserIndex)
    }
    
    return limitedMessages
  }

  // Tool server mapping cache helpers
  const isCacheValid = () => {
    const now = Date.now()
    return (now - cacheTimestamp.current) < TOOL_CACHE_EXPIRY_MS
  }

  const buildToolServerCache = async (abortSignal?: AbortSignal) => {
    try {
      devLog.cache('Building tool server mapping cache...')
      const servers = await trackAsyncOperation(
        () => api.getMCPServers(abortSignal),
        'Fetch MCP servers',
        abortSignal
      ).catch(error => {
        if (!abortSignal?.aborted) {
          devLog.error(DevLogCategory.API, 'Failed to fetch MCP servers', error)
        }
        throw error
      })
      
      const toolMapping: { [toolName: string]: number } = {}
      
      for (const server of servers) {
        if (abortSignal?.aborted) throw new Error('Operation cancelled')
        
        const serverDetails = await trackAsyncOperation(
          () => api.getMCPServerWithTools(server.id, abortSignal),
          `Fetch tools for server ${server.id}`,
          abortSignal
        ).catch(error => {
          if (!abortSignal?.aborted) {
            devLog.error(DevLogCategory.API, 'Failed to fetch tools for server', { serverId: server.id, error })
          }
          // Continue with other servers even if one fails
          return { tools: [] }
        })
        
        for (const tool of serverDetails.tools || []) {
          if (tool.is_enabled) {
            toolMapping[tool.name] = server.id
          }
        }
      }
      
      toolServerCache.current = toolMapping
      cacheTimestamp.current = Date.now()
      devLog.cache('Cached tools from servers', { 
        toolCount: Object.keys(toolMapping).length, 
        serverCount: servers.length 
      })
      
    } catch (error) {
      if (!abortSignal?.aborted) {
        devLog.error(DevLogCategory.CACHE, 'Failed to build tool server cache', error)
        logError('Failed to build tool server cache', error)
      }
      // Don't throw - return empty cache and let individual tool calls handle missing tools
      toolServerCache.current = {}
      cacheTimestamp.current = Date.now()
    }
  }

  const findServerForTool = async (toolName: string, abortSignal?: AbortSignal): Promise<number | null> => {
    // Check cache first
    if (isCacheValid() && toolServerCache.current[toolName]) {
      devLog.cache('Found tool in cache', { toolName, serverId: toolServerCache.current[toolName] })
      return toolServerCache.current[toolName]
    }
    
    // Cache is stale or doesn't have this tool, rebuild it
    if (!isCacheValid()) {
      devLog.cache('Tool cache expired, rebuilding...')
      await buildToolServerCache(abortSignal)
    }
    
    // Check cache again after rebuild
    if (toolServerCache.current[toolName]) {
      devLog.cache('Found tool after cache rebuild', { toolName, serverId: toolServerCache.current[toolName] })
      return toolServerCache.current[toolName]
    }
    
    devLog.cache('Tool not found in any server', { toolName })
    return null
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Cleanup function to cancel ongoing operations
  useEffect(() => {
    // Register cleanup task with memory manager
    memoryManager.registerCleanupTask({
      priority: 'high',
      description: 'ChatInterfaceSimple component cleanup',
      execute: () => {
        // Clear tool server cache
        toolServerCache.current = {}
        cacheTimestamp.current = 0
        
        // Clear any large data structures
        if (messages.length > 100) {
          devLog.memory('Clearing large message history from memory', { messageCount: messages.length })
        }
      }
    })
    
    // Add memory pressure listener
    memoryManager.addMemoryPressureListener(0.7, (usage) => {
      devLog.memory('Memory pressure in ChatInterface', { usagePercent: (usage * 100).toFixed(1) })
      // Clear tool cache if memory pressure
      if (usage > 0.8) {
        toolServerCache.current = {}
        cacheTimestamp.current = 0
      }
    })
    
    return () => {
      // Mark component as unmounted
      isMountedRef.current = false
      
      // Cancel any ongoing operations when component unmounts
      if (currentAbortController.current) {
        currentAbortController.current.abort()
        memoryManager.unregisterResource(currentAbortController.current)
        currentAbortController.current = null
      }
      
      // Clear tool server cache
      toolServerCache.current = {}
      cacheTimestamp.current = 0
      
      // Dispose service container
      if (serviceContainerRef.current) {
        serviceContainerRef.current.dispose()
        serviceContainerRef.current = null
        devLog.memory('Service container disposed')
      }
      
      // Trigger cleanup of component resources
      memoryManager.cleanupResourcesByType('abort-controller')
    }
  }, [])

  // Helper function to execute tool calls (can be called recursively for retries)
  // Tool execution function - now uses service architecture instead of monolithic implementation
  const executeToolCalls = async (
    toolCalls: any[], 
    assistantMessageId: string, 
    currentUserMessage?: string, 
    abortSignal?: AbortSignal, 
    retryCount: number = 0
  ) => {
    try {
      devLog.toolExecution('Delegating to ToolExecutionService', { 
        toolCallCount: toolCalls?.length || 0, 
        retryCount,
        assistantMessageId 
      })

      // Get the service container and delegate to the ToolExecutionService
      const serviceContainer = getServiceContainer()
      
      // Convert tool calls to the format expected by the service
      const formattedToolCalls = toolCalls.map((call: any) => ({
        id: call.id,
        name: call.name,
        parameters: call.arguments || call.parameters,
        status: 'pending' as const
      }))

      // Call the service - it handles all the complexity that was in the old monolithic function
      await serviceContainer.toolExecutionService.executeToolCalls(
        formattedToolCalls,
        assistantMessageId,
        currentUserMessage,
        abortSignal,
        retryCount
      )

      devLog.toolExecution('ToolExecutionService completed successfully')
    } catch (error) {
      devLog.error('TOOL_EXECUTION', 'Service-based tool execution failed', error)
      
      // Fallback error handling
      toast({
        title: "Tool Execution Error",
        description: "Failed to execute tools. Please try again.",
        variant: "destructive",
      })
      
      // Add fallback error message
      safeAddMessage({
        role: 'assistant',
        content: "I encountered technical difficulties while processing your request. Please try again.",
        tool_calls: []
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    if (!activeLLMConfig) {
      alert('Please configure an LLM provider in settings first.')
      return
    }

    const userMessage = input.trim()
    setInput('')

    // Add user message directly without safe wrapper
    addMessage({
      role: 'user',
      content: userMessage,
    })

    // Cancel any previous ongoing operations
    if (currentAbortController.current) {
      currentAbortController.current.abort()
    }

    safeSetLoading(true)

    // Ensure minimum loading duration for better UX
    const loadingStartTime = Date.now()
    const minLoadingDuration = 800 // minimum 800ms to show animation

    // Create managed AbortController for this chat session
    const abortController = createManagedAbortController('Chat session controller')
    const abortSignal = abortController.signal
    currentAbortController.current = abortController

    try {
      // Prepare conversation history with memory management
      const limitedMessages = limitConversationHistory(messages)
      const conversationHistory = limitedMessages.map(msg => {
        // Clean tool calls to remove internal execution data
        let cleanedToolCalls = undefined
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          cleanedToolCalls = msg.tool_calls.map((tc: any) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.parameters || tc.arguments
            // Remove: status, result, and other internal fields
          }))
        }
        
        return {
          role: msg.role,
          content: msg.content,
          tool_calls: cleanedToolCalls,
          tool_call_id: msg.tool_call_id // Preserve tool_call_id for tool messages
        }
      })

      devLog.conversation('Using conversation history with limits', {
        limitedCount: conversationHistory.length,
        originalCount: messages.length
      })

      // Send to backend
      const response = await Promise.resolve(
        api.chat({
          message: userMessage,
          conversation_history: conversationHistory,
          llm_config_id: activeLLMConfig.id
        }, abortSignal)
      ).catch(error => {
        if (!abortSignal?.aborted) {
          devLog.error(DevLogCategory.API, 'Failed to send message', error)
          logError('Failed to send message', error)
        }
        throw error
      })

      // Add assistant response with tool calls
      const toolCalls = response.tool_calls?.map((call: any) => ({
        id: call.id,
        name: call.name,
        parameters: call.arguments,
        status: 'pending' as const
      })) || []

      const assistantMessage = {
        role: 'assistant' as const,
        content: response.response || '',
        tool_calls: toolCalls
      }

      // Add message directly without wrapper
      const assistantMessageId = addMessage(assistantMessage)

      // Execute tool calls if any
      if (toolCalls.length > 0 && assistantMessageId) {
        await executeToolCalls(toolCalls, assistantMessageId, userMessage, abortSignal, 0)
      }

    } catch (error) {
      // Check if the operation was cancelled
      if (error instanceof Error && error.name === 'AbortError') {
        devLog.general('Chat operation was cancelled')
        return
      }

      devLog.error(DevLogCategory.ERROR_BOUNDARY, 'Critical chat system failure', error)
      
      // Provide user-friendly error message
      try {
        safeAddMessage({
          role: 'assistant',
          content: "I'm sorry, but I encountered a technical issue while processing your message. Please try again, and if the problem continues, try refreshing the page.",
          tool_calls: []
        })
      } catch (addError) {
        devLog.error(DevLogCategory.ERROR_BOUNDARY, 'Failed to add error message to chat', addError)
      }
      
      toast({
        title: "Chat Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      })
    } finally {
      // Clear the AbortController reference when operation completes
      currentAbortController.current = null

      // Ensure minimum loading duration for better UX
      const elapsedTime = Date.now() - loadingStartTime
      const remainingTime = Math.max(0, minLoadingDuration - elapsedTime)

      if (remainingTime > 0) {
        setTimeout(() => {
          safeSetLoading(false)
        }, remainingTime)
      } else {
        safeSetLoading(false)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="bg-muted p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Start a conversation! Try asking about Elasticsearch data or financial information.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Make sure you have an{' '}
                <button 
                  onClick={() => {
                    // Navigate to settings - we'll need to pass this up to parent
                    const event = new CustomEvent('navigateToSettings');
                    window.dispatchEvent(event);
                  }}
                  className="text-primary hover:underline cursor-pointer"
                >
                  LLM configured
                </button>{' '}
                in Settings first.
              </p>
            </div>
          ) : (
            messages.filter(message => message.role !== 'tool').map((message, index) => (
              <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] p-3 rounded-lg ${
                  message.role === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-transparent'
                }`}>
                  {message.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-4 first:mt-0">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
                          h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>,
                          p: ({ children }) => <p className="text-sm mb-2 last:mb-0">{children}</p>,
                          ul: ({ children }) => <ul className="text-sm space-y-1 ml-4 mb-2 list-disc">{children}</ul>,
                          ol: ({ children }) => <ol className="text-sm space-y-1 ml-4 mb-2 list-decimal">{children}</ol>,
                          li: ({ children }) => <li className="text-sm">{children}</li>,
                          code: ({ children, className }) => {
                            const isInline = !className || !className.startsWith('language-');
                            return isInline ? (
                              <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">{children}</code>
                            ) : (
                              <code className="block bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto">{children}</code>
                            );
                          },
                          pre: ({ children }) => <pre className="bg-muted p-3 rounded-md overflow-x-auto mb-2">{children}</pre>,
                          blockquote: ({ children }) => <blockquote className="border-l-4 border-muted-foreground pl-4 italic text-muted-foreground mb-2">{children}</blockquote>,
                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          em: ({ children }) => <em className="italic">{children}</em>,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
                  
                  {/* Display tool calls if any */}
                  {message.tool_calls && message.tool_calls.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/20 bg-muted/20 rounded p-3">
                      <div className="space-y-2">
                        {message.tool_calls.map((toolCall: any) => (
                          <ToolCallDisplay key={toolCall.id || toolCall.name} toolCall={toolCall} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted p-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Thinking...</span>
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t p-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
              className="resize-none"
              rows={2}
            />
            <div className="flex flex-col gap-2">
              <Button type="submit" size="icon" disabled={!input.trim() || isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
              {messages.length > 0 && (
                <Button 
                  type="button" 
                  variant="outline" 
                  size="icon" 
                  onClick={clearMessages}
                  disabled={isLoading}
                  title="Clear chat"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
} 
