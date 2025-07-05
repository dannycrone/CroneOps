import { BrightnessType as Brightness, InputAction } from '../models/actions';
import { TIME_CONFIG, DEVICE_TYPES, LIGHT_CONFIG } from '../config/constants';
import { ShellyDevice, Input } from '../models/shelly';
import {readFileSync} from 'fs';

interface DeviceFullMap {
  [device: string]: ShellyDevice;
}

export class ScriptGenerator {
  private static getTemplate(): string {
    let template = readFileSync('src/templates/script.js', 'utf8');
    template = template.replace('evening = 20', `evening = ${TIME_CONFIG.DARK_START}`);
    template = template.replace('morning = 6', `morning = ${TIME_CONFIG.DARK_END}`);
    template = template.replace('lowLight = 20', `lowLight = ${LIGHT_CONFIG.LOW_LIGHT}`);
    template = template.replace('midLight = 50', `midLight = ${LIGHT_CONFIG.MID_LIGHT}`);
    template = template.replace('highLight = 80', `highLight = ${LIGHT_CONFIG.HIGH_LIGHT}`);
    return template.replace('maxLight = 100', `maxLight = ${LIGHT_CONFIG.MAX_LIGHT}`)
  }

  private static shouldBeOn(brightness: Brightness): string | boolean {
    if (brightness === "nightonlylow") {
      return '%nightOnly%' // This will be replaced at runtime;
    }
    return brightness !== "off";
  }

  private static generateActionCall(
    action: { device: string; output: number; brightness: Brightness },
    target: ShellyDevice,
    isLocal: boolean,
    allOutputs: boolean = false
  ): string {
    const isOn = this.shouldBeOn(action.brightness); // Default to true for adaptive or number
    const brightnessValue = ScriptGenerator.calcBrightness(action.brightness);

    let method: string;
    let params: string[] = [];

    if (target.type === DEVICE_TYPES.DIMMER) {
      if (allOutputs) {
        method = "Light.SetAll";
        params.push(`on=${isOn}`);
      } else {
        method = "Light.Set";
        params.push(`id=${action.output}`, `on=${isOn}`);
      }
      if (brightnessValue) {
        params.push(`brightness=${brightnessValue}`);
      }
    } else {
      method = "Switch.Set";
      params.push(`id=${action.output}`, `on=${isOn}`);
    }

    const ip = isLocal ? "localhost" : target.ip;
    const query = params.join('&');
    return `"http://${ip}/rpc/${method}?${query}"`;
  }

  private static calcBrightness(brightness: Brightness) : number | string | null {
    let replacedBrightness: number | string | null;
    switch (brightness) {
      case 'on':
      case 'off':
        replacedBrightness = null;
        break;
      case 'nightonlylow':
        replacedBrightness = '%lowLight%';
        break;
      case 'adaptive':
      case 'highLight':
      case 'midLight':
      case 'lowLight':
      case 'maxLight':
        replacedBrightness = `%${brightness}%`;
        break;
      default:
        replacedBrightness = brightness;
    }
    return replacedBrightness;
  }

  static generate(
    inputActions: InputAction[],
    localDevice: string,
    fullDeviceMap: DeviceFullMap
  ): string {
          // Get the full device object if available
    const device = fullDeviceMap?.[localDevice];
    if (!device) return '';
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
          const target = fullDeviceMap[device];
          const isLocal = target.name === localDevice;
          const groupActions = false; // Light.SetAll not working

          if (groupActions && target.type === DEVICE_TYPES.DIMMER && actions.length === 2 &&
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

        const isPir = ScriptGenerator.isPir(device, inputAction.input);
        const trigger = isPir ? 'toggle' : triggerBlock.trigger;
        const pirInvert = isPir && triggerBlock.trigger === 'toggle_off' ? '!' : '';
        const pirCondition = isPir ? ` && ${pirInvert}event.info.state` : '';
        return {
          condition: `event.info.component === "input:${inputAction.input}" && event.info.event === "${trigger}"${pirCondition}`,
          actions: calls
        };
      })
    );

    const combinedHandlers = handlers.map(handler => {
      const match = handler.condition.match(/input:(\d+)/);
      if (!match) return '';
      const input = parseInt(match[1]);
      
      // Find the input in the device that matches this input index
      // Check for PIR circuit if we have the full device info
      const isPir = ScriptGenerator.isPir(device, input);

      if (isPir && (handler.condition.includes('toggle'))) {
        // Generate PIR motion handler
        const isOn = !handler.condition.includes('!event.info.state');
        const urlsArray = '[\n      ' + handler.actions.join(',\n      ') + '\n    ]';
        return `  if (${handler.condition}) {
    handlePirMotion(${input}, ${urlsArray}, ${isOn});
  }`;
      }

      // Standard handler for non-PIR or other trigger types
      return `  if (${handler.condition}) {
${handler.actions.map(url => `    httpGet(${url});`).join('\n')}
  }`;
    }).join("\n");

    return this.getTemplate().replace('// EVENT_HANDLERS', combinedHandlers);
  }

  private static isPir(device: ShellyDevice, input: number) {
    const deviceInput = device?.inputs.find((i: Input) => i.index === input);
    const isPir = deviceInput && deviceInput.circuit.toUpperCase().includes('PIR');
    return isPir;
  }
}