import { InputAction } from "./models/actions";

interface DeviceMap {
  [device: string]: { ip: string; type: string };
}

export function generateScript(inputAction: InputAction, localDevice: string, allDevices: DeviceMap): string {
  const header = `
let darkStart = 20;  // 8 PM
let darkEnd = 6;     // 6 AM
let hour = (new Date()).getHours();
let isDark = hour < darkEnd || hour >= darkStart;
let adaptiveBrightness = isDark ? 80 : 50;`;

  const handlers = inputAction.actions.map(triggerBlock => {
    const triggerCondition = `event.component === "input:${inputAction.input}" && event.event === "${triggerBlock.trigger}"`;

    const localCalls: string[] = [];
    const remoteBatches: { [ip: string]: string[] } = {};

    for (const action of triggerBlock.set) {
      const target = allDevices[action.device];
      const method = target.type === "dimmer" ? "Light.Set" : "Switch.Set";
      const brightnessSource = action.brightness === "adaptive" ? 
        "adaptiveBrightness"
        : typeof action.brightness === "number"
        ? action.brightness
        : null;
      

      const args = [`id: ${action.output}`, `on: ${action.brightness !== "off"}`];
      if (brightnessSource && method === "Light.Set") args.push(`brightness: ${brightnessSource}`);

      if (action.device === localDevice) {
        localCalls.push(`${method}({ ${args.join(", ")} });`);
      } else {
        const frameArgs = [`id:${action.output}`, `on: ${action.brightness !== "off"}`];
        if (brightnessSource && method === "Light.Set") frameArgs.push(`brightness:${brightnessSource}`);
        const rpcFrame = `{ "id": ${action.output}, "method": "${method}", "params": { ${frameArgs.join(", ")} } }`;
        if (!remoteBatches[target.ip]) remoteBatches[target.ip] = [];
        remoteBatches[target.ip].push(rpcFrame);
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
${header}
${handlers.join("")}
});`.trim();
}
