import path from "path";
import dotenv from "dotenv";
import readline from "readline";
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

    // Generate a single script for all inputs on this device
    const code = ScriptGenerator.generate(relevantActions, device.name, deviceMap);
    await configurer.uploadScript('input_handler', code);
    //console.log(code);
    console.log(`✅ Input handler script uploaded`);

    console.log(`✅ ${device.name} fully configured`);
  } catch (error) {
    console.error(`❌ Error configuring ${device.name}:`, error);
    throw error;
  }
}

async function promptForDevice(): Promise<string[]> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter device names to configure (D1, D2, P1) or "all" [D1] (comma-separated for multiple): ', (answer) => {
      rl.close();
      const input = answer.trim() || 'D1';  // Default to D1 if empty
      
      if (input.toUpperCase() === 'ALL') {
        resolve(['ALL']);
      } else {
        // Split by comma and clean up each device name
        const deviceNames = input.split(',')
          .map(name => name.trim().toUpperCase())
          .filter(name => name); // Remove empty entries
        resolve(deviceNames);
      }
    });
  });
}

(async () => {
  try {
    const deviceMap: Record<string, ShellyDevice> = Object.fromEntries(
      devices.map(d => [d.name, d])
    );

    const targetDevices = await promptForDevice();
    
    if (targetDevices[0] === 'ALL') {
      for (const device of devices) {
        await configureDevice(device, deviceMap);
      }
    } else {
      // Validate all device names first
      const invalidDevices = targetDevices.filter(name => !devices.find(d => d.name === name));
      if (invalidDevices.length > 0) {
        throw new Error(`Invalid device names: ${invalidDevices.join(', ')}`);
      }

      // Configure each specified device
      for (const deviceName of targetDevices) {
        const device = devices.find(d => d.name === deviceName)!;
        await configureDevice(device, deviceMap);
      }
    }
    
    console.log('\n✅ Deployment completed successfully');
  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  }
})();
