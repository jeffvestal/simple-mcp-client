# Simple MCP Client

A full-stack chat application that connects to LLM providers and utilizes tools from MCP (Model Context Protocol) servers. Features a clean, modern interface with comprehensive tool execution and visualization capabilities.
<img width="456" height="309" alt="simple-mcp-chat_robots_half_sized" src="https://github.com/user-attachments/assets/25d4dc1d-7cd8-459b-9620-96676038051f" />

## Current State

This application is **fully functional and production-ready** with robust error handling:

✅ **Complete Tool Execution Pipeline**: End-to-end tool calling with LLM follow-up responses  
✅ **Smart Error Recovery**: Automatic parameter correction for any MCP server validation errors  
✅ **Robust Error Handling**: Comprehensive tool failure recovery and OpenAI API compliance  
✅ **Professional UI**: Collapsible tool call displays with real-time status indicators  
✅ **Multi-LLM Support**: OpenAI, Gemini, and Bedrock compatible APIs  
✅ **MCP Server Management**: Remote and local MCP server support with process management  
✅ **Real-time Status**: Live connection status and server health monitoring  
✅ **Dark/Light Mode**: Persistent theme switching with clean design  
✅ **Chat Management**: Clear chat functionality with message history  
✅ **Conversation History**: Proper OpenAI API compliance for multi-turn tool conversations  
✅ **Retry Mechanisms**: Intelligent retry logic for validation errors with parameter correction  

## Features

- **Modern Chat Interface**: Clean UI with markdown support and user/assistant message bubbles
- **Complete Tool Execution**: Tools are executed with results fed back to LLM for natural responses
- **Tool Visualization**: Expandable tool call displays showing request/response details with status indicators
- **Advanced Error Handling**: Automatic recovery from tool failures with intelligent parameter correction
- **OpenAI API Compliance**: Proper conversation history management for multi-turn tool interactions
- **MCP Server Integration**: Connect and manage multiple MCP servers with automatic tool discovery
- **Local & Remote Servers**: Support for both HTTP-based and local process-based MCP servers
- **Process Management**: Automatic server startup/shutdown with health monitoring
- **Multi-LLM Support**: OpenAI, Gemini, and Bedrock compatible APIs
- **Real-time Updates**: Live connection status and server management
- **Responsive Design**: Works on desktop and mobile devices
- **Universal MCP Compatibility**: Works with any MCP server through generic error parsing

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **UI Library**: Shadcn/ui + Tailwind CSS + Lucide Icons
- **State Management**: Zustand
- **Backend**: FastAPI + Python 3.8+
- **Database**: SQLite (file-based)
- **Protocol**: MCP over JSON-RPC 2.0 (HTTP and stdio)
- **Markdown**: ReactMarkdown for rich message rendering

## Quick Start

### 1. Automated Setup (Recommended)

Run the setup script from the project root:

```bash
./setup.sh
```

This script will:
- Check system prerequisites (Python 3.8+, Node.js 16+, npm)
- Create and configure Python virtual environment
- Install all Python dependencies
- Install all Node.js dependencies  
- Initialize the database
- Provide clear instructions for starting the application

### 2. Quick Development Startup (Recommended)

The application supports multiple deployment environments. Use the unified start script to run both backend and frontend:

#### Local Development (Default)
```bash
./start-dev.sh
# or: ./start-dev.sh local
```

#### Workshop/Kubernetes Environments (Instruqt, etc.)
When the backend isn't accessible via localhost, use proxy mode:
```bash
./start-dev.sh proxy
```

This proxies API requests through the frontend dev server to avoid external port access issues.

#### Custom Backend URL
For remote backends or custom deployments:
```bash
./start-dev.sh custom https://your-backend-url/api
# or: VITE_API_BASE_URL=https://your-backend-url/api ./start-dev.sh custom
```

#### Quick Reference - Start Options

| Command | Use Case | Description |
|---------|----------|-------------|
| `./start-dev.sh` | Local development | Default mode, both servers on localhost |
| `./start-dev.sh proxy` | Workshops, Kubernetes | Frontend proxies API requests |
| `./start-dev.sh custom URL` | Remote backends | Custom backend URL |

