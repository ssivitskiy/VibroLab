/**
 * VibroLab — Web Serial API / Web Bluetooth для подключения датчиков.
 *
 * Поддерживаемые протоколы:
 *   - Serial (USB): ADXL345, MPU6050, IIS3DWB и пр. через Arduino/ESP32
 *   - Bluetooth LE: совместимые BLE-акселерометры
 *
 * Формат данных Serial:
 *   Каждая строка: "timestamp,ax,ay,az\n" (CSV через Serial)
 *   или бинарный: 4 × float32 (16 байт на фрейм)
 *
 * Использование:
 *   await Sensor.connectSerial();
 *   Sensor.startRecording(duration, callback);
 *   const data = Sensor.stopRecording();
 */

const Sensor = (() => {
  let port = null;
  let reader = null;
  let isConnected = false;
  let isRecording = false;

  // Buffer
  let buffer = [];
  let recordingBuffer = [];
  let startTime = 0;
  let sampleRate = 0;

  // BLE
  let bleDevice = null;
  let bleChar = null;

  // Callbacks
  let onData = null;      // (sample) => {} — каждый сэмпл
  let onComplete = null;  // (data) => {} — запись завершена

  // Config
  const CONFIG = {
    baudRate: 115200,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    bufferSize: 65536,
    // BLE UUIDs (стандартные для акселерометров)
    bleServiceUUID: '00001101-0000-1000-8000-00805f9b34fb',
    bleCharUUID: '00002101-0000-1000-8000-00805f9b34fb',
    // Формат входных данных
    format: 'csv',  // 'csv' или 'binary'
    channels: 3,    // кол-во каналов (ax, ay, az)
    primaryChannel: 0,  // основной канал для анализа (0 = ax)
  };

  // ═══════════════════════════════════════════════════
  // WEB SERIAL API
  // ═══════════════════════════════════════════════════

  /**
   * Проверяет поддержку Web Serial API.
   */
  function isSerialSupported() {
    return 'serial' in navigator;
  }

  /**
   * Проверяет поддержку Web Bluetooth.
   */
  function isBLESupported() {
    return 'bluetooth' in navigator;
  }

  /**
   * Подключение к Serial порту (USB датчик).
   */
  async function connectSerial(options = {}) {
    if (!isSerialSupported()) {
      throw new Error('Web Serial API не поддерживается. Используйте Chrome/Edge.');
    }

    const baudRate = options.baudRate || CONFIG.baudRate;

    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate, dataBits: CONFIG.dataBits,
                        stopBits: CONFIG.stopBits, parity: CONFIG.parity,
                        bufferSize: CONFIG.bufferSize });

      isConnected = true;
      buffer = [];
      console.log(`[SENSOR] Serial connected @ ${baudRate} baud`);

      // Начинаем чтение
      _readSerialLoop();

      return { type: 'serial', baudRate };
    } catch (e) {
      console.error('[SENSOR] Serial connect failed:', e);
      throw e;
    }
  }

  /**
   * Цикл чтения данных из Serial.
   */
  async function _readSerialLoop() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    reader = textDecoder.readable.getReader();

    let lineBuffer = '';

    try {
      while (isConnected) {
        const { value, done } = await reader.read();
        if (done) break;

        lineBuffer += value;
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop(); // неполная строка

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const sample = _parseSample(trimmed);
          if (sample) {
            buffer.push(sample);

            if (isRecording) {
              recordingBuffer.push(sample);
            }

            if (onData) onData(sample);
          }
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('[SENSOR] Read error:', e);
      }
    }
  }

  /**
   * Парсит одну строку данных.
   * Формат CSV: "timestamp,ax,ay,az" или "ax,ay,az"
   * Формат simple: "value"
   */
  function _parseSample(line) {
    const parts = line.split(/[,\t;]/).map(s => s.trim());
    const nums = parts.map(Number).filter(n => !isNaN(n));

    if (nums.length === 0) return null;

    const ts = Date.now();

    if (nums.length >= 4) {
      // timestamp, ax, ay, az
      return { t: nums[0], ax: nums[1], ay: nums[2], az: nums[3], ts };
    } else if (nums.length === 3) {
      // ax, ay, az
      return { ax: nums[0], ay: nums[1], az: nums[2], ts };
    } else if (nums.length === 1) {
      // single value
      return { ax: nums[0], ts };
    }

    return { values: nums, ts };
  }

  // ═══════════════════════════════════════════════════
  // WEB BLUETOOTH
  // ═══════════════════════════════════════════════════

  /**
   * Подключение к BLE акселерометру.
   */
  async function connectBLE(options = {}) {
    if (!isBLESupported()) {
      throw new Error('Web Bluetooth не поддерживается. Используйте Chrome.');
    }

    const serviceUUID = options.serviceUUID || CONFIG.bleServiceUUID;
    const charUUID = options.charUUID || CONFIG.bleCharUUID;

    try {
      bleDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [serviceUUID] }],
        optionalServices: [serviceUUID],
      });

      const server = await bleDevice.gatt.connect();
      const service = await server.getPrimaryService(serviceUUID);
      bleChar = await service.getCharacteristic(charUUID);

      await bleChar.startNotifications();
      bleChar.addEventListener('characteristicvaluechanged', _onBLEData);

      isConnected = true;
      buffer = [];
      console.log(`[SENSOR] BLE connected: ${bleDevice.name}`);

      return { type: 'ble', name: bleDevice.name };
    } catch (e) {
      console.error('[SENSOR] BLE connect failed:', e);
      throw e;
    }
  }

  function _onBLEData(event) {
    const value = event.target.value;
    const sample = {
      ax: value.getFloat32(0, true),
      ay: value.getFloat32(4, true),
      az: value.getFloat32(8, true),
      ts: Date.now(),
    };

    buffer.push(sample);
    if (isRecording) recordingBuffer.push(sample);
    if (onData) onData(sample);
  }

  // ═══════════════════════════════════════════════════
  // RECORDING
  // ═══════════════════════════════════════════════════

  /**
   * Начинает запись сигнала.
   * @param {number} duration — длительность в секундах (0 = бесконечно)
   * @param {function} callback — вызывается по завершении записи
   */
  function startRecording(duration = 0, callback = null) {
    recordingBuffer = [];
    startTime = Date.now();
    isRecording = true;
    onComplete = callback;

    console.log(`[SENSOR] Recording started (${duration || '∞'}s)`);

    if (duration > 0) {
      setTimeout(() => {
        if (isRecording) stopRecording();
      }, duration * 1000);
    }
  }

  /**
   * Останавливает запись и возвращает данные.
   * @returns {{signal: Float64Array, sampleRate: number, duration: number, channels: object}}
   */
  function stopRecording() {
    isRecording = false;
    const elapsed = (Date.now() - startTime) / 1000;

    if (recordingBuffer.length === 0) {
      console.warn('[SENSOR] Empty recording');
      return null;
    }

    // Определяем sample rate из timestamps
    const timestamps = recordingBuffer.map(s => s.ts);
    if (timestamps.length > 1) {
      const dt = (timestamps[timestamps.length - 1] - timestamps[0]) / (timestamps.length - 1);
      sampleRate = Math.round(1000 / dt); // ms → Hz
    } else {
      sampleRate = VM.FS;
    }

    // Извлекаем основной канал
    const ch = CONFIG.primaryChannel;
    const channelKey = ch === 0 ? 'ax' : ch === 1 ? 'ay' : 'az';
    const signal = new Float64Array(recordingBuffer.map(s => s[channelKey] || 0));

    // Все каналы
    const channels = {
      ax: new Float64Array(recordingBuffer.map(s => s.ax || 0)),
      ay: new Float64Array(recordingBuffer.map(s => s.ay || 0)),
      az: new Float64Array(recordingBuffer.map(s => s.az || 0)),
    };

    const result = {
      signal,
      sampleRate,
      duration: elapsed,
      samples: signal.length,
      channels,
      primaryChannel: channelKey,
    };

    console.log(`[SENSOR] Recording: ${signal.length} samples, ` +
                `${sampleRate} Hz, ${elapsed.toFixed(2)}s`);

    if (onComplete) onComplete(result);

    return result;
  }

  // ═══════════════════════════════════════════════════
  // DISCONNECT & STATUS
  // ═══════════════════════════════════════════════════

  /**
   * Отключает датчик.
   */
  async function disconnect() {
    isConnected = false;
    isRecording = false;

    if (reader) {
      try { await reader.cancel(); } catch (e) {}
      reader = null;
    }
    if (port) {
      try { await port.close(); } catch (e) {}
      port = null;
    }
    if (bleDevice && bleDevice.gatt.connected) {
      bleDevice.gatt.disconnect();
      bleDevice = null;
    }

    buffer = [];
    console.log('[SENSOR] Disconnected');
  }

  /**
   * Отправляет команду на датчик (Serial).
   */
  async function sendCommand(cmd) {
    if (!port || !port.writable) return;
    const encoder = new TextEncoder();
    const writer = port.writable.getWriter();
    await writer.write(encoder.encode(cmd + '\n'));
    writer.releaseLock();
  }

  /**
   * Текущее состояние.
   */
  function getStatus() {
    return {
      connected: isConnected,
      recording: isRecording,
      bufferSize: buffer.length,
      recordingSize: recordingBuffer.length,
      sampleRate,
      serialSupported: isSerialSupported(),
      bleSupported: isBLESupported(),
    };
  }

  /**
   * Возвращает последние N сэмплов из буфера (для live-визуализации).
   */
  function getLastSamples(n = 2560) {
    const start = Math.max(0, buffer.length - n);
    const samples = buffer.slice(start);
    const channelKey = CONFIG.primaryChannel === 0 ? 'ax'
      : CONFIG.primaryChannel === 1 ? 'ay' : 'az';
    return new Float64Array(samples.map(s => s[channelKey] || 0));
  }

  /**
   * Устанавливает callback для каждого сэмпла.
   */
  function setOnData(callback) {
    onData = callback;
  }

  /**
   * Конфигурирует параметры подключения.
   */
  function configure(options) {
    Object.assign(CONFIG, options);
  }

  return {
    // Connection
    connectSerial, connectBLE, disconnect,
    // Recording
    startRecording, stopRecording,
    // Status
    getStatus, isSerialSupported, isBLESupported,
    // Data
    getLastSamples, setOnData, sendCommand,
    // Config
    configure,
  };
})();
