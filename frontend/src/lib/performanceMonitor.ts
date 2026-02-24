/**
 * Production Performance Monitoring Utilities
 * 
 * This module provides lightweight performance monitoring for the chat application
 * that can be used in production to track memory health and performance metrics.
 * Integrated with MemoryManager for comprehensive resource tracking.
 */

import { getMemoryManager } from './MemoryManager'

interface PerformanceMetric {
  name: string
  value: number
  timestamp: number
  unit: string
}

interface MemoryHealth {
  usedMemoryMB: number
  totalMemoryMB: number
  memoryUsagePercent: number
  memoryGrowthRate: number
  activeResources: number
  resourcesByType: Record<string, number>
  isHealthy: boolean
  warnings: string[]
}

interface ToolExecutionMetrics {
  duration: number
  toolCount: number
  retryCount: number
  cacheHitRate: number
  memoryBefore: number
  memoryAfter: number
  success: boolean
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor
  private metrics: PerformanceMetric[] = []
  private maxMetrics = 1000 // Keep last 1000 metrics
  private isEnabled = true
  
  // Memory thresholds
  private readonly MEMORY_WARNING_THRESHOLD = 100 // 100MB
  private readonly MEMORY_CRITICAL_THRESHOLD = 200 // 200MB
  
  // Performance thresholds
  private readonly TOOL_EXECUTION_WARNING_MS = 5000 // 5 seconds
  private readonly TOOL_EXECUTION_CRITICAL_MS = 15000 // 15 seconds

