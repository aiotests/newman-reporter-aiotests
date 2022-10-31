const axios = require('axios');
const aioLogger = require('./aio-tests-logger');
const FormData = require('form-data');
const apiTimeout = 60 * 1000;
const chalk = require('chalk');


let aioAPIClient = null;

function initAPIClient(aioConfig) {
    if (!!aioConfig.aioApiToken) {
        initCloudAPIClient(aioConfig.aioApiToken);
    } else {
        initServerAPIClient(aioConfig.jiraServer, aioConfig.jiraPat);
    }
}

function initCloudAPIClient(token) {
    aioLogger.log("Setting up AIO Tests API client for Jira cloud");
    aioAPIClient = axios.create({
        baseURL: 'https://tcms.aioreports.com/aio-tcms/api/v1',
        timeout: apiTimeout,
    });
    aioAPIClient.defaults.headers.common['Authorization'] = `AioAuth ${token}`;

}

function initServerAPIClient(jiraServer, patToken) {
    aioLogger.log("Setting up AIO Tests API client for server " + jiraServer);
    aioAPIClient = axios.create({
        baseURL: jiraServer + '/rest/aio-tcms-api/1.0',
        timeout: apiTimeout
    });
    aioAPIClient.defaults.headers.common['Authorization'] = `Bearer ${patToken}`;
}

function validateConfig(aioConfig) {
    if(aioConfig.enableReporting != null &&!aioConfig.enableReporting) {
        aioLogger.error("AIO Tests Reporting disabled", true);
        return false;
    }
    if(!aioConfig.jiraProjectId){
        aioLogger.error("Jira Project Id is mandatory for AIO Tests Reporting.", true);
        return false;
    }
    if(!aioConfig.aioApiToken) {
        if(!aioConfig.jiraServer || !aioConfig.jiraPat) {
            aioLogger.error("Please provide AIO Tests authentication details.  For Jira Cloud, aioApiToken needs to be set.  For Jira Server, jiraServer and jiraPat need to be set.", true);
            return false;
        }
    }
    return true;
}

function cleanToMakeLean(summary) {
    if(Object.keys(summary).length && Object.keys(summary.run).length) {
        for (var execution of summary.run.executions) {
            if(execution.response && execution.response.stream) {
                execution.response.stream = {};
            }
        }
    }
}

 function reportToAIO(aioConfig, o) {
    if(validateConfig(aioConfig)) {
        aioLogger.logStartEnd("Reporting to AIO");
        initAPIClient(aioConfig);
        return getOrCreateCycle(aioConfig, o.summary.collection.name).then((cycleKey) => {
            // let cycleKey = aioConfig.cycleKey;
            aioLogger.log("Updating cycle " + cycleKey);
            cleanToMakeLean(o['summary']);
            const runSummary = JSON.stringify(o['summary']);
            let bodyFormData = new FormData();
            bodyFormData.append('file', runSummary, 'aioRunSummary.json');
            bodyFormData.append("createNewRun", aioConfig.createNewRun == null? 'false': aioConfig.createNewRun +'' )
            bodyFormData.append("createCase", aioConfig.createCase == null? 'true': aioConfig.createCase +'' );
            bodyFormData.append("bddForceUpdateCase", aioConfig.bddForceUpdateCase == null? 'true': aioConfig.bddForceUpdateCase + '' );
            let h = {'headers': {'Content-Type': `multipart/form-data; boundary=${bodyFormData._boundary}`}};
            return aioAPIClient
                .post(`/project/${aioConfig.jiraProjectId}/testcycle/${cycleKey}/import/results?type=newman`, bodyFormData, h)
                .then((r) => logResults(r.data))
                .catch((e) => {
                    aioLogger.error(e);
                    if(e.response && e.response.data) aioLogger.error(e.response.data);
                });
            })
            .catch(e =>  {
                aioLogger.error(e);
                if(e.response && e.response.data) aioLogger.error(e.response.data);
            })
    } else {
        aioLogger.error("Configuration issue");
        return Promise.resolve();
    }


}

function logResults(response) {
    aioLogger.log(chalk.hex('#0094a6').bold("Status : " + response.status));
    aioLogger.log(chalk.hex('#0094a6').bold("Count of runs : ") + response.requestCount);
    aioLogger.log(chalk.hex('#0094a6').bold("Successful updates : ") + response.successCount);
    aioLogger.log(chalk.hex('#0094a6').bold("Errors : ") + response.errorCount);
    if(response.processedData && Object.keys(response.processedData).length > 0) {
        aioLogger.log("Cases updated successfully");
        aioLogger.log("-----------------------------");
        for(var d of Object.keys(response.processedData)) {
            aioLogger.log(d);
        }
        aioLogger.log("-----------------------------");
    }
    if(response.errors && Object.keys(response.errors).length > 0) {
        aioLogger.error("Errors");
        aioLogger.log("-----------------------------");
        for(var d of Object.keys(response.errors)) {
            aioLogger.error(d + " : " + response.errors[d].message);
        }
    }
}

function getOrCreateCycle(aioConfig, collectionName) {
    aioLogger.log("Determining cycle to update ");
    if (aioConfig.createNewCycle != null && aioConfig.createNewCycle.toString().toLowerCase() === 'false') {
        if (!aioConfig.cycleKey) {
            return Promise.reject("Please set 'cycleKey' (eg. AT-CY-11) , since 'createNewCycle' = true.");
        } else {
            return Promise.resolve(aioConfig.cycleKey);
        }
    } else {
        let cycleTitle = !!aioConfig.newCycleTitle ? aioConfig.newCycleTitle : collectionName;

        aioLogger.log("Creating cycle : " + cycleTitle);
        return aioAPIClient.post("/project/" + aioConfig.jiraProjectId + "/testcycle/detail", {
            title: cycleTitle
        }).then(function (response) {
            aioLogger.log("Cycle created successfully : " + response.data.key)
            return response.data.key;
        })
            .catch(function (error) {
                if (error.response.status === 401 || error.response.status === 403) {
                    return Promise.reject("Authorization error.  Please check credentials.")
                } else {
                    return Promise.reject(error.response.status + " : " + error.response.data);
                }
            });
    }
}


module.exports = { reportToAIO }
