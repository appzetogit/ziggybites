import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import EnvironmentVariable from '../modules/admin/models/EnvironmentVariable.js';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');
  
  const envVars = await EnvironmentVariable.findOne();
  if (!envVars) {
    console.log('No EnvironmentVariable document found');
    process.exit(0);
  }
  
  console.log('DB RAZORPAY_SECRET_KEY (Encrypted/Raw):', envVars.RAZORPAY_SECRET_KEY);
  
  const envData = envVars.toEnvObject();
  console.log('DB RAZORPAY_SECRET_KEY (Decrypted):', envData.RAZORPAY_SECRET_KEY);
  console.log('.env RAZORPAY_SECRET_KEY:', process.env.RAZORPAY_SECRET_KEY);
  
  if (envData.RAZORPAY_SECRET_KEY !== process.env.RAZORPAY_SECRET_KEY) {
    console.log('❌ MISMATCH DETECTED!');
  } else {
    console.log('✅ Values match');
  }
  
  process.exit(0);
}

check().catch(err => {
  console.error(err);
  process.exit(1);
});
