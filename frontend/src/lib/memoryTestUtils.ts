/**
 * Memory Leak Detection and Testing Utilities
 * 
 * This module provides utilities for detecting memory leaks, measuring performance,
 * and validating memory management in the chat application.
 */

interface MemorySnapshot {
  timestamp: number
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

interface MemoryTestConfig {
  maxMemoryGrowth: number // Maximum acceptable memory growth in MB
  testDuration: number // Test duration in milliseconds
  samplingInterval: number // How often to sample memory in milliseconds
  warmupIterations: number // Number of warmup iterations before testing
}

const DEFAULT_TEST_CONFIG: MemoryTestConfig = {
  maxMemoryGrowth: 50, // 50MB max growth
  testDuration: 30000, // 30 seconds
  samplingInterval: 1000, // 1 second
  warmupIterations: 3
}

/**
 * Takes a snapshot of current memory usage
 */
export function takeMemorySnapshot(): MemorySnapshot {
  const memory = (performance as any).memory
  
  if (!memory) {
    console.warn('Performance.memory API not available in this browser')
    return {
      timestamp: Date.now(),
      usedJSHeapSize: 0,
      totalJSHeapSize: 0,
      jsHeapSizeLimit: 0
    }
  }

  return {
    timestamp: Date.now(),
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit
  }
}

/**
 * Converts bytes to MB
 */
export function bytesToMB(bytes: number): number {
  return bytes / (1024 * 1024)
}

/**
 * Forces garbage collection if available (Chrome DevTools)
 */
export function forceGarbageCollection(): void {
  if ((window as any).gc) {
    (window as any).gc()
    console.log('🗑️ Forced garbage collection')
  } else {
    console.warn('Garbage collection not available. Run with --enable-precise-memory-info and --enable-gc-logging')
  }
}

/**
 * Memory leak test for tool execution pipeline
 */
export class MemoryLeakTester {
  private snapshots: MemorySnapshot[] = []
  private isRunning = false
  private intervalId?: NodeJS.Timeout

  constructor(private config: MemoryTestConfig = DEFAULT_TEST_CONFIG) {}

  /**
   * Starts memory monitoring
   */
  startMonitoring(): void {
    if (this.isRunning) {
      console.warn('Memory monitoring already running')
      return
    }

    console.log('🔍 Starting memory leak monitoring...')
    this.isRunning = true
    this.snapshots = []

    this.intervalId = setInterval(() => {
      const snapshot = takeMemorySnapshot()
      this.snapshots.push(snapshot)
      
      console.log(`📊 Memory: ${bytesToMB(snapshot.usedJSHeapSize).toFixed(2)}MB used, ${bytesToMB(snapshot.totalJSHeapSize).toFixed(2)}MB total`)
    }, this.config.samplingInterval)
  }

  /**
   * Stops memory monitoring and returns analysis
   */
  stopMonitoring(): MemoryTestResult {
    if (!this.isRunning) {
      console.warn('Memory monitoring not running')
      return this.createEmptyResult()
    }

    console.log('🛑 Stopping memory monitoring...')
    this.isRunning = false
    
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }

    return this.analyzeSnapshots()
  }

  /**
   * Runs a complete memory leak test with the given operation
   */
  async runMemoryTest(
    operation: () => Promise<void>,
    testName: string = 'Memory Test'
  ): Promise<MemoryTestResult> {
    console.log(`🧪 Starting ${testName}...`)

    // Warmup iterations
    console.log('🔥 Running warmup iterations...')
    for (let i = 0; i < this.config.warmupIterations; i++) {
      await operation()
      forceGarbageCollection()
      await this.sleep(500)
    }

    // Take baseline measurement
    forceGarbageCollection()
    await this.sleep(1000)
    const baselineSnapshot = takeMemorySnapshot()
    console.log(`📈 Baseline: ${bytesToMB(baselineSnapshot.usedJSHeapSize).toFixed(2)}MB`)

    // Start monitoring
    this.startMonitoring()

    // Run test for specified duration
    const startTime = Date.now()
    let iterationCount = 0
    
    try {
      while (Date.now() - startTime < this.config.testDuration) {
        await operation()
        iterationCount++
        
        // Small delay between operations
        await this.sleep(100)
      }
    } catch (error) {
      console.error(`❌ Test failed during iteration ${iterationCount}:`, error)
    }

    // Stop monitoring and get results
    const result = this.stopMonitoring()
    result.testName = testName
    result.iterationCount = iterationCount
    result.baselineMemory = bytesToMB(baselineSnapshot.usedJSHeapSize)

    // Force GC and take final measurement
    forceGarbageCollection()
    await this.sleep(1000)
    const finalSnapshot = takeMemorySnapshot()
    result.finalMemory = bytesToMB(finalSnapshot.usedJSHeapSize)
    result.memoryGrowth = result.finalMemory - result.baselineMemory

    console.log(`📊 Test Results for ${testName}:`)
    console.log(`   - Iterations: ${iterationCount}`)
    console.log(`   - Baseline Memory: ${result.baselineMemory.toFixed(2)}MB`)
    console.log(`   - Final Memory: ${result.finalMemory.toFixed(2)}MB`)
    console.log(`   - Memory Growth: ${result.memoryGrowth.toFixed(2)}MB`)
    console.log(`   - Peak Memory: ${result.peakMemory.toFixed(2)}MB`)
    console.log(`   - Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`)

    return result
  }

