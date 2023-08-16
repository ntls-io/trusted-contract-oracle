import xrpl from 'xrpl';
import Account from '../models/accounts.js';
import Transaction, { transactionTypes } from '../models/transactions.js';

/**
 * Sends a message to the enclave to create an account
 * @param {*} res
 */
export async function createEscrowAccount(res) {
	res.status(200).json({ success: true });
}

export async function getEscrowAccounts(res) {
	res.status(200).json({ success: true });
}

export async function getTransactions(res, parameters) {
	const account = parameters.account;
	const transactions = await Transaction.find({ account: account });
	res.status(200).json({ success: true, result: transactions });
}

/**
 * Gets transactions from escrow account
 */
export async function checkEscrowAccounts(res) {
	const account = await Account.findOne({
		address: process.env.ESCROW_ACCOUNT,
	});

	const client = new xrpl.Client(process.env.RIPPLE_SERVER);

	try {
		await client.connect();

		let requestParams = {
			command: 'account_tx',
			account: process.env.ESCROW_ACCOUNT,
			ledger_index_min: -1,
			ledger_index_max: -1,
			binary: false,
			// limit: 2,
			ledger_index: 'validated',
		};

		// Put in the marker in case we receive paginated results
		if (account.marker) {
			// requestParams.marker = account.marker;
		}

		const response = await client.request(requestParams);
		client.disconnect();

		const result = response.result;

		if (result.marker) {
			account.marker = result.marker;
			await account.save();
		}

		processTransactions(account, result);

		sendTransactionsToEnclave();

		res.status(200).json({ success: true, data: response.result });
	} catch (err) {
		res.status(200).json({ success: false, error: err.message });
	}
}

/** Parses and saves the XRPL transactions to the DB  */
async function processTransactions(account, result) {
	const dbTransactions = [];

	for (let i = 0; i < result.transactions.length; i++) {
		let transaction = result.transactions[i];

		if (transaction.tx.TransactionType !== transactionTypes.payment) {
			continue;
		}

		console.log(transaction);

		let dbTransaction = {
			hash: transaction.tx.hash,
			account: account.address,
			sender: transaction.tx.Account,
			type: transactionTypes.payment,
			currency:
				typeof transaction.tx.Amount === 'string'
					? 'XRP'
					: transaction.tx.Amount.currency,
			amount:
				typeof transaction.tx.Amount === 'string'
					? transaction.tx.Amount
					: transaction.tx.Amount.value,
		};

		const memoDetails = getMemoDetails(transaction);

		if (memoDetails) {
			dbTransaction.recepient = memoDetails.recepient;
			dbTransaction.price = memoDetails.price;
		}

		dbTransactions.push(dbTransaction);
	}

	await saveTransactions(dbTransactions);
}

async function saveTransactions(dbTransactions) {
	try {
		await Transaction.insertMany(dbTransactions, {
			ordered: false,
		});
	} catch (err) {
		switch (err.code) {
			case 11000:
				console.log('Duplicate key error during bulk insert ');
				break;
			default:
				throw 'Unknown error during bulk insert';
		}
	}
}

/**
 * Returns:
 * asset: Asset to be sent
 * recepient: Intended recepient - if deal conditions/price are met
 * price: Price of deal
 *
 * @param {*} transaction
 */
function getMemoDetails(transaction) {
	if (!transaction.tx.Memos) {
		return null;
	}

	let memos = transaction.tx.Memos;
	let memo = xrpl.convertHexToString(memos[0].Memo.MemoData);

	let memoDetails = memo.split(' ');
	return {
		asset: memoDetails[0],
		recepient: memoDetails[1],
		price: memoDetails[2],
	};
}

/** Finds matching pairs of sender, recepient, price (condition for exchange)
 * and send to the Enclave */
async function sendTransactionsToEnclave() {
	const transactions = await Transaction.find({
		$and: [{ sender: { $ne: null } }, { recepient: { $ne: null } }],
	});

	console.log('** enclave transactions');
	console.log(transactions);
}
