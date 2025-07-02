import { InputAction } from '../models/actions';
import { TIME_CONFIG, DEVICE_TYPES } from '../config/constants';

interface DeviceMap {
  [device: string]: { ip: string; type: string };
}

export class ScriptGenerator {
  private static generateHelperFunctions(): string {
    return `
function getAdaptiveBrightness() {
  let hour = (new Date()).getHours();
  return (hour < ${TIME_CONFIG.DARK_END} || hour >= ${TIME_CONFIG.DARK_START}) ? 80 : 50;
}

function handleCallback(result, error_code, error_message) {
  if (error_code) {
    console.log('Error calling RPC: [' + error_code + '] ' + error_message);
  }
}

function executeRpcSequence(urls) {
  let index = 0;
  function executeNext() {
    if (index < urls.length) {
      let url = urls[index];
      // Replace placeholder with actual function call
      url = url.replace("\${getAdaptiveBrightness()}", getAdaptiveBrightness());
      Shelly.call("HTTP.GET", { url: url, timeout: 2 }, handleCallback);
      index++;
      Timer.set(200, executeNext);
    }
  }
  executeNext();
}`.trim();
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
          condition: `event.component === "input:${inputAction.input}" && event.event === "${triggerBlock.trigger}"`,
          actions: calls
        };
      })
    );

    const combinedHandlers = handlers.map(handler => `
  if (${handler.condition}) {
    executeRpcSequence([
${handler.actions.map(url => '      ' + url).join(',\n')}
    ]);
  }`).join("");

    return `${this.generateHelperFunctions()}

Shelly.addEventHandler(function(event) {${combinedHandlers}
});`.trim();
  }
}