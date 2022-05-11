function resetInTerminal(pid){
    const exec = require('child_process').exec
    const process = require('process')
    
    exec(`bash reset.sh ${pid} ${process.pid}`,
        function (error, stdout, stderr) {
            console.log('stdout: ' + stdout);
            console.log('stderr: ' + stderr);
            if (error !== null) {
                console.log('exec error: ' + error);
        }
    } )
}

module.exports = {resetInTerminal}