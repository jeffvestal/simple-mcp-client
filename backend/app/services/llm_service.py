import openai
import google.generativeai as genai
import boto3
from typing import List, Dict, Any, Optional
from ..models.schemas import ChatMessage, LLMProvider
import json

class LLMService:
    def __init__(self, provider: LLMProvider, api_key: str, model: str, base_url: Optional[str] = None, max_tokens: int = 16000):
        self.provider = provider
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self.max_tokens = max_tokens
        
        if provider == LLMProvider.OPENAI:
            # Remove trailing /chat/completions from base_url if present
            clean_base_url = base_url
            if base_url and base_url.endswith('/chat/completions'):
                clean_base_url = base_url.rsplit('/chat/completions', 1)[0]
            
            self.client = openai.OpenAI(
                api_key=api_key,
                base_url=clean_base_url if clean_base_url else None
            )
        elif provider == LLMProvider.GEMINI:
            genai.configure(api_key=api_key)
            self.client = genai.GenerativeModel(model or 'gemini-pro')
        elif provider == LLMProvider.BEDROCK:
            self.client = boto3.client(
                'bedrock-runtime',
                aws_access_key_id=api_key.split(':')[0] if ':' in api_key else api_key,
                aws_secret_access_key=api_key.split(':')[1] if ':' in api_key else '',
                region_name=base_url or 'us-east-1'
            )
    
    async def generate_response(self, messages: List[ChatMessage], tools: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """Generate a response from the LLM"""
        try:
            if self.provider == LLMProvider.OPENAI:
                return await self._generate_openai_response(messages, tools)
            elif self.provider == LLMProvider.GEMINI:
                return await self._generate_gemini_response(messages, tools)
            elif self.provider == LLMProvider.BEDROCK:
                return await self._generate_bedrock_response(messages, tools)
        except Exception as e:
            raise Exception(f"LLM generation failed: {str(e)}")
    
    async def _generate_openai_response(self, messages: List[ChatMessage], tools: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """Generate response using OpenAI-compatible API"""
        openai_messages = []
        for msg in messages:
            # Handle both Pydantic models and dicts
            if hasattr(msg, 'role'):
                role = msg.role
                content = msg.content
                tool_calls = getattr(msg, 'tool_calls', None)
                tool_call_id = getattr(msg, 'tool_call_id', None)
            elif isinstance(msg, dict):
                role = msg.get("role")
                content = msg.get("content")
                tool_calls = msg.get("tool_calls")
                tool_call_id = msg.get("tool_call_id")
            else:
                print(f"Unexpected message type: {type(msg)}, content: {msg}")
                openai_messages.append({"role": "user", "content": str(msg)})
                continue
                
            # Handle different message roles
            if role == "tool":
                # Tool response message
                openai_messages.append({
                    "role": "tool",
                    "content": content,
                    "tool_call_id": tool_call_id
                })
            elif role == "assistant" and tool_calls:
                # Assistant message with tool calls
                message = {"role": "assistant", "content": content}
                if tool_calls:
                    # Convert tool calls to OpenAI format
                    message["tool_calls"] = [
                        {
                            "id": tc.get("id"),
                            "type": "function",
                            "function": {
                                "name": tc.get("name"),
                                "arguments": json.dumps(tc.get("arguments", {}))
                            }
                        }
                        for tc in tool_calls
                    ]
                openai_messages.append(message)
            else:
                # Regular user/assistant message
                openai_messages.append({"role": role, "content": content})
        
        kwargs = {
            "model": self.model,  # Use configured model
            "messages": openai_messages,
            "max_tokens": self.max_tokens,
            "temperature": 0.7
        }
        
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"
        
        response = self.client.chat.completions.create(**kwargs)
        
        result = {
            "content": response.choices[0].message.content,
            "tool_calls": []
        }
        
        if response.choices[0].message.tool_calls:
            result["tool_calls"] = [
                {
                    "id": call.id,
                    "name": call.function.name,
                    "arguments": json.loads(call.function.arguments)
                }
                for call in response.choices[0].message.tool_calls
            ]
        
        return result
    
    async def _generate_gemini_response(self, messages: List[ChatMessage], tools: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """Generate response using Gemini with function calling support"""
        print(f"[DEBUG GEMINI] Received {len(tools) if tools else 0} tools")
        if tools:
            print(f"[DEBUG GEMINI] Tool names: {[t.get('function', {}).get('name') for t in tools]}")
        
        # Convert messages to Gemini format
        gemini_messages = []
        for msg in messages:
            role = msg.role if hasattr(msg, 'role') else msg.get("role")
            content = msg.content if hasattr(msg, 'content') else msg.get("content")
            # Handle tool_calls for both Pydantic models and dicts
            if hasattr(msg, 'tool_calls'):
                tool_calls = msg.tool_calls
            elif isinstance(msg, dict):
                tool_calls = msg.get("tool_calls")
            else:
                tool_calls = None
            
            # Map roles to Gemini format
            if role == "assistant":
                # Skip assistant messages with only tool calls and no content
                # Gemini handles tool calls differently
                if content:
                    gemini_messages.append({"role": "model", "parts": [{"text": content}]})
            elif role == "user":
                if content:  # Only add if content is not empty
                    gemini_messages.append({"role": "user", "parts": [{"text": content}]})
            elif role == "tool":
                # For tool responses, add as user message with context
                tool_call_id = getattr(msg, 'tool_call_id', None) if hasattr(msg, 'tool_call_id') else msg.get("tool_call_id") if isinstance(msg, dict) else None
                if content:  # Only add if content is not empty
                    gemini_messages.append({
                        "role": "user", 
                        "parts": [{"text": f"Tool result (id: {tool_call_id}):\n{content}"}]
                    })
        
        print(f"[DEBUG GEMINI] Converted {len(gemini_messages)} messages to Gemini format")
        
        # Convert tools to Gemini function declarations if provided
        gemini_tools = None
        if tools:
            function_declarations = []
            for tool in tools:
                if tool.get("type") == "function":
                    func = tool.get("function", {})
                    # Convert OpenAI-style schema to Gemini format
                    function_declarations.append(
                        genai.protos.FunctionDeclaration(
                            name=func.get("name"),
                            description=func.get("description", ""),
                            parameters=genai.protos.Schema(
                                type=genai.protos.Type.OBJECT,
                                properties={
                                    k: genai.protos.Schema(
                                        type=self._map_type_to_gemini(v.get("type", "string")),
                                        description=v.get("description", "")
                                    )
                                    for k, v in func.get("parameters", {}).get("properties", {}).items()
                                },
                                required=func.get("parameters", {}).get("required", [])
                            )
                        )
                    )
            
            if function_declarations:
                gemini_tools = genai.protos.Tool(function_declarations=function_declarations)
                print(f"[DEBUG GEMINI] Created {len(function_declarations)} function declarations")
        
        # Generate response with or without tools
        generation_config = genai.types.GenerationConfig(
            temperature=0.7,
            max_output_tokens=self.max_tokens
        )
        
        print(f"[DEBUG GEMINI] Sending to Gemini with tools: {gemini_tools is not None}")
        
        # Make sure we have messages to send
        if not gemini_messages:
            print("[DEBUG GEMINI] No valid messages to send, returning empty response")
            return {"content": "I don't have enough context to respond.", "tool_calls": []}
        
        # Get the last message content
        last_message_text = gemini_messages[-1]["parts"][0]["text"]
        
        if gemini_tools:
            chat = self.client.start_chat(history=gemini_messages[:-1] if len(gemini_messages) > 1 else [])
            response = chat.send_message(
                last_message_text,
                tools=[gemini_tools],
                generation_config=generation_config
            )
        else:
            chat = self.client.start_chat(history=gemini_messages[:-1] if len(gemini_messages) > 1 else [])
            response = chat.send_message(
                last_message_text,
                generation_config=generation_config
            )
        
        # Extract response content and function calls
        result = {
            "content": "",
            "tool_calls": []
        }
        
        # Handle text content and function calls
        if response.candidates and len(response.candidates) > 0:
            candidate = response.candidates[0]
            if candidate.content and candidate.content.parts:
                for part in candidate.content.parts:
                    # Check for function calls first
                    if hasattr(part, 'function_call') and part.function_call and part.function_call.name:
                        fc = part.function_call
                        # Convert Gemini function call to OpenAI format
                        result["tool_calls"].append({
                            "id": f"call_{len(result['tool_calls'])}",
                            "name": fc.name,
                            "arguments": dict(fc.args) if fc.args else {}
                        })
                    # Check for text content
                    elif hasattr(part, 'text') and part.text:
                        result["content"] += part.text
        
        return result
    
    def _map_type_to_gemini(self, openai_type: str) -> genai.protos.Type:
        """Map OpenAI JSON schema types to Gemini types"""
        type_map = {
            "string": genai.protos.Type.STRING,
            "number": genai.protos.Type.NUMBER,
            "integer": genai.protos.Type.INTEGER,
            "boolean": genai.protos.Type.BOOLEAN,
            "array": genai.protos.Type.ARRAY,
            "object": genai.protos.Type.OBJECT
        }
        return type_map.get(openai_type.lower(), genai.protos.Type.STRING)
    
    async def _generate_bedrock_response(self, messages: List[ChatMessage], tools: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """Generate response using AWS Bedrock"""
        # Convert messages to Claude format for Bedrock
        prompt = "\n".join([f"{msg.role}: {msg.content}" for msg in messages])
        
        body = json.dumps({
            "prompt": f"\n\nHuman: {prompt}\n\nAssistant:",
            "max_tokens_to_sample": self.max_tokens,
            "temperature": 0.7,
            "stop_sequences": ["\n\nHuman:"]
        })
        
        response = self.client.invoke_model(
            body=body,
            modelId="anthropic.claude-v2",
            accept="application/json",
            contentType="application/json"
        )
        
        response_body = json.loads(response.get('body').read())
        
        return {
            "content": response_body.get('completion', ''),
            "tool_calls": []  # Basic implementation
        }