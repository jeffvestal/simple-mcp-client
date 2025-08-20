from fastapi import APIRouter, HTTPException, Depends
from typing import List, Dict, Any, Tuple
from ..core.database import Database
from ..models.schemas import (
    LLMConfigCreate, LLMConfig, MCPServerCreate, MCPServer, MCPServerWithTools,
    MCPServerToggle, ChatRequest, ChatResponse, ChatMessage, ToolCallRequest, ToolCallResponse
)
from ..services.mcp_client import mcp_client
from ..services.llm_service import LLMService
from ..services.local_mcp_manager import local_mcp_manager
from ..services.mcp_parameter_corrector import mcp_parameter_corrector

router = APIRouter()

# Database dependency
def get_db():
    return Database()

@router.get("/health")
async def health_check():
    return {"status": "healthy"}

# LLM Configuration endpoints
@router.post("/llm/config", response_model=Dict[str, Any])
async def create_llm_config(config: LLMConfigCreate, db: Database = Depends(get_db)):
    try:
        config_id = db.add_llm_config(config.name, config.url, config.api_key, config.provider.value, config.model)
        return {"id": config_id, "message": "LLM configuration created successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/llm/configs", response_model=List[LLMConfig])
async def get_llm_configs(db: Database = Depends(get_db)):
    return db.get_llm_configs()

@router.post("/llm/config/{config_id}/activate")
async def activate_llm_config(config_id: int, db: Database = Depends(get_db)):
    db.set_active_llm(config_id)
    return {"message": "LLM configuration activated"}

