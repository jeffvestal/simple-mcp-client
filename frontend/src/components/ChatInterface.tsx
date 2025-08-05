import { useState, useRef, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { api } from '@/lib/api'
import { ChatMessage } from './ChatMessage'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

export function ChatInterface() {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { messages, isLoading, addMessage, updateMessage, setLoading, activeLLMConfig } = useStore()
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
      toast({
        title: "No LLM Configuration",
        description: "Please configure an LLM provider in settings first.",
        variant: "destructive",
      })
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
      // Prepare conversation history
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))

      const response = await api.chat({
        message: userMessage,
        conversation_history: conversationHistory
      })

      // Add assistant response
      const toolCalls = response.tool_calls?.map((call: any) => ({
        id: call.id,
        name: call.name,
        parameters: call.arguments,
        status: 'pending' as const
      })) || []

      const assistantMessage = {
        role: 'assistant' as const,
        content: response.response,
        toolCalls: toolCalls
      }
      
      // Add message and get the assigned ID
      const assistantMessageId = addMessage(assistantMessage)

      // Execute tool calls if any
      if (toolCalls.length > 0) {
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

              // Update tool call status
              const updatedToolCalls = toolCalls.map(tc => 
                tc.id === toolCall.id 
                  ? { 
                      ...tc, 
                      status: toolResult.success ? 'completed' as const : 'error' as const,
                      result: toolResult.success ? toolResult.result : toolResult.error
                    }
                  : tc
              )
              
              updateMessage(assistantMessageId, { toolCalls: updatedToolCalls })
            } else {
              // Tool not found - update status
              const updatedToolCalls = toolCalls.map(tc => 
                tc.id === toolCall.id 
                  ? { 
                      ...tc, 
                      status: 'error' as const,
                      result: 'Tool not found or disabled'
                    }
                  : tc
              )
              
              updateMessage(assistantMessageId, { toolCalls: updatedToolCalls })
            }
          } catch (error) {
            console.error('Tool execution error:', error)
            
            // Update tool call with error status
            const updatedToolCalls = toolCalls.map(tc => 
              tc.id === toolCall.id 
                ? { 
                    ...tc, 
                    status: 'error' as const,
                    result: error instanceof Error ? error.message : 'Unknown error'
                  }
                : tc
            )
            
            updateMessage(assistantMessageId, { toolCalls: updatedToolCalls })
            
            toast({
              title: "Tool Execution Error",
              description: `Failed to execute ${toolCall.name}`,
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

  if (!activeLLMConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
        <div className="text-muted-foreground">
          <h3 className="text-lg font-medium mb-2">No LLM Configuration</h3>
          <p>Please configure an LLM provider in settings to start chatting.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="text-muted-foreground">
              <h3 className="text-lg font-medium mb-2">Start a Conversation</h3>
              <p>Ask me anything! I can help you with various tasks using connected tools.</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isLoading && (
              <div className="flex justify-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-muted rounded-full flex items-center justify-center">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Thinking...
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="min-h-[60px] max-h-[120px] resize-none"
            disabled={isLoading}
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!input.trim() || isLoading}
            className="self-end"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}