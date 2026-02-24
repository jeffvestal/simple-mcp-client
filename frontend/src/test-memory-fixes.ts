/**
 * Quick test script to validate memory leak fixes
 * Run this to ensure all memory management features work correctly
 */

import { validateMemoryLeakFixes, detectMemoryLeaks } from './lib/memoryValidation'

async function runMemoryValidation() {
  console.log('🚀 Starting memory leak fix validation...')
  
  try {
    const result = await validateMemoryLeakFixes()
    
    if (result) {
      console.log('✅ All memory leak fixes validated successfully!')
      console.log('🎉 Memory management system is working correctly')
    } else {
      console.error('❌ Some memory leak fixes failed validation')
      process.exit(1)
    }
    
  } catch (error) {
    console.error('💥 Validation failed with error:', error)
    process.exit(1)
  }
}

// Start memory leak detection for ongoing monitoring
detectMemoryLeaks()

// Run validation
runMemoryValidation()