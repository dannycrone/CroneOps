export const TIME_CONFIG = {
  DARK_START: 20, // 8 PM
  DARK_END: 6,   // 6 AM
};

export const API_ENDPOINTS = {
  SYS_CONFIG: 'rpc/Sys.SetConfig',
  WIFI_CONFIG: 'rpc/WiFi.SetConfig',
  INPUT_CONFIG: 'rpc/Input.SetConfig',
  SCRIPT_LIST: 'rpc/Script.List',
  SCRIPT_DELETE: 'rpc/Script.Delete',
  SCRIPT_CREATE: 'rpc/Script.Create',
  SCRIPT_PUT_CODE: 'rpc/Script.PutCode',
  SCRIPT_SET_CONFIG: 'rpc/Script.SetConfig',
  SCRIPT_START: 'rpc/Script.Start',
};

export const DEVICE_TYPES = {
  DIMMER: 'dimmer',
  RELAY: 'relay',
} as const;

export const DEFAULT_CONFIG = {
  TIMEZONE: 'Europe/London',
  INPUT_TYPE: 'button',
  WIFI: {
    AP_ENABLED: true,
    STA_ENABLED: false,
    STA1_ENABLED: false,
  },
  OUTPUT: {
    auto_on: false,
    auto_off: false,
    initial_state: 'restore_last',
    in_mode: 'detached',
  },
};