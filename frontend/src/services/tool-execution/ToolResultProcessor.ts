/**
 * Tool Result Processing Service
 * 
 * Handles extraction, cleaning, and formatting of tool execution results
 * Extracted from the original extractAndCleanToolContent function in ChatInterfaceSimple.tsx
 */

import type { IToolResultProcessor } from './interfaces/IToolResultProcessor'
import type { 
  ToolExecutionResult, 
  ProcessedToolResult,
  ServiceConfiguration
} from './types/ToolExecutionTypes'
import type { ExternalDependencies } from './types/ServiceDependencies'

export class ToolResultProcessor implements IToolResultProcessor {
  constructor(
    private externalDependencies: ExternalDependencies,
    private configuration: ServiceConfiguration
  ) {}

  /**
   * Extract and clean content from MCP tool responses
   * Mirrors the existing extractAndCleanToolContent function
   */
  extractAndCleanToolContent(
    toolResult: ToolExecutionResult,
    toolName: string
  ): string {
    console.log('DEBUG: extractAndCleanToolContent called for', toolName, 'with toolResult:', toolResult)
    let mcpResult = null
    
    // Determine the correct structure to extract from
    if (toolResult.result && (toolResult.result as any).result) {
      // Nested structure: API response -> MCP response -> MCP result
      mcpResult = (toolResult.result as any).result
    } else if (toolResult.result) {
      // Direct MCP response format
      mcpResult = toolResult.result
    } else {
      // Alternative format
      mcpResult = toolResult as any
    }
    
    // Check if this is an error response - MCP errors are at the result level
    if ((toolResult.result as any)?.error && (toolResult.result as any)?.jsonrpc) {
      // Direct MCP error response
      const error = (toolResult.result as any).error
      return `Tool ${toolName} encountered an error: ${error.message || JSON.stringify(error)}`
    } else if (mcpResult.error || (mcpResult.jsonrpc && mcpResult.error)) {
      // Fallback for other error structures
      const error = mcpResult.error || mcpResult
      return `Tool ${toolName} encountered an error: ${error.message || JSON.stringify(error)}`
    }
    
    // Extract raw text from MCP content if it exists
    let rawTextContent = null
    if (mcpResult.content && Array.isArray(mcpResult.content)) {
      // Extract text from content array and try to parse as JSON
      const textContent = mcpResult.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('\n')
      
      // Try to parse the text content as JSON (common with Elasticsearch MCP responses)
      const parsedContent = this.externalDependencies.safeJson.safeJsonParseWithDefault(
        textContent,
        null
      )

      console.log('DEBUG: ToolResultProcessor - parsedContent:', parsedContent)

      if (parsedContent && typeof parsedContent === 'object') {
        // Handle different response formats
        if (parsedContent.results && Array.isArray(parsedContent.results)) {
          // Check if results have data field
          if (parsedContent.results[0]?.data) {
            rawTextContent = parsedContent.results[0].data
          } else {
            // Use the entire results array if no data field
            rawTextContent = parsedContent.results
          }
        } else {
          // Use the parsed content directly
          rawTextContent = parsedContent
        }
      } else {
        // Fall back to raw text if JSON parsing failed
        rawTextContent = textContent
      }

      console.log('DEBUG: ToolResultProcessor - rawTextContent:', rawTextContent)
    }
    
    // Use rawTextContent if available, otherwise use mcpResult for tool-specific formatting
    const dataToProcess = rawTextContent || mcpResult
    
    // Apply tool-specific formatting
    return this.applyToolSpecificFormatting(toolName, dataToProcess, mcpResult, rawTextContent)
  }

  /**
   * Process tool result with metadata
   */
  processToolResult(
    toolResult: ToolExecutionResult,
    toolName: string,
    executionTime?: number,
    retryCount?: number
  ): ProcessedToolResult {
    try {
      const content = this.extractAndCleanToolContent(toolResult, toolName)

      // If content extraction succeeded, return it
      if (content && content.trim().length > 0) {
        return {
          content,
          isValid: toolResult.success,
          metadata: {
            toolName,
            executionTime,
            retryCount
          }
        }
      }

      // If content is empty but tool was successful, try to extract raw result
      if (toolResult.success && toolResult.result) {
        const fallbackContent = this.extractFallbackContent(toolResult.result, toolName)

        return {
          content: fallbackContent,
          isValid: fallbackContent.length > 0,
          metadata: {
            toolName,
            executionTime,
            retryCount
          }
        }
      }

      // If everything else fails, return error content
      return {
        content: `Tool ${toolName} completed but returned empty content`,
        isValid: false,
        metadata: {
          toolName,
          executionTime,
          retryCount
        }
      }

    } catch (error) {
      console.error('ERROR: ToolResultProcessor.processToolResult failed:', error)

      this.externalDependencies.errorLogger.logError(
        `Failed to process tool result for ${toolName}`,
        error as Error
      )

      // Try to extract something useful even from the error
      let fallbackContent = `Error processing tool result: ${(error as Error).message}`

      if (toolResult.success && toolResult.result) {
        try {
          fallbackContent += `\n\nRaw tool result: ${JSON.stringify(toolResult.result, null, 2)}`
        } catch {
          fallbackContent += '\n\n(Raw tool result could not be displayed)'
        }
      }

      return {
        content: fallbackContent,
        isValid: false,
        metadata: {
          toolName,
          executionTime,
          retryCount
        }
      }
    }
  }

