import { useState, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useToast } from '@/components/ui/use-toast'
import { Trash2, ChevronDown, ChevronRight, Server, Zap, Play, Square, Terminal } from 'lucide-react'

interface LLMFormData {
  name: string
  url: string
  api_key: string
  provider: 'openai' | 'gemini' | 'bedrock'
  model: string
}

interface MCPFormData {
  name: string
  server_type: 'remote' | 'local'
  url: string
  api_key: string
  command: string
  args: string[]
  auto_start: boolean
  working_directory: string
}

export function SettingsPage() {
  const { 
    llmConfigs, 
    setLLMConfigs, 
    setActiveLLMConfig,
    mcpServers,
    setMCPServers
  } = useStore()
  const { toast } = useToast()

  const [llmForm, setLLMForm] = useState<LLMFormData>({
    name: '',
    url: '',
    api_key: '',
    provider: 'openai',
    model: 'gpt-4o'
  })

  const [mcpForm, setMCPForm] = useState<MCPFormData>({
    name: '',
    server_type: 'remote',
    url: '',
    api_key: '',
    command: '',
    args: [],
    auto_start: true,
    working_directory: ''
  })

  const [isLoading, setIsLoading] = useState(false)
  const [expandedServers, setExpandedServers] = useState<Set<number>>(new Set())
  const [serverTools, setServerTools] = useState<Map<number, any[]>>(new Map())
  const [loadingTools, setLoadingTools] = useState<Set<number>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  useEffect(() => {
    loadConfigurations()
  }, [])

  const loadConfigurations = async () => {
    try {
      const [llmResponse, mcpResponse] = await Promise.all([
        api.getLLMConfigs(),
        api.getMCPServers()
      ])
      
      setLLMConfigs(llmResponse)
      setMCPServers(mcpResponse)
      
      const active = llmResponse.find((config: any) => config.is_active)
      
      // Auto-activate if there's only one LLM and none is active
      if (!active && llmResponse.length === 1) {
        try {
          await api.activateLLMConfig(llmResponse[0].id)
          // Reload to get updated status
          const updatedResponse = await api.getLLMConfigs()
          setLLMConfigs(updatedResponse)
          const newActive = updatedResponse.find((config: any) => config.is_active)
          setActiveLLMConfig(newActive || null)
          
          toast({
            title: "Auto-activated",
            description: `Automatically activated: ${llmResponse[0].name}`,
          })
        } catch (error) {
          console.error('Auto-activation failed:', error)
          setActiveLLMConfig(null)
        }
      } else {
        setActiveLLMConfig(active || null)
      }
    } catch (error) {
      console.error('Failed to load configurations:', error)
      toast({
        title: "Loading Error",
        description: "Failed to load configurations",
        variant: "destructive",
      })
    }
  }

  const handleLLMSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validation
    if (!llmForm.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Name is required",
        variant: "destructive",
      })
      return
    }
    
    if (!llmForm.url.trim()) {
      toast({
        title: "Validation Error", 
        description: "URL is required",
        variant: "destructive",
      })
      return
    }
    
    if (!llmForm.api_key.trim()) {
      toast({
        title: "Validation Error",
        description: "API key is required", 
        variant: "destructive",
      })
      return
    }
    
    // Basic URL validation
    try {
      new URL(llmForm.url)
    } catch {
      toast({
        title: "Validation Error",
        description: "Please enter a valid URL",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      await api.createLLMConfig(llmForm)
      await loadConfigurations()
      setLLMForm({ name: '', url: '', api_key: '', provider: 'openai', model: 'gpt-4o' })
      toast({
        title: "Success",
        description: "LLM configuration created successfully",
      })
    } catch (error) {
      toast({
        title: "Configuration Error",
        description: error instanceof Error ? error.message : "Failed to create LLM configuration",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleActivateLLM = async (configId: number) => {
    try {
      await api.activateLLMConfig(configId)
      await loadConfigurations()
      toast({
        title: "Success",
        description: "LLM configuration activated",
      })
    } catch (error) {
      toast({
        title: "Activation Error",
        description: "Failed to activate LLM configuration",
        variant: "destructive",
      })
    }
  }

  const handleDeleteLLM = async (configId: number) => {
    try {
      await api.deleteLLMConfig(configId)
      await loadConfigurations()
      toast({
        title: "Success",
        description: "LLM configuration deleted",
      })
    } catch (error) {
      toast({
        title: "Delete Error",
        description: "Failed to delete LLM configuration",
        variant: "destructive",
      })
    }
  }

  const handleMCPSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('MCP Form submitted:', mcpForm)
    
    // Validation
    if (!mcpForm.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Name is required",
        variant: "destructive",
      })
      return
    }
    
    if (mcpForm.server_type === 'remote') {
      if (!mcpForm.url.trim()) {
        toast({
          title: "Validation Error",
          description: "URL is required for remote servers",
          variant: "destructive",
        })
        return
      }
      
      // Basic URL validation
      try {
        new URL(mcpForm.url)
      } catch {
        toast({
          title: "Validation Error",
          description: "Please enter a valid URL",
          variant: "destructive",
        })
        return
      }
    } else {
      if (!mcpForm.command.trim()) {
        console.log('Validation failed: Command is required')
        toast({
          title: "Validation Error",
          description: "Command is required for local servers",
          variant: "destructive",
        })
        return
      }
    }

    setIsLoading(true)
    try {
      // Filter out empty arguments before sending to server
      const serverData = {
        ...mcpForm,
        args: mcpForm.args.filter(arg => arg.trim())
      }
      console.log('Sending server data:', serverData)
      await api.createMCPServer(serverData)
      await loadConfigurations()
      setMCPForm({ 
        name: '', 
        server_type: 'remote',
        url: '', 
        api_key: '',
        command: '',
        args: [],
        auto_start: true,
        working_directory: ''
      })
      toast({
        title: "Success",
        description: "Connection successful",
      })
    } catch (error) {
      toast({
        title: "Connection Error",
        description: error instanceof Error ? error.message : "Connection failed",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleServerToggle = async (serverId: number, enabled: boolean) => {
    try {
      await api.toggleMCPServer(serverId, enabled)
      await loadConfigurations()
      
      // If the server is expanded and has tools cached, refresh them to show updated state
      if (expandedServers.has(serverId) && serverTools.has(serverId)) {
        try {
          const serverWithTools = await api.getMCPServerWithTools(serverId)
          setServerTools(prev => new Map(prev.set(serverId, serverWithTools.tools || [])))
        } catch (error) {
          console.error('Failed to refresh server tools:', error)
        }
      }
    } catch (error) {
      toast({
        title: "Toggle Error",
        description: "Failed to toggle server",
        variant: "destructive",
      })
    }
  }

  const handleServerDelete = (serverId: number) => {
    setDeleteConfirm(serverId)
  }

  const confirmServerDelete = async () => {
    if (deleteConfirm === null) return

    try {
      await api.deleteMCPServer(deleteConfirm)
      await loadConfigurations()
      toast({
        title: "Success",
        description: "Server deleted successfully",
      })
    } catch (error) {
      toast({
        title: "Delete Error",
        description: "Failed to delete server",
        variant: "destructive",
      })
    } finally {
      setDeleteConfirm(null)
    }
  }

  const handleStartLocalServer = async (serverId: number) => {
    try {
      await api.startLocalServer(serverId)
      await loadConfigurations()
      toast({
        title: "Success",
        description: "Local server started successfully",
      })
    } catch (error) {
      toast({
        title: "Start Error",
        description: "Failed to start local server",
        variant: "destructive",
      })
    }
  }

  const handleStopLocalServer = async (serverId: number) => {
    try {
      await api.stopLocalServer(serverId)
      await loadConfigurations()
      toast({
        title: "Success",
        description: "Local server stopped successfully",
      })
    } catch (error) {
      toast({
        title: "Stop Error",
        description: "Failed to stop local server",
        variant: "destructive",
      })
    }
  }

  const toggleServerExpanded = async (serverId: number) => {
    const newExpanded = new Set(expandedServers)
    if (newExpanded.has(serverId)) {
      newExpanded.delete(serverId)
    } else {
      newExpanded.add(serverId)
      // Fetch tools when expanding if we don't have them yet
      if (!serverTools.has(serverId)) {
        setLoadingTools(prev => new Set(prev.add(serverId)))
        try {
          const serverWithTools = await api.getMCPServerWithTools(serverId)
          setServerTools(prev => new Map(prev.set(serverId, serverWithTools.tools || [])))
        } catch (error) {
          console.error('Failed to load server tools:', error)
          toast({
            title: "Tools Loading Error",
            description: "Failed to load server tools",
            variant: "destructive",
          })
        } finally {
          setLoadingTools(prev => {
            const newSet = new Set(prev)
            newSet.delete(serverId)
            return newSet
          })
        }
      }
    }
    setExpandedServers(newExpanded)
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>

      {/* LLM Configuration Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            LLM Configuration
          </CardTitle>
          <CardDescription>
            Configure your language model provider connection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* LLM Form */}
          <form onSubmit={handleLLMSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="llm-name">Name</Label>
                <Input
                  id="llm-name"
                  value={llmForm.name}
                  onChange={(e) => setLLMForm({ ...llmForm, name: e.target.value })}
                  placeholder="My OpenAI Config"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="llm-provider">Provider</Label>
                <Select value={llmForm.provider} onValueChange={(value: any) => setLLMForm({ ...llmForm, provider: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI Compatible</SelectItem>
                    <SelectItem value="gemini">Google Gemini</SelectItem>
                    <SelectItem value="bedrock">AWS Bedrock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="llm-url">URL</Label>
                <Input
                  id="llm-url"
                  value={llmForm.url}
                  onChange={(e) => setLLMForm({ ...llmForm, url: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="llm-model">Model</Label>
                <Input
                  id="llm-model"
                  value={llmForm.model}
                  onChange={(e) => setLLMForm({ ...llmForm, model: e.target.value })}
                  placeholder="gpt-4o, gpt-3.5-turbo, gemini-pro"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="llm-key">API Key</Label>
              <Input
                id="llm-key"
                type="password"
                value={llmForm.api_key}
                onChange={(e) => setLLMForm({ ...llmForm, api_key: e.target.value })}
                placeholder="sk-..."
              />
            </div>
            <Button type="submit" disabled={isLoading}>
              Add Configuration
            </Button>
          </form>

          {/* LLM Configs List */}
          {llmConfigs.length > 0 && (
            <div className="space-y-2">
              <Label>Configurations</Label>
              <div className="space-y-2">
                {llmConfigs.map((config: any) => (
                  <div key={config.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${config.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                      <div>
                        <p className="font-medium">{config.name}</p>
                        <p className="text-sm text-muted-foreground">{config.provider} • {config.model} • {config.url}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!config.is_active ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleActivateLLM(config.id)}
                        >
                          Activate
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleActivateLLM(config.id)}
                          className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        >
                          Reactivate
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteLLM(config.id)}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* MCP Servers Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            MCP Server Connections
          </CardTitle>
          <CardDescription>
            Connect to MCP servers to access their tools
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* MCP Form */}
          <form onSubmit={handleMCPSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mcp-name">Name</Label>
                <Input
                  id="mcp-name"
                  value={mcpForm.name}
                  onChange={(e) => setMCPForm({ ...mcpForm, name: e.target.value })}
                  placeholder="My MCP Server"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mcp-type">Server Type</Label>
                <Select 
                  value={mcpForm.server_type} 
                  onValueChange={(value: 'remote' | 'local') => setMCPForm({ ...mcpForm, server_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select server type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="remote">Remote (HTTP)</SelectItem>
                    <SelectItem value="local">Local (Process)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {mcpForm.server_type === 'remote' ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="mcp-url">URL</Label>
                    <Input
                      id="mcp-url"
                      value={mcpForm.url}
                      onChange={(e) => setMCPForm({ ...mcpForm, url: e.target.value })}
                      placeholder="http://localhost:3000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mcp-key">API Key (Optional)</Label>
                    <Input
                      id="mcp-key"
                      type="password"
                      value={mcpForm.api_key}
                      onChange={(e) => setMCPForm({ ...mcpForm, api_key: e.target.value })}
                      placeholder="Optional authentication key"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="mcp-command">Command</Label>
                  <Input
                    id="mcp-command"
                    value={mcpForm.command}
                    onChange={(e) => setMCPForm({ ...mcpForm, command: e.target.value })}
                    placeholder="npx @modelcontextprotocol/server-filesystem"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcp-args">Arguments (one per line)</Label>
                  <textarea
                    id="mcp-args"
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={mcpForm.args.join('\n')}
                    onChange={(e) => setMCPForm({ ...mcpForm, args: e.target.value.split('\n') })}
                    placeholder="/path/to/directory&#10;--readonly"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcp-workdir">Working Directory (Optional)</Label>
                  <Input
                    id="mcp-workdir"
                    value={mcpForm.working_directory}
                    onChange={(e) => setMCPForm({ ...mcpForm, working_directory: e.target.value })}
                    placeholder="/path/to/working/directory"
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the backend directory
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="mcp-autostart"
                    checked={mcpForm.auto_start}
                    onCheckedChange={(checked) => setMCPForm({ ...mcpForm, auto_start: checked })}
                  />
                  <Label htmlFor="mcp-autostart">Auto-start server</Label>
                </div>
              </>
            )}
            
            <Button type="submit" disabled={isLoading}>
              {mcpForm.server_type === 'remote' ? 'Connect Server' : 'Add Local Server'}
            </Button>
          </form>

          {/* Connected Servers List */}
          {mcpServers.length > 0 && (
            <div className="space-y-2">
              <Label>Connected Servers</Label>
              <div className="space-y-2">
                {mcpServers.map((server: any) => (
                  <Card key={server.id} className="p-0">
                    <Collapsible
                      open={expandedServers.has(server.id)}
                      onOpenChange={() => toggleServerExpanded(server.id)}
                    >
                      <div className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <CollapsibleTrigger className="p-0 hover:bg-transparent">
                              {expandedServers.has(server.id) ? 
                                <ChevronDown className="h-4 w-4" /> : 
                                <ChevronRight className="h-4 w-4" />
                              }
                            </CollapsibleTrigger>
                            <div className="flex items-center gap-3">
                              {server.server_type === 'local' ? (
                                <Terminal className="h-4 w-4 text-blue-500" />
                              ) : (
                                <Server className="h-4 w-4 text-purple-500" />
                              )}
                              <div className={`w-2 h-2 rounded-full ${
                                server.status === 'connected' ? 'bg-green-500' : 'bg-red-500'
                              }`} />
                              <div>
                                <p className="font-medium">{server.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {server.server_type === 'local' ? (
                                    `${server.command} • ${server.process_status || 'stopped'} • ${server.status}`
                                  ) : (
                                    `${server.url} • ${server.status}`
                                  )}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {server.server_type === 'local' && (
                              <div className="flex items-center gap-1">
                                {server.process_status === 'running' ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleStopLocalServer(server.id)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Square className="h-3 w-3 mr-1" />
                                    Stop
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleStartLocalServer(server.id)}
                                    className="text-green-600 hover:text-green-700"
                                  >
                                    <Play className="h-3 w-3 mr-1" />
                                    Start
                                  </Button>
                                )}
                              </div>
                            )}
                            <Switch
                              checked={server.is_enabled}
                              onCheckedChange={(checked) => handleServerToggle(server.id, checked)}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleServerDelete(server.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      <CollapsibleContent className="px-4 pb-4">
                        <div className="space-y-2 mt-4">
                          <Label>Available Tools</Label>
                          {loadingTools.has(server.id) ? (
                            <div className="flex items-center gap-2 p-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                              <span className="text-sm text-muted-foreground">Loading tools...</span>
                            </div>
                          ) : (
                            <>
                              {serverTools.get(server.id) && serverTools.get(server.id)!.length > 0 ? (
                                <div className="space-y-1">
                                  {serverTools.get(server.id)!.map((tool: any) => (
                                    <div key={tool.id} className="flex items-center justify-between p-2 bg-muted/20 rounded">
                                      <div>
                                        <p className="font-medium text-sm">{tool.name}</p>
                                        {tool.description && (
                                          <p className="text-xs text-muted-foreground">{tool.description}</p>
                                        )}
                                      </div>
                                      <Switch
                                        checked={tool.is_enabled}
                                        onCheckedChange={(checked) => api.toggleMCPTool(tool.id, checked)}
                                      />
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  {serverTools.has(server.id) ? "No tools discovered" : "Click to discover tools"}
                                </p>
                              )}
                            </>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      {deleteConfirm !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-96">
            <CardHeader>
              <CardTitle>Confirm Delete</CardTitle>
              <CardDescription>
                Are you sure you want to delete this server? This action cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-end space-x-3">
                <Button 
                  variant="outline" 
                  onClick={() => setDeleteConfirm(null)}
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={confirmServerDelete}
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}