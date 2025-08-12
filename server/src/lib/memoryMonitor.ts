const formatBytes = (bytes: number): string => {
  const sizes = ['B', 'KB', 'MB', 'GB']
  if (bytes === 0) return '0 B'
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i]
}

let lastGcTime = Date.now()

export function startMemoryMonitoring() {
  if (process.env.NODE_ENV !== 'production') {
    // Log memory usage every 5 seconds in dev
    setInterval(() => {
      const memUsage = process.memoryUsage()
      const heapUsed = formatBytes(memUsage.heapUsed)
      const heapTotal = formatBytes(memUsage.heapTotal)
      const external = formatBytes(memUsage.external)
      const rss = formatBytes(memUsage.rss)
      
      console.log(`💾 Memory: Heap ${heapUsed}/${heapTotal} | RSS ${rss} | External ${external}`)
      
      // Force GC if heap usage is above 80%
      const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100
      if (heapPercent > 80 && (global as any).gc && Date.now() - lastGcTime > 10000) {
        console.log('🧹 Running manual garbage collection...')
        ;(global as any).gc()
        lastGcTime = Date.now()
      }
    }, 5000)
  }
  
  // Monitor for memory warnings
  process.on('warning', (warning) => {
    if (warning.name === 'MaxListenersExceededWarning') {
      console.error('⚠️  Memory Warning:', warning)
    }
  })
}

// Clean up large objects periodically
export function scheduleMemoryCleanup() {
  if (process.env.NODE_ENV !== 'production') {
    setInterval(() => {
      if (global.gc) {
        global.gc()
      }
    }, 60000) // Every minute
  }
}