  /**
   * Format tool result for conversation history
   * Handles the formatting logic for different tool types
   */
  formatToolResultForConversation(
    toolResult: ToolExecutionResult,
    toolName: string,
    toolCallId: string
  ): {
    role: 'tool'
    content: string
    tool_call_id: string
  } {
    const content = this.extractAndCleanToolContent(toolResult, toolName)
    
    return {
      role: 'tool',
      content,
      tool_call_id: toolCallId
    }
  }

  /**
   * Validate tool result structure
   * Ensures tool results conform to expected format
   */
  validateToolResult(toolResult: any): {
    isValid: boolean
    errors: string[]
    cleanedResult?: ToolExecutionResult
  } {
    const errors: string[] = []
    
    if (!toolResult) {
      errors.push('Tool result is null or undefined')
      return { isValid: false, errors }
    }
    
    if (typeof toolResult !== 'object') {
      errors.push('Tool result must be an object')
      return { isValid: false, errors }
    }
    
    // Check if it has success field
    if (typeof toolResult.success !== 'boolean') {
      errors.push('Tool result must have a boolean success field')
    }
    
    // If success is false, should have error field
    if (toolResult.success === false && !toolResult.error) {
      errors.push('Failed tool result must have an error field')
    }
    
    // If success is true, should have result field
    if (toolResult.success === true && !toolResult.result) {
      errors.push('Successful tool result must have a result field')
    }
    
    const isValid = errors.length === 0
    
    // Return cleaned result if valid
    const cleanedResult: ToolExecutionResult | undefined = isValid ? {
      success: toolResult.success,
      result: toolResult.result,
      error: toolResult.error
    } : undefined
    
    return {
      isValid,
      errors,
      cleanedResult
    }
  }

  /**
   * Get tool-specific formatter
   * Returns specialized formatting for known tool types
   */
  getToolSpecificFormatter(toolName: string): ((result: any) => string) | null {
    if (toolName === 'list_indices') {
      return this.formatListIndicesResult.bind(this)
    } else if (toolName.includes('search')) {
      return this.formatSearchResult.bind(this)
    } else if (toolName.includes('mapping')) {
      return this.formatMappingResult.bind(this)
    }
    
    return null
  }

  // Private helper methods

  /**
   * Extract fallback content when primary extraction fails
   */
  private extractFallbackContent(result: any, toolName: string): string {
    try {
      // If result is already a string, return it
      if (typeof result === 'string') {
        return result
      }

      // Try to extract from common MCP structures
      if (result && typeof result === 'object') {
        // Check for content array structure
        if (result.content && Array.isArray(result.content)) {
          const textContent = result.content
            .filter((item: any) => item && item.type === 'text')
            .map((item: any) => item.text || '')
            .join('\n')

          if (textContent.trim().length > 0) {
            return textContent
          }
        }

        // Try to extract JSON-stringified content
        if (result.content && typeof result.content === 'string') {
          return result.content
        }

        // Return formatted JSON as last resort
        return `Tool ${toolName} returned:\n${JSON.stringify(result, null, 2)}`
      }

      return `Tool ${toolName} completed successfully`

    } catch (error) {
      console.warn('extractFallbackContent failed:', error)
      return `Tool ${toolName} completed but content could not be extracted`
    }
  }

  /**
   * Apply tool-specific formatting logic
   */
  private applyToolSpecificFormatting(
    toolName: string,
    dataToProcess: any,
    mcpResult: any,
    rawTextContent: any
  ): string {
    // Tool-specific content extraction and formatting
    if (toolName === 'list_indices' && dataToProcess.indices && Array.isArray(dataToProcess.indices)) {
      return this.formatListIndicesResult(dataToProcess)
    } else if (toolName.includes('search') && dataToProcess.hits) {
      return this.formatSearchResult(dataToProcess)
    } else if (toolName.includes('mapping') && typeof dataToProcess === 'object' && !Array.isArray(dataToProcess)) {
      return this.formatMappingResult(dataToProcess)
    }
    
    // Generic content extraction for other tools
    return this.extractGenericContent(mcpResult, rawTextContent, dataToProcess)
  }

