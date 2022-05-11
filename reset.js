const spawn = require('child_process').spawn
process.on('exit', () => {
   const child = spawn('node', ['index.js'])
   child.unref()
})
process.exit(0)