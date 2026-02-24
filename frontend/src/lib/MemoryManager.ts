/**
 * Advanced Memory Management System
 * 
 * This module provides comprehensive memory management utilities including:
 * - WeakMap-based resource tracking for automatic cleanup
 * - Memory pressure detection and response
 * - Resource lifecycle management
 * - Integration with performance monitoring
 */

import { logError } from './errorLogger'
import { devLog, DevLogCategory } from './developmentLogger'

interface ResourceMetadata {
  type: 'abort-controller' | 'timer' | 'subscription' | 'promise' | 'dom-ref'
  created: number
  description?: string
  size?: number
}

interface MemoryPressureListener {
  threshold: number // Memory usage percentage (0-1)
  callback: (usage: number) => void
}

interface CleanupTask {
  priority: 'low' | 'medium' | 'high'
  execute: () => void | Promise<void>
  description: string
}

// Declare timer types for browser compatibility
declare global {
  interface Window {
    gc?: () => void
  }
}

type TimerHandle = ReturnType<typeof setTimeout>

/**
 * Advanced memory management system using WeakMap for automatic cleanup
 */
export class MemoryManager {
  private static instance: MemoryManager | null = null
  
  // WeakMap for automatic garbage collection of resources
  private resourceMap = new WeakMap<object, ResourceMetadata>()
  private cleanupRegistry = new FinalizationRegistry<string>((description) => {
    devLog.memory('Resource finalized', { description })
  })
  
  // Active resources that need explicit cleanup
  private activeResources = new Map<string, {
    resource: object
    cleanup: () => void
    metadata: ResourceMetadata
  }>()
  
  // Memory pressure detection
  private memoryPressureListeners: MemoryPressureListener[] = []
  private memoryCheckInterval?: TimerHandle
  private lastMemoryUsage = 0
  private memoryGrowthRate = 0
  
  // Cleanup task queue
  private cleanupTasks: CleanupTask[] = []
  
  // Configuration
  private readonly config = {
    memoryCheckInterval: 5000, // 5 seconds
    memoryPressureThreshold: 0.8, // 80% memory usage
    growthRateThreshold: 50, // 50MB growth
    maxActiveResources: 100
  }

