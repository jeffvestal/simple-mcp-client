import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  timestamp: Date
  tool_calls?: ToolCall[]
  tool_call_id?: string
}

export interface ToolCall {
  id: string
  name: string
  parameters: Record<string, any>
  result?: any
  status: 'pending' | 'completed' | 'error' | 'running'
}

export interface MCPServer {
  id: number
  name: string
  url: string
  is_enabled: boolean
  status: string
  tools?: MCPTool[]
}

export interface MCPTool {
  id: number
  name: string
  description?: string
  is_enabled: boolean
}

export interface LLMConfig {
  id: number
  name: string
  url: string
  provider: string
  is_active: boolean
}

interface ChatStore {
  // UI State
  isDarkMode: boolean
  toggleTheme: () => void
  
  // Chat State
  messages: ChatMessage[]
  isLoading: boolean
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string
  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => void
  setLoading: (loading: boolean) => void
  clearMessages: () => void
  
  // MCP Servers
  mcpServers: MCPServer[]
  setMCPServers: (servers: MCPServer[]) => void
  
  // LLM Configs
  llmConfigs: LLMConfig[]
  setLLMConfigs: (configs: LLMConfig[]) => void
  activeLLMConfig: LLMConfig | null
  setActiveLLMConfig: (config: LLMConfig | null) => void
}

export const useStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      // UI State
      isDarkMode: true,
      toggleTheme: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
      
      // Chat State (not persisted)
      messages: [],
      isLoading: false,
      addMessage: (message) => {
        const newMessage: ChatMessage = {
          ...message,
          id: crypto.randomUUID ? crypto.randomUUID() : `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
        }
        set((state) => ({ messages: [...state.messages, newMessage] }))
        return newMessage.id
      },
      updateMessage: (messageId, updates) => {
        set((state) => ({
          messages: state.messages.map(msg => 
            msg.id === messageId ? { ...msg, ...updates } : msg
          )
        }))
      },
      setLoading: (loading) => set({ isLoading: loading }),
      clearMessages: () => set({ messages: [] }),
      
      // MCP Servers
      mcpServers: [],
      setMCPServers: (servers) => set({ mcpServers: servers }),
      
      // LLM Configs
      llmConfigs: [],
      setLLMConfigs: (configs) => set({ llmConfigs: configs }),
      activeLLMConfig: null,
      setActiveLLMConfig: (config) => set({ activeLLMConfig: config }),
    }),
    {
      name: 'chat-client-storage',
      partialize: (state) => ({
        isDarkMode: state.isDarkMode,
        // Don't persist messages, servers, or configs - they should be fetched fresh
      }),
    }
  )
)