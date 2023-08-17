import xrpl from 'xrpl';
import Account from '../models/accounts.js';
import Transaction, { transactionTypes } from '../models/transactions.js';
import axios from 'axios';
import { createUnsignedTransaction } from '../../services/payments/escrow_functions.js';
import { signTransactionAndSubmit } from '../../services/payments/escrow_functions.js';

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

		settleEscrowTransactions();

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

		// console.log(transaction);

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
				console.log(err);
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
async function settleEscrowTransactions() {
	// get the token seller and the corresponding settlement transactions from the buyer
	const transactions = await Transaction.aggregate([
		{
			$match: {
				$and: [
					{ sender: { $ne: null } },
					{ currency: { $ne: 'XRP' } },
					{ settled: false },
				],
			},
		},
		{
			$lookup: {
				from: 'transactions',
				localField: 'recepient',
				foreignField: 'sender',
				as: 'settlement',
			},
		},
	]);

	for (let i = 0; i < transactions.length; i++) {
		let enclaveTransactionData = createEnclaveTransactionData(transactions[i]);
		console.log('** enclave txns');
		console.log(enclaveTransactionData);
		let passed = await checkEnclaveTransactions(enclaveTransactionData);
		if (true) {
			// let settled = await processLedgerTransactions(transactions[i]);
		}
	}
}

/**
 * Creates the format enclave expects
 * @param {*} sellerTxn
 * @returns
 */
function createEnclaveTransactionData(sellerTxn) {
	let buyerTxn = sellerTxn.settlement[0];

	let sender = 'Sammy2'; //(Math.floor(Math.random() * 1000000) + 1).toString();
	let receiver = 'Jane2'; //(Math.floor(Math.random() * 1000000) + 1).toString();

	let sellerTransaction = {
		transaction: {
			transaction_id: sellerTxn.hash,
			// transaction_id: 'AB1234',
			sender: sellerTxn.sender,
			// sender: sender,
			recipient: sellerTxn.recepient,
			// recipient: receiver,
			token_amount: sellerTxn.amount,
		},
		agreed_token_amount: sellerTxn.amount,
		agreed_trade_price: sellerTxn.price,
	};

	let buyerTransaction = {
		transaction: {
			transaction_id: buyerTxn.hash,
			// transaction_id: 'AB1235',
			sender: buyerTxn.sender,
			// sender: receiver,
			recipient: buyerTxn.recepient,
			// recipient: sender,
			payment_amount: Number(xrpl.dropsToXrp(buyerTxn.amount)), // convert to XRP
		},
		agreed_token_amount: sellerTxn.amount,
		agreed_trade_price: sellerTxn.price,
	};

	return { sellerTxnData: sellerTransaction, buyerTxnData: buyerTransaction };
}

async function checkEnclaveTransactions(enclaveTransactionData) {
	let assetCheckResult;
	let paymentCheckResult;
	try {
		assetCheckResult = await axios.post(
			'https://trusted-contract-execution-enclave.ntls.io/check-asset-transaction',
			enclaveTransactionData.sellerTxnData
		);
	} catch (error) {
		console.log('error sending seller transaction');
		console.log(error);
		return false;
	}

	console.log('** asset check');
	console.log(assetCheckResult.data);

	try {
		paymentCheckResult = await axios.post(
			'https://trusted-contract-execution-enclave.ntls.io/check-payment-transaction',
			enclaveTransactionData.buyerTxnData
		);
	} catch (error) {
		console.log('error sending buyer transaction');
		console.log(error);
		return false;
	}

	console.log('** payment check');
	console.log(paymentCheckResult.data);
	return true;
}

async function processLedgerTransactions(sellerTxnData) {
	let buyerTxnData = sellerTxnData.settlement[0];

	let sellerUnsignedTransaction = await createUnsignedTransaction(
		sellerTxnData.recepient,
		sellerTxnData.currency,
		sellerTxnData.amount
	);

	let buyerUnsignedTransaction = await createUnsignedTransaction(
		buyerTxnData.recepient,
		buyerTxnData.currency,
		xrpl.dropsToXrp(buyerTxnData.amount)
	);

	let settleSellerTxnResult = await signTransactionAndSubmit(
		sellerUnsignedTransaction
	);

	let settleBuyerTxnResult = await signTransactionAndSubmit(
		buyerUnsignedTransaction
	);

	console.log('** settled seller result');
	console.log(settleSellerTxnResult);

	console.log('** settled buyer result');
	console.log(settleBuyerTxnResult);
}
