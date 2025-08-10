from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router
from app.core.database import Database
from app.services.local_mcp_manager import local_mcp_manager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    db = Database()
    print("Database initialized successfully")
    
    # Verify and cleanup any orphaned MCP server processes
    print("Verifying MCP server processes...")
    await local_mcp_manager.startup_cleanup(db)
    print("MCP server process verification complete")
    
    yield
    # Shutdown
    print("Shutting down application, stopping all MCP servers...")
    local_mcp_manager.shutdown_all()
    print("All MCP servers stopped")

app = FastAPI(
    title="Simple MCP Client API",
    description="Backend API for the Simple MCP Client application",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development/workshop environments
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api")

@app.get("/")
async def root():
    return {"message": "Simple MCP Client API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)