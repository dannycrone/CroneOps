import { InputAction } from '../models/actions';
import { TIME_CONFIG, DEVICE_TYPES } from '../config/constants';
import {readFileSync} from 'fs';

interface DeviceMap {
  [device: string]: { ip: string; type: string };
}

export class ScriptGenerator {
  private static getTemplate(): string {
    const template = readFileSync('src/templates/script.js', 'utf8');
    return template.replace(/6 \|\| hour >= 20/g, `${TIME_CONFIG.DARK_END} || hour >= ${TIME_CONFIG.DARK_START}`);
  }

  private static generateActionCall(
    action: { device: string; output: number; brightness: "adaptive" | "on" | "off" | number },
    target: { type: string; ip: string },
    isLocal: boolean,
    allOutputs: boolean = false
  ): string {
    const isOn = action.brightness !== "off";
    const brightnessValue = action.brightness === "adaptive"
      ? "\${getAdaptiveBrightness()}"  // This will be replaced at runtime
      : typeof action.brightness === "number"
      ? action.brightness
      : null;

    let method: string;
    let params: string[] = [];

    if (target.type === DEVICE_TYPES.DIMMER) {
      if (allOutputs) {
        method = "Light.SetAll";
        params.push(`on=${isOn}`);
        if (brightnessValue) {
          params.push(`brightness=${brightnessValue}`);
        }
      } else {
        method = "Light.Set";
        params.push(`id=${action.output}`, `on=${isOn}`);
        if (brightnessValue) {
          params.push(`brightness=${brightnessValue}`);
        }
      }
    } else {
      method = "Switch.Set";
      params.push(`id=${action.output}`, `on=${isOn}`);
    }

    const ip = isLocal ? "localhost" : target.ip;
    const query = params.join('&');
    return `"http://${ip}/rpc/${method}?${query}"`;
  }

  static generate(inputActions: InputAction[], localDevice: string, allDevices: DeviceMap): string {
    const handlers = inputActions.flatMap(inputAction =>
      inputAction.actions.map(triggerBlock => {
        // Group actions by device to detect when all outputs are being set
        const deviceActions = new Map<string, typeof triggerBlock.set>();
        for (const action of triggerBlock.set) {
          if (!deviceActions.has(action.device)) {
            deviceActions.set(action.device, []);
          }
          deviceActions.get(action.device)!.push(action);
        }

        const calls: string[] = [];
        for (const [device, actions] of deviceActions) {
          const target = allDevices[device];
          const isLocal = device === localDevice;

          if (target.type === DEVICE_TYPES.DIMMER && actions.length === 2 &&
              actions.every(a => a.brightness === actions[0].brightness)) {
            // All outputs on dimmer being set to same state - use SetAll
            calls.push(this.generateActionCall(actions[0], target, isLocal, true));
          } else {
            // Handle individual outputs
            actions.forEach(action => {
              calls.push(this.generateActionCall(action, target, isLocal, false));
            });
          }
        }

        return {
          condition: `event.info.component === "input:${inputAction.input}" && event.info.event === "${triggerBlock.trigger}"`,
          actions: calls
        };
      })
    );

    const combinedHandlers = handlers.map(handler => `  if (${handler.condition}) {
${handler.actions.map(url => `    httpGet(${url});`).join('\n')}
  }`).join("\n");

    return this.getTemplate().replace('// EVENT_HANDLERS', combinedHandlers);
  }
}