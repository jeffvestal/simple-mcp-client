import { devLog, DevLogCategory } from './developmentLogger'

// Smart API URL detection for different environments
function getAPIBaseURL(): string {
  // 1. Environment variable override (highest priority)
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }
  
  // 2. Local development detection
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8002/api'
  }
  
  // 3. Check if we're in a proxy setup (same origin)
  if (import.meta.env.VITE_USE_PROXY === 'true') {
    return '/api'
  }
  
  // 4. External environment - try same hostname with backend port
  return `${window.location.protocol}//${window.location.hostname}:8002/api`
}

const API_BASE_URL = getAPIBaseURL()

class APIClient {
  private baseURL: string

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {},
    signal?: AbortSignal
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: signal || options.signal,
      ...options,
    }

    try {
      const response = await fetch(url, config)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      // Don't log AbortError as it's expected during cancellation
      if (error instanceof Error && error.name === 'AbortError') {
        throw error
      }
      devLog.error(DevLogCategory.API, 'API request failed', error)
      throw error
    }
  }

  // Health check
  async healthCheck(signal?: AbortSignal) {
    return this.request('/health', {}, signal)
  }

  // LLM Configuration endpoints
  async createLLMConfig(config: any, signal?: AbortSignal) {
    return this.request('/llm/config', {
      method: 'POST',
      body: JSON.stringify(config),
    }, signal)
  }

  async getLLMConfigs(signal?: AbortSignal) {
    return this.request('/llm/configs', {}, signal)
  }

  async activateLLMConfig(configId: number, signal?: AbortSignal) {
    return this.request(`/llm/config/${configId}/activate`, {
      method: 'POST',
    }, signal)
  }

  async deleteLLMConfig(configId: number, signal?: AbortSignal) {
    return this.request(`/llm/config/${configId}`, {
      method: 'DELETE',
    }, signal)
  }

  async updateLLMConfig(configId: number, updates: any, signal?: AbortSignal) {
    return this.request(`/llm/config/${configId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }, signal)
  }

  // MCP Server endpoints
  async createMCPServer(server: any, signal?: AbortSignal) {
    return this.request('/mcp/servers', {
      method: 'POST',
      body: JSON.stringify(server),
    }, signal)
  }

  async getMCPServers(signal?: AbortSignal) {
    return this.request('/mcp/servers', {}, signal)
  }

  async getMCPServerWithTools(serverId: number, signal?: AbortSignal) {
    return this.request(`/mcp/servers/${serverId}`, {}, signal)
  }

  async toggleMCPServer(serverId: number, enabled: boolean, signal?: AbortSignal) {
    return this.request(`/mcp/servers/${serverId}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }, signal)
  }

  async deleteMCPServer(serverId: number, signal?: AbortSignal) {
    return this.request(`/mcp/servers/${serverId}`, {
      method: 'DELETE',
    }, signal)
  }

  async startLocalServer(serverId: number, signal?: AbortSignal) {
    return this.request(`/mcp/servers/${serverId}/start`, {
      method: 'POST',
    }, signal)
  }

  async stopLocalServer(serverId: number, signal?: AbortSignal) {
    return this.request(`/mcp/servers/${serverId}/stop`, {
      method: 'POST',
    }, signal)
  }

  async toggleMCPTool(toolId: number, enabled: boolean, signal?: AbortSignal) {
    return this.request(`/mcp/tools/${toolId}/toggle?enabled=${enabled}`, {
      method: 'POST',
    }, signal)
  }

  // Chat endpoints
  async chat(request: any, signal?: AbortSignal) {
    try {
      devLog.api('API.chat() called', {
        message: request.message,
        historyLength: request.conversation_history?.length || 0,
        llmConfigId: request.llm_config_id
      })
      
      const result = await this.request('/chat', {
        method: 'POST',
        body: JSON.stringify(request),
      }, signal)
      
      devLog.api('API.chat() response', {
        hasResponse: !!result.response,
        responseLength: result.response?.length || 0,
        hasToolCalls: !!result.tool_calls?.length
      })
      
      return result
    } catch (error) {
      devLog.error(DevLogCategory.API, 'API.chat() failed', error)
      throw error
    }
  }

  async callTool(request: any, signal?: AbortSignal) {
    return this.request('/mcp/call-tool', {
      method: 'POST',
      body: JSON.stringify(request),
    }, signal)
  }
}

export const api = new APIClient()