  private constructor() {}

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor()
    }
    return PerformanceMonitor.instance
  }

  /**
   * Enable or disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled
    if (enabled) {
      console.log('📊 Performance monitoring enabled')
    } else {
      console.log('📊 Performance monitoring disabled')
    }
  }

  /**
   * Record a performance metric
   */
  recordMetric(name: string, value: number, unit: string = 'ms'): void {
    if (!this.isEnabled) return

    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      unit
    }

    this.metrics.push(metric)

    // Keep only recent metrics to prevent memory growth
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics)
    }

    // Log warning for slow operations
    if (unit === 'ms' && value > this.TOOL_EXECUTION_WARNING_MS) {
      console.warn(`⚠️ Slow operation detected: ${name} took ${value}ms`)
    }
  }

  /**
   * Get current memory health status with MemoryManager integration
   */
  getMemoryHealth(): MemoryHealth {
    const memory = (performance as any).memory
    const warnings: string[] = []
    
    // Get memory manager stats
    const memoryManager = getMemoryManager()
    const memoryStats = memoryManager.getMemoryStats()
    
    if (!memory) {
      return {
        usedMemoryMB: 0,
        totalMemoryMB: 0,
        memoryUsagePercent: 0,
        memoryGrowthRate: memoryStats.memoryGrowthRate,
        activeResources: memoryStats.activeResources,
        resourcesByType: memoryStats.resourcesByType,
        isHealthy: true,
        warnings: ['Memory API not available']
      }
    }

    const usedMemoryMB = memory.usedJSHeapSize / (1024 * 1024)
    const totalMemoryMB = memory.totalJSHeapSize / (1024 * 1024)
    const memoryUsagePercent = memoryStats.memoryUsage * 100

    // Check memory thresholds
    if (usedMemoryMB > this.MEMORY_CRITICAL_THRESHOLD) {
      warnings.push(`Critical memory usage: ${usedMemoryMB.toFixed(1)}MB`)
    } else if (usedMemoryMB > this.MEMORY_WARNING_THRESHOLD) {
      warnings.push(`High memory usage: ${usedMemoryMB.toFixed(1)}MB`)
    }
    
    // Check resource thresholds
    if (memoryStats.activeResources > 50) {
      warnings.push(`High active resource count: ${memoryStats.activeResources}`)
    }
    
    // Check memory growth rate
    if (memoryStats.memoryGrowthRate > 20) {
      warnings.push(`High memory growth rate: ${memoryStats.memoryGrowthRate.toFixed(1)}MB`)
    }
    
    // Check for resource type imbalances
    const abortControllers = memoryStats.resourcesByType['abort-controller'] || 0
    const timers = memoryStats.resourcesByType['timer'] || 0
    if (abortControllers > 10) {
      warnings.push(`High AbortController count: ${abortControllers}`)
    }
    if (timers > 20) {
      warnings.push(`High timer count: ${timers}`)
    }

    const isHealthy = warnings.length === 0

    return {
      usedMemoryMB,
      totalMemoryMB,
      memoryUsagePercent,
      memoryGrowthRate: memoryStats.memoryGrowthRate,
      activeResources: memoryStats.activeResources,
      resourcesByType: memoryStats.resourcesByType,
      isHealthy,
      warnings
    }
  }

  /**
   * Start monitoring a tool execution session
   */
  startToolExecution(): ToolExecutionMonitor {
    return new ToolExecutionMonitor(this)
  }

  /**
   * Get performance summary for the last period
   */
  getPerformanceSummary(periodMs: number = 300000): PerformanceSummary {
    const now = Date.now()
    const cutoff = now - periodMs
    const recentMetrics = this.metrics.filter(m => m.timestamp > cutoff)

    const toolExecutions = recentMetrics.filter(m => m.name === 'tool_execution')
    const memoryHealth = this.getMemoryHealth()

    const avgToolExecutionTime = toolExecutions.length > 0
      ? toolExecutions.reduce((sum, m) => sum + m.value, 0) / toolExecutions.length
      : 0

    const slowOperations = recentMetrics.filter(m => 
      m.unit === 'ms' && m.value > this.TOOL_EXECUTION_WARNING_MS
    ).length

    return {
      periodMs,
      totalOperations: recentMetrics.length,
      avgToolExecutionTime,
      slowOperations,
      memoryHealth,
      timestamp: now
    }
  }

  /**
   * Log a formatted performance report with memory management details
   */
  logPerformanceReport(): void {
    if (!this.isEnabled) return

    const summary = this.getPerformanceSummary()
    const memoryHealth = summary.memoryHealth
    
    console.group('📊 Performance Report (Last 5 minutes)')
    console.log(`Total Operations: ${summary.totalOperations}`)
    console.log(`Avg Tool Execution: ${summary.avgToolExecutionTime.toFixed(1)}ms`)
    console.log(`Slow Operations: ${summary.slowOperations}`)
    console.log(`Memory: ${memoryHealth.usedMemoryMB.toFixed(1)}MB (${memoryHealth.memoryUsagePercent.toFixed(1)}%)`)
    console.log(`Memory Growth Rate: ${memoryHealth.memoryGrowthRate.toFixed(1)}MB`)
    console.log(`Active Resources: ${memoryHealth.activeResources}`)
    
    // Resource breakdown
    if (memoryHealth.activeResources > 0) {
      console.group('Resource Breakdown:')
      for (const [type, count] of Object.entries(memoryHealth.resourcesByType)) {
        if (count > 0) {
          console.log(`  ${type}: ${count}`)
        }
      }
      console.groupEnd()
    }
    
    if (memoryHealth.warnings.length > 0) {
      console.warn('⚠️ Memory Warnings:', memoryHealth.warnings)
    }
    
    console.groupEnd()
    
    // Trigger cleanup if needed
    if (!memoryHealth.isHealthy) {
      console.log('🧹 Triggering automatic cleanup due to memory issues')
      const memoryManager = getMemoryManager()
      memoryManager.triggerCleanup('medium').catch(error => {
        console.error('Failed to trigger cleanup:', error)
      })
    }
  }

  /**
   * Auto-start periodic monitoring with memory management integration
   */
  startPeriodicMonitoring(intervalMs: number = 300000): void {
    if (!this.isEnabled) return

    console.log(`📊 Starting periodic performance monitoring (every ${intervalMs/1000}s)`)
    
    const intervalId = setInterval(() => {
      this.logPerformanceReport()
    }, intervalMs)
    
    // Register interval with memory manager for cleanup
    const memoryManager = getMemoryManager()
    memoryManager.registerTimer(intervalId, 'interval', 'Performance monitoring interval')
    
    // Set up memory pressure monitoring
    memoryManager.addMemoryPressureListener(0.8, (usage) => {
      console.warn(`🚨 High memory pressure detected: ${(usage * 100).toFixed(1)}%`)
      this.recordMetric('memory_pressure', usage * 100, 'percent')
      
      // Log immediate performance report on memory pressure
      this.logPerformanceReport()
    })
  }
}

/**
 * Tool execution monitor for tracking individual tool sessions
 */
class ToolExecutionMonitor {
  private startTime: number
  private startMemory: number
  private toolCount: number = 0
  private retryCount: number = 0
  private cacheHits: number = 0
  private cacheMisses: number = 0

