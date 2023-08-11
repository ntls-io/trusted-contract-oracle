import mongoose from 'mongoose';
import config from '../../config.js';

const MONGO_URL = config.MONGO_URL;

const options = {
	dbName: process.env.MONGO_DB,
	user: process.env.MONGO_USER,
	pass: process.env.MONGO_PASSWORD,
};

await mongoose.connect(MONGO_URL, options);

export default mongoose;
