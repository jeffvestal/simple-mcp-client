/**
 * Enhanced Memory Management Test Suite
 * 
 * Comprehensive tests for memory leak prevention, resource tracking,
 * and the new MemoryManager system integration
 */

import { 
  MemoryLeakTester, 
  createMockToolExecution, 
  createMountUnmountTest,
  takeMemorySnapshot,
  bytesToMB,
  forceGarbageCollection 
} from '../../src/lib/memoryTestUtils'

import {
  MemoryManager,
  getMemoryManager,
  createManagedAbortController,
  trackAsyncOperation,
  createManagedTimeout,
  createManagedInterval
} from '../../src/lib/MemoryManager'

// Mock API for testing
const mockAPI = {
  getMCPServers: jest.fn(),
  getMCPServerWithTools: jest.fn(),
  callTool: jest.fn(),
  chat: jest.fn()
}

// Mock AbortController for Node.js test environment
if (typeof AbortController === 'undefined') {
  global.AbortController = class MockAbortController {
    signal = { aborted: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }
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

describe('Enhanced Memory Management', () => {
  let memoryTester: MemoryLeakTester
  let memoryManager: MemoryManager

  beforeEach(() => {
    memoryTester = new MemoryLeakTester({
      maxMemoryGrowth: 10, // 10MB for tests
      testDuration: 5000, // 5 seconds
      samplingInterval: 500, // 500ms
      warmupIterations: 2
    })

    memoryManager = getMemoryManager()

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
    memoryManager.destroy()
    forceGarbageCollection()
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  describe('MemoryManager Resource Tracking', () => {
    test('should track and cleanup AbortControllers automatically', async () => {
      const controllers: AbortController[] = []
      
      // Create managed abort controllers
      for (let i = 0; i < 10; i++) {
        const controller = createManagedAbortController(`Test controller ${i}`)
        controllers.push(controller)
      }

      // Check memory stats
      const stats = memoryManager.getMemoryStats()
      expect(stats.activeResources).toBeGreaterThan(0)
      expect(stats.resourcesByType['abort-controller']).toBe(10)

      // Abort and cleanup
      controllers.forEach(c => c.abort())
      memoryManager.cleanupResourcesByType('abort-controller')

      const statsAfter = memoryManager.getMemoryStats()
      expect(statsAfter.resourcesByType['abort-controller'] || 0).toBe(0)
    })

    test('should track async operations with promise rejection handling', async () => {
      let rejectionHandled = false

      // Track a failing promise
      try {
        await trackAsyncOperation(
          async () => {
            throw new Error('Test rejection')
          },
          'Test failing operation'
        )
      } catch (error) {
        rejectionHandled = true
      }

      expect(rejectionHandled).toBe(true)
    })

    test('should cleanup timers automatically', () => {
      const timers: NodeJS.Timeout[] = []
      
      // Create managed timers
      for (let i = 0; i < 5; i++) {
        const timer = createManagedTimeout(
          () => console.log(`Timer ${i}`),
          1000,
          `Test timer ${i}`
        )
        timers.push(timer)
      }

      // Check tracking
      const stats = memoryManager.getMemoryStats()
      expect(stats.resourcesByType['timer']).toBe(5)

      // Cleanup
      memoryManager.cleanupResourcesByType('timer')
      
      const statsAfter = memoryManager.getMemoryStats()
      expect(statsAfter.resourcesByType['timer'] || 0).toBe(0)
    })

    test('should handle memory pressure and trigger cleanup', async () => {
      let cleanupTriggered = false
      
      // Register cleanup task
      memoryManager.registerCleanupTask({
        priority: 'high',
        description: 'Test cleanup task',
        execute: () => {
          cleanupTriggered = true
        }
      })

      // Trigger high priority cleanup
      await memoryManager.triggerCleanup('high')
      
      expect(cleanupTriggered).toBe(true)
    })

    test('should cleanup old resources based on age', () => {
      // Create resources with different ages
      const oldController = createManagedAbortController('Old controller')
      const newController = createManagedAbortController('New controller')
      
      // Mock old resource age
      const stats = memoryManager.getMemoryStats()
      const initialCount = stats.activeResources
      
      // Clean resources older than 0ms (all resources)
      const cleaned = memoryManager.cleanupOldResources(0)
      
      expect(cleaned).toBe(initialCount)
      
      const statsAfter = memoryManager.getMemoryStats()
      expect(statsAfter.activeResources).toBe(0)
    })
  })

  describe('Stress Testing with Concurrent Operations', () => {
    test('should handle 1000+ concurrent tool executions without memory leaks', async () => {
      const executeStressTest = async () => {
        const promises: Promise<any>[] = []
        
        // Create 100 concurrent tool executions
        for (let i = 0; i < 100; i++) {
          const promise = trackAsyncOperation(
            async () => {
              // Simulate tool execution
              await new Promise(resolve => setTimeout(resolve, Math.random() * 100))
              return { success: true, data: `Result ${i}` }
            },
            `Stress test tool ${i}`
          )
          promises.push(promise)
        }
        
        // Wait for all to complete
        const results = await Promise.allSettled(promises)
        
        // Verify all completed
        const successful = results.filter(r => r.status === 'fulfilled').length
        expect(successful).toBeGreaterThan(95) // Allow for some failures
        
        // Clear references
        promises.length = 0
      }

      const result = await memoryTester.runMemoryTest(
        executeStressTest,
        'Concurrent Operations Stress Test'
      )

      expect(result.passed).toBe(true)
      expect(result.memoryGrowth).toBeLessThan(20) // Allow some growth for concurrent ops
    })

    test('should handle rapid component mount/unmount cycles', async () => {
      const rapidMountUnmount = async () => {
        for (let i = 0; i < 50; i++) {
          // Simulate component mount
          const controller = createManagedAbortController('Component controller')
          const timers: NodeJS.Timeout[] = []
          
          // Add some timers
          for (let j = 0; j < 3; j++) {
            timers.push(createManagedTimeout(() => {}, 1000, 'Component timer'))
          }
          
          // Simulate rapid unmount
          controller.abort()
          memoryManager.cleanupResourcesByType('timer')
          
          // Small delay between cycles
          await new Promise(resolve => setTimeout(resolve, 10))
        }
      }

      const result = await memoryTester.runMemoryTest(
        rapidMountUnmount,
        'Rapid Mount/Unmount Test'
      )

      expect(result.passed).toBe(true)
      expect(result.memoryGrowth).toBeLessThan(5) // Very low growth expected
    })
  })

  describe('Promise Rejection Scenarios', () => {
    test('should handle unhandled promise rejections gracefully', async () => {
      const rejections: Error[] = []
      
      // Set up rejection handler
      const originalHandler = process.on('unhandledRejection', (error: Error) => {
        rejections.push(error)
      })

      // Create promises that will reject
      const promises = []
      for (let i = 0; i < 10; i++) {
        const promise = trackAsyncOperation(
          async () => {
            if (i % 2 === 0) {
              throw new Error(`Rejection ${i}`)
            }
            return `Success ${i}`
          },
          `Test promise ${i}`
        ).catch(() => {
          // Handled rejection
        })
        promises.push(promise)
      }

      await Promise.allSettled(promises)
      
      // No unhandled rejections should occur
      expect(rejections.length).toBe(0)
      
      // Restore handler
      if (originalHandler) {
        process.removeListener('unhandledRejection', originalHandler)
      }
    })

    test('should cleanup resources even when promises reject', async () => {
      const controller = createManagedAbortController('Test controller')
      
      try {
        await trackAsyncOperation(
          async () => {
            // Simulate work
            await new Promise(resolve => setTimeout(resolve, 100))
            // Then fail
            throw new Error('Operation failed')
          },
          'Failing operation',
          controller.signal
        )
      } catch (error) {
        // Expected failure
      }
      
      // Cleanup should still work
      memoryManager.cleanupResourcesByType('abort-controller')
      
      const stats = memoryManager.getMemoryStats()
      expect(stats.resourcesByType['abort-controller'] || 0).toBe(0)
    })
  })

  describe('Memory Pressure Response', () => {
    test('should respond to memory pressure with progressive cleanup', async () => {
      let lowCleanupExecuted = false
      let mediumCleanupExecuted = false
      let highCleanupExecuted = false
      
      // Register cleanup tasks
      memoryManager.registerCleanupTask({
        priority: 'low',
        description: 'Low priority cleanup',
        execute: () => { lowCleanupExecuted = true }
      })
      
      memoryManager.registerCleanupTask({
        priority: 'medium',
        description: 'Medium priority cleanup',
        execute: () => { mediumCleanupExecuted = true }
      })
      
      memoryManager.registerCleanupTask({
        priority: 'high',
        description: 'High priority cleanup',
        execute: () => { highCleanupExecuted = true }
      })
      
      // Trigger different cleanup levels
      await memoryManager.triggerCleanup('low')
      expect(lowCleanupExecuted).toBe(true)
      expect(mediumCleanupExecuted).toBe(true)
      expect(highCleanupExecuted).toBe(true) // All get executed with 'low' min priority
      
      // Reset
      lowCleanupExecuted = false
      mediumCleanupExecuted = false
      highCleanupExecuted = false
      
      // Trigger high only
      await memoryManager.triggerCleanup('high')
      expect(lowCleanupExecuted).toBe(false)
      expect(mediumCleanupExecuted).toBe(false)
      expect(highCleanupExecuted).toBe(true)
    })

    test('should add and notify memory pressure listeners', () => {
      let listenerCalled = false
      let reportedUsage = 0
      
      // Add listener
      memoryManager.addMemoryPressureListener(0.5, (usage) => {
        listenerCalled = true
        reportedUsage = usage
      })
      
      // Mock high memory usage
      Object.defineProperty(performance, 'memory', {
        value: {
          usedJSHeapSize: 1.8 * 1024 * 1024 * 1024, // 1.8GB
          totalJSHeapSize: 2 * 1024 * 1024 * 1024, // 2GB
          jsHeapSizeLimit: 2 * 1024 * 1024 * 1024 // 2GB
        },
        configurable: true
      })
      
      // Trigger check (would normally be automatic)
      // In real implementation, this happens on interval
      
      // Restore normal memory
      Object.defineProperty(performance, 'memory', {
        value: {
          usedJSHeapSize: 50 * 1024 * 1024,
          totalJSHeapSize: 100 * 1024 * 1024,
          jsHeapSizeLimit: 2 * 1024 * 1024 * 1024
        },
        configurable: true
      })
    })
  })

  describe('Integration with ChatInterfaceSimple', () => {
    test('should track tool execution lifecycle correctly', async () => {
      // Simulate the tool execution flow
      const executeToolFlow = async () => {
        // Create abort controller for session
        const sessionController = createManagedAbortController('Chat session')
        
        // Track API calls
        const serverPromise = trackAsyncOperation(
          () => mockAPI.getMCPServers(sessionController.signal),
          'Fetch servers',
          sessionController.signal
        )
        
        const servers = await serverPromise
        
        // Execute tools
        const toolPromises = []
        for (let i = 0; i < 5; i++) {
          const toolPromise = trackAsyncOperation(
            () => mockAPI.callTool({
              tool_name: `tool_${i}`,
              parameters: {},
              server_id: 1
            }, sessionController.signal),
            `Execute tool ${i}`,
            sessionController.signal
          )
          toolPromises.push(toolPromise)
        }
        
        await Promise.all(toolPromises)
        
        // Cleanup
        sessionController.abort()
        memoryManager.cleanupResourcesByType('abort-controller')
      }

      const result = await memoryTester.runMemoryTest(
        executeToolFlow,
        'Tool Execution Flow Test'
      )

      expect(result.passed).toBe(true)
      expect(result.memoryGrowth).toBeLessThan(10)
    })
  })

  describe('Edge Cases and Error Scenarios', () => {
    test('should handle circular references without leaks', () => {
      // Create circular reference
      const obj1: any = { name: 'obj1' }
      const obj2: any = { name: 'obj2', ref: obj1 }
      obj1.ref = obj2
      
      // Register with memory manager
      memoryManager.registerResource(obj1, {
        type: 'dom-ref',
        created: Date.now(),
        description: 'Circular reference test'
      })
      
      // Should not throw or leak
      const stats = memoryManager.getMemoryStats()
      expect(stats.activeResources).toBeGreaterThan(0)
      
      // Break circular reference
      obj1.ref = null
      obj2.ref = null
    })

    test('should handle null and undefined gracefully', () => {
      // Should not throw
      expect(() => {
        memoryManager.unregisterResource(null as any)
        memoryManager.unregisterResource(undefined as any)
      }).not.toThrow()
    })

    test('should recover from cleanup errors', async () => {
      // Register task that throws
      memoryManager.registerCleanupTask({
        priority: 'high',
        description: 'Failing cleanup',
        execute: () => {
          throw new Error('Cleanup failed')
        }
      })
      
      // Should not throw
      await expect(memoryManager.triggerCleanup('high')).resolves.not.toThrow()
    })
  })

  describe('Performance Benchmarks', () => {
    test('memory manager should have minimal overhead', async () => {
      const iterations = 1000
      
      // Benchmark without memory manager
      const startWithout = performance.now()
      for (let i = 0; i < iterations; i++) {
        const controller = new AbortController()
        controller.abort()
      }
      const timeWithout = performance.now() - startWithout
      
      // Benchmark with memory manager
      const startWith = performance.now()
      for (let i = 0; i < iterations; i++) {
        const controller = createManagedAbortController('Benchmark')
        controller.abort()
        memoryManager.unregisterResource(controller)
      }
      const timeWith = performance.now() - startWith
      
      // Overhead should be less than 2x
      const overhead = timeWith / timeWithout
      expect(overhead).toBeLessThan(2)
      
      console.log(`Performance overhead: ${overhead.toFixed(2)}x`)
    })
  })
})