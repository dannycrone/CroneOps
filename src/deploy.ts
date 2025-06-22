import axios from "axios";
import fs from "fs";
import devices from "../devices.json";
import dotenv from "dotenv";
import path from "path";
import { mkdirSync, writeFileSync, existsSync } from "fs";
dotenv.config();

const GATEWAY = process.env.GATEWAY;
const DNS = process.env.DNS;
const NETMASK = process.env.NETMASK;
const LAT = process.env.LAT;
const LON = process.env.LON;

if (!GATEWAY || !DNS || !NETMASK || !LAT || !LON) {
  throw new Error("Missing required environment variables: GATEWAY, DNS, NETMASK, LAT, or LON");
}

interface ShellyScript {
  name: string;
  file: string;
}

interface ShellyDevice {
  name: string;
  ip: string;
  type: "relay" | "dimmer";
  scripts: ShellyScript[];
  // Ensure multiple scripts per device are bundled, e.g. SW1 and SW2 logic
}

async function configureOutput(device: ShellyDevice, base: string, deviceName: string) {
  for (let i = 0; i < 4; i++) {
    try {
      const endpoint = device.type === "dimmer" ? "Light.SetConfig" : "Switch.SetConfig";
      await axios.post(`${base}/rpc/${endpoint}`, {
        id: i,
        config: {
          auto_on: false,
          auto_off: false,
          initial_state: "off"
        }
      });
    } catch {
      console.warn(`⚠️  Output ${i} not available on ${deviceName}`);
    }
  }
}

async function deployDevice(device: ShellyDevice): Promise<void> {
  const base = `http://${device.ip}`;
  const deviceName = device.name || device.ip.replace(/\./g, "-");
  console.log(`\n⚙️  Configuring ${deviceName} (${device.ip})...`);

  // 1. Network and system setup
  await axios.post(`${base}/rpc/Config.Set`, {
    config: {
      wifi_sta1: { enable: false },
      wifi_sta2: { enable: false },
      wifi_ap: { enable: true },
      eth: {
        enable: true,
        ipv4_mode: "static",
        ip: device.ip,
        netmask: NETMASK,
        gw: GATEWAY,
        dns: DNS
      },
      sys: {
        name: deviceName,
        timezone: "Europe/London",
        location: { lat: parseFloat(LAT!), lon: parseFloat(LON!) }
      }
    }
  });

  // 2. Set all inputs to detached mode (in parallel if available)
  await Promise.all(
    Array.from({ length: 4 }).map(async (_, i) => {
      try {
        await axios.post(`${base}/rpc/Input.SetConfig`, {
          id: i,
          config: { type: "detached" }
        });
      } catch {
        console.warn(`⚠️  Input ${i} not available on ${deviceName}`);
      }
    })
  );

  // 3. Configure outputs
  await configureOutput(device, base, deviceName);

  // 4. Delete all existing scripts (in parallel)
  const { data: existing } = await axios.get(`${base}/rpc/Script.List`);
  await Promise.all(
    existing.scripts.map((script: any) =>
      axios.post(`${base}/rpc/Script.Delete`, { id: script.id })
    )
  );

  // 5. Upload and start all new scripts
  for (const scriptDef of device.scripts) {
    if (!fs.existsSync(scriptDef.file)) {
      console.warn(`⚠️  Script file not found: ${scriptDef.file}`);
      continue;
    }
    const code = fs.readFileSync(scriptDef.file, "utf8");
    const { data: newScript } = await axios.post(`${base}/rpc/Script.Create`, {
      name: scriptDef.name,
      code
    });
    await axios.post(`${base}/rpc/Script.Start`, { id: newScript.id });
    console.log(`✅ Script '${scriptDef.name}' deployed and started.`);
  }

  console.log(`✅ ${deviceName} fully configured.`);
}

async function tryDeployWithRetry(device: ShellyDevice, retries = 3, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await deployDevice(device);
      return;
    } catch (err: any) {
      console.error(`❌ Attempt ${attempt} failed for ${device.name || device.ip}:`, err.message);
      if (attempt < retries) {
        console.log(`🔁 Retrying in ${delayMs}ms...`);
        await new Promise(res => setTimeout(res, delayMs));
      } else {
        console.error(`❌ Giving up on ${device.name || device.ip} after ${retries} attempts.`);
      }
    }
  }
}

async function backupConfigs(devices: ShellyDevice[], outputDir: string) {
  if (!existsSync(outputDir)) mkdirSync(outputDir);

  for (const device of devices) {
    console.log(`📦 Backing up config for ${device.ip}...`);
    const url = `http://${device.ip}/rpc/Shelly.GetConfig`; 
    try {
      const { data } = await axios.get(url);
      const filename = path.join(outputDir, `${device.name || device.ip.replace(/\./g, "-")}_config.json`);
      writeFileSync(filename, JSON.stringify(data, null, 2));
      console.log(`📥 Backed up config for ${device.name} to ${filename}`);
    } catch (err: any) {
      console.error(`❌ Failed to back up ${device.name || device.ip}:`, err.message);
    }
  }
}

(async () => {
  await backupConfigs(devices as ShellyDevice[], "./backups");

  //for (const device of devices as ShellyDevice[]) {
  //  await tryDeployWithRetry(device);
  //}
})();
