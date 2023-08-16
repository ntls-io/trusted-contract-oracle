import Transaction from '../models/transactions.js';

export async function record(res, parameters) {
	res.status(200).json({ success: true });
}

export async function getTransaction(res, parameters) {
	const hash = parameters.hash;
	const transaction = await Transaction.findOne({ hash: hash });
	res.status(200).json({ success: true, result: transaction });
}
