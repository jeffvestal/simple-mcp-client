/**
 * DevelopmentLogger Test Suite
 * 
 * Comprehensive test coverage for environment-based conditional logging
 */

import { 
  developmentLogger, 
  devLog, 
  DevLogCategory, 
  DevLogLevel,
  useDevLogger 
} from '../developmentLogger'
import { errorLogger } from '../errorLogger'

// Mock import.meta.env for testing
const originalEnv = import.meta.env

const mockEnv = (isDev: boolean) => {
  (import.meta.env as any) = {
    ...originalEnv,
    DEV: isDev
  }
}

describe('DevelopmentLogger', () => {
  let consoleSpy: {
    log: jest.SpyInstance
    debug: jest.SpyInstance
    warn: jest.SpyInstance
    error: jest.SpyInstance
  }
  let errorLoggerSpy: jest.SpyInstance

  beforeEach(() => {
    // Spy on console methods
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation()
    }

    // Spy on error logger
    errorLoggerSpy = jest.spyOn(errorLogger, 'error').mockImplementation()

    // Clear any existing logs
    developmentLogger.clearLogs()
  })

  afterEach(() => {
    // Restore console methods
    Object.values(consoleSpy).forEach(spy => spy.mockRestore())
    errorLoggerSpy.mockRestore()
    
    // Restore original environment
    import.meta.env = originalEnv
  })

  describe('Environment Detection', () => {
    test('detects development environment correctly', () => {
      mockEnv(true)
      const logger = new (developmentLogger.constructor as any)()
      expect(logger.isEnabled()).toBe(true)
    })

    test('detects production environment correctly', () => {
      mockEnv(false)
      const logger = new (developmentLogger.constructor as any)()
      expect(logger.isEnabled()).toBe(false)
    })
  })

  describe('Development Mode Logging', () => {
    beforeEach(() => {
      mockEnv(true)
    })

    test('logs debug messages with correct formatting', () => {
      devLog.debug(DevLogCategory.VALIDATION, 'Test debug message', { data: 'test' })
      
      expect(consoleSpy.debug).toHaveBeenCalledWith(
        '🔍 [VALIDATION] Test debug message',
        { data: 'test' }
      )
    })

    test('logs info messages with correct formatting', () => {
      devLog.info(DevLogCategory.TOOL_EXECUTION, 'Test info message', { tool: 'search' })
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '🔧 [TOOL_EXECUTION] Test info message',
        { tool: 'search' }
      )
    })

    test('logs warning messages with correct formatting', () => {
      devLog.warn(DevLogCategory.MEMORY, 'Test warning message')
      
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        '🧠 [MEMORY] Test warning message',
        ''
      )
    })

    test('logs error messages and integrates with ErrorLogger', () => {
      const testError = new Error('Test error')
      devLog.error(DevLogCategory.API, 'Test error message', testError)
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        '📡 [API] Test error message',
        testError
      )
      
      // Should also call ErrorLogger for error tracking
      expect(errorLoggerSpy).toHaveBeenCalledWith(
        'Test error message',
        testError,
        'api',
        undefined,
        {}
      )
    })

    test('specialized validation logging works correctly', () => {
      devLog.validation('Validating message structure', { messageCount: 5 })
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '🔍 [VALIDATION] Validating message structure',
        { messageCount: 5 }
      )
    })

    test('specialized tool execution logging works correctly', () => {
      devLog.toolExecution('Executing search_documents tool', { parameters: { query: 'test' } })
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '🔧 [TOOL_EXECUTION] Executing search_documents tool',
        { parameters: { query: 'test' } }
      )
    })

    test('specialized conversation logging works correctly', () => {
      devLog.conversation('Building conversation history', { messageCount: 10 })
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '💬 [CONVERSATION] Building conversation history',
        { messageCount: 10 }
      )
    })

    test('specialized cache logging works correctly', () => {
      devLog.cache('Cache hit for tool mapping', { tool: 'search', serverId: 1 })
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '💾 [CACHE] Cache hit for tool mapping',
        { tool: 'search', serverId: 1 }
      )
    })

    test('specialized memory logging works correctly', () => {
      devLog.memory('Memory pressure detected', { usage: 0.85 })
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '🧠 [MEMORY] Memory pressure detected',
        { usage: 0.85 }
      )
    })

    test('specialized server mapping logging works correctly', () => {
      devLog.serverMapping('Found server for tool', { tool: 'search', serverId: 2 })
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '🗺️ [SERVER_MAPPING] Found server for tool',
        { tool: 'search', serverId: 2 }
      )
    })

    test('specialized retry logging works correctly', () => {
      devLog.retry('Retrying tool execution', { attempt: 2, maxAttempts: 3 })
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '🔄 [RETRY_LOGIC] Retrying tool execution',
        { attempt: 2, maxAttempts: 3 }
      )
    })

    test('specialized performance logging works correctly', () => {
      devLog.performance('Tool execution completed', { duration: 1234 })
      
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '📊 [PERFORMANCE] Tool execution completed',
        { duration: 1234 }
      )
    })

    test('stores logs for debugging purposes', () => {
      devLog.validation('Test message 1')
      devLog.toolExecution('Test message 2')
      devLog.conversation('Test message 3')
      
      const recentLogs = devLog.getRecentLogs(5)
      expect(recentLogs).toHaveLength(3)
      expect(recentLogs[0].category).toBe(DevLogCategory.VALIDATION)
      expect(recentLogs[1].category).toBe(DevLogCategory.TOOL_EXECUTION)
      expect(recentLogs[2].category).toBe(DevLogCategory.CONVERSATION)
    })

    test('limits stored logs to prevent memory growth', () => {
      // Create more logs than the max limit
      for (let i = 0; i < 250; i++) {
        devLog.general(`Test message ${i}`)
      }
      
      const allLogs = devLog.getRecentLogs(300)
      expect(allLogs.length).toBeLessThanOrEqual(200) // Should be limited to maxLogs
    })

    test('getLogsByCategory filters correctly', () => {
      devLog.validation('Validation message')
      devLog.toolExecution('Tool message')
      devLog.validation('Another validation message')
      
      const validationLogs = devLog.getLogsByCategory(DevLogCategory.VALIDATION)
      expect(validationLogs).toHaveLength(2)
      expect(validationLogs.every(log => log.category === DevLogCategory.VALIDATION)).toBe(true)
    })

    test('getLogStats provides accurate statistics', () => {
      devLog.validation('Validation 1')
      devLog.validation('Validation 2')
      devLog.toolExecution('Tool execution')
      devLog.error(DevLogCategory.API, 'API error')
      
      const stats = devLog.getLogStats()
      expect(stats['validation_INFO']).toBe(2)
      expect(stats['tool_execution_INFO']).toBe(1)
      expect(stats['api_ERROR']).toBe(1)
    })

    test('exportLogs returns structured log data', () => {
      devLog.validation('Test message')
      
      const exported = devLog.exportLogs()
      const parsed = JSON.parse(exported)
      
      expect(parsed.environment).toBe('development')
      expect(parsed.logs).toHaveLength(1)
      expect(parsed.logs[0].message).toBe('Test message')
    })

    test('clearLogs removes all stored logs', () => {
      devLog.validation('Test message 1')
      devLog.toolExecution('Test message 2')
      
      expect(devLog.getRecentLogs()).toHaveLength(2)
      
      devLog.clearLogs()
      
      expect(devLog.getRecentLogs()).toHaveLength(0)
    })
  })

  describe('Production Mode Behavior', () => {
    beforeEach(() => {
      mockEnv(false)
    })

    test('does not log debug messages in production', () => {
      devLog.debug(DevLogCategory.VALIDATION, 'Debug message')
      
      expect(consoleSpy.debug).not.toHaveBeenCalled()
    })

    test('does not log info messages in production', () => {
      devLog.info(DevLogCategory.TOOL_EXECUTION, 'Info message')
      
      expect(consoleSpy.log).not.toHaveBeenCalled()
    })

    test('does not log warning messages in production', () => {
      devLog.warn(DevLogCategory.MEMORY, 'Warning message')
      
      expect(consoleSpy.warn).not.toHaveBeenCalled()
    })

    test('does not log error messages in production', () => {
      devLog.error(DevLogCategory.API, 'Error message')
      
      expect(consoleSpy.error).not.toHaveBeenCalled()
    })

    test('specialized methods are silent in production', () => {
      devLog.validation('Validation message')
      devLog.toolExecution('Tool execution message')
      devLog.conversation('Conversation message')
      devLog.cache('Cache message')
      devLog.memory('Memory message')
      devLog.serverMapping('Server mapping message')
      devLog.retry('Retry message')
      devLog.performance('Performance message')
      
      expect(consoleSpy.log).not.toHaveBeenCalled()
      expect(consoleSpy.debug).not.toHaveBeenCalled()
      expect(consoleSpy.warn).not.toHaveBeenCalled()
      expect(consoleSpy.error).not.toHaveBeenCalled()
    })

    test('utility methods return empty results in production', () => {
      devLog.validation('This should not be stored')
      
      expect(devLog.getRecentLogs()).toHaveLength(0)
      expect(devLog.getLogsByCategory(DevLogCategory.VALIDATION)).toHaveLength(0)
      expect(devLog.getLogStats()).toEqual({})
    })

    test('exportLogs returns empty result in production', () => {
      devLog.validation('Test message')
      
      const exported = devLog.exportLogs()
      const parsed = JSON.parse(exported)
      
      expect(parsed.logs).toHaveLength(0)
      expect(parsed.note).toBe('Logging disabled in production')
    })

    test('isEnabled returns false in production', () => {
      expect(devLog.isEnabled()).toBe(false)
    })

    test('clearLogs is safe to call in production', () => {
      expect(() => devLog.clearLogs()).not.toThrow()
    })
  })

  describe('Performance Verification', () => {
    test('logging has minimal overhead in development', () => {
      mockEnv(true)
      
      const startTime = performance.now()
      
      // Execute many logging operations
      for (let i = 0; i < 1000; i++) {
        devLog.validation(`Test message ${i}`, { iteration: i })
      }
      
      const endTime = performance.now()
      const duration = endTime - startTime
      
      // Should complete 1000 log operations in reasonable time (< 100ms)
      expect(duration).toBeLessThan(100)
    })

    test('logging has zero overhead in production', () => {
      mockEnv(false)
      
      const startTime = performance.now()
      
      // Execute many logging operations
      for (let i = 0; i < 10000; i++) {
        devLog.validation(`Test message ${i}`, { iteration: i })
        devLog.toolExecution(`Tool message ${i}`)
        devLog.conversation(`Conversation message ${i}`)
      }
      
      const endTime = performance.now()
      const duration = endTime - startTime
      
      // Should complete 30000 no-op operations in minimal time (< 10ms)
      expect(duration).toBeLessThan(10)
    })
  })

  describe('React Hook Integration', () => {
    test('useDevLogger hook returns correct interface in development', () => {
      mockEnv(true)
      
      const hook = useDevLogger()
      
      expect(hook.isEnabled).toBe(true)
      expect(typeof hook.devLog).toBe('object')
      expect(typeof hook.getRecentLogs).toBe('function')
      expect(typeof hook.exportLogs).toBe('function')
    })

    test('useDevLogger hook returns correct interface in production', () => {
      mockEnv(false)
      
      const hook = useDevLogger()
      
      expect(hook.isEnabled).toBe(false)
      expect(typeof hook.devLog).toBe('object')
      expect(hook.getRecentLogs()).toHaveLength(0)
    })
  })

  describe('Error Integration', () => {
    beforeEach(() => {
      mockEnv(true)
    })

    test('error logs integrate with ErrorLogger system', () => {
      const testError = new Error('Integration test error')
      devLog.error(DevLogCategory.TOOL_EXECUTION, 'Tool execution failed', testError)
      
      expect(errorLoggerSpy).toHaveBeenCalledWith(
        'Tool execution failed',
        testError,
        'tool_execution',
        undefined,
        {}
      )
    })

    test('non-Error data does not confuse ErrorLogger integration', () => {
      const testData = { userId: 123, action: 'search' }
      devLog.error(DevLogCategory.API, 'API operation failed', testData)
      
      expect(errorLoggerSpy).toHaveBeenCalledWith(
        'API operation failed',
        undefined, // No Error object
        'api',
        undefined,
        testData
      )
    })
  })

  describe('Category Emoji Mapping', () => {
    beforeEach(() => {
      mockEnv(true)
    })

    test('all categories have correct emoji mappings', () => {
      const testCases: Array<[DevLogCategory, string]> = [
        [DevLogCategory.VALIDATION, '🔍'],
        [DevLogCategory.TOOL_EXECUTION, '🔧'],
        [DevLogCategory.CONVERSATION, '💬'],
        [DevLogCategory.CACHE, '💾'],
        [DevLogCategory.MEMORY, '🧠'],
        [DevLogCategory.SERVER_MAPPING, '🗺️'],
        [DevLogCategory.RETRY_LOGIC, '🔄'],
        [DevLogCategory.PERFORMANCE, '📊'],
        [DevLogCategory.STATE, '📦'],
        [DevLogCategory.API, '📡'],
        [DevLogCategory.ERROR_BOUNDARY, '🛡️'],
        [DevLogCategory.GENERAL, '📝']
      ]

      testCases.forEach(([category, expectedEmoji]) => {
        devLog.info(category, 'Test message')
        expect(consoleSpy.log).toHaveBeenCalledWith(
          expect.stringContaining(expectedEmoji),
          ''
        )
        consoleSpy.log.mockClear()
      })
    })
  })
})