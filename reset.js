const spawn = require('child_process').spawn
process.on('exit', () => {
   const child = spawn('node', ['index.js'], {
       stdio: 'inherit'
   })
   child.unref()
})
process.exit(0)