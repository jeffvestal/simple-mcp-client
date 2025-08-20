import re
import json
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass

@dataclass
class ParameterCorrection:
    """Represents a parameter correction that was applied"""
    original_params: Dict[str, Any]
    corrected_params: Dict[str, Any]
    transformation_applied: str
    confidence: float

class MCPParameterCorrector:
    """
    Service that analyzes MCP validation errors and attempts to correct parameters
    to match the expected format. Works with any MCP server by parsing error messages.
    """
    
    def __init__(self):
        # Common parameter transformation patterns
        self.transformation_patterns = [
            # String to array transformations
            {
                "name": "string_to_array",
                "pattern": r'Expected.*array.*received.*string|Required.*\["([^"]+)"\].*array',
                "transform": self._string_to_array_transform
            },
            # Singular to plural transformations  
            {
                "name": "singular_to_plural",
                "pattern": r'Expected.*"([^"]*s)".*received.*"([^"]*)"(?!s)',
                "transform": self._singular_to_plural_transform
            },
            # Snake case to camel case
            {
                "name": "snake_to_camel",
                "pattern": r'Expected.*"([^"]*_[^"]*)".*received.*"([^"]*)"',
                "transform": self._snake_to_camel_transform
            }
        ]
    
    def analyze_error_and_correct(self, error_message: str, original_params: Dict[str, Any]) -> Optional[ParameterCorrection]:
        """
        Analyze an MCP validation error and attempt to correct the parameters.
        
        Args:
            error_message: The error message from the MCP server
            original_params: The original parameters that caused the error
            
        Returns:
            ParameterCorrection if a correction was found, None otherwise
        """
        print(f"[DEBUG] Analyzing MCP error for parameter correction: {error_message}")
        print(f"[DEBUG] Original parameters: {original_params}")
        
        # Try each transformation pattern
        for pattern_info in self.transformation_patterns:
            try:
                correction = pattern_info["transform"](error_message, original_params)
                if correction:
                    print(f"[DEBUG] Applied transformation '{pattern_info['name']}': {correction.transformation_applied}")
                    return correction
            except Exception as e:
                print(f"[DEBUG] Transformation '{pattern_info['name']}' failed: {e}")
                continue
        
        # Try specific known error patterns
        correction = self._handle_specific_patterns(error_message, original_params)
        if correction:
            return correction
            
        print(f"[DEBUG] No parameter correction found for error: {error_message}")
        return None
    
    def _string_to_array_transform(self, error_message: str, params: Dict[str, Any]) -> Optional[ParameterCorrection]:
        """Transform string parameters to arrays when MCP expects arrays"""
        
        # Look for "expected array, received string" or similar patterns
        if "array" in error_message.lower() and ("string" in error_message.lower() or "undefined" in error_message.lower()):
            # Extract the parameter name from path in error message
            path_match = re.search(r'"path":\s*\[\s*"([^"]+)"\s*\]', error_message)
            if path_match:
                expected_param = path_match.group(1)
                
                # Look for similar parameter in original params
                for param_name, param_value in params.items():
                    if param_name.lower() in expected_param.lower() or expected_param.lower() in param_name.lower():
                        # Convert string to array
                        corrected_params = params.copy()
                        corrected_params[expected_param] = [param_value] if param_value is not None else []
                        # Remove the old parameter
                        if param_name != expected_param:
                            corrected_params.pop(param_name, None)
                        
                        return ParameterCorrection(
                            original_params=params,
                            corrected_params=corrected_params,
                            transformation_applied=f"Converted '{param_name}' to '{expected_param}' array",
                            confidence=0.8
                        )
        
        return None
    
    def _singular_to_plural_transform(self, error_message: str, params: Dict[str, Any]) -> Optional[ParameterCorrection]:
        """Transform singular parameter names to plural when needed"""
        
        # Extract expected and received parameter names
        matches = re.findall(r'"([^"]+)"', error_message)
        if len(matches) >= 2:
            expected = matches[0]
            for param_name in params.keys():
                if param_name.rstrip('s') == expected.rstrip('s') and param_name != expected:
                    # Found a singular/plural mismatch
                    corrected_params = params.copy()
                    corrected_params[expected] = params[param_name]
                    corrected_params.pop(param_name)
                    
                    return ParameterCorrection(
                        original_params=params,
                        corrected_params=corrected_params,
                        transformation_applied=f"Renamed '{param_name}' to '{expected}'",
                        confidence=0.7
                    )
        
        return None
    
    def _snake_to_camel_transform(self, error_message: str, params: Dict[str, Any]) -> Optional[ParameterCorrection]:
        """Transform snake_case to camelCase or vice versa"""
        
        # Look for parameter name mismatches involving underscores
        param_pattern = r'"([^"]*_[^"]*)"'
        matches = re.findall(param_pattern, error_message)
        
        for expected_param in matches:
            for param_name in params.keys():
                # Check if this could be a case conversion issue
                if (param_name.replace('_', '').lower() == expected_param.replace('_', '').lower() and 
                    param_name != expected_param):
                    
                    corrected_params = params.copy()
                    corrected_params[expected_param] = params[param_name]
                    corrected_params.pop(param_name)
                    
                    return ParameterCorrection(
                        original_params=params,
                        corrected_params=corrected_params,
                        transformation_applied=f"Converted '{param_name}' to '{expected_param}'",
                        confidence=0.6
                    )
        
        return None
    
    def _handle_specific_patterns(self, error_message: str, params: Dict[str, Any]) -> Optional[ParameterCorrection]:
        """Handle specific known error patterns"""
        
        # Handle the specific error: index → indices array
        if "indices" in error_message and "index" in params:
            corrected_params = params.copy()
            corrected_params["indices"] = [params["index"]]
            corrected_params.pop("index")
            
            return ParameterCorrection(
                original_params=params,
                corrected_params=corrected_params,
                transformation_applied="Converted 'index' string to 'indices' array",
                confidence=0.9
            )
        
        # Handle the specific error: index_name → indices array
        if "indices" in error_message and "index_name" in params:
            corrected_params = params.copy()
            corrected_params["indices"] = [params["index_name"]]
            corrected_params.pop("index_name")
            
            return ParameterCorrection(
                original_params=params,
                corrected_params=corrected_params,
                transformation_applied="Converted 'index_name' string to 'indices' array",
                confidence=0.9
            )
        
        # Handle missing query parameter for execute_esql
        if "query" in error_message and "Required" in error_message:
            # Common parameter names that might map to 'query'
            query_aliases = ["esql", "sql", "search", "statement", "command", "expression"]
            for alias in query_aliases:
                if alias in params:
                    corrected_params = params.copy()
                    corrected_params["query"] = params[alias]
                    corrected_params.pop(alias)
                    
                    return ParameterCorrection(
                        original_params=params,
                        corrected_params=corrected_params,
                        transformation_applied=f"Renamed '{alias}' to required 'query' parameter",
                        confidence=0.8
                    )
        
        # Handle array requirements in general
        if "Required" in error_message and "array" in error_message:
            # Try to extract the required field name
            path_match = re.search(r'"path":\s*\[\s*"([^"]+)"\s*\]', error_message)
            if path_match:
                required_field = path_match.group(1)
                
                # Look for a similar parameter that could be converted
                for param_name, param_value in params.items():
                    if (param_name.lower().replace('_', '') in required_field.lower().replace('_', '') or
                        required_field.lower().replace('_', '') in param_name.lower().replace('_', '')):
                        
                        corrected_params = params.copy()
                        if isinstance(param_value, list):
                            corrected_params[required_field] = param_value
                        else:
                            corrected_params[required_field] = [param_value] if param_value is not None else []
                        
                        if param_name != required_field:
                            corrected_params.pop(param_name, None)
                        
                        return ParameterCorrection(
                            original_params=params,
                            corrected_params=corrected_params,
                            transformation_applied=f"Converted '{param_name}' to required '{required_field}' array",
                            confidence=0.7
                        )
        
        # Handle general missing required parameters by looking for fuzzy matches
        if "Required" in error_message and "undefined" in error_message:
            path_match = re.search(r'"path":\s*\[\s*"([^"]+)"\s*\]', error_message)
            if path_match:
                required_field = path_match.group(1)
                
                # Look for parameters with similar names
                for param_name, param_value in params.items():
                    # Check for partial matches, case-insensitive
                    param_clean = param_name.lower().replace('_', '').replace('-', '')
                    required_clean = required_field.lower().replace('_', '').replace('-', '')
                    
                    # Check if one is contained in the other or they share significant overlap
                    if (param_clean in required_clean or required_clean in param_clean or
                        len(set(param_clean) & set(required_clean)) >= min(3, len(required_clean) // 2)):
                        
                        corrected_params = params.copy()
                        corrected_params[required_field] = param_value
                        if param_name != required_field:
                            corrected_params.pop(param_name, None)
                        
                        return ParameterCorrection(
                            original_params=params,
                            corrected_params=corrected_params,
                            transformation_applied=f"Renamed '{param_name}' to required '{required_field}'",
                            confidence=0.6
                        )
        
        return None

# Singleton instance
mcp_parameter_corrector = MCPParameterCorrector()