  private constructor() {
    this.startMemoryMonitoring()
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MemoryManager {
    if (!MemoryManager.instance) {
      MemoryManager.instance = new MemoryManager()
    }
    return MemoryManager.instance
  }

  /**
   * Register a resource for tracking
   */
  registerResource<T extends object>(
    resource: T,
    metadata: ResourceMetadata,
    cleanup?: () => void
  ): T {
    try {
      // Store in WeakMap for automatic cleanup
      this.resourceMap.set(resource, metadata)
      
      // Register for finalization callback
      this.cleanupRegistry.register(
        resource,
        metadata.description || `${metadata.type} resource`,
        resource
      )
      
      // If cleanup function provided, store in active resources
      if (cleanup) {
        const id = `${metadata.type}_${Date.now()}_${Math.random()}`
        this.activeResources.set(id, { resource, cleanup, metadata })
        
        // Check resource limits
        if (this.activeResources.size > this.config.maxActiveResources) {
          this.triggerCleanup('low')
        }
      }
      
      return resource
    } catch (error) {
      logError('Failed to register resource', error as Error)
      return resource
    }
  }

  /**
   * Register an AbortController with automatic cleanup
   */
  registerAbortController(controller: AbortController, description?: string): AbortController {
    return this.registerResource(
      controller,
      {
        type: 'abort-controller',
        created: Date.now(),
        description: description || 'AbortController'
      },
      () => {
        if (!controller.signal.aborted) {
          controller.abort()
        }
      }
    )
  }

  /**
   * Register a timer with automatic cleanup
   */
  registerTimer(
    timerId: TimerHandle,
    type: 'timeout' | 'interval',
    description?: string
  ): void {
    const timerObj = { id: timerId }
    this.registerResource(
      timerObj,
      {
        type: 'timer',
        created: Date.now(),
        description: description || `${type} timer`
      },
      () => {
        if (type === 'timeout') {
          clearTimeout(timerId)
        } else {
          clearInterval(timerId)
        }
      }
    )
  }

  /**
   * Register a Promise with rejection tracking
   */
  async trackPromise<T>(
    promise: Promise<T>,
    description?: string,
    abortSignal?: AbortSignal
  ): Promise<T> {
    const promiseWrapper = { promise, resolved: false }
    
    this.registerResource(
      promiseWrapper,
      {
        type: 'promise',
        created: Date.now(),
        description: description || 'Tracked promise'
      }
    )
    
    try {
      const result = await promise
      promiseWrapper.resolved = true
      return result
    } catch (error) {
      if (!abortSignal?.aborted) {
        logError(`Promise rejected: ${description}`, error)
      }
      throw error
    } finally {
      // Cleanup tracking
      promiseWrapper.resolved = true
    }
  }

  /**
   * Unregister a resource and run its cleanup
   */
  unregisterResource(resource: object): void {
    // Find and cleanup from active resources
    for (const [id, entry] of this.activeResources.entries()) {
      if (entry.resource === resource) {
        try {
          entry.cleanup()
        } catch (error) {
          logError('Error during resource cleanup', error as Error)
        }
        this.activeResources.delete(id)
        break
      }
    }
    
    // Unregister from finalization registry
    this.cleanupRegistry.unregister(resource)
  }

  /**
   * Clean up all resources of a specific type
   */
  cleanupResourcesByType(type: ResourceMetadata['type']): number {
    let cleanedCount = 0
    
    for (const [id, entry] of this.activeResources.entries()) {
      if (entry.metadata.type === type) {
        try {
          entry.cleanup()
          this.activeResources.delete(id)
          cleanedCount++
        } catch (error) {
          logError(`Error cleaning up ${type} resource`, error as Error)
        }
      }
    }
    
    devLog.memory('Cleaned up resources by type', {
      type,
      cleanedCount
    })
    return cleanedCount
  }

  /**
   * Clean up old resources based on age
   */
  cleanupOldResources(maxAgeMs: number): number {
    const now = Date.now()
    let cleanedCount = 0
    
    for (const [id, entry] of this.activeResources.entries()) {
      if (now - entry.metadata.created > maxAgeMs) {
        try {
          entry.cleanup()
          this.activeResources.delete(id)
          cleanedCount++
        } catch (error) {
          logError('Error cleaning up old resource', error as Error)
        }
      }
    }
    
    devLog.memory('Cleaned up old resources', { cleanedCount })
    return cleanedCount
  }

  /**
   * Register a cleanup task
   */
  registerCleanupTask(task: CleanupTask): void {
    this.cleanupTasks.push(task)
    this.cleanupTasks.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })
  }

  /**
   * Trigger cleanup based on priority
   */
  async triggerCleanup(minPriority: 'low' | 'medium' | 'high' = 'low'): Promise<void> {
    const priorityOrder = { high: 0, medium: 1, low: 2 }
    const minPriorityValue = priorityOrder[minPriority]
    
    devLog.memory('Triggering cleanup', { minPriority })
    
    for (const task of this.cleanupTasks) {
      if (priorityOrder[task.priority] <= minPriorityValue) {
        try {
          await task.execute()
          devLog.memory('Executed cleanup task', {
            description: task.description
          })
        } catch (error) {
          logError(`Failed cleanup task: ${task.description}`, error as Error)
        }
      }
    }
    
    // Clean up old resources (older than 5 minutes)
    this.cleanupOldResources(5 * 60 * 1000)
  }

  /**
   * Start memory monitoring
   */
  private startMemoryMonitoring(): void {
    if (this.memoryCheckInterval) return
    
    this.memoryCheckInterval = setInterval(() => {
      this.checkMemoryPressure()
    }, this.config.memoryCheckInterval)
  }

  /**
   * Check memory pressure and trigger cleanup if needed
   */
  private checkMemoryPressure(): void {
    const memory = (performance as any).memory
    
    if (!memory) return
    
    const usedMemory = memory.usedJSHeapSize
    const totalMemory = memory.jsHeapSizeLimit
    const usage = usedMemory / totalMemory
    
    // Calculate growth rate
    const memoryMB = usedMemory / (1024 * 1024)
    const growth = memoryMB - this.lastMemoryUsage
    this.memoryGrowthRate = growth
    this.lastMemoryUsage = memoryMB
    
    // Check thresholds
    if (usage > this.config.memoryPressureThreshold) {
      devLog.warn(DevLogCategory.MEMORY, 'High memory pressure detected', {
        usagePercent: (usage * 100).toFixed(1)
      })
      this.handleMemoryPressure(usage)
    }
    
    if (growth > this.config.growthRateThreshold) {
      devLog.warn(DevLogCategory.MEMORY, 'High memory growth detected', {
        growthMB: growth.toFixed(1)
      })
      this.triggerCleanup('medium')
    }
    
    // Notify listeners
    for (const listener of this.memoryPressureListeners) {
      if (usage >= listener.threshold) {
        listener.callback(usage)
      }
    }
  }

  /**
   * Handle memory pressure
   */
  private async handleMemoryPressure(usage: number): Promise<void> {
    devLog.memory('Handling memory pressure', {
      usagePercent: (usage * 100).toFixed(1)
    })
    
    // Progressive cleanup based on pressure level
    if (usage > 0.95) {
      // Critical: Clean everything
      await this.emergencyCleanup()
    } else if (usage > 0.9) {
      // High: Clean all low and medium priority
      await this.triggerCleanup('medium')
      this.cleanupResourcesByType('timer')
    } else if (usage > 0.8) {
      // Moderate: Clean low priority
      await this.triggerCleanup('low')
      this.cleanupOldResources(60 * 1000) // Clean resources older than 1 minute
    }
    
    // Force garbage collection if available
    if ((window as any).gc) {
      (window as any).gc()
      devLog.memory('Forced garbage collection')
    }
  }

  /**
   * Emergency cleanup - clean everything possible
   */
  private async emergencyCleanup(): Promise<void> {
    devLog.memory('EMERGENCY CLEANUP INITIATED')
    
    // Clean all active resources
    const totalResources = this.activeResources.size
    for (const [id, entry] of this.activeResources.entries()) {
      try {
        entry.cleanup()
        this.activeResources.delete(id)
      } catch (error) {
        logError('Emergency cleanup error', error as Error)
      }
    }
    
    // Execute all cleanup tasks
    for (const task of this.cleanupTasks) {
      try {
        await task.execute()
      } catch (error) {
        logError(`Emergency cleanup task failed: ${task.description}`, error as Error)
      }
    }
    
    devLog.memory('Emergency cleanup completed', {
      resourcesFreed: totalResources
    })
  }

  /**
   * Add memory pressure listener
   */
  addMemoryPressureListener(threshold: number, callback: (usage: number) => void): void {
    this.memoryPressureListeners.push({ threshold, callback })
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): {
    activeResources: number
    memoryUsage: number
    memoryGrowthRate: number
    resourcesByType: Record<string, number>
  } {
    const memory = (performance as any).memory
    const memoryUsage = memory ? memory.usedJSHeapSize / memory.jsHeapSizeLimit : 0
    
    // Count resources by type
    const resourcesByType: Record<string, number> = {}
    for (const [, entry] of this.activeResources.entries()) {
      const type = entry.metadata.type
      resourcesByType[type] = (resourcesByType[type] || 0) + 1
    }
    
    return {
      activeResources: this.activeResources.size,
      memoryUsage,
      memoryGrowthRate: this.memoryGrowthRate,
      resourcesByType
    }
  }

  /**
   * Destroy the memory manager
   */
  destroy(): void {
    // Clear monitoring interval
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval)
      this.memoryCheckInterval = undefined
    }
    
    // Clean all resources
    for (const [id, entry] of this.activeResources.entries()) {
      try {
        entry.cleanup()
      } catch (error) {
        logError('Error during destroy cleanup', error as Error)
      }
    }
    this.activeResources.clear()
    
    // Clear listeners
    this.memoryPressureListeners = []
    this.cleanupTasks = []
    
    devLog.memory('Memory manager destroyed')
  }
}

// Export singleton instance getter
export const getMemoryManager = () => MemoryManager.getInstance()

// Utility function for tracking promises with memory management
export async function trackAsyncOperation<T>(
  operation: () => Promise<T>,
  description: string,
  abortSignal?: AbortSignal
): Promise<T> {
  const manager = getMemoryManager()
  return manager.trackPromise(operation(), description, abortSignal)
}

// Utility function for creating managed AbortController
export function createManagedAbortController(description?: string): AbortController {
  const manager = getMemoryManager()
  const controller = new AbortController()
  return manager.registerAbortController(controller, description)
}

// Utility function for creating managed timer
export function createManagedTimeout(
  callback: () => void,
  delay: number,
  description?: string
): TimerHandle {
  const manager = getMemoryManager()
  const timerId = setTimeout(callback, delay)
  manager.registerTimer(timerId, 'timeout', description)
  return timerId
}

// Utility function for creating managed interval
export function createManagedInterval(
  callback: () => void,
  delay: number,
  description?: string
): TimerHandle {
  const manager = getMemoryManager()
  const timerId = setInterval(callback, delay)
  manager.registerTimer(timerId, 'interval', description)
  return timerId
}