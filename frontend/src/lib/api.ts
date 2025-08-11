const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
                     `${window.location.protocol}//${window.location.hostname}:8002/api`

class APIClient {
  private baseURL: string

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  private async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
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
      console.error('API request failed:', error)
      throw error
    }
  }

  // Health check
  async healthCheck() {
    return this.request('/health')
  }

  // LLM Configuration endpoints
  async createLLMConfig(config: any) {
    return this.request('/llm/config', {
      method: 'POST',
      body: JSON.stringify(config),
    })
  }

  async getLLMConfigs() {
    return this.request('/llm/configs')
  }

  async activateLLMConfig(configId: number) {
    return this.request(`/llm/config/${configId}/activate`, {
      method: 'POST',
    })
  }

  async deleteLLMConfig(configId: number) {
    return this.request(`/llm/config/${configId}`, {
      method: 'DELETE',
    })
  }

  // MCP Server endpoints
  async createMCPServer(server: any) {
    return this.request('/mcp/servers', {
      method: 'POST',
      body: JSON.stringify(server),
    })
  }

  async getMCPServers() {
    return this.request('/mcp/servers')
  }

  async getMCPServerWithTools(serverId: number) {
    return this.request(`/mcp/servers/${serverId}`)
  }

  async toggleMCPServer(serverId: number, enabled: boolean) {
    return this.request(`/mcp/servers/${serverId}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    })
  }

  async deleteMCPServer(serverId: number) {
    return this.request(`/mcp/servers/${serverId}`, {
      method: 'DELETE',
    })
  }

  async startLocalServer(serverId: number) {
    return this.request(`/mcp/servers/${serverId}/start`, {
      method: 'POST',
    })
  }

  async stopLocalServer(serverId: number) {
    return this.request(`/mcp/servers/${serverId}/stop`, {
      method: 'POST',
    })
  }

  async toggleMCPTool(toolId: number, enabled: boolean) {
    return this.request(`/mcp/tools/${toolId}/toggle?enabled=${enabled}`, {
      method: 'POST',
    })
  }

  // Chat endpoints
  async chat(request: any) {
    try {
      console.log('🌐 API.chat() called with request:', {
        message: request.message,
        historyLength: request.conversation_history?.length || 0,
        llmConfigId: request.llm_config_id
      })
      
      const result = await this.request('/chat', {
        method: 'POST',
        body: JSON.stringify(request),
      })
      
      console.log('🌐 API.chat() response:', {
        hasResponse: !!result.response,
        responseLength: result.response?.length || 0,
        hasToolCalls: !!result.tool_calls?.length,
        fullResult: result
      })
      
      return result
    } catch (error) {
      console.error('🌐 API.chat() failed:', error)
      throw error
    }
  }

  async callTool(request: any) {
    return this.request('/mcp/call-tool', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }
}

export const api = new APIClient()