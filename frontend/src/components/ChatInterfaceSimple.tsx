import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Send, Loader2, ChevronDown, ChevronRight, Wrench, Trash2 } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { useToast } from './ui/use-toast'
import ReactMarkdown from 'react-markdown'

// Helper function to extract and clean content from MCP tool responses
function extractAndCleanToolContent(toolResult: any, toolName: string): string {
  let mcpResult = null
  
  // Determine the correct structure to extract from
  if (toolResult.result && toolResult.result.result) {
    // Nested structure: API response -> MCP response -> MCP result
    mcpResult = toolResult.result.result
  } else if (toolResult.result) {
    // Direct MCP response format
    mcpResult = toolResult.result
  } else {
    // Alternative format
    mcpResult = toolResult
  }
  
  // Check if this is an error response - MCP errors are at the result level
  if (toolResult.result && toolResult.result.error && toolResult.result.jsonrpc) {
    // Direct MCP error response
    const error = toolResult.result.error
    return `Tool ${toolName} encountered an error: ${error.message || JSON.stringify(error)}`
  } else if (mcpResult.error || (mcpResult.jsonrpc && mcpResult.error)) {
    // Fallback for other error structures
    const error = mcpResult.error || mcpResult
    return `Tool ${toolName} encountered an error: ${error.message || JSON.stringify(error)}`
  }
  
  // Extract raw text from MCP content if it exists
  let rawTextContent = null
  if (mcpResult.content && Array.isArray(mcpResult.content)) {
    // Extract text from content array and try to parse as JSON
    const textContent = mcpResult.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n')
    
    // Try to parse the text content as JSON (common with Elasticsearch MCP responses)
    try {
      const parsedContent = JSON.parse(textContent)
      if (parsedContent.results && Array.isArray(parsedContent.results) && parsedContent.results[0]?.data) {
        rawTextContent = parsedContent.results[0].data
      } else {
        rawTextContent = parsedContent
      }
    } catch {
      rawTextContent = textContent
    }
  }
  
  // Use rawTextContent if available, otherwise use mcpResult for tool-specific formatting
  const dataToProcess = rawTextContent || mcpResult
  
  // Tool-specific content extraction and formatting
  if (toolName === 'list_indices' && dataToProcess.indices && Array.isArray(dataToProcess.indices)) {
    // Clean up list_indices response
    const indices = dataToProcess.indices
    return `Found ${indices.length} Elasticsearch indices:\n\n${indices.map((index: any) => 
      `• **${index.index}** (${index.status})\n  - Documents: ${index.docsCount || index['docs.count'] || 'N/A'}\n  - Size: ${index['store.size'] || 'N/A'}\n  - Health: ${index.health || 'N/A'}`
    ).join('\n\n')}`
  } else if (toolName.includes('search') && dataToProcess.hits) {
    // Clean up search responses
    const hits = dataToProcess.hits
    if (hits.total && hits.total.value > 0) {
      return `Found ${hits.total.value} results:\n\n${hits.hits.slice(0, 5).map((hit: any, idx: number) => 
        `${idx + 1}. ${JSON.stringify(hit._source, null, 2)}`
      ).join('\n\n')}${hits.hits.length > 5 ? '\n\n...(showing first 5 results)' : ''}`
    } else {
      return 'No results found for the search query.'
    }
  } else if (toolName.includes('mapping') && typeof dataToProcess === 'object' && !Array.isArray(dataToProcess)) {
    // Clean up mapping responses
    const mappings = dataToProcess
    const indexNames = Object.keys(mappings)
    if (indexNames.length > 0) {
      return `Index mappings:\n\n${indexNames.map(indexName => {
        const mapping = mappings[indexName]
        if (mapping.mappings && mapping.mappings.properties) {
          const fields = Object.keys(mapping.mappings.properties)
          return `**${indexName}**:\n  Fields: ${fields.slice(0, 10).join(', ')}${fields.length > 10 ? '...' : ''}`
        }
        return `**${indexName}**: ${JSON.stringify(mapping).substring(0, 100)}...`
      }).join('\n\n')}`
    }
  }
  
  // Generic content extraction for other tools
  if (mcpResult.structuredContent && mcpResult.structuredContent.result) {
    return mcpResult.structuredContent.result
  } else if (rawTextContent && typeof rawTextContent === 'string') {
    return rawTextContent
  } else if (mcpResult.content && Array.isArray(mcpResult.content)) {
    // Extract text from content array
    return mcpResult.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n')
  } else if (mcpResult.content && typeof mcpResult.content === 'string') {
    return mcpResult.content
  } else if (dataToProcess && typeof dataToProcess === 'object') {
    // Handle data objects - try to format nicely
    if (typeof dataToProcess === 'string') {
      return dataToProcess
    } else if (Array.isArray(dataToProcess)) {
      return `Found ${dataToProcess.length} items:\n${dataToProcess.slice(0, 3).map((item: any, idx: number) => 
        `${idx + 1}. ${typeof item === 'string' ? item : JSON.stringify(item, null, 2)}`
      ).join('\n')}${dataToProcess.length > 3 ? '\n...(showing first 3 items)' : ''}`
    } else {
      // Object data - format key fields nicely
      const obj = dataToProcess
      const keys = Object.keys(obj)
      if (keys.length <= 5) {
        return Object.entries(obj).map(([key, value]) => 
          `**${key}**: ${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}`
        ).join('\n')
      } else {
        return `Data object with ${keys.length} properties:\n${keys.slice(0, 5).map(key => 
          `• ${key}: ${typeof obj[key]}`
        ).join('\n')}${keys.length > 5 ? '\n• ...(and more)' : ''}`
      }
    }
  } else {
    // Fallback to JSON string but try to make it more readable
    const jsonStr = JSON.stringify(mcpResult, null, 2)
    if (jsonStr.length > 500) {
      return `${jsonStr.substring(0, 500)}...\n\n(Response truncated for readability)`
    }
    return jsonStr
  }
}

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

