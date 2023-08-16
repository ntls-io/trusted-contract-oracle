import mongoose from '../../services/db/mongoose.js';
import { Schema } from 'mongoose';

export const transactionTypes = {
	payment: 'Payment',
};

export const accountSchema = new Schema({
	hash: {
		type: String,
		required: true,
		unique: true,
	},
	type: {
		type: String,
		required: true,
	},
	account: { type: String, ref: 'Account' },
	sender: String,
	recepient: String,
	amount: String,
	currency: String,
	price: String,
});

const Transaction = mongoose.model(
	'Transaction',
	accountSchema,
	'transactions'
);

export default Transaction;
