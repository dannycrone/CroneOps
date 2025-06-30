import { InputAction } from '../models/actions';
import { TIME_CONFIG, DEVICE_TYPES } from '../config/constants';

interface DeviceMap {
  [device: string]: { ip: string; type: string };
}

export class ScriptGenerator {
  private static generateHeader(): string {
    return `
let darkStart = ${TIME_CONFIG.DARK_START};
let darkEnd = ${TIME_CONFIG.DARK_END};
let hour = (new Date()).getHours();
let isDark = hour < darkEnd || hour >= darkStart;
let adaptiveBrightness = isDark ? 80 : 50;`.trim();
  }

  private static generateActionCalls(
    action: { device: string; output: number; brightness: "adaptive" | "on" | "off" | number },
    target: { type: string; ip: string },
    isLocal: boolean,
    allOutputs: boolean = false
  ): { localCall?: string; remoteFrame?: string } {
    const isOn = action.brightness !== "off";
    const brightnessSource = typeof action.brightness === "number"
      ? action.brightness
      : action.brightness === "adaptive"
      ? "${adaptiveBrightness}"
      : null;

    let method: string;
    let params: Record<string, any> = {};

    if (target.type === DEVICE_TYPES.DIMMER) {
      if (allOutputs) {
        method = "Light.SetAll";
        params = { on: isOn };
        if (brightnessSource) {
          params.brightness = brightnessSource;
        }
      } else {
        method = "Light.Set";
        params = { id: action.output, on: isOn };
        if (brightnessSource) {
          params.brightness = brightnessSource;
        }
      }
    } else {
      method = "Switch.Set";
      params = { id: action.output, on: isOn };
    }

    if (isLocal) {
      // For local calls, construct the params object with proper template literal for adaptive brightness
      const paramsStr = Object.entries(params)
        .map(([key, value]) => {
          if (key === 'brightness' && value === '${adaptiveBrightness}') {
            return `"${key}": \`${value}\``;
          }
          return `"${key}": ${JSON.stringify(value)}`;
        })
        .join(', ');
      return {
        localCall: `Shelly.call("${method}", { ${paramsStr} });`
      };
    } else {
      const rpcFrame = {
        method,
        params
      };
      return { remoteFrame: JSON.stringify(rpcFrame) };
    }
  }

  static generate(inputActions: InputAction[], localDevice: string, allDevices: DeviceMap): string {
    const processActions = (triggerBlock: typeof inputActions[0]['actions'][0], input: number) => {
      const localCalls: string[] = [];
      const remoteBatches: { [ip: string]: string[] } = {};

      // Group actions by device to detect when all outputs are being set
      const deviceActions = new Map<string, typeof triggerBlock.set>();
      for (const action of triggerBlock.set) {
        if (!deviceActions.has(action.device)) {
          deviceActions.set(action.device, []);
        }
        deviceActions.get(action.device)!.push(action);
      }

      for (const [device, actions] of deviceActions) {
        const target = allDevices[device];
        const isLocal = device === localDevice;

        if (target.type === DEVICE_TYPES.DIMMER && actions.length === 2 &&
            actions.every(a => a.brightness === actions[0].brightness)) {
          // All outputs on dimmer being set to same state - use SetAll
          const { localCall, remoteFrame } = this.generateActionCalls(
            actions[0],
            target,
            isLocal,
            true
          );

          if (localCall) {
            localCalls.push(localCall);
          } else if (remoteFrame) {
            if (!remoteBatches[target.ip]) remoteBatches[target.ip] = [];
            remoteBatches[target.ip].push(remoteFrame);
          }
        } else {
          // Handle individual outputs
          for (const action of actions) {
            const { localCall, remoteFrame } = this.generateActionCalls(
              action,
              target,
              isLocal,
              false
            );

            if (localCall) {
              localCalls.push(localCall);
            } else if (remoteFrame) {
              if (!remoteBatches[target.ip]) remoteBatches[target.ip] = [];
              remoteBatches[target.ip].push(remoteFrame);
            }
          }
        }
      }

      const remoteCalls = Object.entries(remoteBatches).map(([ip, frames]) => {
        const rpcCalls = frames.map(frame => {
          const rpcData = JSON.parse(frame);
          const queryParams = Object.entries(rpcData.params)
            .map(([key, value]) => `${key}=${String(value)}`)
            .join("&");
          return `Shelly.call("HTTP.GET", {
            url: \`http://${ip}/rpc/${rpcData.method}?${queryParams}\`,
            timeout: 2
          });`;
        });
        return rpcCalls.join("\n    ");
      });

      return {
        condition: `event.component === "input:${input}" && event.event === "${triggerBlock.trigger}"`,
        actions: localCalls.concat(remoteCalls)
      };
    };

    // Process all input actions and their triggers
    const allHandlers = inputActions.flatMap(inputAction =>
      inputAction.actions.map(triggerBlock =>
        processActions(triggerBlock, inputAction.input)
      )
    );

    // Combine all handlers into a single event handler
    const combinedHandlers = allHandlers.map(handler => `
  if (${handler.condition}) {
    ${handler.actions.join("\n    ")}
  }`).join("");

    return `Shelly.addEventHandler(function (event) {
${this.generateHeader()}${combinedHandlers}
});`.trim();
  }
}