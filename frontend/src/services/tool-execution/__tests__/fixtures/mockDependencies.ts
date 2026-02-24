/**
 * Mock Dependencies for Testing
 * 
 * Provides mock implementations of external dependencies used by tool execution services
 */

import { ExternalDependencies } from '../../types/ServiceDependencies'

/**
 * Create mock API client
 */
export const createMockApi = () => ({
  getMCPServers: jest.fn(),
  getMCPServerWithTools: jest.fn(),
  callTool: jest.fn(),
  chat: jest.fn(),
  // Additional API methods that might be needed
  getLLMConfigs: jest.fn(),
  createMCPServer: jest.fn(),
  updateMCPServer: jest.fn(),
  deleteMCPServer: jest.fn()
})

/**
 * Create mock MemoryManager
 */
export const createMockMemoryManager = () => ({
  registerCleanupTask: jest.fn(),
  addMemoryPressureListener: jest.fn(),
  registerResource: jest.fn(),
  registerAbortController: jest.fn(),
  registerTimer: jest.fn(),
  trackPromise: jest.fn(),
  unregisterResource: jest.fn(),
  cleanupResourcesByType: jest.fn(),
  cleanupOldResources: jest.fn(),
  triggerCleanup: jest.fn(),
  getMemoryStats: jest.fn(() => ({
    activeResources: 0,
    memoryUsage: 0.5,
    memoryGrowthRate: 0,
    resourcesByType: {}
  })),
  destroy: jest.fn()
})

/**
 * Create mock ErrorLogger
 */
export const createMockErrorLogger = () => ({
  logError: jest.fn(),
  logWarning: jest.fn(),
  logInfo: jest.fn(),
  logDebug: jest.fn(),
  getErrorHistory: jest.fn(() => []),
  clearErrorHistory: jest.fn()
})

/**
 * Create mock MessageManager
 */
export const createMockMessageManager = () => ({
  safeAddMessage: jest.fn(() => `msg_${Date.now()}`),
  safeUpdateMessage: jest.fn(),
  getMessages: jest.fn(() => [])
})

/**
 * Create mock LLMConfigManager
 */
export const createMockLLMConfigManager = () => ({
  getActiveLLMConfig: jest.fn(() => ({ id: 'test-llm-config' }))
})

/**
 * Create mock Performance Monitor
 */
export const createMockPerformanceMonitor = () => ({
  startOperation: jest.fn(() => ({ 
    end: jest.fn(),
    addMetadata: jest.fn()
  })),
  recordMetric: jest.fn(),
  getMetrics: jest.fn(() => ({})),
  clearMetrics: jest.fn()
})

/**
 * Create complete external dependencies mock
 */
export const createMockExternalDependencies = (
  overrides: Partial<ExternalDependencies> = {}
): ExternalDependencies => ({
  api: createMockApi(),
  memoryManager: createMockMemoryManager(),
  errorLogger: createMockErrorLogger(),
  messageManager: createMockMessageManager(),
  llmConfigManager: createMockLLMConfigManager(),
  store: {
    messages: [],
    addMessage: jest.fn(() => `msg_${Date.now()}`),
    updateMessage: jest.fn()
  },
  toast: {
    toast: jest.fn()
  },
  performanceMonitor: createMockPerformanceMonitor(),
  safeJson: {
    safeJsonParseWithDefault: jest.fn((text, defaultValue) => {
      try {
        return JSON.parse(text)
      } catch {
        return defaultValue
      }
    })
  },
  ...overrides
})

/**
 * Mock AbortController for testing
 */
export const createMockAbortController = (aborted = false) => ({
  signal: {
    aborted,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  },
  abort: jest.fn()
})

/**
 * Mock fetch response helpers
 */
export const createMockFetchResponse = (data: any, options: { ok?: boolean; status?: number } = {}) => ({
  ok: options.ok ?? true,
  status: options.status ?? 200,
  json: jest.fn().mockResolvedValue(data),
  text: jest.fn().mockResolvedValue(JSON.stringify(data))
})

/**
 * Mock timer utilities for testing time-based functionality
 */
export const createMockTimers = () => {
  const timers = new Map<number, { callback: Function; delay: number; type: 'timeout' | 'interval' }>()
  let timerId = 1

  return {
    setTimeout: jest.fn((callback: Function, delay: number) => {
      const id = timerId++
      timers.set(id, { callback, delay, type: 'timeout' })
      return id
    }),
    clearTimeout: jest.fn((id: number) => {
      timers.delete(id)
    }),
    setInterval: jest.fn((callback: Function, delay: number) => {
      const id = timerId++
      timers.set(id, { callback, delay, type: 'interval' })
      return id
    }),
    clearInterval: jest.fn((id: number) => {
      timers.delete(id)
    }),
    advanceTimersByTime: (ms: number) => {
      // Simulate Jest's timer advancement
      for (const [id, timer] of timers.entries()) {
        if (timer.type === 'timeout') {
          timer.callback()
          timers.delete(id)
        } else {
          // For intervals, call repeatedly
          let elapsed = 0
          while (elapsed < ms) {
            timer.callback()
            elapsed += timer.delay
          }
        }
      }
    },
    getActiveTimers: () => Array.from(timers.keys()),
    clearAllTimers: () => timers.clear()
  }
}

/**
 * Mock localStorage for testing persistence
 */
export const createMockLocalStorage = () => {
  const storage = new Map<string, string>()
  
  return {
    getItem: jest.fn((key: string) => storage.get(key) || null),
    setItem: jest.fn((key: string, value: string) => storage.set(key, value)),
    removeItem: jest.fn((key: string) => storage.delete(key)),
    clear: jest.fn(() => storage.clear()),
    length: storage.size,
    key: jest.fn((index: number) => Array.from(storage.keys())[index] || null)
  }
}

/**
 * Test helper to wait for async operations
 */
export const waitForPromises = () => new Promise(resolve => setImmediate(resolve))

/**
 * Test helper to create realistic delays
 */
export const createDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Mock console methods for testing log output
 */
export const createMockConsole = () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  group: jest.fn(),
  groupEnd: jest.fn(),
  time: jest.fn(),
  timeEnd: jest.fn()
})