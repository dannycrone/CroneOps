export interface ShellyDevice {
  name: string;
  ip: string;
  mac: string;
  type: "relay" | "dimmer";
  inputs: Input[];
  outputs: Output[];
}

export interface Output {
  index: number;
  location: string;
  circuit: string;
}

export interface Input {
  index: number;
  location: string;
  circuit: string;
}
