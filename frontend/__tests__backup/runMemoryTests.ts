/**
 * Memory Test Runner Script
 * 
 * This script runs comprehensive memory tests to validate that the
 * memory leak fixes are working correctly.
 */

import { 
  MemoryLeakTester, 
  createMockToolExecution, 
  createMountUnmountTest,
  takeMemorySnapshot,
  bytesToMB 
} from '../lib/memoryTestUtils'

import { performanceMonitor } from '../lib/performanceMonitor'

interface TestSuite {
  name: string
  tests: TestCase[]
}

interface TestCase {
  name: string
  operation: () => Promise<void>
  config?: Partial<{
    maxMemoryGrowth: number
    testDuration: number
    samplingInterval: number
    warmupIterations: number
  }>
}

const TEST_SUITES: TestSuite[] = [
  {
    name: 'Core Memory Management',
    tests: [
      {
        name: 'Tool Execution Memory Test',
        operation: createMockToolExecution(3, 100),
        config: { maxMemoryGrowth: 10, testDuration: 10000 }
      },
      {
        name: 'Mount/Unmount Memory Test', 
        operation: createMountUnmountTest(),
        config: { maxMemoryGrowth: 5, testDuration: 5000 }
      },
      {
        name: 'High Volume Tool Execution',
        operation: createMockToolExecution(10, 50),
        config: { maxMemoryGrowth: 20, testDuration: 15000 }
      }
    ]
  },
  {
    name: 'AbortController Management',
    tests: [
      {
        name: 'AbortController Lifecycle',
        operation: async () => {
          const controllers: AbortController[] = []
          
          // Create and abort multiple controllers
          for (let i = 0; i < 20; i++) {
            const controller = new AbortController()
            controllers.push(controller)
            
            setTimeout(() => controller.abort(), Math.random() * 100)
          }
          
          // Wait for all to be aborted
          await new Promise(resolve => setTimeout(resolve, 200))
          
          // Clean up
          controllers.length = 0
        },
        config: { maxMemoryGrowth: 3, testDuration: 5000 }
      }
    ]
  },
  {
    name: 'Cache Memory Management',
    tests: [
      {
        name: 'Tool Server Cache',
        operation: async () => {
          // Simulate cache operations
          const cache = new Map<string, any>()
          
          // Add many entries
          for (let i = 0; i < 1000; i++) {
            cache.set(`tool_${i}`, {
              serverId: i % 10,
              data: Array.from({ length: 100 }, (_, j) => `data_${i}_${j}`)
            })
          }
          
          // Access and modify cache
          for (let i = 0; i < 500; i++) {
            const key = `tool_${Math.floor(Math.random() * 1000)}`
            cache.get(key)
            
            if (Math.random() > 0.8) {
              cache.delete(key)
            }
          }
          
          // Clear cache
          cache.clear()
        },
        config: { maxMemoryGrowth: 8, testDuration: 8000 }
      }
    ]
  },
  {
    name: 'Conversation History Management',
    tests: [
      {
        name: 'Large Conversation History',
        operation: async () => {
          // Simulate large conversation
          const messages = []
          
          for (let i = 0; i < 200; i++) {
            messages.push({
              id: `msg_${i}`,
              role: i % 2 === 0 ? 'user' : 'assistant',
              content: `Message ${i} with some longer content that simulates real usage patterns`,
              timestamp: new Date(),
              tool_calls: i % 5 === 0 ? [
                {
                  id: `tool_${i}`,
                  name: 'mockTool',
                  parameters: { query: `Query ${i}` },
                  result: Array.from({ length: 50 }, (_, j) => `result_${i}_${j}`)
                }
              ] : undefined
            })
          }
          
          // Simulate conversation processing
          const processed = messages.slice(-50) // Limit to last 50
          
          // Clean up
          messages.length = 0
          processed.length = 0
        },
        config: { maxMemoryGrowth: 15, testDuration: 10000 }
      }
    ]
  }
]

class MemoryTestRunner {
  private results: Array<{
    suiteName: string
    testName: string
    passed: boolean
    memoryGrowth: number
    duration: number
    issues: string[]
  }> = []

  async runAllTests(): Promise<void> {
    console.log('🧪 Starting comprehensive memory test suite...')
    console.log('================================================')
    
    // Enable performance monitoring
    performanceMonitor.setEnabled(true)
    
    for (const suite of TEST_SUITES) {
      console.log(`\n📁 Running test suite: ${suite.name}`)
      console.log('-'.repeat(40))
      
      for (const test of suite.tests) {
        await this.runSingleTest(suite.name, test)
      }
    }
    
    this.printSummary()
  }

