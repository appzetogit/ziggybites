import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import EnvironmentVariable from '../modules/admin/models/EnvironmentVariable.js';

async function reset() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');
  
  await EnvironmentVariable.deleteMany({});
  console.log('Deleted all old environment variables');
  
  const envVars = await EnvironmentVariable.getOrCreate();
  console.log('Created new EnvironmentVariable document');
  
  envVars.RAZORPAY_API_KEY = process.env.RAZORPAY_KEY_ID;
  envVars.RAZORPAY_SECRET_KEY = process.env.RAZORPAY_SECRET_KEY;
  // Let the pre-save hook handle encryption
  
  await envVars.save();
  console.log('✅ Updated credentials from .env');
  
  process.exit(0);
}

reset().catch(err => {
  console.error(err);
  process.exit(1);
});
