const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const http = require('../common/http');
const FormData = require('form-data');

async function postResultsMetadata(runId, files, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET) {
  try {
    const response = await axios.post('https://research-replicator.usescholar.org/v1/results', {
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

    console.log('Posted results metadata');
    return response.data;
  } catch (error) {
    http.handleAxiosError(error);
  }
}

async function uploadResultFile(runId, file, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET) {
  try {
    const formData = new FormData();
    formData.append('run_id', runId);
    formData.append('filename', file.filename);
    formData.append('file', fs.createReadStream(file.filepath));
    const response = await axios.put('https://research-replicator.usescholar.org/v1/results/data', formData, {
      auth: {
        username: SCHOLAR_ACCESS_KEY,
        password: SCHOLAR_ACCESS_SECRET
      }
    });

    console.log('Uploaded file:', file.filename);
  } catch (error) {
    console.log('Error uploading file:', file.filename)
    http.handleAxiosError(error);
  }
}

async function patchRunToCompleted(runId, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET) {
  try {
    const response = await axios.patch(`https://research-replicator.usescholar.org/v1/runs/${runId}`, {
      status: 'COMPLETED'
    }, {
      auth: {
        username: SCHOLAR_ACCESS_KEY,
        password: SCHOLAR_ACCESS_SECRET
      }
    });

    console.log('Marked run as completed');
    return response.data;
  } catch (error) {
    http.handleAxiosError(error);
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

function getDisplayableFileType(type) {
  switch (type) {
    case 'RAW_DATA':
      return 'raw data';
    case 'SUMMARY_DATA':
      return 'summary data';
    case 'FIGURE_SPEC':
      return 'figure spec';
    case 'FIGURE_IMAGE':
      return 'figure image';
    default:
      return 'unknown';
  }
}

function getFiles(dirPath, type, allowedExtensions = ['csv', 'json']) {
  console.log('\tReading', getDisplayableFileType(type), 'files from', dirPath);

  let files = [];
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stats = fs.statSync(fullPath);

    if (stats.isFile() && allowedExtensions.includes(path.extname(fullPath).slice(1))) {
      files.push(getFileData(fullPath, type));
    }
  }

  console.log('\t\tFound', files.length, getDisplayableFileType(type), 'files');

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

    console.log('Reading files...');
    const files = [
      ...getFiles(rawResultsPath, 'RAW_DATA', ['csv']),
      ...getFiles(summaryResultsPath, 'SUMMARY_DATA', ['csv']),
      ...getFiles(figuresPath, 'FIGURE_SPEC', ['json']),
      ...getFiles(figuresPath, 'FIGURE_IMAGE', ['png', 'jpg', 'jpeg', 'svg'])
    ];

    await postResultsMetadata(runId, files, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET);

    for (const file of files) {
      await uploadResultFile(runId, file, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET);
    }

    console.log('Done uploading files')

    await patchRunToCompleted(runId, SCHOLAR_ACCESS_KEY, SCHOLAR_ACCESS_SECRET);
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
