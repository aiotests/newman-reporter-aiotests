const reporter = require('./lib/aio-tests-log-results');
const aioLogger = require('./lib/aio-tests-logger')
function AIOTestsNewManReporter (emitter, reporterOptions, collectionRunOptions) {
    let aioWorker = null;
    let otpt;
    emitter.on('beforeDone',(err, o) => {
        otpt = o;
        aioWorker = reporter.reportToAIO(reporterOptions, o);
    })
    emitter.on('done', (err, o) => {
        aioWorker.then(()=> {
            aioLogger.logStartEnd(" Result reporting finished ");
        }).catch(err => {
            console.log(err)
        })
    });
}

module.exports = AIOTestsNewManReporter