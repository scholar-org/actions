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
  let file_id = undefined;

  if (type === 'FIGURE_SPEC') {
    try {
      const data = JSON.parse(fs.readFileSync(filePath));
      file_id = data.id;
    } catch (error) {
      console.error('ERROR: Invalid JSON for figure spec file:', filePath);
    }
  }

  return {
    file_id: file_id,
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
  if (!fs.existsSync(dirPath)) {
    console.error('Error: Directory', dirPath, 'does not exist.');
    return [];  // Return an empty list
  }
  
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

/**
 * Verify that the figure specs are formatted correctly. Checks:
 * - Is valid JSON
 * - Has the required fields: id, data, data.filename, figure, figure.title, figure.type
 * - The data.filename field matches a file in the summary data directory OR figure image directory
 * @returns Returns false if job failed. Returns an array of figure spec files if job succeeded.
 */
function validateFigureSpecFiles(files, summaryDataFiles) {
  let failJob = false;
  const parsed = files.filter((f) => {
    let fileData = undefined;
    try {
      fileData = fs.readFileSync(f.filepath);
    } catch (error) {
      console.error('ERROR: Could not read figure spec file:', f.filename, ', error', error.message);
      failJob = true;
      return false;
    }

    try {
      const data = JSON.parse(fileData);

      if (!data.id || !data.data || !data.data.filename || !data.figure || !data.figure.title || !data.figure.type) {
        console.error('ERROR: Missing fields for figure spec file:', f.filename);
        failJob = true;
        return false;
      }
  
      const summaryDataFilename = data.data.filename;
      const matchingSummaryDataFile = summaryDataFiles.find(f => f.filename === summaryDataFilename);
      if (!matchingSummaryDataFile) {
        // we just assume that they didn't reproduce results for this one particular figure
        console.warn('WARNING: Could not find matching summary data file for figure spec. Skipping figure file:', f.filename);
        return false;
      }
  
      return true;
    } catch (error) {
      console.error('ERROR: Invalid JSON for figure spec file:', f.filename);
      failJob = true;
      return false;
    }
  });

  return {
    failJob: failJob,
    parsed: parsed
  }
}

async function run() {
  try {
    const SCHOLAR_ACCESS_KEY = core.getInput('SCHOLAR_ACCESS_KEY');
    const SCHOLAR_ACCESS_SECRET = core.getInput('SCHOLAR_ACCESS_SECRET');
    const runId = core.getInput('run_id');
    const artifactsPath = core.getInput('artifacts_path');
    const summaryResultsPath = core.getInput('results_path');
    const figuresPath = core.getInput('figures_path');

    console.log('Reading files...');
    const summaryResultFiles = getFiles(summaryResultsPath, 'SUMMARY_DATA', ['csv', 'md']);
    const figureImageFiles = getFiles(figuresPath, 'FIGURE_IMAGE', ['png', 'jpg', 'jpeg', 'svg']);

    const rawFigureSpecFiles = getFiles(figuresPath, 'FIGURE_SPEC', ['json']);
    const { failJob, parsed: parsedFigureSpecFiles } = validateFigureSpecFiles(rawFigureSpecFiles, [...summaryResultFiles, ...figureImageFiles]);
    if (failJob) {
      core.setFailed('Job failed due to invalid figure spec files');
      return;
    }

    const files = [
      ...getFiles(artifactsPath, 'RAW_DATA', ['csv']),
      ...summaryResultFiles,
      ...parsedFigureSpecFiles,
      ...figureImageFiles,
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
