
interface Action {
  device: string;
  output: number;
  on: boolean;
  brightness?: number;
}
interface TriggerBlock {
  trigger: string;
  when?: string;
  set: Action[];
}
interface InputAction {
  device: string;
  input: number;
  actions: TriggerBlock[];
}
interface DeviceMap {
  [device: string]: { ip: string; type: string };
}

export function generateScript(inputAction: InputAction, localDevice: string, allDevices: DeviceMap): string {
  const hourCheck = `
let hour = (new Date()).getHours();
let isDark = hour < 6 || hour >= 20;`;

  const handlers = inputAction.actions.map(triggerBlock => {
    const condition = triggerBlock.when
      ? ` && ${triggerBlock.when === "dark" ? "isDark" : "!isDark"}`
      : "";

    const localCalls: string[] = [];
    const remoteBatches: { [ip: string]: string[] } = {};

    for (const action of triggerBlock.set) {
      const target = allDevices[action.device];
      const method = target.type === "dimmer" ? "Light.Set" : "Switch.Set";
      const args = [`id: ${action.output}`, `on: ${action.on}`];
      if (action.brightness !== undefined) args.push(`brightness: ${action.brightness}`);

      if (action.device === localDevice) {
        localCalls.push(`${method}({ ${args.join(", ")} });`);
      } else {
        const frameArgs = args.map(a => a.replace(": ", ":")).join(", ");
        const rpcFrame = `{ "id": ${action.output}, "method": "${method}", "params": { ${frameArgs} } }`;
        if (!remoteBatches[target.ip]) remoteBatches[target.ip] = [];
        remoteBatches[target.ip].push(rpcFrame);
      }
    }

    const remoteCalls = Object.entries(remoteBatches).map(([ip, frames]) => {
      const payload = `[${frames.join(",")}]`;
      return `Shelly.call("HTTP.POST", {
        url: "http://${ip}/rpc",
        body: \`${payload}\`,
        headers: { "Content-Type": "application/json" }
      });`;
    });

    return `
  if (event.component === "input:${inputAction.input}" && event.event === "${triggerBlock.trigger}"${condition}) {
    ${localCalls.concat(remoteCalls).join("\n    ")}
  }`;
  });

  return `Shelly.addEventHandler(function (event) {
${hourCheck}
${handlers.join("")}
});`.trim();
}