  private analyzeSnapshots(): MemoryTestResult {
    if (this.snapshots.length === 0) {
      return this.createEmptyResult()
    }

    const memoryValues = this.snapshots.map(s => bytesToMB(s.usedJSHeapSize))
    const peakMemory = Math.max(...memoryValues)
    const averageMemory = memoryValues.reduce((sum, val) => sum + val, 0) / memoryValues.length

    // Calculate trend (memory growth rate)
    const trend = this.calculateMemoryTrend()

    const result: MemoryTestResult = {
      testName: 'Unknown Test',
      snapshots: this.snapshots,
      peakMemory,
      averageMemory,
      memoryGrowthRate: trend,
      iterationCount: 0,
      baselineMemory: 0,
      finalMemory: 0,
      memoryGrowth: 0,
      passed: Math.abs(trend) < this.config.maxMemoryGrowth,
      issues: []
    }

    // Detect potential issues
    if (trend > this.config.maxMemoryGrowth) {
      result.issues.push(`High memory growth rate: ${trend.toFixed(2)}MB over test period`)
    }

    if (peakMemory > 500) { // 500MB threshold
      result.issues.push(`High peak memory usage: ${peakMemory.toFixed(2)}MB`)
    }

    return result
  }

  private calculateMemoryTrend(): number {
    if (this.snapshots.length < 2) return 0

    const first = bytesToMB(this.snapshots[0].usedJSHeapSize)
    const last = bytesToMB(this.snapshots[this.snapshots.length - 1].usedJSHeapSize)
    
    return last - first
  }

  private createEmptyResult(): MemoryTestResult {
    return {
      testName: 'Empty Test',
      snapshots: [],
      peakMemory: 0,
      averageMemory: 0,
      memoryGrowthRate: 0,
      iterationCount: 0,
      baselineMemory: 0,
      finalMemory: 0,
      memoryGrowth: 0,
      passed: false,
      issues: ['No data collected']
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export interface MemoryTestResult {
  testName: string
  snapshots: MemorySnapshot[]
  peakMemory: number
  averageMemory: number
  memoryGrowthRate: number
  iterationCount: number
  baselineMemory: number
  finalMemory: number
  memoryGrowth: number
  passed: boolean
  issues: string[]
}

/**
 * Creates a mock tool execution for memory testing
 */
export function createMockToolExecution(
  toolCount: number = 3,
  delay: number = 100
): () => Promise<void> {
  return async () => {
    // Simulate tool execution with data structures similar to real usage
    const mockTools = Array.from({ length: toolCount }, (_, i) => ({
      id: `tool_${i}_${Date.now()}`,
      name: `mockTool${i}`,
      parameters: { query: `test query ${i}`, limit: 10 },
      status: 'pending' as const,
      result: null
    }))

    // Simulate async operations and memory allocation
    for (const tool of mockTools) {
      tool.status = 'running' as any
      
      // Simulate API response with large data structures
      const mockResponse = {
        success: true,
        result: {
          content: Array.from({ length: 100 }, (_, i) => `Mock content item ${i}`),
          metadata: { timestamp: Date.now(), processed: true },
          structuredContent: {
            items: Array.from({ length: 50 }, (_, i) => ({
              id: i,
              data: `Mock structured data ${i}`,
              nested: { value: Math.random() }
            }))
          }
        }
      }
      
      tool.result = mockResponse
      tool.status = 'completed' as any
      
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    // Clean up references (this should prevent memory leaks)
    mockTools.length = 0
  }
}

/**
 * Simulates component mount/unmount cycles for testing
 */
export function createMountUnmountTest(): () => Promise<void> {
  return async () => {
    // Simulate component state
    const componentState = {
      messages: Array.from({ length: 20 }, (_, i) => ({
        id: `msg_${i}`,
        content: `Test message ${i}`,
        timestamp: Date.now(),
        toolCalls: []
      })),
      abortControllers: new Set<AbortController>(),
      timers: new Set<number>(),
      subscriptions: new Map<string, () => void>()
    }

    // Simulate adding abort controllers
    for (let i = 0; i < 5; i++) {
      const controller = new AbortController()
      componentState.abortControllers.add(controller)
    }

    // Simulate adding timers
    for (let i = 0; i < 3; i++) {
      const timerId = window.setTimeout(() => {}, 1000) as any
      componentState.timers.add(timerId)
    }

    // Simulate cleanup (what should happen on unmount)
    componentState.abortControllers.forEach(controller => {
      controller.abort()
    })
    componentState.abortControllers.clear()

    componentState.timers.forEach(timerId => {
      clearTimeout(timerId)
    })
    componentState.timers.clear()

    componentState.subscriptions.forEach(cleanup => cleanup())
    componentState.subscriptions.clear()

    componentState.messages.length = 0
  }
}