export function ChatInterfaceSimple() {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { messages, isLoading, addMessage, updateMessage, setLoading, activeLLMConfig, clearMessages } = useStore()
  const { toast } = useToast()

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    if (!activeLLMConfig) {
      alert('Please configure an LLM provider in settings first.')
      return
    }

    const userMessage = input.trim()
    setInput('')
    
    // Add user message
    addMessage({
      role: 'user',
      content: userMessage,
    })

    setLoading(true)

    try {
      // Prepare conversation history (all messages except the last one)
      const conversationHistory = messages.map(msg => {
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

      console.log('DEBUG: Cleaned conversation history for API call:', conversationHistory)

      // Send to backend
      const response = await api.chat({
        message: userMessage,
        conversation_history: conversationHistory,
        llm_config_id: activeLLMConfig.id
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
        content: response.response,
        tool_calls: toolCalls
      }
      
      // Add message and get the assigned ID
      const assistantMessageId = addMessage(assistantMessage)

      // Execute tool calls if any
      if (toolCalls.length > 0) {
        let allToolsCompleted = true
        let currentToolCalls = [...toolCalls] // Track updated tool calls
        
        // Process tool calls sequentially
        for (const toolCall of toolCalls) {
          try {
            // Find the server that has this tool
            const servers = await api.getMCPServers()
            let targetServerId = null
            for (const server of servers) {
              const serverDetails = await api.getMCPServerWithTools(server.id)
              if (serverDetails.tools.some((tool: any) => tool.name === toolCall.name && tool.is_enabled)) {
                targetServerId = server.id
                break
              }
            }

            if (targetServerId) {
              const toolResult = await api.callTool({
                tool_name: toolCall.name,
                parameters: toolCall.parameters,
                server_id: targetServerId
              })

              // Update tool call status in both arrays
              const updatedToolCalls = currentToolCalls.map(tc => 
                tc.id === toolCall.id 
                  ? { 
                      ...tc, 
                      status: toolResult.success ? 'completed' as const : 'error' as const,
                      result: toolResult.success ? toolResult.result : toolResult.error
                    }
                  : tc
              )
              
              currentToolCalls = updatedToolCalls // Update our tracking array
              updateMessage(assistantMessageId, { tool_calls: updatedToolCalls })
              
              // If tool failed, mark as not all completed
              if (!toolResult.success) {
                allToolsCompleted = false
              }
            } else {
              // Tool not found - update status
              const updatedToolCalls = currentToolCalls.map(tc => 
                tc.id === toolCall.id 
                  ? { 
                      ...tc, 
                      status: 'error' as const,
                      result: 'Tool not found or disabled'
                    }
                  : tc
              )
              
              currentToolCalls = updatedToolCalls // Update our tracking array
              updateMessage(assistantMessageId, { tool_calls: updatedToolCalls })
              allToolsCompleted = false
            }
          } catch (error) {
            console.error('Tool execution error:', error)
            
            // Update tool call with error status
            const updatedToolCalls = currentToolCalls.map(tc => 
              tc.id === toolCall.id 
                ? { 
                    ...tc, 
                    status: 'error' as const,
                    result: error instanceof Error ? error.message : 'Unknown error'
                  }
                : tc
            )
            
            currentToolCalls = updatedToolCalls // Update our tracking array
            updateMessage(assistantMessageId, { tool_calls: updatedToolCalls })
            allToolsCompleted = false
            
            toast({
              title: "Tool Execution Error",
              description: `Failed to execute ${toolCall.name}`,
              variant: "destructive",
            })
          }
        }
        
        // After all tools are executed, process results and continue conversation
        console.log('DEBUG: Tool execution summary - allToolsCompleted:', allToolsCompleted, 'toolCallsLength:', currentToolCalls.length)
        
        if (currentToolCalls.length > 0) {
          try {
            // Filter tool calls that have actual successful results (exclude errors)
            const successfulToolCalls = currentToolCalls.filter(tc => {
              console.log('DEBUG: Checking tool call:', tc.id, 'status:', tc.status)
              console.log('DEBUG: Tool result structure:', tc.result ? JSON.stringify(tc.result, null, 2) : 'no result')
              
              if (tc.status !== 'completed' || !tc.result) {
                console.log('DEBUG: Tool not completed or no result')
                return false
              }
              
              // Check if this is an error response - exclude error responses
              if (tc.result && tc.result.error && tc.result.jsonrpc) {
                console.log('DEBUG: Tool returned MCP error, excluding from LLM processing:', tc.result.error)
                return false
              }
              
              // Also check nested structures for other error formats
              let mcpResult = null
              if (tc.result.result && tc.result.result.result) {
                mcpResult = tc.result.result.result
              } else if (tc.result.result) {
                mcpResult = tc.result.result
              } else {
                mcpResult = tc.result
              }
              
              if (mcpResult.error || (mcpResult.jsonrpc && mcpResult.error)) {
                console.log('DEBUG: Tool returned nested error, excluding from LLM processing:', mcpResult.error)
                return false
              }
              
              // Check if we have any usable content in the successful result
              let hasContent = false
              if (tc.result.result) {
                const mcpResponseResult = tc.result.result
                hasContent = !!(mcpResponseResult.content || mcpResponseResult.structuredContent || mcpResponseResult.result)
              } else if (tc.result.content || tc.result.structuredContent) {
                hasContent = true
              } else {
                hasContent = typeof tc.result === 'object' && Object.keys(tc.result).length > 0
              }
              
              return hasContent
            })
            
            console.log('DEBUG: Successful tool calls:', successfulToolCalls.length, 'out of', currentToolCalls.length, 'total')
            
            // Process based on success/failure outcomes
            if (successfulToolCalls.length === 0) {
              // All tools failed - handle without tool messages to avoid OpenAI format violations
              console.log('DEBUG: All tools failed - providing LLM response without tool results')
              
              // Clean conversation history and validate tool messages
              const cleanConversationHistory = conversationHistory.map(msg => {
                if (msg.role === 'assistant' && msg.tool_calls) {
                  return {
                    ...msg,
                    tool_calls: msg.tool_calls.map((tc: any) => ({
                      id: tc.id,
                      name: tc.name,
                      arguments: tc.parameters || tc.arguments
                    }))
                  }
                } else if (msg.role === 'tool') {
                  // Ensure tool messages have proper tool_call_id
                  return {
                    role: msg.role,
                    content: msg.content,
                    tool_call_id: msg.tool_call_id || 'unknown'
                  }
                }
                return { role: msg.role, content: msg.content, tool_calls: msg.tool_calls }
              }).filter(msg => {
                // Remove tool messages without proper tool_call_id to prevent OpenAI errors
                if (msg.role === 'tool' && (!msg.tool_call_id || msg.tool_call_id === 'unknown')) {
                  console.log('DEBUG: Filtering out tool message without proper tool_call_id:', msg)
                  return false
                }
                return true
              })
              
              // Create conversation with failed tool calls but no tool messages
              const conversationWithFailedTools = [
                ...cleanConversationHistory,
                {
                  role: 'user' as const,
                  content: userMessage,
                  tool_calls: undefined
                },
                {
                  role: 'assistant' as const,
                  content: response.response || "I attempted to use tools to help with your request, but encountered technical difficulties. Let me provide what information I can based on my knowledge.",
                  tool_calls: currentToolCalls.map(tc => ({
                    id: tc.id,
                    name: tc.name,
                    arguments: tc.parameters
                  }))
                }
              ]
              
              console.log('DEBUG: Sending conversation with failed tools (no tool messages):', conversationWithFailedTools.length, 'messages')
              
              // Send to LLM for response without tool results
              const fallbackResponse = await api.chat({
                message: "",
                conversation_history: conversationWithFailedTools,
                llm_config_id: activeLLMConfig.id
              })
              
              addMessage({
                role: 'assistant',
                content: fallbackResponse.response,
                tool_calls: []
              })
              
              return
              
            } else {
              // Some or all tools succeeded - proceed with normal flow
              console.log('DEBUG: Processing', successfulToolCalls.length, 'successful tool results')
              
              // Add successful tool messages to the store
              for (const tc of successfulToolCalls) {
                const cleanedContent = extractAndCleanToolContent(tc.result, tc.name)
                console.log(`DEBUG: Adding tool message to store for ${tc.id}`)
                
                addMessage({
                  role: 'tool',
                  content: cleanedContent,
                  tool_call_id: tc.id
                })
              }
            }
            
            // For successful tools, build proper OpenAI conversation format
            const cleanConversationHistory = conversationHistory.map(msg => {
              if (msg.role === 'assistant' && msg.tool_calls) {
                return {
                  ...msg,
                  tool_calls: msg.tool_calls.map((tc: any) => ({
                    id: tc.id,
                    name: tc.name,
                    arguments: tc.parameters || tc.arguments
                  }))
                }
              }
              return { role: msg.role, content: msg.content, tool_calls: msg.tool_calls }
            })

            // Build conversation with only successful tool results
            const conversationWithSuccessfulTools = [
              ...cleanConversationHistory,
              {
                role: 'user' as const,
                content: userMessage,
                tool_calls: undefined
              },
              {
                role: 'assistant' as const,
                content: response.response,
                tool_calls: successfulToolCalls.map(tc => ({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.parameters
                }))
              },
              // Add only successful tool results as tool messages
              ...successfulToolCalls.map(tc => {
                const cleanedContent = extractAndCleanToolContent(tc.result, tc.name)
                console.log('DEBUG: Final extracted result content for', tc.id, ':', cleanedContent.substring(0, 200) + '...')
                
                return {
                  role: 'tool' as const,
                  content: cleanedContent,
                  tool_call_id: tc.id
                }
              })
            ]
            
            console.log('DEBUG: Conversation being sent to backend:', conversationWithSuccessfulTools.length, 'messages')
            console.log('DEBUG: Tool messages in conversation:', successfulToolCalls.length)
            
            // Debug: Check all messages for tool_call_id issues
            conversationWithSuccessfulTools.forEach((msg, idx) => {
              console.log(`DEBUG: Message ${idx}:`, {
                role: msg.role,
                content: msg.content ? msg.content.substring(0, 50) + '...' : 'no content',
                tool_calls: msg.tool_calls ? msg.tool_calls.length : 'none',
                tool_call_id: msg.tool_call_id || 'none'
              })
              
              if (msg.role === 'tool' && !msg.tool_call_id) {
                console.error('FOUND TOOL MESSAGE WITHOUT tool_call_id:', msg)
              }
            })

            // Send to LLM for final response
            const finalResponse = await api.chat({
              message: "",
              conversation_history: conversationWithSuccessfulTools,
              llm_config_id: activeLLMConfig.id
            })

            addMessage({
              role: 'assistant',
              content: finalResponse.response,
              tool_calls: []
            })
          } catch (error) {
            console.error('Error getting final LLM response:', error)
            toast({
              title: "Response Error",
              description: "Failed to get final response from LLM",
              variant: "destructive",
            })
          }
        }
      }

    } catch (error) {
      console.error('Chat error:', error)
      toast({
        title: "Chat Error",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
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
                            const isInline = !className;
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