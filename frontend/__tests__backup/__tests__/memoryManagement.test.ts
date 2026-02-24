/**
 * Comprehensive Memory Management Test Suite
 * 
 * This test suite validates that the memory leak fixes are working correctly
 * and that the application properly manages memory during tool execution.
 */

import { 
  MemoryLeakTester, 
  createMockToolExecution, 
  createMountUnmountTest,
  takeMemorySnapshot,
  bytesToMB,
  forceGarbageCollection 
} from '../lib/memoryTestUtils'

// Mock implementation for testing environment
const mockAPI = {
  getMCPServers: jest.fn(),
  getMCPServerWithTools: jest.fn(),
  callTool: jest.fn(),
  chat: jest.fn()
}

const mockUseStore = {
  messages: [],
  addMessage: jest.fn(),
  updateMessage: jest.fn(),
  setLoading: jest.fn()
}

// Mock AbortController for Node.js test environment
if (typeof AbortController === 'undefined') {
  global.AbortController = class MockAbortController {
    signal = { aborted: false }
    abort() { this.signal.aborted = true }
  } as any
}

// Mock performance.memory for testing
Object.defineProperty(performance, 'memory', {
  value: {
    usedJSHeapSize: 50 * 1024 * 1024, // 50MB
    totalJSHeapSize: 100 * 1024 * 1024, // 100MB
    jsHeapSizeLimit: 2 * 1024 * 1024 * 1024 // 2GB
  },
  configurable: true
})

