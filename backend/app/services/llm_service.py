import openai
import google.generativeai as genai
import boto3
from typing import List, Dict, Any, Optional
from ..models.schemas import ChatMessage, LLMProvider
import json

class LLMService:
    def __init__(self, provider: LLMProvider, api_key: str, model: str, base_url: Optional[str] = None):
        self.provider = provider
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        
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
            "max_tokens": 1000,
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
        """Generate response using Gemini"""
        # Convert messages to Gemini format
        prompt = "\n".join([f"{msg.role}: {msg.content}" for msg in messages])
        
        response = self.client.generate_content(prompt)
        
        return {
            "content": response.text,
            "tool_calls": []  # Basic implementation, can be enhanced for tool calling
        }
    
    async def _generate_bedrock_response(self, messages: List[ChatMessage], tools: Optional[List[Dict]] = None) -> Dict[str, Any]:
        """Generate response using AWS Bedrock"""
        # Convert messages to Claude format for Bedrock
        prompt = "\n".join([f"{msg.role}: {msg.content}" for msg in messages])
        
        body = json.dumps({
            "prompt": f"\n\nHuman: {prompt}\n\nAssistant:",
            "max_tokens_to_sample": 1000,
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