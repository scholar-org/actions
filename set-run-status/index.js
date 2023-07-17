const axios = require('axios');
const core = require('@actions/core');
const http = require('../common/http');

async function patchRun(run_id, status, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET) {
  try {
    const response = await axios.patch(`https://research-replicator.usescholar.org/v1/runs/${run_id}`, {
      status: status,
    }, {
      auth: {
        username: SCHOLAR_ACCESS_KEY,
        password: SCHOLAR_ACCESS_SECRET,
      }
    });

    console.log(`Set run status to ${status}.for Run ID: ${run_id}`);
    return response.data;
  } catch (error) {
    http.handleAxiosError(error);
  }
}

async function setRunStatus() {
  try {
    const run_id = core.getInput('run_id');
    const status = core.getInput('status');
    const SCHOLAR_ACCESS_KEY = core.getInput('SCHOLAR_ACCESS_KEY');
    const SCHOLAR_ACCESS_SECRET = core.getInput('SCHOLAR_ACCESS_SECRET');

    // Patch the run status
    await patchRun(run_id, status, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET);
    return;
  } catch (error) {
    core.setFailed(error.message);
  }
}

setRunStatus();