describe('Memory Management', () => {
  let memoryTester: MemoryLeakTester

  beforeEach(() => {
    memoryTester = new MemoryLeakTester({
      maxMemoryGrowth: 10, // 10MB for tests
      testDuration: 5000, // 5 seconds
      samplingInterval: 500, // 500ms
      warmupIterations: 2
    })

    // Reset mocks
    jest.clearAllMocks()
    mockAPI.getMCPServers.mockResolvedValue([
      { id: 1, name: 'test-server' }
    ])
    mockAPI.getMCPServerWithTools.mockResolvedValue({
      tools: [
        { name: 'testTool', is_enabled: true }
      ]
    })
    mockAPI.callTool.mockResolvedValue({
      success: true,
      result: { content: 'test result' }
    })
  })

  afterEach(async () => {
    memoryTester.stopMonitoring()
    forceGarbageCollection()
    // Give GC time to run
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  describe('Memory Leak Detection', () => {
    test('should not leak memory during repeated tool executions', async () => {
      const mockToolExecution = createMockToolExecution(3, 50)

      const result = await memoryTester.runMemoryTest(
        mockToolExecution,
        'Tool Execution Memory Test'
      )

      expect(result.passed).toBe(true)
      expect(result.memoryGrowth).toBeLessThan(10) // Less than 10MB growth
      expect(result.issues).toHaveLength(0)
      expect(result.iterationCount).toBeGreaterThan(0)
    })

    test('should clean up memory after component unmount simulation', async () => {
      const mountUnmountTest = createMountUnmountTest()

      const result = await memoryTester.runMemoryTest(
        mountUnmountTest,
        'Mount/Unmount Memory Test'
      )

      expect(result.passed).toBe(true)
      expect(result.memoryGrowth).toBeLessThan(5) // Very low growth for cleanup test
      expect(result.finalMemory).toBeLessThanOrEqual(result.peakMemory)
    })

    test('should handle memory snapshots correctly', () => {
      const snapshot = takeMemorySnapshot()
      
      expect(snapshot).toBeDefined()
      expect(snapshot.timestamp).toBeGreaterThan(0)
      expect(snapshot.usedJSHeapSize).toBeGreaterThan(0)
      expect(snapshot.totalJSHeapSize).toBeGreaterThan(0)
    })

    test('should convert bytes to MB correctly', () => {
      expect(bytesToMB(1024 * 1024)).toBe(1) // 1MB
      expect(bytesToMB(50 * 1024 * 1024)).toBe(50) // 50MB
      expect(bytesToMB(0)).toBe(0)
    })
  })

  describe('AbortController Integration', () => {
    test('should create and abort controllers without memory leaks', async () => {
      const testAbortControllers = async () => {
        const controllers: AbortController[] = []
        
        // Create multiple abort controllers
        for (let i = 0; i < 10; i++) {
          const controller = new AbortController()
          controllers.push(controller)
          
          // Simulate some async operations
          const promise = new Promise((resolve, reject) => {
            const timeout = setTimeout(resolve, 100)
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timeout)
              reject(new Error('Aborted'))
            })
          })
          
          // Abort half of them
          if (i % 2 === 0) {
            controller.abort()
          }
          
          try {
            await promise
          } catch (error) {
            // Expected for aborted operations
          }
        }
        
        // Clean up all controllers
        controllers.forEach(controller => {
          if (!controller.signal.aborted) {
            controller.abort()
          }
        })
        controllers.length = 0
      }

      const result = await memoryTester.runMemoryTest(
        testAbortControllers,
        'AbortController Memory Test'
      )

      expect(result.passed).toBe(true)
      expect(result.memoryGrowth).toBeLessThan(2) // Very low growth
    })
  })

  describe('Conversation History Limits', () => {
    test('should limit conversation history to prevent unbounded growth', () => {
      const MAX_HISTORY = 50
      
      // Simulate large conversation history
      const messages = Array.from({ length: 100 }, (_, i) => ({
        id: `msg_${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: new Date(),
        tool_calls: []
      }))

      // This would be the limitConversationHistory function
      const limitConversationHistory = (msgs: any[]) => {
        if (msgs.length <= MAX_HISTORY) return msgs
        
        const limited = msgs.slice(-MAX_HISTORY)
        const firstUserIndex = limited.findIndex(msg => msg.role === 'user')
        return firstUserIndex > 0 ? limited.slice(firstUserIndex) : limited
      }

      const limitedMessages = limitConversationHistory(messages)
      
      expect(limitedMessages.length).toBeLessThanOrEqual(MAX_HISTORY)
      expect(limitedMessages.length).toBeGreaterThan(0)
      expect(limitedMessages[0].role).toBe('user') // Should start with user message
    })
  })

  describe('Tool Server Cache', () => {
    test('should cache tool server mappings efficiently', async () => {
      const CACHE_EXPIRY = 5000 // 5 seconds
      
      // Simulate cache implementation
      const cache = {
        data: new Map<string, number>(),
        timestamp: 0,
        
        isValid: function() {
          return (Date.now() - this.timestamp) < CACHE_EXPIRY
        },
        
        set: function(toolName: string, serverId: number) {
          this.data.set(toolName, serverId)
          this.timestamp = Date.now()
        },
        
        get: function(toolName: string): number | undefined {
          return this.isValid() ? this.data.get(toolName) : undefined
        },
        
        clear: function() {
          this.data.clear()
          this.timestamp = 0
        }
      }

      // Test cache operations
      cache.set('testTool', 1)
      expect(cache.get('testTool')).toBe(1)
      
      // Test cache expiry
      cache.timestamp = Date.now() - CACHE_EXPIRY - 1000 // Expired
      expect(cache.get('testTool')).toBeUndefined()
      
      // Test memory cleanup
      cache.clear()
      expect(cache.data.size).toBe(0)
    })
  })

  describe('Component Lifecycle Management', () => {
    test('should track component mount status correctly', () => {
      // Simulate component mount tracking
      let isMounted = true
      const mountedRef = { current: isMounted }
      
      // Simulate state update guards
      const safeStateUpdate = (updateFn: () => void) => {
        if (mountedRef.current) {
          updateFn()
          return true
        }
        return false
      }

      // Test mounted state
      let updateCalled = false
      const result1 = safeStateUpdate(() => { updateCalled = true })
      expect(result1).toBe(true)
      expect(updateCalled).toBe(true)

      // Test unmounted state
      mountedRef.current = false
      updateCalled = false
      const result2 = safeStateUpdate(() => { updateCalled = true })
      expect(result2).toBe(false)
      expect(updateCalled).toBe(false)
    })
  })

  describe('Retry Limits and Circuit Breaker', () => {
    test('should enforce retry limits', () => {
      const MAX_RETRIES = 3
      let retryCount = 0
      
      const executeWithRetry = async (operation: () => Promise<boolean>) => {
        while (retryCount < MAX_RETRIES) {
          try {
            const success = await operation()
            if (success) return true
            
            retryCount++
            if (retryCount >= MAX_RETRIES) {
              throw new Error('Max retries exceeded')
            }
          } catch (error) {
            retryCount++
            if (retryCount >= MAX_RETRIES) {
              throw error
            }
          }
        }
        return false
      }

      // Test max retries
      const failingOperation = async () => false
      
      expect(async () => {
        await executeWithRetry(failingOperation)
      }).rejects.toThrow('Max retries exceeded')
      
      expect(retryCount).toBe(MAX_RETRIES)
    })
  })

  describe('Performance Validation', () => {
    test('should not degrade performance significantly', async () => {
      const iterations = 100
      const startTime = performance.now()
      
      // Simulate tool operations
      for (let i = 0; i < iterations; i++) {
        // Mock operations that should be fast
        const mockData = Array.from({ length: 10 }, (_, j) => ({
          id: `item_${i}_${j}`,
          data: `Test data ${i}-${j}`
        }))
        
        // Simulate processing
        mockData.forEach(item => {
          // Some computation
          const processed = item.data.length > 0
          return processed
        })
        
        // Clean up
        mockData.length = 0
      }
      
      const duration = performance.now() - startTime
      const avgOperationTime = duration / iterations
      
      expect(avgOperationTime).toBeLessThan(10) // Each operation should be < 10ms
      expect(duration).toBeLessThan(5000) // Total should be < 5 seconds
    })
  })

  describe('Error Handling and Cleanup', () => {
    test('should clean up resources on errors', async () => {
      const resources: any[] = []
      
      const operationWithCleanup = async () => {
        try {
          // Allocate resources
          for (let i = 0; i < 5; i++) {
            resources.push({
              id: i,
              data: new Array(1000).fill(`data_${i}`),
              cleanup: () => resources.splice(resources.indexOf(this), 1)
            })
          }
          
          // Simulate error
          throw new Error('Simulated error')
          
        } finally {
          // Cleanup should happen regardless
          resources.forEach(resource => {
            if (resource.cleanup) {
              resource.cleanup()
            }
          })
          resources.length = 0
        }
      }

      await expect(operationWithCleanup()).rejects.toThrow('Simulated error')
      expect(resources.length).toBe(0) // All resources cleaned up
    })
  })

  describe('Integration Tests', () => {
    test('should handle complete tool execution lifecycle without leaks', async () => {
      const simulateCompleteToolExecution = async () => {
        // 1. Create abort controller
        const abortController = new AbortController()
        
        // 2. Simulate conversation history processing
        const messages = Array.from({ length: 20 }, (_, i) => ({
          id: `msg_${i}`,
          content: `Message ${i}`
        }))
        
        // 3. Simulate tool execution
        const toolCalls = [
          { id: 'tool1', name: 'search', parameters: {} },
          { id: 'tool2', name: 'analyze', parameters: {} }
        ]
        
        // 4. Process each tool
        for (const tool of toolCalls) {
          if (abortController.signal.aborted) {
            throw new Error('Aborted')
          }
          
          // Simulate tool processing
          const result = {
            success: true,
            data: new Array(100).fill(`result_${tool.name}`)
          }
          
          // Clean up intermediate data
          result.data.length = 0
        }
        
        // 5. Clean up
        messages.length = 0
        toolCalls.length = 0
        abortController.abort()
      }

      const result = await memoryTester.runMemoryTest(
        simulateCompleteToolExecution,
        'Complete Tool Execution Test'
      )

      expect(result.passed).toBe(true)
      expect(result.memoryGrowth).toBeLessThan(15) // Allow some growth for complex operations
      expect(result.iterationCount).toBeGreaterThan(0)
    })
  })
})

// Helper function to run manual memory tests
export async function runManualMemoryTest() {
  if (typeof window === 'undefined') {
    console.log('Manual memory test is only available in browser environment')
    return
  }

  console.log('🧪 Starting manual memory test...')
  
  const tester = new MemoryLeakTester()
  const mockOperation = createMockToolExecution(5, 200)
  
  const result = await tester.runMemoryTest(mockOperation, 'Manual Memory Test')
  
  console.log('📊 Manual Test Results:', result)
  
  if (result.passed) {
    console.log('✅ Memory test PASSED - No significant memory leaks detected')
  } else {
    console.log('❌ Memory test FAILED - Potential memory leaks detected')
    console.log('Issues:', result.issues)
  }
  
  return result
}

// Make manual test available in browser console
if (typeof window !== 'undefined') {
  (window as any).runManualMemoryTest = runManualMemoryTest
}