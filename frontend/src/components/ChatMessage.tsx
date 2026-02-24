import { ChatMessage as ChatMessageType, ToolCall } from '@/store/useStore'
import { Card } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, ChevronRight, User, Bot, Wrench, Loader2 } from 'lucide-react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'

interface ChatMessageProps {
  message: ChatMessageType
}

interface ToolCallDisplayProps {
  toolCall: ToolCall
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

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const timestamp = new Date(message.timestamp).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  })

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="flex items-start gap-3 max-w-[80%]">
          <div className="px-4 py-2 border-2 border-red-500">
            <p className="text-sm">{message.content}</p>
            <p className="text-xs text-muted-foreground mt-1">{timestamp}</p>
          </div>
          <div className="flex-shrink-0 w-8 h-8 bg-muted rounded-full flex items-center justify-center mt-1">
            <User className="h-4 w-4" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="flex items-start gap-3 max-w-[80%]">
        <div className="flex-shrink-0 w-8 h-8 bg-muted rounded-full flex items-center justify-center mt-1">
          <Bot className="h-4 w-4" />
        </div>
        <div className="space-y-2">
          <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg rounded-bl-sm">
            <div className="prose prose-sm max-w-none dark:prose-invert prose-invert">
              <ReactMarkdown
                components={{
                  // Customize markdown components
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
            <p className="text-xs opacity-70 mt-1">{timestamp}</p>
          </div>
          {message.tool_calls && message.tool_calls.length > 0 && (
            <Card className="p-3 bg-muted/20">
              <div className="space-y-2">
                {message.tool_calls.map((toolCall) => (
                  <ToolCallDisplay key={toolCall.id} toolCall={toolCall} />
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}