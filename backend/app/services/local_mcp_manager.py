import subprocess
import json
import asyncio
import logging
import os
import shutil
from typing import Dict, Optional, List, Any
from pathlib import Path
import uuid
import time

logger = logging.getLogger(__name__)

class LocalMCPManager:
    def __init__(self):
        self.processes: Dict[int, subprocess.Popen] = {}
        self.server_configs: Dict[int, Dict] = {}
        self.logs_dir = Path("logs")
        self.logs_dir.mkdir(exist_ok=True)
    
    def validate_command(self, command: str) -> bool:
        """Validate that a command exists and is executable."""
        try:
            # Check if command exists in PATH
            if shutil.which(command):
                return True
            
            # Check if it's an absolute path and executable
            if os.path.isfile(command) and os.access(command, os.X_OK):
                return True
                
            return False
        except Exception as e:
            logger.error(f"Error validating command {command}: {e}")
            return False
    
    async def startup_cleanup(self, db) -> None:
        """Verify and cleanup MCP server processes on startup."""
        try:
            # Get all servers from database
            servers = db.get_mcp_servers()
            local_servers = [s for s in servers if s.get("server_type") == "local"]
            
            print(f"[DEBUG] Found {len(local_servers)} local MCP servers in database")
            
            for server in local_servers:
                server_id = server["id"]
                server_name = server["name"]
                
                # Check if server is marked as running in database
                if server.get("status") == "connected" or server.get("process_status") == "running":
                    print(f"[DEBUG] Checking server {server_id} ({server_name}) marked as running")
                    
                    # Verify if process is actually running
                    health = self.check_server_health(server_id)
                    if not health.get("running", False):
                        print(f"[DEBUG] Server {server_id} ({server_name}) not actually running, updating status")
                        # Update database to reflect actual status
                        db.update_process_status(server_id, "stopped")
                        db.update_server_status(server_id, "stopped")
            
            print(f"[DEBUG] Startup cleanup completed for {len(local_servers)} servers")
            
        except Exception as e:
            logger.error(f"Error during startup cleanup: {e}")
            print(f"[DEBUG] Error during startup cleanup: {e}")
    
    async def start_server(self, server_id: int, name: str, command: str, args: List[str], working_directory: Optional[str] = None) -> bool:
        """Start a local MCP server process."""
        print(f"[DEBUG] LocalMCPManager.start_server called - ID: {server_id}, name: {name}")
        try:
            # Validate command first
            print(f"[DEBUG] Validating command in LocalMCPManager: {command}")
            if not self.validate_command(command):
                logger.error(f"Command not found or not executable: {command}")
                print(f"[DEBUG] Command validation failed in LocalMCPManager")
                return False
            print(f"[DEBUG] Command validation passed in LocalMCPManager")
            
            # Parse args if it's a JSON string
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = []
            
            if not isinstance(args, list):
                args = []
            
            # Prepare command array
            cmd_array = [command] + args
            print(f"[DEBUG] Command array: {cmd_array}")
            print(f"[DEBUG] Working directory: {working_directory}")
            
            # Set up log files
            log_file = self.logs_dir / f"mcp-{name}-{server_id}.log"
            error_log_file = self.logs_dir / f"mcp-{name}-{server_id}-error.log"
            print(f"[DEBUG] Log file: {log_file}")
            print(f"[DEBUG] Error log file: {error_log_file}")
            
            # Start the process with improved logging
            print(f"[DEBUG] Starting subprocess...")
            with open(log_file, 'w') as log_f, open(error_log_file, 'w') as err_f:
                process = subprocess.Popen(
                    cmd_array,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=err_f,
                    text=True,
                    bufsize=0,
                    cwd=working_directory if working_directory else None
                )
            print(f"[DEBUG] Subprocess started with PID: {process.pid}")
            
            self.processes[server_id] = process
            self.server_configs[server_id] = {
                'name': name,
                'command': command,
                'args': args,
                'working_directory': working_directory,
                'log_file': str(log_file)
            }
            
            # Give process a moment to start with timeout
            print(f"[DEBUG] Waiting up to 3s for process to stabilize...")
            stabilization_timeout = 3.0
            check_interval = 0.1
            elapsed = 0
            
            while elapsed < stabilization_timeout:
                await asyncio.sleep(check_interval)
                elapsed += check_interval
                
                # Check if process crashed early
                if process.poll() is not None:
                    logger.error(f"MCP server {name} (ID: {server_id}) crashed during startup")
                    print(f"[DEBUG] Process crashed during startup, exit code: {process.returncode}")
                    self.cleanup_server(server_id)
                    return False
                
                # Process is still running after some time, consider it stable
                if elapsed >= 1.0:  # Wait at least 1 second for stability
                    break
            
            # Final check if process is still running
            print(f"[DEBUG] Final check - process running: {process.poll() is None}")
            if process.poll() is None:
                logger.info(f"Successfully started MCP server {name} (ID: {server_id})")
                print(f"[DEBUG] Process is running successfully")
                return True
            else:
                logger.error(f"MCP server {name} (ID: {server_id}) failed to start")
                print(f"[DEBUG] Process failed to start, exit code: {process.returncode}")
                self.cleanup_server(server_id)
                return False
                
        except Exception as e:
            error_msg = f"Error starting MCP server {name}: {str(e)}"
            logger.error(error_msg)
            print(error_msg)  # Also print to console for debugging
            self.cleanup_server(server_id)
            return False
    
    def stop_server(self, server_id: int) -> bool:
        """Stop a local MCP server process."""
        try:
            if server_id not in self.processes:
                logger.info(f"Server {server_id} already stopped")
                return True  # Already stopped
            
            process = self.processes[server_id]
            server_name = self.server_configs.get(server_id, {}).get('name', f'ID-{server_id}')
            
            if process.poll() is None:  # Process is running
                logger.info(f"Stopping MCP server {server_name} (ID: {server_id})")
                process.terminate()
                
                # Wait for graceful shutdown with timeout
                try:
                    process.wait(timeout=10)  # Increased timeout
                    logger.info(f"MCP server {server_name} terminated gracefully")
                except subprocess.TimeoutExpired:
                    logger.warning(f"MCP server {server_name} did not terminate gracefully, force killing")
                    # Force kill if it doesn't shut down gracefully
                    process.kill()
                    try:
                        process.wait(timeout=5)  # Wait for kill to complete
                        logger.info(f"MCP server {server_name} force killed")
                    except subprocess.TimeoutExpired:
                        logger.error(f"Failed to force kill MCP server {server_name}")
                        return False
            else:
                logger.info(f"MCP server {server_name} was already stopped")
            
            self.cleanup_server(server_id)
            logger.info(f"Successfully stopped MCP server {server_name} (ID: {server_id})")
            return True
            
        except Exception as e:
            logger.error(f"Error stopping MCP server {server_id}: {e}")
            return False
    
    def cleanup_server(self, server_id: int):
        """Clean up server resources."""
        if server_id in self.processes:
            del self.processes[server_id]
        if server_id in self.server_configs:
            del self.server_configs[server_id]
    
    def is_server_running(self, server_id: int) -> bool:
        """Check if a server process is running."""
        if server_id not in self.processes:
            return False
        
        process = self.processes[server_id]
        return process.poll() is None
    
    def get_server_status(self, server_id: int) -> str:
        """Get the current status of a server."""
        if server_id not in self.processes:
            return 'stopped'
        
        if self.is_server_running(server_id):
            return 'running'
        else:
            return 'error'
    
    async def send_request(self, server_id: int, request: Dict[str, Any], timeout: float = 10.0) -> Optional[Dict[str, Any]]:
        """Send a JSON-RPC request to a local MCP server with timeout."""
        try:
            if not self.is_server_running(server_id):
                logger.warning(f"Cannot send request to server {server_id}: not running")
                return None
            
            process = self.processes[server_id]
            server_name = self.server_configs.get(server_id, {}).get('name', f'ID-{server_id}')
            
            # Send request with timeout handling
            request_json = json.dumps(request) + '\n'
            logger.debug(f"Sending request to {server_name}: {request.get('method', 'unknown')}")
            
            try:
                # Send request
                process.stdin.write(request_json)
                process.stdin.flush()
                
                # Read response with timeout using select
                import select
                
                # Use select to wait for data with timeout
                ready, _, _ = select.select([process.stdout], [], [], timeout)
                
                if ready:
                    response_line = process.stdout.readline()
                    
                    if response_line.strip():
                        response = json.loads(response_line.strip())
                        logger.debug(f"Received response from {server_name}")
                        return response
                    else:
                        logger.warning(f"Empty response from {server_name}")
                        return None
                else:
                    logger.error(f"Request to {server_name} timed out after {timeout}s")
                    return None
                    
            except Exception as inner_e:
                logger.error(f"Communication error with {server_name}: {inner_e}")
                return None
            
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON response from server {server_id}: {e}")
            print(f"[DEBUG] JSON decode error: {e}")
            return None
        except Exception as e:
            server_name = self.server_configs.get(server_id, {}).get('name', f'ID-{server_id}')
            logger.error(f"Error sending request to server {server_name} ({server_id}): {e}")
            print(f"[DEBUG] General error: {e}")
            return None
    
    def get_running_servers(self) -> List[int]:
        """Get list of currently running server IDs."""
        return [sid for sid in self.processes.keys() if self.is_server_running(sid)]
    
    def check_server_health(self, server_id: int) -> Dict[str, Any]:
        """Check the health status of a server process."""
        if server_id not in self.processes:
            return {
                'status': 'not_found',
                'running': False,
                'pid': None,
                'exit_code': None
            }
        
        process = self.processes[server_id]
        config = self.server_configs.get(server_id, {})
        
        if process.poll() is None:
            # Process is running
            return {
                'status': 'running',
                'running': True,
                'pid': process.pid,
                'exit_code': None,
                'name': config.get('name', f'ID-{server_id}'),
                'command': config.get('command'),
                'log_file': config.get('log_file')
            }
        else:
            # Process has exited
            return {
                'status': 'exited',
                'running': False,
                'pid': process.pid,
                'exit_code': process.returncode,
                'name': config.get('name', f'ID-{server_id}'),
                'command': config.get('command'),
                'log_file': config.get('log_file')
            }
    
    def get_all_server_health(self) -> Dict[int, Dict[str, Any]]:
        """Get health status for all managed servers."""
        health_status = {}
        for server_id in list(self.processes.keys()):
            health_status[server_id] = self.check_server_health(server_id)
        return health_status
    
    def cleanup_dead_processes(self):
        """Clean up processes that have died."""
        dead_servers = []
        for server_id in list(self.processes.keys()):
            if not self.is_server_running(server_id):
                health = self.check_server_health(server_id)
                logger.warning(f"Cleaning up dead process: {health.get('name')} (exit code: {health.get('exit_code')})")
                dead_servers.append(server_id)
        
        for server_id in dead_servers:
            self.cleanup_server(server_id)
        
        return len(dead_servers)
    
    def shutdown_all(self):
        """Shutdown all running servers."""
        logger.info(f"Shutting down {len(self.processes)} MCP servers")
        for server_id in list(self.processes.keys()):
            self.stop_server(server_id)

# Global instance
local_mcp_manager = LocalMCPManager()