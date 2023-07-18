const axios = require('axios');
const core = require('@actions/core');
const github = require('@actions/github');
const http = require('../common/http');

async function postRun({
  ro_id,
  user_id,
  repo_commit_hash,
  repo_url,
  github_workflow_id,
  github_run_id,
}, {
  SCHOLAR_ACCESS_KEY,
  SCHOLAR_ACCESS_SECRET,
}) {
  try {
    const response = await axios.post('https://research-replicator.usescholar.org/v1/runs', {
      ro_id: ro_id,
      user_id: user_id ? user_id : undefined,
      status: 'RUNNING',
      data: {
        repo_commit_hash: repo_commit_hash,
        repo_url: repo_url,
        github_workflow_id: github_workflow_id,
        github_run_id: github_run_id,
      }
    }, {
      auth: {
        username: SCHOLAR_ACCESS_KEY,
        password: SCHOLAR_ACCESS_SECRET,
      }
    });

    console.log('Created a new run.');
    console.log(`\tRun ID: ${response.data.id}`);
    console.log(`\tMetadata:`);
    console.log(`\t\tRepo URL: ${repo_url}`);
    console.log(`\t\tRepo Commit Hash: ${repo_commit_hash}`);
    console.log(`\t\tGitHub Workflow ID: ${github_workflow_id}`);
    console.log(`\t\tGitHub Run ID: ${github_run_id}`);
    return response.data;
  } catch (error) {
    http.handleAxiosError(error);
  }
}

async function patchRun({
  run_id,
  repo_commit_hash,
  repo_url,
  github_workflow_id,
  github_run_id,
}, {
  SCHOLAR_ACCESS_KEY,
  SCHOLAR_ACCESS_SECRET,
}) {
  try {
    const response = await axios.patch(`https://research-replicator.usescholar.org/v1/runs/${run_id}`, {
      status: 'RUNNING',
      data: {
        repo_commit_hash: repo_commit_hash,
        repo_url: repo_url,
        github_workflow_id: github_workflow_id,
        github_run_id: github_run_id,
      },
    }, {
      auth: {
        username: SCHOLAR_ACCESS_KEY,
        password: SCHOLAR_ACCESS_SECRET,
      }
    });

    console.log('Updated an existing run.');
    console.log(`\tRun ID: ${response.data.id}`);
    console.log(`\tMetadata:`);
    console.log(`\t\tRepo URL: ${repo_url}`);
    console.log(`\t\tRepo Commit Hash: ${repo_commit_hash}`);
    console.log(`\t\tGitHub Workflow ID: ${github_workflow_id}`);
    console.log(`\t\tGitHub Run ID: ${github_run_id}`);
    return response.data;
  } catch (error) {
    http.handleAxiosError(error);
  }
}

async function startRun() {
  try {
    const ro_id = core.getInput('ro_id');
    const user_id = core.getInput('user_id');
    const SCHOLAR_ACCESS_KEY = core.getInput('SCHOLAR_ACCESS_KEY');
    const SCHOLAR_ACCESS_SECRET = core.getInput('SCHOLAR_ACCESS_SECRET');
    const repo_commit_hash = github.context.sha;

    // get details on the workflow/run/repo state
    const github_run_id = github.context.runId;
    const repo_url = github.context.payload.repository.html_url;

    const existing_run_id = core.getInput('run_id');

    if (existing_run_id) {
      // Patch the run to RUNNING

      console.log('Run ID already exists, setting status and metadata...');

      await patchRun({
        run_id: existing_run_id,
        repo_commit_hash: repo_commit_hash,
        repo_url: repo_url,
        github_run_id: github_run_id,
      }, {
        SCHOLAR_ACCESS_KEY,
        SCHOLAR_ACCESS_SECRET,
      });

      core.setOutput('run_id', existing_run_id);
      return;
    }

    // Create a new run
    const data = await postRun({
      ro_id: ro_id,
      user_id: user_id,
      repo_url: repo_url,
      repo_commit_hash: repo_commit_hash,
      github_run_id: github_run_id,
    }, {
      SCHOLAR_ACCESS_KEY,
      SCHOLAR_ACCESS_SECRET,
    });
    const run_id = data.id;
    core.setOutput('run_id', run_id);
    return;
  } catch (error) {
    core.setFailed(error.message);
  }
}

startRun();
