function resetInTerminal(){
    const exec = require('child_process').exec
    
    exec('node index.js',
        function (error, stdout, stderr) {
            console.log('stdout: ' + stdout);
            console.log('stderr: ' + stderr);
            if (error !== null) {
                console.log('exec error: ' + error);
        }
    } )
}

module.exports = {resetInTerminal}