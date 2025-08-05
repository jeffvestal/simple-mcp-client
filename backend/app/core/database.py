import sqlite3
import hashlib
import base64
from typing import List, Dict, Optional
from pathlib import Path

class Database:
    def __init__(self, db_path: str = "chat_client.db"):
        self.db_path = db_path
        self.init_database()
    
    def get_connection(self):
        return sqlite3.connect(self.db_path)
    
    def init_database(self):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # LLM configurations table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS llm_configs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    url TEXT NOT NULL,
                    api_key_hash TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    model TEXT NOT NULL DEFAULT 'gpt-3.5-turbo',
                    is_active BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Add model column to existing tables if it doesn't exist
            try:
                cursor.execute("ALTER TABLE llm_configs ADD COLUMN model TEXT DEFAULT 'gpt-3.5-turbo'")
            except sqlite3.OperationalError:
                # Column already exists
                pass
            
            # Add local MCP server columns if they don't exist
            try:
                cursor.execute("ALTER TABLE mcp_servers ADD COLUMN server_type TEXT DEFAULT 'remote'")
            except sqlite3.OperationalError:
                pass
            
            try:
                cursor.execute("ALTER TABLE mcp_servers ADD COLUMN command TEXT")
            except sqlite3.OperationalError:
                pass
                
            try:
                cursor.execute("ALTER TABLE mcp_servers ADD COLUMN args TEXT") 
            except sqlite3.OperationalError:
                pass
                
            try:
                cursor.execute("ALTER TABLE mcp_servers ADD COLUMN auto_start BOOLEAN DEFAULT TRUE")
            except sqlite3.OperationalError:
                pass
                
            try:
                cursor.execute("ALTER TABLE mcp_servers ADD COLUMN process_status TEXT DEFAULT 'stopped'")
            except sqlite3.OperationalError:
                pass
                
            try:
                cursor.execute("ALTER TABLE mcp_servers ADD COLUMN working_directory TEXT")
            except sqlite3.OperationalError:
                pass
                
            # Make URL nullable for local servers - Migration disabled temporarily
            # TODO: Re-enable migration after fixing hanging issue
            pass
            
            # MCP servers table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS mcp_servers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT UNIQUE NOT NULL,
                    url TEXT,
                    api_key_hash TEXT,
                    server_type TEXT DEFAULT 'remote',
                    command TEXT,
                    args TEXT,
                    auto_start BOOLEAN DEFAULT TRUE,
                    process_status TEXT DEFAULT 'stopped',
                    working_directory TEXT,
                    is_enabled BOOLEAN DEFAULT TRUE,
                    status TEXT DEFAULT 'disconnected',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Complete migration if old table exists - Disabled temporarily
            # TODO: Re-enable after fixing hanging issue
            pass
            
            # MCP tools table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS mcp_tools (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    server_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT,
                    is_enabled BOOLEAN DEFAULT TRUE,
                    schema TEXT,
                    FOREIGN KEY (server_id) REFERENCES mcp_servers (id) ON DELETE CASCADE,
                    UNIQUE(server_id, name)
                )
            """)
            
            conn.commit()
    
    def hash_api_key(self, api_key: str) -> str:
        return hashlib.sha256(api_key.encode()).hexdigest()
    
    def encode_api_key(self, api_key: str) -> str:
        """Simple base64 encoding for demo purposes - NOT secure for production"""
        return base64.b64encode(api_key.encode()).decode()
    
    def decode_api_key(self, encoded_key: str) -> str:
        """Decode base64 encoded API key"""
        return base64.b64decode(encoded_key.encode()).decode()
    
    # LLM Configuration methods
    def add_llm_config(self, name: str, url: str, api_key: str, provider: str, model: str) -> int:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            api_key_encoded = self.encode_api_key(api_key)
            cursor.execute("""
                INSERT INTO llm_configs (name, url, api_key_hash, provider, model)
                VALUES (?, ?, ?, ?, ?)
            """, (name, url, api_key_encoded, provider, model))
            return cursor.lastrowid
    
    def get_llm_configs(self) -> List[Dict]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, url, provider, model, is_active FROM llm_configs")
            return [dict(zip([col[0] for col in cursor.description], row)) for row in cursor.fetchall()]
    
    def set_active_llm(self, config_id: int):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE llm_configs SET is_active = FALSE")
            cursor.execute("UPDATE llm_configs SET is_active = TRUE WHERE id = ?", (config_id,))
    
    def delete_llm_config(self, config_id: int):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM llm_configs WHERE id = ?", (config_id,))
    
    def get_llm_config_with_key(self, config_id: int) -> Optional[Dict]:
        """Get LLM config including decoded API key for service initialization"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, url, api_key_hash, provider, model, is_active FROM llm_configs WHERE id = ?", (config_id,))
            row = cursor.fetchone()
            if row:
                config = dict(zip([col[0] for col in cursor.description], row))
                # Try to decode API key, handle legacy hashed keys
                if config['api_key_hash']:
                    try:
                        # Try base64 decoding first (new format)
                        config['api_key'] = self.decode_api_key(config['api_key_hash'])
                    except:
                        # If that fails, it's likely a legacy hashed key - return a placeholder
                        print(f"Warning: Legacy hashed API key detected for config {config_id}. Please re-add the API key.")
                        config['api_key'] = None
                return config
            return None
    
    # MCP Server methods
    def add_mcp_server(self, name: str, server_type: str = 'remote', url: Optional[str] = None, 
                      api_key: Optional[str] = None, command: Optional[str] = None, 
                      args: Optional[str] = None, auto_start: bool = True, 
                      working_directory: Optional[str] = None) -> int:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            api_key_encoded = self.encode_api_key(api_key) if api_key else None
            cursor.execute("""
                INSERT INTO mcp_servers (name, server_type, url, api_key_hash, command, args, auto_start, working_directory)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (name, server_type, url, api_key_encoded, command, args, auto_start, working_directory))
            return cursor.lastrowid
    
    def get_mcp_servers(self) -> List[Dict]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, server_type, url, command, args, auto_start, 
                       process_status, working_directory, is_enabled, status 
                FROM mcp_servers
            """)
            return [dict(zip([col[0] for col in cursor.description], row)) for row in cursor.fetchall()]
    
    def get_mcp_server_with_key(self, server_id: int) -> Optional[Dict]:
        """Get server details including API key hash for authentication"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, name, url, api_key_hash, is_enabled, status FROM mcp_servers WHERE id = ?", (server_id,))
            row = cursor.fetchone()
            if row:
                return dict(zip([col[0] for col in cursor.description], row))
            return None
    
    def update_server_status(self, server_id: int, status: str):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE mcp_servers SET status = ? WHERE id = ?", (status, server_id))
    
    def update_process_status(self, server_id: int, process_status: str):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE mcp_servers SET process_status = ? WHERE id = ?", (process_status, server_id))
    
    def toggle_server_enabled(self, server_id: int, enabled: bool):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE mcp_servers SET is_enabled = ? WHERE id = ?", (enabled, server_id))
    
    def delete_mcp_server(self, server_id: int):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM mcp_servers WHERE id = ?", (server_id,))
    
    # MCP Tools methods
    def add_mcp_tools(self, server_id: int, tools: List[Dict]):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            import json
            for tool in tools:
                # Properly serialize schema as JSON
                schema_json = json.dumps(tool.get('inputSchema', tool.get('schema', {})))
                cursor.execute("""
                    INSERT OR REPLACE INTO mcp_tools (server_id, name, description, schema)
                    VALUES (?, ?, ?, ?)
                """, (server_id, tool['name'], tool.get('description', ''), schema_json))
    
    def get_server_tools(self, server_id: int) -> List[Dict]:
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, name, description, is_enabled 
                FROM mcp_tools 
                WHERE server_id = ?
            """, (server_id,))
            return [dict(zip([col[0] for col in cursor.description], row)) for row in cursor.fetchall()]
    
    def toggle_tool_enabled(self, tool_id: int, enabled: bool):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE mcp_tools SET is_enabled = ? WHERE id = ?", (enabled, tool_id))