  /**
   * Format list_indices tool results
   */
  private formatListIndicesResult(dataToProcess: any): string {
    const indices = dataToProcess.indices
    return `Found ${indices.length} Elasticsearch indices:\n\n${indices.map((index: any) => 
      `• **${index.index}** (${index.status})\n  - Documents: ${index.docsCount || index['docs.count'] || 'N/A'}\n  - Size: ${index['store.size'] || 'N/A'}\n  - Health: ${index.health || 'N/A'}`
    ).join('\n\n')}`
  }

  /**
   * Format search tool results
   */
  private formatSearchResult(dataToProcess: any): string {
    const hits = dataToProcess.hits
    if (hits.total && hits.total.value > 0) {
      return `Found ${hits.total.value} results:\n\n${hits.hits.slice(0, 5).map((hit: any, idx: number) => 
        `${idx + 1}. ${JSON.stringify(hit._source, null, 2)}`
      ).join('\n\n')}${hits.hits.length > 5 ? '\n\n...(showing first 5 results)' : ''}`
    } else {
      return 'No results found for the search query.'
    }
  }

  /**
   * Format mapping tool results
   */
  private formatMappingResult(dataToProcess: any): string {
    const mappings = dataToProcess
    const indexNames = Object.keys(mappings)
    if (indexNames.length > 0) {
      return `Index mappings:\n\n${indexNames.map(indexName => {
        const mapping = mappings[indexName]
        if (mapping.mappings && mapping.mappings.properties) {
          const fields = Object.keys(mapping.mappings.properties)
          return `**${indexName}**:\n  Fields: ${fields.slice(0, 10).join(', ')}${fields.length > 10 ? '...' : ''}`
        }
        return `**${indexName}**: ${JSON.stringify(mapping).substring(0, 100)}...`
      }).join('\n\n')}`
    }
    return 'No mapping information available.'
  }

  /**
   * Extract generic content when no tool-specific formatter applies
   */
  private extractGenericContent(mcpResult: any, rawTextContent: any, dataToProcess: any): string {
    if (mcpResult.structuredContent && mcpResult.structuredContent.result) {
      return mcpResult.structuredContent.result
    } else if (rawTextContent && typeof rawTextContent === 'string') {
      return rawTextContent
    } else if (mcpResult.content && Array.isArray(mcpResult.content)) {
      // Extract text from content array
      return mcpResult.content
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('\n')
    } else if (mcpResult.content && typeof mcpResult.content === 'string') {
      return mcpResult.content
    } else if (dataToProcess && typeof dataToProcess === 'object') {
      return this.formatObjectData(dataToProcess)
    } else if (typeof dataToProcess === 'string') {
      return dataToProcess
    } else {
      return JSON.stringify(dataToProcess || mcpResult, null, 2)
    }
  }

  /**
   * Format object data nicely
   */
  private formatObjectData(dataToProcess: any): string {
    if (typeof dataToProcess === 'string') {
      return dataToProcess
    } else if (Array.isArray(dataToProcess)) {
      return `Found ${dataToProcess.length} items:\n${dataToProcess.slice(0, 3).map((item: any, idx: number) => 
        `${idx + 1}. ${typeof item === 'string' ? item : JSON.stringify(item, null, 2)}`
      ).join('\n')}${dataToProcess.length > 3 ? '\n...(showing first 3 items)' : ''}`
    } else {
      // Object data - format key fields nicely
      const obj = dataToProcess
      const keys = Object.keys(obj)
      if (keys.length <= 5) {
        return Object.entries(obj).map(([key, value]) => 
          `**${key}**: ${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}`
        ).join('\n')
      } else {
        return `Data object with ${keys.length} properties:\n${keys.slice(0, 5).map(key => 
          `**${key}**: ${typeof obj[key] === 'string' ? obj[key] : JSON.stringify(obj[key], null, 2)}`
        ).join('\n')}\n...and ${keys.length - 5} more properties`
      }
    }
  }

  /**
   * Configuration management (optional)
   */
  configure(newConfiguration: ServiceConfiguration): void {
    this.configuration = { ...this.configuration, ...newConfiguration }
  }

  /**
   * Reset service to initial state (optional)
   */
  reset(): void {
    // No persistent state to reset in this service
  }

  /**
   * Dispose of service resources (optional)
   */
  dispose(): void {
    // No resources to dispose in this service
  }
}