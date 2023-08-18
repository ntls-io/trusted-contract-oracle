import xrpl from 'xrpl';
import Transaction, { transactionTypes } from '../models/transactions.js';
import axios from 'axios';
import { createUnsignedTransaction } from '../../services/payments/escrow_functions.js';
import { signTransactionAndSubmit } from '../../services/payments/escrow_functions.js';

export async function record(res, parameters) {
	res.status(200).json({ success: true });
}

export async function getTransaction(res, parameters) {
	const hash = parameters.hash;
	const transaction = await Transaction.findOne({ hash: hash });
	res.status(200).json({ success: true, result: transaction });
}

/** Parses and saves the XRPL transactions to the DB  */
export async function processTransactions(account, result) {
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
export async function settleEscrowTransactions() {
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
		// continue if there is a corresponding settlement
		if (!transactions[i].settlement[0]) {
			continue;
		}

		let enclaveTransactionData = createEnclaveTransactionData(transactions[i]);

		// console.log('** enclave txns');
		// console.log(enclaveTransactionData);

		let result = await checkEnclaveTransactions(enclaveTransactionData);
		if (!result.success) {
			continue;
		}

		let success = await submitLedgerTransactions(result);

		if (!success) {
			continue;
		}

		await updateDBTransactions(enclaveTransactionData);
	}
}

/**
 * Creates the format enclave expects
 * @param {*} sellerTxn
 * @returns
 */
function createEnclaveTransactionData(sellerTxn) {
	let buyerTxn = sellerTxn.settlement[0];

	let sellerTransaction = {
		transaction: {
			transaction_id: sellerTxn.hash,
			sender: sellerTxn.sender,
			recipient: sellerTxn.recepient,
			token_amount: sellerTxn.amount,
		},
		agreed_token_amount: sellerTxn.amount,
		agreed_trade_price: sellerTxn.price,
	};

	let buyerTransaction = {
		transaction: {
			transaction_id: buyerTxn.hash,
			sender: buyerTxn.sender,
			recipient: buyerTxn.recepient,
			payment_amount: Number(xrpl.dropsToXrp(buyerTxn.amount)), // convert to XRP
		},
		agreed_token_amount: sellerTxn.amount,
		agreed_trade_price: sellerTxn.price,
	};

	return { sellerTxnData: sellerTransaction, buyerTxnData: buyerTransaction };
}

/**
 * Sends txns to enclave to check if settlement conditions have been met
 * @param {*} enclaveTransactionData
 * @returns {dict} success: true/false; if suceess true - paymentTxnData, transferTxnData: unsigned txns to be sent to XRPL
 */
async function checkEnclaveTransactions(enclaveTransactionData) {
	let assetCheckResult;
	let paymentCheckResult;
	try {
		assetCheckResult = await axios.post(
			'https://trusted-contract-execution-enclave.ntls.io/check-asset-transaction',
			enclaveTransactionData.sellerTxnData
		);
	} catch (error) {
		console.log(error);
		return { success: false };
	}

	console.log('** asset check');
	console.log(assetCheckResult.data);

	try {
		paymentCheckResult = await axios.post(
			'https://trusted-contract-execution-enclave.ntls.io/check-payment-transaction',
			enclaveTransactionData.buyerTxnData
		);
	} catch (error) {
		console.log(error);
		return { success: false };
	}

	console.log('** payment check');
	console.log(paymentCheckResult.data);

	if (
		'message' in paymentCheckResult.data &&
		paymentCheckResult.data.message === 'SuccessMatch'
	) {
		let paymentTxnData = paymentCheckResult.data.transaction_1;
		let transferTxnData = paymentCheckResult.data.transaction_2;

		return {
			success: true,
			paymentTxnData: paymentTxnData,
			transferTxnData: transferTxnData,
		};
	}
	return { success: false };
}

async function submitLedgerTransactions(enclaveResult) {
	let paymentTxnData = enclaveResult.paymentTxnData;
	let transferTxnData = enclaveResult.transferTxnData;

	let paymentUnsignedTxn = await createUnsignedTransaction(
		paymentTxnData.recipient,
		paymentTxnData.token_id.toUpperCase(),
		Number(paymentTxnData.amount)
	);

	console.log('** unsigned txns result');
	console.log(enclaveResult);

	let settleSellerTxnResult = await signTransactionAndSubmit(
		paymentUnsignedTxn
	);

	console.log('** settled seller result');
	console.log(settleSellerTxnResult);

	let transferUnsignedTxn = await createUnsignedTransaction(
		transferTxnData.recipient,
		transferTxnData.token_id.toUpperCase(),
		Number(transferTxnData.amount)
	);

	let settleBuyerTxnResult = await signTransactionAndSubmit(
		transferUnsignedTxn
	);

	console.log('** settled buyer result');
	console.log(settleBuyerTxnResult);

	return settleSellerTxnResult && settleBuyerTxnResult;
}

async function updateDBTransactions(enclaveData) {
	let sellerTxnData = enclaveData.sellerTxnData.transaction;
	let buyerTxnData = enclaveData.buyerTxnData.transaction;

	await Transaction.findOneAndUpdate(
		{ hash: sellerTxnData.transaction_id },
		{ settled: true }
	);

	await Transaction.findOneAndUpdate(
		{ hash: buyerTxnData.transaction_id },
		{ settled: true }
	);
}
