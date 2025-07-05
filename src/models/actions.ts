export interface InputAction {
  device: string;
  input: number;
  actions: TriggerBlock[];
}

export interface TriggerBlock {
  trigger: string;
  set: Action[];
}

export interface ActionSet {
  device: string;
  input: number;
  actions: {
    trigger: string;
    set: Action[];
  }[];
}

export type BrightnessType = "adaptive" | "on" | "off" | "nightonlylow" | 'lowLight' | 'midLight' | 'highLight' | 'maxLight' | number;

export interface Action {
  device: string;
  output: number;
  brightness: BrightnessType;
}