@router.delete("/llm/config/{config_id}")
async def delete_llm_config(config_id: int, db: Database = Depends(get_db)):
    try:
        db.delete_llm_config(config_id)
        return {"message": "LLM configuration deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# MCP Server endpoints
@router.post("/mcp/servers", response_model=Dict[str, Any])
async def create_mcp_server(server: MCPServerCreate, db: Database = Depends(get_db)):
    print(f"[DEBUG] POST /mcp/servers started - server_type: {server.server_type}, name: {server.name}")
    try:
        if server.server_type == 'local':
            print(f"[DEBUG] Processing local server creation...")
            # Handle local server
            if not server.command:
                raise HTTPException(status_code=400, detail="Command is required for local servers")
            
            # Validate command exists
            print(f"[DEBUG] Validating command: {server.command}")
            if not local_mcp_manager.validate_command(server.command):
                error_msg = f"Command not found or not executable: {server.command}"
                print(f"[DEBUG] Command validation failed: {error_msg}")
                raise HTTPException(status_code=400, detail=error_msg)
            print(f"[DEBUG] Command validation passed")
            
            # Add server to database
            print(f"[DEBUG] Adding server to database...")
            import json
            args_json = json.dumps(server.args or [])
            server_id = db.add_mcp_server(
                name=server.name,
                server_type='local',
                command=server.command,
                args=args_json,
                auto_start=server.auto_start,
                working_directory=server.working_directory
            )
            print(f"[DEBUG] Server added to database with ID: {server_id}")
            
            # TEMPORARILY DISABLE AUTO_START TO ISOLATE ISSUE
            print(f"[DEBUG] Skipping auto_start (temporarily disabled for debugging)")
            db.update_process_status(server_id, "stopped")
            db.update_server_status(server_id, "stopped")
            
            return {"id": server_id, "message": "Local MCP server configured successfully"}
            
        else:
            # Handle remote server (existing logic)
            if not server.url:
                raise HTTPException(status_code=400, detail="URL is required for remote servers")
                
            # Test connection first
            connection_test = await mcp_client.test_connection(server.url, server.api_key)
            if not connection_test:
                raise HTTPException(status_code=400, detail="Failed to connect to MCP server")
            
            # Add server to database
            server_id = db.add_mcp_server(
                name=server.name,
                server_type='remote',
                url=server.url,
                api_key=server.api_key
            )
            db.update_server_status(server_id, "connected")
            
            # Discover and store tools
            try:
                tools = await mcp_client.list_tools(server.url, server.api_key)
                if tools:
                    db.add_mcp_tools(server_id, tools)
            except Exception as e:
                print(f"Failed to discover tools: {e}")
            
            return {"id": server_id, "message": "MCP server connected successfully"}
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/mcp/servers", response_model=List[MCPServer])
async def get_mcp_servers(db: Database = Depends(get_db)):
    return db.get_mcp_servers()

@router.get("/mcp/servers/{server_id}", response_model=MCPServerWithTools)
async def get_mcp_server_with_tools(server_id: int, db: Database = Depends(get_db)):
    servers = db.get_mcp_servers()
    server = next((s for s in servers if s["id"] == server_id), None)
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    
    tools = db.get_server_tools(server_id)
    return MCPServerWithTools(**server, tools=tools)

@router.post("/mcp/servers/{server_id}/toggle")
async def toggle_mcp_server(server_id: int, toggle_data: MCPServerToggle, db: Database = Depends(get_db)):
    db.toggle_server_enabled(server_id, toggle_data.enabled)
    return {"message": f"Server {'enabled' if toggle_data.enabled else 'disabled'}"}

@router.delete("/mcp/servers/{server_id}")
async def delete_mcp_server(server_id: int, db: Database = Depends(get_db)):
    # Stop local server if it's running
    servers = db.get_mcp_servers()
    server = next((s for s in servers if s["id"] == server_id), None)
    if server and server.get("server_type") == "local":
        local_mcp_manager.stop_server(server_id)
    
    db.delete_mcp_server(server_id)
    return {"message": "Server deleted successfully"}

@router.post("/mcp/servers/{server_id}/start")
async def start_local_server(server_id: int, db: Database = Depends(get_db)):
    try:
        servers = db.get_mcp_servers()
        server = next((s for s in servers if s["id"] == server_id), None)
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
        
        if server["server_type"] != "local":
            raise HTTPException(status_code=400, detail="Only local servers can be started")
        
        import json
        args = json.loads(server.get("args", "[]"))
        working_dir = server.get("working_directory")
        success = await local_mcp_manager.start_server(
            server_id, server["name"], server["command"], args, working_dir
        )
        
        if success:
            db.update_process_status(server_id, "running")
            db.update_server_status(server_id, "connected")
            
            # Now perform MCP protocol handshake and tool discovery
            try:
                print(f"[DEBUG] Starting MCP handshake for server {server_id}")
                
                # Initialize connection
                init_result = await mcp_client.initialize_local_connection(server_id)
                print(f"[DEBUG] Initialize result: {init_result}")
                
                if init_result and "result" in init_result:
                    # Discover tools
                    print(f"[DEBUG] Discovering tools for server {server_id}")
                    tools = await mcp_client.list_local_tools(server_id)
                    print(f"[DEBUG] Discovered {len(tools)} tools: {[t.get('name', 'unknown') for t in tools]}")
                    
                    # Store tools in database
                    if tools:
                        print(f"[DEBUG] Storing tools in database")
                        db.add_mcp_tools(server_id, tools)
                        print(f"[DEBUG] Tools stored successfully")
                    
                    return {"message": f"Server started successfully with {len(tools)} tools discovered"}
                else:
                    print(f"[DEBUG] MCP handshake failed, but server is running")
                    return {"message": "Server started but MCP handshake failed - check server logs"}
                    
            except Exception as e:
                print(f"[DEBUG] Tool discovery failed: {str(e)}")
                # Server is running but tool discovery failed
                return {"message": f"Server started but tool discovery failed: {str(e)}"}
        else:
            db.update_process_status(server_id, "error")
            db.update_server_status(server_id, "error")
            raise HTTPException(status_code=500, detail="Failed to start server")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/mcp/servers/{server_id}/stop")
async def stop_local_server(server_id: int, db: Database = Depends(get_db)):
    try:
        servers = db.get_mcp_servers()
        server = next((s for s in servers if s["id"] == server_id), None)
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
        
        if server["server_type"] != "local":
            raise HTTPException(status_code=400, detail="Only local servers can be stopped")
        
        success = local_mcp_manager.stop_server(server_id)
        
        if success:
            db.update_process_status(server_id, "stopped")
            db.update_server_status(server_id, "stopped")
            return {"message": "Server stopped successfully"}
        else:
            raise HTTPException(status_code=500, detail="Failed to stop server")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/mcp/servers/health/all")
async def get_all_servers_health(db: Database = Depends(get_db)):
    """Get health status of all local MCP servers."""
    try:
        # Get all server health
        health_status = local_mcp_manager.get_all_server_health()
        
        # Clean up any dead processes
        cleaned_count = local_mcp_manager.cleanup_dead_processes()
        
        # Update database status for dead processes
        if cleaned_count > 0:
            servers = db.get_mcp_servers()
            for server in servers:
                if server["server_type"] == "local" and server["id"] in health_status:
                    health = health_status[server["id"]]
                    if not health.get('running', False):
                        db.update_process_status(server["id"], "stopped")
                        db.update_server_status(server["id"], "error" if health.get('exit_code', 0) != 0 else "stopped")
        
        return {
            "health_status": health_status,
            "cleaned_processes": cleaned_count
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/mcp/servers/{server_id}/health")
async def get_server_health(server_id: int, db: Database = Depends(get_db)):
    """Get health status of a local MCP server."""
    try:
        servers = db.get_mcp_servers()
        server = next((s for s in servers if s["id"] == server_id), None)
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
        
        if server["server_type"] != "local":
            raise HTTPException(status_code=400, detail="Health check only available for local servers")
        
        # Get health from LocalMCPManager
        health = local_mcp_manager.check_server_health(server_id)
        
        # Clean up dead processes if needed and update database
        if not health.get('running', False):
            local_mcp_manager.cleanup_dead_processes()
            # Update database status
            db.update_process_status(server_id, "stopped")
            if health.get('status') == 'exited' and health.get('exit_code', 0) != 0:
                db.update_server_status(server_id, "error")
            else:
                db.update_server_status(server_id, "stopped")
        
        return health
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/mcp/tools/{tool_id}/toggle")
async def toggle_mcp_tool(tool_id: int, enabled: bool, db: Database = Depends(get_db)):
    db.toggle_tool_enabled(tool_id, enabled)
    return {"message": f"Tool {'enabled' if enabled else 'disabled'}"}

# Chat endpoints
@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Database = Depends(get_db)):
    try:
        print(f"[DEBUG] Chat request received:")
        print(f"[DEBUG] Message: {request.message}")
        print(f"[DEBUG] Conversation history length: {len(request.conversation_history)}")
        for i, msg in enumerate(request.conversation_history):
            print(f"[DEBUG] Message {i}: role={getattr(msg, 'role', 'unknown')}, content_length={len(getattr(msg, 'content', ''))}, tool_calls={getattr(msg, 'tool_calls', None)}, tool_call_id={getattr(msg, 'tool_call_id', None)}")
        print(f"[DEBUG] LLM config ID: {request.llm_config_id}")
        # Get LLM configuration - use specified ID or active config
        llm_configs = db.get_llm_configs()
        if request.llm_config_id:
            config = next((c for c in llm_configs if c["id"] == request.llm_config_id), None)
            if not config:
                raise HTTPException(status_code=400, detail=f"LLM configuration {request.llm_config_id} not found")
        else:
            # Use active LLM configuration
            config = next((c for c in llm_configs if c["is_active"]), None)
            if not config:
                raise HTTPException(status_code=400, detail="No active LLM configuration found. Please configure and activate an LLM provider.")
        
        # Get LLM configuration with API key
        config_with_key = db.get_llm_config_with_key(config["id"])
        if not config_with_key:
            raise HTTPException(status_code=400, detail="LLM configuration not found")
        
        if not config_with_key.get("api_key"):
            raise HTTPException(status_code=400, detail="LLM configuration API key not found or is invalid. Please re-configure your API key in Settings.")
        
        # Initialize LLM service
        llm_service = LLMService(
            provider=config["provider"],
            api_key=config_with_key["api_key"],
            model=config_with_key.get("model", "gpt-4o"),  # Use model from config_with_key
            base_url=config["url"]
        )
        
        # Get available tools from enabled MCP servers (unless excluded for final responses)
        available_tools = []
        if not request.exclude_tools:
            print(f"[DEBUG] Including tools in LLM request")
            servers = db.get_mcp_servers()
            for server in servers:
                if server["is_enabled"] and server["status"] == "connected":
                    tools = db.get_server_tools(server["id"])
                    for tool in tools:
                        if tool["is_enabled"]:
                            # Parse stored schema or use default
                            try:
                                import json
                                schema = json.loads(tool.get("schema", "{}"))
                                if not schema or not isinstance(schema, dict):
                                    schema = {"type": "object", "properties": {}}
                            except:
                                schema = {"type": "object", "properties": {}}
                            
                            available_tools.append({
                                "type": "function",
                                "function": {
                                    "name": tool["name"],
                                    "description": tool.get("description", ""),
                                    "parameters": schema
                                }
                            })
        else:
            print(f"[DEBUG] Excluding tools from LLM request (final response mode)")
        
        # Generate response
        # Convert conversation history to ChatMessage objects
        chat_messages = []
        for msg in request.conversation_history:
            # Handle both dict and ChatMessage objects
            if isinstance(msg, dict):
                chat_messages.append(ChatMessage(
                    role=msg.get("role", "user"),
                    content=msg.get("content", ""),
                    tool_calls=msg.get("tool_calls")
                ))
            else:
                # Already a ChatMessage object
                chat_messages.append(msg)
        
        # Add the current user message
        chat_messages.append(ChatMessage(
            role="user",
            content=request.message
        ))
        
        response = await llm_service.generate_response(chat_messages, available_tools if available_tools else None)
        
        print(f"[DEBUG] LLM service response: {response}")
        print(f"[DEBUG] Response type: {type(response)}")
        print(f"[DEBUG] Response keys: {list(response.keys()) if isinstance(response, dict) else 'not a dict'}")
        
        # Handle case where LLM makes tool calls without content
        content = response.get("content") or ""
        tool_calls = response.get("tool_calls", [])
        
        print(f"[DEBUG] Extracted content: '{content}' (length: {len(content)})")
        print(f"[DEBUG] Extracted tool_calls: {tool_calls}")
        
        chat_response = ChatResponse(
            response=content,
            tool_calls=tool_calls
        )
        
        print(f"[DEBUG] Final ChatResponse: {chat_response}")
        return chat_response
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Tool calling endpoint
@router.post("/mcp/call-tool", response_model=ToolCallResponse)
async def call_tool(request: ToolCallRequest, db: Database = Depends(get_db)):
    async def _make_tool_call(params: Dict[str, Any]):
        """Helper function to make the actual tool call"""
        if server["server_type"] == "local":
            result = await mcp_client.call_local_tool(
                request.server_id,
                request.tool_name, 
                params
            )
        else:
            # Get server details with API key for remote servers
            server_with_key = db.get_mcp_server_with_key(request.server_id)
            if not server_with_key:
                raise HTTPException(status_code=404, detail="Server details not found")
            
            # Decode API key if available
            api_key = None
            if server_with_key.get("api_key_hash"):
                api_key = db.decode_api_key(server_with_key["api_key_hash"])
            
            # Call remote tool
            result = await mcp_client.call_tool(
                server_with_key["url"], 
                request.tool_name, 
                params,
                api_key
            )
        
        # Check if result contains a JSON-RPC error
        if result and isinstance(result, dict) and "error" in result:
            return False, result["error"]
        elif result and isinstance(result, dict) and "result" in result:
            return True, result["result"]
        else:
            return False, "Invalid response format from MCP server"
    
    try:
        # Get server details
        servers = db.get_mcp_servers()
        server = next((s for s in servers if s["id"] == request.server_id), None)
        if not server:
            raise HTTPException(status_code=404, detail="Server not found")
        
        print(f"[DEBUG] Calling tool {request.tool_name} on {server['server_type']} server {request.server_id}")
        print(f"[DEBUG] Original parameters: {request.parameters}")
        
        # First attempt with original parameters
        success, result_or_error = await _make_tool_call(request.parameters)
        
        if success:
            print(f"[DEBUG] Tool call succeeded on first attempt")
            return ToolCallResponse(success=True, result=result_or_error)
        
        # First attempt failed - check if it's a parameter validation error we can correct
        error_message = result_or_error.get("message", str(result_or_error)) if isinstance(result_or_error, dict) else str(result_or_error)
        print(f"[DEBUG] Tool call failed: {error_message}")
        
        # Try to correct parameters if it's a validation error
        if "invalid" in error_message.lower() or "required" in error_message.lower() or "expected" in error_message.lower():
            print(f"[DEBUG] Attempting parameter correction for validation error...")
            
            correction = mcp_parameter_corrector.analyze_error_and_correct(error_message, request.parameters)
            
            if correction:
                print(f"[DEBUG] Parameter correction found: {correction.transformation_applied}")
                print(f"[DEBUG] Corrected parameters: {correction.corrected_params}")
                
                # Retry with corrected parameters
                retry_success, retry_result_or_error = await _make_tool_call(correction.corrected_params)
                
                if retry_success:
                    print(f"[DEBUG] Tool call succeeded after parameter correction!")
                    return ToolCallResponse(success=True, result=retry_result_or_error)
                else:
                    print(f"[DEBUG] Tool call still failed after parameter correction: {retry_result_or_error}")
                    # Return the original error since correction didn't help
                    return ToolCallResponse(success=False, result=None, error=error_message)
            else:
                print(f"[DEBUG] No parameter correction available for this error")
        
        # Return the original error
        return ToolCallResponse(success=False, result=None, error=error_message)
        
    except Exception as e:
        print(f"[DEBUG] Tool call exception: {str(e)}")
        return ToolCallResponse(success=False, result=None, error=str(e))