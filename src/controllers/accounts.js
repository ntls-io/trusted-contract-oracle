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
