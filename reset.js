const spawn = require('child_process').spawn
process.on('exit', () => {
   const child = spawn('node', ['index.js'])
   child.unref()
   child.stdout.on('data', function(data) {
    console.log(data.toString()); 
    })
})
process.exit(0)