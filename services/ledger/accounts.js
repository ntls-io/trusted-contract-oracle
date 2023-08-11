import xrpl from 'xrpl';
import Account from '../../src/models/accounts.js';

/**
 * Gets transactions from escrow account
 */
export async function getAccountTransactions(res) {
	const account = await Account.findOne({ address: process.env.ESCROW_ACCOUNT });

	const client = new xrpl.Client(
		process.env.RIPPLE_SERVER || 'wss://s1.ripple.com:51234'
	);

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
			requestParams.marker = account.marker;
		}

		const response = await client.request(requestParams);
		client.disconnect();

		const result = response.result;

		if (result.marker) {
			account.marker = result.marker;
			await account.save();
		}

		res.status(200).json({ success: true, data: response.result });
	} catch (err) {
		res.status(200).json({ success: false });
	}
}
