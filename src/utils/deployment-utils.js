const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const util = require('util');

const execFileAsync = util.promisify(execFile);

/**
 * Patrones de exclusión predeterminados
 */
const DEFAULT_IGNORES = ['.git', 'node_modules', 'dist', 'build', '.DS_Store', 'Thumbs.db', '.idea', '.vscode', '.github', 'sources/target'];

/**
 * Verifica si una ruta relativa coincide con los patrones a ignorar
 */
function shouldIgnore(relativePath, ignorePatternsStr) {
  const custom = (ignorePatternsStr || '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
  const patterns = Array.from(new Set([...DEFAULT_IGNORES, ...custom]));

  const normalized = relativePath.replace(/\\/g, '/');
  const segments = normalized.split('/');

  for (const pattern of patterns) {
    const cleanPattern = pattern.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!cleanPattern) continue;

    // Coincidencia exacta de segmento de directorio
    if (segments.includes(cleanPattern)) return true;
    if (normalized === cleanPattern) return true;

    // Patrón comodín simple (*.log, *.tmp)
    if (cleanPattern.startsWith('*.')) {
      const ext = cleanPattern.slice(1);
      if (normalized.endsWith(ext)) return true;
    }
  }
  return false;
}

/**
 * Escanea recursivamente un directorio recogiendo información de ficheros
 */
async function scanDirectory(currentDir, rootDir, ignorePatternsStr, fileMap) {
  try {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);

      if (shouldIgnore(relativePath, ignorePatternsStr)) {
        continue;
      }

      if (entry.isDirectory()) {
        await scanDirectory(fullPath, rootDir, ignorePatternsStr, fileMap);
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        try {
          const stat = await fs.promises.stat(fullPath);
          fileMap.set(relativePath, {
            relativePath,
            size: stat.size,
            mtime: stat.mtimeMs,
            fullPath
          });
        } catch (_) {}
      }
    }
  } catch (err) {
    console.error(`Error escaneando directorio ${currentDir}:`, err);
  }
}

/**
 * Calcula el hash SHA-256 de un fichero para verificar igualdad de contenido
 */
async function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', err => reject(err));
  });
}

/**
 * Comprueba si un buffer corresponde a un archivo binario
 */
function isBinaryBuffer(buffer) {
  const maxBytes = Math.min(buffer.length, 8000);
  for (let i = 0; i < maxBytes; i++) {
    if (buffer[i] === 0) return true; // Carácter nulo indica binario
  }
  return false;
}

/**
 * Compara dos carpetas (entrada/origen vs salida/destino)
 */

async function isTextIdentical(path1, path2) {
  try {
    const buf1 = await fs.promises.readFile(path1);
    const buf2 = await fs.promises.readFile(path2);
    // basic binary check
    if (buf1.includes(0) || buf2.includes(0)) return false; 
    const str1 = buf1.toString('utf8').replace(/\r/g, '');
    const str2 = buf2.toString('utf8').replace(/\r/g, '');
    return str1 === str2;
  } catch (e) { return false; }
}

