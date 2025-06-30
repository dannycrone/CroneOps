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
    isLocal: boolean
  ): { localCall?: string; remoteFrame?: string } {
    const method = target.type === DEVICE_TYPES.DIMMER ? "Light.Set" : "Switch.Set";
    const brightnessSource = action.brightness === "adaptive" 
      ? "adaptiveBrightness"
      : typeof action.brightness === "number"
      ? action.brightness
      : null;

    const args = [`id: ${action.output}`, `on: ${action.brightness !== "off"}`];
    if (brightnessSource && method === "Light.Set") {
      args.push(`brightness: ${brightnessSource}`);
    }

    if (isLocal) {
      return { localCall: `${method}({ ${args.join(", ")} });` };
    } else {
      const frameArgs = [`id:${action.output}`, `on: ${action.brightness !== "off"}`];
      if (brightnessSource && method === "Light.Set") {
        frameArgs.push(`brightness:${brightnessSource}`);
      }
      const rpcFrame = `{ "id": ${action.output}, "method": "${method}", "params": { ${frameArgs.join(", ")} } }`;
      return { remoteFrame: rpcFrame };
    }
  }

  static generate(inputAction: InputAction, localDevice: string, allDevices: DeviceMap): string {
    const handlers = inputAction.actions.map(triggerBlock => {
      const triggerCondition = `event.component === "input:${inputAction.input}" && event.event === "${triggerBlock.trigger}"`;
      
      const localCalls: string[] = [];
      const remoteBatches: { [ip: string]: string[] } = {};

      for (const action of triggerBlock.set) {
        const target = allDevices[action.device];
        const { localCall, remoteFrame } = this.generateActionCalls(
          action,
          target,
          action.device === localDevice
        );

        if (localCall) {
          localCalls.push(localCall);
        } else if (remoteFrame) {
          if (!remoteBatches[target.ip]) remoteBatches[target.ip] = [];
          remoteBatches[target.ip].push(remoteFrame);
        }
      }

      const remoteCalls = Object.entries(remoteBatches).map(([ip, frames]) => {
        const payload = `[${frames.join(",")}]`;
        return `Shelly.call("HTTP.POST", {
          url: "http://${ip}/rpc",
          body: ${payload},
          headers: { "Content-Type": "application/json" }
        });`;
      });

      return `
  if (${triggerCondition}) {
    ${localCalls.concat(remoteCalls).join("\n    ")}
  }`;
    });

    return `Shelly.addEventHandler(function (event) {
${this.generateHeader()}
${handlers.join("")}
});`.trim();
  }
}