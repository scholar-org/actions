const axios = require('axios');
const core = require('@actions/core');
const github = require('@actions/github');

async function postRun(ro_id, user_id, repo_commit_hash, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET) {
  try {
    const response = await axios.post('https://research-replicator.usescholar.org/v1/runs', {
      ro_id: ro_id,
      user_id: user_id,
      status: 'RUNNING',
      data: {
        repo_commit_hash: repo_commit_hash,
      }
    }, {
      auth: {
        username: SCHOLAR_ACCESS_KEY,
        password: SCHOLAR_ACCESS_SECRET,
      }
    });

    console.log(response.status);
    return response.data;
  } catch (error) {
    console.error(error);
  }
}

async function patchRun(run_id, repo_commit_hash, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET) {
  try {
    const response = await axios.patch(`https://research-replicator.usescholar.org/v1/runs/${run_id}`, {
      status: 'RUNNING',
      data: {
        repo_commit_hash: repo_commit_hash,
      }
    }, {
      auth: {
        username: SCHOLAR_ACCESS_KEY,
        password: SCHOLAR_ACCESS_SECRET,
      }
    });

    console.log(response.status);
    return response.data;
  } catch (error) {
    console.error(error);
  }
}

async function startRun() {
  try {
    const ro_id = core.getInput('ro_id');
    const user_id = core.getInput('user_id');
    const SCHOLAR_ACCESS_KEY = core.getInput('SCHOLAR_ACCESS_KEY');
    const SCHOLAR_ACCESS_SECRET = core.getInput('SCHOLAR_ACCESS_SECRET');
    const repo_commit_hash = github.context.sha;

    const existing_run_id = core.getInput('run_id');

    if (existing_run_id) {
      // Patch the run to RUNNING
      await patchRun(existing_run_id, repo_commit_hash, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET);

      core.setOutput('run_id', existing_run_id);
      return;
    }

    // Create a new run
    const data = await postRun(ro_id, user_id, repo_commit_hash, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET);
    const run_id = data.id;
    core.setOutput('run_id', run_id);
    return;
  } catch (error) {
    core.setFailed(error.message);
  }
}

startRun();
