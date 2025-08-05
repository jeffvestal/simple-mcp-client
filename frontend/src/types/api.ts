export interface APIResponse<T = any> {
  success?: boolean
  data?: T
  message?: string
  error?: string
}

export interface LLMConfigCreate {
  name: string
  url: string
  api_key: string
  provider: 'openai' | 'gemini' | 'bedrock'
}

export interface MCPServerCreate {
  name: string
  url: string
  api_key?: string
}

export interface ChatRequest {
  message: string
  conversation_history: Array<{
    role: string
    content: string
  }>
}

export interface ChatResponse {
  response: string
  tool_calls?: Array<{
    id: string
    name: string
    arguments: Record<string, any>
  }>
}