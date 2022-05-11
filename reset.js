const spawn = require('child_process').spawn
process.on('exit', () => {
   const child = spawn('node', ['index.js'], {
      detached: true,
      stdio: 'ignore'
   })
   child.unref()
})
process.exit(0)