The script will:
- Start backend server on `http://localhost:8002`
- Start frontend server on `http://localhost:5173` (or next available port)
- Log all output to `logs/backend.log` and `logs/frontend.log`
- Handle graceful shutdown when you press Ctrl+C
- Display real-time status and URLs

**To stop the servers:**
Press `Ctrl+C` in the terminal running the script.

**Monitor logs in real-time:**
```bash
# Backend logs
tail -f logs/backend.log

# Frontend logs  
tail -f logs/frontend.log
```

### 3. Manual Setup

If you prefer manual setup or need to troubleshoot:

#### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a Python virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Start the FastAPI server:
   ```bash
   python main.py
   ```

The API will be available at `http://localhost:8002`

#### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The app will be available at `http://localhost:5173`

## Usage

### Getting Started

1. **Configure an LLM Provider**:
   - Click the Settings icon in the top-right
   - Add your LLM provider (OpenAI, Gemini, or Bedrock)
   - Enter your API key and configure settings
   - The status indicator will turn green when connected

2. **Add MCP Servers** (Optional):
   - In Settings, go to the MCP Servers section
   - Add remote or local MCP servers
   - Start servers and verify tool discovery
   - Tools will be automatically available to the LLM

3. **Start Chatting**:
   - Go back to the Chat interface
   - Ask questions or request tool usage
   - Watch tools execute in collapsible displays
   - Get natural language responses based on tool results

### Example Interactions

- **"What's the weather in New York?"** - Uses weather MCP tools
- **"Search for information about..."** - Uses search/web MCP tools  
- **"Analyze this data..."** - Uses analysis MCP tools
- **General conversation** - Direct LLM responses without tools

## Configuration

### LLM Providers

The application supports multiple LLM providers:

- **OpenAI-Compatible**: 
  - OpenAI API
  - Local models (Ollama, LM Studio, etc.)
  - Other OpenAI-compatible endpoints
- **Google Gemini**: Direct Gemini API integration
- **AWS Bedrock**: Claude, Titan, and other Bedrock models

### MCP Servers

Two types of MCP servers are supported:

#### Remote MCP Servers (HTTP)
Connect to HTTP-based MCP servers:
- **Name**: Display name for the server
- **URL**: HTTP endpoint for JSON-RPC communication  
- **API Key**: Optional authentication token
- **Automatic Discovery**: Tools are discovered on connection

#### Local MCP Servers (Process)
Run MCP servers as local processes:
- **Name**: Display name for the server
- **Command**: Executable command (e.g., `uv`, `npx`, `python`)
- **Arguments**: Command arguments (one per line)
- **Working Directory**: Optional directory to run the command in
- **Auto-start**: Whether to start the server automatically
- **Process Management**: Automatic startup, health monitoring, and cleanup

**Example Local Server Configuration:**
```
Name: Weather Server
Command: uv
Arguments: 
  run
  weather.py
Working Directory: /path/to/weather-mcp/weather
Auto-start: Yes
```

## Security Note

⚠️ **This is a demo application** designed for development and testing purposes. Current security considerations:

- API keys are stored with basic hashing (not production-ready encryption)
- No authentication/authorization system implemented
- Local MCP servers run with user permissions
- CORS enabled for development (localhost only)
- Comprehensive logging may expose sensitive data in development mode

**For production use**, implement:
- Proper encryption for sensitive data storage
- User authentication and session management  
- API rate limiting and input validation
- Secure MCP server sandboxing
- Database access controls
- Audit and sanitize all logging output

See `CLAUDE.md` for detailed security improvement tasks and implementation guidance.

## Architecture

### Backend Structure
```
backend/
├── app/
│   ├── api/routes.py               # FastAPI endpoints
│   ├── core/database.py            # SQLite database operations  
│   ├── models/schemas.py           # Pydantic models
│   └── services/
│       ├── llm_service.py          # LLM provider integrations
│       ├── mcp_client.py           # Remote MCP protocol client
│       └── local_mcp_manager.py    # Local MCP process management
├── logs/                           # Application and MCP server logs
└── main.py                         # FastAPI application with lifespan management
```

