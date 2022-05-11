// Calls index.js to run the bot script
const spawn = require('child_process').spawn
process.on('exit', () => {
   const child = spawn('node', ['index.js'], {
       cwd: process.cwd(),
       detached: false,
       stdio: 'inherit'
   })
   child.unref()
})