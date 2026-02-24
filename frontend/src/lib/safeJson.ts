import { logJsonError } from './errorLogger'
import { devLog, DevLogCategory } from './developmentLogger'

export interface SafeJsonResult<T = any> {
  success: boolean
  data?: T
  error?: string
  originalValue?: string
}

export interface SafeJsonOptions {
  fallbackValue?: any
  logErrors?: boolean
  context?: string
  maxLength?: number
}

/**
 * Safely parse JSON with comprehensive error handling
 * @param jsonString - String to parse as JSON
 * @param options - Configuration options
 * @returns SafeJsonResult with success flag and parsed data or error
 */
export function safeJsonParse<T = any>(
  jsonString: string | null | undefined,
  options: SafeJsonOptions = {}
): SafeJsonResult<T> {
  const {
    fallbackValue = null,
    logErrors = true,
    context = 'unknown',
    maxLength = 10000
  } = options

  // Handle null/undefined input
  if (jsonString === null || jsonString === undefined) {
    return {
      success: false,
      error: 'Input is null or undefined',
      data: fallbackValue
    }
  }

  // Handle non-string input
  if (typeof jsonString !== 'string') {
    return {
      success: false,
      error: `Input is not a string (type: ${typeof jsonString})`,
      data: fallbackValue
    }
  }

  // Handle empty string
  if (jsonString.trim() === '') {
    return {
      success: false,
      error: 'Input is empty string',
      data: fallbackValue
    }
  }

  // Check for overly large JSON strings (potential DoS protection)
  if (jsonString.length > maxLength) {
    const truncated = jsonString.substring(0, 100)
    if (logErrors) {
      logJsonError(
        `JSON string too large (${jsonString.length} chars)`,
        new Error('JSON string exceeds maximum length'),
        truncated
      )
    }
    return {
      success: false,
      error: `JSON string too large (${jsonString.length} characters)`,
      data: fallbackValue,
      originalValue: truncated + '...'
    }
  }

  try {
    const parsed = JSON.parse(jsonString)
    return {
      success: true,
      data: parsed
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error'
    
    if (logErrors) {
      logJsonError(
        `JSON parsing failed in context: ${context}`,
        error instanceof Error ? error : new Error(errorMessage),
        jsonString.length > 500 ? jsonString.substring(0, 500) + '...' : jsonString
      )
    }

    // Try to provide helpful error context
    let detailedError = errorMessage
    if (errorMessage.includes('Unexpected token')) {
      const match = errorMessage.match(/Unexpected token (.) in JSON at position (\d+)/)
      if (match) {
        const position = parseInt(match[2])
        const contextStart = Math.max(0, position - 20)
        const contextEnd = Math.min(jsonString.length, position + 20)
        const context = jsonString.substring(contextStart, contextEnd)
        detailedError = `${errorMessage}. Context: "${context}"`
      }
    }

    return {
      success: false,
      error: detailedError,
      data: fallbackValue,
      originalValue: jsonString.length > 200 ? jsonString.substring(0, 200) + '...' : jsonString
    }
  }
}

/**
 * Safe JSON parse that throws on failure (for use in try-catch blocks)
 * @param jsonString - String to parse
 * @param context - Context for error logging
 * @returns Parsed object
 * @throws Error if parsing fails
 */
export function safeJsonParseStrict<T = any>(
  jsonString: string,
  context = 'unknown'
): T {
  const result = safeJsonParse<T>(jsonString, { context, logErrors: true })
  
  if (!result.success) {
    throw new Error(`JSON parsing failed in ${context}: ${result.error}`)
  }
  
  return result.data!
}

/**
 * Safe JSON parse with default value (never throws)
 * @param jsonString - String to parse
 * @param defaultValue - Value to return on parsing failure
 * @param context - Context for error logging
 * @returns Parsed object or default value
 */
export function safeJsonParseWithDefault<T>(
  jsonString: string | null | undefined,
  defaultValue: T,
  context = 'unknown'
): T {
  const result = safeJsonParse<T>(jsonString, { 
    fallbackValue: defaultValue, 
    context,
    logErrors: true 
  })
  
  return result.success ? result.data! : defaultValue
}

/**
 * Safe JSON stringify with error handling
 * @param value - Value to stringify
 * @param options - Configuration options
 * @returns SafeJsonResult with stringified data or error
 */
export function safeJsonStringify(
  value: any,
  options: SafeJsonOptions = {}
): SafeJsonResult<string> {
  const {
    fallbackValue = '{}',
    logErrors = true,
    context = 'unknown',
    maxLength = 100000
  } = options

  try {
    // Handle circular references and functions
    const stringified = JSON.stringify(value, (_key, val) => {
      // Convert functions to string representation
      if (typeof val === 'function') {
        return `[Function: ${val.name || 'anonymous'}]`
      }
      
      // Handle undefined values
      if (val === undefined) {
        return '[undefined]'
      }
      
      // Handle symbols
      if (typeof val === 'symbol') {
        return val.toString()
      }
      
      return val
    })

    // Check result size
    if (stringified.length > maxLength) {
      if (logErrors) {
        logJsonError(
          `Stringified JSON too large (${stringified.length} chars)`,
          new Error('JSON string exceeds maximum length'),
          stringified.substring(0, 100) + '...'
        )
      }
      return {
        success: false,
        error: `Stringified JSON too large (${stringified.length} characters)`,
        data: fallbackValue
      }
    }

    return {
      success: true,
      data: stringified
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown stringify error'
    
    if (logErrors) {
      logJsonError(
        `JSON stringifying failed in context: ${context}`,
        error instanceof Error ? error : new Error(errorMessage),
        String(value).substring(0, 200)
      )
    }

    return {
      success: false,
      error: errorMessage,
      data: fallbackValue
    }
  }
}

/**
 * Validate that a string appears to be valid JSON without parsing it
 * @param jsonString - String to validate
 * @returns boolean indicating if string looks like valid JSON
 */
export function isValidJsonString(jsonString: string): boolean {
  if (typeof jsonString !== 'string' || jsonString.trim() === '') {
    return false
  }

  const trimmed = jsonString.trim()
  
  // Quick structural checks
  const startsWithBrace = trimmed.startsWith('{') && trimmed.endsWith('}')
  const startsWithBracket = trimmed.startsWith('[') && trimmed.endsWith(']')
  const isQuotedString = trimmed.startsWith('"') && trimmed.endsWith('"')
  const isNumber = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)
  const isBoolean = trimmed === 'true' || trimmed === 'false'
  const isNull = trimmed === 'null'

  if (!startsWithBrace && !startsWithBracket && !isQuotedString && !isNumber && !isBoolean && !isNull) {
    return false
  }

  // Try actual parsing
  try {
    JSON.parse(jsonString)
    return true
  } catch {
    return false
  }
}

/**
 * Extract JSON from mixed content (useful for API responses with extra text)
 * @param content - Content that might contain JSON
 * @param options - Configuration options
 * @returns SafeJsonResult with extracted and parsed JSON
 */
export function extractAndParseJson<T = any>(
  content: string,
  options: SafeJsonOptions = {}
): SafeJsonResult<T> {
  const { context = 'json-extraction', logErrors = true } = options

  if (!content || typeof content !== 'string') {
    return {
      success: false,
      error: 'No content provided for JSON extraction',
      data: options.fallbackValue
    }
  }

  // Look for JSON objects and arrays
  const jsonPatterns = [
    /\{.*\}/s,     // Objects (single line or multiline)
    /\[.*\]/s      // Arrays (single line or multiline)
  ]

  for (const pattern of jsonPatterns) {
    const match = content.match(pattern)
    if (match) {
      const jsonCandidate = match[0]
      const result = safeJsonParse<T>(jsonCandidate, { 
        ...options,
        context: `${context}-extracted`,
        logErrors: false // Don't log errors for extraction attempts
      })
      
      if (result.success) {
        return result
      }
    }
  }

  // If no JSON found, try parsing the entire content
  const directResult = safeJsonParse<T>(content, { ...options, logErrors: false })
  if (directResult.success) {
    return directResult
  }

  if (logErrors) {
    logJsonError(
      `Could not extract valid JSON from content in context: ${context}`,
      new Error('JSON extraction failed'),
      content.length > 200 ? content.substring(0, 200) + '...' : content
    )
  }

  return {
    success: false,
    error: 'Could not extract valid JSON from content',
    data: options.fallbackValue,
    originalValue: content.length > 200 ? content.substring(0, 200) + '...' : content
  }
}

// Utility functions for common use cases

/**
 * Safe localStorage getItem with JSON parsing
 */
export function safeLocalStorageGet<T = any>(key: string, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key)
    if (item === null) return defaultValue
    
    return safeJsonParseWithDefault(item, defaultValue, `localStorage-${key}`)
  } catch (error) {
    logJsonError(
      `Failed to read from localStorage: ${key}`,
      error instanceof Error ? error : new Error('localStorage access failed'),
      key
    )
    return defaultValue
  }
}

/**
 * Safe localStorage setItem with JSON stringification
 */
export function safeLocalStorageSet(key: string, value: any): boolean {
  try {
    const result = safeJsonStringify(value, { context: `localStorage-${key}` })
    if (result.success) {
      localStorage.setItem(key, result.data!)
      return true
    } else {
      devLog.error(DevLogCategory.JSON_PARSING, 'Failed to stringify value for localStorage', result.error)
      return false
    }
  } catch (error) {
    logJsonError(
      `Failed to write to localStorage: ${key}`,
      error instanceof Error ? error : new Error('localStorage access failed'),
      String(value).substring(0, 100)
    )
    return false
  }
}