  private async runSingleTest(suiteName: string, test: TestCase): Promise<void> {
    console.log(`🔍 Running: ${test.name}`)
    
    const config = {
      maxMemoryGrowth: 10,
      testDuration: 8000,
      samplingInterval: 500,
      warmupIterations: 2,
      ...test.config
    }
    
    const tester = new MemoryLeakTester(config)
    
    try {
      const result = await tester.runMemoryTest(test.operation, test.name)
      
      this.results.push({
        suiteName,
        testName: test.name,
        passed: result.passed,
        memoryGrowth: result.memoryGrowth,
        duration: result.snapshots.length > 0 
          ? result.snapshots[result.snapshots.length - 1].timestamp - result.snapshots[0].timestamp
          : 0,
        issues: result.issues
      })
      
      const status = result.passed ? '✅ PASSED' : '❌ FAILED'
      console.log(`   ${status} - Memory growth: ${result.memoryGrowth.toFixed(2)}MB`)
      
      if (!result.passed) {
        console.log(`   Issues: ${result.issues.join(', ')}`)
      }
      
    } catch (error) {
      console.error(`   ❌ ERROR: ${error instanceof Error ? error.message : error}`)
      
      this.results.push({
        suiteName,
        testName: test.name,
        passed: false,
        memoryGrowth: -1,
        duration: 0,
        issues: [`Test error: ${error instanceof Error ? error.message : error}`]
      })
    }
  }

  private printSummary(): void {
    console.log('\n📊 TEST SUMMARY')
    console.log('='.repeat(50))
    
    const totalTests = this.results.length
    const passedTests = this.results.filter(r => r.passed).length
    const failedTests = totalTests - passedTests
    
    console.log(`Total Tests: ${totalTests}`)
    console.log(`Passed: ${passedTests} ✅`)
    console.log(`Failed: ${failedTests} ${failedTests > 0 ? '❌' : '✅'}`)
    
    const avgMemoryGrowth = this.results
      .filter(r => r.memoryGrowth >= 0)
      .reduce((sum, r) => sum + r.memoryGrowth, 0) / 
      this.results.filter(r => r.memoryGrowth >= 0).length || 0
    
    console.log(`Average Memory Growth: ${avgMemoryGrowth.toFixed(2)}MB`)
    
    if (failedTests > 0) {
      console.log('\n❌ FAILED TESTS:')
      this.results.filter(r => !r.passed).forEach(result => {
        console.log(`   - ${result.suiteName} > ${result.testName}`)
        console.log(`     Issues: ${result.issues.join(', ')}`)
      })
    }
    
    // Overall assessment
    const overallPassed = failedTests === 0 && avgMemoryGrowth < 20
    
    console.log('\n' + '='.repeat(50))
    if (overallPassed) {
      console.log('🎉 OVERALL RESULT: ALL TESTS PASSED')
      console.log('✅ Memory management is working correctly')
    } else {
      console.log('⚠️  OVERALL RESULT: SOME ISSUES DETECTED')
      console.log('❌ Memory leaks or performance issues found')
    }
    console.log('='.repeat(50))
    
    // Performance report
    console.log('\n📈 Performance Report:')
    performanceMonitor.logPerformanceReport()
  }

  getResults() {
    return this.results
  }
}

/**
 * Quick memory health check
 */
export function quickMemoryCheck(): void {
  console.log('🔍 Quick Memory Health Check')
  console.log('-'.repeat(30))
  
  const snapshot = takeMemorySnapshot()
  const usedMB = bytesToMB(snapshot.usedJSHeapSize)
  const totalMB = bytesToMB(snapshot.totalJSHeapSize)
  const percentage = (usedMB / totalMB) * 100
  
  console.log(`Memory Usage: ${usedMB.toFixed(1)}MB / ${totalMB.toFixed(1)}MB (${percentage.toFixed(1)}%)`)
  
  let status = '✅ Healthy'
  if (usedMB > 200) {
    status = '❌ Critical'
  } else if (usedMB > 100) {
    status = '⚠️ Warning'
  }
  
  console.log(`Status: ${status}`)
  
  const memoryHealth = performanceMonitor.getMemoryHealth()
  if (memoryHealth.warnings.length > 0) {
    console.log('Warnings:', memoryHealth.warnings)
  }
}

/**
 * Run the complete test suite
 */
export async function runMemoryTestSuite(): Promise<Array<any>> {
  const runner = new MemoryTestRunner()
  await runner.runAllTests()
  return runner.getResults()
}

// Make functions available in browser console for manual testing
if (typeof window !== 'undefined') {
  (window as any).runMemoryTestSuite = runMemoryTestSuite
  (window as any).quickMemoryCheck = quickMemoryCheck
  
  console.log('🧪 Memory test utilities loaded')
  console.log('Run quickMemoryCheck() for a quick check')
  console.log('Run runMemoryTestSuite() for comprehensive testing')
}

// Export for Node.js testing
export default MemoryTestRunner