  constructor(private monitor: PerformanceMonitor) {
    this.startTime = performance.now()
    
    const memory = (performance as any).memory
    this.startMemory = memory ? memory.usedJSHeapSize / (1024 * 1024) : 0
  }

  /**
   * Record a tool execution
   */
  recordToolExecution(toolName: string, duration: number, success: boolean): void {
    this.toolCount++
    this.monitor.recordMetric(`tool_${toolName}`, duration, 'ms')
  }

  /**
   * Record a retry attempt
   */
  recordRetry(): void {
    this.retryCount++
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit(hit: boolean): void {
    if (hit) {
      this.cacheHits++
    } else {
      this.cacheMisses++
    }
  }

  /**
   * Finish the tool execution session and record metrics with memory management stats
   */
  finish(success: boolean): ToolExecutionMetrics {
    const endTime = performance.now()
    const duration = endTime - this.startTime
    
    const memory = (performance as any).memory
    const endMemory = memory ? memory.usedJSHeapSize / (1024 * 1024) : 0
    
    const cacheHitRate = (this.cacheHits + this.cacheMisses) > 0 
      ? this.cacheHits / (this.cacheHits + this.cacheMisses) 
      : 0

    const metrics: ToolExecutionMetrics = {
      duration,
      toolCount: this.toolCount,
      retryCount: this.retryCount,
      cacheHitRate,
      memoryBefore: this.startMemory,
      memoryAfter: endMemory,
      success
    }

    // Record the overall execution
    this.monitor.recordMetric('tool_execution', duration, 'ms')
    this.monitor.recordMetric('tool_count', this.toolCount, 'count')
    this.monitor.recordMetric('retry_count', this.retryCount, 'count')
    this.monitor.recordMetric('cache_hit_rate', cacheHitRate * 100, 'percent')
    this.monitor.recordMetric('memory_growth', endMemory - this.startMemory, 'MB')
    
    // Get memory manager stats
    const memoryManager = getMemoryManager()
    const memoryStats = memoryManager.getMemoryStats()
    this.monitor.recordMetric('active_resources', memoryStats.activeResources, 'count')
    
    // Log warning for significant memory growth
    const memoryGrowth = endMemory - this.startMemory
    if (memoryGrowth > 10) { // More than 10MB growth
      console.warn(`⚠️ Significant memory growth during tool execution: ${memoryGrowth.toFixed(1)}MB`)
    }
    
    // Trigger cleanup if too many resources
    if (memoryStats.activeResources > 50) {
      console.log('🧹 Triggering cleanup due to high resource count')
      memoryManager.triggerCleanup('low').catch(error => {
        console.error('Failed to trigger resource cleanup:', error)
      })
    }

    return metrics
  }
}

interface PerformanceSummary {
  periodMs: number
  totalOperations: number
  avgToolExecutionTime: number
  slowOperations: number
  memoryHealth: MemoryHealth
  timestamp: number
}

// Singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance()

/**
 * Conditional logger that only logs in development
 */
export function devLog(message: string, ...args: any[]): void {
  if (import.meta.env.DEV) {
    console.log(`📊 [Performance] ${message}`, ...args)
  }
}

/**
 * React hook for monitoring component performance
 */
export function usePerformanceMonitor(componentName: string) {
  const startTime = performance.now()

  return {
    recordOperation: (operationName: string, duration: number) => {
      performanceMonitor.recordMetric(`${componentName}_${operationName}`, duration, 'ms')
    },
    
    finish: () => {
      const duration = performance.now() - startTime
      performanceMonitor.recordMetric(`${componentName}_render`, duration, 'ms')
    }
  }
}

/**
 * Decorator for monitoring function performance
 */
export function monitored(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value

  descriptor.value = async function (...args: any[]) {
    const startTime = performance.now()
    
    try {
      const result = await method.apply(this, args)
      const duration = performance.now() - startTime
      
      performanceMonitor.recordMetric(propertyName, duration, 'ms')
      devLog(`${propertyName} completed in ${duration.toFixed(1)}ms`)
      
      return result
    } catch (error) {
      const duration = performance.now() - startTime
      performanceMonitor.recordMetric(`${propertyName}_error`, duration, 'ms')
      throw error
    }
  }

  return descriptor
}

// Initialize in development
if (import.meta.env.DEV) {
  performanceMonitor.setEnabled(true)
  performanceMonitor.startPeriodicMonitoring()
  
  // Make available in console for debugging
  ;(window as any).performanceMonitor = performanceMonitor
}