async function compareDeploymentFolders(sourcePath, targetPath, ignorePatternsStr) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`La carpeta de entrada no existe: ${sourcePath}`);
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`La carpeta de salida no existe: ${targetPath}`);
  }

  const sourceFiles = new Map();
  const targetFiles = new Map();

  await Promise.all([
    scanDirectory(sourcePath, sourcePath, ignorePatternsStr, sourceFiles),
    scanDirectory(targetPath, targetPath, ignorePatternsStr, targetFiles)
  ]);

  const allRelativePaths = new Set([...sourceFiles.keys(), ...targetFiles.keys()]);
  const sortedPaths = Array.from(allRelativePaths).sort((a, b) => a.localeCompare(b));

  const results = [];
  let modifiedCount = 0;
  let addedCount = 0;
  let deletedCount = 0;
  let identicalCount = 0;

  for (const relPath of sortedPaths) {
    const inSource = sourceFiles.get(relPath);
    const inTarget = targetFiles.get(relPath);

    if (inSource && !inTarget) {
      addedCount++;
      results.push({
        relativePath: relPath,
        status: 'added',
        sourceSize: inSource.size,
        targetSize: null,
        sourceMtime: inSource.mtime,
        targetMtime: null
      });
    } else if (!inSource && inTarget) {
      deletedCount++;
      results.push({
        relativePath: relPath,
        status: 'deleted',
        sourceSize: null,
        targetSize: inTarget.size,
        sourceMtime: null,
        targetMtime: inTarget.mtime
      });
    } else if (inSource && inTarget) {
      let isDifferent = false;
      if (inSource.size !== inTarget.size) {
        isDifferent = true;
      } else {
        // Mismo tamaño: verificar hash para estar 100% seguros
        try {
          const [hashSource, hashTarget] = await Promise.all([
            getFileHash(inSource.fullPath),
            getFileHash(inTarget.fullPath)
          ]);
          isDifferent = hashSource !== hashTarget;
        } catch (_) {
          isDifferent = true;
        }
      }

      if (isDifferent) {
        // Fallback para diferencias de saltos de línea (CRLF vs LF)
        try {
          const textIdentical = await isTextIdentical(inSource.fullPath, inTarget.fullPath);
          if (textIdentical) isDifferent = false;
        } catch (e) {}
      }
      
      if (isDifferent) {
        modifiedCount++;
        results.push({
          relativePath: relPath,
          status: 'modified',
          sourceSize: inSource.size,
          targetSize: inTarget.size,
          sourceMtime: inSource.mtime,
          targetMtime: inTarget.mtime
        });
      } else {
        identicalCount++;
        results.push({
          relativePath: relPath,
          status: 'identical',
          sourceSize: inSource.size,
          targetSize: inTarget.size,
          sourceMtime: inSource.mtime,
          targetMtime: inTarget.mtime
        });
      }
    }
  }

  return {
    success: true,
    files: results,
    stats: {
      total: results.length,
      modified: modifiedCount,
      added: addedCount,
      deleted: deletedCount,
      identical: identicalCount,
      changed: modifiedCount + addedCount + deletedCount
    }
  };
}

/**
 * Algoritmo LCS para calcular diferencias de texto entre dos arrays de líneas
 */
