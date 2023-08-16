import express from 'express';
import {
	createEscrowAccount,
	checkEscrowAccounts,
	getTransactions,
} from '../../src/controllers/accounts.js';

export const router = express.Router();

router.post('/', (req, res) => {
	createEscrowAccount(res);
});

router.get('/check', (req, res) => {
	checkEscrowAccounts(res);
});

router.get('/transactions/:account', (req, res) => {
	getTransactions(res, req.params);
});
