/**
 * Memory Leak Validation Utilities
 * 
 * Simple validation functions to verify memory leak fixes are working correctly
 */

import { getMemoryManager, createManagedAbortController } from './MemoryManager'
import { performanceMonitor } from './performanceMonitor'

/**
 * Quick validation test for memory management
 */
export async function validateMemoryLeakFixes(): Promise<boolean> {
  console.log('🔍 Running memory leak validation...')
  
  const memoryManager = getMemoryManager()
  let success = true
  
  try {
    // Test 1: AbortController management
    console.log('  ✅ Test 1: AbortController management')
    const controllers = []
    for (let i = 0; i < 5; i++) {
      const controller = createManagedAbortController(`Test ${i}`)
      controllers.push(controller)
    }
    
    const stats1 = memoryManager.getMemoryStats()
    console.log(`    Active resources: ${stats1.activeResources}`)
    
    // Cleanup
    controllers.forEach(c => c.abort())
    memoryManager.cleanupResourcesByType('abort-controller')
    
    const stats1After = memoryManager.getMemoryStats()
    const abortControllerCount = stats1After.resourcesByType['abort-controller'] || 0
    console.log(`    Resources after cleanup: ${stats1After.activeResources}`)
    
    if (abortControllerCount > 0) {
      console.error('    ❌ AbortControllers not cleaned up properly')
      success = false
    }
    
    // Test 2: Memory health monitoring
    console.log('  ✅ Test 2: Memory health monitoring')
    const memoryHealth = performanceMonitor.getMemoryHealth()
    console.log(`    Memory usage: ${memoryHealth.usedMemoryMB.toFixed(1)}MB`)
    console.log(`    Active resources: ${memoryHealth.activeResources}`)
    console.log(`    Health status: ${memoryHealth.isHealthy ? 'Healthy' : 'Unhealthy'}`)
    
    if (memoryHealth.warnings.length > 0) {
      console.warn('    ⚠️ Memory warnings:', memoryHealth.warnings)
    }
    
    // Test 3: Resource cleanup on memory pressure
    console.log('  ✅ Test 3: Memory pressure response')
    let cleanupExecuted = false
    
    memoryManager.registerCleanupTask({
      priority: 'high',
      description: 'Validation test cleanup',
      execute: () => {
        cleanupExecuted = true
        console.log('    Cleanup task executed successfully')
      }
    })
    
    await memoryManager.triggerCleanup('high')
    
    if (!cleanupExecuted) {
      console.error('    ❌ Cleanup task was not executed')
      success = false
    }
    
    // Test 4: Promise rejection handling
    console.log('  ✅ Test 4: Promise rejection handling')
    try {
      await memoryManager.trackPromise(
        Promise.reject(new Error('Test rejection')),
        'Validation rejection test'
      )
    } catch (error) {
      console.log('    Promise rejection handled correctly')
    }
    
    console.log(`🔍 Memory validation ${success ? 'PASSED' : 'FAILED'}`)
    return success
    
  } catch (error) {
    console.error('❌ Validation test failed:', error)
    return false
  }
}

/**
 * Simple memory leak detection for development
 */
export function detectMemoryLeaks(): void {
  const memoryManager = getMemoryManager()
  
  // Add a listener for high resource counts
  const checkResources = () => {
    const stats = memoryManager.getMemoryStats()
    
    if (stats.activeResources > 20) {
      console.warn(`⚠️ High resource count detected: ${stats.activeResources}`)
      console.log('Resource breakdown:', stats.resourcesByType)
    }
    
    const memoryHealth = performanceMonitor.getMemoryHealth()
    if (!memoryHealth.isHealthy) {
      console.warn('⚠️ Memory health issues detected:', memoryHealth.warnings)
    }
  }
  
  // Check every 30 seconds in development
  if (import.meta.env.DEV) {
    setInterval(checkResources, 30000)
    console.log('🔍 Memory leak detection enabled (30s intervals)')
  }
}

/**
 * Emergency cleanup for development debugging
 */
export async function emergencyCleanup(): Promise<void> {
  console.log('🚨 Emergency cleanup initiated')
  
  const memoryManager = getMemoryManager()
  
  // Clean all resource types
  const abortControllers = memoryManager.cleanupResourcesByType('abort-controller')
  const timers = memoryManager.cleanupResourcesByType('timer')
  const subscriptions = memoryManager.cleanupResourcesByType('subscription')
  
  console.log(`Cleaned up: ${abortControllers} controllers, ${timers} timers, ${subscriptions} subscriptions`)
  
  // Trigger all cleanup tasks
  await memoryManager.triggerCleanup('high')
  
  // Force garbage collection if available
  if ((window as any).gc) {
    (window as any).gc()
    console.log('🗑️ Forced garbage collection')
  }
  
  const stats = memoryManager.getMemoryStats()
  console.log(`Remaining active resources: ${stats.activeResources}`)
}