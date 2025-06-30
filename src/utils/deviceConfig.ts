import axios from 'axios';
import { API_ENDPOINTS, DEFAULT_CONFIG, DEVICE_TYPES } from '../config/constants';
import { ShellyDevice } from '../models/shelly';

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

  async uploadScript(name: string, code: string): Promise<void> {
    const { data: created } = await axios.post(`${this.baseUrl}/${API_ENDPOINTS.SCRIPT_CREATE}`, {
      name
    });

    await axios.post(`${this.baseUrl}/${API_ENDPOINTS.SCRIPT_PUT_CODE}`, {
      id: created.id,
      code
    });

    await axios.post(`${this.baseUrl}/${API_ENDPOINTS.SCRIPT_SET_CONFIG}`, {
      id: created.id,
      config: { enable: true }
    });

    await axios.post(`${this.baseUrl}/${API_ENDPOINTS.SCRIPT_START}`, {
      id: created.id
    });
  }
}