/**
 * VibroLab — WAV ↔ CSV конвертер (в браузере).
 * Читает/создаёт WAV и CSV файлы, парсит загруженные файлы.
 */

const Converter = (() => {

  /**
   * Читает WAV-файл из ArrayBuffer → {sampleRate, data: Float64Array}
   */
  function readWAV(buffer) {
    const view = new DataView(buffer);
    // Validate RIFF header
    const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
    if (riff !== 'RIFF') throw new Error('Не WAV-файл');
    const wave = String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11));
    if (wave !== 'WAVE') throw new Error('Не WAV-формат');

    let offset = 12;
    let sampleRate = 0, bitsPerSample = 16, numChannels = 1;
    let audioData = null;

    while (offset < buffer.byteLength - 8) {
      const chunkId = String.fromCharCode(
        view.getUint8(offset), view.getUint8(offset+1),
        view.getUint8(offset+2), view.getUint8(offset+3)
      );
      const chunkSize = view.getUint32(offset + 4, true);
      offset += 8;

      if (chunkId === 'fmt ') {
        numChannels = view.getUint16(offset + 2, true);
        sampleRate = view.getUint32(offset + 4, true);
        bitsPerSample = view.getUint16(offset + 14, true);
      } else if (chunkId === 'data') {
        const nSamples = chunkSize / (bitsPerSample / 8);
        const nFrames = Math.floor(nSamples / numChannels);
        audioData = new Float64Array(nFrames);

        if (bitsPerSample === 16) {
          for (let i = 0; i < nFrames; i++) {
            const pos = offset + i * numChannels * 2;
            audioData[i] = view.getInt16(pos, true) / 32768.0;
          }
        } else if (bitsPerSample === 32) {
          for (let i = 0; i < nFrames; i++) {
            const pos = offset + i * numChannels * 4;
            audioData[i] = view.getFloat32(pos, true);
          }
        } else {
          throw new Error(`Не поддерживается: ${bitsPerSample}-bit WAV`);
        }
      }
      offset += chunkSize;
      if (chunkSize % 2 !== 0) offset++; // padding
    }

    if (!audioData) throw new Error('Нет аудиоданных в файле');
    return { sampleRate, data: audioData };
  }

  /**
   * Читает CSV/TSV (text) → channels info.
   * Supports SEU tab-separated format with headers AND simple CSV.
   */
  function readCSV(text, preferredChannel = null) {
    const lines = text.replace(/\r/g, '').trim().split('\n');
    if (lines.length < 2) throw new Error('Файл слишком короткий');

    const metadata = {
      title: null,
      settings: {},
      sourceFormat: 'table',
      explicitDataSection: false,
    };

    // Detect SEU format: skip header lines until we find numeric data
    let dataStart = 0;
    let sep = '\t';

    for (let i = 0; i < Math.min(80, lines.length); i++) {
      const rawLine = lines[i];
      const line = rawLine.trim();
      if (!line) continue;
      const lower = line.toLowerCase();
      const parts = rawLine.split('\t').map((part) => part.trim()).filter(Boolean);
      const numbers = rawLine.match(/-?\d+(?:\.\d+)?/g) || [];

      if (lower.startsWith('title')) {
        metadata.title = parts[1] || line.split(':').slice(1).join(':').trim() || metadata.title;
      } else if (lower.includes('frequency') && lower.includes('limit') && numbers.length) {
        metadata.settings.freqLimit = Number(numbers[numbers.length - 1]);
      } else if (lower.includes('spectral') && lower.includes('lines') && numbers.length) {
        metadata.settings.spectralLines = Number(numbers[numbers.length - 1]);
      } else if (lower.includes('number') && lower.includes('blocks') && numbers.length) {
        metadata.settings.blocks = Number(numbers[numbers.length - 1]);
      } else if (lower.includes('total') && lower.includes('data') && lower.includes('rows') && numbers.length) {
        metadata.settings.totalRows = Number(numbers[numbers.length - 1]);
      } else if (lower === 'data') {
        metadata.sourceFormat = 'seu_structured';
        metadata.explicitDataSection = true;
        dataStart = i + 1;
        sep = '\t';
        break;
      }
    }

    if (!metadata.explicitDataSection) {
      for (let i = 0; i < Math.min(30, lines.length); i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Try to parse as all numbers (tab or comma separated)
        const tabParts = line.split('\t').map(s => s.trim()).filter(s => s);
        const commaParts = line.split(',').map(s => s.trim()).filter(s => s);

        let nums = [];
        let isSep = '\t';

        // Try tab first (SEU format)
        if (tabParts.length >= 2 && tabParts.every(p => !isNaN(parseFloat(p)))) {
          nums = tabParts.map(Number);
          isSep = '\t';
        }
        // Then comma (CSV format)
        else if (commaParts.length >= 2 && commaParts.every(p => !isNaN(parseFloat(p)))) {
          nums = commaParts.map(Number);
          isSep = ',';
        }

        if (nums.length >= 2) {
          dataStart = i;
          sep = isSep;
          break;
        }
      }
    }

    // Also check for CSV header
    const firstDataLine = lines[dataStart];
    const testParts = firstDataLine.split(sep === '\t' ? '\t' : /[,;\t]/).map(s => s.trim()).filter(s => s);
    const isHeader = testParts.some(s => isNaN(parseFloat(s)) && s.length > 0);
    let headers = null;
    if (isHeader) {
      headers = testParts;
      dataStart++;
    }

    // Parse numeric data
    const columns = [];
    let nCols = 0;

    for (let i = dataStart; i < lines.length; i++) {
      const parts = lines[i].split(sep === '\t' ? '\t' : /[,;\t]/).map(s => s.trim()).filter(s => s);
      const nums = [];
      for (const p of parts) {
        const v = parseFloat(p);
        if (!isNaN(v)) nums.push(v);
      }
      if (nums.length < 2) continue;
      if (nCols === 0) {
        nCols = nums.length;
        for (let c = 0; c < nCols; c++) columns.push([]);
      }
      for (let c = 0; c < Math.min(nCols, nums.length); c++) {
        columns[c].push(nums[c]);
      }
    }

    if (columns.length === 0 || columns[0].length === 0) throw new Error('Нет числовых данных');

    // Build channels
    const channels = columns.map((col, c) => ({
      name: headers && c < headers.length ? headers[c] :
            nCols === 8 ? `ch${c+1}` :
            nCols === 4 ? `a${c+1}` : `col_${c}`,
      index: c,
      data: new Float64Array(col)
    }));

    // Select channel
    let selected = null;

    if (preferredChannel !== null) {
      selected = channels.find(ch => ch.name === preferredChannel || ch.index === preferredChannel);
    }

    if (!selected) {
      const ampNames = ['amplitude','amp','value','signal','vibration'];
      selected = channels.find(ch => ampNames.includes(ch.name.toLowerCase()));
    }

    // For 8-channel SEU data: prefer channel 6 (index 5) = parallel gearbox X
    if (!selected && nCols === 8) {
      selected = channels[5]; // Channel 6
    }

    // For 4-channel data: prefer first channel
    if (!selected) {
      const vibCols = channels.filter(ch => /^(a\d|acc|vib|ch|sensor)/i.test(ch.name));
      if (vibCols.length > 0) selected = vibCols[0];
    }

    if (!selected) {
      const skip = ['sample_index','index','time','time_s','t','timestamp'];
      const data = channels.filter(ch => !skip.includes(ch.name.toLowerCase()));
      selected = data.length > 0 ? data[0] : channels[0];
    }

    metadata.totalChannels = nCols;
    metadata.rows = columns[0]?.length || 0;

    return { channels, selected: selected.data, selectedName: selected.name, metadata };
  }

  /**
   * Создаёт WAV-файл из массива амплитуд → Blob
   */
  function createWAV(data, sampleRate = VM.FS) {
    // Normalize
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      if (a > peak) peak = a;
    }
    const scale = peak > 0 ? 0.95 / peak : 1;

    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = data.length * blockAlign;
    const bufferSize = 44 + dataSize;

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    for (let i = 0; i < data.length; i++) {
      const sample = Math.max(-1, Math.min(1, data[i] * scale));
      view.setInt16(44 + i * 2, sample * 32767, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Создаёт CSV из массива амплитуд → Blob
   */
  function createCSV(data, sampleRate = VM.FS) {
    let csv = 'sample_index,time_s,amplitude\n';
    for (let i = 0; i < data.length; i++) {
      csv += `${i},${(i / sampleRate).toFixed(8)},${data[i].toFixed(8)}\n`;
    }
    return new Blob([csv], { type: 'text/csv' });
  }

  /**
   * Читает MATLAB .mat v5 файл (Level 5 MAT-File).
   * Упрощённый парсер для основного use case: один числовой массив.
   */
  function readMAT(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    // Header: первые 116 байт — описание, 8 байт — версия + endian
    const headerText = String.fromCharCode(...bytes.slice(0, 116)).trim();
    const version = view.getUint16(124, true);
    const endianMark = String.fromCharCode(bytes[126], bytes[127]);
    const littleEndian = endianMark === 'IM';

    let offset = 128;
    let bestData = null;
    let bestSize = 0;

    // Читаем data elements
    while (offset < buffer.byteLength - 8) {
      try {
        const dataType = view.getUint32(offset, littleEndian);
        const numBytes = view.getUint32(offset + 4, littleEndian);
        offset += 8;

        // Small Data Element Format (packed in tag)
        if ((dataType >> 16) !== 0) {
          const smallType = dataType & 0xFFFF;
          const smallSize = dataType >> 16;
          offset -= 4; // re-read
          offset += 4 + Math.ceil(smallSize / 8) * 8;
          continue;
        }

        // miMATRIX (type 14)
        if (dataType === 14) {
          const matrixEnd = offset + numBytes;
          // Parse matrix sub-elements
          let arrayData = null;
          let innerOffset = offset;

          while (innerOffset < matrixEnd - 8) {
            let subType = view.getUint32(innerOffset, littleEndian);
            let subSize;
            let subOffset;

            // Small Data Element
            if ((subType >> 16) !== 0) {
              subSize = subType >> 16;
              subType = subType & 0xFFFF;
              subOffset = innerOffset + 4;
              innerOffset += 8;
            } else {
              subSize = view.getUint32(innerOffset + 4, littleEndian);
              subOffset = innerOffset + 8;
              innerOffset += 8 + Math.ceil(subSize / 8) * 8;
            }

            // miDOUBLE (9) = 64-bit float
            if (subType === 9 && subSize > 8) {
              const nDoubles = Math.floor(subSize / 8);
              const arr = new Float64Array(nDoubles);
              for (let i = 0; i < nDoubles; i++) {
                arr[i] = view.getFloat64(subOffset + i * 8, littleEndian);
              }
              if (nDoubles > bestSize) {
                bestData = arr;
                bestSize = nDoubles;
              }
            }
            // miSINGLE (7) = 32-bit float
            else if (subType === 7 && subSize > 4) {
              const nFloats = Math.floor(subSize / 4);
              const arr = new Float64Array(nFloats);
              for (let i = 0; i < nFloats; i++) {
                arr[i] = view.getFloat32(subOffset + i * 4, littleEndian);
              }
              if (nFloats > bestSize) {
                bestData = arr;
                bestSize = nFloats;
              }
            }
            // miINT16 (3) = 16-bit int
            else if (subType === 3 && subSize > 2) {
              const nInts = Math.floor(subSize / 2);
              const arr = new Float64Array(nInts);
              for (let i = 0; i < nInts; i++) {
                arr[i] = view.getInt16(subOffset + i * 2, littleEndian);
              }
              if (nInts > bestSize) {
                bestData = arr;
                bestSize = nInts;
              }
            }
          }
          offset = matrixEnd;
        } else {
          offset += Math.ceil(numBytes / 8) * 8;
        }
      } catch (e) {
        break;
      }
    }

    if (!bestData || bestData.length < 10) {
      throw new Error('Не удалось извлечь данные из .mat файла. Попробуйте конвертировать в CSV через Python.');
    }

    return { data: bestData, sampleRate: VM.FS };
  }

  /**
   * Читает .npy файл (NumPy binary) → Float64Array.
   */
  function readNPY(buffer) {
    const bytes = new Uint8Array(buffer);
    // Magic: \x93NUMPY
    if (bytes[0] !== 0x93 || bytes[1] !== 0x4E) {
      throw new Error('Не NPY файл');
    }
    const major = bytes[6];
    const headerLen = (major >= 2)
      ? new DataView(buffer, 8, 4).getUint32(0, true)
      : new DataView(buffer, 8, 2).getUint16(0, true);
    const headerStart = (major >= 2) ? 12 : 10;
    const headerStr = String.fromCharCode(...bytes.slice(headerStart, headerStart + headerLen));

    // Parse dtype from header
    const dtypeMatch = headerStr.match(/'descr':\s*'([^']+)'/);
    const dtype = dtypeMatch ? dtypeMatch[1] : '<f8';

    const dataOffset = headerStart + headerLen;
    const view = new DataView(buffer, dataOffset);
    const littleEndian = dtype[0] === '<' || dtype[0] === '=';

    let data;
    if (dtype.includes('f8')) {
      const n = Math.floor((buffer.byteLength - dataOffset) / 8);
      data = new Float64Array(n);
      for (let i = 0; i < n; i++) data[i] = view.getFloat64(i * 8, littleEndian);
    } else if (dtype.includes('f4')) {
      const n = Math.floor((buffer.byteLength - dataOffset) / 4);
      data = new Float64Array(n);
      for (let i = 0; i < n; i++) data[i] = view.getFloat32(i * 4, littleEndian);
    } else {
      throw new Error(`NPY dtype ${dtype} не поддерживается`);
    }

    return { data, sampleRate: VM.FS };
  }

  /**
   * Парсит загруженный файл (WAV, CSV, MAT, NPY) → {data, sampleRate}
   */
  async function parseFile(file, preferredChannel) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'wav' || ext === 'wave') {
      const buf = await file.arrayBuffer();
      const { sampleRate, data } = readWAV(buf);
      return { data, sampleRate, format: 'wav', name: file.name, channels: null };
    } else if (ext === 'mat') {
      const buf = await file.arrayBuffer();
      const { data, sampleRate } = readMAT(buf);
      return { data, sampleRate, format: 'mat', name: file.name, channels: null };
    } else if (ext === 'npy') {
      const buf = await file.arrayBuffer();
      const { data, sampleRate } = readNPY(buf);
      return { data, sampleRate, format: 'npy', name: file.name, channels: null };
    } else if (ext === 'csv' || ext === 'tsv' || ext === 'txt' || ext === 'dat') {
      const text = await file.text();
      const { channels, selected, selectedName, metadata } = readCSV(text, preferredChannel || null);
      return {
        data: selected, sampleRate: VM.FS, format: 'csv', name: file.name,
        channels: channels.length > 1 ? channels : null,
        selectedChannel: selectedName,
        metadata,
      };
    } else {
      throw new Error(`Формат .${ext} не поддерживается. Используйте WAV, CSV, MAT или NPY.`);
    }
  }

  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  /**
   * Скачивает Blob как файл.
   */
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return { readWAV, readCSV, readMAT, readNPY, createWAV, createCSV, parseFile, download };
})();
