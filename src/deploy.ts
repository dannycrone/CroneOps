
import axios from "axios";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { generateScript } from "./generateScript";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const devices = require("../devices.json");
const actions = require("../actions.json");

const GATEWAY = process.env.GATEWAY;
const DNS = process.env.DNS;
const NETMASK = process.env.NETMASK;
const LAT = process.env.LAT;
const LON = process.env.LON;
const PASSWORD = process.env.PASSWORD;

if (!GATEWAY || !DNS || !NETMASK || !LAT || !LON || !PASSWORD) {
  throw new Error("Missing required environment variables");
}

interface Output {
  index: number;
  location: string;
  circuit: string;
}
interface Input {
  index: number;
  location: string;
  circuit: string;
}
interface ShellyDevice {
  name: string;
  ip: string;
  mac: string;
  type: "relay" | "dimmer";
  inputs: Input[];
  outputs: Output[];
}

interface ActionSet {
  device: string;
  input: number;
  actions: {
    trigger: string;
    when?: string;
    set: {
      device: string;
      output: number;
      on: boolean;
      brightness?: number;
    }[];
  }[];
}

async function configureDevice(device: ShellyDevice, allDeviceMap: Record<string, ShellyDevice>) {
  const base = `http://${device.ip}`;
  console.log(`\n⚙️ Configuring ${device.name} (${device.ip})...`);

  await axios.post(`${base}/rpc/Sys.SetConfig`, {
    config: {
      device: {
        name: device.name,
      },
      location: {
        tz: "Europe/London",
        lat: parseFloat(LAT!),
        lon: parseFloat(LON!)
      },
      // eth: {
      //   enable: true,
      //   ipv4_mode: "static",
      //   ip: device.ip,
      //   netmask: NETMASK,
      //   gw: GATEWAY,
      //   dns: DNS
      // },
    }
  });
  console.log(`\n⚙️ Configured ${device.name} (${device.ip})...`);
  await axios.post(`${base}/rpc/WiFi.SetConfig`, {
    config: {
      ap: {
        ssid: device.name,
        pass: PASSWORD,
        is_open: false,
        enable: true,
      },
      sta: {
        enable: false,
      },
      sta1: {
        enable: false,
      },
    }
  });
  console.log(`\n⚙️ Configured ${device.name} WiFi...`);

  for (let i = 0; i < 4; i++) {
    await axios.post(`${base}/rpc/Input.SetConfig`, {
      id: i,
      config: { type: "button" }
    });
  }

  const outputCount = device.type === "dimmer" ? 2 : 4;
  const endpoint = device.type === "dimmer" ? "Light.SetConfig" : "Switch.SetConfig";
  for (let i = 0; i < outputCount; i++) {
    await axios.post(`${base}/rpc/${endpoint}`, {
      id: i,
      config: {
        auto_on: false,
        auto_off: false,
        initial_state: "restore_last",
        in_mode: "detached"
      }
    });
  }

  const { data: existing } = await axios.get(`${base}/rpc/Script.List`);
  await Promise.all(existing.scripts.map((s: any) =>
    axios.post(`${base}/rpc/Script.Delete`, { id: s.id })
  ));

  const relevantActions = actions.filter((a: ActionSet) => a.device === device.name);
  const deviceMap: Record<string, { ip: string; type: string }> = {};
  for (const d of devices as ShellyDevice[]) {
    deviceMap[d.name] = { ip: d.ip, type: d.type };
  }

  for (const inputAction of relevantActions) {
    const code = generateScript(inputAction, device.name, deviceMap);
    const { data: created } = await axios.post(`${base}/rpc/Script.Create`, {
      name: `input_${inputAction.input}`
    });

    await axios.post(`${base}/rpc/Script.PutCode`, {
      id: created.id,
      code
    });

    await axios.post(`${base}/rpc/Script.Start`, {
      id: created.id
    });
    console.log(code);

    console.log(`✅ Script for input ${inputAction.input} uploaded.`);
  }

  console.log(`✅ ${device.name} fully configured.`);
}

(async () => {
  const deviceList: ShellyDevice[] = devices;
  const deviceMap: Record<string, ShellyDevice> = {};
  for (const d of deviceList) {
    deviceMap[d.name] = d;
  }

  for (const device of deviceList) {
    if (device.name === "D1") {
      await configureDevice(device, deviceMap);
    }
  }
})();
