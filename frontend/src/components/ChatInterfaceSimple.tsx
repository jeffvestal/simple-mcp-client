import { useState, useRef, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { api } from '../lib/api'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Send, Loader2, ChevronDown, ChevronRight, Wrench, Trash2 } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import { useToast } from './ui/use-toast'
import ReactMarkdown from 'react-markdown'

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
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        tool_calls: msg.tool_calls
      }))

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
        
        // After all tools are executed, send results back to LLM for final response
        if (allToolsCompleted) {
          try {
            // Filter tool calls that have actual results (not empty objects)
            // Handle JSON-RPC response structure: tc.result.result.content
            const completedToolCalls = currentToolCalls.filter(tc => {
              console.log('DEBUG: Checking tool call:', tc.id, 'status:', tc.status, 'result keys:', tc.result ? Object.keys(tc.result) : 'no result')
              if (tc.result && tc.result.result) {
                console.log('DEBUG: Tool result.result keys:', Object.keys(tc.result.result))
              }
              
              return tc.status === 'completed' && 
                     tc.result && 
                     typeof tc.result === 'object' && 
                     tc.result.result && 
                     typeof tc.result.result === 'object' &&
                     (tc.result.result.structuredContent || tc.result.result.content)
            })
            
            console.log('DEBUG: Completed tool calls with results:', completedToolCalls)
            
            // Only proceed if we have actual tool results
            if (completedToolCalls.length === 0) {
              console.log('DEBUG: No completed tool calls with results, skipping LLM follow-up')
              return
            }
            
            // Clean the conversation history by removing internal fields from tool calls
            const cleanConversationHistory = conversationHistory.map(msg => {
              if (msg.role === 'assistant' && msg.tool_calls) {
                // Clean tool calls by removing internal fields
                return {
                  ...msg,
                  tool_calls: msg.tool_calls.map((tc: any) => ({
                    id: tc.id,
                    name: tc.name,
                    arguments: tc.parameters || tc.arguments
                  }))
                }
              }
              return {
                role: msg.role,
                content: msg.content,
                tool_calls: msg.tool_calls
              }
            })

            // Prepare conversation history including the assistant message with tool results
            const conversationWithTools = [
              ...cleanConversationHistory,
              {
                role: 'user' as const,
                content: userMessage,
                tool_calls: undefined
              },
              {
                role: 'assistant' as const,
                content: response.response,
                tool_calls: completedToolCalls.map(tc => ({
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.parameters
                }))
              },
              // Add tool results as tool messages
              ...completedToolCalls.map(tc => {
                // Extract actual result content from the MCP JSON-RPC response
                let resultContent = ''
                const mcpResult = tc.result.result // Access the nested result
                
                if (mcpResult.structuredContent && mcpResult.structuredContent.result) {
                  resultContent = mcpResult.structuredContent.result
                } else if (mcpResult.content && Array.isArray(mcpResult.content)) {
                  // Extract text from content array
                  resultContent = mcpResult.content
                    .filter((item: any) => item.type === 'text')
                    .map((item: any) => item.text)
                    .join('\n')
                } else {
                  resultContent = JSON.stringify(mcpResult)
                }
                
                console.log('DEBUG: Extracted result content for', tc.id, ':', resultContent.substring(0, 100) + '...')
                
                return {
                  role: 'tool' as const,
                  content: resultContent,
                  tool_call_id: tc.id
                }
              })
            ]
            
            console.log('DEBUG: Conversation being sent to backend:', conversationWithTools)

            // Send to LLM for final response
            const finalResponse = await api.chat({
              message: "", // Empty message since we're continuing the conversation
              conversation_history: conversationWithTools,
              llm_config_id: activeLLMConfig.id
            })

            // Add the final LLM response
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
            messages.map((message, index) => (
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