### Frontend Structure
```
frontend/
├── src/
│   ├── components/
│   │   ├── ui/                     # Shadcn/ui components
│   │   ├── ChatInterfaceSimple.tsx # Main chat interface with tool execution
│   │   └── SettingsPage.tsx        # Configuration management
│   ├── lib/
│   │   ├── api.ts                  # Backend API client
│   │   └── utils.ts                # Utility functions
│   ├── store/
│   │   └── useStore.ts             # Zustand state management
│   └── types/
│       └── api.ts                  # TypeScript interfaces
├── public/
│   └── robot-logo.png              # Application logo
└── AppMinimal.tsx                  # Main application component
```

### Key Components

- **ChatInterfaceSimple**: Complete tool execution pipeline with UI
- **ToolCallDisplay**: Collapsible tool visualization component
- **LocalMCPManager**: Process management for local MCP servers
- **LLMService**: Multi-provider LLM integration with tool calling
- **Database**: SQLite storage for configurations and server state

## API Endpoints

### Core Endpoints
- `GET /` - API status
- `POST /api/chat` - Send message with tool execution support
- `GET /api/llm/configs` - List LLM configurations
- `POST /api/llm/configs` - Create LLM configuration
- `POST /api/llm/configs/{id}/activate` - Activate LLM configuration

### MCP Management
- `GET /api/mcp/servers` - List all MCP servers
- `GET /api/mcp/servers/{id}` - Get server details with tools
- `POST /api/mcp/servers` - Create MCP server
- `POST /api/mcp/servers/{id}/start` - Start local MCP server
- `POST /api/mcp/servers/{id}/stop` - Stop local MCP server
- `POST /api/mcp/call-tool` - Execute MCP tool

## Development

### Running Development Servers

**Recommended - Use the consolidated scripts:**

```bash
# Start both servers
./start-dev.sh

# Stop both servers  
./stop-dev.sh
```

### Development Status & Roadmap

The application is fully functional with recent improvements to error handling and OpenAI API compliance. For detailed development plans and improvement tasks, see the comprehensive roadmap in `CLAUDE.md`.

**Recent Improvements (Completed)**:
- ✅ Fixed critical tool execution errors and OpenAI API compliance issues
- ✅ Added intelligent parameter correction for MCP validation errors  
- ✅ Implemented robust retry mechanisms for failed tool calls
- ✅ Enhanced conversation history management for multi-turn interactions
- ✅ Added comprehensive error response handling for all tool call scenarios

**Planned Improvements** (organized by priority in `CLAUDE.md`):
- 🔄 **Week 1 (Critical)**: Code quality fixes, error boundaries, performance logging
- 🔄 **Week 2 (Architecture)**: Refactor large components, optimize re-renders, add caching
- 🔄 **Week 3 (UX)**: User-friendly error messages, progress indicators, clean displays  
- 🔄 **Week 4 (Polish)**: Unit tests, security audit, TypeScript strict mode

**For Contributors**: See `CLAUDE.md` for detailed technical guidance, architecture documentation, and a comprehensive task list with specific file locations and implementation details.

**Manual approach:**

1. **Backend Development**:
   ```bash
   cd backend
   source venv/bin/activate  # Windows: venv\Scripts\activate
   python main.py
   ```

2. **Frontend Development**:
   ```bash
   cd frontend
   npm run dev
   ```

### Key Development Features

- **Hot Reload**: Both frontend and backend support hot reloading
- **Logging**: Comprehensive logging to `logs/` directory
- **Process Management**: Automatic MCP server lifecycle management
- **Error Handling**: Graceful error handling with user feedback
- **State Management**: Persistent UI state with Zustand

## Screenshots

<img width="3424" height="1940" alt="SMC-example-chat-1" src="https://github.com/user-attachments/assets/d836cb52-0827-4766-ba26-11790705c9ff" />
- Chat Conversation with tool call
<br> <br>
<img width="3352" height="1982" alt="SMC-settings-1" src="https://github.com/user-attachments/assets/b0dafe1e-2ebd-44fb-96c7-dca091959a32" />
- Settings page for LLMs and MCP servers

## Contributing

This is a demonstration project. Feel free to fork and extend it for your own needs.

## License

Apache License 2.0
