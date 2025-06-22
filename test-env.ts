// test-env.ts
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

console.log("GATEWAY:", process.env.GATEWAY);