function computeLCSDiff(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;

  if (m === 0 && n === 0) return [];
  if (m === 0) {
    return newLines.map((content, idx) => ({
      type: '+',
      oldLineNo: null,
      newLineNo: idx + 1,
      content
    }));
  }
  if (n === 0) {
    return oldLines.map((content, idx) => ({
      type: '-',
      oldLineNo: idx + 1,
      newLineNo: null,
      content
    }));
  }

  // Optimización de prefijo común
  let start = 0;
  while (start < m && start < n && oldLines[start] === newLines[start]) {
    start++;
  }

  // Optimización de sufijo común
  let endOld = m - 1;
  let endNew = n - 1;
  while (endOld >= start && endNew >= start && oldLines[endOld] === newLines[endNew]) {
    endOld--;
    endNew--;
  }

  const diff = [];

  // Prefijo idéntico
  for (let k = 0; k < start; k++) {
    diff.push({
      type: ' ',
      oldLineNo: k + 1,
      newLineNo: k + 1,
      content: oldLines[k]
    });
  }

  // Diferencias centrales
  const midOld = oldLines.slice(start, endOld + 1);
  const midNew = newLines.slice(start, endNew + 1);

  // Si los tamaños del centro son manejables con matriz dinámica
  if (midOld.length > 0 && midNew.length > 0 && midOld.length * midNew.length <= 4000000) {
    const dp = Array.from({ length: midOld.length + 1 }, () => new Uint32Array(midNew.length + 1));
    for (let i = 1; i <= midOld.length; i++) {
      for (let j = 1; j <= midNew.length; j++) {
        if (midOld[i - 1] === midNew[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    let i = midOld.length;
    let j = midNew.length;
    const midDiff = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && midOld[i - 1] === midNew[j - 1]) {
        midDiff.push({ type: ' ', oldIdx: i - 1, newIdx: j - 1, content: midOld[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        midDiff.push({ type: '+', oldIdx: null, newIdx: j - 1, content: midNew[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        midDiff.push({ type: '-', oldIdx: i - 1, newIdx: null, content: midOld[i - 1] });
        i--;
      }
    }
    midDiff.reverse();

    for (const item of midDiff) {
      diff.push({
        type: item.type,
        oldLineNo: item.oldIdx !== null ? start + item.oldIdx + 1 : null,
        newLineNo: item.newIdx !== null ? start + item.newIdx + 1 : null,
        content: item.content
      });
    }
  } else {
    // Si la parte central es enorme, eliminar viejas y añadir nuevas
    for (let i = 0; i < midOld.length; i++) {
      diff.push({
        type: '-',
        oldLineNo: start + i + 1,
        newLineNo: null,
        content: midOld[i]
      });
    }
    for (let j = 0; j < midNew.length; j++) {
      diff.push({
        type: '+',
        oldLineNo: null,
        newLineNo: start + j + 1,
        content: midNew[j]
      });
    }
  }

  // Sufijo idéntico
  const suffixLen = m - 1 - endOld;
  for (let k = 0; k < suffixLen; k++) {
    const oldIdx = endOld + 1 + k;
    const newIdx = endNew + 1 + k;
    diff.push({
      type: ' ',
      oldLineNo: oldIdx + 1,
      newLineNo: newIdx + 1,
      content: oldLines[oldIdx]
    });
  }

  return diff;
}

/**
 * Agrupa las líneas de diff en bloques/hunks de contexto (estilo git diff)
 */
function createDiffHunks(diffLines, contextLines = 3) {
  const hunks = [];
  const changedIndices = [];

  for (let i = 0; i < diffLines.length; i++) {
    if (diffLines[i].type !== ' ') {
      changedIndices.push(i);
    }
  }

  if (changedIndices.length === 0) {
    return [];
  }

  // Unir rangos de contexto contiguos
  const ranges = [];
  for (const idx of changedIndices) {
    const rangeStart = Math.max(0, idx - contextLines);
    const rangeEnd = Math.min(diffLines.length - 1, idx + contextLines);

    if (ranges.length === 0) {
      ranges.push({ start: rangeStart, end: rangeEnd });
    } else {
      const lastRange = ranges[ranges.length - 1];
      if (rangeStart <= lastRange.end + 1) {
        lastRange.end = Math.max(lastRange.end, rangeEnd);
      } else {
        ranges.push({ start: rangeStart, end: rangeEnd });
      }
    }
  }

  for (const range of ranges) {
    const lines = diffLines.slice(range.start, range.end + 1);
    const oldLinesInHunk = lines.filter(l => l.type !== '+');
    const newLinesInHunk = lines.filter(l => l.type !== '-');

    const oldStart = oldLinesInHunk.length > 0 ? (oldLinesInHunk[0].oldLineNo || 1) : 1;
    const newStart = newLinesInHunk.length > 0 ? (newLinesInHunk[0].newLineNo || 1) : 1;

    hunks.push({
      oldStart,
      oldLinesCount: oldLinesInHunk.length,
      newStart,
      newLinesCount: newLinesInHunk.length,
      lines
    });
  }

  return hunks;
}

/**
 * Obtiene el diff detallado de un fichero entre entrada y salida
 * Convención: Target (Salida/Destino) es el estado base/anterior; Source (Entrada/Origen) es el nuevo cambio
 */
async function getFileDiff(sourcePath, targetPath, relativePath, options = {}) {
  const sourceFullPath = path.join(sourcePath, relativePath);
  const targetFullPath = path.join(targetPath, relativePath);

  const sourceExists = fs.existsSync(sourceFullPath) || options.customSourceText !== undefined;
  const targetExists = fs.existsSync(targetFullPath) || options.customTargetText !== undefined;

  let sourceBuffer = null;
  let targetBuffer = null;

  if (options.customSourceText === undefined && fs.existsSync(sourceFullPath)) {
    sourceBuffer = await fs.promises.readFile(sourceFullPath);
  }
  if (options.customTargetText === undefined && fs.existsSync(targetFullPath)) {
    targetBuffer = await fs.promises.readFile(targetFullPath);
  }

  const isSourceBinary = sourceBuffer ? isBinaryBuffer(sourceBuffer) : false;
  const isTargetBinary = targetBuffer ? isBinaryBuffer(targetBuffer) : false;

  if (isSourceBinary || isTargetBinary) {
    return {
      isBinary: true,
      relativePath,
      sourceExists,
      targetExists,
      sourceSize: sourceBuffer ? sourceBuffer.length : null,
      targetSize: targetBuffer ? targetBuffer.length : null
    };
  }

  const oldText = options.customTargetText !== undefined ? options.customTargetText : (targetBuffer ? targetBuffer.toString('utf-8') : '');
  const newText = options.customSourceText !== undefined ? options.customSourceText : (sourceBuffer ? sourceBuffer.toString('utf-8') : '');

  const oldLines = oldText || targetExists ? oldText.split(/\r?\n/) : [];
  const newLines = newText || sourceExists ? newText.split(/\r?\n/) : [];

  const diffLines = computeLCSDiff(oldLines, newLines);
  const hunks = createDiffHunks(diffLines, 3);

  const additions = diffLines.filter(l => l.type === '+').length;
  const deletions = diffLines.filter(l => l.type === '-').length;

  return {
    isBinary: false,
    relativePath,
    sourceExists,
    targetExists,
    sourceSize: sourceBuffer ? sourceBuffer.length : 0,
    targetSize: targetBuffer ? targetBuffer.length : 0,
    diffLines,
    hunks,
    stats: {
      additions,
      deletions,
      totalLines: diffLines.length
    }
  };
}

/**
 * Sincroniza (copia o elimina) un fichero de la carpeta de entrada a la de salida
 */
async function syncDeploymentFile(sourcePath, targetPath, relativePath, action = 'copy') {
  const sourceFullPath = path.join(sourcePath, relativePath);
  const targetFullPath = path.join(targetPath, relativePath);

  if (action === 'delete') {
    if (fs.existsSync(targetFullPath)) {
      await fs.promises.unlink(targetFullPath);
    }
    return { success: true, action: 'deleted', relativePath };
  }

  if (!fs.existsSync(sourceFullPath)) {
    throw new Error(`El archivo de entrada no existe: ${sourceFullPath}`);
  }

  const targetDir = path.dirname(targetFullPath);
  await fs.promises.mkdir(targetDir, { recursive: true });

  await fs.promises.copyFile(sourceFullPath, targetFullPath);
  return { success: true, action: 'copied', relativePath };
}

/**
 * Sincroniza múltiples ficheros a la carpeta de salida
 */
async function syncAllDeploymentFiles(sourcePath, targetPath, filesToSync) {
  const synced = [];
  const errors = [];

  for (const item of filesToSync) {
    try {
      if (item.status === 'deleted') {
        await syncDeploymentFile(sourcePath, targetPath, item.relativePath, 'delete');
      } else {
        await syncDeploymentFile(sourcePath, targetPath, item.relativePath, 'copy');
      }
      synced.push(item.relativePath);
    } catch (err) {
      errors.push({ relativePath: item.relativePath, error: err.message });
    }
  }

  return {
    success: errors.length === 0,
    syncedCount: synced.length,
    errors
  };
}

/**
 * Detecta y obtiene información de repositorio Git para una carpeta
 */
async function getGitRepoInfo(folderPath) {
  if (!folderPath || !fs.existsSync(folderPath)) {
    return { isGit: false, error: 'La carpeta no existe' };
  }

  try {
    const { stdout: isInside } = await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: folderPath,
      timeout: 10000
    });

    if (isInside.trim() !== 'true') {
      return { isGit: false };
    }

    // Rama actual
    let currentBranch = 'HEAD';
    try {
      const { stdout: branchOut } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: folderPath,
        timeout: 10000
      });
      currentBranch = branchOut.trim();
    } catch (_) {}

    // Listado de ramas (locales y remotas)
    const branches = new Set();
    if (currentBranch && currentBranch !== 'HEAD') {
      branches.add(currentBranch);
    }

    try {
      const { stdout: branchesOut } = await execFileAsync('git', ['branch', '-a', '--no-color'], {
        cwd: folderPath,
        timeout: 10000
      });

      const lines = branchesOut.split('\n');
      for (const line of lines) {
        let b = line.trim().replace(/^\*\s*/, '');
        if (!b || b.includes('->')) continue;
        if (b.startsWith('remotes/origin/')) {
          b = b.replace(/^remotes\/origin\//, '');
        } else if (b.startsWith('remotes/')) {
          b = b.replace(/^remotes\/[^/]+\//, '');
        }
        if (b && b !== 'HEAD') {
          branches.add(b);
        }
      }
    } catch (_) {}

    // Estado del árbol de trabajo
    let isClean = true;
    let pendingChangesCount = 0;
    try {
      const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain'], {
        cwd: folderPath,
        timeout: 10000
      });
      const changes = statusOut.split('\n').filter(l => l.trim().length > 0);
      pendingChangesCount = changes.length;
      isClean = pendingChangesCount === 0;
    } catch (_) {}

    // Último commit
    let lastCommit = '';
    try {
      const { stdout: logOut } = await execFileAsync('git', ['log', '-1', '--oneline'], {
        cwd: folderPath,
        timeout: 10000
      });
      lastCommit = logOut.trim();
    } catch (_) {}

    return {
      isGit: true,
      currentBranch,
      branches: Array.from(branches).sort(),
      isClean,
      pendingChangesCount,
      lastCommit
    };
  } catch (err) {
    return { isGit: false, error: err.message };
  }
}

/**
 * Ejecuta git checkout para cambiar de rama
 */
async function gitCheckoutBranch(folderPath, branch) {
  if (!folderPath || !branch) {
    throw new Error('folderPath y branch son obligatorios');
  }

  try {
    const { stdout, stderr } = await execFileAsync('git', ['checkout', branch], {
      cwd: folderPath,
      timeout: 30000
    });
    return {
      success: true,
      branch,
      output: (stdout + '\n' + stderr).trim()
    };
  } catch (err) {
    // Si no existe localmente, intentar con branch remoto origin
    try {
      const { stdout, stderr } = await execFileAsync('git', ['checkout', '-b', branch, '--track', `origin/${branch}`], {
        cwd: folderPath,
        timeout: 30000
      });
      return {
        success: true,
        branch,
        output: (stdout + '\n' + stderr).trim()
      };
    } catch (err2) {
      throw new Error(err.stderr || err.message || err2.message);
    }
  }
}

/**
 * Ejecuta git pull en el repositorio
 */
async function gitPull(folderPath, branch) {
  if (!folderPath) {
    throw new Error('folderPath es obligatorio');
  }

  // Si se solicita una rama específica diferente, hacer checkout primero
  if (branch) {
    try {
      const { stdout: curBranch } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: folderPath,
        timeout: 10000
      });
      if (curBranch.trim() !== branch) {
        await gitCheckoutBranch(folderPath, branch);
      }
    } catch (_) {}
  }

  try {
    // Primero hacer fetch para sincronizar referencias
    try {
      await execFileAsync('git', ['fetch', '--prune'], { cwd: folderPath, timeout: 30000 });
    } catch (_) {}

    const args = ['pull'];
    if (branch) {
      args.push('origin', branch);
    }

    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd: folderPath,
      timeout: 60000
    });

    return {
      success: true,
      output: (stdout + '\n' + stderr).trim()
    };
  } catch (err) {
    return {
      success: false,
      error: err.stderr || err.stdout || err.message
    };
  }
}

