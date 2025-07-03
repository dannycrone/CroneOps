import axios from 'axios';
import { minify } from 'terser';
import { API_ENDPOINTS, DEFAULT_CONFIG, DEVICE_TYPES } from '../config/constants';
import { ShellyDevice } from '../models/shelly';

type UploadMethod = 'compress' | 'chunk';

export class DeviceConfigurer {
  private readonly baseUrl: string;

  constructor(private device: ShellyDevice, private password: string) {
    this.baseUrl = `http://${device.ip}`;
  }

  async configureBasicSettings(lat: number, lon: number): Promise<void> {
    await axios.post(`${this.baseUrl}/${API_ENDPOINTS.SYS_CONFIG}`, {
      config: {
        device: { name: this.device.name },
        location: {
          tz: DEFAULT_CONFIG.TIMEZONE,
          lat,
          lon
        },
      }
    });
  }

  async configureWiFi(): Promise<void> {
    await axios.post(`${this.baseUrl}/${API_ENDPOINTS.WIFI_CONFIG}`, {
      config: {
        ap: {
          ssid: this.device.name,
          pass: this.password,
          is_open: false,
          enable: DEFAULT_CONFIG.WIFI.AP_ENABLED,
        },
        sta: { enable: DEFAULT_CONFIG.WIFI.STA_ENABLED },
        sta1: { enable: DEFAULT_CONFIG.WIFI.STA1_ENABLED },
      }
    });
  }

  async configureInputs(): Promise<void> {
    const promises = Array.from({ length: 4 }, (_, i) =>
      axios.post(`${this.baseUrl}/${API_ENDPOINTS.INPUT_CONFIG}`, {
        id: i,
        config: { type: DEFAULT_CONFIG.INPUT_TYPE }
      })
    );
    await Promise.all(promises);
  }

  async configureOutputs(): Promise<void> {
    const outputCount = this.device.type === DEVICE_TYPES.DIMMER ? 2 : 4;
    const endpoint = this.device.type === DEVICE_TYPES.DIMMER ? 'Light.SetConfig' : 'Switch.SetConfig';
    
    const promises = Array.from({ length: outputCount }, (_, i) =>
      axios.post(`${this.baseUrl}/rpc/${endpoint}`, {
        id: i,
        config: DEFAULT_CONFIG.OUTPUT
      })
    );
    await Promise.all(promises);
  }

  async clearExistingScripts(): Promise<void> {
    const { data: existing } = await axios.get(`${this.baseUrl}/${API_ENDPOINTS.SCRIPT_LIST}`);
    await Promise.all(
      existing.scripts.map((s: { id: number }) =>
        axios.post(`${this.baseUrl}/${API_ENDPOINTS.SCRIPT_DELETE}`, { id: s.id })
      )
    );
  }

  private async minifyCode(code: string): Promise<string> {
    try {
      const result = await minify(code, {
        compress: {
          dead_code: true,
          drop_console: false,
          drop_debugger: true,
          keep_fnames: true,
          keep_classnames: true
        },
        mangle: {
          keep_fnames: true,
          keep_classnames: true
        }
      });
      return result.code || code;
    } catch (error) {
      console.warn('Minification failed, using original code:', error);
      return code;
    }
  }

  private chunkString(input: string, chunkSizeBytes: number = 1024): string[] {
    const chunks: string[] = [];
    let offset = 0;

    while (offset < input.length) {
      chunks.push(input.slice(offset, offset + chunkSizeBytes));
      offset += chunkSizeBytes;
    }

    return chunks;
  }

  private async uploadChunked(id: number, code: string, chunkSizeBytes: number = 1024): Promise<void> {
    const chunks = this.chunkString(code, chunkSizeBytes);
    
    for (let i = 0; i < chunks.length; i++) {
      const isFirst = i === 0;
      const chunk = chunks[i];
      
      await axios.post(`${this.baseUrl}/${API_ENDPOINTS.SCRIPT_PUT_CODE}`, {
        id,
        code: chunk,
        append: !isFirst
      });
      
      console.log(`Uploaded chunk ${i + 1}/${chunks.length} (${chunk.length } bytes)`);
    }
  }

  async uploadScript(name: string, code: string, method: UploadMethod = 'compress'): Promise<void> {
    const { data: created } = await axios.post(`${this.baseUrl}/${API_ENDPOINTS.SCRIPT_CREATE}`, {
      name
    });

    const minifiedCode = await this.minifyCode(code);
    console.log(`Original size: ${code.length} bytes`);
    console.log(`Minified size: ${minifiedCode.length} bytes`);
    console.log(`Reduction: ${((code.length - minifiedCode.length) / code.length * 100).toFixed(1)}%`);

    if (method === 'compress') {
      const minifiedCode = await this.minifyCode(code);
      console.log(`Original size: ${code.length} bytes`);
      console.log(`Minified size: ${minifiedCode.length} bytes`);
      console.log(`Reduction: ${((code.length - minifiedCode.length) / code.length * 100).toFixed(1)}%`);

      await axios.post(`${this.baseUrl}/${API_ENDPOINTS.SCRIPT_PUT_CODE}`, {
        id: created.id,
        code: minifiedCode
      });
    } else {
      console.log(`Uploading in chunks (${code.length} bytes total)`);
      await this.uploadChunked(created.id, code);
    }

    await axios.post(`${this.baseUrl}/${API_ENDPOINTS.SCRIPT_SET_CONFIG}`, {
      id: created.id,
      config: { enable: true }
    });

    await axios.post(`${this.baseUrl}/${API_ENDPOINTS.SCRIPT_START}`, {
      id: created.id
    });
  }
}