import mongoose from '../../services/db/mongoose.js';
import { Schema } from 'mongoose';

export const transactionTypes = {
	payment: 'Payment',
};

export const transactionSchema = new Schema({
	hash: {
		type: String,
		required: true,
		unique: true,
	},
	type: {
		type: String,
		required: true,
	},
	settled: {
		type: Boolean,
		default: false,
	},
	account: { type: String, ref: 'Account' },
	sender: String,
	recepient: String,
	amount: Number, // saved as XRP not drops
	currency: String,
	price: Number,
});

const Transaction = mongoose.model(
	'Transaction',
	transactionSchema,
	'transactions'
);

export default Transaction;
