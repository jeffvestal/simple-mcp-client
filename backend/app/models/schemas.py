from pydantic import BaseModel, HttpUrl, model_validator
from typing import Optional, List, Dict, Any
from enum import Enum

class LLMProvider(str, Enum):
    OPENAI = "openai"
    GEMINI = "gemini"
    BEDROCK = "bedrock"

class LLMConfigCreate(BaseModel):
    name: str
    url: str
    api_key: str
    provider: LLMProvider
    model: str

class LLMConfig(BaseModel):
    id: int
    name: str
    url: str
    provider: LLMProvider
    model: str
    is_active: bool

class MCPServerCreate(BaseModel):
    name: str
    server_type: str = 'remote'  # 'remote' or 'local'
    url: Optional[str] = None
    api_key: Optional[str] = None
    command: Optional[str] = None
    args: Optional[List[str]] = None
    auto_start: bool = True
    working_directory: Optional[str] = None
    
    @model_validator(mode='after')
    def validate_server_config(self):
        if self.server_type == 'remote':
            if not self.url:
                raise ValueError('URL is required for remote servers')
        elif self.server_type == 'local':
            if not self.command:
                raise ValueError('Command is required for local servers')
        else:
            raise ValueError('server_type must be either "remote" or "local"')
        return self

class MCPServer(BaseModel):
    id: int
    name: str
    server_type: str
    url: Optional[str] = None
    command: Optional[str] = None
    args: Optional[str] = None
    auto_start: bool
    process_status: str
    working_directory: Optional[str] = None
    is_enabled: bool
    status: str

class MCPTool(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    is_enabled: bool

class MCPServerWithTools(MCPServer):
    tools: List[MCPTool] = []

class MCPServerToggle(BaseModel):
    enabled: bool

class ChatMessage(BaseModel):
    role: str  # "user", "assistant", or "tool"
    content: str
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None  # For tool response messages

class ChatRequest(BaseModel):
    message: str
    conversation_history: List[ChatMessage] = []
    llm_config_id: Optional[int] = None
    exclude_tools: Optional[bool] = False  # Set to True for final responses after tool execution

class ChatResponse(BaseModel):
    response: str
    tool_calls: Optional[List[Dict[str, Any]]] = None

class ToolCallRequest(BaseModel):
    tool_name: str
    parameters: Dict[str, Any]
    server_id: int

class ToolCallResponse(BaseModel):
    success: bool
    result: Any
    error: Optional[str] = None