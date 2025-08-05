import httpx
import json
from typing import Dict, List, Any, Optional
import uuid
from .local_mcp_manager import local_mcp_manager

class MCPClient:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def initialize_local_connection(self, server_id: int) -> Dict[str, Any]:
        """Initialize connection with local MCP server using JSON-RPC 2.0"""
        init_request = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {
                    "tools": {},
                    "logging": {}
                },
                "clientInfo": {
                    "name": "simple-mcp-chat-client",
                    "version": "1.0.0"
                }
            }
        }
        
        try:
            result = await local_mcp_manager.send_request(server_id, init_request)
            if result:
                # Send initialized notification
                await self._send_local_initialized_notification(server_id)
            return result or {}
        except Exception as e:
            raise Exception(f"Failed to initialize local MCP connection: {str(e)}")
    
    async def _send_local_initialized_notification(self, server_id: int) -> None:
        """Send initialized notification to local server"""
        notification = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {}
        }
        
        try:
            await local_mcp_manager.send_request(server_id, notification)
        except Exception as e:
            print(f"Warning: failed to send initialized notification to local server: {e}")

    async def initialize_connection(self, server_url: str, api_key: Optional[str] = None) -> Dict[str, Any]:
        """Initialize connection with MCP server using JSON-RPC 2.0"""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "simple-mcp-chat-client/1.0"
        }
        if api_key:
            headers["Authorization"] = f"ApiKey {api_key}"
        
        init_request = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {
                    "tools": {},
                    "logging": {}
                },
                "clientInfo": {
                    "name": "simple-mcp-chat-client",
                    "version": "1.0.0"
                }
            }
        }
        
        try:
            response = await self.client.post(server_url, json=init_request, headers=headers)
            response.raise_for_status()
            result = response.json()
            
            # Send initialized notification after successful initialize
            await self._send_initialized_notification(server_url, headers)
            
            return result
        except Exception as e:
            raise Exception(f"Failed to initialize MCP connection: {str(e)}")
    
    async def _send_initialized_notification(self, server_url: str, headers: Dict[str, str]) -> None:
        """Send initialized notification after successful initialize"""
        notification = {
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {}
        }
        
        try:
            response = await self.client.post(server_url, json=notification, headers=headers)
            # Notifications don't expect responses, but log if there's an error
            if response.status_code >= 400:
                print(f"Warning: initialized notification returned {response.status_code}")
        except Exception as e:
            print(f"Warning: failed to send initialized notification: {e}")

    async def list_local_tools(self, server_id: int) -> List[Dict[str, Any]]:
        """List available tools from local MCP server"""
        tools_request = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": "tools/list",
            "params": {}
        }
        
        try:
            result = await local_mcp_manager.send_request(server_id, tools_request)
            if result and "result" in result and "tools" in result["result"]:
                tools = result["result"]["tools"]
                return tools
            else:
                return []
        except Exception as e:
            raise Exception(f"Failed to list local tools: {str(e)}")

    async def list_tools(self, server_url: str, api_key: Optional[str] = None) -> List[Dict[str, Any]]:
        """List available tools from MCP server"""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        if api_key:
            headers["Authorization"] = f"ApiKey {api_key}"
        
        tools_request = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": "tools/list",
            "params": {}
        }
        
        try:
            response = await self.client.post(server_url, json=tools_request, headers=headers)
            response.raise_for_status()
            result = response.json()
            
            if "result" in result and "tools" in result["result"]:
                return result["result"]["tools"]
            return []
        except Exception as e:
            raise Exception(f"Failed to list tools: {str(e)}")
    
    async def call_local_tool(self, server_id: int, tool_name: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """Call a specific tool on local MCP server"""
        tool_request = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": parameters
            }
        }
        
        try:
            result = await local_mcp_manager.send_request(server_id, tool_request)
            return result or {}
        except Exception as e:
            raise Exception(f"Failed to call local tool {tool_name}: {str(e)}")

    async def call_tool(self, server_url: str, tool_name: str, parameters: Dict[str, Any], api_key: Optional[str] = None) -> Dict[str, Any]:
        """Call a specific tool on the MCP server"""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        if api_key:
            headers["Authorization"] = f"ApiKey {api_key}"
        
        tool_request = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": parameters
            }
        }
        
        try:
            response = await self.client.post(server_url, json=tool_request, headers=headers)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            raise Exception(f"Failed to call tool {tool_name}: {str(e)}")
    
    async def test_local_connection(self, server_id: int) -> bool:
        """Test if we can connect to a local MCP server"""
        try:
            if not local_mcp_manager.is_server_running(server_id):
                return False
            result = await self.initialize_local_connection(server_id)
            return "result" in result and "protocolVersion" in result.get("result", {})
        except:
            return False

    async def test_connection(self, server_url: str, api_key: Optional[str] = None) -> bool:
        """Test if we can connect to an MCP server"""
        try:
            result = await self.initialize_connection(server_url, api_key)
            return "result" in result and "protocolVersion" in result.get("result", {})
        except:
            return False
    
    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()

# Global MCP client instance
mcp_client = MCPClient()