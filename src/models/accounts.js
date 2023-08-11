import mongoose from '../../services/db/mongoose.js';
import { Schema } from 'mongoose';

export const accountSchema = new Schema({
	address: {
		type: String,
		required: true,
		unique: true,
	},
	marker: Object,
});

accountSchema.post(['findOne'], async function (account) {
	const filter = this.getFilter();

	if (!account) {
		account = new Account(filter);
		await account.save();
	}

	return mongoose.overwriteMiddlewareResult(account);
});

const Account = mongoose.model('Account', accountSchema, 'accounts');

export default Account;
