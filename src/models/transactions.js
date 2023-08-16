import mongoose from '../../services/db/mongoose.js';
import { Schema } from 'mongoose';

export const accountSchema = new Schema({
	hash: {
		type: String,
		required: true,
		unique: true,
	},
	account: { type: String, ref: 'Account', required: true },
});

const Transaction = mongoose.model(
	'Transaction',
	accountSchema,
	'transactions'
);

export default Transaction;
