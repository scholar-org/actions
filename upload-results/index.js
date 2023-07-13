const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const rr = require('../common/rr');

async function postResultsMetadata(runId, files, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET) {
  try {
    const response = await rr.post('/v1/results', {
      run_id: runId,
      data: {
        files: files
      }
    }, {
      auth: {
        username: SCHOLAR_ACCESS_KEY,
        password: SCHOLAR_ACCESS_SECRET
      }
    });

    console.log(response.status);
    return response.data;
  } catch (error) {
    console.log('Error posting results metadata');
  }
}

async function uploadResultFile(runId, file, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET) {
  try {
    const formData = new FormData();
    formData.append('run_id', runId);
    formData.append('filename', file.filename);
    formData.append('file', fs.createReadStream(file.filepath));
    const response = await rr.put('/v1/results/data', formData, {
      auth: {
        username: SCHOLAR_ACCESS_KEY,
        password: SCHOLAR_ACCESS_SECRET
      }
    });

    console.log(file.filename, response.status);
  } catch (error) {
    console.log('Error uploading result file');
  }
}

async function patchRunToCompleted(runId, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET) {
  try {
    const response = await rr.patch(`/v1/runs/${runId}`, {
      status: 'COMPLETED'
    }, {
      auth: {
        username: SCHOLAR_ACCESS_KEY,
        password: SCHOLAR_ACCESS_SECRET
      }
    });

    console.log(response.status);
    return response.data;
  } catch (error) {
    console.log('Error patching run');
  }
}

function computeSha256Checksum(file) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(file);
  hash.update(data);
  return hash.digest('hex');
}

function getFileData(filePath, type) {
  const stats = fs.statSync(filePath);
  return {
    filename: path.basename(filePath),
    filepath: filePath,
    size_bytes: stats.size,
    checksum_sha256: computeSha256Checksum(filePath),
    type: type,
  };
}

function getFiles(dirPath, type, allowedExtensions = ['csv', 'json']) {
  let files = [];
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stats = fs.statSync(fullPath);

    if (stats.isFile() && allowedExtensions.includes(path.extname(fullPath).slice(1))) {
      files.push(getFileData(fullPath, type));
      processedFiles.add(fullPath);
    }
  }

  return files;
}

async function run() {
  try {
    const SCHOLAR_ACCESS_KEY = core.getInput('SCHOLAR_ACCESS_KEY');
    const SCHOLAR_ACCESS_SECRET = core.getInput('SCHOLAR_ACCESS_SECRET');
    const runId = core.getInput('run_id');
    const rawResultsPath = core.getInput('raw_results_path');
    const summaryResultsPath = core.getInput('summary_results_path');
    const figuresPath = core.getInput('figures_path');

    const files = [
      ...getFiles(rawResultsPath, 'RAW_DATA', ['csv']),
      ...getFiles(summaryResultsPath, 'SUMMARY_DATA', ['csv']),
      ...getFiles(figuresPath, 'FIGURE_SPEC', ['json']),
    ];

    await postResultsMetadata(runId, files, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET);

    for (const file of files) {
      await uploadResultFile(runId, file, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET);
    }

    await patchRunToCompleted(runId, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
