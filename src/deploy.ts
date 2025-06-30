import path from "path";
import dotenv from "dotenv";
import { DeviceConfigurer } from "./utils/deviceConfig";
import { ScriptGenerator } from "./utils/scriptGenerator";
import devicesData from "../devices.json";
import actionsData from "../actions.json";
import { ActionSet } from "./models/actions";
import { ShellyDevice } from "./models/shelly";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const requiredEnvVars = ['GATEWAY', 'DNS', 'NETMASK', 'LAT', 'LON', 'PASSWORD'] as const;
const missingVars = requiredEnvVars.filter(v => !process.env[v]);

if (missingVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
}

const devices = devicesData as ShellyDevice[];
const actions = actionsData as ActionSet[];

async function configureDevice(device: ShellyDevice, allDeviceMap: Record<string, ShellyDevice>) {
  console.log(`\n⚙️ Configuring ${device.name} (${device.ip})...`);
  
  try {
    const configurer = new DeviceConfigurer(device, process.env.PASSWORD!);
    
    await configurer.configureBasicSettings(
      parseFloat(process.env.LAT!),
      parseFloat(process.env.LON!)
    );
    console.log(`✅ Basic settings configured`);

    await configurer.configureWiFi();
    console.log(`✅ WiFi configured`);

    await configurer.configureInputs();
    console.log(`✅ Inputs configured`);

    await configurer.configureOutputs();
    console.log(`✅ Outputs configured`);

    await configurer.clearExistingScripts();
    console.log(`✅ Existing scripts cleared`);

    const relevantActions = actions.filter(a => a.device === device.name);
    const deviceMap: Record<string, { ip: string; type: string }> = {};
    for (const d of devices) {
      deviceMap[d.name] = { ip: d.ip, type: d.type };
    }

    for (const inputAction of relevantActions) {
      const code = ScriptGenerator.generate(inputAction, device.name, deviceMap);
      await configurer.uploadScript(`input_${inputAction.input}`, code);
      console.log(`✅ Script for input ${inputAction.input} uploaded`);
    }

    console.log(`✅ ${device.name} fully configured`);
  } catch (error) {
    console.error(`❌ Error configuring ${device.name}:`, error);
    throw error;
  }
}

(async () => {
  try {
    const deviceMap: Record<string, ShellyDevice> = Object.fromEntries(
      devices.map(d => [d.name, d])
    );

    for (const device of devices) {
      if (device.name === "D1" || device.name === "D2") {
        await configureDevice(device, deviceMap);
      }
    }
    
    console.log('\n✅ Deployment completed successfully');
  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  }
})();