/**
 * Obtiene el contenido textual en bruto de un fichero tanto en Entrada como en Salida
 */
async function getFileRawContents(sourcePath, targetPath, relativePath) {
  const sourceFullPath = path.join(sourcePath, relativePath);
  const targetFullPath = path.join(targetPath, relativePath);

  const sourceExists = fs.existsSync(sourceFullPath);
  const targetExists = fs.existsSync(targetFullPath);

  let sourceText = '';
  let targetText = '';
  let isSourceBinary = false;
  let isTargetBinary = false;

  if (sourceExists) {
    try {
      const sourceBuffer = await fs.promises.readFile(sourceFullPath);
      isSourceBinary = isBinaryBuffer(sourceBuffer);
      if (!isSourceBinary) {
        sourceText = sourceBuffer.toString('utf-8');
      }
    } catch (err) {
      console.error(`Error leyendo fichero de entrada ${sourceFullPath}:`, err);
    }
  }

  if (targetExists) {
    try {
      const targetBuffer = await fs.promises.readFile(targetFullPath);
      isTargetBinary = isBinaryBuffer(targetBuffer);
      if (!isTargetBinary) {
        targetText = targetBuffer.toString('utf-8');
      }
    } catch (err) {
      console.error(`Error leyendo fichero de salida ${targetFullPath}:`, err);
    }
  }

  return {
    success: true,
    relativePath,
    sourceExists,
    targetExists,
    sourceText,
    targetText,
    isSourceBinary,
    isTargetBinary
  };
}

/**
 * Guarda contenido de texto personalizado en el archivo de salida
 */
async function saveCustomDeploymentFile(targetPath, relativePath, content) {
  const targetFullPath = path.join(targetPath, relativePath);
  const targetDir = path.dirname(targetFullPath);

  await fs.promises.mkdir(targetDir, { recursive: true });
  await fs.promises.writeFile(targetFullPath, content, 'utf-8');

  return {
    success: true,
    relativePath
  };
}

module.exports = {
  DEFAULT_IGNORES,
  shouldIgnore,
  compareDeploymentFolders,
  getFileDiff,
  syncDeploymentFile,
  syncAllDeploymentFiles,
  saveCustomDeploymentFile,
  getFileRawContents,
  getGitRepoInfo,
  gitCheckoutBranch,
  gitPull
};


