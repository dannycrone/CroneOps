import * as XLSX from 'xlsx';
import { ActionSet, Action, BrightnessType } from '../models/actions';
import path from 'path';


function validateBrightness(value: any): BrightnessType {
  if (typeof value === 'number' || ["adaptive", "on", "off", "nightonlylow", 'lowLight', 'midLight', 'highLight', 'maxLight'].includes(value)) {
    return value as BrightnessType;
  }
  throw new Error(`Invalid brightness value: ${value}. Must be "adaptive", "on", "off", "nightonlylow", 'lowLight', 'midLight', 'highLight', 'maxLight'or a number.`);
}

export class ExcelParser {
  /**
   * Reads and parses the Actions worksheet from ElectricalSpec.xlsx.
   * The Excel file must contain either an 'Actions' sheet or at least one valid sheet with the required columns:
   * - 'trigger_device': The device that triggers the action
   * - 'input': The input number that triggers the action
   * - 'Trigger': The type of trigger event
   * - 'set1_device': The target device to control
   * - 'set1_output': The output number to control
   * - 'set1_brightness': The brightness value ("adaptive", "on", "off", or a number)
   *
   * @throws {Error} If the file is missing, malformed, or contains invalid data
   * @returns {ActionSet[]} Array of parsed action sets
   */
  static readActionsWorksheet(): ActionSet[] {
    const filePath = path.resolve(__dirname, '../config/ElectricalSpec.xlsx');
    
    // Validate file existence
    try {
      const workbook = XLSX.readFile(filePath);
      let worksheet = workbook.Sheets['Actions']; // Try Actions sheet first
      
      if (!worksheet) {
        // If Actions sheet not found, try the first sheet
        const firstSheet = workbook.SheetNames[0];
        worksheet = workbook.Sheets[firstSheet];
        if (!worksheet) {
          throw new Error('No valid worksheet found in ElectricalSpec.xlsx');
        }
        console.warn(`'Actions' sheet not found, using '${firstSheet}' sheet instead`);
      }

      const data = XLSX.utils.sheet_to_json(worksheet);
      
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Excel file contains no valid data rows');
      }
    const actions: ActionSet[] = [];
    
    // Group rows by device and input
    const groupedData = data.reduce((acc: Record<string, any[]>, row: any) => {
      const key = `${row['trigger_device']}_${row['input']}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {});

    // Transform grouped data into ActionSet format
    for (const [key, rows] of Object.entries(groupedData)) {
      const [device, input] = key.split('_');
      
      const actionSet: ActionSet = {
        device,
        input: parseInt(input),
        actions: []
      };

      // Group rows by trigger type
      const triggerGroups = rows.reduce((acc: Record<string, any[]>, row: any) => {
        const trigger = row.trigger_event;
        if (!trigger || typeof trigger !== 'string') {
          throw new Error(`Invalid or missing Trigger value in row: ${JSON.stringify(row)}`);
        }
        if (!acc[trigger]) acc[trigger] = [];
        acc[trigger].push(row);
        return acc;
      }, {});

      // Create actions for each trigger type
      for (const [trigger, triggerRows] of Object.entries(triggerGroups)) {
        const set: Action[] = triggerRows.map(row => {
          const targetDevice = row['set1_device'];
          const output = row['set1_output'];
          const brightness = row['set1_brightness'];

          // Validate required fields
          if (!targetDevice || typeof targetDevice !== 'string') {
            throw new Error(`Invalid or missing target device in row: ${JSON.stringify(row)}`);
          }
          if (output === undefined || output === null) {
            throw new Error(`Missing output value in row: ${JSON.stringify(row)}`);
          }
          if (brightness === undefined || brightness === null) {
            throw new Error(`Missing brightness value in row: ${JSON.stringify(row)}`);
          }
          
          const outputNum = parseInt(output.toString());
          if (isNaN(outputNum)) {
            throw new Error(`Invalid output value: ${output}`);
          }

          return {
            device: targetDevice,
            output: outputNum,
            brightness: validateBrightness(brightness)
          };
        });

        actionSet.actions.push({ trigger, set });
      }

      actions.push(actionSet);
    }

    return actions;
    } catch (error) {
      if (error instanceof Error) {
        // Enhance error message with file path context
        throw new Error(`Error parsing Excel file '${filePath}': ${error.message}`);
      }
      throw error;
    }
  }
}